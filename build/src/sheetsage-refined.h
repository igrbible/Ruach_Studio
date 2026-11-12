#pragma once
// sheetsage-refined.h: SheetSage2-Refined, the second transcriber (HERESY 2328)
//
// anime-song's fine-tune of SheetSage2 (huggingface.co/anime-song/SheetSage2-Refined, weights CC BY-NC 4.0, inference
// code MIT at github.com/anime-song/SheetSage2-Refined): SheetSage2's encoder frozen, a retrained decoder with a wider
// vocabulary (a chord as its bass, then root x 62 qualities; keys with 9 modes) and small frame heads that steer it.
// The GGUF is our conversion of anime-song's weights (HERESY 2379: HOT-Step CPP's convert-sheetsage2-refined.py at revision e36ce4f,
// byte for byte the overlay scragnog published) on goldhub/Ruach_Studio_Models_v2: the decoder, the bar-feature
// projection and five frame heads; the encoder, its layer mix and projection come from SheetSage2's own GGUF.
//
// The heads, the grammar, the frame tables and the rescoring below are ported from HOT-Step CPP
// (github.com/scragnog/HOT-Step-CPP, engine/src/yue2/sheetsage-heads.h and sheetsage-refined.h, MIT License,
// Copyright (c) 2026 Rob (scragnog) and HOT-Step CPP contributors), which ports the MIT reference
// (heads.py, grammar.py, transcribe.py frame_table, engine.py BatchDecoder._forward). Adapted to this engine's
// tokenizer and loader; the dot products keep eight partial sums.
//
//   x   = gelu(inp(concat_j LayerNorm(mix_j)))   [T, hidden]
//   x   = x + gelu(conv_k(x)), k = 0, 1            grouped Conv1d, 32 channels a group, kernel 9, pad 4
//   x   = BiGRU(x), 2 layers, hidden/2 a direction
//   out = linear heads on x
//
// The heads run on the CPU in fp32 (ggml has no GRU; a 300 s window is 7500 frames, the heads are tiny next to MERT).
//
// The ported parts are under HOT-Step CPP's licence:
//
// MIT License
//
// Copyright (c) 2026 Rob (scragnog) and HOT-Step CPP contributors
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

#include "gguf-weights.h"

#include <algorithm>
#include <cmath>
#include <cstring>
#include <map>
#include <string>
#include <thread>
#include <vector>

#define SS2R_STATES       25
#define SS2R_WIDTH        1024
#define SS2R_BAR_FEATURES 43
#define SS2R_QUALITIES    62
#define SS2R_NO_CHORD     (12 * SS2R_QUALITIES)  // 744: the N chord's offset in the chord_detail block
#define SS2R_MODES        9
#define SS2R_NO_KEY       (12 * SS2R_MODES)      // 108: the N key's offset in the key_mode block

struct SS2RLinear {
    int                n_out = 0, n_in = 0;
    std::vector<float> w;  // [n_out, n_in] row major (torch layout)
    std::vector<float> b;  // [n_out]
};

struct SS2RGru {     // one layer, one direction, torch gate order r, z, n
    SS2RLinear ih;   // [3H, in]
    SS2RLinear hh;   // [3H, H]
};

struct SS2RHead {
    std::string key;
    int         hidden = 0, mixes = 0, gru_layers = 0, binary = 0;

    std::vector<float>                mix_softmax;  // [mixes, 25]
    std::vector<float>                norm_w, norm_b;
    SS2RLinear                        inp;
    SS2RLinear                        conv[2];  // w as [hidden, 32, 9]
    std::vector<SS2RGru>              gru;      // [layer * 2 + direction]
    std::map<std::string, SS2RLinear> outs;     // root, bass, tones, key, binary, bar, detail
};

// The two bar heads, the bar-feature projection, the three rescoring heads and the decode-time settings
struct SS2RHeads {
    std::vector<SS2RHead>        heads;  // bar0, bar1, chord, detail, multi
    SS2RLinear                   bar_proj;  // [512, 43]
    int                          chunk_core = 1500, chunk_context = 375;
    std::map<std::string, float> rescore_weight;  // downbeat, meter, root, bass, quality, key, key_boundary
    std::map<std::string, int>   lookahead;       // root, bass, quality, key, meter
    std::map<std::string, int>   reach;           // key_boundary, downbeat
    float                        mode_tau = 0.0f;
    std::vector<float>           mode_counts;     // per mode, in the order of SS2R_MODE_NAMES
    std::vector<std::string>     qualities;       // the 62 chord qualities
};

static const char * const SS2R_BINARY[] = { "chord_boundary", "key_boundary", "beat", "downbeat", "group" };

static const struct {
    const char * name;
    int          n;
} SS2R_BAR[] = {
    { "bar_beats",  16 },
    { "beats_left", 16 },
    { "bar_groups", 8  },
};

static const char * const SS2R_MODE_NAMES[SS2R_MODES] = { "major",      "dorian", "phrygian",       "lydian",           "mixolydian",
                                                          "minor",      "locrian", "harmonic_minor", "phrygian_dominant" };

// ── loading, from the mmapped overlay ───────────────────────────────────────

static bool ss2r_tensor(const GGUFModel & gf, const std::string & name, std::vector<float> * out, std::vector<int64_t> * shape) {
    const struct ggml_tensor * t = ggml_get_tensor(gf.meta, name.c_str());
    if (!t || t->type != GGML_TYPE_F32) {
        fprintf(stderr, "[SheetSage] FATAL: refined overlay: %s %s\n", name.c_str(), t ? "is not F32" : "missing");
        return false;
    }
    const float * d = (const float *) gf_get_data(gf, name.c_str());
    out->assign(d, d + ggml_nelements(t));
    if (shape) {  // torch order, outermost first
        shape->clear();
        for (int i = ggml_n_dims(t) - 1; i >= 0; i--) {
            shape->push_back(t->ne[i]);
        }
    }
    return true;
}

static bool ss2r_linear(const GGUFModel & gf, const std::string & prefix, SS2RLinear * l) {
    std::vector<int64_t> s;
    if (!ss2r_tensor(gf, prefix + ".weight", &l->w, &s) || !ss2r_tensor(gf, prefix + ".bias", &l->b, nullptr)) {
        return false;
    }
    l->n_out = (int) s[0];
    l->n_in  = (int) (l->w.size() / (size_t) l->n_out);
    return true;
}

static bool ss2r_kv_u32(const GGUFModel & gf, const std::string & key, int * out) {
    int64_t id = gguf_find_key(gf.gguf, key.c_str());
    if (id < 0) {
        return false;
    }
    *out = (int) gguf_get_val_u32(gf.gguf, id);
    return true;
}

static bool ss2r_heads_load(const GGUFModel & gf, SS2RHeads * out) {
    *out = SS2RHeads{};
    ss2r_kv_u32(gf, "sheetsage2r.heads.chunk_core", &out->chunk_core);
    ss2r_kv_u32(gf, "sheetsage2r.heads.chunk_context", &out->chunk_context);
    for (const char * t : { "downbeat", "meter", "root", "bass", "quality", "key", "key_boundary" }) {
        int64_t id = gguf_find_key(gf.gguf, (std::string("sheetsage2r.rescore.") + t + ".weight").c_str());
        if (id >= 0) {
            out->rescore_weight[t] = gguf_get_val_f32(gf.gguf, id);
        }
        int n = 0;
        if (ss2r_kv_u32(gf, std::string("sheetsage2r.rescore.") + t + ".lookahead", &n)) {
            out->lookahead[t] = n;
        }
        if (ss2r_kv_u32(gf, std::string("sheetsage2r.rescore.") + t + ".reach", &n)) {
            out->reach[t] = n;
        }
    }
    int64_t tau = gguf_find_key(gf.gguf, "sheetsage2r.key_mode.tau");
    int64_t cnt = gguf_find_key(gf.gguf, "sheetsage2r.key_mode.counts");
    if (tau >= 0) {
        out->mode_tau = gguf_get_val_f32(gf.gguf, tau);
    }
    if (cnt >= 0 && gguf_get_arr_type(gf.gguf, cnt) == GGUF_TYPE_FLOAT32) {
        const float * d = (const float *) gguf_get_arr_data(gf.gguf, cnt);
        out->mode_counts.assign(d, d + gguf_get_arr_n(gf.gguf, cnt));
    }
    int64_t q = gguf_find_key(gf.gguf, "sheetsage2r.vocab.chord_qualities");
    if (q >= 0) {
        for (size_t i = 0; i < gguf_get_arr_n(gf.gguf, q); i++) {
            out->qualities.push_back(gguf_get_arr_str(gf.gguf, q, i));
        }
    }
    int64_t modes = gguf_find_key(gf.gguf, "sheetsage2r.vocab.modes");
    bool    modes_ok = modes >= 0 && gguf_get_arr_n(gf.gguf, modes) == SS2R_MODES;
    for (int i = 0; modes_ok && i < SS2R_MODES; i++) {
        modes_ok = std::string(gguf_get_arr_str(gf.gguf, modes, i)) == SS2R_MODE_NAMES[i];
    }
    if (out->qualities.size() != SS2R_QUALITIES || !modes_ok) {
        fprintf(stderr, "[SheetSage] FATAL: refined overlay: unexpected chord qualities or modes\n");
        return false;
    }
    if (!ss2r_linear(gf, "bar.proj", &out->bar_proj) || out->bar_proj.n_in != SS2R_BAR_FEATURES) {
        fprintf(stderr, "[SheetSage] FATAL: refined overlay: bar.proj expects %d bar facts\n", SS2R_BAR_FEATURES);
        return false;
    }
    for (const char * key : { "bar0", "bar1", "chord", "detail", "multi" }) {
        SS2RHead          h;
        const std::string kp = std::string("sheetsage2r.head.") + key;
        h.key                = key;
        if (!ss2r_kv_u32(gf, kp + ".hidden", &h.hidden) || !ss2r_kv_u32(gf, kp + ".mixes", &h.mixes) ||
            !ss2r_kv_u32(gf, kp + ".gru_layers", &h.gru_layers) || !ss2r_kv_u32(gf, kp + ".binary", &h.binary)) {
            fprintf(stderr, "[SheetSage] FATAL: refined overlay: head %s has no settings\n", key);
            return false;
        }
        const std::string  p = std::string("hd.") + key;
        std::vector<float> mix;
        if (!ss2r_tensor(gf, p + ".mix", &mix, nullptr) || (int) mix.size() != h.mixes * SS2R_STATES ||
            !ss2r_tensor(gf, p + ".norm.weight", &h.norm_w, nullptr) || !ss2r_tensor(gf, p + ".norm.bias", &h.norm_b, nullptr) ||
            !ss2r_linear(gf, p + ".inp", &h.inp) || !ss2r_linear(gf, p + ".convs.0", &h.conv[0]) ||
            !ss2r_linear(gf, p + ".convs.1", &h.conv[1])) {
            return false;
        }
        h.mix_softmax.resize(mix.size());
        for (int j = 0; j < h.mixes; j++) {  // softmax over the 25 states, in double
            const float * r  = mix.data() + j * SS2R_STATES;
            double        mx = r[0], sum = 0.0;
            for (int s = 1; s < SS2R_STATES; s++) {
                mx = std::max(mx, (double) r[s]);
            }
            for (int s = 0; s < SS2R_STATES; s++) {
                sum += std::exp((double) r[s] - mx);
            }
            for (int s = 0; s < SS2R_STATES; s++) {
                h.mix_softmax[(size_t) (j * SS2R_STATES + s)] = (float) (std::exp((double) r[s] - mx) / sum);
            }
        }
        for (int l = 0; l < h.gru_layers; l++) {
            for (int d = 0; d < 2; d++) {
                const std::string    sfx = std::to_string(l) + (d ? "_reverse" : "");
                SS2RGru              g;
                std::vector<int64_t> s;
                if (!ss2r_tensor(gf, p + ".rnn.weight_ih_l" + sfx, &g.ih.w, &s)) {
                    return false;
                }
                g.ih.n_out = (int) s[0];
                g.ih.n_in  = (int) s[1];
                if (!ss2r_tensor(gf, p + ".rnn.bias_ih_l" + sfx, &g.ih.b, nullptr) ||
                    !ss2r_tensor(gf, p + ".rnn.weight_hh_l" + sfx, &g.hh.w, &s)) {
                    return false;
                }
                g.hh.n_out = (int) s[0];
                g.hh.n_in  = (int) s[1];
                if (!ss2r_tensor(gf, p + ".rnn.bias_hh_l" + sfx, &g.hh.b, nullptr)) {
                    return false;
                }
                h.gru.push_back(std::move(g));
            }
        }
        for (const char * o : { "root", "bass", "tones", "key", "binary", "bar", "detail" }) {
            if (!ggml_get_tensor(gf.meta, (p + "." + o + ".weight").c_str())) {
                continue;
            }
            SS2RLinear l;
            if (!ss2r_linear(gf, p + "." + o, &l)) {
                return false;
            }
            h.outs[o] = std::move(l);
        }
        out->heads.push_back(std::move(h));
    }
    return true;
}

// ── math ────────────────────────────────────────────────────────────────────

static int ss2r_threads() {
    unsigned n = std::thread::hardware_concurrency();
    return (int) std::max(1u, std::min(n, 32u));
}

template <class F> static void ss2r_parallel(int n, F fn) {
    int nt = std::min(n, ss2r_threads());
    if (nt <= 1) {
        for (int i = 0; i < n; i++) {
            fn(i);
        }
        return;
    }
    std::vector<std::thread> th;
    for (int t = 0; t < nt; t++) {
        th.emplace_back([&, t] {
            for (int i = t; i < n; i += nt) {
                fn(i);
            }
        });
    }
    for (std::thread & x : th) {
        x.join();
    }
}

static inline float ss2r_gelu(float x) {
    return 0.5f * x * (1.0f + std::erf(x * 0.70710678118654752f));
}

static inline float ss2r_sigmoid(float x) {
    return 1.0f / (1.0f + std::exp(-x));
}

// A dot product with eight partial sums, so the compiler can keep it in vector registers
static inline float ss2r_dot(const float * a, const float * b, int n) {
    float s[8] = { 0, 0, 0, 0, 0, 0, 0, 0 };
    int   i    = 0;
    for (; i + 8 <= n; i += 8) {
        for (int k = 0; k < 8; k++) {
            s[k] += a[i + k] * b[i + k];
        }
    }
    float acc = ((s[0] + s[1]) + (s[2] + s[3])) + ((s[4] + s[5]) + (s[6] + s[7]));
    for (; i < n; i++) {
        acc += a[i] * b[i];
    }
    return acc;
}

// y[t] = W x[t] + b for T rows; x [T, n_in], y [T, n_out]
static void ss2r_linear_rows(const SS2RLinear & l, const float * x, int64_t T, float * y) {
    const int64_t block = 16;
    ss2r_parallel((int) ((T + block - 1) / block), [&](int bi) {
        int64_t t0 = bi * block, t1 = std::min(T, t0 + block);
        for (int64_t t = t0; t < t1; t++) {
            const float * xr = x + t * l.n_in;
            float *       yr = y + t * l.n_out;
            for (int o = 0; o < l.n_out; o++) {
                yr[o] = ss2r_dot(l.w.data() + (size_t) o * l.n_in, xr, l.n_in) + l.b[(size_t) o];
            }
        }
    });
}

// One GRU direction over the precomputed input gates gx [n, 3H] -> columns [off, off + H) of y
static void ss2r_gru_dir(const SS2RGru & g, const float * gx, int64_t n, bool reverse, float * y, int64_t y_stride, int64_t y_off) {
    const int          H = g.hh.n_in;
    std::vector<float> h((size_t) H, 0.0f), gh((size_t) 3 * H);
    for (int64_t s = 0; s < n; s++) {
        int64_t       t  = reverse ? n - 1 - s : s;
        const float * gi = gx + t * 3 * H;
        for (int o = 0; o < 3 * H; o++) {
            gh[(size_t) o] = ss2r_dot(g.hh.w.data() + (size_t) o * H, h.data(), H) + g.hh.b[(size_t) o];
        }
        float * yr = y + t * y_stride + y_off;
        for (int i = 0; i < H; i++) {
            float r       = ss2r_sigmoid(gi[i] + gh[(size_t) i]);
            float z       = ss2r_sigmoid(gi[H + i] + gh[(size_t) (H + i)]);
            float nn      = std::tanh(gi[2 * H + i] + r * gh[(size_t) (2 * H + i)]);
            h[(size_t) i] = (1.0f - z) * nn + z * h[(size_t) i];
            yr[i]         = h[(size_t) i];
        }
    }
}

// A bidirectional multi-layer GRU on x [n, hidden] -> [n, hidden]
static void ss2r_bigru(const SS2RHead & hd, const float * x, int64_t n, std::vector<float> * out) {
    const int          H2 = hd.hidden;
    std::vector<float> cur(x, x + n * H2), next((size_t) (n * H2));
    for (int l = 0; l < hd.gru_layers; l++) {
        const SS2RGru &    gf = hd.gru[(size_t) (l * 2)];
        const SS2RGru &    gb = hd.gru[(size_t) (l * 2 + 1)];
        std::vector<float> gxf((size_t) (n * gf.ih.n_out)), gxb((size_t) (n * gb.ih.n_out));
        ss2r_linear_rows(gf.ih, cur.data(), n, gxf.data());
        ss2r_linear_rows(gb.ih, cur.data(), n, gxb.data());
        std::thread tb([&] { ss2r_gru_dir(gb, gxb.data(), n, true, next.data(), H2, H2 / 2); });
        ss2r_gru_dir(gf, gxf.data(), n, false, next.data(), H2, 0);
        tb.join();
        cur.swap(next);
    }
    *out = std::move(cur);
}

// heads.py FrameHead.forward: mixes[j] [T, 1024] -> the outputs keyed like the reference
static void ss2r_head_forward(const SS2RHead &                          hd,
                              const std::vector<const float *> &        mixes,
                              int64_t                                   T,
                              bool                                      chunked,
                              int                                       chunk_core,
                              int                                       chunk_context,
                              std::map<std::string, std::vector<float>> * outputs) {
    const int          W  = SS2R_WIDTH;
    const int          M  = hd.mixes;
    const int          Hd = hd.hidden;
    std::vector<float> cat((size_t) (T * M * W));
    ss2r_parallel((int) T, [&](int t) {
        for (int j = 0; j < M; j++) {
            const float * xr   = mixes[(size_t) j] + (int64_t) t * W;
            float *       yr   = cat.data() + ((int64_t) t * M + j) * W;
            double        mean = 0.0, var = 0.0;
            for (int i = 0; i < W; i++) {
                mean += xr[i];
            }
            mean /= W;
            for (int i = 0; i < W; i++) {
                double d = xr[i] - mean;
                var += d * d;
            }
            float inv = (float) (1.0 / std::sqrt(var / W + 1e-5));
            for (int i = 0; i < W; i++) {
                yr[i] = ((float) (xr[i] - mean)) * inv * hd.norm_w[(size_t) i] + hd.norm_b[(size_t) i];
            }
        }
    });
    std::vector<float> x((size_t) (T * Hd));
    ss2r_linear_rows(hd.inp, cat.data(), T, x.data());
    for (float & v : x) {
        v = ss2r_gelu(v);
    }
    cat.clear();
    cat.shrink_to_fit();

    // Two residual grouped convolutions: groups of 32 channels, kernel 9, zero pad 4
    const int          G = 32, K = 9, P = 4;
    std::vector<float> y((size_t) (T * Hd));
    for (int c = 0; c < 2; c++) {
        const SS2RLinear & cv = hd.conv[c];
        ss2r_parallel((int) T, [&](int t) {
            for (int o = 0; o < Hd; o++) {
                int           g0  = (o / G) * G;
                const float * wr  = cv.w.data() + (size_t) o * G * K;
                float         acc = cv.b[(size_t) o];
                for (int k = 0; k < K; k++) {
                    int64_t tt = (int64_t) t + k - P;
                    if (tt < 0 || tt >= T) {
                        continue;
                    }
                    const float * xr = x.data() + tt * Hd + g0;
                    for (int i = 0; i < G; i++) {
                        acc += wr[i * K + k] * xr[i];
                    }
                }
                y[(size_t) t * Hd + o] = acc;
            }
        });
        for (size_t i = 0; i < x.size(); i++) {
            x[i] += ss2r_gelu(y[i]);
        }
    }

    // The BiGRU, chunked like heads.py _rnn_chunked when the clip is long enough
    std::vector<float> r((size_t) (T * Hd));
    if (chunked && T > (int64_t) chunk_core + 2 * chunk_context) {
        std::vector<int64_t> starts;
        for (int64_t s = 0; s < T; s += chunk_core) {
            starts.push_back(s);
        }
        ss2r_parallel((int) starts.size(), [&](int pi) {
            int64_t            s  = starts[(size_t) pi];
            int64_t            lo = std::max<int64_t>(s - chunk_context, 0);
            int64_t            hi = std::min<int64_t>(s + chunk_core + chunk_context, T);
            std::vector<float> part;
            ss2r_bigru(hd, x.data() + lo * Hd, hi - lo, &part);
            int64_t end = std::min<int64_t>(s + chunk_core, T);
            memcpy(r.data() + s * Hd, part.data() + (s - lo) * Hd, (size_t) ((end - s) * Hd) * sizeof(float));
        });
    } else {
        ss2r_bigru(hd, x.data(), T, &r);
    }

    outputs->clear();
    for (const auto & kv : hd.outs) {
        std::vector<float> o((size_t) (T * kv.second.n_out));
        ss2r_linear_rows(kv.second, r.data(), T, o.data());
        int  n     = kv.second.n_out;
        auto split = [&](const std::string & name, int off, int count) {
            std::vector<float> & dst = (*outputs)[name];
            dst.resize((size_t) (T * count));
            for (int64_t t = 0; t < T; t++) {
                memcpy(dst.data() + t * count, o.data() + t * n + off, (size_t) count * sizeof(float));
            }
        };
        if (kv.first == "binary") {
            for (int i = 0; i < n; i++) {
                split(SS2R_BINARY[i], i, 1);
            }
        } else if (kv.first == "bar") {
            int off = 0;
            for (const auto & b : SS2R_BAR) {
                split(b.name, off, b.n);
                off += b.n;
            }
        } else {
            (*outputs)[kv.first] = std::move(o);
        }
    }
}

// heads.py bar_facts: [T, 43] probabilities from one bar head's outputs
static void ss2r_bar_facts(const std::map<std::string, std::vector<float>> & out, int64_t T, std::vector<float> * facts) {
    facts->assign((size_t) (T * SS2R_BAR_FEATURES), 0.0f);
    for (int64_t t = 0; t < T; t++) {
        float * f = facts->data() + t * SS2R_BAR_FEATURES;
        int     c = 0;
        for (const auto & b : SS2R_BAR) {
            const float * l  = out.at(b.name).data() + t * b.n;
            float         mx = l[0];
            for (int i = 1; i < b.n; i++) {
                mx = std::max(mx, l[i]);
            }
            double sum = 0.0;
            for (int i = 0; i < b.n; i++) {
                sum += std::exp((double) (l[i] - mx));
            }
            for (int i = 0; i < b.n; i++) {
                f[c++] = (float) (std::exp((double) (l[i] - mx)) / sum);
            }
        }
        for (const char * n : { "beat", "downbeat", "group" }) {
            f[c++] = ss2r_sigmoid(out.at(n)[(size_t) t]);
        }
    }
}

// The layer mixes the heads read, head by head: each of its `mixes` rows of softmax(mix) over the 25 states
static std::vector<std::vector<float>> ss2r_mix_weights(const SS2RHeads & rh) {
    std::vector<std::vector<float>> w;
    for (const SS2RHead & h : rh.heads) {
        for (int j = 0; j < h.mixes; j++) {
            w.emplace_back(h.mix_softmax.begin() + j * SS2R_STATES, h.mix_softmax.begin() + (j + 1) * SS2R_STATES);
        }
    }
    return w;
}

struct SS2RHeadOutputs {
    int64_t                                                          T = 0;
    std::map<std::string, std::map<std::string, std::vector<float>>> full;     // per head, the GRU over the whole window
    std::map<std::string, std::map<std::string, std::vector<float>>> chunked;  // the bar heads, chunked GRU
    std::vector<float>                                               bar_facts;  // [T, 43], mean of bar0 and bar1 chunked
};

// Every head on one window; mixes in the order of ss2r_mix_weights
static void ss2r_run_heads(const SS2RHeads & rh, const std::vector<const float *> & mixes, int64_t T, SS2RHeadOutputs * out) {
    *out   = SS2RHeadOutputs{};
    out->T = T;
    struct Job {
        const SS2RHead *                            h;
        std::vector<const float *>                  mixes;
        bool                                        chunked;
        std::map<std::string, std::vector<float>> * dst;
    };
    std::vector<Job> jobs;
    size_t           mi = 0;
    for (const SS2RHead & h : rh.heads) {
        std::vector<const float *> hm(mixes.begin() + (int64_t) mi, mixes.begin() + (int64_t) (mi + h.mixes));
        mi += (size_t) h.mixes;
        jobs.push_back({ &h, hm, false, &out->full[h.key] });
        if (h.key == "bar0" || h.key == "bar1") {
            jobs.push_back({ &h, hm, true, &out->chunked[h.key] });
        }
    }
    std::vector<std::thread> th;
    for (Job & j : jobs) {
        th.emplace_back([&rh, &j, T] { ss2r_head_forward(*j.h, j.mixes, T, j.chunked, rh.chunk_core, rh.chunk_context, j.dst); });
    }
    for (std::thread & t : th) {
        t.join();
    }
    std::vector<std::vector<float>> facts;
    for (const char * k : { "bar0", "bar1" }) {
        if (out->chunked.count(k)) {
            facts.emplace_back();
            ss2r_bar_facts(out->chunked[k], T, &facts.back());
        }
    }
    out->bar_facts.assign((size_t) (T * SS2R_BAR_FEATURES), 0.0f);
    for (const std::vector<float> & f : facts) {
        for (size_t i = 0; i < f.size(); i++) {
            out->bar_facts[i] += f[i] / (float) facts.size();
        }
    }
}

// BarFeatures.forward: memory[t] += W facts[t] + b, memory [T, D] time major
static void ss2r_add_bar_features(const SS2RHeads & rh, const std::vector<float> & facts, int64_t T_facts, float * memory, int64_t T_mem) {
    int64_t            T = std::min(T_mem, T_facts);
    std::vector<float> add((size_t) (T * rh.bar_proj.n_out));
    ss2r_linear_rows(rh.bar_proj, facts.data(), T, add.data());
    for (size_t i = 0; i < add.size(); i++) {
        memory[i] += add[i];
    }
}

// ── frame tables (transcribe.py frame_table) ────────────────────────────────

struct SS2RTables {
    int64_t            T = 0;
    std::vector<float> root, bass;    // [T, 12]
    std::vector<float> quality;       // [T, 744]
    std::vector<float> key;           // [T, 24]
    std::vector<float> meter;         // [T, 16]
    std::vector<float> key_boundary;  // [T]
    std::vector<float> downbeat;      // [T]
};

// Row softmax of [T, n] logits, the first `keep` columns kept
static std::vector<float> ss2r_softmax_rows(const std::vector<float> & x, int64_t T, int n, int keep) {
    std::vector<float> p((size_t) (T * keep));
    for (int64_t t = 0; t < T; t++) {
        const float * r  = x.data() + t * n;
        float         mx = r[0];
        for (int i = 1; i < n; i++) {
            mx = std::max(mx, r[i]);
        }
        double s = 0.0;
        for (int i = 0; i < n; i++) {
            s += std::exp((double) (r[i] - mx));
        }
        for (int i = 0; i < keep; i++) {
            p[(size_t) (t * keep + i)] = (float) (std::exp((double) (r[i] - mx)) / s);
        }
    }
    return p;
}

// The mean over the next `span` frames, the last frame repeated past the end
static std::vector<float> ss2r_lookahead(const std::vector<float> & p, int64_t T, int n, int span) {
    std::vector<float> m((size_t) (T * n), 0.0f);
    for (int64_t t = 0; t < T; t++) {
        for (int j = 0; j < span; j++) {
            const float * r = p.data() + std::min<int64_t>(t + j, T - 1) * n;
            for (int i = 0; i < n; i++) {
                m[(size_t) (t * n + i)] += r[i];
            }
        }
        for (int i = 0; i < n; i++) {
            m[(size_t) (t * n + i)] /= (float) span;
        }
    }
    return m;
}

static void ss2r_log_clamped(std::vector<float> & v) {
    for (float & x : v) {
        x = std::log(std::max(x, 1e-6f));
    }
}

// The logit of the largest probability within `reach` frames, clamped to [0.02, 0.98]
static std::vector<float> ss2r_peak_logit(const std::vector<float> & p, int64_t T, int reach) {
    std::vector<float> out((size_t) T);
    for (int64_t t = 0; t < T; t++) {
        float mx = 0.0f;
        for (int64_t u = std::max<int64_t>(0, t - reach); u <= std::min<int64_t>(T - 1, t + reach); u++) {
            mx = std::max(mx, p[(size_t) u]);
        }
        mx              = std::min(std::max(mx, 0.02f), 0.98f);
        out[(size_t) t] = std::log(mx) - std::log(1.0f - mx);
    }
    return out;
}

// The tables the rescoring terms read, from one window's heads (the GRU over the whole window, as the reference's
// rescoring heads run)
static void ss2r_tables(const SS2RHeads & rh, const SS2RHeadOutputs & ho, SS2RTables * tab) {
    const int64_t T = ho.T;
    *tab            = SS2RTables{};
    tab->T          = T;
    auto la         = [&](const char * term, int fallback) {
        auto it = rh.lookahead.find(term);
        return it == rh.lookahead.end() ? fallback : it->second;
    };
    auto rc = [&](const char * term, int fallback) {
        auto it = rh.reach.find(term);
        return it == rh.reach.end() ? fallback : it->second;
    };
    const auto & chord  = ho.full.at("chord");
    const auto & detail = ho.full.at("detail");
    const auto & multi  = ho.full.at("multi");
    const auto & bar0   = ho.full.at("bar0");
    const auto & bar1   = ho.full.at("bar1");

    tab->root = ss2r_lookahead(ss2r_softmax_rows(chord.at("root"), T, 13, 12), T, 12, la("root", 12));
    ss2r_log_clamped(tab->root);
    tab->bass = ss2r_lookahead(ss2r_softmax_rows(chord.at("bass"), T, 13, 12), T, 12, la("bass", 12));
    ss2r_log_clamped(tab->bass);

    const int          ND = SS2R_NO_CHORD;
    std::vector<float> q  = ss2r_lookahead(ss2r_softmax_rows(detail.at("detail"), T, ND + 1, ND), T, ND, la("quality", 12));
    tab->quality.resize(q.size());
    for (int64_t t = 0; t < T; t++) {
        float roots[12] = {};
        for (int i = 0; i < ND; i++) {
            roots[i % 12] += q[(size_t) (t * ND + i)];
        }
        for (int i = 0; i < ND; i++) {
            tab->quality[(size_t) (t * ND + i)] =
                std::log(std::max(q[(size_t) (t * ND + i)], 1e-6f)) - std::log(std::max(roots[i % 12], 1e-6f));
        }
    }

    tab->key = ss2r_lookahead(ss2r_softmax_rows(multi.at("key"), T, 24, 24), T, 24, la("key", 50));
    ss2r_log_clamped(tab->key);

    // The bar heads averaged as HeadMean does: the mean softmax, renormalised; the mean sigmoid
    std::vector<float> b0 = ss2r_softmax_rows(bar0.at("bar_beats"), T, 16, 16);
    std::vector<float> b1 = ss2r_softmax_rows(bar1.at("bar_beats"), T, 16, 16);
    for (int64_t t = 0; t < T; t++) {
        double s = 0.0;
        for (int i = 0; i < 16; i++) {
            size_t k = (size_t) (t * 16 + i);
            b0[k]    = std::max(0.5f * (b0[k] + b1[k]), 1e-9f);
            s += b0[k];
        }
        for (int i = 0; i < 16; i++) {
            b0[(size_t) (t * 16 + i)] = (float) (b0[(size_t) (t * 16 + i)] / s);
        }
    }
    tab->meter = ss2r_lookahead(b0, T, 16, la("meter", 8));
    ss2r_log_clamped(tab->meter);

    std::vector<float> kb((size_t) T), db((size_t) T);
    for (int64_t t = 0; t < T; t++) {
        kb[(size_t) t] = ss2r_sigmoid(multi.at("key_boundary")[(size_t) t]);
        float p        = 0.5f * (ss2r_sigmoid(bar0.at("downbeat")[(size_t) t]) + ss2r_sigmoid(bar1.at("downbeat")[(size_t) t]));
        db[(size_t) t] = std::min(std::max(p, 1e-6f), 1.0f - 1e-6f);
    }
    tab->key_boundary = ss2r_peak_logit(kb, T, rc("key_boundary", 25));
    tab->downbeat     = ss2r_peak_logit(db, T, rc("downbeat", 2));
}

// ── token ranges the refined grammar and rescoring read ─────────────────────

struct SS2RVocab {
    int sos, eos, out, prompt0;
    int shift0, shift1, time0, time1, meter0, meter1, eighth0, eighth1, structure0, structure1, key0, key1;
    int pitch0, pitch1, duration0, duration1;
    int bass0, detail0, keymode0, n_tokens;  // the blocks appended after SheetSage2's vocabulary
    int time_hz;
};

// ── grammar (grammar.py TokenGrammar, prompt aware: chord_detail is a bass then root x quality; key or key_mode) ──

struct SS2RGrammar {
    enum Class : int8_t { EOS_T, SHIFT_T, TIME_T, METER_T, EIGHTH_T, STRUCTURE_T, KEY_T, CHORD_T, PITCH_T, DURATION_T, BASS_T, DETAIL_T, OTHER };

    enum Incomplete : int8_t { NONE, AFTER_METER, AFTER_PITCH, AFTER_BASS };

    std::vector<int8_t> cls;
    bool                in_shift   = true;
    int                 shift_run  = 0;
    int                 payload    = 0;
    int                 last_field = -1;
    Incomplete          incomplete = NONE;

    static int field_of(Class c) {
        static const int8_t F[] = { -1, -1, 0, 1, 1, 2, 3, 4, 5, 5, 4, 4, -1 };
        return F[c];
    }

    SS2RGrammar(const SS2RVocab & v, bool key_mode) {
        cls.assign((size_t) v.n_tokens, OTHER);
        auto set = [&](int a, int b, Class c) {
            for (int i = a; i < b; i++) {
                cls[(size_t) i] = c;
            }
        };
        cls[(size_t) v.eos] = EOS_T;
        set(v.shift0, v.shift1, SHIFT_T);
        set(v.time0, v.time1, TIME_T);
        set(v.meter0, v.meter1, METER_T);
        set(v.eighth0, v.eighth1, EIGHTH_T);
        set(v.structure0, v.structure1, STRUCTURE_T);
        if (key_mode) {
            set(v.keymode0, v.keymode0 + SS2R_NO_KEY + 1, KEY_T);
        } else {
            set(v.key0, v.key1, KEY_T);
        }
        set(v.bass0, v.bass0 + 12, BASS_T);
        set(v.detail0, v.detail0 + SS2R_NO_CHORD, DETAIL_T);
        cls[(size_t) (v.detail0 + SS2R_NO_CHORD)] = CHORD_T;
        set(v.pitch0, v.pitch1, PITCH_T);
        set(v.duration0, v.duration1, DURATION_T);
    }

    void allowed_classes(bool out[OTHER + 1]) const {
        bool free        = incomplete == NONE;
        bool open        = incomplete == AFTER_BASS;
        out[EOS_T]       = payload > 0 && !open;
        out[SHIFT_T]     = (payload > 0 || in_shift) && shift_run < 4 && !open;
        out[TIME_T]      = free && last_field < 0;
        out[METER_T]     = free && last_field < 1;
        out[EIGHTH_T]    = incomplete == AFTER_METER || (free && last_field < 1);
        out[STRUCTURE_T] = free && last_field < 2;
        out[KEY_T]       = free && last_field < 3;
        out[CHORD_T]     = free && last_field < 4;
        out[PITCH_T]     = incomplete == AFTER_PITCH || (free && last_field <= 5);
        out[DURATION_T]  = incomplete == AFTER_PITCH;
        out[BASS_T]      = free && last_field < 4;
        out[DETAIL_T]    = open;
        out[OTHER]       = false;
    }

    void update(int token) {
        Class c        = (Class) cls[(size_t) token];
        bool  is_shift = c == SHIFT_T;
        bool  is_field = c != SHIFT_T && c != EOS_T;
        if (is_shift && !in_shift && payload > 0) {  // a new event
            payload    = 0;
            last_field = -1;
            incomplete = NONE;
        }
        if (is_field) {
            payload++;
            last_field = field_of(c);
            incomplete = c == METER_T ? AFTER_METER : c == PITCH_T ? AFTER_PITCH : c == BASS_T ? AFTER_BASS : NONE;
            in_shift   = false;
            shift_run  = 0;
        } else if (is_shift) {
            in_shift = true;
            shift_run++;
        }
    }

    void prime(const SS2RVocab & v, const std::vector<int> & prefix) {
        size_t i = 0;
        while (i < prefix.size() && prefix[i] != v.out) {
            i++;
        }
        for (i++; i < prefix.size(); i++) {
            update(prefix[i]);
        }
    }
};

// ── rescoring (engine.py _forward) ──────────────────────────────────────────

struct SS2RRescorer {
    const SS2RHeads &  rh;
    const SS2RTables & tab;
    const SS2RVocab &  v;
    bool               key_mode;
    int64_t            frames;  // the reference engine's frame capacity, one 300 s window

    int64_t            now           = 0;
    bool               key_seen      = false;
    int                active_meter  = -1;
    bool               meter_changed = false;
    std::vector<float> mode_bias;  // [9], empty unless key_mode

    float w(const char * term) const {
        auto it = rh.rescore_weight.find(term);
        return it == rh.rescore_weight.end() ? 0.0f : it->second;
    }

    SS2RRescorer(const SS2RHeads & h, const SS2RTables & t, const SS2RVocab & vv, bool km, int64_t f) :
        rh(h),
        tab(t),
        v(vv),
        key_mode(km),
        frames(f) {
        if (key_mode && rh.mode_tau != 0.0f && rh.mode_counts.size() == SS2R_MODES) {
            double sum = 0.0;
            for (float c : rh.mode_counts) {
                sum += c;
            }
            for (float c : rh.mode_counts) {
                mode_bias.push_back((float) (-(double) rh.mode_tau * std::log((double) c / sum)));
            }
        }
    }

    void prime(const std::vector<int> & prefix) {
        int last_time = -1;
        for (int tok : prefix) {
            if (tok >= v.time0 && tok < v.time1) {
                last_time = tok - v.time0;
            }
            key_seen = key_seen || (tok >= v.key0 && tok < v.key1);
            if (tok >= v.meter0 && tok < v.meter1) {
                active_meter = tok - v.meter0;
            }
        }
        // int(times[-1] * time_hz) * 25 // time_hz, in the reference's float64
        now = last_time < 0 ? 0 : std::min<int64_t>((int64_t) last_time * 25 / v.time_hz, frames - 1);
        meter_changed = false;
    }

    // The meter index -> its beats (0 based, capped at 16) and its unit, the vocabulary's METERS order
    static int meter_beats(int m) { return std::min(m / 6 + 1, 16) - 1; }

    static int meter_unit(int m) { return 1 << (m % 6); }

    void apply(float * logits, bool after_meter) const {
        int n_eighth = v.eighth1 - v.eighth0;
        if (!mode_bias.empty()) {
            for (int m = 0; m < SS2R_MODES; m++) {
                for (int t = 0; t < 12; t++) {
                    logits[v.keymode0 + m * 12 + t] += mode_bias[(size_t) m];
                }
            }
        }
        if (now >= tab.T) {  // past the heads' frames: the reference's zero-filled table rows
            if (w("meter") != 0.0f && after_meter && meter_changed) {
                for (int e = 1; e < n_eighth; e++) {
                    logits[v.eighth0 + e] = -INFINITY;
                }
            }
            return;
        }
        const int ND = SS2R_NO_CHORD;
        if (float wr = w("root")) {
            const float * r = tab.root.data() + now * 12;
            for (int i = 0; i < ND; i++) {
                logits[v.detail0 + i] += wr * r[i % 12];
            }
        }
        if (float wq = w("quality")) {
            const float * q = tab.quality.data() + now * ND;
            for (int i = 0; i < ND; i++) {
                logits[v.detail0 + i] += wq * q[i];
            }
        }
        if (float wb = w("bass")) {
            const float * b = tab.bass.data() + now * 12;
            for (int i = 0; i < 12; i++) {
                logits[v.bass0 + i] += wb * b[i];
            }
        }
        if (!key_mode) {  // the key terms move the `key` prompt's tokens only
            if (float wk = w("key")) {
                const float * k = tab.key.data() + now * 24;
                for (int i = 0; i < 24; i++) {
                    logits[v.key0 + i] += wk * k[i];
                }
            }
            if (float wkb = w("key_boundary")) {
                if (key_seen) {
                    for (int i = 0; i < 24; i++) {
                        logits[v.key0 + i] += wkb * tab.key_boundary[(size_t) now];
                    }
                }
            }
        }
        float wd = w("downbeat");
        if (wd != 0.0f) {
            logits[v.eighth0] += wd * tab.downbeat[(size_t) now];
        }
        if (float wm = w("meter")) {
            const float * table   = tab.meter.data() + now * 16;
            int           active  = std::max(active_meter, 0);
            float         current = table[meter_beats(active)];
            for (int m = 0; m < v.meter1 - v.meter0; m++) {
                bool change = active_meter >= 0 && m != active;
                if (change && meter_unit(m) == meter_unit(active)) {
                    logits[v.meter0 + m] += wm * (table[meter_beats(m)] - current);
                }
                if (change && wd != 0.0f) {
                    logits[v.meter0 + m] += wd * tab.downbeat[(size_t) now];
                }
            }
            if (after_meter && meter_changed) {
                for (int e = 1; e < n_eighth; e++) {
                    logits[v.eighth0 + e] = -INFINITY;
                }
            }
        }
    }

    void update(int tok) {
        if (tok >= v.time0 && tok < v.time1) {
            double seconds = (double) (tok - v.time0) / v.time_hz;
            now            = std::min<int64_t>(std::max<int64_t>((int64_t) (seconds * 25.0), 0), frames - 1);
        }
        key_seen = key_seen || (tok >= v.key0 && tok < v.key1);
        if (tok >= v.meter0 && tok < v.meter1) {
            int m         = tok - v.meter0;
            meter_changed = active_meter >= 0 && m != active_meter;
            active_meter  = m;
        }
    }
};

// ── labels and their ABC spelling ───────────────────────────────────────────

static const char * const SS2R_PC_NAMES[12] = { "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B" };

// A chord quality of the vocabulary in the spelling SheetSage2's own chord symbols use (maj7, m7b5, m(maj7), 7sus4)
static std::string ss2r_quality_abc(const std::string & q) {
    static const std::map<std::string, std::string> table = {
        { "5", "5" },           { "", "" },               { "-5", "(b5)" },        { "m", "m" },
        { "dim", "dim" },       { "aug", "aug" },         { "sus2", "sus2" },      { "sus4", "sus4" },
        { "6", "6" },           { "7", "7" },             { "M7", "maj7" },        { "m6", "m6" },
        { "m7", "m7" },         { "mM7", "m(maj7)" },     { "7-5", "7b5" },        { "m7-5", "m7b5" },
        { "aug7", "aug7" },     { "augM7", "aug(maj7)" }, { "7sus4", "7sus4" },    { "dim7", "dim7" },
        { "add9", "add9" },     { "madd9", "m(add9)" },   { "69", "6(9)" },        { "m69", "m6(9)" },
    };
    auto it = table.find(q);
    if (it != table.end()) {
        return it->second;
    }
    // the tension chords keep their parentheses: M7 -> maj7, mM7 -> m(maj7) first, then -5 -> b5
    std::string s = q;
    if (s.rfind("mM7", 0) == 0) {
        s = "m(maj7)" + s.substr(3);
    } else if (s.rfind("M7", 0) == 0) {
        s = "maj7" + s.substr(2);
    } else if (s.rfind("augM7", 0) == 0) {
        s = "aug(maj7)" + s.substr(5);
    }
    size_t p = s.find("-5");
    if (p != std::string::npos) {
        s.replace(p, 2, "b5");
    }
    return s;
}

// A note name a given interval above a root name, spelled by the degree like SheetSage2's own slash chords (D#/F##)
static std::string ss2r_spell_above(const std::string & root, int semis) {
    static const int  degree[12] = { 0, 1, 1, 2, 2, 3, 3, 4, 5, 5, 6, 6 };  // b2 2 b3 3 4 #4 5 b6 6 b7 7
    static const char letters[]  = "CDEFGAB";
    static const int  natural[7] = { 0, 2, 4, 5, 7, 9, 11 };
    int               li         = (int) (strchr(letters, root[0]) - letters);
    int               rp         = natural[li];
    for (size_t i = 1; i < root.size(); i++) {
        rp += root[i] == '#' ? 1 : root[i] == 'b' ? -1 : 0;
    }
    int target = rp + semis;
    int tl     = (li + degree[semis % 12]) % 7;
    int diff   = ((target - natural[tl]) % 12 + 12) % 12;
    if (diff > 6) {
        diff -= 12;
    }
    if (diff > 2 || diff < -2) {  // past a double accidental: the plain sharp name
        return SS2R_PC_NAMES[((target % 12) + 12) % 12];
    }
    std::string name(1, letters[tl]);
    for (int i = 0; i < diff; i++) {
        name += '#';
    }
    for (int i = 0; i > diff; i--) {
        name += 'b';
    }
    return name;
}

// The label of a chord_detail chord (bass pitch class, root, quality index) and its ABC symbol
static std::string ss2r_chord_label(int bass, int root, int quality) {
    return "R:" + std::to_string(root) + ":" + std::to_string(quality) + "/" + std::to_string(bass);
}

static std::string ss2r_chord_abc(const SS2RHeads & rh, int bass, int root, int quality) {
    std::string name = SS2R_PC_NAMES[root];
    std::string abc  = name + ss2r_quality_abc(rh.qualities[(size_t) quality]);
    if (bass != root) {
        abc += "/" + ss2r_spell_above(name, ((bass - root) % 12 + 12) % 12);
    }
    return abc;
}

// A key with its mode: the label, and its ABC field. The tonic is named by the spelling with the fewest accidentals in
// the signature; harmonic minor is written minor and phrygian dominant phrygian (ABC has neither, the raised degree
// comes as an accidental in the notes).
static std::string ss2r_key_label(int tonic, int mode) {
    return std::string(SS2R_PC_NAMES[tonic]) + ":" + SS2R_MODE_NAMES[mode];
}

static int ss2r_major_count(const std::string & name) {  // sharps (+) or flats (-) of the major key so named
    static const int base[7] = { 0, 2, 4, -1, 1, 3, 5 };     // C D E F G A B
    static const char letters[] = "CDEFGAB";
    int               n         = base[strchr(letters, name[0]) - letters];
    for (size_t i = 1; i < name.size(); i++) {
        n += name[i] == '#' ? 7 : name[i] == 'b' ? -7 : 0;
    }
    return n;
}

static const int  SS2R_MODE_SHIFT[SS2R_MODES] = { 0, -2, -4, 1, -1, -3, -5, -3, -4 };
static const char * const SS2R_MODE_ABC[SS2R_MODES] = { "", "dor", "phr", "lyd", "mix", "m", "loc", "m", "phr" };

static std::string ss2r_key_abc(int tonic, int mode) {
    static const char * const spellings[12][2] = { { "C", "C" },   { "C#", "Db" }, { "D", "D" },   { "D#", "Eb" },
                                                   { "E", "E" },   { "F", "F" },   { "F#", "Gb" }, { "G", "G" },
                                                   { "G#", "Ab" }, { "A", "A" },   { "A#", "Bb" }, { "B", "B" } };
    std::string best;
    int         best_count = 99;
    for (const char * name : spellings[tonic]) {
        int count = ss2r_major_count(name) + SS2R_MODE_SHIFT[mode];
        if (std::abs(count) < best_count) {
            best_count = std::abs(count);
            best       = name;
        }
    }
    return best + SS2R_MODE_ABC[mode];
}
