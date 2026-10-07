// HERESY 1168 (Viktor 07.10.2026: «Если курсор стоит в блоке редактора лирики или стиля, можем перехватывать Ctrl+F, чтобы
// искать не по всей странице, а только в активном блоке?»): Ctrl+F in a box the song is written in (the Creator's lyrics and
// style, the Writer's style, lyrics and notes) finds in that box alone; anywhere else the browser's own find stays.
//
// The bar sits at the box's top right: the words to find, which match of how many, previous and next, close. Enter and
// Shift+Enter (F3, Shift+F3) go through the matches; the one in hand is marked over the box (a copy of the box's layout
// says where its letters stand, wrapped lines too) and scrolled into view; Esc closes and puts the cursor back into the
// box with that match selected. His phonetic hand finds as plain words: a stress mark is not looked for (обещано finds
// обе́щано), ё is е, and о and а find his ע and his Latin o and a too (коморка finds кעмо́рка, ко finds Кo).
//
// HERESY 1168 (Viktor 07.10.2026: «Твоя подсветка работает при ровном скейле в 100%. На 110% уже съехала вниз»): a match
// whose line had gone under the lifted frame's foot (its sticky Generate bar, 70 px) was taken for seen, for the frame's own
// box reaches under the bar: nothing scrolled, and the mark, drawn over all, stood on the bar (at 110 % his line fell there).
// Whether a match is seen is asked of the page now (what stands at that point), and the browser itself scrolls it into the
// middle of every box on the way; a mark is drawn only where its words are seen. His second: «Если активен виджет поиска,
// когда прокрутил по тексту, встал курсором на другом месте, и единое движение клавишами… переносит оттуда на место поиска»:
// words typed in the box count the matches again and leave the view where it is; Esc from the box closes the bar and leaves
// the cursor where he put it (from the bar's own field Esc still goes back to the match).
//
//   HeresyFind.open(box) · HeresyFind.close() · HeresyFind.state()   (the last for the checks)
(function () {
  "use strict";
  var BOXES = { lyrics: "lyrics", style: "style", wrStyle: "style", wrLyrics: "lyrics", wrNotes: "notes" };
  var ALIKE = { "о": "[оoע]", "o": "[оoע]", "а": "[аaע]", "a": "[аaע]", "е": "[еёe]", "ё": "[еёe]", "ע": "[עоoаa]" };
  var MARK = /[\u0300-\u036f]/;
  var bar = null, input = null, count = null, box = null, hits = [], at = -1, marks = [], mirror = null, queued = false;

  function tr(s) { return window.RuachI18n ? window.RuachI18n.t(s) : s; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  // the box's text as it is searched: combining marks left out, letters lower case; and where each letter stands in the box
  function fold(text) {
    var out = "", map = [];
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (MARK.test(c)) continue;
      var low = c.toLowerCase();
      out += low.length === 1 ? low : c;
      map.push(i);
    }
    map.push(text.length);
    return { text: out, map: map };
  }
  // the words to find as a pattern over the folded text: marks out, each letter with its kin
  function pattern(q) {
    var out = "";
    for (var i = 0; i < q.length; i++) {
      var c = q[i];
      if (MARK.test(c)) continue;
      var low = c.toLowerCase();
      out += ALIKE[low] || low.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
    return out ? new RegExp(out, "g") : null;
  }
  function find(text, q) {
    var re = pattern(q), f = fold(text), out = [], m;
    if (!re) return out;
    while ((m = re.exec(f.text)) !== null) {
      if (!m[0].length) { re.lastIndex++; continue; }
      var from = f.map[m.index], to = f.map[m.index + m[0].length - 1] + 1;
      while (to < text.length && MARK.test(text[to])) to++;      // a match keeps its last letter's stress mark
      out.push([from, to]);
    }
    return out;
  }

  function build() {
    if (bar) return;
    bar = document.createElement("div");
    bar.className = "find-bar";
    bar.setAttribute("role", "search");
    bar.hidden = true;
    bar.innerHTML = '<input type="search" class="find-q" id="findQ" autocomplete="off" spellcheck="false" aria-label="Find in this box" data-tip="Find in this box only: Enter for the next, Shift+Enter for the one before, Esc back to the box with it selected. A stress mark is not looked for; ё is е; о and а find ע and the Latin o and a too" />' +
      '<span class="find-n mono" id="findN" aria-live="polite"></span>' +
      '<button type="button" class="btn ghost small find-btn" data-find="prev" aria-label="The one before (Shift+Enter)" data-tip="The one before (Shift+Enter)">&#x2191;</button>' +
      '<button type="button" class="btn ghost small find-btn" data-find="next" aria-label="The next (Enter)" data-tip="The next (Enter)">&#x2193;</button>' +
      '<button type="button" class="btn ghost small find-btn" data-find="close" aria-label="Close (Esc)" data-tip="Close (Esc): back to the box, the match selected">&#x2715;</button>';
    document.body.appendChild(bar);
    input = bar.querySelector(".find-q");
    count = bar.querySelector(".find-n");
    input.addEventListener("input", function () { search(true); });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === "F3") { e.preventDefault(); step(e.shiftKey ? -1 : 1); }
      else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(true); }
    });
    bar.addEventListener("mousedown", function (e) { if (e.target.closest("[data-find]")) e.preventDefault(); });   // the box keeps its words selected
    bar.addEventListener("click", function (e) {
      var b = e.target.closest("[data-find]");
      if (!b) return;
      if (b.dataset.find === "close") close(true);
      else step(b.dataset.find === "prev" ? -1 : 1);
    });
  }

  // over the box's top edge, on its label's row, so it hides none of the words; inside the box when there is no room above
  function place() {
    if (!bar || bar.hidden || !box) return;
    var r = box.getBoundingClientRect(), w = bar.offsetWidth || 300, h = bar.offsetHeight || 38, above = r.top - h - 4;
    bar.style.top = (above >= 56 ? above : Math.max(4, Math.min(window.innerHeight - h - 4, r.top + 4))) + "px";
    bar.style.left = Math.max(4, Math.min(window.innerWidth - w - 4, r.right - w - 6)) + "px";
  }

  function search(fromCaret, quiet) {
    if (!box) return;
    hits = find(box.value, input.value);
    if (!hits.length) at = -1;
    else if (fromCaret || at < 0) {
      var caret = box.selectionStart || 0;
      at = hits.findIndex(function (h) { return h[1] > caret; });
      if (at < 0) at = 0;
    } else {
      at = Math.min(at, hits.length - 1);
    }
    show(quiet);
  }

  function step(d) {
    if (!hits.length) return search(false);
    at = (at + d + hits.length) % hits.length;
    show();
  }

  // the match in hand marked over the box: a hidden copy of the box's layout gives its letters' boxes. Quiet (the box's own
  // words changed): counted and marked again where it is, the view not moved
  function show(quiet) {
    count.textContent = !input.value ? "" : hits.length ? tr("{0} of {1}").replace("{0}", at + 1).replace("{1}", hits.length) : tr("no match");
    bar.classList.toggle("is-none", !!input.value && !hits.length);
    if (at >= 0 && !quiet) reveal(hits[at]);
    paintMarks();
  }

  // how much larger the box is drawn than its own pixels (a lifted frame is zoomed 1.2; Viktor saw the mark float there)
  function scale() { var w = box.offsetWidth; return w ? box.getBoundingClientRect().width / w : 1; }

  // whether a point of the box is seen: the box itself is what stands there (no sticky bar over it, not outside its frame or the
  // window)
  function seen(x, y) {
    return x >= 0 && y >= 0 && x < window.innerWidth && y < window.innerHeight && document.elementFromPoint(x, y) === box;
  }
  // the browser itself brings a line of the box into the middle of every scrolling box on the way (it knows a lifted frame's
  // zoom, the page's own and the sticky bars): a probe beside the box where the line stands, scrolled to, removed
  function bringIntoView(top, height) {
    var probe = document.createElement("span");
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText = "position:absolute;width:1px;visibility:hidden;pointer-events:none;left:" + box.offsetLeft + "px;top:" +
      (box.offsetTop + top) + "px;height:" + Math.max(1, height) + "px";
    box.parentNode.insertBefore(probe, box.nextSibling);
    probe.scrollIntoView({ block: "center", inline: "nearest" });
    probe.remove();
  }

  function reveal(h) {
    var m = measure(h);
    if (!m) return;
    var cs = getComputedStyle(box), lh = parseFloat(cs.lineHeight) || 20, bt = parseFloat(cs.borderTopWidth) || 0, bl = parseFloat(cs.borderLeftWidth) || 0, k = scale();
    if (box.scrollHeight > box.clientHeight + 1) {               // the box scrolls: bring the line into its view
      if (m.top < box.scrollTop || m.top + lh > box.scrollTop + box.clientHeight) box.scrollTop = Math.max(0, m.top - box.clientHeight / 3);
    }
    var q = m.rects[0], r = box.getBoundingClientRect();         // and into the frame's or the page's, unless it is seen there
    if (!seen(r.left + k * (bl + q.left - box.scrollLeft + Math.min(q.width, 6) / 2), r.top + k * (bt + q.top - box.scrollTop + q.height / 2))) {
      bringIntoView(bt + q.top - box.scrollTop, q.height || lh);
    }
  }

  // where the letters of a match stand inside the box (relative to its padding box, the box's own scroll not counted): a copy
  // as wide as the box's inside (its scroll bar left out, so its lines wrap where the box's do), its paddings, no borders
  function measure(h) {
    if (!box || !h) return null;
    if (!mirror) {
      mirror = document.createElement("div");
      mirror.className = "find-mirror";
      mirror.setAttribute("aria-hidden", "true");
      document.body.appendChild(mirror);
    }
    var cs = getComputedStyle(box);
    ["fontFamily", "fontSize", "fontWeight", "fontStyle", "lineHeight", "letterSpacing", "wordSpacing", "tabSize", "textTransform",
     "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "fontVariantLigatures", "textIndent"].forEach(function (k) { mirror.style[k] = cs[k]; });
    mirror.style.boxSizing = "border-box";
    mirror.style.border = "0";
    mirror.style.width = box.clientWidth + "px";
    var text = box.value;
    mirror.innerHTML = esc(text.slice(0, h[0])) + "<mark>" + esc(text.slice(h[0], h[1])) + "</mark>" + esc(text.slice(h[1])) + "​";
    var mark = mirror.querySelector("mark"), base = mirror.getBoundingClientRect();
    var rects = Array.prototype.map.call(mark.getClientRects(), function (q) {
      return { left: q.left - base.left, top: q.top - base.top, width: q.width, height: q.height };
    });
    return rects.length ? { top: rects[0].top, rects: rects } : null;
  }

  function paintMarks() {
    marks.forEach(function (m) { m.remove(); });
    marks = [];
    if (!box || at < 0 || !bar || bar.hidden) return;
    var m = measure(hits[at]);
    if (!m) return;
    var r = box.getBoundingClientRect(), cs = getComputedStyle(box), k = scale();
    var bl = parseFloat(cs.borderLeftWidth) || 0, bt = parseFloat(cs.borderTopWidth) || 0;
    var clip = { top: r.top + k * bt, bottom: r.top + k * (bt + box.clientHeight) };
    m.rects.forEach(function (q) {
      var top = r.top + k * (bt + q.top - box.scrollTop), bottom = top + k * q.height, left = r.left + k * (bl + q.left - box.scrollLeft);
      if (bottom <= clip.top || top >= clip.bottom) return;       // scrolled out of the box's view
      if (!seen(left + Math.min(k * q.width, 6) / 2, (Math.max(top, clip.top) + Math.min(bottom, clip.bottom)) / 2)) return;   // under a bar, out of the frame
      var d = document.createElement("div");
      d.className = "find-mark";
      d.style.left = left + "px";
      d.style.top = Math.max(top, clip.top) + "px";
      d.style.width = Math.max(2, k * q.width) + "px";
      d.style.height = (Math.min(bottom, clip.bottom) - Math.max(top, clip.top)) + "px";
      document.body.appendChild(d);
      marks.push(d);
    });
  }

  function later() {
    if (queued || !bar || bar.hidden) return;
    queued = true;
    requestAnimationFrame(function () { queued = false; place(); paintMarks(); });
  }

  function open(target) {
    build();
    if (box && box !== target) box.removeEventListener("input", onBoxInput);
    box = target;
    box.addEventListener("input", onBoxInput);
    bar.hidden = false;
    input.placeholder = tr({ lyrics: "Find in the lyrics", style: "Find in the style", notes: "Find in the notes" }[BOXES[box.id]] || "Find in this box");
    var sel = box.value.slice(box.selectionStart, box.selectionEnd);
    if (sel && sel.indexOf("\n") < 0 && sel.length < 80) input.value = sel;   // the words selected in the box, as a browser does
    place();
    input.focus();
    input.select();
    search(true);
  }

  function close(back) {
    if (!bar || bar.hidden) return;
    bar.hidden = true;
    marks.forEach(function (m) { m.remove(); });
    marks = [];
    var b = box, h = at >= 0 ? hits[at] : null;
    if (b) b.removeEventListener("input", onBoxInput);
    box = null;
    if (back && b) {
      b.focus({ preventScroll: true });
      if (h) b.setSelectionRange(h[0], h[1]);
    }
  }

  function onBoxInput() { search(false, true); }

  // the key, not its letter: in a Russian layout Ctrl+F comes as «а» (Viktor 07.10.2026: «Повторно Ctrl+F — всплыло браузерное
  // поиска… Снова Ctrl+F — твой виджет больше не появляется»): the browser goes by the key, and so does this
  document.addEventListener("keydown", function (e) {
    var key = (e.key || "").toLowerCase();
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.code === "KeyF" || key === "f")) {
      var el = document.activeElement;
      if (el && BOXES[el.id] && el.tagName === "TEXTAREA") { e.preventDefault(); open(el); return; }
      if (bar && !bar.hidden && el === input) { e.preventDefault(); input.select(); }
      return;
    }
    if (bar && !bar.hidden && e.key === "F3") { e.preventDefault(); step(e.shiftKey ? -1 : 1); return; }
    if (bar && !bar.hidden && e.key === "Escape" && document.activeElement === box) { e.preventDefault(); close(false); }   // the cursor stays where he put it
  }, true);
  window.addEventListener("scroll", later, true);
  window.addEventListener("resize", later);
  document.addEventListener("mousedown", function (e) {           // a click elsewhere closes it (not in the box, not in the bar)
    if (bar && !bar.hidden && !bar.contains(e.target) && e.target !== box) close(false);
  });

  window.HeresyFind = { open: open, close: close, find: find,
    state: function () { return { open: !!(bar && !bar.hidden), box: box ? box.id : null, at: at, hits: hits.length, said: count ? count.textContent : "" }; } };
})();
