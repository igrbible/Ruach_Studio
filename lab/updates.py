"""HERESY 1169 (Viktor 07.10.2026: «проверка на обновления — раз в сутки, неделю, месяц, никогда, кнопка "проверить сейчас",
... обновить автоматом, вручную. Попап для пользователя нового, скажем, через сутки. Настройка в Engine… наверное на тегах
новых релизов»): the studio's releases on GitHub against its own VERSION. Read over plain HTTPS, no token (sixty asks an
hour from one address; a daily look is one). When to look is the page's (its schedule, or «Check now»); the lab keeps
only the last answer (user/updates.json), nothing about the user, and sends nothing but the request itself.

An update runs only where the studio is a clone of its own repository (git, origin igrbible/Ruach_Studio, nothing that git
tracks changed by hand): there it fetches the tag, checks it out, builds, and restarts the studio's units, while nothing
runs. Anywhere else (a development tree, a copy without git) the answer says why, and how to update by hand.

    GET  /update                       the version here, the last check, the release candidates' choice, can it run here
    POST /update {"check": true, "rc": true}      ask GitHub now (rc: release candidates count too)
    POST /update {"run": "2.0.0-rc3"}  update to that release (409 while a job runs or where it cannot run)
    GET  /update/log                   the running update's words"""
import json, re, subprocess, time, urllib.request
from pathlib import Path

REPO = "igrbible/Ruach_Studio"
API = "https://api.github.com/repos/" + REPO + "/releases?per_page=30"
UNIT = "ruach-update"


def version_key(tag):
    """2.0.0-rc3 → (2, 0, 0, 0, 3); 2.0.0 → (2, 0, 0, 1, 0): a release ranks above its candidates. None: not a version."""
    m = re.match(r"^v?(\d+)\.(\d+)\.(\d+)(?:-rc\.?(\d+))?$", str(tag or "").strip())
    if not m:
        return None
    a, b, c, rc = m.groups()
    return (int(a), int(b), int(c), 0 if rc else 1, int(rc or 0))


def current(root):
    p = Path(root) / "VERSION"
    return p.read_text(encoding="utf-8").strip() if p.is_file() else ""


def _state_file(config_dir):
    return Path(config_dir) / "updates.json"


def _load(config_dir):
    try:
        return json.loads(_state_file(config_dir).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def _save(config_dir, state):
    f = _state_file(config_dir)
    tmp = f.with_suffix(".json.part")
    tmp.write_text(json.dumps(state, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(f)


def _git(root, *args):
    r = subprocess.run(["git", "-C", str(root), *args], capture_output=True, text=True, timeout=30)
    return r.returncode, r.stdout.strip(), r.stderr.strip()


def can_run(root):
    """(True, "") where an update can run; else (False, why), said as it is."""
    root = Path(root)
    if not (root / ".git").exists():
        return False, "this studio is not a git clone: update it by hand (download the new release, keep models/, outputs/ and user/)"
    code, origin, _ = _git(root, "remote", "get-url", "origin")
    if code or REPO.lower() not in origin.lower():
        return False, "this is a development tree (its origin is not " + REPO + "): update it by hand"
    code, dirty, _ = _git(root, "status", "--porcelain", "--untracked-files=no")
    if code:
        return False, "git does not answer here"
    if dirty:
        return False, "files git tracks were changed by hand here (" + str(len(dirty.splitlines())) + "): an update would mix them; update by hand"
    return True, ""


def check(root, config_dir, rc=None):
    """Ask GitHub; keep and return the answer. rc None: candidates count when this is one (2.0.0-rc2 sees rc3)."""
    here = current(root)
    state = _load(config_dir)
    want_rc = bool(rc) if rc is not None else (version_key(here) or (0, 0, 0, 1, 0))[3] == 0
    req = urllib.request.Request(API, headers={"Accept": "application/vnd.github+json", "User-Agent": "Ruach-Studio"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            rels = json.loads(r.read().decode("utf-8"))
    except Exception as e:                                   # said, never an empty «no updates»
        state.update({"checked": int(time.time()), "error": str(e)[:200]})
        _save(config_dir, state)
        return status(root, config_dir)
    found = [x for x in rels if not x.get("draft") and version_key(x.get("tag_name")) and (want_rc or not x.get("prerelease"))]
    best = max(found, key=lambda x: version_key(x["tag_name"]), default=None)
    latest = None
    if best:
        latest = {"tag": best["tag_name"], "version": best["tag_name"].lstrip("v"), "name": best.get("name") or best["tag_name"],
                  "notes": (best.get("body") or "")[:20000], "url": best.get("html_url") or "", "published": best.get("published_at") or "",
                  "candidate": bool(best.get("prerelease")) or version_key(best["tag_name"])[3] == 0}
    state.update({"checked": int(time.time()), "error": "", "latest": latest, "rc": want_rc})
    _save(config_dir, state)
    return status(root, config_dir)


def status(root, config_dir):
    here, state = current(root), _load(config_dir)
    latest = state.get("latest")
    newer = bool(latest and version_key(latest["tag"]) and version_key(here) and version_key(latest["tag"]) > version_key(here))
    ok, why = can_run(root)
    running = subprocess.run(["systemctl", "--user", "is-active", "--quiet", UNIT], timeout=10).returncode == 0
    return {"current": here, "latest": latest, "newer": newer, "checked": state.get("checked", 0), "error": state.get("error", ""),
            "rc": state.get("rc"), "can_run": ok, "why": why, "running": running, "repo": REPO}


def run(root, config_dir, tag, busy):
    """Start the update in a unit of its own (it outlives the lab's restart): (status, answer)."""
    root = Path(root)
    st = status(root, config_dir)
    if busy:
        return 409, {"error": "something runs: the update waits until nothing does"}
    if not st["can_run"]:
        return 409, {"error": st["why"]}
    if st["running"]:
        return 409, {"error": "an update runs already"}
    if not version_key(tag) or not (st["latest"] and st["latest"]["tag"].lstrip("v") == str(tag).lstrip("v")):
        return 400, {"error": "update to the release the last check found, by its name"}
    ref = st["latest"]["tag"]
    log = root / "tmp" / "update.log"
    log.parent.mkdir(parents=True, exist_ok=True)
    restart = "systemctl --user restart ruach-studio heresy-lab"
    script = ("set -e; cd " + _q(root) + "; echo \"── $(date '+%F %T') · " + ref + "\"; git fetch --tags --force origin; "
              "git checkout -q " + _q(ref) + "; NO_COLOR=1 ./build.sh --no-restart; "
              "if systemctl --user is-enabled --quiet ruach-studio 2>/dev/null; then echo '── restarting the studio'; " + restart + "; "
              "else echo '── built: start the studio again (./start.sh) to run " + ref + "'; fi; echo '── done'")
    subprocess.run(["systemd-run", "--user", "--quiet", "--collect", "--unit=" + UNIT, "--working-directory=" + str(root),
                    "/bin/bash", "-c", "(" + script + ") > " + _q(log) + " 2>&1"], check=True, timeout=30)
    return 202, {"started": ref}


def log_tail(root, lines=200):
    p = Path(root) / "tmp" / "update.log"
    try:
        return {"log": "\n".join(p.read_text(encoding="utf-8", errors="replace").splitlines()[-lines:])}
    except OSError:
        return {"log": ""}


def _q(s):
    return "'" + str(s).replace("'", "'\\''") + "'"


if __name__ == "__main__":                                   # a look from the console: python3 lab/updates.py [ROOT]
    import sys
    root = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
    print(json.dumps(check(root, root / "tmp", rc=True), ensure_ascii=False, indent=1)[:1500])
