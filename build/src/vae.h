// vae.h: Oobleck VAE decoder (audio VAE) via ggml
//
// Architecture: conv1(64->2048,k=7) -> 6xblock(snake+convT+3xresunit) -> snake+conv2(64->2,k=7)
// ResUnit(ch, dil): skip=x -> snake->conv(k=7,dil)->snake->conv(k=1)->+skip
// Snake: x + sin^2(e^a * x) * (1/e^b)
// ConvT: mul_mat(W_perm, transpose(x)) -> col2im_1d (replaces naive conv_transpose_1d)
// Weight norm fused at load: w = g*v/||v||
// Upsample: 6x5x4x4x2x2 = 1920x. Odd strides shorten the signal by one frame
// each, so the exact output length is T_audio = 1920 * T_latent - 64.

#pragma once
#include "backend.h"
#include "ggml-backend.h"
#include "ggml.h"
#include "gguf-weights.h"
#include "timer.h"

#include <cmath>
#include <cstdio>
#include <string>
#include <vector>

// Structs
struct VAEResUnit {
    struct ggml_tensor *s1a, *s1b;  // snake1 exp(alpha), exp(beta) [1, C]
    struct ggml_tensor *c1w, *c1b;  // conv1 fused [7, C, C], bias [C]
    struct ggml_tensor *s2a, *s2b;  // snake2
    struct ggml_tensor *c2w, *c2b;  // conv2 fused [1, C, C], bias [C]
    int                 dilation;
};

struct VAEBlock {
    struct ggml_tensor *sa, *sb;    // snake exp(a/b) [1, in_ch]
    struct ggml_tensor *ctw, *ctb;  // conv_transpose F16 [IC, K*OC] pre-permuted, bias [out_ch]
    int                 in_ch, out_ch, stride, kernel;
    VAEResUnit          ru[3];
};

struct VAEGGML {
    struct ggml_tensor * c1w, *c1b;  // conv1 [7, 64, 2048], bias [2048]
    VAEBlock             blk[6];
    struct ggml_tensor * sa, *sb;    // final snake [1, 64]
    struct ggml_tensor * c2w;        // conv2 [7, 64, 2] (no bias)

    ggml_backend_t        backend;
    ggml_backend_t        cpu_backend;
    ggml_backend_sched_t  sched;
    ggml_backend_buffer_t buf;
    struct ggml_context * weight_ctx;  // holds weight tensor metadata

    // Graph cache for tiled decode (avoids rebuild per tile)
    struct ggml_context * graph_ctx;
    uint8_t *             graph_buf;  // heap-allocated backing for graph_ctx
    struct ggml_cgraph *  graph;
    struct ggml_tensor *  graph_input;
    struct ggml_tensor *  graph_output;
    int                   graph_T;  // cached T_latent (0 = no cache)

    // Scratch buffer (reused across tiles, grown as needed)
    std::vector<float> scratch_in;  // transposed input [64 * T]
};

// Load helpers
// Fuse weight_norm: w = g*v/||v||, write f32 into pre-allocated ggml_tensor
// Works for Conv1d [OC,IC,K]: weight_norm normalizes over dim=0 (shape[0]).
static void vae_fuse_wn(struct ggml_tensor * dst, const GGUFModel & gf, const std::string & pfx) {
    struct ggml_tensor * mv     = ggml_get_tensor(gf.meta, (pfx + ".weight_v").c_str());
    const float *        g      = (const float *) gf_get_data(gf, (pfx + ".weight_g").c_str());
    const float *        v      = (const float *) gf_get_data(gf, (pfx + ".weight_v").c_str());
    // PyTorch dim0 is ggml ne[n_dims-1]
    int                  n_dims = ggml_n_dims(mv);
    int                  dim0   = (int) mv->ne[n_dims - 1];
    int                  fan    = (int) (ggml_nelements(mv) / dim0);
    std::vector<float>   w(dim0 * fan);
    for (int d = 0; d < dim0; d++) {
        float gv  = g[d];
        float nsq = 0;
        for (int i = 0; i < fan; i++) {
            float vv = v[d * fan + i];
            nsq += vv * vv;
        }
        float s = gv / (sqrtf(nsq) + 1e-12f);
        for (int i = 0; i < fan; i++) {
            float vv       = v[d * fan + i];
            w[d * fan + i] = vv * s;
        }
    }
    if (dst->type == GGML_TYPE_F16) {
        std::vector<ggml_fp16_t> w16(w.size());
        ggml_fp32_to_fp16_row(w.data(), w16.data(), (int) w.size());
        ggml_backend_tensor_set(dst, w16.data(), 0, w16.size() * sizeof(ggml_fp16_t));
    } else {
        ggml_backend_tensor_set(dst, w.data(), 0, w.size() * sizeof(float));
    }
}

// Fuse weight_norm for ConvTranspose1d AND transpose to [IC, K*OC] layout for mul_mat.
// GGUF weight_v is [K, OC, IC] (ggml ne[0]=K, ne[1]=OC, ne[2]=IC).
// weight_norm dim0=IC, fan=K*OC.  Fused output: w[ic*K_OC + k_oc].
// We need dst [IC, K*OC] in GGML (ne[0]=IC): element (ic, k_oc) = data[ic + k_oc*IC].
// So we transpose during fuse: data[k_oc * IC + ic] = fused[ic * K_OC + k_oc].
static void vae_fuse_wn_ct(struct ggml_tensor * dst, const GGUFModel & gf, const std::string & pfx) {
    struct ggml_tensor * mv     = ggml_get_tensor(gf.meta, (pfx + ".weight_v").c_str());
    const float *        g      = (const float *) gf_get_data(gf, (pfx + ".weight_g").c_str());
    const float *        v      = (const float *) gf_get_data(gf, (pfx + ".weight_v").c_str());
    int                  n_dims = ggml_n_dims(mv);
    int                  dim0   = (int) mv->ne[n_dims - 1];           // IC
    int                  fan    = (int) (ggml_nelements(mv) / dim0);  // K * OC
    std::vector<float>   w(dim0 * fan);
    for (int d = 0; d < dim0; d++) {                                  // d = ic
        float gv  = g[d];
        float nsq = 0;
        for (int i = 0; i < fan; i++) {
            float vv = v[d * fan + i];
            nsq += vv * vv;
        }
        float s = gv / (sqrtf(nsq) + 1e-12f);
        for (int i = 0; i < fan; i++) {  // i = k_oc
            float vv        = v[d * fan + i];
            w[i * dim0 + d] = vv * s;    // transposed: [k_oc * IC + ic]
        }
    }
    if (dst->type == GGML_TYPE_F16) {
        std::vector<ggml_fp16_t> w16(w.size());
        ggml_fp32_to_fp16_row(w.data(), w16.data(), (int) w.size());
        ggml_backend_tensor_set(dst, w16.data(), 0, w16.size() * sizeof(ggml_fp16_t));
    } else {
        ggml_backend_tensor_set(dst, w.data(), 0, w.size() * sizeof(float));
    }
}

// Load f32 snake param [C] -> exp -> f32 [1, C]
static void vae_load_snake(struct ggml_tensor * dst, const GGUFModel & gf, const std::string & name) {
    struct ggml_tensor * mt  = ggml_get_tensor(gf.meta, name.c_str());
    int                  C   = (int) mt->ne[0];  // PyTorch [C] -> ggml ne=[C]
    const float *        raw = (const float *) gf_get_data(gf, name.c_str());
    std::vector<float>   d(C);
    for (int i = 0; i < C; i++) {
        d[i] = expf(raw[i]);
    }
    ggml_backend_tensor_set(dst, d.data(), 0, C * sizeof(float));
}

// Load f32 snake param [C] -> 1/exp -> f32 [1, C] (reciprocal for mul fusion)
static void vae_load_snake_inv(struct ggml_tensor * dst, const GGUFModel & gf, const std::string & name) {
    struct ggml_tensor * mt  = ggml_get_tensor(gf.meta, name.c_str());
    int                  C   = (int) mt->ne[0];
    const float *        raw = (const float *) gf_get_data(gf, name.c_str());
    std::vector<float>   d(C);
    for (int i = 0; i < C; i++) {
        d[i] = 1.0f / expf(raw[i]);
    }
    ggml_backend_tensor_set(dst, d.data(), 0, C * sizeof(float));
}

// Load f32 bias [C]
static void vae_load_bias(struct ggml_tensor * dst, const GGUFModel & gf, const std::string & name) {
    struct ggml_tensor * mt  = ggml_get_tensor(gf.meta, name.c_str());
    int                  C   = (int) mt->ne[0];  // 1D: ne[0] = C
    const float *        raw = (const float *) gf_get_data(gf, name.c_str());
    std::vector<float>   d(C);
    for (int i = 0; i < C; i++) {
        d[i] = raw[i];
    }
    ggml_backend_tensor_set(dst, d.data(), 0, C * sizeof(float));
}

// Load model
static void vae_ggml_load(VAEGGML * m, const char * path) {
    GGUFModel gf = {};
    if (!gf_load(&gf, path)) {
        fprintf(stderr, "[VAE] FATAL: cannot load %s\n", path);
        exit(1);
    }

    static const int strides[]   = { 6, 5, 4, 4, 2, 2 };
    static const int in_ch[]     = { 2048, 1024, 512, 256, 128, 64 };
    static const int out_ch[]    = { 1024, 512, 256, 128, 64, 64 };
    static const int dilations[] = { 1, 3, 9 };

    // Phase 1: create tensor metadata (no_alloc context)
    size_t                  ctx_size = ggml_tensor_overhead() * 256;
    struct ggml_init_params p        = { ctx_size, NULL, true };
    m->weight_ctx                    = ggml_init(p);
    struct ggml_context * ctx        = m->weight_ctx;

    m->c1w = ggml_new_tensor_3d(ctx, GGML_TYPE_F16, 7, 64, 2048);
    m->c1b = ggml_new_tensor_1d(ctx, GGML_TYPE_F32, 2048);

    for (int i = 0; i < 6; i++) {
        VAEBlock & b = m->blk[i];
        b.in_ch      = in_ch[i];
        b.out_ch     = out_ch[i];
        b.stride     = strides[i];
        b.kernel     = strides[i] * 2;
        int C        = out_ch[i];
        b.sa         = ggml_new_tensor_2d(ctx, GGML_TYPE_F32, 1, in_ch[i]);
        b.sb         = ggml_new_tensor_2d(ctx, GGML_TYPE_F32, 1, in_ch[i]);
        b.ctw        = ggml_new_tensor_2d(ctx, GGML_TYPE_F16, in_ch[i], b.kernel * out_ch[i]);
        b.ctb        = ggml_new_tensor_1d(ctx, GGML_TYPE_F32, out_ch[i]);
        for (int r = 0; r < 3; r++) {
            VAEResUnit & ru = b.ru[r];
            ru.dilation     = dilations[r];
            ru.s1a          = ggml_new_tensor_2d(ctx, GGML_TYPE_F32, 1, C);
            ru.s1b          = ggml_new_tensor_2d(ctx, GGML_TYPE_F32, 1, C);
            ru.c1w          = ggml_new_tensor_3d(ctx, GGML_TYPE_F16, 7, C, C);
            ru.c1b          = ggml_new_tensor_1d(ctx, GGML_TYPE_F32, C);
            ru.s2a          = ggml_new_tensor_2d(ctx, GGML_TYPE_F32, 1, C);
            ru.s2b          = ggml_new_tensor_2d(ctx, GGML_TYPE_F32, 1, C);
            ru.c2w          = ggml_new_tensor_3d(ctx, GGML_TYPE_F16, 1, C, C);
            ru.c2b          = ggml_new_tensor_1d(ctx, GGML_TYPE_F32, C);
        }
    }
    m->sa  = ggml_new_tensor_2d(ctx, GGML_TYPE_F32, 1, 64);
    m->sb  = ggml_new_tensor_2d(ctx, GGML_TYPE_F32, 1, 64);
    m->c2w = ggml_new_tensor_3d(ctx, GGML_TYPE_F16, 7, 64, 2);

    // Phase 2: allocate backend buffer
    BackendPair bp = backend_init("VAE");
    m->backend     = bp.backend;
    m->cpu_backend = bp.cpu_backend;
    m->sched       = backend_sched_new(bp, 8192);
    m->buf         = ggml_backend_alloc_ctx_tensors(ctx, m->backend);
    if (!m->buf) {
        fprintf(stderr, "[VAE] FATAL: failed to allocate weight buffer\n");
        exit(1);
    }
    fprintf(stderr, "[VAE] Backend: %s, Weight buffer: %.1f MB\n", ggml_backend_name(m->backend),
            (float) ggml_backend_buffer_get_size(m->buf) / (1024 * 1024));

    // Phase 3: load & fuse weights
    vae_fuse_wn(m->c1w, gf, "decoder.conv1");
    vae_load_bias(m->c1b, gf, "decoder.conv1.bias");

    for (int i = 0; i < 6; i++) {
        VAEBlock &  b       = m->blk[i];
        std::string blk_pfx = "decoder.block." + std::to_string(i);
        vae_load_snake(b.sa, gf, blk_pfx + ".snake1.alpha");
        vae_load_snake_inv(b.sb, gf, blk_pfx + ".snake1.beta");
        vae_fuse_wn_ct(b.ctw, gf, blk_pfx + ".conv_t1");
        vae_load_bias(b.ctb, gf, blk_pfx + ".conv_t1.bias");
        for (int r = 0; r < 3; r++) {
            VAEResUnit & ru = b.ru[r];
            std::string  rp = blk_pfx + ".res_unit" + std::to_string(r + 1);
            vae_load_snake(ru.s1a, gf, rp + ".snake1.alpha");
            vae_load_snake_inv(ru.s1b, gf, rp + ".snake1.beta");
            vae_fuse_wn(ru.c1w, gf, rp + ".conv1");
            vae_load_bias(ru.c1b, gf, rp + ".conv1.bias");
            vae_load_snake(ru.s2a, gf, rp + ".snake2.alpha");
            vae_load_snake_inv(ru.s2b, gf, rp + ".snake2.beta");
            vae_fuse_wn(ru.c2w, gf, rp + ".conv2");
            vae_load_bias(ru.c2b, gf, rp + ".conv2.bias");
        }
    }
    vae_load_snake(m->sa, gf, "decoder.snake1.alpha");
    vae_load_snake_inv(m->sb, gf, "decoder.snake1.beta");
    vae_fuse_wn(m->c2w, gf, "decoder.conv2");

    fprintf(stderr, "[VAE] Loaded: 6 blocks, upsample=1920x, F32 activations\n");
    gf_close(&gf);
}

// Graph building
// Snake activation (5-op naive decomposition for backend pattern fusion)
// y = x + sin(a * x)^2 * inv_b
// x: [T, C], exp_a: [1, C], inv_b: [1, C] (pre-computed at load)
// Backends pattern-match (mul -> sin -> sqr -> mul -> add) and dispatch
// to their fused snake kernel under the hood.
static struct ggml_tensor * vae_snake(struct ggml_context * ctx,
                                      struct ggml_tensor *  x,
                                      struct ggml_tensor *  exp_a,
                                      struct ggml_tensor *  inv_b) {
    struct ggml_tensor * ax = ggml_mul(ctx, x, exp_a);
    struct ggml_tensor * s  = ggml_sin(ctx, ax);
    struct ggml_tensor * s2 = ggml_sqr(ctx, s);
    struct ggml_tensor * d  = ggml_mul(ctx, s2, inv_b);
    return ggml_add(ctx, x, d);
}

// Conv1d + bias: data [T, IC] -> [T_out, OC]
static struct ggml_tensor * vae_conv1d(struct ggml_context * ctx,
                                       struct ggml_tensor *  w,  // [K, IC, OC] (F16, pre-cast at load)
                                       struct ggml_tensor *  b,  // [OC] or NULL
                                       struct ggml_tensor *  x,  // [T, IC]
                                       int                   stride,
                                       int                   padding,
                                       int                   dilation) {
    struct ggml_tensor * y = ggml_conv_1d(ctx, w, x, stride, padding, dilation);
    // ggml_conv_1d returns [OL, OC, N=1], squeeze to 2d
    y                      = ggml_reshape_2d(ctx, y, y->ne[0], y->ne[1]);
    if (b) {
        // bias [OC] -> [1, OC] for broadcast over OL dimension
        struct ggml_tensor * b2d = ggml_reshape_2d(ctx, b, 1, b->ne[0]);
        y                        = ggml_add(ctx, y, b2d);
    }
    return y;
}

// ConvTranspose1d via GEMM + col2im (replaces naive ggml_conv_transpose_1d)
// w: [IC, K*OC] pre-permuted at load time for mul_mat
// x: [T_in, IC]
// Returns: [T_out_cropped, OC]
static struct ggml_tensor * vae_conv_t1d(struct ggml_context * ctx,
                                         struct ggml_tensor *  w,  // [IC, K*OC] pre-permuted
                                         struct ggml_tensor *  b,  // [OC] or NULL
                                         struct ggml_tensor *  x,  // [T_in, IC]
                                         int                   stride,
                                         int                   padding,
                                         int                   oc) {
    // Step 1: Transpose x from [T_in, IC] to [IC, T_in] (contiguous copy)
    struct ggml_tensor * xt = ggml_cont(ctx, ggml_transpose(ctx, x));

    // Step 2: GEMM: contracts over IC (ne[0] of both)
    // w: [IC, K*OC]  xt: [IC, T_in]  ->  col: [K*OC, T_in]
    struct ggml_tensor * col = ggml_mul_mat(ctx, w, xt);

    // Step 3: col2im_1d scatter-add (F32 path, no BF16 casts)
    struct ggml_tensor * y = ggml_col2im_1d(ctx, col, stride, oc, padding);

    // Step 4: Add bias
    if (b) {
        struct ggml_tensor * b2d = ggml_reshape_2d(ctx, b, 1, b->ne[0]);
        y                        = ggml_add(ctx, y, b2d);
    }
    return y;
}

// ResUnit forward
static struct ggml_tensor * vae_res_unit(struct ggml_context * ctx,
                                         VAEResUnit *          ru,
                                         struct ggml_tensor *  x) {  // [T, C]
    struct ggml_tensor * skip = x;

    // snake1 -> dilated conv(k=7) -> snake2 -> conv(k=1)
    int pad = 3 * ru->dilation;  // (k-1)*dil/2 = 3*dil
    x       = vae_snake(ctx, x, ru->s1a, ru->s1b);
    x       = vae_conv1d(ctx, ru->c1w, ru->c1b, x, 1, pad, ru->dilation);
    x       = vae_snake(ctx, x, ru->s2a, ru->s2b);
    x       = vae_conv1d(ctx, ru->c2w, ru->c2b, x, 1, 0, 1);

    return ggml_add(ctx, skip, x);
}

// Build full VAE decode graph
// latent: [T_latent, 64] -> audio: [T_audio, 2]
static struct ggml_tensor * vae_ggml_build_graph(struct ggml_context * ctx,
                                                 VAEGGML *             m,
                                                 struct ggml_tensor *  latent) {  // [T, 64] input

    // conv1: [T, 64] -> [T, 2048]
    struct ggml_tensor * x = vae_conv1d(ctx, m->c1w, m->c1b, latent, 1, 3, 1);

    // 6 decoder blocks
    for (int i = 0; i < 6; i++) {
        VAEBlock & b = m->blk[i];
        // snake -> conv_transpose (upsample), padding = ceil(stride / 2)
        x            = vae_snake(ctx, x, b.sa, b.sb);
        int pad      = (b.stride + 1) / 2;
        x            = vae_conv_t1d(ctx, b.ctw, b.ctb, x, b.stride, pad, b.out_ch);
        // 3 res units
        for (int r = 0; r < 3; r++) {
            x = vae_res_unit(ctx, &b.ru[r], x);
        }
    }

    // Final: snake -> conv2(64->2, k=7, pad=3)
    x = vae_snake(ctx, x, m->sa, m->sb);
    x = vae_conv1d(ctx, m->c2w, NULL, x, 1, 3, 1);

    return x;  // [T_audio, 2]
}

// Core compute: ensure graph cached, set input, run. Returns T_audio or -1.
// Output remains in m->graph_output for caller to read as needed.
static int vae_ggml_compute(VAEGGML *     m,
                            const float * latent,    // [T_full, 64] time-major
                            int           T_latent,  // window length to decode
                            int           win_start = 0) {     // offset into latent

    // Build graph only when T_latent changes (cached for tiled decode reuse)
    if (m->graph_T != T_latent) {
        if (m->graph_ctx) {
            ggml_backend_sched_reset(m->sched);
            ggml_free(m->graph_ctx);
            free(m->graph_buf);
        }

        // Graph context (generous fixed allocation)
        size_t ctx_size = ggml_tensor_overhead() * 1024 + ggml_graph_overhead_custom(8192, false);
        m->graph_buf    = (uint8_t *) malloc(ctx_size);
        if (!m->graph_buf) {
            fprintf(stderr, "[VAE] FATAL: OOM allocating graph context (%zu bytes) for T=%d\n", ctx_size, T_latent);
            m->graph_T = 0;
            return -1;
        }
        struct ggml_init_params p   = { ctx_size, m->graph_buf, true };
        struct ggml_context *   ctx = ggml_init(p);

        m->graph_input = ggml_new_tensor_2d(ctx, GGML_TYPE_F32, T_latent, 64);
        ggml_set_name(m->graph_input, "vae_input");
        ggml_set_input(m->graph_input);

        m->graph_output = vae_ggml_build_graph(ctx, m, m->graph_input);
        ggml_set_name(m->graph_output, "vae_output");
        ggml_set_output(m->graph_output);

        m->graph = ggml_new_graph_custom(ctx, 8192, false);
        ggml_build_forward_expand(m->graph, m->graph_output);

        if (!ggml_backend_sched_alloc_graph(m->sched, m->graph)) {
            fprintf(stderr, "[VAE] FATAL: graph alloc failed for T=%d\n", T_latent);
            ggml_free(ctx);
            free(m->graph_buf);
            m->graph_ctx = NULL;
            m->graph_buf = NULL;
            m->graph_T   = 0;
            return -1;
        }

        m->graph_ctx = ctx;
        m->graph_T   = T_latent;
        fprintf(stderr, "[VAE] Graph: %d nodes, T_latent=%d\n", ggml_graph_n_nodes(m->graph), T_latent);
    }

    // Extract window + transpose: [T, 64] time-major -> ggml [T, 64] channel-major
    size_t in_size = 64 * T_latent;
    if (m->scratch_in.size() < in_size) {
        m->scratch_in.resize(in_size);
    }
    for (int c = 0; c < 64; c++) {
        for (int t = 0; t < T_latent; t++) {
            m->scratch_in[c * T_latent + t] = latent[(win_start + t) * 64 + c];
        }
    }
    ggml_backend_tensor_set(m->graph_input, m->scratch_in.data(), 0, in_size * sizeof(float));

    ggml_backend_sched_graph_compute(m->sched, m->graph);

    return (int) m->graph_output->ne[0];
}

// Decode API: latent [T_latent, 64] -> audio [2, T_audio] flat.
// Returns T_audio (or -1 on error).
static int vae_ggml_decode(VAEGGML * m, const float * latent, int T_latent, float * audio_out, int max_T_audio) {
    int T_audio = T_latent * 1920 - 64;
    if (T_audio > max_T_audio) {
        fprintf(stderr, "[VAE] T_audio %d exceeds max %d\n", T_audio, max_T_audio);
        return -1;
    }

    Timer decode_timer;
    int   T_out = vae_ggml_compute(m, latent, T_latent, 0);
    if (T_out < 0) {
        return -1;
    }

    ggml_backend_tensor_get(m->graph_output, audio_out, 0, T_out * 2 * sizeof(float));

    fprintf(stderr, "[VAE] Decoded: T_latent=%d -> T_audio=%d (%.2fs @ 48kHz), %.0f ms\n", T_latent, T_out,
            (float) T_out / 48000.0f, decode_timer.ms());
    return T_out;
}

// Tiled decode: exact halo crop for bounded VRAM usage.
// Each tile decodes [start - halo, end + halo) and keeps only its core samples,
// so every output sample carries the full receptive field of the untiled
// decoder. There is no crossfade and no zero padding: the concatenated cores
// are the waveform. Returns T_audio (samples per channel) or -1 on error.
static int vae_ggml_decode_tiled(VAEGGML *     m,
                                 const float * latent,     // [T_latent, 64] flat time-major
                                 int           T_latent,
                                 float *       audio_out,  // [2, T_audio] flat (caller allocs)
                                 int           max_T_audio,
                                 int           core_frames = 1024,
                                 int           halo_frames = 16,
                                 bool (*cancel)(void *)    = nullptr,
                                 void * cancel_data        = nullptr) {
    int total = T_latent * 1920 - 64;
    if (total > max_T_audio) {
        fprintf(stderr, "[VAE] T_audio %d exceeds max %d\n", total, max_T_audio);
        return -1;
    }

    // Short sequence: decode directly
    if (T_latent <= core_frames) {
        return vae_ggml_decode(m, latent, T_latent, audio_out, max_T_audio);
    }

    int num_tiles = (T_latent + core_frames - 1) / core_frames;

    fprintf(stderr, "[VAE] Tiled decode: %d tiles (core=%d, halo=%d)\n", num_tiles, core_frames, halo_frames);
    Timer decode_timer;

    for (int i = 0; i < num_tiles; i++) {
        if (cancel && cancel(cancel_data)) {
            fprintf(stderr, "[VAE] Cancelled at tile %d/%d\n", i, num_tiles);
            return -1;
        }
        int start = i * core_frames;
        int end   = (start + core_frames > T_latent) ? T_latent : start + core_frames;
        int left  = (start - halo_frames < 0) ? 0 : start - halo_frames;
        int right = (end + halo_frames > T_latent) ? T_latent : end + halo_frames;

        int tile_T = vae_ggml_compute(m, latent, right - left, left);
        if (tile_T < 0) {
            fprintf(stderr, "[VAE] FATAL: tile %d decode failed\n", i);
            return -1;
        }

        // The left halo scales exactly by 1920, the missing 64 samples are a tail
        int out_start = start * 1920;
        int out_end   = (end * 1920 > total) ? total : end * 1920;
        int crop      = (start - left) * 1920;
        int core_len  = out_end - out_start;
        if (crop + core_len > tile_T) {
            fprintf(stderr, "[VAE] FATAL: tile %d does not cover its core\n", i);
            return -1;
        }

        // Layout: [ch0: tile_T floats, ch1: tile_T floats]
        ggml_backend_tensor_get(m->graph_output, audio_out + out_start, crop * sizeof(float), core_len * sizeof(float));
        ggml_backend_tensor_get(m->graph_output, audio_out + max_T_audio + out_start, (tile_T + crop) * sizeof(float),
                                core_len * sizeof(float));
    }

    // Compact ch1 from offset max_T_audio to offset total
    memmove(audio_out + total, audio_out + max_T_audio, total * sizeof(float));

    fprintf(stderr, "[VAE] Tiled decode done: %d tiles -> T_audio=%d (%.2fs @ 48kHz), %.0f ms\n", num_tiles, total,
            (float) total / 48000.0f, decode_timer.ms());

    return total;
}

// Free
static void vae_ggml_free(VAEGGML * m) {
    if (m->graph_ctx) {
        ggml_backend_sched_reset(m->sched);
        ggml_free(m->graph_ctx);
        free(m->graph_buf);
    }
    if (m->sched) {
        ggml_backend_sched_free(m->sched);
    }
    if (m->buf) {
        ggml_backend_buffer_free(m->buf);
    }
    if (m->weight_ctx) {
        ggml_free(m->weight_ctx);
    }
    backend_release(m->backend, m->cpu_backend);
    *m = {};
}
