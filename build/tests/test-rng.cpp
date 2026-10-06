// test-rng.cpp: PyTorch CPU generator parity harness
//
// Draws the uniform stream or the standard normal fill of a seeded CPU
// generator and writes them as raw f32, for comparison against torch.

#include "torch-cpu-rng.h"

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <vector>

int main(int argc, char ** argv) {
    if (argc != 5) {
        fprintf(stderr, "usage: %s seed count uniform|normal out.bin\n", argv[0]);
        return 1;
    }

    uint64_t     seed     = strtoull(argv[1], nullptr, 10);
    int64_t      count    = atoll(argv[2]);
    const char * kind     = argv[3];
    const char * out_path = argv[4];

    bool normal = strcmp(kind, "normal") == 0;
    if (!normal && strcmp(kind, "uniform") != 0) {
        fprintf(stderr, "[Test-RNG] kind must be uniform or normal\n");
        return 1;
    }
    if (count < 16) {
        fprintf(stderr, "[Test-RNG] count must be at least 16\n");
        return 1;
    }

    std::vector<float> values((size_t) count);
    if (normal) {
        torch_cpu_randn(seed, values.data(), count);
    } else {
        std::mt19937 engine = torch_cpu_generator(seed);
        for (int64_t i = 0; i < count; i++) {
            values[(size_t) i] = torch_cpu_uniform(engine);
        }
    }

    FILE * out = fopen(out_path, "wb");
    if (!out || fwrite(values.data(), sizeof(float), values.size(), out) != values.size()) {
        fprintf(stderr, "[Test-RNG] cannot write %s\n", out_path);
        return 1;
    }
    fclose(out);

    fprintf(stderr, "[Test-RNG] seed %llu, %lld %s values\n", (unsigned long long) seed, (long long) count, kind);
    return 0;
}
