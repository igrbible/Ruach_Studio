"""HERESY 2026 (Viktor 02.11.2026: «Статистику с гитхаб репо в самый подвал можешь прикрутить? Количество лайков, форков, Issues, уникальные
клоны и т.п.»): the visiting card's numbers, written on the server's side so no visitor asks GitHub anything.

GitHub keeps a repository's traffic (clones, views) for 14 days and shows it to those who may push; the counts of each day are kept here in a
ledger, so the card can say the clones since the first day this ran. The stars, forks, watchers, open issues and every release asset's
downloads are public. It asks through `gh` (logged in as one who may push) or a token in GH_TOKEN.

    python3 github_stats.py [OUT.json] [--ledger PATH]     (OUT: stats.json beside this file)
    → {"when", "stars", "forks", "watchers", "issues", "downloads", "clones14", "uniques14", "views14", "visitors14", "clones_total", "since"}"""
import json
import os
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

REPO = "igrbible/Ruach_Studio"
HERE = Path(__file__).resolve().parent
args = [a for a in sys.argv[1:] if not a.startswith("--")]
OUT = Path(args[0]) if args else HERE / "stats.json"
LEDGER = Path(sys.argv[sys.argv.index("--ledger") + 1]) if "--ledger" in sys.argv else Path.home() / ".local/share/ruach-site/github-traffic.json"


def api(path):
    token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
    if token:
        req = urllib.request.Request("https://api.github.com/" + path, headers={"Authorization": "Bearer " + token, "Accept": "application/vnd.github+json",
                                                                               "User-Agent": "ruach-site-stats"})
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode())
    return json.loads(subprocess.run(["gh", "api", path], capture_output=True, text=True, check=True).stdout)


repo = api(f"repos/{REPO}")
out = {"when": time.strftime("%Y-%m-%d"), "stars": repo.get("stargazers_count"), "forks": repo.get("forks_count"),
       "watchers": repo.get("subscribers_count"), "issues": repo.get("open_issues_count")}
try:
    out["downloads"] = sum(a.get("download_count", 0) for rel in api(f"repos/{REPO}/releases?per_page=100") for a in rel.get("assets", []))
except Exception as x:  # noqa: BLE001 — said, and the number left out (the card hides what it has not)
    print("releases:", x, file=sys.stderr)
try:
    clones, views = api(f"repos/{REPO}/traffic/clones"), api(f"repos/{REPO}/traffic/views")
    out.update(clones14=clones.get("count"), uniques14=clones.get("uniques"), views14=views.get("count"), visitors14=views.get("uniques"))
    LEDGER.parent.mkdir(parents=True, exist_ok=True)
    led = json.loads(LEDGER.read_text(encoding="utf-8")) if LEDGER.is_file() else {"clones": {}}
    for d in clones.get("clones", []):                   # a day's count as GitHub last said it (the newest day may still grow)
        led["clones"][d["timestamp"][:10]] = d["count"]
    LEDGER.write_text(json.dumps(led, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    if led["clones"]:
        out["clones_total"], out["since"] = sum(led["clones"].values()), min(led["clones"])
except Exception as x:  # noqa: BLE001 — traffic needs push rights: without them the card shows the public numbers alone
    print("traffic:", x, file=sys.stderr)
OUT.write_text(json.dumps({k: v for k, v in out.items() if v is not None}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
print(OUT, json.dumps(out, ensure_ascii=False))
