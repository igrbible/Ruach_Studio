// HERESY 2354 (Viktor 10.11.2026: «один заказ по визуалу мега плеера. По центру в зоне кнопок проигрывания по ширине и в охвате пустого места вмонтировать
// живую волну в полном диапазоне от 25Hz до 20kHz как бекграунд. Нижний пиксел волны, которая только вверх имеет свои пики, привязываем к самому нижнему
// [краю] плеера, а сверху оставляем порог где-то в 4-5 пикселов.»): the live spectrum behind the two-row player's transport. It spans the empty room
// between the take's group on the left and the times and switches on the right, from under the take's wave down to the player's very last pixel, its
// peaks stopping 5 px under the wave; 25 Hz on the left to 20 kHz on the right on a log axis, rising only upward from the foot, in the player's own
// accent, faint, so it reads as air and not as a meter. The buttons stay over it and take every click (it lies under them and takes no pointer).
//
// Fed by the player's own sound without touching what is heard: Chrome's captureStream() of the <audio> into an analysing context of its own that
// plays to no device (the element still plays to the speakers exactly as before). Where the browser has no captureStream (Firefox, Safari), the
// analyser hangs off the volume boost's one MediaElementSource (app.js, HERESY 1700), beside its gain, once app.js has made that graph; never made
// here: an element has one MediaElementSource for life, and a graph made for a picture would move the sound itself through Web Audio.
//
// One requestAnimationFrame loop, only while a take plays, the page is in sight and the switch is on (Engine → Defaults, «Live spectrum behind the
// player», on by default); paused or stopped, the curve breathes out in about a second and the loop ends. Reduced motion: nothing is drawn.
// Right to left (Hebrew): the lows stay on the left; a spectrum is a scale of frequency, not a line of text (heresy-rtl.js keeps the player ltr).
//
// HERESY 2357 (Viktor 11.11.2026: «Та живая волна спектральная, которую добавили ночью, а увидел её всего лишь на одном треке. После выхода из
// сравнителя её также нет в плеере. И можно расширить её по бокам на 100 пикселов с каждой стороны.»): why it died after the first take, measured
// headless (Chrome 148): the element's captureStream() stream does not end the track of a source gone by; at each new source's loadedmetadata it
// adds a new track and keeps the old one «live» and silent beside it (after three takes: three live tracks, two of them mute). The first version
// took the first live track, so from the second take on it listened to the first take's dead track, and the compare window's hand-back (a new
// source too) the same. Now the newest live track is the sound (the stream's addtrack moves to it), the ones gone by are removed and stopped, and
// where none is live with the element's metadata in (an older Chrome ends them all at the element's end) the element is captured anew. It follows
// whatever the player plays: the footer's <audio> looked up again at each event (a new element is followed as well), and the compare window's
// version while that window has the player's sound (app.js's one-sound says which element starts: the «ruach-sound» event), given back when the
// footer plays again. It reaches 100 px further into each side group, under them (no pointer, under their buttons), faded at its new ends.
(function () {
  "use strict";

  var F_LO = 25, F_HI = 20000;        // the axis, Hz, log, the lows on the left in every language
  var TOP_GAP = 5;                    // px left clear between the curve's highest reach and the wave above it
  var SIDE_GAP = 12;                  // px left clear of the take's group and of the times and switches (2354)
  var REACH = 100;                    // HERESY 2357: px further into each side group than that, under its things, the fade at the new ends
  var STEP = 3;                       // px between the curve's points
  // the level at the foot and at full height, after the tilt (measured on the takes of 01.11 as this file computes them: the highest point of a
  // frame at 0.76–0.81 of the height in the median, 0.87–0.91 at the 95th percentile, never clipped; the 6–20 kHz third at 0.26–0.43)
  var DB_LO = -98, DB_HI = -30;
  var TILT = 4.5;                     // dB an octave about 1 kHz, as the mixing analysers show it: music falls about so, untilted the highs lie on the floor
  var RISE = 0.05, FALL = 0.32;       // s: up quickly, down slowly, so it breathes and never flickers
  var KEY = "yue2.liveSpectrum";      // Engine → Defaults: "off" turns it off, nothing kept means on
  var ALPHA = { dark: [0.30, 0.05, 0.46], light: [0.20, 0.035, 0.34] };   // the fill at the top and at the foot, the edge's line

  var bar = null, cv = null, cx = null;
  // HERESY 2357: el the element heard now; caps the elements captured ({el, stream}: the footer's for as long as it is the footer, a compare
  // version's while it is followed); other the compare window's version that has the player's sound
  var S = { run: false, raf: 0, falling: false, last: 0, mode: "", ctx: null, el: null, ms: null, track: null, an: null, gsrc: null, capFail: false,
            bins: null, P: null, live: null, tgt: null, geo: null, dirty: true, measured: 0, rgb: null, dark: false, grad: null, line: "",
            peak: 0, frames: 0, work: 0, since: 0, retaps: 0, retired: 0 };
  var caps = [], other = null, known = typeof WeakSet === "function" ? new WeakSet() : null;
  var MEDIA = ["play", "playing", "pause", "ended", "emptied"];
  var reduce = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  function noop() {}

  function recall(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function enabled() { return recall(KEY) !== "off" && !(reduce && reduce.matches); }
  function footer() { return document.getElementById("audio"); }   // looked up each time: a new <audio> in its place is the player
  function sounding(a) { return !!a && !!(a.currentSrc || a.getAttribute("src")) && !a.paused && !a.ended; }
  function heard() { var f = footer(); return sounding(f) ? f : sounding(other) ? other : null; }   // the footer's own first, else the compare's that has its sound
  function wanted() { return !!cv && enabled() && !document.hidden && !!heard(); }
  function sameOrigin(el) { try { return !el.currentSrc || new URL(el.currentSrc, location.href).origin === location.origin; } catch (e) { return false; } }

  // ------------------------------------------------------------ the sound, as it plays
  function analyser(ctx) {
    var an = ctx.createAnalyser();
    an.fftSize = 8192;                  // about 5.9 Hz a bin at 48 kHz: the lows at 25 Hz still have bins of their own
    an.smoothingTimeConstant = 0.5;
    an.minDecibels = -110; an.maxDecibels = -10;
    return an;
  }
  // HERESY 2357: one capture an element, its newest live track the sound. Chrome keeps a source's track live and silent in the stream after the
  // element moves on to another source and adds the new source's track after it (measured 11.11: three takes, three live tracks), so the first
  // live one is the first take's for ever; the newest is what plays, and the others are taken out of the stream and stopped
  function newest(c) { var ts = c.stream.getAudioTracks(); for (var i = ts.length - 1; i >= 0; i--) if (ts[i].readyState === "live") return ts[i]; return null; }
  function retire(c, keep) {
    c.stream.getAudioTracks().forEach(function (t) { if (t === keep) return; try { c.stream.removeTrack(t); t.stop(); S.retired++; } catch (e) { /* ended already */ } });
  }
  function detach() {                  // the analyser's input let go; the captures and the boost's graph stay as they are
    if (S.ms) { try { S.ms.disconnect(); } catch (e) { /* gone with its track */ } S.ms = null; }
    if (S.gsrc && S.an) { try { S.gsrc.disconnect(S.an); } catch (e) { /* gone */ } }   // only the branch to the analyser: src.disconnect() whole would cut the sound
    S.gsrc = null; S.track = null; S.mode = "";
  }
  function drop(c) {                   // a capture let go: its tracks stopped (the element plays on as before)
    var i = caps.indexOf(c);
    if (i >= 0) caps.splice(i, 1);
    if (S.el === c.el) { if (S.mode === "capture") detach(); S.el = null; }
    c.stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) { /* ended */ } });
  }
  function capOf(el) {
    for (var i = 0; i < caps.length; i++) if (caps[i].el === el) return caps[i];
    var c = { el: el, stream: null };
    try { c.stream = el.captureStream(); } catch (e) { return null; }   // not this element now (a source of another origin), another may still be
    c.stream.addEventListener("addtrack", function () {   // a new source's track: the sound moves to it
      setTimeout(function () { if (caps.indexOf(c) >= 0 && heard() === el) { if (S.run) tap(el); else start(); } }, 0);
    });
    caps.push(c);
    return c;
  }
  function tapCapture(el) {
    if (S.capFail || typeof el.captureStream !== "function" || !sameOrigin(el)) return false;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    if (!S.ctx) {
      // to no device at all where the browser can (Chrome 110+), else to the default one, though nothing is ever connected to its destination
      try { try { S.ctx = new AC({ latencyHint: "playback", sinkId: { type: "none" } }); } catch (e) { S.ctx = new AC({ latencyHint: "playback" }); } } catch (e) { return false; }
    }
    var c = capOf(el), t = c ? newest(c) : null;
    if (c && !t && el.readyState >= 1) { drop(c); c = capOf(el); t = c ? newest(c) : null; }   // none live with its metadata in (ended by its end): caught anew
    if (!t) return S.mode === "capture" && S.el === el;      // the source's track not there yet: its addtrack brings it
    if (!(S.mode === "capture" && S.track === t)) {
      var ms;
      try { ms = S.ctx.createMediaStreamSource(new MediaStream([t])); } catch (e) { return false; }
      detach();
      if (!S.an || S.an.context !== S.ctx) { S.an = analyser(S.ctx); S.bins = null; }
      ms.connect(S.an);
      S.ms = ms; S.track = t; S.mode = "capture"; S.retaps++;
    }
    S.el = el;
    retire(c, t);
    caps.slice().forEach(function (x) { if (x.el !== el && x.el !== footer()) drop(x); });   // a compare version no longer heard, a footer replaced
    return true;
  }
  function tapGraph() {                // the footer's only: the boost's graph is made for its element alone
    var g = typeof window.ruachPlayerGraph === "function" ? window.ruachPlayerGraph() : null;
    if (!g || !g.ctx || !g.src) return false;
    if (S.mode === "graph" && S.gsrc === g.src) { S.el = footer(); return true; }
    detach();
    if (!S.an || S.an.context !== g.ctx) { S.an = analyser(g.ctx); S.bins = null; }
    try { g.src.connect(S.an); } catch (e) { return false; }   // a branch beside the gain that leads nowhere: what is heard stays the same
    S.gsrc = g.src; S.mode = "graph"; S.el = footer();
    return true;
  }
  function tap(el) { return tapCapture(el) || (el === footer() && tapGraph()); }
  function untap() {
    detach();
    caps.slice().forEach(drop);
    S.an = null; S.bins = null; S.el = null;
    if (S.ctx && S.ctx.state === "running") S.ctx.suspend().catch(noop);
  }

  // ------------------------------------------------------------ where: the empty room around the transport
  function edges(g) {                   // the left and right of what a group shows (its box is a whole grid column; its things sit at one side)
    if (!g || !g.getClientRects().length) return null;
    var l = Infinity, r = -Infinity;
    for (var c = g.firstElementChild; c; c = c.nextElementSibling) {
      if (!c.getClientRects().length) continue;
      var b = c.getBoundingClientRect();
      if (b.width < 1) continue;
      if (b.left < l) l = b.left;
      if (b.right > r) r = b.right;
    }
    return r > l ? { l: l, r: r } : null;
  }
  function measure() {
    var row = bar.querySelector(".pb-row"), wave = document.getElementById("wave"), ctrl = bar.querySelector(".pb-ctrl");
    if (!row || !wave || !ctrl || getComputedStyle(row).display !== "grid") return null;   // the one-row player (display: contents) has no empty room
    var br = bar.getBoundingClientRect(), wr = wave.getBoundingClientRect(), rr = row.getBoundingClientRect(), cr = ctrl.getBoundingClientRect();
    if (!(wr.height > 0) || !(cr.width > 0) || wr.bottom > rr.top + 1) return null;          // the wave not over the row
    var L = rr.left, R = rr.right;
    [bar.querySelector(".playbar-id"), bar.querySelector(".pb-side")].forEach(function (grp) {
      var e = edges(grp);               // by where each stands, not by its name: whichever side a direction puts it on
      if (!e) return;
      if (e.r <= cr.left + 1) L = Math.max(L, e.r);
      else if (e.l >= cr.right - 1) R = Math.min(R, e.l);
    });
    var ox = br.left + bar.clientLeft, oy = br.top + bar.clientTop;
    // HERESY 2357: REACH further into each side group than 2354's clearance, never past the bar's own box
    var x0 = Math.max(0, Math.round(L + SIDE_GAP - REACH - ox)), x1 = Math.min(bar.clientWidth, Math.round(R - SIDE_GAP + REACH - ox)), y0 = Math.round(wr.bottom - oy), y1 = bar.clientHeight;
    if (x1 - x0 < cr.width || y1 - y0 < 20) return null;
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  function plan(w, rate, nb, key) {     // each point's frequency and the bins it reads: a band of bins where it has some, else between two
    var n = Math.max(2, Math.round(w / STEP) + 1), hz = rate / (2 * nb), span = Math.log(F_HI / F_LO), half = Math.exp(span / (n - 1) / 2);
    var P = { key: key, n: n, dx: w / (n - 1), a: new Int32Array(n), b: new Int32Array(n), f: new Float32Array(n), t: new Float32Array(n) };
    for (var i = 0; i < n; i++) {
      var f = F_LO * Math.exp(span * i / (n - 1)), ka = Math.ceil(f / half / hz), kb = Math.min(nb - 1, Math.floor(f * half / hz));
      if (kb >= ka) { P.a[i] = ka; P.b[i] = kb; }
      else { var kf = f / hz; P.a[i] = Math.min(nb - 2, Math.floor(kf)); P.b[i] = -1; P.f[i] = kf - Math.floor(kf); }
      P.t[i] = TILT * Math.log(f / 1000) / Math.LN2;
    }
    S.P = P;
    if (!S.live || S.live.length !== n) { S.live = new Float32Array(n); S.tgt = new Float32Array(n); }
  }
  function tone() {                     // the player's accent in the theme in force, as the browser reads it
    var c = getComputedStyle(bar).getPropertyValue("--amber").trim() || "#c08040", m, rgb = null;
    cx.fillStyle = "#000"; cx.fillStyle = c;
    var n = String(cx.fillStyle);
    if ((m = /^#([0-9a-f]{6})$/i.exec(n))) rgb = [0, 2, 4].map(function (i) { return parseInt(m[1].substr(i, 2), 16); });
    else if ((m = /rgba?\(([^)]+)\)/.exec(n))) rgb = m[1].split(",").slice(0, 3).map(function (x) { return Math.round(+x) || 0; });
    S.rgb = rgb || [192, 128, 64];
    S.dark = document.documentElement.dataset.tone === "dark";
    S.grad = null;
  }
  function rgba(a) { return "rgba(" + S.rgb.join(",") + "," + a + ")"; }
  function paintGrad() {
    var A = S.dark ? ALPHA.dark : ALPHA.light, gr = cx.createLinearGradient(0, TOP_GAP, 0, S.geo.h);
    gr.addColorStop(0, rgba(A[0])); gr.addColorStop(1, rgba(A[1]));
    S.grad = gr; S.line = rgba(A[2]);
  }
  function place() {
    var g = measure();
    if (!g) { S.geo = null; cv.style.display = "none"; return false; }
    var dpr = window.devicePixelRatio || 1, key = [g.x, g.y, g.w, g.h, dpr].join("|");
    if (!S.geo || S.geo.key !== key) {
      g.key = key; g.dpr = dpr; S.geo = g;
      cv.style.left = g.x + "px"; cv.style.top = g.y + "px"; cv.style.width = g.w + "px"; cv.style.height = g.h + "px"; cv.style.display = "block";
      cv.width = Math.max(1, Math.round(g.w * dpr)); cv.height = Math.max(1, Math.round(g.h * dpr));
      cx.setTransform(cv.width / g.w, 0, 0, cv.height / g.h, 0, 0);
      S.grad = null;
    }
    var rate = S.an ? S.an.context.sampleRate : 48000, nb = S.an ? S.an.frequencyBinCount : 4096, pk = g.w + "|" + rate + "|" + nb;
    if (!S.P || S.P.key !== pk) plan(g.w, rate, nb, pk);
    return true;
  }

  // ------------------------------------------------------------ the loop
  function trace(area) {                // the curve through the points' midpoints; the foot 1 px under the canvas, so silence draws no line
    var P = S.P, live = S.live, h = S.geo.h, span = h + 1 - TOP_GAP, dx = P.dx, x0 = 0, y0 = h + 1 - live[0] * span;
    if (area) { cx.moveTo(0, h + 1); cx.lineTo(0, y0); } else cx.moveTo(0, y0);
    for (var i = 1; i < P.n; i++) {
      var x1 = i * dx, y1 = h + 1 - live[i] * span;
      cx.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
      x0 = x1; y0 = y1;
    }
    cx.lineTo(x0, y0);
  }
  function draw() {
    var g = S.geo;
    cx.clearRect(0, 0, g.w, g.h);
    if (S.peak < 0.004) return;
    cx.beginPath(); trace(true); cx.lineTo(g.w, g.h + 1); cx.closePath();
    cx.fillStyle = S.grad; cx.fill();
    cx.beginPath(); trace(false);
    cx.lineWidth = 1; cx.lineJoin = "round"; cx.strokeStyle = S.line; cx.stroke();
  }
  function frame(now) {
    S.raf = 0;
    if (!S.run) return;
    S.raf = requestAnimationFrame(frame);
    var dt = S.last ? (now - S.last) / 1000 : 1 / 60;
    if (S.last && dt < 0.013) return;   // a screen faster than 75 Hz: every other frame
    S.last = now;
    if (dt > 0.1) dt = 0.1;
    var t0 = performance.now();
    if (S.dirty || now - S.measured > 1000) {   // the room measured again once a second, or when a box it hangs on changed
      S.measured = now; S.dirty = false;
      if (!enabled() || !place()) { halt(); return; }
    }
    if (!S.rgb) tone();
    if (!S.grad) paintGrad();
    var P = S.P, n = P.n, live = S.live, tgt = S.tgt, i, k, v, peak = 0;
    if (!S.falling && S.an) {
      if (!S.bins || S.bins.length !== S.an.frequencyBinCount) S.bins = new Uint8Array(S.an.frequencyBinCount);
      S.an.getByteFrequencyData(S.bins);
      var b = S.bins, lo = S.an.minDecibels, step = (S.an.maxDecibels - lo) / 255, nb = b.length - 1, x;
      for (i = 0; i < n; i++) {
        if (P.b[i] < 0) { k = P.a[i]; v = k >= nb ? b[nb] : b[k] + (b[k + 1] - b[k]) * P.f[i]; }
        else { v = 0; for (k = P.a[i]; k <= P.b[i]; k++) if (b[k] > v) v = b[k]; }
        x = v > 0 ? (lo + v * step + P.t[i] - DB_LO) / (DB_HI - DB_LO) : 0;
        tgt[i] = x < 0 ? 0 : x > 1 ? 1 : x;
      }
    } else tgt.fill(0);
    // across, each point with its neighbours (1-2-1); in time, up fast and down slow
    var up = 1 - Math.exp(-dt / RISE), down = 1 - Math.exp(-dt / FALL), prev = tgt[0], cur, s;
    for (i = 0; i < n; i++) {
      cur = tgt[i];
      s = (prev + 2 * cur + (i + 1 < n ? tgt[i + 1] : cur)) / 4;
      prev = cur;
      live[i] += (s - live[i]) * (s > live[i] ? up : down);
      if (live[i] > peak) peak = live[i];
    }
    S.peak = peak;
    draw();
    S.work += performance.now() - t0; S.frames++;
    if (S.falling && peak < 0.004) halt();
  }
  function start() {
    if (!wanted() || !tap(heard())) return;
    if (S.mode === "capture" && S.ctx && S.ctx.state !== "running") S.ctx.resume().catch(noop);
    S.falling = false;
    if (!S.run) { S.run = true; S.last = 0; S.dirty = true; S.raf = requestAnimationFrame(frame); }
  }
  function breatheOut() { if (S.run) S.falling = true; }   // paused or stopped: the curve settles to nothing, then the loop ends
  function halt() {                     // at once: out of sight, switched off, nowhere to stand, or settled
    S.run = false; S.falling = false; S.peak = 0;
    if (S.raf) cancelAnimationFrame(S.raf);
    S.raf = 0;
    if (S.live) S.live.fill(0);
    if (cx) { cx.save(); cx.setTransform(1, 0, 0, 1, 0, 0); cx.clearRect(0, 0, cv.width, cv.height); cx.restore(); }
    if (S.mode === "capture" && S.ctx && S.ctx.state === "running") S.ctx.suspend().catch(noop);   // its thread rests with the picture
  }
  function sync() {
    if (enabled()) { start(); return; }
    halt(); untap();
  }

  // ------------------------------------------------------------ set up
  function moved() {                    // a box it hangs on changed: measured again; a room that had no place for it (one row) may have one now
    S.dirty = true;
    if (!S.run && heard()) start();
  }
  // HERESY 2357: the play state of whatever the player plays. The footer's <audio> through the document (its events reach a capturing listener
  // there, whichever element is #audio now); a compare version (not in the document) through listeners of its own, put on when app.js says it starts
  function onMedia(e) {
    var el = e.target;
    if (el !== footer()) {
      if (!known || !known.has(el)) return;                 // the page's other players (a stem, a preview) are theirs, not the player's
      if (e.type === "play" || e.type === "playing") other = el;
      else if (el !== other) return;
      else if (e.type === "emptied") { other = null; caps.slice().forEach(function (c) { if (c.el === el) drop(c); }); }   // the window closed: its capture let go
    }
    if (heard()) start(); else breatheOut();
  }
  function adopt(el) {                  // a compare window's version starts: the player's sound is there until the footer plays again
    if (!known || !el || el === footer() || !el.dataset || el.dataset.oneSound !== "compare") return;
    if (!known.has(el)) { known.add(el); MEDIA.forEach(function (n) { el.addEventListener(n, onMedia); }); }
    other = el;
  }
  function init() {
    bar = document.getElementById("playbar");
    var audio = footer();
    if (!bar || !audio || cv) return;
    var st = document.createElement("style");
    st.id = "pbSpecStyle";              // its rules name .playbar, so heresy-rtl.js never swaps a side of them
    st.textContent = ".playbar > .pb-spec { position: absolute; z-index: -1; display: none; pointer-events: none;" +
      " -webkit-mask-image: linear-gradient(90deg, transparent, #000 48px, #000 calc(100% - 48px), transparent);" +
      " mask-image: linear-gradient(90deg, transparent, #000 48px, #000 calc(100% - 48px), transparent); }\n" +
      "@media (prefers-reduced-motion: reduce) { .playbar > .pb-spec { display: none !important; } }";
    document.head.appendChild(st);
    cv = document.createElement("canvas");
    cv.className = "pb-spec";           // under the player's own things (z-index -1 in the bar's stacking context), above its see-through background
    cv.setAttribute("aria-hidden", "true");
    bar.insertBefore(cv, audio);
    cx = cv.getContext("2d");
    if (window.ResizeObserver) {
      var ro = new ResizeObserver(moved);
      [bar, bar.querySelector(".pb-row"), bar.querySelector(".pb-ctrl"), document.getElementById("wave")].forEach(function (e) { if (e) ro.observe(e); });
      [bar.querySelector(".playbar-id"), bar.querySelector(".pb-side")].forEach(function (g) {
        if (!g) return;
        ro.observe(g);
        for (var c = g.firstElementChild; c; c = c.nextElementSibling) ro.observe(c);   // a title, a mark or a switch coming or going moves the room's edge
      });
    }
    window.addEventListener("resize", moved);
    if (window.MutationObserver) new MutationObserver(function () { S.rgb = null; S.grad = null; })
      .observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-tone"] });
    MEDIA.forEach(function (n) { document.addEventListener(n, onMedia, true); });   // HERESY 2357: media events do not bubble; captured here they come
    window.addEventListener("ruach-sound", function (e) { adopt(e.detail); });   // HERESY 2357: app.js's one sound at a time names the element starting
    document.addEventListener("visibilitychange", function () { if (document.hidden) halt(); else start(); });
    if (reduce) { if (reduce.addEventListener) reduce.addEventListener("change", sync); else if (reduce.addListener) reduce.addListener(sync); }
    document.addEventListener("change", function (e) {   // its switch in Engine → Defaults (app.js keeps the key)
      if (e.target && e.target.matches && e.target.matches('[data-def-check="' + KEY + '"]')) setTimeout(sync, 0);
    });
    document.addEventListener("click", function (e) { if (e.target && e.target.closest && e.target.closest("#defaultsReset")) setTimeout(sync, 0); });
    window.addEventListener("storage", function (e) { if (e.key === KEY) sync(); });
    window.addEventListener("ruach-player-graph", function () { setTimeout(function () { if (S.mode !== "capture") start(); }, 0); });   // HERESY 2357: started, not only re-tapped
    ["pointerdown", "keydown"].forEach(function (ev) {   // a context made before the page had a hand waits for one
      document.addEventListener(ev, function () { if (S.run && S.mode === "capture" && S.ctx && S.ctx.state === "suspended") S.ctx.resume().catch(noop); }, true);
    });
    if (heard()) start();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();

  window.HeresyLiveSpec = {             // for the checks
    state: function () {
      var c = null, f = footer();
      for (var i = 0; i < caps.length; i++) if (caps[i].el === S.el) c = caps[i];
      return { on: enabled(), run: S.run, falling: S.falling, mode: S.mode, ctx: S.ctx ? S.ctx.state : "", peak: S.peak, points: S.P ? S.P.n : 0,
               geo: S.geo ? { x: S.geo.x, y: S.geo.y, w: S.geo.w, h: S.geo.h, dpr: S.geo.dpr } : null, canvas: cv ? [cv.width, cv.height] : null,
               // HERESY 2357: whose sound, the tracks of its capture (one, the newest), how often it moved to a new source's track, the old ones let go
               el: !S.el ? "" : S.el === f ? "footer" : S.el === other ? "compare" : "other", caps: caps.length,
               tracks: c ? c.stream.getAudioTracks().map(function (t) { return t.readyState; }).join(",") : "", newest: !!(c && S.track && newest(c) === S.track),
               retaps: S.retaps, retired: S.retired };
    },
    resetStats: function () { S.frames = 0; S.work = 0; S.since = performance.now(); },
    stats: function () { var t = (performance.now() - S.since) / 1000; return { frames: S.frames, seconds: t, fps: t > 0 ? S.frames / t : 0, msPerFrame: S.frames ? S.work / S.frames : 0 }; },
    sync: sync,
    useGraph: function () { untap(); S.capFail = true; halt(); start(); }   // the path a browser without captureStream takes, tried in Chrome
  };
})();
