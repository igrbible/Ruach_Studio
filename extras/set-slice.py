#!/usr/bin/env python3
"""A slice of a training set (Ruach Studio extras; the starter samples were cut with it): one singer, plain
singing first (GTSinger's Control groups), then the rest, taken round the songs so that every song is heard,
until the size is reached. Copies each track's WAV with its .txt (lyrics) and .style.txt, and the set's *.md.

    python3 extras/set-slice.py SRC DST [--prefix RU-Alto-1] [--mb 100]

Works on any folder of datasets/raw/ whose files are named PREFIX_SONG_…_GROUP.wav (as lab/gtsinger.py writes
them); for other sets, --prefix "" takes every track and "song" is the name up to the last three parts."""
import argparse, collections, shutil, sys
from pathlib import Path


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("src"); ap.add_argument("dst")
    ap.add_argument("--prefix", default="", help="the singer, e.g. RU-Alto-1 (empty: every track)")
    ap.add_argument("--mb", type=float, default=100, help="the size of the slice, MB (100)")
    a = ap.parse_args()
    src, dst, budget = Path(a.src), Path(a.dst), int(a.mb * 1_000_000)
    wavs = sorted(src.glob((a.prefix + "_" if a.prefix else "") + "*.wav"))
    if not wavs:
        sys.exit(f"no tracks in {src} for prefix {a.prefix!r}")
    if dst.exists():
        sys.exit(f"{dst} is already there: pick another name")
    by_song = collections.OrderedDict()
    for w in wavs:
        by_song.setdefault(w.stem.rsplit("_", 3)[0], []).append(w)
    for k in by_song:
        by_song[k].sort(key=lambda p: (0 if "Control_Group" in p.name else 1, p.name))
    picked, size = [], 0
    while any(by_song.values()):
        for k in list(by_song):
            if not by_song[k]:
                continue
            w = by_song[k].pop(0)
            s = w.stat().st_size
            if size + s > budget:
                by_song[k] = []
                continue
            picked.append(w); size += s
    dst.mkdir(parents=True)
    for w in picked:
        for f in (w, w.with_suffix(".txt"), w.with_name(w.stem + ".style.txt")):
            if f.exists():
                shutil.copy2(f, dst / f.name)
    for md in src.glob("*.md"):
        shutil.copy2(md, dst / md.name)
    print(f"{dst}: {len(picked)} tracks from {len({p.stem.rsplit('_', 3)[0] for p in picked})} songs, {size / 1e6:.0f} MB")


if __name__ == "__main__":
    main()
