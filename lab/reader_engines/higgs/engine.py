"""The Narrator's second engine (2.0.8): Boson AI's Higgs TTS 3 (Higgs Audio v3, 4B on Qwen3), read with 🤗 transformers. Viktor 11.11.2026:
«оба движка дал бы в паблик… дальше ответственность и пальцедвижения пользователя»; Higgs v3 in the 2.0.8 cut.

The Studio carries none of Boson's weights and mirrors none: the user fetches them from Boson's own repos (Engine → Models → Narrator · Higgs
TTS 3, or heresy/fetch-heresy.sh --higgs bf16) into models/narrator/higgs-tts-3-4b and models/narrator/higgs-audio-v2-tokenizer, each with its
LICENSE, and with the three small loader files (config.json with its auto_map, configuration_ and modeling_higgs_multimodal_qwen3.py) from
multimodalart's port, whose weights are Boson's byte for byte. This folder holds only the code that loads them and hands them text.

The model in BF16, its codec in FP32, offline. A voice is kept as the codec's own codes ([T, N]), so a voice held through a long reading is
encoded once. Each piece is one generation and one decode, no text cut inside it, no clamp (HERESY 2419): the float sound as the codec gives it;
its generated codes go to the worker (h["last_codes"]), which keeps them beside the piece.

Boson Higgs TTS 3 Research and Non-Commercial License (its LICENSE beside the model; this folder's NOTICE): research and non-commercial use;
a creator's own published work with «This audio was created with Boson AI's Higgs Audio»; no hosting for others, no product for third parties
and no commercial use without Boson's written licence; nothing it makes used to train any model (the Narrator marks every take, lab/no_train.py);
no real person's voice without their explicit, verifiable consent. Built with Higgs TTS 3 licensed from Boson AI USA, Inc.
(Claude, night 11→12.11.2026, lane models-safety)"""
import json
import os
import sys
from pathlib import Path

os.environ.setdefault("HF_HUB_OFFLINE", "1")             # the local folders only: never the hub, never its cache
os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")

import numpy as np   # noqa: E402
import torch         # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))   # lab/
import paths  # noqa: E402   HERESY 2330: where the weights live

SR = 24000
MODEL = "higgs-tts-3-4b"
CODEC = "higgs-audio-v2-tokenizer"
LOADER = ("config.json", "configuration_higgs_multimodal_qwen3.py", "modeling_higgs_multimodal_qwen3.py")


def _tier():
    try:
        t = json.loads(os.environ.get("READER_TIER") or "{}")
    except ValueError:
        t = {}
    return t if isinstance(t, dict) else {}


def _check(m, c):
    """what must lie where before a byte is loaded: the weights, the loader's three files, and both licences beside their models"""
    lack = [str(p) for p in [m / "model.safetensors", m / "tokenizer.json", *(m / f for f in LOADER), c / "model.safetensors", c / "config.json"]
            if not p.is_file()]
    if lack:
        raise RuntimeError("Higgs TTS 3 is not all here (Engine → Models → Narrator · Higgs TTS 3 fetches it from Boson's own repos): " + ", ".join(lack))
    nolic = [str(d) for d in (m, c) if not (d / "LICENSE").is_file()]
    if nolic:
        raise RuntimeError("Boson's licence must lie beside its model, and there is no LICENSE in " + ", ".join(nolic))


def load(device, kit):
    if device not in ("cuda", "xpu", "cpu"):
        raise RuntimeError("Higgs TTS 3 reads on a card (CUDA or Intel XPU) or on the processor")
    from transformers import AutoModelForCausalLM, AutoTokenizer
    m, c = paths.narrator_file(MODEL, kit), paths.narrator_file(CODEC, kit)
    _check(m, c)
    if device == "cpu":
        torch.set_num_threads(max(1, int(_tier().get("threads") or (os.cpu_count() or 8) // 2)))
    tok = AutoTokenizer.from_pretrained(str(m), trust_remote_code=True)
    model = AutoModelForCausalLM.from_pretrained(str(m), trust_remote_code=True, dtype=torch.bfloat16).to(device).eval()
    model.config.audio_tokenizer_id = str(c)              # the local codec, never the hub
    model.get_audio_codec()
    print(f"higgs: {m.name} in BF16, its codec in FP32, on {'the processor' if device == 'cpu' else 'the card'}", flush=True)
    return {"model": model, "tok": tok, "device": device, "dir": m}


def reference(h, wav, sr, text):
    codes = h["model"]._encode_reference(torch.from_numpy(np.ascontiguousarray(wav, dtype=np.float32)), int(sr))
    return {"codes": codes.detach().cpu(), "text": " ".join(str(text or "").split()) or None}


def say(h, text, ref, opts):
    from transformers import set_seed
    if opts.get("seed") is not None:
        set_seed(int(opts["seed"]))
    kw = {"reference_codes": ref["codes"], "reference_text": ref["text"]} if ref else {}
    model, got = h["model"], {}
    decode = model._decode_codes

    def keep(codes_tn):                                  # HERESY 2419: the piece's codes as generated, kept by the worker beside the piece
        got["codes"] = codes_tn.detach().cpu().numpy()
        return decode(codes_tn)
    model._decode_codes = keep
    try:
        with torch.inference_mode():
            w = model.generate_speech(text, h["tok"], temperature=float(opts.get("temperature", 0.8)), top_k=int(opts.get("top_k", 50)),
                                      max_new_tokens=int(opts.get("max_new_tokens", 2048)), **kw)
    finally:
        model._decode_codes = decode
    if "codes" in got:
        h["last_codes"] = {"codes": got["codes"].T, "codec": "higgs-audio-v2-tokenizer (codebooks × frames)", "sample_rate": SR}
    return w.detach().float().cpu().numpy().astype(np.float32).reshape(-1), SR


def state(h):
    return {"model": h["dir"].name, "device": h["device"]}
