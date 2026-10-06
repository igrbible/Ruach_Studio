#!/usr/bin/env python3
"""Make the extra GGUFs the console needs from the shared model library.

1. The Legacy and Blend VAEs, through upstream convert.py's own VAE path
   (same architecture as the Standard VAE; only the source folder and the
   output name differ).
2. The 16 voice/genre sliders (ntc-ai/yue2-particle-sliders, routed-particle
   adapters on the 112 AR attention projections) as one GGUF each plus a
   catalog.json the server reads with --sliders.

Existing outputs are skipped, and a source folder is only looked up when an
output needs it. Every source is checked against its published checksum
before conversion.

    convert-extras.py                  make what is missing
    convert-extras.py --list-outputs   print the files it makes (relative to the
                                       install folder), one per line; nothing else
"""
import hashlib
import importlib.util
import json
import os
import shutil
import sys
import time

import gguf
import numpy as np
from safetensors import safe_open

ROOT = os.path.dirname(os.path.abspath(__file__))
# The sources are found from build/checkpoints (the folder convert.py reads): on one
# machine a link into a shared model library (hf/m-a-p, with hf/Mothersuperior and
# hf/ntc-ai beside it), on another the PyTorch console's own models/ folder.
CKPT = os.path.realpath(os.path.join(ROOT, "build", "checkpoints"))
VAE_OUT = os.path.join(ROOT, "build", "models")
SLIDER_OUT = os.path.join(ROOT, "sliders")


def first_dir(*candidates):
    for c in candidates:
        if os.path.isdir(c):
            return c
    raise SystemExit("none of these exist: " + ", ".join(candidates))


# Where each source may be; looked up only when an output is missing (first_dir), so a run with every
# output present never needs the checkpoints.
VAE_SOURCES = {
    "legacy": (os.path.join(CKPT, "YuE2-Vae-legacy"),),
    "blend": (os.path.join(CKPT, "YuE2-Vae-merge-0.666"),
              os.path.join(CKPT, "..", "Mothersuperior", "YuE2-Vae-merge-0.666")),
}
SLIDER_SOURCES = (os.path.join(CKPT, "particle-sliders"),
                  os.path.join(CKPT, "..", "ntc-ai", "yue2-particle-sliders"))

# plain text when NO_COLOR is set or the output is not a terminal (a log file, a pipe)
COLOR = sys.stdout.isatty() and not os.environ.get("NO_COLOR")
G, Y, R, D, X = ("\033[32m", "\033[33m", "\033[31m", "\033[2m", "\033[0m") if COLOR else ("",) * 5
PROJ = ("q_proj", "k_proj", "v_proj", "o_proj")
MLP_INDEX = (0, 2, 4, 6)   # the Linear layers of nn.Sequential(Linear, LeakyReLU, ...)

stats = {"made": 0, "skipped": 0, "failed": 0}


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 22), b""):
            h.update(block)
    return h.hexdigest()


def load_upstream_converter():
    spec = importlib.util.spec_from_file_location("upstream_convert", os.path.join(ROOT, "build", "convert.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def vae_out(name):
    return os.path.join(VAE_OUT, "YuE2-Vae-%s-F32.gguf" % name)


def load_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def slider_catalog():
    """(source folder, its catalog.json), or (None, None) when the slider source is not on this disk."""
    for c in SLIDER_SOURCES:
        if os.path.isfile(os.path.join(c, "catalog.json")):
            return c, load_json(os.path.join(c, "catalog.json"))
    return None, None


def list_outputs():
    """Every file this script makes, relative to ROOT: the two VAEs, then one GGUF per slider (from the
    slider source's catalog, else from the catalog an earlier run wrote)."""
    outs = [vae_out(name) for name in VAE_SOURCES]
    _, catalog = slider_catalog()
    if catalog is not None:
        outs += [os.path.join(SLIDER_OUT, e["id"] + ".gguf") for e in catalog.get("sliders", [])]
    elif os.path.isfile(os.path.join(SLIDER_OUT, "catalog.json")):
        outs += [os.path.join(SLIDER_OUT, e["file"]) for e in load_json(os.path.join(SLIDER_OUT, "catalog.json")).get("sliders", [])]
    return [os.path.relpath(o, ROOT) for o in outs]


def convert_vae_variant(get_conv, name):
    out = vae_out(name)
    if os.path.exists(out):
        print(f"{G}have{X}      {os.path.basename(out)}")
        stats["skipped"] += 1
        return
    source_dir = os.path.realpath(first_dir(*VAE_SOURCES[name]))
    conv = get_conv()
    manifest = load_json(os.path.join(source_dir, "weights_manifest.json"))
    expected = manifest["files"]["model.safetensors"]["sha256"]
    if sha256(os.path.join(source_dir, "model.safetensors")) != expected:
        print(f"{R}checksum{X}  {source_dir} does not match its manifest; skipped")
        stats["failed"] += 1
        return
    staging = os.path.join(ROOT, "tmp", "vae-" + name)
    os.makedirs(staging, exist_ok=True)
    conv.CHECKPOINT_DIR = os.path.dirname(source_dir)
    conv.COMPONENTS["vae"] = os.path.basename(source_dir)
    conv.OUTPUT_DIR = staging
    conv.convert_vae()
    shutil.move(os.path.join(staging, "YuE2-Vae-F32.gguf"), out)
    os.rmdir(staging)
    print(f"{G}made{X}      {os.path.basename(out)}  {D}{os.path.getsize(out) / 1e6:.1f} MB{X}")
    stats["made"] += 1


def convert_slider(slider_src, entry):
    source = os.path.join(slider_src, entry["weights"])
    out = os.path.join(SLIDER_OUT, entry["id"] + ".gguf")
    if os.path.exists(out):
        stats["skipped"] += 1
        return True
    if sha256(source) != entry["sha256"]:
        print(f"{R}checksum{X}  slider {entry['id']} does not match the catalog; skipped")
        stats["failed"] += 1
        return False
    with safe_open(source, "np") as f:
        record = json.loads((f.metadata() or {}).get("conceptmod", "{}"))
        if record.get("format") != "conceptmod-yue2-routed-particle-ar-v1":
            print(f"{R}format{X}    slider {entry['id']}: {record.get('format')} is not supported")
            stats["failed"] += 1
            return False
        rank, alpha = int(record["rank"]), float(record["alpha"])
        targets = record["targets"]
        w = gguf.GGUFWriter(out, arch="yue2-slider")
        w.add_name("YuE2 slider " + entry["id"])
        w.add_string("yue2-slider.id", entry["id"])
        w.add_string("yue2-slider.format", record["format"])
        w.add_uint32("yue2-slider.rank", rank)
        w.add_float32("yue2-slider.alpha", alpha)
        w.add_uint32("yue2-slider.layers", len(targets) // 4)
        w.add_string("yue2-slider.source_sha256", entry["sha256"])
        particles = f.get_tensor("particles").astype(np.float32)          # [128, 4]
        w.add_tensor("sld.particles", particles)
        w.add_tensor("sld.particles_t", np.ascontiguousarray(particles.T))
        for target in targets:
            _, _, layer, _, proj = target.split(".")                         # model.layers.L.self_attn.P
            key = "adapters." + target.replace(".", "-")
            if float(f.get_tensor(key + ".alpha")) != alpha:
                raise SystemExit("alpha mismatch in " + key)
            base = "sld.%s.%s" % (layer, proj[0])
            w.add_tensor(base + ".down", f.get_tensor(key + ".lora_down.weight").astype(np.float32))
            w.add_tensor(base + ".up", f.get_tensor(key + ".lora_up.weight").astype(np.float32))
            for part, short in (("router", "r"), ("net", "n")):
                for i, index in enumerate(MLP_INDEX):
                    w.add_tensor("%s.%s%d.w" % (base, short, i),
                                 f.get_tensor("%s.bridge.%s.%d.weight" % (key, part, index)).astype(np.float32))
                    w.add_tensor("%s.%s%d.b" % (base, short, i),
                                 f.get_tensor("%s.bridge.%s.%d.bias" % (key, part, index)).astype(np.float32))
        w.write_header_to_file()
        w.write_kv_data_to_file()
        w.write_tensors_to_file()
        w.close()
    stats["made"] += 1
    return True


def main():
    if "--list-outputs" in sys.argv[1:]:
        print("\n".join(list_outputs()))
        return 0
    start = time.time()
    os.makedirs(VAE_OUT, exist_ok=True)
    os.makedirs(SLIDER_OUT, exist_ok=True)
    loaded = []

    def get_conv():   # upstream convert.py, loaded once and only when a VAE is made
        if not loaded:
            loaded.append(load_upstream_converter())
        return loaded[0]

    for name in VAE_SOURCES:
        convert_vae_variant(get_conv, name)

    slider_src, catalog = slider_catalog()
    out_catalog = os.path.join(SLIDER_OUT, "catalog.json")
    if catalog is None:
        # no source on this disk: fine when an earlier run made every slider its catalog lists
        if not os.path.isfile(out_catalog):
            raise SystemExit("no slider source (catalog.json) in any of: " + ", ".join(SLIDER_SOURCES))
        entries = load_json(out_catalog).get("sliders", [])
        have = [e for e in entries if os.path.isfile(os.path.join(SLIDER_OUT, e["file"]))]
        stats["skipped"] += len(have)
        if len(have) != len(entries):
            raise SystemExit(f"{len(entries) - len(have)} sliders are missing and their source is not on this disk: "
                             + ", ".join(SLIDER_SOURCES))
    else:
        entries = []
        for entry in catalog["sliders"]:
            if convert_slider(slider_src, entry):
                entries.append({"id": entry["id"], "label": entry["label"], "description": entry.get("description", ""),
                                "file": entry["id"] + ".gguf", "source_sha256": entry["sha256"]})
        with open(out_catalog, "w", encoding="utf-8") as f:
            json.dump({"source": "ntc-ai/yue2-particle-sliders", "release": catalog.get("release"),
                       "experimental": catalog.get("experimental"), "recommended_range": catalog.get("recommended_range"),
                       "sliders": entries}, f, indent=2)
    size = sum(os.path.getsize(os.path.join(SLIDER_OUT, e["file"])) for e in entries) / 1e6
    print(f"{G}sliders{X}   {len(entries)} in {os.path.realpath(SLIDER_OUT)}  {D}{size:.0f} MB{X}")
    print(f"\nextras: made {G}{stats['made']}{X}, already here {stats['skipped']}, "
          f"failed {R if stats['failed'] else ''}{stats['failed']}{X}  in {time.time() - start:.0f}s")
    return 1 if stats["failed"] else 0


if __name__ == "__main__":
    sys.exit(main())
