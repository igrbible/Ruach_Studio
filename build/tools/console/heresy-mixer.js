// HERESY 1471 (Viktor 15.10.2026: «нужно начать интеграцию Plenio's DAW. Даже то же самое сведение… в DAW можно регулировать кучу
// всего по стемам, резать их, понижать/повышать»; «нужна опция для двух версий стемов, и при сведении нужна прослушка в общей
// компоновке в вкл/выкл версий стемов, чтобы собрать идеал из того, что получили»): the Refiner's DAW. A set of the take's stems
// on lanes, one a stem and one more, rest (what the source holds beyond them: all lanes as they are give the source back);
// each lane its level, mute and solo, its version (the stem as split, or a file made from it: a cleaned voice…), silence drawn
// on its wave, its compression and its sends. What is set is heard here at once, the stems streamed in stretches from Forge and
// played together sample for sample; «Mix» renders it on Forge through Plenio's stem mixer (lab/daw.py), a branch of the tree.
// The wave shows its upper half and the whole one under the pointer (Viktor: «только верхнюю половину волны, а при наведении
// мыши поверх, можно дорисовывать нижнюю часть»).
// HERESY 1531 (Viktor 18.10.2026: «Преврати твой DAW начаток в профессиональный миксер как ты умеешь»): every lane a channel of a
// console, heard as it is set and rendered as it is heard: the silence drawn, trim and polarity, an EQ of up to eight bands, the
// compressor (Plenio's, heresy-mixdsp.js), the fader, width, pan, mute and solo, the sends after the pan into the room (the impulse
// the render convolves with, /lab/daw/ir) and the delay (Plenio's loop), each return its level and mute, the master's fader; meters
// on everything (peak, RMS, the reduction, the master's loudness, true peak and correlation). The value is ruach.mix/1, rendered on
// Forge by lab/daw_mix.py in the same order. Undo and redo, A and B, printed stems. The console and the devices: heresy-console.js.
(function () {
  "use strict";

  var CHUNK = 8, LEAD = 0.12, SCHEMA = "ruach.mix/1", REST = "rest";   // HERESY 1531: the mixer's own value (lab/daw_mix.py)
  var S = { take: null, sets: [], set: "", info: null, strips: {}, versions: {}, buses: busesDefault(),
            peaks: {}, ctx: null, graph: null, playing: false, startCtx: 0, startAt: 0, at: 0, token: 0, srcs: [],
            timer: 0, raf: 0, watch: 0, busy: "", drag: null,
            view: { zoom: 1, t0: 0 }, loop: null, loopOn: false, focus: "", meters: {}, rule: null,   // HERESY 1501
            lv: {}, loud: null, undo: [], redo: [], ab: { cur: "A", A: null, B: null }, print: recallFlag("yue2.mixer.print", false),   // HERESY 1531
            dock: recallFlag("yue2.mixer.dock", true), fall: 0,
            named: [], lab: { saved: 0, err: "", broken: "" }, labTimer: 0,   // HERESY 1533: the mixes kept on Forge
            autoShow: {}, adrag: null,                   // HERESY 1535: the lanes whose volume line is in hand
            autoParam: {},                               // HERESY 1559: which line a lane has in hand (volume when not said)
            mon: { mono: false, dim: false },            // HERESY 1536: the master's monitor, for the ear only
            ref: refReset(),                             // HERESY 1755: the reference, the sound as it came
            marks: [],                                   // HERESY 2016: the markers of your own
            grid: { on: recallFlag("yue2.mixer.grid", true), chords: recallFlag("yue2.mixer.chords", true), wait: false, err: "", lit: null },   // HERESY 2313–2314
            aud: null };                                 // HERESY 2317: the lane auditioned while Alt is held on it
  function $(id) { return document.getElementById(id); }
  var UNDO_SVG = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M5 3 2 6l3 3M2.5 6H10a4 4 0 0 1 0 8H7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var GRID_SVG = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M2 3v10M6 6v7M10 6v7M14 3v10M1.5 13h13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';   // HERESY 2313
  var REDO_SVG = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M11 3l3 3-3 3M13.5 6H6a4 4 0 0 0 0 8h3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function tr(s) { return window.RuachI18n ? window.RuachI18n.t(s) : s; }
  function clock(t) { t = Math.max(0, t || 0); var m = Math.floor(t / 60), s = Math.floor(t % 60); return m + ":" + (s < 10 ? "0" : "") + s; }
  function icon(n, alt) { return window.HeresyIcons ? window.HeresyIcons.ui(n) : alt; }
  function q(o) { return Object.keys(o).map(function (k) { return k + "=" + encodeURIComponent(o[k]); }).join("&"); }
  function getJson(path) {
    return fetch("/lab" + path).then(function (r) { return r.json().then(function (b) { if (!r.ok) throw new Error(b.error || r.status); return b; }); });
  }
  function say(text, bad) { var el = $("mxState"); if (el) { el.textContent = text || ""; el.title = text || ""; el.classList.toggle("is-bad", !!bad); } }   // 1968: all of it in its tip

  // ---- what is kept: the mix of a set of a take, in this browser
  function keyOf() { return "yue2.mixer:" + (S.take ? S.take.name : "") + ":" + S.set; }
  var keepTimer = 0;
  function keepNow() {
    clearTimeout(keepTimer); keepTimer = 0;
    if (!S.take || !S.set || S.owner !== keyOf()) return;   // HERESY 1545: kept only as whose it is
    S.t = Date.now();
    try { localStorage.setItem(keyOf(), JSON.stringify({ strips: S.strips, versions: S.versions, buses: S.buses, ab: S.ab, t: S.t, marks: S.marks })); } catch (e) { /* private mode */ }   // 2016: marks
    labKeep();
  }
  // HERESY 1533: the working mix on Forge, beside its set: sent a moment after the hand stops, so another browser opens it as it is
  function snapState() { return { strips: S.strips, versions: S.versions, buses: S.buses, ab: S.ab, t: S.t || Date.now(), marks: S.marks }; }   // 2016: marks
  function labCall(body) {
    try { return labFetch(body); } catch (e) { return Promise.reject(e); }   // a fetch that throws at once is a refusal too
  }
  function labFetch(body) {
    return fetch("/lab/daw/mixes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.assign({ name: S.take.name, set: S.set }, body)) })
      .then(function (r) { return r.json().then(function (b) { if (!r.ok) throw new Error(b.error || r.status); return b; }, function () { throw new Error(String(r.status)); }); });
  }
  function labKeep() {
    clearTimeout(S.labTimer);
    if (!S.take || !S.set || !S.info || S.owner !== keyOf()) return;   // HERESY 1545
    var take = S.take.name, set = S.set;
    S.labTimer = setTimeout(function () {
      if (!S.take || S.take.name !== take || S.set !== set) return;
      labCall({ working: snapState() }).then(function (d) {
        S.lab = { saved: Date.now(), err: "", broken: "" }; S.named = d.named || S.named; emit("mixes");
      }, function (e) { S.lab = { saved: S.lab.saved, err: e.message || String(e), broken: S.lab.broken }; emit("mixes"); });
    }, 1500);
  }
  function labLoad(token, keptT) {
    var asked;
    try { asked = getJson("/daw/mixes?" + q({ name: S.take.name, set: S.set })); } catch (e) { asked = Promise.reject(e); }
    asked.then(function (d) {
      if (token !== S.token) return;
      S.named = d.named || []; S.lab.broken = d.broken || ""; S.lab.err = "";
      var w = d.working && d.working.state;
      if (w && (+w.t || 0) > (+keptT || 0)) {         // Forge's is newer: the mix as it was left on another machine
        S.strips = migrate(w.strips || {}); S.versions = w.versions || {}; S.buses = busesOf(w.buses); S.ab = w.ab && w.ab.cur ? w.ab : { cur: "A", A: null, B: null };
        S.marks = marksOf(w.marks);                   // HERESY 2016
        S.t = +w.t;
        try { localStorage.setItem(keyOf(), JSON.stringify(snapState())); } catch (e) { /* private mode */ }
        restored(true);
        S.lab.saved = (d.working.saved || 0) * 1000;
      } else if (keptT) labKeep();                    // this browser's is newer: Forge gets it
      emit("mixes");
    }, function (e) { if (token === S.token) { S.lab.err = e.message || String(e); emit("mixes"); } });
  }
  function saveAs(name) {
    return labCall({ save_as: name, state: snapState() }).then(function (d) { S.named = d.named || []; S.lab.err = ""; emit("mixes"); return d; });
  }
  function loadNamed(name) {
    var m = S.named.filter(function (x) { return x.name === name; })[0];
    if (!m) return;
    mark();
    put(JSON.stringify(m.state));
    paintUndo();
  }
  function delNamed(name) {
    return labCall({ "delete": name }).then(function (d) { S.named = d.named || []; emit("mixes"); return d; });
  }
  function keep() { if (!keepTimer) keepTimer = setTimeout(keepNow, 250); }   // HERESY 1531: a knob turned sixty times a second is kept once
  function recallFlag(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : v === "1"; } catch (e) { return d; } }
  function keepFlag(k, v) { try { localStorage.setItem(k, v ? "1" : "0"); } catch (e) { /* private mode */ } }
  function recall() {
    try { var v = JSON.parse(localStorage.getItem(keyOf()) || "null"); return v && typeof v === "object" ? v : null; } catch (e) { return null; }
  }
  // HERESY 1531: a strip as the console has it; what is not set is the strip as it came
  var COMP_DEF = { on: true, threshold_db: -18, ratio: 2, knee_db: 6, attack_ms: 10, release_ms: 120, makeup_db: 0, key: "", mix: 1 };   // 1537: key; 1759: mix
  var GATE_DEF = { on: true, threshold_db: -50, ratio: 4, range_db: 40, attack_ms: 2, release_ms: 150 };   // HERESY 1760: a strip's gate
  var LIMIT_DEF = { on: true, ceiling_db: -1, drive_db: 0, release_ms: 100 };   // HERESY 1544: Plenio's limiter, its own defaults
  function busesDefault() {
    return { reverb: { preset: "room", return_db: 0, mute: false, predelay_ms: 0, lowcut_hz: 20, highcut_hz: 20000 },   // HERESY 1762: its pre-delay, the returns' cuts (20 Hz, 20 kHz: Off)
             delay: { time_ms: 375, feedback: 0.35, lowpass_hz: 4000, return_db: 0, mute: false, lowcut_hz: 20, highcut_hz: 20000 },
             master: { gain_db: 0, eq: null, comp: null, limit: null, fade_in_s: 0, fade_out_s: 0, end_s: null }, groups: [], subs: [] };   // HERESY 1544: the master's chain; 1543: the VCAs; 1563: the audio buses; 1756: the song's fade
  }
  function busesOf(b) {
    var d = busesDefault();
    b = b || {};
    ["reverb", "delay", "master"].forEach(function (k) { if (b[k] && typeof b[k] === "object") Object.keys(d[k]).forEach(function (f) { if (b[k][f] != null) d[k][f] = b[k][f]; }); });
    if (["room", "plate", "hall"].indexOf(d.reverb.preset) < 0) d.reverb.preset = "room";
    d.groups = (Array.isArray(b.groups) ? b.groups : []).filter(function (x) { return x && x.id; }).slice(0, 16).map(function (x) {   // HERESY 1543
      return { id: String(x.id), name: String(x.name || x.id).slice(0, 40), members: Array.isArray(x.members) ? x.members.map(String) : [], gain_db: +x.gain_db || 0, mute: !!x.mute, solo: !!x.solo }; });
    d.subs = (Array.isArray(b.subs) ? b.subs : []).filter(function (x) { return x && x.id; }).slice(0, 8).map(function (x) {   // HERESY 1563
      return { id: String(x.id), name: String(x.name || x.id).slice(0, 40), members: Array.isArray(x.members) ? x.members.map(String) : [], gain_db: +x.gain_db || 0, mute: !!x.mute,
               width: x.width == null ? 1 : +x.width, pan: +x.pan || 0, eq: x.eq && Array.isArray(x.eq.bands) ? { on: x.eq.on !== false, bands: x.eq.bands } : null, comp: x.comp || null }; });
    return d;
  }
  function migrate(strips) {                         // a mix kept before 1531: Plenio's one compression knob as its compressor
    Object.keys(strips || {}).forEach(function (n) {
      var s = strips[n], a = +s.compression || 0;
      if (a > 0 && !s.comp) s.comp = { on: true, threshold_db: Math.round((-12 - 18 * a) * 10) / 10, ratio: Math.round((1 + 5 * a) * 100) / 100, knee_db: 6, attack_ms: 10, release_ms: 120, makeup_db: 0 };
      delete s.compression;
    });
    return strips;
  }
  function masterStrip() {                           // HERESY 1544: the master as a strip, for the console's devices
    var b = S.buses.master;
    return { gain_db: +b.gain_db || 0, mute: false, solo: false, muted: [], reverb: 0, delay: 0, trim_db: 0, invert: false, width: 1, pan: 0, auto: [],
             eq: b.eq && Array.isArray(b.eq.bands) ? { on: b.eq.on !== false, bands: b.eq.bands } : null,
             comp: b.comp ? Object.assign({}, COMP_DEF, b.comp, { key: "" }) : null, limit: b.limit ? Object.assign({}, LIMIT_DEF, b.limit) : null };
  }
  // HERESY 1563: an audio bus, as a strip for the console («%» and its id)
  function subOf(id) { return (S.buses.subs || []).filter(function (x) { return x.id === id; })[0] || null; }
  function subOfStrip(n) { return (S.buses.subs || []).filter(function (x) { return x.members.indexOf(n) >= 0; })[0] || null; }
  function subStrip(id) {
    var b = subOf(id) || {};
    return { gain_db: +b.gain_db || 0, mute: !!b.mute, solo: false, muted: [], reverb: 0, delay: 0, trim_db: 0, invert: false, width: b.width == null ? 1 : +b.width, pan: +b.pan || 0,
             auto: [], autos: {}, eq: b.eq && Array.isArray(b.eq.bands) ? { on: b.eq.on !== false, bands: b.eq.bands } : null,
             comp: b.comp ? Object.assign({}, COMP_DEF, b.comp, { key: "" }) : null };
  }
  function subsKey() { return (S.buses.subs || []).map(function (x) { return x.id + ":" + x.members.join("+"); }).join(";"); }
  function regraph() { var was = S.playing, t = pos(); closeGraph(); if (was) play(t); }   // members moved: the sound built anew, played on
  function subAdd(members) {
    var bs = S.buses.subs || (S.buses.subs = []);
    if (bs.length >= 8) return "";
    var k = 1; while (bs.some(function (y) { return y.name === "Bus " + k; })) k++;
    var id = "bus-" + Date.now().toString(36);
    var mine = (members || []).filter(function (n) { return names().indexOf(n) >= 0; });
    bs.forEach(function (y) { y.members = y.members.filter(function (n) { return mine.indexOf(n) < 0; }); });   // a strip goes to one bus
    bs.push({ id: id, name: "Bus " + k, members: mine, gain_db: 0, mute: false, width: 1, pan: 0, eq: null, comp: null });
    keep(); regraph(); emit("change", { bus: "%" + id });
    return id;
  }
  function subSet(id, key, v) {
    var b = subOf(id);
    if (!b) return;
    if (key === "members") {
      var mine = (v || []).filter(function (n) { return names().indexOf(n) >= 0; });
      (S.buses.subs || []).forEach(function (y) { if (y !== b) y.members = y.members.filter(function (n) { return mine.indexOf(n) < 0; }); });
      b.members = mine;
      keep(); regraph(); emit("change", { bus: "%" + id, key: key });
      return;
    }
    setStrip("%" + id, key, v);
  }
  function subDel(id) {
    S.buses.subs = (S.buses.subs || []).filter(function (y) { return y.id !== id; });
    keep(); regraph(); emit("change", { bus: "%" + id });
  }
  function strip(name) {
    if (name === "*") return masterStrip();
    if (name.charAt(0) === "%") return subStrip(name.slice(1));   // HERESY 1563
    var s = S.strips[name] || (S.strips[name] = {});
    return { gain_db: +s.gain_db || 0, mute: !!s.mute, solo: !!s.solo, muted: Array.isArray(s.muted) ? s.muted : [],
             reverb: +s.reverb || 0, delay: +s.delay || 0,
             trim_db: +s.trim_db || 0, invert: !!s.invert, width: s.width == null ? 1 : +s.width, pan: +s.pan || 0,
             eq: s.eq && Array.isArray(s.eq.bands) ? { on: s.eq.on !== false, bands: s.eq.bands } : null,
             comp: s.comp ? Object.assign({}, COMP_DEF, s.comp) : null,
             gate: s.gate && typeof s.gate === "object" ? Object.assign({}, GATE_DEF, s.gate) : null,   // HERESY 1760
             auto: Array.isArray(s.auto) ? s.auto : [],   // HERESY 1535: [[t, dB], …]
             autos: s.autos && typeof s.autos === "object" && !Array.isArray(s.autos) ? s.autos : {},   // HERESY 1559: pan, width, sends
             edits: Array.isArray(s.edits) ? s.edits : [],   // HERESY 1564: stretches copied or moved along the lane
             chan: ["l", "r", "m"].indexOf(s.chan) >= 0 ? s.chan : "st", offset_s: +s.offset_s || 0 };   // HERESY 1989: its channel, its shift
  }
  function names() { return S.info ? S.info.strips.map(function (s) { return s.name; }).concat([REST]) : []; }
  // HERESY 1542: a silenced stretch [start, end, fall, rise]; 10 ms edges when it says none; edges longer than it shared by their lengths
  var EDGE = 0.01;
  function fadesOf(r) { return [r[2] != null ? +r[2] : EDGE, r[3] != null ? +r[3] : EDGE]; }
  function fitFades(r) {
    var f = fadesOf(r), len = r[1] - r[0], sum = f[0] + f[1];
    return sum > len && sum > 0 ? [len * f[0] / sum, len * f[1] / sum] : f;
  }
  function liveCuts(n) {                             // HERESY 1564: what is silent on the lane as heard: its cuts, under each laid stretch, a move's source
    var s = strip(n), out = s.muted.slice(), end = S.info ? S.info.seconds : 1e9;
    s.edits.forEach(function (e2) {
      if (e2.op === "move") out.push([e2.a, e2.b, EDGE, EDGE]);
      out.push([e2.to, Math.min(end, e2.to + (e2.b - e2.a)), EDGE, EDGE]);
    });
    return out;
  }
  function cutEnv(cuts, t) {                         // the gain the stretches leave at t, as the render's envelope
    var v = 1;
    cuts.forEach(function (r) {
      if (t < r[0] || t >= r[1]) return;
      var f = fitFades(r), e = 0;
      if (f[0] > 0 && t < r[0] + f[0]) e = 0.5 + 0.5 * Math.cos(Math.PI * (t - r[0]) / f[0]);
      else if (f[1] > 0 && t >= r[1] - f[1]) e = 0.5 - 0.5 * Math.cos(Math.PI * (t - (r[1] - f[1])) / f[1]);
      v = Math.min(v, e);
    });
    return v;
  }
  // HERESY 1501 (Viktor 15–16.10.2026: «DAW UX должен быть как в Bitwig»; «DAW будет самым интересным»): the lanes seen through a view, its
  // zoom (1: the whole song) and its start; a lane's colour by what it holds
  function span() { return (S.info ? S.info.seconds || 1 : 1) / S.view.zoom; }
  function tx(t, w) { return (t - S.view.t0) / span() * w; }
  function xt(x, w) { return S.view.t0 + x / Math.max(1, w) * span(); }
  function clampView() {
    var L = S.info ? S.info.seconds || 1 : 1;
    S.view.zoom = Math.max(1, Math.min(Math.max(1, L / 2), S.view.zoom));
    S.view.t0 = Math.max(0, Math.min(L - span(), S.view.t0));
  }
  var LANE_HUES = [[/vocal|voice|vox/i, "#d99d10"], [/drum|perc|kick|snare/i, "#c8573d"], [/bass/i, "#8a63d2"], [/guitar/i, "#4f9a4a"],
                   [/piano|keys|synth/i, "#3f7fbf"], [/^rest$/, "#8a8a8a"]];
  function hueOf(n) { if (LANE_C[n]) return LANE_C[n]; for (var i = 0; i < LANE_HUES.length; i++) if (LANE_HUES[i][0].test(n)) return LANE_HUES[i][1]; return "#2f9a8f"; }
  // HERESY 1989: a lane's own colour, folded or not, and the lanes' order, kept with the page by the stem's name (the set's order for the last)
  function lsGet(k, d) { try { return JSON.parse(localStorage.getItem(k) || "null") || d; } catch (e) { return d; } }
  function lsPut(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* a private window */ } }
  var LANE_C = lsGet("yue2.mxLaneC", {}), LANE_F = lsGet("yue2.mxLaneF", {}), LANE_O = lsGet("yue2.mxLaneO", {});
  var PALETTE = ["#b5163a", "#d9a441", "#2f9a8f", "#3f7fd1", "#8a5cc7", "#c2549d", "#5f9e3a", "#d06a2c", "#6b7280", "#0f8fb5"];
  function laneOrder() {
    var ns = names(), want = (LANE_O[S.set] || []).filter(function (n) { return ns.indexOf(n) >= 0; });
    return want.concat(ns.filter(function (n) { return want.indexOf(n) < 0; }));
  }
  // the value the render reads (HERESY 1531: ruach.mix/1, lab/daw_mix.py): every strip's settings that are not its defaults, the
  // returns and the master
  function rnd(v, k) { var m = Math.pow(10, k); return Math.round(v * m) / m; }
  function shaped(p, o) {                            // HERESY 2318: a point's shape, said only when it has one (a bend from −1 to 1, "hold", "s")
    var k = p[2];
    if (k === "hold" || k === "s") o.push(k);
    else if (typeof k === "number" && Math.abs(k) >= 0.001) o.push(rnd(Math.max(-1, Math.min(1, k)), 3));
    return o;
  }
  function value() {
    var b = S.buses, out = { schema: SCHEMA, strips: {} };
    names().forEach(function (n) {
      var s = strip(n), o = {};
      if (s.gain_db) o.gain_db = rnd(s.gain_db, 2);
      if (s.mute) o.mute = true;
      if (s.solo) o.solo = true;
      if (s.muted.length) o.muted = s.muted.map(function (r) {   // HERESY 1542: its fall and rise when they are not 10 ms
        var f = fadesOf(r), o2 = [Math.round(r[0] * 1000) / 1000, Math.round(r[1] * 1000) / 1000];
        return f[0] === EDGE && f[1] === EDGE ? o2 : o2.concat([Math.round(f[0] * 1000) / 1000, Math.round(f[1] * 1000) / 1000]); });
      if (s.trim_db) o.trim_db = rnd(s.trim_db, 2);
      if (s.invert) o.invert = true;
      if (s.chan !== "st") o.chan = s.chan;           // HERESY 1989
      if (s.offset_s) o.offset_s = rnd(s.offset_s, 3);
      if (s.eq && s.eq.bands.length) o.eq = { on: s.eq.on, bands: s.eq.bands.map(function (x) {
        return { id: String(x.id), type: x.type, enabled: x.enabled !== false, frequency_hz: rnd(+x.frequency_hz, 1), gain_db: rnd(+x.gain_db || 0, 2), q: rnd(+x.q, 3) }; }) };
      if (s.comp) o.comp = { on: !!s.comp.on, threshold_db: rnd(s.comp.threshold_db, 2), ratio: rnd(s.comp.ratio, 2), knee_db: rnd(s.comp.knee_db, 2),
                             attack_ms: rnd(s.comp.attack_ms, 2), release_ms: rnd(s.comp.release_ms, 1), makeup_db: rnd(s.comp.makeup_db, 2) };
      if (s.comp && +s.comp.mix < 1) o.comp.mix = rnd(Math.max(0, +s.comp.mix), 3);   // HERESY 1759: parallel compression
      if (s.gate) o.gate = { on: !!s.gate.on, threshold_db: rnd(+s.gate.threshold_db, 2), ratio: rnd(+s.gate.ratio, 2), range_db: rnd(+s.gate.range_db, 2),
                             attack_ms: rnd(+s.gate.attack_ms, 2), release_ms: rnd(+s.gate.release_ms, 1) };   // HERESY 1760
      if (s.comp && s.comp.key && s.comp.key !== n && names().indexOf(s.comp.key) >= 0) o.comp.key = s.comp.key;   // HERESY 1537
      if (s.width !== 1) o.width = rnd(s.width, 3);
      if (s.pan) o.pan = rnd(s.pan, 3);
      if (s.reverb) o.reverb = rnd(s.reverb, 3);
      if (s.delay) o.delay = rnd(s.delay, 3);
      if (s.auto.length) o.auto = s.auto.slice().sort(function (a, b) { return a[0] - b[0]; }).map(function (p) { return shaped(p, [rnd(p[0], 3), rnd(p[1], 2)]); });   // HERESY 1535; 2318: its shape
      var oa = {};                                    // HERESY 1559
      Object.keys(AUTO_P).forEach(function (k2) { var pp = s.autos[k2]; if (k2 !== "volume" && Array.isArray(pp) && pp.length) oa[k2] = pp.slice().sort(function (a, b) { return a[0] - b[0]; }).map(function (p) { return shaped(p, [rnd(p[0], 3), rnd(p[1], 3)]); }); });
      if (Object.keys(oa).length) o.autos = oa;
      if (s.edits.length) o.edits = s.edits.map(function (e2) { return { op: e2.op === "move" ? "move" : "copy", a: rnd(e2.a, 3), b: rnd(e2.b, 3), to: rnd(e2.to, 3) }; });   // HERESY 1564
      if (Object.keys(o).length) out.strips[n] = o;
    });
    out.reverb = { preset: b.reverb.preset };
    if (b.reverb.return_db) out.reverb.return_db = rnd(b.reverb.return_db, 2);
    if (b.reverb.mute) out.reverb.mute = true;
    out.delay = { time_ms: rnd(b.delay.time_ms, 2), feedback: rnd(b.delay.feedback, 3), lowpass_hz: rnd(b.delay.lowpass_hz, 1) };
    if (b.delay.return_db) out.delay.return_db = rnd(b.delay.return_db, 2);
    if (b.delay.mute) out.delay.mute = true;
    if (b.reverb.predelay_ms > 0) out.reverb.predelay_ms = rnd(b.reverb.predelay_ms, 1);   // HERESY 1762: said only when on
    ["reverb", "delay"].forEach(function (k) {
      if (b[k].lowcut_hz > 20) out[k].lowcut_hz = rnd(b[k].lowcut_hz, 1);
      if (b[k].highcut_hz < 20000) out[k].highcut_hz = rnd(b[k].highcut_hz, 1);
    });
    var ms = masterStrip(), mo = {};                   // HERESY 1544: the master's fader and chain
    if (ms.gain_db) mo.gain_db = rnd(ms.gain_db, 2);
    if (ms.eq && ms.eq.bands.length) mo.eq = { on: ms.eq.on, bands: ms.eq.bands.map(function (x) {
      return { id: String(x.id), type: x.type, enabled: x.enabled !== false, frequency_hz: rnd(+x.frequency_hz, 1), gain_db: rnd(+x.gain_db || 0, 2), q: rnd(+x.q, 3) }; }) };
    if (ms.comp) mo.comp = { on: !!ms.comp.on, threshold_db: rnd(ms.comp.threshold_db, 2), ratio: rnd(ms.comp.ratio, 2), knee_db: rnd(ms.comp.knee_db, 2),
                             attack_ms: rnd(ms.comp.attack_ms, 2), release_ms: rnd(ms.comp.release_ms, 1), makeup_db: rnd(ms.comp.makeup_db, 2) };
    if (ms.comp && +ms.comp.mix < 1) mo.comp.mix = rnd(Math.max(0, +ms.comp.mix), 3);   // HERESY 1759
    if (ms.limit) mo.limit = { on: !!ms.limit.on, ceiling_db: rnd(ms.limit.ceiling_db, 2), drive_db: rnd(ms.limit.drive_db, 2), release_ms: rnd(ms.limit.release_ms, 1) };
    var fd = fadeOf();                                 // HERESY 1756: the song's fade in and out, its end
    if (fd.fin) mo.fade_in_s = rnd(fd.fin, 2);
    if (fd.fout) mo.fade_out_s = rnd(fd.fout, 2);
    if (fd.endSet) mo.end_s = rnd(fd.end, 3);
    if (Object.keys(mo).length) out.master = mo;
    var ns0 = names();                                 // HERESY 1543: the VCAs, their members of this set
    if (b.groups && b.groups.length) out.groups = b.groups.map(function (x) {
      var o3 = { id: x.id, name: x.name, members: x.members.filter(function (y) { return ns0.indexOf(y) >= 0; }) };
      if (x.gain_db) o3.gain_db = rnd(x.gain_db, 2);
      if (x.mute) o3.mute = true;
      if (x.solo) o3.solo = true;
      return o3; });
    if (b.subs && b.subs.length) out.buses = b.subs.map(function (x) {   // HERESY 1563: the audio buses, as the render reads them
      var sx = subStrip(x.id), o4 = { id: x.id, name: x.name, members: x.members.filter(function (y) { return ns0.indexOf(y) >= 0; }) };
      if (sx.gain_db) o4.gain_db = rnd(sx.gain_db, 2);
      if (sx.mute) o4.mute = true;
      if (sx.width !== 1) o4.width = rnd(sx.width, 3);
      if (sx.pan) o4.pan = rnd(sx.pan, 3);
      if (sx.eq && sx.eq.bands.length) o4.eq = { on: sx.eq.on, bands: sx.eq.bands.map(function (q2) {
        return { id: String(q2.id), type: q2.type, enabled: q2.enabled !== false, frequency_hz: rnd(+q2.frequency_hz, 1), gain_db: rnd(+q2.gain_db || 0, 2), q: rnd(+q2.q, 3) }; }) };
      if (sx.comp) o4.comp = { on: !!sx.comp.on, threshold_db: rnd(sx.comp.threshold_db, 2), ratio: rnd(sx.comp.ratio, 2), knee_db: rnd(sx.comp.knee_db, 2),
                               attack_ms: rnd(sx.comp.attack_ms, 2), release_ms: rnd(sx.comp.release_ms, 1), makeup_db: rnd(sx.comp.makeup_db, 2) };
      if (sx.comp && +sx.comp.mix < 1) o4.comp.mix = rnd(Math.max(0, +sx.comp.mix), 3);   // HERESY 1759
      return o4; });
    return out;
  }
  // HERESY 1543: the VCAs over their members, as the render reads them
  function groupsOf(n) { return (S.buses.groups || []).filter(function (x) { return x.members.indexOf(n) >= 0; }); }
  function vcaDb(n) { return groupsOf(n).reduce(function (a, x) { return a + (+x.gain_db || 0); }, 0); }
  function audible(name) {
    if (S.aud) return name === S.aud.n;              // HERESY 2317: the lane auditioned alone, the mix as it is set untouched
    var soloing = names().some(function (n) { return strip(n).solo; }) || (S.buses.groups || []).some(function (x) { return x.solo && x.members.length; });
    var gs = groupsOf(name);
    return soloing ? strip(name).solo || gs.some(function (x) { return x.solo; }) : !(strip(name).mute || gs.some(function (x) { return x.mute; }));
  }
  function versionOf(name) {
    if (name === REST) return "";
    var s = S.info.strips.filter(function (x) { return x.name === name; })[0], want = S.versions[name];
    return s.versions.some(function (v) { return v.path === want; }) ? want : s.path;
  }

  // HERESY 1754: a solo forgotten makes the Mix of one lane: the head says it while one is on; a click there (or Alt+click on any S) lets
  // every lane be heard again, the lanes' solos and the VCAs', one undo
  function soloing() { return names().some(function (n) { return strip(n).solo; }) || (S.buses.groups || []).some(function (x) { return x.solo && x.members.length; }); }
  function soloPaint() {
    var b = $("mxUnsolo");
    if (!b) return;
    var k = S.info && soloing() ? names().filter(audible).length : 0;
    b.hidden = !k;
    b.textContent = "S \u00b7 " + k;
    b.setAttribute("data-tip", tr("Solo is on: {0} of {1} lanes heard, and Mix makes only them. A click (or Alt+click on any S) lets every lane be heard again").replace("{0}", k).replace("{1}", names().length));
  }
  function clearSolo() {
    var lanes = names().filter(function (n) { return S.strips[n] && S.strips[n].solo; }), gs = (S.buses.groups || []).filter(function (x) { return x.solo; });
    if (!lanes.length && !gs.length) return;
    mark();
    lanes.forEach(function (n) { S.strips[n].solo = false; });
    gs.forEach(function (x) { x.solo = false; });
    restored(false);
  }
  // HERESY 1755: the reference: the sound the set was split from (what a neutral mix gives back), streamed beside the lanes into the monitor in
  // the mix's place, as loud as the mix over what has played (the lab's blocks of it, /lab/daw/loudness, gated as the mix's are): louder
  // sounds better, so a compare not matched in level is no compare
  var SOURCE = "source";
  function refReset() { return { on: false, armed: false, asked: false, z: null, block: 0.1, match: null, t: 0, spec: null, title: "" }; }   // HERESY 2315: spec, title
  function refLabel() { return tr("Ref") + (S.ref.match != null ? " " + fmtDb(S.ref.match) : ""); }
  function refButton() {
    return '<button type="button" class="mx-ms mx-ref' + (S.ref.on ? " is-on" : "") + (S.ref.spec ? " is-other" : "") + '" id="mxRef" aria-pressed="' + S.ref.on + '"' + (S.info ? "" : " disabled") +
      ' data-tip="' + esc(tr("The sound as it came, the one the stems were split from (a neutral mix gives it back), heard in place of the mix and as loud as it over what has played: so the compare is of the sound, not of the level. The button says by how much it is raised or lowered; R does the same; Mono and Dim hear it too") +
        " " + tr("A right-click: another reference, a sound of this take, another take or a song of your own, as loud as the mix too") + " · " + tr("Now: {0}").replace("{0}", refTitle())) + '">' + esc(refLabel()) + "</button>";   // HERESY 2315
  }
  function refPaint() { var b = $("mxRef"); if (b) { b.classList.toggle("is-on", S.ref.on); b.classList.toggle("is-other", !!S.ref.spec); b.setAttribute("aria-pressed", S.ref.on); b.textContent = refLabel(); } }
  function refLoad() {
    if (!S.take || !S.set || S.ref.asked) return;
    var R = S.ref, set = S.set;
    R.asked = true;
    getJson(R.spec ? "/daw/ref/loudness?" + q({ spec: R.spec }) : "/daw/loudness?" + q({ name: S.take.name, set: set })).then(function (d) {   // HERESY 2315: any reference
      if (S.ref !== R || S.set !== set) return;
      R.z = d.z || null; R.block = d.block || 0.1;
    }, function (e) { if (S.ref === R) { R.asked = false; say(tr("The source's loudness did not come from the lab: the reference plays as it is, not matched") + " (" + (e.message || e) + ")", true); } });
  }
  function refToggle() {
    if (!S.info) return;
    var first = !S.ref.armed;
    S.ref.armed = true; S.ref.on = !S.ref.on;
    refLoad();
    applyRef(S.graph); refPaint();
    if (first && S.playing) play(pos());               // the source streamed from here on, beside the lanes
  }
  function applyRef(g) {
    if (!g || !g.ref || !S.ctx) return;
    var t = S.ctx.currentTime, on = S.ref.on && S.ref.armed && !S.aud;   // HERESY 2317: an audition hears the lane, not the reference
    g.ref.delay.delayTime.setValueAtTime(Math.min(1, latency(g)), t);   // as late as the console makes the mix
    g.mixMon.gain.setTargetAtTime(on ? 0 : 1, t, 0.006);
    g.ref.out.gain.setTargetAtTime(on ? db(S.ref.match || 0) : 0, t, on && g.refWas ? 0.3 : 0.006);   // a switch quick, a new match gliding
    g.refWas = on;
  }
  function refGated(z) {                             // as loudness() gates the mix's blocks: 400 ms windows a block apart, −70 LUFS, then 10 LU under
    var win = [];
    for (var k = 3; k < z.length; k++) win.push((z[k] + z[k - 1] + z[k - 2] + z[k - 3]) / 4);
    var abs = win.filter(function (w) { var l = lufs(w); return l != null && l > -70; });
    if (!abs.length) return null;
    var rel = lufs(abs.reduce(function (x, y) { return x + y; }, 0) / abs.length) - 10, gated = abs.filter(function (w) { return lufs(w) > rel; });
    return gated.length ? lufs(gated.reduce(function (x, y) { return x + y; }, 0) / gated.length) : null;
  }
  function refMatch() {
    var R = S.ref, L = S.loud, now = performance.now();
    if (!R.armed || !R.z || !S.playing || !L || L.i == null || now - R.t < 500) return;
    R.t = now;
    var a = Math.max(0, Math.floor(S.startAt / R.block)), b = Math.min(R.z.length, Math.floor(heard() / R.block));
    var ri = b - a >= 4 ? refGated(R.z.slice(a, b)) : null;
    if (ri == null) return;
    var m = Math.round(Math.max(-30, Math.min(30, L.i - ri)) * 10) / 10;
    if (m === R.match) return;
    R.match = m;
    applyRef(S.graph); refPaint();
  }
  // HERESY 1756: the song's fade on the master, after its fader: from −60 dB up over the fade-in, down to −60 dB over the fade-out before the
  // end, linear in dB (the gain's exponential ramps, as the render draws it), the lower where the two meet; nothing after the end
  var FADE_FLOOR = -60;
  function fadeOf() {
    var m = S.buses.master, L = S.info ? S.info.seconds : 0, e = +m.end_s > 0 && +m.end_s < L ? +m.end_s : L;
    return { fin: Math.max(0, +m.fade_in_s || 0), fout: Math.max(0, +m.fade_out_s || 0), end: e, endSet: e < L };
  }
  function fadeDb(t) {                               // the fade's level at t in dB; null from the end on (silent)
    var f = fadeOf(), d = 0;
    if (t >= f.end) return null;
    if (f.fin > 0 && t < f.fin) d = FADE_FLOOR * (1 - t / f.fin);
    if (f.fout > 0 && t > f.end - f.fout) d = Math.min(d, FADE_FLOOR * (t - (f.end - f.fout)) / f.fout);
    return d;
  }
  function fadeGain(t) { var d = fadeDb(t); return d == null ? 0 : db(d); }
  function fadeSchedule(g) {
    if (!g || !g.master || !g.master.fade || !S.ctx || !S.info) return;
    var p = g.master.fade.gain, now = S.ctx.currentTime, f = fadeOf(), from = S.playing ? Math.max(S.startAt, pos()) : S.at;
    p.cancelScheduledValues(0);
    p.setValueAtTime(fadeGain(from), now);
    if (!S.playing || !(f.fin > 0 || f.fout > 0 || f.endSet)) return;
    var lat = latency(g), toCtx = function (t) { return S.startCtx + (t - S.startAt) + lat; }, at = Math.max(now, toCtx(from));
    p.setValueAtTime(fadeGain(from), at);
    var marks = [];                                   // where the line bends, and every quarter second inside a fade (the two may meet)
    for (var t = Math.ceil(from * 4) / 4; t < f.end; t += 0.25) if ((f.fin > 0 && t <= f.fin + 0.25) || (f.fout > 0 && t >= f.end - f.fout - 0.25)) marks.push(t);
    [f.fin, f.end - f.fout].forEach(function (b) { if (b > from && b < f.end) marks.push(b); });
    marks.sort(function (a, b) { return a - b; });
    marks.forEach(function (t2) { if (t2 > from) p.exponentialRampToValueAtTime(Math.max(1e-6, fadeGain(t2)), toCtx(t2)); });
    if (f.end > from) { var ec = toCtx(f.end); if (f.fout > 0) p.exponentialRampToValueAtTime(db(FADE_FLOOR), ec); p.setValueAtTime(0, ec); }
  }

  // ---- the take, its sets of stems
  function setTake(take) {
    if (S.take && take && S.take.name === take.name) return;
    stop();
    keepNow(); closeGraph();   // HERESY 1531
    clearTimeout(S.watch); S.busy = ""; S.mixId = "";   // HERESY 1536: a mix watched for another take is no longer this one's
    S.owner = "";                                     // HERESY 1545: the mix in hand was the last take's
    S.take = take ? { name: take.name, label: take.label || take.name, seconds: take.seconds || 0 } : null;
    S.aud = null; S.grid.err = ""; S.grid.wait = false;   // HERESY 2313, 2317
    S.grid.on = recallFlag(gridKey(), !narratorTake());   // HERESY 2366: a Narrator's take opens with the grid off
    S.sets = []; S.set = ""; S.info = null; S.peaks = {};
    paint();
  }
  function setsFrom(files) {
    var seen = {}, out = [];
    (files || []).forEach(function (f) {
      if (f.kind !== "stems") return;
      var dir = String(f.source).split("/").slice(0, 2).join("/"), m = /\(([^)]*)\)\s*$/.exec(f.label || "");
      if (seen[dir]) return;
      seen[dir] = true;
      out.push({ dir: dir, label: (m ? m[1] : dir).replace(/^Stems, /, "") });
    });
    return out;
  }
  function onTree(files) {
    var sets = setsFrom(files), was = S.set;
    S.sets = sets;
    if (!sets.some(function (x) { return x.dir === was; })) { keepNow(); S.owner = ""; S.set = sets.length ? sets[sets.length - 1].dir : ""; }   // HERESY 1545: kept as the last set's
    if (S.set !== was || !S.info) open(); else paintHead();
  }
  function open() {
    stop();
    keepNow(); closeGraph();   // HERESY 1531: another set, another console
    S.info = null; S.peaks = {}; S.lv = {}; S.undo = []; S.redo = [];
    S.pick = null; S.clip = null;                     // HERESY 1564: a stretch in hand is this set's
    S.ref = refReset();                               // HERESY 1755: the reference is this set's source
    var rr0 = refRecall(); if (rr0) { S.ref.spec = rr0.spec; S.ref.title = rr0.title || rr0.spec; }   // HERESY 2315: or the one chosen for it
    paint();
    if (!S.take || !S.set) return;
    var token = ++S.token;
    say(tr("Reading the set…"));
    getJson("/daw/set?" + q({ name: S.take.name, set: S.set })).then(function (info) {
      if (token !== S.token) return;
      S.info = info;
      var kept = recall() || {};
      S.strips = migrate(kept.strips || {}); S.versions = kept.versions || {}; S.buses = busesOf(kept.buses);   // HERESY 1531
      S.marks = marksOf(kept.marks);                  // HERESY 2016
      S.owner = keyOf();                              // HERESY 1545: this mix is this take's and set's
      S.t = +kept.t || 0; S.named = []; S.lab = { saved: 0, err: "", broken: "" };
      labLoad(token, kept.t);                          // HERESY 1533: Forge's copy, when newer, replaces this browser's
      S.ab = kept.ab && kept.ab.cur ? kept.ab : { cur: "A", A: null, B: null };
      if (S.focus && names().indexOf(S.focus) < 0) S.focus = "";
      S.at = 0;
      say("");
      paint();
      names().forEach(function (n) { loadPeaks(n); });
      labLoad(token, kept.t);                          // HERESY 1533: Forge's copy, when newer, replaces this browser's (after the lanes are up)
      gridLoad();                                      // HERESY 2313: the take's bar grid, heard once a take
    }).catch(function (e) { if (token === S.token) say(e.message, true); });
  }
  function loadPeaks(name) {
    var path = versionOf(name), k = name + "|" + path;
    if (S.peaks[k]) return draw(name);
    getJson("/daw/peaks?" + q({ name: S.take.name, set: S.set, strip: name, path: path })).then(function (d) {
      S.peaks[k] = d.peaks;
      draw(name);
    }).catch(function () { /* the lane stays without its wave */ });
  }

  // ---- the panel
  function paint() {
    var body = $("mxBody");
    if (!body) return;
    if (!S.take) { body.innerHTML = '<p class="row-hint">' + esc(tr("Pick a take: its stems come here on their lanes.")) + "</p>"; return; }
    if (!S.sets.length) { body.innerHTML = '<p class="row-hint">' + esc(tr("Split the take into stems first (the Stems step): the DAW mixes a set of them.")) + "</p>"; return; }
    var html = '<div class="mx-head" id="mxHead"></div>' + '<div class="mx-lanes" id="mxLanes">';
    if (S.info) {
      S.secKey = secKey();                            // HERESY 1532
      html += ruler().replace('<div class="mx-ruler-row">', '<div class="mx-ruler-row' + (S.secKey ? " has-secs" : "") + (gridShown() ? " has-grid" : "") + '">');   // HERESY 2313                                 // HERESY 1501
      laneOrder().forEach(function (n) { html += lane(n); });   // HERESY 1989: in the order they were dragged to
      html += '<div class="mx-head-line" id="mxPlayhead" aria-hidden="true"></div>';
    }
    html += "</div>";
    if (S.info) html += '<div class="mx-dock" id="mxDock"' + (S.dock ? "" : " hidden") + "></div>";   // HERESY 1531: the console (heresy-console.js)
    html += '<p class="row-hint mx-note">' + esc(tr("Everything set here is heard as it is set and mixed on Forge as it is heard: the same EQ, compressor, pan, room and delay. A drag along a wave selects: drag the selection to move it (Ctrl copies), its edges to change it, right-click it to fade it in or out, raise, lower or silence it; Ctrl+C, Ctrl+X and Ctrl+V copy, cut and lay at the playhead, Delete silences, Ctrl+E splits, a double-click takes a segment whole. The line over a wave is its level: take it at a point up into a peak or down into a fade. A click plays from there; a right-click on a silence gives it back.")) + " " +   // HERESY 1968
      esc(tr("A silenced stretch: its top corners fade into it and out of it (a double-click gives back 10 ms), its sides move it.")) + "</p>";   // HERESY 1542
    body.innerHTML = html;
    if ($("dawPanel")) $("dawPanel").style.setProperty("--mx-lanes", String(Math.max(1, names().length)));   // HERESY 1499: the lanes share the screen
    paintHead();
    if (S.info) { drawRuler(); names().forEach(draw); paintPlayhead(); }   // HERESY 1501: the ruler
    emit("paint");                                    // HERESY 1531: the console paints itself into the dock
  }
  function paintHead() {
    var h = $("mxHead");
    if (!h) return;
    var sets = S.sets.map(function (x) { return '<option value="' + esc(x.dir) + '"' + (x.dir === S.set ? " selected" : "") + ' translate="no">' + esc(x.label) + "</option>"; }).join("");
    // HERESY 1797: the DAW's «beta» (1795) in its head, seen while it is over the whole window (its drawer's summary hidden then)
    h.innerHTML = '<label class="field mx-set"><span class="label">' + esc(tr("A set of stems")) + '</span><select id="mxSet">' + sets + "</select></label>" +
      '<span class="beta-badge mx-beta" data-tip="' + esc(tr("Beta: we make our songs here every day, and it is all still growing; what it keeps and how it looks may change in a later release.")) + '">' + esc(tr("beta")) + "</span>" +
      '<button type="button" class="btn ghost small icon-act mx-play" id="mxPlay" aria-label="' + esc(tr(S.playing ? "Pause" : "Play")) + '"' + (S.info ? "" : " disabled") + ">" + icon(S.playing ? "pause" : "play", S.playing ? "❚❚" : "▶") + "</button>" +
      '<span class="mono mx-time" id="mxTime">' + clock(pos()) + " / " + clock(S.info ? S.info.seconds : 0) + "</span>" +
      '<button type="button" class="mx-ms mx-unsolo" id="mxUnsolo" hidden></button>' +   // HERESY 1754: the solo light
      // HERESY 1531: A and B, undo and redo, the console shown or not, the stems printed with the mix
      '<span class="mx-ab" role="group" aria-label="' + esc(tr("Two mixes to compare")) + '">' + ["A", "B"].map(function (k) {
        return '<button type="button" class="mx-ms' + (S.ab.cur === k ? " is-on" : "") + '" id="mx' + k + '" aria-pressed="' + (S.ab.cur === k) + '" data-tip="' +
          esc(tr("Two mixes of this set to compare: switch between them as it plays; what is set goes into the one lit")) + '">' + k + "</button>"; }).join("") + "</span>" +
      refButton() +                                    // HERESY 1755: the sound as it came, as loud as the mix
      '<button type="button" class="mx-ms mx-undo" id="mxUndo"' + (S.undo.length ? "" : " disabled") + ' aria-label="' + esc(tr("Undo")) + '" data-tip="' + esc(tr("Undo (Ctrl+Z)")) + '">' + UNDO_SVG + "</button>" +
      '<button type="button" class="mx-ms mx-undo" id="mxRedo"' + (S.redo.length ? "" : " disabled") + ' aria-label="' + esc(tr("Redo")) + '" data-tip="' + esc(tr("Redo (Ctrl+Shift+Z)")) + '">' + REDO_SVG + "</button>" +
      '<button type="button" class="mx-ms mx-layer" id="mxLayerBtn"' + (S.info ? "" : " disabled") + ' aria-label="' + esc(tr("Layer")) + '" data-tip-head="' + esc(tr("Layer")) + '" data-tip="' +   // HERESY 2006: an icon, its name in the tip (the head is full)
        esc(tr("A layer from a bank on the shelf: an instrument, an effect, a drone or field recordings under the song, a strip of its own")) + '">' + icon("layers", "+") + "</button>" +
      '<button type="button" class="btn ghost small" id="mxReset"' + (S.info ? "" : " disabled") + ' data-tip="' + esc(tr("Every lane back to as split: level 0 dB, nothing muted, no silence, no sends")) + '">' + esc(tr("Reset")) + "</button>" +
      '<button type="button" class="btn ghost small icon-act" id="mxDockBtn" aria-pressed="' + S.dock + '" data-tip="' + esc(tr("The console beside the lanes, pinned, on hover or floating: every strip's inserts, sends, pan and fader, the returns and the master")) + '">' +
        icon("sliders", "\u2261") + "<span>" + esc(tr("Console")) + "</span></button>" +
      '<button type="button" class="mx-ms mx-print' + (S.print ? " is-on" : "") + '" id="mxPrint" aria-pressed="' + S.print + '" data-tip="' + esc(tr("Mix with its stems: every strip as it sounds in the mix, and each return, its own file beside the mix")) + '">+' + esc(tr("stems")) + "</button>" +
      (S.busy && S.mixId ? '<button type="button" class="btn ghost small mx-stop" id="mxStop" data-tip="' + esc(tr("Stop the mix on Forge: nothing is made")) + '">' + esc(tr("Stop")) + "</button>" : "") +   // HERESY 1539
      '<button type="button" class="btn primary small" id="mxMix"' + (S.info && !S.busy ? "" : " disabled") + ' data-tip="' + esc(tr("Mix it on Forge as it is heard here: a branch of the tree, its loudness measured")) + '">' + esc(tr("Mix")) + "</button>" +
      '<button type="button" class="btn ghost small icon-act mx-full" id="mxFull" aria-pressed="' + (isFull() ? "true" : "false") + '" aria-label="' + esc(tr(isFull() ? "Back from full screen" : "Full screen")) +
        '" data-tip="' + esc(tr("The DAW over the whole screen, each lane at its own height and the lanes scrolling inside; F11 here does the same. Esc, F11 or this button back")) + '">' +
        icon(isFull() ? "minimize" : "maximize", isFull() ? "\u2921" : "\u26f6") + "</button>" +   // HERESY 1499
      '<span class="row-hint mono mx-state" id="mxState"></span>';
    soloPaint();                                      // HERESY 1754
  }
  // HERESY 1499 (Viktor 16.10.2026: «DAW будет самым интересным. И сразу внедряй переключение в максимальный full screen режим, и перехватывай
  // в нём браузерный F11 на вкладке Студии»): the DAW over the whole window (the page's dialogs, menus and tips still over it), the window full
  // screen when the browser lets it; Esc, F11 or the button back. F11 on the Studio's tab is the Studio's: the DAW in sight goes full and
  // back, elsewhere the Studio itself full screen and back (Esc as well)
  function isFull() { return document.body.classList.contains("daw-full"); }
  function setFull(on) {
    var panel = $("dawPanel"), root = document.documentElement;
    if (!panel) return;
    if (on) {
      panel.open = true;
      if (panel.parentNode !== document.body) { S.home = { parent: panel.parentNode, next: panel.nextSibling }; document.body.appendChild(panel); }   // out of any box that holds a fixed one
      document.body.classList.add("daw-full");
      if (root.requestFullscreen && !document.fullscreenElement) root.requestFullscreen().catch(function () { /* the window alone */ });
    } else {
      document.body.classList.remove("daw-full");
      if (S.home && S.home.parent) { S.home.parent.insertBefore(panel, S.home.next && S.home.next.parentNode === S.home.parent ? S.home.next : null); S.home = null; }
      if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function () {});
    }
    paintHead();
    setTimeout(function () { if (S.info) { names().forEach(draw); paintPlayhead(); } }, 80);
  }
  document.addEventListener("fullscreenchange", function () { if (!document.fullscreenElement && isFull()) setFull(false); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && isFull() && !document.fullscreenElement && !document.querySelector(".hd-back")) { setFull(false); return; }
    if (e.key !== "F11" || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
    e.preventDefault();
    var panel = $("dawPanel"), inSight = panel && document.body.dataset.tab === "post" && panel.open && panel.getClientRects().length > 0;
    if (inSight || isFull()) return setFull(!isFull());
    var root = document.documentElement;
    if (document.fullscreenElement) document.exitFullscreen().catch(function () {});
    else if (root.requestFullscreen) root.requestFullscreen().catch(function () {});
  }, true);
  // HERESY 1965: a lane's height, 72 px unless dragged (40–120), kept by the stem's name with the page
  var LANE_H = (function () { try { return JSON.parse(localStorage.getItem("yue2.mxLaneH") || "{}") || {}; } catch (e) { return {}; } })();
  var LANE_DEF = 72, LANE_MIN = 40, LANE_MAX = 120;
  function laneH(n) { var h = +LANE_H[n]; return h >= LANE_MIN && h <= LANE_MAX ? h : LANE_DEF; }
  function laneKeep() { try { localStorage.setItem("yue2.mxLaneH", JSON.stringify(LANE_H)); } catch (e) { /* a private window */ } }
  function gripDown(e) {
    var g = e.target.closest && e.target.closest("[data-mx-grip]");
    if (!g || e.button !== 0) return false;
    e.preventDefault(); e.stopPropagation();
    var n = g.dataset.mxGrip, row = g.closest(".mx-lane"), y0 = e.clientY, h0 = laneH(n), h = h0;
    g.classList.add("is-drag");
    var move = function (ev) { h = Math.max(LANE_MIN, Math.min(LANE_MAX, Math.round(h0 + ev.clientY - y0))); row.style.setProperty("--mx-h", h + "px"); draw(n); paintPlayhead(); };
    var up = function () {
      document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up);
      g.classList.remove("is-drag");
      if (h === LANE_DEF) delete LANE_H[n]; else LANE_H[n] = h;
      laneKeep();
    };
    document.addEventListener("pointermove", move); document.addEventListener("pointerup", up);
    return true;
  }
  function lane(n) {
    var s = strip(n), st = n === REST ? null : S.info.strips.filter(function (x) { return x.name === n; })[0];
    var title = st ? st.title : tr("Rest"), cur = versionOf(n);
    var ver = st ? '<select class="mx-ver" data-mx="version" aria-label="' + esc(tr("Version")) + '">' + st.versions.map(function (v) {
      return '<option value="' + esc(v.path) + '"' + (v.path === cur ? " selected" : "") + ' translate="no">' + esc(v.id ? v.label + (v.created ? " · " + v.created.slice(11) : "") : tr("as split")) + "</option>";
    }).join("") + "</select>" + verButton(n, st) : '<span class="mx-ver mx-rest-say" data-tip="' + esc(tr("What the source holds beyond the stems: what the separation missed. All lanes as they are give the source back")) + '">' + esc(tr("the source less the stems")) + "</span>";
    return '<div class="mx-lane' + (audible(n) ? "" : " is-quiet") + (S.focus === n ? " is-focus" : "") + (LANE_F[n] ? " is-folded" : "") + '" data-strip="' + esc(n) + '" style="--mx-lane:' + hueOf(n) + ';--mx-wave:' + hueOf(n) + ";--mx-h:" + laneH(n) + 'px">' +   // HERESY 1501; 1965: its height
      '<div class="mx-ctl"><span class="mx-meter" data-meter="' + esc(n) + '" data-tip="' + esc(tr("Its level as it plays (the peak, the last held a moment)")) + '"><i></i></span>' +
      '<button type="button" class="mx-col" data-mx-col="1" style="background:' + hueOf(n) + '" aria-label="' + esc(tr("Colour")) + '" data-tip="' +   // HERESY 1989
        esc(tr("Its colour: a click steps through the palette, Alt+click gives it its own again")) + '"></button>' +
      '<span class="mx-name" translate="no" title="' + esc(title) + '" data-tip="' + esc(tr("A click picks the lane; dragged up or down, the lane goes there")) + '">' + esc(title) + "</span>" + ver +
      '<span class="mx-chg" role="group" aria-label="' + esc(tr("Channel")) + '">' + [["st", "S", "Both sides as they are"], ["l", "L", "The left side on both"], ["r", "R", "The right side on both"], ["m", "M", "The two sides summed, on both"]].map(function (c) {
        return '<button type="button" class="mx-ch' + (s.chan === c[0] ? " is-on" : "") + '" data-mx-ch="' + c[0] + '" aria-pressed="' + (s.chan === c[0]) + '" data-tip="' + esc(tr(c[2])) + '">' + c[1] + "</button>"; }).join("") + "</span>" +
      '<button type="button" class="mx-ms mx-inv' + (s.invert ? " is-on" : "") + '" data-mx="invert" aria-pressed="' + s.invert + '" data-tip="' + esc(tr("Polarity turned over (Ø)")) + '">\u00d8</button>' +
      '<button type="button" class="mx-ms' + (s.mute ? " is-on" : "") + '" data-mx="mute" aria-pressed="' + s.mute + '" data-tip="' + esc(tr("Mute")) + '">M</button>' +
      '<button type="button" class="mx-ms mx-solo' + (s.solo ? " is-on" : "") + '" data-mx="solo" aria-pressed="' + s.solo + '" data-tip="' + esc(tr("Solo: only the soloed lanes are heard")) + '">S</button>' +
      '<button type="button" class="mx-ms mx-auto' + (S.autoShow[n] ? " is-on" : "") + (hasAuto(n) ? " has-auto" : "") + '" data-mx="auto" aria-pressed="' + !!S.autoShow[n] + '" data-tip="' +   // HERESY 1535
        esc(tr("Automation: the lane's volume drawn over time. On, a click on the wave puts a point there and drags it, a right-click takes it away, a double-click sets it to 0 dB; heard and mixed after the fader")) + '">A</button>' +
      '<button type="button" class="mx-ms mx-autop" data-mx="autop"' + (S.autoShow[n] ? "" : " hidden") + ' data-tip="' +   // HERESY 1559
        esc(tr("Which knob the line draws: volume, pan, width, the room's send or the delay's; a click goes to the next. A knob drawn plays its line in place of its own value")) + '">' + esc(tr(AUTO_P[autoParam(n)].short)) + "</button>" +
      offHtml(s) +   // HERESY 1989: the level in the console alone; the lane's shift, when it has one
      '<button type="button" class="mx-fold" data-mx-fold="1" aria-expanded="' + !LANE_F[n] + '" data-tip="' + esc(tr("Fold the lane to its controls, or unfold it")) + '">' + (LANE_F[n] ? "\u25b8" : "\u25be") + "</button>" +
      "</div>" +   // HERESY 1531: the compressor, the sends and the rest of the strip in the console
      '<div class="mx-wave"><canvas data-mx-wave="' + esc(n) + '"></canvas></div>' +
      '<i class="mx-grip" data-mx-grip="' + esc(n) + '" data-tip="' + esc(tr("Drag: the lane's height, 40 to 120 px; a double-click puts it back")) + '"></i></div>';   // HERESY 1965
  }
  // HERESY 1989: the lane's shift as a badge, × back to 0
  function offHtml(s) {
    if (!s.offset_s) return "";
    var v = s.offset_s, txt = (v > 0 ? "+" : "\u2212") + Math.abs(v).toFixed(3).replace(/0+$/, "").replace(/\.$/, "") + " s";
    return '<span class="mx-off mono" data-tip="' + esc(tr("The whole lane shifted in time (Alt+Shift+drag on its wave)")) + '">' + txt +
      '<button type="button" class="mx-off-x" data-mx-off="0" aria-label="' + esc(tr("Back to 0")) + '" data-tip="' + esc(tr("Back to 0")) + '">\u00d7</button></span>';
  }
  // HERESY 1538: a lane's version without a dropdown: a click steps to the next (two compared as it plays), a right-click opens its devices
  function verLabel(v) { return v.id ? v.label + (v.created ? " · " + v.created.slice(11) : "") : tr("as split"); }
  function verButton(n, st) {
    var cur = versionOf(n), v = st.versions.filter(function (x) { return x.path === cur; })[0] || st.versions[0];
    return '<button type="button" class="mx-verb" data-mx="vercycle" translate="no"' + (st.versions.length < 2 ? " disabled" : "") + ' data-tip="' +
      esc(tr("This stem's version: a click steps to the next, so two are compared as it plays; a right-click shows them all in its devices")) + '">' +
      '<span>' + esc(verLabel(v)) + "</span>" + (st.versions.length > 1 ? '<i class="mono">' + (st.versions.indexOf(v) + 1) + "/" + st.versions.length + "</i>" : "") + "</button>";
  }
  function fmtDb(v) { v = +v || 0; return (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(1) + " dB"; }
  // HERESY 1501: the ruler row, in the lanes' own grid so its time lines up with the waves
  function ruler() {
    return '<div class="mx-ruler-row"><div class="mx-ctl mx-ruler-ctl">' +   // HERESY 1501b: the lanes' grid, not a lane
      '<button type="button" class="mx-ms mx-loop' + (S.loopOn ? " is-on" : "") + '" id="mxLoop" aria-pressed="' + S.loopOn + '" data-tip="' + esc(tr("Loop (L): the stretch drawn on the ruler played round; drag on the ruler to draw it")) + '">' + icon("repeat", "\u21bb") + "</button>" +
      '<button type="button" class="mx-ms mx-grid' + (S.grid.on && gridData() ? " is-on" : "") + '" id="mxGrid" aria-pressed="' + !!(S.grid.on && gridData()) + '" aria-label="' + esc(tr("The bar grid")) + '">' + GRID_SVG + "</button>" +   // HERESY 2313
      '<button type="button" class="mx-ms" id="mxZoomOut" data-tip="' + esc(tr("Zoom out (−)")) + '">−</button>' +
      '<button type="button" class="mx-ms" id="mxZoomIn" data-tip="' + esc(tr("Zoom in (+); Ctrl+wheel zooms about the pointer, Shift+wheel goes along")) + '">+</button>' +
      '<button type="button" class="btn ghost small" id="mxFit" data-tip="' + esc(tr("The whole song in view (0)")) + '">' + esc(tr("Fit")) + "</button>" +
      '<span class="mx-meter mx-master" data-meter="*" data-tip="' + esc(tr("The whole mix's level as it plays")) + '"><i></i></span>' +
      '<span class="row-hint mono mx-keys" data-tip="' + esc(tr("Space plays and stops; Home to the start (the loop's, when it is on); L the loop; M and S the lane picked by a click on its name; ↑ ↓ another lane; + − 0 the zoom; [ ] the section before and after; Ctrl+Z, Ctrl+Shift+Z undo and redo; R the sound as it came, as loud as the mix; Alt+click on an S: every solo off") + " " + tr("K a marker at the playhead, «,» and «.» the marker before and after; a right-click on one goes to it, renames or deletes it") + " " + tr("G the bar grid; Alt pressed on a wave plays that lane alone while it is held")) + '">' + esc(tr("keys")) + "</span></div>" +   // HERESY 2313, 2317
      '<div class="mx-wave mx-ruler" data-tip="' + esc(tr("The time: a click goes there, a drag draws the loop. Under it the song's sections, as the player has timed them: a click goes to one, a double-click loops it")) + '"><canvas data-mx-ruler="1"></canvas></div>' +
      // HERESY 2314: the chord lane, the score's chords on the bar grid (hidden while there are none)
      '<div class="mx-ctl mx-chord-ctl" hidden><span class="mx-chord-word">' + esc(tr("Chords")) + '</span><span class="mx-chord-key mono" translate="no"></span></div>' +
      '<div class="mx-wave mx-ruler mx-chordlane" hidden data-tip="' + esc(tr("The score's chords on the bar grid: a click goes to one, a double-click loops it; the key at the left")) + '"><canvas data-mx-chords="1"></canvas></div></div>';
  }
  // HERESY 1532: the song's sections, as the player's wave has them (the take in the player): [{t, name, end}], each to the next
  var SEC_HUES = [[/chorus|hook|refrain|припев/i, "217,157,16"], [/verse|куплет/i, "47,154,143"], [/bridge|pre|бридж/i, "138,99,210"],
                  [/intro|outro|вступ|кода|end/i, "138,138,138"], [/instr|break|solo|проигр/i, "63,127,191"]];
  function sections() {
    var f = window.ruachTakeSections, l = f && S.take ? f(S.take.name) : null, L = S.info ? S.info.seconds : 0;   // HERESY 2233: the take's own accessor, not the checks' helper
    l = (l || []).filter(function (x) { return x && x.t != null && isFinite(x.t) && x.t < L; }).slice().sort(function (a, b) { return a.t - b.t; });
    return l.map(function (x, i) { return { t: x.t, name: String(x.name || ""), end: i + 1 < l.length ? l[i + 1].t : L }; });
  }
  // HERESY 2016 (the DAW research of 02.11.2026: Bitwig, REAPER, Live, Logic all have them): markers of your own on the time. K one at the playhead,
  // «,» and «.» the one before and after, a right-click on the ruler at one goes to it, renames or deletes it. They live with the mix as it is
  // kept (this browser, Forge, a named mix), never in what is rendered (ruach.mix/1 refuses what it does not know), outside undo and A/B
  var MARK_MAX = 64;
  function marksOf(v) {
    return Array.isArray(v) ? v.filter(function (m) { return m && isFinite(+m.t) && +m.t >= 0; })
      .map(function (m) { return { t: Math.round(+m.t * 1000) / 1000, name: String(m.name || "").slice(0, 40) }; })
      .sort(function (a, b) { return a.t - b.t; }).slice(0, MARK_MAX) : [];
  }
  function markAdd(t) {
    if (!S.info) return false;
    t = Math.max(0, Math.min(S.info.seconds, +t || 0));
    if (S.marks.some(function (m) { return Math.abs(m.t - t) < 0.05; })) { say(tr("A marker stands here already")); return false; }
    if (S.marks.length >= MARK_MAX) { say(tr("{0} markers at most").replace("{0}", MARK_MAX), true); return false; }
    S.marks = marksOf(S.marks.concat([{ t: t, name: tr("Marker {0}").replace("{0}", S.marks.length + 1) }]));
    keep(); drawRuler(); say(tr("A marker at {0}").replace("{0}", clock(t)));
    return true;
  }
  function markJump(dir) {
    var now = pos(), to = null;
    if (dir > 0) { for (var i = 0; i < S.marks.length; i++) if (S.marks[i].t > now + 0.05) { to = S.marks[i].t; break; } }
    else { for (var j = S.marks.length - 1; j >= 0; j--) if (S.marks[j].t < now - (S.playing ? 1.5 : 0.05)) { to = S.marks[j].t; break; } }
    if (to == null) return false;
    if (S.playing) play(to); else { S.at = to; paintPlayhead(); }
    return true;
  }
  function markNear(x, w) { var best = null, d = 6; S.marks.forEach(function (m) { var dd = Math.abs(tx(m.t, w) - x); if (dd <= d) { d = dd; best = m; } }); return best; }
  function markMenu(mk, x, y) {
    window.HeresyMenu.open(x, y, [
      { label: "Go to the marker", icon: "\u2192", action: function () { if (S.playing) play(mk.t); else { S.at = mk.t; paintPlayhead(); } } },
      { label: "Rename the marker", icon: "\u270e", action: function () {
        if (!window.HeresyDialog) return;
        window.HeresyDialog.prompt(tr("The marker at {0}: its name").replace("{0}", clock(mk.t)), mk.name, { max: 40, ok: tr("Rename"), name: true })   /* HERESY 2462 */.then(function (v) {
          v = v == null ? "" : String(v).replace(/\s+/g, " ").trim().slice(0, 40);
          if (!v) return;
          mk.name = v; keep(); drawRuler();
        });
      } },
      { sep: true },
      { label: "Delete the marker", icon: "\u2715", danger: true, action: function () { S.marks = S.marks.filter(function (m) { return m !== mk; }); keep(); drawRuler(); } }]);
  }
  function secKey() { return sections().map(function (x) { return x.name + "@" + x.t; }).join("|"); }
  function secHue(name) { for (var i = 0; i < SEC_HUES.length; i++) if (SEC_HUES[i][0].test(name)) return SEC_HUES[i][1]; return "120,120,120"; }
  function sectionAt(t) { var s = sections(); for (var i = s.length - 1; i >= 0; i--) if (t >= s[i].t) return s[i]; return null; }
  function drawRuler() {
    var c = document.querySelector("canvas[data-mx-ruler]");
    if (!c || !S.info) return;
    var box = c.parentNode, w = Math.max(50, box.clientWidth), h = Math.max(10, box.clientHeight), dpr = window.devicePixelRatio || 1;
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); c.style.width = w + "px"; c.style.height = h + "px";
    var g = c.getContext("2d"), css = getComputedStyle(c), ink = css.getPropertyValue("--ink").trim() || "#ccc", dim = css.getPropertyValue("--dim").trim() || "#888";
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    if (S.loop) {
      var a = tx(S.loop[0], w), b = tx(S.loop[1], w);
      g.fillStyle = S.loopOn ? "rgba(217,157,16,.35)" : "rgba(217,157,16,.15)"; g.fillRect(a, 0, Math.max(1, b - a), h);
    }
    var steps = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300], st = steps[steps.length - 1];
    for (var i = 0; i < steps.length; i++) if (steps[i] / span() * w >= 64) { st = steps[i]; break; }
    g.font = "10px " + (css.getPropertyValue("--mono").trim() || "monospace"); g.textBaseline = "top";
    var secs = sections(), band = secs.length ? 15 : 0, top = h - band;   // HERESY 1532: the sections take the ruler's foot
    for (var t = Math.ceil(S.view.t0 / st) * st; t <= S.view.t0 + span() + 0.001; t += st) {
      var x = Math.round(tx(t, w)) + 0.5;
      g.fillStyle = dim; g.fillRect(x, top - 7, 1, 7);
      g.fillStyle = ink; g.fillText(clock(t) + (st < 1 && t % 1 ? ".5" : ""), x + 3, 2);
      for (var k = 1; k < 4 && st >= 1; k++) { g.fillStyle = dim; g.fillRect(Math.round(tx(t + k * st / 4, w)) + 0.5, top - 3, 1, 3); }
    }
    gridLines(g, w, top, true);                       // HERESY 2313: the bars numbered, the beats ticked
    S.marks.forEach(function (m) {                   // HERESY 2016: a flag with its name, a line to the sections
      var mx = Math.round(tx(m.t, w));
      if (mx < -2 || mx > w + 2) return;
      var label = m.name;
      while (label.length > 2 && g.measureText(label).width > 132) label = label.slice(0, -2) + "\u2026";
      g.fillStyle = "rgb(178,34,52)"; g.fillRect(mx, 0, 2, top); g.fillRect(mx, 0, Math.ceil(g.measureText(label).width) + 8, 13);
      g.fillStyle = "#fff"; g.fillText(label, mx + 4, 2);
    });
    if (!band) return;
    g.font = "600 9px " + (css.getPropertyValue("--mono").trim() || "monospace"); g.textBaseline = "middle";
    secs.forEach(function (sc) {
      var a = Math.max(0, tx(sc.t, w)), b = Math.min(w, tx(sc.end, w));
      if (b <= 0 || a >= w) return;
      var hue = secHue(sc.name), here = !!(S.loop && Math.abs(S.loop[0] - sc.t) < 0.01 && Math.abs(S.loop[1] - sc.end) < 0.01);
      g.fillStyle = "rgba(" + hue + "," + (here ? 0.55 : 0.28) + ")"; g.fillRect(a + 1, top + 1, Math.max(1, b - a - 2), band - 2);
      g.fillStyle = "rgba(" + hue + ",1)"; g.fillRect(Math.round(a) + 0.5, top, 1.5, band);
      var room = b - a - 8, label = sc.name;
      if (room > 14) {
        while (label.length > 2 && g.measureText(label).width > room) label = label.slice(0, -2) + "\u2026";
        g.fillStyle = ink; g.fillText(label, a + 5, top + band / 2 + 0.5);
      }
    });
    g.textBaseline = "top";
  }
  function redrawAll() { if (S.info) { drawRuler(); names().forEach(draw); paintPlayhead(); gridPaint(); } }   // HERESY 2313: and the chord lane
  function zoomAt(f, x, w) {                        // HERESY 1501: about a point of the view (x of w), the time under it kept
    var t = xt(x, w);
    S.view.zoom *= f; clampView();
    S.view.t0 = t - x / Math.max(1, w) * span(); clampView();
    redrawAll(); paintHead();
  }
  function waveBox() { var c = document.querySelector("#mxLanes canvas[data-mx-wave]"); return c ? c.parentNode : null; }

  // ---- the wave: its upper half; the whole one under the pointer (the lane grows); silence drawn dark; the playhead over all
  function draw(n) {
    var c = document.querySelector('canvas[data-mx-wave="' + n + '"]');
    if (!c || !S.info) return;
    var box = c.parentNode, w = Math.max(50, box.clientWidth), h = Math.max(10, box.clientHeight), dpr = window.devicePixelRatio || 1;
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); c.style.width = w + "px"; c.style.height = h + "px";
    var g = c.getContext("2d"), pk = S.peaks[n + "|" + versionOf(n)], full = true;   // HERESY 1499: full screen, whole waves; 1511 (Viktor: «В DAW волну рисуй полную… не экономь на этом»): whole always
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    gridLines(g, w, h, false);                        // HERESY 2313: the bar grid under the wave
    var css = getComputedStyle(c), on = css.getPropertyValue("--mx-wave").trim() || "#d99d10", off = css.getPropertyValue("--mx-quiet").trim() || "rgba(0,0,0,.45)";
    var L = S.info.seconds || 1;
    if (pk) {
      g.fillStyle = on;
      var base = full ? h / 2 : h - 1, amp = full ? h / 2 - 1 : h - 2;
      var vp = linePts(n, "volume"), vg = function (px) { return vp.length ? db(autoDb(vp, xt(px + 0.5, w))) : 1; };   // HERESY 1968: the wave as the level's line makes it; 2318: laid out
      var o0 = strip(n).offset_s || 0;                  // HERESY 1989: the lane's shift
      for (var x = 0; x < w; x++) {
        var i0 = Math.floor((xt(x, w) - o0) / L * pk.length), i1 = Math.max(i0 + 1, Math.floor((xt(x + 1, w) - o0) / L * pk.length)), m = 0;   // HERESY 1501: through the view
        if (i1 <= 0 || i0 >= pk.length) continue;
        i0 = Math.max(0, i0);
        for (var i = i0; i < i1 && i < pk.length; i++) if (pk[i] > m) m = pk[i];
        var y = Math.max(1, Math.min(amp, m * amp * vg(x)));
        g.fillRect(x, base - y, 1, full ? 2 * y : y);
      }
    }
    g.fillStyle = off;
    strip(n).muted.forEach(function (r) {             // HERESY 1542: dark as the gain is low, the gain's line, a handle at each top corner
      var xa = tx(r[0], w), xb = tx(r[1], w), f = fitFades(r), xf = tx(r[0] + f[0], w), xr = tx(r[1] - f[1], w);
      if (xb < 0 || xa > w) return;
      g.fillRect(xf, 0, Math.max(1, xr - xf), h);
      for (var px = Math.floor(xa); px < Math.ceil(xb); px++) {
        if (px >= xf && px < xr) continue;
        g.globalAlpha = 1 - cutEnv([r], xt(px + 0.5, w)); g.fillRect(px, 0, 1, h);
      }
      g.globalAlpha = 1;
      if (xb - xa < 10) return;
      g.strokeStyle = on; g.globalAlpha = 0.85; g.lineWidth = 1.25; g.beginPath();
      for (var lx = Math.floor(xa) - 1; lx <= Math.ceil(xb) + 1; lx++) { var ly = 1.5 + (1 - cutEnv([r], xt(lx, w))) * (h - 3); if (lx === Math.floor(xa) - 1) g.moveTo(lx, ly); else g.lineTo(lx, ly); }
      g.stroke(); g.globalAlpha = 1;
      [xf, xr].forEach(function (hx) { g.fillStyle = on; g.fillRect(Math.round(hx) - 3, 0, 7, 7); g.strokeStyle = "rgba(0,0,0,.6)"; g.lineWidth = 1; g.strokeRect(Math.round(hx) - 2.5, 0.5, 6, 6); });
      g.fillStyle = off;
    });
    var eds = strip(n).edits, acc = css.getPropertyValue("--accent").trim() || "#b5163a";   // HERESY 1564
    eds.forEach(function (e2) { if (e2.op === "move") { g.fillStyle = off; g.fillRect(tx(e2.a, w), 0, Math.max(1, (e2.b - e2.a) / span() * w), h); } });
    eds.forEach(function (e2) {
      var xa = tx(e2.to, w), xb = tx(Math.min(L, e2.to + (e2.b - e2.a)), w);
      if (xb < 0 || xa > w) return;
      g.clearRect(xa, 0, xb - xa, h);
      g.fillStyle = acc; g.globalAlpha = 0.12; g.fillRect(xa, 0, xb - xa, h); g.globalAlpha = 1;
      if (pk) {
        g.fillStyle = on;
        var base2 = h / 2, amp2 = h / 2 - 1;
        for (var px2 = Math.max(0, Math.floor(xa)); px2 < Math.min(w, Math.ceil(xb)); px2++) {
          var ts = e2.a + (xt(px2, w) - e2.to), te = e2.a + (xt(px2 + 1, w) - e2.to), j0 = Math.floor(ts / L * pk.length), j1 = Math.max(j0 + 1, Math.floor(te / L * pk.length)), mm = 0;
          for (var j = j0; j < j1 && j < pk.length; j++) if (j >= 0 && pk[j] > mm) mm = pk[j];
          var yy = Math.max(1, Math.min(amp2, mm * amp2 * vg(px2)));   // 1968: the level's line over a laid stretch too
          g.fillRect(px2, base2 - yy, 1, 2 * yy);
        }
      }
      g.strokeStyle = acc; g.lineWidth = 1; g.strokeRect(Math.round(xa) + 0.5, 0.5, Math.max(1, Math.round(xb - xa) - 1), h - 1);
      if (xb - xa > 40) { g.fillStyle = acc; g.font = "10px sans-serif"; g.fillText((e2.op === "move" ? "\u21e2 " : "\u29c9 ") + clock(e2.a), xa + 4, 11); }
    });
    var fz = fadeOf();                                // HERESY 1756: the song's fade over the lane, dark as it is low; after the end, dark
    if (fz.fin > 0 || fz.fout > 0 || fz.endSet) {
      g.fillStyle = off;
      for (var fx2 = 0; fx2 < w; fx2 += 2) {
        var fdv = fadeDb(xt(fx2 + 1, w)), fal = fdv == null ? 1 : -fdv / 60;
        if (fal > 0.02) { g.globalAlpha = fdv == null ? 1 : Math.min(1, fal) * 0.85; g.fillRect(fx2, 0, 2, h); }   // after the end as a cut is drawn
      }
      g.globalAlpha = 1;
    }
    var md = S.mdrag && S.mdrag.n === n && S.mdrag.moved ? S.mdrag : null;
    if (S.pick && S.pick.n === n) {                   // HERESY 1564: the stretch in hand (1968: its edges, and where it is carried)
      var pa = tx(S.pick.a, w), pb = tx(S.pick.b, w);
      g.fillStyle = acc; g.globalAlpha = md ? 0.1 : 0.22; g.fillRect(pa, 0, pb - pa, h); g.globalAlpha = 1;
      g.fillRect(Math.round(pa), 0, 1, h); g.fillRect(Math.round(pb) - 1, 0, 1, h);
      if (md) {
        var ga = tx(Math.max(0, S.pick.a + md.dt), w), gb = ga + (pb - pa);
        g.globalAlpha = 0.3; g.fillRect(ga, 0, gb - ga, h); g.globalAlpha = 1;
        g.setLineDash([4, 3]); g.strokeStyle = acc; g.lineWidth = 1.5; g.strokeRect(Math.round(ga) + 0.5, 1, Math.max(1, Math.round(gb - ga) - 1), h - 2); g.setLineDash([]);
        if (gb - ga > 40) { g.font = "10px sans-serif"; g.fillText((md.copy ? "\u29c9 " : "\u21e2 ") + clock(Math.max(0, S.pick.a + md.dt)), ga + 4, 11); }
      }
    }
    if (S.drag && S.drag.name === n && S.drag.moved) {   // 1968: a drag selects
      var a = Math.min(S.drag.a, S.drag.b), b = Math.max(S.drag.a, S.drag.b);
      g.fillStyle = acc; g.globalAlpha = 0.22; g.fillRect(tx(a, w), 0, (b - a) / span() * w, h); g.globalAlpha = 1;
    }
    if (S.loop && S.loopOn) { g.fillStyle = "rgba(217,157,16,.08)"; g.fillRect(tx(S.loop[0], w), 0, Math.max(1, (S.loop[1] - S.loop[0]) / span() * w), h); }   // HERESY 1501
    sections().forEach(function (sc) {                // HERESY 1532: a thin line through the lane at each section's start
      var x = Math.round(tx(sc.t, w)) + 0.5;
      if (x < 0 || x > w) return;
      g.fillStyle = "rgba(" + secHue(sc.name) + ",.55)"; g.fillRect(x, 0, 1, h);
    });
    var inkS = css.getPropertyValue("--ink").trim() || "#222";
    splitsOf(n).forEach(function (t) {                // HERESY 1968: the lane's splits, a line with a notch at its top
      var x = Math.round(tx(t, w)) + 0.5;
      if (x < 0 || x > w) return;
      g.fillStyle = inkS; g.globalAlpha = 0.75; g.fillRect(x - 0.5, 0, 1, h);
      g.beginPath(); g.moveTo(x - 4, 0); g.lineTo(x + 4, 0); g.lineTo(x, 6); g.closePath(); g.fill(); g.globalAlpha = 1;
    });
    var prm = S.autoShow[n] ? autoParam(n) : "volume", au = sortedPts(n, prm), aul = expandPts(au);   // HERESY 1535: the lane's volume over time; 1559: or the knob in hand; 2318: laid out
    if (au.length || S.autoShow[n] || prm === "volume") {   // HERESY 1968: the level's line always there, faint while it is flat, to be taken
      var amber = css.getPropertyValue("--amber").trim() || "#d99d10", inkc = css.getPropertyValue("--ink").trim() || "#222";
      if (S.autoShow[n] && prm !== "volume") {        // the knob's rest, a thin line
        g.globalAlpha = 0.35; g.fillStyle = amber; g.fillRect(0, Math.round(aY(prm, AUTO_P[prm].rest, h)), w, 1); g.globalAlpha = 1;
      }
      var hov = S.lineHover === n;
      g.strokeStyle = amber; g.lineWidth = au.length || hov || S.autoShow[n] ? 1.5 : 1; g.globalAlpha = S.autoShow[n] || hov ? 1 : au.length ? 0.6 : 0.3; g.beginPath();
      for (var ax = 0; ax <= w; ax += 2) { var ay = aY(prm, aul.length ? autoDb(aul, xt(ax, w)) : AUTO_P[prm].rest, h); if (ax) g.lineTo(ax, ay); else g.moveTo(ax, ay); }
      g.stroke(); g.globalAlpha = 1;
      if (S.autoShow[n] || prm === "volume") au.forEach(function (q) {   // 1968: the level's points on every wave
        var qx = tx(q[0], w); if (qx < -6 || qx > w + 6) return;
        g.beginPath(); g.arc(qx, aY(prm, q[1], h), S.autoShow[n] || hov ? 3.5 : 3, 0, Math.PI * 2); g.fillStyle = amber; g.fill(); g.strokeStyle = inkc; g.lineWidth = 1; g.stroke();
      });
    }
  }
  function paintPlayhead() {
    var ph = $("mxPlayhead"), lanes = $("mxLanes"), c = lanes && lanes.querySelector("canvas[data-mx-wave]");
    if (!ph || !c || !S.info) return;
    var box = c.parentNode, px = tx(heard(), box.clientWidth), x = box.offsetLeft + px;   // HERESY 1501: through the view; 1531: as heard
    ph.style.left = Math.round(x) + "px";
    ph.style.height = lanes.scrollHeight + "px";       // HERESY 1965: the lanes scroll inside; the line runs down all of them
    ph.style.display = px < 0 || px > box.clientWidth ? "none" : "";
    var t = $("mxTime");
    if (t) t.textContent = clock(pos()) + " / " + clock(S.info.seconds);
    chordsFollow();                                   // HERESY 2314
  }
  function timeAt(canvas, clientX) {
    var r = canvas.getBoundingClientRect();
    return Math.min(S.info ? S.info.seconds : 0, Math.max(0, xt(clientX - r.left, r.width)));   // HERESY 1501: through the view
  }

  // ---- the sound (HERESY 1531): every lane a channel of a console, wired as the render runs it (lab/daw_mix.py): the silence drawn,
  // trim and polarity, the EQ's bands, the compressor (heresy-mixdsp.js, Plenio's), the fader, width, pan, mute and solo, the sends
  // after the pan into the room (the render's own impulse, /lab/daw/ir) and the delay (Plenio's loop, its low-pass in it); the
  // returns and every lane into the master's fader; meters on all of them
  function db(x) { return Math.pow(10, x / 20); }
  function ensureCtx() {
    if (S.ctx) return S.ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    S.ctx = new AC({ sampleRate: S.info.rate || 48000 });
    return S.ctx;
  }
  function graphKey() { return S.set + "|" + names().join(",") + "|" + (S.info.channels || 2) + "|" + subsKey(); }   // 1563: the buses' members
  function closeGraph() {
    var g = S.graph;
    S.graph = null;
    if (!g) return;
    g.dead = true;
    g.all.forEach(function (x) { try { x.disconnect(); } catch (e) { /* gone */ } });
    if (g.eng) g.eng.close();
  }
  function graph() {
    if (S.graph && S.graph.key === graphKey()) return S.graph;
    closeGraph();
    var ctx = ensureCtx(), ns = names(), ch = S.info.channels || 2, all = [];
    var node = function (x) { all.push(x); return x; }, gain = function (v) { var x = node(ctx.createGain()); x.gain.value = v == null ? 1 : v; return x; };
    var g = { key: graphKey(), all: all, lanes: {}, ch: ch };
    var subs = (S.buses.subs || []).slice();          // HERESY 1563: each bus a lane of the kernel after the strips, its meter after the master's
    g.eng = window.RuachMixDsp.make(ctx, { strips: ns.length + subs.length, meters: ns.length + 3 + subs.length, master: ns.length + 2, ch: ch });
    g.master = { input: gain(), fader: gain(), fade: gain(), eq: [], eqKey: null };   // HERESY 1544: input · EQ · the chain's node · fader, wired when the kernel is up; 1756: the fade
    // HERESY 1536: the monitor after the meters: Mono (the sides summed, mid and side by four gains as a lane's width) and Dim
    var mon = g.mon = { sp: node(ctx.createChannelSplitter(2)), mg: node(ctx.createChannelMerger(2)), w: [gain(), gain(0), gain(0), gain()], dim: gain() };
    g.master.fader.connect(g.master.fade);            // HERESY 1756: the song's fade after the fader, heard and measured as rendered
    g.mixMon = gain(); g.master.fade.connect(g.mixMon); g.mixMon.connect(mon.sp);   // HERESY 1755: the mix, or the reference in its place
    g.ref = { input: gain(), delay: node(ctx.createDelay(1)), out: gain(0) };
    g.ref.input.connect(g.ref.delay); g.ref.delay.connect(g.ref.out); g.ref.out.connect(mon.sp);
    mon.sp.connect(mon.w[0], 0); mon.sp.connect(mon.w[1], 0); mon.sp.connect(mon.w[2], 1); mon.sp.connect(mon.w[3], 1);
    mon.w[0].connect(mon.mg, 0, 0); mon.w[1].connect(mon.mg, 0, 1); mon.w[2].connect(mon.mg, 0, 0); mon.w[3].connect(mon.mg, 0, 1);
    mon.mg.connect(mon.dim); mon.dim.connect(ctx.destination);
    g.master.an = node(ctx.createAnalyser()); g.master.an.fftSize = 8192; g.master.an.smoothingTimeConstant = 0.75;
    g.master.fade.connect(g.master.an);
    g.master.sp = node(ctx.createChannelSplitter(2)); g.master.anL = node(ctx.createAnalyser()); g.master.anR = node(ctx.createAnalyser());   // HERESY 1538: the goniometer's two sides
    g.master.anL.fftSize = g.master.anR.fftSize = 2048;
    g.master.fade.connect(g.master.sp); g.master.sp.connect(g.master.anL, 0); g.master.sp.connect(g.master.anR, 1);
    var cut = function () { var x = node(ctx.createBiquadFilter()); x.type = "peaking"; x.gain.value = 0; return x; };   // HERESY 1762: a return's cut, Off a 0 dB bell
    var rv = g.rv = { input: gain(), pre: node(ctx.createDelay(0.5)), conv: null, lc: cut(), hc: cut(), ret: gain(), mute: gain() };   // 1762: input · pre-delay · convolver · cuts · return
    rv.input.connect(rv.pre); rv.lc.connect(rv.hc); rv.hc.connect(rv.ret);
    rv.ret.connect(rv.mute); rv.mute.connect(g.master.input);
    var dl = g.dl = { input: gain(), del: node(ctx.createDelay(2.0)), y: gain(), fb: gain(0), lc: cut(), hc: cut(), ret: gain(), mute: gain(), lp: null };
    dl.input.connect(dl.del); dl.del.connect(dl.y); dl.y.connect(dl.lc); dl.lc.connect(dl.hc); dl.hc.connect(dl.ret); dl.ret.connect(dl.mute); dl.mute.connect(g.master.input); dl.fb.connect(dl.del);   // 1762: the cuts after the loop
    g.subs = {};                                      // HERESY 1563: the buses: input · EQ · the kernel's compressor · fader · width · pan · mute
    subs.forEach(function (b, j) {
      var u = g.subs[b.id] = { i: ns.length + j, mi: ns.length + 3 + j, input: gain(), eq: [], eqKey: null, fader: gain(), gate: gain(), an: null, tap: null };
      u.sp = node(ctx.createChannelSplitter(2)); u.mg = node(ctx.createChannelMerger(2)); u.w = [gain(), gain(0), gain(0), gain()];
      u.fader.connect(u.sp); u.sp.connect(u.w[0], 0); u.sp.connect(u.w[1], 0); u.sp.connect(u.w[2], 1); u.sp.connect(u.w[3], 1);
      u.w[0].connect(u.mg, 0, 0); u.w[1].connect(u.mg, 0, 1); u.w[2].connect(u.mg, 0, 0); u.w[3].connect(u.mg, 0, 1);
      u.pan = node(ctx.createStereoPanner()); u.mg.connect(u.pan); u.pan.connect(u.gate); u.gate.connect(g.master.input);
    });
    ns.forEach(function (n, i) {
      var l = g.lanes[n] = { i: i, range: gain(), trim: gain(), eq: [], eqKey: null, fader: gain(), auto: gain(), gate: gain(), rv: gain(0), dl: gain(0), an: null, tap: null };
      l.range.connect(l.trim);
      if (ch > 1) {                                  // width: mid and side by four gains; then the stereo panner the render's law copies
        l.sp = node(ctx.createChannelSplitter(2)); l.mg = node(ctx.createChannelMerger(2));
        l.w = [gain(), gain(0), gain(0), gain()];   // L→L, L→R, R→L, R→R
        l.fader.connect(l.auto); l.auto.connect(l.sp);   // HERESY 1535: the volume drawn over time, after the fader
        l.sp.connect(l.w[0], 0); l.sp.connect(l.w[1], 0); l.sp.connect(l.w[2], 1); l.sp.connect(l.w[3], 1);
        l.w[0].connect(l.mg, 0, 0); l.w[1].connect(l.mg, 0, 1); l.w[2].connect(l.mg, 0, 0); l.w[3].connect(l.mg, 0, 1);
        l.pan = node(ctx.createStereoPanner());
        l.mg.connect(l.pan); l.pan.connect(l.gate);
      } else { l.fader.connect(l.auto); l.auto.connect(l.gate); }
      var into = subOfStrip(n);                      // HERESY 1563: a member's strip into its bus, its sends from the strip
      l.gate.connect(into && g.subs[into.id] ? g.subs[into.id].input : g.master.input); l.gate.connect(l.rv); l.gate.connect(l.dl);
      l.rv.connect(rv.input); l.dl.connect(dl.input);
    });
    g.ready = g.eng.ready.then(function () {
      if (g.dead) return g;
      ns.forEach(function (n, i) {
        var l = g.lanes[n];
        g.eng.compOuts[i].connect(l.fader);
        l.gate.connect(g.eng.meterIns[i]);
      });
      subs.forEach(function (b) { var u = g.subs[b.id]; g.eng.compOuts[u.i].connect(u.fader); u.gate.connect(g.eng.meterIns[u.mi]); });   // HERESY 1563
      rv.mute.connect(g.eng.meterIns[ns.length]); dl.mute.connect(g.eng.meterIns[ns.length + 1]); g.master.fade.connect(g.eng.meterIns[ns.length + 2]);
      g.eng.masterOut.connect(g.master.fader);       // HERESY 1544
      g.on = true;
      applyBuses(g);
      ns.forEach(function (n) { applyStrip(g, n); });
      subs.forEach(function (b) { applySub(g, b.id); });   // HERESY 1563
      return g;
    });
    S.graph = g;
    applyBuses(g);
    applyMon(g);                                      // HERESY 1536
    applyRef(g);                                      // HERESY 1755
    return g;
  }
  var BQ = { peak: "peaking", low_shelf: "lowshelf", high_shelf: "highshelf", highpass: "highpass", lowpass: "lowpass", notch: "notch" };
  function liveBands(s) { return s.eq && s.eq.on ? s.eq.bands.filter(function (b) { return b.enabled !== false && BQ[b.type]; }) : []; }
  function setBand(q, b, now) {                     // the render's RBJ band as the browser's biquad: its cuts take their Q in dB
    var t = S.ctx.currentTime, put = function (p, v) { if (now) p.value = v; else p.setTargetAtTime(v, t, 0.008); };
    put(q.frequency, +b.frequency_hz);
    put(q.gain, +b.gain_db || 0);
    put(q.Q, b.type === "highpass" || b.type === "lowpass" ? 20 * Math.log10(+b.q) : +b.q);
  }
  function wireEq(g, n) {
    var l = g.lanes[n], s = strip(n), bands = liveBands(s), key = bands.map(function (b) { return b.type; }).join(",");
    if (!g.on || !g.eng.compIns[l.i]) return;
    if (l.eqKey === key) { bands.forEach(function (b, k) { setBand(l.eq[k], b); }); return; }
    try { l.trim.disconnect(); } catch (e) { /* not yet */ }
    l.eq.forEach(function (x) { try { x.disconnect(); } catch (e) { /* gone */ } });
    l.eq = bands.map(function (b) { var q = S.ctx.createBiquadFilter(); q.type = BQ[b.type]; g.all.push(q); setBand(q, b, true); return q; });
    var at = l.trim;
    l.eq.forEach(function (q) { at.connect(q); at = q; });
    at.connect(g.eng.compIns[l.i]);
    if (l.an) at.connect(l.an);
    l.tap = at; l.eqKey = key;
  }
  function wireSubEq(g, id) {                       // HERESY 1563: a bus's bands before its compressor, as a lane's
    var u = g.subs[id], bands = liveBands(subStrip(id)), key = bands.map(function (b) { return b.type; }).join(",");
    if (!g.on || !g.eng.compIns[u.i]) return;
    if (u.eqKey === key) { bands.forEach(function (b, k) { setBand(u.eq[k], b); }); return; }
    try { u.input.disconnect(); } catch (e) { /* not yet */ }
    u.eq.forEach(function (x) { try { x.disconnect(); } catch (e) { /* gone */ } });
    u.eq = bands.map(function (b) { var q = S.ctx.createBiquadFilter(); q.type = BQ[b.type]; g.all.push(q); setBand(q, b, true); return q; });
    var at = u.input;
    u.eq.forEach(function (q) { at.connect(q); at = q; });
    at.connect(g.eng.compIns[u.i]);
    if (u.an) at.connect(u.an);
    u.tap = at; u.eqKey = key;
  }
  function applySub(g, id) {
    var u = g && g.subs && g.subs[id], b = subOf(id);
    if (!u || !b || !S.ctx) return;
    var s = subStrip(id), t = S.ctx.currentTime, k = 0.01, a = (1 + s.width) / 2, c = (1 - s.width) / 2;
    u.fader.gain.setTargetAtTime(db(s.gain_db), t, k);
    u.w[0].gain.setTargetAtTime(a, t, k); u.w[3].gain.setTargetAtTime(a, t, k); u.w[1].gain.setTargetAtTime(c, t, k); u.w[2].gain.setTargetAtTime(c, t, k);
    u.pan.pan.setTargetAtTime(s.pan, t, k);
    u.gate.gain.setTargetAtTime(s.mute ? 0 : 1, t, k);
    if (!g.on) return;
    g.eng.setComp(u.i, s.comp && s.comp.on ? Object.assign({}, s.comp, { keyIndex: -1 }) : { on: false });
    wireSubEq(g, id);
  }
  function wireMasterEq(g) {                         // HERESY 1544: the master's bands before its chain, as a lane's before its compressor
    var mm = g.master, ms = masterStrip(), bands = liveBands(ms), mOn = !!((ms.comp && ms.comp.on) || (ms.limit && ms.limit.on)), key = bands.map(function (b) { return b.type; }).join(",") + "|" + mOn;
    g.mOn = mOn;
    if (!g.on || !g.eng.masterIn) return;
    if (mm.eqKey === key) { bands.forEach(function (b, k) { setBand(mm.eq[k], b); }); return; }
    try { mm.input.disconnect(); } catch (e) { /* not yet */ }
    mm.eq.forEach(function (x) { try { x.disconnect(); } catch (e) { /* gone */ } });
    mm.eq = bands.map(function (b) { var q = S.ctx.createBiquadFilter(); q.type = BQ[b.type]; g.all.push(q); setBand(q, b, true); return q; });
    var at = mm.input;
    mm.eq.forEach(function (q) { at.connect(q); at = q; });
    at.connect(g.mOn ? g.eng.masterIn : mm.fader);   // the chain's node only while it has work
    mm.tail = at; mm.eqKey = key;
  }
  // HERESY 1535: a lane's volume over time: linear in dB between its points, the first's level before them, the last's after
  function autoPts(n) { return strip(n).auto.slice().sort(function (a, b) { return a[0] - b[0]; }); }
  // HERESY 1559: what else a lane draws over time, as the render's «autos»: each in place of its knob while it has points
  var AUTO_P = { volume: { short: "Vol", lo: -60, hi: 12, rest: 0 }, pan: { short: "L–R", lo: -1, hi: 1, rest: 0 }, width: { short: "Wid", lo: 0, hi: 2, rest: 1 },
                 reverb: { short: "Rm", lo: 0, hi: 1, rest: 0 }, delay: { short: "Dly", lo: 0, hi: 1, rest: 0 } };
  function autoParam(n) { return AUTO_P[S.autoParam[n]] ? S.autoParam[n] : "volume"; }
  function rawPts(n, prm, make) {                   // the knob's own list (the volume's «auto»), made when asked and missing
    var s = S.strips[n] || (S.strips[n] = {});
    if (prm === "volume") { if (!Array.isArray(s.auto)) { if (!make) return []; s.auto = []; } return s.auto; }
    if (!s.autos || typeof s.autos !== "object" || Array.isArray(s.autos)) { if (!make) return []; s.autos = {}; }
    if (!Array.isArray(s.autos[prm])) { if (!make) return []; s.autos[prm] = []; }
    return s.autos[prm];
  }
  function sortedPts(n, prm) { return rawPts(n, prm).slice().sort(function (a, b) { return a[0] - b[0]; }); }
  function drawn(n, prm) { return rawPts(n, prm).length > 0; }
  function hasAuto(n) { return Object.keys(AUTO_P).some(function (k2) { return drawn(n, k2); }); }
  function knobLine(params, pts, f, from, now, at) {   // a knob's params along its line: linear between the points, as the render
    params.forEach(function (p) {
      p.cancelScheduledValues(0);
      p.setValueAtTime(f(autoDb(pts, from)), now);
      if (!S.playing) return;
      p.setValueAtTime(f(autoDb(pts, from)), at);
      pts.forEach(function (q) { if (q[0] > from) p.linearRampToValueAtTime(f(q[1]), S.startCtx + (q[0] - S.startAt)); });
    });
  }
  function knobsSchedule(n) {
    var l = S.graph && S.graph.lanes[n];
    if (!l || !S.ctx) return;
    var now = S.ctx.currentTime, from = S.playing ? Math.max(S.startAt, pos()) : S.at, at = S.playing ? Math.max(now, S.startCtx + (from - S.startAt)) : now;
    var s = strip(n), still = function (params, v) { params.forEach(function (p) { p.cancelScheduledValues(0); p.setValueAtTime(v, now); }); };   // a line taken away: the knob's own value
    if (l.pan) { if (drawn(n, "pan")) knobLine([l.pan.pan], linePts(n, "pan"), function (v) { return v; }, from, now, at); else if (l.panLine) still([l.pan.pan], s.pan); }   // 2318: laid out
    if (l.w) {
      if (drawn(n, "width")) {
        var wp = linePts(n, "width");
        knobLine([l.w[0].gain, l.w[3].gain], wp, function (v) { return (1 + v) / 2; }, from, now, at);
        knobLine([l.w[1].gain, l.w[2].gain], wp, function (v) { return (1 - v) / 2; }, from, now, at);
      } else if (l.wLine) { still([l.w[0].gain, l.w[3].gain], (1 + s.width) / 2); still([l.w[1].gain, l.w[2].gain], (1 - s.width) / 2); }
    }
    if (drawn(n, "reverb")) knobLine([l.rv.gain], linePts(n, "reverb"), function (v) { return v; }, from, now, at); else if (l.rvLine) still([l.rv.gain], s.reverb);
    if (drawn(n, "delay")) knobLine([l.dl.gain], linePts(n, "delay"), function (v) { return v; }, from, now, at); else if (l.dlLine) still([l.dl.gain], s.delay);
    l.panLine = drawn(n, "pan"); l.wLine = drawn(n, "width"); l.rvLine = drawn(n, "reverb"); l.dlLine = drawn(n, "delay");   // what had a line, to give its value back once
  }
  function autoDb(pts, t) {
    if (!pts.length) return 0;
    if (t <= pts[0][0]) return pts[0][1];
    for (var i = 1; i < pts.length; i++) if (t <= pts[i][0]) { var a = pts[i - 1], b = pts[i]; return a[1] + (t - a[0]) / Math.max(1e-9, b[0] - a[0]) * (b[1] - a[1]); }
    return pts[pts.length - 1][1];
  }
  function autoSchedule(n) {                         // the gain's own ramps: exponential in gain is linear in dB, as the render draws it
    var l = S.graph && S.graph.lanes[n];
    if (!l || !S.ctx) return;
    knobsSchedule(n);                                 // HERESY 1559: and the other knobs' lines
    var p = l.auto.gain, now = S.ctx.currentTime, pts = expandPts(autoPts(n));   // HERESY 2318: its shapes laid out as the render lays them
    p.cancelScheduledValues(0);
    if (!pts.length) { p.setValueAtTime(1, now); return; }
    var from = S.playing ? Math.max(S.startAt, pos()) : S.at;
    p.setValueAtTime(db(autoDb(pts, from)), now);
    if (!S.playing) return;
    var at = Math.max(now, S.startCtx + (from - S.startAt));
    p.setValueAtTime(db(autoDb(pts, from)), at);
    pts.forEach(function (q) { if (q[0] > from) p.exponentialRampToValueAtTime(db(q[1]), S.startCtx + (q[0] - S.startAt)); });
  }
  function applyStrip(g, n) {
    var l = g && g.lanes[n];
    if (!l || !S.ctx) return;
    var s = strip(n), t = S.ctx.currentTime, k = 0.01;
    l.trim.gain.setTargetAtTime(db(s.trim_db) * (s.invert ? -1 : 1), t, k);
    l.fader.gain.setTargetAtTime(db(s.gain_db + vcaDb(n)), t, k);   // HERESY 1543: as its VCAs move it
    if (l.w && !drawn(n, "width")) {                  // HERESY 1559: a knob drawn plays its line (knobsSchedule), not its value
      var a = (1 + s.width) / 2, b = (1 - s.width) / 2;
      var cm = { st: [1, 0, 0, 1], l: [1, 1, 0, 0], r: [0, 0, 1, 1], m: [0.5, 0.5, 0.5, 0.5] }[s.chan];   // HERESY 1989: the channel, then the width
      l.w[0].gain.setTargetAtTime(cm[0] * a + cm[1] * b, t, k); l.w[1].gain.setTargetAtTime(cm[0] * b + cm[1] * a, t, k);
      l.w[2].gain.setTargetAtTime(cm[2] * a + cm[3] * b, t, k); l.w[3].gain.setTargetAtTime(cm[2] * b + cm[3] * a, t, k);
    }
    if (l.pan && !drawn(n, "pan")) l.pan.pan.setTargetAtTime(s.pan, t, k);
    l.gate.gain.setTargetAtTime(audible(n) ? 1 : 0, t, k);
    if (!drawn(n, "reverb")) l.rv.gain.setTargetAtTime(s.reverb, t, k);
    if (!drawn(n, "delay")) l.dl.gain.setTargetAtTime(s.delay, t, k);
    g.eng.setComp(l.i, Object.assign(s.comp && s.comp.on ? Object.assign({}, s.comp, { keyIndex: s.comp.key && s.comp.key !== n ? names().indexOf(s.comp.key) : -1 }) : { on: false },
      { gate: s.gate && s.gate.on ? s.gate : null }));   // 1537; HERESY 1760: and its gate
    wireEq(g, n);
    if (g === S.graph) knobsSchedule(n);              // HERESY 1559: the drawn knobs' lines again (an undo, a set, a version)
  }
  function applyMon(g) {                             // HERESY 1536
    if (!g || !g.mon || !S.ctx) return;
    var t = S.ctx.currentTime, a = S.mon.mono ? 0.5 : 1, b = S.mon.mono ? 0.5 : 0;
    g.mon.w[0].gain.setTargetAtTime(a, t, 0.01); g.mon.w[3].gain.setTargetAtTime(a, t, 0.01); g.mon.w[1].gain.setTargetAtTime(b, t, 0.01); g.mon.w[2].gain.setTargetAtTime(b, t, 0.01);
    g.mon.dim.gain.setTargetAtTime(S.mon.dim ? 0.1 : 1, t, 0.01);
  }
  var IRS = {};
  function setCut(q, type, hz, rate) {               // HERESY 1762: the render's RBJ band at Q 1/√2 (in dB, as the EQ's cuts); Off, a 0 dB bell
    var on = type === "highpass" ? +hz > 20 : +hz < 20000, t = S.ctx.currentTime;
    q.type = on ? type : "peaking";
    q.frequency.setValueAtTime(on ? Math.min(+hz, 0.45 * rate) : 1000, t); q.gain.setValueAtTime(0, t); q.Q.setValueAtTime(on ? 20 * Math.log10(Math.SQRT1_2) : 1, t);
  }
  function applyBuses(g) {
    if (!g || !S.ctx) return;
    var b = S.buses, ctx = S.ctx, t = ctx.currentTime, k = 0.01, rate = ctx.sampleRate, rv = g.rv, d = g.dl;
    rv.ret.gain.setTargetAtTime(db(b.reverb.return_db), t, k); rv.mute.gain.setTargetAtTime(b.reverb.mute ? 0 : 1, t, k);
    rv.pre.delayTime.setValueAtTime(Math.round((+b.reverb.predelay_ms || 0) * rate / 1000) / rate, t);   // HERESY 1762: whole samples, as the render shifts the send
    setCut(rv.lc, "highpass", b.reverb.lowcut_hz, rate); setCut(rv.hc, "lowpass", b.reverb.highcut_hz, rate);
    setCut(d.lc, "highpass", b.delay.lowcut_hz, rate); setCut(d.hc, "lowpass", b.delay.highcut_hz, rate);
    if (g.rvPreset !== b.reverb.preset) {
      var preset = g.rvPreset = b.reverb.preset, key = preset + "|" + rate;
      var got = IRS[key] || (IRS[key] = fetch("/lab/daw/ir?" + q({ preset: preset, rate: rate }))
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
        .then(function (buf) { return ctx.decodeAudioData(buf); }));
      got.then(function (ir) {
        if (g.dead || g.rvPreset !== preset) return;
        var conv = ctx.createConvolver();              // a new convolver for a new room: the render's impulse, not normalised
        conv.normalize = false; conv.buffer = ir; g.all.push(conv);
        rv.pre.connect(conv); conv.connect(rv.lc);      // HERESY 1762: after its pre-delay, into its cuts
        if (rv.conv) { try { rv.pre.disconnect(rv.conv); rv.conv.disconnect(); } catch (e) { /* gone */ } }
        rv.conv = conv;
        emit("change", { bus: "reverb" });
      }).catch(function () { delete IRS[key]; say(tr("The room's impulse did not come from the lab: the room is silent here, the mix on Forge has it"), true); });
    }
    d.del.delayTime.setValueAtTime(Math.round(b.delay.time_ms * rate / 1000) / rate, t);   // whole samples, as the render rounds them
    d.fb.gain.setTargetAtTime(b.delay.feedback, t, k);
    d.ret.gain.setTargetAtTime(db(b.delay.return_db), t, k); d.mute.gain.setTargetAtTime(b.delay.mute ? 0 : 1, t, k);
    if (g.dlLp !== b.delay.lowpass_hz) {               // the loop's one-pole low-pass, Plenio's coefficients
      g.dlLp = b.delay.lowpass_hz;
      var a = Math.min(Math.exp(-2 * Math.PI * b.delay.lowpass_hz / rate), 0.9995), lp = ctx.createIIRFilter([1 - a], [1, -a]);
      g.all.push(lp);
      if (d.lp) { try { d.y.disconnect(d.lp); d.lp.disconnect(); } catch (e) { /* gone */ } }
      d.y.connect(lp); lp.connect(d.fb); d.lp = lp;
    }
    g.master.fader.gain.setTargetAtTime(db(b.master.gain_db), t, k);
    var ms = masterStrip();                            // HERESY 1544: the chain as it is set
    if (g.eng && g.eng.setMaster) g.eng.setMaster({ comp: ms.comp && ms.comp.on ? ms.comp : { on: false }, limit: ms.limit && ms.limit.on ? ms.limit : { on: false } });
    wireMasterEq(g);
    (S.buses.subs || []).forEach(function (sb) { applySub(g, sb.id); });   // HERESY 1563
    fadeSchedule(g);                                  // HERESY 1756
  }
  function liveGains() {
    var g = S.graph;
    if (!g || !S.ctx) return;
    names().forEach(function (n) { var l = g.lanes[n]; if (l) l.gate.gain.setTargetAtTime(audible(n) ? 1 : 0, S.ctx.currentTime, 0.01); });
  }
  function analyser(n) {                             // a strip's sound after its EQ (n "*": the master), for the devices' spectrum
    var g = S.graph;
    if (!g) return null;
    if (n === "*") return g.master.an;
    if (n === "*L" || n === "*R") return n === "*L" ? g.master.anL : g.master.anR;   // HERESY 1538
    if (n.charAt(0) === "%") {                         // HERESY 1563: a bus's sound after its EQ
      var u = g.subs && g.subs[n.slice(1)];
      if (!u) return null;
      if (!u.an) { u.an = S.ctx.createAnalyser(); u.an.fftSize = 8192; u.an.smoothingTimeConstant = 0.75; g.all.push(u.an); if (u.tap) u.tap.connect(u.an); }
      return u.an;
    }
    var l = g.lanes[n];
    if (!l) return null;
    if (!l.an) { l.an = S.ctx.createAnalyser(); l.an.fftSize = 8192; l.an.smoothingTimeConstant = 0.75; g.all.push(l.an); if (l.tap) l.tap.connect(l.an); }
    return l.an;
  }
  function pos() { return S.playing && S.ctx ? Math.min(S.info.seconds, Math.max(S.startAt, S.startAt + (S.ctx.currentTime - S.startCtx))) : S.at; }
  function latency(g) { return g && g.eng ? g.eng.latency + (g.mOn ? g.eng.masterLatency || 0 : 0) : 0; }   // HERESY 1544: with the master's node when it is in
  function heard() { var g = S.graph; return S.playing && g && g.eng ? Math.max(S.startAt, pos() - latency(g)) : pos(); }   // HERESY 1531: as it reaches the ears
  function stop(keepAt) {
    if (S.playing && keepAt !== false) S.at = pos();
    S.playing = false;
    S.token++;
    clearTimeout(S.timer); cancelAnimationFrame(S.raf);
    S.srcs.forEach(function (s) { try { s.stop(); } catch (e) { /* not started */ } });
    S.srcs = [];
    paintHead(); paintPlayhead();
    if (S.graph) { S.fall = performance.now() + 1500; fallMeters(); }   // HERESY 1531: the meters fall back to rest
  }
  function play(from) {
    if (!S.info) return;
    stop(false);
    var ctx = ensureCtx();
    if (ctx.state === "suspended") ctx.resume();
    if (window.ruachOneSound) window.ruachOneSound();   // HERESY 1476: one sound at a time
    S.at = Math.max(0, Math.min(S.info.seconds - 0.05, from == null ? S.at : from));
    S.playing = true;
    S.startAt = S.at;
    S.startCtx = ctx.currentTime + 5;                  // HERESY 1531: set again once the console's banks are ready
    var token = S.token, g = graph();
    S.loud = loudReset();
    g.ready.then(function () {
      if (token !== S.token) return;
      S.startCtx = ctx.currentTime + LEAD + 0.25;    // the first stretches arrive and decode
      schedule(Math.floor(S.startAt / CHUNK), token);
      names().forEach(autoSchedule);                 // HERESY 1535
      fadeSchedule(g); applyRef(g);                   // HERESY 1756; 1755
    });
    var tick = function () {
      if (token !== S.token) return;
      paintPlayhead();
      meters();                                       // HERESY 1501
      if (S.loopOn && S.loop && S.at < S.loop[1] && pos() >= S.loop[1]) { play(S.loop[0]); return; }   // the loop played round
      if (S.view.zoom > 1 && (pos() > S.view.t0 + span() * 0.97 || pos() < S.view.t0)) { S.view.t0 = pos() - span() * 0.05; clampView(); redrawAll(); }   // the view follows
      if (pos() >= S.info.seconds - 0.01) { S.at = 0; stop(false); return; }
      S.raf = requestAnimationFrame(tick);
    };
    S.raf = requestAnimationFrame(tick);
    paintHead();
  }
  // HERESY 1564: each laid stretch over this chunk, from its source, through its own crossfade, past the lane's cuts
  function laid(n, l, at, token) {
    var ctx = S.ctx, toCtx = function (t) { return S.startCtx + (t - S.startAt); }, end = S.info.seconds;
    strip(n).edits.forEach(function (e2) {
      var d0 = e2.to, d1 = Math.min(end, e2.to + (e2.b - e2.a)), s0 = Math.max(d0, at, S.startAt), s1 = Math.min(d1, at + CHUNK);
      if (s1 - s0 < 0.005) return;
      fetch("/lab/daw/chunk?" + q({ name: S.take.name, set: S.set, strip: n, path: versionOf(n), start: Math.max(0, e2.a + (s0 - d0) - (strip(n).offset_s || 0)), seconds: s1 - s0 }))   // HERESY 1989
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
        .then(function (buf) { return ctx.decodeAudioData(buf); })
        .then(function (b) {
          if (token !== S.token || !S.graph || S.graph.lanes[n] !== l) return;
          var now = ctx.currentTime + 0.02, start = toCtx(s0), late = Math.max(0, now - start);
          if (late >= b.duration) return;
          var src = ctx.createBufferSource(), eg = ctx.createGain();
          src.buffer = b; S.graph.all.push(eg); src.connect(eg); eg.connect(l.trim);
          var g = eg.gain, r0 = toCtx(d0), f0 = toCtx(d1 - EDGE);
          g.setValueAtTime(s0 < d0 + EDGE ? 0 : 1, Math.max(now, start + late));
          if (s0 < d0 + EDGE && r0 + EDGE > now) g.setValueCurveAtTime(curveOf(false, Math.max(0, (now - r0) / EDGE), Math.min(EDGE, r0 + EDGE - Math.max(now, r0))), Math.max(now, r0), Math.min(EDGE, r0 + EDGE - Math.max(now, r0)));
          else g.setValueAtTime(1, Math.max(now, start + late));
          if (s1 > d1 - EDGE && f0 > now) g.setValueCurveAtTime(curveOf(true, 0, EDGE), f0, EDGE);
          src.start(start + late, late);
          S.srcs.push(src);
        }).catch(function () { /* the stretch unheard; the render has it */ });
    });
  }
  function fetchChunk(n, k) {
    if (n === SOURCE && S.ref.spec) return fetch("/lab/daw/ref/chunk?" + q({ spec: S.ref.spec, start: k * CHUNK, seconds: CHUNK }))   // HERESY 2315: a reference of any take or yours
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
      .then(function (buf) { return S.ctx.decodeAudioData(buf); });
    return fetch("/lab/daw/chunk?" + q({ name: S.take.name, set: S.set, strip: n, path: n === SOURCE ? "" : versionOf(n), start: k * CHUNK, seconds: CHUNK }))   // 1755
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
      .then(function (buf) { return S.ctx.decodeAudioData(buf); });
  }
  function schedule(k, token) {
    if (token !== S.token || k * CHUNK >= S.info.seconds) return;
    var at = k * CHUNK, ns = names();
    // HERESY 1989: a lane shifted: its chunk asked from where its sound is at this second (silence before its start), placed by `lag`
    var lag = {}, asks = ns.map(function (n) {
      var o = strip(n).offset_s || 0, from = at - o;
      if (!o) return fetchChunk(n, k).catch(function () { return null; });
      if (from + CHUNK <= 0) return Promise.resolve(null);
      lag[n] = Math.max(0, -from);
      return fetch("/lab/daw/chunk?" + q({ name: S.take.name, set: S.set, strip: n, path: n === SOURCE ? "" : versionOf(n), start: Math.max(0, from), seconds: CHUNK - lag[n] }))
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
        .then(function (buf) { return S.ctx.decodeAudioData(buf); }).catch(function () { return null; });
    });
    if (S.ref.armed) asks.push(fetchChunk(SOURCE, k).catch(function () { return null; }));   // HERESY 1755: the reference beside the lanes
    Promise.all(asks).then(function (bufs) {
      if (token !== S.token) return;
      var ctx = S.ctx, when = S.startCtx + (at - S.startAt), now = ctx.currentTime + 0.02;
      bufs.forEach(function (b, i) {
        var l = S.graph && S.graph.lanes[ns[i]];
        if (!b || !l) return;
        var n = ns[i], src = ctx.createBufferSource(), a0 = at + (lag[n] || 0), skip = Math.max(0, S.startAt - a0);   // HERESY 1989: its own start
        src.buffer = b;
        src.connect(l.range);
        var start = S.startCtx + (a0 - S.startAt) + skip, late = Math.max(0, now - start);
        if (skip + late < b.duration) { src.start(start + late, skip + late); S.srcs.push(src); }
        ranges(n, l, at, at + CHUNK);
        laid(n, l, at, token);                        // HERESY 1564
      });
      var rb = S.ref.armed ? bufs[ns.length] : null, rl = S.graph && S.graph.ref;   // HERESY 1755: the reference, on the lanes' clock
      if (rb && rl) {
        var rs = ctx.createBufferSource(), rskip = Math.max(0, S.startAt - at), rst = when + rskip, rlate = Math.max(0, now - rst);
        rs.buffer = rb; rs.connect(rl.input);
        if (rskip + rlate < rb.duration) { rs.start(rst + rlate, rskip + rlate); S.srcs.push(rs); }
      }
      if (S.srcs.length > 64) S.srcs = S.srcs.slice(-32);
      var next = S.startCtx + (at + CHUNK - S.startAt) - ctx.currentTime - 3;   // the next stretch three seconds before it is due
      S.timer = setTimeout(function () { schedule(k + 1, token); }, Math.max(0, next * 1000));
    });
  }
  // the silence drawn on a lane, on the clock; HERESY 1531: its edges as the render's, raised cosines inside the stretch; 1542: of
  // each stretch's own lengths, a stretch begun mid-edge picked up where it is
  function curveOf(falling, u0, secs) {              // the raised cosine from its phase u0 to its end, a point every 5 ms (at least 33)
    var k = Math.max(33, Math.min(2049, Math.ceil(secs / 0.005) + 1)), out = new Float32Array(k);
    for (var i = 0; i < k; i++) { var u = u0 + (1 - u0) * i / (k - 1), c = 0.5 * Math.cos(Math.PI * u); out[i] = falling ? 0.5 + c : 0.5 - c; }
    return out;
  }
  function ranges(n, l, a, b) {
    var ctx = S.ctx, toCtx = function (t) { return S.startCtx + (t - S.startAt); }, g = l.range.gain, from = Math.max(ctx.currentTime + 0.005, toCtx(a));
    g.cancelScheduledValues(from);
    var at = from - S.startCtx + S.startAt, cuts = liveCuts(n);   // 1564: with what the laid stretches silence
    g.setValueAtTime(cutEnv(cuts, at), from);
    cuts.forEach(function (r) {
      if (r[1] <= a || r[0] >= b + CHUNK) return;
      var f = fitFades(r), s = toCtx(r[0]), e = toCtx(r[1]), fe = s + f[0], rs = Math.max(fe, e - f[1]);
      if (e <= from) return;
      if (f[0] > 0 && fe > from + 0.001) {            // the fall
        if (s >= from) g.setValueCurveAtTime(curveOf(true, 0, f[0]), s, f[0]);
        else g.setValueCurveAtTime(curveOf(true, (from - s) / f[0], fe - from), from, fe - from);
      } else if (s >= from) g.setValueAtTime(0, s);
      if (f[1] > 0 && e > from + 0.001) {             // the rise
        if (rs >= from) g.setValueCurveAtTime(curveOf(false, 0, e - rs), rs, e - rs);
        else g.setValueCurveAtTime(curveOf(false, (from - rs) / (e - rs), e - from), from, e - from);
      } else g.setValueAtTime(1, Math.max(e, from));
    });
  }
  // HERESY 1501: the meters; 1531: from the console's meter bank (heresy-mixdsp.js): every strip's peak and RMS after its pan, the
  // compressor's reduction, the returns, the master's loudness (momentary, short-term, integrated since play), true peak, correlation
  var TAPER = [[-60, 0], [-40, 0.12], [-30, 0.22], [-20, 0.36], [-10, 0.55], [-5, 0.67], [0, 0.78], [6, 0.89], [12, 1]];
  function taper(d) {                                 // dB to a fader's or a meter's height, 0…1: the same scale for both
    if (!(d > -60)) return 0;
    for (var i = 1; i < TAPER.length; i++) if (d <= TAPER[i][0]) { var a = TAPER[i - 1], b = TAPER[i]; return a[1] + (d - a[0]) / (b[0] - a[0]) * (b[1] - a[1]); }
    return 1;
  }
  function untaper(p) {
    if (p <= 0) return -60;
    for (var i = 1; i < TAPER.length; i++) if (p <= TAPER[i][1]) { var a = TAPER[i - 1], b = TAPER[i]; return a[0] + (p - a[1]) / (b[1] - a[1]) * (b[0] - a[0]); }
    return 12;
  }
  function loudReset() { return { z: [], win: [], tp: 0, max: -150, corr: 1, m: null, s: null, i: null, n: 0, st: [], lra: null }; }   // HERESY 1763: st, lra
  function lufs(p) { return p > 0 ? -0.691 + 10 * Math.log10(p) : null; }
  function lra(st) {                                 // HERESY 1763: EBU Tech 3342 as Plenio has it: −70 LUFS, then 20 LU under the mean of what passed; the 95th less the 10th percentile
    var abs = st.filter(function (p) { var l = lufs(p); return l != null && l > -70; });
    if (!abs.length) return null;
    var rel = lufs(abs.reduce(function (x, y) { return x + y; }, 0) / abs.length) - 20;
    var g = abs.map(lufs).filter(function (l) { return l > rel; }).sort(function (a, b) { return a - b; });
    if (g.length < 2) return 0;
    var pc = function (q) { var x = q / 100 * (g.length - 1), i = Math.floor(x); return i + 1 < g.length ? g[i] + (x - i) * (g[i + 1] - g[i]) : g[i]; };   // numpy's linear
    return pc(95) - pc(10);
  }
  function loudness(t) {
    var L = S.loud || (S.loud = loudReset());
    if (!t || !t.n) return;
    (t.blocks || []).forEach(function (z) {
      L.z.push(z);
      var k = L.z.length;
      if (k >= 4) L.win.push((L.z[k - 1] + L.z[k - 2] + L.z[k - 3] + L.z[k - 4]) / 4);   // 400 ms, a new one every 100 ms
      if (k >= 30) { var s3 = 0; for (var j = k - 30; j < k; j++) s3 += L.z[j]; L.st.push(s3 / 30); }   // HERESY 1763: 3 s, a new one every 100 ms, for the LRA
    });
    if (L.z.length > 400) L.z.splice(0, L.z.length - 400);
    L.tp = Math.max(L.tp, t.tp || 0);
    var k2 = L.z.length;
    L.m = k2 >= 4 ? lufs(L.win[L.win.length - 1]) : null;
    if (k2 >= 30) { var sum = 0; for (var i = k2 - 30; i < k2; i++) sum += L.z[i]; L.s = lufs(sum / 30); } else L.s = null;
    if (++L.n % 10 === 0 || L.i == null) {          // integrated: gated at −70 LUFS, then 10 LU under the mean of what passed
      var abs = L.win.filter(function (w) { var l = lufs(w); return l != null && l > -70; });   // HERESY 1755: null (digital silence) is not above the gate
      if (abs.length) {
        var mean = abs.reduce(function (x, y) { return x + y; }, 0) / abs.length, rel = lufs(mean) - 10;
        var gated = abs.filter(function (w) { return lufs(w) > rel; });
        L.i = gated.length ? lufs(gated.reduce(function (x, y) { return x + y; }, 0) / gated.length) : null;
      }
      L.lra = lra(L.st);                              // HERESY 1763
    }
    var c = t.ss[0] > 1e-12 && t.ss[1] > 1e-12 ? t.xy / Math.sqrt(t.ss[0] * t.ss[1]) : 1;
    L.corr += (c - L.corr) * 0.2;
  }
  function level(key, t, gr, now) {
    var v = S.lv[key] || (S.lv[key] = { pk: [-150, -150], rms: [-150, -150], hold: [-150, -150], holdAt: [0, 0], max: -150, clip: false, gr: 0, t: 0 });
    var dt = v.t ? Math.min(0.25, (now - v.t) / 1000) : 0.016;
    v.t = now;
    for (var c = 0; c < 2; c++) {
      var has = t && t.n, p = has ? 20 * Math.log10(t.pk[c] + 1e-12) : -150;
      v.pk[c] = p >= v.pk[c] ? p : Math.max(p, v.pk[c] - 26 * dt);   // falls 26 dB a second
      if (has) { var r = 10 * Math.log10(t.ss[c] / t.n + 1e-24); v.rms[c] += (r - v.rms[c]) * (1 - Math.exp(-dt / 0.3)); }
      else v.rms[c] = Math.max(-150, v.rms[c] - 26 * dt);
      if (p >= v.hold[c] || now - v.holdAt[c] > 1600) { v.hold[c] = Math.max(p, v.pk[c]); v.holdAt[c] = now; }
      if (p > v.max) v.max = p;
      if (p > -0.001) v.clip = true;
    }
    var g = gr || 0;
    v.gr = g >= v.gr ? g : Math.max(g, v.gr - 20 * dt);
    return v;
  }
  function meters() {
    var g = S.graph;
    if (!g || !g.eng || !g.on) return;
    var rd = g.eng.read(), ns = names(), now = performance.now();
    ns.forEach(function (n, i) { level(n, rd.m[i], rd.gr[i], now); });
    ns.forEach(function (n, i) { var v = S.lv[n], gg = (rd.gg && rd.gg[i]) || 0; if (v) v.gg = gg >= (v.gg || 0) ? gg : Math.max(gg, (v.gg || 0) - 0.4); });   // HERESY 1760: the gates' reduction, falling back
    level("~room", rd.m[ns.length], 0, now); level("~delay", rd.m[ns.length + 1], 0, now);
    (S.buses.subs || []).forEach(function (b, j) { if (g.subs && g.subs[b.id]) level("%" + b.id, rd.m[ns.length + 3 + j], rd.gr[ns.length + j], now); });   // HERESY 1563
    var mt = S.lv["*"] ? S.lv["*"].t : 0, mv = level("*", rd.m[ns.length + 2], rd.mg ? rd.mg[0] : (S.lv["*"] ? S.lv["*"].gr : 0), now);   // HERESY 1544: the master's compressor and limiter
    if (rd.mg) { var lg = rd.mg[1], ldt = mt ? Math.min(0.25, (now - mt) / 1000) : 0.016; mv.lim = lg >= (mv.lim || 0) ? lg : Math.max(lg, (mv.lim || 0) - 20 * ldt); }
    loudness(rd.m[ns.length + 2]);
    ns.concat(["*"]).forEach(function (key) {
      var el = document.querySelector('.mx-meter[data-meter="' + key + '"] i'), v = S.lv[key];
      if (!el || !v) return;
      var top = Math.max(v.pk[0], v.pk[1]);
      el.style.height = Math.round(taper(top) * 100) + "%";
      el.parentNode.classList.toggle("is-hot", top > -1);
      S.meters[key] = taper(top);                    // HERESY 1501's reading, kept
    });
    refMatch();                                       // HERESY 1755
    emit("frame");
  }
  function fallMeters() {
    cancelAnimationFrame(S.fallRaf);
    if (S.playing || performance.now() > S.fall) return;
    meters();
    S.fallRaf = requestAnimationFrame(fallMeters);
  }
  function rangesNow(n) { var l = S.graph && S.graph.lanes[n]; if (S.playing && l) { var t = pos(); ranges(n, l, t, t + CHUNK); } }

  // ---- what the hand does
  function changed(n) {
    keep();
    if (S.graph) applyStrip(S.graph, n);              // HERESY 1531: heard at once
    var row = document.querySelector('.mx-lane[data-strip="' + n + '"]');
    names().forEach(function (m) { var r = document.querySelector('.mx-lane[data-strip="' + m + '"]'); if (r) r.classList.toggle("is-quiet", !audible(m)); });
    if (row) {
      var s = strip(n);
      Array.prototype.forEach.call(row.querySelectorAll(".mx-ms"), function (b) {
        if (b.dataset.mx === "auto") { b.classList.toggle("is-on", !!S.autoShow[n]); b.setAttribute("aria-pressed", !!S.autoShow[n]); b.classList.toggle("has-auto", hasAuto(n)); return; }   // HERESY 1536; 1559
        var on = !!s[b.dataset.mx]; b.classList.toggle("is-on", on); b.setAttribute("aria-pressed", on); });
      var o = row.querySelector(".mx-fader output"), f = row.querySelector('.mx-fader input[data-mx="gain_db"]');
      if (o) o.textContent = fmtDb(s.gain_db);
      if (f && +f.value !== s.gain_db && document.activeElement !== f) f.value = s.gain_db;
    }
    liveGains();
    soloPaint();                                      // HERESY 1754
    emit("change", { n: n });
  }
  function onInput(e) {
    var el = e.target, row = el.closest && el.closest(".mx-lane"), k = el.dataset && el.dataset.mx;
    if (!row || !k || k === "version") return;
    var n = row.dataset.strip, s = S.strips[n] || (S.strips[n] = {});
    if (!S.gesture) { mark(); S.gesture = true; }        // HERESY 1531: one undo for a whole drag
    s[k] = parseFloat(el.value) || 0;
    changed(n);
  }
  function onChange(e) {
    var el = e.target;
    if (el.id === "mxSet") { keepNow(); S.owner = ""; S.set = el.value; open(); return; }   // HERESY 1545
    if (el.dataset && el.dataset.mx === "gain_db") S.gesture = false;
    var row = el.closest && el.closest(".mx-lane");
    if (row && el.dataset.mx === "version") setVersion(row.dataset.strip, el.value);
  }
  function refreshVersions() {                       // HERESY 1561: the set's versions read again (an insert made one); all else as it is
    if (!S.take || !S.set || !S.info) return Promise.resolve(null);
    var token = S.token;
    return getJson("/daw/set?" + q({ name: S.take.name, set: S.set })).then(function (info) {
      if (token !== S.token || !S.info) return null;
      info.strips.forEach(function (st) { var mine = S.info.strips.filter(function (x) { return x.name === st.name; })[0]; if (mine) mine.versions = st.versions; });
      paint();
      return S.info;
    });
  }
  function setVersion(n, path) {                      // HERESY 1531: from the lane's choice or the console's
    mark();
    S.versions[n] = path;
    keep();
    loadPeaks(n);
    var sel = document.querySelector('.mx-lane[data-strip="' + n + '"] .mx-ver');
    if (sel && sel.value !== path) sel.value = path;
    var vb = document.querySelector('.mx-lane[data-strip="' + n + '"] .mx-verb'), st0 = S.info && S.info.strips.filter(function (x) { return x.name === n; })[0];
    if (vb && st0) vb.outerHTML = verButton(n, st0);   // HERESY 1538
    if (S.playing) play(pos());                       // the new version from the same second
    emit("change", { n: n, key: "version" });
  }
  function onClick(e) {
    if (e.target.closest && e.target.closest("#mxFull")) return setFull(!isFull());   // HERESY 1499
    var pick = e.target.closest && e.target.closest(".mx-lane[data-strip] .mx-name");   // HERESY 1501: the lane the keys act on
    if (pick && S.laneDragged) { S.laneDragged = false; return; }   // HERESY 1989: a drag, not a pick
    if (pick) { select(pick.closest(".mx-lane").dataset.strip); return; }
    var lr = e.target.closest && e.target.closest(".mx-lane[data-strip]");   // HERESY 1989: the lane's own buttons
    if (lr) {
      var ln = lr.dataset.strip, chb = e.target.closest("[data-mx-ch]"), cb = e.target.closest("[data-mx-col]"), fb = e.target.closest("[data-mx-fold]"), ob = e.target.closest("[data-mx-off]");
      if (chb) { mark(); (S.strips[ln] || (S.strips[ln] = {})).chan = chb.dataset.mxCh === "st" ? undefined : chb.dataset.mxCh; changed(ln); lanePaint(ln); return; }
      if (cb) {
        if (e.altKey) delete LANE_C[ln];
        else { var cur = hueOf(ln), ix = PALETTE.indexOf(cur); LANE_C[ln] = PALETTE[(ix + 1) % PALETTE.length]; }
        lsPut("yue2.mxLaneC", LANE_C); lanePaint(ln); emit("paint"); return;
      }
      if (fb) { if (LANE_F[ln]) delete LANE_F[ln]; else LANE_F[ln] = 1; lsPut("yue2.mxLaneF", LANE_F); lanePaint(ln); return; }
      if (ob) { mark(); delete (S.strips[ln] || {}).offset_s; changed(ln); lanePaint(ln); if (S.playing) play(pos()); return; }
    }
    var el = e.target.closest && e.target.closest("button");
    if (!el) return;
    if (el.id === "mxLoop") { S.loopOn = !S.loopOn; loopPaint(); return; }
    if (el.id === "mxZoomIn" || el.id === "mxZoomOut") { var wb = waveBox(); if (wb) zoomAt(el.id === "mxZoomIn" ? 1.5 : 1 / 1.5, tx(pos(), wb.clientWidth), wb.clientWidth); return; }
    if (el.id === "mxFit") { S.view = { zoom: 1, t0: 0 }; redrawAll(); return; }
    if (el.id === "mxPlay") { if (S.playing) stop(); else play(); return; }
    if (el.id === "mxLayerBtn") { layerOpen(); return; }   // HERESY 2006
    if (el.id === "mxReset") { mark(); S.strips = {}; S.versions = {}; S.buses = busesDefault(); restored(); return; }
    if (el.id === "mxMix") { mix(); return; }
    if (el.id === "mxStop") { stopMix(); return; }     // HERESY 1539
    if (el.id === "mxRef") { refToggle(); return; }    // HERESY 1755
    if (el.id === "mxUnsolo") { clearSolo(); return; }   // HERESY 1754
    if (el.id === "mxUndo") { undo(); return; }        // HERESY 1531
    if (el.id === "mxRedo") { redo(); return; }
    if (el.id === "mxA" || el.id === "mxB") { abTo(el.id.slice(2)); return; }
    if (el.id === "mxDockBtn") { S.dock = !S.dock; keepFlag("yue2.mixer.dock", S.dock); var dk = $("mxDock"); if (dk) dk.hidden = !S.dock; paintHead(); emit("paint"); return; }
    if (el.id === "mxPrint") { S.print = !S.print; keepFlag("yue2.mixer.print", S.print); paintHead(); return; }
    var row = el.closest(".mx-lane"), k = el.dataset.mx;
    if (row && k === "vercycle") {                    // HERESY 1538: the next version
      var vn = row.dataset.strip, vs = (S.info.strips.filter(function (x) { return x.name === vn; })[0] || { versions: [] }).versions.map(function (x) { return x.path; });
      if (vs.length > 1) setVersion(vn, vs[(vs.indexOf(versionOf(vn)) + 1) % vs.length]);
      return;
    }
    if (row && k === "auto") { var an = row.dataset.strip; S.autoShow[an] = !S.autoShow[an]; lanePaintAuto(an); draw(an); return; }   // HERESY 1535
    if (row && k === "autop") {                       // HERESY 1559: the next knob the line draws
      var apn = row.dataset.strip, order = Object.keys(AUTO_P);
      S.autoParam[apn] = order[(order.indexOf(autoParam(apn)) + 1) % order.length];
      lanePaintAuto(apn); draw(apn);
      return;
    }
    if (row && k === "solo" && e.altKey) { clearSolo(); return; }   // HERESY 1754: Alt+click on an S, every solo off
    if (row && (k === "mute" || k === "solo" || k === "invert")) {   // HERESY 1989: and the polarity
      var n = row.dataset.strip, s = S.strips[n] || (S.strips[n] = {});
      mark();
      s[k] = !s[k];
      changed(n);
    }
  }
  // HERESY 1531: undo and redo, A and B: the whole mix of the set as it was, put back and heard at once
  function snap() { return JSON.stringify({ strips: S.strips, versions: S.versions, buses: S.buses }); }
  function mark() {
    var cur = snap();
    if (S.undo.length && S.undo[S.undo.length - 1] === cur) return;
    S.undo.push(cur);
    if (S.undo.length > 120) S.undo.shift();
    S.redo = [];
    paintUndo();
  }
  function paintUndo() { var u = $("mxUndo"), r = $("mxRedo"); if (u) u.disabled = !S.undo.length; if (r) r.disabled = !S.redo.length; }
  function put(text) {
    var was = JSON.stringify(S.versions), v = JSON.parse(text);
    S.strips = v.strips || {}; S.versions = v.versions || {}; S.buses = busesOf(v.buses);
    if (Array.isArray(v.marks)) S.marks = marksOf(v.marks);   // HERESY 2016: a named mix's markers; undo and A/B carry none and leave them
    restored(was !== JSON.stringify(S.versions));
  }
  function restored(versionsMoved) {
    keepNow();
    var was = S.playing, t = pos();
    paint();
    names().forEach(function (n) { loadPeaks(n); });
    if (S.graph) { names().forEach(function (n) { applyStrip(S.graph, n); }); applyBuses(S.graph); }
    if (S.graph && S.graph.key !== graphKey()) { closeGraph(); if (was) { play(t); emit("change", {}); return; } }   // HERESY 1563: the buses' members moved back
    if (was && versionsMoved !== false) play(t);
    emit("change", {});
  }
  function undo() { if (!S.undo.length) return; S.redo.push(snap()); put(S.undo.pop()); paintUndo(); }
  function redo() { if (!S.redo.length) return; S.undo.push(snap()); put(S.redo.pop()); paintUndo(); }
  function abTo(k) {
    if (S.ab.cur === k) return;
    S.ab[S.ab.cur] = snap();
    var other = S.ab[k];
    S.ab.cur = k;
    if (other) { mark(); put(other); } else { keepNow(); paintHead(); }
    paintUndo();
  }
  // HERESY 1531: what the console sets, heard at once and kept (heresy-console.js); `key` "comp.ratio" reaches into the compressor
  function setStrip(n, key, v) {
    if (n.charAt(0) === "%") {                        // HERESY 1563: an audio bus's knobs and devices
      var sb = subOf(n.slice(1));
      if (!sb) return;
      if (key.indexOf("comp.") === 0) { sb.comp = Object.assign({}, COMP_DEF, sb.comp || {}); delete sb.comp.key; sb.comp[key.slice(5)] = v; }
      else if (key === "comp" && v) { sb.comp = Object.assign({}, v); delete sb.comp.key; }
      else sb[key] = v;
      keep(); applySub(S.graph, sb.id); emit("change", { bus: n, key: key });
      return;
    }
    if (n === "*") {                                  // HERESY 1544: the master's devices
      var b = S.buses.master;
      if (key.indexOf("comp.") === 0) { b.comp = Object.assign({}, COMP_DEF, b.comp || {}); delete b.comp.key; b.comp[key.slice(5)] = v; }
      else if (key.indexOf("limit.") === 0) { b.limit = Object.assign({}, LIMIT_DEF, b.limit || {}); b.limit[key.slice(6)] = v; }
      else if (key === "comp" && v) { b.comp = Object.assign({}, v); delete b.comp.key; }
      else b[key] = v;
      keep(); applyBuses(S.graph); emit("change", { bus: "master", key: key });
      return;
    }
    var s = S.strips[n] || (S.strips[n] = {});
    if (key.indexOf("comp.") === 0) { s.comp = Object.assign({}, COMP_DEF, s.comp || {}); s.comp[key.slice(5)] = v; }
    else if (key.indexOf("gate.") === 0) { s.gate = Object.assign({}, GATE_DEF, s.gate || {}); s.gate[key.slice(5)] = v; }   // HERESY 1760
    else s[key] = v;
    changed(n);
  }
  // HERESY 1543: the VCAs, set from the console (its mark() before)
  function groupSet(id, key, v) {
    var x = (S.buses.groups || []).filter(function (y) { return y.id === id; })[0];
    if (!x) return;
    x[key] = v;
    keep();
    if (S.graph) names().forEach(function (n) { applyStrip(S.graph, n); });
    names().forEach(function (m2) { var r = document.querySelector('.mx-lane[data-strip="' + m2 + '"]'); if (r) r.classList.toggle("is-quiet", !audible(m2)); });
    soloPaint();                                      // HERESY 1754: a VCA's solo too
    emit("change", { group: id, key: key });
  }
  function groupAdd(members) {
    var gs = S.buses.groups || (S.buses.groups = []);
    if (gs.length >= 16) return "";
    var k = 1; while (gs.some(function (y) { return y.name === "VCA " + k; })) k++;
    var id = "vca-" + Date.now().toString(36);
    gs.push({ id: id, name: "VCA " + k, members: (members || []).filter(function (n) { return names().indexOf(n) >= 0; }), gain_db: 0, mute: false, solo: false });
    keep(); emit("change", { group: id });
    return id;
  }
  function groupDel(id) {
    S.buses.groups = (S.buses.groups || []).filter(function (y) { return y.id !== id; });
    keep();
    if (S.graph) names().forEach(function (n) { applyStrip(S.graph, n); });
    emit("change", { group: id });
  }
  function setBus(bus, key, v) {
    S.buses[bus][key] = v;
    keep();
    applyBuses(S.graph);
    if (bus === "master" && /^(fade_|end_s)/.test(key)) redrawAll();   // HERESY 1756: the fade drawn over the lanes
    emit("change", { bus: bus, key: key });
  }
  var EV = {};
  function on(ev, fn) { (EV[ev] || (EV[ev] = [])).push(fn); }
  function emit(ev, d) { (EV[ev] || []).forEach(function (fn) { try { fn(d); } catch (e) { if (window.console) console.error(e); } }); }
  function onDbl(e) {
    var chc = e.target.closest && e.target.closest("canvas[data-mx-chords]"), chg = gridData();   // HERESY 2314: a chord looped
    if (chc && chg && S.info) {
      var chd = window.RuachBars.chordAt(chg, timeAt(chc, e.clientX));
      if (chd) { S.loop = [chd.t0, chd.t1]; S.loopOn = true; loopPaint(); if (S.playing) play(chd.t0); else { S.at = chd.t0; paintPlayhead(); } }
      return;
    }
    var rc = e.target.closest && e.target.closest("canvas[data-mx-ruler]");   // HERESY 1532: a section's block looped
    if (rc && S.info) {
      var r = rc.getBoundingClientRect(), sc = e.clientY > r.bottom - 15 ? sectionAt(timeAt(rc, e.clientX)) : null;
      if (sc) { S.loop = [sc.t, sc.end]; S.loopOn = true; loopPaint(); if (S.playing) play(sc.t); else { S.at = sc.t; paintPlayhead(); } return; }
    }
    var cc = e.target.closest && e.target.closest("canvas[data-mx-wave]");   // HERESY 1542: a corner's handle back to 10 ms
    if (cc && S.info && !S.autoShow[cc.dataset.mxWave]) {
      var ch = cutAt(cc, e);
      if (ch && (ch.kind === "fall" || ch.kind === "rise")) {
        mark(); var f0 = fadesOf(ch.r); ch.r[2] = f0[0]; ch.r[3] = f0[1]; ch.r[ch.kind === "fall" ? 2 : 3] = EDGE;
        keep(); draw(cc.dataset.mxWave); rangesNow(cc.dataset.mxWave); emit("change", { n: cc.dataset.mxWave, key: "muted" });
        return;
      }
    }
    var dc = e.target.closest && e.target.closest("canvas[data-mx-wave]");   // HERESY 1968: the level's point back to 0 dB; a laid stretch or a segment taken whole
    if (dc && S.info && !S.autoShow[dc.dataset.mxWave]) {
      var dn = dc.dataset.mxWave, lp = autoAt(dc, e, "volume");
      if (lp.hit) { mark(); lp.hit[1] = 0; keep(); draw(dn); autoSchedule(dn); emit("change", { n: dn, key: "auto" }); return; }
      var dt = timeAt(dc, e.clientX), ds = S.strips[dn], led = ds && Array.isArray(ds.edits) ? ds.edits.filter(function (e2) { return e2.to <= dt && dt <= e2.to + (e2.b - e2.a); }).pop() : null;
      var sg = led ? [led.to, led.to + (led.b - led.a)] : segmentAt(dn, dt);
      pickSet(dn, sg[0], sg[1]);
      return;
    }
    var ac = e.target.closest && e.target.closest("canvas[data-mx-wave]");   // HERESY 1535: a point to 0 dB
    if (ac && S.info && S.autoShow[ac.dataset.mxWave]) {
      var a = autoAt(ac, e);
      if (a.hit) { mark(); a.hit[1] = AUTO_P[a.prm].rest; keep(); draw(a.n); autoSchedule(a.n); emit("change", { n: a.n, key: "auto" }); }   // 1559: the knob's rest
      else { var sg0 = segAt(a.n, a.prm, a.t); if (sg0 && sg0.p.length > 2) shapeSet(a.n, a.prm, sg0.p, null); }   // HERESY 2318: a segment straight again
      return;
    }
    var f = e.target.closest && e.target.closest(".mx-fader input");
    if (!f) return;
    f.value = 0;
    f.dispatchEvent(new Event("input", { bubbles: true }));
  }
  // HERESY 1501: the ruler: a click goes there, a drag draws the loop
  function focusPaint() { Array.prototype.forEach.call(document.querySelectorAll("#mxLanes .mx-lane[data-strip]"), function (r) { r.classList.toggle("is-focus", r.dataset.strip === S.focus); }); }
  function select(n) { S.focus = n; focusPaint(); emit("select", n); }   // HERESY 1531: the lane the keys act on and the console shows
  function loopPaint() { var b = $("mxLoop"); if (b) { b.classList.toggle("is-on", S.loopOn); b.setAttribute("aria-pressed", S.loopOn); } redrawAll(); }
  function rulerDown(e) {
    var c = e.target.closest && e.target.closest("canvas[data-mx-ruler]");
    if (!c || e.button !== 0 || !S.info) return false;
    e.preventDefault();
    var t = timeAt(c, e.clientX), r = c.getBoundingClientRect(), onBand = sections().length && e.clientY > r.bottom - 15, sc = onBand ? sectionAt(t) : null;
    if (sc) t = sc.t;                                 // HERESY 1532: a section's block: its start
    else t = gridSnap(t, r.width, e);                 // HERESY 2313: the loop's start and a click on the grid
    S.rule = { canvas: c, x: e.clientX, a: t, b: t, moved: false, sec: sc };
    try { if (c.setPointerCapture) c.setPointerCapture(e.pointerId); } catch (x) { /* gone */ }
    return true;
  }
  function onWheel(e) {
    var box = e.target.closest && e.target.closest("#mxLanes .mx-wave");
    if (!box || !S.info) return;
    var r = box.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey) { e.preventDefault(); zoomAt(e.deltaY < 0 ? 1.25 : 0.8, e.clientX - r.left, r.width); return; }
    var along = e.shiftKey ? e.deltaY : e.deltaX;
    if (along && S.view.zoom > 1) { e.preventDefault(); S.view.t0 += along / Math.max(1, r.width) * span(); clampView(); redrawAll(); }
  }
  function inSight() {
    var panel = $("dawPanel");
    return !!panel && !!S.info && (isFull() || (document.body.dataset.tab === "post" && panel.open && panel.getClientRects().length > 0));
  }
  document.addEventListener("keyup", function (e) {   // Space on a button that kept the focus plays, and does not press it too
    if (e.key === " " && inSight() && e.target && e.target.tagName === "BUTTON" && e.target.closest && e.target.closest("#dawPanel")) e.preventDefault();
  });
  document.addEventListener("keydown", function (e) {
    var typing = /^(INPUT|SELECT|TEXTAREA)$/.test((e.target && e.target.tagName) || "") && e.target.type !== "range" || (e.target && e.target.isContentEditable);
    if (inSight() && (e.ctrlKey || e.metaKey) && !e.altKey && /^[cxv]$/i.test(e.key) && !typing && !document.querySelector(".hd-back") && (S.pick || S.clip) && !(window.getSelection && String(window.getSelection()))) {
      var kk = e.key.toLowerCase();                   // HERESY 1564: copy, cut (1968: at once, as an audio editor cuts), lay at the playhead
      if (kk === "c" || kk === "x") {
        if (!S.pick) return;
        e.preventDefault();
        clipTake(kk);
        return;
      }
      if (!S.clip || !S.info) return;
      e.preventDefault();
      clipLay();
      return;
    }
    if (inSight() && (e.ctrlKey || e.metaKey) && !e.altKey && /^[ae]$/i.test(e.key) && !typing && !document.querySelector(".hd-back") && S.info && !(window.getSelection && String(window.getSelection()))) {
      var ln = (S.pick && S.pick.n) || S.focus;       // HERESY 1968: Ctrl+A the whole lane, Ctrl+E a split at the playhead (at a selection's edges)
      if (!ln || ln === "*" || ln.charAt(0) === "%" || names().indexOf(ln) < 0) return;
      e.preventDefault();
      if (/a/i.test(e.key)) { pickSet(ln, 0, S.info.seconds); return; }
      splitAt(ln, S.pick && S.pick.n === ln ? [S.pick.a, S.pick.b] : [S.playing ? pos() : S.at]);
      return;
    }
    if (inSight() && (e.ctrlKey || e.metaKey) && !e.altKey && /^[zy]$/i.test(e.key) && !typing && !document.querySelector(".hd-back")) {
      e.preventDefault();                              // HERESY 1531: undo and redo
      if (/y/i.test(e.key) || e.shiftKey) redo(); else undo();
      return;
    }
    if (!inSight() || e.ctrlKey || e.altKey || e.metaKey || e.defaultPrevented) return;
    var tag = (e.target && e.target.tagName) || "";
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(tag) && e.target.type !== "range" || (e.target && e.target.isContentEditable) || document.querySelector(".hd-back")) return;
    var k = e.key, ns = names(), wb = waveBox(), w = wb ? wb.clientWidth : 1, i = ns.indexOf(S.focus);
    if (k === " ") { e.preventDefault(); if (S.playing) stop(); else play(); return; }
    if (k === "Home") { e.preventDefault(); var to = S.loopOn && S.loop ? S.loop[0] : 0; if (S.playing) play(to); else { S.at = to; paintPlayhead(); } return; }
    if (k === "l" || k === "L") { e.preventDefault(); S.loopOn = !S.loopOn; loopPaint(); return; }
    if (k === "r" || k === "R") { e.preventDefault(); refToggle(); return; }   // HERESY 1755
    if ((k === "Delete" || k === "Backspace") && S.pick) {   // HERESY 1564: the stretch in hand silenced (1968: a stretch laid over it trimmed too)
      e.preventDefault();
      pickSilence();
      return;
    }
    if (k === "Escape" && S.pick) { var en = S.pick.n; S.pick = null; draw(en); say(""); return; }
    if ((k === "m" || k === "M" || k === "s" || k === "S") && S.focus) {
      e.preventDefault();
      var st = S.strips[S.focus] || (S.strips[S.focus] = {}), key = /m/i.test(k) ? "mute" : "solo";
      mark(); st[key] = !st[key]; changed(S.focus); return;
    }
    if (k === "ArrowDown" || k === "ArrowUp") { e.preventDefault(); select(ns[Math.max(0, Math.min(ns.length - 1, i + (k === "ArrowDown" ? 1 : -1) + (i < 0 && k === "ArrowUp" ? 1 : 0)))]); return; }
    if (k === "+" || k === "=") { e.preventDefault(); zoomAt(1.5, tx(pos(), w), w); return; }
    if (k === "-" || k === "_") { e.preventDefault(); zoomAt(1 / 1.5, tx(pos(), w), w); return; }
    if (k === "0") { e.preventDefault(); S.view = { zoom: 1, t0: 0 }; redrawAll(); return; }
    if (k === "k" || k === "K") { e.preventDefault(); markAdd(pos()); return; }   // HERESY 2016: a marker at the playhead
    if (k === "g" || k === "G") { e.preventDefault(); gridToggle(); return; }   // HERESY 2313: the bar grid
    if (k === "," || k === ".") { if (markJump(k === "." ? 1 : -1)) e.preventDefault(); return; }   // and the one before, after
    if (k === "[" || k === "]") {                    // HERESY 1532: the section before, the section after
      var secs = sections(), now = pos(), to = null;
      if (!secs.length) return;
      e.preventDefault();
      if (k === "]") { for (var si = 0; si < secs.length; si++) if (secs[si].t > now + 0.05) { to = secs[si].t; break; } }
      else { for (var sj = secs.length - 1; sj >= 0; sj--) if (secs[sj].t < now - (S.playing ? 1.5 : 0.05)) { to = secs[sj].t; break; } if (to == null) to = 0; }
      if (to == null) return;
      if (S.playing) play(to); else { S.at = to; paintPlayhead(); }
    }
  });
  // HERESY 1535: a lane's volume in hand: the fader's taper for the height (its 0 dB where the fader's is)
  function autoY(d, h) { return h - 2 - taper(d) * (h - 4); }
  // HERESY 1559: the knob in hand: its height linear in its range (the volume's by the fader's taper); a point's value back from a height
  function aY(prm, v, h) { if (prm === "volume") return autoY(v, h); var p = AUTO_P[prm]; return h - 2 - (v - p.lo) / (p.hi - p.lo) * (h - 4); }
  function aV(prm, y, h) {
    var f = Math.max(0, Math.min(1, (h - 2 - y) / Math.max(1, h - 4)));
    if (prm === "volume") return Math.round(Math.max(-60, Math.min(12, untaper(f))) * 10) / 10;
    var p = AUTO_P[prm], v = p.lo + f * (p.hi - p.lo);
    return Math.abs(v - p.rest) < (p.hi - p.lo) * 0.02 ? p.rest : Math.round(v * 100) / 100;   // the rest catches the pointer
  }
  function autoAt(c, e, prm0) {                      // the point under the pointer, or null; and the time and level there (1559: of the knob in hand; 1968: or the one asked)
    var r = c.getBoundingClientRect(), n = c.dataset.mxWave, x = e.clientX - r.left, y = e.clientY - r.top, prm = prm0 || autoParam(n), pts = rawPts(n, prm), hit = null, best = 8;
    pts.forEach(function (q) { var d = Math.hypot(tx(q[0], r.width) - x, aY(prm, q[1], r.height) - y); if (d < best) { best = d; hit = q; } });
    return { n: n, prm: prm, hit: hit, t: Math.max(0, Math.min(S.info.seconds, xt(x, r.width))), db: aV(prm, y, r.height), r: r };
  }
  function autoDown(e, c) {
    var a = autoAt(c, e);
    e.preventDefault();
    mark();
    var list = rawPts(a.n, a.prm, true);              // HERESY 1559: the list of the knob in hand, made when it has none
    var q = a.hit;
    if (!q) { q = [Math.round(a.t * 1000) / 1000, a.db]; list.push(q); }
    S.adrag = { n: a.n, c: c, q: q };
    try { if (c.setPointerCapture) c.setPointerCapture(e.pointerId); } catch (x) { /* gone */ }
    draw(a.n);
  }
  // HERESY 1542: what of a stretch is under the pointer: a top corner's handle (its fall or rise) or a side (its start or end)
  function cutAt(c, e) {
    var n = c.dataset.mxWave, r0 = c.getBoundingClientRect(), x = e.clientX - r0.left, y = e.clientY - r0.top, w = r0.width, hit = null;
    strip(n).muted.forEach(function (r) {
      if (hit) return;
      var f = fitFades(r), xa = tx(r[0], w), xb = tx(r[1], w);
      if (xb - xa >= 10 && y <= 11) {
        if (Math.abs(x - tx(r[0] + f[0], w)) <= 6) hit = { r: r, kind: "fall" };
        else if (Math.abs(x - tx(r[1] - f[1], w)) <= 6) hit = { r: r, kind: "rise" };
      }
      if (!hit && Math.abs(x - xa) <= 4) hit = { r: r, kind: "start" };
      if (!hit && Math.abs(x - xb) <= 4) hit = { r: r, kind: "end" };
    });
    return hit;
  }
  function cutMove(d, t) {
    var r = d.r, f = fadesOf(r), cuts = strip(d.n).muted, i = cuts.indexOf(r), L = S.info.seconds;
    if (r.length < 4) { r[2] = f[0]; r[3] = f[1]; }
    if (d.kind === "fall") r[2] = Math.round(Math.max(0, Math.min(r[1] - r[0] - Math.min(r[3], r[1] - r[0]), t - r[0])) * 1000) / 1000;
    else if (d.kind === "rise") r[3] = Math.round(Math.max(0, Math.min(r[1] - r[0] - Math.min(r[2], r[1] - r[0]), r[1] - t)) * 1000) / 1000;
    else if (d.kind === "start") r[0] = Math.round(Math.max(i > 0 ? cuts[i - 1][1] : 0, Math.min(r[1] - 0.05, t)) * 1000) / 1000;
    else r[1] = Math.round(Math.min(i < cuts.length - 1 ? cuts[i + 1][0] : L, Math.max(r[0] + 0.05, t)) * 1000) / 1000;
  }
  // HERESY 1968 (Viktor 31.10.2026: «как в ocenaudio есть возможности мышкой браться за точку на треке и вести её вверх в пик или вниз в
  // затухание… Разрезка по сегментам, копирование, вырезание, передвигание… в общем как в аудио редакторе… это красивая обёртка, а толку из
  // неё мало»): a wave is edited as an audio editor's is. A drag selects; the selection's edges move, a drag inside it moves what it holds
  // (Ctrl: a copy), its right-click fades it in or out, raises or lowers it, silences, cuts, copies, lays; the level's line over every wave
  // is taken at a point up into a peak or down into a fade; Ctrl+E splits the lane, a double-click takes a segment or a laid stretch whole.
  // All of it in the mix's own words (muted, auto, edits), so Forge renders what is heard; the splits are the page's marks only
  var HIT = 5, MAX_EDITS = 64, MAX_SPLITS = 64;
  var HOLE_F = 0.03;                                  // HERESY 1975: a cut left by a stretch carried away or cut out fades into its silence and rises out of it
  function r3(t) { return Math.round(t * 1000) / 1000; }
  function splitsOf(n) { var s = S.strips[n]; return s && Array.isArray(s.splits) ? s.splits : []; }
  function pickAt(c, e) {                            // the selection under the pointer: an edge, or inside
    var p = S.pick;
    if (!p || p.n !== c.dataset.mxWave) return null;
    var r = c.getBoundingClientRect(), x = e.clientX - r.left, xa = tx(p.a, r.width), xb = tx(p.b, r.width);
    if (Math.abs(x - xa) <= HIT && xb - xa > 2 * HIT) return "a";
    if (Math.abs(x - xb) <= HIT) return "b";
    return x > xa && x < xb ? "in" : null;
  }
  function lineAt(c, e) {                            // the level's line under the pointer (its point, or the line itself), or null
    var a = autoAt(c, e, "volume");
    if (a.hit) return a;
    var y = e.clientY - a.r.top, ly = aY("volume", autoDb(linePts(a.n, "volume"), a.t), a.r.height);
    return Math.abs(y - ly) <= HIT ? a : null;
  }
  function lineDown(e, c, a) {
    e.preventDefault();
    var q = a.hit, pending = null;
    if (q) mark();
    else {                                            // a point where it was pressed, and its neighbours kept 30 px away, so a peak or a dip stays where it is drawn
      var pts = sortedPts(a.n, "volume"), lp = expandPts(pts), L = S.info.seconds, wd = Math.max(0.25, span() * 30 / Math.max(1, a.r.width)), lv = function (t) { return Math.round(autoDb(lp, t) * 10) / 10; };
      q = [r3(a.t), lv(a.t)];
      var before = pts.filter(function (p) { return p[0] < q[0]; }).pop(), after = pts.filter(function (p) { return p[0] > q[0]; })[0];
      pending = [q];
      if ((!before || q[0] - before[0] > wd) && q[0] - wd > 0) pending.push([r3(q[0] - wd), lv(q[0] - wd)]);
      if ((!after || after[0] - q[0] > wd) && q[0] + wd < L) pending.push([r3(q[0] + wd), lv(q[0] + wd)]);
    }
    S.adrag = { n: a.n, c: c, q: q, prm: "volume", pending: pending, x: e.clientX, y: e.clientY, t: a.t };
    try { if (c.setPointerCapture) c.setPointerCapture(e.pointerId); } catch (x) { /* gone */ }
    draw(a.n);
  }
  // HERESY 1972 (my proposal 31.10.2026): a selection's edges cling to what stands on the lane within 6 px: the song's sections, its splits,
  // the playhead, the edges of a laid stretch and of a silence; Alt held lets them go free
  var SNAP_PX = 6;
  function snapT(n, t, c, e) {
    if (e && e.altKey) return t;
    var w = c.getBoundingClientRect().width, best = null, bd = SNAP_PX, s = S.strips[n] || {};
    var cand = sections().map(function (x) { return x.t; }).concat(splitsOf(n), [S.playing ? pos() : S.at]);
    (Array.isArray(s.edits) ? s.edits : []).forEach(function (e2) { cand.push(e2.to, e2.to + (e2.b - e2.a)); });
    (Array.isArray(s.muted) ? s.muted : []).forEach(function (r) { cand.push(r[0], r[1]); });
    cand.forEach(function (x) { if (x == null || !isFinite(x)) return; var dp = Math.abs(tx(x, w) - tx(t, w)); if (dp <= bd) { bd = dp; best = x; } });
    var gl = gridShown() ? window.RuachBars.nearest(gridData(), t, w / span(), SNAP_PX) : null;   // HERESY 2313: the bars and beats too
    if (gl != null && Math.abs(tx(gl, w) - tx(t, w)) < bd) best = gl;
    return best == null ? t : r3(best);
  }
  function pickSay() { return S.pick ? tr("Selected {0}–{1}: drag it to move it (Ctrl copies), Ctrl+C copies, Ctrl+X cuts, Delete silences, a right-click for fades and level").replace("{0}", clock(S.pick.a)).replace("{1}", clock(S.pick.b)) : ""; }
  function pickSet(n, a, b) {
    var was = S.pick && S.pick.n;
    S.pick = { n: n, a: r3(Math.max(0, a)), b: r3(Math.min(S.info.seconds, b)) };
    if (was && was !== n) draw(was);
    draw(n); select(n); say(pickSay());
  }
  function segmentAt(n, t) {                         // between the splits around t (the lane's ends where there are none)
    var a = 0, b = S.info.seconds;
    splitsOf(n).forEach(function (x) { if (x <= t && x > a) a = x; if (x > t && x < b) b = x; });
    return [a, b];
  }
  function splitAt(n, ts) {
    var s = S.strips[n] || (S.strips[n] = {}), L = S.info.seconds, have = splitsOf(n);
    var add = ts.map(r3).filter(function (t, i, all) { return t > 0.01 && t < L - 0.01 && all.indexOf(t) === i && have.every(function (h) { return Math.abs(h - t) > 0.005; }); });
    if (!add.length) return;
    if (have.length + add.length > MAX_SPLITS) { say(tr("A lane holds at most 64 splits"), true); return; }
    mark();
    s.splits = have.concat(add).sort(function (x, y) { return x - y; });
    keep(); draw(n);
    say(tr("Split at {0}").replace("{0}", add.map(clock).join(", ")));
  }
  function splitNear(c, e) {                         // a split within reach of the pointer, or null
    var r = c.getBoundingClientRect(), x = e.clientX - r.left, hit = null;
    splitsOf(c.dataset.mxWave).forEach(function (t) { if (hit == null && Math.abs(tx(t, r.width) - x) <= 4) hit = t; });
    return hit;
  }
  function mergeCuts(list) {                         // HERESY 1542: one that touches another is one: the first's fall, the last's rise
    var merged = [];
    list.slice().sort(function (x, y) { return x[0] - y[0]; }).forEach(function (r) {
      var last = merged[merged.length - 1], f = fadesOf(r);
      if (last && r[0] <= last[1]) { if (r[1] > last[1]) { last[1] = r[1]; last[3] = f[1]; } }
      else merged.push([r[0], r[1], f[0], f[1]]);
    });
    return merged;
  }
  function silenceRange(n, a, b, f) {                // a…b silent as heard: the lane's own sound cut there, a stretch laid over it trimmed or split around it (f: its fades, 1975)
    var s = S.strips[n] || (S.strips[n] = {}), cuts = (s.muted || []).slice(), eds = [];
    (Array.isArray(s.edits) ? s.edits : []).forEach(function (e2) {
      var ea = e2.to, eb = e2.to + (e2.b - e2.a);
      if (eb <= a || ea >= b) { eds.push(e2); return; }
      if (e2.op === "move") cuts.push([e2.a, e2.b]);   // a move's source stays silent when the move is cut into pieces
      if (ea < a && a - ea >= 0.01) eds.push({ op: "copy", a: e2.a, b: r3(e2.a + (a - ea)), to: e2.to });
      if (eb > b && eb - b >= 0.01) eds.push({ op: "copy", a: r3(e2.a + (b - ea)), b: e2.b, to: r3(b) });
    });
    cuts.push(f ? [r3(a), r3(b), f, f] : [r3(a), r3(b)]);   // HERESY 1975: its fades when it is a stretch cut out
    s.muted = mergeCuts(cuts);
    s.edits = eds;
  }
  function pickSilence() {
    var p = S.pick, n = p.n;
    mark();
    silenceRange(n, p.a, p.b);
    S.pick = null;
    keep(); draw(n); rangesNow(n); if (S.playing) play(pos());
    emit("change", { n: n, key: "muted" });
    say(tr("Silenced {0}–{1}: a right-click on it gives it back").replace("{0}", clock(p.a)).replace("{1}", clock(p.b)));
  }
  function clipTake(kk) {                            // Ctrl+C keeps the selection to lay; Ctrl+X keeps it and silences it here at once
    var p = S.pick;
    S.clip = { n: p.n, a: p.a, b: p.b, op: "copy" };
    var s = S.strips[p.n], own = s && Array.isArray(s.edits) ? s.edits.filter(function (e2) { return e2.to <= p.a + 0.002 && p.b <= e2.to + (e2.b - e2.a) + 0.002; }).pop() : null;
    if (own) { S.clip.a = r3(own.a + (p.a - own.to)); S.clip.b = r3(S.clip.a + (p.b - p.a)); }   // inside a laid stretch: what it lays there
    if (kk === "x") {
      mark(); silenceRange(p.n, p.a, p.b, HOLE_F); S.pick = null;   // HERESY 1975: the place cut out fades into its silence and rises out of it
      keep(); draw(p.n); rangesNow(p.n); if (S.playing) play(pos());
      emit("change", { n: p.n, key: "muted" });
    }
    say(tr(kk === "x" ? "Cut {0}–{1}: silenced here, Ctrl+V lays it at the playhead" : "Copied {0}–{1}: Ctrl+V lays it at the playhead").replace("{0}", clock(p.a)).replace("{1}", clock(p.b)));
  }
  function clipLay() {                               // the stretch kept laid at the playhead on its own lane, and selected there
    var cl = S.clip, to = r3(Math.max(0, Math.min(S.info.seconds - 0.05, S.playing ? pos() : S.at))), sc = S.strips[cl.n] || (S.strips[cl.n] = {});
    if (!Array.isArray(sc.edits)) sc.edits = [];
    if (sc.edits.length >= MAX_EDITS) { say(tr("A lane holds at most 64 laid stretches: take one away first (a right-click on it)"), true); return; }
    mark();
    sc.edits.push({ op: "copy", a: cl.a, b: cl.b, to: to });
    S.pick = { n: cl.n, a: to, b: r3(Math.min(S.info.seconds, to + (cl.b - cl.a))) };
    keep(); draw(cl.n); rangesNow(cl.n);
    if (S.playing) play(pos());
    emit("change", { n: cl.n, key: "edits" });
    say(tr("Laid at {0}").replace("{0}", clock(to)));
  }
  function pickMove(n, dt, copy) {                   // the selection laid dt along: a laid stretch moves itself (or lays a copy); else the lane's own sound moves (or is copied)
    var p = S.pick, L = S.info.seconds, len = p.b - p.a, to = r3(Math.max(0, Math.min(L - 0.05, p.a + dt))), s = S.strips[n] || (S.strips[n] = {});
    if (Math.abs(to - p.a) < 0.005) { draw(n); return; }
    if (!Array.isArray(s.edits)) s.edits = [];
    var own = s.edits.filter(function (e2) { return e2.to <= p.a + 0.002 && p.b <= e2.to + (e2.b - e2.a) + 0.002; }).pop();
    var whole = own && Math.abs(own.to - p.a) < 0.002 && Math.abs((own.b - own.a) - len) < 0.002;
    if (!(whole && !copy) && s.edits.length >= MAX_EDITS - 2) { say(tr("A lane holds at most 64 laid stretches: take one away first (a right-click on it)"), true); draw(n); return; }
    mark();
    if (whole) {
      if (copy) s.edits.push({ op: "copy", a: own.a, b: own.b, to: to }); else own.to = to;
    } else if (own) {                                 // a part of a laid stretch: that part of what it lays, the rest of it stays
      var sa = r3(own.a + (p.a - own.to));
      if (!copy) silenceRange(n, p.a, p.b, HOLE_F);
      s.edits.push({ op: "copy", a: sa, b: r3(sa + len), to: to });
    } else {                                          // HERESY 1975: the lane's own sound carried away leaves a cut that fades and rises (its handles, a right-drag, its box)
      if (!copy) s.muted = mergeCuts((Array.isArray(s.muted) ? s.muted : []).concat([[p.a, p.b, HOLE_F, HOLE_F]]));
      s.edits.push({ op: "copy", a: p.a, b: p.b, to: to });   // laid from the sound as it was (the render cuts first, then lays)
    }
    S.pick = { n: n, a: to, b: r3(Math.min(L, to + len)) };
    keep(); draw(n); rangesNow(n); if (S.playing) play(pos());
    emit("change", { n: n, key: "edits" });
    say(tr(copy ? "Copied to {0}" : "Moved to {0}").replace("{0}", clock(to)));
  }
  function pickLevel(n, how) {                       // the level's line over the selection: in from silence, out into it, or 3 dB up or down; 10 ms to it from outside
    var p = S.pick, L = S.info.seconds, pts = sortedPts(n, "volume"), lp = expandPts(pts), a = p.a, b = p.b;
    var at = function (t) { return Math.round(autoDb(lp, t) * 10) / 10; }, lim = function (v) { return Math.max(-60, Math.min(12, Math.round(v * 10) / 10)); };
    var keepOut = pts.filter(function (q) { return q[0] < a - 0.0105 || q[0] > b + 0.0105; }), add = [];
    if (a > 0.0105) add.push([r3(a - 0.01), at(a - 0.01)]);
    if (b < L - 0.0105) add.push([r3(b + 0.01), at(b + 0.01)]);
    if (how === "in") add.push([a, -60], [b, at(b)]);
    else if (how === "out") add.push([a, at(a)], [b, -60]);
    else {
      add.push([a, lim(at(a) + how)], [b, lim(at(b) + how)]);
      pts.forEach(function (q) { if (q[0] > a && q[0] < b) add.push(q.length > 2 ? [q[0], lim(q[1] + how), q[2]] : [q[0], lim(q[1] + how)]); });   // 2318: its shape kept
    }
    mark();
    var s = S.strips[n] || (S.strips[n] = {});
    s.auto = keepOut.concat(add).sort(function (x, y) { return x[0] - y[0]; });
    keep(); draw(n); autoSchedule(n); lanePaintAuto(n);
    emit("change", { n: n, key: "auto" });
    say(tr(how === "in" ? "Faded in over {0}–{1}" : how === "out" ? "Faded out over {0}–{1}" : how > 0 ? "Louder by 3 dB over {0}–{1}" : "Quieter by 3 dB over {0}–{1}").replace("{0}", clock(a)).replace("{1}", clock(b)));
  }
  // HERESY 1975 (Viktor 31.10.2026: «как в ocenaudio… на вырезанном месте затухания/подъёмы, и возможность ползунком или правой кнопкой мыши тянуть
  // длительность»): a cut pressed with the right button and dragged: its fade on the nearer side follows the pointer (Shift: both alike); let go,
  // a box with a slider for each stays by it. Pressed and let go without a drag: the sound given back, as a right-click always did (1531)
  function holeDown(e) {
    var c = e.target.closest && e.target.closest("canvas[data-mx-wave]");
    if (!c || e.button !== 2 || !S.info || S.autoShow[c.dataset.mxWave]) return false;
    var n = c.dataset.mxWave, t = timeAt(c, e.clientX), s = S.strips[n];
    if (!s || !Array.isArray(s.muted) || autoAt(c, e, "volume").hit || splitNear(c, e) != null || pickAt(c, e)) return false;
    if (Array.isArray(s.edits) && s.edits.some(function (e2) { return e2.to <= t && t <= e2.to + (e2.b - e2.a); })) return false;   // a laid stretch's own right-click
    var r = s.muted.filter(function (q) { return q[0] <= t && t <= q[1]; }).pop();
    if (!r) return false;
    e.preventDefault();
    fadeBoxClose();
    S.rdrag = { n: n, c: c, r: r, x: e.clientX, side: e.shiftKey ? "both" : (t < (r[0] + r[1]) / 2 ? "fall" : "rise"), near: t < (r[0] + r[1]) / 2, moved: false };
    try { if (c.setPointerCapture) c.setPointerCapture(e.pointerId); } catch (x) { /* gone */ }
    return true;
  }
  function fadeSay(r) { var f = fadesOf(r); return tr("Into the silence {0} ms · out of it {1} ms").replace("{0}", Math.round(f[0] * 1000)).replace("{1}", Math.round(f[1] * 1000)); }
  function fadeSet(r, k, v) {                        // one side's fade, as long as the cut leaves room for the other's
    var f = fadesOf(r), len = r[1] - r[0];
    if (r.length < 4) { r[2] = f[0]; r[3] = f[1]; }
    if (k === "both") { r[2] = r[3] = r3(Math.max(0, Math.min(len / 2, v))); return; }
    var other = k === "fall" ? r[3] : r[2];
    r[k === "fall" ? 2 : 3] = r3(Math.max(0, Math.min(len - Math.min(other, len), v)));
  }
  function holeMove(e) {
    var d = S.rdrag;
    if (!d.moved && Math.abs(e.clientX - d.x) < 4) return;
    if (!d.moved) { d.moved = true; mark(); }
    var t = timeAt(d.c, e.clientX), r = d.r;
    fadeSet(r, d.side, d.side === "rise" || (d.side === "both" && !d.near) ? r[1] - t : t - r[0]);
    draw(d.n); rangesNow(d.n); say(fadeSay(r));
  }
  function holeUp(e) {
    var d = S.rdrag, s = S.strips[d.n];
    S.rdrag = null; S.rlast = Date.now();
    if (d.moved) { keep(); draw(d.n); rangesNow(d.n); emit("change", { n: d.n, key: "muted" }); fadeBox(d.n, d.r, e.clientX, e.clientY); return; }
    mark();                                           // HERESY 1531: a right-click gives the sound back, undoable
    s.muted = s.muted.filter(function (q) { return q !== d.r; });
    keep(); draw(d.n); rangesNow(d.n);
    emit("change", { n: d.n, key: "muted" });
  }
  function fadeBoxClose() {
    var b = $("mxFadeBox");
    if (!b) return;
    document.removeEventListener("pointerdown", b._out, true); window.removeEventListener("keydown", b._key, true);
    b.remove();
  }
  function fadeBox(n, r, x, y) {                     // the cut's two fades as sliders, by the pointer; Esc or a click away closes it
    fadeBoxClose();
    var len = r[1] - r[0], top = Math.max(20, Math.min(5000, Math.round(len * 1000))), b = document.createElement("div"), marked = true;
    b.id = "mxFadeBox"; b.className = "mx-fadebox"; b.setAttribute("role", "dialog");
    var row = function (k, label) {
      return '<label class="mx-fb-row"><span>' + esc(tr(label)) + '</span><input type="range" min="0" max="' + top + '" step="5" data-k="' + k + '" aria-label="' + esc(tr(label)) + '">' +
        '<output class="mono" data-o="' + k + '"></output></label>';
    };
    b.innerHTML = '<div class="mx-fb-head">' + esc(tr("Fades of {0}–{1}").replace("{0}", clock(r[0])).replace("{1}", clock(r[1]))) + "</div>" +
      row("fall", "Into the silence") + row("rise", "Out of the silence") +
      '<label class="check mx-fb-link"><input type="checkbox" data-both> <span>' + esc(tr("Both alike")) + "</span></label>" +
      '<p class="mx-fb-hint">' + esc(tr("A right-drag on a cut draws its fades; a right-click gives the sound back")) + "</p>";
    document.body.appendChild(b);
    var both = b.querySelector("[data-both]");
    function paint() { var f = fadesOf(r); [["fall", f[0]], ["rise", f[1]]].forEach(function (p) { b.querySelector('[data-k="' + p[0] + '"]').value = Math.round(p[1] * 1000); b.querySelector('[data-o="' + p[0] + '"]').textContent = Math.round(p[1] * 1000) + " ms"; }); }
    both.checked = Math.abs(fadesOf(r)[0] - fadesOf(r)[1]) < 0.0005;
    paint();
    b.addEventListener("input", function (e) {
      var k = e.target.dataset && e.target.dataset.k;
      if (!k) return;
      if (!marked) { mark(); marked = true; }
      fadeSet(r, both.checked ? "both" : k, (+e.target.value || 0) / 1000);
      paint(); draw(n); rangesNow(n); say(fadeSay(r));
    });
    b.addEventListener("change", function (e) {
      if (e.target === both) { if (both.checked) { mark(); fadeSet(r, "both", fadesOf(r)[0]); paint(); draw(n); rangesNow(n); } }
      keep(); emit("change", { n: n, key: "muted" }); marked = false;
    });
    marked = false;
    var w = b.offsetWidth, h = b.offsetHeight;
    b.style.left = Math.max(6, Math.min(x + 10, window.innerWidth - w - 6)) + "px";
    b.style.top = Math.max(6, Math.min(y + 10, window.innerHeight - h - 6)) + "px";
    b._out = function (e) { if (!b.contains(e.target)) fadeBoxClose(); };
    b._key = function (e) { if (e.key === "Escape") { e.stopImmediatePropagation(); e.preventDefault(); fadeBoxClose(); } };   // its Esc its own: not the canvas window's under it
    document.addEventListener("pointerdown", b._out, true); window.addEventListener("keydown", b._key, true);
  }
  function pickMenu(n, x, y) {
    var p = S.pick;
    window.HeresyMenu.open(x, y, [
      { label: "Copy", icon: "⧉", action: function () { clipTake("c"); } },
      { label: "Cut out", icon: "✂", action: function () { clipTake("x"); } },
      { label: "Lay at the playhead", icon: "↓", disabled: !S.clip || S.clip.n !== n, action: function () { clipLay(); } },
      { label: "Silence it", icon: "✕", action: function () { pickSilence(); } },
      { sep: true },
      { label: "Fade in from silence", icon: "◢", action: function () { pickLevel(n, "in"); } },
      { label: "Fade out into silence", icon: "◣", action: function () { pickLevel(n, "out"); } },
      { label: "Louder by 3 dB", icon: "+", action: function () { pickLevel(n, 3); } },
      { label: "Quieter by 3 dB", icon: "−", action: function () { pickLevel(n, -3); } },
      { label: "An LFO on its level…", icon: "\u223f", action: function () { lfoBox(n, "volume", p.a, p.b, x, y); } },   // HERESY 2318
      { label: "The spread of its level…", icon: "\u2195", disabled: !sortedPts(n, "volume").some(function (q2) { return q2[0] >= p.a && q2[0] <= p.b; }), action: function () { rangeBox(n, "volume", p.a, p.b, x, y); } },
      { sep: true },
      { label: "Split at its edges", icon: "│", action: function () { splitAt(n, [p.a, p.b]); } },
      { label: "Select the whole lane", icon: "↔", action: function () { pickSet(n, 0, S.info.seconds); } }
    ]);
  }
  // HERESY 1989: one lane painted again where it stands (its controls, its colour, its fold), its wave drawn again
  // HERESY 2006 (Viktor 01.11.2026: «универсальный плагин эффектов в сам DAW… банки эффектов или инструментов в SFZ формате… выбор доступных из
  // списка, их описания с полным инфо»): «+ Layer»: the shelf (GET /lab/banks), a bank's card in full, how it plays; laid on Forge by the step
  // «layer» as a strip of its own (1929's way), the set read again when it lands; its curves are the lane's own lines
  var LAYER = { banks: null, kind: "", q: "", pick: null, how: "bed", busy: false };
  var LAYER_KINDS = [["", "All"], ["instrument", "Instruments"], ["ambience", "Ambience"], ["effect", "Effects"], ["drone", "Drones"], ["voice", "Voices"]];
  var KIND_WORD = { instrument: "Instrument", ambience: "Ambience", effect: "Effect", drone: "Drone", voice: "Voice" };
  function layerOpen() {
    if (!S.take || !S.set) return;
    layerClose();
    var back = document.createElement("div");
    back.className = "mxl-back"; back.id = "mxLayer";
    back.innerHTML = '<div class="mxl-box" role="dialog" aria-modal="true" aria-label="' + esc(tr("A layer from a bank")) + '">' +
      '<div class="mxl-head"><b class="mxl-title">' + esc(tr("A layer from a bank")) + "</b>" +
      '<input type="search" class="mxl-q" placeholder="' + esc(tr("Search the shelf")) + '" autocomplete="off" />' +
      '<span class="mxl-kinds" role="group">' + LAYER_KINDS.map(function (k) {
        return '<button type="button" class="mx-ms mxl-kind' + (LAYER.kind === k[0] ? " is-on" : "") + '" data-mxl-kind="' + k[0] + '">' + esc(tr(k[1])) + "</button>"; }).join("") + "</span>" +
      '<button type="button" class="btn ghost small mxl-x" data-mxl="close" aria-label="' + esc(tr("Close")) + '" data-tip="' + esc(tr("Close")) + '">\u00d7</button></div>' +
      '<div class="mxl-body"><ul class="mxl-list" role="listbox"></ul><section class="mxl-card"></section></div></div>';
    document.body.appendChild(back);
    back.addEventListener("click", layerClick);
    back.addEventListener("mousedown", function (e) { if (e.target === back) layerClose(); });
    back.querySelector(".mxl-q").value = LAYER.q;
    back.querySelector(".mxl-q").addEventListener("input", function () { LAYER.q = this.value.trim().toLowerCase(); layerList(); });
    document.addEventListener("keydown", layerKey, true);
    if (LAYER.banks) layerList();
    else {
      back.querySelector(".mxl-list").innerHTML = '<li class="mxl-wait">' + esc(tr("Reading the shelf…")) + "</li>";
      getJson("/banks").then(function (d) { LAYER.banks = d.banks || []; layerList(); },
        function (e) { var b = $("mxLayer"); if (b) b.querySelector(".mxl-list").innerHTML = '<li class="mxl-wait is-bad">' + esc(e.message) + "</li>"; });
    }
    layerCard();
    back.querySelector(".mxl-q").focus();
  }
  function layerKey(e) { if (e.key === "Escape" && $("mxLayer")) { e.preventDefault(); e.stopPropagation(); layerClose(); } }
  function layerClose() { var b = $("mxLayer"); if (b) b.remove(); document.removeEventListener("keydown", layerKey, true); }
  function layerShown() {
    return (LAYER.banks || []).filter(function (b) {
      return (!LAYER.kind || b.kind === LAYER.kind) && (!LAYER.q || [b.name, b.description, b.author, b.licence, b.id].join(" ").toLowerCase().indexOf(LAYER.q) >= 0);
    });
  }
  function layerList() {
    var box = $("mxLayer");
    if (!box) return;
    var list = layerShown();
    box.querySelector(".mxl-list").innerHTML = list.length ? list.map(function (b) {
      return '<li><button type="button" class="mxl-row' + (LAYER.pick && LAYER.pick.id === b.id ? " is-on" : "") + '" data-mxl-bank="' + esc(b.id) + '" role="option" aria-selected="' + !!(LAYER.pick && LAYER.pick.id === b.id) + '">' +
        '<span class="mxl-name" translate="no">' + esc(b.name) + '</span><span class="mxl-meta"><span>' + esc(tr(KIND_WORD[b.kind] || b.kind)) + '</span> · <span translate="no">' + esc(b.licence) + "</span>" +
        (b.may_ship ? "" : " \u26a0") + " · " + b.mb + " MB</span></button></li>";
    }).join("") : '<li class="mxl-wait">' + esc(tr("Nothing on the shelf answers that")) + "</li>";
    Array.prototype.forEach.call(box.querySelectorAll(".mxl-kind"), function (k) { k.classList.toggle("is-on", k.dataset.mxlKind === LAYER.kind); });
  }
  function layerCard() {
    var box = $("mxLayer");
    if (!box) return;
    var c = LAYER.pick, el = box.querySelector(".mxl-card");
    if (!c) { el.innerHTML = '<p class="mxl-hint">' + esc(tr("Choose a bank on the left: its card says what it is, whose, under which licence and how large")) + "</p>"; return; }
    var amb = c.kind === "ambience" && !(c.sfz || []).length;
    var rows = [["Kind", tr(KIND_WORD[c.kind] || c.kind)], ["Where", c.where], ["Licence", c.licence + " · " + tr(c.may_ship ? "may ship" : "not to ship as it stands")],
                ["Author", c.author], ["Source", c.source], ["Samples", c.samples + " · " + c.mb + " MB"]];
    var field = function (cls, tip, label, input) { return '<label class="field ' + cls + '" data-tip="' + esc(tr(tip)) + '"><span class="label">' + esc(tr(label)) + "</span>" + input + "</label>"; };
    el.innerHTML = '<h4 class="mxl-cname" translate="no">' + esc(c.name) + "</h4>" + (c.description ? '<p class="mxl-desc" translate="no">' + esc(c.description) + "</p>" : "") +
      '<dl class="mxl-dl">' + rows.filter(function (r) { return r[1]; }).map(function (r) { return "<dt>" + esc(tr(r[0])) + '</dt><dd translate="no">' + esc(r[1]) + "</dd>"; }).join("") + "</dl>" +
      (amb ? '<p class="mxl-hint">' + esc(tr("Its field recordings as a bed under the song, looped without a seam")) + "</p>" :
        ((c.sfz || []).length > 1 ? field("mxl-sfzwrap", "Which of the bank's instruments plays", "Instrument", '<select class="mxl-sfz">' + c.sfz.map(function (s) {
          return '<option value="' + esc(s) + '" translate="no">' + esc(s.split("/").pop().replace(/\.sfz$/i, "")) + "</option>"; }).join("") + "</select>") : "") +
        '<div class="mxl-how" role="radiogroup">' + [["bed", "Bed", "One note held through the song, struck again before it dies"], ["drone", "Drone", "The song's key, its root and fifth, held low"],
          ["notes", "Notes", "A MIDI file of the tree, a stem's notes or yours, moved up or down"]].map(function (h) {
          return '<button type="button" role="radio" class="mx-ms mxl-h' + (LAYER.how === h[0] ? " is-on" : "") + '" data-mxl-how="' + h[0] + '" aria-checked="' + (LAYER.how === h[0]) + '" data-tip="' + esc(tr(h[2])) + '">' + esc(tr(h[1])) + "</button>"; }).join("") + "</div>" +
        '<div class="mxl-row2">' +
        field("", "The note held, like C3 or 48; auto: C4 for a bed, the song's key for a drone", "Note", '<input type="text" class="mxl-note" value="auto" spellcheck="false" />') +
        field("", "Semitones up or down", "Transpose", '<input type="number" class="mxl-tr" min="-24" max="24" step="1" value="0" />') +
        field("mxl-midiwrap", "The MIDI file played (Notes): a stem's notes from MIDI or Basic Pitch, or one of yours in the tree", "MIDI", '<select class="mxl-midi"><option value="">' + esc(tr("none in the tree")) + "</option></select>") + "</div>") +
      '<div class="mxl-row2">' +
      field("", "Its level against the song where both sound, in dB", "Level, dB", '<input type="number" class="mxl-level" min="-40" max="0" step="1" value="-18" />') +
      field("", "Seconds it takes to come in", "Fade in, s", '<input type="number" class="mxl-fin" min="0" max="30" step="0.5" value="4" />') +
      field("", "Seconds it takes to go", "Fade out, s", '<input type="number" class="mxl-fout" min="0" max="30" step="0.5" value="6" />') + "</div>" +
      '<div class="mxl-acts"><button type="button" class="btn primary small" data-mxl="lay"' + (LAYER.busy ? " disabled" : "") + ' data-tip="' +
        esc(tr("Laid under the song on Forge as a strip of its own; its curves are the lane's own lines (A)")) + '">' + esc(tr("Lay it")) + '</button><span class="mxl-state row-hint"></span></div>';
    if (!amb) layerMidi();
  }
  function layerMidi() {                               // the tree's MIDI files, for Notes
    if (!S.take) return;
    var name = S.take.name;
    fetch("/lab/derived?name=" + encodeURIComponent(name), { priority: "low" }).then(function (r) { return r.json(); }).then(function (r) {
      var box = $("mxLayer"), sel = box && box.querySelector(".mxl-midi");
      if (!sel || !S.take || S.take.name !== name) return;
      var mids = [];
      (r.derived || []).forEach(function (m) { (m.files || []).forEach(function (f) {
        if (/\.mid$/i.test(f.file || "")) mids.push({ v: f.path || ("derived/" + m.id + "/" + f.file), l: (m.label || m.id) + " · " + (f.name || f.file) });
      }); });
      if (mids.length) sel.innerHTML = mids.map(function (m) { return '<option value="' + esc(m.v) + '" translate="no">' + esc(m.l) + "</option>"; }).join("");
    }, function () { /* no tree: none offered */ });
  }
  function layerClick(e) {
    var t = e.target.closest && e.target.closest("button");
    if (!t) return;
    if (t.dataset.mxl === "close") { layerClose(); return; }
    if (t.dataset.mxlKind != null) { LAYER.kind = t.dataset.mxlKind; layerList(); return; }
    if (t.dataset.mxlBank) { LAYER.pick = (LAYER.banks || []).filter(function (b) { return b.id === t.dataset.mxlBank; })[0] || null; layerList(); layerCard(); return; }
    if (t.dataset.mxlHow) {
      LAYER.how = t.dataset.mxlHow;
      Array.prototype.forEach.call($("mxLayer").querySelectorAll(".mxl-h"), function (b) { var on = b.dataset.mxlHow === LAYER.how; b.classList.toggle("is-on", on); b.setAttribute("aria-checked", on); });
      return;
    }
    if (t.dataset.mxl === "lay") layerRun();
  }
  function layerRun() {
    var box = $("mxLayer"), c = LAYER.pick;
    if (!box || !c || !S.take) return;
    var v = function (s) { var el = box.querySelector(s); return el ? el.value : ""; };
    var amb = c.kind === "ambience" && !(c.sfz || []).length;
    var params = { bank: c.id, sfz: v(".mxl-sfz"), how: amb ? "bed" : LAYER.how, note: v(".mxl-note") || "auto", transpose: v(".mxl-tr") || "0", midi: v(".mxl-midi"),
                   level: v(".mxl-level") || "-18", fade_in: v(".mxl-fin") || "4", fade_out: v(".mxl-fout") || "6" };
    var st = box.querySelector(".mxl-state"), said = function (s, bad) { if (st) { st.textContent = s; st.classList.toggle("is-bad", !!bad); } };
    if (params.how === "notes" && !params.midi) { said(tr("Notes: choose a MIDI file of the tree"), true); return; }
    var lay = box.querySelector('[data-mxl="lay"]'), name = S.take.name;
    LAYER.busy = true; if (lay) lay.disabled = true;
    said(tr("Laying it under the song…"));
    fetch("/lab/plugin/run", { method: "POST", headers: { "Content-Type": "application/json" },
                               body: JSON.stringify({ name: name, source: S.set, plugin: "ruach", step: "layer", params: params }) })
      .then(function (r) { return r.json().then(function (b) { if (!r.ok) throw new Error(b.error || r.status); return b; }); })
      .then(function (job) { layerWatch(name, job.id, said); },
            function (e) { LAYER.busy = false; var b2 = $("mxLayer"); if (b2) b2.querySelector('[data-mxl="lay"]').disabled = false; said(tr("It did not start: {0}").replace("{0}", e.message), true); });
  }
  function layerWatch(name, id, said) {
    fetch("/lab/derived?name=" + encodeURIComponent(name), { priority: "low" }).then(function (r) { return r.json(); }).then(function (r) {
      var job = (r.running || []).filter(function (j) { return j.id === id; })[0], made = (r.derived || []).some(function (m) { return m.id === id; });
      var free = function () { LAYER.busy = false; var b = $("mxLayer"); if (b) b.querySelector('[data-mxl="lay"]').disabled = false; };
      if (job && job.status === "failed") { free(); said(job.error || "failed", true); return; }
      if (made || !job) {
        free();
        said(made ? tr("Laid: a strip of its own in the DAW") : "");
        if (made) { if (window.HeresyDerived) window.HeresyDerived.refresh(); if (S.take && S.take.name === name) open(); }
        return;
      }
      setTimeout(function () { layerWatch(name, id, said); }, 2000);
    }, function () { setTimeout(function () { layerWatch(name, id, said); }, 4000); });
  }
  function lanePaint(n) {
    var row = document.querySelector('.mx-lane[data-strip="' + (window.CSS && CSS.escape ? CSS.escape(n) : n) + '"]');
    if (!row) return;
    var tmp = document.createElement("div");
    tmp.innerHTML = lane(n);
    row.replaceWith(tmp.firstChild);
    draw(n);
    paintPlayhead();
  }
  // HERESY 1989: a lane dragged by its name to another place among the lanes
  function nameDown(e) {
    var nm = e.target.closest && e.target.closest(".mx-lane[data-strip] .mx-name");
    if (!nm || e.button !== 0) return false;
    var row = nm.closest(".mx-lane"), n = row.dataset.strip, y0 = e.clientY, moved = false;
    var move = function (ev) {
      if (!moved && Math.abs(ev.clientY - y0) < 6) return;
      moved = true;
      row.classList.add("is-drag");
      row.style.transform = "translateY(" + (ev.clientY - y0) + "px)";
    };
    var up = function (ev) {
      document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up);
      row.classList.remove("is-drag"); row.style.transform = "";
      if (!moved) return;
      S.laneDragged = true;
      setTimeout(function () { S.laneDragged = false; }, 0);   // the click that follows a drag, if any, comes before this
      var order = laneOrder().filter(function (m) { return m !== n; }), rows = Array.prototype.slice.call(document.querySelectorAll(".mx-lane[data-strip]")).filter(function (r) { return r !== row; });
      var at = rows.filter(function (r) { var b = r.getBoundingClientRect(); return ev.clientY > b.top + b.height / 2; }).length;
      order.splice(at, 0, n);
      LANE_O[S.set] = order; lsPut("yue2.mxLaneO", LANE_O);
      paint();
      emit("paint");
    };
    document.addEventListener("pointermove", move); document.addEventListener("pointerup", up);
    return true;
  }
  // HERESY 1989: Alt+Shift+drag on a wave: the whole lane later or earlier, 10 ms steps (1 ms with Ctrl too)
  function shiftDown(e) {
    var c = e.target.closest && e.target.closest("canvas[data-mx-wave]");
    if (!c || e.button !== 0 || !e.altKey || !e.shiftKey || !S.info) return false;
    e.preventDefault(); e.stopPropagation();
    var n = c.dataset.mxWave, s = S.strips[n] || (S.strips[n] = {}), o0 = +s.offset_s || 0, x0 = e.clientX, w = c.getBoundingClientRect().width;
    mark();
    try { if (c.setPointerCapture) c.setPointerCapture(e.pointerId); } catch (x) { /* gone */ }
    var move = function (ev) {
      var step = ev.ctrlKey ? 0.001 : 0.01, v = o0 + (ev.clientX - x0) / Math.max(1, w) * span();
      v = Math.max(-30, Math.min(30, Math.round(v / step) * step));
      s.offset_s = Math.abs(v) < step / 2 ? undefined : +v.toFixed(3);
      draw(n);
    };
    var up = function () {
      document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up);
      changed(n); lanePaint(n);
      if (S.playing) play(pos());
    };
    document.addEventListener("pointermove", move); document.addEventListener("pointerup", up);
    return true;
  }
  function onDown(e) {
    if (gripDown(e)) return;                          // HERESY 1965: a lane's height in hand
    if (nameDown(e)) return;                          // HERESY 1989: a lane's place in hand
    if (shiftDown(e)) return;                         // HERESY 1989: a lane's shift in hand
    if (rulerDown(e)) return;                         // HERESY 1501
    if (chordDown(e)) return;                         // HERESY 2314
    if (holeDown(e)) return;                          // HERESY 1975: a cut's fades drawn with the right button
    var c = e.target.closest && e.target.closest("canvas[data-mx-wave]");
    if (!c || e.button !== 0 || !S.info) return;
    if (e.altKey && !e.shiftKey) {                    // HERESY 2317: Alt pressed, the lane alone while held; 2318: with its line in hand, a segment bent
      if (S.autoShow[c.dataset.mxWave]) { if (bendDown(e, c)) return; }
      else { auditionDown(e, c); return; }
    }
    if (S.autoShow[c.dataset.mxWave] && !e.shiftKey) { autoDown(e, c); return; }   // HERESY 1535; 2318: Shift+drag selects a stretch for an LFO or a range
    e.preventDefault();
    var n = c.dataset.mxWave, pe = pickAt(c, e), hold = function () { try { if (c.setPointerCapture) c.setPointerCapture(e.pointerId); } catch (x) { /* gone */ } };
    if (pe === "a" || pe === "b") { S.sdrag = { n: n, c: c, side: pe }; hold(); return; }   // HERESY 1968: the selection's edge in hand
    var hit = cutAt(c, e);                            // HERESY 1542: a stretch's edge in hand
    if (hit) {
      S.cdrag = { n: c.dataset.mxWave, c: c, r: hit.r, kind: hit.kind, x: e.clientX, moved: false };
      hold();
      return;
    }
    var la = lineAt(c, e);                            // HERESY 1968: a point of the level's line in hand
    if (la && la.hit) { lineDown(e, c, la); return; }
    if (pe === "in") {                                // HERESY 1968: the selection taken to move (Ctrl: a copy of it)
      S.mdrag = { n: n, c: c, x: e.clientX, t0: timeAt(c, e.clientX), dt: 0, copy: !!(e.ctrlKey || e.metaKey), moved: false };
      hold();
      return;
    }
    if (la) { lineDown(e, c, la); return; }           // HERESY 1968: the line pressed: a point made there once the pointer moves
    var t = timeAt(c, e.clientX), far = e.shiftKey && S.pick && S.pick.n === n ? (t < (S.pick.a + S.pick.b) / 2 ? S.pick.b : S.pick.a) : null;
    S.drag = { name: n, canvas: c, x: e.clientX, a: far == null ? t : far, a0: far == null ? t : far, b: t, moved: far != null };   // HERESY 1968: a drag selects (Shift stretches the selection)
    hold();
  }
  function onMove(e) {
    if (S.rdrag) { holeMove(e); return; }             // HERESY 1975
    var rr = S.rule;                                  // HERESY 1501: the loop drawn
    if (rr) {
      if (rr.sec) return;                             // HERESY 1532: a section's block is clicked, not dragged
      rr.b = gridSnap(timeAt(rr.canvas, e.clientX), rr.canvas.getBoundingClientRect().width, e);   // HERESY 2313
      if (Math.abs(e.clientX - rr.x) > 4) rr.moved = true;
      if (rr.moved) { S.loop = [Math.min(rr.a, rr.b), Math.max(rr.a, rr.b)]; drawRuler(); }
      return;
    }
    if (S.adrag) {                                    // HERESY 1535: a point moved, between its neighbours
      var ad = S.adrag, at = autoAt(ad.c, e, ad.prm), pts, i;   // 1559: of the knob in hand (1968: the level's line, when it was taken there)
      if (ad.pending) {                               // HERESY 1968: a point made on the line only once it moves (a click on it plays from there)
        if (Math.abs(e.clientX - ad.x) < 3 && Math.abs(e.clientY - ad.y) < 3) return;
        mark(); var made = rawPts(ad.n, "volume", true); ad.pending.forEach(function (q2) { made.push(q2); }); ad.pending = null;
      }
      pts = sortedPts(ad.n, at.prm); i = pts.indexOf(ad.q);
      var lo = i > 0 ? pts[i - 1][0] + 0.001 : 0, hi = i >= 0 && i < pts.length - 1 ? pts[i + 1][0] - 0.001 : S.info.seconds;
      ad.q[0] = Math.round(Math.max(lo, Math.min(hi, at.t)) * 1000) / 1000; ad.q[1] = at.db; ad.moved = true;
      draw(ad.n);
      return;
    }
    if (S.sdrag) {                                    // HERESY 1968: the selection's edge moved
      var sd = S.sdrag, st = snapT(sd.n, timeAt(sd.c, e.clientX), sd.c, e);   // 1972: it clings
      if (sd.side === "a") S.pick.a = r3(Math.min(S.pick.b - 0.05, st)); else S.pick.b = r3(Math.max(S.pick.a + 0.05, st));
      draw(sd.n);
      return;
    }
    if (S.mdrag) {                                    // HERESY 1968: the selection carried along, drawn where it would be laid
      var md = S.mdrag;
      if (!md.moved && Math.abs(e.clientX - md.x) < 4) return;
      md.moved = true; md.copy = md.copy || !!(e.ctrlKey || e.metaKey); md.dt = timeAt(md.c, e.clientX) - md.t0;
      var len = S.pick.b - S.pick.a, s0 = S.pick.a + md.dt, sa = snapT(md.n, s0, md.c, e), sb = snapT(md.n, s0 + len, md.c, e);   // 1972: its start clings, or its end
      md.dt = sa !== r3(s0) ? sa - S.pick.a : sb !== r3(s0 + len) ? sb - len - S.pick.a : md.dt;
      md.c.style.cursor = md.copy ? "copy" : "grabbing";
      draw(md.n);
      return;
    }
    var cd = S.cdrag;                                 // HERESY 1542
    if (cd) {
      if (!cd.moved && Math.abs(e.clientX - cd.x) < 2) return;
      if (!cd.moved) { mark(); cd.moved = true; }
      cutMove(cd, timeAt(cd.c, e.clientX));
      draw(cd.n);
      return;
    }
    var d = S.drag;
    if (!d) {                                         // HERESY 1542: the pointer says what a press would take
      var hc = e.target.closest && e.target.closest("canvas[data-mx-wave]");
      if (hc && S.info && !S.autoShow[hc.dataset.mxWave]) {   // 1968: the selection's edges and inside, the level's line
        var hp = pickAt(hc, e), hh = cutAt(hc, e), hl = !hh && hp !== "a" && hp !== "b" && lineAt(hc, e);
        hc.style.cursor = hp === "a" || hp === "b" || hh ? "ew-resize" : hl && hl.hit ? "move" : hp === "in" ? "grab" : hl ? "ns-resize" : "";
        var lh = hl ? hc.dataset.mxWave : "";
        if (lh !== S.lineHover) { var lw = S.lineHover; S.lineHover = lh; if (lw) draw(lw); if (lh) draw(lh); }
      } else if (S.lineHover) { var lw2 = S.lineHover; S.lineHover = ""; draw(lw2); }
      return;
    }
    d.b = snapT(d.name, timeAt(d.canvas, e.clientX), d.canvas, e);   // 1972: both edges cling
    if (Math.abs(e.clientX - d.x) > 4) d.moved = true;
    if (d.moved && d.a0 != null) d.a = snapT(d.name, d.a0, d.canvas, e);
    if (d.moved) draw(d.name);
  }
  function onUp(e) {
    if (S.rdrag) { holeUp(e); return; }               // HERESY 1975
    var rr = S.rule;                                  // HERESY 1501: the ruler let go: a click goes there, a drag keeps its loop
    if (rr) {
      S.rule = null;
      if (!rr.moved) { if (S.playing) play(rr.a); else { S.at = rr.a; paintPlayhead(); } return; }
      if (!S.loop || S.loop[1] - S.loop[0] < 0.2) { S.loop = null; S.loopOn = false; } else S.loopOn = true;
      loopPaint();
      return;
    }
    if (S.adrag) {                                    // HERESY 1535: the point let go: kept, heard
      var ad = S.adrag; S.adrag = null;
      if (ad.pending) { if (S.playing) play(ad.t); else { S.at = ad.t; paintPlayhead(); } return; }   // HERESY 1968: the line clicked, not taken
      keep(); draw(ad.n); autoSchedule(ad.n); lanePaintAuto(ad.n);
      emit("change", { n: ad.n, key: "auto" });
      return;
    }
    if (S.sdrag) { S.sdrag = null; say(pickSay()); return; }   // HERESY 1968
    if (S.mdrag) {                                    // HERESY 1968: laid where it was carried; a click in it plays from there and lets it go
      var md = S.mdrag; S.mdrag = null; md.c.style.cursor = "";
      if (!md.moved) { S.pick = null; draw(md.n); say(""); if (S.playing) play(md.t0); else { S.at = md.t0; paintPlayhead(); } return; }
      pickMove(md.n, md.dt, md.copy);
      return;
    }
    if (S.cdrag) {                                    // HERESY 1542: the stretch's edge let go: kept, heard
      var cd = S.cdrag; S.cdrag = null;
      if (cd.moved) { keep(); draw(cd.n); rangesNow(cd.n); emit("change", { n: cd.n, key: "muted" }); }
      return;
    }
    var d = S.drag;
    if (!d) return;
    S.drag = null;
    if (!d.moved) {                                   // a click: from there, the selection let go (1968)
      if (S.pick) { var pw = S.pick.n; S.pick = null; draw(pw); say(""); }
      var da = snapT(d.name, d.a, d.canvas, e);       // HERESY 2313: a click clings too (Alt held: free)
      if (S.playing) play(da); else { S.at = da; paintPlayhead(); }
      return;
    }
    var a = Math.min(d.a, d.b), b = Math.max(d.a, d.b);
    if (b - a < 0.05) return draw(d.name);
    pickSet(d.name, a, b);                            // HERESY 1968 (1564's Shift no more needed): a drag selects, nothing silenced
  }
  function lanePaintAuto(n) {
    var b = document.querySelector('.mx-lane[data-strip="' + n + '"] [data-mx="auto"]');
    if (b) { b.classList.toggle("is-on", !!S.autoShow[n]); b.setAttribute("aria-pressed", !!S.autoShow[n]); b.classList.toggle("has-auto", hasAuto(n)); }
    var bp = document.querySelector('.mx-lane[data-strip="' + n + '"] [data-mx="autop"]');   // HERESY 1559
    if (bp) { bp.hidden = !S.autoShow[n]; bp.textContent = tr(AUTO_P[autoParam(n)].short); bp.classList.toggle("has-auto", autoParam(n) === "volume" ? strip(n).auto.length > 0 : rawPts(n, autoParam(n)).length > 0); }
  }
  // HERESY 1966: a lane's own menu, as a DAW has one
  function laneRow(n) { return Array.prototype.filter.call(document.querySelectorAll("#mxLanes .mx-lane[data-strip]"), function (r) { return r.dataset.strip === n; })[0] || null; }
  function setLaneH(n, h) {
    if (h === LANE_DEF) delete LANE_H[n]; else LANE_H[n] = h;
    laneKeep();
    var row = laneRow(n);
    if (row) row.style.setProperty("--mx-h", h + "px");
    draw(n); paintPlayhead();
  }
  function devicesOf(n) {
    if (!S.dock) { S.dock = true; keepFlag("yue2.mixer.dock", true); var dk = $("mxDock"); if (dk) dk.hidden = false; paintHead(); }
    if (window.HeresyConsole) window.HeresyConsole.select(n, "devices");
    var dk2 = $("mxDock"); if (dk2) dk2.scrollIntoView({ block: "nearest" });
  }
  // HERESY 2018 (the DAW research of 02.11.2026, §1.11: a channel strip's preset, as every DAW keeps them): a lane's sound kept by name, its trim, EQ,
  // gate, compressor, width, pan and sends; never its level, mute, solo, silences, moves, automation, channel, polarity or version. In this browser
  // and with it in the Studio's settings (yue2.mixer.presets, as every yue2.* key), laid on any lane of any set from the lane's menu; undone as one
  var PRESET_KEY = "yue2.mixer.presets", PRESET_FIELDS = ["trim_db", "eq", "gate", "comp", "width", "pan", "reverb", "delay"], PRESET_MAX = 50;
  function presetsAll() { try { var p = JSON.parse(localStorage.getItem(PRESET_KEY) || "{}"); return p && typeof p === "object" && !Array.isArray(p) ? p : {}; } catch (e) { return {}; } }
  function presetsKeep(all) { try { if (Object.keys(all).length) localStorage.setItem(PRESET_KEY, JSON.stringify(all)); else localStorage.removeItem(PRESET_KEY); } catch (e) { /* private mode */ } }
  function presetOf(n) { var s = S.strips[n] || {}, out = {}; PRESET_FIELDS.forEach(function (k) { if (s[k] != null) out[k] = JSON.parse(JSON.stringify(s[k])); }); return out; }
  function presetSave(n) {
    if (!window.HeresyDialog) return Promise.resolve(false);
    return window.HeresyDialog.prompt(tr("A name for this lane's sound (its EQ, gate, compressor, width, pan and sends)"), n.replace(/_/g, " "), { max: 40, ok: tr("Save"), name: true })   /* HERESY 2462 */.then(function (v) {
      v = v == null ? "" : String(v).replace(/\s+/g, " ").trim().slice(0, 40);
      if (!v) return false;
      var all = presetsAll();
      if (!all[v] && Object.keys(all).length >= PRESET_MAX) { say(tr("{0} presets at most").replace("{0}", PRESET_MAX), true); return false; }
      all[v] = presetOf(n); presetsKeep(all); say(tr("Preset «{0}» kept").replace("{0}", v));
      return true;
    });
  }
  function presetLay(n, name) {
    var p = presetsAll()[name];
    if (!p || names().indexOf(n) < 0) return false;
    mark();
    var st = S.strips[n] || (S.strips[n] = {});
    PRESET_FIELDS.forEach(function (k) { if (p[k] != null) st[k] = JSON.parse(JSON.stringify(p[k])); else delete st[k]; });
    if (st.comp && st.comp.key && (st.comp.key === n || names().indexOf(st.comp.key) < 0)) st.comp.key = "";   // a key of another set is no key here
    changed(n); emit("change", { n: n });
    say(tr("«{0}» laid on {1}").replace("{0}", name).replace("{1}", n));
    return true;
  }
  function presetDel(name) { var all = presetsAll(); delete all[name]; presetsKeep(all); say(tr("Preset «{0}» deleted").replace("{0}", name)); }
  function laneMenu(n, x, y) {
    var s = strip(n), row = laneRow(n), press = function (k) { var b = row && row.querySelector('[data-mx="' + k + '"]'); if (b) b.click(); };
    var H = [[LANE_MIN, "Short (40 px)"], [LANE_DEF, "As it comes (72 px)"], [96, "Tall (96 px)"], [LANE_MAX, "Tallest (120 px)"]];
    var cut = s.muted.length > 0 || s.edits.length > 0 || splitsOf(n).length > 0, pks = Object.keys(presetsAll()).sort();   // 2018: the presets
    window.HeresyMenu.open(x, y, [
      { label: s.mute ? "Unmute" : "Mute", icon: "M", checked: s.mute, action: function () { press("mute"); } },
      { label: s.solo ? "Unsolo" : "Solo", icon: "S", checked: s.solo, action: function () { press("solo"); } },
      { label: S.autoShow[n] ? "Hide its automation" : "Its automation", icon: "A", action: function () { press("auto"); } },
      { label: "Its devices in the console", icon: "\u2261", action: function () { devicesOf(n); } },
      { label: "Bounce in place", icon: "\u2913", items: bounceItems(n) },   // HERESY 2316
      { label: "Save its sound as a preset…", icon: "\u2913", action: function () { presetSave(n); } },   // HERESY 2018
      { label: "Its sound from a preset", icon: "\u21e9", items: pks.length ? pks.map(function (k) { return { label: k, raw: true, action: function () { presetLay(n, k); } }; })
        : [{ label: "No presets yet", muted: true, hint: "Save a lane's sound first: Save its sound as a preset… in its menu" }] },
      pks.length && { label: "Delete a preset", icon: "\u2715", items: pks.map(function (k) { return { label: k, raw: true, danger: true, action: function () { presetDel(k); } }; }) },
      { sep: true },
      { label: "Split at the playhead", icon: "\u2502", action: function () { splitAt(n, [S.playing ? pos() : S.at]); } },   // HERESY 1968
      { label: "Select the whole lane", icon: "\u2194", action: function () { pickSet(n, 0, S.info.seconds); } },
      { label: "Height", icon: "\u2195", items: H.map(function (h) { return { label: h[1], checked: laneH(n) === h[0], action: function () { setLaneH(n, h[0]); } }; }) },
      { label: "Level back to 0 dB", icon: "0", action: function () {
        mark(); (S.strips[n] || (S.strips[n] = {})).gain_db = 0; changed(n);
        var f = row && row.querySelector('input[data-mx="gain_db"]'); if (f) { f.value = 0; var o = f.parentNode.querySelector("output"); if (o) o.textContent = fmtDb(0); }
      } },
      cut && { label: "Its silences and moves taken off", icon: "\u2715", action: function () {   // only when it has some
        mark(); var t = S.strips[n] || (S.strips[n] = {}); t.muted = []; t.edits = []; t.splits = [];   // 1968: its splits with them
        keep(); draw(n); rangesNow(n); if (S.playing) play(pos()); emit("change", { n: n });
      } },
      { label: "The lane as split: its level, mute, silences, sends and devices", icon: "\u21ba", action: function () { mark(); delete S.strips[n]; delete S.versions[n]; restored(); } }
    ].filter(Boolean));
  }
  function onMenu(e) {
    var rfb = e.target.closest && e.target.closest("#mxRef, #mxGrid");   // HERESY 2315: the reference's menu; 2313: the grid's
    if (rfb && S.info && window.HeresyMenu) { e.preventDefault(); if (rfb.id === "mxRef") refMenu(e.clientX, e.clientY); else gridMenu(e.clientX, e.clientY); return; }
    var rcm = e.target.closest && e.target.closest("canvas[data-mx-ruler]");   // HERESY 2016: a marker's own menu on the ruler
    if (rcm && S.info && window.HeresyMenu) {
      var rr = rcm.getBoundingClientRect(), mk = markNear(e.clientX - rr.left, rr.width);
      if (mk) { e.preventDefault(); markMenu(mk, e.clientX, e.clientY); return; }
      e.preventDefault(); gridMenu(e.clientX, e.clientY, timeAt(rcm, e.clientX)); return;   // HERESY 2313: «a bar begins here» and the rest
    }
    // HERESY 1966 (Viktor: «контекстное меню, как в Bitwig… Mute трека и остальное»): the lane's left part, its name and buttons (its version's
    // own right-click and the fields aside)
    var ctl = e.target.closest && e.target.closest(".mx-lane[data-strip]");   // the whole left part: a lane is taller than its row of buttons
    if (ctl && window.HeresyMenu && !e.target.closest(".mx-wave, .mx-grip, .mx-verb, input, select")) {
      e.preventDefault();
      laneMenu(ctl.dataset.strip, e.clientX, e.clientY);
      return;
    }
    var vbm = e.target.closest && e.target.closest(".mx-lane[data-strip] .mx-verb");   // HERESY 1538: its versions as chips, in its devices
    if (vbm) {
      e.preventDefault();
      var vrow = vbm.closest(".mx-lane").dataset.strip;
      if (!S.dock) { S.dock = true; keepFlag("yue2.mixer.dock", true); var dk2 = $("mxDock"); if (dk2) dk2.hidden = false; paintHead(); }
      if (window.HeresyConsole) window.HeresyConsole.select(vrow, "devices");
      var dk3 = $("mxDock"); if (dk3) dk3.scrollIntoView({ block: "nearest" });
      return;
    }
    var c = e.target.closest && e.target.closest("canvas[data-mx-wave]");
    if (!c) return;
    if (S.autoShow[c.dataset.mxWave] && S.info) {     // HERESY 1535: a point taken away
      var a = autoAt(c, e);
      e.preventDefault();
      if (!a.hit) { if (window.HeresyMenu) shapeMenu(a.n, a.prm, a.t, e.clientX, e.clientY); return; }   // HERESY 2318: a segment's shape, an LFO, a range
      mark();
      var gone = rawPts(a.n, a.prm), at2 = gone.indexOf(a.hit);   // HERESY 1559: from the knob in hand's list
      if (at2 >= 0) gone.splice(at2, 1);
      keep(); draw(a.n); autoSchedule(a.n); lanePaintAuto(a.n);
      emit("change", { n: a.n, key: "auto" });
      return;
    }
    if (S.info) {                                     // HERESY 1968: the level's point taken away, a split joined, the selection's own menu
      var lq = autoAt(c, e, "volume");
      if (lq.hit) {
        e.preventDefault(); mark();
        var lst = rawPts(lq.n, "volume"), li = lst.indexOf(lq.hit); if (li >= 0) lst.splice(li, 1);
        keep(); draw(lq.n); autoSchedule(lq.n); lanePaintAuto(lq.n); emit("change", { n: lq.n, key: "auto" });
        return;
      }
      var sp = splitNear(c, e);
      if (sp != null) {
        e.preventDefault(); mark();
        var ss = S.strips[c.dataset.mxWave]; ss.splits = ss.splits.filter(function (x) { return x !== sp; });
        keep(); draw(c.dataset.mxWave); say(tr("Joined at {0}").replace("{0}", clock(sp)));
        return;
      }
      if (pickAt(c, e) && window.HeresyMenu) { e.preventDefault(); pickMenu(c.dataset.mxWave, e.clientX, e.clientY); return; }
    }
    var n = c.dataset.mxWave, t = timeAt(c, e.clientX), s = S.strips[n];
    var ed = s && Array.isArray(s.edits) ? s.edits.filter(function (e2) { return e2.to <= t && t <= e2.to + (e2.b - e2.a); }).pop() : null;   // HERESY 1564: the last laid there
    if (ed) {
      e.preventDefault();
      mark();
      s.edits = s.edits.filter(function (e2) { return e2 !== ed; });
      keep(); draw(n); rangesNow(n);
      if (S.playing) play(pos());
      emit("change", { n: n, key: "edits" });
      return;
    }
    if (S.rdrag) { e.preventDefault(); return; }      // HERESY 1975: pressed with the right button (the menu comes with the press here): decided when let go
    if (S.rlast && Date.now() - S.rlast < 600) { e.preventDefault(); S.rlast = 0; return; }   // …or the menu comes after it was let go: done then
    if (!s || !s.muted) return;
    var left = s.muted.filter(function (r) { return !(r[0] <= t && t <= r[1]); });
    if (left.length === s.muted.length) return;
    e.preventDefault();
    mark();                                           // HERESY 1531: the silence given back, undoable
    s.muted = left;
    keep(); draw(n); rangesNow(n);
    emit("change", { n: n, key: "muted" });
  }

  // ---- HERESY 2313–2318 (Viktor's plan of 08.11.2026, §2.4, the DAW list of 02.11; his «агенты как не в себя гонят» of 10.11): the bar grid and
  // the chord lane, the reference from anywhere, bounce in place, the audition, the lines' shapes

  // HERESY 2313: the take's bar grid (heresy-bars.js, lab/bargrid.py), heard once a take on Forge; drawn on the ruler and through the lanes, and the
  // cuts, the copies, the loop and a click cling to its lines within 6 px while it is on (G; Alt held lets go)
  function gridData() { var g = S.take && window.RuachBars ? window.RuachBars.get(S.take.name) : null; return g && window.RuachBars.usable(g) ? g : null; }
  function gridShown() { return S.grid.on && !!gridData(); }
  function gridLoad(force) {
    if (!S.take || !window.RuachBars) return;
    var name = S.take.name;
    S.grid.err = "";
    if (!window.RuachBars.get(name) || force) S.grid.wait = true;
    gridPaint();
    window.RuachBars.load(name, force).then(function () {
      if (!S.take || S.take.name !== name) return;
      S.grid.wait = false; gridPaint(); redrawAll();
    }, function (e) {
      if (!S.take || S.take.name !== name) return;
      S.grid.wait = false; S.grid.err = e.message || String(e); gridPaint();
    });
  }
  function gridSummary(g) {                         // the grid in the page's words: its tempo against the take's own, the tracker's level, the bar's first beat
    var p = g.prior || {}, d = p.bpm ? (g.bpm / p.bpm - 1) * 100 : 0, sd = (d >= 0 ? "+" : "\u2212") + Math.abs(d).toFixed(1);
    var out = p.from === "score" ? tr("{0} bpm heard (the score says {1}, {2} %)") : p.from === "style" ? tr("{0} bpm heard (the style says {1}, {2} %)") : tr("{0} bpm heard");
    out = out.replace("{0}", g.bpm).replace("{1}", p.bpm).replace("{2}", sd);
    if (g.level && g.level !== 1) out += ", " + tr("the tracker's beats ×{0}").replace("{0}", g.level);
    if ((g.bars || []).length) out += "; " + tr("{0}/{1}, bar 1 at {2}").replace("{0}", g.num).replace("{1}", g.den).replace("{2}", clock(g.bars[0]) + "." + String(Math.round((g.bars[0] % 1) * 100)).padStart(2, "0")) +
      (g.phase_how === "set by hand" ? " (" + tr("set by hand") + ")" : g.phase_sure === false ? " (" + tr("unsure: set it by hand") + ")" : "");
    return out;
  }
  function gridSay() {
    var g = gridData();
    if (S.grid.wait) return tr("Hearing the take's beats on Forge (some seconds, once a take)…");
    if (S.grid.err) return tr("The bar grid did not come from the lab: {0}").replace("{0}", S.grid.err);
    if (!g) { var raw = S.take && window.RuachBars ? window.RuachBars.get(S.take.name) : null; return raw && raw.how === "none" ? tr("Too few beats heard in the take's sound to lay a grid on") : tr("No bar grid yet"); }
    return gridSummary(g);
  }
  function gridPaint() {
    var b = $("mxGrid");
    if (b) {
      var on = S.grid.on && !!gridData();
      b.classList.toggle("is-on", on); b.setAttribute("aria-pressed", on);
      b.classList.toggle("is-wait", !!S.grid.wait); b.classList.toggle("is-bad", !!S.grid.err);
      b.setAttribute("data-tip", tr("The bar grid (G): bars and beats as heard in the take, the cuts, the copies, the loop and a click cling to them; Alt held lets them go. A right-click: twice or half the tempo, where a bar begins, beats a bar, the chord lane") + " · " + gridSay());
    }
    var row = document.querySelector(".mx-ruler-row"), g = gridData(), has = !!(g && (g.chords || []).length && S.grid.chords);
    if (row) {
      row.classList.toggle("has-chords", has);
      Array.prototype.forEach.call(row.querySelectorAll(".mx-chord-ctl, .mx-chordlane"), function (el) { el.hidden = !has; });
      var key = row.querySelector(".mx-chord-key");
      if (key && g) key.textContent = (g.keys || []).length ? g.keys.map(function (k) { return k[1]; }).filter(function (k, i, a) { return a.indexOf(k) === i; }).join(" → ") : "";
    }
    if (has) drawChords();
  }
  // HERESY 2366 (Viktor 11.11.2026, «Пока что делай как советуешь там»: «в мире Чтеца сетку выключить по умолчанию»): a reading has no bars, so a take of
  // the Narrator's world opens with the grid off; its switch is remembered apart (G there is kept for the Narrator's takes, the songs keep theirs)
  function narratorTake() { var HC = window.HeresyCollection, r = S.take && HC && HC.row ? HC.row(S.take.name) : null; return !!(r && r.realm === "reader"); }
  function gridKey() { return narratorTake() ? "yue2.mixer.grid.narrator" : "yue2.mixer.grid"; }
  function gridToggle() { S.grid.on = !S.grid.on; keepFlag(gridKey(), S.grid.on); gridPaint(); redrawAll(); say(tr(S.grid.on ? "The bar grid on: the cuts, copies and the loop cling to its lines" : "The bar grid off")); }
  function gridSet(change, what) {
    if (!S.take || !window.RuachBars) return;
    var name = S.take.name;
    S.grid.wait = true; gridPaint();
    window.RuachBars.set(name, change).then(function (g) {
      if (!S.take || S.take.name !== name) return;
      S.grid.wait = false; S.grid.err = ""; gridPaint(); redrawAll(); var sum = window.RuachBars.usable(g) ? gridSummary(g) : ""; say(what ? what + (sum ? " · " + sum : "") : sum);
    }, function (e) { S.grid.wait = false; gridPaint(); say(e.message || String(e), true); });
  }
  function gridMenu(x, y, at) {
    var g = gridData(), raw = S.take && window.RuachBars ? window.RuachBars.get(S.take.name) : null, num = raw ? raw.num || 4 : 4, t = at == null ? (S.playing ? pos() : S.at) : at;
    window.HeresyMenu.open(x, y, [
      { label: "The bar grid", icon: "#", checked: S.grid.on, hint: "G", action: gridToggle },
      { label: "The chord lane", icon: "♯", checked: S.grid.chords, disabled: !(g && (g.chords || []).length), hint: "The score's chord symbols and keys on the grid, under the ruler", action: function () {
        S.grid.chords = !S.grid.chords; keepFlag("yue2.mixer.chords", S.grid.chords); paint(); } },
      { sep: true },
      { label: "A bar begins here", icon: "│", disabled: !raw, hint: tr("On the beat nearest {0}").replace("{0}", clock(t)), action: function () { gridSet({ downbeat: Math.round(t * 1000) / 1000 }, tr("A bar begins at {0}").replace("{0}", clock(t))); } },
      { label: "Twice the tempo", icon: "×2", disabled: !raw, action: function () { gridSet({ factor: 2 }, tr("Twice the tempo")); } },
      { label: "Half the tempo", icon: "÷2", disabled: !raw, action: function () { gridSet({ factor: 0.5 }, tr("Half the tempo")); } },
      { label: "Beats a bar", icon: "№", disabled: !raw, items: [2, 3, 4, 5, 6, 7, 9, 12].map(function (k) { return { label: String(k), raw: true, checked: num === k, action: function () { gridSet({ num: k }); } }; }) },
      { label: "As heard", icon: "↺", disabled: !(raw && raw.settings && Object.keys(raw.settings).length), hint: "The tempo, the bars and the meter as the take's sound says", action: function () { gridSet({ reset: true }); } },
      { label: "Hear it again", icon: "↻", hint: "When the take's sound changed", action: function () { gridLoad(true); } }
    ]);
  }
  function gridSnap(t, w, e) {                       // the grid's line nearest t within 6 px at this zoom, or t
    if (!gridShown() || (e && e.altKey)) return t;
    var hit = window.RuachBars.nearest(gridData(), t, w / span(), SNAP_PX);
    return hit == null ? t : hit;
  }
  function gridLines(g2, w, h, onRuler) {             // the grid on a canvas: the bars stronger, the beats faint, their halves fainter
    var g = gridData();
    if (!S.grid.on || !g) return;
    var css = getComputedStyle(g2.canvas), ink = css.getPropertyValue("--ink").trim() || "#ccc";
    window.RuachBars.lines(g, S.view.t0, S.view.t0 + span(), w / span()).forEach(function (l) {
      var x = Math.round(tx(l.t, w)) + 0.5;
      if (x < 0 || x > w) return;
      g2.globalAlpha = l.kind === "bar" ? (onRuler ? 0.85 : 0.22) : l.kind === "beat" ? (onRuler ? 0.5 : 0.1) : (onRuler ? 0.3 : 0.05);
      g2.fillStyle = ink;
      if (onRuler) { var hh = l.kind === "bar" ? 9 : l.kind === "beat" ? 5 : 3; g2.fillRect(x - 0.5, h - hh, 1, hh); }
      else g2.fillRect(x - 0.5, 0, 1, h);
      if (onRuler && l.kind === "bar" && l.label) { g2.globalAlpha = 0.9; g2.fillText(String(l.n), x + 2, h - 11); }
    });
    g2.globalAlpha = 1;
  }
  // HERESY 2314: the chord lane under the ruler: the take's score's chord symbols laid on the grid (each to the next), its key at the left; a click
  // goes to a chord, a double-click loops it, the cuts cling to its changes
  function drawChords() {
    var c = document.querySelector("canvas[data-mx-chords]"), g = gridData();
    if (!c || !S.info || !g) return;
    var box = c.parentNode, w = Math.max(50, box.clientWidth), h = Math.max(10, box.clientHeight), dpr = window.devicePixelRatio || 1;
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); c.style.width = w + "px"; c.style.height = h + "px";
    var x2 = c.getContext("2d"), css = getComputedStyle(c), ink = css.getPropertyValue("--ink").trim() || "#ccc", acc = css.getPropertyValue("--accent").trim() || "#b5163a";
    x2.setTransform(dpr, 0, 0, dpr, 0, 0); x2.clearRect(0, 0, w, h);
    x2.font = "600 10px " + (css.getPropertyValue("--mono").trim() || "monospace"); x2.textBaseline = "middle";
    var now = heard(), cur = window.RuachBars.chordAt(g, now);
    (g.chords || []).forEach(function (ch, i) {
      var a = Math.max(0, tx(ch[0], w)), b = Math.min(w, tx(ch[1], w));
      if (b <= 0 || a >= w) return;
      var here = cur && Math.abs(cur.t0 - ch[0]) < 1e-6;
      x2.fillStyle = here ? acc : ink; x2.globalAlpha = here ? 0.32 : i % 2 ? 0.08 : 0.14;
      x2.fillRect(a + 0.5, 1, Math.max(1, b - a - 1), h - 2);
      x2.globalAlpha = 1; x2.fillStyle = ink; x2.fillRect(Math.round(a), 1, 1, h - 2);
      var room = b - a - 6, label = ch[2];
      if (room > 10) { while (label.length > 1 && x2.measureText(label).width > room) label = label.slice(0, -1); x2.fillText(label, a + 4, h / 2 + 0.5); }
    });
    (g.keys || []).forEach(function (k, i) {                // a change of key: its name over the lane, accented
      if (!i) return;
      var x = Math.round(tx(k[0], w));
      if (x < 0 || x > w) return;
      x2.fillStyle = acc; x2.fillRect(x, 0, 2, h);
    });
  }
  function chordDown(e) {
    var c = e.target.closest && e.target.closest("canvas[data-mx-chords]"), g = gridData();
    if (!c || e.button !== 0 || !S.info || !g) return false;
    e.preventDefault();
    var ch = window.RuachBars.chordAt(g, timeAt(c, e.clientX));
    if (!ch) return true;
    if (S.playing) play(ch.t0); else { S.at = ch.t0; paintPlayhead(); }
    return true;
  }
  function chordsFollow() {                           // the chord sounding lit as it plays (drawn again only when it changes)
    var g = gridData();
    if (!g || !S.grid.chords || !(g.chords || []).length) return;
    var ch = window.RuachBars.chordAt(g, heard()), k = ch ? ch.t0 : -1;
    if (k !== S.grid.lit) { S.grid.lit = k; drawChords(); }
  }
  function chordTip(e) {
    var c = e.target.closest && e.target.closest("canvas[data-mx-chords]"), g = gridData();
    if (!c || !g) return;
    var t = timeAt(c, e.clientX), ch = window.RuachBars.chordAt(g, t), ba = window.RuachBars.barAt(g, t), k = window.RuachBars.keyAt(g, t);
    c.title = (ch ? ch.name + " · " : "") + (ba ? tr("bar {0}, beat {1}").replace("{0}", ba.bar).replace("{1}", ba.beat) : "") + (k ? " · " + tr("key {0}").replace("{0}", k) : "");
  }

  // HERESY 2315: the reference from anywhere: the set's source (as before), a sound of this take's tree, another take, or a song of your own on
  // Forge; kept for this take and set in this browser; as loud as the mix over what has played, whichever it is
  function refKey() { return "yue2.mixer.ref:" + (S.take ? S.take.name : "") + ":" + S.set; }
  function refRecall() { var v = lsGet(refKey(), null); return v && typeof v.spec === "string" && /^(take|own):/.test(v.spec) ? v : null; }
  function refTitle() { return S.ref.spec ? S.ref.title || S.ref.spec : tr("the sound as it came"); }
  function refChoose(spec, title) {
    var was = S.ref;
    S.ref = Object.assign(refReset(), { armed: was.armed, on: was.armed ? true : was.on, spec: spec || null, title: spec ? String(title || spec) : "" });
    if (spec) lsPut(refKey(), { spec: spec, title: S.ref.title }); else { try { localStorage.removeItem(refKey()); } catch (e) { /* private mode */ } }
    if (!S.ref.armed) { S.ref.armed = true; S.ref.on = true; }
    refLoad(); applyRef(S.graph); refPaint();
    say(tr("The reference: {0}").replace("{0}", refTitle()));
    if (S.playing) play(pos());                        // its stream from this second, beside the lanes
  }
  function refMenu(x, y) {
    if (!S.take) return;
    var name = S.take.name, pick = function (spec, title) { return function () { refChoose(spec, title); }; };
    var build = function (d) {
      var mine = (d.take || []).filter(function (r) { return r.spec !== "take:" + name || S.info.source !== "audio.wav"; });
      var own = d.own || [];
      window.HeresyMenu.open(x, y, [
        { label: "The sound as it came", icon: "○", checked: !S.ref.spec, hint: "The source the stems were split from", action: pick(null, "") },
        { label: "A sound of this take", icon: "⑂", items: mine.length ? mine.map(function (r) { return { label: r.label, raw: true, checked: S.ref.spec === r.spec, action: pick(r.spec, r.label) }; })
          : [{ label: "None in its tree", muted: true }] },
        { label: "Another take…", icon: "♫", action: function () { refPicker(); } },
        { label: "A song of your own…", icon: "⤒", hint: "Someone else's song, a mix you trust: WAV, FLAC, MP3… kept on Forge for every take", action: function () { refUpload(); } },
        { label: "Your references", icon: "★", items: own.length ? own.map(function (r) { return { label: r.title + (r.seconds ? " · " + clock(r.seconds) : ""), raw: true, checked: S.ref.spec === r.spec, action: pick(r.spec, r.title) }; })
          : [{ label: "None yet", muted: true, hint: "A song of your own… keeps one here" }] },
        own.length && { label: "Forget a reference", icon: "✕", items: own.map(function (r) { return { label: r.title, raw: true, danger: true, action: function () { refForget(r); } }; }) }
      ].filter(Boolean));
    };
    getJson("/daw/refs?" + q({ name: name })).then(build, function () { build({ take: [], own: [] }); });
  }
  function refForget(r) {
    var go = window.HeresyDialog ? window.HeresyDialog.confirm(tr("Forget the reference «{0}»? Its sound goes from Forge").replace("{0}", r.title), { ok: tr("Forget"), cancel: tr("Cancel"), danger: true }) : Promise.resolve(true);
    go.then(function (ok) {
      if (!ok) return;
      fetch("/lab/daw/ref/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: r.id }) })
        .then(function (x) { return x.json(); }).then(function () { if (S.ref.spec === r.spec) refChoose(null, ""); say(tr("Forgotten: {0}").replace("{0}", r.title)); },
          function (e) { say(e.message || String(e), true); });
    });
  }
  function refUpload() {
    var inp = document.createElement("input");
    inp.type = "file"; inp.accept = "audio/*,.wav,.flac,.mp3,.m4a,.ogg,.opus,.aif,.aiff";
    inp.addEventListener("change", function () {
      var f = inp.files && inp.files[0];
      if (!f) return;
      say(tr("Sending «{0}» to Forge…").replace("{0}", f.name));
      fetch("/lab/daw/ref?" + q({ file: f.name, title: f.name.replace(/\.[^.]+$/, "") }), { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: f })
        .then(function (r) { return r.json().then(function (b) { if (!r.ok) throw new Error(b.error || r.status); return b; }); })
        .then(function (r) { refChoose(r.spec, r.title); }, function (e) { say(tr("The song did not reach Forge: {0}").replace("{0}", e.message || e), true); });
    });
    inp.click();
  }
  function refPicker() {                              // another take of the Library, found by its title
    var all = typeof window.ruachTakes === "function" ? window.ruachTakes() : [], back = document.createElement("div");
    back.className = "mxl-back mx-refpick"; back.id = "mxRefPick";
    back.innerHTML = '<div class="mxl-box mx-refpick-box" role="dialog" aria-modal="true" aria-label="' + esc(tr("Another take as the reference")) + '">' +
      '<div class="mxl-head"><b class="mxl-title">' + esc(tr("Another take as the reference")) + '</b><input type="search" class="mxl-q" placeholder="' + esc(tr("Search the Library")) + '" autocomplete="off" />' +
      '<button type="button" class="btn ghost small mxl-x" data-x="1" aria-label="' + esc(tr("Close")) + '">×</button></div><ul class="mxl-list mx-refpick-list" role="listbox"></ul></div>';
    document.body.appendChild(back);
    var list = back.querySelector("ul"), inp = back.querySelector("input");
    var shut = function () { back.remove(); document.removeEventListener("keydown", key, true); };
    var key = function (e) { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); shut(); } };
    var show = function () {
      var qq = inp.value.trim().toLowerCase(), hits = all.filter(function (t) { return !S.take || t.name !== S.take.name; }).filter(function (t) { return !qq || (t.title + " " + t.name).toLowerCase().indexOf(qq) >= 0; }).slice(0, 200);
      list.innerHTML = hits.length ? hits.map(function (t) { return '<li><button type="button" class="mxl-row" data-take="' + esc(t.name) + '"><span class="mxl-name" translate="no">' + esc(t.title) + '</span><span class="mxl-meta mono" translate="no">' + esc(t.name) + "</span></button></li>"; }).join("")
        : '<li class="mxl-wait">' + esc(tr("No take answers that")) + "</li>";
    };
    back.addEventListener("click", function (e) {
      if (e.target === back || (e.target.closest && e.target.closest("[data-x]"))) { shut(); return; }
      var b = e.target.closest && e.target.closest("[data-take]");
      if (!b) return;
      var t = all.filter(function (x) { return x.name === b.dataset.take; })[0];
      shut(); refChoose("take:" + b.dataset.take, t ? t.title : b.dataset.take);
    });
    inp.addEventListener("input", show);
    document.addEventListener("keydown", key, true);
    show(); inp.focus();
  }

  // HERESY 2316: bounce in place: a bus, a VCA's lanes or one lane rendered on Forge as they sound in the mix (with their share of the room and
  // the delay) into a lane of their own; when it lands, its members are muted and it plays at 0 dB, so the mix sounds as before; one undo
  // puts the members back and mutes the new lane
  function reread() {                                  // the set read again, its new lanes taken in, the mix in hand kept
    if (!S.take || !S.set) return Promise.resolve(null);
    var token = S.token, set = S.set;
    return getJson("/daw/set?" + q({ name: S.take.name, set: set })).then(function (info) {
      if (token !== S.token || S.set !== set) return null;
      var was = S.playing, t = pos();
      S.info = info;
      closeGraph(); paint();
      names().forEach(function (n) { loadPeaks(n); });
      if (was) play(t);
      return info;
    });
  }
  function bounceRun(members, title) {
    if (!S.info || S.busy) return;
    var ms = members.filter(function (n) { return names().indexOf(n) >= 0; });
    if (!ms.length) return;
    var versions = {};
    S.info.strips.forEach(function (s) { var v = versionOf(s.name); if (v !== s.path) versions[s.name] = v; });
    S.busy = "bouncing"; paintHead();
    var dry = bounceDry();                               // HERESY 2366
    say(tr(dry ? "Bouncing {0} dry on Forge…" : "Bouncing {0} on Forge…").replace("{0}", title));
    var name = S.take.name, set = S.set;
    fetch("/lab/daw/bounce", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name, set: set, mix: value(), versions: versions, members: ms, title: title, dry: dry }) })
      .then(function (r) { return r.json().then(function (b) { if (!r.ok) throw new Error(b.error || r.status); return b; }); })
      .then(function (job) { S.mixId = job.id; S.mixGone = 0; S.bounceAsk = { dry: dry, heard: job.dry === dry }; paintHead(); bounceWatch(name, set, job.id, ms, job.track, title); },   // HERESY 2366: a lab before it answers no «dry»
            function (e) { S.busy = ""; paintHead(); say(e.message || String(e), true); });
  }
  function bounceWatch(name, set, id, members, track, title) {
    clearTimeout(S.watch);
    if (!S.take || S.take.name !== name) return;
    getJson("/derived?" + q({ name: name })).then(function (d) {
      var run = (d.running || []).filter(function (j) { return j.id === id; })[0], made = (d.derived || []).filter(function (m) { return m.id === id; })[0];
      if (run && run.status === "failed") { S.busy = ""; S.mixId = ""; paintHead(); say(run.error || tr("failed"), true); return; }
      if (!made) {
        if (!run && ++S.mixGone >= 2) { S.busy = ""; S.mixId = ""; paintHead(); say(tr("The bounce is no longer running on Forge"), true); return; }
        if (run) S.mixGone = 0;
        S.watch = setTimeout(function () { bounceWatch(name, set, id, members, track, title); }, 2000);
        return;
      }
      S.busy = ""; S.mixId = ""; paintHead();
      if (window.HeresyDerived) window.HeresyDerived.refresh();
      if (S.set !== set) return;
      reread().then(function () {
        if (names().indexOf(track) < 0) { say(tr("Bounced, but its lane is not in the set: {0}").replace("{0}", track), true); return; }
        bounceLand(members, track, +made.gain_db || 0, title, (made.report || {}).sends);   // HERESY 2407: a dry one's sends
      });
    }).catch(function () { S.watch = setTimeout(function () { bounceWatch(name, set, id, members, track, title); }, 4000); });
  }
  function bounceLand(members, track, gainDb, title, sends) {   // its members muted (their solo given to it), it at 0 dB; the undo before it the inverse
    var solo = soloing(), soloed = members.some(function (n) { return S.strips[n] && S.strips[n].solo; });
    var before = JSON.parse(snap());
    before.strips[track] = { mute: true };               // undone: the members as they were, the new lane silent
    S.undo.push(JSON.stringify(before)); if (S.undo.length > 120) S.undo.shift(); S.redo = [];
    members.forEach(function (n) { var s = S.strips[n] || (S.strips[n] = {}); s.mute = true; if (s.solo) s.solo = false; });
    var t = S.strips[track] || (S.strips[track] = {});
    t.mute = false; if (gainDb) t.gain_db = Math.round(gainDb * 100) / 100;
    if (solo && soloed) t.solo = true;
    // HERESY 2407 (A6): a dry bounce brings its lanes' room and delay along as the new lane's own sends (the lab's fit of what they sent), so the
    // mix keeps them and they stay live; Ctrl+Z puts the lanes back as they were
    var carried = !!(sends && (sends.reverb != null || sends.delay != null));
    if (sends && sends.reverb != null) t.reverb = +sends.reverb;
    if (sends && sends.delay != null) t.delay = +sends.delay;
    restored(false); paintUndo();
    var ask = S.bounceAsk || {}; S.bounceAsk = null;   // HERESY 2366: said as it was made, a lab that did not hear «dry» said so
    if (ask.dry && !ask.heard) say(tr("Bounced {0} with the room and the delay: this lab was started before the dry bounce came; restart the lab for a dry one").replace("{0}", title), true);
    else say(tr(ask.dry ? (carried ? "Bounced {0} dry into a lane of its own: its lanes muted, their room and delay carried onto its sends (Ctrl+Z puts them back)" : "Bounced {0} dry into a lane of its own: its lanes muted, without their room and delay (Ctrl+Z puts them back)") : "Bounced {0} into a lane of its own: its lanes muted, the mix as it was (Ctrl+Z puts them back)").replace("{0}", title));   // HERESY 2407
  }
  function bounceItems(n) {
    var bus = subOfStrip(n), gs = groupsOf(n), busy = !!S.busy, out = [];
    if (bus) out.push({ label: tr("Its bus «{0}»").replace("{0}", bus.name), raw: true, disabled: busy, action: function () { bounceRun(bus.members.slice(), bus.name); } });
    gs.forEach(function (gr) {
      var inBus = gr.members.map(subOfStrip).filter(Boolean), partial = inBus.some(function (b2) { return b2.members.some(function (m) { return gr.members.indexOf(m) < 0; }); });
      out.push({ label: tr("Its VCA «{0}»").replace("{0}", gr.name), raw: true, disabled: busy || partial, hint: partial ? "A lane of this VCA shares a bus with lanes outside it: bounce the bus" : "",
                 action: function () { bounceRun(gr.members.slice(), gr.name); } });
    });
    var lonely = bus && bus.members.length > 1;
    out.push({ label: tr("This lane alone, with its devices"), raw: true, disabled: busy || lonely, hint: lonely ? "It shares a bus: bounce the bus" : "",
               action: function () { bounceRun([n], (S.info.strips.filter(function (x) { return x.name === n; })[0] || { title: tr("Rest") }).title); } });
    // HERESY 2366 (Viktor 11.11.2026, «Пока что делай как советуешь там»: «сухой баунс — сделать вариантом»): the bounce without its share of the room and
    // the delay, a switch kept in this browser; with its lanes muted the mix then has less of both (the new lane's own sends bring them back)
    var dry = bounceDry();
    out.push({ sep: true });
    out.push({ label: tr("Dry: without the room and the delay"), raw: true, checked: dry, hint: "The new lane without its lanes' share of the room and the delay baked in: their sends are copied onto it, so the mix keeps both and they stay live",   // HERESY 2407
               action: function () { keepFlag("yue2.mixer.bounceDry", !dry); say(tr(!dry ? "The next bounce is dry: without the room and the delay" : "The next bounce keeps the room and the delay: the mix as it was")); } });
    return out;
  }
  function bounceDry() { return recallFlag("yue2.mixer.bounceDry", false); }   // HERESY 2366

  // HERESY 2317 (the DAW list of 02.11.2026, §1.9, Bitwig 6's audition): Alt pressed on a wave plays that lane alone from there while it is held; let
  // go, the mix as it was (playing on, or the playhead back where it stood). Nothing of the mix changes
  function auditionDown(e, c) {
    var n = c.dataset.mxWave, t = timeAt(c, e.clientX);
    e.preventDefault();
    S.aud = { n: n, playing: S.playing, at: S.playing ? pos() : S.at };
    var row = laneRow(n); if (row) row.classList.add("is-audition");
    applyRef(S.graph); liveGains();
    play(t);
    say(tr("Audition: {0} alone from {1}, while held").replace("{0}", (S.info.strips.filter(function (x) { return x.name === n; })[0] || { title: tr("Rest") }).title).replace("{1}", clock(t)));
    var up = function () {
      document.removeEventListener("pointerup", up, true); document.removeEventListener("pointercancel", up, true);
      var a = S.aud; S.aud = null;
      var r2 = laneRow(a.n); if (r2) r2.classList.remove("is-audition");
      liveGains(); applyRef(S.graph);
      if (a.playing) play(pos()); else { stop(); S.at = a.at; paintPlayhead(); }
      say("");
    };
    document.addEventListener("pointerup", up, true); document.addEventListener("pointercancel", up, true);
  }

  // HERESY 2318: the lines' shapes. A point may say how the line goes on to the next: a bend (−1…1), "hold", "s" (half a cosine). expandPts lays a
  // shaped segment out as the points a straight line goes through, exactly as the render does (lab/daw_mix.py expand), so the line heard,
  // drawn and rendered is one
  var BEND_K = 5, HOLD_EDGE = 0.001, SUB_S = 0.02, SUB_MAX = 24;
  function expandPts(pts) {
    var out = [];
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i], sh = p[2];
      out.push([p[0], p[1]]);
      if (sh == null || i + 1 >= pts.length) continue;
      var t0 = p[0], v0 = p[1], t1 = pts[i + 1][0], v1 = pts[i + 1][1], span2 = t1 - t0;
      if (!(span2 > 0)) continue;
      if (sh === "hold") { if (span2 > 2 * HOLD_EDGE) out.push([t1 - HOLD_EDGE, v0]); continue; }
      if (sh !== "s" && !(typeof sh === "number" && Math.abs(sh) >= 1e-3)) continue;
      var k = Math.max(2, Math.min(SUB_MAX, Math.floor(span2 / SUB_S + 0.5))), a = sh === "s" ? 0 : BEND_K * sh;
      for (var j = 1; j < k; j++) {
        var u = j / k, f = sh === "s" ? 0.5 - 0.5 * Math.cos(Math.PI * u) : (Math.exp(a * u) - 1) / (Math.exp(a) - 1);
        out.push([t0 + span2 * u, v0 + (v1 - v0) * f]);
      }
    }
    return out;
  }
  function linePts(n, prm) { return expandPts(sortedPts(n, prm)); }
  function segAt(n, prm, t) {                          // the line's segment around t: its first point (with its shape), or null
    var pts = sortedPts(n, prm);
    for (var i = 0; i + 1 < pts.length; i++) if (t >= pts[i][0] && t <= pts[i + 1][0]) return { p: pts[i], q: pts[i + 1] };
    return null;
  }
  function shapeSet(n, prm, p, sh) {
    mark();
    if (sh == null || sh === 0) p.length = 2; else p[2] = sh;
    keep(); draw(n); autoSchedule(n); lanePaintAuto(n); emit("change", { n: n, key: "auto" });
  }
  function bendDown(e, c) {                            // Alt+drag on a segment of the knob in hand: its bend follows the pointer (up lifts its middle)
    var n = c.dataset.mxWave, prm = autoParam(n), sg = segAt(n, prm, timeAt(c, e.clientX));
    if (!sg) return false;
    e.preventDefault();
    var y0 = e.clientY, k0 = typeof sg.p[2] === "number" ? sg.p[2] : 0, rising = aY(prm, sg.q[1], 100) < aY(prm, sg.p[1], 100), moved = false;
    try { if (c.setPointerCapture) c.setPointerCapture(e.pointerId); } catch (x) { /* gone */ }
    var move = function (ev) {
      var dy = y0 - ev.clientY;
      if (!moved && Math.abs(dy) < 2) return;
      if (!moved) { moved = true; mark(); }
      var k = Math.max(-1, Math.min(1, k0 + (rising ? -1 : 1) * dy / 80));
      if (Math.abs(k) < 0.02) sg.p.length = 2; else sg.p[2] = Math.round(k * 100) / 100;
      draw(n);
    };
    var up = function () {
      c.removeEventListener("pointermove", move); c.removeEventListener("pointerup", up);
      if (!moved) return;
      keep(); autoSchedule(n); lanePaintAuto(n); emit("change", { n: n, key: "auto" });
      say(typeof sg.p[2] === "number" ? tr("Bend {0}").replace("{0}", sg.p[2]) : tr("Straight"));
    };
    c.addEventListener("pointermove", move); c.addEventListener("pointerup", up);
    return true;
  }
  function stretchFor(n) {                             // where an LFO or a range acts: the lane's selection, else the loop, else the section at the playhead, else the song
    if (S.pick && S.pick.n === n) return [S.pick.a, S.pick.b, "the selection", true];
    if (S.loop && S.loopOn) return [S.loop[0], S.loop[1], "the loop", true];
    var sc = sectionAt(S.playing ? pos() : S.at);
    if (sc) return [sc.t, sc.end, sc.name, false];
    return [0, S.info.seconds, "the whole song", true];
  }
  function shapeMenu(n, prm, t, x, y) {
    var sg = segAt(n, prm, t), cur = sg ? sg.p[2] : undefined, st = stretchFor(n), where = st[3] ? tr(st[2]) : st[2];
    window.HeresyMenu.open(x, y, [
      { label: "Straight", icon: "╱", checked: !!sg && cur == null, disabled: !sg, action: function () { shapeSet(n, prm, sg.p, null); } },
      { label: "Curve: the change comes late", icon: "⌐", checked: !!sg && typeof cur === "number" && cur > 0, disabled: !sg, hint: "Alt+drag on the segment bends it by hand", action: function () { shapeSet(n, prm, sg.p, 0.6); } },
      { label: "Curve: the change comes early", icon: "⌙", checked: !!sg && typeof cur === "number" && cur < 0, disabled: !sg, hint: "Alt+drag on the segment bends it by hand", action: function () { shapeSet(n, prm, sg.p, -0.6); } },
      { label: "Hold, then step", icon: "┐", checked: cur === "hold", disabled: !sg, action: function () { shapeSet(n, prm, sg.p, "hold"); } },
      { label: "S-curve", icon: "∿", checked: cur === "s", disabled: !sg, action: function () { shapeSet(n, prm, sg.p, "s"); } },
      { sep: true },
      { label: tr("An LFO over {0}…").replace("{0}", where), raw: true, icon: "∿", action: function () { lfoBox(n, prm, st[0], st[1], x, y); } },
      { label: tr("The spread over {0}…").replace("{0}", where), raw: true, icon: "↕", disabled: !sortedPts(n, prm).some(function (p) { return p[0] >= st[0] && p[0] <= st[1]; }), action: function () { rangeBox(n, prm, st[0], st[1], x, y); } },
      { sep: true },
      { label: "The line taken off", icon: "✕", danger: true, disabled: !drawn(n, prm), action: function () {
        mark(); var lst = rawPts(n, prm); lst.splice(0, lst.length); keep(); draw(n); autoSchedule(n); lanePaintAuto(n); emit("change", { n: n, key: "auto" }); } }
    ]);
  }
  function boxShell(id, head, rows, x, y) {           // a small floating box by the pointer (the fades' box's look); Esc or a click away closes it
    var old = $(id); if (old && old._close) old._close();
    var b = document.createElement("div");
    b.id = id; b.className = "mx-fadebox mx-shapebox"; b.setAttribute("role", "dialog");
    b.innerHTML = '<div class="mx-fb-head">' + esc(head) + "</div>" + rows;
    document.body.appendChild(b);
    var w = b.offsetWidth, h = b.offsetHeight;
    b.style.left = Math.max(6, Math.min(x + 10, window.innerWidth - w - 6)) + "px";
    b.style.top = Math.max(6, Math.min(y + 10, window.innerHeight - h - 6)) + "px";
    var out = function (e) { if (!b.contains(e.target)) close2(); }, key = function (e) { if (e.key === "Escape") { e.stopImmediatePropagation(); e.preventDefault(); close2(); } };
    function close2() { document.removeEventListener("pointerdown", out, true); window.removeEventListener("keydown", key, true); b.remove(); }
    b._close = close2;
    setTimeout(function () { document.addEventListener("pointerdown", out, true); window.addEventListener("keydown", key, true); }, 0);
    return b;
  }
  function rangeBox(n, prm, a, b, x, y) {               // «размах»: the points of the stretch spread or drawn in about their middle, 0 to 200 %
    var lst = rawPts(n, prm), inside = lst.filter(function (p) { return p[0] >= a - 1e-6 && p[0] <= b + 1e-6; });
    if (!inside.length) return;
    var orig = inside.map(function (p) { return p[1]; }), lo = Math.min.apply(null, orig), hi = Math.max.apply(null, orig), mid = (lo + hi) / 2, P = AUTO_P[prm], marked = false;
    var box = boxShell("mxRangeBox", tr("The spread of {0} points, {1}–{2}").replace("{0}", inside.length).replace("{1}", clock(a)).replace("{2}", clock(b)),
      '<label class="mx-fb-row"><span>' + esc(tr("Spread")) + '</span><input type="range" min="0" max="200" step="5" value="100" data-r="1" aria-label="' + esc(tr("Spread")) + '"><output class="mono">100 %</output></label>' +
      '<p class="mx-fb-hint">' + esc(tr("About their middle: 0 % flat, 100 % as drawn, 200 % twice as wide; heard as it moves")) + "</p>", x, y);
    box.addEventListener("input", function (e) {
      if (!e.target.dataset.r) return;
      if (!marked) { mark(); marked = true; }
      var f = (+e.target.value || 0) / 100;
      inside.forEach(function (p, i) { var v = mid + (orig[i] - mid) * f; p[1] = prm === "volume" ? Math.round(Math.max(P.lo, Math.min(P.hi, v)) * 10) / 10 : Math.round(Math.max(P.lo, Math.min(P.hi, v)) * 100) / 100; });
      box.querySelector("output").textContent = Math.round(f * 100) + " %";
      draw(n); autoSchedule(n);
    });
    box.addEventListener("change", function () { keep(); lanePaintAuto(n); emit("change", { n: n, key: "auto" }); marked = false; });
  }
  var LFO_SVG = function (d) { return '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="' + d + '" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/></svg>'; };
  var LFO_SHAPES = [["sine", "Sine", LFO_SVG("M1 8C3 1.5 5 1.5 8 8S13 14.5 15 8")], ["triangle", "Triangle", LFO_SVG("M1 12 4.5 4 8 12 11.5 4 15 12")],
                    ["square", "Square wave", LFO_SVG("M1 12V4h4v8h4V4h4v8h2")], ["up", "Saw up", LFO_SVG("M1 12 7 4v8l6-8v8")], ["down", "Saw down", LFO_SVG("M1 4l6 8V4l6 8V4")]];
  function lfoRates(g) {                               // in quarter notes: notes, then bars of the take's meter
    var bar = g ? (g.num || 4) * 4 / (g.den || 4) : 4;
    return [[0.25, "1/16"], [0.5, "1/8"], [1, "1/4"], [2, "1/2"], [bar, "1 bar"], [2 * bar, "2 bars"], [4 * bar, "4 bars"]];
  }
  function lfoPoints(o) {                              // the LFO as the line's points: two a cycle, each segment shaped (an S for the sine, a hold for the square)
    var g = gridData(), out = [], P = AUTO_P[o.prm], clamp = function (v) { v = Math.max(P.lo, Math.min(P.hi, v)); return o.prm === "volume" ? Math.round(v * 10) / 10 : Math.round(v * 1000) / 1000; };
    var at = function (cyc) {                           // a cycle's start time: on the grid's beats (in quarter notes there), else in seconds at its Hz
      if (g) { var per = (g.den || 4) / 4, b0 = window.RuachBars.beatIndex(g, o.a); return window.RuachBars.timeOf(g, b0 + cyc * o.rate * per); }
      return o.a + cyc / o.hz;
    };
    var v = function (f) { return clamp(o.center + o.depth * f); }, up = o.phase === 180 ? -1 : 1;
    for (var k = 0; k < 4000; k++) {
      var c0 = at(k), c1 = at(k + 1), half = (c0 + c1) / 2;
      if (c0 >= o.b - 0.002) break;
      if (o.shape === "sine" || o.shape === "triangle") {
        var sh = o.shape === "sine" ? "s" : null;
        out.push(sh ? [c0, v(up), sh] : [c0, v(up)]);
        if (half < o.b) out.push(sh ? [half, v(-up), sh] : [half, v(-up)]);
      } else if (o.shape === "square") {
        out.push([c0, v(up), "hold"]);
        if (half < o.b) out.push([half, v(-up), "hold"]);
      } else {
        var lo2 = o.shape === "up" ? -up : up;
        out.push([c0, v(lo2)]);
        if (c1 - 0.001 < o.b) out.push([c1 - 0.001, v(-lo2)]);
      }
    }
    return out.filter(function (p) { return p[0] >= o.a - 1e-6 && p[0] <= o.b + 1e-6; }).map(function (p) { p[0] = Math.round(p[0] * 1000) / 1000; return p; });
  }
  function lfoBox(n, prm, a, b, x, y) {
    var g = gridData(), P = AUTO_P[prm], pts0 = linePts(n, prm), center0 = pts0.length ? autoDb(pts0, a) : P.rest, isVol = prm === "volume";
    var rates = lfoRates(g), o = { prm: prm, a: a, b: b, shape: "sine", rate: rates[4][0], hz: 1, depth: isVol ? 6 : (P.hi - P.lo) / 4, center: Math.round(center0 * 100) / 100, phase: 0 }, marked = false, before = null;
    var chip = function (k, list, cur, lab) { return '<span class="mx-lfo-chips" role="group" aria-label="' + esc(tr(lab)) + '">' + list.map(function (s) {
      return '<button type="button" class="mx-ms' + (s[2] ? " mx-lfo-ico" : " mx-lfo-word") + (cur === s[0] ? " is-on" : "") + '" data-' + k + '="' + s[0] + '" aria-pressed="' + (cur === s[0]) + '" aria-label="' + esc(tr(s[1])) + '" data-tip="' + esc(tr(s[1])) + '">' + (s[2] || esc(tr(s[1]))) + "</button>"; }).join("") + "</span>"; };
    var rows = '<div class="mx-lfo-row">' + chip("shape", LFO_SHAPES, o.shape, "Shape") + "</div>" +
      (g ? '<div class="mx-lfo-row">' + chip("rate", rates, o.rate, "Cycle length") + "</div>"
         : '<label class="mx-fb-row"><span>' + esc(tr("Rate, Hz")) + '</span><input type="range" min="0.05" max="8" step="0.05" value="1" data-hz="1"><output class="mono">1 Hz</output></label>') +
      '<label class="mx-fb-row"><span>' + esc(tr(isVol ? "Depth, dB" : "Depth")) + '</span><input type="range" min="0" max="' + (isVol ? 24 : (P.hi - P.lo) / 2) + '" step="' + (isVol ? 0.5 : 0.01) + '" value="' + o.depth + '" data-depth="1"><output class="mono"></output></label>' +
      '<label class="mx-fb-row"><span>' + esc(tr(isVol ? "Centre line, dB" : "Centre line")) + '</span><input type="range" min="' + P.lo + '" max="' + P.hi + '" step="' + (isVol ? 0.5 : 0.01) + '" value="' + o.center + '" data-center="1"><output class="mono"></output></label>' +
      '<div class="mx-lfo-row">' + chip("phase", [[0, "From the top"], [180, "From the bottom"]], o.phase, "Phase") + "</div>" +
      '<p class="mx-fb-hint">' + esc(g ? tr("On the bar grid: its cycles follow the take's beats") : tr("No bar grid for this take: the rate in Hz")) + "</p>" +
      '<div class="mxl-acts"><button type="button" class="btn ghost small" data-lfo="undo">' + esc(tr("Take it off")) + '</button><button type="button" class="btn primary small" data-lfo="ok">' + esc(tr("Keep it")) + "</button></div>";
    var box = boxShell("mxLfoBox", tr("An LFO on {0}, {1}–{2}").replace("{0}", tr(P.short)).replace("{1}", clock(a)).replace("{2}", clock(b)), rows, x, y);
    var fmt = function (v) { return isVol ? (v > 0 ? "+" : "") + (+v).toFixed(1) + " dB" : (+v).toFixed(2); };
    var lay = function () {                              // the stretch's own points out, the LFO's in, 10 ms from the line outside
      var lst = rawPts(n, prm, true);
      if (!before) { mark(); before = lst.map(function (p) { return p.slice(); }); }
      var keepOut = before.filter(function (p) { return p[0] < a - 0.0105 || p[0] > b + 0.0105; }), outside = expandPts(before.slice().sort(function (p1, p2) { return p1[0] - p2[0]; }));
      var add = lfoPoints(o);
      if (a > 0.0105 && before.length) add.unshift([r3(a - 0.01), Math.round(autoDb(outside, a - 0.01) * 100) / 100]);
      if (b < S.info.seconds - 0.0105 && before.length) add.push([r3(b + 0.01), Math.round(autoDb(outside, b + 0.01) * 100) / 100]);
      var all = keepOut.concat(add).sort(function (p1, p2) { return p1[0] - p2[0]; });
      if (all.length > 2000) { say(tr("The LFO would draw {0} points, 2000 at most on a line: a slower rate or a shorter stretch").replace("{0}", all.length), true); return; }
      lst.splice.apply(lst, [0, lst.length].concat(all));
      box.querySelector("[data-depth] + output").textContent = fmt(o.depth);
      box.querySelector("[data-center] + output").textContent = fmt(o.center);
      keep(); draw(n); autoSchedule(n); lanePaintAuto(n);
    };
    box.addEventListener("click", function (e) {
      var t = e.target.closest && e.target.closest("button");
      if (!t) return;
      if (t.dataset.shape) o.shape = t.dataset.shape;
      else if (t.dataset.rate) o.rate = +t.dataset.rate;
      else if (t.dataset.phase != null) o.phase = +t.dataset.phase;
      else if (t.dataset.lfo === "ok") { keep(); emit("change", { n: n, key: "auto" }); box._close(); say(tr("An LFO laid over {0}–{1}").replace("{0}", clock(a)).replace("{1}", clock(b))); return; }
      else if (t.dataset.lfo === "undo") { if (before) { var lst = rawPts(n, prm, true); lst.splice.apply(lst, [0, lst.length].concat(before)); S.undo.pop(); paintUndo(); draw(n); autoSchedule(n); lanePaintAuto(n); } box._close(); return; }
      Array.prototype.forEach.call(t.parentNode.querySelectorAll("button"), function (x2) { x2.classList.toggle("is-on", x2 === t); x2.setAttribute("aria-pressed", x2 === t); });
      lay();
    });
    box.addEventListener("input", function (e) {
      var d = e.target.dataset;
      if (d.depth) o.depth = +e.target.value; else if (d.center) o.center = +e.target.value;
      else if (d.hz) { o.hz = +e.target.value; e.target.nextElementSibling.textContent = o.hz + " Hz"; }
      lay();
    });
    box.addEventListener("change", function () { keep(); emit("change", { n: n, key: "auto" }); });
    lay();
  }

  // ---- «Mix»: on Forge, a branch of the tree
  function mix() {
    if (!S.info || S.busy) return;
    var versions = {};
    S.info.strips.forEach(function (s) { var v = versionOf(s.name); if (v !== s.path) versions[s.name] = v; });
    S.busy = "mixing"; paintHead();
    say(tr("Mixing on Forge…"));
    fetch("/lab/daw/mix", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: S.take.name, set: S.set, mix: value(), versions: versions, print: S.print }) })
      .then(function (r) { return r.json().then(function (b) { if (!r.ok) throw new Error(b.error || r.status); return b; }); })
      .then(function (job) { S.mixId = job.id; S.mixGone = 0; paintHead(); watch(job.id); })
      .catch(function (e) { S.busy = ""; paintHead(); say(e.message, true); });
  }
  function stopMix() {                                // HERESY 1539
    var id = S.mixId, name = S.take && S.take.name;
    if (!id || !name) return;
    var b = $("mxStop"); if (b) b.disabled = true;
    fetch("/lab/daw/mix/stop", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name, id: id }) })
      .then(function (r) { return r.json().then(function (x) { if (!r.ok) throw new Error(x.error || r.status); return x; }); })
      .then(function () { clearTimeout(S.watch); S.busy = ""; S.mixId = ""; paintHead(); say(tr("Stopped: no mix was made")); if (window.HeresyDerived) window.HeresyDerived.refresh(); },
            function (e) { var b2 = $("mxStop"); if (b2) b2.disabled = false; say(e.message, true); });
  }
  function watch(id, name) {
    clearTimeout(S.watch);
    name = name || (S.take && S.take.name);
    if (!S.take || S.take.name !== name) return;      // HERESY 1536: the take changed: not ours to watch
    getJson("/derived?" + q({ name: name })).then(function (d) {
      var run = (d.running || []).filter(function (j) { return j.id === id; })[0], made = (d.derived || []).filter(function (m) { return m.id === id; })[0];
      if (made) {
        S.busy = ""; S.mixId = ""; paintHead();
        var l = made.loudness || {};
        say(tr("Mixed") + ": " + (l.integrated_lufs != null ? l.integrated_lufs + " LUFS, " : "") + (l.true_peak_dbtp != null ? l.true_peak_dbtp + " dBTP" : "") + (l.loudness_range_lu != null ? ", LRA " + l.loudness_range_lu + " LU" : "") + (made.lowered_db ? " · " + tr("lowered") + " " + made.lowered_db + " dB" : "") +
            ((made.files || []).length > 1 ? " · " + tr("its stems beside it") + ": " + ((made.files || []).length - 1) : ""));
        if (window.HeresyDerived) window.HeresyDerived.refresh();
        return;
      }
      if (run && run.status === "failed") { S.busy = ""; S.mixId = ""; paintHead(); say(run.error || tr("failed"), true); return; }
      if (!run && ++S.mixGone >= 2) { S.busy = ""; S.mixId = ""; paintHead(); say(tr("The mix is no longer running on Forge"), true); return; }   // HERESY 1539
      if (run) S.mixGone = 0;
      S.watch = setTimeout(function () { watch(id, name); }, 2000);
    }).catch(function () { S.watch = setTimeout(function () { watch(id, name); }, 4000); });
  }

  function init() {
    var body = $("mxBody");
    if (!body) return;
    body.addEventListener("input", onInput);
    body.addEventListener("change", onChange);
    body.addEventListener("click", onClick);
    body.addEventListener("dblclick", onDbl);
    body.addEventListener("pointerdown", onDown);
    body.addEventListener("dblclick", function (e) {   // HERESY 1965: a grip's double-click: the lane back to its 72 px
      var g = e.target.closest && e.target.closest("[data-mx-grip]");
      if (!g) return;
      var n = g.dataset.mxGrip, row = g.closest(".mx-lane");
      delete LANE_H[n]; laneKeep(); row.style.setProperty("--mx-h", LANE_DEF + "px"); draw(n); paintPlayhead();
    });
    body.addEventListener("pointermove", onMove);
    body.addEventListener("pointerup", onUp);
    body.addEventListener("pointerup", function () { S.gesture = false; });   // HERESY 1531: a fader's drag ends its undo
    body.addEventListener("contextmenu", onMenu);
    body.addEventListener("wheel", onWheel, { passive: false });   // HERESY 1501: Ctrl+wheel zooms (not the page), Shift+wheel goes along
    // HERESY 1511 (Viktor 16.10.2026: «строки бегают по движению мышки»): no lane grows under the pointer any more; every wave is whole
    window.addEventListener("ruach-grid", function (e) {   // HERESY 2313: the take's grid arrived or was set again
      if (S.take && e.detail && e.detail.name === S.take.name) { var row = document.querySelector(".mx-ruler-row"); if (row) row.classList.toggle("has-grid", gridShown()); gridPaint(); redrawAll(); }
    });
    body.addEventListener("pointermove", chordTip);   // HERESY 2314: the chord, bar and key under the pointer
    window.addEventListener("heresy-derived", function (e) {
      if (!S.take || !e.detail || e.detail.name !== S.take.name) return;
      onTree(e.detail.files);
    });
    if (window.ResizeObserver) new ResizeObserver(function () { if (S.info) { drawRuler(); names().forEach(draw); paintPlayhead(); } }).observe(body);
    setInterval(function () {                         // HERESY 1532: the sections arrive when the player has timed the take
      if (!S.info || !document.querySelector("canvas[data-mx-ruler]")) return;
      var k2 = secKey();
      if (k2 !== S.secKey) { S.secKey = k2; var row = document.querySelector(".mx-ruler-row"); if (row) row.classList.toggle("has-secs", !!k2); redrawAll(); }
    }, 1500);
    paint();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();

  window.HeresyMixer = { setTake: setTake, value: value, play: play, stop: stop, undo: undo, redo: redo, ab: abTo,
    marks: { add: markAdd, jump: markJump, list: function () { return S.marks.map(function (m) { return { t: m.t, name: m.name }; }); } },   // HERESY 2016
    presets: { save: presetSave, lay: presetLay, del: presetDel, all: presetsAll },   // HERESY 2018
    grid: { data: gridData, load: gridLoad, set: gridSet, toggle: gridToggle, snap: function (n, t, c) { return snapT(n, t, c, null); } },   // HERESY 2313
    ref: { choose: refChoose, title: refTitle, menu: refMenu },   // HERESY 2315
    bounce: bounceRun, bounceItems: bounceItems,                  // HERESY 2316
    shapes: { expand: expandPts, lfo: lfoPoints, set: shapeSet, seg: segAt },   // HERESY 2318
    state: function () { var g = S.graph; return { take: S.take && S.take.name, set: S.set, sets: S.sets.length, strips: names(), playing: S.playing, at: pos(), srcs: S.srcs.length, versions: S.versions, busy: S.busy,
      zoom: S.view.zoom, t0: S.view.t0, loop: S.loop, loopOn: S.loopOn, focus: S.focus, meters: Object.assign({}, S.meters),   // HERESY 1501
      peaks: Object.keys(S.peaks).length, ctx: S.ctx ? S.ctx.state : "",
      graph: g ? { kind: g.eng.kind, on: !!g.on, lanes: Object.keys(g.lanes).length, room: !!g.rv.conv, latency: latency(g), master: !!g.mOn } : null,   // HERESY 1531; 1544: master
      levels: Object.keys(S.lv).length, loud: S.loud ? { m: S.loud.m, s: S.loud.s, i: S.loud.i, tp: S.loud.tp, lra: S.loud.lra } : null, undo: S.undo.length, redo: S.redo.length, ab: S.ab.cur,
      dock: S.dock, print: S.print, auto: Object.keys(S.autoShow).filter(function (k2) { return S.autoShow[k2]; }), mon: Object.assign({}, S.mon),
      ref: { armed: S.ref.armed, on: S.ref.on, match: S.ref.match, blocks: S.ref.z ? S.ref.z.length : 0, spec: S.ref.spec }, fade: S.info ? fadeOf() : null,   // HERESY 1755, 1756; 2315: spec
      grid: { on: S.grid.on, chords: S.grid.chords, wait: S.grid.wait, err: S.grid.err, bars: gridData() ? gridData().bars.length : 0 }, aud: S.aud ? S.aud.n : null }; },   // HERESY 2313, 2317
    // HERESY 1531: the console's way in (heresy-console.js)
    k: { S: S, names: names, strip: strip, set: setStrip, setBus: setBus, mark: mark, on: on, select: select, setVersion: setVersion, versionOf: versionOf, refresh: refreshVersions,   // 1561
         mixes: { list: function () { return S.named; }, lab: function () { return S.lab; }, saveAs: saveAs, load: loadNamed, del: delNamed },   // HERESY 1533
         monitor: function (k2, on) { if (k2) { S.mon[k2] = on == null ? !S.mon[k2] : !!on; applyMon(S.graph); emit("change", { bus: "monitor" }); } return S.mon; },   // HERESY 1536
         groups: function () { return S.buses.groups || []; }, groupSet: groupSet, groupAdd: groupAdd, groupDel: groupDel, vcaDb: vcaDb,   // HERESY 1543
         subs: function () { return S.buses.subs || []; }, subAdd: subAdd, subSet: subSet, subDel: subDel, subOfStrip: subOfStrip,   // HERESY 1563
         clearSolo: clearSolo, refToggle: refToggle, fadeDb: fadeDb, clock: clock,   // HERESY 1754–1756
         audible: audible, hue: hueOf, fmtDb: fmtDb, taper: taper, untaper: untaper, analyser: analyser, play: play, stop: stop, pos: pos,
         lufs: lufs, lra: lra, loudFeed: loudness, resetLoud: function () { S.loud = loudReset(); Object.keys(S.lv).forEach(function (k2) { S.lv[k2].max = -150; S.lv[k2].clip = false; }); emit("frame"); },
         info: function () { return S.info; }, title: function (n) { var st = S.info && S.info.strips.filter(function (x) { return x.name === n; })[0]; return st ? st.title : tr("Rest"); } } };
})();
