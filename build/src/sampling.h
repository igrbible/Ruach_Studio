// sampling.h: request local sampling of the two AR stages
//
// The protocol restricts each stage to its own slice of the vocabulary, bans
// its end token until a floor of emitted tokens, penalizes the ids of a
// sliding window by their frequency, then truncates by top-k and nucleus.
// The surviving candidates carry the scores the final softmax runs on, so a
// caller only has to normalize them and draw.
#pragma once

#include "philox.h"
#include "prompt.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <vector>

// Which AR stage the logits come from
enum Yue2Phase {
    YUE2_PHASE_ABC,       // symbolic plan, ordinary text vocabulary
    YUE2_PHASE_SEMANTIC,  // codec tokens
};

struct Yue2Sampling {
    float temperature;
    float top_p;
    int   top_k;
    float repetition_penalty;
    int   penalty_window;
    int   min_tokens;
    int   max_tokens;
};

// The bounds the protocol enforces on an overridden preset
static bool yue2_sampling_valid(const Yue2Sampling & s, const char * stage) {
    bool ok = s.temperature >= 0.0f && s.temperature <= 5.0f && s.top_p > 0.0f && s.top_p <= 1.0f && s.top_k >= 1 &&
              s.repetition_penalty > 0.0f && s.penalty_window >= 1 && s.penalty_window <= 100 && s.min_tokens >= 0 &&
              s.min_tokens <= s.max_tokens && s.max_tokens >= 1;
    if (!ok) {
        fprintf(stderr, "[Sampling] FATAL: %s preset outside the protocol bounds\n", stage);
    }
    return ok;
}

// Checkpoint native defaults (YuE2-3B/yue2_generation_config.json)
// HERESY 1001: max_tokens 4096 → 6144 (партитура), 9000 → 12000 (звук, 8:00).
// 6144 + 12000 + ~80 служебных оставляют ~6350 токенов на стиль и лирику в
// окне 24576. 8192 на партитуру съело бы лирику — проверено Виктором.
// HERESY 1031: Viktor's stable set (01.10.2026, the steadiest takes so far). The release had
// ABC 0.7 / 0.9 / 30 and semantic 1.0 / 0.95 / 100 / 1.2 / window 50.
// HERESY 1088 (Viktor, 02.10.2026): floors as fuses. A score may not end before 200 tokens (the broken ones
// ended at 40 to 54), the music not before 750 (30 s; a shorter requested length lowers it to that length).
static const Yue2Sampling YUE2_ABC_SAMPLING      = { 0.95f, 0.95f, 50, 1.005f, 100, 200, 6144 };
static const Yue2Sampling YUE2_SEMANTIC_SAMPLING = { 0.9f, 0.95f, 100, 1.3f, 100, 750, 12000 };

struct Yue2Candidate {
    int   id;
    float score;
};

// Content range [lo, hi) and end token of a phase
static void yue2_phase_range(Yue2Phase phase, int * lo, int * hi, int * end) {
    if (phase == YUE2_PHASE_ABC) {
        *lo  = 0;
        *hi  = YUE2_EOD;
        *end = YUE2_ABC_END;
        return;
    }
    *lo  = YUE2_CODEC_OFFSET;
    *hi  = YUE2_CODEC_OFFSET + YUE2_CODEC_SIZE;
    *end = YUE2_MUSIC_END;
}

// LM head rows [row0, row0 + rows) a phase samples from: its content range
// and its end token, which sit next to each other in the vocabulary. Logits
// of a phase are indexed from row0.
static void yue2_phase_rows(Yue2Phase phase, int * row0, int * rows) {
    int lo, hi, end;
    yue2_phase_range(phase, &lo, &hi, &end);
    *row0 = end < lo ? end : lo;
    *rows = (end >= hi ? end + 1 : hi) - *row0;
}

// Candidates that survive the phase mask, the end token floor, top-k and the
// nucleus, in descending score order. Temperature zero returns the argmax
// alone. logits holds the LM head rows of the phase, indexed from row0.
static void yue2_distribution(const float *                logits,
                              const Yue2Sampling &         s,
                              const std::vector<int> &     history,
                              int                          step,
                              Yue2Phase                    phase,
                              std::vector<Yue2Candidate> & out) {
    int lo, hi, end;
    yue2_phase_range(phase, &lo, &hi, &end);
    int row0 = end < lo ? end : lo;  // first row of the head window of the phase

    // The candidate of id sits at index id - lo until the truncations below
    out.clear();
    out.reserve((size_t) (hi - lo) + 1);
    for (int id = lo; id < hi; id++) {
        out.push_back({ id, logits[id - row0] });
    }
    if (step >= s.min_tokens) {
        out.push_back({ end, logits[end - row0] });
    }

    // The ids of the penalty window scale by their frequency in it, negatives
    // multiplied and positives divided. The history only holds content ids of
    // the phase, and an id is scored at its first occurrence in the window.
    if (s.repetition_penalty != 1.0f) {
        size_t first = history.size() > (size_t) s.penalty_window ? history.size() - (size_t) s.penalty_window : 0;
        for (size_t i = first; i < history.size(); i++) {
            int  id   = history[i];
            bool seen = false;
            for (size_t j = first; j < i && !seen; j++) {
                seen = history[j] == id;
            }
            if (seen) {
                continue;
            }
            int freq = 0;
            for (size_t j = i; j < history.size(); j++) {
                freq += history[j] == id;
            }
            float   alpha = powf(s.repetition_penalty, (float) freq);
            float & score = out[(size_t) (id - lo)].score;
            score         = score < 0.0f ? score * alpha : score / alpha;
        }
    }
    if (s.temperature != 0.0f && s.temperature != 1.0f) {
        for (size_t i = 0; i < out.size(); i++) {
            out[i].score /= s.temperature;
        }
    }

    if (s.temperature == 0.0f) {
        size_t best = 0;
        for (size_t i = 1; i < out.size(); i++) {
            if (out[i].score > out[best].score) {
                best = i;
            }
        }
        Yue2Candidate winner = out[best];
        out.assign(1, winner);
        return;
    }

    // top-k keeps every candidate at or above the k-th score, ties included
    int k = s.top_k < (int) out.size() ? s.top_k : (int) out.size();
    std::partial_sort(out.begin(), out.begin() + k, out.end(),
                      [](const Yue2Candidate & a, const Yue2Candidate & b) { return a.score > b.score; });
    float  threshold = out[k - 1].score;
    size_t kept      = 0;
    for (size_t i = 0; i < out.size(); i++) {
        if (out[i].score >= threshold) {
            out[kept++] = out[i];
        }
    }
    out.resize(kept);
    std::sort(out.begin(), out.end(),
              [](const Yue2Candidate & a, const Yue2Candidate & b) { return a.score > b.score; });

    if (s.top_p >= 1.0f) {
        return;
    }

    // Nucleus over the surviving distribution, the best candidate always stays
    float  top = out[0].score;
    double sum = 0;
    for (size_t i = 0; i < out.size(); i++) {
        sum += exp((double) (out[i].score - top));
    }
    double cumulative = 0;
    for (size_t i = 0; i < out.size(); i++) {
        if (i > 0 && cumulative > (double) s.top_p) {
            out.resize(i);
            break;
        }
        cumulative += exp((double) (out[i].score - top)) / sum;
    }
}

// cuRAND float conversion of one Philox word, on (0, 1]
static float yue2_curand_uniform(uint32_t x) {
    return (float) x * CURAND_2POW32_INV + (CURAND_2POW32_INV * 0.5f);
}

// One token draw, conformant with torch.multinomial(p, 1) at equal seed.
// Without replacement torch takes argmax(p / Exp(1)), and every vocabulary
// entry draws its exponential from its own Philox subsequence, so only the
// nucleus is drawn. The draw index is the generator offset of the stage,
// which advances by one counter per token.
static int yue2_draw(const std::vector<Yue2Candidate> & candidates, int64_t seed, int64_t draw_index) {
    float  top = candidates[0].score;
    double sum = 0;
    for (size_t i = 0; i < candidates.size(); i++) {
        sum += exp((double) (candidates[i].score - top));
    }

    uint32_t seed_lo = (uint32_t) seed;
    uint32_t seed_hi = (uint32_t) ((uint64_t) seed >> 32);
    int      best    = candidates[0].id;
    float    ratio   = -1.0f;
    for (size_t i = 0; i < candidates.size(); i++) {
        Philox4 ctr = {
            (uint32_t) draw_index,
            (uint32_t) ((uint64_t) draw_index >> 32),
            (uint32_t) candidates[i].id,
            0,
        };
        Philox4 r = philox4x32_10(ctr, seed_lo, seed_hi);
        float   p = (float) (exp((double) (candidates[i].score - top)) / sum);
        float   e = -logf(yue2_curand_uniform(r.x));
        float   c = p / e;
        if (c > ratio) {
            ratio = c;
            best  = candidates[i].id;
        }
    }
    return best;
}

// Dense probability vector the draw runs on, zero outside the nucleus
static void yue2_probabilities(const std::vector<Yue2Candidate> & candidates,
                               int                                vocab_size,
                               std::vector<float> &               probs) {
    probs.assign((size_t) vocab_size, 0.0f);
    if (candidates.empty()) {
        return;
    }
    float  top = candidates[0].score;
    double sum = 0;
    for (size_t i = 0; i < candidates.size(); i++) {
        sum += exp((double) (candidates[i].score - top));
    }
    for (size_t i = 0; i < candidates.size(); i++) {
        probs[(size_t) candidates[i].id] = (float) (exp((double) (candidates[i].score - top)) / sum);
    }
}
