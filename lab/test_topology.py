"""HERESY 2085: Engine → Hardware → Topology's lab side (lab/topology.py) on a sysfs and an nvidia-smi of its own, as the Forge has them (05.11.2026):
three RTX 3090, GPU0 on numa0 and GPU1, GPU2 on numa1, a Xeon's slots of PCIe 3.0, an Arc Pro B50 behind its own switch; the matrix and P2P parsed, the
links read at the slot, an Arc's at its switch; no NVIDIA said so; the kept look and a fresh one. forge() and smi() serve the suite's mock too.
   python3 lab/test_topology.py"""
import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import topology  # noqa: E402

TOPO_M = ("\t\x1b[4mGPU0\tGPU1\tGPU2\tCPU Affinity\tNUMA Affinity\tGPU NUMA ID\x1b[0m\n"
          "GPU0\t X \tSYS\tSYS\t0-15,32-47\t0\t\tN/A\n"
          "GPU1\tSYS\t X \tPHB\t16-31,48-63\t1\t\tN/A\n"
          "GPU2\tSYS\tPHB\t X \t16-31,48-63\t1\t\tN/A\n\n"
          "Legend:\n\n  X    = Self\n  SYS  = Connection traversing PCIe as well as the SMP interconnect between NUMA nodes (e.g., QPI/UPI)\n")
P2P = (" \t\x1b[4mGPU0\tGPU1\tGPU2\t\x1b[0m\n"
       " GPU0\tX\tTNS\tTNS\t\n"
       " GPU1\tTNS\tX\tCNS\t\n"
       " GPU2\tTNS\tCNS\tX\t\n\n"
       "Legend:\n\n  X    = Self\n  OK   = Status Ok\n")
QUERY = ("0, NVIDIA GeForce RTX 3090, 00000000:05:00.0\n"
         "1, NVIDIA GeForce RTX 3090, 00000000:84:00.0\n"
         "2, NVIDIA GeForce RTX 3090, 00000000:85:00.0\n")
ARC = [(100, "0000:03:00.0", "Intel(R) Arc(TM) Pro B50 Graphics")]


def _dev(root, path, cls, numa, cur=None, most=None):
    d = Path(root) / "devices" / path
    d.mkdir(parents=True, exist_ok=True)
    (d / "class").write_text(cls + "\n")
    (d / "numa_node").write_text(str(numa) + "\n")
    for name, v in (("current_link_speed", cur and cur[0]), ("current_link_width", cur and cur[1]), ("max_link_speed", most and most[0]),
                    ("max_link_width", most and most[1])):
        if v is not None:
            (d / name).write_text(str(v) + "\n")
    link = Path(root) / "bus" / "pci" / "devices" / os.path.basename(path)
    link.parent.mkdir(parents=True, exist_ok=True)
    if not link.exists():
        link.symlink_to(d)


def forge(root):
    """the Forge's cards as its sysfs has them: the root ports Gen3, the 3090s Gen4 cards (GPU0 idle at Gen1), the B50 a Gen5 x8 card behind its switch"""
    g3, g4, g5, g1 = "8.0 GT/s PCIe", "16.0 GT/s PCIe", "32.0 GT/s PCIe", "2.5 GT/s PCIe"
    _dev(root, "pci0000:00/0000:00:02.0", "0x060400", 0, (g1, 16), (g3, 16))
    _dev(root, "pci0000:00/0000:00:02.0/0000:05:00.0", "0x030000", 0, (g1, 16), (g4, 16))
    _dev(root, "pci0000:80/0000:80:02.0", "0x060400", 1, (g3, 16), (g3, 16))
    _dev(root, "pci0000:80/0000:80:02.0/0000:84:00.0", "0x030000", 1, (g3, 16), (g4, 16))
    _dev(root, "pci0000:80/0000:80:03.0", "0x060400", 1, (g3, 16), (g3, 16))
    _dev(root, "pci0000:80/0000:80:03.0/0000:85:00.0", "0x030000", 1, (g3, 16), (g4, 16))
    _dev(root, "pci0000:00/0000:00:01.0", "0x060400", 0, (g3, 8), (g3, 8))
    _dev(root, "pci0000:00/0000:00:01.0/0000:01:00.0", "0x060400", 0, (g3, 8), (g5, 8))
    _dev(root, "pci0000:00/0000:00:01.0/0000:01:00.0/0000:02:01.0", "0x060400", 0, (g1, 1), (g1, 1))
    _dev(root, "pci0000:00/0000:00:01.0/0000:01:00.0/0000:02:01.0/0000:03:00.0", "0x030000", 0, (g1, 1), (g1, 1))
    return root


def smi(nvidia=True, p2p=True):
    """an nvidia-smi of the Forge's answers; nvidia=False: none on this machine (FileNotFoundError, as the real one raises); p2p=False: a driver
    without -p2p"""
    def run(args):
        if not nvidia:
            raise FileNotFoundError("nvidia-smi")
        if args[:1] == ["topo"]:
            if args[1:] == ["-m"]:
                return TOPO_M
            if not p2p:
                raise RuntimeError("Invalid combination of input arguments.")
            return P2P
        return QUERY
    return run


bad = []


def ok(name, cond, got=""):
    if not cond:
        bad.append(name)
    print(("ok   " if cond else "FAIL ") + name + ("" if cond else f"  ({got})"))


if __name__ == "__main__":
    root = forge(tempfile.mkdtemp(prefix="ruach-topo-"))
    d = topology.gather(run=smi(), sysfs=root, arc=ARC)
    by = {c["label"]: c for c in d["cards"]}
    ok("four cards: GPU0 GPU1 GPU2 by nvidia-smi, Arc0 by its sysfs", sorted(by) == ["Arc0", "GPU0", "GPU1", "GPU2"] and by["Arc0"]["kind"] == "intel", sorted(by))
    ok("GPU0 on numa0, GPU1 and GPU2 on numa1, the Arc on numa0", [by[k]["numa"] for k in ("GPU0", "GPU1", "GPU2", "Arc0")] == [0, 1, 1, 0],
       [by[k]["numa"] for k in by])
    ok("the addresses as sysfs names them", [by[k]["bdf"] for k in ("GPU0", "GPU1", "GPU2", "Arc0")] == ["0000:05:00.0", "0000:84:00.0", "0000:85:00.0", "0000:03:00.0"])
    l0 = by["GPU0"]["link"]
    ok("GPU0's link: Gen1 x16 now (idle), Gen4 x16 its most, Gen3 x16 the slot's, in the slot itself",
       (l0["now"]["gen"], l0["now"]["width"], l0["max"]["gen"], l0["slot"]["gen"], l0["slot"]["width"], l0["via"]) == (1, 16, 4, 3, 16, None), l0)
    la = by["Arc0"]["link"]
    ok("the Arc's link read at its own switch: Gen3 x8 now, Gen5 x8 its most, Gen3 x8 the slot's, via 0000:01:00.0 (not the x1 inside the card)",
       (la["now"]["gen"], la["now"]["width"], la["max"]["gen"], la["max"]["width"], la["slot"]["gen"], la["via"]) == (3, 8, 5, 8, 3, "0000:01:00.0"), la)
    m = d["matrix"]
    ok("the matrix: GPU0 GPU1 GPU2 and the three affinities, its colours out, the aligning tabs dropped",
       m and m["cols"] == ["GPU0", "GPU1", "GPU2", "CPU Affinity", "NUMA Affinity", "GPU NUMA ID"] and
       m["rows"][1] == {"name": "GPU1", "cells": ["SYS", "X", "PHB", "16-31,48-63", "1", "N/A"]}, m)
    ok("the raw matrix kept without its colours and legend", d["raw"].startswith("\tGPU0") and "\x1b" not in d["raw"] and "Legend" not in d["raw"], d["raw"][:80])
    ok("P2P read: TNS across the sockets, CNS between GPU1 and GPU2", d["p2p"] and d["p2p"]["rows"][1]["cells"] == ["TNS", "X", "CNS"], d["p2p"])
    d2 = topology.gather(run=smi(p2p=False), sysfs=root, arc=ARC)
    ok("a driver without -p2p: the matrix still, P2P none and why", d2["matrix"] is not None and d2["p2p"] is None and "Invalid" in d2["p2p_error"], d2["p2p_error"])
    d3 = topology.gather(run=smi(nvidia=False), sysfs=root, arc=ARC)
    ok("no nvidia-smi: no NVIDIA, no error to read, the Arc still listed", not d3["nvidia"] and not d3["error"] and [c["label"] for c in d3["cards"]] == ["Arc0"], d3)
    d4 = topology.gather(run=lambda a: (_ for _ in ()).throw(RuntimeError("NVIDIA-SMI has failed because it couldn't communicate with the NVIDIA driver")),
                         sysfs=root, arc=[])
    ok("an nvidia-smi that fails: no NVIDIA, its words kept", not d4["nvidia"] and "couldn't communicate" in d4["error"] and d4["cards"] == [], d4)
    ok("a table that does not read as one is none", topology.table("GPU0\tX\n") is None and topology.table("") is None)
    ok("generations by speed", [topology.gen(s) for s in ("2.5 GT/s PCIe", "5.0 GT/s", "8 GT/s", "16.0 GT/s PCIe", "32.0 GT/s PCIe", "Unknown")] == [1, 2, 3, 4, 5, None])
    asked = []

    def counted(a):
        asked.append(a[0])
        return smi()(a)
    topology.STATE.update(value=None, at=0.0)
    s1 = topology.state(run=counted, sysfs=root, arc=ARC)
    n1 = len(asked)
    topology.state(run=counted, sysfs=root, arc=ARC)
    topology.state(fresh=True, run=counted, sysfs=root, arc=ARC)
    ok("looked at once and kept: a second ask and a fresh one within FRESH_S ask nothing", len(asked) == n1 == 3 and s1["age_s"] >= 0, asked)
    topology.STATE["at"] -= topology.FRESH_S + 1
    topology.state(fresh=True, run=counted, sysfs=root, arc=ARC)
    ok("a fresh ask after FRESH_S looks again", len(asked) == 2 * n1, asked)
    topology.state(run=counted, sysfs=root, arc=ARC)
    ok("and a plain ask after it keeps that look", len(asked) == 2 * n1, asked)
    print(("FAILED: " + ", ".join(bad)) if bad else "all %d topology checks pass" % 16)
    sys.exit(1 if bad else 0)
