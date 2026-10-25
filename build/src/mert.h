#pragma once
// mert.h: MERT-v2 music audio encoder
//
// Audio at 24 kHz mono goes through the log mel frontend (DSP on the host),
// three ConvNeXt subsampling blocks and the conformer layers on the backend,
// one 25 Hz frame per 960 samples. A model built on MERT loads it from the
// GGUF of its base model onto its own backend, merges its LoRA terms into
// the projections at load, and builds the encoder into its own graph: the
// subsampled frames and the state after every layer are there to read.

#include "adapter.h"
#include "audio-resample.h"
#include "gguf-weights.h"
#include "weight-ctx.h"
#include "yyjson.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>

#define MERT_SAMPLE_RATE   24000
#define MERT_MAX_LAYERS    24
#define MERT_MAX_SUB       3
#define MERT_MAX_SUB_DEPTH 5

struct MertConfig {
    int   n_fft, hop, win, n_mels;
    int   sub_channels[MERT_MAX_SUB];
    int   sub_depths[MERT_MAX_SUB];
    float sub_eps;
    int   hidden, inter, n_layers, n_heads, conv_kernel;
    float eps, rope_base;
    int   ratio;  // samples per encoder frame (960)
};

struct MertConvNext {
    struct ggml_tensor *dw_w, *dw_b;      // [7, 1, C] depthwise kernel and [C] bias
    struct ggml_tensor *ln_w, *ln_b;      // [C]
    struct ggml_tensor *up_w, *up_b;      // [C, 4C], [4C]
    struct ggml_tensor *grn_w, *grn_b;    // [4C]
    struct ggml_tensor *down_w, *down_b;  // [4C, C], [C]
};

struct MertSubBlock {
    struct ggml_tensor *rs_ln_w, *rs_ln_b;  // [C_in], absent on the first block
    struct ggml_tensor *rs_w, *rs_b;        // [2, C_in, C_out], [C_out]
    MertConvNext        layers[MERT_MAX_SUB_DEPTH];
};

struct MertLayer {
    struct ggml_tensor *ffn1_ln_w, *ffn1_ln_b, *ffn1_w1, *ffn1_b1, *ffn1_w2, *ffn1_b2;
    struct ggml_tensor *attn_ln_w, *attn_ln_b, *q_w, *q_b, *k_w, *k_b, *v_w, *v_b, *o_w, *o_b;
    struct ggml_tensor *conv_ln_w, *conv_ln_b, *conv_pw1, *conv_dw, *conv_dw_ln_w, *conv_dw_ln_b, *conv_pw2;
    struct ggml_tensor *ffn2_ln_w, *ffn2_ln_b, *ffn2_w1, *ffn2_b1, *ffn2_w2, *ffn2_b2;
    struct ggml_tensor *final_ln_w, *final_ln_b;
};

struct Mert {
    MertConfig cfg;

    // Mel frontend tables on the host: Hann window, mel filterbank
    // [n_fft / 2 + 1, n_mels] with the nonzero row span of every bin, per
    // bin mean and std
    std::vector<float> window, mel_fb, mel_mean, mel_std;
    std::vector<int>   mel_lo, mel_hi;

    MertSubBlock sub[MERT_MAX_SUB];
    MertLayer    layers[MERT_MAX_LAYERS];
    WeightCtx    wctx;
};

static double mert_json_num(yyjson_val * obj, const char * key) {
    yyjson_val * v = yyjson_obj_get(obj, key);
    if (!v || !yyjson_is_num(v)) {
        fprintf(stderr, "[MERT] FATAL: config key %s missing\n", key);
        exit(1);
    }
    return yyjson_get_num(v);
}

static int mert_json_list(yyjson_val * obj, const char * key, int i) {
    yyjson_val * v = yyjson_obj_get(obj, key);
    if (!v || !yyjson_is_arr(v) || (size_t) i >= yyjson_arr_size(v)) {
        fprintf(stderr, "[MERT] FATAL: config key %s missing\n", key);
        exit(1);
    }
    return (int) yyjson_get_num(yyjson_arr_get(v, (size_t) i));
}

static void mert_load_config(MertConfig * c, const char * json) {
    yyjson_doc * doc = yyjson_read(json, strlen(json), 0);
    if (!doc) {
        fprintf(stderr, "[MERT] FATAL: malformed config json\n");
        exit(1);
    }
    yyjson_val * root = yyjson_doc_get_root(doc);
    c->n_fft          = (int) mert_json_num(root, "n_fft");
    c->hop            = (int) mert_json_num(root, "hop_length");
    c->win            = (int) mert_json_num(root, "win_length");
    c->n_mels         = (int) mert_json_num(root, "num_mel_bins");
    for (int i = 0; i < MERT_MAX_SUB; i++) {
        c->sub_channels[i] = mert_json_list(root, "subsampling_channels", i);
        c->sub_depths[i]   = mert_json_list(root, "subsampling_depths", i);
    }
    c->sub_eps      = (float) mert_json_num(root, "subsampling_layer_norm_eps");
    c->hidden       = (int) mert_json_num(root, "hidden_size");
    c->inter        = (int) mert_json_num(root, "intermediate_size");
    c->n_layers     = (int) mert_json_num(root, "num_hidden_layers");
    c->n_heads      = (int) mert_json_num(root, "num_attention_heads");
    c->conv_kernel  = (int) mert_json_num(root, "conv_depthwise_kernel_size");
    c->eps          = (float) mert_json_num(root, "layer_norm_eps");
    c->rope_base    = (float) mert_json_num(root, "rotary_embedding_base");
    c->ratio        = (int) mert_json_num(root, "inputs_to_logits_ratio");
    int sample_rate = (int) mert_json_num(root, "sampling_rate");
    yyjson_doc_free(doc);
    if (c->n_layers > MERT_MAX_LAYERS || sample_rate != MERT_SAMPLE_RATE) {
        fprintf(stderr, "[MERT] FATAL: unsupported config\n");
        exit(1);
    }
}

static void mert_load_convnext(WeightCtx * w, const GGUFModel & gf, MertConvNext * l, const std::string & p) {
    l->dw_w   = gf_load_tensor(w, gf, p + ".depthwise_block.1.weight");
    l->dw_b   = gf_load_tensor(w, gf, p + ".depthwise_block.1.bias");
    l->ln_w   = gf_load_tensor(w, gf, p + ".pointwise_block.0.weight");
    l->ln_b   = gf_load_tensor(w, gf, p + ".pointwise_block.0.bias");
    l->up_w   = gf_load_tensor(w, gf, p + ".pointwise_block.1.weight");
    l->up_b   = gf_load_tensor(w, gf, p + ".pointwise_block.1.bias");
    l->grn_w  = gf_load_tensor(w, gf, p + ".pointwise_block.3.weight");
    l->grn_b  = gf_load_tensor(w, gf, p + ".pointwise_block.3.bias");
    l->down_w = gf_load_tensor(w, gf, p + ".pointwise_block.4.weight");
    l->down_b = gf_load_tensor(w, gf, p + ".pointwise_block.4.bias");
}

static void mert_load_layer(WeightCtx * w, const GGUFModel & gf, MertLayer * l, const std::string & p) {
    l->ffn1_ln_w    = gf_load_tensor(w, gf, p + ".ffn1_layer_norm.weight");
    l->ffn1_ln_b    = gf_load_tensor(w, gf, p + ".ffn1_layer_norm.bias");
    l->ffn1_w1      = gf_load_tensor(w, gf, p + ".ffn1.w_1.weight");
    l->ffn1_b1      = gf_load_tensor(w, gf, p + ".ffn1.w_1.bias");
    l->ffn1_w2      = gf_load_tensor(w, gf, p + ".ffn1.w_2.weight");
    l->ffn1_b2      = gf_load_tensor(w, gf, p + ".ffn1.w_2.bias");
    l->attn_ln_w    = gf_load_tensor(w, gf, p + ".attn_layer_norm.weight");
    l->attn_ln_b    = gf_load_tensor(w, gf, p + ".attn_layer_norm.bias");
    l->q_w          = gf_load_tensor(w, gf, p + ".attn.query_proj.weight");
    l->q_b          = gf_load_tensor(w, gf, p + ".attn.query_proj.bias");
    l->k_w          = gf_load_tensor(w, gf, p + ".attn.key_proj.weight");
    l->k_b          = gf_load_tensor(w, gf, p + ".attn.key_proj.bias");
    l->v_w          = gf_load_tensor(w, gf, p + ".attn.value_proj.weight");
    l->v_b          = gf_load_tensor(w, gf, p + ".attn.value_proj.bias");
    l->o_w          = gf_load_tensor(w, gf, p + ".attn.out_proj.weight");
    l->o_b          = gf_load_tensor(w, gf, p + ".attn.out_proj.bias");
    l->conv_ln_w    = gf_load_tensor(w, gf, p + ".conv_module.layer_norm.weight");
    l->conv_ln_b    = gf_load_tensor(w, gf, p + ".conv_module.layer_norm.bias");
    l->conv_pw1     = gf_load_tensor(w, gf, p + ".conv_module.conv_block.1.weight");
    l->conv_dw      = gf_load_tensor(w, gf, p + ".conv_module.conv_block.3.weight");
    l->conv_dw_ln_w = gf_load_tensor(w, gf, p + ".conv_module.conv_block.4.1.weight");
    l->conv_dw_ln_b = gf_load_tensor(w, gf, p + ".conv_module.conv_block.4.1.bias");
    l->conv_pw2     = gf_load_tensor(w, gf, p + ".conv_module.conv_block.6.weight");
    l->ffn2_ln_w    = gf_load_tensor(w, gf, p + ".ffn2_layer_norm.weight");
    l->ffn2_ln_b    = gf_load_tensor(w, gf, p + ".ffn2_layer_norm.bias");
    l->ffn2_w1      = gf_load_tensor(w, gf, p + ".ffn2.w_1.weight");
    l->ffn2_b1      = gf_load_tensor(w, gf, p + ".ffn2.w_1.bias");
    l->ffn2_w2      = gf_load_tensor(w, gf, p + ".ffn2.w_2.weight");
    l->ffn2_b2      = gf_load_tensor(w, gf, p + ".ffn2.w_2.bias");
    l->final_ln_w   = gf_load_tensor(w, gf, p + ".final_layer_norm.weight");
    l->final_ln_b   = gf_load_tensor(w, gf, p + ".final_layer_norm.bias");
}

// Copy a host table out of the GGUF
static void mert_host_table(const GGUFModel & gf, const char * name, std::vector<float> * out, size_t n) {
    const float * data = (const float *) gf_get_data(gf, name);
    if (!data) {
        fprintf(stderr, "[MERT] FATAL: tensor %s missing\n", name);
        exit(1);
    }
    out->assign(data, data + n);
}

// The GGUF of a base model beside the GGUF of a model built on it, of the
// same quant: the repo name the head config gives its base model, and the
// quant suffix of the head file.
// models/SheetSage2-Q8_0.gguf -> models/MERT-v2-FullSong-Q8_0.gguf
static std::string mert_beside(const std::string & head_path, const std::string & base_model) {
    size_t      slash = head_path.find_last_of("/\\");
    std::string dir   = slash == std::string::npos ? "" : head_path.substr(0, slash + 1);
    std::string name  = head_path.substr(dir.size());
    size_t      dash  = name.find_last_of('-');
    if (dash == std::string::npos) {
        return "";
    }
    return dir + base_model.substr(base_model.find_last_of('/') + 1) + name.substr(dash);
}

// Load the encoder from its GGUF onto a backend, the LoRA terms of the model
// built on it merged into its projections
static bool mert_load(Mert * m, const std::string & path, ggml_backend_t backend, const AdapterTerms & lora) {
    GGUFModel gf = {};
    if (!gf_load(&gf, path.c_str())) {
        fprintf(stderr, "[MERT] FATAL: cannot load %s\n", path.c_str());
        return false;
    }
    mert_load_config(&m->cfg, gf_get_str(gf, "mert2.config_json"));
    const MertConfig & c = m->cfg;

    mert_host_table(gf, "feature_extractor.spectrogram.window", &m->window, (size_t) c.win);
    mert_host_table(gf, "feature_extractor.mel_scale.fb", &m->mel_fb, (size_t) (c.n_fft / 2 + 1) * c.n_mels);
    mert_host_table(gf, "feature_extractor.mel_mean", &m->mel_mean, (size_t) c.n_mels);
    mert_host_table(gf, "feature_extractor.mel_std", &m->mel_std, (size_t) c.n_mels);
    for (int k = 0; k < c.n_mels; k++) {
        int lo = c.n_fft / 2 + 1, hi = 0;
        for (int b = 0; b < c.n_fft / 2 + 1; b++) {
            if (m->mel_fb[(size_t) b * c.n_mels + k] != 0.0f) {
                lo = std::min(lo, b);
                hi = std::max(hi, b + 1);
            }
        }
        m->mel_lo.push_back(lo);
        m->mel_hi.push_back(hi);
    }

    int n_sub = 0;
    for (int i = 0; i < MERT_MAX_SUB; i++) {
        n_sub += c.sub_depths[i];
    }
    wctx_init(&m->wctx, 4 * MERT_MAX_SUB + 10 * n_sub + 31 * c.n_layers);
    for (int i = 0; i < MERT_MAX_SUB; i++) {
        std::string p = "subsampling_module." + std::to_string(i);
        if (i > 0) {
            m->sub[i].rs_ln_w = gf_load_tensor(&m->wctx, gf, p + ".resampling_layer.0.weight");
            m->sub[i].rs_ln_b = gf_load_tensor(&m->wctx, gf, p + ".resampling_layer.0.bias");
            m->sub[i].rs_w    = gf_load_tensor(&m->wctx, gf, p + ".resampling_layer.2.weight");
            m->sub[i].rs_b    = gf_load_tensor(&m->wctx, gf, p + ".resampling_layer.2.bias");
        }
        for (int d = 0; d < c.sub_depths[i]; d++) {
            mert_load_convnext(&m->wctx, gf, &m->sub[i].layers[d], p + ".convnext_layers." + std::to_string(d));
        }
    }
    for (int l = 0; l < c.n_layers; l++) {
        mert_load_layer(&m->wctx, gf, &m->layers[l], "layers." + std::to_string(l));
    }
    bool ok = adapter_apply(&m->wctx, gf, backend, lora) && wctx_alloc(&m->wctx, backend);
    gf_close(&gf);
    if (ok) {
        fprintf(stderr, "[MERT] Loaded: %d conformer layers, %zu LoRA tensors merged\n", c.n_layers, lora.size());
    }
    return ok;
}

static void mert_free(Mert * m) {
    wctx_free(&m->wctx);
}

// Decoded planar stereo to the 24 kHz mono waveform MERT reads: the
// channels averaged, the rate converted
static bool mert_mono_24k(float * planar, int T, int sr, std::vector<float> * out) {
    std::vector<float> mono((size_t) T);
    for (int i = 0; i < T; i++) {
        mono[(size_t) i] = 0.5f * (planar[i] + planar[T + i]);
    }
    free(planar);
    if (sr == MERT_SAMPLE_RATE) {
        *out = mono;
        return true;
    }
    int     n_out     = 0;
    float * resampled = audio_resample(mono.data(), T, sr, MERT_SAMPLE_RATE, 1, &n_out);
    if (!resampled) {
        return false;
    }
    out->assign(resampled, resampled + n_out);
    free(resampled);
    return true;
}

// Mel frontend on the host, the torchaudio pipeline of the checkpoint:
// centered reflect padded STFT, power spectrum, mel filterbank, dB, the last
// frame dropped, per bin normalization. Output [T, n_mels] time major.

// In place radix 2 FFT on interleaved complex pairs, n a power of two
static void mert_fft(float * re, float * im, int n) {
    for (int i = 1, j = 0; i < n; i++) {
        int bit = n >> 1;
        for (; j & bit; bit >>= 1) {
            j ^= bit;
        }
        j ^= bit;
        if (i < j) {
            std::swap(re[i], re[j]);
            std::swap(im[i], im[j]);
        }
    }
    for (int len = 2; len <= n; len <<= 1) {
        double ang = -2.0 * M_PI / len;
        float  wr  = (float) cos(ang);
        float  wi  = (float) sin(ang);
        for (int i = 0; i < n; i += len) {
            float cr = 1.0f, ci = 0.0f;
            for (int j = 0; j < len / 2; j++) {
                int   a = i + j, b = i + j + len / 2;
                float xr = re[b] * cr - im[b] * ci;
                float xi = re[b] * ci + im[b] * cr;
                re[b]    = re[a] - xr;
                im[b]    = im[a] - xi;
                re[a] += xr;
                im[a] += xi;
                float nr = cr * wr - ci * wi;
                ci       = cr * wi + ci * wr;
                cr       = nr;
            }
        }
    }
}

static void mert_mel(const Mert * m, const float * audio, int n_samples, std::vector<float> * mel, int * T) {
    const MertConfig & c      = m->cfg;
    int                half   = c.n_fft / 2;
    int                bins   = half + 1;
    // Centered frames over the reflect padded signal, the last one dropped
    int                frames = n_samples / c.hop;
    *T                        = frames;
    mel->assign((size_t) frames * c.n_mels, 0.0f);

    std::vector<float> re(c.n_fft), im(c.n_fft), power(bins);
    for (int f = 0; f < frames; f++) {
        int start = f * c.hop - half;
        for (int i = 0; i < c.n_fft; i++) {
            int idx = start + i;
            if (idx < 0) {
                idx = -idx;
            } else if (idx >= n_samples) {
                idx = 2 * (n_samples - 1) - idx;
            }
            re[i] = audio[idx] * m->window[i];
            im[i] = 0.0f;
        }
        mert_fft(re.data(), im.data(), c.n_fft);
        for (int b = 0; b < bins; b++) {
            power[b] = re[b] * re[b] + im[b] * im[b];
        }
        float * row = mel->data() + (size_t) f * c.n_mels;
        for (int k = 0; k < c.n_mels; k++) {
            double acc = 0.0;
            for (int b = m->mel_lo[(size_t) k]; b < m->mel_hi[(size_t) k]; b++) {
                acc += (double) power[b] * m->mel_fb[(size_t) b * c.n_mels + k];
            }
            float db = 10.0f * log10f(fmaxf((float) acc, 1e-10f));
            row[k]   = (db - m->mel_mean[k]) / fmaxf(m->mel_std[k], 1e-5f);
        }
    }
}

// graph pieces, activations [C, T] with the channel on ne0

static struct ggml_tensor * mert_linear(struct ggml_context * ctx,
                                        struct ggml_tensor *  w,
                                        struct ggml_tensor *  b,
                                        struct ggml_tensor *  x) {
    struct ggml_tensor * y = ggml_mul_mat(ctx, w, x);
    return b ? ggml_add(ctx, y, b) : y;
}

static struct ggml_tensor * mert_layer_norm(struct ggml_context * ctx,
                                            struct ggml_tensor *  x,
                                            struct ggml_tensor *  w,
                                            struct ggml_tensor *  b,
                                            float                 eps) {
    return ggml_add(ctx, ggml_mul(ctx, ggml_norm(ctx, x, eps), w), b);
}

// Depthwise convolution along time, same padding, as the sum over the taps
// of the padded activation shifted by the tap times the per channel weight:
// exact F32 on every backend, no time major layout needed. The kernel
// [K, 1, C] turns into one [C] weight vector per tap.
static struct ggml_tensor * mert_depthwise(struct ggml_context * ctx, struct ggml_tensor * x, struct ggml_tensor * k) {
    int                  K  = (int) k->ne[0];
    int64_t              C  = x->ne[0];
    int64_t              T  = x->ne[1];
    struct ggml_tensor * xp = ggml_pad_ext(ctx, x, 0, 0, (K - 1) / 2, (K - 1) / 2, 0, 0, 0, 0);    // [C, T + K - 1]
    struct ggml_tensor * kt = ggml_cont(ctx, ggml_transpose(ctx, ggml_reshape_2d(ctx, k, K, C)));  // [C, K]
    struct ggml_tensor * y  = NULL;
    for (int j = 0; j < K; j++) {
        struct ggml_tensor * shifted = ggml_view_2d(ctx, xp, C, T, xp->nb[1], (size_t) j * xp->nb[1]);
        struct ggml_tensor * tap     = ggml_view_1d(ctx, kt, C, (size_t) j * kt->nb[1]);
        struct ggml_tensor * term    = ggml_mul(ctx, shifted, tap);
        y                            = y ? ggml_add(ctx, y, term) : term;
    }
    return y;
}

// Global response norm: the L2 magnitude of every channel over the whole
// window, scaled by the mean magnitude, gates the features
static struct ggml_tensor * mert_grn(struct ggml_context * ctx,
                                     struct ggml_tensor *  x,
                                     struct ggml_tensor *  w,
                                     struct ggml_tensor *  b) {
    struct ggml_tensor * sq    = ggml_cont(ctx, ggml_transpose(ctx, ggml_sqr(ctx, x)));  // [T, C]
    struct ggml_tensor * mag   = ggml_sqrt(ctx, ggml_sum_rows(ctx, sq));                 // [1, C]
    mag                        = ggml_reshape_1d(ctx, mag, x->ne[0]);                    // [C]
    struct ggml_tensor * nrm   = ggml_div(ctx, mag, ggml_scale_bias(ctx, ggml_mean(ctx, mag), 1.0f, 1e-6f));
    struct ggml_tensor * gated = ggml_mul(ctx, x, nrm);
    return ggml_add(ctx, ggml_add(ctx, ggml_mul(ctx, gated, w), b), x);
}

static struct ggml_tensor * mert_build_convnext(struct ggml_context * ctx,
                                                const MertConvNext *  l,
                                                struct ggml_tensor *  x,
                                                float                 eps) {
    struct ggml_tensor * h = ggml_add(ctx, mert_depthwise(ctx, x, l->dw_w), l->dw_b);
    h                      = mert_layer_norm(ctx, h, l->ln_w, l->ln_b, eps);
    h                      = ggml_gelu_erf(ctx, mert_linear(ctx, l->up_w, l->up_b, h));
    h                      = mert_grn(ctx, h, l->grn_w, l->grn_b);
    h                      = mert_linear(ctx, l->down_w, l->down_b, h);
    return ggml_add(ctx, x, h);
}

// Resampling: LayerNorm then a kernel 2 stride 2 convolution, which is a
// matmul over pairs of consecutive frames once the [C, T] activation is seen
// as [2C, T / 2]
static struct ggml_tensor * mert_build_resample(struct ggml_context * ctx,
                                                const MertSubBlock *  b,
                                                struct ggml_tensor *  x,
                                                float                 eps) {
    struct ggml_tensor * h     = mert_layer_norm(ctx, x, b->rs_ln_w, b->rs_ln_b, eps);
    int64_t              C_in  = h->ne[0];
    int64_t              C_out = b->rs_w->ne[2];
    int64_t              T_out = h->ne[1] / 2;  // an odd last frame has no pair and is dropped
    h                      = ggml_reshape_2d(ctx, ggml_view_2d(ctx, h, C_in, 2 * T_out, h->nb[1], 0), 2 * C_in, T_out);
    // Kernel [2, C_in, C_out] reordered as [C_in, 2, C_out] so the pair index is outer
    struct ggml_tensor * w = ggml_cont(ctx, ggml_permute(ctx, b->rs_w, 1, 0, 2, 3));
    w                      = ggml_reshape_2d(ctx, w, 2 * C_in, C_out);
    return mert_linear(ctx, w, b->rs_b, h);
}

static struct ggml_tensor * mert_build_ffn(struct ggml_context * ctx,
                                           struct ggml_tensor *  x,
                                           struct ggml_tensor *  ln_w,
                                           struct ggml_tensor *  ln_b,
                                           struct ggml_tensor *  w1,
                                           struct ggml_tensor *  b1,
                                           struct ggml_tensor *  w2,
                                           struct ggml_tensor *  b2,
                                           float                 eps) {
    struct ggml_tensor * h = mert_layer_norm(ctx, x, ln_w, ln_b, eps);
    h                      = ggml_gelu_erf(ctx, mert_linear(ctx, w1, b1, h));
    return mert_linear(ctx, w2, b2, h);
}

static struct ggml_tensor * mert_build_attn(struct ggml_context * ctx,
                                            const MertConfig &    c,
                                            const MertLayer *     l,
                                            struct ggml_tensor *  x,
                                            struct ggml_tensor *  positions,
                                            bool                  flash) {
    int                  D = c.hidden / c.n_heads;
    int64_t              T = x->ne[1];
    struct ggml_tensor * h = mert_layer_norm(ctx, x, l->attn_ln_w, l->attn_ln_b, c.eps);
    struct ggml_tensor * q = ggml_reshape_3d(ctx, mert_linear(ctx, l->q_w, l->q_b, h), D, c.n_heads, T);
    struct ggml_tensor * k = ggml_reshape_3d(ctx, mert_linear(ctx, l->k_w, l->k_b, h), D, c.n_heads, T);
    struct ggml_tensor * v = ggml_reshape_3d(ctx, mert_linear(ctx, l->v_w, l->v_b, h), D, c.n_heads, T);
    q = ggml_rope_ext(ctx, q, positions, NULL, D, GGML_ROPE_TYPE_NEOX, 0, c.rope_base, 1.0f, 0.0f, 1.0f, 0.0f, 0.0f);
    k = ggml_rope_ext(ctx, k, positions, NULL, D, GGML_ROPE_TYPE_NEOX, 0, c.rope_base, 1.0f, 0.0f, 1.0f, 0.0f, 0.0f);
    q = ggml_cont(ctx, ggml_permute(ctx, q, 0, 2, 1, 3));  // [D, T, H]
    k = ggml_cont(ctx, ggml_permute(ctx, k, 0, 2, 1, 3));
    v = ggml_cont(ctx, ggml_permute(ctx, v, 0, 2, 1, 3));
    float                scale = 1.0f / sqrtf((float) D);
    struct ggml_tensor * out;
    if (flash) {
        k   = ggml_cast(ctx, k, GGML_TYPE_F16);
        v   = ggml_cast(ctx, v, GGML_TYPE_F16);
        out = ggml_flash_attn_ext(ctx, q, k, v, NULL, scale, 0.0f, 0.0f);  // [D, H, T]
        ggml_prec_set_acc(out, GGML_PREC_F32);
    } else {
        struct ggml_tensor * scores = ggml_soft_max_ext(ctx, ggml_mul_mat(ctx, k, q), NULL, scale, 0.0f);
        struct ggml_tensor * vt     = ggml_cont(ctx, ggml_transpose(ctx, v));
        out                         = ggml_cont(ctx, ggml_permute(ctx, ggml_mul_mat(ctx, vt, scores), 0, 2, 1, 3));
    }
    out = ggml_reshape_2d(ctx, out, c.hidden, T);
    return mert_linear(ctx, l->o_w, l->o_b, out);
}

static struct ggml_tensor * mert_build_conv_module(struct ggml_context * ctx,
                                                   const MertConfig &    c,
                                                   const MertLayer *     l,
                                                   struct ggml_tensor *  x) {
    struct ggml_tensor * h  = mert_layer_norm(ctx, x, l->conv_ln_w, l->conv_ln_b, c.eps);
    // Pointwise [C, 2C] then GLU: the first half gated by the sigmoid of the second
    struct ggml_tensor * pw = ggml_mul_mat(ctx, ggml_reshape_2d(ctx, l->conv_pw1, c.hidden, 2 * c.hidden), h);
    struct ggml_tensor * a  = ggml_view_2d(ctx, pw, c.hidden, pw->ne[1], pw->nb[1], 0);
    struct ggml_tensor * g  = ggml_view_2d(ctx, pw, c.hidden, pw->ne[1], pw->nb[1], (size_t) c.hidden * pw->nb[0]);
    h                       = ggml_mul(ctx, ggml_cont(ctx, a), ggml_sigmoid(ctx, ggml_cont(ctx, g)));
    h                       = mert_depthwise(ctx, h, l->conv_dw);
    h                       = mert_layer_norm(ctx, h, l->conv_dw_ln_w, l->conv_dw_ln_b, c.eps);
    h                       = ggml_gelu_erf(ctx, h);
    return ggml_mul_mat(ctx, ggml_reshape_2d(ctx, l->conv_pw2, c.hidden, c.hidden), h);
}

static struct ggml_tensor * mert_build_conformer(struct ggml_context * ctx,
                                                 const MertConfig &    c,
                                                 const MertLayer *     l,
                                                 struct ggml_tensor *  x,
                                                 struct ggml_tensor *  positions,
                                                 bool                  flash) {
    x = ggml_add(ctx, x,
                 ggml_scale(ctx,
                            mert_build_ffn(ctx, x, l->ffn1_ln_w, l->ffn1_ln_b, l->ffn1_w1, l->ffn1_b1, l->ffn1_w2,
                                           l->ffn1_b2, c.eps),
                            0.5f));
    x = ggml_add(ctx, x, mert_build_attn(ctx, c, l, x, positions, flash));
    x = ggml_add(ctx, x, mert_build_conv_module(ctx, c, l, x));
    x = ggml_add(ctx, x,
                 ggml_scale(ctx,
                            mert_build_ffn(ctx, x, l->ffn2_ln_w, l->ffn2_ln_b, l->ffn2_w1, l->ffn2_b1, l->ffn2_w2,
                                           l->ffn2_b2, c.eps),
                            0.5f));
    return mert_layer_norm(ctx, x, l->final_ln_w, l->final_ln_b, c.eps);
}

// The encoder over a mel [n_mels, T_mel] into a graph: states[0] the
// subsampled frames, states[l + 1] the frames after layer l, n_layers layers
// built. positions [T] holds 0 .. T - 1 for the T = T_mel / 4 frames.
static void mert_build(struct ggml_context *               ctx,
                       const Mert *                        m,
                       struct ggml_tensor *                mel,
                       struct ggml_tensor *                positions,
                       int                                 n_layers,
                       bool                                flash,
                       std::vector<struct ggml_tensor *> * states) {
    const MertConfig &   c = m->cfg;
    struct ggml_tensor * x = mel;
    for (int i = 0; i < MERT_MAX_SUB; i++) {
        if (i > 0) {
            x = mert_build_resample(ctx, &m->sub[i], x, c.sub_eps);
        }
        for (int d = 0; d < c.sub_depths[i]; d++) {
            x = mert_build_convnext(ctx, &m->sub[i].layers[d], x, c.sub_eps);
        }
    }
    states->assign(1, x);
    for (int l = 0; l < n_layers; l++) {
        x = mert_build_conformer(ctx, c, &m->layers[l], x, positions, flash);
        states->push_back(x);
    }
}
