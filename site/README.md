# The visiting card

The Studio's one-page site, [ruachstudio.art](https://ruachstudio.art): a static page, no build tools.

- `template.html`: the page, with `{{LOGO}}` where the Studio's logo goes;
- `build.py`: puts the logo (`src/brand/ruach-logo.svg`, a language's own from `src/brand/i18n/`) in and writes `index.html`, and `<lang>/index.html` for each catalog in `i18n/`, and from `SITE`, the card's address, `sitemap.xml` (every language's page with its alternates, and the vocabulary's) and `robots.txt` (its Sitemap line);
- `i18n/<lang>.json`: a language's words, keyed by the English unit; `i18n/<lang>.css` and `i18n/<lang>.story.html`, where a language has them, go into its own page alone (Hebrew, since 06.11.2026: its font, the page right to left and its little story);
- `assets/`: the pictures (the guide's screenshots as WebP), the icons, the link preview, and `fonts/noto-sans-hebrew/` (the Hebrew page's face, with its licence, OFL 1.1).

Serve this folder as it is; `index.html` is the page.
