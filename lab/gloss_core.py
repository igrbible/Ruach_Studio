"""Whisper against the lyrics, by time: the logic of ~/Temp/gloss/gloss.py as a function.

Each segment is matched to its closest lyric line (difflib, accents and punctuation
removed; section tags skipped). A match counts at 0.5 and above.
  minutes   mean match per minute: where the words stay clear and where they blur
  reached   the furthest lyric line a counted match reached — NOT the number of lines
            sung: a line skipped in the middle does not lower it
  backs     returns to a line 8 or more before the furthest one: the song going round
  loop      Whisper repeating one text: the measurement itself is then worthless
"""
import difflib, re, unicodedata


def norm(s):
    s = unicodedata.normalize("NFD", s.lower())
    s = "".join(c for c in s if not unicodedata.combining(c)).replace("ё", "е")
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", " ", s)).strip()


def lyric_lines(lyrics):
    lines = []
    for s in lyrics.splitlines():
        s = s.strip()
        if s and not s.startswith(("[", "(")):
            n = norm(re.sub(r"\([^)]*\)", "", s))
            if len(n) >= 3:
                lines.append((s, n))
    return lines


def measure(whisper, lyrics):
    lines = lyric_lines(lyrics)
    rows = []
    for seg in whisper["segments"]:
        t = norm(seg["text"])
        if len(t) < 3:
            continue
        best, idx = 0.0, -1
        for i, (_, n) in enumerate(lines):
            r = difflib.SequenceMatcher(None, t, n).ratio()
            if r > best:
                best, idx = r, i
        rows.append({"start": seg["start"], "end": seg["end"], "text": seg["text"], "score": round(best, 3),
                     "line": idx, "lyric": lines[idx][0] if idx >= 0 else ""})
    length = whisper["segments"][-1]["end"] if whisper["segments"] else 0
    minutes = []
    for m in range(int(length // 60) + 1):
        w = [r["score"] for r in rows if m * 60 <= r["start"] < (m + 1) * 60]
        minutes.append(round(sum(w) / len(w), 3) if w else None)
    good = [r for r in rows if r["score"] >= .5]
    last = max(good, key=lambda r: r["line"]) if good else None
    backs, peak = 0, -1
    for r in good:
        if r["line"] < peak - 8:
            backs += 1
        peak = max(peak, r["line"])
    texts = [s["text"] for s in whisper["segments"] if s["text"]]
    top = max(set(texts), key=texts.count) if texts else ""
    loop = bool(texts) and (texts.count(top) >= 6 and texts.count(top) / len(texts) > 0.3)
    return {"lines": len(lines), "length": length, "minutes": minutes,
            "reached": {"line": last["line"] + 1, "at": last["start"]} if last else None,
            "backs": backs, "segments": rows, "distinct": len(set(texts)), "total": len(texts),
            "loop": {"text": top, "times": texts.count(top)} if loop else None}
