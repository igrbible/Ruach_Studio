"""HERESY 2661 (Viktor 17.11.2026: «Обязательно разводим «🚨 IMPORTED»»): an import lands on its scope's own shelf: the default scope's
🚨 IMPORTED as ever, a page opened with ?scope=NAME on «🚨 IMPORTED · NAME», two scopes never on each other's; a bad scope refused before a
take's folder is made. No lab server, no card: import_track in a temporary Studio.
    python3 lab/test_import_scope_2661.py"""
import importlib.util
import io
import json
import shutil
import sys
import tempfile
import wave
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
fails = 0


def check(what, ok, said=""):
    global fails
    fails += not ok
    print(("PASS " if ok else "FAIL ") + what + ("" if ok else f"  ({said})"))


def wav_bytes():
    b = io.BytesIO()
    w = wave.open(b, "wb")
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(48000)
    w.writeframes(b"\x00\x00" * 2 * 48000)
    w.close()
    return b.getvalue()


tmp = Path(tempfile.mkdtemp(prefix="imp2661-"))
spec = importlib.util.spec_from_file_location("lab_under_test", HERE / "lab.py")
lab = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lab)
lab.OUTPUTS = tmp / "outputs"
lab.USER_DIR = tmp / "user"
lab.USER_DIR.mkdir(parents=True)
(lab.USER_DIR / "settings.json").write_text("{}")
try:
    body = wav_bytes()
    a = lab.import_track("a.wav", "own", body)
    b = lab.import_track("b.wav", "probe", body, scope="claude")
    c = lab.import_track("c.wav", "second", body, scope="second_profile")
    check("the default scope lands on 🚨 IMPORTED", a.get("workspace") == lab.IMPORTED, a)
    check("a scope lands on its own shelf", b.get("workspace") == lab.IMPORTED + " · claude", b)
    check("another scope on its own", c.get("workspace") == lab.IMPORTED + " · second_profile", c)
    ws = json.load(open(lab.USER_DIR / "collection.json", encoding="utf-8"))["workspaces"]
    members = {k: (v.get("takes") if isinstance(v, dict) else v) for k, v in ws.items()}
    flat = json.dumps(members, ensure_ascii=False)
    own = json.dumps(members.get(lab.IMPORTED), ensure_ascii=False)
    check("the owner's shelf holds only his import", a["name"] in own and b["name"] not in own and c["name"] not in own, own)
    cl = json.dumps(members.get(lab.IMPORTED + " · claude"), ensure_ascii=False)
    check("the scope's shelf holds only its import", b["name"] in cl and a["name"] not in cl and c["name"] not in cl, cl)
    check("every import is on some shelf", all(x["name"] in flat for x in (a, b, c)), flat)
    before = sorted(p.name for p in lab.OUTPUTS.iterdir())
    try:
        lab.import_track("d.wav", "bad", body, scope="../x")
        check("a bad scope refused", False, "taken")
    except ValueError as e:
        check("a bad scope refused", "scope" in str(e), e)
    check("and nothing made for it", sorted(p.name for p in lab.OUTPUTS.iterdir()) == before)
finally:
    shutil.rmtree(tmp, ignore_errors=True)
print("FAILS", fails)
sys.exit(1 if fails else 0)
