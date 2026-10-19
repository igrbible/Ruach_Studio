// HERESY 1547 (Viktor 17.10.2026: «Вот цифровой шлюз в паблик, и обогати его по максимуму. Аналоговый — это приватный Pro»): the
// Refiner's Digital Gateway, its panel: a character (tape, console, tube, transformer, vinyl), its own knobs only (the rest out of
// sight), its defaults as the lab's (lab/digital_gate.py), starting points; the source any file of the tree; run on Forge (POST
// /lab/gate), a branch of the tree of kind "gate".
(function () {
  "use strict";
  var COMMON = { width: 1, mix: 1, oversample: 4, level: "came", trim_db: 0, azimuth_us: 0, sag: 0, crackle: 0, rumble_db: -120, mono_below_hz: 0, speed: "15" };
  var DEF = {
    tape: { drive_db: 4, grain_db: -72, wow: 0.04, flutter: 0.03, crosstalk_db: -120, azimuth_us: 0, speed: "15" },
    console: { drive_db: 6, grain_db: -92, wow: 0, flutter: 0, crosstalk_db: -50 },
    tube: { drive_db: 6, grain_db: -86, wow: 0, flutter: 0, crosstalk_db: -120, sag: 0.3 },
    transformer: { drive_db: 6, grain_db: -100, wow: 0, flutter: 0, crosstalk_db: -120 },
    vinyl: { drive_db: 2, grain_db: -64, wow: 0.08, flutter: 0.02, crosstalk_db: -30, crackle: 0.3, rumble_db: -62, mono_below_hz: 150 }
  };
  var PRESETS = {
    "Master tape": { character: "tape", speed: "30", drive_db: 3, wow: 0.02, flutter: 0.02, grain_db: -78 },
    "Studio tape": { character: "tape", speed: "15" },
    "Cassette": { character: "tape", speed: "3.75", drive_db: 7, wow: 0.12, flutter: 0.08, grain_db: -60, azimuth_us: 8 },
    "Console": { character: "console" },
    "Warm tube": { character: "tube" },
    "Pushed tube": { character: "tube", drive_db: 12, sag: 0.5 },
    "Iron": { character: "transformer", drive_db: 9 },
    "Old record": { character: "vinyl", crackle: 0.5 }
  };
  var FOR = { speed: ["tape"], wow: ["tape", "vinyl"], flutter: ["tape", "vinyl"], azimuth_us: ["tape"], sag: ["tube"], crackle: ["vinyl"], rumble_db: ["vinyl"],
              mono_below_hz: ["vinyl"] };
  var PCT = { width: 100, mix: 100 };                 // shown in %, sent as a fraction
  var take = "";
  function $(id) { return document.getElementById(id); }
  function tr(s) { return window.RuachI18n ? window.RuachI18n.t(s) : s; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function fields() { return Array.prototype.slice.call(document.querySelectorAll("#gatePanel [data-gt]")); }
  function put(el, v) { el.value = PCT[el.dataset.gt] ? String(Math.round(v * PCT[el.dataset.gt])) : String(v); }
  function setChar(ch, over) {                         // the character's own values in its knobs, the others out of sight
    var d = Object.assign({}, COMMON, DEF[ch] || DEF.tape, over || {}), sel = $("gtChar");
    if (sel && sel.value !== ch) sel.value = ch;
    fields().forEach(function (el) {
      var k = el.dataset.gt;
      if (d[k] != null) put(el, d[k]);
      var f = el.closest(".field");
      if (f) f.hidden = !!FOR[k] && FOR[k].indexOf(ch) < 0;
    });
  }
  function params() {
    var ch = ($("gtChar") || {}).value || "tape", p = { character: ch };
    fields().forEach(function (el) {
      var k = el.dataset.gt, f = el.closest(".field");
      if (f && f.hidden) return;
      var v = el.tagName === "SELECT" && (k === "speed" || k === "level") ? el.value : parseFloat(el.value);
      if (typeof v === "number" && !isFinite(v)) return;
      p[k] = PCT[k] ? v / PCT[k] : v;
    });
    return p;
  }
  function say(t, bad) { var el = $("gtState"); if (el) { el.textContent = t || ""; el.classList.toggle("is-bad", !!bad); } }
  function paintSources(files) {                      // any file of the tree: a DAW mix, the remaster, another gateway's…
    var sel = $("gtSource");
    if (!sel) return;
    var keep = sel.value;
    sel.innerHTML = '<option value="">' + esc(tr("the take")) + "</option>" + (files || []).map(function (f) {
      return '<option value="' + esc(f.source) + '">' + esc(String(f.label || f.source).replace(/^↳ /, "")) + "</option>"; }).join("");
    sel.value = Array.prototype.some.call(sel.options, function (o) { return o.value === keep; }) ? keep : "";
  }
  function run() {
    if (!take) { say(tr("Pick a take on the right first"), true); return; }
    var b = $("gtRun");
    b.disabled = true;
    say(tr("sending to Forge…"));
    fetch("/lab/gate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: take, source: ($("gtSource") || {}).value || "", params: params() }) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok && r.status !== 202) throw new Error(j.error || r.status); return j; }); })
      .then(function () { say(tr("running on Forge: the bar above says how far; it lands in the tree")); if (window.HeresyDerived) window.HeresyDerived.refresh(); })
      .catch(function (e) { say(tr("Could not") + ": " + (e.message || e), true); })
      .then(function () { b.disabled = false; });
  }
  function init() {
    var panel = $("gatePanel");
    if (!panel) return;
    setChar("tape");
    $("gtChar").addEventListener("change", function () { setChar($("gtChar").value); });
    panel.addEventListener("click", function (e) {
      var b = e.target.closest("[data-gt-preset]");
      if (!b) return;
      var pr = PRESETS[b.dataset.gtPreset];
      if (pr) { setChar(pr.character, pr); Array.prototype.forEach.call(panel.querySelectorAll("[data-gt-preset]"), function (x) { x.classList.toggle("is-on", x === b); }); }
    });
    panel.addEventListener("input", function (e) { if (e.target.closest("[data-gt]")) Array.prototype.forEach.call(panel.querySelectorAll("[data-gt-preset].is-on"), function (x) { x.classList.remove("is-on"); }); });
    $("gtRun").addEventListener("click", run);
    window.addEventListener("heresy-derived", function (e) { if (e.detail) { take = e.detail.name || ""; paintSources(e.detail.files); } });
    if (window.HeresyChoices) window.HeresyChoices.within(panel);
  }
  window.HeresyGate = { params: params, setChar: setChar, presets: function () { return Object.keys(PRESETS); }, defaults: function (ch) { return Object.assign({}, COMMON, DEF[ch]); } };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
