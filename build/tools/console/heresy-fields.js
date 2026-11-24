// HERESY 2957 (a tester's DevTools «Issues» panel of 23.11.2026, 2.1.0-rc1 on Windows: «A form field element should have an id or name attribute»,
// 99+ of them): every field of the page has a name, so the browser's autofill and its own tools know it. A field with an id or a name keeps it; one
// without gets a name: its settings key where it has one (Engine › Defaults' data-def), else where it stands (the nearest element with an id, the
// field's kind and its place among the unnamed fields there), «f-» before it, as the page starts and as the rooms draw their rows. Never a radio's
// (a name groups radios) and never an id (the page's code finds its fields by theirs). Nothing reads these names: they are for the browser.
//
//   HeresyFields.name(root)   names the unnamed fields in root (the page by default); the checks call it
(function () {
  "use strict";
  var SEL = "input, select, textarea";
  function slug(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48); }
  function bare(el) { return !el.id && !el.getAttribute("name") && el.type !== "radio" && el.type !== "hidden"; }
  // one pass a batch: the fields of a host counted once (a list of a thousand rows is not counted a thousand times)
  function name(root) {
    root = root || document;
    var list = root.nodeType === 1 && root.matches(SEL) ? [root] : [], hosts = new Map();
    if (root.querySelectorAll) list = list.concat(Array.prototype.slice.call(root.querySelectorAll(SEL)));
    list.forEach(function (el) {
      if (!bare(el)) return;
      var key = el.getAttribute("data-def") || el.getAttribute("data-def-check");
      if (key) { el.setAttribute("name", "f-" + slug(key)); return; }
      var host = (el.parentElement && el.parentElement.closest("[id]")) || null, kind = slug(el.type || el.tagName), at = hosts.get(host);
      if (!at) {
        at = new Map(); hosts.set(host, at);
        var n = {};
        Array.prototype.forEach.call((host || document).querySelectorAll(SEL), function (x) {
          if (!bare(x) || x.getAttribute("data-def") || x.getAttribute("data-def-check")) return;
          var k = slug(x.type || x.tagName); n[k] = (n[k] || 0) + 1; at.set(x, n[k]);
        });
      }
      el.setAttribute("name", "f-" + (host ? slug(host.id) : "page") + "-" + kind + "-" + (at.get(el) || 1));
    });
  }
  function start() {
    name(document);
    if (!window.MutationObserver) return;
    var due = [], timer = 0;
    new MutationObserver(function (ms) {
      for (var i = 0; i < ms.length; i++) for (var j = 0; j < ms[i].addedNodes.length; j++) { var n = ms[i].addedNodes[j]; if (n.nodeType === 1) due.push(n); }
      if (due.length && !timer) timer = setTimeout(function () { var list = due; due = []; timer = 0; list.forEach(function (n) { if (n.isConnected) name(n); }); }, 0);
    }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
  window.HeresyFields = { name: name };
})();
