"""The bar's logo when the words do not fit (Viktor, 03.10.2026: «Для бара возьми главный логотип, убери из него текст и
сделай его 1.4:1… Так тень Девы останется прежней и лого при скейле страницы будет терять только свой текст»): the bar's
copy without RUACH and STUDIO, its own height kept, cut to RATIO around her, so at the same height she is drawn exactly
as in the full logo; the cloud fades out at the sides instead of meeting a hard edge. The square icon stays the favicon.
    python3 make_compact.py SRC.svg OUT.svg [ratio=1.4] [fade=0.12]"""
import re, sys
from pathlib import Path
src, out = Path(sys.argv[1]), Path(sys.argv[2])
opt = dict(a.split("=") for a in sys.argv[3:] if "=" in a)
ratio, fade = float(opt.get("ratio", 1.4)), float(opt.get("fade", 0.12))
s = src.read_text()
g = dict((k, float(v)) for k, v in re.findall(r"(\w+)=([-\d.]+)", re.search(r"<!-- geometry: (.*?) -->", s).group(1)))
vx, vy, vw, vh = map(float, re.search(r'viewBox="([^"]+)"', s).group(1).split())
w = vh * ratio
x0 = g["cx"] - w / 2
s = re.sub(r'viewBox="[^"]+"', f'viewBox="{x0:.1f} {vy:.1f} {w:.1f} {vh:.1f}"', s, count=1)
for pat in (r'\s*<g class="rl-word".*?</g>', r'\s*<rect class="rl-box"[^>]*/>', r'\s*<g class="rl-studio".*?</g>'):
    s, n = re.subn(pat, "", s, count=1, flags=re.S)
    assert n == 1, pat
# the cloud and the woman seen through a mask that opens from the sides inward: no hard edge where the cut falls
fade_defs = (f'    <!-- the sides fade: where the words were, the cloud thins out -->\n'
             f'    <linearGradient id="rlFadeG" x1="0" y1="0" x2="1" y2="0">'
             f'<stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="{fade}" stop-color="#fff"/>'
             f'<stop offset="{1 - fade}" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>\n'
             f'    <mask id="rlFade" maskUnits="userSpaceOnUse" x="{x0:.1f}" y="{vy:.1f}" width="{w:.1f}" height="{vh:.1f}">'
             f'<rect x="{x0:.1f}" y="{vy:.1f}" width="{w:.1f}" height="{vh:.1f}" fill="url(#rlFadeG)"/></mask>\n')
assert s.count("  </defs>") == 1
s = s.replace("  </defs>", fade_defs + "  </defs>", 1)
s = s.replace('  <g class="rl-cloud"', '  <g mask="url(#rlFade)">\n  <g class="rl-cloud"', 1)
s = s.replace("</svg>", "  </g>\n</svg>", 1)
out.write_text(s)
print(out, f"{w:.1f} x {vh:.1f} at {x0:.1f},{vy:.1f} (ratio {ratio}); her height as in the full logo at the same height")
