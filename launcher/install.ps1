# HERESY 2649 (the native Windows port): Ruach Studio's Python on Windows, from nothing. Brings uv (Astral's, pinned) into tmp\uv, Python 3.12 and
# the Studio's .venv with it (nothing installed for the whole machine, nothing outside the Studio's folder), then launcher\setup_win.py: the lab's
# packages and the models a song needs. RuachStudio.cmd runs it the first time; by hand:
#     powershell -NoProfile -ExecutionPolicy Bypass -File launcher\install.ps1 [-Cpu] [-Yes]
param([switch]$Cpu, [switch]$Yes, [switch]$NoModels)
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
# HERESY 2935 (a tester's console showed Cyrillic as gibberish, code page 866): this console in UTF-8, so what uv, nvidia-smi and the
# Studio's Python print in UTF-8 reads right in it; with no console (the output redirected) it is left as it is
try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false } catch { }
# HERESY 2998: and what it pipes to a program it starts in UTF-8 too; the file itself is UTF-8 with a BOM, which Windows PowerShell 5.1
# needs to read a script as UTF-8 at all (without one it reads the ANSI code page)
$OutputEncoding = New-Object System.Text.UTF8Encoding $false
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
$TorchCpu = $false
if (-not $Cpu) {
    $smi = Join-Path $env:SystemRoot "System32\nvidia-smi.exe"
    if (-not (Test-Path $smi)) { Write-Host "no NVIDIA card answers: the CPU packages (the Studio runs on the processor, slowly)"; $Cpu = $true }
    else {
        # HERESY 2686: PyTorch's CUDA 12.8 wheels carry kernels for compute 7.5 and up (sm_75 to sm_120); on an older card (Pascal, Volta) the
        # lab's torch would see the card and fail at its first kernel. Such a card gets the lab's PyTorch for the processor, and the models and
        # the engine for the card (engine\cuda has kernels from compute 6.1)
        $caps = @()
        try { $caps = @(& $smi --query-gpu=compute_cap --format=csv,noheader | ForEach-Object { [double]::Parse("$_".Trim(), [Globalization.CultureInfo]::InvariantCulture) }) } catch { $caps = @() }
        if ($caps.Count -and -not ($caps | Where-Object { $_ -ge 7.5 })) {
            Write-Host "the card (compute $($caps -join ', ')) is older than PyTorch's CUDA 12.8 (7.5 and up): the lab's PyTorch for the processor; the engine sings on the card"
            $TorchCpu = $true
        }
    }
}
$a = @()
if ($Cpu) { $a += "--cpu" }
if ($TorchCpu) { $a += "--torch-cpu" }
if ($Yes) { $a += "--yes" }
if ($NoModels) { $a += "--no-models" }
& $Py (Join-Path $Root "launcher\setup_win.py") @a
exit $LASTEXITCODE
