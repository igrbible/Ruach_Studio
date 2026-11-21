"""HERESY 2898: the Studio's writer leaves a CUDA card for a song only when the songs' engine holds that very card (GitHub issue 13: the writer's
model stayed ten minutes and the song ran out of memory). nvidia-smi stood in for; the writer's stop stood in for.
    .venv/bin/python lab/test_writer_yield_cuda_2898.py"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import writer_llm as w  # noqa: E402

ok = 0


def check(cond, what):
    global ok
    assert cond, what
    ok += 1


stopped = []
w.stop = lambda why="": stopped.append(why) or {"running": False}
w._cut = lambda why: None
w._alive = lambda: True
w.time.sleep = lambda s: None
w.S.update(where="cuda", pid=4242, proc=None)
apps = {4242: ("llama-server", "GPU-aaa"), 777: ("/opt/RuachStudio/build/build/yue-server", "GPU-aaa")}
check(w.yield_cuda("the Studio's song", apps) is True and stopped and "gave its card" in stopped[-1], "the engine on the writer's own card: the writer leaves it")
stopped.clear()
apps = {4242: ("llama-server", "GPU-aaa"), 777: ("yue-server", "GPU-bbb")}
check(w.yield_cuda("the Studio's song", apps) is False and not stopped, "the engine on another card: the writer stays")
check(w.yield_cuda("the Studio's song", {4242: ("llama-server", "GPU-aaa")}) is False and not stopped, "no engine on any card: the writer stays")
check(w.yield_cuda("the Studio's song", {}) is False and not stopped, "nvidia-smi silent: the writer stays (nothing done blind)")
w.S.update(where="arc")
check(w.yield_cuda("the Studio's song", {4242: ("llama-server", "GPU-aaa"), 777: ("yue-server", "GPU-aaa")}) is False, "a writer on the Arc is yield_arc's, not this")
w.S.update(where="cuda")
w._alive = lambda: False
check(w.yield_cuda("the Studio's song", {4242: ("llama-server", "GPU-aaa"), 777: ("yue-server", "GPU-aaa")}) is False, "a writer not running: nothing to do")
real = w.subprocess.run
class P:
    stdout = "4242, llama-server, GPU-aaa\n777, yue-server, GPU-aaa\nnot a row\n"
w.subprocess.run = lambda *a, **k: P()
check(w._cuda_apps() == {4242: ("llama-server", "GPU-aaa"), 777: ("yue-server", "GPU-aaa")}, "nvidia-smi's rows read, a stray line left out")
w.subprocess.run = real
print(f"test_writer_yield_cuda_2898: {ok} passed")
