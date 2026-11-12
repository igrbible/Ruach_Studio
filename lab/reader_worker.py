"""HERESY 2241: the Reader's worker. One engine loaded on one device and kept there between the pieces of a run (and between runs on a CUDA card,
reader.py lets it go when idle). It runs in the engine's own Python (its engine.json names it), so the lab's environment never has to hold the
engine's libraries.

    python reader_worker.py --module ENGINE.py --device cuda|xpu|cpu --kit KIT

The engine module gives three functions:
    load(device, kit)                  -> handle         the model on its device
    reference(handle, wav, sr, text)   -> ref            a voice to read in, from a clip of it and the clip's words (cached here by key)
    say(handle, text, ref, opts)       -> (wav, sr)      one piece read, a mono float32 array; opts: temperature, top_k, seed…

JSON lines in on stdin, one answer a line out on stdout; whatever the engine or its libraries print goes to stderr (the lab keeps the tail).
    {"op": "say", "id": N, "text": …, "ref": {"key": …, "wav": PATH, "text": …} | {"key": …} | null, "opts": {…}, "out": PATH,
     "keep": KEY, "plain": …, "pitch": true}   keep: the piece read becomes the reference KEY (its sound and its plain words), for the pieces
                                    after it; pitch: its median pitch by pYIN in the answer (f0), so the lab sees a voice drift (a man read as a woman)
    {"op": "forget", "key": …} · {"op": "ping"} · {"op": "quit"}"""
import argparse
import importlib.util
import json
import sys
import time
import traceback

OUT = sys.stdout
sys.stdout = sys.stderr                                  # a library's print never lands in the answers


def answer(obj):
    OUT.write(json.dumps(obj, ensure_ascii=False) + "\n")
    OUT.flush()


def read_wav(path):
    import numpy as np
    import soundfile as sf
    w, sr = sf.read(path, dtype="float32", always_2d=True)
    return np.ascontiguousarray(w.mean(1)), sr


def pitch(wav, sr):
    """The median pitch of a piece's voiced frames by pYIN, Hz; None when too little of it is voiced."""
    import librosa
    import numpy as np
    y = librosa.resample(wav, orig_sr=sr, target_sr=16000) if sr != 16000 else wav
    f0, voiced, _p = librosa.pyin(y, fmin=60.0, fmax=420.0, sr=16000, frame_length=1024)
    f = f0[voiced & ~np.isnan(f0)] if f0 is not None else []
    return round(float(np.median(f)), 1) if len(f) >= 10 else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--module", required=True)
    ap.add_argument("--device", default="cuda")
    ap.add_argument("--kit", required=True)
    a = ap.parse_args()
    spec = importlib.util.spec_from_file_location("reader_engine", a.module)
    eng = importlib.util.module_from_spec(spec)
    t0 = time.time()
    try:
        spec.loader.exec_module(eng)
        h = eng.load(a.device, a.kit)
    except Exception as e:                               # noqa: BLE001  the lab says why, and the run ends failed
        traceback.print_exc()
        answer({"event": "failed", "error": f"the engine did not load: {e!r}"[:600]})
        return 1
    answer({"event": "ready", "load_s": round(time.time() - t0, 1), "device": a.device})
    import numpy as np
    import soundfile as sf
    refs = {}
    for line in sys.stdin:
        try:
            req = json.loads(line)
        except ValueError:
            continue
        op = req.get("op")
        if op == "quit":
            break
        if op == "ping":
            answer({"id": req.get("id"), "ok": True, "refs": len(refs)})
            continue
        if op == "forget":
            refs.pop(str(req.get("key")), None)
            answer({"id": req.get("id"), "ok": True})
            continue
        if op != "say":
            answer({"id": req.get("id"), "ok": False, "error": f"no such op {op!r}"})
            continue
        try:
            ref = None
            r = req.get("ref") or None
            if r:
                key = str(r.get("key") or "")
                if key not in refs:
                    if not r.get("wav"):
                        raise ValueError(f"the reference {key} is not held here")
                    w, sr = read_wav(r["wav"])
                    refs[key] = eng.reference(h, w, sr, str(r.get("text") or ""))
                ref = refs[key]
            t1 = time.time()
            wav, sr = eng.say(h, str(req.get("text") or ""), ref, dict(req.get("opts") or {}))
            wav = np.asarray(wav, dtype=np.float32).reshape(-1)
            sf.write(req["out"], wav, int(sr), subtype="FLOAT")
            if req.get("keep") and len(wav):
                refs[str(req["keep"])] = eng.reference(h, wav, int(sr), str(req.get("plain") or req.get("text") or ""))
            got = {"id": req.get("id"), "ok": True, "seconds": round(len(wav) / float(sr), 3), "gen_s": round(time.time() - t1, 2), "sr": int(sr)}
            if req.get("pitch") and len(wav) > int(sr) // 2:
                try:
                    got["f0"] = pitch(wav, int(sr))
                except Exception as e:                   # noqa: BLE001  no pitch said, the piece stands
                    print(f"pitch: {e!r}", file=sys.stderr)
            answer(got)
        except Exception as e:                           # noqa: BLE001  one piece failed: said, the worker stays
            traceback.print_exc()
            answer({"id": req.get("id"), "ok": False, "error": repr(e)[:600]})
    return 0


if __name__ == "__main__":
    sys.exit(main())
