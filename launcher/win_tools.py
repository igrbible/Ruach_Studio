#!/usr/bin/env python3
"""HERESY 2989 (Viktor 25.11.2026: «В Windows сборку включи самый стабильный ffmpeg.exe, чтобы не иметь лишней зависимости. И другие тулзы так
же, если есть что-то, что мы пропустили ранее»): the programs the Studio runs beside it on Windows, pinned here once for the package's builder
(.github/workflows/windows.yml) and for Engine → Models (part «programs»: launcher/fetch_heresy.py, and heresy/fetch-heresy.sh under Git for
Windows' bash). Each is a release build from a known address, held to its size and SHA-256 before a byte of it is unpacked, and goes into
runtime/<name>/ with its licence and where its source is (SOURCE.txt); lab/winx.runtime_path puts every runtime/<name> first on PATH on Windows,
so the lab, its jobs and the engine call «ffmpeg» as on Linux. Nothing here runs on Linux or macOS: their ffmpeg is the system's.

    ffmpeg       FFmpeg 9.0.2, Gyan.dev's «release essentials» build: static, GPL-3.0, x64 (ffmpeg.exe and ffprobe.exe; ffplay is left out).
                 A tagged release of the stable branch (20.09.2026), not a git snapshot and not a «latest» file that changes under its name;
                 GPL because the Studio encodes with libx264 and libx265 and stretches with librubberband (an LGPL build has none of them).
    fluidsynth   FluidSynth 2.5.7, its makers' win10-x64 build: LGPL-2.1 (fluidsynth.exe and its DLLs), the Orchestra's SF2 renderer.

    python launcher/win_tools.py --into DIR NAME…          fetch, check and unpack into DIR/runtime/NAME (the package's builder)
    python launcher/win_tools.py --studio DIR [--check] --verdicts NAME…
                                                            for fetch-heresy.sh: a line each, «verdict<TAB>what<TAB>words»
Exit 0 when every one is here (or came), 1 when one is not.
"""
import hashlib
import os
import posixpath
import shutil
import ssl
import sys
import time
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(os.path.abspath(__file__)).parent.parent
TITLE = "Windows programs: FFmpeg 9.0.2 (ffmpeg, ffprobe) and FluidSynth 2.5.7, pinned, into runtime/"   # the part's line, bash's and the twin's

PINS = {
    "ffmpeg": {
        "what": "FFmpeg 9.0.2 (Gyan.dev's release essentials build, static, GPL-3.0)",
        "url": "https://github.com/GyanD/codexffmpeg/releases/download/9.0.2/ffmpeg-9.0.2-essentials_build.zip",
        "size": 114768076, "sha256": "60f467265b1e312373dbcd92200c2618a74850f98d3d078e94296bb3fa2047ba",
        "exes": ["ffmpeg.exe", "ffprobe.exe"], "dlls": False, "keep": ["LICENSE", "README.txt"],
        "licence": "GPL-3.0-or-later (its LICENSE beside it; README.txt names the source commit and every library built in)",
        "source": "https://ffmpeg.org/releases/ffmpeg-9.0.2.tar.xz (FFmpeg's own release tarball); the build's recipe: https://www.gyan.dev/ffmpeg/builds/",
    },
    "fluidsynth": {
        "what": "FluidSynth 2.5.7 (its makers' win10-x64 build, LGPL-2.1)",
        "url": "https://github.com/FluidSynth/fluidsynth/releases/download/v2.5.7/fluidsynth-v2.5.7-win10-x64-cpp11.zip",
        "size": 2657270, "sha256": "fd40c259c56afd6c9ed02ca6c543f896524ade2e3eada28894df7839794f24c9",
        "exes": ["fluidsynth.exe"], "dlls": True, "keep": [], "licence_file": "LICENSES/LGPL-2.1.txt", "msvc": True,
        "licence": "LGPL-2.1-or-later (LGPL-2.1.txt beside it); its DLLs may be replaced by your own build of the same version",
        "source": "https://github.com/FluidSynth/fluidsynth/archive/refs/tags/v2.5.7.tar.gz",
    },
}
MARK = ".ruach-pin"                                   # the SHA-256 of the archive the folder was unpacked from


def folder(name, root=ROOT):
    return Path(root) / "runtime" / name


def here(name, root=ROOT):
    """Its programs are in runtime/<name> and came from the pinned archive (its mark says the pinned SHA-256)."""
    p, d = PINS[name], folder(name, root)
    try:
        return all((d / x).is_file() for x in p["exes"]) and (d / MARK).read_text(encoding="utf-8").strip() == p["sha256"]
    except OSError:
        return False


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for b in iter(lambda: f.read(1 << 22), b""):
            h.update(b)
    return h.hexdigest()


def get(url, dst, size, sha, tries=3):
    """The archive into DST, held to its size and SHA-256: None, or why not in plain words (the builder's way: stdlib only, a cut download
    taken up from where it stopped)."""
    dst = Path(dst)
    dst.parent.mkdir(parents=True, exist_ok=True)
    inc = dst.with_name(dst.name + ".incomplete")
    why = None
    for n in range(tries):
        have = inc.stat().st_size if inc.is_file() else 0
        if have > size:
            inc.unlink()
            have = 0
        if have < size:
            req = urllib.request.Request(url, headers={"User-Agent": "RuachStudio-fetch", **({"Range": f"bytes={have}-"} if have else {})})
            try:
                with urllib.request.urlopen(req, timeout=60, context=ssl.create_default_context()) as r, \
                        open(inc, "ab" if have and r.status == 206 else "wb") as f:
                    shutil.copyfileobj(r, f, 1 << 20)
            except Exception as e:  # urllib's, ssl's, the socket's: said as they are
                why = f"{url.split('/')[2]} did not give it ({type(e).__name__}: {e})"
                time.sleep(5 * (n + 1))
                continue
        got = inc.stat().st_size
        if got != size:
            why = f"{got} bytes came, the pinned size is {size}"
            continue
        h = sha256(inc)
        if h != sha:
            inc.unlink()
            return f"its SHA-256 {h[:16]}… is not the pinned {sha[:16]}…: not the pinned build, removed"
        os.replace(inc, dst)
        return None
    return why


def unpack(name, archive, root=ROOT):
    """The pinned archive's programs into runtime/<name>: the named .exe files (and, for a program that loads its own, every DLL beside its
    .exe), the licence files it carries, the licence the Studio keeps for it, the MSVC runtime the package's engine carries when it needs one,
    SOURCE.txt and the mark. Every file goes in by its own name alone, so no name in the archive reaches outside the folder; a half-made folder
    never stands in its place. ValueError when the archive does not hold a program it should."""
    p, d = PINS[name], folder(name, root)
    tmp = d.with_name(d.name + ".part")
    shutil.rmtree(tmp, ignore_errors=True)
    tmp.mkdir(parents=True)
    try:
        with zipfile.ZipFile(archive) as z:
            files = [m for m in z.infolist() if not m.is_dir()]
            base = lambda m: m.filename.replace("\\", "/").rstrip("/").split("/")[-1]   # noqa: E731
            where = {}
            for m in files:
                if base(m).lower() in [x.lower() for x in p["exes"]]:
                    where.setdefault(base(m).lower(), m)
            lack = [x for x in p["exes"] if x.lower() not in where]
            if lack:
                raise ValueError(f"the archive holds no {', '.join(lack)}")
            take = [where[x.lower()] for x in p["exes"]]
            if p.get("dlls"):
                home = {posixpath.dirname(where[x.lower()].filename.replace("\\", "/")) for x in p["exes"]}
                take += [m for m in files if base(m).lower().endswith(".dll") and posixpath.dirname(m.filename.replace("\\", "/")) in home]
            for k in p.get("keep", []):                # the shallowest of that name (the build's own LICENSE, not a library's)
                c = sorted((m for m in files if base(m) == k), key=lambda m: m.filename.count("/"))
                take += c[:1]
            for m in take:
                with z.open(m) as src, open(tmp / base(m), "wb") as out:
                    shutil.copyfileobj(src, out, 1 << 20)
        for lf in ([ROOT / p["licence_file"], ROOT / "heresy" / "root" / p["licence_file"]] if p.get("licence_file") else []):
            if lf.is_file():                           # the release's LICENSES/, or the workshop's heresy/root/LICENSES/
                shutil.copyfile(lf, tmp / lf.name)
                break
        if p.get("msvc"):                              # beside the engine's (HERESY 2649): a fresh Windows has no vcruntime140 nor msvcp140
            for e in ("cpu", "cuda"):
                for f in sorted((Path(root) / "engine" / e).glob("*.dll")):
                    if f.name.lower().startswith(("vcruntime140", "msvcp140", "concrt140")) and not (tmp / f.name).exists():
                        shutil.copyfile(f, tmp / f.name)
        (tmp / "SOURCE.txt").write_text(
            f"{p['what']}\r\nfrom      {p['url']}\r\nSHA-256   {p['sha256']} ({p['size']} bytes)\r\nlicence   {p['licence']}\r\n"
            f"source    {p['source']}\r\nRuach Studio runs it as a program of its own beside it (launcher/win_tools.py, HERESY 2989).\r\n", encoding="utf-8")
        (tmp / MARK).write_text(p["sha256"] + "\n", encoding="utf-8")
        if d.exists():
            shutil.rmtree(d)
        os.replace(tmp, d)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    return d


def bring(name, root=ROOT, fetch=None):
    """Fetched (by FETCH(url, dst, size, sha), or get) and unpacked into runtime/<name>: None, or why not in plain words. The archive is
    kept only while it is being unpacked (a cut download's part stays for the next run to go on from)."""
    p = PINS[name]
    z = Path(root) / "tmp" / "runtime" / p["url"].rsplit("/", 1)[-1]
    why = (fetch or get)(p["url"], z, p["size"], p["sha256"])
    if why:
        return why
    try:
        unpack(name, z, root)
    except (OSError, ValueError, zipfile.BadZipFile) as e:
        return f"it came, but could not be unpacked: {e}"
    finally:
        try:
            z.unlink()
        except OSError:
            pass
    return None


def main(argv):
    names = [a for a in argv if not a.startswith("--") and a in PINS]
    at = lambda k: argv[argv.index(k) + 1] if k in argv and argv.index(k) + 1 < len(argv) else None   # noqa: E731
    bad = [a for a in argv if not a.startswith("--") and a not in PINS and a not in (at("--into"), at("--studio"))]
    if bad or not names or not (at("--into") or at("--studio")):
        print(f"python launcher/win_tools.py --into DIR {' '.join(PINS)}  |  --studio DIR [--check] --verdicts NAME…", file=sys.stderr)
        return 2
    if at("--into"):                                   # the builder: every one fetched and unpacked, or the build stops
        for n in names:
            why = bring(n, at("--into"))
            if why:
                print(f"{n}: {why}", file=sys.stderr)
                return 1
            d = folder(n, at("--into"))
            print(f"{n}: {PINS[n]['what']} → {d} ({', '.join(sorted(f.name for f in d.iterdir()))})")
        return 0
    root, rc = Path(at("--studio")), 0                 # fetch-heresy.sh's part «programs», a verdict line each
    for n in names:
        what, words = f"runtime/{n}", f"({PINS[n]['what']})"
        if here(n, root):
            print(f"here\t{what}\t{words}", flush=True)
        elif "--check" in argv:
            print(f"missing\t{what}\t{words}", flush=True)
        else:
            why = bring(n, root)
            print(f"failed\t{what}\t{words}: {why}" if why else f"fetched\t{what}\t{words}", flush=True)
            rc = rc or (1 if why else 0)
    return rc


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
