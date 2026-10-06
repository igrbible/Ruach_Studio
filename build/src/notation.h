#pragma once
// notation.h: the decoded events of SheetSage2 become an ABC score
//
// The mirror of the reference export: notes and beats fall out of the
// events, the beats extend to the end of the song at the last tempo, the
// measures are inferred from the downbeats, a four subbeat grid spans every
// beat, the notes, keys, chords and structure labels are quantized on that
// grid, and the score is serialized voice by voice in groups of four
// measures with the same conventions (key relative spelling, bar state
// accidentals, ties across measures, rests compressed to Z). melody_only
// writes both melody voices without chord symbols, the score the cover
// path of YuE2 takes as its abc.

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <map>
#include <numeric>
#include <string>
#include <tuple>
#include <vector>

#define NOT_SUBBEAT_DIV 4

struct NotNote {
    int    pitch;
    int    track;           // 0 vocal, 1 instrumental
    int    duration_steps;  // subbeat steps of the duration template
    double end_time;        // seconds, resolved on the time map of the window
};

// One decoded event with its resolved time; fields absent when the token
// stream did not carry them
struct NotEvent {
    int                  subbeat;          // step within its window
    int                  global_subbeat;   // step in the song, the windows stitched
    double               time;
    std::vector<int>     field_tokens[6];  // the tokens of each field, prefix re-encoding reads them
    bool                 has_timestamp = false;
    bool                 has_meter     = false;
    int                  meter_num = 0, meter_den = 0;
    int                  eighth = -1;
    std::string          structure, key, chord;  // labels, empty when absent
    std::vector<NotNote> melody;
};

struct NotBeat {
    double time;
    int    beat_id;  // 1 based position in the measure
    int    num, den;
};

struct NotMeasure {
    int  start_beat, end_beat;  // beat indices
    int  numerator, denominator;
    int  abc_numerator, abc_denominator;
    bool pad_before;
};

struct NotInterval {
    double      start, end;
    std::string label;
};

// The chord and key tables of the tokenizer: label -> ABC text
struct NotTables {
    std::map<std::string, std::string> chord_abc;  // "" for no chord
    std::map<std::string, std::string> key_abc;
};

struct NotScore {
    std::vector<NotBeat>                     beats;
    std::vector<NotMeasure>                  measures;
    std::vector<double>                      subbeat_times;
    std::vector<double>                      subbeat_quarters;
    std::vector<int>                         subbeat_den;
    std::vector<std::string>                 key_arr;    // ABC key name per subbeat
    std::vector<std::string>                 chord_arr;  // chord label per subbeat, "N" for none
    std::vector<std::pair<int, std::string>> structure_events;
    std::vector<int>                         voice[2];   // 0 rest, pitch * 2 + 2 sustain, + 1 onset
    const NotTables *                        tables;
};

static bool not_fail(std::string * error, const std::string & message) {
    *error = message;
    return false;
}

// pretty_midi round trip of the reference: note times land on the nearest
// tick of a 960 PPQ file at 120 BPM
static double not_midi_round(double t) {
    return round(t * 1920.0) / 1920.0;
}

static double not_median(std::vector<double> v) {
    std::sort(v.begin(), v.end());
    size_t n = v.size();
    return n % 2 ? v[n / 2] : 0.5 * (v[n / 2 - 1] + v[n / 2]);
}

// searchsorted left on the midpoints between consecutive subbeat times
static int not_quantize(double time, const std::vector<double> & subbeat_times) {
    int n  = (int) subbeat_times.size();
    int lo = 0, hi = n - 1;  // boundaries count n - 1
    while (lo < hi) {
        int    mid = (lo + hi) / 2;
        double b   = 0.5 * (subbeat_times[mid] + subbeat_times[mid + 1]);
        if (b < time) {
            lo = mid + 1;
        } else {
            hi = mid;
        }
    }
    return lo;
}

static int not_clampi(int v, int lo, int hi) {
    return v < lo ? lo : (v > hi ? hi : v);
}

// Intervals of a field: from each event that carries it to the next such
// event or the end of the song
static std::vector<NotInterval> not_intervals(const std::vector<NotEvent> & events, int field, double duration) {
    std::vector<NotInterval> rows;
    for (const NotEvent & e : events) {
        const std::string & label = field == 0 ? e.chord : (field == 1 ? e.key : e.structure);
        if (!label.empty()) {
            rows.push_back({ e.time, duration, label });
        }
    }
    for (size_t i = 0; i + 1 < rows.size(); i++) {
        rows[i].end = rows[i + 1].start;
    }
    std::vector<NotInterval> kept;
    for (const NotInterval & r : rows) {
        if (r.end > r.start) {
            kept.push_back(r);
        }
    }
    return kept;
}

static int not_mode_first(const std::vector<int> & values) {
    int best = values[0], best_count = 0;
    for (int v : values) {
        int count = 0;
        for (int w : values) {
            count += w == v;
        }
        if (count > best_count) {
            best       = v;
            best_count = count;
        }
    }
    return best;
}

// Measures from the downbeats: a pickup before the first, a partial after
// the last, every span between two downbeats a full measure; the numerator
// is the beat count of the span, a final partial span keeps its declared
// meter with a trailing rest, a short first span pads with a leading rest
static bool not_measures(const std::vector<NotBeat> & beats, std::vector<NotMeasure> * measures, std::string * error) {
    std::vector<int> downbeats;
    for (size_t i = 0; i < beats.size(); i++) {
        if (beats[i].beat_id == 1) {
            downbeats.push_back((int) i);
        }
    }
    if (downbeats.empty()) {
        return not_fail(error, "No downbeat (beat ID 1) exists in the beat lab");
    }

    struct Span {
        int  start, end;
        bool pickup, partial;
    };

    std::vector<Span> spans;
    if (downbeats[0] > 0) {
        spans.push_back({ 0, downbeats[0], true, false });
    }
    for (size_t i = 0; i + 1 < downbeats.size(); i++) {
        spans.push_back({ downbeats[i], downbeats[i + 1], false, false });
    }
    if (downbeats.back() < (int) beats.size() - 1) {
        spans.push_back({ downbeats.back(), (int) beats.size() - 1, false, true });
    }
    if (spans.empty()) {
        return not_fail(error, "No positive-length measure exists between downbeats");
    }
    measures->clear();
    for (size_t mi = 0; mi < spans.size(); mi++) {
        const Span &     sp    = spans[mi];
        int              count = sp.end - sp.start;
        std::vector<int> dens, nums;
        for (int i = sp.start; i < sp.end; i++) {
            if (beats[i].beat_id != beats[sp.start].beat_id + (i - sp.start)) {
                return not_fail(error, "Measure " + std::to_string(mi) + ": non-consecutive beat IDs");
            }
            dens.push_back(beats[i].den);
            nums.push_back(beats[i].num);
        }
        if (!sp.pickup && beats[sp.start].beat_id != 1) {
            return not_fail(error, "Measure " + std::to_string(mi) + ": full measure does not start at beat ID 1");
        }
        int  den          = not_mode_first(dens);
        int  declared     = not_mode_first(nums);
        bool same_num     = std::all_of(nums.begin(), nums.end(), [&](int v) { return v == nums[0]; });
        bool den_conflict = std::any_of(dens.begin(), dens.end(), [&](int v) { return v != den; });
        bool pad_final    = sp.partial && same_num && !den_conflict && declared >= count;
        measures->push_back({ sp.start, sp.end, count, den, pad_final ? declared : count, den, false });
    }
    if (measures->size() >= 2) {
        NotMeasure &       first     = (*measures)[0];
        const NotMeasure & following = (*measures)[1];
        if ((double) first.numerator / first.denominator <
            (double) following.abc_numerator / following.abc_denominator) {
            first.abc_numerator   = following.abc_numerator;
            first.abc_denominator = following.abc_denominator;
            first.pad_before      = true;
        }
    }
    return true;
}

static int not_start_t(const NotMeasure & m) {
    return m.start_beat * NOT_SUBBEAT_DIV;
}

static int not_end_t(const NotMeasure & m) {
    return m.end_beat * NOT_SUBBEAT_DIV;
}

// The subbeat grid: four subbeats per beat interval, the quarter note
// position of each, the denominator ruling each interval
static bool not_grid(NotScore * s, std::string * error) {
    const std::vector<NotBeat> & beats = s->beats;
    std::vector<int>             interval_den(beats.size() - 1, 0);
    for (const NotMeasure & m : s->measures) {
        for (int i = m.start_beat; i < m.end_beat; i++) {
            interval_den[i] = m.denominator;
        }
    }
    for (int d : interval_den) {
        if (d == 0) {
            return not_fail(error, "Downbeat spans do not cover every beat interval");
        }
    }
    s->subbeat_times.clear();
    s->subbeat_den.clear();
    s->subbeat_quarters.assign(1, 0.0);
    double quarter = 0.0;
    for (size_t i = 0; i + 1 < beats.size(); i++) {
        double start = beats[i].time, end = beats[i + 1].time;
        for (int k = 0; k < NOT_SUBBEAT_DIV; k++) {
            s->subbeat_times.push_back(start + (end - start) * k / NOT_SUBBEAT_DIV);
            s->subbeat_den.push_back(interval_den[i]);
            quarter += 4.0 / interval_den[i] / NOT_SUBBEAT_DIV;
            s->subbeat_quarters.push_back(quarter);
        }
    }
    s->subbeat_times.push_back(beats.back().time);
    s->subbeat_den.push_back(interval_den.back());
    return true;
}

static bool not_fill(const std::vector<NotInterval> & rows,
                     const std::vector<double> &      times,
                     const std::string &              fallback,
                     std::vector<std::string> *       out,
                     std::string *                    error) {
    int n = (int) times.size();
    out->assign((size_t) n, fallback);
    for (const NotInterval & r : rows) {
        int start_t = not_clampi(not_quantize(r.start, times), 0, n - 1);
        int end_t   = not_clampi(not_quantize(r.end, times), 0, n - 1);
        if (end_t <= start_t) {
            return not_fail(error, "Interval (" + r.label + ") is shorter than the ABC subbeat grid");
        }
        for (int t = start_t; t < end_t; t++) {
            (*out)[(size_t) t] = r.label;
        }
    }
    if (n > 1) {
        (*out)[(size_t) n - 1] = (*out)[(size_t) n - 2];
    }
    return true;
}

// Notes of one voice on the grid: onset marked, sustain filled, no overlap
static bool not_voice(const std::vector<std::array<double, 2>> & spans,
                      const std::vector<int> &                   pitches,
                      const std::vector<double> &                times,
                      std::vector<int> *                         out,
                      const char *                               voice_id,
                      std::string *                              error) {
    int n = (int) times.size();
    out->assign((size_t) n, 0);
    for (size_t i = 0; i < spans.size(); i++) {
        int start_t = not_clampi(not_quantize(spans[i][0], times), 0, n - 1);
        int end_t   = not_clampi(not_quantize(spans[i][1], times), 0, n - 1);
        if (end_t <= start_t) {
            return not_fail(error,
                            std::string(voice_id) + ": MIDI note cannot be represented on the decoded subbeat grid");
        }
        for (int t = start_t; t < end_t; t++) {
            if ((*out)[(size_t) t] != 0) {
                return not_fail(error, std::string(voice_id) + ": overlapping quantized melody notes");
            }
        }
        int sustain = pitches[i] * 2 + 2;
        for (int t = start_t; t < end_t; t++) {
            (*out)[(size_t) t] = sustain;
        }
        (*out)[(size_t) start_t] = sustain + 1;
    }
    return true;
}

// ABC key signature accidentals per letter, C D E F G A B
static const char * NOT_LETTERS = "CDEFGAB";

static int not_key_count(const std::string & key) {
    static const struct {
        const char * name;
        int          count;
    } table[] = {
        { "C",   0  },
        { "G",   1  },
        { "D",   2  },
        { "A",   3  },
        { "E",   4  },
        { "B",   5  },
        { "F#",  6  },
        { "C#",  7  },
        { "F",   -1 },
        { "Bb",  -2 },
        { "Eb",  -3 },
        { "Ab",  -4 },
        { "Db",  -5 },
        { "Gb",  -6 },
        { "Cb",  -7 },
        { "Am",  0  },
        { "Em",  1  },
        { "Bm",  2  },
        { "F#m", 3  },
        { "C#m", 4  },
        { "G#m", 5  },
        { "D#m", 6  },
        { "A#m", 7  },
        { "Dm",  -1 },
        { "Gm",  -2 },
        { "Cm",  -3 },
        { "Fm",  -4 },
        { "Bbm", -5 },
        { "Ebm", -6 },
        { "Abm", -7 },
    };

    for (auto & e : table) {
        if (key == e.name) {
            return e.count;
        }
    }
    fprintf(stderr, "[Notation] FATAL: unsupported ABC key signature %s\n", key.c_str());
    exit(1);
}

static void not_key_accidentals(const std::string & key, int acc[7]) {
    int count = not_key_count(key);
    for (int i = 0; i < 7; i++) {
        acc[i] = 0;
    }
    const char * order = count > 0 ? "FCGDAEB" : "BEADGCF";
    for (int i = 0; i < abs(count); i++) {
        acc[strchr(NOT_LETTERS, order[i]) - NOT_LETTERS] = count > 0 ? 1 : -1;
    }
}

// Key relative spelling of the twelve pitch classes per accidental count
static const char * NOT_PITCH_NAMES[15][12] = {
    { "C",  "Db", "D",   "Eb", "Fb",  "F",  "Gb", "G",   "Ab", "Bbb", "Bb", "Cb" }, // -7
    { "C",  "Db", "D",   "Eb", "Fb",  "F",  "Gb", "G",   "Ab", "A",   "Bb", "Cb" }, // -6
    { "C",  "Db", "D",   "Eb", "E",   "F",  "Gb", "G",   "Ab", "A",   "Bb", "Cb" }, // -5
    { "C",  "Db", "D",   "Eb", "E",   "F",  "Gb", "G",   "Ab", "A",   "Bb", "B"  }, // -4
    { "C",  "Db", "D",   "Eb", "E",   "F",  "F#", "G",   "Ab", "A",   "Bb", "B"  }, // -3
    { "C",  "C#", "D",   "Eb", "E",   "F",  "F#", "G",   "Ab", "A",   "Bb", "B"  }, // -2
    { "C",  "C#", "D",   "Eb", "E",   "F",  "F#", "G",   "G#", "A",   "Bb", "B"  }, // -1
    { "C",  "C#", "D",   "D#", "E",   "F",  "F#", "G",   "G#", "A",   "Bb", "B"  }, // 0
    { "C",  "C#", "D",   "D#", "E",   "F",  "F#", "G",   "G#", "A",   "A#", "B"  }, // 1
    { "C",  "C#", "D",   "D#", "E",   "E#", "F#", "G",   "G#", "A",   "A#", "B"  }, // 2
    { "B#", "C#", "D",   "D#", "E",   "E#", "F#", "G",   "G#", "A",   "A#", "B"  }, // 3
    { "B#", "C#", "D",   "D#", "E",   "E#", "F#", "F##", "G#", "A",   "A#", "B"  }, // 4
    { "B#", "C#", "C##", "D#", "E",   "E#", "F#", "F##", "G#", "A",   "A#", "B"  }, // 5
    { "B#", "C#", "C##", "D#", "E",   "E#", "F#", "F##", "G#", "G##", "A#", "B"  }, // 6
    { "B#", "C#", "C##", "D#", "D##", "E#", "F#", "F##", "G#", "G##", "A#", "B"  }, // 7
};

// One note in ABC: the spelling of its key, an accidental written only when
// the bar state of the letter changes, the octave marks
static std::string not_note_abc(int note, const int key_acc[7], std::map<int, int> & measure_acc) {
    int count = 0;
    for (int i = 0; i < 7; i++) {
        count += key_acc[i];
    }
    const char * name       = NOT_PITCH_NAMES[count + 7][note % 12];
    char         letter     = name[0];
    std::string  accidental = name + 1;
    int          number =
        accidental == "" ? 0 : (accidental == "#" ? 1 : (accidental == "##" ? 2 : (accidental == "b" ? -1 : -2)));
    int octave = (int) floor((note - 60) / 12.0);
    if (note % 12 == 11 && number == -1) {
        octave += 1;
    } else if (note % 12 == 0 && number == 1) {
        octave -= 1;
    }
    int         scale_index = (int) (strchr(NOT_LETTERS, letter) - NOT_LETTERS);
    auto        it          = measure_acc.find(scale_index);
    int         current     = it == measure_acc.end() ? key_acc[scale_index] : it->second;
    std::string text;
    if (current != number) {
        measure_acc[scale_index]    = number;
        static const char * marks[] = { "__", "_", "=", "^", "^^" };
        text                        = marks[number + 2];
    }
    std::string out(1, letter);
    if (octave > 0) {
        out[0] = (char) tolower(letter);
        for (int i = 1; i < octave; i++) {
            out += "'";
        }
    } else {
        for (int i = 0; i < -octave; i++) {
            out += ",";
        }
    }
    return text + out;
}

static bool not_unit_denominator(const NotScore & s, int * unit, std::string * error) {
    int lcm = 1;
    for (const NotMeasure & m : s.measures) {
        lcm = std::lcm(lcm, m.denominator * NOT_SUBBEAT_DIV);
        lcm = std::lcm(lcm, m.abc_denominator * NOT_SUBBEAT_DIV);
    }
    if (lcm > 1024) {
        return not_fail(error, "Required ABC unit length is unreasonably small");
    }
    *unit = lcm;
    return true;
}

static int not_duration_units(const NotScore & s, int start_t, int end_t, int unit) {
    int units = 0;
    for (int t = start_t; t < end_t; t++) {
        units += unit / (s.subbeat_den[(size_t) t] * NOT_SUBBEAT_DIV);
    }
    return units;
}

// Durations split into the values strict parsers accept
static std::vector<int> not_split_duration(int duration) {
    static const int supported[] = { 1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48 };
    std::vector<int> result;
    int              remaining = duration;
    while (remaining) {
        bool exact = false;
        for (int v : supported) {
            exact = exact || v == remaining;
        }
        if (exact) {
            result.push_back(remaining);
            break;
        }
        int chunk = 0;
        for (int v : supported) {
            if (v < remaining) {
                chunk = v;
            }
        }
        result.push_back(chunk);
        remaining -= chunk;
    }
    return result;
}

static void not_render_duration(std::string &       out,
                                const std::string & prefix,
                                const std::string & note,
                                int                 duration,
                                bool                tie_out) {
    std::vector<int> chunks = not_split_duration(duration);
    for (size_t i = 0; i < chunks.size(); i++) {
        bool continues = note != "z" && (i + 1 < chunks.size() || tie_out);
        out +=
            (i == 0 ? prefix : "") + note + (chunks[i] == 1 ? "" : std::to_string(chunks[i])) + (continues ? "-" : "");
    }
}

static bool not_continues(int value, int next) {
    return value > 0 && next == (value / 2 - 1) * 2 + 2;
}

static bool not_same_segment(int value, int next) {
    return value == 0 ? next == 0 : next == (value / 2 - 1) * 2 + 2;
}

static bool not_render_measure(const NotScore &   s,
                               int                voice_id,
                               const NotMeasure & m,
                               int                unit,
                               std::string *      out,
                               std::string *      error) {
    const std::vector<int> & voice       = s.voice[voice_id];
    bool                     show_chords = voice_id == 0;
    std::map<int, int>       measure_acc;
    std::string              current_key = s.key_arr[(size_t) not_start_t(m)];
    int                      key_acc[7];
    not_key_accidentals(current_key, key_acc);
    int padding = m.abc_numerator * unit / m.abc_denominator - m.numerator * unit / m.denominator;
    if (padding < 0) {
        return not_fail(error, "Measure: notated meter is shorter than its decoded span");
    }
    int leading  = m.pad_before ? padding : 0;
    int trailing = m.pad_before ? 0 : padding;
    int t        = not_start_t(m);
    int end      = not_end_t(m);
    out->clear();
    while (t < end) {
        int next_t = end;
        for (int probe = t + 1; probe < end; probe++) {
            if (!not_same_segment(voice[(size_t) t], voice[(size_t) probe])) {
                next_t = std::min(next_t, probe);
                break;
            }
        }
        for (int probe = t + 1; probe < end; probe++) {
            if (s.key_arr[(size_t) probe] != s.key_arr[(size_t) probe - 1]) {
                next_t = std::min(next_t, probe);
                break;
            }
        }
        if (show_chords) {
            for (int probe = t + 1; probe < end; probe++) {
                if (s.chord_arr[(size_t) probe] != s.chord_arr[(size_t) probe - 1]) {
                    next_t = std::min(next_t, probe);
                    break;
                }
            }
        }
        std::string prefix;
        if (t > not_start_t(m) && s.key_arr[(size_t) t] != current_key) {
            current_key = s.key_arr[(size_t) t];
            not_key_accidentals(current_key, key_acc);
            measure_acc.clear();
            prefix += "[K:" + current_key + "]";
        }
        if (show_chords && (t == not_start_t(m) || s.chord_arr[(size_t) t] != s.chord_arr[(size_t) t - 1])) {
            auto chord = s.tables->chord_abc.find(s.chord_arr[(size_t) t]);
            if (chord != s.tables->chord_abc.end() && !chord->second.empty()) {
                prefix += "\"" + chord->second + "\"";
            }
        }
        int         value    = voice[(size_t) t];
        std::string note     = value == 0 ? "z" : not_note_abc(value / 2 - 1, key_acc, measure_acc);
        int         duration = not_duration_units(s, t, next_t, unit);
        if (t == not_start_t(m) && leading) {
            if (value == 0 && prefix.empty()) {
                duration += leading;
            } else {
                not_render_duration(*out, "", "z", leading, false);
            }
            leading = 0;
        }
        if (value == 0 && next_t == end && trailing) {
            duration += trailing;
            trailing = 0;
        }
        if (duration <= 0) {
            return not_fail(error, "Non-positive ABC duration");
        }
        bool tie_out = value > 0 && next_t < (int) voice.size() && not_continues(value, voice[(size_t) next_t]);
        not_render_duration(*out, prefix, note, duration, tie_out);
        t = next_t;
    }
    if (trailing) {
        not_render_duration(*out, "", "z", trailing, false);
    }
    return true;
}

// A rendered measure is a whole rest when it is rests alone, no chord, no
// key change, no tie
static bool not_full_rest(const std::string & r) {
    size_t i   = 0;
    bool   saw = false;
    while (i < r.size()) {
        if (r[i] != 'z') {
            return false;
        }
        i++;
        while (i < r.size() && isdigit((unsigned char) r[i])) {
            i++;
        }
        if (i < r.size() && r[i] == '-') {
            return false;
        }
        saw = true;
    }
    return saw;
}

static bool not_render_group(const NotScore &                s,
                             int                             voice_id,
                             const std::vector<NotMeasure> & measures,
                             int                             unit,
                             std::string *                   out,
                             std::string *                   error) {
    std::vector<std::string> rendered;
    for (const NotMeasure & m : measures) {
        std::string r;
        if (!not_render_measure(s, voice_id, m, unit, &r, error)) {
            return false;
        }
        rendered.push_back(r);
    }
    out->clear();
    size_t i = 0;
    while (i < rendered.size()) {
        if (!not_full_rest(rendered[i])) {
            *out += rendered[i] + "|";
            i++;
            continue;
        }
        size_t end = i + 1;
        while (end < rendered.size() && not_full_rest(rendered[end])) {
            end++;
        }
        size_t count = end - i;
        *out += "Z" + (count > 1 ? std::to_string(count) : "") + "|";
        i = end;
    }
    return true;
}

static bool not_score_to_abc(const NotScore & s, std::string * abc, std::string * error) {
    int unit;
    if (!not_unit_denominator(s, &unit, error)) {
        return false;
    }
    const NotMeasure & first    = s.measures[0];
    double             seconds  = s.subbeat_times.back() - s.subbeat_times.front();
    double             quarters = s.subbeat_quarters.back() - s.subbeat_quarters.front();
    if (seconds <= 0 || quarters <= 0) {
        return not_fail(error, "Cannot estimate tempo from a zero-duration score");
    }
    int  tempo = (int) nearbyint(quarters / seconds * 60.0);
    char head[256];
    snprintf(head, sizeof(head), "X:1\nT:\nM:%d/%d\nL:1/%d\nQ:1/4=%d\n", first.abc_numerator, first.abc_denominator,
             unit, tempo);
    *abc = head;
    *abc += "V: Vocal clef=treble name=\"Vocal Melody\" snm=\"Vocal\"\n";
    *abc += "V: Ins clef=treble name=\"Ins Melody\" snm=\"Inst.\"\n";
    *abc += "K:" + s.key_arr[(size_t) not_start_t(first)] + "\n";

    // Groups of at most four measures, cut at a meter or key change or a
    // structure label
    struct Group {
        std::vector<NotMeasure>  measures;
        std::vector<std::string> labels;
        bool                     meter_changed, key_changed;
    };

    std::vector<Group> groups;
    int                active_num = first.abc_numerator, active_den = first.abc_denominator;
    std::string        active_key = s.key_arr[(size_t) not_start_t(first)];
    std::string        active_structure;
    for (const NotMeasure & m : s.measures) {
        bool                     meter_changed = m.abc_numerator != active_num || m.abc_denominator != active_den;
        std::string              key           = s.key_arr[(size_t) not_start_t(m)];
        bool                     key_changed   = key != active_key;
        std::vector<std::string> labels;
        for (const auto & ev : s.structure_events) {
            if (ev.first >= not_start_t(m) && ev.first < not_end_t(m) && !ev.second.empty() &&
                ev.second != active_structure) {
                labels.push_back(ev.second);
                active_structure = ev.second;
            }
        }
        if (groups.empty() || groups.back().measures.size() >= 4 || meter_changed || key_changed || !labels.empty()) {
            groups.push_back({ { m }, labels, meter_changed, key_changed });
        } else {
            groups.back().measures.push_back(m);
        }
        active_num = m.abc_numerator;
        active_den = m.abc_denominator;
        active_key = s.key_arr[(size_t) not_end_t(m) - 1];
    }
    static const char * voices[2] = { "Vocal", "Ins" };
    for (const Group & g : groups) {
        for (const std::string & label : g.labels) {
            *abc += "% " + label + "\n";
        }
        for (int v = 0; v < 2; v++) {
            *abc += std::string("V: ") + voices[v] + "\n";
            if (g.meter_changed) {
                *abc += "M:" + std::to_string(g.measures[0].abc_numerator) + "/" +
                        std::to_string(g.measures[0].abc_denominator) + "\n";
            }
            if (g.key_changed) {
                *abc += "K:" + s.key_arr[(size_t) not_start_t(g.measures[0])] + "\n";
            }
            std::string line;
            if (!not_render_group(s, v, g.measures, unit, &line, error)) {
                return false;
            }
            *abc += line + "\n";
        }
    }
    return true;
}

// The whole export: events of a song -> ABC text, or the reason there is none
static bool notation_abc(const std::vector<NotEvent> & events,
                         double                        duration,
                         const NotTables &             tables,
                         bool                          melody_only,
                         std::string *                 abc,
                         std::string *                 error) {
    // Notes, clipped to the song
    struct Note {
        double start, end;
        int    pitch, track;
    };

    std::vector<Note> notes;
    for (const NotEvent & e : events) {
        for (const NotNote & n : e.melody) {
            double end = std::min(duration, n.end_time);
            if (end > e.time) {
                notes.push_back({ e.time, end, n.pitch, n.track });
            }
        }
    }
    std::sort(notes.begin(), notes.end(), [](const Note & a, const Note & b) {
        return std::tie(a.start, a.end, a.pitch, a.track) < std::tie(b.start, b.end, b.pitch, b.track);
    });

    // Beats from the rhythm events: the meter carries over, an eighth
    // position on the beat grid of the meter gives the beat index
    std::vector<NotBeat> beats;
    int                  meter_num = 0, meter_den = 0;
    for (const NotEvent & e : events) {
        if (e.has_meter) {
            meter_num = e.meter_num;
            meter_den = e.meter_den;
        }
        if (e.eighth >= 0 && meter_num > 0) {
            int steps = e.eighth * meter_den;
            if (steps % 8 != 0) {
                return not_fail(error, "Eighth position is off the beat grid");
            }
            int position = steps / 8;
            if (position < 0 || position >= meter_num) {
                return not_fail(error, "Eighth position is outside the meter");
            }
            beats.push_back({ e.time, position + 1, meter_num, meter_den });
        }
    }
    if (beats.size() < 2) {
        return not_fail(error, "At least two decoded beats are required for ABC");
    }
    for (size_t i = 1; i < beats.size(); i++) {
        if (beats[i].time <= beats[i - 1].time) {
            return not_fail(error, "beat times must be strictly increasing");
        }
    }

    // Continue the last tempo to the end of the song or the last note
    std::vector<double> diffs;
    for (size_t i = beats.size() > 9 ? beats.size() - 9 : 0; i + 1 < beats.size(); i++) {
        diffs.push_back(beats[i + 1].time - beats[i].time);
    }
    double period = not_median(diffs);
    if (period <= 0) {
        return not_fail(error, "Decoded beats must increase in time");
    }
    double end = duration;
    for (const Note & n : notes) {
        end = std::max(end, n.end);
    }
    while (beats.back().time < end - 1e-6) {
        const NotBeat & prev = beats.back();
        beats.push_back({ prev.time + period, prev.beat_id % prev.num + 1, prev.num, prev.den });
    }

    // Intervals clipped to the beat domain, the key in ABC spelling
    std::vector<NotInterval> fields[3];
    for (int f = 0; f < 3; f++) {
        for (NotInterval r : not_intervals(events, f, duration)) {
            if (r.end > beats.front().time && r.start < beats.back().time) {
                r.start = std::max(beats.front().time, r.start);
                r.end   = std::min(beats.back().time, r.end);
                fields[f].push_back(r);
            }
        }
    }
    if (not_intervals(events, 1, duration).empty()) {
        return not_fail(error, "No key was decoded; cannot construct a keyed ABC score");
    }
    if (fields[1].empty()) {
        return not_fail(error, "at least one key interval is required");
    }
    for (NotInterval & r : fields[1]) {
        auto it = tables.key_abc.find(r.label);
        if (it == tables.key_abc.end()) {
            return not_fail(error, "Unsupported key " + r.label);
        }
        r.label = it->second;
    }
    for (const NotInterval & r : fields[0]) {
        if (tables.chord_abc.find(r.label) == tables.chord_abc.end()) {
            return not_fail(error, "Unsupported chord " + r.label);
        }
    }

    // The monophonic notation view: per track, sorted by onset then pitch,
    // each note clipped to the next onset, then the pretty_midi tick grid
    std::vector<Note> clean;
    for (int track = 0; track < 2; track++) {
        std::vector<Note> ordered;
        for (const Note & n : notes) {
            if (n.track == track) {
                ordered.push_back(n);
            }
        }
        std::sort(ordered.begin(), ordered.end(), [](const Note & a, const Note & b) {
            return std::tie(a.start, a.pitch, a.end) < std::tie(b.start, b.pitch, b.end);
        });
        for (size_t i = 0; i < ordered.size(); i++) {
            Note n = ordered[i];
            if (i + 1 < ordered.size() && n.end > ordered[i + 1].start + 1e-6) {
                n.end = ordered[i + 1].start;
            }
            if (n.end > n.start + 1e-6) {
                clean.push_back(n);
            }
        }
    }
    std::sort(clean.begin(), clean.end(), [](const Note & a, const Note & b) {
        return std::tie(a.start, a.end, a.pitch, a.track) < std::tie(b.start, b.end, b.pitch, b.track);
    });

    NotScore s;
    s.tables = &tables;
    s.beats  = beats;
    if (!not_measures(s.beats, &s.measures, error) || !not_grid(&s, error)) {
        return false;
    }
    for (int track = 0; track < 2; track++) {
        std::vector<std::array<double, 2>> spans;
        std::vector<int>                   pitches;
        for (const Note & n : clean) {
            if (n.track == track) {
                double a = not_midi_round(n.start), b = not_midi_round(n.end);
                if (b > a) {
                    spans.push_back({ a, b });
                    pitches.push_back(n.pitch);
                }
            }
        }
        if (!not_voice(spans, pitches, s.subbeat_times, &s.voice[track], track == 0 ? "Vocal" : "Ins", error)) {
            return false;
        }
    }
    if (!not_fill(fields[1], s.subbeat_times, fields[1][0].label, &s.key_arr, error)) {
        return false;
    }
    if (melody_only) {
        s.chord_arr.assign(s.subbeat_times.size(), "N");
    } else if (!not_fill(fields[0], s.subbeat_times, "N", &s.chord_arr, error)) {
        return false;
    }
    for (const NotInterval & r : fields[2]) {
        int t = not_clampi(not_quantize(r.start, s.subbeat_times), 0, (int) s.subbeat_times.size() - 1);
        s.structure_events.push_back({ t, r.label });
    }
    return not_score_to_abc(s, abc, error);
}
