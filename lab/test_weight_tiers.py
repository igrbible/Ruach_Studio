"""HERESY 1984: the Engine's tiers in weights.py: a room's models at the variants the biggest card takes (as launcher/extras.sh chooses them), what
is here counting nothing, a tier fetched item by item and refused without room on the disk, the runs' counts summed.
    python3 lab/test_weight_tiers.py"""
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import muscriptor  # noqa: E402
import weights  # noqa: E402

fails = 0


def check(what, ok, said=""):
    global fails
    fails += not ok
    print(("PASS " if ok else "FAIL ") + what + ("" if ok else f"  ({said})"))


def near(a, b):
    return abs(a - b) < 1e6


def card(mb):
    weights._BIG[:] = [mb]


muscriptor.suggest = lambda kit: "large"
with tempfile.TemporaryDirectory() as d:
    k = Path(d)
    (k / "models").mkdir()
    (k / "models" / "YuE2-3B-BF16.gguf").write_bytes(b"x")
    card(24576)
    t = {x["id"]: x for x in weights.tiers(k)}
    picks = {i: [(x["extra"], x["variant"]) for x in t[i]["items"]] for i in t}
    check("six tiers, in the rooms' order", list(t) == ["writer", "refiner", "artist", "videographer", "trainer", "merges"], list(t))
    check("a 24 GB card: the writer's quality, the Qwen painter at Q6, H3 int8 and SeedVR2 7B, the trainer's bf16 and the listener's Q8_0",
          picks["writer"] == [("writer", "quality")] and picks["artist"] == [("artwork", "all"), ("qwen", "2512-q6")] and
          picks["videographer"] == [("h3", "int8"), ("upscaler", "7b")] and picks["trainer"] == [("trainer", "bf16"), ("listener", "Q8_0")], picks)
    check("  the Refiner: MuScriptor's suggested size and FlashSR", picks["refiner"] == [("muscriptor", "large"), ("flashsr", "all")], picks["refiner"])
    # HERESY 2074: the install brings RS-TW 2.0x0.75 now (2065): the room takes the seven RS-FW and RS-TW 2.0x0.9
    check("  every merge beside the default at the backbone's quant: IRA, five IRAE, seven RS-FW and RS-TW 2.0x0.9 (2074)", len(picks["merges"]) == 14 and
          ("fw", "2.4x0.75-BF16") in picks["merges"] and ("tw", "2.0x0.9-BF16") in picks["merges"] and ("tw", "2.0x0.75-BF16") not in picks["merges"] and ("irae", "IRAE-IRv2-BF16") in picks["merges"] and all(v.endswith("BF16") for _, v in picks["merges"]), picks["merges"])
    check("  the Artist's sizes: 8.4 + 34.5 GB, nothing here", near(t["artist"]["need"], 42.9e9) and near(t["artist"]["total"], 42.9e9), t["artist"])
    check("  the Videographer's: 69 + 17 GB", near(t["videographer"]["total"], 86e9), t["videographer"]["total"])
    (k / "models" / "muscriptor" / "v1").mkdir(parents=True)
    (k / "models" / "muscriptor" / "v1" / "muscriptor-large-f16.gguf").write_bytes(b"x")
    r = next(x for x in weights.tiers(k) if x["id"] == "refiner")
    check("an item here counts nothing: the Refiner needs FlashSR alone", near(r["need"], 3.3e9) and near(r["total"], 6.0e9) and [i["here"] for i in r["items"]] == [True, False], r)
    card(12288)
    t = {x["id"]: x for x in weights.tiers(k)}
    check("a 12 GB card: the writer's quality, the painter at Q4, the trainer's int8 with the listener's Q8_0, no Videographer and why",
          [(i["variant"]) for i in t["writer"]["items"]] == ["quality"] and t["artist"]["items"][1]["variant"] == "2512-q4" and
          [i["variant"] for i in t["trainer"]["items"]] == ["int8", "Q8_0"] and t["videographer"]["items"] == [] and "24 GB" in t["videographer"]["why"], t)
    card(8192)
    t = {x["id"]: x for x in weights.tiers(k)}
    check("an 8 GB card: the compact writer, the listener's Q4_K_M", t["writer"]["items"][0]["variant"] == "compact" and t["trainer"]["items"][1]["variant"] == "Q4_K_M", t)
    card(6144)
    t = {x["id"]: x for x in weights.tiers(k)}
    check("a 6 GB card: no writer, said why", t["writer"]["items"] == [] and "8 GB" in t["writer"]["why"], t["writer"])
    (k / "models" / "YuE2-3B-BF16.gguf").unlink()
    (k / "models" / "YuE2-3B-Q5_K_M.gguf").write_bytes(b"x")
    m = next(x for x in weights.tiers(k) if x["id"] == "merges")
    check("a Q5_K_M install: the merges at Q6_K (none at Q5_K_M)", all(i["variant"].endswith("Q6_K") for i in m["items"]), m["items"][:2])

    # the fetch: refused without room, else a run an item, the ones here left out
    card(24576)
    (k / "heresy").mkdir()
    (k / "heresy" / "fetch-heresy.sh").write_text("#!/bin/bash\n")
    got = []
    weights._start = lambda kit, args, what, kind, then_check, which=None, expect=None: got.append((args, what, which, expect)) or {}
    weights._free = lambda kit: 40e9
    try:
        weights.fetch(k, {"tier": "artist"}); said = ""
    except ValueError as e:
        said = str(e)
    check("a tier bigger than the free room is refused, saying both", "not enough room" in said and "42.9 GB" in said and "40.0 GB" in said and not got, said)
    weights._free = lambda kit: 50e9
    weights.fetch(k, {"tier": "refiner"})
    check("  with room: one run for what is not here (FlashSR), its size expected, the tier its row",
          got and got[-1][0] == [["--only", "none", "--flashsr", "all", "--yes"]] and got[-1][2] == {"tier": "refiner"} and near(got[-1][3], 3.3e9), got)
    weights.fetch(k, {"tier": "artist"})
    check("  the Artist: the helpers and the painter, a run each", got[-1][0] == [["--only", "none", "--artwork", "--yes"], ["--only", "none", "--qwen", "2512-q6", "--yes"]], got[-1][0])
    (k / "models" / "upbundle" / "flashsr" / "weights").mkdir(parents=True)
    for n in ("student_ldm.pth", "sr_vocoder.pth", "vae.pth"):
        (k / "models" / "upbundle" / "flashsr" / "weights" / n).write_bytes(b"x")
    try:
        weights.fetch(k, {"tier": "refiner"}); said = ""
    except ValueError as e:
        said = str(e)
    check("  all of a tier here: refused, said so", "is here" in said, said)
    try:
        weights.fetch(k, {"tier": "nope"}); said = ""
    except ValueError as e:
        said = str(e)
    check("  an unknown tier: refused, the tiers named", "writer" in said and "merges" in said, said)
    try:
        weights.fetch(k, {"tier": "artist"}, "claude"); said = ""
    except ValueError as e:
        said = str(e)
    check("  a test page fetches no tier either", "test page" in said, said)

# the runs' counts summed, a line between them
seq = iter([{"here": 1, "unknown": 0, "differs": 0, "fetched": 2, "missing": 0, "failed": 0}, {"here": 0, "unknown": 0, "differs": 0, "fetched": 1, "missing": 0, "failed": 1}])


def say(kit, args):
    with weights.LOCK:
        weights.JOB["counts"] = next(seq)
    return 0 if args[-1] == "a" else 1


weights._say = say
weights.JOB.clear()
weights.JOB.update(kind="fetch", lines=[], counts=None, status="running")
weights._run(Path("."), [["a"], ["b"]], False)
check("a tier's runs: their counts summed, failed if one failed, «1 of 2» and «2 of 2» said",
      weights.JOB["counts"] == {"here": 1, "unknown": 0, "differs": 0, "fetched": 3, "missing": 0, "failed": 1} and weights.JOB["status"] == "failed" and
      [x.strip() for x in weights.JOB["lines"]] == ["— 1 of 2 —", "— 2 of 2 —"], weights.JOB)
check("the parts' sizes measured anew: the decoders 1.1 GB, UniverSR with Apollo 0.4 GB", weights.PARTS["extras"] == "1.1 GB" and weights.PARTS["upscale"] == "0.4 GB", weights.PARTS)
print(("FAILED " if fails else "all passed ") + str(fails))
sys.exit(1 if fails else 0)
