#!/usr/bin/env python3
"""Every take of one workspace made again with fresh random seeds (Ruach Studio extras; first used 02.10.2026 on the
instrument probes Viktor's ear rejected: an instrument missing from one seed may come with another). Each new take
keeps its title, goes into the target workspace, and the old one goes to the Librarian's trash (it gives back until
emptied). The request is the take's own, without its music tokens (they would only render the old music again).
The studio must be running; one take at a time, on the studio's card.

    python3 extras/regen-workspace.py "FROM WORKSPACE" "TO WORKSPACE" [--keep]     --keep: leave the old takes where they are"""
import json, random, sys, time, urllib.request
from pathlib import Path

ROOT = Path(__file__).absolute().parent.parent          # the studio root, also through a link to extras/
ENGINE = "http://127.0.0.1:41867"


def call(path, body=None, timeout=60):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(ENGINE + path, data=data, headers={"Content-Type": "application/json"} if data else {},
                                 method="POST" if data is not None else "GET")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode() or "{}")


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) != 2:
        sys.exit(__doc__.split("\n\n")[-1])
    FAILED, TO = args
    keep = "--keep" in sys.argv
    names = json.load(open(ROOT / "user/collection.json", encoding="utf-8"))["workspaces"].get(FAILED, [])
    names = [n for n in names if (ROOT / "outputs" / n / "request.json").is_file()]
    print(f"{len(names)} takes of {FAILED!r} to make again into {TO!r}", flush=True)
    done = 0
    for n in names:
        req = json.load(open(ROOT / "outputs" / n / "request.json", encoding="utf-8"))
        title = req.get("title") or n
        body = {k: v for k, v in req.items() if k not in ("semantic_tokens", "parent")}
        body.update(lm_seed=random.randrange(1, 2 ** 63 - 1), seed=random.randrange(1, 2 ** 63 - 1), plan_only=False, title=title)
        try:
            job = call("/synth", body)
            jid, t0 = str(job.get("id")), time.time()
            while True:
                time.sleep(3)
                st = call(f"/job?id={jid}")
                s = str(st.get("status", "")).lower()
                if s in ("done", "1", "failed", "2", "cancelled", "3") or st.get("takes"):
                    break
                if time.time() - t0 > 900:
                    raise TimeoutError("15 minutes without an end")
            new = [t.get("name") if isinstance(t, dict) else t for t in st.get("takes") or []]
            if not new or s in ("failed", "2", "cancelled", "3"):
                print(f"✗ {title}: the job ended {s or st} {st.get('error', '')}", flush=True)
                continue
            call("/lab/collection", {"op": "ws-add", "workspace": TO, "names": new})
            tr = {"moved": []} if keep else call("/lab/trash", {"op": "move", "names": [n]})
            gone = n in (tr.get("moved") or [])
            done += 1
            print(f"✓ {title}: {new[0]} (music seed {body['lm_seed']}, sound seed {body['seed']}) in {TO}; "
                  f"the old one {'to the trash' if gone else ('kept (--keep)' if keep else 'KEPT: ' + json.dumps(tr))} · {time.time() - t0:.0f} s", flush=True)
        except Exception as e:                                   # said, and the next one goes on
            print(f"✗ {title}: {e}", flush=True)
    print(f"{done} of {len(names)} made again", flush=True)


if __name__ == "__main__":
    sys.exit(main())
