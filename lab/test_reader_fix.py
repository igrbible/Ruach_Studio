"""HERESY 2255–2257: the Reader's new hands without a card, through the real worker on the processor with a made-up engine (a tone a piece, the words
it was given written down). The stresses put in before it reads (Zaliznyak and the user's word, the engine's way of taking them), the style in its
own form before each piece, the open engine's manifest read (its licence, its first-run notice, no seed), its request built without a card; then a
finished take fixed: a piece read again with corrected words, the take joined anew with the untouched pieces bit for bit as they were, the Library's
take rewritten and still never for training, a version picked back, the history undone."""
import gzip, json, re, struct, sys, tempfile, threading, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import numpy as np
import soundfile as sf
import collection
import no_train
import reader as r
import reader_stress as rs

HERE = Path(__file__).resolve().parent
# ---- the open engine's manifest and request, no card
spec = __import__("importlib.util").util.spec_from_file_location("drama3", HERE / "reader_engines/drama3/engine.py")
d3 = __import__("importlib.util").util.module_from_spec(spec)
spec.loader.exec_module(d3)
b = d3.body("Доро́га домой.", {"path": "/x.wav", "text": "слова"}, {"temperature": 0.7, "top_k": 50, "seed": 5})
# HERESY 2263: through audio.cpp: a seed, the clip by path with its words, no top_k (a cap stalls Drama 3 in silence), the acute kept
assert b["seed"] == 5 and b["voice_ref"] == "/x.wav" and b["reference_text"] == "слова" and "top_k" not in b["options"], b
assert b["input"] == "Доро́га домой." and 80 <= b["max_tokens"] <= 1400 and b["model"] == "drama3", b
cfg = d3.config({"device": "cuda", "threads": 16, "model": Path("/m/drama-3-Q8_0.gguf"), "cel": 40}, 9000)
m0 = cfg["models"][0]
assert cfg["backend"] == "cuda" and cfg["port"] == 9000 and m0["family"] == "fish_drama3" and m0["path"] == "/m/drama-3-Q8_0.gguf", cfg
assert m0["session_options"] == {"fish_drama3.cpu_expert_layers": 40, "fish_drama3.context_length": 4096}, m0
assert d3.config({"device": "cpu", "threads": 32, "model": Path("/m.gguf"), "cel": 40}, 9001)["backend"] == "cpu"
h0 = {"device": "cuda", "cel": 36, "retries": 0, "log": Path("/nonexistent"), "log_at": 0}
assert d3._more_banks(h0, RuntimeError("CUDA error: out of memory")) and h0["cel"] == 40 and h0["retries"] == 1, h0
assert not d3._more_banks(h0, RuntimeError("CUDA error: out of memory")), h0           # all 40 in RAM already: said, not tried again
assert not d3._more_banks({"device": "cuda", "cel": 4, "retries": 0, "log": Path("/nonexistent")}, RuntimeError("a refusal of another kind"))

with tempfile.TemporaryDirectory() as tmp:
    kit = Path(tmp)
    zd = rs.paths.at(rs.paths.NARRATOR, kit) / "dicts" / "ru" / "zaliznyak"   # HERESY 2330
    zd.mkdir(parents=True)
    arts = sorted([("дорога", "доро́га, доро́ги"), ("замок", "замо́к"), ("замок", "за́мок"), ("голос", "го́лос, го́лоса")])
    data, idx = b"", b""
    for h, a in arts:
        idx += h.encode() + b"\0" + struct.pack(">II", len(data), len(a.encode()))
        data += a.encode()
    (zd / "p.idx").write_bytes(idx)
    (zd / "p.dict.dz").write_bytes(gzip.compress(data))
    eng = kit / "user/reader/engines/fake"
    eng.mkdir(parents=True)
    (eng / "engine.py").write_text(
        "import numpy as np, hashlib\n"
        "def load(device, kit):\n    return {'kit': kit}\n"
        "def reference(h, wav, sr, text):\n    return {'n': len(wav)}\n"
        "def say(h, text, ref, opts):\n"
        "    open(h['kit'] + '/said.txt', 'a', encoding='utf-8').write(text + '\\n')\n"
        "    n = int(24000 * (0.6 + 0.04 * len(text)))\n"
        "    f = 150.0 + int(hashlib.md5(text.encode()).hexdigest()[:2], 16)\n"
        "    return (0.25 * np.sin(2 * np.pi * f * np.arange(n) / 24000)).astype(np.float32), 24000\n")
    j = json.load(open(HERE / "reader_engines/drama3/engine.json"))
    j.update(id="fake", label="Fake · test", python={"cpu": sys.executable}, need_mb=100, sample_rate=24000)
    j.pop("stress_lang", None)                            # HERESY 2454 gave Drama 3 the capitals for Russian; this fake tests the acute path
    j.pop("tiers", None)                                  # HERESY 2263: the fake reads on the processor as it is, no quant to pick
    json.dump(j, open(eng / "engine.json", "w"))
    said, jobs, lock = [], {}, threading.Lock()

    class Cancelled(Exception):
        pass

    class Turn:
        def __init__(self, job):
            self.job = job

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

    outputs, cfg = kit / "outputs", kit / "user"
    outputs.mkdir()
    r.setup(kit=kit, jobs=jobs, lock=lock, wait_card=None, turn=Turn, free_gpu=None, say=said.append, outputs=outputs, config_dir=lambda: cfg,
            collection=collection, slug=lambda s: "-".join(s.lower().split())[:40] or "x", gpus_state=lambda: {"cards": [], "roles": {"jobs": []}, "arc": []},
            studio_now=lambda: None, engine_url="http://127.0.0.1:9", unload_engine=lambda why: 0, cancelled=Cancelled)
    for _ in range(100):
        if rs.zaliznyak_state() == "ready":
            break
        time.sleep(0.05)
    e = r.engines_public()["engines"][0]
    # the open engines first in the list; the fake one (a user's) after Drama 3's own manifest
    fake = [x for x in r.engines_public()["engines"] if x["id"] == "fake"][0]
    assert fake["seed"] is True and fake["top_k"] is False and fake["stress"] == "acute" and fake["style"]["kind"] == "bracket" and fake["license"]["credit"] == "Built with Fish Audio", fake
    assert "22 GB" in fake["first_run"] and fake["tiers"] == [], fake
    assert any(x["id"] == "drama3" and not x["ready"]["cuda"] for x in r.engines_public()["engines"])   # its venv is not in this kit
    # ---- style: its own form, refused where it does not fit
    fe = r._engine("fake")
    assert r._style(fe, " calm,  warm ") == "[calm, warm]" and r._style(fe, "") == ""
    try:
        r._style(fe, "x" * 200)
        raise AssertionError("a style over the limit taken")
    except ValueError:
        pass
    # ---- the preview: the marks shown, the homograph named
    pv = r.stress_preview({"text": "Дорога. Замок.", "engine": "fake"})
    assert pv["text"] == "Доро́га. Замок." and pv["homographs"][0]["word"] == "замок" and pv["lang"] == "ru", pv
    # ---- a run: stresses and the style before each piece
    rs.dict_set({"lang": "ru", "word": "замок", "form": "зам+ок"})
    text = "Первая фраза держит голос дорогой и долгой. Замок открыт.\n\nТретья фраза про голос."
    res = r.say({"mode": "narration", "text": text, "card": "cpu", "engine": "fake", "style": "calm narration", "seed": 3})
    for _ in range(600):
        if "reader:" + res["id"] not in jobs:
            break
        time.sleep(0.1)
    d = r.runs_home() / res["id"]
    run = json.load(open(d / "run.json", encoding="utf-8"))
    assert run["status"] == "done", (run.get("error"), said[-4:])
    got = (kit / "said.txt").read_text(encoding="utf-8").splitlines()
    assert got[0].startswith("[calm narration] Первая") and "замо́к" in got[0].lower() and "го́лос" in got[1], got
    assert run["stress_report"]["user"] == 1 and run["lang"] == "ru" and run["anchors"] == {"": 0}, run["stress_report"]
    take0, sr = sf.read(str(d / "take.wav"), dtype="float32")
    at = [p["at"] for p in run["pieces"]]
    lib = outputs / run["take"] / "audio.wav"
    # ---- a piece read again: corrected words, the take joined anew, the rest bit for bit
    rd = r.run_detail(res["id"])
    assert [p["v"] for p in rd["pieces"]] == [0, 0] and rd["fixing"] is None, rd
    f = r.fix({"id": res["id"], "piece": 1, "text": "Третья фраза про г+олос, исправленная."})
    assert f["status"] == "queued" and "го́лос" in f["said"] and f["said"].startswith("[calm narration]"), f
    try:
        r.fix({"id": res["id"], "piece": 0})
        raise AssertionError("two fixes of one take at once")
    except ValueError:
        pass
    for _ in range(600):
        if "reader:" + res["id"] + "~fix" not in jobs:
            break
        time.sleep(0.1)
    rd = r.run_detail(res["id"])
    assert rd["pieces"][1]["v"] == 1 and [x["v"] for x in rd["pieces"][1]["versions"]] == [0, 1] and len(rd["fixes"]) == 1, (rd, said[-4:])
    assert (d / "piece-001.v1.wav").is_file() and rd["pieces"][1]["text"].endswith("исправленная.")
    take1, _ = sf.read(str(d / "take.wav"), dtype="float32")
    n0 = int(round(at[0][1] * sr))
    assert np.array_equal(take0[:n0], take1[:n0]), "the untouched piece changed"
    assert abs(len(take1) - len(take0)) > sr * 0.2                            # the longer words, a longer take
    assert no_train.of_file(lib) and no_train.of_take(outputs / run["take"])
    meta = json.load(open(outputs / run["take"] / "meta.json"))
    assert abs(meta["seconds"] - len(take1) / sr) < 0.05 and meta.get("edited"), meta
    assert r.runs()["runs"][0]["fixes"] == 1
    assert str(r.file(res["id"], "piece-001.v1.wav")).endswith("piece-001.v1.wav")
    # ---- picked back, then undone: the take as it first was
    rd = r.fix_pick({"id": res["id"], "piece": 1, "v": 0})
    t2, _ = sf.read(str(d / "take.wav"), dtype="float32")
    assert rd["pieces"][1]["v"] == 0 and np.array_equal(t2, take0) and len(rd["fixes"]) == 2, len(rd["fixes"])
    rd = r.fix_undo({"id": res["id"]})
    assert rd["pieces"][1]["v"] == 1 and len(rd["fixes"]) == 1
    rd = r.fix_undo({"id": res["id"]})
    t3, _ = sf.read(str(d / "take.wav"), dtype="float32")
    assert rd["pieces"][1]["v"] == 0 and np.array_equal(t3, take0) and not rd["fixes"]
    try:
        r.fix_undo({"id": res["id"]})
        raise AssertionError("an empty history undone")
    except ValueError:
        pass
    try:
        r.fix_pick({"id": res["id"], "piece": 1, "v": 9})
        raise AssertionError("a version that is not there picked")
    except ValueError:
        pass
    r.unload()
    if rs.Z["con"] is not None:
        rs.Z["con"].close()
        rs.Z["con"] = None
print("test_reader_fix: ok")
