// test-tokenizer.cpp: audio tokenizer parity harness
//
// Reads a 24 kHz mono float32 waveform, runs the audio tokenizer and dumps
// its normalized MERT features and its codes into a directory for
// comparison against the torch reference.

#include "audio-tokenizer.h"
#include "backend.h"

#include <cstdio>
#include <cstring>
#include <vector>

int main(int argc, char ** argv) {
    // A leading --device <name> picks the device, the positional arguments follow
    if (argc > 2 && !strcmp(argv[1], "--device")) {
        if (!backend_set_device(argv[2])) {
            return 1;
        }
        for (int i = 3; i <= argc; i++) {
            argv[i - 2] = argv[i];
        }
        argc -= 2;
    }
    if (argc != 4) {
        fprintf(stderr, "usage: %s [--device <name>] tokenizer.gguf audio24k.bin dump_dir\n", argv[0]);
        return 1;
    }
    AudioTokenizer m;
    if (!atok_load(&m, argv[1])) {
        return 1;
    }
    FILE * f = fopen(argv[2], "rb");
    if (!f) {
        fprintf(stderr, "[Test-Tokenizer] cannot read %s\n", argv[2]);
        return 1;
    }
    fseek(f, 0, SEEK_END);
    long bytes = ftell(f);
    fseek(f, 0, SEEK_SET);
    std::vector<float> audio((size_t) bytes / sizeof(float));
    size_t             got = fread(audio.data(), sizeof(float), audio.size(), f);
    fclose(f);
    if (got != audio.size()) {
        return 1;
    }
    DebugDumper dbg;
    debug_init(&dbg, argv[3]);
    std::vector<int> codes;
    bool             ok = atok_tokenize(&m, audio.data(), (int) audio.size(), &codes, &dbg);
    atok_free(&m);
    return ok ? 0 : 1;
}
