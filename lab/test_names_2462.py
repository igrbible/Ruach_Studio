"""HERESY 2462: one rule for every name (lab/name_rule.py, the page's HeresyNames in heresy-dialog.js), held where names are made or renamed.
python3 lab/test_names_2462.py"""
import glob
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import name_rule as N  # noqa: E402
import collection as C  # noqa: E402
import refiner_profiles  # noqa: E402
import daw_mixes  # noqa: E402
import pianoteq_live  # noqa: E402

bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got) + ")"))
    if not ok:
        bad.append(what)


def refused(fn, *a, has=""):
    try:
        fn(*a)
    except ValueError as e:
        return has in str(e)
    return False


NAMES = ["A/B", "🧪 Чтец · ok", ".hidden", "Крик.", "x\x07y", "Psalm 23: Shepherd", "a" * 90, " спокойно ", "Где Ты?", "🗣 Drama 3 / Higgs",
         "x\u2028y", "back\\slash", "star*", "tilde~", "<tag>", 'say "hi"', "pipe|", "👨\u200d👩\u200d👧 семья", "🧪 Чтец · A/B вслепую", "", "...",
         "Tsunami Wave 1.5 эп · 0.6/0.5", "ФОСФОРИДА. Манифест. Крик.", "ok\u200dzwj", "\u202eevil"]
OPTS = [(80, False), (56, False), (60, True), (0, False)]

print("the rule")
check("/ refused, the name said first", N.refusal("A/B") == "“A/B”: a name cannot hold /", N.refusal("A/B"))
check("every forbidden one named, in the rule's order", N.refusal('a/b\\c*d~e?f:g"h<i>j|') == '“a/b\\c*d~e?f:g"h<i>j|”: a name cannot hold / \\ * ~ ? : " < > |')
check("a control character refused", "control" in N.refusal("x\x07y") and "control" in N.refusal("x\u2028y") and "control" in N.refusal("\u202eevil"))
check("emoji with their joiner pass", N.refusal("👨\u200d👩\u200d👧 семья") == "" and N.refusal("🧪 Чтец · ok") == "")
check("a dot first refused, a dot last kept (his presets end so)", "dot" in N.refusal(".hidden") and N.refusal("ФОСФОРИДА. Манифест. Крик.") == "")
check("a file's name never ends with a dot", "end with a dot" in N.refusal("Крик.", file=True))
check("the length its place's", "80 characters" in N.refusal("a" * 90) and N.refusal("a" * 90, 0) == "")
check("spaces at the edges trimmed, not refused", N.refusal(" спокойно ") == "" and N.check(" спокойно ") == "спокойно")
check("cleaned: / as -, : as ·, the rest out", N.cleaned("Tsunami Wave 1.5 эп · 0.6/0.5") == "Tsunami Wave 1.5 эп · 0.6-0.5" and N.cleaned("Psalm 23: Shepherd") == "Psalm 23 · Shepherd"
      and N.cleaned("Где Ты?") == "Где Ты", [N.cleaned(x) for x in ("Tsunami Wave 1.5 эп · 0.6/0.5", "Psalm 23: Shepherd", "Где Ты?")])
check("a cleaned name passes the rule", all(not N.refusal(N.cleaned(x, m, f), m, f) for x in NAMES for m, f in OPTS if N.cleaned(x, m, f)))

print("the page says the same, letter for letter")
node = shutil.which("node") or (sorted(glob.glob(os.path.expanduser("~/.nvm/versions/node/v2*/bin/node"))) or [None])[-1]
js = str(HERE.parent / "build/tools/console/heresy-dialog.js")
if not node or not os.path.isfile(js):
    check("node and heresy-dialog.js are there", False, (node, js))
else:
    prog = ("global.window={};global.document={};require(process.argv[1]);const H=window.HeresyNames;const io=JSON.parse(process.argv[2]);"
            "console.log(JSON.stringify(io.map(([n,m,f])=>[H.refusal(n,{max:m,file:f}),H.cleaned(n,{max:m,file:f})])));")
    cases = [[x, m, f] for x in NAMES for m, f in OPTS]
    out = json.loads(subprocess.run([node, "-e", prog, js, json.dumps(cases)], capture_output=True, text=True, timeout=60).stdout)
    py = [[N.refusal(x, m, f), N.cleaned(x, m, f)] for x, m, f in cases]
    diff = [(c, o, p) for c, o, p in zip(cases, out, py) if o != p]
    check(f"{len(cases)} names × options: refusal and cleaned alike in Python and JS", not diff, diff[:3])
    check("the page says the rule's characters", '"/\\\\*~?:\\"<>|"' in json.dumps(N.FORBIDDEN) and N.FORBIDDEN == '/\\*~?:"<>|')

print("the Library")
with tempfile.TemporaryDirectory() as tmp:
    kit = Path(tmp)
    cfg, out = kit / "user", kit / "outputs"
    cfg.mkdir()
    for n in ("t1", "t2"):
        (out / n).mkdir(parents=True)
        (out / n / "meta.json").write_text(json.dumps({"title": n, "created": 1}), encoding="utf-8")
    post = lambda d: C.collection_post(cfg, out, d)   # noqa: E731
    check("ws-create «A/B» refused", refused(post, {"op": "ws-create", "workspace": "A/B"}, has="cannot hold /"))
    check("ws-create «Songs: live» refused", refused(post, {"op": "ws-create", "workspace": "Songs: live"}, has="cannot hold :"))
    check("ws-add into «?» refused", refused(post, {"op": "ws-add", "workspace": "Why?", "names": ["t1"]}, has="cannot hold ?"))
    check("ws-move into «*» refused", refused(post, {"op": "ws-move", "workspace": "star*", "names": ["t1"]}, has="cannot hold *"))
    post({"op": "ws-create", "workspace": "Drama 3"})
    post({"op": "ws-create", "workspace": "Drama 3 / Higgs"})
    check("« / » stays the section mark: «Drama 3 / Higgs» a section", "Drama 3 / Higgs" in C.load(cfg)["workspaces"])
    check("a section's own / refused", refused(post, {"op": "ws-create", "workspace": "Drama 3 / A/B"}, has="cannot hold /"))
    check("a section renamed to «x~y» refused", refused(post, {"op": "ws-rename", "workspace": "Drama 3 / Higgs", "to": "Drama 3 / x~y"}, has="cannot hold ~"))
    check("a top renamed to «.x» refused", refused(post, {"op": "ws-rename", "workspace": "Drama 3", "to": ".x"}, has="begin with a dot"))
    post({"op": "ws-rename", "workspace": "Drama 3", "to": "Drama 3 · Higgs"})
    check("a good rename goes, its section with it", "Drama 3 · Higgs / Higgs" in C.load(cfg)["workspaces"])
    check("a merge into «a|b» refused", refused(post, {"op": "ws-merge", "workspace": "Drama 3 · Higgs / Higgs", "to": "a|b"}, has="cannot hold |"))
    # a name already there (made before the rule) keeps its takes, its sections and its renames away
    d = C.load(cfg)
    d["workspaces"]["🧪 Чтец · A/B вслепую"] = ["t1"]
    (cfg / "collection.json").write_text(json.dumps(d), encoding="utf-8")
    post({"op": "ws-add", "workspace": "🧪 Чтец · A/B вслепую", "names": ["t2"]})
    check("an old «A/B» workspace takes takes as it is", sorted(C.load(cfg)["workspaces"]["🧪 Чтец · A/B вслепую"]) == ["t1", "t2"])
    post({"op": "ws-create", "workspace": "🧪 Чтец · A/B вслепую / ухо"})
    check("and a section of good name", "🧪 Чтец · A/B вслепую / ухо" in C.load(cfg)["workspaces"])
    post({"op": "ws-rename", "workspace": "🧪 Чтец · A/B вслепую", "to": "🧪 Чтец · A-B вслепую"})
    check("and is renamed to a good name, its section with it", "🧪 Чтец · A-B вслепую / ухо" in C.load(cfg)["workspaces"])
    check("an album «x/y» refused", refused(post, {"op": "album-create", "album": "x/y", "names": ["t1"]}, has="cannot hold /"))
    check("an album of 61 refused, not cut", refused(post, {"op": "album-create", "album": "a" * 61, "names": ["t1"]}, has="60 characters"))
    post({"op": "album-create", "album": "Крик.", "names": ["t1"]})
    check("an album «Крик.» made", any(a["name"] == "Крик." for a in C.load(cfg)["albums"]))
    check("an album renamed «a:b» refused", refused(post, {"op": "album-rename", "album": "Крик.", "to": "a:b"}, has="cannot hold :"))

    print("profiles, mixes, Pianoteq")
    check("a profile of the Refiner «a/b» refused", refused(refiner_profiles.save, cfg, "a/b", {"fields": {}}, has="cannot hold /"))
    refiner_profiles.save(cfg, "Фосфорида. Манифест. Крик.", {"fields": {}})
    check("a profile of the Refiner with dots kept", any(p["name"] == "Фосфорида. Манифест. Крик." for p in refiner_profiles.load(cfg)["profiles"]))
    sd = kit / "set"
    sd.mkdir()
    check("a mix «a?b» refused", refused(daw_mixes.save_as, sd, "a?b", {}, has="cannot hold ?"))
    check("a Pianoteq preset «x.» refused (a file)", refused(pianoteq_live.keep, kit, {}, "Ruach.", has="end with a dot"))

print("the lab's entry points read the rule (source)")
lab = (HERE / "lab.py").read_text(encoding="utf-8")
rd = (HERE / "reader.py").read_text(encoding="utf-8")
check("/import: a title given checked, the workspace before the take is made", "name_rule.check(title, 200)" in lab and "collection.fresh_parts(collection.load(config_dir()), collection.ws_name(workspace))" in lab)
check("presets: a new name checked", "name_rule.check(name, 120)" in lab)
check("the Narrator: a title given and a voice's name checked, the workspace before the reading", "name_rule.check(given, 120)" in rd and "name_rule.check(name, 60)" in rd and "C.fresh_parts(C.load(H[\"config_dir\"]())" in rd)

print(f"\n{'FAILED: ' + str(len(bad)) if bad else 'all passed'}")
sys.exit(1 if bad else 0)
