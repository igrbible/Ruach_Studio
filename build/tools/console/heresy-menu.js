// HERESY 1048: the studio's own right-click menu (Viktor, 01.10.2026): the actions on a clip live
// here, so the cards stay small and the list of actions can grow. HeresyMenu.open(x, y, items):
// an item is {label, icon, hint, checked, danger, disabled, action} or {sep: true} or
// {label, items: [...]} for a submenu (opens on hover or →); raw: true keeps the label as typed (a name: HERESY 1166,
// the page's translator leaves it). Arrows, Enter, Esc and ← work;
// a click outside, a scroll of what it was opened over, or a resize closes it.
(function () {
  "use strict";

  var root = null, stack = [], anchor = null;
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  function close() {
    stack.forEach(function (m) { m.el.remove(); });
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
      return '<button type="button" class="hm-item' + (it.danger ? " is-danger" : "") + '" role="menuitem" data-i="' + i + '"' +
        (it.disabled ? " disabled" : "") + (it.checked !== undefined ? ' aria-checked="' + !!it.checked + '"' : "") + ">" +
        '<span class="hm-icon">' + (it.checked ? "✓" : esc(it.icon || "")) + '</span><span class="hm-label"' + (it.raw ? ' translate="no"' : "") + ">" + esc(it.label) + "</span>" +
        (it.items ? '<span class="hm-more">›</span>' : it.hint ? '<span class="hm-hint">' + esc(it.hint) + "</span>" : "") + "</button>";
    }).join("");
    document.body.appendChild(el);
    var entry = { el: el, items: items, level: level };
    el.addEventListener("click", function (e) {
      var b = e.target.closest(".hm-item");
      if (!b || b.disabled) return;
      var it = items[+b.dataset.i];
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
    el.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    return entry;
  }

  function place(el, x, y, alt) {
    var w = el.offsetWidth, h = el.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
    var left = x + w > vw - 6 ? (alt !== undefined ? alt - w : vw - w - 6) : x;
    el.style.left = Math.max(6, left) + "px";
    el.style.top = Math.max(6, Math.min(y, vh - h - 6)) + "px";
  }

  function trim(level) { while (stack.length > level + 1) stack.pop().el.remove(); }

  function openSub(parent, button, it) {
    trim(parent.level);
    var sub = build(it.items, parent.level + 1), r = button.getBoundingClientRect();
    stack.push(sub);
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
    if (!root || (box.closest && box.closest(".hm-menu"))) return;
    if (box === document || box === document.documentElement || box === document.body || !anchor || (box.contains && box.contains(anchor))) close();
  }, true);
  window.addEventListener("blur", close);

  window.HeresyMenu = { open: open, close: close };
})();
