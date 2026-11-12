# launcher/paths.sh: where the Studio's weights live, one line a place (HERESY 2330)
# Written by `python3 lab/paths.py --sh > launcher/paths.sh` from lab/paths.py, the one source; do not edit by hand:
# lab/test_paths.py turns red when the two differ. Sourced with ROOT set: every place is a path under $ROOT.
: "${ROOT:?ROOT is the Studio folder}"
RS_MODELS="$ROOT/models"
RS_ENGINE="$ROOT/models/engine"
RS_ENGINE_YUE2="$ROOT/models/engine/yue2"
RS_ENGINE_FINETUNES="$ROOT/models/engine/finetunes"
RS_ENGINE_LEGACY="$ROOT/models/engine/finetunes/legacy"
RS_ENGINE_OWN="$ROOT/models/engine/finetunes/own"
RS_ENGINE_VAE="$ROOT/models/engine/vae"
RS_ENGINE_TOKENIZERS="$ROOT/models/engine/tokenizers"
RS_ENGINE_HELPERS="$ROOT/models/engine/helpers"
RS_LISTENER="$ROOT/models/listener"
RS_WRITER="$ROOT/models/writer"
RS_REFINER="$ROOT/models/refiner"
RS_REFINER_SEPARATION="$ROOT/models/refiner/separation"
RS_REFINER_UPSCALE="$ROOT/models/refiner/upscale"
RS_REFINER_UNIVERSR="$ROOT/models/refiner/upscale/universr"
RS_REFINER_UPBUNDLE="$ROOT/models/refiner/upscale/upbundle"
RS_REFINER_MIDI="$ROOT/models/refiner/midi"
RS_REFINER_INSTRUMENTS="$ROOT/models/refiner/instruments"
RS_REFINER_AMBIENT="$ROOT/models/refiner/ambient"
RS_ARTIST="$ROOT/models/artist"
RS_ARTIST_LORAS="$ROOT/models/artist/loras"
RS_ARTIST_UPSCALERS="$ROOT/models/artist/upscalers"
RS_VIDEOGRAPHER="$ROOT/models/videographer"
RS_VIDEO_H3="$ROOT/models/videographer/minimax-h3"
RS_VIDEO_LUTS="$ROOT/models/videographer/luts"
RS_NARRATOR="$ROOT/models/narrator"
RS_MISC="$ROOT/models/misc"
RS_WHISPER="$ROOT/models/misc/whisper"
RS_SEEDVR2="$ROOT/models/misc/seedvr2"
RS_COMFY="$ROOT/models/comfy"
RS_INCOMING="$ROOT/models/.incoming"
RS_MAP_OLD=(
  '^models/(YuE2-3B-(BF16|F16|F32|Q8_0|Q6_K|Q5_K_M|Q4_K_M|Q4_0)\.gguf)$'
  '^models/(YuE2-3B-RS-(FW|TW)-(.+)-(BF16|F16|F32|Q8_0|Q6_K|Q5_K_M|Q4_K_M|Q4_0)\.gguf)$'
  '^models/(YuE2-3B-IRA[^/]*\.gguf)$'
  '^models/(YuE2-3B-[^/]*\.gguf)$'
  '^models/(YuE2-(Vae|VAE)[^/]*\.gguf)$'
  '^models/(yue2-mothersuperior-realaudio-tokenizer[^/]*\.gguf)$'
  '^models/((MERT|SheetSage)[^/]*\.gguf)$'
  '^models/((MERT|SheetSage)[^/]*/.+)$'
  '^models/RS-(FW|TW)-([^/]+)/(.+)$'
  '^models/(YuE2-VAE-RS/.+)$'
  '^VAE-RS/(YuE2-VAE-RS[^/]*\.gguf)$'
  '^models/(eagle3/.+)$'
  '^models/(muscriptor/.+)$'
  '^models/upbundle/(.+)$'
  '^models/instruments/(.+)$'
  '^models/ambient/(.+)$'
  '^models/minimax-h3/(.+)$'
  '^models/luts/(.+)$'
  '^models/seedvr2/(.+)$'
  '^models/reader/(.+)$'
  '^checkpoints/(YuE2-3B/.+)$'
  '^checkpoints/(YuE2-Vae[^/]*/.+)$'
  '^checkpoints/(yue2-mothersuperior-realaudio-tokenizer[^/]*/.+)$'
  '^checkpoints/((YuE2-hum-to-song|particle-sliders)/.+)$'
  '^checkpoints/((Qwen2\.5-Omni[^/]*|audiobox-aesthetics)/.+)$'
  '^checkpoints/(Qwopus[^/]*/.+)$'
  '^checkpoints/((MERT|SheetSage)[^/]*/.+)$'
  '^checkpoints/comfy/(.+)$'
  '^separation/(.+)$'
  '^universr/(.+)$'
  '^whisper/(.+)$'
  '^artwork/(.+)$'
)
RS_MAP_NEW=(
  'models/engine/yue2/\1'
  'models/engine/finetunes/RS-\2-\3/\1'
  'models/engine/finetunes/legacy/\1'
  'models/engine/finetunes/own/\1'
  'models/engine/vae/\1'
  'models/engine/tokenizers/\1'
  'models/misc/\1'
  'models/misc/\1'
  'models/engine/finetunes/RS-\1-\2/\3'
  'models/engine/vae/\1'
  'models/engine/vae/\1'
  'models/engine/helpers/\1'
  'models/refiner/midi/\1'
  'models/refiner/upscale/upbundle/\1'
  'models/refiner/instruments/\1'
  'models/refiner/ambient/\1'
  'models/videographer/minimax-h3/\1'
  'models/videographer/luts/\1'
  'models/misc/seedvr2/\1'
  'models/narrator/\1'
  'models/engine/yue2/\1'
  'models/engine/vae/\1'
  'models/engine/tokenizers/\1'
  'models/engine/helpers/\1'
  'models/listener/\1'
  'models/writer/\1'
  'models/misc/\1'
  'models/comfy/\1'
  'models/refiner/separation/\1'
  'models/refiner/upscale/universr/\1'
  'models/misc/whisper/\1'
  'models/artist/\1'
)
# rs_new_of OLD: where an old relative path lies now (lab/paths.py new_of); nothing printed and status 1: not the Studio's
rs_new_of() {
  local old="$1" i k out rep
  for i in "${!RS_MAP_OLD[@]}"; do
    if [[ $old =~ ${RS_MAP_OLD[$i]} ]]; then
      out="${RS_MAP_NEW[$i]}"
      # the replacement quoted: bash 5.2 reads a bare & in it as the match (a file named «A & B» kept as it is)
      for k in 9 8 7 6 5 4 3 2 1; do rep="${BASH_REMATCH[$k]:-}"; out="${out//\\$k/"$rep"}"; done
      printf '%s\n' "$out"; return 0
    fi
  done
  return 1
}
# rs_engine_gguf NAME: the engine's GGUF of this name, as a path under $ROOT (lab/paths.py engine_gguf)
rs_engine_gguf() {
  local rel; rel=$(rs_new_of "models/$1") || rel="models/$1"
  printf '%s\n' "$ROOT/$rel"
}
# rs_hf_place INCLUDE: "STRIP<TAB>DIR" for a repo path laid out as 2.0.6's folders (lab/paths.py hf_place)
rs_hf_place() {
  local new a b; new=$(rs_new_of "$1") || { echo "$1: the map knows no place for it (lab/paths.py MAP)" >&2; return 1; }
  a="$1"; b="$new"
  while [[ $a == */* && $b == */* && ${a##*/} == "${b##*/}" ]]; do a="${a%/*}"; b="${b%/*}"; done
  printf '%s/\t%s\n' "$a" "$b"
}
# rs_backbones: every YuE2-3B-*.gguf the engine may sing with, a path a line, sorted by name (lab/paths.py backbones)
rs_backbones() {
  local f; for f in "$RS_ENGINE_YUE2"/YuE2-3B-*.gguf "$RS_ENGINE_FINETUNES"/*/YuE2-3B-*.gguf; do [ -f "$f" ] && printf '%s\t%s\n' "${f##*/}" "$f"; done | LC_ALL=C sort | cut -f2
}
