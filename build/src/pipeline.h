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
// requests, and stays under --keep-loaded. The adapters of a request merge
// into the halves at load, a half under another adapter list being another
// module of the store.

#include "audio-resample.h"
#include "generate.h"
#include "model-store.h"
#include "nar.h"
#include "request.h"
#include "sliders.h"
#include "timer.h"
#include "torch-cpu-rng.h"
#include "vae-enc.h"
#include "vae.h"

#include <cstdlib>
#include <regex>
#include <cstring>
#include <cctype>   // HERESY 1743
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

    const char * dump_dir     = nullptr;  // probe dumps of the first track for the cossim harness
    const char * adapters_dir = nullptr;  // the adapters requests can stack, none without it
};

struct Yue2Pipeline {
    ModelStore *       store = nullptr;   // borrowed, owned by the tool
    std::string        model_path;        // the backbone GGUF, both halves and the tokenizer
    std::string        vae_path;
    std::string        transcriber_path;  // the SheetSage2 GGUF, empty without one
    std::string        tokenizer_path;    // upstream: the audio tokenizer GGUF, empty without one
    Yue2PipelineParams params;
    std::vector<AdapterEntry> adapters;   // upstream: the adapter directory, scanned at configure

    // Local additions: named decoders (the first is the default; vae_path is
    // its path) and the slider catalog, id -> GGUF path
    std::vector<std::pair<std::string, std::string>> vaes;
    std::vector<std::pair<std::string, std::string>> slider_files;
    // Local additions: the LoRA folder (a request names files by their path under
    // it), the set merged for the run in progress, and why the last run failed
    std::string              lora_dir;
    std::shared_ptr<LoraSet> loras;
    // HERESY 1447: the run's LoRAs that run with the graph (a wave or a budget): their source, opened at strength 1 and
    // bound to the model; each half's choices; the budgets; each half's set as built on the model it was built for
    std::shared_ptr<LoraSet>  lora_rt_src;
    std::vector<LoraRtChoice> lora_rt_choices[2];
    std::vector<LoraRtGroup>  lora_rt_groups[2];
    LoraRtSet                 lora_rt[2];
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
    // HERESY 1399: the take's medcard, stage by stage (seconds of the whole batch's stage; tokens of this song)
    int    score_tokens    = 0;      // the plan written here (0: supplied, or no score)
    double score_seconds   = 0.0;
    int    music_tokens    = 0;      // semantic frames written in this run
    int    music_kept      = 0;      // frames kept from an earlier take and gone on from
    bool   music_replayed  = false;  // the frames supplied (a retake of the same music)
    double music_seconds   = 0.0;
    float  guidance        = 0.0f;   // the music's guidance as applied
    float  lyrics_guidance = 0.0f;   // the lyrics' own (HERESY 1397)
    double sound_seconds   = 0.0;    // the acoustic stage
    double vae_seconds     = 0.0;    // this track's decoding
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
    if (params.adapters_dir) {
        p->adapters = adapter_scan(params.adapters_dir);
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

// The adapters of a request resolved to their files, split by the half each
// changes. A zero strength leaves the halves as they are.
static bool pipeline_adapters(const Yue2Pipeline *      p,
                              const Yue2Request &       r,
                              std::vector<AdapterUse> * ar,
                              std::vector<AdapterUse> * nar) {
    for (const Yue2Adapter & a : r.adapters) {
        const AdapterEntry * e = adapter_find(p->adapters, a.name);
        if (!e) {
            fprintf(stderr, "[Pipeline] FATAL: adapter %s not found\n", a.name.c_str());
            return false;
        }
        if (a.scale == 0.0f) {
            continue;
        }
        if (e->halves & ADAPTER_AR) {
            ar->push_back({ e->path, a.scale });
        }
        if (e->halves & ADAPTER_NAR) {
            nar->push_back({ e->path, a.scale });
        }
    }
    return true;
}

// Require helpers: one place builds the store key of each module from the
// configured paths, and applies the runtime knobs after every require
// (idempotent on cache hits). The NAR bakes them into its graph at build
// time, the LM reads them at every forward.
// HERESY 1447: the run's set of a half on the model just required: kept when built for this very model (its weights the
// same), built anew otherwise; false with the reason in last_error
static bool pipeline_lora_rt(Yue2Pipeline * p, int half, const void * model, ggml_backend_t backend, int n_layers,
                             const void * weights) {
    LoraRtSet & set = p->lora_rt[half];
    if (p->lora_rt_choices[half].empty() || !p->lora_rt_src) {
        return true;
    }
    if (set.allocated && set.owner == model && set.owner_buf == weights) {
        return true;
    }
    std::string error;
    if (!lora_rt_load(&set, backend, p->lora_rt_src.get(), p->lora_rt_choices[half], p->lora_rt_groups[half], half, n_layers, model,
                      half == 1 ? p->kv.cfg.max_seq_len : 0, &error)) {
        fprintf(stderr, "[LoRA] FATAL: %s\n", error.c_str());
        p->last_error = "LoRA: " + error;
        return false;
    }
    set.owner_buf = weights;
    return true;
}

static Qwen3LM * require_lm(Yue2Pipeline * p, const std::vector<AdapterUse> & adapters) {
    ModelKey k = { MODEL_LM, p->model_path, adapters };   // upstream's adapters in the key too (1603)
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
        // HERESY 1447: the run's LoRAs that run with the graph, or none (a set of a run before is never left on it)
        if (!pipeline_lora_rt(p, 0, m, m->backend, m->cfg.n_layers, m->wctx.buffer)) {
            qw3lm_set_lora_rt(m, nullptr);
            return nullptr;
        }
        qw3lm_set_lora_rt(m, p->lora_rt_choices[0].empty() ? nullptr : &p->lora_rt[0]);
    }
    return m;
}

static Yue2NAR * require_nar(Yue2Pipeline * p, const std::vector<AdapterUse> & adapters) {
    ModelKey k = { MODEL_NAR, p->model_path, adapters };   // upstream's adapters in the key too (1603)
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
        // HERESY 1447: as the music half's (the graph is built at every evaluation and reads it then)
        if (!pipeline_lora_rt(p, 1, m, m->backend, m->cfg.n_layers, m->wctx.buffer)) {
            m->lora_rt = nullptr;
            return nullptr;
        }
        m->lora_rt = p->lora_rt_choices[1].empty() ? nullptr : &p->lora_rt[1];
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
static bool pipeline_open_loras(Yue2Pipeline * p, const std::vector<Yue2LoraChoice> & choices,
                                const std::vector<Yue2LoraGroup> & groups, std::string * error) {
    if (p->lora_dir.empty()) {
        *error = "this server was started without a LoRA folder (--loras)";
        return false;
    }
    std::vector<std::tuple<std::string, double, double>> list, rt;   // 1447: rt, the graph's, at strength 1
    std::vector<LoraRtChoice>                            rt_choices[2];
    std::vector<std::pair<size_t, std::pair<bool, bool>>> skips;   // 1447: a merged file's A and B left to the graph
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
        // HERESY 1447: a wave or a budget takes the adapter off the merge, in each half it reaches with A and B only
        const bool graph = !c.curve.empty() || (c.group >= 0 && c.group < (int) groups.size());
        float      merge[2] = { c.ar, c.nar };
        if (graph) {
            LoraFile lf;
            if (!lora_plan(path, &lf)) {
                *error = c.id + ": " + lf.error;
                return false;
            }
            bool full[2] = { false, false }, low[2] = { false, false };
            for (const LoraGroup & g : lf.groups) {
                full[g.half] |= g.kind != LoraGroup::LORA;
                low[g.half] |= g.kind == LoraGroup::LORA;
            }
            float on_graph[2] = { 0.0f, 0.0f };
            bool  skip[2]     = { false, false };
            for (int h = 0; h < 2; h++) {
                const float s = h ? c.nar : c.ar;
                if (s == 0.0f || !low[h]) {
                    if (s != 0.0f) {
                        fprintf(stderr, "[LoRA] %s has no A and B in the %s half: merged there at %.2f, its wave and budget not applied\n",
                                c.id.c_str(), h ? "sound" : "music", (double) s);
                    }
                    continue;
                }
                on_graph[h] = s;
                if (full[h]) {  // its full deltas merged at their flat strength, its A and B on the wave
                    skip[h] = true;
                    fprintf(stderr, "[LoRA] %s: its full deltas in the %s half merged at %.2f, its A and B on the wave\n",
                            c.id.c_str(), h ? "sound" : "music", (double) s);
                } else {
                    merge[h] = 0.0f;
                }
            }
            rt.emplace_back(path, 1.0, 1.0);
            for (int h = 0; h < 2; h++) {
                LoraRtChoice rc;
                rc.path     = path;
                rc.id       = c.id;
                rc.strength = on_graph[h];
                rc.curve    = c.curve;
                rc.group    = c.group;
                rt_choices[h].push_back(rc);
            }
            skips.push_back({ list.size(), { skip[0], skip[1] } });
        }
        list.emplace_back(path, merge[0], merge[1]);
    }
    auto set = std::make_shared<LoraSet>();
    if (!lora_set_open(list, set.get(), error)) {
        return false;
    }
    if (!skips.empty()) {  // HERESY 1447: those files' A and B out of the merge, and their store keys say so
        set->lora_skip.assign(set->files.size(), { false, false });
        for (const auto & sk : skips) {
            set->lora_skip[sk.first] = sk.second;
            for (int h = 0; h < 2; h++) {
                if (h ? sk.second.second : sk.second.first) {
                    set->sig[h] += "~full-deltas-only:" + std::get<0>(list[sk.first]) + ";";
                }
            }
        }
    }
    GGUFModel gf;
    if (!gf_load(&gf, p->model_path.c_str())) {
        *error = "cannot read the model to check the LoRAs";
        return false;
    }
    bool ok = lora_bind(set.get(), gf_lora_rows, (void *) &gf, error);
    std::shared_ptr<LoraSet> rt_set;
    if (ok && !rt.empty()) {  // HERESY 1447: the graph's, at strength 1, checked against the model as the merge's are
        rt_set = std::make_shared<LoraSet>();
        ok     = lora_set_open(rt, rt_set.get(), error) && lora_bind(rt_set.get(), gf_lora_rows, (void *) &gf, error);
    }
    gf_close(&gf);
    if (ok) {
        p->loras = set;
        if (rt_set) {
            p->lora_rt_src = rt_set;
            for (int h = 0; h < 2; h++) {
                bool any = false;
                for (const LoraRtChoice & rc : rt_choices[h]) {
                    any |= rc.strength != 0.0f;
                }
                p->lora_rt_choices[h] = any ? rt_choices[h] : std::vector<LoraRtChoice>{};
            }
            for (int h = 0; h < 2; h++) {   // each half its own cap
                p->lora_rt_groups[h].clear();
                for (const Yue2LoraGroup & g : groups) {
                    LoraRtGroup G;
                    G.cap  = h ? g.cap_nar : g.cap;
                    G.mode = g.mode;
                    p->lora_rt_groups[h].push_back(G);
                }
            }
        }
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

static VAEGGML * require_vae(Yue2Pipeline * p) {
    ModelKey k = { MODEL_VAE, p->vae_path, {} };
    return store_require_vae(p->store, k);
}

static VAEEncoder * require_vae_enc(Yue2Pipeline * p) {
    ModelKey k = { MODEL_VAE_ENC, p->vae_path, {} };
    return store_require_vae_enc(p->store, k);
}

// Latents [T_lat, 64] time major to 48 kHz planar stereo [2, T_audio]
static bool pipeline_decode(Yue2Pipeline *       p,
                            VAEGGML *            vae,
                            const float *        latents,
                            int                  T_lat,
                            std::vector<float> * audio,
                            int *                T_audio,
                            bool (*cancelled)(void *),
                            void * cancel_data) {
    int max_T_audio = T_lat * YUE2_HOP;
    audio->assign((size_t) 2 * max_T_audio, 0.0f);
    *T_audio = vae_ggml_decode_tiled(vae, latents, T_lat, audio->data(), max_T_audio, p->params.vae_core,
                                     p->params.vae_halo, cancelled, cancel_data);
    if (*T_audio < 0) {
        return false;
    }
    audio->resize((size_t) 2 * *T_audio);
    return true;
}

// A recording to its latents: planar stereo at any rate, each channel
// resampled to 48 kHz, through the VAE encoder; [T_lat, 64] time major
static bool pipeline_encode(Yue2Pipeline *       p,
                            const float *        planar,
                            int                  T,
                            int                  sr,
                            std::vector<float> * latents,
                            int *                T_lat) {
    int                T_audio = T;
    std::vector<float> channels[2];
    for (int c = 0; c < 2; c++) {
        if (sr == YUE2_SAMPLE_RATE) {
            channels[c].assign(planar + (size_t) c * T, planar + (size_t) (c + 1) * T);
            continue;
        }
        float * rs = audio_resample(planar + (size_t) c * T, T, sr, YUE2_SAMPLE_RATE, 1, &T_audio);
        if (!rs) {
            return false;
        }
        channels[c].assign(rs, rs + T_audio);
        free(rs);
    }
    std::vector<float> interleaved((size_t) 2 * T_audio);
    for (int t = 0; t < T_audio; t++) {
        interleaved[(size_t) 2 * t]     = channels[0][(size_t) t];
        interleaved[(size_t) 2 * t + 1] = channels[1][(size_t) t];
    }
    VAEEncoder * enc = require_vae_enc(p);
    if (!enc) {
        return false;
    }
    ModelHandle hold(p->store, enc);
    int         max_T_lat = T_audio / YUE2_HOP + 1;
    latents->assign((size_t) max_T_lat * YUE2_LATENT_DIM, 0.0f);
    *T_lat = vae_enc_encode_tiled(enc, interleaved.data(), T_audio, latents->data(), max_T_lat, p->params.vae_core,
                                  p->params.vae_halo);
    if (*T_lat < 0) {
        return false;
    }
    latents->resize((size_t) *T_lat * YUE2_LATENT_DIM);
    return true;
}

static AudioTokenizer * require_atok(Yue2Pipeline * p) {
    ModelKey         k = { MODEL_ATOK, p->tokenizer_path, {} };
    AudioTokenizer * m = store_require_atok(p->store, k);
    if (m) {
        m->use_flash_attn = m->use_flash_attn && !p->params.no_fa;
    }
    return m;
}

static SheetSage2 * require_ss2(Yue2Pipeline * p) {
    ModelKey     k = { MODEL_SS2, p->transcriber_path, {} };
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

// A recording to its semantic codes, the stream a replay renders. The
// tokenizer holds the GPU for the call and steps aside after it.
static bool pipeline_tokenize(Yue2Pipeline *     p,
                              const float *      audio,
                              int                n_samples,
                              std::vector<int> * codes,
                              std::string *      error) {
    AudioTokenizer * m = require_atok(p);
    if (!m) {
        *error = "audio tokenizer unavailable";
        return false;
    }
    ModelHandle hold(p->store, m);
    if (!atok_tokenize(m, audio, n_samples, codes, &p->dumper)) {
        *error = "tokenization failed";
        return false;
    }
    return true;
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

// The codes of a continuation: the section [source_start, source_end) of
// the source stream opens the song, the AR writes on behind the prompt and
// it until the requested length or its end token. The whole song is then
// rendered like a generated one, the section included.
static bool pipeline_continue_codes(Yue2Pipeline *           p,
                                    Qwen3LM *                lm,
                                    const Yue2Request &      r,
                                    const std::vector<int> & prompt,
                                    const std::vector<int> * negative,
                                    float                    guidance,
                                    Yue2Generation *         codes,
                                    bool (*cancelled)(void *),
                                    void * cancel_data) {
    std::vector<int> values;
    if (!pipeline_parse_tokens(r.source_tokens, &values)) {
        return false;
    }
    const int T_src = (int) values.size();
    const int a     = std::clamp((int) lroundf(r.source_start * YUE2_FRAME_RATE), 0, T_src);
    const int b     = r.source_end < 0.0f ? T_src : std::clamp((int) lroundf(r.source_end * YUE2_FRAME_RATE), 0, T_src);
    if (b <= a) {
        fprintf(stderr, "[Continue] FATAL: empty source section %.2f s .. %.2f s\n", (double) r.source_start,
                (double) r.source_end);
        return false;
    }

    // The requested length counts the section, the stage keeps its own cap
    Yue2Sampling sampling = r.semantic_sampling;
    int          budget   = sampling.max_tokens - (b - a);
    if (r.duration > 0.0f) {
        budget = std::min(budget, (int) (r.duration * (float) YUE2_FRAME_RATE) - (b - a));
    }
    if (budget < 1) {
        fprintf(stderr, "[Continue] FATAL: nothing left to write after the %d frames of the section\n", b - a);
        return false;
    }
    sampling.max_tokens = budget;
    sampling.min_tokens = std::min(sampling.min_tokens, budget);
    fprintf(stderr, "[Continue] Source %d frames, section [%d, %d), budget %d\n", T_src, a, b, budget);

    std::vector<int> section((size_t) (b - a));
    for (int f = a; f < b; f++) {
        section[(size_t) (f - a)] = values[(size_t) f] + YUE2_CODEC_OFFSET;
    }
    std::vector<std::vector<int>> prefixes(1, prompt), negatives;
    prefixes[0].insert(prefixes[0].end(), section.begin(), section.end());
    if (negative) {
        negatives.assign(1, *negative);
        negatives[0].insert(negatives[0].end(), section.begin(), section.end());
    }
    std::vector<Yue2Generation> drawn;
    if (!yue2_generate(lm, &p->kv, prefixes, negatives, guidance, sampling, r.lm_seed, YUE2_PHASE_SEMANTIC, &drawn,
                       cancelled, cancel_data)) {
        return false;
    }
    codes->tokens = section;
    codes->tokens.insert(codes->tokens.end(), drawn[0].tokens.begin(), drawn[0].tokens.end());
    codes->truncated = drawn[0].truncated;
    return true;
}

// Renders lm_batch_size songs times synth_batch_size variations, song-major:
// track song * M + variation. Song i draws its tokens with lm_seed + i in
// KV set i, variation j draws its noise with seed + j, and the M variations
// of a song solve in one NAR graph over the set the AR left complete. With
// source_tokens, the song opens on the section of the source the request
// names and the AR writes on from it.
// HERESY 1416: a score without its tempo: the lines that begin with Q: go, and the inline [Q:…] fields within the others
static std::string yue2_score_without_tempo(const std::string & abc, int * dropped) {
    std::string out;
    int         n   = 0;
    size_t      pos = 0;
    while (pos <= abc.size()) {
        size_t e = abc.find('\n', pos);
        if (e == std::string::npos) {
            e = abc.size();
        }
        std::string line = abc.substr(pos, e - pos);
        pos              = e + 1;
        if (line.rfind("Q:", 0) == 0) {
            n++;
        } else {
            for (size_t q = line.find("[Q:"); q != std::string::npos; q = line.find("[Q:")) {
                size_t z = line.find(']', q);
                if (z == std::string::npos) {
                    break;
                }
                line.erase(q, z - q + 1);
                n++;
            }
            out += line;
            if (e < abc.size()) {
                out += '\n';
            }
        }
        if (e >= abc.size()) {
            break;
        }
    }
    if (dropped) {
        *dropped = n;
    }
    return out;
}

// HERESY 1743: a score with its Vocal voice moved by whole octaves. Only notes move, each by its own octave marks (C, → C → c → c'), so a
// letter keeps its name and the key and the accidentals stand. The header (to the first K:) is left as it is; in the body, field lines (K: V: w: …),
// comments, chord symbols "…", decorations !…! and +…+ and inline fields [K:…] are copied; a V: line or an inline [V:…] says whose notes follow.
// Chords [ceg] and grace notes {g} move with their voice.
static bool yue2_voice_is_vocal(const std::string & spec) {
    size_t a = spec.find_first_not_of(" \t");
    if (a == std::string::npos) {
        return false;
    }
    size_t b = spec.find_first_of(" \t]", a);
    return spec.compare(a, b == std::string::npos ? std::string::npos : b - a, "Vocal") == 0;
}

static std::string yue2_score_vocal_octave(const std::string & abc, int octaves, int * moved) {
    std::string out;
    int         n     = 0;
    bool        body  = false;
    bool        vocal = false;
    size_t      pos   = 0;
    while (pos <= abc.size()) {
        size_t e = abc.find('\n', pos);
        if (e == std::string::npos) {
            e = abc.size();
        }
        const std::string line = abc.substr(pos, e - pos);
        pos                    = e + 1;
        const bool note_letter = !line.empty() && std::strchr("ABCDEFGabcdefg", line[0]) != nullptr;
        const bool field = line.size() >= 2 && std::isalpha((unsigned char) line[0]) && line[1] == ':' && !(body && note_letter);
        if (!body || field || line.empty() || line[0] == '%') {
            if (field && line[0] == 'K') {
                body = true;
            } else if (field && line[0] == 'V' && body) {
                vocal = yue2_voice_is_vocal(line.substr(2));
            }
            out += line;
        } else {
            size_t i = 0;
            while (i < line.size()) {
                const char c = line[i];
                if (c == '%') {
                    out.append(line, i, std::string::npos);
                    break;
                }
                if (c == '"' || c == '!' || c == '+') {   // a chord symbol or a decoration, to its closing mark
                    size_t z = line.find(c, i + 1);
                    z        = z == std::string::npos ? line.size() : z + 1;
                    out.append(line, i, z - i);
                    i = z;
                    continue;
                }
                if (c == '[' && i + 2 < line.size() && std::isalpha((unsigned char) line[i + 1]) && line[i + 2] == ':') {   // an inline field
                    size_t z = line.find(']', i);
                    z        = z == std::string::npos ? line.size() : z + 1;
                    if (line[i + 1] == 'V') {
                        vocal = yue2_voice_is_vocal(line.substr(i + 3, z - i - 3));
                    }
                    out.append(line, i, z - i);
                    i = z;
                    continue;
                }
                const char * at = std::strchr("ABCDEFGabcdefg", c);
                if (vocal && c != '\0' && at != nullptr) {   // a note: its letter and its octave marks
                    const bool low = c >= 'a';
                    int        o   = low ? 5 : 4;
                    size_t     j   = i + 1;
                    for (; j < line.size() && (line[j] == '\'' || line[j] == ','); j++) {
                        o += line[j] == '\'' ? 1 : -1;
                    }
                    o += octaves;
                    const char up = (char) std::toupper((unsigned char) c);
                    if (o >= 5) {
                        out += (char) std::tolower((unsigned char) up);
                        out.append((size_t) (o - 5), '\'');
                    } else {
                        out += up;
                        out.append((size_t) (4 - o), ',');
                    }
                    n++;
                    i = j;
                    continue;
                }
                out += c;
                i++;
            }
        }
        if (e >= abc.size()) {
            break;
        }
        out += '\n';
    }
    if (moved) {
        *moved = n;
    }
    return out;
}

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

// HERESY 1768: the decode ladder: pieces of about 20 s (25 frames a second), each hearing 2 s past its edges
static const int YUE2_LADDER_PIECE  = 500;
static const int YUE2_LADDER_MARGIN = 50;

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
    if (r.abc_continue && (r.abc.empty() || cot == YUE2_COT_OFF)) {   // HERESY 1608
        fprintf(stderr, "[Pipeline] FATAL: abc_continue takes the opening of a score in melody or full mode\n");
        p->last_error = "abc_continue takes the opening of a score in melody or full mode";
        return false;
    }
    if (r.plan_only && (cot == YUE2_COT_OFF || (!r.abc.empty() && !r.abc_continue))) {
        fprintf(stderr, "[Pipeline] FATAL: plan_only needs full or melody mode and no supplied score\n");
        return false;
    }
    std::vector<AdapterUse> ar_adapters, nar_adapters;
    if (!pipeline_adapters(p, r, &ar_adapters, &nar_adapters)) {
        return false;
    }

    KvScope kv_scope = { p };

    // Local addition: the run's LoRAs, merged into each half as it loads and
    // dropped from the pipeline when the run ends (the store keys keep them apart)
    struct LoraScope {
        Yue2Pipeline * p;

        ~LoraScope() {
            p->loras.reset();
            p->lora_rt_src.reset();  // HERESY 1447: and the graph's (a model keeps no pointer past its next require)
            for (int h = 0; h < 2; h++) {
                p->lora_rt_choices[h].clear();
                lora_rt_free(&p->lora_rt[h]);
                p->lora_rt_groups[h].clear();
            }
        }
    } lora_scope = { p };
    p->last_error.clear();
    g_nar_error.clear();   // HERESY 1169
    g_vae_error.clear();
    // HERESY 1169: the music's KV sets were allocated as a request asked and never given back: after two guided probes four
    // sets (10.75 GB at the whole window) stayed, and a long song's sound found no room after them. More than two (one
    // guided probe, what most runs ask) go when this request is done, whichever way it ends; the next one asks for its own
    struct KvTrim {
        Qw3lmKvCache * kv;
        ~KvTrim() {
            if (kv->n_sets > 2) {
                fprintf(stderr, "[LM-KV] Released %d sets: the next run allocates what it needs\n", kv->n_sets);
                qw3lm_kv_free(kv);
            }
        }
    } kv_trim{ &p->kv };
    p->broken_score.clear();
    if (!r.loras.empty()) {
        std::string error;
        if (!pipeline_open_loras(p, r.loras, r.lora_groups, &error)) {
            fprintf(stderr, "[LoRA] FATAL: %s\n", error.c_str());
            p->last_error = "LoRA: " + error;
            return false;
        }
        for (const Yue2LoraChoice & c : r.loras) {
            fprintf(stderr, "[LoRA] %s: music %.2f, sound %.2f%s%s\n", c.id.c_str(), c.ar, c.nar,
                    c.curve.empty() ? "" : ", a wave", c.group >= 0 ? ", in a budget" : "");   // HERESY 1447
        }
    }

    BPETokenizer * tok    = store_bpe(p->store, p->model_path.c_str());
    auto           encode = [tok](const std::string & text) {
        return bpe_encode(tok, text);
    };

    // A supplied stream is replayed, a source section is continued; either
    // is one song, the batch counter has nothing to draw
    bool replay    = !r.semantic_tokens.empty();
    bool continued = !r.source_tokens.empty();
    if (replay && continued) {
        fprintf(stderr, "[Pipeline] FATAL: semantic_tokens and source_tokens are exclusive\n");
        return false;
    }
    if ((replay || continued) && r.lm_batch_size > 1) {
        fprintf(stderr, "[Pipeline] Supplied stream: lm_batch_size ignored\n");
    }
    const int B = replay || continued ? 1 : r.lm_batch_size;
    const int M = r.synth_batch_size;

    // A supplied stream with no score renders without one, whatever the
    // mode: a score planned now is not the one the codes follow
    if ((replay || continued) && r.abc.empty()) {
        cot = YUE2_COT_OFF;
    }

    // Score per song: supplied by the caller, planned by the model, or absent
    std::vector<std::vector<int>> abc_ids(B);
    std::vector<std::string>      scores(B);
    std::vector<bool>             truncated(B, false);
    bool                          has_score = cot != YUE2_COT_OFF;
    bool                          planned   = has_score && (r.abc.empty() || r.abc_continue);   // HERESY 1608: an opening is planned on from

    // The AR half holds the GPU for the plan and the semantic stage, then
    // steps aside for the synthesis
    std::optional<ModelHandle> lm_hold;
    Qwen3LM *                  lm = nullptr;
    if (planned || !replay) {
        lm = require_lm(p, ar_adapters);
        if (!lm) {
            return false;
        }
        lm_hold.emplace(p->store, lm);
        lora_rt_at(&p->lora_rt[0], -1.0f, true, "the plan and the prompt at their own strengths");   // HERESY 1447
    }
    Timer            score_timer;                    // HERESY 1399
    std::vector<int> score_tokens(B, 0);
    double           score_seconds = 0.0, music_seconds = 0.0, sound_seconds = 0.0;
    int              music_kept    = 0;
    if (has_score && !planned) {
        abc_ids.assign(B, encode(r.abc));
        scores.assign(B, r.abc);
    } else if (has_score) {
        std::vector<int>            open = yue2_build_prompt_ids(encode, cot, r.style, r.lyrics, nullptr);
        std::vector<int>            opening;   // HERESY 1608: an opening to continue goes in after ABC_START, its end token left out
        if (r.abc_continue) {
            std::string text = r.abc;
            if (!text.empty() && text.back() != '\n') {
                text += '\n';
            }
            opening = encode(text);
            open.insert(open.end(), opening.begin(), opening.end());
            fprintf(stderr, "[Pipeline] Score continues from an opening of %zu tokens\n", opening.size());
        }
        std::vector<Yue2Generation> plans;
        std::vector<std::string>    texts;      // HERESY 1606: harmony (timoncool/yue2.cpp 1e21e63), off unless the request asks
        Yue2HarmonyPlan             harmony;
        if (r.harmony.active()) {
            texts   = bpe_decode_each(tok, YUE2_EOD);
            harmony = yue2_harmony_plan(r.harmony, &texts, YUE2_ABC_END);
            fprintf(stderr, "[Harmony] %s strength=%.2f window=%d hold=%d outside=%.2f/%.2f section=%.2f/%d follow=%zu\n",
                    r.harmony.by_root ? "root" : "spelling", (double) r.harmony.strength, r.harmony.window, r.harmony.hold_limit,
                    (double) r.harmony.outside_bonus, (double) r.harmony.outside_limit, (double) r.harmony.section_strength,
                    r.harmony.section_open, r.harmony.follow.size());
        }
        if (!yue2_generate(lm, &p->kv, std::vector<std::vector<int>>(B, open), {}, 1.0f, r.abc_sampling, r.lm_seed,
                           YUE2_PHASE_ABC, &plans, cancelled, cancel_data, nullptr, -1.0f, r.harmony.active() ? &harmony : nullptr)) {
            return false;
        }
        for (int i = 0; i < B; i++) {
            if (!opening.empty()) {   // HERESY 1608: the opening first, then what the model wrote on from it
                plans[i].tokens.insert(plans[i].tokens.begin(), opening.begin(), opening.end());
            }
            abc_ids[i]   = plans[i].tokens;
            scores[i]    = bpe_decode(tok, abc_ids[i]);
            truncated[i] = plans[i].truncated;
            score_tokens[i] = (int) plans[i].tokens.size();   // HERESY 1399
        }
        score_seconds = score_timer.ms() / 1000.0;
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

    // HERESY 1416: free tempo: the music stage reads the score without its tempo and a plan asked alone is returned without it (Viktor: «чтобы руками не чистить»)
    if (has_score && r.free_tempo) {
        for (int i = 0; i < B; i++) {
            int dropped = 0;
            scores[i]   = yue2_score_without_tempo(scores[i], &dropped);
            abc_ids[i]  = encode(scores[i]);
            fprintf(stderr, "[Score] Free tempo: song %d, %d tempo mark%s taken out\n", i, dropped, dropped == 1 ? "" : "s");
        }
    }
    // HERESY 1743: a score the model planned whole, its Vocal line moved by octaves before it is sung (and before a plan asked alone goes back)
    if (planned && r.abc.empty() && r.vocal_octave != 0) {
        for (int i = 0; i < B; i++) {
            int moved  = 0;
            scores[i]  = yue2_score_vocal_octave(scores[i], r.vocal_octave, &moved);
            abc_ids[i] = encode(scores[i]);
            fprintf(stderr, "[Score] Vocal line %+d octave%s: song %d, %d notes moved\n", r.vocal_octave,
                    r.vocal_octave == 1 || r.vocal_octave == -1 ? "" : "s", i, moved);
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
    fprintf(stderr, "[Prompt] cot=%s, songs=%d, variations=%d, %zu tracks\n", has_score ? r.cot.c_str() : "off", B, M,
            (size_t) B * M);

    float                         guidance = r.cfg_scale < 0.0f ? yue2_default_guidance(cot) : r.cfg_scale;
    // HERESY 1397: the lyrics' own scale; a third stream, the prompt without its lyrics, when it differs from the guidance
    float                         lyrics_guidance = r.cfg_lyrics < 0.0f ? guidance : r.cfg_lyrics;
    bool                          split           = lyrics_guidance != guidance;
    std::vector<std::vector<int>> lyricless;
    if (split) {
        lyricless.resize(B);
        for (int i = 0; i < B; i++) {
            lyricless[i] = yue2_build_prompt_ids(encode, cot, r.style, std::string(), has_score ? &abc_ids[i] : nullptr);
        }
        fprintf(stderr, "[Prompt] guidance %.2f for the music, %.2f for the lyrics: a third branch without the lyrics\n", (double) guidance,
                (double) lyrics_guidance);
    }
    std::vector<std::vector<int>> negatives;
    if (guidance != 1.0f || split) {
        negatives.resize(B);
        for (int i = 0; i < B; i++) {
            negatives[i] = yue2_build_negative_ids(encode, cot, has_score ? &abc_ids[i] : nullptr);
        }
    }

    std::vector<Yue2Generation> codes(B);
    SliderSet                   sliders;
    bool                        sliders_used = false;
    int                         lora_span    = 0;   // HERESY 1447: the frames the LoRAs' waves run over, as the music counted them
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
    } else if (continued) {
        if (!pipeline_continue_codes(p, lm, r, prefixes[0], negatives.empty() ? nullptr : &negatives[0], guidance,
                                     &codes[0], cancelled, cancel_data)) {
            return false;
        }
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
        std::vector<std::vector<int>> gen_prefixes = prefixes, gen_negatives = negatives, gen_lyricless = lyricless;   // HERESY 1397
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
                if (!gen_lyricless.empty()) {
                    gen_lyricless[i].insert(gen_lyricless[i].end(), keep.begin(), keep.end());
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
        p->lora_rt[0].kept = (int) keep.size();   // HERESY 1447: and a LoRA's wave
        lora_span          = (int) keep.size() + semantic.max_tokens;
        Timer music_timer;                           // HERESY 1399
        music_kept       = (int) keep.size();
        bool semantic_ok = yue2_generate(lm, &p->kv, gen_prefixes, gen_negatives, guidance, semantic, r.lm_seed,
                                         YUE2_PHASE_SEMANTIC, &codes, cancelled, cancel_data, split ? &gen_lyricless : nullptr,
                                         lyrics_guidance);
        music_seconds = music_timer.ms() / 1000.0;   // HERESY 1399
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
        if (r.nar_ladder) {                           // HERESY 1768: even pieces of about 20 s, room for their windows' 2 s either side
            const int n = (T_lat + YUE2_LADDER_PIECE - 1) / YUE2_LADDER_PIECE, even = (T_lat + n - 1) / n;
            if (n > 1 && even + 2 * YUE2_LADDER_MARGIN <= chunk_sizes[i]) {
                chunk_sizes[i] = even;
            }
        }
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
    if (!replay && !sliders_used && !r.nar_ladder) {   // HERESY 1768: a ladder reads each window again, nothing to seal
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
    Timer sound_timer;                               // HERESY 1399
    for (int i = 0; i < B; i++) {
        const int prefix_len = (int) prefixes[i].size();
        const int chunk_size = chunk_sizes[i];
        const int T_lat      = (int) codes[i].tokens.size();
        int       chunks     = (T_lat + chunk_size - 1) / chunk_size;
        fprintf(stderr, "[NAR] Song %d: %d frames (%.1f s), prefix %d, %d chunk%s of %d, %d variation%s\n", i, T_lat,
                (float) T_lat / (float) YUE2_FRAME_RATE, prefix_len, chunks, chunks > 1 ? "s" : "", chunk_size, M,
                M > 1 ? "s" : "");
        // HERESY 1768: the ladder: a piece's window hears YUE2_LADDER_MARGIN codes past its end and before its start; neighbours meet in a
        // crossfade of their latents half a margin either side of their common edge. The noise stays in the latents until every piece is solved.
        const bool lad   = r.nar_ladder && chunks > 1;
        const int  lad_m = lad ? YUE2_LADDER_MARGIN : 0, lad_x = YUE2_LADDER_MARGIN / 2;
        std::vector<std::vector<float>> lad_acc(lad ? M : 0, std::vector<float>(lad ? (size_t) T_lat * YUE2_LATENT_DIM : 0, 0.0f));
        if (lad) {
            fprintf(stderr, "[NAR] ladder: %d pieces of %d frames, each hearing %d past its edges, joined over %d\n", chunks, chunk_size, lad_m, 2 * lad_x);
        }
        for (int start = 0; start < T_lat; start += chunk_size) {
            Timer chunk_timer;
            const int nf     = T_lat - start < chunk_size ? T_lat - start : chunk_size;   // the piece's own frames
            const int ws     = lad ? std::max(0, start - lad_m) : start;                  // HERESY 1768: the window it is solved over
            int       frames = lad ? std::min(T_lat, start + nf + lad_m) - ws : nf;
            int       ar_len = prefix_len + frames + 1;

            // The chunk sequence is the prefix, the codes of the chunk and the
            // end token. Its head already sits in the set, the whole prefix
            // from the second chunk on and the sealed sequence of a generated
            // song for the first one, so only the tail is forwarded and its
            // logits go nowhere.
            std::vector<int> sequence = prefixes[i];
            sequence.insert(sequence.end(), codes[i].tokens.begin() + ws, codes[i].tokens.begin() + ws + frames);
            sequence.push_back(YUE2_MUSIC_END);
            // With sliders the cache the AR decode left carries their steer, so
            // the first chunk re-prefills the whole sequence without them
            const int kept = start > 0 ? prefix_len : ((replay || sliders_used || lad) ? 0 : ar_len);   // 1768: a ladder reads its first window again
            if (kept < ar_len) {
                nar_hold.reset();
                nar                = nullptr;
                Qwen3LM * lm_chunk = require_lm(p, ar_adapters);
                if (!lm_chunk) {
                    return false;
                }
                ModelHandle lm_chunk_hold(p->store, lm_chunk);
                {   // HERESY 1447: the music half reads the chunk again with its LoRAs' waves at the chunk's middle
                    const int   sp  = lora_span > 0 ? lora_span : T_lat;
                    const float mid = ((float) ws + 0.5f * (float) frames) / (float) sp;
                    lora_rt_at(&p->lora_rt[0], mid > 1.0f ? 1.0f : mid, false, "the music half reads a chunk again at");
                }
                qw3lm_kv_trim(&p->kv, i, kept);
                qw3lm_forward(lm_chunk, &p->kv, sequence.data() + kept, ar_len - kept, i, probe.data(), row0, rows);
            }
            if (!nar) {
                nar = require_nar(p, nar_adapters);
                if (!nar) {
                    return false;
                }
                nar_hold.emplace(p->store, nar);
            }
            lora_rt_frames(&p->lora_rt[1], ws, frames, lora_span > 0 ? lora_span : T_lat);   // HERESY 1447: frame by frame

            // The first chunk of the first song feeds the cossim harness: the
            // sequence the latent block attends to, then the solver probes
            const DebugDumper * dbg = i == 0 && start == 0 ? &p->dumper : &quiet;
            if (dbg->enabled) {
                std::vector<float> ids = debug_ids(sequence);
                debug_dump_1d(dbg, "ar_ids", ids.data(), (int) ids.size());
            }

            // The M variations of the chunk solve side by side
            size_t span = (size_t) frames * YUE2_LATENT_DIM;
            block.resize(span * M);
            for (int j = 0; j < M; j++) {
                memcpy(block.data() + span * j,
                       (*songs)[(size_t) i * M + j].latents.data() + (size_t) ws * YUE2_LATENT_DIM,
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
                    // HERESY 1169: out of memory with several at once: one at a time, before the run gives up
                    bool ok = false;
                    if (gm > 1 && !g_nar_error.empty()) {
                        fprintf(stderr, "[NAR] Song %d: %d variations did not fit at once; one at a time\n", i, gm);
                        g_nar_error.clear();
                        ok = true;
                        for (int j = 0; j < gm && ok; j++) {
                            ok = nar_solve(nar, &p->kv, block.data() + span * (size_t) (g0 + j), frames, 1, ar_len, i, r.steps,
                                           dbg, cancelled, cancel_data, r.solver);
                        }
                    }
                    if (!ok) {
                        if (!g_nar_error.empty()) {
                            p->last_error = g_nar_error;
                        }
                        return false;
                    }
                }
            }
            for (int j = 0; j < M; j++) {
                if (!lad) {
                    memcpy((*songs)[(size_t) i * M + j].latents.data() + (size_t) start * YUE2_LATENT_DIM,
                           block.data() + span * j, span * sizeof(float));
                    continue;
                }
                // HERESY 1768: complementary half-cosines centred on the piece's own edges, inside both neighbours' windows
                auto ramp = [](float u) { u = u < 0.0f ? 0.0f : (u > 1.0f ? 1.0f : u); return 0.5f - 0.5f * cosf(3.14159265f * u); };
                for (int t = ws; t < ws + frames; t++) {
                    const float up   = start == 0 ? 1.0f : ramp((float) (t - (start - lad_x)) / (float) (2 * lad_x));
                    const float down = start + nf >= T_lat ? 1.0f : 1.0f - ramp((float) (t - (start + nf - lad_x)) / (float) (2 * lad_x));
                    const float w    = up * down;
                    if (w <= 0.0f) {
                        continue;
                    }
                    float *       dst = lad_acc[j].data() + (size_t) t * YUE2_LATENT_DIM;
                    const float * src = block.data() + span * j + (size_t) (t - ws) * YUE2_LATENT_DIM;
                    for (int d = 0; d < YUE2_LATENT_DIM; d++) {
                        dst[d] += w * src[d];
                    }
                }
            }
            fprintf(stderr, "[NAR] Song %d chunk %d/%d: %d frames, cache %d rows, %d forwarded, %.1f s\n", i,
                    start / chunk_size + 1, chunks, frames, ar_len, ar_len - kept, chunk_timer.ms() / 1000.0);
        }
        if (lad) {                                    // HERESY 1768: the blend in place of the noise, once every piece is solved
            for (int j = 0; j < M; j++) {
                memcpy((*songs)[(size_t) i * M + j].latents.data(), lad_acc[j].data(), lad_acc[j].size() * sizeof(float));
            }
        }
    }

    nar_hold.reset();
    sound_seconds = sound_timer.ms() / 1000.0;      // HERESY 1399
    VAEGGML * vae = require_vae(p, vae_path);
    if (!vae) {
        return false;
    }
    ModelHandle vae_hold(p->store, vae);
    for (size_t t = 0; t < songs->size(); t++) {
        Yue2Song & song = (*songs)[t];
        fprintf(stderr, "[VAE] Track %zu/%zu: song %zu variation %zu\n", t + 1, songs->size(), t / M, t % M);
        int        max_T_audio = song.T_lat * YUE2_HOP;   // ours (the 1603 merge took the upstream line into pipeline_decode)
        song.audio.assign((size_t) 2 * max_T_audio, 0.0f);
        Timer vae_timer;                             // HERESY 1399
        song.T_audio = vae_ggml_decode_tiled(vae, song.latents.data(), song.T_lat, song.audio.data(), max_T_audio,
                                             p->params.vae_core, p->params.vae_halo, cancelled, cancel_data);
        if (song.T_audio < 0) {
            if (!g_vae_error.empty()) {
                p->last_error = g_vae_error;   // HERESY 1169
            }
            return false;
        }
        song.audio.resize((size_t) 2 * song.T_audio);
        song.vae_seconds     = vae_timer.ms() / 1000.0;   // HERESY 1399: the medcard's stages
        song.score_tokens    = score_tokens[t / M];
        song.score_seconds   = score_seconds;
        song.music_tokens    = replay ? 0 : song.T_lat - music_kept;
        song.music_kept      = music_kept;
        song.music_replayed  = replay;
        song.music_seconds   = music_seconds;
        song.guidance        = guidance;
        song.lyrics_guidance = lyrics_guidance;
        song.sound_seconds   = sound_seconds;
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

// HERESY 1168 (Viktor 07.10.2026: «должны лишь готовые латенты за 5-7 секунд декодироваться»): a take's kept acoustic
// latents made into sound again by another decoder: no music stage, no sound stage, the VAE alone
static bool pipeline_decode_latents(Yue2Pipeline * p, const std::string & vae_name, Yue2Song * song,
                                    bool (*cancelled)(void *) = nullptr, void * cancel_data = nullptr) {
    std::string vae_path;
    if (!pipeline_vae_path(p, vae_name, &vae_path)) {
        p->last_error = "unknown decoder '" + vae_name + "'";
        return false;
    }
    VAEGGML * vae = require_vae(p, vae_path);
    if (!vae) {
        p->last_error = "the decoder could not be loaded";
        return false;
    }
    ModelHandle vae_hold(p->store, vae);
    int max_T_audio = song->T_lat * YUE2_HOP;
    fprintf(stderr, "[VAE] Kept latents: %d frames, decoded again by %s\n", song->T_lat,
            vae_name.empty() ? "the default decoder" : vae_name.c_str());
    song->audio.assign((size_t) 2 * max_T_audio, 0.0f);
    g_vae_error.clear();   // HERESY 1169
    song->T_audio = vae_ggml_decode_tiled(vae, song->latents.data(), song->T_lat, song->audio.data(), max_T_audio,
                                          p->params.vae_core, p->params.vae_halo, cancelled, cancel_data);
    if (song->T_audio < 0) {
        if (!g_vae_error.empty()) {
            p->last_error = g_vae_error;
        }
        return false;
    }
    song->audio.resize((size_t) 2 * song->T_audio);
    return true;
}
