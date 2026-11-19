#pragma once
// HERESY 2659 (Viktor 17.11.2026: «на все импорты wav, flac, ogg, mp3. Остальные форматы в бездну… парсер на заголовок часть тела для
// каждого загружаемого, во избежание загрузки вредоносного кода»): the engine's side of the gate; the lab's (lab/upload_guard.py) is the one
// every import passes, and checks the same and more. A sound a user sends the server (POST /transcribe, /tokenize, /vae) is decoded only when
// its bytes are WAV (RIFF/WAVE, PCM or float, every chunk inside the size it declares, nothing after it) or MP3 (an ID3v2 tag or none, then
// MPEG Layer III frames: three in a row at its start and every one after them to its end, an ID3v1, APE or Lyrics3 tag closing it), with no
// program, archive or script hiding inside; the engine reads no other format (the page makes a WAV of FLAC and OGG first). Up to 200 MB;
// decoded, it holds 1 to 8 channels at 8 to 384 kHz for 0.1 s to 6 hours. The words are the lab's, keys of the page's catalogs.
#include <cstddef>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <string>
#include <string_view>

namespace upload_guard {

static const size_t LIMIT_MB = 200;
static const char * R_HEADER = "its header is broken";
static const char * R_SHORT  = "it ends before its sound does (cut off in transfer?)";
static const char * R_TAIL   = "bytes that are not sound follow its end";
static const char * R_CODEC  = "its sound is neither PCM nor float";
static const char * R_BOUNDS = "its rate, channels or bits are out of bounds";
static const char * R_FRAMES = "no three Layer III frames line up at its start";
static const char * R_HIDDEN = "a program, an archive or a script hides inside it";

static std::string bad(const char * kind, const char * why) {
    return std::string("Refused: it begins as ") + kind + ", but " + why;
}

static uint32_t le16(const uint8_t * b) {
    return (uint32_t) b[0] | (uint32_t) b[1] << 8;
}

static uint32_t le32(const uint8_t * b) {
    return le16(b) | le16(b + 2) << 16;
}

// the MPEG Layer III frame at b[p]: its length (0: none there), version, rate, channels and whether a CRC follows its header
static size_t mp3_frame(const uint8_t * b, size_t n, size_t p, int * ver, int * rate, int * ch, bool * crc) {
    static const int BR1[16]   = { 0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0 };
    static const int BR2[16]   = { 0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0 };
    static const int SR[4][3]  = { { 11025, 12000, 8000 }, { 0, 0, 0 }, { 22050, 24000, 16000 }, { 44100, 48000, 32000 } };
    if (p + 4 > n) {
        return 0;
    }
    uint32_t h = (uint32_t) b[p] << 24 | (uint32_t) b[p + 1] << 16 | (uint32_t) b[p + 2] << 8 | b[p + 3];
    int v = (h >> 19) & 3, layer = (h >> 17) & 3, br = (h >> 12) & 15, sr = (h >> 10) & 3, pad = (h >> 9) & 1;
    if ((h >> 21) != 0x7FF || v == 1 || layer != 1 || br == 0 || br == 15 || sr == 3 || (h & 3) == 2) {
        return 0;
    }
    *ver  = v;
    *rate = SR[v][sr];
    *ch   = ((h >> 6) & 3) == 3 ? 1 : 2;
    *crc  = !((h >> 16) & 1);
    return (size_t) ((v == 3 ? 144 : 72) * (v == 3 ? BR1 : BR2)[br] * 1000 / *rate + pad);
}

static std::string wav(const uint8_t * b, size_t n) {
    static const uint8_t GUID_TAIL[14] = { 0, 0, 0, 0, 0x10, 0, 0x80, 0, 0, 0xaa, 0, 0x38, 0x9b, 0x71 };
    size_t end = (size_t) le32(b + 4) + 8;
    if (end > n + 1) {   // one byte short is a last pad byte a writer left out
        return bad("WAV", R_SHORT);
    }
    if (end + 1 < n) {
        return bad("WAV", R_TAIL);
    }
    end = end < n ? end : n;
    size_t   pos = 12;
    bool     fmt = false, data = false;
    uint32_t tag = 0, ch = 0, rate = 0, align = 0, bits = 0;
    while (pos + 8 <= end) {
        for (int i = 0; i < 4; i++) {
            if (b[pos + i] < 32 || b[pos + i] > 126) {
                return bad("WAV", R_HEADER);
            }
        }
        size_t size = le32(b + pos + 4);
        if (pos + 8 + size > end) {
            return bad("WAV", R_SHORT);
        }
        if (!memcmp(b + pos, "fmt ", 4)) {
            if (fmt || size < 16) {
                return bad("WAV", R_HEADER);
            }
            tag   = le16(b + pos + 8);
            ch    = le16(b + pos + 10);
            rate  = le32(b + pos + 12);
            align = le16(b + pos + 20);
            bits  = le16(b + pos + 22);
            if (tag == 0xFFFE) {   // WAVE_FORMAT_EXTENSIBLE: the format is its sub-format's
                if (size < 40 || memcmp(b + pos + 34, GUID_TAIL, 14)) {
                    return bad("WAV", R_CODEC);
                }
                tag = le16(b + pos + 32);
            }
            fmt = true;
        } else if (!memcmp(b + pos, "data", 4)) {
            if (data) {
                return bad("WAV", R_HEADER);
            }
            data = true;
        }
        pos += 8 + size + (size & 1);
    }
    if (pos + 1 < end || !fmt || !data) {
        return bad("WAV", R_HEADER);
    }
    if (tag != 1 && tag != 3) {
        return bad("WAV", R_CODEC);
    }
    bool bits_ok = tag == 1 ? (bits == 8 || bits == 16 || bits == 24 || bits == 32) : (bits == 32 || bits == 64);
    if (ch < 1 || ch > 8 || rate < 8000 || rate > 384000 || !bits_ok) {
        return bad("WAV", R_BOUNDS);
    }
    if (align != ch * bits / 8) {
        return bad("WAV", R_HEADER);
    }
    return "";
}

static std::string mp3(const uint8_t * b, size_t n, size_t p) {
    int    v0 = 0, r0 = 0, c0 = 0, v, r, c;
    bool   crc0 = false, crc;
    size_t q    = p;
    for (int i = 0; i < 3; i++) {
        size_t len = mp3_frame(b, n, q, &v, &r, &c, &crc);
        if (!len || (i && (v != v0 || r != r0))) {
            return bad("MP3", R_FRAMES);
        }
        if (!i) {
            v0 = v, r0 = r, c0 = c, crc0 = crc;
        }
        q += len;
    }
    (void) c0;
    (void) crc0;
    size_t end = n;
    for (int i = 0; i < 4; i++) {   // the tags that may close it: ID3v1, APEv2, Lyrics3 v2
        if (end >= p + 128 && !memcmp(b + end - 128, "TAG", 3)) {
            end -= 128;
        } else if (end >= p + 32 && !memcmp(b + end - 32, "APETAGEX", 8)) {
            size_t size = le32(b + end - 20), whole = size + ((le32(b + end - 12) & 0x80000000u) ? 32 : 0);
            if (size < 32 || whole > end - p) {
                return bad("MP3", R_HEADER);
            }
            end -= whole;
        } else if (end >= p + 15 && !memcmp(b + end - 9, "LYRICS200", 9)) {
            size_t size = 0;
            for (size_t k = end - 15; k < end - 9; k++) {
                if (b[k] < '0' || b[k] > '9') {
                    return bad("MP3", R_TAIL);
                }
                size = size * 10 + (b[k] - '0');
            }
            if (size + 15 > end - p) {
                return bad("MP3", R_HEADER);
            }
            end -= size + 15;
        } else {
            break;
        }
    }
    for (q = p; q < end;) {
        size_t len = mp3_frame(b, n, q, &v, &r, &c, &crc);
        if (!len || v != v0 || r != r0) {
            return bad("MP3", R_TAIL);
        }
        if (q + len > end) {
            return bad("MP3", R_SHORT);
        }
        q += len;
    }
    return "";
}

// a program, an archive or a script inside the sound (a polyglot): signatures long enough that sound never makes them by chance, and a
// ZIP's end record closing the file
static bool hidden(const uint8_t * b, size_t n) {
    static const std::string_view SIGNS[] = {
        std::string_view("PK\x03\x04\x14\x00", 6), std::string_view("PK\x03\x04\x0a\x00", 6), std::string_view("PK\x03\x04\x2d\x00", 6),
        std::string_view("\x7f" "ELF\x01\x01\x01", 7), std::string_view("\x7f" "ELF\x02\x01\x01", 7),
        "This program cannot be run in DOS mode", "#!/bin/", "#!/usr/bin/", "<?php", "<script", "<SCRIPT", "%PDF-1.",
        std::string_view("Rar!\x1a\x07", 6), std::string_view("7z\xbc\xaf\x27\x1c", 6),
    };
    std::string_view all((const char *) b, n);
    for (const auto & s : SIGNS) {
        if (all.find(s) != std::string_view::npos) {
            return true;
        }
    }
    size_t from = n > 65557 ? n - 65557 : 0, k = all.rfind(std::string_view("PK\x05\x06", 4));
    return k != std::string_view::npos && k >= from && k + 22 <= n && k + 22 + le16(b + k + 20) == n;
}

// the words of the refusal, or "" for a sound the engine's decoders may read
static std::string refusal(const uint8_t * b, size_t n) {
    if (n == 0) {
        return "Refused: the file came empty";
    }
    if (n > (LIMIT_MB << 20)) {
        char mb[64];
        snprintf(mb, sizeof mb, "%.1f", n / 1048576.0);
        return std::string("Refused: the file is ") + mb + " MB, past the limit of " + std::to_string(LIMIT_MB) + " MB";
    }
    std::string why, kind = "MP3";
    if (n >= 12 && !memcmp(b, "RIFF", 4) && !memcmp(b + 8, "WAVE", 4)) {
        why  = wav(b, n);
        kind = "WAV";
    } else {
        size_t p = 0;
        while (p + 10 <= n && !memcmp(b + p, "ID3", 3)) {
            if (b[p + 3] < 2 || b[p + 3] > 4 || ((b[p + 6] | b[p + 7] | b[p + 8] | b[p + 9]) & 0x80)) {
                return bad("MP3", R_HEADER);
            }
            size_t size = (size_t) b[p + 6] << 21 | (size_t) b[p + 7] << 14 | (size_t) b[p + 8] << 7 | b[p + 9];
            p += 10 + size + (b[p + 3] == 4 && (b[p + 5] & 0x10) ? 10 : 0);
            if (p > n) {
                return bad("MP3", R_SHORT);
            }
        }
        for (size_t q = p; p && q < n && q - p < ((size_t) 1 << 20); q++) {   // the zeros some taggers leave after the tag
            if (b[q]) {
                p = q;
                break;
            }
        }
        int  v, r, c;
        bool crc;
        if (!p && !mp3_frame(b, n, 0, &v, &r, &c, &crc)) {
            return "Refused: the engine reads WAV and MP3 only (the page makes a WAV of the others), and this file is neither";
        }
        why = mp3(b, n, p);
    }
    if (why.empty() && hidden(b, n)) {
        why = bad(kind.c_str(), R_HIDDEN);
    }
    return why;
}

// the decoded sound against the bounds: "" when it holds 0.1 s to 6 hours at 8 to 384 kHz
static std::string bounds(const std::string & file, int T, int sr) {
    if (sr < 8000 || sr > 384000 || T < sr / 10 || (double) T / sr > 6 * 3600) {
        return std::string("Refused: ") + (file.compare(0, 4, "RIFF") ? "MP3" : "WAV") +
               " is outside the bounds (1 to 8 channels, 8 to 384 kHz, 0.1 s to 6 hours)";
    }
    return "";
}

}  // namespace upload_guard
