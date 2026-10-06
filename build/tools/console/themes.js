/* The theme picker: a swatch grid under the top bar's theme button, with
   All / Favorites / Bold / Soft / Classic filters and a search. Hovering (or
   moving the keyboard focus over) a theme previews it on the whole page;
   clicking keeps it; Esc or a click outside goes back to the kept one. A star
   on each theme adds it to Favorites. The same file ships in both consoles.

   window.YueThemes:
     mount(button, opts)   opts.onChange(id) runs after every preview and every change
     set(id)               keep a theme (the picker does this on a click)
     current()             the kept theme
     list                  every theme: {id, name, family, dark, bg, fg, accent, rule} */
(function (root) {
  "use strict";

  /* THEMES:BEGIN (the theme list; its generator is gone, so edit it here, with themes.css) */
  var THEMES = [{"id": "igr-day", "name": "Scroll & Brick", "family": "classic", "dark": false, "bg": "#fcfcfb", "fg": "#191919", "accent": "#8e1a2e", "rule": "#d4d4d3"},
    {"id": "igr-night", "name": "Scroll by Lamplight", "family": "classic", "dark": true, "bg": "#1e1e1e", "fg": "#f4f4f4", "accent": "#f07171", "rule": "#3e3e3e"},
    {"id": "studio", "name": "Studio (warm)", "family": "classic", "dark": true, "bg": "#14110e", "fg": "#f2eadc", "accent": "#e8a33d", "rule": "#3a3129"},
    {"id": "graphite", "name": "Graphite", "family": "classic", "dark": true, "bg": "#131518", "fg": "#eef1f5", "accent": "#f0b44c", "rule": "#373d45"},
    {"id": "nord", "name": "Nord", "family": "classic", "dark": true, "bg": "#2e3440", "fg": "#eceff4", "accent": "#ebcb8b", "rule": "#4c566a"},
    {"id": "dracula", "name": "Dracula", "family": "classic", "dark": true, "bg": "#21222c", "fg": "#f8f8f2", "accent": "#bd93f9", "rule": "#44475a"},
    {"id": "gruvbox", "name": "Gruvbox", "family": "classic", "dark": true, "bg": "#1d2021", "fg": "#fbf1c7", "accent": "#fabd2f", "rule": "#504945"},
    {"id": "solarized-dark", "name": "Solarized dark", "family": "classic", "dark": true, "bg": "#002b36", "fg": "#eee8d5", "accent": "#e0b020", "rule": "#1f5461"},
    {"id": "solarized-light", "name": "Solarized light", "family": "classic", "dark": false, "bg": "#eee8d5", "fg": "#073642", "accent": "#7d5500", "rule": "#cfc6ad"},
    {"id": "daylight", "name": "Daylight", "family": "classic", "dark": false, "bg": "#f8f9fa", "fg": "#161a1f", "accent": "#9c4708", "rule": "#cfd5dd"},
    {"id": "contrast", "name": "High contrast", "family": "classic", "dark": true, "bg": "#000000", "fg": "#ffffff", "accent": "#ffcc40", "rule": "#8a8a8a"},
    {"id": "warm-clay", "name": "Warm Clay", "family": "soft", "dark": false, "bg": "#F8E3C4", "fg": "#2C1810", "accent": "#793a25", "rule": "#D4B176"},
    {"id": "cocoa", "name": "Cocoa", "family": "soft", "dark": false, "bg": "#EFEBE9", "fg": "#5D4037", "accent": "#66483d", "rule": "#BCAAA4"},
    {"id": "parchment", "name": "Parchment", "family": "soft", "dark": false, "bg": "#F4E4BE", "fg": "#5F4B32", "accent": "#754b1f", "rule": "#E2CCA0"},
    {"id": "jade", "name": "Jade", "family": "soft", "dark": false, "bg": "#E8F4EE", "fg": "#1D4A3C", "accent": "#286650", "rule": "#D5EAE0"},
    {"id": "lagoon", "name": "Lagoon", "family": "soft", "dark": false, "bg": "#E6F3F4", "fg": "#2A5254", "accent": "#376770", "rule": "#C2E3E4"},
    {"id": "porcelain", "name": "Porcelain", "family": "soft", "dark": false, "bg": "#F2F7FF", "fg": "#102349", "accent": "#1E3F66", "rule": "#B9D7FF"},
    {"id": "pewter", "name": "Pewter", "family": "soft", "dark": false, "bg": "#F3F4F6", "fg": "#1F2937", "accent": "#4B5563", "rule": "#D1D5DB"},
    {"id": "ink", "name": "Ink", "family": "soft", "dark": true, "bg": "#1F2937", "fg": "#E5E7EB", "accent": "#dadde0", "rule": "#374151"},
    {"id": "marble", "name": "Marble", "family": "soft", "dark": false, "bg": "#F7F6F2", "fg": "#2B2926", "accent": "#66625e", "rule": "#EAE8E3"},
    {"id": "light", "name": "Light", "family": "classic", "dark": false, "bg": "#ffffff", "fg": "#24292f", "accent": "#0861c9", "rule": "#d0d7de"},
    {"id": "dark", "name": "Dark", "family": "classic", "dark": true, "bg": "#1f1f1f", "fg": "#d7d7d7", "accent": "#3794ff", "rule": "#343434"}];
  /* THEMES:END */

  var FAMILIES = [["all", "All"], ["favorites", "Favorites"], ["classic", "Classic"], ["soft", "Soft"]];   // HERESY 1099: "bold" went to the archive
  var S = { button: null, popup: null, onChange: null, kept: "igr-day", shown: null, family: "all", favorites: [] };

  function load(key, fallback) {
    try { var v = localStorage.getItem(key); return v === null ? fallback : v; } catch (error) { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, value); } catch (error) { /* private mode */ }
  }
  function find(id) {
    for (var i = 0; i < THEMES.length; i++) if (THEMES[i].id === id) return THEMES[i];
    return null;
  }
  function escape(text) {
    return String(text).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  }

  function apply(id) {
    if (S.shown === id) return;
    S.shown = id;
    document.documentElement.dataset.theme = id;
    document.documentElement.dataset.tone = (find(id) || {}).dark ? "dark" : "light";   // HERESY 1167: day or night for CSS (the logo's cloud)
    if (S.onChange) S.onChange(id);
  }

  function paintButton() {
    if (!S.button) return;
    var t = find(S.kept) || THEMES[0] || { name: "Theme", bg: "#000", fg: "#fff", accent: "#fff" };
    // HERESY 1017: a palette and the theme's dot; the name is in the tip (the bar fits at 120%)
    S.button.innerHTML = (root.HeresyIcons ? root.HeresyIcons.svg("theme") : "") +
      '<span class="theme-dot" style="background:' + t.bg + ";border-color:" + t.accent + '"></span>';
    S.button.setAttribute("aria-label", "Theme: " + t.name + " (choose another)");
    S.button.dataset.tip = "Theme: " + t.name + ". Hover a theme to preview it, click to keep it.";
  }

  function visible() {
    var query = S.popup.querySelector(".theme-search").value.trim().toLowerCase();
    return THEMES.filter(function (t) {
      if (query) return t.name.toLowerCase().indexOf(query) >= 0;
      if (S.family === "all") return true;
      if (S.family === "favorites") return S.favorites.indexOf(t.id) >= 0;
      return t.family === S.family;
    });
  }

  function paintGrid() {
    var grid = S.popup.querySelector(".theme-grid"), list = visible();
    var focused = document.activeElement && document.activeElement.closest && document.activeElement.closest(".theme-choice");
    var refocus = focused ? focused.dataset.themeId : null;
    Array.prototype.forEach.call(S.popup.querySelectorAll(".theme-filters button"), function (b) {
      b.setAttribute("aria-pressed", String(b.dataset.family === S.family));
    });
    grid.innerHTML = list.length ? list.map(function (t) {
      var fav = S.favorites.indexOf(t.id) >= 0;
      return '<div class="theme-tile' + (t.id === S.kept ? " is-kept" : "") + '" data-theme-id="' + t.id + '">' +
        '<button type="button" class="theme-choice" role="option" aria-selected="' + (t.id === S.kept) + '" data-theme-id="' + t.id + '">' +
        '<span class="theme-swatch" style="background:' + t.bg + ";color:" + t.fg + ";border-color:" + t.rule + '">Aa' +
        '<span class="theme-accent" style="background:' + t.accent + '"></span></span>' +
        '<span class="theme-label">' + escape(t.name) + "</span>" + (t.id === S.kept ? '<span class="theme-check" aria-hidden="true">✓</span>' : "") +
        "</button>" +
        '<button type="button" class="theme-star' + (fav ? " is-on" : "") + '" data-star="' + t.id + '" aria-pressed="' + fav +
        '" aria-label="' + (fav ? "Remove " + escape(t.name) + " from favorites" : "Add " + escape(t.name) + " to favorites") + '">' + (fav ? "★" : "☆") + "</button></div>";
    }).join("") : '<div class="theme-empty">' + (S.family === "favorites" ? "No favorites yet: tap ☆ on a theme." : "No theme matches.") + "</div>";
    S.popup.querySelector(".theme-count").textContent = list.length + " of " + THEMES.length;
    var again = refocus && grid.querySelector('.theme-choice[data-theme-id="' + refocus + '"]');
    if (again) again.focus();
  }

  function place() {
    var r = S.button.getBoundingClientRect(), p = S.popup;
    var width = Math.min(640, window.innerWidth - 16);
    p.style.width = width + "px";
    p.style.left = Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8)) + "px";
    p.style.top = (r.bottom + 6) + "px";
    p.style.maxHeight = Math.max(220, window.innerHeight - r.bottom - 18) + "px";
  }

  function open() {
    if (!S.popup.hidden) return close(true);
    S.popup.hidden = false;
    S.button.setAttribute("aria-expanded", "true");
    S.popup.querySelector(".theme-search").value = "";
    paintGrid();
    place();
    var kept = S.popup.querySelector('.theme-choice[data-theme-id="' + S.kept + '"]');
    (kept || S.popup.querySelector(".theme-choice") || S.popup.querySelector(".theme-search")).focus();
    if (kept) kept.scrollIntoView({ block: "nearest" });
  }

  function close(revert) {
    if (S.popup.hidden) return;
    S.popup.hidden = true;
    S.button.setAttribute("aria-expanded", "false");
    if (revert) apply(S.kept);
  }

  function set(id) {
    if (!find(id)) return;
    S.kept = id;
    save("yue2.theme", id);
    apply(id);
    paintButton();
    if (S.popup && !S.popup.hidden) paintGrid();
  }

  // Arrow keys move through the grid by rows and columns
  function move(from, key) {
    var tiles = Array.prototype.slice.call(S.popup.querySelectorAll(".theme-choice"));
    if (!tiles.length) return;
    var at = tiles.indexOf(from);
    if (at < 0) {   // focus is elsewhere (the search box, or lost to a redraw): start at the kept theme
      var kept = S.popup.querySelector('.theme-choice[data-theme-id="' + S.kept + '"]');
      return (kept || tiles[0]).focus();
    }
    var cols = 1, top = tiles[0].getBoundingClientRect().top;
    while (cols < tiles.length && Math.abs(tiles[cols].getBoundingClientRect().top - top) < 4) cols++;
    var next = key === "ArrowRight" ? at + 1 : key === "ArrowLeft" ? at - 1 : key === "ArrowDown" ? at + cols : at - cols;
    if (next >= 0 && next < tiles.length) tiles[next].focus();
  }

  var STYLE = [
    ".theme-button { display: inline-flex; align-items: center; gap: 7px; justify-content: center; }",   // HERESY 1017: an icon and a dot, no name
    ".theme-dot { width: 13px; height: 13px; border-radius: 50%; border: 2px solid; flex: none; }",
    ".theme-name { flex: 1; text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }",
    ".theme-arrow { color: var(--dim); font-size: 10px; }",
    ".theme-popup { position: fixed; z-index: 60; display: flex; flex-direction: column; gap: 8px; padding: 10px;",
    "  background: var(--panel); color: var(--ink); border: 1px solid var(--line); border-radius: var(--r-md, 7px);",
    "  box-shadow: 0 18px 44px -14px var(--shadow-lg); }",
    ".theme-popup[hidden] { display: none; }",
    ".theme-top { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }",
    ".theme-filters { display: flex; gap: 4px; flex-wrap: wrap; }",
    ".theme-filters button { padding: 4px 9px; border: 1px solid var(--line); border-radius: var(--r-pill, 999px); background: transparent;",
    "  color: var(--muted); font: inherit; font-size: 12px; cursor: pointer; }",
    ".theme-filters button[aria-pressed=true] { border-color: var(--amber); color: var(--amber); }",
    ".theme-search { flex: 1; min-width: 120px; padding: 5px 9px; background: var(--field); color: var(--ink);",
    "  border: 1px solid var(--line); border-radius: var(--r-sm, 4px); font: inherit; font-size: 12.5px; }",
    ".theme-count { color: var(--dim); font-size: 11.5px; white-space: nowrap; }",
    ".theme-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 6px; overflow: auto; min-height: 60px; }",
    ".theme-tile { position: relative; }",
    ".theme-choice { width: 100%; display: flex; align-items: center; gap: 8px; padding: 5px 26px 5px 5px; background: transparent;",
    "  border: 1px solid transparent; border-radius: var(--r-sm, 4px); color: var(--ink); font: inherit; font-size: 12.5px;",
    "  text-align: left; cursor: pointer; }",
    ".theme-choice:hover, .theme-choice:focus-visible { border-color: var(--line-strong); background: var(--hover); outline: none; }",
    ".theme-tile.is-kept .theme-choice { border-color: var(--amber); }",
    ".theme-swatch { position: relative; flex: none; width: 38px; height: 28px; display: grid; place-items: center;",
    "  border: 1px solid; border-radius: var(--r-sm, 4px); font: 600 12px/1 var(--sans, sans-serif); overflow: hidden; }",
    ".theme-accent { position: absolute; left: 0; right: 0; bottom: 0; height: 4px; }",
    ".theme-label { flex: 1; min-width: 0; overflow: hidden; line-height: 1.2; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }",
    ".theme-check { color: var(--amber); font-size: 12px; }",
    ".theme-star { position: absolute; top: 50%; right: 4px; transform: translateY(-50%); background: none; border: 0;",
    "  color: var(--dim); font-size: 14px; cursor: pointer; padding: 2px 4px; line-height: 1; }",
    ".theme-star:hover, .theme-star.is-on { color: var(--amber); }",
    ".theme-empty { grid-column: 1 / -1; color: var(--dim); font-size: 12.5px; padding: 10px 4px; }",
    ".theme-hint { color: var(--dim); font-size: 11.5px; }"
  ].join("\n");

  function mount(button, opts) {
    S.button = button;
    S.onChange = (opts || {}).onChange || null;
    S.kept = find(load("yue2.theme", "igr-day")) ? load("yue2.theme", "igr-day") : "igr-day";   // HERESY 1015: light by default
    S.shown = document.documentElement.dataset.theme || null;
    S.family = load("yue2.themeFamily", "all");
    try { S.favorites = JSON.parse(load("yue2.themeFavorites", "[]")) || []; } catch (error) { S.favorites = []; }
    var style = document.createElement("style");
    style.textContent = STYLE;
    document.head.appendChild(style);
    var popup = document.createElement("div");
    popup.className = "theme-popup";
    popup.hidden = true;
    popup.setAttribute("role", "dialog");
    popup.setAttribute("aria-label", "Themes");
    popup.innerHTML = '<div class="theme-top"><div class="theme-filters" role="group" aria-label="Theme collection">' +
      FAMILIES.map(function (f) { return '<button type="button" data-family="' + f[0] + '">' + f[1] + "</button>"; }).join("") +
      '</div><input class="theme-search" type="search" placeholder="Search themes" aria-label="Search themes" />' +
      '<span class="theme-count"></span></div><div class="theme-grid" role="listbox" aria-label="Themes"></div>' +
      '<div class="theme-hint">Hover a theme to preview it on the page · click to keep it · Esc goes back · ☆ adds it to Favorites</div>';
    document.body.appendChild(popup);
    S.popup = popup;
    document.documentElement.dataset.theme = S.kept;   // at load: no redraw, the page is not painted yet
    document.documentElement.dataset.tone = (find(S.kept) || {}).dark ? "dark" : "light";   // HERESY 1167
    S.shown = S.kept;
    paintButton();

    button.setAttribute("aria-haspopup", "dialog");
    button.setAttribute("aria-expanded", "false");
    button.addEventListener("click", function (event) { event.stopPropagation(); open(); });
    popup.addEventListener("click", function (event) {
      event.stopPropagation();
      var star = event.target.closest("[data-star]"), choice = event.target.closest(".theme-choice"), fam = event.target.closest("[data-family]");
      if (star) {
        var id = star.dataset.star, at = S.favorites.indexOf(id);
        if (at >= 0) S.favorites.splice(at, 1); else S.favorites.push(id);
        save("yue2.themeFavorites", JSON.stringify(S.favorites));
        paintGrid();
      } else if (choice) {
        set(choice.dataset.themeId);
        close(false);
        button.focus();
      } else if (fam) {
        S.family = fam.dataset.family;
        save("yue2.themeFamily", S.family);
        popup.querySelector(".theme-search").value = "";
        paintGrid();
      }
    });
    // preview on hover and on keyboard focus
    popup.addEventListener("mouseover", function (event) {
      var choice = event.target.closest(".theme-choice");
      if (choice) apply(choice.dataset.themeId);
    });
    popup.addEventListener("focusin", function (event) {
      var choice = event.target.closest(".theme-choice");
      if (choice) apply(choice.dataset.themeId);
    });
    popup.querySelector(".theme-search").addEventListener("input", paintGrid);
    // keys work wherever the focus is while the picker is open (capture: before the page's own Esc)
    document.addEventListener("keydown", function (event) {
      if (popup.hidden) return;
      var inSearch = event.target.classList && event.target.classList.contains("theme-search");
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close(true);
        button.focus();
      } else if (/^Arrow(Up|Down|Left|Right)$/.test(event.key) && !(inSearch && /Left|Right/.test(event.key))) {
        event.preventDefault();
        move(event.target.closest ? event.target.closest(".theme-choice") : null, event.key);
      }
    }, true);
    document.addEventListener("click", function () { close(true); });
    window.addEventListener("resize", function () { if (!popup.hidden) place(); });
  }

  root.YueThemes = { mount: mount, set: set, current: function () { return S.kept; }, list: THEMES,
    isOpen: function () { return !!S.popup && !S.popup.hidden; } };
})(window);
