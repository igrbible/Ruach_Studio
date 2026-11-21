"""HERESY 2919 (Viktor 20.11.2026, to the mockup of the workspaces' emoji: «мой выбор — A… Наши зарезервированные системные 💎, 🙈 и другие… из
списка исключены железно. Наши 💎 пространства так и остаются внизу»): a workspace's emoji is its own field (collection.json ws_emoji, {workspace:
emoji}), one emoji, never one of the Studio's own marks; and the one-time upgrade of the names that begin with one.

lead(text)      (emoji, rest): the one emoji a name begins with, whole as it is drawn (its variation sign, its joined parts: 🌶️, 👁‍🗨, 🇺🇦), and the
                rest without the spaces after it; ("", text) when it begins with none
reserved(e)     the Studio's own marks (💎 a published set, 🙈 a blind set, 🚨 the imports' shelf, ❄ frozen, 👁‍🗨 blind, 🔒 locked): never a workspace's emoji; a name that
                begins with one keeps it (the lab and the page read a leading 💎)
check(v)        "" (none) or the one emoji given; ValueError for anything else or a reserved one
plan(d)         the upgrade, read only: every workspace's new name and the emoji each level takes, and the ones kept as they are with why
apply(d, p)     the plan written into the marks: every name moved the way ws-rename moves one, the emoji set, ws_moved kept for runs on their way
moved(d, ws)    a name the upgrade moved, as it is called now (a run sent before the upgrade lands where its workspace went)
resolve(d, ws, make)  HERESY 2919c: a name as a script or an older page sends it («🧪 X / Y») to the workspace it means: as it is when it is there,
                else through ws_moved, else each level's leading emoji off (the rest when it is there with no other emoji of its own; with make, a
                new level by the rest with the emoji in its field): never a second workspace under the old name
migrate(d)      HERESY 2919c: the upgrade as a one-time migration every install runs by itself (plan, apply, the flag FLAG with what it did)
"""
import re
import time

SEP = " / "
VS = "︎️"
RESERVED = ("\U0001F6A8", "\U0001F48E", "\U0001F648", "❄", "\U0001F441‍\U0001F5E8", "\U0001F512")   # 💎 🙈 ❄ 👁‍🗨 🔒, compared without U+FE0F/FE0E
NOT_EMOJI = set("©®™ℹ")                  # ©, ®, ™ and ℹ are pictographs to Unicode, letters to a name

try:                                                          # the lab's environment has it (requirements-lock); the ranges below otherwise
    import regex as _rx
    _SEQ = _rx.compile(r"(?:\p{Regional_Indicator}{2}|\p{Extended_Pictographic}[︎️]?[\U0001F3FB-\U0001F3FF]?"
                       r"(?:‍\p{Extended_Pictographic}[︎️]?[\U0001F3FB-\U0001F3FF]?)*[\U000E0020-\U000E007F]*)")
except ImportError:                                           # pragma: no cover
    _rx = None
    _P = (r"‼⁉↔-↙↩↪⌚⌛⌨⏏⏩-⏳⏸-⏺Ⓜ▪▫▶◀◻-◾"
          r"☀-➿⤴⤵⬅-⬇⬛⬜⭐⭕〰〽㊗㊙\U0001F000-\U0001FAFF")
    _SEQ = re.compile(r"(?:[\U0001F1E6-\U0001F1FF]{2}|[" + _P + r"][︎️]?[\U0001F3FB-\U0001F3FF]?(?:‍[" + _P +
                      r"][︎️]?[\U0001F3FB-\U0001F3FF]?)*[\U000E0020-\U000E007F]*)")


def bare(e):
    """an emoji without its variation signs, to compare two ways of writing one"""
    return "".join(c for c in str(e or "") if c not in VS)


def reserved(e):
    return bare(e) in RESERVED


def lead(text):
    s = str(text or "")
    t = s.lstrip(" ")
    m = _SEQ.match(t)
    if not m or not m.group(0) or t[0] in NOT_EMOJI:
        return "", s
    return m.group(0), t[m.end():].lstrip(" ")


def check(v):
    e = str(v or "").strip()
    if not e:
        return ""
    em, rest = lead(e)
    if not em or rest:
        raise ValueError("one emoji, or none")
    if reserved(em):
        raise ValueError(f"{em} is the Studio's own mark, never a workspace's emoji")
    return em


def plan(d):
    """{"rows": [{old, new, emoji, sys, why}], "counts": {...}}: each workspace once, a parent before its sections. A level whose name begins with
    an emoji not the Studio's own gives it to its own field and keeps the rest; one with a reserved one keeps it in its name (sys); a level that
    has an emoji of its own already, or whose rest would be empty or taken by another workspace, stays as it is (why). The rest is the name as it was:
    a name already there is not judged by the names' rule (2462), only what is made or renamed by hand."""
    keys = sorted(d.get("workspaces") or {})
    own = d.get("ws_emoji") or {}
    hold = {}                                                 # level path -> why it keeps its name
    for _round in range(8):                                   # a name kept moves the names under it: read again until nothing changes
        new, em, sys = {}, {}, {}
        for w in keys:
            parts = w.split(SEP)
            for i in range(1, len(parts) + 1):
                old = SEP.join(parts[:i])
                if old in new:
                    continue
                lvl, top = parts[i - 1], new[SEP.join(parts[:i - 1])] if i > 1 else ""
                e, rest = lead(lvl)
                leaf, sys[old], em[old] = lvl, "", ""
                if e and reserved(e):
                    sys[old] = e
                elif e and old not in hold:
                    if own.get(old):
                        hold[old] = "has an emoji of its own already"
                    elif not rest:
                        hold[old] = "nothing but the emoji"
                    else:                                     # the rest is the name as it was, less its emoji: never judged by the rule again (2462)
                        leaf, em[old] = rest, e
                new[old] = top + SEP + leaf if top else leaf
        taken, clash = {}, False
        for w in keys:                                       # two names into one, or into one that stays: the moved one stays as it is
            taken.setdefault(new[w], []).append(w)
        for n, olds in taken.items():
            if len(olds) > 1:
                for o in olds:
                    if o != n and o not in hold and em.get(o):
                        hold[o] = "«" + n + "» would be taken twice"
                        clash = True
        if not clash:
            break
    rows = [{"old": w, "new": new[w], "emoji": em[w], "sys": sys[w], "why": hold.get(w, "")} for w in keys]
    sys_n = {}
    for r in rows:
        if r["sys"]:
            sys_n[r["sys"]] = sys_n.get(r["sys"], 0) + 1
    counts = {"workspaces": len(rows), "tops": sum(1 for r in rows if SEP not in r["old"]), "sections": sum(1 for r in rows if SEP in r["old"]),
              "renamed": sum(1 for r in rows if r["new"] != r["old"]), "emoji": sum(1 for r in rows if r["emoji"]),
              "kept": sum(1 for r in rows if r["why"]), "sys": sys_n,
              "plain": sum(1 for r in rows if not r["emoji"] and not r["sys"] and not r["why"] and not own.get(r["old"]) and not lead(r["old"].split(SEP)[-1])[0])}
    return {"rows": rows, "counts": counts}


def _remap_ws_item(n, ren):
    pre = "@ws:"
    return pre + ren.get(n[len(pre):], n[len(pre):]) if isinstance(n, str) and n.startswith(pre) else n


def apply(d, p):
    """the plan written into d: every workspace key moved the way ws-rename moves one (its takes, locks, pins, note, realm, emoji, blindness,
    archive, freeze, its place in the playlist and the albums), each level's emoji set; ws_moved keeps old -> new for runs on their way"""
    ren = {r["old"]: r["new"] for r in p["rows"] if r["new"] != r["old"]}
    if ren:
        d["workspaces"] = {ren.get(w, w): v for w, v in d["workspaces"].items()}
        for key in ("locks", "pins", "ws_notes", "ws_realm", "ws_emoji"):
            d[key] = {ren.get(w, w): v for w, v in (d.get(key) or {}).items()}
        for key in ("frozen", "blind", "archived"):
            d[key] = sorted({ren.get(w, w) for w in d.get(key) or []})
        d["playlist"] = [_remap_ws_item(n, ren) for n in d.get("playlist") or []]
        for al in d.get("albums") or []:
            al["items"] = [_remap_ws_item(n, ren) for n in al.get("items") or []]
        mv = d.setdefault("ws_moved", {})
        for o, n in list(mv.items()):                         # an older move follows this one
            mv[o] = ren.get(n, n)
        mv.update(ren)
    d.setdefault("ws_emoji", {})
    for r in p["rows"]:
        if r["emoji"]:
            d["ws_emoji"][r["new"]] = r["emoji"]
    return ren


def moved(d, ws):
    """a name the upgrade moved (or a section under one), as it is called now; the name itself when it is here or was never moved"""
    mv = d.get("ws_moved") or {}
    if not ws or ws in d.get("workspaces", {}) or not mv:
        return ws
    parts = ws.split(SEP)
    for i in range(len(parts), 0, -1):
        head = SEP.join(parts[:i])
        if head in mv:
            return SEP.join([mv[head]] + parts[i:])
    return ws


def resolve(d, ws, make=False):
    """(name, made): the workspace a name means, level by level under the parent resolved before it: the level as it is when it is there; a head
    the upgrade moved (ws_moved) as it is now; a level that begins with an emoji not the Studio's own as the rest, when the rest is there with no
    other emoji of its own (with make: when it is not there either, the rest is made with the emoji in its field, made {key: emoji}); else as given.
    So a script or an older page that still writes «🧪 X» files into X, and never makes a second «🧪 X» beside it."""
    if not ws:
        return ws, {}
    wss, own, mv = d.get("workspaces") or {}, d.get("ws_emoji") or {}, d.get("ws_moved") or {}
    if ws in wss:
        return ws, {}
    parts, out, made = ws.split(SEP), [], {}
    for i, p in enumerate(parts):
        here, given = SEP.join(out + [p]), SEP.join(parts[:i + 1])
        if here in wss:
            out.append(p)
            continue
        if given in mv and i == len(out):            # a head the upgrade moved, taken whole as it is called now
            out = mv[given].split(SEP)
            continue
        e, rest = lead(p)
        if e and rest and not reserved(e):
            cand = SEP.join(out + [rest])
            if cand in wss and (not own.get(cand) or bare(own[cand]) == bare(e)):
                out.append(rest)
                continue
            if make and cand not in wss:
                out.append(rest)
                made[cand] = e
                continue
        out.append(p)
    return SEP.join(out), made


FLAG = "ws_emoji_upgraded"


def migrate(d):
    """the upgrade once: its plan applied and the flag set with what it did ({at, renamed, emoji, sys, kept}); None when it ran before"""
    if d.get(FLAG):
        return None
    p = plan(d)
    ren = apply(d, p)
    d[FLAG] = {"at": int(time.time()), "renamed": len(ren), "emoji": p["counts"]["emoji"], "sys": p["counts"]["sys"],
               "kept": [[r["old"], r["why"]] for r in p["rows"] if r["why"]][:50]}
    return d[FLAG]
