"""HERESY 1553–1555: the chain as a pipeline, the studio's built-in steps, a version of a version, the shipped pipelines, «Whole
lead» on stems made here. python3 lab/test_pipelines.py"""
import json
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import chain_plan as cp  # noqa: E402
import daw  # noqa: E402
import plugins as pk  # noqa: E402
import refiner_profiles as rp  # noqa: E402

bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got) + ")"))
    if not ok:
        bad.append(what)


def refused(what, fn):
    try:
        fn()
        check("refused: " + what, False, "accepted")
    except ValueError:
        check("refused: " + what, True)


with tempfile.TemporaryDirectory() as t:
    users = Path(t, "plugins")
    (users / "ruach").mkdir(parents=True)
    (users / "ruach" / "x.py").write_text("print(1)\n")
    json.dump({"id": "ruach", "steps": [{"id": "x", "script": "x.py"}]}, open(users / "ruach" / "plugin.json", "w"))
    (users / "mine").mkdir()
    (users / "mine" / "m.py").write_text("print(1)\n")
    json.dump({"id": "mine", "name": "Mine", "steps": [{"id": "vox", "script": "m.py", "rate": 0.5, "group": "finish", "after": "dawPanel"},
                                                      {"id": "odd", "script": "m.py", "rate": "fast", "group": "elsewhere"}],
               "pipelines": [{"id": "mine-pro", "name": "Mine", "pipeline": [{"step": "stems", "mode": "eight"},
                                                                              {"step": "plugin", "plugin": "mine", "sid": "vox", "stem": "lead_vocal"},
                                                                              {"step": "daw"}, {"step": "remaster"}]},
                             {"id": "mine-broken", "name": "Broken", "pipeline": [{"step": "plugin", "plugin": "gone", "sid": "x"}]}]},
              open(users / "mine" / "plugin.json", "w"))
    plugs, errors = pk.load_all(users, HERE / "builtin_steps")
    ids = [p["id"] for p in plugs]
    check("the studio's own steps first, then the user's", ids == ["ruach", "mine"], ids)
    check("a user's plugin of a built-in's id left out, said", any(e["plugin"] == "ruach" for e in errors), errors)
    check("built-in marked", plugs[0]["builtin"] is True and plugs[1]["builtin"] is False)
    lead = pk.find(plugs, "ruach", "lead")[1]
    check("Whole lead: on a set, mends, after the stems", (lead["input"], lead["group"], lead["after"]) == ("stems", "mend", "derivedPanel"), lead)
    vup = pk.find(plugs, "ruach", "vupscale")[1]
    check("Voice upscale: on a card, its room asked", vup["gpu"] and vup["need_mb"] == 11000, vup)
    vox, odd = plugs[1]["steps"]
    check("a step's pace kept (it was dropped)", vox["rate"] == 0.5 and odd["rate"] is None, (vox["rate"], odd["rate"]))
    check("a group of its own or «finish»", (vox["group"], odd["group"]) == ("finish", "finish"))
    pub = pk.public(plugs)
    check("the page told built-in, group and place", pub[0]["builtin"] and pub[1]["steps"][0]["after"] == "dawPanel", pub[1]["steps"][0])

    r = pk.result(json.dumps({"files": [{"file": "a.flac", "source": "derived/stems-1/lead_vocal.flac"}, {"file": "b.flac", "source": "../x.flac"},
                                        {"file": "c.flac", "source": "/etc/passwd"}, {"file": "d.png"}, {"file": "e.txt"}]}))
    f = r["files"]
    check("a file's stem kept when inside the take", f[0].get("source") == "derived/stems-1/lead_vocal.flac", f[0])
    check("a source outside the take dropped", "source" not in f[1] and "source" not in f[2], f[1:3])
    check("a picture is a picture, a report a report", (f[3].get("kind"), f[4].get("kind")) == ("image", "text"), f[3:])

    def names(steps, plugins=plugs, until=None):
        spec = {"pipeline": steps}
        if until is not None:
            spec["until"] = until
        return " ".join(s["step"] + (":" + s["sid"] if s["step"] == "plugin" else "") for s in cp.pipeline(spec, plugins))

    song = [{"step": "debuzz"}, {"step": "stems", "mode": "eight"}, {"step": "plugin", "plugin": "ruach", "sid": "lead"}, {"step": "daw", "mix": "current"},
            {"step": "gate", "params": {"character": "tape"}}, {"step": "remaster"}, {"step": "upscale", "end": True}, {"step": "inspect"}]
    check("a pipeline in its own order", names(song) == "debuzz stems plugin:lead daw gate remaster upscale inspect", names(song))
    check("«up to» a step by its index", names(song, until=3) == "debuzz stems plugin:lead daw", names(song, until=3))
    check("the DAW «as set now» unfilled: neutral", cp.pipeline({"pipeline": song}, plugs)[3]["mix"] is None)
    check("the end's upscale without a remaster: an upscale like any",
          "end" not in cp.pipeline({"pipeline": [{"step": "upscale", "end": True}]}, plugs)[0])
    refused("the DAW with no stems before it", lambda: cp.pipeline({"pipeline": [{"step": "daw"}]}, plugs))
    refused("a step on a set with no stems before it", lambda: cp.pipeline({"pipeline": [{"step": "plugin", "plugin": "ruach", "sid": "lead"}]}, plugs))
    refused("a step that is not here", lambda: cp.pipeline({"pipeline": [{"step": "plugin", "plugin": "gone", "sid": "x"}]}, plugs))
    refused("a step the chain has not", lambda: cp.pipeline({"pipeline": [{"step": "melt"}]}, plugs))
    refused("an empty pipeline", lambda: cp.pipeline({"pipeline": []}, plugs))
    refused("«up to» past the end", lambda: cp.pipeline({"pipeline": song, "until": 8}, plugs))
    refused("one stem for a step that takes the set", lambda: cp.pipeline({"pipeline": [{"step": "stems"}, {"step": "plugin", "plugin": "ruach", "sid": "lead", "stem": "lead_vocal"}]}, plugs))
    refused("stems of a mode there is not", lambda: cp.pipeline({"pipeline": [{"step": "stems", "mode": "twelve"}]}, plugs))
    check("a set the take has, not split anew", cp.pipeline({"pipeline": [{"step": "stems", "set": "derived/stems-eight"}]}, plugs)[0].get("set") == "derived/stems-eight")
    refused("a set outside the take's branches", lambda: cp.pipeline({"pipeline": [{"step": "stems", "set": "derived/../../x"}]}, plugs))
    check("the DAW may name its versions", cp.pipeline({"pipeline": [{"step": "stems", "set": "derived/s"}, {"step": "daw", "versions": {"lead_vocal": "derived/x/lead.flac"}}]}, plugs)[1]["versions"] == {"lead_vocal": "derived/x/lead.flac"})
    refused("a version outside the take's branches", lambda: cp.pipeline({"pipeline": [{"step": "stems"}, {"step": "daw", "versions": {"lead_vocal": "../x.flac"}}]}, plugs))
    check("the old chain as it was", " ".join(s["step"] for s in cp.steps({"stems": True})) == "debuzz stems remaster")

    pl = rp.pipelines(HERE, plugs)
    got = {p["id"]: p for p in pl}
    shipped = [p["id"] for p in json.load(open(HERE / "refiner_pipelines.json", encoding="utf-8"))["pipelines"]]
    check("every shipped pipeline valid with the studio's steps", all(i in got for i in shipped), [i for i in shipped if i not in got])
    check("a plugin's pipeline listed under it", got.get("mine-pro", {}).get("plugin") == "mine" and got["mine-pro"]["group"] == "plugin")
    check("a pipeline naming a step not here left out", "mine-broken" not in got)
    check("shipped ones are public", all(got[i]["group"] == "public" for i in shipped))
    bare = rp.pipelines(HERE, [])
    check("without the built-in steps, only the ones that need none", {p["id"] for p in bare} == {"quick", "look"}, [p["id"] for p in bare])

    # a version of a version is the stem's version
    take = Path(t, "take")
    sd = take / "derived" / "stems-eight-1"
    sd.mkdir(parents=True)
    sr, n = 44100, 44100 * 4
    sf.write(str(take / "audio.wav"), np.zeros((n, 2), np.float32), sr)
    rng = np.random.default_rng(1553)
    t_ = np.arange(n) / sr
    voice = (0.3 * np.sin(2 * np.pi * 220 * t_) * (0.6 + 0.4 * np.sin(2 * np.pi * 3 * t_)))[:, None].repeat(2, 1)
    lead_v, back_v = voice.copy(), 0.01 * rng.standard_normal((n, 2))
    lead_v[sr:3 * sr] *= 0.001                         # the split lost the lead to the backing for two seconds
    back_v[sr:3 * sr] += voice[sr:3 * sr]
    files = []
    for name, x in (("lead_vocal", lead_v), ("backing_vocals", back_v), ("drums", 0.05 * rng.standard_normal((n, 2)))):
        sf.write(str(sd / f"{name}.flac"), x.astype(np.float32), sr, subtype="PCM_24")
        files.append({"name": name, "file": f"{name}.flac"})
    json.dump({"kind": "stems", "mode": "eight", "source": "the take", "files": files}, open(sd / "manifest.json", "w"))
    out = take / "derived" / "plugin-ruach-lead-1"
    out.mkdir()
    pf = Path(t, "p.json")
    json.dump({"margin": 6, "floor": -40, "centre": 9, "min_s": 1}, open(pf, "w"))
    p = subprocess.run([sys.executable, str(HERE / "builtin_steps/ruach/lead_join.py"), str(sd), str(out), str(pf)], capture_output=True, text=True)
    check("Whole lead runs", p.returncode == 0, p.stderr[-300:])
    if p.returncode == 0:
        res = pk.result(p.stdout)
        regs = res["measure"]["regions"]
        check("the stretch the backing held found", len(regs) == 1 and abs(regs[0][0] - 0.75) <= 0.3 and abs(regs[0][1] - 3.25) <= 0.3, regs)
        nl, _ = sf.read(str(out / "lead_vocal.flac"), always_2d=True)
        nb, _ = sf.read(str(out / "backing_vocals.flac"), always_2d=True)
        check("lead and backing together as they were", float(np.abs((nl + nb) - (lead_v + back_v)).max()) < 1e-4, float(np.abs((nl + nb) - (lead_v + back_v)).max()))
        mid = slice(int(1.5 * sr), int(2.5 * sr))
        lv = 20 * np.log10(np.sqrt((nl[mid] ** 2).mean()) / np.sqrt((voice[mid] ** 2).mean()))
        check("the voice in the lead again, at its own level", abs(lv) < 0.5, lv)
        check("each file names its stem", [f["source"] for f in res["files"]] == ["derived/stems-eight-1/lead_vocal.flac", "derived/stems-eight-1/backing_vocals.flac"])
        man = {"id": "plugin-ruach-lead-1", "kind": "plugin", "source": "derived/stems-eight-1", "created": "2026-10-18 20:00",
               "files": [dict(f, path=f"derived/plugin-ruach-lead-1/{f['file']}") for f in res["files"]]}
        json.dump(man, open(out / "manifest.json", "w"))
        pro = take / "derived" / "plugin-mine-vox-1"
        pro.mkdir()
        sf.write(str(pro / "vox.flac"), nl.astype(np.float32), sr, subtype="PCM_24")
        man2 = {"id": "plugin-mine-vox-1", "kind": "plugin", "source": "derived/plugin-ruach-lead-1/lead_vocal.flac", "created": "2026-10-18 20:01",
                "files": [{"name": "vox", "file": "vox.flac", "path": "derived/plugin-mine-vox-1/vox.flac"}]}
        json.dump(man2, open(pro / "manifest.json", "w"))
        info = daw.set_info(take, "derived/stems-eight-1", [man2, man])
        v = {s["name"]: [x["path"] for x in s["versions"]] for s in info["strips"]}
        check("the lead's versions: as split, whole, then its Pro on the whole", v["lead_vocal"] == ["derived/stems-eight-1/lead_vocal.flac", "derived/plugin-ruach-lead-1/lead_vocal.flac",
                                                                                                  "derived/plugin-mine-vox-1/vox.flac"], v["lead_vocal"])
        check("the backing's version its own file of the branch", v["backing_vocals"][1:] == ["derived/plugin-ruach-lead-1/backing_vocals.flac"], v["backing_vocals"])
        check("a stem no branch made stays as split", v["drums"] == ["derived/stems-eight-1/drums.flac"], v["drums"])
        json.dump(dict(json.load(open(pf)), _versions={"lead_vocal": str(pro / "vox.flac")}), open(pf, "w"))
        out2 = take / "derived" / "again"
        out2.mkdir()
        p2 = subprocess.run([sys.executable, str(HERE / "builtin_steps/ruach/lead_join.py"), str(sd), str(out2), str(pf)], capture_output=True, text=True)
        check("a step on the set reads the versions the chain made", p2.returncode == 0 and pk.result(p2.stdout)["measure"]["regions"] == [],
              p2.stderr[-200:] or pk.result(p2.stdout)["measure"])
print("test_pipelines:", "FAILED " + ", ".join(bad) if bad else "all passed")
sys.exit(1 if bad else 0)
