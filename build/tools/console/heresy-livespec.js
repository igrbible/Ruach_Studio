// HERESY 2354 (Viktor 10.11.2026: «один заказ по визуалу мега плеера. По центру в зоне кнопок проигрывания по ширине и в охвате пустого места вмонтировать
// живую волну в полном диапазоне от 25Hz до 20kHz как бекграунд. Нижний пиксел волны, которая только вверх имеет свои пики, привязываем к самому нижнему
// [краю] плеера, а сверху оставляем порог где-то в 4-5 пикселов.»): the live spectrum behind the two-row player's transport. It spans the empty room
// between the take's group on the left and the times and switches on the right, from under the take's wave down to the player's very last pixel, its
// peaks stopping 5 px under the wave; 25 Hz on the left to 20 kHz on the right on a log axis, rising only upward from the foot, in the player's own
// accent, faint, so it reads as air and not as a meter. The buttons stay over it and take every click (it lies under them and takes no pointer).
//
// HERESY 2849 (18.11.2026: with this switch off Viktor heard not one click in four takes, on it dull clicks in a take's first quarter): it no longer
// listens to the sound at all. 2354 to 2357 fed it Chrome's captureStream() of the <audio> into an AudioContext of its own, and that tap alone
// disturbed Chrome's playback of the element. Now it reads the TAKE ITSELF at the element's currentTime: the lab's spectrogram that the wave's
// scope already fetches (heresy-spectrum.js, /lab/spectrum, one fetch and one cache for both), or, with no lab, the same spectrogram computed in a
// worker from the bytes the page already holds (the whole take kept in the page, decoded once; a streamed take «at once» waits for the lab alone:
// nothing is fetched beside the element's own stream). No captureStream, no MediaElementSource, no MediaStreamSource, no context near the element:
// what is heard is the element alone. Pause, seek and rate follow, as currentTime does. The level reads as the analyser read it: the last 0.17 s
// of the take (the old analyser's 8192 samples) averaged and 9 dB under the lab's scaling (measured 18.11 on three takes, old and new side by side:
// the frame's highest point 0.82/0.77/0.81 against 0.81/0.76/0.81 in the median, the top third 0.58/0.33/0.36 against 0.59/0.35/0.37).
//
// One requestAnimationFrame loop, only while a take plays, the page is in sight and the switch is on (Engine → Defaults, «Live spectrum behind the
// player», on by default); paused or stopped, the curve breathes out in about a second and the loop ends. Reduced motion: nothing is drawn.
// Right to left (Hebrew): the lows stay on the left; a spectrum is a scale of frequency, not a line of text (heresy-rtl.js keeps the player ltr).
//
// HERESY 2357 (Viktor 11.11.2026: «Та живая волна спектральная, которую добавили ночью, а увидел её всего лишь на одном треке. После выхода из
// сравнителя её также нет в плеере. И можно расширить её по бокам на 100 пикселов с каждой стороны.»): it follows whatever the player plays: the
// footer's <audio> looked up again at each event, and the compare window's version while that window has the player's sound (app.js's one-sound
// says which element starts: the «ruach-sound» event), given back when the footer plays again. It reaches 100 px further into each side group,
// under them (no pointer, under their buttons), faded at its new ends.
(function () {
  "use strict";

  var F_LO = 25, F_HI = 20000;        // the axis, Hz, log, the lows on the left in every language
  var TOP_GAP = 5;                    // px left clear between the curve's highest reach and the wave above it
  var SIDE_GAP = 12;                  // px left clear of the take's group and of the times and switches (2354)
  var REACH = 100;                    // HERESY 2357: px further into each side group than that, under its things, the fade at the new ends
  var STEP = 3;                       // px between the curve's points
  // the level at the foot and at full height, after the tilt (measured on the takes of 01.11 as this file computes them: the highest point of a
  // frame at 0.76–0.81 of the height in the median, 0.87–0.91 at the 95th percentile, never clipped; the 6–20 kHz third at 0.26–0.43)
  var DB_LO = -98, DB_HI = -30, DB_FLOOR = -110;
  var TILT = 4.5;                     // dB an octave about 1 kHz, as the mixing analysers show it: music falls about so, untilted the highs lie on the floor
  var RISE = 0.05, FALL = 0.32;       // s: up quickly, down slowly, so it breathes and never flickers
  var WIN = 0.17;                     // HERESY 2849: s of the take each picture reads, back from the playhead (the old analyser's 8192 samples)
  var OFFSET = -9;                    // HERESY 2849: dB from the lab's scaling (|X|/sum(Hann 2048)) to the old analyser's (Blackman 8192, |X|/N)
  var KEEP = 4;                       // HERESY 2849: spectrograms made here kept (about 9 MB for 7 minutes each)
  var KEY = "yue2.liveSpectrum";      // Engine → Defaults: "off" turns it off, nothing kept means on
  var ALPHA = { dark: [0.30, 0.05, 0.46], light: [0.20, 0.035, 0.34] };   // the fill at the top and at the foot, the edge's line

  var bar = null, cv = null, cx = null;
  var S = { run: false, raf: 0, falling: false, last: 0, el: null, gdb: 0, mag: null, at: -1,
            P: null, live: null, tgt: null, geo: null, dirty: true, measured: 0, rgb: null, dark: false, grad: null, line: "",
            peak: 0, frames: 0, work: 0, since: 0 };
  // HERESY 2849: the spectrogram of the take heard: D.key its address, D.data when in hand ({sr, hop, frames, bins, db: Float32Array dB, or
  // q: Uint8Array 0.5 dB steps from -120}), D.where whence ("lab", "page"), D.why when there is none
  var D = { key: "", token: 0, data: null, where: "", why: "", retry: 0 };
  var made = [];                      // HERESY 2849: the ones made here, {key, data}, the newest first
  var other = null, known = typeof WeakSet === "function" ? new WeakSet() : null;
  var MEDIA = ["play", "playing", "pause", "ended", "emptied", "seeked"];
  var reduce = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  var LUT = new Float32Array(256);    // a 0.5 dB step's magnitude
  for (var li = 0; li < 256; li++) LUT[li] = Math.pow(10, (-120 + li * 0.5) / 20);

  function recall(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function enabled() { return recall(KEY) !== "off" && !(reduce && reduce.matches); }
  function footer() { return document.getElementById("audio"); }   // looked up each time: a new <audio> in its place is the player
  function sounding(a) { return !!a && !!(a.currentSrc || a.getAttribute("src")) && !a.paused && !a.ended; }
  function heard() { var f = footer(); return sounding(f) ? f : sounding(other) ? other : null; }   // the footer's own first, else the compare's that has its sound
  function wanted() { return !!cv && enabled() && !document.hidden && !!heard(); }

  // ------------------------------------------------------------ the take's own spectrum (HERESY 2849)
  // which take an element plays: the footer's from app.js (its name for the lab, the whole take when the page holds it, whether it streams);
  // a compare version's from what heresy-derived.js wrote on it
  function takeOf(el) {
    if (!el) return null;
    if (el === footer()) return typeof window.ruachSpecTake === "function" ? window.ruachSpecTake() : null;
    var url = el.dataset.specUrl || el.getAttribute("src") || "";
    if (!url) return null;
    return { name: el.dataset.take || "", url: url, whole: /^blob:/.test(url) ? url : "", streamed: false };
  }
  function keep(key, data) {
    made = made.filter(function (m) { return m.key !== key; });
    made.unshift({ key: key, data: data });
    if (made.length > KEEP) made.length = KEEP;
  }
  // in a worker: the take's samples in, the spectrogram out as the lab makes it (lab/spectrum_job.py: periodic Hann 2048, hop 2048, half a window
  // of zeros at both ends, |X|/sum(window), 0.5 dB steps from -120 dB), so both sources read alike
  function work() {
    var N = 2048, HOP = 2048, BINS = N / 2 + 1, LOG2N = 11;
    self.onmessage = function (e) {
      var x = e.data.x, n = x.length, i, b, f, k;
      var w = new Float64Array(N), ws = 0, rev = new Uint32Array(N), cs = new Float64Array(N / 2), sn = new Float64Array(N / 2);
      for (i = 0; i < N; i++) { w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N); ws += w[i]; }
      for (i = 0; i < N; i++) { var r = 0, v = i; for (b = 0; b < LOG2N; b++) { r = (r << 1) | (v & 1); v >>= 1; } rev[i] = r; }
      for (i = 0; i < N / 2; i++) { cs[i] = Math.cos(2 * Math.PI * i / N); sn[i] = -Math.sin(2 * Math.PI * i / N); }
      var frames = Math.floor(n / HOP) + 1, q = new Uint8Array(frames * BINS), re = new Float64Array(N), im = new Float64Array(N);
      for (f = 0; f < frames; f++) {
        var at = f * HOP - N / 2;
        for (i = 0; i < N; i++) { var j = at + i; re[rev[i]] = (j >= 0 && j < n ? x[j] : 0) * w[i]; im[rev[i]] = 0; }
        for (var size = 2; size <= N; size <<= 1) {
          var h = size >> 1, st = N / size;
          for (var s0 = 0; s0 < N; s0 += size) for (var m = 0; m < h; m++) {
            var tc = cs[m * st], ts = sn[m * st], p = s0 + m, o = p + h, tr = re[o] * tc - im[o] * ts, ti = re[o] * ts + im[o] * tc;
            re[o] = re[p] - tr; im[o] = im[p] - ti; re[p] += tr; im[p] += ti;
          }
        }
        for (k = 0; k < BINS; k++) {
          var q2 = Math.round((20 * Math.log10(Math.sqrt(re[k] * re[k] + im[k] * im[k]) / ws + 1e-10) + 120) * 2);
          q[f * BINS + k] = q2 < 0 ? 0 : q2 > 255 ? 255 : q2;
        }
      }
      self.postMessage({ q: q, frames: frames, bins: BINS, hop: HOP, sr: e.data.sr }, [q.buffer]);
    };
  }
  // the bytes the page holds, decoded once (decodeAudioData of an offline context: a decoder, joined to nothing), measured in the worker
  function inPage(url) {
    var rate = 48000;
    return fetch(url).then(function (r) { if (!r.ok) throw new Error("the page's copy answered " + r.status); return r.arrayBuffer(); }).then(function (buf) {
      var OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      if (!OAC) throw new Error("no decoder");
      return new OAC(1, 2, rate).decodeAudioData(buf);
    }).then(function (au) {
      var n = au.length, ch = au.numberOfChannels, x = new Float32Array(n);
      for (var c = 0; c < ch; c++) { var d = au.getChannelData(c); for (var i = 0; i < n; i++) x[i] += d[i] / ch; }
      return new Promise(function (resolve, reject) {
        var wk;
        try { wk = new Worker("data:text/javascript;charset=utf-8," + encodeURIComponent("(" + work.toString() + ")();")); } catch (e) { reject(e); return; }
        wk.onmessage = function (e) { wk.terminate(); resolve(e.data); };
        wk.onerror = function (e) { wk.terminate(); reject(new Error(e && e.message || "the worker failed")); };
        wk.postMessage({ x: x, sr: au.sampleRate }, [x.buffer]);
      });
    });
  }
  function resolve(el) {
    var s = takeOf(el);
    if (!s || !s.url) { if (D.key) { D.key = ""; D.data = null; D.where = ""; } D.why = s ? "no address" : "no take"; return; }
    if (D.key === s.url && (D.data || D.why === "coming" || performance.now() < D.retry)) return;
    var token = ++D.token;
    D.key = s.url; D.data = null; D.where = ""; D.why = "coming"; D.retry = 0;
    for (var i = 0; i < made.length; i++) if (made[i].key === s.url) { D.data = made[i].data; D.where = "page"; D.why = ""; return; }
    var got = function (data, where) {
      if (token !== D.token) return;
      D.data = data; D.where = where; D.why = "";
      S.dirty = true;
      if (heard() && !S.run) start();
    };
    var none = function (why, later) { if (token === D.token) { D.why = why; D.retry = performance.now() + (later ? 2000 : 1e9); } };
    var here = function (why) {
      if (s.whole) return inPage(s.whole).then(function (d) {
        var data = { sr: d.sr, hop: d.hop, frames: d.frames, bins: d.bins, q: d.q, db: null };
        keep(s.url, data); got(data, "page");
      }, function (e) { none("not measured here: " + (e && e.message || e), false); });
      // a take streamed «at once» (2837): nothing is fetched beside the element's own stream; a whole take not in the page yet: asked again soon
      none(why + (s.streamed ? "; streamed, nothing fetched beside it" : "; the whole take not in the page yet"), !s.streamed);
    };
    var H = window.HeresySpectrum;
    if (s.name && H && typeof H.labData === "function") {
      H.labData({ name: s.name, url: s.url }).then(function (d) {
        got({ sr: d.sr || 48000, hop: d.spec.hop, frames: d.spec.frames, bins: d.spec.bins, db: d.spec.db, q: null }, "lab");
      }, function (e) { if (token === D.token) here("no lab spectrum (" + (e && e.message || e) + ")"); });
    } else here("no lab name");
  }
  // the take's magnitudes over the last WIN seconds before t, each frame weighted by how much of the window it covers (a frame spans half a hop
  // each side of its centre), into S.mag up to the plan's highest bin
  function read(t) {
    var d = D.data, P = S.P;
    if (!d || !P) return false;
    var fh = d.hop / d.sr, a = t - WIN, k0 = Math.max(0, Math.floor(a / fh + 0.5)), k1 = Math.min(d.frames - 1, Math.floor(t / fh + 0.5));
    if (k1 < k0) return false;
    var top = Math.min(d.bins - 1, P.top), mag = S.mag, k, f, wsum = 0;
    if (!mag || mag.length < d.bins) mag = S.mag = new Float32Array(d.bins);
    for (k = 0; k <= top; k++) mag[k] = 0;
    for (f = k0; f <= k1; f++) {
      var w = Math.min(t, (f + 0.5) * fh) - Math.max(a, (f - 0.5) * fh);
      if (!(w > 0)) continue;
      wsum += w;
      var o = f * d.bins;
      if (d.q) { for (k = 0; k <= top; k++) mag[k] += w * LUT[d.q[o + k]]; }
      else { for (k = 0; k <= top; k++) mag[k] += w * Math.pow(10, d.db[o + k] / 20); }
    }
    if (!(wsum > 0)) return false;
    for (k = 0; k <= top; k++) mag[k] /= wsum;
    S.at = k1;
    return true;
  }
  function gainDb(el) {               // a lifted take (2835) plays a copy raised by its gain: the picture rises with it
    var c = null;
    try { c = window.RuachStudioAudio && el ? window.RuachStudioAudio.of(el.getAttribute("src") || "") : null; } catch (e) { c = null; }
    return c && c.g > 0 ? 20 * Math.log10(c.g) : 0;
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
    var P = { key: key, n: n, dx: w / (n - 1), a: new Int32Array(n), b: new Int32Array(n), f: new Float32Array(n), t: new Float32Array(n), top: 1 };
    for (var i = 0; i < n; i++) {
      var f = F_LO * Math.exp(span * i / (n - 1)), ka = Math.ceil(f / half / hz), kb = Math.min(nb, Math.floor(f * half / hz));
      if (kb >= ka) { P.a[i] = ka; P.b[i] = kb; P.top = Math.max(P.top, kb); }
      else { var kf = f / hz; P.a[i] = Math.min(nb - 1, Math.floor(kf)); P.b[i] = -1; P.f[i] = kf - Math.floor(kf); P.top = Math.max(P.top, P.a[i] + 1); }
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
  function gradFor(c, h) {
    var A = S.dark ? ALPHA.dark : ALPHA.light, gr = c.createLinearGradient(0, TOP_GAP, 0, h);
    gr.addColorStop(0, rgba(A[0])); gr.addColorStop(1, rgba(A[1]));
    return gr;
  }
  function paintGrad() {                // HERESY 3010: the player's fill when it has a room ("none" while it has not), the copy's made anew
    var A = S.dark ? ALPHA.dark : ALPHA.light;
    S.grad = S.geo ? gradFor(cx, S.geo.h) : "none"; S.line = rgba(A[2]); M.grad = null;
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
    replan();
    return true;
  }
  function replan() {                   // the points read the bins of the spectrogram in hand (HERESY 2849: its rate and its bins, 1025 for both sources)
    var w = S.geo ? S.geo.w : M.g ? M.g.w : 0;   // HERESY 3010: by the compare window's copy where the player has no room
    if (!w) return;
    var d = D.data, rate = d ? d.sr : 48000, nb = d ? d.bins - 1 : 1024, pk = w + "|" + rate + "|" + nb;
    if (!S.P || S.P.key !== pk) plan(w, rate, nb, pk);
  }
  // HERESY 3010 (Viktor 25.11.2026: «В сравнителе пустует бОльшая часть верхней части окна… Прикрути дублем живую волну, которая у нас в
  // мини-плеере играет… шириной в пикселов 800»): the same curve on a second canvas, the compare window's head (heresy-derived.js hands it here as
  // the window opens and takes it back as it closes): the same frame of the same version heard, nothing read twice, no analyser; drawn at the
  // canvas's own size, the log axis stretched to it; under 160 px wide (a narrow window) not drawn and out of sight. It keeps the loop going
  // where the player has no room of its own (the one-row player)
  var M = { cv: null, cx: null, g: null, grad: null, frames: 0, ro: null };
  function mplace() {
    var c = M.cv;
    if (!c || !c.isConnected) { M.g = null; return false; }
    var w = c.clientWidth, h = c.clientHeight, dpr = window.devicePixelRatio || 1;
    c.style.visibility = w < 160 ? "hidden" : "";
    if (w < 160 || h < 12) { M.g = null; return false; }
    var key = [w, h, dpr].join("|");
    if (!M.g || M.g.key !== key) {
      c.width = Math.max(1, Math.round(w * dpr)); c.height = Math.max(1, Math.round(h * dpr));
      M.cx.setTransform(c.width / w, 0, 0, c.height / h, 0, 0);
      M.g = { w: w, h: h, key: key }; M.grad = null;
    }
    return true;
  }
  function mclear() { if (M.cx && M.cv) { M.cx.save(); M.cx.setTransform(1, 0, 0, 1, 0, 0); M.cx.clearRect(0, 0, M.cv.width, M.cv.height); M.cx.restore(); } }
  function mirror(c) {
    if (M.cv && M.cv !== c) mclear();
    if (M.ro) { M.ro.disconnect(); M.ro = null; }
    M.cv = c || null; M.cx = c ? c.getContext("2d") : null; M.g = null; M.grad = null;
    if (c && window.ResizeObserver) { M.ro = new ResizeObserver(function () { mplace(); moved(); }); M.ro.observe(c); }   // seen at once, the loop running or not
    S.dirty = true;
    if (c && !S.run && heard()) start();
  }

  // ------------------------------------------------------------ the loop
  function trace(c, g, area) {          // the curve through the points' midpoints; the foot 1 px under the canvas, so silence draws no line (HERESY 3010: on c, at g's size)
    var P = S.P, live = S.live, h = g.h, span = h + 1 - TOP_GAP, dx = g.w / (P.n - 1), x0 = 0, y0 = h + 1 - live[0] * span;
    if (area) { c.moveTo(0, h + 1); c.lineTo(0, y0); } else c.moveTo(0, y0);
    for (var i = 1; i < P.n; i++) {
      var x1 = i * dx, y1 = h + 1 - live[i] * span;
      c.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
      x0 = x1; y0 = y1;
    }
    c.lineTo(x0, y0);
  }
  // HERESY 2856 (Viktor 19.11.2026: «В самый подвал полупрозрачно очерти семь зон… рисочки с их меточками, чтобы они не сливались с плеером, но
  // были видны как разделители диапазонов… сверх верха… вынеси вправо»): sub to 60 Hz, low to 250, low-mid to 500, mid to 2 kHz, high-mid to 4 kHz,
  // highs to 20 kHz on the curve's own log axis (nothing of the curve moves); every other zone a faint floor band, a tick and its number at each
  // border; above 20 kHz only said at the right, inside the edge's fade, since it almost never shows
  var ZONE_EDGES = [60, 250, 500, 2000, 4000], ZONE_SAID = { 60: "60", 250: "250", 500: "500", 2000: "2k", 4000: "4k" };
  function zones(c, g) {
    var span = Math.log(F_HI / F_LO), X = function (f) { return g.w * Math.log(f / F_LO) / span; }, all = [F_LO].concat(ZONE_EDGES, [F_HI]);
    c.save();
    c.fillStyle = S.line; c.strokeStyle = S.line; c.lineWidth = 1;
    c.globalAlpha = 0.07;
    for (var i = 1; i < all.length - 1; i += 2) c.fillRect(X(all[i]), g.h - 5, X(all[i + 1]) - X(all[i]), 5);
    c.globalAlpha = 0.38;
    c.font = "9px " + (getComputedStyle(bar).fontFamily || "sans-serif"); c.textBaseline = "bottom";
    c.textAlign = "left";
    ZONE_EDGES.forEach(function (f) {
      var x = Math.round(X(f)) + 0.5;
      c.beginPath(); c.moveTo(x, g.h); c.lineTo(x, g.h - 7); c.stroke();
      c.fillText(ZONE_SAID[f], x + 2, g.h - 1);
    });
    c.textAlign = "right"; c.fillText("20k \u203a", g.w - 50, g.h - 1);
    c.restore();
  }
  function paint(c, g, grad) {
    c.clearRect(0, 0, g.w, g.h);
    if (S.peak < 0.004) return;
    c.beginPath(); trace(c, g, true); c.lineTo(g.w, g.h + 1); c.closePath();
    c.fillStyle = grad; c.fill();
    c.beginPath(); trace(c, g, false);
    c.lineWidth = 1; c.lineJoin = "round"; c.strokeStyle = S.line; c.stroke();
    zones(c, g);
  }
  function draw() {                     // HERESY 3010: the player's room, and the compare window's copy where there is one
    if (S.geo) paint(cx, S.geo, S.grad);
    if (M.g) { if (!M.grad) M.grad = gradFor(M.cx, M.g.h); paint(M.cx, M.g, M.grad); M.frames++; }
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
    var el = heard();
    if (el && el !== S.el) { S.el = el; S.dirty = true; }
    if (S.dirty || now - S.measured > 1000) {   // the room measured again once a second, or when a box it hangs on changed
      S.measured = now; S.dirty = false;
      var on = enabled(), placed = on && place(), mirrored = on && mplace();   // HERESY 3010: the compare window's copy keeps it going without the player's room
      if (!placed && !mirrored) { halt(); return; }
      if (!placed) replan();
      if (S.el) { resolve(S.el); replan(); S.gdb = gainDb(S.el); }
    }
    if (!S.rgb) tone();
    if (!S.grad) paintGrad();
    var P = S.P, n = P.n, live = S.live, tgt = S.tgt, i, k, v, peak = 0;
    if (!S.falling && el && read(el.currentTime || 0)) {
      var m = S.mag, add = OFFSET + S.gdb, x;
      for (i = 0; i < n; i++) {
        if (P.b[i] < 0) { k = P.a[i]; v = m[k] + (m[k + 1] - m[k]) * P.f[i]; }
        else { v = 0; for (k = P.a[i]; k <= P.b[i]; k++) if (m[k] > v) v = m[k]; }
        v = v > 0 ? 20 * Math.log10(v) + add : -999;
        x = v > DB_FLOOR ? (v + P.t[i] - DB_LO) / (DB_HI - DB_LO) : 0;
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
    if (!wanted()) return;
    var el = heard();
    if (el !== S.el) { S.el = el; S.dirty = true; }
    resolve(el);
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
    mclear();                           // HERESY 3010
  }
  function sync() {
    if (enabled()) { start(); return; }
    halt();
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
      else if (e.type === "emptied") other = null;          // the window closed
    }
    if (e.type === "emptied" || e.type === "play") S.dirty = true;   // HERESY 2849: a new source may be a new take: its spectrum looked up again
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
    if (heard()) start();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();

  window.HeresyLiveSpec = {             // for the checks
    state: function () {
      var f = footer(), sig = 0;
      if (S.live) for (var i = 0; i < S.live.length; i++) sig += S.live[i];
      return { on: enabled(), run: S.run, falling: S.falling, peak: S.peak, points: S.P ? S.P.n : 0,
               geo: S.geo ? { x: S.geo.x, y: S.geo.y, w: S.geo.w, h: S.geo.h, dpr: S.geo.dpr } : null, canvas: cv ? [cv.width, cv.height] : null,
               el: !S.el ? "" : S.el === f ? "footer" : S.el === other ? "compare" : "other",
               // HERESY 2849: whence the take's spectrum (lab, page), its address, why there is none, the frame read last, the sum of the curve, the lift's dB
               source: D.where, key: D.key, why: D.why, frames: D.data ? D.data.frames : 0, at: S.at, sig: sig, gainDb: S.gdb, made: made.length,
               t: S.el ? S.el.currentTime : 0, paused: S.el ? S.el.paused : true,
               mirror: M.g ? [M.g.w, M.g.h] : null, mirrorFrames: M.frames, mirrorCanvas: M.cv ? [M.cv.width, M.cv.height] : null };   // HERESY 3010
    },
    resetStats: function () { S.frames = 0; S.work = 0; S.since = performance.now(); },
    stats: function () { var t = (performance.now() - S.since) / 1000; return { frames: S.frames, seconds: t, fps: t > 0 ? S.frames / t : 0, msPerFrame: S.frames ? S.work / S.frames : 0 }; },
    sync: sync,
    mirror: mirror                      // HERESY 3010: the compare window's head hands its canvas here (null takes it back)
  };
})();
