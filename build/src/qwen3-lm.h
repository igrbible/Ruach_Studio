// qwen3-lm.h : Qwen3 causal LM with KV cache (GGML)
// Autoregressive score and semantic token generation for YuE2
// Loads from GGUF, prefills a sequence and decodes through the batched
// static graph, untied lm_head
// The AR half of the MoT backbone: the nar_* weight set is read by nar.h
#pragma once

#include "sliders.h"
#include "graph-arena.h"
#include "qwen3-enc.h"  // Qwen3Layer, Qwen3Config, layer build helpers
#include "static-graph.h"

#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <vector>

// LM config (superset of encoder config)
struct Qwen3LMConfig {
    int   vocab_size;
    int   hidden_size;
    int   intermediate_size;
    int   n_heads;
    int   n_kv_heads;
    int   head_dim;
    int   n_layers;
    float rope_theta;
    float rms_norm_eps;
    bool  tie_embeddings;
    int   max_seq_len;  // KV cache capacity
};

// KV cache set (one per CFG path: conditional + unconditional)
#define QW3LM_MAX_KV_SETS 32  // batch N * 2 (cond + uncond CFG)
#define QW3LM_MAX_LAYERS  64
// Local change: room for up to 16 stacked sliders, about 6000 nodes each
// (112 projections x ~50 ops and weights), on top of the 16384 of the backbone
#define QW3LM_GRAPH_NODES (16384 + 16 * 6144)

// Static batched decode graph. Built once per shape class and replayed with a
// fresh input upload per step: n_kv_pad advances every 256 steps, N and the
// batch base set hold within a generation. A prefill forward clobbers the
// shared sched allocation, so it invalidates this cache.
struct Qw3lmGraphCache {
    bool                  built        = false;
    int                   key_n_kv_pad = 0;
    int                   key_N        = 0;
    int                   key_row0     = 0;
    int                   key_rows     = 0;
    struct ggml_tensor *  key_kv       = nullptr;  // the cache the graph reads, reallocated on growth
    int                   key_s0       = 0;
    const SliderSet *     key_sliders  = nullptr;  // local addition: the sliders baked into the graph
    struct ggml_cgraph *  gf           = nullptr;
    struct ggml_tensor *  token_ids_t  = nullptr;
    struct ggml_tensor *  positions    = nullptr;
    struct ggml_tensor *  kv_rows      = nullptr;
    struct ggml_tensor *  attn_mask    = nullptr;
    struct ggml_tensor *  lgt          = nullptr;
    StaticGraph           graph;
    std::vector<int>      pos_data;
    std::vector<int64_t>  rows_data;
    std::vector<uint16_t> mask_data;
};

// KV cache of the backbone, owned apart from the weights: the AR fills it,
// the NAR reads it, and the weights of either half may leave VRAM in
// between while the cache stays.
struct Qw3lmKvCache {
    Qwen3LMConfig         cfg;  // shape source: layers, heads, max_seq_len
    ggml_backend_t        backend;
    struct ggml_context * ctx;
    ggml_backend_buffer_t buf;
    // 4D batched: per-layer [D, max_seq, Nkv, n_sets] for batched flash_attn
    struct ggml_tensor *  k4[QW3LM_MAX_LAYERS];
    struct ggml_tensor *  v4[QW3LM_MAX_LAYERS];
    // 3D views: per-set, per-layer [D, max_seq, Nkv] for prefill, copy and the NAR read
    struct ggml_tensor *  k[QW3LM_MAX_KV_SETS][QW3LM_MAX_LAYERS];
    struct ggml_tensor *  v[QW3LM_MAX_KV_SETS][QW3LM_MAX_LAYERS];
    int                   pos[QW3LM_MAX_KV_SETS];
    int                   n_sets;
};

struct Qwen3LM {
    Qwen3LMConfig cfg;

    // Weights (on backend)
    struct ggml_tensor * embed_tokens;  // [H, V] on GPU
    struct ggml_tensor * lm_head;       // [H, V], embed_tokens when tie_embeddings
    struct ggml_tensor * final_norm;    // [H]
    Qwen3Layer           layers[QW3LM_MAX_LAYERS];

    WeightCtx            wctx;
    ggml_backend_t       backend;
    ggml_backend_t       cpu_backend;
    ggml_backend_sched_t sched;
    bool                 use_flash_attn;
    bool                 clamp_fp16;  // clamp hidden state on sub-Ampere CUDA (FP16 accumulation overflow)

    // Persistent graph arenas, one per graph shape class: stable node
    // addresses across rebuilds keep the backend graph cache hot.
    GraphArena arena_prefill;
    GraphArena arena_batch;

    // Static batched decode graph, replayed across the token loop.
    Qw3lmGraphCache batch_graph;

    // Local addition: voice/genre sliders on the attention projections while
    // the music tokens are written (qw3lm_set_sliders), NULL otherwise
    const SliderSet * sliders = nullptr;
};

// Parse config.json integers, floats, bools
static int qw3lm_json_int(const char * json, const char * key, int fb) {
    char needle[128];
    snprintf(needle, sizeof(needle), "\"%s\"", key);
    const char * p = strstr(json, needle);
    if (!p) {
        return fb;
    }
    p = strchr(p + strlen(needle), ':');
    if (!p) {
        return fb;
    }
    p++;
    while (*p == ' ' || *p == '\t') {
        p++;
    }
    return atoi(p);
}

static float qw3lm_json_float(const char * json, const char * key, float fb) {
    char needle[128];
    snprintf(needle, sizeof(needle), "\"%s\"", key);
    const char * p = strstr(json, needle);
    if (!p) {
        return fb;
    }
    p = strchr(p + strlen(needle), ':');
    if (!p) {
        return fb;
    }
    p++;
    while (*p == ' ' || *p == '\t') {
        p++;
    }
    return (float) atof(p);
}

static bool qw3lm_json_bool(const char * json, const char * key, bool fb) {
    char needle[128];
    snprintf(needle, sizeof(needle), "\"%s\"", key);
    const char * p = strstr(json, needle);
    if (!p) {
        return fb;
    }
    p = strchr(p + strlen(needle), ':');
    if (!p) {
        return fb;
    }
    p++;
    while (*p == ' ' || *p == '\t') {
        p++;
    }
    return (strncmp(p, "true", 4) == 0);
}

// Load config from GGUF KV metadata (yue2.config_json)
static Qwen3LMConfig qw3lm_load_config(const GGUFModel & gf) {
    // YuE2 backbone defaults (YuE2-3B/config.json)
    Qwen3LMConfig c = {
        /*vocab_size*/ 184704,
        /*hidden_size*/ 2048,
        /*intermediate_size*/ 6144,
        /*n_heads*/ 16,
        /*n_kv_heads*/ 8,
        /*head_dim*/ 128,
        /*n_layers*/ 28,
        /*rope_theta*/ 1000000.0f,
        /*rms_norm_eps*/ 1e-6f,
        /*tie_embeddings*/ false,
        /*max_seq_len*/ 24576,
    };

    const char * j = gf_get_str(gf, "yue2.config_json");
    if (!j || !j[0]) {
        fprintf(stderr, "[LM-Config] No yue2.config_json, using 3B defaults\n");
        return c;
    }

    c.vocab_size        = qw3lm_json_int(j, "vocab_size", c.vocab_size);
    c.hidden_size       = qw3lm_json_int(j, "hidden_size", c.hidden_size);
    c.intermediate_size = qw3lm_json_int(j, "intermediate_size", c.intermediate_size);
    c.n_heads           = qw3lm_json_int(j, "num_attention_heads", c.n_heads);
    c.n_kv_heads        = qw3lm_json_int(j, "num_key_value_heads", c.n_kv_heads);
    c.head_dim          = qw3lm_json_int(j, "head_dim", c.head_dim);
    c.n_layers          = qw3lm_json_int(j, "num_hidden_layers", c.n_layers);
    c.rope_theta        = qw3lm_json_float(j, "rope_theta", c.rope_theta);
    c.rms_norm_eps      = qw3lm_json_float(j, "rms_norm_eps", c.rms_norm_eps);
    c.tie_embeddings    = qw3lm_json_bool(j, "tie_word_embeddings", c.tie_embeddings);
    return c;
}

// Init backend (same pattern as qwen3.h)
static void qw3lm_init_backend(Qwen3LM * m) {
    BackendPair bp    = backend_init("LM");
    m->backend        = bp.backend;
    m->cpu_backend    = bp.cpu_backend;
    m->sched          = backend_sched_new(bp, QW3LM_GRAPH_NODES);
    m->use_flash_attn = bp.has_gpu;
    m->clamp_fp16     = false;
}

// Bind a cache to its config and backend, no set allocated yet
static void qw3lm_kv_init(Qw3lmKvCache * kv, const Qwen3LMConfig & cfg, ggml_backend_t backend) {
    *kv         = {};
    kv->cfg     = cfg;
    kv->backend = backend;
}

// Free the sets, the binding stays
static void qw3lm_kv_free(Qw3lmKvCache * kv) {
    if (kv->buf) {
        ggml_backend_buffer_free(kv->buf);
    }
    if (kv->ctx) {
        ggml_free(kv->ctx);
    }
    kv->buf    = nullptr;
    kv->ctx    = nullptr;
    kv->n_sets = 0;
}

// Allocate n_sets sets on the backend, replacing whatever the cache held
static bool qw3lm_kv_alloc(Qw3lmKvCache * kv, int n_sets) {
    const Qwen3LMConfig & cfg = kv->cfg;
    int                   D   = cfg.head_dim;
    int                   Nkv = cfg.n_kv_heads;
    int                   L   = cfg.n_layers;
    int                   S   = cfg.max_seq_len;

    qw3lm_kv_free(kv);
    kv->n_sets = n_sets;

    // 4D tensors [D, S, Nkv, n_sets] + 3D views [D, S, Nkv] per set
    int                     n_tensors = L * 2 + n_sets * L * 2;  // 4D + views
    size_t                  ctx_size  = (size_t) n_tensors * ggml_tensor_overhead() + 1024;
    struct ggml_init_params gp        = { ctx_size, NULL, true };
    kv->ctx                           = ggml_init(gp);

    for (int l = 0; l < L; l++) {
        // 4D batched tensors (allocated by backend)
        kv->k4[l] = ggml_new_tensor_4d(kv->ctx, GGML_TYPE_F16, D, S, Nkv, n_sets);
        kv->v4[l] = ggml_new_tensor_4d(kv->ctx, GGML_TYPE_F16, D, S, Nkv, n_sets);
        char name[64];
        snprintf(name, sizeof(name), "kv_k4_%d", l);
        ggml_set_name(kv->k4[l], name);
        snprintf(name, sizeof(name), "kv_v4_%d", l);
        ggml_set_name(kv->v4[l], name);

        // 3D views per set
        for (int s = 0; s < n_sets; s++) {
            size_t off  = (size_t) s * D * S * Nkv * ggml_type_size(GGML_TYPE_F16);
            kv->k[s][l] = ggml_view_3d(kv->ctx, kv->k4[l], D, S, Nkv, kv->k4[l]->nb[1], kv->k4[l]->nb[2], off);
            kv->v[s][l] = ggml_view_3d(kv->ctx, kv->v4[l], D, S, Nkv, kv->v4[l]->nb[1], kv->v4[l]->nb[2], off);
        }
    }
    for (int s = 0; s < n_sets; s++) {
        kv->pos[s] = 0;
    }

    kv->buf = ggml_backend_alloc_ctx_tensors(kv->ctx, kv->backend);
    if (!kv->buf) {
        fprintf(stderr, "[LM-KV] FATAL: failed to allocate KV cache\n");
        return false;
    }

    // Zero the buffer once: the attention window is padded past the position
    // and the masked tail must read finite values, never uninitialized F16
    // bit patterns that can decode to NaN.
    ggml_backend_buffer_clear(kv->buf, 0);

    size_t kv_bytes = (size_t) n_sets * L * 2 * D * S * Nkv * ggml_type_size(GGML_TYPE_F16);
    fprintf(stderr, "[LM-KV] Allocated %d sets x %d layers (4D batched), %.1f MB\n", n_sets, L,
            (float) kv_bytes / (1024 * 1024));
    return true;
}

// Grow the cache to the requested number of sets, from none on the first
// call. The guided path and the batch ask for it before any prefill, so
// nothing is lost here; the graphs that read the cache key on its tensors
// and rebuild.
static bool qw3lm_kv_sets(Qw3lmKvCache * kv, int n_sets) {
    if (n_sets <= kv->n_sets) {
        return true;
    }
    return qw3lm_kv_alloc(kv, n_sets);
}

// Replicate one set into another, position included: a prefix shared by
// several sequences prefills once
static void qw3lm_kv_copy(Qw3lmKvCache * kv, int src, int dst) {
    for (int l = 0; l < kv->cfg.n_layers; l++) {
        ggml_backend_tensor_copy(kv->k[src][l], kv->k[dst][l]);
        ggml_backend_tensor_copy(kv->v[src][l], kv->v[dst][l]);
    }
    kv->pos[dst] = kv->pos[src];
}

// Keep the first n rows of one set, the sequence being rewritten from there
static void qw3lm_kv_trim(Qw3lmKvCache * kv, int set, int n) {
    kv->pos[set] = n;
    // No rezero needed: stale values past the position are finite (zeroed
    // at alloc, then overwritten by real K/V) and the mask carries neg inf
    // over the padded attention tail.
}

// Read the config of a backbone GGUF without loading its weights: the
// cache is sized from it before either half loads
static bool qw3lm_read_config(const char * gguf_path, Qwen3LMConfig * cfg) {
    GGUFModel gf;
    if (!gf_load(&gf, gguf_path)) {
        fprintf(stderr, "[LM-Load] FATAL: cannot load %s\n", gguf_path);
        return false;
    }
    *cfg = qw3lm_load_config(gf);
    gf_close(&gf);
    return true;
}

// Load model weights from GGUF
static bool qw3lm_load(Qwen3LM * m, const char * gguf_path) {
    *m = {};

    qw3lm_init_backend(m);

    GGUFModel gf;
    if (!gf_load(&gf, gguf_path)) {
        fprintf(stderr, "[LM-Load] FATAL: cannot load %s\n", gguf_path);
        return false;
    }

    m->cfg                  = qw3lm_load_config(gf);
    const Qwen3LMConfig & c = m->cfg;
    fprintf(stderr, "[LM-Config] %dL, H=%d, V=%d, Nh=%d, Nkv=%d, D=%d, tied=%d\n", c.n_layers, c.hidden_size,
            c.vocab_size, c.n_heads, c.n_kv_heads, c.head_dim, c.tie_embeddings);

    if (c.n_layers <= 0 || c.n_layers > QW3LM_MAX_LAYERS) {
        fprintf(stderr, "[LM-Load] FATAL: invalid n_layers=%d (max %d)\n", c.n_layers, QW3LM_MAX_LAYERS);
        gf_close(&gf);
        return false;
    }

    // embed(1) + lm_head(1) + layers * 11 + final_norm(1) = 3 + n_layers * 11
    int n_tensors = 3 + c.n_layers * 11;
    wctx_init(&m->wctx, n_tensors);

    m->embed_tokens = gf_load_tensor(&m->wctx, gf, "model.embed_tokens.weight");
    m->lm_head      = c.tie_embeddings ? m->embed_tokens : gf_load_tensor(&m->wctx, gf, "lm_head.weight");
    m->final_norm   = gf_load_tensor_f32(&m->wctx, gf, "model.norm.weight");

    for (int i = 0; i < c.n_layers; i++) {
        char prefix[64];
        snprintf(prefix, sizeof(prefix), "model.layers.%d", i);
        qwen3_load_layer(&m->wctx, gf, &m->layers[i], prefix, i);
    }

    wctx_alloc(&m->wctx, m->backend);
    gf_close(&gf);

    // Persistent graph arenas
    if (!graph_arena_init(&m->arena_prefill, QW3LM_GRAPH_NODES) ||
        !graph_arena_init(&m->arena_batch, QW3LM_GRAPH_NODES)) {
        return false;
    }

    return true;
}

// Build self-attention with KV cache write + read. The T fresh K/V rows write
// at the positions carried by kv_rows via set_rows: destinations travel as
// data, so the graph topology stays identical across decode steps and the
// captured CUDA graph replays without an update.
// x: [H, n_tokens], positions: [n_tokens], mask: [kv_len, n_tokens] or NULL,
// kv_rows: [n_tokens] i64
static struct ggml_tensor * qw3lm_build_attn(struct ggml_context * ctx,
                                             struct ggml_cgraph *  gf,
                                             const Qwen3LMConfig & c,
                                             Qwen3Layer *          ly,
                                             struct ggml_tensor *  x,
                                             struct ggml_tensor *  positions,
                                             struct ggml_tensor *  mask,
                                             struct ggml_tensor *  kv_rows,
                                             struct ggml_tensor *  cache_k,  // [D, max_seq, Nkv] f16
                                             struct ggml_tensor *  cache_v,  // [D, max_seq, Nkv] f16
                                             int                   n_kv_pad,
                                             int                   n_tokens,
                                             bool                  use_flash_attn = true,
                                             bool                  clamp_fp16     = false,
                                             const SliderSet *     sliders        = nullptr,
                                             int                   layer          = -1) {
    int D   = c.head_dim;
    int Nh  = c.n_heads;
    int Nkv = c.n_kv_heads;
    int S   = n_tokens;

    // QKV projections (fused, partial, or separate)
    struct ggml_tensor *q, *k, *v;
    int                 q_dim  = Nh * D;
    int                 kv_dim = Nkv * D;
    if (ly->qkv) {
        struct ggml_tensor * qkv = qwen3_linear(ctx, ly->qkv, x);
        q                        = ggml_cont(ctx, ggml_view_2d(ctx, qkv, q_dim, S, qkv->nb[1], 0));
        k = ggml_cont(ctx, ggml_view_2d(ctx, qkv, kv_dim, S, qkv->nb[1], (size_t) q_dim * qkv->nb[0]));
        v = ggml_cont(ctx, ggml_view_2d(ctx, qkv, kv_dim, S, qkv->nb[1], (size_t) (q_dim + kv_dim) * qkv->nb[0]));
    } else if (ly->qk) {
        struct ggml_tensor * qk = qwen3_linear(ctx, ly->qk, x);
        q                       = ggml_cont(ctx, ggml_view_2d(ctx, qk, q_dim, S, qk->nb[1], 0));
        k = ggml_cont(ctx, ggml_view_2d(ctx, qk, kv_dim, S, qk->nb[1], (size_t) q_dim * qk->nb[0]));
        v = qwen3_linear(ctx, ly->v_proj, x);
    } else {
        q = qwen3_linear(ctx, ly->q_proj, x);
        k = qwen3_linear(ctx, ly->k_proj, x);
        v = qwen3_linear(ctx, ly->v_proj, x);
    }
    if (sliders_active(sliders)) {
        q = slider_apply(ctx, sliders, layer, SLIDER_Q, x, q);
        k = slider_apply(ctx, sliders, layer, SLIDER_K, x, k);
        v = slider_apply(ctx, sliders, layer, SLIDER_V, x, v);
    }

    // Reshape to heads: [X*D, S] -> [D, X, S]
    q = ggml_reshape_3d(ctx, q, D, Nh, S);
    k = ggml_reshape_3d(ctx, k, D, Nkv, S);
    v = ggml_reshape_3d(ctx, v, D, Nkv, S);

    // QK-Norm
    q = ggml_rms_norm(ctx, q, c.rms_norm_eps);
    q = ggml_mul(ctx, q, qwen3_f32(ctx, ly->q_norm));
    k = ggml_rms_norm(ctx, k, c.rms_norm_eps);
    k = ggml_mul(ctx, k, qwen3_f32(ctx, ly->k_norm));

    // RoPE (NEOX mode=2)
    q = ggml_rope_ext(ctx, q, positions, NULL, D, 2, 0, c.rope_theta, 1.0f, 0.0f, 1.0f, 0.0f, 0.0f);
    k = ggml_rope_ext(ctx, k, positions, NULL, D, 2, 0, c.rope_theta, 1.0f, 0.0f, 1.0f, 0.0f, 0.0f);

    // Permute for flash_attn: [D, X, S] -> [D, S, X]
    q = ggml_permute(ctx, q, 0, 2, 1, 3);  // [D, S, Nh]
    k = ggml_permute(ctx, k, 0, 2, 1, 3);  // [D, S, Nkv]
    v = ggml_permute(ctx, v, 0, 2, 1, 3);  // [D, S, Nkv]

    // Make contiguous for the f16 cache write
    k = ggml_cont(ctx, k);
    v = ggml_cont(ctx, v);

    // Clamp V before F16 cast: sub-Ampere tensor cores accumulate in FP16,
    // V projection can overflow to inf which corrupts all subsequent attention
    if (clamp_fp16) {
        v = ggml_clamp(ctx, v, -65504.0f, 65504.0f);
    }

    // Write K,V to cache via set_rows: [D, S, Nkv] f32 rows convert into the
    // [D, max_seq, Nkv] f16 cache, row ids broadcast across the Nkv head dim
    size_t nb1 = cache_k->nb[1];
    size_t nb2 = cache_k->nb[2];

    ggml_build_forward_expand(gf, ggml_set_rows(ctx, cache_k, k, kv_rows));
    ggml_build_forward_expand(gf, ggml_set_rows(ctx, cache_v, v, kv_rows));

    // Read the padded [0, n_kv_pad) window from cache. The width stays
    // constant across consecutive decode steps so the CUDA graph
    // executable updates in place; the mask carries neg inf past the
    // causal context so the padded tail contributes nothing.
    struct ggml_tensor * k_full = ggml_view_3d(ctx, cache_k, D, n_kv_pad, Nkv, nb1, nb2, 0);
    struct ggml_tensor * v_full = ggml_view_3d(ctx, cache_v, D, n_kv_pad, Nkv, nb1, nb2, 0);

    // Attention (flash or F32 manual fallback)
    float                scale = 1.0f / sqrtf((float) D);
    struct ggml_tensor * attn  = use_flash_attn ? ggml_flash_attn_ext(ctx, q, k_full, v_full, mask, scale, 0.0f, 0.0f) :
                                                  qwen3_attn_f32(ctx, q, k_full, v_full, mask, scale);
    if (use_flash_attn) {
        ggml_prec_set_acc(attn, GGML_PREC_F32);
    }

    // Reshape: [D, Nh, S] -> [Nh*D, S]
    attn = ggml_reshape_2d(ctx, attn, Nh * D, S);

    // O projection
    return slider_apply(ctx, sliders, layer, SLIDER_O, attn, qwen3_linear(ctx, ly->o_proj, attn));
}

// Rows [row0, row0 + rows) of the LM head, the vocabulary window a stage
// samples from: the head is the largest matmul of a decode step and the
// logits it drops are never read
static struct ggml_tensor * qw3lm_head_rows(struct ggml_context * ctx, const Qwen3LM * m, int row0, int rows) {
    return ggml_view_2d(ctx, m->lm_head, m->cfg.hidden_size, rows, m->lm_head->nb[1],
                        (size_t) row0 * m->lm_head->nb[1]);
}

// Prefill forward: token_ids[n_tokens] -> logits[rows] of the last token, the
// LM head rows [row0, row0 + rows).
// kv_set: which KV cache set to use (0=conditional, 1=unconditional for CFG).
// Rebuilds and reallocates its graph, which invalidates the static decode graph.
static void qw3lm_forward(Qwen3LM *      m,
                          Qw3lmKvCache * kv,
                          const int *    token_ids,
                          int            n_tokens,
                          int            kv_set,
                          float *        logits,
                          int            row0,
                          int            rows) {
    if (m->batch_graph.graph.sched_allocated) {
        static_graph_release(&m->batch_graph.graph, m->sched);
        m->batch_graph.built = false;
    }

    const Qwen3LMConfig & c      = m->cfg;
    int                   H      = c.hidden_size;
    int                   kv_pos = kv->pos[kv_set];
    int                   kv_len = kv_pos + n_tokens;

    const int max_seq = kv->cfg.max_seq_len;
    if (kv_len > max_seq) {
        fprintf(stderr, "[LM-Forward] FATAL: kv_len %d > max_seq %d\n", kv_len, max_seq);
        return;
    }

    // Attention window rounded up to 256 and clamped to the cache size, the
    // window shape the decode graph reads
    const int kv_pad_raw = (int) GGML_PAD(kv_len, 256);
    const int n_kv_pad   = kv_pad_raw < max_seq ? kv_pad_raw : max_seq;

    struct ggml_context * ctx = graph_arena_begin(&m->arena_prefill);
    struct ggml_cgraph *  gf  = ggml_new_graph_custom(ctx, QW3LM_GRAPH_NODES, false);

    // Inputs
    struct ggml_tensor * positions = ggml_new_tensor_1d(ctx, GGML_TYPE_I32, n_tokens);
    ggml_set_name(positions, "positions");
    ggml_set_input(positions);

    // Causal mask over the padded window: kills the tail past the causal
    // context on every path, prefill and decode alike.
    struct ggml_tensor * mask = ggml_new_tensor_2d(ctx, GGML_TYPE_F16, n_kv_pad, n_tokens);
    ggml_set_name(mask, "causal_mask");
    ggml_set_input(mask);

    // Embedding via ggml_get_rows
    struct ggml_tensor * token_ids_t = ggml_new_tensor_1d(ctx, GGML_TYPE_I32, n_tokens);
    ggml_set_name(token_ids_t, "token_ids");
    ggml_set_input(token_ids_t);
    struct ggml_tensor * hidden = ggml_get_rows(ctx, m->embed_tokens, token_ids_t);

    // KV write positions as data: identical topology at every step, pure
    // CUDA graph replay across the decode loop.
    struct ggml_tensor * kv_rows = ggml_new_tensor_1d(ctx, GGML_TYPE_I64, n_tokens);
    ggml_set_name(kv_rows, "kv_rows");
    ggml_set_input(kv_rows);

    // Transformer layers
    for (int l = 0; l < c.n_layers; l++) {
        Qwen3Layer * ly = &m->layers[l];

        // Pre-attention norm
        struct ggml_tensor * norm = qwen3_rms_norm(ctx, hidden, ly->input_layernorm, c.rms_norm_eps);

        // Self-attention with KV cache
        struct ggml_tensor * attn =
            qw3lm_build_attn(ctx, gf, c, ly, norm, positions, mask, kv_rows, kv->k[kv_set][l], kv->v[kv_set][l],
                             n_kv_pad, n_tokens, m->use_flash_attn, m->clamp_fp16, m->sliders, l);

        // Residual
        hidden = ggml_add(ctx, hidden, attn);
        if (m->clamp_fp16) {
            hidden = ggml_clamp(ctx, hidden, -65504.0f, 65504.0f);
        }

        // Post-attention norm + MLP
        norm                     = qwen3_rms_norm(ctx, hidden, ly->post_attn_layernorm, c.rms_norm_eps);
        struct ggml_tensor * mlp = qwen3_build_mlp(ctx, ly, norm, n_tokens);
        hidden                   = ggml_add(ctx, hidden, mlp);
        if (m->clamp_fp16) {
            hidden = ggml_clamp(ctx, hidden, -65504.0f, 65504.0f);
        }
    }

    // Final norm
    hidden = qwen3_rms_norm(ctx, hidden, m->final_norm, c.rms_norm_eps);

    // Extract last token hidden state: [H, n_tokens] -> [H, 1]
    if (n_tokens > 1) {
        hidden = ggml_view_1d(ctx, hidden, H, (int64_t) (n_tokens - 1) * H * sizeof(float));
    }

    // LM head window: logits = rows^T @ hidden -> [rows, 1]
    struct ggml_tensor * lgt = ggml_mul_mat(ctx, qw3lm_head_rows(ctx, m, row0, rows), ggml_cont(ctx, hidden));
    ggml_set_name(lgt, "logits");
    ggml_set_output(lgt);
    ggml_build_forward_expand(gf, lgt);

    // Schedule + allocate
    ggml_backend_sched_reset(m->sched);
    if (!ggml_backend_sched_alloc_graph(m->sched, gf)) {
        fprintf(stderr, "[LM] FATAL: failed to allocate graph (prefill, %d tokens)\n", n_tokens);
        exit(1);
    }

    // Set token IDs
    ggml_backend_tensor_set(token_ids_t, token_ids, 0, n_tokens * sizeof(int));

    {
        std::vector<int> pos_data(n_tokens);
        for (int i = 0; i < n_tokens; i++) {
            pos_data[i] = kv_pos + i;
        }
        ggml_backend_tensor_set(positions, pos_data.data(), 0, n_tokens * sizeof(int));

        std::vector<int64_t> rows_data(n_tokens);
        for (int i = 0; i < n_tokens; i++) {
            rows_data[i] = (int64_t) (kv_pos + i);
        }
        ggml_backend_tensor_set(kv_rows, rows_data.data(), 0, n_tokens * sizeof(int64_t));
    }

    {
        // Causal mask: [n_kv_pad, n_tokens]
        // Row i (query at position kv_pos+i) attends columns [0..kv_pos+i],
        // everything past that carries neg inf, padded tail included.
        std::vector<uint16_t> mask_data((size_t) n_kv_pad * n_tokens);
        for (int i = 0; i < n_tokens; i++) {
            int query_abs_pos = kv_pos + i;
            for (int j = 0; j < n_kv_pad; j++) {
                float v                              = (j <= query_abs_pos) ? 0.0f : -INFINITY;
                mask_data[(size_t) i * n_kv_pad + j] = ggml_fp32_to_fp16(v);
            }
        }
        ggml_backend_tensor_set(mask, mask_data.data(), 0, (size_t) n_kv_pad * n_tokens * sizeof(uint16_t));
    }

    // Compute
    ggml_backend_sched_graph_compute(m->sched, gf);

    // Read logits [rows]
    ggml_backend_tensor_get(lgt, logits, 0, (size_t) rows * sizeof(float));

    // Advance KV position. The arena and the sched allocation persist
    // into the next forward.
    kv->pos[kv_set] += n_tokens;
}

// Decode forward: N tokens (1 per sequence), batched weight matmuls, the one
// decode path of every sequence count including N=1. The static graph replays
// across the token loop.
// kv_pos per element from kv->pos[kv_sets[i]], supports different prompt lengths.
// kv_sets[N]: which KV set each token uses, always consecutive from kv_sets[0].
// logits: [N * rows] output, N logit vectors of the LM head rows
// [row0, row0 + rows) concatenated.
static void qw3lm_forward_batch(Qwen3LM *      m,
                                Qw3lmKvCache * kv,
                                const int *    token_ids,
                                const int *    kv_sets,
                                int            N,
                                float *        logits,
                                int            row0,
                                int            rows) {
    const Qwen3LMConfig & c   = m->cfg;
    int                   D   = c.head_dim;
    int                   Nh  = c.n_heads;
    int                   Nkv = c.n_kv_heads;

    // Per-element kv_pos (supports different prompt lengths)
    int max_kv_len = 0;
    for (int i = 0; i < N; i++) {
        int kl = kv->pos[kv_sets[i]] + 1;
        if (kl > max_kv_len) {
            max_kv_len = kl;
        }
        if (kl > kv->cfg.max_seq_len) {
            fprintf(stderr, "[LM-Batch] FATAL: kv_len %d > max_seq %d (set %d)\n", kl, kv->cfg.max_seq_len, kv_sets[i]);
            exit(1);
        }
    }

    // Attention window rounded up to 256 and clamped to the cache size:
    // fixed shapes over spans of 256 decode steps keep the CUDA graph
    // executable updatable in place.
    const int kv_pad_raw = (int) GGML_PAD(max_kv_len, 256);
    const int n_kv_pad   = kv_pad_raw < kv->cfg.max_seq_len ? kv_pad_raw : kv->cfg.max_seq_len;

    // Persistent arena: stable node addresses across decode steps.
    struct ggml_cgraph * gf          = nullptr;
    struct ggml_tensor * token_ids_t = nullptr;
    struct ggml_tensor * positions   = nullptr;
    struct ggml_tensor * attn_mask   = nullptr;
    struct ggml_tensor * kv_rows     = nullptr;
    struct ggml_tensor * lgt         = nullptr;

    const int  s0         = kv_sets[0];
    const bool need_build = !m->batch_graph.built || m->batch_graph.key_n_kv_pad != n_kv_pad ||
                            m->batch_graph.key_N != N || m->batch_graph.key_s0 != s0 ||
                            m->batch_graph.key_row0 != row0 || m->batch_graph.key_rows != rows ||
                            m->batch_graph.key_kv != kv->k4[0] || m->batch_graph.key_sliders != m->sliders;
    if (need_build) {
        static_graph_release(&m->batch_graph.graph, m->sched);
        m->batch_graph.built      = false;
        struct ggml_context * ctx = graph_arena_begin(&m->arena_batch);
        gf                        = ggml_new_graph_custom(ctx, QW3LM_GRAPH_NODES, false);

        // Embedding via ggml_get_rows
        token_ids_t = ggml_new_tensor_1d(ctx, GGML_TYPE_I32, N);
        ggml_set_name(token_ids_t, "token_ids");
        ggml_set_input(token_ids_t);

        // Positions: [N], per-element kv_pos
        positions = ggml_new_tensor_1d(ctx, GGML_TYPE_I32, N);
        ggml_set_name(positions, "positions");
        ggml_set_input(positions);

        // Batched attention mask: [n_kv_pad, 1, 1, N] f16
        // Per-element: 0 for valid KV positions, neg inf past elem kv_len,
        // padded tail included
        attn_mask = ggml_new_tensor_4d(ctx, GGML_TYPE_F16, n_kv_pad, 1, 1, N);
        ggml_set_name(attn_mask, "attn_mask");
        ggml_set_input(attn_mask);

        // Per-element KV write positions as data: one row per set, broadcast
        // across the Nkv head dim. Identical topology at every step, pure CUDA
        // graph replay across the batched decode loop.
        kv_rows = ggml_new_tensor_3d(ctx, GGML_TYPE_I64, 1, 1, N);
        ggml_set_name(kv_rows, "kv_rows");
        ggml_set_input(kv_rows);

        struct ggml_tensor * hidden = ggml_get_rows(ctx, m->embed_tokens, token_ids_t);

        for (int l = 0; l < c.n_layers; l++) {
            Qwen3Layer * ly = &m->layers[l];

            // Pre-attention norm [H, N]
            struct ggml_tensor * norm = qwen3_rms_norm(ctx, hidden, ly->input_layernorm, c.rms_norm_eps);

            // Batched QKV projections (fused, partial, or separate)
            struct ggml_tensor *q, *k, *v;
            int                 q_dim  = Nh * D;
            int                 kv_dim = Nkv * D;
            if (ly->qkv) {
                struct ggml_tensor * qkv = qwen3_linear(ctx, ly->qkv, norm);
                q                        = ggml_cont(ctx, ggml_view_2d(ctx, qkv, q_dim, N, qkv->nb[1], 0));
                k = ggml_cont(ctx, ggml_view_2d(ctx, qkv, kv_dim, N, qkv->nb[1], (size_t) q_dim * qkv->nb[0]));
                v = ggml_cont(ctx,
                              ggml_view_2d(ctx, qkv, kv_dim, N, qkv->nb[1], (size_t) (q_dim + kv_dim) * qkv->nb[0]));
            } else if (ly->qk) {
                struct ggml_tensor * qk = qwen3_linear(ctx, ly->qk, norm);
                q                       = ggml_cont(ctx, ggml_view_2d(ctx, qk, q_dim, N, qk->nb[1], 0));
                k = ggml_cont(ctx, ggml_view_2d(ctx, qk, kv_dim, N, qk->nb[1], (size_t) q_dim * qk->nb[0]));
                v = qwen3_linear(ctx, ly->v_proj, norm);
            } else {
                q = qwen3_linear(ctx, ly->q_proj, norm);
                k = qwen3_linear(ctx, ly->k_proj, norm);
                v = qwen3_linear(ctx, ly->v_proj, norm);
            }
            if (sliders_active(m->sliders)) {
                q = slider_apply(ctx, m->sliders, l, SLIDER_Q, norm, q);
                k = slider_apply(ctx, m->sliders, l, SLIDER_K, norm, k);
                v = slider_apply(ctx, m->sliders, l, SLIDER_V, norm, v);
            }

            // Reshape to heads: [D, Heads, N]
            q = ggml_reshape_3d(ctx, q, D, Nh, N);
            k = ggml_reshape_3d(ctx, k, D, Nkv, N);
            v = ggml_reshape_3d(ctx, v, D, Nkv, N);

            // QK-Norm (rms_norm on dim0=D, per head per seq)
            q = ggml_rms_norm(ctx, q, c.rms_norm_eps);
            q = ggml_mul(ctx, q, qwen3_f32(ctx, ly->q_norm));
            k = ggml_rms_norm(ctx, k, c.rms_norm_eps);
            k = ggml_mul(ctx, k, qwen3_f32(ctx, ly->k_norm));

            // RoPE: positions [N] maps to dim 2 of [D, Heads, N]
            q = ggml_rope_ext(ctx, q, positions, NULL, D, 2, 0, c.rope_theta, 1.0f, 0.0f, 1.0f, 0.0f, 0.0f);
            k = ggml_rope_ext(ctx, k, positions, NULL, D, 2, 0, c.rope_theta, 1.0f, 0.0f, 1.0f, 0.0f, 0.0f);

            // Contiguous for clean slicing
            q = ggml_cont(ctx, q);
            k = ggml_cont(ctx, k);
            v = ggml_cont(ctx, v);

            // Clamp V before F16 cast (sub-Ampere FP16 accumulation overflow)
            if (m->clamp_fp16) {
                v = ggml_clamp(ctx, v, -65504.0f, 65504.0f);
            }

            // Batched attention with 4D KV cache
            float scale = 1.0f / sqrtf((float) D);

            // Write new K,V to the 4D cache via set_rows over the N consecutive
            // sets: dst views the [D, max_seq, Nkv, N] slice starting at s0, src
            // reshapes the fresh [D, Nkv, N] to [D, 1, Nkv, N] (same layout), and
            // kv_rows [1, 1, N] carries one destination row per set, broadcast
            // across Nkv.
            // sets are always consecutive: [s0, s0+1, ..., s0+N-1]
            size_t off_s0 = (size_t) s0 * kv->k4[l]->nb[3];

            struct ggml_tensor * k_sets = ggml_view_4d(ctx, kv->k4[l], D, kv->cfg.max_seq_len, Nkv, N, kv->k4[l]->nb[1],
                                                       kv->k4[l]->nb[2], kv->k4[l]->nb[3], off_s0);
            struct ggml_tensor * v_sets = ggml_view_4d(ctx, kv->v4[l], D, kv->cfg.max_seq_len, Nkv, N, kv->v4[l]->nb[1],
                                                       kv->v4[l]->nb[2], kv->v4[l]->nb[3], off_s0);

            struct ggml_tensor * k_new = ggml_reshape_4d(ctx, k, D, 1, Nkv, N);
            struct ggml_tensor * v_new = ggml_reshape_4d(ctx, v, D, 1, Nkv, N);

            ggml_build_forward_expand(gf, ggml_set_rows(ctx, k_sets, k_new, kv_rows));
            ggml_build_forward_expand(gf, ggml_set_rows(ctx, v_sets, v_new, kv_rows));

            // Q: [D, Nh, N] -> [D, 1, Nh, N] (n_batch=1, ne3=N for batched flash_attn)
            struct ggml_tensor * q4 = ggml_reshape_4d(ctx, q, D, 1, Nh, N);

            // Batched KV read: [D, n_kv_pad, Nkv, N] view of 4D cache
            struct ggml_tensor * k_batch = ggml_view_4d(ctx, kv->k4[l], D, n_kv_pad, Nkv, N, kv->k4[l]->nb[1],
                                                        kv->k4[l]->nb[2], kv->k4[l]->nb[3], off_s0);
            struct ggml_tensor * v_batch = ggml_view_4d(ctx, kv->v4[l], D, n_kv_pad, Nkv, N, kv->v4[l]->nb[1],
                                                        kv->v4[l]->nb[2], kv->v4[l]->nb[3], off_s0);

            // Batched attention (flash or F32 manual fallback)
            struct ggml_tensor * attn_result =
                m->use_flash_attn ? ggml_flash_attn_ext(ctx, q4, k_batch, v_batch, attn_mask, scale, 0.0f, 0.0f) :
                                    qwen3_attn_f32(ctx, q4, k_batch, v_batch, attn_mask, scale);
            if (m->use_flash_attn) {
                ggml_prec_set_acc(attn_result, GGML_PREC_F32);
            }

            // Output: [D, Nh, 1, N] -> [Nh*D, N]
            struct ggml_tensor * attn_cat = ggml_reshape_2d(ctx, attn_result, Nh * D, N);

            // Batched O proj
            struct ggml_tensor * attn_out =
                slider_apply(ctx, m->sliders, l, SLIDER_O, attn_cat, qwen3_linear(ctx, ly->o_proj, attn_cat));
            hidden                        = ggml_add(ctx, hidden, attn_out);
            if (m->clamp_fp16) {
                hidden = ggml_clamp(ctx, hidden, -65504.0f, 65504.0f);
            }

            // Batched FFN
            norm                     = qwen3_rms_norm(ctx, hidden, ly->post_attn_layernorm, c.rms_norm_eps);
            struct ggml_tensor * mlp = qwen3_build_mlp(ctx, ly, norm, N);
            hidden                   = ggml_add(ctx, hidden, mlp);
            if (m->clamp_fp16) {
                hidden = ggml_clamp(ctx, hidden, -65504.0f, 65504.0f);
            }
        }

        // Final norm + LM head
        hidden = qwen3_rms_norm(ctx, hidden, m->final_norm, c.rms_norm_eps);
        lgt    = ggml_mul_mat(ctx, qw3lm_head_rows(ctx, m, row0, rows), hidden);  // [rows, N]
        ggml_set_name(lgt, "logits");
        ggml_set_output(lgt);
        ggml_build_forward_expand(gf, lgt);

        if (!static_graph_alloc(&m->batch_graph.graph, m->backend, m->sched, gf)) {
            fprintf(stderr, "[LM] FATAL: failed to allocate graph (batch decode, N=%d)\n", N);
            exit(1);
        }

        m->batch_graph.gf           = gf;
        m->batch_graph.token_ids_t  = token_ids_t;
        m->batch_graph.positions    = positions;
        m->batch_graph.kv_rows      = kv_rows;
        m->batch_graph.attn_mask    = attn_mask;
        m->batch_graph.lgt          = lgt;
        m->batch_graph.key_n_kv_pad = n_kv_pad;
        m->batch_graph.key_N        = N;
        m->batch_graph.key_s0       = s0;
        m->batch_graph.key_row0     = row0;
        m->batch_graph.key_rows     = rows;
        m->batch_graph.key_kv       = kv->k4[0];
        m->batch_graph.key_sliders  = m->sliders;
        m->batch_graph.pos_data.resize((size_t) N);
        m->batch_graph.rows_data.resize((size_t) N);
        m->batch_graph.mask_data.resize((size_t) n_kv_pad * (size_t) N);
        m->batch_graph.built = true;
    } else {
        gf          = m->batch_graph.gf;
        token_ids_t = m->batch_graph.token_ids_t;
        positions   = m->batch_graph.positions;
        kv_rows     = m->batch_graph.kv_rows;
        attn_mask   = m->batch_graph.attn_mask;
        lgt         = m->batch_graph.lgt;
    }

    // Set token IDs
    ggml_backend_tensor_set(token_ids_t, token_ids, 0, N * sizeof(int));

    for (int i = 0; i < N; i++) {
        m->batch_graph.pos_data[(size_t) i]  = kv->pos[kv_sets[i]];
        m->batch_graph.rows_data[(size_t) i] = (int64_t) kv->pos[kv_sets[i]];
    }
    ggml_backend_tensor_set(positions, m->batch_graph.pos_data.data(), 0, (size_t) N * sizeof(int));
    ggml_backend_tensor_set(kv_rows, m->batch_graph.rows_data.data(), 0, (size_t) N * sizeof(int64_t));

    // Attention mask: [n_kv_pad, 1, 1, N] f16
    // 0.0 for valid KV positions, neg inf past each element's kv_len,
    // padded tail included
    for (int i = 0; i < N; i++) {
        int kvl = kv->pos[kv_sets[i]] + 1;
        for (int j = 0; j < n_kv_pad; j++) {
            m->batch_graph.mask_data[(size_t) i * (size_t) n_kv_pad + (size_t) j] =
                ggml_fp32_to_fp16((j < kvl) ? 0.0f : -INFINITY);
        }
    }
    ggml_backend_tensor_set(attn_mask, m->batch_graph.mask_data.data(), 0,
                            m->batch_graph.mask_data.size() * sizeof(uint16_t));
    static_graph_compute(&m->batch_graph.graph, m->backend, m->sched, gf);

    // Read logits [rows, N]
    ggml_backend_tensor_get(lgt, logits, 0, (size_t) rows * N * sizeof(float));

    // Advance all KV positions. The arena and the sched allocation
    // persist into the next forward.
    for (int i = 0; i < N; i++) {
        kv->pos[kv_sets[i]]++;
    }
}

// Free all resources
// Local addition: attach (or with NULL, detach) the sliders. The static decode
// graph bakes them in, so a change drops it and the next step rebuilds.
static void qw3lm_set_sliders(Qwen3LM * m, const SliderSet * sliders) {
    const SliderSet * next = sliders_active(sliders) ? sliders : nullptr;
    if (m->sliders == next) {
        return;
    }
    if (m->batch_graph.graph.sched_allocated) {
        static_graph_release(&m->batch_graph.graph, m->sched);
    }
    m->batch_graph.built = false;
    m->sliders           = next;
}

static void qw3lm_free(Qwen3LM * m) {
    static_graph_release(&m->batch_graph.graph, m->sched);
    graph_arena_free(&m->arena_batch);
    graph_arena_free(&m->arena_prefill);
    if (m->sched) {
        ggml_backend_sched_free(m->sched);
    }
    backend_release(m->backend, m->cpu_backend);
    wctx_free(&m->wctx);
    *m = {};
}
