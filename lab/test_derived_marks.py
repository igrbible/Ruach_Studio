"""HERESY 1504: the marks on a take's derived files. python3 lab/test_derived_marks.py"""
import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import derived_marks as dm  # noqa: E402

bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got) + ")"))
    if not ok:
        bad.append(what)


with tempfile.TemporaryDirectory() as t:
    d = Path(t) / "take"
    (d / "derived" / "stems-eight").mkdir(parents=True)
    (d / "derived" / "remaster-1").mkdir(parents=True)
    a, b = "derived/stems-eight/lead_vocal.flac", "derived/remaster-1/remaster.wav"
    (d / a).write_bytes(b"a"); (d / b).write_bytes(b"b")
    (d / "audio.wav").write_bytes(b"x")
    check("no marks before any", dm.read(d) == {}, dm.read(d))
    dm.mark(d, a, rating=1)
    check("a like kept", dm.read(d) == {a: {"rating": 1}}, dm.read(d))
    dm.mark(d, a, rating=-1)
    check("a dislike replaces it", dm.read(d)[a] == {"rating": -1}, dm.read(d))
    dm.mark(d, a, fav=True)
    check("a star beside the dislike, the rating left as it was", dm.read(d)[a] == {"rating": -1, "fav": True}, dm.read(d))
    dm.mark(d, b, fav=True)
    m = dm.mark(d, a, rating=0)
    check("rating 0 takes the rating away, the star stays; the other file untouched", m == {a: {"fav": True}, b: {"fav": True}}, m)
    m = dm.mark(d, a, fav=False)
    check("neither: the entry gone", m == {b: {"fav": True}}, m)
    check("kept on disk as the answer says", json.load(open(d / "derived" / "marks.json")) == m)
    for rel, why in (("audio.wav", "the take's own audio is no derived file"), ("derived/../audio.wav", "a way out of derived/"),
                     ("derived/stems-eight/none.flac", "a file not there"), ("derived/marks.json", "the marks themselves"),
                     ("/etc/passwd", "an absolute path")):
        try:
            dm.mark(d, rel, rating=1)
            check("refused: " + why, False, "accepted")
        except ValueError:
            check("refused: " + why, True)
    try:
        dm.mark(d, a, rating=2)
        check("refused: a rating of 2", False, "accepted")
    except ValueError:
        check("refused: a rating of 2", True)
    (d / b).unlink()
    check("a file deleted since: its mark left out when read", dm.read(d) == {}, dm.read(d))
    (d / "derived" / "marks.json").write_text("not json")
    check("a broken marks file reads as none, not an error", dm.read(d) == {})
print("test_derived_marks:", "FAILED " + ", ".join(bad) if bad else "all passed")
sys.exit(1 if bad else 0)
