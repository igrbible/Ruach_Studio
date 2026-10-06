#!/usr/bin/env python3
"""Checks the built-in FLAC encoder (build/src/flac-enc.h) against the reference tools.

    .venv/bin/python tools/test_flac.py            # synthetic cases + the newest song in outputs/
    .venv/bin/python tools/test_flac.py --no-song  # synthetic cases only

Builds tools/flac_check.cpp into tmp/, checks its MD5 against hashlib, then for every
case writes a WAV, encodes it, and requires:
  - `flac -t` passes (frame CRCs, and the MD5 of the decoded audio equals the MD5 the
    encoder took of its input),
  - `flac -d` and ffmpeg both decode to exactly the expected integers,
  - the tags (TITLE, LYRICS) read back with metaflac.
Size is compared with `flac -5`. Everything is written under tmp/flac-test and removed
when every case passes. Runs niced on 1 core; about 10 seconds.
"""
import hashlib
import json
import math
import os
import shutil
import struct
import subprocess
import sys
import time
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
TMP = ROOT / "tmp"
WORK = TMP / "flac-test"
BIN = TMP / "flac-check"
# plain text when NO_COLOR is set or the output is not a terminal (a log file, a pipe)
COLOR = sys.stdout.isatty() and not os.environ.get("NO_COLOR")
G, R, Y, C, D, B, X = ("\033[32m", "\033[31m", "\033[33m", "\033[36m", "\033[2m", "\033[1m", "\033[0m") if COLOR else ("",) * 7
NICE = ["nice", "-n", "15"] + (["taskset", "-c", "0"] if shutil.which("taskset") else [])   # no taskset on macOS
TIMEOUT = 300    # seconds for any one tool run (the compile, an encode, a decode): a hung tool fails its case


def run(cmd, timeout=TIMEOUT, **kw):
    cmd = [str(c) for c in cmd]
    try:
        return subprocess.run(NICE + cmd, capture_output=True, text=True, timeout=timeout, **kw)
    except subprocess.TimeoutExpired as e:
        out = e.stdout.decode(errors="replace") if isinstance(e.stdout, bytes) else (e.stdout or "")
        return subprocess.CompletedProcess(cmd, 124, out, f"timed out after {timeout} s: {os.path.basename(cmd[0])}")


def needs_build(binary, sources):
    """The checker binary is rebuilt only when it is missing or older than one of its sources."""
    if not binary.exists():
        return True
    built = binary.stat().st_mtime
    return any(src.stat().st_mtime > built for src in sources)


def write_wav(path, ints, rate, bits, floats=None):
    """ints: frames x channels int array (PCM), or floats for a 32-bit float WAV."""
    data = floats if floats is not None else ints
    frames, channels = data.shape
    if floats is not None:
        payload, tag, width = floats.astype("<f4").tobytes(), 3, 32
    elif bits == 16:
        payload, tag, width = ints.astype("<i2").tobytes(), 1, 16
    else:
        u = ints.astype("<i4").view(np.uint8).reshape(-1, 4)[:, :3]
        payload, tag, width = u.tobytes(), 1, 24
    block = channels * width // 8
    fmt = struct.pack("<HHIIHH", tag, channels, rate, rate * block, block, width)
    body = b"WAVE" + b"fmt " + struct.pack("<I", len(fmt)) + fmt + b"data" + struct.pack("<I", len(payload)) + payload
    path.write_bytes(b"RIFF" + struct.pack("<I", len(body)) + body)


def decode_raw(tool, flac, bits, channels):
    raw = WORK / (flac.stem + "." + tool + ".raw")
    if tool == "flac":
        cmd = ["flac", "-d", "-f", "-s", "--force-raw-format", "--endian=little", "--sign=signed", "-o", raw, flac]
    else:
        fmt = "s16le" if bits == 16 else "s24le"
        cmd = ["ffmpeg", "-v", "error", "-y", "-i", flac, "-f", fmt, "-c:a", "pcm_" + fmt, raw]
    p = run(cmd)
    if p.returncode != 0:
        return None, p.stderr.strip()
    b = raw.read_bytes()
    if bits == 16:
        return np.frombuffer(b, "<i2").astype(np.int32).reshape(-1, channels), ""
    u = np.frombuffer(b, np.uint8).reshape(-1, 3).astype(np.int32)
    v = u[:, 0] | (u[:, 1] << 8) | (u[:, 2] << 16)
    v = np.where(v & 0x800000, v - 0x1000000, v)
    return v.reshape(-1, channels), ""


def cases(rng):
    sr = 48000
    t = np.arange(sr * 10) / sr
    music = (0.45 * np.sin(2 * np.pi * 220 * t) + 0.2 * np.sin(2 * np.pi * 331 * t + 1) +
             0.08 * np.sin(2 * np.pi * 2950 * t) * np.sin(2 * np.pi * 0.5 * t) + 0.01 * rng.standard_normal(t.size))
    right = np.roll(music, 37) * 0.9
    st24 = np.round(np.stack([music, right], 1) * 8388607).astype(np.int32)
    yield "stereo 24-bit tones+noise 10 s", st24, sr, 24, None
    yield "stereo 16-bit", np.round(np.stack([music, right], 1) * 32767).astype(np.int32), sr, 16, None
    yield "mono 24-bit", st24[:, :1].copy(), sr, 24, None
    yield "identical L=R (side is silent)", np.repeat(st24[:, :1], 2, 1), sr, 24, None
    sq = np.where(np.arange(sr * 2) % 2 == 0, 8388607, -8388608).astype(np.int32)
    yield "full-scale square at Nyquist, L=-R", np.stack([sq, -np.clip(sq, -8388607, None)], 1), sr, 24, None
    yield "full-scale white noise", rng.integers(-8388608, 8388608, size=(sr * 2, 2), dtype=np.int64).astype(np.int32), sr, 24, None
    yield "silence", np.zeros((sr * 3, 2), np.int32), sr, 24, None
    yield "one short block (1000 frames)", st24[:1000].copy(), sr, 24, None
    yield "last block of 1 frame (4097)", st24[:4097].copy(), sr, 24, None
    yield "13 frames", st24[:13].copy(), sr, 24, None
    yield "44.1 kHz", st24[:44100 * 3].copy(), 44100, 24, None
    yield "odd rate 37.8 kHz", st24[:37800 * 2].copy(), 37800, 24, None
    six = np.stack([np.roll(music[:sr * 3], k * 11) * (0.9 - 0.1 * k) for k in range(6)], 1)
    yield "5.1, 6 channels", np.round(six * 8388607).astype(np.int32), sr, 24, None
    f = np.stack([music[:sr * 3] * 1.3, right[:sr * 3]], 1).astype(np.float32)   # peaks past full scale
    f[100, 0], f[101, 1] = np.nan, -5.0
    expect = np.round(np.clip(np.nan_to_num(f.astype(np.float64), nan=0.0), -1, 1) * 8388607).astype(np.int32)
    yield "32-bit float in (clipped, NaN)", expect, sr, 24, f


def main():
    t_all = time.time()
    WORK.mkdir(parents=True, exist_ok=True)
    src = ROOT / "tools" / "flac_check.cpp"
    t0 = time.time()
    if needs_build(BIN, [src, ROOT / "build" / "src" / "flac-enc.h"]):
        p = run(["g++", "-O2", "-std=c++17", "-Wall", "-Wextra", "-I", ROOT / "build" / "src", src, "-o", BIN])
        warnings = [line for line in p.stderr.splitlines() if "warning" in line]
        if p.returncode != 0:
            print(f"{R}build failed{X}\n{p.stderr}")
            return 1
        print(f"{B}flac-enc{X}  built {C}{BIN.relative_to(ROOT)}{X} {D}in {time.time() - t0:.1f} s, "
              f"{len(warnings)} warnings{X}")
        for w in warnings[:5]:
            print(f"  {Y}{w}{X}")
    else:
        print(f"{B}flac-enc{X}  {C}{BIN.relative_to(ROOT)}{X} {D}is newer than its sources: not rebuilt{X}")

    passed = failed = 0

    def check(name, ok, detail=""):
        nonlocal passed, failed
        passed += ok
        failed += not ok
        print(f"  {G + 'PASS' if ok else R + 'FAIL'}{X}  {name}{D + '  (' + detail + ')' + X if detail else ''}")

    for label, data in (("empty", b""), ("abc", b"abc"), ("1 MB pattern", bytes(i * 7 % 251 for i in range(1 << 20)))):
        f = WORK / "md5.bin"
        f.write_bytes(data)
        got = run([BIN, "--md5", f]).stdout.strip()
        check(f"MD5 of {label} matches hashlib", got == hashlib.md5(data).hexdigest(), got)

    rng = np.random.default_rng(7)
    rows = []
    for i, (name, ints, rate, bits, floats) in enumerate(cases(rng)):
        wav, out, ref = WORK / f"c{i}.wav", WORK / f"c{i}.flac", WORK / f"c{i}-ref.flac"
        write_wav(wav, ints, rate, bits, floats)
        title, lyrics = f"Case {i} — ünïcödé", "[Verse]\nline one\nline two"
        p = run([BIN, wav, out, title, lyrics])
        if p.returncode != 0:
            check(name, False, "encode failed: " + p.stderr.strip())
            continue
        stats = json.loads(p.stdout)
        problems = []
        t = run(["flac", "-t", "-s", out])
        if t.returncode != 0:
            problems.append("flac -t: " + (t.stderr.strip().splitlines() or ["?"])[-1])
        for tool in ("flac", "ffmpeg"):
            got, err = decode_raw(tool, out, bits, ints.shape[1])
            if got is None:
                problems.append(f"{tool} decode: {err[:120]}")
            elif got.shape != ints.shape or not np.array_equal(got, ints):
                bad = "shape %s vs %s" % (got.shape, ints.shape) if got.shape != ints.shape else \
                    "%d samples differ" % int((got != ints).sum())
                problems.append(f"{tool} decode differs: {bad}")
        tags = run(["metaflac", "--export-tags-to=-", out]).stdout
        if f"TITLE={title}" not in tags or "LYRICS=[Verse]" not in tags:
            problems.append("tags: " + tags.strip()[:120])
        info = run(["metaflac", "--show-sample-rate", "--show-channels", "--show-bps", "--show-total-samples", out]).stdout.split()
        if info != [str(rate), str(ints.shape[1]), str(bits), str(ints.shape[0])]:
            problems.append("STREAMINFO: " + " ".join(info))
        run(["flac", "-5", "-f", "-s", "--no-padding", "-o", ref, wav])
        ref_bytes = ref.stat().st_size if ref.exists() else 0
        wav_bytes = wav.stat().st_size
        check(name, not problems, "; ".join(problems) if problems else
              f"{stats['bytes'] / wav_bytes * 100:.0f}% of WAV, flac -5 " +
              (f"{ref_bytes / wav_bytes * 100:.0f}%" if ref_bytes else "n/a") + f", {stats['ms']:.0f} ms")
        rows.append((name, wav_bytes, stats["bytes"], ref_bytes, stats["ms"], ints.shape[0] / rate))

    if "--no-song" not in sys.argv:
        songs = sorted((ROOT / "outputs").glob("*/audio.wav"), key=lambda p: p.stat().st_mtime)
        if songs:
            song = songs[-1]
            out, ref = WORK / "song.flac", WORK / "song-ref.flac"
            p = run([BIN, song, out, song.parent.name, ""])
            ok = p.returncode == 0 and run(["flac", "-t", "-s", out]).returncode == 0
            stats = json.loads(p.stdout) if p.returncode == 0 else {"bytes": 0, "ms": 0, "bits": 0}
            fl, _ = decode_raw("flac", out, stats["bits"] or 24, 2) if ok else (None, "")
            ff, _ = decode_raw("ffmpeg", out, stats["bits"] or 24, 2) if ok else (None, "")
            # the song's own samples, straight from its WAV through ffmpeg
            direct = WORK / "song.direct.raw"
            fmt = "s16le" if stats["bits"] == 16 else "s24le"
            run(["ffmpeg", "-v", "error", "-y", "-i", song, "-f", fmt, "-c:a", "pcm_" + fmt, direct])
            same = ok and direct.exists() and (WORK / "song.flac.raw").exists() and \
                (WORK / "song.flac.raw").read_bytes() == direct.read_bytes() and fl is not None and np.array_equal(fl, ff)
            t5 = time.time()
            run(["flac", "-5", "-f", "-s", "--no-padding", "-o", ref, song])
            ref_ms = (time.time() - t5) * 1000
            wav_bytes = song.stat().st_size
            seconds = (fl.shape[0] / 48000) if fl is not None else 0
            check(f"your newest song ({song.parent.name}, {seconds:.0f} s, {stats['bits']}-bit)", bool(same),
                  f"{stats['bytes'] / wav_bytes * 100:.0f}% of WAV, flac -5 {ref.stat().st_size / wav_bytes * 100:.0f}%, "
                  f"{stats['ms']:.0f} ms vs flac -5 {ref_ms:.0f} ms" if same else "decode differs from the WAV")
            rows.append(("song", wav_bytes, stats["bytes"], ref.stat().st_size if ref.exists() else 0, stats["ms"], seconds))

    total_wav = sum(r[1] for r in rows)
    total_ours = sum(r[2] for r in rows)
    rows_ref = [r for r in rows if r[3]]
    total_ref = sum(r[3] for r in rows_ref)
    total_wav_ref = sum(r[1] for r in rows_ref)
    audio_s = sum(r[5] for r in rows)
    enc_ms = sum(r[4] for r in rows)
    print(f"\n{B}stats{X}  {len(rows)} files, {audio_s:.0f} s of audio, {total_wav / 1e6:.1f} MB WAV -> "
          f"{C}{total_ours / 1e6:.1f} MB{X} FLAC ({total_ours / max(total_wav, 1) * 100:.0f}%; flac -5 "
          f"{total_ref / max(total_wav_ref, 1) * 100:.0f}% on the files it took), encoded at {audio_s / max(enc_ms / 1000, 1e-9):.0f}x realtime on 1 core")
    print(f"{G if not failed else R}{passed} passed, {failed} failed{X}  {D}{time.time() - t_all:.1f} s{X}")
    if not failed:
        shutil.rmtree(WORK)
    else:
        print(f"  {D}files kept in {WORK.relative_to(ROOT)}{X}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
