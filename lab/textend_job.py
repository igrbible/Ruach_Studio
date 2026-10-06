"""Where the text ends in a reading, HERESY 1034. Whisper large-v3 hears the take; each unit of the
text (a line, or a sentence of a long line) is looked for in order after the one before, and its
FIRST confident hearing counts (a model that runs past the text reads its last lines again, and
that second pass must not win). Prints one line of JSON: the end of the last unit heard, how
many were heard in order, the frames to keep (+1.5 s), the take's length.

    textend_job.py TAKE_DIR DEVICE        DEVICE: cuda or cpu
"""
import json, re, sys, unicodedata, difflib
import soundfile as sf, torch, torchaudio
from faster_whisper import WhisperModel
from pathlib import Path

HERE = Path(__file__).resolve().parent
K = HERE.parent
TAIL, FPS = 1.5, 25


def norm(s):
    s = unicodedata.normalize("NFD", s.lower())
    return re.sub(r"[^\w\s]", " ", "".join(c for c in s if not unicodedata.combining(c))).split()


def lines_of(text):
    """The text as short units: lines, and long lines cut into sentences and clauses of at most
    ~110 characters, so each one is heard within one to three Whisper segments."""
    out = []
    for l in text.split("\n"):
        l = l.strip()
        if not l or re.fullmatch(r"\[.*\]", l):
            continue
        parts, cur = re.split(r"(?<=[.!?:;])\s+|(?<=,)\s+(?=\S{4,})", l), ""
        for p in parts:
            if cur and len(cur) + len(p) > 110:
                out.append(cur); cur = p
            else:
                cur = (cur + " " + p).strip()
        if cur:
            out.append(cur)
    return out


def end_of_text(model, take, lyrics):
    x, sr = sf.read(str(take / "audio.wav"), dtype="float32", always_2d=True)
    a = torchaudio.functional.resample(torch.from_numpy(x.mean(1)), sr, 16000).numpy()
    segs, _ = model.transcribe(a, multilingual=True, condition_on_previous_text=False, vad_filter=True, beam_size=1)
    segs = [(s.start, s.end, s.text) for s in segs]
    wins = [(segs[i][0], segs[i + w - 1][1], norm(" ".join(t for _, _, t in segs[i:i + w])))
            for i in range(len(segs)) for w in (1, 2, 3) if i + w <= len(segs)]
    # walk the lines in order: each found after the one before; the last one found ends the text
    # the FIRST confident reading of each line counts, not the best one: a model that runs past the
    # text reads its last lines again, sometimes more clearly, and that second pass must not win
    t, last, found = 0.0, None, 0
    for i, ln in enumerate(lines_of(lyrics)):
        lw, hits = norm(ln), []
        for st, en, ww in wins:
            if st + 0.01 < t or not ww:
                continue
            r = difflib.SequenceMatcher(None, lw, ww).ratio()
            if r >= 0.55:
                hits.append((st, r, en))
        if hits:
            first = min(h[0] for h in hits)
            st, r, en = max((h for h in hits if h[0] <= first + 3.0), key=lambda h: h[1])
            t, last, found = st, (i, en), found + 1
    return last, found, len(lines_of(lyrics)), len(x) / sr



if __name__ == "__main__":
    take, device = Path(sys.argv[1]), sys.argv[2]
    model = WhisperModel(str(K / "whisper" / "whisper-large-v3-ct2-float16"), device=device,
                         compute_type="float16" if device == "cuda" else "int8", cpu_threads=10)
    req = json.load(open(take / "request.json", encoding="utf-8"))
    toks = [t for t in (req.get("semantic_tokens") or "").split(",") if t.strip()]
    last, found, total, secs = end_of_text(model, take, req.get("lyrics") or "")
    out = {"seconds": round(secs, 2), "units": total, "heard": found, "frames_total": len(toks)}
    # HERESY 1034 fix (01.10.2026): where Whisper hears a language badly (Greek), a stray early
    # match passed for "the last line" and the trim cut live text (197 s -> 80 s). The end is
    # trusted only when half the units were heard in order and the last one heard is in the last
    # fifth of the text; otherwise nothing is trimmed.
    out["confident"] = bool(last) and found >= 0.5 * total and last[0] + 1 >= 0.8 * total
    if last:
        cut = min(secs, last[1] + TAIL)
        out.update(last_unit=last[0] + 1, text_end=round(last[1], 2), keep_seconds=round(cut, 2),
                   keep_frames=min(len(toks), int(cut * FPS + 0.999)))
    print(json.dumps(out))
