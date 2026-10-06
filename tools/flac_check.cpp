// Test driver for repo/src/flac-enc.h (built and run by tools/test_flac.py).
//   flac-check in.wav out.flac [title] [lyrics]   -> one JSON line: bits, bytes, ms
//   flac-check --md5 file                          -> MD5 of the file, hex
#include "flac-enc.h"

#include <chrono>
#include <cstdio>
#include <fstream>
#include <sstream>

static std::string slurp(const char * path) {
    std::ifstream     f(path, std::ios::binary);
    std::stringstream s;
    s << f.rdbuf();
    return s.str();
}

int main(int argc, char ** argv) {
    if (argc == 3 && std::string(argv[1]) == "--md5") {
        std::string   data = slurp(argv[2]);
        flac_enc::Md5 md5;
        md5.update((const uint8_t *) data.data(), data.size());
        uint8_t d[16];
        md5.finish(d);
        for (int i = 0; i < 16; i++) {
            printf("%02x", d[i]);
        }
        printf("\n");
        return 0;
    }
    if (argc < 3) {
        fprintf(stderr, "usage: flac-check in.wav out.flac [title] [lyrics]\n");
        return 2;
    }
    std::string wav = slurp(argv[1]);
    std::string err;
    int         bits = 0;
    auto        t0   = std::chrono::steady_clock::now();
    std::string flac = flac_encode_wav(wav, argc > 3 ? argv[3] : "", argc > 4 ? argv[4] : "", err, &bits);
    double      ms   = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t0).count();
    if (flac.empty()) {
        fprintf(stderr, "%s\n", err.c_str());
        return 1;
    }
    std::ofstream(argv[2], std::ios::binary).write(flac.data(), (std::streamsize) flac.size());
    printf("{\"bits\": %d, \"bytes\": %zu, \"ms\": %.1f}\n", bits, flac.size(), ms);
    return 0;
}
