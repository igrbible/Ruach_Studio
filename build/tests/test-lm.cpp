// test-lm.cpp: backbone AR path parity harness
//
// Prefills one or more fixed token id sequences, each into its own KV set,
// then decodes their last ids in one batched step, dumping the logits of
// every forward for comparison against the torch reference. The FP16 clamp
// flag runs the same path clamped.

#include "qwen3-lm.h"

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>

static bool dump(const std::string & path, const std::vector<float> & data) {
    FILE * f = fopen(path.c_str(), "wb");
    if (!f || fwrite(data.data(), sizeof(float), data.size(), f) != data.size()) {
        fprintf(stderr, "[Test-LM] cannot write %s\n", path.c_str());
        return false;
    }
    fclose(f);
    return true;
}

int main(int argc, char ** argv) {
    bool clamp = argc > 3 && strcmp(argv[3], "--clamp-fp16") == 0;
    int  first = clamp ? 4 : 3;
    if (argc <= first) {
        fprintf(stderr, "usage: %s lm.gguf out_prefix [--clamp-fp16] id0 [id1 ...] [/ id0 [id1 ...]]\n", argv[0]);
        return 1;
    }

    // Sequences separated by a slash
    std::vector<std::vector<int>> seqs(1);
    for (int i = first; i < argc; i++) {
        if (strcmp(argv[i], "/") == 0) {
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
    lm.clamp_fp16 = clamp;
    Qw3lmKvCache kv;
    qw3lm_kv_init(&kv, lm.cfg, lm.backend);
    if (!qw3lm_kv_sets(&kv, N)) {
        return 1;
    }

    int                V = lm.cfg.vocab_size;
    std::string        prefix(argv[2]);
    std::vector<float> logits((size_t) N * V);
    std::vector<int>   last(N), sets(N);

    // Prefill all ids but the last of every sequence, then decode the last
    // ids in one batch, the whole vocabulary as the head window
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

    fprintf(stderr, "[Test-LM] %d sequences prefilled + decoded in one batch, V=%d\n", N, V);
    return 0;
}
