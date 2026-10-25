// harmony.h: chord variety and section order of the planned score
//
// The planner tends to loop one progression over the whole song, and the
// window penalty cannot help: it lowers every recent token, bar lines and
// voice markers included, and breaks the score first. This pass only touches
// chord symbols. While a symbol ("Bm7") is being written, a candidate token
// that would spell a chord heard among the recent changes loses logits in
// proportion to that chord's share of them. Staying on the current chord is
// free for hold_limit symbols in a row, then costs more with each one.
//
// Chords are told apart by root pitch class (C, Cmaj7 and C/E are one) or by
// their exact spelling. Three more controls, each off at zero:
//   outside_bonus     root identity only: a change to a root outside the key
//                     of the K: line gains logits, while fewer than
//                     outside_limit of the recent changes are outside already
//   section_strength  the n-th chord a section moves to may not be the n-th
//                     the section before moved to, for its first section_open
//                     chords; a "% name" comment line starts a section
//   follow            the section names the plan must write, in order: after
//                     a "%" only the next name may be spelled, once the list
//                     is used no further "%" line may start, and the plan may
//                     not end before every section has begun and the last
//                     has a few chords
// Only the best candidates of a step are scored, as many as the top-k cut
// keeps and never fewer than 64: a penalty only lowers a token, so one outside
// them could not be drawn either way. The bonus can raise one, so the tokens
// opening a chord symbol are scored with them.
//
// After Yeufonic (yue2_harmony), reimplemented from its description.
// Taken whole from timoncool/yue2.cpp 1e21e63 (MIT, Nerual Dreming) for Ruach Studio, HERESY 1606.
#pragma once

#include <algorithm>
#include <cctype>
#include <string>
#include <unordered_map>
#include <vector>

struct Yue2Harmony {
    float                    strength         = 0.0f;   // logits per unit share of the recent changes
    int                      window           = 16;     // recent chord changes remembered
    int                      hold_limit       = 8;      // symbols in a row one root holds for free, 0 is no limit
    bool                     by_root          = true;   // "root" identity, false is "spelling"
    float                    outside_bonus    = 0.0f;   // logits for a root outside the key
    float                    outside_limit    = 0.25f;  // share of recent changes outside the key that stops it
    float                    section_strength = 0.0f;   // logits against copying the previous section's opening
    int                      section_open     = 4;      // opening chords compared between sections
    std::vector<std::string> follow;                    // section names in order, lower case; empty is off

    bool chords() const { return strength > 0.0f || outside_bonus > 0.0f || section_strength > 0.0f; }

    bool active() const { return chords() || !follow.empty(); }
};

// Logits given to the tokens that spell the section asked for next, taken from
// a "%" line past the list and from the end of a plan with sections missing
static const float YUE2_FOLLOW_BOOST = 50.0f;
// Chord symbols the last section needs before the plan may end
static const int   YUE2_FOLLOW_LAST_CHORDS = 4;

// A section name as the planner writes it after "%": a letter, then letters,
// digits, '_', '-' or spaces
static bool yue2_section_name_valid(const std::string & name) {
    if (name.empty() || name.size() > 64 || !std::isalpha((unsigned char) name[0])) {
        return false;
    }
    for (char c : name) {
        if (!(std::isalnum((unsigned char) c) || c == '_' || c == '-' || c == ' ')) {
            return false;
        }
    }
    return name.back() != ' ';
}

// The bounds a request is held to
static bool yue2_harmony_valid(const Yue2Harmony & h) {
    if (!(h.strength >= 0.0f && h.strength <= 64.0f && h.window >= 1 && h.window <= 512 && h.hold_limit >= 0 &&
          h.hold_limit <= 64 && h.outside_bonus >= 0.0f && h.outside_bonus <= 20.0f && h.outside_limit >= 0.0f &&
          h.outside_limit <= 1.0f && h.section_strength >= 0.0f && h.section_strength <= 64.0f &&
          h.section_open >= 1 && h.section_open <= 16 && h.follow.size() <= 64)) {
        return false;
    }
    for (const std::string & name : h.follow) {
        if (!yue2_section_name_valid(name)) {
            return false;
        }
    }
    return true;
}

// Pitch class of the root a chord symbol starts with, -1 for none
static int yue2_chord_root(const std::string & symbol) {
    static const int natural[7] = { 9, 11, 0, 2, 4, 5, 7 };  // A..G
    if (symbol.empty() || symbol[0] < 'A' || symbol[0] > 'G') {
        return -1;
    }
    int pc = natural[symbol[0] - 'A'];
    if (symbol.size() > 1 && symbol[1] == '#') {
        pc += 1;
    } else if (symbol.size() > 1 && symbol[1] == 'b') {
        pc += 11;
    }
    return pc % 12;
}

// Settings plus the decoded text of every ABC phase token, by id
struct Yue2HarmonyPlan {
    Yue2Harmony                      cfg;
    const std::vector<std::string> * texts = nullptr;
    int                              end   = -1;  // the plan's end token, as a logits index
    std::vector<int>                 chord_starts;  // tokens opening a chord symbol: '"' and a root letter
};

static Yue2HarmonyPlan yue2_harmony_plan(const Yue2Harmony & cfg, const std::vector<std::string> * texts, int end) {
    Yue2HarmonyPlan plan;
    plan.cfg   = cfg;
    plan.texts = texts;
    plan.end   = end;
    for (int id = 0; id < (int) texts->size(); id++) {
        const std::string & t = (*texts)[(size_t) id];
        if (t.size() >= 2 && t[0] == '"' && yue2_chord_root(t.substr(1, 2)) >= 0) {
            plan.chord_starts.push_back(id);
        }
    }
    return plan;
}

// Where the writer stands in the text: the current line (its length and
// whether it is a field line like V: name="...", whose quotes are no
// chords) and the chord symbol it is inside, if any
struct Yue2ChordCursor {
    int         line_len = 0;
    char        line0    = 0;
    bool        field    = false;
    bool        inside   = false;
    std::string partial;

    // Advances over text, appending every symbol it closes
    void walk(const std::string & text, std::vector<std::string> * closed) {
        for (char c : text) {
            if (c == '\n') {
                line_len = 0;
                field    = false;
                inside   = false;
                partial.clear();
                continue;
            }
            if (inside) {
                if (c == '"') {
                    closed->push_back(partial);
                    inside = false;
                    partial.clear();
                } else {
                    partial += c;
                }
            } else if (c == '"' && !field) {
                inside = true;
            }
            if (line_len == 0) {
                line0 = c;
            } else if (line_len == 1) {
                field = c == ':' && ((line0 >= 'A' && line0 <= 'Z') || (line0 >= 'a' && line0 <= 'z'));
            }
            line_len++;
        }
    }
};

// Per sequence: the text read so far and the chords it changed through
struct Yue2HarmonyState {
    size_t                   seen = 0;
    Yue2ChordCursor          cursor;
    std::string              line;    // the line being written
    std::string              head;    // the text up to the K: line, while the key is unknown
    int                      scale = -1;  // pitch classes of the key as bits, -1 unknown
    std::vector<std::string> changes;     // identities, oldest first, no two neighbours equal
    int                      last_root      = -1;
    int                      held           = 0;  // symbols in a row on last_root
    int                      section_count  = 0;  // "% name" lines finished
    int                      section_chords = 0;  // chord symbols since the last one
    std::vector<int>         opening;             // roots this section moved through, up to section_open
    std::vector<int>         previous;            // the same for the section before
    std::vector<std::string> closed;              // scratch
    std::vector<int>         order;               // scratch
    std::unordered_map<std::string, std::vector<int>> spelling;  // tokens that can start a text, by text
};

static std::string yue2_chord_identity(const Yue2Harmony & h, const std::string & symbol) {
    return h.by_root ? std::to_string(yue2_chord_root(symbol)) : symbol;
}

// The key of a finished "K:" line in head as pitch class bits, -1 until there is one
static int yue2_key_scale(const std::string & head) {
    size_t at = 0;
    while (at < head.size()) {
        size_t eol = head.find('\n', at);
        if (eol == std::string::npos) {
            return -1;
        }
        if (head.compare(at, 2, "K:") == 0) {
            size_t k = at + 2;
            while (k < eol && head[k] == ' ') {
                k++;
            }
            int root = yue2_chord_root(head.substr(k, 2));
            if (root >= 0) {
                k += (k + 1 < eol && (head[k + 1] == '#' || head[k + 1] == 'b')) ? 2 : 1;
                bool minor = k < eol && head[k] == 'm' && !(k + 1 < eol && head[k + 1] == 'a');
                static const int major_steps[7] = { 0, 2, 4, 5, 7, 9, 11 };
                static const int minor_steps[7] = { 0, 2, 3, 5, 7, 8, 10 };
                int              bits           = 0;
                for (int s : (minor ? minor_steps : major_steps)) {
                    bits |= 1 << ((root + s) % 12);
                }
                return bits;
            }
        }
        at = eol + 1;
    }
    return -1;
}

// Whether a finished line is a section comment, "% verse"
static bool yue2_section_line(const std::string & line) {
    if (line.empty() || line[0] != '%') {
        return false;
    }
    size_t a = 1;
    while (a < line.size() && line[a] == ' ') {
        a++;
    }
    size_t b = line.size();
    while (b > a && line[b - 1] == ' ') {
        b--;
    }
    return b > a && yue2_section_name_valid(line.substr(a, b - a));
}

// Reads the tokens drawn since the last call
static void yue2_harmony_feed(const Yue2HarmonyPlan & plan, Yue2HarmonyState * st, const std::vector<int> & tokens) {
    const std::vector<std::string> & texts = *plan.texts;
    const Yue2Harmony &              h     = plan.cfg;
    for (size_t k = st->seen; k < tokens.size(); k++) {
        int id = tokens[k];
        if (id < 0 || id >= (int) texts.size()) {
            continue;
        }
        const std::string & text = texts[(size_t) id];
        if (h.by_root && st->scale < 0) {
            st->head += text;
            st->scale = yue2_key_scale(st->head);
            if (st->scale >= 0) {
                st->head.clear();
            }
        }
        for (char c : text) {
            if (c != '\n') {
                st->line += c;
                continue;
            }
            if (yue2_section_line(st->line)) {
                st->previous = st->opening;
                st->opening.clear();
                st->section_count++;
                st->section_chords = 0;
            }
            st->line.clear();
        }
        st->closed.clear();
        st->cursor.walk(text, &st->closed);
        for (const std::string & symbol : st->closed) {
            int root = yue2_chord_root(symbol);
            if (root < 0) {
                continue;
            }
            st->section_chords++;
            if ((int) st->opening.size() < h.section_open && (st->opening.empty() || st->opening.back() != root)) {
                st->opening.push_back(root);
            }
            // holding is counted by root, so respelling a chord (E5, Em, Em7) does not reset it
            if (root == st->last_root) {
                st->held++;
            } else {
                st->last_root = root;
                st->held      = 1;
            }
            std::string ident = yue2_chord_identity(h, symbol);
            if (st->changes.empty() || st->changes.back() != ident) {
                st->changes.push_back(ident);
                if ((int) st->changes.size() > h.window) {
                    st->changes.erase(st->changes.begin());
                }
            }
        }
    }
    st->seen = tokens.size();
}

// Share of the recent changes held by the identities pred accepts
template <typename Pred> static float yue2_harmony_share(const Yue2HarmonyState & st, Pred pred) {
    int n = 0;
    for (const std::string & c : st.changes) {
        n += pred(c) ? 1 : 0;
    }
    return (float) n / (float) st.changes.size();
}

// Cost of one more symbol on root, past the free holds
static float yue2_harmony_hold(const Yue2Harmony & h, const Yue2HarmonyState & st, int root) {
    if (h.hold_limit <= 0 || root != st.last_root || st.held < h.hold_limit) {
        return 0.0f;
    }
    return h.strength * 0.25f * (float) (st.held - h.hold_limit + 1);
}

// Cost of choosing root, when it would repeat the previous section's opening at the same place
static float yue2_harmony_section(const Yue2Harmony & h, const Yue2HarmonyState & st, int root) {
    if (h.section_strength <= 0.0f || st.previous.empty()) {
        return 0.0f;
    }
    size_t place = st.opening.size();
    if (!st.opening.empty() && root == st.opening.back()) {
        return 0.0f;
    }
    if (place < st.previous.size() && (int) place < h.section_open && root == st.previous[place]) {
        return h.section_strength;
    }
    return 0.0f;
}

// The bonus of a change to root, negative cost, while the key is known and few changes left it
static float yue2_harmony_outside(const Yue2Harmony & h, const Yue2HarmonyState & st, int root) {
    if (h.outside_bonus <= 0.0f || !h.by_root || st.scale < 0 || (st.scale >> root & 1)) {
        return 0.0f;
    }
    float outside = yue2_harmony_share(st, [&](const std::string & c) { return !(st.scale >> std::stoi(c) & 1); });
    return outside < h.outside_limit ? -h.outside_bonus : 0.0f;
}

// The chord cost of one candidate text, zero when it writes no chord
static float yue2_harmony_cost(const Yue2HarmonyPlan & plan, Yue2HarmonyState * st, const std::string & text) {
    const Yue2Harmony & h      = plan.cfg;
    const std::string & before = st->cursor.partial;
    bool                inside = st->cursor.inside;
    if (!inside && text.find('"') == std::string::npos) {
        return 0.0f;
    }
    Yue2ChordCursor next = st->cursor;
    st->closed.clear();
    next.walk(text, &st->closed);
    const std::string & current = st->changes.back();

    // the symbol the candidate settles: the first it closes, else the one it leaves open
    std::string symbol;
    if (!st->closed.empty()) {
        symbol = st->closed[0];
    } else if (next.inside) {
        symbol = next.partial;
    }
    int root = yue2_chord_root(symbol);

    if (h.by_root) {
        // the root is settled by its letter and the character after it
        if (root < 0 || (inside && before.size() >= 2)) {
            return 0.0f;
        }
        float       section = yue2_harmony_section(h, *st, root);
        std::string ident   = std::to_string(root);
        if (ident == current) {
            return yue2_harmony_hold(h, *st, root) + section;
        }
        return h.strength * yue2_harmony_share(*st, [&](const std::string & c) { return c == ident; }) +
               yue2_harmony_outside(h, *st, root) + section;
    }

    float cost = 0.0f;
    for (const std::string & done : st->closed) {
        if (yue2_chord_root(done) >= 0 && done != current) {
            cost += yue2_harmony_share(*st, [&](const std::string & c) { return c == done; });
        }
    }
    if (st->closed.empty() && next.inside && root >= 0 && current.compare(0, symbol.size(), symbol) != 0) {
        cost += yue2_harmony_share(*st, [&](const std::string & c) {
            return c != current && c.compare(0, symbol.size(), symbol) == 0;
        });
    }
    cost *= h.strength;
    if (root >= 0 && (!inside || before.size() <= 1)) {
        cost += yue2_harmony_hold(h, *st, root) + yue2_harmony_section(h, *st, root);
    }
    return cost;
}

// Every token whose text could be the next piece of remaining
static const std::vector<int> & yue2_harmony_spelling(const Yue2HarmonyPlan & plan,
                                                      Yue2HarmonyState *      st,
                                                      const std::string &     remaining) {
    auto it = st->spelling.find(remaining);
    if (it != st->spelling.end()) {
        return it->second;
    }
    std::vector<int> & ids = st->spelling[remaining];
    for (int id = 0; id < (int) plan.texts->size(); id++) {
        const std::string & t = (*plan.texts)[(size_t) id];
        if (!t.empty() && remaining.compare(0, t.size(), t) == 0) {
            ids.push_back(id);
        }
    }
    return ids;
}

// The structure's costs of this step: the next section's name spelled after a
// "%", a further "%" line barred once the list is used, and the end barred
// while sections are missing
static void yue2_harmony_follow(const Yue2HarmonyPlan &                    plan,
                                Yue2HarmonyState *                         st,
                                const std::vector<int> &                   top,
                                std::vector<std::pair<int, float>> *       costs) {
    const std::vector<std::string> & wanted = plan.cfg.follow;
    const std::string &              line   = st->line;
    bool                             listed = st->section_count < (int) wanted.size();
    if (line.empty()) {
        if (!listed) {
            for (int id : top) {
                if (!(*plan.texts)[(size_t) id].empty() && (*plan.texts)[(size_t) id][0] == '%') {
                    costs->push_back({ id, YUE2_FOLLOW_BOOST });
                }
            }
        }
    } else if (line[0] == '%' && line.compare(0, 2, "%%") != 0 && listed) {
        std::string target  = " " + wanted[(size_t) st->section_count];
        std::string content = line.substr(1);
        if (target.compare(0, content.size(), content) == 0) {
            for (int id : yue2_harmony_spelling(plan, st, target.substr(content.size()) + "\n")) {
                costs->push_back({ id, -YUE2_FOLLOW_BOOST });
            }
        }
    }
    if (plan.end >= 0 && (listed || st->section_chords < YUE2_FOLLOW_LAST_CHORDS)) {
        costs->push_back({ plan.end, YUE2_FOLLOW_BOOST });
    }
}

// Copies the rows logits to out with the costs of this step taken off: the
// chords among the best n content ids [0, texts) and the structure's tokens.
// Returns false, out untouched, when nothing changes.
static bool yue2_harmony_apply(const Yue2HarmonyPlan & plan,
                               Yue2HarmonyState *      st,
                               const float *           logits,
                               int                     rows,
                               int                     n,
                               std::vector<float> *    out) {
    const Yue2Harmony & h      = plan.cfg;
    bool                chords = h.chords() && !st->changes.empty();
    if (!chords && h.follow.empty()) {
        return false;
    }
    int count = std::min(rows, (int) plan.texts->size());
    n         = std::min(n, count);
    st->order.resize((size_t) count);
    for (int i = 0; i < count; i++) {
        st->order[(size_t) i] = i;
    }
    std::nth_element(st->order.begin(), st->order.begin() + (n - 1), st->order.end(),
                     [logits](int a, int b) { return logits[a] > logits[b]; });
    std::vector<int> top(st->order.begin(), st->order.begin() + n);

    std::vector<std::pair<int, float>> costs;
    if (chords) {
        std::vector<int> scored = top;
        if (h.outside_bonus > 0.0f && !st->cursor.inside &&
            std::any_of(top.begin(), top.end(),
                        [&](int id) { return (*plan.texts)[(size_t) id].find('"') != std::string::npos; })) {
            scored.insert(scored.end(), plan.chord_starts.begin(), plan.chord_starts.end());
            std::sort(scored.begin(), scored.end());
            scored.erase(std::unique(scored.begin(), scored.end()), scored.end());
        }
        for (int id : scored) {
            float cost = yue2_harmony_cost(plan, st, (*plan.texts)[(size_t) id]);
            if (cost != 0.0f) {
                costs.push_back({ id, cost });
            }
        }
    }
    if (!h.follow.empty()) {
        yue2_harmony_follow(plan, st, top, &costs);
    }
    if (costs.empty()) {
        return false;
    }
    out->assign(logits, logits + rows);
    for (const auto & c : costs) {
        if (c.first < rows) {
            (*out)[(size_t) c.first] -= c.second;
        }
    }
    return true;
}
