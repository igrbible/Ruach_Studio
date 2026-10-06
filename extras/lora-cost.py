#!/usr/bin/env python3
"""What a LoRA rank costs on YuE2 (Ruach Studio extras): the adapter's own shapes, read from its safetensors
header (no torch, no loading), then the cost of other ranks on the same matrices: parameters, the share of the
weights they adapt, the file size in bf16, per half (music = AR, sound = NAR).

    python3 extras/lora-cost.py [ADAPTER.safetensors] [--ranks 16,32,64,128,256]

Without an adapter, the newest one in loras/ is read. Measured 02.10.2026: 224 matrices, 2048 wide,
1.41 B weights a half; r16 = 1 %, r64 = 4 %, r128 = 8 %, r256 = 17 %."""
import argparse, collections, json, struct, sys
from pathlib import Path


def header(p):
    with open(p, "rb") as f:
        n = struct.unpack("<Q", f.read(8))[0]
        h = json.loads(f.read(n))
    h.pop("__metadata__", None)
    return h


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("adapter", nargs="?")
    ap.add_argument("--ranks", default="16,32,64,128,256")
    a = ap.parse_args()
    root = Path(__file__).absolute().parent.parent          # the studio root, also through a link to extras/
    path = Path(a.adapter) if a.adapter else max((p for p in (root / "loras").rglob("*.safetensors")), key=lambda p: p.stat().st_mtime, default=None)
    if not path or not path.is_file():
        sys.exit("no adapter given and none in loras/")
    mods = collections.defaultdict(dict)
    for k, v in header(path).items():
        for tag, side in (("lora_A", "A"), ("lora_down", "A"), ("lora_B", "B"), ("lora_up", "B")):
            if "." + tag in k:
                mods[k.split("." + tag)[0]][side] = v["shape"]
    if not mods:
        sys.exit(f"{path.name}: no LoRA matrices found")
    width, covered, rank = collections.Counter(), collections.Counter(), set()
    for m, s in mods.items():
        if "A" not in s or "B" not in s:
            continue
        r, din = s["A"]; dout = s["B"][0]
        half = "music (AR)" if m.startswith("text_encoders") else "sound (NAR)"
        width[half] += din + dout; covered[half] += din * dout; rank.add(r)
    print(f"{path.name}: {len(mods)} matrices, rank {', '.join(map(str, sorted(rank)))}")
    for half in sorted(width):
        print(f"\n{half}: the adapted matrices hold {covered[half] / 1e6:.0f} M weights")
        for r in (int(x) for x in a.ranks.split(",")):
            print(f"   r{r:<4d} {width[half] * r / 1e6:7.1f} M params   {100 * width[half] * r / covered[half]:5.2f} % of them   {width[half] * r * 2 / 1e6:6.0f} MB in bf16")


if __name__ == "__main__":
    main()
