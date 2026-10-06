#pragma once
// philox.h  Philox4x32-10 counter based PRNG
//
// The token draw keys the generator on the request seed and counts the
// subsequence per vocabulary entry, which is how cuRAND feeds the torch
// sampler, so an equal seed reproduces the reference stream.

#include <cstdint>

// Philox constants (same as cuRAND / Random123)
static constexpr uint32_t PHILOX_M0 = 0xD2511F53u;
static constexpr uint32_t PHILOX_M1 = 0xCD9E8D57u;
static constexpr uint32_t PHILOX_W0 = 0x9E3779B9u;
static constexpr uint32_t PHILOX_W1 = 0xBB67AE85u;

// cuRAND uniform conversion
static constexpr float CURAND_2POW32_INV = 2.3283064365386963e-10f;  // 1 / 2^32

struct Philox4 {
    uint32_t x, y, z, w;
};

// 32x32 -> (hi32, lo32)
static inline void mulhilo32(uint32_t a, uint32_t b, uint32_t * hi, uint32_t * lo) {
    uint64_t prod = (uint64_t) a * (uint64_t) b;
    *lo           = (uint32_t) prod;
    *hi           = (uint32_t) (prod >> 32);
}

// Single Philox round
static inline Philox4 philox_round(Philox4 ctr, uint32_t k0, uint32_t k1) {
    uint32_t hi0, lo0, hi1, lo1;
    mulhilo32(PHILOX_M0, ctr.x, &hi0, &lo0);
    mulhilo32(PHILOX_M1, ctr.z, &hi1, &lo1);
    return {
        hi1 ^ ctr.y ^ k0,
        lo1,
        hi0 ^ ctr.w ^ k1,
        lo0,
    };
}

// Philox4x32-10: 10 rounds
static inline Philox4 philox4x32_10(Philox4 ctr, uint32_t seed_lo, uint32_t seed_hi) {
    uint32_t k0 = seed_lo;
    uint32_t k1 = seed_hi;
    ctr         = philox_round(ctr, k0, k1);
    k0 += PHILOX_W0;
    k1 += PHILOX_W1;
    ctr = philox_round(ctr, k0, k1);
    k0 += PHILOX_W0;
    k1 += PHILOX_W1;
    ctr = philox_round(ctr, k0, k1);
    k0 += PHILOX_W0;
    k1 += PHILOX_W1;
    ctr = philox_round(ctr, k0, k1);
    k0 += PHILOX_W0;
    k1 += PHILOX_W1;
    ctr = philox_round(ctr, k0, k1);
    k0 += PHILOX_W0;
    k1 += PHILOX_W1;
    ctr = philox_round(ctr, k0, k1);
    k0 += PHILOX_W0;
    k1 += PHILOX_W1;
    ctr = philox_round(ctr, k0, k1);
    k0 += PHILOX_W0;
    k1 += PHILOX_W1;
    ctr = philox_round(ctr, k0, k1);
    k0 += PHILOX_W0;
    k1 += PHILOX_W1;
    ctr = philox_round(ctr, k0, k1);
    k0 += PHILOX_W0;
    k1 += PHILOX_W1;
    ctr = philox_round(ctr, k0, k1);
    return ctr;
}
