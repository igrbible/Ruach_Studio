#!/usr/bin/env python3
"""HERESY 2649 (the native Windows port): fetch-models.sh's twin in Python, for Windows (and any machine without bash). The least a song needs,
each file said with its size before anything comes, at the revisions pinned in heresy/hf-revisions.txt, through our triple guard
(tools/hf_guard.py: the pin, the pinned size, our manifest's SHA-256), each file put into its room as lab/paths.py places it.

    python launcher/fetch_models.py                  the Studio's default backbone at this card's quant, m-a-p's Standard decoder and ours (RS x3 v1)
    python launcher/fetch_models.py --quant Q8_0     another quant: BF16, Q8_0, Q6_K, Q5_K_M (m-a-p's own: no fine-tune at it)
    python launcher/fetch_models.py --transcriber    and the transcriber (SheetSage2 with MERT, F32) for covers from a recording
    python launcher/fetch_models.py --plan | --yes   the plan alone | no question
Exit 0 when every planned file is here, 5 when not asked for, 1 when a download failed.
"""
import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(os.path.abspath(__file__)).parent.parent
sys.path.insert(0, str(ROOT / "lab"))
import paths  # noqa: E402

V2, FT = "goldhub/Ruach_Studio_Models_v2", "goldhub/YuE2-RS-Finetunes"
NT = os.name == "nt"


def rev(repo):
    for f in (os.environ.get("HF_REVS", ""), str(ROOT / "heresy" / "hf-revisions.txt")):
        if f and os.path.isfile(f):
            for line in open(f, encoding="utf-8"):
                parts = line.split()
                if len(parts) >= 2 and parts[0] == repo:
                    return parts[1]
    return "main"


def card_quant():
    """launcher/env.sh's ruach_quant: BF16 from 23 GB of the first card, Q8_0 from 7, Q6_K from 4.5, else Q5_K_M (no card too)."""
    smi = shutil.which("nvidia-smi") or (str(Path(os.environ.get("SystemRoot", r"C:\Windows")) / "System32" / "nvidia-smi.exe") if NT else None)
    vram = 0
    if smi and os.path.isfile(smi) if NT else smi:
        try:
            out = subprocess.run([smi, "--query-gpu=memory.total", "--format=csv,noheader,nounits"], capture_output=True, text=True, timeout=20).stdout
            vram = int(float(out.split()[0]))
        except (OSError, ValueError, IndexError, subprocess.SubprocessError):
            vram = 0
    return "BF16" if vram >= 23000 else "Q8_0" if vram >= 7000 else "Q6_K" if vram >= 4500 else "Q5_K_M"


def env():
    e = dict(os.environ, HF_HOME=str(ROOT / "tmp" / "hf"), HF_HUB_CACHE=str(ROOT / "tmp" / "hf" / "hub"),
             HUGGINGFACE_HUB_CACHE=str(ROOT / "tmp" / "hf" / "hub"), HF_HUB_DISABLE_TELEMETRY="1", PYTHONUTF8="1")
    scripts = Path(sys.executable).parent
    hf = scripts / ("hf.exe" if NT else "hf")
    if hf.is_file():
        e["YUE2_HF"] = str(hf)
    return e


def plan(entries):
    """models_plan.py over the entries: [(state, size, repo, rev, path, base, pack)], the bytes to get, the files, the free disk."""
    text = "".join("\t".join(e) + "\n" for e in entries)
    r = subprocess.run([sys.executable, str(ROOT / "tools" / "models_plan.py"), str(ROOT)], input=text, capture_output=True, text=True,
                       env=env(), encoding="utf-8")
    rows, total = [], (0, 0, -1)
    for line in r.stdout.splitlines():
        f = line.split("\t")
        if f[0] == "#total":
            total = (int(f[1]), int(f[2]), int(f[3]))
        elif f[0] == "#offline":
            print(f"offline: {f[1]} (its pinned list could not be read)")
        elif len(f) == 7:
            rows.append((f[0], int(f[1]), f[2], f[3], f[4], f[5], f[6]))
    return rows, total


def hs(n):
    return f"{n / 1e9:.1f} GB" if n >= 1e9 else f"{n / 1e6:.0f} MB" if n >= 1e6 else f"{n / 1e3:.0f} KB"


def main(argv):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--quant", choices=("BF16", "Q8_0", "Q6_K", "Q5_K_M"))
    ap.add_argument("--transcriber", action="store_true")
    ap.add_argument("--plan", action="store_true")
    ap.add_argument("--yes", "-y", action="store_true")
    a = ap.parse_args(argv)
    quant = a.quant or card_quant()
    v2r, ftr = rev(V2), rev(FT)
    entries = []
    if quant != "Q5_K_M":                              # the Studio's default, RS-TW 2.0x0.75, else RS-FW 2.4x0.75, at the quant
        for m in ("RS-TW-2.0x0.75", "RS-FW-2.4x0.75"):
            rows, _ = plan([(FT, ftr, f"YuE2-3B-{m}-{quant}.gguf", "models", "song")])
            if rows and rows[0][0] != "gone":
                entries.append((FT, ftr, f"YuE2-3B-{m}-{quant}.gguf", "models", "song"))
                break
    if not entries:
        entries.append((V2, v2r, f"models/YuE2-3B-{quant}.gguf", ".", "song"))   # paths: repo
    entries += [(V2, v2r, "models/YuE2-Vae-F32.gguf", ".", "song"),             # paths: repo
                (FT, ftr, "VAE-RS/YuE2-VAE-RS-x3_v1-F32.gguf", ".", "song")]
    if a.transcriber:
        entries += [(V2, v2r, "models/SheetSage2-F32.gguf", ".", "transcriber"), (V2, v2r, "models/MERT-v2-FullSong-F32.gguf", ".", "transcriber")]   # paths: repo
    rows, (get_bytes, get_files, free) = plan(entries)
    print(f"Ruach Studio needs these files (the backbone at {quant}):")
    for st, size, repo, r, path, base, pack in rows:
        print(f"  {st:8} {hs(size):>8}  {path}")
    print(f"to download: {get_files} file(s), {hs(get_bytes)}" + (f"; free on this disk: {hs(free)}" if free >= 0 else ""))
    if a.plan or not get_files:
        return 0
    if free >= 0 and free < get_bytes * 1.05:
        print("not enough free disk for them: nothing downloaded")
        return 1
    if not a.yes:
        try:
            if input("Download them now? [Y/n] ").strip().lower() not in ("", "y", "yes", "д", "да"):
                print("not downloaded: run this again, or Engine -> Models in the Studio, when you want them")
                return 5
        except EOFError:
            return 5
    incoming = Path(paths.at(paths.INCOMING, ROOT))
    failed = 0
    for st, size, repo, r, path, base, pack in rows:
        if st not in ("get", "changed"):
            continue
        rel = path if base in ("", ".") else f"{base}/{path}"
        new = paths.new_of(rel)
        print(f"download  {new or rel}  {hs(size)}", flush=True)
        ok = False
        for attempt in (1, 2):                         # a burst earns a 429 from Hugging Face: once more after half a minute
            into = incoming / ("" if base in ("", ".") else base) if new else ROOT / ("" if base in ("", ".") else base)
            into.mkdir(parents=True, exist_ok=True)
            g = subprocess.run([sys.executable, str(ROOT / "tools" / "hf_guard.py"), "download", "--quiet", repo, path, "--revision", r,
                                "--local-dir", str(into)], env=env(), capture_output=True, text=True, encoding="utf-8")
            if g.returncode == 0:
                if new:
                    dst = ROOT / new
                    dst.parent.mkdir(parents=True, exist_ok=True)
                    os.replace(incoming / rel, dst)
                    pre = path.rsplit("/", 1)[0] + "/" if "/" in path else ""
                    chk = [sys.executable, str(ROOT / "tools" / "hf_expect.py"), "--repo", repo, "--rev", r, "--dir", str(dst.parent), "--files", path] + (["--strip", pre] if pre else [])
                else:
                    chk = [sys.executable, str(ROOT / "tools" / "hf_expect.py"), "--repo", repo, "--rev", r, "--dir", str(into), "--files", path]
                if subprocess.run(chk, env=env(), capture_output=True, text=True).returncode == 0:
                    ok = True
                    break
            if attempt == 1:
                print("          not yet (" + ((g.stderr or g.stdout).strip().splitlines() or ["?"])[-1][:160] + "); once more in 30 s", flush=True)
                import time
                time.sleep(30)
        print(("done      " if ok else "failed    ") + (new or rel), flush=True)
        failed += 0 if ok else 1
    print(f"models: {'every file here' if not failed else f'{failed} failed: run this again, it goes on where it stopped'}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
