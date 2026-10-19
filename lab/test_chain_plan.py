"""HERESY 1508: the chain's steps and «up to this node». python3 lab/test_chain_plan.py"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import chain_plan as cp  # noqa: E402

bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got) + ")"))
    if not ok:
        bad.append(what)


def names(spec):
    return " ".join(s["step"] + ("·end" if s.get("end") else "") for s in cp.steps(spec))


full = {"debuzz": True, "upscale": True, "stems": True, "upscale_end": True, "inspect": True, "spectrum": True, "gloss": True}
check("the whole chain in its order", names(full) == "debuzz upscale stems remaster upscale·end inspect spectrum gloss", names(full))
check("up to Debuzz: Debuzz alone", names(dict(full, until="debuzz")) == "debuzz", names(dict(full, until="debuzz")))
check("up to Upscale: the first one, not the end's", names(dict(full, until="upscale")) == "debuzz upscale", names(dict(full, until="upscale")))
check("up to Stems: no remaster, no checks", names(dict(full, until="stems")) == "debuzz upscale stems", names(dict(full, until="stems")))
check("up to Remaster: the end's upscale and the checks left out", names(dict(full, until="remaster")) == "debuzz upscale stems remaster",
      names(dict(full, until="remaster")))
check("a bypassed step skipped on the way", names({"debuzz": False, "stems": True, "until": "stems"}) == "stems", names({"debuzz": False, "stems": True, "until": "stems"}))
for spec, why in (({"stems": False, "until": "stems"}, "up to a step bypassed"), ({"until": "daw"}, "a step the chain has not")):
    try:
        cp.steps(spec)
        check("refused: " + why, False, "accepted")
    except ValueError:
        check("refused: " + why, True)
check("no until: as before", names({"stems": True}) == "debuzz stems remaster", names({"stems": True}))
print("test_chain_plan:", "FAILED " + ", ".join(bad) if bad else "all passed")
sys.exit(1 if bad else 0)
