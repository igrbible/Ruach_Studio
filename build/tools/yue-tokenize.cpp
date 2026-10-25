// yue-tokenize.cpp: audio to semantic codes CLI
//
// Runs the audio tokenizer on a recording and writes its semantic codes, 25
// per second, as the comma separated list the semantic_tokens field of a
// request takes: the song then renders again through the NAR half and the
// VAE, or seeds a new performance.
#include "audio-io.h"
#include "audio-tokenizer.h"
#include "backend.h"
#include "version.h"

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>

static void print_usage(const char * prog) {
    fprintf(stderr, "yue2.cpp %s\n\n", YUE2_VERSION);
    fprintf(stderr,
            "Usage: %s --model <gguf> --audio <file> [options]\n"
            "\n"
            "Required:\n"
            "  --model <gguf>         Audio tokenizer GGUF, MERT beside it\n"
            "  --audio <file>         Recording to tokenize (WAV or MP3)\n"
            "\n"
            "Optional:\n"
            "  --device <name>        Compute device: CUDA0, Vulkan0, MTL0, CPU...\n"
            "                         (default: best available)\n"
            "  --out <path>           Output codes (default: codes.csv)\n"
            "\n"
            "Debug:\n"
            "  --no-fa                Disable flash attention\n"
            "  --dump <dir>           Dump intermediate tensors\n",
            prog);
}

int main(int argc, char ** argv) {
    if (argc < 2) {
        print_usage(argv[0]);
        return 1;
    }
    const char * model_path = nullptr;
    const char * device     = nullptr;
    const char * audio_path = nullptr;
    const char * out_path   = "codes.csv";
    const char * dump_dir   = nullptr;
    bool         no_fa      = false;
    for (int i = 1; i < argc; i++) {
        bool last = i + 1 >= argc;
        if (!strcmp(argv[i], "--model") && !last) {
            model_path = argv[++i];
        } else if (!strcmp(argv[i], "--audio") && !last) {
            audio_path = argv[++i];
        } else if (!strcmp(argv[i], "--device") && !last) {
            device = argv[++i];
        } else if (!strcmp(argv[i], "--out") && !last) {
            out_path = argv[++i];
        } else if (!strcmp(argv[i], "--no-fa")) {
            no_fa = true;
        } else if (!strcmp(argv[i], "--dump") && !last) {
            dump_dir = argv[++i];
        } else {
            print_usage(argv[0]);
            return 1;
        }
    }
    if (!model_path || !audio_path) {
        print_usage(argv[0]);
        return 1;
    }
    if (device && !backend_set_device(device)) {
        print_usage(argv[0]);
        return 1;
    }

    int                T = 0, sr = 0;
    float *            planar = audio_read(audio_path, &T, &sr);
    std::vector<float> audio;
    if (!planar || !mert_mono_24k(planar, T, sr, &audio)) {
        fprintf(stderr, "[Tokenize] FATAL: cannot read %s\n", audio_path);
        return 1;
    }
    AudioTokenizer m;
    if (!atok_load(&m, model_path)) {
        return 1;
    }
    m.use_flash_attn = m.use_flash_attn && !no_fa;
    DebugDumper dbg;
    debug_init(&dbg, dump_dir);

    std::vector<int> codes;
    bool             ok = atok_tokenize(&m, audio.data(), (int) audio.size(), &codes, &dbg);
    atok_free(&m);
    if (!ok) {
        return 1;
    }
    std::string csv;
    for (size_t i = 0; i < codes.size(); i++) {
        csv += (i ? "," : "") + std::to_string(codes[i]);
    }
    FILE * f = fopen(out_path, "wb");
    if (!f || fwrite(csv.data(), 1, csv.size(), f) != csv.size()) {
        fprintf(stderr, "[Tokenize] FATAL: cannot write %s\n", out_path);
        return 1;
    }
    fclose(f);
    fprintf(stderr, "[Tokenize] Done: %s -> %s\n", audio_path, out_path);
    return 0;
}
