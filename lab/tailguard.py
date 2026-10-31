"""HERESY 1836 (TODO, from RC3's report of 08.10.2026: «Сторож хвоста: если громкость возвращается после тишины в последней минуте, End at…
предлагается с готовой секундой»; Viktor 08.10.2026: «после последнего правильного затухания какая-то… хуета выскакивает на 10-15 секунд»): where a
take's sound comes back after a silence in its last half minute, the model's coda after the song had ended. The second it suggests is where the
sound comes back (End at… fades its last 2 s out over the silence); it is a suggestion only, said with its reason.

The take's loudness in 50 ms steps, against the song's own median: a silence is 22 dB under it for 0.6 s at least (a fade's end, a stop), and it
counts when the sound comes back after it, within 15 dB of the median, for 2 s at least before the end. The earliest such silence in the last 30 s (the
last 40 % of a short take) is the one (Viktor's «10-15 секунд» after the song's last fade; in 75 s, 27 of 200 takes had one, most of them a
narrator's pause or a break before the outro): what follows it is what End at… would take away. Most takes end where their length cut them, loud to the
last second: those have no silence in their tail and get no suggestion (25 of 25 on 28.10.2026 with an absolute −50 dBFS floor, which was too deep:
the model's tails stop at −40 dB, not in digital silence)."""
import numpy as np
import soundfile as sf

HOP, MIN_GAP, MIN_BACK, WINDOW, DEPTH, BACK_DEPTH = 0.05, 0.6, 2.0, 30.0, 22.0, 15.0


def tail(path):
    """{seconds, suggest, gap: [a, b], back, why} or {seconds, suggest: None} when the end is clean."""
    x, sr = sf.read(str(path), dtype="float32", always_2d=True)
    x = x.mean(axis=1)
    n = int(sr * HOP)
    frames = len(x) // n
    if frames < 40:
        return {"seconds": round(len(x) / sr, 2), "suggest": None}
    rms = np.sqrt(np.mean(x[: frames * n].reshape(frames, n) ** 2, axis=1) + 1e-12)
    db = 20 * np.log10(rms)
    med = float(np.median(db))
    quiet, loud = db < med - DEPTH, db > med - BACK_DEPTH
    seconds = len(x) / sr
    start = max(0, int((seconds - min(WINDOW, seconds * 0.4)) / HOP))
    i = start
    while i < frames:
        if not quiet[i]:
            i += 1
            continue
        j = i
        while j < frames and quiet[j]:
            j += 1
        gap = (j - i) * HOP
        back = float(np.sum(loud[j:])) * HOP if j < frames else 0.0   # the sound back after it, wherever it is loud again
        if gap >= MIN_GAP and j < frames and back >= MIN_BACK:
            a, b = i * HOP, j * HOP
            return {"seconds": round(seconds, 2), "suggest": round(b, 1), "gap": [round(a, 2), round(b, 2)],
                    "back": round(seconds - b, 2), "why": f"the sound comes back at {b:.1f} s after {gap:.1f} s of silence"}
        i = j
    return {"seconds": round(seconds, 2), "suggest": None}


if __name__ == "__main__":
    import json
    import sys
    for p in sys.argv[1:]:
        print(p, json.dumps(tail(p)))
