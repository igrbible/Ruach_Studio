// HERESY 2139 (Viktor 06.11.2026, from his remote connection: «Вот очередная загрузка шрифтов без кеширования - это неприятно на удалённом
// соединении. Да и все assets загружать с кешированием, но в каждом иметь ключ ?675tg9 релиз тега»): the engine's half of the assets' keys.
// An asset's key is the first ten hex of its own SHA-256 (build.sh writes it into the page's URLs as ?v=KEY; lab/byte_ranges.py keys the
// lab's files the same way), so a file that did not change keeps its key across builds and releases, and one that did gets a new key at once.
// A request whose ?v= is the file's own key is kept a year (immutable); any other is no-cache with a validator, and a request that has the
// file already is answered 304. The page itself is never keyed: its validator is its size and time (build.sh's mv gives each build a new one).
//    sha256_hex(bytes) · key_of(bytes) · etag(opaque) · page_tag(size, mtime) · none_match(If-None-Match, tag) · IMMUTABLE
//    heresy/MISC/claude-arc/afix-2.0.6/cache-engine-harness.sh builds a harness of this file alone and holds it against sha256sum
#pragma once

#include <cstddef>
#include <cstdint>
#include <cstdio>
#include <filesystem>
#include <string>

namespace asset_cache {

static constexpr const char * IMMUTABLE = "public, max-age=31536000, immutable";
static constexpr size_t       KEY_LEN   = 10;   // build.sh's and the lab's length too

// SHA-256 as FIPS 180-4 has it, small and on its own: the engine links no crypto library (httplib's needs OpenSSL)
inline std::string sha256_hex(const std::string & data) {
    static const uint32_t K[64] = {
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be,
        0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa,
        0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85,
        0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
        0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f,
        0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    };
    uint32_t h[8] = { 0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19 };
    auto     rotr = [](uint32_t x, int n) { return (x >> n) | (x << (32 - n)); };
    // the message, its 0x80, zeros to 56 mod 64, and its length in bits (big-endian, 64 bits)
    std::string m = data;
    m.push_back((char) 0x80);
    while (m.size() % 64 != 56) {
        m.push_back((char) 0);
    }
    uint64_t bits = (uint64_t) data.size() * 8u;
    for (int i = 7; i >= 0; i--) {
        m.push_back((char) (unsigned char) ((bits >> (i * 8)) & 0xffu));
    }
    for (size_t at = 0; at < m.size(); at += 64) {
        uint32_t w[64];
        for (size_t i = 0; i < 16; i++) {
            const unsigned char * p = (const unsigned char *) m.data() + at + i * 4;
            w[i] = ((uint32_t) p[0] << 24) | ((uint32_t) p[1] << 16) | ((uint32_t) p[2] << 8) | (uint32_t) p[3];
        }
        for (size_t i = 16; i < 64; i++) {
            uint32_t s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >> 3);
            uint32_t s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >> 10);
            w[i]        = w[i - 16] + s0 + w[i - 7] + s1;
        }
        uint32_t a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
        for (size_t i = 0; i < 64; i++) {
            uint32_t S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
            uint32_t ch = (e & f) ^ (~e & g);
            uint32_t t1 = hh + S1 + ch + K[i] + w[i];
            uint32_t S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
            uint32_t mj = (a & b) ^ (a & c) ^ (b & c);
            uint32_t t2 = S0 + mj;
            hh          = g;
            g           = f;
            f           = e;
            e           = d + t1;
            d           = c;
            c           = b;
            b           = a;
            a           = t1 + t2;
        }
        h[0] += a;
        h[1] += b;
        h[2] += c;
        h[3] += d;
        h[4] += e;
        h[5] += f;
        h[6] += g;
        h[7] += hh;
    }
    char out[65];
    for (int i = 0; i < 8; i++) {
        snprintf(out + i * 8, 9, "%08x", (unsigned) h[i]);
    }
    return std::string(out, 64);
}

// the key of these bytes: the very bytes a route is about to send, so the key never names other content
inline std::string key_of(const std::string & bytes) {
    return sha256_hex(bytes).substr(0, KEY_LEN);
}

inline std::string etag(const std::string & opaque) {
    return "W/\"" + opaque + "\"";
}

// the page's validator, by its size and time alone (17 MB is never read to answer a 304)
inline std::string page_tag(uintmax_t size, std::filesystem::file_time_type mtime) {
    char buf[64];
    snprintf(buf, sizeof buf, "%jx-%llx", size, (unsigned long long) mtime.time_since_epoch().count());
    return etag(buf);
}

// If-None-Match against tag by the weak comparison RFC 9110 asks of it: a list, «*», W/ or not
inline bool none_match(const std::string & header, const std::string & tag) {
    auto opaque = [](std::string t) {
        size_t a = t.find_first_not_of(" \t"), b = t.find_last_not_of(" \t");
        t        = a == std::string::npos ? "" : t.substr(a, b - a + 1);
        if (t.size() >= 2 && (t[0] == 'W' || t[0] == 'w') && t[1] == '/') {
            t = t.substr(2);
        }
        return t;
    };
    if (header.empty() || tag.empty()) {
        return false;
    }
    std::string want = opaque(tag);
    size_t      at   = 0;
    while (at <= header.size()) {
        size_t      end  = header.find(',', at);
        std::string part = opaque(header.substr(at, end == std::string::npos ? std::string::npos : end - at));
        if (part == "*" || (!part.empty() && part == want)) {
            return true;
        }
        if (end == std::string::npos) {
            break;
        }
        at = end + 1;
    }
    return false;
}

}  // namespace asset_cache
