"""HERESY 1169 · 1316: the Artist's LoRAs (Viktor 10.10.2026: «LoRA сам скачаешь для тестов или мне самому подтянуть»; «Положил в
artwork/loras/<семейство>/»; «предусмотри скан поддиректорий»; «Если возле адаптера лежит его картинка, её тоже возьми в
представление. И прикрути сканирование Civitai по хешу с подтяжкой инфы по адаптеру, если он там есть. Такое в LoRA Manager в
ComfyUI заточено»; «Адаптеры пользователи пусть себе тянут по твоему Гайду прямо в комнате»).

KIT/artwork/loras/FAMILY/… holds the adapters, each family a painter's: krea2 (Krea 2 Muse), sdxl, qwen-image-2.1, qwen-image-2512;
any depth of folders below it, a folder a group. Beside an adapter: its picture (NAME.preview.png, .jpg…, or NAME.png, .jpeg…),
and what other tools wrote of it: NAME.metadata.json (ComfyUI's LoRA Manager), NAME.civitai.info (Civitai Helper),
NAME.cm-info.json (Stability Matrix). A look-up on Civitai sends the file's SHA-256 alone and keeps the answer as
NAME.civitai.info, and its first picture rated safe as NAME.preview.EXT when there is none; a hash Civitai does not know is
remembered in the lab's cache, not beside the file.

kohya_to_comfy() turns a kohya adapter (lora_unet_blocks_0_attn_gate…) into the names diffusers' loaders read
(diffusion_model.blocks.0.attn.gate…), by the transformer's own layer names: diffusers takes such a file without a word and
reaches none of its layers (measured: 2 of Viktor's 9 Krea 2 adapters)."""
import hashlib, json, os, re, struct, time, urllib.error, urllib.request
from pathlib import Path

FAMILIES = {"krea2": ("krea2-q4", "krea2-q8"), "sdxl": ("sdxl",), "qwen-image-2.1": ("qwen21",),
            "qwen-image-2512": ("qwen2512-q4", "qwen2512-q6", "qwen2512-fp8")}
TITLES = {"krea2": "Krea 2", "sdxl": "SDXL", "qwen-image-2.1": "Qwen-Image 2.1", "qwen-image-2512": "Qwen-Image 2512"}
PICS = (".preview.png", ".preview.jpeg", ".preview.jpg", ".preview.webp", ".jpg", ".jpeg", ".png", ".webp")
TYPES = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp"}
CIVITAI = "https://civitai.com/api/v1/model-versions/by-hash/"
WEIGHT = 0.8                                          # an adapter's strength when it is added, lowered or raised by the user
MAX_LORAS = 4


def family_of(painter):
    for fam, painters in FAMILIES.items():
        if painter in painters:
            return fam
    return None


def root(kit):
    return Path(kit) / "artwork" / "loras"


def _safe_id(lid):
    """An adapter's id is its path under artwork/loras/, never out of it."""
    lid = str(lid or "").replace("\\", "/").strip("/")
    if not lid or ".." in lid.split("/") or not lid.endswith(".safetensors") or lid.split("/")[0] not in FAMILIES:
        raise ValueError(f"no such adapter: {lid}")
    return lid


def path_of(kit, lid):
    p = root(kit) / _safe_id(lid)
    if not p.is_file():
        raise FileNotFoundError(f"no such adapter: {lid}")
    return p


def _stem(p):
    return p.with_suffix("")                          # NAME.safetensors → NAME


def picture(p):
    """The adapter's own picture beside it, or None."""
    s = str(_stem(p))
    for ext in PICS:
        q = Path(s + ext)
        if q.is_file():
            return q
    return None


def header(p):
    """The safetensors header's own metadata (what the trainer wrote): {} when there is none."""
    try:
        with open(p, "rb") as f:
            n = struct.unpack("<Q", f.read(8))[0]
            if n > 64 * 2 ** 20:
                return {}
            return json.loads(f.read(n).decode("utf-8", "replace")).get("__metadata__") or {}
    except (OSError, ValueError, struct.error):
        return {}


def _read(q):
    try:
        with open(q, encoding="utf-8") as f:
            d = json.load(f)
        return d if isinstance(d, dict) else {}
    except (OSError, ValueError):
        return {}


def _words(v):
    out = []
    for w in v or []:
        for part in str(w).split(","):
            part = part.strip()
            if part and part not in out and len(part) <= 120 and "[" not in part and "your prompt" not in part.lower():
                out.append(part)
    return out[:12]


def known(p):
    """What is known of an adapter from the files beside it: {title, version, base, words, url, sha256, source}."""
    s = str(_stem(p))
    lm, ch, cm = _read(s + ".metadata.json"), _read(s + ".civitai.info"), _read(s + ".cm-info.json")
    v = ch or lm.get("civitai") or {}
    info = {}
    if v.get("modelId") or v.get("id"):
        model = v.get("model") or {}
        info = {"title": model.get("name") or lm.get("model_name") or "", "version": v.get("name") or "", "base": v.get("baseModel") or lm.get("base_model") or "",
                "words": _words(v.get("trainedWords")), "url": f"https://civitai.com/models/{v.get('modelId')}" + (f"?modelVersionId={v.get('id')}" if v.get("id") else "") if v.get("modelId") else "",
                "source": "civitai.info" if ch else "LoRA Manager"}
    elif cm.get("ModelId"):
        info = {"title": cm.get("ModelName") or "", "version": cm.get("VersionName") or "", "base": cm.get("BaseModel") or "", "words": _words(cm.get("TrainedWords")),
                "url": f"https://civitai.com/models/{cm['ModelId']}" + (f"?modelVersionId={cm['VersionId']}" if cm.get("VersionId") else ""), "source": "Stability Matrix"}
    sha = str(lm.get("sha256") or (cm.get("Hashes") or {}).get("SHA256") or "").lower()
    if re.fullmatch(r"[0-9a-f]{64}", sha):
        info["sha256"] = sha
    if not info.get("words"):                         # what the trainer wrote into the file itself
        h = header(p)
        w = h.get("modelspec.trigger_phrase")
        if w:
            info["words"] = _words([w])
    return info


def entry(kit, p, cache=None):
    rel = p.relative_to(root(kit)).as_posix()
    fam, rest = rel.split("/", 1)
    st = p.stat()
    e = {"id": rel, "family": fam, "name": p.stem, "folder": str(Path(rest).parent) if "/" in rest else "",
         "mb": round(st.st_size / 2 ** 20, 1), "picture": bool(picture(p)), "info": known(p)}
    c = (cache or {}).get(rel)
    if c and c.get("size") == st.st_size and c.get("mtime") == int(st.st_mtime):
        if c.get("civitai") == "none":
            e["civitai"] = "not there"                # looked up: Civitai does not know this file
    if e["info"].get("url"):
        e["civitai"] = "known"
    return e


def scan(kit, family=None, cache=None):
    """Every adapter of a family (or of all), each folder below it a group; symbolic links followed, once."""
    out = {}
    for fam in FAMILIES:
        if family and fam != family:
            continue
        base, rows, seen = root(kit) / fam, [], set()
        if base.is_dir():
            for d, dirs, files in os.walk(base, followlinks=True):
                real = os.path.realpath(d)
                if real in seen:
                    dirs[:] = []
                    continue
                seen.add(real)
                dirs[:] = sorted(x for x in dirs if not x.startswith("."))
                for f in sorted(files):
                    if f.endswith(".safetensors") and not f.startswith("."):
                        try:
                            rows.append(entry(kit, Path(d) / f, cache))
                        except OSError:
                            pass
        out[fam] = rows
    return {"root": "artwork/loras", "families": out, "titles": TITLES}


def sha256(p, cache, rel):
    """The file's SHA-256, kept in the lab's cache by its size and time (a 1 GB adapter takes a second or two to read)."""
    st = p.stat()
    c = cache.get(rel) or {}
    if c.get("size") == st.st_size and c.get("mtime") == int(st.st_mtime) and c.get("sha256"):
        return c["sha256"]
    known_sha = known(p).get("sha256")
    if known_sha:
        h = known_sha
    else:
        m = hashlib.sha256()
        with open(p, "rb") as f:
            for chunk in iter(lambda: f.read(8 * 2 ** 20), b""):
                m.update(chunk)
        h = m.hexdigest()
    cache[rel] = {"size": st.st_size, "mtime": int(st.st_mtime), "sha256": h}
    return h


def _get(url, timeout=20):
    req = urllib.request.Request(url, headers={"User-Agent": "RuachStudio (adapter look-up by hash)", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read(), r.headers.get("Content-Type", "")


def civitai(kit, lid, cache):
    """An adapter looked up on Civitai by its SHA-256: the answer kept beside it (NAME.civitai.info), its first picture rated
    safe kept as its preview when it has none; «not there» remembered in the cache. Returns its entry again."""
    p = path_of(kit, lid)
    h = sha256(p, cache, lid)
    try:
        body, _ = _get(CIVITAI + h)
        v = json.loads(body.decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code == 404:
            cache[lid]["civitai"] = "none"
            return entry(kit, p, cache)
        raise RuntimeError(f"Civitai answered {e.code}")
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise RuntimeError(f"Civitai could not be reached: {getattr(e, 'reason', e)}")
    if not isinstance(v, dict) or not v.get("modelId"):
        cache[lid]["civitai"] = "none"
        return entry(kit, p, cache)
    with open(str(_stem(p)) + ".civitai.info", "w", encoding="utf-8") as f:
        json.dump(v, f, ensure_ascii=False, indent=1)
    cache[lid]["civitai"] = "found"
    if not picture(p):                                # the first picture rated safe (Civitai's nsfwLevel 1), never another
        for im in v.get("images") or []:
            if im.get("type", "image") != "image" or int(im.get("nsfwLevel") or 99) > 1 or not im.get("url"):
                continue
            try:
                data, ctype = _get(im["url"], 30)
            except (urllib.error.URLError, TimeoutError, OSError):
                break
            ext = {"image/png": ".png", "image/webp": ".webp"}.get(ctype.split(";")[0].strip(), ".jpeg")
            if len(data) <= 12 * 2 ** 20:
                with open(str(_stem(p)) + ".preview" + ext, "wb") as f:
                    f.write(data)
            break
    return entry(kit, p, cache)


def small(p, w, cache_dir):
    """The adapter's picture w pixels wide as a JPEG, made once and kept (by its path, size and time) in cache_dir."""
    import hashlib as _h
    from PIL import Image
    st = p.stat()
    key = _h.sha1(f"{p}|{st.st_size}|{int(st.st_mtime)}|{w}".encode("utf-8")).hexdigest()[:20]
    out = Path(cache_dir) / (key + ".jpg")
    if not out.is_file():
        out.parent.mkdir(parents=True, exist_ok=True)
        with Image.open(p) as im:
            im = im.convert("RGB")
            im.thumbnail((w, w * 2))
            tmp = Path(str(out) + ".part")
            im.save(tmp, "JPEG", quality=84)
            tmp.replace(out)
    return out


def chosen(kit, painter, loras):
    """The adapters asked for a run, checked: of the painter's family, here, four at most, each with its strength."""
    if not loras:
        return []
    fam = family_of(painter)
    if not isinstance(loras, list) or len(loras) > MAX_LORAS:
        raise ValueError(f"adapters: {MAX_LORAS} at most")
    out = []
    for x in loras:
        lid = _safe_id((x or {}).get("id"))
        if lid.split("/")[0] != fam:
            raise ValueError(f"{Path(lid).name} is an adapter for {TITLES.get(lid.split('/')[0], lid.split('/')[0])}, not for this painter")
        p = path_of(kit, lid)
        try:
            w = float((x or {}).get("weight", WEIGHT))
        except (TypeError, ValueError):
            raise ValueError("an adapter's strength: a number")
        if not -2.0 <= w <= 2.0:
            raise ValueError("an adapter's strength: from -2 to 2")
        if round(w, 2) == 0:                         # HERESY 1341: at nought it paints nothing; neither loaded nor its room asked
            continue
        if lid not in [o["id"] for o in out]:
            out.append({"id": lid, "weight": round(w, 2), "mb": round(p.stat().st_size / 2 ** 20)})
    return out


def kohya_to_comfy(sd, modules, prefix="diffusion_model."):
    """A kohya adapter's tensors under the names diffusers' loaders read: lora_unet_X.lora_down/lora_up/alpha become
    PREFIX + the layer's own name + .lora_A/.lora_B (alpha / rank put into lora_B). Other keys pass as they are.
    Returns (the tensors, how many kohya layers found no layer of the transformer)."""
    if not any(k.startswith("lora_unet_") for k in sd):
        return sd, 0
    names = {"lora_unet_" + m.replace(".", "_"): m for m in modules}
    out, missed, done = {}, 0, set()
    for k, v in sd.items():
        if not k.startswith("lora_unet_"):
            out[k] = v
            continue
        base = k.split(".", 1)[0]
        if base in done:
            continue
        done.add(base)
        m = names.get(base)
        down, up = sd.get(base + ".lora_down.weight"), sd.get(base + ".lora_up.weight")
        if m is None or down is None or up is None:
            missed += 1
            continue
        rank = down.shape[0]
        alpha = sd.get(base + ".alpha")
        scale = float(alpha.item()) / rank if alpha is not None else 1.0
        out[prefix + m + ".lora_A.weight"] = down
        out[prefix + m + ".lora_B.weight"] = up * scale if scale != 1.0 else up
    return out, missed
