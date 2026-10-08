// HERESY 1168 (Viktor 07.10.2026: «В редактор может прикрутить ещё собранный тобою массив `[...]`, чтобы при наборе `[`
// появлялись как в кодовых IDE подсказки с выбором, Enter и вставка? Базовые в самом начале — Verse, Bridge, etc, но на
// особые Intro, Outro, END проверка, если уже есть в тексте»): the section tags offered as a code editor offers its words.
//
// A «[» typed at a line's start (spaces before it allowed) in the Creator's or the Writer's lyrics opens a list under it:
// the sections of the cheat-sheet (heresy-instruments.js: the 110 official examples counted), in the order a song
// goes through them, Intro to End (HERESY 1169; before, the common ones came first). What is typed after the «[» narrows it, from a word's start («ch» finds Chorus and
// Pre-Chorus), in a Russian or Ukrainian layout too («[мук» is «[ver»); a number after it numbers the tag («v2» is
// [Verse 2]); lyrics that number their verses are offered the next one. ↑ ↓ choose (the mouse too); Enter or Tab puts
// the tag in on a line of its own and the cursor on the line under it (Ctrl+Z takes it back); Esc closes it (what was
// typed stays), and so does «]» (a tag of one's own). Intro, Outro and END already in the lyrics stay in their place,
// dimmed, with their line: ↑ ↓ and the pointer reach them and read what they are, and they are not put in twice; a numbered tag already there likewise. Ctrl+Space opens the list on
// a «[» line, and at a line's start types the «[» itself: no Latin layout needed for it.
//
// HERESY 1169 (Viktor 08.10.2026: «Две колонки, высота селектора не изменяется, если только в подвал не упирается. В левой
// фиксированной теги. А в правой красиво и крупновато - описания»; «по остальным, что не найдены в 110 примерах официальных
// добавь и эти, но пометь как тестовые»): the tags in a column, what the one in hand is beside it (the cheat-sheet's words,
// after Genius's guide to song sections) with how often the examples write it; the box as high whatever the list holds,
// lower only where the player would cut it; Genius's sections none of the examples writes last, marked TEST.
//
//   HeresyComplete.attach(textarea) · HeresyComplete.state()   (the last for the checks)
(function () {
  "use strict";
  // HERESY 1169 (Viktor 07.10.2026: «Вычисти оттуда то, чего нет в оф примерах YuE2»): no Break, the examples never write it
  // HERESY 1169 (Viktor 08.10.2026: «отсортируй их по стандартной арке произведения, начиная с Intro и заканчивая End»): the
  // sections in the order a song goes through them, the TEST ones where they would stand; FIRST is the fallback's order
  var ARC = ["Intro", "Instrumental Intro", "Verse", "Pre-Chorus", "Chorus", "Post-Chorus", "Refrain", "Hook", "Interlude", "Instrumental Break",
    "Guitar Solo", "Scatting", "Yodeling", "Non-Lyrical Vocals", "Bridge", "Breakdown", "Drop", "Instrumental", "Skit", "Segue", "Part",
    "Final Chorus", "Outro", "Fade Out", "Instrumental Outro", "End"];
  var FIRST = ["Verse", "Chorus", "Pre-Chorus", "Bridge", "Interlude"], ONCE = ["Intro", "Outro", "End"];
  // as Viktor writes it (thirty songs of his end so; «Да, измени»), where the official examples write [End]
  // HERESY 1169 (Viktor 08.10.2026: «Конечный тег изменил из суновского `[END]` на `[End]`»): as the official examples write it
  var SPELL = {};
  var TALL = 300;                                   // the two columns' height, px
  var ONCE_HEAD = { Intro: /^intro(duction)?$/, Outro: /^outro$/, End: /^ends?$/ };
  // the keys of a Russian (and Ukrainian) layout, as the Latin letters on the same keys
  var RU = "йцукенгшщзхъфывапролджэячсмитьбюё", EN = "qwertyuiop[]asdfghjkl;'zxcvbnm,.`", UK = { "і": "s", "ї": "]", "є": "'", "ґ": "`" };
  var pop = null, list = null, about = null, foot = null, box = null, items = [], at = -1, from = -1, shut = -1, query = null, mirror = null, queued = false;

  function tr(s) { return window.RuachI18n ? window.RuachI18n.t(s) : s; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function visible() { return !!(pop && !pop.hidden); }

  // the tags offered, in their order: the common sections, the three a song has once, the rest as the examples count them
  function ordered() {
    var g = window.HeresyInstruments && window.HeresyInstruments.lyricTags ? window.HeresyInstruments.lyricTags()[0] : null;
    var rows = (g ? g.rows : []).map(function (r) { return { name: r[0].replace(/^\[|\]$/g, ""), n: r[1], note: r[2], test: !r[1] }; });
    if (!rows.length) rows = FIRST.concat(ONCE).map(function (name) { return { name: name, n: 0, note: "", test: false }; });
    var pos = function (r) { var i = ARC.indexOf(r.name); return i < 0 ? ARC.length + rows.indexOf(r) : i; };
    return rows.slice().sort(function (a, b) { return pos(a) - pos(b); });
  }

  function fold(q) {
    if (!/[а-яёіїєґ]/i.test(q)) return q;
    return q.toLowerCase().split("").map(function (c) { var i = RU.indexOf(c); return i >= 0 ? EN[i] : UK[c] || c; }).join("");
  }
  function compact(s) { return s.toLowerCase().replace(/[\s-]+/g, ""); }
  // 1: from the name's start; 2: from a later word's start (ch → Pre-Chorus); 0: no
  function rank(name, head) {
    var h = compact(head);
    if (!h || compact(name).indexOf(h) === 0) return 1;
    var words = name.toLowerCase().split(/[\s-]+/);
    for (var i = 1; i < words.length; i++) if (compact(words.slice(i).join(" ")).indexOf(h) === 0) return 2;
    return 0;
  }

  // the tags the lyrics have: the first line of each of the three a song has once, every tag's own line, the verses' highest number
  function present(text) {
    var once = {}, named = {}, verse = 0;
    text.split("\n").forEach(function (line, i) {
      var t = line.match(/^\s*\[([^\]]+)\]\s*$/);
      if (!t) return;
      var low = t[1].replace(/\s+/g, " ").trim().toLowerCase();
      var head = low.split(/\s[–—-]\s|:|\||\/|\(/)[0].replace(/[\d#.]+/g, " ").trim();
      ONCE.forEach(function (o) { if (once[o] === undefined && ONCE_HEAD[o].test(head)) once[o] = i; });
      if (named[low] === undefined) named[low] = i;
      var v = low.match(/^verse\s*(\d+)\b/);
      if (v) verse = Math.max(verse, +v[1]);
    });
    return { once: once, named: named, verse: verse };
  }

  function offer(text, q) {
    var f = fold(q), m = f.match(/^(.*?)\s*(\d+)$/), head = m ? m[1] : f, num = m ? m[2] : "";
    if (num && !head.trim()) return [];
    var have = present(text), out = [];
    ordered().forEach(function (t, k) {
      var r = rank(t.name, head);
      if (!r) return;
      var name = SPELL[t.name] || t.name, next = false;
      if (num) name += " " + num;
      else if (t.name === "Verse" && have.verse) { name = "Verse " + (have.verse + 1); next = true; }
      var it = { tag: "[" + name + "]", note: t.note, n: t.n, rank: r, k: k, next: next, test: !!t.test };
      if (ONCE.indexOf(t.name) >= 0 && have.once[t.name] !== undefined) it.there = have.once[t.name];
      else if (name !== (SPELL[t.name] || t.name) && have.named[name.toLowerCase()] !== undefined) it.there = have.named[name.toLowerCase()];
      out.push(it);
    });
    return out.sort(function (a, b) { return (a.rank - b.rank) || (a.k - b.k); });   // HERESY 1169: the arc, the once-tags in their place
  }

  // the «[» the cursor stands after, at its line's start, nothing but its letters between: where it is and what follows it.
  // Inside a tag already closed further on («[Int|ro]») there is none; a «]» right after the cursor is taken in
  function context() {
    if (!box || box.readOnly || box.disabled || box.selectionStart !== box.selectionEnd) return null;
    var v = box.value, c = box.selectionStart, ls = c > 0 ? v.lastIndexOf("\n", c - 1) + 1 : 0, le = v.indexOf("\n", c);
    var m = v.slice(ls, c).match(/^(\s*)\[([^\[\]\n]*)$/), rest = v.slice(c, le < 0 ? v.length : le);
    if (!m || (rest.indexOf("]") >= 0 && rest.trim() !== "]")) return null;
    return { from: ls + m[1].length, q: m[2], to: rest.trim() === "]" ? c + rest.indexOf("]") + 1 : c };
  }

  function build() {
    if (pop) return;
    pop = document.createElement("div");
    pop.className = "tc-pop";
    pop.id = "tcPop";
    pop.hidden = true;
    pop.innerHTML = '<div class="tc-cols"><div class="tc-list" role="listbox" id="tcList" aria-label="Section tags"></div>' +
      '<div class="tc-about" aria-live="polite"></div></div><div class="tc-foot"></div>';
    document.body.appendChild(pop);
    list = pop.querySelector(".tc-list");
    about = pop.querySelector(".tc-about");
    foot = pop.querySelector(".tc-foot");
    pop.addEventListener("mousedown", function (e) { e.preventDefault(); });   // the box keeps the cursor
    pop.addEventListener("click", function (e) {
      var o = e.target.closest(".tc-item");
      if (o && !o.classList.contains("is-there")) accept(+o.dataset.i);
    });
    pop.addEventListener("mousemove", function (e) {           // HERESY 1169: a once-tag there already is read too, not put in
      var o = e.target.closest(".tc-item");
      if (o && +o.dataset.i !== at) { at = +o.dataset.i; mark(false); }
    });
  }

  // what the examples say of it, under its words in the column beside the list
  function count(it) {
    if (it.there !== undefined) return tr("Already in the lyrics, line {0}: a song has one").replace("{0}", it.there + 1);
    if (it.next) return tr("The lyrics number their verses: this is the next one");
    if (it.test) return "TEST: none of the 110 official examples writes it, so YuE2 may sing it as words or pass it by. Listen before you keep it.";
    return it.n ? tr("{0} times in the 110 official examples").replace("{0}", it.n) : "";
  }

  // the list drawn anew when it narrows; the one in hand only marked when the keys or the mouse move it (the rows stay, so a
  // click lands on the row it was pressed on)
  function render() {
    list.innerHTML = items.map(function (it, i) {
      var there = it.there !== undefined;
      var say = there ? tr("already at line {0}").replace("{0}", it.there + 1) : it.next ? tr("the next verse") : it.test ? "TEST" : it.n ? "×" + it.n : "";
      return '<div class="tc-item' + (there ? " is-there" : "") + '" role="option" id="tcOpt' + i + '" data-i="' + i + '" aria-selected="false"' +
        (there ? ' aria-disabled="true"' : "") + '><span class="tc-tag" translate="no">' + esc(it.tag) + '</span><span class="tc-say' + (it.test && !there && !it.next ? " tc-test" : "") + '">' + esc(say) + "</span></div>";
    }).join("");
    mark(true);
  }
  function mark(scroll) {
    Array.prototype.forEach.call(list.children, function (o, i) { o.classList.toggle("is-on", i === at); o.setAttribute("aria-selected", i === at ? "true" : "false"); });
    var cur = items[at], said = cur ? count(cur) : "";
    about.innerHTML = cur ? '<div class="tc-about-tag" translate="no">' + esc(cur.tag) + "</div>" +
      (cur.note ? '<p class="tc-about-say">' + esc(cur.note) + "</p>" : "") +
      (said ? '<p class="tc-about-n' + (cur.test && !cur.next ? " tc-test" : "") + '">' + esc(said) + "</p>" : "") : "";
    foot.innerHTML = '<span class="tc-keys">' + esc(tr("↑ ↓ choose · Enter or Tab puts it in · Esc closes")) + "</span>";
    box.setAttribute("aria-expanded", "true");
    if (cur) box.setAttribute("aria-activedescendant", "tcOpt" + at); else box.removeAttribute("aria-activedescendant");
    var on = list.children[at];
    if (on && scroll) {                                              // the one in hand in the list's view (the page does not move)
      if (on.offsetTop < list.scrollTop) list.scrollTop = on.offsetTop;
      else if (on.offsetTop + on.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = on.offsetTop + on.offsetHeight - list.clientHeight;
    }
  }

  // how much larger the box is drawn than its own pixels (a lifted frame is zoomed 1.2)
  function scale() { var w = box.offsetWidth; return w ? box.getBoundingClientRect().width / w : 1; }
  // where the cursor stands inside the box (relative to its padding box, its own scroll not counted): a copy of its layout,
  // beside the box so it is drawn at the box's own zoom (HERESY 1169: in the body, at another size, it ran along a line)
  function caret() {
    if (!mirror || mirror.parentNode !== box.parentNode) {
      if (mirror && mirror.parentNode) mirror.parentNode.removeChild(mirror);
      mirror = document.createElement("div");
      mirror.className = "tc-mirror";
      mirror.setAttribute("aria-hidden", "true");
      box.parentNode.insertBefore(mirror, box.nextSibling);
    }
    var cs = getComputedStyle(box);
    ["fontFamily", "fontSize", "fontWeight", "fontStyle", "lineHeight", "letterSpacing", "wordSpacing", "tabSize", "textTransform",
     "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "fontVariantLigatures", "textIndent",
     "fontKerning", "fontFeatureSettings", "fontVariationSettings", "fontStretch", "fontOpticalSizing", "textRendering"].forEach(function (k) { mirror.style[k] = cs[k]; });
    mirror.style.boxSizing = "border-box";
    mirror.style.border = "0";
    mirror.style.width = box.clientWidth + "px";
    var v = box.value, c = box.selectionStart;
    mirror.innerHTML = esc(v.slice(0, c)) + "<span>​</span>" + esc(v.slice(c)) + "​";
    var s = mirror.querySelector("span").getBoundingClientRect(), base = mirror.getBoundingClientRect(), k = scale();
    return { left: (s.left - base.left) / k, top: (s.top - base.top) / k, height: s.height / k };
  }
  // under the cursor's line; over it when the player or the window's edge leaves no room under it
  function place() {
    if (!visible() || !box) return;
    var p = caret(), r = box.getBoundingClientRect(), cs = getComputedStyle(box), k = scale();
    var bl = parseFloat(cs.borderLeftWidth) || 0, bt = parseFloat(cs.borderTopWidth) || 0, lh = parseFloat(cs.lineHeight) || p.height || 20;
    var top = r.top + k * (bt + p.top - box.scrollTop), bottom = top + k * lh;
    if (bottom < r.top || top > r.bottom) return hide();              // the line scrolled out of the box's view
    var bar = document.getElementById("playbar"), floor = bar && bar.getClientRects().length ? Math.min(window.innerHeight, bar.getBoundingClientRect().top) : window.innerHeight;
    // the columns as high whatever the list holds: under the line when they fit there, over it when they fit there, else
    // lower, on the roomier side (Viktor: «высота селектора не изменяется, если только в подвал не упирается»)
    var foot1 = foot.offsetHeight + 2, below = floor - 4 - (bottom + 3), above = top - 3 - 4, h = TALL, under = true;
    if (below < TALL + foot1) {
      if (above >= TALL + foot1) under = false;
      else { under = below >= above; h = Math.max(96, (under ? below : above) - foot1); }
    }
    pop.style.setProperty("--tc-h", h + "px");
    var w = pop.offsetWidth, y = under ? bottom + 3 : top - (h + foot1) - 3;
    pop.style.left = Math.max(4, Math.min(window.innerWidth - w - 4, r.left + k * (bl + p.left - box.scrollLeft) - 10)) + "px";
    pop.style.top = Math.max(4, y) + "px";
  }
  function later() {
    if (queued || !visible()) return;
    queued = true;
    requestAnimationFrame(function () { queued = false; place(); });
  }

  function fill(cx) {
    var keep = cx.q === query && items[at] ? items[at].tag : null;
    from = cx.from;
    query = cx.q;
    items = offer(box.value, cx.q);
    if (!items.length) return hide();
    at = -1;
    if (keep) items.forEach(function (it, i) { if (at < 0 && it.tag === keep && it.there === undefined) at = i; });
    if (at < 0) items.some(function (it, i) { if (it.next) { at = i; return true; } return false; });   // HERESY 1169: the next verse first
    if (at < 0) items.some(function (it, i) { if (it.there === undefined) { at = i; return true; } return false; });
    build();
    pop.hidden = false;
    render();
    place();
  }
  function hide() {
    items = [];
    at = -1;
    query = null;
    if (pop) pop.hidden = true;
    if (box) { box.setAttribute("aria-expanded", "false"); box.removeAttribute("aria-activedescendant"); }
  }
  // the list follows the cursor while it is open; it opens only on a letter typed (a paste, an undo or a click opens none)
  function check(typed) {
    var cx = context();
    if (!cx) { shut = -1; return hide(); }
    if (cx.from === shut) return hide();
    if (!visible() && !typed) return;
    fill(cx);
  }

  // into the box as typed, so Ctrl+Z takes it back (a value set by hand would leave the browser's undo nothing)
  function insert(s) {
    var ok = false;
    try { ok = document.execCommand("insertText", false, s); } catch (e) { ok = false; }
    if (!ok) {
      var a = box.selectionStart, b = box.selectionEnd;
      box.value = box.value.slice(0, a) + s + box.value.slice(b);
      box.setSelectionRange(a + s.length, a + s.length);
      box.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: s }));
    }
  }
  function accept(i) {
    var it = items[i], cx = context();
    if (!it || it.there !== undefined || !cx) return;
    hide();
    box.focus({ preventScroll: true });
    box.setSelectionRange(cx.from, cx.to);
    insert(it.tag + "\n");
    shut = -1;
  }
  function move(d) {
    var n = items.length;
    if (n) at = ((at < 0 ? (d > 0 ? -1 : 0) : at) + d + n * 2) % n;   // HERESY 1169 (Viktor: «позволь двигаться по ним и читать»): every row
    mark(true);
  }

  function onKey(e) {
    if (e.isComposing) return;
    if (e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey && e.code === "Space") {
      var cx = context();
      if (cx) { e.preventDefault(); shut = -1; return fill(cx); }
      var v = box.value, c = box.selectionStart, ls = c > 0 ? v.lastIndexOf("\n", c - 1) + 1 : 0;
      if (box.selectionStart === box.selectionEnd && !box.readOnly && /^\s*$/.test(v.slice(ls, c))) { e.preventDefault(); shut = -1; insert("["); }
      return;
    }
    if (!visible()) return;
    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) { e.preventDefault(); move(e.key === "ArrowDown" ? 1 : -1); }
    else if ((e.key === "Enter" || e.key === "Tab") && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) {
      if (at >= 0) { e.preventDefault(); accept(at); } else hide();
    } else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); shut = from; hide(); }
  }

  var boxes = [];
  function attach(area) {
    if (!area || boxes.indexOf(area) >= 0) return;
    boxes.push(area);
    area.setAttribute("aria-autocomplete", "list");
    area.setAttribute("aria-controls", "tcList");
    area.setAttribute("aria-expanded", "false");
    area.addEventListener("input", function (e) { box = area; check(/^insert(Text|CompositionText)$/.test(e.inputType || "")); });
    area.addEventListener("keydown", function (e) { box = area; onKey(e); });
    area.addEventListener("keyup", function (e) { if (box === area && visible() && !/^(ArrowUp|ArrowDown|Enter|Tab|Escape)$/.test(e.key)) check(false); });
    area.addEventListener("mouseup", function () { if (box === area && visible()) check(false); });
    area.addEventListener("blur", function () { if (box === area) hide(); });
    area.addEventListener("scroll", function () { if (box === area) later(); });
  }
  window.addEventListener("scroll", later, true);
  window.addEventListener("resize", later);
  ["lyrics", "wrLyrics"].forEach(function (id) { attach(document.getElementById(id)); });

  window.HeresyComplete = { attach: attach, offer: offer,
    state: function () {
      return { open: visible(), box: box ? box.id : null, at: at, active: items[at] ? items[at].tag : null,
        tags: items.map(function (it) { return it.tag + (it.there !== undefined ? "@" + (it.there + 1) : ""); }) };
    } };
})();
