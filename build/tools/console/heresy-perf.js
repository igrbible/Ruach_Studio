// HERESY 1821 (Viktor 28.10.2026: «В Engine акумулятивная метрика по перформансу Студии… Время взаимодействия юзера со Студией, скорости генераций,
// используемые дисковые и процессорные ресурсы»): Engine → Performance, from the lab's user/perf.sqlite (lab/perf.py). The page says once a minute
// that it is with you (it plays, or it is looked at and was handled in the last two minutes); a minute counts once however many pages say it.
(function () {
  "use strict";
  function $(id) { return document.getElementById(id); }
  function tr(s) { return window.RuachI18n ? window.RuachI18n.t(s) : s; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  var SCOPE = new URLSearchParams(location.search).get("scope");
  var lastInput = Date.now();
  ["pointerdown", "keydown", "wheel", "pointermove"].forEach(function (ev) {
    document.addEventListener(ev, function () { lastInput = Date.now(); }, { passive: true, capture: true });
  });
  function beat() {
    if (SCOPE) return;                                 // a test page counts nothing
    var a = $("audio"), playing = !!(a && !a.paused && !a.ended);
    var working = document.visibilityState === "visible" && Date.now() - lastInput < 120000;
    if (!playing && !working) return;
    fetch("/lab/perf/beat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: playing ? "play" : "work" }) }).catch(function () { /* the next minute */ });
  }
  setInterval(beat, 60000);

  function hm(min) {
    min = Math.round(min || 0);
    var h = Math.floor(min / 60), m = min % 60;
    return h ? tr(h + " h " + m + " min") : tr(m + " min");
  }
  function span(min) { return min < 1 ? tr(Math.max(1, Math.round(min * 60)) + " s") : hm(min); }   // under a minute, in seconds
  function gb(b) { return b >= 1e12 ? (b / 1e12).toFixed(2) + " TB" : b >= 1e9 ? (b / 1e9).toFixed(1) + " GB" : Math.round(b / 1e6) + " MB"; }
  function day(d) { var t = new Date(d + "T12:00:00"); return t.toLocaleDateString(window.RuachI18n ? window.RuachI18n.locales() : undefined, { day: "numeric", month: "short" }); }
  function bars(rows, keys, tip) {                     // rows: [label, a, b…]; stacked bars, one a day
    // HERESY 1959 (Viktor 30.10.2026: «бары налеплены один на другой»): from the first day anything was kept (a week at least), not 27 empty days and three
    // bars squeezed at the end
    var first = 0;
    while (first < rows.length && !keys.some(function (k, i) { return (rows[first][i + 1] || 0) > 0; })) first++;
    rows = rows.slice(Math.max(0, Math.min(first, rows.length - 7)));
    var W = 300, H = 56, n = rows.length, max = 1;
    rows.forEach(function (r) { var s = 0; keys.forEach(function (k, i) { s += r[i + 1] || 0; }); max = Math.max(max, s); });
    var w = W / n, out = "";
    rows.forEach(function (r, j) {
      var y = H;
      keys.forEach(function (k, i) {
        var h = (r[i + 1] || 0) / max * (H - 4);
        // HERESY 1959: the listening share was class "play", and the play button's .play { width: 44px; height: 44px } took the rect (CSS geometry wins
        // over the attributes): 44-unit grey slabs laid over the next days. Now "listen"
        var bw = Math.max(1, Math.min(w * 0.62, w - 1.5, 9));   // HERESY 1959: a bar narrower than its day, apart from the next, and a bar, not a slab, over a short week
        if (h > 0) { y -= h; out += '<rect class="' + k + '" x="' + (j * w + (w - bw) / 2).toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) + '"/>'; }
      });
      out += '<rect class="hit" x="' + (j * w).toFixed(1) + '" y="0" width="' + w.toFixed(1) + '" height="' + H + '" data-tip="' + esc(tip(r)) + '"/>';
    });
    return '<svg class="perf-bars" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none">' + out + "</svg>";
  }
  function spark(rows, key, unit) {
    var pts = rows.filter(function (r) { return r[key] != null; });
    if (pts.length < 2) return (pts.length ? '<span class="mono perf-num">' + Math.round(pts[0][key]) + unit + "</span> " : "") + '<span class="perf-none">' + esc(tr("measured once a minute from now on")) + "</span>";
    var W = 300, H = 40, t0 = pts[0].hour, t1 = pts[pts.length - 1].hour || t0 + 1;
    var d = pts.map(function (r, i) { return (i ? "L" : "M") + (W * (r.hour - t0) / Math.max(1, t1 - t0)).toFixed(1) + " " + (H - 2 - (H - 4) * Math.min(100, r[key]) / 100).toFixed(1); }).join(" ");
    var avg = pts.reduce(function (s, r) { return s + r[key]; }, 0) / pts.length;
    return '<svg class="perf-spark" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none"><path d="' + d + '"/></svg>' +
      '<span class="mono perf-num">' + Math.round(pts[pts.length - 1][key]) + unit + ' <em>· ' + esc(tr("average")) + " " + Math.round(avg) + unit + "</em></span>";
  }
  function stat(label, value, sub) {
    return '<div class="perf-stat"><span class="label">' + esc(tr(label)) + '</span><b>' + esc(value) + "</b>" + (sub ? "<em>" + esc(sub) + "</em>" : "") + "</div>";
  }
  function paint(d) {
    var t = d.time || {}, k = d.takes || {};
    var play = function (p) { return p && p[1] ? tr("of it listening {0}").replace("{0}", hm(p[1])) : ""; };
    $("perfTime").innerHTML = '<div class="perf-stats">' +
      stat("Today", hm((t.today || [0])[0]), play(t.today)) + stat("7 days", hm((t.week || [0])[0]), play(t.week)) +
      stat("30 days", hm((t.month || [0])[0]), play(t.month)) +
      stat("In all", hm((t.all || [0])[0]), t.since ? tr("since {0}").replace("{0}", new Date(t.since * 1000).toLocaleDateString(window.RuachI18n ? window.RuachI18n.locales() : undefined)) : "") + "</div>" +
      bars((t.days || []).map(function (r) { return [r[0], r[1], r[2]]; }), ["work", "listen"], function (r) { return day(r[0]) + " · " + hm(r[1] + r[2]) + (r[2] ? " · " + tr("of it listening {0}").replace("{0}", hm(r[2])) : ""); });
    var rtf = k.rtf_month, st = k.stages || {}, sum = (st.score || 0) + (st.music || 0) + (st.sound || 0) || 1;
    $("perfTakes").innerHTML = '<div class="perf-stats">' +
      stat("Today", String(k.today || 0)) + stat("7 days", String(k.week || 0)) + stat("30 days", String(k.month || 0), hm((k.audio_month || 0) / 60) + " " + tr("of song")) +
      stat("In all", String(k.all || 0), hm((k.audio_all || 0) / 60) + " " + tr("of song")) + "</div>" +
      (rtf ? '<p class="perf-line">' + esc(tr("A minute of song in {0}, the median of 30 days").replace("{0}", span(1 / rtf))) + "</p>" : "") +
      '<div class="perf-split" data-tip="' + esc(tr("Where the 30 days' time went: the score, the music half, the sound half")) + '">' +
        ["score", "music", "sound"].map(function (s) { return '<i class="' + s + '" style="flex:' + (st[s] || 0) / sum + '"></i>'; }).join("") + "</div>" +
      '<div class="perf-keys"><span class="score">' + esc(tr("the score")) + " " + Math.round(100 * (st.score || 0) / sum) + ' %</span><span class="music">' + esc(tr("the music")) + " " +
        Math.round(100 * (st.music || 0) / sum) + ' %</span><span class="sound">' + esc(tr("the sound")) + " " + Math.round(100 * (st.sound || 0) / sum) + " %</span></div>" +
      ((k.models || []).length ? '<table class="perf-models"><tbody>' + k.models.map(function (m) {
        return '<tr><td class="mono" translate="no">' + esc(m[0]) + "</td><td>" + m[1] + "</td><td>" + (m[2] ? esc(tr("a minute in {0}").replace("{0}", span(1 / m[2]))) : "") + "</td></tr>";
      }).join("") + "</tbody></table>" : "") +
      bars((k.days || []).map(function (r) { return [r[0], r[1]]; }), ["takes"], function (r) { return day(r[0]) + " · " + r[1]; });
    var mc = d.machine || [];
    $("perfMachine").innerHTML = '<div class="perf-row"><span class="label">CPU</span>' + spark(mc, "cpu", " %") + "</div>" +
      '<div class="perf-row"><span class="label">RAM</span>' + spark(mc, "ram", " %") + "</div>" +
      (mc.some(function (r) { return r.gpu != null; }) ? '<div class="perf-row"><span class="label">GPU</span>' + spark(mc, "gpu", " %") + "</div>" +
        '<div class="perf-row"><span class="label">VRAM</span>' + spark(mc, "vram", " %") + "</div>" : "");
    var dk = d.disks;
    $("perfDisks").innerHTML = !dk ? '<span class="perf-none">' + esc(tr(d.measuring ? "measuring…" : "not measured yet")) + "</span>" :
      '<table class="perf-models"><tbody>' + dk.folders.map(function (f) { return '<tr><td class="mono" translate="no">' + esc(f.name) + "/</td><td>" + esc(tr(gb(f.bytes))) + "</td></tr>"; }).join("") + "</tbody></table>" +
      dk.disks.map(function (x) {
        return '<div class="perf-disk"><span class="mono" translate="no">' + esc(x.path) + '</span><span class="perf-used"><i style="width:' + (100 * x.used / Math.max(1, x.total)).toFixed(1) + '%"></i></span>' +
          '<span class="mono">' + esc(tr("{0} free of {1}").replace("{0}", tr(gb(x.free))).replace("{1}", tr(gb(x.total)))) + "</span></div>";
      }).join("");
  }
  function load() {
    if (!$("perfCard")) return;
    fetch("/lab/perf").then(function (r) { return r.ok ? r.json() : null; }).then(function (d) { if (d) paint(d); }).catch(function () { /* the lab is away */ });
  }
  document.addEventListener("click", function (e) {
    if (e.target.closest('#engineTabs [data-etab="perf"]')) setTimeout(load, 0);
    if (e.target.closest("#perfMeasure")) fetch("/lab/perf/measure", { method: "POST" }).then(function () { setTimeout(load, 1500); }).catch(function () { /* later */ });
  });
  setInterval(function () { var c = $("perfCard"); if (c && c.offsetParent) load(); }, 60000);
  if ($("perfCard") && window.MutationObserver) {      // its tab shown (a click, or the Engine opened on it): painted at once
    var seen = new MutationObserver(function () { var c = $("perfCard"); if (!c.classList.contains("is-tab-off") && c.offsetParent) load(); });
    seen.observe($("perfCard"), { attributes: true, attributeFilter: ["class"] });
    // HERESY 1959: after an F5 the Engine opens on the tab it was left on, and the card's own class does not change: the Engine's showing counts too
    if ($("view-engine")) seen.observe($("view-engine"), { attributes: true, attributeFilter: ["class"] });
  }
  window.HeresyPerf = { load: load, beat: beat };
})();
