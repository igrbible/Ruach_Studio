"""HERESY 2474 (Viktor 12.11.2026: «есть эмоция, но без арки… Пробуй лечить эмоциональную арку… несколькими методами»): the two trials of
the Narrator, off unless a run asks. piece_chars: a narration's pieces gathered up to that many characters; bridge: Drama 3's request carries
the piece before as audio.cpp's previous_takes, its words and its ten codebooks as the worker kept them (piece-NNN.codes.npz), and a file
that is not ten codebooks fails aloud.
python3 lab/test_reader_bridge_2474.py"""
import json
import re
import sys
import tempfile
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / "reader_engines" / "drama3"))
import reader as r  # noqa: E402
import engine as drama  # noqa: E402

bad = []


def ok(cond, what):
    print(("  ok    " if cond else "  FAIL  ") + what)
    if not cond:
        bad.append(what)


ENG = {"tag_re": re.compile(r"\[[^\[\]\n]{1,160}\]"), "max_chars": 300}
SENT = "Ру́ах — э́то ве́тер, но в иври́те ру́ах не «он», и э́то я сам чита́ю в те́ксте. "
PAR = (SENT * 6).strip()                                 # about 480 characters, one paragraph

# piece_chars: as before without it (gathered to TARGET), one piece with it
ps = r.pieces(PAR, "narration", "sentence", ENG, False, 0.35, 0.45, 0.9)
ok(len(ps) >= 2 and all(len(p["text"]) <= 300 for p in ps), f"without piece_chars a paragraph of {len(PAR)} characters is cut ({len(ps)} pieces)")
big = dict(ENG, max_chars=900)
ps2 = r.pieces(PAR, "narration", "sentence", big, False, 0.35, 0.45, 0.9, True, 900)
ok(len(ps2) == 1 and ps2[0]["plain"] == " ".join(PAR.split()), "with piece_chars 900 the paragraph is one piece, every word in it")
two = PAR + "\n\n" + SENT.strip()
ps3 = r.pieces(two, "narration", "sentence", big, False, 0.35, 0.45, 0.9, True, 900)
ok(len(ps3) == 2 and ps3[0]["gap"] == 0.9, "a paragraph still ends a piece, with the paragraph's gap")
ps4 = r.pieces(PAR.replace("те́ксте. Ру́ах", "те́ксте. [pause:1.2s] Ру́ах", 1), "narration", "sentence", big, False, 0.35, 0.45, 0.9, True, 900)
ok(len(ps4) == 2 and ps4[0].get("pause") == 1.2, "a Studio pause still ends a piece, its silence kept")

# the bridge in Drama 3's request
with tempfile.TemporaryDirectory() as tmp:
    codes = np.arange(10 * 37, dtype=np.int16).reshape(10, 37) % 4096
    f = Path(tmp) / "piece-001.codes.npz"
    np.savez_compressed(str(f), codes=codes, meta=np.array(json.dumps({"codec": "fish_drama3"})))
    b = drama.body("[in awe] Она́ ды́шит.", {"path": "/r.wav", "text": "ref"}, {"temperature": 0.8, "seed": 7,
                                                                             "previous": [{"text": "[calm] Ру́ах — Она́.", "codes": str(f)}]})
    pt = json.loads(b["options"].get("previous_takes") or "[]")
    ok(len(pt) == 1 and pt[0]["text"] == "[calm] Ру́ах — Она́." and len(pt[0]["vq_codes"]) == 10 and len(pt[0]["vq_codes"][0]) == 37
       and pt[0]["vq_codes"][3][5] == int(codes[3][5]), "the piece before goes as previous_takes: its words, ten codebooks × its frames")
    t = drama.task(b)
    ok(t["request"]["options"].get("previous_takes") == b["options"]["previous_takes"], "and rides in /v1/tasks/run's options")
    plain = drama.body("Она́ ды́шит.", None, {"temperature": 0.8})
    ok("previous_takes" not in plain["options"], "no bridge asked, no history sent")
    g = Path(tmp) / "piece-002.codes.npz"
    np.savez_compressed(str(g), codes=codes.T.copy())
    ok(len(drama.previous_takes([{"text": "x", "codes": str(g)}])[0]["vq_codes"]) == 10, "frames × codebooks turned to codebooks × frames")
    h = Path(tmp) / "piece-003.codes.npz"
    np.savez_compressed(str(h), codes=np.zeros((7, 20), dtype=np.int16))
    try:
        drama.previous_takes([{"text": "x", "codes": str(h)}])
        ok(False, "seven codebooks fail aloud")
    except RuntimeError:
        ok(True, "seven codebooks fail aloud")

print("all ok" if not bad else f"{len(bad)} failed")
sys.exit(1 if bad else 0)
