# The page's fonts

The ten families the studio's page uses and offers in Engine → Appearance (Noto Sans, Noto Sans Mono, IBM Plex Sans, IBM Plex Mono, Bodoni Moda, Space Grotesk, Michroma, and Raleway, Roboto, Lato at Viktor's word), in the studio itself so it needs no internet (Viktor, 09.10.2026: «abcjs и шрифты ложи всё в репо… Минимум интернета из Студии на локальной машине»). Their Latin, Cyrillic and Greek subsets only (Lato has no Cyrillic or Greek, Raleway no Greek: the page falls back there), as WOFF2 from Google Fonts; the lab serves them at `/lab/fonts/NAME.woff2` (cached a year), and the page's faces (`build/tools/console/vendor/fonts.css`) point there.

All of them are under the SIL Open Font License 1.1; each family's notice and the licence are in `OFL.txt`.

To take them again: `heresy/tools/check-vendored.sh --fonts` (it fetches the stylesheet, keeps the same subsets and writes both the files and the faces).

HERESY 1426 (Viktor 14.10.2026: «выставь эти же шрифты по умолчанию… перепроверь, чтобы абсолютно все typefaces были в Студии»): **Liberation Mono** (2.1.5, SIL OFL 1.1; Red Hat and Google), the default for numbers and code, in all four faces (regular, bold, italic, bold italic) as TTF, taken from Ubuntu's fonts-liberation (`/usr/share/fonts/truetype/liberation/`), Latin, Cyrillic and Greek whole; the lab serves `.ttf` as well. `check-vendored.sh --fonts` keeps its faces (they are not Google's).

HERESY 1426, the faces Google's subsets lacked (the page asks for bold and italics, and a browser makes them up when they are not there): **Raleway** whole (400 to 700, each with its italic; 4.x, with Cyrillic and Greek) from Viktor's own fonts (`/usr/local/share/fonts/r/`), **Lato 2.015** (400 and 700 with their italics; Cyrillic and Greek, which Google's Lato has not) and **Noto Sans**' bold and italics from Ubuntu's packages, all as TTF and all under the SIL Open Font License 1.1 (their notices in `OFL.txt`, as Google's faces of the same families). The rest of the families keep Google's faces; their missing bold and italics wait for Viktor's word to be fetched.
