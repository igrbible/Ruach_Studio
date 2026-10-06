// HERESY 1027: the page's settings (its yue2.* keys in the browser's storage) mirrored to disk on
// Forge through the lab: the studio's user/settings.json (since 02.10.2026; before, ~/.config/yue2_os, which the lab
// copies once). A cleared browser, a private window or another device gets them back.
//
// Load: before app.js reads anything, the file is read at once (a synchronous request for one
// small local file). Keys this browser lacks come from the file. Where both hold a key, the
// newer side wins: the file when it was written after this browser last wrote it (another
// device, or this browser's own storage cleared), this browser otherwise.
// Afterwards: every few seconds and when the page goes away, the keys that changed are sent,
// with the ones removed on purpose. The file merges them; it never forgets a key it was not
// told to. When most keys vanish at once (site data cleared under a live page), that is not a
// choice to forget: no removals are sent. Only the Engine room's Reset empties the file.
// The OpenRouter key and the running-jobs list stay in the browser only: the file is served to
// anyone on the network who opens the page, and the jobs belong to one session.
(function () {
  "use strict";

  var PREFIX = "yue2.", STAMP = "yue2.savedAt";
  var KEEP_LOCAL = { "yue2.orKey": 1, "yue2.jobs": 1, "yue2.savedAt": 1 };
  // ?scope=NAME in the page address keeps a separate file (a test page must not write into yours)
  var SCOPE = (function () { try { return new URLSearchParams(location.search).get("scope") || ""; } catch (e) { return ""; } })();
  var URL = "/lab/settings" + (SCOPE ? "?scope=" + encodeURIComponent(SCOPE) : "");
  var known = {};           // what the file holds as far as this page knows: key -> value
  var ok = true, met = false;

  function ls() { try { return window.localStorage; } catch (e) { return null; } }
  function collect() {
    var s = ls(), keys = {};
    if (!s) return keys;
    for (var i = 0; i < s.length; i++) {
      var k = s.key(i);
      if (k && k.indexOf(PREFIX) === 0 && !KEEP_LOCAL[k]) keys[k] = s.getItem(k);
    }
    return keys;
  }
  function send(payload, beacon) {
    var text = JSON.stringify(payload);
    if (beacon && navigator.sendBeacon) return Promise.resolve(navigator.sendBeacon(URL, new Blob([text], { type: "application/json" })));
    return fetch(URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: text }).then(function (r) { ok = r.ok; return r.ok; });
  }

  // ---- 1. restore, before the page reads its settings
  (function restore() {
    var s = ls();
    if (!s) return;
    try {
      var x = new XMLHttpRequest();
      x.open("GET", URL, false);
      x.send();
      if (x.status !== 200) { ok = false; return; }
      var disk = JSON.parse(x.responseText) || {}, keys = disk.keys || {};
      met = true;
      var mine = parseFloat(s.getItem(STAMP) || "0"), diskNewer = (disk.saved_at || 0) > mine, local = collect();
      // A browser that holds settings but has never written the file (the first visit after this
      // patch) keeps its own where both have a key: the file may hold another browser's.
      if (!mine && Object.keys(local).length) diskNewer = false;
      Object.keys(keys).forEach(function (k) {
        if (k.indexOf(PREFIX) !== 0 || KEEP_LOCAL[k]) return;
        if (!(k in local) || diskNewer) s.setItem(k, keys[k]);
      });
      known = keys;
      if (keys["yue2.theme"] && (diskNewer || !("yue2.theme" in local))) document.documentElement.dataset.theme = keys["yue2.theme"];   // the head script ran first
    } catch (e) { ok = false; }
  })();

  // ---- 2. write back what changes
  function push(beacon) {
    if (!met) return;       // the lab was down at load: this page's defaults must not overwrite the file
    var now = collect(), changed = {}, removed = [];
    Object.keys(now).forEach(function (k) { if (known[k] !== now[k]) changed[k] = now[k]; });
    Object.keys(known).forEach(function (k) { if (!(k in now)) removed.push(k); });
    var before = Object.keys(known).length;
    if (removed.length > 3 && removed.length * 2 > before) removed = [];   // cleared, not chosen
    if (!Object.keys(changed).length && !removed.length) return;
    var at = Date.now() / 1000;
    try { ls().setItem(STAMP, String(at)); } catch (e) { /* storage off: the file is still written */ }
    var prev = known;
    known = Object.assign({}, known, changed);
    removed.forEach(function (k) { delete known[k]; });
    send({ saved_at: at, keys: changed, removed: removed }, beacon).catch(function () { ok = false; known = prev; });
  }
  setTimeout(function () { push(false); }, 1500);   // a browser that has keys the file lacks writes them out
  setInterval(function () { push(false); }, 4000);
  window.addEventListener("pagehide", function () { push(true); });
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") push(true); });

  // ---- 3. reset (the Engine room's button): the browser's keys and the file, then a fresh page
  function reset() {
    var s = ls();
    met = false;            // nothing more from this page
    if (s) Object.keys(collect()).concat([STAMP]).forEach(function (k) { s.removeItem(k); });
    return send({ reset: true, saved_at: Date.now() / 1000, keys: {}, removed: [] })
      .then(function () { location.reload(); }, function () { location.reload(); });
  }

  window.HeresySettings = { reset: reset, flush: function () { push(false); }, reachable: function () { return ok && met; } };
})();
