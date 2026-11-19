"""HERESY 2761: POST /api/v1/songs passes the lyrics' own guidance (cfg_lyrics, HERESY 1397) to the engine as it is, and the OpenAPI names
it beside cfg_scale (the idea from leeQzz's fork, PR #8). No engine, no card.
python3 lab/test_api_cfg_lyrics.py"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import api  # noqa: E402

bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got)[:300] + ")"))
    if not ok:
        bad.append(what)


asked = []
api._engine = lambda path, body=None, timeout=60: asked.append((path, body)) or {"id": 7}
ctx = {"collection": None, "config_dir": lambda: HERE, "outputs": HERE}


def song(**more):
    asked.clear()
    code, out = api.handle("POST", "/api/v1/songs", {}, json.dumps(dict({"style": "flamenco", "lyrics": "[Verse]\nla"}, **more)).encode(), {}, ctx)
    return code, out, (asked[0][1] if asked else None)


code, out, sent = song(cfg_scale=1.6, cfg_lyrics=2.2)
check("the song is taken (202, its job)", code == 202 and out.get("job") == 7, (code, out))
check("cfg_lyrics goes to the engine as it is", sent and sent.get("cfg_lyrics") == 2.2, sent)
check("cfg_scale still goes", sent and sent.get("cfg_scale") == 1.6, sent)
code, out, sent = song()
check("left out, it is not sent (the engine's own: as the guidance)", sent is not None and "cfg_lyrics" not in sent, sent)
props = api.openapi()["paths"]["/songs"]["post"]["requestBody"]["content"]["application/json"]["schema"]["properties"]
check("the OpenAPI names both guidances", props.get("cfg_lyrics") == {"type": "number"} and props.get("cfg_scale") == {"type": "number"}, sorted(props))
print("all good" if not bad else f"{len(bad)} failed")
sys.exit(1 if bad else 0)
