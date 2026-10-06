#!/usr/bin/env python3
"""GGUF files: complete or not, and what is inside. Standard library only.

    gguf_check.py complete FILE...     exit 1 when any file is truncated, not GGUF, or unreadable; a totals line
    gguf_check.py structure FILE...    per file, one line of JSON: a digest of the tensor table (names, shapes,
                                       types) + counts; exit 1 when any file cannot be read
    gguf_check.py sha256 FILE...       SHA-256 of each file (portable: no sha256sum/shasum needed)

A file is complete when its header and tensor table parse and the file is long enough to hold every
tensor's data. That catches a conversion or quantization that was interrupted part way.

Two ways to compare with the kit owner's files (tools/expected-install.json):
- exact: the SHA-256, for files that are converted as they are (they come out byte for byte the same);
- structure: for quantized copies (Q8_0, Q6_K, Q5_K_M...) and for SheetSage2-F32, whose conversion merges
  adapter weights in floating point. Both can round differently on another CPU, platform or compiler, so
  the bytes may differ while the names, shapes and types of every tensor match.
"""
import hashlib
import json
import os
import struct
import sys
import time

# plain text when NO_COLOR is set or the output is not a terminal (a log file, a pipe)
COLOR = sys.stdout.isatty() and not os.environ.get("NO_COLOR")
G, R, D, B, X = ("\033[32m", "\033[31m", "\033[2m", "\033[1m", "\033[0m") if COLOR else ("",) * 5

# ggml type -> (elements per block, bytes per block)
TYPES = {0: (1, 4), 1: (1, 2), 2: (32, 18), 3: (32, 20), 6: (32, 22), 7: (32, 24), 8: (32, 34), 9: (32, 36),
         10: (256, 84), 11: (256, 110), 12: (256, 144), 13: (256, 176), 14: (256, 210), 15: (256, 292),
         16: (256, 66), 17: (256, 74), 18: (256, 98), 19: (256, 50), 20: (32, 18), 21: (256, 110),
         22: (256, 82), 23: (256, 136), 24: (1, 1), 25: (1, 2), 26: (1, 4), 27: (1, 8), 28: (1, 8),
         29: (256, 56), 30: (1, 2), 34: (256, 54), 35: (256, 66), 39: (32, 17)}
NAMES = {0: "F32", 1: "F16", 8: "Q8_0", 10: "Q2_K", 11: "Q3_K", 12: "Q4_K", 13: "Q5_K", 14: "Q6_K", 30: "BF16"}
SCALAR = {0: 1, 1: 1, 2: 2, 3: 2, 4: 4, 5: 4, 6: 4, 7: 1, 10: 8, 11: 8, 12: 8}   # value type -> bytes


class Reader:
    def __init__(self, f):
        self.f = f

    def take(self, n):
        b = self.f.read(n)
        if len(b) != n:
            raise ValueError("file ends inside the header")
        return b

    def u32(self):
        return struct.unpack("<I", self.take(4))[0]

    def u64(self):
        return struct.unpack("<Q", self.take(8))[0]

    def string(self):
        return self.take(self.u64()).decode("utf-8", "replace")

    def value(self, t):
        if t in SCALAR:
            raw = self.take(SCALAR[t])
            return struct.unpack({1: "<B", 2: "<H", 4: "<I", 8: "<Q"}[len(raw)], raw)[0]
        if t == 8:
            return self.string()
        if t == 9:
            et, n = self.u32(), self.u64()
            if et in SCALAR:
                self.take(SCALAR[et] * n)
                return None
            for _ in range(n):
                self.value(et)
            return None
        raise ValueError(f"unknown value type {t}")


def parse(path):
    size = os.path.getsize(path)
    with open(path, "rb") as f:
        r = Reader(f)
        if r.take(4) != b"GGUF":
            raise ValueError("not a GGUF file")
        version = r.u32()
        if version < 2:
            raise ValueError(f"GGUF version {version} is too old to check")
        n_tensors, n_kv = r.u64(), r.u64()
        align = 32
        for _ in range(n_kv):
            key, t = r.string(), r.u32()
            v = r.value(t)
            if key == "general.alignment" and isinstance(v, int) and v:
                align = v
        tensors, end = [], 0
        for _ in range(n_tensors):
            name, nd = r.string(), r.u32()
            dims = [r.u64() for _ in range(nd)]
            t, off = r.u32(), r.u64()
            if t not in TYPES:
                raise ValueError(f"tensor {name}: unknown type {t}")
            blck, nbytes = TYPES[t]
            n = 1
            for d in dims:
                n *= d
            end = max(end, off + (n // blck) * nbytes)
            tensors.append((name, dims, t))
        data_start = (f.tell() + align - 1) // align * align
    need = data_start + end
    return {"size": size, "need": need, "complete": size >= need, "tensors": tensors}


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 22), b""):
            h.update(block)
    return h.hexdigest()


def structure(path):
    info = parse(path)
    h = hashlib.sha256()
    types = {}
    for name, dims, t in sorted(info["tensors"]):
        h.update(f"{name}|{','.join(map(str, dims))}|{t}\n".encode())
        types[NAMES.get(t, str(t))] = types.get(NAMES.get(t, str(t)), 0) + 1
    return {"tensors": len(info["tensors"]), "types": dict(sorted(types.items())), "digest": h.hexdigest()}


def main():
    if len(sys.argv) < 3 or sys.argv[1] not in ("complete", "structure", "sha256"):
        print(__doc__)
        return 2
    mode, files = sys.argv[1], sys.argv[2:]
    if mode == "sha256":
        for p in files:
            print(f"{sha256(p)}  {p}")
        return 0
    if mode == "structure":
        bad = 0
        for p in files:
            try:
                print(json.dumps({"file": p, **structure(p)}))
            except (OSError, ValueError) as e:
                bad += 1
                print(f"{p}: {e}", file=sys.stderr)
        return 1 if bad else 0
    bad = incomplete = tensors = size = 0
    t0 = time.time()
    for p in files:
        try:
            info = parse(p)
            size += info["size"]
            if info["complete"]:
                tensors += len(info["tensors"])
                print(f"{G}complete{X}    {p}  {D}({len(info['tensors'])} tensors){X}")
            else:
                incomplete += 1
                print(f"{R}INCOMPLETE{X}  {p}  {D}({info['size']} bytes of {info['need']}: interrupted?){X}")
        except (OSError, ValueError) as e:
            bad += 1
            print(f"{R}BAD{X}         {p}  {D}({e}){X}")
    ok = len(files) - incomplete - bad
    print(f"{B}gguf_check{X}  {G if ok == len(files) else ''}{ok} of {len(files)} complete{X}, "
          f"{R if incomplete else ''}{incomplete} incomplete{X}, {R if bad else ''}{bad} unreadable{X}  "
          f"{D}{tensors} tensors, {size / 2**30:.2f} GiB, {time.time() - t0:.2f} s{X}")
    return 1 if bad or incomplete else 0


if __name__ == "__main__":
    sys.exit(main())
