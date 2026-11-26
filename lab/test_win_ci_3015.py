"""HERESY 3015 (rc3's first Windows run, 26.11.2026, run 45750064010): what made four natives legs and check-windows red, read offline.
· llama.cpp: `$gpu = if (...) { @("-DGGML_CUDA=OFF") }` came back a bare string (an if hands a one-element array on unrolled) and `@gpu` splatted
  it letter by letter ("Unknown argument -"); the CUDA leg configured, then its build fetched llama-server's own web page from a Hugging Face
  bucket ("b1" absent, "latest" a newer page its check refuses: MSB8066). The array is made whole by @(...) and the page is not fetched
  (LLAMA_USE_PREBUILT_UI=OFF): the Studio never opens llama-server's page.
· audio.cpp: its CMakeLists embeds webui/native/demo_voices/*.wav in audiocpp_server, and build/.gitignore's *.wav kept them out of the release
  tree, so the Narrator's leg could not configure; build/.gitignore lets those four in.
· check-windows: the lab started by hand was stopped by Stop-Process alone and its https door (tls_door.py, its folder the package) lived on and
  held the package against 2998's move; the lab's tree is ended (taskkill /T), and before the move anything still running from the package is
  named and fails the step, never ended quietly.
· the natives input: with engines_from, natives=true builds them in this run and takes only the two engines from the earlier one.
· the soak (rc3's first, run 45750064010): its Amp (NAM) step was called with no capture (nam.py: "choose a capture first"), and LabJob kept
  an upscale's last seen "running" after lab.py popped it on success (done after 17 min, waited 40); the capture is taken from
  GET /nam/captures, and a job gone from /health is read by the file it writes last.
    .venv/bin/python lab/test_win_ci_3015.py"""
import re
import sys
from pathlib import Path

LAB = Path(__file__).resolve().parent
KIT = LAB.parent
YML = next((p for p in (KIT / "heresy" / "root" / "github" / "workflows" / "windows.yml", KIT / ".github" / "workflows" / "windows.yml") if p.is_file()), None)
IGN = KIT / "build" / ".gitignore"
ok = 0


def check(cond, what):
    global ok
    if not cond:
        print("FAIL", what)
        sys.exit(1)
    ok += 1
    print("ok  ", what)


def job(name, text):
    start = text.index(f"\n  {name}:\n")
    nxt = re.search(r"\n  [a-z][\w-]*:\n", text[start + 1:])
    return text[start:start + 1 + nxt.start()] if nxt else text[start:]


check(YML is not None, "windows.yml is found (heresy/root/github or a release tree's .github)")
text = YML.read_text(encoding="utf-8")

nat = job("natives", text)
gpu = re.search(r"^\s*\$gpu = (.+)$", nat, re.M)
check(gpu and gpu.group(1).startswith("@(if "), "llama.cpp: $gpu is an array whatever the if hands on (@(if ...))")
check("@gpu" in nat and not re.search(r"\$gpu = if ", nat), "llama.cpp: no bare if assigned to the splatted variable")
check("-DLLAMA_USE_PREBUILT_UI=OFF" in nat and "-DLLAMA_BUILD_UI=OFF" in nat, "llama.cpp: its web page is neither fetched nor built")
check("if: ${{ !inputs.engines_from || inputs.natives == 'true' }}" in nat, "the natives run without engines_from, or with natives=true")

inputs = text[text.index("workflow_dispatch:"):text.index("\njobs:")]
check(re.search(r"\n      natives:\n        description: .+\n        required: false\n        default: \"false\"", inputs) is not None,
      "a natives input, false by default (engines_from alone still packs in minutes)")

pkg = job("package-windows", text)
check("if: ${{ !inputs.engines_from || inputs.natives == 'true' }}" in pkg, "the package takes this run's artifacts when the natives are built here")
check("pattern: ${{ inputs.natives == 'true' && 'ruach-engine-windows-x64-c*' || 'ruach-engine-windows-x64-*' }}" in pkg,
      "and only the earlier run's two engines then (-cpu, -cuda12), never its natives")
check(re.search(r"run-id: \$\{\{ inputs\.engines_from \}\}", pkg) is not None, "the earlier run is still engines_from")

chk = job("check-windows", text)
check("Stop-Process -Id $p.Id -Force" not in chk, "check-windows never stops a hand-started lab by its python alone")
check(chk.count("taskkill /PID $p.Id /T /F") == 2, "both hand-started labs of check-windows are ended with their tree (taskkill /T)")
cy = chk[chk.index("From a folder with spaces and Cyrillic"):]
before_move = cy[:cy.index("Move-Item $R $K")]
check("$left = @(Get-CimInstance Win32_Process" in before_move and "throw \"the package is held by" in before_move,
      "before the move, anything still running from the package is named and fails the step")
check("Stop-Process" not in before_move, "and it is never ended quietly there")
check("Remove-Item Env:PYTHONUTF8" in cy and "UnicodeEncodeError|UnicodeDecodeError" in cy, "the 2998 check itself is unchanged (no PYTHONUTF8, no Unicode error)")

soak = job("soak-windows", text)
lj = soak[soak.index("function LabJob("):]
lj = lj[:lj.index("\n          }\n")]
check("[string]$DoneFile" in lj and "elseif (Test-Path -LiteralPath $DoneFile) { $state = \"done\"; break }" in lj,
      "the soak's LabJob: a job gone from /health (lab.py pops one that ended well) is done when the file it writes last is there")
check("elseif ($seen) {" in lj and "$seen = $true" in lj, "and gone without that file is said, never kept as its last seen state")
check('LabJob "upscale:ci-soak-10s:$uid" 40 (Join-Path $Root "outputs\\ci-soak-10s\\derived\\$uid\\manifest.json")' in soak,
      "the upscale is followed to its manifest.json (lab.py writes it before the branch appears)")
nam = soak[soak.index('"nam" {'):soak.index('"upscale" {')]
check('Ask "$Lab/nam/captures"' in nam and "capture = $capId" in nam and 'WriteAllText($params, "{}"' not in nam,
      "the soak's Amp (NAM) step plays through a capture GET /nam/captures lists (nam.py refuses without one)")

check(IGN.is_file(), "build/.gitignore is found")
ign = IGN.read_text(encoding="utf-8").splitlines()
check("*.wav" in ign, "build/.gitignore still keeps the engine's own wav files out")
neg = "!audio.cpp/webui/native/demo_voices/*.wav"
check(neg in ign and ign.index(neg) > ign.index("*.wav"), "and lets audio.cpp's four demo voices in, after *.wav (audiocpp_server embeds them)")
demo = KIT / "build" / "audio.cpp" / "webui" / "native" / "demo_voices"
if demo.is_dir():
    wavs = sorted(p.name for p in demo.glob("*.wav"))
    check(wavs == ["demo_1_man.wav", "demo_2_man.wav", "demo_3_woman.wav", "demo_4_woman.wav"], f"the four voices audio.cpp's CMakeLists reads are there ({wavs})")

print(f"{ok} passed")
