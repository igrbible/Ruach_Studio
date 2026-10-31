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
    if (!el) {
      el = document.createElement("div"); el.id = "jobStrip"; el.className = "job-strip"; el.setAttribute("aria-live", "polite"); el.hidden = true; document.body.appendChild(el);
      el.addEventListener("click", function (e) { if (e.target.closest(".js-fold")) { foldKeep(!folded()); paint(); } });   // HERESY 1569
    }
    return el;
  }
  // HERESY 1569 (Viktor 19.10.2026, his picture of the canvas under the strip): the strip folds to one thin line, kept so in this browser
  var FOLD = "yue2.jobStripFold";
  function folded() { try { return localStorage.getItem(FOLD) === "1"; } catch (e) { return false; } }
  function foldKeep(on) { try { localStorage.setItem(FOLD, on ? "1" : ""); } catch (e) { /* private mode */ } }
  function artRoom() { var v = document.getElementById("view-artist"); return !!v && !v.classList.contains("is-hidden") && v.offsetParent !== null; }
  // HERESY 1617 (Viktor 20.10.2026: «LoRA training progress bar сделай уже и размести прямо над свёрнутым Server Log фреймом»): the
  // training runs in a bar of their own over the Server log, wherever it stands; a run a line; a click opens the Trainer
  function trainStrip() {
    var el = $("trainStrip");
    if (!el) {
      el = document.createElement("div"); el.id = "trainStrip"; el.className = "train-strip"; el.setAttribute("aria-live", "polite"); el.hidden = true;
      el.dataset.tip = "LoRA training now: a click opens the Trainer";
      document.body.appendChild(el);
      el.addEventListener("click", function () { var t = document.querySelector('.topbar [data-tab="train"]'); if (t) t.click(); });
    }
    return el;
  }
  function paintTrain(list, since) {
    var el = trainStrip(), dock = $("logDock"), eng = $("view-engine");
    // HERESY 1862: the log folded to a chip carries the training: its percent and a thin line along its foot; the bar itself waits for the unfold
    var chipped = !!(dock && dock.classList.contains("is-chip")), cp = $("logDockChipPct"), t0 = list[0], tp = t0 && t0.steps ? Math.min(1, (t0.step || 0) / t0.steps) : null;
    if (dock) { dock.classList.toggle("has-train", !!list.length); dock.style.setProperty("--chip-train", tp != null ? (tp * 100).toFixed(1) + "%" : "0%"); }
    if (cp) { cp.hidden = !chipped || tp == null; cp.textContent = tp != null ? Math.round(tp * 100) + "%" : ""; }
    if (chipped) { el.hidden = true; roomFor(null); return; }
    if (!list.length) { el.hidden = true; el.innerHTML = ""; roomFor(null); return; }
    // HERESY 1630 (Viktor 20.10.2026: «При открытом Engine прогресс бары Тренера поверх идут и не скрываются»): Engine has the log and the cards of its own
    if (eng && !eng.classList.contains("is-hidden")) { el.hidden = true; roomFor(null); return; }
    var d = dock ? dock.getBoundingClientRect() : null;   // fixed: no offsetParent, its box says whether it stands
    if (d && d.width && d.height) { el.style.left = Math.round(d.left) + "px"; el.style.right = "auto"; el.style.width = Math.round(d.width) + "px"; el.style.bottom = Math.round(window.innerHeight - d.top + 6) + "px"; }
    else { el.style.left = "auto"; el.style.right = "16px"; el.style.width = "min(420px, calc(100vw - 32px))"; el.style.bottom = "120px"; }
    el.hidden = false;
    el.innerHTML = list.map(function (r) {
      var pct = r.steps ? Math.min(1, (r.step || 0) / r.steps) : null, left = r.eta != null ? Math.max(0, r.eta - since) : null;
      var say = (r.steps ? tr("step {0} of {1}").replace("{0}", r.step || 0).replace("{1}", r.steps) : "") + (pct != null ? " · " + Math.round(pct * 100) + "%" : "") +
        (left != null ? " · " + tr("about {0} left").replace("{0}", clock(left)) : "");
      return '<div class="js-row ts-row"><div class="js-head"><b>' + esc(tr("LoRA training")) + '</b><span class="js-name" translate="no">' + esc(r.name) + "</span>" +
        (r.gpu != null ? '<span class="js-gpu mono">GPU ' + esc(r.gpu) + "</span>" : "") + "</div>" +
        '<span class="ar-progress-bar js-bar"><i style="width:' + (pct == null ? 100 : Math.round(pct * 100)) + '%"></i></span>' +
        '<span class="ts-say mono">' + esc(say) + "</span></div>";   // the step and the time under the bar: the name keeps its room
    }).join("");
    roomFor(el);
  }
  // HERESY 1652: the bars' height as room on the page (--train-strip-room): under the takes and the runs, and above the Artist's Paint
  function roomFor(el) {
    var h = el && !el.hidden ? Math.ceil(el.getBoundingClientRect().height) + 6 : 0;
    if (document.body.style.getPropertyValue("--train-strip-room") !== h + "px") document.body.style.setProperty("--train-strip-room", h + "px");
    document.body.classList.toggle("has-train-strip", h > 0);   // HERESY 1653: the columns' spacer, only while the bars stand
  }
  window.HeresyTrainStrip = { paint: function () { paint(); }, el: trainStrip };
  function paint() {
    var el = strip(), since = (Date.now() - P.at) / 1000, art = artRoom();
    var rows = P.rows.filter(function (r) { return !(art && /^(art|artist)\b/.test(r.key || "")); });
    paintTrain(rows.filter(function (r) { return /^train:/.test(r.key || ""); }), since);   // HERESY 1617: over the Server log
    rows = rows.filter(function (r) { return !/^train:/.test(r.key || ""); });
    var bar = $("playbar");
    var br = bar ? bar.getBoundingClientRect() : null;   // fixed, so no offsetParent: its box says where it stands
    el.style.bottom = ((br && br.height ? Math.max(0, window.innerHeight - br.top) : 0) + 10) + "px";
    if (!rows.length) { el.hidden = true; el.innerHTML = ""; return; }
    el.hidden = false;
    var fo = folded(), fold = '<button type="button" class="js-fold" aria-expanded="' + !fo + '" data-tip="' + esc(tr(fo ? "Unfold the jobs\' strip" : "Fold the jobs\' strip")) + '">' + (fo ? "\u25b4" : "\u25be") + "</button>";
    el.classList.toggle("is-folded", fo);
    var shown = rows.slice(0, fo ? 1 : 4);
    el.innerHTML = fold + shown.map(function (r) {
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
    }).join("") + (!fo && rows.length > 4 ? '<div class="js-more row-hint">' + esc(tr("and {0} more").replace("{0}", rows.length - 4)) + "</div>" : "") +
      (fo && rows.length > 1 ? '<span class="js-also">' + esc(tr("and {0} more").replace("{0}", rows.length - 1)) + "</span>" : "");
  }
  window.addEventListener("heresy-activity", function (e) {
    P.rows = ((e.detail && e.detail.running) || []).slice();
    P.at = Date.now();
    paint();
    clearInterval(P.timer);
    if (P.rows.length) P.timer = setInterval(paint, 1000);        // the seconds run on between the lab's answers
  });
  // HERESY 1588 (Viktor 19.10.2026: «Прогресс бар закрывает кнопки синтеза в Творце. Давай при наведении указателя мыши в область этих
  // кнопок и движков временно растворять этот оверлей прогресса»): the strip takes no click but its fold button, so what lies under it
  // always worked, only unseen; a control under the pointer there (a button, a slider, a box, a chip) dissolves the strip until the
  // pointer leaves it
  var UNDER = "button, input, select, textarea, a[href], label, summary, [role=slider], [role=button], [role=tab], .chip";
  document.addEventListener("pointermove", function (e) {
    var el = document.getElementById("jobStrip");
    if (!el || el.hidden) return;
    var r = el.getBoundingClientRect(), m = 12, thin = false;
    if (e.clientX >= r.left - m && e.clientX <= r.right + m && e.clientY >= r.top - m && e.clientY <= r.bottom + m) {
      if (el.classList.contains("is-thin")) thin = true;
      else { var u = document.elementFromPoint(e.clientX, e.clientY); thin = !!u && !el.contains(u) && !!u.closest(UNDER); }
    }
    if (thin !== el.classList.contains("is-thin")) el.classList.toggle("is-thin", thin);
  }, { passive: true });
  window.HeresyProgress = { paint: paint, rows: function () { return P.rows.slice(); } };
})();
