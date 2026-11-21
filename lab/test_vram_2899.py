"""HERESY 2899: the bar's Unload over everything the Studio holds in a card's memory (GitHub issue 13): vram.held lists each room's holder with its
card, its memory and whether it works; vram.release lets the asked ones go, a busy one never, an engine that does not apply it said as busy, an
unknown id said. The rooms, nvidia-smi and the engine stood in for.
    .venv/bin/python lab/test_vram_2899.py"""
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import vram  # noqa: E402
import writer_llm  # noqa: E402
import reader  # noqa: E402
import artist  # noqa: E402
import h3_shots  # noqa: E402

ok = 0


def check(cond, what):
    global ok
    assert cond, what
    ok += 1


me = os.getpid()
vram._cuda = lambda: {me: 1000}                          # every stand-in process is this one: its session holds 1000 MiB
eng = {"hw": {"loaded_modules": 3, "loaded_bytes": 4 * 2 ** 30, "busy": False, "gpus": [{"name": "SYCL0", "description": "Intel(R) Arc(TM) Pro B50"}]}, "unload": []}
vram._engine = lambda: eng["hw"]
writer_llm.status = lambda kit: {"running": True, "where": "cuda", "gpu": 0, "variant": "Qwen3.5-9B", "busy": False}
writer_llm.S.update(pid=me, proc=None)
stops = []
writer_llm.stop = lambda why="": stops.append(why) or {"running": False}


class P:
    pid = me


class Wk:
    def __init__(self, busy):
        self.device, self.card, self.label, self.busy, self.p = "cuda", 1, "Fish Audio Drama 3", busy, P()

    def alive(self):
        return True


reader.W["w"] = Wk(False)
reader.unload = lambda: {"ok": True, "freed": True}


class Pt:
    def __init__(self, gpu, busy):
        self.gpu, self.painter, self.busy, self.p = gpu, "Qwen Image", busy, P()

    def alive(self):
        return True


painters = [Pt(1, False), Pt(2, True)]
artist.kept = lambda: painters
released = []
artist.release_idle = lambda why, gpu=None: released.append(gpu) or [{"gpu": gpu, "painter": "Qwen Image"}]
h3_shots.workers = lambda kit: [{"gpu": 2, "kind": "fast", "alive": True, "status": "ready", "queued": 0, "running": 0}]
h3_shots._alive = lambda sp: {"pid": me}
h3_shots._root = lambda kit: Path("/nowhere")
h3_shots.release_idle = lambda kit, wait=45: [2]

h = vram.held("/kit")
ids = [x["id"] for x in h]
check(ids == ["engine", "writer", "narrator", "artist:1", "artist:2", "video:2-fast"], f"every room's holder listed ({ids})")
check(h[0]["mb"] == 4096 and h[0]["device"] == "Intel Arc" and not h[0]["heavy"], f"the engine: its loaded memory, its card ({h[0]})")
check(h[1]["mb"] == 1000 and h[1]["device"] == "GPU 0" and not h[1]["heavy"] and h[2]["room"] == "Narrator" and not h[2]["heavy"], "the Writer and the Narrator light, their memory read by their session")
check(h[3]["heavy"] and h[5]["heavy"] and h[4]["busy"] and not h[3]["busy"], "the Artist's and the Videographer's heavy; a painter at work busy")


class R:
    def __init__(self, applied):
        self.applied = applied

    def __enter__(self):
        import io
        import json
        return io.BytesIO(json.dumps({"applied": self.applied, "freed_mb": 4100}).encode())

    def __exit__(self, *a):
        return False


applied = {"v": True}
vram.urllib.request.urlopen = lambda req, timeout=10: R(applied["v"])
r = vram.release("/kit", ["engine", "writer", "narrator"])
check([x["id"] for x in r["freed"]] == ["engine", "writer", "narrator"] and r["freed"][0]["mb"] == 4100 and stops, f"the light ones let go, the engine's own count of what it freed ({r})")
r = vram.release("/kit", ["artist:1", "artist:2", "video:2-fast", "nothing:9"])
check([x["id"] for x in r["freed"]] == ["artist:1", "video:2-fast"] and [x["id"] for x in r["busy"]] == ["artist:2"] and released == [1] and r["unknown"] == ["nothing:9"],
      f"the heavy ones asked: the idle let go, the busy painter never, an unknown id said ({r})")
applied["v"] = False
r = vram.release("/kit", ["engine"])
check(not r["freed"] and r["busy"][0]["id"] == "engine", "an engine that does not apply it (a song running): said as busy, never as freed")
eng["hw"] = {"loaded_modules": 0, "loaded_bytes": 0, "busy": False, "gpus": []}
writer_llm.status = lambda kit: {"running": False}
reader.W["w"] = None
painters.clear()
h3_shots.workers = lambda kit: []
check(vram.held("/kit") == [], "nothing held: nothing listed")
print(f"test_vram_2899: {ok} passed")
