// score-guard.h: the engine's guard over a score the AR wrote (HERESY 1087), in a header of its own since HERESY 2433 so a test reads it
// without a model (tests/test-score-guard.cpp). Pure C++, no ggml.
#pragma once

#include <regex>
#include <string>
#include <vector>

// HERESY 2433: what a take says when its score was sung without a key line (meta.json and the job's status: score_warning)
#define YUE2_SCORE_NO_KEY "no key line in the score"

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
    // HERESY 2433 (Viktor 12.11.2026, after a night's probe: «В сторожа партитур давай K: не будем браковать сразу, а
    // предупреждать»): a score whose one fault is a missing key line is sung as written, and the take says so; a missing key line beside
    // any other fault still stops the run, the whole list said
    if (warning) {
        warning->clear();
    }
    if (!hasK && why.size() == 1) {
        if (warning) {
            *warning = YUE2_SCORE_NO_KEY;
        }
        return "";
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
