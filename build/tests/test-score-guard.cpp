// test-score-guard.cpp: the engine's score guard (HERESY 1087) and its warning (HERESY 2433), pure CPU, no model.
//
// A score whose one fault is a missing key line is sung as written and says so; a missing key line beside another fault, and every
// other fault, still stops the run; a whole score passes with nothing to say.
//
// usage: test-score-guard        (exit 0 when every case holds)

#include "score-guard.h"

#include <cstdio>
#include <string>

static int g_failed = 0;

static void check(bool ok, const char * name, const std::string & detail) {
    printf("[%s] %s%s%s\n", ok ? "PASS" : "FAIL", name, ok ? "" : ": ", ok ? "" : detail.c_str());
    g_failed += ok ? 0 : 1;
}

static const char * HEAD_NO_KEY =
    "X:1\nT:\nM:4/4\nL:1/16\nQ:1/4=72\n"
    "V: Vocal clef=treble name=\"Vocal Melody\" snm=\"Vocal\"\n"
    "V: Ins clef=treble name=\"Ins Melody\" snm=\"Inst.\"\n";
static const char * BODY = "V: Vocal\n\"Dm\"z16|z16|\nV: Ins\nd16|a16|\n";

int main() {
    std::string warn = "stale";
    std::string whole = std::string(HEAD_NO_KEY) + "K:D#m\n" + BODY;
    std::string why   = yue2_score_broken(whole, &warn);
    check(why.empty() && warn.empty(), "a whole score passes, nothing to say", "why «" + why + "», warning «" + warn + "»");

    std::string no_key = std::string(HEAD_NO_KEY) + BODY;
    why = yue2_score_broken(no_key, &warn);
    check(why.empty(), "a missing key line alone does not stop the run", "why «" + why + "»");
    check(warn == YUE2_SCORE_NO_KEY, "a missing key line alone is a warning", "warning «" + warn + "»");
    check(yue2_score_broken(no_key).empty(), "the same without asking for the warning", "");

    std::string bad_q = "X:1\nT:\nM:4/4\nL:1/16\nQ:1/4=7x2\n" + std::string(BODY);
    why = yue2_score_broken(bad_q, &warn);
    check(why == "no key line (K:); the tempo is not a tempo (Q:1/4=7x2)", "a missing key line beside a bad tempo still stops it, both said",
          "why «" + why + "»");
    check(warn.empty(), "no warning when the run is stopped", "warning «" + warn + "»");

    std::string bad_key = std::string(HEAD_NO_KEY) + "K:H\n" + BODY;
    why = yue2_score_broken(bad_key, &warn);
    check(why == "the key line is not a key (K:H)" && warn.empty(), "a key line that is not a key still stops it", "why «" + why + "»");

    std::string colons = std::string(HEAD_NO_KEY) + "K:Dm\n" + BODY + "|:::|\n";
    why = yue2_score_broken(colons, &warn);
    check(why == "colons in a run of 3", "colons in a run still stop it", "why «" + why + "»");

    std::string no_meter = "X:1\nT:\nL:1/16\nQ:1/4=72\nK:Dm\n" + std::string(BODY);
    why = yue2_score_broken(no_meter, &warn);
    check(why == "no meter (M:)", "a missing meter still stops it", "why «" + why + "»");

    printf("%s\n", g_failed ? "FAILED" : "all cases hold");
    return g_failed ? 1 : 0;
}
