#!/usr/bin/env python3
"""HERESY 2985: Qwen-Image 2.1 in a batch run (the Videographer's key frames) reads every prompt of its card's share in one pass and keeps its
transformer on the card for the share, a stand-in pipeline and card on the processor (artist_qwen.read21, keep21, given21): the encoder on the
card once and back in RAM once; each prompt read through the pipeline's own preparation of its reference (the call stopped at its
encode_prompt); the transformer and the VAE put on the card once; each picture's call the same arguments as before, its words answered from
what was read, the encoder never called again; the pictures the very ones the per-picture way gives; no room, a stream asked, or the switch
off: None, the old way. Seconds, no card.
  .venv/bin/python lab/test_artist21_batch.py"""
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import artist_qwen as aq  # noqa: E402

G, R, X = ("\033[32m", "\033[31m", "\033[0m") if sys.stdout.isatty() else ("", "", "")
passed = failed = 0
GB = 2 ** 30


def check(name, ok, detail=""):
    global passed, failed
    passed += bool(ok)
    failed += not ok
    print(f"  {G + 'PASS' if ok else R + 'FAIL'}{X}  {name}" + (f"  ({detail})" if detail and not ok else ""))


class T:
    """A tensor's stand-in: a value and the device it is on."""

    def __init__(self, v, dev="cpu"):
        self.v, self.dev = v, str(dev)

    def to(self, dev):
        return T(self.v, dev)


class P:
    """A parameter's stand-in: its data (a T) and its size; .data may be pointed elsewhere, as torch's own."""

    def __init__(self, gb, dev="cpu"):
        self.gb, self.data = gb, T(("w", gb), dev)

    def numel(self):
        return self.gb

    def element_size(self):
        return GB


class Mod:
    """A module's stand-in: one parameter, on the card or in RAM as its data is; to() a copy, counted in moves."""

    def __init__(self, gb):
        self.moves, self._parameters, self._buffers = [], {"w": P(gb)}, {}

    @property
    def dev(self):
        return self._parameters["w"].data.dev

    @dev.setter
    def dev(self, d):
        self._parameters["w"].data = T(self._parameters["w"].data.v, d)

    def to(self, dev):
        self.moves.append(str(dev))
        self._parameters["w"].data = self._parameters["w"].data.to(dev)
        return self

    def modules(self):
        return [self]

    def parameters(self):
        return list(self._parameters.values())

    def buffers(self):
        return list(self._buffers.values())

    def decode(self, latents, return_dict=False):
        """The VAE's decode: the picture from the latents; it must be on the card, and the card must hold it beside what is there."""
        if self.dev != "cuda" and not getattr(self, "offloaded", False):
            raise RuntimeError("the VAE is not on the card")
        if self.room is not None and self.room() < 10 * GB:
            raise RuntimeError("CUDA out of memory in the VAE's decode")
        self.decodes = getattr(self, "decodes", 0) + 1
        return [("decoded", latents)]


class Out:
    def __init__(self, images):
        self.images = images


class Pipe:
    """2.1's stand-in: its call prepares the reference (its own resizing), asks encode_prompt for the words (the encoder must be on the card),
    then the transformer paints a picture from the words and the seed (it must be on the card, or offloaded)."""

    def __init__(self):
        self.text_encoder, self.transformer, self.vae = Mod(17), Mod(14), Mod(1)
        self.reads, self.offload, self.room = [], 0, None
        self.vae.room = lambda: self.room() if self.room else 24 * GB

    def encode_prompt(self, prompt, image=None, device=None, num_images_per_prompt=1, prompt_embeds=None, prompt_embeds_mask=None):
        on = self.text_encoder.dev == "cuda" or self.offload
        self.reads.append({"prompt": prompt, "image": image, "device": str(device), "on_card": on})
        return (T(("e", prompt, tuple(image or ())), device), T(("m", prompt), device), T(("i", len(image or ())), device))

    def enable_model_cpu_offload(self):
        self.offload += 1

    def __call__(self, prompt=None, image=None, width=0, height=0, num_inference_steps=0, generator=None):
        prepared = [("resized", image, 1024)] if image is not None else None      # the pipeline's own preparation of its reference
        e, m, i = self.encode_prompt(image=prepared, prompt=prompt, prompt_embeds=None, prompt_embeds_mask=None, device="cpu", num_images_per_prompt=1)
        if not (self.transformer.dev == "cuda" or self.offload):
            raise RuntimeError("the transformer is not on the card")
        if e.dev != "cuda" and not self.offload:
            raise RuntimeError("the words are not on the card")
        self.vae.offloaded = bool(self.offload)
        self.vae.decode(("latents", e.v), return_dict=False)
        return Out([("picture", e.v, m.v, i.v, width, height, num_inference_steps, generator)])


class Cuda:
    """The card's stand-in: free is the card's total less what the pipeline's modules on it weigh (a pipe given), else a fixed number."""

    def __init__(self, free_gb, pipe=None, total_gb=24):
        self.free, self.pipe, self.total = free_gb * GB, pipe, total_gb * GB
        self.resets = 0

    def mem_get_info(self):
        if self.pipe is None:
            return (self.free, 24 * GB)
        return (self.total - sum(p.gb * GB for m in (self.pipe.text_encoder, self.pipe.transformer, self.pipe.vae) for p in m.parameters()
                                 if p.data.dev == "cuda"), self.total)

    def memory_reserved(self):
        return 0

    def memory_allocated(self):
        return 0

    def max_memory_allocated(self):
        return 0

    def max_memory_reserved(self):
        return 0

    def reset_peak_memory_stats(self):
        self.resets += 1

    def synchronize(self):
        pass

    def empty_cache(self):
        pass


class NoGrad:
    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class Torch:
    def __init__(self, free_gb, pipe=None, total_gb=24):
        self.cuda = Cuda(free_gb, pipe, total_gb)

    def device(self, d):
        return d

    def no_grad(self):
        return NoGrad()


items = [{"n": 1, "prompt": "a", "seed": 11, "ref": "ref-01.png"}, {"n": 2, "prompt": "b", "seed": 12, "ref": "ref-01.png"}, {"n": 3, "prompt": "c", "seed": 13}]
ask = {"ref_as": "edit"}
REF = "the hero"


def kw_of(x, g=None):
    return aq.kw21(x, ask, REF if x.get("ref") else None, 1664, 928, 30, g)


aq.cover = lambda ref, w, h: ("covered", ref, w, h)      # the reference covered to the picture's size (PIL's in the painter)

print("the old way, per picture (the reference to compare with)")
old = Pipe()
old.enable_model_cpu_offload()
before = [old(**kw_of(x, g=x["seed"])).images[0] for x in items]
check("the stand-in paints by the words read with each picture's reference", len(old.reads) == 3 and old.reads[0]["image"] == [("resized", ("covered", REF, 1664, 928), 1024)])

print("read21: every prompt in one pass")
pipe, torch = Pipe(), Torch(free_gb=23)
read = aq.read21(pipe, items, kw_of, torch)
check("three prompts read, each its own number", read is not None and sorted(read) == [1, 2, 3], read)
check("the encoder on the card once and back in RAM once", pipe.text_encoder.moves == ["cuda", "cpu"], pipe.text_encoder.moves)
check("each prompt read on the card, through the pipeline's own preparation of its reference",
      all(r["on_card"] and r["device"] == "cuda" for r in pipe.reads) and pipe.reads[0]["image"] == [("resized", ("covered", REF, 1664, 928), 1024)] and pipe.reads[2]["image"] is None,
      pipe.reads)
check("what was read kept in RAM", all(t.dev == "cpu" for v in read.values() for t in v), [[t.dev for t in v] for v in read.values()])
check("the pipeline's own encode_prompt again after", "encode_prompt" not in pipe.__dict__)

print("keep21 and given21: the transformer on the card for the share, the words handed back")
said = aq.keep21(pipe, torch)
check("room for it: the transformer and the VAE on the card once, no offload", said["resident"] and pipe.transformer.moves == ["cuda"] and pipe.vae.moves == ["cuda"] and not pipe.offload, said)
n_reads = len(pipe.reads)
after = [aq.given21(pipe, read[x["n"]], kw_of(x, g=x["seed"]), torch).images[0] for x in items]
check("no prompt read again while painting", len(pipe.reads) == n_reads, len(pipe.reads))
check("the same pictures as the per-picture way (the same words, seed, size and steps)", after == before, (after, before))
check("the encoder never came back to the card", pipe.text_encoder.moves == ["cuda", "cpu"], pipe.text_encoder.moves)
check("the pipeline's own encode_prompt again after each picture", "encode_prompt" not in pipe.__dict__)
bad = Pipe()
bad.transformer.dev = "cpu"
try:
    aq.given21(bad, read[1], kw_of(items[0]), torch)
except RuntimeError:
    pass
check("a picture that fails leaves the pipeline's own encode_prompt", "encode_prompt" not in bad.__dict__)

print("when the old way stays")
small = Pipe()
check("no room for the encoder: None, nothing moved", aq.read21(small, items, kw_of, Torch(free_gb=10)) is None and not small.text_encoder.moves)
os.environ["ART_STREAM"] = "1"
st = Pipe()
check("the lab asked the streamed way (ART_STREAM=1): None", aq.read21(st, items, kw_of, Torch(free_gb=23)) is None and not st.text_encoder.moves)
os.environ.pop("ART_STREAM")
os.environ["ART_READ21"] = "0"
off = Pipe()
check("the switch off (ART_READ21=0): None, the per-picture way", aq.read21(off, items, kw_of, Torch(free_gb=23)) is None and not off.text_encoder.moves)
os.environ.pop("ART_READ21")
tight = Pipe()
aq.read21(tight, items, kw_of, Torch(free_gb=23))
said = aq.keep21(tight, Torch(free_gb=16))
check("no room to keep the transformer: model offload, its words still read once", not said["resident"] and tight.offload == 1 and not tight.transformer.moves, said)
print("the VAE's decode beside a kept transformer: it steps off the card for the decode when the room is short, and back for the next picture")
dp = Pipe()
tq = Torch(0, pipe=dp, total_gb=24)                     # the card's free room is what the pipeline's parts on it leave of 24 GB
read = aq.read21(dp, items, kw_of, Torch(free_gb=23))
held = aq.keep21(dp, tq)
home = aq.HOME21["home"][0][3]               # its tensor in RAM before the card, kept (home21)
dp.room = lambda: aq.room21(tq)                         # the stand-in VAE runs out of memory with less than 10 GB of room, as the 3090 did
pics = [aq.given21(dp, read[x["n"]], kw_of(x, g=x["seed"]), tq, held).images[0] for x in items]
check("kept: the transformer and the VAE on the card", held["resident"] and dp.vae.moves == ["cuda"], held)
check("the same pictures as the per-picture way", pics == before, (pics, before))
check("each of the three decodes had the transformer off the card first (9 GB of room beside it, 10 wanted)", held.get("decode_off") == 3 and dp.vae.decodes == 3, held)
check("stepping off copied nothing back to RAM: the transformer onto the card once for the share and once again a picture after a decode",
      dp.transformer.moves == ["cuda", "cuda", "cuda"], dp.transformer.moves)
check("off the card, its tensor in RAM is its own from before the card (no new copy)", dp.transformer._parameters["w"].data is home)
check("the VAE's own decode again after each picture", "decode" not in dp.vae.__dict__)
check("the seconds of coming back counted", aq.HOME21.get("on_s", -1) >= 0, aq.HOME21)
big = Pipe()
tb = Torch(0, pipe=big, total_gb=48)
rb = aq.read21(big, items, kw_of, Torch(free_gb=23))
hb = aq.keep21(big, tb)
big.room = lambda: aq.room21(tb)
pb = [aq.given21(big, rb[x["n"]], kw_of(x, g=x["seed"]), tb, hb).images[0] for x in items]
check("a card with room for the decode beside it (48 GB): the transformer stays on the card, one move for the share",
      pb == before and big.transformer.moves == ["cuda"] and "decode_off" not in hb, (big.transformer.moves, hb))
fp = Pipe()
tf = Torch(0, pipe=fp, total_gb=24)
rf = aq.read21(fp, items, kw_of, Torch(free_gb=23))
hf = aq.keep21(fp, tf)
fp.room = lambda: 0
try:
    aq.given21(fp, rf[1], kw_of(items[0], g=11), tf, hf)
except RuntimeError:
    pass
check("a decode that fails leaves the VAE's own decode and the pipeline's own encode_prompt", "decode" not in fp.vae.__dict__ and "encode_prompt" not in fp.__dict__)

print("a reading's turn between two pictures (2368's aside)")
import tempfile, threading, time  # noqa: E401,E402
d = Path(tempfile.mkdtemp(prefix="claude-a21-"))
ap = Pipe()
ta = Torch(0, pipe=ap, total_gb=48)
ra = aq.read21(ap, items, kw_of, Torch(free_gb=23))
ha = aq.keep21(ap, ta)
check("no reading waiting: no step off the card", aq.aside21(ap, d, ha, ta) is False and ap.transformer.dev == "cuda" and ap.transformer.moves == ["cuda"])
(d / "aside").touch()
seen = {}
threading.Thread(target=lambda: (time.sleep(0.3), seen.update(dev=ap.transformer.dev, free=ta.cuda.mem_get_info()[0] // GB), (d / "aside").unlink()), daemon=True).start()
off = aq.aside21(ap, d, ha, ta)
check("a reading waiting: the kept transformer off the card for the wait, nothing copied back to RAM", off and seen.get("dev") == "cpu" and seen.get("free") == 47
      and ap.transformer.moves == ["cuda"], (seen, ap.transformer.moves))
pa = aq.given21(ap, ra[2], kw_of(items[1], g=12), ta, ha).images[0]
check("the next picture brings it back onto the card (one copy) and is the same picture", pa == before[1] and ap.transformer.moves == ["cuda", "cuda"], ap.transformer.moves)
(d / "aside").touch()
threading.Thread(target=lambda: (time.sleep(0.3), (d / "aside").unlink()), daemon=True).start()
op = Pipe()
check("not kept on the card (offload): it waits as before, nothing moved", aq.aside21(op, d, {"resident": False}, Torch(23)) is False and not op.transformer.moves)
d.rmdir()
print(f"\ntest_artist21_batch  {passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
