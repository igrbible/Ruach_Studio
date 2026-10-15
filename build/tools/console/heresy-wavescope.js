// HERESY 1169 · 1374 (Viktor 11.10.2026: «когда я навожу мышку на волну трека в полноформатном трейлере, выводить спектральный граф
// полной длиной на весь трек, а тултип с отрезком текста выше. Займёт наверное около 30-40% высоты всей страницы, но это норм.
// Максимум анализа по волне»): the wave's scope. The pointer on the full player's wave (two rows, the wave across: the Creator, the
// Refiner, the Librarian) brings the whole take's spectrogram up over the player a quarter second later, as wide as the wave and in
// time with it pixel for pixel, about a third of the window high; the section's card (app.js wavePop) stands over it. The take is
// measured once, by the lab: heresy-spectrum.js's spectrum (HERESY 1020), one cache with the take card's Spectrum. Drawn: the
// spectrogram (log or linear), the sections, the spectral centroid as a line (where the sound's weight sits: its brightness), the RMS
// in a lane at the foot with the take's own average dashed, the playhead; under the pointer its time, the spectrum of that moment
// beside the line with its loudest frequency, and inside the picture the frequency there, its note and its level. A click goes there
// as on the wave; the pointer leaving the wave and the scope, or Esc, takes it down; a click on the wave before it comes only goes there.
(function () {
  "use strict";

  var SHOW_MS = 250, HEAD_H = 24, PROFILE_W = 120;
  var TEXT = "#e8d5a0", AMBER = "#ff8c28", MAGENTA = "#ff5ce1", NAME = "#ffd27a";   // the centroid magenta: no colour of the palette
  var LO = -80;                                    // the colours' floor, dB, as the take card's spectrogram
  var BANDS = ["SUB", "LOW", "MID", "HI-MID", "HIGH", "AIR"];
  var NOTES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
  var TIP_CEN = "The spectral centroid: where the sound's weight sits at each moment, its brightness; higher is brighter";
  var TIP_RMS = "RMS: how loud each moment is, in dBFS, in the lane at the foot; the dashed line is the take's own average";
  var TIP_LOG = "The frequencies on a log scale, as the ear hears them: each octave as tall as the next";
  var TIP_LIN = "The frequencies on a linear scale: the highs wide, the lows packed at the foot";
  var TIP_BANDS = "The mean power of each band over the whole take (Welch, dB): SUB 20–80 Hz, LOW 80–300, MID 300–2k, HI-MID 2–6k, HIGH 6–12k, AIR 12–20k";
  var H = null, el = null, cvBase = null, cvOver = null, headEl = null, readEl = null, sayEl = null, btn = null;
  var S = { on: false, timer: 0, held: null, last: null, gone: false, ptr: null, token: 0, key: "", loading: false, data: null, d: null,
            bitmap: null, bitmapKey: "", baseKey: "", sig: "", L: null, raf: 0, frames: 0, drawnAt: -1, cut: null, read: "" };

  function recall(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function store(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* a private window */ } }
  function enabled() { return recall("yue2.waveScope") !== "off"; }
  function scale() { return recall("yue2.waveScopeScale") === "lin" ? "lin" : "log"; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]; }); }
  function clock(t, tenth) {
    var u = tenth ? Math.floor(Math.max(0, t) * 10) / 10 : Math.floor(Math.max(0, t)), m = Math.floor(u / 60), s = u - m * 60;
    return m + ":" + (s < 9.95 ? "0" : "") + (tenth ? s.toFixed(1) : String(Math.round(s)));
  }
  function hz(f) { return f >= 1000 ? (f / 1000).toFixed(f >= 10000 ? 1 : 2) + " kHz" : Math.round(f) + " Hz"; }
  function tickName(f) { return f >= 1000 ? f / 1000 + "K" : String(f); }
  function note(f) {                                // A4 = 440 Hz, the cents from the nearest note
    if (!(f >= 16 && f <= 20000)) return "";
    var m = 69 + 12 * Math.log2(f / 440), n = Math.round(m), c = Math.round((m - n) * 100);
    return NOTES[((n % 12) + 12) % 12] + (Math.floor(n / 12) - 1) + (c ? " " + (c > 0 ? "+" : "−") + Math.abs(c) + "¢" : "");
  }
  function dB(v) { return (v < -0.05 ? "−" : "") + Math.abs(v).toFixed(1); }
  function freqAt(y, sc, nyq) { return sc === "log" ? 20 * Math.pow(nyq / 20, y) : 20 + (nyq - 20) * y; }   // y: 0 the foot, 1 the top
  function yOf(f, sc, nyq) { return sc === "log" ? Math.log(f / 20) / Math.log(nyq / 20) : (f - 20) / (nyq - 20); }

  // the full player: the wave across the bar over its controls (app.css: 52 px high); in one row it is 40 and sits among them
  function full() {
    var w = H.wave, bar = document.getElementById("playbar");
    return !!(w && bar && w.clientHeight >= 46 && w.clientWidth >= bar.clientWidth * 0.75);
  }
  function wanted() { return !!H && enabled() && H.room() && full(); }
  function can() { var a = H.audio; return wanted() && !!H.take() && isFinite(a.duration) && a.duration > 0; }

  // ------------------------------------------------------------ the wave's own events (app.js)
  function hover(event) {
    if (!H) return;
    S.last = event;
    if (S.on) { follow(event, false); return; }
    if (S.gone || !can()) return;
    if (S.held) {                                  // clicked before it came: the pointer moves on first
      if (Math.abs(event.clientX - S.held.x) + Math.abs(event.clientY - S.held.y) < 4) return;
      S.held = null;
    }
    if (!S.timer) S.timer = setTimeout(show, SHOW_MS);
  }
  function press(event) {
    if (S.on) return;                              // shown: the click goes there and the scope stays
    clearTimeout(S.timer); S.timer = 0;
    S.held = { x: event.clientX, y: event.clientY };
  }
  function leave(event) {
    clearTimeout(S.timer); S.timer = 0;
    if (S.on && keeps(event)) return;
    S.gone = false; S.held = null;
    hide();
  }
  // out of the wave upward, toward the scope over it: kept
  function keeps(event) {
    if (!S.on || !event || !el) return false;
    var w = H.wave.getBoundingClientRect(), p = el.getBoundingClientRect();
    return event.clientY < w.top + 1 && event.clientY >= p.top - 2 && event.clientX >= w.left - 2 && event.clientX <= w.right + 2;
  }
  // the pointer anywhere: out of the wave, the scope and the strip between them, it goes
  function watch(event) {
    var w = H.wave.getBoundingClientRect(), p = el.getBoundingClientRect();
    if (event.clientX < Math.min(w.left, p.left) - 2 || event.clientX > Math.max(w.right, p.right) + 2 || event.clientY < p.top - 2 || event.clientY > w.bottom + 2) hide();
  }
  function away(event) { if (!event.relatedTarget) hide(); }
  function key(event) {
    if (event.key !== "Escape" || !S.on) return;
    S.gone = true;                                 // down until the pointer leaves the wave
    event.stopPropagation();
    hide();
  }
  function resized() { if (S.on) paint(); }

  function show() {
    S.timer = 0;
    if (S.on || S.gone || !S.last || !can()) return;
    build();
    S.on = true;
    el.hidden = false;
    place();
    document.addEventListener("mousemove", watch, true);
    document.addEventListener("mouseout", away, true);
    document.addEventListener("keydown", key, true);
    window.addEventListener("resize", resized);
    load();
    follow(S.last, false);
    if (H.pop) H.pop(S.last);                      // the section's card up over the scope
    S.raf = requestAnimationFrame(tick);
  }
  function hide() {
    clearTimeout(S.timer); S.timer = 0;
    if (!S.on) return;
    S.on = false;
    S.ptr = null;
    el.hidden = true;
    document.removeEventListener("mousemove", watch, true);
    document.removeEventListener("mouseout", away, true);
    document.removeEventListener("keydown", key, true);
    window.removeEventListener("resize", resized);
    cancelAnimationFrame(S.raf); S.raf = 0;
    if (H.pop) H.pop(null);
    if (H.mark) H.mark(null);
  }
  // while it is up: the playhead as the take plays; twice a second, another take, other sections, a room or a player without it
  function tick() {
    S.raf = 0;
    if (!S.on) return;
    if (++S.frames % 30 === 0) {
      var take = H.take();
      if (!can()) { hide(); return; }
      if (take && take.url !== S.key) load();
      else if (S.data && sectionsSig() !== S.sig) paint();
    }
    if (H.audio.currentTime !== S.drawnAt) drawOver();
    S.raf = requestAnimationFrame(tick);
  }

  // --------------------------------------------------------------------- the scope
  function build() {
    if (el) return;
    el = document.createElement("div");
    el.className = "wave-scope";
    el.id = "waveScope";
    el.hidden = true;
    el.setAttribute("role", "region");
    el.setAttribute("aria-label", "The take's spectrum");
    el.innerHTML = '<canvas class="ws-base" aria-hidden="true"></canvas><canvas class="ws-over" aria-hidden="true"></canvas>' +
      '<div class="ws-head"><b class="ws-title" translate="no"></b><span class="ws-stats"></span>' +
      '<span class="ws-keys"><span class="ws-key ws-key-cen" data-tip="' + esc(TIP_CEN) + '">spectral centroid</span>' +
      '<span class="ws-key ws-key-rms" data-tip="' + esc(TIP_RMS) + '">RMS</span></span>' +
      '<span class="ws-scale" role="group" aria-label="Frequency scale">' +
      '<button type="button" data-scale="log" data-tip="' + esc(TIP_LOG) + '">Log</button>' +
      '<button type="button" data-scale="lin" data-tip="' + esc(TIP_LIN) + '">Linear</button></span></div>' +
      '<div class="ws-read" hidden></div><div class="ws-say"></div>';
    document.body.appendChild(el);
    cvBase = el.querySelector(".ws-base");
    cvOver = el.querySelector(".ws-over");
    headEl = el.querySelector(".ws-head");
    readEl = el.querySelector(".ws-read");
    sayEl = el.querySelector(".ws-say");
    el.addEventListener("mousemove", function (event) { S.last = event; follow(event, true); });
    el.addEventListener("click", function (event) {
      if (event.target.closest(".ws-head")) return;
      if (H.seek) H.seek(event.clientX);
      drawOver();
    });
    Array.prototype.forEach.call(el.querySelectorAll("[data-scale]"), function (b) {
      b.addEventListener("click", function () { store("yue2.waveScopeScale", b.dataset.scale === "lin" ? "lin" : null); paintScale(); paint(); });
    });
    paintScale();
  }
  function paintScale() {
    if (!el) return;
    Array.prototype.forEach.call(el.querySelectorAll("[data-scale]"), function (b) {
      var on = b.dataset.scale === scale();
      b.classList.toggle("is-on", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }
  // over the player, on its top edge, as wide as the wave's own drawing (its border left out), a third of the window high
  function place() {
    var w = H.wave, r = w.getBoundingClientRect(), bar = document.getElementById("playbar").getBoundingClientRect();
    var foot = Math.round(bar.top), h = Math.round(Math.min(Math.max(220, window.innerHeight * 0.36), foot - 12));
    var W = Math.max(1, w.clientWidth), dpr = window.devicePixelRatio || 1, lane = Math.round(Math.min(90, Math.max(36, h * 0.16)));
    el.style.left = Math.round(r.left + w.clientLeft) + "px";
    el.style.top = (foot - h) + "px";
    el.style.width = W + "px";
    el.style.height = h + "px";
    S.L = { w: W, h: h, dpr: dpr, spec: h - lane, lane: lane };
    [cvBase, cvOver].forEach(function (c) {
      var pw = Math.round(W * dpr), ph = Math.round(h * dpr);
      if (c.width !== pw || c.height !== ph) { c.width = pw; c.height = ph; if (c === cvBase) S.baseKey = ""; }
      c.style.width = W + "px";
      c.style.height = h + "px";
    });
  }
  function say(text, bad) {
    if (!sayEl) return;
    sayEl.textContent = text || "";
    sayEl.classList.toggle("is-bad", !!bad);
  }

  // the take measured once (heresy-spectrum.js: the lab's spectrum, the take card's cache), then drawn
  function load() {
    var take = H.take();
    if (!take) return;
    if (S.key === take.url && (S.data || S.loading)) { if (S.data) paint(); return; }
    var token = ++S.token;
    S.key = take.url; S.data = null; S.d = null; S.loading = true; S.bitmapKey = ""; S.baseKey = ""; S.cut = null; S.read = "";
    [cvBase, cvOver].forEach(function (c) { c.getContext("2d").clearRect(0, 0, c.width, c.height); });
    headEl.querySelector(".ws-title").textContent = take.label || "";
    headEl.querySelector(".ws-stats").innerHTML = "";
    readEl.hidden = true;
    say("…");
    if (!window.HeresySpectrum || !window.HeresySpectrum.data) { S.loading = false; say("Could not measure: " + "no spectrum in this page", true); return; }
    window.HeresySpectrum.data(take, function (text) { if (token === S.token) say(text); }).then(function (data) {
      if (token !== S.token) return;
      S.loading = false;
      S.data = data;
      S.d = derive(data);
      say("");
      paint();
    }, function (error) {
      if (token !== S.token) return;
      S.loading = false;
      S.key = "";                                  // asked again the next time
      say("Could not measure: " + (error && error.message || error), true);
    });
  }

  // per frame: the RMS (dBFS: through the Hann window, RMS² = 4/3 · Σ|X|² of the scaled one-sided STFT) and the spectral centroid
  // (where the magnitude's weight sits, Hz, as librosa reckons it; none in a frame quieter than -70 dBFS), smoothed over half a
  // second in octaves
  function derive(data) {
    var s = data.spec, F = s.frames, B = s.bins, sr = data.sr || 44100, nyq = sr / 2, k, f;
    var hzOf = new Float64Array(B), pow = new Float64Array(256), amp = new Float64Array(256), steps = data.where === "Forge";   // the lab's: 0.5 dB steps from -120
    for (k = 0; k < B; k++) hzOf[k] = k * nyq / (B - 1);
    for (k = 0; k < 256; k++) { pow[k] = Math.pow(10, (-120 + k * 0.5) / 10); amp[k] = Math.sqrt(pow[k]); }
    var rms = new Float32Array(F), cen = new Float32Array(F), all = 0, top = -1e9;
    for (f = 0; f < F; f++) {
      var o = f * B, sum = 0, as = 0, ws = 0, p, a, v, q;
      for (k = 1; k < B; k++) {
        v = s.db[o + k];
        if (v > top) top = v;
        if (steps) { q = Math.max(0, Math.min(255, Math.round((v + 120) * 2))); p = pow[q]; a = amp[q]; }
        else { p = Math.pow(10, v / 10); a = Math.sqrt(p); }
        sum += p;
        as += a;
        ws += a * hzOf[k];
      }
      all += sum;
      rms[f] = 10 * Math.log10(sum * 4 / 3 + 1e-12);
      cen[f] = rms[f] > -70 && as > 0 ? ws / as : NaN;
    }
    var half = Math.max(1, Math.round(0.25 * sr / s.hop)), smooth = new Float32Array(F);
    for (f = 0; f < F; f++) {
      var acc = 0, m = 0;
      for (var j = Math.max(0, f - half); j <= Math.min(F - 1, f + half); j++) if (cen[j] > 0) { acc += Math.log2(cen[j]); m++; }
      smooth[f] = m && cen[f] > 0 ? Math.pow(2, acc / m) : NaN;
    }
    return { rms: rms, cen: smooth, avg: 10 * Math.log10(all / Math.max(1, F) * 4 / 3 + 1e-12), fps: sr / s.hop, nyq: nyq,
             top: Math.max(top, -40) };       // the colours' top: the loudest bin, -40 at least (the card's range)
  }

  function sectionsSig() {
    return (H.sections() || []).map(function (s) { return isFinite(s.t) ? s.t.toFixed(2) + s.name + (s.unheard ? "?" : "") : ""; }).join("|");
  }
  function paint() {
    if (!S.on) return;
    var take = H.take();
    if (!take || !can()) { hide(); return; }
    if (take.url !== S.key) { load(); return; }
    place();
    if (!S.data) return;
    var L = S.L, D = H.audio.duration, bk = S.key + "|" + L.w + "x" + L.spec + "@" + L.dpr + "|" + scale() + "|" + D.toFixed(2);
    if (S.bitmapKey !== bk) { S.bitmap = render(); S.bitmapKey = bk; S.baseKey = ""; S.cut = null; }
    var sig = sectionsSig();
    if (S.baseKey !== bk || S.sig !== sig) {
      drawBase((H.sections() || []).filter(function (s) { return isFinite(s.t); }));
      S.baseKey = bk;
      S.sig = sig;
      head();
    }
    paintScale();
    drawOver();
    readout();
  }

  // the spectrogram in the window's own pixels: each column the loudest of its frames (a short hit stays seen), each row its frequency
  // between two bins; the columns on the player's own time, so the take's end falls where the wave's does
  function render() {
    var L = S.L, s = S.data.spec, d = S.d, W = Math.max(1, Math.round(L.w * L.dpr)), Hs = Math.max(1, Math.round(L.spec * L.dpr));
    var c = document.createElement("canvas");
    c.width = W; c.height = Hs;
    var g = c.getContext("2d"), img = g.createImageData(W, Hs), px = img.data, lut = window.HeresySpectrum.lut;
    var sc = scale(), D = H.audio.duration, F = s.frames, B = s.bins, span = Math.max(1e-6, d.top - LO), x, y;
    var rowBin = new Float64Array(Hs);
    for (y = 0; y < Hs; y++) rowBin[y] = Math.max(0, Math.min(B - 1, freqAt(1 - (y + 0.5) / Hs, sc, d.nyq) / d.nyq * (B - 1)));
    for (x = 0; x < W; x++) {
      var f0 = Math.floor(x / W * D * d.fps), f1 = Math.min(F, Math.max(f0 + 1, Math.floor((x + 1) / W * D * d.fps)));
      for (y = 0; y < Hs; y++) {
        var v = LO;
        if (f0 < F) {
          var b = rowBin[y], k = Math.floor(b), t = b - k;
          v = -1e9;
          for (var f = f0; f < f1; f++) {
            var o = f * B, a = s.db[o + k], z = k + 1 < B ? s.db[o + k + 1] : a, here = a + (z - a) * t;
            if (here > v) v = here;
          }
        }
        var i = Math.max(0, Math.min(255, Math.round((v - LO) / span * 255))), q = (y * W + x) * 4;
        px[q] = lut[i * 3]; px[q + 1] = lut[i * 3 + 1]; px[q + 2] = lut[i * 3 + 2]; px[q + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }
  function label(g, text, x, y, color) {
    g.lineWidth = 3;
    g.strokeStyle = "rgba(0,0,0,.72)";
    g.strokeText(text, x, y);
    g.fillStyle = color;
    g.fillText(text, x, y);
  }
  // the frames of the CSS column x (at least one)
  function frames(x, w, D, fps, F) {
    var a = Math.floor(x / w * D * fps);
    return [a, Math.min(F, Math.max(a + 1, Math.floor((x + 1) / w * D * fps)))];
  }
  function drawBase(secs) {
    var L = S.L, d = S.d, g = cvBase.getContext("2d"), D = H.audio.duration, sc = scale(), nyq = d.nyq, F = d.rms.length, cx, f, fr;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cvBase.width, cvBase.height);
    g.drawImage(S.bitmap, 0, 0);
    g.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
    // the frequencies' grid, their names at the left edge
    g.font = "10px 'IBM Plex Mono', monospace";
    g.textAlign = "left";
    g.textBaseline = "middle";
    var ticks = sc === "log" ? [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000] : [2000, 4000, 6000, 8000, 10000, 12000, 14000, 16000, 18000, 20000, 22000];
    ticks.forEach(function (fq) {
      if (fq >= nyq) return;
      var y = Math.round(L.spec * (1 - yOf(fq, sc, nyq))) + 0.5;
      if (y < HEAD_H + 22 || y > L.spec - 18) return;   // clear of the sections' names and the times
      g.fillStyle = "rgba(255,255,255,.09)";
      g.fillRect(0, y - 0.5, L.w, 1);
      label(g, tickName(fq), 6, y, TEXT);
    });
    // the times' grid, the times at the picture's foot
    var every = [5, 10, 15, 30, 60, 120, 300].filter(function (e) { return e / D * L.w >= 70; })[0] || 600;
    g.textBaseline = "alphabetic";
    for (var t = every; t < D - every / 4; t += every) {
      var tx = Math.round(t / D * L.w) + 0.5;
      g.fillStyle = "rgba(255,255,255,.07)";
      g.fillRect(tx - 0.5, HEAD_H, 1, L.spec - HEAD_H);
      label(g, clock(t), tx + 3, L.spec - 5, "rgba(232,213,160,.72)");
    }
    // the spectral centroid: a line through the picture, broken where the take is near silent
    var path = new Path2D(), pen = false;
    for (cx = 0; cx < L.w; cx++) {
      fr = frames(cx, L.w, D, d.fps, F);
      var acc = 0, m = 0;
      for (f = fr[0]; f < fr[1]; f++) if (d.cen[f] > 0) { acc += Math.log2(d.cen[f]); m++; }
      if (!m) { pen = false; continue; }
      var cy = L.spec * (1 - yOf(Math.max(20, Math.min(nyq, Math.pow(2, acc / m))), sc, nyq));
      if (pen) path.lineTo(cx + 0.5, cy); else { path.moveTo(cx + 0.5, cy); pen = true; }
    }
    g.lineJoin = "round";
    g.strokeStyle = "rgba(0,0,0,.6)"; g.lineWidth = 3.5; g.stroke(path);
    g.globalAlpha = 0.95; g.strokeStyle = MAGENTA; g.lineWidth = 1.5; g.stroke(path); g.globalAlpha = 1;
    // the lane at the foot: the RMS of each moment, 0 to -60 dBFS, the take's own average dashed
    var top = L.spec, lh = L.lane;
    function ry(v) { return top + 3 + (1 - Math.max(0, Math.min(60, v + 60)) / 60) * (lh - 6); }
    g.fillStyle = "#0d0a08"; g.fillRect(0, top, L.w, lh);
    g.fillStyle = "rgba(232,213,160,.22)"; g.fillRect(0, top, L.w, 1);
    var line = new Path2D(), area = new Path2D(), first = true, lastX = 0;
    for (cx = 0; cx < L.w; cx++) {
      fr = frames(cx, L.w, D, d.fps, F);
      var pw = 0, n = 0;
      for (f = fr[0]; f < fr[1]; f++) { pw += Math.pow(10, d.rms[f] / 10); n++; }
      if (!n) continue;
      var yy = ry(10 * Math.log10(pw / n + 1e-12));
      if (first) { line.moveTo(cx + 0.5, yy); area.moveTo(cx + 0.5, top + lh); area.lineTo(cx + 0.5, yy); first = false; }
      else { line.lineTo(cx + 0.5, yy); area.lineTo(cx + 0.5, yy); }
      lastX = cx + 0.5;
    }
    if (!first) {
      area.lineTo(lastX, top + lh);
      area.closePath();
      g.fillStyle = "rgba(255,140,40,.22)"; g.fill(area);
      g.strokeStyle = AMBER; g.lineWidth = 1.3; g.stroke(line);
    }
    var ay = Math.round(ry(d.avg)) + 0.5;
    g.setLineDash([4, 4]); g.strokeStyle = "rgba(255,140,40,.6)"; g.lineWidth = 1;
    g.beginPath(); g.moveTo(0, ay); g.lineTo(L.w, ay); g.stroke(); g.setLineDash([]);
    g.font = "9px 'IBM Plex Mono', monospace"; g.textBaseline = "top";
    label(g, "0", 6, top + 3, "rgba(232,213,160,.6)");
    g.textBaseline = "bottom";
    label(g, "−60 dBFS", 6, top + lh - 2, "rgba(232,213,160,.6)");
    // the sections: a line at each start through the picture and the lane, its name under the head where there is room
    g.font = window.ruachCanvasFont ? window.ruachCanvasFont("marks", 9.5, 600) : "600 9.5px 'IBM Plex Mono', monospace";   // HERESY 1437
    g.textBaseline = "middle";
    var lastEnd = -1e9;
    secs.forEach(function (s) {
      if (s.t >= D) return;
      var sx = Math.round(s.t / D * L.w) + 0.5;
      if (s.t > 0.05) { g.fillStyle = "rgba(255,255,255,.5)"; g.fillRect(sx - 0.5, HEAD_H, 1, L.h - HEAD_H); }
      var name = String(s.name || "").toUpperCase() + (s.unheard ? " ?" : ""), lw = g.measureText(name).width + 8;
      if (!s.name || sx + 2 < lastEnd + 4 || sx + 2 + lw > L.w) return;
      g.fillStyle = "rgba(10,8,6,.78)"; g.fillRect(sx + 2, HEAD_H + 4, lw, 14);
      g.fillStyle = NAME; g.fillText(name, sx + 6, HEAD_H + 11);
      lastEnd = sx + 2 + lw;
    });
  }
  function head() {
    var data = S.data, d = S.d, take = H.take();
    headEl.querySelector(".ws-title").textContent = take && take.label || "";
    headEl.querySelector(".ws-stats").innerHTML =
      "<span>" + esc("peak " + dB(20 * Math.log10((data.peak || 0) + 1e-12)) + " dBFS") + "</span><span>" + esc("RMS " + dB(d.avg) + " dBFS") + "</span>" +
      '<span class="ws-bands" translate="no" data-tip="' + esc(TIP_BANDS) + '">' +
      (data.bands || []).map(function (v, i) { return "<span>" + BANDS[i] + " " + dB(v) + "</span>"; }).join("") + "</span>";
  }

  // the spectrum of the moment under the line: its column's frames and one each side, their power averaged; a row every 2 px; its
  // loudest bin from 30 Hz up, a parabola through it and its neighbours for the frequency between two bins
  function cut(x) {
    var L = S.L, s = S.data.spec, d = S.d, D = H.audio.duration, F = s.frames, B = s.bins, nyq = d.nyq, sc = scale(), k, f;
    var fr = frames(x, L.w, D, d.fps, F);
    if (fr[0] >= F) return null;
    var f0 = Math.max(0, fr[0] - 1), f1 = Math.min(F - 1, fr[1]), n = f1 - f0 + 1, mean = new Float64Array(B);
    for (f = f0; f <= f1; f++) for (k = 0; k < B; k++) mean[k] += Math.pow(10, s.db[f * B + k] / 10);
    for (k = 0; k < B; k++) mean[k] = 10 * Math.log10(mean[k] / n + 1e-14);
    var ys = [], vs = [];
    for (var y = HEAD_H + 2; y < L.spec; y += 2) { ys.push(y); vs.push(levelAt(mean, freqAt(1 - y / L.spec, sc, nyq), nyq)); }
    var lo = Math.max(1, Math.ceil(30 / nyq * (B - 1))), best = lo;
    for (k = lo; k < B - 1; k++) if (mean[k] > mean[best]) best = k;
    var l = mean[best - 1], m = mean[best], r = mean[best + 1], den = l - 2 * m + r, off = den < 0 ? 0.5 * (l - r) / den : 0;
    var lf = (best + off) * nyq / (B - 1);
    return { x: x, key: S.bitmapKey, ys: ys, vs: vs, mean: mean, loud: { f: lf, v: m, y: L.spec * (1 - yOf(Math.max(20, lf), sc, nyq)) } };
  }
  function levelAt(mean, fq, nyq) {
    var B = mean.length, b = Math.max(0, Math.min(B - 1, fq / nyq * (B - 1))), k = Math.floor(b), t = b - k, a = mean[k], z = k + 1 < B ? mean[k + 1] : a;
    return a + (z - a) * t;
  }
  function drawOver() {
    if (!S.on || !S.L) return;
    var L = S.L, g = cvOver.getContext("2d"), a = H.audio, D = a.duration;
    S.drawnAt = a.currentTime;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cvOver.width, cvOver.height);
    if (!S.data || !isFinite(D) || D <= 0) return;
    g.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
    if (a.currentTime > 0) { g.fillStyle = "rgba(255,196,110,.95)"; g.fillRect(Math.round(a.currentTime / D * L.w) - 0.75, HEAD_H, 1.5, L.h - HEAD_H); }
    var p = S.ptr;
    if (!p) return;
    var hx = Math.round(p.x) + 0.5;
    g.fillStyle = "rgba(255,255,255,.85)";
    g.fillRect(hx - 0.5, HEAD_H, 1, L.h - HEAD_H);
    if (!S.cut || S.cut.x !== p.x || S.cut.key !== S.bitmapKey) S.cut = cut(p.x);
    var c = S.cut;
    if (c) {
      var dir = hx + PROFILE_W + 16 < L.w ? 1 : -1, x0 = hx + dir * 2, span = Math.max(1e-6, S.d.top - LO), path = new Path2D();
      g.fillStyle = "rgba(8,6,4,.45)";
      g.fillRect(dir > 0 ? x0 : x0 - PROFILE_W - 8, HEAD_H, PROFILE_W + 8, L.spec - HEAD_H);
      for (var i = 0; i < c.ys.length; i++) {
        var X = x0 + dir * (4 + Math.max(0, Math.min(1, (c.vs[i] - LO) / span)) * PROFILE_W);
        if (i) path.lineTo(X, c.ys[i]); else path.moveTo(X, c.ys[i]);
      }
      g.strokeStyle = "rgba(255,255,255,.92)"; g.lineWidth = 1.2; g.stroke(path);
      if (c.loud.v > LO && c.loud.y > HEAD_H && c.loud.y < L.spec) {
        g.beginPath();
        g.arc(x0 + dir * (4 + Math.max(0, Math.min(1, (c.loud.v - LO) / span)) * PROFILE_W), c.loud.y, 3, 0, 2 * Math.PI);
        g.fillStyle = AMBER; g.fill();
      }
    }
    if (p.pic) {
      g.setLineDash([4, 4]); g.strokeStyle = "rgba(255,255,255,.5)"; g.lineWidth = 1;
      g.beginPath(); g.moveTo(0, Math.round(p.y) + 0.5); g.lineTo(L.w, Math.round(p.y) + 0.5); g.stroke(); g.setLineDash([]);
    }
  }
  function sectionAt(t) {
    var at = null;
    (H.sections() || []).forEach(function (s) { if (isFinite(s.t) && s.t <= t + 0.01) at = s; });
    return at;
  }
  // under the pointer: its time and section, the moment's RMS and centroid, its loudest frequency and note; inside the picture the
  // frequency there, its note and its level. In words of their own (the page's languages take them a piece at a time)
  function readout() {
    if (!S.on || !S.ptr || !S.data || !S.L) { if (readEl) readEl.hidden = true; return; }
    var L = S.L, p = S.ptr, d = S.d, D = H.audio.duration, t = p.x / L.w * D, F = d.rms.length, fi = Math.max(0, Math.min(F - 1, Math.floor(t * d.fps + 0.5)));
    if (!S.cut || S.cut.x !== p.x || S.cut.key !== S.bitmapKey) S.cut = cut(p.x);
    var c = S.cut, sec = sectionAt(t), rows = [];
    rows.push('<div class="ws-r-t"><b>' + esc(clock(t, true)) + "</b>" + (sec && sec.name ? ' <span translate="no">' + esc(sec.name) + "</span>" : "") + "</div>");
    rows.push("<div>" + esc("RMS " + dB(d.rms[fi]) + " dBFS") + "</div>");
    if (d.cen[fi] > 0) rows.push("<div>" + esc("centroid " + hz(d.cen[fi])) + "</div>");
    if (c && c.loud.v > LO) rows.push('<div><span>' + esc("loudest " + hz(c.loud.f)) + '</span> <span class="ws-note" translate="no">' + esc(note(c.loud.f)) + "</span></div>");
    if (p.pic && c) {
      var fq = freqAt(1 - p.y / L.spec, scale(), d.nyq);
      rows.push('<div class="ws-r-here"><span>' + esc("here " + hz(fq)) + '</span> <span class="ws-note" translate="no">' + esc(note(fq)) + "</span> <span>" +
        esc(dB(levelAt(c.mean, fq, d.nyq)) + " dB") + "</span></div>");
    }
    var html = rows.join("");
    if (html !== S.read) { readEl.innerHTML = html; S.read = html; }
    readEl.hidden = false;
    var bw = readEl.offsetWidth, bh = readEl.offsetHeight, side = p.x + PROFILE_W + 16 < L.w ? -1 : 1;   // the slice's other side
    var x = side < 0 ? p.x - 12 - bw : p.x + 12;
    if (x < 4) x = p.x + PROFILE_W + 18;
    if (x + bw > L.w - 4) x = L.w - 4 - bw;
    var y = p.y !== null ? p.y + 14 : L.spec - bh - 10;
    if (p.y !== null && y + bh > L.h - 4) y = p.y - 14 - bh;
    readEl.style.left = Math.round(Math.max(4, x)) + "px";
    readEl.style.top = Math.round(Math.max(HEAD_H + 4, y)) + "px";
  }
  function follow(event, inPanel) {
    if (!S.on || !S.L) return;
    var r = el.getBoundingClientRect(), x = Math.max(0, Math.min(S.L.w - 1, Math.floor(event.clientX - r.left)));
    var y = inPanel ? event.clientY - r.top : null;
    S.ptr = { x: x, y: y, pic: inPanel && y >= HEAD_H && y < S.L.spec };
    if (inPanel && H.mark) H.mark((x + 0.5) / S.L.w);
    if (inPanel && H.pop) H.pop(event);
    drawOver();
    readout();
  }

  // the player's switch: on until turned off, kept in this browser
  function paintBtn() {
    if (!btn) return;
    var on = enabled();
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.classList.toggle("is-on", on);
  }
  function init(hooks) {
    H = hooks;
    btn = document.getElementById("waveScopeBtn");
    if (btn) btn.addEventListener("click", function () { store("yue2.waveScope", enabled() ? "off" : null); paintBtn(); if (!enabled()) hide(); });
    paintBtn();
    new MutationObserver(function () { if (S.on && !can()) hide(); }).observe(document.body, { attributes: true, attributeFilter: ["data-tab", "data-frame"] });
  }

  window.HeresyWaveScope = {
    init: init, hover: hover, leave: leave, press: press, keeps: keeps, hide: hide,
    wanted: function () { return wanted(); },
    shown: function () { return S.on; },
    top: function () { return S.on && el ? el.getBoundingClientRect().top : null; }
  };
})();
