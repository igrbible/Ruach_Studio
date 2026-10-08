// HERESY 1148: the page in the user's language (Viktor, 01.10 and 03.10.2026). English is the page's own text and the
// default; Russian, Ukrainian, Belarusian, Greek, Spanish and Italian come from catalogs keyed by that English
// (heresy-i18n-LANG.js), so no module has to change to be translated: the text people read (text nodes, and the title,
// placeholder, aria-label, data-tip and alt attributes) is looked up as it appears, and again when the language changes.
// No RTL: Hebrew is left out (Viktor: «не будем мучить интерфейс с перекладкой в RTL. Получится уродство»); Chinese was
// made and called off (Viktor, 03.10.2026: «Отмена по китайской»).
//
// The choice is the yue2.lang key: heresy-settings.js mirrors it into user/settings.json and reads it back before this
// runs, so F5 and a cleared browser keep the language. The head script hides the page for the moment the first pass
// takes (html.i18n-wait), so a reload does not flash English first.
//
// Never translated: what is under [translate="no"] (what the user wrote: titles, lyrics, notes, the log), the insides of
// script, style, textarea, code and pre, SVG (the logo has its own words, below), and any text the catalog lacks: it stays
// English, whole, rather than half translated. A catalog key may hold {0}…{9} for the parts that change (names, numbers);
// {#0}…{#9} take a number only, so "{#0} MB" never swallows a longer text that happens to end in MB. What a part holds is
// looked up too (a known word, or another pattern), and a translation may be the plural forms of its language
// ({ one, few, many, other }, chosen by Intl.PluralRules on the key's first number): 1 трек, 2 трека, 5 треков.
(function () {
  "use strict";

  var LANGS = [
    { code: "en", name: "English", html: "en" },
    { code: "ru", name: "Русский", html: "ru" },
    { code: "uk", name: "Українська", html: "uk" },
    { code: "be", name: "Беларуская", html: "be" },
    { code: "el", name: "Ελληνικά", html: "el" },
    { code: "es", name: "Español", html: "es" },
    { code: "it", name: "Italiano", html: "it" }
  ];
  var KEY = "yue2.lang", ATTRS = ["title", "placeholder", "aria-label", "data-tip", "alt", "data-tip-head"];   // 1168: a tip's first line
  var SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, CODE: 1, PRE: 1, NOSCRIPT: 1, TEMPLATE: 1 };
  // what the user wrote or the machine said, kept as it is whatever its words: take titles and styles, notes, workspace
  // names, the logs, the Writer's documents, the cheat-sheet's style words and probe prompts (they go into a style)
  var KEEP = ".take-title, .take-style, .coll-title-text, .peek-title, .peek-style, .peek-note, .pb-sub, .coll-badge.w, " +
             "#logBody, #logDockBody, #logDockLast, .wr-item-title, .wr-take-title, .hi-tag, .hi-prompt";
  var XHTML = "http://www.w3.org/1999/xhtml";
  var CAT = {}, PAT = {}, lang = "en", observer = null;
  // a number as the page writes it: 24576, 24,576, 24.576, 24 576. HERESY 1166: numbers follow the page's language, and the
  // no-break space of 24 576 is a plain one once norm() has run, so a plain space may part groups of three
  var NUM = "[-+]?\\d[\\d.,  ]*(?: \\d{3}(?!\\d)[\\d.,  ]*)*", NUM_RE = new RegExp("^" + NUM + "$");
  var MISS = null, CUR = "";  // HERESY 1165: what the catalog lacks while RuachI18n.collect(true) is on, and where (a translator's tool)
  function where(el, attr) {   // the element as a short path: tag.class#id < its parent < its grandparent
    var out = [];
    for (var e = el, i = 0; e && e.nodeType === 1 && i < 3; e = e.parentNode, i++) {
      out.push(e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") + (typeof e.className === "string" && e.className ? "." + e.className.trim().split(/\s+/).slice(0, 2).join(".") : ""));
    }
    return out.join(" < ") + (attr ? " @" + attr : "");
  }
  var SRC = new WeakMap();    // text node -> its English
  var MINE = new WeakMap();   // text node -> what this module last wrote into it
  var SRCA = new WeakMap();   // element -> { attribute: its English }
  var MINEA = new WeakMap();  // element -> { attribute: what this module last wrote }

  function known(code) { return LANGS.some(function (l) { return l.code === code; }); }
  function norm(s) { return String(s).replace(/\s+/g, " ").trim(); }   // the page source's line breaks and indents do not count
  function recall() { try { return localStorage.getItem(KEY) || ""; } catch (e) { return ""; } }
  // HERESY 1167 (Viktor: «авто обнаружение языка браузера при первом посещении или сброшенных куках»): no language kept
  // (a first visit, a cleared browser): the browser's own languages in their order, the first the page has; else English
  function detect() {
    var want = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || "en"];
    for (var i = 0; i < want.length; i++) {
      var code = String(want[i] || "").toLowerCase().split("-")[0];
      if (LANGS.some(function (l) { return l.code === code; })) return code;
    }
    return "en";
  }

  // ---- the catalogs
  function add(code, table) {
    var cat = CAT[code] || (CAT[code] = Object.create(null)), pat = PAT[code] || (PAT[code] = []);
    Object.keys(table).forEach(function (raw) {
      var en = norm(raw);
      if (/\{#?\d\}/.test(en)) {
        var re = "^" + en.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
          .replace(/\\\{#(\d)\\\}/g, "(?<p$1>" + NUM + ")")      // HERESY 1165: a number only
          .replace(/\\\{(\d)\\\}/g, "(?<p$1>[\\s\\S]+?)") + "$";
        // the longest fixed piece of the key: a text without it cannot match, so most texts skip the expression
        var lit = en.split(/\{#?\d\}/).sort(function (a, b) { return b.length - a.length; })[0];
        pat.push({ re: new RegExp(re), lit: lit, fixed: en.replace(/\{#?\d\}/g, "").length, out: table[raw] });
      } else {
        cat[en] = typeof table[raw] === "string" ? table[raw] : (table[raw] || {}).other || "";   // forms need a number
      }
    });
    // HERESY 1166: the pattern with more fixed words first, so "Song complete — {0}" does not take a text that has its
    // own longer pattern ("Song complete — {0} ({#1} takes)")
    pat.sort(function (a, b) { return b.fixed - a.fixed; });
  }
  // HERESY 1165: a translation given as its language's plural forms; the count is the first number among the parts
  var RULES = {};
  function plural(out, m, code) {
    if (typeof out === "string") return out;
    var n = NaN;
    for (var i = 0; i < 10 && isNaN(n); i++) {
      var v = m.groups["p" + i];
      if (v !== undefined && NUM_RE.test(v)) n = Number(v.replace(/[\s,]/g, ""));
    }
    var html = (LANGS.filter(function (l) { return l.code === code; })[0] || {}).html || code, form = "other";
    try { form = isNaN(n) ? "other" : (RULES[html] || (RULES[html] = new Intl.PluralRules(html))).select(n); } catch (e) { /* no rules: other */ }
    return out[form] !== undefined ? out[form] : out.other !== undefined ? out.other : out.many || out.one || "";
  }
  // the English for this language, or null when the catalog has none; the parts of a pattern are looked up in turn
  // (a word, or a pattern of their own, three deep), and kept as they are when the catalog does not know them
  function look(en, code, depth) {
    var c = code || lang, cat = CAT[c];
    if (!cat || !en) return null;
    en = norm(en);
    if (cat[en] !== undefined) return cat[en];
    var pats = PAT[c] || [];
    for (var i = 0; i < pats.length; i++) {
      if (pats[i].lit && en.indexOf(pats[i].lit) < 0) continue;
      var m = pats[i].re.exec(en);
      if (m) return plural(pats[i].out, m, c).replace(/\{#?(\d)\}/g, function (_, n) {
        var v = m.groups["p" + n];
        if (v === undefined) return "";
        var inner = (depth || 0) < 3 ? look(v, c, (depth || 0) + 1) : null;
        return inner === null ? v : inner;
      });
    }
    return null;
  }
  // a whole string with its own spaces kept: "  Save " -> "  Сохранить "
  function render(en) {
    if (lang === "en") return en;
    var m = /^(\s*)([\s\S]*?)(\s*)$/.exec(en), tr = m[2] ? look(m[2]) : null;
    // HERESY 1169 · 1247: the page draws a warning's ⚠ apart (app.js .warn-ico) and writes its words alone; the catalog keeps them
    // under «⚠ …», so they are looked up there and given back without the sign
    if (tr === null && m[2] && m[2].charAt(0) !== "\u26a0") {
      var signed = look("\u26a0 " + m[2]);
      if (signed !== null) tr = signed.replace(/^\u26a0\ufe0f?[ \u00a0]?/, "");
    }
    if (tr === null && MISS && /[A-Za-z]{2}/.test(m[2])) { var k = norm(m[2]); if (!MISS.has(k)) MISS.set(k, CUR); }
    return tr === null ? en : m[1] + tr + m[3];
  }
  function t(en) { return lang === "en" ? en : render(String(en)); }

  // ---- the page
  function skipped(node) {
    for (var el = node.nodeType === 1 ? node : node.parentNode; el && el.nodeType === 1; el = el.parentNode) {
      if (SKIP[el.tagName] || el.namespaceURI !== XHTML || el.getAttribute("translate") === "no" || el.isContentEditable || el.matches(KEEP)) return true;
    }
    return false;
  }
  function source(node) {             // its English: what was seen, unless the page wrote something new since
    var mine = MINE.get(node);
    return mine !== undefined && mine === node.nodeValue && SRC.has(node) ? SRC.get(node) : node.nodeValue;
  }
  function doText(node) {
    if (MISS) CUR = where(node.parentNode);
    var en = source(node);
    SRC.set(node, en);
    var out = render(en);
    if (node.nodeValue !== out) node.nodeValue = out;
    MINE.set(node, out);
  }
  function doAttr(el, a) {
    var v = el.getAttribute(a);
    if (v === null) return;
    var mine = MINEA.get(el), src = SRCA.get(el);
    var en = mine && mine[a] === v && src && src[a] !== undefined ? src[a] : v;
    if (!src) SRCA.set(el, src = {});
    if (!mine) MINEA.set(el, mine = {});
    src[a] = en;
    if (MISS) CUR = where(el, a);
    var out = render(en);
    if (out !== v) el.setAttribute(a, out);
    mine[a] = out;
  }
  function doElement(el) {
    for (var i = 0; i < ATTRS.length; i++) if (el.hasAttribute(ATTRS[i])) doAttr(el, ATTRS[i]);
  }
  function walk(root) {
    if (root && root.tagName === "TEXTAREA") { if (root.parentNode && !skipped(root.parentNode) && !root.matches(KEEP)) doElement(root); return; }
    if (!root || skipped(root)) return;
    if (root.nodeType === 3) { if (/\S/.test(root.nodeValue)) doText(root); return; }
    if (root.nodeType !== 1) return;
    doElement(root);
    var w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        if (n.nodeType === 1 && n.tagName === "TEXTAREA" && !n.matches(KEEP)) { doElement(n); return NodeFilter.FILTER_REJECT; }   // its words, not its text
        if (n.nodeType === 1) return SKIP[n.tagName] || n.namespaceURI !== XHTML || n.getAttribute("translate") === "no" || n.isContentEditable || n.matches(KEEP)
          ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
        return /\S/.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
    });
    for (var n = w.nextNode(); n; n = w.nextNode()) {
      if (n.nodeType === 3) doText(n); else doElement(n);
    }
  }
  function onMutations(records) {
    records.forEach(function (r) {
      if (r.type === "childList") {
        for (var i = 0; i < r.addedNodes.length; i++) {
          var n = r.addedNodes[i];
          if (n.isConnected && !skipped(n.nodeType === 1 ? n.parentNode || n : n)) walk(n);
        }
      } else if (r.type === "characterData") {
        if (r.target.isConnected && /\S/.test(r.target.nodeValue) && !skipped(r.target)) doText(r.target);
      } else if (r.type === "attributes") {
        var host = r.target.tagName === "TEXTAREA" ? r.target.parentNode : r.target;   // a textarea's own words translate
        if (r.target.isConnected && !skipped(host)) doAttr(r.target, r.attributeName);
      }
    });
    if (observer) observer.takeRecords();      // what this pass wrote is not new English
  }
  function watch(on) {
    if (on && !observer) {
      observer = new MutationObserver(onMutations);
      observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    } else if (!on && observer) {
      observer.disconnect();
      observer = null;
    }
  }

  // ---- the logo's words (HERESY 1148, Viktor: «В русском РУАХ СТУДИЯ, укр. РУАХ СТУДІЯ, греч. ΠΝΕΥΜΑ ΣΤΟΥΝΤΙΟ, и т.п.
  // но никаких spirit»): the woman and the cloud stay where they are; the words, their block and the frame change
  // (heresy-logo-words.js, made by src/brand/make_words.py). English is the page's own drawing, kept to come back to.
  var logoEn = null;
  function paintLogo() {
    var svg = document.querySelector(".brand .brand-full");
    if (!svg) return;
    var word = svg.querySelector(".rl-word path"), box = svg.querySelector(".rl-box"), studio = svg.querySelector(".rl-studio path");
    if (!word || !box || !studio) return;
    if (!logoEn) logoEn = { vb: svg.getAttribute("viewBox"), wd: word.getAttribute("d"), wt: word.getAttribute("transform"),
                            bx: box.getAttribute("x"), bw: box.getAttribute("width"), sd: studio.getAttribute("d"), st: studio.getAttribute("transform"),
                            name: (document.querySelector(".brand-logo") || {}).getAttribute ? document.querySelector(".brand-logo").getAttribute("aria-label") : "" };
    var L = (window.RUACH_LOGO_WORDS || {})[lang];
    var g = L ? { vb: L.viewBox, wd: L.word.d, wt: L.word.transform, bx: L.box.x, bw: L.box.width, sd: L.studio.d, st: L.studio.transform, name: L.name } : logoEn;
    svg.setAttribute("viewBox", g.vb);
    word.setAttribute("d", g.wd); word.setAttribute("transform", g.wt);
    box.setAttribute("x", g.bx); box.setAttribute("width", g.bw);
    studio.setAttribute("d", g.sd); studio.setAttribute("transform", g.st);
    var holder = document.querySelector(".brand-logo");
    if (holder && g.name) holder.setAttribute("aria-label", g.name);
    copyLogo(svg, g.name);
  }
  // HERESY 1166 (Viktor: «В Engine логотип заменить»): the About card shows the bar's own logo, its words in the page's
  // language, a copy made again whenever they change; its ids renamed, so the bar's logo hidden (the compact one showing)
  // takes none of the copy's gradients with it. HERESY 1167: the veil's too, while the page boots under it (index.html)
  function copyLogo(svg, name) {
    [["aboutLogo", "about-mark", "-about"], ["bootLogo", "boot-mark", "-boot"]].forEach(function (s) {
      var spot = document.getElementById(s[0]);
      if (!spot) return;
      var c = svg.cloneNode(true);
      c.classList.remove("brand-full");
      c.classList.add(s[1]);
      Array.prototype.forEach.call(c.querySelectorAll("[id]"), function (el) { el.id = el.id + s[2]; });
      Array.prototype.forEach.call(c.querySelectorAll("*"), function (el) {
        Array.prototype.forEach.call(el.attributes, function (a) {
          if (a.value.indexOf("#rl") >= 0) el.setAttribute(a.name, a.value.replace(/#(rl[A-Za-z]+)/g, "#$1" + s[2]));
        });
      });
      spot.replaceChildren(c);
      if (name) spot.setAttribute("aria-label", name);
    });
  }

  // HERESY 1166: numbers and dates in the page's language, not the browser's (24 576 in Russian, 24,576 in English); a
  // language the browser cannot format (Chrome has no Belarusian dates) borrows its neighbour's: the same 24 576 and
  // 02.10.2026. borrowed() tells a date with a month name to go numeric, so no neighbour's month names show.
  var BORROW = { be: "ru" };
  function locales() {
    var html = (LANGS.filter(function (l) { return l.code === lang; })[0] || {}).html || "en";
    return BORROW[lang] ? [html, BORROW[lang]] : [html];
  }
  function borrowed() {
    try { return !!BORROW[lang] && Intl.DateTimeFormat.supportedLocalesOf([locales()[0]]).length === 0; } catch (e) { return false; }
  }

  // ---- the language
  function apply(code) {
    lang = known(code) && (code === "en" || CAT[code]) ? code : "en";
    var html = document.documentElement, info = LANGS.filter(function (l) { return l.code === lang; })[0];
    html.lang = info.html;
    watch(false);
    walk(document.body);                     // every node back to its English, then into the language
    if (lang !== "en") watch(true);          // English needs no watching: what the page writes is already it
    paintLogo();
    html.classList.remove("i18n-wait");
    var btn = document.getElementById("langButton");
    if (btn) btn.textContent = lang.toUpperCase();
    window.dispatchEvent(new CustomEvent("ruach-lang", { detail: { lang: lang } }));
  }
  function set(code) {
    if (!known(code)) return;
    try { localStorage.setItem(KEY, code); } catch (e) { /* storage off: this page only */ }
    apply(code);
  }
  // the English an element shows, whatever language it is shown in (for code that reads its own buttons back)
  function en(el) {
    if (!el) return "";
    var out = "", w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (var n = w.nextNode(); n; n = w.nextNode()) out += source(n);
    return out;
  }
  // HERESY 1166: the same for one of its attributes (code that moves a tip elsewhere moves its English)
  function enAttr(el, a) {
    var v = el ? el.getAttribute(a) : null;
    if (v === null) return "";
    var mine = MINEA.get(el), src = SRCA.get(el);
    return mine && mine[a] === v && src && src[a] !== undefined ? src[a] : v;
  }

  // ---- the bar's button: the language's own two letters; its menu, each language in its own words
  function menu() {
    var btn = document.getElementById("langButton");
    if (!btn) return;
    btn.textContent = lang.toUpperCase();
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      var r = btn.getBoundingClientRect();
      if (!window.HeresyMenu) return;
      window.HeresyMenu.open(r.left, r.bottom + 4, LANGS.filter(function (l) { return l.code === "en" || CAT[l.code]; }).map(function (l) {
        return { label: l.name, checked: l.code === lang, hint: l.code.toUpperCase(), action: function () { set(l.code); } };
      }));
      var menus = document.querySelectorAll(".hm-menu");           // each language keeps its own name in any language
      if (menus.length) menus[menus.length - 1].setAttribute("translate", "no");
    });
  }

  // HERESY 1164: a translator's tool: collect(true) counts every English text shown that the language's catalog lacks
  // (the page walked again at once, then whatever appears), misses() lists them; collect(false) stops
  function collect(on) { MISS = on ? new Map() : null; if (on && lang !== "en") apply(lang); }
  function misses() { return MISS ? Array.from(MISS.entries()) : []; }   // [English, where it was seen first]

  window.RuachI18n = { add: add, t: t, set: set, en: en, enAttr: enAttr, lang: function () { return lang; }, langs: LANGS, look: look, paintLogo: paintLogo,
                       collect: collect, misses: misses, locales: locales, borrowed: borrowed, start: function () { menu(); apply(recall() || detect()); } };
})();
