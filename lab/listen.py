"""HERESY 2936 (Viktor 21.11.2026, on the firewall's question at a first start on Windows: «Для Windows по умолчанию только этот компьютер,
конечно… Тогда запроса нет»): where the engine listens, and on which system, for Engine → Security's words.

On Windows and macOS the engine listens on this computer alone (127.0.0.1) while user/access.json says «this computer only», which is what
their first start writes there (launcher/start.py), so neither system's firewall asks anything; private networks or a list, chosen in
Engine → Security, open it on every address once the Studio starts again, and then the firewall asks once. Linux keeps start.sh: every
address, the engine's own gate deciding who is answered (1114, 1429). launcher/start.py writes what it chose into tmp/engine-listen.json, the lab says it at GET /engine/where;
start.sh writes none, and the engine is then «not said».

    state(kit) → {"system": "windows"|"macos"|"linux", "engine": {"host", "port"} or None, "launcher": RUACH_LAUNCHER}"""
import json
import os
import sys
from pathlib import Path


def system():
    return "windows" if os.name == "nt" else "macos" if sys.platform == "darwin" else "linux"


def state(kit):
    try:
        with open(Path(kit) / "tmp" / "engine-listen.json", encoding="utf-8") as f:
            e = json.load(f)
        engine = {"host": str(e.get("host") or ""), "port": int(e.get("port") or 0)}
    except (OSError, ValueError, TypeError, AttributeError):
        engine = None
    return {"system": system(), "engine": engine, "launcher": os.environ.get("RUACH_LAUNCHER", "")}
