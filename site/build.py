"""The studio's visiting card (ruachstudio.igr.bible): template.html with the studio's logo inline from src/brand (its
colours follow the page: the night's in the hero), written as index.html beside it, in English, and as <lang>/index.html
in the studio's six other languages (Viktor, 06.10.2026: «Я бы уже весь сайт сделал на семи языках»). A static page:
serve this folder.

A language's words are in i18n/<lang>.json: each English unit of the page and its translation. A unit is an element
whose content is inline only (text, b, i, em, code, a, span, br), keyed by that content with its whitespace collapsed,
or the value of an alt, title, aria-label or a meta's content. What says translate="no" stays as it is (the slogan, the
little story, which carries all seven itself). A unit missing from a catalog stays English, and the build says so.

    python3 site/build.py              the pages
    python3 site/build.py --units      the English units, as JSON (a catalog's keys)"""
import json, re, sys
from html.parser import HTMLParser
from pathlib import Path

here = Path(__file__).resolve().parent
SITE = "https://ruachstudio.igr.bible"
LANGS = [("en", "English"), ("ru", "Русский"), ("uk", "Українська"), ("be", "Беларуская"), ("el", "Ελληνικά"),
         ("es", "Español"), ("it", "Italiano")]
INLINE = {"b", "i", "em", "strong", "code", "a", "span", "br", "small", "sup", "sub", "kbd", "img"}
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}
RAW = {"script", "style", "svg"}
ATTRS = ("alt", "title", "aria-label")


def norm(s):
    return re.sub(r"\s+", " ", s).strip()


class Units(HTMLParser):
    """Where each unit stands in the page: (start, end, key) for an element's inline content, an attribute's value."""

    def __init__(self, text):
        super().__init__(convert_charrefs=False)
        self.text, self.lines, self.stack, self.units, self.raw, self.quiet = text, [0], [], [], 0, 0
        for line in text.split("\n"):
            self.lines.append(self.lines[-1] + len(line) + 1)
        self.feed(text)

    def at(self):
        line, col = self.getpos()
        return self.lines[line - 1] + col

    def attr_units(self, tag, attrs, start, raw):
        names = list(ATTRS) + (["content"] if tag == "meta" and dict(attrs).get("name", dict(attrs).get("property", "")) in
                               ("description", "og:title", "og:description", "twitter:title", "twitter:description") else [])
        for name in names:
            m = re.search(r'\s%s="([^"]*)"' % re.escape(name), raw)
            if m and re.search(r"[A-Za-z]", m.group(1)) and not self.quiet:
                self.units.append((start + m.start(1), start + m.end(1), m.group(1)))

    def handle_starttag(self, tag, attrs):
        start, raw = self.at(), self.get_starttag_text()
        if self.raw:
            if tag in RAW:
                self.raw += 1
            return
        self.attr_units(tag, attrs, start, raw)
        if tag in RAW:
            self.raw = 1
            return
        if tag in VOID:
            if self.stack:
                self.stack[-1]["kids"].append(tag)
            return
        quiet = dict(attrs).get("translate") == "no"
        if quiet:
            self.quiet += 1
        if self.stack:
            self.stack[-1]["kids"].append(tag)
        self.stack.append({"tag": tag, "inner": start + len(raw), "kids": [], "block": False, "quiet": quiet, "text": False})

    def handle_startendtag(self, tag, attrs):
        if not self.raw:
            self.attr_units(tag, attrs, self.at(), self.get_starttag_text())
            if self.stack:
                self.stack[-1]["kids"].append(tag)

    def handle_endtag(self, tag):
        if self.raw:
            if tag in RAW:
                self.raw -= 1
            return
        if tag in VOID or not self.stack:
            return
        while self.stack and self.stack[-1]["tag"] != tag:      # a tag left open: closed here
            self.stack.pop()
        if not self.stack:
            return
        el, end = self.stack.pop(), self.at()
        inline_only = all(k in INLINE for k in el["kids"]) and not el["block"]
        if self.stack:
            if not inline_only or el["tag"] not in INLINE:
                self.stack[-1]["block"] = self.stack[-1]["block"] or not inline_only or el["tag"] not in INLINE
        if el["quiet"]:
            self.quiet -= 1
        el["end"] = end
        el["inline_only"] = inline_only
        # a unit: inline only, with letters, its parent not inline only (the parent decides once it closes)
        if inline_only and not self.quiet and not el["quiet"]:
            inner = self.text[el["inner"]:end]
            if re.search(r"[A-Za-z]", re.sub(r"<[^>]+>", "", inner)):
                self.units.append((el["inner"], end, inner, el["tag"], len(self.stack)))

    def handle_data(self, data):
        pass


def units_of(text):
    found = [u[:3] for u in Units(text).units]     # (start, end, inner): an element's content or an attribute's value
    # keep the outermost of nested inline-only elements (a <p> holds a <b>: the <p> is the unit)
    found.sort(key=lambda u: (u[0], -(u[1] - u[0])))
    out, reach = [], -1
    for s, e, inner in found:
        if s >= reach:
            out.append((s, e, inner))
            reach = e
        elif e > reach:
            sys.exit(f"overlapping units at {s}")
    return out


def page_for(code, template, units, catalog):
    missing, parts, last = [], [], 0
    for s, e, inner in units:
        key = norm(inner)
        parts.append(template[last:s])
        if code == "en":
            parts.append(inner)
        elif key in catalog:
            parts.append(catalog[key])
        else:
            missing.append(key)
            parts.append(inner)
        last = e
    parts.append(template[last:])
    page = "".join(parts)
    # the guard (the units once stood on a template changed after they were found, and the page fell apart): before its
    # placeholders are filled, the English page is the template itself, byte for byte
    if code == "en" and page != template:
        sys.exit("the English page drifted from its template: nothing written")
    deep = code != "en"
    links = "".join('<a href="%s" lang="%s" hreflang="%s"%s>%s</a>' % ("/" if c == "en" else "/%s/" % c, c, c,
                    ' aria-current="page"' if c == code else "", name) for c, name in LANGS)
    alternates = "\n".join('<link rel="alternate" hreflang="%s" href="%s%s">' % (c, SITE, "/" if c == "en" else "/%s/" % c)
                           for c, _ in LANGS) + '\n<link rel="alternate" hreflang="x-default" href="%s/">' % SITE
    alternates += '\n<link rel="canonical" href="%s%s">' % (SITE, "/" if code == "en" else "/%s/" % code)
    page = (page.replace('<html lang="en">', '<html lang="%s">' % code)
            .replace("{{LANG}}", code.upper()).replace("{{LANGS}}", links).replace("{{ALTERNATES}}", alternates)
            .replace("{{FIRST_VISIT}}", FIRST_VISIT if code == "en" else ""))
    page = page.replace('content="assets/og.jpg"', 'content="%s/assets/og.jpg"' % SITE)
    if deep:
        page = re.sub(r'((?:src|href)=")assets/', r"\1../assets/", page)
    return page, missing


# the root page only: the browser's own language at the first visit; a language picked in the menu is kept
FIRST_VISIT = """<script>
  // the browser's own language at the first visit; a language picked in the menu is kept (ruach.lang)
  (function () { try {
    var have = ["en", "ru", "uk", "be", "el", "es", "it"], kept = localStorage.getItem("ruach.lang");
    var want = have.indexOf(kept) >= 0 ? kept : (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || "en"])
      .map(function (l) { return String(l).toLowerCase().split("-")[0]; }).filter(function (l) { return have.indexOf(l) >= 0; })[0];
    if (want && want !== "en") location.replace("/" + want + "/" + location.search + location.hash);
  } catch (e) {} })();
</script>"""

if __name__ == "__main__":
    svg = (here.parent / "src/brand/ruach-logo.svg").read_text(encoding="utf-8").strip()
    template = (here / "template.html").read_text(encoding="utf-8").replace("{{LOGO}}", svg)
    # a language is built once its catalog is here; the menu and the alternates name only the languages built
    built = [(c, n) for c, n in LANGS if c == "en" or (here / "i18n" / (c + ".json")).is_file()]
    LANGS[:] = built
    if len(built) == 1 and "--units" not in sys.argv:      # English alone: no menu to choose from
        template = re.sub(r"\s*<details class=\"langs\".*?</details>", "", template, count=1, flags=re.S)
    units = units_of(template)                            # the template final first: the units' places are its own
    if "--units" in sys.argv:
        seen, keys = set(), []
        for s, e, inner in units:
            k = norm(inner)
            if k not in seen:
                seen.add(k)
                keys.append(k)
        json.dump(keys, sys.stdout, ensure_ascii=False, indent=1)
        print()
        sys.exit(0)
    for code, _ in built:
        catalog = json.load(open(here / "i18n" / (code + ".json"), encoding="utf-8")) if code != "en" else {}
        page, missing = page_for(code, template, units, catalog)
        out = here / ("index.html" if code == "en" else code + "/index.html")
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(page, encoding="utf-8")
        print(out.relative_to(here), len(page) // 1024, "KB", ("· %d units still English" % len(missing)) if missing else "")
        for k in missing[:5]:
            print("   ", k[:100])
