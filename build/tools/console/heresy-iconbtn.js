// HERESY 1593 (Viktor 19.10.2026: «Перерисуй все кнопки `Cancel ...` svg иконкой 🗙. Применить - ✔️, и т.п. по стандартной системе
// иконографии функций кнопок, - там, где до сих пор текстовые надписи»): a button whose whole text is one of the common acts shows its
// icon instead: Cancel and Close ✕, OK and Apply ✓, Save a diskette, Delete a bin, Clear an eraser, Reset a turn back. Its word stays
// inside, unseen, so a screen reader still says it and the catalogs still translate it, and its tip says it when it has none of its own.
// Every button that appears is looked at (the dialogs come and go); one that a script fills with other words is looked at again.
// The icons: Lucide (ISC), as the page's others.
(function () {
  "use strict";
  var SVG = {
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    save: '<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><path d="M10 11v6"/><path d="M14 11v6"/>',
    eraser: '<path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/>',
    reset: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>'
  };
  var MAP = { "Cancel": "x", "Close": "x", "Send nothing": "x", "Dismiss": "x",
              "OK": "check", "Apply": "check", "Done": "check", "Confirm": "check", "Make it": "check", "Write into the score": "check",
              "Save": "save", "Delete": "trash", "Remove": "trash", "Clear": "eraser", "Reset": "reset" };
  var rev = null, revLang = "";
  function tr(s) { return window.RuachI18n && window.RuachI18n.t ? window.RuachI18n.t(s) : s; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function table() {                                   // the words as they read now: English and the language in hand
    var l = document.documentElement.lang || "";
    if (rev && revLang === l) return rev;
    rev = {}; revLang = l;
    Object.keys(MAP).forEach(function (k) { rev[k] = k; var t = tr(k); if (t) rev[t] = k; });
    return rev;
  }
  function iconize(b) {
    if (!b || b.tagName !== "BUTTON" || b.closest("[data-no-icon]")) return;
    if (b.dataset.iconized) { if (b.querySelector(".ib-svg")) return; delete b.dataset.iconized; b.classList.remove("btn-icon"); }   // filled anew by a script
    if (b.children.length) return;                     // only a button of words alone
    var key = table()[(b.textContent || "").trim()];
    if (!key) return;
    b.dataset.iconized = MAP[key];
    b.innerHTML = '<svg class="ib-svg" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">' + SVG[MAP[key]] + '</svg><span class="ib-label">' + esc(key) + "</span>";
    if (!b.hasAttribute("data-tip")) b.setAttribute("data-tip", key);
    b.classList.add("btn-icon");
  }
  function scan(root) {
    if (!root || root.nodeType !== 1) return;
    if (root.tagName === "BUTTON") iconize(root);
    root.querySelectorAll("button").forEach(iconize);
  }
  function start() {
    scan(document.body);
    new MutationObserver(function (list) {
      list.forEach(function (m) {
        if (m.type === "childList") {
          if (m.target.tagName === "BUTTON") iconize(m.target);
          else if (m.target.parentElement && m.target.parentElement.tagName === "BUTTON") iconize(m.target.parentElement);
          m.addedNodes.forEach(scan);
        }
      });
    }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
  window.HeresyIconBtn = { scan: scan, map: function () { return Object.assign({}, MAP); } };
})();
