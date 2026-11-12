// HERESY 2313 (Viktor's plan of 08.11.2026, §2.4: «Сетка тактов и привязка к долям: вырезки, копии, петля»; §2.6: «Резы по битам и секциям — от
// той же сетки тактов, что в DAW»): a take's bar grid on the page, as the lab hears it (lab/bargrid.py: the beats heard in the take's own sound at
// its score's tempo and meter, the bars laid from where its music changes, the score's chords and keys on them). Asked once a take and kept; the
// lines a view shows at its zoom (bars, beats, halves, quarters of a beat); the nearest of them to snap to; a time's bar and beat, and back. The
// DAW draws, snaps and lays an LFO on it; the Videographer can cut on the same grid (the lab's bargrid.grid, or this module on the page).
(function () {
  "use strict";
  var GRIDS = {}, ASKED = {};
  function emit(name) { try { window.dispatchEvent(new CustomEvent("ruach-grid", { detail: { name: name } })); } catch (e) { /* an old browser */ } }
  function answer(r) {
    return r.json().then(function (b) { if (!r.ok) throw new Error(b.error || r.status); return b; }, function () { throw new Error(String(r.status)); });
  }
  // the take's grid, heard on Forge the first time (some seconds: its beats and where its music changes), kept here after
  function load(name, force) {
    if (!name) return Promise.resolve(null);
    if (!force && GRIDS[name]) return Promise.resolve(GRIDS[name]);
    if (!force && ASKED[name]) return ASKED[name];
    var p = fetch("/lab/daw/grid?name=" + encodeURIComponent(name)).then(answer).then(function (g) {
      GRIDS[name] = g; delete ASKED[name]; emit(name); return g;
    }, function (e) { delete ASKED[name]; throw e; });
    ASKED[name] = p;
    return p;
  }
  function get(name) { return GRIDS[name] || null; }
  function waiting(name) { return !!ASKED[name]; }
  // what the hand sets, kept on Forge with the take: {factor: 2 or 0.5, downbeat: a second, num: beats a bar, reset: true}
  function set(name, change) {
    return fetch("/lab/daw/grid", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.assign({ name: name }, change || {})) })
      .then(answer).then(function (g) { GRIDS[name] = g; emit(name); return g; });
  }
  function usable(g) { return !!(g && g.beats && g.beats.length > 1); }
  function lower(a, t) { var lo = 0, hi = a.length; while (lo < hi) { var m = (lo + hi) >> 1; if (a[m] < t) lo = m + 1; else hi = m; } return lo; }
  // the beat index of a time, as a fraction (between two beats, along the line from one to the next; past the ends, at their pace)
  function beatIndex(g, t) {
    var b = g.beats, n = b.length;
    if (t <= b[0]) return (t - b[0]) / Math.max(1e-6, b[1] - b[0]);
    if (t >= b[n - 1]) return n - 1 + (t - b[n - 1]) / Math.max(1e-6, b[n - 1] - b[n - 2]);
    var i = lower(b, t) - 1;
    return i + (t - b[i]) / Math.max(1e-6, b[i + 1] - b[i]);
  }
  function timeOf(g, idx) {
    var b = g.beats, n = b.length;
    if (idx <= 0) return b[0] + (b[1] - b[0]) * idx;
    if (idx >= n - 1) return b[n - 1] + (b[n - 1] - b[n - 2]) * (idx - (n - 1));
    var i = Math.floor(idx);
    return b[i] + (b[i + 1] - b[i]) * (idx - i);
  }
  function beatLen(g) { var b = g.beats; return b.length > 1 ? (b[b.length - 1] - b[0]) / (b.length - 1) : 0.5; }
  // which lines a view this many pixels a second shows: bars always (the numbered every n-th when they crowd), then beats, halves and quarters
  // of a beat as there is room (at least 7 px between two)
  function depth(g, pps) {
    var bl = beatLen(g) * pps;
    return bl / 4 >= 7 ? 4 : bl / 2 >= 7 ? 2 : bl >= 7 ? 1 : 0;
  }
  function lines(g, t0, t1, pps) {
    var out = [];
    if (!usable(g)) return out;
    var bars = g.bars || [], nums = g.bar_numbers || [], bl = (beatLen(g) * (g.num || 4)) * pps, every = 1;
    while (bl * every < 28 && every < 64) every *= 2;
    var isBar = {};
    for (var i = lower(bars, t0 - 1e-6); i < bars.length && bars[i] <= t1 + 1e-6; i++) {
      isBar[bars[i].toFixed(3)] = true;
      out.push({ t: bars[i], kind: "bar", n: nums[i] || i + 1, label: (nums[i] || i + 1) % every === 0 || every === 1 || (nums[i] || i + 1) === 1 });
    }
    var dp = depth(g, pps);
    if (dp) {
      var a = Math.max(0, Math.floor(beatIndex(g, t0))), b = Math.ceil(beatIndex(g, t1));
      for (var k = a; k <= b; k++) {
        for (var s = 0; s < dp; s++) {
          var t = timeOf(g, k + s / dp);
          if (t < t0 - 1e-6 || t > t1 + 1e-6 || t < 0) continue;
          if (s === 0 && isBar[t.toFixed(3)]) continue;
          out.push({ t: t, kind: s === 0 ? "beat" : dp === 4 && s === 2 ? "half" : dp === 2 ? "half" : "quarter" });
        }
      }
    }
    return out.sort(function (x, y) { return x.t - y.t; });
  }
  // the line nearest t within maxPx at this zoom (the finest drawn), or null
  function nearest(g, t, pps, maxPx) {
    if (!usable(g)) return null;
    var dp = depth(g, pps), best = null, bd = (maxPx || 6) / Math.max(1e-6, pps);
    var bars = g.bars || [], j = lower(bars, t);
    [j - 1, j].forEach(function (k) { if (k >= 0 && k < bars.length && Math.abs(bars[k] - t) <= bd) { bd = Math.abs(bars[k] - t); best = bars[k]; } });
    if (dp) {
      var x = beatIndex(g, t) * dp, cands = [Math.floor(x), Math.ceil(x)];
      cands.forEach(function (c) { var tt = timeOf(g, c / dp); if (tt >= 0 && Math.abs(tt - t) < bd) { bd = Math.abs(tt - t); best = tt; } });
    }
    return best == null ? null : Math.round(best * 1000) / 1000;
  }
  // a time's bar (its number) and beat in it (from 1), and the beat's fraction
  function barAt(g, t) {
    if (!usable(g) || !(g.bars || []).length) return null;
    var bars = g.bars, i = Math.max(0, lower(bars, t + 1e-6) - 1), n = (g.bar_numbers || [])[i] || i + 1;
    if (t < bars[0]) return { bar: n - 1, beat: 1, frac: 0 };
    var x = beatIndex(g, t) - beatIndex(g, bars[i]), beat = Math.floor(x + 1e-6);
    return { bar: n, beat: beat + 1, frac: x - beat };
  }
  function chordAt(g, t) {
    var cs = (g && g.chords) || [];
    for (var i = cs.length - 1; i >= 0; i--) if (t >= cs[i][0] - 1e-6) return t < cs[i][1] + 1e-6 ? { t0: cs[i][0], t1: cs[i][1], name: cs[i][2] } : null;
    return null;
  }
  function keyAt(g, t) {
    var ks = (g && g.keys) || [], k = null;
    ks.forEach(function (x) { if (x[0] <= t + 1e-6) k = x[1]; });
    return k || (ks[0] ? ks[0][1] : null);
  }
  window.RuachBars = { load: load, get: get, set: set, waiting: waiting, usable: usable, lines: lines, nearest: nearest, beatIndex: beatIndex, timeOf: timeOf,
                       beatLen: beatLen, barAt: barAt, chordAt: chordAt, keyAt: keyAt };
})();
