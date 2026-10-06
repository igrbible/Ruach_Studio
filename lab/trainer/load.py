"""Ruach Studio's own trainer (HERESY 1083): the Comfy-Org YuE2 checkpoint into lab/trainer/model.py.

The repack holds both experts: ``text_encoders.*`` (the AR) and ``model.diffusion_model.*`` (the NAR),
bf16, or int8 with a ``.comfy_quant`` marker per quantized layer. An int8 layer is unpacked to bf16 here
(the trainer trains on bf16 weights; the int8 runtime of AI-Toolkit is its own business):

    w = rotate(q · scale_row, rot)        rot = convrot_groupsize (256) when convrot, else 1

rotate() is the block regular-Hadamard of ConvRot, its own inverse: AI-Toolkit's
toolkit/util/convrot_quant.py (MIT, Ostris), regular_hadamard() and rotate(), which this repeats.
Loading is strict: a weight the network has and the file lacks, or the other way round, is an error,
never a silent default."""
import json
from typing import Dict

import torch
from safetensors import safe_open

from model import YuE2Model

_HADAMARD: Dict[tuple, torch.Tensor] = {}


def regular_hadamard(rot_size: int, device, dtype=torch.float32) -> torch.Tensor:
    """Kronecker powers of the 4x4 regular Hadamard matrix, orthonormal (AI-Toolkit's, unchanged)."""
    key = (rot_size, str(device), dtype)
    if key not in _HADAMARD:
        r4 = torch.tensor([[1.0, 1, 1, -1], [1, 1, -1, 1], [1, -1, 1, 1], [-1, 1, 1, 1]], dtype=torch.float32)
        h = r4.clone()
        while h.shape[0] < rot_size:
            h = torch.kron(h, r4)
        if h.shape[0] != rot_size:
            raise ValueError(f"rot_size {rot_size} is not a power of 4")
        _HADAMARD[key] = (h / rot_size ** 0.5).to(device=device, dtype=dtype)
    return _HADAMARD[key]


def rotate(x: torch.Tensor, rot_size: int) -> torch.Tensor:
    if rot_size == 1:
        return x
    shape = x.shape
    return torch.matmul(x.reshape(-1, shape[-1] // rot_size, rot_size), regular_hadamard(rot_size, x.device, x.dtype)).reshape(shape)


def unpack(weight: torch.Tensor, scale: torch.Tensor, conf: dict) -> torch.Tensor:
    """An int8 (out, in) weight and its per-row scale, back to float32 in the original basis."""
    if conf.get("format") != "int8_tensorwise":
        raise ValueError(f"unsupported comfy quant format {conf.get('format')!r}")
    rot = int(conf.get("convrot_groupsize", 256)) if conf.get("convrot") else 1
    w = weight.float() * scale.float().reshape(-1, 1)
    return rotate(w, rot)


def read_checkpoint(path: str, device="cpu", dtype=torch.bfloat16):
    """The checkpoint as a plain {key: tensor} in `dtype`, int8 layers unpacked; and how many were."""
    out, unpacked = {}, 0
    with safe_open(path, framework="pt", device=device) as f:
        keys = list(f.keys())
        markers = {k[: -len(".comfy_quant")] for k in keys if k.endswith(".comfy_quant")}
        for k in keys:
            if k.endswith(".comfy_quant") or k.endswith(".weight_scale") or k == "text_encoders.yue2_tokenizer_json":
                continue
            prefix = k[: -len(".weight")] if k.endswith(".weight") else None
            if prefix in markers:
                conf = json.loads(bytes(f.get_tensor(prefix + ".comfy_quant").tolist()).decode("utf-8"))
                out[k] = unpack(f.get_tensor(k), f.get_tensor(prefix + ".weight_scale"), conf).to(dtype)
                unpacked += 1
            else:
                t = f.get_tensor(k)
                out[k] = t.to(dtype) if t.is_floating_point() else t
    return out, unpacked


def load_model(path: str, device="cuda", dtype=torch.bfloat16) -> YuE2Model:
    sd, unpacked = read_checkpoint(path, "cpu", dtype)
    model = YuE2Model()
    nar = {k[len("model.diffusion_model."):]: v for k, v in sd.items() if k.startswith("model.diffusion_model.")}
    ar = {k[len("text_encoders."):]: v for k, v in sd.items() if k.startswith("text_encoders.")}
    for name, module, part in (("NAR", model.nar, nar), ("AR", model.ar, ar)):
        missing, unexpected = module.load_state_dict(part, strict=False)
        if missing or unexpected:
            raise ValueError(f"YuE2 {name}: missing {missing[:5]} (+{max(0, len(missing) - 5)}), unexpected {unexpected[:5]} (+{max(0, len(unexpected) - 5)})")
    model.ruach_unpacked = unpacked
    return model.to(device=device, dtype=dtype)
