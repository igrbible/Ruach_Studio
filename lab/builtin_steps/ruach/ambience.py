"""HERESY 1930 · Ambient (Viktor 30.10.2026: «это всё можем определить в ноду амбиентных эффектов, а в DAW дорожками со своими затуханиями
и пиками»): a layer of nature under the song, as a strip the DAW adds (1929): fire, rain, thunder, forest, waterfall, a mountain river,
tropical birds or a canary, from the bank's field recordings (looped without a seam) or made here (lab/ambient.py), at its level under the
song where it sounds, faded in and out, breathing with the song if asked, thunder striking on the song's own peaks. Back: the layer, the
song's length, a strip «ambient_LAYER» in the DAW; the same layer made again is that strip's version.
    ambience.py STEMS_DIR OUTDIR PARAMS.json   (not ambient.py: that is the engine it imports)"""
import json
import sys
import time
from pathlib import Path

import numpy as np
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
import ambient as A  # noqa: E402

KIT = Path(__file__).resolve().parents[3]
NAMES = {"fire": "Fireplace", "rain": "Rain", "thunder": "Thunder", "forest": "Forest", "waterfall": "Waterfall", "river": "Mountain river",
         "birds": "Tropical birds", "canary": "Canary"}


def variant_of(layer, source):
    """The engine's variant for the page's choice: recordings (the bank), or the layer's first, second or third synthesis."""
    if source in ("bank", "bank2"):                   # 1934: his first recording, or the second
        return source
    if layer not in A.SYNTH:                          # 1936: recordings only where his ear refused the synthesis
        raise SystemExit(f"{layer} is played from recordings only: choose Recordings or Recordings II")
    return A.SYNTH[layer][0]


def main():
    t0 = time.time()
    sdir, outdir, pfile = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]
    p = json.load(open(pfile, encoding="utf-8"))
    layer = str(p.get("layer") or "rain")
    if layer not in A.LAYERS:
        raise SystemExit(f"a layer is one of {', '.join(A.LAYERS)}")
    variant = variant_of(layer, str(p.get("source") or "bank"))
    public = bool(p.get("public", True))
    if variant == "bank" and not A.bank(KIT, layer, public_only=public):
        raise SystemExit(f"no {'shareable ' if public else ''}recording of {layer} in the bank: "
                         + ("switch «Shareable only» off to play a private one" if public and A.bank(KIT, layer) else "choose Synthesis"))
    man = json.load(open(sdir / "manifest.json", encoding="utf-8"))
    rel = sdir.resolve()
    take = rel.parent.parent if rel.parent.name == "derived" else rel.parent
    src = man.get("source") or "the take"
    song_path = next((take / f for f in ("audio.wav", "audio.flac") if (take / f).is_file()), None) if src == "the take" else take / src
    if not song_path or not song_path.is_file():
        raise SystemExit("the set's source is not there to measure the song against")
    song, rate = sf.read(str(song_path), dtype="float64", always_2d=True)
    frames = len(song)
    song48 = song.T if rate == A.SR else None
    if song48 is None:
        import librosa
        song48 = librosa.resample(song.T, orig_sr=rate, target_sr=A.SR)
    if song48.shape[0] == 1:
        song48 = np.repeat(song48, 2, axis=0)
    seconds = frames / rate
    closer, entry = float(p.get("closer", 0) or 0), None
    if closer > 0:                                    # HERESY 1931: the layer nearer before the voice comes in
        vf = next((f for f in man.get("files", []) if f.get("name") in ("lead_vocal", "vocals")), None)
        if vf and (sdir / vf["file"]).is_file():
            v, vr = sf.read(str(sdir / vf["file"]), dtype="float64", always_2d=True)
            entry = A.voice_entry(v.T, vr)
    x = A.render(KIT, layer, variant, seconds, song=song48, seed=int(p.get("seed", 7)), level_db=float(p.get("level", -18)),
                 fade_in=float(p.get("fade_in", 4)), fade_out=float(p.get("fade_out", 6)), breathe_db=float(p.get("breathe", 3)),
                 strikes=int(p.get("strikes", 4)), on_peaks=str(p.get("place", "peaks")) == "peaks", public_only=public,
                 closer=(entry, closer) if entry else None)
    if rate != A.SR:
        import librosa
        x = librosa.resample(x, orig_sr=A.SR, target_sr=rate)
    x = np.pad(x, ((0, 0), (0, max(0, frames - x.shape[1]))))[:, :frames]
    if song.shape[1] == 1:
        x = x.mean(axis=0, keepdims=True)
    pk0 = float(np.abs(x).max()) if x.size else 0.0
    x = A.limit(x, rate)                              # HERESY 1941: a pop dips alone, the layer keeps its level
    pk = float(np.abs(x).max()) if x.size else 0.0
    if pk > 0.999:                                    # the last guard: no longer speaks after the limit
        x *= 0.999 / pk
    name = f"{layer}.flac"
    sf.write(str(Path(outdir) / name), x.T.astype(np.float32), rate, subtype="PCM_24")
    said = {"bank": "recordings", "bank2": "recordings II"}.get(variant) or variant.replace("synth", "synthesis").replace("-", " ")
    sounding = A._sounding_db(x if x.shape[0] == 2 else np.repeat(x, 2, axis=0))
    print(json.dumps({"files": [{"name": f"{NAMES[layer]} · {said}", "file": name, "seconds": round(frames / rate, 2), "track": f"ambient_{layer}"}],
                      "measure": {"layer": layer, "variant": variant, "level_db": float(p.get("level", -18)), "sounding_dbfs": round(sounding, 1),
                                  "peaks_limited_db": round(min(0.0, 20 * np.log10(0.999 / pk0)), 1) if pk0 > 0.999 else 0.0,
                                  "public_only": public, "voice_enters_s": entry},
                      "summary": f"{NAMES[layer]} ({said}) under the song, {float(p.get('level', -18)):g} dB where it sounds; a strip of its own in the DAW",
                      "took": round(time.time() - t0, 1)}))


if __name__ == "__main__":
    main()
