#!/bin/bash
# Ruach Studio · fetch-models.sh — the models a song needs, each said with its size before anything comes.
#
#   ./fetch-models.sh                  the least a song needs: the Studio's default backbone at this card's quant and the decoders
#                                      (m-a-p's Standard, which also encodes, and our YuE2-VAE-RS x3 v1, the default: HERESY 2329)
#   ./fetch-models.sh --quant Q8_0     the backbone at another quant: BF16, Q8_0, Q6_K, or Q5_K_M (m-a-p's own: no fine-tune at it)
#   ./fetch-models.sh --only PACKS     packs instead, a comma list: base, extras, whisper, transcriber, upscale, loras, stems, fw
#   ./fetch-models.sh --all            the least a song needs and every pack (what an install brought before 2.0.7)
#   ./fetch-models.sh --update         only what changed among the files here (a new pin of a file you have); nothing new comes
#   ./fetch-models.sh --plan           the plan alone: nothing is downloaded
#   ./fetch-models.sh --yes            no question (the plan is still said)
#   ./fetch-models.sh --check          what is here and what is missing: nothing is downloaded
#
# The plan names each file, its size, the total and the free disk, then asks: [Y/n] in a terminal; started from the desktop
# (no terminal), a zenity or kdialog dialog; with neither, it says so and downloads nothing. The packs are optional: the
# Studio's Engine -> Models fetches each when you want it (Whisper for the lyrics check and karaoke timing, the transcriber
# for covers from a recording, the extra decoders, upscale, the LoRAs, the stems: these need audio-separator, which comes
# with the full lab, lab/install-venv.sh). Every file comes at the revision pinned in heresy/hf-revisions.txt, through the
# pinned downloader (tools/hf-env.sh), and counts as here only when it has the pinned size.
# Viktor 08.11.2026, the AppImage's first start on his laptop: «Нужно сообщение, предупреждающее и дохерища файлов для
# скачивания»; «Пересмотри, чтобы ничего лишнего не скачивалось при первой установке или при апдейте версии Студии».
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# HERESY 2330: every weight's place (launcher/paths.sh, lab/paths.py's twin): the repos keep 2.0.6's layout, each file lands in models/<room>/
source "$ROOT/launcher/paths.sh"
QUANT=""; ONLY=""; ALL=0; UPDATE=0; PLAN=0; YES=0; CHECK=0
while [ $# -gt 0 ]; do
  case "$1" in
    --quant) [ -n "${2:-}" ] || { echo "--quant needs a value: BF16, Q8_0, Q6_K, Q5_K_M"; exit 2; }; QUANT="$2"; shift ;;
    --only) ONLY="${2:-}"; shift ;;
    --all) ALL=1 ;;
    --update) UPDATE=1 ;;
    --plan) PLAN=1 ;;
    --yes|-y) YES=1 ;;
    --check) CHECK=1 ;;
    -h|--help) sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $1 (see --help)"; exit 2 ;;
  esac
  shift
done
B=$'\e[1m' G=$'\e[32m' Y=$'\e[33m' R=$'\e[31m' D=$'\e[2m' X=$'\e[0m'
if [ -n "${NO_COLOR:-}" ] || [ ! -t 1 ]; then B="" G="" Y="" R="" D="" X=""; fi

if [ $CHECK = 1 ]; then   # as before 2.0.7: the backbone, the decoder and the transcriber here or not, then every pack
  rc=0
  echo "${B}1 · YuE2 (goldhub/Ruach_Studio_Models_v2: m-a-p's models as Serveurperso made them GGUF, byte for byte)${X}"
  mapfile -t bbs < <(rs_backbones); [ ${#bbs[@]} -gt 0 ] || bbs=("$RS_ENGINE_YUE2/YuE2-3B-*.gguf")
  for f in "${bbs[@]}" "$RS_ENGINE_VAE/YuE2-Vae-F32.gguf" "$RS_ENGINE_VAE/YuE2-VAE-RS-x3_v1-F32.gguf"; do
    [ -s "$f" ] && echo "here      ${f#"$ROOT"/}" || { echo "missing   ${f#"$ROOT"/}"; rc=1; }
  done
  echo; echo "${B}2 · the packs${X}"
  "$ROOT/heresy/fetch-heresy.sh" --check || rc=1
  exit $rc
fi

# shellcheck source=tools/hf-env.sh
source "$ROOT/tools/hf-env.sh"
V2=goldhub/Ruach_Studio_Models_v2      # HERESY 1445: m-a-p's GGUFs (Serveurperso's, byte for byte), the decoders, Whisper, UniverSR…
FT=goldhub/YuE2-RS-Finetunes           # HERESY 1794: Ruach Studio's own fine-tunes; 2065: RS-TW 2.0x0.75, the Studio's default
RS=$FT                                 # HERESY 2329: our decoders, YuE2-VAE-RS x3 v1 (the Studio's default, 2306) and v2, float32; HERESY 2330 (11.11.2026): public now, in goldhub/YuE2-RS-Finetunes under VAE-RS/ (the private goldhub/YuE2-VAE-RS no more)
V2R=$(hf_rev $V2); FTR=$(hf_rev $FT); RSR=$(hf_rev $RS)
if [ -z "$QUANT" ]; then   # this card's, as launcher/install.sh and the AppImage take it (launcher/env.sh's ruach_quant)
  QUANT=$(bash -c '. "$1/launcher/env.sh" >/dev/null 2>&1; ruach_quant' _ "$ROOT" 2>/dev/null); QUANT=${QUANT:-BF16}
fi
case "$QUANT" in BF16|Q8_0|Q6_K|Q5_K_M) ;; *) echo "--quant takes BF16, Q8_0, Q6_K or Q5_K_M"; exit 2 ;; esac

PACKS=",base,extras,whisper,transcriber,upscale,loras,stems,fw,"
want=""
[ $ALL = 1 ] && want="${PACKS#,}"
[ -n "$ONLY" ] && want="$ONLY"
for p in ${want//,/ }; do [[ "$PACKS" == *",$p,"* ]] || { echo "--only takes ${PACKS:1:-1}"; exit 2; }; done
has() { [[ ",$want," == *",$1,"* ]]; }

# the plan's lines: a file each (repo, revision, file or pattern, the folder under the Studio it goes into, its pack); HERESY 2330: the folder and
# the repo's path name where 2.0.6 kept it, lab/paths.py's map says where it lands now (models_plan.py and the download below read it so)
E="$ROOT/tmp/fetch-models.entries"; mkdir -p "$ROOT/tmp"; : > "$E"
add() { printf '%s\t%s\t%s\t%s\t%s\n' "$1" "$2" "$3" "${4:-.}" "$5" >> "$E"; }   # «.»: the Studio's own folder (a tab-separated read drops an empty field)
# the Studio's default backbone (start.sh starts it when settings.json names no model): RS-TW 2.0x0.75 at the quant; RS-FW 2.4x0.75
# where the pinned repo has no RS-TW at it; m-a-p's own at Q5_K_M (there is no fine-tune at it) or where the repo has neither
backbone() {
  local m out
  if [ "$QUANT" != Q5_K_M ]; then
    for m in RS-TW-2.0x0.75 RS-FW-2.4x0.75; do
      out=$(printf '%s\t%s\t%s\t%s\t%s\n' $FT "$FTR" "YuE2-3B-$m-$QUANT.gguf" models song | "$HPY" "$ROOT/tools/models_plan.py" "$ROOT" 2>/dev/null)
      case "$out" in gone*|"#offline"*|"") ;; *) add $FT "$FTR" "YuE2-3B-$m-$QUANT.gguf" models song; return ;; esac
    done
  fi
  add $V2 "$V2R" "models/YuE2-3B-$QUANT.gguf" "" song   # paths: repo
}
pack_entries() {
  local q
  has base && add $V2 "$V2R" "models/YuE2-3B-$QUANT.gguf" "" base   # paths: repo
  # HERESY 2307: Legacy and the 0.666 Blend are no longer fetched (Viktor 10.11.2026); they stay in the Hugging Face repo.
  # HERESY 2329: the extra decoder is ours, RS x3 v2 (v1 comes with every song's least)
  has extras && add $RS "$RSR" "VAE-RS/YuE2-VAE-RS-x3_v2-F32.gguf" "" extras
  has whisper && add $V2 "$V2R" "whisper/whisper-large-v3-ct2-float16/*" "" whisper   # paths: repo
  if has transcriber; then add $V2 "$V2R" "models/SheetSage2-Q8_0.gguf" "" transcriber; add $V2 "$V2R" "models/MERT-v2-FullSong-Q8_0.gguf" "" transcriber; fi   # paths: repo
  if has upscale; then add $V2 "$V2R" "universr/*" "" upscale; add $V2 "$V2R" "models/upbundle/apollo/*" "" upscale; fi   # paths: repo
  if has fw && [ "$QUANT" != Q5_K_M ]; then add $FT "$FTR" "YuE2-3B-RS-TW-2.0x0.75-$QUANT.gguf" models fw; fi
  if has loras; then   # the Studio's own and the Kit's library as v2 holds them (loras/<folder>/<file>), and the Kit's three from their authors
    add $V2 "$V2R" "loras/*" . loras
    local e folder repo sub files f
    while IFS= read -r e; do
      IFS='|' read -r folder repo sub files <<< "$e"
      [ "$repo" = $V2 ] && continue
      for f in $files; do add "$repo" "$(hf_rev "$repo")" "${sub:+$sub/}$f" "loras/$folder" loras; done
    done < <(sed -n 's/^  "\([^"|]*|[^"]*\)"$/\1/p' "$ROOT/tools/download-loras.sh")
  fi
  return 0
}
if [ $UPDATE = 1 ]; then
  # every file the Studio can have from these repos, at every quant: models_plan.py --update keeps only those here that changed
  for q in BF16 Q8_0 Q6_K Q5_K_M; do add $V2 "$V2R" "models/YuE2-3B-$q.gguf" "" song; done   # paths: repo
  for q in BF16 Q8_0 Q6_K; do for m in RS-TW-2.0x0.75 RS-TW-2.0x0.9 RS-FW-2.4x0.75; do add $FT "$FTR" "YuE2-3B-$m-$q.gguf" models song; done; done
  add $V2 "$V2R" "models/YuE2-Vae-F32.gguf" "" song   # paths: repo
  # HERESY 2329: our decoder is the Studio's default from 2.0.7, so an update brings it once («newdefault»: wanted though not here);
  # v2 only where it is here already (a newer pin)
  add $RS "$RSR" "VAE-RS/YuE2-VAE-RS-x3_v1-F32.gguf" "" newdefault; add $RS "$RSR" "VAE-RS/YuE2-VAE-RS-x3_v2-F32.gguf" "" song
  want="${PACKS#,}"; want="${want/,fw,/,}"; pack_entries
else
  [ -z "$ONLY" ] && { backbone; add $V2 "$V2R" "models/YuE2-Vae-F32.gguf" "" song; add $RS "$RSR" "VAE-RS/YuE2-VAE-RS-x3_v1-F32.gguf" "" song; }   # paths: repo
  pack_entries
fi

P="$ROOT/tmp/fetch-models.plan"
"$HPY" "$ROOT/tools/models_plan.py" "$ROOT" $([ $UPDATE = 1 ] && echo --update) < "$E" > "$P"; prc=$?
hs() { awk -v n="${1:-0}" 'BEGIN { if (n >= 1e9) printf "%.1f GB", n/1e9; else if (n >= 1e6) printf "%.0f MB", n/1e6; else printf "%.0f KB", n/1e3 }'; }
read -r _ TOTAL NGET FREE < <(grep '^#total' "$P" | tr '\t' ' ')
TOTAL=${TOTAL:-0}; NGET=${NGET:-0}; FREE=${FREE:--1}
offline=$(awk -F'\t' '$1 == "#offline" {print $2}' "$P" | sort -u | tr '\n' ' ')
# the packs whose own downloaders fetch them (no pinned file list to size them by): their measured size (lab/weights.py's PARTS)
approx=""; aprx_bytes=0; aprx_n=0
if [ $UPDATE = 0 ]; then
  STEMS=("$RS_REFINER_SEPARATION/roformer/model_bs_roformer_ep_317_sdr_12.9755.ckpt" "$RS_REFINER_SEPARATION/demucs/htdemucs_ft.yaml" "$RS_REFINER_SEPARATION/demucs/f7e0c4bc-ba3fe64a.th")
  stems_here=1; for f in "${STEMS[@]}"; do [ -s "$f" ] || stems_here=0; done
  if has stems && [ $stems_here = 0 ]; then
    if [ -x "$ROOT/.venv/bin/audio-separator" ]; then approx+="stems (the separation models, through audio-separator) ≈ 1.0 GB"$'\n'; aprx_bytes=$((aprx_bytes + 1000000000)); aprx_n=$((aprx_n + 1))
    else approx+="stems: not here — they need audio-separator, which comes with the full lab (bash lab/install-venv.sh); this install skips them"$'\n'; fi
  fi
fi

# the plan, said
label() { case "$1" in song) echo "for a song" ;; newdefault) echo "the Studio's default decoder, new in 2.0.7" ;; base) echo "m-a-p's backbone" ;; extras) echo "extra decoders" ;; *) echo "$1" ;; esac; }
lines=$(awk -F'\t' '$1 == "get" || $1 == "changed" {print}' "$P")
TEXT=""
while IFS=$'\t' read -r st sz repo rev path base pack; do
  [ -n "$st" ] || continue
  what="${base#.}"; what="${what:+$what/}$path"; what=$(rs_new_of "$what" || echo "$what"); [ "$st" = changed ] && what="$what (a newer pin)"
  TEXT+="$(printf '%9s  %s  · %s, %s' "$(hs "$sz")" "$what" "$(label "$pack")" "$repo")"$'\n'
done <<< "$lines"
[ -n "$approx" ] && TEXT+="$approx"
TOTAL=$((TOTAL + aprx_bytes))
here=$(awk -F'\t' '$1 == "here"' "$P" | wc -l | tr -d ' ')
SUM="$(hs "$TOTAL") to download ($NGET file$([ "$NGET" = 1 ] || echo s)$([ $aprx_n -gt 0 ] && echo " and the packs above")), $here here already · free on this disk: $([ "${FREE:-0}" -ge 0 ] && hs "$FREE" || echo "?") (${ROOT})"
echo "${B}Ruach Studio · $([ $UPDATE = 1 ] && echo "what changed among your models" || echo "the models to download")${X}"
[ -n "$TEXT" ] && printf '%s' "$TEXT" | sed 's/^/  /'
gone=$(awk -F'\t' '$1 == "gone" {print $5 " (" $3 ")"}' "$P")
[ -n "$gone" ] && echo "${Y}not in the pinned repo:${X} $(echo $gone)"
kept=$(awk -F'\t' '$1 == "kept" {print $6 "/" $5}' "$P" | sed 's|^\./||')
[ -n "$kept" ] && echo "${D}kept as they are, yours (not the pinned copies, never replaced here): $(echo "$kept" | head -3 | tr '\n' ' ')$([ "$(echo "$kept" | wc -l)" -gt 3 ] && echo "and $(( $(echo "$kept" | wc -l) - 3 )) more")${X}"
[ -n "$offline" ] && echo "${Y}the pinned file list of $offline could not be read (offline?): nothing of it is planned${X}"
echo "  ${B}$SUM${X}"
if [ "$NGET" = 0 ] && [ $aprx_n = 0 ]; then
  echo "${G}nothing to download${X}"; [ $prc = 0 ]; exit $?
fi
[ $PLAN = 1 ] && exit 0
if [ "${FREE:--1}" -ge 0 ] && [ $((TOTAL + 1000000000)) -gt "$FREE" ]; then
  echo "${R}not enough room: $(hs "$TOTAL") and 1 GB to spare, $(hs "$FREE") free${X} (RUACH_HOME puts the AppImage's Studio on another disk)"; exit 4
fi

# the question: a terminal's [Y/n]; from the desktop, zenity or kdialog; with neither, said and nothing downloaded
ASKED=""
ask() {
  [ $YES = 1 ] && return 0
  if [ -t 0 ] && [ -t 1 ]; then
    printf '%s' "Download $(hs "$TOTAL")? [Y/n] "; read -r a
    case "$a" in ""|y|Y|yes|Yes|д|Д|да|Да) return 0 ;; *) return 1 ;; esac
  fi
  local body; body="$(printf '%s' "$TEXT" | head -14)"
  [ "$(printf '%s' "$TEXT" | wc -l)" -gt 14 ] && body+=$'\n'"… and $(( $(printf '%s' "$TEXT" | wc -l) - 14 )) more"
  body="Ruach Studio needs these files:"$'\n\n'"$body"$'\n\n'"$SUM"$'\n\n'"Download them now?"
  if [ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]; then
    if command -v zenity >/dev/null 2>&1; then
      ASKED=zenity; zenity --question --no-markup --title="Ruach Studio" --width=640 --ok-label="Download" --cancel-label="Not now" --text="$body" 2>/dev/null; return $?
    elif command -v kdialog >/dev/null 2>&1; then
      ASKED=kdialog; kdialog --title "Ruach Studio" --yes-label "Download" --no-label "Not now" --yesno "$body" 2>/dev/null; return $?
    fi
  fi
  local say="Ruach Studio needs $(hs "$TOTAL") of models and cannot ask: no terminal, and neither zenity nor kdialog to show a dialog. Start it once from a terminal (it asks there), or install zenity."
  echo "${R}$say${X}" >&2
  command -v notify-send >/dev/null 2>&1 && notify-send "Ruach Studio" "$say"
  return 3
}
ask; a=$?
if [ $a != 0 ]; then
  [ $a = 3 ] && exit 3
  echo "not downloaded: $([ $UPDATE = 1 ] && echo "the Studio goes on with the files it has" || echo "./fetch-models.sh, or Engine -> Models in the Studio, fetches them when you want")"; exit 5
fi

# the download: the planned files one at a time through the pinned downloader, each checked by its pinned size
download_all() {
hf_ready || return 1
start=$(date +%s); failed=0; got=0
LOG="$ROOT/tmp/fetch-models.last.log"
while IFS=$'\t' read -r st sz repo rev path base pack; do
  [ -n "$st" ] || continue
  # HERESY 2380: «newdefault» (2329: the Studio's new default decoder, wanted by an update though not here) was planned and said, then
  # skipped here, and the run ended «failed 0» without it; a planned line of a pack this loop does not know is a failure, said, never a silent skip
  case "$pack" in song|newdefault|base|fw|extras|whisper|transcriber|upscale) ;; loras) [ $UPDATE = 1 ] || continue ;;
    *) echo "${R}failed${X}    ${base#.}/$path: planned (pack $pack), but no step here fetches it"; failed=$((failed + 1)); continue ;; esac
  rel="${base#.}"; rel="${rel:+$rel/}$path"
  # HERESY 2330: a file the map places goes through models/.incoming/ (the downloader's records stay there) into its room by a rename
  new=$(rs_new_of "$rel") || new=""
  shown="${new:-$rel}"
  echo "${Y}download${X}  $shown  ${D}$(hs "$sz")${X}"
  ok=0
  for try in 1 2; do   # HERESY 1285: a burst earns a 429 from Hugging Face: once more after half a minute
    if [ -n "$new" ]; then
      mkdir -p "$RS_INCOMING/${base}"
      # HERESY 2380 (Viktor 11.11.2026: «Тройного сторожа на выгрузках и скачиваниях моделей»): through tools/hf_guard.py it lands in .incoming
      # only at the pin, of the pinned size and with our manifest's SHA-256, and only then is renamed into its room; a failure leaves the room's file as it was
      if hf_guarded download --quiet "$repo" "$path" --revision "$rev" --local-dir "$RS_INCOMING/${base}" > "$LOG" 2>&1; then
        mkdir -p "$(dirname "$ROOT/$new")" && mv -f "$RS_INCOMING/$rel" "$ROOT/$new" && { rmdir -p "$(dirname "$RS_INCOMING/$rel")" 2>/dev/null || true; }
      fi
      pre="${path%/*}/"; [ "$pre" = "$path/" ] && pre=""
      if hf_complete "$repo" "$rev" "$(dirname "$ROOT/$new")" --strip "$pre" --files "$path" >/dev/null 2>&1; then ok=1; break; fi
    else
      hf_guarded download --quiet "$repo" "$path" --revision "$rev" --local-dir "$ROOT/${base}" > "$LOG" 2>&1   # HERESY 2380: the triple guard
      if hf_complete "$repo" "$rev" "$ROOT/${base}" --files "$path" >/dev/null 2>&1; then ok=1; break; fi
    fi
    [ $try = 1 ] && { echo "${D}          not yet ($(tail -1 "$LOG" | cut -c1-160)); once more in 30 s${X}"; sleep 30; }
  done
  if [ $ok = 1 ]; then echo "${G}done${X}      $shown"; got=$((got + 1))
  else echo "${R}failed${X}    $shown: $(tail -2 "$LOG" | tr '\n' ' ' | cut -c1-200)"; failed=$((failed + 1)); fi
done <<< "$lines"
# the packs whose own downloaders fetch them; UniverSR's code comes with upscale (a git clone)
hp=""
if [ $UPDATE = 0 ]; then
  has loras && hp+="loras,"; has upscale && hp+="upscale,"
  has stems && [ $stems_here = 0 ] && [ -x "$ROOT/.venv/bin/audio-separator" ] && hp+="stems,"
fi
[ -n "$hp" ] && { "$ROOT/heresy/fetch-heresy.sh" --only "${hp%,}" --yes || failed=$((failed + 1)); }
# the Studio's Engine -> Models card shows the last whole run of heresy/fetch-heresy.sh: a quiet check gives it this one's
NO_COLOR=1 "$ROOT/heresy/fetch-heresy.sh" --check > "$ROOT/tmp/fetch-heresy.check.log" 2>&1 || true
echo "${B}models${X}  downloaded $got  failed $failed  in $(( $(date +%s) - start ))s · folder $(du -sh "$RS_MODELS" 2>/dev/null | cut -f1), free $(df -h "$ROOT" | awk 'NR==2 {print $4}')"
[ $failed = 0 ]
}
# asked by a dialog (started from the desktop): its progress in a dialog too, each line as it comes, the whole in a log
if [ "$ASKED" = zenity ]; then
  download_all 2>&1 | tee "$ROOT/tmp/fetch-models.download.log" | sed -u 's/\x1b\[[0-9;]*m//g; s/^/# /' \
    | zenity --progress --pulsate --auto-close --no-cancel --title="Ruach Studio" --width=640 --text="Downloading $(hs "$TOTAL")…" 2>/dev/null
  rc=${PIPESTATUS[0]}
  [ $rc = 0 ] || zenity --error --no-markup --title="Ruach Studio" --width=640 --text="A download did not complete: $(grep -a 'failed' "$ROOT/tmp/fetch-models.download.log" | head -3 | sed 's/\x1b\[[0-9;]*m//g')"$'\n\n'"Start the Studio again: the download goes on where it stopped. The whole log: $ROOT/tmp/fetch-models.download.log" 2>/dev/null
  exit $rc
elif [ "$ASKED" = kdialog ]; then
  kdialog --title "Ruach Studio" --passivepopup "Downloading $(hs "$TOTAL")… (the log: $ROOT/tmp/fetch-models.download.log)" 15 2>/dev/null &
  download_all > "$ROOT/tmp/fetch-models.download.log" 2>&1; rc=$?
  [ $rc = 0 ] || kdialog --title "Ruach Studio" --error "A download did not complete. Start the Studio again: it goes on where it stopped. The log: $ROOT/tmp/fetch-models.download.log" 2>/dev/null
  exit $rc
fi
download_all
