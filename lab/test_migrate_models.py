#!/usr/bin/env python3
"""HERESY 2330: lab/migrate_models.py on a fake Studio of 2.0.6 in a temporary folder (never this Studio's folders): small files laid out
as 2.0.6 kept them, a dry run that moves nothing, the move (every file in its room, the links pointed again, a cut-short download and the
user's own files left, the same file already in place said, another file of the name refused), a second run that does nothing, the
undo back to the old tree byte for byte, a whole old folder that is a link (moved as the link), one on another disk and models/ itself
on another disk (/dev/shm, when it is another device here: HERESY 2390, each file stays on its disk and a link at its new place reaches
it, nothing copied; the undo takes the links away), and the hold.
  .venv/bin/python lab/test_migrate_models.py"""
import hashlib
import io
import json
import os
import shutil
import sys
import tempfile
from contextlib import redirect_stdout
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import migrate_models as mm  # noqa: E402
import paths  # noqa: E402

G, R, X = ("\033[32m", "\033[31m", "\033[0m") if sys.stdout.isatty() else ("", "", "")
passed = failed = 0


def check(name, ok, detail=""):
    global passed, failed
    passed += bool(ok)
    failed += not ok
    print(f"  {G + 'PASS' if ok else R + 'FAIL'}{X}  {name}" + (f"  ({detail})" if detail and not ok else ""))


# a 2.0.6 install, a file of every kind the map knows (a few bytes each: the name is what moves it)
OLD = """models/YuE2-3B-Q8_0.gguf
models/YuE2-3B-BF16.gguf
models/YuE2-3B-RS-TW-2.0x0.75-Q8_0.gguf
models/YuE2-3B-RS-FW-2.4x0.75-Q6_K.gguf
models/YuE2-3B-RS-FW-3.4m0.75s0.6-BF16.gguf
models/YuE2-3B-IRAE-IRv2-Q8_0.gguf
models/YuE2-Vae-F32.gguf
models/YuE2-VAE-RS-x3_v1-F32.gguf
models/yue2-mothersuperior-realaudio-tokenizer-v4-Q8_0.gguf
models/SheetSage2-Q8_0.gguf
models/MERT-v2-FullSong-Q8_0.gguf
models/RS-TW-2.0x0.75/YuE2-3B-RS-TW-2.0x0.75-BF16.safetensors
models/YuE2-VAE-RS/STABLE/a.safetensors
models/eagle3/YuE2-3B-EAGLE3-draft-Q8_0.gguf
models/muscriptor/v1/muscriptor-small-f16.gguf
models/upbundle/flashsr/weights/vae.pth
models/instruments/pianoteq/README.txt
models/ambient/rain/rain1.flac
models/minimax-h3/diffusion_models/h3.safetensors
models/luts/ruach/a.cube
models/seedvr2/ema_vae_fp16.safetensors
models/reader/drama-3-gguf/drama-3-Q8_0.gguf
checkpoints/YuE2-3B/model.safetensors
checkpoints/YuE2-Vae/vae.safetensors
checkpoints/yue2-mothersuperior-realaudio-tokenizer-v4/config.json
checkpoints/YuE2-hum-to-song/model.safetensors
checkpoints/particle-sliders/catalog.json
checkpoints/Qwen2.5-Omni-7B-GGUF/Qwen2.5-Omni-7B-Q8_0.gguf
checkpoints/audiobox-aesthetics/checkpoint.pt
checkpoints/Qwopus3.5-9B-GGUF/Qwopus3.5-9B-v3-AR-Q4_0.gguf
checkpoints/MERT-v2-FullSong/model.safetensors
checkpoints/SheetSage2/config.json
checkpoints/comfy/checkpoints/yue2_3b_bf16.safetensors
separation/roformer/BS-Roformer-SW.ckpt
universr/pytorch_model.bin
whisper/whisper-large-v3-ct2-float16/model.bin
artwork/Qwen-Image-2512/model_index.json
artwork/loras/qwen-image-2512/PUBLIC/light.safetensors
artwork/upscalers/4x_UltraSharp_v2.safetensors
artwork/nsfw-filter/model.safetensors
artwork/Qwen3-4B-Instruct-2507/config.json""".split()
WANT = {"models/YuE2-3B-Q8_0.gguf": "models/engine/yue2/YuE2-3B-Q8_0.gguf",
        "models/YuE2-3B-RS-TW-2.0x0.75-Q8_0.gguf": "models/engine/finetunes/RS-TW-2.0x0.75/YuE2-3B-RS-TW-2.0x0.75-Q8_0.gguf",
        "models/YuE2-3B-RS-FW-3.4m0.75s0.6-BF16.gguf": "models/engine/finetunes/RS-FW-3.4m0.75s0.6/YuE2-3B-RS-FW-3.4m0.75s0.6-BF16.gguf",
        "models/RS-TW-2.0x0.75/YuE2-3B-RS-TW-2.0x0.75-BF16.safetensors": "models/engine/finetunes/RS-TW-2.0x0.75/YuE2-3B-RS-TW-2.0x0.75-BF16.safetensors",
        "models/YuE2-3B-IRAE-IRv2-Q8_0.gguf": "models/engine/finetunes/legacy/YuE2-3B-IRAE-IRv2-Q8_0.gguf",
        "models/YuE2-VAE-RS-x3_v1-F32.gguf": "models/engine/vae/YuE2-VAE-RS-x3_v1-F32.gguf",
        "models/SheetSage2-Q8_0.gguf": "models/misc/SheetSage2-Q8_0.gguf",
        "models/seedvr2/ema_vae_fp16.safetensors": "models/misc/seedvr2/ema_vae_fp16.safetensors",
        "whisper/whisper-large-v3-ct2-float16/model.bin": "models/misc/whisper/whisper-large-v3-ct2-float16/model.bin",
        "checkpoints/Qwen2.5-Omni-7B-GGUF/Qwen2.5-Omni-7B-Q8_0.gguf": "models/listener/Qwen2.5-Omni-7B-GGUF/Qwen2.5-Omni-7B-Q8_0.gguf",
        "checkpoints/Qwopus3.5-9B-GGUF/Qwopus3.5-9B-v3-AR-Q4_0.gguf": "models/writer/Qwopus3.5-9B-GGUF/Qwopus3.5-9B-v3-AR-Q4_0.gguf",
        "models/reader/drama-3-gguf/drama-3-Q8_0.gguf": "models/narrator/drama-3-gguf/drama-3-Q8_0.gguf",
        "models/minimax-h3/diffusion_models/h3.safetensors": "models/videographer/minimax-h3/diffusion_models/h3.safetensors",
        "artwork/loras/qwen-image-2512/PUBLIC/light.safetensors": "models/artist/loras/qwen-image-2512/PUBLIC/light.safetensors",
        "universr/pytorch_model.bin": "models/refiner/upscale/universr/pytorch_model.bin",
        "models/upbundle/flashsr/weights/vae.pth": "models/refiner/upscale/upbundle/flashsr/weights/vae.pth",
        "models/muscriptor/v1/muscriptor-small-f16.gguf": "models/refiner/midi/muscriptor/v1/muscriptor-small-f16.gguf",
        "checkpoints/comfy/checkpoints/yue2_3b_bf16.safetensors": "models/comfy/checkpoints/yue2_3b_bf16.safetensors"}
MINE = ["models/my-own-experiment/x.gguf", "loras/voice-x/a.safetensors", "outputs/song.flac", "training/run1/e1.safetensors"]


def build(root):
    for rel in OLD + MINE:
        p = root / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(("weight " + rel).encode())
    for top in ("models", "checkpoints"):
        (root / top / ".gitkeep").write_bytes(b"")
    (root / "models/YuE2-3B-Q6_K.gguf.part").write_bytes(b"half a download")
    # a relative link, as the Artist's Lightning lies beside its LoRA
    ln = root / "artwork/Qwen-Image-2512/lightning/light.safetensors"
    ln.parent.mkdir(parents=True)
    os.symlink("../../loras/qwen-image-2512/PUBLIC/light.safetensors", ln)
    (root / "user").mkdir()


def snapshot(root):
    """every file and link under the folder (but the migration's own in user/): its relative path → content's sha, or the link's text"""
    out = {}
    for dirpath, dirnames, filenames in os.walk(root, followlinks=False):
        for name in filenames + [d for d in dirnames if os.path.islink(os.path.join(dirpath, d))]:
            p = os.path.join(dirpath, name)
            rel = Path(os.path.relpath(p, root)).as_posix()
            if rel.startswith("user/"):
                continue
            out[rel] = ("->" + os.readlink(p)) if os.path.islink(p) else hashlib.sha256(open(p, "rb").read()).hexdigest()
    return out


def dirs(root):
    return sorted(Path(os.path.relpath(d, root)).as_posix() for d, _, _ in os.walk(root) if not d.startswith(str(root / "user")))


def quiet(fn, *a, **k):
    with redirect_stdout(io.StringIO()) as b:
        r = fn(*a, **k)
    return r, b.getvalue()


base = Path(tempfile.mkdtemp(prefix="ruach-migrate-"))
shm = None
try:
    root = base / "studio"
    root.mkdir()
    build(root)
    before, before_dirs = snapshot(root), dirs(root)

    print("the map")
    check("every old file of the fake install has a place", all(paths.new_of(r) for r in OLD), [r for r in OLD if not paths.new_of(r)])
    check("and the places are the plan's", all(paths.new_of(k) == v for k, v in WANT.items()),
          {k: paths.new_of(k) for k, v in WANT.items() if paths.new_of(k) != v})
    check("a new place maps to nothing (the map is a fixed point there)", all(paths.new_of(paths.new_of(r)) is None for r in OLD))
    check("the user's own files are not the map's", all(paths.new_of(r) is None for r in MINE))

    print("a dry run")
    s = mm.apply(root, dry=True)
    check("it says what would move", s["moved"] == len(OLD) + 1 and not s["refused"], s)
    check("  and moves nothing", snapshot(root) == before)
    log = (root / mm.LOG).read_text(encoding="utf-8")
    check("  the log keeps it, marked dry", "-dry\twould\tmodels/YuE2-3B-Q8_0.gguf\tmodels/engine/yue2/YuE2-3B-Q8_0.gguf" in log)

    print("the move")
    s = mm.apply(root)
    after = snapshot(root)
    check(f"every file moved ({len(OLD)} files, a link among them)", s["moved"] == len(OLD) + 1 and not s["refused"], s)
    check("each in its room, its bytes unchanged", all(after.get(v) == before[k] for k, v in WANT.items()),
          [k for k, v in WANT.items() if after.get(v) != before[k]])
    check("no old folder is left but models/ (the user's own file and the cut-short download in it)",
          sorted(p for p in os.listdir(root) if p in paths.OLD_TOPS) == ["models"], os.listdir(root))
    check("the cut-short download is untouched", (root / "models/YuE2-3B-Q6_K.gguf.part").read_bytes() == b"half a download")
    check("the user's own files stay where they were", all(after.get(r) == before[r] for r in MINE))
    lk = root / "models/artist/Qwen-Image-2512/lightning/light.safetensors"
    check("the relative link moved and still reaches its target", lk.is_symlink() and lk.read_bytes() == b"weight artwork/loras/qwen-image-2512/PUBLIC/light.safetensors")
    check("  still relative", not os.path.isabs(os.readlink(lk)), os.readlink(lk))
    sums = json.loads((root / mm.SUMS).read_text(encoding="utf-8"))
    check("the sums are kept for the page", sums["moved"] == s["moved"] and sums["bytes"] > 0)
    check("the old .gitkeep went with its folder", not (root / "checkpoints").exists())

    print("a second run")
    s2 = mm.apply(root)
    check("does nothing", s2.get("nothing") is True and snapshot(root) == after, s2)
    r, out = quiet(mm.auto, root)
    check("--auto is silent when nothing is left to move", out == "" and r.get("nothing"), out)

    print("the undo")
    u = mm.undo(root)
    check("puts every file back", u["undone"] >= len(OLD) and not u["cannot"], u)
    check("  the old tree byte for byte (the link's own text too)", snapshot(root) == before,
          sorted(set(snapshot(root).items()) ^ set(before.items()))[:6])
    check("  and no new folder is left behind", dirs(root) == before_dirs, sorted(set(dirs(root)) ^ set(before_dirs)))
    check("a second undo has nothing to do", mm.undo(root).get("nothing") is True)

    print("in place already")
    same = root / WANT["models/YuE2-3B-Q8_0.gguf"]
    same.parent.mkdir(parents=True)
    shutil.copy2(root / "models/YuE2-3B-Q8_0.gguf", same)
    other = root / WANT["models/SheetSage2-Q8_0.gguf"]
    other.parent.mkdir(parents=True)
    other.write_bytes(b"another file of that name")
    s = mm.apply(root)
    check("the same file already there is said, the old copy kept", s["same"] == 1 and (root / "models/YuE2-3B-Q8_0.gguf").exists(), s)
    check("another file of the name is refused, both kept", s["refused"] == 1 and other.read_bytes() == b"another file of that name"
          and (root / "models/SheetSage2-Q8_0.gguf").exists(), s)
    log = (root / mm.LOG).read_text(encoding="utf-8")
    check("  the log says why", "\trefused\tmodels/SheetSage2-Q8_0.gguf\t" in log and "another file of this name" in log)
    size = (root / mm.LOG).stat().st_size
    r, out = quiet(mm.auto, root)
    check("  the next start judges them not again: nothing hashed, nothing logged, nothing said", r.get("nothing") and r.get("left_over") == 2
          and (root / mm.LOG).stat().st_size == size and out == "", (r, out))
    mm.undo(root)
    os.unlink(same)
    os.unlink(other)

    print("a whole old folder on another disk of the user's")
    away = base / "elsewhere/artwork"
    shutil.move(str(root / "artwork"), str(away))
    os.symlink(str(away), root / "artwork")
    s = mm.apply(root)
    art = root / paths.ARTIST
    check("artwork/ (a link) became models/artist/, the same link", art.is_symlink() and os.path.realpath(art) == str(away)
          and not os.path.lexists(root / "artwork"), s)
    check("  its files stayed on their disk, untouched", (away / "nsfw-filter/model.safetensors").exists())
    mm.undo(root)
    check("  and the undo put the link back", (root / "artwork").is_symlink() and not os.path.lexists(art))
    os.unlink(root / "artwork")
    shutil.move(str(away), str(root / "artwork"))
    check("the tree is the old one again", snapshot(root) == before)

    if os.path.isdir("/dev/shm") and os.stat("/dev/shm").st_dev != os.stat(base).st_dev:
        print("an old folder that is a link to another device")
        shm = Path(tempfile.mkdtemp(prefix="ruach-migrate-", dir="/dev/shm"))
        shutil.move(str(root / "checkpoints"), str(shm / "checkpoints"))
        os.symlink(str(shm / "checkpoints"), root / "checkpoints")
        on_shm = sorted(r for r in OLD if r.startswith("checkpoints/"))
        r, out = quiet(mm.auto, root)
        s = r
        new3b = root / "models/engine/yue2/YuE2-3B/model.safetensors"
        check("its files stay on their disk, nothing copied, nothing refused (HERESY 2390)", s["other_disk"] == len(on_shm) == s["linked"]
              and not s["refused"] and (shm / "checkpoints/YuE2-3B/model.safetensors").is_file(), s)
        check("  a link at each new place reaches its file: the Studio reads it there", new3b.is_symlink()
              and new3b.read_bytes() == b"weight checkpoints/YuE2-3B/model.safetensors"
              and all(mm.reaches(root, o, paths.new_of(o)) for o in on_shm), [o for o in on_shm if not mm.reaches(root, o, paths.new_of(o))])
        check("  the start names them", f"{len(on_shm)} on another disk stay there" in out and "checkpoints/MERT-v2-FullSong/model.safetensors" in out, out)
        log = (root / mm.LOG).read_text(encoding="utf-8")
        check("  the log says it is another disk", "\tlinked\tcheckpoints/YuE2-3B/model.safetensors\t" in log and "its new place is on another disk" in log)
        s2 = mm.apply(root)
        r2, out2 = quiet(mm.auto, root)
        check("  a second run neither moves nor judges them, --auto is silent", s2.get("nothing") is True and out2 == "", (s2, out2))
        u = mm.undo(root)
        check("  the undo takes the links away", not u["cannot"] and not os.path.lexists(new3b), u)
        os.unlink(root / "checkpoints")
        shutil.move(str(shm / "checkpoints"), str(root / "checkpoints"))
        check("the tree is the old one again", snapshot(root) == before, sorted(set(snapshot(root).items()) ^ set(before.items()))[:6])

        print("models/ itself on another disk (HERESY 2390: the old checkpoints/ on this one)")
        shutil.move(str(root / "models"), str(shm / "models"))
        os.symlink(str(shm / "models"), root / "models")
        s = mm.apply(root)
        here = [r for r in OLD if not r.startswith("models/")]          # checkpoints/, separation/, universr/, whisper/, artwork/ and its link
        check("the files of models/ moved within their disk, the others linked from it", s["linked"] == len(here) + 1 and not s["refused"]
              and s["moved"] == len(OLD) - len(here)
              and (shm / "models/engine/yue2/YuE2-3B-Q8_0.gguf").is_file() and (root / "checkpoints/YuE2-3B/model.safetensors").is_file(), s)
        lk = shm / "models/engine/yue2/YuE2-3B/model.safetensors"
        check("  the link is absolute and reads through (a relative one would resolve on the other disk)", lk.is_symlink()
              and os.path.isabs(os.readlink(lk)) and (root / "models/engine/yue2/YuE2-3B/model.safetensors").read_bytes()
              == b"weight checkpoints/YuE2-3B/model.safetensors", os.readlink(lk) if lk.is_symlink() else "no link")
        mm.undo(root)
        os.unlink(root / "models")
        shutil.move(str(shm / "models"), str(root / "models"))
        check("the tree is the old one again", snapshot(root) == before, sorted(set(snapshot(root).items()) ^ set(before.items()))[:6])

    print("the bridges (Viktor 11.11: «А для Тренера временно симлинки на старые пути»)")
    mm.apply(root)
    look = mm.bridge(root, dry=True)
    check("--bridge --look makes nothing", look["made"] > 0 and not any(mm.is_bridge(root, x) for x in ("artwork", "checkpoints/comfy")), look)
    b = mm.bridge(root)
    old_ckpt = root / "checkpoints/comfy/checkpoints/yue2_3b_bf16.safetensors"
    check("the Trainer's base reads through its old place", old_ckpt.read_bytes() == b"weight checkpoints/comfy/checkpoints/yue2_3b_bf16.safetensors")
    check("  a whole folder bridged as one link (artwork/, checkpoints/comfy/), a file of models/ alone",
          mm.is_bridge(root, "artwork") and mm.is_bridge(root, "checkpoints/comfy") and mm.is_bridge(root, "models/YuE2-3B-BF16.gguf")
          and not os.path.isabs(os.readlink(root / "checkpoints/comfy")), mm.bridges(root)[:5])
    check("  never over what is there (the user's own folder in models/ untouched)", (root / "models/my-own-experiment/x.gguf").is_file()
          and not os.path.islink(root / "models/my-own-experiment"))
    check("  the log keeps them all", len(mm.bridges(root)) == b["made"], (len(mm.bridges(root)), b))
    s2 = mm.apply(root)
    r, out = quiet(mm.auto, root)
    check("the next move neither moves nor judges a bridge; --auto stays silent; the hold's look counts none",
          s2.get("nothing") is True and out == "" and mm.waiting(root) == [], (s2, out, mm.waiting(root)))
    check("a second --bridge makes none", mm.bridge(root)["made"] == 0)
    u = mm.unbridge(root, ["artwork"])
    check("--unbridge NAME takes that one alone", u["taken"] == 1 and not os.path.lexists(root / "artwork") and mm.is_bridge(root, "checkpoints/comfy"), u)
    mm.undo(root)
    check("the undo takes the bridges away first: the old tree byte for byte", snapshot(root) == before,
          sorted(set(snapshot(root).items()) ^ set(before.items()))[:6])

    print("the hold")
    (root / mm.HOLD).write_text("")
    r, out = quiet(mm.auto, root)
    check("held, --auto moves nothing and says which folders wait (a look at their tops, no walk)", r.get("held") and r["waiting"] == 6
          and snapshot(root) == before and "wait to move" in out and "checkpoints/" in out, (r, out))
    os.unlink(root / mm.HOLD)
    os.environ["RUACH_MODELS_MIGRATION"] = "hold"
    r, _ = quiet(mm.auto, root)
    check("  RUACH_MODELS_MIGRATION=hold too", r.get("held") and snapshot(root) == before)
    del os.environ["RUACH_MODELS_MIGRATION"]
    r, out = quiet(mm.auto, root)
    check("not held, --auto moves and says how much", r["moved"] == len(OLD) + 1 and "moved into models/<room>/" in out, (r, out))

    print("the command line")
    rc = mm.main(["--root", str(root), "--undo"])
    check("--undo by the command line", rc == 0 and snapshot(root) == before)
finally:
    shutil.rmtree(base, ignore_errors=True)
    if shm:
        shutil.rmtree(shm, ignore_errors=True)

print(f"\ntest_migrate_models  {G if not failed else R}{passed} passed, {failed} failed{X}")
sys.exit(1 if failed else 0)
