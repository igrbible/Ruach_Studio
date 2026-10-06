#pragma once
// unicode.h: the Unicode layer the frozen tokenizer needs
//
// UTF-8 transport, NFC normalization, and the character classes the
// pre-tokenizer pattern matches. Data lives in the generated table; the
// Hangul syllables are algorithmic and stay out of it.

#include "unicode-table.h"

#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>

// Hangul composition constants (UAX #15)
static const uint32_t UNI_HANGUL_SBASE = 0xAC00;
static const uint32_t UNI_HANGUL_LBASE = 0x1100;
static const uint32_t UNI_HANGUL_VBASE = 0x1161;
static const uint32_t UNI_HANGUL_TBASE = 0x11A7;
static const uint32_t UNI_HANGUL_LCNT  = 19;
static const uint32_t UNI_HANGUL_VCNT  = 21;
static const uint32_t UNI_HANGUL_TCNT  = 28;
static const uint32_t UNI_HANGUL_NCNT  = UNI_HANGUL_VCNT * UNI_HANGUL_TCNT;
static const uint32_t UNI_HANGUL_SCNT  = UNI_HANGUL_LCNT * UNI_HANGUL_NCNT;

// One code point from a UTF-8 cursor, advance holds its byte length
static int utf8_codepoint(const char * s, int * advance) {
    unsigned char c = (unsigned char) s[0];
    if (c < 0x80) {
        *advance = 1;
        return c;
    }
    if ((c & 0xE0) == 0xC0) {
        *advance = 2;
        return ((c & 0x1F) << 6) | (s[1] & 0x3F);
    }
    if ((c & 0xF0) == 0xE0) {
        *advance = 3;
        return ((c & 0x0F) << 12) | ((s[1] & 0x3F) << 6) | (s[2] & 0x3F);
    }
    if ((c & 0xF8) == 0xF0) {
        *advance = 4;
        return ((c & 0x07) << 18) | ((s[1] & 0x3F) << 12) | ((s[2] & 0x3F) << 6) | (s[3] & 0x3F);
    }
    *advance = 1;
    return c;
}

static void utf8_append(std::string & out, uint32_t cp) {
    if (cp < 0x80) {
        out += (char) cp;
    } else if (cp < 0x800) {
        out += (char) (0xC0 | (cp >> 6));
        out += (char) (0x80 | (cp & 0x3F));
    } else if (cp < 0x10000) {
        out += (char) (0xE0 | (cp >> 12));
        out += (char) (0x80 | ((cp >> 6) & 0x3F));
        out += (char) (0x80 | (cp & 0x3F));
    } else {
        out += (char) (0xF0 | (cp >> 18));
        out += (char) (0x80 | ((cp >> 12) & 0x3F));
        out += (char) (0x80 | ((cp >> 6) & 0x3F));
        out += (char) (0x80 | (cp & 0x3F));
    }
}

// Range table lookup, the tables being sorted and disjoint
static bool uni_in_ranges(const uint32_t table[][2], size_t n, uint32_t cp) {
    size_t lo = 0, hi = n;
    while (lo < hi) {
        size_t mid = (lo + hi) / 2;
        if (cp < table[mid][0]) {
            hi = mid;
        } else if (cp > table[mid][1]) {
            lo = mid + 1;
        } else {
            return true;
        }
    }
    return false;
}

// Category L, what \p{L} matches
static bool uni_is_letter(uint32_t cp) {
    return uni_in_ranges(UNI_LETTER, sizeof(UNI_LETTER) / sizeof(UNI_LETTER[0]), cp);
}

// Category N, what \p{N} matches
static bool uni_is_number(uint32_t cp) {
    return uni_in_ranges(UNI_NUMBER, sizeof(UNI_NUMBER) / sizeof(UNI_NUMBER[0]), cp);
}

// The White_Space property, what \s matches
static bool uni_is_space(uint32_t cp) {
    if (cp < 0x80) {
        return cp == 0x09 || cp == 0x0A || cp == 0x0B || cp == 0x0C || cp == 0x0D || cp == 0x20;
    }
    return cp == 0x85 || cp == 0xA0 || cp == 0x1680 || (cp >= 0x2000 && cp <= 0x200A) || cp == 0x2028 || cp == 0x2029 ||
           cp == 0x202F || cp == 0x205F || cp == 0x3000;
}

static bool uni_is_newline(uint32_t cp) {
    return cp == 0x0A || cp == 0x0D;
}

// Canonical combining class
static int uni_ccc(uint32_t cp) {
    size_t lo = 0, hi = sizeof(UNI_CCC) / sizeof(UNI_CCC[0]);
    while (lo < hi) {
        size_t mid = (lo + hi) / 2;
        if (cp < UNI_CCC[mid][0]) {
            hi = mid;
        } else if (cp > UNI_CCC[mid][1]) {
            lo = mid + 1;
        } else {
            return (int) UNI_CCC[mid][2];
        }
    }
    return 0;
}

// Canonical decomposition of one code point, b stays 0 for a singleton
static bool uni_decompose_one(uint32_t cp, uint32_t * a, uint32_t * b) {
    size_t lo = 0, hi = sizeof(UNI_DEC) / sizeof(UNI_DEC[0]);
    while (lo < hi) {
        size_t mid = (lo + hi) / 2;
        if (cp < UNI_DEC[mid][0]) {
            hi = mid;
        } else if (cp > UNI_DEC[mid][0]) {
            lo = mid + 1;
        } else {
            *a = UNI_DEC[mid][1];
            *b = UNI_DEC[mid][2];
            return true;
        }
    }
    return false;
}

// Canonical composition of a pair, 0 when the pair does not compose
static uint32_t uni_compose_pair(uint32_t a, uint32_t b) {
    // Hangul: L + V, then LV + T
    if (a >= UNI_HANGUL_LBASE && a < UNI_HANGUL_LBASE + UNI_HANGUL_LCNT && b >= UNI_HANGUL_VBASE &&
        b < UNI_HANGUL_VBASE + UNI_HANGUL_VCNT) {
        return UNI_HANGUL_SBASE + ((a - UNI_HANGUL_LBASE) * UNI_HANGUL_VCNT + (b - UNI_HANGUL_VBASE)) * UNI_HANGUL_TCNT;
    }
    if (a >= UNI_HANGUL_SBASE && a < UNI_HANGUL_SBASE + UNI_HANGUL_SCNT &&
        (a - UNI_HANGUL_SBASE) % UNI_HANGUL_TCNT == 0 && b > UNI_HANGUL_TBASE &&
        b < UNI_HANGUL_TBASE + UNI_HANGUL_TCNT) {
        return a + (b - UNI_HANGUL_TBASE);
    }

    size_t lo = 0, hi = sizeof(UNI_COMP) / sizeof(UNI_COMP[0]);
    while (lo < hi) {
        size_t mid = (lo + hi) / 2;
        if (a < UNI_COMP[mid][0] || (a == UNI_COMP[mid][0] && b < UNI_COMP[mid][1])) {
            hi = mid;
        } else if (a > UNI_COMP[mid][0] || (a == UNI_COMP[mid][0] && b > UNI_COMP[mid][1])) {
            lo = mid + 1;
        } else {
            return UNI_COMP[mid][2];
        }
    }
    return 0;
}

// Full canonical decomposition of one code point into the sequence
static void uni_decompose(uint32_t cp, std::vector<uint32_t> & out) {
    if (cp >= UNI_HANGUL_SBASE && cp < UNI_HANGUL_SBASE + UNI_HANGUL_SCNT) {
        uint32_t idx = cp - UNI_HANGUL_SBASE;
        out.push_back(UNI_HANGUL_LBASE + idx / UNI_HANGUL_NCNT);
        out.push_back(UNI_HANGUL_VBASE + (idx % UNI_HANGUL_NCNT) / UNI_HANGUL_TCNT);
        uint32_t t = idx % UNI_HANGUL_TCNT;
        if (t) {
            out.push_back(UNI_HANGUL_TBASE + t);
        }
        return;
    }
    uint32_t a = 0, b = 0;
    if (uni_decompose_one(cp, &a, &b)) {
        uni_decompose(a, out);
        if (b) {
            uni_decompose(b, out);
        }
        return;
    }
    out.push_back(cp);
}

// NFC: canonical decomposition, canonical ordering, canonical composition.
// Pure ASCII is already normalized and takes the direct path.
static std::string uni_nfc(const std::string & text) {
    bool ascii = true;
    for (size_t i = 0; i < text.size(); i++) {
        if ((unsigned char) text[i] >= 0x80) {
            ascii = false;
            break;
        }
    }
    if (ascii) {
        return text;
    }

    std::vector<uint32_t> seq;
    seq.reserve(text.size());
    for (size_t i = 0; i < text.size();) {
        int adv = 0;
        uni_decompose((uint32_t) utf8_codepoint(text.c_str() + i, &adv), seq);
        i += (size_t) adv;
    }

    // Canonical ordering: combining marks sort by class, stable inside a run
    for (size_t i = 1; i < seq.size(); i++) {
        int cc = uni_ccc(seq[i]);
        if (cc == 0) {
            continue;
        }
        size_t j = i;
        while (j > 0 && uni_ccc(seq[j - 1]) > cc) {
            uint32_t tmp = seq[j - 1];
            seq[j - 1]   = seq[j];
            seq[j]       = tmp;
            j--;
        }
    }

    // Canonical composition: each combining mark folds into the starter it
    // follows unless a mark of the same or higher class already blocks it
    std::vector<uint32_t> comp;
    comp.reserve(seq.size());
    if (!seq.empty()) {
        comp.push_back(seq[0]);
        size_t starter    = 0;
        int    last_class = uni_ccc(seq[0]) != 0 ? 256 : 0;
        for (size_t i = 1; i < seq.size(); i++) {
            int      cc  = uni_ccc(seq[i]);
            uint32_t fit = uni_compose_pair(comp[starter], seq[i]);
            if (fit && (last_class < cc || last_class == 0)) {
                comp[starter] = fit;
                continue;
            }
            if (cc == 0) {
                starter = comp.size();
            }
            last_class = cc;
            comp.push_back(seq[i]);
        }
    }

    std::string out;
    out.reserve(text.size());
    for (size_t i = 0; i < comp.size(); i++) {
        utf8_append(out, comp[i]);
    }
    return out;
}
