"""HERESY 1821 (Viktor 28.10.2026: «В Engine аккумулятивная метрика по перформансу Студии… Время взаимодействия юзера со Студией, скорости генераций,
используемые дисковые и процессорные ресурсы»): the studio over time, kept in user/perf.sqlite.

- The time with the studio: a minute counts once, whoever sends it (a page that plays, or one looked at and handled in the last two minutes, says so every
  minute; two pages, or two machines, in the same minute are one minute). Kind: «play» when it played, else «work».
- The takes made: read from each take's meta.json (its length, how long it took, the stages' times, the model), cached by the file's time.
- The machine: once a minute CPU and RAM from /proc, the NVIDIA cards' load and memory from one nvidia-smi query; kept per hour (averages, the memory's
  highest). Nothing of a take or a run is read here, and no file is written but the database.
- The disks: the studio's folders' sizes (links not followed: what lives on another disk is said by that disk) and the free space of each disk they are on,
  every six hours.
"""
import json
import os
import shutil
import sqlite3
import statistics
import subprocess
import threading
import time
from pathlib import Path

LOCK = threading.Lock()
STATE = {"db": None, "kit": None, "outputs": None, "takes": {}, "sizes": None, "sizes_at": 0.0, "cpu": None, "started": False}
FOLDERS = ("outputs", "models", "checkpoints", "training", "datasets", "loras", "user")


def _db():
    if STATE["db"] is None:
        p = STATE["kit"] / "user" / "perf.sqlite"
        p.parent.mkdir(parents=True, exist_ok=True)
        c = sqlite3.connect(str(p), check_same_thread=False, timeout=10)
        c.execute("CREATE TABLE IF NOT EXISTS beats (minute INTEGER PRIMARY KEY, kind TEXT)")
        c.execute("CREATE TABLE IF NOT EXISTS hours (hour INTEGER PRIMARY KEY, n INTEGER, cpu REAL, ram REAL, gpu REAL, vram REAL, gpus INTEGER)")
        c.commit()
        STATE["db"] = c
    return STATE["db"]


def beat(kind):
    """A minute with the studio (kind «play» or «work»); the same minute twice counts once, «play» kept over «work»."""
    kind = "play" if kind == "play" else "work"
    m = int(time.time() // 60)
    with LOCK:
        c = _db()
        c.execute("INSERT INTO beats (minute, kind) VALUES (?, ?) ON CONFLICT(minute) DO UPDATE SET kind = CASE WHEN excluded.kind = 'play' THEN 'play' ELSE kind END",
                  (m, kind))
        c.commit()
    return {"minute": m, "kind": kind}


def _cpu():
    with open("/proc/stat") as f:
        v = [int(x) for x in f.readline().split()[1:]]
    idle, total = v[3] + (v[4] if len(v) > 4 else 0), sum(v)
    was, STATE["cpu"] = STATE["cpu"], (idle, total)
    if not was or total == was[1]:
        return None
    return 100.0 * (1 - (idle - was[0]) / (total - was[1]))


def _ram():
    info = {}
    with open("/proc/meminfo") as f:
        for line in f:
            k, v = line.split(":", 1)
            info[k] = int(v.split()[0])
    return 100.0 * (1 - info.get("MemAvailable", 0) / max(1, info.get("MemTotal", 1)))


def _gpus():
    try:
        out = subprocess.run(["nvidia-smi", "--query-gpu=utilization.gpu,memory.used,memory.total", "--format=csv,noheader,nounits"],
                             capture_output=True, text=True, timeout=15).stdout
    except (OSError, subprocess.SubprocessError):
        return None
    rows = []
    for line in out.strip().splitlines():
        try:
            u, used, tot = (float(x) for x in line.split(","))
            rows.append((u, 100.0 * used / max(1.0, tot)))
        except ValueError:
            continue
    return rows or None


def sample():
    """One minute's look at the machine, into its hour."""
    cpu, ram, g = _cpu(), _ram(), _gpus()
    if cpu is None:
        return None
    gpu = sum(u for u, _ in g) / len(g) if g else None
    vram = max(m for _, m in g) if g else None
    h = int(time.time() // 3600)
    with LOCK:
        c = _db()
        row = c.execute("SELECT n, cpu, ram, gpu, vram FROM hours WHERE hour = ?", (h,)).fetchone()
        if row:
            n = row[0]
            c.execute("UPDATE hours SET n = ?, cpu = ?, ram = ?, gpu = ?, vram = ?, gpus = ? WHERE hour = ?",
                      (n + 1, row[1] + cpu, row[2] + ram, (row[3] or 0) + (gpu or 0), max(row[4] or 0, vram or 0), len(g) if g else 0, h))
        else:
            c.execute("INSERT INTO hours (hour, n, cpu, ram, gpu, vram, gpus) VALUES (?, 1, ?, ?, ?, ?, ?)", (h, cpu, ram, gpu or 0, vram or 0, len(g) if g else 0))
        c.commit()
    return {"cpu": cpu, "ram": ram, "gpu": gpu, "vram": vram}


def _size(p):
    total = 0
    stack = [str(p)]
    while stack:
        d = stack.pop()
        try:
            with os.scandir(d) as it:
                for e in it:
                    try:
                        if e.is_symlink():
                            continue
                        if e.is_dir(follow_symlinks=False):
                            stack.append(e.path)
                        elif e.is_file(follow_symlinks=False):
                            total += e.stat(follow_symlinks=False).st_blocks * 512
                    except OSError:
                        continue
        except OSError:
            continue
    return total


def sizes(force=False):
    """The studio's folders here (links not followed) and the disks they and their links are on."""
    if not force and STATE["sizes"] and time.time() - STATE["sizes_at"] < 6 * 3600:
        return STATE["sizes"]
    kit = STATE["kit"]
    folders = []
    for name in FOLDERS:
        p = STATE["outputs"] if name == "outputs" else kit / name
        if p.exists():
            folders.append({"name": name, "bytes": _size(p.resolve())})
    mounts, seen = [], set()
    roots = [kit, STATE["outputs"]] + [kit / "datasets" / "raw" / d for d in (os.listdir(kit / "datasets" / "raw") if (kit / "datasets" / "raw").is_dir() else [])]
    for r in roots:
        try:
            real = Path(r).resolve()
            dev = os.stat(real).st_dev
        except OSError:
            continue
        if dev in seen:
            continue
        seen.add(dev)
        u = shutil.disk_usage(real)
        mounts.append({"path": _mount_of(real), "total": u.total, "used": u.used, "free": u.free})
    STATE["sizes"], STATE["sizes_at"] = {"folders": folders, "disks": mounts, "at": time.time()}, time.time()
    return STATE["sizes"]


def _mount_of(p):
    p = Path(p)
    while not os.path.ismount(p) and p != p.parent:
        p = p.parent
    home = str(Path.home())
    s = str(p)
    return "~" + s[len(home):] if s.startswith(home) else s


def takes():
    """Every take's length, the time it took and its stages, from its meta.json (cached by the file's time)."""
    out, cache = [], STATE["takes"]
    root = STATE["outputs"]
    try:
        names = os.listdir(root)
    except OSError:
        return out
    for n in names:
        f = root / n / "meta.json"
        try:
            mt = f.stat().st_mtime
        except OSError:
            continue
        hit = cache.get(n)
        if not hit or hit[0] != mt:
            try:
                m = json.load(open(f, encoding="utf-8"))
            except (OSError, ValueError):
                continue
            st = m.get("stages") or {}
            hit = (mt, {"created": m.get("created") or mt, "seconds": float(m.get("seconds") or 0), "render": float(m.get("render_seconds") or 0),
                        "model": m.get("model") or "", "score": float((st.get("score") or {}).get("seconds") or 0),
                        "music": float((st.get("music") or {}).get("seconds") or 0), "sound": float((st.get("sound") or {}).get("seconds") or 0),
                        "tokens": int((st.get("music") or {}).get("tokens") or 0)})
            cache[n] = hit
        out.append(hit[1])
    return out


def _day(t):
    return time.strftime("%Y-%m-%d", time.localtime(t))


def report(days=30):
    """What Engine → Performance shows."""
    now = time.time()
    today = _day(now)
    with LOCK:
        c = _db()
        beats = c.execute("SELECT minute, kind FROM beats WHERE minute >= ?", (int((now - days * 86400) // 60),)).fetchall()
        allb = c.execute("SELECT COUNT(*), SUM(kind = 'play'), MIN(minute) FROM beats").fetchone()
        hours = c.execute("SELECT hour, n, cpu, ram, gpu, vram, gpus FROM hours WHERE hour >= ? ORDER BY hour", (int((now - 48 * 3600) // 3600),)).fetchall()
    per = {}
    for m, k in beats:
        d = per.setdefault(_day(m * 60), [0, 0])
        d[0 if k == "work" else 1] += 1
    def mins(since):
        return sum(1 for m, _ in beats if m * 60 >= since), sum(1 for m, k in beats if m * 60 >= since and k == "play")
    t0 = time.mktime(time.strptime(today, "%Y-%m-%d"))
    tk = takes()
    recent = [t for t in tk if t["created"] >= now - days * 86400]
    def rtf(rows):
        r = [t["seconds"] / t["render"] for t in rows if t["render"] > 0 and t["seconds"] > 0]
        return round(statistics.median(r), 3) if r else None
    models = {}
    for t in recent:
        models.setdefault(t["model"] or "?", []).append(t)
    stages = {k: sum(t[k] for t in recent) for k in ("score", "music", "sound")}
    tday = {}
    for t in recent:
        d = tday.setdefault(_day(t["created"]), [0, 0.0])
        d[0] += 1
        d[1] += t["seconds"]
    return {
        "time": {"today": mins(t0), "week": mins(now - 7 * 86400), "month": mins(now - 30 * 86400),
                 "all": [allb[0] or 0, allb[1] or 0], "since": allb[2] * 60 if allb[2] else None,
                 "days": [[d, per.get(d, [0, 0])[0], per.get(d, [0, 0])[1]] for d in (_day(now - i * 86400) for i in range(days - 1, -1, -1))]},
        "takes": {"all": len(tk), "today": sum(1 for t in tk if t["created"] >= t0), "week": sum(1 for t in tk if t["created"] >= now - 7 * 86400), "month": len(recent),
                  "audio_all": round(sum(t["seconds"] for t in tk)), "audio_month": round(sum(t["seconds"] for t in recent)),
                  "rtf_month": rtf(recent), "render_median": round(statistics.median([t["render"] for t in recent if t["render"] > 0]), 1) if any(t["render"] > 0 for t in recent) else None,
                  "models": sorted(([m, len(v), rtf(v)] for m, v in models.items()), key=lambda x: -x[1])[:6],
                  "stages": {k: round(v) for k, v in stages.items()},
                  "days": [[d, tday.get(d, [0, 0])[0], round(tday.get(d, [0, 0])[1])] for d in (_day(now - i * 86400) for i in range(days - 1, -1, -1))]},
        "machine": [{"hour": h * 3600, "cpu": round(cp / n, 1), "ram": round(ra / n, 1), "gpu": round(gp / n, 1) if g else None, "vram": round(vr, 1) if g else None}
                    for h, n, cp, ra, gp, vr, g in hours],
        "disks": STATE["sizes"],                       # measured in the background; None until the first measure
        "measuring": STATE.get("measuring", False),
    }


def _loop():
    while True:
        try:
            sample()
        except Exception as e:                         # the next minute tries again
            print(f"[lab] perf: {e}", flush=True)
        time.sleep(60)


def measure():
    """The folders and disks measured again, in the background (a button on the page)."""
    if STATE.get("measuring"):
        return {"measuring": True}
    def run():
        STATE["measuring"] = True
        try:
            sizes(force=True)
        except Exception as e:
            print(f"[lab] perf sizes: {e}", flush=True)
        finally:
            STATE["measuring"] = False
    threading.Thread(target=run, daemon=True).start()
    return {"measuring": True}


def _sizes_loop():
    time.sleep(30)                                     # not in the lab's first seconds
    while True:
        measure()
        time.sleep(6 * 3600)


def start(kit, outputs):
    STATE["kit"], STATE["outputs"] = Path(kit), Path(outputs)
    if STATE["started"]:
        return
    STATE["started"] = True
    _cpu()
    threading.Thread(target=_loop, daemon=True).start()
    threading.Thread(target=_sizes_loop, daemon=True).start()
