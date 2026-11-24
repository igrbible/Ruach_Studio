// test-score-guard.cpp: the engine's score guard (HERESY 1087) and its warning (HERESY 2433), pure CPU, no model.
//
// A score whose one fault is a missing key line is sung as written and says so; a missing key line beside another fault, and every
// other fault, still stops the run; a whole score passes with nothing to say. HERESY 2830: a score's length at its own tempo and the
// music's floor never past the plan's end, on real plans of the Studio's outputs (score-guard-cases.h); 2832: a plan with no bar holding
// a note is broken.
//
// usage: test-score-guard [CASES.txt]   (exit 0 when every case holds; CASES.txt: records «@@ name floor=F seconds=S bars=B floor_to=T
//                                        by=WHO» each followed by its score, as the kitchen's gen_cases.py writes them from every take)

#include "score-guard.h"
#include "score-guard-cases.h"

#include <cmath>
#include <cstdio>
#include <fstream>
#include <sstream>
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

// HERESY 2959: a chord symbol that swallowed notes, and chords that only look near it
static void swallowed() {
    const std::string head = std::string(HEAD_NO_KEY) + "K:Em\n";
    const std::string bad  = head + "V: Vocal\n\"Ea4g2f2e8-|\"Am\"c4d4e8|\nV: Ins\nE16|A16|\n";
    const std::string open = head + "V: Vocal\n\"Em\"e4d4c8|\"Ea4g2f2e8-|\nV: Ins\nE16|A16|\n";
    const std::string fine = head + "V: Vocal\n\"C7(b9)\"c4\"Am7b5\"d4\"Cadd9\"e4\"Gaug7\"g4|\"F#m7b5(b13)\"f8\"Dm(add9)\"d8|\"G/B\"B16|\nV: Ins\nE16|A16|B16|\n";
    check(yue2_score_swallowed(bad) == "\"Ea4g2f2e8-|\"", "a chord's quote never closed: the notes it swallowed found", yue2_score_swallowed(bad));
    check(yue2_score_broken(bad).find("a chord symbol swallowed notes (\"Ea4g2f2e8-|\")") != std::string::npos, "  and the guard stops the run for it", yue2_score_broken(bad));
    check(!yue2_score_swallowed(open).empty(), "  one left open to the line's end too", yue2_score_swallowed(open));
    check(yue2_score_swallowed(fine).empty() && yue2_score_broken(fine).empty(), "  chords with numbers, flats and added tones (C7(b9), Am7b5, Cadd9, Gaug7, F#m7b5(b13), G/B) pass",
          yue2_score_swallowed(fine) + " | " + yue2_score_broken(fine));
    check(yue2_score_swallowed(std::string(HEAD_NO_KEY) + "K:C\nV: Vocal clef=treble name=\"Vocal Melody\" snm=\"a4g2|\"\n\"C\"c16|\n").empty(), "  a field line's quotes are not chords", "");
}

static std::string clock_of(double s) {
    if (s < 0.0) {
        return "unknown";
    }
    char buf[32];
    snprintf(buf, sizeof buf, "%d:%04.1f", (int) (s / 60.0), s - 60.0 * (int) (s / 60.0));
    return buf;
}

// HERESY 2830: every record of a cases file: the length within 0.05 s of the expected one (abc_tools' where it accepts the score), the
// floor rule as expected; the takes whose floor the rule lowers are listed
static void wide(const char * path) {
    std::ifstream f(path);
    if (!f) {
        check(false, "the cases file opens", path);
        return;
    }
    std::string line, name, abc, head;
    int         n = 0, agree = 0, lowered = 0, rule = 0, unknown = 0;
    std::map<std::string, std::pair<int, int>> by;   // who expected it: (cases, agreeing)
    auto one = [&]() {
        if (head.empty()) {
            return;
        }
        char   nm[256] = { 0 }, who[32] = { 0 };
        int    floor = 0, bars = 0, floor_to = 0;
        double secs = 0.0;
        if (sscanf(head.c_str(), "@@ %255s floor=%d seconds=%lf bars=%d floor_to=%d by=%31s", nm, &floor, &secs, &bars, &floor_to, who) != 6) {
            check(false, "a record's head reads", head);
            return;
        }
        n++;
        Yue2ScoreLength len = yue2_score_seconds(abc);
        bool            ok  = secs < 0.0 ? len.seconds < 0.0 : std::fabs(len.seconds - secs) < 0.05;
        agree += ok ? 1 : 0;
        by[who].first++;
        by[who].second += ok ? 1 : 0;
        unknown += len.seconds < 0.0 ? 1 : 0;
        if (!ok && by[who].first - by[who].second <= 5) {
            printf("    %s (%s): %s against %s expected\n", nm, who, clock_of(len.seconds).c_str(), clock_of(secs).c_str());
        }
        int to = yue2_floor_for_plan(floor, len.seconds, 25);
        rule += to == floor_to ? 1 : 0;
        if (to < floor) {
            lowered++;
            printf("    lowered: %s, floor %s to %s, the plan %s\n", nm, clock_of(floor / 25.0).c_str(), clock_of(to / 25.0).c_str(),
                   clock_of(len.seconds).c_str());
        }
    };
    while (std::getline(f, line)) {
        if (line.compare(0, 3, "@@ ") == 0) {
            one();
            head = line;
            abc.clear();
        } else {
            abc += abc.empty() ? line : "\n" + line;
        }
    }
    one();
    for (const auto & w : by) {
        printf("    by %s: %d of %d agree\n", w.first.c_str(), w.second.second, w.second.first);
    }
    check(n > 0 && by["abc_tools"].first == by["abc_tools"].second, ("every score abc_tools accepts has its length (" +
          std::to_string(by["abc_tools"].first) + ")").c_str(), std::to_string(by["abc_tools"].first - by["abc_tools"].second) + " differ");
    check(by["no"].first == by["no"].second, "every score with no tempo written (none, empty or not a tempo) has an unknown length", "");
    check(rule == n, ("the floor rule as expected on every take (" + std::to_string(n) + ", " + std::to_string(lowered) + " lowered)").c_str(),
          std::to_string(n - rule) + " differ");
    printf("    %d takes: %d lengths as expected, %d unknown, %d floors lowered\n", n, agree, unknown, lowered);
}

int main(int argc, char ** argv) {
    swallowed();                                     // HERESY 2959
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

    // HERESY 2631: score_fill's header
    std::string w2;
    std::string probe = "X:1\nT:\nM:4\nQ:1/4=110\n" + std::string(BODY);
    std::string filled = yue2_score_fill_header(probe);
    check(yue2_score_broken(filled, &w2).empty() && w2.empty(), "a header with M:4, no L:, no K: is filled and passes", filled.substr(0, 80));
    check(filled.find("M:4\n") == std::string::npos && filled.find("M:4/4") != std::string::npos, "the malformed meter replaced in place, one meter", filled.substr(0, 80));
    check(filled.compare(0, 4, "X:1\n") == 0, "X: stays first", filled.substr(0, 20));
    check(yue2_score_fill_header(whole) == whole, "a whole score is left as it is", "");
    std::string colons2 = "X:1\nT:\n" + std::string(BODY) + "|:::|\n";
    check(!yue2_score_broken(yue2_score_fill_header(colons2)).empty(), "colons in a run are not rescued", "");
    check(!yue2_score_broken(yue2_score_fill_header(bad_key)).empty(), "a key line that is not a key is not rescued", "");

    // HERESY 2832: no bar holding a note: said, by 2433's rule never refused for it
    std::string rests = std::string(HEAD_NO_KEY) + "K:Dm\nV: Vocal\n\"Dm\"z16|z16|\nV: Ins\nz16|Z|\n";
    why = yue2_score_broken(rests, &warn);
    check(why.empty() && warn == YUE2_SCORE_NO_NOTE, "a plan of rests only is sung, and said", "why «" + why + "», warning «" + warn + "»");
    std::string flood = "X:1\nT:\nM:4/4\nL:1/16\n\nV:\n\"\n\n\n\nz\n\n";
    why = yue2_score_broken(flood, &warn);
    check(why.empty() && warn == "no key line in the score; no bar of the score holds a note", "a flood with no key line: both said, not refused",
          "why «" + why + "», warning «" + warn + "»");
    std::string chords_only = std::string(HEAD_NO_KEY) + "K:Dm\nV: Vocal\n\"Dm\"z16|\"Am\"z16|\nV: Ins\n\"C\"z16|z16|\n";
    why = yue2_score_broken(chords_only, &warn);
    check(why.empty() && warn == YUE2_SCORE_NO_NOTE, "chord symbols are not notes", "warning «" + warn + "»");
    std::string ins_only = std::string(HEAD_NO_KEY) + "K:Dm\nV: Vocal\nz16|z16|\nV: Ins\nd16|a16|\n";
    why = yue2_score_broken(ins_only, &warn);
    check(why.empty() && warn.empty(), "a resting Vocal line beside an Ins line that plays is whole (an instrumental)", "warning «" + warn + "»");
    std::string decorated = std::string(HEAD_NO_KEY) + "K:Dm\nV: Vocal\n!fermata!z16|+f+z16|[K:Am]z16|\n";
    why = yue2_score_broken(decorated, &warn);
    check(why.empty() && warn == YUE2_SCORE_NO_NOTE, "decorations and inline fields are not notes", "warning «" + warn + "»");
    std::string bad_and_empty = "X:1\nT:\nM:4/4\nL:1/16\nQ:1/4=7x2\nK:Dm\nV: Vocal\nz16|\n";
    why = yue2_score_broken(bad_and_empty, &warn);
    check(why == "the tempo is not a tempo (Q:1/4=7x2)" && warn.empty(), "another fault still stops the run, its list as before", "why «" + why + "»");

    // HERESY 2830: a score's length at its own tempo
    Yue2ScoreLength l = yue2_score_seconds("X:1\nM:4/4\nL:1/4\nQ:1/4=60\nK:C\nV: Vocal\nCDEF|GABc|\nV: Ins\nC4|C4|\n");
    check(std::fabs(l.seconds - 8.0) < 1e-9 && l.bars == 2, "two bars of 4/4 at 60 last 8 s", clock_of(l.seconds) + ", " + std::to_string(l.bars) + " bars");
    l = yue2_score_seconds("X:1\nM:3/4\nL:1/8\nQ:1/4=90\nK:G\nV: Vocal\nZ4|\nV: Ins\nZ4|\n");
    check(std::fabs(l.seconds - 8.0) < 1e-9 && l.bars == 4, "Z4 is four whole bars (3/4 at 90: 8 s)", clock_of(l.seconds));
    l = yue2_score_seconds("X:1\nM:6/8\nL:1/8\nQ:3/8=60\nK:Em\nV: Vocal\nz6|E3 G3|\n");
    check(std::fabs(l.seconds - 4.0) < 1e-9, "6/8 at a dotted quarter of 60: two beats a bar, 2 s each", clock_of(l.seconds));
    l = yue2_score_seconds("X:1\nM:4/4\nL:1/16\nQ:1/4=120\nK:C\nV: Vocal\nA/2B/ c// d3/2 e8 z4|\n");
    check(std::fabs(l.seconds - (0.5 + 0.5 + 0.25 + 1.5 + 8 + 4) / 4.0 * 0.5) < 1e-9, "lengths: /2, /, //, 3/2 and whole numbers",
          std::to_string(l.seconds));
    l = yue2_score_seconds("X:1\nM:4/4\nL:1/16\nK:C\nV: Vocal\nc16|c16|\n");
    check(l.seconds < 0.0 && l.bars == 2, "no Q: written: the length is not known", std::to_string(l.seconds));
    l = yue2_score_seconds("X:1\nM:4/4\nL:1/16\nQ:1/4=60\nK:C\nV: Vocal\nc16|c16|\nV: Ins\nc16|c16|c16|c16|\n");
    check(std::fabs(l.seconds - 16.0) < 1e-9 && l.bars == 4, "the longest voice sets the end", clock_of(l.seconds));
    l = yue2_score_seconds("X:1\nM:4/4\nL:1/16\nQ:1/4=60\nK:C\nV: Vocal\n|:c16|c16:|]\n");
    check(std::fabs(l.seconds - 8.0) < 1e-9 && l.bars == 2, "repeat and end marks are bar lines, not bars", clock_of(l.seconds));

    // HERESY 2830: the floor never past the plan's end
    check(yue2_floor_for_plan(12000, -1.0, 25) == 12000, "a plan of unknown length leaves the floor as asked", "");
    check(yue2_floor_for_plan(750, 200.0, 25) == 750, "the default floor under a long plan stays", "");
    check(yue2_floor_for_plan(5500, 200.0, 25) == 4750, "a floor 20 s past the plan's end goes to 10 s before it (2897: 2830 left it)", "");
    check(yue2_floor_for_plan(5501, 200.0, 25) == 4750, "a floor more than 20 s past the plan's end goes to 10 s before it", "");
    check(yue2_floor_for_plan(5000, 200.0, 25) == 4750, "a floor at the plan's end goes to 10 s before it (2897)", "");
    check(yue2_floor_for_plan(4751, 200.0, 25) == 4750, "a floor a frame past 10 s before the end goes there (2897)", "");
    check(yue2_floor_for_plan(4750, 200.0, 25) == 4750, "a floor at 10 s before the end stays", "");
    check(yue2_floor_for_plan(4000, 200.0, 25) == 4000, "a floor well before the end stays", "");
    check(yue2_floor_for_plan(800, 5.0, 25) == 750, "never under the default fuse of 30 s", "");
    check(yue2_floor_for_plan(700, 1.0, 25) == 700, "never raised", "");

    // HERESY 2830, 2832: real plans from the Studio's outputs
    for (const Yue2GuardCase & c : YUE2_GUARD_CASES) {
        Yue2ScoreLength len = yue2_score_seconds(c.abc);
        bool            ok  = c.seconds < 0.0 ? len.seconds < 0.0 : std::fabs(len.seconds - c.seconds) < 0.05;
        check(ok, (std::string(c.what) + ": its length").c_str(), clock_of(len.seconds) + " against " + clock_of(c.seconds));
        int to = yue2_floor_for_plan(c.floor, len.seconds, 25);
        check(to == c.floor_to, (std::string(c.what) + ": its floor").c_str(), std::to_string(c.floor) + " to " + std::to_string(to) +
              ", expected " + std::to_string(c.floor_to));
        if (c.broken) {
            std::string w;
            std::string b = yue2_score_broken(c.abc, &w);
            check(b == c.broken && w == c.warning, (std::string(c.what) + ": the guard").c_str(), "why «" + b + "», warning «" + w + "»");
        }
    }
    if (argc > 1) {
        wide(argv[1]);
    }
    printf("%s\n", g_failed ? "FAILED" : "all cases hold");
    return g_failed ? 1 : 0;
}
