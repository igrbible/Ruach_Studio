/* The Engine panel's VAE tiles: one per decoder, with where it came from
   (stock, from the model's own publisher, or an add-on made by someone else,
   and a link to it) and a recap under its (i).
   They are for reading: the song form picks the VAE, and the tile of the one
   it has picked is marked. The same file ships in both consoles; each page
   hands it its decoders.

   window.YueVaes:
     listInto(list, note, opts)  opts: { current() -> the form's VAE }
     set(vaes, def)              [{name, label, repo, installed}] and the Engine default
     setSources(map)             {name: {official, url, about}} from loras/sources.json
     repaint()                   after the form's VAE changes
     kindOf(v)                   "stock" | "add-on" for {name, repo}: sources.json's word, else by publisher
     badge(kind)                 the small STOCK / ADD-ON mark, for the form too */
(function (root) {
  "use strict";

  var NOTES = { standard: "best sound", legacy: "benchmark", blend: "⅔ standard, ⅓ legacy" };
  var PUBLISHER = "m-a-p/";   // the model's own releases; anything else is an add-on
  var KIND_TIPS = {
    "stock": "Stock: released with the model by its own publisher",
    "add-on": "Add-on: made by a third party, not the model's publisher"
  };
  var S = { vaes: [], def: "", sources: {}, list: null, note: null, opts: {} };

  // HERESY 1165: texts glued from names translated here, whole (see loras.js); drawn again when the language changes
  function tr(s) { return root.RuachI18n ? root.RuachI18n.t(s) : s; }
  root.addEventListener("ruach-lang", function () { paint(); });

  function escape(text) {
    return String(text === undefined || text === null ? "" : text).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function labelOf(v) { return v.label || v.name; }

  // Only web links become links: anything else in sources.json stays plain text
  function webUrl(u) { return /^https?:\/\//i.test(String(u || "")) ? String(u) : ""; }

  function kindOf(v) {
    var src = S.sources[v.name] || {};
    if (src.official === true) return "stock";
    if (src.official === false) return "add-on";
    return v.repo ? (v.repo.indexOf(PUBLISHER) === 0 ? "stock" : "add-on") : "";
  }

  function badge(kind) {
    return kind ? '<span class="kind-badge' + (kind === "add-on" ? " is-addon" : "") + '" data-tip="' + escape(KIND_TIPS[kind]) + '">' +
      kind + "</span>" : "";
  }

  function paint() {
    if (!S.list) return;
    var current = S.opts.current ? S.opts.current() : "", pickedLabel = "";
    S.list.innerHTML = S.vaes.map(function (v) {
      var src = S.sources[v.name] || {}, ok = v.installed !== false, picked = ok && v.name === current;
      var kind = kindOf(v);
      if (picked) pickedLabel = labelOf(v);
      var recap = [tr(labelOf(v)) + (kind ? " · " + tr(kind) : ""), src.about ? tr(src.about) : "", v.repo ? tr("Weights: " + v.repo) : ""].filter(Boolean).join("\n");
      var url = webUrl(src.url);
      var where = url
        ? '<a class="tile-link" href="' + escape(url) + '" target="_blank" rel="noopener noreferrer" data-tip="' +
          escape(tr("Open its model card (new tab): " + url)) + '"><span translate="no">' + escape(v.repo || url) + "</span>\u2197</a>"
        : '<span class="tile-repo" translate="no">' + escape(v.repo || v.name) + "</span>";
      var meta = [NOTES[v.name] || "", v.name === S.def ? "engine default" : "", ok ? "" : "not downloaded"].filter(Boolean)
        .map(function (m) { return "<span>" + escape(m) + "</span>"; }).join(" · ");   // HERESY 1165: each its own text
      return '<li class="lora-item vae-item' + (picked ? " is-on" : "") + (kind === "add-on" ? " is-addon" : "") + (ok ? "" : " is-bad") +
        '" data-vae="' + escape(v.name) + '">' +
        '<div class="lora-item-head"><span class="lora-item-name">' + escape(labelOf(v)) + badge(kind) + "</span>" +
        (picked ? '<span class="tile-state">in the song form</span>' : "") + "</div>" +
        '<div class="tile-src">' + where + '<span class="info" tabindex="-1" role="img" aria-label="' + escape(tr("About the " + labelOf(v) + " VAE")) +
        '" data-tip="' + escape(recap) + '"></span></div>' +
        (meta ? '<div class="lora-item-meta">' + meta + "</div>" : "") + "</li>";
    }).join("");
    if (S.note) {
      S.note.textContent = tr(S.vaes.length + " decoder" + (S.vaes.length === 1 ? "" : "s")) +
        (pickedLabel ? " · " + tr(pickedLabel + " picked in the ☰ menu") : "") + " · " + tr("a finished song can add another from its page");
    }
  }

  function listInto(list, note, opts) {
    S.list = list;
    S.note = note || null;
    S.opts = opts || {};
    paint();
  }

  function set(vaes, def) {
    S.vaes = (vaes || []).slice();
    S.def = def || "";
    paint();
  }

  function setSources(map) {
    S.sources = map && typeof map === "object" ? map : {};
    paint();
  }

  root.YueVaes = { listInto: listInto, set: set, setSources: setSources, repaint: paint,
    kindOf: kindOf, badge: badge };
})(window);
