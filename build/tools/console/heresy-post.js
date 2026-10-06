// HERESY 1029: Post as numbered steps in a row instead of a stack of drawers (Viktor, 01.10.2026):
// one tool on screen at a time, in the order the work goes, and a step lights up once it has
// been done for the take in hand: measured, checked, split, remastered, upscaled.
// The tools tell it themselves with a "heresy-step" event {name, step}; the tree of files made
// from the take ("heresy-derived") tells which of stems, remaster and upscale exist.
(function () {
  "use strict";

  var STEPS = [
    { id: "spectrumPanel", step: "spectrum", label: "Spectrum", say: "look" },
    { id: "inspectPanel", step: "inspect", label: "Artifacts", say: "find faults" },
    { id: "debuzzPanel", step: "debuzz", label: "Debuzz", say: "the frame buzz out" },
    { id: "glossPanel", step: "gloss", label: "Lyrics", say: "check the words" },
    { id: "derivedPanel", step: "stems", label: "Stems", say: "split" },
    { id: "remasterPanel", step: "remaster", label: "Remaster", say: "the Debunker" },
    { id: "upscalePanel", step: "upscale", label: "Upscale", say: "redraw the top" }
  ];
  var KEY = "yue2.postStep";
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
  }

  function select(id) {
    if (!STEPS.some(function (s) { return s.id === id; })) id = STEPS[0].id;
    state.current = id;
    store(id);
    STEPS.forEach(function (s) {
      var p = $(s.id);
      if (!p) return;
      p.classList.toggle("is-step-off", s.id !== id);
      if (s.id === id && !p.open) p.open = true;           // its own toggle draws it
    });
    paint();
    window.dispatchEvent(new CustomEvent("heresy-post-step", { detail: { panel: id } }));   // HERESY 1129: the tree lights its branches
    window.dispatchEvent(new Event("resize"));             // a picture shown measures its new width
  }

  // ---- HERESY 1054: the chain (Viktor): Debuzz -> Upscale (optional) -> Remaster, then the checks;
  // run on Forge as one job (POST /lab/chain), watched here; closing the page stops nothing.
  var CHAIN_KEY = "yue2.chain", chain = { timer: 0, hooks: null, watching: "" };
  function chainPrefs() { try { return JSON.parse(localStorage.getItem(CHAIN_KEY) || "{}"); } catch (e) { return {}; } }
  function saveChainPrefs() {
    var p = { strength: $("pcStrength").value, upscale: $("pcUpscale").checked, upMode: $("pcUpMode").value, inspect: $("pcInspect").checked,
              spectrum: $("pcSpectrum").checked, gloss: $("pcGloss").checked, stems: $("pcStems").checked, stemsMode: $("pcStemsMode").value };
    try { localStorage.setItem(CHAIN_KEY, JSON.stringify(p)); } catch (e) { /* private mode */ }
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function chainMarkup() {
    var p = chainPrefs(), box = document.createElement("section");
    box.className = "post-chain"; box.id = "postChain";
    box.innerHTML =
      '<div class="pc-row"><strong class="pc-cap">Chain</strong>' +
      '<label class="pc-node is-req" data-tip="The VAE frame buzz out: needed for every YuE2 take; off for a track imported from elsewhere"><input type="checkbox" id="pcDebuzz" checked /> Debuzz ' +
        '<select id="pcStrength">' + [50, 60, 70, 80, 90, 100].map(function (v) { return '<option value="' + v / 100 + '"' + ((p.strength || "0.8") == v / 100 ? " selected" : "") + ">" + v + " %</option>"; }).join("") + "</select></label>" +
      '<span class="pc-arrow">›</span><label class="pc-node" data-tip="UniverSR redraws the top of the spectrum after Debuzz: subtle above 12 kHz, normal above 8, high above 6. One variant, the original kept below the cutoff; about 1.6 times the length of the song on a 3090."><input type="checkbox" id="pcUpscale"' + (p.upscale ? " checked" : "") + ' /> Upscale ' +
        '<select id="pcUpMode">' + ["subtle", "normal", "high"].map(function (m) { return "<option" + (p.upMode === m ? " selected" : "") + ">" + m + "</option>"; }).join("") + "</select></label>" +
      '<span class="pc-arrow">›</span><span class="pc-node is-req" data-tip="With the settings of the Remaster step below">Remaster <em id="pcRmSay"></em></span>' +
      '<span class="pc-then">then</span>' +
      '<label class="pc-check" data-tip="Then the final file is measured for faults: a tone that will not leave, the frame buzz of the VAE, clicks, clipping, dropouts, stereo that fights itself. The Artifacts step shows them."><input type="checkbox" id="pcInspect"' + (p.inspect !== false ? " checked" : "") + " /> Artifacts</label>" +
      '<label class="pc-check" data-tip="Then the spectrum of the final file, ready in the Spectrum step."><input type="checkbox" id="pcSpectrum"' + (p.spectrum ? " checked" : "") + " /> Spectrum</label>" +
      '<label class="pc-check" data-tip="Whisper on the take: are the words the lyrics"><input type="checkbox" id="pcGloss"' + (p.gloss ? " checked" : "") + " /> Lyrics</label>" +
      '<label class="pc-check" data-tip="Then the take itself is split into stems: vocals (voice and instrumental, BS-Roformer) or four (also drums, bass and the rest, htdemucs_ft). From the take, not from the remaster."><input type="checkbox" id="pcStems"' + (p.stems ? " checked" : "") + ' /> Stems <select id="pcStemsMode"><option value="vocals"' + (p.stemsMode !== "four" ? " selected" : "") +
        '>vocals</option><option value="four"' + (p.stemsMode === "four" ? " selected" : "") + ">four</option></select></label>" +
      '<span class="spacer"></span><button type="button" class="btn primary small" id="pcRun">Run the chain</button></div>' +
      '<div class="pc-status" id="pcStatus"></div>';
    return box;
  }
  function paintRemasterSay() {
    var D = window.HeresyDerived, s = D && D.remasterSettings ? D.remasterSettings() : null;
    if (!s || !$("pcRmSay")) return;
    // HERESY 1148: no preset here: the chain remasters a single file, and the preset balances stems
    $("pcRmSay").textContent = (s.hz432 === false ? "440" : "432") + " Hz · " + (s.loudnorm === false ? "no loudnorm" : s.lufs + " LUFS");
  }
  var MARK = { waiting: "·", running: "…", done: "✓", failed: "✕" };
  var NAMES = { debuzz: "Debuzz", upscale: "Upscale", remaster: "Remaster", inspect: "Artifacts", spectrum: "Spectrum", gloss: "Lyrics", stems: "Stems" };
  function paintChain(job) {
    var box = $("pcStatus");
    if (!box) return;
    if (!job || job.status === "none") { box.innerHTML = ""; $("pcRun").disabled = false; $("pcRun").textContent = "Run the chain"; $("pcRun").classList.remove("is-magic"); return; }
    var done = job.steps.filter(function (s) { return s.status === "done"; }).length, n = job.steps.length;
    var cur = job.steps.filter(function (s) { return s.status === "running"; })[0];
    box.innerHTML = '<div class="pc-bar' + (job.status === "running" ? " is-running" : job.status === "failed" ? " is-failed" : "") + '"><i style="width:' +
      Math.round(100 * (done + (cur ? 0.5 : 0)) / n) + '%"></i></div>' + job.steps.map(function (s) {
      return '<span class="pc-st is-' + s.status + '" title="' + esc(s.error || s.file || "") + '">' + MARK[s.status] + " " + NAMES[s.step] + "</span>";
    }).join('<span class="pc-arrow">›</span>') +
      (job.status === "done" ? '<span class="pc-say">done' + (job.final ? ": the remaster is in the tree" : "") + "</span>" : "") +
      (job.status === "failed" ? '<span class="pc-say is-bad">' + esc(job.error || "failed") + " · what was made before stays</span>" : "");
    $("pcRun").disabled = job.status === "running";
    $("pcRun").textContent = job.status === "running" ? "\u2728 Enjoy the magic\u2026 " + (done + 1) + " / " + n + (cur ? " \u00b7 " + NAMES[cur.step] : "") : "Run the chain";
    $("pcRun").classList.toggle("is-magic", job.status === "running");
  }
  function watchChain(name) {
    clearTimeout(chain.timer);
    chain.watching = name;
    fetch("/lab/chain?name=" + encodeURIComponent(name)).then(function (r) { return r.json(); }).then(function (job) {
      if (chain.watching !== name) return;
      if (state.take && state.take.name === name) paintChain(job);
      if (job.status === "running") { chain.timer = setTimeout(function () { watchChain(name); }, 2000); return; }
      if (window.HeresyDerived) window.HeresyDerived.refresh();
      if (job.status === "done" && chain.started === name) {
        chain.started = "";
        chain.hooks && chain.hooks.toast && chain.hooks.toast("The chain is done: " + job.steps.length + " steps; Artifacts now shows the final file");
        // HERESY 1059: the checks were made on the final file: the Artifacts step shows that one, not the take
        if (job.final && window.HeresyInspect && window.HeresyInspect.useSource && job.steps.some(function (s) { return s.step === "inspect"; })) window.HeresyInspect.useSource(job.final);
      }
      if (job.status === "failed" && chain.started === name) { chain.started = ""; chain.hooks && chain.hooks.toast && chain.hooks.toast("The chain stopped at " + (job.error || "a step"), "bad"); }
    }).catch(function () { /* the lab will answer on the next take */ });
  }
  function runChain() {
    if (!state.take) return;
    saveChainPrefs();
    var D = window.HeresyDerived, body = {
      name: state.take.name, debuzz: $("pcDebuzz").checked, strength: parseFloat($("pcStrength").value),
      upscale: $("pcUpscale").checked, upscale_mode: $("pcUpMode").value,
      // HERESY 1148: a single file has no voice stem to de-ess: the record says so instead of a de-ess that never ran
      remaster: D && D.remasterSettings ? Object.assign(D.remasterSettings(), { deess: false }) : {},
      inspect: $("pcInspect").checked, spectrum: $("pcSpectrum").checked, gloss: $("pcGloss").checked,
      stems: $("pcStems").checked, stems_mode: $("pcStemsMode").value };
    var fr = chain.hooks.frame ? chain.hooks.frame() : null;   // HERESY 1055
    if (fr) { body.period = fr.period; body.rate = fr.rate; }
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
    $("postChain").addEventListener("change", function (e) { if (e.target.id !== "pcDebuzz") saveChainPrefs(); });
    $("postChain").addEventListener("mouseenter", paintRemasterSay);
    if ($("remasterPanel")) { $("remasterPanel").addEventListener("change", paintRemasterSay); $("remasterPanel").addEventListener("input", paintRemasterSay); }
    paintRemasterSay();
    bar.innerHTML = STEPS.map(function (s, i) {
      return (i ? '<span class="ps-arrow" aria-hidden="true">›</span>' : "") +
        '<button type="button" role="tab" class="ps-step" data-step-panel="' + s.id + '"><span class="ps-mark">' + (i + 1) +
        '</span><span class="ps-text"><span class="ps-name">' + s.label + '</span><span class="ps-say">' + s.say + "</span></span></button>";
    }).join("");
    bar.addEventListener("click", function (e) {
      var b = e.target.closest("[data-step-panel]");
      if (b) select(b.dataset.stepPanel);
    });
    STEPS.forEach(function (s) { var p = $(s.id); if (p) p.classList.add("is-step"); });
    window.addEventListener("heresy-step", function (e) {
      if (!state.take || e.detail.name !== state.take.name) return;
      state.done[e.detail.step] = true;
      paint();
    });
    window.addEventListener("heresy-derived", function (e) {
      if (!state.take || e.detail.name !== state.take.name) return;
      var kinds = {};
      e.detail.files.forEach(function (f) { kinds[f.kind] = true; });
      state.done.stems = !!kinds.stems;
      state.done.remaster = !!kinds.remaster;
      state.done.upscale = !!kinds.upscale;
      state.done.debuzz = !!kinds.debuzz;
      paint();
    });
    select(recall() || STEPS[0].id);
  }

  function setTake(take) {
    if (state.take && take && state.take.name === take.name) return;
    state.take = take;
    state.done = {};
    paint();
    if (take && $("pcDebuzz")) {                         // HERESY 1054: an imported track has no YuE2 buzz
      $("pcDebuzz").checked = !/-import-/.test(take.name);
      paintChain(null);
      paintRemasterSay();
      watchChain(take.name);
    }
  }

  window.HeresyPost = { init: init, setTake: setTake, select: select, has: function (id) { return STEPS.some(function (s) { return s.id === id; }); } };
})();
