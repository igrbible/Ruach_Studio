"""HERESY 2699: the scene without a card: turns gathered (three voices, the characters, a pause ends a scene, a turn never cut), each turn's
speaker tag and the style once, the engine's references, the manifest reaching the lab. .venv/bin/python lab/test_reader_scene_2699.py"""
import importlib.util
import json
import sys
from pathlib import Path

LAB = Path(__file__).resolve().parent
sys.path.insert(0, str(LAB))
import reader  # noqa: E402

reader.H.setdefault("kit", str(LAB.parent))
fails = 0


def check(name, ok, detail=""):
    global fails
    fails += not ok
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else "  (" + str(detail) + ")"))


def turn(i, spk, words, pause=None):
    p = {"i": i, "speaker": spk, "text": words, "said": "calm " + words, "plain": words, "gap": 0.45}
    if pause is not None:
        p["pause"] = pause
    return p


ps = [turn(0, "Анна", "Ты пришёл."), turn(1, "Пётр", "Пришёл."), turn(2, "Анна", "Зачем?"), turn(3, "Мать", "Тише вы."),
      turn(4, "Сын", "Я здесь."), turn(5, "Анна", "Наконец.", pause=2.0), turn(6, "Пётр", "Идём.")]
sc = reader.scenes_of(ps, 3, 1200, "calm")
check("three voices a scene: Анна, Пётр, Мать; then Сын, Анна (the pause ends it); then Пётр", [s["speakers"] for s in sc] == [["Анна", "Пётр", "Мать"], ["Сын", "Анна"], ["Пётр"]], [s["speakers"] for s in sc])
check("each turn after its speaker's tag, the style once in front", sc[0]["said"] == "calm <|speaker:0|> Ты пришёл. <|speaker:1|> Пришёл. <|speaker:0|> Зачем? <|speaker:2|> Тише вы.", sc[0]["said"])
check("the turns kept by their indices; the pause after its scene", sc[1]["turns"] == [4, 5] and sc[1]["pause"] == 2.0 and sc[2]["i"] == 2, sc[1])
check("the characters cut a scene between turns, never inside one", [len(s["turns"]) for s in reader.scenes_of(ps[:3], 3, 20, "")] == [2, 1], [s["turns"] for s in reader.scenes_of(ps[:3], 3, 20, "")])
spec = importlib.util.spec_from_file_location("drama_engine", LAB / "reader_engines" / "drama3" / "engine.py")
E = importlib.util.module_from_spec(spec)
spec.loader.exec_module(E)
b = E.body("<|speaker:0|> Ты. <|speaker:1|> Я.", None, {"references": [{"text": "<|speaker:0|> образец", "audio_path": "/v/a.wav"}, {"text": "<|speaker:1|> другой", "audio_path": "/v/b.wav"}]})
refs = json.loads(b["options"]["references"])
check("the engine sends each voice's sample with its speaker's tag, no single voice_ref", [r["text"].split()[0] for r in refs] == ["<|speaker:0|>", "<|speaker:1|>"] and "voice_ref" not in b, b["options"])
dr = reader._engine_of(LAB / "reader_engines" / "drama3", False)
hg = reader._engine_of(LAB / "reader_engines" / "higgs", False)
check("the lab's Drama 3 reads a scene of three voices; Higgs none", dr["scene"] == {"voices": 3} and hg["scene"] is None, (dr.get("scene"), hg.get("scene")))
print("all ok" if not fails else f"{fails} failed")
sys.exit(1 if fails else 0)
