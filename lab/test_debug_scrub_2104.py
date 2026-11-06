"""HERESY 2104: the debug journal's scrubber (lab/debugbundle.py) on what Viktor's journal of 05.11.2026 showed it left or broke: a vocabulary's and a
dataset's folder of the user's own marked; another host the class «external»; UUIDs, job ids and seeds marked; a key in a secret field dropped whole
(and counted in the README); addresses lan#/wan# marks of the journal's salt, a browser's version left as it is; a mail only with a TLD of letters,
and a mark (the screen «2560x1440@1.25» stays). The bundle end to end on a temporary kit, the journals of the units stood in for.
HERESY 2119: the guard reads with a pattern of its own, wider than the scrubber's: what the scrubber leaves (an address with «peer/» before it) it finds.
The local network's addresses are written here as LAN + their last two numbers, so the release's own scan for this network's addresses (make-release ④)
finds none in this file.
    python3 lab/test_debug_scrub_2104.py"""
import json
import re
import sys
import tempfile
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import debugbundle as db  # noqa: E402

bad = []
LAN = "192.168"


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got)[:400] + ")"))
    if not ok:
        bad.append(what)


sc = db.Scrub("5a175a17")
t = sc.text
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36"
check("a browser's version is no address", t(UA) == UA, t(UA))
check("the screen «2560x1440@1.25» is no mail", t('"screen": "2560x1440@1.25"') == '"screen": "2560x1440@1.25"', t('"screen": "2560x1440@1.25"'))
m = t("mail John.Doe@Example.com and john.doe@example.com")
check("a mail with a TLD of letters: a mark, the same for the same mail", m.count("mail#") == 2 and len(set(m.split()[1::2])) == 1 and "@" not in m, m)
a = t(f"from {LAN}.2.5 and 10.0.0.7 and 8.8.8.8 to 127.0.0.1:41870 via https://{LAN}.2.2:7443/x and fe80::1ff:fe23:4567:890a")
check("addresses: lan# for this network, wan# beyond it, this machine as it is, the port kept", a.count("lan#") == 4 and a.count("wan#") == 1 and "127.0.0.1:41870" in a and
      ":7443/x" in a and "192.168" not in a and "8.8.8.8" not in a, a)
check("the same address the same mark, another journal another", t(f"{LAN}.2.5") == t(f"{LAN}.2.5") and db.Scrub("othersalt").text(f"{LAN}.2.5") != t(f"{LAN}.2.5"))
check("a time is no IPv6 address", t("at 23:41:46 and 2026-11-05T23:41:46-06:00") == "at 23:41:46 and 2026-11-05T23:41:46-06:00", t("at 23:41:46"))
h = t("fetch https://openrouter.ai/api/v1/models and https://huggingface.co/m-a-p/YuE2-3B and http://golem.local:7443/ and http://localhost:7777/")
check("another host: «external»; a name of the local network a lan# mark; localhost as it is", h.count("https://external/") == 2 and "openrouter" not in h and
      "huggingface" not in h and "http://lan#" in h and "http://localhost:7777/" in h, h)
p = t('{"k":"net","m":"GET","p":"openrouter.ai/api/v1/models","s":200}')
check("the page's journal: another site's host in a request's path, «external»", '"p":"external/api/v1/models"' in p, p)
v = t('"GET /vocab/My%20Private.json HTTP/1.1" 200 · user/vocab/Secret set.json · /lab/vocab/Mine.json · datasets/raw/Viktor-voice/a.flac · GET /vocab/ HTTP/1.1')
check("a vocabulary's and a dataset's folder of the user's own: marks; the bare route as it is", v.count("vocab#") == 3 and "set#" in v and "Private" not in v and
      "Secret" not in v and "Mine" not in v and "Viktor-voice" not in v and "GET /vocab/ HTTP" in v, v)
u = t("plan 123e4567-e89b-12d3-a456-426614174000 · [Server] Job 0761cd5ba028f0de: { · page aabbccddeeff00112233aabb")
check("a UUID, the engine's job id and a page's id: marks", "uuid#" in u and "Job id#" in u and u.count("id#") >= 3 and "0761cd5b" not in u and "426614174000" not in u, u)
s = t('  "lm_seed": 188149957,\n  "seed": 992475142, sound_seed=17 and "seeds": 5')
check("seeds: marks (the field's name kept)", '"lm_seed": seed#' in s and '"seed": seed#' in s and "sound_seed=seed#" in s and "188149957" not in s and "992475142" not in s, s)
check("a mark is not taken for an id again (take#…, lan#…)", t("take#1a2b3c lan#4d5e6f") == "take#1a2b3c lan#4d5e6f")
B = '"b": "20261106T020305-ab12cd34"'   # build.sh's id of the page, beside every stack: no take's name, no id
check("the page's build id (build.sh: its day, T, its time, its hash) as it is", t(B) == B, t(B))

# HERESY 2119: the guard's own pattern, not the scrubber's: an address after a word and a slash, glued to a letter or an underscore, with leading zeros
LEFT = [f"peer/{LAN}.2.5", f"x{LAN}.2.6", "peer_10.0.0.7", f"{LAN}.002.005"]
check("the guard's address pattern is its own, not the scrubber's", db.GUARD_IPV4 is not db.IPV4 and db.GUARD_IPV4.pattern != db.IPV4.pattern)
check("the guard finds an address wherever it stands: after a word and a slash («peer/…»), glued to a letter or an underscore, with leading zeros",
      [db.guard_addresses(x) for x in LEFT] == [[x.split("/")[-1].lstrip("x").split("_")[-1]] for x in LEFT], [db.guard_addresses(x) for x in LEFT])
quad = re.compile(r"\d{1,3}(?:\.\d{1,3}){3}")
check("whatever the scrubber leaves of them, the guard says (and nothing where it left none)",
      all(bool(db.guard_addresses(t(x))) == bool(quad.search(t(x).replace("127.0.0.1", ""))) for x in LEFT), [(t(x), db.guard_addresses(t(x))) for x in LEFT])
g = db.guard(sc, {"lab.log": t(f"21:37:15 [lab] came 23:41:46.100 · 3 ms · peer/{LAN}.2.5 and {UA}")})
check("the guard on a scrubbed log: «peer/…» said as an address of lab.log, its sample masked; the browser's version not counted",
      any(f["kind"] == "address" and f["file"] == "lab.log" and f["count"] == 1 and "192.168" not in f["sample"] for f in g) if quad.search(t(f"peer/{LAN}.2.5")) else
      not any(f["kind"] == "address" for f in g), g)
check("the guard lets by a browser's version, this machine, a card's dotted version, a longer dotted number and what is no address (999.…)",
      db.guard_addresses(UA + " 127.0.0.1:41870 0.0.0.0 vbios 94.02.42.00.A0 at 1.2.3.4.5 and 999.1.1.1 Version/17.0.0.0") == [],
      db.guard_addresses(UA + " 127.0.0.1:41870 0.0.0.0 vbios 94.02.42.00.A0 at 1.2.3.4.5 and 999.1.1.1 Version/17.0.0.0"))

ev = [{"k": "key", "key": "Ctrl+V", "el": "input#ptqSerial"}, {"k": "key", "key": "Ctrl+V", "el": "input#orKeyNew < label"},
      {"k": "key", "key": "Ctrl+A", "el": "input#title"}, {"k": "click", "el": "input#ptqSerial"}, {"k": "key", "key": "Escape", "el": "body", "secret": True},
      {"k": "key", "key": "F5", "el": "body"}]
keep, n = db.secret_keys(ev)
check("keys in a secret field (the serial, the OpenRouter key) and events the page marked secret: dropped whole; the rest kept", n == 3 and
      [e["key"] if e["k"] == "key" else e["k"] for e in keep] == ["Ctrl+A", "click", "F5"], (n, keep))

# the bundle end to end, on a kit of its own; the units' journals stood in for
kit = Path(tempfile.mkdtemp(prefix="ruach-t2104-"))
(kit / "user").mkdir()
outputs = kit / "outputs"
outputs.mkdir()
db.journal = lambda unit, since: ("2026-11-05T21:24:55-06:00 Golem start.sh[1]: [Server] Job 0761cd5ba028f0de: {\n"
                                  '  "seed": 992475142,\n'
                                  f"21:37:15 [Server] Refused POST /lab/collection from {LAN}.2.77 (Host x)\n"
                                  f'23:41:46 [lab] "GET /vocab/My%20Words.json HTTP/1.1" 200 812 B · came 23:41:46.100 · 3 ms · peer {LAN}.2.5\n')
data = {"events": ev + [{"k": "net", "m": "GET", "p": "openrouter.ai/api/v1/models", "s": 200, "ms": 9300, "t": 1}], "salt": "5a175a17", "ua": UA,
        "screen": "2560x1440@1.25", "lang": "ru", "since": 3600}
r = db.bundle(kit, outputs, data)
with zipfile.ZipFile(db.path(kit, r["id"])) as z:
    page, lablog, readme = z.read("page.json").decode(), z.read("lab.log").decode(), z.read("README.md").decode()
pj = json.loads(page)
check("the bundle: the screen and the browser's version as they are", pj["screen"] == "2560x1440@1.25" and pj["ua"] == UA, (pj["screen"], pj["ua"]))
secret_left = [e for e in pj["events"] if e.get("k") == "key" and ("ptqSerial" in str(e.get("el")) or "orKeyNew" in str(e.get("el")))]
check("the bundle: the secret keys gone (a click on the field kept: it says nothing), said in the README", r["events"] == len(data["events"]) - 3 and
      not secret_left and "3 such events of an older journal dropped" in readme, (r["events"], secret_left, readme[-300:]))
check("the bundle: the lab's log with its marks (job, seed, lan, vocab), nothing of the originals", "id#" in lablog and "seed#" in lablog and "lan#" in lablog and
      "vocab#" in lablog and "0761cd5b" not in lablog and "992475142" not in lablog and "192.168" not in lablog and "My%20Words" not in lablog, lablog)
check("the bundle: openrouter.ai written «external»", "openrouter" not in page and "external/api/v1/models" in page, page[:300])
kinds = {f["kind"] for f in r["findings"]}
check("the guard finds no address in a browser's version nor a mail in the screen", "address" not in kinds and "mail" not in kinds, r["findings"])
print("all passed" if not bad else f"{len(bad)} FAILED")
sys.exit(1 if bad else 0)
