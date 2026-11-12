#!/usr/bin/env bash
# Regression checks for tools/hf_guard.py, the triple guard on our models (HERESY 2380), run in a scratch folder (tmp/test-hf-guard): a fake
# Hugging Face (a stand-in hf that serves a mirror folder, well or badly), fixture lists and a fixture manifest. Offline, seconds.
#
#   tools/test_hf_guard.sh            the guard alone: a good file, a wrong size, a wrong hash, a download cut halfway and its resume,
#                                     a pin our manifest does not know, an unpinned revision of ours, a list that disagrees with the
#                                     manifest, a file across disks, an upload refused on a moved head and one checked by its download back
#   tools/test_hf_guard.sh --scripts  also fetch-models.sh --update in a scratch install laid out as 2.0.6 left it
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
G=$'\e[32m' R=$'\e[31m' D=$'\e[2m' X=$'\e[0m'
if [ -n "${NO_COLOR:-}" ] || [ ! -t 1 ]; then G="" R="" D="" X=""; fi
PY="$ROOT/.venv/bin/python"; [ -x "$PY" ] || PY=python3
export TMPDIR="$ROOT/tmp"
T="$ROOT/tmp/test-hf-guard"; rm -rf "$T"; mkdir -p "$T"
pass=0; fail=0
check() { if [ "$2" = 0 ]; then pass=$((pass + 1)); echo "  ${G}PASS${X}  $1"; else fail=$((fail + 1)); echo "  ${R}FAIL${X}  $1${3:+ ${D}($3)${X}}"; fi; }

# --- a scratch Studio: the guard and the pinned lists' reader
S="$T/studio"; mkdir -p "$S/tools" "$S/heresy" "$S/tmp"
cp "$ROOT/tools/hf_guard.py" "$ROOT/tools/hf_expect.py" "$S/tools/"
REV1=1111111111111111111111111111111111111111; REV2=2222222222222222222222222222222222222222
M="$T/mirror"; mkdir -p "$M/goldhub__Models/models" "$M/other__Repo"
head -c 300000 /dev/urandom > "$M/goldhub__Models/models/backbone.gguf"
head -c 2000 /dev/urandom > "$M/goldhub__Models/models/decoder.gguf"
printf 'config\n' > "$M/goldhub__Models/README.md"
head -c 5000 /dev/urandom > "$M/other__Repo/weights.bin"
# the fixture lists (as the pinned commit lists its files) and our manifest, from the mirror's true files
"$PY" - "$M" "$T/expected" "$T/manifest.tsv" "$REV1" <<'PY'
import hashlib, json, os, sys
m, ex, man, rev = sys.argv[1:5]; os.makedirs(ex)
lines = []
for repo_dir in sorted(os.listdir(m)):
    repo = repo_dir.replace("__", "/"); sib = []
    for d, _, fs in os.walk(os.path.join(m, repo_dir)):
        for n in fs:
            p = os.path.join(d, n); rel = os.path.relpath(p, os.path.join(m, repo_dir)); data = open(p, "rb").read()
            sha = hashlib.sha256(data).hexdigest(); lfs = not rel.endswith(".md")
            sib.append({"rfilename": rel, "size": len(data), **({"lfs": {"sha256": sha, "size": len(data)}} if lfs else {})})
            if repo.startswith("goldhub/"): lines.append(f"{repo}\t{rev}\t{rel}\t{len(data)}\t{sha}")
    json.dump({"siblings": sib}, open(os.path.join(ex, repo_dir + ".json"), "w"))
open(man, "w").write("# repo\trev\tpath\tsize\tsha256\n" + "\n".join(sorted(lines)) + "\n")
PY
# the stand-in hf: serves the mirror as asked (FAKE_HF_MODE ok, truncate, flip, interrupt) and leaves the downloader's record beside
cat > "$T/hf" <<'STUB'
#!/bin/bash
[ "$1" = download ] || exit 2; shift; repo=$1; shift; files=(); rev=""; dir=""
while [ $# -gt 0 ]; do case "$1" in --revision) rev=$2; shift ;; --local-dir) dir=$2; shift ;; --quiet) ;; *) files+=("$1") ;; esac; shift; done
src="$FAKE_MIRROR/${repo//\//__}"
for f in "${files[@]}"; do
  mkdir -p "$dir/$(dirname "$f")" "$dir/.cache/huggingface/download/$(dirname "$f")"
  n=$(stat -c %s "$src/$f")
  mode=${FAKE_HF_MODE:-ok}; [ -n "${FAKE_HF_SPOIL:-}" ] && [[ $f == *"$FAKE_HF_SPOIL"* ]] && mode=flip
  case "$mode" in
    ok) cp "$src/$f" "$dir/$f" ;;
    truncate) head -c $((n / 2)) "$src/$f" > "$dir/$f" ;;
    flip) { head -c $((n - 1)) "$src/$f"; printf 'Z'; } > "$dir/$f" ;;
    interrupt) head -c $((n / 3)) "$src/$f" > "$dir/.cache/huggingface/download/$(dirname "$f")/x.$(basename "$f").incomplete"; echo "Connection reset by peer" >&2; exit 1 ;;
  esac
  printf '%s\n%s\n%s\n' "$rev" "$(sha256sum "$dir/$f" | cut -d' ' -f1)" "$(date +%s.%N)" > "$dir/.cache/huggingface/download/$f.metadata"
done
STUB
chmod +x "$T/hf"
export YUE2_HF="$T/hf" YUE2_HF_EXPECTED="$T/expected" YUE2_HF_MANIFEST="$T/manifest.tsv" FAKE_MIRROR="$M" NO_COLOR=1
guard() { "$PY" "$S/tools/hf_guard.py" "$@"; }
I="$T/install"; mkdir -p "$I/models"
sha() { sha256sum "$1" | cut -d' ' -f1; }
B="$I/models/backbone.gguf"; TRUE=$(sha "$M/goldhub__Models/models/backbone.gguf")

echo "the guard"
printf 'the old copy, kept until a new one is whole and checked' > "$B"; OLD=$(sha "$B")
out=$(FAKE_HF_MODE=truncate guard download goldhub/Models models/backbone.gguf --revision $REV1 --local-dir "$I" --quiet); rc=$?   # paths: repo (a fake repo laid out as ours)
check "wrong size: refused, said, old file kept, part removed" "$([ $rc = 1 ] && [ "$(sha "$B")" = "$OLD" ] && [ ! -e "$I/.ruach-part/models/backbone.gguf" ] && grep -q "the pinned size is 300000" <<< "$out"; echo $?)" "$out"
out=$(FAKE_HF_MODE=flip guard download goldhub/Models models/backbone.gguf --revision $REV1 --local-dir "$I" --quiet); rc=$?   # paths: repo (a fake repo laid out as ours)
check "wrong hash (the right size): refused, said, old file kept, part removed" "$([ $rc = 1 ] && [ "$(sha "$B")" = "$OLD" ] && [ ! -e "$I/.ruach-part/models/backbone.gguf" ] && grep -q "SHA-256 .*our manifest says" <<< "$out"; echo $?)" "$out"
out=$(FAKE_HF_MODE=interrupt guard download goldhub/Models models/backbone.gguf --revision $REV1 --local-dir "$I" --quiet); rc=$?   # paths: repo (a fake repo laid out as ours)
check "a download cut halfway: failed, said, old file kept, its unfinished part kept to go on" "$([ $rc = 1 ] && [ "$(sha "$B")" = "$OLD" ] && ls "$I"/.ruach-part/.cache/huggingface/download/models/*.incomplete >/dev/null 2>&1 && grep -q "did not complete.*Connection reset.*next run" <<< "$out"; echo $?)" "$out"
out=$(guard download goldhub/Models models/backbone.gguf --revision $REV1 --local-dir "$I"); rc=$?   # paths: repo (a fake repo laid out as ours)
check "the good file: checked against our manifest, put in place, its record beside it" "$([ $rc = 0 ] && [ "$(sha "$B")" = "$TRUE" ] && [ -f "$I/.cache/huggingface/download/models/backbone.gguf.metadata" ] && grep -q "checked.*our manifest" <<< "$out"; echo $?)" "$out"
out=$(guard download goldhub/Models models/backbone.gguf --revision $REV1 --local-dir "$I"); rc=$?   # paths: repo (a fake repo laid out as ours)
check "here and whole: nothing downloaded again" "$([ $rc = 0 ] && grep -q "^here" <<< "$out"; echo $?)" "$out"
out=$(guard verify goldhub/Models --revision $REV1 --local-dir "$I" --include "models/*"); rc=$?
check "verify hashes what is here and names what is missing" "$([ $rc = 1 ] && grep -q "^here *models/backbone.gguf" <<< "$out" && grep -q "^missing *models/decoder.gguf" <<< "$out"; echo $?)" "$out"   # paths: repo (a fake repo laid out as ours)
out=$(guard download goldhub/Models --include "models/*" --revision $REV2 --local-dir "$I" --quiet); rc=$?
check "a pin our manifest does not know: refused, nothing downloaded" "$([ $rc = 1 ] && grep -q "a pin moved without the manifest" <<< "$out" && [ ! -e "$I/models/decoder.gguf" ]; echo $?)" "$out"
out=$(guard download goldhub/Models models/decoder.gguf --revision main --local-dir "$I" --quiet); rc=$?   # paths: repo (a fake repo laid out as ours)
check "our repo at a branch, not a pinned commit: refused" "$([ $rc = 1 ] && grep -q "not a pinned commit" <<< "$out"; echo $?)" "$out"
cp "$T/expected/goldhub__Models.json" "$T/good.json"
"$PY" -c 'import json,sys; d=json.load(open(sys.argv[1])); [s.update(lfs={"sha256": "0"*64, "size": s["size"]}) for s in d["siblings"] if s["rfilename"] == "models/decoder.gguf"]; json.dump(d, open(sys.argv[1], "w"))' "$T/expected/goldhub__Models.json"   # paths: repo (a fake repo laid out as ours)
out=$(guard download goldhub/Models models/decoder.gguf --revision $REV1 --local-dir "$I" --quiet); rc=$?   # paths: repo (a fake repo laid out as ours)
check "the pinned list disagrees with our manifest: refused" "$([ $rc = 1 ] && grep -q "not our manifest's: refused" <<< "$out"; echo $?)" "$out"
cp "$T/good.json" "$T/expected/goldhub__Models.json"
out=$(guard download other/Repo weights.bin --revision $REV1 --local-dir "$I"); rc=$?
check "another's repo: its size and the pinned commit's own SHA-256" "$([ $rc = 0 ] && grep -q "pinned commit's own SHA-256" <<< "$out"; echo $?)" "$out"
# across disks: models/ a link onto tmpfs (/dev/shm), the part on this disk: copied beside the place, checked, renamed
if [ -d /dev/shm ] && [ -w /dev/shm ]; then
  SHM=$(mktemp -d /dev/shm/hf-guard-XXXX); I2="$T/install2"; mkdir -p "$I2"; ln -s "$SHM" "$I2/models"
  out=$(guard download goldhub/Models models/decoder.gguf --revision $REV1 --local-dir "$I2"); rc=$?   # paths: repo (a fake repo laid out as ours)
  check "across disks (models/ a link to another file system): checked again after the copy, then in place" "$([ $rc = 0 ] && [ "$(sha "$SHM/decoder.gguf")" = "$(sha "$M/goldhub__Models/models/decoder.gguf")" ] && [ -z "$(ls -A "$SHM" | grep -v '^decoder.gguf$')" ]; echo $?)" "$out"
  rm -rf "$SHM"
fi
# a bridge: the old path a link to the file at its new place; the new file lands at the link's target, the link stays a link
I3="$T/install3"; mkdir -p "$I3/models/new"; printf 'old' > "$I3/models/new/backbone.gguf"; ln -s new/backbone.gguf "$I3/models/backbone.gguf"
out=$(guard download goldhub/Models models/backbone.gguf --revision $REV1 --local-dir "$I3" --quiet); rc=$?   # paths: repo (a fake repo laid out as ours)
check "a bridge (a link at the old path): the file at its target replaced, the link kept" "$([ $rc = 0 ] && [ -L "$I3/models/backbone.gguf" ] && [ "$(sha "$I3/models/new/backbone.gguf")" = "$TRUE" ]; echo $?)" "$out"

echo "the upload"
U="$T/up"; mkdir -p "$U/VAE-RS"; head -c 4000 /dev/urandom > "$U/VAE-RS/v.gguf"; printf 'card' > "$U/README.md"
out=$("$PY" - "$S/tools" "$U" <<'PY'
import os, shutil, sys, types
sys.path.insert(0, sys.argv[1]); import hf_guard as g
class Api:
    def __init__(s, head): s.head, s.sent = head, []
    def repo_info(s, repo, revision=None): return types.SimpleNamespace(sha=s.head)
    def list_repo_files(s, repo, revision=None): return ["VAE-RS/old.gguf", "keep.md"]
    def create_commit(s, repo, operations, commit_message, parent_commit, revision):
        assert parent_commit == s.head; s.sent = operations; s.head = "c" * 40; return types.SimpleNamespace(oid=s.head)
def back(spoil):
    def f(repo, path, rev, into):
        dst = os.path.join(into, path); os.makedirs(os.path.dirname(dst), exist_ok=True); shutil.copyfile(os.path.join(sys.argv[2], path), dst)
        if spoil and path.endswith(".gguf"): open(dst, "ab").write(b"!")
        return dst
    return f
ns = lambda parent, **k: types.SimpleNamespace(repo="goldhub/X", files=[], parent=parent, folder=sys.argv[2], branch="main", path_in_repo="",
                                               message="m", delete=k.get("delete", []), dry_run=False, quiet=True)
api = Api("a" * 40)
print("moved", g.cmd_upload(ns("b" * 40), api, back(False)), len(api.sent))
print("good", g.cmd_upload(ns("a" * 40, delete=["VAE-RS/*"]), api, back(False)), sorted(type(o).__name__ + ":" + o.path_in_repo for o in api.sent))
api = Api("a" * 40)
print("spoiled", g.cmd_upload(ns("a" * 40), api, back(True)))
PY
)
check "a head that moved since the one read: refused before anything is sent" "$(grep -q "^moved 3 0$" <<< "$out"; echo $?)" "$out"
check "a good upload: committed on its parent, the old file under --delete removed, every file downloaded back whole" "$(grep -q "^good 0 .*CommitOperationDelete:VAE-RS/old.gguf" <<< "$out" && ! grep -q "keep.md" <<< "$(grep '^good' <<< "$out")"; echo $?)" "$out"
check "a file that came back different: said, failed" "$(grep -q "^spoiled 1$" <<< "$out" && grep -q "downloaded back .* sent" <<< "$out"; echo $?)" "$out"

# --- --scripts: an install laid out as 2.0.6 left it, moved into the rooms (lab/migrate_models.py) and updated (fetch-models.sh --update), as
#     launcher/update.sh does it; HF_GUARD_TRY=DIR lays a changed copy of a script over the real one (a dry run of a change before it lands)
if [ "${1:-}" = "--scripts" ]; then
  echo "an install of 2.0.6 updated"
  over() { if [ -n "${HF_GUARD_TRY:-}" ] && [ -f "$HF_GUARD_TRY/$1" ]; then echo "$HF_GUARD_TRY/$1"; else echo "$ROOT/$1"; fi; }
  S3="$T/install206"; mkdir -p "$S3/tools" "$S3/launcher" "$S3/heresy" "$S3/lab" "$S3/tmp"
  cp "$(over heresy/root/fetch-models.sh)" "$S3/fetch-models.sh"
  cp "$ROOT"/heresy/root/launcher/{paths.sh,env.sh} "$S3/launcher/"
  cp "$ROOT"/tools/{hf-env.sh,hf_guard.py,hf_expect.py,models_plan.py,downloader-requirements.txt} "$S3/tools/"; : > "$S3/tools/hf-revisions.txt"
  cp "$(over tools/download-loras.sh)" "$S3/tools/download-loras.sh"
  cp "$(over heresy/fetch-heresy.sh)" "$S3/heresy/fetch-heresy.sh"
  cp "$ROOT"/lab/{migrate_models.py,paths.py} "$S3/lab/"
  NV=3333333333333333333333333333333333333333; NF=4444444444444444444444444444444444444444; OLDF=5555555555555555555555555555555555555555
  M3="$T/mirror3"; mkdir -p "$M3/goldhub__Ruach_Studio_Models_v2/models" "$M3/goldhub__YuE2-RS-Finetunes/VAE-RS"
  head -c 70000 /dev/urandom > "$M3/goldhub__Ruach_Studio_Models_v2/models/YuE2-Vae-F32.gguf"
  head -c 90000 /dev/urandom > "$M3/goldhub__YuE2-RS-Finetunes/YuE2-3B-RS-TW-2.0x0.75-BF16.gguf"   # the new pin's backbone
  head -c 40000 /dev/urandom > "$M3/goldhub__YuE2-RS-Finetunes/VAE-RS/YuE2-VAE-RS-x3_v1-F32.gguf"
  head -c 41000 /dev/urandom > "$M3/goldhub__YuE2-RS-Finetunes/VAE-RS/YuE2-VAE-RS-x3_v2-F32.gguf"
  printf 'goldhub/Ruach_Studio_Models_v2 %s\ngoldhub/YuE2-RS-Finetunes %s\n' $NV $NF > "$S3/heresy/hf-revisions.txt"
  "$PY" - "$M3" "$T/expected3" "$T/manifest3.tsv" $NV $NF <<'PY'
import hashlib, json, os, sys
m, ex, man, nv, nf = sys.argv[1:6]; os.makedirs(ex); lines = []
for repo_dir, rev in (("goldhub__Ruach_Studio_Models_v2", nv), ("goldhub__YuE2-RS-Finetunes", nf)):
    sib = []
    for d, _, fs in os.walk(os.path.join(m, repo_dir)):
        for n in fs:
            p = os.path.join(d, n); rel = os.path.relpath(p, os.path.join(m, repo_dir)); data = open(p, "rb").read(); sha = hashlib.sha256(data).hexdigest()
            sib.append({"rfilename": rel, "size": len(data), "lfs": {"sha256": sha, "size": len(data)}})
            lines.append(f"{repo_dir.replace('__', '/')}\t{rev}\t{rel}\t{len(data)}\t{sha}")
    json.dump({"siblings": sib}, open(os.path.join(ex, repo_dir + ".json"), "w"))
open(man, "w").write("\n".join(sorted(lines)) + "\n")
PY
  # the Kit's LoRA list names other repos too: empty fixture lists for them, so the plan reads them (as gone), not as offline
  sed -n 's/^  "[^"|]*|\([^"|]*\)|.*"$/\1/p' "$S3/tools/download-loras.sh" | sort -u | while read -r r; do
    [ -f "$T/expected3/${r//\//__}.json" ] || echo '{"siblings": []}' > "$T/expected3/${r//\//__}.json"
  done
  # 2.0.6's own layout: the fine-tune and m-a-p's decoder flat in models/, the downloader's records where 2.0.6's fetch-models.sh left them
  mkdir -p "$S3/models/.cache/huggingface/download" "$S3/.cache/huggingface/download/models"
  head -c 80000 /dev/urandom > "$S3/models/YuE2-3B-RS-TW-2.0x0.75-BF16.gguf"; OLDB=$(sha "$S3/models/YuE2-3B-RS-TW-2.0x0.75-BF16.gguf")
  cp "$M3/goldhub__Ruach_Studio_Models_v2/models/YuE2-Vae-F32.gguf" "$S3/models/"
  printf '%s\n%s\n%s\n' $OLDF "$OLDB" "$(date +%s).0" > "$S3/models/.cache/huggingface/download/YuE2-3B-RS-TW-2.0x0.75-BF16.gguf.metadata"
  printf '%s\n%s\n%s\n' $NV "$(sha "$S3/models/YuE2-Vae-F32.gguf")" "$(date +%s).0" > "$S3/.cache/huggingface/download/models/YuE2-Vae-F32.gguf.metadata"
  VAE_BEFORE=$(stat -c %i "$S3/models/YuE2-Vae-F32.gguf")
  out=$("$PY" "$S3/lab/migrate_models.py" --root "$S3" --apply 2>&1); rc=$?
  BB=$(find "$S3/models" -name "YuE2-3B-RS-TW-2.0x0.75-BF16.gguf" -not -path "*/.cache/*" | head -1)
  check "2.0.6's layout moved into the rooms" "$([ $rc = 0 ] && [ -n "$BB" ] && [ "$BB" != "$S3/models/YuE2-3B-RS-TW-2.0x0.75-BF16.gguf" ]; echo $?)" "$out"
  export YUE2_HF_EXPECTED="$T/expected3" YUE2_HF_MANIFEST="$T/manifest3.tsv" FAKE_MIRROR="$M3"
  out=$(FAKE_HF_SPOIL=x3_v1 bash "$S3/fetch-models.sh" --update --yes 2>&1); rc=$?
  V1=$(find "$S3/models" -name "YuE2-VAE-RS-x3_v1-F32.gguf" -not -path "*/.incoming/*" | head -1)
  check "the update, the new decoder spoiled on the way: the backbone's new pin in its room, checked; the decoder refused and said; m-a-p's untouched" \
    "$([ $rc != 0 ] && [ "$(sha "$BB")" = "$(sha "$M3/goldhub__YuE2-RS-Finetunes/YuE2-3B-RS-TW-2.0x0.75-BF16.gguf")" ] && [ -z "$V1" ] \
       && grep -q "x3_v1.*SHA-256" <<< "$out" && [ "$(stat -c %i "$(find "$S3/models" -name YuE2-Vae-F32.gguf -not -path "*/.cache/*" | head -1)")" = "$VAE_BEFORE" ]; echo $?)" "$out"
  out=$(bash "$S3/fetch-models.sh" --update --yes 2>&1); rc=$?
  V1=$(find "$S3/models" -name "YuE2-VAE-RS-x3_v1-F32.gguf" -not -path "*/.incoming/*" | head -1)
  check "the update again, the mirror whole: the new default decoder in its room, checked; nothing left half in .incoming" \
    "$([ $rc = 0 ] && [ -n "$V1" ] && [ "$(sha "$V1")" = "$(sha "$M3/goldhub__YuE2-RS-Finetunes/VAE-RS/YuE2-VAE-RS-x3_v1-F32.gguf")" ] \
       && [ -z "$(find "$S3/models/.incoming" -type f -name "*.gguf" 2>/dev/null)" ] && [ -z "$(find "$S3" -name .ruach-part)" ]; echo $?)" "$out"
  out=$(bash "$S3/fetch-models.sh" --update --yes 2>&1); rc=$?
  check "and once more: nothing to download" "$([ $rc = 0 ] && grep -q "nothing to download" <<< "$out"; echo $?)" "$out"

  # HERESY 2388: the transcriber's Refined mode (fetch-heresy.sh --refined F16, Engine → Models): the transcriber at the repo's pin where it is not
  # here, the overlay with its LICENSE and NOTICE at its own pin (REPO#refined), each through the guard into models/misc/
  echo "the transcriber's Refined mode at its own pin"
  NR=6666666666666666666666666666666666666666; V2="$M3/goldhub__Ruach_Studio_Models_v2"
  mkdir -p "$V2/models/SheetSage2-Refined"
  head -c 30000 /dev/urandom > "$V2/models/SheetSage2-Q8_0.gguf"; head -c 31000 /dev/urandom > "$V2/models/MERT-v2-FullSong-Q8_0.gguf"
  head -c 32000 /dev/urandom > "$V2/models/SheetSage2-Refined-F16.gguf"
  printf 'CC BY-NC 4.0\n' > "$V2/models/SheetSage2-Refined/LICENSE"; printf 'anime-song, scragnog\n' > "$V2/models/SheetSage2-Refined/NOTICE.md"
  "$PY" - "$V2" "$T/expected3/goldhub__Ruach_Studio_Models_v2.json" "$T/manifest3.tsv" $NV $NR <<'PY'
import hashlib, json, os, sys
src, ex, man, nv, nr = sys.argv[1:6]; sib, lines = [], []
for d, _, fs in os.walk(src):
    for n in fs:
        p = os.path.join(d, n); rel = os.path.relpath(p, src); data = open(p, "rb").read(); sha = hashlib.sha256(data).hexdigest()
        sib.append({"rfilename": rel, "size": len(data), **({} if rel.endswith(("LICENSE", ".md")) else {"lfs": {"sha256": sha, "size": len(data)}})})
        rev = nr if "Refined" in rel else nv   # the main pin holds no line for the overlay: only its own pin brings it
        if "SheetSage" in rel or "MERT" in rel: lines.append(f"goldhub/Ruach_Studio_Models_v2\t{rev}\t{rel}\t{len(data)}\t{sha}")
json.dump({"siblings": sib}, open(ex, "w"))
open(man, "a").write("\n".join(sorted(lines)) + "\n")
PY
  RC="$S3/heresy/hf-revisions.txt"; cp "$RC" "$T/revisions3.txt"
  out=$(bash "$S3/heresy/fetch-heresy.sh" --check --only none --refined F16 2>&1); rc=$?
  check "no REPO#refined pin: said as a failure, never fetched at the repo's other pin" "$([ $rc != 0 ] && grep -q "pins no goldhub/Ruach_Studio_Models_v2#refined" <<< "$out"; echo $?)" "$out"
  printf 'goldhub/Ruach_Studio_Models_v2#refined %s\n' $NR >> "$RC"
  MS="$S3/models/misc"
  out=$(FAKE_HF_SPOIL=Refined-F16 bash "$S3/heresy/fetch-heresy.sh" --only none --refined F16 --yes 2>&1); rc=$?
  check "the overlay spoiled on the way: refused and said; the transcriber it needs fetched beside, checked" \
    "$([ $rc != 0 ] && [ ! -e "$MS/SheetSage2-Refined-F16.gguf" ] && grep -q "SheetSage2-Refined-F16.gguf.*SHA-256" <<< "$out" \
       && [ "$(sha "$MS/SheetSage2-Q8_0.gguf")" = "$(sha "$V2/models/SheetSage2-Q8_0.gguf")" ] && [ "$(sha "$MS/MERT-v2-FullSong-Q8_0.gguf")" = "$(sha "$V2/models/MERT-v2-FullSong-Q8_0.gguf")" ]; echo $?)" "$out"
  out=$(bash "$S3/heresy/fetch-heresy.sh" --only none --refined F16 --yes 2>&1); rc=$?
  check "again, the mirror whole: the overlay, its LICENSE and NOTICE beside the transcriber, at its own pin; the line the lab restarts the engine on" \
    "$([ $rc = 0 ] && [ "$(sha "$MS/SheetSage2-Refined-F16.gguf")" = "$(sha "$V2/models/SheetSage2-Refined-F16.gguf")" ] && [ -s "$MS/SheetSage2-Refined/LICENSE" ] \
       && [ -s "$MS/SheetSage2-Refined/NOTICE.md" ] && grep -q "^fetched *models/misc/SheetSage2-Refined-F16.gguf .*@ 6666666" <<< "$out" \
       && [ -z "$(find "$S3/models/.incoming" -type f -name "*.gguf" 2>/dev/null)" ] && [ -z "$(find "$S3" -name .ruach-part)" ]; echo $?)" "$out"
  out=$(bash "$S3/heresy/fetch-heresy.sh" --check --only none --refined F16 2>&1); rc=$?
  check "and the check: both here, nothing fetched" "$([ $rc = 0 ] && [ "$(grep -c "^here  *models/misc/" <<< "$out")" = 2 ] && ! grep -q "^fetched" <<< "$out"; echo $?)" "$out"
  cp "$T/revisions3.txt" "$RC"
fi

echo
echo "hf_guard: $pass passed, $fail failed"
[ "$fail" = 0 ]
