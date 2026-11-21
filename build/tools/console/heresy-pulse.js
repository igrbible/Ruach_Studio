// HERESY 2901 (Viktor's evening answers of 20.11.2026, item 3: a keep-alive pulse for the installed app only, a user default on, its waking and its
// lifecycle in the debug journal): the installed app (display-mode standalone, window-controls-overlay or minimal-ui) kept awake by a pulse no one
// hears, and its waking told in the order a hand needs.
//   The pulse: a sine of 12 Hz at a gain of 0.001 (a peak of -60 dBFS) in an AudioContext of its own, straight to the output. Chrome freezes, throttles
//   and in the end discards a page in the background unless it counts it audible, and it counts a stream audible from -72.25 dBFS
//   (services/audio/output_stream.cc, kSilenceThresholdDBFS, polled 15 times a second). Measured, not guessed (kitchen pulse-thr2.mjs, a Chrome not
//   muted, playing into ALSA's null device, the hidden page's 50 ms timer as the witness): a 12 Hz sine is silent to Chrome at a gain of 0.000265
//   and audible from 0.00028, so 0.001 stands 11 dB over that line; 12 Hz at -60 dBFS is far under hearing (and under what most speakers can move).
//   Only in the installed app, only while Engine → Defaults keeps «Keep the installed app awake» (on unless turned off: yue2.pwaPulse "off"), started
//   by the first click or key (Chrome lets no AudioContext sound before one), stopped and closed when the switch goes off.
//   The waking: on the tab shown again, a page shown from the back-forward cache and a frozen page resumed, «ruach-wake» is told; app.js answers it with
//   the active card and the player first and the library and the hardware in the idle time after. Each step goes into the debug journal (when it is
//   on): freeze, resume, pageshow, a page the browser had discarded, each wake with the pulse's state, and the long tasks of the first 3 s after it
(function () {
  "use strict";
  var KEY = "yue2.pwaPulse", HZ = 12, GAIN = 0.001, AFTER_WAKE_MS = 3000, MODES = ["standalone", "window-controls-overlay", "minimal-ui"];
  var ctx = null, armed = false, wokeAt = -1e9, wokeWhy = "";
  function installed() {
    if (typeof window.ruachInstalledApp === "function") return window.ruachInstalledApp();
    return !!window.matchMedia && MODES.some(function (m) { return window.matchMedia("(display-mode: " + m + ")").matches; });
  }
  function wanted() { var v = null; try { v = localStorage.getItem(KEY); } catch (e) { /* private window: on */ } return v !== "off"; }
  function note(e) { try { if (window.HeresyDebug && window.HeresyDebug.note) window.HeresyDebug.note(e); } catch (x) { /* the journal never stops the pulse */ } }
  function start() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (ctx || !AC) return;
    try {
      ctx = new AC({ latencyHint: "playback" });
      var osc = ctx.createOscillator(), g = ctx.createGain();
      osc.type = "sine"; osc.frequency.value = HZ; g.gain.value = GAIN;
      osc.connect(g); g.connect(ctx.destination); osc.start();
      ctx.onstatechange = function () { note({ k: "pulse", state: ctx ? ctx.state : "closed" }); };
      if (ctx.state !== "running") ctx.resume().catch(function () { /* the next gesture asks again */ });
      note({ k: "pulse", on: true, state: ctx.state });
    } catch (e) { ctx = null; note({ k: "pulse", on: false, why: String(e && e.name || e) }); }
  }
  function stop(why) {
    if (!ctx) return;
    var c = ctx; ctx = null;
    try { c.onstatechange = null; c.close(); } catch (e) { /* closed already */ }
    note({ k: "pulse", on: false, why: why });
  }
  function sync(why) {
    if (!installed()) return stop(why || "not the installed app");
    if (!wanted()) return stop(why || "turned off");
    if (!armed) return;                                  // before a hand: Chrome would keep it suspended
    if (!ctx) start();
    else if (ctx.state === "suspended") ctx.resume().catch(function () { /* the next gesture */ });
  }
  function gesture() {
    armed = true;
    sync();
    if (!installed() || !wanted() || (ctx && ctx.state === "running")) {
      ["pointerdown", "keydown", "touchstart"].forEach(function (t) { window.removeEventListener(t, gesture, true); });
    }
  }
  ["pointerdown", "keydown", "touchstart"].forEach(function (t) { window.addEventListener(t, gesture, { capture: true, passive: true }); });
  // the switch in Engine → Defaults, another window's switch, the window becoming the installed app or a tab again
  document.addEventListener("change", function (e) {
    var t = e.target;
    if (t && t.matches && t.matches('[data-def-check="' + KEY + '"]')) setTimeout(function () { sync(wanted() ? "" : "turned off"); }, 0);
  });
  window.addEventListener("storage", function (e) { if (e.key === KEY) sync(wanted() ? "" : "turned off"); });
  if (window.matchMedia) MODES.forEach(function (m) {
    var q = window.matchMedia("(display-mode: " + m + ")");
    if (q.addEventListener) q.addEventListener("change", function () { sync(); });
  });
  // the waking, told once per wake; the journal's lifecycle
  function wake(why) {
    var now = performance.now();
    if (now - wokeAt < 500) return;                      // pageshow and visibilitychange of one return come together: one wake
    wokeAt = now; wokeWhy = why;
    if (ctx && ctx.state !== "running") ctx.resume().catch(function () { /* the next gesture */ });
    note({ k: "life", ev: "wake", why: why, app: installed() || undefined, pulse: ctx ? ctx.state : "off" });
    window.dispatchEvent(new CustomEvent("ruach-wake", { detail: { why: why } }));
  }
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") wake("visible"); });
  window.addEventListener("pageshow", function (e) { if (e.persisted) { note({ k: "life", ev: "pageshow", persisted: true }); wake("pageshow"); } });
  document.addEventListener("freeze", function () { note({ k: "life", ev: "freeze", pulse: ctx ? ctx.state : "off" }); });
  document.addEventListener("resume", function () { note({ k: "life", ev: "resume" }); wake("resume"); });
  window.addEventListener("load", function () {
    if (document.wasDiscarded) note({ k: "life", ev: "discarded", app: installed() || undefined });   // the browser had thrown this page away
  });
  if (window.PerformanceObserver) {
    try {
      new PerformanceObserver(function (list) {
        list.getEntries().forEach(function (x) {
          var after = x.startTime - wokeAt;
          if (after >= 0 && after < AFTER_WAKE_MS && x.duration >= 50) note({ k: "life", ev: "long", ms: Math.round(x.duration), after: Math.round(after), why: wokeWhy });
        });
      }).observe({ type: "longtask" });
    } catch (e) { /* a browser without long tasks */ }
  }
  window.HeresyPulse = {
    state: function () { return { app: installed(), wanted: wanted(), armed: armed, ctx: ctx ? ctx.state : "off", hz: HZ, gain: GAIN }; },
    sync: sync, wake: wake
  };
})();
