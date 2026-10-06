// bpe.h, the frozen text and ABC BPE of the checkpoint (CPU-only)
// Loads the vocabulary and the merges from the backbone GGUF.
// Encodes ordinary text: NFC normalization, the GPT-2 style pre-tokenizer
// pattern, byte-level encoding, then the merges. The special tokens never
// match inside the text, the protocol places them by id.

#pragma once
#include "gguf.h"
#include "unicode.h"

#include <cassert>
#include <climits>
#include <cstdio>
#include <cstring>
#include <string>
#include <unordered_map>
#include <vector>

// GPT-2 byte-level encoding table
// Maps byte [0..255] -> Unicode char for BPE vocab keys.
// Printable ASCII stays as-is, control/space bytes get remapped.
static void build_byte_encoder(std::string byte2str[256]) {
    // Standard GPT-2 byte encoder
    int bs[256], cs[256], n = 0, total = 0;
    // Printable ranges that map to themselves
    for (int b = '!'; b <= '~'; b++) {
        bs[total] = b;
        cs[total] = b;
        total++;
    }
    for (int b = 0xA1; b <= 0xAC; b++) {
        bs[total] = b;
        cs[total] = b;
        total++;
    }
    for (int b = 0xAE; b <= 0xFF; b++) {
        bs[total] = b;
        cs[total] = b;
        total++;
    }
    // Remaining bytes get mapped to 256+
    bool used[256] = {};
    for (int i = 0; i < total; i++) {
        used[bs[i]] = true;
    }
    for (int b = 0; b < 256; b++) {
        if (!used[b]) {
            bs[total] = b;
            cs[total] = 256 + n;
            n++;
            total++;
        }
    }
    assert(total == 256);
    // Convert codepoints to UTF-8 strings
    for (int i = 0; i < 256; i++) {
        int  cp = cs[i];
        char buf[4];
        int  len;
        if (cp < 0x80) {
            buf[0] = (char) cp;
            len    = 1;
        } else if (cp < 0x800) {
            buf[0] = (char) (0xC0 | (cp >> 6));
            buf[1] = (char) (0x80 | (cp & 0x3F));
            len    = 2;
        } else {
            buf[0] = (char) (0xE0 | (cp >> 12));
            buf[1] = (char) (0x80 | ((cp >> 6) & 0x3F));
            buf[2] = (char) (0x80 | (cp & 0x3F));
            len    = 3;
        }
        byte2str[bs[i]] = std::string(buf, len);
    }
}

// GPT-2 style pre-tokenizer of the frozen tokenizer, run on normalized text.
// The pattern is matched alternative by alternative at each position, the
// first one that matches winning:
//   (?i:'s|'t|'re|'ve|'m|'ll|'d)
//   [^\r\n\p{L}\p{N}]?\p{L}+
//   \p{N}
//    ?[^\s\p{L}\p{N}]+[\r\n]*
//   \s*[\r\n]+
//   \s+(?!\S)
//   \s+
static std::vector<std::string> gpt2_pre_tokenize(const std::string & text) {
    static const char * CONTRACTIONS[] = { "s", "t", "re", "ve", "m", "ll", "d" };

    std::vector<std::string> chunks;
    const char *             s   = text.c_str();
    const int                len = (int) text.size();

    auto at = [&](int pos, int * adv) -> uint32_t {
        return (uint32_t) utf8_codepoint(s + pos, adv);
    };

    int i = 0;
    while (i < len) {
        int      adv = 0;
        uint32_t cp  = at(i, &adv);

        // Contraction suffixes, case insensitive
        if (cp == '\'') {
            bool matched = false;
            for (size_t k = 0; k < sizeof(CONTRACTIONS) / sizeof(CONTRACTIONS[0]) && !matched; k++) {
                int n = (int) strlen(CONTRACTIONS[k]);
                if (i + 1 + n > len) {
                    continue;
                }
                bool eq = true;
                for (int j = 0; j < n && eq; j++) {
                    char c = s[i + 1 + j];
                    if (c >= 'A' && c <= 'Z') {
                        c = (char) (c + 32);
                    }
                    eq = (c == CONTRACTIONS[k][j]);
                }
                if (eq) {
                    chunks.push_back(std::string(s + i, 1 + n));
                    i += 1 + n;
                    matched = true;
                }
            }
            if (matched) {
                continue;
            }
        }

        // One optional leading character then a run of letters
        {
            int p = i;
            if (!uni_is_newline(cp) && !uni_is_letter(cp) && !uni_is_number(cp)) {
                p = i + adv;
            }
            int a1 = 0;
            if (p < len && uni_is_letter(at(p, &a1))) {
                int q = p;
                while (q < len) {
                    int a2 = 0;
                    if (!uni_is_letter(at(q, &a2))) {
                        break;
                    }
                    q += a2;
                }
                chunks.push_back(std::string(s + i, q - i));
                i = q;
                continue;
            }
        }

        // One number character
        if (uni_is_number(cp)) {
            chunks.push_back(std::string(s + i, adv));
            i += adv;
            continue;
        }

        // One optional space then a run of symbols, trailing line breaks kept
        {
            int p = (cp == ' ') ? i + adv : i;
            int q = p;
            while (q < len) {
                int      a2 = 0;
                uint32_t c2 = at(q, &a2);
                if (uni_is_space(c2) || uni_is_letter(c2) || uni_is_number(c2)) {
                    break;
                }
                q += a2;
            }
            if (q > p) {
                while (q < len) {
                    int a2 = 0;
                    if (!uni_is_newline(at(q, &a2))) {
                        break;
                    }
                    q += a2;
                }
                chunks.push_back(std::string(s + i, q - i));
                i = q;
                continue;
            }
        }

        // Whitespace: up to the last line break of the run, the run minus its
        // last character when text follows, the whole run otherwise
        if (uni_is_space(cp)) {
            int q       = i;
            int last_nl = -1;
            int last_cp = i;
            while (q < len) {
                int      a2 = 0;
                uint32_t c2 = at(q, &a2);
                if (!uni_is_space(c2)) {
                    break;
                }
                if (uni_is_newline(c2)) {
                    last_nl = q;
                }
                last_cp = q;
                q += a2;
            }
            if (last_nl >= 0) {
                int e = last_nl;
                while (e < len) {
                    int a2 = 0;
                    if (!uni_is_newline(at(e, &a2))) {
                        break;
                    }
                    e += a2;
                }
                chunks.push_back(std::string(s + i, e - i));
                i = e;
                continue;
            }
            int e = (q < len && last_cp > i) ? last_cp : q;
            chunks.push_back(std::string(s + i, e - i));
            i = e;
            continue;
        }

        // Unreachable by construction: every code point falls in one of the
        // classes above. Advancing keeps the walk total.
        chunks.push_back(std::string(s + i, adv));
        i += adv;
    }
    return chunks;
}

// BPE tokenizer struct
struct BPETokenizer {
    std::unordered_map<std::string, int> vocab;          // token_str -> id
    std::unordered_map<std::string, int> merges;         // "a b" -> rank
    std::string                          byte2str[256];  // byte -> GPT-2 UTF-8 string
    int                                  eos_id;         // <|endoftext|> = 151643
    int                                  n_vocab;
    std::vector<std::string>             id_to_str;      // id -> token_str (reverse vocab)
};

// Load tokenizer from GGUF KV (tokenizer.ggml.tokens + tokenizer.ggml.merges)
static bool load_bpe_from_gguf(BPETokenizer * tok, const char * gguf_path) {
    build_byte_encoder(tok->byte2str);

    struct gguf_init_params gp  = { true, NULL };
    struct gguf_context *   ctx = gguf_init_from_file(gguf_path, gp);
    if (!ctx) {
        fprintf(stderr, "[BPE] Failed to open %s\n", gguf_path);
        return false;
    }

    int64_t tok_key = gguf_find_key(ctx, "tokenizer.ggml.tokens");
    int64_t mrg_key = gguf_find_key(ctx, "tokenizer.ggml.merges");
    if (tok_key < 0 || mrg_key < 0) {
        fprintf(stderr, "[BPE] Tokenizer not found in %s\n", gguf_path);
        gguf_free(ctx);
        return false;
    }

    int n_tokens = (int) gguf_get_arr_n(ctx, tok_key);
    int n_merges = (int) gguf_get_arr_n(ctx, mrg_key);

    for (int i = 0; i < n_tokens; i++) {
        const char * s             = gguf_get_arr_str(ctx, tok_key, (size_t) i);
        tok->vocab[std::string(s)] = i;
    }

    for (int i = 0; i < n_merges; i++) {
        const char * s              = gguf_get_arr_str(ctx, mrg_key, (size_t) i);
        tok->merges[std::string(s)] = i;
    }

    gguf_free(ctx);

    tok->n_vocab = (int) tok->vocab.size();
    tok->eos_id  = 151643;

    tok->id_to_str.resize(tok->n_vocab);
    for (auto & kv : tok->vocab) {
        if (kv.second >= 0 && kv.second < tok->n_vocab) {
            tok->id_to_str[kv.second] = kv.first;
        }
    }

    fprintf(stderr, "[BPE] Loaded from GGUF: %d vocab, %d merges\n", tok->n_vocab, n_merges);
    return true;
}

// Byte-level encode: raw text bytes -> GPT-2 BPE string
static std::string byte_level_encode(const BPETokenizer * tok, const std::string & text) {
    std::string out;
    for (unsigned char c : text) {
        out += tok->byte2str[c];
    }
    return out;
}

// BPE merge algorithm
// Input: list of symbols (strings). Merges pairs by priority.
static std::vector<std::string> bpe_merge(const std::unordered_map<std::string, int> & merge_rank,
                                          const std::vector<std::string> &             symbols) {
    if (symbols.size() <= 1) {
        return symbols;
    }

    std::vector<std::string> work = symbols;

    while (work.size() > 1) {
        // Find the pair with lowest rank (highest priority)
        int best_rank = INT_MAX;
        int best_pos  = -1;
        for (int i = 0; i < (int) work.size() - 1; i++) {
            std::string key = work[i] + " " + work[i + 1];
            auto        it  = merge_rank.find(key);
            if (it != merge_rank.end() && it->second < best_rank) {
                best_rank = it->second;
                best_pos  = i;
            }
        }
        if (best_pos < 0) {
            break;  // no more merges
        }

        // Merge the pair
        std::string merged = work[best_pos] + work[best_pos + 1];
        work[best_pos]     = merged;
        work.erase(work.begin() + best_pos + 1);
    }
    return work;
}

// Encode a single pre-tokenized chunk -> token ids
static void encode_chunk(const BPETokenizer * tok, const std::string & chunk, std::vector<int> & ids) {
    // Byte-level encode
    std::string encoded = byte_level_encode(tok, chunk);

    // Split into individual UTF-8 characters (each is a BPE symbol)
    std::vector<std::string> symbols;
    const char *             s   = encoded.c_str();
    int                      len = (int) encoded.size();
    int                      i   = 0;
    while (i < len) {
        int adv;
        utf8_codepoint(s + i, &adv);
        symbols.push_back(std::string(s + i, adv));
        i += adv;
    }

    // Apply BPE merges
    std::vector<std::string> merged = bpe_merge(tok->merges, symbols);

    // Look up in vocab
    for (const auto & piece : merged) {
        auto it = tok->vocab.find(piece);
        if (it != tok->vocab.end()) {
            ids.push_back(it->second);
        } else {
            // Fallback: encode each byte individually (should not happen with byte-level BPE)
            fprintf(stderr, "[BPE] WARNING: unknown token '%s'\n", piece.c_str());
            for (unsigned char c : piece) {
                auto it2 = tok->vocab.find(std::string(1, c));
                if (it2 != tok->vocab.end()) {
                    ids.push_back(it2->second);
                }
            }
        }
    }
}

// Full decode: token ids -> text, reversing the GPT-2 byte level encoding
static std::string bpe_decode(const BPETokenizer * tok, const std::vector<int> & ids) {
    std::unordered_map<std::string, char> str2byte;
    for (int b = 0; b < 256; b++) {
        str2byte[tok->byte2str[b]] = (char) b;
    }

    std::string encoded;
    for (size_t i = 0; i < ids.size(); i++) {
        int id = ids[i];
        if (id >= 0 && id < (int) tok->id_to_str.size()) {
            encoded += tok->id_to_str[(size_t) id];
        }
    }

    std::string out;
    size_t      pos = 0;
    while (pos < encoded.size()) {
        unsigned char lead = (unsigned char) encoded[pos];
        size_t        len  = lead < 0x80 ? 1 : (lead < 0xE0 ? 2 : 3);
        auto          it   = str2byte.find(encoded.substr(pos, len));
        if (it != str2byte.end()) {
            out += it->second;
        }
        pos += len;
    }
    return out;
}

// Full encode: text -> token ids
static std::vector<int> bpe_encode(const BPETokenizer * tok, const std::string & text) {
    std::vector<int> ids;
    for (const std::string & chunk : gpt2_pre_tokenize(uni_nfc(text))) {
        encode_chunk(tok, chunk, ids);
    }
    return ids;
}
