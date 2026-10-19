// HERESY 1531 (Viktor 18.10.2026: «Преврати твой DAW начаток в профессиональный миксер как ты умеешь. У тебя есть на что смотреть»):
// the DAW's console, under its lanes. Every lane a strip of a mixing desk: its inserts (the EQ, its curve in small; the compressor,
// its reduction), the sends to the room and the delay, width and pan, polarity, mute and solo, the fader with its meter on the same
// scale; then the two returns and the master, with the loudness the master carries (momentary, short-term, integrated since play),
// its true peak and the correlation of its sides. A strip's devices open beside it: the input (trim, polarity, its version), the EQ
// drawn over the strip's own spectrum with its bands taken by the hand, the compressor with its curve and its reduction, the output.
// What the hand sets is heard at once (heresy-mixer.js wires it) and mixed on Forge the same (lab/daw_mix.py). No dropdowns: chips.
(function () {
  "use strict";

  var C = { sel: "", tab: "mixer", band: "", drag: null, wheelAt: 0, eqRaf: 0, lastFrame: 0 };
  function K() { return window.HeresyMixer && window.HeresyMixer.k; }
  function $(id) { return document.getElementById(id); }
  function tr(s) { return window.RuachI18n ? window.RuachI18n.t(s) : s; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function minus(s) { return String(s).replace(/^-/, "−"); }
  function fdb(v) { v = +v || 0; return (v > 0 ? "+" : "") + minus(v.toFixed(1)) + " dB"; }   // as the lanes say it
  function fsend(v) { return v <= 0 ? "−∞" : fdb(20 * Math.log10(v)); }
  function fpan(v) { return Math.abs(v) < 0.005 ? "C" : (v < 0 ? "L" : "R") + Math.round(Math.abs(v) * 100); }
  function fpct(v) { return Math.round(v * 100) + "%"; }
  function fratio(v) { return (+v).toFixed(v < 10 ? 1 : 0) + ":1"; }
  function fms(v) { return v >= 1000 ? (v / 1000).toFixed(2) + " s" : (v < 10 ? (+v).toFixed(1) : Math.round(v)) + " ms"; }
  function fhz(v) { return v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 1 : 2) + " kHz" : Math.round(v) + " Hz"; }
  function fq(v) { return (+v).toFixed(2); }
  function fdbtp(v) { return minus((+v).toFixed(1)) + " dBTP"; }   // HERESY 1544

  // ---- what each knob turns: its range, how it moves (lin, log, send: the amount squared, so the middle is −12 dB) and how it reads
  var P = {
    trim_db: { min: -24, max: 24, def: 0, step: 0.1, fmt: fdb, lab: "Trim", tip: "Trim: the strip's level before its EQ and compressor" },
    pan: { min: -1, max: 1, def: 0, step: 0.01, fmt: fpan, lab: "Pan", bi: true, tip: "Pan: the strip between the sides (the browser's stereo panner, the render's law)" },
    width: { min: 0, max: 2, def: 1, step: 0.01, fmt: fpct, lab: "Width", bi: true, mid: 1, tip: "Width: 0 % mono, 100 % as it came, 200 % its sides doubled" },
    reverb: { min: 0, max: 1, def: 0, step: 0.005, fmt: fsend, lab: "Room", taper: "send", tip: "Send to the room, after the fader and the pan" },
    delay: { min: 0, max: 1, def: 0, step: 0.005, fmt: fsend, lab: "Delay", taper: "send", tip: "Send to the delay, after the fader and the pan" },
    "comp.threshold_db": { min: -60, max: 0, def: -18, step: 0.5, fmt: fdb, lab: "Threshold", tip: "Where the compressor starts" },
    "comp.ratio": { min: 1, max: 10, def: 2, step: 0.1, fmt: fratio, lab: "Ratio", taper: "log", tip: "How much it holds back above the threshold" },
    "comp.attack_ms": { min: 1, max: 200, def: 10, step: 0.5, fmt: fms, lab: "Attack", taper: "log", tip: "How fast it takes hold" },
    "comp.release_ms": { min: 10, max: 2000, def: 120, step: 5, fmt: fms, lab: "Release", taper: "log", tip: "How fast it lets go" },
    "comp.knee_db": { min: 0, max: 24, def: 6, step: 0.5, fmt: fdb, lab: "Knee", tip: "How softly it bends into the ratio" },
    "comp.makeup_db": { min: 0, max: 24, def: 0, step: 0.1, fmt: fdb, lab: "Make-up", tip: "The level given back after it" },
    "reverb.return_db": { min: -60, max: 6, def: 0, step: 0.1, fmt: fdb, lab: "Return", tip: "The room's level into the master" },
    "delay.return_db": { min: -60, max: 6, def: 0, step: 0.1, fmt: fdb, lab: "Return", tip: "The delay's level into the master" },
    "delay.feedback": { min: 0, max: 0.8, def: 0.35, step: 0.01, fmt: fpct, lab: "Feedback", tip: "How much of each echo comes back as the next" },
    "delay.lowpass_hz": { min: 200, max: 20000, def: 4000, step: 10, fmt: fhz, lab: "Low-pass", taper: "log", tip: "Each echo darker than the one before, above this" },
    "delay.time_ms": { min: 5, max: 2000, def: 375, step: 1, fmt: fms, lab: "Time", taper: "log", tip: "The time between the echoes" },
    "master.gain_db": { min: -24, max: 12, def: 0, step: 0.1, fmt: fdb, lab: "Master", tip: "The master's level" },
    "limit.ceiling_db": { min: -12, max: -0.3, def: -1, step: 0.1, fmt: fdbtp, lab: "Ceiling", tip: "The highest true peak let through, 4× interpolated" },   // HERESY 1544
    "limit.drive_db": { min: -12, max: 24, def: 0, step: 0.1, fmt: fdb, lab: "Drive", tip: "How hard the mix is driven into the limiter: louder, and held under the ceiling" },
    "limit.release_ms": { min: 10, max: 1000, def: 100, step: 5, fmt: fms, lab: "Release", taper: "log", tip: "How fast it lets go: the time to give back 12 dB" },
    "band.frequency_hz": { min: 20, max: 20000, def: 1000, step: 1, fmt: fhz, lab: "Freq", taper: "log", tip: "The band's frequency" },
    "band.gain_db": { min: -12, max: 12, def: 0, step: 0.1, fmt: fdb, lab: "Gain", bi: true, mid: 0, tip: "The band's gain" },
    "band.q": { min: 0.2, max: 10, def: 0.707, step: 0.01, fmt: fq, lab: "Q", taper: "log", tip: "The band's width: a low Q wide, a high Q narrow" }
  };
  function toPos(p, v) {
    if (p.taper === "log") return Math.log(v / p.min) / Math.log(p.max / p.min);
    if (p.taper === "send") return Math.sqrt(clamp(v, 0, 1));
    return (v - p.min) / (p.max - p.min);
  }
  function fromPos(p, x) {
    x = clamp(x, 0, 1);
    var v = p.taper === "log" ? p.min * Math.pow(p.max / p.min, x) : p.taper === "send" ? x * x : p.min + x * (p.max - p.min);
    v = Math.round(v / p.step) * p.step;
    return clamp(+v.toFixed(4), p.min, p.max);
  }

  // ---- the value a control stands for, and setting it: "s" a strip's, "b" a bus's, "e" the selected EQ band's
  function band(n, id) { var s = K().strip(n); return s.eq ? s.eq.bands.filter(function (b) { return String(b.id) === String(id); })[0] : null; }
  function grp(n) { return K().groups().filter(function (x) { return "@" + x.id === n; })[0] || null; }   // HERESY 1543: a VCA by its strip's key
  function get(kt, n, k) {
    var M = K();
    if (kt === "b") { var bk = k.split("."); return M.S.buses[bk[0]][bk[1]]; }
    if (kt === "g") { var gx = grp(n); return gx ? gx[k] : 0; }   // HERESY 1543
    if (kt === "e") { var b = band(n, C.band); return b ? +b[k.slice(5)] : P[k].def; }
    var s = M.strip(n);
    if (k.indexOf("comp.") === 0) return (s.comp || {})[k.slice(5)] != null ? s.comp[k.slice(5)] : P[k].def;
    if (k.indexOf("limit.") === 0) return (s.limit || {})[k.slice(6)] != null ? s.limit[k.slice(6)] : P[k].def;   // HERESY 1544
    return s[k];
  }
  function put(kt, n, k, v) {
    var M = K();
    if (kt === "b") { var bk = k.split("."); M.setBus(bk[0], bk[1], v); return; }
    if (kt === "g") { M.groupSet(n.slice(1), k, v); return; }   // HERESY 1543
    if (kt === "e") { editBand(n, C.band, function (b) { b[k.slice(5)] = v; }); return; }
    if (k.indexOf("comp.") === 0 && !(M.strip(n).comp)) M.set(n, "comp", { on: true });
    if (k.indexOf("limit.") === 0 && !(M.strip(n).limit)) M.set(n, "limit", { on: true });   // HERESY 1544
    M.set(n, k, v);
  }
  function editBand(n, id, fn) {
    var M = K(), eq = M.strip(n).eq || { on: true, bands: [] };   // HERESY 1544: the master's too
    eq = { on: eq.on !== false, bands: eq.bands.map(function (b) { return Object.assign({}, b); }) };
    var b = eq.bands.filter(function (x) { return String(x.id) === String(id); })[0];
    if (b) fn(b, eq); else fn(null, eq);
    M.set(n, "eq", eq);
  }

  // ---- a knob: a 270° arc, dragged up and down (Shift finer), the wheel, the arrows; a double-click puts it back
  function arc(cx, cy, r, a0, a1) {
    var p0 = [cx + r * Math.cos(a0), cy + r * Math.sin(a0)], p1 = [cx + r * Math.cos(a1), cy + r * Math.sin(a1)], large = Math.abs(a1 - a0) > Math.PI ? 1 : 0;
    return "M" + p0[0].toFixed(2) + " " + p0[1].toFixed(2) + "A" + r + " " + r + " 0 " + large + " " + (a1 > a0 ? 1 : 0) + " " + p1[0].toFixed(2) + " " + p1[1].toFixed(2);
  }
  var A0 = Math.PI * 0.75, SWEEP = Math.PI * 1.5;
  function knobSvg(p, x) {
    var from = p.bi ? toPos(p, p.mid != null ? p.mid : 0) : 0, a = A0 + SWEEP * x, a0 = A0 + SWEEP * Math.min(from, x), a1 = A0 + SWEEP * Math.max(from, x);
    return '<svg viewBox="0 0 40 40" aria-hidden="true"><path class="kn-track" d="' + arc(20, 20, 15, A0, A0 + SWEEP) + '"/>' +
      (a1 - a0 > 0.01 ? '<path class="kn-val" d="' + arc(20, 20, 15, a0, a1) + '"/>' : "") +
      '<line class="kn-ptr" x1="' + (20 + 6 * Math.cos(a)).toFixed(2) + '" y1="' + (20 + 6 * Math.sin(a)).toFixed(2) + '" x2="' + (20 + 13 * Math.cos(a)).toFixed(2) + '" y2="' + (20 + 13 * Math.sin(a)).toFixed(2) + '"/></svg>';
  }
  function knob(kt, n, k, opt) {
    opt = opt || {};
    var p = P[k], v = get(kt, n, k), lab = tr(opt.lab || p.lab);
    return '<div class="kn' + (opt.small ? " kn-s" : "") + '" role="slider" tabindex="0" data-kt="' + kt + '" data-n="' + esc(n) + '" data-k="' + k + '" aria-label="' + esc(lab) +
      '" aria-valuemin="' + p.min + '" aria-valuemax="' + p.max + '" aria-valuenow="' + v + '" aria-valuetext="' + esc(p.fmt(v)) + '" data-tip="' + esc(tr(p.tip)) + '">' +
      knobSvg(p, toPos(p, v)) + '<span class="kn-lab">' + esc(lab) + '</span><output class="kn-out mono">' + esc(p.fmt(v)) + "</output></div>";
  }
  function paintKnob(el) {
    var p = P[el.dataset.k], v = get(el.dataset.kt, el.dataset.n, el.dataset.k);
    if (v == null) return;
    var svg = el.querySelector("svg");
    if (svg) svg.outerHTML = knobSvg(p, toPos(p, v));
    var o = el.querySelector(".kn-out");
    if (o) o.textContent = p.fmt(v);
    el.setAttribute("aria-valuenow", v); el.setAttribute("aria-valuetext", p.fmt(v));
  }
  // ---- a fader: dB on the same scale as its meter (heresy-mixer.js taper), the meter's two sides beside it
  var TICKS = [12, 6, 0, -6, -12, -24, -40, -60];
  function fader(kt, n, k, lo, hi, meterKey) {
    var M = K(), v = get(kt, n, k), p0 = M.taper(lo), p1 = M.taper(hi), at = (M.taper(v) - p0) / (p1 - p0);
    return '<div class="fd" data-kt="' + kt + '" data-n="' + esc(n) + '" data-k="' + k + '" data-lo="' + lo + '" data-hi="' + hi + '">' +
      '<div class="fd-scale" aria-hidden="true">' + TICKS.filter(function (t) { return t >= lo && t <= hi; }).map(function (t) {
        return '<span style="bottom:' + (((M.taper(t) - p0) / (p1 - p0)) * 100).toFixed(1) + '%">' + (t > 0 ? "+" : "") + minus(t) + "</span>"; }).join("") + "</div>" +
      '<div class="fd-track" role="slider" tabindex="0" aria-label="' + esc(tr("Level")) + '" aria-valuemin="' + lo + '" aria-valuemax="' + hi + '" aria-valuenow="' + v + '" aria-valuetext="' + esc(fdb(v)) +
        '" data-tip="' + esc(tr("The level: drag (Shift finer), the wheel or the arrows; a double-click puts it back at 0 dB")) + '"><i class="fd-cap" style="bottom:' + (at * 100).toFixed(2) + '%"></i></div>' +
      '<div class="fd-meter" data-meter="' + esc(meterKey) + '" aria-hidden="true"><i class="fd-rms"></i><i class="fd-pk"></i><i class="fd-rms"></i><i class="fd-pk"></i><b></b><b></b></div></div>';
  }
  function faderValue(el, v) {
    var M = K(), lo = +el.dataset.lo, hi = +el.dataset.hi, p0 = M.taper(lo), p1 = M.taper(hi);
    var cap = el.querySelector(".fd-cap"), track = el.querySelector(".fd-track");
    if (cap) cap.style.bottom = (((M.taper(v) - p0) / (p1 - p0)) * 100).toFixed(2) + "%";
    if (track) { track.setAttribute("aria-valuenow", v); track.setAttribute("aria-valuetext", fdb(v)); }
  }

  // ---- the console: the strips, the returns, the master
  function icon(n, alt) { return window.HeresyIcons ? window.HeresyIcons.ui(n) : alt; }
  function stripHtml(n) {
    var M = K(), s = M.strip(n), eqOn = s.eq && s.eq.on && s.eq.bands.some(function (b) { return b.enabled !== false; }), compOn = s.comp && s.comp.on;
    return '<div class="mc-strip' + (C.sel === n ? " is-sel" : "") + (M.audible(n) ? "" : " is-quiet") + '" data-n="' + esc(n) + '" style="--mc-hue:' + M.hue(n) + '">' +
      '<button type="button" class="mc-name" data-act="select" translate="no" data-tip="' + esc(M.title(n) + " \u00b7 " + tr("Its devices: input, EQ, compressor, output")) + '">' + esc(M.title(n)) + "</button>" +
      '<div class="mc-ins">' +
        '<button type="button" class="mc-slot' + (eqOn ? " is-on" : "") + '" data-act="eq" data-tip="' + esc(tr("The EQ: up to eight bands, drawn over the strip's own sound")) + '"><span>EQ</span><canvas class="mc-eqmini" width="60" height="18"></canvas></button>' +
        '<button type="button" class="mc-slot' + (compOn ? " is-on" : "") + '" data-act="comp" data-tip="' + esc(tr("The compressor: its reduction as it plays")) + '"><span>' + esc(tr("Comp")) + '</span><span class="mc-gr"><i></i></span></button>' +
      "</div>" +
      '<div class="mc-row">' + knob("s", n, "reverb", { small: true }) + knob("s", n, "delay", { small: true }) + "</div>" +
      '<div class="mc-row">' + knob("s", n, "width", { small: true }) + knob("s", n, "pan", { small: true }) + "</div>" +
      '<div class="mc-btns">' +
        '<button type="button" class="mx-ms' + (s.invert ? " is-on" : "") + '" data-act="invert" aria-pressed="' + s.invert + '" data-tip="' + esc(tr("Polarity: the strip upside down")) + '">Ø</button>' +
        '<button type="button" class="mx-ms' + (s.mute ? " is-on" : "") + '" data-act="mute" aria-pressed="' + s.mute + '" data-tip="' + esc(tr("Mute")) + '">M</button>' +
        '<button type="button" class="mx-ms mx-solo' + (s.solo ? " is-on" : "") + '" data-act="solo" aria-pressed="' + s.solo + '" data-tip="' + esc(tr("Solo: only the soloed lanes are heard")) + '">S</button></div>' +
      fader("s", n, "gain_db", -60, 12, n) +
      '<div class="mc-read"><output class="mc-db mono">' + esc(fdb(s.gain_db)) + '</output><button type="button" class="mc-pk mono" data-act="peaks" data-meter-max="' + esc(n) + '" data-tip="' +
        esc(tr("The loudest peak since it was last cleared; a click clears every strip's")) + '">−∞</button></div></div>';
  }
  function vcaHtml(x) {                              // HERESY 1543: a VCA: no sound of its own, its fader adds to its members'
    var M = K(), n = "@" + x.id;
    return '<div class="mc-strip mc-vca' + (C.sel === n ? " is-sel" : "") + '" data-n="' + esc(n) + '">' +
      '<button type="button" class="mc-name" data-act="select" translate="no" data-tip="' + esc(x.name + " \u00b7 " + tr("A VCA: its fader adds its dB to each member's, M mutes them, S solos them; its devices name it and choose its members")) + '">' + esc(x.name) + "</button>" +
      '<div class="mc-ins mc-vca-mid"><span class="mc-vca-n mono" translate="no">' + esc(String(x.members.length)) + '</span><span class="row-hint">' + esc(tr("members")) + "</span>" +
        '<span class="mc-vca-who" translate="no">' + x.members.map(function (y) { return '<i style="--mc-hue:' + M.hue(y) + '"></i>'; }).join("") + "</span></div>" +
      '<div class="mc-btns"><button type="button" class="mx-ms' + (x.mute ? " is-on" : "") + '" data-act="gmute" aria-pressed="' + x.mute + '" data-tip="' + esc(tr("Mute its members")) + '">M</button>' +
        '<button type="button" class="mx-ms mx-solo' + (x.solo ? " is-on" : "") + '" data-act="gsolo" aria-pressed="' + x.solo + '" data-tip="' + esc(tr("Solo its members")) + '">S</button></div>' +
      fader("g", n, "gain_db", -60, 12, "") +
      '<div class="mc-read"><output class="mc-db mono">' + esc(fdb(x.gain_db)) + "</output></div></div>";
  }
  function busHtml(x) {                              // HERESY 1563: an audio bus: its members' sum through a strip's own chain
    var M = K(), n = "%" + x.id, s = M.strip(n), eqOn = s.eq && s.eq.on && s.eq.bands.some(function (b) { return b.enabled !== false; }), compOn = s.comp && s.comp.on;
    return '<div class="mc-strip mc-bus' + (C.sel === n ? " is-sel" : "") + (s.mute ? " is-quiet" : "") + '" data-n="' + esc(n) + '">' +
      '<button type="button" class="mc-name" data-act="select" translate="no" data-tip="' + esc(x.name + " \u00b7 " + tr("An audio bus: its members' sound summed and run through its own EQ, compressor, fader, width and pan into the master; its devices choose its members")) + '">' + esc(x.name) + "</button>" +
      '<div class="mc-ins">' +
        '<button type="button" class="mc-slot' + (eqOn ? " is-on" : "") + '" data-act="eq" data-tip="' + esc(tr("The EQ: up to eight bands, drawn over the strip's own sound")) + '"><span>EQ</span><canvas class="mc-eqmini" width="60" height="18"></canvas></button>' +
        '<button type="button" class="mc-slot' + (compOn ? " is-on" : "") + '" data-act="comp" data-tip="' + esc(tr("The compressor: its reduction as it plays")) + '"><span>' + esc(tr("Comp")) + '</span><span class="mc-gr"><i></i></span></button>' +
      "</div>" +
      '<div class="mc-ins mc-vca-mid"><span class="mc-vca-n mono" translate="no">' + esc(String(x.members.length)) + '</span><span class="row-hint">' + esc(tr("members")) + "</span>" +
        '<span class="mc-vca-who" translate="no">' + x.members.map(function (y) { return '<i style="--mc-hue:' + M.hue(y) + '"></i>'; }).join("") + "</span></div>" +
      '<div class="mc-row">' + knob("s", n, "width", { small: true }) + knob("s", n, "pan", { small: true }) + "</div>" +
      '<div class="mc-btns"><button type="button" class="mx-ms' + (s.mute ? " is-on" : "") + '" data-act="mute" aria-pressed="' + s.mute + '" data-tip="' + esc(tr("Mute the bus: its members are not heard")) + '">M</button></div>' +
      fader("s", n, "gain_db", -60, 12, n) +
      '<div class="mc-read"><output class="mc-db mono">' + esc(fdb(s.gain_db)) + '</output><button type="button" class="mc-pk mono" data-act="peaks" data-meter-max="' + esc(n) + '">−∞</button></div></div>';
  }
  function subOf2(n) { return n && n.charAt(0) === "%" ? K().subs().filter(function (x) { return "%" + x.id === n; })[0] || null : null; }
  var PRESETS = [["room", "1.2 s"], ["plate", "1.6 s"], ["hall", "2.4 s"]];
  function returnHtml(bus) {
    var M = K(), b = M.S.buses[bus], key = bus === "reverb" ? "~room" : "~delay";
    var mid = bus === "reverb"
      ? '<div class="mc-chips" role="group" aria-label="' + esc(tr("Room")) + '">' + PRESETS.map(function (p) {
          return '<button type="button" class="mc-chip' + (b.preset === p[0] ? " is-on" : "") + '" data-act="preset" data-v="' + p[0] + '" aria-pressed="' + (b.preset === p[0]) + '" data-tip="' + esc(tr("Its decay to −60 dB") + ": " + p[1]) + '">' + esc(tr(p[0])) + "</button>"; }).join("") + "</div>"
      : '<div class="mc-row">' + knob("b", "", "delay.time_ms", { small: true }) + "</div>" +
        '<div class="mc-row">' + knob("b", "", "delay.feedback", { small: true }) + knob("b", "", "delay.lowpass_hz", { small: true }) + "</div>";
    return '<div class="mc-strip mc-ret" data-bus="' + bus + '" data-n="' + key + '">' +
      '<button type="button" class="mc-name" data-act="select" data-tip="' + esc(tr(bus === "reverb" ? "The room: Plenio's convolution, the impulse the mix on Forge uses" : "The delay: Plenio's echoes, each through a low-pass")) + '">' + esc(tr(bus === "reverb" ? "Room" : "Delay")) + "</button>" +
      '<div class="mc-ins mc-ret-mid">' + mid + "</div>" +
      '<div class="mc-btns"><button type="button" class="mx-ms' + (b.mute ? " is-on" : "") + '" data-act="bmute" aria-pressed="' + b.mute + '" data-tip="' + esc(tr("Mute the return")) + '">M</button></div>' +
      fader("b", "", bus + ".return_db", -60, 6, key) +
      '<div class="mc-read"><output class="mc-db mono">' + esc(fdb(b.return_db)) + '</output><button type="button" class="mc-pk mono" data-act="peaks" data-meter-max="' + key + '">−∞</button></div></div>';
  }
  function masterHtml() {
    var M = K();
    var ms = M.strip("*"), eqOn = ms.eq && ms.eq.on && ms.eq.bands.some(function (b) { return b.enabled !== false; });
    return '<div class="mc-strip mc-master" data-n="*">' +
      '<button type="button" class="mc-name" data-act="select" data-tip="' + esc(tr("The master: everything heard, as the mix on Forge will be before its peak is kept under −0.3 dBFS")) + '">' + esc(tr("Master")) + "</button>" +
      '<div class="mc-ins mc-mins">' +                 // HERESY 1544: its chain
        '<button type="button" class="mc-slot' + (eqOn ? " is-on" : "") + '" data-act="eq" data-tip="' + esc(tr("The master's EQ: up to eight bands, before its compressor")) + '"><span>EQ</span><canvas class="mc-eqmini" width="60" height="18"></canvas></button>' +
        '<button type="button" class="mc-slot' + (ms.comp && ms.comp.on ? " is-on" : "") + '" data-act="comp" data-tip="' + esc(tr("The master's compressor: its reduction as it plays")) + '"><span>' + esc(tr("Comp")) + '</span><span class="mc-gr"><i></i></span></button>' +
        '<button type="button" class="mc-slot' + (ms.limit && ms.limit.on ? " is-on" : "") + '" data-act="lim" data-tip="' + esc(tr("The master's limiter, last before the fader: its reduction as it plays")) + '"><span>' + esc(tr("Lim")) + '</span><span class="mc-gr mc-lgr"><i></i></span></button>' +
      "</div>" +
      '<div class="mc-loud" data-tip="' + esc(tr("Loudness by BS.1770 as it plays: momentary (0.4 s), short-term (3 s), integrated since play was pressed; the true peak 4× interpolated; the sides' correlation (+1 mono, 0 wide, −1 out of phase)")) + '">' +
        '<div><span>M</span><output class="mono" data-loud="m">—</output></div><div><span>S</span><output class="mono" data-loud="s">—</output></div>' +
        '<div><span>I</span><output class="mono" data-loud="i">—</output></div><div><span>TP</span><output class="mono" data-loud="tp">—</output></div>' +
        '<div class="mc-corr" aria-hidden="true"><i></i></div><span class="mc-corr-lab"><span>−1</span><span>0</span><span>+1</span></span>' +
        '<button type="button" class="btn ghost small" data-act="loudreset" data-tip="' + esc(tr("Clear the loudness, the true peak and every peak held")) + '">' + icon("refresh", "↺") + "</button></div>" +
      '<div class="mc-btns mc-mon" role="group" aria-label="' + esc(tr("Monitor")) + '">' + [["mono", "Mono", "Listen in mono, never in the mix: the two sides summed, as one speaker hears it"], ["dim", "Dim", "Listen 20 dB lower, never in the mix"]].map(function (x) {   // HERESY 1536
        var on = !!M.monitor()[x[0]]; return '<button type="button" class="mx-ms mc-monb' + (on ? " is-on" : "") + '" data-act="mon" data-v="' + x[0] + '" aria-pressed="' + on + '" data-tip="' + esc(tr(x[2])) + '">' + esc(tr(x[1])) + "</button>"; }).join("") + "</div>" +
      fader("b", "", "master.gain_db", -24, 12, "*") +
      '<div class="mc-read"><output class="mc-db mono">' + esc(fdb(M.S.buses.master.gain_db)) + '</output><button type="button" class="mc-pk mono" data-act="peaks" data-meter-max="*">−∞</button></div></div>';
  }
  function paint() {
    var dock = $("mxDock"), M = K();
    if (!dock || !M || !M.info()) return;
    var panel = $("dawPanel");
    if (panel) panel.classList.toggle("has-dock", !dock.hidden);
    if (dock.hidden) return;
    var ns = M.names();
    if (C.sel && C.sel !== "*" && C.sel !== "~room" && C.sel !== "~delay" && ns.indexOf(C.sel) < 0 && !grp(C.sel) && !subOf2(C.sel)) C.sel = "";   // 1543: a VCA; 1563: a bus
    var tabs = '<div class="mc-tabs" role="tablist">' +
      '<button type="button" role="tab" class="mc-tab' + (C.tab === "mixer" ? " is-on" : "") + '" aria-selected="' + (C.tab === "mixer") + '" data-act="tab" data-v="mixer">' + esc(tr("Console")) + "</button>" +
      '<button type="button" role="tab" class="mc-tab' + (C.tab === "devices" ? " is-on" : "") + '" aria-selected="' + (C.tab === "devices") + '" data-act="tab" data-v="devices"' + (C.sel ? "" : " disabled") + ">" +
        esc(tr("Devices")) + (C.sel ? ' · <b translate="no">' + esc(selTitle()) + "</b>" : "") + "</button>" +
      '<button type="button" role="tab" class="mc-tab' + (C.tab === "mixes" ? " is-on" : "") + '" aria-selected="' + (C.tab === "mixes") + '" data-act="tab" data-v="mixes">' +   // HERESY 1533
        esc(tr("Mixes")) + (M.mixes.list().length ? " \u00b7 " + M.mixes.list().length : "") + "</button>" +
      '<span class="row-hint mc-how">' + esc(tr("Knobs: drag up and down, Shift finer, a double-click back to where it was")) + "</span></div>";
    var body = C.tab === "mixes" ? mixesHtml() : C.tab === "devices" && C.sel ? devicesHtml(C.sel)
      : '<div class="mc" role="group" aria-label="' + esc(tr("Console")) + '">' + ns.map(stripHtml).join("") + '<span class="mc-gap"></span>' +
        M.groups().map(vcaHtml).join("") +             // HERESY 1543: the VCAs, then the way to add one
        '<button type="button" class="mc-addvca" data-act="addvca"' + (M.groups().length >= 16 ? " disabled" : "") + ' data-tip="' + esc(tr("A VCA: one fader over a group of strips (the strip picked its first member)")) + '">+ VCA</button>' +
        M.subs().map(busHtml).join("") +              // HERESY 1563: the audio buses, then the way to add one
        '<button type="button" class="mc-addvca mc-addbus" data-act="addbus"' + (M.subs().length >= 8 ? " disabled" : "") + ' data-tip="' + esc(tr("An audio bus: the strips you choose summed and run through one chain of their own (the strip picked its first member)")) + '">+ ' + esc(tr("Bus")) + "</button>" +
        '<span class="mc-gap"></span>' + returnHtml("reverb") + returnHtml("delay") + masterHtml() + "</div>";
    dock.innerHTML = tabs + body;
    if (panel) panel.style.setProperty("--mx-dock-h", dock.offsetHeight + "px");   // full screen: the lanes share what is left above it
    ns.forEach(eqMini); eqMini("*");                   // HERESY 1544
    M.subs().forEach(function (x) { eqMini("%" + x.id); });   // HERESY 1563
    if (C.tab === "devices" && C.sel) { drawEq(); drawComp(); }
    frame(true);
  }
  // HERESY 1533: the mixes of this set, kept on Forge beside its stems
  function when(ms) { var d = new Date(ms), z = function (n) { return (n < 10 ? "0" : "") + n; }; return z(d.getDate()) + "." + z(d.getMonth() + 1) + " " + z(d.getHours()) + ":" + z(d.getMinutes()); }
  function mixesHtml() {
    var M = K(), list = M.mixes.list().slice().reverse(), lab = M.mixes.lab();
    var kept = lab.broken ? '<p class="row-hint mm-kept is-bad">' + esc(tr("The mixes file of this set could not be read: it is set aside, as it was, when the next mix is kept")) + "</p>"
      : lab.err ? '<p class="row-hint mm-kept is-bad">' + esc(tr("Not kept on Forge")) + ": " + esc(lab.err) + "</p>"
      : lab.saved ? '<p class="row-hint mm-kept">' + esc(tr("Kept on Forge as you set it")) + " \u00b7 " + esc(when(lab.saved)) + "</p>" : "";
    return '<div class="mm"><p class="row-hint">' + esc(tr("The mixes of this set, kept on Forge beside its stems: the one you are setting follows you to any browser; the named ones come back with a click (and Undo)")) + "</p>" +
      '<div class="mm-save"><input type="text" class="mm-name" maxlength="80" placeholder="' + esc(tr("A name for this mix")) + '" aria-label="' + esc(tr("A name for this mix")) + '" />' +
      '<button type="button" class="btn primary small" data-act="msave">' + esc(tr("Save as")) + "</button></div>" + kept +
      (list.length ? '<div class="mm-list">' + list.map(function (x) {
        return '<div class="mm-row"><button type="button" class="mc-chip" data-act="mload" data-v="' + esc(x.name) + '" translate="no">' + esc(x.name) + '</button><span class="mono row-hint">' + esc(when((x.saved || 0) * 1000)) + "</span>" +
          '<button type="button" class="mx-ms" data-act="mdel" data-v="' + esc(x.name) + '" aria-label="' + esc(tr("Delete")) + '" data-tip="' + esc(tr("Delete")) + '">\u2715</button></div>'; }).join("") + "</div>"
        : '<p class="row-hint">' + esc(tr("No mixes kept by name yet: name the one you hear and save it")) + "</p>") + "</div>";
  }
  function selTitle() { var M = K(), gx = grp(C.sel), bx = subOf2(C.sel); if (bx) return bx.name; return gx ? gx.name : C.sel === "*" ? tr("Master") : C.sel === "~room" ? tr("Room") : C.sel === "~delay" ? tr("Delay") : M.title(C.sel); }

  // ---- the devices of the strip picked
  var TYPES = [["peak", "Bell"], ["low_shelf", "Low shelf"], ["high_shelf", "High shelf"], ["highpass", "Low cut"], ["lowpass", "High cut"], ["notch", "Notch"]];
  var COMP_PRESETS = [["Gentle", { threshold_db: -18, ratio: 2, attack_ms: 20, release_ms: 200, knee_db: 6, makeup_db: 1 }],
                      ["Voice", { threshold_db: -24, ratio: 3, attack_ms: 8, release_ms: 120, knee_db: 6, makeup_db: 3 }],
                      ["Punch", { threshold_db: -20, ratio: 4, attack_ms: 30, release_ms: 100, knee_db: 3, makeup_db: 2 }],
                      ["Glue", { threshold_db: -14, ratio: 1.5, attack_ms: 30, release_ms: 300, knee_db: 10, makeup_db: 0.5 }],
                      ["Squash", { threshold_db: -32, ratio: 8, attack_ms: 2, release_ms: 80, knee_db: 0, makeup_db: 8 }]];
  function card(cls, title, on, body, act) {
    return '<section class="dv-card ' + cls + '"><header>' + (act ? '<button type="button" class="mc-power' + (on ? " is-on" : "") + '" data-act="' + act + '" aria-pressed="' + !!on + '" data-tip="' + esc(tr("On and off: heard at once")) + '">' + POWER + "</button>" : "") +
      "<b>" + esc(title) + "</b></header>" + body + "</section>";
  }
  var POWER = '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M8 2v6M4.6 4.2a5 5 0 1 0 6.8 0" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
  // HERESY 1561: inserts: a strip's version through a processor on Forge, the result its new version; the master printed through the gateway
  var CHARS = [["tape", "Tape"], ["console", "Console"], ["tube", "Tube"], ["transformer", "Transformer"], ["vinyl", "Vinyl"]];
  var INS = { plugins: null, run: {}, timer: 0 };
  function insPlugins() {
    if (INS.plugins || !window.fetch) return;
    INS.plugins = [];
    fetch("/lab/plugins", { priority: "low" }).then(function (r) { return r.ok ? r.json() : { plugins: [] }; }).then(function (d) {
      var out = [];
      (d.plugins || []).forEach(function (pl) { (pl.steps || []).forEach(function (st) {
        if (st.input === "file" && !(pl.builtin && (st.id === "report" || st.id === "match"))) out.push({ pid: pl.id, sid: st.id, label: st.label, builtin: !!pl.builtin });
      }); });
      INS.plugins = out;
      if (out.length) paint();
    }).catch(function () { /* no lab: the gateway alone */ });
  }
  function insSay(n) {
    var r = INS.run[n];
    if (!r) return "";
    var el = Math.round((Date.now() - r.t0) / 1000), clock = el >= 60 ? Math.floor(el / 60) + ":" + ("0" + (el % 60)).slice(-2) : el + " s";
    return r.err ? "\u2715 " + r.label + ": " + r.err : r.done ? "\u2713 " + r.label + ": " + tr("the strip plays it") : r.label + "\u2026 " + clock;
  }
  function insHtml(n) {
    insPlugins();
    var r = INS.run[n], busy = !!(r && !r.done);
    return '<div class="dv-sub" data-tip="' + esc(tr("Insert: the strip's version as it plays, through a processor on Forge; what comes back is the strip's new version, heard as it will be rendered. Its versions keep the way back")) + '">' + esc(tr("Insert")) + "</div>" +
      '<div class="mc-chips dv-ins" role="group" aria-label="' + esc(tr("Digital Gateway")) + '"><span class="dv-ins-k">' + esc(tr("Digital Gateway")) + "</span>" + CHARS.map(function (c) {
        return '<button type="button" class="mc-chip" data-act="insgate" data-v="' + c[0] + '"' + (busy ? " disabled" : "") + ">" + esc(tr(c[1])) + "</button>"; }).join("") + "</div>" +
      ((INS.plugins || []).length ? '<div class="mc-chips dv-ins" role="group">' + INS.plugins.map(function (p) {
        return '<button type="button" class="mc-chip" data-act="insplug" data-v="' + esc(p.pid + "|" + p.sid) + '"' + (p.builtin ? "" : ' translate="no"') + (busy ? " disabled" : "") + ">" + esc(p.label) + "</button>"; }).join("") + "</div>" : "") +
      '<p class="row-hint dv-ins-say" data-ins="' + esc(n) + '"' + (r && r.err ? ' style="color:var(--bad,#c33)"' : "") + ">" + esc(insSay(n)) + "</p>";
  }
  function insTick() {
    clearTimeout(INS.timer);
    var any = false;
    Object.keys(INS.run).forEach(function (n) {
      var el = document.querySelector('#mxDock .dv-ins-say[data-ins="' + n + '"]');
      if (el) el.textContent = insSay(n);
      if (!INS.run[n].done) any = true;
    });
    if (any) INS.timer = setTimeout(insTick, 1000);
  }
  function runInsert(n, act, v) {
    var M = K(), take = M && M.S.take, src = M && M.versionOf(n);
    if (!take || !src || (INS.run[n] && !INS.run[n].done)) return;
    var url, body, label;
    if (act === "insgate") {
      url = "/lab/gate"; body = { name: take.name, source: src, params: { character: v } };
      label = tr("Digital Gateway") + " \u00b7 " + tr((CHARS.filter(function (c) { return c[0] === v; })[0] || [v, v])[1]);
    } else {
      var pp = v.split("|"), pl = (INS.plugins || []).filter(function (x) { return x.pid === pp[0] && x.sid === pp[1]; })[0];
      url = "/lab/plugin/run"; body = { name: take.name, source: src, plugin: pp[0], step: pp[1], params: {} };
      label = pl ? (pl.builtin ? tr(pl.label) : pl.label) : pp[1];
    }
    var run = INS.run[n] = { label: label, t0: Date.now(), id: "", err: "", done: false };
    paint(); insTick();
    fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (b) { if (!r.ok) throw new Error(b.error || r.status); return b; }); })
      .then(function (job) { run.id = job.id; insWatch(n, take.name, run); if (window.HeresyDerived) window.HeresyDerived.refresh(); })
      .catch(function (e) { run.err = e.message || String(e); run.done = true; paint(); });
  }
  function insWatch(n, name, run) {
    fetch("/lab/derived?name=" + encodeURIComponent(name), { priority: "low" }).then(function (r) { return r.json(); }).then(function (d) {
      var job = (d.running || []).filter(function (j) { return j.id === run.id; })[0], man = (d.derived || []).filter(function (m) { return m.id === run.id; })[0];
      if (job && job.status === "failed") { run.err = job.error || "failed"; run.done = true; paint(); return; }
      if (!man) { setTimeout(function () { insWatch(n, name, run); }, 2000); return; }
      var f = (man.files || []).filter(function (x) { return x.kind !== "text" && x.kind !== "image" && /\.(flac|wav)$/i.test(x.path || x.file || ""); })[0];
      var path = f ? f.path || "derived/" + man.id + "/" + f.file : "";
      var M = K();
      if (window.HeresyDerived) window.HeresyDerived.refresh();
      M.refresh().then(function () {
        var st = (M.info().strips || []).filter(function (x) { return x.name === n; })[0];
        if (path && st && st.versions.some(function (x) { return x.path === path; })) { M.setVersion(n, path); run.done = true; }
        else { run.err = tr("it came back, but not as a version of this stem (another length or rate)"); run.done = true; }
        paint();
      });
    }).catch(function () { setTimeout(function () { insWatch(n, name, run); }, 4000); });
  }
  function printHtml() {
    return '<p class="row-hint">' + esc(tr("The mix as the DAW holds it (its versions, every knob) through the Digital Gateway on Forge: a branch in the tree, beside the DAW's own mixes")) + "</p>" +
      '<div class="mc-chips dv-ins" role="group">' + CHARS.map(function (c) { return '<button type="button" class="mc-chip" data-act="mprint" data-v="' + c[0] + '">' + esc(tr(c[1])) + "</button>"; }).join("") + "</div>" +
      '<p class="row-hint dv-print-say"></p>';
  }
  function runPrint(v) {
    var M = K(), take = M && M.S.take, say = document.querySelector("#mxDock .dv-print-say");
    if (!take || !M.S.set) return;
    var body = { name: take.name, pipeline: [{ step: "stems", set: M.S.set }, { step: "daw", mix: window.HeresyMixer.value(), versions: Object.assign({}, M.S.versions || {}) },
                                              { step: "gate", params: { character: v } }] };
    Object.keys(body.pipeline[1].versions).forEach(function (k2) { if (!/^derived\//.test(body.pipeline[1].versions[k2])) delete body.pipeline[1].versions[k2]; });
    fetch("/lab/chain", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (b) { if (!r.ok) throw new Error(b.error || r.status); return b; }); })
      .then(function () { if (say) say.textContent = tr("Started: the mix through the Digital Gateway; it lands in the tree"); },
            function (e) { if (say) say.textContent = "\u2715 " + (e.message || e); });
  }
  function devicesHtml(n) {
    var M = K();
    var chooser = '<div class="dv-strips mc-chips" role="group" aria-label="' + esc(tr("Strip")) + '">' + M.names().concat(M.groups().map(function (x) { return "@" + x.id; }), M.subs().map(function (x) { return "%" + x.id; }), ["~room", "~delay", "*"]).map(function (x) {
      var gx = grp(x), bx2 = subOf2(x), t = bx2 ? bx2.name : gx ? gx.name : x === "*" ? tr("Master") : x === "~room" ? tr("Room") : x === "~delay" ? tr("Delay") : M.title(x);   // 1543: the VCAs; 1563: the buses
      return '<button type="button" class="mc-chip' + (x === n ? " is-on" : "") + '" data-act="pick" data-v="' + esc(x) + '" aria-pressed="' + (x === n) + '" translate="no" style="--mc-hue:' + (x.charAt(0) === "~" || x.charAt(0) === "%" || x === "*" ? "var(--dim)" : M.hue(x)) + '">' + esc(t) + "</button>"; }).join("") + "</div>";
    var mcard = n !== "*" ? "" : '<div class="dv-row">' + card("dv-master", tr("Master"), true, '<div class="dv-mrow"><div class="dv-loud">' + masterHtml().replace(/^<div class="mc-strip mc-master" data-n="\*">/, "").replace(/<\/div>$/, "") + "</div>" +
      '<canvas class="dv-spec" data-spec="*" width="640" height="220"></canvas>' +
      '<canvas class="dv-gonio" width="220" height="220" data-tip="' + esc(tr("The two sides as a picture: mid up, side across; a line up is mono, a wide cloud wide, a line across out of phase")) + '"></canvas></div>') + "</div>";   // HERESY 1538; 1544: under its chain
    var gv = grp(n);
    if (gv) {                                          // HERESY 1543: a VCA's devices: its name, its members, away
      return chooser + '<div class="dv-row" data-n="' + esc(n) + '">' + card("dv-vcac", "VCA", true,
        '<label class="dv-vname"><span class="dv-sub">' + esc(tr("Name")) + '</span><input type="text" class="dv-vcaname" maxlength="40" value="' + esc(gv.name) + '" aria-label="' + esc(tr("Name")) + '" /></label>' +
        '<div class="dv-sub">' + esc(tr("Members")) + '</div><div class="mc-chips" role="group" aria-label="' + esc(tr("Members")) + '">' + M.names().map(function (y) {
          var on = gv.members.indexOf(y) >= 0;
          return '<button type="button" class="mc-chip' + (on ? " is-on" : "") + '" data-act="gmember" data-v="' + esc(y) + '" aria-pressed="' + on + '" translate="no" style="--mc-hue:' + M.hue(y) + '">' + esc(M.title(y)) + "</button>"; }).join("") + "</div>" +
        '<p class="row-hint">' + esc(tr("Its fader adds its dB to each member's own (theirs stay where they are); M mutes them, S solos them; a strip may be in more than one, their dB add")) + "</p>" +
        '<div class="dv-actions"><button type="button" class="btn ghost small" data-act="gdel">' + esc(tr("Delete")) + "</button></div>") + "</div>";
    }
    if (n === "~room" || n === "~delay") {
      var bus = n === "~room" ? "reverb" : "delay", b = M.S.buses[bus];
      var body = bus === "reverb"
        ? '<div class="mc-chips" role="group">' + PRESETS.map(function (p) { return '<button type="button" class="mc-chip' + (b.preset === p[0] ? " is-on" : "") + '" data-act="preset" data-v="' + p[0] + '" aria-pressed="' + (b.preset === p[0]) + '">' + esc(tr(p[0])) + " · " + p[1] + "</button>"; }).join("") + "</div>" +
          '<div class="dv-knobs">' + knob("b", "", "reverb.return_db") + "</div>"
        : '<div class="mc-chips" role="group" aria-label="' + esc(tr("Time")) + '">' + [125, 250, 375, 500, 750, 1000].map(function (t) {
            return '<button type="button" class="mc-chip' + (Math.abs(b.time_ms - t) < 0.5 ? " is-on" : "") + '" data-act="dtime" data-v="' + t + '">' + t + " ms</button>"; }).join("") + "</div>" +
          '<div class="dv-tempo"><label>' + esc(tr("At a tempo")) + ' <input type="number" class="dv-bpm" min="20" max="400" step="1" value="' + (C.bpm || 120) + '" aria-label="BPM" /> BPM</label>' +
          '<span class="mc-chips">' + [["1/4", 1], ["1/8", 0.5], ["1/8.", 0.75], ["1/8t", 1 / 3], ["1/16", 0.25]].map(function (nv) {
            return '<button type="button" class="mc-chip" data-act="dnote" data-v="' + nv[1] + '">' + nv[0] + "</button>"; }).join("") + "</span></div>" +
          '<div class="dv-knobs">' + knob("b", "", "delay.time_ms") + knob("b", "", "delay.feedback") + knob("b", "", "delay.lowpass_hz") + knob("b", "", "delay.return_db") + "</div>";
      return chooser + '<div class="dv-row">' + card("dv-bus", tr(bus === "reverb" ? "Room" : "Delay"), !b.mute, body, "bmute-dev") + "</div>";
    }
    var s = M.strip(n), st = (M.info().strips || []).filter(function (x) { return x.name === n; })[0], cur = n === "*" || n.charAt(0) === "%" ? "" : M.versionOf(n);   // 1544: the master has no versions (1563: nor a bus)
    var input = '<div class="dv-knobs">' + knob("s", n, "trim_db") + '<button type="button" class="mx-ms dv-inv' + (s.invert ? " is-on" : "") + '" data-act="invert" aria-pressed="' + s.invert + '" data-tip="' + esc(tr("Polarity: the strip upside down")) + '">Ø</button></div>' +
      (st ? '<div class="dv-sub">' + esc(tr("Version")) + '</div><div class="mc-chips dv-vers" role="group">' + st.versions.map(function (v) {
        return '<button type="button" class="mc-chip' + (v.path === cur ? " is-on" : "") + '" data-act="version" data-v="' + esc(v.path) + '" aria-pressed="' + (v.path === cur) + '" translate="no">' + esc(v.id ? v.label + (v.created ? " · " + v.created.slice(11) : "") : tr("as split")) + "</button>"; }).join("") + "</div>"
          : '<p class="row-hint">' + esc(tr("the source less the stems")) + "</p>");
    if (st) input += insHtml(n);                       // HERESY 1561
    var bands = s.eq ? s.eq.bands : [], sel = bands.filter(function (b) { return String(b.id) === String(C.band); })[0];
    if (!sel && bands.length) { C.band = String(bands[0].id); sel = bands[0]; }
    var eq = '<div class="dv-eqbar"><span class="mc-chips">' + bands.map(function (b, i) {
        return '<button type="button" class="mc-chip dv-band' + (String(b.id) === String(C.band) ? " is-on" : "") + (b.enabled === false ? " is-off" : "") + '" data-act="band" data-v="' + esc(b.id) + '" style="--band:' + BAND_HUES[i % 8] + '">' + (i + 1) + "</button>"; }).join("") + "</span>" +
        '<button type="button" class="btn ghost small" data-act="addband"' + (bands.length >= 8 ? " disabled" : "") + ">+ " + esc(tr("Band")) + "</button>" +
        '<button type="button" class="btn ghost small" data-act="flat"' + (bands.length ? "" : " disabled") + ">" + esc(tr("Flat")) + "</button></div>" +
      '<canvas class="dv-eq" width="640" height="230" data-tip="' + esc(tr("Double-click to add a band there; drag a band's point (Shift finer); the wheel over it sets its width; a right-click takes it away. Behind the curve: the strip's own sound as it plays")) + '"></canvas>' +
      (sel ? '<div class="dv-bandrow"><span class="mc-chips" role="group" aria-label="' + esc(tr("Shape")) + '">' + TYPES.map(function (t) {
          return '<button type="button" class="mc-chip' + (sel.type === t[0] ? " is-on" : "") + '" data-act="btype" data-v="' + t[0] + '" aria-pressed="' + (sel.type === t[0]) + '">' + esc(tr(t[1])) + "</button>"; }).join("") + "</span>" +
        '<span class="dv-knobs">' + knob("e", n, "band.frequency_hz", { small: true }) + (GAIN_TYPES[sel.type] ? knob("e", n, "band.gain_db", { small: true }) : "") +
          (sel.type.indexOf("shelf") < 0 ? knob("e", n, "band.q", { small: true }) : "") + "</span>" +
        '<button type="button" class="mx-ms' + (sel.enabled !== false ? " is-on" : "") + '" data-act="benable" aria-pressed="' + (sel.enabled !== false) + '" data-tip="' + esc(tr("This band on and off")) + '">' + POWER + "</button>" +
        '<button type="button" class="btn ghost small" data-act="bdel">' + esc(tr("Remove")) + "</button></div>"
        : '<p class="row-hint">' + esc(tr("No bands yet: double-click the curve where it should change, or + Band")) + "</p>");
    var c = s.comp || {};
    var others = M.names().filter(function (x) { return x !== n; }), key = (s.comp && s.comp.key) || "";   // HERESY 1537: the key
    var comp = '<div class="mc-chips dv-presets" role="group" aria-label="' + esc(tr("Starting points")) + '">' + COMP_PRESETS.map(function (pr) {
        return '<button type="button" class="mc-chip" data-act="cpreset" data-v="' + pr[0] + '">' + esc(tr(pr[0])) + "</button>"; }).join("") +
        (n !== "lead_vocal" && n !== "*" && n.charAt(0) !== "%" && M.names().indexOf("lead_vocal") >= 0 ? '<button type="button" class="mc-chip" data-act="cpreset" data-v="Duck" data-tip="' + esc(tr("Duck: this strip under the voice, its compressor listening to the lead vocal")) + '">' + esc(tr("Duck")) + "</button>" : "") + "</div>" +
      (n === "*" || n.charAt(0) === "%" ? "" : '<div class="dv-key"><span class="dv-sub" data-tip="' + esc(tr("Key: what the compressor listens to: its own strip, or another as it enters its own compressor (the band ducked under the voice)")) + '">' + esc(tr("Listens to")) + "</span>" +   // 1544: the master listens to itself
        '<span class="mc-chips" role="group" aria-label="' + esc(tr("Listens to")) + '">' + [""].concat(others).map(function (x) {
          return '<button type="button" class="mc-chip' + (x === key ? " is-on" : "") + '" data-act="ckey" data-v="' + esc(x) + '" aria-pressed="' + (x === key) + '" translate="no">' + esc(x ? M.title(x) : tr("own")) + "</button>"; }).join("") + "</span></div>") +
      '<div class="dv-comp"><canvas class="dv-curve" width="170" height="170" data-tip="' + esc(tr("In and out: the line bends at the threshold by the ratio, softly over the knee")) + '"></canvas>' +
        '<div class="dv-grm" data-tip="' + esc(tr("The reduction as it plays")) + '"><i></i><span class="mono">0.0</span></div>' +
        '<div class="dv-knobs dv-knobs-2">' + ["comp.threshold_db", "comp.ratio", "comp.attack_ms", "comp.release_ms", "comp.knee_db", "comp.makeup_db"].map(function (k) { return knob("s", n, k); }).join("") + "</div></div>";
    var out = '<div class="dv-knobs">' + knob("s", n, "width") + knob("s", n, "pan") + knob("s", n, "reverb") + knob("s", n, "delay") + "</div>" +
      '<p class="row-hint dv-out-say">' + esc(tr("Then the fader, mute and solo; the sends leave after the pan")) + "</p>";
    var bx = subOf2(n);                               // HERESY 1563: a bus: its members, EQ, compressor, output
    if (bx) {
      var mem = '<div class="mc-chips" role="group" aria-label="' + esc(tr("Members")) + '">' + M.names().map(function (y) {
          var on = bx.members.indexOf(y) >= 0, other = !on && M.subOfStrip(y);
          return '<button type="button" class="mc-chip' + (on ? " is-on" : "") + '" data-act="smember" data-v="' + esc(y) + '" aria-pressed="' + on + '" translate="no"' +
            (other ? ' data-tip="' + esc(tr("In {0} now: a click moves it here").replace("{0}", other.name)) + '"' : "") + ">" + esc(M.title(y)) + (other ? " \u2192" : "") + "</button>"; }).join("") + "</div>" +
        '<label class="dv-vname"><span class="dv-sub">' + esc(tr("Name")) + '</span><input type="text" class="dv-busname" maxlength="40" value="' + esc(bx.name) + '" aria-label="' + esc(tr("Name")) + '" /></label>' +
        '<p class="row-hint"><button type="button" class="btn ghost small" data-act="sdel">' + esc(tr("Remove the bus")) + "</button> " + esc(tr("its members go back to the master as they are")) + "</p>";
      var bout = '<div class="dv-knobs">' + knob("s", n, "width") + knob("s", n, "pan") + "</div>" +
        '<p class="row-hint dv-out-say">' + esc(tr("Then its fader and mute, into the master; its members' sends leave from their own strips")) + "</p>";
      return chooser + '<div class="dv-row" data-n="' + esc(n) + '">' + card("dv-input", tr("Members"), true, mem) + card("dv-eqc", "EQ", s.eq ? s.eq.on : false, eq, "eqon") +
        card("dv-compc", tr("Compressor"), !!(s.comp && s.comp.on), comp, "compon") + card("dv-outc", tr("Output"), true, bout) + "</div>";
    }
    if (n === "*") {                                   // HERESY 1544: the master's chain, then its meters
      var lm = s.limit || {};
      var lim = '<div class="dv-comp dv-lim"><div class="dv-grm dv-lgrm" data-tip="' + esc(tr("The limiter's reduction as it plays")) + '"><i></i><span class="mono">0.0</span></div>' +
        '<div class="dv-knobs">' + ["limit.ceiling_db", "limit.drive_db", "limit.release_ms"].map(function (k) { return knob("s", n, k); }).join("") + "</div></div>" +
        '<p class="row-hint">' + esc(tr("Plenio's limiter, as on Forge: 4× oversampled, 3 ms ahead, both sides together; the true peak held at the ceiling")) + "</p>";
      return chooser + '<div class="dv-row" data-n="*">' + card("dv-eqc", "EQ", s.eq ? s.eq.on : false, eq, "eqon") + card("dv-compc", tr("Compressor"), !!(s.comp && s.comp.on), comp, "compon") +
        card("dv-limc", tr("Limiter"), !!lm.on, lim, "limon") + card("dv-printc", tr("Print"), true, printHtml()) + "</div>" + mcard;   // 1561: Print
    }
    return chooser + '<div class="dv-row" data-n="' + esc(n) + '">' + card("dv-input", tr("Input"), true, input) + card("dv-eqc", "EQ", s.eq ? s.eq.on : false, eq, "eqon") +
      card("dv-compc", tr("Compressor"), !!(s.comp && s.comp.on), comp, "compon") + card("dv-outc", tr("Output"), true, out) + "</div>";
  }
  var GAIN_TYPES = { peak: 1, low_shelf: 1, high_shelf: 1 };
  var BAND_HUES = ["#e0a030", "#d0613f", "#9b6ad6", "#4f9a4a", "#3f8fd2", "#2fa69a", "#c84f8f", "#b0b040"];

  // ---- the EQ's response, as the render designs it (Plenio's RBJ bands, a shelf's slope 1): the same numbers, drawn
  function coefs(b, rate) {
    var w = 2 * Math.PI * +b.frequency_hz / rate, c = Math.cos(w), s = Math.sin(w), a = Math.pow(10, (+b.gain_db || 0) / 40), alpha = s / (2 * +b.q), num, den = [1 + alpha, -2 * c, 1 - alpha];
    if (b.type === "peak") { num = [1 + alpha * a, -2 * c, 1 - alpha * a]; den = [1 + alpha / a, -2 * c, 1 - alpha / a]; }
    else if (b.type === "lowpass") num = [(1 - c) / 2, 1 - c, (1 - c) / 2];
    else if (b.type === "highpass") num = [(1 + c) / 2, -(1 + c), (1 + c) / 2];
    else if (b.type === "notch") num = [1, -2 * c, 1];
    else {
      alpha = s / 2 * Math.sqrt(2);
      var v = 2 * Math.sqrt(a) * alpha;
      if (b.type === "low_shelf") { num = [a * ((a + 1) - (a - 1) * c + v), 2 * a * ((a - 1) - (a + 1) * c), a * ((a + 1) - (a - 1) * c - v)]; den = [(a + 1) + (a - 1) * c + v, -2 * ((a - 1) + (a + 1) * c), (a + 1) + (a - 1) * c - v]; }
      else { num = [a * ((a + 1) + (a - 1) * c + v), -2 * a * ((a - 1) + (a + 1) * c), a * ((a + 1) + (a - 1) * c - v)]; den = [(a + 1) - (a - 1) * c + v, 2 * ((a - 1) - (a + 1) * c), (a + 1) - (a - 1) * c - v]; }
    }
    return [num[0] / den[0], num[1] / den[0], num[2] / den[0], den[1] / den[0], den[2] / den[0]];
  }
  function magDb(k, f, rate) {
    var w = 2 * Math.PI * f / rate, c1 = Math.cos(w), s1 = Math.sin(w), c2 = Math.cos(2 * w), s2 = Math.sin(2 * w);
    var nr = k[0] + k[1] * c1 + k[2] * c2, ni = -(k[1] * s1 + k[2] * s2), dr = 1 + k[3] * c1 + k[4] * c2, di = -(k[3] * s1 + k[4] * s2);
    return 10 * Math.log10((nr * nr + ni * ni) / (dr * dr + di * di) + 1e-30);
  }
  function response(n, f) {
    var s = K().strip(n), rate = (K().info() || {}).rate || 48000, d = 0;
    if (!s.eq || !s.eq.on) return 0;
    s.eq.bands.forEach(function (b) { if (b.enabled !== false) d += magDb(coefs(b, rate), f, rate); });
    return d;
  }
  var FMIN = 20, FMAX = 20000, DBR = 15;
  // HERESY 1536: a spectrum's scale floats: its own top (falling 0.25 dB a frame), 72 dB under it; tilted 4.5 dB an octave about 1 kHz
  var SPEC_TOP = {};
  function specCurve(key, bins, rate, w) {
    var pts = [], top = -300;
    for (var x = 0; x <= w; x += 2) {
      var f = xf(x, w), v = bins[Math.min(bins.length - 1, Math.round(f / (rate / 2) * bins.length))] + 4.5 * Math.log2(f / 1000);
      if (!isFinite(v)) v = -300;
      pts.push([x, v]); if (v > top) top = v;
    }
    var was = SPEC_TOP[key] == null ? top : SPEC_TOP[key], t = Math.max(top, was - 0.25);
    SPEC_TOP[key] = t;
    return { pts: pts, lo: t - 72, hi: t + 3 };
  }
  function fx(f, w) { return Math.log(f / FMIN) / Math.log(FMAX / FMIN) * w; }
  function xf(x, w) { return FMIN * Math.pow(FMAX / FMIN, clamp(x / w, 0, 1)); }
  function dy(d, h) { return h / 2 - d / DBR * (h / 2 - 6); }
  function yd(y, h) { return (h / 2 - y) / (h / 2 - 6) * DBR; }
  function css(el, name, d) { var v = getComputedStyle(el).getPropertyValue(name).trim(); return v || d; }
  function eqMini(n) {
    var c = document.querySelector('.mc-strip[data-n="' + CSS.escape(n) + '"] .mc-eqmini');
    if (!c) return;
    var g = c.getContext("2d"), w = c.width, h = c.height, s = K().strip(n);
    g.clearRect(0, 0, w, h);
    g.strokeStyle = css(c, "--dim", "#888"); g.globalAlpha = 0.5; g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke(); g.globalAlpha = 1;
    if (!s.eq || !s.eq.bands.length) return;
    g.strokeStyle = s.eq.on ? css(c, "--amber", "#d99d10") : css(c, "--dim", "#888"); g.lineWidth = 1.5; g.beginPath();
    for (var x = 0; x <= w; x += 2) { var y = h / 2 - response(n, xf(x, w)) / 12 * (h / 2 - 1); if (x) g.lineTo(x, clamp(y, 0, h)); else g.moveTo(x, clamp(y, 0, h)); }
    g.stroke();
  }
  function drawEq() {
    var c = document.querySelector("#mxDock canvas.dv-eq"), M = K();
    if (!c || !M) return;
    var n = C.sel, box = c.parentNode, w = Math.max(320, Math.min(900, box.clientWidth - 4)), h = 230, dpr = window.devicePixelRatio || 1;
    if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); c.style.width = w + "px"; c.style.height = h + "px"; }
    var g = c.getContext("2d"), ink = css(c, "--ink", "#ddd"), dim = css(c, "--dim", "#888"), amber = css(c, "--amber", "#d99d10"), rate = (M.info() || {}).rate || 48000;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    g.font = "10px " + (css(c, "--mono", "monospace")); g.textBaseline = "top";
    [50, 100, 200, 500, 1000, 2000, 5000, 10000].forEach(function (f) {
      var x = Math.round(fx(f, w)) + 0.5;
      g.fillStyle = dim; g.globalAlpha = 0.25; g.fillRect(x, 0, 1, h); g.globalAlpha = 0.8;
      g.fillText(f >= 1000 ? f / 1000 + "k" : String(f), x + 2, h - 12);
    });
    [12, 6, 0, -6, -12].forEach(function (d) {
      var y = Math.round(dy(d, h)) + 0.5;
      g.fillStyle = dim; g.globalAlpha = d === 0 ? 0.5 : 0.2; g.fillRect(0, y, w, 1); g.globalAlpha = 0.8;
      g.fillText((d > 0 ? "+" : "") + minus(d), 2, y + 1);
    });
    g.globalAlpha = 1;
    var an = M.analyser(n);                           // the strip's own sound after the EQ, as it plays
    if (an && M.S.playing) {
      var bins = new Float32Array(an.frequencyBinCount);
      an.getFloatFrequencyData(bins);
      g.beginPath(); g.moveTo(0, h);
      var sc = specCurve(n, bins, rate, w);            // HERESY 1536: on its own floating scale
      sc.pts.forEach(function (q) { g.lineTo(q[0], h - clamp((q[1] - sc.lo) / (sc.hi - sc.lo), 0, 1) * (h - 10)); });
      g.lineTo(w, h); g.closePath();
      g.fillStyle = css(c, "--mc-spec", "rgba(120,160,200,.22)"); g.fill();
    }
    var s = M.strip(n), bands = s.eq ? s.eq.bands : [];
    bands.forEach(function (b, i) {                    // each band's own shape, faint
      if (b.enabled === false || !(s.eq && s.eq.on)) return;
      var k = coefs(b, rate);
      g.beginPath();
      for (var x = 0; x <= w; x += 3) { var y = dy(magDb(k, xf(x, w), rate), h); if (x) g.lineTo(x, y); else g.moveTo(x, y); }
      g.strokeStyle = BAND_HUES[i % 8]; g.globalAlpha = 0.35; g.lineWidth = 1; g.stroke(); g.globalAlpha = 1;
    });
    g.beginPath();                                     // the whole of it
    for (var x2 = 0; x2 <= w; x2 += 1) { var y2 = dy(response(n, xf(x2, w)), h); if (x2) g.lineTo(x2, clamp(y2, -2, h + 2)); else g.moveTo(x2, clamp(y2, -2, h + 2)); }
    g.strokeStyle = s.eq && s.eq.on ? amber : dim; g.lineWidth = 2; g.stroke();
    bands.forEach(function (b, i) {
      var hx = fx(+b.frequency_hz, w), hy = dy(GAIN_TYPES[b.type] ? +b.gain_db || 0 : response(n, +b.frequency_hz), h), on = String(b.id) === String(C.band);
      g.beginPath(); g.arc(hx, clamp(hy, 7, h - 7), on ? 8 : 6.5, 0, Math.PI * 2);
      g.fillStyle = b.enabled === false ? dim : BAND_HUES[i % 8]; g.fill();
      if (on) { g.strokeStyle = ink; g.lineWidth = 2; g.stroke(); }
      g.fillStyle = "#111"; g.font = "bold 9px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(String(i + 1), hx, clamp(hy, 7, h - 7) + 0.5); g.textAlign = "start"; g.textBaseline = "top";
    });
  }
  function drawComp() {
    var c = document.querySelector("#mxDock canvas.dv-curve"), M = K();
    if (!c || !M) return;
    var n = C.sel, s = M.strip(n), p = Object.assign({ threshold_db: -18, ratio: 2, knee_db: 6, makeup_db: 0 }, s.comp || {}), w = 170, h = 170, dpr = window.devicePixelRatio || 1;
    if (c.width !== w * dpr) { c.width = w * dpr; c.height = h * dpr; c.style.width = w + "px"; c.style.height = h + "px"; }
    var g = c.getContext("2d"), dim = css(c, "--dim", "#888"), amber = css(c, "--amber", "#d99d10"), soft = window.RuachMixDsp ? window.RuachMixDsp.kernel.softKnee : function () { return 0; };
    var X = function (d) { return (d + 60) / 60 * (w - 1); }, Y = function (d) { return h - 1 - (d + 60) / 60 * (h - 1); };
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    g.strokeStyle = dim; g.globalAlpha = 0.3; g.strokeRect(0.5, 0.5, w - 1, h - 1);
    g.beginPath(); g.moveTo(X(-60), Y(-60)); g.lineTo(X(0), Y(0)); g.stroke(); g.globalAlpha = 0.6;
    g.setLineDash([3, 3]); g.beginPath(); g.moveTo(X(p.threshold_db), 0); g.lineTo(X(p.threshold_db), h); g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
    g.beginPath();
    for (var d = -60; d <= 0; d += 0.5) { var o = d + soft(d, p.threshold_db, p.ratio, p.knee_db) + p.makeup_db; if (d === -60) g.moveTo(X(d), Y(o)); else g.lineTo(X(d), Y(clamp(o, -60, 6))); }
    g.strokeStyle = s.comp && s.comp.on ? amber : dim; g.lineWidth = 2; g.stroke();
  }

  // ---- the meters, each frame
  function frame(force) {
    var M = K(), dock = $("mxDock");
    if (!M || !dock || dock.hidden) return;
    var now = performance.now();
    if (!force && now - C.lastFrame < 30) return;      // thirty a second is enough for the eye
    C.lastFrame = now;
    var lv = M.S.lv;
    Array.prototype.forEach.call(dock.querySelectorAll(".fd-meter[data-meter]"), function (el) {
      var key = el.dataset.meter, lo = +el.parentNode.dataset.lo, hi = +el.parentNode.dataset.hi, v = lv[key];
      if (!v) return;
      var p0 = M.taper(lo), p1 = M.taper(hi), sc = function (d) { return clamp((M.taper(d) - p0) / (p1 - p0), 0, 1); }, is = el.children;
      for (var c = 0; c < 2; c++) {                  // revealed from below, so the colours stay where the levels are
        is[2 * c].style.clipPath = "inset(" + (100 - sc(v.rms[c]) * 100).toFixed(1) + "% 0 0 0)";
        is[2 * c + 1].style.clipPath = "inset(" + (100 - sc(v.pk[c]) * 100).toFixed(1) + "% 0 0 0)";
        is[4 + c].style.bottom = (sc(v.hold[c]) * 100).toFixed(1) + "%";
        is[4 + c].classList.toggle("is-hot", v.hold[c] > -0.5);
      }
    });
    Array.prototype.forEach.call(dock.querySelectorAll("[data-meter-max]"), function (el) {
      var v = lv[el.dataset.meterMax];
      if (!v) return;
      el.textContent = v.max > -120 ? (v.max > 0 ? "+" : "") + minus(v.max.toFixed(1)) : "−∞";
      el.classList.toggle("is-hot", !!v.clip);
    });
    M.names().concat(M.subs().map(function (x) { return "%" + x.id; })).forEach(function (n) {   // 1563: the buses' too
      var v = lv[n], el = dock.querySelector('.mc-strip[data-n="' + CSS.escape(n) + '"] .mc-gr i');
      if (el && v) el.style.transform = "scaleX(" + clamp(v.gr / 20, 0, 1).toFixed(3) + ")";
    });
    var grm = dock.querySelector(".dv-grm:not(.dv-lgrm)");
    if (grm && lv[C.sel]) { grm.firstChild.style.transform = "scaleY(" + clamp(lv[C.sel].gr / 24, 0, 1).toFixed(3) + ")"; grm.lastChild.textContent = minus((-lv[C.sel].gr).toFixed(1)); }
    var lgm = dock.querySelector(".dv-lgrm"), mv = lv["*"];   // HERESY 1544: the master's compressor and limiter
    if (lgm && mv) { lgm.firstChild.style.transform = "scaleY(" + clamp((mv.lim || 0) / 24, 0, 1).toFixed(3) + ")"; lgm.lastChild.textContent = minus((-(mv.lim || 0)).toFixed(1)); }
    var mgr = dock.querySelector('.mc-master .mc-gr:not(.mc-lgr) i'), mlr = dock.querySelector(".mc-master .mc-lgr i");
    if (mgr && mv) mgr.style.transform = "scaleX(" + clamp(mv.gr / 20, 0, 1).toFixed(3) + ")";
    if (mlr && mv) mlr.style.transform = "scaleX(" + clamp((mv.lim || 0) / 20, 0, 1).toFixed(3) + ")";
    var L = M.S.loud;
    Array.prototype.forEach.call(dock.querySelectorAll("[data-loud]"), function (el) {
      var k = el.dataset.loud, v = !L ? null : k === "tp" ? (L.tp > 0 ? 20 * Math.log10(L.tp) : null) : L[k];
      el.textContent = v == null ? "—" : minus(v.toFixed(1));
      el.classList.toggle("is-hot", k === "tp" && v != null && v > -1);
    });
    Array.prototype.forEach.call(dock.querySelectorAll(".mc-corr i"), function (el) {
      var cr = L ? clamp(L.corr, -1, 1) : 1;
      el.style.left = ((cr + 1) / 2 * 100).toFixed(1) + "%";
      el.classList.toggle("is-bad", cr < 0);
    });
    if (C.tab === "devices" && M.S.playing) {
      if (dock.querySelector("canvas.dv-eq")) drawEq();
      if (dock.querySelector('canvas.dv-spec[data-spec="*"]')) drawSpec();
      if (dock.querySelector("canvas.dv-gonio")) drawGonio();   // HERESY 1538
    }
  }
  // HERESY 1538: the goniometer: each pair of samples a dot, mid (L+R) up and side (L−R) across, scaled to the loudest of the block
  var GL = null, GR2 = null;
  function drawGonio() {
    var c = document.querySelector("#mxDock canvas.dv-gonio"), M = K(), aL = M && M.analyser("*L"), aR = M && M.analyser("*R");
    if (!c || !aL || !aR) return;
    if (!GL || GL.length !== aL.fftSize) { GL = new Float32Array(aL.fftSize); GR2 = new Float32Array(aR.fftSize); }
    aL.getFloatTimeDomainData(GL); aR.getFloatTimeDomainData(GR2);
    var w = c.width, h = c.height, g = c.getContext("2d"), pk = 1e-4;
    for (var i = 0; i < GL.length; i++) { var a = Math.abs(GL[i]) + Math.abs(GR2[i]); if (a > pk) pk = a; }
    var k = (w / 2 - 8) / Math.max(pk, 0.05);
    g.fillStyle = css(c, "--sunk", "#000"); g.globalAlpha = 0.35; g.fillRect(0, 0, w, h); g.globalAlpha = 1;
    g.strokeStyle = css(c, "--dim", "#888"); g.globalAlpha = 0.3; g.beginPath(); g.moveTo(w / 2, 4); g.lineTo(w / 2, h - 4); g.moveTo(4, h / 2); g.lineTo(w - 4, h / 2); g.stroke(); g.globalAlpha = 1;
    g.fillStyle = css(c, "--amber", "#d99d10"); g.globalAlpha = 0.5;
    for (var j = 0; j < GL.length; j += 2) { var mid = (GL[j] + GR2[j]) * 0.5, side = (GL[j] - GR2[j]) * 0.5; g.fillRect(w / 2 + side * k, h / 2 - mid * k, 1.5, 1.5); }
    g.globalAlpha = 1;
  }
  function drawSpec() {
    var c = document.querySelector('#mxDock canvas.dv-spec[data-spec="*"]'), M = K(), an = M && M.analyser("*");
    if (!c || !an) return;
    var w = c.width, h = c.height, g = c.getContext("2d"), bins = new Float32Array(an.frequencyBinCount), rate = (M.info() || {}).rate || 48000;
    an.getFloatFrequencyData(bins);
    g.clearRect(0, 0, w, h);
    g.fillStyle = css(c, "--dim", "#888"); g.globalAlpha = 0.25;
    [100, 1000, 10000].forEach(function (f) { g.fillRect(Math.round(fx(f, w)), 0, 1, h); });
    g.globalAlpha = 1; g.beginPath(); g.moveTo(0, h);
    var sc = specCurve("*", bins, rate, w);            // HERESY 1536: on its own floating scale
    sc.pts.forEach(function (q) { g.lineTo(q[0], h - clamp((q[1] - sc.lo) / (sc.hi - sc.lo), 0, 1) * (h - 6)); });
    g.lineTo(w, h); g.closePath(); g.fillStyle = css(c, "--amber", "#d99d10"); g.globalAlpha = 0.35; g.fill(); g.globalAlpha = 1;
  }

  // ---- what the hand does in the dock
  function stripOf(el) { var st = el.closest("[data-n]"); return st ? st.dataset.n : ""; }
  function select(n, tab) {
    C.sel = n;
    if (tab) C.tab = tab;
    if (n && n.charAt(0) !== "~" && n.charAt(0) !== "@" && n.charAt(0) !== "%" && n !== "*" && K().S.focus !== n) K().select(n);   // 1543: a VCA is no lane (1563: nor a bus)
    paint();
  }
  function onClick(e) {
    var b = e.target.closest && e.target.closest("[data-act]"), M = K();
    if (!b || !M || b.disabled) return;
    var act = b.dataset.act, n = stripOf(b), v = b.dataset.v, s;
    if (act === "tab") { C.tab = v; paint(); return; }
    if (act === "select") { select(n, "devices"); return; }
    if (act === "pick") { select(v, "devices"); return; }
    if (act === "eq" || act === "comp" || act === "lim") { C.focusCard = act; select(n, "devices"); var cd = document.querySelector("#mxDock .dv-" + (act === "eq" ? "eqc" : act === "lim" ? "limc" : "compc")); if (cd) cd.scrollIntoView({ block: "nearest", inline: "nearest" }); return; }   // 1544: lim
    if (act === "msave") {                            // HERESY 1533
      var inp = document.querySelector("#mxDock .mm-name"), nm = inp ? inp.value.trim() : "";
      if (!nm) { if (inp) inp.focus(); return; }
      M.mixes.saveAs(nm).then(function () { paint(); }, function (e) { var k = M.mixes.lab(); k.err = e.message || String(e); paint(); });
      return;
    }
    if (act === "mload") { M.mixes.load(v); C.tab = "mixes"; paint(); return; }
    if (act === "mdel") {
      var ask = window.HeresyDialog ? window.HeresyDialog.confirm(tr("Delete the mix «{0}»?").replace("{0}", v), { ok: tr("Delete"), cancel: tr("Cancel"), danger: true }) : Promise.resolve(window.confirm(v));
      ask.then(function (yes) { if (yes === true) M.mixes.del(v).then(function () { paint(); }, function (e) { var k = M.mixes.lab(); k.err = e.message || String(e); paint(); }); });
      return;
    }
    if (act === "mon") { M.monitor(v); Array.prototype.forEach.call(document.querySelectorAll('#mxDock [data-act="mon"][data-v="' + v + '"]'), function (x) { var on2 = !!M.monitor()[v]; x.classList.toggle("is-on", on2); x.setAttribute("aria-pressed", on2); }); return; }   // HERESY 1536
    if (act === "peaks") { M.resetLoud(); return; }
    if (act === "loudreset") { M.resetLoud(); return; }
    if (act === "insgate" || act === "insplug") { runInsert(C.sel, act, v); return; }   // HERESY 1561: a job on Forge, its undo the versions
    if (act === "mprint") { runPrint(v); return; }
    M.mark();
    if (act === "addvca") { var gid = M.groupAdd(C.sel && M.names().indexOf(C.sel) >= 0 ? [C.sel] : []); if (gid) select("@" + gid, "devices"); return; }   // HERESY 1543
    if (act === "addbus") { var sid = M.subAdd(C.sel && M.names().indexOf(C.sel) >= 0 ? [C.sel] : []); if (sid) select("%" + sid, "devices"); return; }   // HERESY 1563
    if (act === "smember") { var sb2 = subOf2(C.sel); if (sb2) M.subSet(sb2.id, "members", sb2.members.indexOf(v) >= 0 ? sb2.members.filter(function (y) { return y !== v; }) : sb2.members.concat([v])); paint(); return; }
    if (act === "sdel") { var sd2 = subOf2(C.sel); if (sd2) { M.subDel(sd2.id); C.sel = ""; C.tab = "mixer"; } paint(); return; }
    if (act === "gmute" || act === "gsolo") { var gm = grp(n); if (gm) M.groupSet(gm.id, act.slice(1), !gm[act.slice(1)]); paint(); return; }
    if (act === "gmember") { var gg = grp(C.sel); if (gg) M.groupSet(gg.id, "members", gg.members.indexOf(v) >= 0 ? gg.members.filter(function (y) { return y !== v; }) : gg.members.concat([v])); paint(); return; }
    if (act === "gdel") { var gd = grp(C.sel); if (gd) { M.groupDel(gd.id); C.sel = ""; C.tab = "mixer"; } paint(); return; }
    if (act === "mute" || act === "solo" || act === "invert") { s = M.strip(n); M.set(n, act, !s[act]); return; }
    if (act === "bmute" || act === "bmute-dev") { var bus = b.closest("[data-bus]") ? b.closest("[data-bus]").dataset.bus : (C.sel === "~room" ? "reverb" : "delay"); M.setBus(bus, "mute", !M.S.buses[bus].mute); paint(); return; }
    if (act === "preset") { M.setBus("reverb", "preset", v); paint(); return; }
    if (act === "dtime") { M.setBus("delay", "time_ms", +v); paint(); return; }
    if (act === "dnote") { var bpm = clamp(+((document.querySelector("#mxDock .dv-bpm") || {}).value) || 120, 20, 400); C.bpm = bpm; M.setBus("delay", "time_ms", clamp(Math.round(+v * 60000 / bpm * 100) / 100, 5, 2000)); paint(); return; }
    if (act === "version") { M.setVersion(C.sel, v); paint(); return; }
    if (act === "eqon") { editBand(C.sel, "", function (x, eq) { eq.on = !eq.on; }); paint(); return; }
    if (act === "limon") { s = M.strip(C.sel); M.set(C.sel, "limit", Object.assign({}, s.limit || { on: false }, { on: !(s.limit && s.limit.on) })); paint(); return; }   // HERESY 1544
    if (act === "compon") { s = M.strip(C.sel); M.set(C.sel, "comp", Object.assign({}, s.comp || { on: false }, { on: !(s.comp && s.comp.on) })); paint(); return; }
    if (act === "cpreset") {
      if (v === "Duck") { M.set(C.sel, "comp", { on: true, threshold_db: -28, ratio: 2.5, attack_ms: 15, release_ms: 250, knee_db: 6, makeup_db: 0, key: "lead_vocal" }); paint(); return; }   // HERESY 1537
      var pr = COMP_PRESETS.filter(function (x) { return x[0] === v; })[0]; if (pr) M.set(C.sel, "comp", Object.assign({ on: true }, pr[1])); paint(); return;
    }
    if (act === "ckey") { s = M.strip(C.sel); M.set(C.sel, "comp", Object.assign({}, s.comp || { on: true }, { on: true, key: v })); paint(); return; }   // HERESY 1537
    if (act === "band") { C.band = v; paint(); return; }
    if (act === "addband") { addBand(C.sel, 1000, 0); return; }
    if (act === "flat") { editBand(C.sel, "", function (x, eq) { eq.bands = []; }); C.band = ""; paint(); return; }
    if (act === "btype") { editBand(C.sel, C.band, function (x) { if (x) { x.type = v; if (!GAIN_TYPES[v]) x.gain_db = 0; } }); paint(); return; }
    if (act === "benable") { editBand(C.sel, C.band, function (x) { if (x) x.enabled = x.enabled === false; }); paint(); return; }
    if (act === "bdel") { editBand(C.sel, C.band, function (x, eq) { eq.bands = eq.bands.filter(function (y) { return String(y.id) !== String(C.band); }); }); C.band = ""; paint(); return; }
  }
  function addBand(n, f, gdb) {
    var M = K(), s = M.strip(n), bands = s.eq ? s.eq.bands : [], rate = (M.info() || {}).rate || 48000;
    if (bands.length >= 8) return;
    var id = "b" + Date.now().toString(36);
    var type = f < 60 ? "highpass" : f > 14000 ? "high_shelf" : "peak";
    M.mark();
    editBand(n, "", function (x, eq) { eq.on = true; eq.bands.push({ id: id, type: type, enabled: true, frequency_hz: Math.round(clamp(f, 20, 0.45 * rate)), gain_db: GAIN_TYPES[type] ? Math.round(clamp(gdb, -12, 12) * 10) / 10 : 0, q: type === "peak" ? 1 : 0.707 }); });
    C.band = id;
    paint();
  }
  // knobs and faders under the hand
  function onDown(e) {
    var M = K();
    if (!M || e.button !== 0) return;
    var kn = e.target.closest && e.target.closest(".kn"), fd = e.target.closest && e.target.closest(".fd-track"), eqc = e.target.closest && e.target.closest("canvas.dv-eq");
    if (kn) {
      e.preventDefault();
      M.mark();
      C.drag = { kind: "knob", el: kn, y: e.clientY, shift: e.shiftKey, x0: toPos(P[kn.dataset.k], get(kn.dataset.kt, kn.dataset.n, kn.dataset.k)) };
      try { kn.setPointerCapture(e.pointerId); } catch (x) { /* gone */ }
      kn.focus({ preventScroll: true });
      return;
    }
    if (fd) {
      e.preventDefault();
      M.mark();
      var el = fd.closest(".fd"), r = fd.getBoundingClientRect(), lo = +el.dataset.lo, hi = +el.dataset.hi, p0 = M.taper(lo), p1 = M.taper(hi);
      var capY = r.bottom - (M.taper(get(el.dataset.kt, el.dataset.n, el.dataset.k)) - p0) / (p1 - p0) * r.height;
      C.drag = { kind: "fader", el: el, y: e.clientY, h: r.height, shift: e.shiftKey, x0: (M.taper(get(el.dataset.kt, el.dataset.n, el.dataset.k)) - p0) / (p1 - p0) };
      if (Math.abs(e.clientY - capY) > 12) {       // a click off the cap puts it there
        C.drag.x0 = clamp((r.bottom - e.clientY) / r.height, 0, 1); C.drag.y = e.clientY;
        setFader(el, C.drag.x0);
      }
      try { fd.setPointerCapture(e.pointerId); } catch (x) { /* gone */ }
      fd.focus({ preventScroll: true });
      return;
    }
    if (eqc) eqDown(e, eqc);
  }
  function setFader(el, x) {
    var M = K(), lo = +el.dataset.lo, hi = +el.dataset.hi, p0 = M.taper(lo), p1 = M.taper(hi), v = M.untaper(p0 + clamp(x, 0, 1) * (p1 - p0));
    v = clamp(Math.round(v * 10) / 10, lo, hi);
    put(el.dataset.kt, el.dataset.n, el.dataset.k, v);
    faderValue(el, v);
    var o = el.parentNode.querySelector(".mc-db");
    if (o) o.textContent = fdb(v);
  }
  function onMove(e) {
    var d = C.drag;
    if (!d) return;
    var fine = e.shiftKey ? 0.2 : 1;
    if (d.kind === "knob") {
      var p = P[d.el.dataset.k], x = d.x0 + (d.y - e.clientY) / 180 * fine;
      if (e.shiftKey !== d.shift) { d.shift = e.shiftKey; d.x0 = toPos(p, get(d.el.dataset.kt, d.el.dataset.n, d.el.dataset.k)); d.y = e.clientY; return; }
      put(d.el.dataset.kt, d.el.dataset.n, d.el.dataset.k, fromPos(p, x));
      paintKnob(d.el); after(d.el);
    } else if (d.kind === "fader") {
      if (e.shiftKey !== d.shift) { d.shift = e.shiftKey; var M = K(), lo = +d.el.dataset.lo, hi = +d.el.dataset.hi; d.x0 = (M.taper(get(d.el.dataset.kt, d.el.dataset.n, d.el.dataset.k)) - M.taper(lo)) / (M.taper(hi) - M.taper(lo)); d.y = e.clientY; return; }
      setFader(d.el, d.x0 + (d.y - e.clientY) / d.h * fine);
    } else if (d.kind === "band") eqMove(e);
  }
  function onUp() { if (C.drag && C.drag.kind === "band") paint(); C.drag = null; }
  function after(el) {                                // what else shows the value just turned
    var k = el.dataset.k;
    if (k.indexOf("comp.") === 0) drawComp();
    if (k.indexOf("band.") === 0) { drawEq(); eqMini(C.sel); }
  }
  function onDbl(e) {
    var kn = e.target.closest && e.target.closest(".kn"), fd = e.target.closest && e.target.closest(".fd-track"), eqc = e.target.closest && e.target.closest("canvas.dv-eq");
    if (kn) { K().mark(); put(kn.dataset.kt, kn.dataset.n, kn.dataset.k, P[kn.dataset.k].def); paintKnob(kn); after(kn); return; }
    if (fd) { var el = fd.closest(".fd"); K().mark(); put(el.dataset.kt, el.dataset.n, el.dataset.k, 0); faderValue(el, 0); var o = el.parentNode.querySelector(".mc-db"); if (o) o.textContent = fdb(0); return; }
    if (eqc) { var r = eqc.getBoundingClientRect(); if (!hitBand(eqc, e.clientX - r.left, e.clientY - r.top)) addBand(C.sel, xf(e.clientX - r.left, r.width), yd(e.clientY - r.top, r.height)); }
  }
  function onWheel(e) {
    var kn = e.target.closest && e.target.closest(".kn"), fd = e.target.closest && e.target.closest(".fd-track"), eqc = e.target.closest && e.target.closest("canvas.dv-eq"), M = K();
    if (!M || !(kn || fd || eqc)) return;
    e.preventDefault();
    var now = performance.now();
    if (now - C.wheelAt > 700) M.mark();
    C.wheelAt = now;
    var step = (e.deltaY < 0 ? 1 : -1) * (e.shiftKey ? 0.004 : 0.02);
    if (kn) { var p = P[kn.dataset.k]; put(kn.dataset.kt, kn.dataset.n, kn.dataset.k, fromPos(p, toPos(p, get(kn.dataset.kt, kn.dataset.n, kn.dataset.k)) + step)); paintKnob(kn); after(kn); return; }
    if (fd) { var el = fd.closest(".fd"), lo = +el.dataset.lo, hi = +el.dataset.hi; setFader(el, (M.taper(get(el.dataset.kt, el.dataset.n, el.dataset.k)) - M.taper(lo)) / (M.taper(hi) - M.taper(lo)) + step); return; }
    if (eqc) {
      var r = eqc.getBoundingClientRect(), hit = hitBand(eqc, e.clientX - r.left, e.clientY - r.top) || band(C.sel, C.band);
      if (!hit) return;
      C.band = String(hit.id);
      editBand(C.sel, hit.id, function (b) { if (b) b.q = clamp(Math.round(+b.q * (e.deltaY < 0 ? 1.12 : 1 / 1.12) * 1000) / 1000, 0.2, 10); });
      drawEq(); eqMini(C.sel);
      var qk = document.querySelector('#mxDock .kn[data-k="band.q"]'); if (qk) paintKnob(qk);
    }
  }
  function onKey(e) {
    var kn = e.target.closest && e.target.closest(".kn"), fd = e.target.closest && e.target.closest(".fd-track"), M = K();
    if (!M || !(kn || fd) || e.ctrlKey || e.metaKey || e.altKey) return;
    var dir = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 5, PageDown: -5 }[e.key];
    if (e.key === "Home" || e.key === "End" || dir) { e.preventDefault(); e.stopPropagation(); } else return;
    M.mark();
    if (kn) {
      var p = P[kn.dataset.k], v = get(kn.dataset.kt, kn.dataset.n, kn.dataset.k);
      v = e.key === "Home" ? p.min : e.key === "End" ? p.max : p.taper ? fromPos(p, toPos(p, v) + dir * 0.01) : clamp(+(v + dir * p.step * (e.shiftKey ? 1 : 5)).toFixed(4), p.min, p.max);
      put(kn.dataset.kt, kn.dataset.n, kn.dataset.k, v); paintKnob(kn); after(kn);
    } else {
      var el = fd.closest(".fd"), cur = get(el.dataset.kt, el.dataset.n, el.dataset.k), lo = +el.dataset.lo, hi = +el.dataset.hi;
      var nv = e.key === "Home" ? lo : e.key === "End" ? hi : clamp(Math.round((cur + dir * (e.shiftKey ? 0.1 : 0.5)) * 10) / 10, lo, hi);
      put(el.dataset.kt, el.dataset.n, el.dataset.k, nv); faderValue(el, nv); var o = el.parentNode.querySelector(".mc-db"); if (o) o.textContent = fdb(nv);
    }
  }
  // the EQ's curve under the hand
  function hitBand(c, x, y) {
    var M = K(), s = M.strip(C.sel), w = c.getBoundingClientRect().width, h = c.getBoundingClientRect().height, best = null, bd = 14;
    (s.eq ? s.eq.bands : []).forEach(function (b) {
      var hx = fx(+b.frequency_hz, w), hy = clamp(dy(GAIN_TYPES[b.type] ? +b.gain_db || 0 : response(C.sel, +b.frequency_hz), h), 7, h - 7), d = Math.hypot(hx - x, hy - y);
      if (d < bd) { bd = d; best = b; }
    });
    return best;
  }
  function eqDown(e, c) {
    var r = c.getBoundingClientRect(), b = hitBand(c, e.clientX - r.left, e.clientY - r.top);
    if (!b) return;
    e.preventDefault();
    K().mark();
    C.band = String(b.id);
    C.drag = { kind: "band", c: c, id: String(b.id), x: e.clientX, y: e.clientY, f0: +b.frequency_hz, g0: +b.gain_db || 0 };
    try { c.setPointerCapture(e.pointerId); } catch (x) { /* gone */ }
    drawEq();
  }
  function eqMove(e) {
    var d = C.drag, r = d.c.getBoundingClientRect(), fine = e.shiftKey ? 0.2 : 1, rate = (K().info() || {}).rate || 48000;
    var x = fx(d.f0, r.width) + (e.clientX - d.x) * fine, f = clamp(Math.round(xf(x, r.width)), 20, Math.floor(0.45 * rate));
    var gdb = clamp(Math.round((d.g0 + (d.y - e.clientY) * fine / ((r.height / 2 - 6) / DBR)) * 10) / 10, -12, 12);
    editBand(C.sel, d.id, function (b) { if (b) { b.frequency_hz = f; if (GAIN_TYPES[b.type]) b.gain_db = gdb; } });
    drawEq(); eqMini(C.sel);
    Array.prototype.forEach.call(document.querySelectorAll('#mxDock .kn[data-kt="e"]'), paintKnob);
  }
  function onMenu(e) {
    var c = e.target.closest && e.target.closest("canvas.dv-eq");
    if (!c) return;
    var r = c.getBoundingClientRect(), b = hitBand(c, e.clientX - r.left, e.clientY - r.top);
    if (!b) return;
    e.preventDefault();
    K().mark();
    editBand(C.sel, b.id, function (x, eq) { eq.bands = eq.bands.filter(function (y) { return String(y.id) !== String(b.id); }); });
    if (C.band === String(b.id)) C.band = "";
    paint();
  }

  // ---- what the mixer says
  function changed(d) {
    var M = K(), dock = $("mxDock");
    if (!M || !dock || dock.hidden) return;
    if (C.drag) return;                               // the hand's own turn: drawn as it turns
    if (!d || (!d.n && !d.bus)) { paint(); return; }
    if (d.bus) {
      Array.prototype.forEach.call(dock.querySelectorAll('[data-kt="b"]'), function (el) {
        if (el.classList.contains("kn")) { paintKnob(el); return; }
        var v = get("b", "", el.dataset.k), o = el.parentNode.querySelector(".mc-db");
        faderValue(el, v);
        if (o) o.textContent = fdb(v);
      });
      return;
    }
    var n = d.n, st = dock.querySelector('.mc-strip[data-n="' + CSS.escape(n) + '"]'), s = M.strip(n);
    M.names().forEach(function (m) { var r = dock.querySelector('.mc-strip[data-n="' + CSS.escape(m) + '"]'); if (r) r.classList.toggle("is-quiet", !M.audible(m)); });
    if (st) {
      Array.prototype.forEach.call(st.querySelectorAll(".kn"), paintKnob);
      var fd = st.querySelector(".fd");
      if (fd) { faderValue(fd, s.gain_db); st.querySelector(".mc-db").textContent = fdb(s.gain_db); }
      ["mute", "solo", "invert"].forEach(function (k) { var b = st.querySelector('[data-act="' + k + '"]'); if (b) { b.classList.toggle("is-on", !!s[k]); b.setAttribute("aria-pressed", !!s[k]); } });
      var eqs = st.querySelector('[data-act="eq"]'), cps = st.querySelector('[data-act="comp"]');
      if (eqs) eqs.classList.toggle("is-on", !!(s.eq && s.eq.on && s.eq.bands.some(function (b) { return b.enabled !== false; })));
      if (cps) cps.classList.toggle("is-on", !!(s.comp && s.comp.on));
      eqMini(n);
    }
    if (C.tab === "devices" && C.sel === n) {
      if (d.key === "version" || d.key === "muted") paint();
      else { Array.prototype.forEach.call(dock.querySelectorAll(".dv-row .kn"), paintKnob); drawEq(); drawComp(); }
    }
  }
  function init() {
    var M = K();
    if (!M) return;
    M.on("paint", paint);
    M.on("frame", function () { frame(false); });
    M.on("change", changed);
    M.on("mixes", function () { if (C.tab === "mixes") paint(); else { var t = document.querySelector('#mxDock .mc-tab[data-v="mixes"]'); if (t) t.textContent = tr("Mixes") + (M.mixes.list().length ? " \u00b7 " + M.mixes.list().length : ""); } });   // HERESY 1533
    M.on("select", function (n) { if (n && n !== C.sel) { C.sel = n; if (C.tab === "devices") paint(); else Array.prototype.forEach.call(document.querySelectorAll("#mxDock .mc-strip[data-n]"), function (r) { r.classList.toggle("is-sel", r.dataset.n === n); }); var dt = document.querySelector('#mxDock .mc-tab[data-v="devices"]'); if (dt) { dt.disabled = false; dt.innerHTML = esc(tr("Devices")) + ' · <b translate="no">' + esc(selTitle()) + "</b>"; } } });
    var body = $("mxBody");
    if (!body) return;
    body.addEventListener("click", function (e) { if (e.target.closest && e.target.closest("#mxDock")) onClick(e); });
    body.addEventListener("pointerdown", function (e) { if (e.target.closest && e.target.closest("#mxDock")) onDown(e); });
    body.addEventListener("pointermove", function (e) { if (C.drag) onMove(e); });
    body.addEventListener("pointerup", function (e) { if (C.drag) onUp(e); });
    body.addEventListener("pointercancel", function () { C.drag = null; });
    body.addEventListener("dblclick", function (e) { if (e.target.closest && e.target.closest("#mxDock")) onDbl(e); });
    body.addEventListener("wheel", function (e) { if (e.target.closest && e.target.closest("#mxDock")) onWheel(e); }, { passive: false });
    body.addEventListener("keydown", function (e) { if (e.target.closest && e.target.closest("#mxDock")) onKey(e); });
    body.addEventListener("contextmenu", function (e) { if (e.target.closest && e.target.closest("#mxDock")) onMenu(e); });
    body.addEventListener("change", function (e) { if (e.target.classList && e.target.classList.contains("dv-bpm")) C.bpm = clamp(+e.target.value || 120, 20, 400); });
    body.addEventListener("change", function (e) {   // HERESY 1563: a bus's name, kept as it is left
      var inp = e.target.closest && e.target.closest("#mxDock .dv-busname"), bx = inp && subOf2(C.sel);
      if (!bx) return;
      var nm = inp.value.trim().slice(0, 40);
      if (nm && nm !== bx.name) { K().mark(); K().subSet(bx.id, "name", nm); paint(); }
    });
    body.addEventListener("change", function (e) {   // HERESY 1543: a VCA's name, kept as it is left
      var inp = e.target.closest && e.target.closest("#mxDock .dv-vcaname"), gx = inp && grp(C.sel);
      if (!gx) return;
      var nm = inp.value.trim().slice(0, 40);
      if (nm && nm !== gx.name) { K().mark(); K().groupSet(gx.id, "name", nm); paint(); }
    });
    body.addEventListener("keydown", function (e) {   // HERESY 1533: Enter in the name saves
      if (e.key === "Enter" && e.target.classList && e.target.classList.contains("mm-name")) { e.preventDefault(); var b = document.querySelector('#mxDock [data-act="msave"]'); if (b) b.click(); }
    });
    if (window.ResizeObserver) new ResizeObserver(function () { if (C.tab === "devices") drawEq(); }).observe(body);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();

  window.HeresyConsole = { paint: paint, state: function () { return { sel: C.sel, tab: C.tab, band: C.band }; }, select: select,
    response: response };
})();
