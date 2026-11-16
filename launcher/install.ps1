# HERESY 2649 (the native Windows port): Ruach Studio's Python on Windows, from nothing. Brings uv (Astral's, pinned) into tmp\uv, Python 3.12 and
# the Studio's .venv with it (nothing installed for the whole machine, nothing outside the Studio's folder), then launcher\setup_win.py: the lab's
# packages and the models a song needs. RuachStudio.cmd runs it the first time; by hand:
#     powershell -NoProfile -ExecutionPolicy Bypass -File launcher\install.ps1 [-Cpu] [-Yes]
param([switch]$Cpu, [switch]$Yes, [switch]$NoModels)
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$Root = Split-Path -Parent $PSScriptRoot
$UvVersion = "0.6.14"
$UvDir = Join-Path $Root "tmp\uv"
$Uv = Join-Path $UvDir "uv.exe"
Write-Host "Ruach Studio $(Get-Content (Join-Path $Root 'VERSION') -ErrorAction SilentlyContinue) - $Root"
if (-not (Test-Path $Uv)) {
    Write-Host "-- uv $UvVersion (the Python manager), into tmp\uv"
    New-Item -ItemType Directory -Force $UvDir | Out-Null
    $zip = Join-Path $UvDir "uv.zip"
    Invoke-WebRequest "https://github.com/astral-sh/uv/releases/download/$UvVersion/uv-x86_64-pc-windows-msvc.zip" -OutFile $zip -UseBasicParsing
    Expand-Archive -Force $zip $UvDir
    Remove-Item $zip
}
$env:UV_PYTHON_INSTALL_DIR = Join-Path $Root "tmp\python"
$env:UV_CACHE_DIR = Join-Path $Root "tmp\uv-cache"
$env:PYTHONUTF8 = "1"
$Py = Join-Path $Root ".venv\Scripts\python.exe"
if (-not (Test-Path $Py)) {
    Write-Host "-- Python 3.12 and the Studio's .venv"
    & $Uv venv --python 3.12 --seed (Join-Path $Root ".venv")
    if ($LASTEXITCODE) { Write-Host "ruach install stopped: uv could not make .venv"; exit 1 }
}
if (-not $Cpu) {
    $smi = Join-Path $env:SystemRoot "System32\nvidia-smi.exe"
    if (-not (Test-Path $smi)) { Write-Host "no NVIDIA card answers: the CPU packages (the Studio runs on the processor, slowly)"; $Cpu = $true }
}
$a = @()
if ($Cpu) { $a += "--cpu" }
if ($Yes) { $a += "--yes" }
if ($NoModels) { $a += "--no-models" }
& $Py (Join-Path $Root "launcher\setup_win.py") @a
exit $LASTEXITCODE
