// test-notation.cpp: the score's first bar against the recording's start (local addition, HERESY 2228)
//
// Pure CPU, no model: decoded events made by hand go through notation_abc and
// the first bar of the vocal line is read back. The tracker's first beat may
// come a bar or more into the take; the score must still begin where the take
// begins, with the notes sung before that beat in its first bar.
//
// usage: test-notation        (exit 0 when every case holds)

#include "notation.h"

#include <cstdio>
#include <string>
#include <vector>

static int g_failed = 0;

static void check(bool ok, const char * name, const std::string & detail) {
    printf("[%s] %s%s%s\n", ok ? "PASS" : "FAIL", name, ok ? "" : ": ", ok ? "" : detail.c_str());
    g_failed += ok ? 0 : 1;
}

// One beat event: the meter on the first, the beat's eighth position in the bar
static NotEvent beat_event(double time, int position, int num, bool first) {
    NotEvent e;
    e.subbeat        = 0;
    e.global_subbeat = 0;
    e.time           = time;
    e.has_meter      = first;
    e.meter_num      = first ? num : 0;
    e.meter_den      = first ? 4 : 0;
    e.eighth         = position * 2;
    if (first) {
        e.key = "Em";
    }
    return e;
}

static NotEvent note_event(double time, double end, int pitch) {
    NotEvent e;
    e.subbeat        = 0;
    e.global_subbeat = 0;
    e.time           = time;
    e.melody.push_back({ pitch, 0, 4, end });
    return e;
}

// The first bar of the first "V: Vocal" line, without chord symbols
static std::string first_vocal_bar(const std::string & abc) {
    size_t v = abc.find("V: Vocal\n");
    if (v == std::string::npos) {
        return "";
    }
    size_t      start = v + 9;
    size_t      bar   = abc.find('|', start);
    std::string out;
    bool        quoted = false;
    for (size_t i = start; i < bar && i < abc.size(); i++) {
        if (abc[i] == '"') {
            quoted = !quoted;
        } else if (!quoted) {
            out += abc[i];
        }
    }
    return out;
}

// Events of a take in 4/4 at 100 BPM (a bar 2.4 s): E G A B sung in bar 1, D in bar 2, beats decoded from first_beat on
static std::vector<NotEvent> song(double first_beat, int first_id) {
    const double          period = 0.6;
    std::vector<NotEvent> ev;
    const int             pitches[4] = { 64, 67, 69, 71 };
    for (int i = 0; i < 4; i++) {
        ev.push_back(note_event(i * period, (i + 1) * period, pitches[i]));
    }
    ev.push_back(note_event(2.4, 4.8, 62));
    bool first = true;
    int  id    = first_id;
    for (double t = first_beat; t < 9.6 - 1e-6; t += period) {
        ev.push_back(beat_event(t, id - 1, 4, first));
        first = false;
        id    = id % 4 + 1;
    }
    std::stable_sort(ev.begin(), ev.end(), [](const NotEvent & a, const NotEvent & b) { return a.time < b.time; });
    return ev;
}

int main() {
    NotTables tables;
    tables.key_abc["Em"] = "Em";
    tables.chord_abc[""] = "";

    struct Case {
        const char * name;
        double       first_beat;
        int          first_id;
    } cases[] = {
        { "first beat on the take's start", 0.0, 1 },
        { "first beat a bar in (the tracker late by 2.4 s)", 2.4, 1 },
        { "first beat a bar and a half in, on beat 3", 3.6, 3 },
        { "first beat a twelfth of a beat in (left as it was)", 0.05, 1 },
    };
    std::string reference;
    for (const Case & c : cases) {
        std::string abc, error;
        bool        ok  = notation_abc(song(c.first_beat, c.first_id), 9.6, tables, true, &abc, &error);
        std::string bar = first_vocal_bar(abc);
        check(ok, c.name, "no score: " + error);
        if (!ok) {
            continue;
        }
        size_t e = bar.find('E'), g = bar.find('G'), a = bar.find('A'), b = bar.find('B');
        bool   sung = e != std::string::npos && g != std::string::npos && a != std::string::npos &&
                    b != std::string::npos && e < g && g < a && a < b && bar.find('z') == std::string::npos;
        check(sung, c.name, "bar 1 of the vocal line is \"" + bar + "\", not E G A B");
        if (reference.empty()) {
            reference = abc;
        } else {
            check(abc == reference, c.name, "the score differs from the one decoded from the take's start:\n" + abc);
        }
    }
    printf("%s\n", g_failed ? "FAILED" : "OK");
    return g_failed ? 1 : 0;
}
