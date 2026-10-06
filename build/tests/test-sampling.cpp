// test-sampling.cpp: AR sampling distribution parity harness
//
// Applies the phase mask, the end token floor, the window penalty, the
// temperature and the top-k plus nucleus truncation to a dumped logit vector,
// and writes the dense probability vector the draw runs on, for comparison
// against the torch reference.

#include "sampling.h"

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <vector>

static long file_bytes(const char * path) {
    FILE * f = fopen(path, "rb");
    if (!f) {
        return -1;
    }
    fseek(f, 0, SEEK_END);
    long n = ftell(f);
    fclose(f);
    return n;
}

static bool read_all(const char * path, void * dst, size_t bytes) {
    FILE * f = fopen(path, "rb");
    if (!f || fread(dst, 1, bytes, f) != bytes) {
        fprintf(stderr, "[Test-Sampling] cannot read %s\n", path);
        return false;
    }
    fclose(f);
    return true;
}

int main(int argc, char ** argv) {
    if (argc != 6) {
        fprintf(stderr, "usage: %s logits.bin history.bin step abc|semantic probs_out.bin\n", argv[0]);
        return 1;
    }

    const char * logits_path  = argv[1];
    const char * history_path = argv[2];
    int          step         = atoi(argv[3]);
    const char * phase_name   = argv[4];
    const char * out_path     = argv[5];

    bool semantic = strcmp(phase_name, "semantic") == 0;
    if (!semantic && strcmp(phase_name, "abc") != 0) {
        fprintf(stderr, "[Test-Sampling] phase must be abc or semantic\n");
        return 1;
    }

    long logits_bytes = file_bytes(logits_path);
    if (logits_bytes <= 0) {
        fprintf(stderr, "[Test-Sampling] cannot read %s\n", logits_path);
        return 1;
    }
    int                vocab_size = (int) (logits_bytes / (long) sizeof(float));
    std::vector<float> logits((size_t) vocab_size);
    if (!read_all(logits_path, logits.data(), logits.size() * sizeof(float))) {
        return 1;
    }

    long             history_bytes = file_bytes(history_path);
    std::vector<int> history(history_bytes > 0 ? (size_t) (history_bytes / (long) sizeof(int32_t)) : 0);
    if (!history.empty() && !read_all(history_path, history.data(), history.size() * sizeof(int32_t))) {
        return 1;
    }

    const Yue2Sampling &       s     = semantic ? YUE2_SEMANTIC_SAMPLING : YUE2_ABC_SAMPLING;
    Yue2Phase                  phase = semantic ? YUE2_PHASE_SEMANTIC : YUE2_PHASE_ABC;
    std::vector<Yue2Candidate> candidates;
    // The harness reads whole vocabulary logits, the distribution its phase window
    int                        row0, rows;
    yue2_phase_rows(phase, &row0, &rows);
    yue2_distribution(logits.data() + row0, s, history, step, phase, candidates);

    std::vector<float> probs;
    yue2_probabilities(candidates, vocab_size, probs);

    FILE * out = fopen(out_path, "wb");
    if (!out || fwrite(probs.data(), sizeof(float), probs.size(), out) != probs.size()) {
        fprintf(stderr, "[Test-Sampling] cannot write %s\n", out_path);
        return 1;
    }
    fclose(out);

    fprintf(stderr, "[Test-Sampling] %s step %d, history %zu, %zu candidates\n", phase_name, step, history.size(),
            candidates.size());
    return 0;
}
