#pragma once
#include <cmath>
// pipeline.h: YuE2 generation pipeline
//
// Turns one request into tracks: a symbolic plan, a semantic token stream,
// the acoustic flow matching solved from the AR prefix cache, and the VAE
// decode to 48 kHz stereo, for every song of the batch and every noise
// variation of a song.
//
// The modules come from a ModelStore: the AR half for the two token stages,
// the NAR half and the VAE for the synthesis, required per stage and
// released after it, so the store can keep one half in VRAM at a time. The
// KV cache belongs to the pipeline: the NAR reads the cache the AR decode
// left complete, end token included, so a generated song that fits one
// chunk never prefills, and the cache outlives both halves. It lives for
// one generate under the strict policy, so the GPU is empty between
// requests, and stays under --keep-loaded.

#include "generate.h"
#include "model-store.h"
#include "nar.h"
#include "request.h"
#include "sliders.h"
#include "timer.h"
#include "torch-cpu-rng.h"
#include "vae.h"

#include <cstdlib>
#include <regex>
#include <cstring>
#include <optional>
#include <string>
#include <vector>

#define YUE2_SAMPLE_RATE 48000
#define YUE2_FRAME_RATE  25
#define YUE2_LATENT_DIM  64
#define YUE2_HOP         1920

// VRAM and compatibility knobs. The store policy decides which half stays
// resident; max_seq and max_batch size the cache, which the pipeline owns
// and never evicts.
struct Yue2PipelineParams {
    int  max_seq    = 0;              // 0 = model context, the whole 24576
    int  max_batch  = 1;              // song batch limit, one KV set per song, two under guidance
    bool no_fa      = false;          // disable flash attention
    bool no_fa_lm   = false;          // HERESY 1008: flash attention off in the music half (AR) only
    bool clamp_fp16 = false;          // clamp hidden states on sub-Ampere CUDA
    bool fp16_matmul = false;         // Local addition: batched BF16 matmuls on FP16 tensor cores (qwen3-enc.h)
    int  vae_core   = 512;            // VAE tile core frames
    int  vae_halo   = 16;             // VAE tile halo frames

    const char * dump_dir = nullptr;  // probe dumps of the first track for the cossim harness
};

struct Yue2Pipeline {
    ModelStore *       store = nullptr;   // borrowed, owned by the tool
    std::string        model_path;        // the backbone GGUF, both halves and the tokenizer
    std::string        vae_path;
    std::string        transcriber_path;  // the SheetSage2 GGUF, empty without one
    Yue2PipelineParams params;

    // Local additions: named decoders (the first is the default; vae_path is
    // its path) and the slider catalog, id -> GGUF path
    std::vector<std::pair<std::string, std::string>> vaes;
    std::vector<std::pair<std::string, std::string>> slider_files;
    // Local additions: the LoRA folder (a request names files by their path under
    // it), the set merged for the run in progress, and why the last run failed
    std::string              lora_dir;
    std::shared_ptr<LoraSet> loras;
    std::string              last_error;
    std::string              broken_score;  // HERESY 1087: the score a run was stopped for, shown to the user
    DebugDumper        dumper;

    // The cache, bound at configure to its config with the context override
    // and to the shared backend, held for the process lifetime
    Qw3lmKvCache kv;
    BackendPair  kv_backend;
    bool         configured = false;
};

struct Yue2Song {
    std::string        score;      // ABC of the plan, empty in off mode
    std::vector<int>   tokens;     // semantic stream, codec values
    std::vector<float> latents;    // acoustic latents, [T_lat, 64] time major
    std::vector<float> audio;      // planar stereo, [2, T_audio]
    int                T_audio;    // samples per channel
    int                T_lat;      // semantic frames
    bool               truncated;  // a stage hit its budget before its end token
};

// Parses the CSV interchange of a semantic stream
static bool pipeline_parse_tokens(const std::string & csv, std::vector<int> * out) {
    out->clear();
    const char * p = csv.c_str();
    while (*p) {
        while (*p == ',' || *p == ' ' || *p == '\n' || *p == '\r' || *p == '\t') {
            p++;
        }
        if (!*p) {
            break;
        }
        char * end   = nullptr;
        long   value = strtol(p, &end, 10);
        if (end == p || value < 0 || value >= YUE2_CODEC_SIZE) {
            fprintf(stderr, "[Pipeline] FATAL: semantic token outside [0, %d)\n", YUE2_CODEC_SIZE);
            return false;
        }
        out->push_back((int) value);
        p = end;
    }
    return !out->empty();
}

// Writes the CSV interchange of a semantic stream
static std::string pipeline_format_tokens(const std::vector<int> & tokens) {
    std::string csv;
    for (size_t i = 0; i < tokens.size(); i++) {
        csv += (i ? "," : "") + std::to_string(tokens[i]);
    }
    return csv;
}

// Record the paths and the knobs, load the tokenizer, read the backbone
// config the cache is sized from. No GPU module loads here, the first
// generate requires them and allocates the cache.
static bool pipeline_configure(Yue2Pipeline *             p,
                               const char *               model_path,
                               const char *               vae_path,
                               const Yue2PipelineParams & params) {
    p->model_path = model_path;
    p->vae_path   = vae_path;
    p->params     = params;
    debug_init(&p->dumper, params.dump_dir);
    if (params.no_fa) {
        fprintf(stderr, "[Pipeline] Flash attention disabled\n");
    }
    if (params.no_fa_lm) {   // HERESY 1008
        fprintf(stderr, "[Pipeline] Flash attention disabled in the music half (AR) only\n");
    }
    if (params.clamp_fp16) {
        fprintf(stderr, "[Pipeline] FP16 clamp enabled\n");
    }
    g_qwen3_fp16_matmul = params.fp16_matmul;  // Local addition
    if (params.fp16_matmul) {
        fprintf(stderr, "[Pipeline] FP16 matmul enabled (batched BF16 matmuls on the FP16 tensor cores)\n");
    }
    if (!store_bpe(p->store, model_path)) {
        return false;
    }

    Qwen3LMConfig cfg;
    if (!qw3lm_read_config(model_path, &cfg)) {
        return false;
    }
    if (params.max_seq > 0) {
        cfg.max_seq_len = params.max_seq;
    }
    p->kv_backend = backend_init("KV");
    qw3lm_kv_init(&p->kv, cfg, p->kv_backend.backend);
    p->configured = true;
    return true;
}

static void pipeline_free(Yue2Pipeline * p) {
    if (!p->configured) {
        return;
    }
    qw3lm_kv_free(&p->kv);
    backend_release(p->kv_backend.backend, p->kv_backend.cpu_backend);
    p->configured = false;
}

// Require helpers: one place builds the store key of each module from the
// configured paths, and applies the runtime knobs after every require
// (idempotent on cache hits). The NAR bakes them into its graph at build
// time, the LM reads them at every forward.
static Qwen3LM * require_lm(Yue2Pipeline * p) {
    ModelKey k = { MODEL_LM, p->model_path };
    if (p->loras && !p->loras->sig[0].empty()) {   // Local addition: the music half's LoRAs
        k.lora_sig = p->loras->sig[0];
        k.lora     = p->loras;
    }
    Qwen3LM * m = store_require_lm(p->store, k);
    if (!m && !g_gf_lora_error.empty()) {
        p->last_error = "LoRA: " + g_gf_lora_error;
    }
    if (m) {
        m->use_flash_attn = m->use_flash_attn && !p->params.no_fa && !p->params.no_fa_lm;
        m->clamp_fp16     = p->params.clamp_fp16;
    }
    return m;
}

static Yue2NAR * require_nar(Yue2Pipeline * p) {
    ModelKey k = { MODEL_NAR, p->model_path };
    if (p->loras && !p->loras->sig[1].empty()) {   // Local addition: the sound half's LoRAs
        k.lora_sig = p->loras->sig[1];
        k.lora     = p->loras;
    }
    Yue2NAR * m = store_require_nar(p->store, k);
    if (!m && !g_gf_lora_error.empty()) {
        p->last_error = "LoRA: " + g_gf_lora_error;
    }
    if (m) {
        m->use_flash_attn = m->use_flash_attn && !p->params.no_fa;
        m->clamp_fp16     = p->params.clamp_fp16;
    }
    return m;
}

static VAEGGML * require_vae(Yue2Pipeline * p, const std::string & path) {
    ModelKey k = { MODEL_VAE, path.empty() ? p->vae_path : path };
    return store_require_vae(p->store, k);
}

// Local addition: the decoder path of a request, "" meaning the default
static bool pipeline_vae_path(const Yue2Pipeline * p, const std::string & name, std::string * path) {
    if (name.empty()) {
        *path = p->vae_path;
        return true;
    }
    for (const auto & v : p->vaes) {
        if (v.first == name) {
            *path = v.second;
            return true;
        }
    }
    return false;
}

// Local addition: open the run's LoRAs and check every target against the model's
// shapes before anything loads; false with the reason
static bool pipeline_open_loras(Yue2Pipeline * p, const std::vector<Yue2LoraChoice> & choices, std::string * error) {
    if (p->lora_dir.empty()) {
        *error = "this server was started without a LoRA folder (--loras)";
        return false;
    }
    std::vector<std::tuple<std::string, double, double>> list;
    for (const Yue2LoraChoice & c : choices) {
        if (c.id.empty() || c.id[0] == '/' || c.id.find("..") != std::string::npos) {
            *error = "bad LoRA id '" + c.id + "'";
            return false;
        }
        std::string path = p->lora_dir + "/" + c.id;
        if (!std::filesystem::is_regular_file(path)) {
            *error = "no LoRA file '" + c.id + "'";
            return false;
        }
        if (!(c.ar >= 0.0f && c.ar <= 2.0f && c.nar >= 0.0f && c.nar <= 2.0f)) {
            *error = "LoRA strengths go from 0 to 2";
            return false;
        }
        list.emplace_back(path, c.ar, c.nar);
    }
    auto set = std::make_shared<LoraSet>();
    if (!lora_set_open(list, set.get(), error)) {
        return false;
    }
    GGUFModel gf;
    if (!gf_load(&gf, p->model_path.c_str())) {
        *error = "cannot read the model to check the LoRAs";
        return false;
    }
    bool ok = lora_bind(set.get(), gf_lora_rows, (void *) &gf, error);
    gf_close(&gf);
    if (ok) {
        p->loras = set;
    }
    return ok;
}

// Local addition: the GGUF path of a slider id, "" when unknown
static std::string pipeline_slider_path(const Yue2Pipeline * p, const std::string & id) {
    for (const auto & s : p->slider_files) {
        if (s.first == id) {
            return s.second;
        }
    }
    return "";
}

static SheetSage2 * require_ss2(Yue2Pipeline * p) {
    ModelKey     k = { MODEL_SS2, p->transcriber_path };
    SheetSage2 * m = store_require_ss2(p->store, k);
    if (m) {
        m->use_flash_attn = m->use_flash_attn && !p->params.no_fa;
    }
    return m;
}

// A recording to its ABC score, the chord symbols dropped when only the
// melody is wanted. The transcriber holds the GPU for the call and steps
// aside after it like the other stages.
static bool pipeline_transcribe(Yue2Pipeline * p,
                                const float *  audio,
                                int            n_samples,
                                bool           melody_only,
                                std::string *  abc,
                                std::string *  error) {
    SheetSage2 * m = require_ss2(p);
    if (!m) {
        *error = "transcriber unavailable";
        return false;
    }
    ModelHandle hold(p->store, m);
    return ss2_transcribe(m, audio, n_samples, melody_only, abc, error, &p->dumper);
}

// The cache of one generate: the stages grow it to the sets they need, a
// replay to the one set its prefill fills. Freed on every exit under the
// strict policy, kept under the other.
struct KvScope {
    Yue2Pipeline * p;

    ~KvScope() {
        if (store_policy(p->store) == EVICT_STRICT) {
            qw3lm_kv_free(&p->kv);
        }
    }
};

// Renders lm_batch_size songs times synth_batch_size variations, song-major:
// track song * M + variation. Song i draws its tokens with lm_seed + i in
// KV set i, variation j draws its noise with seed + j, and the M variations
// of a song solve in one NAR graph over the set the AR left complete.
// HERESY 1087: why a score the AR wrote is not a score, or "" when it is one. Calibrated on the studio's own
// takes (02.10.2026): every good score has M:, L: and K: with clean values (M:2/4, L:1/16, Q:1/4=71, K:Dm)
// and never two colons in a row; the broken ones have no K: line, garbage for Q:, colons in runs of 3 to 13.
// Three colons in a row are the cheapest sure sign (Viktor): a written score never has them.
static std::string yue2_score_broken(const std::string & abc) {
    std::string M, L, Q, K;
    bool        hasM = false, hasL = false, hasQ = false, hasK = false;
    size_t      pos = 0;
    for (int n = 0; pos < abc.size() && n < 40 && !hasK; n++) {
        size_t e = abc.find('\n', pos);
        if (e == std::string::npos) {
            e = abc.size();
        }
        std::string line = abc.substr(pos, e - pos);
        pos              = e + 1;
        while (!line.empty() && (line.back() == '\r' || line.back() == ' ' || line.back() == '\t')) {
            line.pop_back();
        }
        if (line.size() < 2 || line[1] != ':') {
            continue;
        }
        std::string v = line.substr(2);
        while (!v.empty() && v[0] == ' ') {
            v.erase(0, 1);
        }
        switch (line[0]) {
            case 'M': if (!hasM) { hasM = true; M = v; } break;
            case 'L': if (!hasL) { hasL = true; L = v; } break;
            case 'Q': if (!hasQ) { hasQ = true; Q = v; } break;
            case 'K': hasK = true; K = v; break;
            default: break;
        }
    }
    auto shown = [](const std::string & v) { return v.size() > 24 ? v.substr(0, 24) + "..." : v; };
    std::vector<std::string> why;
    if (!hasK) {
        why.push_back("no key line (K:)");
    } else if (!std::regex_match(K, std::regex(R"(^[A-G](#|b)?(m|min|maj|dor|phr|lyd|mix|aeo|loc|ion)?$)", std::regex::icase))) {
        why.push_back("the key line is not a key (K:" + shown(K) + ")");
    }
    if (!hasM) {
        why.push_back("no meter (M:)");
    } else if (!std::regex_match(M, std::regex(R"(^(\d{1,2}/\d{1,2}|C\|?)$)"))) {
        why.push_back("the meter is not a meter (M:" + shown(M) + ")");
    }
    if (!hasL) {
        why.push_back("no note length (L:)");
    } else if (!std::regex_match(L, std::regex(R"(^1/\d{1,3}$)"))) {
        why.push_back("the note length is not one (L:" + shown(L) + ")");
    }
    if (hasQ && !std::regex_match(Q, std::regex(R"(^(\d{1,2}/\d{1,2}=)?\d{2,3}$)"))) {
        why.push_back("the tempo is not a tempo (Q:" + shown(Q) + ")");
    }
    size_t run = 0, longest = 0;
    for (char c : abc) {
        run     = c == ':' ? run + 1 : 0;
        longest = run > longest ? run : longest;
    }
    if (longest >= 3) {
        why.push_back("colons in a run of " + std::to_string(longest));
    }
    std::string out;
    for (size_t i = 0; i < why.size(); i++) {
        out += (i ? "; " : "") + why[i];
    }
    return out;
}

static bool pipeline_generate(Yue2Pipeline *          p,
                              const Yue2Request &     r,
                              std::vector<Yue2Song> * songs,
                              bool (*cancelled)(void *) = nullptr,
                              void * cancel_data        = nullptr) {
    Timer   total_timer;
    Yue2Cot cot;
    if (!yue2_cot_parse(r.cot, &cot)) {
        fprintf(stderr, "[Pipeline] FATAL: cot must be full, melody or off\n");
        return false;
    }
    if (r.steps < 1 || r.lm_batch_size < 1 || r.synth_batch_size < 1) {
        fprintf(stderr, "[Pipeline] FATAL: steps and batch sizes must be positive\n");
        return false;
    }
    if (!yue2_sampling_valid(r.abc_sampling, "abc") || !yue2_sampling_valid(r.semantic_sampling, "semantic")) {
        return false;
    }
    std::string vae_path;
    if (!pipeline_vae_path(p, r.vae, &vae_path)) {
        fprintf(stderr, "[Pipeline] FATAL: unknown decoder '%s'\n", r.vae.c_str());
        return false;
    }
    if (r.plan_only && (cot == YUE2_COT_OFF || !r.abc.empty())) {
        fprintf(stderr, "[Pipeline] FATAL: plan_only needs full or melody mode and no supplied score\n");
        return false;
    }

    KvScope kv_scope = { p };

    // Local addition: the run's LoRAs, merged into each half as it loads and
    // dropped from the pipeline when the run ends (the store keys keep them apart)
    struct LoraScope {
        Yue2Pipeline * p;

        ~LoraScope() { p->loras.reset(); }
    } lora_scope = { p };
    p->last_error.clear();
    p->broken_score.clear();
    if (!r.loras.empty()) {
        std::string error;
        if (!pipeline_open_loras(p, r.loras, &error)) {
            fprintf(stderr, "[LoRA] FATAL: %s\n", error.c_str());
            p->last_error = "LoRA: " + error;
            return false;
        }
        for (const Yue2LoraChoice & c : r.loras) {
            fprintf(stderr, "[LoRA] %s: music %.2f, sound %.2f\n", c.id.c_str(), c.ar, c.nar);
        }
    }

    BPETokenizer * tok    = store_bpe(p->store, p->model_path.c_str());
    auto           encode = [tok](const std::string & text) {
        return bpe_encode(tok, text);
    };

    // A supplied stream is one song, the batch counter has nothing to draw
    bool replay = !r.semantic_tokens.empty();
    if (replay && r.lm_batch_size > 1) {
        fprintf(stderr, "[Pipeline] Replay: lm_batch_size ignored\n");
    }
    const int B = replay ? 1 : r.lm_batch_size;
    const int M = r.synth_batch_size;

    // Score per song: supplied by the caller, planned by the model, or absent
    std::vector<std::vector<int>> abc_ids(B);
    std::vector<std::string>      scores(B);
    std::vector<bool>             truncated(B, false);
    bool                          has_score = cot != YUE2_COT_OFF;
    bool                          planned   = has_score && r.abc.empty();

    // The AR half holds the GPU for the plan and the semantic stage, then
    // steps aside for the synthesis
    std::optional<ModelHandle> lm_hold;
    Qwen3LM *                  lm = nullptr;
    if (planned || !replay) {
        lm = require_lm(p);
        if (!lm) {
            return false;
        }
        lm_hold.emplace(p->store, lm);
    }
    if (has_score && !r.abc.empty()) {
        abc_ids.assign(B, encode(r.abc));
        scores.assign(B, r.abc);
    } else if (has_score) {
        std::vector<int>            open = yue2_build_prompt_ids(encode, cot, r.style, r.lyrics, nullptr);
        std::vector<Yue2Generation> plans;
        if (!yue2_generate(lm, &p->kv, std::vector<std::vector<int>>(B, open), {}, 1.0f, r.abc_sampling, r.lm_seed,
                           YUE2_PHASE_ABC, &plans, cancelled, cancel_data)) {
            return false;
        }
        for (int i = 0; i < B; i++) {
            abc_ids[i]   = plans[i].tokens;
            scores[i]    = bpe_decode(tok, abc_ids[i]);
            truncated[i] = plans[i].truncated;
        }
        // HERESY 1087 (Viktor, 02.10.2026): adapters pushed past their limits make the AR write garbage for a
        // score (no key, no meter, colons in runs). The music would be built on it; the run stops here instead.
        for (int i = 0; r.score_guard && i < B; i++) {
            std::string why = yue2_score_broken(scores[i]);
            if (!why.empty()) {
                fprintf(stderr, "[Pipeline] FATAL: the score of song %d is broken: %s\n", i, why.c_str());
                p->broken_score = scores[i];
                p->last_error   = "Broken score: " + why;
                return false;
            }
        }
    }

    // Local addition: the score alone, no music and no audio
    if (r.plan_only) {
        songs->assign((size_t) B, {});
        for (int i = 0; i < B; i++) {
            (*songs)[(size_t) i].score     = scores[i];
            (*songs)[(size_t) i].truncated = truncated[i];
            (*songs)[(size_t) i].T_audio   = 0;
            (*songs)[(size_t) i].T_lat     = 0;
        }
        fprintf(stderr, "[Pipeline] Done: score only, %d song%s in %.1f s\n", B, B > 1 ? "s" : "",
                total_timer.ms() / 1000.0);
        return true;
    }

    std::vector<std::vector<int>> prefixes(B);
    for (int i = 0; i < B; i++) {
        prefixes[i] = yue2_build_prompt_ids(encode, cot, r.style, r.lyrics, has_score ? &abc_ids[i] : nullptr);
    }
    fprintf(stderr, "[Prompt] cot=%s, songs=%d, variations=%d, %zu tracks\n", r.cot.c_str(), B, M, (size_t) B * M);

    float                         guidance = r.cfg_scale < 0.0f ? yue2_default_guidance(cot) : r.cfg_scale;
    std::vector<std::vector<int>> negatives;
    if (guidance != 1.0f) {
        negatives.resize(B);
        for (int i = 0; i < B; i++) {
            negatives[i] = yue2_build_negative_ids(encode, cot, has_score ? &abc_ids[i] : nullptr);
        }
    }

    std::vector<Yue2Generation> codes(B);
    SliderSet                   sliders;
    bool                        sliders_used = false;
    if (replay) {
        std::vector<int> values;
        if (!pipeline_parse_tokens(r.semantic_tokens, &values)) {
            return false;
        }
        codes[0].tokens.reserve(values.size());
        for (size_t i = 0; i < values.size(); i++) {
            codes[0].tokens.push_back(values[i] + YUE2_CODEC_OFFSET);
        }
        codes[0].truncated = false;
        fprintf(stderr, "[Pipeline] Replay: %zu frames supplied\n", codes[0].tokens.size());
    } else {
        // The requested length caps the budget of the stage, never raises it
        Yue2Sampling semantic = r.semantic_sampling;
        int          budget   = (int) (r.duration * (float) YUE2_FRAME_RATE);
        if (budget > 0 && budget < semantic.max_tokens) {
            fprintf(stderr, "[AR] Frame budget clamped to %d by the requested duration (%.1f s)\n", budget,
                    (double) r.duration);
            semantic.max_tokens = budget;
            if (semantic.min_tokens > semantic.max_tokens) {
                semantic.min_tokens = semantic.max_tokens;
            }
        }
        // Local addition: the sliders steer the music tokens only, then leave
        std::vector<std::pair<std::string, float>>        chosen;
        std::vector<std::vector<std::pair<float, float>>> curves;   // HERESY 1166: each slider's curve
        for (const Yue2SliderChoice & c : r.sliders) {
            std::string path = pipeline_slider_path(p, c.id);
            if (path.empty()) {
                fprintf(stderr, "[Sliders] FATAL: unknown slider '%s'\n", c.id.c_str());
                return false;
            }
            chosen.push_back({ path, c.strength });
            curves.push_back(c.curve);
        }
        if (!sliders_load(&sliders, lm->backend, chosen, lm->cfg.n_layers, curves)) {
            return false;
        }
        sliders_used = sliders_active(&sliders);
        qw3lm_set_sliders(lm, &sliders);
        // HERESY 1037: regenerate from here. The kept codes follow the prompt (after the music start
        // token, where the stage's own codes would be) in the conditional and the unconditional
        // prefixes of this stage only; the acoustic stage below keeps the plain prompt and gets the
        // kept codes in front of the new ones. The kept part counts in the budget.
        std::vector<int>              keep;
        std::vector<std::vector<int>> gen_prefixes = prefixes, gen_negatives = negatives;
        if (!r.semantic_keep.empty()) {
            if (!pipeline_parse_tokens(r.semantic_keep, &keep)) {
                return false;
            }
            for (int & t : keep) {
                t += YUE2_CODEC_OFFSET;
            }
            if ((int) keep.size() + 1 >= semantic.max_tokens) {
                fprintf(stderr, "[AR] FATAL: %zu kept frames leave no budget of %d\n", keep.size(), semantic.max_tokens);
                return false;
            }
            for (int i = 0; i < B; i++) {
                gen_prefixes[i].insert(gen_prefixes[i].end(), keep.begin(), keep.end());
                if (!gen_negatives.empty()) {
                    gen_negatives[i].insert(gen_negatives[i].end(), keep.begin(), keep.end());
                }
            }
            semantic.max_tokens -= (int) keep.size();
            semantic.min_tokens = semantic.min_tokens > (int) keep.size() ? semantic.min_tokens - (int) keep.size() : 1;
            if (semantic.min_tokens > semantic.max_tokens) {
                semantic.min_tokens = semantic.max_tokens;
            }
            fprintf(stderr, "[AR] Continuing after %zu kept frames (%.1f s), budget %d\n", keep.size(),
                    keep.size() / (double) YUE2_FRAME_RATE, semantic.max_tokens);
        }
        sliders.kept     = (int) keep.size();     // HERESY 1166: a curve runs over the whole song, the kept part too
        bool semantic_ok = yue2_generate(lm, &p->kv, gen_prefixes, gen_negatives, guidance, semantic, r.lm_seed,
                                         YUE2_PHASE_SEMANTIC, &codes, cancelled, cancel_data);
        if (semantic_ok && !keep.empty()) {
            for (int i = 0; i < B; i++) {
                codes[i].tokens.insert(codes[i].tokens.begin(), keep.begin(), keep.end());
            }
        }
        qw3lm_set_sliders(lm, nullptr);
        sliders_free(&sliders);
        if (!semantic_ok) {
            return false;
        }
        if (sliders_used) {
            fprintf(stderr, "[Sliders] Detached; the acoustic stage re-reads the song without them\n");
        }
    }

    // Acoustic chunks: the context holds the prefix, the codes of the chunk
    // and their latent block twice over, once as tokens and once as frames
    const int context = p->kv.cfg.max_seq_len;
    int       row0, rows;
    yue2_phase_rows(YUE2_PHASE_SEMANTIC, &row0, &rows);
    std::vector<float> probe((size_t) rows);
    std::vector<int>   chunk_sizes(B);

    songs->assign((size_t) B * M, {});
    for (int i = 0; i < B; i++) {
        int T_lat = (int) codes[i].tokens.size();
        if (T_lat < 1) {
            fprintf(stderr, "[Pipeline] FATAL: empty semantic stream\n");
            return false;
        }
        chunk_sizes[i] = (context - (int) prefixes[i].size() - 3) / 2;
        if (chunk_sizes[i] < 1) {
            fprintf(stderr, "[Pipeline] FATAL: prefix %zu leaves no acoustic context in %d\n", prefixes[i].size(),
                    context);
            return false;
        }
        for (int j = 0; j < M; j++) {
            Yue2Song & song = (*songs)[(size_t) i * M + j];
            song.score      = scores[i];
            song.T_lat      = T_lat;
            song.truncated  = truncated[i] || codes[i].truncated;
            song.tokens.reserve(codes[i].tokens.size());
            for (size_t k = 0; k < codes[i].tokens.size(); k++) {
                song.tokens.push_back(codes[i].tokens[k] - YUE2_CODEC_OFFSET);
            }
            // The noise of a variation is drawn once for the whole song, each
            // chunk taking its view
            song.latents.assign((size_t) T_lat * YUE2_LATENT_DIM, 0.0f);
            torch_cpu_randn((uint64_t) (r.seed + j), song.latents.data(), (int64_t) song.latents.size());
        }
    }

    // A generated song spanning several chunks has its first one sealed while
    // the AR half still holds the GPU: the set carries the whole stream, the
    // end token takes the row that closes the chunk
    if (!replay && !sliders_used) {
        for (int i = 0; i < B; i++) {
            if ((int) codes[i].tokens.size() > chunk_sizes[i]) {
                int end = YUE2_MUSIC_END;
                qw3lm_kv_trim(&p->kv, i, (int) prefixes[i].size() + chunk_sizes[i]);
                qw3lm_forward(lm, &p->kv, &end, 1, i, probe.data(), row0, rows);
            }
        }
    }
    lm_hold.reset();

    std::vector<float> block;
    DebugDumper        quiet;
    debug_init(&quiet, nullptr);

    // The NAR stays resident across songs and chunks, and steps aside for
    // the prefill of a chunk
    std::optional<ModelHandle> nar_hold;
    Yue2NAR *                  nar = nullptr;
    if (!qw3lm_kv_sets(&p->kv, 1)) {
        return false;
    }
    for (int i = 0; i < B; i++) {
        const int prefix_len = (int) prefixes[i].size();
        const int chunk_size = chunk_sizes[i];
        const int T_lat      = (int) codes[i].tokens.size();
        int       chunks     = (T_lat + chunk_size - 1) / chunk_size;
        fprintf(stderr, "[NAR] Song %d: %d frames (%.1f s), prefix %d, %d chunk%s of %d, %d variation%s\n", i, T_lat,
                (float) T_lat / (float) YUE2_FRAME_RATE, prefix_len, chunks, chunks > 1 ? "s" : "", chunk_size, M,
                M > 1 ? "s" : "");
        for (int start = 0; start < T_lat; start += chunk_size) {
            Timer chunk_timer;
            int   frames = T_lat - start < chunk_size ? T_lat - start : chunk_size;
            int   ar_len = prefix_len + frames + 1;

            // The chunk sequence is the prefix, the codes of the chunk and the
            // end token. Its head already sits in the set, the whole prefix
            // from the second chunk on and the sealed sequence of a generated
            // song for the first one, so only the tail is forwarded and its
            // logits go nowhere.
            std::vector<int> sequence = prefixes[i];
            sequence.insert(sequence.end(), codes[i].tokens.begin() + start, codes[i].tokens.begin() + start + frames);
            sequence.push_back(YUE2_MUSIC_END);
            // With sliders the cache the AR decode left carries their steer, so
            // the first chunk re-prefills the whole sequence without them
            const int kept = start > 0 ? prefix_len : ((replay || sliders_used) ? 0 : ar_len);
            if (kept < ar_len) {
                nar_hold.reset();
                nar                = nullptr;
                Qwen3LM * lm_chunk = require_lm(p);
                if (!lm_chunk) {
                    return false;
                }
                ModelHandle lm_chunk_hold(p->store, lm_chunk);
                qw3lm_kv_trim(&p->kv, i, kept);
                qw3lm_forward(lm_chunk, &p->kv, sequence.data() + kept, ar_len - kept, i, probe.data(), row0, rows);
            }
            if (!nar) {
                nar = require_nar(p);
                if (!nar) {
                    return false;
                }
                nar_hold.emplace(p->store, nar);
            }

            // The first chunk of the first song feeds the cossim harness: the
            // sequence the latent block attends to, then the solver probes
            const DebugDumper * dbg = i == 0 && start == 0 ? &p->dumper : &quiet;
            if (dbg->enabled) {
                std::vector<float> ids(sequence.begin(), sequence.end());
                debug_dump_1d(dbg, "ar_ids", ids.data(), (int) ids.size());
            }

            // The M variations of the chunk solve side by side
            size_t span = (size_t) frames * YUE2_LATENT_DIM;
            block.resize(span * M);
            for (int j = 0; j < M; j++) {
                memcpy(block.data() + span * j,
                       (*songs)[(size_t) i * M + j].latents.data() + (size_t) start * YUE2_LATENT_DIM,
                       span * sizeof(float));
            }
            // HERESY 1039: the attention of one pass holds heads x variations x frames x keys elements;
            // past 2^31 a CUDA kernel indexes out of bounds ("illegal memory access") and the whole
            // server aborts. Measured: a 4:35 song (prefix 9415) died with 2 variations and rendered
            // with 1. The variations are solved in groups small enough for one pass; each draws on
            // its own noise and the same cache, so the result is the one a single pass would give.
            // keys: the cached sequence plus the chunk's own latents, padded (measured boundary: 1 variation
            // of 6874 frames over ar_len 16290 rendered, 2 overflowed)
            const double per_variation = (double) nar->cfg.n_heads * (double) frames * (double) (ar_len + frames + 256);
            int          group         = (int) std::max(1.0, std::floor(2147483647.0 / per_variation));
            if (group > M) {
                group = M;
            }
            if (group < M) {
                fprintf(stderr, "[NAR] Song %d chunk %d: %d variations solved %d at a time (one pass would overflow)\n", i,
                        start / chunk_size + 1, M, group);
            }
            for (int g0 = 0; g0 < M; g0 += group) {
                int gm = std::min(group, M - g0);
                if (!nar_solve(nar, &p->kv, block.data() + span * (size_t) g0, frames, gm, ar_len, i, r.steps, dbg,
                               cancelled, cancel_data, r.solver)) {
                    return false;
                }
            }
            for (int j = 0; j < M; j++) {
                memcpy((*songs)[(size_t) i * M + j].latents.data() + (size_t) start * YUE2_LATENT_DIM,
                       block.data() + span * j, span * sizeof(float));
            }
            fprintf(stderr, "[NAR] Song %d chunk %d/%d: %d frames, cache %d rows, %d forwarded, %.1f s\n", i,
                    start / chunk_size + 1, chunks, frames, ar_len, ar_len - kept, chunk_timer.ms() / 1000.0);
        }
    }

    nar_hold.reset();
    VAEGGML * vae = require_vae(p, vae_path);
    if (!vae) {
        return false;
    }
    ModelHandle vae_hold(p->store, vae);
    for (size_t t = 0; t < songs->size(); t++) {
        Yue2Song & song        = (*songs)[t];
        int        max_T_audio = song.T_lat * YUE2_HOP;
        fprintf(stderr, "[VAE] Track %zu/%zu: song %zu variation %zu\n", t + 1, songs->size(), t / M, t % M);
        song.audio.assign((size_t) 2 * max_T_audio, 0.0f);
        song.T_audio = vae_ggml_decode_tiled(vae, song.latents.data(), song.T_lat, song.audio.data(), max_T_audio,
                                             p->params.vae_core, p->params.vae_halo, cancelled, cancel_data);
        if (song.T_audio < 0) {
            return false;
        }
        song.audio.resize((size_t) 2 * song.T_audio);
        if (t == 0 && p->dumper.enabled) {
            // Interleaved [T_audio, 2] like the torch reference dump
            std::vector<float> interleaved((size_t) 2 * song.T_audio);
            for (int k = 0; k < song.T_audio; k++) {
                interleaved[(size_t) 2 * k]     = song.audio[(size_t) k];
                interleaved[(size_t) 2 * k + 1] = song.audio[(size_t) song.T_audio + k];
            }
            debug_dump_2d(&p->dumper, "vae_audio", interleaved.data(), song.T_audio, 2);
        }
    }

    float seconds = 0.0f;
    for (size_t t = 0; t < songs->size(); t++) {
        seconds += (float) (*songs)[t].T_audio / (float) YUE2_SAMPLE_RATE;
    }
    fprintf(stderr, "[Pipeline] Done: %zu tracks, %.1f s of audio in %.1f s (%.1fx realtime)\n", songs->size(), seconds,
            total_timer.ms() / 1000.0, seconds / (float) (total_timer.ms() / 1000.0));
    return true;
}
