// torch-cpu-rng.h  PyTorch CPU distributions over std::mt19937
//
// The ATen engine is bit identical to std::mt19937, seeding included, so only
// the transformations that the standard library does not provide live here:
// the 24 bit uniform conversion and the vectorized normal fill.
//
// ATen fills the whole tensor with uniforms first, then rewrites it in blocks
// of 16 by Box-Muller pairing element j with element j+8. A tail shorter than
// 16 makes ATen redraw the last 16 uniforms, so the count of consumed words
// depends on the length.
//
// The NAR draws its initial noise from a CPU generator whatever the run
// device, so this stream decides which song a seed produces.
#pragma once

#include <cmath>
#include <cstdint>
#include <random>

// uniform_real_distribution<float>: the low 24 bits scaled into [0, 1)
static float torch_cpu_uniform(std::mt19937 & engine) {
    return (float) (engine() & 0x00ffffffu) * (1.0f / 16777216.0f);
}

// A CPU generator seeded the way torch seeds it, the high word being dropped
static std::mt19937 torch_cpu_generator(uint64_t seed) {
    return std::mt19937((uint32_t) (seed & 0xffffffffu));
}

// Box-Muller over a block of 16 uniforms, pairing j with j + 8
static void torch_cpu_normal_fill_16(float * data) {
    for (int j = 0; j < 8; j++) {
        float u1     = 1.0f - data[j];
        float u2     = data[j + 8];
        float radius = sqrtf(-2.0f * logf(u1));
        float theta  = (float) (2.0 * 3.14159265358979323846 * (double) u2);
        data[j]      = radius * cosf(theta);
        data[j + 8]  = radius * sinf(theta);
    }
}

// torch.randn on a CPU generator, standard normal, float32.
// The caller provides at least 16 values, which the latent block always does.
static void torch_cpu_randn(uint64_t seed, float * out, int64_t n) {
    std::mt19937 engine = torch_cpu_generator(seed);
    for (int64_t i = 0; i < n; i++) {
        out[i] = torch_cpu_uniform(engine);
    }
    for (int64_t i = 0; i + 16 <= n; i += 16) {
        torch_cpu_normal_fill_16(out + i);
    }
    if (n % 16 != 0) {
        // ATen redraws the trailing block instead of padding it
        float * tail = out + n - 16;
        for (int i = 0; i < 16; i++) {
            tail[i] = torch_cpu_uniform(engine);
        }
        torch_cpu_normal_fill_16(tail);
    }
}
