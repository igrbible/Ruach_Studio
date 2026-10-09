// HERESY 1096 (Viktor, 02.10.2026): the studio's own guide, room by room, in the studio itself. The ? in the bar
// (and Guide in the ☰) opens it on the room you are in; a browser that has never seen the studio gets it by
// itself a minute after the first start ("so the user sees that somebody took care of them, not just a hard tool").
// One source: docs/GUIDE.md (the repository's guide too), served by the lab at /lab/guide/; every "## " is a
// tab, every "### " a stop in the tab's own contents; pictures from docs/guide/, a click shows one large.
// HERESY 1166: in the page's language when docs/GUIDE.<lang>.md is there (else the English); a translated heading ends
// in <!-- #id --> (or {#id}), the English heading's own id, so open(tab, stop) finds the same place in every language.
(function () {
  "use strict";

  var SEEN = "yue2.guideSeen", LAST = "yue2.guideTab";
  var ROOM_TAB = { create: "creator", write: "writer", post: "refiner", artist: "artist", collection: "librarian", train: "lora" };   // HERESY 1255: the Artist
  var state = { tabs: null, title: "", lead: "", el: null, loading: null, lang: "" };
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function recall(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function keep(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* a private window */ } }
  function slug(s) { return String(s).toLowerCase().replace(/[^\w]+/g, "-").replace(/^-|-$/g, ""); }
  // a heading's text and its id: the anchor it carries (a translation), else its own slug (the English)
  var ANCHOR = /\s*(?:\{#([\w-]+)\}|<!--\s*#([\w-]+)\s*-->)\s*$/;
  function heading(h) {
    var m = ANCHOR.exec(h);
    return m ? { text: h.slice(0, m.index).trim(), id: m[1] || m[2] } : { text: h.trim(), id: slug(h) };
  }
  function pageLang() { return window.RuachI18n ? window.RuachI18n.lang() : "en"; }
  function src(u) { return /^(https?:|data:|\/)/.test(u) ? u : "/lab/guide/" + u.replace(/^\.?\//, ""); }

  // ---- a small Markdown: headings, paragraphs, lists, tables, quotes, code, pictures, links, bold, italic
  function inline(t) {
    var code = [];
    t = esc(t).replace(/`([^`]+)`/g, function (_, c) { code.push(c); return "\u0000" + (code.length - 1) + "\u0000"; });
    t = t.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g, function (_, alt, u, cap) {
      return '<figure class="hg-fig"><img src="' + esc(src(u)) + '" alt="' + alt + '" loading="lazy" />' + (cap || alt ? "<figcaption>" + (cap || alt) + "</figcaption>" : "") + "</figure>";
    });
    t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (_, x, u) { return '<a href="' + esc(/^(https?:|#)/.test(u) ? u : src(u)) + '" target="_blank" rel="noopener">' + x + "</a>"; });
    t = t.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, "$1<i>$2</i>");
    t = t.replace(/\u26a0\ufe0f?[ \u00a0]?/g, '<span class="warn-ico" role="img" aria-label="Warning"></span>');   // HERESY 1169 · 1247
    return t.replace(/\u0000(\d+)\u0000/g, function (_, i) { return "<code>" + code[+i] + "</code>"; });
  }
  function render(md) {
    var out = [], lines = md.split("\n"), i = 0;
    while (i < lines.length) {
      var l = lines[i];
      if (/^```/.test(l)) { var buf = []; i++; while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]); i++; out.push("<pre><code>" + esc(buf.join("\n")) + "</code></pre>"); continue; }
      var h = l.match(/^(#{3,4})\s+(.*)$/);
      if (h) { var hd = heading(h[2]); out.push("<h" + h[1].length + ' id="hg-' + hd.id + '">' + inline(hd.text) + "</h" + h[1].length + ">"); i++; continue; }
      if (/^---+\s*$/.test(l)) { out.push("<hr />"); i++; continue; }
      if (/^\|/.test(l)) {
        var rows = []; while (i < lines.length && /^\|/.test(lines[i])) rows.push(lines[i++]);
        var cells = function (r) { return r.replace(/^\||\|\s*$/g, "").split("|").map(function (c) { return c.trim(); }); };
        var head = cells(rows[0]), body = rows.slice(/^\|[\s:|-]+\|?\s*$/.test(rows[1] || "") ? 2 : 1);
        out.push('<table class="hg-table"><tr>' + head.map(function (c) { return "<th>" + inline(c) + "</th>"; }).join("") + "</tr>" +
          body.map(function (r) { return "<tr>" + cells(r).map(function (c) { return "<td>" + inline(c) + "</td>"; }).join("") + "</tr>"; }).join("") + "</table>");
        continue;
      }
      if (/^\s*([-*]|\d+\.)\s+/.test(l)) {
        var ordered = /^\s*\d+\./.test(l), items = [];
        while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
          var item = lines[i++].replace(/^\s*([-*]|\d+\.)\s+/, "");
          while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*([-*]|\d+\.)\s+/.test(lines[i])) item += " " + lines[i++].trim();
          items.push("<li>" + inline(item) + "</li>");
        }
        out.push((ordered ? "<ol>" : "<ul>") + items.join("") + (ordered ? "</ol>" : "</ul>"));
        continue;
      }
      if (/^>\s?/.test(l)) { var q = []; while (i < lines.length && /^>\s?/.test(lines[i])) q.push(lines[i++].replace(/^>\s?/, "")); out.push('<blockquote class="hg-note">' + inline(q.join(" ")) + "</blockquote>"); continue; }
      if (!l.trim()) { i++; continue; }
      var p = [l]; i++;
      while (i < lines.length && lines[i].trim() && !/^(#{3,4}\s|```|\||>|---|\s*([-*]|\d+\.)\s)/.test(lines[i])) p.push(lines[i++]);
      var joined = p.join(" ");
      out.push(/^!\[[^\]]*\]\([^)]+\)$/.test(joined.trim()) ? inline(joined) : "<p>" + inline(joined) + "</p>");
    }
    return out.join("\n");
  }
  function parse(md) {
    var parts = md.split(/\n(?=## )/), head = parts.shift();
    state.title = ((head.match(/^#\s+(.*)$/m) || [])[1] || "The guide").trim();
    state.lead = head.replace(/^#\s+.*$/m, "").trim();
    state.tabs = parts.map(function (p) {
      var hd = heading(p.match(/^##\s+(.*)$/m)[1]), name = hd.text, body = p.replace(/^##\s+.*$/m, "");
      var stops = (body.match(/^###\s+.*$/gm) || []).map(function (h) { return heading(h.replace(/^###\s+/, "")); });
      var id = ANCHOR.test(p.match(/^##\s+(.*)$/m)[1]) ? hd.id : slug(name.replace(/^[^\w]+/, "")).split("-")[0] || slug(name);
      return { id: id, name: name, html: render(body), stops: stops };
    });
  }
  function load() {
    var lang = pageLang();
    if (state.tabs && state.lang === lang) return Promise.resolve();
    if (state.lang !== lang) { state.tabs = null; state.loading = null; state.lang = lang; }
    var get = function (file) { return fetch("/lab/guide/" + file).then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); }); };
    if (!state.loading) state.loading = (lang === "en" ? get("GUIDE.md") : get("GUIDE." + lang + ".md").catch(function () { return get("GUIDE.md"); }))
      .then(function (md) { if (state.lang === lang) parse(md); });
    return state.loading;
  }

  // ---- the overlay
  // HERESY 1169 · 1250 (Viktor 08.10.2026: «Попап Гайда сделай шире на 10% по hv и выше по vv. И кнопочку FULL SCREEN. И также кнопки
  // скейла текста сделай»): the box 10 % wider and taller, − + ⟲ for the text alone (a tenth a step, two each way, as the lyrics'),
  // ⤢ for the whole screen; both kept in this browser
  var ZOOM = "yue2.guideZoom", FULL = "yue2.guideFull";
  function ico(name) { return window.HeresyIcons ? window.HeresyIcons.ui(name) : ""; }
  function zoomStep() { var k = parseInt(recall(ZOOM) || "0", 10); return isFinite(k) ? Math.max(-2, Math.min(2, k)) : 0; }
  function paintTools() {
    var el = state.el, k = zoomStep(), full = recall(FULL) === "1";
    el.querySelector(".hg-box").style.setProperty("--hg-z", String(Math.round(Math.pow(1.1, k) * 1000) / 1000));
    el.querySelector('[data-hg-z="-1"]').disabled = k <= -2;
    el.querySelector('[data-hg-z="1"]').disabled = k >= 2;
    el.querySelector('[data-hg-z="0"]').disabled = k === 0;
    el.classList.toggle("is-full", full);
    var f = el.querySelector(".hg-full");
    f.innerHTML = ico(full ? "minimize" : "maximize");
    f.setAttribute("aria-pressed", full ? "true" : "false");
    f.setAttribute("aria-label", full ? "Back to the window" : "Full screen");
    f.dataset.tip = full ? "Back to the window" : "The guide over the whole screen";
  }
  function build() {
    var el = document.createElement("div");
    el.className = "hg-back";
    el.innerHTML = '<div class="hg-box" role="dialog" aria-modal="true" aria-label="The Guide">' +
      '<header class="hg-head"><div translate="no"><b class="hg-title"></b><span class="hg-lead"></span></div><span class="hg-tools">' +
      '<span class="hg-fs" role="group" aria-label="Text size">' +
      '<button type="button" class="btn ghost small icon-btn" data-hg-z="-1" aria-label="Smaller text" data-tip="Smaller text here">' + ico("text-smaller") + "</button>" +
      '<button type="button" class="btn ghost small icon-btn" data-hg-z="1" aria-label="Larger text" data-tip="Larger text here">' + ico("text-larger") + "</button>" +
      '<button type="button" class="btn ghost small icon-btn" data-hg-z="0" aria-label="The text as it starts" data-tip="The text as it starts">' + ico("text-reset") + "</button></span>" +
      '<button type="button" class="btn ghost small icon-btn hg-full"></button>' +
      '<button type="button" class="btn ghost small icon-btn hg-close" aria-label="Close the guide" data-tip="Close the guide (Esc, F1)">' + ico("x") + "</button></span></header>" +
      '<nav class="hg-tabs" role="tablist"></nav><div class="hg-main"><nav class="hg-stops" aria-label="In this part"></nav><article class="hg-body" translate="no"></article></div></div>' +
      '<div class="hg-zoom" hidden><img alt="" /></div>';
    document.body.appendChild(el);
    el.addEventListener("click", function (e) {
      var t = e.target, b;
      if (t === el || t.closest(".hg-close")) return close();
      if ((b = t.closest("[data-hg-z]"))) {
        var k = +b.dataset.hgZ === 0 ? 0 : Math.max(-2, Math.min(2, zoomStep() + +b.dataset.hgZ));
        keep(ZOOM, String(k));
        return paintTools();
      }
      if (t.closest(".hg-full")) { keep(FULL, recall(FULL) === "1" ? "0" : "1"); return paintTools(); }
      if ((b = t.closest("[data-hg-tab]"))) return show(b.dataset.hgTab);
      if ((b = t.closest("[data-hg-stop]"))) { var h = el.querySelector("#hg-" + b.dataset.hgStop); if (h) h.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
      if (t.matches(".hg-fig img")) { var z = el.querySelector(".hg-zoom"); z.querySelector("img").src = t.src; z.hidden = false; return; }
      if (t.closest(".hg-zoom")) { el.querySelector(".hg-zoom").hidden = true; return; }
    });
    document.addEventListener("keydown", function (e) {
      if (!state.el || state.el.hidden || e.key !== "Escape") return;
      var z = state.el.querySelector(".hg-zoom");
      if (!z.hidden) z.hidden = true; else close();
    });
    state.el = el;
    paintTools();
  }
  function show(id, stop) {
    var tab = state.tabs.filter(function (t) { return t.id === id; })[0] || state.tabs[0];
    keep(LAST, tab.id);
    var el = state.el;
    el.querySelector(".hg-title").textContent = state.title;
    el.querySelector(".hg-lead").textContent = state.lead.replace(/[*_`]/g, "").split("\n")[0];
    el.querySelector(".hg-tabs").innerHTML = state.tabs.map(function (t) {
      return '<button type="button" role="tab" translate="no" data-hg-tab="' + esc(t.id) + '" class="' + (t === tab ? "is-on" : "") + '" aria-selected="' + (t === tab) + '">' + inline(t.name) + "</button>";
    }).join("");
    el.querySelector(".hg-stops").innerHTML = tab.stops.map(function (s) { return '<button type="button" translate="no" data-hg-stop="' + esc(s.id) + '">' + inline(s.text) + "</button>"; }).join("");
    var body = el.querySelector(".hg-body");
    body.innerHTML = '<div class="hg-doc">' + tab.html + "</div>";   // HERESY 1169 · 1250: the text's own zoom, the scroll box stays
    body.scrollTop = 0;
    var h = stop && body.querySelector("#hg-" + slug(stop));   // HERESY 1101: straight to one stop
    if (h) h.scrollIntoView({ block: "start" });
  }
  function open(id, stop) {
    keep(SEEN, "1");
    return load().then(function () {
      if (!state.el) build();
      state.el.hidden = false;
      requestAnimationFrame(function () { state.el.classList.add("is-on"); });
      show(id || ROOM_TAB[document.body.dataset.tab] || recall(LAST) || "start", stop);
    }).catch(function (e) { console.warn("the guide could not be read:", e.message); });
  }
  function close() { if (!state.el) return; state.el.classList.remove("is-on"); state.el.hidden = true; }
  // HERESY 1166: another language: the guide read again in it, the open one shown again on the same tab
  window.addEventListener("ruach-lang", function () {
    if (!state.el || state.el.hidden) { state.tabs = null; state.loading = null; return; }
    var on = state.el.querySelector(".hg-tabs [aria-selected=true]"), id = on ? on.dataset.hgTab : null;
    load().then(function () { show(id); }).catch(function () { /* stays as it was */ });
  });

  function init() {
    var b = $("guideOpen"), m = $("guideOpenMenu");
    if (b) b.addEventListener("click", function () { open(); });
    if (m) m.addEventListener("click", function () { open(); });
    // HERESY 1169 · 1250 (Viktor 08.10.2026: «Можешь устроить перехват браузерного F1 для вывода Гайда? Это же логичное F1. Нахер нам
    // браузерный Help. А если нет, то Shift+F1, а в Electron'е F1»): F1, and Shift+F1, open the guide on the room you are in and close it
    // again; the browser's own help does not come
    document.addEventListener("keydown", function (e) {
      if (e.key !== "F1" || e.ctrlKey || e.altKey || e.metaKey) return;
      e.preventDefault();
      e.stopPropagation();
      if (state.el && !state.el.hidden) close(); else open();
    }, true);
    // a browser that has never seen the studio: the guide comes by itself, once, a minute after the start
    if (!recall(SEEN)) setTimeout(function () { if (!recall(SEEN)) open("start"); }, 60000);
  }
  window.HeresyGuide = { open: open, close: close };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
