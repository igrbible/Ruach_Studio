// test-nar.cpp: backbone NAR path parity harness
//
// Prefills the AR prefix into KV set 0, then either evaluates the flow
// matching field once at a given raw timestep, or solves the whole ODE from
// the dumped state. The state holds M variations of [T_lat, latent_dim],
// which the graph evaluates side by side. Writes raw f32 in the same layout
// for comparison against the torch reference. The FP16 clamp flag runs both
// halves clamped.

#include "nar.h"

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <vector>

static bool read_all(const char * path, void * dst, size_t bytes) {
    FILE * f = fopen(path, "rb");
    if (!f || fread(dst, 1, bytes, f) != bytes) {
        fprintf(stderr, "[Test-NAR] cannot read %s\n", path);
        return false;
    }
    fclose(f);
    return true;
}

int main(int argc, char ** argv) {
    if (argc != 9 && !(argc == 10 && strcmp(argv[9], "--clamp-fp16") == 0)) {
        fprintf(stderr,
                "usage: %s backbone.gguf ar_ids.bin x_t.bin T_lat M velocity raw_t out.bin [--clamp-fp16]\n"
                "       %s backbone.gguf ar_ids.bin x_t.bin T_lat M solve steps out.bin [--clamp-fp16]\n",
                argv[0], argv[0]);
        return 1;
    }

    const char * gguf_path = argv[1];
    const char * ids_path  = argv[2];
    const char * xt_path   = argv[3];
    int          T_lat     = atoi(argv[4]);
    int          M         = atoi(argv[5]);
    const char * mode      = argv[6];
    const char * out_path  = argv[8];
    bool         clamp     = argc == 10;

    bool solve = strcmp(mode, "solve") == 0;
    if (!solve && strcmp(mode, "velocity") != 0) {
        fprintf(stderr, "[Test-NAR] mode must be velocity or solve\n");
        return 1;
    }
    float raw_t = solve ? 0.0f : (float) atof(argv[7]);
    int   steps = solve ? atoi(argv[7]) : 0;
    if (T_lat < 1 || M < 1 || (solve && steps < 1)) {
        fprintf(stderr, "[Test-NAR] T_lat, M and steps must be positive\n");
        return 1;
    }

    FILE * f = fopen(ids_path, "rb");
    if (!f) {
        fprintf(stderr, "[Test-NAR] cannot read %s\n", ids_path);
        return 1;
    }
    fseek(f, 0, SEEK_END);
    long ids_bytes = ftell(f);
    fclose(f);
    int ar_len = (int) (ids_bytes / (long) sizeof(int32_t));
    if (ar_len < 1) {
        fprintf(stderr, "[Test-NAR] empty AR prefix\n");
        return 1;
    }

    std::vector<int32_t> ids(ar_len);
    if (!read_all(ids_path, ids.data(), ids.size() * sizeof(int32_t))) {
        return 1;
    }

    Qwen3LM lm;
    if (!qw3lm_load(&lm, gguf_path)) {
        return 1;
    }
    lm.clamp_fp16 = clamp;
    Qw3lmKvCache kv;
    qw3lm_kv_init(&kv, lm.cfg, lm.backend);
    if (!qw3lm_kv_sets(&kv, 1)) {
        return 1;
    }

    Yue2NAR nar;
    if (!nar_load(&nar, gguf_path)) {
        qw3lm_free(&lm);
        return 1;
    }
    nar.clamp_fp16 = clamp;

    std::vector<float> x_t((size_t) nar.latent_dim * T_lat * M);
    if (!read_all(xt_path, x_t.data(), x_t.size() * sizeof(float))) {
        nar_free(&nar);
        qw3lm_free(&lm);
        return 1;
    }

    // Fill KV set 0 with the AR prefix, which is the NAR prefix cache
    std::vector<float> logits(lm.cfg.vocab_size);
    qw3lm_forward(&lm, &kv, ids.data(), ar_len, 0, logits.data(), 0, lm.cfg.vocab_size);

    std::vector<float> result(x_t.size());
    bool               ok;
    DebugDumper        quiet;
    debug_init(&quiet, nullptr);
    if (solve) {
        result = x_t;
        ok     = nar_solve(&nar, &kv, result.data(), T_lat, M, ar_len, 0, steps, &quiet);
    } else {
        ok = nar_velocity(&nar, &kv, x_t.data(), T_lat, M, ar_len, 0, raw_t, result.data());
    }
    if (!ok) {
        nar_free(&nar);
        qw3lm_free(&lm);
        return 1;
    }

    FILE * out = fopen(out_path, "wb");
    if (!out || fwrite(result.data(), sizeof(float), result.size(), out) != result.size()) {
        fprintf(stderr, "[Test-NAR] cannot write %s\n", out_path);
        nar_free(&nar);
        qw3lm_free(&lm);
        return 1;
    }
    fclose(out);

    nar_free(&nar);
    qw3lm_kv_free(&kv);
    qw3lm_free(&lm);
    if (solve) {
        fprintf(stderr, "[Test-NAR] Prefix %d tokens, T_lat=%d, M=%d, %d midpoint steps\n", ar_len, T_lat, M, steps);
    } else {
        fprintf(stderr, "[Test-NAR] Prefix %d tokens, T_lat=%d, M=%d, raw_t=%.4f\n", ar_len, T_lat, M, raw_t);
    }
    return 0;
}
