# What the page carries of others'

Viktor, 09.10.2026: «abcjs и шрифты ложи всё в репо. abcjs периодически проверять на новые релизы. Минимум интернета из Студии на локальной машине».

| file | what | licence |
|---|---|---|
| `abcjs-basic-min.js` | abcjs, the score's engraver (the staff, its print), inlined into the page by `build.sh` | MIT (`abcjs-LICENSE.md`, `abcjs-basic-min.js.LICENSE`) |
| `fonts.css` | the faces of the page's ten font families, pointing at `/lab/fonts/` (the files are in `lab/fonts/`) | SIL OFL 1.1 (`lab/fonts/OFL.txt`) |

`heresy/tools/check-vendored.sh` says whether a newer abcjs is out; `--abcjs` takes it, `--fonts` takes the fonts again.
