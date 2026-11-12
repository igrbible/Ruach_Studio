// HERESY 2331 (Viktor 06.11.2026: «По Студии ивритом сам займешься после среза 2.0.6»; the 2.0.7 plan: Hebrew in the interface, right to left,
// «Время в DAW, плеере и Видеографе остаётся слева направо, как в Logic на иврите»): the page right to left while its language writes so.
// heresy-i18n.js sets <html dir="rtl"> for such a language (its LANGS entry says dir) and "ltr" for every other, and says so with ruach-lang;
// flex rows, grids and inline text then mirror by themselves. What does not is the stylesheets' own sides: margin-left, padding-right, left: 0,
// a border on one side, float, text-align: left, a corner's radius, a translateX that centres or slides. While the page reads right to left,
// each such rule has its two sides swapped in place, in the page's own sheets and in those the rooms add later, so the cascade stays the one
// the page was written with, mirrored; back to a language that reads left to right, every swapped value is put back as it was. Left to right
// stays what runs in time or in space: the player, the wave and its scope, the DAW, the piano roll, the score, the spectrum, the Refiner's
// canvas, the Videographer's timeline, the sliders and knobs, the lyrics' box with its mirrors and gutter, the logs and code: their rules are
// never swapped and their boxes say ltr. What the user writes (titles, styles, notes, a field's text) takes its direction from its own first
// letters (unicode-bidi: plaintext), so a Latin style reads from the left inside a Hebrew page and a Hebrew title from the right.
(function () {
  "use strict";
  // the boxes that keep left to right whatever the page's direction, and the marks their rules carry (a rule naming one is never swapped)
  var LTR_BOXES = [
    ".playbar",                                                     // the player: transport, time and its scrubber
    "#wave", ".wave-wrap", ".loud-wave", ".boot-line",              // the take's wave, its scope, the veil's trace
    "#postCanvas", ".pcv-world",                                    // the Refiner's canvas of nodes
    ".mxl-back", ".roll-back", ".vp",                               // the lifted mixer (the DAW's desk), the piano roll, the video player
    "#tlScroll", "#tlWave", ".tl-bar", ".tl-scroll",                // the Videographer's timeline
    ".roll", "#scoreStaff", "#scoreAbc", ".abcjs-container",        // the piano roll and the score
    "#spectrumPanel", ".spec-bar",                                  // the spectrum
    ".coll-realm",                                                  // the realms' switch (Musician on the left, Narrator on the right: its tip says so)
    ".lyr-big", ".lyr-txt", ".lyr-mirror", ".lyr-tagsl", ".tc-mirror", "#lyrics", "#lyricsMeter", ".lyr-meter",   // the lyrics' box and its mirrors
    "#logBody", "#logDockBody", ".log-dock-body", "#logDockLast", ".log-dock-last", "#wtLog", "#tpTestLog",       // the logs
    ".knobs", ".tr-knobs", ".ar-knobs", ".gt-knobs", "#trKnobs"                                                     // the knobs
  ];
  var KEEP_MARK = /\.playbar|#wave|\.wave-wrap|\.loud-wave|\.boot-|\.pcv|#postCanvas|\.post-canvas|\.mxl?-|\.vp\b|\.vp-|#tl[A-Z]|\.tl-|\.roll|#roll|#scoreStaff|#scoreAbc|\.abcjs|#spectrumPanel|\.spec-|\.coll-realm|\.rs-|\.lyr-|\.tc-mirror|#lyrics|#logBody|#logDockBody|#logDockLast|\.log-dock-body|\.log-dock-last|#wtLog|#tpTestLog|knobs|input\[type=.?range/;
  // what the user wrote, or the machine said, shown as it is: its own direction from its first letters (heresy-i18n.js keeps the same untranslated)
  var OWN_TEXT = [".take-title", ".take-style", ".coll-title-text", ".peek-title", ".peek-style", ".peek-note", ".pb-sub", ".coll-badge.w",
    ".wr-item-title", ".wr-take-title", ".hi-tag", ".hi-prompt", "textarea", "input[type=text]", "input[type=search]", "input:not([type])",
    "[contenteditable]", "[translate=no]"];
  var STYLE = [
    // the boxes that run in time or space keep left to right (their words still read in their own direction inside)
    LTR_BOXES.map(function (s) { return "html[dir=rtl] " + s; }).join(", ") + " { direction: ltr; }",
    "html[dir=rtl] input[type=range] { direction: ltr; }",
    // code, keys and paths read left to right, set apart from the sentence around them
    "html[dir=rtl] :is(code, kbd, samp, pre) { direction: ltr; unicode-bidi: isolate; }",
    // what the user wrote: its own direction; shown (not edited) it keeps the column's side, as a Latin subject in a Hebrew mail list does,
    // unless the page aligns it otherwise (zero weight: any rule of the page's own wins)
    "html[dir=rtl] :is(" + OWN_TEXT.join(", ") + ") { unicode-bidi: plaintext; }",
    ":where(html[dir=rtl]) :where(" + OWN_TEXT.slice(0, 12).join(", ") + ") { text-align: match-parent; }",
    // a title of the user's as a heading (the take's, beside its ▶): on the page's side, its own direction inside
    "html[dir=rtl] :is(h1, h2, h3, h4)[translate=no] { text-align: match-parent; }",
    "html[dir=rtl] :is(textarea, input[type=text], input[type=search], input:not([type])) { text-align: start; }",
    // the dropdowns' drawn chevron (app.css, HERESY 1058) on the side the text ends, its room there (the padding is swapped with the rest)
    "html[dir=rtl] select, html[dir=rtl] select:focus { background-position: 9px 52%, 14px 52%; }"
  ].join("\n");

  // ---- the sides swapped in place, a rule's declarations as written (its cssText, in order): a property of one side renamed to the other's
  // (margin-left ↔ margin-right, border-left ↔ border-right with its longhands, left ↔ right, a corner's radius…), a four-value shorthand's
  // second and fourth swapped, a radius' corners pairwise, left ↔ right in float, clear and text-align, a translateX negated; kept in the
  // written order, so a later declaration still wins over an earlier one (border: 1px …; border-left-width: 3px stays the accent on its side,
  // mirrored), and a shorthand written with var() is swapped as text. Put back as the page wrote it, the rule's own text
  var SIDE = { "margin-left": "margin-right", "padding-left": "padding-right", "left": "right", "border-left": "border-right",
    "border-left-width": "border-right-width", "border-left-style": "border-right-style", "border-left-color": "border-right-color",
    "border-top-left-radius": "border-top-right-radius", "border-bottom-left-radius": "border-bottom-right-radius",
    "scroll-padding-left": "scroll-padding-right", "scroll-margin-left": "scroll-margin-right" };
  Object.keys(SIDE).forEach(function (k) { SIDE[SIDE[k]] = k; });
  var FOUR = { "margin": 1, "padding": 1, "border-width": 1, "border-style": 1, "border-color": 1, "inset": 1, "scroll-margin": 1, "scroll-padding": 1 };
  var WORDS = { "float": 1, "clear": 1, "text-align": 1 };
  var MAY = /left|right|margin|padding|border|inset|float|clear|translate|rotate/;   // a rule that has none of these is left unread
  var saved = [];                  // [style, family, its declarations as the page wrote them], to put back
  var swapped = new WeakSet();     // the rules swapped now
  var on = false;

  // a value's top-level words ("0 calc(1px + 2px) 0 var(--x)" → four), or its top-level pieces by another separator (";" "," "/")
  function split(v, sep) {
    var out = [], depth = 0, cur = "", q = "";
    for (var i = 0; i < v.length; i++) {
      var c = v.charAt(i);
      if (q) { cur += c; if (c === q && v.charAt(i - 1) !== "\\") q = ""; continue; }
      if (c === '"' || c === "'") { q = c; cur += c; continue; }
      if (c === "(") depth++;
      if (c === ")") depth--;
      if (depth === 0 && (sep === " " ? /\s/.test(c) : c === sep)) { if (cur.trim() || sep !== " ") out.push(sep === " " ? cur : cur); cur = ""; } else cur += c;
    }
    if (cur.trim() || (sep !== " " && cur)) out.push(cur);
    return sep === " " ? out.filter(function (w) { return w.trim(); }) : out;
  }
  function turnWord(v) { return v.replace(/\b(left|right)\b/g, function (w) { return w === "left" ? "right" : "left"; }); }
  // translateX(a) and translate(a, b): the a negated (a centring left: 50% + translateX(-50%) becomes right: 50% + translateX(50%))
  function turnTransform(v) {
    var neg = function (a) {
      a = a.trim();
      if (/^-?0(px|%)?$/.test(a)) return a;
      if (/^-[\d.]/.test(a)) return a.slice(1);
      return /^[\d.]/.test(a) ? "-" + a : "calc(-1 * " + a + ")";       // var() and calc() as a product
    };
    return v.replace(/translateX\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g, function (_, a) { return "translateX(" + neg(a) + ")"; })
            .replace(/translate\(([^,()]*(?:\([^()]*\)[^,()]*)*),/g, function (_, a) { return "translate(" + neg(a) + ","; })
            .replace(/translate3d\(([^,()]*(?:\([^()]*\)[^,()]*)*),/g, function (_, a) { return "translate3d(" + neg(a) + ","; })
            .replace(/translate\(([^,()]*(?:\([^()]*\)[^,()]*)*)\)/g, function (_, a) { return "translate(" + neg(a) + ")"; });
  }
  function radius(v) {             // the corners pairwise: a b c d → b a d c (each half of an elliptical a b / c d)
    return split(v, "/").map(function (half) {
      var w = split(half, " ");
      if (w.length === 2) w = [w[1], w[0]];
      else if (w.length === 3) w = [w[1], w[0], w[1], w[2]];
      else if (w.length === 4) w = [w[1], w[0], w[3], w[2]];
      return w.join(" ");
    }).join(" / ");
  }
  // one declaration "prop: value !important" mirrored, or as it is
  function mirror(decl, chev) {
    var c = decl.indexOf(":");
    if (c < 0) return decl;
    var prop = decl.slice(0, c).trim(), rest = decl.slice(c + 1), imp = "", m = /\s*!\s*important\s*$/i.exec(rest);
    if (prop.indexOf("--") === 0) return decl;                   // a custom property: its words are its own
    if (m) { imp = " !important"; rest = rest.slice(0, m.index); }
    var v = rest.trim(), low = prop.toLowerCase(), w;
    if (SIDE[low]) return SIDE[low] + ": " + v + imp;
    if (FOUR[low]) { w = split(v, " "); return w.length === 4 ? low + ": " + [w[0], w[3], w[2], w[1]].join(" ") + imp : decl; }
    if (low === "border-radius") return low + ": " + radius(v) + imp;
    if (WORDS[low]) return low + ": " + turnWord(v) + imp;
    if (low === "transform") {
      // a fold's chevron is a CSS triangle: its side swapped, it points left folded, and turns the other way to point down open
      if (chev) v = v.replace(/rotate(Z?)\(\s*(-?)([\d.]+)(deg|turn|rad)\s*\)/g, function (_, z, s, n, u) { return "rotate" + z + "(" + (s ? "" : "-") + n + u + ")"; });
      return low + ": " + turnTransform(v) + imp;
    }
    return decl;
  }
  // the families a mirrored declaration belongs to: a family is written again whole, in its own order, mirrored (and put back the same way, as
  // the page wrote it), so no other declaration of the rule is ever parsed again (a transition's serialised delays would not survive that)
  var SIDES = ["top", "right", "bottom", "left"];
  var MEMBERS = {
    margin: ["margin"].concat(SIDES.map(function (s) { return "margin-" + s; })),
    padding: ["padding"].concat(SIDES.map(function (s) { return "padding-" + s; })),
    inset: ["inset"].concat(SIDES),
    border: ["border", "border-width", "border-style", "border-color", "border-image", "border-image-source", "border-image-slice",
      "border-image-width", "border-image-outset", "border-image-repeat"].concat(
      [].concat.apply([], SIDES.map(function (s) { return ["border-" + s, "border-" + s + "-width", "border-" + s + "-style", "border-" + s + "-color"]; }))),
    radius: ["border-radius", "border-top-left-radius", "border-top-right-radius", "border-bottom-right-radius", "border-bottom-left-radius"],
    float: ["float"], clear: ["clear"], "text-align": ["text-align"], transform: ["transform"]
  };
  var FAMILY = {};
  Object.keys(MEMBERS).forEach(function (f) { MEMBERS[f].forEach(function (p) { FAMILY[p] = f; }); });
  function decl(d) {               // "prop: value !important" → [prop, value, "important" or ""]
    var c = d.indexOf(":"), m;
    if (c < 0) return null;
    var prop = d.slice(0, c).trim().toLowerCase(), v = d.slice(c + 1);
    m = /\s*!\s*important\s*$/i.exec(v);
    return [prop, (m ? v.slice(0, m.index) : v).trim(), m ? "important" : ""];
  }
  function write(st, fam, list) {  // the family's declarations again, in their order
    MEMBERS[fam].forEach(function (p) { st.removeProperty(p); });
    list.forEach(function (x) { st.setProperty(x[0], x[1], x[2]); });
  }
  // A shorthand written with var() and partly overridden (border: 1px solid var(--line); border-left-width: 3px) leaves its other longhands
  // pending, and the CSSOM serialises them empty: such a rule's declarations are read from its sheet's own text instead, the rule found by its
  // selector and its place among the rules of that selector (a rule not found there keeps that family as written)
  var SOURCE = new WeakMap();      // sheet → { normalised selector: [its declarations' text, in order] }
  function norm(s) { return String(s).replace(/["'\s]/g, "").replace(/::/g, ":").toLowerCase(); }
  function sourceOf(sheet) {
    if (SOURCE.has(sheet)) return SOURCE.get(sheet);
    var map = {}, node = sheet.ownerNode, src = node && node.tagName === "STYLE" ? node.textContent : "";
    src = src.replace(/\/\*[\s\S]*?\*\//g, " ");
    var i = 0, start = 0, q = "", depth = 0, n = src.length, skip = 0;
    for (; i < n; i++) {
      var c = src.charAt(i);
      if (q) { if (c === q && src.charAt(i - 1) !== "\\") q = ""; continue; }
      if (c === '"' || c === "'") { q = c; continue; }
      if (c === "{") {
        var pre = src.slice(start, i).trim();
        if (/^@(media|supports|layer|container|document|scope)\b/i.test(pre) || skip) { if (skip) skip++; depth++; start = i + 1; continue; }
        if (/^@/.test(pre)) { skip = 1; depth++; start = i + 1; continue; }   // @keyframes, @font-face…: not style rules
        var j = i + 1, qq = "";
        for (; j < n; j++) { var cj = src.charAt(j); if (qq) { if (cj === qq && src.charAt(j - 1) !== "\\") qq = ""; continue; } if (cj === '"' || cj === "'") { qq = cj; continue; } if (cj === "}") break; }
        (map[norm(pre)] = map[norm(pre)] || []).push(src.slice(i + 1, j));
        i = j; start = j + 1;
        continue;
      }
      if (c === "}") { depth--; if (skip) skip--; start = i + 1; }
    }
    SOURCE.set(sheet, map);
    return map;
  }
  var seenSel = null;              // the walk's count of rules met per selector, sheet by sheet (the rule's place among its namesakes)
  function swapRule(rule) {
    var st = rule.style, sel = rule.selectorText || "", key = norm(sel), place = 0;
    if (seenSel) { place = seenSel[key] || 0; seenSel[key] = place + 1; }
    if (!st || swapped.has(rule) || KEEP_MARK.test(sel)) return;
    var text = st.cssText;
    if (!text || !MAY.test(text) || /(^|;)\s*(all|[a-z-]*-(inline|block)[a-z-]*)\s*:/i.test(text)) return;   // logical sides or all: as written
    var list = split(text, ";").map(function (d) { return d.trim(); }).filter(Boolean);
    var pending = list.some(function (d) { var x = decl(d); return x && FAMILY[x[0]] && x[1] === ""; });
    if (pending) {
      var own = rule.parentStyleSheet && sourceOf(rule.parentStyleSheet)[key];
      if (!own || own[place] === undefined) return;               // not found in its sheet's text: as written
      list = split(own[place], ";").map(function (d) { return d.trim(); }).filter(Boolean);
    }
    var chev = /chev/.test(sel), fams = {}, changed = {};
    list.forEach(function (d) {
      var x = decl(d), f = x && FAMILY[x[0]];
      if (!f) return;
      var m = decl(mirror(d, chev));
      (fams[f] = fams[f] || { was: [], now: [] }).was.push(x);
      fams[f].now.push(m);
      if (m[0] !== x[0] || m[1] !== x[1]) changed[f] = 1;
    });
    var touched = Object.keys(changed);
    if (!touched.length) return;
    swapped.add(rule);
    touched.forEach(function (f) { saved.push([st, f, fams[f].was]); write(st, f, fams[f].now); });
  }
  function walkRules(list) {
    for (var i = 0; list && i < list.length; i++) {
      var r = list[i];
      if (r.type === 1) swapRule(r);                              // a style rule
      else if (r.cssRules && r.type !== 7) walkRules(r.cssRules);  // @media, @supports, @layer, @container (never @keyframes)
    }
  }
  function swapSheet(sheet) {
    if (!sheet || (sheet.ownerNode && sheet.ownerNode.id === "rtlStyle")) return;
    seenSel = {};
    try { walkRules(sheet.cssRules); } catch (e) { /* a sheet from elsewhere: not ours to read */ }
    seenSel = null;
  }
  function swapAll() { for (var i = 0; i < document.styleSheets.length; i++) swapSheet(document.styleSheets[i]); }
  function putBack() {
    for (var i = saved.length - 1; i >= 0; i--) write(saved[i][0], saved[i][1], saved[i][2]);
    saved = [];
    swapped = new WeakSet();
  }
  // a room adds its own sheet later (heresy-reader.js, heresy-collection.js…): swapped as it comes while the page reads right to left
  var watcher = new MutationObserver(function (records) {
    if (!on) return;
    records.forEach(function (r) {
      var n = r.target && r.target.nodeType === 1 && r.target.tagName === "STYLE" ? r.target : null;
      if (n) swapSheet(n.sheet);
      for (var i = 0; i < r.addedNodes.length; i++) {
        var a = r.addedNodes[i];
        if (a.nodeType === 1 && (a.tagName === "STYLE" || a.tagName === "LINK")) swapSheet(a.sheet);
        else if (a.nodeType === 3 && a.parentNode && a.parentNode.tagName === "STYLE") swapSheet(a.parentNode.sheet);
      }
    });
  });

  // a field's words take their own direction (unicode-bidi: plaintext, above); its placeholder follows the field's, so a field whose
  // placeholder is Latin (the painter's example prompt, an address, a model's name) says ltr, and a Hebrew one keeps the page's (never in a box
  // that keeps left to right: that one is ltr already)
  var FIELDS = "textarea, input:not([type]), input[type=text], input[type=search], input[type=email], input[type=url]";
  var LTR_SEL = LTR_BOXES.join(", ");
  var LATIN_FIRST = /^[^A-Za-z\u00c0-\u024f\u0370-\u03ff\u0400-\u04ff\u0590-\u05ff]*[A-Za-z\u00c0-\u024f\u0370-\u03ff\u0400-\u04ff]/;
  function autoDir(el) {
    if ((el.hasAttribute("dir") && !el.dataset.rtlAuto) || el.closest(LTR_SEL)) return;
    var ltr = LATIN_FIRST.test(el.getAttribute("placeholder") || "");
    if (ltr && el.getAttribute("dir") !== "ltr") { el.setAttribute("dir", "ltr"); el.dataset.rtlAuto = "1"; }
    else if (!ltr && el.dataset.rtlAuto) { el.removeAttribute("dir"); delete el.dataset.rtlAuto; }
  }
  function fieldsIn(root) {
    if (!root || root.nodeType !== 1) return;
    if (root.matches(FIELDS)) autoDir(root);
    var list = root.querySelectorAll(FIELDS);
    for (var i = 0; i < list.length; i++) autoDir(list[i]);
  }
  var fieldWatch = new MutationObserver(function (records) {
    for (var i = 0; i < records.length; i++) {
      if (records[i].type === "attributes") { if (records[i].target.matches(FIELDS)) autoDir(records[i].target); continue; }
      for (var j = 0; j < records[i].addedNodes.length; j++) fieldsIn(records[i].addedNodes[j]);
    }
  });
  function follow() {
    var rtl = document.documentElement.getAttribute("dir") === "rtl";
    if (rtl === on) { if (on) fieldsIn(document.body); return; }
    on = rtl;
    if (on) {
      swapAll();
      fieldsIn(document.body);
      fieldWatch.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["placeholder"] });
    } else {
      putBack();
      fieldWatch.disconnect();
      var list = document.querySelectorAll("[data-rtl-auto]");
      for (var i = 0; i < list.length; i++) { list[i].removeAttribute("dir"); delete list[i].dataset.rtlAuto; }
    }
  }
  var st = document.createElement("style");
  st.id = "rtlStyle";
  st.textContent = STYLE;
  document.head.appendChild(st);
  watcher.observe(document.head, { childList: true, subtree: true, characterData: true });
  window.addEventListener("ruach-lang", follow);
  new MutationObserver(follow).observe(document.documentElement, { attributes: true, attributeFilter: ["dir"] });
  follow();
  window.RuachRtl = { on: function () { return on; }, swapped: function () { return saved.length; } };
})();
