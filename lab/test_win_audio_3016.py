"""HERESY 3016: the Audio I/O tab on Windows lists the sound devices by the names Windows gives them (its audio endpoints from Get-PnpDevice),
checked on this Linux machine with sys.platform faked and PowerShell's answer given: render and capture told apart by the MMDevice id, the
device in the last brackets, a virtual cable under Virtual, a device Windows has off left out, Cyrillic names whole, one device's object, and
every way PowerShell can fail said aloud (never «no sound card»); the gateway's own steps refuse in Windows' words; Linux and macOS unchanged.
    .venv/bin/python lab/test_win_audio_3016.py"""
import json
import subprocess
import sys
import tempfile
import types
from pathlib import Path

LAB = Path(__file__).resolve().parent
sys.path.insert(0, str(LAB))
import audio_io as A  # noqa: E402

ok = 0


def check(cond, what, got=""):
    global ok
    if not cond:
        print("FAIL", what, got)
        sys.exit(1)
    ok += 1
    print("PASS", what)


def answer(stdout, rc=0, raise_=None):
    """A subprocess.run of our own that answers as PowerShell would, and keeps what it was asked."""
    asked = []

    def run(cmd, **k):
        asked.append((cmd, k))
        if raise_:
            raise raise_
        return types.SimpleNamespace(returncode=rc, stdout=stdout, stderr="")
    run.asked = asked
    return run


R, C = "SWD\\MMDEVAPI\\{0.0.0.00000000}.{a1}", "SWD\\MMDEVAPI\\{0.0.1.00000000}.{b2}"
ROWS = [{"FriendlyName": "Speakers (Realtek(R) Audio)", "InstanceId": R, "Status": "OK"},
        {"FriendlyName": "Microphone (Realtek(R) Audio)", "InstanceId": C, "Status": "OK"},
        {"FriendlyName": "Динамики (Scarlett 2i2 USB)", "InstanceId": R.replace("a1", "c3"), "Status": "OK"},
        {"FriendlyName": "Line (Scarlett 2i2 USB)", "InstanceId": C.replace("b2", "d4"), "Status": "OK"},
        {"FriendlyName": "CABLE Input (VB-Audio Virtual Cable)", "InstanceId": R.replace("a1", "e5"), "Status": "OK"},
        {"FriendlyName": "CABLE Output (VB-Audio Virtual Cable)", "InstanceId": C.replace("b2", "f6"), "Status": "OK"},
        {"FriendlyName": "Headphones (Old Headset)", "InstanceId": R.replace("a1", "g7"), "Status": "Error"},
        {"FriendlyName": "Digital Output", "InstanceId": R.replace("a1", "h8"), "Status": "OK"},
        {"FriendlyName": "Something odd", "InstanceId": "ROOT\\X\\0000", "Status": "OK"}]

real_platform, real_run = sys.platform, subprocess.run
tmp = Path(tempfile.mkdtemp())
try:
    # ── the endpoints read from PowerShell's answer ─────────────────────────────────────────────────────────────────────────────────────
    run = answer("﻿" + json.dumps(ROWS, ensure_ascii=False))
    eps = A.win_endpoints(run)
    cmd, kw = run.asked[0]
    check(cmd[0] == "powershell.exe" and "-NoProfile" in cmd and "Get-PnpDevice -Class AudioEndpoint -PresentOnly" in cmd[-1]
          and "[Console]::OutputEncoding = [Text.Encoding]::UTF8" in cmd[-1] and kw.get("encoding") == "utf-8" and kw.get("errors") == "replace",
          "asked of PowerShell's Get-PnpDevice, its answer in UTF-8 (a Russian Windows' names whole), read as UTF-8")
    check(eps[0] == {"name": "Speakers", "card": "Realtek(R) Audio", "way": "out"} and eps[1] == {"name": "Microphone", "card": "Realtek(R) Audio", "way": "in"},
          "render is out, capture is in (the MMDevice id); the device is what the last brackets hold, its own brackets kept", eps[:2])
    check({"name": "Динамики", "card": "Scarlett 2i2 USB", "way": "out"} in eps, "a Cyrillic endpoint's name whole")
    check(not any(e["card"] == "Old Headset" for e in eps), "a device Windows has off (Status Error) is not listed")
    check({"name": "Digital Output", "card": "Digital Output", "way": "out"} in eps, "a name without brackets is its own device")
    check(not any(e["name"] == "Something odd" for e in eps), "an endpoint neither render nor capture is left out")
    check(A.win_endpoints(answer(json.dumps(ROWS[0]))) == [{"name": "Speakers", "card": "Realtek(R) Audio", "way": "out"}],
          "one device: PowerShell's object, not a list, read as one")
    check(A.win_endpoints(answer("[]")) == [], "no endpoint at all is an empty list, a real «none»")
    for why, r in (("no powershell.exe", answer("", raise_=FileNotFoundError(2, "no"))), ("a timeout", answer("", raise_=subprocess.TimeoutExpired("x", 30))),
                   ("a refusal (exit 1)", answer("", rc=1)), ("an answer that is no JSON", answer("Get-PnpDevice : not recognized")),
                   ("an empty answer", answer("")), ("a JSON that is no list", answer('"x"'))):
        check(A.win_endpoints(r) is None, f"PowerShell's failure ({why}) is None, never an empty list")

    # ── /audio/devices on Windows ──────────────────────────────────────────────────────────────────────────────────────────────────────
    sys.platform = "win32"
    subprocess.run = answer(json.dumps(ROWS, ensure_ascii=False))
    d = A.devices(user_dir=str(tmp))
    ph = {(p["card_name"], p["name"]): p for p in d["physical"]}
    check(set(ph) == {("Realtek(R) Audio", "Speakers"), ("Realtek(R) Audio", "Microphone"), ("Scarlett 2i2 USB", "Динамики"),
                      ("Scarlett 2i2 USB", "Line"), ("Digital Output", "Digital Output")},
          "Physical: each device's endpoints by Windows' names", sorted(ph))
    check(ph[("Realtek(R) Audio", "Speakers")]["out"] and not ph[("Realtek(R) Audio", "Speakers")]["in"] and ph[("Realtek(R) Audio", "Microphone")]["in"]
          and ph[("Realtek(R) Audio", "Speakers")]["id"] == ph[("Realtek(R) Audio", "Microphone")]["id"] != ph[("Scarlett 2i2 USB", "Line")]["id"]
          and all(p["driver"] == "Windows" and p["alsa"] == "" and p["formats"] == {} for p in d["physical"]),
          "one card per device (its endpoints under it), in and out told, no ALSA address")
    check(d["virtual"] == [{"kind": "windows", "name": "CABLE Input", "description": "VB-Audio Virtual Cable", "out": True, "in": False},
                           {"kind": "windows", "name": "CABLE Output", "description": "VB-Audio Virtual Cable", "out": False, "in": True}],
          "a virtual cable under Virtual", d["virtual"])
    check(d["said"] == [A.NOT_HERE_WIN] and d["linux_only"] and "ALSA" not in json.dumps(d) and "asound" not in json.dumps(d),
          "said once: listed as Windows names them, the gateway and the monitor Linux's; no ALSA word")
    subprocess.run = answer("", raise_=FileNotFoundError(2, "no"))
    d = A.devices(user_dir=str(tmp))
    check(d["said"] == [A.NOT_HERE_WIN, A.WIN_UNHEARD] and d["physical"] == [] and d["virtual"] == [],
          "PowerShell silent: said so beside the empty lists (the page's «No sound card is seen here» is not the whole word)")
    for name, call in (("the floor's measure", lambda: A.probe("x", 48000, 2)), ("the gateway", lambda: A.set_gateway(str(tmp), "a", "b", 48000))):
        try:
            call()
            check(False, f"{name} on Windows refused")
        except ValueError as e:
            check(str(e) == A.NOT_HERE_WIN, f"{name} on Windows refused in Windows' words, not «none are listed yet»")

    # ── macOS and Linux as before ──────────────────────────────────────────────────────────────────────────────────────────────────────
    subprocess.run = answer(json.dumps(ROWS))
    sys.platform = "darwin"
    d = A.devices(user_dir=str(tmp))
    check(d["said"] == [A.NOT_HERE] and d["physical"] == [] and not subprocess.run.asked, "macOS: the sentence of 2934, no PowerShell asked")
    sys.platform = "linux"
    subprocess.run = answer("")
    d = A.devices(root=str(tmp / "no-asound"), user_dir=str(tmp))
    check(not d.get("linux_only") and not any(r[0][0] == "powershell.exe" for r in subprocess.run.asked), "Linux: ALSA as before, no PowerShell asked")

    # ── the page fills no gateway from Windows' devices ────────────────────────────────────────────────────────────────────────────────
    js = (LAB.parent / "build/tools/console/heresy-post.js").read_text(encoding="utf-8")
    check(js.count("if (!d.linux_only) (d.physical || []).forEach") == 1 and js.count("if (!d.linux_only) v.forEach") == 1,
          "heresy-post.js: no gateway or monitor choice made of Windows' devices (linux_only)")
    for l in ("ru", "uk", "be", "el", "es", "it", "fr", "pt", "de", "ja", "zh", "he"):
        cat = (LAB.parent / f"build/tools/console/heresy-i18n-{l}.js").read_text(encoding="utf-8")
        check(json.dumps(A.NOT_HERE_WIN) + ":" in cat and json.dumps(A.WIN_UNHEARD) + ":" in cat, f"both sentences in the {l} catalog")
finally:
    sys.platform, subprocess.run = real_platform, real_run
print(f"{ok} passed")
