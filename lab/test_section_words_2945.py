"""HERESY 2945 (the agent's item B9 after 2.1.0-rc1: «Текст после «Повторить» и «Убрать» — подверсией в Писателе, отличия помечены»): the words Repeat,
Remove and Insert leave go into the new take's request (takeedit.make's «lyrics», section.py's arranged take) and into the Writer's versions as a
sub-version of the source's branch, from the version that made the source (creator_versions keep: sub, from). No lab, no card."""
import json
import math
import struct
import sys
import tempfile
import wave
from pathlib import Path

import creator_versions as cv
import takeedit

bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got) + ")"))
    if not ok:
        bad.append(what)


with tempfile.TemporaryDirectory() as tmp:
    kit = Path(tmp)
    print("the Writer's sub-versions")
    base = cv.post(kit, {"op": "keep", "title": "Song v2.0.3", "style": "rock", "lyrics": "[Verse]\na\n\n[Chorus]\nb", "takes": ["t1"], "why": "generate"})
    n0 = base["versions"][-1]["n"]
    b = cv.post(kit, {"op": "keep", "title": "Song v2.0.3", "sub": True, "from": n0, "style": "rock", "lyrics": "[Chorus]\nb", "takes": ["t2"], "why": "section"})
    v = b["versions"][-1]
    check("a sub-version of «2.0.3» is «2.0.3.1», from the version that made its source, kept as the Section editor's",
          v["version"] == "2.0.3.1" and v["from"] == n0 and v["why"] == "section" and v["takes"] == ["t2"], v)
    b = cv.post(kit, {"op": "keep", "title": "Song v2.0.3", "sub": True, "from": n0, "style": "rock", "lyrics": "[Verse]\na", "takes": ["t3"], "why": "section"})
    check("  the next one «2.0.3.2»", b["versions"][-1]["version"] == "2.0.3.2", b["versions"][-1])
    b = cv.post(kit, {"op": "keep", "title": "Other", "sub": True, "lyrics": "x", "takes": ["t4"], "why": "section"})
    check("  a title with no version: «1», and no «from» when none is given", b["versions"][-1]["version"] == "1" and "from" not in b["versions"][-1], b["versions"][-1])
    b = cv.post(kit, {"op": "keep", "title": "Other", "sub": True, "from": 99, "lyrics": "y", "takes": ["t5"], "why": "section"})
    check("  a «from» that is no version of the title is left out", "from" not in b["versions"][-1] and b["versions"][-1]["version"] == "2", b["versions"][-1])
    b = cv.post(kit, {"op": "keep", "title": "Song v2.0.3", "style": "rock", "lyrics": "[Verse]\na\n\n[Chorus]\nb", "takes": ["t6"], "why": "generate"})
    check("a plain keep of the same words in its own branch adds its takes only, as before", len(b["versions"]) == 3 and "t6" in b["versions"][0]["takes"], b["versions"])

    print("the new take's words")
    out, src = kit / "outputs", kit / "outputs" / "src"
    src.mkdir(parents=True)
    with wave.open(str(src / "audio.wav"), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(48000)
        frames = b"".join(struct.pack("<hh", int(8000 * math.sin(i / 20)), int(8000 * math.sin(i / 20))) for i in range(48000 * 4))
        w.writeframes(frames)
    (src / "meta.json").write_text(json.dumps({"title": "Song", "seconds": 4.0}), encoding="utf-8")
    (src / "request.json").write_text(json.dumps({"title": "Song", "lyrics": "[Verse]\na\n\n[Chorus]\nb", "abc": "X:1"}), encoding="utf-8")
    r = takeedit.make(out, "src", {"op": "arrange", "spans": [[0, 2], [0, 2]], "title": "Song · twice", "lyrics": "[Verse]\na\n\n[Verse]\na"},
                      lambda n: out / n)
    rq = json.loads((out / r["name"] / "request.json").read_text(encoding="utf-8"))
    check("an arrange with its words: the new take's request carries them", rq["lyrics"] == "[Verse]\na\n\n[Verse]\na", rq.get("lyrics"))
    r = takeedit.make(out, "src", {"op": "remove", "spans": [[1, 2]], "title": "Song · cut"}, lambda n: out / n)
    rq = json.loads((out / r["name"] / "request.json").read_text(encoding="utf-8"))
    check("  one without keeps the source's words, as before", rq["lyrics"] == "[Verse]\na\n\n[Chorus]\nb", rq.get("lyrics"))
    try:
        takeedit.make(out, "src", {"op": "arrange", "spans": [[0, 1]], "lyrics": 5}, lambda n: out / n)
        check("  words that are not text are refused", False)
    except ValueError as e:
        check("  words that are not text are refused", "lyrics" in str(e), e)

print("FAILED " + str(len(bad)) if bad else "all passed")
sys.exit(1 if bad else 0)
