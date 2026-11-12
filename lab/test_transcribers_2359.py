"""HERESY 2359: the Trainer's three transcribers. Each writes its own sheet files (SheetSage2 with exact angles keeps the names every set's
sheets have, bf16 angles .bf16, Refined .refined); yue-transcribe is told its angles every time (never inherited from the lab's own
environment); a set keeps the transcriber its sheets were written by, a set without sheets gets bf16, and the scan is read again when the
cache changes; a stand-in yue-transcribe sees the angles each transcriber asked for. HERESY 2377: by the page's names, Heretical
(sheetsage2-bf16, a new set's default) and Refined (refined); Standard (sheetsage2) stays for the sets whose sheets it wrote; Refined with
exact angles broke on the Ring and is refused."""
import os
import stat
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent / "trainer"))
import training  # noqa: E402
import cache  # noqa: E402

checks = 0


def ok(cond, what):
    global checks
    assert cond, what
    checks += 1


# the sheets' names: exact keeps the old ones byte for byte
ok(cache.sheet_path("S", "001", "full", "sheetsage2") == os.path.join("S", "_ruach_cache", "001_ruach.full.abc"), "exact keeps the old name")
ok(cache.sheet_path("S", "001", "full", "sheetsage2-bf16").endswith("001_ruach.full.bf16.abc"), "bf16 has its own")
ok(cache.sheet_path("S", "001", "melody", "refined").endswith("001_ruach.melody.refined.abc"), "refined has its own")
ok(cache.stem_sheet_path("S", "001", "vocals", "full", "sheetsage2-bf16").endswith("001_ruach.vocals.full.bf16.abc"), "a stem's sheet too")
ok(cache.sheet_path("S", "001", "full") == cache.sheet_path("S", "001", "full", "sheetsage2"), "the default is exact, as before")
try:
    cache.sheet_path("S", "001", "full", "ss2")
    ok(False, "an unknown transcriber is refused")
except ValueError as e:
    ok("sheetsage2-bf16" in str(e), "the refusal names the three")
    ok(all(n in str(e) for n in ("Heretical", "Refined", "Standard")), "HERESY 2377: by the page's names")
for plain in ("refined-exact", "sheetsage2-refined-exact", "heretical"):
    try:
        cache.sheet_path("S", "001", "full", plain)
        ok(False, f"{plain} is not a sheet's transcriber")
    except ValueError:
        ok(True, f"HERESY 2377: {plain} refused (Refined with exact angles broke on the Ring; heretical is the page's word, not the lab's)")

# the angles said every time, the lab's own environment not inherited
os.environ["YUE2_SS2_ROPE_BF16"] = "1"
ok(cache._angles_env("sheetsage2")["YUE2_SS2_ROPE_BF16"] == "0", "exact says 0 even when the lab has 1")
ok(cache._angles_env("sheetsage2-bf16")["YUE2_SS2_ROPE_BF16"] == "1", "bf16 says 1")
ok(cache._angles_env("refined")["YUE2_SS2_ROPE_BF16"] == "0", "Refined has bf16 always inside the engine; the variable is SheetSage2's")
del os.environ["YUE2_SS2_ROPE_BF16"]

with tempfile.TemporaryDirectory() as tmp:
    tmp = Path(tmp)
    # a stand-in yue-transcribe: writes the angles it was given into the score
    exe = tmp / "yue-transcribe"
    exe.write_text("#!/bin/sh\nwhile [ $# -gt 0 ]; do [ \"$1\" = --out ] && out=$2; shift; done\n"
                   "printf 'X:1\\n%% angles %s\\n' \"$YUE2_SS2_ROPE_BF16\" > \"$out\"\n")
    exe.chmod(exe.stat().st_mode | stat.S_IEXEC)
    for t, want in (("sheetsage2", "0"), ("sheetsage2-bf16", "1"), ("refined", "0")):
        target = str(tmp / f"001_ruach.full{cache.SUFFIX[t]}.abc")
        done, n = cache._transcribe(str(exe), "M.gguf", "a.wav", target, "full", t)
        ok(done and open(target).read().strip().endswith("angles " + want), f"{t}: yue-transcribe told {want}")

    # a set keeps its transcriber; none yet: "" (the lab's run then takes bf16)
    s = tmp / "set"
    (s / "_ruach_cache").mkdir(parents=True)
    ok(training.set_transcriber(s) == "", "no sheets: none said")
    ok(training.set_transcriber(tmp / "nowhere") == "", "no cache at all: none said")
    for i in range(3):
        (s / "_ruach_cache" / f"00{i}_ruach.full.abc").write_text("X:1\n")
    (s / "_ruach_cache" / "000_ruach.vocals.full.abc").write_text("X:1\n")
    (s / "_ruach_cache" / "000_ruach.full.abc.fail").write_text("why\n")
    (s / "_ruach_cache" / "000_ruach.safetensors").write_text("")
    os.utime(s / "_ruach_cache", ns=(1, 1_000_000_000))
    ok(training.set_transcriber(s) == "sheetsage2", "the sets so far keep exact angles")
    for i in range(5):
        (s / "_ruach_cache" / f"00{i}_ruach.melody.bf16.abc").write_text("X:1\n")
    os.utime(s / "_ruach_cache", ns=(2, 2_000_000_000))
    ok(training.set_transcriber(s) == "sheetsage2-bf16", "the most files decide, read again when the cache changes")
    for i in range(7):
        (s / "_ruach_cache" / f"01{i}_ruach.full.refined.abc").write_text("X:1\n")
    os.utime(s / "_ruach_cache", ns=(2, 2_000_000_000))   # the stamp as it was read: the memory answers
    ok(training.set_transcriber(s) == "sheetsage2-bf16", "an unchanged stamp is read from memory")
    os.utime(s / "_ruach_cache", ns=(3, 3_000_000_000))
    ok(training.set_transcriber(s) == "refined", "Refined's sheets counted")
    ok(training.NEW_SET_TRANSCRIBER == "sheetsage2-bf16" and set(training.TRANSCRIBERS) == set(cache.TRANSCRIBERS), "the lab and the trainer name the same three")
    ok(set(cache.TRANSCRIBERS) == {"sheetsage2", "sheetsage2-bf16", "refined"}, "HERESY 2377: an old set's Standard sheets keep working")

# HERESY 2377: the lab's /score names the mode that wrote a take's score, by the engine's word
src = open(Path(__file__).resolve().parent / "lab.py", encoding="utf-8").read()
ok('who = {"sheetsage2-refined": "Refined", "sheetsage2-bf16": "Heretical",' in src and '"sheetsage2": "Standard"}' in src,
   "the take's score says Heretical, Refined or (an old engine's) Standard")

print(f"test_transcribers_2359: {checks} checks passed")
