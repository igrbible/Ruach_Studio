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
            mon: { mono: false, dim: false } };          // HERESY 1536: the master's monitor, for the ear only
  function $(id) { return document.getElementById(id); }
  var UNDO_SVG = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M5 3 2 6l3 3M2.5 6H10a4 4 0 0 1 0 8H7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var REDO_SVG = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M11 3l3 3-3 3M13.5 6H6a4 4 0 0 0 0 8h3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function tr(s) { return window.RuachI18n ? window.RuachI18n.t(s) : s; }
  function clock(t) { t = Math.max(0, t || 0); var m = Math.floor(t / 60), s = Math.floor(t % 60); return m + ":" + (s < 10 ? "0" : "") + s; }
  function icon(n, alt) { return window.HeresyIcons ? window.HeresyIcons.ui(n) : alt; }
  function q(o) { return Object.keys(o).map(function (k) { return k + "=" + encodeURIComponent(o[k]); }).join("&"); }
  function getJson(path) {
    return fetch("/lab" + path).then(function (r) { return r.json().then(function (b) { if (!r.ok) throw new Error(b.error || r.status); return b; }); });
  }
  function say(text, bad) { var el = $("mxState"); if (el) { el.textContent = text || ""; el.classList.toggle("is-bad", !!bad); } }

  // ---- what is kept: the mix of a set of a take, in this browser
  function keyOf() { return "yue2.mixer:" + (S.take ? S.take.name : "") + ":" + S.set; }
  var keepTimer = 0;
  function keepNow() {
    clearTimeout(keepTimer); keepTimer = 0;
    if (!S.take || !S.set || S.owner !== keyOf()) return;   // HERESY 1545: kept only as whose it is
    S.t = Date.now();
    try { localStorage.setItem(keyOf(), JSON.stringify({ strips: S.strips, versions: S.versions, buses: S.buses, ab: S.ab, t: S.t })); } catch (e) { /* private mode */ }
    labKeep();
  }
  // HERESY 1533: the working mix on Forge, beside its set: sent a moment after the hand stops, so another browser opens it as it is
  function snapState() { return { strips: S.strips, versions: S.versions, buses: S.buses, ab: S.ab, t: S.t || Date.now() }; }
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
  var COMP_DEF = { on: true, threshold_db: -18, ratio: 2, knee_db: 6, attack_ms: 10, release_ms: 120, makeup_db: 0, key: "" };   // 1537: key
  var LIMIT_DEF = { on: true, ceiling_db: -1, drive_db: 0, release_ms: 100 };   // HERESY 1544: Plenio's limiter, its own defaults
  function busesDefault() {
    return { reverb: { preset: "room", return_db: 0, mute: false }, delay: { time_ms: 375, feedback: 0.35, lowpass_hz: 4000, return_db: 0, mute: false },
             master: { gain_db: 0, eq: null, comp: null, limit: null }, groups: [], subs: [] };   // HERESY 1544: the master's chain; 1543: the VCAs; 1563: the audio buses
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
             auto: Array.isArray(s.auto) ? s.auto : [],   // HERESY 1535: [[t, dB], …]
             autos: s.autos && typeof s.autos === "object" && !Array.isArray(s.autos) ? s.autos : {},   // HERESY 1559: pan, width, sends
             edits: Array.isArray(s.edits) ? s.edits : [] };   // HERESY 1564: stretches copied or moved along the lane
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
  function hueOf(n) { for (var i = 0; i < LANE_HUES.length; i++) if (LANE_HUES[i][0].test(n)) return LANE_HUES[i][1]; return "#2f9a8f"; }
  // the value the render reads (HERESY 1531: ruach.mix/1, lab/daw_mix.py): every strip's settings that are not its defaults, the
  // returns and the master
  function rnd(v, k) { var m = Math.pow(10, k); return Math.round(v * m) / m; }
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
      if (s.eq && s.eq.bands.length) o.eq = { on: s.eq.on, bands: s.eq.bands.map(function (x) {
        return { id: String(x.id), type: x.type, enabled: x.enabled !== false, frequency_hz: rnd(+x.frequency_hz, 1), gain_db: rnd(+x.gain_db || 0, 2), q: rnd(+x.q, 3) }; }) };
      if (s.comp) o.comp = { on: !!s.comp.on, threshold_db: rnd(s.comp.threshold_db, 2), ratio: rnd(s.comp.ratio, 2), knee_db: rnd(s.comp.knee_db, 2),
                             attack_ms: rnd(s.comp.attack_ms, 2), release_ms: rnd(s.comp.release_ms, 1), makeup_db: rnd(s.comp.makeup_db, 2) };
      if (s.comp && s.comp.key && s.comp.key !== n && names().indexOf(s.comp.key) >= 0) o.comp.key = s.comp.key;   // HERESY 1537
      if (s.width !== 1) o.width = rnd(s.width, 3);
      if (s.pan) o.pan = rnd(s.pan, 3);
      if (s.reverb) o.reverb = rnd(s.reverb, 3);
      if (s.delay) o.delay = rnd(s.delay, 3);
      if (s.auto.length) o.auto = s.auto.slice().sort(function (a, b) { return a[0] - b[0]; }).map(function (p) { return [rnd(p[0], 3), rnd(p[1], 2)]; });   // HERESY 1535
      var oa = {};                                    // HERESY 1559
      Object.keys(AUTO_P).forEach(function (k2) { var pp = s.autos[k2]; if (k2 !== "volume" && Array.isArray(pp) && pp.length) oa[k2] = pp.slice().sort(function (a, b) { return a[0] - b[0]; }).map(function (p) { return [rnd(p[0], 3), rnd(p[1], 3)]; }); });
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
    var ms = masterStrip(), mo = {};                   // HERESY 1544: the master's fader and chain
    if (ms.gain_db) mo.gain_db = rnd(ms.gain_db, 2);
    if (ms.eq && ms.eq.bands.length) mo.eq = { on: ms.eq.on, bands: ms.eq.bands.map(function (x) {
      return { id: String(x.id), type: x.type, enabled: x.enabled !== false, frequency_hz: rnd(+x.frequency_hz, 1), gain_db: rnd(+x.gain_db || 0, 2), q: rnd(+x.q, 3) }; }) };
    if (ms.comp) mo.comp = { on: !!ms.comp.on, threshold_db: rnd(ms.comp.threshold_db, 2), ratio: rnd(ms.comp.ratio, 2), knee_db: rnd(ms.comp.knee_db, 2),
                             attack_ms: rnd(ms.comp.attack_ms, 2), release_ms: rnd(ms.comp.release_ms, 1), makeup_db: rnd(ms.comp.makeup_db, 2) };
    if (ms.limit) mo.limit = { on: !!ms.limit.on, ceiling_db: rnd(ms.limit.ceiling_db, 2), drive_db: rnd(ms.limit.drive_db, 2), release_ms: rnd(ms.limit.release_ms, 1) };
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
      return o4; });
    return out;
  }
  // HERESY 1543: the VCAs over their members, as the render reads them
  function groupsOf(n) { return (S.buses.groups || []).filter(function (x) { return x.members.indexOf(n) >= 0; }); }
  function vcaDb(n) { return groupsOf(n).reduce(function (a, x) { return a + (+x.gain_db || 0); }, 0); }
  function audible(name) {
    var soloing = names().some(function (n) { return strip(n).solo; }) || (S.buses.groups || []).some(function (x) { return x.solo && x.members.length; });
    var gs = groupsOf(name);
    return soloing ? strip(name).solo || gs.some(function (x) { return x.solo; }) : !(strip(name).mute || gs.some(function (x) { return x.mute; }));
  }
  function versionOf(name) {
    if (name === REST) return "";
    var s = S.info.strips.filter(function (x) { return x.name === name; })[0], want = S.versions[name];
    return s.versions.some(function (v) { return v.path === want; }) ? want : s.path;
  }

  // ---- the take, its sets of stems
  function setTake(take) {
    if (S.take && take && S.take.name === take.name) return;
    stop();
    keepNow(); closeGraph();   // HERESY 1531
    clearTimeout(S.watch); S.busy = ""; S.mixId = "";   // HERESY 1536: a mix watched for another take is no longer this one's
    S.owner = "";                                     // HERESY 1545: the mix in hand was the last take's
    S.take = take ? { name: take.name, label: take.label || take.name, seconds: take.seconds || 0 } : null;
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
    paint();
    if (!S.take || !S.set) return;
    var token = ++S.token;
    say(tr("Reading the set…"));
    getJson("/daw/set?" + q({ name: S.take.name, set: S.set })).then(function (info) {
      if (token !== S.token) return;
      S.info = info;
      var kept = recall() || {};
      S.strips = migrate(kept.strips || {}); S.versions = kept.versions || {}; S.buses = busesOf(kept.buses);   // HERESY 1531
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
      html += ruler().replace('<div class="mx-ruler-row">', '<div class="mx-ruler-row' + (S.secKey ? " has-secs" : "") + '">');                                 // HERESY 1501
      names().forEach(function (n) { html += lane(n); });
      html += '<div class="mx-head-line" id="mxPlayhead" aria-hidden="true"></div>';
    }
    html += "</div>";
    if (S.info) html += '<div class="mx-dock" id="mxDock"' + (S.dock ? "" : " hidden") + "></div>";   // HERESY 1531: the console (heresy-console.js)
    html += '<p class="row-hint mx-note">' + esc(tr("Everything set here is heard as it is set and mixed on Forge as it is heard: the same EQ, compressor, pan, room and delay. Drag along a wave to silence a stretch, right-click it to give it back, click to play from there.")) + " " +
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
    h.innerHTML = '<label class="field mx-set"><span class="label">' + esc(tr("A set of stems")) + '</span><select id="mxSet">' + sets + "</select></label>" +
      '<button type="button" class="btn ghost small icon-act mx-play" id="mxPlay" aria-label="' + esc(tr(S.playing ? "Pause" : "Play")) + '"' + (S.info ? "" : " disabled") + ">" + icon(S.playing ? "pause" : "play", S.playing ? "❚❚" : "▶") + "</button>" +
      '<span class="mono mx-time" id="mxTime">' + clock(pos()) + " / " + clock(S.info ? S.info.seconds : 0) + "</span>" +
      // HERESY 1531: A and B, undo and redo, the console shown or not, the stems printed with the mix
      '<span class="mx-ab" role="group" aria-label="' + esc(tr("Two mixes to compare")) + '">' + ["A", "B"].map(function (k) {
        return '<button type="button" class="mx-ms' + (S.ab.cur === k ? " is-on" : "") + '" id="mx' + k + '" aria-pressed="' + (S.ab.cur === k) + '" data-tip="' +
          esc(tr("Two mixes of this set to compare: switch between them as it plays; what is set goes into the one lit")) + '">' + k + "</button>"; }).join("") + "</span>" +
      '<button type="button" class="mx-ms mx-undo" id="mxUndo"' + (S.undo.length ? "" : " disabled") + ' aria-label="' + esc(tr("Undo")) + '" data-tip="' + esc(tr("Undo (Ctrl+Z)")) + '">' + UNDO_SVG + "</button>" +
      '<button type="button" class="mx-ms mx-undo" id="mxRedo"' + (S.redo.length ? "" : " disabled") + ' aria-label="' + esc(tr("Redo")) + '" data-tip="' + esc(tr("Redo (Ctrl+Shift+Z)")) + '">' + REDO_SVG + "</button>" +
      '<button type="button" class="btn ghost small" id="mxReset"' + (S.info ? "" : " disabled") + ' data-tip="' + esc(tr("Every lane back to as split: level 0 dB, nothing muted, no silence, no sends")) + '">' + esc(tr("Reset")) + "</button>" +
      '<button type="button" class="btn ghost small icon-act" id="mxDockBtn" aria-pressed="' + S.dock + '" data-tip="' + esc(tr("The console under the lanes: every strip's inserts, sends, pan and fader, the returns and the master")) + '">' +
        icon("sliders", "\u2261") + "<span>" + esc(tr("Console")) + "</span></button>" +
      '<button type="button" class="mx-ms mx-print' + (S.print ? " is-on" : "") + '" id="mxPrint" aria-pressed="' + S.print + '" data-tip="' + esc(tr("Mix with its stems: every strip as it sounds in the mix, and each return, its own file beside the mix")) + '">+' + esc(tr("stems")) + "</button>" +
      (S.busy && S.mixId ? '<button type="button" class="btn ghost small mx-stop" id="mxStop" data-tip="' + esc(tr("Stop the mix on Forge: nothing is made")) + '">' + esc(tr("Stop")) + "</button>" : "") +   // HERESY 1539
      '<button type="button" class="btn primary small" id="mxMix"' + (S.info && !S.busy ? "" : " disabled") + ' data-tip="' + esc(tr("Mix it on Forge as it is heard here: a branch of the tree, its loudness measured")) + '">' + esc(tr("Mix")) + "</button>" +
      '<button type="button" class="btn ghost small icon-act mx-full" id="mxFull" aria-pressed="' + (isFull() ? "true" : "false") + '" aria-label="' + esc(tr(isFull() ? "Back from full screen" : "Full screen")) +
        '" data-tip="' + esc(tr("The DAW over the whole screen, its lanes as tall as the screen gives them; F11 here does the same. Esc, F11 or this button back")) + '">' +
        icon(isFull() ? "minimize" : "maximize", isFull() ? "\u2921" : "\u26f6") + "</button>" +   // HERESY 1499
      '<span class="row-hint mono mx-state" id="mxState"></span>';
  }
  // HERESY 1499 (Viktor 16.10.2026: «DAW будет самым интересным. И сразу внедряй переключение в максимальный full screen режим, и перехватывай
  // в нём браузерный F11 на вкладке Студии»): the DAW over the whole window (the page's dialogs, menus and tips still over it), the window full
  // screen when the browser lets it; Esc, F11 or the button back. F11 on the studio's tab is the studio's: the DAW in sight goes full and
  // back, elsewhere the studio itself full screen and back (Esc as well)
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
  function lane(n) {
    var s = strip(n), st = n === REST ? null : S.info.strips.filter(function (x) { return x.name === n; })[0];
    var title = st ? st.title : tr("Rest"), cur = versionOf(n);
    var ver = st ? '<select class="mx-ver" data-mx="version" aria-label="' + esc(tr("Version")) + '">' + st.versions.map(function (v) {
      return '<option value="' + esc(v.path) + '"' + (v.path === cur ? " selected" : "") + ' translate="no">' + esc(v.id ? v.label + (v.created ? " · " + v.created.slice(11) : "") : tr("as split")) + "</option>";
    }).join("") + "</select>" + verButton(n, st) : '<span class="mx-ver mx-rest-say" data-tip="' + esc(tr("What the source holds beyond the stems: what the separation missed. All lanes as they are give the source back")) + '">' + esc(tr("the source less the stems")) + "</span>";
    return '<div class="mx-lane' + (audible(n) ? "" : " is-quiet") + (S.focus === n ? " is-focus" : "") + '" data-strip="' + esc(n) + '" style="--mx-lane:' + hueOf(n) + ';--mx-wave:' + hueOf(n) + '">' +   // HERESY 1501
      '<div class="mx-ctl"><span class="mx-meter" data-meter="' + esc(n) + '" data-tip="' + esc(tr("Its level as it plays (the peak, the last held a moment)")) + '"><i></i></span>' +
      '<span class="mx-name" translate="no" title="' + esc(title) + '">' + esc(title) + "</span>" + ver +
      '<button type="button" class="mx-ms' + (s.mute ? " is-on" : "") + '" data-mx="mute" aria-pressed="' + s.mute + '" data-tip="' + esc(tr("Mute")) + '">M</button>' +
      '<button type="button" class="mx-ms mx-solo' + (s.solo ? " is-on" : "") + '" data-mx="solo" aria-pressed="' + s.solo + '" data-tip="' + esc(tr("Solo: only the soloed lanes are heard")) + '">S</button>' +
      '<button type="button" class="mx-ms mx-auto' + (S.autoShow[n] ? " is-on" : "") + (hasAuto(n) ? " has-auto" : "") + '" data-mx="auto" aria-pressed="' + !!S.autoShow[n] + '" data-tip="' +   // HERESY 1535
        esc(tr("Automation: the lane's volume drawn over time. On, a click on the wave puts a point there and drags it, a right-click takes it away, a double-click sets it to 0 dB; heard and mixed after the fader")) + '">A</button>' +
      '<button type="button" class="mx-ms mx-autop" data-mx="autop"' + (S.autoShow[n] ? "" : " hidden") + ' data-tip="' +   // HERESY 1559
        esc(tr("Which knob the line draws: volume, pan, width, the room's send or the delay's; a click goes to the next. A knob drawn plays its line in place of its own value")) + '">' + esc(tr(AUTO_P[autoParam(n)].short)) + "</button>" +
      '<label class="mx-fader" data-tip="' + esc(tr("Level, −60 to +12 dB; a double-click puts it back at 0")) + '"><input type="range" min="-60" max="12" step="0.5" value="' + s.gain_db + '" data-mx="gain_db" /><output class="mono">' + fmtDb(s.gain_db) + "</output></label>" +
      "</div>" +   // HERESY 1531: the compressor, the sends and the rest of the strip in the console
      '<div class="mx-wave"><canvas data-mx-wave="' + esc(n) + '"></canvas></div></div>';
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
      '<button type="button" class="mx-ms" id="mxZoomOut" data-tip="' + esc(tr("Zoom out (−)")) + '">−</button>' +
      '<button type="button" class="mx-ms" id="mxZoomIn" data-tip="' + esc(tr("Zoom in (+); Ctrl+wheel zooms about the pointer, Shift+wheel goes along")) + '">+</button>' +
      '<button type="button" class="btn ghost small" id="mxFit" data-tip="' + esc(tr("The whole song in view (0)")) + '">' + esc(tr("Fit")) + "</button>" +
      '<span class="mx-meter mx-master" data-meter="*" data-tip="' + esc(tr("The whole mix's level as it plays")) + '"><i></i></span>' +
      '<span class="row-hint mono mx-keys" data-tip="' + esc(tr("Space plays and stops; Home to the start (the loop's, when it is on); L the loop; M and S the lane picked by a click on its name; ↑ ↓ another lane; + − 0 the zoom; [ ] the section before and after; Ctrl+Z, Ctrl+Shift+Z undo and redo")) + '">' + esc(tr("keys")) + "</span></div>" +
      '<div class="mx-wave mx-ruler" data-tip="' + esc(tr("The time: a click goes there, a drag draws the loop. Under it the song's sections, as the player has timed them: a click goes to one, a double-click loops it")) + '"><canvas data-mx-ruler="1"></canvas></div></div>';
  }
  // HERESY 1532: the song's sections, as the player's wave has them (the take in the player): [{t, name, end}], each to the next
  var SEC_HUES = [[/chorus|hook|refrain|припев/i, "217,157,16"], [/verse|куплет/i, "47,154,143"], [/bridge|pre|бридж/i, "138,99,210"],
                  [/intro|outro|вступ|кода|end/i, "138,138,138"], [/instr|break|solo|проигр/i, "63,127,191"]];
  function sections() {
    var f = window.ruachWaveSections, l = f && S.take ? f(S.take.name) : null, L = S.info ? S.info.seconds : 0;
    l = (l || []).filter(function (x) { return x && x.t != null && isFinite(x.t) && x.t < L; }).slice().sort(function (a, b) { return a.t - b.t; });
    return l.map(function (x, i) { return { t: x.t, name: String(x.name || ""), end: i + 1 < l.length ? l[i + 1].t : L }; });
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
  function redrawAll() { if (S.info) { drawRuler(); names().forEach(draw); paintPlayhead(); } }
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
    var css = getComputedStyle(c), on = css.getPropertyValue("--mx-wave").trim() || "#d99d10", off = css.getPropertyValue("--mx-quiet").trim() || "rgba(0,0,0,.45)";
    var L = S.info.seconds || 1;
    if (pk) {
      g.fillStyle = on;
      var base = full ? h / 2 : h - 1, amp = full ? h / 2 - 1 : h - 2;
      for (var x = 0; x < w; x++) {
        var i0 = Math.floor(xt(x, w) / L * pk.length), i1 = Math.max(i0 + 1, Math.floor(xt(x + 1, w) / L * pk.length)), m = 0;   // HERESY 1501: through the view
        for (var i = i0; i < i1 && i < pk.length; i++) if (pk[i] > m) m = pk[i];
        var y = Math.max(1, m * amp);
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
          var yy = Math.max(1, mm * amp2);
          g.fillRect(px2, base2 - yy, 1, 2 * yy);
        }
      }
      g.strokeStyle = acc; g.lineWidth = 1; g.strokeRect(Math.round(xa) + 0.5, 0.5, Math.max(1, Math.round(xb - xa) - 1), h - 1);
      if (xb - xa > 40) { g.fillStyle = acc; g.font = "10px sans-serif"; g.fillText((e2.op === "move" ? "\u21e2 " : "\u29c9 ") + clock(e2.a), xa + 4, 11); }
    });
    if (S.pick && S.pick.n === n) {                   // HERESY 1564: the stretch in hand
      g.fillStyle = acc; g.globalAlpha = 0.22; g.fillRect(tx(S.pick.a, w), 0, (S.pick.b - S.pick.a) / span() * w, h); g.globalAlpha = 1;
    }
    if (S.drag && S.drag.name === n && S.drag.moved) {
      var a = Math.min(S.drag.a, S.drag.b), b = Math.max(S.drag.a, S.drag.b);
      if (S.drag.pick) { g.fillStyle = acc; g.globalAlpha = 0.22; } else g.fillStyle = off;   // 1564: Shift picks, a plain drag silences
      g.fillRect(tx(a, w), 0, (b - a) / span() * w, h); g.globalAlpha = 1;
    }
    if (S.loop && S.loopOn) { g.fillStyle = "rgba(217,157,16,.08)"; g.fillRect(tx(S.loop[0], w), 0, Math.max(1, (S.loop[1] - S.loop[0]) / span() * w), h); }   // HERESY 1501
    sections().forEach(function (sc) {                // HERESY 1532: a thin line through the lane at each section's start
      var x = Math.round(tx(sc.t, w)) + 0.5;
      if (x < 0 || x > w) return;
      g.fillStyle = "rgba(" + secHue(sc.name) + ",.55)"; g.fillRect(x, 0, 1, h);
    });
    var prm = S.autoShow[n] ? autoParam(n) : "volume", au = sortedPts(n, prm);   // HERESY 1535: the lane's volume over time; 1559: or the knob in hand
    if (au.length || S.autoShow[n]) {
      var amber = css.getPropertyValue("--amber").trim() || "#d99d10", inkc = css.getPropertyValue("--ink").trim() || "#222";
      if (S.autoShow[n] && prm !== "volume") {        // the knob's rest, a thin line
        g.globalAlpha = 0.35; g.fillStyle = amber; g.fillRect(0, Math.round(aY(prm, AUTO_P[prm].rest, h)), w, 1); g.globalAlpha = 1;
      }
      g.strokeStyle = amber; g.lineWidth = 1.5; g.globalAlpha = S.autoShow[n] ? 1 : 0.6; g.beginPath();
      for (var ax = 0; ax <= w; ax += 2) { var ay = aY(prm, au.length ? autoDb(au, xt(ax, w)) : AUTO_P[prm].rest, h); if (ax) g.lineTo(ax, ay); else g.moveTo(ax, ay); }
      g.stroke(); g.globalAlpha = 1;
      if (S.autoShow[n]) au.forEach(function (q) {
        var qx = tx(q[0], w); if (qx < -6 || qx > w + 6) return;
        g.beginPath(); g.arc(qx, aY(prm, q[1], h), 3.5, 0, Math.PI * 2); g.fillStyle = amber; g.fill(); g.strokeStyle = inkc; g.lineWidth = 1; g.stroke();
      });
    }
  }
  function paintPlayhead() {
    var ph = $("mxPlayhead"), lanes = $("mxLanes"), c = lanes && lanes.querySelector("canvas[data-mx-wave]");
    if (!ph || !c || !S.info) return;
    var box = c.parentNode, px = tx(heard(), box.clientWidth), x = box.offsetLeft + px;   // HERESY 1501: through the view; 1531: as heard
    ph.style.left = Math.round(x) + "px";
    ph.style.display = px < 0 || px > box.clientWidth ? "none" : "";
    var t = $("mxTime");
    if (t) t.textContent = clock(pos()) + " / " + clock(S.info.seconds);
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
    g.master = { input: gain(), fader: gain(), eq: [], eqKey: null };   // HERESY 1544: input · EQ · the chain's node · fader, wired when the kernel is up
    // HERESY 1536: the monitor after the meters: Mono (the sides summed, mid and side by four gains as a lane's width) and Dim
    var mon = g.mon = { sp: node(ctx.createChannelSplitter(2)), mg: node(ctx.createChannelMerger(2)), w: [gain(), gain(0), gain(0), gain()], dim: gain() };
    g.master.fader.connect(mon.sp);
    mon.sp.connect(mon.w[0], 0); mon.sp.connect(mon.w[1], 0); mon.sp.connect(mon.w[2], 1); mon.sp.connect(mon.w[3], 1);
    mon.w[0].connect(mon.mg, 0, 0); mon.w[1].connect(mon.mg, 0, 1); mon.w[2].connect(mon.mg, 0, 0); mon.w[3].connect(mon.mg, 0, 1);
    mon.mg.connect(mon.dim); mon.dim.connect(ctx.destination);
    g.master.an = node(ctx.createAnalyser()); g.master.an.fftSize = 8192; g.master.an.smoothingTimeConstant = 0.75;
    g.master.fader.connect(g.master.an);
    g.master.sp = node(ctx.createChannelSplitter(2)); g.master.anL = node(ctx.createAnalyser()); g.master.anR = node(ctx.createAnalyser());   // HERESY 1538: the goniometer's two sides
    g.master.anL.fftSize = g.master.anR.fftSize = 2048;
    g.master.fader.connect(g.master.sp); g.master.sp.connect(g.master.anL, 0); g.master.sp.connect(g.master.anR, 1);
    var rv = g.rv = { input: gain(), conv: null, ret: gain(), mute: gain() };
    rv.ret.connect(rv.mute); rv.mute.connect(g.master.input);
    var dl = g.dl = { input: gain(), del: node(ctx.createDelay(2.0)), y: gain(), fb: gain(0), ret: gain(), mute: gain(), lp: null };
    dl.input.connect(dl.del); dl.del.connect(dl.y); dl.y.connect(dl.ret); dl.ret.connect(dl.mute); dl.mute.connect(g.master.input); dl.fb.connect(dl.del);
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
      rv.mute.connect(g.eng.meterIns[ns.length]); dl.mute.connect(g.eng.meterIns[ns.length + 1]); g.master.fader.connect(g.eng.meterIns[ns.length + 2]);
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
    if (l.pan) { if (drawn(n, "pan")) knobLine([l.pan.pan], sortedPts(n, "pan"), function (v) { return v; }, from, now, at); else if (l.panLine) still([l.pan.pan], s.pan); }
    if (l.w) {
      if (drawn(n, "width")) {
        var wp = sortedPts(n, "width");
        knobLine([l.w[0].gain, l.w[3].gain], wp, function (v) { return (1 + v) / 2; }, from, now, at);
        knobLine([l.w[1].gain, l.w[2].gain], wp, function (v) { return (1 - v) / 2; }, from, now, at);
      } else if (l.wLine) { still([l.w[0].gain, l.w[3].gain], (1 + s.width) / 2); still([l.w[1].gain, l.w[2].gain], (1 - s.width) / 2); }
    }
    if (drawn(n, "reverb")) knobLine([l.rv.gain], sortedPts(n, "reverb"), function (v) { return v; }, from, now, at); else if (l.rvLine) still([l.rv.gain], s.reverb);
    if (drawn(n, "delay")) knobLine([l.dl.gain], sortedPts(n, "delay"), function (v) { return v; }, from, now, at); else if (l.dlLine) still([l.dl.gain], s.delay);
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
    var p = l.auto.gain, now = S.ctx.currentTime, pts = autoPts(n);
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
      l.w[0].gain.setTargetAtTime(a, t, k); l.w[3].gain.setTargetAtTime(a, t, k); l.w[1].gain.setTargetAtTime(b, t, k); l.w[2].gain.setTargetAtTime(b, t, k);
    }
    if (l.pan && !drawn(n, "pan")) l.pan.pan.setTargetAtTime(s.pan, t, k);
    l.gate.gain.setTargetAtTime(audible(n) ? 1 : 0, t, k);
    if (!drawn(n, "reverb")) l.rv.gain.setTargetAtTime(s.reverb, t, k);
    if (!drawn(n, "delay")) l.dl.gain.setTargetAtTime(s.delay, t, k);
    g.eng.setComp(l.i, s.comp && s.comp.on ? Object.assign({}, s.comp, { keyIndex: s.comp.key && s.comp.key !== n ? names().indexOf(s.comp.key) : -1 }) : { on: false });   // 1537
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
  function applyBuses(g) {
    if (!g || !S.ctx) return;
    var b = S.buses, ctx = S.ctx, t = ctx.currentTime, k = 0.01, rate = ctx.sampleRate, rv = g.rv, d = g.dl;
    rv.ret.gain.setTargetAtTime(db(b.reverb.return_db), t, k); rv.mute.gain.setTargetAtTime(b.reverb.mute ? 0 : 1, t, k);
    if (g.rvPreset !== b.reverb.preset) {
      var preset = g.rvPreset = b.reverb.preset, key = preset + "|" + rate;
      var got = IRS[key] || (IRS[key] = fetch("/lab/daw/ir?" + q({ preset: preset, rate: rate }))
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
        .then(function (buf) { return ctx.decodeAudioData(buf); }));
      got.then(function (ir) {
        if (g.dead || g.rvPreset !== preset) return;
        var conv = ctx.createConvolver();              // a new convolver for a new room: the render's impulse, not normalised
        conv.normalize = false; conv.buffer = ir; g.all.push(conv);
        rv.input.connect(conv); conv.connect(rv.ret);
        if (rv.conv) { try { rv.input.disconnect(rv.conv); rv.conv.disconnect(); } catch (e) { /* gone */ } }
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
      fetch("/lab/daw/chunk?" + q({ name: S.take.name, set: S.set, strip: n, path: versionOf(n), start: e2.a + (s0 - d0), seconds: s1 - s0 }))
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
    return fetch("/lab/daw/chunk?" + q({ name: S.take.name, set: S.set, strip: n, path: versionOf(n), start: k * CHUNK, seconds: CHUNK }))
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
      .then(function (buf) { return S.ctx.decodeAudioData(buf); });
  }
  function schedule(k, token) {
    if (token !== S.token || k * CHUNK >= S.info.seconds) return;
    var at = k * CHUNK, ns = names();
    Promise.all(ns.map(function (n) { return fetchChunk(n, k).catch(function () { return null; }); })).then(function (bufs) {
      if (token !== S.token) return;
      var ctx = S.ctx, when = S.startCtx + (at - S.startAt), now = ctx.currentTime + 0.02;
      bufs.forEach(function (b, i) {
        var l = S.graph && S.graph.lanes[ns[i]];
        if (!b || !l) return;
        var n = ns[i], src = ctx.createBufferSource(), skip = Math.max(0, S.startAt - at);
        src.buffer = b;
        src.connect(l.range);
        var start = when + skip, late = Math.max(0, now - start);
        if (skip + late < b.duration) { src.start(start + late, skip + late); S.srcs.push(src); }
        ranges(n, l, at, at + CHUNK);
        laid(n, l, at, token);                        // HERESY 1564
      });
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
  function loudReset() { return { z: [], win: [], tp: 0, max: -150, corr: 1, m: null, s: null, i: null, n: 0 }; }
  function lufs(p) { return p > 0 ? -0.691 + 10 * Math.log10(p) : null; }
  function loudness(t) {
    var L = S.loud || (S.loud = loudReset());
    if (!t || !t.n) return;
    (t.blocks || []).forEach(function (z) {
      L.z.push(z);
      var k = L.z.length;
      if (k >= 4) L.win.push((L.z[k - 1] + L.z[k - 2] + L.z[k - 3] + L.z[k - 4]) / 4);   // 400 ms, a new one every 100 ms
    });
    if (L.z.length > 400) L.z.splice(0, L.z.length - 400);
    L.tp = Math.max(L.tp, t.tp || 0);
    var k2 = L.z.length;
    L.m = k2 >= 4 ? lufs(L.win[L.win.length - 1]) : null;
    if (k2 >= 30) { var sum = 0; for (var i = k2 - 30; i < k2; i++) sum += L.z[i]; L.s = lufs(sum / 30); } else L.s = null;
    if (++L.n % 10 === 0 || L.i == null) {          // integrated: gated at −70 LUFS, then 10 LU under the mean of what passed
      var abs = L.win.filter(function (w) { return lufs(w) > -70; });
      if (abs.length) {
        var mean = abs.reduce(function (x, y) { return x + y; }, 0) / abs.length, rel = lufs(mean) - 10;
        var gated = abs.filter(function (w) { return lufs(w) > rel; });
        L.i = gated.length ? lufs(gated.reduce(function (x, y) { return x + y; }, 0) / gated.length) : null;
      }
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
    if (pick) { select(pick.closest(".mx-lane").dataset.strip); return; }
    var el = e.target.closest && e.target.closest("button");
    if (!el) return;
    if (el.id === "mxLoop") { S.loopOn = !S.loopOn; loopPaint(); return; }
    if (el.id === "mxZoomIn" || el.id === "mxZoomOut") { var wb = waveBox(); if (wb) zoomAt(el.id === "mxZoomIn" ? 1.5 : 1 / 1.5, tx(pos(), wb.clientWidth), wb.clientWidth); return; }
    if (el.id === "mxFit") { S.view = { zoom: 1, t0: 0 }; redrawAll(); return; }
    if (el.id === "mxPlay") { if (S.playing) stop(); else play(); return; }
    if (el.id === "mxReset") { mark(); S.strips = {}; S.versions = {}; S.buses = busesDefault(); restored(); return; }
    if (el.id === "mxMix") { mix(); return; }
    if (el.id === "mxStop") { stopMix(); return; }     // HERESY 1539
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
    if (row && (k === "mute" || k === "solo")) {
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
    emit("change", { bus: bus, key: key });
  }
  var EV = {};
  function on(ev, fn) { (EV[ev] || (EV[ev] = [])).push(fn); }
  function emit(ev, d) { (EV[ev] || []).forEach(function (fn) { try { fn(d); } catch (e) { if (window.console) console.error(e); } }); }
  function onDbl(e) {
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
    var ac = e.target.closest && e.target.closest("canvas[data-mx-wave]");   // HERESY 1535: a point to 0 dB
    if (ac && S.info && S.autoShow[ac.dataset.mxWave]) {
      var a = autoAt(ac, e);
      if (a.hit) { mark(); a.hit[1] = AUTO_P[a.prm].rest; keep(); draw(a.n); autoSchedule(a.n); emit("change", { n: a.n, key: "auto" }); }   // 1559: the knob's rest
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
      var kk = e.key.toLowerCase();                   // HERESY 1564: copy, take to move, lay at the playhead
      if (kk === "c" || kk === "x") {
        if (!S.pick) return;
        e.preventDefault();
        S.clip = { n: S.pick.n, a: S.pick.a, b: S.pick.b, op: kk === "x" ? "move" : "copy" };
        say(tr(kk === "x" ? "Taken {0}–{1}: Ctrl+V moves it to the playhead" : "Copied {0}–{1}: Ctrl+V lays it at the playhead").replace("{0}", clock(S.clip.a)).replace("{1}", clock(S.clip.b)));
        return;
      }
      if (!S.clip || !S.info) return;
      e.preventDefault();
      var cl = S.clip, to = Math.round(Math.max(0, Math.min(S.info.seconds - 0.05, S.playing ? pos() : S.at)) * 1000) / 1000, sc = S.strips[cl.n] || (S.strips[cl.n] = {});
      mark();
      if (!Array.isArray(sc.edits)) sc.edits = [];
      sc.edits.push({ op: cl.op, a: cl.a, b: cl.b, to: to });
      if (cl.op === "move") cl.op = "copy";          // moved once; the next lays a copy
      keep(); draw(cl.n); rangesNow(cl.n);
      if (S.playing) play(pos());
      emit("change", { n: cl.n, key: "edits" });
      say(tr("Laid at {0}").replace("{0}", clock(to)));
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
    if ((k === "Delete" || k === "Backspace") && S.pick) {   // HERESY 1564: the stretch in hand silenced, as a drag would
      e.preventDefault();
      var pn = S.pick.n, ps = S.strips[pn] || (S.strips[pn] = {});
      mark();
      ps.muted = (ps.muted || []).concat([[S.pick.a, S.pick.b]]).sort(function (x, y) { return x[0] - y[0]; });
      S.pick = null;
      keep(); draw(pn); rangesNow(pn); emit("change", { n: pn, key: "muted" });
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
  function autoAt(c, e) {                            // the point under the pointer, or null; and the time and level there (1559: of the knob in hand)
    var r = c.getBoundingClientRect(), n = c.dataset.mxWave, x = e.clientX - r.left, y = e.clientY - r.top, prm = autoParam(n), pts = rawPts(n, prm), hit = null, best = 8;
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
  function onDown(e) {
    if (rulerDown(e)) return;                         // HERESY 1501
    var c = e.target.closest && e.target.closest("canvas[data-mx-wave]");
    if (!c || e.button !== 0 || !S.info) return;
    if (S.autoShow[c.dataset.mxWave]) { autoDown(e, c); return; }   // HERESY 1535
    e.preventDefault();
    var hit = cutAt(c, e);                            // HERESY 1542: a stretch's edge in hand
    if (hit) {
      S.cdrag = { n: c.dataset.mxWave, c: c, r: hit.r, kind: hit.kind, x: e.clientX, moved: false };
      try { if (c.setPointerCapture) c.setPointerCapture(e.pointerId); } catch (x) { /* gone */ }
      return;
    }
    var t = timeAt(c, e.clientX);
    S.drag = { name: c.dataset.mxWave, canvas: c, x: e.clientX, a: t, b: t, moved: false, pick: !!e.shiftKey };   // HERESY 1564: Shift picks a stretch
    try { if (c.setPointerCapture) c.setPointerCapture(e.pointerId); } catch (x) { /* a pointer the browser no longer holds */ }
  }
  function onMove(e) {
    var rr = S.rule;                                  // HERESY 1501: the loop drawn
    if (rr) {
      if (rr.sec) return;                             // HERESY 1532: a section's block is clicked, not dragged
      rr.b = timeAt(rr.canvas, e.clientX);
      if (Math.abs(e.clientX - rr.x) > 4) rr.moved = true;
      if (rr.moved) { S.loop = [Math.min(rr.a, rr.b), Math.max(rr.a, rr.b)]; drawRuler(); }
      return;
    }
    if (S.adrag) {                                    // HERESY 1535: a point moved, between its neighbours
      var ad = S.adrag, at = autoAt(ad.c, e), pts = sortedPts(ad.n, at.prm), i = pts.indexOf(ad.q);   // 1559: of the knob in hand
      var lo = i > 0 ? pts[i - 1][0] + 0.001 : 0, hi = i >= 0 && i < pts.length - 1 ? pts[i + 1][0] - 0.001 : S.info.seconds;
      ad.q[0] = Math.round(Math.max(lo, Math.min(hi, at.t)) * 1000) / 1000; ad.q[1] = at.db; ad.moved = true;
      draw(ad.n);
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
      if (hc && S.info && !S.autoShow[hc.dataset.mxWave]) { var hh = cutAt(hc, e); hc.style.cursor = hh ? "ew-resize" : ""; }
      return;
    }
    d.b = timeAt(d.canvas, e.clientX);
    if (Math.abs(e.clientX - d.x) > 4) d.moved = true;
    if (d.moved) draw(d.name);
  }
  function onUp(e) {
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
      keep(); draw(ad.n); autoSchedule(ad.n); lanePaintAuto(ad.n);
      emit("change", { n: ad.n, key: "auto" });
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
    if (!d.moved) { if (S.playing) play(d.a); else { S.at = d.a; paintPlayhead(); } return; }
    var a = Math.min(d.a, d.b), b = Math.max(d.a, d.b);
    if (b - a < 0.05) return draw(d.name);
    if (d.pick) {                                     // HERESY 1564: a stretch in hand, nothing silenced
      var was = S.pick && S.pick.n;
      S.pick = { n: d.name, a: Math.round(a * 1000) / 1000, b: Math.round(b * 1000) / 1000 };
      if (was && was !== d.name) draw(was);
      draw(d.name); select(d.name);
      say(tr("Picked {0}–{1}: Ctrl+C copies it, Ctrl+X takes it to move, Delete silences it").replace("{0}", clock(S.pick.a)).replace("{1}", clock(S.pick.b)));
      return;
    }
    var s = S.strips[d.name] || (S.strips[d.name] = {}), list = (s.muted || []).concat([[a, b]]).sort(function (x, y) { return x[0] - y[0]; }), merged = [];
    list.forEach(function (r) {                       // HERESY 1542: one that touches another is one: the first's fall, the last's rise
      var last = merged[merged.length - 1], f = fadesOf(r);
      if (last && r[0] <= last[1]) { if (r[1] > last[1]) { last[1] = r[1]; last[3] = f[1]; } }
      else merged.push([r[0], r[1], f[0], f[1]]);
    });
    mark();
    s.muted = merged;
    keep(); draw(d.name); rangesNow(d.name);
    emit("change", { n: d.name, key: "muted" });
  }
  function lanePaintAuto(n) {
    var b = document.querySelector('.mx-lane[data-strip="' + n + '"] [data-mx="auto"]');
    if (b) { b.classList.toggle("is-on", !!S.autoShow[n]); b.setAttribute("aria-pressed", !!S.autoShow[n]); b.classList.toggle("has-auto", hasAuto(n)); }
    var bp = document.querySelector('.mx-lane[data-strip="' + n + '"] [data-mx="autop"]');   // HERESY 1559
    if (bp) { bp.hidden = !S.autoShow[n]; bp.textContent = tr(AUTO_P[autoParam(n)].short); bp.classList.toggle("has-auto", autoParam(n) === "volume" ? strip(n).auto.length > 0 : rawPts(n, autoParam(n)).length > 0); }
  }
  function onMenu(e) {
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
      if (!a.hit) return;
      mark();
      var gone = rawPts(a.n, a.prm), at2 = gone.indexOf(a.hit);   // HERESY 1559: from the knob in hand's list
      if (at2 >= 0) gone.splice(at2, 1);
      keep(); draw(a.n); autoSchedule(a.n); lanePaintAuto(a.n);
      emit("change", { n: a.n, key: "auto" });
      return;
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
    if (!s || !s.muted) return;
    var left = s.muted.filter(function (r) { return !(r[0] <= t && t <= r[1]); });
    if (left.length === s.muted.length) return;
    e.preventDefault();
    mark();                                           // HERESY 1531: the silence given back, undoable
    s.muted = left;
    keep(); draw(n); rangesNow(n);
    emit("change", { n: n, key: "muted" });
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
        say(tr("Mixed") + ": " + (l.integrated_lufs != null ? l.integrated_lufs + " LUFS, " : "") + (l.true_peak_dbtp != null ? l.true_peak_dbtp + " dBTP" : "") + (made.lowered_db ? " · " + tr("lowered") + " " + made.lowered_db + " dB" : "") +
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
    body.addEventListener("pointermove", onMove);
    body.addEventListener("pointerup", onUp);
    body.addEventListener("pointerup", function () { S.gesture = false; });   // HERESY 1531: a fader's drag ends its undo
    body.addEventListener("contextmenu", onMenu);
    body.addEventListener("wheel", onWheel, { passive: false });   // HERESY 1501: Ctrl+wheel zooms (not the page), Shift+wheel goes along
    // HERESY 1511 (Viktor 16.10.2026: «строки бегают по движению мышки»): no lane grows under the pointer any more; every wave is whole
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
    state: function () { var g = S.graph; return { take: S.take && S.take.name, set: S.set, sets: S.sets.length, strips: names(), playing: S.playing, at: pos(), srcs: S.srcs.length, versions: S.versions, busy: S.busy,
      zoom: S.view.zoom, t0: S.view.t0, loop: S.loop, loopOn: S.loopOn, focus: S.focus, meters: Object.assign({}, S.meters),   // HERESY 1501
      peaks: Object.keys(S.peaks).length, ctx: S.ctx ? S.ctx.state : "",
      graph: g ? { kind: g.eng.kind, on: !!g.on, lanes: Object.keys(g.lanes).length, room: !!g.rv.conv, latency: latency(g), master: !!g.mOn } : null,   // HERESY 1531; 1544: master
      levels: Object.keys(S.lv).length, loud: S.loud ? { m: S.loud.m, s: S.loud.s, i: S.loud.i, tp: S.loud.tp } : null, undo: S.undo.length, redo: S.redo.length, ab: S.ab.cur,
      dock: S.dock, print: S.print, auto: Object.keys(S.autoShow).filter(function (k2) { return S.autoShow[k2]; }), mon: Object.assign({}, S.mon) }; },
    // HERESY 1531: the console's way in (heresy-console.js)
    k: { S: S, names: names, strip: strip, set: setStrip, setBus: setBus, mark: mark, on: on, select: select, setVersion: setVersion, versionOf: versionOf, refresh: refreshVersions,   // 1561
         mixes: { list: function () { return S.named; }, lab: function () { return S.lab; }, saveAs: saveAs, load: loadNamed, del: delNamed },   // HERESY 1533
         monitor: function (k2, on) { if (k2) { S.mon[k2] = on == null ? !S.mon[k2] : !!on; applyMon(S.graph); emit("change", { bus: "monitor" }); } return S.mon; },   // HERESY 1536
         groups: function () { return S.buses.groups || []; }, groupSet: groupSet, groupAdd: groupAdd, groupDel: groupDel, vcaDb: vcaDb,   // HERESY 1543
         subs: function () { return S.buses.subs || []; }, subAdd: subAdd, subSet: subSet, subDel: subDel, subOfStrip: subOfStrip,   // HERESY 1563
         audible: audible, hue: hueOf, fmtDb: fmtDb, taper: taper, untaper: untaper, analyser: analyser, play: play, stop: stop, pos: pos,
         lufs: lufs, resetLoud: function () { S.loud = loudReset(); Object.keys(S.lv).forEach(function (k2) { S.lv[k2].max = -150; S.lv[k2].clip = false; }); emit("frame"); },
         info: function () { return S.info; }, title: function (n) { var st = S.info && S.info.strips.filter(function (x) { return x.name === n; })[0]; return st ? st.title : tr("Rest"); } } };
})();
