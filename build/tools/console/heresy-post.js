// HERESY 1029: Post as numbered steps in a row instead of a stack of drawers (Viktor, 01.10.2026):
// one tool on screen at a time, in the order the work goes, and a step lights up once it has
// been done for the take in hand: measured, checked, split, remastered, upscaled.
// The tools tell it themselves with a "heresy-step" event {name, step}; the tree of files made
// from the take ("heresy-derived") tells which of stems, remaster and upscale exist.
(function () {
  "use strict";

  // HERESY 1461: in three groups, in the chain's order (Debuzz › Upscale › Stems › Remaster); a plugin's steps finish
  var STEPS = [
    { id: "spectrumPanel", step: "spectrum", label: "Spectrum", say: "look", group: "look" },
    { id: "inspectPanel", step: "inspect", label: "Artifacts", say: "find faults", group: "look" },
    { id: "glossPanel", step: "gloss", label: "Lyrics", say: "check the words", group: "look" },
    { id: "debuzzPanel", step: "debuzz", label: "Debuzz", say: "the frame buzz out", group: "mend" },
    { id: "upscalePanel", step: "upscale", label: "Upscale", say: "redraw the top", group: "mend" },
    { id: "derivedPanel", step: "stems", label: "Stems", say: "split", group: "mend" },
    { id: "dawPanel", step: "daw", label: "DAW", say: "mix the stems", group: "finish" },   // HERESY 1471
    { id: "gatePanel", step: "gate", label: "Digital Gateway", say: "tape, console, tube", group: "finish" },   // HERESY 1547
    { id: "remasterPanel", step: "remaster", label: "Remaster", say: "the Debunker", group: "finish" },
    { id: "audioPanel", step: "audio", label: "Audio I/O", say: "the interfaces", group: "setup" }   // HERESY 1512
  ];
  var GROUPS = { look: "Hear and look", mend: "Mend", finish: "Finish", setup: "Setup" };   // 1512: the machine's own
  var KEY = "yue2.postStep";
  var TREE = "treePanel", treeFrom = "";            // HERESY 1540: the tree as a place of the column, not a step of the chain
  var state = { take: null, done: {}, current: "" };
  function $(id) { return document.getElementById(id); }
  function recall() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function store(v) { try { localStorage.setItem(KEY, v); } catch (e) { /* private mode */ } }

  function paint() {
    var bar = $("postSteps");
    if (!bar) return;
    Array.prototype.forEach.call(bar.querySelectorAll("[data-step-panel]"), function (b) {
      var s = STEPS.filter(function (x) { return x.id === b.dataset.stepPanel; })[0];
      var done = !!state.done[s.step];
      b.classList.toggle("is-active", s.id === state.current);
      b.classList.toggle("is-done", done);
      b.setAttribute("aria-selected", s.id === state.current ? "true" : "false");
      b.querySelector(".ps-mark").textContent = done ? "✓" : String(STEPS.indexOf(s) + 1);
    });
    paintTree();
  }
  function treeBox() { return document.querySelector("#view-post > .dv-tree-box"); }
  function paintTree() {                             // HERESY 1540: its count, its light
    var b = document.querySelector('#postSteps [data-tree-step]');
    if (!b) return;
    var D = window.HeresyDerived, n = D && D.list ? D.list().length : 0, live = !!document.querySelector("#derivedTree .dv-group.is-running:not(.is-failed)");
    b.classList.toggle("is-active", state.current === TREE);
    b.setAttribute("aria-selected", state.current === TREE ? "true" : "false");
    b.classList.toggle("is-running", live);
    b.querySelector(".ps-mark").textContent = String(n);
  }

  function select(id) {
    var tree = id === TREE;                           // HERESY 1540
    if (!tree && !STEPS.some(function (s) { return s.id === id; })) id = STEPS[0].id;
    if (tree && state.current && state.current !== TREE) treeFrom = state.current;
    state.current = id;
    store(id);
    STEPS.forEach(function (s) {
      var p = $(s.id);
      if (!p) return;
      p.classList.toggle("is-step-off", tree || s.id !== id);
      if (s.id === id && !p.open) p.open = true;           // its own toggle draws it
    });
    var box = treeBox();
    if (box) box.classList.toggle("is-step-off", !tree);
    paint();
    window.dispatchEvent(new CustomEvent("heresy-post-step", { detail: { panel: tree ? (treeFrom || id) : id } }));   // HERESY 1129: the tree lights its branches (1540: the step one came from)
    window.dispatchEvent(new Event("resize"));             // a picture shown measures its new width
  }

  // ---- HERESY 1054: the chain (Viktor): Debuzz -> Upscale (optional) -> Remaster, then the checks;
  // run on Forge as one job (POST /lab/chain), watched here; closing the page stops nothing.
  // HERESY 1169 (Viktor 08.10.2026: «перепроверить пайплайн и его логичность. Апскейлер нужен в двух местах - перед
  // разделением на стемы и в конце после ремастера… По дефолту стеммер - four»): Debuzz › Upscale › Stems › Remaster ›
  // Upscale, then the checks. The stems are split from the debuzzed (and upscaled) take, no longer from the raw one at the
  // end, and the remaster mixes them, so its preset and de-esser work in the chain too
  var CHAIN_KEY = "yue2.chain", chain = { timer: 0, hooks: null, watching: "" };
  function chainPrefs() {
    var p;
    try { p = JSON.parse(localStorage.getItem(CHAIN_KEY) || "{}") || {}; } catch (e) { p = {}; }
    // the stems' kind was «vocals» only because that was the default: once, four takes its place; the upscale at the end
    // starts as the one before the stems is
    if (p.v !== 2) { p.stemsMode = "four"; if (p.upEnd == null) p.upEnd = !!p.upscale; p.v = 2; }
    return p;
  }
  function saveChainPrefs() {
    var p = { v: 2, strength: $("pcStrength").value, upscale: $("pcUpscale").checked, upMode: $("pcUpMode").value, stems: $("pcStems").checked,
              stemsMode: $("pcStemsMode").value, upEnd: $("pcUpEnd").checked, upEndMode: $("pcUpEndMode").value, inspect: $("pcInspect").checked,
              spectrum: $("pcSpectrum").checked, gloss: $("pcGloss").checked };
    try { localStorage.setItem(CHAIN_KEY, JSON.stringify(p)); } catch (e) { /* private mode */ }
  }
  function upModes(id, pick) {
    return '<select id="' + id + '">' + ["subtle", "normal", "high"].map(function (m) { return "<option" + (pick === m ? " selected" : "") + ">" + m + "</option>"; }).join("") + "</select>";
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function chainMarkup() {
    var p = chainPrefs(), box = document.createElement("section");
    box.className = "post-chain"; box.id = "postChain";
    box.innerHTML =
      '<div class="pc-row"><strong class="pc-cap">Chain</strong>' +
      // HERESY 1553: the profile: the classic chain, or a pipeline the studio or a plugin brings
      '<span class="pc-prof" data-tip="The chain\'s profile: the classic chain (its steps fixed, each checked or not), or a pipeline the studio or a plugin brings, its steps in their own order. Uncheck a step of a pipeline to bypass it">' +
        '<select id="pcProfile" data-hc-row="1" data-tip="The chain\'s profile: the classic chain (its steps fixed, each checked or not), or a pipeline the studio or a plugin brings, its steps in their own order. Uncheck a step of a pipeline to bypass it"><option value="">Classic chain</option></select></span><span class="pc-break" aria-hidden="true"></span><span class="pc-classic">' +
      '<label class="pc-node is-req" data-tip="The VAE frame buzz out: needed for every YuE2 take; off for a track imported from elsewhere"><input type="checkbox" id="pcDebuzz" checked /> Debuzz ' +
        '<select id="pcStrength">' + [50, 60, 70, 80, 90, 100].map(function (v) { return '<option value="' + v / 100 + '"' + ((p.strength || "0.8") == v / 100 ? " selected" : "") + ">" + v + " %</option>"; }).join("") + "</select></label>" +
      '<span class="pc-arrow">›</span><label class="pc-node" data-tip="UniverSR redraws the top of the spectrum after Debuzz and before the stems are split: the separators hear the whole song, and every stem keeps its share of the top (without stems, it goes before the remaster). Subtle above 12 kHz, normal above 8, high above 6; one variant, the original kept below the cutoff; about 1.6 times the length of the song on a 3090."><input type="checkbox" id="pcUpscale"' + (p.upscale ? " checked" : "") + " /> Upscale " +
        upModes("pcUpMode", p.upMode) + "</label>" +
      '<span class="pc-arrow">›</span><label class="pc-node" data-tip="The debuzzed (and upscaled) take split into stems: four (vocals, drums, bass and the rest, with the instrumental: BS-Roformer, then htdemucs_ft) or vocals (voice and instrumental). The remaster then mixes them: its preset balances them, and the de-esser works on the voice alone. They stay in the tree, for your DAW too."><input type="checkbox" id="pcStems"' + (p.stems ? " checked" : "") + ' /> Stems <select id="pcStemsMode"><option value="four"' + (p.stemsMode !== "vocals" ? " selected" : "") +
        '>four</option><option value="six"' + (p.stemsMode === "six" ? " selected" : "") + '>six</option><option value="eight"' + (p.stemsMode === "eight" ? " selected" : "") + '>eight</option><option value="vocals"' + (p.stemsMode === "vocals" ? " selected" : "") + ">vocals</option></select></label>" +
      '<span class="pc-arrow">›</span><span class="pc-node is-req" data-tip="With the settings of the Remaster step below: from the stems when the chain splits them (the preset and the de-esser at work), else from the file before it">Remaster <em id="pcRmSay"></em></span>' +
      '<span class="pc-arrow">›</span><label class="pc-node" data-tip="UniverSR once more, on the remaster: the stems leave a hiss above 20 kHz and the remaster keeps almost nothing above 22 (measured on a take), so the top is drawn anew, near the first upscale\'s. If the new top passes the remaster\'s true-peak ceiling, the whole file is turned down to it."><input type="checkbox" id="pcUpEnd"' + (p.upEnd ? " checked" : "") + " /> Upscale " +
        upModes("pcUpEndMode", p.upEndMode) + "</label>" +
      '<span class="pc-then">then</span>' +
      '<label class="pc-check" data-tip="Then the final file is measured for faults: a tone that will not leave, the frame buzz of the VAE, clicks, clipping, dropouts, stereo that fights itself. The Artifacts step shows them."><input type="checkbox" id="pcInspect"' + (p.inspect !== false ? " checked" : "") + " /> Artifacts</label>" +
      '<label class="pc-check" data-tip="Then the spectrum of the final file, ready in the Spectrum step."><input type="checkbox" id="pcSpectrum"' + (p.spectrum ? " checked" : "") + " /> Spectrum</label>" +
      '<label class="pc-check" data-tip="Whisper on the take: are the words the lyrics"><input type="checkbox" id="pcGloss"' + (p.gloss ? " checked" : "") + " /> Lyrics</label>" +
      '</span><span class="pc-pipe" id="pcPipe"></span>' +   // HERESY 1553: a pipeline's steps
      '<span class="spacer"></span><button type="button" class="btn ghost small" id="pcBatch" data-tip="The chain as it is set on every take of the workspace in hand (all takes when none is), one after another on Forge; asked first">On the workspace\u2026</button>' +   // HERESY 1562
      '<button type="button" class="btn primary small" id="pcRun">Run the chain</button></div>' +
      '<div class="pc-prof-say row-hint" id="pcProfSay"></div>' +
      '<div class="pc-batch row-hint" id="pcBatchSay" hidden></div>' +
      '<div class="pc-status" id="pcStatus"></div>';
    return box;
  }
  function paintRemasterSay() {
    var D = window.HeresyDerived, s = D && D.remasterSettings ? D.remasterSettings() : null;
    if (!s || !$("pcRmSay")) return;
    // HERESY 1148, 1169: the preset balances stems and the de-esser works on a voice stem: said only when the chain splits them
    var stems = $("pcStems") && $("pcStems").checked;
    $("pcRmSay").textContent = (stems ? (s.preset || "balanced") + (s.deess ? " · de-ess" : "") + " · " : "") +
      (s.hz432 === false ? "440" : "432") + " Hz · " + (s.loudnorm === false ? "no loudnorm" : s.lufs + " LUFS");
  }
  var MARK = { waiting: "·", running: "…", done: "✓", failed: "✕" };
  var NAMES = { gate: "Digital Gateway", debuzz: "Debuzz", upscale: "Upscale", remaster: "Remaster", inspect: "Artifacts", spectrum: "Spectrum", gloss: "Lyrics", stems: "Stems", daw: "DAW" };
  function stepWord(s) { return s.step === "plugin" ? (s.label || s.sid) : NAMES[s.step] || s.step; }   // HERESY 1553: a plugin's step by its label
  function paintChain(job) {
    chain.job = job;                                 // HERESY 1510: for the chain's node
    if (typeof cvPaint === "function") setTimeout(cvPaint, 0);
    var box = $("pcStatus");
    if (!box) return;
    if (!job || job.status === "none") { box.innerHTML = ""; $("pcRun").disabled = false; $("pcRun").textContent = "Run the chain"; $("pcRun").classList.remove("is-magic"); return; }
    var done = job.steps.filter(function (s) { return s.status === "done"; }).length, n = job.steps.length;
    var cur = job.steps.filter(function (s) { return s.status === "running"; })[0];
    box.innerHTML = '<div class="pc-bar' + (job.status === "running" ? " is-running" : job.status === "failed" ? " is-failed" : "") + '"><i style="width:' +
      Math.round(100 * (done + (cur ? 0.5 : 0)) / n) + '%"></i></div>' + job.steps.map(function (s) {
      return '<span class="pc-st is-' + s.status + '" title="' + esc(s.error || s.file || "") + '">' + MARK[s.status] + " " + esc(stepWord(s)) + "</span>";
    }).join('<span class="pc-arrow">›</span>') +
      (job.status === "done" ? '<span class="pc-say">done' + (job.final ? (job.steps.some(function (s) { return s.end; }) ? ": the remaster, its top drawn anew, is in the tree" : ": the remaster is in the tree") : "") + "</span>" : "") +
      (job.status === "failed" ? '<span class="pc-say is-bad">' + esc(job.error || "failed") + " · what was made before stays</span>" : "");
    $("pcRun").disabled = job.status === "running";
    $("pcRun").textContent = job.status === "running" ? "\u2728 Enjoy the magic\u2026 " + (done + 1) + " / " + n + (cur ? " \u00b7 " + stepWord(cur) : "") : "Run the chain";
    $("pcRun").classList.toggle("is-magic", job.status === "running");
  }
  function watchChain(name) {
    clearTimeout(chain.timer);
    chain.watching = name;
    fetch("/lab/chain?name=" + encodeURIComponent(name), { priority: "low" }).then(function (r) { return r.json(); }).then(function (job) {
      if (chain.watching !== name) return;
      if (state.take && state.take.name === name) paintChain(job);
      if (job.status === "running") { chain.timer = setTimeout(function () { watchChain(name); }, 2000); return; }
      if (window.HeresyDerived) window.HeresyDerived.refresh();
      if (job.status === "done" && chain.started === name) {
        chain.started = "";
        chain.hooks && chain.hooks.toast && chain.hooks.toast("The chain is done: " + job.steps.length + " steps; Artifacts now shows the final file");
        if (window.RuachChime) window.RuachChime.ring(true);   // HERESY 1275
        // HERESY 1059: the checks were made on the final file: the Artifacts step shows that one, not the take
        if (job.final && window.HeresyInspect && window.HeresyInspect.useSource && job.steps.some(function (s) { return s.step === "inspect"; })) window.HeresyInspect.useSource(job.final);
      }
      if (job.status === "failed" && chain.started === name) {
        chain.started = "";
        chain.hooks && chain.hooks.toast && chain.hooks.toast("The chain stopped at " + (job.error || "a step"), "bad");
        if (window.RuachChime) window.RuachChime.ring(false);   // HERESY 1275
      }
    }).catch(function () { /* the lab will answer on the next take */ });
  }
  function chainBody() {                             // HERESY 1508: the chain's request, for the whole chain and «up to here»
    var D = window.HeresyDerived, body = {
      name: state.take ? state.take.name : "", debuzz: $("pcDebuzz").checked, strength: parseFloat($("pcStrength").value),   // 1562: a batch has none
      upscale: $("pcUpscale").checked, upscale_mode: $("pcUpMode").value, stems: $("pcStems").checked, stems_mode: $("pcStemsMode").value,
      // HERESY 1148, 1169: the de-esser as the Remaster step has it when the chain splits stems (a voice of its own); without
      // them a single file has none, and the record says off instead of a de-ess that never ran
      remaster: D && D.remasterSettings ? Object.assign(D.remasterSettings(), { deess: $("pcStems").checked && !!D.chainDeess && D.chainDeess() }) : {},
      upscale_end: $("pcUpEnd").checked, upscale_end_mode: $("pcUpEndMode").value,
      inspect: $("pcInspect").checked, spectrum: $("pcSpectrum").checked, gloss: $("pcGloss").checked };
    var fr = chain.hooks.frame ? chain.hooks.frame() : null;   // HERESY 1055
    if (fr) { body.period = fr.period; body.rate = fr.rate; }
    return body;
  }
  function runChain() {
    if (!state.take) return;
    if (pipeOf()) { var pb = pipeBody(); if (pb) startChain(pb); return; }   // HERESY 1553
    saveChainPrefs();
    startChain(chainBody());
  }

  // ---- HERESY 1562: the chain on many takes, one after another on Forge
  var BATCH = { timer: 0, was: "" };
  function batchBody(names) {
    var b = pipeOf() ? pipeBody() : (saveChainPrefs(), chainBody());
    if (!b) return null;
    delete b.name;
    b.names = names;
    b.profile = PIPE.on || "classic";
    return b;
  }
  function titleOf(n) { var t = (window.ruachTakes ? window.ruachTakes() : []).filter(function (x) { return x.name === n; })[0]; return t ? t.title : n; }
  function batchAsk() {
    var HC = window.HeresyCollection, all = window.ruachTakes ? window.ruachTakes() : [], ws = HC && HC.current ? HC.current() : "";
    var names = (ws ? all.filter(function (t) { return HC.inCurrent(t.name); }) : all).map(function (t) { return t.name; });
    if (!names.length) { chain.hooks.toast && chain.hooks.toast(tr("No takes here to refine"), "bad"); return; }
    var text = tr("Run this chain on {0} takes?").replace("{0}", names.length) + "\n\n" + (ws ? tr("Every take of the workspace «{0}».").replace("{0}", ws) + " " : tr("Every take of the library: no workspace is in hand.") + " ") +
      tr("One after another on Forge; Stop lets the take in hand finish.");
    window.HeresyDialog.confirm(text, { ok: tr("Run on {0}").replace("{0}", names.length), cancel: tr("Cancel") }).then(function (yes) { if (yes === true) startBatch(names); });
  }
  function startBatch(names) {
    var body = batchBody(names);
    if (!body) return Promise.resolve(null);
    return fetch("/lab/chain/batch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (b) { if (!r.ok) throw new Error(b.error || r.status); return b; }); })
      .then(function (b) { paintBatch(b); watchBatch(); return b; })
      .catch(function (e) { chain.hooks.toast && chain.hooks.toast(tr("The batch did not start: {0}").replace("{0}", e.message), "bad"); return null; });
  }
  function paintBatch(b) {
    var box = $("pcBatchSay");
    if (!box) return;
    if (!b || b.status === "none" || !b.items) { box.hidden = true; box.innerHTML = ""; return; }
    var items = b.items, done = items.filter(function (x) { return x.status === "done"; }).length, bad = items.filter(function (x) { return x.status === "failed"; }).length,
        cur = items.filter(function (x) { return x.status === "running"; })[0], run = b.status === "running";
    box.hidden = false;
    box.innerHTML = '<span class="pc-bar' + (run ? " is-running" : bad ? " is-failed" : "") + '"><i style="width:' + Math.round(100 * (done + bad) / Math.max(1, items.length)) + '%"></i></span>' +
      "<span>" + esc(run ? tr("Batch: {0} of {1} done").replace("{0}", done + bad).replace("{1}", items.length) : b.status === "stopped" ? tr("Batch stopped: {0} of {1} done").replace("{0}", done + bad).replace("{1}", items.length)
        : tr("Batch done: {0} takes").replace("{0}", items.length)) + "</span>" +
      (bad ? '<span class="is-bad"> \u00b7 ' + esc(tr("{0} failed").replace("{0}", bad)) + "</span>" : "") +
      (cur ? '<span> \u00b7 ' + esc(tr("now:")) + ' <b translate="no">' + esc(titleOf(cur.name)) + "</b></span>" : "") +
      (run && !b.stop ? ' <button type="button" class="btn ghost small" id="pcBatchStop">' + esc(tr("Stop")) + "</button>" : "");
  }
  function watchBatch() {
    clearTimeout(BATCH.timer);
    fetch("/lab/chain/batch", { priority: "low" }).then(function (r) { return r.json(); }).then(function (b) {
      paintBatch(b);
      if (b.status === "running") { BATCH.was = b.id; BATCH.timer = setTimeout(watchBatch, 3000); return; }
      if (BATCH.was && BATCH.was === b.id) {           // the end of the one watched: said once
        BATCH.was = "";
        var bad = (b.items || []).filter(function (x) { return x.status === "failed"; }).length;
        chain.hooks.toast && chain.hooks.toast(tr("Batch done: {0} takes").replace("{0}", (b.items || []).length) + (bad ? " \u00b7 " + tr("{0} failed").replace("{0}", bad) : ""), bad ? "bad" : "");
        if (window.RuachChime) window.RuachChime.ring(!bad);
        if (window.HeresyDerived) window.HeresyDerived.refresh();
      }
    }).catch(function () { /* an older lab: no batches */ });
  }

  // ---- HERESY 1553: the chain's profiles. The pipelines the studio ships and the plugins bring (the lab's GET /refiner/profiles,
  // «pipelines»), checked there against the steps that are here; the one chosen and its bypassed steps kept in this browser
  var PIPE = { list: [], on: "", off: {} }, PIPE_KEY = "yue2.chainPipe";
  function pipeRecall() { try { var p = JSON.parse(localStorage.getItem(PIPE_KEY) || "{}") || {}; PIPE.on = String(p.on || ""); PIPE.off = p.off || {}; } catch (e) { /* none kept */ } }
  function pipeStore() { try { localStorage.setItem(PIPE_KEY, JSON.stringify({ on: PIPE.on, off: PIPE.off })); } catch (e) { /* private mode */ } }
  function pipeOf() { return PIPE.on ? PIPE.list.filter(function (p) { return p.id === PIPE.on; })[0] || null : null; }
  function pipeOff() { var p = pipeOf(); return p ? PIPE.off[p.id] || [] : []; }
  function pipeSteps() { var off = pipeOff(), p = pipeOf(); return p ? p.pipeline.filter(function (x, i) { return off.indexOf(i) < 0; }) : []; }
  function pipeNode(st) { return st.step === "plugin" ? "pl-" + st.plugin + "-" + st.sid + "Panel" : KIND_NODE[st.step] || st.step + "Panel"; }
  function pipeIdx(id) { var p = pipeOf(), out = []; if (p) p.pipeline.forEach(function (x, i) { if (pipeNode(x) === id) out.push(i); }); return out; }
  function pipeStep(x) { return STEPS.filter(function (s) { return s.id === pipeNode(x); })[0] || null; }
  function pipeBuiltin(x) { var s = pipeStep(x); return !!(s && s.builtin); }
  function pipeName(x) { if (x.step !== "plugin") return NAMES[x.step] || x.step; var s = pipeStep(x); return s ? s.label : x.sid; }
  var PIPE_MODE = { four: "four stems", six: "six stems", eight: "eight stems", vocals: "vocals" }, PIPE_PRESET = { balanced: "balanced", flat: "flat", vocal_forward: "vocal forward", instrumental_focus: "instrumental focus", shamanic: "shamanic" };
  function pipeModes(x) {
    if (x.step === "debuzz") return [Math.round((x.strength || 0.8) * 100) + " %"];
    if (x.step === "upscale") return [x.mode || "subtle"].concat(x.end ? ["at the end"] : []);
    if (x.step === "stems") return [x.set ? "the set in hand" : PIPE_MODE[x.mode || "eight"] || x.mode];
    if (x.step === "daw") return [x.mix === "current" ? "as the DAW is set" : "neutral"];
    if (x.step === "gate") return [(x.params || {}).character || "tape"];
    if (x.step === "remaster") return [PIPE_PRESET[(x.settings || {}).preset || "balanced"] || (x.settings || {}).preset];
    return [];
  }
  function pipeToggle(ix) {
    var p = pipeOf();
    if (!p || !ix.length) return;
    var off = (PIPE.off[p.id] || []).slice(), all = ix.every(function (i) { return off.indexOf(i) >= 0; });
    ix.forEach(function (i) { var k = off.indexOf(i); if (all && k >= 0) off.splice(k, 1); else if (!all && k < 0) off.push(i); });
    PIPE.off[p.id] = off;
    pipeStore();
    pipePaint();
  }
  function pipePaint() {
    var box = $("postChain"), p = pipeOf(), row = $("pcPipe"), say = $("pcProfSay");
    if (!box || !row) return;
    box.classList.toggle("is-pipe", !!p);
    var own = p && p.group !== "public" && p.group !== "builtin", off = pipeOff();
    row.innerHTML = !p ? "" : p.pipeline.map(function (x, i) {
      var mine = x.step === "plugin" && !pipeBuiltin(x), out = off.indexOf(i) >= 0;
      return '<label class="pc-node pc-pipe-node' + (out ? " is-off" : "") + (x.step === "remaster" ? " is-req" : "") + '" data-pipe-i="' + i + '"><input type="checkbox" data-pipe-on="' + i + '"' + (out ? "" : " checked") + " /> " +
        "<span" + (mine ? ' translate="no"' : "") + ">" + esc(pipeName(x)) + "</span>" + pipeModes(x).map(function (w) { return " <em>" + esc(w) + "</em>"; }).join("") + "</label>";
    }).join('<span class="pc-arrow">\u203a</span>');
    if (say) {
      say.textContent = p ? p.tip || p.say || "" : "";
      if (own) say.setAttribute("translate", "no"); else say.removeAttribute("translate");
    }
    var sel = $("pcProfile");
    if (sel && sel.value !== PIPE.on) sel.value = PIPE.on;
    if (typeof cvPaint === "function") cvPaint();
  }
  function pipeFill() {
    var sel = $("pcProfile");
    if (!sel) return;
    var ours = PIPE.list.filter(function (p) { return p.group === "public" || p.group === "builtin"; }), theirs = PIPE.list.filter(function (p) { return ours.indexOf(p) < 0; });
    sel.innerHTML = '<option value="">Classic chain</option>' + ours.map(function (p) { return '<option value="' + esc(p.id) + '">' + esc(p.name) + "</option>"; }).join("") +
      theirs.map(function (p) {
        return '<option value="' + esc(p.id) + '" translate="no">' + esc((p.plugin_name ? p.plugin_name + " \u00b7 " : "") + p.name) + "</option>"; }).join("");
    if (!pipeOf()) PIPE.on = "";
    sel.value = PIPE.on;
    pipePaint();
  }
  function pipeLoad() {
    if (!window.fetch) return;
    fetch("/lab/refiner/profiles", { priority: "low" }).then(function (r) { return r.ok ? r.json() : {}; }).then(function (d) {
      PIPE.list = Array.isArray(d.pipelines) ? d.pipelines : [];
      pipeFill();
    }).catch(function () { /* an older lab: the classic chain only */ });
  }
  function dawNow() {                                // the DAW «as set now»: the mix it holds for this take, else the lab mixes neutrally
    var M = window.HeresyMixer, s = M && M.state ? M.state() : null;
    return s && state.take && s.take === state.take.name && s.strips && s.strips.length ? M.value() : "current";
  }
  function pipeBody(untilNode) {
    var p = pipeOf(), off = pipeOff(), D = window.HeresyDerived, out = [], until = null;
    if (!p) return null;                              // 1562: a batch has no take in hand
    p.pipeline.forEach(function (x, i) {
      if (off.indexOf(i) >= 0) return;
      var s = JSON.parse(JSON.stringify(x));
      if (s.step === "daw" && s.mix === "current") s.mix = dawNow();
      if (s.step === "remaster") s.settings = Object.assign(D && D.remasterSettings ? D.remasterSettings() : {}, s.settings || {});   // the profile's preset over the step's own settings
      if (untilNode && pipeNode(x) === untilNode) until = out.length;
      out.push(s);
    });
    if (!out.length || (untilNode && until === null)) return null;
    var body = { name: state.take ? state.take.name : "", pipeline: out };
    if (untilNode) body.until = until;
    var fr = chain.hooks.frame ? chain.hooks.frame() : null;   // HERESY 1055: the model's frame for the Debuzz
    if (fr) { body.period = fr.period; body.rate = fr.rate; }
    return body;
  }
  function startChain(body) {
    $("pcRun").disabled = true;
    fetch("/lab/chain", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (b) { if (!r.ok) throw new Error(b.error || r.status); return b; }); })
      .then(function (job) { chain.started = state.take.name; paintChain(job); watchChain(state.take.name); })
      .catch(function (e) { $("pcRun").disabled = false; chain.hooks && chain.hooks.toast && chain.hooks.toast("The chain did not start: " + e.message, "bad"); });
  }

  function init(hooks) {
    chain.hooks = hooks || {};
    var bar = $("postSteps");
    if (!bar) return;
    bar.parentNode.insertBefore(chainMarkup(), bar);
    $("pcRun").addEventListener("click", runChain);
    pipeRecall();                                    // HERESY 1553: the chain's profiles
    $("pcProfile").addEventListener("change", function () { PIPE.on = this.value; pipeStore(); pipePaint(); });
    $("pcPipe").addEventListener("change", function (e) { var b = e.target.closest("[data-pipe-on]"); if (b) pipeToggle([+b.dataset.pipeOn]); });
    pipeLoad();
    $("pcBatch").addEventListener("click", batchAsk);  // HERESY 1562
    $("postChain").addEventListener("click", function (e) {
      if (!e.target.closest("#pcBatchStop")) return;
      e.target.disabled = true;
      fetch("/lab/chain/batch/stop", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).then(function (r) { return r.json(); }).then(paintBatch, function () { /* said on the next look */ });
    });
    watchBatch();                                    // a batch running when the page opened
    $("postChain").addEventListener("change", function (e) { if (e.target.id !== "pcDebuzz") saveChainPrefs(); if (e.target.id === "pcStems") paintRemasterSay(); cvPaint(); });
    $("postChain").addEventListener("mouseenter", paintRemasterSay);
    if ($("remasterPanel")) { $("remasterPanel").addEventListener("change", paintRemasterSay); $("remasterPanel").addEventListener("input", paintRemasterSay); }
    paintRemasterSay();
    paintBar();
    bar.addEventListener("click", function (e) {
      var b = e.target.closest("[data-step-panel]");
      if (b) select(b.dataset.stepPanel);
      else if (e.target.closest("[data-tree-step]")) select(TREE);   // HERESY 1540
    });
    auPanel();                                       // HERESY 1512: the Audio I/O's panel, made here (the lab answers it)
    STEPS.forEach(function (s) { var p = $(s.id); if (p) p.classList.add("is-step"); });
    window.addEventListener("heresy-step", function (e) {
      if (!state.take || e.detail.name !== state.take.name) return;
      state.done[e.detail.step] = true;
      paint();
    });
    window.addEventListener("heresy-derived", function (e) {
      if (!state.take || e.detail.name !== state.take.name) return;
      var kinds = {};
      e.detail.files.forEach(function (f) { kinds[f.kind] = true; if (f.step) kinds[f.step] = true; });   // 1460: a plugin's step
      STEPS.forEach(function (s) { if (s.plugin) state.done[s.step] = !!kinds[s.step]; });
      paintPluginSources();
      state.done.stems = !!kinds.stems;
      state.done.remaster = !!kinds.remaster;
      state.done.upscale = !!kinds.upscale;
      state.done.debuzz = !!kinds.debuzz;
      state.done.gate = !!kinds.gate;                 // HERESY 1547
      paint();
    });
    select(recall() || STEPS[0].id);
    window.addEventListener("heresy-derived", paintTree);   // HERESY 1540: its count as the branches come
    document.addEventListener("click", function (e) { var mb = e.target.closest && e.target.closest("#derivedTree [data-dv-mon]"); if (mb) monRow(mb); });   // HERESY 1548
    window.addEventListener("heresy-derived", function () { if (MON.on) monPaintRows(MON.on); });
    fetch("/lab/audio/devices", { priority: "low" }).then(function (r) { return r.json(); }).then(function (d) { monSet((d.monitor || {}).out || ""); }, function () { /* no lab: no monitor */ });
    loadPlugins();                                   // HERESY 1460
    cvInit();                                        // HERESY 1506
  }

  function paintBar() {
    var bar = $("postSteps");
    bar.innerHTML = STEPS.map(function (s, i) {
      var own = s.plugin && !s.builtin ? ' translate="no"' : "";   // HERESY 1460: a plugin's words are its own (1553: the studio's translated)
      var head = !i || STEPS[i - 1].group !== s.group ? '<span class="ps-group">' + GROUPS[s.group || "finish"] + "</span>" : "";   // HERESY 1461
      return head + (i ? '<span class="ps-arrow" aria-hidden="true">›</span>' : "") +
        '<button type="button" role="tab" class="ps-step' + (s.plugin ? " is-plugin" : "") + '" data-step-panel="' + s.id + '"><span class="ps-mark">' + (i + 1) +
        '</span><span class="ps-text"' + own + '><span class="ps-name">' + esc(s.label) + '</span><span class="ps-say">' + esc(s.say) + "</span></span></button>";
    }).join("") +
      // HERESY 1540: what is made from the take, its own place at the column's end
      '<span class="ps-group">This Take</span><button type="button" role="tab" class="ps-step ps-tree" data-tree-step="1"><span class="ps-mark">0</span>' +
      '<span class="ps-text"><span class="ps-name">Made from This Take</span><span class="ps-say">the branches of every step</span></span></button>';
    cvPaint();                                       // HERESY 1506: a plugin's steps are nodes too
  }

  // ---- HERESY 1506 (Viktor 16.10.2026: «По нодам Огранщика… идею ComfyUI расположения нод на канвасе. Вертикально страница на 1080p
  // разрешении не прокручивается, всё под рукой и на глазах. Щёлк по ноде - модальное окно как в Творце с Композитором и музыкантом,
  // навигация вперёд-назад по нодам»): the Refiner as a canvas of nodes beside its list (Canvas / List in the room's head, kept per
  // browser). The take, the import, every step (the studio's and the plugins') a node where the work flows; thin wires the chain's
  // way, bright ones the way the take in hand went (each branch's source); a node its number, name, what it does, ✓ when done for
  // the take, how many branches it made, a pulse while it runs. A click lifts its panel over the room (moved there while open and
  // put back where it stood: a fixed box inside a transformed ancestor would not hold, 1499); ‹ › and Alt+← → go to the step before
  // and after, Esc or a click beside it back. Dragged nodes stay where put (Arrange lays them out anew)
  var CV = { on: false, pos: {}, open: "", el: null, hold: null, drag: null, quietUntil: 0, timer: 0 };
  var CV_KEY = "yue2.refinerView", CV_POS = "yue2.refinerCanvasPos", NODE_W = 196, NODE_H = 84;
  var KIND_NODE = { debuzz: "debuzzPanel", upscale: "upscalePanel", stems: "derivedPanel", remaster: "remasterPanel", daw: "dawPanel", gate: "gatePanel" };   // 1547
  var LANE = { debuzzPanel: [1, 0], upscalePanel: [2, 0], derivedPanel: [3, 0], dawPanel: [4, 0], remasterPanel: [4, 1], gatePanel: [3, 1],   // 1547
               spectrumPanel: [1, 2], inspectPanel: [2, 2], glossPanel: [3, 2], audioPanel: [4, 2],   // 1512: the Audio I/O under the Remaster
               "pl-ruach-leadPanel": [1, 1], "pl-ruach-vupscalePanel": [2, 1] };   // HERESY 1553: the stems mended, the second row's way to the gateway
  // HERESY 1508: the chain's nodes: what «up to here» names, and the chain's own check a node is bypassed by (the Remaster always runs)
  var CHAIN_NODE = { debuzzPanel: { until: "debuzz", box: "pcDebuzz", key: "debuzz" }, upscalePanel: { until: "upscale", box: "pcUpscale", key: "upscale" },
                     derivedPanel: { until: "stems", box: "pcStems", key: "stems" }, remasterPanel: { until: "remaster" } };
  function bypassed(id) {
    if (pipeOf()) { var ix = pipeIdx(id), off = pipeOff(); return ix.length > 0 && ix.every(function (i) { return off.indexOf(i) >= 0; }); }   // HERESY 1553
    var c = CHAIN_NODE[id], b = c && c.box && $(c.box); return !!b && !b.checked;
  }
  function chainNode(id) { return pipeOf() ? (pipeIdx(id).length ? { pipe: true, box: true } : null) : CHAIN_NODE[id]; }   // HERESY 1553
  function chainBusy() { return !!($("pcRun") && $("pcRun").disabled); }
  function toggleBypass(id) {
    if (pipeOf()) { pipeToggle(pipeIdx(id)); return; }   // HERESY 1553
    var c = CHAIN_NODE[id], b = c && c.box && $(c.box);
    if (!b) return;
    b.checked = !b.checked;
    b.dispatchEvent(new Event("change", { bubbles: true }));   // kept as a click on the chain's own check is: its prefs, the remaster's line
    cvPaint();
  }
  function runUntil(id) {
    if (pipeOf()) {                                  // HERESY 1553: the pipeline up to this node's last step in it
      var pb = state.take && !chainBusy() ? pipeBody(id) : null;
      if (!pb) return false;
      startChain(pb);
      return true;
    }
    var c = CHAIN_NODE[id];
    if (!c || !state.take || chainBusy()) return false;
    saveChainPrefs();
    var body = chainBody();
    body.until = c.until;
    if (c.key) body[c.key] = true;                   // the node run up to runs, bypassed or not
    body.inspect = body.spectrum = body.gloss = false;   // up to here and no further
    startChain(body);
    return true;
  }
  // HERESY 1523: how the room opens, the Engine's Refiner Room tab: as it was left (the default), always the list, always the canvas
  var OPENS_KEY = "yue2.refinerOpens";
  function recallOpens() { try { return localStorage.getItem(OPENS_KEY) || "last"; } catch (e) { return "last"; } }
  function openAs() {
    var o = recallOpens();
    if (o === "list" || o === "canvas") return o === "canvas";
    try { return localStorage.getItem(CV_KEY) === "canvas"; } catch (e) { return false; }
  }
  function opensInit() {
    var box = $("refinerOpens");
    if (!box) return;
    var now = recallOpens();
    Array.prototype.forEach.call(box.querySelectorAll('input[name="refinerOpens"]'), function (r) { r.checked = r.value === now; });
    box.addEventListener("change", function (e) {
      var r = e.target.closest('input[name="refinerOpens"]');
      if (!r) return;
      try { localStorage.setItem(OPENS_KEY, r.value); } catch (x) { /* private mode */ }
      if (r.value !== "last" && (r.value === "canvas") !== CV.on) cvSet(r.value === "canvas");   // the room as chosen, at once
    });
  }
  function cvRecall() {
    try { CV.on = openAs(); CV.pos = JSON.parse(localStorage.getItem(CV_POS) || "{}") || {}; } catch (e) { CV.pos = {}; }
    clRecall();                                       // HERESY 1516
  }
  function cvStore() {
    try { localStorage.setItem(CV_KEY, CV.on ? "canvas" : "list"); localStorage.setItem(CV_POS, JSON.stringify(CV.pos)); } catch (e) { /* private mode */ }
  }
  function cvNodes() {
    var title = state.take ? (($("postTitle") && $("postTitle").textContent.trim()) || state.take.name) : "";   // 1506b: the head's title, the name only without it
    var out = [{ id: "take", name: "The take", say: state.take ? title : "pick a take on the right", col: 0, row: 0, own: !!state.take },
               { id: "chain", name: "Chain", say: chainSay(), col: 0, row: 1, own: true },   // HERESY 1510
               { id: "importPanel", name: "Import a Track", say: "a track from elsewhere", col: 0, row: 2 }];
    var pl = 0;
    STEPS.forEach(function (st, i) {
      var at = LANE[st.id] || [5, pl++];
      out.push({ id: st.id, name: st.label, say: st.say, n: String(i + 1), col: at[0], row: at[1], step: st, own: !!st.plugin && !st.builtin });
    });
    CV.clones.forEach(function (c) {                  // HERESY 1516: a clone beside its own, its own choice said
      var o = out.filter(function (x) { return x.id === c.of; })[0];
      if (!o) return;
      var at = clPlace(o, out);
      out.push({ id: c.id, name: (o.step.plugin && !o.step.builtin ? o.step.label : tr(o.step.label)) + " " + clMark(c.n), say: clSay(c), n: o.n, col: at[0], row: at[1], step: o.step, clone: c.of, own: true });
    });
    return out;
  }
  // HERESY 1510: the chain's node: its steps as they are set (bypassed ones out), its run on it
  function chainSay() {
    var pp = pipeOf();                               // HERESY 1553: a pipeline's steps as they are set
    if (pp) return pipeSteps().map(function (x) { return x.step === "plugin" && !pipeBuiltin(x) ? pipeName(x) : tr(pipeName(x)); }).join(" \u203a ");
    var on = [["pcDebuzz", "Debuzz"], ["pcUpscale", "Upscale"], ["pcStems", "Stems"], [null, "Remaster"], ["pcUpEnd", "Upscale"]].filter(function (x) { return !x[0] || ($(x[0]) && $(x[0]).checked); });
    return on.map(function (x) { return tr(x[1]); }).join(" \u203a ");
  }
  function chainMeta() {
    var j = chain.job;
    if (!j || !j.steps || j.status === "none") return "";
    var done = j.steps.filter(function (x) { return x.status === "done"; }).length, cur = j.steps.filter(function (x) { return x.status === "running"; })[0];
    if (j.status === "running") return '<span class="pcv-made mono">' + done + "/" + j.steps.length + "</span>" + (cur ? '<span class="pcv-made">' + esc(tr(stepWord(cur))) + "</span>" : "");
    var bad = j.steps.filter(function (x) { return x.status === "failed"; })[0];
    if (j.status === "failed") return '<span class="pcv-by">\u2715 ' + esc(tr(bad ? stepWord(bad) : "failed")) + "</span>";
    return '<span class="pcv-done">\u2713</span><span class="pcv-made mono">' + done + "/" + j.steps.length + "</span>";
  }
  function cvNodeOf(m) { return !m ? "take" : m.kind === "plugin" ? "pl-" + m.plugin + "-" + m.step + "Panel" : KIND_NODE[m.kind] || ""; }
  function cvById() { var D = window.HeresyDerived, by = {}; (D && D.list ? D.list() : []).forEach(function (m) { by[m.id] = m; }); return by; }
  function cvNodeOfValue(v, by) {                       // an option of a Source: the take, a branch's file or a set of stems
    if (v === "") return "take";
    var d = /^derived\/([^/]+)/.exec(String(v || ""));
    return d && by[d[1]] ? cvNodeOf(by[d[1]]) : "";
  }
  var SRC_SEL = { gatePanel: "gtSource", debuzzPanel: "dbSource", upscalePanel: "upSource", derivedPanel: "stSource", remasterPanel: "rmSource", inspectPanel: "inSource", glossPanel: "glossSource" };
  function srcSelect(id) { return SRC_SEL[id] ? $(SRC_SEL[id]) : /^pl-/.test(id) ? document.querySelector("#" + id + " .pl-source") : null; }
  var OUT_NODES = { take: 1, debuzzPanel: 1, upscalePanel: 1, derivedPanel: 1, remasterPanel: 1, dawPanel: 1, gatePanel: 1 };   // 1547
  function cvLink(from, to) {                           // the newest branch of «from» as «to»'s source, as a pick in its Source would make it
    var sel = srcSelect(to), by = cvById(), best = null, say = chain.hooks && chain.hooks.toast;
    if (!sel || from === to) { if (say) say(tr("{0} takes no source").replace("{0}", tr(cvTitle(to).replace(/^\d+ \u00b7 /, ""))), "bad"); return false; }
    Array.prototype.forEach.call(sel.options, function (o) {
      if (o.disabled || cvNodeOfValue(o.value, by) !== from) return;
      var d = /^derived\/([^/]+)/.exec(o.value), t = d && by[d[1]] ? String(by[d[1]].created || "") : "";
      if (!best || t > best.t) best = { v: o.value, t: t };
    });
    if (!best) { if (say) say(tr("Nothing from {0} for this take yet").replace("{0}", from === "take" ? tr("The take") : tr(cvTitle(from).replace(/^\d+ \u00b7 /, ""))), "bad"); return false; }
    sel.value = best.v;
    sel.dataset.touched = "1";                          // a plugin's source his pick from now on (1465)
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    cvPaint();
    return true;
  }
  function cvFlows() {
    var D = window.HeresyDerived, list = D && D.list ? D.list() : [], byId = {}, flows = {}, count = {};
    list.forEach(function (m) { byId[m.id] = m; });
    var nodeOf = cvNodeOf;
    list.forEach(function (m) {
      var to = nodeOf(m);
      if (!to) return;
      count[to] = (count[to] || 0) + 1;
      var src = String(m.source || m.set || ""), dir = /^derived\/([^/]+)/.exec(src), from = dir ? nodeOf(byId[dir[1]]) : "take";
      if (from && from !== to) flows[from + ">" + to] = true;
    });
    return { flows: flows, count: count, total: list.length };
  }
  function cvWireList(f) {
    var w = [["take", "debuzzPanel"], ["debuzzPanel", "upscalePanel"], ["upscalePanel", "derivedPanel"], ["derivedPanel", "dawPanel"], ["derivedPanel", "remasterPanel"],
             ["dawPanel", "gatePanel", 1], ["gatePanel", "remasterPanel", 1],   // HERESY 1547: a mix through the gateway, the gateway's into the Remaster
             ["take", "spectrumPanel", 1], ["take", "inspectPanel", 1], ["take", "glossPanel", 1], ["importPanel", "take", 1]];
    STEPS.forEach(function (st) { if (st.plugin) w.push(st.spec && st.spec.input === "stems" ? ["derivedPanel", st.id] : ["take", st.id, 1]); });
    if (pipeOf()) {                                  // HERESY 1553: the pipeline's way, step to step (the checks hang off the file before them)
      w.forEach(function (x) { x[2] = 1; });
      var last = "take", seen = {};
      pipeSteps().forEach(function (st) {
        var id = pipeNode(st), check = st.step === "inspect" || st.step === "spectrum" || st.step === "gloss";
        if (id !== last && !seen[last + ">" + id]) { seen[last + ">" + id] = 1; w = w.filter(function (x) { return !(x[0] === last && x[1] === id); }); w.push([last, id, 0]); }
        if (!check) last = id;
      });
    }
    CV.clones.forEach(function (c) { w.filter(function (x) { return x[1] === c.of; }).forEach(function (x) { w.push([x[0], c.id, 1]); }); });   // HERESY 1516: a clone's way is its own's
    var have = {};
    w.forEach(function (x) { have[x[0] + ">" + x[1]] = x; x[3] = !!f.flows[x[0] + ">" + x[1]]; });
    Object.keys(f.flows).forEach(function (k) { if (!have[k]) { var a = k.split(">"); have[k] = [a[0], a[1], 0, true]; w.push(have[k]); } });   // the way it went, where the chain's way does not run
    var by = cvById();                                   // HERESY 1510: each step's Source as it is set, the way its next run will take
    Object.keys(SRC_SEL).concat(STEPS.filter(function (st) { return st.plugin; }).map(function (st) { return st.id; })).forEach(function (id) {
      var sel = srcSelect(id), from = sel ? cvNodeOfValue(sel.value, by) : "";
      if (!from || from === id) return;
      var k = from + ">" + id;
      if (have[k]) have[k][4] = true; else { have[k] = [from, id, 0, false, true]; w.push(have[k]); }
    });
    return w;
  }
  function cvBox() {
    var box = $("postCanvas");
    if (box) return box;
    box = document.createElement("section");
    box.className = "post-canvas"; box.id = "postCanvas"; box.hidden = true;
    box.innerHTML = '<svg class="pcv-wires" aria-hidden="true"></svg><div class="pcv-nodes"></div>';   // 1517: its tools in the row above, not over a node
    var chain = $("postChain"), view = $("view-post");
    if (chain && chain.parentNode) chain.parentNode.insertBefore(box, chain.nextSibling); else if (view) view.appendChild(box);
    var bar = document.createElement("div");            // HERESY 1515: the setups by name, a row of their own above the canvas (the chain's row, empty there)
    bar.className = "pcv-bar"; bar.id = "pcvBar"; bar.hidden = true;
    bar.innerHTML = '<span class="pcv-profiles" id="pcvProfiles"></span>' +
      '<span class="pcv-tools"><span class="row-hint">drag a node where you want it; a click opens it</span>' +   // HERESY 1517
      '<button type="button" class="btn ghost small" id="pcvArrange" data-tip="Lay the nodes out anew">Arrange</button></span>';
    box.parentNode.insertBefore(bar, box);
    pfPaint();                                        // 1516: Save as… at once, the chips when the lab answers
    bar.addEventListener("click", function (e) {
      if (e.target.closest("#pcvArrange")) { if (CV.arrange) CV.arrange(); return; }   // HERESY 1517
      if (e.target.closest("#pcvSaveAs")) { pfSaveAs(); return; }
      var b = e.target.closest(".pcv-prof"); if (b) pfSet(b.dataset.prof);
    });
    bar.addEventListener("contextmenu", function (e) {   // a profile's own menu
      var b = e.target.closest(".pcv-prof");
      if (!b || !window.HeresyMenu) return;
      e.preventDefault();
      var name = b.dataset.prof;
      window.HeresyMenu.open(e.clientX, e.clientY, [
        { label: "Set it", icon: "\u21ba", action: function () { pfSet(name); } },
        { label: "Keep the setup as it is now under this name", icon: "\u2913", action: function () { pfSave(name); } },
        { sep: true },
        { label: "Delete", icon: "\u2715", danger: true, action: function () { pfDelete(name); } }]);
    });
    return box;
  }
  function cvFit() {
    var box = $("postCanvas");
    if (!box || box.hidden) return;
    var bar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--playbar-h")) || 0;
    box.style.height = Math.max(420, Math.floor(window.innerHeight - box.getBoundingClientRect().top - bar - 16)) + "px";
  }
  function cvPaint() {
    var box = $("postCanvas");
    if (!box || box.hidden || CV.drag) return;
    cvFit();
    var nodes = cvNodes(), f = cvFlows(), W = box.clientWidth, H = box.clientHeight, PAD = 22;
    var rows = Math.max(3, nodes.reduce(function (n, x) { return Math.max(n, x.row + 1); }, 0));
    var cols = Math.max(5, nodes.reduce(function (n, x) { return Math.max(n, x.col + 1); }, 0));   // 1506b: a sixth only for the plugins
    var row = state.take && window.HeresyCollection && window.HeresyCollection.row ? window.HeresyCollection.row(state.take.name) : null, secs = row && row.seconds;
    var html = nodes.map(function (nd) {
      var p = CV.pos[nd.id], x = p ? p[0] * (W - NODE_W) : PAD + nd.col * (W - 2 * PAD - NODE_W) / (cols - 1), y = p ? p[1] * (H - NODE_H) : PAD + nd.row * (H - 2 * PAD - NODE_H) / (rows - 1);
      var st = nd.step, done = st && !nd.clone && state.done[st.step], tab = st && !nd.clone && document.querySelector('#postSteps [data-step-panel="' + st.id + '"]');   // 1516: the step's marks on its own
      var made = nd.id === "take" ? f.total : nd.id === "chain" ? 0 : f.count[nd.id] || 0, own = nd.own ? ' translate="no"' : "";
      var meta = (done ? '<span class="pcv-done">\u2713</span>' : "") + (made ? '<span class="pcv-made">' + esc(tr("{0} made").replace("{0}", made)) + "</span>" : "") +
        (nd.id === "take" && secs ? '<span class="pcv-made mono">' + Math.floor(secs / 60) + ":" + ("0" + Math.floor(secs % 60)).slice(-2) + "</span>" : "");
      if (nd.id === "chain") meta = chainMeta();          // HERESY 1510
      var by = bypassed(nd.id);                         // HERESY 1508
      if (by) meta = '<span class="pcv-by">bypassed</span>' + meta;
      var cls = "pcv-node pcv-" + (st ? st.group || "finish" : nd.id === "take" ? "take" : "import") + (st && st.plugin ? " is-plugin" : "") + (done ? " is-done" : "") + (by ? " is-bypassed" : "") +
        ((tab && tab.classList.contains("is-running")) || (nd.id === "chain" && chain.job && chain.job.status === "running") ? " is-running" : "") + (st && !nd.clone && st.id === state.current ? " is-active" : "") + (nd.id === CV.open ? " is-open" : "") + (nd.clone ? " is-clone" : "");
      return '<button type="button" class="' + cls + '" data-node="' + esc(nd.id) + '" style="left:' + Math.round(x) + "px;top:" + Math.round(y) + 'px">' +
        '<span class="pcv-top">' + (nd.n ? '<span class="pcv-n">' + nd.n + "</span>" : "") + '<span class="pcv-name"' + (st && st.plugin && !st.builtin || nd.clone ? ' translate="no"' : "") + ">" + esc(nd.name) + "</span>" +
        '<i class="pcv-live" aria-hidden="true"></i></span><span class="pcv-say"' + own + ">" + esc(nd.say) + '</span><span class="pcv-meta">' + meta + "</span>" +
        (srcSelect(nd.id) ? '<i class="pcv-port is-in" aria-hidden="true"></i>' : "") +   // HERESY 1510: where a wire is drawn to, and from
        (OUT_NODES[nd.id] || (st && st.plugin) ? '<i class="pcv-port is-out" data-port="' + esc(nd.id) + '" data-tip="Drag to another node: its source becomes this one\'s newest"></i>' : "") + "</button>";
    }).join("");
    var holder = box.querySelector(".pcv-nodes");
    if (holder.dataset.html !== html) { holder.innerHTML = html; holder.dataset.html = html; }
    CV.wires = cvWireList(f);
    cvWires();
  }
  function cvWires() {
    var box = $("postCanvas"), svg = box && box.querySelector(".pcv-wires");
    if (!svg) return;
    var at = {};
    Array.prototype.forEach.call(box.querySelectorAll(".pcv-node"), function (n) { at[n.dataset.node] = { x: n.offsetLeft, y: n.offsetTop, w: n.offsetWidth, h: n.offsetHeight }; });
    function path(a, b) {
      if (Math.abs(a.x - b.x) < a.w * .6) {                // one above the other: from the edge that faces the other
        var up = b.y < a.y, y1 = up ? a.y : a.y + a.h, y2 = up ? b.y + b.h : b.y, cx = a.x + a.w / 2, bx = b.x + b.w / 2, k = Math.max(24, Math.abs(y2 - y1) / 2) * (up ? -1 : 1);
        return "M" + cx + "," + y1 + " C" + cx + "," + (y1 + k) + " " + bx + "," + (y2 - k) + " " + bx + "," + y2;
      }
      var ltr = b.x >= a.x, x1 = ltr ? a.x + a.w : a.x, x2 = ltr ? b.x : b.x + b.w, y1 = a.y + a.h / 2, y2 = b.y + b.h / 2, d = Math.max(40, Math.abs(x2 - x1) / 2) * (ltr ? 1 : -1);
      return "M" + x1 + "," + y1 + " C" + (x1 + d) + "," + y1 + " " + (x2 - d) + "," + y2 + " " + x2 + "," + y2;
    }
    svg.innerHTML = (CV.wires || []).map(function (w) {
      var a = at[w[0]], b = at[w[1]];
      return a && b ? '<path class="pcv-wire' + (w[2] ? " is-any" : "") + (w[3] ? " is-lit" : "") + (w[4] ? " is-chosen" : "") + (bypassed(w[0]) || bypassed(w[1]) ? " is-bypass" : "") + '" data-wire="' + esc(w[0] + ">" + w[1]) + '" d="' + path(a, b) + '"/>' : "";
    }).join("");
  }
  // ---- HERESY 1515 (Viktor 16.10.2026: «Профили по сетапу нод»): the Refiner's setups by name, kept by the lab (every browser of the studio):
  // what its steps are set to and where the canvas's nodes stand, never a take's own sources; a click on one sets every step as a hand would
  // (each control says change, its own prefs kept by its own module), its right-click sets it, keeps the setup as it is now under its name,
  // or deletes it (asked first)
  var PF = { list: [], loaded: false };
  var PF_SKIP = /Source$|^specCompare$|^rmTrim|^mx|^au|^imp|^pcv|^hc/;   // a take's own: its sources and its cut points
  function fieldsOf(root, into) {                   // 1516: a root's settings (the page's, a panel's), by id, a plugin's by its key
    var fields = into || {};
    Array.prototype.forEach.call(root.querySelectorAll("input[id], select[id], textarea[id]"), function (el) {
      if (PF_SKIP.test(el.id) || /^(file|button|search|submit)$/.test(el.type)) return;
      fields[el.id] = el.type === "checkbox" || el.type === "radio" ? el.checked : el.value;
    });
    Array.prototype.forEach.call(root.querySelectorAll("[data-pl-key]"), function (el) {
      var panel = el.closest(".pl-panel");
      if (panel) fields["pl:" + panel.id + ":" + el.dataset.plKey] = el.type === "checkbox" ? el.checked : el.value;
    });
    return fields;
  }
  function fieldsSet(f) {                            // as a hand would: each control says change; a choice this studio has not is skipped
    var n = 0;
    Object.keys(f || {}).forEach(function (k) {
      var el;
      if (k.indexOf("pl:") === 0) {
        var a = k.split(":"), panel = $(a[1]);
        el = panel ? panel.querySelector('[data-pl-key="' + a.slice(2).join(":").replace(/"/g, "") + '"]') : null;
      } else el = $(k);
      if (!el || (el.id && PF_SKIP.test(el.id))) return;
      if (el.type === "checkbox" || el.type === "radio") { if (el.checked === !!f[k]) return; el.checked = !!f[k]; }
      else {
        var v = String(f[k]);
        if (el.value === v) return;
        if (el.tagName === "SELECT" && !Array.prototype.some.call(el.options, function (o) { return o.value === v; })) return;
        el.value = v;
      }
      el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true }));
      n++;
    });
    return n;
  }
  function setupNow() {
    var fields = {};
    [$("view-post"), $("ndBox")].filter(Boolean).forEach(function (root) { fieldsOf(root, fields); });
    if (CV.swap) {                                    // 1516: a clone open: its settings are the clone's, the step's own are those kept aside
      var cl = cloneOf(CV.swap.id);
      if (cl && CV.el) cl.fields = fieldsOf(CV.el);
      Object.keys(CV.swap.keep).forEach(function (k) { fields[k] = CV.swap.keep[k]; });
    }
    return { fields: fields, canvas: JSON.parse(JSON.stringify(CV.pos || {})), clones: JSON.parse(JSON.stringify(CV.clones)) };
  }
  function setupApply(setup) {
    if (CV.swap) cvClose();                           // 1516: the step's own settings back in their panel first
    var n = fieldsSet(setup && setup.fields);
    if (setup && Array.isArray(setup.clones)) { CV.clones = JSON.parse(JSON.stringify(setup.clones)); clStore(); }   // 1516; a profile from before the clones leaves them
    if (setup && setup.canvas) { CV.pos = JSON.parse(JSON.stringify(setup.canvas)); cvStore(); var h = $("postCanvas") && $("postCanvas").querySelector(".pcv-nodes"); if (h) h.dataset.html = ""; }
    cvPaint();
    return n;
  }
  // ---- HERESY 1516 (Viktor 16.10.2026: «Клонирование некоторых нод»): a step's node cloned: a second Remaster (an Upscale, a Debuzz, a plugin's
  // step) with its own settings, beside its own. Its window is the step's own panel with the clone's settings in it while it is open (the
  // step's own are put back on closing), so a run from there runs with them and its file lands in the tree as the step's always does
  var CLONES_KEY = "yue2.refinerClones", CLONABLE = { debuzzPanel: 1, upscalePanel: 1, remasterPanel: 1, gatePanel: 1 }, CLONE_MAX = 8;   // 1547
  CV.clones = []; CV.swap = null;
  function clRecall() {
    try { CV.clones = (JSON.parse(localStorage.getItem(CLONES_KEY) || "[]") || []).filter(function (c) { return c && c.id && c.of && c.n; }); } catch (e) { CV.clones = []; }
  }
  function clStore() { try { localStorage.setItem(CLONES_KEY, JSON.stringify(CV.clones)); } catch (e) { /* private mode */ } }
  function clonable(id) { return !!CLONABLE[id] || /^pl-/.test(id); }
  function cloneOf(id) { return CV.clones.filter(function (c) { return c.id === id; })[0] || null; }
  function clMark(n) { return n >= 2 && n <= 20 ? String.fromCharCode(0x2460 + n - 1) : "#" + n; }   // the step's own is \u2460, its clones \u2461…
  function clSay(c) {                                // the clone's own choice, as its panel names it: the remaster's preset, the upscale's mode…
    var f = c.fields || {}, keys = Object.keys(f), num = "";
    for (var i = 0; i < keys.length; i++) {
      var el = $(keys[i]);
      if (!el) continue;
      if (el.tagName === "SELECT") {
        var o = Array.prototype.filter.call(el.options, function (x) { return x.value === String(f[keys[i]]); })[0];
        if (o) return o.textContent.trim();
      } else if (!num && el.type === "number") {
        var lab = el.closest("label"), cap = lab && lab.querySelector(".label");
        num = (cap ? cap.textContent.trim() + " " : "") + f[keys[i]];
      }
    }
    return num || tr("its own settings");
  }
  function clPlace(o, out) {                         // beside its own in its column: half a row down, then further, then up
    var maxRow = Math.max(2, out.reduce(function (m, x) { return Math.max(m, Math.ceil(x.row)); }, 0));
    var taken = out.filter(function (x) { return x.col === o.col; }).map(function (x) { return x.row; });
    var tries = [0.5, 1, 1.5, 2, -0.5, -1, -1.5, -2];
    for (var i = 0; i < tries.length; i++) {
      var r = o.row + tries[i];
      if (r < 0 || r > maxRow) continue;
      if (taken.every(function (t) { return Math.abs(t - r) >= 0.5; })) return [o.col, r];
    }
    return [o.col, Math.min(maxRow, o.row + 0.25)];
  }
  function cvClone(id) {
    var src = cloneOf(id), of = src ? src.of : id, el = $(of);
    if (!el || !clonable(of)) return "";
    if (CV.clones.filter(function (c) { return c.of === of; }).length >= CLONE_MAX) { pfSay(tr("Eight clones of one step are enough"), true); return ""; }
    var used = CV.clones.filter(function (c) { return c.of === of; }).map(function (c) { return c.n; }), n = 2;
    while (used.indexOf(n) >= 0) n++;
    var cl = { id: "clone-" + of + "-" + n, of: of, n: n, fields: src ? JSON.parse(JSON.stringify(src.fields || {})) : fieldsOf(el) };
    CV.clones.push(cl); clStore(); cvPaint();
    pfSay(tr("{0} cloned: its window holds its own settings").replace("{0}", cvTitle(cl.id).replace(/^\d+ \u00b7 /, "")));
    return cl.id;
  }
  function cvUnclone(id, asked) {
    var cl = cloneOf(id);
    if (!cl) return;
    var go = asked || !window.HeresyDialog ? Promise.resolve(true)
      : window.HeresyDialog.confirm(tr("Delete the clone «{0}»? Its settings go with it.").replace("{0}", cvTitle(id).replace(/^\d+ \u00b7 /, "")), { ok: tr("Delete"), cancel: tr("Cancel"), danger: true });
    go.then(function (yes) {
      if (yes !== true) return;
      if (CV.open === id) cvClose();
      CV.clones = CV.clones.filter(function (c) { return c.id !== id; });
      delete CV.pos[id];
      clStore(); cvStore(); cvPaint();
    });
  }
  function pfSay(text, bad) { if (chain.hooks && chain.hooks.toast) chain.hooks.toast(text, bad ? "bad" : undefined); }
  function pfPaint() {
    var box = $("pcvProfiles");
    if (!box) return;
    box.innerHTML = '<span class="pcv-prof-cap">Profiles</span>' + PF.list.map(function (p) {
      return '<button type="button" class="btn ghost small pcv-prof" data-prof="' + esc(p.name) + '" translate="no" data-tip="' + esc(tr("Set every step as it was kept under this name") + " \u00b7 " + p.saved) + '">' + esc(p.name) + "</button>";
    }).join("") + '<button type="button" class="btn ghost small" id="pcvSaveAs" data-tip="The setup as it is now (the steps\' settings and where the nodes stand, never a take\'s sources) under a name">Save as\u2026</button>';
  }
  function pfAsk(body) {
    return fetch("/lab/refiner/profiles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || r.status); return j; }); })
      .then(function (d) { PF.list = d.profiles || []; pfPaint(); return d; });
  }
  function pfLoad() {
    fetch("/lab/refiner/profiles", { priority: "low" }).then(function (r) { return r.json(); })
      .then(function (d) { PF.list = d.profiles || []; PF.loaded = true; pfPaint(); }, function () { PF.loaded = true; pfPaint(); });
  }
  function pfSave(name) {
    return pfAsk({ op: "save", name: name, setup: setupNow() }).then(function () { pfSay(tr("Profile «{0}» kept").replace("{0}", name)); },
      function (e) { pfSay(tr("The profiles could not be kept: {0}").replace("{0}", e.message), true); });
  }
  function pfSaveAs() {
    if (!window.HeresyDialog) return;
    window.HeresyDialog.prompt(tr("A name for this setup"), "", { ok: tr("Keep it"), cancel: tr("Cancel"), max: 60 }).then(function (name) {
      name = String(name || "").trim();
      if (name) pfSave(name);
    });
  }
  function pfSet(name) {
    var p = PF.list.filter(function (x) { return x.name === name; })[0];
    if (!p) return 0;
    var n = setupApply(p.setup);
    pfSay(tr("Profile «{0}» set: {1} settings changed").replace("{0}", name).replace("{1}", n));
    return n;
  }
  function pfDelete(name) {
    var go = window.HeresyDialog ? window.HeresyDialog.confirm(tr("Delete the profile «{0}»?").replace("{0}", name), { ok: tr("Delete"), cancel: tr("Cancel"), danger: true }) : Promise.resolve(true);
    go.then(function (yes) {
      if (yes !== true) return;
      pfAsk({ op: "delete", name: name }).then(function () { pfSay(tr("Profile «{0}» deleted").replace("{0}", name)); },
        function (e) { pfSay(tr("The profiles could not be kept: {0}").replace("{0}", e.message), true); });
    });
  }
  function cvSet(on) {
    CV.on = !!on;
    if (CV.on && !PF.loaded) pfLoad();                // HERESY 1515
    cvStore();
    if (!CV.on) cvClose();
    var view = $("view-post"), box = cvBox(), btn = $("postView");
    if (view) view.classList.toggle("is-canvas", CV.on);
    box.hidden = !CV.on;
    if ($("pcvBar")) $("pcvBar").hidden = !CV.on;      // HERESY 1515
    if (btn) {
      btn.textContent = CV.on ? "List" : "Canvas";
      btn.setAttribute("aria-pressed", String(CV.on));
      btn.dataset.tip = CV.on ? "The Refiner as its list of steps" : "The Refiner as a canvas of nodes: where the work flows, what each step takes and makes; a click on a node opens it";
    }
    cvPaint();
    clearInterval(CV.timer);
    if (CV.on) CV.timer = setInterval(function () { if (!document.hidden && $("view-post") && !$("view-post").classList.contains("is-hidden")) cvPaint(); }, 1000);   // the pulses
    window.dispatchEvent(new Event("resize"));
  }
  function cvOrder() {                               // 1510: the chain second; 1516: a clone after its own
    var out = ["take", "chain"];
    STEPS.forEach(function (st) { out.push(st.id); CV.clones.forEach(function (c) { if (c.of === st.id) out.push(c.id); }); });
    return out;
  }
  function cvTitle(id) {
    if (id === "take") return tr("Made from This Take");
    if (id === "chain") return tr("Chain");
    var cl = cloneOf(id);                             // HERESY 1516
    if (cl) return cvTitle(cl.of) + " " + clMark(cl.n);
    var st = STEPS.filter(function (x) { return x.id === id; })[0];
    return st ? (STEPS.indexOf(st) + 1) + " \u00b7 " + tr(st.label) : id === "importPanel" ? tr("Import a Track") : id;
  }
  function cvModal() {
    var back = $("ndVeil"), box = $("ndBox");
    if (box) return { back: back, box: box, body: box.querySelector(".nd-body") };
    back = document.createElement("div"); back.className = "nd-veil"; back.id = "ndVeil"; back.hidden = true;
    box = document.createElement("div"); box.className = "nd-box"; box.id = "ndBox"; box.hidden = true;
    box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true");
    box.innerHTML = '<div class="nd-head"><button type="button" class="btn ghost small nd-prev" data-nd="prev"></button><strong class="nd-title"></strong>' +
      '<button type="button" class="btn ghost small nd-next" data-nd="next"></button>' +
      '<button type="button" class="btn primary small nd-until" data-nd="until" hidden data-tip="The chain up to this node and no further, with the chain\'s own settings: a node bypassed on the way is skipped, this one runs">Run up to here</button>' +
      '<span class="spacer"></span>' +
      '<span class="row-hint nd-keys">Alt+\u2190 \u2192 the step before and after \u00b7 Esc back</span>' +
      '<button type="button" class="btn ghost small" data-nd="close">Close</button></div><div class="nd-body"></div>';
    document.body.appendChild(back); document.body.appendChild(box);
    back.addEventListener("click", function () { cvClose(); });
    box.addEventListener("click", function (e) {
      var b = e.target.closest("[data-nd]");
      if (!b) return;
      if (b.dataset.nd === "until") { if (runUntil(CV.open)) b.disabled = true; return; }   // HERESY 1508
      if (b.dataset.nd === "close") cvClose(); else cvStep(b.dataset.nd === "next" ? 1 : -1);
    });
    return { back: back, box: box, body: box.querySelector(".nd-body") };
  }
  function cvOpen(id) {
    var cl = cloneOf(id), pid = cl ? cl.of : id;      // HERESY 1516: a clone's window is its own's panel
    var el = id === "take" ? document.querySelector("#view-post > .dv-tree-box") : id === "chain" ? $("postChain") : $(pid);   // 1510: the chain's strip
    if (!el && CV.open === id) el = CV.el;
    if (!el) return false;
    cvClose(true);
    if (STEPS.some(function (st) { return st.id === pid; })) select(pid);   // the step's own: its events, its place in the list
    if (cl) { CV.swap = { id: id, keep: fieldsOf(el) }; fieldsSet(cl.fields); }   // 1516: the clone's settings in, the step's own kept aside
    var m = cvModal();
    CV.hold = document.createComment("node " + id);
    el.parentNode.insertBefore(CV.hold, el);
    m.body.appendChild(el);
    if (el.tagName === "DETAILS") el.open = true;
    CV.open = id; CV.el = el;
    var order = cvOrder(), i = order.indexOf(id), prev = order[(i - 1 + order.length) % order.length], next = order[(i + 1) % order.length];
    m.box.querySelector(".nd-title").textContent = cvTitle(id);
    m.box.classList.toggle("is-clone", !!cl);          // HERESY 1516
    m.box.querySelector(".nd-prev").textContent = "\u2039 " + cvTitle(prev).replace(/^\d+ \u00b7 /, "");
    m.box.querySelector(".nd-next").textContent = cvTitle(next).replace(/^\d+ \u00b7 /, "") + " \u203a";
    if (window.HeresyChoices) window.HeresyChoices.within(el);   // HERESY 1509: its choices in sight, no dropdowns in a node's window
    var until = m.box.querySelector(".nd-until");    // HERESY 1508: the chain's nodes run up to themselves from here too
    until.hidden = !chainNode(id);                   // HERESY 1553: a pipeline's node too
    until.disabled = !state.take || chainBusy();
    m.back.hidden = false; m.box.hidden = false;
    document.body.dataset.node = id;
    cvPaint();
    window.dispatchEvent(new Event("resize"));            // a picture shown measures its new width
    return true;
  }
  function cvClose(quiet) {
    if (!CV.open) return;
    if (CV.swap) {                                    // HERESY 1516: the clone's settings kept, the step's own back in its panel
      var cl = cloneOf(CV.swap.id), keep = CV.swap.keep;
      if (cl && CV.el) { cl.fields = fieldsOf(CV.el); clStore(); }
      CV.swap = null;
      fieldsSet(keep);
    }
    if (window.HeresyChoices) window.HeresyChoices.close();   // HERESY 1509: a list opened from it goes with it
    if (CV.hold && CV.hold.parentNode) { CV.hold.parentNode.insertBefore(CV.el, CV.hold); CV.hold.remove(); }
    CV.open = ""; CV.el = null; CV.hold = null;
    if (!quiet) {
      var m = cvModal();
      m.back.hidden = true; m.box.hidden = true;
      delete document.body.dataset.node;
      cvPaint();
      window.dispatchEvent(new Event("resize"));
    }
  }
  function cvStep(d) {
    var order = cvOrder(), i = order.indexOf(CV.open);
    if (i < 0) return;
    cvOpen(order[(i + d + order.length) % order.length]);
  }
  function cvInit() {
    cvRecall();
    opensInit();                                      // HERESY 1523
    var head = document.querySelector("#view-post > .post-head"), daw = $("postDaw");
    if (head && !$("postView")) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "btn ghost small post-view"; b.id = "postView";
      if (daw) head.insertBefore(b, daw); else head.appendChild(b);
      b.addEventListener("click", function () { cvSet(!CV.on); });
    }
    var box = cvBox();
    box.addEventListener("pointerdown", function (e) {
      var port = e.target.closest(".pcv-port.is-out");   // HERESY 1510: a wire drawn from here
      if (port && e.button === 0) {
        e.preventDefault(); e.stopPropagation();
        var r = box.getBoundingClientRect(), pr = port.getBoundingClientRect();
        CV.link = { from: port.dataset.port, x: pr.left + pr.width / 2 - r.left, y: pr.top + pr.height / 2 - r.top };
        try { port.setPointerCapture(e.pointerId); } catch (x) { /* gone */ }
        return;
      }
      var nd = e.target.closest(".pcv-node");
      if (!nd || e.button !== 0) return;
      CV.drag = { el: nd, id: nd.dataset.node, x0: e.clientX, y0: e.clientY, left: nd.offsetLeft, top: nd.offsetTop, moved: false };
      try { nd.setPointerCapture(e.pointerId); } catch (x) { /* gone */ }
    });
    box.addEventListener("pointermove", function (e) {
      if (CV.link) {                                     // HERESY 1510: the wire follows the pointer
        var r = box.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, svg = box.querySelector(".pcv-wires"), t = svg.querySelector(".pcv-temp");
        if (!t) { t = document.createElementNS("http://www.w3.org/2000/svg", "path"); t.setAttribute("class", "pcv-wire pcv-temp"); svg.appendChild(t); }
        var k = Math.max(40, Math.abs(x - CV.link.x) / 2);
        t.setAttribute("d", "M" + CV.link.x + "," + CV.link.y + " C" + (CV.link.x + k) + "," + CV.link.y + " " + (x - k) + "," + y + " " + x + "," + y);
        return;
      }
      var d = CV.drag;
      if (!d) return;
      var dx = e.clientX - d.x0, dy = e.clientY - d.y0;
      if (!d.moved && Math.abs(dx) + Math.abs(dy) < 5) return;
      d.moved = true;
      d.el.classList.add("is-dragged");
      d.el.style.left = Math.max(0, Math.min(box.clientWidth - d.el.offsetWidth, d.left + dx)) + "px";
      d.el.style.top = Math.max(0, Math.min(box.clientHeight - d.el.offsetHeight, d.top + dy)) + "px";
      cvWires();
    });
    function linkDrop(e) {                               // HERESY 1510: dropped on a node, it takes this one's newest as its source
      var l = CV.link;
      CV.link = null;
      var t = box.querySelector(".pcv-temp");
      if (t) t.remove();
      CV.quietUntil = Date.now() + 300;
      var at = e && document.elementFromPoint(e.clientX, e.clientY), nd = at && at.closest && at.closest(".pcv-node");
      if (l && nd && nd.dataset.node !== l.from) cvLink(l.from, nd.dataset.node);
    }
    box.addEventListener("pointerup", function (e) { if (CV.link) linkDrop(e); }, true);
    box.addEventListener("pointercancel", function () { if (CV.link) linkDrop(null); }, true);
    function drop() {
      var d = CV.drag;
      CV.drag = null;
      if (!d || !d.moved) return;
      d.el.classList.remove("is-dragged");
      CV.pos[d.id] = [d.el.offsetLeft / Math.max(1, box.clientWidth - NODE_W), d.el.offsetTop / Math.max(1, box.clientHeight - NODE_H)];
      CV.quietUntil = Date.now() + 300;                  // the click that ends a drag opens nothing (by time: the node it fell on is drawn anew)
      cvStore();
      box.querySelector(".pcv-nodes").dataset.html = "";
      cvPaint();
    }
    box.addEventListener("pointerup", drop);
    box.addEventListener("pointercancel", drop);
    function arrange() { CV.pos = {}; cvStore(); box.querySelector(".pcv-nodes").dataset.html = ""; cvPaint(); }
    CV.arrange = arrange;                             // HERESY 1517: its button is in the row above the canvas
    // HERESY 1508: a node's right-click, as ComfyUI's: open it, run the chain up to it, bypass it in the chain, lay the canvas out anew
    box.addEventListener("contextmenu", function (e) {
      var nd = e.target.closest(".pcv-node");
      if (!nd || !window.HeresyMenu) return;
      e.preventDefault();
      var id = nd.dataset.node, c = chainNode(id), items = [{ label: "Open", icon: "\u2197", action: function () { cvOpen(id); } }];
      if (c) items.push({ label: "Run up to here", icon: "\u25b6", disabled: !state.take || chainBusy(), action: function () { runUntil(id); },
                          hint: "The chain up to this node and no further, with the chain's own settings: a node bypassed on the way is skipped, this one runs" });
      if (c && c.box) items.push({ label: bypassed(id) ? "Back into the chain" : "Bypass in the chain", icon: "\u2933", action: function () { toggleBypass(id); },
                                   hint: "The chain runs past this node: its own check in the chain's row, turned off or on" });
      if (clonable(id) || cloneOf(id)) items.push({ label: "Clone", icon: "\u2750", action: function () { cvClone(id); },   // HERESY 1516
                                                    hint: "A second node of this step with its own settings, beside it: its window holds them, and a run from there runs with them" });
      if (cloneOf(id)) items.push({ label: "Delete the clone", icon: "\u2715", danger: true, action: function () { cvUnclone(id); } });
      items.push({ sep: true }, { label: "Arrange", icon: "\u2316", action: arrange });
      window.HeresyMenu.open(e.clientX, e.clientY, items);
    });
    box.addEventListener("click", function (e) {
      if (e.target.closest("#pcvArrange")) { arrange(); return; }
      var nd = e.target.closest(".pcv-node");
      if (!nd) return;
      if (Date.now() < CV.quietUntil) return;
      cvOpen(nd.dataset.node);
    });
    document.addEventListener("keydown", function (e) {
      if (!CV.open) return;
      if (document.querySelector(".hd-back, .cmp-back, .ds-back, .hc-pop, .hm-menu") || document.fullscreenElement || document.body.classList.contains("daw-full")) return;   // theirs first (1509: a list, a menu)
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cvClose(); return; }
      if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) { e.preventDefault(); e.stopPropagation(); cvStep(e.key === "ArrowRight" ? 1 : -1); }
    }, true);
    window.addEventListener("heresy-derived", function () { cvPaint(); });
    // another room puts the lifted node back, as the Creator's frames are (a run started there, a tab, a key)
    if (window.MutationObserver) new MutationObserver(function () { if (CV.open && document.body.dataset.tab !== "post") cvClose(); }).observe(document.body, { attributes: true, attributeFilter: ["data-tab"] });
    window.addEventListener("heresy-step", function () { cvPaint(); });
    window.addEventListener("resize", function () { if (!CV.drag) { var h = box.querySelector(".pcv-nodes"); if (h) h.dataset.html = ""; cvPaint(); } });
    cvSet(CV.on);
  }

  // ---- HERESY 1460 (Viktor 15.10.2026: «написать всё как единый плагин, который мы не выложим в паблик, но он будет висеть у меня
  // в пайплайне»): the steps of the plugins in the studio's user/plugins/ (the lab's GET /plugins), after the studio's own. Each
  // panel is drawn from what its plugin says: a source (the take or a file of its tree) and its fields; Run asks the lab
  // (POST /plugin/run), the branch lands in the tree like any other. Without a plugin nothing here shows.
  var plug = { steps: {}, timer: 0 };
  function loadPlugins() {
    if (!window.fetch) return;
    fetch("/lab/plugins", { priority: "low" }).then(function (r) { return r.ok ? r.json() : { plugins: [] }; }).then(function (d) {
      var added = 0, after = $("debuzzPanel") || $("upscalePanel");
      (d.plugins || []).forEach(function (pl) {
        (pl.steps || []).forEach(function (st) {
          var id = "pl-" + pl.id + "-" + st.id + "Panel";
          if ($(id)) return;
          var s = { id: id, step: "plugin:" + pl.id + ":" + st.id, label: st.label, say: st.say || pl.name, plugin: pl.id, pstep: st.id, spec: st, name: pl.name,
                    group: st.group || "finish", builtin: !!pl.builtin };   // HERESY 1553: the studio's own, its words translated
          var ai = st.after ? STEPS.map(function (x) { return x.id; }).indexOf(st.after) : -1;
          if (ai >= 0) {                                 // HERESY 1553: where it belongs, after the step it follows
            while (STEPS[ai + 1] && STEPS[ai + 1].afterOf === st.after) ai++;
            s.afterOf = st.after;
            STEPS.splice(ai + 1, 0, s);
          } else {
            var at = STEPS.map(function (x) { return x.group; }).indexOf("setup");   // HERESY 1512: a plugin's steps before the Setup's
            if (at < 0) STEPS.push(s); else STEPS.splice(at, 0, s);
          }
          plug.steps[id] = s;
          var panel = pluginPanel(s);
          var box = document.querySelector("#view-post > .dv-tree-box"), ref = s.afterOf && $(s.afterOf);   // HERESY 1461: before what is made, as the studio's own
          if (ref && ref.parentNode) ref.parentNode.insertBefore(panel, ref.nextSibling);   // HERESY 1553
          else if (box) box.parentNode.insertBefore(panel, box); else if (after && after.parentNode) after.parentNode.appendChild(panel);
          panel.classList.add("is-step");
          added++;
        });
      });
      if (!added) return;
      paintBar();
      pipePaint();                                   // HERESY 1553: a pipeline's chips name the steps now here
      var want = recall();
      select(STEPS.some(function (s) { return s.id === want; }) ? want : state.current);
      paintPluginSources();
    }).catch(function () { /* no lab, or an older one: the studio's own steps */ });
  }
  function field(s, p) {
    var key = ' data-pl-key="' + esc(p.key) + '"', tip = p.tip ? ' data-tip="' + esc(p.tip) + '"' : "", no = s.builtin ? "" : ' translate="no"';   // HERESY 1553
    if (p.type === "check") {
      return '<label class="field pl-check"' + tip + '><input type="checkbox"' + key + (p.default ? " checked" : "") + ' /> <span' + no + ">" + esc(p.label) + "</span></label>";
    }
    if (p.type === "file") {                            // HERESY 1557: a file of this take's tree or another take, filled with the tree
      return '<label class="field"' + tip + '><span class="label"' + no + ">" + esc(p.label) + '</span><select class="pl-file"' + key + '><option value="">choose a file</option></select></label>';
    }
    var input = p.type === "select"
      ? "<select" + key + ">" + p.options.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (o[0] === p.default ? " selected" : "") + no + ">" + esc(o[1]) + "</option>"; }).join("") + "</select>"
      : '<input type="number"' + key + ' min="' + p.min + '" max="' + p.max + '" step="' + p.step + '" value="' + p.default + '" />';
    return '<label class="field rm-num"' + tip + '><span class="label"' + no + ">" + esc(p.label) + "</span>" + input + "</label>";
  }
  function pluginPanel(s) {
    var d = document.createElement("details");
    d.className = "drawer pl-panel";
    d.id = s.id;
    var no = s.builtin ? "" : ' translate="no"';         // HERESY 1553: the studio's own steps speak the page's language
    d.innerHTML = '<summary><span class="chev" aria-hidden="true"></span><span class="sum-head"' + no + '><span class="sum-name">' + esc(s.label) +
      '</span><span class="sum-say">' + esc(s.say) + "</span></span></summary>" +
      '<div class="drawer-body rm-body"><div class="rm-grid">' +
      (s.spec.input === "stems"                       // HERESY 1464: a step on a set of stems picks a set, not a file
        ? '<label class="field"><span class="label">A set of stems</span><select class="pl-source pl-stems"></select></label>'
        : '<label class="field"><span class="label">Source</span><select class="pl-source" data-prefer="' + esc((s.spec.prefer || []).join(",")) +
          '"><option value="">the take</option></select></label>') +
      s.spec.params.map(function (p) { return field(s, p); }).join("") + "</div>" +
      '<div class="dv-actions"><button type="button" class="btn primary small pl-run"' + no + ">" + esc(s.label) + '</button><span class="row-hint mono pl-state"></span>' +
      (s.spec.gpu ? '<span class="row-hint mono pl-gpu" data-tip="Runs on a card of the lab\'s jobs, in their turn">GPU</span>' : "") + "</div>" +
      (s.spec.tip ? '<p class="row-hint"' + no + ">" + esc(s.spec.tip) + "</p>" : "") + "</div>";
    d.querySelector(".pl-run").addEventListener("click", function () { runPlugin(s, d); });
    d.querySelector(".pl-source").addEventListener("change", function () { this.dataset.touched = "1"; });   // HERESY 1465: his pick stays
    return d;
  }
  function paintPluginSources() {
    var D = window.HeresyDerived, files = D && D.files ? D.files() : [];
    var sets = [], seen = {};                        // HERESY 1464: the take's sets of stems, each once, by its folder
    files.forEach(function (f) {
      if (f.kind !== "stems") return;
      var dir = String(f.source).split("/").slice(0, 2).join("/"), m = /\(([^)]*)\)\s*$/.exec(f.label || "");
      if (seen[dir]) return;
      seen[dir] = true;
      sets.push({ dir: dir, label: (m ? m[1] : dir).replace(/^Stems, /, "") });
    });
    Array.prototype.forEach.call(document.querySelectorAll(".pl-panel .pl-stems"), function (sel) {
      var keep = sel.value, run = sel.closest(".pl-panel").querySelector(".pl-run");
      sel.innerHTML = sets.length ? sets.map(function (x) { return '<option value="' + esc(x.dir) + '" translate="no">' + esc(x.label) + "</option>"; }).join("")
        : '<option value="">' + esc(tr("Split the take into stems first")) + "</option>";
      sel.value = sets.some(function (x) { return x.dir === keep; }) ? keep : sets.length ? sets[sets.length - 1].dir : "";
      run.disabled = !sets.length;
    });
    paintPluginFiles(files.filter(function (f) { return f.kind !== "stems" || !/instrumental/i.test(f.label); }));   // HERESY 1557
    Array.prototype.forEach.call(document.querySelectorAll(".pl-panel .pl-source:not(.pl-stems)"), function (sel) {
      var keep = sel.value;
      sel.innerHTML = '<option value="">the take</option>' + files.filter(function (f) { return f.kind !== "stems" || !/instrumental/i.test(f.label); }).map(function (f) {
        return '<option value="' + esc(f.source) + '" translate="no">' + esc(f.label.replace(/^↳ /, "")) + "</option>";
      }).join("");
      sel.value = Array.prototype.some.call(sel.options, function (o) { return o.value === keep; }) ? keep : "";
      var want = (sel.dataset.prefer || "").split(",").filter(Boolean), hit = "";
      if (!sel.dataset.touched && want.length) {       // HERESY 1465: the step's own kind of source (a voice stem…), the last of it
        want.some(function (w) {
          files.forEach(function (f) { if (String(f.source).split("/").pop().replace(/\.[^.]+$/, "") === w) hit = f.source; });
          return !!hit;
        });
        if (hit) sel.value = hit;
      }
    });
  }
  function paintPluginFiles(files) {                // HERESY 1557: a step's file field: this take's tree, then the other takes
    var mine = state.take ? state.take.name : "", others = window.ruachTakes ? window.ruachTakes().filter(function (t) { return t.name !== mine; }) : [];
    Array.prototype.forEach.call(document.querySelectorAll(".pl-panel .pl-file"), function (sel) {
      var keep = sel.value;
      sel.innerHTML = '<option value="">choose a file</option>' + files.map(function (f) {
        return '<option value="' + esc(f.source) + '" translate="no">' + esc(f.label.replace(/^↳ /, "")) + "</option>"; }).join("") +
        others.map(function (t) { return '<option value="take:' + esc(t.name) + '" translate="no">\u2197 ' + esc(t.title) + "</option>"; }).join("");
      sel.value = Array.prototype.some.call(sel.options, function (o) { return o.value === keep; }) ? keep : "";
    });
  }
  function pluginSay(d, text, bad) { var el = d.querySelector(".pl-state"); el.textContent = text || ""; el.classList.toggle("is-bad", !!bad); }
  function runPlugin(s, d) {
    if (!state.take) return;
    var params = {};
    Array.prototype.forEach.call(d.querySelectorAll("[data-pl-key]"), function (el) {
      params[el.dataset.plKey] = el.type === "checkbox" ? el.checked : el.value;
    });
    var body = { name: state.take.name, source: d.querySelector(".pl-source").value, plugin: s.plugin, step: s.pstep, params: params };
    var run = d.querySelector(".pl-run"), name = state.take.name;
    run.disabled = true;
    pluginSay(d, tr("Started: {0}").replace("{0}", s.label));
    fetch("/lab/plugin/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (b) { if (!r.ok) throw new Error(b.error || r.status); return b; }); })
      .then(function (job) {
        if (window.HeresyDerived) window.HeresyDerived.refresh();
        watchPlugin(s, d, name, job.id);
      })
      .catch(function (e) { run.disabled = false; pluginSay(d, tr("It did not start: {0}").replace("{0}", e.message), true); });
  }
  function watchPlugin(s, d, name, id) {
    fetch("/lab/derived?name=" + encodeURIComponent(name), { priority: "low" }).then(function (r) { return r.json(); }).then(function (r) {
      var job = (r.running || []).filter(function (j) { return j.id === id; })[0], made = (r.derived || []).some(function (m) { return m.id === id; });
      if (job && job.status === "failed") { d.querySelector(".pl-run").disabled = false; pluginSay(d, job.error || "failed", true); return; }
      if (made || !job) {
        d.querySelector(".pl-run").disabled = false;
        pluginSay(d, made ? tr("Done: it is in the tree") : "");
        if (window.HeresyDerived) window.HeresyDerived.refresh();
        if (made && window.RuachChime) window.RuachChime.ring(true);
        return;
      }
      var el = Math.round(Date.now() / 1000 - (job.started || Date.now() / 1000));
      pluginSay(d, tr("Running… {0}").replace("{0}", el >= 60 ? Math.floor(el / 60) + ":" + ("0" + (el % 60)).slice(-2) : el + " s"));
      setTimeout(function () { watchPlugin(s, d, name, id); }, 2000);
    }).catch(function () { setTimeout(function () { watchPlugin(s, d, name, id); }, 4000); });
  }
  function tr(s) { return window.RuachI18n && window.RuachI18n.t ? window.RuachI18n.t(s) : s; }   // (1562: the batch's words too)

  // ---- HERESY 1512 (Viktor 16.10.2026: «Предлагаю отдельной вкладкой в Огранщике создать детект и настройку аудио интерфейсов как физических,
  // так и виртуальных»): the machine's audio interfaces as the lab sees them (GET /lab/audio/devices), the analog gateway's output, input and
  // rate kept (POST /lab/audio/gateway, user/audio.json, where a plugin's analog step reads them), an input's floor (POST /lab/audio/probe)
  var au = { data: null, loading: false };
  var RATES = [44100, 48000, 88200, 96000, 176400, 192000];
  function auPanel() {
    if ($("audioPanel")) return;
    var d = document.createElement("details");
    d.className = "drawer au-panel";
    d.id = "audioPanel";
    d.innerHTML = '<summary><span class="chev" aria-hidden="true"></span><span class="sum-head"><span class="sum-name">Audio I/O</span>' +
      '<span class="sum-say">The machine\'s audio interfaces, physical and virtual, and the analog gateway\'s choice of them</span></span></summary>' +
      '<div class="drawer-body au-body"><div class="au-head"><button type="button" class="btn ghost small" id="auLook">Look again</button><span class="row-hint" id="auSaid"></span></div>' +
      '<div class="au-cols"><section class="au-col"><div class="peek-cap">Physical</div><div id="auPhysical" class="au-list"></div></section>' +
      '<section class="au-col"><div class="peek-cap">Virtual</div><div id="auVirtual" class="au-list"></div></section></div>' +
      '<div class="au-gate"><div class="peek-cap">The analog gateway</div><div class="rm-grid">' +
      '<label class="field" data-tip="The interface the gateway plays a take out through, to the gear"><span class="label">Out to the gear</span><select id="auOut"></select></label>' +
      '<label class="field" data-tip="The interface the gateway records the gear back from"><span class="label">In from the gear</span><select id="auIn"></select></label>' +
      '<label class="field" data-tip="The rate both run at: the ones the chosen output and input both take"><span class="label">Rate</span><select id="auRate"></select></label></div>' +
      '<div class="dv-actions"><button type="button" class="btn primary small" id="auKeep">Keep</button>' +
      '<button type="button" class="btn ghost small" id="auProbe" data-tip="Two seconds from the input: with nothing playing into it, the converter\'s own noise">Measure the input\'s floor</button>' +
      '<button type="button" class="btn ghost small" id="auLoop" data-tip="A 1 kHz tone at −20 dBFS out through the output and back from the input: did it come back, its gain, the noise before it, its THD">Loop test</button>' +
      '<span class="row-hint mono" id="auState"></span></div>' +
      '<p class="row-hint">A plugin\'s analog step plays through the output chosen here and records from the input, at this rate.</p></div>' +
      // HERESY 1548: the monitor, a second output on Forge
      '<div class="au-gate au-mon"><div class="peek-cap">The monitor</div>' +
      '<p class="row-hint">A second output on Forge, to listen there: the analog gateway\'s return plays through it live while it prints, and any file of the tree plays through it from its «On Forge». The browser\'s own output stays as it is.</p><div class="rm-grid">' +
      '<label class="field" data-tip="The interface you listen through on Forge; not the gateway\'s own output"><span class="label">Monitor out</span><select id="auMon"></select></label>' +
      '<label class="field" data-tip="The rate it runs at"><span class="label">Rate</span><select id="auMonRate"></select></label></div>' +
      '<div class="dv-actions"><button type="button" class="btn primary small" id="auMonKeep">Keep</button>' +
      '<button type="button" class="btn ghost small" id="auMonTone" data-tip="A 1 kHz tone at −20 dBFS through the monitor for a second and a half">Tone</button>' +
      '<button type="button" class="btn ghost small" id="auMonStop" data-tip="Stop what plays through the monitor">Stop</button>' +
      '<span class="row-hint mono" id="auMonState"></span></div></div></div>';
    var box = document.querySelector("#view-post > .dv-tree-box");
    if (box) box.parentNode.insertBefore(d, box); else if ($("view-post")) $("view-post").appendChild(d);
    $("auLook").addEventListener("click", function () { auLoad(true); });
    $("auKeep").addEventListener("click", auKeep);
    $("auProbe").addEventListener("click", auProbe);
    $("auLoop").addEventListener("click", auLoop);   // HERESY 1514
    $("auMonKeep").addEventListener("click", monKeep);   // HERESY 1548
    $("auMonTone").addEventListener("click", monTone);
    $("auMonStop").addEventListener("click", function () { monCall("/lab/audio/monitor/stop", {}).then(function () { monSay(tr("Stopped")); monPaintRows(false); }); });
    $("auMon").addEventListener("change", function () { monRates(0); });
    $("auOut").addEventListener("change", auRates);
    $("auIn").addEventListener("change", auRates);
    window.addEventListener("heresy-post-step", function (e) { if (e.detail && e.detail.panel === "audioPanel") auLoad(false); });
  }
  // HERESY 1548: the monitor: kept, a tone, and the tree's «On Forge»
  var MON = { out: "", on: "", timer: 0 };
  function monSay(text, bad) { var el = $("auMonState"); if (el) { el.textContent = text || ""; el.classList.toggle("is-bad", !!bad); } }
  function monCall(url, body) {
    return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || r.status); return j; }); });
  }
  function monSet(out) { MON.out = out; document.body.classList.toggle("has-monitor", !!out); }
  function monRates(want) {
    var sel = $("auMonRate"), f = $("auMon")._formats && $("auMon")._formats[$("auMon").value], ok = RATES.filter(function (r) { return !f || !f.rates.length || f.rates.indexOf(r) >= 0; });
    var keep = want || +sel.value;
    sel.innerHTML = ok.map(function (r) { return '<option value="' + r + '">' + khz(r) + "</option>"; }).join("");
    sel.value = ok.indexOf(keep) >= 0 ? String(keep) : ok.indexOf(48000) >= 0 ? "48000" : String(ok[0] || "");
  }
  function monKeep() {
    monCall("/lab/audio/monitor", { out: $("auMon").value, rate: +$("auMonRate").value || 0 }).then(function (j) {
      if (au.data) au.data.monitor = j.monitor;
      monSet(j.monitor.out || "");
      monSay(j.monitor.out ? tr("Kept: {0}").replace("{0}", j.monitor.out + (j.monitor.rate ? " \u00b7 " + khz(j.monitor.rate) : "")) : tr("No monitor: the tree plays in the browser only"));
    }, function (e) { monSay(tr("Not kept: {0}").replace("{0}", e.message), true); });
  }
  function monTone() {
    if (!MON.out) { monSay(tr("Keep a monitor first"), true); return; }
    var go = window.HeresyDialog ? window.HeresyDialog.confirm(tr("A 1 kHz tone at \u221220 dBFS plays through {0} for a second and a half. Turn the monitors down if they are on.").replace("{0}", MON.out),
                                                             { ok: tr("Play it"), cancel: tr("Cancel") }) : Promise.resolve(true);
    go.then(function (yes) {
      if (yes !== true) return;
      monSay(tr("The tone plays\u2026"));
      monCall("/lab/audio/monitor/tone", {}).then(function () { monSay(tr("The tone went out through {0}").replace("{0}", MON.out)); }, function (e) { monSay(e.message, true); });
    });
  }
  function monPaintRows(on) {
    MON.on = on || "";
    Array.prototype.forEach.call(document.querySelectorAll("#derivedTree [data-dv-mon]"), function (b) { var x = b.dataset.dvMon === MON.on; b.classList.toggle("is-on", x); b.setAttribute("aria-pressed", x); });
    clearInterval(MON.timer);
    if (on !== false && MON.on !== "") MON.timer = setInterval(function () {   // ended by itself: the button goes dark
      fetch("/lab/audio/devices", { priority: "low" }).then(function (r) { return r.json(); }).then(function (d) { if (!d.playing || !d.playing.playing) monPaintRows(false); }, function () { /* try again */ });
    }, 2000);
  }
  function monRow(b) {
    if (!state.take) return;
    var path = b.dataset.dvMon, row = b.closest(".dv-node"), au2 = row && row.querySelector("audio");
    if (MON.on === path) { monCall("/lab/audio/monitor/stop", {}).then(function () { monPaintRows(false); }); return; }
    monCall("/lab/audio/monitor/play", { name: state.take.name, source: path, at: au2 ? au2.currentTime || 0 : 0, label: (row && row.querySelector(".dv-name") || {}).textContent || "" })
      .then(function () { monPaintRows(path); }, function (e) { if (chain.hooks && chain.hooks.toast) chain.hooks.toast(tr("Not on Forge: {0}").replace("{0}", e.message), "bad"); });
  }
  function auSay(text, bad) { var el = $("auState"); if (el) { el.textContent = text || ""; el.classList.toggle("is-bad", !!bad); } }
  function khz(r) { return (r / 1000).toString().replace(/\.0$/, "") + " kHz"; }
  function fmt(f) {
    if (!f) return "";
    var r = f.rates || [];
    return [f.channels ? f.channels + " ch" : "", f.bits ? f.bits + "-bit" : "", r.length ? khz(r[0]) + (r.length > 1 ? "\u2013" + khz(r[r.length - 1]) : "") : ""].filter(Boolean).join(" \u00b7 ");
  }
  function auLoad(again) {
    if (au.loading || (au.data && !again)) return;
    au.loading = true;
    $("auSaid").textContent = tr("Looking\u2026");
    fetch("/lab/audio/devices", { priority: "low" }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || r.status); return j; }); })
      .then(function (d) { au.data = d; au.loading = false; auPaint(); }, function (e) { au.loading = false; $("auSaid").textContent = tr("The lab did not answer: {0}").replace("{0}", e.message); });
  }
  function auPaint() {
    var d = au.data, cards = {}, order = [];
    (d.physical || []).forEach(function (p) { if (!cards[p.id]) { cards[p.id] = { name: p.card_name, driver: p.driver, devs: [] }; order.push(p.id); } cards[p.id].devs.push(p); });
    $("auPhysical").innerHTML = order.length ? order.map(function (id) {
      var c = cards[id], ways = c.devs.map(function (p) {
        var w = (p.in ? "in" : "") + (p.in && p.out ? " \u00b7 " : "") + (p.out ? "out" : ""), f = p.formats || {};
        return '<li translate="no"><b>' + esc(p.name) + '</b> <span class="au-way">' + esc(w) + "</span>" + (f.in || f.out ? ' <span class="row-hint">' + esc(fmt(f.in || f.out)) + "</span>" : "") + "</li>";
      });
      return '<div class="au-card"><div class="au-card-name" translate="no">' + esc(c.name) + ' <span class="row-hint">' + esc(id + " \u00b7 " + c.driver) + '</span></div><ul class="au-devs">' + ways.join("") + "</ul></div>";
    }).join("") : '<p class="row-hint">No sound card is seen here.</p>';
    var v = d.virtual || [];
    $("auVirtual").innerHTML = v.length ? '<ul class="au-devs">' + v.map(function (x) {
      return '<li><span class="au-kind">' + esc(x.kind) + '</span> <b translate="no">' + esc(x.name) + '</b> <span class="au-way">' + esc((x.in ? "in" : "") + (x.in && x.out ? " \u00b7 " : "") + (x.out ? "out" : "")) + "</span>" +
        (x.description ? ' <span class="row-hint" translate="no">' + esc(x.description) + "</span>" : "") + "</li>";
    }).join("") + "</ul>" : '<p class="row-hint">None.</p>';
    $("auSaid").textContent = (d.said || []).map(tr).join(" \u00b7 ");
    var ins = [], outs = [];
    (d.physical || []).forEach(function (p) { var lab = p.card_name + " \u00b7 " + p.name; if (p.out) outs.push([p.alsa, lab, p.formats && p.formats.out]); if (p.in) ins.push([p.alsa, lab, p.formats && p.formats.in]); });
    v.forEach(function (x) { var a = x.alsa || x.name, lab = x.kind + " \u00b7 " + a; if (x.out) outs.push([a, lab]); if (x.in) ins.push([a, lab]); });   // 1514: by its ALSA address
    var g = d.gateway || {};
    function fill(sel, list, want) {
      sel.innerHTML = '<option value="">\u2014 none \u2014</option>' + list.map(function (o) { return '<option value="' + esc(o[0]) + '" translate="no">' + esc(o[1]) + "</option>"; }).join("");
      sel.value = list.some(function (o) { return o[0] === want; }) ? want : "";
      sel._formats = {};
      list.forEach(function (o) { if (o[2]) sel._formats[o[0]] = o[2]; });
    }
    fill($("auOut"), outs, g.out); fill($("auIn"), ins, g.in);
    var mo = d.monitor || {};                         // HERESY 1548
    if ($("auMon")) { fill($("auMon"), outs, mo.out); monRates(mo.rate); monSay(mo.out ? tr("Kept: {0}").replace("{0}", mo.out + (mo.rate ? " \u00b7 " + khz(mo.rate) : "")) : ""); }
    monSet(mo.out || "");
    auRates(g.rate);
    auSay(g.out || g.in ? tr("Kept: {0}").replace("{0}", [g.out || "\u2014", g.in || "\u2014", g.rate ? khz(g.rate) : ""].filter(Boolean).join(" \u00b7 ")) : "");
  }
  function auRates(want) {
    var o = $("auOut")._formats && $("auOut")._formats[$("auOut").value], i = $("auIn")._formats && $("auIn")._formats[$("auIn").value];
    var ok = RATES.filter(function (r) { return (!o || !o.rates.length || o.rates.indexOf(r) >= 0) && (!i || !i.rates.length || i.rates.indexOf(r) >= 0); });
    var sel = $("auRate"), keep = typeof want === "number" && want ? want : +sel.value;
    sel.innerHTML = ok.map(function (r) { return '<option value="' + r + '">' + khz(r) + "</option>"; }).join("");
    sel.value = ok.indexOf(keep) >= 0 ? String(keep) : ok.indexOf(48000) >= 0 ? "48000" : String(ok[0] || "");
  }
  function auKeep() {
    var body = { out: $("auOut").value, in: $("auIn").value, rate: +$("auRate").value || 0 };
    fetch("/lab/audio/gateway", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || r.status); return j; }); })
      .then(function (j) { if (au.data) au.data.gateway = j.gateway; auSay(tr("Kept: {0}").replace("{0}", [j.gateway.out || "\u2014", j.gateway.in || "\u2014", j.gateway.rate ? khz(j.gateway.rate) : ""].filter(Boolean).join(" \u00b7 "))); },
            function (e) { auSay(tr("Not kept: {0}").replace("{0}", e.message), true); });
  }
  // HERESY 1514: the gateway's loop: a tone out and back, measured by the lab; a physical output asked first (somebody's monitors)
  function auLoop() {
    var out = $("auOut").value, inp = $("auIn").value, rate = +$("auRate").value || 48000;
    if (!out || !inp) { auSay(tr("Choose the output and the input first"), true); return; }
    var phys = (au.data && au.data.physical || []).some(function (p) { return p.alsa === out; });
    var go = phys && window.HeresyDialog ? window.HeresyDialog.confirm(tr("A 1 kHz tone at \u221220 dBFS plays through {0} for two seconds. Turn the monitors down if they are on.").replace("{0}", out),
                                                                       { ok: tr("Play it"), cancel: tr("Cancel") }) : Promise.resolve(true);
    go.then(function (yes) {
      if (yes !== true) return;
      $("auLoop").disabled = true;
      auSay(tr("The tone goes out and comes back\u2026"));
      fetch("/lab/audio/loop", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ out: out, in: inp, rate: rate, level: -20 }) })
        .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || r.status); return j; }); })
        .then(function (j) {
          $("auLoop").disabled = false;
          if (!j.answered) { auSay(tr("Nothing came back: the noise is {0} dBFS").replace("{0}", (j.noise_db || []).map(function (x) { return x == null ? "\u2014" : x.toFixed(1); }).join(" / ")), true); return; }
          var ch = function (arr, f) { return arr.map(function (x, k) { return (arr.length === 2 ? (k ? "R " : "L ") : "") + (x == null ? "\u2014" : f(x)); }).join(" \u00b7 "); };
          auSay(tr("It came back: gain {0} dB, noise {1} dBFS, THD {2} %")
            .replace("{0}", ch(j.gain_db, function (x) { return (x > 0 ? "+" : "") + x.toFixed(2); }))
            .replace("{1}", ch(j.noise_db, function (x) { return x <= -199 ? "silence" : x.toFixed(1); }))
            .replace("{2}", ch(j.thd_pct, function (x) { return x.toFixed(3); })));
        }, function (e) { $("auLoop").disabled = false; auSay(tr("The loop did not run: {0}").replace("{0}", e.message), true); });
    });
  }
  function auProbe() {
    var dev = $("auIn").value;
    if (!dev) { auSay(tr("Choose the input first"), true); return; }
    $("auProbe").disabled = true;
    auSay(tr("Listening to the input for two seconds\u2026"));
    fetch("/lab/audio/probe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ device: dev, rate: +$("auRate").value || 48000, seconds: 2 }) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || r.status); return j; }); })
      .then(function (j) {
        $("auProbe").disabled = false;
        var ch = j.rms_db.map(function (x, k) { return (j.rms_db.length === 2 ? (k ? "R " : "L ") : (k + 1) + ": ") + (x <= -199 ? "silence" : x.toFixed(1)) + " / " + (j.peak_db[k] <= -199 ? "\u2014" : j.peak_db[k].toFixed(1)); });
        auSay(tr("The input's floor, RMS / peak dBFS: {0}").replace("{0}", ch.join(" \u00b7 ")));
      }, function (e) { $("auProbe").disabled = false; auSay(tr("Not measured: {0}").replace("{0}", e.message), true); });
  }

  function setTake(take) {
    if (state.take && take && state.take.name === take.name) return;
    state.take = take;
    state.done = {};
    paint();
    cvPaint();                                       // HERESY 1506
    if (take && $("pcDebuzz")) {                         // HERESY 1054: an imported track has no YuE2 buzz
      $("pcDebuzz").checked = !/-import-/.test(take.name);
      paintChain(null);
      paintRemasterSay();
      watchChain(take.name);
    }
  }

  function unplug() {                              // HERESY 1460, for the checks: the plugins' steps out again
    Object.keys(plug.steps).forEach(function (id) { var el = $(id); if (el) el.remove(); });
    STEPS = STEPS.filter(function (s) { return !s.plugin; });
    plug.steps = {};
    paintBar();
    select(STEPS.some(function (s) { return s.id === state.current; }) ? state.current : STEPS[0].id);
  }
  window.HeresyPost = { init: init, setTake: setTake, select: select, has: function (id) { return STEPS.some(function (s) { return s.id === id; }); },
    plugins: loadPlugins, unplug: unplug,   // HERESY 1460
    pipes: function () { return { list: PIPE.list, on: PIPE.on, off: pipeOff(), body: pipeOf() ? pipeBody() : null }; }, pipeLoad: pipeLoad,   // HERESY 1553
    batch: startBatch, batchAsk: batchAsk, watchBatch: watchBatch,   // HERESY 1562
    audio: { load: function () { au.data = null; auLoad(true); }, data: function () { return au.data; } },   // HERESY 1512
    canvas: { set: function (on) { cvSet(on); }, on: function () { return CV.on; }, open: cvOpen, close: function () { cvClose(); }, opened: function () { return CV.open; },
              step: cvStep, paint: cvPaint, until: runUntil, bypass: toggleBypass, bypassed: bypassed, link: cvLink,
              setup: setupNow, apply: setupApply, profiles: function () { return PF.list.slice(); }, loadProfiles: pfLoad,
              clone: cvClone, unclone: cvUnclone, clones: function () { return JSON.parse(JSON.stringify(CV.clones)); },
              openAs: openAs } };   // HERESY 1523   // HERESY 1506, 1508, 1510, 1515, 1516
})();
