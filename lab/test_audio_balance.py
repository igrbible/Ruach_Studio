"""HERESY 2002: the gateway's channel balance kept with it, its limits, dropped when the gateway's devices change. python3 lab/test_audio_balance.py"""
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import audio_io as aio  # noqa: E402

bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got) + ")"))
    if not ok:
        bad.append(what)


with tempfile.TemporaryDirectory() as t:
    try:
        aio.set_balance(t, [0, -0.74])
        check("no balance before the gateway has its devices", False, "kept")
    except ValueError as e:
        check("no balance before the gateway has its devices", "gateway" in str(e), e)
    g = aio.set_gateway(t, "hw:CARD=S24,DEV=0", "hw:CARD=S24,DEV=0", 48000)
    check("a gateway without a balance reads as before", g == {"out": "hw:CARD=S24,DEV=0", "in": "hw:CARD=S24,DEV=0", "rate": 48000}, g)
    g = aio.set_balance(t, [0, -0.74], -36)
    check("the right side lowered by 0.74 dB, kept with the level it was measured at", g.get("balance_db") == [0.0, -0.74] and g.get("balance_level_db") == -36.0 and g.get("balance_at"), g)
    check("  read back the same", aio.gateway(t) == g, aio.gateway(t))
    g2 = aio.set_gateway(t, "hw:CARD=S24,DEV=0", "hw:CARD=S24,DEV=0", 48000)
    check("the same devices kept again keep it", g2.get("balance_db") == [0.0, -0.74], g2)
    for raw, why in (([0, -1.6], "more than 1.5 dB"), ([0.3, 0], "a side lifted"), ([0], "one number"), (["a", 0], "not a number")):
        try:
            aio.set_balance(t, raw)
            check("refused: " + why, False, "kept")
        except ValueError as e:
            check("refused: " + why, True, e)
    check("  a refusal leaves it as it was", aio.gateway(t).get("balance_db") == [0.0, -0.74])
    g = aio.set_balance(t, [0, 0])
    check("[0, 0] takes it off", "balance_db" not in g, g)
    aio.set_balance(t, [-0.5, 0], -36)
    g = aio.set_gateway(t, "hw:CARD=S24,DEV=0", "hw:CARD=S24,DEV=0", 96000)
    check("another rate drops it", "balance_db" not in g, g)
print("FAILED: " + ", ".join(bad) if bad else "all passed")
sys.exit(1 if bad else 0)
