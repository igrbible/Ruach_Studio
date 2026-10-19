"""HERESY 1494 · what a merged backbone carries (Viktor 16.10.2026: «В селекторе на наши мёрджи не забудь подсказки добавить и доли по
слияниям, чтобы не потеряться никому»).

merge-loras writes the adapters it folded in, and at which strengths, into the GGUF it makes: heresy.merged_loras =
"file@music,sound; file@music,sound; …"; quantize copies it into the quants. Read here from the file's header alone (no gguf
package, nothing but the key/value block is read), each adapter named as loras/sources.json names it, so a merge downloaded
without its adapters is still told by name.
"""
import json
import struct
from pathlib import PurePosixPath

KEY = "heresy.merged_loras"
FIXED = {0: 1, 1: 1, 2: 2, 3: 2, 4: 4, 5: 4, 6: 4, 7: 1, 10: 8, 11: 8, 12: 8}   # GGUF value types of a fixed size
STRING, ARRAY = 8, 9
_CACHE = {}


def header_value(path, want):
    """A string value of the GGUF's key/value block, or None when the file has no such key."""
    with open(path, "rb") as f:
        if f.read(4) != b"GGUF":
            raise ValueError("not a GGUF file")
        version, = struct.unpack("<I", f.read(4))
        if version < 2:
            raise ValueError(f"GGUF v{version} is older than this reader")
        _, n_kv = struct.unpack("<QQ", f.read(16))

        def string():
            n, = struct.unpack("<Q", f.read(8))
            return f.read(n)

        def skip(t):
            if t in FIXED:
                f.seek(FIXED[t], 1)
            elif t == STRING:
                n, = struct.unpack("<Q", f.read(8))
                f.seek(n, 1)
            elif t == ARRAY:
                et, count = struct.unpack("<IQ", f.read(12))
                if et in FIXED:
                    f.seek(FIXED[et] * count, 1)
                else:
                    for _ in range(count):
                        skip(et)
            else:
                raise ValueError(f"unknown GGUF value type {t}")

        for _ in range(n_kv):
            key = string().decode("utf-8", "replace")
            t, = struct.unpack("<I", f.read(4))
            if key == want and t == STRING:
                return string().decode("utf-8", "replace")
            skip(t)
    return None


def _sources(kit):
    try:
        return json.load(open(kit / "loras" / "sources.json", encoding="utf-8")).get("loras", {}) or {}
    except (OSError, ValueError, AttributeError):
        return {}


def title_of(file, sources):
    """An adapter's name as the LoRA list says it: its sources.json entry by its file, its folder, or (a copy kept elsewhere)
    the entry with its stem; else its folder's name."""
    p = PurePosixPath(file)
    stem = p.name.split(".")[0]
    rel = p.parts[1:] if p.parts and p.parts[0] == "loras" else ()
    keys = []
    if rel:
        keys.append(rel[0] + "/" + stem)
        keys += ["/".join(rel[:k]) + "/" for k in range(len(rel) - 1, 0, -1)]
    keys += sorted(k for k in sources if k.endswith("/" + stem))
    for k in keys:
        if k in sources and isinstance(sources[k], dict) and sources[k].get("title"):
            return sources[k]["title"], k.rstrip("/")
    return (rel[0] if rel else p.parent.name) or p.name, ""


def parse(said, sources):
    out = []
    for part in said.split(";"):
        part = part.strip()
        if not part or "@" not in part:
            continue
        file, _, amounts = part.rpartition("@")
        try:
            ar, nar = (float(x) for x in amounts.split(","))
        except ValueError:
            continue
        name, key = title_of(file.strip(), sources)
        out.append({"name": name, "source": key, "ar": ar, "nar": nar})
    return out


def merges(kit):
    """{"merges": {model name: [{name, source, ar, nar}, …]}, "errors": {model name: why}} for models/YuE2-3B-<name>.gguf.
    A file without the key is m-a-p's own (or a merge from elsewhere): it is not listed; one that cannot be read is said."""
    sources, out, errors = _sources(kit), {}, {}
    for f in sorted((kit / "models").glob("YuE2-3B-*.gguf")):
        name = f.name[len("YuE2-3B-"):-len(".gguf")]
        try:
            st = f.stat()
            k = (str(f), st.st_size, st.st_mtime_ns)
            if k not in _CACHE:
                _CACHE[k] = header_value(f, KEY)
            said = _CACHE[k]
        except (OSError, ValueError, struct.error) as e:
            errors[name] = str(e) or e.__class__.__name__
            continue
        if said:
            out[name] = parse(said, sources)
    return {"merges": out, "errors": errors}
