// score-guard.h: the engine's guard over a score the AR wrote (HERESY 1087), in a header of its own since HERESY 2433 so a test reads it
// without a model (tests/test-score-guard.cpp). Pure C++, no ggml.
#pragma once

#include <algorithm>
#include <cctype>
#include <cstring>
#include <map>
#include <regex>
#include <string>
#include <vector>

// HERESY 2433: what a take says when its score was sung without a key line (meta.json and the job's status: score_warning)
#define YUE2_SCORE_NO_KEY "no key line in the score"
// HERESY 2832: and when no bar of it holds a note (said beside the key line's when both, «; » between)
#define YUE2_SCORE_NO_NOTE "no bar of the score holds a note"

// HERESY 2830, 2832: a bar's text without what is not its notes: chord symbols ("Am"), inline fields ([K:Dm], [Q:1/4=70]) and
// decorations (!f!, +fermata+). An unclosed one ends the bar's notes where it opens.
static std::string yue2_bar_notes(const std::string & bar) {
    std::string out;
    out.reserve(bar.size());
    for (size_t i = 0; i < bar.size(); i++) {
        char c = bar[i];
        if (c == '"' || c == '!' || c == '+') {
            size_t e = bar.find(c, i + 1);
            if (e == std::string::npos) {
                break;
            }
            i = e;
            continue;
        }
        if (c == '[' && i + 2 < bar.size() && std::isalpha((unsigned char) bar[i + 1]) && bar[i + 2] == ':') {
            size_t e = bar.find(']', i + 1);
            if (e == std::string::npos) {
                break;
            }
            i = e;
            continue;
        }
        out += c;
    }
    return out;
}

// HERESY 2830, 2832: the bars of a score's body, voice by voice, as yue2_score_seconds and the guard read them. A line holding a bar
// line belongs to the voice of the last V: line (or to "" before any); a field line (M:, L:, Q:…) holds none; % lines are comments.
// each(voice, bar text, fields so far) is called per bar, its trailing bar lines stripped, an empty or barline-only piece left out.
struct Yue2ScoreFields {
    int    meter_n = 4, meter_d = 4;   // M: (C and C| as 4/4: the same quarters to a bar)
    double unit    = 1.0 / 8.0;        // L:, a fraction of a whole note (ABC's default 1/8)
    double bpq     = 0.0;              // Q: in quarter notes a minute, the last one written; 0: none written
};

template <typename Each> static void yue2_score_bars(const std::string & abc, Each each) {
    Yue2ScoreFields f;
    std::string     voice;
    size_t          pos = 0;
    while (pos <= abc.size()) {
        size_t e = abc.find('\n', pos);
        if (e == std::string::npos) {
            e = abc.size();
        }
        std::string s = abc.substr(pos, e - pos);
        pos           = e + 1;
        while (!s.empty() && std::isspace((unsigned char) s.back())) {
            s.pop_back();
        }
        size_t lead = 0;
        while (lead < s.size() && std::isspace((unsigned char) s[lead])) {
            lead++;
        }
        s.erase(0, lead);
        if (s.empty() || s[0] == '%') {
            continue;
        }
        if (s.size() >= 2 && s[0] == 'V' && s[1] == ':') {
            std::string v = s.substr(2);
            size_t      a = v.find_first_not_of(" \t");
            v             = a == std::string::npos ? "" : v.substr(a);
            v             = v.substr(0, v.find_first_of(" \t"));
            std::string low;
            for (char c : v) {
                low += (char) std::tolower((unsigned char) c);
            }
            voice = low.compare(0, 5, "vocal") == 0 ? "Vocal" : low.compare(0, 3, "ins") == 0 ? "Ins" : v;
            continue;
        }
        bool bars = s.find('|') != std::string::npos;
        if (!bars && s.size() >= 2 && std::isalpha((unsigned char) s[0]) && s[1] == ':') {
            std::string v = s.substr(2);
            size_t      a = v.find_first_not_of(" \t");
            v             = a == std::string::npos ? "" : v.substr(a);
            std::smatch m;
            if (s[0] == 'M') {
                if (std::regex_match(v, m, std::regex(R"(^(\d{1,2})/(\d{1,2})$)")) && std::stoi(m[2].str()) > 0) {
                    f.meter_n = std::stoi(m[1].str());
                    f.meter_d = std::stoi(m[2].str());
                } else if (!v.empty() && v[0] == 'C') {
                    f.meter_n = 4;
                    f.meter_d = 4;
                }
            } else if (s[0] == 'L') {
                if (std::regex_match(v, m, std::regex(R"(^1/(\d{1,3})$)")) && std::stoi(m[1].str()) > 0) {
                    f.unit = 1.0 / std::stoi(m[1].str());
                }
            } else if (s[0] == 'Q') {
                if (std::regex_match(v, m, std::regex(R"(^(?:(\d{1,2})/(\d{1,2})=)?(\d{1,3})$)"))) {
                    double beat = m[1].matched && std::stoi(m[2].str()) > 0 ? 4.0 * std::stoi(m[1].str()) / std::stoi(m[2].str()) : 1.0;
                    f.bpq       = std::stoi(m[3].str()) * beat;
                }
            }
            continue;
        }
        if (!bars) {
            continue;
        }
        while (!s.empty() && s.back() == '|') {
            s.pop_back();
        }
        size_t from = 0;
        while (from <= s.size()) {
            size_t      to  = s.find('|', from);
            std::string bar = s.substr(from, to == std::string::npos ? std::string::npos : to - from);
            from            = to == std::string::npos ? s.size() + 1 : to + 1;
            size_t a        = bar.find_first_not_of(" \t");
            if (a == std::string::npos) {
                continue;
            }
            bar = bar.substr(a, bar.find_last_not_of(" \t") - a + 1);
            bool content = false;   // a piece of only barline marks (]:[) is the bar line itself, not a bar
            for (char c : bar) {
                content = content || std::isalnum((unsigned char) c) || c == '"';
            }
            if (content) {
                each(voice, bar, f);
            }
        }
    }
}

// HERESY 2832: whether any bar of the score holds a note (a pitch, not a rest), in any voice
static bool yue2_score_has_note(const std::string & abc) {
    bool found = false;
    yue2_score_bars(abc, [&](const std::string &, const std::string & bar, const Yue2ScoreFields &) {
        if (!found) {
            std::string notes = yue2_bar_notes(bar);
            found             = notes.find_first_of("ABCDEFGabcdefg") != std::string::npos;
        }
    });
    return found;
}

// HERESY 1087: why a score the AR wrote is not a score, or "" when it is one. Calibrated on the studio's own
// takes (02.10.2026): every good score has M:, L: and K: with clean values (M:2/4, L:1/16, Q:1/4=71, K:Dm)
// and never two colons in a row; the broken ones have no K: line, garbage for Q:, colons in runs of 3 to 13.
// Three colons in a row are the cheapest sure sign (Viktor): a written score never has them.
static std::string yue2_score_broken(const std::string & abc, std::string * warning = nullptr) {
    std::string M, L, Q, K;
    bool        hasM = false, hasL = false, hasQ = false, hasK = false;
    size_t      pos = 0;
    for (int n = 0; pos < abc.size() && n < 40 && !hasK; n++) {
        size_t e = abc.find('\n', pos);
        if (e == std::string::npos) {
            e = abc.size();
        }
        std::string line = abc.substr(pos, e - pos);
        pos              = e + 1;
        while (!line.empty() && (line.back() == '\r' || line.back() == ' ' || line.back() == '\t')) {
            line.pop_back();
        }
        if (line.size() < 2 || line[1] != ':') {
            continue;
        }
        std::string v = line.substr(2);
        while (!v.empty() && v[0] == ' ') {
            v.erase(0, 1);
        }
        switch (line[0]) {
            case 'M': if (!hasM) { hasM = true; M = v; } break;
            case 'L': if (!hasL) { hasL = true; L = v; } break;
            case 'Q': if (!hasQ) { hasQ = true; Q = v; } break;
            case 'K': hasK = true; K = v; break;
            default: break;
        }
    }
    auto shown = [](const std::string & v) { return v.size() > 24 ? v.substr(0, 24) + "..." : v; };
    std::vector<std::string> why;
    if (!hasK) {
        why.push_back("no key line (K:)");
    } else if (!std::regex_match(K, std::regex(R"(^[A-G](#|b)?(m|min|maj|dor|phr|lyd|mix|aeo|loc|ion)?$)", std::regex::icase))) {
        why.push_back("the key line is not a key (K:" + shown(K) + ")");
    }
    if (!hasM) {
        why.push_back("no meter (M:)");
    } else if (!std::regex_match(M, std::regex(R"(^(\d{1,2}/\d{1,2}|C\|?)$)"))) {
        why.push_back("the meter is not a meter (M:" + shown(M) + ")");
    }
    if (!hasL) {
        why.push_back("no note length (L:)");
    } else if (!std::regex_match(L, std::regex(R"(^1/\d{1,3}$)"))) {
        why.push_back("the note length is not one (L:" + shown(L) + ")");
    }
    if (hasQ && !std::regex_match(Q, std::regex(R"(^(\d{1,2}/\d{1,2}=)?\d{2,3}$)"))) {
        why.push_back("the tempo is not a tempo (Q:" + shown(Q) + ")");
    }
    size_t run = 0, longest = 0;
    for (char c : abc) {
        run     = c == ':' ? run + 1 : 0;
        longest = run > longest ? run : longest;
    }
    if (longest >= 3) {
        why.push_back("colons in a run of " + std::to_string(longest));
    }
    // HERESY 2832 (the silent hole's scan of 18.11.2026): 50 plans sung with the guard on, every one by a 4.6B P1 checkpoint, held no bar
    // with a note in any voice (most of them floods of X:/M:/L: lines and newlines), and the take said only «no key line». Said now, by
    // 2433's rule for the P1 plans (Viktor: «K: не будем браковать сразу, а предупреждать»): sung as written, never refused for it
    const bool no_note = !yue2_score_has_note(abc);
    // HERESY 2433 (Viktor 12.11.2026, after a night's probe: «В сторожа партитур давай K: не будем браковать сразу, а
    // предупреждать»): a score whose one fault is a missing key line is sung as written, and the take says so; a missing key line beside
    // any other fault still stops the run, the whole list said
    if (warning) {
        warning->clear();
    }
    if (!hasK && why.size() == 1) {
        if (warning) {
            *warning = no_note ? YUE2_SCORE_NO_KEY "; " YUE2_SCORE_NO_NOTE : YUE2_SCORE_NO_KEY;
        }
        return "";
    }
    if (why.empty() && no_note && warning) {
        *warning = YUE2_SCORE_NO_NOTE;
    }
    std::string out;
    for (size_t i = 0; i < why.size(); i++) {
        out += (i ? "; " : "") + why[i];
    }
    return out;
}


// HERESY 2631 (after timoncool/yue2.cpp 11551dc and 84dae70, MIT, Nerual Dreming): score_fill, asked by the request (off by default). A score
// whose fault is its header gets the defaults the model learnt: a malformed M:/L: line becomes M:4/4 / L:1/16 in its own place (one meter, one
// length, never two), a missing one goes in at the top (after an X: line), a missing K: goes in as K:C before the first line with a bar line.
// A malformed K: is left as it is. The caller asks yue2_score_broken again, so a score wrong in other ways still fails.
static std::string yue2_score_fill_header(const std::string & abc) {
    std::vector<std::string> lines;
    size_t                   pos = 0;
    while (pos <= abc.size()) {
        size_t e = abc.find('\n', pos);
        if (e == std::string::npos) {
            lines.push_back(abc.substr(pos));
            break;
        }
        lines.push_back(abc.substr(pos, e - pos));
        pos = e + 1;
    }
    auto value = [](const std::string & line) {
        std::string v = line.substr(2);
        while (!v.empty() && (v[0] == ' ' || v[0] == '\t')) {
            v.erase(0, 1);
        }
        while (!v.empty() && (v.back() == '\r' || v.back() == ' ' || v.back() == '\t')) {
            v.pop_back();
        }
        return v;
    };
    int iM = -1, iL = -1, iK = -1, bar = -1;
    for (int n = 0; n < (int) lines.size(); n++) {
        const std::string & l = lines[n];
        if (iK < 0 && n < 40 && l.size() >= 2 && l[1] == ':') {
            if (l[0] == 'M' && iM < 0) iM = n;
            if (l[0] == 'L' && iL < 0) iL = n;
            if (l[0] == 'K') iK = n;
        }
        if (bar < 0 && l.find('|') != std::string::npos && !(l.size() >= 2 && l[1] == ':' && l[0] != '|')) {
            bar = n;
        }
    }
    bool okM = iM >= 0 && std::regex_match(value(lines[iM]), std::regex(R"(^(\d{1,2}/\d{1,2}|C\|?)$)"));
    bool okL = iL >= 0 && std::regex_match(value(lines[iL]), std::regex(R"(^1/\d{1,3}$)"));
    if (okM && okL && iK >= 0) {
        return abc;
    }
    if (iM >= 0 && !okM) lines[iM] = "M:4/4";
    if (iL >= 0 && !okL) lines[iL] = "L:1/16";
    std::vector<std::string> top;
    if (iM < 0) top.push_back("M:4/4");
    if (iL < 0) top.push_back("L:1/16");
    int at = !lines.empty() && lines[0].compare(0, 2, "X:") == 0 ? 1 : 0;
    if (iK < 0) {
        if (bar < 0) {
            return abc;                                  // no bar line: nothing to sing, the guard says so
        }
        lines.insert(lines.begin() + bar, "K:C");
    }
    lines.insert(lines.begin() + at, top.begin(), top.end());
    std::string out;
    for (size_t i = 0; i < lines.size(); i++) {
        out += (i ? "\n" : "") + lines[i];
    }
    return out;
}

// HERESY 2830: the length of a score at its own tempo: the bars of its longest voice, each the notes and rests it holds (a bar with none, or
// Z, a whole bar of the meter), in quarter notes, at the last Q: written. The lab's abc_tools.py (1145) and the page's heresy-abc.js count the
// Vocal line the same way but refuse a score they cannot read whole; this one reads every score the model writes (the silent hole's counter,
// equal to abc_tools on all 513 long plans it accepts). seconds -1: the score writes no tempo (free tempo, 1416), so its end is not known.
struct Yue2ScoreLength {
    double seconds = -1.0;   // -1: no tempo written, or no bar
    int    bars    = 0;      // the bars of the voice it was read from
    double bpm     = 0.0;    // quarter notes a minute (0: none written)
};

static Yue2ScoreLength yue2_score_seconds(const std::string & abc) {
    std::map<std::string, double> quarters;
    std::map<std::string, int>    bars;
    double                        bpq = 0.0;
    yue2_score_bars(abc, [&](const std::string & voice, const std::string & bar, const Yue2ScoreFields & f) {
        bpq          = f.bpq;
        double whole = 4.0 * f.meter_n / f.meter_d;   // a whole bar of the meter, in quarters
        if (bar[0] == 'Z' && bar.find_first_not_of("0123456789", 1) == std::string::npos) {
            // a garbage plan can write Z with ten or more digits: std::stoi would throw out_of_range and take the engine down;
            // more than four digits counts as 9999 bars (the plan reads longer, so the floor is lowered less, never more)
            int k = bar.size() > 5 ? 9999 : bar.size() > 1 ? std::stoi(bar.substr(1)) : 1;
            quarters[voice] += whole * k;
            bars[voice] += k;
            return;
        }
        std::string s = yue2_bar_notes(bar);
        double      q = 0.0;
        bool        found = false;
        for (size_t i = 0; i < s.size();) {
            if (!std::strchr("ABCDEFGabcdefgzx", s[i]) || s[i] == '\0') {
                i++;
                continue;
            }
            found = true;
            i++;
            while (i < s.size() && (s[i] == ',' || s[i] == '\'')) {
                i++;
            }
            long n = 0, d = 0;
            bool num = false, den = false;
            while (i < s.size() && std::isdigit((unsigned char) s[i]) && n < 100000) {
                n   = n * 10 + (s[i++] - '0');
                num = true;
            }
            int slashes = 0;
            while (i < s.size() && s[i] == '/') {
                slashes++;
                i++;
            }
            while (slashes && i < s.size() && std::isdigit((unsigned char) s[i]) && d < 100000) {
                d   = d * 10 + (s[i++] - '0');
                den = true;
            }
            double len = num ? (double) n : 1.0;
            double div = slashes == 0 ? 1.0 : den && d > 0 ? (double) d : (double) (1L << std::min(slashes, 16));
            q += len / div * f.unit * 4.0;
        }
        quarters[voice] += found ? q : whole;
        bars[voice] += 1;
    });
    Yue2ScoreLength out;
    out.bpm = bpq;
    std::string longest;
    for (const auto & v : quarters) {
        if (longest.empty() || v.second > quarters[longest]) {
            longest = v.first;
        }
    }
    if (longest.empty()) {
        return out;
    }
    out.bars = bars[longest];
    if (bpq > 0.0) {
        out.seconds = quarters[longest] * 60.0 / bpq;
    }
    return out;
}

// HERESY 2830 (Viktor 18.11.2026, on «Окно 2509 · 9:00 спрошено»: «Аномалия с пустотой. Или ты специально так запромптил?»): the music's floor
// never past the plan's end. The floor is a fuse against broken early ends (1088), not a length asked: past the end of the score the music
// follows, it can only force music with no plan (that take: a floor of 8:00, a plan of 4:26, near silence from 4:16 and fragments to 7:16).
// A floor more than YUE2_FLOOR_PAST_PLAN_S past the plan's end was lowered to YUE2_FLOOR_BEFORE_END_S before it, never under the default
// fuse and never raised. On the studio's 450 long plans with a written tempo the music ended a median 8 s before the plan's end (p90 at it).
// A plan of unknown length (-1) leaves the floor as asked.
// HERESY 2897 (GitHub issue 13, 20.11.2026, a user on 2.0.9: «if an outro is about to given it restarts it some how and does not fade out at
// all»): 2830 left a floor up to 20 s past the plan's end as asked, so the music had to go on up to half a minute past the Outro with no plan
// to follow, and it began again. Now every floor past YUE2_FLOOR_BEFORE_END_S before the plan's end goes down to it: the plan's end is the
// song's end, the fuse as before (never under 30 s), never raised.
#define YUE2_FLOOR_FUSE          750     // the music's default floor (HERESY 1088, sampling.h): 30 s
#define YUE2_FLOOR_BEFORE_END_S  10.0

static int yue2_floor_for_plan(int floor, double plan_seconds, int fps) {
    if (plan_seconds < 0.0) {
        return floor;
    }
    int to = std::max(YUE2_FLOOR_FUSE, (int) ((plan_seconds - YUE2_FLOOR_BEFORE_END_S) * fps));
    return std::min(floor, to);
}
