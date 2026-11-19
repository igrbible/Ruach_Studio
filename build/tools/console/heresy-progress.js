// HERESY 1549 (Viktor 18.10.2026: «Порогресс бары повсюду прикрути где только возможно. Сделай как в Художнике… снизу прямо над
// плеером отцентрованно, примерно 800px шириной полосу»): what the lab is doing now, in every room, a bar each, centred above the
// player: a training run and the listener by their steps, a job of the Refiner by its time against what it is expected to take (the
// lab counts both, so the page's clock does not matter), a job that says nothing of its length striped, its time running. The
// Artist's own runs keep their bar in its room and are left out there.
(function () {
  "use strict";
  var P = { rows: [], at: 0, hid: {} };
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
  // HERESY 2723 (the resource audit of 18.11.2026, R1d: both strips built whole every second while anything ran, and a training runs for days, 23 to
  // 45 ms a tick, a hidden tab too): a hidden tab paints nothing and paints at once when seen again; the boxes are measured before anything is
  // written; a word, a mark or a width is written only when it changed (in this page a text written again, the same or not, costs a style pass of 5
  // to 9 ms); a strip's rows are built anew only when they are other rows, between that only their words and their bars move
  function put(el, text) { if (el && el.textContent !== text) el.textContent = text; }
  function shown(el, on) { if (el && el.hidden === on) el.hidden = !on; }
  function width(row, pct) { var i = row && row.querySelector(".js-bar i"), w = (pct == null ? 100 : Math.round(pct * 100)) + "%"; if (i && i.style.width !== w) i.style.width = w; }
  function lang() { return window.RuachI18n && window.RuachI18n.lang ? window.RuachI18n.lang() : ""; }
  function proc(g) { return window.HeresyProc ? window.HeresyProc.short(g) : "GPU " + g; }   // HERESY 2733: GPU0, XPU0, GPU0+1+2
  function rowsInto(el, key, build, move) {
    if (el._rows === key && el.firstChild) { move(); return; }
    el._rows = key; el.innerHTML = build();
  }
  function empty(el) { if (el.firstChild) { el.innerHTML = ""; el._rows = ""; } }
  function paintTrain(list, since, d) {
    var el = trainStrip(), dock = $("logDock"), eng = $("view-engine");
    // HERESY 1862: the log folded to a chip carries the training: its percent and a thin line along its foot; the bar itself waits for the unfold
    var chipped = !!(dock && dock.classList.contains("is-chip")), cp = $("logDockChipPct"), t0 = list[0], tp = t0 && t0.steps ? Math.min(1, (t0.step || 0) / t0.steps) : null;
    if (dock) { dock.classList.toggle("has-train", !!list.length); dock.style.setProperty("--chip-train", tp != null ? (tp * 100).toFixed(1) + "%" : "0%"); }
    if (cp) { shown(cp, chipped && tp != null); put(cp, tp != null ? Math.round(tp * 100) + "%" : ""); }
    // HERESY 2522 (the UIX audit 13.11.2026, №2: the training's card over the rooms' fields): the log folded (a chip or not) is the player's button;
    // the training is the system bar's job and that button's percent then, and its card stands only over the log unfolded
    var pb = $("pbLog"), pp = $("pbLogPct"), shut = chipped || !!(dock && dock.classList.contains("is-folded"));
    if (pb) { pb.classList.toggle("has-train", !!list.length && tp != null); pb.style.setProperty("--pb-train", tp != null ? (tp * 100).toFixed(1) + "%" : "0%"); }
    if (pp) { shown(pp, tp != null); put(pp, tp != null ? Math.round(tp * 100) + "%" : ""); }
    if (shut) { shown(el, false); roomFor(null); return; }
    if (!list.length) { shown(el, false); empty(el); roomFor(null); return; }
    // HERESY 1630 (Viktor 20.10.2026: «При открытом Engine прогресс бары Тренера поверх идут и не скрываются»): Engine has the log and the cards of its own
    if (eng && !eng.classList.contains("is-hidden")) { shown(el, false); roomFor(null); return; }
    // the dock is fixed: no offsetParent, its box (measured before this paint wrote anything) says whether it stands
    if (d && d.width && d.height) { el.style.left = Math.round(d.left) + "px"; el.style.right = "auto"; el.style.width = Math.round(d.width) + "px"; el.style.bottom = Math.round(window.innerHeight - d.top + 6) + "px"; }
    else { el.style.left = "auto"; el.style.right = "16px"; el.style.width = "min(420px, calc(100vw - 32px))"; el.style.bottom = "120px"; }
    shown(el, true);
    var says = list.map(function (r) {
      var pct = r.steps ? Math.min(1, (r.step || 0) / r.steps) : null, left = r.eta != null ? Math.max(0, r.eta - since) : null;
      return [pct, (r.steps ? tr("step {0} of {1}").replace("{0}", r.step || 0).replace("{1}", r.steps) : "") + (pct != null ? " · " + Math.round(pct * 100) + "%" : "") +
        (left != null ? " · " + tr("about {0} left").replace("{0}", clock(left)) : "")];
    });
    rowsInto(el, lang() + "|" + list.map(function (r) { return r.name + "\u0001" + r.gpu; }).join("\u0002"), function () {
      return list.map(function (r, k) {
        return '<div class="js-row ts-row"><div class="js-head"><b>' + esc(tr("LoRA training")) + '</b><span class="js-name" translate="no">' + esc(r.name) + "</span>" +
          (r.gpu != null ? '<span class="js-gpu mono">' + esc(proc(r.gpu)) + "</span>" : "") + "</div>" +
          '<span class="ar-progress-bar js-bar"><i style="width:' + (says[k][0] == null ? 100 : Math.round(says[k][0] * 100)) + '%"></i></span>' +
          '<span class="ts-say mono">' + esc(says[k][1]) + "</span></div>";   // the step and the time under the bar: the name keeps its room
      }).join("");
    }, function () {
      Array.prototype.forEach.call(el.children, function (row, k) { if (says[k]) { put(row.querySelector(".ts-say"), says[k][1]); width(row, says[k][0]); } });
    });
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
    if (document.hidden) return;                                // HERESY 2723: nothing for a hidden tab; seen again, painted at once (below)
    var el = strip(), since = (Date.now() - P.at) / 1000, art = artRoom(), dock = $("logDock"), bar = $("playbar");
    var d = dock ? dock.getBoundingClientRect() : null, br = bar ? bar.getBoundingClientRect() : null;   // 2723: measured before anything is written
    var rows = P.rows.filter(function (r) { return !(art && /^(art|artist)\b/.test(r.key || "")); });
    paintTrain(rows.filter(function (r) { return /^train:/.test(r.key || ""); }), since, d);   // HERESY 1617: over the Server log
    rows = rows.filter(function (r) { return !/^train:/.test(r.key || ""); });
    el.style.bottom = ((br && br.height ? Math.max(0, window.innerHeight - br.top) : 0) + 10) + "px";   // the player is fixed, so no offsetParent: its box says where it stands
    if (!rows.length) { shown(el, false); empty(el); return; }
    shown(el, true);
    var fo = folded(), fold = '<button type="button" class="js-fold" aria-expanded="' + !fo + '" data-tip="' + esc(tr(fo ? "Unfold the jobs\' strip" : "Fold the jobs\' strip")) + '">' + (fo ? "▴" : "▾") + "</button>";
    el.classList.toggle("is-folded", fo);
    var list = rows.slice(0, fo ? 1 : 4);
    var says = list.map(function (r) {
      var pct = null, say = "";
      if (r.status !== "running") say = tr("waiting");
      else if (r.steps) { pct = Math.min(1, (r.step || 0) / r.steps); say = tr("step {0} of {1}").replace("{0}", r.step || 0).replace("{1}", r.steps); }
      else if (r.expect) {
        var el2 = (r.elapsed || 0) + since;
        pct = Math.min(0.97, el2 / r.expect);
        say = clock(el2) + (el2 < r.expect ? " · " + tr("about {0} left").replace("{0}", clock(r.expect - el2)) : " · " + tr("longer than usual"));
      } else if (r.elapsed != null) say = clock(r.elapsed + since);
      return [pct, say + (pct != null ? " · " + Math.round(pct * 100) + "%" : "")];
    });
    var key = fo + "|" + lang() + "|" + rows.length + "|" + list.map(function (r, k) { return [r.key, r.what, r.label, r.name, r.gpu, r.status, says[k][0] == null].join("\u0001"); }).join("\u0002");
    rowsInto(el, key, function () {
      return fold + list.map(function (r, k) {
        var what = String(r.what || "").split(" · ").map(tr).join(" · ") + (r.label ? " · " + r.label : ""), pct = says[k][0];
        return '<div class="js-row' + (pct == null ? " is-open" : "") + (r.status !== "running" ? " is-waiting" : "") + '">' +
          '<div class="js-head"><b>' + esc(what) + '</b><span class="js-name" translate="no">' + esc(title(r.name)) + "</span>" +
          (r.gpu != null && r.gpu !== "cpu" ? '<span class="js-gpu mono">' + esc(proc(r.gpu)) + "</span>" : "") +
          '<span class="js-time mono">' + esc(says[k][1]) + "</span></div>" +
          '<span class="ar-progress-bar js-bar"><i style="width:' + (pct == null ? 100 : Math.round(pct * 100)) + '%"></i></span></div>';
      }).join("") + (!fo && rows.length > 4 ? '<div class="js-more row-hint">' + esc(tr("and {0} more").replace("{0}", rows.length - 4)) + "</div>" : "") +
        (fo && rows.length > 1 ? '<span class="js-also">' + esc(tr("and {0} more").replace("{0}", rows.length - 1)) + "</span>" : "");
    }, function () {
      Array.prototype.forEach.call(el.querySelectorAll(".js-row"), function (row, k) { if (says[k]) { put(row.querySelector(".js-time"), says[k][1]); width(row, says[k][0]); } });
    });
  }
  window.addEventListener("heresy-activity", function (e) {
    P.rows = ((e.detail && e.detail.running) || []).slice();
    P.at = Date.now();
    paint();
  });
  // the seconds run on between the lab's answers; HERESY 2721/2723: by the page's mode, every second awake, every 15 s seen but untouched (idle_ui),
  // nothing hidden, and at once when it wakes
  var tickStrips = function () { if (P.rows.length) paint(); };
  if (window.HeresyIdle) window.HeresyIdle.every(1000, tickStrips, { idle: 15000 }); else setInterval(tickStrips, 1000);
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
})();
