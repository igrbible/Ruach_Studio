"""HERESY 2999 (Viktor 25.11.2026: «Windows-ветку Pinokio вырезай полностью. WSL2 в топку»; «вырезай WSL, тестируй Win сборку и срезай rc3»):
2990's last step, the Go launcher's own WSL mode out. RuachStudio.exe knows one package, the native zip: no internal/wsl, no wsl.exe runner,
no .wsl search, no --wsl/--wsl-file/--stop/--uninstall/--resume, no RunOnce, no Uninstall in the tray, no e2e.sh with its fake wsl.exe;
build.sh vets and tests without it. launcher/start.py no longer looks for nvidia-smi in WSL's /usr/lib/wsl/lib (start.sh keeps it: a Linux
run by hand inside WSL still finds its card). The launcher's own behaviour is checked by go test and testdata/e2e-native.sh.
    .venv/bin/python lab/test_wsl_launcher_out.py"""
import importlib.util
import re
import sys
from pathlib import Path
from unittest import mock

sys.dont_write_bytecode = True
LAB = Path(__file__).resolve().parent
KIT = LAB.parent
ROOT = KIT / "heresy" / "root" if (KIT / "heresy" / "root").is_dir() else KIT   # the root's master copies, or a release tree's own
WIN = ROOT / "launcher" / "win"
ok = 0


def check(cond, what):
    global ok
    if not cond:
        print("FAIL", what)
        sys.exit(1)
    ok += 1
    print("ok  ", what)


for gone in ("internal/wsl", "internal/winos/runner.go", "testdata/e2e.sh", "testdata/fake-wsl.sh"):
    check(not (WIN / gone).exists(), f"launcher/win/{gone} is gone")
check((WIN / "testdata" / "e2e-native.sh").is_file(), "testdata/e2e-native.sh stays")
go = {p.relative_to(WIN).as_posix(): p.read_text(encoding="utf-8") for p in WIN.rglob("*.go")}
code = {n: "\n".join(l for l in t.splitlines() if not l.lstrip().startswith("//")) for n, t in go.items()}
for n, t in code.items():
    check(not re.search(r"\bwsl|RunOnce|ScheduleResume|\bUninstall|RunElevated", t, re.I), f"{n}: no WSL, RunOnce, Uninstall or UAC in its code")
main = go["cmd/ruachstudio/main.go"]
for flag in ("wsl-file", "stop", "uninstall", "resume", "wsl"):
    check(f'"{flag}"' not in main, f"main.go: no --{flag} flag")
check("does not find its folder beside RuachStudio.exe" in main and "os.Exit(1)" in main, "main.go: no native folder is said in words, and the exe ends")
tray = go["internal/tray/tray_windows.go"]
check("Uninstall" not in code["internal/tray/tray_windows.go"] and '"Quit"' in tray, "the tray: Quit, no Uninstall…")
build = (WIN / "build.sh").read_text(encoding="utf-8")
check("e2e.sh" not in build.replace("e2e-native.sh", "") and "go vet ./..." in build and "e2e-native.sh" in build, "build.sh: go vet, go test, e2e-native.sh; no e2e.sh")
check("-H windowsgui" in build, "build.sh: the exe stays a GUI program")

spec = importlib.util.spec_from_file_location("ruach_start", ROOT / "launcher" / "start.py")
start = importlib.util.module_from_spec(spec)
spec.loader.exec_module(start)
check("/usr/lib/wsl" not in (ROOT / "launcher" / "start.py").read_text(encoding="utf-8").split('"""nvidia-smi')[1].split('"""', 1)[1],
      "start.py: smi() has no /usr/lib/wsl/lib")
with mock.patch.object(start.shutil, "which", lambda n: None), mock.patch.object(start, "NT", False), \
        mock.patch.object(start.Path, "is_file", lambda self: True):
    check(start.smi() is None, "start.py: smi() off Windows with no nvidia-smi on PATH is None, whatever lies in /usr/lib/wsl/lib")
with mock.patch.object(start.shutil, "which", lambda n: "/usr/bin/nvidia-smi"):
    check(start.smi() == "/usr/bin/nvidia-smi", "start.py: smi() takes PATH's nvidia-smi")
check("/usr/lib/wsl/lib/nvidia-smi" in (ROOT / "start.sh").read_text(encoding="utf-8"), "start.sh keeps WSL's nvidia-smi among its places (Linux by hand)")
print(f"{ok} passed")
