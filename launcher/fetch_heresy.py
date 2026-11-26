#!/usr/bin/env python3
"""HERESY 2983 (a tester's Windows report 24.11.2026: «Стемы … скачано 0, не удалось 2»; Viktor 25.11.2026: «Нужно в Виндоуз порте проверить загрузку
и работу абсолютно всех моделей»): heresy/fetch-heresy.sh's twin in Python, for a machine with no bash (Windows without Git for Windows), so that
Engine -> Models fetches every part and every extra there too. The same arguments, the same pins (heresy/hf-revisions.txt, then the Kit's), the same
check (tools/hf_expect.py: every file at the pinned size), the same downloader (tools/hf_guard.py: the pin, the pinned size, our manifest's SHA-256),
each file into its room by lab/paths.py's map; the same words a line (here, differs, missing, fetched, unknown, failed), the same sum and the same
tmp/fetch-heresy.list, so lab/weights.py reads both alike. Where bash runs another program, this does without it:

    the stems      htdemucs_ft from goldhub/Ruach_Studio_Models_v2 at its pin (the same five files audio-separator fetches); BS-Roformer ep317,
                   which our repo does not hold, from its authors' release held to the size and SHA-256 of the copy the Forge splits with. No
                   audio-separator: it refuses to start without ffmpeg even to download (the VM, 25.11.2026), and it wrote a cut-short file
                   under the model's own name, then skipped it as here
    UniverSR       its code from GitHub's archive at a pinned commit, no git
    the LoRAs      tools/download-loras.sh's own list, each file through tools/hf_guard.py; heresy/fetch-ruach-loras.py as it is
    the backbone   from goldhub/Ruach_Studio_Models_v2 at its pin, as download-models.sh fetches it
    programs       HERESY 2989: FFmpeg and FluidSynth from their pinned archives into runtime/ (launcher/win_tools.py), as the Windows package
                   carries them; llama-server, llama-mtmd-cli, ruach-muscriptor, audio.cpp's server: said here or not, with why (the Windows
                   build carries none of them yet), never built here
    .venv-art      HERESY 2989: the Artist's and the Videographer's Python, and .venv-read, Higgs's, made by the install's uv (launcher/venvs_win.py)

A path Windows cannot open while its long paths are off (260 characters) is refused before the download, with what to do; what the downloader
writes on the way is reached through \\\\?\\ (tools/hf_guard.py, here too). Linux and macOS keep fetch-heresy.sh: the lab runs this where it finds no bash.

    python launcher/fetch_heresy.py [--check | --replace] [--only PARTS] [--backbone Q8_0 | --tw 2.0x0.75-Q8_0 | …] [--yes]
    python launcher/fetch_heresy.py --plan ARGS…     the steps those arguments take as JSON; nothing is checked or fetched
Exit 0 when nothing failed, 1 when something did, 2 for arguments it does not take.
"""
import fnmatch
import importlib
import importlib.util
import hashlib
import json
import ntpath
import os
import re
import shutil
import ssl
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(os.path.abspath(__file__)).parent.parent
for _d in (ROOT / "lab", ROOT / "launcher"):
    if str(_d) not in sys.path:
        sys.path.insert(0, str(_d))
import paths  # noqa: E402
import fetch_models as fm  # noqa: E402  (its pins' reader, the downloader's environment, the sizes said, the ticker; the console in UTF-8, 2935)
import setup_win  # noqa: E402  (HERESY 2986: UniverSR's Python packages and the uv the install brought)
import venvs_win  # noqa: E402  (HERESY 2989: .venv-art and .venv-read made by that uv)
import win_tools  # noqa: E402  (HERESY 2989: the programs the Windows package brings, pinned)

ON_WIN = os.name == "nt"
V2, FT, IRA_REPO = "goldhub/Ruach_Studio_Models_v2", "goldhub/YuE2-RS-Finetunes", "goldhub/YuE2-3B-Ruach_Studio-IRA-Merge"
WORK = ["*.safetensors", "*.bin", "*.json", "*.yaml", "*.py", "*.txt"]
QUANTS3 = ("BF16", "Q8_0", "Q6_K")
FW_MERGES = ("0.7x0.75", "1.5x0.75", "2.4x0.75", "3.4x0.7", "3.4x0.75", "4.0x0.65", "4.0x0.7")
TW_MERGES = ("2.0x0.75", "2.0x0.9")
IRAE_SETS = ("IRAE", "IRAEv2", "IRAEv3", "IRAE-IR", "IRAE-IRv2")
VERDICTS = ("here", "unknown", "differs", "fetched", "missing", "failed")
STREAK = 200   # HERESY 2984: how many cut connections in a row a direct download takes up again, each having brought bytes

# BS-Roformer ep317 (viperx; TRvlvr's UVR release, the file audio-separator fetches): not in our models repo, so from its authors, held to the size
# and SHA-256 of the Forge's copy (models/refiner/separation/roformer, 23.09.2026); its config from TRvlvr, else audio-separator's own release
ROFORMER = [
    {"name": "model_bs_roformer_ep_317_sdr_12.9755.ckpt", "size": 639331213,
     "sha": "5b84f37e8d444c8cb30c79d77f613a41c05868ff9c9ac6c7049c00aefae115aa",
     "urls": ["https://github.com/TRvlvr/model_repo/releases/download/all_public_uvr_models/model_bs_roformer_ep_317_sdr_12.9755.ckpt"]},
    {"name": "model_bs_roformer_ep_317_sdr_12.9755.yaml", "size": 2273,
     "sha": "2bfdd16c656bd9519aba757cc4f8834b7ede675eb1e00ec4772d74ae1c41af7f",
     "urls": ["https://raw.githubusercontent.com/TRvlvr/application_data/main/mdx_model_data/mdx_c_configs/model_bs_roformer_ep_317_sdr_12.9755.yaml",
              "https://github.com/nomadkaraoke/python-audio-separator/releases/download/model-configs/model_bs_roformer_ep_317_sdr_12.9755.yaml"]},
]
# audio-separator reads its own list of models beside them each time it loads one and fetches it when it is not there: brought here beforehand (not
# a weight, and its authors' list moves on: no pin), so the first split needs no network
SEP_LIST = ("download_checks.json", "https://raw.githubusercontent.com/TRvlvr/application_data/main/filelists/download_checks.json")
UNIVERSR = ("woongzip1/UniverSR", "d8636623fe0c0704296239c1d3d3c5b911ecb2e0")   # the Forge's vendor/UniverSR (15.09.2026)


class Usage(Exception):
    pass


def py_lack(pins):
    """HERESY 2986: the pins (name==version) whose package this Python cannot import (each package's module is its name here)"""
    return [p for p in pins or [] if importlib.util.find_spec(p.split("==")[0]) is None]


# ── the pins and the paths ──────────────────────────────────────────────────────────────────────────────────────────
def _pin_line(f, repo):
    try:
        for line in open(f, encoding="utf-8"):
            c = [] if line.lstrip().startswith("#") else line.split()
            if len(c) >= 2 and c[0] == repo:
                return c[1]
    except OSError:
        pass
    return ""


def pin(repo, root=ROOT):
    """fetch-heresy.sh's pin(): heresy/hf-revisions.txt, then the Kit's tools/hf-revisions.txt; "main" when neither pins it"""
    return _pin_line(root / "heresy" / "hf-revisions.txt", repo) or _pin_line(root / "tools" / "hf-revisions.txt", repo) or "main"


def kit_rev(repo, root=ROOT):
    """tools/hf-env.sh's hf_rev(), as tools/download-loras.sh reads it: the Kit's pins first, then ours"""
    return _pin_line(root / "tools" / "hf-revisions.txt", repo) or _pin_line(root / "heresy" / "hf-revisions.txt", repo) or "main"


def lp(p, force=False, nt=ON_WIN):
    """HERESY 2983: on Windows a path of 248 characters and more (or any, with force) as \\\\?\\…: with long paths off (Windows' default) only that
    form reaches past 260, and the downloader itself writes there so. Its slashes made backslashes, which that form needs. Elsewhere the path itself."""
    s = str(p)
    if not nt or s.startswith("\\\\?\\"):
        return s
    s = ntpath.normpath(ntpath.abspath(s) if ON_WIN else s)
    if len(s) < 248 and not force:
        return s
    return "\\\\?\\UNC\\" + s[2:] if s.startswith("\\\\") else "\\\\?\\" + s


def long_paths_on():
    if not ON_WIN:
        return True
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SYSTEM\CurrentControlSet\Control\FileSystem") as k:
            return winreg.QueryValueEx(k, "LongPathsEnabled")[0] == 1
    except OSError:
        return False


def too_long(p, nt=ON_WIN, on=None):
    """HERESY 2983: the length of a path Windows will not open while its long paths are off (a file past 259 characters, its folder past 247);
    None when it fits, when long paths are on, and anywhere but Windows"""
    if not nt:
        return None
    if on is None:
        on = long_paths_on()
    s = ntpath.normpath(str(p))
    return None if on or (len(s) <= 259 and len(ntpath.dirname(s)) <= 247) else len(s)


LONG_HOW = ("move the Studio to a shorter folder (as C:\\RuachStudio), or turn long paths on (an administrator's PowerShell: New-ItemProperty "
            "-Path HKLM:\\SYSTEM\\CurrentControlSet\\Control\\FileSystem -Name LongPathsEnabled -Value 1 -PropertyType DWORD -Force), then press again")


def place(inc):
    """fetch-heresy.sh's hf_place: (strip, folder) of the first include; ValueError when one of them lands elsewhere or nowhere"""
    first = paths.hf_place(inc[0])
    for p in inc[1:]:
        if paths.hf_place(p) != first:
            raise ValueError(f"{p} lands elsewhere than {inc[0]}")
    return first


def venv_exe(root, venv, name):
    for p in (root / venv / "bin" / name, root / venv / "Scripts" / (name + ".exe")):
        if p.is_file():
            return p
    return None


def kit_loras(root=ROOT):
    """tools/download-loras.sh's own list (folder, repo, the folder inside the repo, files), read from it: the one list, not a copy"""
    try:
        text = (root / "tools" / "download-loras.sh").read_text(encoding="utf-8")
    except OSError:
        return None
    block = re.search(r"^LORAS=\((.*?)^\)", text, re.S | re.M)
    rows = re.findall(r'^\s*"([^|"]+)\|([^|"]+)\|([^|"]*)\|([^"]*)"', block.group(1) if block else "", re.M)
    return [(f, r, s, n.split()) for f, r, s, n in rows] or None


# ── the plan: fetch-heresy.sh's sections, in its order, as steps ────────────────────────────────────────────────────────
def into(what, repo, inc, pin_as=None, extra=()):
    return {"op": "into", "what": what, "repo": repo, "inc": list(inc), "pin_as": pin_as or None, "extra": list(extra)}


def into_at(what, repo, d, inc, pin_as=None):
    return {"op": "at", "what": what, "repo": repo, "dir": d, "inc": list(inc), "pin_as": pin_as or None}


def head(kind, pid, title):
    return {"op": kind, "id": pid, "title": title}


def gate(q, steps, otherwise=(), ask_always=False):
    return {"op": "gate", "q": q, "steps": steps, "else": list(otherwise), "always": ask_always}


def tool(what, where, here_words, miss_words, make=None):
    """a program or an environment a room needs: here or missing with why (here_words None: nothing said when it is here, as bash says nothing);
    HERESY 2989: MAKE names a Python launcher/venvs_win.py makes on Windows («art», «read»), made by a fetch where it is missing"""
    s = {"op": "tool", "what": what, "where": list(where), "here": here_words, "miss": miss_words}
    if make:
        s["make"] = make
    return s


# HERESY 2992: the native programs the Windows package builds beside the engine (windows.yml's natives job), as fetch-heresy.sh says them
BESIDE = "(beside the engine, engine\\cuda and engine\\cpu)"
NO_NATIVE = "(the Windows package brings it beside the engine, engine\\cuda and engine\\cpu; one made without it does not carry it"


def beside_engine(name, kinds=("cuda", "cpu")):
    return [f"engine/{k}/{name}.exe" for k in kinds]


def note(text):
    return {"op": "note", "text": text}


def art_env():
    return tool(".venv-art", [".venv-art/bin/python", ".venv-art/Scripts/python.exe"], None,
                "(the painters paint in their own environment: " + ("made here by the install's uv, launcher/venvs_win.py art)"   # HERESY 2989
                                                                     if ON_WIN else "lab/install-venv.sh --art)"), make="art" if ON_WIN else None)


def parse(argv):
    a = {"mode": "fetch", "yes": False, "only": None, "artwork": False}
    takes = {"--listener": "", "--trainer": "", "--backbone": "", "--ira": "", "--irae": "", "--fw": "", "--tw": "", "--writer": "",
             "--muscriptor": "", "--h3": "int8", "--upscaler": "7b", "--flashsr": "all", "--narrator": "Q4_K", "--higgs": "bf16", "--refined": "F16",
             "--qwen": "", "--qwen-fine": "", "--art-loras": "all", "--only": ""}
    i = 0
    while i < len(argv):
        x = argv[i]
        if x == "--check":
            a["mode"] = "check"
        elif x == "--replace":
            a["mode"] = "replace"
        elif x == "--yes":
            a["yes"] = True
        elif x in ("--artwork", "--artwork-q8"):
            a["artwork"] = True
        elif x in takes:
            v = argv[i + 1] if i + 1 < len(argv) else ""
            i += 1
            a[x[2:]] = v or takes[x]
        else:
            raise Usage(f"{x}: --check, --replace, --only PARTS, --yes, --h3 int8|all|bf16, --upscaler 3b|7b|all, --muscriptor small|medium|large, "
                        "--flashsr all, --narrator Q4_K|Q6_K|Q8_0, --higgs bf16, --refined F16, --writer quality|compact, --listener Q8_0|Q5_K_M|Q4_K_M|bf16, "
                        "--trainer bf16|int8, --backbone BF16|Q8_0|Q6_K|Q5_K_M, --ira BF16|Q8_0|Q6_K, --irae IRAE…-BF16|Q8_0|Q6_K, --fw 2.4x0.75-Q8_0…, "
                        "--tw 2.0x0.75-Q8_0…, --artwork, --qwen 2512-q4|2512-q6|2.1, --qwen-fine …, --art-loras all")
        i += 1
    if isinstance(a["only"], str):                  # --only given: those parts alone (none of them for «none» or «»), and no list kept
        a["only"] = {p for p in a["only"].split(",") if p}
    return a


def plan(argv, root=ROOT):
    """The steps fetch-heresy.sh's arguments take, in its order; Usage for an argument it does not take. Nothing is read from the network."""
    a = parse(argv)
    only = a["only"]
    want = (lambda p: only is None or p in only)
    R = paths
    S = []

    if ON_WIN and want("programs"):                 # HERESY 2989: what the Windows package brings beside the Studio, for an install without it
        S += [head("part", "programs", win_tools.TITLE)] + [{"op": "runtime", "name": n} for n in win_tools.PINS]
    if want("extras"):
        S += [head("part", "extras", "Our decoders: YuE2-VAE-RS x3 v1, the Studio's default, and v2 (goldhub/YuE2-RS-Finetunes, VAE-RS/)"),
              into(f"{R.ENGINE_VAE}/YuE2-VAE-RS-x3_v1-F32.gguf and _v2 (our decoders)", FT,
                   ["VAE-RS/YuE2-VAE-RS-x3_v1-F32.gguf", "VAE-RS/YuE2-VAE-RS-x3_v2-F32.gguf"])]
    # the transcriber as an install brings it where there is no bash (launcher/fetch_models.py, HERESY 2952, 2981): the F32 pair and its Refined mode
    f32 = into(f"{R.MISC}/SheetSage2-F32.gguf and MERT-v2-FullSong-F32.gguf", V2, ["models/SheetSage2-F32.gguf", "models/MERT-v2-FullSong-F32.gguf"])   # paths: repo
    rrev = _pin_line(root / "heresy" / "hf-revisions.txt", V2 + "#refined")
    refined = (into(f"{R.MISC}/SheetSage2-Refined-F16.gguf with its LICENSE and NOTICE (anime-song's SheetSage2-Refined)", V2,
                    ["models/SheetSage2-Refined-F16.gguf", "models/SheetSage2-Refined/LICENSE", "models/SheetSage2-Refined/NOTICE.md"], rrev)   # paths: repo
               if rrev else {"op": "fail", "what": "SheetSage2-Refined", "words": f"(heresy/hf-revisions.txt pins no {V2}#refined)"})
    if want("transcriber"):
        S += [head("part", "transcriber", "The transcriber: covers from a recording (SheetSage2 with MERT-v2-FullSong, F32, and its Refined mode)"), f32]
        if rrev:
            S.append(refined)
    if a.get("refined"):
        if a["refined"] != "F16":
            raise Usage("--refined takes F16")
        S.append(head("asked", "refined", "The transcriber's Refined mode: anime-song's SheetSage2-Refined (F16, CC BY-NC 4.0), on SheetSage2 with MERT-v2-FullSong"))
        if not want("transcriber"):
            S.append(f32)
        if not (want("transcriber") and rrev):
            S.append(refined)
    if want("whisper"):
        S += [head("part", "whisper", "Whisper large-v3 (CTranslate2, float16): lyrics check, karaoke timing, trim to the text"),
              into(f"{R.WHISPER}/whisper-large-v3-ct2-float16", V2, ["whisper/whisper-large-v3-ct2-float16/*"])]   # paths: repo
    if want("stems"):
        S += [head("part", "stems", "Stems"),
              {"op": "direct", "what": f"{R.REFINER_SEPARATION}/roformer", "dir": f"{R.REFINER_SEPARATION}/roformer", "files": ROFORMER,
               "list": SEP_LIST, "words": "(BS-Roformer ep317 from its authors' release, held to its SHA-256)"},
              into(f"{R.REFINER_SEPARATION}/demucs (htdemucs_ft)", V2, ["separation/demucs/*"]),   # paths: repo
              {"op": "seplist", "dir": f"{R.REFINER_SEPARATION}/demucs", "list": SEP_LIST},
              {"op": "ffmpeg"}]
    if want("upscale"):
        S += [head("part", "upscale", "Upscale: UniverSR"),
              {"op": "snap"},
              into(f"{R.REFINER_UNIVERSR} (woongzip1/universr-audio)", V2, ["universr/*"]),   # paths: repo
              {"op": "code", "what": "vendor/UniverSR", "repo": UNIVERSR[0], "commit": UNIVERSR[1], "dir": "vendor/UniverSR",
               "py": setup_win.UNIVERSR},   # HERESY 2986: here only with what it imports in this Python
              into("Apollo-vocal (baicai1145/Apollo-vocal-msst)", V2, ["models/upbundle/apollo/*"])]   # paths: repo
    if want("nam"):                                 # HERESY 2994: the Refiner's Amp (NAM), its captures from v2 under nam/ at their own pin
        nrev = _pin_line(root / "heresy" / "hf-revisions.txt", V2 + "#nam")
        S += [head("part", "nam", "NAM amps: the captures the Refiner's Amp (NAM) plays a stem through (guitar amps, a bass amp, a pedal, a rig; MIT, by their authors)"),
              into(f"{R.REFINER_NAM} (the Amp's captures with captures.json and README.md)", V2, ["nam/*"], nrev) if nrev else   # paths: repo
              {"op": "fail", "what": "NAM amps", "words": f"(heresy/hf-revisions.txt pins no {V2}#nam)"}]

    if a.get("listener"):
        lq = a["listener"]
        o = "checkpoints/Qwen2.5-Omni-7B-GGUF"   # paths: repo
        files = {"Q8_0": ("9.6 GB (Q8_0 8.1 + its audio projector Q8_0 1.5)", "10.3 GB of VRAM", f"{o}/Qwen2.5-Omni-7B-Q8_0.gguf"),
                 "Q5_K_M": ("6.9 GB (Q5_K_M 5.4 + its audio projector Q8_0 1.5)", "8.0 GB of VRAM", f"{o}/unsloth/Qwen2.5-Omni-7B-Q5_K_M.gguf"),
                 "Q4_K_M": ("6.2 GB (Q4_K_M 4.7 + its audio projector Q8_0 1.5)", "7.3 GB of VRAM", f"{o}/Qwen2.5-Omni-7B-Q4_K_M.gguf"),
                 "bf16": ("22 GB (the whole model; the Studio loads its thinker only)", "18.3 GB of VRAM: a 24 GB card", None)}
        if lq not in files:
            raise Usage("--listener takes Q8_0, Q5_K_M, Q4_K_M or bf16")
        size, peak, f = files[lq]
        S.append(head("asked", "listener", f"The style listener: Qwen2.5-Omni-7B ({lq})"))
        get = (into(f"{R.LISTENER}/Qwen2.5-Omni-7B-GGUF ({lq} and its audio projector)", V2, [f, f"{o}/mradermacher/Qwen2.5-Omni-7B.mmproj-Q8_0.gguf"])
               if f else {"op": "repo", "repo": "Qwen/Qwen2.5-Omni-7B", "dir": f"{R.LISTENER}/Qwen2.5-Omni-7B", "inc": WORK})
        S.append(gate(f"Download {size}? It needs {peak} when it listens.", [get]))
        if lq != "bf16":
            if not ON_WIN:
                S.append({"op": "code", "what": "vendor/llama.cpp", "repo": "ggml-org/llama.cpp", "commit": None, "dir": "vendor/llama.cpp"})
            S.append(tool("llama-mtmd-cli", ["vendor/llama.cpp/build/bin/llama-mtmd-cli", "vendor/llama.cpp/build/bin/llama-mtmd-cli.exe",
                                             "vendor/llama.cpp/build/bin/Release/llama-mtmd-cli.exe"] + beside_engine("llama-mtmd-cli"),
                          BESIDE if ON_WIN else "(vendor/llama.cpp/build)",
                          NO_NATIVE + ": bf16 hears in .venv)"   # HERESY 2992
                          if ON_WIN else "→ cd vendor/llama.cpp && cmake -B build -DGGML_CUDA=ON -DCMAKE_CUDA_COMPILER=$(which nvcc) && cmake --build build -j --target llama-mtmd-cli"))

    if a.get("writer"):
        o = "checkpoints/Qwopus3.5-9B-GGUF"   # paths: repo
        w = {"quality": ("6.7 GB", "about 7.5 GB of VRAM", f"{o}/Qwopus3.5-9B-v3-AR-Q4_0.gguf"),
             "compact": ("5.5 GB", "about 6.5 GB of VRAM", f"{o}/Qwopus3.5-9B-v3-AR-compact.gguf")}.get(a["writer"])
        if not w:
            raise Usage("--writer takes quality or compact")
        S += [head("asked", "writer", f"The Studio's writer: Qwopus3.5-9B-v3 ({a['writer']})"),
              gate(f"Download {w[0]}? It needs {w[1]} when it writes.",
                   [into(f"{R.WRITER}/Qwopus3.5-9B-GGUF ({a['writer']} and its licence)", V2, [w[2], f"{o}/LICENSE"])])]
        if not ON_WIN:
            S.append({"op": "code", "what": "vendor/llama.cpp", "repo": "ggml-org/llama.cpp", "commit": None, "dir": "vendor/llama.cpp"})
        S.append(tool("llama-server", ["vendor/llama.cpp/build/bin/llama-server", "vendor/llama.cpp/build/bin/llama-server.exe",
                                       "vendor/llama.cpp/build/bin/Release/llama-server.exe"] + beside_engine("llama-server"),
                      BESIDE if ON_WIN else "(vendor/llama.cpp/build)",
                      NO_NATIVE + ": Engine → Writer and Artwork takes LM Studio, Ollama, vLLM or OpenRouter)"   # HERESY 2992
                      if ON_WIN else "→ bash launcher/extras.sh builds it (or: cd vendor/llama.cpp && cmake -B build -DGGML_CUDA=ON && cmake --build build -j --target llama-server)"))

    if a.get("narrator"):
        nf = {"Q4_K": "drama-3-experts-Q4_K-backbone-Q8_0.gguf", "Q6_K": "drama-3-experts-Q6_K-backbone-Q8_0.gguf", "Q8_0": "drama-3-Q8_0.gguf"}.get(a["narrator"])
        if not nf:
            raise Usage("--narrator takes Q4_K, Q6_K or Q8_0")
        h = root / "heresy" / "hf-revisions.txt"
        nrev, rurev, berev = (_pin_line(h, V2 + k) for k in ("#narrator", "#narrator-ru", "#narrator-be"))
        o, uk, ru, be = "models/reader/drama-3-gguf", "models/reader/dicts/uk", "models/reader/dicts/ru", "models/reader/dicts/be"   # paths: repo
        S += [head("asked", "narrator", f"The Narrator: Fish Audio Drama 3 ({a['narrator']}), Built with Fish Audio"),
              into(f"the Narrator's Drama 3: narrator/drama-3-gguf ({a['narrator']}, its LICENSE, NOTICE and card: the Fish Audio Community License 1.0)", V2,
                   [f"{o}/{nf}", f"{o}/LICENSE", f"{o}/NOTICE", f"{o}/README.md"], nrev),
              into("the Narrator's Ukrainian stresses: narrator/dicts/uk (lang-uk, from ULIF's Dictionaries of Ukraine, MIT)", V2, [f"{uk}/forms.sqlite", f"{uk}/NOTICE"], nrev),
              into("the Narrator's Russian stresses: narrator/dicts/ru (A. A. Zaliznyak's Grammatical Dictionary, gramdict, CC BY-NC 4.0)", V2,
                   [f"{ru}/forms.sqlite", f"{ru}/NOTICE", f"{ru}/LICENSE"], rurev),
              into("the Narrator's Belarusian stresses: narrator/dicts/be (GrammarDB of the Belarusian NLP community, CC BY-SA 4.0)", V2,
                   [f"{be}/forms.sqlite", f"{be}/NOTICE", f"{be}/LICENSE"], berev),
              tool("audio.cpp's server", beside_engine("audiocpp_server") if ON_WIN else [], BESIDE if ON_WIN else "", NO_NATIVE + ")"   # HERESY 2992
                   if ON_WIN else "→ bash tools/narrator-setup.sh builds it from build/audio.cpp")]

    if a.get("higgs"):
        if a["higgs"] != "bf16":
            raise Usage("--higgs takes bf16")
        hd, td = f"{R.NARRATOR}/higgs-tts-3-4b", f"{R.NARRATOR}/higgs-audio-v2-tokenizer"
        S += [head("asked", "higgs", "The Narrator's second engine: Boson AI's Higgs TTS 3 (bf16) from Boson's own repos, under the Boson Higgs TTS 3 Research and "
                   "Non-Commercial License (your own published works carry «This audio was created with Boson AI's Higgs Audio»)"),
              into_at("narrator/higgs-tts-3-4b (Boson AI's Higgs TTS 3 and its LICENSE)", "bosonai/higgs-tts-3-4b", hd,
                      ["model.safetensors", "model.safetensors.index.json", "tokenizer.json", "tokenizer_config.json", "chat_template.jinja", "LICENSE", "README.md", "PROMPTING.md"]),
              into_at("narrator/higgs-tts-3-4b (its transformers loader, from multimodalart's port)", "multimodalart/higgs-audio-v3-tts-4b-transformers", hd,
                      ["config.json", "configuration_higgs_multimodal_qwen3.py", "modeling_higgs_multimodal_qwen3.py"]),
              into_at("narrator/higgs-audio-v2-tokenizer (Boson AI's audio tokenizer and its LICENSE)", "bosonai/higgs-audio-v2-tokenizer", td,
                      ["config.json", "model.safetensors", "preprocessor_config.json", "LICENSE", "README.md"])]
        if ON_WIN:                                  # HERESY 2989: its Python made here as tools/narrator-higgs-setup.sh --python makes it on Linux
            S.append(tool(".venv-read", [".venv-read/Scripts/python.exe"], None,
                          "(Higgs reads in its own environment: made here by the install's uv, launcher/venvs_win.py read)", make="read"))

    if a.get("muscriptor"):
        m = a["muscriptor"]
        size = {"small": "209 MB", "medium": "618 MB", "large": "2.7 GB"}.get(m)
        if not size:
            raise Usage("--muscriptor takes small, medium or large")
        S += [head("asked", "muscriptor", f"Sound to MIDI: MuScriptor {m} (Mirelo and Kyutai, CC BY-NC 4.0: non-commercial use only)"),
              gate(f"Download {size}?", [into_at(f"{R.REFINER_MIDI}/muscriptor ({m}, its notice and licence)", "DamRsn/muscriptor-gguf", f"{R.REFINER_MIDI}/muscriptor",
                                                 [f"v1/muscriptor-{m}-f16.gguf", "NOTICE.md", "LICENSE"])]),
              tool("ruach-muscriptor", ["build/build-muscriptor/ruach-muscriptor", "build/build-muscriptor/ruach-muscriptor.exe"] + beside_engine("ruach-muscriptor", ("cpu",)),
                   "(beside the engine, engine\\cpu)" if ON_WIN else "(build/build-muscriptor)",
                   "(the Windows package brings it beside the engine, engine\\cpu; one made without it does not carry it)" if ON_WIN else "→ ./build.sh builds it")]   # HERESY 2992

    if a.get("h3"):
        int8 = ["diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors", "diffusion_models/minimax_h3_ref2va_pruned_int8_convrot.safetensors",
                "text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors", "vae/minimax_h3_video_vae_fp16.safetensors", "vae/minimax_h3_audio_vae_fp32.safetensors",
                "loras/minimax_h3_fl2v_turbo_4step_v1.0_768p_comfyui_bf16.safetensors", "loras/minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors",
                "loras/minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors"]
        alls = ["diffusion_models/minimax_h3_fl2va_int8_convrot.safetensors", "diffusion_models/minimax_h3_ref2va_int8_convrot.safetensors",
                "text_encoders/qwen3vl_32b_minimax_h3_int8_convrot.safetensors", "vae/minimax_h3_sol_vae_fp16.safetensors",
                "loras/pika_h3_flex_fl2va_v1_bf16.safetensors", "loras/pika_h3_flex_ref2va_v1_bf16.safetensors",
                "model_patches/minimax_h3_fun_controlnet_union_2.0_pruned_int8_convrot.safetensors", "model_patches/minimax_h3_fun_controlnet_union_pruned_int8_convrot.safetensors"]
        bf16 = ["diffusion_models/minimax_h3_fl2va_bf16.safetensors", "diffusion_models/minimax_h3_ref2va_bf16.safetensors",
                "diffusion_models/minimax_h3_fl2va_pruned_bf16.safetensors", "diffusion_models/minimax_h3_ref2va_pruned_bf16.safetensors",
                "text_encoders/qwen3vl_32b_minimax_h3_bf16.safetensors",
                "model_patches/minimax_h3_fun_controlnet_union_2.0_pruned_bf16.safetensors", "model_patches/minimax_h3_fun_controlnet_union_pruned_bf16.safetensors"]
        effects = [f"embeddings/minimaxh3_{e}.safetensors" for e in ("art_is_explosion", "blooming_flowers", "bullet_time", "dark_magic", "fire_breath",
                                                                     "four_seasons", "kiss_camera", "spiral_ascent", "storm_magic", "truman_show")]
        sizes = {"int8": (int8, "69 GB; a card of 24 GB, a part of the DiT streamed from RAM (64 GB of RAM or more)", False),
                 "all": (int8 + alls + effects, "201 GB: every int8 tier, FastH3, ControlNet Union, the effects; cards of 24 GB", True),
                 "bf16": (int8 + alls + bf16 + effects, "478 GB: the int8 tiers and the unquantized DiTs (66 GB each whole, 40 GB pruned) and encoder (51.5 GB): for "
                          "cards of 80 GB, or two and more of 48 GB; on 24 GB they only stream from RAM, slowly", True)}
        if a["h3"] not in sizes:
            raise Usage("--h3 takes int8, all or bf16")
        files, size, fast = sizes[a["h3"]]
        orig = [f"{m}/{p}" for m in ("FL2VA", "Ref2VA") for p in ("tokenizer/merges.txt", "tokenizer/tokenizer.json", "tokenizer/tokenizer_config.json",
                                                                  "tokenizer/vocab.json", "processor/chat_template.json", "processor/merges.txt",
                                                                  "processor/preprocessor_config.json", "processor/tokenizer.json", "processor/tokenizer_config.json",
                                                                  "processor/video_preprocessor_config.json", "processor/vocab.json", "text_encoder/config.json")]
        steps = [into_at(f"{R.VIDEO_H3} (MiniMax H3, {a['h3']})", "Comfy-Org/MiniMax-H3", R.VIDEO_H3, files + ["README.md"])]
        if fast:
            steps.append(into_at(f"{R.VIDEO_H3} (FastH3, 8 steps)", "FastVideo/FastVideo-FastH3-Comfy", R.VIDEO_H3,
                                 ["diffusion_models/fastvideo_fasth3_8step_v2_pruned_int8_convrot.safetensors"]))
        steps.append(into_at(f"{R.VIDEO_H3}/original (its tokenizer, processor and encoder config, its licence)", "MiniMaxAI/MiniMax-H3", f"{R.VIDEO_H3}/original",
                             orig + ["LICENSE", "README.md"]))
        S += [head("asked", "h3", f"The Videographer's moving pictures: MiniMax H3 ({a['h3']}). Its licence (MiniMax H3 Community License) forbids running it in the US, "
                   f"the EU, the UK and South Korea without MiniMax's leave, and commercial use past its threshold needs MiniMax's licence: read it first ({R.VIDEO_H3}/original/LICENSE)"),
              gate(f"Download up to {size}?", steps, ask_always=True)]

    if a.get("upscaler"):
        u = {"3b": (["seedvr2_ema_3b_fp16.safetensors"], "7.3 GB: SeedVR2 3B, the quick one (18.6 GB of a card at 1080p)"),
             "7b": (["seedvr2_ema_7b_sharp_fp16.safetensors"], "17 GB: SeedVR2 7B sharp, the Studio's own (20 GB of a card at 1080p, 16 of its blocks in RAM)"),
             "all": (["seedvr2_ema_3b_fp16.safetensors", "seedvr2_ema_7b_sharp_fp16.safetensors", "seedvr2_ema_7b_fp16.safetensors"], "40 GB: 3B, 7B sharp and 7B")}.get(a["upscaler"])
        if not u:
            raise Usage("--upscaler takes 3b, 7b or all")
        S += [head("asked", "upscaler", f"The Videographer's upscaler: SeedVR2 ({a['upscaler']})"),
              gate(f"Download up to {u[1]}?", [into_at(f"{R.SEEDVR2} (SeedVR2, {a['upscaler']})", "numz/SeedVR2_comfyUI", R.SEEDVR2, u[0] + ["ema_vae_fp16.safetensors"])],
                   ask_always=True)]

    if a.get("flashsr"):
        if a["flashsr"] != "all":
            raise Usage("--flashsr takes all")
        S += [head("asked", "flashsr", "The Voice upscale's FlashSR (its three weights, Apache-2.0: goldhub/Ruach_Studio_Models_v2)"),
              gate("Download 3.3 GB? The Voice upscale fetches it on its first use otherwise.",
                   [into(f"{R.REFINER_UPBUNDLE}/flashsr (FlashSR's weights)", V2, ["models/upbundle/flashsr/weights/*"])])]   # paths: repo

    if a["artwork"]:
        S += [head("asked", "artwork", "Artwork: the covers' helpers, the prompt writer (Qwen3-4B-Instruct-2507) and the content filter (the painters are Qwen-Image's: --qwen)"),
              gate("Download 8.4 GB (the prompt writer 8.1, the filter 0.3)?",
                   [into(f"{R.ARTIST}/nsfw-filter (Falconsai/nsfw_image_detection)", V2, ["artwork/nsfw-filter/*"]),   # paths: repo
                    into(f"{R.ARTIST}/Qwen3-4B-Instruct-2507", V2, ["artwork/Qwen3-4B-Instruct-2507/*"]), art_env()])]   # paths: repo
    q_parts = into(f"{R.ARTIST}/Qwen-Image-2512 (its parts)", V2, ["artwork/Qwen-Image-2512/model_index.json", "artwork/Qwen-Image-2512/README.md",
                                                                    "artwork/Qwen-Image-2512/scheduler/*", "artwork/Qwen-Image-2512/tokenizer/*",
                                                                    "artwork/Qwen-Image-2512/text_encoder/*", "artwork/Qwen-Image-2512/vae/*",
                                                                    "artwork/Qwen-Image-2512/transformer/config.json"])   # paths: repo
    q_light = into(f"{R.ARTIST}/Qwen-Image-2512/lightning", V2, ["artwork/Qwen-Image-2512/lightning/Qwen-Image-2512-Lightning-8steps-V1.0-bf16.safetensors"])   # paths: repo
    for q in [x for x in (a.get("qwen") or "").split(",") if x]:
        if q in ("2512-q4", "2512-q6"):
            quant, qsize, total, card = ("Q4_K_M", 13.2, 31, 16) if q == "2512-q4" else ("Q6_K", 16.8, 34.5, 24)
            S += [head("asked", "qwen", f"Artwork: Qwen-Image-2512 at {quant} with Lightning (Apache-2.0)"),
                  gate(f"Download up to {total} GB (the transformer {quant} {qsize}, its text encoder and VAE 16.8, Lightning 0.85)? It paints on a card of {card} GB.",
                       [q_parts, into(f"{R.ARTIST}/Qwen-Image-2512/gguf ({quant})", V2, [f"artwork/Qwen-Image-2512/gguf/qwen-image-2512-{quant}.gguf"]),   # paths: repo
                        q_light, art_env()])]
        elif q == "2.1":
            S += [head("asked", "qwen", "Artwork: Qwen-Image-2.1 (Qwen's research licence: not for commercial use)"),
                  gate("Download 33 GB? Qwen-Image-2.1 is under Qwen's research licence: research and evaluation only, not for commercial use (a cover for a song that "
                       "is sold is commercial use). It paints on a card of 24 GB.",
                       [into(f"{R.ARTIST}/Qwen-Image-2.1", V2, [f"artwork/Qwen-Image-2.1/{p}" for p in ("model_index.json", "scheduler/*", "tokenizer/*", "processor/*",
                                                                                                    "text_encoder/*", "vae/*", "transformer/*", "LICENSE*", "NOTICE")])])]   # paths: repo
        else:
            raise Usage("--qwen takes 2512-q4, 2512-q6, 2.1 (several with commas)")
    fines = {"jibmix-v6": ("JibMix QW2512 v6 fp8.safetensors", "Jib Mix Qwen v6 by J1B"),
             "intorealism-v1": ("IntoRealism QW2512 v1 fp8.safetensors", "IntoRealism Qwen v1 by enzino"),
             "real-v2": ("Real QW2512 v2 fp8.safetensors", "Real-Qwen-Image v2 by wikeeyang"),
             "base-fp8": ("BASE QW2512 fp8_e4m3fn.safetensors", "Qwen-Image-2512 itself in fp8 (Civitai's own)")}
    for q in [x for x in (a.get("qwen-fine") or "").split(",") if x]:
        if q not in fines:
            raise Usage("--qwen-fine takes jibmix-v6, intorealism-v1, real-v2, base-fp8 (several with commas)")
        f, who = fines[q]
        S += [head("asked", "qwen-fine", f"Artwork: {who} (an fp8 fine-tune of Qwen-Image-2512)"),
              gate("Download up to 38 GB (the fine-tune 20.4, Qwen-Image-2512's parts 16.8 and Lightning 0.85 when they are not here)? It paints on a card of 24 GB.",
                   [q_parts, q_light, into(f"{R.ARTIST}/Qwen-Image-2512/checkpoints/{f}", V2, [f"artwork/Qwen-Image-2512/checkpoints/{f}"]), art_env()])]   # paths: repo
    if a.get("art-loras"):
        S += [head("asked", "art-loras", "Artwork: the Artist's adapters shared by their authors (ten, 7.5 GB: Qwen-Image 2.1 and 2512)"),
              into(f"{R.ARTIST}/loras (shared by their authors)", V2, ["artwork/loras/*"],   # paths: repo
                   extra=["--by-content", "--manifest", f"{V2}@{pin(V2, root)}"])]

    if a.get("trainer"):
        t = {"bf16": ("checkpoints/yue2_3b_bf16.safetensors", "7.8 GB"), "int8": ("checkpoints/yue2_3b_int8_convrot.safetensors", "4.0 GB")}.get(a["trainer"])   # paths: repo
        if not t:
            raise Usage("--trainer takes bf16 or int8")
        mert = f"{R.MISC}/MERT-v2-FullSong"
        S += [head("asked", "trainer", f"The LoRA trainer's base: Comfy-Org/YuE2 ({a['trainer']})"),
              gate(f"Download {t[1]}, and MERT-v2-FullSong 2.5 GB when it is not here?",
                   [into(f"{R.COMFY}/{t[0]} (Comfy-Org/YuE2)", V2, [f"checkpoints/comfy/{t[0]}"]),   # paths: repo
                    into(f"{mert} (m-a-p)", V2, ["checkpoints/MERT-v2-FullSong/*"])],   # paths: repo
                   [tool(mert, [f"{mert}/model.safetensors"], "(m-a-p/MERT-v2-FullSong)", "(2.5 GB: --trainer fetches it with the base)")]),
              into(f"{R.ENGINE_TOKENIZERS}/yue2-mothersuperior-realaudio-tokenizer-v4 (its head)", V2, ["checkpoints/yue2-mothersuperior-realaudio-tokenizer-v4/*"])]   # paths: repo

    if a.get("backbone"):
        bs = {"BF16": "7.2 GB", "Q8_0": "3.8 GB", "Q6_K": "2.9 GB", "Q5_K_M": "2.6 GB"}.get(a["backbone"])
        if not bs:
            raise Usage("--backbone takes BF16, Q8_0, Q6_K or Q5_K_M")
        b_rel = paths.new_of(f"models/YuE2-3B-{a['backbone']}.gguf")
        S += [head("asked", "backbone", f"The backbone YuE2-3B {a['backbone']} (m-a-p's YuE2 as GGUF: Serveurperso/YuE2-GGUF)"),
              gate(f"Download {bs}? The Studio's Engine (Compute) chooses between the backbones after its next start.",
                   [into(b_rel, V2, [f"models/YuE2-3B-{a['backbone']}.gguf"])])]   # paths: repo (as download-models.sh fetches it)
    for key in ("ira", "irae"):
        v = a.get(key)
        if not v:
            continue
        if key == "ira":
            size = {"BF16": "7.2 GB", "Q8_0": "3.8 GB", "Q6_K": "2.9 GB"}.get(v)
            if not size:
                raise Usage("--ira takes BF16, Q8_0 or Q6_K")
            name, title = f"IRA-{v}", f"The IRA merge {v} (YuE2-3B with Mothersuperior's Instrumental and Real Audio folded in: {IRA_REPO})"
            what = f"{R.ENGINE_LEGACY}/YuE2-3B-IRA-{v}.gguf (Ruach Studio's IRA merge)"
        else:
            s, _, q = v.rpartition("-")
            size = {"BF16": "7.2 GB", "Q8_0": "3.8 GB", "Q6_K": "2.9 GB"}.get(q) if s in IRAE_SETS else None
            if not size:
                raise Usage("--irae takes IRAE, IRAEv2, IRAEv3, IRAE-IR or IRAE-IRv2 with -BF16, -Q8_0 or -Q6_K (IRAEv2-Q8_0)")
            name, title = v, f"The {v} merge (IRA with monsterovich's Epic Trailer adapter folded in on top: {IRA_REPO})"
            what = f"{R.ENGINE_LEGACY}/YuE2-3B-{v}.gguf (Ruach Studio's {v} merge)"
        S += [head("asked", key, title),
              gate(f"Download {size}? The Studio's Engine (Compute) chooses it beside m-a-p's backbones after its next start.",
                   [into_at(what, IRA_REPO, R.ENGINE_LEGACY, [f"YuE2-3B-{name}.gguf"])])]
    if want("fw"):
        S.append({"op": "fwpart"})
    for key, merges, wave in (("fw", FW_MERGES, "FW"), ("tw", TW_MERGES, "TW")):
        v = a.get(key)
        if not v:
            continue
        m, _, q = v.rpartition("-")
        size = {"BF16": "7.2 GB", "Q8_0": "3.8 GB", "Q6_K": "2.9 GB"}.get(q) if m in merges else None
        if not size:
            raise Usage(f"--{key} takes {', '.join(merges)} with -BF16, -Q8_0 or -Q6_K ({merges[0 if key == 'tw' else 2]}-Q8_0)")
        title = (f"The RS-FW merge {v} (Ruach Studio's own fine-tune folded into YuE2-3B: {FT})" if key == "fw"
                 else f"The RS-TW merge {v} (Ruach Studio's Tsunami Wave folded into RS-FW 2.4x0.75: {FT})")
        S += [head("asked", key, title),
              gate(f"Download {size}? The Studio's Engine (Compute) chooses it beside m-a-p's backbones after its next start.",
                   [into_at(f"{R.ENGINE_FINETUNES}/RS-{wave}-{m}/YuE2-3B-RS-{wave}-{v}.gguf (Ruach Studio's RS-{wave} {v} merge)", FT,
                            f"{R.ENGINE_FINETUNES}/RS-{wave}-{m}", [f"YuE2-3B-RS-{wave}-{v}.gguf"])])]
    if want("loras"):
        S += [head("part", "loras", "LoRAs: the Kit's library and Ruach Studio's own"), {"op": "loras_kit"}, {"op": "loras_own"}]
    return a, S


def flat(steps):
    """every step, a gate's own inside it"""
    for s in steps:
        yield s
        if s["op"] == "gate":
            yield from flat(s["steps"] + s["else"])


# ── the run ──────────────────────────────────────────────────────────────────────────────────────────────────────────
NOISE = re.compile(r"it/s|%\||Fetching [0-9]+ files|Download complete|Moving file|Downloading", re.I)


class Fetch:
    """One run: its counts, its log (tmp/fetch-heresy.last.log, as bash's again() keeps it), its list (a whole run only). expect() and guard() are
    tools/hf_expect.py and tools/hf_guard.py run as fetch-heresy.sh runs them; the tests put their own in their place."""
    def __init__(self, root=ROOT, mode="fetch", yes=False, listing=False, out=None, wait=30):
        self.root, self.mode, self.yes, self.out, self.wait = Path(root), mode, yes, out or sys.stdout, wait
        self.n = dict.fromkeys(VERDICTS, 0)
        (self.root / "tmp").mkdir(parents=True, exist_ok=True)
        self.log = self.root / "tmp" / "fetch-heresy.last.log"
        self.list = self.root / "tmp" / "fetch-heresy.list.part" if listing else None
        if self.list:
            self.list.write_text("", encoding="utf-8")
        self.answers = {}
        self._env = None

    # what is said
    def p(self, text=""):
        print(text, file=self.out, flush=True)

    def note(self, st, what, words):
        if self.list:
            with open(self.list, "a", encoding="utf-8") as f:
                f.write(f"{st}\t{what}\t{words}\n")

    def say(self, verdict, what, words=""):
        self.p(f"{verdict:<10}{what} {words}")
        self.n[verdict] += 1
        self.note(verdict, what, words)

    def head(self, s):
        self.p()
        self.p(s["title"] + (f" (--only {s['id']})" if s["op"] == "part" else ""))
        self.note("##", s["id"], s["title"])

    def why(self):
        try:
            lines = self.log.read_text(encoding="utf-8", errors="replace").splitlines()
        except OSError:
            return ""
        keep = [ln for ln in lines if ln.strip() and not NOISE.search(ln)]
        return " ".join(keep[-2:])[:260]

    # the programs
    def env(self):
        if self._env is None:
            e = fm.env()
            e.update(HF_ASSETS_CACHE=str(self.root / "tmp" / "hf" / "assets"), HF_XET_CACHE=str(self.root / "tmp" / "hf" / "xet"),
                     HF_XET_HIGH_PERFORMANCE="1", TMPDIR=str(self.root / "tmp"), PYTHONNOUSERSITE="1", NO_COLOR="1", PYTHONIOENCODING="utf-8")
            self._env = e
        return self._env

    def hf_program(self):
        e = self.env().get("YUE2_HF")
        for p in ([e] if e else []) + [str(self.root / ".venv" / "Scripts" / "hf.exe"), str(self.root / ".venv" / "bin" / "hf")]:
            if p and os.path.isfile(p):
                return p
        return None

    def expect(self, repo, rev, d, args):
        """tools/hf_expect.py --repo --rev --dir ARGS: (its exit status, its words)"""
        r = subprocess.run([sys.executable, str(self.root / "tools" / "hf_expect.py"), "--repo", repo, "--rev", rev, "--dir", str(d)] + list(args),
                           capture_output=True, text=True, encoding="utf-8", errors="replace", env=self.env(), stdin=subprocess.DEVNULL)
        return r.returncode, (r.stdout or "") + (r.stderr or "")

    def guard(self, args):
        """tools/hf_guard.py download ARGS into the log: its exit status"""
        try:
            r = subprocess.run([sys.executable, str(self.root / "tools" / "hf_guard.py"), "download"] + list(args), capture_output=True, text=True,
                               encoding="utf-8", errors="replace", env=self.env(), stdin=subprocess.DEVNULL)
            said, rc = (r.stdout or "") + (r.stderr or ""), r.returncode
        except OSError as e:
            said, rc = f"tools/hf_guard.py would not start: {e}", 127
        self.log.write_text(said, encoding="utf-8")
        return rc

    def again(self, fn):
        """bash's again(): once more after half a minute when it fails (a burst of requests earns a 429 from Hugging Face)"""
        if fn() == 0:
            return 0
        self.p(f"          failed once ({self.why()}); once more in {self.wait} s")
        time.sleep(self.wait)
        return fn()

    def vias(self):
        try:
            for ln in self.log.read_text(encoding="utf-8", errors="replace").splitlines():
                if ln.startswith("via "):
                    self.p("          " + ln)
        except OSError:
            pass

    def ready(self, what):
        if self.hf_program():
            return True
        self.say("failed", what, "(the pinned downloader, hf in .venv, is not here: the install brings it, run the install again)")
        return False

    def landing(self, repo, rev, d, inc, strip=""):
        """[(where a file of these includes lands, its pinned size)] from the pinned list (tools/hf_expect.py's cache); [] when it cannot be read"""
        try:
            if str(self.root / "tools") not in sys.path:
                sys.path.insert(0, str(self.root / "tools"))
            import hf_expect
            remote = hf_expect.expected_files(repo, rev)
        except Exception:
            return []
        names = [p for p in remote if any(fnmatch.fnmatch(p, q) for q in inc) and os.path.basename(p) != ".gitattributes"]
        return [(Path(d) / (p[len(strip):] if strip and p.startswith(strip) else p), remote[p].get("size") or 0) for p in names]

    def guarded(self, args, part, size):
        """tools/hf_guard.py download ARGS, again after half a minute when it fails, with how far a file came while it comes (fetch_models.py's ticker
        over the guard's part folder: HERESY 2931)"""
        stop = threading.Event()
        tick = threading.Thread(target=fm.ticker, args=(Path(part) / ".ruach-part", size, stop, self.out), daemon=True)
        tick.start()
        try:
            return self.again(lambda: self.guard(args))
        finally:
            stop.set()
            tick.join()

    def refuse_long(self, what, tag, where):
        for f, _ in where:
            n = too_long(f)
            if n:
                self.say("failed", what, f"{tag}: {os.path.relpath(f, self.root)} would be a path of {n} characters, past the 260 Windows opens "
                                         f"while its long paths are off: {LONG_HOW}")
                return True
        return False

    def aside(self, d, wrong):
        stamp = self.root / "tmp" / "replaced" / time.strftime("%Y%m%d-%H%M%S")
        for f in wrong:
            (stamp / f).parent.mkdir(parents=True, exist_ok=True)
            os.replace(lp(Path(d) / f), lp(stamp / f))
        self.p(f"          the old copies → {os.path.relpath(stamp, self.root)} (delete them when the new ones work)")

    def settle(self, inc):
        """every whole file models/.incoming/ holds that an include names, renamed into its room (fetch-heresy.sh's settle)"""
        base = self.root / paths.INCOMING
        top = lp(base, force=True)
        for d, dirs, files in os.walk(top):
            if os.path.normpath(d) == os.path.normpath(top):
                dirs[:] = [x for x in dirs if x not in (".cache", ".ruach-part")]
            for n in files:
                rel = os.path.relpath(os.path.join(d, n), top).replace(os.sep, "/")
                if any(fnmatch.fnmatchcase(rel, q) for q in inc):
                    new = paths.new_of(rel)
                    if new:
                        os.makedirs(os.path.dirname(lp(self.root / new, force=True)), exist_ok=True)
                        os.replace(os.path.join(d, n), lp(self.root / new, force=True))
        for d, dirs, files in sorted(os.walk(top), key=lambda w: -len(w[0])):
            if os.path.normpath(d) != os.path.normpath(top) and ".cache" not in os.path.relpath(d, top).split(os.sep):
                try:
                    os.rmdir(d)
                except OSError:
                    pass

    # the steps
    def tag(self, repo, rev):
        return f"({repo} @ {rev[:7]})" if rev != "main" else f"({repo} @ main: not pinned)"

    def hf(self, s, quiet=False):
        """hf_into (op into) and hf_into_at (op at): the check, then what it named missing or wrong, then the check again; quiet: its state alone"""
        repo, at = s["repo"], s["op"] == "at"
        rev = s.get("pin_as") or pin(repo, self.root)
        tag = self.tag(repo, rev)
        if at:
            strip, d = "", self.root / s["dir"]
            args = ["--include"] + s["inc"]
        else:
            try:
                strip, folder = place(s["inc"])
            except ValueError as e:
                return 1 if quiet else self.say("failed", s["what"], f"{tag}: lab/paths.py's map: {e}")
            d = self.root / folder
            args = s.get("extra", []) + ["--strip", strip, "--include"] + s["inc"]
        rc, out = self.expect(repo, rev, d, args)
        if quiet:
            return rc
        if rc == 0:
            return self.say("here", s["what"], tag)
        if rc == 2:
            return self.say("unknown", s["what"], f"{tag} — the pinned file list could not be read (offline?)")
        lines = out.splitlines()
        wrong = [m.group(1) for m in (re.match(r"^\s*(.*): [0-9]* bytes, expected [0-9]* \(incomplete or wrong\)$", ln) for ln in lines) if m]
        if self.mode == "check":
            return self.say("missing", s["what"], f"{tag}: " + re.sub(r"^[^:]*: ", "", lines[0] if lines else "", count=1))
        if wrong and self.mode != "replace":
            return self.say("differs", s["what"], f"{tag} — kept: {len(wrong)} here differ from the pin, the first {wrong[0]} (--replace fetches them)")
        if wrong:
            self.aside(d, wrong)
        if not self.ready(s["what"]):
            return
        need = [m.group(1) for m in (re.match(r"^\s*(.*): missing$", ln) for ln in lines) if m] + wrong
        need = [strip + x for x in need if x]
        if any(re.search(r"\.\.\. and [0-9]* more", ln) for ln in lines):
            need = []
        inc = need or s["inc"]
        land = self.landing(repo, rev, d, inc, strip)
        if self.refuse_long(s["what"], tag, land):
            return
        into_dir = d if at else self.root / paths.INCOMING
        os.makedirs(lp(into_dir), exist_ok=True)
        self.guarded(["--quiet", repo, "--revision", rev, "--local-dir", str(into_dir), "--include"] + inc, into_dir,
                     sum(z for f, z in land if not (f.is_file() and f.stat().st_size == z)))
        self.vias()
        if not at:
            self.settle(inc)
        if self.expect(repo, rev, d, args)[0] == 0:
            self.say("fetched", s["what"], tag)
        else:
            self.say("failed", s["what"], f"{tag}: {self.why()}")

    def whole(self, s, quiet=False):
        """hf_repo: a repo into a folder of its own (the listener at bf16)"""
        repo, d = s["repo"], self.root / s["dir"]
        rev = pin(repo, self.root)
        tag = self.tag(repo, rev)
        args = ["--include"] + s["inc"]
        state = "missing"
        if d.is_dir() and any(d.iterdir()):
            rc = self.expect(repo, rev, d, args)[0]
            state = {0: "here", 1: "differs"}.get(rc, "unknown")
            dl = d / ".cache" / "huggingface" / "download"
            if state == "differs" and dl.is_dir() and any(rev in (p.read_text(encoding="utf-8", errors="replace") if p.is_file() else "")
                                                         for p in dl.rglob("*.metadata")):
                state = "partial"
        if quiet:
            return 0 if state == "here" else 1
        what = s["dir"]
        if state == "here":
            return self.say("here", what, tag)
        if state == "unknown":
            return self.say("unknown", what, f"{tag} — the pinned file list could not be read (offline?); kept")
        if state == "differs" and self.mode != "replace":
            return self.say("differs", what, f"{tag} — kept; not the pinned copy (--replace fetches it)")
        if self.mode == "check":
            return self.say("missing", what, tag + (" — unfinished: a fetch goes on from there" if state == "partial" else ""))
        if not self.ready(what):
            return
        if state == "differs":
            aside = self.root / "tmp" / "replaced" / (d.name + "." + time.strftime("%Y%m%d-%H%M%S"))
            aside.parent.mkdir(parents=True, exist_ok=True)
            os.replace(lp(d), lp(aside))
            self.p(f"          the old copy → {os.path.relpath(aside, self.root)} (delete it when the new one works)")
        land = self.landing(repo, rev, d, s["inc"])
        if self.refuse_long(what, tag, land):
            return
        os.makedirs(lp(d), exist_ok=True)
        self.guarded(["--quiet", repo, "--revision", rev, "--local-dir", str(d), "--include"] + s["inc"], d, sum(z for _, z in land))
        self.vias()
        if self.expect(repo, rev, d, args)[0] == 0:
            self.say("fetched", what, tag)
        else:
            self.say("failed", what, f"{tag}: {self.why()}")

    def url_get(self, url, dst, size=None, sha=None):
        """One file from a URL into DST through DST's part (…/.ruach-part/NAME.incomplete, which a cut-short download goes on from); renamed into place
        only at its pinned size and SHA-256. None, or why not in plain words. The part folder goes when nothing is left in it."""
        part = Path(dst).parent / ".ruach-part"
        try:
            return self._url_get(url, dst, size, sha, part)
        finally:
            try:
                os.rmdir(lp(part))
            except OSError:
                pass

    def _url_get(self, url, dst, size, sha, part):
        inc = part / (Path(dst).name + ".incomplete")
        os.makedirs(lp(part), exist_ok=True)
        ctx = None
        try:
            import certifi                                   # uv's Python on a fresh Windows trusts no root yet (2649)
            ctx = ssl.create_default_context(cafile=certifi.where())
        except ImportError:
            ctx = ssl.create_default_context()
        have = os.path.getsize(lp(inc)) if os.path.isfile(lp(inc)) else 0
        if size and have > size:
            os.unlink(lp(inc))
            have = 0
        host = re.sub(r"^https?://([^/]+).*$", r"\1", url)
        if not (size and have == size):
            req = urllib.request.Request(url, headers={"User-Agent": "RuachStudio-fetch", **({"Range": f"bytes={have}-"} if have else {})})
            try:
                with urllib.request.urlopen(req, timeout=60, context=ctx) as r:
                    mode = "ab" if have and r.status == 206 else "wb"
                    with open(lp(inc), mode) as f:
                        while True:
                            b = r.read(1 << 20)
                            if not b:
                                break
                            f.write(b)
            except Exception as e:  # urllib's, ssl's, the socket's: said as they are
                got = os.path.getsize(lp(inc)) if os.path.isfile(lp(inc)) else 0
                return (f"{host} did not give it ({type(e).__name__}: {e}); {got} of {size or '?'} bytes came, kept for the next run to go on from"
                        if got else f"{host} did not give it ({type(e).__name__}: {e})")
        got = os.path.getsize(lp(inc))
        if size and got != size:
            return f"{host} gave {got} bytes, the pinned size is {size}; kept for the next run to go on from"
        if sha:
            h = hashlib.sha256()
            with open(lp(inc), "rb") as f:
                for b in iter(lambda: f.read(1 << 22), b""):
                    h.update(b)
            if h.hexdigest() != sha:
                os.unlink(lp(inc))
                return f"its SHA-256 {h.hexdigest()[:16]}… is not the pinned {sha[:16]}…: not the file the Studio splits with, removed; nothing was put in its place"
        os.replace(lp(inc), lp(dst))
        return None

    def direct(self, s, quiet=False):
        """files from their authors' own address, each held to its pinned size and SHA-256 (the stems' BS-Roformer ep317)"""
        d = self.root / s["dir"]
        bad = [f for f in s["files"] if not (d / f["name"]).is_file() or (d / f["name"]).stat().st_size != f["size"]]
        if quiet:
            return 1 if bad else 0
        if not bad:
            self.say("here", s["what"], s["words"])
            if self.mode != "check":
                self.seplist(s)
            return
        if self.mode == "check":
            n = bad[0]
            return self.say("missing", s["what"], s["words"] + f": {n['name']}" + (f" is {(d / n['name']).stat().st_size} bytes, the pinned {n['size']}"
                                                                                  if (d / n["name"]).is_file() else " is not here"))
        if self.refuse_long(s["what"], s["words"], [(d / f["name"], f["size"]) for f in bad]):
            return
        failed = []
        for f in bad:
            def one(f=f):
                why, inc = None, d / ".ruach-part" / (f["name"] + ".incomplete")
                for u in f["urls"]:
                    # HERESY 2984 (the VM on a mobile link, 25.11.2026: ep317 cut at 20 MB, then at 24 MB, and the run gave up): a connection
                    # cut while bytes were coming is taken up again at once from where it stopped; only one that brings nothing new ends it
                    for _ in range(STREAK):
                        before = os.path.getsize(lp(inc)) if os.path.isfile(lp(inc)) else 0
                        why = self.url_get(u, d / f["name"], f["size"], f["sha"])
                        if why is None:
                            return 0
                        if (os.path.getsize(lp(inc)) if os.path.isfile(lp(inc)) else 0) <= before:
                            break
                self.log.write_text(f"{f['name']}: {why}", encoding="utf-8")
                return 1
            self.p(f"          {f['name']}  {fm.hs(f['size'])}")
            stop = threading.Event()
            tick = threading.Thread(target=fm.ticker, args=(d / ".ruach-part" / (f["name"] + ".incomplete"), f["size"], stop, self.out), daemon=True)   # 2984
            tick.start()
            try:
                rc = self.again(one)
            finally:
                stop.set()
                tick.join()
            if rc:
                failed.append(self.why())
        if failed:
            return self.say("failed", s["what"], f"{s['words']}: {failed[0]}")
        self.say("fetched", s["what"], s["words"])
        self.seplist(s)

    def seplist(self, s):
        """audio-separator's own list beside its models (no pin: its authors' list moves on); not a verdict, said when it does not come"""
        if self.mode == "check":
            return
        name, url = s["list"]
        dst = self.root / s["dir"] / name
        if dst.is_file() and dst.stat().st_size > 0:
            return
        if not dst.parent.is_dir():
            return
        why = self.url_get(url, dst)
        if why is None:
            try:
                json.loads(dst.read_text(encoding="utf-8"))
                return
            except (OSError, ValueError):
                os.unlink(lp(dst))
                why = "it was not a list"
        self.p(f"          {name} for audio-separator did not come ({why}): the stems' first split fetches it")

    def code(self, s, quiet=False):
        """a project's code: at a pinned commit from GitHub's archive (no git needed); without a commit, git clone --depth 1 as bash does"""
        d = self.root / s["dir"]
        mark = d / ".ruach-commit"
        here = (d / ".git").is_dir() or mark.is_file()
        lack = py_lack(s.get("py"))                  # HERESY 2986: the code is here only with what it imports in this Python
        if quiet:
            return 0 if here and not lack else 1
        at = f"github.com/{s['repo']}" + (f" at {s['commit'][:7]}" if s["commit"] else "")
        if here and not lack:
            return self.say("here", s["what"], f"({mark.read_text(encoding='utf-8').strip()[:7] if mark.is_file() else 'git'}: {at})")
        if self.mode == "check":
            return self.say("missing", s["what"], f"({at}" + (f": the code is here, {', '.join(lack)} not in this Python)" if here else ")"))
        if here:
            return self.py_in(s, lack, at)
        if not s["commit"]:
            git = shutil.which("git")
            if not git:
                return self.say("missing", s["what"], f"({at}: git is not on this machine)")
            ok = subprocess.run([git, "clone", "-q", "--depth", "1", f"https://github.com/{s['repo']}.git", str(d)], stdin=subprocess.DEVNULL).returncode == 0
            return self.say("fetched" if ok else "failed", s["what"], f"({at})")
        tmp = Path(tempfile.mkdtemp(prefix="code-", dir=self.root / "tmp"))
        try:
            zf = tmp / "code.zip"
            why = None
            for attempt in (1, 2):
                why = self.url_get(f"https://codeload.github.com/{s['repo']}/zip/{s['commit']}", zf)
                if why is None:
                    break
                if attempt == 1:
                    self.p(f"          failed once ({why}); once more in {self.wait} s")
                    time.sleep(self.wait)
            if why:
                return self.say("failed", s["what"], f"({at}: {why})")
            out = tmp / "x"
            with zipfile.ZipFile(zf) as z:
                for m in z.infolist():
                    t = (out / m.filename).resolve()
                    if not str(t).startswith(str(out.resolve())):
                        return self.say("failed", s["what"], f"({at}: the archive names a path outside its folder: {m.filename}; nothing was put in place)")
                z.extractall(out)
            top = [x for x in out.iterdir()]
            src = top[0] if len(top) == 1 and top[0].is_dir() else out
            (src / ".ruach-commit").write_text(s["commit"] + "\n", encoding="utf-8")
            if d.exists() and any(d.iterdir()):
                aside = self.root / "tmp" / "replaced" / (d.name + "." + time.strftime("%Y%m%d-%H%M%S"))
                aside.parent.mkdir(parents=True, exist_ok=True)
                os.replace(lp(d), lp(aside))
                self.p(f"          what was in {s['dir']} → {os.path.relpath(aside, self.root)}")
            elif d.exists():
                d.rmdir()
            d.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(src), str(d))
            self.py_in(s, lack, at) if lack else self.say("fetched", s["what"], f"({at})")
        except (OSError, zipfile.BadZipFile) as e:
            self.say("failed", s["what"], f"({at}: {e})")
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    def py_in(self, s, lack, at):
        """HERESY 2986: what a project's code imports, into this Python (the Studio's .venv) by the uv the install brought, at the install's pins"""
        u = setup_win.uv()
        if not u:
            return self.say("failed", s["what"], f"({at}: {', '.join(lack)} not in this Python, and no uv to bring them: run the install again)")
        env = dict(os.environ, UV_CACHE_DIR=str(self.root / "tmp" / "uv-cache"), UV_LINK_MODE="copy", PYTHONUTF8="1")
        try:
            r = subprocess.run([u, "pip", "install", "--python", sys.executable] + list(lack), env=env, stdin=subprocess.DEVNULL,
                               capture_output=True, text=True, encoding="utf-8", errors="replace")
            said = ((r.stdout or "") + (r.stderr or "")).strip().splitlines()
        except OSError as e:
            r, said = None, [str(e)]
        importlib.invalidate_caches()
        still = py_lack(lack)
        if r is None or r.returncode or still:
            return self.say("failed", s["what"], f"({at}: {', '.join(still or lack)} did not come into this Python: {(said or ['uv said nothing'])[-1][:200]})")
        return self.say("fetched", s["what"], f"({at}; {', '.join(lack)} into this Python)")

    def tool(self, s):
        if s.get("make"):
            return self.venv(s)
        if any((self.root / w).is_file() for w in s["where"]):
            if s["here"] is not None:
                self.say("here", s["what"], s["here"])
        else:
            self.say("missing", s["what"], s["miss"])

    def venv(self, s):
        """HERESY 2989: a Python of the Studio's own (.venv-art, .venv-read) made on Windows by the install's uv, as Linux makes it; here only
        when it went in whole (launcher/venvs_win.py)"""
        if venvs_win.here(s["make"], self.root):
            if s["here"] is not None:
                self.say("here", s["what"], s["here"])
            return
        if self.mode == "check":
            return self.say("missing", s["what"], s["miss"])
        why = venvs_win.make(s["make"], self.root, out=self.p)
        self.say("failed" if why else "fetched", s["what"], s["miss"] + (f": {why}" if why else ""))

    def runtime(self, s):
        """HERESY 2989: a program the Windows package brings (launcher/win_tools.py), for an install made without it: its pinned archive by
        this downloader (a connection cut while bytes came taken up again, the ticker), held to its size and SHA-256, unpacked into
        runtime/<name>; the archive is not kept"""
        n, p = s["name"], win_tools.PINS[s["name"]]
        what, words = f"runtime/{n}", f"({p['what']})"
        if win_tools.here(n, self.root):
            return self.say("here", what, words)
        if self.mode == "check":
            return self.say("missing", what, words)
        name = p["url"].rsplit("/", 1)[-1]
        inc = self.root / "tmp" / "runtime" / ".ruach-part" / (name + ".incomplete")

        def fetch(url, dst, size, sha):
            why = None
            for _ in range(STREAK):
                before = os.path.getsize(lp(inc)) if os.path.isfile(lp(inc)) else 0
                why = self.url_get(url, dst, size, sha)
                if why is None or (os.path.getsize(lp(inc)) if os.path.isfile(lp(inc)) else 0) <= before:
                    return why
            return why
        self.p(f"          {name}  {fm.hs(p['size'])}")
        stop = threading.Event()
        tick = threading.Thread(target=fm.ticker, args=(inc, p["size"], stop, self.out), daemon=True)
        tick.start()
        try:
            why = win_tools.bring(n, self.root, fetch=fetch)
        finally:
            stop.set()
            tick.join()
        self.say("failed" if why else "fetched", what, words + (f": {why}" if why else ""))

    def snap(self):
        """an older install's woongzip1/universr-audio in hf_cache/ (the same bytes as v2's) copied into its room, then checked by the pin like any download"""
        u = self.root / paths.REFINER_UNIVERSR
        snap = self.root / "hf_cache" / "hub" / "models--woongzip1--universr-audio" / "snapshots" / pin("woongzip1/universr-audio", self.root)
        if self.mode != "check" and not (u / "pytorch_model.bin").is_file() and (snap / "pytorch_model.bin").is_file() and (snap / "config.yaml").is_file():
            u.mkdir(parents=True, exist_ok=True)
            for n in ("config.yaml", "pytorch_model.bin"):
                shutil.copyfile(snap / n, u / n)

    def ffmpeg(self):
        if ON_WIN and not shutil.which("ffmpeg"):
            self.p("          the stems are split by audio-separator, which will not start without ffmpeg, and none is on this machine's PATH: "
                   "the models are fetched all the same, the split itself waits for ffmpeg")

    def fwpart(self):
        """the part «fw»: RS-TW 2.0x0.75 at the backbone's quant, RS-FW 2.4x0.75 where the pinned repo has no RS-TW yet (fetch-heresy.sh's own choice)"""
        def has(n):
            f = paths.engine_gguf(n, self.root)
            return f.is_file() and f.stat().st_size > 0
        q = next((x for x in QUANTS3 if has(f"YuE2-3B-{x}.gguf")), "") or \
            next((x for x in QUANTS3 for m in ("RS-TW-2.0x0.75", "RS-FW-2.4x0.75") if has(f"YuE2-3B-{m}-{x}.gguf")), "")
        m = "RS-TW-2.0x0.75"
        d = f"{paths.ENGINE_FINETUNES}/{m}"
        if q and not has(f"YuE2-3B-{m}-{q}.gguf"):
            if "no files matched" in self.expect(FT, pin(FT, self.root), self.root / d, ["--include", f"YuE2-3B-{m}-{q}.gguf"])[1]:
                m, d = "RS-FW-2.4x0.75", f"{paths.ENGINE_FINETUNES}/RS-FW-2.4x0.75"
        self.head({"op": "part", "id": "fw", "title": f"Ruach Studio's own fine-tune: {m[:5]} {m[6:]}, the Studio's default"})
        if m != "RS-TW-2.0x0.75":
            self.p(f"          RS-TW 2.0x0.75 is not in {FT} at its pin yet: RS-FW 2.4x0.75, as before")
        if not q:
            self.p("          no BF16, Q8_0 or Q6_K backbone here: m-a-p's alone (there is no Q5_K_M of the fine-tune)")
            return
        self.hf(into_at(f"{d}/YuE2-3B-{m}-{q}.gguf (Ruach Studio's own fine-tune, the default)", FT, d, [f"YuE2-3B-{m}-{q}.gguf"]))

    def loras_kit(self):
        """tools/download-loras.sh's library, by its own list: each file at its pin through tools/hf_guard.py"""
        what = "loras/ (the Kit's library)"
        rows = kit_loras(self.root)
        if rows is None:
            return self.say("failed", what, "(tools/download-loras.sh, whose list names the library, is not in this install)")
        have = got = 0
        bad = []
        for folder, repo, sub, names in rows:
            rev = kit_rev(repo, self.root)
            d = self.root / "loras" / folder
            strip = ["--strip", sub + "/"] if sub else []
            full = [(sub + "/" if sub else "") + n for n in names]
            if self.expect(repo, rev, d, ["--files"] + full + strip)[0] == 0:
                have += len(names)
                continue
            if self.mode == "check":
                bad.append(f"{folder} is not whole")
                continue
            for path in full:
                if self.expect(repo, rev, d, ["--files", path] + strip)[0] == 0:
                    have += 1
                    continue
                if not self.ready(what):
                    return
                self.again(lambda: self.guard(["--quiet", repo, path, "--revision", rev, "--local-dir", str(d)] + strip))
                if self.expect(repo, rev, d, ["--files", path] + strip)[0] == 0:
                    got += 1
                else:
                    bad.append(f"{folder}/{path.rsplit('/', 1)[-1]}: {self.why() or 'missing or the wrong size after the download'}")
        if self.mode == "check":
            return (self.say("missing", what, f"({len(bad)} of {len(rows)} adapters not whole, the first: {bad[0]})") if bad
                    else self.say("here", what, f"(tools/download-loras.sh's list: {len(rows)} adapters at their pins)"))
        if bad:
            return self.say("failed", what, f"({len(bad)} failed, the first {bad[0]})")
        self.say("fetched" if got else "here", what, f"(downloaded {got}, already complete {have})")

    def loras_own(self):
        """heresy/fetch-ruach-loras.py as fetch-heresy.sh runs it: its lines shown and listed, its counts added"""
        what = "loras/ (the Studio's own)"
        script = self.root / "heresy" / "fetch-ruach-loras.py"
        if not script.is_file():
            return self.say("failed", what, "(heresy/fetch-ruach-loras.py is not in this install)")
        r = subprocess.run([sys.executable, str(script)] + (["--check"] if self.mode == "check" else ["--replace"] if self.mode == "replace" else []),
                           capture_output=True, text=True, encoding="utf-8", errors="replace", env=self.env(), stdin=subprocess.DEVNULL)
        c = None
        for ln in ((r.stdout or "") + (r.stderr or "")).splitlines():
            if ln.startswith("#counts "):
                c = ln
            elif ln.strip():
                self.p(ln)
                st, _, rest = re.sub(r"\x1b\[[0-9;]*m", "", ln).partition(" ")
                self.note(st, rest.strip(), "")
        if not c:
            return self.say("failed", what, "(heresy/fetch-ruach-loras.py said nothing to count)")
        for k, v in re.findall(r"(\w+)=(\d+)", c):
            if k in self.n:
                self.n[k] += int(v)

    def ask(self, q):
        try:
            if not sys.stdin or not sys.stdin.isatty():
                raise EOFError
            return input(q + " [y/N] ").strip() in ("y", "Y", "yes", "да", "Да")
        except EOFError:
            self.p(q + " [y/N] (no one to answer here: --yes fetches it)")
            return False

    def gate(self, s):
        go = True
        if self.mode != "check" and not self.yes:
            here = not s["always"] and all(self.quiet(x) == 0 for x in s["steps"] if x["op"] in ("into", "at", "repo"))
            if not here:
                go = self.ask(s["q"])
        if go:
            self.steps(s["steps"])
        else:
            self.p("          not downloaded")
            self.steps(s["else"])

    def quiet(self, s):
        return self.whole(s, quiet=True) if s["op"] == "repo" else self.hf(s, quiet=True)

    def steps(self, steps):
        for s in steps:
            op = s["op"]
            if op in ("part", "asked"):
                self.head(s)
            elif op in ("into", "at"):
                self.hf(s)
            elif op == "repo":
                self.whole(s)
            elif op == "direct":
                self.direct(s)
            elif op == "seplist":
                self.seplist(s)
            elif op == "code":
                self.code(s)
            elif op == "tool":
                self.tool(s)
            elif op == "note":
                self.p("          " + s["text"])
            elif op == "fail":
                self.say("failed", s["what"], s["words"])
            elif op == "gate":
                self.gate(s)
            elif op == "runtime":
                self.runtime(s)
            elif op == "snap":
                self.snap()
            elif op == "ffmpeg":
                self.ffmpeg()
            elif op == "fwpart":
                self.fwpart()
            elif op == "loras_kit":
                self.loras_kit()
            elif op == "loras_own":
                self.loras_own()

    def finish(self):
        n = self.n
        self.p()
        self.p("Your own LoRAs go into loras/, a folder each, with an entry in loras/sources.json.")
        self.p(f"here {n['here']} · unknown {n['unknown']} · differs {n['differs']} · fetched {n['fetched']} · missing {n['missing']} · failed {n['failed']}")
        if self.list:
            self.note("#sum", f"{n['here']} {n['unknown']} {n['differs']} {n['fetched']} {n['missing']} {n['failed']}", f"{self.mode} {int(time.time())}")
            os.replace(self.list, self.root / "tmp" / "fetch-heresy.list")
        return 1 if n["failed"] else 0


def main(argv, root=ROOT, out=None):
    if argv[:1] == ["--plan"]:
        try:
            a, steps = plan(argv[1:], root)
        except Usage as e:
            print(e, file=out or sys.stdout)
            return 2
        print(json.dumps({"args": {k: sorted(v) if isinstance(v, set) else v for k, v in a.items()}, "steps": steps}, ensure_ascii=False, indent=1),
              file=out or sys.stdout)
        return 0
    try:
        a, steps = plan(argv, root)
    except Usage as e:
        print(e, file=out or sys.stdout)
        return 2
    try:
        import winx                                  # HERESY 2989: the package's ffmpeg first on PATH (the stems' note asks for it), run by hand too
        winx.runtime_path(root)
    except ImportError:
        pass
    f = Fetch(root, a["mode"], a["yes"], listing=a["only"] is None, out=out)
    f.p(f"Ruach Studio · {root} · {a['mode']} (no bash here: launcher/fetch_heresy.py, fetch-heresy.sh's twin)")
    f.steps(steps)
    return f.finish()


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
