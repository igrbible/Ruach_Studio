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
    style:    { label: "Style", say: "genre, production, a band's sound", o: { rank: 32, steps: 1500, ar_loss_weight: 0.5, ar_kl_weight: 0.2, ar_lr_multiplier: 0.5 } },
    voice:    { label: "Voice", say: "one singer's timbre", o: { rank: 16, steps: 1500, ar_loss_weight: 0.3, ar_kl_weight: 0.3, ar_lr_multiplier: 0.5 } },
    language: { label: "Language", say: "diction of a language; exact lyrics, many voices", o: { rank: 32, steps: 3000, ar_loss_weight: 1.0, ar_kl_weight: 0.1, ar_lr_multiplier: 1.0 } },
    artist:   { label: "Artist", say: "all of it; a large, varied catalogue", o: { rank: 32, steps: 3000, ar_loss_weight: 0.7, ar_kl_weight: 0.2, ar_lr_multiplier: 0.7 } }
  };
  var PANES = ["raw", "set", "train", "run"];
  var state = {
    hooks: null, data: null, trash: [], raw: null, rows: [], kind: "style",
    set: recall("yue2.trSet") || "", pane: recall("yue2.trPane") || "", sel: recall("yue2.trRun") || "", epoch: "", cmp: "",
    filter: recall("yue2.trFilter") || "all", search: "", folded: recall("yue2.trFolded") === "1", timer: 0, first: true
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
  function isLive(r) { return r && (r.status === "running" || r.status === "stopping"); }
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
      Promise.all([api("/train/datasets"), api("/train/trash").catch(function () { return { trash: state.trash }; })]).then(function (d) {
        state.data = d[0]; state.trash = d[1].trash || [];
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
    var r = parseFloat($("tr_rank").value) || 0;
    $("trRankSay").textContent = r ? (r * 1.04 / 16).toFixed(r < 32 ? 1 : 0) + " % of what it adapts · " + Math.round(r * 1.835) + " MB a half" + (r > 64 ? " · for large many-voice sets" : "") : "";
  }
  function paintPills() {
    rankSay();
    var d = state.data || {}, r = runOf(state.sel), included = state.rows.filter(function (x) { return x.include; }).length;
    var set = (d.prepared || []).filter(function (p) { return p.name === state.set; })[0];
    // HERESY 1166: the names as typed, the words translated piece by piece
    $("trSayRaw").textContent = state.raw ? state.raw + (state.rows.length ? " · " + tr(included + " of " + state.rows.length) : "") : tr("a folder of datasets/raw/");
    $("trSaySet").textContent = set ? set.name + " · " + tr(set.tracks + " tracks") : tr("a caption for every track");
    $("trSayTrain").textContent = tr(KINDS[state.kind].label.toLowerCase()) + " · " + tr("rank " + ($("tr_rank").value || "?")) + " · " + $("tr_quant").value +
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
    if ($("tr_engine").value === "ruach") {
      var lack = [];
      if (!own[q]) lack.push("Comfy-Org's YuE2 " + q + " weights");
      if (!own.mert) lack.push("MERT-v2-FullSong");
      if (!own.head) lack.push("the realaudio tokenizer head");
      if (lack.length) html += '<p class="tr-warn">The studio’s trainer is missing ' + esc(lack.join(", ")) + ": <code>heresy/fetch-heresy.sh --trainer " + esc(q) + "</code>" +
        (own.mert ? "" : " and <code>tools/download-checkpoints.sh</code>") + ".</p>";
    } else {
      if (!d.aitk_ready) html += '<p class="tr-warn">AI-Toolkit is not found at <code>' + esc(d.aitk) + "</code>: clone ostris/ai-toolkit there (or set AITK_ROOT for the lab), or train with the studio’s own trainer.</p>";
      if (!d.head) html += '<p class="tr-warn">The realaudio tokenizer is missing from <code>checkpoints/yue2-mothersuperior-realaudio-tokenizer-v4/</code>.</p>';
    }
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
        '<span class="tr-lname"><i class="tr-pulse"></i><b>' + esc(r.name) + "</b><em>" + esc(r.kind || "") + " · " + (engineOf(r) === "ruach" ? "Ruach" : "AI-Toolkit") + " · GPU" + esc(r.gpu) + "</em></span>" +
        '<span class="tr-lbar"><i style="width:' + pct.toFixed(1) + '%"></i></span>' +
        '<span class="tr-lnums mono">' + pct.toFixed(0) + " % · " + (r.step || 0) + "/" + (r.steps || "?") +
          (r.tracks ? " · e" + ((r.step || 0) / r.tracks).toFixed(1) + "/" + Math.round(epochs(r)) : "") +
          (r.eta_s != null ? " · " + span(r.eta_s) + " left" : "") + (ser.sec_per_step ? " · " + ser.sec_per_step + " s/step" : "") +
          (loss != null ? " · flow " + Number(loss).toFixed(3) : "") + (ar != null ? " · ar_ce " + Number(ar).toFixed(2) : "") + "</span></button>";
    }).join("");
  }

  // ------------------------------------------------------------------ the column of runs
  function inFilter(r) {
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
    var ep = r.tracks ? "e" + Math.floor((r.step || 0) / r.tracks) + "/" + Math.round(epochs(r)) : (r.step || 0) + "/" + (r.steps || "?");
    return '<article class="tr-rcard' + (live ? " is-running" : "") + (r.name === state.sel ? " is-selected" : "") + (r.archived ? " is-archived" : "") + '" data-open="' + esc(r.name) + '" tabindex="0">' +
      '<div class="tr-rtitle" translate="no">' + esc(r.name) + "</div>" +
      '<div class="tr-rsub">' + rsub([r.kind, r.dataset, r.tracks ? r.tracks + " tracks" : ""]) + "</div>" +
      spark(r) +
      (live || (r.status !== "done" && pct > 0) ? '<div class="tr-rbar"><i style="width:' + pct.toFixed(1) + '%"></i></div>' : "") +
      '<div class="take-foot"><span class="tag tr-st is-' + esc(r.status) + '">' + esc(r.status) + "</span>" +
        '<span class="tag">' + (engineOf(r) === "ruach" ? "Ruach" : "AITK") + "</span>" +
        "<span>" + ep + "</span>" + (r.loras && r.loras.length ? '<span data-tip="In loras/, ready in the Creator">' + r.loras.length + " in loras/</span>" : "") +
        "<span>" + esc(ago(r.started)) + "</span></div>" +
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
      '<button type="button" role="menuitem" data-act="' + (r.archived ? "unarchive" : "archive") + '">' + (r.archived ? "Out of the archive" : "Archive") + "</button>" +
      (isLive(r) ? '<button type="button" role="menuitem" class="danger" data-act="stop">Stop…</button>'
                 : '<button type="button" role="menuitem" class="danger" data-act="delete">Delete…</button>');
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
    }
    logDock.hidden = false;
    logDock.dataset.run = name;
    logDock.querySelector(".tr-logdock-name").textContent = name;
    logDock.querySelector(".tr-logdock-dl").href = "/lab/train/log?name=" + encodeURIComponent(name);
    logDock.querySelector(".tr-logdock-dl").setAttribute("download", name + ".log");
    pullLog();
  }
  function hideLog() { if (logDock) { logDock.hidden = true; clearTimeout(logDock.timer); } }
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
  function act(name, what) {
    if (what === "log") return showLog(name);        // HERESY 1167
    if (what === "open") return openRun(name);
    if (what === "archive" || what === "unarchive")
      return api("/train/archive", { name: name, archived: what === "archive" }).then(function () { toast(what === "archive" ? name + " is archived" : name + " is back from the archive"); load(); }).catch(function (e) { toast(e.message, true); });
    if (what === "stop") return stopRun(name);
    if (what === "delete") return deleteRun(name);
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
  // a curve over the steps: the raw points faint, their running average bold, the epochs as ticks (a filled one
  // is in loras/), the chosen epoch as a line; y labelled at its top, middle and bottom
  // HERESY 1093 (Viktor, 02.10.2026): the epochs worth hearing first, read off the curves (a guess; the ear
  // decides). At each saved epoch: the averaged sound loss (flow) and music loss (ar_ce) there. A candidate has
  // the sound half settled (its average within 15 % of the run's span above its floor, the first fast fall left
  // out) and the music half not yet knowing the songs by heart (ar_ce 0.3 or more). Lit: the first such epoch,
  // the one with the lowest sound loss, and the last before the music half learns the songs by heart.
  function candidates(r) {
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
  function chart(key, ser, r, title, say) {
    var s = ser[key];
    if (!s || !s.curve || s.curve.length < 2) return "";
    var other = runOf(state.cmp), oc = other && other !== r ? (((other.series || {})[key] || {}).curve || []) : [];
    var c = s.curve, W = 600, H = 150, L = 0, lo = Infinity, hi = -Infinity, last = Math.max(r.steps || 0, c[c.length - 1][0], other ? other.steps || 0 : 0) || 1;
    c.concat(oc.length > 1 ? ema(oc, 0.08) : []).forEach(function (p) { lo = Math.min(lo, p[1]); hi = Math.max(hi, p[1]); });
    var pad = (hi - lo) * 0.06 || 0.05; lo -= pad; hi += pad;
    var x = function (st) { return L + (W - L) * st / last; }, y = function (v) { return H - 6 - (H - 14) * (v - lo) / (hi - lo); };
    var path = function (pts) { return pts.map(function (p, i) { return (i ? "L" : "M") + x(p[0]).toFixed(1) + " " + y(p[1]).toFixed(1); }).join(" "); };
    var grid = [0, 0.5, 1].map(function (f) { var v = lo + (hi - lo) * (1 - f), yy = y(v); return '<line class="g" x1="0" x2="' + W + '" y1="' + yy.toFixed(1) + '" y2="' + yy.toFixed(1) + '"/>'; }).join("");
    var cand = candidates(r);
    var ticks = (r.checkpoints || []).filter(function (k) { return k.step; }).map(function (k) {
      var xx = x(k.step).toFixed(1);
      return '<line class="t' + (k.lora ? " on" : "") + (cand[k.file] ? " cand" : "") + (k.file === state.epoch ? " sel" : "") + '" x1="' + xx + '" x2="' + xx + '" y1="' + (k.file === state.epoch ? 0 : cand[k.file] ? H - 18 : H - 6) + '" y2="' + H + '"/>';
    }).join("");
    var labels = [hi, (hi + lo) / 2, lo].map(function (v, i) { return '<span style="top:' + [2, 46, 90][i] + '%">' + v.toFixed(v < 10 ? 3 : 2) + "</span>"; }).join("");
    return '<figure class="tr-chart" data-key="' + key + '" data-last="' + last + '" data-lo="' + lo + '" data-hi="' + hi + '">' +
      '<figcaption><b>' + title + '</b><span class="mono">' + s.first.toFixed(3) + " → " + s.last.toFixed(3) + " · min " + s.min.toFixed(3) + '</span><span class="tr-read mono is-hint">over the curve: the step, its epoch, the value there</span></figcaption>' +
      '<div class="tr-plot"><div class="tr-ylab mono">' + labels + "</div>" +
      '<svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none">' + grid + ticks +
        '<path class="raw" d="' + path(c) + '"/>' + (oc.length > 1 ? '<path class="cmp" d="' + path(ema(oc, 0.08)) + '"/>' : "") +
        '<path class="avg" d="' + path(ema(c, 0.08)) + '"/><line class="cur" x1="-10" x2="-10" y1="0" y2="' + H + '"/></svg></div>' +
      (oc.length > 1 ? '<div class="tr-cmpkey"><span class="k-this"></span>' + esc(r.name) + '<span class="k-cmp"></span>' + esc(other.name) + " (its average, dashed)</div>" : "") +
      '<p class="tr-say">' + say + "</p></figure>";
  }
  function paintRun() {
    var el = $("trRunPane"), r = runOf(state.sel), facts = el.querySelector(".tr-facts"), factsOpen = !!(facts && facts.open);
    if (!r) { el.innerHTML = '<p class="row-hint">No run chosen: pick one in the column on the right, or start one in step 3.</p>'; return; }
    var o = r.options || {}, ser = r.series || {}, live = isLive(r);
    var cks = (r.checkpoints || []).slice().sort(function (a, b) {        // by step; the run's final file after its last numbered one
      return (a.step || 0) - (b.step || 0) || (/_\d{6,}\.safetensors$/.test(b.file) ? 1 : 0) - (/_\d{6,}\.safetensors$/.test(a.file) ? 1 : 0);
    });
    var pct = r.steps ? 100 * (r.step || 0) / r.steps : 0, took = (r.ended || (live ? Date.now() / 1000 : r.started)) - r.started;
    var ar = ser.ar_ce ? ser.ar_ce.last : r.ar_ce, memo = ar != null && ar < 0.3;
    var bytes = cks.reduce(function (s, c) { return s + (c.bytes || 0); }, 0);
    var tile = function (k, v, hint) { return '<div class="tr-tile"' + (hint ? ' data-tip="' + esc(hint) + '"' : "") + "><span>" + k + "</span><b>" + v + "</b></div>"; };
    var pick = cks.filter(function (c) { return c.file === state.epoch; })[0], cand = candidates(r);
    el.innerHTML =
      '<div class="tr-rhead"><div class="tr-rname"><b translate="no">' + esc(r.name) + '</b><span class="tag tr-st is-' + esc(r.status) + '">' + esc(r.status) + "</span>" +
        (r.kind ? '<span class="tag">' + esc(r.kind) + "</span>" : "") + '<span class="tag">' + (engineOf(r) === "ruach" ? "Ruach trainer" : "AI-Toolkit") + "</span>" +
        (r.archived ? '<span class="tag">archived</span>' : "") + "</div>" +
        '<div class="tr-racts"><select class="tr-cmp" id="trCmp" aria-label="Compare with another run" data-tip="Another run\u2019s curves, dashed, on the same steps">' +
          '<option value="">Compare with\u2026</option>' + runs().filter(function (x) { return x.name !== r.name && x.series && x.series.flow; })
            .sort(function (x, y) { return (y.dataset === r.dataset) - (x.dataset === r.dataset); })
            .map(function (x) { return '<option value="' + esc(x.name) + '"' + (x.name === state.cmp ? " selected" : "") + ">" + esc(x.name) + (x.dataset === r.dataset ? " \u00b7 same set" : "") + "</option>"; }).join("") + "</select>" +
          (live ? '<button type="button" class="btn ghost small danger" data-act="stop" data-run="' + esc(r.name) + '">Stop</button>' : "") +
          '<button type="button" class="btn ghost small" data-act="log" data-run="' + esc(r.name) + '">The log</button>' +   // HERESY 1167
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
        tile("GPU", r.gpu != null ? "GPU" + esc(r.gpu) : "—") +
      "</div>" +
      (memo ? '<p class="tr-err">ar_ce ' + Number(ar).toFixed(3) + ": the music half is learning the songs by heart; an earlier epoch may be the better adapter.</p>" : "") +
      (ser.error ? '<p class="tr-err">' + esc(ser.error) + "</p>" : "") + (r.error ? '<p class="tr-err">' + esc(r.error) + "</p>" : "") +
      '<div class="tr-charts">' +
        chart(ser.flow ? "flow" : "loss", ser, r, ser.flow ? "Sound half · flow loss (NAR)" : "All together · loss",
          "How well the sound half predicts the noise it has to take away. Lower is better. It jumps from step to step with the random noise level of each step: read the bold line, the running average.") +
        chart("ar_ce", ser, r, "Music half · ar_ce (AR)",
          "How well the music half predicts the song’s own tokens. Lower is better; close to 0 it knows the songs by heart, and an earlier epoch is then the better adapter.") +
      "</div>" +
      (cks.length ? '<div class="tr-epochs"><div class="tr-ehead"><span class="label">Epochs · ' + cks.length + " saved · " + gb(bytes) + "</span>" +
          '<span class="row-hint">pick one: into the Creator’s LoRAs, out of them, or as a file \u00b7 <span class="tr-key-cand"></span> worth hearing first, read off the curves (a guess: the ear decides) \u00b7 \u2713 in loras/</span></div>' +
        '<div class="tr-echips">' + cks.map(function (c) {
          var why = cand[c.file];
          return '<button type="button" class="coll-chip' + (c.lora ? " is-in" : "") + (why ? " is-cand" : "") + (c.file === state.epoch ? " is-on" : "") + '" data-epoch="' + esc(c.file) + '" data-tip="' + esc([tr("step " + c.step), when(c.saved), c.lora ? tr("in loras/") : "", why ? tr("worth hearing first: " + why) : ""].filter(Boolean).join(" · ")) + '">' + (c.epoch != null ? "e" + Math.round(c.epoch) : "final") + (c.lora ? " ✓" : "") + "</button>";
        }).join("") + "</div>" +
        (pick ? '<div class="tr-eact"><span><b>' + (pick.epoch != null ? "Epoch " + Math.round(pick.epoch) : "The final file") + "</b> · <span>step " + pick.step + "</span> · <span>" + esc(when(pick.saved)) + "</span> · <span>" + gb(pick.bytes) + "</span>" +   // HERESY 1166
            (pick.lora ? ' · <span>in the Creator as</span> <code>' + esc(pick.lora.split("/").pop().replace(/\.safetensors$/, "")) + "</code>" : "") +
            (cand[pick.file] ? ' · <span class="tr-candsay">worth hearing first: ' + esc(cand[pick.file]) + "</span>" : "") + "</span>" +
            '<span class="spacer"></span>' +
            (pick.lora ? '<button type="button" class="btn ghost small" data-unpub="' + esc(pick.lora.split("/").pop()) + '">Out of loras/</button>'
                       : (pick.epoch != null ? '<button type="button" class="btn small primary" data-pub="' + esc(pick.file) + '">Into loras/ → the Creator</button>' : "")) +
            '<a class="btn ghost small" download href="/lab/train/file?name=' + encodeURIComponent(r.name) + "&file=" + encodeURIComponent(pick.file) + '">Download</a></div>' : "") +
        "</div>" : "") +
      '<details class="tr-facts"><summary>What it was given</summary><div class="tr-fgrid">' +
        "<span><em>set</em> <span translate=\"no\">" + esc(r.dataset) + "</span>" + (r.tracks ? " · <span>" + r.tracks + " tracks</span>" : "") + "</span>" +   // HERESY 1166
        "<span><em>rank</em> " + esc(o.rank) + " · lr " + esc(o.lr) + "</span>" +
        "<span><em>music half</em> AR " + esc(o.ar_loss_weight) + " · KL " + esc(o.ar_kl_weight) + " · <span>speed ×" + esc(o.ar_lr_multiplier) + "</span></span>" +
        "<span><em>mode</em> <span>" + esc(o.cot) + "</span> · " + esc(o.quant) + (o.do_separation ? " · <span>separated</span>" : "") + "</span>" +
        "<span><em>window</em> " + Math.round((o.train_window_frames || 0) / 25) + " s</span>" +
        "<span><em>started</em> " + esc(when(r.started)) + "</span>" +
      "</div></details>";
    if (factsOpen) el.querySelector(".tr-facts").open = true;          // a repaint every few seconds keeps what you opened
  }
  // the reading under the cursor: the step, its epoch and both values there
  function readout(e) {
    var fig = e.target.closest(".tr-chart"), r = runOf(state.sel);
    if (!fig || !r) return;
    var svg = fig.querySelector("svg"), box = svg.getBoundingClientRect(), last = +fig.dataset.last;
    var f = Math.max(0, Math.min(1, (e.clientX - box.left) / box.width)), step = f * last;
    var c = ((r.series || {})[fig.dataset.key] || {}).curve || [];
    if (!c.length) return;
    var best = c.reduce(function (b, p) { return Math.abs(p[0] - step) < Math.abs(b[0] - step) ? p : b; }, c[0]);
    var sm = ema(c, 0.08).filter(function (p) { return p[0] === best[0]; })[0];
    Array.prototype.forEach.call(document.querySelectorAll("#trRunPane .tr-chart"), function (g) {
      var cc = ((r.series || {})[g.dataset.key] || {}).curve || [], pt = cc.reduce(function (b, p) { return Math.abs(p[0] - best[0]) < Math.abs(b[0] - best[0]) ? p : b; }, cc[0] || [0, 0]);
      var x = (600 * best[0] / +g.dataset.last).toFixed(1), line = g.querySelector("line.cur");
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
  function unpublish(lora) {
    var r = runOf(state.sel);
    confirmBox("Take " + lora + " out of loras/?\n\nIt leaves Create’s LoRAs; the checkpoint stays in the run, and a click puts it back.", { ok: "Take it out" })
      .then(function (ok) { if (ok) return api("/train/unpublish", { name: r.name, lora: lora }).then(function () { toast(lora + " is out of loras/"); load(); }); })
      .catch(function (e) { toast(e.message, true); });
  }

  // ------------------------------------------------------------------ 1 Material
  function paintRaw() {
    var d = state.data;
    $("trRaw").innerHTML = d.raw.length ? d.raw.map(function (r) {
      return '<button type="button" class="tr-pick' + (state.raw === r.name ? " is-on" : "") + '" data-raw="' + esc(r.name) + '"><b translate="no">' + esc(r.name) + "</b><span>" +   // HERESY 1166
        "<span>" + r.tracks + " tracks</span> · <span>" + gb(r.bytes) + "</span>" + (r.captions ? " · <span>" + r.captions + " captions</span>" : "") + "</span></button>";
    }).join("") : '<p class="row-hint">Put a folder of songs into <code>datasets/raw/</code>, then press Reload.</p>';
  }
  function pickRaw(name) {
    state.raw = name; paintRaw(); paintPills();
    $("trTracks").innerHTML = '<p class="row-hint">Reading the folder…</p>';
    api("/train/scan?name=" + encodeURIComponent(name)).then(function (d) {
      state.rows = d.tracks.map(function (t) {
        return { file: t.file, seconds: t.seconds, include: (t.seconds || 0) >= 30 || !!t.style, style: t.style || "", lyrics: t.lyrics || "", from: t.lyrics_from || "", hints: t.hints || [] };
      });
      $("trSetName").value = slug(name);
      paintTracks(); paintPills();
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
        "<span>" + p.tracks + " tracks</span> · <span>" + clock(p.seconds) + "</span> · <span>from</span> <span translate=\"no\">" + esc(p.from) + "</span> · <span>" + esc(p.made) + "</span></span></label>";
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
    var own = $("tr_engine").value === "ruach";
    if (own) { $("tr_cot").value = "off"; $("tr_sep").checked = false; }
    $("tr_cot").disabled = own; $("tr_sep").disabled = own;
  }
  function startRun() {
    var set = state.set;
    if (!set) return toast("Pick a set (made in step 2)", true);
    var spec = { dataset: set, name: slug($("trRunName").value || set + "-" + state.kind), kind: state.kind, engine: $("tr_engine").value };
    ["steps", "save_epochs", "rank", "lr", "ar_loss_weight", "ar_kl_weight", "ar_lr_multiplier"].forEach(function (k) { spec[k] = parseFloat($("tr_" + k).value); });
    spec.cot = $("tr_cot").value; spec.quant = $("tr_quant").value; spec.do_separation = $("tr_sep").checked;
    if (runOf(spec.name)) return toast("A run named " + spec.name + " is there already: give this one its own name", true);
    var tracks = ((state.data.prepared || []).filter(function (p) { return p.name === set; })[0] || {}).tracks || 1;
    var ep = Math.ceil(spec.steps / tracks);
    // HERESY 1091: said when the run may take the studio's own card (synthesis then waits while it trains)
    api("/gpus").catch(function () { return null; }).then(function (g) {
      var shared = g && g.roles && g.roles.train.indexOf(g.roles.studio) >= 0;
      // HERESY 1166: its sentences translated each where they are made
      return confirmBox(tr("Train " + spec.name + "?") + "\n\n" + tr(ep * tracks + " steps (" + ep + " epochs of " + tracks + " tracks) on " + set + ", rank " + spec.rank + ", AR weight " + spec.ar_loss_weight + ", " + spec.quant + " weights, " +
        (spec.engine === "ruach" ? "the studio’s trainer" : "AI-Toolkit") + "; a checkpoint every " + (spec.save_epochs > 1 ? spec.save_epochs + " epochs" : "epoch") + ", all kept.") + " " +
        tr("It takes a GPU of its own for hours" + (spec.engine === "ruach" ? "; a set without its latent cache gets one first (a second or two a track)." : "; the first run also fetches Comfy-Org’s YuE2 weights.")) +
        (shared ? "\n\n" + tr("Training may take GPU" + g.roles.studio + ", the studio’s own card: if it does, synthesis waits until the run ends (Engine → GPUs gives training another card).") : ""), { ok: "Start training" });   // 1166: "Train" is the step's name
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
      if ((b = t.closest("[data-act][data-run]"))) return act(b.dataset.run, b.dataset.act);
      if ((b = t.closest("[data-restore]"))) return restore(b.dataset.restore);
      if ((b = t.closest("[data-purge]"))) return purge(b.dataset.purge, b.dataset.name, b.dataset.size);
      if ((b = t.closest("[data-epoch]"))) { state.epoch = state.epoch === b.dataset.epoch ? "" : b.dataset.epoch; return paintRun(); }
      if ((b = t.closest("[data-pub]"))) return publish(b.dataset.pub);
      if ((b = t.closest("[data-unpub]"))) return unpublish(b.dataset.unpub);
      if ((b = t.closest("[data-open]"))) return openRun(b.dataset.open);
    });
    $("trRunList").addEventListener("keydown", function (e) { var c = e.target.closest(".tr-rcard[data-open]"); if (c && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openRun(c.dataset.open); } });
    $("trRunPane").addEventListener("mousemove", function (e) { if (e.target.closest(".tr-plot")) readout(e); });
    $("trRunPane").addEventListener("change", function (e) { if (e.target.id === "trCmp") { state.cmp = e.target.value; paintRun(); } });
    $("trFilters").addEventListener("click", function (e) { var b = e.target.closest("[data-filter]"); if (b) { state.filter = b.dataset.filter; keep("yue2.trFilter", state.filter); paintList(); } });
    $("trSearch").addEventListener("input", function () { state.search = this.value; paintList(); });
    $("trFold").addEventListener("click", function () { state.folded = true; keep("yue2.trFolded", "1"); paintList(); });
    $("trUnfold").addEventListener("click", function () { state.folded = false; keep("yue2.trFolded", null); paintList(); });
    $("trRaw").addEventListener("click", function (e) { var b = e.target.closest("[data-raw]"); if (b) pickRaw(b.dataset.raw); });
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
    $("trRankHow").addEventListener("click", function (e) { e.preventDefault(); if (window.HeresyGuide) window.HeresyGuide.open("lora", "Rank and the other knobs"); });
    $("trRun").addEventListener("click", startRun);
    setKind("style");
    engineKnobs();
  }

  window.HeresyTrain = { init: init, reload: load };
})();
