# The page's fonts

The ten families the studio's page uses and offers in Engine → Appearance (Noto Sans, Noto Sans Mono, IBM Plex Sans, IBM Plex Mono, Bodoni Moda, Space Grotesk, Michroma, and Raleway, Roboto, Lato at Viktor's word), in the studio itself so it needs no internet (Viktor, 09.10.2026: «abcjs и шрифты ложи всё в репо… Минимум интернета из Студии на локальной машине»). Their Latin, Cyrillic and Greek subsets only (Lato has no Cyrillic or Greek, Raleway no Greek: the page falls back there), as WOFF2 from Google Fonts; the lab serves them at `/lab/fonts/NAME.woff2` (cached a year), and the page's faces (`build/tools/console/vendor/fonts.css`) point there.

All of them are under the SIL Open Font License 1.1; each family's notice and the licence are in `OFL.txt`.

To take them again: `heresy/tools/check-vendored.sh --fonts` (it fetches the stylesheet, keeps the same subsets and writes both the files and the faces).
