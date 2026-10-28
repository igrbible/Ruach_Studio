"""HERESY 1169 · 1316: the Artist's LoRAs (Viktor 10.10.2026: «LoRA сам скачаешь для тестов или мне самому подтянуть»; «Положил в
artwork/loras/<семейство>/»; «предусмотри скан поддиректорий»; «Если возле адаптера лежит его картинка, её тоже возьми в
представление. И прикрути сканирование Civitai по хешу с подтяжкой инфы по адаптеру, если он там есть. Такое в LoRA Manager в
ComfyUI заточено»; «Адаптеры пользователи пусть себе тянут по твоему Гайду прямо в комнате»).

KIT/artwork/loras/FAMILY/… holds the adapters, each family a painter's: qwen-image-2.1, qwen-image-2512 (1405: sdxl gone; 1428: krea2);
any depth of folders below it, a folder a group. Beside an adapter: its picture (NAME.preview.png, .jpg…, or NAME.png, .jpeg…),
and what other tools wrote of it: NAME.metadata.json (ComfyUI's LoRA Manager), NAME.civitai.info (Civitai Helper),
NAME.cm-info.json (Stability Matrix). A look-up on Civitai sends the file's SHA-256 alone and keeps the answer as
NAME.civitai.info, and its first picture rated safe as NAME.preview.EXT when there is none; a hash Civitai does not know is
remembered in the lab's cache, not beside the file.

kohya_to_comfy() turns a kohya adapter (lora_unet_blocks_0_attn_gate…) into the names diffusers' loaders read
(diffusion_model.blocks.0.attn.gate…), by the transformer's own layer names: diffusers takes such a file without a word and
reaches none of its layers (measured: 2 of Viktor's 9 Krea 2 adapters)."""
import hashlib, json, os, re, shutil, struct, time, urllib.error, urllib.request
from pathlib import Path

FAMILIES = {"qwen-image-2.1": ("qwen21", "qwen21-fp8"),   # HERESY 1442   # HERESY 1428: Krea 2 gone   # HERESY 1405: SDXL gone
            "qwen-image-2512": ("qwen2512-q4", "qwen2512-q6", "qwen2512-fp8")}
TITLES = {"qwen-image-2.1": "Qwen-Image 2.1", "qwen-image-2512": "Qwen-Image 2512"}
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


# HERESY 1353 (Viktor 11.10.2026: «Оба адаптера от медведя — мертвецы»; «В LoRA менеджере заведи контекстное окно... инфо, триггер,
# удалить»): what an adapter is made for, read from its header alone (no tensor loaded): the layers its names aim at and how wide they
# are. A Qwen-Image 2512 layer is 3072 wide and 2.1's 4096 (their configs: 24 and 32 heads of 128), Krea 2's 6144; SD's cross-attention
# takes 768 (1.5), 1024 (2) or 2048 (XL). Where the names and widths do not say, no claim is made.
ARCH = {"qwen-image-2512": "Qwen-Image (2512, 2509, Edit)", "qwen-image-2.1": "Qwen-Image 2.1", "qwen-image": "Qwen-Image", "krea2": "Krea 2",
        "sdxl": "SDXL", "sd1": "SD 1.5", "sd2": "SD 2", "sd3": "SD 3", "flux": "FLUX", "wan": "Wan"}
SIDE = (".metadata.json", ".civitai.info", ".cm-info.json", ".txt")


def tensors(p):
    """The tensors' names and shapes from the safetensors header: {name: shape} ({} when it cannot be read)."""
    try:
        with open(p, "rb") as f:
            n = struct.unpack("<Q", f.read(8))[0]
            if n > 64 * 2 ** 20:
                return {}
            h = json.loads(f.read(n).decode("utf-8", "replace"))
    except (OSError, ValueError, struct.error):
        return {}
    return {k: v.get("shape") or [] for k, v in h.items() if k != "__metadata__" and isinstance(v, dict)}


def made_for(p):
    """(the model's key in ARCH or None, {format, layers, rank}): the model an adapter's layers belong to, by their names and widths."""
    ts = tensors(p)
    names = list(ts)
    fmt = ("kohya" if any(k.startswith(("lora_unet_", "lora_te")) for k in names) else "LyCORIS LoKr" if any(".lokr_w" in k for k in names)
           else "LyCORIS LoHa" if any(".hada_w" in k for k in names) else "PEFT" if any(".default." in k for k in names)
           else "ComfyUI" if any(k.startswith("diffusion_model.") for k in names) else "diffusers" if any(k.startswith("transformer.") for k in names)
           else ("PEFT without a prefix" if any(".lora_A." in k for k in names) else "without a prefix") if names else "")
    layers = {re.sub(r"\.(lora_A|lora_B|lora_down|lora_up|lora_mid|alpha|dora_scale|diff|diff_b|lokr_w\d(_[ab])?|lokr_t\d|hada_w\d_[ab]|hada_t\d)"
                     r"(\.default)?(\.weight)?$", "", k) for k in names}
    rank = next((s[0] for k, s in ts.items() if re.search(r"\.(lora_A|lora_down)(\.default)?\.weight$", k) and len(s) == 2), None)

    def width(pat):
        for k, s in ts.items():
            if re.search(pat, k) and re.search(r"(lora_A|lora_down)(\.default)?\.weight$", k) and len(s) == 2:
                return s[1]
        return None
    flat = "\n".join(sorted(layers))
    blocks = max([int(m.group(1)) for m in re.finditer(r"transformer_blocks[._](\d+)[._]", flat)] or [-1])
    arch = None
    if re.search(r"double_blocks|single_blocks|single_transformer_blocks", flat):
        arch = "flux"
    elif re.search(r"joint_blocks", flat):
        arch = "sd3"
    elif re.search(r"(input_blocks|output_blocks|down_blocks|up_blocks|middle_block|mid_block)[._]\d", flat):
        w = width(r"attn2[._]to_k")
        arch = "sdxl" if w == 2048 or "lora_te2" in flat else "sd2" if w == 1024 else "sd1" if w == 768 else None
    elif re.search(r"attn[._](to_gate|gate|wq|wk|wv|wo)$", flat, re.M):
        arch = "krea2"
    elif re.search(r"img_mlp|txt_mlp|img_mod|txt_mod|add_[qkv]_proj|to_add_out", flat):
        w = width(r"attn[._](to_q|to_k|add_q_proj)")
        arch = ("qwen-image-2.1" if w == 4096 else "qwen-image-2512" if w == 3072 and (blocks > 18 or re.search(r"img_mlp|txt_mlp|img_mod|txt_mod", flat))
                else "qwen-image-2512" if blocks >= 32 else "qwen-image" if w is None else None)
    elif re.search(r"blocks[._]\d+[._](self_attn|cross_attn)[._]", flat):
        arch = "wan"
    return arch, {"format": fmt, "layers": len(layers), "rank": rank}


def fits(arch, fam):
    """True when an adapter made for arch is the family's own, False when it is another model's, None when its layers do not say."""
    if not arch:
        return None
    if arch == "qwen-image":
        return fam.startswith("qwen-image")
    return arch == fam


def sidecars(p):
    """What lies beside an adapter as its own: its pictures and what other tools wrote of it (never another adapter's)."""
    s = str(_stem(p))
    return [Path(s + x) for x in PICS + SIDE if Path(s + x).is_file()]


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
    arch, _ = made_for(p)                             # HERESY 1353: the model its layers belong to, and whether it is this family's
    e["made_for"], e["fits"] = arch, fits(arch, fam)
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
    return {"root": "artwork/loras", "families": out, "titles": TITLES, "arch": ARCH}   # HERESY 1353: the models' names


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
            o = {"id": lid, "weight": round(w, 2), "mb": round(p.stat().st_size / 2 ** 20)}
            keys = keyframes((x or {}).get("keys"))  # HERESY 1365: its strength over the steps
            if keys:
                o["keys"] = keys
            out.append(o)
    return out


KEYS_MAX = 8


def keyframes(keys):
    """HERESY 1365: an adapter's keyframes checked: [[share of the steps 0–1, multiplier 0–2]…], two to KEYS_MAX, in order of their
    share; None when there are none, or when they say «the whole strength all the way» (nothing to do per step)."""
    if keys is None or keys == []:
        return None
    if not isinstance(keys, list) or not 1 <= len(keys) <= KEYS_MAX:
        raise ValueError(f"an adapter's keyframes: one to {KEYS_MAX}, each a share of the steps and a multiplier")
    out = []
    for k in keys:
        try:
            s, m = float(k[0]), float(k[1])
        except (TypeError, ValueError, IndexError, KeyError):
            raise ValueError("an adapter's keyframe: a share of the steps (0 to 1) and a multiplier (0 to 2)")
        if not (0 <= s <= 1 and 0 <= m <= 2):
            raise ValueError("an adapter's keyframe: a share of the steps from 0 to 1, a multiplier from 0 to 2")
        out.append([round(s, 4), round(m, 3)])
    out.sort(key=lambda k: k[0])
    if all(m == 1 for _, m in out):
        return None
    return out


def key_at(keys, p):
    """HERESY 1365: the multiplier at p (0–1 of the steps), straight between keyframes; before the first, the first's; after the last, the
    last's (a step down is two keyframes at the same share: the later one holds from there)."""
    if not keys:
        return 1.0
    if p < keys[0][0]:
        return keys[0][1]
    m = keys[0][1]
    for (p0, m0), (p1, m1) in zip(keys, keys[1:]):
        if p < p1:
            return m0 + (m1 - m0) * (p - p0) / (p1 - p0) if p1 > p0 else m1
        m = m1
    return m


def step_weights(sched, i, n):
    """HERESY 1365: the adapters' strengths at step i of n: [(adapter, its strength × its keyframes' multiplier there)…]."""
    p = i / max(1, n - 1)
    return [(name, w * key_at(keys, p)) for name, w, keys in sched]


META_KEYS = ("ss_output_name", "ss_base_model_version", "ss_network_module", "ss_network_dim", "ss_network_alpha", "ss_num_epochs", "ss_steps",
             "ss_max_train_steps", "ss_learning_rate", "ss_resolution", "ss_num_train_images", "ss_training_started_at", "ss_training_finished_at",
             "modelspec.title", "modelspec.author", "modelspec.architecture", "modelspec.description", "modelspec.date", "modelspec.trigger_phrase",
             "modelspec.license", "software", "training_comment", "name", "version", "base_model")


def details(kit, lid, cache=None):
    """HERESY 1353: an adapter for its Info window: its entry, what its file says of itself (the trainer's words, chosen), what its
    layers are made for, the files beside it, its SHA-256 when known."""
    p = path_of(kit, lid)
    e = entry(kit, p, cache)
    arch, how = made_for(p)
    md = header(p)
    meta = {k: str(md[k])[:400] for k in META_KEYS if md.get(k) not in (None, "", "None")}
    c = (cache or {}).get(lid) or {}
    return dict(e, arch=arch, arch_title=ARCH.get(arch, ""), how=how, meta=meta, beside=[q.name for q in sidecars(p)],
                sha256=c.get("sha256") or e["info"].get("sha256") or "", path="artwork/loras/" + lid, modified=int(p.stat().st_mtime))


def bin_root(kit):
    return Path(kit) / "trash" / "loras"


STAMP = re.compile(r"^\d{8}-\d{6}(?:-\d+)?$")


def trash(kit, lid):
    """HERESY 1353 (Viktor: «удалить»): an adapter with the files beside it into the art's trash, trash/loras/STAMP/ under its own
    path, a note of what it was beside them; the Librarian's Trash (Art) gives it back or deletes it for good."""
    p = path_of(kit, lid)
    files = [p] + sidecars(p)
    stamp, k = time.strftime("%Y%m%d-%H%M%S"), 2
    while (bin_root(kit) / stamp).exists():
        stamp, k = time.strftime("%Y%m%d-%H%M%S") + f"-{k}", k + 1
    d = bin_root(kit) / stamp
    (d / Path(lid).parent).mkdir(parents=True)
    note = {"id": lid, "name": p.stem, "files": [f.name for f in files], "bytes": sum(f.stat().st_size for f in files), "at": int(time.time()),
            "info": known(p)}
    for f in files:
        shutil.move(str(f), str(d / Path(lid).parent / f.name))
    with open(d / "lora.json", "w", encoding="utf-8") as f:
        json.dump(note, f, ensure_ascii=False, indent=1)
    return {"id": lid, "stamp": stamp}


def trashed(kit):
    """The adapters in the art's trash: [{stamp, id, name, bytes, at}], the newest first."""
    out = []
    if bin_root(kit).is_dir():
        for d in sorted(bin_root(kit).iterdir(), reverse=True):
            note = _read(d / "lora.json") if STAMP.match(d.name) else {}
            if note.get("id"):
                out.append({"stamp": d.name, "id": note["id"], "name": note.get("name") or Path(note["id"]).stem, "bytes": int(note.get("bytes") or 0),
                            "at": int(note.get("at") or 0), "title": (note.get("info") or {}).get("title") or ""})
    return out


def _binned(kit, stamp):
    if not STAMP.match(str(stamp or "")):
        raise ValueError("bad stamp")
    d = bin_root(kit) / stamp
    note = _read(d / "lora.json")
    if not note.get("id"):
        raise FileNotFoundError("no such adapter in the trash")
    return d, note


def restore(kit, stamp):
    """An adapter from the trash back where it was, with the files beside it; refused when a file of its name is there again."""
    d, note = _binned(kit, stamp)
    lid = _safe_id(note["id"])
    home = root(kit) / Path(lid).parent
    for name in note.get("files") or []:
        if (home / name).exists():
            raise ValueError(f"{name} is in artwork/loras/ again: move it aside first")
    home.mkdir(parents=True, exist_ok=True)
    for name in note.get("files") or []:
        f = d / Path(lid).parent / name
        if f.is_file():
            shutil.move(str(f), str(home / name))
    shutil.rmtree(d)
    return {"id": lid}


def gone(kit, stamp):
    """An adapter in the trash deleted for good, on the user's word."""
    d, note = _binned(kit, stamp)
    shutil.rmtree(d)
    return {"id": note["id"]}


def plain_named(sd, family):
    """HERESY 1353: an adapter as PEFT saves it, without its model's prefix (transformer_blocks.0.attn.add_k_proj.lora_A.default.weight:
    tackbear's OilPaint for Qwen-Image), given the prefix diffusers' loaders read, «.default.» taken out. Before, diffusers dropped
    every layer of it without a word (its Qwen loader keeps only «transformer.» names) and the run stopped on «reaches none of this
    painter's layers», though the adapter is the painter's own. Prefixed and kohya files pass as they are."""
    if any(".default." in k for k in sd):
        sd = {k.replace(".lora_A.default.", ".lora_A.").replace(".lora_B.default.", ".lora_B."): v for k, v in sd.items()}
    if not sd or any(k.startswith(("transformer.", "diffusion_model.", "base_model.model.", "lora_unet_", "lora_te", "lycoris_", "text_encoder")) for k in sd):
        return sd
    if any(k.endswith(".alpha") for k in sd):
        return sd                                       # diffusers' Qwen converter takes these (Lightning's own files) and prefixes them itself
    out = {}
    for k, v in sd.items():                              # lora_down/lora_up without an alpha: PEFT's names, at scale one
        out["transformer." + k.replace(".lora_down.weight", ".lora_A.weight").replace(".lora_up.weight", ".lora_B.weight")] = v
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
