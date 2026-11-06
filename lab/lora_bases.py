"""HERESY 1960 · what each adapter was trained on, against the model the engine runs (Viktor 30.10.2026: «нужно продумать в Творце
флагирование и отключение адаптеров, которые не на своих моделях/файнтюнах тренились как несовместимые. Отключать как в списке LoRA
адаптеров, так и в подгруженных, если вдруг переключил модели»; his voice adapter, learnt on YuE2, tears on the fine-tune: 27.10).

An adapter's base, the first that says it:
  1. its file's metadata: base_model (the Studio's trainer writes it since 1960; others write a file name or a repo), or
     ss_base_model_version;
  2. the run of this Studio that made it (training/<its folder>/run.json, options.base: empty is YuE2 itself, else the
     checkpoint it trained on, named by its file);
  3. nothing said: YuE2 itself, as every YuE2 adapter outside this Studio was trained (said so: «assumed»).
The model's line, from its GGUF: the adapters merge-loras folded into it (heresy.merged_loras, lab/merges.py), an RS-FW epoch
among them making it RS-FW of that epoch, an RS-TW epoch folded over it making it RS-TW of that one (HERESY 2111: the Tsunami
Wave's merges list RS-FW 2.4 and then RS-TW 2.0, and read as RS-TW 2.0); else its file name (RS-TW-2.0…, RS-FW-2.4…); else, a
YuE2 file or a merge of YuE2 with adapters (IRA, IRAE), YuE2. A model told by none of these is unknown, and then nothing is flagged.

The fit: «same» (the same line: YuE2 and its merges, RS-FW of the same epoch at any strength, RS-TW of the same epoch at any
strength), «near» (RS-FW of another epoch: the same run, a little further on or back; HERESY 2111: RS-TW against RS-FW, either
way: the Tsunami Wave grew over RS-FW 2.4, the other wave of the same fine-tune), «other» (YuE2 against RS-FW or RS-TW, either
way: muted by the page when the model changes, taken back in only when asked), «unknown». An adapter folded into the model
already says so too (inside).
"""
import json
import re
import struct
from pathlib import Path

import merges

TW_RE = re.compile(r"RS-TW-e?0*(\d+(?:\.\d+)?)", re.I)          # HERESY 2111: YuE2-RS-TW-e002.0.safetensors, RS-TW-2.0x0.75, yue2_3b_RS-TW-2.0x0.75_bf16
FW_RE = re.compile(r"RS-FW-e?0*(\d+(?:\.\d+)?)", re.I)          # YuE2-RS-FW-e002.4.safetensors, RS-FW-2.4x0.75, RS-FW-e003.4-m0.75
YUE2_RE = re.compile(r"(^|[/_\-])yue2([_\-]3b)?([_\-.]|$)", re.I)   # yue2_3b_bf16.safetensors, m-a-p/YuE2-3B, YuE2-3B-Q8_0.gguf, «yue2»
ROOT_RE = re.compile(r"^[A-Za-z0-9_.+\-]{1,200}\.gguf$")
_HEAD = {}                                            # path -> ((size, mtime_ns), metadata)


def _version(v):
    """«002.4» → «2.4», «4» → «4.0»: the epoch as the models' names write it."""
    f = float(v)
    return f"{f:.1f}" if abs(f * 10 - round(f * 10)) < 1e-9 else f"{f:g}"


def line_of(text):
    """(family, version) of a checkpoint's, a repo's or a model's name: ("tw", "2.0"), ("fw", "2.4"), ("yue2", ""), or None.
    HERESY 2111: the Tsunami Wave first, before RS-FW and YuE2 (a TW base file, yue2_3b_RS-TW-2.0x0.75_bf16, read YuE2's before)."""
    s = str(text or "").strip()
    m = TW_RE.search(s)
    if m:
        return "tw", _version(m.group(1))
    m = FW_RE.search(s)
    if m:
        return "fw", _version(m.group(1))
    if YUE2_RE.search(s):
        return "yue2", ""
    return None


def label(line):
    if not line:
        return "unknown"
    return "YuE2" if line[0] == "yue2" else f"RS-TW {line[1]}" if line[0] == "tw" else f"RS-FW {line[1]}"


def _meta(path):
    """A .safetensors file's own metadata (its header alone), kept while its size and time stay."""
    st = path.stat()
    key = (st.st_size, st.st_mtime_ns)
    had = _HEAD.get(str(path))
    if had and had[0] == key:
        return had[1]
    meta = {}
    try:
        with open(path, "rb") as f:
            n, = struct.unpack("<Q", f.read(8))
            if 0 < n < 100_000_000:
                meta = json.loads(f.read(n)).get("__metadata__") or {}
    except (OSError, ValueError, struct.error):
        meta = {}
    _HEAD[str(path)] = (key, meta)
    return meta


def _run_base(kit, run):
    f = Path(kit) / "training" / run / "run.json"
    if not f.is_file():
        return None
    try:
        m = json.load(open(f, encoding="utf-8"))
    except (OSError, ValueError):
        return None
    o = m.get("options") if isinstance(m.get("options"), dict) else {}
    return str(o.get("base") or "").strip()


def adapter_line(kit, rel):
    """(line, how) of loras/<rel>: how is "file" (its metadata), "run" (this Studio's run) or "assumed"."""
    p = Path(kit) / "loras" / rel
    meta = _meta(p) if p.is_file() else {}
    for k in ("base_model", "ss_base_model_version", "base_checkpoint"):
        got = line_of(meta.get(k))
        if got:
            return got, "file"
    run = rel.split("/", 1)[0] if "/" in rel else ""
    base = _run_base(kit, run) if run else None
    if base is not None:
        return (line_of(base) if base else ("yue2", "")) or ("yue2", ""), "run"
    return ("yue2", ""), "assumed"


def model_line(kit, name):
    """{line, label, inside}: the model in use, and the adapters folded into it (their ids under loras/)."""
    p = Path(kit) / "models" / name
    if not ROOT_RE.match(name) or ".." in name or not p.is_file():
        return {"line": None, "label": "unknown", "inside": []}
    try:
        said = merges.header_value(p, merges.KEY) or ""
    except (OSError, ValueError):
        said = ""
    inside, fw, tw = [], None, None
    for part in [x.strip() for x in said.split(";") if x.strip()]:
        file = part.split("@", 1)[0].strip()
        if file.startswith("loras/"):
            inside.append(file[len("loras/"):])
        got = line_of(Path(file).name)
        if got and got[0] == "fw":                    # an RS-FW epoch folded in makes the model RS-FW of that epoch
            fw = got
        elif got and got[0] == "tw":                  # HERESY 2111: and an RS-TW epoch folded over it, RS-TW of that one
            tw = got
    line = tw or fw
    if not line:
        got = line_of(name)
        line = got if got and got[0] in ("fw", "tw") else ("yue2", "") if (said or (got and got[0] == "yue2")) else None
    return {"line": line, "label": label(line), "inside": inside}


def fit(model, adapter):
    if not model or not adapter:
        return "unknown"
    if {model[0], adapter[0]} == {"fw", "tw"}:       # HERESY 2111: the Tsunami Wave grew over RS-FW 2.4: either wave's adapter on the other
        return "near"
    if model[0] != adapter[0]:
        return "other"
    return "same" if model[0] == "yue2" or model[1] == adapter[1] else "near"


def report(kit, model, ids):
    """GET /lab/lora/bases?model=<the engine's GGUF, its name>&ids=<the catalog's ids, comma-separated, or none for all of loras/>."""
    kit = Path(kit)
    m = model_line(kit, str(model or ""))
    root = kit / "loras"
    if not ids:
        ids = sorted(str(f.relative_to(root)) for f in root.rglob("*.safetensors")) if root.is_dir() else []
    out = {}
    for rel in ids:
        rel = str(rel).strip()
        if not rel or rel.startswith("/") or ".." in rel.split("/"):
            continue
        line, how = adapter_line(kit, rel)
        out[rel] = {"base": label(line), "how": how, "fit": fit(m["line"], line), "inside": rel in m["inside"]}
    return {"model": {"name": model, "label": m["label"], "known": m["line"] is not None}, "loras": out}
