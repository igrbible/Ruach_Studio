"""HERESY 1264 (Viktor 09.10.2026: «Добавь в страничку Engine в GPUs секцию под каждым btop-like монитор утилизации/VRAM usage в
реальном времени»; «btop ересь можно прикрутить и к фрейму лога сервера… живая шкала активных GPU, где главная карта особо
обрамлена. Пометки над блоками графов — какая роль карты»): the cards' load and memory second by second, for the page's live graphs.

One nvidia-smi in its loop mode (-lms 1000) while a page looks, ended a minute after the last look: each card's utilization, memory
used and total, temperature and power, the last two minutes kept. Without nvidia-smi the answer says so, and the page shows no graph.
"""
import collections
import subprocess
import threading
import time

KEEP = 120                       # samples a card keeps: two minutes at one a second
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
        p = subprocess.Popen(["nvidia-smi", "--query-gpu=" + QUERY, "--format=csv,noheader,nounits", "-lms", "1000"],
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


def live(since=0.0):
    """The samples newer than `since` (all kept ones for 0), card by card; the sampler started when it is not running."""
    STATE["asked"] = time.time()
    with LOCK:
        if not STATE["running"]:
            STATE["running"] = True
            threading.Thread(target=_run, daemon=True).start()
        cards = [{"index": i, "name": NAMES.get(i, ""), "samples": [r for r in RING[i] if r[0] > since]} for i in sorted(RING)]
    return {"cards": cards, "error": STATE["error"], "now": time.time(), "keep": KEEP}
