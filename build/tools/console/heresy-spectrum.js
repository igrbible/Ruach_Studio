// HERESY 1007: the spectrum of a take, in the take card.
//
// A port of our Audio Spectral Comparator v3 (audio_spectrum_compare.py, HERETICAL
// TANDEM, Music_Post_Processing_venv_3.12) to the browser, with the same method:
//   mono, resampled to 44.1 kHz by the browser's decoder;
//   spectrogram: STFT, Hann 2048, hop 2048, scipy's scaling, 20·log10, floor -80 dB,
//                linear or log frequency, the heresy_spectrum palette;
//   average spectrum: Welch, Hann 4096, half overlap, density scaling, 10·log10;
//   band energy: the mean Welch power in SUB LOW MID HI-MID HIGH AIR.
// A second take can be laid over the first, as the script compares two tracks.
// Nothing leaves the page: the take's audio is fetched from the server and measured here.
(function () {
  "use strict";

  var SR = 44100;
  var STOPS = ["#0a0014", "#0d1040", "#0a2878", "#0860a8", "#08a0a0", "#10b868", "#48c828",
               "#a0d810", "#e8c810", "#f08810", "#e83820", "#ff6090", "#ffffff"];
  var BG = "#1a1410", BG_PLOT = "#1e1812", TEXT = "#e8d5a0", GRID = "#3a2e20";
  var COLOR_A = "#ff8c28", COLOR_B = "#28c8ff", UP = "#28ff68", DOWN = "#ff4060";
  var BAND_A = ["#e83838", "#ff6828", "#ffa828", "#ffe028", "#a0e828", "#28e8a0"];
  var BAND_B = ["#a82828", "#c84818", "#c87818", "#c8a018", "#70a818", "#18a870"];
  var BANDS = [["SUB", "20–80", 20, 80], ["LOW", "80–300", 80, 300], ["MID", "300–2K", 300, 2000],
               ["HI-MID", "2K–6K", 2000, 6000], ["HIGH", "6K–12K", 6000, 12000], ["AIR", "12K–20K", 12000, 20000]];
  var ZONE = ["#ff2020", "#ff6820", "#ffe028", "#28e868", "#2888ff", "#c828ff"];

  // ---------------------------------------------------------------- palette
  var LUT = (function () {
    var rgb = STOPS.map(function (h) { return [1, 3, 5].map(function (i) { return parseInt(h.substr(i, 2), 16); }); });
    var lut = new Uint8ClampedArray(256 * 3);
    for (var i = 0; i < 256; i++) {
      var x = i / 255 * (rgb.length - 1), k = Math.min(rgb.length - 2, Math.floor(x)), f = x - k;
      for (var c = 0; c < 3; c++) lut[i * 3 + c] = rgb[k][c] + (rgb[k + 1][c] - rgb[k][c]) * f;
    }
    return lut;
  })();

  // -------------------------------------------------------------------- FFT
  // In-place radix-2 complex FFT; the plans are cached per size.
  var plans = {};
  function plan(n) {
    if (plans[n]) return plans[n];
    var bits = Math.log2(n), rev = new Uint32Array(n), cos = new Float64Array(n / 2), sin = new Float64Array(n / 2);
    for (var i = 0; i < n; i++) {
      var r = 0;
      for (var b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
      rev[i] = r;
    }
    for (var j = 0; j < n / 2; j++) { cos[j] = Math.cos(2 * Math.PI * j / n); sin[j] = -Math.sin(2 * Math.PI * j / n); }
    return (plans[n] = { rev: rev, cos: cos, sin: sin });
  }
  function fft(re, im) {
    var n = re.length, p = plan(n), i, j, t;
    for (i = 0; i < n; i++) {
      j = p.rev[i];
      if (j > i) { t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (var size = 2; size <= n; size <<= 1) {
      var half = size >> 1, step = n / size;
      for (var start = 0; start < n; start += size) {
        for (var k = 0; k < half; k++) {
          var a = start + k, b2 = a + half, c = p.cos[k * step], s = p.sin[k * step];
          var xr = re[b2] * c - im[b2] * s, xi = re[b2] * s + im[b2] * c;
          re[b2] = re[a] - xr; im[b2] = im[a] - xi;
          re[a] += xr; im[a] += xi;
        }
      }
    }
  }
  function hann(n) {   // periodic, as scipy.signal.get_window("hann", n)
    var w = new Float64Array(n);
    for (var i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / n);
    return w;
  }

  // --------------------------------------------------------------- analysis
  // scipy.signal.stft(audio, sr, nperseg=2048, noverlap=0): Hann, the signal padded by
  // half a window at both ends, each frame scaled by 1/sum(window).
  function spectrogram(x) {
    var n = 2048, hop = 2048, w = hann(n), wsum = 0, i;
    for (i = 0; i < n; i++) wsum += w[i];
    var pad = n / 2, frames = Math.floor((x.length + 2 * pad - n) / hop) + 1, bins = n / 2 + 1;
    var db = new Float32Array(frames * bins), re = new Float64Array(n), im = new Float64Array(n);
    for (var f = 0; f < frames; f++) {
      var at = f * hop - pad;
      for (i = 0; i < n; i++) {
        var s = at + i;
        re[i] = s >= 0 && s < x.length ? x[s] * w[i] : 0;
        im[i] = 0;
      }
      fft(re, im);
      for (var k = 0; k < bins; k++) {
        var mag = Math.sqrt(re[k] * re[k] + im[k] * im[k]) / wsum;
        db[f * bins + k] = 20 * Math.log10(mag + 1e-10);
      }
    }
    return { db: db, frames: frames, bins: bins, hop: hop };
  }
  // scipy.signal.welch(audio, sr, nperseg=4096): Hann, half overlap, density scaling, one-sided.
  function welch(x) {
    var n = 4096, hop = 2048, w = hann(n), s2 = 0, i, k;
    for (i = 0; i < n; i++) s2 += w[i] * w[i];
    var bins = n / 2 + 1, acc = new Float64Array(bins), count = 0, re = new Float64Array(n), im = new Float64Array(n);
    for (var at = 0; at + n <= x.length; at += hop) {
      var mean = 0;
      for (i = 0; i < n; i++) mean += x[at + i];
      mean /= n;                                   // scipy detrends each segment ("constant")
      for (i = 0; i < n; i++) { re[i] = (x[at + i] - mean) * w[i]; im[i] = 0; }
      fft(re, im);
      for (k = 0; k < bins; k++) acc[k] += re[k] * re[k] + im[k] * im[k];
      count++;
    }
    var power = new Float64Array(bins), freqs = new Float64Array(bins);
    for (k = 0; k < bins; k++) {
      var p = count ? acc[k] / count / (SR * s2) : 0;
      if (k > 0 && k < bins - 1) p *= 2;
      power[k] = p;
      freqs[k] = k * SR / n;
    }
    var avg = new Float64Array(bins);
    for (k = 0; k < bins; k++) avg[k] = 10 * Math.log10(power[k] + 1e-10);
    var bands = BANDS.map(function (band) {
      var sum = 0, m = 0;
      for (var j = 0; j < bins; j++) if (freqs[j] >= band[2] && freqs[j] < band[3]) { sum += power[j]; m++; }
      return m ? 10 * Math.log10(sum / m + 1e-10) : -100;
    });
    return { freqs: freqs, avg: avg, bands: bands };
  }

  function decode(buffer) {
    var ctx = new OfflineAudioContext(1, 2, SR);   // the decoder resamples to the context's rate
    return new Promise(function (resolve, reject) { ctx.decodeAudioData(buffer, resolve, reject); }).then(function (audio) {
      var n = audio.length, mono = new Float32Array(n), ch = audio.numberOfChannels;
      for (var c = 0; c < ch; c++) {
        var d = audio.getChannelData(c);
        for (var i = 0; i < n; i++) mono[i] += d[i] / ch;
      }
      return mono;
    });
  }

  // Read a response with a running count, so a long download is never a silent wait.
  function readAll(r, say) {
    var total = parseInt(r.headers.get("content-length"), 10) || 0;
    if (!r.body || !r.body.getReader) return r.arrayBuffer();
    var reader = r.body.getReader(), parts = [], got = 0, t0 = performance.now();
    return (function pump() {
      return reader.read().then(function (step) {
        if (step.done) {
          var out = new Uint8Array(got), at = 0;
          parts.forEach(function (p) { out.set(p, at); at += p.length; });
          return out.buffer;
        }
        parts.push(step.value);
        got += step.value.length;
        var secs = (performance.now() - t0) / 1000;
        say("fetching " + (got / 1e6).toFixed(0) + (total ? " of " + (total / 1e6).toFixed(0) : "") + " MB · " +
            (got / 1e6 / Math.max(0.1, secs)).toFixed(1) + " MB/s");
        return pump();
      });
    })();
  }

  // One analysis per audio address, the last four kept: a 7-minute take is about 40 MB of spectrogram.
  // The take comes as FLAC when the server offers it (the same samples, about 40% fewer bytes),
  // else as it is. Every phase is timed; the times go to the status line.
  var cache = [];
  // HERESY 1020: the spectrum computed on Forge by heresy-lab (lab/spectrum_job.py, the same
  // method in numpy), fetched through the Kit at /lab/spectrum: about 10 MB for 7 minutes, as it is
  // (HERESY 1166: nothing gzipped), instead of the whole take. 202 while it is computed. Its layout: "HSP1", uint32 header length, header
  // JSON, uint8 spectrogram (0.5 dB steps from -120 dB), float32 Welch average, float32 bands.
  function fromLab(name, say, source) {
    var started = performance.now(), tries = 0;
    function ask() {
      return fetch("/lab/spectrum?name=" + encodeURIComponent(name) + (source ? "&source=" + encodeURIComponent(source) : "")).then(function (r) {
        if (r.status === 202) {
          say("Forge is measuring\u2026 " + Math.round((performance.now() - started) / 1000) + "s");
          return new Promise(function (resolve) { setTimeout(resolve, 1000); }).then(ask);
        }
        if (r.status === 502) { var gone = new Error("heresy-lab is not running"); gone.noLab = true; throw gone; }
        if (!r.ok) throw new Error("heresy-lab answered " + r.status);
        return readAll(r, say);
      }).catch(function (error) {
        // HERESY 1021: a transfer cut on a slow line is asked again, twice, before giving up
        if (error.noLab || error.message.indexOf("heresy-lab answered") === 0 || ++tries > 2) throw error;
        say("the line dropped; asking Forge again (" + tries + ")\u2026");
        return new Promise(function (resolve) { setTimeout(resolve, 1500); }).then(ask);
      });
    }
    return ask().then(function (raw) {
      var fetched = (performance.now() - started) / 1000, bytes = raw.byteLength;
      var dv = new DataView(raw), magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
      if (magic !== "HSP1") throw new Error("not a spectrum");
      var hl = dv.getUint32(4, true), h = JSON.parse(new TextDecoder().decode(new Uint8Array(raw, 8, hl))), o = 8 + hl;
      var n = h.frames * h.bins, q = new Uint8Array(raw, o, n), db = new Float32Array(n);
      for (var i = 0; i < n; i++) db[i] = h.db0 + q[i] * h.dbStep;
      o += n;
      var avg = new Float32Array(raw.slice(o, o + 4 * h.welchBins)); o += 4 * h.welchBins;
      var bands = Array.prototype.slice.call(new Float32Array(raw.slice(o, o + 24)));
      var freqs = new Float64Array(h.welchBins);
      for (var k = 0; k < h.welchBins; k++) freqs[k] = k * h.sr / h.welchN;
      return { seconds: h.seconds, peak: h.peak, sr: h.sr, spec: { db: db, frames: h.frames, bins: h.bins, hop: h.hop },
               freqs: freqs, avg: avg, bands: bands, bytes: bytes, where: "Forge",
               times: { fetch: fetched, decode: 0, stft: 0, welch: 0 } };
    });
  }

  function analyse(take, say) {
    var key0 = take.url;
    for (var j = 0; j < cache.length; j++) if (cache[j].url === key0) return cache[j].promise;
    if (take.name) {
      var viaLab = fromLab(take.name, say, take.source).catch(function (error) {
        cache = cache.filter(function (c) { return c.url !== key0; });
        // only with no lab at all is the whole file fetched to measure here: on a phone line a
        // silent 30–120 MB download is a bad answer to one dropped transfer
        if (!error.noLab && !(error instanceof TypeError && !error.message)) throw error;
        say("heresy-lab is not running: measuring here\u2026");
        return analyseHere(take, say);
      });
      cache.unshift({ url: key0, promise: viaLab });
      if (cache.length > 4) cache.length = 4;
      return viaLab;
    }
    return analyseHere(take, say);
  }

  function analyseHere(take, say) {
    var key = take.url;
    for (var i = 0; i < cache.length; i++) if (cache[i].url === key) return cache[i].promise;
    var times = {}, t = performance.now();
    function lap(name) { var now = performance.now(); times[name] = (now - t) / 1000; t = now; }
    var bytes = 0;
    say("fetching…");
    var get = function (url) {
      return fetch(url).then(function (r) {
        if (!r.ok) throw new Error("the server answered " + r.status);
        return readAll(r, say);
      });
    };
    var promise = (take.flac ? get(take.flac).catch(function () { return get(take.url); }) : get(take.url)).then(function (buffer) {
      bytes = buffer.byteLength;
      lap("fetch");
      say("decoding " + (bytes / 1e6).toFixed(0) + " MB…");
      return decode(buffer);
    }).then(function (mono) {
      lap("decode");
      say("measuring…");
      return new Promise(function (resolve) {
        setTimeout(function () {   // let the words above paint before the page is busy
          var peak = 0;
          for (var i = 0; i < mono.length; i++) { var a = Math.abs(mono[i]); if (a > peak) peak = a; }
          var result = { seconds: mono.length / SR, peak: peak, spec: spectrogram(mono) };
          lap("stft");
          var w = welch(mono);
          lap("welch");
          result.freqs = w.freqs; result.avg = w.avg; result.bands = w.bands;
          result.times = times; result.bytes = bytes;
          resolve(result);
        }, 30);
      });
    });
    cache.unshift({ url: key, promise: promise });
    if (cache.length > 4) cache.length = 4;
    promise.catch(function () { cache = cache.filter(function (c) { return c.promise !== promise; }); });
    return promise;
  }

  // ---------------------------------------------------------------- drawing
  // cssWidth given: a picture for the full-screen viewer; otherwise as wide as its place in the card.
  function canvasFor(el, cssHeight, cssWidth) {
    var dpr = window.devicePixelRatio || 1, width = cssWidth || Math.max(320, el.clientWidth || el.parentNode.clientWidth);
    el.width = Math.round(width * dpr);
    el.height = Math.round(cssHeight * dpr);
    el.style.height = cssHeight + "px";
    var g = el.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = BG;
    g.fillRect(0, 0, width, cssHeight);
    g.font = "11px 'IBM Plex Mono', monospace";
    return { g: g, w: width, h: cssHeight, dpr: dpr };
  }
  function clock(t) { var m = Math.floor(t / 60), s = Math.floor(t % 60); return m + ":" + (s < 10 ? "0" : "") + s; }
  function khz(f) { return f >= 1000 ? (f / 1000) + "K" : String(f); }

  var PAD = { l: 44, r: 10, t: 22, b: 20 };
  // The frequency drawn at a height fraction y (0 bottom, 1 top), linear or log from 20 Hz.
  function freqAt(y, scale, nyq) {
    return scale === "log" ? 20 * Math.pow(nyq / 20, y) : 20 + (nyq - 20) * y;
  }
  function yOf(f, scale, nyq) {
    return scale === "log" ? Math.log(f / 20) / Math.log(nyq / 20) : (f - 20) / (nyq - 20);
  }

  function drawSpectrogram(el, data, label, color, scale, range, w, h) {
    var c = canvasFor(el, h || 250, w), g = c.g, pw = c.w - PAD.l - PAD.r, ph = c.h - PAD.t - PAD.b;
    var s = data.spec, nyq = (data.sr || SR) / 2, dpr = c.dpr;   // HERESY 1020: Forge's spectrum keeps 48 kHz
    var W = Math.round(pw * dpr), H = Math.round(ph * dpr), img = g.createImageData(W, H), px = img.data;
    var lo = range[0], span = Math.max(1e-6, range[1] - range[0]);
    // the bin under each pixel row, found once
    var rowBin = new Float64Array(H);
    for (var y = 0; y < H; y++) rowBin[y] = freqAt(1 - (y + 0.5) / H, scale, nyq) / nyq * (s.bins - 1);
    for (var x = 0; x < W; x++) {
      // a pixel column spans several frames: take the loudest, so short hits stay visible
      var f0 = Math.floor(x / W * s.frames), f1 = Math.max(f0 + 1, Math.floor((x + 1) / W * s.frames));
      for (y = 0; y < H; y++) {
        var b = rowBin[y], k = Math.floor(b), t = b - k, v = -1e9;
        for (var f = f0; f < f1 && f < s.frames; f++) {
          var base = f * s.bins, a = s.db[base + k], z = k + 1 < s.bins ? s.db[base + k + 1] : a;
          var here = a + (z - a) * t;
          if (here > v) v = here;
        }
        var i = Math.max(0, Math.min(255, Math.round((v - lo) / span * 255))), o = (y * W + x) * 4;
        px[o] = LUT[i * 3]; px[o + 1] = LUT[i * 3 + 1]; px[o + 2] = LUT[i * 3 + 2]; px[o + 3] = 255;
      }
    }
    g.putImageData(img, Math.round(PAD.l * dpr), Math.round(PAD.t * dpr));
    // axes
    g.fillStyle = TEXT; g.strokeStyle = GRID; g.lineWidth = 1;
    g.textAlign = "right"; g.textBaseline = "middle";
    var ticks = scale === "log" ? [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000] : [0, 2500, 5000, 7500, 10000, 12500, 15000, 17500, 20000];
    ticks.forEach(function (f) {
      if (f < 20 || f > nyq) return;
      var yy = PAD.t + ph * (1 - yOf(f, scale, nyq));
      g.fillText(khz(f), PAD.l - 5, yy);
      g.globalAlpha = 0.35; g.beginPath(); g.moveTo(PAD.l, yy + 0.5); g.lineTo(PAD.l + pw, yy + 0.5); g.stroke(); g.globalAlpha = 1;
    });
    g.textAlign = "center"; g.textBaseline = "top";
    var every = data.seconds > 360 ? 60 : data.seconds > 120 ? 30 : 10;
    for (var t = 0; t <= data.seconds; t += every) g.fillText(clock(t), PAD.l + pw * t / data.seconds, PAD.t + ph + 4);
    g.textAlign = "left"; g.textBaseline = "top"; g.font = "600 12px 'IBM Plex Sans', sans-serif"; g.fillStyle = color;
    g.fillText(label + " — spectrogram (" + (scale === "log" ? "log" : "linear") + ")", PAD.l, 4);
    return { x: PAD.l, w: pw, seconds: data.seconds };
  }

  function drawAverage(el, sets, w, h) {
    var c = canvasFor(el, h || 230, w), g = c.g, pw = c.w - PAD.l - PAD.r, ph = c.h - PAD.t - PAD.b;
    var lf = Math.log(20), span = Math.log(20000) - lf;
    function X(f) { return PAD.l + pw * (Math.log(f) - lf) / span; }
    var top = -1e9;
    sets.forEach(function (s) { for (var k = 0; k < s.data.freqs.length; k++) if (s.data.freqs[k] >= 20 && s.data.avg[k] > top) top = s.data.avg[k]; });
    top = Math.ceil((top + 3) / 10) * 10;
    var bottom = top - 100;
    function Y(v) { return PAD.t + ph * (top - Math.max(bottom, v)) / (top - bottom); }
    g.fillStyle = BG_PLOT; g.fillRect(PAD.l, PAD.t, pw, ph);
    BANDS.forEach(function (band, i) {
      g.fillStyle = ZONE[i]; g.globalAlpha = 0.07;
      g.fillRect(X(band[2]), PAD.t, X(band[3]) - X(band[2]), ph);
      g.globalAlpha = 0.8; g.font = "600 10px 'IBM Plex Sans', sans-serif"; g.textAlign = "center"; g.textBaseline = "top";
      g.fillText(band[0], X(Math.sqrt(band[2] * band[3])), PAD.t + 3);
      g.globalAlpha = 1;
    });
    g.font = "11px 'IBM Plex Mono', monospace"; g.strokeStyle = GRID; g.fillStyle = TEXT;
    for (var v = top; v >= bottom; v -= 20) {
      g.textAlign = "right"; g.textBaseline = "middle"; g.fillText(v + "", PAD.l - 5, Y(v));
      g.globalAlpha = 0.5; g.beginPath(); g.moveTo(PAD.l, Y(v) + 0.5); g.lineTo(PAD.l + pw, Y(v) + 0.5); g.stroke(); g.globalAlpha = 1;
    }
    g.textAlign = "center"; g.textBaseline = "top";
    [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000].forEach(function (f) { g.fillText(khz(f), X(f), PAD.t + ph + 4); });
    sets.forEach(function (s) {
      var d = s.data, path = new Path2D(), first = true, lastX = PAD.l;
      for (var k = 1; k < d.freqs.length; k++) {
        var f = d.freqs[k];
        if (f < 20 || f > 20000) continue;
        if (first) { path.moveTo(X(f), Y(d.avg[k])); first = false; } else path.lineTo(X(f), Y(d.avg[k]));
        lastX = X(f);
      }
      var fill = new Path2D(path);
      fill.lineTo(lastX, PAD.t + ph); fill.lineTo(X(Math.max(20, d.freqs[1])), PAD.t + ph); fill.closePath();
      g.fillStyle = s.color; g.globalAlpha = 0.12; g.fill(fill); g.globalAlpha = 0.95;
      g.strokeStyle = s.color; g.lineWidth = 1.5; g.stroke(path); g.globalAlpha = 1; g.lineWidth = 1;
    });
    g.textAlign = "left"; g.textBaseline = "top"; g.font = "600 12px 'IBM Plex Sans', sans-serif"; g.fillStyle = TEXT;
    g.fillText("Average power spectrum (Welch, dB)", PAD.l, 4);
    if (sets.length > 1) legend(g, sets, c.w - PAD.r - 6, PAD.t + 16);   // inside the plot, clear of the title
  }

  function drawBands(el, sets, w, h) {
    var c = canvasFor(el, h || 210, w), g = c.g, pw = c.w - PAD.l - PAD.r, ph = c.h - PAD.t - PAD.b - 26;
    var all = [];
    sets.forEach(function (s) { all = all.concat(s.data.bands); });
    var top = Math.ceil((Math.max.apply(null, all) + 6) / 10) * 10, bottom = Math.floor((Math.min.apply(null, all) - 12) / 10) * 10;
    function Y(v) { return PAD.t + ph * (top - v) / (top - bottom); }
    g.fillStyle = BG_PLOT; g.fillRect(PAD.l, PAD.t, pw, ph);
    g.strokeStyle = GRID; g.fillStyle = TEXT; g.font = "11px 'IBM Plex Mono', monospace";
    for (var v = top; v >= bottom; v -= 10) {
      g.textAlign = "right"; g.textBaseline = "middle"; g.fillText(v + "", PAD.l - 5, Y(v));
      g.globalAlpha = 0.5; g.beginPath(); g.moveTo(PAD.l, Y(v) + 0.5); g.lineTo(PAD.l + pw, Y(v) + 0.5); g.stroke(); g.globalAlpha = 1;
    }
    var group = pw / BANDS.length, bar = Math.min(46, group * 0.36);
    BANDS.forEach(function (band, i) {
      var cx = PAD.l + group * (i + 0.5);
      sets.forEach(function (s, j) {
        var val = s.data.bands[i], x = sets.length === 1 ? cx - bar / 2 : cx + (j === 0 ? -bar - 2 : 2);
        g.fillStyle = (j === 0 ? BAND_A : BAND_B)[i]; g.globalAlpha = 0.88;
        g.fillRect(x, Y(val), bar, PAD.t + ph - Y(val)); g.globalAlpha = 1;
        g.fillStyle = TEXT; g.font = "600 11px 'IBM Plex Mono', monospace"; g.textAlign = "center"; g.textBaseline = "bottom";
        g.fillText(val.toFixed(1), x + bar / 2, Y(val) - 2);
      });
      g.font = "600 11px 'IBM Plex Sans', sans-serif"; g.fillStyle = TEXT; g.textBaseline = "top";
      g.fillText(band[0], cx, PAD.t + ph + 4);
      g.font = "10px 'IBM Plex Mono', monospace"; g.globalAlpha = 0.7; g.fillText(band[1], cx, PAD.t + ph + 18); g.globalAlpha = 1;
      if (sets.length === 2) {
        var delta = sets[1].data.bands[i] - sets[0].data.bands[i];
        g.fillStyle = delta > 0 ? UP : DOWN; g.font = "600 11px 'IBM Plex Mono', monospace";
        g.fillText("Δ " + (delta > 0 ? "+" : "") + delta.toFixed(1), cx, PAD.t + ph + 32);
      }
    });
    g.textAlign = "left"; g.textBaseline = "top"; g.font = "600 12px 'IBM Plex Sans', sans-serif"; g.fillStyle = TEXT;
    g.fillText("Frequency band energy (dB)" + (sets.length === 2 ? " · Δ = second minus first" : ""), PAD.l, 4);
    if (sets.length > 1) legend(g, sets, c.w - PAD.r - 6, PAD.t + 16);   // inside the plot, clear of the title
  }

  function legend(g, sets, right, y) {
    g.font = "600 11px 'IBM Plex Sans', sans-serif"; g.textAlign = "right"; g.textBaseline = "top";
    var x = right;
    sets.slice().reverse().forEach(function (s) {
      var text = s.label.length > 38 ? s.label.slice(0, 37) + "…" : s.label;
      g.fillStyle = s.color; g.fillText(text, x, y);
      x -= g.measureText(text).width + 10;
      g.fillRect(x, y + 3, 7, 7);
      x -= 14;
    });
  }

  // ------------------------------------------------------------------ panel
  var panel, state = { take: null, other: "", scale: "log", hooks: null, marks: [], drawn: 0, painters: {} };
  function $(id) { return document.getElementById(id); }
  function say(text, bad) {
    var el = $("specState");
    el.textContent = text || "";
    el.classList.toggle("is-bad", !!bad);
  }

  function paintCompare() {
    var sel = $("specCompare"), list = state.hooks ? state.hooks.others(state.take) : [];
    var keep = state.other;
    sel.innerHTML = "";
    var none = document.createElement("option");
    none.value = ""; none.textContent = "nothing — this take alone";
    sel.appendChild(none);
    list.forEach(function (o) {
      var opt = document.createElement("option");
      opt.value = o.url; opt.textContent = o.label; opt.setAttribute("translate", "no");   // HERESY 1165: a take's title is data
      sel.appendChild(opt);
    });
    sel.value = list.some(function (o) { return o.url === keep; }) ? keep : "";
    state.other = sel.value;
  }

  function render() {
    // HERESY 1014: only when on screen — in a hidden tab it would fetch a whole take for nothing
    if (!panel || !panel.open || !state.take || !panel.offsetParent) return;
    var take = state.take, token = ++state.drawn;
    var wantB = state.other;
    // HERESY 1166: a render overtaken by a newer one (another take, a click on its step) says nothing more: its
    // "Forge is measuring…" used to land over the newer one's result and stay there
    var sayHere = function (text, bad) { if (token === state.drawn) say(text, bad); };
    var jobs = [analyse(take, sayHere)];
    if (wantB) jobs.push(analyse(state.hooks.byUrl(wantB) || { url: wantB }, sayHere));
    Promise.all(jobs).then(function (res) {
      if (token !== state.drawn) return;      // another take or setting since
      var a = res[0], b = res[1] || null;
      var labelB = wantB ? ($("specCompare").selectedOptions[0] || {}).textContent || "second" : "";
      var lo = -80, hi = -1e9;
      [a, b].forEach(function (d) { if (d) for (var i = 0; i < d.spec.db.length; i += 7) if (d.spec.db[i] > hi) hi = d.spec.db[i]; });
      var range = [Math.max(lo, -80), Math.max(hi, -40)];
      var sets = [{ data: a, label: take.label, color: COLOR_A }], scale = state.scale;
      if (b) sets.push({ data: b, label: labelB, color: COLOR_B });
      state.painters = {
        specA: { title: take.label + " — spectrogram", seek: true,
                 paint: function (el, w, h) { return drawSpectrogram(el, a, take.label, COLOR_A, scale, range, w, h); } },
        specAvg: { title: "Average power spectrum", paint: function (el, w, h) { drawAverage(el, sets, w, h); } },
        specBands: { title: "Frequency band energy", paint: function (el, w, h) { drawBands(el, sets, w, h); } }
      };
      if (b) state.painters.specB = { title: labelB + " — spectrogram",
        paint: function (el, w, h) { return drawSpectrogram(el, b, labelB, COLOR_B, scale, range, w, h); } };
      $("specStageB").hidden = !b;
      // shown before they are measured: a hidden canvas measures 0 and would be drawn at 320 px
      // and stretched (HERESY 1020 — the 1016 hiding had this backwards)
      panel.classList.add("is-drawn");
      state.marks = [state.painters.specA.paint($("specA"))];
      if (b) state.painters.specB.paint($("specB"));
      state.painters.specAvg.paint($("specAvg"));
      state.painters.specBands.paint($("specBands"));
      var tm = a.times || {}, f1 = function (x) { return (x || 0).toFixed(1); };
      say(clock(a.seconds) + " · peak " + (20 * Math.log10(a.peak + 1e-12)).toFixed(1) + " dBFS" +
          (b ? " · second " + clock(b.seconds) + ", peak " + (20 * Math.log10(b.peak + 1e-12)).toFixed(1) + " dBFS" : "") +
          (a.where === "Forge" ? " · measured on Forge, " + (a.bytes / 1e6).toFixed(1) + " MB in " + f1(tm.fetch) + " s"
            : " · measured here: " + (a.bytes / 1e6).toFixed(0) + " MB in " + f1(tm.fetch) + " s, decoded " + f1(tm.decode) +
              " s, measured " + f1((tm.stft || 0) + (tm.welch || 0)) + " s"));
      tick();
      window.dispatchEvent(new CustomEvent("heresy-step", { detail: { name: take.name, step: "spectrum" } }));   // HERESY 1029
    }).catch(function (error) {
      if (token === state.drawn) say("Could not measure: " + (error && error.message || error), true);
    });
  }

  // The playhead: a line over the first spectrogram while this take is in the player.
  var ticking = false;
  function tick() {
    if (ticking) return;
    ticking = true;
    (function frame() {
      var head = $("specHead"), mark = state.marks[0];
      var t = panel && panel.open && mark && state.hooks ? state.hooks.time(state.take) : null;
      if (t === null || t === undefined) { head.hidden = true; ticking = false; return; }
      head.hidden = false;
      head.style.left = (mark.x + mark.w * Math.min(1, t / mark.seconds)) + "px";
      head.style.top = PAD.t + "px";
      head.style.height = (250 - PAD.t - PAD.b) + "px";
      setTimeout(frame, 100);
    })();
  }

  function seekFrom(event) {
    var mark = state.marks[0];
    if (!mark || !state.hooks) return;
    var box = $("specA").getBoundingClientRect(), x = event.clientX - box.left - mark.x;
    if (x < 0 || x > mark.w) return;
    state.hooks.seek(state.take, x / mark.w * mark.seconds);
    tick();
  }

  // One picture over the whole screen, drawn again at every zoom (heresy-zoom.js).
  function expand(id) {
    var painter = state.painters[id];
    if (!painter || !window.HeresyZoom) return;
    var take = state.take, mark = null;
    window.HeresyZoom.open({
      title: painter.title,
      fill: true,
      maxPixels: 16000,                           // the browsers' canvas side limit, with room
      maxWidth: 3840,                             // HERESY 1021 (Viktor): zoom stops at 4K wide
      render: function (w, h) {
        var el = document.createElement("canvas");
        el.style.width = w + "px";
        mark = painter.paint(el, w, h) || null;
        return el;
      },
      onClick: painter.seek ? function (x, y, w) {
        if (!mark || !state.hooks) return;
        var scaleX = w / (mark.x * 2 + mark.w + (PAD.r - PAD.l));   // the drawn size against the shown size
        var t = (x / scaleX - mark.x) / mark.w * mark.seconds;
        if (t >= 0 && t <= mark.seconds) state.hooks.seek(take, t);
      } : null
    });
  }

  function init(hooks) {
    panel = $("spectrumPanel");
    if (!panel) return;
    state.hooks = hooks;
    panel.addEventListener("toggle", function () { if (panel.open) { paintCompare(); render(); } });
    $("specCompare").addEventListener("change", function () { state.other = this.value; render(); });
    window.addEventListener("heresy-derived", function () { if (panel.open) paintCompare(); });   // HERESY 1021
    Array.prototype.forEach.call(panel.querySelectorAll("[data-spec-scale]"), function (btn) {
      btn.addEventListener("click", function () {
        state.scale = btn.dataset.specScale;
        Array.prototype.forEach.call(panel.querySelectorAll("[data-spec-scale]"), function (b) { b.classList.toggle("is-active", b === btn); });
        render();
      });
    });
    $("specA").addEventListener("click", seekFrom);
    Array.prototype.forEach.call(panel.querySelectorAll("[data-expand]"), function (btn) {
      btn.addEventListener("click", function () { expand(btn.dataset.expand); });
      $(btn.dataset.expand).addEventListener("dblclick", function () { expand(btn.dataset.expand); });
    });
    var resizeTimer;
    window.addEventListener("resize", function () { clearTimeout(resizeTimer); resizeTimer = setTimeout(render, 250); });
  }

  // take: { name, url, flac (optional), label }
  function setTake(take) {
    if (!panel) return;
    var same = state.take && take && state.take.url === take.url;
    state.take = take;
    if (same) return;
    state.marks = [];
    panel.classList.remove("is-drawn");
    say(panel.open ? "" : "");
    if (panel.open) { paintCompare(); render(); }
  }

  // HERESY 1021: lay a file (a stem, a remaster) over the take
  function compareWith(url) {
    paintCompare();
    $("specCompare").value = url;
    state.other = $("specCompare").value;
    render();
  }

  window.HeresySpectrum = { init: init, setTake: setTake, compareWith: compareWith };
})();
