"""HERESY 1169 · 1304 (Viktor 10.10.2026: «Давай допишем при самом старте новой Студии сканирование устройств и выбор оптимальных
настроек для YuE2 BF16/кванта и для модели генерации обложек»): what the machine has, for the page's scan at a new studio's first
start (and Engine → Compute's «Scan the machine» after it): each card's name, memory and compute capability (Turing, 7.5, has no
BF16 tensor cores: BF16 runs there, slower than Q8_0), its VRAM limit (Engine → GPUs), the studio's card. Imported by lab.py,
which adds the painter that fits (GET /machine)."""
import subprocess


def _smi(fields):
    q = subprocess.run(["nvidia-smi", "--query-gpu=" + fields, "--format=csv,noheader,nounits"], capture_output=True, text=True, timeout=20)
    if q.returncode != 0:
        raise RuntimeError((q.stderr or q.stdout).strip()[:200] or "nvidia-smi failed")
    return [[c.strip() for c in line.split(",")] for line in q.stdout.strip().splitlines() if line.strip()]


def cards():
    """[{index, name, total_mb, compute}]: compute «8.6», or None where the driver does not say it (an old nvidia-smi has no
    compute_cap: asked apart, so its absence costs only that). RuntimeError when nvidia-smi cannot be run at all."""
    try:
        rows = _smi("index,name,memory.total")
    except (OSError, subprocess.SubprocessError) as e:
        raise RuntimeError(f"nvidia-smi did not answer: {e}")
    out = [{"index": int(i), "name": n, "total_mb": int(t), "compute": None} for i, n, t in rows]
    try:
        cap = {int(i): c for i, c in _smi("index,compute_cap")}
        for c in out:
            c["compute"] = cap.get(c["index"]) or None
    except (OSError, subprocess.SubprocessError, RuntimeError, ValueError):
        pass
    return out


def has_bf16_cores(compute):
    """Ampere (8.0) and later do BF16 in their tensor cores; Turing (7.5) and older run it slower than Q8_0. None: unknown, so yes."""
    try:
        return float(compute) >= 8.0
    except (TypeError, ValueError):
        return True
