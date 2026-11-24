"""HERESY 2299 (Viktor 09.11.2026: «В Художнике, Огранщике и Видеографе предлагаю минипанель под хедером студии с реальными метриками по
утилизации CPU/GPU/RAM/VRAM/NVMe/HDD, и туда же в неё прогресс-бары, чтобы юзер видел свою систему, а не гадал и не бегал в отдельные консоли
за nvidia-smi/nvitop/btop/htop. При наведении мышкой на каждую позицию — тултипом вывод метрик и графов»): the machine's own numbers for the
page's system bar, the cards aside (those are gpu_live's).

Read from the kernel itself, once a second and only while a page looks (a thread started by the first ask, ended IDLE seconds after the last):
/proc/stat (the processor in all and each core), /proc/meminfo (the memory and the swap), /proc/diskstats (each disk's reads, writes and busy
time) and the free space of what each disk has mounted (its free space, every ten seconds). The last ten minutes kept, the cores' last minute. Nothing
runs, nothing is read, when no page looks. On Windows and macOS (no /proc) the processor and memory come through winx (psutil), on
Windows the disks are its drives (HERESY 2924).
"""
import collections
import os
import platform
import re
import shutil
import threading
import time

import winx   # HERESY 2924 (issue 15): Windows has no /proc, os.statvfs nor os.uname

KEEP = 600                       # ten minutes at one a second
CORE_KEEP = 60                   # the cores' last minute
IDLE = 15                        # seconds without a look before the sampler stops
FREE_EVERY = 10                  # the disks' free space this often
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
    if not winx.PROC:                                    # HERESY 2924: Windows and macOS, psutil's times through winx (no iowait there)
        return winx.cpu_times()
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
    if not winx.PROC:                                    # HERESY 2924: psutil's through winx
        return winx.meminfo_mb()
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
    if winx.NT:                                          # HERESY 2924: no /proc on Windows: its drives
        return _disks_nt()
    if not winx.PROC:                                    # HERESY 2934: macOS, no /proc either: its disks by psutil (the bar listed none)
        return _disks_mac()
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


def _disks_nt():
    """HERESY 2924 (issue 15): Windows' local drives as disks, one a letter (psutil's partitions; no CD, no network share): the system's
    drive first, then the Studio's."""
    sysdrive = (os.environ.get("SystemDrive") or "C:").upper()
    studio = {os.path.splitdrive(os.path.abspath(p))[0].upper() for p in WATCH}
    out = []
    try:
        import psutil                                    # the Windows install brings it (launcher/setup_win.py), as winx needs
        parts = psutil.disk_partitions(all=False)
    except Exception:  # noqa: BLE001   a drive that will not say leaves the bar without disks, never the lab without its bar
        parts = []
    for p in parts:
        if "cdrom" in (p.opts or "") or not p.fstype:
            continue
        letter = os.path.splitdrive(p.mountpoint)[0].upper() or p.mountpoint
        role = " ".join(r for r, ok in (("system", letter == sysdrive), ("studio", letter in studio)) if ok)
        out.append({"id": letter, "kind": "", "usb": "removable" in (p.opts or ""), "model": f"{letter} {p.fstype}", "mounts": [p.mountpoint],
                    "role": role, "devs": [letter]})
    rank = {"system studio": 0, "system": 0, "studio": 1, "": 2}
    out.sort(key=lambda d: (rank.get(d["role"], 2), d["id"]))
    DISKS.update(list=out, at=time.time())
    return out


def _disks_mac():
    """HERESY 2934: a Mac's disks (no /proc there, so the bar listed none): one a whole disk (diskN, an APFS container with its volumes) by
    psutil's partitions, shown by the volume a person knows it by (/ for the system's, else its first); the system's disk first, then the
    Studio's. Its free room is the container's, read once through that volume (APFS volumes share it)."""
    try:
        import psutil
        parts = psutil.disk_partitions(all=False)
    except Exception:  # noqa: BLE001   a disk that will not say leaves the bar without disks, never the lab without its bar
        parts = []
    found = {}
    for p in parts:
        m = re.match(r"^/dev/(disk\d+)", p.device or "")
        mnt = p.mountpoint or ""
        if not m or (mnt.startswith("/System/Volumes/") and mnt != "/System/Volumes/Data"):
            continue                                     # the system's own volumes (VM, Preboot, Update…): not where anything is kept
        found.setdefault(m.group(1), {"mounts": [], "fs": p.fstype or ""})["mounts"].append(mnt)
    studio = set()
    for w in WATCH:
        try:
            studio.add(os.stat(w).st_dev)
        except OSError:
            pass
    out = []
    for disk, d in found.items():
        devs = set()
        for mnt in d["mounts"]:
            try:
                devs.add(os.stat(mnt).st_dev)
            except OSError:
                pass
        role = " ".join(r for r, ok in (("system", "/" in d["mounts"]), ("studio", bool(devs & studio))) if ok)
        shown = "/" if "/" in d["mounts"] else sorted(d["mounts"], key=lambda m: (len(m), m))[0]
        out.append({"id": disk, "kind": "", "usb": False, "model": f"{disk} {d['fs']}".strip(), "mounts": [shown], "role": role, "devs": [disk]})
    rank = {"system studio": 0, "system": 0, "studio": 1, "": 2}
    out.sort(key=lambda d: (rank.get(d["role"], 2), d["id"]))
    DISKS.update(list=out, at=time.time())
    return out


NT_DRIVE = {}                                            # HERESY 2934: a Windows drive letter's physical disk number, asked once a letter


def _drive_number(letter):
    """HERESY 2934: the physical disk a Windows drive letter lies on (its PhysicalDriveN's N), by IOCTL_STORAGE_GET_DEVICE_NUMBER on the
    volume opened with no access asked (no administrator needed); None when it will not say (a volume over several disks, a network drive)."""
    if letter in NT_DRIVE:
        return NT_DRIVE[letter]
    n = None
    try:
        import ctypes
        from ctypes import wintypes
        k32 = ctypes.WinDLL("kernel32", use_last_error=True)
        k32.CreateFileW.restype = wintypes.HANDLE
        k32.CreateFileW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD, wintypes.LPVOID, wintypes.DWORD, wintypes.DWORD,
                                    wintypes.HANDLE]
        k32.DeviceIoControl.argtypes = [wintypes.HANDLE, wintypes.DWORD, wintypes.LPVOID, wintypes.DWORD, wintypes.LPVOID, wintypes.DWORD,
                                        ctypes.POINTER(wintypes.DWORD), wintypes.LPVOID]
        k32.CloseHandle.argtypes = [wintypes.HANDLE]
        h = k32.CreateFileW("\\\\.\\" + str(letter).rstrip("\\/"), 0, 3, None, 3, 0, None)   # FILE_SHARE_READ | WRITE, OPEN_EXISTING
        if h and h != ctypes.c_void_p(-1).value:
            try:
                class Number(ctypes.Structure):
                    _fields_ = [("kind", wintypes.DWORD), ("number", wintypes.DWORD), ("partition", wintypes.DWORD)]
                got, size = Number(), wintypes.DWORD()
                if k32.DeviceIoControl(h, 0x2D1080, None, 0, ctypes.byref(got), ctypes.sizeof(got), ctypes.byref(size), None):
                    n = int(got.number)
            finally:
                k32.CloseHandle(h)
    except (OSError, AttributeError, ValueError, TypeError):
        n = None
    NT_DRIVE[letter] = n
    return n


def _diskstats_psutil(ids):
    """HERESY 2934 (the third Windows soak: the system bar's disk speeds were «—»): /proc/diskstats' three numbers from psutil's counters, in
    its units (bytes as 512-byte sectors, ms busy). Windows counts physical disks (PhysicalDriveN), each drive letter read from the disk it lies
    on (two letters of one disk show the same speeds); a Mac its diskN. Busy is the system's own where it keeps one, else the reads' and writes'
    own times (Windows), which the bar caps at 100 %."""
    try:
        import psutil
        io = psutil.disk_io_counters(perdisk=True) or {}
    except Exception:  # noqa: BLE001   no counters (no psutil, or the system's switched off): no speeds, «—» as before
        return {}
    out = {}
    for d in ids:
        key = d
        if winx.NT:
            n = _drive_number(d)
            key = f"PhysicalDrive{n}" if n is not None else None
        c = io.get(key) if key else None
        if c is None:
            continue
        busy = getattr(c, "busy_time", None)
        if busy is None:
            busy = (getattr(c, "read_time", 0) or 0) + (getattr(c, "write_time", 0) or 0)
        out[d] = (int(c.read_bytes) // 512, int(c.write_bytes) // 512, int(busy))
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
                st = shutil.disk_usage(m)                # HERESY 2924: statvfs is POSIX only; on Linux the same f_bavail and f_blocks × f_frsize
                dev = os.stat(m).st_dev
            except OSError:
                continue
            if dev in seen:
                continue
            seen.add(dev)
            free += st.free
            total += st.total
        out[d["id"]] = [free, total]
    DISKS.update(free=out, free_at=time.time())
    return out


def _diskstats(ids):
    """{disk: (sectors read, sectors written, ms busy)} for the disks named."""
    if not winx.PROC:                                    # HERESY 2934: Windows and macOS, from psutil's counters
        return _diskstats_psutil(ids)
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
    if not name:                                         # HERESY 2924: Windows has no os.uname (nor /proc/cpuinfo)
        name = os.uname().machine if hasattr(os, "uname") else (platform.processor() or platform.machine())
    INFO.update(cpu=name, threads=os.cpu_count() or 0)
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
                STATE["error"] = f"the kernel's numbers could not be read ({winx.said(e)})"   # HERESY 2934
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
