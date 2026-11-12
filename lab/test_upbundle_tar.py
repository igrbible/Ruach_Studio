"""HERESY 2223 (the audit of 06.11.2026, §2.5): FlashSR's code comes as its author's archive, and its members came out wherever their names
and links led, a «..» alone refused. upbundle_job.unpack now takes only plain files and folders that stay inside the folder: a symbolic link,
a hard link, a device, an absolute path, a «..» are left out and named. An archive made here holds each of them beside two good files.
   python3 lab/test_upbundle_tar.py      (imports upbundle_job, so torch, numpy, soundfile; no card is asked)"""
import io
import os
import sys
import tarfile
import tempfile
from pathlib import Path

os.environ.setdefault("CUDA_VISIBLE_DEVICES", "")
sys.path.insert(0, str(Path(__file__).resolve().parent))
import upbundle_job  # noqa: E402

bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got) + ")"))
    if not ok:
        bad.append(what)


def archive(outside):
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as t:
        def add(name, kind=tarfile.REGTYPE, data=b"", link=""):
            m = tarfile.TarInfo(name)
            m.type, m.linkname, m.size, m.mode = kind, link, len(data), 0o644 if kind != tarfile.DIRTYPE else 0o755
            t.addfile(m, io.BytesIO(data) if data else None)
        add("top", tarfile.DIRTYPE)
        add("top/FlashSR", tarfile.DIRTYPE)
        add("top/FlashSR/FlashSR.py", data=b"print('flash')\n")
        add("top/Assets/demo.wav", data=b"RIFF")
        add("top/evil", tarfile.SYMTYPE, link=str(outside))                      # a link out, then a file written through it
        add("top/evil/through.txt", data=b"through the link")
        add("top/up", tarfile.SYMTYPE, link="..")
        add("top/hard", tarfile.LNKTYPE, link="top/FlashSR/FlashSR.py")
        add("top/../escape.txt", data=b"up and out")
        add("top/" + str(outside / "abs.txt"), data=b"an absolute path")
        add("top/dev", tarfile.CHRTYPE)
        add("top/notes/readme.md", data=b"kept")
    return buf.getvalue()


with tempfile.TemporaryDirectory() as tmp:
    tmp = Path(tmp)
    outside, d = tmp / "outside", tmp / "kit" / "flashsr"
    outside.mkdir()
    left = upbundle_job.unpack(archive(outside), d)
    made = sorted(str(p.relative_to(d)) for p in d.rglob("*"))
    links = [str(p) for p in d.rglob("*") if p.is_symlink()]
    check("the plain files come out where their names say, the top folder dropped and Assets/ left out",
          (d / "FlashSR" / "FlashSR.py").read_bytes() == b"print('flash')\n" and (d / "notes" / "readme.md").read_bytes() == b"kept" and
          not (d / "Assets").exists(), made)
    check("no link of any kind comes out, and nothing is written outside the folder",
          not links and not list(outside.iterdir()) and not (tmp / "kit" / "escape.txt").exists() and not (tmp / "escape.txt").exists() and
          not (d / "hard").exists() and not (d / "dev").exists(), (made, links, list(outside.iterdir())))
    check("what was left out is named: the links, the «..», the absolute path, the device",
          {"evil", "up", "hard", "../escape.txt", "dev"} <= set(left) and any(x.endswith("abs.txt") for x in left), left)
    check("a file whose path ran through a refused link lands inside the folder, not where the link pointed",
          not (outside / "through.txt").exists() and (not (d / "evil").exists() or (d / "evil").is_dir() and not (d / "evil").is_symlink()), made)

print("FAILED: " + ", ".join(bad) if bad else "all passed")
sys.exit(1 if bad else 0)
