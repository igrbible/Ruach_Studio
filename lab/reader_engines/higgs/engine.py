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
import re
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
CODEBOOKS = 8
LIMIT_SLACK = 16                     # HERESY 2701: frames short of the budget that still mean it ran out (the codebooks' delay)
TAG = re.compile(r"<\|[^|>]*\|>")              # its own tags (<|emotion:awe|>): a reference's words are what was said
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


def bridged(ref, previous):
    """HERESY 2695 (2483 of the Pro engine, now public; Viktor's ear on «🧪 Чтец · длинный текст · вслепую», 13.11.2026: each piece read alone,
    «врезка чужого голоса на высокой эмоции»; with the piece before it, «здесь к удивлению тот же голос»): the reference with the piece before
    it joined on, as Fish's own long reading keeps the first piece and the latest. In a narration the reference is the run's first piece as
    read (the anchor), and the lab sends the latest one (opts["previous"]). Higgs v3 has one reference slot and no turns: the words of the
    piece before follow the reference's words (its tags left out), its codes (the worker's piece-NNN.codes.npz, codebooks × frames) follow
    the reference's (frames × codebooks). A codes file missing or not eight codebooks fails the piece aloud: never a bridge that is not."""
    if not previous:
        return ref
    codes, words = ([ref["codes"]], [ref.get("text") or ""]) if ref else ([], [])
    for t in previous:
        with np.load(str(t["codes"])) as z:
            c = np.asarray(z["codes"])
        if c.ndim != 2 or c.shape[0] != CODEBOOKS or c.shape[1] < 1:
            raise RuntimeError(f"the codes of the piece before are not {CODEBOOKS} codebooks × frames: {c.shape}")
        codes.append(torch.from_numpy(c.T.astype(np.int64)))
        words.append(" ".join(TAG.sub(" ", str(t.get("text") or "")).split()))
    if ref is not None:
        codes[0] = codes[0].to(torch.int64)
    return {"codes": torch.cat(codes, 0), "text": " ".join(w for w in words if w) or None}


def say(h, text, ref, opts):
    from transformers import set_seed
    if opts.get("seed") is not None:
        set_seed(int(opts["seed"]))
    ref = bridged(ref, opts.get("previous"))            # HERESY 2695: the piece before, when the run reads with the bridge
    kw = {"reference_codes": ref["codes"], "reference_text": ref["text"]} if ref else {}
    model, got = h["model"], {}
    decode = model._decode_codes

    def keep(codes_tn):                                  # HERESY 2419: the piece's codes as generated, kept by the worker beside the piece
        got["codes"] = codes_tn.detach().cpu().numpy()
        return decode(codes_tn)
    # HERESY 2701 (the plan after 2.0.8: «Higgs: свой цикл генерации (… проверка EOS)»; Viktor's ear on the long-text blind set of 13.11: one
    # pass «Здесь обрезан текст в конце», «что-то здесь потеряно. Концовка»): a piece whose codes reach the token budget ran out before its
    # end; it is read once more with half as much room again, and what it reached is kept with its codes for the lab to say
    mx0 = mx = int(opts.get("max_new_tokens", 2048))
    limited = False
    for attempt in range(2):
        if attempt and opts.get("seed") is not None:
            set_seed(int(opts["seed"]))
        got.clear()
        model._decode_codes = keep
        try:
            with torch.inference_mode():
                w = model.generate_speech(text, h["tok"], temperature=float(opts.get("temperature", 0.8)), top_k=int(opts.get("top_k", 50)),
                                          max_new_tokens=mx, **kw)
        finally:
            model._decode_codes = decode
        limited = "codes" in got and int(got["codes"].shape[0]) >= mx - LIMIT_SLACK
        if not limited or attempt:
            break
        print(f"higgs: the piece ran to its {mx} tokens before its end, read again with {int(mx * 1.5)}", flush=True)
        mx = int(mx * 1.5)
    if "codes" in got:
        h["last_codes"] = {"codes": got["codes"].T, "codec": "higgs-audio-v2-tokenizer (codebooks × frames)", "sample_rate": SR,
                           "reached_limit": bool(limited), "max_tokens": mx, "retried": mx != mx0}
    return w.detach().float().cpu().numpy().astype(np.float32).reshape(-1), SR


def state(h):
    return {"model": h["dir"].name, "device": h["device"]}
