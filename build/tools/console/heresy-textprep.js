// HERESY 1043: text profiles — a whole text pasted in, made ready to be read (Viktor, 01.10.2026).
// A profile is an ordered list of rules (a literal or a regular-expression replacement, each with a
// note and an on/off tick) and the shape the text is given: [Intro] first, [Verse] at every blank
// line, an [Interlude] after a long paragraph (sections hold the reading's pace; without them the
// voice runs faster and faster), lines that go on in lower case joined to the one before, verse
// numbers in superscript taken out, a ceiling of characters. Profiles are the user's own (the lab
// keeps them beside the styles); two come built in: plain reading, and LCV reading — the rules of
// Viktor's VibeVoice script (prepare_LCV_texts_for_inference.sh), as an example of what one holds.
// They are applied by the Lyrics field (Apply, Undo) and edited in the Write tab with a live preview.
(function () {
  "use strict";

  var SHAPE = { stripSup: true, joinLower: true, intro: true, verses: true, interlude: 600, outro: false, maxChars: 10000 };
  var R = function (find, repl, note, re) { return { on: true, re: !!re, find: find, repl: repl, note: note || "" }; };
  var BUILT_IN = [
    { name: "Reading · plain", builtin: true, shape: Object.assign({}, SHAPE), rules: [
      R("\\u00a0", " ", "no-break spaces to spaces", true),
      R("[ \\t]+", " ", "runs of spaces to one", true),
      R(" - ", " – ", "a hyphen between spaces is a dash") ] },
    { name: "LCV · reading", builtin: true, shape: Object.assign({}, SHAPE), rules: [
      // cleanup (the script's second part)
      R("\\u00a0", " ", "no-break spaces", true), R("[ \\t]+", " ", "one space", true),
      R("[", "", "editorial brackets out"), R("]", "", ""), R("⸂", "", "insertion marks out"), R("⸃", "", ""),
      R(": – ", ": — ", "speech after a colon: an em dash"), R(" - ", " – ", "hyphen between spaces: en dash"),
      // phonetics: Hebrew sounds the model knows better in Hebrew letters
      R("ѓа·", "הа-", "the article ha-"), R("Ѓ", "ה", "ѓ is h"), R("ѓ", "ה", ""), R("Ђ", "ת", "ђ is t (tav)"), R("ђ", "ת", ""),
      R("Ѳ", "θ", "ѳ is th"), R("ѳ", "θ", ""), R("Ґ", "ג", "ґ is g (gimel)"), R("ґ", "ג", ""), R("ѵ", "ו", "ѵ is v (vav)"),
      R("ЙהѴה", "יְהוֹва́", "the Name, as Viktor reads it"), R("יְהוָ֗ה", "יְהוֹва́", ""),
      R("הַמָשִׁיחַ", "הַа-Машίах", ""), R("Маши́ах", "МашЫах", ""), R("הэ", "הֶ", ""),
      // soft l
      R("Љу", "Лю", "љ before a vowel"), R("љу", "лю", ""), R("Љо", "Лё", ""), R("љо", "лё", ""), R("Ља", "Ля", ""), R("ља", "ля", ""),
      R("љ(?=[גהתйЙбвгджзиклмнпрстфхцчшщэЭ”» \\p{P}])", "ль", "љ before a consonant or the end", true),
      R("Љ(?=[גהתйЙбвгджзиклмнпрстфхцчшщэЭ”» \\p{P}])", "Ль", "", true), R("љ·", "ль·", ""),
      R("([Бб])([эе]́н)(?=[А-Я])", "$1$2-", "Бэн- before a capital", true),
      R("([а-я])Э́ль", "$1-Э́ль", "-Эль after a lower-case letter", true),
      // stress the engine ignores, carried by other letters
      R("окрови́тел", "окровῖтел", "Покровитель: stress on и"), R("Любо́в", "Любόв", ""), R("любо́в", "любόв", ""),
      R("О́браз", "Óбраз", ""), R("о́браз", "óбраз", ""),
      R("Азъ", "Азʼ", ""), R("АЗЪ", "Азʼ", ""), R("А́зъ", "Азʼ", ""), R("А́ЗЪ", "А́зʼ", ""),
      R("Ши́", "шЫ", "ши under stress reads шы"), R("ши́", "шЫ", ""), R("Жи́", "жЫ", ""), R("жи́", "жЫ", "") ] }
  ];

  var TAG = /^\s*\[[^\]]+\]\s*$/;

  function applyRules(text, rules, log) {
    rules.forEach(function (r, i) {
      if (!r.on || !r.find) return;
      var before = text;
      try {
        if (r.re) text = text.replace(new RegExp(r.find, "gu"), r.repl || "");
        else text = text.split(r.find).join(r.repl || "");
      } catch (e) {
        log.push("rule " + (i + 1) + " skipped: " + e.message);
        return;
      }
      if (before !== text && log) {
        var n = r.re ? (before.match(new RegExp(r.find, "gu")) || []).length : before.split(r.find).length - 1;
        log.push("rule " + (i + 1) + (r.note ? " (" + r.note + ")" : "") + ": " + n);
      }
    });
    return text;
  }

  function shapeText(text, s, log) {
    var lines = text.replace(/\r/g, "").split("\n");
    if (s.stripSup) lines = lines.map(function (l) { return l.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+\s*/g, ""); });
    if (s.joinLower) {                                   // a line going on in lower case belongs to the one before
      var out = [];
      lines.forEach(function (l) {
        var t = l.trim();
        if (out.length && t && /^\p{Ll}/u.test(t) && out[out.length - 1].trim() && !TAG.test(out[out.length - 1])) out[out.length - 1] = out[out.length - 1].replace(/\s+$/, "") + " " + t;
        else out.push(l);
      });
      lines = out;
    }
    var hasTags = lines.some(function (l) { return TAG.test(l); });
    var paras = lines.join("\n").split(/\n\s*\n/).map(function (p) { return p.split("\n").map(function (l) { return l.trim(); }).filter(Boolean).join("\n"); }).filter(Boolean);
    var parts = [];
    if (s.intro && !hasTags) parts.push("[Intro]");
    var interludes = 0;
    paras.forEach(function (p, i) {
      if (s.verses && !hasTags && !TAG.test(p.split("\n")[0])) parts.push("[Verse]\n" + p);
      else parts.push(p);
      if (s.interlude > 0 && !hasTags && p.length >= s.interlude && i < paras.length - 1) { parts.push("[Interlude]"); interludes++; }
    });
    if (s.outro && !hasTags) parts.push("[Outro]");
    if (log) {
      if (hasTags) log.push("the text has its own section tags: kept as they are");
      else log.push(paras.length + " paragraph" + (paras.length === 1 ? "" : "s") + " as [Verse]" + (interludes ? ", " + interludes + " [Interlude] after long ones" : "") + (s.intro ? ", [Intro] first" : ""));
    }
    var result = parts.join("\n\n");
    if (s.maxChars && result.length > s.maxChars && log) log.push("⚠ " + result.length + " characters: over the " + s.maxChars + " a reading holds");
    return result;
  }

  function run(text, profile) {
    var log = [], s = Object.assign({}, SHAPE, profile.shape || {});
    var t = applyRules(String(text || ""), profile.rules || [], log);
    t = shapeText(t, s, log);
    return { text: t, log: log, chars: t.length, max: s.maxChars };
  }

  // ---- storage: the lab's presets (kind "textprofile"), the built-ins first
  var saved = [];
  function profiles() { return BUILT_IN.concat(saved); }
  function find(name) { return profiles().filter(function (p) { return p.name === name; })[0]; }
  function send(payload) {
    return fetch("/lab/presets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      .then(function (r) { return r.json().then(function (b) { if (!r.ok) throw new Error(b.error || r.status); return b; }); });
  }
  function load() {
    return fetch("/lab/presets").then(function (r) { return r.ok ? r.json() : {}; }).then(function (d) {
      saved = (d.textprofiles || []).map(function (x) { return Object.assign({ name: x.name }, x.request || {}); });
      paintPickers();
    }).catch(function () { paintPickers(); });
  }

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  var hooks = null, undoText = null, editing = null;
  function toast(t, bad) { if (hooks) hooks.toast(t, bad ? "bad" : ""); }

  function paintPickers() {
    var opts = function (cur) {
      return '<optgroup label="built in">' + BUILT_IN.map(function (p) { return "<option" + (p.name === cur ? " selected" : "") + ">" + esc(p.name) + "</option>"; }).join("") + "</optgroup>" +
        (saved.length ? '<optgroup label="yours">' + saved.map(function (p) { return "<option" + (p.name === cur ? " selected" : "") + ">" + esc(p.name) + "</option>"; }).join("") + "</optgroup>" : "");
    };
    if ($("tpPick")) $("tpPick").innerHTML = opts($("tpPick").value || BUILT_IN[0].name);
    if ($("tpEdPick")) $("tpEdPick").innerHTML = opts(editing ? editing.name : BUILT_IN[0].name);
    if ($("tpEdPick") && !editing) openEditor($("tpEdPick").value);
  }

  // ---- the Lyrics field
  function applyToLyrics() {
    var p = find($("tpPick").value);
    if (!p) return;
    var area = hooks.lyrics(), before = area.value;
    if (!before.trim()) return toast("Paste the text into Lyrics first", true);
    var r = run(before, p);
    undoText = before;
    hooks.setLyrics(r.text);
    $("tpUndo").disabled = false;
    $("tpNote").textContent = r.log.slice(-3).join(" · ") + " · " + r.chars + " / " + r.max;
    toast("Text made ready with “" + p.name + "”: " + r.log.length + " step" + (r.log.length === 1 ? "" : "s") + " (Undo gives the text back)");
  }

  // ---- the editor in Write
  function openEditor(name) {
    var p = find(name);
    if (!p) return;
    editing = JSON.parse(JSON.stringify(p));
    paintEditor();
  }
  function ruleRow(r, i) {
    return '<tr data-i="' + i + '"><td><input type="checkbox" data-f="on"' + (r.on ? " checked" : "") + ' /></td>' +
      '<td><input type="checkbox" data-f="re"' + (r.re ? " checked" : "") + ' title="regular expression" /></td>' +
      '<td><input type="text" class="mono" data-f="find" value="' + esc(r.find) + '" /></td>' +
      '<td><input type="text" class="mono" data-f="repl" value="' + esc(r.repl) + '" /></td>' +
      '<td><input type="text" data-f="note" value="' + esc(r.note) + '" /></td>' +
      '<td class="tp-ops"><button type="button" data-op="up" title="Up">↑</button><button type="button" data-op="down" title="Down">↓</button><button type="button" data-op="del" title="Remove">✕</button></td></tr>';
  }
  function paintEditor() {
    if (!$("tpRules") || !editing) return;
    var s = Object.assign({}, SHAPE, editing.shape || {});
    $("tpShape").innerHTML =
      '<label class="check"><input type="checkbox" data-s="intro"' + (s.intro ? " checked" : "") + " /> <span>[Intro] first</span></label>" +
      '<label class="check"><input type="checkbox" data-s="verses"' + (s.verses ? " checked" : "") + " /> <span>[Verse] at every blank line</span></label>" +
      '<label class="field rm-num"><span class="label">[Interlude] after a paragraph of (chars; 0 = never)</span><input type="number" min="0" step="50" data-s="interlude" value="' + s.interlude + '" /></label>' +
      '<label class="check"><input type="checkbox" data-s="outro"' + (s.outro ? " checked" : "") + " /> <span>[Outro] last</span></label>" +
      '<label class="check"><input type="checkbox" data-s="joinLower"' + (s.joinLower ? " checked" : "") + " /> <span>join a line that goes on in lower case</span></label>" +
      '<label class="check"><input type="checkbox" data-s="stripSup"' + (s.stripSup ? " checked" : "") + " /> <span>take out superscript verse numbers</span></label>" +
      '<label class="field rm-num"><span class="label">Ceiling (chars)</span><input type="number" min="1000" step="500" data-s="maxChars" value="' + s.maxChars + '" /></label>';
    $("tpRules").innerHTML = '<tr><th>on</th><th>re</th><th>find</th><th>replace with</th><th>note</th><th></th></tr>' + (editing.rules || []).map(ruleRow).join("");
    $("tpEdDel").disabled = !!find(editing.name) && !!find(editing.name).builtin;
    $("tpEdName").value = editing.builtin ? editing.name + " (mine)" : editing.name;
    preview();
  }
  function readEditor() {
    var s = {};
    Array.prototype.forEach.call($("tpShape").querySelectorAll("[data-s]"), function (el) {
      s[el.dataset.s] = el.type === "checkbox" ? el.checked : parseInt(el.value, 10) || 0;
    });
    editing.shape = s;
    editing.rules = Array.prototype.map.call($("tpRules").querySelectorAll("tr[data-i]"), function (tr) {
      var g = function (f) { return tr.querySelector('[data-f="' + f + '"]'); };
      return { on: g("on").checked, re: g("re").checked, find: g("find").value, repl: g("repl").value, note: g("note").value };
    });
  }
  function preview() {
    if (!$("tpTestIn")) return;
    readEditor();
    var r = run($("tpTestIn").value, editing);
    $("tpTestOut").textContent = r.text;
    $("tpTestLog").textContent = r.log.join("\n") + "\n" + r.chars + " / " + r.max + " characters";
  }

  function init(h) {
    hooks = h;
    if ($("tpApply")) {
      $("tpApply").addEventListener("click", applyToLyrics);
      $("tpUndo").addEventListener("click", function () {
        if (undoText === null) return;
        hooks.setLyrics(undoText); undoText = null; this.disabled = true; $("tpNote").textContent = ""; toast("The text is back as it was");
      });
    }
    if ($("tpRules")) {
      $("tpEdPick").addEventListener("change", function () { openEditor(this.value); });
      $("tpShape").addEventListener("input", preview);
      $("tpRules").addEventListener("input", preview);
      $("tpRules").addEventListener("change", preview);
      $("tpTestIn").addEventListener("input", preview);
      $("tpRules").addEventListener("click", function (e) {
        var b = e.target.closest("[data-op]"); if (!b) return;
        readEditor();
        var i = +b.closest("tr").dataset.i, rules = editing.rules;
        if (b.dataset.op === "del") rules.splice(i, 1);
        if (b.dataset.op === "up" && i > 0) rules.splice(i - 1, 0, rules.splice(i, 1)[0]);
        if (b.dataset.op === "down" && i < rules.length - 1) rules.splice(i + 1, 0, rules.splice(i, 1)[0]);
        paintEditor();
      });
      $("tpAddRule").addEventListener("click", function () { readEditor(); editing.rules.push(R("", "", "")); paintEditor(); });
      $("tpEdSave").addEventListener("click", function () {
        readEditor();
        var name = ($("tpEdName").value || "").trim();
        if (!name) return toast("Give the profile a name", true);
        if (BUILT_IN.some(function (p) { return p.name === name; })) return toast("That name is a built-in profile: choose another", true);
        send({ op: "put", kind: "textprofile", name: name, data: { shape: editing.shape, rules: editing.rules } })
          .then(function () { editing.name = name; editing.builtin = false; toast("Text profile “" + name + "” saved on Forge"); return load(); })
          .then(function () { $("tpEdPick").value = name; if ($("tpPick")) $("tpPick").value = name; })
          .catch(function (e) { toast("Not saved: " + e.message, true); });
      });
      $("tpEdDel").addEventListener("click", function () {
        var name = editing && editing.name;
        if (!name || (find(name) || {}).builtin) return;
        window.HeresyDialog.confirm("Delete the text profile “" + name + "”?", { danger: true }).then(function (ok) {
          if (ok) return send({ op: "delete", kind: "textprofile", name: name }).then(function () { editing = null; toast("Text profile deleted"); return load(); });
        }).catch(function (e) { toast(e.message, true); });
      });
      $("tpFromLyrics").addEventListener("click", function () { $("tpTestIn").value = hooks.lyrics().value; preview(); });
    }
    paintPickers();
    load();
  }

  window.HeresyTextPrep = { init: init, run: run, profiles: profiles };
})();
