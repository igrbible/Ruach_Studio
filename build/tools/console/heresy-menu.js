// HERESY 1048: the studio's own right-click menu (Viktor, 01.10.2026): the actions on a clip live
// here, so the cards stay small and the list of actions can grow. HeresyMenu.open(x, y, items):
// an item is {label, icon, hint, checked, danger, disabled, action} or {sep: true} or
// {label, items: [...]} for a submenu (opens on hover or →); raw: true keeps the label as typed (a name: HERESY 1166,
// the page's translator leaves it). Arrows, Enter, Esc and ← work;
// a click outside, a scroll of what it was opened over, or a resize closes it.
(function () {
  "use strict";

  var root = null, stack = [], anchor = null, tipEl = null;
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  // HERESY 1169 · 1248 (Viktor 08.10.2026: «Мышечное меню… твои мини подсказки на некоторых опциях срезают текст… урезана до R. Лучше прямо
  // с боку от меню выводить небольшой тултип при наведении указателя мыши на ту или иную команду, а inline подсказки вообще оттуда убрать и
  // держать это контекстное меню аккуратным»): an item's hint is not written in its row; pointed at or reached by the keys, it shows beside
  // the menu, level with the item, on the side with room, in the page's language as it is written
  function hintShow(entry, b) {
    var it = entry.items[+b.dataset.i];
    if (!it || !it.hint || it.items) { hintHide(); return; }
    if (!tipEl) {
      tipEl = document.createElement("div");
      tipEl.className = "hm-tip";
      tipEl.setAttribute("role", "tooltip");
      document.body.appendChild(tipEl);
    }
    tipEl.textContent = window.RuachI18n ? window.RuachI18n.t(it.hint) : it.hint;
    tipEl.hidden = false;
    var m = entry.el.getBoundingClientRect(), r = b.getBoundingClientRect(), w = tipEl.offsetWidth, h = tipEl.offsetHeight;
    tipEl.style.left = (m.right + 6 + w <= window.innerWidth - 6 ? m.right + 6 : Math.max(6, m.left - 6 - w)) + "px";
    tipEl.style.top = Math.max(6, Math.min(r.top + r.height / 2 - h / 2, window.innerHeight - h - 6)) + "px";
  }
  function hintHide() { if (tipEl) tipEl.hidden = true; }

  function close() {
    hintHide();
    stack.forEach(function (m) { if (m.ro) m.ro.disconnect(); m.el.remove(); });
    stack = [];
    if (root) { document.removeEventListener("keydown", onKey, true); root = null; }
  }

  function build(items, level) {
    var el = document.createElement("div");
    el.className = "hm-menu";
    el.setAttribute("role", "menu");
    el.innerHTML = items.map(function (it, i) {
      if (it.sep) return '<div class="hm-sep" role="separator"></div>';
      if (it.head) return '<div class="hm-head">' + esc(it.head) + "</div>";
      return '<button type="button" class="hm-item' + (it.danger ? " is-danger" : "") + (it.muted ? " is-muted" : "") + '" role="menuitem" data-i="' + i + '"' +
        (it.disabled ? " disabled" : "") + (it.muted ? ' aria-disabled="true"' : "") +   /* HERESY 1734: muted, greyed and saying why (a disabled one cannot) */ (it.checked !== undefined ? ' aria-checked="' + !!it.checked + '"' : "") + ">" +
        // HERESY 1474: in the page's language before it is measured (a menu laid out in English grew past the window in Russian)
        '<span class="hm-icon">' + (it.checked ? "✓" : esc(it.icon || "")) + '</span><span class="hm-label" translate="no">' + esc(it.raw || !window.RuachI18n ? it.label : window.RuachI18n.t(it.label)) + "</span>" +
        (it.items ? '<span class="hm-more">›</span>' : "") + "</button>";   // HERESY 1169 · 1248: the hint beside the menu (hintShow), not in the row
    }).join("");
    document.body.appendChild(el);
    var entry = { el: el, items: items, level: level };
    if (window.ResizeObserver) {                     // HERESY 1474: a menu that changes its size is placed again, the edge kept
      entry.ro = new ResizeObserver(function () { if (el._at) place(el, el._at[0], el._at[1], el._at[2]); });
      entry.ro.observe(el);
    }
    el.addEventListener("click", function (e) {
      var b = e.target.closest(".hm-item");
      if (!b || b.disabled) return;
      var it = items[+b.dataset.i];
      if (it.muted) { hintShow(entry, b); return; }   // HERESY 1734: a muted item says why again, and the menu stays
      if (it.items) return openSub(entry, b, it);
      close();
      if (it.action) it.action();
    });
    el.addEventListener("mouseover", function (e) {
      var b = e.target.closest(".hm-item");
      if (!b) return;
      b.focus({ preventScroll: true });
      var it = items[+b.dataset.i];
      clearTimeout(entry.subTimer);
      entry.subTimer = setTimeout(function () {
        if (it.items) openSub(entry, b, it); else trim(level);
      }, 140);
    });
    el.addEventListener("focusin", function (e) { var b = e.target.closest(".hm-item"); if (b) hintShow(entry, b); });   // the pointer focuses too
    el.addEventListener("mouseleave", hintHide);
    el.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    return entry;
  }

  function place(el, x, y, alt) {
    el._at = [x, y, alt];
    var w = el.offsetWidth, h = el.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
    var left = x + w > vw - 6 ? (alt !== undefined ? alt - w : vw - w - 6) : x;
    el.style.left = Math.max(6, left) + "px";
    el.style.top = Math.max(6, Math.min(y, vh - h - 6)) + "px";
  }

  function trim(level) { while (stack.length > level + 1) { var m = stack.pop(); if (m.ro) m.ro.disconnect(); m.el.remove(); } }

  function openSub(parent, button, it) {
    trim(parent.level);
    var sub = build(it.items, parent.level + 1), r = button.getBoundingClientRect();
    stack.push(sub);
    // HERESY 1377: a long list (the workspaces) opens with its ticked row in sight
    var tick = sub.el.querySelector('.hm-item[aria-checked="true"]');
    if (tick && sub.el.scrollHeight > sub.el.clientHeight) sub.el.scrollTop = Math.max(0, tick.offsetTop - sub.el.clientHeight / 2);
    place(sub.el, r.right - 2, r.top - 5, r.left + 2);
    button.setAttribute("aria-expanded", "true");
    return sub;
  }

  function buttons(entry) { return Array.prototype.slice.call(entry.el.querySelectorAll(".hm-item:not([disabled])")); }
  function onKey(e) {
    var top = stack[stack.length - 1];
    if (!top) return;
    var list = buttons(top), i = list.indexOf(document.activeElement);
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); if (stack.length > 1) { trim(stack.length - 2); focusFirst(stack[stack.length - 1]); } else close(); return; }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      var n = list.length; if (!n) return;
      list[(i + (e.key === "ArrowDown" ? 1 : -1) + n) % n].focus();
      return;
    }
    if (e.key === "ArrowRight" && i >= 0) {
      var it = top.items[+list[i].dataset.i];
      if (it.items) { e.preventDefault(); focusFirst(openSub(top, list[i], it)); }
      return;
    }
    if (e.key === "ArrowLeft" && stack.length > 1) { e.preventDefault(); trim(stack.length - 2); focusFirst(stack[stack.length - 1]); return; }
    if (e.key === "Tab") { e.preventDefault(); return; }
  }
  function focusFirst(entry) { var b = buttons(entry)[0]; if (b) b.focus({ preventScroll: true }); }

  function open(x, y, items) {
    close();
    anchor = document.elementFromPoint(x, y);         // HERESY 1165: what it is opened over, before it covers it
    var entry = build(items, 0);
    root = entry;
    stack.push(entry);
    place(entry.el, x, y);
    document.addEventListener("keydown", onKey, true);
    focusFirst(entry);
  }

  document.addEventListener("mousedown", function (e) { if (root && !e.target.closest(".hm-menu")) close(); }, true);
  window.addEventListener("resize", close);
  // HERESY 1165 (Viktor: «Если консоль серверного лога открыта и там движение, убивается фокус курсора на мышином меню»):
  // a scroll closes the menu only when it moves what the menu was opened over (the page, or a list holding it), as the
  // tips do; the server log following its new lines scrolls itself every moment and took the menu away
  document.addEventListener("scroll", function (e) {
    var box = e.target;
    if (root && box.classList && box.classList.contains("hm-menu")) {      // HERESY 1377: a menu scrolled: its open submenu goes
      var at = stack.map(function (m) { return m.el; }).indexOf(box);
      if (at >= 0) trim(at);
      return;
    }
    if (!root || (box.closest && box.closest(".hm-menu"))) return;
    if (box === document || box === document.documentElement || box === document.body || !anchor || (box.contains && box.contains(anchor))) close();
  }, true);
  window.addEventListener("blur", close);

  window.HeresyMenu = { open: open, close: close };
})();

// HERESY 1509 (Viktor 16.10.2026: «…напрочь избавиться от дропдаун селекторов, а выстраивать… все позиции в колонку, с чекбоксами и/или
// селекторами, и такие блоки в весьма неприметную рамку… А если списки реально большие… дополнительное модальное окно поверх как в фильтре
// библиотеки или в селекторе воркспейса… избавляемся от этих голимых html'евских дропдаунов»): a <select> given its choices in sight.
// Up to eight: a column of radio rows in a quiet frame (short ones in a row); more: a button that opens the list over the page, a filter
// above it when long (arrows, Enter, Esc). The <select> stays what everything reads and writes: a choice sets its value and says input and
// change; a value set by code shows at once (its own value and selectedIndex watched), options filled anew are drawn anew. Where the
// choices show is the stylesheet's (first the Refiner's node windows); the select itself stays where it was for everything else.
(function () {
  "use strict";
  var MAX = 8, SKIP = ".mx-ver, .mx-bus select, [data-hc='off']", pop = null;
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function text(o) { return (o.textContent || "").trim(); }
  function own(o) { return o.getAttribute("translate") === "no" || (o.parentNode && o.parentNode.getAttribute && o.parentNode.getAttribute("translate") === "no"); }
  function fire(sel) { sel.dispatchEvent(new Event("input", { bubbles: true })); sel.dispatchEvent(new Event("change", { bubbles: true })); }
  function choose(sel, i) { if (sel.selectedIndex !== i) { sel.selectedIndex = i; fire(sel); } }
  function watch(sel, paint) {
    var proto = HTMLSelectElement.prototype;
    ["value", "selectedIndex"].forEach(function (k) {
      var d = Object.getOwnPropertyDescriptor(proto, k);
      Object.defineProperty(sel, k, { configurable: true, enumerable: true, get: function () { return d.get.call(this); }, set: function (v) { d.set.call(this, v); paint(); } });
    });
    if (window.MutationObserver) new MutationObserver(paint).observe(sel, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["disabled", "selected"] });
    sel.addEventListener("change", paint);
  }
  function enhance(sel) {
    if (sel.dataset.hc || sel.multiple || sel.matches(SKIP)) return;
    sel.dataset.hc = "1";
    var box = document.createElement("div");
    box.className = "hc-box";
    sel.parentNode.insertBefore(box, sel.nextSibling);
    sel.classList.add("hc-src");
    function paint() {
      var opts = Array.prototype.slice.call(sel.options), cur = sel.selectedIndex, html;
      if (opts.length > MAX || sel.dataset.hcPick === "1") {   // HERESY 1598: or a button as its own asks (a head has no room for rows)
        var now = cur >= 0 ? opts[cur] : null;
        html = '<button type="button" class="hc-pick"' + (sel.disabled ? " disabled" : "") + ' aria-haspopup="listbox"><span class="hc-pick-now"' + (now && own(now) ? ' translate="no"' : "") + ">" +
          esc(now ? text(now) : "—") + '</span><span class="hc-pick-n mono">' + opts.length + "</span></button>";
      } else {
        var row = sel.dataset.hcRow === "1" || opts.every(function (o) { return text(o).length <= 16; });   // HERESY 1553: or as its own asks
        html = '<div class="hc-list' + (row ? " is-row" : "") + '" role="radiogroup">' + opts.map(function (o, i) {
          return '<button type="button" role="radio" class="hc-opt" data-i="' + i + '" aria-checked="' + (i === cur) + '"' + (sel.disabled || o.disabled ? " disabled" : "") +
            (own(o) ? ' translate="no"' : "") + '><i class="hc-dot" aria-hidden="true"></i><span>' + esc(text(o)) + "</span></button>";
        }).join("") + "</div>";
      }
      if (box.dataset.html !== html) { box.innerHTML = html; box.dataset.html = html; }
    }
    box.addEventListener("click", function (e) {
      var b = e.target.closest(".hc-opt"), p = e.target.closest(".hc-pick");
      if (b && !b.disabled) { e.preventDefault(); choose(sel, +b.dataset.i); return; }
      if (p && !p.disabled) { e.preventDefault(); open(sel, p); }
    });
    watch(sel, paint);
    paint();
  }
  function close() {
    if (!pop) return;
    document.removeEventListener("mousedown", outside, true);
    document.removeEventListener("keydown", key, true);
    pop.el.remove();
    var back = pop.anchor;
    pop = null;
    if (back && back.isConnected) back.focus();
  }
  function outside(e) { if (pop && !pop.el.contains(e.target) && !pop.anchor.contains(e.target)) close(); }
  function rows() { return pop ? Array.prototype.filter.call(pop.el.querySelectorAll(".hc-row"), function (r) { return !r.hidden; }) : []; }
  function mark(r) {
    Array.prototype.forEach.call(pop.el.querySelectorAll(".hc-row.is-cur"), function (x) { x.classList.remove("is-cur"); });
    if (r) { r.classList.add("is-cur"); r.scrollIntoView({ block: "nearest" }); }
  }
  function key(e) {
    if (!pop) return;
    var list = rows(), at = list.indexOf(pop.el.querySelector(".hc-row.is-cur"));
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); e.stopPropagation(); mark(list[Math.max(0, Math.min(list.length - 1, at + (e.key === "ArrowDown" ? 1 : -1)))]); return; }
    if (e.key === "Enter" && at >= 0) { e.preventDefault(); e.stopPropagation(); var sel = pop.sel; var i = +list[at].dataset.i; close(); choose(sel, i); }
  }
  function open(sel, anchor) {
    close();
    var opts = Array.prototype.slice.call(sel.options), r = anchor.getBoundingClientRect(), el = document.createElement("div");
    el.className = "hc-pop";
    el.setAttribute("role", "listbox");
    el.innerHTML = (opts.length > 10 ? '<input type="search" class="hc-find" placeholder="Find" autocomplete="off" spellcheck="false">' : "") +
      '<div class="hc-rows">' + opts.map(function (o, i) {
        return '<button type="button" class="hc-row' + (i === sel.selectedIndex ? " is-cur" : "") + '" role="option" data-i="' + i + '" aria-selected="' + (i === sel.selectedIndex) + '"' +
          (o.disabled ? " disabled" : "") + (own(o) ? ' translate="no"' : "") + ">" + esc(text(o)) + "</button>";
      }).join("") + "</div>";
    document.body.appendChild(el);
    pop = { el: el, sel: sel, anchor: anchor };
    var w = Math.max(r.width, 380), h = el.offsetHeight, room = window.innerHeight - r.bottom - 12;
    el.style.width = Math.min(w, window.innerWidth - 24) + "px";
    el.style.left = Math.max(12, Math.min(r.left, window.innerWidth - el.offsetWidth - 12)) + "px";
    if (h > room && r.top > room) { el.style.maxHeight = Math.min(h, r.top - 12) + "px"; el.style.top = Math.max(12, r.top - 4 - Math.min(h, r.top - 12)) + "px"; }
    else { el.style.maxHeight = Math.max(160, room) + "px"; el.style.top = (r.bottom + 4) + "px"; }
    el.addEventListener("click", function (e) {
      var b = e.target.closest(".hc-row");
      if (!b || b.disabled) return;
      var i = +b.dataset.i;
      close();
      choose(sel, i);
    });
    var find = el.querySelector(".hc-find");
    if (find) {
      find.addEventListener("input", function () {
        var q = find.value.trim().toLowerCase();
        Array.prototype.forEach.call(el.querySelectorAll(".hc-row"), function (b) { b.hidden = !!q && b.textContent.toLowerCase().indexOf(q) < 0; });
        var cur = el.querySelector(".hc-row.is-cur");
        if (!cur || cur.hidden) mark(rows()[0]);
      });
      find.focus();
    }
    mark(el.querySelector(".hc-row.is-cur"));
    document.addEventListener("mousedown", outside, true);
    document.addEventListener("keydown", key, true);
  }
  function within(root) { if (root) Array.prototype.forEach.call(root.querySelectorAll("select"), enhance); }
  // HERESY 1526 (Viktor 17.10.2026: «увидел в окнах нод. Супер, так отлично»): a room in this style as a whole: the class hc-on on it shows
  // every choice box in it (the stylesheet hides the select), and a select added to it later (a plugin's panel, a list drawn anew) is
  // enhanced as it comes. ROOMS: the rooms in this style so far, one by one as each is looked at
  var ROOMS = ["view-post"];
  function scope(root) {
    if (!root || root.dataset.hcScope) return;
    root.dataset.hcScope = "1";
    root.classList.add("hc-on");
    within(root);
    if (!window.MutationObserver) return;
    new MutationObserver(function (ms) {
      ms.forEach(function (m) {
        Array.prototype.forEach.call(m.addedNodes, function (n) {
          if (n.nodeType !== 1) return;
          if (n.tagName === "SELECT") enhance(n); else if (n.querySelector && n.querySelector("select")) within(n);
        });
      });
    }).observe(root, { childList: true, subtree: true });
  }
  function rooms() { ROOMS.forEach(function (id) { scope(document.getElementById(id)); }); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", rooms); else rooms();
  window.HeresyChoices = { within: within, enhance: enhance, close: close, open: function () { return !!pop; }, scope: scope, rooms: function () { return ROOMS.slice(); } };
})();

