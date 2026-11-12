#!/usr/bin/env python3
"""HERESY 2355 (Viktor 09.11.2026: «Творец» → «Музыкант», the English Reader → Narrator; «меняем только то, что видит человек»):
the guard that the rooms' old names never come back where a person reads them.

    python3 heresy/tools/check-room-names.py [TREE]      TREE: the Studio's root (default) or a release tree; exit 1 on any old name

What it reads, each in what a person sees and nothing else (comments, code, ids, settings keys, file names and logs keep the old words):
  ① the page (build/tools/console): the string literals of every script, the text and attributes of index.html;
  ② the thirteen catalogs: no English key with «Creator» or «Reader», no value with the language's old word for the Creator
     (Творец, Творець, Творца, Δημιουργός, Creador, Creatore, Créateur, Criador, Schöpfer, クリエイター, 创作室);
  ③ the Refiner's steps (lab/builtin_steps/*/plugin.json): label, say, tip;
  ④ the guides (docs/GUIDE*.md, ARTIST*.md) in every language;
  ⑤ the visiting card (heresy/root/site: template.html, i18n/*.json), where the tree has it.
The one name kept: the built-in profile «Musical Heresy of Creator's Ear». Run on the night of its making: 0 old names.
"""
import json, os, re, sys

ROOT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
KEEP = ("Creator's Ear", "Creator’s Ear")
EN = re.compile(r"\b(Creator|Reader)\b")
OLD = {
    "ru": r"\bТвор(?:ец|ца|це|цу|цом)\b", "uk": r"\bТвор(?:ець|ця|ці|цю|цем)\b", "be": r"\bТворц(?:а|у|ам|ы)\b",
    "el": r"\bΔημιουργ(?:ός|ού|ό|έ)\b", "es": r"\bCreador\b", "it": r"\bCreatore\b", "fr": r"\bCréateur\b", "pt": r"\bCriador\b",
    "de": r"\bSchöpfers?\b", "ja": r"クリエイター", "zh": r"创作室", "he": r"(?<![֐-׿])היוצר(?![֐-׿])",
}
bad = []


def en_old(text):
    for k in KEEP:
        text = text.replace(k, "")
    return [m.group(0) for m in EN.finditer(text)]


def say(where, what, text):
    bad.append("%s: %s  …%s…" % (where, what, text.strip()[:110]))


# ---- JS: string literals only (comments, regexes and code are not what a person reads)
REGEX_AFTER = set("(,=:[!&|?{};+-*%<>~^")
KEYWORDS = {"return", "typeof", "case", "in", "of", "new", "delete", "void", "throw", "else", "do", "yield", "await", "instanceof"}
WORD = re.compile(r"[A-Za-z_$][\w$]*")


def js_strings(src, start=0, end=None):
    end = len(src) if end is None else end
    i, last = start, ""
    while i < end:
        c = src[i]
        if c in " \t\r\n":
            i += 1
        elif src.startswith("//", i):
            j = src.find("\n", i); i = end if j < 0 or j > end else j
        elif src.startswith("/*", i):
            j = src.find("*/", i + 2); i = end if j < 0 else j + 2
        elif c in "'\"`":
            j = i + 1
            while j < end and src[j] != c:
                if src[j] == "\\":
                    j += 1
                elif c != "`" and src[j] == "\n":
                    break
                j += 1
            yield i, src[i:j + 1]
            i = j + 1; last = "s"
        elif c == "/" and (last == "" or last in REGEX_AFTER or last in KEYWORDS):
            j, cls = i + 1, False
            while j < end and src[j] != "\n":
                if src[j] == "\\":
                    j += 2; continue
                if src[j] == "[":
                    cls = True
                elif src[j] == "]":
                    cls = False
                elif src[j] == "/" and not cls:
                    break
                j += 1
            i = j + 1; last = "r"
        else:
            m = WORD.match(src, i)
            if m:
                last = m.group(0); i = m.end()
            else:
                last = c; i += 1


def line_of(src, pos):
    return src.count("\n", 0, pos) + 1


def check_js(path, rel):
    src = open(path, encoding="utf-8").read()
    for pos, s in js_strings(src):
        for w in en_old(s):
            say("%s:%d" % (rel, line_of(src, pos)), w, s)


def check_html(path, rel):
    src = open(path, encoding="utf-8").read()
    pos, parts = 0, []
    for m in re.finditer(r"<!--.*?-->|<style\b.*?</style>|<script\b[^>]*>(.*?)</script>", src, re.S):
        parts.append((pos, src[pos:m.start()]))
        if m.group(1) is not None:
            for p, s in js_strings(src, m.start(1), m.end(1)):
                parts.append((p, s))
        pos = m.end()
    parts.append((pos, src[pos:]))
    for p, text in parts:
        for m in EN.finditer(text):
            if any(text[max(0, m.start() - 20):m.end() + 10].find(k) >= 0 for k in KEEP):
                continue
            say("%s:%d" % (rel, line_of(src, p + m.start())), m.group(0), text[max(0, m.start() - 50):m.end() + 50])


KV = re.compile(r'^\s*("(?:[^"\\]|\\.)*")\s*:\s*("(?:[^"\\]|\\.)*")')


def check_catalog(path, rel, lang):
    for n, ln in enumerate(open(path, encoding="utf-8"), 1):
        m = KV.match(ln)
        if not m:
            continue
        k, v = json.loads(m.group(1)), json.loads(m.group(2))
        for w in en_old(k):
            say("%s:%d" % (rel, n), "key " + w, k)
        if lang in OLD and not (lang == "el" and k == "Author") and re.search(OLD[lang], v):
            say("%s:%d" % (rel, n), "value", v)


def check_doc(path, rel, lang):
    for n, ln in enumerate(open(path, encoding="utf-8"), 1):
        for w in en_old(ln):
            say("%s:%d" % (rel, n), w, ln)
        if lang in OLD and re.search(OLD[lang], ln):
            say("%s:%d" % (rel, n), "old word", ln)


def main():
    page = os.path.join(ROOT, "build", "tools", "console")
    if not os.path.isdir(page):
        print("no page in %s (build/tools/console)" % ROOT); return 2
    n = 0
    for f in sorted(os.listdir(page)):
        p, rel = os.path.join(page, f), "build/tools/console/" + f
        m = re.match(r"heresy-i18n-([a-z]{2})\.js$", f)
        if m:
            check_catalog(p, rel, m.group(1)); n += 1
        elif f.endswith(".js"):
            check_js(p, rel); n += 1
        elif f == "index.html":
            check_html(p, rel); n += 1
    steps = os.path.join(ROOT, "lab", "builtin_steps")
    for d in sorted(os.listdir(steps)) if os.path.isdir(steps) else []:
        p = os.path.join(steps, d, "plugin.json")
        if os.path.isfile(p):
            n += 1
            for i, st in enumerate(json.load(open(p, encoding="utf-8")).get("steps", []) + json.load(open(p, encoding="utf-8")).get("pipelines", [])):
                for key in ("label", "say", "tip"):
                    for w in en_old(str(st.get(key) or "")):
                        say("lab/builtin_steps/%s/plugin.json #%d %s" % (d, i, key), w, st[key])
    docs = os.path.join(ROOT, "docs")
    for f in sorted(os.listdir(docs)) if os.path.isdir(docs) else []:
        m = re.match(r"(GUIDE|GUIDE-READER|ARTIST)(?:\.([a-z]{2}))?\.md$", f)
        if m:
            check_doc(os.path.join(docs, f), "docs/" + f, m.group(2) or "en"); n += 1
    site = os.path.join(ROOT, "heresy", "root", "site")
    if os.path.isdir(site):
        check_html(os.path.join(site, "template.html"), "site/template.html"); n += 1
        for f in sorted(os.listdir(os.path.join(site, "i18n"))):
            if f.endswith(".json"):
                check_catalog(os.path.join(site, "i18n", f), "site/i18n/" + f, f[:-5]); n += 1
    if bad:
        print("\033[1;31m⛔ the rooms' old names where a person reads them (%d):\033[0m" % len(bad))
        for b in bad[:60]:
            print("  " + b)
        return 1
    print("\033[1;32m✓ room names: %d files, no «Creator»/«Reader» and no old word in what a person reads\033[0m" % n)
    return 0


if __name__ == "__main__":
    sys.exit(main())
