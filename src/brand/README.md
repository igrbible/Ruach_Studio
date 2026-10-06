# Ruach Studio · the logo

From Viktor's own draft (02.10.2026): **RUACH · the winged woman · [STUDIO]**. She is white, rising out of a cloud
in the theme's accent; the cloud reaches over the words' inner ends. RUACH is set in Montserrat Black, STUDIO a
touch above Light (Montserrat, SIL Open Font License, turned into paths: the files need no font). The woman is
traced from his drawing (`figure-traced.svg`, 101 contours).

| file | what |
|---|---|
| `ruach-logo.svg` | the logo; its colours follow the page's theme (CSS variables, with fallbacks) |
| `ruach-logo-bar.svg` | the bar's copy: she is larger beside smaller words and descends below the words |
| `ruach-logo-bar-compact.svg` | the bar's copy without its words, 1.4 : 1, her height kept: when the words do not fit, the logo loses only them (Viktor, 03.10); the cloud fades at the sides |
| `ruach-icon.svg` | the icon: the woman on a full square of the cloud, the outer feathers cut by its edges; the favicon, not the bar |
| `*-day-inkscape.svg`, `*-night-inkscape.svg` | the same with the Scroll & Brick colours written in, for Inkscape |
| `ruach-icon-{32,64,180,192,512}.png` | the icon as pictures; the page's favicon is the 64 |
| `i18n/ruach-logo-LANG.svg`, `i18n/ruach-logo-bar-LANG.svg` | the logo in each language of the page (1148): the woman and the cloud as in English, only the words change |
| `yue2/` | not ours: YuE2's mark (M-A-P's), traced for the About card's credits (1166); its README says how |

In the page the logo lives on the page's own slow clock (ten steps a second); the files carry SMIL, so they move
by themselves in a browser.

## Making them again

```bash
python3 make_logo.py ruach-logo.svg
FIG=3.0 WAIST=0.42 REACH=0.6 EDGE=0 python3 make_logo.py ruach-logo-bar.svg
python3 make_compact.py ruach-logo-bar.svg ruach-logo-bar-compact.svg ratio=1.4 fade=0.12
python3 make_icon.py ruach-logo.svg ruach-icon.svg side=0.66 cy=0.42 square
# a copy with colours written in: name=#hex after the file name
python3 make_logo.py ruach-logo-day-inkscape.svg cloud=#5f0f1d word=#8e1a2e on=#ffffff fig=#ffffff fig-shade=#f1ebe3 glow=#ffffff edge=#8e1a2e
```

## The words in each language

Viktor, 03.10.2026: «В русском `РУАХ СТУДИЯ`, укр. `РУАХ СТУДІЯ`, греч. `ΠΝΕΥΜΑ ΣΤΟΥΝΤΙΟ`, и т.п. но никаких `spirit`».
RUACH is carried over, never translated; Greek takes the Scriptures' own ΠΝΕΥΜΑ.

| | the words | font |
|---|---|---|
| ru · uk · be | РУАХ СТУДИЯ · РУАХ СТУДІЯ · РУАХ СТУДЫЯ | Montserrat, as the English |
| el | ΠΝΕΥΜΑ ΣΤΟΥΝΤΙΟ | Noto Sans Black and Regular |
| zh | 鲁阿赫 工作室 (a proposal) | Noto Sans CJK SC Bold and Regular |
| es · it | RUAJ ESTUDIO (a proposal) · RUACH STUDIO | Montserrat |

A word never grows wider than RUACH (the bar's breakpoints were measured on it): a wider one is set smaller; the
word in the block keeps STUDIO's size unless it would not fit, and is spaced out to fill it.

```bash
python3 make_words.py ../../build/tools/console/heresy-logo-words.js   # the page's data, from the bar's copy
python3 make_words.py --svg                                              # i18n/ruach-logo-LANG.svg, i18n/ruach-logo-bar-LANG.svg
```

`FIG` is her height in RUACH's cap heights (2.15 in the logo, 3.0 in the bar), `WAIST` where the words' middle
meets her (0.52 her waist, as in the draft; 0.42 higher, so she hangs lower), `REACH` how far the cloud goes into
the words, `EDGE` the strength of her contour. Needs `fontTools` and Montserrat's variable font
(`/usr/share/fonts/opentype/Montserrat/Montserrat_VariableFont_wght.ttf`).
