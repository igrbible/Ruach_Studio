"""Ruach Studio's logo, from Viktor's draft (02.10.2026): RUACH · the winged woman · [STUDIO]. The woman traced from his
drawing, in rich gold with an edge that holds on light and dark; the words in Montserrat (SIL OFL, the free twin of
the draft's Gilroy) turned into paths, so the logo needs no font; RUACH and the STUDIO block of one width, the woman in
the dead centre; colours from the theme in force (CSS variables, with fallbacks); alive: wind in her hair and wings,
light sliding over the gold, still for those who ask for less motion."""
import re
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen
from kern import kerner                          # HERESY 1162: the font's own kerning

HERE = Path(__file__).parent
FONT = "/usr/share/fonts/opentype/Montserrat/Montserrat_VariableFont_wght.ttf"


def word(text, wght, cap, tracking=0.0):
    """The word as one path, its baseline at y=0, cap height `cap`; returns (d, width)."""
    f = TTFont(FONT)
    gs = f.getGlyphSet(location={"wght": wght})
    cmap, upm = f.getBestCmap(), f["head"].unitsPerEm
    capH = f["OS/2"].sCapHeight or 700
    k = cap / capH
    pen = SVGPathPen(gs, ntos=lambda v: ("%.2f" % v).rstrip("0").rstrip("."))
    kern = kerner(f, wght, key=FONT)             # HERESY 1162 (Viktor: «кернинг нулевой между У и А»): each pair as the font has it
    x, last, prev = 0.0, 0.0, None
    for i, ch in enumerate(text):
        name = cmap[ord(ch)]
        if prev:
            x += kern(prev, name) * k
        prev = name
        g = gs[name]
        g.draw(TransformPen(pen, (k, 0, 0, -k, x, 0)))
        bp = BoundsPen(gs); g.draw(bp)
        last = x + (bp.bounds[2] * k if bp.bounds else g.width * k)
        x += g.width * k + (tracking * cap if i < len(text) - 1 else 0)
    first_lsb = 0.0
    bp = BoundsPen(gs); gs[cmap[ord(text[0])]].draw(bp)
    if bp.bounds:
        first_lsb = bp.bounds[0] * k
    return pen.getCommands(), first_lsb, last


# ---- the woman, traced (vtracer, binary); her drawing's own box cropped to the ink
svg = (HERE / "figure-traced.svg").read_text()
ink = []
for tag in re.findall(r"<path\b[^>]*>", svg):                # each path's own attributes, in whatever order
    d = re.search(r'\bd="([^"]+)"', tag); fill = re.search(r'fill="(#[0-9A-Fa-f]{6})"', tag)
    t = re.search(r'translate\(([-\d.]+)[ ,]+([-\d.]+)\)', tag)
    if d and fill and fill.group(1).lower() in ("#000000", "#010101", "#020202"):
        ink.append((d.group(1), float(t.group(1)) if t else 0.0, float(t.group(2)) if t else 0.0))
FIG_BOX = (94, 168, 881, 1199)          # x, y, w, h of the ink in the 1086 x 1448 drawing (convert -trim)

CAP = 100.0                               # RUACH's cap height: the unit everything is measured in
r_d, r_lsb, r_right = word("RUACH", 900, CAP, tracking=0.02)     # Black, as in his draft
W = r_right - r_lsb                       # RUACH's own width, ink to ink
s_cap = CAP * 0.56                        # STUDIO, light, inside its block
box_h = CAP * 1.12
pad = box_h * 0.42                        # the block's side padding
s_d0, s_lsb0, s_right0 = word("STUDIO", 460, s_cap, tracking=0.0)   # a touch heavier than Light
inner = W - 2 * pad
gaps = 5
track = (inner - (s_right0 - s_lsb0)) / gaps / s_cap      # letter-spacing that makes STUDIO fill its block
s_d, s_lsb, s_right = word("STUDIO", 460, s_cap, tracking=track)

import sys
# v2 (Viktor, 02.10.2026): «золото Девы не пляшет в общий сюжет… облачный бекграунд под ней, частично захватывающий
# тексты справа и слева, а её саму — практически в белом»; «Дева очень мелкая»; RUACH Black, STUDIO чуть жирнее.
# The woman in white rises out of a cloud in the theme's accent; the cloud reaches over the words' inner ends.
# She is the words' height and half again: the words take ~52 % of her, she stands ~24 % above and below them.
OUT = sys.argv[1] if len(sys.argv) > 1 else "ruach-logo.svg"
COLORS = {}                                  # resolved colours for an Inkscape copy: name=#hex pairs after the file name
for kv in sys.argv[2:]:
    k, v = kv.split("="); COLORS[k] = v
def c(name, fallback):
    return COLORS.get(name) or f"var(--logo-{name}, {fallback})"

import os
fig_h = CAP * float(os.environ.get("FIG", "2.15"))   # her height in RUACH's cap heights: 2.15 for the logo
                                                     # itself; the bar's copy 3.0, where small words must not drown her
fig_w = fig_h * FIG_BOX[2] / FIG_BOX[3]
gap = CAP * 0.16
total_w = W + gap + fig_w + gap + W
mid_y = -CAP / 2                             # the words' middle
import os
WAIST = float(os.environ.get("WAIST", "0.52"))   # where the words' middle meets her: 0.52 her waist (his draft);
top = mid_y - fig_h * WAIST                  # the bar's copy 0.40, at her breast: in a browser tab she cannot rise above
                                             # the window, so she descends below the bar instead
x_fig = W + gap
cx = x_fig + fig_w / 2
x_box = x_fig + fig_w + gap
box_y = -CAP - (box_h - CAP) / 2
fw, fh = fig_w, fig_h
# the cloud: soft puffs, then broken into billows by turbulence. (cx, cy, rx, ry, strength)
REACH = float(os.environ.get("REACH", "1"))   # how far the cloud reaches into the words (the bar's copy: less, its letters are small)
EDGE = os.environ.get("EDGE", ".45")          # her contour's strength (the bar's copy: none, a hairline at that size turns her pink)
PUFFS = [
    (cx, top + fh * 0.52, fw * 0.78, fh * 0.42, 0.92),             # behind her whole body: it gives the filigree mass
    (cx - fw * 0.28, top + fh * 0.27, fw * 0.44, fh * 0.20, 0.78), # behind the wings, so their white holds by day
    (cx + fw * 0.28, top + fh * 0.27, fw * 0.44, fh * 0.20, 0.78),
    (cx, top + fh * 0.80, fw * 1.00, fh * 0.15, 0.85),             # the bank she rises from
    (cx - fw * 0.66 * REACH, mid_y + 4, fw * 0.58 * REACH, fh * 0.27, 0.72),       # over RUACH's last letters
    (cx + fw * 0.66 * REACH, mid_y + 4, fw * 0.58 * REACH, fh * 0.27, 0.72),       # over STUDIO's first
    (cx - fw * 1.10 * REACH, mid_y + 16, fw * 0.44 * REACH, fh * 0.14, 0.40),      # wisps further out
    (cx + fw * 1.10 * REACH, mid_y + 16, fw * 0.44 * REACH, fh * 0.14, 0.40),
]
M = CAP * 0.12                               # room for the cloud to fade before the edge
vb_x, vb_y, vb_w, vb_h = -2, top - M, total_w + 4, fig_h + 2 * M
out = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb_x:.1f} {vb_y:.1f} {vb_w:.1f} {vb_h:.1f}" class="ruach-logo" role="img" aria-label="Ruach Studio">
  <defs>
    <radialGradient id="rlPuff">
      <stop offset="0" stop-color="{c('cloud', 'color-mix(in oklab, var(--amber, #8e1a2e) 96%, #fff)')}" stop-opacity="1"/>
      <stop offset="0.5" stop-color="{c('cloud', 'color-mix(in oklab, var(--amber, #8e1a2e) 96%, #fff)')}" stop-opacity="0.7"/>
      <stop offset="1" stop-color="{c('cloud', 'color-mix(in oklab, var(--amber, #8e1a2e) 96%, #fff)')}" stop-opacity="0"/>
    </radialGradient>
    <!-- the cloud: puffs broken into billows; it drifts. HERESY 1162: 40 % lighter than it was (Viktor: «Тень под Девой… очень
         агрессивная»): the accent with a breath of white, not with a quarter of black -->
    <filter id="rlCloud" x="-20%" y="-20%" width="140%" height="140%">
      <feTurbulence type="fractalNoise" baseFrequency="0.011 0.017" numOctaves="3" seed="11" result="n">
        <animate attributeName="baseFrequency" values="0.011 0.017; 0.014 0.020; 0.011 0.017" dur="17s" repeatCount="indefinite"/>
      </feTurbulence>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="44" xChannelSelector="R" yChannelSelector="G" result="b"/>
      <feGaussianBlur in="b" stdDeviation="2.2"/>
    </filter>
    <!-- her white: pearl, the light sliding over it -->
    <linearGradient id="rlPearl" x1="0" y1="0" x2="1" y2="1" gradientUnits="objectBoundingBox">
      <stop offset="0" stop-color="{c('fig', '#ffffff')}"/><stop offset="0.42" stop-color="{c('fig-shade', '#f1ebe3')}"/>
      <stop offset="0.52" stop-color="{c('fig', '#ffffff')}"/><stop offset="0.62" stop-color="{c('fig-shade', '#f1ebe3')}"/><stop offset="1" stop-color="{c('fig', '#ffffff')}"/>
      <animateTransform attributeName="gradientTransform" type="translate" values="-0.4 -0.4; 0.4 0.4; -0.4 -0.4" dur="9s" repeatCount="indefinite"/>
    </linearGradient>
    <!-- the wind in her hair, wings and hem; and the light she gives off -->
    <filter id="rlWind" x="-15%" y="-15%" width="130%" height="130%">
      <feTurbulence type="fractalNoise" baseFrequency="0.006 0.016" numOctaves="2" seed="7" result="n">
        <animate attributeName="baseFrequency" values="0.006 0.016; 0.008 0.02; 0.006 0.016" dur="11s" repeatCount="indefinite"/>
      </feTurbulence>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="11" xChannelSelector="R" yChannelSelector="G" result="w"/>
      <feMorphology in="w" operator="dilate" radius="6" result="fat"/>
      <feGaussianBlur in="fat" stdDeviation="16" result="soft"/>
      <feFlood flood-color="{c('glow', '#ffffff')}" flood-opacity="0.75"/>
      <feComposite in2="soft" operator="in" result="halo"/>
      <feMerge><feMergeNode in="halo"/><feMergeNode in="w"/></feMerge>
    </filter>
  </defs>
  <g class="rl-word" fill="{c('word', 'var(--amber, #8e1a2e)')}">
    <path transform="translate({-r_lsb:.2f} 0)" d="{r_d}"/>
  </g>
  <rect class="rl-box" x="{x_box:.2f}" y="{box_y:.2f}" width="{W:.2f}" height="{box_h:.2f}" rx="{box_h * 0.12:.2f}" fill="{c('word', 'var(--amber, #8e1a2e)')}"/>
  <g class="rl-studio" fill="{c('on', 'var(--on-amber, #ffffff)')}">
    <path transform="translate({x_box + pad - s_lsb:.2f} {box_y + (box_h + s_cap) / 2:.2f})" d="{s_d}"/>
  </g>
  <g class="rl-cloud" filter="url(#rlCloud)" opacity="{os.environ.get('CLOUD', '0.45')}">
    <animateTransform attributeName="transform" type="translate" values="0 0; 3 -2; -2 1; 0 0" dur="23s" repeatCount="indefinite"/>
"""
for (px, py, rx, ry, a) in PUFFS:
    out += f'    <ellipse cx="{px:.1f}" cy="{py:.1f}" rx="{rx:.1f}" ry="{ry:.1f}" fill="url(#rlPuff)" opacity="{a}"/>\n'
out += f"""  </g>
  <g class="rl-fig" transform="translate({x_fig:.2f} {top:.2f}) scale({fig_w / FIG_BOX[2]:.5f}) translate({-FIG_BOX[0]} {-FIG_BOX[1]})">
    <g filter="url(#rlWind)" fill="url(#rlPearl)" stroke="{c('edge', 'var(--amber, #8e1a2e)')}" stroke-width="0.8" stroke-opacity="{EDGE}" vector-effect="non-scaling-stroke" paint-order="stroke">
"""
for d, tx, ty in ink:
    out += f'      <path transform="translate({tx} {ty})" d="{d}" vector-effect="non-scaling-stroke"/>\n'
out += """    </g>
  </g>
</svg>
"""
out = out.replace("<defs>", f"<!-- geometry: cx={cx:.2f} top={top:.2f} fw={fw:.2f} fh={fh:.2f} -->\n  <defs>", 1)
(HERE / OUT).write_text(out)
print(f"{OUT}: RUACH {W:.1f}; the woman {fig_w:.1f} x {fig_h:.1f} (the words {box_h / fig_h * 100:.0f} % of her); total {total_w:.1f} x {fig_h:.1f}")
