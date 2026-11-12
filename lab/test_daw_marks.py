"""HERESY 2201: the markers of your own (the DAW's K, 2016) in the REAPER project and the DAWproject, beside the sections;
names exactly as typed (Decision D07), refused ones counted. A take made in a temp folder: two seconds of sine. python3 lab/test_daw_marks.py"""
import json
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import dawproject  # noqa: E402
import rpp  # noqa: E402

bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got) + ")"))
    if not ok:
        bad.append(what)


got, refused = rpp.user_marks([{"t": 1.25, "name": "Drop"}, {"t": 0.5, "name": "=SUM(A1)"}, {"t": -1}, {"t": "x"}, {"name": "no time"}, None, {"t": float("nan")}])
check("read: sorted by time, the formula-like name kept as typed", got == [(0.5, "=SUM(A1)"), (1.25, "Drop")], got)
check("read: five without a time refused and counted", refused == 5, refused)
check("read: nothing sent says nothing", rpp.user_marks(None) == ([], 0) and rpp.marks_said([], 0) == "")
check("read: not a list is refused aloud", rpp.user_marks({"t": 1}) == ([], 1) and "1 refused" in rpp.marks_said([], 1))
many, over = rpp.user_marks([{"t": i, "name": str(i)} for i in range(70)])
check("read: 64 at most, the rest counted", len(many) == 64 and over == 6, (len(many), over))
check("read: a name cut at 40 characters", rpp.user_marks([{"t": 1, "name": "x" * 50}])[0][0][1] == "x" * 40)

odd = rpp._marker(3, 2.0, "a \"b\" 'c' `d`")
check("RPP: a name with all three quote kinds goes whole in MARKER_TEXT, as REAPER writes it", odd[0].startswith("MARKER 3 2.000 ") and odd[0].endswith(" 0 0 1 B {" + odd[0].split("{")[1].split("}")[0] + "} 0 2") and odd[1:] == ["<MARKER_TEXT", "|a \"b\" 'c' `d`", ">"], odd)
check("RPP: any other name is one line", rpp._marker(1, 1.0, "it's `x`") == ["MARKER 1 1.000 \"it's `x`\" 0"], rpp._marker(1, 1.0, "it's `x`"))

with tempfile.TemporaryDirectory() as tmp:
    out, cache = Path(tmp) / "outputs", Path(tmp) / "cache"
    take = out / "t1"
    take.mkdir(parents=True)
    cache.mkdir()
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=2", str(take / "audio.wav")], check=True)
    json.dump({"title": "Marks test"}, open(take / "meta.json", "w"))
    json.dump({"lyrics": "[Verse]\nline one\n[Chorus]\nline two", "style": "pop, 120 bpm"}, open(take / "request.json", "w"))
    json.dump({"rows": [{"text": "line one", "start": 0.2, "end": 0.9}, {"text": "line two", "start": 1.0, "end": 1.8}]}, open(cache / "t1.timing.json", "w"))
    marks = [{"t": 0.75, "name": 'Say "hi"'}, {"t": 1.5, "name": "=1+1"}, {"t": -3, "name": "gone"}]

    z, info = rpp.build(None, out, "t1", cache=cache, marks=marks)
    text = zipfile.ZipFile(z).read("Marks_test/Marks_test.RPP").decode("utf-8")
    lines = [ln.strip() for ln in text.splitlines() if ln.strip().startswith("MARKER")]
    check("RPP: the two sections stay regions (flag 1), four lines", sum(1 for ln in lines if ln.endswith(" 1")) == 4, lines)
    check("RPP: your markers as plain markers (flag 0), names as typed", 'MARKER 1 0.750 \'Say "hi"\' 0' in lines and 'MARKER 2 1.500 "=1+1" 0' in lines, lines)
    check("RPP: the answer counts them and says the refused one", info["marks"] == 2 and "2 markers of yours (1 refused)" in info["said"], info)
    z2, info2 = rpp.build(None, out, "t1", cache=cache)
    t2 = zipfile.ZipFile(z2).read("Marks_test/Marks_test.RPP").decode("utf-8")
    check("RPP: without markers sent, as before: no plain marker, no line in the answer", " 0\n" not in "".join(ln + "\n" for ln in t2.splitlines() if "MARKER" in ln) and info2["marks"] == 0 and len(info2["said"]) == 3, info2)

    p, dinfo = dawproject.build(None, out, "t1", cache=cache, marks=marks)
    xml = zipfile.ZipFile(p).read("project.xml").decode("utf-8")
    ms = [ln.strip() for ln in xml.splitlines() if "<Marker " in ln]
    names = [m.split('name=')[1].split(' color=')[0] for m in ms]
    check("DAWproject: sections and your markers in one Markers, in time order", names == ['"Verse"', "'Say \"hi\"'", '"Chorus"', '"=1+1"'], names)
    check("DAWproject: yours red, the sections grey", sum('color="#e05d5d"' in m for m in ms) == 2 and sum('color="#9e9e9e"' in m for m in ms) == 2, ms)
    check("DAWproject: the answer counts them", dinfo["marks"] == 2 and "2 markers of yours (1 refused)" in dinfo["said"], dinfo)
    try:
        from xml.dom.minidom import parseString
        parseString(xml.encode("utf-8"))
        check("DAWproject: project.xml parses", True)
    except Exception as e:  # noqa: BLE001
        check("DAWproject: project.xml parses", False, e)
    p2, dinfo2 = dawproject.build(None, out, "t1", cache=cache)
    xml2 = zipfile.ZipFile(p2).read("project.xml").decode("utf-8")
    check("DAWproject: without markers sent, the sections alone as before", xml2.count("<Marker ") == 2 and dinfo2["marks"] == 0 and len(dinfo2["said"]) == 3, dinfo2)

print("FAILED: " + ", ".join(bad) if bad else "ALL OK")
sys.exit(1 if bad else 0)
