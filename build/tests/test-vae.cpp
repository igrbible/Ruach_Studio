// test-vae.cpp: Oobleck VAE decoder parity harness
//
// Decodes a raw f32 latent [T, 64] time-major through the GGML decoder and
// writes the planar stereo waveform [2, T_audio] as raw f32, for comparison
// against the torch reference dump. Passing core_frames decodes in tiles.

#include "vae.h"

#include <cstdio>
#include <cstdlib>
#include <vector>

int main(int argc, char ** argv) {
    if (argc != 5 && argc != 6) {
        fprintf(stderr, "usage: %s vae.gguf latent.bin T_latent audio_out.bin [core_frames]\n", argv[0]);
        return 1;
    }

    const char * gguf_path   = argv[1];
    const char * latent_path = argv[2];
    int          T           = atoi(argv[3]);
    const char * out_path    = argv[4];
    int          core_frames = (argc == 6) ? atoi(argv[5]) : 0;

    if (T < 1) {
        fprintf(stderr, "[Test-VAE] T_latent must be positive\n");
        return 1;
    }
    if (argc == 6 && core_frames < 1) {
        fprintf(stderr, "[Test-VAE] core_frames must be positive\n");
        return 1;
    }

    std::vector<float> latent((size_t) 64 * T);
    FILE *             f = fopen(latent_path, "rb");
    if (!f || fread(latent.data(), sizeof(float), latent.size(), f) != latent.size()) {
        fprintf(stderr, "[Test-VAE] cannot read latent %s\n", latent_path);
        return 1;
    }
    fclose(f);

    VAEGGML vae = {};
    vae_ggml_load(&vae, gguf_path);

    int                max_T_audio = T * 1920;
    std::vector<float> audio((size_t) 2 * max_T_audio);

    int T_audio = core_frames ? vae_ggml_decode_tiled(&vae, latent.data(), T, audio.data(), max_T_audio, core_frames) :
                                vae_ggml_decode(&vae, latent.data(), T, audio.data(), max_T_audio);
    if (T_audio < 0) {
        vae_ggml_free(&vae);
        return 1;
    }

    size_t n   = (size_t) 2 * T_audio;
    FILE * out = fopen(out_path, "wb");
    if (!out || fwrite(audio.data(), sizeof(float), n, out) != n) {
        fprintf(stderr, "[Test-VAE] cannot write %s\n", out_path);
        vae_ggml_free(&vae);
        return 1;
    }
    fclose(out);

    vae_ggml_free(&vae);
    fprintf(stderr, "[Test-VAE] Wrote %zu samples to %s\n", n, out_path);
    return 0;
}
