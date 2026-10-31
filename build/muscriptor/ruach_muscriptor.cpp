// HERESY 1834 (Viktor 28.10.2026: «вживляй MuScriptor в Студию — в паспорт треков и в самого Огранщика»): a take, a stem or any sound
// becomes multi-instrument MIDI with MuScriptor (Mirelo and Kyutai; weights CC BY-NC 4.0) through muscriptor.cpp (DamRsn, MIT, on ggml).
// One process a transcription, as yue-transcribe: the lab gives it the sound as 16 kHz mono float32 (raw, little-endian) and reads its
// lines; it writes the notes as JSON and a type-1 MIDI file, a track an instrument, the drums on channel 10.
//
//   ruach-muscriptor --devices                  the devices this build can run on, one line each: "DEVICE <i> <backend> <MB> <name>"
//   ruach-muscriptor --model muscriptor-medium-f16.gguf --in take.f32 --json notes.json --mid take.mid [--threads N] [--device cpu|auto|N]
//                    [--only electric_bass,drums] [--no-prelude]
//
// Its lines on stdout: "DEVICE <backend> <name>", "LOAD <0..1>", "PROGRESS <0..1> <seconds finalised> <notes so far> <seconds taken>", "DONE <notes> <seconds>",
// or "ERROR <what>" and exit 1. The model predicts no velocity: every note is written at 100.
#include "muscriptor/muscriptor.hpp"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <fstream>
#include <map>
#include <optional>
#include <string>
#include <vector>

namespace
{
std::string arg(int argc, char** argv, const char* name, const char* fallback = "")
{
    for (int i = 1; i + 1 < argc; i++)
        if (std::strcmp(argv[i], name) == 0)
            return argv[i + 1];
    return fallback;
}

int fail(const std::string& what)
{
    std::printf("ERROR %s\n", what.c_str());
    std::fflush(stdout);
    return 1;
}

std::string jsonEscape(const std::string& s)
{
    std::string o;
    for (char c : s) {
        if (c == '"' || c == '\\') o += '\\';
        if (static_cast<unsigned char>(c) < 0x20) continue;
        o += c;
    }
    return o;
}

// A type-1 standard MIDI file at 120 BPM and 480 ticks a quarter: a second is 960 ticks, so the times stay the sound's own.
void putVar(std::vector<uint8_t>& b, uint32_t v)
{
    uint8_t tmp[5];
    int n = 0;
    tmp[n++] = v & 0x7f;
    while ((v >>= 7) != 0) tmp[n++] = 0x80 | (v & 0x7f);
    while (n) b.push_back(tmp[--n]);
}

void put32(std::vector<uint8_t>& b, uint32_t v) { for (int s = 24; s >= 0; s -= 8) b.push_back((v >> s) & 0xff); }

bool writeMidi(const std::string& path, const std::vector<msl::Note>& notes)
{
    constexpr int TPQ = 480;
    constexpr double TICKS_PER_SECOND = TPQ * 2.0;   // 120 BPM
    std::map<int, std::vector<const msl::Note*>> byProgram;   // DRUM_PROGRAM sorts last
    for (const auto& n : notes) byProgram[n.is_drum ? msl::DRUM_PROGRAM : n.program].push_back(&n);
    std::vector<std::vector<uint8_t>> tracks;
    {
        std::vector<uint8_t> t;   // the tempo track
        putVar(t, 0); t.insert(t.end(), { 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20 });   // 500000 us a quarter
        putVar(t, 0); t.insert(t.end(), { 0xff, 0x58, 0x04, 0x04, 0x02, 0x18, 0x08 });   // 4/4
        putVar(t, 0); t.insert(t.end(), { 0xff, 0x2f, 0x00 });
        tracks.push_back(t);
    }
    int nextChannel = 0;
    for (auto& [program, list] : byProgram) {
        bool drum = program == msl::DRUM_PROGRAM;
        int ch = drum ? 9 : nextChannel;
        if (!drum) nextChannel = (nextChannel + 1 == 9) ? 10 : (nextChannel + 1) % 16;   // channel 10 kept for the drums
        struct Ev { uint32_t tick; int on; int pitch; };
        std::vector<Ev> ev;
        for (const auto* n : list) {
            uint32_t a = static_cast<uint32_t>(std::llround(n->onset * TICKS_PER_SECOND));
            uint32_t z = std::max(a + 1, static_cast<uint32_t>(std::llround(n->offset * TICKS_PER_SECOND)));
            ev.push_back({ a, 1, n->pitch });
            ev.push_back({ z, 0, n->pitch });
        }
        std::stable_sort(ev.begin(), ev.end(), [](const Ev& x, const Ev& y) { return x.tick != y.tick ? x.tick < y.tick : x.on < y.on; });   // offs first
        std::vector<uint8_t> t;
        std::string name = msl::instrumentLabel(program);
        putVar(t, 0); t.insert(t.end(), { 0xff, 0x03 }); putVar(t, static_cast<uint32_t>(name.size())); t.insert(t.end(), name.begin(), name.end());
        if (!drum) { putVar(t, 0); t.push_back(0xc0 | ch); t.push_back(static_cast<uint8_t>(std::clamp(program, 0, 127))); }
        uint32_t at = 0;
        for (const auto& e : ev) {
            putVar(t, e.tick - at); at = e.tick;
            t.push_back((e.on ? 0x90 : 0x80) | ch); t.push_back(static_cast<uint8_t>(std::clamp(e.pitch, 0, 127))); t.push_back(e.on ? 100 : 0);
        }
        putVar(t, 0); t.insert(t.end(), { 0xff, 0x2f, 0x00 });
        tracks.push_back(t);
    }
    std::vector<uint8_t> f = { 'M', 'T', 'h', 'd' };
    put32(f, 6); f.insert(f.end(), { 0x00, 0x01 });
    f.push_back((tracks.size() >> 8) & 0xff); f.push_back(tracks.size() & 0xff);
    f.push_back((TPQ >> 8) & 0xff); f.push_back(TPQ & 0xff);
    for (const auto& t : tracks) { f.insert(f.end(), { 'M', 'T', 'r', 'k' }); put32(f, static_cast<uint32_t>(t.size())); f.insert(f.end(), t.begin(), t.end()); }
    std::ofstream out(path, std::ios::binary);
    out.write(reinterpret_cast<const char*>(f.data()), static_cast<std::streamsize>(f.size()));
    return static_cast<bool>(out);
}
}   // namespace

int main(int argc, char** argv)
{
    for (int i = 1; i < argc; i++) {
        if (std::strcmp(argv[i], "--devices") == 0) {
            auto devices = msl::availableDevices();
            for (size_t d = 0; d < devices.size(); d++)
                std::printf("DEVICE %zu %s %zu %s\n", d, devices[d].backend.c_str(), devices[d].memory_total >> 20, devices[d].name.c_str());
            return 0;
        }
    }
    std::string model = arg(argc, argv, "--model"), in = arg(argc, argv, "--in"), json = arg(argc, argv, "--json"), mid = arg(argc, argv, "--mid");
    std::string device = arg(argc, argv, "--device", "cpu"), only = arg(argc, argv, "--only");
    int threads = std::atoi(arg(argc, argv, "--threads", "0").c_str());
    if (model.empty() || in.empty() || json.empty()) return fail("usage: --model GGUF --in RAW_F32_16K_MONO --json OUT [--mid OUT] [--threads N] [--device cpu|auto|N] [--only a,b]");

    std::ifstream f(in, std::ios::binary | std::ios::ate);
    if (!f) return fail("cannot read " + in);
    std::vector<float> samples(static_cast<size_t>(f.tellg()) / sizeof(float));
    f.seekg(0);
    f.read(reinterpret_cast<char*>(samples.data()), static_cast<std::streamsize>(samples.size() * sizeof(float)));
    double seconds = static_cast<double>(samples.size()) / msl::Transcriber::SAMPLE_RATE;

    msl::LoadOptions lo;
    auto devices = msl::availableDevices();
    if (device == "cpu") {
        for (size_t i = 0; i < devices.size(); i++) if (devices[i].backend == "CPU") lo.device = i;
    } else if (device != "auto") {
        size_t i = static_cast<size_t>(std::atoi(device.c_str()));
        if (i >= devices.size()) return fail("no device " + device);
        lo.device = i;
    }
    lo.on_progress = [](float p) { std::printf("LOAD %.3f\n", p); std::fflush(stdout); };
    auto t0 = std::chrono::steady_clock::now();
    auto tr = msl::Transcriber::load(model, lo);
    if (!tr) return fail("the model did not load: " + std::string(msl::describe(tr.error())));
    std::printf("DEVICE %s %s\n", tr->device().backend.c_str(), tr->device().name.c_str());
    std::fflush(stdout);

    msl::TranscribeOptions to;
    to.n_threads = threads;
    for (int i = 1; i < argc; i++) if (std::strcmp(argv[i], "--no-prelude") == 0) to.prelude_forcing = false;
    if (!only.empty()) {
        size_t a = 0;
        while (a <= only.size()) {
            size_t z = only.find(',', a);
            std::string name = only.substr(a, z == std::string::npos ? std::string::npos : z - a);
            bool found = false;
            for (auto g : msl::allInstrumentGroups())
                if (msl::instrumentName(g) == name) { to.instruments.push_back(g); found = true; }
            if (!found && !name.empty()) return fail("no instrument group " + name);
            if (z == std::string::npos) break;
            a = z + 1;
        }
    }
    size_t told = 0;
    auto notes = tr->transcribe(samples, to, [&](const msl::TranscriptionUpdate& u) {
        told += u.new_notes.size();
        std::printf("PROGRESS %.3f %.1f %zu %.1f\n", u.progress, u.finalized_through, told, std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count());
        std::fflush(stdout);
        return true;
    });
    if (!notes) return fail("the transcription failed: " + std::string(msl::describe(notes.error())));
    double took = std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count();

    std::map<int, size_t> count;
    for (const auto& n : *notes) count[n.is_drum ? msl::DRUM_PROGRAM : n.program]++;
    std::FILE* j = std::fopen(json.c_str(), "w");
    if (!j) return fail("cannot write " + json);
    std::fprintf(j, "{\"engine\":\"MuScriptor (Mirelo, Kyutai; CC BY-NC 4.0) via muscriptor.cpp\",\"model\":\"%s\",\"device\":\"%s\",\"seconds\":%.3f,\"took\":%.1f,\"instruments\":[",
                 jsonEscape(model.substr(model.find_last_of('/') + 1)).c_str(), jsonEscape(tr->device().backend + " " + tr->device().name).c_str(), seconds, took);
    bool first = true;
    for (auto& [program, n] : count) {
        auto g = msl::instrumentGroupFor(program);
        std::fprintf(j, "%s{\"program\":%d,\"label\":\"%s\",\"named\":%s,\"notes\":%zu}", first ? "" : ",", program, jsonEscape(msl::instrumentLabel(program)).c_str(), g ? "true" : "false", n);
        first = false;
    }
    std::fprintf(j, "],\"notes\":[");
    first = true;
    for (const auto& n : *notes) {
        std::fprintf(j, "%s[%.3f,%.3f,%d,%d,%d]", first ? "" : ",", n.onset, n.offset, n.pitch, n.is_drum ? msl::DRUM_PROGRAM : n.program, n.is_drum ? 1 : 0);
        first = false;
    }
    std::fprintf(j, "]}\n");
    std::fclose(j);
    if (!mid.empty() && !writeMidi(mid, *notes)) return fail("cannot write " + mid);
    std::printf("DONE %zu %.1f\n", notes->size(), took);
    return 0;
}
