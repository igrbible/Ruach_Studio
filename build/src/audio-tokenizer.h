#pragma once
// audio-tokenizer.h: audio to YuE2 semantic codes
//
// The v9 audio tokenizer of Mothersuperior, a head on MERT-v2-FullSong. The
// recording at 24 kHz mono runs through MERT in independent 30 s chunks, a
// tail under one second dropped, the state after layer 20 of every chunk
// concatenated and resampled linearly onto the 25 Hz grid of the codec, and
// every channel normalized over the whole song. An 8 layer pre-norm
// transformer then reads windows of 512 frames hopping by 256, keeps the
// centre of each, and picks the code of every frame among 32768.
//
// The head GGUF names its base model, MERT loads from the GGUF of the same
// quant beside it, on the backend of the head.

#include "backend.h"
#include "debug.h"
#include "graph-arena.h"
#include "mert.h"
#include "timer.h"

#include <cmath>
#include <cstdio>
#include <string>
#include <vector>

#define ATOK_MAX_LAYERS  8
#define ATOK_GRAPH_NODES 16384

struct AtokConfig {
    int   mert_layer, chunk_seconds, frame_rate, window;
    int   d_model, n_layers, n_heads, d_ffn, vocab;
    float ln_eps, in_eps;
};

struct AtokLayer {
    struct ggml_tensor *qkv_w, *qkv_b;  // [d, 3d], [3d], q | k | v
    struct ggml_tensor *o_w, *o_b;
    struct ggml_tensor *ln1_w, *ln1_b, *ln2_w, *ln2_b;
    struct ggml_tensor *fc1_w, *fc1_b, *fc2_w, *fc2_b;
};

struct AudioTokenizer {
    AtokConfig cfg;
    Mert       mert;
    AtokLayer  layers[ATOK_MAX_LAYERS];

    struct ggml_tensor * inp_w, *inp_b;    // [hidden, d], [d]
    struct ggml_tensor * pos;              // [d, window]
    struct ggml_tensor * norm_w, *norm_b;  // [d]
    struct ggml_tensor * head_w, *head_b;  // [d, vocab], [vocab]

    WeightCtx            wctx;
    ggml_backend_t       backend;
    ggml_backend_t       cpu_backend;
    ggml_backend_sched_t sched;
    bool                 use_flash_attn;
    GraphArena           arena;
};

// The head config, and the repo name of the base model it is built on
static void atok_load_config(AtokConfig * c, const char * json, std::string * base_model) {
    yyjson_doc * doc = yyjson_read(json, strlen(json), 0);
    if (!doc) {
        fprintf(stderr, "[Tokenizer] FATAL: malformed config json\n");
        exit(1);
    }
    yyjson_val * root = yyjson_doc_get_root(doc);
    c->mert_layer     = (int) mert_json_num(root, "mert_layer");
    c->chunk_seconds  = (int) mert_json_num(root, "chunk_seconds");
    c->frame_rate     = (int) mert_json_num(root, "frame_rate");
    c->window         = (int) mert_json_num(root, "window");
    c->d_model        = (int) mert_json_num(root, "hidden_size");
    c->n_layers       = (int) mert_json_num(root, "num_hidden_layers");
    c->n_heads        = (int) mert_json_num(root, "num_attention_heads");
    c->d_ffn          = (int) mert_json_num(root, "intermediate_size");
    c->vocab          = (int) mert_json_num(root, "vocab_size");
    c->ln_eps         = (float) mert_json_num(root, "layer_norm_eps");
    c->in_eps         = (float) mert_json_num(root, "instance_norm_eps");
    yyjson_val * base = yyjson_obj_get(root, "base_model_name_or_path");
    *base_model       = base && yyjson_is_str(base) ? yyjson_get_str(base) : "";
    yyjson_doc_free(doc);
    if (c->n_layers > ATOK_MAX_LAYERS || base_model->empty()) {
        fprintf(stderr, "[Tokenizer] FATAL: unsupported config\n");
        exit(1);
    }
}

static void atok_load_layer(WeightCtx * w, const GGUFModel & gf, AtokLayer * l, const std::string & p) {
    l->qkv_w = gf_load_tensor(w, gf, p + ".self_attn.in_proj_weight");
    l->qkv_b = gf_load_tensor(w, gf, p + ".self_attn.in_proj_bias");
    l->o_w   = gf_load_tensor(w, gf, p + ".self_attn.out_proj.weight");
    l->o_b   = gf_load_tensor(w, gf, p + ".self_attn.out_proj.bias");
    l->ln1_w = gf_load_tensor(w, gf, p + ".norm1.weight");
    l->ln1_b = gf_load_tensor(w, gf, p + ".norm1.bias");
    l->ln2_w = gf_load_tensor(w, gf, p + ".norm2.weight");
    l->ln2_b = gf_load_tensor(w, gf, p + ".norm2.bias");
    l->fc1_w = gf_load_tensor(w, gf, p + ".linear1.weight");
    l->fc1_b = gf_load_tensor(w, gf, p + ".linear1.bias");
    l->fc2_w = gf_load_tensor(w, gf, p + ".linear2.weight");
    l->fc2_b = gf_load_tensor(w, gf, p + ".linear2.bias");
}

// Load the head from its GGUF and MERT from the GGUF beside it
static bool atok_load(AudioTokenizer * m, const char * gguf_path) {
    *m           = {};
    GGUFModel gf = {};
    if (!gf_load(&gf, gguf_path)) {
        fprintf(stderr, "[Tokenizer] FATAL: cannot load %s\n", gguf_path);
        return false;
    }
    std::string base_model;
    atok_load_config(&m->cfg, gf_get_str(gf, "yue2-tokenizer.config_json"), &base_model);
    const AtokConfig & c = m->cfg;

    BackendPair bp    = backend_init("Tokenizer");
    m->backend        = bp.backend;
    m->cpu_backend    = bp.cpu_backend;
    m->sched          = backend_sched_new(bp, ATOK_GRAPH_NODES);
    m->use_flash_attn = bp.has_gpu;

    std::string mert_path = mert_beside(gguf_path, base_model);
    if (!mert_load(&m->mert, mert_path, m->backend, {})) {
        fprintf(stderr, "[Tokenizer] FATAL: %s expects %s beside it\n", gguf_path, mert_path.c_str());
        gf_close(&gf);
        return false;
    }
    if (c.mert_layer >= m->mert.cfg.n_layers) {
        fprintf(stderr, "[Tokenizer] FATAL: MERT has no layer %d\n", c.mert_layer);
        gf_close(&gf);
        return false;
    }

    wctx_init(&m->wctx, 7 + 12 * c.n_layers);
    m->inp_w  = gf_load_tensor(&m->wctx, gf, "inp.weight");
    m->inp_b  = gf_load_tensor(&m->wctx, gf, "inp.bias");
    m->pos    = gf_load_tensor(&m->wctx, gf, "pos");
    m->norm_w = gf_load_tensor(&m->wctx, gf, "norm.weight");
    m->norm_b = gf_load_tensor(&m->wctx, gf, "norm.bias");
    m->head_w = gf_load_tensor(&m->wctx, gf, "head.weight");
    m->head_b = gf_load_tensor(&m->wctx, gf, "head.bias");
    for (int l = 0; l < c.n_layers; l++) {
        atok_load_layer(&m->wctx, gf, &m->layers[l], "enc.layers." + std::to_string(l));
    }
    bool ok = wctx_alloc(&m->wctx, m->backend);
    gf_close(&gf);
    if (!ok || !graph_arena_init(&m->arena, ATOK_GRAPH_NODES)) {
        return false;
    }
    fprintf(stderr, "[Tokenizer] Loaded: MERT layer %d, %d head layers, window %d, vocab %d\n", c.mert_layer,
            c.n_layers, c.window, c.vocab);
    return true;
}

static void atok_free(AudioTokenizer * m) {
    graph_arena_free(&m->arena);
    mert_free(&m->mert);
    wctx_free(&m->wctx);
    if (m->sched) {
        ggml_backend_sched_free(m->sched);
    }
    backend_release(m->backend, m->cpu_backend);
}

// The MERT state after the tokenizer layer of one chunk: n samples at 24 kHz
// -> frames [T, hidden] time major appended to out
static bool atok_mert_chunk(AudioTokenizer * m, const float * audio, int n, std::vector<float> * out) {
    const MertConfig & mc = m->mert.cfg;
    std::vector<float> mel;
    int                T_mel = 0;
    mert_mel(&m->mert, audio, n, &mel, &T_mel);

    ggml_backend_sched_reset(m->sched);
    struct ggml_context * ctx    = graph_arena_begin(&m->arena);
    struct ggml_cgraph *  gf     = ggml_new_graph_custom(ctx, ATOK_GRAPH_NODES, false);
    struct ggml_tensor *  in_mel = ggml_new_tensor_2d(ctx, GGML_TYPE_F32, mc.n_mels, T_mel);
    ggml_set_input(in_mel);
    int                  T      = T_mel / 4;
    struct ggml_tensor * in_pos = ggml_new_tensor_1d(ctx, GGML_TYPE_I32, T);
    ggml_set_input(in_pos);
    std::vector<struct ggml_tensor *> states;
    mert_build(ctx, &m->mert, in_mel, in_pos, m->cfg.mert_layer + 1, m->use_flash_attn, &states);
    struct ggml_tensor * state = states.back();
    ggml_set_output(state);
    ggml_build_forward_expand(gf, state);
    if (!ggml_backend_sched_alloc_graph(m->sched, gf)) {
        fprintf(stderr, "[Tokenizer] FATAL: MERT graph alloc failed\n");
        return false;
    }
    ggml_backend_tensor_set(in_mel, mel.data(), 0, mel.size() * sizeof(float));
    std::vector<int32_t> pos((size_t) T);
    for (int i = 0; i < T; i++) {
        pos[(size_t) i] = i;
    }
    ggml_backend_tensor_set(in_pos, pos.data(), 0, pos.size() * sizeof(int32_t));
    ggml_backend_sched_graph_compute(m->sched, gf);
    size_t at = out->size();
    out->resize(at + (size_t) T * mc.hidden);
    ggml_backend_tensor_get(state, out->data() + at, 0, (size_t) T * mc.hidden * sizeof(float));
    return true;
}

// The normalized features of a song on the 25 Hz grid: [T, hidden] time
// major. The chunk frames are resampled linearly onto round(seconds * 25)
// frames like a half pixel interpolation, then every channel is centered
// and scaled by its standard deviation over the whole song.
static bool atok_features(AudioTokenizer *     m,
                          const float *        audio,
                          int                  n_samples,
                          std::vector<float> * features,
                          int *                T_out,
                          const DebugDumper *  dbg) {
    const int          C     = m->mert.cfg.hidden;
    const int          chunk = m->cfg.chunk_seconds * MERT_SAMPLE_RATE;
    std::vector<float> frames;
    for (int s = 0; s < n_samples; s += chunk) {
        int n = std::min(chunk, n_samples - s);
        if (n < MERT_SAMPLE_RATE) {
            break;
        }
        if (!atok_mert_chunk(m, audio + s, n, &frames)) {
            return false;
        }
    }
    const int T_in = (int) (frames.size() / C);
    const int T    = (int) std::rint((double) n_samples * m->cfg.frame_rate / MERT_SAMPLE_RATE);
    if (T_in == 0 || T == 0) {
        fprintf(stderr, "[Tokenizer] FATAL: recording shorter than one second\n");
        return false;
    }
    features->assign((size_t) T * C, 0.0f);
    const double scale = (double) T_in / T;
    for (int t = 0; t < T; t++) {
        double src = std::max(0.0, (t + 0.5) * scale - 0.5);
        int    i0  = std::min((int) src, T_in - 1);
        int    i1  = std::min(i0 + 1, T_in - 1);
        float  w   = (float) (src - i0);
        for (int c = 0; c < C; c++) {
            (*features)[(size_t) t * C + c] =
                (1.0f - w) * frames[(size_t) i0 * C + c] + w * frames[(size_t) i1 * C + c];
        }
    }
    debug_dump_2d(dbg, "tokenizer-mert", features->data(), T, C);
    for (int c = 0; c < C; c++) {
        double sum = 0.0, sq = 0.0;
        for (int t = 0; t < T; t++) {
            sum += (*features)[(size_t) t * C + c];
        }
        double mean = sum / T;
        for (int t = 0; t < T; t++) {
            double d = (*features)[(size_t) t * C + c] - mean;
            sq += d * d;
        }
        float inv = 1.0f / ((float) std::sqrt(sq / T) + m->cfg.in_eps);
        for (int t = 0; t < T; t++) {
            float & v = (*features)[(size_t) t * C + c];
            v         = (float) (v - mean) * inv;
        }
    }
    *T_out = T;
    return true;
}

// Bidirectional multi head attention of one head layer over [d, W]
static struct ggml_tensor * atok_attn(struct ggml_context * ctx,
                                      const AtokConfig &    c,
                                      const AtokLayer *     l,
                                      struct ggml_tensor *  h,
                                      bool                  flash) {
    int                  D   = c.d_model / c.n_heads;
    int64_t              W   = h->ne[1];
    struct ggml_tensor * qkv = mert_linear(ctx, l->qkv_w, l->qkv_b, h);  // [3d, W]
    struct ggml_tensor * qkh[3];
    for (int i = 0; i < 3; i++) {
        struct ggml_tensor * v = ggml_view_3d(ctx, qkv, D, c.n_heads, W, (size_t) D * qkv->nb[0], qkv->nb[1],
                                              (size_t) i * c.d_model * qkv->nb[0]);
        qkh[i]                 = ggml_cont(ctx, ggml_permute(ctx, v, 0, 2, 1, 3));  // [D, W, H]
    }
    float                scale = 1.0f / sqrtf((float) D);
    struct ggml_tensor * out;
    if (flash) {
        out = ggml_flash_attn_ext(ctx, qkh[0], ggml_cast(ctx, qkh[1], GGML_TYPE_F16),
                                  ggml_cast(ctx, qkh[2], GGML_TYPE_F16), NULL, scale, 0.0f, 0.0f);  // [D, H, W]
        ggml_prec_set_acc(out, GGML_PREC_F32);
    } else {
        struct ggml_tensor * scores = ggml_soft_max_ext(ctx, ggml_mul_mat(ctx, qkh[1], qkh[0]), NULL, scale, 0.0f);
        struct ggml_tensor * vt     = ggml_cont(ctx, ggml_transpose(ctx, qkh[2]));
        out                         = ggml_cont(ctx, ggml_permute(ctx, ggml_mul_mat(ctx, vt, scores), 0, 2, 1, 3));
    }
    return mert_linear(ctx, l->o_w, l->o_b, ggml_reshape_2d(ctx, out, c.d_model, W));
}

// The codes of a song from its features: windows of the head, the centre of
// every window kept, the first and the last kept up to the song edges
static bool atok_codes(AudioTokenizer *           m,
                       const std::vector<float> & features,
                       int                        T,
                       std::vector<int> *         codes,
                       const DebugDumper *        dbg) {
    const AtokConfig & c = m->cfg;
    const int          C = m->mert.cfg.hidden;
    const int          W = c.window;
    std::vector<int>   starts;
    for (int s = 0; s < std::max(1, T - W + 1); s += W / 2) {
        starts.push_back(s);
    }
    if (starts.back() + W < T) {
        starts.push_back(std::max(0, T - W));
    }
    codes->assign((size_t) T, 0);
    std::vector<float>   window((size_t) W * C);
    std::vector<int32_t> pred((size_t) W);
    for (int s0 : starts) {
        int n = std::min(W, T - s0);
        std::fill(window.begin(), window.end(), 0.0f);
        std::copy(features.begin() + (size_t) s0 * C, features.begin() + (size_t) (s0 + n) * C, window.begin());

        ggml_backend_sched_reset(m->sched);
        struct ggml_context * ctx = graph_arena_begin(&m->arena);
        struct ggml_cgraph *  gf  = ggml_new_graph_custom(ctx, ATOK_GRAPH_NODES, false);
        struct ggml_tensor *  in  = ggml_new_tensor_2d(ctx, GGML_TYPE_F32, C, W);
        ggml_set_input(in);
        struct ggml_tensor * x =
            ggml_add(ctx, mert_linear(ctx, m->inp_w, m->inp_b, in), ggml_reshape_2d(ctx, m->pos, c.d_model, W));
        for (int l = 0; l < c.n_layers; l++) {
            const AtokLayer *    ly = &m->layers[l];
            struct ggml_tensor * h  = mert_layer_norm(ctx, x, ly->ln1_w, ly->ln1_b, c.ln_eps);
            x                       = ggml_add(ctx, x, atok_attn(ctx, c, ly, h, m->use_flash_attn));
            h                       = mert_layer_norm(ctx, x, ly->ln2_w, ly->ln2_b, c.ln_eps);
            h                       = ggml_gelu_erf(ctx, mert_linear(ctx, ly->fc1_w, ly->fc1_b, h));
            x                       = ggml_add(ctx, x, mert_linear(ctx, ly->fc2_w, ly->fc2_b, h));
        }
        x                          = mert_layer_norm(ctx, x, m->norm_w, m->norm_b, c.ln_eps);
        struct ggml_tensor * picks = ggml_argmax(ctx, mert_linear(ctx, m->head_w, m->head_b, x));
        ggml_set_output(picks);
        ggml_build_forward_expand(gf, picks);
        if (!ggml_backend_sched_alloc_graph(m->sched, gf)) {
            fprintf(stderr, "[Tokenizer] FATAL: head graph alloc failed\n");
            return false;
        }
        ggml_backend_tensor_set(in, window.data(), 0, window.size() * sizeof(float));
        ggml_backend_sched_graph_compute(m->sched, gf);
        ggml_backend_tensor_get(picks, pred.data(), 0, pred.size() * sizeof(int32_t));

        int lo = s0 + (s0 == 0 ? 0 : W / 4);
        int hi = s0 + n - (s0 + n >= T ? 0 : W / 4);
        for (int t = lo; t < hi; t++) {
            (*codes)[(size_t) t] = pred[(size_t) (t - s0)];
        }
    }
    if (dbg->enabled) {
        std::vector<float> as_float = debug_ids(*codes);
        debug_dump_2d(dbg, "tokenizer-codes", as_float.data(), T, 1);
    }
    return true;
}

// A recording at 24 kHz mono to its semantic codes, 25 per second
static bool atok_tokenize(AudioTokenizer *    m,
                          const float *       audio,
                          int                 n_samples,
                          std::vector<int> *  codes,
                          const DebugDumper * dbg) {
    Timer              timer;
    std::vector<float> features;
    int                T = 0;
    if (!atok_features(m, audio, n_samples, &features, &T, dbg) || !atok_codes(m, features, T, codes, dbg)) {
        return false;
    }
    fprintf(stderr, "[Tokenizer] %d codes, %.1f s of audio, %.0f ms\n", T, (double) n_samples / MERT_SAMPLE_RATE,
            timer.ms());
    return true;
}
