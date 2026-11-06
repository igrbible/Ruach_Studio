"""The Studio's visiting card (ruachstudio.art): template.html with the Studio's logo inline from src/brand (its
colours follow the page: the night's in the hero), written as index.html beside it, in English, and as <lang>/index.html
in the Studio's six other languages (Viktor, 06.10.2026: «Я бы уже весь сайт сделал на семи языках»). A static page:
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
# HERESY 2140 (Viktor 06.11.2026: «Меняй адрес в коде и готов замены в карточки репозиториев. Старый URL станет редиректом 301.»): the card at its own domain; the old address answers 301 to the same path
SITE = "https://ruachstudio.art"
SIMPLY = {"ru": "Просто", "uk": "Просто", "be": "Проста", "el": "Απλά", "es": "Simplemente", "it": "Semplicemente",
          "fr": "Tout simplement", "pt": "Simplesmente", "de": "Einfach", "ja": "とにかく", "zh": "简直", "he": "פשוט"}
LANGS = [("en", "English"), ("ru", "Русский"), ("uk", "Українська"), ("be", "Беларуская"), ("el", "Ελληνικά"),
         ("es", "Español"), ("it", "Italiano"), ("fr", "Français"), ("pt", "Português"), ("de", "Deutsch"), ("ja", "日本語"),
         ("zh", "中文"), ("he", "עברית")]   # HERESY 1383: the five the page speaks since 1379; 06.11.2026 Hebrew (Viktor: «Сам займись ивритом на сайте»)
# the languages written right to left: <html dir="rtl">, i18n/<lang>.css (its rules under [dir="rtl"]) and the numbers kept left to right
RTL = {"he"}
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
    alternates += '\n<meta property="og:url" content="%s%s">' % (SITE, "/" if code == "en" else "/%s/" % code)   # HERESY 2140: the link preview's own address
    page = (page.replace('<html lang="en">', '<html lang="%s"%s>' % (code, ' dir="rtl"' if code in RTL else ""))
            .replace("{{LANG}}", code.upper()).replace("{{LANGS}}", links).replace("{{ALTERNATES}}", alternates)
            .replace("{{FIRST_VISIT}}", FIRST_VISIT.replace("{{HAVE}}", json.dumps([c for c, _ in LANGS])) if code == "en" else ""))
    page = page.replace('content="assets/og.jpg"', 'content="%s/assets/og.jpg"' % SITE)
    # HERESY 1393 (Viktor 12.10.2026: «девиз OSEM как есть, но `Simply` можно на другие языки. И `AWESOME` всё заглавными»): the
    # slogan stays untranslated (translate="no"), its first word speaks the page's language
    if code in SIMPLY:
        page = page.replace('<span class="say">Simply AWESOME</span>', '<span class="say">%s AWESOME</span>' % SIMPLY[code], 1)
    # 06.11.2026: a language whose little story is not in the template brings it in i18n/<lang>.story.html, and only its own page
    # carries it, after the template's last story (the other pages stay as they were)
    story = here / "i18n" / (code + ".story.html")
    if code != "en" and story.is_file() and 'data-lang="%s"' % code not in page:
        end = page.find("\n    </div>\n  </section>", page.find('<section id="story">'))
        if page.find('<section id="story">') < 0 or end < 0:
            sys.exit("the little story's section has moved: %s's story has no place" % code)
        page = page[:end] + "\n" + story.read_text(encoding="utf-8").rstrip("\n") + page[end:]
    # HERESY 1392: the little story is shown in the page's own language by the page itself, not only by its script (a reader
    # without scripts and a search engine saw the English one on every page)
    if code != "en" and 'data-lang="%s" hidden>' % code in page:
        page = page.replace('data-lang="en">', 'data-lang="en" hidden>', 1).replace('data-lang="%s" hidden>' % code, 'data-lang="%s">' % code, 1)
    # Viktor 06.10.2026: «внешние ссылки сделай с таргетом _blank»: a link out of the site opens a new tab
    page = re.sub(r'<a (?![^>]*target=)([^>]*href="https?://)', r'<a target="_blank" rel="noopener" \1', page)
    if deep:
        page = re.sub(r'((?:src|href)=")assets/', r"\1../assets/", page)
    cjk = {"ja": "Noto Sans JP", "zh": "Noto Sans SC"}.get(code)   # HERESY 1383: a CJK face of the same family, after Noto Sans
    if cjk:
        page = page.replace("&family=Noto+Sans+Mono:", "&family=" + cjk.replace(" ", "+") + ":wght@400;500;700&family=Noto+Sans+Mono:", 1)
        page = page.replace("</head>", '<style>body, .langs summary { font-family: "Noto Sans", "%s", system-ui, sans-serif; }</style>\n</head>' % cjk, 1)
    # 06.11.2026: a language's own style (Hebrew: its self-hosted face and the right-to-left page) from i18n/<lang>.css, on its page only
    own_css = here / "i18n" / (code + ".css")
    if code != "en" and own_css.is_file():
        page = page.replace("</head>", "<style>\n%s\n</style>\n</head>" % own_css.read_text(encoding="utf-8").strip("\n"), 1)
    return page, missing


# the root page only: the browser's own language at the first visit; a language picked in the menu is kept ({{HAVE}}: those built)
FIRST_VISIT = """<script>
  // the browser's own language at the first visit; a language picked in the menu is kept (ruach.lang)
  (function () { try {
    var have = {{HAVE}}, kept = localStorage.getItem("ruach.lang");
    var want = have.indexOf(kept) >= 0 ? kept : (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || "en"])
      .map(function (l) { return String(l).toLowerCase().split("-")[0]; }).filter(function (l) { return have.indexOf(l) >= 0; })[0];
    if (want && want !== "en") location.replace("/" + want + "/" + location.search + location.hash);
  } catch (e) {} })();
</script>"""

# HERESY 1168 (Viktor 07.10.2026: «на русский переключил и увидел вручную перенесённые строки… Пройдись по всем языкам и
# исправь для правильного autowrap»): no line ends in a word of one or two letters (а, в, и, на; a, I; y, de; e, il; ο, το),
# the particles lean on the word before them (же, ли, бы), no line starts with a dash, a number keeps its unit and a model
# name its number (12 ГБ, RTX 3090): the spaces there are non-breaking, in the text between the tags only (not in
# scripts, styles, the logo, the title)
NB = " "
SKIP_TAGS = ("script", "style", "svg", "title", "code", "pre", "textarea")
POST = r"(?:же|ли|бы|ль|ж|б|жа|лі|би)"
def typeset(page, code):
    parts = re.split(r"(<!--.*?-->|<[^>]+>)", page, flags=re.S)
    depth = 0
    for i, p in enumerate(parts):
        if i % 2:
            m = re.match(r"<(/?)([a-zA-Z][\w-]*)", p)
            if m and m.group(2).lower() in SKIP_TAGS and not p.endswith("/>"):
                depth += -1 if m.group(1) else 1
            continue
        if depth > 0 or not p.strip():
            continue
        t = re.sub(r"[ \t\r\n]+(?=" + POST + r"(?!\w))", NB, p)
        t = re.sub(r"(?<![\w'’\-.&#;])(?!" + POST + r"(?!\w))(\w{1,2})[ \t\r\n]+(?=\S|$)", lambda m: m.group(1) + NB, t)
        t = re.sub(r"[ \t\r\n]+(?=[—–](?:\s|$))", NB, t)
        t = re.sub(r"(\d[\d.,:+%×]*)[ \t\r\n]+(?=\S)", lambda m: m.group(1) + NB, t)
        t = re.sub(r"(\b[A-ZА-ЯЁ][\w.+-]*)[ \t\r\n]+(?=\d)", lambda m: m.group(1) + NB, t)
        if code == "fr":                                # HERESY 1383: French keeps its space before : ; ! ? » and after «
            t = re.sub(r"[ \t\r\n]+(?=[:;!?»])", NB, re.sub(r"«[ \t\r\n]+", "«" + NB, t))
        parts[i] = t
    return "".join(parts)

# 06.11.2026 (Hebrew): in a right-to-left page a number led by a sign (−15.5, -18.1, ×0.75/0.75) or a size (1920×1080) is drawn
# by the bidi algorithm with its sign on the wrong side when Hebrew or nothing stands before it in its block («15.5−»); after a
# Latin word it is right already (RS-TW 2.0 ×0.9, Spotify −14), and an isolate there would move it. Such a number, and a number
# with a prime (22″), goes into <bdi dir="ltr">, in the text between the tags only; a Hebrew prefix's hyphen (ב-135) is not a sign.
# That hyphen keeps its word on its line: a word joiner after it (a line broke «ה-» from «GPU שלך» in the lead)
BLOCKS = {"p", "li", "td", "th", "div", "h1", "h2", "h3", "h4", "figcaption", "blockquote", "summary", "button", "section", "header",
          "footer", "nav", "main", "article", "figure", "ul", "ol", "table", "tr", "thead", "tbody", "details", "br", "body"}
SIGN = "\u2212+\u00b1\u00d7-"                              # − + ± × and the hyphen-minus
NUM = r"\d+(?:[.,]\d+)*"                                    # 32,633 and 0.75, not the comma after them
LTR_NUM = re.compile(r"(?:^|(?<=[\s(\[\u2060-]))[" + SIGN + "]" + NUM + r"(?:[/\u00d7][" + SIGN + "]?" + NUM + ")*"
                     "|" + NUM + "\u00d7" + NUM + "|" + NUM + "[\u2032\u2033]")
PREFIX = re.compile(r"(?<![\u05d0-\u05ea])([\u05d1\u05d4\u05d5\u05db\u05dc\u05de\u05e9]{1,3})-(?=\S|$)")   # ב ה ו כ ל מ ש, alone or joined
def bidi_of(text, was):
    """The last strong letter of text (entities left out): "R" for Hebrew, "L" for any other letter, else was."""
    for ch in re.sub(r"&#?\w+;", "", text):
        if "\u0590" <= ch <= "\u05ff" or "\ufb1d" <= ch <= "\ufb4f":
            was = "R"
        elif ch.isalpha():
            was = "L"
    return was
def isolate_numbers(page):
    parts = re.split(r"(<!--.*?-->|<[^>]+>)", page, flags=re.S)
    inside, last = [], None                                  # the skipped tags open; the last strong letter of the block
    for i, p in enumerate(parts):
        if i % 2:
            m = re.match(r"<(/?)([a-zA-Z][\w-]*)", p)
            if m:
                tag = m.group(2).lower()
                if tag in SKIP_TAGS and not p.endswith("/>"):
                    if m.group(1):
                        inside = inside[:-1]
                    else:
                        inside.append(tag)
                if tag in BLOCKS:
                    last = None
            continue
        if inside:                                           # code and pre are Latin text the reader sees; scripts and styles are not
            if inside[-1] in ("code", "pre"):
                last = bidi_of(p, last)
            continue
        p = PREFIX.sub("\\1-\u2060", p)
        out, at = [], 0
        for m in LTR_NUM.finditer(p):
            last = bidi_of(p[at:m.start()], last)
            out.append(p[at:m.start()])
            n = m.group(0)
            out.append(n if last == "L" and n[-1] not in "\u2032\u2033" else '<bdi dir="ltr">%s</bdi>' % n)
            at = m.end()
        out.append(p[at:])
        last = bidi_of(p[at:], last)
        parts[i] = "".join(out)
    return "".join(parts)

if __name__ == "__main__":
    svg = (here.parent / "src/brand/ruach-logo.svg").read_text(encoding="utf-8").strip()
    # HERESY 2026 (Viktor: «В шапке сайта… Давай туда наш логотип»): the bar's own copy, hidden from readers (the link says the name)
    bar = re.sub(r'role="img" aria-label="[^"]*"', 'aria-hidden="true"', svg.replace('class="ruach-logo"', 'class="ruach-logo bar-logo"', 1), count=1)
    template = (here / "template.html").read_text(encoding="utf-8").replace("{{LOGO_BAR}}", bar).replace("{{LOGO}}", svg)
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
        # HERESY 1266 (Viktor 09.10.2026: «Переделай лого для всех языков»): the logo in the page's language (src/brand/i18n), the
        # English one where none is
        own = here.parent / "src/brand/i18n" / ("ruach-logo-" + code + ".svg")
        if code != "en" and own.is_file():               # HERESY 2026: every logo of the page, the bar's too (its class and its hiding kept)
            mine, at = own.read_text(encoding="utf-8").strip(), 0
            while page.find('class="ruach-logo', at) >= 0:
                i = page.find('class="ruach-logo', at)
                a = page.rfind("<svg", 0, i)
                b = page.index("</svg>", a) + 6
                cls = re.search(r'class="(ruach-logo[^"]*)"', page[a:b]).group(1)
                new = re.sub(r'class="ruach-logo[^"]*"', 'class="%s"' % cls, mine, count=1)   # 06.11.2026: the Hebrew one's class has a second word
                if "bar-logo" in cls:
                    new = re.sub(r'role="img" aria-label="[^"]*"', 'aria-hidden="true"', new, count=1)
                page = page[:a] + new + page[b:]
                at = a + len(new)
        # HERESY 1272 (Viktor 09.10.2026: «На сайте обнови фавку»): the icons of the page's language, the name's first letter on the
        # logo's cloud: Р for the Cyrillic names and the Greek Ροῦαχ since 1454 (Π for ΠΝΕΥΜΑ before; src/brand: make_letter_icon.py)
        letter = {"ru": "er", "uk": "er", "be": "er", "el": "er", "ja": "ja", "zh": "zh", "he": "he"}.get(code)   # HERESY 1454: Ροῦαχ's Ρ, drawn as Р   # 1273: ル, 鲁 for the languages planned next
        if letter:
            page = re.sub(r"assets/ruach-icon-(32|180|192)\.png", lambda m: "assets/ruach-icon-" + letter + "-" + m.group(1) + ".png", page)
        page = typeset(page, code)
        if code in RTL:
            page = isolate_numbers(page)
        out = here / ("index.html" if code == "en" else code + "/index.html")
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(page, encoding="utf-8")
        print(out.relative_to(here), len(page) // 1024, "KB", ("· %d units still English" % len(missing)) if missing else "")
        for k in missing[:5]:
            print("   ", k[:100])
    # HERESY 2140: where the card lives, for search engines: sitemap.xml (every language's page with its alternates, and the
    # vocabulary's page) and robots.txt naming it; /debug/ is the debug-log receiver, no page
    pages = [(c, SITE + ("/" if c == "en" else "/%s/" % c)) for c, _ in built]
    alt = "".join('\n    <xhtml:link rel="alternate" hreflang="%s" href="%s"/>' % (c, u) for c, u in pages)
    alt += '\n    <xhtml:link rel="alternate" hreflang="x-default" href="%s/"/>' % SITE
    urls = ["  <url>\n    <loc>%s</loc>%s\n  </url>\n" % (u, alt) for c, u in pages]
    if (here / "vocabulary" / "index.html").is_file():
        urls.append("  <url>\n    <loc>%s/vocabulary/</loc>\n  </url>\n" % SITE)
    (here / "sitemap.xml").write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" '
                                      'xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' + "".join(urls) + "</urlset>\n", encoding="utf-8")
    (here / "robots.txt").write_text("User-agent: *\nDisallow: /debug/\n\nSitemap: %s/sitemap.xml\n" % SITE, encoding="utf-8")
    print("sitemap.xml", len(urls), "pages · robots.txt")
