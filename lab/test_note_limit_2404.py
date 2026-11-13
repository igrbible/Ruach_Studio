"""HERESY 2404 (Viktor 11.11.2026: notes 600 → 1200 characters, «Не жалко»; 2438, 12.11.2026: 6000): a workspace's note and an adapter's take 6000 characters and refuse
6001, saying the limit; a take's own note keeps 6000 too. The page's fields and dialogs say the same 6000 (the suite's part «Notes, 6000»).
python3 lab/test_note_limit_2404.py"""
import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import collection as C  # noqa: E402

bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got) + ")"))
    if not ok:
        bad.append(what)


with tempfile.TemporaryDirectory() as tmp:
    kit = Path(tmp)
    cfg, out = kit / "user", kit / "outputs"
    cfg.mkdir()
    (out / "t1").mkdir(parents=True)
    (out / "t1" / "meta.json").write_text(json.dumps({"title": "t1", "created": 1}), encoding="utf-8")
    post = lambda body: C.collection_post(cfg, out, body)   # noqa: E731

    def refused(body):
        try:
            post(body)
        except ValueError as e:
            return str(e)
        return ""

    check("the limit is 6000", C.NOTE_MAX == 6000, C.NOTE_MAX)
    post({"op": "ws-create", "workspace": "W"})
    check("a workspace's note of 6000 characters is kept", not refused({"op": "ws-note", "workspace": "W", "text": "n" * 6000}))
    check("  whole", C.load(cfg)["ws_notes"].get("W") == "n" * 6000, len(C.load(cfg)["ws_notes"].get("W", "")))
    why = refused({"op": "ws-note", "workspace": "W", "text": "n" * 6001})
    check("6001 is refused, the limit said", "6000 characters at most" in why and "6001 given" in why, why)
    check("  the note kept as it was", C.load(cfg)["ws_notes"].get("W") == "n" * 6000)
    check("an adapter's note of 6000 is kept", not refused({"op": "lora-note", "id": "voice/a.safetensors", "text": "a" * 6000}))
    why = refused({"op": "lora-note", "id": "voice/a.safetensors", "text": "a" * 6001})
    check("  6001 refused", "6000 characters at most" in why, why)
    post({"op": "note", "names": ["t1"], "text": "t" * 3000})
    check("a take's own note keeps its 4000 (3000 kept whole)", len(C.load(cfg)["notes"].get("t1", "")) == 3000, len(C.load(cfg)["notes"].get("t1", "")))

print(("FAILED " + str(len(bad))) if bad else "all ok")
sys.exit(1 if bad else 0)
