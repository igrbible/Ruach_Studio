"""HERESY 2955: a Whisper job on a machine without Whisper says so at once, in plain words with where to get it, before it waits its turn: the
lyrics check, the karaoke timing, a recording's timing (lab.py, need_whisper before each Whisper turn) and the Narrator's transcription and its
ear (reader.py), all in the same words, which the page's catalogs translate. The lab is imported (nothing started, no card touched).
    .venv/bin/python lab/test_whisper_missing_2955.py"""
import importlib.util
import re
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
spec = importlib.util.spec_from_file_location("lab_under_test", HERE / "lab.py")
lab = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lab)

passed = failed = 0


def check(name, ok, detail=""):
    global passed, failed
    passed += bool(ok)
    failed += not ok
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else "  (" + str(detail) + ")"))


WORDS = "Whisper large-v3 is not in this Studio yet: Engine → Models and LoRAs fetches it (3.1 GB)"
check("the lab's words: plain, with where to get it and its size", lab.WHISPER_MISSING == WORDS, lab.WHISPER_MISSING)
was = lab.WHISPER_DIR
with tempfile.TemporaryDirectory() as tmp:
    lab.WHISPER_DIR = Path(tmp) / "whisper-large-v3-ct2-float16"
    try:
        lab.need_whisper()
        check("no Whisper folder: need_whisper refuses", False, "it passed")
    except RuntimeError as e:
        check("no Whisper folder: need_whisper refuses in those words", str(e) == WORDS, e)
    lab.WHISPER_DIR.mkdir()
    try:
        lab.need_whisper()
        check("its folder there: need_whisper passes", True)
    except RuntimeError as e:
        check("its folder there: need_whisper passes", False, e)
lab.WHISPER_DIR = was

src = (HERE / "lab.py").read_text(encoding="utf-8").split("\n")
turns = [i for i, l in enumerate(src) if re.match(r"\s*with whisper_turn\(job\) as wt:", l)]
uses = [i for i in turns if any("WHISPER_DIR" in src[k] for k in range(i, min(i + 12, len(src))))]
guarded = [i for i in uses if "need_whisper()" in src[i - 1] or any("need_whisper()" in src[k] for k in range(max(0, i - 40), i) if src[k].strip().startswith("need_whisper()"))]
check("every Whisper turn of the lab that runs Whisper's own folder asks need_whisper before it (" + str(len(uses)) + " of them)", len(uses) >= 3 and guarded == uses,
      [i + 1 for i in uses if i not in guarded])
rd = (HERE / "reader.py").read_text(encoding="utf-8")
check("the Narrator's transcription and its ear say the same words", rd.count('"' + WORDS + '"') == 2, rd.count(WORDS))
print(f"\ntest_whisper_missing_2955  {passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
