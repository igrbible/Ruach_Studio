"""HERESY 2811–2814, 2817: the Section editor's chain (section.chain), against a fake engine and a fake voice, as test_section_window.py has them.
The refusals of §9.3 on the lab's side; the order A (from the start), B (from the end back), then the ending or one render, then Repeat and Remove;
the seeds; the stream (A keeps the length, B lays its copy at the cut's end, the earlier places unmoved); each draft's own text; the bodies sent
(1414's, 1715's, 2690's and 1651's, the render's scores by §10.1's table); E's spans and the new take with its own arranged codes, the render in the
trash; the records, the place and the note; the drafts hidden at once and in the trash before the next step; the ledger, a failure, resume, discard,
Stop during an engine job and during the voice split; a full queue, the Arc's reset, a refused connection and a lost job waited out or sent again;
a restart of the lab in the middle of a step; /section/chains.
R/.venv/bin/python lab/test_section_chain.py"""
import io
import json
import shutil
import sys
import tempfile
import threading
import time
import urllib.error
from pathlib import Path

import numpy as np
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parent))
import section  # noqa: E402
import takeedit  # noqa: E402

bad = []
FPS = section.FPS


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got)[:1200] + ")"))
    if not ok:
        bad.append(what)


root = Path(tempfile.mkdtemp(prefix="seced-test-"))
out = root / "outputs"
trash = root / "trash"
out.mkdir()
trash.mkdir()
SR = 1000                                              # a small rate: the sound is only cut and joined here


def write_take(name, codes, extra=None, wav=True):
    d = out / name
    d.mkdir(parents=True, exist_ok=True)
    req = {"title": "Song", "lyrics": "[Verse]\nla", "seed": 777, "lm_seed": 5000, "semantic_tokens": ",".join(map(str, codes)), "duration": len(codes) / FPS,
           "cot": "full", "abc": "X:1\nM:4/4\nQ:1/4=120\nK:C\n", "abc_continue": False, "harmony": {"strength": 0}, "fade_out": 2.0,
           "semantic_sampling": {"max_tokens": len(codes), "min_tokens": len(codes) - 50, "temperature": 0.9}}
    req.update(extra or {})
    json.dump(req, open(d / "request.json", "w"))
    json.dump({"title": req["title"], "seconds": len(codes) / FPS, "format": "wav24"}, open(d / "meta.json", "w"))
    if wav:
        n = int(round(len(codes) / FPS * SR))
        sf.write(str(d / "audio.wav"), (np.arange(n)[:, None] % 97) / 97.0 * 0.5, SR, subtype="PCM_16")
    return d


SRC = "20261118-100000-01-song"
src_codes = [100 + i % 400 for i in range(60 * FPS)]   # a minute
write_take(SRC, src_codes, {"end_at": 58.0})

# ------------------------------------------------------------------ the fake engine
E = {"n": 0, "sent": [], "jobs": {}, "errors": [], "events": [], "hold": set(), "lost": set(), "cancelled": []}


class FakeHTTP(urllib.error.HTTPError):
    def __init__(self, code):
        super().__init__("http://engine", code, "x", {}, io.BytesIO(b'{"error": "fake"}'))


def engine(path, body=None):
    if path == "/synth":
        if E["errors"]:
            e = E["errors"].pop(0)
            if e == "refused":
                raise urllib.error.URLError("refused")
            raise FakeHTTP(e)
        E["n"] += 1
        jid, name = f"job{E['n']}", time.strftime("%Y%m%d-%H%M%S") + f"-{E['n']:03d}-made"   # the engine's names: its time first
        if body.get("semantic_tokens"):                # a replay: the codes given
            toks = [int(x) for x in body["semantic_tokens"].split(",")]
        else:                                          # sung on from the kept codes to its budget
            keep = [int(x) for x in str(body.get("semantic_keep") or "").split(",") if x]
            mt = (body.get("semantic_sampling") or {}).get("max_tokens")
            n = int(mt) if mt else round(body["duration"] * FPS)
            toks = keep + [10000 * E["n"] + i % 500 for i in range(max(0, n - len(keep)))]
        write_take(name, toks, dict(body, semantic_tokens=",".join(map(str, toks))))
        E["sent"].append(dict(body, _name=name, _job=jid))
        E["events"].append(("synth", name))
        E["jobs"][jid] = {"name": name, "polls": 0, "status": "running"}
        return {"id": jid}
    if path.startswith("/job?id="):
        q = path.split("=", 1)[1]
        jid = q.split("&")[0]
        j = E["jobs"].get(jid)
        if "&cancel=1" in path:
            E["cancelled"].append(jid)
            if j:
                j["status"] = "cancelled"
            return {"ok": True}
        if not j or jid in E["lost"]:
            raise FakeHTTP(404)
        j["polls"] += 1
        if j["status"] == "running" and jid not in E["hold"] and j["polls"] >= 2:
            j["status"] = "done"
        return {"status": j["status"], "takes": [j["name"]] if j["status"] == "done" else []}
    raise AssertionError(path)


# ------------------------------------------------------------------ the fake voice: the section's own lines, then the model's after its cut
VOICE = {"mode": "ok", "calls": 0}


def voice(wav, a, b, run):
    VOICE["calls"] += 1
    if VOICE["mode"] == "block":                       # the split running when Stop comes
        while not run["cancel"]:
            time.sleep(0.01)
        section._stopping(run)
    if VOICE["mode"] == "none":
        return "the voice could not be split (fake)"
    rq = json.load(open(Path(wav).parent / "request.json"))
    kb = len([x for x in rq["semantic_keep"].split(",") if x]) / FPS
    if "interlude" in rq["title"]:
        return [[kb - 6.0, kb - 0.5], [kb + 8.0, kb + 12.0]]   # the voice comes back 8 s after the cut
    lines = [a + 1.0, kb - 0.6]                        # its own lines (a is the cut's start less 0.5)
    lead = 5.0
    return [lines, [kb + lead, kb + lead + (lines[1] - lines[0])]]


class Col:
    posted = []
    WS = {"Songs": [SRC], "\U0001f48e Kept": [SRC]}

    @staticmethod
    def load(cfg):
        return {"workspaces": Col.WS, "locks": {}}

    @staticmethod
    def frozen_ws(d, w):
        return False

    @staticmethod
    def collection_post(cfg, outputs, body):
        Col.posted.append(body)
        if body.get("op") == "hide":
            E["events"].append(("hide", body["names"][0]))


def do_trash(names):
    for n in names:
        if (out / n).is_dir():
            shutil.move(str(out / n), str(trash / n))
        E["events"].append(("trash", n))


FROZEN = set()
section.setup(outputs=out, engine=engine, say=lambda s: None, frozen=lambda: FROZEN, trash=do_trash, collection=Col, config_dir=lambda: root,
              cpu=threading.Lock(), take_dir=lambda n: out / n, takeedit=takeedit, cache=root / "cache", voice=voice, yield_arc=lambda why: E["events"].append(("yield", why)))
section.CHAIN.update(poll=0.01, full_every=0.05, away_for=0.5, lost=2)


def wait(cid, what=("done", "failed", "cancelled"), t=60):
    end = time.time() + t
    while time.time() < end:
        st = section.job(cid)
        if st and st["status"] in what:
            return st
        time.sleep(0.02)
    return section.job(cid)


def codes(name):
    d = out / name if (out / name).is_dir() else trash / name
    return [int(x) for x in json.load(open(d / "request.json"))["semantic_tokens"].split(",") if x]


L_A = "[Verse]\nnew words\n\n[Chorus]\nla la\n\n[Bridge]\nbr"
L_ONCE = L_A + "\n\n[Chorus]\nla la again"
L_INT = L_ONCE + "\n\n[Interlude]"
L_FINAL = L_INT


def body(ops, **kw):
    b = {"name": SRC, "v": kw.get("v", "A"), "title": "Song · edits " + kw.get("v", "A"), "lyrics": L_FINAL, "lyrics_a": L_A, "ws": "Songs", "abc_after": "X:1\nM:4/4\nQ:1/4=120\nK:C\n|a|", "bar": 2.0, "ops": ops}
    b.update(kw)
    return b


def refused(what, b, needle=""):
    try:
        r = section.chain(b)
        check("refused: " + what, False, r)
    except ValueError as e:
        check("refused: " + what + (f" ({e})" if needle and needle not in str(e) else ""), needle in str(e), e)


# ------------------------------------------------------------------ refusals (§9.3's rules 2 to 7 and the body's checks)
rep = {"op": "replace", "a": 10.0, "b": 16.0, "section": "Chorus", "lines": [10.6, 15.4]}
once = {"op": "once", "a": 40.0, "b": 46.0, "section": "Chorus", "lines": [40.8, 45.2], "gap": 4, "lyrics": L_ONCE}
FROZEN.add(SRC)
refused("a take frozen with its workspace", body([rep]), "frozen")
FROZEN.clear()
refused("a sung stretch under two seconds", body([dict(rep, b=11.5, lines=[10.2, 11.0])]), "two seconds")
refused("a sung stretch past the take's end", body([dict(rep, a=58, b=62, lines=[58.5, 61])]), "inside the take")
refused("two sung stretches over each other by more than 0.25 s", body([rep, dict(rep, a=15.5, b=22, lines=[16.2, 21], section="Verse")]), "overlaps")
refused("a Remove reaching into a sung edit's stretch", body([rep, {"op": "remove", "spans": [[14.0, 20.0]], "section": "ins"}]), "overlaps")
check("allowed: a Remove that meets a sung edit's cut moved to its bar line", section._rules(section._ops(
    [rep, {"op": "remove", "spans": [[16.0, 20.0]], "section": "ins"}], 60), 60) is None)
refused("a place inside a removed stretch", body([dict(once, a=40, b=46), {"op": "remove", "spans": [[44.0, 50.0]], "section": "ins"}], lyrics_a=L_A), "overlaps")
refused("a Repeat's place inside a sung stretch", body([{"op": "copy", "spans": [[8.0, 12.0]], "section": "x"}, dict(rep, a=11.0, b=17.0, lines=[12.5, 16.5])]), "")
refused("a Remove that reaches the end beside Extend", body([{"op": "remove", "spans": [[55.0, 60.0]], "section": "Outro"}, {"op": "extend", "more": 30}]), "Extend goes on")
refused("two endings", body([{"op": "from", "at": 30.0}, {"op": "extend", "more": 30}]), "One ending")
refused("anything after a «from» cut", body([{"op": "from", "at": 30.0}, dict(rep, a=40, b=46, lines=[41, 45])]), "Nothing can go after")
refused("nine sung edits", body([dict(rep, a=2 + 6 * i, b=7 + 6 * i, lines=[2.5 + 6 * i, 6.5 + 6 * i]) for i in range(9)]), "Eight sung")
long_codes = [100 + i % 400 for i in range(850 * FPS)]
write_take("20261118-100500-01-long", long_codes)
refused("a new take past 15:00", dict(body([{"op": "copy", "spans": [[100.0, 200.0]], "section": "Chorus"}]), name="20261118-100500-01-long"), "15:00")
refused("an insertion's text with no block more than lyrics_a", body([dict(once, lyrics=L_A)]), "no block more")
refused("empty lyrics with a sung edit", body([rep], lyrics=" "), "lyrics are empty")
write_take("20261118-100600-01-nocodes", [], {"semantic_tokens": ""})
refused("a take that kept no music codes", dict(body([rep]), name="20261118-100600-01-nocodes"), "no music codes")
EDIT = "20261118-100700-01-remove-song"
write_take(EDIT, src_codes, {"edited": {"op": "remove", "from": SRC, "kept": [[0, 30], [40, 60]]}})
json.dump({"title": "Song", "seconds": 50.0}, open(out / EDIT / "meta.json", "w"))
refused("an edited take without its codes", dict(body([rep]), name=EDIT), "token map")
refused("an edited take with codes of the wrong length", dict(body([rep]), name=EDIT, codes=",".join(map(str, src_codes))), "against its 50.0 s")

# ------------------------------------------------------------------ the chain, end to end: A, A, B, B, the render, Repeat and Remove
E["events"].clear()
interlude = {"op": "interlude", "a": 20.0, "b": 26.0, "section": "Bridge", "lines": [20.8, 25.0], "gap": 7, "lyrics": L_INT}
line = {"op": "line", "a": 30.0, "b": 33.0, "section": "Verse 2 · line 3", "lines": [30.4, 32.6]}
copy = {"op": "copy", "spans": [[2.0, 6.0]], "section": "intro"}
remove = {"op": "remove", "spans": [[52.0, 54.0]], "section": "ins"}
code, r = section.chain(body([remove, once, rep, interlude, line, copy]))
check("POST /section/chain answers 202 with the chain's id and six steps (two A, two B, the render, the arrange)", code == 202 and r["steps"] == 6, (code, r))
code2, r2 = section.chain(body([rep]))
check("a second chain on a take while one runs: 409 with the running one's id", code2 == 409 and r2["id"] == r["id"], (code2, r2))
check("section.live() lists the chain while it runs (so /health keeps the lab busy)", any(x["id"] == r["id"] and x["kind"] == "chain" for x in section.live()))
st = wait(r["id"])
check("the chain is done with one take", st["status"] == "done" and st["versions"][0]["take"] and st["takes"] == [st["versions"][0]["take"]], st)
take = st["versions"][0]["take"]
synths = [s for s in E["sent"]]
check("the order: A ascending (10 s, then 30 s), B descending (46 s, then 26 s), then the render",
      [s.get("title", "").split(" · draft")[0].split("Song · ", 1)[-1] for s in synths[:4]] == ["Chorus anew", "Verse 2 · line 3 anew", "Chorus once more, after a breath", "an interlude after Bridge"] and "semantic_tokens" in synths[4] and len(synths) == 5,
      [s.get("title") for s in synths])
a1, a2, b1, b2, d = synths
check("A's drafts as 1414's: lyrics_a, the kept start to the cut, its length the cut's end and 4 s, no parent, end_at, fade or edited; the score and cot kept",
      a1["lyrics"] == L_A and a2["lyrics"] == L_A and a1["semantic_keep"] == ",".join(map(str, src_codes[:250])) and a1["duration"] == 20.0 and
      not any(k in a1 for k in ("parent", "end_at", "fade_in", "fade_out", "edited", "semantic_tokens")) and a1["abc"].startswith("X:1") and a1["cot"] == "full" and
      a1["nar_pieces"] is True and a1["lm_seed"] != 5000, {k: a1.get(k) for k in ("lyrics", "duration", "abc", "cot", "lm_seed")})
j1 = codes(a1["_name"])[:400] + src_codes[400:]
j2 = codes(a2["_name"])[:825] + j1[825:]
check("  the second A draft keeps the stream so far to its cut: the first's new codes to 16 s, the take's own to 30 s",
      a2["semantic_keep"] == ",".join(map(str, j1[:750])))
check("B's drafts as 1715's and 1717's: cot off, no abc, abc_continue, plan_only or harmony, its tokens set, lm_batch 1, its own step's text",
      b1["cot"] == "off" and not any(k in b1 for k in ("abc", "abc_continue", "plan_only", "harmony", "edited")) and b1["lyrics"] == L_ONCE and b2["lyrics"] == L_INT and
      b1["semantic_sampling"]["min_tokens"] == round(46 * FPS) + round(4 * FPS) + round(6 * FPS) and b1["lm_batch_size"] == 1, {k: b1.get(k) for k in ("cot", "lyrics", "semantic_sampling")})
check("B's seeds: the take's + 1 for version A, both of them; A's new", b1["lm_seed"] == 5001 and b2["lm_seed"] == 5001 and a1["lm_seed"] not in (5000, 5001))
led_ins = section.job(r["id"])
s_steps = st["steps"]
L1, L2 = s_steps[2]["L"], s_steps[3]["L"]
stream = codes(d["_name"])
n3, n4 = codes(b1["_name"]), codes(b2["_name"])
want = j2[:650] + n4[650:650 + L2] + j2[650:1150] + n3[1150:1150 + L1] + j2[1150:]
check("the stream: A kept the length, B laid its copies in at the cuts' ends (46 s first, then 26 s), the earlier places unmoved; the render sings all of it",
      stream == want and len(stream) == len(src_codes) + L1 + L2, (len(stream), len(want), L1, L2))
check("  B's first draft (46 s) kept the stream after both A's to its cut; the second (26 s) kept it to 26 s, the first insertion after it",
      b1["semantic_keep"] == ",".join(map(str, j2[:1150])) and b2["semantic_keep"] == ",".join(map(str, j2[:650])))
check("the render as 1414's replay: the final lyrics, parent the source, its own sound seed, end_at moved by what was put in, abc out and cot off (B put in)",
      d["lyrics"] == L_FINAL and d["parent"] == SRC and d["seed"] == 777 and abs(d["end_at"] - (58.0 + (L1 + L2) / FPS)) < 0.01 and
      not any(k in d for k in ("abc", "abc_continue", "harmony", "semantic_keep", "edited")) and d["cot"] == "off",
      {k: d.get(k) for k in ("end_at", "cot", "abc", "seed", "parent")})
check("  the render hidden at once (an arrange pass follows) and in the trash after it", ("hide", d["_name"]) in E["events"] and (trash / d["_name"]).is_dir() and not (out / d["_name"]).exists())
ev = E["events"]
ok_drafts = all(ev.index(("hide", x["_name"])) < ev.index(("trash", x["_name"])) < (ev.index(("synth", y["_name"])) if y else 10 ** 9)
                for x, y in zip(synths[:4], synths[1:5] + [None]))
check("drafts: each hidden the moment it lands and in the trash before the next step is sent", ok_drafts, ev)
check("the writer leaves the Arc before every engine step (five)", sum(1 for e in ev if e[0] == "yield") == 5, ev)
e_spans = s_steps[5]["spans"]
R = len(stream) / FPS
mv = lambda t: t + (sum(x for p, x in ((46, L1), (26, L2)) if p <= t) / FPS)   # noqa: E731
exp = [[0.0, mv(6.0)], [mv(2.0), mv(52.0)], [mv(54.0), R]]
check("E's spans: moved by the insertions at or before them, the copy after its stretch, the removal left out, merged where they meet",
      all(abs(a - b) < 0.01 for x, y in zip(e_spans, exp) for a, b in zip(x, y)) and len(e_spans) == 3, (e_spans, exp))
tc = codes(take)
treq = json.load(open(out / take / "request.json"))
tmeta = json.load(open(out / take / "meta.json"))
check("the new take: its own codes, the render's arranged by the same spans in frames; parent the source and no edited; the score after; the final title",
      tc == [c for a, b in e_spans for c in stream[round(a * FPS):round(b * FPS)]] and treq["parent"] == SRC and "edited" not in treq and
      treq["abc"].endswith("|a|") and treq["title"] == "Song · edits A" and abs(len(tc) / FPS - tmeta["seconds"]) <= 3 / FPS,
      (len(tc), tmeta.get("seconds"), treq.get("parent")))
check("  its sound the arranged render's (takeedit.arrange: Σ spans)", abs(sf.info(str(out / take / "audio.wav")).duration - sum(b - a for a, b in e_spans)) < 0.01)
se = tmeta.get("section_editor") or {}
check("meta.json's section_editor: from, v, the six ops with their source stretches, render «replay»", se.get("from") == SRC and se.get("v") == "A" and len(se.get("ops", [])) == 6 and
      se.get("render") == "replay" and all("src" in o for o in se["ops"]), se)
mk = section.mark(take)
check("replaced.json: kind chain, the sung parts in the new take's own time (through E)", mk and mk["kind"] == "chain" and len(mk["parts"]) == 4 and
      all(0 <= p["a"] < p["b"] <= tmeta["seconds"] + 0.01 for p in mk["parts"]), mk)
check("  the replaced Chorus lands 4 s later (the copy of 2–6 s before it)", any(abs(p["a"] - 14.0) < 0.01 and p["section"] == "Chorus anew" for p in mk["parts"]), mk["parts"])
adds = [p for p in Col.posted if p.get("op") == "ws-add" and p["names"] == [take]]
notes = [p for p in Col.posted if p.get("op") == "note" and p["names"] == [take]]
check("placed in the source's open workspace, never the 💎 one; a note lists the edits", [p["workspace"] for p in adds] == ["Songs"] and notes and
      notes[0]["text"].startswith("Section editor, version A: 1) intro twice") and "The rest is " + SRC in notes[0]["text"], (adds, notes[:1]))
check("the source never written to", codes(SRC) == src_codes and json.load(open(out / SRC / "meta.json"))["seconds"] == 60.0)
ch = section.chains(SRC)["chains"]
check("GET /section/chains: the done chain with its take, kept 7 days", any(c["id"] == r["id"] and c["status"] == "done" and c["take"] == take for c in ch), ch)
left = sorted(n for n in [x.name for x in out.iterdir()] if not n.startswith("."))
check("nothing else new in outputs (the drafts and the render in the trash)", set(left) == {SRC, "20261118-100500-01-long", "20261118-100600-01-nocodes", EDIT, take}, left)

# ------------------------------------------------------------------ an interlude at a «from» cut, and one 0.04 s after it: both kept (t′ at or before)
for k, place in enumerate((30.0, 30.04)):
    E["sent"].clear()
    intr = {"op": "interlude", "a": 24.0, "b": place, "section": "Bridge", "lines": [24.5, 29.0], "gap": 7, "lyrics": L_INT}
    code, rr = section.chain(body([intr, {"op": "from", "at": 30.0}], v="B"))
    st2 = wait(rr["id"])
    L = st2["steps"][0]["L"]
    c = E["sent"][-1]
    keep = len(c["semantic_keep"].split(","))
    check(f"an interlude whose place is {'at' if not k else '0.04 s after'} the «from» cut: kept, the ending keeps the stream to t′ = {place} + L",
          st2["status"] == "done" and keep == round((place + L / FPS) * FPS) and "semantic_tokens" not in c, (st2["status"], keep, place, L))
    check("  the ending's budget raised by ΣL (max and min tokens), its duration too; cot off and no score (B put in); parent the source; end_at out",
          c["semantic_sampling"]["max_tokens"] == len(src_codes) + L and c["semantic_sampling"]["min_tokens"] == len(src_codes) - 50 + L and
          abs(c["duration"] - (60 + L / FPS)) < 0.06 and c["cot"] == "off" and "abc" not in c and c["parent"] == SRC and "end_at" not in c and c["fade_out"] == 2.0 and
          c["lm_batch_size"] == 1 and c["synth_batch_size"] == 1 and c["lyrics"] == L_FINAL, {kk: c.get(kk) for kk in ("semantic_sampling", "duration", "cot")})
    check("  the ending IS the take: nothing rendered after it; its seed B's version index + 1 for the draft", len(E["sent"]) == 2 and E["sent"][0]["lm_seed"] == 5002,
          [x.get("lm_seed") for x in E["sent"]])

# ------------------------------------------------------------------ Extend (1651's body) and the ending alone
E["sent"].clear()
code, rr = section.chain(body([{"op": "extend", "more": 30}], lyrics=L_FINAL + "\n\n[Outro]\nbye", lyrics_a="", window_held=True))
st3 = wait(rr["id"])
c = E["sent"][-1]
check("Extend: the whole stream kept, its length min(900, the take's + more), max and min tokens as 1651 raises them, abc out, cot off, nar_pieces when held",
      st3["status"] == "done" and len(c["semantic_keep"].split(",")) == len(src_codes) and c["duration"] == 90 and c["semantic_sampling"]["max_tokens"] == 90 * FPS and
      c["semantic_sampling"]["min_tokens"] == len(src_codes) + round(30 * FPS * 0.75) and "abc" not in c and c["cot"] == "off" and c["nar_pieces"] is True and
      "end_at" not in c and c["parent"] == SRC and c["lyrics"].endswith("bye") and len(E["sent"]) == 1, {k: c.get(k) for k in ("duration", "semantic_sampling", "cot")})

# ------------------------------------------------------------------ nothing sung: 1714's own take, edited.from the source
code, rr = section.chain(body([{"op": "remove", "spans": [[10.0, 20.0]], "section": "Verse"}], lyrics="", lyrics_a="", v="C"))
st4 = wait(rr["id"])
t4 = st4["versions"][0]["take"]
r4 = json.load(open(out / t4 / "request.json"))
check("Repeat and Remove alone: takeedit.make's arrange on the take itself, edited.from the source, nothing sent to the engine",
      st4["status"] == "done" and r4["edited"]["op"] == "arrange" and r4["edited"]["from"] == SRC and abs(sf.info(str(out / t4 / "audio.wav")).duration - 50) < 0.01, r4.get("edited"))

# ------------------------------------------------------------------ HERESY 2945: the words the cuts leave: the new take's lyrics, the Writer's sub-version
import creator_versions  # noqa: E402
section.setup(kit=root)
src_title = json.load(open(out / SRC / "request.json")).get("title") or SRC
kept = creator_versions.post(root, {"op": "keep", "title": src_title, "lyrics": "[Verse]\nv\n\n[Chorus]\nla la", "takes": [SRC], "why": "generate"})
n0 = kept["versions"][-1]["n"]
time.sleep(1.1)                                  # takeedit names a take by its second: the one before was made this second
code, rr = section.chain(body([{"op": "remove", "spans": [[10.0, 20.0]], "section": "Verse"}], lyrics="", lyrics_a="", v="L", lyrics_after="[Chorus]\nla la"))
st45 = wait(rr["id"])
t45 = st45["versions"][0]["take"]
r45 = json.load(open(out / t45 / "request.json"))
v45 = creator_versions.get(root, title=src_title)["versions"][-1]
check("Remove with the words it leaves (2945): the new take's lyrics are them; the Writer keeps them as a sub-version from the source's version, the take with it",
      st45["status"] == "done" and r45["lyrics"] == "[Chorus]\nla la" and v45["lyrics"] == "[Chorus]\nla la" and v45.get("from") == n0 and v45["why"] == "section" and
      v45["takes"] == [t45] and (v45["version"].endswith(".1") or v45["version"] == "1"), {"lyrics": r45.get("lyrics"), "version": v45})

# ------------------------------------------------------------------ HERESY 2887: Insert a part, the ninth edit: a copy of a score part at a gap
ins = {"op": "insert", "spans": [[20.0, 26.0]], "at": 40.0, "section": "Bridge", "after": "Verse 2"}
near = lambda xs, ys: len(xs) == len(ys) and all(abs(a - b) < 0.01 for x, y in zip(xs, ys) for a, b in zip(x, y))   # noqa: E731
sp, _ = section._spans({"ins": []}, section._ops([ins], 60), 60)
check("Insert: the copy goes in at its place, the music before and after it kept", near(sp, [[0, 40], [20, 26], [40, 60]]), sp)
sp, _ = section._spans({"ins": []}, section._ops([dict(ins, at=0.0)], 60), 60)
check("  at the start: the copy first, then the whole take", near(sp, [[20, 26], [0, 60]]), sp)
sp, _ = section._spans({"ins": []}, section._ops([dict(ins, at=52.0), {"op": "remove", "spans": [[52.0, 54.0]], "section": "ins"}], 60), 60)
check("  at a removal's start: the copy before the part taken out", near(sp, [[0, 52], [20, 26], [54, 60]]), sp)
sp, _ = section._spans({"ins": [{"p": 30.0, "L": 100}]}, section._ops([ins], 60), 64)
check("  moved, as every stretch is, by an insertion (4 s at 30 s) before its place, not its part's (before it)", near(sp, [[0, 44], [20, 26], [44, 64]]), sp)
check("allowed: Replace the section before a gap and Insert a part in that gap: one assembly (the Insert takes no section)", section._rules(section._ops(
    [dict(rep, a=34.0, b=40.0, lines=[34.5, 39.5], section="Verse 2"), ins], 60), 60) is None)
refused("an Insert's place inside a sung stretch", body([dict(rep, a=36.0, b=44.0, lines=[36.5, 43.5]), ins]), "go in inside")
refused("an Insert's place inside a removed stretch", body([ins, {"op": "remove", "spans": [[38.0, 44.0]], "section": "ins"}], lyrics="", lyrics_a=""), "go in inside")
refused("an Insert after a re-sing to the end", body([{"op": "from", "at": 30.0}, ins], lyrics_a=""), "Nothing can go after")
refused("an Insert of two stretches", body([dict(ins, spans=[[2.0, 6.0], [20.0, 26.0]])], lyrics="", lyrics_a=""), "one [start, end]")
refused("an Insert's place past the take's end", body([dict(ins, at=75.0)], lyrics="", lyrics_a=""), "inside the take")
time.sleep(1.1)                                      # takeedit names a take by its second: not the second of the take before
code, rr = section.chain(body([ins], lyrics="", lyrics_a="", v="I"))
st9 = wait(rr["id"])
if not st9["versions"][0].get("take"):
    print("  insert alone:", st9.get("status"), st9.get("why"), [(s.get("op"), s.get("status"), s.get("error")) for s in st9.get("steps", [])])
t9 = st9["versions"][0].get("take") or ""
r9 = json.load(open(out / t9 / "request.json")) if t9 else {}
check("Insert alone: nothing sung, takeedit.make's arrange on the take itself, 6 s longer, edited.from the source; its title says it",
      st9["status"] == "done" and t9 and r9["edited"]["op"] == "arrange" and r9["edited"]["from"] == SRC and abs(sf.info(str(out / t9 / "audio.wav")).duration - 66) < 0.01 and
      section._said(section._ops([ins], 60)[0]) == "Bridge after Verse 2", (st9.get("why"), r9.get("edited")))

# ------------------------------------------------------------------ an edited source sings from the codes the page sends
E["sent"].clear()
mine = src_codes[:30 * FPS] + src_codes[40 * FPS:]
code, rr = section.chain(dict(body([rep]), name=EDIT, codes=",".join(map(str, mine)), lyrics=L_A, lyrics_a=L_A))
st5 = wait(rr["id"])
check("an edited take: the draft keeps the page's codes (its token map's), the render sings them; edited never sent",
      st5["status"] == "done" and E["sent"][0]["semantic_keep"] == ",".join(map(str, mine[:250])) and len(codes(E["sent"][1]["_name"])) == len(mine) and
      not any("edited" in x for x in E["sent"]), st5.get("why"))

# ------------------------------------------------------------------ a failure keeps the ledger; resume sings no done step again
E["sent"].clear()
VOICE["mode"] = "none"
code, rr = section.chain(body([rep, once], v="D"))
st6 = wait(rr["id"])
led = json.load(open(root / "cache" / "section-chain" / (rr["id"] + ".json")))
check("a failed step stops the chain and says the step and the reason; the ledger is kept with the stream after step 1",
      st6["status"] == "failed" and st6["steps"][1]["status"] == "failed" and "voice could not be split" in st6["steps"][1]["error"] and led["next"] == 1 and led["status"] == "failed",
      (st6["status"], [s["status"] for s in st6["steps"]], led.get("next")))
check("  its draft in the trash, nothing left hidden", all((trash / x["_name"]).is_dir() for x in E["sent"]), [x["_name"] for x in E["sent"]])
n0 = len(E["sent"])
VOICE["mode"] = "ok"
code, rr2 = section.chain({"resume": rr["id"]})
st7 = wait(rr["id"])
check("resume: 202 from step 2; step 1 not sung again; done", code == 202 and rr2["from"] == 2 and st7["status"] == "done" and len(E["sent"]) == n0 + 2 and
      "semantic_tokens" not in E["sent"][n0], (code, rr2, st7["status"], len(E["sent"]) - n0))

# ------------------------------------------------------------------ discard: the render and the drafts it names to the trash, the ledger gone
VOICE["mode"] = "none"
code, rr = section.chain(body([rep, once, {"op": "remove", "spans": [[52.0, 54.0]], "section": "ins"}], v="E"))
wait(rr["id"])
lp = root / "cache" / "section-chain" / (rr["id"] + ".json")
code, d8 = section.chain({"discard": rr["id"]})
check("discard: 200, the ledger gone", code == 200 and not lp.exists(), (code, d8))

# ------------------------------------------------------------------ Stop during an engine job, and during the voice split
VOICE["mode"] = "ok"
E["hold"] = {f"job{E['n'] + 1}"}
code, rr = section.chain(body([rep], v="F"))
time.sleep(0.3)
section.cancel(rr["id"])
st9 = wait(rr["id"])
check("Stop during an engine job: the engine's job asked to stop, the step and the chain «cancelled»",
      st9["status"] == "cancelled" and st9["steps"][0]["status"] == "cancelled" and f"job{E['n']}" in E["cancelled"], (st9["status"], E["cancelled"]))
E["hold"] = set()
VOICE["mode"] = "block"
calls0 = VOICE["calls"]
code, rr = section.chain(body([once], v="G", lyrics_a=L_A))
end = time.time() + 10
while time.time() < end and VOICE["calls"] == calls0:
    time.sleep(0.02)
section.cancel(rr["id"])
st10 = wait(rr["id"])
check("Stop during the voice split (no engine job then): the chain «cancelled», its draft in the trash", st10["status"] == "cancelled" and
      (trash / E["sent"][-1]["_name"]).is_dir(), (st10["status"], st10["steps"][0]))
VOICE["mode"] = "ok"

# ------------------------------------------------------------------ a full queue, the Arc being reset and a refused connection waited out; a lost job sent again
E["errors"] = [429, 503, "refused"]
code, rr = section.chain(body([rep], v="H"))
st11 = wait(rr["id"])
check("429, 503 and a refused connection at sending: waited out, never a failure", st11["status"] == "done" and not E["errors"], st11.get("why"))
n0 = E["n"]
E["lost"] = {f"job{n0 + 1}"}
code, rr = section.chain(body([rep], v="I"))
st12 = wait(rr["id"])
check("a step lost to an engine restart: sent once more by itself (two /synth for the step), then done", st12["status"] == "done" and E["n"] == n0 + 3, (st12["status"], E["n"] - n0))
E["lost"] = set()

# ------------------------------------------------------------------ a restart of the lab in the middle of a step: its take found, not sung again
E["hold"] = {f"job{E['n'] + 2}"}                      # the render's job stays running: the lab «stops» while it runs
code, rr = section.chain(body([rep], v="J"))
end = time.time() + 10
while time.time() < end and not (section.job(rr["id"]) or {}).get("step") == 2:
    time.sleep(0.02)
time.sleep(0.2)
lp = root / "cache" / "section-chain" / (rr["id"] + ".json")
cut = json.load(open(lp))
section.RUNS[rr["id"]]["cancel"] = True             # the old thread goes (as if the lab were gone); the ledger is put back as it was
wait(rr["id"])
json.dump(cut, open(lp, "w"))
section.LIVE.pop(rr["id"], None)
ch = section.chains(SRC)["chains"]
check("/section/chains says a chain cut by a restart «cut», at its step", any(c["id"] == rr["id"] and c["status"] == "cut" and c["step"] == 2 for c in ch), ch)
jid = cut["job"]
E["jobs"][jid]["status"] = "done"
E["hold"] = set()
n0 = E["n"]
code, rr2 = section.chain({"resume": rr["id"]})
st13 = wait(rr["id"])
check("resume after a restart: the step's take found by its engine job, not sung again", code == 202 and st13["status"] == "done" and E["n"] == n0, (code, st13["status"], E["n"] - n0))
# the same, the engine's job forgotten: found by its title in outputs/
E["hold"] = {f"job{E['n'] + 2}"}
code, rr = section.chain(body([rep], v="K"))
end = time.time() + 10
while time.time() < end and not (section.job(rr["id"]) or {}).get("step") == 2:
    time.sleep(0.02)
time.sleep(0.2)
lp = root / "cache" / "section-chain" / (rr["id"] + ".json")
cut = json.load(open(lp))
section.RUNS[rr["id"]]["cancel"] = True
wait(rr["id"])
json.dump(cut, open(lp, "w"))
section.LIVE.pop(rr["id"], None)
landed = E["jobs"][cut["job"]]["name"]
if not (out / landed).is_dir():                     # the cancel above sent it to the trash: it «landed» while the lab was down
    shutil.move(str(trash / landed), str(out / landed))
E["lost"] = {cut["job"]}
E["hold"] = set()
n0 = E["n"]
code, rr2 = section.chain({"resume": rr["id"]})
st14 = wait(rr["id"])
check("  the engine's job forgotten: the take found by its title and parent in outputs/, not sung again", st14["status"] == "done" and E["n"] == n0 and
      st14["versions"][0]["take"] == landed, (st14["status"], E["n"] - n0, st14["versions"][0].get("take"), landed))
E["lost"] = set()

# ------------------------------------------------------------------ HERESY 2895: a take with no score of its own sings its section to the one written from its sound
DIRECT = "20261118-101000-01-direct"
write_take(DIRECT, src_codes, {"cot": "off", "abc": "", "abc_continue": False})
E["sent"].clear()
code, rd = section.chain(dict(body([rep]), name=DIRECT, v="D"))
std = wait(rd["id"])
ad = E["sent"][0] if E["sent"] else {}
check("(2895) a Direct take with no score anywhere: its draft as before, cot off and no score", std["status"] == "done" and ad.get("cot") == "off" and not ad.get("abc"),
      {k: ad.get(k) for k in ("cot", "abc")})
HEARD = "X:1\nT:\nM:4/4\nL:1/16\nQ:1/4=118\nK:C\n% verse\nV: Vocal\nC4D4E4F4|\n"
(out / DIRECT / "score-from-sound.abc").write_text(HEARD, encoding="utf-8")
time.sleep(1.1)
E["sent"].clear()
code, rd = section.chain(dict(body([rep]), name=DIRECT, v="E"))
std = wait(rd["id"])
ad = E["sent"][0] if E["sent"] else {}
check("  with a score written from its sound: the draft sings to it, cot full, that score whole, no harmony; the step says so",
      std["status"] == "done" and ad.get("cot") == "full" and ad.get("abc") == HEARD and ad.get("abc_continue") is False and "harmony" not in ad and
      ad.get("semantic_keep") == ",".join(map(str, src_codes[:250])) and std["steps"][0].get("score") == "written from its sound", {k: ad.get(k) for k in ("cot", "abc", "harmony")})
E["sent"].clear()
code, rp = section.chain(dict(body([rep]), v="F"))
stp = wait(rp["id"])
ap = E["sent"][0] if E["sent"] else {}
check("  a planned take keeps its own score, whatever is written beside it", stp["status"] == "done" and ap.get("abc", "").startswith("X:1\nM:4/4") and ap.get("cot") == "full",
      {k: ap.get(k) for k in ("cot", "abc")})
(out / DIRECT / "score-from-sound.abc").write_text("not a score", encoding="utf-8")
check("  a file that is no score is not one", section._score_heard(DIRECT) is None)

shutil.rmtree(root, ignore_errors=True)
print("test_section_chain:", "FAILED " + ", ".join(bad) if bad else "all passed")
sys.exit(1 if bad else 0)
