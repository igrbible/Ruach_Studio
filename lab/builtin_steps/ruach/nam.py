"""HERESY 2987 (Viktor 25.11.2026: «Подбери кандидатов NAM до среза и оформи всё в срез. Пусть пользователь имеет выбор.»): the Refiner's
«Amp (NAM)», beside Pianoteq and done its way: a stem of the set played through a capture of an amp, a pedal or a rig (lab/nam_amp.py: the
engine and the list), at the stem's own loudness and length, as a lane of its own in the DAW or as the stem's version. The capture is the
Studio's (models/refiner/nam/, Engine → Models' part «nam») or the user's own .nam from user/nam/. HERESY 2994: a cabinet after it, the
generic cab (a filter: a guitar speaker's band and mid curve), on Auto after the Studio's guitar amp heads, asked or refused by «cab».
Every failure is said in words, never a silent take.

    python nam.py SET_DIR OUTDIR PARAMS.json
"""
import json
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
LAB = HERE.parents[1]
KIT = LAB.parent
sys.path.insert(0, str(LAB))
import nam_amp  # noqa: E402

# the stem asked first, then these in turn (a bass capture's set without a bass stem plays its «other»)
ORDER = {"bass": ("bass", "other", "instrumental"), "outboard": ("vocals", "lead_vocal", "instrumental", "other")}
FIRST = ("guitar", "other", "bass", "instrumental")


def stem_file(set_dir, want, kind, versions):
    """The file to play for the stem asked (the chain's version of it when the chain left one), else for the first of its kind's order; the set's
    own file of that stem; its name."""
    have = {p.stem: p for p in Path(set_dir).iterdir() if p.suffix.lower() in (".flac", ".wav")}
    for name in [want] + [x for x in ORDER.get(kind, FIRST) if x != want]:
        if name in have:
            v = versions.get(name) if isinstance(versions, dict) else None
            return (Path(v) if v and Path(v).is_file() else have[name]), have[name], name
    raise nam_amp.Refused(f"the set has no {want} stem (it has {', '.join(sorted(have)) or 'none'})")


def main(set_dir, outdir, params_file):
    import soundfile as sf
    t0 = time.time()
    p = json.load(open(params_file, encoding="utf-8"))
    set_dir, outdir = Path(set_dir), Path(outdir)
    cid = str(p.get("capture") or "")
    if not cid and not nam_amp.listing(KIT)["count"]:
        raise SystemExit(nam_amp.NONE_HERE)
    try:
        path = nam_amp.resolve(KIT, cid)
        c = nam_amp.describe(KIT, cid)
        try:
            model = nam_amp.load(path)
        except NotImplementedError as e:
            raise nam_amp.Refused(f"{c['name']}: the Studio cannot read its {e} yet; choose another capture") from None
        except ValueError as e:
            raise nam_amp.Refused(f"{c['name']}: {e}") from None
        stem, own, name = stem_file(set_dir, str(p.get("stem") or "guitar"), c.get("group", ""), p.get("_versions") or {})
        x, rate = sf.read(str(stem), always_2d=True, dtype="float32")
        drive, out_db, mix = float(p.get("drive") or 0), float(p.get("level") or 0), float(p.get("mix") if p.get("mix") is not None else 100) / 100
        # HERESY 2994: Auto is the generic cab after one of the Studio's guitar amps captured without a cabinet (the list's «head»)
        with_cab = {"generic": True, "off": False}.get(str(p.get("cab") or "auto"), bool(c.get("head")))
        t1 = time.time()
        y, done = nam_amp.render(x, rate, model, drive, out_db, mix, with_cab=with_cab)
    except nam_amp.Refused as e:
        raise SystemExit(str(e)) from None
    out = "nam.flac"
    sf.write(str(outdir / out), y, rate, subtype="PCM_24")
    source = f"derived/{set_dir.name}/{own.name}"
    lane = str(p.get("lay") or "lane") == "lane"
    f = {"name": f"NAM · {c['name']} · {name}", "file": out, "seconds": round(len(y) / rate, 2)}
    if lane:
        f["track"] = "nam"                              # a strip of its own in the DAW, beside the stem it plays (Pianoteq's way)
    else:
        f["source"] = source                            # the stem's version: the DAW plays it instead
    took = time.time() - t1
    wet = round(done["mix"] * 100)
    print(json.dumps({"files": [f],
                      "measure": dict(done, capture=c["name"], id=cid, gear=c.get("gear", ""), maker=c.get("maker", ""), author=c.get("author", ""),
                                      licence=c.get("licence", "") or ("your own file" if cid.startswith("user:") else ""), architecture=model.arch,
                                      stem=name, realtime=round(len(y) / rate / took, 1) if took > 0 else None),
                      "summary": f"{c['name']}" + (f" ({c['gear']})" if c.get("gear") else "") + f" played the {name} stem" + (" through the generic cab" if with_cab else "") + f", drive {drive:+g} dB, wet {wet} %; " +
                                 ("a lane of its own in the DAW" if lane else "the stem's version in the DAW") +
                                 (f"; lowered {-done['lowered_db']:.1f} dB under the ceiling" if done["lowered_db"] else ""),
                      "took": round(time.time() - t0, 1)}))


if __name__ == "__main__":
    main(*sys.argv[1:4])
