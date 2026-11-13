// HERESY 1096 (Viktor, 02.10.2026): the Studio's own guide, room by room, in the Studio itself. The ? in the bar
// (and Guide in the ☰) opens it on the room you are in; a browser that has never seen the Studio gets it by
// itself a minute after the first start ("so the user sees that somebody took care of them, not just a hard tool").
// One source: docs/GUIDE.md (the repository's guide too), served by the lab at /lab/guide/; every "## " is a
// tab, every "### " a stop in the tab's own contents; pictures from docs/guide/, a click shows one large.
// HERESY 1166: in the page's language when docs/GUIDE.<lang>.md is there (else the English); a translated heading ends
// in <!-- #id --> (or {#id}), the English heading's own id, so open(tab, stop) finds the same place in every language.
(function () {
  "use strict";

  var SEEN = "yue2.guideSeen", LAST = "yue2.guideTab";
  var ROOM_TAB = { create: "creator", write: "writer", post: "refiner", artist: "artist", video: "videographer", collection: "librarian", train: "lora" };   // HERESY 1255: the Artist; 2292: the Videographer
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
    state.tabs = parts.map(tabOf);
  }
  // HERESY 2292 (Viktor 09.11.2026: «Записывай в Хелп F1. Раздел Чтеца там не завёл ещё? Пора»): a room a module brings (the Reader, kept
  // home until it is turnkey) brings its own part of the guide: window.RuachRooms[room].guide names docs/<guide>.md (and .<lang>.md), its
  // tabs stand after the tab guideAfter names; a page without the module reads none, and the public guide never names the room
  function roomParts() {
    var rooms = window.RuachRooms || {};
    return Object.keys(rooms).map(function (k) { return rooms[k]; }).filter(function (r) { return r && /^[\w-]+$/.test(r.guide || ""); });
  }
  function addPart(md, after) {
    var tabs = md.split(/\n(?=## )/).filter(function (p) { return /^## /.test(p); }).map(tabOf), at = -1;
    state.tabs.forEach(function (t, i) { if (t.id === after) at = i; });
    Array.prototype.splice.apply(state.tabs, [at < 0 ? state.tabs.length : at + 1, 0].concat(tabs));
  }
  function tabOf(p) {
      var hd = heading(p.match(/^##\s+(.*)$/m)[1]), name = hd.text, body = p.replace(/^##\s+.*$/m, "");
      var stops = (body.match(/^###\s+.*$/gm) || []).map(function (h) { return heading(h.replace(/^###\s+/, "")); });
      var id = ANCHOR.test(p.match(/^##\s+(.*)$/m)[1]) ? hd.id : slug(name.replace(/^[^\w]+/, "")).split("-")[0] || slug(name);
      return { id: id, name: name, html: render(body), stops: stops };
  }
  function load() {
    var lang = pageLang();
    if (state.tabs && state.lang === lang) return Promise.resolve();
    if (state.lang !== lang) { state.tabs = null; state.loading = null; state.lang = lang; }
    var get = function (file) { return fetch("/lab/guide/" + file).then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); }); };
    // HERESY 2413 (Viktor 11.11.2026, 27: «Пока что пусть F1 для иврита будет на английском»): a language with no guide of its own reads the English
    // one, and the guide then says it is English (lang, and left to right in a page that reads right to left)
    if (!state.loading) state.loading = (lang === "en" ? get("GUIDE.md").then(function (t) { state.mdLang = "en"; return t; })
        : get("GUIDE." + lang + ".md").then(function (t) { state.mdLang = lang; return t; }, function () { state.mdLang = "en"; return get("GUIDE.md"); }))
      .then(function (md) {
        var more = roomParts().map(function (r) {     // HERESY 2292: a module's own part, in the page's language else the English, none when unread
          return (lang === "en" ? get(r.guide + ".md") : get(r.guide + "." + lang + ".md").catch(function () { return get(r.guide + ".md"); }))
            .then(function (t) { return { md: t, after: r.guideAfter }; }, function () { return null; });
        });
        return Promise.all(more).then(function (xs) {
          if (state.lang !== lang) return;
          parse(md);
          xs.forEach(function (x) { if (x) addPart(x.md, x.after); });
        });
      })
      .catch(function (e) { state.loading = null; throw e; });   // HERESY 1670: a failed read is not kept: the next open reads again
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
      // HERESY 1455 (Viktor 15.10.2026: «То же самое можно сделать и с F1 гайдом»): the parts in a column at the left, as the Engine's tabs,
      // the open part's stops under its own tab; the text beside them
      '<div class="hg-main"><nav class="hg-side" aria-label="The Guide"><div class="hg-tabs" role="tablist" aria-orientation="vertical"></div></nav>' +
      '<article class="hg-body" translate="no"></article></div></div>' +
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
    var box = el.querySelector(".hg-box"), ml = state.mdLang || "en";   // HERESY 2413: the guide's own language and direction, whatever the page's
    var mdDir = ((window.RuachI18n && window.RuachI18n.langs || []).filter(function (l) { return l.code === ml; })[0] || {}).dir || "ltr";
    box.setAttribute("lang", ml); box.setAttribute("dir", mdDir); box.dataset.guideLang = ml;
    el.querySelector(".hg-title").textContent = state.title;
    el.querySelector(".hg-lead").textContent = state.lead.replace(/[*_`]/g, "").split("\n")[0];
    el.querySelector(".hg-tabs").innerHTML = state.tabs.map(function (t) {
      return '<button type="button" role="tab" translate="no" data-hg-tab="' + esc(t.id) + '" class="' + (t === tab ? "is-on" : "") + '" aria-selected="' + (t === tab) + '">' + inline(t.name) + "</button>" +
        (t === tab && t.stops.length ? '<div class="hg-stops" role="group" aria-label="In this part">' +   // HERESY 1455: under its own tab
          t.stops.map(function (s) { return '<button type="button" translate="no" data-hg-stop="' + esc(s.id) + '">' + inline(s.text) + "</button>"; }).join("") + "</div>" : "");
    }).join("");
    var onTab = el.querySelector(".hg-tabs .is-on");
    if (onTab && onTab.scrollIntoView) onTab.scrollIntoView({ block: "nearest" });
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
      var room = (window.RuachRooms || {})[document.body.dataset.tab];   // HERESY 2292: a module's room names its own tab
      show(id || ROOM_TAB[document.body.dataset.tab] || (room && room.guideTab) || recall(LAST) || "start", stop);
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
    // a browser that has never seen the Studio: the guide comes by itself, once, a minute after the start
    if (!recall(SEEN)) setTimeout(function () { if (!recall(SEEN)) open("start"); }, 60000);
  }
  window.HeresyGuide = { open: open, close: close, render: render };   // HERESY 2281: its Markdown for Before and after's page too
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
