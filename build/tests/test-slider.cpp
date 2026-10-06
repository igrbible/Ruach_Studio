// test-slider.cpp: voice/genre slider parity harness (local addition)
//
// test-lm with sliders attached: prefills each sequence into its own KV set,
// decodes the last ids in one batched step, and dumps the logits of every
// forward. Sliders come as --slider path:strength, repeatable; none gives the
// plain backbone, so one binary produces both sides of the slider delta.

#include "qwen3-lm.h"

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <utility>
#include <vector>

static bool dump(const std::string & path, const std::vector<float> & data) {
    FILE * f = fopen(path.c_str(), "wb");
    if (!f || fwrite(data.data(), sizeof(float), data.size(), f) != data.size()) {
        fprintf(stderr, "[Test-Slider] cannot write %s\n", path.c_str());
        return false;
    }
    fclose(f);
    return true;
}

int main(int argc, char ** argv) {
    if (argc < 4) {
        fprintf(stderr, "usage: %s lm.gguf out_prefix [--slider path:strength ...] id0 [id1 ...] [/ ids ...]\n",
                argv[0]);
        return 1;
    }
    std::vector<std::pair<std::string, float>> chosen;
    std::vector<std::vector<int>>              seqs(1);
    for (int i = 3; i < argc; i++) {
        if (strcmp(argv[i], "--slider") == 0 && i + 1 < argc) {
            std::string arg   = argv[++i];
            size_t      colon = arg.rfind(':');
            chosen.push_back({ arg.substr(0, colon), (float) atof(arg.substr(colon + 1).c_str()) });
        } else if (strcmp(argv[i], "/") == 0) {
            seqs.emplace_back();
        } else {
            seqs.back().push_back(atoi(argv[i]));
        }
    }
    int N = (int) seqs.size();

    Qwen3LM lm;
    if (!qw3lm_load(&lm, argv[1])) {
        return 1;
    }
    SliderSet sliders;
    if (!sliders_load(&sliders, lm.backend, chosen, lm.cfg.n_layers)) {
        return 1;
    }
    qw3lm_set_sliders(&lm, &sliders);

    Qw3lmKvCache kv;
    qw3lm_kv_init(&kv, lm.cfg, lm.backend);
    if (!qw3lm_kv_sets(&kv, N)) {
        return 1;
    }

    int                V = lm.cfg.vocab_size;
    std::string        prefix(argv[2]);
    std::vector<float> logits((size_t) N * V);
    std::vector<int>   last(N), sets(N);
    for (int s = 0; s < N; s++) {
        qw3lm_forward(&lm, &kv, seqs[s].data(), (int) seqs[s].size() - 1, s, logits.data() + (size_t) s * V, 0, V);
        std::vector<float> one(logits.begin() + (size_t) s * V, logits.begin() + (size_t) (s + 1) * V);
        if (!dump(prefix + "_prefill_" + std::to_string(s) + "_logits.bin", one)) {
            return 1;
        }
        last[s] = seqs[s].back();
        sets[s] = s;
    }
    qw3lm_forward_batch(&lm, &kv, last.data(), sets.data(), N, logits.data(), 0, V);
    for (int s = 0; s < N; s++) {
        std::vector<float> one(logits.begin() + (size_t) s * V, logits.begin() + (size_t) (s + 1) * V);
        if (!dump(prefix + "_decode_" + std::to_string(s) + "_logits.bin", one)) {
            return 1;
        }
    }
    qw3lm_set_sliders(&lm, nullptr);
    sliders_free(&sliders);
    qw3lm_kv_free(&kv);
    qw3lm_free(&lm);
    return 0;
}
