#!/usr/bin/env bash
# Regression checks for the second channel (tools/hf_channels.py through tools/hf_guard.py; Viktor 21.11.2026), in a scratch folder: a fake Hugging
# Face (a stand-in hf), a local HTTP server that serves files by their SHA-256 (whole, in pieces, broken, cut, or not at all), a file:// mirror, fixture
# lists and a fixture manifest. Offline (127.0.0.1 only), seconds.
#
#   tools/test_hf_channels.sh            the guard: Hugging Face gives the file (no channel asked, nothing said), a channel delivers what Hugging Face
#                                        did not (pieces, file://, an endpoint), a channel that sends wrong bytes is refused, a cut goes on by Range,
#                                        every channel failing keeps the old words, our list from the manifest when Hugging Face's is down, another's
#                                        repo by Hugging Face's own SHA-256 and never by a channel's
#   tools/test_hf_channels.sh --scripts  also the three fetchers' «via» lines: fetch-models.sh, launcher/fetch_models.py, heresy/fetch-heresy.sh
#   T=DIR tools/test_hf_channels.sh      the scratch folder (default tmp/test-hf-channels/<time>; nothing outside it is written)
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PY="$ROOT/.venv/bin/python"; [ -x "$PY" ] || PY=python3
export NO_COLOR=1 TMPDIR="${TMPDIR:-/tmp}"
T="${T:-$ROOT/tmp/test-hf-channels/$(date +%Y%m%d-%H%M%S)-$$}"; mkdir -p "$T"
pass=0; fail=0
check() { if [ "$2" = 0 ]; then pass=$((pass + 1)); echo "  PASS  $1"; else fail=$((fail + 1)); echo "  FAIL  $1${3:+ ($3)}"; fi; }
sha() { sha256sum "$1" | cut -d' ' -f1; }

# --- a scratch Studio: the guard, the lists' reader, the channels
S="$T/studio"; mkdir -p "$S/tools" "$S/heresy" "$S/tmp"
cp "$ROOT/tools/hf_guard.py" "$ROOT/tools/hf_expect.py" "$ROOT/tools/hf_channels.py" "$S/tools/"
REV1=1111111111111111111111111111111111111111
M="$T/mirror"; mkdir -p "$M/goldhub__Models/models" "$M/other__Repo"
head -c 300000 /dev/urandom > "$M/goldhub__Models/models/backbone.gguf"
head -c 2000 /dev/urandom > "$M/goldhub__Models/models/decoder.gguf"
printf 'config\n' > "$M/goldhub__Models/README.md"
head -c 5000 /dev/urandom > "$M/other__Repo/weights.bin"
printf 'notes\n' > "$M/other__Repo/notes.md"
# the fixture lists (as the pinned commit lists its files), our manifest, and the store by SHA-256 (whole files, and pieces of 100000 bytes)
CA="$T/by-sha"; mkdir -p "$CA"
"$PY" - "$M" "$T/expected" "$T/manifest.tsv" "$REV1" "$CA" <<'PY'
import hashlib, json, os, sys
m, ex, man, rev, ca = sys.argv[1:6]; os.makedirs(ex)
lines = []
for repo_dir in sorted(os.listdir(m)):
    repo = repo_dir.replace("__", "/"); sib = []
    for d, _, fs in os.walk(os.path.join(m, repo_dir)):
        for n in fs:
            p = os.path.join(d, n); rel = os.path.relpath(p, os.path.join(m, repo_dir)); data = open(p, "rb").read()
            sha = hashlib.sha256(data).hexdigest(); lfs = not rel.endswith(".md")
            sib.append({"rfilename": rel, "size": len(data), **({"lfs": {"sha256": sha, "size": len(data)}} if lfs else {})})
            if repo.startswith("goldhub/"): lines.append(f"{repo}\t{rev}\t{rel}\t{len(data)}\t{sha}")
            open(os.path.join(ca, sha), "wb").write(data)
            for k in range(0, len(data), 100000):
                open(os.path.join(ca, f"{sha}.part{k // 100000:03d}"), "wb").write(data[k:k + 100000])
    json.dump({"siblings": sib}, open(os.path.join(ex, repo_dir + ".json"), "w"))
open(man, "w").write("# repo\trev\tpath\tsize\tsha256\n" + "\n".join(sorted(lines)) + "\n")
PY
# the HTTP server: /ok/ the file with Range, /down/ 503, /bad/ the right length of wrong bytes, /cut/ half the first time and Range after
cat > "$T/server.py" <<'PY'
import http.server, os, sys
ca, portfile, logf = sys.argv[1:4]; cut_seen = set()
class H(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        kind, _, name = self.path.lstrip("/").partition("/"); rng = self.headers.get("Range", "")
        with open(logf, "a") as f: f.write(f"{kind} {name} {rng}\n")
        p = os.path.join(ca, os.path.basename(name))
        if kind == "down" or not os.path.isfile(p):
            self.send_response(503 if kind == "down" else 404); self.send_header("Content-Length", "0"); self.end_headers(); return
        data = open(p, "rb").read()
        if kind == "bad": data = data[:-1] + bytes([data[-1] ^ 1])
        start = int(rng[6:].split("-")[0]) if rng.startswith("bytes=") else 0
        body = data[start:]
        self.send_response(206 if start else 200); self.send_header("Content-Length", str(len(body)))
        if start: self.send_header("Content-Range", f"bytes {start}-{len(data) - 1}/{len(data)}")
        self.end_headers()
        if kind == "cut" and name not in cut_seen:
            cut_seen.add(name); self.wfile.write(body[:len(body) // 2]); self.wfile.flush(); self.close_connection = True; return
        self.wfile.write(body)
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), H)
open(portfile + ".part", "w").write(str(srv.server_address[1])); os.replace(portfile + ".part", portfile)
srv.serve_forever()
PY
"$PY" -I "$T/server.py" "$CA" "$T/port" "$T/server.log" & SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT
for _ in $(seq 50); do [ -s "$T/port" ] && break; sleep 0.1; done
P=$(cat "$T/port"); H="http://127.0.0.1:$P"; : > "$T/server.log"
# the stand-in hf: Hugging Face as FAKE_HF_MODE says (ok, fail, flip; FAKE_HF_SPOIL flips the files of that name); with HF_ENDPOINT set it is the endpoint channel (FAKE_EP_MODE: ok or fail),
# and every call is logged with its endpoint and whether Xet was off
cat > "$T/hf" <<'STUB'
#!/bin/bash
[ "$1" = download ] || exit 2; shift; repo=$1; shift; files=(); rev=""; dir=""
while [ $# -gt 0 ]; do case "$1" in --revision) rev=$2; shift ;; --local-dir) dir=$2; shift ;; --quiet) ;; *) files+=("$1") ;; esac; shift; done
echo "endpoint=${HF_ENDPOINT:-hf} xet_off=${HF_HUB_DISABLE_XET:-0} ${files[*]}" >> "$FAKE_CALLS"
mode=${FAKE_HF_MODE:-ok}; [ -n "${HF_ENDPOINT:-}" ] && mode=${FAKE_EP_MODE:-fail}
src="$FAKE_MIRROR/${repo//\//__}"
for f in "${files[@]}"; do
  case "$mode" in fail) echo "503 Server Error: Service Unavailable for url: https://huggingface.co/$repo/resolve/$rev/$f" >&2; exit 1 ;; esac
  mkdir -p "$dir/$(dirname "$f")" "$dir/.cache/huggingface/download/$(dirname "$f")"
  n=$(stat -c %s "$src/$f"); m=$mode
  [ -n "${FAKE_HF_SPOIL:-}" ] && [ -z "${HF_ENDPOINT:-}" ] && [[ $f == *"$FAKE_HF_SPOIL"* ]] && mode=flip
  case "$mode" in ok) cp "$src/$f" "$dir/$f" ;; flip) { head -c $((n - 1)) "$src/$f"; printf 'Z'; } > "$dir/$f" ;; esac
  printf '%s\n%s\n%s\n' "$rev" "$(sha256sum "$dir/$f" | cut -d' ' -f1)" "$(date +%s.%N)" > "$dir/.cache/huggingface/download/$f.metadata"
  mode=$m
done
STUB
chmod +x "$T/hf"
export YUE2_HF="$T/hf" YUE2_HF_EXPECTED="$T/expected" YUE2_HF_MANIFEST="$T/manifest.tsv" FAKE_MIRROR="$M" FAKE_CALLS="$T/hf-calls.log"
chans() { printf '%s\n' "$@" | sed "s|@H@|$H|g; s|@CA@|$CA|g; s|@M@|$M|g" | tr '|' '\t' > "$T/channels.tsv"; export YUE2_HF_CHANNELS="$T/channels.tsv"; }
guard() { "$PY" "$S/tools/hf_guard.py" "$@"; }
fresh() { I="$T/install-$1"; mkdir -p "$I"; : > "$T/server.log"; : > "$FAKE_CALLS"; }
B=models/backbone.gguf; TRUE=$(sha "$M/goldhub__Models/$B")   # paths: repo (a fake repo laid out as ours)

echo "the guard and the second channel"
chans "down|url|@H@/down/{sha256}{part}|100000" "pieces|url|@H@/ok/{sha256}{part}|100000"
fresh a; out=$(guard download goldhub/Models $B --revision $REV1 --local-dir "$I" --quiet); rc=$?
check "Hugging Face gives it: placed, nothing said, no channel asked, no channel folder" \
  "$([ $rc = 0 ] && [ -z "$out" ] && [ "$(sha "$I/$B")" = "$TRUE" ] && [ ! -s "$T/server.log" ] && [ ! -e "$I/.ruach-part" ]; echo $?)" "$out"
fresh b; out=$(FAKE_HF_MODE=fail guard download goldhub/Models $B --revision $REV1 --local-dir "$I" --quiet); rc=$?
VIA="^via *models/backbone.gguf .*delivered by pieces.*our manifest.*503"   # paths: repo (a fake repo laid out as ours)
check "Hugging Face fails (503): the next channel down too, the one after delivers in three pieces; its line names it, --quiet or not" \
  "$([ $rc = 0 ] && [ "$(sha "$I/$B")" = "$TRUE" ] && grep -q "$VIA" <<< "$out" \
     && [ "$(grep -c '^ok ' "$T/server.log")" = 3 ] && grep -q "^down " "$T/server.log"; echo $?)" "$out"
check "its record beside it, as the downloader leaves one (the pin, the SHA-256): models_plan.py and the next run know it as ours" \
  "$(rec="$I/.cache/huggingface/download/$B.metadata"; [ "$(sed -n 1p "$rec")" = $REV1 ] && [ "$(sed -n 2p "$rec")" = "$TRUE" ] && [ ! -e "$I/.ruach-part" ]; echo $?)"
: > "$FAKE_CALLS"; : > "$T/server.log"; out=$(FAKE_HF_MODE=fail guard download goldhub/Models $B --revision $REV1 --local-dir "$I"); rc=$?
check "and the next run: here, by its record, nothing asked of anyone" "$([ $rc = 0 ] && grep -q "^here" <<< "$out" && [ ! -s "$FAKE_CALLS" ] && [ ! -s "$T/server.log" ]; echo $?)" "$out"

chans "bad|url|@H@/bad/{sha256}|0" "disk|url|file://@CA@/{sha256}|0"
fresh c; mkdir -p "$I/models"; printf 'the old copy, kept until a new one is whole and checked' > "$I/$B"
out=$(FAKE_HF_MODE=flip guard download goldhub/Models $B --revision $REV1 --local-dir "$I" --quiet); rc=$?
check "Hugging Face sends wrong bytes, the first channel too (refused, removed); the file:// mirror delivers" \
  "$([ $rc = 0 ] && [ "$(sha "$I/$B")" = "$TRUE" ] && grep -q "delivered by disk" <<< "$out" && ! grep -q "delivered by bad" <<< "$out" \
     && [ ! -e "$I/.ruach-part/.channels/bad/$B.incomplete" ]; echo $?)" "$out"

chans "ep|endpoint|http://127.0.0.1:9/ep|0"
fresh d; out=$(FAKE_HF_MODE=fail FAKE_EP_MODE=ok guard download goldhub/Models $B --revision $REV1 --local-dir "$I" --quiet); rc=$?
check "an endpoint channel: hf download again with HF_ENDPOINT and Xet off, checked against our manifest, named" \
  "$([ $rc = 0 ] && [ "$(sha "$I/$B")" = "$TRUE" ] && grep -q "delivered by ep" <<< "$out" && grep -q "^endpoint=http://127.0.0.1:9/ep xet_off=1 models/backbone.gguf" "$FAKE_CALLS"; echo $?)" "$out"   # paths: repo (a fake repo laid out as ours)
fresh d2; out=$(FAKE_HF_MODE=fail FAKE_EP_MODE=flip guard download goldhub/Models $B --revision $REV1 --local-dir "$I" --quiet); rc=$?
check "an endpoint that sends wrong bytes: refused like any channel" "$([ $rc = 1 ] && [ ! -e "$I/$B" ] && grep -q "ep: its SHA-256 is not the pinned one" <<< "$out"; echo $?)" "$out"

chans "cut|url|@H@/cut/{sha256}|0"
fresh e; out=$(FAKE_HF_MODE=fail guard download goldhub/Models $B --revision $REV1 --local-dir "$I" --quiet); rc=$?
check "a channel cut halfway: failed, said, its bytes kept for the next run" \
  "$([ $rc = 1 ] && [ ! -e "$I/$B" ] && grep -q "cut: .*the next run goes on" <<< "$out" && [ -s "$I/.ruach-part/.channels/cut/$B.incomplete" ]; echo $?)" "$out"
out=$(FAKE_HF_MODE=fail guard download goldhub/Models $B --revision $REV1 --local-dir "$I" --quiet); rc=$?
check "the next run goes on from there by a Range, and the whole is checked" \
  "$([ $rc = 0 ] && [ "$(sha "$I/$B")" = "$TRUE" ] && grep -q "^cut .* bytes=150000-" "$T/server.log"; echo $?)" "$out"

chans "down|url|@H@/down/{sha256}|0" "nowhere|url|file://@CA@/no-such/{sha256}|0"
fresh f; mkdir -p "$I/models"; printf 'the old copy' > "$I/$B"; OLD=$(sha "$I/$B")
out=$(FAKE_HF_MODE=fail guard download goldhub/Models $B --revision $REV1 --local-dir "$I" --quiet); rc=$?
check "every channel fails: Hugging Face's words as before, then each channel's, the old file kept" \
  "$([ $rc = 1 ] && [ "$(sha "$I/$B")" = "$OLD" ] && grep -q "^failed *models/backbone.gguf: the download did not complete (hf exit 1: 503.*; what was here stays as it was; tried also down: .*HTTP 503; nowhere: " <<< "$out"; echo $?)" "$out"   # paths: repo (a fake repo laid out as ours)
unset YUE2_HF_CHANNELS; export YUE2_HF_CHANNELS="$T/none.tsv"
fresh g; out=$(FAKE_HF_MODE=fail guard download goldhub/Models $B --revision $REV1 --local-dir "$I" --quiet); rc=$?
check "no channel listed: the words exactly as before (no «tried also»)" "$([ $rc = 1 ] && grep -q "did not complete (hf exit 1: 503" <<< "$out" && ! grep -q "tried also" <<< "$out"; echo $?)" "$out"

# Hugging Face's list down: our repo stands on our manifest, another's stays offline
mkdir -p "$T/expected-down"
chans "byrepo|url|file://@M@/{owner}__{name}/{path}|0"
fresh h; out=$(YUE2_HF_EXPECTED="$T/expected-down" FAKE_HF_MODE=fail guard download goldhub/Models $B models/decoder.gguf README.md --revision $REV1 --local-dir "$I" --quiet); rc=$?   # paths: repo (a fake repo laid out as ours)
check "Hugging Face's list down: our manifest stands for it (said), the files by their path from a path-laid mirror, the small one too" \
  "$([ $rc = 0 ] && grep -q "our manifest (heresy/hf-manifest.tsv) stands for it" <<< "$out" && [ "$(sha "$I/$B")" = "$TRUE" ] && [ -s "$I/README.md" ] \
     && [ "$(grep -c "delivered by byrepo" <<< "$out")" = 3 ]; echo $?)" "$out"
out=$(YUE2_HF_EXPECTED="$T/expected-down" "$PY" "$S/tools/hf_expect.py" --repo goldhub/Models --rev $REV1 --dir "$I"); rc=$?
check "and the check (hf_expect.py) reads our files by the manifest too" "$([ $rc = 0 ] && grep -q "^complete goldhub/Models" <<< "$out"; echo $?)" "$out"
fresh i; out=$(YUE2_HF_EXPECTED="$T/expected-down" FAKE_HF_MODE=fail guard download other/Repo weights.bin --revision $REV1 --local-dir "$I" --quiet); rc=$?
check "another's repo with Hugging Face's list down: offline as before, no channel asked" "$([ $rc = 2 ] && [ ! -s "$FAKE_CALLS" ]; echo $?)" "$out"

chans "disk|url|file://@CA@/{sha256}|0"
fresh j; out=$(FAKE_HF_MODE=fail guard download other/Repo weights.bin notes.md --revision $REV1 --local-dir "$I" --quiet); rc=$?
check "another's repo: its large file from a channel by Hugging Face's own SHA-256; its small file (no SHA-256 known) never from a channel" \
  "$([ $rc = 1 ] && [ "$(sha "$I/weights.bin")" = "$(sha "$M/other__Repo/weights.bin")" ] && grep -q "^via *weights.bin .*pinned commit's own SHA-256" <<< "$out" \
     && grep -q "^failed *notes.md: the download did not complete" <<< "$out" && ! grep -q "notes.md.*tried also" <<< "$out" && [ ! -e "$I/notes.md" ]; echo $?)" "$out"

# --- --scripts: the fetchers relay the guard's «via» line (a scratch install: the decoder spoiled on its way from Hugging Face, a file:// mirror)
if [ "${1:-}" = "--scripts" ]; then
  echo "the fetchers"
  S3="$T/install-scripts"; mkdir -p "$S3/tools" "$S3/launcher" "$S3/heresy" "$S3/lab" "$S3/tmp"
  cp "$ROOT/heresy/root/fetch-models.sh" "$S3/fetch-models.sh"; cp "$ROOT/heresy/fetch-heresy.sh" "$S3/heresy/"
  cp "$ROOT"/heresy/root/launcher/{paths.sh,env.sh,fetch_models.py} "$S3/launcher/"
  cp "$ROOT"/tools/{hf-env.sh,hf_guard.py,hf_expect.py,hf_channels.py,models_plan.py,downloader-requirements.txt,download-loras.sh} "$S3/tools/"; : > "$S3/tools/hf-revisions.txt"
  cp "$ROOT"/lab/{paths.py,winx.py} "$S3/lab/"   # HERESY 2946: winx.py too, which launcher/fetch_models.py imports since 2935
  NV=3333333333333333333333333333333333333333; NF=4444444444444444444444444444444444444444
  M3="$T/mirror3"; mkdir -p "$M3/goldhub__Ruach_Studio_Models_v2/models" "$M3/goldhub__YuE2-RS-Finetunes/VAE-RS"
  head -c 70000 /dev/urandom > "$M3/goldhub__Ruach_Studio_Models_v2/models/YuE2-Vae-F32.gguf"
  head -c 90000 /dev/urandom > "$M3/goldhub__YuE2-RS-Finetunes/YuE2-3B-RS-TW-2.0x0.75-BF16.gguf"
  head -c 40000 /dev/urandom > "$M3/goldhub__YuE2-RS-Finetunes/VAE-RS/YuE2-VAE-RS-x3_v1-F32.gguf"
  head -c 41000 /dev/urandom > "$M3/goldhub__YuE2-RS-Finetunes/VAE-RS/YuE2-VAE-RS-x3_v2-F32.gguf"
  printf 'goldhub/Ruach_Studio_Models_v2 %s\ngoldhub/YuE2-RS-Finetunes %s\n' $NV $NF > "$S3/heresy/hf-revisions.txt"
  CA3="$T/by-sha3"; mkdir -p "$CA3"
  "$PY" - "$M3" "$T/expected3" "$T/manifest3.tsv" $NV $NF "$CA3" <<'PY'
import hashlib, json, os, sys
m, ex, man, nv, nf, ca = sys.argv[1:7]; os.makedirs(ex); lines = []
for repo_dir, rev in (("goldhub__Ruach_Studio_Models_v2", nv), ("goldhub__YuE2-RS-Finetunes", nf)):
    sib = []
    for d, _, fs in os.walk(os.path.join(m, repo_dir)):
        for n in fs:
            p = os.path.join(d, n); rel = os.path.relpath(p, os.path.join(m, repo_dir)); data = open(p, "rb").read(); sha = hashlib.sha256(data).hexdigest()
            sib.append({"rfilename": rel, "size": len(data), "lfs": {"sha256": sha, "size": len(data)}})
            lines.append(f"{repo_dir.replace('__', '/')}\t{rev}\t{rel}\t{len(data)}\t{sha}"); open(os.path.join(ca, sha), "wb").write(data)
    json.dump({"siblings": sib}, open(os.path.join(ex, repo_dir + ".json"), "w"))
open(man, "w").write("\n".join(sorted(lines)) + "\n")
PY
  sed -n 's/^  "[^"|]*|\([^"|]*\)|.*"$/\1/p' "$S3/tools/download-loras.sh" | sort -u | while read -r r; do
    [ -f "$T/expected3/${r//\//__}.json" ] || echo '{"siblings": []}' > "$T/expected3/${r//\//__}.json"
  done
  export YUE2_HF_EXPECTED="$T/expected3" YUE2_HF_MANIFEST="$T/manifest3.tsv" FAKE_MIRROR="$M3"
  printf 'disk3\turl\tfile://%s/{sha256}\t0\n' "$CA3" > "$T/channels3.tsv"; export YUE2_HF_CHANNELS="$T/channels3.tsv"
  # launcher/fetch_models.py takes the hf beside its own Python when there is one (a venv's): a Python here whose hf is the stand-in
  mkdir -p "$T/py"; ln -sf "$T/hf" "$T/py/hf"; ln -sf "$(command -v "$PY")" "$T/py/python"
  out=$(FAKE_HF_SPOIL=x3_v1 bash "$S3/fetch-models.sh" --quant BF16 --yes 2>&1); rc=$?
  V1=$(find "$S3/models" -name "YuE2-VAE-RS-x3_v1-F32.gguf" -not -path "*/.incoming/*" -not -path "*/.cache/*" | head -1)
  check "fetch-models.sh: the decoder Hugging Face spoiled comes from the mirror, checked, in its room; its «via» line in the run's words" \
    "$([ $rc = 0 ] && [ -n "$V1" ] && [ "$(sha "$V1")" = "$(sha "$M3/goldhub__YuE2-RS-Finetunes/VAE-RS/YuE2-VAE-RS-x3_v1-F32.gguf")" ] \
       && grep -q "^ *via .*YuE2-VAE-RS-x3_v1-F32.gguf .*delivered by disk3" <<< "$out" && [ "$(grep -c "delivered by" <<< "$out")" = 1 ]; echo $?)" "$out"
  mv "$V1" "$T/v1-aside"
  out=$(FAKE_HF_SPOIL=x3_v1 "$T/py/python" "$S3/launcher/fetch_models.py" --quant BF16 --yes 2>&1); rc=$?
  check "launcher/fetch_models.py (Windows and no bash): the same, its «via» line said before «done»" \
    "$([ $rc = 0 ] && [ "$(sha "$V1")" = "$(sha "$T/v1-aside")" ] && grep -B1 "^done .*YuE2-VAE-RS-x3_v1-F32.gguf" <<< "$out" | grep -q "via .*delivered by disk3"; echo $?)" "$out"
  out=$(FAKE_HF_SPOIL=x3_v2 bash "$S3/heresy/fetch-heresy.sh" --only extras --yes 2>&1); rc=$?
  check "heresy/fetch-heresy.sh (the Weights panel's runner): the second decoder from the mirror, «via» shown, the part fetched" \
    "$([ $rc = 0 ] && grep -q "^ *via .*YuE2-VAE-RS-x3_v2-F32.gguf .*delivered by disk3" <<< "$out" && grep -q "^fetched" <<< "$out"; echo $?)" "$out"
  out=$(bash "$S3/heresy/fetch-heresy.sh" --only extras --yes 2>&1); rc=$?
  check "and again: here, nothing fetched, no «via»" "$([ $rc = 0 ] && grep -q "^here" <<< "$out" && ! grep -q "via" <<< "$out"; echo $?)" "$out"
  # HERESY 2946 (the agent's item C12: «fetch-ruach-loras.py тоже через каналы»): the Studio's own adapters too: huggingface_hub stood in (its list as the
  # pin has it, every download refused, its 30 s between tries taken away), the adapter from the mirror, checked against our manifest
  LR="loras/voice-zz/voice-zz-e1.safetensors"; head -c 30000 /dev/urandom > "$T/lora.bin"
  LSHA=$(sha "$T/lora.bin"); LSZ=$(stat -c %s "$T/lora.bin"); cp "$T/lora.bin" "$CA3/$LSHA"
  printf "goldhub/Ruach_Studio_Models_v2\t%s\t%s\t%s\t%s\n" $NV "$LR" $LSZ $LSHA >> "$T/manifest3.tsv"
  mkdir -p "$T/stubs/huggingface_hub" "$S3/tmp/hf/expect"; echo "{}" > "$S3/tmp/hf/expect/goldhub__Ruach_Studio_Models_v2@$NV.manifest.json"
  cat > "$T/stubs/huggingface_hub/__init__.py" <<PYS
import time as _t
_t.sleep = lambda s: None
class _L:
    def __init__(self, sha): self.sha256 = sha
class _S:
    def __init__(self, n, size, sha): self.rfilename, self.size, self.lfs = n, size, _L(sha)
class HfApi:
    def model_info(self, repo, revision=None, files_metadata=False):
        class I: pass
        i = I(); i.siblings = [_S("$LR", $LSZ, "$LSHA")]; return i
def hf_hub_download(*a, **k):
    raise OSError("503 Service Unavailable (the stand-in)")
PYS
  cp "$ROOT/heresy/fetch-ruach-loras.py" "$S3/heresy/"
  out=$(PYTHONPATH="$T/stubs" timeout 200 "$PY" "$S3/heresy/fetch-ruach-loras.py" 2>&1); rc=$?
  check "heresy/fetch-ruach-loras.py: Hugging Face refuses twice; the adapter from the mirror, checked against our manifest, its «via» line, fetched" \
    "$([ $rc = 0 ] && [ "$(sha "$S3/loras/voice-zz/voice-zz-e1.safetensors" 2>/dev/null)" = "$LSHA" ] && grep -q "^via .*delivered by disk3" <<< "$out" && grep -q "^fetched .*via disk3" <<< "$out"; echo $?)" "$out"
  mv "$S3/loras/voice-zz/voice-zz-e1.safetensors" "$T/lora-aside" 2>/dev/null
  out=$(PYTHONPATH="$T/stubs" YUE2_HF_CHANNELS="$T/none.tsv" timeout 200 "$PY" "$S3/heresy/fetch-ruach-loras.py" --replace 2>&1); rc=$?
  check "  no channel listed: Hugging Face's words as before, failed, nothing via" "$([ $rc = 1 ] && grep -q "^failed .*503" <<< "$out" && ! grep -q "via\|tried also" <<< "$out"; echo $?)" "$out"
fi

echo
echo "hf_channels: $pass passed, $fail failed  ($T)"
[ "$fail" = 0 ]
