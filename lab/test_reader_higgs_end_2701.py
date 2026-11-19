"""HERESY 2701: Higgs's end checked without the model: a piece that ran to its budget read again once with 1.5× the room, the second reading
kept when it ends; one that runs out twice kept and marked. .venv-read/bin/python lab/test_reader_higgs_end_2701.py"""
import importlib.util
import sys
from pathlib import Path

import numpy as np
import torch

LAB = Path(__file__).resolve().parent
sys.path.insert(0, str(LAB))
spec = importlib.util.spec_from_file_location("higgs_engine", LAB / "reader_engines" / "higgs" / "engine.py")
E = importlib.util.module_from_spec(spec)
spec.loader.exec_module(E)
fails = 0


def check(name, ok, detail=""):
    global fails
    fails += not ok
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else "  (" + str(detail) + ")"))


class Model:
    def __init__(self, lengths):
        self.lengths, self.asked = list(lengths), []

    def _decode_codes(self, codes):
        return torch.zeros(4800)

    def generate_speech(self, text, tok, temperature, top_k, max_new_tokens, **kw):
        self.asked.append(max_new_tokens)
        n = self.lengths.pop(0)
        return self._decode_codes(torch.zeros((min(n, max_new_tokens), 8), dtype=torch.int64))


m = Model([2048, 900])
h = {"model": m, "tok": None}
E.say(h, "Кусок.", None, {"seed": 1})
check("ran to 2048 of 2048: read again with 3072", m.asked == [2048, 3072], m.asked)
check("  the second ends (900 frames): not limited, retried, its budget kept", h["last_codes"]["reached_limit"] is False and h["last_codes"]["retried"] is True and h["last_codes"]["max_tokens"] == 3072, h["last_codes"])
m = Model([2040, 3070])
h = {"model": m, "tok": None}
E.say(h, "Кусок.", None, {"seed": 1})
check("out of room twice (16 frames of slack): kept, said as limited", h["last_codes"]["reached_limit"] is True and m.asked == [2048, 3072], (h["last_codes"], m.asked))
m = Model([700])
h = {"model": m, "tok": None}
E.say(h, "Кусок.", None, {})
check("a piece that ends in its room: read once, not limited", m.asked == [2048] and h["last_codes"]["reached_limit"] is False and h["last_codes"]["retried"] is False, (m.asked, h["last_codes"]))
print("all ok" if not fails else f"{fails} failed")
sys.exit(1 if fails else 0)
