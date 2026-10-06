"""Stage 1 parity, the reference side: AI-Toolkit's own YuE2 model (run with AI-Toolkit's .venv, from its
folder). Saves, for one fixed input, the dequantized weights of a few layers, the AR's last-position
logits and the NAR's velocity, to compare with lab/trainer/parity.py.

    cd ~/Documents/AI/AI_Toolkit && CUDA_VISIBLE_DEVICES=N .venv/bin/python PATH/parity_aitk.py CKPT OUT.pt"""
import os, sys

import torch
from safetensors.torch import load_file

from extensions_built_in.audio_models.yue2.src.model import YuE2Model

ckpt, out = sys.argv[1], sys.argv[2]
DEV = os.environ.get("DEV", "cuda")
DT = getattr(torch, os.environ.get("DTYPE", "bfloat16"))
model = YuE2Model.load_from_state_dict(load_file(ckpt), dtype=DT).to(DEV)
model.eval()
LAYERS = ["ar.model.layers.0.self_attn.qkv_proj", "ar.model.layers.13.mlp.gate_up_proj", "ar.model.layers.27.mlp.down_proj",
          "nar.model.layers.0.self_attn.o_proj", "nar.model.layers.20.mlp.gate_up_proj", "ar.model.lm_head", "ar.model.embed_tokens"]
weights = {}
for name in LAYERS:
    m = model.get_submodule(name)
    w = m.dequantize_weight() if hasattr(m, "dequantize_weight") else m.weight
    weights[name] = w.detach().float().cpu()
g = torch.Generator().manual_seed(1234)
ids = torch.randint(0, 151000, (1, 384), generator=g)
noisy = torch.randn(1, 250, 64, generator=g)
with torch.no_grad():
    emb = model.ar.embed(ids.to(DEV))
    cache, hidden = model.ar.prefill(emb, return_hidden=True)
    logits = model.ar.model.lm_head(hidden[:, -16:])
    vel = model.nar(noisy.to(DEV, DT), torch.tensor([0.5], device=DEV), cache, ids.shape[1])
torch.save({"weights": weights, "logits": logits.float().cpu(), "velocity": vel.float().cpu(), "ids": ids, "noisy": noisy}, out)
print("saved", out, {k: tuple(v.shape) for k, v in weights.items()})
