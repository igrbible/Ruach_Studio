// generate.h: the two autoregressive stages
//
// One stage prefills B prefixes into KV sets 0..B-1 and decodes them in
// lockstep until each emits its end token or the budget runs out. Sequence i
// draws with seed + i, so its stream only depends on its own seed, and the
// draw is conformant with the reference at equal seed. Both stages restart
// the generator at the request seed, which the release does on purpose.
//
// The decode loop leaves every set holding the complete sequence, end token
// included: a sequence that ends feeds its end token once more, then stays in
// the batch as a passive row past the rows anyone reads, so the graph shape
// holds for the whole loop.
#pragma once

#include "qwen3-lm.h"
#include "sampling.h"
#include "timer.h"

#include <cstdio>
#include <cstring>
#include <vector>

struct Yue2Generation {
    std::vector<int> tokens;     // emitted content, end token excluded
    bool             truncated;  // the budget ran out before the end token
};

// Prefill set s with a prefix, or copy the set of an equal prefix already
// prefilled below it. The logits are the LM head rows [row0, row0 + rows).
static void yue2_prefill(Qwen3LM *                             lm,
                         Qw3lmKvCache *                        kv,
                         const std::vector<std::vector<int>> & prefixes,
                         int                                   first_set,
                         int                                   i,
                         float *                               logits,
                         int                                   row0,
                         int                                   rows,
                         const char *                          label) {
    int   s = first_set + i;
    Timer timer;
    for (int j = 0; j < i; j++) {
        if (prefixes[j] == prefixes[i]) {
            qw3lm_kv_copy(kv, first_set + j, s);
            memcpy(logits + (size_t) s * rows, logits + (size_t) (first_set + j) * rows, (size_t) rows * sizeof(float));
            fprintf(stderr, "[AR] %s song %d: %zu tokens copied from song %d, %.0f ms\n", label, i, prefixes[i].size(),
                    j, timer.ms());
            return;
        }
    }
    qw3lm_kv_trim(kv, s, 0);
    qw3lm_forward(lm, kv, prefixes[i].data(), (int) prefixes[i].size(), s, logits + (size_t) s * rows, row0, rows);
    fprintf(stderr, "[AR] %s song %d: %zu tokens prefilled, %.0f ms\n", label, i, prefixes[i].size(), timer.ms());
}

// Guidance of exactly one keeps a single branch, which is the nominal path in
// melody and full mode. Anything else prefills the unconditional prefixes into
// KV sets B..2B-1 and decodes both branches in the same batched forward, the
// conditional and unconditional logits combining before the distribution.
static bool yue2_generate(Qwen3LM *                             lm,
                          Qw3lmKvCache *                        kv,
                          const std::vector<std::vector<int>> & prefixes,
                          const std::vector<std::vector<int>> & negatives,
                          float                                 cfg_scale,
                          const Yue2Sampling &                  s_in,
                          int64_t                               seed,
                          Yue2Phase                             phase,
                          std::vector<Yue2Generation> *         out,
                          bool (*cancelled)(void *) = nullptr,
                          void * cancel_data        = nullptr) {
    const int B       = (int) prefixes.size();
    const int context = kv->cfg.max_seq_len;
    bool      guided  = cfg_scale != 1.0f;
    if (guided && (int) negatives.size() != B) {
        fprintf(stderr, "[AR] FATAL: guidance %.3f needs an unconditional prefix per sequence\n", (double) cfg_scale);
        return false;
    }
    // Every set holds its prefix, the budget and the end token.
    // HERESY 1032: a budget that does not fit beside the prefix is cut to what does, instead of a
    // FATAL: a long speech asks for 15 minutes and gets what the context holds (a song that runs
    // into the cut is marked truncated, as at any budget). Only a prefix with no room left fails.
    Yue2Sampling s = s_in;
    for (int i = 0; i < B; i++) {
        size_t longest = guided && negatives[i].size() > prefixes[i].size() ? negatives[i].size() : prefixes[i].size();
        int    room    = context - (int) longest - 1;
        if (room < 1) {
            fprintf(stderr, "[AR] FATAL: prefix %zu leaves no room in context %d\n", longest, context);
            return false;
        }
        if (s.max_tokens > room) {
            fprintf(stderr, "[AR] Budget %d cut to %d: prefix %zu + end fill the rest of context %d\n", s.max_tokens, room,
                    longest, context);
            s.max_tokens = room;
            if (s.min_tokens > s.max_tokens) {
                s.min_tokens = s.max_tokens;
            }
        }
    }

    const int N = guided ? 2 * B : B;
    if (!qw3lm_kv_sets(kv, N)) {
        return false;
    }

    // The LM head only computes the rows the phase samples from
    int row0, rows;
    yue2_phase_rows(phase, &row0, &rows);
    int          end   = phase == YUE2_PHASE_ABC ? YUE2_ABC_END : YUE2_MUSIC_END;
    const char * label = phase == YUE2_PHASE_ABC ? "Score" : "Semantic";
    Timer        timer;

    // Logits in KV set order, [cond 0..B-1, uncond B..2B-1], the prefills and
    // the decode steps writing the same rows
    std::vector<float> batched((size_t) N * rows);
    std::vector<int>   kv_sets(N);
    for (int i = 0; i < N; i++) {
        kv_sets[i] = i;
    }

    if (phase == YUE2_PHASE_SEMANTIC) {
        sliders_progress(lm->sliders, 0, s.max_tokens);   // HERESY 1166: the curves at the start of the music
    }
    Timer prefill_timer;
    for (int i = 0; i < B; i++) {
        yue2_prefill(lm, kv, prefixes, 0, i, batched.data(), row0, rows, label);
    }
    if (guided) {
        for (int i = 0; i < B; i++) {
            yue2_prefill(lm, kv, negatives, B, i, batched.data(), row0, rows, "Unconditional");
        }
    }
    fprintf(stderr, "[AR] %s prefill: %.0f ms, CFG=%.2f, top_k=%d, budget=%d, songs=%d, batch=%d\n", label,
            prefill_timer.ms(), (double) cfg_scale, s.top_k, s.max_tokens, B, N);

    out->assign((size_t) B, { {}, true });

    // Forwards a sequence still owes once it stops drawing: one for its end
    // token, two when the budget cut it on a content token. Negative while
    // it draws, zero once sealed.
    std::vector<int>           owed(B, -1);
    std::vector<int>           tokens(N);
    std::vector<float>         mixed(guided ? (size_t) rows : 0);
    std::vector<Yue2Candidate> candidates;
    int                        step = 0;
    for (;; step++) {
        if (cancelled && cancelled(cancel_data)) {
            fprintf(stderr, "[AR] Cancelled at step %d\n", step);
            return false;
        }
        bool pending = false;
        for (int i = 0; i < B; i++) {
            Yue2Generation & g = (*out)[i];
            if (owed[i] < 0) {
                const float * cond   = batched.data() + (size_t) i * rows;
                const float * logits = cond;
                if (guided) {
                    const float * uncond = batched.data() + (size_t) (B + i) * rows;
                    for (int k = 0; k < rows; k++) {
                        mixed[k] = uncond[k] + cfg_scale * (cond[k] - uncond[k]);
                    }
                    logits = mixed.data();
                }
                yue2_distribution(logits, s, g.tokens, step, phase, candidates);
                int token = yue2_draw(candidates, seed + i, step);
                tokens[i] = token;
                if (token == end) {
                    g.truncated = false;
                    owed[i]     = 1;
                    fprintf(stderr, "[AR] %s song %d: end token at step %d\n", label, i, step);
                } else {
                    g.tokens.push_back(token);
                    if ((int) g.tokens.size() >= s.max_tokens) {
                        owed[i] = 2;
                    }
                }
            } else {
                tokens[i] = end;
            }
            if (guided) {
                tokens[B + i] = tokens[i];
            }
            pending = pending || owed[i] != 0;
        }
        if (!pending) {
            break;
        }
        if ((step % 100) == 0) {
            fprintf(stderr, "[AR] %s %d/%d\n", label, step, s.max_tokens);
        }
        if (phase == YUE2_PHASE_SEMANTIC) {
            sliders_progress(lm->sliders, step + 1, s.max_tokens);   // HERESY 1166: each slider where its curve is now
        }
        qw3lm_forward_batch(lm, kv, tokens.data(), kv_sets.data(), N, batched.data(), row0, rows);
        for (int i = 0; i < B; i++) {
            if (owed[i] > 0) {
                owed[i]--;
            }
        }
    }

    size_t total = 0;
    for (int i = 0; i < B; i++) {
        const Yue2Generation & g = (*out)[i];
        total += g.tokens.size();
        fprintf(stderr, "[AR] %s song %d: %zu tokens%s\n", label, i, g.tokens.size(),
                g.truncated ? " (truncated)" : "");
    }
    fprintf(stderr, "[AR] %s: %zu tokens over %d songs, %d steps, %.1f s (%.1f ms/step)\n", label, total, B, step,
            timer.ms() / 1000.0, step > 0 ? timer.ms() / step : 0.0);
    return true;
}
