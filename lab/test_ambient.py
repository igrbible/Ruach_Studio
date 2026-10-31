"""HERESY 1928: the ambient layers on the processor: every layer and variant renders a song's stretch at its level, finite; the fades start
and end under −50 dB; breathing follows a song; thunder strikes on the song's peaks; a private piece is never offered as public.
python3 lab/test_ambient.py"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import numpy as np  # noqa: E402
import ambient as A  # noqa: E402

KIT = Path(__file__).resolve().parent.parent
bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got) + ")"))
    if not ok:
        bad.append(what)


for layer in A.LAYERS:
    for v, _label, _pub in A.variants(KIT, layer):
        x = A.render(KIT, layer, v, 12.0, seed=2, level_db=-20, fade_in=1, fade_out=1)
        lvl = A._sounding_db(x)
        check(f"{layer} · {v[:30]}: renders finite at its level", np.isfinite(x).all() and x.shape == (2, 12 * A.SR) and abs(lvl - -40) < 1.5,
              (x.shape, round(lvl, 1)))
x = A.render(KIT, "rain", "synth", 12.0, level_db=-20, fade_in=3, fade_out=3)
edge = lambda y: 20 * np.log10(np.sqrt(np.mean(y ** 2)) + 1e-12)
check("fades start and end under −50 dB beside the middle", edge(x[:, :2400]) - A._sounding_db(x) < -45 and edge(x[:, -2400:]) - A._sounding_db(x) < -45,
      (round(edge(x[:, :2400]), 1), round(edge(x[:, -2400:]), 1)))
t = np.arange(30 * A.SR) / A.SR
song = np.stack([np.sin(2 * np.pi * 220 * t) * np.where(t < 15, 0.05, 0.4)] * 2)
y = A.render(KIT, "river", "synth", 30.0, song=song, level_db=-15, fade_in=0, fade_out=0, breathe_db=4)
q, l = edge(y[:, 3 * A.SR:12 * A.SR]), edge(y[:, 18 * A.SR:27 * A.SR])
check("breathing: louder where the song is loud, within its few dB", 4 < l - q < 9, round(l - q, 1))
tt = A.strike_times(30.0, np.random.default_rng(1), song, 1)
check("thunder on the song's peak", tt and tt[0][0] >= 15, tt)
for layer in A.LAYERS:
    pub = A.variants(KIT, layer, public_only=True)
    priv = [i for i in A.bank(KIT, layer) if not i.get("public")]
    check(f"{layer}: a private piece is never among the public variants", not any(p["source"] == v for v, _l, _p in pub for p in priv), priv[:1])
tv = np.arange(40 * A.SR) / A.SR                    # HERESY 1931: a voice coming in at 20 s, the layer closer before it
voice = np.stack([np.sin(2 * np.pi * 300 * tv) * np.where(tv >= 20, 0.3, 0.0)] * 2)
e = A.voice_entry(voice, A.SR)
check("the voice's entry found", e is not None and abs(e - 20) <= 0.5, e)
y = A.render(KIT, "rain", "synth", 40.0, level_db=-20, fade_in=0, fade_out=0, closer=(e, 8))
d8 = edge(y[:, 2 * A.SR:12 * A.SR]) - edge(y[:, 25 * A.SR:38 * A.SR])
check("closer before the voice by its dB, then under it", 6.5 < d8 < 9.5, round(d8, 1))
order = A.preferred(KIT, "fire")                    # HERESY 1934: his ear: Dartington first, Lithuania second, no synthesized fire
check("the fireplace: Dartington first, Lithuania second, no synthesis offered",
      order[:2] == ["aporee_27776_32009", "aporee_19997_23285"] and not any(v.startswith("synth") for v, _l, _p in A.variants(KIT, "fire")), order[:3])
import json  # noqa: E402
check("synthesis only where his ear let it pass: light rain and thunder", sorted(A.SYNTH) == ["rain", "thunder"], sorted(A.SYNTH))   # HERESY 1936
refused = [i["source"] for layer in A.LAYERS for i in json.load(open(KIT / "models/ambient" / layer / "bank.json", encoding="utf-8"))["items"]
           if i.get("refused")] if (KIT / "models/ambient/birds/bank.json").is_file() else []
check("a recording his ear refused is never played", all(not any(v == s for v, _l, _p in A.variants(KIT, "birds")) for s in refused), refused)
rng = np.random.default_rng(5)                       # HERESY 1941: one crack 11 dB over a quiet bed dips alone
bed = rng.standard_normal((2, 20 * A.SR)) * 0.01
bed[:, 7 * A.SR:7 * A.SR + 40] += 3.5 * np.hanning(40)
lim = A.limit(bed, A.SR)
far = np.r_[0:6 * A.SR, 8 * A.SR:20 * A.SR]
check("one pop: no sample over the ceiling, the pop kept at it, the stretches away from it untouched",
      np.abs(lim).max() <= 0.999 + 1e-9 and np.abs(lim[:, 7 * A.SR:7 * A.SR + 40]).max() > 0.9 and np.abs(lim[:, far] - bed[:, far]).max() < 1e-12,
      (round(float(np.abs(lim).max()), 4), float(np.abs(lim[:, far] - bed[:, far]).max())))
import json, subprocess, tempfile  # noqa: E401,E402  HERESY 1930: the step on a made-up take, as the lab runs it
import soundfile as sf  # noqa: E402
import daw  # noqa: E402
with tempfile.TemporaryDirectory() as td:
    d = Path(td) / "take"
    sd = d / "derived" / "stems-four"
    sd.mkdir(parents=True)
    tt = np.arange(int(20.5 * 44100)) / 44100
    song = np.stack([np.sin(2 * np.pi * 220 * tt) * 0.2] * 2).T.astype(np.float32)
    sf.write(d / "audio.wav", song, 44100, subtype="FLOAT")
    for k in ("vocals", "drums", "bass", "other"):
        sf.write(sd / f"{k}.flac", song * 0.25, 44100, subtype="PCM_24")
    json.dump({"id": "stems-four", "kind": "stems", "mode": "four", "source": "the take", "files": [{"name": k, "file": k + ".flac"} for k in ("vocals", "drums", "bass", "other")]},
              open(sd / "manifest.json", "w"))
    out = Path(td) / "out"
    out.mkdir()
    pf = Path(td) / "p.json"
    json.dump({"layer": "thunder", "source": "synth", "level": -15, "strikes": 2, "place": "random", "public": True}, open(pf, "w"))
    r = subprocess.run([sys.executable, str(Path(__file__).with_name("builtin_steps") / "ruach" / "ambience.py"), str(sd), str(out), str(pf)],
                       capture_output=True, text=True, cwd=str(Path(__file__).with_name("builtin_steps") / "ruach"))
    ok = r.returncode == 0
    res = json.loads(r.stdout.strip().splitlines()[-1]) if ok else {}
    f = (res.get("files") or [{}])[0]
    y, rate = sf.read(out / f.get("file", "x.flac")) if ok else (np.zeros((0, 2)), 0)
    check("the step: a layer of the take's length and rate, its track named", ok and rate == 44100 and len(y) == len(song) and f.get("track") == "ambient_thunder",
          r.stderr[-300:] if not ok else (rate, len(y), f))
    if ok:
        bd = d / "derived" / "plugin-ruach-ambient-1"
        bd.mkdir()
        (out / f["file"]).rename(bd / f["file"])
        man = {"id": bd.name, "kind": "plugin", "source": "derived/stems-four", "files": [dict(f, path=f"derived/{bd.name}/{f['file']}")]}
        info = daw.set_info(d, "derived/stems-four", [man])
        add = [s for s in info["strips"] if s.get("added")]
        check("the step's layer is a strip the DAW adds", [s["name"] for s in add] == ["ambient_thunder"], [s["name"] for s in info["strips"]])
    json.dump({"layer": "fire", "source": "synth"}, open(pf, "w"))
    r2 = subprocess.run([sys.executable, str(Path(__file__).with_name("builtin_steps") / "ruach" / "ambience.py"), str(sd), str(out), str(pf)],
                        capture_output=True, text=True, cwd=str(Path(__file__).with_name("builtin_steps") / "ruach"))
    check("the step refuses a synthesized fireplace (his ear)", r2.returncode != 0 and "recordings only" in (r2.stderr + r2.stdout), r2.returncode)
print("test_ambient:", "FAILED " + ", ".join(bad) if bad else "all passed")
sys.exit(1 if bad else 0)
