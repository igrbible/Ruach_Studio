"""HERESY 1447: LoRA alchemy, the lab's half (Viktor 14.10.2026: «LoRA ересь и алхимия»; «1+2 в общую суммарную силу, либо 3 и
4 — отдельно»). What each adapter touches, layer by layer, and which adapters push on the same layers, so the page can give
those a budget to share (the engine applies it, lora-rt.h) and leave the others each on its own.

An adapter is read as the engine reads it (lora.h: the same suffixes, names, scales); its change on each module is
||s B A||_F at strength 1, computed through r x r products, never the full delta. The bins are (half, layer, attention or
MLP). Two adapters overlap by the share of their energy that lands in the same bins (sum of the minima of their two
distributions, 0..1); where both touch the same projection, the cosine of their deltas says whether they push the same way
(near 1), across (near 0) or against each other (below 0). Adapters that overlap by half or more share a budget.

The base weights' norms (from the model's GGUF, once, cached) turn an energy into the share of a layer an adapter moves.

    GET /lora/profile?ids=a,b,...   ids: paths under loras/"""
import hashlib
import json
import math
import os
import re
import struct
import threading
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
KIT = HERE.parent
CACHE = HERE / "cache" / "lora-alchemy"
LORAS = KIT / "loras"
AB = ((".lora_A.default.weight", ".lora_B.default.weight"), (".lora_A.weight", ".lora_B.weight"),
      (".lora_A", ".lora_B"), (".lora_down.weight", ".lora_up.weight"))
OUTSIDE = ("llm2vae", "vae2llm", "time_embedder.mlp.0", "time_embedder.mlp.2")
ATTN = ("q_proj", "k_proj", "v_proj", "o_proj")
MLP = ("gate_proj", "up_proj", "down_proj")
OVERLAP_GROUP = 0.5            # two adapters with half their energy or more in the same bins share a budget
_dtypes = {"F32": np.float32, "F16": np.float16, "BF16": "bf16", "F64": np.float64}


# ---------------------------------------------------------------- safetensors

def _header(path):
    with open(path, "rb") as f:
        n = struct.unpack("<Q", f.read(8))[0]
        if n == 0 or n > (100 << 20):
            raise ValueError("not a safetensors file")
        head = json.loads(f.read(n))
    meta = head.pop("__metadata__", {}) or {}
    return head, meta, 8 + n


def _tensor(path, head, base, name):
    t = head[name]
    b0, b1 = t["data_offsets"]
    with open(path, "rb") as f:
        f.seek(base + b0)
        raw = f.read(b1 - b0)
    dt = _dtypes.get(t["dtype"])
    if dt is None:
        raise ValueError(f"{name}: {t['dtype']} is not read here")
    if dt == "bf16":
        a = (np.frombuffer(raw, dtype=np.uint16).astype(np.uint32) << 16).view(np.float32)
    else:
        a = np.frombuffer(raw, dtype=dt).astype(np.float32)
    return a.reshape(t["shape"])


# ---------------------------------------------------------------- the engine's rules (lora.h)

def _resolve(module):
    """A LoRA module name -> (half, layer, branch kind, [projs]) as lora_resolve says it; (1, None, 'edge', [name]) for the
    sound half's edges; None when it lands nowhere"""
    name, h = module, -1
    if name.startswith("base_model.model."):
        name = name[17:]
    if name.startswith("text_encoders."):
        name, h = name[14:], 0
    elif name.startswith("diffusion_model."):
        name, h = name[16:], 1
    if name.startswith("layers."):
        name = "model." + name
    if name in OUTSIDE:
        return 1, None, "edge", [name]
    m = re.fullmatch(r"model\.layers\.(\d+)\.([a-z_]+)\.([a-z_]+)", name)
    if not m:
        return None
    layer, branch, proj = int(m.group(1)), m.group(2), m.group(3)
    nar = branch.startswith("nar_")
    if h == 1 and not nar:
        branch = {"self_attn": "nar_self_attn", "mlp": "nar_mlp"}.get(branch, branch)
    elif h < 0:
        h = 1 if nar else 0
    projs = {"qkv_proj": ["q_proj", "k_proj", "v_proj"], "gate_up_proj": ["gate_proj", "up_proj"]}.get(proj, [proj])
    kind = "attn" if branch.endswith("self_attn") else "mlp" if branch.endswith("mlp") else None
    if kind is None or any(p not in (ATTN if kind == "attn" else MLP) for p in projs):
        return None
    return h, layer, kind, projs


def _sidecar(path):
    cfg = Path(path).parent / "adapter_config.json"
    try:
        c = json.loads(cfg.read_text())
        a, r = c.get("lora_alpha", c.get("alpha")), c.get("r", c.get("rank"))
        if a is not None and r:
            return (a / math.sqrt(r)) if c.get("use_rslora") else a / r
    except (OSError, ValueError, TypeError):
        pass
    return None


def _num(s):
    try:
        v = float(s)
        return v if math.isfinite(v) else None
    except (TypeError, ValueError):
        return None


def plan(path):
    """The adapter's pieces: each LoRA pair (half, layer, kind, projs, scale, a, b) and each full delta; ValueError when
    the engine would refuse it"""
    head, meta, base = _header(path)
    meta_alpha = _num(meta.get("alpha", meta.get("lora_alpha")))
    side = _sidecar(path)
    used, pairs, full = set(), [], []
    for key in head:
        for sa, sb in AB:
            if not key.endswith(sa):
                continue
            module = key[: -len(sa)]
            bkey = module + sb
            if bkey not in head:
                raise ValueError(f"{key} has no matching {sb}")
            ash, bsh = head[key]["shape"], head[bkey]["shape"]
            if len(ash) != 2 or len(bsh) != 2 or bsh[1] != ash[0]:
                raise ValueError(f"mismatched LoRA matrices for {module}")
            r = _resolve(module)
            if r is None:
                raise ValueError(f"does not know where to put {module}")
            rank = ash[0]
            if module + ".alpha" in head:
                scale = ("alpha", module + ".alpha", rank)
                used.add(module + ".alpha")
            elif meta_alpha is not None:
                scale = ("value", meta_alpha / rank)
            elif side is not None:
                scale = ("value", side)
            else:
                scale = ("value", 1.0)
            pairs.append({"module": module, "half": r[0], "layer": r[1], "kind": r[2], "projs": r[3], "a": key, "b": bkey,
                          "rank": rank, "scale": scale})
            used.update((key, bkey))
            break
    for key in head:
        if key in used:
            continue
        if key.endswith(".diff") or key.endswith(".diff_b"):
            r = _resolve(key.rsplit(".", 1)[0])
            if r is None:
                raise ValueError(f"does not know where to put {key}")
            full.append({"key": key, "half": r[0], "layer": r[1], "kind": r[2]})
            used.add(key)
            continue
        stem = key[16:] if key.startswith("diffusion_model.") else key
        if "." in stem and stem.rsplit(".", 1)[0] in OUTSIDE and stem.rsplit(".", 1)[1] in ("weight", "bias"):
            full.append({"key": key, "half": 1, "layer": None, "kind": "edge"})
            used.add(key)
    left = [k for k in head if k not in used]
    if left:
        raise ValueError(f"{len(left)} tensors do not land on the model, e.g. {left[0]}")
    if not pairs and not full:
        raise ValueError("no LoRA pairs found")
    return head, base, pairs, full


def _scale(path, head, base, s):
    if s[0] == "value":
        return s[1]
    al = _tensor(path, head, base, s[1]).reshape(-1)
    return float(al[0]) / s[2]


# ---------------------------------------------------------------- one adapter's profile

def _cache_key(path):
    st = os.stat(path)
    return hashlib.sha1(f"{path}|{st.st_size}|{int(st.st_mtime)}|v1".encode()).hexdigest()[:20]


def profile(rel):
    """Energy by bin at strength 1: {"halves": {"ar"|"nar": {"bins": {"L.kind": e}, "total": E}}, "full": [...], "rank": r}"""
    path = (LORAS / rel).resolve()
    if LORAS.resolve() not in path.parents or not path.is_file():
        raise ValueError(f"no adapter {rel}")
    CACHE.mkdir(parents=True, exist_ok=True)
    cf = CACHE / f"{_cache_key(path)}.json"
    if cf.is_file():
        try:
            return json.loads(cf.read_text())
        except ValueError:
            pass
    head, base, pairs, full = plan(path)
    halves = {"ar": {"bins": {}, "total": 0.0}, "nar": {"bins": {}, "total": 0.0}}
    ranks = set()
    for p in pairs:
        A = _tensor(path, head, base, p["a"]).astype(np.float64)   # [r, in]
        B = _tensor(path, head, base, p["b"]).astype(np.float64)   # [out, r]
        s = _scale(path, head, base, p["scale"])
        e2 = float(np.trace((B.T @ B) @ (A @ A.T))) * s * s           # ||s B A||_F^2
        h = halves["nar" if p["half"] else "ar"]
        b = f"{p['layer']}.{p['kind']}"
        h["bins"][b] = h["bins"].get(b, 0.0) + e2
        ranks.add(p["rank"])
    out_full = []
    for f in full:
        d = _tensor(path, head, base, f["key"]).astype(np.float64)
        e2 = float(np.sum(d * d))
        h = halves["nar" if f["half"] else "ar"]
        b = f"{f['layer']}.{f['kind']}" if f["layer"] is not None else "edge"
        h["bins"][b] = h["bins"].get(b, 0.0) + e2
        out_full.append(f["key"])
    for h in halves.values():           # the norms, not their squares, for the page; the total from the squares
        h["total"] = math.sqrt(sum(h["bins"].values()))
        h["bins"] = {k: math.sqrt(v) for k, v in h["bins"].items()}
    out = {"halves": halves, "full": out_full, "rank": max(ranks) if ranks else 0, "pairs": len(pairs)}
    cf.write_text(json.dumps(out))
    return out


# ---------------------------------------------------------------- two adapters

def _dist(h):
    t = sum(v * v for v in h["bins"].values())
    return {k: v * v / t for k, v in h["bins"].items()} if t > 0 else {}


def overlap(pa, pb, half):
    """The share of their energy in the same bins, 0..1"""
    a, b = _dist(pa["halves"][half]), _dist(pb["halves"][half])
    return sum(min(a[k], b[k]) for k in a.keys() & b.keys())


def cosine(rel_a, rel_b, half):
    """Where both touch the same projection with the same layout: the cosine of their deltas, summed over those modules
    (near 1 the same way, near 0 across, below 0 against each other); None when they share none"""
    pa_, pb_ = (LORAS / rel_a).resolve(), (LORAS / rel_b).resolve()
    ha, ba, pairs_a, _ = plan(pa_)
    hb, bb, pairs_b, _ = plan(pb_)
    hh = 1 if half == "nar" else 0
    idx_b = {(p["layer"], tuple(p["projs"])): p for p in pairs_b if p["half"] == hh}
    dot = na = nb = 0.0
    for p in pairs_a:
        if p["half"] != hh:
            continue
        q = idx_b.get((p["layer"], tuple(p["projs"])))
        if not q:
            continue
        A1 = _tensor(pa_, ha, ba, p["a"]).astype(np.float64); B1 = _tensor(pa_, ha, ba, p["b"]).astype(np.float64)
        A2 = _tensor(pb_, hb, bb, q["a"]).astype(np.float64); B2 = _tensor(pb_, hb, bb, q["b"]).astype(np.float64)
        if A1.shape[1] != A2.shape[1] or B1.shape[0] != B2.shape[0]:
            continue
        s1, s2 = _scale(pa_, ha, ba, p["scale"]), _scale(pb_, hb, bb, q["scale"])
        dot += float(np.trace((B1.T @ B2) @ (A2 @ A1.T))) * s1 * s2
        na += float(np.trace((B1.T @ B1) @ (A1 @ A1.T))) * s1 * s1
        nb += float(np.trace((B2.T @ B2) @ (A2 @ A2.T))) * s2 * s2
    if na <= 0 or nb <= 0:
        return None
    return dot / math.sqrt(na * nb)


# ---------------------------------------------------------------- the base weights' norms (once per model)

_base_lock = threading.Lock()
_base_state = {"running": False}


def _model_path():
    for name in ("YuE2-3B-BF16.gguf", "YuE2-3B-Q8_0.gguf", "YuE2-3B-Q6_K.gguf", "YuE2-3B-Q5_K_M.gguf"):
        p = KIT / "models" / name
        if p.is_file():
            return p
    return None


def _base_file():
    p = _model_path()
    if not p:
        return None, None
    st = p.stat()
    return p, CACHE / f"base-{hashlib.sha1(f'{p}|{st.st_size}|{int(st.st_mtime)}'.encode()).hexdigest()[:16]}.json"


def base_norms():
    """{"ar"|"nar": {"L.kind": ||W||}} when measured; None while it is not (the measuring starts in the background)"""
    p, cf = _base_file()
    if not p:
        return None
    if cf.is_file():
        try:
            return json.loads(cf.read_text())
        except ValueError:
            pass
    with _base_lock:
        if _base_state["running"]:
            return None
        _base_state["running"] = True
    threading.Thread(target=_measure_base, args=(p, cf), daemon=True).start()
    return None


def _measure_base(p, cf):
    try:
        import gguf
        r = gguf.GGUFReader(str(p))
        out = {"ar": {}, "nar": {}}
        for t in r.tensors:
            m = re.fullmatch(r"model\.layers\.(\d+)\.(self_attn|mlp|nar_self_attn|nar_mlp)\.([a-z_]+)\.weight", t.name)
            if not m or m.group(3) not in ATTN + MLP:
                continue
            half = "nar" if m.group(2).startswith("nar_") else "ar"
            kind = "attn" if m.group(2).endswith("self_attn") else "mlp"
            data = np.asarray(t.data)
            if t.tensor_type == gguf.GGMLQuantizationType.BF16:
                x = (data.view(np.uint16).astype(np.uint32) << 16).view(np.float32)
            elif t.tensor_type in (gguf.GGMLQuantizationType.F32, gguf.GGMLQuantizationType.F16):
                x = data.astype(np.float32)
            else:
                x = gguf.quants.dequantize(data, t.tensor_type).astype(np.float32)
            b = f"{int(m.group(1))}.{kind}"
            out[half][b] = out[half].get(b, 0.0) + float(np.sum(x.astype(np.float64) ** 2))
        for h in out.values():
            for k in h:
                h[k] = math.sqrt(h[k])
        CACHE.mkdir(parents=True, exist_ok=True)
        cf.write_text(json.dumps(out))
    finally:
        with _base_lock:
            _base_state["running"] = False


# ---------------------------------------------------------------- what the page asks

def report(ids):
    """For the adapters of the form: each one's bins (and the share of each layer it moves, when the base is measured),
    each pair's overlap and cosine per half, and the groups that share a budget"""
    ids = [i for i in dict.fromkeys(x.strip() for x in ids) if i]
    base = base_norms()
    adapters, errors = {}, {}
    for i in ids:
        try:
            p = profile(i)
        except (OSError, ValueError, KeyError) as e:
            errors[i] = str(e)
            continue
        a = {"rank": p["rank"], "full": bool(p["full"]), "halves": {}}
        for half in ("ar", "nar"):
            h = p["halves"][half]
            if h["total"] <= 0:
                continue
            layers = {}
            for k, v in h["bins"].items():
                layers.setdefault(k.split(".")[0], 0.0)
                layers[k.split(".")[0]] += v * v
            rel = None
            if base and base.get(half):
                rel = {k: round(100.0 * v / base[half][k], 3) for k, v in h["bins"].items() if base[half].get(k)}
            a["halves"][half] = {"total": round(h["total"], 4),
                                 "layers": {k: round(math.sqrt(v), 4) for k, v in sorted(layers.items(), key=lambda kv: (kv[0] == "edge", int(kv[0]) if kv[0].isdigit() else 0))},
                                 "bins": {k: round(v, 4) for k, v in h["bins"].items()},
                                 "moves_percent": rel}
        adapters[i] = a
    pairs, groups = [], {}
    for half in ("ar", "nar"):
        live = [i for i in adapters if half in adapters[i]["halves"]]
        parent = {i: i for i in live}

        def find(x):
            while parent[x] != x:
                parent[x] = parent[parent[x]]
                x = parent[x]
            return x
        for x in range(len(live)):
            for y in range(x + 1, len(live)):
                a, b = live[x], live[y]
                ov = overlap(profile(a), profile(b), half)
                try:
                    cs = cosine(a, b, half)
                except (OSError, ValueError, KeyError):
                    cs = None
                pairs.append({"a": a, "b": b, "half": half, "overlap": round(ov, 3), "cosine": None if cs is None else round(cs, 3)})
                if ov >= OVERLAP_GROUP:
                    parent[find(a)] = find(b)
        g = {}
        for i in live:
            g.setdefault(find(i), []).append(i)
        groups[half] = [m for m in g.values()]
    return {"adapters": adapters, "errors": errors, "pairs": pairs, "groups": groups, "base": base is not None,
            "overlap_group": OVERLAP_GROUP}
