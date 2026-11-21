"""HERESY 2905, once: every song history of the Musician (writer-versions/, one book per root title) with no Writer document of its own gets one:
its branches' last versions in their time order, the newest the document's text and the older ones its versions, the takes of all of them linked.
A song that has a document already (the Musician's realm, the same title without its version: «Как закалялся кремний», 16cbb834f179) is skipped.
Nothing is written over: new documents only, their ids kept in writer/.backfill-2905.manifest.
    python3 lab/writer_backfill_2905.py            what it would make
    python3 lab/writer_backfill_2905.py --apply    make them"""
import json
import sys
import time
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import creator_versions as cv  # noqa: E402
import writer as w  # noqa: E402

KIT = Path(__file__).resolve().parent.parent
apply = "--apply" in sys.argv
wd, vd = w._dir(KIT), cv._dir(KIT)
docs = [d for d in w._all(wd) if (d.get("realm") or "creator") == "creator"]
have = {w.stem_key(d.get("title")) for d in docs}
made, skipped = [], []
with w.LOCK:
    for p in sorted(vd.glob("*.json")):
        try:
            book = json.load(open(p, encoding="utf-8"))
        except ValueError:
            continue
        root, vs = book.get("title") or "", [v for v in book.get("versions") or [] if isinstance(v, dict)]
        if not vs or not root:
            continue
        if w.stem_key(root) in have:
            skipped.append(root)
            continue
        last = {}
        for v in sorted(vs, key=lambda v: (v.get("at") or 0, v.get("n") or 0)):
            last[v.get("version") or ""] = v                 # each branch's last
        chain = sorted(last.values(), key=lambda v: (v.get("at") or 0, v.get("n") or 0))
        def text(v):
            return {"title": (root + (" v" + v["version"] if v.get("version") else ""))[:120], "style": v.get("style") or "", "lyrics": v.get("lyrics") or "",
                    "notes": "", "params": v.get("params") if isinstance(v.get("params"), dict) else {}}
        top = chain[-1]
        doc = {"id": uuid.uuid4().hex[:12], "created": chain[0].get("at") or time.time(), "updated": top.get("at") or time.time(), "realm": "creator",
               "takes": sorted({n for v in vs for n in v.get("takes") or [] if isinstance(n, str) and "/" not in n}),
               "versions": [{"at": v.get("at") or 0, "label": "from the Musician's versions", **text(v)} for v in chain[:-1]][-w.KEEP:], **text(top)}
        made.append({"id": doc["id"], "title": doc["title"], "branches": [v.get("version") or "—" for v in chain], "takes": len(doc["takes"]), "versions": len(doc["versions"])})
        if apply:
            w._write(wd, doc)
            have.add(w.stem_key(root))
    if apply and made:
        p = wd / ".backfill-2905.manifest"
        old = json.load(open(p, encoding="utf-8")) if p.is_file() else []
        json.dump(old + [{"at": time.time(), **m} for m in made], open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
for m in made:
    print(("made  " if apply else "would ") + m["id"] + "  " + m["title"] + "  · branches " + ", ".join(m["branches"]) + f" · {m['versions']} versions · {m['takes']} takes")
print(f"{len(made)} {'made' if apply else 'to make'}, {len(skipped)} with a document already: " + "; ".join(skipped))
