"""Ruach Studio's own trainer (HERESY 1083): LoRA on both experts of YuE2.

The layers AI-Toolkit trains (counted in its LoRAs: 448 tensors) — in every one of the 28 layers of the
AR and of the NAR: self_attn.qkv_proj, self_attn.o_proj, mlp.gate_up_proj, mlp.down_proj. Saved under
its key names, so the engine loads ours as it loads its:
    text_encoders.model.layers.N.<module>.lora_A.weight / lora_B.weight      (the AR)
    diffusion_model.model.layers.N.<module>.lora_A.weight / lora_B.weight    (the NAR)
A is (rank, in), B is (out, rank), alpha = rank (scale 1). A starts kaiming-uniform, B at zero, so the
adapter starts as nothing. The adapter's weights are kept in float32 and computed in the input's dtype."""
import math
from typing import Dict, List

import torch
from torch import nn

TARGETS = ("self_attn.qkv_proj", "self_attn.o_proj", "mlp.gate_up_proj", "mlp.down_proj")
PREFIX = {"ar": "text_encoders", "nar": "diffusion_model"}


class LoRALinear(nn.Module):
    def __init__(self, base: nn.Linear, rank: int, alpha: float):
        super().__init__()
        self.base = base
        self.rank, self.scale = rank, alpha / rank
        self.lora_A = nn.Parameter(torch.empty(rank, base.in_features, dtype=torch.float32, device=base.weight.device))
        self.lora_B = nn.Parameter(torch.zeros(base.out_features, rank, dtype=torch.float32, device=base.weight.device))
        nn.init.kaiming_uniform_(self.lora_A, a=math.sqrt(5))
        self.enabled = True

    def forward(self, x):
        out = self.base(x)
        if not self.enabled:
            return out
        return out + (x @ self.lora_A.to(x.dtype).t() @ self.lora_B.to(x.dtype).t()) * self.scale


def inject(model, rank: int, alpha: float = None) -> Dict[str, List[LoRALinear]]:
    """Wrap the target linears of both experts; the base stays frozen. Returns {"ar": [...], "nar": [...]}."""
    alpha = float(alpha or rank)
    for p in model.parameters():
        p.requires_grad_(False)
    out = {"ar": [], "nar": []}
    for half, expert in (("ar", model.ar), ("nar", model.nar)):
        for i, layer in enumerate(expert.model.layers):
            for target in TARGETS:
                parent_name, attr = target.split(".")
                parent = getattr(layer, parent_name)
                lora = LoRALinear(getattr(parent, attr), rank, alpha)
                lora.ruach_key = f"{PREFIX[half]}.model.layers.{i}.{target}"
                setattr(parent, attr, lora)
                out[half].append(lora)
    return out


def set_enabled(loras: Dict[str, List[LoRALinear]], on: bool):
    for group in loras.values():
        for m in group:
            m.enabled = on


def state_dict(loras: Dict[str, List[LoRALinear]], dtype=torch.bfloat16) -> Dict[str, torch.Tensor]:
    sd = {}
    for group in loras.values():
        for m in group:
            sd[m.ruach_key + ".lora_A.weight"] = m.lora_A.detach().to(dtype).cpu().contiguous()
            sd[m.ruach_key + ".lora_B.weight"] = (m.lora_B.detach() * m.scale).to(dtype).cpu().contiguous()
    return sd


def load_into(loras: Dict[str, List[LoRALinear]], sd: Dict[str, torch.Tensor]):
    """Back from a saved file (to go on from a checkpoint): A as saved, B unscaled."""
    for group in loras.values():
        for m in group:
            m.lora_A.data.copy_(sd[m.ruach_key + ".lora_A.weight"].float())
            m.lora_B.data.copy_(sd[m.ruach_key + ".lora_B.weight"].float() / m.scale)
