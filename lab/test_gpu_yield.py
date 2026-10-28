"""HERESY 1813: a helper on a card leaves it when a job finds no room and its leaving makes the room; it stays when that would not help or while it is busy."""
import gpu_guard as G

state = {"free": 4000, "left": 0, "busy": False}


def snap(root=None):
    return [{"index": 0, "total_mb": 12000, "free_mb": state["free"], "limit_mb": None, "room_mb": state["free"], "share": 0.3, "foreign": [], "ok": True, "why": ""}]


def held():
    return {} if state["busy"] else {0: 7600}


def leave(i):
    state["left"] += 1
    state["free"] += 7600
    return True


G.snapshot = snap
G.YIELD_WAIT_S = 2
G.register_yielder(held, leave)
n = 0


def ok(cond, what):
    global n
    n += 1
    print(("PASS " if cond else "FAIL ") + what)
    assert cond, what


c, _ = G.pick([0], need_mb=9000)
ok(c and c["index"] == 0 and state["left"] == 1, "a job of 9 GB on a card with 4 GB free and the writer's 7.6 GB: the writer leaves, the job gets the card")
state.update(free=4000, left=0)
c, _ = G.pick([0], need_mb=20000)
ok(c is None and state["left"] == 0, "a job its leaving would not fit (20 GB): the writer stays")
state.update(free=4000, left=0, busy=True)
c, _ = G.pick([0], need_mb=9000)
ok(c is None and state["left"] == 0, "while it answers a question the writer stays; the job waits")
state.update(free=4000, left=0, busy=False)
c = G.check(0, 9000)
ok(c["room_mb"] >= 9000 and state["left"] == 1, "a card named by hand (the Trainer's): the writer leaves it too")
state.update(free=10000, left=0)
c, _ = G.pick([0], need_mb=9000)
ok(c and state["left"] == 0, "room enough already: nobody is asked to leave")
print(f"gpu yield: {n} checks passed")
