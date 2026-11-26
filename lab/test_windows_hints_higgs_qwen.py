"""HERESY 3007 (the Windows tools' critic of 25.11.2026: «Windows users are told to run bash»): what the Studio tells a Windows person to do for
the Narrator's Higgs TTS 3 and a missing Qwen painter is the Windows way, Engine → Models and LoRAs, not a bash script; Linux keeps its words.
And Higgs's own Python, .venv-read/bin/python in its manifest, is read as .venv-read\\Scripts\\python.exe on Windows (winx.native, 2934): it
was «not set up» there however it was made. Offline; Windows played by the modules' NT and winx.NT.
    .venv/bin/python lab/test_windows_hints_higgs_qwen.py"""
import contextlib
import json
import sys
import tempfile
from pathlib import Path

sys.dont_write_bytecode = True
LAB = Path(__file__).resolve().parent
sys.path.insert(0, str(LAB))
import reader  # noqa: E402
import winx  # noqa: E402

ok = 0


def check(cond, what):
    global ok
    if not cond:
        print("FAIL", what)
        sys.exit(1)
    ok += 1
    print("ok  ", what)


@contextlib.contextmanager
def patched(*items):
    was = [(o, n, getattr(o, n)) for o, n, _ in items]
    for o, n, v in items:
        setattr(o, n, v)
    try:
        yield
    finally:
        for o, n, v in was:
            setattr(o, n, v)


man = json.loads((LAB / "reader_engines" / "higgs" / "engine.json").read_text(encoding="utf-8"))
py = next(n for n in man["needs"] if n["id"] == "python")
check("bash" not in py["say_nt"] and "Engine → Models and LoRAs → Narrator · Higgs TTS 3" in py["say_nt"] and len(py["say_nt"]) <= 160,
      "Higgs's Python, missing on Windows: Engine → Models and LoRAs, no bash, within what reader.py keeps")
check("bash" not in man["setup"]["command_nt"] and len(man["setup"]["command_nt"]) <= 120, "Higgs's setup on Windows: no bash, within 120")
weights_src = (LAB / "weights.py").read_text(encoding="utf-8")
check('"label": "Narrator · Higgs TTS 3 (Boson AI)"' in weights_src and '"label": "Qwen painters"' in weights_src,
      "the parts the words name are Engine → Models' own («Narrator · Higgs TTS 3 (Boson AI)», «Qwen painters»)")
with tempfile.TemporaryDirectory() as t:
    k = Path(t) / "Ruach Studio Тест" / "Тестер Иванов"
    (k / ".venv-read" / "Scripts").mkdir(parents=True)
    (k / ".venv-read" / "Scripts" / "python.exe").write_bytes(b"MZ")
    with patched((reader, "kit", lambda: k), (reader, "NT", True), (winx, "NT", True)):
        miss = reader._missing([py], [])
        check(miss == [], "Windows: .venv-read\\Scripts\\python.exe made is Higgs's Python here (it was «not set up»)")
        (k / ".venv-read" / "Scripts" / "python.exe").unlink()
        check(reader._missing([py], []) == [{"id": "python", "say": py["say_nt"]}], "Windows, none made: its Windows words")
        check(reader._setup_of(man["setup"])["command"] == man["setup"]["command_nt"], "Windows: Higgs's setup is Engine → Models")
    with patched((reader, "kit", lambda: k), (reader, "NT", False), (winx, "NT", False)):
        check(reader._missing([py], []) == [{"id": "python", "say": py["say"]}] and "bash tools/narrator-higgs-setup.sh" in py["say"],
              "Linux, none made: its words unchanged")
        (k / ".venv-read" / "bin").mkdir()
        (k / ".venv-read" / "bin" / "python").write_bytes(b"")
        check(reader._missing([py], []) == [] and reader._setup_of(man["setup"])["command"] == "bash tools/narrator-higgs-setup.sh",
              "Linux: bin/python is its Python, the setup bash's")

src = (LAB / "artist.py").read_text(encoding="utf-8")
check(src.count('is not on this machine (" + FETCH_QWEN + ")")') == 2 and 'else "") + " (" + FETCH_QWEN + ")")' in src
      and "(heresy/fetch-heresy.sh)\")" not in src, "artist.py: the three refusals of a missing Qwen painter say FETCH_QWEN")
import artist  # noqa: E402
check(artist.FETCH_QWEN == "heresy/fetch-heresy.sh", "Linux: heresy/fetch-heresy.sh, as before")
check('FETCH_QWEN = "Engine → Models and LoRAs → Qwen painters" if os.name == "nt" else "heresy/fetch-heresy.sh"' in src,
      "Windows: Engine → Models and LoRAs → Qwen painters")
print(f"{ok} passed")
