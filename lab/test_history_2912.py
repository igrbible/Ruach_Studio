"""HERESY 2912: the lab's history of plays and downloads (play_history.py)."""
import json
import tempfile
import time
from pathlib import Path

import play_history as H


def main():
    with tempfile.TemporaryDirectory() as tmp:
        p = Path(tmp) / "history.json"
        assert H.listing(p)["plays"] == [] and not p.exists()
        H.act(p, {"op": "play", "id": "a1", "name": "take-1", "title": "One", "of": 180})
        H.act(p, {"op": "play", "id": "a1", "name": "take-1", "title": "One", "of": 180})          # a retry: once
        assert len(H.listing(p)["plays"]) == 1
        r = H.act(p, {"op": "heard", "id": "a1", "heard": 42.5})["play"]
        assert r["heard"] == 42.5 and not r["through"]
        r = H.act(p, {"op": "heard", "id": "a1", "heard": 10, "through": True, "loops": 2, "left": 179.5})["play"]
        assert r["heard"] == 42.5 and r["through"] and r["loops"] == 2 and r["left"] == 179.5       # heard never goes back
        assert H.act(p, {"op": "heard", "id": "zz", "heard": 1}) == {"play": None}
        H.act(p, {"op": "download", "id": "d1", "name": "take-1", "title": "One", "file": "One.FLAC", "fmt": "FLAC"})
        L = H.listing(p)
        assert L["downloads"][0]["fmt"] == "flac" and L["keep"]["plays"] == {"days": 30, "most": 2000} and L["keep"]["downloads"]["days"] == 90
        # the bounds: older than 30 days goes; no more than 2000, the newest kept
        now = time.time()
        old = [{"id": f"o{i}", "t": now - 31 * 86400, "name": "x"} for i in range(3)]
        many = [{"id": f"m{i}", "t": now - 2100 + i, "name": "x"} for i in range(2100)]
        assert H.act(p, {"op": "import", "plays": old + many})["imported"]["plays"] == 2103
        L = H.listing(p)
        ids = [r["id"] for r in L["plays"]]
        assert len(ids) == 2000 and "o0" not in ids and "m2099" in ids and "m99" not in ids and "a1" in ids, (len(ids), ids[:3])
        assert H.act(p, {"op": "import", "plays": [{"id": "a1", "name": "again"}]})["imported"]["plays"] == 0   # an id kept already: not twice
        assert H.act(p, {"op": "drop", "kind": "plays", "ids": ["a1"]})["dropped"] == 1
        assert H.act(p, {"op": "clear", "kind": "plays"})["cleared"] == {"plays": 1999}
        L = H.listing(p)
        assert L["plays"] == [] and len(L["downloads"]) == 1
        for bad in ({"op": "play", "id": "../x"}, {"op": "clear", "kind": "x"}, {"op": "nope"}):
            try:
                H.act(p, bad)
                raise AssertionError(bad)
            except ValueError:
                pass
        json.load(open(p, encoding="utf-8"))
    import lease
    assert "/history" in lease.OPEN                    # a play heard in a read-only window is still written (heresy-lease.js lists it too)
    print("test_history_2912: ok")


if __name__ == "__main__":
    main()
