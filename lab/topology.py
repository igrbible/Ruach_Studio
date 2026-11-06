"""HERESY 2085 (Viktor 05.11.2026: «в Движок в Hardware добавь топологию, она полезна тем, кто понимает в это, — как мы.»): how the cards sit on the
bus, for Engine → Hardware → Topology. Each card with its NUMA node (sysfs numa_node), its PCIe link as it runs now and the most it can, the slot's own
most (its root port's) and its PCI address. The link is the one into the slot: a card behind a switch of its own (an Arc is) is read at that switch,
not at the x1 inside the card, and the switch is named. NVIDIA's matrix (nvidia-smi topo -m: X PIX PXB PHB NODE SYS NV#) and its P2P reads
(nvidia-smi topo -p2p r) where the driver tells them; an Intel card by its sysfs alone. Looked at once and kept; looked at again when asked fresh (the
Engine opened), no more often than every FRESH_S.
   state(fresh=False, arc=None) · gather(run=None, sysfs="/sys", arc=None)   (arc: [(index, bdf, name)] or a function giving it; run and sysfs: the
   suite's mock and the test give their own nvidia-smi and sysfs)"""
import os
import re
import subprocess
import threading
import time

FRESH_S = 5.0
ESC = re.compile(r"\x1b\[[0-9;]*m")
NAME = re.compile(r"^(GPU|NIC)\d+$")
BDF = re.compile(r"^[0-9a-fA-F]{4}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2}\.[0-7]$")
GTS = ((1, 2.5), (2, 5.0), (3, 8.0), (4, 16.0), (5, 32.0), (6, 64.0), (7, 128.0))


def _smi(args):
    p = subprocess.run(["nvidia-smi"] + list(args), capture_output=True, text=True, timeout=20)
    if p.returncode != 0:
        raise RuntimeError((p.stderr or p.stdout).strip()[:300] or "nvidia-smi failed")
    return p.stdout


def _read(d, name):
    try:
        with open(os.path.join(d, name), encoding="utf-8") as f:
            return f.read().strip()
    except OSError:
        return None


def gen(speed):
    """«8.0 GT/s PCIe» → 3; None when it names no generation"""
    m = re.match(r"\s*([\d.]+)\s*GT/s", speed or "")
    if not m:
        return None
    v = float(m.group(1))
    return next((g for g, gts in GTS if abs(v - gts) < 0.3), None)


def _side(d, which):
    """one end of a device's link: {gen, speed, width}, or None where sysfs has no such files"""
    if d is None:
        return None
    sp, w = _read(d, which + "_link_speed"), _read(d, which + "_link_width")
    if sp is None and w is None:
        return None
    w = (w or "").lstrip("xX")
    return {"gen": gen(sp), "speed": re.sub(r"\s*PCIe\s*$", "", sp or ""), "width": int(w) if w.isdigit() else None}


def card(sysfs, bdf):
    """a card's place on the bus: {bdf, numa, link}; link {now, max, slot, via}: the link into its slot as it runs and at most (read at the device in
    the slot), the slot's most (its root port), the switch of its own it sits behind (None when it is in the slot itself)"""
    dev = os.path.realpath(os.path.join(sysfs, "bus", "pci", "devices", bdf))
    chain = []
    p = dev
    while BDF.match(os.path.basename(p)):
        chain.append(p)
        p = os.path.dirname(p)
    if not chain:
        return {"bdf": bdf, "numa": None, "link": None}
    n = _read(chain[0], "numa_node")
    numa = int(n) if n and re.fullmatch(r"-?\d+", n) and int(n) >= 0 else None
    root = chain[-1] if len(chain) >= 2 and (_read(chain[-1], "class") or "").startswith("0x0604") else None
    slot = chain[-2] if root else chain[0]
    now, most = _side(slot, "current"), _side(slot, "max")
    link = None if not now and not most else {"now": now, "max": most, "slot": _side(root, "max"),
                                               "via": os.path.basename(slot) if slot != chain[0] else None}
    return {"bdf": bdf, "numa": numa, "link": link}


def table(text):
    """nvidia-smi's table aligned by tabs (topo -m, topo -p2p r) as {cols, rows: [{name, cells}]}: the head is the line whose first field is empty,
    a row a line whose first field is GPUn or NICn; the tabs that only align are dropped. None when it does not read so"""
    head, rows = None, []
    for ln in ESC.sub("", text or "").splitlines():
        fields = ln.split("\t")
        first, rest = fields[0].strip(), [f.strip() for f in fields[1:] if f.strip()]
        if head is None:
            if not first and rest:
                head = rest
            continue
        if NAME.match(first):
            rows.append({"name": first, "cells": rest})
        elif rows:
            break
    if not head or not rows or any(len(r["cells"]) != len(head) for r in rows):
        return None
    return {"cols": head, "rows": rows}


def _raw(text):
    """the matrix as nvidia-smi printed it, its colours out, up to its legend (a matrix that does not read as a table is shown so)"""
    t = ESC.sub("", text or "")
    return t.split("\nLegend:")[0].rstrip()


def _bdf(bus):
    """nvidia-smi's 00000000:05:00.0 as sysfs names it: 0000:05:00.0"""
    dom, _, rest = bus.strip().partition(":")
    return (dom[-4:] + ":" + rest).lower()


def gather(run=None, sysfs="/sys", arc=None):
    run = run or _smi
    out = {"cards": [], "nvidia": True, "error": "", "matrix": None, "raw": "", "p2p": None, "p2p_error": ""}
    try:
        for ln in run(["--query-gpu=index,name,pci.bus_id", "--format=csv,noheader"]).strip().splitlines():
            i, rest = ln.split(",", 1)
            name, bus = rest.rsplit(",", 1)
            i = int(i.strip())
            out["cards"].append(dict(card(sysfs, _bdf(bus)), kind="nvidia", index=i, label="GPU%d" % i, name=name.strip()))
    except FileNotFoundError:
        out.update(nvidia=False)                       # no nvidia-smi on this machine: no NVIDIA card
    except (OSError, RuntimeError, ValueError, subprocess.SubprocessError) as e:
        out.update(nvidia=False, error=str(e)[:300])
    if out["nvidia"] and out["cards"]:
        try:
            text = run(["topo", "-m"])
            out["matrix"], out["raw"] = table(text), _raw(text)
        except (OSError, RuntimeError, ValueError, subprocess.SubprocessError) as e:
            out["raw"] = "nvidia-smi topo -m: " + str(e)[:300]
        try:
            out["p2p"] = table(run(["topo", "-p2p", "r"]))
        except (OSError, RuntimeError, ValueError, subprocess.SubprocessError) as e:
            out["p2p_error"] = str(e)[:300]            # a driver that does not tell it
    try:
        intel = arc() if callable(arc) else (arc or [])
    except (OSError, ValueError, subprocess.SubprocessError):
        intel = []
    for i, bdf, name in intel:
        out["cards"].append(dict(card(sysfs, bdf), kind="intel", index=i, label="Arc%d" % (i - 100), name=name))
    return out


STATE = {"value": None, "at": 0.0}
LOCK = threading.Lock()


def state(fresh=False, arc=None, run=None, sysfs="/sys"):
    """gather()'s look as it was kept; fresh: looked at again when the kept one is FRESH_S old or more (a burst of asks, one look)"""
    with LOCK:
        if STATE["value"] is None or (fresh and time.time() - STATE["at"] >= FRESH_S):
            STATE["value"] = gather(run=run, sysfs=sysfs, arc=arc)
            STATE["at"] = time.time()
        return dict(STATE["value"], probed=round(STATE["at"], 3), age_s=round(time.time() - STATE["at"], 3))


if __name__ == "__main__":
    import json
    print(json.dumps(gather(), indent=1))
