"""HERESY 2006: the shelf of banks: a user's bank by its bank.json, an ambient layer by its pieces, an instrument set by its LICENSE and README;
a licence not found said as unknown. python3 lab/test_banks.py"""
import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import banks  # noqa: E402
import paths  # noqa: E402   HERESY 2330: where the weights live

bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got) + ")"))
    if not ok:
        bad.append(what)


for text, want in (("Released under CC0 1.0 Universal", ("CC0", True)), ("Creative Commons Attribution 4.0 International", ("CC BY", True)),
                   ("Attribution-NonCommercial 4.0", ("CC BY-NC", False)), ("GNU General Public License v3", ("GPL", False)),
                   ("All rights reserved by the vendor.", ("unknown", False))):
    check(f"a licence read: {want[0]}", banks.licence_of(text) == want, banks.licence_of(text))

with tempfile.TemporaryDirectory() as k:
    k = Path(k)
    u = k / "banks" / "fire-and-rain"
    u.mkdir(parents=True)
    (u / "fire.sfz").write_text("<region> sample=fire.flac loop_mode=loop_continuous\n")
    (u / "fire.flac").write_bytes(b"0" * 2000)
    (u / "bank.json").write_text(json.dumps({"name": "Fire and Rain", "kind": "ambience", "author": "Viktor", "licence": "CC0", "may_ship": True,
                                             "description": "his fireplace and his window"}))
    a = paths.at(paths.REFINER_AMBIENT, k) / "rain"
    a.mkdir(parents=True)
    (a / "rain-bed0.flac").write_bytes(b"0" * 1000)
    (a / "bank.json").write_text(json.dumps({"items": [{"source": "aporee_1", "title": "Rain in a wood", "licence": "http://creativecommons.org/publicdomain/mark/1.0/",
                                                         "recordist": "Someone", "public": True, "file": "rain-bed0.flac"},
                                                        {"source": "aporee_2", "title": "refused", "licence": "x", "public": True, "refused": True}]}))
    i = paths.at(paths.REFINER_INSTRUMENTS, k) / "harp-set"
    (i / "sub").mkdir(parents=True)
    (i / "sub" / "harp.sfz").write_text("<region> sample=a.wav\n")
    (i / "sub" / "a.wav").write_bytes(b"0" * 3000)
    (i / "LICENSE").write_text("Creative Commons Attribution 4.0")
    (i / "README.md").write_text("# Harp\n\nA concert harp sampled in a small hall, every string at three dynamics.\n")
    j = paths.at(paths.REFINER_INSTRUMENTS, k) / "mystery"
    j.mkdir(parents=True)
    (j / "x.sfz").write_text("<region> sample=x.wav\n")
    s = banks.shelf(k, fresh=True)
    ids = [c["id"] for c in s]
    check("the shelf: the user's first, then the ambient layers, then the instruments", ids == ["user:fire-and-rain", "ambient:rain", "inst:harp-set", "inst:mystery"], ids)
    c = banks.card(k, "user:fire-and-rain")
    check("a user's bank by its bank.json: its name, kind, licence, may ship, its .sfz, its samples", c["name"] == "Fire and Rain" and c["kind"] == "ambience" and c["licence"] == "CC0" and c["may_ship"] and c["sfz"] == ["fire.sfz"] and c["samples"] == 1, c)
    c = banks.card(k, "ambient:rain")
    check("an ambient layer: its pieces (the refused left out), its licence read, may ship when all are public", c["licence"] == "Public domain" and c["may_ship"] and "1 pieces" in c["description"] and c["author"] == "Someone", c)
    c = banks.card(k, "inst:harp-set")
    check(f"an instrument set: its .sfz under {paths.REFINER_INSTRUMENTS}, its licence and its README's first paragraph", c["sfz"] == ["harp-set/sub/harp.sfz"] and c["licence"] == "CC BY" and c["may_ship"] and c["description"].startswith("A concert harp"), c)
    c = banks.card(k, "inst:mystery")
    check("a set with no papers: unknown, not to ship", c["licence"] == "unknown" and not c["may_ship"], c)
    try:
        banks.card(k, "user:none")
        check("a bank not there: said", False)
    except ValueError as e:
        check("a bank not there: said", "no bank" in str(e), e)
print("FAILED: " + ", ".join(bad) if bad else "all passed")
sys.exit(1 if bad else 0)
