"""HERESY 2299 (Viktor 09.11.2026: «В Художнике, Огранщике и Видеографе предлагаю минипанель под хедером студии с реальными метриками по
утилизации CPU/GPU/RAM/VRAM/NVMe/HDD, и туда же в неё прогресс-бары, чтобы юзер видел свою систему, а не гадал и не бегал в отдельные консоли
за nvidia-smi/nvitop/btop/htop. При наведении мышкой на каждую позицию — тултипом вывод метрик и графов»): the machine's own numbers for the
page's system bar, the cards aside (those are gpu_live's).

Read from the kernel itself, once a second and only while a page looks (a thread started by the first ask, ended IDLE seconds after the last):
/proc/stat (the processor in all and each core), /proc/meminfo (the memory and the swap), /proc/diskstats (each disk's reads, writes and busy
time) and statvfs of what each disk has mounted (its free space, every ten seconds). The last ten minutes kept, the cores' last minute. Nothing
runs, nothing is read, when no page looks.
"""
import collections
import os
import threading
import time

KEEP = 600                       # ten minutes at one a second
CORE_KEEP = 60                   # the cores' last minute
IDLE = 15                        # seconds without a look before the sampler stops
FREE_EVERY = 10                  # statvfs this often
LOCK = threading.Lock()
RING = collections.deque(maxlen=KEEP)        # [t, cpu %, iowait %, mem used MB, mem total MB, cache MB, swap used MB, swap total MB, {disk: [read B/s, write B/s, busy %]}]
CORES = collections.deque(maxlen=CORE_KEEP)  # [t, [core %, ...]]
STATE = {"running": False, "asked": 0.0, "error": ""}
DISKS = {"list": [], "at": 0.0, "free": {}, "free_at": 0.0}
INFO = {}
WATCH = []                       # paths whose disk the page names as the Studio's (set by the lab: the kit, its outputs)


def watch(*paths):
    WATCH[:] = [str(p) for p in paths if p]


def _cpu_times():
    """{"cpu": (busy, total), "cpu0": …} from /proc/stat; busy leaves out idle and iowait, iowait is kept apart for the total."""
    out = {}
    with open("/proc/stat") as f:
        for line in f:
            if not line.startswith("cpu"):
                break
            parts = line.split()
            v = [int(x) for x in parts[1:9]] + [0] * max(0, 8 - len(parts[1:9]))
            total = sum(v)
            idle, iowait = v[3], v[4]
            out[parts[0]] = (total - idle - iowait, total, iowait)
    return out


def _meminfo():
    m = {}
    with open("/proc/meminfo") as f:
        for line in f:
            k, _, rest = line.partition(":")
            try:
                m[k] = int(rest.split()[0]) // 1024      # kB → MB
            except (ValueError, IndexError):
                pass
    total = m.get("MemTotal", 0)
    avail = m.get("MemAvailable", m.get("MemFree", 0))
    cache = m.get("Cached", 0) + m.get("Buffers", 0) + m.get("SReclaimable", 0)
    return total - avail, total, cache, m.get("SwapTotal", 0) - m.get("SwapFree", 0), m.get("SwapTotal", 0)


def _parent(dev):
    """The whole disk a block device lies on (nvme1n1p1 → nvme1n1, sda2 → sda); a device-mapper or md device is its own."""
    try:
        real = os.path.realpath("/sys/class/block/" + dev)
    except OSError:
        return dev
    if os.path.exists(os.path.join(real, "partition")):
        return os.path.basename(os.path.dirname(real))
    return dev


def _read(path, default=""):
    try:
        with open(path) as f:
            return f.read().strip()
    except OSError:
        return default


def _disks():
    """The local disks something is mounted from: [{"id", "kind", "model", "usb", "mounts", "role"}], looked for again every minute.
    Network, loop, RAM and virtual filesystems are not disks; the system's disk first, then the Studio's, then the rest by name."""
    if DISKS["list"] and time.time() - DISKS["at"] < 60:
        return DISKS["list"]
    found = {}
    try:
        with open("/proc/self/mounts") as f:
            rows = [line.split() for line in f]
    except OSError:
        rows = []
    for row in rows:
        if len(row) < 3 or not row[0].startswith("/dev/") or row[0].startswith("/dev/loop"):
            continue
        dev = os.path.basename(os.path.realpath(row[0]))
        if not os.path.exists("/sys/class/block/" + dev):
            continue
        mnt = row[1].replace("\\040", " ")
        if mnt.startswith(("/snap/", "/boot")) or "/efivars" in mnt:
            continue                                     # the boot partition and snaps: not where anything is kept
        disk = _parent(dev)
        d = found.setdefault(disk, {"id": disk, "mounts": [], "devs": set()})
        d["mounts"].append(mnt)
        d["devs"].add(dev)
    sys_dev = None
    try:
        sys_dev = os.stat("/").st_dev
    except OSError:
        pass
    studio_devs = set()
    for p in WATCH:
        try:
            studio_devs.add(os.stat(p).st_dev)
        except OSError:
            pass
    out = []
    for disk, d in found.items():
        blk = "/sys/block/" + disk
        rota = _read(blk + "/queue/rotational", "0") == "1"
        kind = "NVMe" if disk.startswith("nvme") else ("HDD" if rota else "SSD")
        usb = "/usb" in os.path.realpath(blk)
        model = " ".join(_read(blk + "/device/model").split()) or _read(blk + "/dm/name") or disk
        devs = set()
        for m in d["mounts"]:
            try:
                devs.add(os.stat(m).st_dev)
            except OSError:
                pass
        role = "system" if sys_dev in devs else ("studio" if devs & studio_devs else "")
        if role == "system" and devs & studio_devs:
            role = "system studio"
        mounts = sorted(set(d["mounts"]), key=lambda m: (len(m), m))
        out.append({"id": disk, "kind": kind, "usb": usb, "model": model, "mounts": mounts, "role": role, "devs": sorted(d["devs"])})
    rank = {"system studio": 0, "system": 0, "studio": 1, "": 2}
    out.sort(key=lambda d: (rank.get(d["role"], 2), d["id"]))
    DISKS.update(list=out, at=time.time())
    return out


def _free(disks):
    """Free and total bytes of each disk (all it has mounted, each filesystem once), every FREE_EVERY seconds."""
    if DISKS["free"] and time.time() - DISKS["free_at"] < FREE_EVERY:
        return DISKS["free"]
    out = {}
    for d in disks:
        seen, free, total = set(), 0, 0
        for m in d["mounts"]:
            try:
                st = os.statvfs(m)
                dev = os.stat(m).st_dev
            except OSError:
                continue
            if dev in seen:
                continue
            seen.add(dev)
            free += st.f_bavail * st.f_frsize
            total += st.f_blocks * st.f_frsize
        out[d["id"]] = [free, total]
    DISKS.update(free=out, free_at=time.time())
    return out


def _diskstats(ids):
    """{disk: (sectors read, sectors written, ms busy)} for the disks named."""
    out = {}
    try:
        with open("/proc/diskstats") as f:
            for line in f:
                p = line.split()
                if len(p) >= 13 and p[2] in ids:
                    out[p[2]] = (int(p[5]), int(p[9]), int(p[12]))
    except OSError:
        pass
    return out


def _info():
    if INFO:
        return INFO
    name = ""
    for line in _read("/proc/cpuinfo").splitlines():
        if line.startswith("model name"):
            name = " ".join(line.split(":", 1)[1].split())
            break
    INFO.update(cpu=name or os.uname().machine, threads=os.cpu_count() or 0)
    return INFO


def _run():
    prev_cpu, prev_disk, prev_t = None, None, None
    try:
        while time.time() - STATE["asked"] <= IDLE:
            t0 = time.time()
            try:
                disks = _disks()
                cpu = _cpu_times()
                dstat = _diskstats({d["id"] for d in disks})
                used, total, cache, sw_used, sw_total = _meminfo()
                _free(disks)
            except OSError as e:
                STATE["error"] = f"the kernel's numbers could not be read ({e})"
                time.sleep(1)
                continue
            STATE["error"] = ""
            now = time.time()
            if prev_cpu is not None:
                def share(k, idx=0):
                    a, b = cpu.get(k), prev_cpu.get(k)
                    if not a or not b or a[1] <= b[1]:
                        return 0.0
                    return round(100.0 * (a[idx] - b[idx]) / (a[1] - b[1]), 1)
                cores = []
                n = 0
                while ("cpu%d" % n) in cpu:
                    cores.append(int(round(share("cpu%d" % n))))
                    n += 1
                a, b = cpu.get("cpu"), prev_cpu.get("cpu")
                iowait = round(100.0 * (a[2] - b[2]) / (a[1] - b[1]), 1) if a and b and a[1] > b[1] else 0.0
                dt = max(0.05, now - prev_t)
                rates = {}
                for k, v in dstat.items():
                    w = prev_disk.get(k)
                    if w:
                        rates[k] = [int((v[0] - w[0]) * 512 / dt), int((v[1] - w[1]) * 512 / dt), round(min(100.0, (v[2] - w[2]) / (dt * 10)), 1)]
                with LOCK:
                    RING.append([round(now, 2), share("cpu"), iowait, used, total, cache, sw_used, sw_total, rates])
                    CORES.append([round(now, 2), cores])
            prev_cpu, prev_disk, prev_t = cpu, dstat, now
            time.sleep(max(0.2, 1.0 - (time.time() - t0)))
    finally:
        STATE["running"] = False


def live(since=0.0):
    """The samples newer than `since` (all kept for 0), the cores' too, the disks with their free space; the sampler started when it is not
    running. HERESY 2299."""
    STATE["asked"] = time.time()
    with LOCK:
        if not STATE["running"]:
            STATE["running"] = True
            threading.Thread(target=_run, daemon=True, name="sys-live").start()
        samples = [r for r in RING if r[0] > since]
        cores = [r for r in CORES if r[0] > since]
    disks = DISKS["list"]
    free = DISKS["free"]
    return {"now": time.time(), "every": 1, "keep": KEEP, "error": STATE["error"], "cpu": _info(),
            "load": [round(x, 2) for x in os.getloadavg()] if hasattr(os, "getloadavg") else [],
            "disks": [{k: v for k, v in d.items() if k != "devs"} | {"free": (free.get(d["id"]) or [None, None])[0],
                                                                   "total": (free.get(d["id"]) or [None, None])[1]} for d in disks],
            "samples": samples, "cores": cores}
