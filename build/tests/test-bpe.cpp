// test-bpe.cpp: tokenizer harness, encodes a text file and dumps the ids.

#include "bpe.h"

#include <cstdio>
#include <cstdlib>
#include <string>
#include <vector>

int main(int argc, char ** argv) {
    if (argc != 4) {
        fprintf(stderr, "Usage: %s <model.gguf> <text.txt> <out_ids.bin>\n", argv[0]);
        return 1;
    }

    const char * gguf_path = argv[1];
    const char * text_path = argv[2];
    const char * out_path  = argv[3];

    FILE * f = fopen(text_path, "rb");
    if (!f) {
        fprintf(stderr, "[Test-BPE] FATAL: cannot read %s\n", text_path);
        return 1;
    }
    fseek(f, 0, SEEK_END);
    long size = ftell(f);
    fseek(f, 0, SEEK_SET);
    std::string text(size > 0 ? (size_t) size : 0, '\0');
    size_t      got = text.empty() ? 0 : fread(&text[0], 1, text.size(), f);
    fclose(f);
    if (got != text.size()) {
        fprintf(stderr, "[Test-BPE] FATAL: short read on %s\n", text_path);
        return 1;
    }

    BPETokenizer tok;
    if (!load_bpe_from_gguf(&tok, gguf_path)) {
        return 1;
    }

    std::vector<int> ids = bpe_encode(&tok, text);

    std::vector<float> values(ids.size());
    for (size_t i = 0; i < ids.size(); i++) {
        values[i] = (float) ids[i];
    }

    FILE * out = fopen(out_path, "wb");
    if (!out) {
        fprintf(stderr, "[Test-BPE] FATAL: cannot write %s\n", out_path);
        return 1;
    }
    fwrite(values.data(), sizeof(float), values.size(), out);
    fclose(out);

    fprintf(stderr, "[Test-BPE] %zu bytes of text -> %zu ids\n", text.size(), ids.size());
    return 0;
}
