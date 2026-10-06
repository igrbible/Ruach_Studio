// test-sheetsage.cpp: SheetSage2 transcriber parity harness
//
// Reads a 24 kHz mono float32 waveform, pads it to the model window like the
// reference, runs the mel frontend and the encoder, and dumps the probes of
// every stage into a directory for comparison against the torch reference.

#include "sheetsage.h"

#include <cstdio>
#include <cstdlib>
#include <string>
#include <vector>

int main(int argc, char ** argv) {
    if (argc != 4) {
        fprintf(stderr, "usage: %s sheetsage.gguf audio24k.bin dump_dir\n", argv[0]);
        return 1;
    }
    SheetSage2 m;
    if (!ss2_load(&m, argv[1])) {
        return 1;
    }
    FILE * f = fopen(argv[2], "rb");
    if (!f) {
        fprintf(stderr, "[Test-SheetSage] cannot read %s\n", argv[2]);
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

    // The reference pads every window to the full length with silence
    int window = (int) lroundf(m.cfg.window_seconds * SS2_SAMPLE_RATE);
    if ((int) audio.size() > window) {
        fprintf(stderr, "[Test-SheetSage] audio exceeds one window\n");
        return 1;
    }
    audio.resize((size_t) window, 0.0f);

    std::vector<float> mel;
    int                T_mel = 0;
    Timer              mel_timer;
    ss2_mel(&m, audio.data(), (int) audio.size(), &mel, &T_mel);
    fprintf(stderr, "[Test-SheetSage] Mel: %d frames, %.0f ms\n", T_mel, mel_timer.ms());
    debug_dump_2d(&dbg, "mel", mel.data(), T_mel, m.cfg.n_mels);

    SS2Encoded enc;
    if (!ss2_encode(&m, mel, T_mel, &enc, &dbg)) {
        return 1;
    }

    // The full task prefix, then the greedy stream, written one id per line
    SS2Decoder dec;
    if (!ss2_decoder_alloc(&m, &dec, enc.T) || !ss2_decoder_prepare(&m, &dec, enc.memory)) {
        return 1;
    }
    std::vector<int> prefix = { m.tok.sos };
    for (const char * name : { "timestamp", "downbeat_meter", "structure", "key", "chord_full", "melody_full" }) {
        for (size_t i = 0; i < m.tok.prompts.size(); i++) {
            if (m.tok.prompts[i] == name) {
                prefix.push_back(m.tok.prompt0 + (int) i);
            }
        }
    }
    prefix.push_back(m.tok.out);
    std::vector<int> tokens;
    if (!ss2_generate(&m, &dec, prefix, (double) got / SS2_SAMPLE_RATE, &tokens, &dbg)) {
        return 1;
    }
    std::string path = std::string(argv[3]) + "/tokens.txt";
    f                = fopen(path.c_str(), "w");
    for (int id : tokens) {
        fprintf(f, "%d\n", id);
    }
    fclose(f);

    // The score, full and melody only, the way the reference writes them
    double                duration = (double) got / SS2_SAMPLE_RATE;
    std::vector<NotEvent> events;
    if (!ss2_decode_events(m.cfg, m.tok, tokens, 0.0, 0.0, duration, duration, 0, &events)) {
        return 1;
    }
    for (int melody_only = 0; melody_only < 2; melody_only++) {
        std::string abc, error;
        if (!notation_abc(events, duration, m.tok.tables, melody_only, &abc, &error)) {
            fprintf(stderr, "[Test-SheetSage] ABC unavailable: %s\n", error.c_str());
            return 1;
        }
        path = std::string(argv[3]) + (melody_only ? "/score-melody.abc" : "/score.abc");
        f    = fopen(path.c_str(), "w");
        fwrite(abc.data(), 1, abc.size(), f);
        fclose(f);
    }
    fprintf(stderr, "[Test-SheetSage] %zu events, scores written\n", events.size());
    ss2_decoder_free(&dec);
    ss2_free(&m);
    return 0;
}
