"""HERESY 2263: the Reader's tiers without a card. Drama 3's manifest read (its six tiers), and the pick by the room free now and the machine's
memory: Q4_K first (or Q6_K when quality is asked) on a card with 22 GB free, Q8_0 with its experts in RAM on a card with 7 GB free and 40 GB of
memory, else the processor in the largest quant the memory holds; a named tier waits for its card; the preview's expected time; the worker's
key carries the tier.
HERESY 2287: the tier table measured on 09.11 beside a dataset worker, in the order the manifest gives: with 16 GB free on a card Q4_K with 20
banks in RAM, with 15 GB Q6_K with 28 and cuda_perf, with 8 GB either with all 40 (cuda_perf), Q8_0 too when the memory holds it; the four
middle ones are Auto's only (not in the room's select); a tier's session options reach the server's config, fish_drama3's only, the banks and
the context left the engine's."""
import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import reader as r

HERE = Path(__file__).resolve().parent
man = json.load(open(HERE / "reader_engines/drama3/engine.json"))
assert man["seed"] is True and man["top_k"] is False and len(man["tiers"]) == 11, man
assert [t["id"] for t in man["tiers"]] == ["speed", "quality", "mid-q4", "mid-q6", "ram-q4", "ram-q6", "ram", "q8", "cpu", "cpu-q6", "cpu-q4"]
# HERESY 2375 (the advice took on his word of 11.11): Q6_K with all 40 banks in RAM (RTF 1.52) before Q8_0 there (2.43), both ways
assert man["auto"] == {"auto-speed": ["speed", "quality", "mid-q4", "mid-q6", "ram-q4", "ram-q6", "ram"],
                       "auto-quality": ["quality", "mid-q6", "ram-q6", "ram", "speed", "mid-q4", "ram-q4"]}, man["auto"]
perf = sorted(t["id"] for t in man["tiers"] if (t.get("opts") or {}).get("fish_drama3.perf_mode") == "cuda_perf")
assert perf == ["ram-q4", "ram-q6"], perf                               # cuda_perf only where it measured faster; 2375: not mid-q6 (his 👎 of 09.11)
spec = __import__("importlib.util").util.spec_from_file_location("drama3", HERE / "reader_engines/drama3/engine.py")
d3 = __import__("importlib.util").util.module_from_spec(spec)
spec.loader.exec_module(d3)
o = d3._opts({"opts": {"fish_drama3.perf_mode": "cuda_perf", "fish_drama3.cpu_expert_layers": 2, "fish_drama3.context_length": 9, "x.y": 1}})
assert o == {"fish_drama3.perf_mode": "cuda_perf"}, o
so = d3.config({"device": "cuda", "threads": 16, "model": Path("/m.gguf"), "cel": 40, "opts": o}, 9000)["models"][0]["session_options"]
assert so == {"fish_drama3.perf_mode": "cuda_perf", "fish_drama3.cpu_expert_layers": 40, "fish_drama3.context_length": 4096}, so
assert man["license"]["credit"] == "Built with Fish Audio"

with tempfile.TemporaryDirectory() as tmp:
    kit = Path(tmp)
    for t in man["tiers"]:
        r.paths.narrator_file(t["model"], kit).parent.mkdir(parents=True, exist_ok=True)   # HERESY 2330: under models/narrator/
        r.paths.narrator_file(t["model"], kit).write_bytes(b"gguf")
    rooms = {"cards": {0: 24000, 1: 16700}}

    def free_gpu(need, why="", only=None, claim=True, unload=True, held=None, role="jobs"):
        assert claim is False and unload is False, (claim, unload)          # a look: nothing claimed, the Studio's models left alone
        cs = {c: m for c, m in rooms["cards"].items() if only is None or c == only}
        ok = sorted(((m, c) for c, m in cs.items() if m >= need), reverse=True)
        if not ok:
            raise RuntimeError(f"no card can take this now (it needs {need} MB)")
        return ok[0][1], ok[0][0]

    r.setup(kit=kit, free_gpu=free_gpu, jobs={}, lock=None)
    ram = {"gb": 200.0}
    r._ram_gb = lambda: ram["gb"]
    eng = {"id": "drama3", "label": "Fish Audio Drama 3", "tiers": r._tiers_of(man["tiers"])}
    eng["tier_auto"] = r._auto_of(man["auto"], eng["tiers"])
    assert all(t["ready"] for t in eng["tiers"]), eng["tiers"]

    def pick(ask="auto-speed", card="auto"):
        p = r.tier_pick(eng, ask, card)
        return p["tier"]["id"], p["card"], p["reason"]

    named = {t["id"]: t["named"] for t in eng["tiers"]}
    assert [i for i, n in named.items() if not n] == ["mid-q4", "mid-q6", "ram-q4", "ram-q6"] and eng["tier_auto"] == man["auto"], named
    assert eng["tiers"][4]["opts"] == {"fish_drama3.perf_mode": "cuda_perf"} and eng["tiers"][3]["opts"] == {}, eng["tiers"][3:5]
    assert pick() == ("speed", 0, "fits")                                   # a card with 24 GB free: Q4_K, speed first
    assert pick("auto-quality") == ("quality", 0, "fits")
    assert pick(card=1) == ("mid-q4", 1, "fits")                            # 16.7 GB free on GPU 1: Q4_K with 20 banks in RAM
    assert pick("auto-quality", card=1) == ("mid-q6", 1, "fits")            # Q6_K with 28
    rooms["cards"] = {0: 16700, 1: 16700, 2: 16700}                         # today: the dataset holds 7.8 GB of each card
    assert pick()[0::2] == ("mid-q4", "fits") and pick("auto-quality")[0] == "mid-q6"
    rooms["cards"] = {0: 15500}                                             # 15.5 GB: Q6_K with 28 banks either way (it peaks at 15.2 GB, HERESY 2311)
    assert pick() == ("mid-q6", 0, "fits") and pick("auto-quality") == ("mid-q6", 0, "fits")
    rooms["cards"] = {0: 10000}                                             # 10 GB: all 40 banks in RAM
    assert pick() == ("ram-q4", 0, "fits") and pick("auto-quality") == ("ram-q6", 0, "fits")   # 2375: Q6_K's before Q8_0's
    ram["gb"] = 35.0                                                        # Q8_0's experts want 40 GB: quality first takes Q6_K's anyway
    assert pick("auto-quality") == ("ram-q6", 0, "fits")
    ram["gb"] = 26.0                                                        # Q6_K's want 30 GB: Q4_K's
    assert pick("auto-quality") == ("ram-q4", 0, "fits") and pick() == ("ram-q4", 0, "fits")
    rooms["cards"] = {0: 16700, 1: 16700, 2: 16700}
    ram["gb"] = 30.0                                                        # without the order of 2287: Q8_0 wants 40 GB, the processor
    old = dict(eng, tier_auto=None)
    assert r.tier_pick(old, "auto-speed", "auto")["tier"]["id"] == "cpu-q4" and r.tier_pick(old, "auto-speed", "auto")["reason"] == "no-ram"
    assert pick() == ("mid-q4", 2, "fits")                                  # with it: Q4_K with 20 banks in RAM, 13 GB of memory
    ram["gb"] = 12.0                                                        # too little memory for any tier, the processor's too
    try:
        pick()
        raise AssertionError("a pick with too little memory for any tier")
    except ValueError as e:
        assert "processor" in str(e) and "12 GB" in str(e), e
    sel = [t["id"] for e in r.engines_public()["engines"] if e["id"] == "drama3" for t in e["tiers"]]
    assert sel == ["speed", "quality", "ram", "q8", "cpu", "cpu-q6", "cpu-q4"], sel   # the room's select: the named tiers only, Auto takes the rest
    ram["gb"] = 200.0
    rooms["cards"] = {0: 5000, 1: 6000}                                     # no card with 7 GB: the processor, Q8_0
    assert pick() == ("cpu", "cpu", "no-card")
    ram["gb"] = 38.0
    assert pick() == ("cpu-q6", "cpu", "no-card")
    ram["gb"] = 20.0
    try:
        pick()
        raise AssertionError("a pick with no card and too little memory")
    except ValueError as e:
        assert "processor" in str(e) and "20 GB" in str(e), e
    ram["gb"] = 200.0
    assert pick("speed") == ("speed", None, "wait")                         # a named tier waits for its card
    # HERESY 2290: Q8_0 by name: 20 banks on a free card, all 40 in RAM on a shared one, the processor (Q8_0 too) when no card has 7.4 GB
    assert pick("q8") == ("cpu", "cpu", "no-card")
    assert r._picks(eng, "q8") and r._picks(eng, "auto-speed") and not r._picks(eng, "speed")
    rooms["cards"] = {0: 9000}
    assert pick("q8") == ("ram", 0, "shared") and pick("q8", 0) == ("ram", 0, "shared")
    rooms["cards"] = {0: 24000}
    assert pick("q8") == ("q8", 0, "asked")
    rooms["cards"] = {0: 5000}
    assert pick("q8", 0) == ("q8", None, "wait")                         # a card named: no processor behind its back
    rooms["cards"] = {0: 5000, 1: 6000}
    assert pick(card="cpu") == ("cpu", "cpu", "cpu-asked")
    ram["gb"] = None                                                        # unread memory: said so, not taken for none
    r._ram_gb = lambda: None
    assert pick(card="cpu")[0] == "cpu"
    r._ram_gb = lambda: ram["gb"] or 200.0
    r.paths.narrator_file(man["tiers"][0]["model"], kit).unlink()                               # Q4_K's file gone: auto takes Q6_K on the big card
    eng["tiers"] = r._tiers_of(man["tiers"])
    rooms["cards"] = {0: 24000}
    assert pick() == ("quality", 0, "fits")
    try:
        r.tier_pick(eng, "speed", "auto")
        raise AssertionError("a tier whose model is missing picked")
    except ValueError as e:
        assert "not here" in str(e), e
    # the preview: its expected time is the load and the tier's measured speed
    r._engine = lambda eid: eng
    pv = r.tier_preview({"engine": "drama3", "ask": "auto-speed", "card": "auto", "chars": "1400"})
    assert pv["tier"]["id"] == "quality" and pv["card"] == 0 and pv["speech_s"] == 100.0, pv
    assert pv["expect_s"] == round(75 + 100 * 1.16) and not pv["kept"], pv
    assert r.tier_preview({"engine": "x", "card": "cpu", "chars": "14"})["tier"]["device"] == "cpu"
print("test_reader_tiers: ok")
