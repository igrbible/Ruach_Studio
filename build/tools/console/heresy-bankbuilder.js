// HERESY 2031: the Bank Builder in the Trainer (Viktor 02.11.2026: «когда обработаешь их Слушателем, с нотами и остальным как у нас заведено,
// можно из них две банки SFZ смастерить в Тренере, и проверим сразу и Тренера и дорожку SFZ DAW»). The Trainer makes a LoRA or an SFZ bank: the
// head's switch shows one or the other. A bank in four steps (lab/bankbuilder.py): the material (a folder of datasets/raw/ and the instrument),
// the clean (every second of every file measured and heard; a strip a file, a click listens there), the notes (by key, each to be heard and
// picked), the bank (round robins, layers, built into banks/ where the DAW's Layer finds it).
(function () {
  "use strict";
  var state = { mode: recall("yue2.trMode") || "lora", works: [], sel: recall("yue2.bbSel") || "", work: null, pane: recall("yue2.bbPane") || "material",
                raw: [], strips: {}, key: null, notes: [], picks: {}, src: "mix", timer: null, workTimer: null, audio: null };
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function recall(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function keep(k, v) { try { if (v == null || v === "") localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* private window */ } }
  function tr(s) { return window.RuachI18n ? window.RuachI18n.t(s) : s; }
  function toast(t, bad) { if (window.HeresyToast) window.HeresyToast(t, bad ? "bad" : ""); }
  function api(path, body) {
    var opt = body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
    return fetch("/lab" + path, opt).then(function (r) {
      return r.json().then(function (b) { if (!r.ok && r.status !== 202) { var e = new Error(b.error || r.status); e.body = b; e.status = r.status; throw e; } return b; });
    });
  }
  function clock(s) { s = Math.round(s || 0); var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return (h ? h + ":" + ("0" + m).slice(-2) : m) + ":" + ("0" + (s % 60)).slice(-2); }
  var NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  function noteName(k) { k = +k; return NAMES[((k % 12) + 12) % 12] + (Math.floor(k / 12) - 1); }
  var KINDS = { w: "wind alone", o: "wind over a bed", b: "a bed", v: "a voice", s: "silence" };

  // ------------------------------------------------------------------ the switch
  function setMode(m) {
    state.mode = m === "banks" ? "banks" : "lora"; keep("yue2.trMode", state.mode);
    var lora = $("trLayout"), bb = $("bbView");
    if (!lora || !bb) return;
    lora.hidden = state.mode === "banks"; bb.hidden = state.mode !== "banks";
    var notes = document.querySelectorAll("#view-train > .col-head .col-note");
    Array.prototype.forEach.call(notes, function (n) { n.hidden = n.classList.contains("bb-note") ? state.mode !== "banks" : state.mode === "banks"; });
    Array.prototype.forEach.call(document.querySelectorAll("#view-train [data-trmode]"), function (b) {
      var on = b.dataset.trmode === state.mode;
      b.classList.toggle("is-on", on); b.setAttribute("aria-selected", on ? "true" : "false");
    });
    if (state.mode === "banks") load();
  }

  // ------------------------------------------------------------------ loading
  function visible() { return document.body.dataset.tab === "train" && state.mode === "banks" && !document.hidden; }
  function running() { return state.works.some(function (w) { return w.job && w.job.status === "running"; }); }
  function load() {
    // the folders apart and once a visit: /train/datasets sizes every folder of datasets/raw (tens of thousands of tracks) and answers late
    if (!state.rawAsked) {
      state.rawAsked = true;
      api("/train/datasets").then(function (d) { state.raw = (d.raw || []).map(function (r) { return r.name; }); state.rawDone = true; paintMaterial(); })
        .catch(function () { state.rawAsked = false; });
    }
    return api("/banks/builder").then(function (d) {
      state.works = d.works || []; state.calls = d.calls || {}; state.ranges = d.ranges || {};
      if (state.sel && !state.works.some(function (w) { return w.slug === state.sel; })) state.sel = "";
      paintList(); paintMaterial();
      if (state.sel) return loadWork(); paintPane();
    }).catch(function (e) {
      $("bbList").innerHTML = '<p class="tr-warn">' + esc(tr("The lab does not answer: {0}").replace("{0}", e.message)) + "</p>";
    }).then(schedule);
  }
  function schedule() {
    clearTimeout(state.timer);
    state.timer = setTimeout(function () { if (visible()) load(); else schedule(); }, running() ? 5000 : 30000);
  }
  function loadWork() {
    var w = workOf(state.sel);
    if (!w) { state.work = null; paintPane(); return Promise.resolve(); }
    return api("/banks/builder/work?bank=" + encodeURIComponent(w.bank)).then(function (d) {
      var was = state.work && state.work.progress && state.work.progress.status;
      state.work = d;
      if (was === "running" && d.progress && d.progress.status !== "running") {
        var ok = d.progress.status === "done";
        toast(ok ? tr("{0}: the {1} step is done").replace("{0}", d.plan.bank).replace("{1}", tr(d.progress.step || "")) :
          tr("{0}: the {1} step failed").replace("{0}", d.plan.bank).replace("{1}", tr(d.progress.step || "")) + (d.progress.error ? ": " + d.progress.error : ""), !ok);
        if (window.RuachChime) window.RuachChime.ring(ok);
        state.strips = {};
        if (ok && d.progress.step === "clean") showPane("notes");
        if (ok && d.progress.step === "notes") { state.key = null; state.notes = []; }
        if (ok && d.progress.step === "build") showPane("bank");
      }
      paintMaterial(); paintPane();
    }).catch(function (e) { state.work = null; $("bbFiles").innerHTML = '<p class="tr-warn">' + esc(e.message) + "</p>"; });
  }
  function workOf(slug) { return state.works.filter(function (w) { return w.slug === slug; })[0] || null; }

  // ------------------------------------------------------------------ the list of banks in the making
  function paintList() {
    $("bbCount").textContent = state.works.length;
    $("bbList").innerHTML = state.works.length ? state.works.map(function (w) {
      var p = w.progress || {}, run = w.job && w.job.status === "running";
      var said = run ? tr("{0}: {1} %").replace("{0}", tr(p.step || "")).replace("{1}", Math.round((p.progress || 0) * 100)) :
        w.built ? tr("built") : w.notes ? tr("notes found") : p.status === "failed" ? tr("failed") : p.step === "clean" && p.status === "done" ? tr("cleaned") : tr("not cleaned yet");
      return '<button type="button" class="tr-rcard bb-card' + (w.slug === state.sel ? " is-on" : "") + '" data-bb="' + esc(w.slug) + '">' +
        '<b translate="no">' + esc(w.bank) + "</b><span class=\"bb-card-say\"><span translate=\"no\">" + esc(w.instrument || "") + "</span> · <span>" +
        esc(w.mode === "blasts" ? tr("calls") : tr("notes")) + "</span> · <span>" + esc(said) + "</span></span>" +
        (run ? '<span class="bb-bar"><i style="width:' + Math.round((p.progress || 0) * 100) + '%"></i></span>' : "") + "</button>";
    }).join("") : '<p class="row-hint">' + esc(tr("No bank in the making yet: the first step starts one.")) + "</p>";
  }

  // ------------------------------------------------------------------ the panes
  function showPane(p) {
    state.pane = p; keep("yue2.bbPane", p);
    Array.prototype.forEach.call(document.querySelectorAll("#bbView .bb-pane"), function (el) { el.classList.toggle("is-on", el.dataset.bbpane === p); });
    Array.prototype.forEach.call(document.querySelectorAll("#bbPills [data-bbpane]"), function (b) {
      b.classList.toggle("is-active", b.dataset.bbpane === p); b.setAttribute("aria-selected", b.dataset.bbpane === p ? "true" : "false");
    });
    paintPane();
  }
  function paintPane() {
    var w = state.work, prog = (w && w.progress) || {};
    var done = { material: !!w, clean: !!(w && w.files.some(function (f) { return f.clean; })), notes: !!(w && w.notes), bank: !!(w && w.built) };
    Array.prototype.forEach.call(document.querySelectorAll("#bbPills [data-bbpane]"), function (b) { b.classList.toggle("is-done", !!done[b.dataset.bbpane]); });
    Array.prototype.forEach.call(document.querySelectorAll("#bbView .bb-pane"), function (el) { el.classList.toggle("is-on", el.dataset.bbpane === state.pane); });
    Array.prototype.forEach.call(document.querySelectorAll("#bbPills [data-bbpane]"), function (b) { b.classList.toggle("is-active", b.dataset.bbpane === state.pane); });
    var run = prog.status === "running" && w && w.job && w.job.status === "running";
    $("bbClean").disabled = run; $("bbNotes").disabled = run || !done.clean; $("bbBuild").disabled = run || !done.notes;
    $("bbStop").hidden = !run;
    if (state.pane === "clean") paintClean();
    if (state.pane === "notes") paintNotes();
    if (state.pane === "bank") paintBank();
    clearTimeout(state.workTimer);
    if (run) state.workTimer = setTimeout(function () { if (visible()) loadWork(); }, 5000);
  }
  function paintMaterial() {
    var sel = $("bbFolder"), had = sel.value;
    sel.innerHTML = state.raw.map(function (n) { return '<option value="' + esc(n) + '" translate="no">' + esc(n) + "</option>"; }).join("") ||
      '<option value="">' + esc(state.rawAsked && !state.rawDone ? tr("Reading the folders…") : tr("no folder in datasets/raw/")) + "</option>";
    var w = state.work && state.work.plan;
    if (w && state.raw.indexOf(w.folder) >= 0) sel.value = w.folder; else if (had) sel.value = had;
    if (w) { $("bbName").value = w.bank; $("bbInst").value = w.instrument || ""; $("bbMode").value = w.mode || "chromatic"; }
  }
  function progressLine(p) {
    if (!p || !p.step) return "";
    var pct = Math.round((p.progress || 0) * 100);
    var head = p.status === "running" ? tr("{0}: {1} %").replace("{0}", tr(p.step)).replace("{1}", pct) : p.status === "failed" ? tr("{0} failed: {1}").replace("{0}", tr(p.step)).replace("{1}", p.error || "") :
      p.status === "stopped" ? tr("{0}: stopped").replace("{0}", tr(p.step)) : tr("{0}: done").replace("{0}", tr(p.step));
    return '<div class="bb-prog"><span>' + esc(head) + "</span>" + (p.status === "running" && p.current ? ' · <span translate="no">' + esc(p.current) + "</span>" : "") +
      (p.status === "running" && p.listening ? " · <span>" + esc(tr("the Listener: {0}").replace("{0}", p.listening)) + "</span>" : "") +
      (p.said ? " · <span>" + esc(p.said) + "</span>" : "") +
      (p.status === "running" ? '<span class="bb-bar"><i style="width:' + pct + '%"></i></span>' : "") + "</div>";
  }

  // ------------------------------------------------------------------ clean
  function paintClean() {
    var w = state.work;
    if (!w) { $("bbProgress").innerHTML = ""; $("bbFiles").innerHTML = '<p class="row-hint">' + esc(tr("Pick a bank on the right, or start one at the first step.")) + "</p>"; return; }
    var pg = w.progress || {};
    $("bbProgress").innerHTML = pg.step === "clean" || pg.status === "running" ? progressLine(pg) : "";
    $("bbFiles").innerHTML = w.files.map(function (f) {
      var c = f.clean;
      return '<div class="bb-file" data-file="' + esc(f.id) + '"><div class="bb-file-head"><b translate="no">' + esc(f.title || f.file) + "</b>" +
        '<span class="row-hint"><span>' + clock(f.seconds) + "</span>" + (c ? " · <span>" + esc(tr("{0} s kept").replace("{0}", c.kept)) + "</span>" +
        (c.refused_by_listener ? " · <span>" + esc(tr("{0} s refused by the Listener").replace("{0}", c.refused_by_listener)) + "</span>" : "") +
        (c.listener ? "" : " · <span>" + esc(tr("without the Listener")) + "</span>") : " · <span>" + esc(tr("not cleaned yet")) + "</span>") +
        (f.uploader ? ' · <span translate="no">' + esc(f.uploader) + "</span>" : "") + "</span></div>" +
        (c ? '<canvas class="bb-strip" height="16" data-tip="A second a column; a click listens there"></canvas>' : "") + "</div>";
    }).join("");
    Array.prototype.forEach.call(document.querySelectorAll("#bbFiles .bb-file"), function (el) {
      var fid = el.dataset.file, cv = el.querySelector("canvas");
      if (!cv) return;
      var have = state.strips[fid];
      if (have) return drawStrip(cv, have);
      api("/banks/builder/strip?bank=" + encodeURIComponent(w.plan.bank) + "&file=" + encodeURIComponent(fid)).then(function (s) { state.strips[fid] = s; drawStrip(cv, s); }).catch(function () { /* drawn when it comes */ });
    });
  }
  var COLOR = { W: "--good", w: "--bad", o: "#d4a72c", b: "--dim", v: "--bad", s: "--line-a", "-": "--line-a" };   // «-»: a long recording's seconds not heard   // over a bed a yellow of its own: the accent is red as a refusal is
  function drawStrip(cv, s) {
    var w = cv.clientWidth || 600, h = 16, n = s.kinds.length || 1, css = getComputedStyle(document.documentElement);
    cv.width = w; cv.height = h;
    var g = cv.getContext("2d");
    for (var x = 0; x < w; x++) {
      var a = Math.floor(x * n / w), b = Math.max(a + 1, Math.floor((x + 1) * n / w)), part = s.kinds.slice(a, b), best = part[0];
      for (var i = 0; i < part.length; i++) if (part[i] === "W") { best = "W"; break; }       // a kept second shows through a narrow column
      var c = COLOR[best] || "--dim";
      g.fillStyle = c.charAt(0) === "#" ? c : (css.getPropertyValue(c).trim() || "#888");
      g.globalAlpha = best === "W" ? 1 : best === "s" ? 0.35 : best === "-" ? 0.12 : 0.7;
      g.fillRect(x, best === "W" ? 0 : 3, 1, best === "W" ? h : h - 6);
    }
    g.globalAlpha = 1;
    cv.dataset.n = n;
  }
  function play(url) {
    if (state.audio) { state.audio.pause(); }
    state.audio = new Audio(url);
    state.audio.play().catch(function (e) { toast(tr("It does not play: {0}").replace("{0}", e.message), true); });
  }
  function stopPlay() { if (state.audio) state.audio.pause(); }

  // ------------------------------------------------------------------ notes
  function paintNotes() {
    var w = state.work, box = $("bbKeys");
    $("bbNotesSay").textContent = "";
    if (!w || !w.notes) { box.innerHTML = '<p class="row-hint">' + esc(w ? tr("Find the notes once the clean is done.") : tr("Pick a bank on the right, or start one at the first step.")) + "</p>"; $("bbCands").innerHTML = ""; return; }
    var n = w.notes, blasts = n.mode === "blasts", by = n.by_key || {}, keys;
    $("bbNotesSay").textContent = tr("{0} found, {1} fit for a sample").replace("{0}", n.notes).replace("{1}", n.usable);
    if (blasts) keys = Object.keys(state.calls || {});
    else {
      var nums = Object.keys(by).map(Number).filter(function (k) { return !isNaN(k); }), lo = Math.min.apply(null, nums), hi = Math.max.apply(null, nums);
      if (w.range) { lo = Math.min(lo, w.range[0]); hi = Math.max(hi, w.range[1]); }
      keys = []; for (var k = lo; k <= hi; k++) keys.push(String(k));
    }
    box.innerHTML = keys.map(function (k) {
      var s = by[k] || { count: 0, clean: 0, longest: 0 }, out = !blasts && w.range && (+k < w.range[0] || +k > w.range[1]);
      var black = !blasts && [1, 3, 6, 8, 10].indexOf(((+k % 12) + 12) % 12) >= 0;
      return '<button type="button" class="bb-key' + (black ? " is-black" : "") + (out ? " is-out" : "") + (s.clean ? " has-clean" : "") + (state.key === k ? " is-on" : "") +
        '" data-key="' + esc(k) + '" style="--fill:' + Math.min(1, s.clean / 6).toFixed(2) + '"><b' + (blasts ? "" : ' translate="no"') + ">" + esc(blasts ? k : noteName(k)) + '</b><span class="mono">' +
        s.clean + "/" + s.count + "</span></button>";
    }).join("");
    paintCands();
  }
  function paintCands() {
    var box = $("bbCands"), w = state.work;
    if (!state.key || !w) { box.innerHTML = '<p class="row-hint">' + esc(tr("A key above shows its notes: each to be heard, and picked for the bank or not.")) + "</p>"; return; }
    var blasts = w.notes && w.notes.mode === "blasts", label = blasts ? state.key : noteName(state.key);
    var picked = state.picks[state.key];
    if (!state.notes.length) { box.innerHTML = '<p class="row-hint">' + esc(tr("No note on {0}.").replace("{0}", label)) + "</p>"; return; }
    var want = (((w.options || {}).round_robins) || 3) * (((w.options || {}).layers) || 3);
    var auto = state.notes.filter(function (g) { return g.ok; }).slice(0, want).map(function (g) { return g.id; });
    box.innerHTML = '<div class="bb-cands-head"><b translate="no">' + esc(label) + "</b><span class=\"row-hint\">" + esc(picked ? tr("{0} picked by hand").replace("{0}", picked.length) :
      tr("the best {0} go in unless you pick").replace("{0}", auto.length)) + "</span>" +
      (picked ? '<button type="button" class="btn ghost small" id="bbPickAuto">' + esc(tr("Back to the best")) + "</button>" : "") + "</div>" +
      '<div class="bb-cand bb-cand-h"><span></span><span data-tip="in the bank" aria-label="in the bank">✓</span><span>' + esc(tr("length")) + "</span><span>" + esc(blasts ? tr("blasts") : tr("cents")) +
      "</span><span>" + esc(blasts ? tr("pitch") : tr("vibrato")) + "</span><span>" + esc(tr("level")) + "</span><span>" + esc(blasts ? tr("tail") : tr("drone")) + "</span><span>" + esc(tr("from")) + "</span></div>" +
      state.notes.slice(0, 80).map(function (g) {
        var inb = picked ? picked.indexOf(g.id) >= 0 : auto.indexOf(g.id) >= 0;
        return '<div class="bb-cand' + (g.ok ? "" : " is-unfit") + '" data-id="' + esc(g.id) + '">' +
          '<button type="button" class="icon-btn bb-play" data-play="' + esc(g.id) + '" aria-label="Listen" data-tip="Listen to this note, from its winds">▶</button>' +
          '<label class="check"><input type="checkbox" data-pick="' + esc(g.id) + '"' + (inb ? " checked" : "") + (g.ok ? "" : " disabled") + ' aria-label="In the bank" /></label>' +
          '<span class="mono">' + g.dur.toFixed(1) + " s</span>" +
          '<span class="mono">' + (blasts ? g.blasts : (g.cents > 0 ? "+" : "") + g.cents) + "</span>" +
          '<span class="mono">' + (blasts ? (g.midi != null ? noteName(Math.round(g.midi)) : "–") : g.vib_hz ? g.vib_hz.toFixed(1) + " Hz · " + g.vib_cents : "–") + "</span>" +
          '<span class="mono">' + ((g.rel_db || 0) > 0 ? "+" : "") + (g.rel_db || 0).toFixed(1) + " dB</span>" +
          '<span class="mono">' + (blasts ? (g.tail_db || 0).toFixed(0) : (g.drone_db || 0).toFixed(0)) + " dB</span>" +
          '<span class="bb-from" translate="no">' + esc(g.title || g.file) + " · " + clock(g.start) + "</span></div>";
      }).join("");
  }
  function openKey(k) {
    var w = state.work;
    state.key = k; state.notes = [];
    paintNotes();
    api("/banks/builder/key?bank=" + encodeURIComponent(w.plan.bank) + "&key=" + encodeURIComponent(k)).then(function (d) {
      if (state.key !== k) return;
      state.notes = d.notes || []; paintCands();
    }).catch(function (e) { $("bbCands").innerHTML = '<p class="tr-warn">' + esc(e.message) + "</p>"; });
  }

  // ------------------------------------------------------------------ the bank
  function paintBank() {
    var w = state.work, b = w && w.built;
    if (w && !$("bbBankName").value) $("bbBankName").value = (b && b.name) || w.plan.bank;
    if (w && w.options) { if (w.options.round_robins) $("bbRR").value = w.options.round_robins; if (w.options.layers) $("bbLayers").value = w.options.layers; }
    $("bbProgress2").innerHTML = w && w.progress && w.progress.step === "build" && w.progress.status !== "done" ? progressLine(w.progress) : "";
    // HERESY 2061 (Viktor 04.11.2026: «И твои трёхсуточного бдения долги тоже, плиз»): how many of the bank's samples loop (a wavering note over
    // whole periods of its vibrato); the Layer strikes the others again before they end. A bank of calls is never looped, so it says nothing.
    // HERESY 2061b (Viktor 04.11.2026: «И твои трёхсуточного бдения долги тоже, плиз»; the re-audit: a 0.48 s pizzicato was struck four times a second): as they end, at least 2 s apart, one under 1.5 s every 8 s
    var loops = b && b.samples && w.plan && w.plan.mode === "chromatic" ? '<p class="row-hint bb-loops">' +
      esc(tr("{0} of {1} samples loop; as a bed or a drone, the others are struck again as they end, at least 2 s apart (one under 1.5 s, every 8 s)").replace("{0}", b.looped || 0).replace("{1}", b.samples)) + "</p>" : "";
    $("bbBuilt").innerHTML = b ? '<div class="bb-built"><b translate="no">' + esc(b.name) + "</b><p>" + esc(b.description || "") + "</p>" + loops +
      '<p class="row-hint"><span>' + esc(tr("Licence: {0}").replace("{0}", String(b.licence || "").replace(/\s*\(private: never shipped\)$/, ""))) + "</span> · <span>" +
      esc(b.may_ship ? tr("it may ship") : tr("private: never shipped")) + "</span></p>" +
      '<p class="row-hint"><span translate="no">' + esc((b.sfz || []).join(" · ")) + "</span></p>" +
      '<p class="row-hint">' + esc(tr("In the DAW: + Layer, then this bank on the shelf; as a bed, a drone in the song's key, or a MIDI file's notes.")) + "</p></div>" : "";
  }

  // ------------------------------------------------------------------ acts
  function start(body, where) {
    return api("/banks/builder/start", body).then(function (r) {
      toast(tr("{0}: the {1} step started").replace("{0}", body.bank).replace("{1}", tr(body.step)) + (r.gpu != null ? " · GPU" + r.gpu : ""));
      state.sel = slugOf(body.bank); keep("yue2.bbSel", state.sel);
      return load();
    }).catch(function (e) {
      if (e.status === 409 && e.body && e.body.processor && where !== "processor") {
        return window.HeresyDialog.confirm(tr("No card has room now: {0}. Clean on the processor instead? Several workers on three quarters of the cores; slower than a card, and the cards stay free.").replace("{0}", e.message),
          { ok: tr("On the processor") }).then(function (yes) { if (yes) return start(Object.assign({}, body, { device: "processor" }), "processor"); });
      }
      toast(e.message, true);
    });
  }
  function slugOf(s) { return String(s || "").trim().replace(/[^\w.\-]+/g, "-").replace(/^[-.]+|[-.]+$/g, "").slice(0, 60) || "bank"; }

  function wire() {
    var head = $("view-train");
    if (!head || !$("bbView")) return;
    head.addEventListener("click", function (e) { var b = e.target.closest("[data-trmode]"); if (b) setMode(b.dataset.trmode); });
    $("bbPills").addEventListener("click", function (e) { var b = e.target.closest("[data-bbpane]"); if (b) showPane(b.dataset.bbpane); });
    $("bbList").addEventListener("click", function (e) {
      var b = e.target.closest("[data-bb]");
      if (!b) return;
      state.sel = b.dataset.bb; keep("yue2.bbSel", state.sel); state.strips = {}; state.key = null; state.notes = []; state.picks = {};
      $("bbBankName").value = "";
      paintList(); loadWork().then(paintMaterial);
    });
    $("bbClean").addEventListener("click", function () {
      var name = $("bbName").value.trim(), folder = $("bbFolder").value;
      if (!name) { toast(tr("The bank needs a name"), true); $("bbName").focus(); return; }
      if (window.HeresyNames && window.HeresyNames.refusal(name, { max: 60, file: true })) {   // HERESY 2462: a bank's name keeps the names' rule
        window.HeresyNames.ask(name, { max: 60, file: true }).then(function (v) { if (v) { $("bbName").value = v; $("bbClean").click(); } });
        return;
      }
      if (!folder) { toast(tr("Pick a folder of datasets/raw/"), true); return; }
      start({ step: "clean", bank: name, folder: folder, instrument: $("bbInst").value.trim(), mode: $("bbMode").value, device: $("bbWhere").value, listen: $("bbListen").checked }, $("bbWhere").value);
    });
    $("bbStop").addEventListener("click", function () {
      var w = state.work;
      if (!w) return;
      api("/banks/builder/stop", { bank: w.plan.bank }).then(function () { toast(tr("{0}: stopped").replace("{0}", w.plan.bank)); load(); }).catch(function (e) { toast(e.message, true); });
    });
    $("bbNotes").addEventListener("click", function () { var w = state.work; if (w) start({ step: "notes", bank: w.plan.bank }); });
    $("bbBuild").addEventListener("click", function () {
      var w = state.work;
      if (!w) return;
      var picks = Object.keys(state.picks).length ? state.picks : null, bn = $("bbBankName").value.trim();
      if (bn && window.HeresyNames && window.HeresyNames.refusal(bn, { max: 60, file: true })) {   // HERESY 2462
        window.HeresyNames.ask(bn, { max: 60, file: true }).then(function (v) { if (v) { $("bbBankName").value = v; $("bbBuild").click(); } });
        return;
      }
      start({ step: "build", bank: w.plan.bank, name: $("bbBankName").value.trim(), round_robins: +$("bbRR").value || 3, layers: +$("bbLayers").value || 3, picks: picks });
    });
    $("bbSrc").addEventListener("change", function () { state.src = this.value; });
    $("bbFiles").addEventListener("click", function (e) {
      var cv = e.target.closest("canvas.bb-strip"), w = state.work;
      if (!cv || !w) return;
      var fid = cv.closest("[data-file]").dataset.file, n = +cv.dataset.n || 0, r = cv.getBoundingClientRect();
      var at = Math.max(0, Math.floor((e.clientX - r.left) / r.width * n) - 1);
      play("/lab/banks/builder/snippet?bank=" + encodeURIComponent(w.plan.bank) + "&file=" + encodeURIComponent(fid) + "&at=" + at + "&len=8&src=" + state.src);
    });
    $("bbKeys").addEventListener("click", function (e) { var b = e.target.closest("[data-key]"); if (b) openKey(b.dataset.key); });
    $("bbCands").addEventListener("click", function (e) {
      var w = state.work, p = e.target.closest("[data-play]");
      if (p && w) {
        var g = state.notes.filter(function (x) { return x.id === p.dataset.play; })[0];
        if (g) play("/lab/banks/builder/snippet?bank=" + encodeURIComponent(w.plan.bank) + "&file=" + encodeURIComponent(g.file) + "&at=" + Math.max(0, g.start - 0.05).toFixed(2) +
          "&len=" + Math.min(30, g.dur + 0.6).toFixed(2) + "&src=winds");
      }
      if (e.target.id === "bbPickAuto") { delete state.picks[state.key]; paintCands(); }
    });
    $("bbCands").addEventListener("change", function (e) {
      var c = e.target.closest("[data-pick]");
      if (!c) return;
      var boxes = document.querySelectorAll("#bbCands [data-pick]");
      state.picks[state.key] = Array.prototype.filter.call(boxes, function (b) { return b.checked; }).map(function (b) { return b.dataset.pick; });
      paintCands();
    });
    window.addEventListener("ruach-lang", function () { if (state.mode === "banks") { paintList(); paintPane(); } });
    document.addEventListener("visibilitychange", function () { if (!document.hidden && visible()) load(); });
    var obs = new MutationObserver(function () { if (visible() && !state.works.length) load(); if (document.body.dataset.tab !== "train") stopPlay(); });
    obs.observe(document.body, { attributes: true, attributeFilter: ["data-tab"] });
    setMode(state.mode);
    showPane(state.pane);
  }
  window.HeresyBankBuilder = { setMode: setMode, state: state, noteName: noteName };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire); else wire();
})();
