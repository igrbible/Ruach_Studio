"""HERESY 2952 (Viktor 23.11.2026, «Весь YuE2»): an install brings the whole of YuE2 on Linux (fetch-models.sh), Windows and Mac
(launcher/fetch_models.py): the default backbone and m-a-p's own at the quant, both decoders, the transcriber in F32 and its Refined mode at
its own pin with its LICENSE and NOTICE; an update brings the transcriber and Refined once; Engine -> Models on Windows without Git for Windows
fetches the transcriber through fetch_models.py instead of failing. Offline: nothing is downloaded, the plans are read, not asked of Hugging Face.
    .venv/bin/python lab/test_base_set_2952.py"""
import io, os, sys, tempfile, contextlib
from pathlib import Path
LAB = Path(__file__).resolve().parent
KIT = LAB.parent
sys.path.insert(0, str(KIT / "launcher"))
sys.path.insert(0, str(LAB))
import fetch_models as fm
import weights
import paths

ok = 0
def check(cond, what):
    global ok
    if not cond:
        print("FAIL", what); sys.exit(1)
    ok += 1; print("PASS", what)

# ---- launcher/fetch_models.py: the plan it asks for, with models_plan.py stubbed (every file «get», RS-TW present at the quant)
calls = []
def fake_plan(entries):
    calls.append(list(entries))
    return [("get", 1, e[0], e[1], e[2], e[3], e[4]) for e in entries], (len(entries), len(entries), -1)
fm.plan = fake_plan

def asked(argv):
    calls.clear()
    with contextlib.redirect_stdout(io.StringIO()):
        fm.main(argv + ["--plan"])
    return [e[2] for e in calls[-1]]

refined_pin = fm.rev(fm.V2 + "#refined")
check(refined_pin != "main", "the Refined mode has its own pin in heresy/hf-revisions.txt (" + refined_pin[:8] + ")")
full = asked(["--quant", "Q8_0"])
want = ["YuE2-3B-RS-TW-2.0x0.75-Q8_0.gguf", "models/YuE2-Vae-F32.gguf", "VAE-RS/YuE2-VAE-RS-x3_v1-F32.gguf", "models/YuE2-3B-Q8_0.gguf",   # paths: repo (the repo's own layout, as the downloaders ask it)
        "models/SheetSage2-F32.gguf", "models/MERT-v2-FullSong-F32.gguf", "models/SheetSage2-Refined-F16.gguf",   # paths: repo (the repo's own layout, as the downloaders ask it)
        "models/SheetSage2-Refined/LICENSE", "models/SheetSage2-Refined/NOTICE.md"]   # paths: repo (the repo's own layout, as the downloaders ask it)
check(full == want, "Windows and Mac, Q8_0: ours and m-a-p's backbone, both decoders, the transcriber in F32, Refined with LICENSE and NOTICE")
revs = {e[2]: e[1] for e in calls[-1]}
check(all(revs[p] == refined_pin for p in want[6:]) and revs["models/SheetSage2-F32.gguf"] == fm.rev(fm.V2),   # paths: repo (the repo's own layout, as the downloaders ask it)
      "Refined's three files at Refined's own pin, the transcriber at the repo's")
low = asked(["--quant", "Q5_K_M"])
check(low.count("models/YuE2-3B-Q5_K_M.gguf") == 2 and "models/SheetSage2-F32.gguf" in low,   # paths: repo (the repo's own layout, as the downloaders ask it)
      "Q5_K_M: m-a-p's backbone named twice (models_plan.py keeps the first), the transcriber still comes")
check(asked(["--transcriber"]) == asked([]), "--transcriber is kept and changes nothing: the transcriber always comes")
only = asked(["--transcriber-only"])
check(only == want[4:], "--transcriber-only: the transcriber and Refined alone, no backbone, no decoder")

# ---- fetch-models.sh: the same set, written into its plan lines (read, not run: the run asks Hugging Face)
sh = (KIT / "fetch-models.sh").read_text(encoding="utf-8")
check(sh == (KIT / "heresy" / "root" / "fetch-models.sh").read_text(encoding="utf-8"), "the KIT's fetch-models.sh is heresy/root's")
check("yue2_full() {" in sh and 'yue2_full yue2; }' in sh, "Linux: an install's default plan calls yue2_full with the pack yue2")
i_up, i_pack = sh.index("yue2_full newdefault"), sh.index('want="${PACKS#,}"; want="${want/,fw,/,}"; pack_entries')
check(i_up < i_pack, "an update: yue2_full newdefault before pack_entries (whose transcriber lines would come first and not be wanted)")
check('[ "$1" = newdefault ] || add $V2 "$V2R" "models/YuE2-3B-$QUANT.gguf"' in sh, "an update leaves m-a-p's backbone out: a backbone is a choice")   # paths: repo (the repo's own layout, as the downloaders ask it)
check("song|yue2|newdefault|" in sh and 'yue2) echo "the whole of YuE2"' in sh, "the download loop fetches the pack yue2, the plan names it")
check('V2REF=$(awk -v k="$V2#refined"' in sh, "Refined at its own pin")

# ---- lab/weights.py: Engine -> Models on Windows without Git for Windows
check(weights._base_only(["--only", "transcriber"]) and weights._base_only(["--only", "none", "--refined", "F16", "--yes"]),
      "the transcriber and Refined are the base set's own downloader's")
check(not weights._base_only(["--only", "whisper"]) and not weights._base_only(["--only", "none", "--tw", "2.0x0.75-Q8_0", "--yes"]),
      "other parts still need fetch-heresy.sh")
with tempfile.TemporaryDirectory() as d:
    k = Path(d)
    (k / "launcher").mkdir()
    (k / "launcher" / "fetch_models.py").write_text(
        "import sys\nassert sys.argv[1:] == ['--transcriber-only', '--yes'], sys.argv\n"
        f"print('download  {paths.MISC}/SheetSage2-F32.gguf  229 MB')\nprint('done      {paths.MISC}/SheetSage2-F32.gguf')\n"
        "print('models: every file here')\n", encoding="utf-8")
    real_bash = weights._bash
    weights._bash = lambda: None
    try:
        weights.JOB.update(kind="fetch", lines=[], restart=False)
        rc = weights._say(k, ["--only", "transcriber"])
        lines = list(weights.JOB["lines"])
        check(rc == 0 and f"done      {paths.MISC}/SheetSage2-F32.gguf" in lines, "no bash: the transcriber comes through fetch_models.py --transcriber-only")
        check(weights.JOB["restart"] is True, "the engine's restart asked after the transcriber (it lists it when it starts)")
        weights.JOB.update(kind="fetch", lines=[], restart=False)
        rc = weights._say(k, ["--only", "whisper"])
        check(rc == 1 and any("Git for Windows" in x for x in weights.JOB["lines"]), "no bash, another part: said as before (2924), not a crash")
    finally:
        weights._bash = real_bash
print(f"{ok} passed")
