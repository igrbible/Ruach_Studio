// HERESY 1107 (Viktor, 02.10.2026): the guard of the line. The studio may run on this very machine (127.0.0.1)
// or far away (a laptop on a phone's connection, through a VPN, to the studio's server). The guard measures the
// round trip to the studio every 20 s (the engine's /health, the median of the last five), says it beside the
// server log ("Forge · 85 ms"), and lets the page lean on it: a mark (like, dislike, favourite, pin) shows at once
// and the studio's answer only confirms it (or takes it back, said); far, patience before a silence is called a
// failure is three times as long (HeresyNet.patience).
(function () {
  "use strict";
  var LOCAL = /^(127\.|localhost$|\[::1\]$|::1$)/.test(location.hostname);
  var S = { samples: [], rtt: null, down: false, far: !LOCAL };
  function $(id) { return document.getElementById(id); }
  function median(a) { var s = a.slice().sort(function (x, y) { return x - y; }); return s[Math.floor(s.length / 2)]; }
  function paint() {
    var el = $("netSay");
    if (!el) return;
    var where = LOCAL ? "here" : "Forge";
    if (S.down) { el.textContent = where + " · no answer"; el.dataset.q = "bad"; }
    else if (S.rtt == null) { el.textContent = where + " · …"; el.dataset.q = ""; }
    else { el.textContent = where + " · " + Math.round(S.rtt) + " ms"; el.dataset.q = S.rtt < 60 ? "good" : S.rtt < 250 ? "slow" : "bad"; }
    el.dataset.tip = "The line to the studio: the round trip, the middle of the last five (every 20 s). " +
      (S.far ? "Far: marks show at once and the studio confirms them; the page waits longer before it calls a silence a failure."
             : "Near: the studio answers at once.");
  }
  // HERESY 1143: the time on the line only (the request's start to its first byte, from Resource Timing), not the wait in
  // the browser's own queue: during a render the log stream, the audio and the polls hold the six connections a host
  // has, and a ping queued behind them read as 2–6 s of distance (measured: the engine answers in 1 ms then)
  function lineTime(url, t0) {
    var all = performance.getEntriesByName ? performance.getEntriesByName(new URL(url, location.href).href) : [];
    var e = all[all.length - 1];
    if (performance.clearResourceTimings && performance.getEntriesByType("resource").length > 120) performance.clearResourceTimings();
    return e && e.requestStart > 0 && e.responseStart >= e.requestStart ? e.responseStart - e.requestStart : performance.now() - t0;
  }
  function ping() {
    var t0 = performance.now(), url = "/health?_=" + Date.now();
    return fetch(url, { cache: "no-store" }).then(function (r) {
      return r.text().then(function () {
        S.samples.push(lineTime(url, t0));
        if (S.samples.length > 5) S.samples.shift();
        S.rtt = median(S.samples); S.down = false;
        S.far = !LOCAL || S.rtt > 25;
        paint();
      });
    }).catch(function () { S.down = true; paint(); });
  }
  function patience(ms) { return S.far ? ms * 3 : ms; }
  window.HeresyNet = { far: function () { return S.far; }, rtt: function () { return S.rtt; }, patience: patience, ping: ping };
  function start() {
    paint(); ping();
    setInterval(function () { if (!document.hidden) ping(); }, 20000);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) ping(); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
