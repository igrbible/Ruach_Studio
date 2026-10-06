"""HERESY 1056: karaoke timing. The lyrics are known; Whisper (with word times) says when each
heard word was sung. The lyric words and the heard words are aligned in order (difflib, accents
and punctuation removed, a near spelling counts); a line takes the time of its first and last
matched words. A line too little of which was heard (under 30 %, or half of a short one) gets a
time between its neighbours, shared by length, and is marked as guessed. Out: JSON rows, LRC, SRT.
"""
import difflib, re
from gloss_core import norm

LANGS = (("el", re.compile(r"[Ͱ-Ͽἀ-῿]")), ("he", re.compile(r"[֐-׿]")),
         ("uk", re.compile(r"[іїєґІЇЄҐ]")), ("ru", re.compile(r"[Ѐ-ӿ]")), ("en", re.compile(r"[A-Za-z]")))


def language(lyrics):
    """The language Whisper is told, from the script; None (Whisper decides) when several mix."""
    counts = {code: len(rx.findall(lyrics)) for code, rx in LANGS}
    if counts["uk"] >= 3 or (counts["uk"] and counts["uk"] >= counts["ru"] * 0.003):   # і ї є ґ inside the Cyrillic
        counts["ru"], counts["uk"] = 0, counts["ru"]
    total = sum(counts.values()) or 1
    code, n = max(counts.items(), key=lambda kv: kv[1])
    return code if n / total >= 0.85 else None


def rows_of(lyrics):
    rows = []
    for raw in lyrics.splitlines():
        s = raw.strip()
        if not s or s.startswith(("[", "(")):
            continue
        toks = norm(re.sub(r"\([^)]*\)", "", s)).split()
        if toks:
            rows.append({"text": s, "toks": toks})
    return rows


def align(whisper, lyrics):
    heard = []                                           # (token, start, end), a word may give two tokens
    for seg in whisper.get("segments", []):
        for w in seg.get("words") or []:
            for t in norm(w["w"]).split():
                heard.append((t, w["s"], w["e"]))
    rows = rows_of(lyrics)
    flat = [(i, t) for i, r in enumerate(rows) for t in r["toks"]]
    A, B = [t for _, t in flat], [h[0] for h in heard]
    when = [None] * len(flat)
    sm = difflib.SequenceMatcher(None, A, B, autojunk=False)
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            for k in range(i2 - i1):
                when[i1 + k] = heard[j1 + k][1:]
        elif tag == "replace":                           # a near spelling, word for word
            for k in range(min(i2 - i1, j2 - j1)):
                if difflib.SequenceMatcher(None, A[i1 + k], B[j1 + k]).ratio() >= 0.6:
                    when[i1 + k] = heard[j1 + k][1:]
    out, at = [], 0
    for r in rows:
        ts = [when[at + k] for k in range(len(r["toks"])) if when[at + k]]
        share = len(ts) / len(r["toks"])
        if share < (0.5 if len(r["toks"]) <= 3 else 0.3):   # a word or two of a long line: chance, not an anchor
            ts = []
        out.append({"text": r["text"], "start": ts[0][0] if ts else None, "end": ts[-1][1] if ts else None,
                    "heard": round(share, 2), "guessed": not ts, "n": len(r["toks"])})
        at += len(r["toks"])
    last = -1.0                                          # a line earlier than the one before is a false match
    for r in out:
        if r["start"] is not None and r["start"] < last:
            r.update(start=None, end=None, guessed=True)
        elif r["start"] is not None:
            last = r["start"]
    duration = whisper.get("duration") or (heard[-1][2] if heard else 0)
    i = 0
    while i < len(out):                                  # runs of guessed lines, shared by length
        if out[i]["start"] is not None:
            i += 1
            continue
        j = i
        while j < len(out) and out[j]["start"] is None:
            j += 1
        a = out[i - 1]["end"] if i > 0 else 0.0
        b = out[j]["start"] if j < len(out) else duration
        n = sum(r["n"] for r in out[i:j]) or 1
        t = a
        for r in out[i:j]:
            d = (b - a) * r["n"] / n
            r["start"], r["end"] = round(t, 2), round(t + d, 2)
            t += d
        i = j
    for k, r in enumerate(out):                          # an end never runs past the next start
        if k + 1 < len(out) and r["end"] > out[k + 1]["start"]:
            r["end"] = out[k + 1]["start"]
        r.pop("n", None)
    return out


def clock_lrc(t):
    return "%02d:%05.2f" % (int(t // 60), t % 60)


def clock_srt(t):
    ms = int(round(t * 1000))
    return "%02d:%02d:%02d,%03d" % (ms // 3600000, ms // 60000 % 60, ms // 1000 % 60, ms % 1000)


def lrc(rows, title=""):
    head = [f"[ti:{title}]"] if title else []
    return "\n".join(head + [f"[{clock_lrc(r['start'])}]{r['text']}" for r in rows]) + "\n"


def srt(rows):
    out = []
    for k, r in enumerate(rows, 1):
        end = r["end"] if r["end"] > r["start"] else r["start"] + 2
        out.append(f"{k}\n{clock_srt(r['start'])} --> {clock_srt(end)}\n{r['text']}\n")
    return "\n".join(out)
