"""HERESY 3000 (2879's cards after 2988 took Pinokio out): the model cards (the README.md of each repository the Studio's models come from,
their licences and credits) were fetched into models/misc/cards/ only by Pinokio's install.js; launcher/fetch_cards.py fetches them now,
run by launcher/install.sh on Linux and launcher/setup_win.py on Windows and macOS. Offline: Hugging Face is played by a stand-in urlopen.
    .venv/bin/python lab/test_model_cards_install.py"""
import importlib.util
import io
import re
import sys
import tempfile
import urllib.error
from pathlib import Path
from unittest import mock

sys.dont_write_bytecode = True
LAB = Path(__file__).resolve().parent
KIT = LAB.parent
L = KIT / "launcher"   # the Studio's own link into heresy/root/launcher: ROOT is the KIT, as for start.py
sys.path.insert(0, str(LAB))
import paths  # noqa: E402
ok = 0


def check(cond, what):
    global ok
    if not cond:
        print("FAIL", what)
        sys.exit(1)
    ok += 1
    print("ok  ", what)


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


fc = load("fetch_cards", L / "fetch_cards.py")
check(fc.CARDS == ["goldhub/YuE2-RS-Finetunes", "goldhub/Ruach_Studio_Models_v2", "m-a-p/YuE2-3B", "m-a-p/YuE2-Vae", "m-a-p/SheetSage2"],
      "the five cards Pinokio's install.js fetched (2879)")
src = (L / "fetch_cards.py").read_text(encoding="utf-8")
check("paths.MISC" in src and paths.MISC not in src.split('"""', 2)[2], "the cards' folder from lab/paths.py's MISC, not by hand (2330's guard)")
pins = {l.split()[0]: l.split()[1] for l in (KIT / "heresy" / "hf-revisions.txt").read_text(encoding="utf-8").splitlines()
        if l.strip() and not l.startswith("#") and len(l.split()) >= 2}
check(fc.rev("goldhub/YuE2-RS-Finetunes") == pins["goldhub/YuE2-RS-Finetunes"] and fc.rev("m-a-p/YuE2-3B") == "main",
      "a card of ours at its pinned revision, m-a-p's at main")
check(fc.rev("goldhub/Ruach_Studio_Models_v2") == pins["goldhub/Ruach_Studio_Models_v2"], "Ruach_Studio_Models_v2 at its own line, not a #part's")

asked = []


class Resp(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def urlopen(req, timeout=None, context=None):
    url = req.full_url
    asked.append(url)
    if "SheetSage2" in url and fail["sheet"]:
        raise urllib.error.HTTPError(url, 503, "busy", {}, None)
    return Resp(("# card of " + url + "\nlicense: cc-by-nc-4.0\n").encode())


with tempfile.TemporaryDirectory() as t:
    fc.CARDS_DIR = Path(t) / "Ruach Studio Тест" / paths.MISC / "cards"
    fail = {"sheet": True}
    out = io.StringIO()
    with mock.patch.object(fc.urllib.request, "urlopen", urlopen), mock.patch("sys.stdout", out):
        rc = fc.main([])
    o = out.getvalue()
    check(rc == 1 and "m-a-p/SheetSage2: failed, Hugging Face answered 503" in o, "a card that does not come is said with its reason, exit 1")
    check("4 of 5 in " in o and f"{paths.MISC}/cards/ (the Studio" in o and "Install again fetches them" in o, "the summary counts the cards and says what to do")
    check((fc.CARDS_DIR / "m-a-p--YuE2-3B" / "README.md").read_text(encoding="utf-8").startswith("# card of https://huggingface.co/m-a-p/YuE2-3B/resolve/main/README.md"),
          "m-a-p/YuE2-3B's card in m-a-p--YuE2-3B/README.md, from main")
    check(any(u.endswith(f"/goldhub/YuE2-RS-Finetunes/resolve/{pins['goldhub/YuE2-RS-Finetunes']}/README.md") for u in asked),
          "goldhub/YuE2-RS-Finetunes asked at its pin")
    check(not list(fc.CARDS_DIR.rglob("*.part")), "no .part left behind")
    asked.clear()
    fail["sheet"] = False
    out = io.StringIO()
    with mock.patch.object(fc.urllib.request, "urlopen", urlopen), mock.patch("sys.stdout", out):
        rc = fc.main([])
    o = out.getvalue()
    check(rc == 0 and len(asked) == 1 and "SheetSage2" in asked[0] and o.count(": here") == 4, "run again: the four here stay, the missing one comes")
    check("5 of 5" in o, "five of five")
    (fc.CARDS_DIR / "m-a-p--YuE2-Vae" / "README.md").unlink()
    out = io.StringIO()
    with mock.patch.object(fc.urllib.request, "urlopen", lambda *a, **k: (_ for _ in ()).throw(AssertionError("fetched"))), mock.patch("sys.stdout", out):
        rc = fc.main(["--check"])
    check(rc == 1 and "m-a-p/YuE2-Vae: missing" in out.getvalue(), "--check says what is missing and fetches nothing")
    out = io.StringIO()
    with mock.patch.object(fc.urllib.request, "urlopen", lambda *a, **k: (_ for _ in ()).throw(urllib.error.URLError("no route"))), \
            mock.patch("sys.stdout", out):
        rc = fc.main([])
    check(rc == 1 and "m-a-p/YuE2-Vae: failed, no answer (no route)" in out.getvalue(), "no network: said, never a silent pass")

sh = (L / "install.sh").read_text(encoding="utf-8")
i_cards, i_models = sh.find(".venv/bin/python launcher/fetch_cards.py ||"), sh.find("bash fetch-models.sh")
check(0 < i_cards < i_models, "install.sh fetches the cards in its models' step, before fetch-models.sh (whose refusal ends the install)")
check(re.search(r"fetch_cards\.py \|\| echo", sh) is not None, "install.sh: a card that does not come stops nothing")
sw = load("setup_win", L / "setup_win.py")
calls = []
with mock.patch.object(sw, "uv", lambda: "uv"), mock.patch.object(sw.subprocess, "run", lambda *a, **k: mock.Mock(returncode=0)), \
        mock.patch.object(sw, "msvc_runtime", lambda: None), mock.patch.object(sw, "utf8_out", lambda: None), \
        mock.patch.object(sw.subprocess, "call", lambda cmd: calls.append(cmd) or (5 if "fetch_models.py" in cmd[1] else 1)):
    rc = sw.main(["--yes"])
check([Path(c[1]).name for c in calls] == ["fetch_models.py", "fetch_cards.py"], "setup_win.py: the models, then their cards")
check(rc == 5, "setup_win.py answers with the models' code; the cards' does not change it")
calls.clear()
with mock.patch.object(sw, "uv", lambda: "uv"), mock.patch.object(sw.subprocess, "run", lambda *a, **k: mock.Mock(returncode=0)), \
        mock.patch.object(sw, "msvc_runtime", lambda: None), mock.patch.object(sw, "utf8_out", lambda: None), \
        mock.patch.object(sw.subprocess, "call", lambda cmd: calls.append(cmd) or 0):
    rc = sw.main(["--no-models"])
check(rc == 0 and calls == [], "setup_win.py --no-models (the builder): no models, no cards")
print(f"{ok} passed")
