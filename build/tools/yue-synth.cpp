// yue-synth.cpp: full pipeline CLI, a request to stereo audio
//
// Plans a score, writes the semantic token stream, solves the acoustic flow
// matching from the AR prefix cache, and decodes the latents to 48 kHz stereo.

#include "audio-io.h"
#include "pipeline.h"
#include "version.h"

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>

// song.mp3 -> song12.mp3 for song 1, variation 2
static std::string indexed(const std::string & path, int song, int variation) {
    std::string idx = std::to_string(song) + std::to_string(variation);
    size_t      dot = path.rfind('.');
    return dot != std::string::npos ? path.substr(0, dot) + idx + path.substr(dot) : path + idx;
}

static bool write_file(const std::string & path, const void * data, size_t bytes) {
    FILE * f = fopen(path.c_str(), "wb");
    if (!f || fwrite(data, 1, bytes, f) != bytes) {
        fprintf(stderr, "[Synth] FATAL: cannot write %s\n", path.c_str());
        return false;
    }
    fclose(f);
    return true;
}

static void print_usage(const char * prog) {
    fprintf(stderr, "yue2.cpp %s\n\n", YUE2_VERSION);
    fprintf(stderr,
            "Usage: %s --model <gguf> --vae <gguf> --request <json> [options]\n"
            "\n"
            "Required:\n"
            "  --model <gguf>         Backbone GGUF\n"
            "  --vae <gguf>           VAE GGUF\n"
            "  --request <json>       Input request JSON\n"
            "\n"
            "Optional:\n"
            "  --out <path>           Output audio (default: song.mp3), a batch numbers it\n"
            "  --duration <s>         Target length in seconds\n"
            "  --lm-seed <N>          Token sampling seed\n"
            "  --seed <N>             Acoustic noise seed\n"
            "  --steps <N>            Flow matching steps\n"
            "\n"
            "Debug:\n"
            "  --score <path>         Also write the planned score\n"
            "  --tokens <path>        Also write the semantic stream (CSV)\n"
            "  --latent <path>        Also write the acoustic latents (.vae)\n"
            "  --max-seq <N>          KV cache size (default: model context)\n"
            "  --vae-core <N>         VAE tile core frames (default: 512)\n"
            "  --vae-halo <N>         VAE tile halo frames (default: 16)\n"
            "  --no-fa                Disable flash attention\n"
            "  --no-fa-lm             Disable flash attention in the music half (AR) only\n"
            "  --clamp-fp16           Clamp hidden states to FP16 range\n"
            "  --fp16-matmul          BF16 prefills and flow matching on FP16 tensor cores (RTX 20, Volta)\n"
            "  --dump <dir>           Dump intermediate tensors\n",
            prog);
}

int main(int argc, char ** argv) {
    if (argc < 2) {
        print_usage(argv[0]);
        return 1;
    }

    const char *       model_path  = nullptr;
    const char *       vae_path    = nullptr;
    const char *       score_path  = nullptr;
    const char *       tokens_path = nullptr;
    const char *       latent_path = nullptr;
    const char *       out_path    = nullptr;
    Yue2PipelineParams params;

    Yue2Request r;
    request_init(&r);
    for (int i = 1; i + 1 < argc; i++) {
        if (!strcmp(argv[i], "--request") && !request_parse(&r, argv[i + 1])) {
            return 1;
        }
    }

    for (int i = 1; i < argc; i++) {
        bool last = i + 1 >= argc;
        if (!strcmp(argv[i], "--model") && !last) {
            model_path = argv[++i];
        } else if (!strcmp(argv[i], "--vae") && !last) {
            vae_path = argv[++i];
        } else if (!strcmp(argv[i], "--request") && !last) {
            i++;  // parsed before the flag pass so the flags override it
        } else if (!strcmp(argv[i], "--out") && !last) {
            out_path = argv[++i];
        } else if (!strcmp(argv[i], "--duration") && !last) {
            r.duration = (float) atof(argv[++i]);
        } else if (!strcmp(argv[i], "--lm-seed") && !last) {
            r.lm_seed = atoll(argv[++i]);
        } else if (!strcmp(argv[i], "--seed") && !last) {
            r.seed = atoll(argv[++i]);
        } else if (!strcmp(argv[i], "--steps") && !last) {
            r.steps = atoi(argv[++i]);
        } else if (!strcmp(argv[i], "--score") && !last) {
            score_path = argv[++i];
        } else if (!strcmp(argv[i], "--tokens") && !last) {
            tokens_path = argv[++i];
        } else if (!strcmp(argv[i], "--latent") && !last) {
            latent_path = argv[++i];
        } else if (!strcmp(argv[i], "--max-seq") && !last) {
            params.max_seq = atoi(argv[++i]);
        } else if (!strcmp(argv[i], "--vae-core") && !last) {
            params.vae_core = atoi(argv[++i]);
        } else if (!strcmp(argv[i], "--vae-halo") && !last) {
            params.vae_halo = atoi(argv[++i]);
        } else if (!strcmp(argv[i], "--no-fa-lm")) {   // HERESY 1008
            params.no_fa_lm = true;
        } else if (!strcmp(argv[i], "--no-fa")) {
            params.no_fa = true;
        } else if (!strcmp(argv[i], "--clamp-fp16")) {
            params.clamp_fp16 = true;
        } else if (!strcmp(argv[i], "--fp16-matmul")) {  // Local addition
            params.fp16_matmul = true;
        } else if (!strcmp(argv[i], "--dump") && !last) {
            params.dump_dir = argv[++i];
        } else {
            print_usage(argv[0]);
            return 1;
        }
    }

    if (!model_path || !vae_path) {
        print_usage(argv[0]);
        return 1;
    }

    request_resolve_seed(&r);

    bool      is_mp3  = false;
    WavFormat wav_fmt = WAV_S16;
    if (!audio_parse_format(r.output_format.c_str(), is_mp3, wav_fmt)) {
        fprintf(stderr, "[Synth] FATAL: unknown output format %s\n", r.output_format.c_str());
        return 1;
    }
    std::string target = out_path ? out_path : ("song." + std::string(is_mp3 ? "mp3" : "wav"));

    // Model loads go through the store in STRICT policy: at most one half of
    // the backbone resident at a time, the cache staying between them
    ModelStore * store = store_create(EVICT_STRICT);

    Yue2Pipeline pipeline;
    pipeline.store = store;
    if (!pipeline_configure(&pipeline, model_path, vae_path, params)) {
        store_free(store);
        return 1;
    }

    std::vector<Yue2Song> songs;
    if (!pipeline_generate(&pipeline, r, &songs)) {
        pipeline_free(&pipeline);
        store_free(store);
        return 1;
    }
    pipeline_free(&pipeline);
    store_free(store);

    // A single track lands on the paths as given; a batch numbers each path
    // with song then variation index: song.mp3 -> song00.mp3. Every track
    // gets its replay request next to it (.json), carrying the score, the
    // semantic stream and the exact seeds of that track.
    const int M = r.synth_batch_size;
    for (size_t t = 0; t < songs.size(); t++) {
        Yue2Song &  song = songs[t];
        int         i    = (int) t / M;
        int         j    = (int) t % M;
        std::string path = songs.size() > 1 ? indexed(target, i, j) : target;

        if (tokens_path) {
            std::string csv = pipeline_format_tokens(song.tokens) + "\n";
            if (!write_file(songs.size() > 1 ? indexed(tokens_path, i, j) : tokens_path, csv.data(), csv.size())) {
                return 1;
            }
        }
        if (latent_path && !write_file(songs.size() > 1 ? indexed(latent_path, i, j) : latent_path, song.latents.data(),
                                       song.latents.size() * sizeof(float))) {
            return 1;
        }
        if (score_path && !song.score.empty() &&
            !write_file(songs.size() > 1 ? indexed(score_path, i, j) : score_path, song.score.data(),
                        song.score.size())) {
            return 1;
        }

        if (!audio_write(path.c_str(), song.audio.data(), song.T_audio, YUE2_SAMPLE_RATE, is_mp3, wav_fmt,
                         r.mp3_bitrate, r.peak_clip)) {
            return 1;
        }

        Yue2Request replay =
            request_replay(r, song.score.empty() ? r.abc : song.score, pipeline_format_tokens(song.tokens), i, j);
        std::string json = request_to_json(&replay) + "\n";
        size_t      dot  = path.rfind('.');
        if (!write_file((dot != std::string::npos ? path.substr(0, dot) : path) + ".json", json.data(), json.size())) {
            return 1;
        }

        fprintf(stderr, "[Synth] Done: %.1f s of audio, seeds %lld and %lld -> %s\n",
                (float) song.T_audio / (float) YUE2_SAMPLE_RATE, (long long) replay.lm_seed, (long long) replay.seed,
                path.c_str());
    }
    return 0;
}
