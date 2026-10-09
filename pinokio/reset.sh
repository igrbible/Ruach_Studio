#!/bin/bash
# Ruach Studio under Pinokio (HERESY 1259): Reset takes away what Install makes and makes again, nothing else: the two Python
# environments (.venv, .venv-art) and the engine's build (build/build). The songs (outputs/), the models (models/, checkpoints/,
# artwork/, whisper/, separation/, hf_cache/), the LoRAs and the settings (user/, settings.json) stay where they are.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 1
for d in .venv .venv-art build/build; do
    if [ -e "$d" ]; then echo "  removing $d ($(du -sh "$d" 2>/dev/null | cut -f1))"; rm -rf "$d"; fi
done
echo "done: Install makes them again; your songs, models and settings were not touched"
