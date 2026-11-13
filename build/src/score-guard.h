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
