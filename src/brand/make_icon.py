"""The icon from the logo (Viktor, 02.10.2026: «в саму иконку крайние лепестки обрезать, чтобы больше вместить саму
суть объекта»): the woman and her cloud without the words, cropped square around her, the outermost feathers and the
hem cut, so she fills it. `disc` lays the cloud under her as a whole disc; `square` fills the whole square
(Viktor, 02.10: «1:1 не нужно в кружок, всё заполни фоном»).
    python3 make_icon.py SRC.svg OUT.svg [side=0.70] [cy=0.43] [disc|square]"""
import re, sys
from pathlib import Path
src, out = Path(sys.argv[1]), Path(sys.argv[2])
opt = dict(a.split("=") for a in sys.argv[3:] if "=" in a); disc = "disc" in sys.argv[3:]; square = "square" in sys.argv[3:]
s = src.read_text()
g = dict((k, float(v)) for k, v in re.findall(r"(\w+)=([-\d.]+)", re.search(r"<!-- geometry: (.*?) -->", s).group(1)))
side = g["fh"] * float(opt.get("side", 0.70)); y0 = g["top"] + g["fh"] * float(opt.get("cy", 0.43)) - side / 2; x0 = g["cx"] - side / 2
s = re.sub(r'viewBox="[^"]+"', f'viewBox="{x0:.1f} {y0:.1f} {side:.1f} {side:.1f}"', s, count=1)
for pat in (r'\s*<g class="rl-word".*?</g>', r'\s*<rect class="rl-box"[^>]*/>', r'\s*<g class="rl-studio".*?</g>'):
    s = re.sub(pat, "", s, count=1, flags=re.S)
s = s.replace('aria-label="Ruach Studio"', 'aria-label="Ruach Studio" overflow="hidden"')
if disc:
    cloud = re.search(r'<stop offset="0" stop-color="([^"]+)"', s).group(1)
    under = (f'  <defs><radialGradient id="rlDisc" cx="0.5" cy="0.45" r="0.6"><stop offset="0" stop-color="{cloud}"/>'
             f'<stop offset="1" stop-color="{cloud}" stop-opacity="0.82"/></radialGradient></defs>\n'
             f'  <circle cx="{x0 + side / 2:.1f}" cy="{y0 + side / 2:.1f}" r="{side / 2:.1f}" fill="url(#rlDisc)"/>\n')
    r = side / 2 - 0.5
    clip = f'<clipPath id="rlRound"><circle cx="{x0 + side / 2:.1f}" cy="{y0 + side / 2:.1f}" r="{r:.1f}"/></clipPath>'
    under = under.replace("</radialGradient></defs>", "</radialGradient>" + clip + "</defs>")
    s = s.replace('  <g class="rl-cloud"', under + '  <g clip-path="url(#rlRound)">\n  <g class="rl-cloud"', 1)
    s = s.replace("</svg>", "  </g>\n</svg>", 1)            # the cloud and the woman inside the disc: her outer feathers cut by it
if square:
    cloud = re.search(r'<stop offset="0" stop-color="([^"]+)"', s).group(1)
    under = (f'  <defs><radialGradient id="rlBg" cx="0.5" cy="0.42" r="0.75"><stop offset="0" stop-color="{cloud}" stop-opacity="0.82"/>'
             f'<stop offset="1" stop-color="{cloud}"/></radialGradient></defs>\n'
             f'  <rect x="{x0:.1f}" y="{y0:.1f}" width="{side:.1f}" height="{side:.1f}" fill="url(#rlBg)"/>\n')
    s = s.replace('  <g class="rl-cloud"', under + '  <g class="rl-cloud"', 1)
out.write_text(s)
print(out, f"{side:.1f} square at {x0:.1f},{y0:.1f}")
