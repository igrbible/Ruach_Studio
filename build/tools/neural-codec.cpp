// neural-codec.cpp: neural audio codec (Oobleck VAE encoder + decoder)
//
// encode: 48 kHz stereo audio (WAV or MP3) -> latent file (.vae, .nac8, or .nac4)
// decode: latent file -> 48 kHz stereo audio (WAV or MP3)
//
// Three latent formats, decode auto-detects:
//
//   .vae (default): flat [T, 64] f32 frame-major, no header.
//     T = file_size / 256. 25 Hz, 51.2 kbit/s.
//
//   .nac8 (--q8): symmetric per-frame int8 quantization.
//     header: "NAC8" magic (4B) + uint32 T_latent (4B)
//     frame:  f16 scale (2B) + int8[64] (64B) = 66B
//     25 Hz, 13.2 kbit/s.
//
//   .nac4 (--q4): symmetric per-frame 4-bit quantization.
//     header: "NAC4" magic (4B) + uint32 T_latent (4B)
//     frame:  f16 scale (2B) + nibbles[32] (32B) = 34B
//     25 Hz, 6.8 kbit/s.
//
// Both halves live in the VAE GGUF. The encode is deterministic: the
// posterior mean, no sampling.
//
// Long signals run in tiles carrying a halo of context on each side, and
// only the core frames are kept, so every sample of the result has the full
// receptive field of the untiled pass. The core and halo names come from the
// checkpoint, whose config ships decode_core_frames and decode_halo_frames.
//
// Usage:
//   neural-codec --vae model.gguf --encode -i song.wav -o song.vae
//   neural-codec --vae model.gguf --encode --q8 -i song.wav -o song.nac8
//   neural-codec --vae model.gguf --decode -i song.nac4 -o song.wav

#include "audio-io.h"
#include "vae-enc.h"
#include "vae.h"
#include "version.h"

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>

static const int LATENT_CH   = 64;
static const int HOP         = 1920;
static const int SAMPLE_RATE = 48000;
static const int FRAME_RATE  = 25;

static const char NAC8_MAGIC[4] = { 'N', 'A', 'C', '8' };
static const int  NAC8_HEADER   = 8;   // 4B magic + 4B T_latent
static const int  NAC8_FRAME    = 66;  // 2B f16 scale + 64B int8

static const char NAC4_MAGIC[4] = { 'N', 'A', 'C', '4' };
static const int  NAC4_HEADER   = 8;   // 4B magic + 4B T_latent
static const int  NAC4_FRAME    = 34;  // 2B f16 scale + 32B packed nibbles

static void log_latent(const char * verb, const char * path, const char * kind, int T_latent, size_t bytes) {
    float duration = (float) T_latent / (float) FRAME_RATE;
    fprintf(stderr, "[VAE] %s %s (%s): %d frames, %.2fs, %zu bytes (%.1f kbit/s)\n", verb, path, kind, T_latent,
            duration, bytes, duration > 0 ? (float) bytes * 8.0f / duration / 1000.0f : 0.0f);
}

static bool write_latent_f32(const char * path, const float * data, int T_latent) {
    FILE * f = fopen(path, "wb");
    if (!f) {
        fprintf(stderr, "[VAE] FATAL: cannot write %s\n", path);
        return false;
    }
    size_t count = (size_t) T_latent * LATENT_CH;
    bool   ok    = fwrite(data, sizeof(float), count, f) == count;
    fclose(f);
    if (ok) {
        log_latent("Wrote", path, "F32", T_latent, count * sizeof(float));
    }
    return ok;
}

static bool write_latent_q8(const char * path, const float * data, int T_latent) {
    FILE * f = fopen(path, "wb");
    if (!f) {
        fprintf(stderr, "[VAE] FATAL: cannot write %s\n", path);
        return false;
    }
    fwrite(NAC8_MAGIC, 1, 4, f);
    uint32_t t = (uint32_t) T_latent;
    fwrite(&t, 4, 1, f);

    for (int i = 0; i < T_latent; i++) {
        const float * frame = data + (size_t) i * LATENT_CH;
        float         amax  = 0.0f;
        for (int j = 0; j < LATENT_CH; j++) {
            float a = frame[j] < 0 ? -frame[j] : frame[j];
            if (a > amax) {
                amax = a;
            }
        }
        float       scale     = amax / 127.0f;
        ggml_fp16_t scale_f16 = ggml_fp32_to_fp16(scale);
        fwrite(&scale_f16, 2, 1, f);

        int8_t q[LATENT_CH];
        float  inv = scale > 0 ? 1.0f / scale : 0.0f;
        for (int j = 0; j < LATENT_CH; j++) {
            float v = frame[j] * inv;
            int   r = (int) (v < 0 ? v - 0.5f : v + 0.5f);
            q[j]    = (int8_t) (r < -127 ? -127 : (r > 127 ? 127 : r));
        }
        fwrite(q, 1, LATENT_CH, f);
    }
    fclose(f);
    log_latent("Wrote", path, "Q8", T_latent, NAC8_HEADER + (size_t) T_latent * NAC8_FRAME);
    return true;
}

// two signed nibbles per byte: (low & 0x0F) | (high << 4)
static bool write_latent_q4(const char * path, const float * data, int T_latent) {
    FILE * f = fopen(path, "wb");
    if (!f) {
        fprintf(stderr, "[VAE] FATAL: cannot write %s\n", path);
        return false;
    }
    fwrite(NAC4_MAGIC, 1, 4, f);
    uint32_t t = (uint32_t) T_latent;
    fwrite(&t, 4, 1, f);

    for (int i = 0; i < T_latent; i++) {
        const float * frame = data + (size_t) i * LATENT_CH;
        float         amax  = 0.0f;
        for (int j = 0; j < LATENT_CH; j++) {
            float a = frame[j] < 0 ? -frame[j] : frame[j];
            if (a > amax) {
                amax = a;
            }
        }
        float       scale     = amax / 7.0f;
        ggml_fp16_t scale_f16 = ggml_fp32_to_fp16(scale);
        fwrite(&scale_f16, 2, 1, f);

        uint8_t packed[LATENT_CH / 2];
        float   inv = scale > 0 ? 1.0f / scale : 0.0f;
        for (int j = 0; j < LATENT_CH / 2; j++) {
            float vlo = frame[2 * j] * inv;
            float vhi = frame[2 * j + 1] * inv;
            int   lo  = (int) (vlo < 0 ? vlo - 0.5f : vlo + 0.5f);
            int   hi  = (int) (vhi < 0 ? vhi - 0.5f : vhi + 0.5f);
            lo        = lo < -7 ? -7 : (lo > 7 ? 7 : lo);
            hi        = hi < -7 ? -7 : (hi > 7 ? 7 : hi);
            packed[j] = (uint8_t) ((lo & 0x0F) | (hi << 4));
        }
        fwrite(packed, 1, LATENT_CH / 2, f);
    }
    fclose(f);
    log_latent("Wrote", path, "Q4", T_latent, NAC4_HEADER + (size_t) T_latent * NAC4_FRAME);
    return true;
}

// Reads any of the three formats, dispatching on the magic
static float * read_latent(const char * path, int * T_latent) {
    FILE * f = fopen(path, "rb");
    if (!f) {
        fprintf(stderr, "[VAE] FATAL: cannot read %s\n", path);
        return nullptr;
    }
    fseek(f, 0, SEEK_END);
    long size = ftell(f);
    fseek(f, 0, SEEK_SET);

    char magic[4] = { 0, 0, 0, 0 };
    if (size >= 4 && fread(magic, 1, 4, f) != 4) {
        fclose(f);
        return nullptr;
    }

    bool q8 = memcmp(magic, NAC8_MAGIC, 4) == 0;
    bool q4 = memcmp(magic, NAC4_MAGIC, 4) == 0;
    if (q8 || q4) {
        uint32_t t = 0;
        if (fread(&t, 4, 1, f) != 1) {
            fclose(f);
            return nullptr;
        }
        long frame    = q8 ? NAC8_FRAME : NAC4_FRAME;
        long expected = (q8 ? NAC8_HEADER : NAC4_HEADER) + (long) t * frame;
        if (size != expected) {
            fprintf(stderr, "[VAE] FATAL: %s size %ld, expected %ld for %u frames\n", path, size, expected, t);
            fclose(f);
            return nullptr;
        }
        float * data = (float *) malloc((size_t) t * LATENT_CH * sizeof(float));
        for (uint32_t i = 0; i < t; i++) {
            ggml_fp16_t scale_f16;
            if (fread(&scale_f16, 2, 1, f) != 1) {
                free(data);
                fclose(f);
                return nullptr;
            }
            float   scale = ggml_fp16_to_fp32(scale_f16);
            float * out   = data + (size_t) i * LATENT_CH;
            if (q8) {
                int8_t q[LATENT_CH];
                if (fread(q, 1, LATENT_CH, f) != LATENT_CH) {
                    free(data);
                    fclose(f);
                    return nullptr;
                }
                for (int j = 0; j < LATENT_CH; j++) {
                    out[j] = (float) q[j] * scale;
                }
            } else {
                uint8_t packed[LATENT_CH / 2];
                if (fread(packed, 1, LATENT_CH / 2, f) != LATENT_CH / 2) {
                    free(data);
                    fclose(f);
                    return nullptr;
                }
                for (int j = 0; j < LATENT_CH / 2; j++) {
                    int lo         = (int8_t) ((packed[j] & 0x0F) << 4) >> 4;
                    int hi         = (int8_t) (packed[j] & 0xF0) >> 4;
                    out[2 * j]     = (float) lo * scale;
                    out[2 * j + 1] = (float) hi * scale;
                }
            }
        }
        fclose(f);
        *T_latent = (int) t;
        log_latent("Read", path, q8 ? "Q8" : "Q4", *T_latent, (size_t) size);
        return data;
    }

    // Raw f32, rewind past the magic probe
    long frame_bytes = (long) LATENT_CH * sizeof(float);
    if (size % frame_bytes != 0) {
        fprintf(stderr, "[VAE] FATAL: %s size %ld is not a multiple of %ld\n", path, size, frame_bytes);
        fclose(f);
        return nullptr;
    }
    fseek(f, 0, SEEK_SET);
    *T_latent    = (int) (size / frame_bytes);
    float * data = (float *) malloc((size_t) size);
    if (fread(data, 1, (size_t) size, f) != (size_t) size) {
        free(data);
        fclose(f);
        return nullptr;
    }
    fclose(f);
    log_latent("Read", path, "F32", *T_latent, (size_t) size);
    return data;
}

static void print_usage(const char * prog) {
    fprintf(stderr, "yue2.cpp %s\n\n", YUE2_VERSION);
    fprintf(stderr,
            "Usage: %s --vae <gguf> --encode -i <audio> -o <latent> [options]\n"
            "       %s --vae <gguf> --decode -i <latent> -o <audio> [options]\n"
            "\n"
            "Required:\n"
            "  --vae <gguf>            VAE GGUF\n"
            "  --encode                Audio to latent\n"
            "  --decode                Latent to audio\n"
            "  -i <path>               Input file\n"
            "\n"
            "Optional:\n"
            "  -o <path>               Output file (default: input with swapped extension)\n"
            "  --q8                    Quantize the latent to int8 (encode only)\n"
            "  --q4                    Quantize the latent to 4 bits (encode only)\n"
            "  --format <fmt>          mp3, wav16, wav24 or wav32 (decode, default: wav16)\n"
            "  --bitrate <kbps>        MP3 bitrate (default: 128)\n"
            "\n"
            "Debug:\n"
            "  --vae-core <N>          Tile core frames (default: 512)\n"
            "  --vae-halo <N>          Tile halo frames (default: 16)\n",
            prog, prog);
}

// Swaps the extension of the input path. A dot that sits in a directory
// component, or a name without a dot at all, keeps the whole path.
static std::string auto_output(const char * input, const char * ext) {
    std::string out(input);
    size_t      dot = out.find_last_of('.');
    size_t      sep = out.find_last_of("/\\");
    if (dot != std::string::npos && (sep == std::string::npos || sep < dot)) {
        out.resize(dot);
    }
    return out + ext;
}

int main(int argc, char ** argv) {
    if (argc < 2) {
        print_usage(argv[0]);
        return 1;
    }

    const char * vae_path    = nullptr;
    const char * input_path  = nullptr;
    const char * output_path = nullptr;
    const char * format      = "wav16";
    int          mode        = -1;  // 0 encode, 1 decode
    int          quant       = 0;   // 0 f32, 8 q8, 4 q4
    int          bitrate     = 128;
    int          core        = 512;
    int          halo        = 16;

    for (int i = 1; i < argc; i++) {
        bool last = i + 1 >= argc;
        if (!strcmp(argv[i], "--vae") && !last) {
            vae_path = argv[++i];
        } else if (!strcmp(argv[i], "-i") && !last) {
            input_path = argv[++i];
        } else if (!strcmp(argv[i], "-o") && !last) {
            output_path = argv[++i];
        } else if (!strcmp(argv[i], "--format") && !last) {
            format = argv[++i];
        } else if (!strcmp(argv[i], "--bitrate") && !last) {
            bitrate = atoi(argv[++i]);
        } else if (!strcmp(argv[i], "--vae-core") && !last) {
            core = atoi(argv[++i]);
        } else if (!strcmp(argv[i], "--vae-halo") && !last) {
            halo = atoi(argv[++i]);
        } else if (!strcmp(argv[i], "--encode")) {
            mode = 0;
        } else if (!strcmp(argv[i], "--decode")) {
            mode = 1;
        } else if (!strcmp(argv[i], "--q8")) {
            quant = 8;
        } else if (!strcmp(argv[i], "--q4")) {
            quant = 4;
        } else {
            print_usage(argv[0]);
            return 1;
        }
    }

    if (!vae_path || mode < 0 || !input_path) {
        print_usage(argv[0]);
        return 1;
    }
    if (core < 1 || halo < 0) {
        fprintf(stderr, "[VAE] FATAL: invalid tiling (core %d, halo %d)\n", core, halo);
        return 1;
    }

    bool      is_mp3  = false;
    WavFormat wav_fmt = WAV_S16;
    if (mode == 1 && !audio_parse_format(format, is_mp3, wav_fmt)) {
        fprintf(stderr, "[VAE] FATAL: unknown output format %s\n", format);
        return 1;
    }

    std::string target;
    if (output_path) {
        target = output_path;
    } else if (mode == 0) {
        target = auto_output(input_path, quant == 8 ? ".nac8" : (quant == 4 ? ".nac4" : ".vae"));
    } else {
        target = auto_output(input_path, is_mp3 ? ".mp3" : ".wav");
    }

    if (mode == 0) {
        int     T_audio = 0, sr = 0;
        float * planar = audio_read(input_path, &T_audio, &sr);
        if (!planar) {
            return 1;
        }
        if (sr != SAMPLE_RATE) {
            fprintf(stderr, "[VAE] Resampling %d Hz -> %d Hz\n", sr, SAMPLE_RATE);
            int     T_rs  = 0;
            float * left  = audio_resample(planar, T_audio, sr, SAMPLE_RATE, 1, &T_rs);
            float * right = audio_resample(planar + T_audio, T_audio, sr, SAMPLE_RATE, 1, &T_rs);
            free(planar);
            if (!left || !right) {
                fprintf(stderr, "[VAE] FATAL: resampling failed\n");
                free(left);
                free(right);
                return 1;
            }
            planar = (float *) malloc((size_t) T_rs * 2 * sizeof(float));
            memcpy(planar, left, (size_t) T_rs * sizeof(float));
            memcpy(planar + T_rs, right, (size_t) T_rs * sizeof(float));
            free(left);
            free(right);
            T_audio = T_rs;
        }

        // The encoder reads interleaved stereo
        std::vector<float> interleaved((size_t) T_audio * 2);
        for (int t = 0; t < T_audio; t++) {
            interleaved[(size_t) t * 2 + 0] = planar[t];
            interleaved[(size_t) t * 2 + 1] = planar[(size_t) T_audio + t];
        }
        free(planar);

        VAEEncoder enc = {};
        vae_enc_load(&enc, vae_path);

        int                max_T_latent = T_audio / HOP + 1;
        std::vector<float> latent((size_t) max_T_latent * LATENT_CH);
        int T_latent = vae_enc_encode_tiled(&enc, interleaved.data(), T_audio, latent.data(), max_T_latent, core, halo);
        vae_enc_free(&enc);
        if (T_latent < 0) {
            return 1;
        }

        bool ok = quant == 8 ? write_latent_q8(target.c_str(), latent.data(), T_latent) :
                  quant == 4 ? write_latent_q4(target.c_str(), latent.data(), T_latent) :
                               write_latent_f32(target.c_str(), latent.data(), T_latent);
        return ok ? 0 : 1;
    }

    int     T_latent = 0;
    float * latent   = read_latent(input_path, &T_latent);
    if (!latent || T_latent < 1) {
        free(latent);
        return 1;
    }

    VAEGGML vae = {};
    vae_ggml_load(&vae, vae_path);

    int                max_T_audio = T_latent * HOP;
    std::vector<float> audio((size_t) 2 * max_T_audio);
    int                T_audio = vae_ggml_decode_tiled(&vae, latent, T_latent, audio.data(), max_T_audio, core, halo);
    vae_ggml_free(&vae);
    free(latent);
    if (T_audio < 0) {
        return 1;
    }

    bool written = is_mp3 ? audio_write_mp3(target.c_str(), audio.data(), T_audio, SAMPLE_RATE, bitrate) :
                            audio_write_wav(target.c_str(), audio.data(), T_audio, SAMPLE_RATE, wav_fmt);
    return written ? 0 : 1;
}
