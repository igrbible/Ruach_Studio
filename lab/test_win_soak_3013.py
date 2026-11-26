"""HERESY 3013 (Viktor's law of 21.11.2026: the Windows build soaked and every log collected before a tag; 25.11.2026: the VM cannot take the
package over his mobile link): windows.yml's soak-windows job, read offline. After check-windows, on windows-2022, nothing waiting on it; the
package unpacked under the runner's own profile in a folder with spaces and Cyrillic (its letters from code points), installed by its own
install.ps1 and marked as RuachStudio.exe marks a whole install, started by RuachStudio.exe (console, no page); every GET route through
tools/lab-sweep.py; one 30 s song on the processor through /api/v1; then the five light parts in their order, each fetched by Engine → Models'
route, tried by its own way and its files deleted again; a part that cannot come warns, an error fails; every log uploaded whatever happened.
And the PowerShell itself: ASCII in every run block, no two variables that differ only by case (PowerShell's names ignore case: $r once
overwrote $R in check-windows), no automatic variable assigned, no "$name:" in a string, the helpers' here-string closed at its line's start.
    .venv/bin/python lab/test_win_soak_3013.py"""
import re
import sys
from pathlib import Path

LAB = Path(__file__).resolve().parent
KIT = LAB.parent
YML = next((p for p in (KIT / "heresy" / "root" / "github" / "workflows" / "windows.yml", KIT / ".github" / "workflows" / "windows.yml") if p.is_file()), None)
ok = 0


def check(cond, what):
    global ok
    if not cond:
        print("FAIL", what)
        sys.exit(1)
    ok += 1
    print("ok  ", what)


check(YML is not None, "windows.yml is found (heresy/root/github or a release tree's .github)")
text = YML.read_text(encoding="utf-8")
check(text.count("\n  soak-windows:\n") == 1, "windows.yml has one soak-windows job")
start = text.index("\n  soak-windows:\n")
check(text.index("\n  check-windows:\n") < start < text.index("\n  package-macos:\n"), "it stands after check-windows, before the Mac's package")
job_text = text[start:text.index("\n  package-macos:\n")]

try:
    import yaml
except ImportError:
    yaml = None
if yaml:
    y = yaml.safe_load(text)
    jobs = y["jobs"]
    j = jobs["soak-windows"]
    check(j["runs-on"] == "windows-2022", "on windows-2022, as the package's check")
    check(set(j["needs"]) == {"package-windows", "check-windows"}, f"it waits for the package and its check ({j['needs']})")
    check("needs.package-windows.result == 'success'" in j["if"] and "!cancelled()" in j["if"] and "inputs.soak != 'false'" in j["if"],
          "it runs whenever the package was made (its check red or green), unless soak is false")
    check(0 < int(j["timeout-minutes"]) <= 360, f"within a hosted runner's six hours ({j['timeout-minutes']} min)")
    check(not any("soak-windows" in (x.get("needs") or []) for k, x in jobs.items() if k != "soak-windows"),
          "no job waits on the soak: the package and the Mac's go on whatever it finds")
    soak = (y.get("on") or y.get(True))["workflow_dispatch"]["inputs"]["soak"]   # YAML 1.1 reads «on» as true
    check(str(soak["default"]) == "true", "the soak input is on by default")
    runs = [s["run"] for s in j["steps"] if "run" in s]
    last = j["steps"][-1]
    check(last.get("uses", "").startswith("actions/upload-artifact@") and last.get("if") == "${{ always() }}" and "soak-logs" in last["with"]["path"],
          "every log uploaded, whatever happened")
    check(j["steps"][-2].get("if") == "${{ always() }}" and "--report" in runs[-1], "the tester's report and the Studio's logs collected, whatever happened")
else:
    print("skip  YAML structure: no PyYAML here; the text checks below still run")
    runs = re.findall(r"run: \|\n((?:          .*\n|\n)+)", job_text)
    runs = ["\n".join(x[10:] for x in r.splitlines()) for r in runs]

check(len(runs) == 5, f"five run blocks: unpack and install, up and routes, the song, the parts, the logs ({len(runs)})")
allrun = "\n".join(runs)
bad = sorted({c for c in allrun if ord(c) > 127})
check(not bad, f"every run block is ASCII: the runner writes the script in its own encoding (found {bad})")

# the folder: C:\Users\runneradmin\Ruach Studio Тест\Тестер Иванов, its letters from code points
cps = re.findall(r"-join \(\[char\[\]\]\(([^)]*)\)\)", runs[0])
words = ["".join(chr(int(x, 16)) for x in c.split(",")) for c in cps]
check(words[:2] == ["Тест", "Тестер Иванов"], f"the folder's words from their code points: {words[:2]}")
check('Join-Path $env:USERPROFILE "Ruach Studio $test\\$who"' in runs[0], "under the runner's own profile (C:\\Users\\runneradmin)")
check("Expand-Archive $zip.FullName -DestinationPath $Parent" in runs[0], "the package unpacked there as a person unpacks it")
check('launcher\\install.ps1") -Yes' in runs[0] and "-Cpu" not in runs[0], "installed by its own install.ps1 (-Yes; the processor's packages chosen by install.ps1 itself: no card answers)")
check("$code = $LASTEXITCODE" in runs[0] and "throw" in runs[0].split("$code = $LASTEXITCODE")[1].split("\n")[2], "an install that stops fails the job")
check(".venv\\ruach-install-done" in runs[0] and '"$ver`n"' in runs[0], "marked as RuachStudio.exe marks a whole install for this version (native.go InstallDone)")

helpers = runs[0][runs[0].index("@'\n"):runs[0].index("\n'@ | Out-File")]
check("\n'@ | Out-File -Encoding utf8 (Join-Path $env:RUNNER_TEMP \"soak.ps1\")" in runs[0], "the helpers' here-string closes at its line's start, into soak.ps1")
check(all('. (Join-Path $env:RUNNER_TEMP "soak.ps1")' in r for r in runs[1:]), "every later step reads the helpers")
check('"--console", "--no-open"' in helpers and "RuachStudio.exe" in helpers, "RuachStudio.exe starts the lab and the engine: console, no page")
check('"$Lab/health"' in helpers and '"$Eng/health"' in helpers and "http://127.0.0.1:41870" in helpers and "http://127.0.0.1:7777" in helpers,
      "it waits for both: the lab's health and the engine's")
check(all('StudioUp "' in r for r in runs[1:4]), "each working step has the Studio up (started again if an earlier step's process did not outlive it)")
check("SkipHttpErrorCheck = $true" in helpers and "Code = -1" in helpers, "a route's 4xx or 5xx is read as an answer, none at all as -1")

check('tools\\lab-sweep.py") $Lab --out' in runs[1] and "if ($swept) { throw" in runs[1], "every GET route of the lab (lab-sweep.py: no 500, no raw WinError) or the job fails")
check('"$Eng/api/v1/songs" "POST"' in helpers and "duration = 30" in runs[2] and 'mode = "direct"' in runs[2], "one 30 s song on the processor through /api/v1")
check('"done", "failed", "error", "cancelled"' in helpers and 'throw "the song ($Tag) did not end done' in helpers, "a song that does not end done fails the job")
check('-t 10 -c:a pcm_s24le' in runs[2] and "ci-soak-10s" in runs[2], "a 10 s take cut from it for the upscale")

parts = re.findall(r'@\("(\w+)", ([\d.]+)\)', runs[3])
check([p for p, _ in parts] == ["transcriber", "stems", "whisper", "nam", "upscale"], f"the five light parts, one at a time, in their order ({parts})")
check('Ask "$Lab/weights/fetch" "POST" @{ part = $name }' in runs[3] and 'Ask "$Lab/weights"' in runs[3], "each fetched by Engine → Models' own route, its job followed")
for part, how in (("transcriber", '"$Eng/transcribe"'), ("transcriber", 'abc = $abc; duration = 30'), ("stems", '"$Lab/stems?name='),
                  ("whisper", '"$Lab/gloss?name=$q&force=1"'), ("nam", 'lab\\builtin_steps\\ruach\\nam.py'), ("upscale", '"$Lab/upscale?name=ci-soak-10s')):
    check(how in runs[3], f"{part} tried its own way: {how}")
check("$before = ModelFiles" in runs[3] and "$after = ModelFiles" in runs[3] and "Remove-Item -LiteralPath $p -Force" in runs[3],
      "the files each part brought (models\\, hf_cache\\) deleted again after it")
cont = runs[3].split("$before = ModelFiles")[1].split("$after = ModelFiles")[0]
check("continue" not in cont, "no way past the deletion: a fetch cut short leaves nothing behind either")
check('"::warning::$($warned[-1])"' in runs[3] and "(FreeGB) -lt (2 * $need + 3)" in runs[3], "a part that cannot come (its download, the disk) warns and is skipped")
check("$words -match $RawWords" in runs[3] and 'if ($bad) { throw' in runs[3], "a raw error in a fetch, or a try that fails, fails the job at the end")
check("UnicodeEncodeError|UnicodeDecodeError" in runs[3], "a Unicode error in the Studio's logs fails it (HERESY 2998)")
check("Stop-Process" in runs[-1] and "StartsWith($Root" in runs[-1] and "studio-logs" in runs[-1], "at the end the Studio's processes stopped and its logs copied")

# PowerShell: names ignore case, automatic variables are not ours, "$name:" reads as a drive
names = {}
for n in re.findall(r"\$([A-Za-z_][A-Za-z0-9_]*)", allrun):
    names.setdefault(n.lower(), set()).add(n)
clash = {k: v for k, v in names.items() if len(v) > 1 and k not in ("lastexitcode",)}
check(not clash, f"no two variables differ only by case ({clash})")
auto = re.findall(r"\$(input|args|host|error|matches|home|pid|pwd|this|foreach|switch|profile|event|sender|psitem|true|false)\s*=(?!=)", allrun, re.I)   # $null = … discards, as meant
check(not auto, f"no automatic variable assigned ({auto})")
drive = [m for m in re.findall(r'"[^"\n]*\$(?!env:|global:|script:|using:)([A-Za-z_]\w*):[\s"][^"\n]*"', allrun)]
check(not drive, f'no "$name:" in a string (PowerShell reads it as a drive: write "$($name):") {drive}')
check(allrun.count("{") == allrun.count("}") and allrun.count("(") == allrun.count(")"), "braces and parentheses balance in the run blocks")

print(f"{ok} passed")
