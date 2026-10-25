// HERESY 1032: a library of styles and profiles, kept by the lab on Forge in the user config folder
// (user/presets.json): every browser and device sees the same, and a cleared browser loses none.
// A style is a text. A profile is every knob but the texts and seeds (app.js captures and applies it).
// Three profiles are built in: Music, as the engine's defaults, Speech, for long spoken word, and Viktor's own, editable (HERESY 1401).
(function () {
  "use strict";

  // HERESY 1167 (Viktor: «Мы изменили дефолты… а тексты остались старые»): the floors as the engine has them since 1088
  // (the music not under 0:30 = 750 tokens, a score not under 200), not the release's 200 and 32
  var SEM = { temperature: 0.9, top_p: 0.95, top_k: 100, repetition_penalty: 1.3, penalty_window: 100, min_tokens: 750 };
  var ABC = { temperature: 0.95, top_p: 0.95, top_k: 50, repetition_penalty: 1.005, penalty_window: 100, min_tokens: 200, max_tokens: 6144 };
  var EAR = "Musical Heresy of Creator's Ear";
  var BUILT_IN = [
    // HERESY 1401: every built-in profile with the two guidances apart, 1.6 / 2.2 (1397, 1400)
    { name: "Music · up to 8:00", builtin: true, request: { cot: "full", duration: 480, cfg_scale: 1.6, cfg_lyrics: 2.2, abc_sampling: ABC,
      semantic_sampling: Object.assign({ max_tokens: 12000 }, SEM) } },
    // Direct mode: no score in the context, so the music stage gets nearly all of it. 22500 tokens
    // is 15:00 at 25 a second; the engine cuts the budget to what fits beside the style and the
    // text (HERESY 1032), and a reading that runs into that cut is marked truncated.
    { name: "Speech · up to 15:00", builtin: true, request: { cot: "off", duration: 900, cfg_scale: 1.6, cfg_lyrics: 2.2, abc_sampling: ABC,
      semantic_sampling: Object.assign({ max_tokens: 22500 }, SEM) } },
    // HERESY 1169 (Viktor 08.10.2026: «Запиши эти параметры как максимально консервативные, но в русском языке весьма идеальные.
    // Нет ускорений, умеренная речь в рЕпе, просто чудеса»): Composition low, Performance low, Style influence high; 32 Midpoint
    // HERESY 1401: renamed and his to set: «Я подберу для него идеальные параметры» (was «Russian · conservative (Viktor's)», CFG 1.8)
    // (Viktor: «выставь в нём макс музыку с 8 до 10 минут. Мне уже и 8 минут иногда в Крике не хватает»): 600 s, 15000 music tokens
    { name: EAR, builtin: true, editable: true, request: { cot: "full", duration: 600, cfg_scale: 1.6, cfg_lyrics: 2.2, steps: 48, solver: "multistep",   // HERESY 1710: AB2 48 (Midpoint 32 before)
      abc_sampling: Object.assign({}, ABC, { temperature: 0.85, top_p: 0.92, top_k: 40 }),
      semantic_sampling: Object.assign({ max_tokens: 15000 }, SEM, { temperature: 0.85, top_p: 0.93, top_k: 80 }) } }
  ];
  var state = { styles: [], setups: [], hooks: null };
  // HERESY 1401: a built-in profile as it is now: an editable one's saved values when they are on Forge
  function builtIn(i) {
    var p = BUILT_IN[i], own = p && p.editable ? state.setups.filter(function (s) { return s.name === p.name; })[0] : null;
    return own ? { name: p.name, builtin: true, editable: true, own: true, request: own.request } : p;
  }
  function saved() { return state.setups.filter(function (s) { return !BUILT_IN.some(function (b) { return b.editable && b.name === s.name; }); }); }
  var SCOPE = (function () { try { return new URLSearchParams(location.search).get("scope") || ""; } catch (e) { return ""; } })();
  var URL = "/lab/presets" + (SCOPE ? "?scope=" + encodeURIComponent(SCOPE) : "");
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function toast(t, bad) { if (state.hooks) state.hooks.toast(t, bad ? "bad" : ""); }

  function send(payload) {
    return fetch(URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      .then(function (r) { return r.json().then(function (b) { if (!r.ok) throw new Error(b.error || r.status); return b; }); });
  }
  function load() {
    return fetch(URL).then(function (r) { return r.ok ? r.json() : { styles: [], setups: [] }; })
      .then(take, function () { take({ styles: [], setups: [] }); toast("The library is on Forge's lab, which does not answer: only the built-in profiles for now", true); });
  }
  function take(d) {
    state.styles = d.styles || [];
    state.setups = d.setups || [];
    paint();
  }

  function paint() {
    var keepS = $("styleLib").value, keepP = $("setupLib").value;
    $("styleLib").innerHTML = '<option value="">' + (state.styles.length ? "Saved styles…" : "No saved styles yet") + "</option>" +
      state.styles.map(function (s) { return '<option value="' + esc(s.name) + '">' + esc(s.name) + "</option>"; }).join("");
    $("styleLib").value = state.styles.some(function (s) { return s.name === keepS; }) ? keepS : "";
    $("styleDel").disabled = !$("styleLib").value;
    $("setupLib").innerHTML = '<optgroup label="built in">' + BUILT_IN.map(function (p, i) { return '<option value="b' + i + '"' + (p.editable ? ' translate="no"' : "") + ">" + esc(p.name) + (builtIn(i).own ? " \u270e" : "") + "</option>"; }).join("") +
      "</optgroup>" + (saved().length ? '<optgroup label="saved">' + saved().map(function (p) {
        return '<option value="s:' + esc(p.name) + '">' + esc(p.name) + "</option>"; }).join("") + "</optgroup>" : "");
    if (Array.prototype.some.call($("setupLib").options, function (o) { return o.value === keepP; })) $("setupLib").value = keepP;
    syncDel();
    syncTextRow();
  }
  // Delete: a saved profile; an editable built-in one back to its built-in values (HERESY 1401)
  function syncDel() {
    var v = $("setupLib").value, b = v.charAt(0) === "b" ? builtIn(+v.slice(1)) : null;
    $("setupDel").disabled = !(v.indexOf("s:") === 0 || (b && b.own));
    $("setupDel").dataset.tip = b && b.own ? "Back to its built-in values (what you saved over it goes)" : "Delete the saved profile";
  }

  // HERESY 1168 (Viktor 07.10.2026: «Если у Творца ПРОФИЛЬ - музыка, деактивируй текстовый профиль, потому что он чисто для
  // начитки»): the text profile (a pasted text made ready to read) is for readings. A speech profile is the built-in Speech, or
  // one of the user's in Direct mode longer than eight minutes, or named so; with any other (music) it is off, and says why
  function isSpeech(p) {
    if (!p) return false;
    var r = p.request || p.data || {};
    if (r.cot === "off" && (+r.duration || 0) > 480) return true;
    return !p.builtin && /speech|reading|начит|чтени|речь|мова|чыт|ανάγν|lectura|lettura/i.test(p.name || "");
  }
  function syncTextRow() {
    var row = $("tpRow");
    if (!row) return;
    var on = isSpeech(chosenSetup());
    row.classList.toggle("is-off", !on);
    ["tpPick", "tpApply"].forEach(function (id) { if ($(id)) $(id).disabled = !on; });
    if (on) delete row.dataset.tip;
    else row.dataset.tip = "Text profiles make a pasted text ready to read: pick a Speech profile in Profile to use them";
  }

  function chosenSetup() {
    var v = $("setupLib").value;
    if (v.charAt(0) === "b") return builtIn(+v.slice(1));
    var name = v.slice(2);
    return state.setups.filter(function (p) { return p.name === name; })[0];
  }

  function init(hooks) {
    if (!$("styleLib")) return;
    state.hooks = hooks;
    $("styleLib").addEventListener("change", function () {
      var s = state.styles.filter(function (x) { return x.name === this.value; }, this)[0];
      $("styleDel").disabled = !s;
      if (!s) return;
      var now = hooks.style().trim(), sel = this;
      (now && now !== s.text.trim() ? window.HeresyDialog.confirm("Replace the style in the form with “" + s.name + "”?", { ok: "Replace" }) : Promise.resolve(true)).then(function (ok) {
        if (!ok) { sel.value = ""; $("styleDel").disabled = true; return; }
        hooks.setStyle(s.text);
        toast("Style “" + s.name + "” in the form");
      });
    });
    $("styleSave").addEventListener("click", function () {
      var text = hooks.style().trim();
      if (!text) return toast("The style field is empty", true);
      var name;
      window.HeresyDialog.prompt("Save the style\n\nA name to find it by under the style field.", $("styleLib").value || "", { ok: "Save", placeholder: "its name" }).then(function (v) {
        name = (v || "").trim();
        if (!name) return false;
        return state.styles.some(function (s) { return s.name === name; }) ? window.HeresyDialog.confirm("“" + name + "” exists. Replace it?", { ok: "Replace" }) : true;
      }).then(function (ok) {
        if (!ok) return;
        return send({ op: "put", kind: "style", name: name, data: text }).then(function (d) { take(d); $("styleLib").value = name; $("styleDel").disabled = false; toast("Style “" + name + "” saved on Forge"); });
      }).catch(function (e) { toast("Not saved: " + e.message, true); });
    });
    $("styleDel").addEventListener("click", function () {
      var name = $("styleLib").value;
      if (!name) return;
      window.HeresyDialog.confirm("Delete the saved style “" + name + "”?", { danger: true }).then(function (ok) {
        if (ok) return send({ op: "delete", kind: "style", name: name }).then(function (d) { take(d); toast("Style “" + name + "” deleted"); });
      }).catch(function (e) { toast("Not deleted: " + e.message, true); });
    });
    $("setupLib").addEventListener("change", function () { syncDel(); syncTextRow(); });
    $("setupApply").addEventListener("click", function () {
      var p = chosenSetup();
      if (!p) return;
      try { hooks.apply(JSON.parse(JSON.stringify(p.request))); toast("Profile “" + p.name + "” applied; the texts and seeds stay"); }
      catch (e) { toast("Not applied: " + e.message, true); }
    });
    $("setupSave").addEventListener("click", function () {
      var data;
      try { data = hooks.capture(); } catch (e) { return toast("The form does not read: " + e.message, true); }
      var name, cur = chosenSetup(), ear = cur && cur.editable;   // HERESY 1401: his own profile, saved over by its name
      window.HeresyDialog.prompt("Save the profile\n\nEvery knob of the form but the texts and seeds.", ear ? cur.name : "", { ok: "Save", placeholder: "its name" }).then(function (v) {
        name = (v || "").trim();
        if (!name) return false;
        if (BUILT_IN.some(function (b) { return !b.editable && b.name === name; })) { toast("“" + name + "” is built in: save it under another name", true); return false; }
        var over = BUILT_IN.some(function (b) { return b.editable && b.name === name; });
        return over ? window.HeresyDialog.confirm("Save the form over “" + name + "”?\n\nDelete brings its built-in values back.", { ok: "Save over it" })
          : state.setups.some(function (s) { return s.name === name; }) ? window.HeresyDialog.confirm("“" + name + "” exists. Replace it?", { ok: "Replace" }) : true;
      }).then(function (ok) {
        if (!ok) return;
        return send({ op: "put", kind: "setup", name: name, data: data }).then(function (d) {
          take(d);
          var i = BUILT_IN.map(function (b) { return b.editable ? b.name : null; }).indexOf(name);
          $("setupLib").value = i >= 0 ? "b" + i : "s:" + name;
          syncDel();
          toast("Profile “" + name + "” saved on Forge");
        });
      }).catch(function (e) { toast("Not saved: " + e.message, true); });
    });
    $("setupDel").addEventListener("click", function () {
      var v = $("setupLib").value, b = v.charAt(0) === "b" ? builtIn(+v.slice(1)) : null;
      if (v.indexOf("s:") !== 0 && !(b && b.own)) return;
      var name = b ? b.name : v.slice(2);
      window.HeresyDialog.confirm(b ? "Bring “" + name + "” back to its built-in values?" : "Delete the saved profile “" + name + "”?", { danger: true }).then(function (ok) {
        if (ok) return send({ op: "delete", kind: "setup", name: name }).then(function (d) { take(d); toast(b ? "“" + name + "” has its built-in values again" : "Profile “" + name + "” deleted"); });
      }).catch(function (e) { toast("Not deleted: " + e.message, true); });
    });
    paint();
    load();
  }

  window.HeresyPresets = { init: init, reload: load };
})();
