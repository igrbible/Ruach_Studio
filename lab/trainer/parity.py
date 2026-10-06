"""Stage 1 parity, our side (HERESY 1083): lab/trainer's model on the same fixed input as parity_aitk.py.
Prints, per check, the largest and the relative difference; the verdict is the numbers, not a word.

    CUDA_VISIBLE_DEVICES=N .venv/bin/python lab/trainer/parity.py CKPT AITK_OUT.pt"""
import os, sys, time

import torch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from load import load_model  # noqa: E402

ckpt, ref_path = sys.argv[1], sys.argv[2]
ref = torch.load(ref_path)
t0 = time.time()
DEV = os.environ.get("DEV", "cuda")
DT = getattr(torch, os.environ.get("DTYPE", "bfloat16"))
model = load_model(ckpt, DEV, DT)
model.eval()
print(f"loaded in {time.time() - t0:.0f} s; int8 layers unpacked: {model.ruach_unpacked}")


def diff(name, a, b):
    a, b = a.float(), b.float()
    d = (a - b).abs()
    rel = (d.norm() / b.norm()).item()
    print(f"{name:42s} max {d.max().item():.3e}  rel {rel:.3e}")
    return rel


worst_w = 0.0
for name, w in ref["weights"].items():
    m = model.get_submodule(name)
    worst_w = max(worst_w, diff("weight " + name, m.weight.detach().cpu(), w))
ids, noisy = ref["ids"], ref["noisy"]
with torch.no_grad():
    emb = model.ar.embed(ids.to(DEV))
    cache, hidden = model.ar.prefill(emb, return_hidden=True)
    logits = model.ar.model.lm_head(hidden[:, -16:])
    vel = model.nar(noisy.to(DEV, DT), torch.tensor([0.5], device=DEV), cache, ids.shape[1])
rl = diff("AR logits (last 16 positions)", logits.cpu(), ref["logits"])
rv = diff("NAR velocity (t 0.5, 250 frames)", vel.cpu(), ref["velocity"])
top_same = (logits.argmax(-1).cpu() == ref["logits"].argmax(-1)).float().mean().item()
print(f"AR top-1 agreement on the 16 positions: {top_same:.0%}")
print(f"VERDICT weights rel≤{worst_w:.1e} · logits rel {rl:.1e} · velocity rel {rv:.1e}")
