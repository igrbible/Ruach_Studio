"""HERESY 2942: what the window leaves the music of the song at hand (lab/song_room.py), counted as the engine counts (build/src/prompt.h, pipeline.h):
prefix = <|endoftext|> + BPE(instruction, [Tags], style, [Lyrics], lyrics) + <abc> + score + </abc> <|music_start|>; whole = (context - prefix - 3) // 2
frames; pieces = context - prefix; 25 frames a second. Without a backbone GGUF the room is not counted and says why (never a number made up).
Measured on 22.11.2026 against the engine: a take of 21.11 held whole at 387.8 s (9695 frames) is counted 387.8 s here, its prefix 5182."""
import sys
from pathlib import Path

import paths
import song_room as R

bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got) + ")"))
    if not ok:
        bad.append(what)


STYLE = "dark synthwave, male vocal, 96 bpm"
LYRICS = "[Verse 1]\nВ городе ночь, и неон не спит\nWe walk the line where the wires hum\n\n[Chorus]\nПой, пой, пой\n" * 6
ABC = "X:1\nL:1/16\nQ:1/4=96\nK:Am\nV: Vocal\n" + "A2c2e2c2 B2G2E4|" * 120

t = R.tokenizer()
if t is None:
    print("no backbone GGUF here (" + R._TOK["error"] + "): the counts are skipped, the refusal checked below")
else:
    print("counted by the BPE of " + R._TOK["from"])
    one = R.count(t, "Hello")
    check("a word is one token or two, as a BPE counts it", 1 <= one <= 2, one)
    check("NFC first: a composed and a decomposed й count alike", R.count(t, "й") == R.count(t, "й"))
    full = R.room({"style": STYLE, "lyrics": LYRICS, "abc": ABC, "cot": "full", "length": 480})
    text = 1 + R.count(t, R.INSTRUCTION["full"] + "\n[Tags]\n" + STYLE + "\n[Lyrics]\n" + LYRICS + "\n") + 1
    score = R.count(t, ABC)
    check("a given score: the prefix as the engine builds it", full["ok"] and full["score_known"] and full["text"] == text and full["score"] == score
          and full["prefix"] == text + score + 2, full)
    check("  whole: (context - prefix - 3) // 2 frames, 25 a second", abs(full["whole"] - (24576 - full["prefix"] - 3) // 2 / 25) < 1e-9, full["whole"])
    check("  in pieces: the music half alone, context - prefix", abs(full["pieces"] - (24576 - full["prefix"]) / 25) < 1e-9, full["pieces"])
    check("  fits says whether Max length is within the window, whole", full["fits"] == (480 <= full["whole"] + 0.5), full)
    off = R.room({"style": STYLE, "lyrics": LYRICS, "abc": ABC, "cot": "off", "length": 480})
    check("Direct: no score in the prompt, whatever the field holds; its own instruction", off["score"] == 0 and off["score_known"]
          and off["text"] == 1 + R.count(t, R.INSTRUCTION["off"] + "\n[Tags]\n" + STYLE + "\n[Lyrics]\n" + LYRICS + "\n") + 1, off)
    est = R.room({"style": STYLE, "lyrics": LYRICS, "cot": "full", "length": 600})
    check("a score the model writes: estimated, low ≤ the middle ≤ high", not est["score_known"] and est["whole_low"] <= est["whole"] <= est["whole_high"]
          and est["pieces_low"] <= est["pieces"] <= est["pieces_high"], est)
    mid = R.SCORE_RATE[1]
    check("  the middle solves s·25 = (context - text - 2 - 3 - 8.64·s) / 2", abs(est["whole"] - (24576 - est["text"] - 2 - 3) / (50 + mid)) < 1e-6, est["whole"])
    short = R.room({"style": STYLE, "lyrics": LYRICS, "cot": "full", "length": 60})
    check("a plan as short as Max length: its score that much shorter, the room larger, and it fits", short["fits"] and short["whole"] > est["whole"], short)
    small = R.room({"style": STYLE, "lyrics": LYRICS, "abc": ABC, "cot": "full", "length": 480, "context": 12000})
    check("an Engine context set smaller makes the window smaller", small["whole"] < full["whole"] and small["context"] == 12000, small)
    big = R.room({"style": STYLE, "lyrics": LYRICS, "abc": ABC, "cot": "full", "context": 99999})
    check("  and never larger than the checkpoint's 24,576", big["context"] == 24576)
    huge = R.room({"style": STYLE, "lyrics": LYRICS * 120, "abc": ABC, "cot": "full", "length": 480})
    check("a prompt past the window leaves no music: 0, never below", huge["whole"] == 0 and huge["pieces"] >= 0 and not huge["fits"], huge)

# no backbone: said, no number
keep_tok, keep_bb = dict(R._TOK), paths.backbones
R._TOK.update(t=None, error="", **{"from": ""})
paths.backbones = lambda kit=None: []
none = R.room({"style": STYLE, "lyrics": LYRICS, "cot": "full", "length": 480})
check("no backbone GGUF: not counted, and why said (no whole, no fits)", none.get("ok") is False and "no backbone" in none.get("error", "") and "whole" not in none, none)
paths.backbones = keep_bb
R._TOK.clear()
R._TOK.update(keep_tok)

# a read sent as a POST: a read-only window (the lease, HERESY 2081) still asks it, and the lab never counts it a write (the page's own list too)
import lease
page_lease = (Path(__file__).resolve().parent.parent / "build/tools/console/heresy-lease.js")
check("the count passes a read-only window: in lab/lease.py's OPEN and in heresy-lease.js's",
      "/song/room" in lease.OPEN and (not page_lease.is_file() or '"/lab/song/room": 1' in page_lease.read_text(encoding="utf-8")), sorted(lease.OPEN))

print("FAILED " + str(len(bad)) if bad else "all passed")
sys.exit(1 if bad else 0)
