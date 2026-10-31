// HERESY 1063 / 1090: the LoRA Trainer, LoRAs for YuE2 from your own songs (lab/training.py does the work: the
// studio's own trainer, lab/trainer, or Ostris' AI-Toolkit as the reference). Viktor, 02.10.2026: on par with the
// other rooms. So:
//   on top     the runs that are training, each a line with its progress, time left and loss
//   a row      1 Material › 2 The set › 3 Train › 4 Telemetry, as Post's steps: one open at a time, each
//              step summed up in its pill, the next one opened when a step is done
//   Telemetry  one run: progress, the numbers, the curves of both halves (what they mean said under them),
//              its epochs: one picked, into loras/ or out of it, or downloaded
//   the column every run a card, as the takes are in the Creator: Active · All · Archived · Trash, searched; a
//              running one lit as a playing take; archive, delete (to the trash, its adapters asked about),
//              restore, delete for good. Folds to a strip on the right.
(function () {
  "use strict";

  var KINDS = {
    style:    { label: "Style", say: "genre, production, a band's sound", o: { rank: 32, epochs: 40, ar_loss_weight: 0.5, ar_kl_weight: 0.2, ar_lr_multiplier: 0.5 } },
    voice:    { label: "Voice", say: "one singer's timbre", o: { rank: 32 /* HERESY 1496 (Viktor: «нужно r32»): r16 did not carry a voice's texture */, epochs: 30, ar_loss_weight: 0.3, ar_kl_weight: 0.3, ar_lr_multiplier: 0.5 } },
    language: { label: "Language", say: "diction of a language; exact lyrics, many voices", o: { rank: 32, epochs: 20, ar_loss_weight: 1.0, ar_kl_weight: 0.1, ar_lr_multiplier: 1.0 } },
    artist:   { label: "Artist", say: "all of it; a large, varied catalogue", o: { rank: 32, epochs: 20, ar_loss_weight: 0.7, ar_kl_weight: 0.2, ar_lr_multiplier: 0.7 } }
  };
  var PANES = ["raw", "set", "train", "run"];
  var state = {
    hooks: null, data: null, trash: [], raw: null, rows: [], kind: "style",
    set: recall("yue2.trSet") || "", pane: recall("yue2.trPane") || "", sel: recall("yue2.trRun") || "", epoch: "", cmp: "",
    filter: recall("yue2.trFilter") || "all", search: "", folded: recall("yue2.trFolded") === "1", timer: 0, first: true,
    st: recall("yue2.trState") || "",              // HERESY 1659: a state the runs are seen by
    stacked: recall("yue2.trStacked") === "1"      // HERESY 1299: the Telemetry's curves one under the other
  };
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function recall(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function keep(k, v) { try { if (v == null || v === "") localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* private window */ } }
  function toast(t, bad) { state.hooks && state.hooks.toast(t, bad ? "bad" : ""); }
  function api(path, body) {
    var opt = body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
    return fetch("/lab" + path, opt).then(function (r) { return r.json().then(function (b) { if (!r.ok && r.status !== 202) throw new Error(b.error || r.status); return b; }); });
  }
  function confirmBox(text, opts) { return window.HeresyDialog.confirm(text, opts); }
  function clock(s) { s = Math.round(s || 0); return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2); }
  function gb(b) { return b >= 1e9 ? (b / 1e9).toFixed(1) + " GB" : Math.round(b / 1e6) + " MB"; }
  function slug(s) { return String(s || "").normalize("NFKD").replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "set"; }
  function span(sec) { sec = Math.round(sec || 0); var h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60); return h ? h + " h " + ("0" + m).slice(-2) + " min" : m + " min"; }
  function ago(t) {
    if (!t) return "";
    var s = Date.now() / 1000 - t;
    return s < 90 ? "just now" : s < 3600 ? Math.round(s / 60) + " min ago" : s < 86400 ? Math.round(s / 3600) + " h ago" : Math.round(s / 86400) + " d ago";
  }
  // HERESY 1165: a tip glued from pieces is translated piece by piece here (the page's translator matches whole texts)
  function tr(s) { return window.RuachI18n ? window.RuachI18n.t(s) : s; }
  function when(t) { var d = new Date((t || 0) * 1000); return t ? d.toLocaleDateString(window.RuachI18n ? window.RuachI18n.locales() : undefined) + " " + d.toTimeString().slice(0, 5) : ""; }   // 1165, 1166
  function runs() { return (state.data && state.data.runs) || []; }
  function runOf(name) { return runs().filter(function (r) { return r.name === name; })[0] || null; }
  function isLive(r) { return r && (r.status === "running" || r.status === "stopping" || r.status === "pausing"); }   // HERESY 1659: pausing too
  function stateOf(r) { return isLive(r) ? "running" : r.status; }
  function engineOf(r) { return ((r && r.options) || {}).engine === "ruach" ? "ruach" : "ai-toolkit"; }
  function epochs(r) { return r.tracks ? (r.steps || 0) / r.tracks : 0; }

  // ------------------------------------------------------------------ loading
  function load() {
    return Promise.all([api("/train/datasets"), api("/train/trash").catch(function () { return { trash: [] }; })]).then(function (d) {
      state.data = d[0]; state.trash = d[1].trash || [];
      if (state.first) {                       // the first look: a training run comes to the front
        state.first = false;
        var live = runs().filter(isLive)[0];
        if (live && (!state.sel || !runOf(state.sel))) state.sel = live.name;
        if (!state.pane) state.pane = live ? "run" : "raw";
      }
      if (state.sel && !runOf(state.sel)) state.sel = "";
      paint();
    }).catch(function (e) {
      $("trWarn").innerHTML = '<p class="tr-warn">The lab does not answer: ' + esc(e.message) + "</p>";
    }).then(schedule);
  }
  // while the room is open: every 5 s when something trains, else every 30 s; nothing when another room is open
  function schedule() {
    clearTimeout(state.timer);
    if (document.body.dataset.tab !== "train") return;
    state.timer = setTimeout(function () {
      if (document.hidden || document.body.dataset.tab !== "train") return schedule();
      var wasLive = runs().filter(isLive).map(function (r) { return r.name; });   // HERESY 1275: a run that ends while the room looks on
      Promise.all([api("/train/datasets"), api("/train/trash").catch(function () { return { trash: state.trash }; })]).then(function (d) {
        state.data = d[0]; state.trash = d[1].trash || [];
        wasLive.forEach(function (name) {
          var r = runOf(name);
          if (!r || isLive(r) || (r.status !== "done" && r.status !== "failed")) return;   // stopped by hand: nothing to say
          toast(r.status === "done" ? "Training " + name + " is done" : "Training " + name + " failed" + (r.error ? ": " + r.error : ""), r.status !== "done");
          if (window.RuachChime) window.RuachChime.ring(r.status === "done");
        });
        paintLive(); paintList(); paintPills(); gate();
        if (state.pane === "run") paintRun();
      }).catch(function () { /* the next tick tries again */ }).then(schedule);
    }, runs().some(isLive) ? 5000 : 30000);
  }

  window.addEventListener("ruach-lang", function () { if (state.data) paint(); });   // HERESY 1165: its tips in the new language
  function paint() {
    warn(); paintRaw(); paintSets(); paintLive(); paintList(); paintPills(); gate(); listenPanel();
    showPane(state.pane || "raw", true);
  }

  // ------------------------------------------------------------------ the steps in a row
  function showPane(p, quiet) {
    if (PANES.indexOf(p) < 0) p = "raw";
    if (p === "run" && !state.sel) { var any = runs()[0]; if (any) state.sel = any.name; }
    state.pane = p; keep("yue2.trPane", p);
    Array.prototype.forEach.call(document.querySelectorAll("#view-train .tr-pane"), function (el) { el.classList.toggle("is-on", el.dataset.pane === p); });
    paintPills();
    if (p === "run") paintRun();
    if (!quiet) { var el = document.querySelector('#view-train .tr-pane[data-pane="' + p + '"]'); if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
  }
  // HERESY 1101: what a rank costs, measured on YuE2's shapes (224 matrices, 2048 wide; 1.41 B weights a half);
  // said whenever the pills are, so a kind's preset is said too, not only a typed rank
  function rankSay() {
    // HERESY 1300 (Viktor 10.10.2026: «В тренере смотри на RANK - подсказка под полем инлайн»): the tip's first line, not a line under it
    var r = parseFloat($("tr_rank").value) || 0, el = $("tr_rank");
    if (r) el.dataset.tipHead = (r * 1.04 / 16).toFixed(r < 32 ? 1 : 0) + " % of what it adapts · " + Math.round(r * 1.835) + " MB a half" + (r > 64 ? " · for large many-voice sets" : "");
    else delete el.dataset.tipHead;
  }
  // HERESY 1410: the epochs asked, the steps worked out from the set picked (batch 1: a step a track)
  function setTracks() { var d = state.data || {}; return ((d.prepared || []).filter(function (p) { return p.name === state.set; })[0] || {}).tracks || 0; }
  function stepsSay() {
    var el = $("trStepsSay"), n = setTracks(), ep = Math.max(1, parseInt($("tr_epochs").value, 10) || 0);
    if (el) el.textContent = n ? "= " + tr(ep * n + " steps") : "";
  }
  function paintPills() {
    rankSay();
    stepsSay();
    var d = state.data || {}, r = runOf(state.sel), included = state.rows.filter(function (x) { return x.include; }).length;
    var set = (d.prepared || []).filter(function (p) { return p.name === state.set; })[0];
    // HERESY 1166: the names as typed, the words translated piece by piece
    $("trSayRaw").textContent = state.raw ? state.raw + (state.rows.length ? " · " + tr(included + " of " + state.rows.length) : "") : tr("a folder of datasets/raw/");
    $("trSaySet").textContent = set ? set.name + " · " + tr(set.tracks + " tracks") : tr("a caption for every track");
    $("trSayTrain").textContent = tr(KINDS[state.kind].label.toLowerCase()) + " · " + tr("rank " + (parseInt($("tr_rank").value, 10) ? Math.max(4, Math.floor(parseInt($("tr_rank").value, 10) / 2)) + " · " + $("tr_rank").value : "?"))   /* HERESY 1668: music · sound, 1:2 */ + " · " + $("tr_quant").value +
      ($("tr_engine").value === "ruach" ? "" : " · AI-Toolkit");
    $("trSayRun").textContent = r ? r.name + (isLive(r) && r.steps ? " · " + Math.floor(100 * (r.step || 0) / r.steps) + " %" : " · " + tr(r.status)) : tr("a run: its curves and epochs");
    var done = { raw: !!state.raw, set: !!set, train: runs().some(function (x) { return x.dataset === state.set; }), run: !!(r && r.status === "done") };
    Array.prototype.forEach.call(document.querySelectorAll("#trPills .ps-step"), function (b) {
      b.classList.toggle("is-active", b.dataset.pane === state.pane);
      b.classList.toggle("is-done", !!done[b.dataset.pane]);
      b.setAttribute("aria-selected", b.dataset.pane === state.pane ? "true" : "false");
    });
  }

  // HERESY 1086: what the chosen trainer lacks, said by name; the studio's own needs no AI-Toolkit
  function warn() {
    var d = state.data || {}, own = d.own || {}, q = $("tr_quant").value, html = "";
    var lack = [];                                       // HERESY 1422: the studio's own trainer, the only one
    if (!own[q]) lack.push("Comfy-Org's YuE2 " + q + " weights");
    if (!own.mert) lack.push("MERT-v2-FullSong");
    if (!own.head) lack.push("the realaudio tokenizer head");
    // HERESY 1672: each name in the page's language before the join (the pattern's «{0}» is the whole list, which no key knows)
    if (lack.length) html += '<p class="tr-warn">The studio’s trainer is missing ' + esc(lack.map(tr).join(", ")) + ": <code>heresy/fetch-heresy.sh --trainer " + esc(q) + "</code>" +
      (own.mert ? "" : " and <code>tools/download-checkpoints.sh</code>") + ".</p>";
    $("trWarn").innerHTML = html;
  }

  // ------------------------------------------------------------------ on top: what trains now
  function paintLive() {
    var live = runs().filter(isLive), el = $("trLive");
    el.hidden = !live.length;
    el.innerHTML = live.map(function (r) {
      var pct = r.steps ? 100 * (r.step || 0) / r.steps : 0, ser = r.series || {};
      var loss = ser.flow ? ser.flow.last : r.loss, ar = ser.ar_ce ? ser.ar_ce.last : r.ar_ce;
      return '<button type="button" class="tr-liverow' + (r.name === state.sel && state.pane === "run" ? " is-on" : "") + '" data-open="' + esc(r.name) + '" data-tip="Its telemetry">' +
        '<span class="tr-lname"><i class="tr-pulse"></i><b translate="no">' + esc(r.name) + "</b><em>" + esc(r.kind || "") + " · " + (engineOf(r) === "ruach" ? "Ruach" : "AI-Toolkit") + " · GPU" + esc(r.gpus && r.gpus.length > 1 ? r.gpus.join("+") : r.gpu) + "</em></span>" +
        '<span class="tr-lnums mono">' + pct.toFixed(0) + " % · " + (r.step || 0) + "/" + (r.steps || "?") +
          (r.tracks ? " · e" + ((r.step || 0) / r.tracks).toFixed(1) + "/" + Math.round(epochs(r)) : "") +
          (r.eta_s != null ? " · " + tr("{0} left").replace("{0}", tr(span(r.eta_s))) : "") + (ser.sec_per_step ? " · " + ser.sec_per_step + " s/step" : "") +
          (loss != null ? " · flow " + Number(loss).toFixed(3) : "") + (ar != null ? " · ar_ce " + Number(ar).toFixed(2) : "") + "</span>" +
        (function (m) { return '<span class="tr-lprog"><span class="tr-lbar"><i style="width:' + pct.toFixed(1) + '%"></i>' + m.over + "</span>" + m.under + "</span>"; })(liveMarks(r, ser)) +   // HERESY 1819
        "</button>";
    }).join("");
  }
  // HERESY 1819 (Viktor 28.10.2026: «…прогресс с пометками… ожидаемые/готовые сохранения чекпоинтов, и дубляж зелёных»): the saves along the progress:
  // on disk (amber in loras/), to come (hollow, each with when it is due at this speed), deleted (a red ring), worth hearing first green, on the bar too
  function liveMarks(r, ser) {
    var total = r.steps || 0, now = r.step || 0, every = +((r.options || {}).save_every) || 0, per = r.tracks || 0;
    if (!total) return { under: "", over: "" };
    var cand = candidates(r), marks = [], at = function (s) { return Math.min(100, 100 * s / total).toFixed(2) + "%"; };
    var sps = +ser.sec_per_step || (r.eta_s && total > now ? r.eta_s / (total - now) : 0);
    var said = function (s, e) { return e != null ? "e" + epochSaid(e) : per ? "e" + epochSaid(s / per) : tr("step " + s); };
    (r.checkpoints || []).forEach(function (k) {
      if (!k.step) return;
      marks.push({ s: k.step, c: "is-done" + (k.lora ? " is-in" : "") + (cand[k.file] ? " is-cand" : ""),
        t: [said(k.step, k.epoch), tr("step " + k.step), tr("saved") + " " + when(k.saved), k.lora ? tr("in loras/") : "", cand[k.file] ? tr("worth hearing first: " + cand[k.file]) : ""] });
    });
    (r.gone || []).forEach(function (g) { marks.push({ s: g.step, c: "is-gone", t: [said(g.step, g.epoch), tr("step " + g.step), tr("deleted from disk")] }); });
    if (every > 0 && total / every <= 400) {
      var due = []; for (var s = every; s <= total; s += every) due.push(s);
      if (due[due.length - 1] !== total) due.push(total);           // the run's end saves too
      due.forEach(function (s) {
        if (s <= now || marks.some(function (m) { return Math.abs(m.s - s) < every / 2; })) return;
        marks.push({ s: s, c: "is-next", t: [said(s), tr("step " + s), sps ? tr("due in {0}").replace("{0}", tr(span((s - now) * sps))) : tr("to come")] });
      });
    }
    marks.sort(function (a, b) { return (a.c.indexOf("is-cand") >= 0) - (b.c.indexOf("is-cand") >= 0) || a.s - b.s; });   // the green ones drawn last, on top
    return {
      under: '<span class="tr-lmarks">' + marks.map(function (m) { return '<i class="' + m.c + '" style="left:' + at(m.s) + '" data-tip="' + esc(m.t.filter(Boolean).join(" · ")) + '"></i>'; }).join("") + "</span>",
      over: marks.filter(function (m) { return m.c.indexOf("is-cand") >= 0; }).map(function (m) { return '<b style="left:' + at(m.s) + '"></b>'; }).join("")
    };
  }

  // ------------------------------------------------------------------ the column of runs
  function inFilter(r) {
    if (state.st && stateOf(r) !== state.st) return false;   // HERESY 1659
    if (state.filter === "active") return isLive(r);
    if (state.filter === "archived") return !!r.archived;
    return !r.archived;                                     // All: everything not archived
  }
  function spark(r) {
    var c = ((r.series || {}).flow || (r.series || {}).loss || {}).curve;
    if (!c || c.length < 3) return "";
    var W = 100, H = 18, lo = Infinity, hi = -Infinity, last = c[c.length - 1][0] || 1;
    c.forEach(function (p) { lo = Math.min(lo, p[1]); hi = Math.max(hi, p[1]); });
    if (hi === lo) hi = lo + 1;
    var sm = ema(c, 0.15);
    return '<svg class="tr-spark" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none"><path d="' + sm.map(function (p, i) {
      return (i ? "L" : "M") + (W * p[0] / last).toFixed(1) + " " + (H - 2 - (H - 4) * (p[1] - lo) / (hi - lo)).toFixed(1);
    }).join(" ") + '" /></svg>';
  }
  function paintList() {
    var q = state.search.trim().toLowerCase(), html;
    Array.prototype.forEach.call(document.querySelectorAll("#trFilters [data-filter]"), function (b) { b.setAttribute("aria-pressed", b.dataset.filter === state.filter ? "true" : "false"); });
    Array.prototype.forEach.call(document.querySelectorAll("#trStates [data-state]"), function (b) {   // HERESY 1659: each state with its count
      var n = runs().filter(function (r) { return stateOf(r) === b.dataset.state; }).length;
      b.setAttribute("aria-pressed", b.dataset.state === state.st ? "true" : "false");
      b.dataset.n = n; b.classList.toggle("is-none", !n);
    });
    if (state.filter === "trash") {
      var t = state.trash.filter(function (x) { return !q || (x.name + " " + (x.dataset || "") + " " + (x.kind || "")).toLowerCase().indexOf(q) >= 0; });
      html = t.length ? t.map(function (x) {
        return '<article class="tr-rcard is-trash"><div class="tr-rtitle" translate="no">' + esc(x.name) + '</div><div class="tr-rsub">' + rsub([x.kind, x.dataset]) +
          "</div>" + '<div class="take-foot"><span>' + gb(x.bytes) + "</span><span>deleted " + esc(ago(x.trashed)) + "</span>" + (x.loras.length ? "<span>" + x.loras.length + " adapters with it</span>" : "") + "</div>" +
          '<div class="tr-racts"><button type="button" class="btn ghost small" data-restore="' + esc(x.id) + '">Restore</button>' +
          '<button type="button" class="btn ghost small danger" data-purge="' + esc(x.id) + '" data-size="' + x.bytes + '" data-name="' + esc(x.name) + '">Delete for good</button></div></article>';
      }).join("") : '<p class="row-hint tr-empty">The trash is empty.</p>';
    } else {
      var list = runs().filter(inFilter).filter(function (r) { return !q || (r.name + " " + (r.dataset || "") + " " + (r.kind || "") + " " + (r.note || "")).toLowerCase().indexOf(q) >= 0; });
      html = list.length ? list.map(card).join("") : '<p class="row-hint tr-empty">' + (state.filter === "active" ? "Nothing trains now." : state.filter === "archived" ? "Nothing archived." : "No runs yet: steps 1 to 3.") + "</p>";
    }
    $("trRunList").innerHTML = html;
    var n = runs().filter(function (r) { return !r.archived; }).length;
    $("trRunCount").textContent = n;
    $("trUnfoldCount").textContent = n;
    $("trLayout").classList.toggle("is-folded", state.folded);
  }
  // HERESY 1166: a run's kind, its set (a name, kept) and its tracks, each its own text
  function rsub(p) {
    return p.map(function (x, i) { return x ? "<span" + (i === 1 ? ' translate="no"' : "") + ">" + esc(x) + "</span>" : ""; }).filter(Boolean).join(" · ");
  }
  function card(r) {
    var pct = r.steps ? 100 * (r.step || 0) / r.steps : 0, live = isLive(r);
    var ep = r.tracks ? "e" + epochSaid(Math.floor(10 * (r.step || 0) / r.tracks) / 10) + "/" + Math.round(epochs(r)) : (r.step || 0) + "/" + (r.steps || "?");   // HERESY 1736: its tenths
    return '<article class="tr-rcard' + (live ? " is-running" : "") + (r.name === state.sel ? " is-selected" : "") + (r.archived ? " is-archived" : "") + '" data-open="' + esc(r.name) + '" tabindex="0">' +
      '<div class="tr-rtitle" translate="no">' + esc(r.name) + "</div>" +
      '<div class="tr-rsub">' + rsub([r.kind, r.dataset, r.tracks ? r.tracks + " tracks" : ""]) + "</div>" +
      spark(r) +
      (live || (r.status !== "done" && pct > 0) ? '<div class="tr-rbar"><i style="width:' + pct.toFixed(1) + '%"></i></div>' : "") +
      '<div class="take-foot"><span class="tag tr-st is-' + esc(r.status) + '">' + esc(r.status) + "</span>" +
        '<span class="tag">' + (engineOf(r) === "ruach" ? "Ruach" : "AITK") + "</span>" +
        "<span>" + ep + "</span>" + (r.loras && r.loras.length ? '<span data-tip="In loras/, ready in the Creator">' + r.loras.length + " in loras/</span>" : "") +
        "<span>" + esc(ago(r.started)) + "</span>" + (r.protected ? '<span class="tag tr-lock" data-tip="' + esc(tr(LOCK_TIP)) + '">🔒</span>' : "") + "</div>" +   // HERESY 1817
      '<button type="button" class="tr-rmenu" data-menu="' + esc(r.name) + '" aria-label="Run actions">⋯</button></article>';
  }
  function menu(btn) {
    closeMenu();
    var r = runOf(btn.dataset.menu);
    if (!r) return;
    var pop = document.createElement("div"), box = btn.getBoundingClientRect();
    pop.className = "menu-pop tr-menu";
    pop.setAttribute("role", "menu");
    // over the page, not inside the column (its edge would cut the last items off)
    pop.style.position = "fixed"; pop.style.right = "auto"; pop.style.top = Math.round(box.bottom + 4) + "px";
    pop.style.left = Math.max(8, Math.round(box.right - 190)) + "px";
    pop.innerHTML = '<button type="button" role="menuitem" data-act="open">Telemetry</button>' +
      '<button type="button" role="menuitem" data-act="log">The log</button>' +   // HERESY 1167: at the page's foot
      (canGoOn(r) ? '<button type="button" role="menuitem" data-act="goon">Go on to more epochs…</button>' : "") +   // HERESY 1300
      '<button type="button" role="menuitem" data-act="' + (r.archived ? "unarchive" : "archive") + '">' + (r.archived ? "Out of the archive" : "Archive") + "</button>" +
      (r.status === "running" ? '<button type="button" role="menuitem" data-act="pause">' + esc(tr("Pause")) + "</button>" : "") +   // HERESY 1659
      (r.status === "paused" ? '<button type="button" role="menuitem" data-act="resume">' + esc(tr("Resume")) + "</button>" : "") +
      '<button type="button" role="menuitem" data-act="' + (r.protected ? "unprotect" : "protect") + '">' + (r.protected ? "Unprotect…" : "Protect") + "</button>" +   // HERESY 1817
      (isLive(r) ? '<button type="button" role="menuitem" class="danger" data-act="stop">Stop…</button>'
                 : r.protected ? "" : '<button type="button" role="menuitem" class="danger" data-act="delete">Delete…</button>');
    document.body.appendChild(pop);
    pop.dataset.run = r.name;
    pop.addEventListener("click", function (e) { var b = e.target.closest("[data-act]"); if (b) { closeMenu(); act(r.name, b.dataset.act); } });
    var under = window.innerHeight - pop.getBoundingClientRect().bottom;
    if (under < 8) pop.style.top = Math.round(box.top - pop.offsetHeight - 4) + "px";
    setTimeout(function () { document.addEventListener("click", closeMenu, { once: true }); }, 0);
  }
  function closeMenu() { Array.prototype.forEach.call(document.querySelectorAll(".tr-menu"), function (m) { m.remove(); }); }
  // HERESY 1167 (Viktor: «The log открывает новую вкладку. Вынеси это вниз в подвальный фрейм»): the run's log in a panel at
  // the page's foot, its tail following a live run (every 3 s, only while it is open); ✕ or Esc closes it
  var logDock = null;
  function showLog(name) {
    if (!logDock) {
      logDock = document.createElement("section");
      logDock.className = "tr-logdock";
      logDock.innerHTML = '<div class="tr-logdock-head"><b>The log</b> <span class="mono dim tr-logdock-name" translate="no"></span>' +
        '<span class="spacer"></span><a class="btn ghost small tr-logdock-dl" download>Download</a>' +
        '<button type="button" class="btn ghost small tr-logdock-x" aria-label="Close" data-tip="Close (Esc)">✕</button></div>' +
        '<pre class="mono tr-logdock-body"></pre>';
      document.body.appendChild(logDock);
      logDock.querySelector(".tr-logdock-x").addEventListener("click", hideLog);
      document.addEventListener("keydown", function (e) { if (e.key === "Escape" && logDock && !logDock.hidden) hideLog(); });
      // HERESY 1298: placed again when the window or the server log's dock changes (folded, unfolded, full height, the other side)
      window.addEventListener("resize", placeLog);
      var dock = document.getElementById("logDock");
      if (dock && window.ResizeObserver) new ResizeObserver(placeLog).observe(dock);
      if (dock && window.MutationObserver) new MutationObserver(placeLog).observe(dock, { attributes: true, attributeFilter: ["class", "style"] });
    }
    logDock.hidden = false;
    placeLog();
    logDock.dataset.run = name;
    logDock.querySelector(".tr-logdock-name").textContent = name;
    logDock.querySelector(".tr-logdock-dl").href = "/lab/train/log?name=" + encodeURIComponent(name);
    logDock.querySelector(".tr-logdock-dl").setAttribute("download", name + ".log");
    pullLog();
  }
  function hideLog() { if (logDock) { logDock.hidden = true; clearTimeout(logDock.timer); } }
  // HERESY 1298 (Viktor 10.10.2026: «The LOG перекрывает серверный фрейм. Сделай утяжку»): the panel is as wide as its lines
  // (app.css: max-content) and no wider than the room beside the server log's dock, on the side the dock leaves free; with
  // less than 360 px there (a narrow window) it takes the width as before
  function placeLog() {
    if (!logDock || logDock.hidden) return;
    var dock = document.getElementById("logDock"), vw = document.documentElement.clientWidth, room = vw - 32, right = false;
    if (dock && getComputedStyle(dock).display !== "none") {
      var r = dock.getBoundingClientRect();
      if (r.width) {
        var dockLeft = r.left + r.width / 2 < vw / 2, beside = dockLeft ? vw - 16 - (r.right + 12) : r.left - 12 - 16;
        if (beside >= 360) { room = Math.floor(beside); right = dockLeft; }
      }
    }
    logDock.style.setProperty("--tr-log-room", room + "px");
    logDock.classList.toggle("is-right", right);
  }
  function pullLog() {
    if (!logDock || logDock.hidden) return;
    var name = logDock.dataset.run, body = logDock.querySelector(".tr-logdock-body");
    clearTimeout(logDock.timer);
    fetch("/lab/train/log?name=" + encodeURIComponent(name)).then(function (r) { return r.ok ? r.text() : ""; }).then(function (text) {
      if (!logDock || logDock.dataset.run !== name) return;
      var lines = text.split(/\r?\n|\r/).filter(function (l) { return l.trim(); }), atEnd = body.scrollTop + body.clientHeight >= body.scrollHeight - 8;
      body.textContent = lines.slice(-400).join("\n") || "(the log is empty)";
      if (atEnd) body.scrollTop = body.scrollHeight;
      var r = runs().filter(function (x) { return x.name === name; })[0];
      if (r && isLive(r)) logDock.timer = setTimeout(pullLog, 3000);
    }).catch(function () { logDock.timer = setTimeout(pullLog, 6000); });
  }
  // HERESY 1300 (Viktor 10.10.2026: «можно ли на завершённом тренинге продолжить по большему количеству эпох?»): a run of the studio's
  // own trainer that has ended with a save goes on to more epochs: the lab's run of the same name takes its last save and its
  // optimizer's state (lab/trainer/train.py), the same set and knobs, only the steps more
  function canGoOn(r) {
    return !!r && !isLive(r) && engineOf(r) === "ruach" && (r.checkpoints || []).some(function (k) { return k.step; }) && !!(r.tracks || (r.options || {}).steps_per_epoch);
  }
  function goOn(name) {
    var r = runOf(name), o = (r && r.options) || {};
    if (!canGoOn(r)) return toast("This run has no save to go on from", true);
    var tracks = r.tracks || o.steps_per_epoch, at = Math.max.apply(null, (r.checkpoints || []).map(function (k) { return k.step || 0; })) / tracks;
    var now = at % 1 ? at.toFixed(1) : String(at), first = Math.floor(at) + 4;
    window.HeresyDialog.prompt(tr("Go on with " + name + " to how many epochs in all?") + "\n\n" + tr("It has " + now + " now; it goes on from its last save with the same set and knobs, on a card of its own."),
      String(first), { ok: "Go on", placeholder: String(first) }).then(function (v) {
      if (v === null) return;
      var n = parseInt(v, 10);
      if (!(n > at && n <= 1000)) return toast(tr("More epochs than " + now + ", please"), true);
      // HERESY 1752: every knob the run was given (its held-out tracks, its average's span, its AR tokens, its cards, its fade…), the steps more:
      // the lab takes a knob not sent from its defaults, so naming eight of them let a run gone on lose the rest
      var spec = Object.assign({}, o, { dataset: r.dataset, name: r.name, kind: r.kind || "", engine: "ruach", steps: n * tracks, save_epochs: o.save_epochs || 1,
        cot: o.cot || "off", quant: o.quant || "bf16", do_separation: !!o.do_separation, note: r.note || "" });   // HERESY 1422: the run's own separation kept
      return api("/train/run", spec).then(function () {
        toast(tr(name + " goes on to " + n + " epochs"));
        state.sel = name; keep("yue2.trRun", name);
        return load().then(function () { showPane("run"); });
      });
    }).catch(function (e) { toast(e.message, true); });
  }
  function act(name, what) {
    if (what === "goon") return goOn(name);          // HERESY 1300
    if (what === "log") return showLog(name);        // HERESY 1167
    if (what === "open") return openRun(name);
    if (what === "archive" || what === "unarchive")
      return api("/train/archive", { name: name, archived: what === "archive" }).then(function () { toast(what === "archive" ? name + " is archived" : name + " is back from the archive"); load(); }).catch(function (e) { toast(e.message, true); });
    if (what === "stop") return stopRun(name);
    if (what === "pause") return api("/train/pause", { name: name }).then(function () { toast(tr("Pausing {0}: it saves what it has learned and waits for Resume").replace("{0}", name)); load(); }).catch(function (e) { toast(e.message, true); });   // HERESY 1659
    if (what === "resume") return api("/train/resume", { name: name }).then(function () { toast(tr("Resuming {0} from its last save").replace("{0}", name)); load(); }).catch(function (e) { toast(e.message, true); });
    if (what === "delete") return deleteRun(name);
    if (what === "protect") return api("/train/protect", { name: name, on: true }).then(function () { toast(tr("{0} is protected").replace("{0}", name)); load(); }).catch(function (e) { toast(e.message, true); });   // HERESY 1817
    if (what === "unprotect") return confirmBox(tr("Unprotect {0}? Its saves and the run itself can then be deleted.").replace("{0}", name), { ok: "Unprotect", danger: true })
      .then(function (ok) { if (ok) return api("/train/protect", { name: name, on: false }).then(function () { toast(tr("{0} is no longer protected").replace("{0}", name)); load(); }); }).catch(function (e) { toast(e.message, true); });
  }
  // HERESY 1817: the saves chosen one by one, for an unprotected, stopped run
  var LOCK_TIP = "Protected: neither its saves nor the run itself can be deleted; ⋯ → Unprotect to change that";
  function pickOn(r) { return !!(state.pick && state.pick.run === r.name); }
  function pickGo(r) {
    var chosen = (r.checkpoints || []).filter(function (c) { return state.pick.files[c.file]; });
    if (!chosen.length) return;
    var bytes = chosen.reduce(function (s, c) { return s + (c.bytes || 0); }, 0), pub = chosen.filter(function (c) { return c.lora; });
    var list = chosen.map(function (c) { return c.epoch != null ? "e" + epochSaid(c.epoch) : "final"; }).join(", ");
    confirmBox(tr("Delete {0} saves of {1} for good?").replace("{0}", chosen.length).replace("{1}", r.name) + "\n\n" + list + " · " + gb(bytes), { ok: "Delete", danger: true })
      .then(function (ok) {
        if (!ok) return null;
        if (!pub.length) return { loras: false };
        return confirmBox(tr("{0} of them are in loras/, in the Creator's LoRAs. Take them out too (the space comes back), or keep them usable?").replace("{0}", pub.length),
          { ok: "Take them out", cancel: "Keep them" }).then(function (out) { return { loras: !!out }; });
      })
      .then(function (how) {
        if (!how) return;
        return api("/train/delete-saves", { name: r.name, files: chosen.map(function (c) { return c.file; }), loras: how.loras }).then(function (d) {
          state.pick = null;
          toast(tr("{0} saves deleted, {1} back on the disk").replace("{0}", (d.deleted || []).length).replace("{1}", gb(d.freed || 0)));
          load();
        });
      }).catch(function (e) { toast(e.message, true); });
  }
  function stopRun(name) {
    var r = runOf(name);
    confirmBox("Stop " + name + "?\n\n" + (engineOf(r) === "ruach" ? "The studio’s trainer" : "AI-Toolkit") + " saves what it has learned on the way out; the epochs saved so far stay.", { ok: "Stop", danger: true })
      .then(function (ok) { if (ok) return api("/train/stop", { name: name }).then(function () { toast("Stopping " + name); load(); }); }).catch(function (e) { toast(e.message, true); });
  }
  function deleteRun(name) {
    var r = runOf(name), cks = r.checkpoints || [], bytes = cks.reduce(function (s, c) { return s + (c.bytes || 0); }, 0), own = r.loras || [];
    confirmBox("Delete " + name + "?\n\nIts folder (" + cks.length + " checkpoints, " + gb(bytes) + ") goes to the trash: the Trash filter here brings it back, or deletes it for good.", { ok: "To the trash", danger: true })
      .then(function (ok) {
        if (!ok) return;
        if (!own.length) return false;
        return confirmBox("And its " + own.length + " adapter" + (own.length > 1 ? "s" : "") + " in loras/?\n\n" + own.join(", ") + "\n\nThey are in the Creator’s LoRAs now. Take them out with the run (into the trash beside it), or keep them usable in the Creator.",
          { ok: "Take them out", cancel: "Keep them" }).then(function (takeOut) {
          return api("/train/delete", { name: name, loras: !!takeOut }).then(function (d) { return d; });
        });
      })
      .then(function (d) {
        if (d === undefined) return;
        var go = d === false ? api("/train/delete", { name: name, loras: false }) : Promise.resolve(d);
        return go.then(function (res) {
          toast(name + " is in the trash" + (res.loras && res.loras.length ? " with " + res.loras.length + " adapter" + (res.loras.length > 1 ? "s" : "") : ""));
          if (state.sel === name) state.sel = "";
          load();
        });
      }).catch(function (e) { toast(e.message, true); });
  }
  function restore(id) {
    api("/train/restore", { id: id }).then(function (d) { toast(d.name + " is back" + (d.loras.length ? " with its adapters" : "")); load(); }).catch(function (e) { toast(e.message, true); });
  }
  function purge(id, name, size) {
    confirmBox("Delete " + name + " for good?\n\n" + gb(+size || 0) + " freed. This cannot be undone.", { ok: "Delete for good", danger: true })
      .then(function (ok) { if (ok) return api("/train/purge", { id: id }).then(function (d) { toast(name + " is gone: " + gb(d.freed) + " freed"); load(); }); }).catch(function (e) { toast(e.message, true); });
  }
  function openRun(name) {
    if (state.sel !== name) state.cmp = "";
    state.sel = name; state.epoch = ""; keep("yue2.trRun", name);
    paintList(); paintLive(); showPane("run");
  }

  // ------------------------------------------------------------------ 4 Telemetry
  function ema(curve, a) {
    var out = [], v = null;
    curve.forEach(function (p) { v = v == null ? p[1] : v + a * (p[1] - v); out.push([p[0], v]); });
    return out;
  }
  // HERESY 1736: an epoch as it is said: its tenths (0.7, 1.3), a whole one without a point (1, 2)
  function epochSaid(e) { var x = Math.round(e * 10) / 10; return Math.abs(x - Math.round(x)) < 1e-9 ? String(Math.round(x)) : x.toFixed(1); }
  // HERESY 1736: the held-out measure (1497) when the run has one: the saves it rates best, each with why (else null)
  function heldOutBest(r) {
    var hist = ((r.val || {}).history || []).filter(function (h) { return h && h.step && h.flow != null; });
    if (!hist.length) return null;
    var byStep = {}, out = {};
    (r.checkpoints || []).forEach(function (k) { if (k.step) byStep[k.step] = k; });
    var mark = function (h, why) {
      var k = byStep[h.step]; if (!k) return;
      out[k.file] = (out[k.file] ? out[k.file] + "; " : "") + tr(why + " (flow " + Number(h.flow).toFixed(4) + (h.ar_ce != null ? ", ar_ce " + Number(h.ar_ce).toFixed(3) : "") + ")");
    };
    var f = hist.reduce(function (b, h) { return h.flow < b.flow ? h : b; }, hist[0]), ce = hist.filter(function (h) { return h.ar_ce != null; });
    var m = ce.length ? ce.reduce(function (b, h) { return h.ar_ce < b.ar_ce ? h : b; }, ce[0]) : null;
    if (m && m.step === f.step) mark(f, "the lowest sound and music loss on the held-out tracks");
    else { mark(f, "the lowest sound loss on the held-out tracks"); if (m) mark(m, "the lowest music loss on the held-out tracks"); }
    return Object.keys(out).length ? out : null;
  }
  // a curve over the steps: the raw points faint, their running average bold, the epochs as ticks (a filled one
  // is in loras/), the chosen epoch as a line; y labelled at its top, middle and bottom
  // HERESY 1093 (Viktor, 02.10.2026): the epochs worth hearing first, read off the curves (a guess; the ear
  // decides). At each saved epoch: the averaged sound loss (flow) and music loss (ar_ce) there. A candidate has
  // the sound half settled (its average within 15 % of the run's span above its floor, the first fast fall left
  // out) and the music half not yet knowing the songs by heart (ar_ce 0.3 or more). Lit: the first such epoch,
  // the one with the lowest sound loss, and the last before the music half learns the songs by heart.
  function candidates(r) {
    var held = heldOutBest(r);                            // HERESY 1736: measured on the held-out tracks, not guessed off the curves
    if (held) return held;
    var ser = r.series || {}, f = (ser.flow || ser.loss || {}).curve, c = (ser.ar_ce || {}).curve;
    if (!f || f.length < 8) return {};
    var fa = ema(f, 0.08), ca = c && c.length > 1 ? ema(c, 0.08) : null;
    var at = function (curve, step) { var v = curve[0][1]; curve.forEach(function (p) { if (p[0] <= step) v = p[1]; }); return v; };
    var skip = Math.floor(fa.length * 0.05), vals = fa.slice(skip).map(function (p) { return p[1]; });
    var lo = Math.min.apply(null, vals), span = (Math.max.apply(null, vals) - lo) || 1e-9;
    var ok = (r.checkpoints || []).filter(function (k) { return k.step && k.epoch != null; })
      .sort(function (a, b) { return a.step - b.step; })
      .map(function (k) { return { k: k, flow: at(fa, k.step), ce: ca ? at(ca, k.step) : null }; })
      .filter(function (x) { return x.flow <= lo + 0.15 * span && (x.ce == null || x.ce >= 0.3); });
    var out = {};
    if (!ok.length) return out;
    // HERESY 1167: each reason translated by itself: joined first, a catalog pattern for the first swallowed the second
    var add = function (x, why) { out[x.k.file] = (out[x.k.file] ? out[x.k.file] + "; " : "") + tr(why + " (flow " + x.flow.toFixed(3) + (x.ce != null ? ", ar_ce " + x.ce.toFixed(2) : "") + ")"); };
    add(ok[0], "the first with the sound settled");
    add(ok.reduce(function (b, x) { return x.flow < b.flow ? x : b; }, ok[0]), "the lowest sound loss");
    add(ok[ok.length - 1], "the last before the music half knows the songs by heart");
    return out;
  }
  // HERESY 1855 (Viktor 29.10.2026: «в графики кривых добавь увеличение/ресет скейла»): the steps in view, both curves alike, kept while the run stays
  // chosen; the y scale fits what is in view
  function zoomOf(r, last) {
    var z = state.zoom && state.zoom.run === r.name ? state.zoom : null;
    if (!z) return [0, last];
    var a = Math.max(0, Math.min(z.a, last - 1));
    return [a, Math.max(a + 1, Math.min(z.b, last))];
  }
  function zoomSet(a, b, last) {
    var min = Math.max(10, last / 500);
    if (b - a < min) { var m = (a + b) / 2; a = m - min / 2; b = m + min / 2; }
    if (a < 0) { b -= a; a = 0; }
    if (b > last) { a -= b - last; b = last; }
    a = Math.max(0, a);
    state.zoom = a <= 0 && b >= last ? null : { run: state.sel, a: a, b: b };
    paintRun();
  }
  function zoomBar(z, last) {
    var on = z[0] > 0 || z[1] < last;
    return '<span class="tr-zoom">' + (on ? '<span class="mono tr-zspan">' + esc(tr("steps {0}–{1}").replace("{0}", Math.round(z[0])).replace("{1}", Math.round(z[1]))) + "</span>" : "") +
      '<button type="button" class="btn ghost small tr-zbtn" data-zoom="out"' + (on ? "" : " disabled") + ' aria-label="' + esc(tr("Zoom out")) + '" data-tip="' + esc(tr("Zoom out: twice the steps")) + '">\u2212</button>' +
      '<button type="button" class="btn ghost small tr-zbtn" data-zoom="in" aria-label="' + esc(tr("Zoom in")) + '" data-tip="' + esc(tr("Zoom in on the steps: half of them, around the middle. Or drag across a curve; Ctrl and the wheel zoom where the pointer is")) + '">+</button>' +
      '<button type="button" class="btn ghost small tr-zbtn" data-zoom="reset"' + (on ? "" : " disabled") + ' aria-label="' + esc(tr("The whole run")) + '" data-tip="' + esc(tr("The whole run again (a double-click on a curve does it too)")) + '">\u27f2</button></span>';
  }
  function chart(key, ser, r, title, say) {
    var s = ser[key];
    if (!s || !s.curve || s.curve.length < 2) return "";
    var other = runOf(state.cmp), oc = other && other !== r ? (((other.series || {})[key] || {}).curve || []) : [];
    var c = s.curve, W = 600, H = 150, L = 0, lo = Infinity, hi = -Infinity, last = Math.max(r.steps || 0, c[c.length - 1][0], other ? other.steps || 0 : 0) || 1;
    var z = zoomOf(r, last), x0 = z[0], x1 = z[1];        // HERESY 1855: the steps in view
    var clip = function (pts) {                            // the points in view, and one on each side for the line to run out of it
      var i0 = 0, i1 = pts.length - 1;
      for (var i = 0; i < pts.length; i++) { if (pts[i][0] <= x0) i0 = i; if (pts[i][0] >= x1) { i1 = i; break; } }
      return pts.slice(i0, i1 + 1);
    };
    c.concat(oc.length > 1 ? ema(oc, 0.08) : []).forEach(function (p) { if (p[0] >= x0 && p[0] <= x1) { lo = Math.min(lo, p[1]); hi = Math.max(hi, p[1]); } });
    if (!isFinite(lo)) clip(c).forEach(function (p) { lo = Math.min(lo, p[1]); hi = Math.max(hi, p[1]); });
    var pad = (hi - lo) * 0.06 || 0.05; lo -= pad; hi += pad;
    var x = function (st) { return L + (W - L) * (st - x0) / (x1 - x0); }, y = function (v) { return H - 6 - (H - 14) * (v - lo) / (hi - lo); };
    var path = function (pts) { return clip(pts).map(function (p, i) { return (i ? "L" : "M") + x(p[0]).toFixed(1) + " " + y(p[1]).toFixed(1); }).join(" "); };
    var grid = [0, 0.5, 1].map(function (f) { var v = lo + (hi - lo) * (1 - f), yy = y(v); return '<line class="g" x1="0" x2="' + W + '" y1="' + yy.toFixed(1) + '" y2="' + yy.toFixed(1) + '"/>'; }).join("");
    var cand = candidates(r);
    var ticks = (r.checkpoints || []).filter(function (k) { return k.step; }).map(function (k) {
      var xx = x(k.step).toFixed(1);
      return '<line class="t' + (k.lora ? " on" : "") + (cand[k.file] ? " cand" : "") + (k.file === state.epoch ? " sel" : "") + '" x1="' + xx + '" x2="' + xx + '" y1="' + (k.file === state.epoch ? 0 : cand[k.file] ? H - 18 : H - 6) + '" y2="' + H + '"/>';
    }).join("");
    var labels = [hi, (hi + lo) / 2, lo].map(function (v, i) { return '<span style="top:' + [2, 46, 90][i] + '%">' + v.toFixed(v < 10 ? 3 : 2) + "</span>"; }).join("");
    return '<figure class="tr-chart" data-key="' + key + '" data-last="' + last + '" data-x0="' + x0 + '" data-x1="' + x1 + '" data-lo="' + lo + '" data-hi="' + hi + '">' +
      '<figcaption><b>' + title + '</b>' + zoomBar(z, last) + '<span class="mono">' + s.first.toFixed(3) + " → " + s.last.toFixed(3) + " · min " + s.min.toFixed(3) + '</span><span class="tr-read mono is-hint">over the curve: the step, its epoch, the value there</span></figcaption>' +
      '<div class="tr-plot"><div class="tr-ylab mono">' + labels + "</div>" +
      '<svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none">' + grid + ticks +
        '<path class="raw" d="' + path(c) + '"/>' + (oc.length > 1 ? '<path class="cmp" d="' + path(ema(oc, 0.08)) + '"/>' : "") +
        '<path class="avg" d="' + path(ema(c, 0.08)) + '"/><line class="cur" x1="-10" x2="-10" y1="0" y2="' + H + '"/></svg></div>' +
      (oc.length > 1 ? '<div class="tr-cmpkey"><span class="k-this"></span>' + esc(r.name) + '<span class="k-cmp"></span>' + esc(other.name) + " (its average, dashed)</div>" : "") +
      '<p class="tr-say">' + say + "</p></figure>";
  }
  function paintRun() {
    var el = $("trRunPane"), r = runOf(state.sel);
    if (!r) { el.innerHTML = '<p class="row-hint">No run chosen: pick one in the column on the right, or start one in step 3.</p>'; return; }
    var o = r.options || {}, ser = r.series || {}, live = isLive(r);
    var cks = (r.checkpoints || []).slice().sort(function (a, b) {        // by step; the run's final file after its last numbered one
      return (a.step || 0) - (b.step || 0) || (/_\d{6,}\.safetensors$/.test(b.file) ? 1 : 0) - (/_\d{6,}\.safetensors$/.test(a.file) ? 1 : 0);
    });
    var pct = r.steps ? 100 * (r.step || 0) / r.steps : 0, took = (r.ended || (live ? Date.now() / 1000 : r.started)) - r.started;
    var ar = ser.ar_ce ? ser.ar_ce.last : r.ar_ce, memo = ar != null && ar < 0.3;
    var bytes = cks.reduce(function (s, c) { return s + (c.bytes || 0); }, 0);
    var tile = function (k, v, hint, wide) { return '<div class="tr-tile' + (wide ? " tr-tile-wide" : "") + '"' + (hint ? ' data-tip="' + esc(hint) + '"' : "") + "><span>" + k + "</span><b>" + v + "</b></div>"; };
    var pick = cks.filter(function (c) { return c.file === state.epoch; })[0], cand = candidates(r);
    el.innerHTML =
      '<div class="tr-rhead"><div class="tr-rname"><b translate="no">' + esc(r.name) + '</b><span class="tag tr-st is-' + esc(r.status) + '">' + esc(r.status) + "</span>" +
        (r.kind ? '<span class="tag">' + esc(r.kind) + "</span>" : "") + '<span class="tag">' + (engineOf(r) === "ruach" ? "Ruach trainer" : "AI-Toolkit") + "</span>" +
        (r.archived ? '<span class="tag">archived</span>' : "") + "</div>" +
        '<div class="tr-racts"><select class="tr-cmp" id="trCmp" aria-label="Compare with another run" data-tip="Another run\u2019s curves, dashed, on the same steps">' +
          '<option value="">Compare with\u2026</option>' + runs().filter(function (x) { return x.name !== r.name && x.series && x.series.flow; })
            .sort(function (x, y) { return (y.dataset === r.dataset) - (x.dataset === r.dataset); })
            .map(function (x) { return '<option value="' + esc(x.name) + '"' + (x.name === state.cmp ? " selected" : "") + ">" + esc(x.name) + (x.dataset === r.dataset ? " \u00b7 same set" : "") + "</option>"; }).join("") + "</select>" +
          (r.status === "running" ? '<button type="button" class="btn ghost small" data-act="pause" data-run="' + esc(r.name) + '" data-tip="' + esc(tr("Pause: the run saves what it has learned and waits; Resume goes on from that save, with the same set, knobs and cards.")) + '">' + esc(tr("Pause")) + "</button>" : "") +   // HERESY 1659
          (r.status === "paused" ? '<button type="button" class="btn ghost small" data-act="resume" data-run="' + esc(r.name) + '" data-tip="' + esc(tr("Resume: the run goes on from its last save, with the same set, knobs and cards.")) + '">' + esc(tr("Resume")) + "</button>" : "") +
          (live ? '<button type="button" class="btn ghost small danger" data-act="stop" data-run="' + esc(r.name) + '">Stop</button>' : "") +
          '<button type="button" class="btn ghost small" data-act="log" data-run="' + esc(r.name) + '">The log</button>' +   // HERESY 1167
          // HERESY 1299 (Viktor: «выстраивать в одну колонку оба блока живого графа»): the face shows what a click makes
          '<button type="button" class="btn ghost small tr-stack" data-stack aria-pressed="' + state.stacked + '" data-tip="' +
            esc(tr(state.stacked ? "The curves side by side" : "The curves one under the other, each the whole width")) + '" aria-label="' +
            esc(tr(state.stacked ? "The curves side by side" : "The curves one under the other, each the whole width")) + '">' +
            (window.HeresyIcons ? window.HeresyIcons.ui(state.stacked ? "cols-2" : "rows-2") : "") + "</button>" +
          '<button type="button" class="btn ghost small" data-menu="' + esc(r.name) + '" aria-label="More">⋯</button></div></div>' +
      (r.note ? '<p class="row-hint tr-note" translate="no">' + esc(r.note) + "</p>" : "") +
      '<div class="tr-prog' + (live ? " is-live" : "") + '"><div class="tr-pbar"><i style="width:' + pct.toFixed(1) + '%"></i></div>' +
        '<span class="mono">' + pct.toFixed(1) + " % · step " + (r.step || 0) + " / " + (r.steps || "?") + (r.tracks ? " · epoch " + ((r.step || 0) / r.tracks).toFixed(1) + " / " + Math.round(epochs(r)) : "") + "</span></div>" +
      '<div class="tr-tiles">' +
        tile("speed", ser.sec_per_step ? ser.sec_per_step + " s/step" : "—") +
        tile(live ? "running" : "took", span(r.elapsed_s != null && live ? r.elapsed_s : took)) +
        tile("left", live && r.eta_s != null ? span(r.eta_s) : "—") +
        tile("flow now", ser.flow ? ser.flow.last.toFixed(3) : "—", "the sound half's loss, averaged over the last 25 steps") +
        tile("ar_ce now", ar != null ? Number(ar).toFixed(3) : "—", "the music half's loss, averaged over the last 25 steps") +
        tile("ar_kl now", ser.ar_kl ? ser.ar_kl.last.toFixed(4) : "—", "how far the music half has moved from the base model") +
        tile("VRAM peak", r.vram_peak_mb ? (r.vram_peak_mb / 1024).toFixed(1) + " GB" : "—", "the card's peak while it ran") +
        tile("GPU", r.gpus && r.gpus.length > 1 ? "GPU" + esc(r.gpus.join("+")) : r.gpu != null ? "GPU" + esc(r.gpu) : "—") +   // HERESY 1631
        // HERESY 1736: the held-out best (1497), its epoch
        (r.val && r.val.best && r.val.best.flow != null ? tile("held-out best", Number(r.val.best.flow).toFixed(4) + (r.tracks && r.val.best.step ? " · e" + epochSaid(r.val.best.step / r.tracks) : ""),
          "The sound half's loss on " + ((r.val.held_out || []).length || 16) + " tracks it never trains on, measured at each save: the lowest so far, and the epoch it came at", true) : "") +   // HERESY 1833: two tiles wide
      "</div>" +
      (memo ? '<p class="tr-err">ar_ce ' + Number(ar).toFixed(3) + ": the music half is learning the songs by heart; an earlier epoch may be the better adapter.</p>" : "") +
      (ser.error ? '<p class="tr-err">' + esc(ser.error) + "</p>" : "") + (r.error ? '<p class="tr-err">' + esc(r.error) + "</p>" : "") +
      '<div class="tr-charts' + (state.stacked ? " is-stacked" : "") + '">' +
        chart(ser.flow ? "flow" : "loss", ser, r, ser.flow ? "Sound half · flow loss (NAR)" : "All together · loss",
          "How well the sound half predicts the noise it has to take away. Lower is better. It jumps from step to step with the random noise level of each step: read the bold line, the running average.") +
        chart("ar_ce", ser, r, "Music half · ar_ce (AR)",
          "How well the music half predicts the song’s own tokens. Lower is better; close to 0 it knows the songs by heart, and an earlier epoch is then the better adapter.") +
      "</div>" +
      (cks.length || (r.gone || []).length ? '<div class="tr-epochs"><div class="tr-ehead"><span class="label">Epochs · ' + cks.length + " saved · " + gb(bytes) + "</span>" +
          ((r.gone || []).length ? '<span class="tr-gone-n">' + r.gone.length + " deleted from disk</span>" : "") +   // HERESY 1816
          // HERESY 1817: choosing saves to delete, one by one; none for a protected or a running run
          (r.protected ? '<span class="tag tr-lock" data-tip="' + esc(tr(LOCK_TIP)) + '">🔒 protected</span>'
            : live ? "" : pickOn(r) ? (function () {
              var ch = cks.filter(function (c) { return state.pick.files[c.file]; }), bb = ch.reduce(function (s, c) { return s + (c.bytes || 0); }, 0);
              return '<span class="tr-pickbar"><button type="button" class="btn small danger" data-pickgo' + (ch.length ? "" : " disabled") + ">" + esc(tr("Delete {0} chosen · {1}").replace("{0}", ch.length).replace("{1}", gb(bb))) + "</button>" +
                '<button type="button" class="btn ghost small" data-pickoff>Cancel</button></span>';
            })() : '<button type="button" class="btn ghost small tr-pickon" data-pickon>Choose saves to delete…</button>') +
          '<span class="row-hint">a click: into the Creator’s LoRAs or out of them; a right-click: its file \u00b7 <span class="tr-key-cand"></span>' + (heldOutBest(r) ? " worth hearing first, by the held-out tracks (the ear decides) \u00b7 \u2713 in loras/" : " worth hearing first, read off the curves (a guess: the ear decides) \u00b7 \u2713 in loras/") + "</span></div>" +   // HERESY 1736
        // HERESY 1816: the saves no longer on disk, struck through in the same row, by step
        '<div class="tr-echips">' + cks.concat((r.gone || []).map(function (g) { return { gone: true, step: g.step, epoch: g.epoch }; })).sort(function (a, b) {
          return (a.step || 0) - (b.step || 0) || (a.gone ? -1 : 0) - (b.gone ? -1 : 0);
        }).map(function (c) {
          if (c.gone) return '<span class="coll-chip is-gone" data-tip="' + esc([tr("step " + c.step), tr("deleted from disk")].join(" · ")) + '">' + (c.epoch != null ? "e" + epochSaid(c.epoch) : tr("step " + c.step)) + "</span>";
          var why = cand[c.file];
          return '<button type="button" class="coll-chip' + (c.lora ? " is-in" : "") + (why ? " is-cand" : "") + (c.file === state.epoch ? " is-on" : "") + (pickOn(r) && state.pick.files[c.file] ? " is-pick" : "") + '" data-epoch="' + esc(c.file) + '" data-tip="' + esc([tr("step " + c.step), when(c.saved), c.lora ? tr("in loras/") : "", why ? tr("worth hearing first: " + why) : ""].filter(Boolean).join(" · ")) + '">' + (c.epoch != null ? "e" + epochSaid(c.epoch) : "final") + (c.lora ? " ✓" : "") + "</button>";
        }).join("") + "</div>" +
        "</div>" : "") +
      '<div class="tr-facts"><div class="tr-facts-head">What it was given</div><div class="tr-fgrid">' +   // HERESY 1833: open always
        "<span><em>set</em> <span translate=\"no\">" + esc(r.dataset) + "</span>" + (r.tracks ? " · <span>" + r.tracks + " tracks</span>" : "") + "</span>" +   // HERESY 1166
        "<span><em>rank</em> " + esc(o.rank) + " · lr " + esc(o.lr) + "</span>" +
        (+o.lr_tail_epochs > 0 ? "<span><em>fade</em> " + esc(tr("the last {0} epochs to {1} %").replace("{0}", o.lr_tail_epochs).replace("{1}", Math.round((+o.lr_tail_floor || 0) * 100))) + "</span>" : "") +   // HERESY 1752
        "<span><em>music half</em> AR " + esc(o.ar_loss_weight) + " · KL " + esc(o.ar_kl_weight) + " · <span>speed ×" + esc(o.ar_lr_multiplier) + "</span></span>" +
        "<span><em>mode</em> <span>" + esc(o.cot) + "</span> · " + esc(o.quant) + (o.do_separation ? " · <span>separated</span>" : "") + "</span>" +
        "<span><em>window</em> " + Math.round((o.train_window_frames || 0) / 25) + " s</span>" +
        (guardSaid(o) ? "<span><em>guard</em> " + esc(guardSaid(o)) + "</span>" : "") +   // HERESY 1832
        (ser.vram_cards ? "<span><em>VRAM peaks</em> " + Object.keys(ser.vram_cards).map(function (k) {
          var c = ser.vram_cards[k], card = (r.gpus || [])[+k];
          return "GPU" + (card != null ? card : k) + " " + esc(tr("{0} GB at step {1}").replace("{0}", c.gb).replace("{1}", c.step));
        }).join(" · ") + "</span>" : "") +
        "<span><em>started</em> " + esc(when(r.started)) + "</span>" +
      "</div></div>";
  }
  // the reading under the cursor: the step, its epoch and both values there
  function readout(e) {
    var fig = e.target.closest(".tr-chart"), r = runOf(state.sel);
    if (!fig || !r) return;
    var svg = fig.querySelector("svg"), box = svg.getBoundingClientRect(), last = +fig.dataset.last;
    var f = Math.max(0, Math.min(1, (e.clientX - box.left) / box.width)), step = +fig.dataset.x0 + f * (+fig.dataset.x1 - +fig.dataset.x0);   // HERESY 1855: in view
    var c = ((r.series || {})[fig.dataset.key] || {}).curve || [];
    if (!c.length) return;
    var best = c.reduce(function (b, p) { return Math.abs(p[0] - step) < Math.abs(b[0] - step) ? p : b; }, c[0]);
    var sm = ema(c, 0.08).filter(function (p) { return p[0] === best[0]; })[0];
    Array.prototype.forEach.call(document.querySelectorAll("#trRunPane .tr-chart"), function (g) {
      var cc = ((r.series || {})[g.dataset.key] || {}).curve || [], pt = cc.reduce(function (b, p) { return Math.abs(p[0] - best[0]) < Math.abs(b[0] - best[0]) ? p : b; }, cc[0] || [0, 0]);
      var x = (600 * (best[0] - +g.dataset.x0) / (+g.dataset.x1 - +g.dataset.x0)).toFixed(1), line = g.querySelector("line.cur");   // HERESY 1855
      line.setAttribute("x1", x); line.setAttribute("x2", x);
      var avg = ema(cc, 0.08).filter(function (p) { return p[0] === pt[0]; })[0];
      g.querySelector(".tr-read").classList.remove("is-hint");
      g.querySelector(".tr-read").textContent = "step " + pt[0] + (r.tracks ? " · e" + (pt[0] / r.tracks).toFixed(1) : "") + " · " + pt[1].toFixed(3) + (avg ? " (avg " + avg[1].toFixed(3) + ")" : "");
    });
    return sm;
  }
  function publish(file) {
    var r = runOf(state.sel);
    api("/train/publish", { name: r.name, file: file }).then(function (d) { toast("In loras/: " + d.lora + " — ready in the Creator"); load(); }).catch(function (e) { toast(e.message, true); });
  }
  function unpublish(lora) {                        // HERESY 1496: OUT in the epoch's question is the word; no second one
    var r = runOf(state.sel);
    api("/train/unpublish", { name: r.name, lora: lora }).then(function () { toast(lora + " is out of loras/"); load(); }).catch(function (e) { toast(e.message, true); });
  }
  // HERESY 1496 (Viktor 16.10.2026: «Предлагаю вообще убрать тот блок, и по клику на эпоху выводить модальное диалоговое окно с опциями действий -
  // IN/OUT/Cancel»): an epoch's click asks what to do with it; its file to download by a right-click
  function epochOf(file) { var r = runOf(state.sel); return r ? (r.checkpoints || []).filter(function (k) { return k.file === file; })[0] : null; }
  function epochAsk(file) {
    var r = runOf(state.sel), c = epochOf(file);
    if (!r || !c) return;
    var why = candidates(r)[file], as = c.lora ? c.lora.split("/").pop().replace(/\.safetensors$/, "") : "";
    window.HeresyDialog.confirm((c.epoch != null ? tr("Epoch " + epochSaid(c.epoch)) : tr("The final file")) + " \u00b7 " + r.name + "\n\n" +
      [tr("step " + c.step), when(c.saved), gb(c.bytes)].filter(Boolean).join(" \u00b7 ") + "\n" +
      (c.lora ? tr("In loras/ now, in the Creator as " + as + ".") : tr("Not in loras/ now.")) + (why ? "\n" + tr("worth hearing first: " + why) : ""),
      { ok: tr("IN: into loras/"), alt: tr("OUT: out of loras/"), cancel: tr("Cancel") }).then(function (a) {
      if (a === true) {
        if (c.lora) return toast(tr("Already in loras/ as " + as));
        if (c.epoch == null) return toast(tr("The final file goes into loras/ by its epoch: pick the last one"), true);
        publish(file);
      } else if (a === "alt") {
        if (!c.lora) return toast(tr("Not in loras/: nothing to take out"));
        unpublish(c.lora.split("/").pop());
      }
    });
  }

  // ------------------------------------------------------------------ 1 Material
  function paintRaw() {
    var d = state.data;
    $("trRaw").innerHTML = d.raw.length ? d.raw.map(function (r) {
      return '<button type="button" class="tr-pick' + (state.raw === r.name ? " is-on" : "") + '" data-raw="' + esc(r.name) + '"><b translate="no">' + esc(r.name) + "</b><span>" +   // HERESY 1166
        "<span>" + r.tracks + " tracks</span> · <span>" + gb(r.bytes) + "</span>" + (r.captions ? " · <span>" + r.captions + " captions</span>" : "") +
        (voiceShort(r.voice) ? ' · <span translate="no">' + sexIcon(r.voice) + esc(voiceShort(r.voice)) + "</span>" : "") + "</span></button>";   // HERESY 1169, 1314
    }).join("") : '<p class="row-hint">Put a folder of songs into <code>datasets/raw/</code>, then press Reload.</p>';
  }
  function pickRaw(name) {
    var kept = (rawOf(name) || {}).voice;                 // HERESY 1169: a sex said before is said again
    state.raw = name; state.voiceMode = null; state.voiceSex = kept && kept.voice_by === "given" ? kept.voice : "";
    paintRaw(); paintPills(); paintVoice();
    $("trTracks").innerHTML = '<p class="row-hint">Reading the folder…</p>';
    api("/train/scan?name=" + encodeURIComponent(name)).then(function (d) {
      state.rows = d.tracks.map(function (t) {
        return { file: t.file, seconds: t.seconds, include: (t.seconds || 0) >= 30 || !!t.style, style: t.style || "", lyrics: t.lyrics || "", from: t.lyrics_from || "", hints: t.hints || [] };
      });
      $("trSetName").value = slug(name);
      paintTracks(); paintPills(); paintVoice();
    }).catch(function (e) { $("trTracks").innerHTML = '<p class="tr-warn">' + esc(e.message) + "</p>"; });
  }
  function paintTracks() {
    var n = state.rows.filter(function (r) { return r.include; }).length, secs = state.rows.reduce(function (s, r) { return s + (r.include ? r.seconds || 0 : 0); }, 0);
    $("trTracksNote").textContent = state.rows.length ? n + " of " + state.rows.length + " in · " + clock(secs) + " · " + state.rows.filter(function (r) { return r.include && r.lyrics; }).length + " with lyrics" : "";
    $("trTracks").innerHTML = state.rows.map(function (r, i) {
      var long = (r.seconds || 0) > 360, short = (r.seconds || 0) < 30;
      return '<div class="tr-track' + (r.include ? "" : " is-out") + '"><label class="tr-in"><input type="checkbox" data-in="' + i + '"' + (r.include ? " checked" : "") + " /></label>" +
        '<div class="tr-tbody"><div class="tr-thead"><span class="tr-file">' + esc(r.file) + '</span><span class="tr-sec' + (long || short ? " is-bad" : "") + '">' + clock(r.seconds) +
        (long ? " · long: the music half trains on the whole song" : short ? " · under 0:30" : "") + (r.lyrics ? "" : " · no lyrics") + '</span><button type="button" class="btn ghost small" data-lyr="' + i + '">' + (r.lyrics ? "Lyrics ✓" : "Lyrics") + "</button></div>" +
        '<div class="tr-edit" data-edit="' + i + '" hidden>' + (r.from ? '<span class="row-hint">lyrics from ' + esc(r.from) + (r.hints.length ? " · hints (not in the caption): " + esc(r.hints.join(" · ")) : "") + "</span>" : "") +
        '<input type="text" data-style="' + i + '" value="' + esc(r.style) + '" placeholder="a style of its own (empty: the shared one)" />' +
        '<textarea rows="8" data-lyrics="' + i + '" placeholder="[Verse]\nthe lyrics exactly as sung (empty for an instrumental)">' + esc(r.lyrics) + "</textarea></div></div></div>";
    }).join("");
  }

  // ------------------------------------------------------------------ 1b The voice
  // HERESY 1169 (Viktor 05.10.2026: «Ты можешь у Тренера прикрутить… что определяет тип голоса? Мужской или женский,
  // регистр? Нам не нужны Имена человеков, а нужны именно их тональности»): the picked folder's voice by measure
  // (lab/voice_kind.py, pYIN over up to twelve tracks). On speech: male or female and the register, and a name for the set
  // made of them, as the published voice adapters are named (voice-ru-m-baritenor-117: the language of the lyrics, the
  // middle pitch in Hz last). On singing: the range sung, the voice left to the ear. Kept beside the songs, shown on the
  // folder and beside the sets made from it. A draft by measure: the ear decides.
  function rawOf(name) { return ((state.data && state.data.raw) || []).filter(function (r) { return r.name === name; })[0] || null; }
  // HERESY 1314 (Viktor 10.10.2026: «♂ и ♀ сделай как svg — текстовые снова дают проблему со сдвигом»): male and female drawn
  // (Lucide's mars and venus, as the Creator's), the text signs sat off the line; in words where only text goes (a toast)
  function sexIcon(v) {
    var n = v && v.voice === "male" ? "mars" : v && v.voice === "female" ? "venus" : "";
    return n && window.HeresyIcons ? window.HeresyIcons.ui(n, "tr-sex") : "";
  }
  function voiceShort(v, words) {
    if (!v || v.error || !v.median_hz) return "";
    var known = v.voice === "male" || v.voice === "female", sex = known ? (words ? v.voice + " " : "") : "? ";
    if (v.mode === "sung") return sex + "sung " + (v.low || "") + "–" + (v.high || "");
    return sex + (v.register || "?") + " · " + Math.round(v.median_hz) + " Hz";
  }
  function voiceLang() {   // the lyrics' letters: Cyrillic is ru, Latin en
    var cy = 0, la = 0;
    state.rows.forEach(function (r) { var t = r.lyrics || ""; cy += (t.match(/[а-яёіїєґў]/gi) || []).length; la += (t.match(/[a-z]/gi) || []).length; });
    return cy > la * 2 ? "ru" : la > cy * 2 ? "en" : "";
  }
  function voiceName(v) {
    if (!v || v.mode === "sung" || !v.register || (v.voice !== "male" && v.voice !== "female")) return "";
    var l = voiceLang();
    return "voice-" + (l ? l + "-" : "") + (v.voice === "female" ? "f" : "m") + "-" + v.register + "-" + Math.round(v.median_hz);
  }
  function sungGuess() { return state.rows.some(function (r) { return /^\s*\[(verse|chorus|bridge|intro|outro|pre-chorus)/im.test(r.lyrics || ""); }); }
  function voiceMode() { var v = (rawOf(state.raw) || {}).voice; return state.voiceMode || (v && v.mode) || (sungGuess() ? "sung" : "speech"); }
  function paintVoice() {
    var el = $("trVoice"), v = (rawOf(state.raw) || {}).voice, j = state.voiceJob && state.voiceJob.name === state.raw ? state.voiceJob : null;
    el.hidden = !state.raw;
    if (!state.raw) return;
    var mode = voiceMode(), name = voiceName(v), running = !!j && j.status === "running", say;
    if (running) say = '<span class="row-hint">measuring the pitch of up to twelve tracks, twenty seconds of each…</span>';
    else if (j && j.status === "failed") say = '<span class="tr-warn">' + esc(j.error || "the measure failed") + "</span>";
    else if (!v || !v.median_hz) say = '<span class="row-hint">not measured yet</span>';
    else if (v.mode === "sung") say = "<b>" + esc(v.voice === "uncertain" ? "a voice the pitch alone does not name" : v.voice) + "</b> <span>· sung " + esc(v.low) + "–" + esc(v.high) +
      ", the middle " + esc(v.mid) + " (" + Math.round(v.median_hz) + " Hz)</span>";
    else if (v.voice === "uncertain") say = "<b>" + Math.round(v.median_hz) + " Hz</b> <span>· a low woman (" + esc(v.register_if_female) + ") or a high man (" +
      esc(v.register_if_male) + "): say which, and measure again</span>";
    else say = "<b>" + esc(v.voice) + " · " + esc(v.register) + "</b> <span>· speaking at " + Math.round(v.median_hz) + " Hz" + (v.mid ? " (" + esc(v.mid) + ")" : "") + ", most of it " +
      Math.round(v.p10_hz) + "–" + Math.round(v.p90_hz) + " Hz</span>" + (v.voice_by === "given" ? ' <span class="row-hint">(male or female as you said)</span>' : "");
    el.innerHTML = '<span class="tr-voice-cap">Voice</span>' + say + '<span class="spacer"></span>' +
      '<span class="tr-voice-opts" role="group" aria-label="What the folder holds">' + [["speech", "speech"], ["sung", "singing"]].map(function (m) {
        return '<button type="button" class="btn ghost small tr-chip' + (mode === m[0] ? " is-on" : "") + '" data-voice-mode="' + m[0] + '" aria-pressed="' + (mode === m[0]) + '">' + m[1] + "</button>";
      }).join("") + "</span>" +
      '<span class="tr-voice-opts" role="group" aria-label="Male or female">' + [["", "by pitch"], ["male", sexIcon({ voice: "male" }) || "male"], ["female", sexIcon({ voice: "female" }) || "female"]].map(function (s) {   // HERESY 1314: drawn
        return '<button type="button" class="btn ghost small tr-chip' + (s[0] ? " tr-chip-sex" : "") + ((state.voiceSex || "") === s[0] ? " is-on" : "") + '" data-voice-sex="' + s[0] + '" aria-pressed="' + ((state.voiceSex || "") === s[0]) + '"' +
          (s[0] ? ' aria-label="' + s[0] + '" data-tip="' + (s[0] === "male" ? "A male voice: the register named among the male ones" : "A female voice: the register named among the female ones") + '"' : "") + ">" + s[1] + "</button>";
      }).join("") + "</span>" +
      '<button type="button" class="btn ghost small" data-voice-go' + (running ? " disabled" : "") + ' data-tip="The pitch of the voiced moments, measured on this computer (pYIN); about half a minute">' +
      (v && v.median_hz ? "Measure again" : "Measure the voice") + "</button>" +
      (name ? '<button type="button" class="btn ghost small" data-voice-name="' + esc(name) + '" data-tip="The set named by its voice, as the published voice adapters are: no person\'s name">Name the set ' + esc(name) + "</button>" : "");
  }
  function measureVoice() {
    var name = state.raw;
    state.voiceJob = { name: name, status: "running" };
    paintVoice();
    api("/train/voice", { name: name, voice: state.voiceSex || "", mode: voiceMode() }).then(function poll() {
      return api("/train/voice?name=" + encodeURIComponent(name)).then(function (j) {
        if (j.status === "running") return new Promise(function (ok) { setTimeout(ok, 1500); }).then(poll);
        state.voiceJob = { name: name, status: j.status, error: j.error };
        var r = rawOf(name);
        if (r && j.kept) r.voice = j.kept;
        paintRaw(); paintSets();
        if (state.raw === name) paintVoice();
        if (j.status === "done") toast("The voice of " + name + ": " + voiceShort(j.kept, true));   // HERESY 1314: in words
        else toast(j.error || "The measure failed", true);
      });
    }).catch(function (e) { state.voiceJob = { name: name, status: "failed", error: e.message }; paintVoice(); });
  }

  // HERESY 1100: the starter sets (Viktor: "so a person can start experimenting, not beat their head against a wall").
  // Shown on a click; each fetched only after its size and terms are read and agreed; while one downloads, its
  // bytes so far; when it lands, the Material list reads it like any folder.
  var starter = { open: false, data: null, timer: 0 };
  function loadStarter() {
    return api("/train/starter").then(function (d) { starter.data = d; paintStarter(); }).catch(function (e) {
      $("trStarter").innerHTML = '<p class="tr-warn">The starter sets could not be listed: ' + esc(e.message) + "</p>";
    });
  }
  function paintStarter() {
    var d = starter.data, el = $("trStarter");
    if (!d) return;
    var busy = false, landed = false;
    el.innerHTML = '<p class="row-hint">' + esc(d.terms) + ". Downloading means accepting them.</p>" + d.sets.map(function (s) {
      var j = s.job || {}, right;
      if (s.present) right = '<span class="tr-st-in">✓ in datasets/raw/</span>';
      else if (j.status === "running") { busy = true; right = '<span class="tr-st-run">' + gb(j.got || 0) + " of " + gb(s.bytes) + "…</span>"; }
      else right = (j.status === "failed" ? '<span class="tr-warn">' + esc(j.error) + "</span>" : "") + '<button type="button" class="btn ghost small" data-starter="' + esc(s.name) + '">Download · ' + gb(s.bytes) + "</button>";
      if (j.status === "done") landed = true;
      return '<div class="tr-st-row"><div><b>' + esc(s.name) + "</b><span>" + esc(s.what) + " · " + s.tracks + " tracks</span></div>" + right + "</div>";
    }).join("");
    clearTimeout(starter.timer);
    if (busy && starter.open) starter.timer = setTimeout(loadStarter, 2000);
    if (landed && !busy) load();
  }
  function toggleStarter() {
    starter.open = !starter.open;
    $("trStarter").hidden = !starter.open;
    $("trStarterOpen").setAttribute("aria-expanded", String(starter.open));
    if (starter.open) { $("trStarter").innerHTML = '<p class="row-hint">Asking the lab…</p>'; loadStarter(); } else clearTimeout(starter.timer);
  }
  function fetchStarter(name) {
    var s = starter.data.sets.filter(function (x) { return x.name === name; })[0];
    confirmBox("Download " + s.name + "?\n\n" + s.what + ", " + s.tracks + " tracks, " + gb(s.bytes) + " from Hugging Face (" + starter.data.repo + ") into datasets/raw/" + s.name + ".\n\n" + starter.data.terms + ".", { ok: "Download, terms accepted" })
      .then(function (ok) { if (ok) return api("/train/starter", { name: name }).then(function (d) { starter.data = d; paintStarter(); }); })
      .catch(function (e) { toast(e.message, true); });
  }

  // ------------------------------------------------------------------ 2 The set
  function makeSet() {
    if (!state.raw) { showPane("raw"); return toast("Pick a raw folder first", true); }
    var style = $("trStyle").value.trim(), trigger = $("trTrigger").value.trim();
    if (!style) return toast("Write the shared style line: what is heard, in the words you will generate with", true);
    var name = slug($("trSetName").value);
    var tracks = state.rows.map(function (r) { return { file: r.file, include: r.include, style: r.style ? (trigger ? trigger + ", " : "") + r.style : "", lyrics: r.lyrics }; });
    $("trMake").disabled = true;
    api("/train/prepare", { from: state.raw, name: name, style: (trigger ? trigger + ", " : "") + style, tracks: tracks }).then(function () {
      (function poll() {
        api("/train/prepare?name=" + encodeURIComponent(name)).then(function (j) {
          $("trMakeState").textContent = j.status === "running" ? "making… " + j.done + " / " + j.total : j.status === "done" ? "made: datasets/prepared/" + name : "failed: " + (j.error || "");
          if (j.status === "running") return setTimeout(poll, 1500);
          $("trMake").disabled = false;
          if (j.status === "done") { state.set = name; keep("yue2.trSet", name); toast("The set " + name + " is made"); load().then(function () { showPane("train"); }); }
        });
      })();
    }).catch(function (e) { $("trMake").disabled = false; toast(e.message, true); });
  }

  // ------------------------------------------------------------------ 3 Train
  function paintSets() {
    var d = state.data;
    if (state.set && !(d.prepared || []).some(function (p) { return p.name === state.set; })) state.set = "";
    $("trSets").innerHTML = d.prepared.length ? d.prepared.map(function (p) {
      return '<label class="tr-setpick' + (p.name === state.set ? " is-on" : "") + '"><input type="radio" name="trSet" value="' + esc(p.name) + '"' + (p.name === state.set ? " checked" : "") + ' /><b translate="no">' + esc(p.name) + "</b><span>" +   // HERESY 1166
        "<span>" + p.tracks + " tracks</span> · <span>" + clock(p.seconds) + "</span> · <span>from</span> <span translate=\"no\">" + esc(p.from) + "</span> · <span>" + esc(p.made) + "</span>" +
        (voiceShort((rawOf(p.from) || {}).voice) ? ' · <span translate="no">' + sexIcon(rawOf(p.from).voice) + esc(voiceShort(rawOf(p.from).voice)) + "</span>" : "") + "</span></label>";   // HERESY 1169, 1314
    }).join("") : '<p class="row-hint">No set made yet: step 2.</p>';
  }
  function setKind(k) {
    state.kind = k;
    Array.prototype.forEach.call(document.querySelectorAll("#trKinds [data-kind]"), function (b) { b.classList.toggle("is-on", b.dataset.kind === k); });
    var o = KINDS[k].o;
    Object.keys(o).forEach(function (key) { var el = $("tr_" + key); if (el) el.value = o[key]; });
    $("trKindSay").textContent = KINDS[k].say;
    paintPills();
  }
  // HERESY 1076: the VRAM gate on measured peaks only; HERESY 1086: a peak counts for its own trainer only
  function gate() {
    var d = state.data;
    if (!d) return;
    var quant = $("tr_quant").value, engine = $("tr_engine").value, gbm = function (mb) { return (mb / 1024).toFixed(1) + " GB"; };
    var measured = (d.runs || []).filter(function (r) { return r.vram_peak_mb > 0 && r.options; });
    var same = measured.filter(function (r) { return r.options.quant === quant && engineOf(r) === engine; });
    var need = same.reduce(function (m, r) { return Math.max(m, r.vram_peak_mb); }, 0);
    var cards = Array.isArray(d.gpus) ? d.gpus : [], big = cards.reduce(function (m, c) { return c.total_mb > m.total_mb ? c : m; }, { total_mb: 0 });
    var free = cards.filter(function (c) { return need && c.free_mb >= need; });
    var shut = need && big.total_mb && big.total_mb < need, say;
    $("trRun").disabled = !!shut;
    // HERESY 1166: each sentence translated whole where it is made
    if (!Array.isArray(d.gpus)) say = '<span class="tr-err">' + esc(tr(d.gpus && d.gpus.error || "the cards could not be read")) + "</span>";
    else if (shut) say = '<span class="tr-err">' + esc(tr(quant + " needed " + gbm(need) + " on one card (measured); the largest here has " + gbm(big.total_mb) + (quant === "bf16" ? ": choose int8 weights" : "") + ".")) + "</span>";
    else if (need) say = esc(tr(quant + " · " + gbm(need) + " at the peak (measured).")) + " " + esc(free.length ? tr("Free enough now: " + free.map(function (c) { return "GPU" + c.index; }).join(", ")) : tr("No card has that free now (" + cards.map(function (c) { return "GPU" + c.index + " " + gbm(c.free_mb); }).join(", ") + ")"));
    else say = esc(tr(quant + " · not measured yet for this trainer: the first run measures its peak"));
    $("trRunSay").innerHTML = say;
  }
  function engineKnobs() {
    // HERESY 1420 (Viktor: «Режим можно выбрать только с AI-Toolkit. Это твоя недоработка в коде?»): Mode is the studio's own trainer's
    // too (Direct, Full, Melody); HERESY 1422: and Separate (AI-Toolkit left the studio: the studio's own is the only trainer)
    $("tr_cot").disabled = false; $("tr_sep").disabled = false;
  }
  // HERESY 1631: the cards asked last time, kept in this browser
  (function () { var c = $("tr_cards"), v = recall("yue2.trCards"); if (c && v && c.querySelector('option[value="' + v + '"]')) c.value = v; })();
  // HERESY 1832: 1815's meter and guard as a run was given them, in words (its confirmation, its card)
  function guardSaid(o) {
    var said = [];
    if (o.vram_meter) said.push(tr("each card's VRAM measured"));
    if (+o.ar_cap_tokens > 0) said.push(tr("over {0} AR tokens a track trains Direct").replace("{0}", +o.ar_cap_tokens));
    if (o.long_off_card0) said.push(tr("the shortest tracks to the first card"));
    return said.join(", ");
  }
  function startRun() {
    var set = state.set;
    if (!set) return toast("Pick a set (made in step 2)", true);
    var spec = { dataset: set, name: slug($("trRunName").value || set + "-" + state.kind), kind: state.kind, engine: $("tr_engine").value };
    ["save_epochs", "rank", "lr", "ar_loss_weight", "ar_kl_weight", "ar_lr_multiplier"].forEach(function (k) { spec[k] = parseFloat($("tr_" + k).value); });
    // HERESY 1752: the rate's fade over the run's last epochs, down to a per cent of itself (the lab and the trainer take it as a share)
    spec.lr_tail_epochs = Math.max(0, parseFloat($("tr_lr_tail_epochs") && $("tr_lr_tail_epochs").value) || 0);
    spec.lr_tail_floor = Math.max(0, Math.min(100, parseFloat($("tr_lr_tail_floor") && $("tr_lr_tail_floor").value) || 0)) / 100;
    spec.cot = $("tr_cot").value; spec.quant = $("tr_quant").value; spec.do_separation = $("tr_sep").checked;
    spec.cards = Math.max(1, parseInt($("tr_cards") && $("tr_cards").value, 10) || 1);   // HERESY 1631
    spec.vram_meter = !!($("tr_vram_meter") && $("tr_vram_meter").checked);   // HERESY 1832: 1815's meter and guard
    spec.long_off_card0 = !!($("tr_long_off_card0") && $("tr_long_off_card0").checked);
    spec.ar_cap_tokens = Math.max(0, Math.min(65536, parseInt($("tr_ar_cap_tokens") && $("tr_ar_cap_tokens").value, 10) || 0));
    var guard = guardSaid(spec);
    keep("yue2.trCards", String(spec.cards));
    if ($("tr_plateau") && $("tr_plateau").checked) { spec.val_fraction = 0.02; spec.patience = 3; }   // HERESY 1622: the plateau, then the sound half alone
    if (runOf(spec.name)) return toast("A run named " + spec.name + " is there already: give this one its own name", true);
    var tracks = ((state.data.prepared || []).filter(function (p) { return p.name === set; })[0] || {}).tracks || 1;
    var ep = Math.max(1, parseInt($("tr_epochs").value, 10) || 1);   // HERESY 1410: epochs asked, the steps the set's tracks times them
    spec.steps = ep * tracks;
    // HERESY 1091: said when the run may take the studio's own card (synthesis then waits while it trains)
    api("/gpus").catch(function () { return null; }).then(function (g) {
      var shared = g && g.roles && g.roles.train.indexOf(g.roles.studio) >= 0;
      // HERESY 1166: its sentences translated each where they are made
      return confirmBox(tr("Train " + spec.name + "?") + "\n\n" + tr(ep * tracks + " steps (" + ep + " epochs of " + tracks + " tracks) on " + set + ", rank " + spec.rank + ", AR weight " + spec.ar_loss_weight + ", " + spec.quant + " weights, " +
        (spec.engine === "ruach" ? "the studio’s trainer" : "AI-Toolkit") + "; a checkpoint every " + (spec.save_epochs > 1 ? spec.save_epochs + " epochs" : "epoch") + ", all kept.") + " " +
        tr("It takes a GPU of its own for hours" + (spec.engine === "ruach" ? "; a set without its latent cache gets one first (a second or two a track)." : "; the first run also fetches Comfy-Org’s YuE2 weights.")) +
        (shared ? "\n\n" + tr("Training may take GPU" + g.roles.studio + ", the studio’s own card: if it does, synthesis waits until the run ends (Engine → GPUs gives training another card).") : "") +
        (spec.cards > 1 ? "\n\n" + tr("On {0} cards at once: each learns its own songs, their lessons averaged every step.").replace("{0}", spec.cards) : "") +
        (spec.lr_tail_epochs > 0 ? "\n\n" + tr("The learning rate fades over the last {0} epochs to {1} % of itself.").replace("{0}", spec.lr_tail_epochs).replace("{1}", Math.round(spec.lr_tail_floor * 100)) : "") +
        (guard ? "\n\n" + tr("The meter and the guard: {0}.").replace("{0}", guard) : ""), { ok: "Start training" });   // HERESY 1752   // HERESY 1631   // 1166: "Train" is the step's name
    }).then(function (ok) {
      if (!ok) return;
      return api("/train/run", spec).then(function () { toast("Training " + spec.name); state.sel = spec.name; keep("yue2.trRun", spec.name); return load().then(function () { showPane("run"); }); });
    }).catch(function (e) { toast(e.message, true); });
  }

  // ---- HERESY 1078: the listener. Omni hears the chosen set and drafts each track's style; you correct the
  // drafts here; they go into the captions as "trigger, the track's tags. the shared line".
  function listenPanel() {
    var el = $("trListen"), set = state.set;
    if (!el) { el = document.createElement("div"); el.id = "trListen"; el.className = "tr-listen"; $("trSets").insertAdjacentElement("afterend", el); }
    if (!set) { el.innerHTML = ""; el.hidden = true; return; }
    el.hidden = false;
    api("/train/listen?name=" + encodeURIComponent(set)).then(function (d) {
      var ok = d.listeners.filter(function (l) { return l.present && l.fits; }), running = d.status === "running";
      var cap0 = (d.rows[0] && d.rows[0].caption) || "", trig = (cap0.split(",")[0] || "").trim();
      var dot = cap0.indexOf(". "), sharedNow = dot >= 0 ? cap0.slice(dot + 2) : cap0.slice(trig.length).replace(/^,\s*/, "");
      var lines = d.listeners.map(function (l) { return (l.present ? (l.fits ? "✓ " : "– ") : "✗ ") + l.what + " · " + (l.peak_mb / 1024).toFixed(1) + " GB" + (l.present ? (l.fits ? "" : " (no card big enough)") : " (not downloaded)"); });
      el.innerHTML = '<details' + (d.rows.some(function (r) { return r.tags; }) || running ? " open" : "") + '><summary><b>Listener</b> <span class="row-hint">drafts each track’s style from what it hears; a draft, read and correct it</span></summary>' +
        '<div class="tr-bar"><span class="row-hint">' + lines.map(esc).join(" · ") + (d.styles_model ? " · drafts here by " + esc(d.styles_model) : "") + (d.error ? ' <span class="tr-err">' + esc(d.error) + "</span>" : "") + "</span>" +
        '<span class="spacer"></span><button type="button" class="btn ghost small" id="trListenGo"' + (ok.length && !running ? "" : " disabled") + ">" + (running ? "Listening… " + d.done + " / " + d.total : "Listen to " + esc(set)) + "</button></div>" +
        (d.rows.some(function (r) { return r.tags; }) ? '<div class="field-row wrap"><label class="field"><span class="label">Trigger</span><input type="text" id="trLTrigger" value="' + esc(trig) + '" /></label>' +
          '<label class="field grow"><span class="label">Shared line <em>after the track’s tags</em></span><input type="text" id="trLShared" value="' + esc(sharedNow) + '" placeholder="the album’s vibe" /></label></div>' +
          '<div class="tr-ltable">' + d.rows.map(function (r) {
            return '<div class="tr-lrow"><span class="tr-file" title="' + esc(r.file) + '">' + esc(r.stem) + " · " + esc(r.file) + '</span><input type="text" data-ltag="' + esc(r.stem) + '" value="' + esc(r.tags) + '" /></div>';
          }).join("") + '</div><div class="tr-bar"><span class="spacer"></span><button type="button" class="btn primary small" id="trLApply">Write into the captions</button></div>' : "") + "</details>";
      if (running) setTimeout(function () { if (state.set === set) listenPanel(); }, 3000);
    }).catch(function (e) { el.innerHTML = '<p class="tr-err">' + esc(e.message) + "</p>"; });
  }
  function listenGo() {
    var set = state.set;
    confirmBox("Listen to " + set + "?\n\nOmni hears 120 s of every track and drafts its style. Drafts heard before are kept aside (styles.DATE.json); the captions change only when you write them.", { ok: "Listen" })
      .then(function (ok) { if (ok) return api("/train/listen", { dataset: set }).then(function () { toast("Listening to " + set); listenPanel(); }); })
      .catch(function (e) { toast(e.message, true); });
  }
  function listenApply() {
    var set = state.set, tags = {};
    Array.prototype.forEach.call(document.querySelectorAll("[data-ltag]"), function (i) { tags[i.dataset.ltag] = i.value; });
    var trigger = $("trLTrigger").value.trim(), shared = $("trLShared").value.trim();
    confirmBox("Write " + Object.keys(tags).length + " styles into the captions of " + set + "?\n\nEach first line becomes: " + (trigger ? trigger + ", " : "") + "the track’s tags" + (shared ? ". " + shared.slice(0, 80) + (shared.length > 80 ? "…" : "") : "") + "\nThe lyrics stay.", { ok: "Write" })
      .then(function (ok) { if (ok) return api("/train/styles", { dataset: set, trigger: trigger, shared: shared, tags: tags }).then(function (d) { toast(d.captions + " captions written"); listenPanel(); }); })
      .catch(function (e) { toast(e.message, true); });
  }

  // ------------------------------------------------------------------ wiring
  function init(hooks) {
    if (!$("view-train")) return;
    state.hooks = hooks;
    $("trReload").addEventListener("click", load);
    $("trPills").addEventListener("click", function (e) { var b = e.target.closest("[data-pane]"); if (b) showPane(b.dataset.pane); });
    $("view-train").addEventListener("click", function (e) {
      var t = e.target, b;
      if ((b = t.closest("[data-go]"))) return showPane(b.dataset.go);
      if (t.id === "trListenGo") return listenGo();
      if (t.id === "trLApply") return listenApply();
      if ((b = t.closest("[data-menu]"))) { e.stopPropagation(); return menu(b); }
      if (t.closest("[data-stack]")) { state.stacked = !state.stacked; keep("yue2.trStacked", state.stacked ? "1" : null); return paintRun(); }   // HERESY 1299
      if ((b = t.closest("[data-zoom]"))) {               // HERESY 1855: −, +, the whole run
        var zf = b.closest(".tr-chart"), za = +zf.dataset.x0, zb = +zf.dataset.x1, zm = (za + zb) / 2, zs = zb - za;
        if (b.dataset.zoom === "reset") { state.zoom = null; return paintRun(); }
        return b.dataset.zoom === "in" ? zoomSet(zm - zs / 4, zm + zs / 4, +zf.dataset.last) : zoomSet(zm - zs, zm + zs, +zf.dataset.last);
      }
      if ((b = t.closest("[data-act][data-run]"))) return act(b.dataset.run, b.dataset.act);
      if ((b = t.closest("[data-restore]"))) return restore(b.dataset.restore);
      if ((b = t.closest("[data-purge]"))) return purge(b.dataset.purge, b.dataset.name, b.dataset.size);
      if ((b = t.closest("[data-pickon]"))) { state.pick = { run: state.sel, files: {} }; return paintRun(); }   // HERESY 1817
      if (t.closest("[data-pickoff]")) { state.pick = null; return paintRun(); }
      if (t.closest("[data-pickgo]")) { var pr = runOf(state.sel); if (pr) pickGo(pr); return; }
      if ((b = t.closest("[data-epoch]")) && state.pick && state.pick.run === state.sel) { var pf = state.pick.files; pf[b.dataset.epoch] = !pf[b.dataset.epoch]; return paintRun(); }
      if ((b = t.closest("[data-epoch]"))) { state.epoch = b.dataset.epoch; paintRun(); return epochAsk(b.dataset.epoch); }   // HERESY 1496
      if ((b = t.closest("[data-pub]"))) return publish(b.dataset.pub);
      if ((b = t.closest("[data-unpub]"))) return unpublish(b.dataset.unpub);
      if ((b = t.closest("[data-open]"))) return openRun(b.dataset.open);
    });
    $("trRunList").addEventListener("keydown", function (e) { var c = e.target.closest(".tr-rcard[data-open]"); if (c && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openRun(c.dataset.open); } });
    $("trRunPane").addEventListener("mousemove", function (e) { if (e.target.closest(".tr-plot")) readout(e); });
    // HERESY 1855: a drag across a curve zooms both to its steps; a double-click shows the whole run; Ctrl and the wheel zoom where the pointer is
    var zd = null;
    $("trRunPane").addEventListener("mousedown", function (e) {
      var svg = e.button === 0 && e.target.closest(".tr-plot svg"), fig = svg && svg.closest(".tr-chart");
      if (!fig) return;
      e.preventDefault();
      zd = { fig: fig, box: svg.getBoundingClientRect(), x: e.clientX, x0: +fig.dataset.x0, x1: +fig.dataset.x1, last: +fig.dataset.last, band: null };
    });
    document.addEventListener("mousemove", function (e) {
      if (!zd || Math.abs(e.clientX - zd.x) < 4) return;
      var plot = zd.fig.querySelector(".tr-plot");
      if (!plot || !plot.isConnected) return;
      if (!zd.band) { zd.band = document.createElement("i"); zd.band.className = "tr-band"; plot.appendChild(zd.band); }
      var lft = Math.max(zd.box.left, Math.min(zd.x, e.clientX)), rgt = Math.min(zd.box.right, Math.max(zd.x, e.clientX)), pb = plot.getBoundingClientRect();
      zd.band.style.left = (lft - pb.left) + "px"; zd.band.style.width = Math.max(0, rgt - lft) + "px";
    });
    document.addEventListener("mouseup", function (e) {
      if (!zd) return;
      var d = zd; zd = null;
      if (d.band) d.band.remove();
      if (Math.abs(e.clientX - d.x) < 6) return;
      var at = function (cx) { return d.x0 + (d.x1 - d.x0) * Math.max(0, Math.min(1, (cx - d.box.left) / d.box.width)); };
      zoomSet(at(Math.min(d.x, e.clientX)), at(Math.max(d.x, e.clientX)), d.last);
    });
    $("trRunPane").addEventListener("dblclick", function (e) { if (e.target.closest(".tr-plot svg") && state.zoom) { state.zoom = null; paintRun(); } });
    $("trRunPane").addEventListener("wheel", function (e) {
      var svg = (e.ctrlKey || e.metaKey) && e.target.closest(".tr-plot svg"), fig = svg && svg.closest(".tr-chart");
      if (!fig) return;
      e.preventDefault();
      var box = svg.getBoundingClientRect(), a = +fig.dataset.x0, b = +fig.dataset.x1, k = e.deltaY < 0 ? 0.8 : 1.25;
      var at = a + (b - a) * Math.max(0, Math.min(1, (e.clientX - box.left) / box.width));
      zoomSet(at - (at - a) * k, at + (b - at) * k, +fig.dataset.last);
    }, { passive: false });
    // HERESY 1496: an epoch's file by a right-click (what to do with it, by a click)
    $("trRunPane").addEventListener("contextmenu", function (e) {
      var b = e.target.closest("[data-epoch]"), r = runOf(state.sel), c = b && epochOf(b.dataset.epoch);
      if (!c || !r || !window.HeresyMenu) return;
      e.preventDefault();
      window.HeresyMenu.open(e.clientX, e.clientY, [
        { label: tr("Download"), icon: "\u2193", action: function () {
          var a = document.createElement("a");
          a.href = "/lab/train/file?name=" + encodeURIComponent(r.name) + "&file=" + encodeURIComponent(c.file); a.download = "";
          document.body.appendChild(a); a.click(); a.remove();
        } },
        { label: tr("IN or OUT\u2026"), action: function () { epochAsk(c.file); } }
      ]);
    });
    $("trRunPane").addEventListener("change", function (e) { if (e.target.id === "trCmp") { state.cmp = e.target.value; paintRun(); } });
    $("trFilters").addEventListener("click", function (e) { var b = e.target.closest("[data-filter]"); if (b) { state.filter = b.dataset.filter; keep("yue2.trFilter", state.filter); paintList(); } });
    $("trStates").addEventListener("click", function (e) {   // HERESY 1659: one state at a time; the lit one again: all
      var b = e.target.closest("[data-state]");
      if (b) { state.st = state.st === b.dataset.state ? "" : b.dataset.state; keep("yue2.trState", state.st); paintList(); }
    });
    $("trSearch").addEventListener("input", function () { state.search = this.value; paintList(); });
    $("trFold").addEventListener("click", function () { state.folded = true; keep("yue2.trFolded", "1"); paintList(); });
    $("trUnfold").addEventListener("click", function () { state.folded = false; keep("yue2.trFolded", null); paintList(); });
    $("trRaw").addEventListener("click", function (e) { var b = e.target.closest("[data-raw]"); if (b) pickRaw(b.dataset.raw); });
    $("trVoice").addEventListener("click", function (e) {                 // HERESY 1169
      var b = e.target.closest("[data-voice-mode], [data-voice-sex], [data-voice-go], [data-voice-name]");
      if (!b || b.disabled) return;
      if (b.dataset.voiceMode) { state.voiceMode = b.dataset.voiceMode; return paintVoice(); }
      if (b.hasAttribute("data-voice-sex")) { state.voiceSex = b.dataset.voiceSex; return paintVoice(); }
      if (b.hasAttribute("data-voice-go")) return measureVoice();
      $("trSetName").value = b.dataset.voiceName;
      toast("The set's name: " + b.dataset.voiceName);
    });
    $("trStarterOpen").addEventListener("click", toggleStarter);
    $("trStarter").addEventListener("click", function (e) { var b = e.target.closest("[data-starter]"); if (b) fetchStarter(b.dataset.starter); });
    $("trTracks").addEventListener("change", function (e) { var i = e.target.dataset.in; if (i !== undefined) { state.rows[+i].include = e.target.checked; paintTracks(); paintPills(); } });
    $("trTracks").addEventListener("input", function (e) {
      if (e.target.dataset.style !== undefined) state.rows[+e.target.dataset.style].style = e.target.value;
      if (e.target.dataset.lyrics !== undefined) state.rows[+e.target.dataset.lyrics].lyrics = e.target.value;
    });
    $("trTracks").addEventListener("click", function (e) { var b = e.target.closest("[data-lyr]"); if (b) { var ed = document.querySelector('[data-edit="' + b.dataset.lyr + '"]'); ed.hidden = !ed.hidden; } });
    $("trAllIn").addEventListener("click", function () { state.rows.forEach(function (r) { r.include = true; }); paintTracks(); paintPills(); });
    $("trNoneIn").addEventListener("click", function () { state.rows.forEach(function (r) { r.include = false; }); paintTracks(); paintPills(); });
    $("trMake").addEventListener("click", makeSet);
    $("trSets").addEventListener("change", function (e) { if (e.target.name === "trSet") { state.set = e.target.value; keep("yue2.trSet", state.set); paintSets(); paintPills(); listenPanel(); } });
    $("trKinds").innerHTML = Object.keys(KINDS).map(function (k) { return '<button type="button" class="coll-chip" data-kind="' + k + '">' + KINDS[k].label + "</button>"; }).join("");
    $("trKinds").addEventListener("click", function (e) { var b = e.target.closest("[data-kind]"); if (b) setKind(b.dataset.kind); });
    $("tr_quant").addEventListener("change", function () { if (state.data) { warn(); gate(); paintPills(); } });
    $("tr_engine").addEventListener("change", function () {
      $("tr_quant").value = this.value === "ruach" ? "bf16" : "int8";   // Viktor: nothing quantized in our trainer
      engineKnobs(); if (state.data) { warn(); gate(); paintPills(); }
    });
    $("tr_rank").addEventListener("input", paintPills);
    $("tr_epochs").addEventListener("input", stepsSay);   // HERESY 1410
    $("trRankHow").addEventListener("click", function (e) { e.preventDefault(); if (window.HeresyGuide) window.HeresyGuide.open("lora", "Rank and the other knobs"); });
    // HERESY 1300: the AR knobs, explained with what was measured
    $("trArHow").addEventListener("click", function (e) { e.preventDefault(); if (window.HeresyGuide) window.HeresyGuide.open("lora", "The music half's three knobs"); });
    $("trRun").addEventListener("click", startRun);
    setKind("style");
    engineKnobs();
  }

  window.HeresyTrain = { init: init, reload: load, log: showLog, unlog: hideLog, goOn: goOn };   // HERESY 1298, 1300: for the suite
})();
