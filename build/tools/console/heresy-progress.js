// HERESY 1549 (Viktor 18.10.2026: «Порогресс бары повсюду прикрути где только возможно. Сделай как в Художнике… снизу прямо над
// плеером отцентрованно, примерно 800px шириной полосу»): what the lab is doing now, in every room, a bar each, centred above the
// player: a training run and the listener by their steps, a job of the Refiner by its time against what it is expected to take (the
// lab counts both, so the page's clock does not matter), a job that says nothing of its length striped, its time running. The
// Artist's own runs keep their bar in its room and are left out there.
(function () {
  "use strict";
  var P = { rows: [], at: 0, timer: 0, hid: {} };
  function $(id) { return document.getElementById(id); }
  function tr(s) { return window.RuachI18n ? window.RuachI18n.t(s) : s; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function clock(s) { s = Math.max(0, Math.round(s)); return s >= 3600 ? Math.floor(s / 3600) + ":" + ("0" + Math.floor(s % 3600 / 60)).slice(-2) + ":" + ("0" + s % 60).slice(-2) : Math.floor(s / 60) + ":" + ("0" + s % 60).slice(-2); }
  function title(name) { return String(name || "").replace(/^\d{8}-\d{6}-(\d+-)?/, ""); }
  function strip() {
    var el = $("jobStrip");
    if (!el) { el = document.createElement("div"); el.id = "jobStrip"; el.className = "job-strip"; el.setAttribute("aria-live", "polite"); el.hidden = true; document.body.appendChild(el); }
    return el;
  }
  function artRoom() { var v = document.getElementById("view-artist"); return !!v && !v.classList.contains("is-hidden") && v.offsetParent !== null; }
  function paint() {
    var el = strip(), since = (Date.now() - P.at) / 1000, art = artRoom();
    var rows = P.rows.filter(function (r) { return !(art && /^(art|artist)\b/.test(r.key || "")); });
    var bar = $("playbar");
    var br = bar ? bar.getBoundingClientRect() : null;   // fixed, so no offsetParent: its box says where it stands
    el.style.bottom = ((br && br.height ? Math.max(0, window.innerHeight - br.top) : 0) + 10) + "px";
    if (!rows.length) { el.hidden = true; el.innerHTML = ""; return; }
    el.hidden = false;
    var shown = rows.slice(0, 4);
    el.innerHTML = shown.map(function (r) {
      var pct = null, say = "";
      if (r.status !== "running") say = tr("waiting");
      else if (r.steps) { pct = Math.min(1, (r.step || 0) / r.steps); say = tr("step {0} of {1}").replace("{0}", r.step || 0).replace("{1}", r.steps); }
      else if (r.expect) {
        var el2 = (r.elapsed || 0) + since;
        pct = Math.min(0.97, el2 / r.expect);
        say = clock(el2) + (el2 < r.expect ? " · " + tr("about {0} left").replace("{0}", clock(r.expect - el2)) : " · " + tr("longer than usual"));
      } else if (r.elapsed != null) say = clock(r.elapsed + since);
      var what = String(r.what || "").split(" · ").map(tr).join(" · ") + (r.label ? " · " + r.label : "");
      return '<div class="js-row' + (pct == null ? " is-open" : "") + (r.status !== "running" ? " is-waiting" : "") + '">' +
        '<div class="js-head"><b>' + esc(what) + '</b><span class="js-name" translate="no">' + esc(title(r.name)) + "</span>" +
        (r.gpu != null && r.gpu !== "cpu" ? '<span class="js-gpu mono">GPU ' + esc(r.gpu) + "</span>" : "") +
        '<span class="js-time mono">' + esc(say) + (pct != null ? " · " + Math.round(pct * 100) + "%" : "") + "</span></div>" +
        '<span class="ar-progress-bar js-bar"><i style="width:' + (pct == null ? 100 : Math.round(pct * 100)) + '%"></i></span></div>';
    }).join("") + (rows.length > 4 ? '<div class="js-more row-hint">' + esc(tr("and {0} more").replace("{0}", rows.length - 4)) + "</div>" : "");
  }
  window.addEventListener("heresy-activity", function (e) {
    P.rows = ((e.detail && e.detail.running) || []).slice();
    P.at = Date.now();
    paint();
    clearInterval(P.timer);
    if (P.rows.length) P.timer = setInterval(paint, 1000);        // the seconds run on between the lab's answers
  });
  window.HeresyProgress = { paint: paint, rows: function () { return P.rows.slice(); } };
})();
