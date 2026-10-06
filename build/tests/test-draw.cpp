// test-draw.cpp: token draw parity harness
//
// Rebuilds the nucleus from a dumped probability vector, then draws a run of
// tokens from a seeded Philox stream and writes the ids as raw f32, every id
// being exactly representable, for comparison against torch.multinomial at the
// same seed with the one comparison tool of the suite.

#include "sampling.h"

#include <cstdio>
#include <cstdlib>
#include <vector>

int main(int argc, char ** argv) {
    if (argc != 5) {
        fprintf(stderr, "usage: %s probs.bin seed draws ids_out.bin\n", argv[0]);
        return 1;
    }

    const char * probs_path = argv[1];
    int64_t      seed       = atoll(argv[2]);
    int          draws      = atoi(argv[3]);
    const char * out_path   = argv[4];

    FILE * f = fopen(probs_path, "rb");
    if (!f) {
        fprintf(stderr, "[Test-Draw] cannot read %s\n", probs_path);
        return 1;
    }
    fseek(f, 0, SEEK_END);
    long count = ftell(f) / (long) sizeof(float);
    fseek(f, 0, SEEK_SET);
    std::vector<float> probs((size_t) count);
    if (fread(probs.data(), sizeof(float), probs.size(), f) != probs.size()) {
        fprintf(stderr, "[Test-Draw] cannot read %s\n", probs_path);
        return 1;
    }
    fclose(f);

    std::vector<Yue2Candidate> candidates;
    for (long i = 0; i < count; i++) {
        if (probs[(size_t) i] > 0.0f) {
            candidates.push_back({ (int) i, logf(probs[(size_t) i]) });
        }
    }
    if (candidates.empty()) {
        fprintf(stderr, "[Test-Draw] empty nucleus\n");
        return 1;
    }
    float top = candidates[0].score;
    for (size_t i = 1; i < candidates.size(); i++) {
        if (candidates[i].score > top) {
            top = candidates[i].score;
        }
    }
    for (size_t i = 0; i < candidates.size(); i++) {
        if (candidates[i].score == top) {
            Yue2Candidate first = candidates[i];
            candidates[i]       = candidates[0];
            candidates[0]       = first;
            break;
        }
    }

    std::vector<float> ids((size_t) draws);
    for (int i = 0; i < draws; i++) {
        ids[(size_t) i] = (float) yue2_draw(candidates, seed, i);
    }

    FILE * out = fopen(out_path, "wb");
    if (!out || fwrite(ids.data(), sizeof(float), ids.size(), out) != ids.size()) {
        fprintf(stderr, "[Test-Draw] cannot write %s\n", out_path);
        return 1;
    }
    fclose(out);

    fprintf(stderr, "[Test-Draw] %zu candidates, seed %lld, %d draws\n", candidates.size(), (long long) seed, draws);
    return 0;
}
