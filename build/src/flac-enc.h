#pragma once
// flac-enc.h: a small lossless FLAC encoder for the server's song downloads.
//
// Takes integer PCM (16 or 24 bits, 1 to 8 channels) and writes a standard FLAC
// stream: STREAMINFO (with the MD5 of the audio, so `flac -t` can verify every
// sample) and a VORBIS_COMMENT block (title, lyrics), then frames of 4096 samples.
// Each channel is coded CONSTANT, VERBATIM or FIXED (orders 0-4) with partitioned
// Rice residuals; stereo takes the cheapest of left/right, left/side, side/right
// and mid/side per frame. No LPC, so files come out a few percent larger than the
// reference encoder's default, but decode to exactly the same samples.
//
// flac_encode_wav() reads a RIFF WAV (16/24-bit PCM, or 32-bit float, which is
// rounded to 24-bit since FLAC holds integers only) and returns the FLAC file.

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <string>
#include <utility>
#include <vector>

namespace flac_enc {

static const int BLOCK = 4096;

// MSB-first bit writer
struct Bits {
    std::string out;
    uint64_t    acc = 0;  // pending bits, fewer than 8 between calls
    int         n   = 0;

    void put(uint32_t v, int bits) {
        if (bits <= 0) {
            return;
        }
        uint64_t mask = bits >= 32 ? 0xFFFFFFFFull : ((1ull << bits) - 1);
        acc           = (acc << bits) | (v & mask);
        n += bits;
        while (n >= 8) {
            n -= 8;
            out.push_back((char) ((acc >> n) & 0xFF));
        }
        acc &= (1ull << n) - 1;
    }

    void put_signed(int32_t v, int bits) { put((uint32_t) v, bits); }

    // q zeros, then a one
    void put_unary(uint32_t q) {
        while (q >= 31) {
            put(0, 31);
            q -= 31;
        }
        put(1, (int) q + 1);
    }

    void align() {
        if (n) {
            put(0, 8 - n);
        }
    }
};

static uint8_t crc8(const std::string & s) {
    uint8_t c = 0;
    for (unsigned char b : s) {
        c ^= b;
        for (int i = 0; i < 8; i++) {
            c = (c & 0x80) ? (uint8_t) ((c << 1) ^ 0x07) : (uint8_t) (c << 1);
        }
    }
    return c;
}

static uint16_t crc16(const std::string & s) {
    static const std::array<uint16_t, 256> table = [] {
        std::array<uint16_t, 256> t{};
        for (int i = 0; i < 256; i++) {
            uint16_t c = (uint16_t) (i << 8);
            for (int j = 0; j < 8; j++) {
                c = (c & 0x8000) ? (uint16_t) ((c << 1) ^ 0x8005) : (uint16_t) (c << 1);
            }
            t[i] = c;
        }
        return t;
    }();
    uint16_t c = 0;
    for (unsigned char b : s) {
        c = (uint16_t) ((c << 8) ^ table[((c >> 8) ^ b) & 0xFF]);
    }
    return c;
}

// RFC 1321, for the STREAMINFO signature of the unencoded audio
struct Md5 {
    uint32_t h[4]  = { 0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476 };
    uint64_t len   = 0;
    uint8_t  buf[64];
    size_t   fill = 0;

    static uint32_t rotl(uint32_t x, int c) { return (x << c) | (x >> (32 - c)); }

    void block(const uint8_t * p) {
        static const uint32_t K[64] = {
            0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
            0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be, 0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821,
            0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
            0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
            0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c, 0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
            0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
            0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
            0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1, 0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391,
        };
        static const int S[64] = { 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9,  14, 20, 5, 9,
                                   14, 20, 5, 9,  14, 20, 5, 9,  14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
                                   4,  11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21 };
        uint32_t         M[16];
        for (int i = 0; i < 16; i++) {
            M[i] = (uint32_t) p[i * 4] | ((uint32_t) p[i * 4 + 1] << 8) | ((uint32_t) p[i * 4 + 2] << 16) |
                   ((uint32_t) p[i * 4 + 3] << 24);
        }
        uint32_t A = h[0], B = h[1], C = h[2], D = h[3];
        for (int i = 0; i < 64; i++) {
            uint32_t F;
            int      g;
            if (i < 16) {
                F = (B & C) | (~B & D);
                g = i;
            } else if (i < 32) {
                F = (D & B) | (~D & C);
                g = (5 * i + 1) % 16;
            } else if (i < 48) {
                F = B ^ C ^ D;
                g = (3 * i + 5) % 16;
            } else {
                F = C ^ (B | ~D);
                g = (7 * i) % 16;
            }
            F = F + A + K[i] + M[g];
            A = D;
            D = C;
            C = B;
            B = B + rotl(F, S[i]);
        }
        h[0] += A;
        h[1] += B;
        h[2] += C;
        h[3] += D;
    }

    void update(const uint8_t * p, size_t size) {
        len += size;
        while (size) {
            size_t take = std::min(64 - fill, size);
            memcpy(buf + fill, p, take);
            fill += take;
            p += take;
            size -= take;
            if (fill == 64) {
                block(buf);
                fill = 0;
            }
        }
    }

    void finish(uint8_t digest[16]) {
        uint64_t      bits = len * 8;
        const uint8_t one = 0x80, zero = 0;
        update(&one, 1);
        while (fill != 56) {
            update(&zero, 1);
        }
        uint8_t tail[8];
        for (int i = 0; i < 8; i++) {
            tail[i] = (uint8_t) (bits >> (8 * i));
        }
        update(tail, 8);
        for (int i = 0; i < 4; i++) {
            for (int j = 0; j < 4; j++) {
                digest[i * 4 + j] = (uint8_t) (h[i] >> (8 * j));
            }
        }
    }
};

// One channel of one frame, as it will be written
struct Sub {
    int                   kind   = 1;  // 0 constant, 1 verbatim, 2 fixed predictor
    int                   order  = 0;
    int                   po     = 0;  // Rice partition order
    int                   method = 0;  // 0: 4-bit Rice parameters, 1: 5-bit
    std::vector<int>      ks;
    std::vector<uint32_t> u;           // zigzagged residual
    uint64_t              bits   = 0;
};

static inline int64_t fixed_error(const int32_t * x, int i, int order) {
    switch (order) {
        case 0:
            return x[i];
        case 1:
            return (int64_t) x[i] - x[i - 1];
        case 2:
            return (int64_t) x[i] - 2 * (int64_t) x[i - 1] + x[i - 2];
        case 3:
            return (int64_t) x[i] - 3 * (int64_t) x[i - 1] + 3 * (int64_t) x[i - 2] - x[i - 3];
        default:
            return (int64_t) x[i] - 4 * (int64_t) x[i - 1] + 6 * (int64_t) x[i - 2] - 4 * (int64_t) x[i - 3] + x[i - 4];
    }
}

static inline uint32_t zigzag(int64_t e) {
    return e >= 0 ? (uint32_t) (e << 1) : (uint32_t) (((-e) << 1) - 1);
}

// Rice parameter with the fewest estimated bits for a partition
static inline int rice_k(uint64_t sum, uint64_t count, uint64_t * cost) {
    int      best_k    = 0;
    uint64_t best_cost = UINT64_MAX;
    for (int k = 0; k <= 30; k++) {
        uint64_t c = count * (uint64_t) (k + 1) + (sum >> k);
        if (c < best_cost) {
            best_cost = c;
            best_k    = k;
        }
    }
    *cost = best_cost;
    return best_k;
}

static Sub choose(const int32_t * x, int n, int bps) {
    Sub best;
    best.kind = 1;
    best.bits = 8 + (uint64_t) n * bps;

    bool constant = true;
    for (int i = 1; i < n && constant; i++) {
        constant = x[i] == x[0];
    }
    if (constant) {
        best.kind = 0;
        best.bits = 8 + (uint64_t) bps;
        return best;
    }

    // predictor order with the smallest total |residual|, over the same span for every order
    int      max_order = std::min(4, n - 1);
    int      order     = 0;
    uint64_t least     = UINT64_MAX;
    for (int p = 0; p <= max_order; p++) {
        uint64_t sum = 0;
        for (int i = max_order; i < n; i++) {
            int64_t e = fixed_error(x, i, p);
            sum += (uint64_t) (e < 0 ? -e : e);
        }
        if (sum < least) {
            least = sum;
            order = p;
        }
    }

    Sub fx;
    fx.kind  = 2;
    fx.order = order;
    fx.u.resize(n - order);
    for (int i = order; i < n; i++) {
        fx.u[i - order] = zigzag(fixed_error(x, i, order));
    }

    // finest partitioning allowed, then merge pairs level by level
    int max_po = 0;
    while (max_po < 8 && (n % (2 << max_po)) == 0 && (n >> (max_po + 1)) > order) {
        max_po++;
    }
    int                   parts = 1 << max_po, psize = n >> max_po;
    std::vector<uint64_t> sum(parts), cnt(parts);
    for (int p = 0; p < parts; p++) {
        int      lo = p == 0 ? order : p * psize, hi = (p + 1) * psize;
        uint64_t s  = 0;
        for (int i = lo; i < hi; i++) {
            s += fx.u[i - order];
        }
        sum[p] = s;
        cnt[p] = (uint64_t) (hi - lo);
    }
    uint64_t best_rice = UINT64_MAX;
    for (int po = max_po; po >= 0; po--) {
        int              np    = 1 << po;
        uint64_t         total = 6;
        bool             wide  = false;
        std::vector<int> ks(np);
        for (int p = 0; p < np; p++) {
            uint64_t cost;
            ks[p] = rice_k(sum[p], cnt[p], &cost);
            wide |= ks[p] > 14;
            total += cost;
        }
        total += (uint64_t) np * (wide ? 5 : 4);
        if (total < best_rice) {
            best_rice = total;
            fx.po     = po;
            fx.method = wide ? 1 : 0;
            fx.ks     = ks;
        }
        for (int p = 0; p < np / 2; p++) {
            sum[p] = sum[2 * p] + sum[2 * p + 1];
            cnt[p] = cnt[2 * p] + cnt[2 * p + 1];
        }
    }

    // exact size of the chosen coding
    uint64_t bits = 8 + (uint64_t) order * bps + 6 + (uint64_t) (1 << fx.po) * (fx.method ? 5 : 4);
    int      np = 1 << fx.po, pn = n >> fx.po;
    size_t   at = 0;
    for (int p = 0; p < np; p++) {
        int k     = fx.ks[p];
        int count = pn - (p == 0 ? order : 0);
        for (int i = 0; i < count; i++, at++) {
            bits += (fx.u[at] >> k) + 1 + (uint64_t) k;
        }
    }
    fx.bits = bits;
    return fx.bits < best.bits ? fx : best;
}

static void write_sub(Bits & w, const int32_t * x, int n, int bps, const Sub & s) {
    if (s.kind == 0) {
        w.put(0x00, 8);
        w.put_signed(x[0], bps);
        return;
    }
    if (s.kind == 1) {
        w.put(0x02, 8);
        for (int i = 0; i < n; i++) {
            w.put_signed(x[i], bps);
        }
        return;
    }
    w.put((uint32_t) (0x10 | (s.order << 1)), 8);
    for (int i = 0; i < s.order; i++) {
        w.put_signed(x[i], bps);
    }
    w.put((uint32_t) s.method, 2);
    w.put((uint32_t) s.po, 4);
    int    np = 1 << s.po, pn = n >> s.po;
    size_t at = 0;
    for (int p = 0; p < np; p++) {
        int k = s.ks[p];
        w.put((uint32_t) k, s.method ? 5 : 4);
        int      count = pn - (p == 0 ? s.order : 0);
        uint32_t mask  = k ? ((1u << k) - 1) : 0;
        for (int i = 0; i < count; i++, at++) {
            uint32_t v = s.u[at];
            w.put_unary(v >> k);
            w.put(v & mask, k);
        }
    }
}

static void put_utf8(Bits & w, uint32_t v) {
    if (v < 0x80) {
        w.put(v, 8);
        return;
    }
    int lead_bits, extra;
    if (v < 0x800) {
        extra = 1;
    } else if (v < 0x10000) {
        extra = 2;
    } else if (v < 0x200000) {
        extra = 3;
    } else if (v < 0x4000000) {
        extra = 4;
    } else {
        extra = 5;
    }
    lead_bits = 6 - extra;  // payload bits in the first byte
    uint32_t lead = (0xFF00u >> (extra + 1)) & 0xFF;
    w.put(lead | ((v >> (6 * extra)) & ((1u << lead_bits) - 1)), 8);
    for (int i = extra - 1; i >= 0; i--) {
        w.put(0x80 | ((v >> (6 * i)) & 0x3F), 8);
    }
}

// Frame-header sample rate: a table code, or a code plus a value after the block size
static int rate_code(int rate, uint32_t * value, int * value_bits) {
    *value_bits = 0;
    switch (rate) {
        case 88200:
            return 1;
        case 176400:
            return 2;
        case 192000:
            return 3;
        case 8000:
            return 4;
        case 16000:
            return 5;
        case 22050:
            return 6;
        case 24000:
            return 7;
        case 32000:
            return 8;
        case 44100:
            return 9;
        case 48000:
            return 10;
        case 96000:
            return 11;
    }
    if (rate % 1000 == 0 && rate / 1000 <= 255) {
        *value      = (uint32_t) (rate / 1000);
        *value_bits = 8;
        return 12;
    }
    if (rate <= 65535) {
        *value      = (uint32_t) rate;
        *value_bits = 16;
        return 13;
    }
    if (rate % 10 == 0 && rate / 10 <= 65535) {
        *value      = (uint32_t) (rate / 10);
        *value_bits = 16;
        return 14;
    }
    return 0;  // from STREAMINFO
}

static void le32(std::string & s, uint32_t v) {
    for (int i = 0; i < 4; i++) {
        s.push_back((char) ((v >> (8 * i)) & 0xFF));
    }
}

// pcm: interleaved integers, frames x channels; bits 16 or 24
static std::string encode(const int32_t * pcm, int64_t frames, int channels, int rate, int bits,
                          const std::vector<std::pair<std::string, std::string>> & tags) {
    if (frames <= 0 || channels < 1 || channels > 8 || (bits != 16 && bits != 24) || rate <= 0 ||
        rate >= (1 << 20)) {
        return std::string();
    }
    const int block = (int) std::min<int64_t>(BLOCK, frames);
    const int bytes = bits / 8;

    std::string                       body;
    uint32_t                          min_frame = UINT32_MAX, max_frame = 0;
    Md5                               md5;
    std::vector<uint8_t>              raw((size_t) block * channels * bytes);
    std::vector<std::vector<int32_t>> x(channels, std::vector<int32_t>(block));
    std::vector<int32_t>              mid(block), side(block);
    uint32_t                          rate_value = 0;
    int                               rate_bits  = 0;
    const int                         rcode      = rate_code(rate, &rate_value, &rate_bits);
    const int                         scode      = bits == 16 ? 4 : 6;

    uint32_t frame_no = 0;
    for (int64_t start = 0; start < frames; start += block, frame_no++) {
        const int n = (int) std::min<int64_t>(block, frames - start);
        size_t    r = 0;
        for (int i = 0; i < n; i++) {
            for (int c = 0; c < channels; c++) {
                int32_t v  = pcm[(start + i) * channels + c];
                x[c][i]    = v;
                raw[r++]   = (uint8_t) v;
                raw[r++]   = (uint8_t) (v >> 8);
                if (bytes == 3) {
                    raw[r++] = (uint8_t) (v >> 16);
                }
            }
        }
        md5.update(raw.data(), r);

        // subframes first, so the header can name the channel coding
        int              assign;
        std::vector<Sub> subs;
        std::vector<const int32_t *> src;
        std::vector<int> width;
        if (channels == 2) {
            for (int i = 0; i < n; i++) {
                side[i] = x[0][i] - x[1][i];
                mid[i]  = (x[0][i] + x[1][i]) >> 1;
            }
            Sub      L = choose(x[0].data(), n, bits), R = choose(x[1].data(), n, bits);
            Sub      S = choose(side.data(), n, bits + 1), M = choose(mid.data(), n, bits);
            uint64_t lr = L.bits + R.bits, ls = L.bits + S.bits, sr = S.bits + R.bits, ms = M.bits + S.bits;
            uint64_t least = std::min(std::min(lr, ls), std::min(sr, ms));
            if (least == lr) {
                assign = 1;
                subs   = { L, R };
                src    = { x[0].data(), x[1].data() };
                width  = { bits, bits };
            } else if (least == ms) {
                assign = 10;
                subs   = { M, S };
                src    = { mid.data(), side.data() };
                width  = { bits, bits + 1 };
            } else if (least == ls) {
                assign = 8;
                subs   = { L, S };
                src    = { x[0].data(), side.data() };
                width  = { bits, bits + 1 };
            } else {
                assign = 9;
                subs   = { S, R };
                src    = { side.data(), x[1].data() };
                width  = { bits + 1, bits };
            }
        } else {
            assign = channels - 1;
            for (int c = 0; c < channels; c++) {
                subs.push_back(choose(x[c].data(), n, bits));
                src.push_back(x[c].data());
                width.push_back(bits);
            }
        }

        Bits w;
        w.put(0x3FFE, 14);  // sync
        w.put(0, 1);
        w.put(0, 1);        // fixed block size
        const int bcode = n == 4096 ? 12 : (n <= 256 ? 6 : 7);
        w.put((uint32_t) bcode, 4);
        w.put((uint32_t) rcode, 4);
        w.put((uint32_t) assign, 4);
        w.put((uint32_t) scode, 3);
        w.put(0, 1);
        put_utf8(w, frame_no);
        if (bcode == 6) {
            w.put((uint32_t) (n - 1), 8);
        } else if (bcode == 7) {
            w.put((uint32_t) (n - 1), 16);
        }
        w.put(rate_value, rate_bits);
        w.put(crc8(w.out), 8);
        for (size_t c = 0; c < subs.size(); c++) {
            write_sub(w, src[c], n, width[c], subs[c]);
        }
        w.align();
        w.put(crc16(w.out), 16);

        min_frame = std::min(min_frame, (uint32_t) w.out.size());
        max_frame = std::max(max_frame, (uint32_t) w.out.size());
        body += w.out;
    }

    uint8_t digest[16];
    md5.finish(digest);

    std::string comments;
    std::string vendor = "yue-server flac-enc";
    le32(comments, (uint32_t) vendor.size());
    comments += vendor;
    std::vector<std::string> fields;
    for (const auto & t : tags) {
        if (!t.second.empty()) {
            fields.push_back(t.first + "=" + t.second);
        }
    }
    le32(comments, (uint32_t) fields.size());
    for (const auto & f : fields) {
        le32(comments, (uint32_t) f.size());
        comments += f;
    }
    if (comments.size() >= (1u << 24)) {
        comments.clear();  // absurdly long tags: drop them rather than the song
        le32(comments, (uint32_t) vendor.size());
        comments += vendor;
        le32(comments, 0);
    }

    Bits h;
    h.out = "fLaC";
    h.put(0, 1);  // STREAMINFO, more blocks follow
    h.put(0, 7);
    h.put(34, 24);
    h.put((uint32_t) std::max(block, 16), 16);  // decoders refuse a smaller minimum, even for a tiny file
    h.put((uint32_t) std::max(block, 16), 16);
    h.put(min_frame, 24);
    h.put(max_frame, 24);
    h.put((uint32_t) rate, 20);
    h.put((uint32_t) (channels - 1), 3);
    h.put((uint32_t) (bits - 1), 5);
    h.put((uint32_t) ((uint64_t) frames >> 32) & 0xF, 4);
    h.put((uint32_t) frames, 32);
    for (int i = 0; i < 16; i++) {
        h.put(digest[i], 8);
    }
    h.put(1, 1);  // VORBIS_COMMENT, the last block
    h.put(4, 7);
    h.put((uint32_t) comments.size(), 24);
    return h.out + comments + body;
}

// RIFF WAV -> interleaved integers. 32-bit float is rounded to 24-bit.
static bool wav_pcm(const std::string & wav, std::vector<int32_t> & pcm, int64_t & frames, int & channels,
                    int & rate, int & bits, std::string & err) {
    auto rd16 = [&](size_t o) { return (uint32_t) (uint8_t) wav[o] | ((uint32_t) (uint8_t) wav[o + 1] << 8); };
    auto rd32 = [&](size_t o) { return rd16(o) | (rd16(o + 2) << 16); };
    if (wav.size() < 12 || wav.compare(0, 4, "RIFF") != 0 || wav.compare(8, 4, "WAVE") != 0) {
        err = "not a WAV file";
        return false;
    }
    size_t at = 12, data_at = 0, data_len = 0;
    int    tag = 0, width = 0;
    bool   have_fmt = false, have_data = false;
    channels = rate = 0;
    while (at + 8 <= wav.size()) {
        size_t len  = rd32(at + 4);
        size_t body = at + 8;
        if (wav.compare(at, 4, "fmt ") == 0 && len >= 16 && body + 16 <= wav.size()) {
            tag      = (int) rd16(body);
            channels = (int) rd16(body + 2);
            rate     = (int) rd32(body + 4);
            width    = (int) rd16(body + 14);
            if (tag == 0xFFFE && len >= 40 && body + 26 <= wav.size()) {
                tag = (int) rd16(body + 24);  // WAVE_FORMAT_EXTENSIBLE: the sub-format's code
            }
            have_fmt = true;
        } else if (wav.compare(at, 4, "data") == 0) {
            data_at   = body;
            data_len  = std::min(len, wav.size() - body);
            have_data = true;
            break;
        }
        at = body + len + (len & 1);
    }
    if (!have_fmt || !have_data || channels < 1 || channels > 8 || rate <= 0) {
        err = "WAV file without a usable format or data chunk";
        return false;
    }
    const bool pcm16 = tag == 1 && width == 16, pcm24 = tag == 1 && width == 24, f32 = tag == 3 && width == 32;
    if (!pcm16 && !pcm24 && !f32) {
        err = "only 16/24-bit PCM or 32-bit float WAV can become FLAC";
        return false;
    }
    const size_t step = (size_t) (width / 8) * channels;
    frames            = (int64_t) (data_len / step);
    bits              = pcm16 ? 16 : 24;
    pcm.resize((size_t) frames * channels);
    const uint8_t * p = (const uint8_t *) wav.data() + data_at;
    for (size_t i = 0; i < pcm.size(); i++) {
        if (pcm16) {
            pcm[i] = (int16_t) (p[0] | (p[1] << 8));
            p += 2;
        } else if (pcm24) {
            int32_t v = (int32_t) (p[0] | (p[1] << 8) | (p[2] << 16));
            pcm[i]    = (v & 0x800000) ? v - 0x1000000 : v;
            p += 3;
        } else {
            float f;
            memcpy(&f, p, 4);
            p += 4;
            if (!(f == f)) {
                f = 0.0f;
            }
            f          = std::max(-1.0f, std::min(1.0f, f));
            long v     = lrint((double) f * 8388607.0);
            pcm[i]     = (int32_t) std::max(-8388608L, std::min(8388607L, v));
        }
    }
    return true;
}

}  // namespace flac_enc

// WAV bytes -> FLAC bytes (title and lyrics as Vorbis comments). Empty on failure, reason in err.
static std::string flac_encode_wav(const std::string & wav, const std::string & title, const std::string & lyrics,
                                   std::string & err, int * bits_out = nullptr) {
    std::vector<int32_t> pcm;
    int64_t              frames = 0;
    int                  channels = 0, rate = 0, bits = 0;
    if (!flac_enc::wav_pcm(wav, pcm, frames, channels, rate, bits, err)) {
        return std::string();
    }
    if (frames <= 0) {
        err = "the WAV file holds no audio";
        return std::string();
    }
    if (bits_out) {
        *bits_out = bits;
    }
    return flac_enc::encode(pcm.data(), frames, channels, rate, bits, { { "TITLE", title }, { "LYRICS", lyrics } });
}
