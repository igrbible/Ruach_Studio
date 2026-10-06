#pragma once
// sliders.h: voice and genre sliders on the AR attention projections (local addition)
//
// A slider is a routed-particle adapter (ntc-ai/yue2-particle-sliders) on each
// of the 4 attention projections of every AR layer. For a projection input x:
//
//   f = down x                                    rank 8
//   q = router(f)                                 MLP 8-16-16-16-4, LeakyReLU 0.2
//   z = softmax(P q / sqrt(4)) P                  P: 128 particles of dim 4
//   h = net(concat(f, z))                         MLP 12-48-48-48-8, LeakyReLU 0.2
//   y = W x + strength * alpha / rank * up h
//
// Every term is F32. Several sliders stack by summing their corrections. The
// sliders act while the music tokens are written; the pipeline clears them
// before any other stage reads the backbone.
//
// convert-extras.py writes one GGUF per slider, tensor names sld.<layer>.<p>.*
// with p in q, k, v, o, plus sld.particles [4, 128] and sld.particles_t [128, 4].

#include "ggml-backend.h"
#include "ggml.h"
#include "gguf-weights.h"
#include "weight-ctx.h"

#include <cmath>
#include <memory>
#include <string>
#include <utility>
#include <vector>

#define SLIDER_MAX_LAYERS 64

enum SliderProjKind { SLIDER_Q = 0, SLIDER_K = 1, SLIDER_V = 2, SLIDER_O = 3 };

struct SliderProj {
    struct ggml_tensor * down;
    struct ggml_tensor * up;
    struct ggml_tensor * rw[4];
    struct ggml_tensor * rb[4];
    struct ggml_tensor * nw[4];
    struct ggml_tensor * nb[4];
};

struct Slider {
    std::string          id;
    float                gain;  // strength * alpha / rank
    // HERESY 1166: its curve through the song (points t, k; empty: flat) and the gain the graph reads, a tensor set
    // before each step of the music to gain * curve(t), so the static decode graph needs no rebuild
    std::vector<std::pair<float, float>> curve;
    struct ggml_tensor *                 gain_t   = nullptr;
    mutable float                        gain_now = 0.0f;
    struct ggml_tensor * particles;
    struct ggml_tensor * particles_t;
    SliderProj           proj[SLIDER_MAX_LAYERS][4];
};

struct SliderSet {
    std::vector<Slider> sliders;
    WeightCtx           wctx;
    bool                allocated = false;
    int                 kept      = 0;  // HERESY 1166: frames kept before the stage (regenerate from here): its curve counts them
};

static bool sliders_active(const SliderSet * s) {
    return s && !s->sliders.empty();
}

// HERESY 1166: a curve's value at t (0..1): between two points an eased step (half a cosine), so a peak is round and a
// plateau flat; before the first point the first value, after the last the last; no points: 1, the strength as set
static float slider_curve_at(const std::vector<std::pair<float, float>> & c, float t) {
    if (c.empty()) {
        return 1.0f;
    }
    if (t <= c.front().first) {
        return c.front().second;
    }
    for (size_t i = 1; i < c.size(); i++) {
        if (t <= c[i].first) {
            float t0 = c[i - 1].first, t1 = c[i].first, u = t1 > t0 ? (t - t0) / (t1 - t0) : 1.0f;
            float e = 0.5f - 0.5f * cosf(3.14159265f * u);
            return c[i - 1].second + (c[i].second - c[i - 1].second) * e;
        }
    }
    return c.back().second;
}

// Load the chosen sliders onto the backbone's backend. choices: GGUF path and
// strength; a strength of 0 is skipped outright (exactly the base model).
// HERESY 1166: curves, one a choice in the same order (none: every one flat).
static bool sliders_load(SliderSet *                                                set,
                         ggml_backend_t                                             backend,
                         const std::vector<std::pair<std::string, float>> &        choices,
                         int                                                        n_layers,
                         const std::vector<std::vector<std::pair<float, float>>> & curves = {}) {
    set->sliders.clear();
    set->allocated = false;
    set->kept      = 0;
    std::vector<std::pair<std::string, float>>        used;
    std::vector<std::vector<std::pair<float, float>>> used_curves;
    for (size_t ci = 0; ci < choices.size(); ci++) {
        if (choices[ci].second != 0.0f) {
            used.push_back(choices[ci]);
            used_curves.push_back(ci < curves.size() ? curves[ci] : std::vector<std::pair<float, float>>{});
        }
    }
    if (used.empty()) {
        return true;
    }
    if (n_layers > SLIDER_MAX_LAYERS) {
        fprintf(stderr, "[Sliders] FATAL: %d layers exceed %d\n", n_layers, SLIDER_MAX_LAYERS);
        return false;
    }
    std::vector<GGUFModel> files(used.size());
    const int              per_slider = 3 + n_layers * 4 * 18;  // HERESY 1166: and its gain
    wctx_init(&set->wctx, per_slider * (int) used.size());
    const char proj_char[4] = { 'q', 'k', 'v', 'o' };
    for (size_t i = 0; i < used.size(); i++) {
        if (!gf_load(&files[i], used[i].first.c_str())) {
            fprintf(stderr, "[Sliders] FATAL: cannot read %s\n", used[i].first.c_str());
            for (size_t j = 0; j < i; j++) {
                gf_close(&files[j]);
            }
            return false;
        }
        const GGUFModel & gf    = files[i];
        int64_t           kr    = gguf_find_key(gf.gguf, "yue2-slider.rank");
        int64_t           ka    = gguf_find_key(gf.gguf, "yue2-slider.alpha");
        int64_t           kl    = gguf_find_key(gf.gguf, "yue2-slider.layers");
        int64_t           kid   = gguf_find_key(gf.gguf, "yue2-slider.id");
        int               rank  = kr >= 0 ? (int) gguf_get_val_u32(gf.gguf, kr) : 8;
        float             alpha = ka >= 0 ? gguf_get_val_f32(gf.gguf, ka) : (float) rank;
        if (kl < 0 || (int) gguf_get_val_u32(gf.gguf, kl) != n_layers) {
            fprintf(stderr, "[Sliders] FATAL: %s does not match this backbone\n", used[i].first.c_str());
            for (size_t j = 0; j <= i; j++) {
                gf_close(&files[j]);
            }
            return false;
        }
        Slider s;
        s.id          = kid >= 0 ? gguf_get_val_str(gf.gguf, kid) : used[i].first;
        s.gain        = used[i].second * alpha / (float) rank;
        s.curve       = used_curves[i];                  // HERESY 1166: the gain a tensor, set from its curve
        s.gain_t      = ggml_new_tensor_1d(set->wctx.ctx, GGML_TYPE_F32, 1);
        ggml_set_name(s.gain_t, ("sld.gain." + std::to_string(i)).c_str());
        {
            auto g0    = std::make_unique<float[]>(1);
            g0[0]      = s.gain * slider_curve_at(s.curve, 0.0f);
            s.gain_now = g0[0];
            set->wctx.pending.push_back({ s.gain_t, g0.get(), sizeof(float), 0 });
            set->wctx.staging.push_back(std::move(g0));
        }
        s.particles   = gf_load_tensor_f32(&set->wctx, gf, "sld.particles");
        s.particles_t = gf_load_tensor_f32(&set->wctx, gf, "sld.particles_t");
        for (int l = 0; l < n_layers; l++) {
            for (int p = 0; p < 4; p++) {
                char base[48];
                snprintf(base, sizeof(base), "sld.%d.%c", l, proj_char[p]);
                SliderProj & pr = s.proj[l][p];
                pr.down         = gf_load_tensor_f32(&set->wctx, gf, std::string(base) + ".down");
                pr.up           = gf_load_tensor_f32(&set->wctx, gf, std::string(base) + ".up");
                for (int k = 0; k < 4; k++) {
                    char name[64];
                    snprintf(name, sizeof(name), "%s.r%d.w", base, k);
                    pr.rw[k] = gf_load_tensor_f32(&set->wctx, gf, name);
                    snprintf(name, sizeof(name), "%s.r%d.b", base, k);
                    pr.rb[k] = gf_load_tensor_f32(&set->wctx, gf, name);
                    snprintf(name, sizeof(name), "%s.n%d.w", base, k);
                    pr.nw[k] = gf_load_tensor_f32(&set->wctx, gf, name);
                    snprintf(name, sizeof(name), "%s.n%d.b", base, k);
                    pr.nb[k] = gf_load_tensor_f32(&set->wctx, gf, name);
                }
            }
        }
        set->sliders.push_back(s);
    }
    bool ok = wctx_alloc(&set->wctx, backend);
    for (auto & gf : files) {
        gf_close(&gf);
    }
    if (!ok) {
        set->sliders.clear();
        return false;
    }
    set->allocated = true;
    for (const Slider & s : set->sliders) {
        if (s.curve.empty()) {
            fprintf(stderr, "[Sliders] %s at gain %.2f\n", s.id.c_str(), (double) s.gain);
        } else {                                         // HERESY 1166: its curve, at the five quarters of the song
            fprintf(stderr, "[Sliders] %s at gain %.2f, curved through the song: %.2f %.2f %.2f %.2f %.2f of it\n", s.id.c_str(),
                    (double) s.gain, (double) slider_curve_at(s.curve, 0.0f), (double) slider_curve_at(s.curve, 0.25f),
                    (double) slider_curve_at(s.curve, 0.5f), (double) slider_curve_at(s.curve, 0.75f),
                    (double) slider_curve_at(s.curve, 1.0f));
        }
    }
    return true;
}

static void sliders_free(SliderSet * set) {
    if (set->allocated) {
        wctx_free(&set->wctx);
    }
    set->sliders.clear();
    set->allocated = false;
}

// Linear + bias of a slider MLP layer, [in, n] -> [out, n]
static struct ggml_tensor * slider_linear(struct ggml_context * ctx,
                                          struct ggml_tensor *  w,
                                          struct ggml_tensor *  b,
                                          struct ggml_tensor *  x) {
    return ggml_add(ctx, ggml_mul_mat(ctx, w, x), b);
}

// The summed correction of every active slider for one projection, or NULL.
// x: the projection input [in, n]; the result is [out, n] in F32.
static struct ggml_tensor * slider_delta(struct ggml_context * ctx,
                                         const SliderSet *     set,
                                         int                   layer,
                                         int                   proj,
                                         struct ggml_tensor *  x) {
    if (!sliders_active(set) || layer < 0) {
        return nullptr;
    }
    struct ggml_tensor * xf    = x->type == GGML_TYPE_F32 ? x : ggml_cast(ctx, x, GGML_TYPE_F32);
    struct ggml_tensor * total = nullptr;
    for (const Slider & s : set->sliders) {
        const SliderProj &   p = s.proj[layer][proj];
        struct ggml_tensor * f = ggml_mul_mat(ctx, p.down, xf);  // [8, n]
        struct ggml_tensor * q = f;
        for (int k = 0; k < 4; k++) {
            q = slider_linear(ctx, p.rw[k], p.rb[k], q);
            if (k < 3) {
                q = ggml_leaky_relu(ctx, q, 0.2f, false);
            }
        }
        // route: softmax over the 128 particles of P q / sqrt(particle_dim)
        struct ggml_tensor * scores = ggml_mul_mat(ctx, s.particles, q);  // [128, n]
        struct ggml_tensor * route  = ggml_soft_max_ext(ctx, scores, nullptr, 0.5f, 0.0f);
        struct ggml_tensor * z      = ggml_mul_mat(ctx, s.particles_t, route);  // [4, n]
        struct ggml_tensor * h      = ggml_concat(ctx, f, z, 0);                // [12, n]
        for (int k = 0; k < 4; k++) {
            h = slider_linear(ctx, p.nw[k], p.nb[k], h);
            if (k < 3) {
                h = ggml_leaky_relu(ctx, h, 0.2f, false);
            }
        }
        struct ggml_tensor * d = ggml_mul(ctx, ggml_mul_mat(ctx, p.up, h), s.gain_t);  // [out, n]; 1166: a tensor
        total                  = total ? ggml_add(ctx, total, d) : d;
    }
    return total;
}

// y + correction, or y unchanged when no slider is active
static struct ggml_tensor * slider_apply(struct ggml_context * ctx,
                                         const SliderSet *     set,
                                         int                   layer,
                                         int                   proj,
                                         struct ggml_tensor *  x,
                                         struct ggml_tensor *  y) {
    struct ggml_tensor * d = slider_delta(ctx, set, layer, proj, x);
    return d ? ggml_add(ctx, y, d) : y;
}

// HERESY 1166 (Viktor 04.10.2026: «либо было flat, как сейчас (как базовое состояние), и кривую в виде арки/параболы, либо
// амплитуду вручную мышкой двигая вспышки и затухания по слайдеру»): the gains at a step of the music, t = (kept + step) /
// (kept + budget); a curved slider's gain is uploaded when it moved; every 250 steps the log says where each stands
static void sliders_progress(const SliderSet * set, int step, int budget) {
    if (!sliders_active(set)) {
        return;
    }
    const float span = (float) (set->kept + budget);
    float       t    = span > 0.0f ? (float) (set->kept + step) / span : 0.0f;
    t                = t < 0.0f ? 0.0f : (t > 1.0f ? 1.0f : t);
    const bool  say  = step > 0 && (step % 250) == 0;
    std::string line;
    for (const Slider & s : set->sliders) {
        if (s.curve.empty()) {
            continue;
        }
        float g = s.gain * slider_curve_at(s.curve, t);
        if (fabsf(g - s.gain_now) > 1e-4f * (fabsf(s.gain) + 1e-3f)) {
            ggml_backend_tensor_set(s.gain_t, &g, 0, sizeof(float));
            s.gain_now = g;
        }
        if (say) {
            char part[160];
            snprintf(part, sizeof(part), "%s%s %.2f", line.empty() ? "" : ", ", s.id.c_str(),
                     (double) (s.gain != 0.0f ? s.gain_now / s.gain : 0.0f));
            line += part;
        }
    }
    if (say && !line.empty()) {
        fprintf(stderr, "[Sliders] %.0f%% into the music: %s of their strengths\n", (double) (t * 100.0f), line.c_str());
    }
}
