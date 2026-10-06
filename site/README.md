# The visiting card

The studio's one-page site, [ruachstudio.igr.bible](https://ruachstudio.igr.bible): a static page, no build tools.

- `template.html`: the page, with `{{LOGO}}` where the studio's logo goes;
- `build.py`: puts the logo (`src/brand/ruach-logo.svg`) in and writes `index.html`;
- `assets/`: the pictures (the guide's screenshots as WebP), the icons, the link preview.

Serve this folder as it is; `index.html` is the page.
