"""HERESY 2084: the Trainer's spike guard (lab/trainer/train.py: spike_why, mean_over_learned, DEFAULTS), on the CPU. python3 lab/test_spike_guard.py"""
import math, os, sys
from pathlib import Path
os.environ.setdefault("CUDA_VISIBLE_DEVICES", "")
sys.path.insert(0, str(Path(__file__).resolve().parent / "trainer"))
import torch  # noqa: E402
import train as T  # noqa: E402

bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got)[:200] + ")"))
    if not ok:
        bad.append(what)


cfg = dict(T.DEFAULTS)
check("on by default: 2.25 and 5.0 (the spikes report, §6)", cfg["latent_ms_max"] == 2.25 and cfg["flow_max"] == 5.0, (cfg["latent_ms_max"], cfg["flow_max"]))
check("a normal window stays (RMS 1.0)", T.spike_why(cfg, ms=1.0) == "")
check("the worst of the set's normal tracks stays (RMS 1.23 → ms 1.51)", T.spike_why(cfg, ms=1.23 ** 2) == "")
check("a broken mp3's window leaves (RMS 1.79 → ms 3.2)", "latent mean square" in T.spike_why(cfg, ms=1.79 ** 2))
check("the noise-rock cover leaves (RMS 111)", T.spike_why(cfg, ms=111.35 ** 2) != "")
check("a NaN window leaves", T.spike_why(cfg, ms=float("nan")) != "")
check("a normal loss stays", T.spike_why(cfg, loss=3.4, flow=0.95) == "")
check("a flow of 12 398 leaves (the spike of 2084's report)", "flow" in T.spike_why(cfg, loss=12400.0, flow=12398.0))
check("a loss that is not finite leaves", T.spike_why(cfg, loss=float("inf"), flow=1.0) != "" and T.spike_why(cfg, loss=float("nan"), flow=1.0) != "")
check("a flow that is not finite leaves", T.spike_why(cfg, loss=1.0, flow=float("nan")) != "")
off = dict(cfg, latent_ms_max=0, flow_max=0)
check("0 turns both off (a finite loss)", T.spike_why(off, ms=1e6) == "" and T.spike_why(off, loss=50.0, flow=50.0) == "")
check("…but a loss that is not finite still never trains", T.spike_why(off, loss=float("nan"), flow=1.0) != "")

ps = [torch.nn.Parameter(torch.zeros(3)) for _ in range(2)]
ps[0].grad, ps[1].grad = torch.full((3,), 0.5), None
T.mean_over_learned(ps, 4, 4)
check("every track learned: the gradients as they were", torch.equal(ps[0].grad, torch.full((3,), 0.5)) and ps[1].grad is None)
T.mean_over_learned(ps, 4, 2)
check("two of four learned: the mean over the two (×2)", torch.equal(ps[0].grad, torch.full((3,), 1.0)))
T.mean_over_learned(ps, 4, 0)
check("none learned: no update for the sound half", ps[0].grad is None and ps[1].grad is None)

# the mean is the same one a step without the left-out track would give: three tracks of a batch of four, each summed as 1/4
g = [torch.tensor([1.0, 2.0]), torch.tensor([3.0, 0.0]), torch.tensor([2.0, 4.0])]
p = torch.nn.Parameter(torch.zeros(2))
p.grad = sum(x / 4 for x in g)
T.mean_over_learned([p], 4, 3)
check("three of four: equals their plain mean", torch.allclose(p.grad, sum(g) / 3), p.grad)
print("\ntest_spike_guard: " + ("all passed" if not bad else f"{len(bad)} failed"))
sys.exit(1 if bad else 0)
