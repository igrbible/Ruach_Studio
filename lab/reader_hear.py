"""HERESY 2266 (Viktor 08.11.2026, the room's vision: «Whisper сверяет прочитанное с текстом и перечитывает кусок при высоком CER: повторы,
пропуски, каша»): the Reader's ear. Whisper large-v3 on the processor (faster-whisper, int8), loaded once for a run and kept while the engine
reads, so each piece is heard while the next one is read; it never takes a card from the engine.

    python reader_hear.py --model DIR [--threads N]

JSON lines in on stdin, one answer a line out on stdout (whatever the libraries print goes to stderr):
    {"id": N, "wav": PATH, "lang": "ru", "nodigits": true}  ->  {"id": N, "ok": true, "text": …, "words": [[start, end, word], …], "s": seconds}
                                                           |  {"id": N, "ok": false, "error": …}
    {"op": "quit"}
The first line out is {"event": "ready", "load_s": …} or {"event": "failed", "error": …}.

HERESY 2295: each word with its time in the piece (Whisper's word timestamps), so the run can say where a word was inserted or dropped.
HERESY 2311: a text with no figures suppresses the tokens that write an ASCII digit, found by what each writes (Claude's card read in Greek on
10.11: 46 words flagged, Whisper unable to write β, γ, ι; without that mistake 0 of the same pieces)."""
import argparse
import json
import sys
import time

OUT = sys.stdout
sys.stdout = sys.stderr


def answer(obj):
    OUT.write(json.dumps(obj, ensure_ascii=False) + "\n")
    OUT.flush()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    ap.add_argument("--threads", type=int, default=8)
    a = ap.parse_args()
    t0 = time.time()
    try:
        import numpy as np
        import soundfile as sf
        from math import gcd
        from scipy.signal import resample_poly
        from faster_whisper import WhisperModel
        m = WhisperModel(a.model, device="cpu", compute_type="int8", cpu_threads=a.threads)
    except Exception as e:                               # noqa: BLE001  said: the run goes on unheard, and says so
        answer({"event": "failed", "error": f"Whisper did not load: {e!r}"[:400]})
        return 1
    answer({"event": "ready", "load_s": round(time.time() - t0, 1)})
    digits = None                                        # the tokens that write a number in figures (none of the special ones)
    for line in sys.stdin:
        try:
            req = json.loads(line)
        except ValueError:
            continue
        if req.get("op") == "quit":
            break
        t1 = time.time()
        try:
            w, sr = sf.read(req["wav"], dtype="float32", always_2d=True)
            w = w.mean(1)
            if sr != 16000:
                g = gcd(16000, int(sr))
                w = resample_poly(w, 16000 // g, int(sr) // g).astype(np.float32)
            # no VAD and no conditioning on its own words: over speech of one voice they only let it loop or skip (the probes' settings)
            sup = [-1]
            if req.get("nodigits"):                      # a text with no figures: its numbers heard in words, as it wrote them (09.11: «16»)
                if digits is None:                       # HERESY 2311: by the text a token writes, never its byte-level name: there the bytes
                    tk = m.hf_tokenizer                  # 0xB2, 0xB3, 0xB9 are «²», «³», «¹», digits to isdigit(), and 1930 tokens went with them,
                    eot = tk.token_to_id("<|endoftext|>") or 50257   # every one that writes β, γ, ι in Greek, в, г, й in Russian and Ukrainian
                    digits = [i for i in range(eot) if any("0" <= c <= "9" for c in tk.decode([i]))]
                sup += digits
            # HERESY 2375 (the advice of 10.11 his word «делай как советуешь» took, 11.11): beam 5 by default, the ear more exact, its price time only
            beam = max(1, min(10, int(req.get("beam") or 5)))
            segs, _info = m.transcribe(w, language=req.get("lang") or None, beam_size=beam, vad_filter=False, condition_on_previous_text=False,
                                       suppress_tokens=sup, word_timestamps=True)
            segs = list(segs)
            words = [[round(x.start, 2), round(x.end, 2), x.word.strip()] for s in segs for x in (s.words or []) if x.word.strip()]
            answer({"id": req.get("id"), "ok": True, "text": " ".join(s.text.strip() for s in segs).strip(), "words": words,
                    "s": round(time.time() - t1, 2)})
        except Exception as e:                           # noqa: BLE001  one piece unheard: said, the ear stays
            answer({"id": req.get("id"), "ok": False, "error": repr(e)[:400]})
    return 0


if __name__ == "__main__":
    sys.exit(main())
