"""HERESY 2930: a machine with no NVIDIA card, no systemd and no /proc (the 2.1.0-rc1 Windows soak) is answered in words: the Reader's cards
and the painter's sizes from a probe that says {"error"}, the free memory through psutil, the updater's look and the Trainer without systemd.
    .venv/bin/python lab/test_windows_soak_2930.py"""
import os, shutil, sys, tempfile
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import winx

ok = 0
def check(cond, what):
    global ok
    if not cond:
        print("FAIL", what); sys.exit(1)
    ok += 1; print("PASS", what)

real_which, real_proc, real_mem = shutil.which, winx.PROC, winx.meminfo_mb
try:
    winx.PROC = False
    winx.meminfo_mb = lambda: (6 * 1024, 24 * 1024, 0, 0, 0)
    import reader, artist
    check(abs(reader._ram_gb() - 18.0) < 1e-6, "the Reader's free memory through psutil where there is no /proc: 18 GB of 24, not «could not be read»")
    check(abs(artist._ram_free_gb() - 18.0) < 1e-6, "the painter's free memory the same way, not 0 GB")
    reader.H["gpus_state"] = lambda: {"cards": {"error": "nvidia-smi did not answer"}, "roles": {"jobs": [0]}, "arc": [], "studio_now": None}
    got = reader.cards()
    check(got["cuda"] == [] and got["arc"] == [] and got["studio"] is None, "the Reader's cards with no NVIDIA card: none, not a 500")

    shutil.which = lambda name, *a, **k: None if name in ("systemctl", "systemd-run") else real_which(name, *a, **k)
    import updates, training
    check(updates._unit_active() is False, "no systemctl: the update's unit runs nowhere, said False, not [WinError 2]")
    os.environ["RUACH_LAUNCHER"] = "native"
    with tempfile.TemporaryDirectory() as d:
        (Path(d) / "VERSION").write_text("2.1.0-rc1\n", encoding="utf-8")
        st = updates.status(d, d)
    check(st["running"] is False and st["can_run"] is False and "tray menu" in st["why"], "the updater's look from RuachStudio.exe: the tray's way, said")
    try:
        training.train(tempfile.gettempdir(), {"dataset": "x", "name": "y"}, lambda *a: 0)
        check(False, "a training without systemd refused")
    except ValueError as e:
        check("systemd" in str(e) and "Linux" in str(e), "a training without systemd refused in words before a run is written")
finally:
    shutil.which, winx.PROC, winx.meminfo_mb = real_which, real_proc, real_mem
    os.environ.pop("RUACH_LAUNCHER", None)
print(f"{ok} passed")
