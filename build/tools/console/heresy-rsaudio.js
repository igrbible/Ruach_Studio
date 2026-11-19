// HERESY 2837 (Viktor 18.11.2026: «Предлагаю написать библиотеку/плагин RuachStudioAudio и юзать его вместо отстойного WebAudio»): RuachStudioAudio,
// the players' own sound, in place of Web Audio. Two ways a take reaches an <audio>, both the browser's media pipeline and its own buffer: the take
// whole in the page, raised here (render, below, 2835); or streamed, raised on the fly by the lab by the same rule (streamUrl: lab/lift_stream.py).
// At a gain of 1 the take's own file plays, bit for bit.
// HERESY 2835 (Viktor 18.11.2026: «Не режь наш плеер как маньяк! Мы подымаем dB, из-за того, что YuE2 движок больше не клипует наши треки. Громкость нам
// всё равно нужно высчитывать и подымать, как если бы клиповалось, именно так, как сейчас в плеере есть функция с кнопкой… к хуям выключая все
// обработки. Мы просто вернёмся к старому корыту»; earlier the same day: «Нам нужен сырой звук… НИКАКОГО шаманства с выхлопами из плееров»): a take
// raised past its own file, as the old engine's Peak clip raised it. The players' lift (the footer's +dB of 2037 and its volume past 100 % of 1700,
// the compare window's +dB and volume of 2044) was a gain and a DynamicsCompressor «limiter» in a Web Audio graph between the element and the
// speakers; a 200 s capture of his M-Track while a take played (17.11) showed six under-runs of exactly 512 frames and the level against the file
// swinging −3.6…+10.8 dB. Now a lifted take is a copy of its whole, made here once: every sample times the gain and whatever passes full scale cut
// flat at full scale, ±8388607 in 24 bits, exactly as audio_normalize cut it before 2007 (build/src/audio-io.h: clamp to ±1, × 8388607); nothing
// else. A 24-bit WAV at the take's own rate (read from its FLAC or WAV head, so the decoder never resamples; Opus decodes at 48 kHz), played by an
// <audio> as any take is, through the browser's media pipeline and its buffer (his fosforida.quest plays so and never clicks). Measured on the
// Forge, a 6-minute take (heresy/MISC/claude-arc/day-2026-11-18/player-lift-2835/): its FLAC decoded in about 1 s, raised and packed in a worker in
// under 1 s; read back, every sample within half a step of 24 bits of clamp(file × gain), every clipped one at ±8388607; played, what the element
// hands on equal to the copy sample for sample.
//
// window.RuachStudioAudio.render(src, gain) → a promise of { url, src, g, bytes, clipped, over, frames, ch, rate, ms, decodeMs, packMs }: src a blob: (or same-origin) address
// of the whole file; one render at a time, the worker keeping the last source's sound so a new gain for it is only raised and packed again.
// of(url): what a copy is (null for anything else). revoke(url): a copy let go. forget(src): the worker lets the sound it keeps go (src's only).
(function () {
  "use strict";

  // the worker: one source's sound kept (planar Float32 as the decoder gave it), raised and packed on demand
  function work() {
    var pcm = null, rate = 0;
    onmessage = function (e) {
      var d = e.data || {};
      if (d.forget) { pcm = null; return; }
      if (d.chs) { pcm = d.chs; rate = d.rate; }
      if (!pcm) { postMessage({ id: d.id, error: "no sound kept for this copy" }); return; }
      var C = pcm.length, n = pcm[0].length, g = +d.g, FS = 8388607, bytes = 44 + n * C * 3, buf, t0 = Date.now();
      try { buf = new ArrayBuffer(bytes); } catch (x) { postMessage({ id: d.id, error: "no memory for a copy of " + Math.round(bytes / 1048576) + " MB" }); return; }
      var dv = new DataView(buf), u8 = new Uint8Array(buf), clipped = 0, over = 0, o = 44, i, c, v, q, x, G = g * 8388608;   // G: the gain in steps of 24 bits
      var put = function (at, s) { for (var k = 0; k < s.length; k++) u8[at + k] = s.charCodeAt(k); };
      put(0, "RIFF"); dv.setUint32(4, bytes - 8, true); put(8, "WAVE"); put(12, "fmt "); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, C, true);
      dv.setUint32(24, rate, true); dv.setUint32(28, rate * C * 3, true); dv.setUint16(32, C * 3, true); dv.setUint16(34, 24, true); put(36, "data"); dv.setUint32(40, n * C * 3, true);
      // each sample the nearest step of 24 bits of sample × gain (a gain of 1 gives the file's own steps); one past ±8388607 cut flat there, as the old
      // engine's Peak clip cut (clamp to ±1, × 8388607); «over»: how far the highest of them went, in full scales (0: none went past)
      if (C === 2) {                                      // the usual stereo take, the same steps written out twice (the loop the cost is in)
        var Lc = pcm[0], Rc = pcm[1];
        for (i = 0; i < n; i++, o += 6) {
          v = Lc[i] * G; q = Math.round(v);
          if (q > FS || q < -FS) { if (v >= 8388608 || v <= -8388608) clipped++; x = v < 0 ? -v : v; if (x > over) over = x; q = q > 0 ? FS : -FS; }
          u8[o] = q; u8[o + 1] = q >> 8; u8[o + 2] = q >> 16;
          v = Rc[i] * G; q = Math.round(v);
          if (q > FS || q < -FS) { if (v >= 8388608 || v <= -8388608) clipped++; x = v < 0 ? -v : v; if (x > over) over = x; q = q > 0 ? FS : -FS; }
          u8[o + 3] = q; u8[o + 4] = q >> 8; u8[o + 5] = q >> 16;
        }
      } else {
        for (i = 0; i < n; i++) {
          for (c = 0; c < C; c++, o += 3) {
            v = pcm[c][i] * G; q = Math.round(v);
            if (q > FS || q < -FS) { if (v >= 8388608 || v <= -8388608) clipped++; x = v < 0 ? -v : v; if (x > over) over = x; q = q > 0 ? FS : -FS; }
            u8[o] = q; u8[o + 1] = q >> 8; u8[o + 2] = q >> 16;
          }
        }
      }
      over /= 8388608;
      postMessage({ id: d.id, wav: buf, clipped: clipped, over: over, frames: n, ch: C, rate: rate, ms: Date.now() - t0 }, [buf]);
    };
  }

  var W = null, jobs = {}, seq = 0, kept = "", made = {}, line = Promise.resolve(), stats = { renders: 0, decodes: 0, lastMs: 0, lastDecodeMs: 0, lastPackMs: 0 };
  function worker() {
    if (W) return W;
    W = new Worker(URL.createObjectURL(new Blob(["(" + work.toString() + ")();"], { type: "application/javascript" })));
    W.onmessage = function (e) { var d = e.data || {}, j = jobs[d.id]; if (!j) return; delete jobs[d.id]; if (d.error) j.no(new Error(d.error)); else j.ok(d); };
    W.onerror = function (e) { Object.keys(jobs).forEach(function (k) { jobs[k].no(new Error("the lift's worker failed: " + (e && e.message || "?"))); delete jobs[k]; }); kept = ""; };
    return W;
  }
  // the source's own rate from its head: FLAC's STREAMINFO, a WAV's fmt chunk; else 48 kHz (Opus decodes at 48 kHz; an MP3 is resampled to it)
  function rateOf(ab) {
    var u = new Uint8Array(ab, 0, Math.min(ab.byteLength, 65536)), tag = function (at) { return String.fromCharCode(u[at], u[at + 1], u[at + 2], u[at + 3]); };
    if (u.length > 21 && tag(0) === "fLaC") { var r = (u[18] << 12) | (u[19] << 4) | (u[20] >> 4); if (r >= 3000) return r; }
    if (u.length > 12 && tag(0) === "RIFF" && tag(8) === "WAVE") {
      for (var at = 12; at + 16 <= u.length;) {
        var size = u[at + 4] | (u[at + 5] << 8) | (u[at + 6] << 16) | (u[at + 7] << 24);
        if (tag(at) === "fmt " && at + 16 <= u.length) { var wr = (u[at + 12] | (u[at + 13] << 8) | (u[at + 14] << 16) | (u[at + 15] << 24)) >>> 0; if (wr >= 3000) return wr; break; }
        if (size < 0) break;
        at += 8 + size + (size & 1);
      }
    }
    return 48000;
  }
  function decode(src) {
    var Off = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!Off) return Promise.reject(new Error("this browser has no audio decoder"));
    var t0 = Date.now();
    return fetch(src).then(function (r) { if (!r.ok) throw new Error("the take did not come (" + r.status + ")"); return r.arrayBuffer(); }).then(function (ab) {
      return new Off(2, 1, rateOf(ab)).decodeAudioData(ab);
    }).then(function (b) {
      stats.decodes++; stats.lastDecodeMs = Date.now() - t0;
      var chs = [];
      for (var c = 0; c < b.numberOfChannels; c++) chs.push(b.getChannelData(c));
      return { chs: chs, rate: b.sampleRate };
    });
  }
  function job(src, g) {
    var id = ++seq, t0 = Date.now(), w, dms = 0;
    var answer = new Promise(function (ok, no) { jobs[id] = { ok: ok, no: no }; });
    var ready = kept === src ? Promise.resolve(null) : decode(src).then(function (s) { dms = Date.now() - t0; return s; });
    return ready.then(function (s) {
      w = worker();
      if (!s) { w.postMessage({ id: id, g: g }); return answer; }
      kept = src;
      var moved = s.chs.map(function (c) { return c.buffer; });
      try { w.postMessage({ id: id, g: g, chs: s.chs, rate: s.rate }, moved); }
      catch (e) {                                     // a decoder's buffers that cannot move: copied
        var copies = s.chs.map(function (c) { return new Float32Array(c); });
        w.postMessage({ id: id, g: g, chs: copies, rate: s.rate }, copies.map(function (c) { return c.buffer; }));
      }
      return answer;
    }).then(function (r) {
      var blob = new Blob([r.wav], { type: "audio/wav" }), url = URL.createObjectURL(blob);
      var info = { url: url, src: src, g: g, bytes: blob.size, clipped: r.clipped, over: r.over, frames: r.frames, ch: r.ch, rate: r.rate, ms: Date.now() - t0, decodeMs: dms, packMs: r.ms };
      made[url] = info;
      stats.renders++; stats.lastMs = info.ms; stats.lastPackMs = r.ms;
      return info;
    }, function (e) { if (kept === src) kept = ""; delete jobs[id]; throw e; });
  }
  function render(src, g) {
    g = +g;
    if (!src || !(g > 0) || !isFinite(g)) return Promise.reject(new Error("no source or no gain"));
    var p = line.then(function () { return job(src, g); });
    line = p.then(function () {}, function () {});    // one at a time: one take's sound in memory, never two being decoded
    return p;
  }
  function revoke(url) {
    if (!url || !made[url]) return;
    delete made[url];
    try { URL.revokeObjectURL(url); } catch (e) { /* gone */ }
  }
  function forget(src) { if (src && src !== kept) return; kept = ""; if (W) W.postMessage({ forget: true }); }   // the sound kept let go (only that source's, when one is named)
  // HERESY 2837: the lab's stream of the take raised by g, made on the fly from its own WAV by the same rule (lab/lift_stream.py); its gain read back
  function streamUrl(name, g, codec) { return "/lab/listen?lift=" + (+g) + (codec ? "&codec=" + codec : "") + "&name=" + encodeURIComponent(name); }   // codec "opus": in Opus, kept in RAM (2837b)
  function streamGain(src) { var m = /^\/lab\/listen\?lift=([^&]+)&/.exec(src || ""); return m ? +m[1] || 0 : 0; }
  window.RuachStudioAudio = {
    render: render, revoke: revoke, forget: forget, streamUrl: streamUrl, streamGain: streamGain,
    of: function (url) { return (url && made[url]) || null; },
    rateOf: rateOf,
    FULL_SCALE: 8388607,
    stats: function () {
      var n = 0, bytes = 0;
      Object.keys(made).forEach(function (u) { n++; bytes += made[u].bytes || 0; });
      return { copies: n, bytes: bytes, kept: kept ? "yes" : "", renders: stats.renders, decodes: stats.decodes, lastMs: stats.lastMs, lastDecodeMs: stats.lastDecodeMs, lastPackMs: stats.lastPackMs };
    }
  };
})();
