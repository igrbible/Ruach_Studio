"""HERESY 1264 (Viktor 09.10.2026: «Добавь в страничку Engine в GPUs секцию под каждым btop-like монитор утилизации/VRAM usage в
реальном времени»; «btop ересь можно прикрутить и к фрейму лога сервера… живая шкала активных GPU, где главная карта особо
обрамлена. Пометки над блоками графов — какая роль карты»): the cards' load and memory second by second, for the page's live graphs.

One nvidia-smi in its loop mode (-lms 1000) while a page looks, ended a minute after the last look: each card's utilization, memory
used and total, temperature and power, the last two minutes kept. Without nvidia-smi the answer says so, and the page shows no graph.
"""
import collections
import glob
import json
import os
import subprocess
import threading
import time

KEEP = 120                       # samples a card keeps: four minutes at one every two seconds (HERESY 1625; two minutes at one a second before)
IDLE = 60                        # seconds without a look before the sampler stops
QUERY = "index,name,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw"
LOCK = threading.Lock()
RING = {}                        # card -> deque of [t, util %, used MB, total MB, °C, W]
NAMES = {}
STATE = {"running": False, "asked": 0.0, "error": ""}


def _num(s):
    s = s.strip()
    try:
        return float(s)
    except ValueError:
        return None              # [N/A], [Not Supported]: a card that does not say


def _run():
    try:
        p = subprocess.Popen(["nvidia-smi", "--query-gpu=" + QUERY, "--format=csv,noheader,nounits", "-lms", "2000"],
                             stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, bufsize=1)
    except OSError as e:
        STATE.update(running=False, error=f"no nvidia-smi here ({e})")
        return
    STATE["error"] = ""
    try:
        for line in p.stdout:
            parts = line.split(",")
            if len(parts) < 7:
                continue
            try:
                i = int(parts[0])
            except ValueError:
                continue
            row = [round(time.time(), 2)] + [_num(x) for x in parts[2:7]]
            with LOCK:
                NAMES[i] = parts[1].strip()
                RING.setdefault(i, collections.deque(maxlen=KEEP)).append(row)
            if time.time() - STATE["asked"] > IDLE:
                break                                   # nobody looks any more
    finally:
        try:
            p.terminate()
            p.wait(timeout=5)
        except (OSError, subprocess.SubprocessError):
            pass
        STATE["running"] = False


# HERESY 1680 (Viktor 21.10.2026: «В Engine>Hardware вообще реально прикрутить метрику Arc карт ка у нас с CUDA? Знаю, что текущая версия xpu-smi
# - полнейшее говно»): the Intel cards (xe, i915) sampled from the kernel itself every two seconds, in the same rows as nvidia-smi's: the busiest
# engine class's share of time over every client of the card (DRM fdinfo: drm-cycles over drm-total-cycles, per engine of the class), the memory
# the clients hold on it (drm-resident-vram0), the package's temperature and the card's power (its energy counter over the interval) from hwmon;
# the name and the memory's size from xpu-smi once (its live numbers are N/A). Indices from ARC_BASE, past any CUDA card's.
ARC_BASE = 100
XE = {"cards": None, "at": 0.0, "fds": [], "fds_at": 0.0, "running": False}


def _xe_cards():
    """The Intel cards with sensors of their own: [(index, bdf, hwmon dir, name, total MB)], looked for again every five minutes."""
    if XE["cards"] is not None and time.time() - XE["at"] < 300:
        return XE["cards"]
    out = []
    for card in sorted(glob.glob("/sys/class/drm/card[0-9]*")):
        if "-" in os.path.basename(card):
            continue                                    # a connector, not a card
        dev = os.path.join(card, "device")
        try:
            drv = os.path.basename(os.path.realpath(os.path.join(dev, "driver")))
            vendor = open(os.path.join(dev, "vendor")).read().strip()
        except OSError:
            continue
        hw = sorted(glob.glob(os.path.join(dev, "hwmon", "hwmon*")))
        if drv not in ("xe", "i915") or vendor != "0x8086" or not hw:
            continue                                    # an integrated GPU has no sensors of its own
        bdf = os.path.basename(os.path.realpath(dev))
        name, total = "Intel GPU", None
        try:
            d = json.loads(subprocess.run(["xpu-smi", "discovery", "-d", bdf, "-j"], capture_output=True, text=True, timeout=20).stdout or "{}")
            name = d.get("device_name") or name
            total = round(int(d["memory_physical_size_byte"]) / 2 ** 20) if d.get("memory_physical_size_byte") else None
        except (OSError, ValueError, subprocess.SubprocessError):
            pass
        out.append((ARC_BASE + len(out), bdf, hw[0], name, total))
    XE.update(cards=out, at=time.time())
    return out


def _drm_fds():
    """Every DRM file this user's processes hold, as their fdinfo paths; looked for again every ten seconds."""
    if time.time() - XE["fds_at"] < 10:
        return XE["fds"]
    out = []
    for fd in glob.glob("/proc/[0-9]*/fd/*"):
        try:
            if os.readlink(fd).startswith("/dev/dri/"):
                out.append(fd.replace("/fd/", "/fdinfo/"))
        except OSError:
            pass
    XE.update(fds=out, fds_at=time.time())
    return out


def _hwmon(hw, kind, label):
    """A hwmon reading by its label (pkg, card), else the first of its kind; None when there is none."""
    files = sorted(glob.glob(os.path.join(hw, kind + "*_input")))
    for f in files:
        try:
            if open(f.replace("_input", "_label")).read().strip() == label:
                return float(open(f).read())
        except OSError:
            continue
    try:
        return float(open(files[0]).read()) if files else None
    except (OSError, ValueError):
        return None


def _run_xe():
    prev, energy = {}, {}
    try:
        while time.time() - STATE["asked"] <= IDLE:
            cards = _xe_cards()
            if not cards:
                break
            now, busy, vram, seen = time.time(), {}, {}, {}
            for path in _drm_fds():
                try:
                    info = dict(line.split(":", 1) for line in open(path).read().splitlines() if ":" in line)
                except OSError:
                    continue
                bdf = info.get("drm-pdev", "").strip()
                if not bdf:
                    continue
                vram[bdf] = vram.get(bdf, 0) + int((info.get("drm-resident-vram0", "0").split() or ["0"])[0])
                for k, v in info.items():
                    if not k.startswith("drm-cycles-"):
                        continue
                    eng = k[len("drm-cycles-"):]
                    try:
                        cyc, tot = int(v.split()[0]), int(info.get("drm-total-cycles-" + eng, "0").split()[0])
                        cap = int(info.get("drm-engine-capacity-" + eng, "1").split()[0]) or 1
                    except (ValueError, IndexError):
                        continue
                    key = (path, eng)
                    if key in prev and tot > prev[key][1]:
                        d = busy.setdefault((bdf, eng), [0, 0, cap])
                        d[0] += max(0, cyc - prev[key][0]); d[1] = max(d[1], tot - prev[key][1])
                    seen[key] = (cyc, tot)
            prev = seen
            for i, bdf, hw, name, total in cards:
                util = None
                shares = [d[0] / d[1] / d[2] * 100 for (b, e), d in busy.items() if b == bdf and d[1] > 0]
                if shares:
                    util = round(min(100.0, max(shares)), 1)
                elif prev:
                    util = 0.0
                temp = _hwmon(hw, "temp", "pkg")
                e = _hwmon(hw, "energy", "card")
                watts = None
                if e is not None and bdf in energy and now > energy[bdf][1]:
                    watts = round((e - energy[bdf][0]) / 1e6 / (now - energy[bdf][1]), 1)
                if e is not None:
                    energy[bdf] = (e, now)
                row = [round(now, 2), util, round(vram.get(bdf, 0) / 1024), total, round(temp / 1000, 1) if temp is not None else None, watts]
                with LOCK:
                    NAMES[i] = name
                    RING.setdefault(i, collections.deque(maxlen=KEEP)).append(row)
            time.sleep(2)
    finally:
        XE["running"] = False


def live(since=0.0):
    """The samples newer than `since` (all kept ones for 0), card by card; the samplers started when they are not running (HERESY 1680:
    the Intel cards' beside nvidia-smi's)."""
    STATE["asked"] = time.time()
    with LOCK:
        if not STATE["running"]:
            STATE["running"] = True
            threading.Thread(target=_run, daemon=True).start()
        if not XE["running"] and (XE["cards"] is None or XE["cards"]):
            XE["running"] = True
            threading.Thread(target=_run_xe, daemon=True).start()
        cards = [{"index": i, "name": NAMES.get(i, ""), "samples": [r for r in RING[i] if r[0] > since]} for i in sorted(RING)]
    err = STATE["error"] if not any(i >= ARC_BASE for i in RING) else ""
    return {"cards": cards, "error": err, "now": time.time(), "keep": KEEP}
