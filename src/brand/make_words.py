"""The logo's words in each language of the page (HERESY 1148). Viktor, 03.10.2026: «Логотип предлагаю под каждый язык
адаптировать. В русском РУАХ СТУДИЯ, укр. РУАХ СТУДІЯ, греч. ΠΝΕΥΜΑ ΣΤΟΥΝΤΙΟ, и т.п. но никаких spirit». RUACH is
carried over, never translated as "spirit" (Greek takes the Scriptures' own ΠΝΕΥΜΑ, as he wrote it).

The woman and the cloud stay exactly where they are in each logo; only the left word, the block and the word in it
change. A word never grows wider than RUACH (the bar's breakpoints were measured on it): a wider one is set smaller.
The word in the block keeps STUDIO's size unless it would not fit, and is spaced out to fill it, as STUDIO is.
Fonts, turned into paths so the logo needs none: Montserrat for Latin and Cyrillic (as the English), Noto Sans for
Greek, Noto Sans CJK SC for Chinese (all SIL Open Font License).

    python3 make_words.py PAGE_JS            the page's data (build/tools/console/heresy-logo-words.js), from the bar's copy
    python3 make_words.py --svg              and a logo per language beside the English: i18n/ruach-logo-LANG.svg,
                                             i18n/ruach-logo-bar-LANG.svg
Needs fontTools."""
import json, re, sys
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.basePen import BasePen
from kern import kerner                          # HERESY 1162

HERE = Path(__file__).parent
MONT = ("/usr/share/fonts/opentype/Montserrat/Montserrat_VariableFont_wght.ttf", None)
NOTO_BLACK = ("/usr/share/fonts/truetype/noto/NotoSans-Black.ttf", None)
NOTO_REG = ("/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf", None)
CJK_BOLD = ("/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc", "Noto Sans CJK SC")
CJK_REG = ("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc", "Noto Sans CJK SC")

# code: (the left word, its font, its weight), (the word in the block, its font, its weight), the name for a screen reader
WORDS = {
    "ru": (("РУАХ", MONT, 900), ("СТУДИЯ", MONT, 460), "Руах Студия"),
    "uk": (("РУАХ", MONT, 900), ("СТУДІЯ", MONT, 460), "Руах Студія"),
    "be": (("РУАХ", MONT, 900), ("СТУДЫЯ", MONT, 460), "Руах Студыя"),
    "el": (("ΠΝΕΥΜΑ", NOTO_BLACK, None), ("ΣΤΟΥΝΤΙΟ", NOTO_REG, None), "Πνεύμα Στούντιο"),
    "zh": (("鲁阿赫", CJK_BOLD, None), ("工作室", CJK_REG, None), "鲁阿赫工作室"),
    "es": (("RUAJ", MONT, 900), ("ESTUDIO", MONT, 460), "Ruaj Estudio"),
    "it": (("RUACH", MONT, 900), ("STUDIO", MONT, 460), "Ruach Studio"),
}

# HERESY 1164 (Viktor 03.10.2026, after 1162: «Между У и А ещё 20–25% убери воздуха. В общий кернинг в РУАХ добавь 5%»):
# РУАХ (ru, uk, be) gets 5 % of its em more between every two letters, and the air between У and А, measured on the
# letters themselves (the mean ink-to-ink distance across the rows both fill, at 1162's spacing), 22.5 % less than it was,
# the added 5 % included. The other words keep their fonts' spacing («Для других сойдёт»).
TUNE = {"РУАХ": {"track_em": 0.05, "air": {("У", "А"): 0.775}}}


class _Flat(BasePen):
    """A glyph's outline as straight segments (curves cut in 16), for measuring the air between two letters."""
    def __init__(self, gs):
        super().__init__(gs); self.segs, self.cur, self.start = [], None, None
    def _moveTo(self, p): self.cur = self.start = p
    def _lineTo(self, p): self.segs.append((self.cur, p)); self.cur = p
    def _curveToOne(self, p1, p2, p3):
        p0 = self.cur
        for i in range(1, 17):
            t = i / 16; u = 1 - t
            q = (u**3*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t**3*p3[0], u**3*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t**3*p3[1])
            self.segs.append((self.cur, q)); self.cur = q
    def _qCurveToOne(self, p1, p2):
        p0 = self.cur
        for i in range(1, 17):
            t = i / 16; u = 1 - t
            q = (u*u*p0[0] + 2*u*t*p1[0] + t*t*p2[0], u*u*p0[1] + 2*u*t*p1[1] + t*t*p2[1])
            self.segs.append((self.cur, q)); self.cur = q
    def _closePath(self):
        if self.cur is not None and self.cur != self.start:
            self.segs.append((self.cur, self.start))
        self.cur = None


def _edges(segs, y):
    xs = sorted(x0 + (y - y0) * (x1 - x0) / (y1 - y0) for (x0, y0), (x1, y1) in segs if (y0 <= y < y1) or (y1 <= y < y0))
    return (xs[0], xs[-1]) if xs else None


def air(gs, left, right, distance, top):
    """The mean distance from the left letter's ink to the right one's across the rows both fill, the right one
    `distance` font units after the left one's origin."""
    a, b = _Flat(gs), _Flat(gs)
    gs[left].draw(a); gs[right].draw(b)
    gaps = []
    for y in range(0, int(top) + 1, 5):
        l, r = _edges(a.segs, y + 0.5), _edges(b.segs, y + 0.5)
        if l and r:
            gaps.append(distance + r[0] - l[1])
    return sum(gaps) / len(gaps) if gaps else 0.0


_fonts = {}
def font(spec):
    path, family = spec
    if spec not in _fonts:
        if path.endswith(".ttc"):
            from fontTools.ttLib import TTCollection
            col = TTCollection(path)
            pick = next(f for f in col.fonts if f["name"].getDebugName(1) == family)
            _fonts[spec] = pick
        else:
            _fonts[spec] = TTFont(path)
    return _fonts[spec]


def word(text, spec, wght, cap, tracking=0.0):
    """The word as one path at baseline 0, its capitals `cap` high (an ideograph: its ink that high);
    (d, lsb, right, mid): mid is where its middle falls (y down): the capitals' middle, or the ideographs' ink."""
    f = font(spec)
    gs = f.getGlyphSet(location={"wght": wght}) if wght else f.getGlyphSet()
    cmap = f.getBestCmap()
    ideo = any(ord(ch) > 0x2E80 for ch in text)
    if ideo:                                                # CJK: the ideographs' own ink is the measure
        lo, hi = 0, 0
        for ch in text:
            bp = BoundsPen(gs); gs[cmap[ord(ch)]].draw(bp)
            if bp.bounds:
                lo, hi = min(lo, bp.bounds[1]), max(hi, bp.bounds[3])
        capH = (hi - lo) / 1.08                             # their ink a little above the capitals: they are lighter
    else:
        capH = f["OS/2"].sCapHeight or 700
    k = cap / capH
    mid = -(hi + lo) / 2 * k if ideo else -cap / 2
    pen = SVGPathPen(gs, ntos=lambda v: ("%.2f" % v).rstrip("0").rstrip("."))
    kern = kerner(f, wght, key=spec)             # HERESY 1162: each pair as its font has it, in every language
    tune = TUNE.get(text, {})                    # HERESY 1164: a word set by Viktor's eye
    upm = f["head"].unitsPerEm
    extra = tune.get("track_em", 0.0) * upm      # font units between every two letters
    x, last, prev, prev_ch = 0.0, 0.0, None, None
    for i, ch in enumerate(text):
        name = cmap[ord(ch)]
        if prev:
            adj = kern(prev, name) + extra
            factor = tune.get("air", {}).get((prev_ch, ch))
            if factor is not None:              # this pair's air: a share of what it was at the font's own spacing
                base = gs[prev].width + kern(prev, name) + tracking * capH
                now = air(gs, prev, name, base, capH)
                adj += (factor - 1.0) * now - extra
            x += adj * k
        prev, prev_ch = name, ch
        g = gs[name]
        g.draw(TransformPen(pen, (k, 0, 0, -k, x, 0)))
        bp = BoundsPen(gs); g.draw(bp)
        last = x + (bp.bounds[2] * k if bp.bounds else g.width * k)
        x += g.width * k + (tracking * cap if i < len(text) - 1 else 0)
    bp = BoundsPen(gs); gs[cmap[ord(text[0])]].draw(bp)
    lsb = bp.bounds[0] * k if bp.bounds else 0.0
    return pen.getCommands(), lsb, last, mid


def geometry(svg):
    """What the English logo fixes: the frame's top and height, the block, the words' cap height and the gap to her."""
    g = dict((k, float(v)) for k, v in re.findall(r"(\w+)=([-\d.]+)", re.search(r"<!-- geometry: (.*?) -->", svg).group(1)))
    vx, vy, vw, vh = map(float, re.search(r'viewBox="([^"]+)"', svg).group(1).split())
    box = dict((k, float(v)) for k, v in re.findall(r'\b(x|y|width|height|rx)="([-\d.]+)"', re.search(r'<rect class="rl-box"[^>]*>', svg).group(0)))
    left_end = g["cx"] - g["fw"] / 2 - (box["x"] - (g["cx"] + g["fw"] / 2))   # her left side minus the same gap
    return dict(g, vy=vy, vh=vh, box=box, left_end=left_end, W=box["width"])


def words_for(code, geo):
    (lt, lspec, lw), (rt, rspec, rw), name = WORDS[code]
    CAP = 100.0
    d, lsb, right, lmid = word(lt, lspec, lw, CAP, tracking=0.02)
    width = right - lsb
    if width > geo["W"]:                                      # never wider than RUACH: set it smaller
        CAP *= geo["W"] / width
        d, lsb, right, lmid = word(lt, lspec, lw, CAP, tracking=0.02)
        width = right - lsb
    box = geo["box"]
    pad = box["height"] * 0.42
    inner = width - 2 * pad
    s_cap = 100.0 * 0.56
    sd0, slsb0, sr0, _ = word(rt, rspec, rw, s_cap)
    if sr0 - slsb0 > inner * 0.94:                            # too wide for its block: smaller, still spaced a little
        s_cap *= inner * 0.94 / (sr0 - slsb0)
        sd0, slsb0, sr0, _ = word(rt, rspec, rw, s_cap)
    gaps = max(1, len(rt) - 1)
    track = (inner - (sr0 - slsb0)) / gaps / s_cap
    sd, slsb, sr, smid = word(rt, rspec, rw, s_cap, tracking=track)
    x0 = geo["left_end"] - width                              # the word ends where RUACH ends: the same gap to her
    total_left = x0 - 2
    total_w = (box["x"] + width) - x0 + 4
    return {
        "name": name,
        "viewBox": f"{total_left:.1f} {geo['vy']:.1f} {total_w:.1f} {geo['vh']:.1f}",
        "word": {"d": d, "transform": f"translate({x0 - lsb:.2f} {-50.0 - lmid:.2f})"},        # its middle on RUACH's
        "box": {"x": f"{box['x']:.2f}", "width": f"{width:.2f}"},
        "studio": {"d": sd, "transform": f"translate({box['x'] + pad - slsb:.2f} {box['y'] + box['height'] / 2 - smid:.2f})"},
    }


def patched(svg, w):
    """The English logo with this language's words."""
    s = re.sub(r'viewBox="[^"]+"', f'viewBox="{w["viewBox"]}"', svg, count=1)
    s = re.sub(r'(<g class="rl-word"[^>]*>\s*<path) transform="[^"]+" d="[^"]+"', lambda m: f'{m.group(1)} transform="{w["word"]["transform"]}" d="{w["word"]["d"]}"', s, count=1)
    s = re.sub(r'(<rect class="rl-box"[^>]*?) x="[^"]+"', lambda m: f'{m.group(1)} x="{w["box"]["x"]}"', s, count=1)
    s = re.sub(r'(<rect class="rl-box"[^>]*?) width="[^"]+"', lambda m: f'{m.group(1)} width="{w["box"]["width"]}"', s, count=1)
    s = re.sub(r'(<g class="rl-studio"[^>]*>\s*<path) transform="[^"]+" d="[^"]+"', lambda m: f'{m.group(1)} transform="{w["studio"]["transform"]}" d="{w["studio"]["d"]}"', s, count=1)
    return s.replace('aria-label="Ruach Studio"', f'aria-label="{w["name"]}"', 1)


if __name__ == "__main__":
    bar = (HERE / "ruach-logo-bar.svg").read_text()
    if "--svg" in sys.argv:
        out = HERE / "i18n"
        out.mkdir(exist_ok=True)
        for src in ("ruach-logo.svg", "ruach-logo-bar.svg"):
            svg = (HERE / src).read_text()
            geo = geometry(svg)
            for code in WORDS:
                p = out / src.replace(".svg", f"-{code}.svg")
                p.write_text(patched(svg, words_for(code, geo)))
                print(p.relative_to(HERE))
    else:
        geo = geometry(bar)
        data = {code: words_for(code, geo) for code in WORDS}
        js = ("// HERESY 1148: the bar logo's words in each language of the page, made by src/brand/make_words.py from\n"
              "// src/brand/ruach-logo-bar.svg (do not edit: make them again). heresy-i18n.js sets them on the logo.\n"
              "window.RUACH_LOGO_WORDS = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n")
        Path(sys.argv[1]).write_text(js)
        for code, w in data.items():
            print(code, w["name"], "viewBox", w["viewBox"], "box", w["box"]["width"])
