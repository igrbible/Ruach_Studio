"""HERESY 2998: the Studio in a folder with spaces and Cyrillic and the music in another, as a Windows person's lie (C:\\Users\\Тестер Иванов\\
Downloads\\Ruach Studio 2.1\\RuachStudio and D:\\Музыка 2026\\Мои треки), run here: the lab's path handling (places.norm, winx.runtime_path,
winx.native_exe, launcher/start.py's engine_bin) and real jobs through ffmpeg and ffprobe (inspect_job.py on a take, no_train's tag of a
file) with the KIT under «Ruach Studio Тест/Тестер Иванов» and the inputs under «Музыка 2026/Мои треки». Then the same jobs in a Python
whose preferred encoding is cp1251, the Windows VM's (a private ru_RU.CP1251 locale made by localedef, said and left out where it cannot be
made): ffmpeg and ffprobe speak UTF-8, and a pipe read in cp1251 broke on «И», whose second byte (0x98) is no letter in cp1251. Linux file
names in that locale are bytes in cp1251, so its inputs keep «И» in their tags, not in their names (Windows names are UTF-16 and hold any).
    .venv/bin/python lab/test_cyrillic_paths_2998.py"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

LAB = Path(__file__).resolve().parent
KIT0 = LAB.parent
LAUNCHER = KIT0 / "heresy" / "root" / "launcher" if (KIT0 / "heresy" / "root" / "launcher").is_dir() else KIT0 / "launcher"
sys.path.insert(0, str(LAB))
import no_train  # noqa: E402
import places  # noqa: E402
import winx  # noqa: E402

ok = 0


def check(cond, what):
    global ok
    if not cond:
        print("FAIL", what)
        sys.exit(1)
    ok += 1
    print("PASS", what)


def run(args, env=None, cwd=None):
    return subprocess.run([str(a) for a in args], capture_output=True, timeout=300, env=env, cwd=cwd, encoding="utf-8", errors="replace")


tmp = Path(tempfile.mkdtemp(prefix="claude-2998-"))
real_nt = winx.NT
try:
    kit = tmp / "Ruach Studio Тест" / "Тестер Иванов"
    music = tmp / "Музыка 2026" / "Мои треки"
    for d in (kit / "lab" / "cache", kit / "launcher", kit / "outputs" / "Мой трек 1", music):
        d.mkdir(parents=True)
    for f in ("winx.py", "paths.py", "no_train.py", "inspect_job.py"):
        shutil.copy2(LAB / f, kit / "lab" / f)
    shutil.copy2(LAUNCHER / "start.py", kit / "launcher" / "start.py")

    # the lab's path handling
    check(places.norm(f'"{music}"') == str(music) and places.norm(f"  {music}/ ") == str(music), "places.norm: a typed folder with spaces and Cyrillic, quoted or not")
    winx.NT = True
    try:
        check(places.norm('"D:\\Музыка 2026\\Мои треки"') == "D:\\Музыка 2026\\Мои треки", "places.norm on Windows: D:\\Музыка 2026\\Мои треки as typed")
    finally:
        winx.NT = real_nt
    for d in ("runtime/ffmpeg", "runtime/fluidsynth", "engine/cpu", "engine/cuda"):
        (kit / d).mkdir(parents=True)
    for f in ("runtime/ffmpeg/ffmpeg.exe", "runtime/fluidsynth/fluidsynth.exe", "engine/cpu/llama-server.exe", "engine/cpu/yue-server.exe"):
        (kit / f).write_bytes(b"")
    env = {"Path": "C:\\Windows\\system32;" + str(kit / "runtime" / "ffmpeg")}
    first = winx.runtime_path(kit, env=env, nt=True)
    check(env["Path"].split(";")[:3] == [str(kit / "runtime" / "ffmpeg"), str(kit / "runtime" / "fluidsynth"), "C:\\Windows\\system32"] and len(first) == 2,
          f"winx.runtime_path: the Studio's programs first on PATH from a folder with spaces and Cyrillic, each once ({env['Path'][:120]})")
    check(winx.native_exe(kit, "llama-server", ("cuda", "cpu"), nt=True) == kit / "engine" / "cpu" / "llama-server.exe", "winx.native_exe finds engine\\cpu's program there")
    r = run([sys.executable, "-c", "import sys; sys.path.insert(0, sys.argv[1]); import start; print(start.engine_bin(False)); print(start.ROOT)", kit / "launcher"])
    lines = r.stdout.strip().splitlines()
    check(r.returncode == 0 and len(lines) == 2 and lines[1] == str(kit) and lines[0].startswith(str(kit)),
          f"launcher/start.py takes its folder (spaces, Cyrillic) as the Studio's and its engine from it ({r.stdout.strip()[-200:]} {r.stderr.strip()[-200:]})")

    ff, fp = shutil.which("ffmpeg"), shutil.which("ffprobe")
    if not (ff and fp):
        print("     no ffmpeg or ffprobe on this machine: the jobs are not run")
    else:
        tag = no_train.comment("Тестер Иванов", "голос не для обучения")
        song = music / "Мой трек 1.flac"
        r = run([ff, "-v", "error", "-y", "-f", "lavfi", "-i", "sine=f=440:d=4", "-metadata", f"comment={tag}", "-c:a", "flac", song])
        check(r.returncode == 0 and song.is_file(), f"ffmpeg writes {song.relative_to(tmp)} ({r.stderr.strip()[-200:]})")
        take = kit / "outputs" / "Мой трек 1"
        (take / "request.json").write_text(json.dumps({"lyrics": "Снег над Саскатуном"}, ensure_ascii=False), encoding="utf-8")
        shutil.copy2(song, take / "audio.flac")

        def jobs(py_env, src, out, label):
            r = run([sys.executable, kit / "lab" / "inspect_job.py", src, out], env=py_env)
            lo = json.loads(out.read_text(encoding="utf-8")).get("loudness", {}) if out.is_file() else {}
            check(r.returncode == 0 and "lufs" in lo, f"{label}: inspect_job.py on {Path(src).name} measures it ({lo} {r.stderr.strip()[-160:]})")
            code = ("import json, sys; sys.path.insert(0, sys.argv[1]); import no_train; "
                    "print(json.dumps([no_train._probe(sys.argv[2]), no_train.of_file(sys.argv[2])]))")
            r = run([sys.executable, "-c", code, kit / "lab", src], env=py_env)
            try:
                got = json.loads(r.stdout.strip().splitlines()[-1])
            except (ValueError, IndexError):
                got = None
            check(r.returncode == 0 and got and got[0] == tag and got[1] == "its comment tag says never for training",
                  f"{label}: no_train reads the file's tag whole («{tag}») and keeps it out of training ({got} {r.stderr.strip()[-160:]})")

        base = dict(os.environ, PYTHONUTF8="1", PYTHONIOENCODING="utf-8")
        jobs(base, take / "audio.flac", kit / "lab" / "cache" / "Мой трек 1.inspect.json", "UTF-8, the KIT and the take with spaces and Cyrillic")
        jobs(base, song, kit / "lab" / "cache" / "Мой трек 1.music.json", "UTF-8, the music folder «Музыка 2026/Мои треки»")

        loc = tmp / "locale"
        loc.mkdir()
        made = shutil.which("localedef") and subprocess.run(["localedef", "-i", "ru_RU", "-f", "CP1251", str(loc / "ru_RU.CP1251")],
                                                            capture_output=True, timeout=120).returncode in (0, 1) and (loc / "ru_RU.CP1251").exists()
        cp = {k: v for k, v in os.environ.items() if not k.startswith(("LC_", "PYTHONIOENCODING"))}
        cp.update(LOCPATH=str(loc), LANG="ru_RU.CP1251", LC_ALL="ru_RU.CP1251", PYTHONUTF8="0", PYTHONCOERCECLOCALE="0")
        r = run([sys.executable, "-c", "import locale; print(locale.getpreferredencoding(False).lower())"], env=cp) if made else None
        if not (r and r.stdout.strip() in ("cp1251", "windows-1251")):
            print("     a cp1251 locale cannot be made here (localedef, ru_RU, CP1251): the jobs in a cp1251 Python are not run")
        else:
            win = tmp / "Музыка 2026" / "Мой трек 2.flac"     # no «И» in a name here (see the top); the tag holds it
            shutil.copy2(song, win)
            jobs(cp, win, tmp / "Музыка 2026" / "Мой трек 2.json", "a Python in cp1251 (the VM's), ffmpeg and ffprobe saying «Иванов» in UTF-8")
finally:
    winx.NT = real_nt
    shutil.rmtree(tmp, ignore_errors=True)
print(f"{ok} passed")
