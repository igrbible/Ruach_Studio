#pragma once
// lora-rt.h: LoRA adapters applied while the graph runs, not merged into the weights (local addition, HERESY 1447)
//
// Viktor 14.10.2026: «LoRA ересь и алхимия»; 15.10.2026: «И не забудь за динамичную волну, именно ту, что ты воплотил в
// слайдерах стилей». An adapter's strength runs through the song on the sliders' own wave (HERESY 1166: points, an eased
// half cosine between them), and adapters that touch the same layers share one budget. For a projection input x:
//
//   y = W x + sum_i g_i * B_i (A_i x)
//
// A_i [rank, in] and B_i [out, rank] (scaled by alpha / rank) in F32 on the model's own backend; g_i a one-float tensor
// set before each step: the adapter's strength x its wave at that point of the song x its group's share of the budget.
// The music half (AR) moves g at every token it writes, as the sliders do (a prefill reads one value: the prompt the
// adapter's own strength, the plan of the whole song being written there; a chunk read again the wave at its middle).
// The sound half (NAR) solves a chunk of the song at once, most often the whole song, so its g is a row of gains, one a
// frame ([1, N], broadcast over the outputs and the variations), set before each chunk.
//
// Only an adapter with a wave or in a budget takes this path; any other is merged at load as before (lora.h), so what
// worked stays as it was. Full deltas cannot run as A and B (.diff, the replaced llm2vae / vae2llm / time embedder of
// the realaudio adapters): an adapter's full deltas are merged at its flat strength while its A and B ride the wave (lora.h
// LoraSet::lora_skip), and the log says so. The base weights stay as they are on this path, quantized ones included (no
// re-quantizing to Q8_0, as a merge into Q6_K or Q5_K must).
//
// Measured 15.10.2026 on GPU2 (BF16, steps-from-hell's AR adapter, greedy sampling): merged and on the graph agree token
// for token over all 600 frames at 0.75 and over 89 at 0.8, where a near tie turns (0.75 against 0.8 merged part at 18);
// the sound half (realaudio v9's A and B at 0.6, one take's tokens replayed): latents 0.54 % apart, 41 % from none.

#include "ggml-backend.h"
#include "ggml.h"
#include "lora.h"
#include "qwen3-enc.h"  // Qwen3Layer, qwen3_linear
#include "sliders.h"    // slider_curve_at: the same wave
#include "weight-ctx.h"

#include <cmath>
#include <memory>
#include <string>
#include <utility>
#include <vector>

#define LORA_RT_MAX_LAYERS 64

enum LoraRtProj { LRT_Q = 0, LRT_K, LRT_V, LRT_O, LRT_GATE, LRT_UP, LRT_DOWN, LRT_N };

static const char * const LORA_RT_PROJ[2][LRT_N] = {
    { "self_attn.q_proj", "self_attn.k_proj", "self_attn.v_proj", "self_attn.o_proj", "mlp.gate_proj", "mlp.up_proj",
      "mlp.down_proj" },
    { "nar_self_attn.q_proj", "nar_self_attn.k_proj", "nar_self_attn.v_proj", "nar_self_attn.o_proj", "nar_mlp.gate_proj",
      "nar_mlp.up_proj", "nar_mlp.down_proj" },
};

struct LoraRtPair {
    int                  adapter = 0;
    struct ggml_tensor * a       = nullptr;  // ggml [in, rank]: A's rows
    struct ggml_tensor * b       = nullptr;  // ggml [rank, out]: B, scaled by alpha / rank
};

struct LoraRtAdapter {
    std::string                          id;
    float                                strength = 0.0f;  // this half's, 0..2
    std::vector<std::pair<float, float>> curve;            // its wave; empty: flat
    int                                  group    = -1;    // its budget group, -1: none
    struct ggml_tensor *                 gain_t   = nullptr;
    struct ggml_tensor *                 frame_t  = nullptr;  // the sound half's gains frame by frame, [1, max_frames]
    mutable float                        gain_now = 0.0f;
};

// A budget: the strengths of its members at a point of the song add up to `cap` at most. share (A): over the cap, each
// gives way in proportion; order (B): the first member in the request's order takes what it asks, the next what is left
struct LoraRtGroup {
    float cap  = 2.0f;
    int   mode = 0;  // 0 share, 1 order
};

// One adapter of the run on this path, as the pipeline hands it over
struct LoraRtChoice {
    std::string                          path, id;
    float                                strength = 0.0f;  // this half's
    std::vector<std::pair<float, float>> curve;
    int                                  group = -1;
};

struct LoraRtSet {
    int                        half = 0;
    std::vector<LoraRtAdapter> adapters;
    std::vector<LoraRtGroup>   groups;
    std::vector<LoraRtPair>    pairs[LORA_RT_MAX_LAYERS][LRT_N];
    WeightCtx                  wctx      = {};
    bool                       allocated = false;
    const void *               owner     = nullptr;  // the model it was built for: another one (reloaded) builds it anew
    const void *               owner_buf = nullptr;  // and its weights' buffer at that time
    unsigned                   gen       = 0;        // which build: the decode graph is keyed by it, the set's address being one
    int                        kept      = 0;        // frames kept before the stage (regenerate from here): the wave counts them
    int                        max_frames = 0;       // the sound half's row of gains
    mutable float              t_now     = -1.0f;
};

inline unsigned g_lora_rt_gen = 0;

static bool lora_rt_active(const LoraRtSet * s) {
    return s && s->allocated && !s->adapters.empty();
}

static void lora_rt_free(LoraRtSet * set) {
    if (set->allocated) {
        wctx_free(&set->wctx);
    }
    set->wctx = {};
    set->adapters.clear();
    set->groups.clear();
    for (auto & layer : set->pairs) {
        for (auto & v : layer) {
            v.clear();
        }
    }
    set->allocated  = false;
    set->owner      = nullptr;
    set->owner_buf  = nullptr;
    set->kept       = 0;
    set->max_frames = 0;
    set->t_now      = -1.0f;
}

// The effective strength of every adapter at t (0..1 of the song): its strength x its wave, then each budget; t < 0:
// the wave left flat (the adapter's own strength), the budgets still kept
static void lora_rt_strengths(const LoraRtSet * set, float t, std::vector<float> * out) {
    const size_t n = set->adapters.size();
    out->assign(n, 0.0f);
    for (size_t i = 0; i < n; i++) {
        const LoraRtAdapter & a = set->adapters[i];
        (*out)[i]               = a.strength * (t < 0.0f ? 1.0f : slider_curve_at(a.curve, t));
    }
    for (size_t g = 0; g < set->groups.size(); g++) {
        const LoraRtGroup & G = set->groups[g];
        if (G.mode == 1) {  // order: served in the request's order
            float left = G.cap;
            for (size_t i = 0; i < n; i++) {
                if (set->adapters[i].group != (int) g) {
                    continue;
                }
                float take = (*out)[i] < left ? (*out)[i] : (left > 0.0f ? left : 0.0f);
                (*out)[i]  = take;
                left -= take;
            }
        } else {  // share: over the cap, each in proportion
            float sum = 0.0f;
            for (size_t i = 0; i < n; i++) {
                if (set->adapters[i].group == (int) g) {
                    sum += (*out)[i];
                }
            }
            if (sum > G.cap && sum > 0.0f) {
                const float k = G.cap / sum;
                for (size_t i = 0; i < n; i++) {
                    if (set->adapters[i].group == (int) g) {
                        (*out)[i] *= k;
                    }
                }
            }
        }
    }
}

// Upload the gains at t when they moved (force: all of them); the log says where each stands when asked
static void lora_rt_at(const LoraRtSet * set, float t, bool force = false, const char * say = nullptr) {
    if (!lora_rt_active(set)) {
        return;
    }
    t = t < 0.0f ? -1.0f : (t > 1.0f ? 1.0f : t);
    std::vector<float> g;
    lora_rt_strengths(set, t, &g);
    for (size_t i = 0; i < set->adapters.size(); i++) {
        const LoraRtAdapter & a = set->adapters[i];
        if (force || fabsf(g[i] - a.gain_now) > 1e-4f * (fabsf(a.strength) + 1e-3f)) {
            ggml_backend_tensor_set(a.gain_t, &g[i], 0, sizeof(float));
            a.gain_now = g[i];
        }
    }
    set->t_now = t;
    if (say) {
        std::string line;
        for (const LoraRtAdapter & a : set->adapters) {
            char part[200];
            snprintf(part, sizeof(part), "%s%s %.2f", line.empty() ? "" : ", ", a.id.c_str(), (double) a.gain_now);
            line += part;
        }
        if (t < 0.0f) {
            fprintf(stderr, "[LoRA] %s: %s\n", say, line.c_str());
        } else {
            fprintf(stderr, "[LoRA] %s %.0f%%: %s\n", say, (double) (t * 100.0f), line.c_str());
        }
    }
}

// The sound half's gains for a chunk: frames [start, start + frames) of a song whose wave spans `span` frames, one gain a
// frame (the block's start and end rows take their neighbours'); the log says the chunk's middle
static void lora_rt_frames(const LoraRtSet * set, int start, int frames, int span, bool say = true) {
    if (!lora_rt_active(set) || set->max_frames <= 0) {
        return;
    }
    const int N = frames + 2;
    if (N > set->max_frames) {
        fprintf(stderr, "[LoRA] FATAL: a chunk of %d frames past the %d the sound half's gains hold\n", frames, set->max_frames);
        return;
    }
    const float                     sp = span > 0 ? (float) span : (float) (start + frames);
    const size_t                    n  = set->adapters.size();
    std::vector<std::vector<float>> rows(n, std::vector<float>((size_t) N));
    std::vector<float>              g;
    for (int k = 0; k < N; k++) {  // one budget a frame, for every adapter at once
        int   f = k == 0 ? 0 : (k == N - 1 ? frames - 1 : k - 1);
        float t = ((float) (start + f) + 0.5f) / sp;
        lora_rt_strengths(set, t > 1.0f ? 1.0f : t, &g);
        for (size_t i = 0; i < n; i++) {
            rows[i][(size_t) k] = g[i];
        }
    }
    for (size_t i = 0; i < n; i++) {
        ggml_backend_tensor_set(set->adapters[i].frame_t, rows[i].data(), 0, (size_t) N * sizeof(float));
    }
    float mid = ((float) start + 0.5f * (float) frames) / sp;
    lora_rt_at(set, mid > 1.0f ? 1.0f : mid, true, say ? "the sound half's chunk, at its middle" : nullptr);
}

// The music half's gains at a step of the music, t = (kept + step) / (kept + budget), as the sliders count it
static void lora_rt_progress(const LoraRtSet * set, int step, int budget) {
    if (!lora_rt_active(set)) {
        return;
    }
    const float span = (float) (set->kept + budget);
    float       t    = span > 0.0f ? (float) (set->kept + step) / span : 0.0f;
    lora_rt_at(set, t, false, nullptr);   // without a word as it goes (Viktor 15.10.2026: «К хуям убери этот лог арки»)
}

// Build the set for one half on the model's backend. `src` holds the run's adapters on this path, opened at strength 1
// and bound to the model's shapes (lora_bind); `choices` names them in the same order with this half's strength, wave
// and group. False with the reason.
static bool lora_rt_load(LoraRtSet *                       set,
                         ggml_backend_t                    backend,
                         LoraSet *                         src,
                         const std::vector<LoraRtChoice> & choices,
                         const std::vector<LoraRtGroup> &  groups,
                         int                               half,
                         int                               n_layers,
                         const void *                      owner,
                         int                               max_frames,
                         std::string *                     error) {
    lora_rt_free(set);
    set->half   = half;
    set->groups = groups;
    if (n_layers > LORA_RT_MAX_LAYERS) {
        *error = "the model has more layers than the LoRA path holds";
        return false;
    }
    // which file is which adapter (src->files in the order of `choices`)
    std::vector<int> file_adapter(src->files.size(), -1);
    for (size_t f = 0; f < src->files.size() && f < choices.size(); f++) {
        if (choices[f].strength == 0.0f) {
            continue;
        }
        LoraRtAdapter a;
        a.id       = choices[f].id;
        a.strength = choices[f].strength;
        a.curve    = choices[f].curve;
        a.group    = choices[f].group >= 0 && choices[f].group < (int) groups.size() ? choices[f].group : -1;
        file_adapter[f] = (int) set->adapters.size();
        set->adapters.push_back(a);
    }
    if (set->adapters.empty()) {
        return true;
    }
    auto adapter_of = [&](const LoraFile * lf) -> int {
        for (size_t f = 0; f < src->files.size(); f++) {
            if (src->files[f].get() == lf) {
                return file_adapter[f];
            }
        }
        return -1;
    };
    // count first: the context holds every tensor's header
    set->max_frames = half == 1 ? max_frames : 0;
    int n_tensors   = (int) set->adapters.size() * (half == 1 ? 2 : 1);
    for (int l = 0; l < n_layers; l++) {
        for (int p = 0; p < LRT_N; p++) {
            auto it = src->index.find("model.layers." + std::to_string(l) + "." + LORA_RT_PROJ[half][p] + ".weight");
            if (it != src->index.end()) {
                n_tensors += 2 * (int) it->second.size();
            }
        }
    }
    wctx_init(&set->wctx, n_tensors);
    for (size_t i = 0; i < set->adapters.size(); i++) {
        LoraRtAdapter & a = set->adapters[i];
        a.gain_t          = ggml_new_tensor_1d(set->wctx.ctx, GGML_TYPE_F32, 1);
        ggml_set_name(a.gain_t, ("lrt.gain." + std::to_string(half) + "." + std::to_string(i)).c_str());
        auto g0    = std::make_unique<float[]>(1);
        g0[0]      = 0.0f;
        a.gain_now = 0.0f;
        set->wctx.pending.push_back({ a.gain_t, g0.get(), sizeof(float), 0 });
        set->wctx.staging.push_back(std::move(g0));
        if (half == 1 && max_frames > 0) {  // the sound half's row of gains, filled for each chunk
            a.frame_t = ggml_new_tensor_2d(set->wctx.ctx, GGML_TYPE_F32, 1, max_frames);
            ggml_set_name(a.frame_t, ("lrt.frames." + std::to_string(i)).c_str());
        }
    }
    size_t bytes = 0, pairs = 0;
    for (int l = 0; l < n_layers; l++) {
        for (int p = 0; p < LRT_N; p++) {
            const std::string name = "model.layers." + std::to_string(l) + "." + LORA_RT_PROJ[half][p] + ".weight";
            auto              it   = src->index.find(name);
            if (it == src->index.end()) {
                continue;
            }
            int64_t rows = it->second.front().rows, cols = it->second.front().group->in;
            std::vector<LoraPrepared> ps;
            if (!lora_prepare(src, name, rows, cols, &ps, error)) {
                wctx_free(&set->wctx);
                set->wctx = {};
                set->adapters.clear();
                return false;
            }
            for (size_t i = 0; i < ps.size() && i < it->second.size(); i++) {
                const LoraContribution & c = it->second[i];
                const int                k = adapter_of(c.file);
                if (k < 0 || ps[i].kind != LoraGroup::LORA || ps[i].rank <= 0) {
                    continue;
                }
                const int64_t rank = ps[i].rank, in = c.group->in;
                LoraRtPair    pr;
                pr.adapter = k;
                pr.a       = ggml_new_tensor_2d(set->wctx.ctx, GGML_TYPE_F32, in, rank);
                pr.b       = ggml_new_tensor_2d(set->wctx.ctx, GGML_TYPE_F32, rank, c.rows);
                auto abuf  = std::make_unique<float[]>((size_t) (in * rank));
                auto bbuf  = std::make_unique<float[]>((size_t) (rank * c.rows));
                memcpy(abuf.get(), ps[i].a.data(), (size_t) (in * rank) * sizeof(float));
                memcpy(bbuf.get(), ps[i].b.data(), (size_t) (rank * c.rows) * sizeof(float));
                set->wctx.pending.push_back({ pr.a, abuf.get(), (size_t) (in * rank) * sizeof(float), 0 });
                set->wctx.pending.push_back({ pr.b, bbuf.get(), (size_t) (rank * c.rows) * sizeof(float), 0 });
                set->wctx.staging.push_back(std::move(abuf));
                set->wctx.staging.push_back(std::move(bbuf));
                bytes += (size_t) (in * rank + rank * c.rows) * sizeof(float);
                set->pairs[l][p].push_back(pr);
                pairs++;
            }
        }
    }
    if (!wctx_alloc(&set->wctx, backend)) {
        *error = "no GPU memory for the LoRAs on the run's path";
        set->wctx = {};
        set->adapters.clear();
        return false;
    }
    set->allocated = true;
    set->owner     = owner;
    set->gen       = ++g_lora_rt_gen;
    lora_rt_at(set, -1.0f, true);
    if (half == 1) {
        lora_rt_frames(set, 0, max_frames - 2, max_frames - 2, false);
    }
    for (const LoraRtAdapter & a : set->adapters) {
        if (a.curve.empty()) {
            fprintf(stderr, "[LoRA] %s on the %s half while it runs at %.2f%s\n", a.id.c_str(), half ? "sound" : "music",
                    (double) a.strength, a.group >= 0 ? ", in a budget" : "");
        } else {
            fprintf(stderr, "[LoRA] %s on the %s half while it runs at %.2f, its wave %.2f %.2f %.2f %.2f %.2f%s\n",
                    a.id.c_str(), half ? "sound" : "music", (double) a.strength, (double) slider_curve_at(a.curve, 0.0f),
                    (double) slider_curve_at(a.curve, 0.25f), (double) slider_curve_at(a.curve, 0.5f),
                    (double) slider_curve_at(a.curve, 0.75f), (double) slider_curve_at(a.curve, 1.0f),
                    a.group >= 0 ? ", in a budget" : "");
        }
    }
    for (size_t g = 0; g < set->groups.size(); g++) {
        fprintf(stderr, "[LoRA] budget %zu on the %s half: %.2f at most, %s\n", g, half ? "sound" : "music",
                (double) set->groups[g].cap, set->groups[g].mode == 1 ? "in order" : "shared in proportion");
    }
    fprintf(stderr, "[LoRA] %zu projections, %.1f MB on the run's path\n", pairs, (double) bytes / (1024.0 * 1024.0));
    return true;
}

// The summed correction of every adapter for one projection, or NULL; x: the projection input, [in, ...]
static struct ggml_tensor * lora_rt_delta(struct ggml_context * ctx,
                                          const LoraRtSet *     set,
                                          int                   layer,
                                          int                   proj,
                                          struct ggml_tensor *  x) {
    if (!lora_rt_active(set) || layer < 0 || layer >= LORA_RT_MAX_LAYERS) {
        return nullptr;
    }
    const std::vector<LoraRtPair> & ps = set->pairs[layer][proj];
    if (ps.empty()) {
        return nullptr;
    }
    struct ggml_tensor * xf    = x->type == GGML_TYPE_F32 ? x : ggml_cast(ctx, x, GGML_TYPE_F32);
    struct ggml_tensor * total = nullptr;
    for (const LoraRtPair & p : ps) {
        const LoraRtAdapter & a = set->adapters[(size_t) p.adapter];
        struct ggml_tensor *  d = ggml_mul_mat(ctx, p.b, ggml_mul_mat(ctx, p.a, xf));  // [out, ...]
        if (a.frame_t && x->ne[1] <= a.frame_t->ne[1]) {  // the sound half: [out, N, M] x the chunk's gains [1, N]
            d = ggml_mul(ctx, d, ggml_view_2d(ctx, a.frame_t, 1, x->ne[1], a.frame_t->nb[1], 0));
        } else {
            d = ggml_mul(ctx, d, a.gain_t);
        }
        total = total ? ggml_add(ctx, total, d) : d;
    }
    return total;
}

// y + the correction, or y unchanged
static struct ggml_tensor * lora_rt_apply(struct ggml_context * ctx,
                                          const LoraRtSet *     set,
                                          int                   layer,
                                          int                   proj,
                                          struct ggml_tensor *  x,
                                          struct ggml_tensor *  y) {
    struct ggml_tensor * d = lora_rt_delta(ctx, set, layer, proj, x);
    return d ? ggml_add(ctx, y, d) : y;
}

// Does the set touch the MLP of this layer (the split swiglu is taken only then)?
static bool lora_rt_touches_mlp(const LoraRtSet * set, int layer) {
    return lora_rt_active(set) && layer >= 0 && layer < LORA_RT_MAX_LAYERS &&
           (!set->pairs[layer][LRT_GATE].empty() || !set->pairs[layer][LRT_UP].empty() ||
            !set->pairs[layer][LRT_DOWN].empty());
}

// The rows [r0, r0 + n) of y along its first dimension, contiguous, whatever its other dimensions
static struct ggml_tensor * lora_rt_rows(struct ggml_context * ctx, struct ggml_tensor * y, int64_t r0, int64_t n) {
    return ggml_cont(ctx, ggml_view_4d(ctx, y, n, y->ne[1], y->ne[2], y->ne[3], y->nb[1], y->nb[2], y->nb[3],
                                       (size_t) r0 * y->nb[0]));
}

// qwen3_build_mlp with the set's corrections on gate, up and down: a fused gate_up is split after its matmul, so each
// half takes its own correction before the swiglu (only for a layer the set touches; the others keep qwen3_build_mlp)
static struct ggml_tensor * lora_rt_build_mlp(struct ggml_context * ctx,
                                              Qwen3Layer *          ly,
                                              struct ggml_tensor *  x,
                                              const LoraRtSet *     set,
                                              int                   layer) {
    struct ggml_tensor *gate, *up;
    if (ly->gate_up) {
        struct ggml_tensor * gu  = qwen3_linear(ctx, ly->gate_up, x);
        const int64_t        ffn = gu->ne[0] / 2;
        gate                     = lora_rt_rows(ctx, gu, 0, ffn);
        up                       = lora_rt_rows(ctx, gu, ffn, ffn);
    } else {
        gate = qwen3_linear(ctx, ly->gate_proj, x);
        up   = qwen3_linear(ctx, ly->up_proj, x);
    }
    gate                    = lora_rt_apply(ctx, set, layer, LRT_GATE, x, gate);
    up                      = lora_rt_apply(ctx, set, layer, LRT_UP, x, up);
    struct ggml_tensor * ff = ggml_swiglu_split(ctx, gate, up);
    return lora_rt_apply(ctx, set, layer, LRT_DOWN, ff, qwen3_linear(ctx, ly->down_proj, ff));
}
