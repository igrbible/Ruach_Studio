// HERESY 1028: the score check, MIDI out and in, section markers and the voice shift, on the
// page: under the take's score and under the form's own score (heresy-abc.js does the work).
(function () {
  "use strict";

  var A = window.HeresyAbc;
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function clock(t) { var m = Math.floor(t / 60), s = Math.round(t % 60); if (s === 60) { m++; s = 0; } return m + ":" + (s < 10 ? "0" : "") + s; }
  function pct(x) { return Math.round(x * 100) + "%"; }
  function fileName(title, ext) { return (String(title || "score").replace(/[\\/:*?"<>|]+/g, " ").trim() || "score") + ext; }
  function save(bytes, name, type) {
    var url = URL.createObjectURL(new Blob([bytes], { type: type }));
    var a = document.createElement("a");
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  // the check, as a few lines a person reads at a glance
  function paint(host, abc) {
    if (!host) return null;
    if (!abc || !abc.trim()) { host.innerHTML = ""; host.hidden = true; return null; }
    host.hidden = false;
    var s;
    try { s = A.parse(abc); } catch (error) {
      host.innerHTML = '<p class="sc-bad">✗ Not the native YuE2 score: ' + esc(error.message) + "</p>" +
        '<p class="row-hint">The engine may still read it, but the check, MIDI and the voice shift need the dialect YuE2 and SheetSage2 write.</p>';
      return null;
    }
    var r = A.report(s), v = r.voices.Vocal, i = r.voices.Ins;
    var lead = r.ratio === null ? "no vocal notes" : r.ratio > 1.5 ? "the instruments carry most notes" : r.ratio < 0.67 ? "the voice carries most notes" : "voice and instruments about even";
    var row = function (name, x) {
      return "<tr><td>" + name + '</td><td class="mono">' + x.notes + '</td><td class="mono">' + Math.round(x.perMinute) + '</td><td class="mono">' +
        esc(x.low) + "–" + esc(x.high) + '</td><td class="mono">' + pct(x.sounding) + "</td>" + (name === "Vocal" ? '<td class="mono">' + x.chords + "</td>" : "<td></td>") + "</tr>";
    };
    host.innerHTML = '<p class="sc-ok">✓ Native YuE2 score · ' + esc(r.key) + " · " + (r.free ? "free tempo" : r.bpm + " BPM") + " · " + r.meter + " · " + r.bars +   // HERESY 1416
      " bars · \u2248 " + clock(r.seconds) + " long · " + r.sections + " sections</p>" +   // HERESY 1716: the length said as one
      '<table class="sc-table"><tr><th></th><th>notes</th><th>a minute</th><th>range</th><th>sounding</th><th>chords</th></tr>' +
      row("Vocal", v) + row("Ins", i) + "</table>" +
      '<p class="sc-ratio">Ins : Vocal = <strong class="mono">' + esc(r.ratioText) + "</strong>" +
      (r.ratio !== null ? ' = <strong class="mono">' + r.ratio.toFixed(2) + "</strong>" : "") + " · " + lead + "</p>";
    return s;
  }

  function midiOut(abc, title) {
    try { save(A.toMidi(A.parse(abc)), fileName(title, ".mid"), "audio/midi"); }
    catch (error) { toast("No MIDI: " + error.message, true); }
  }
  function markersOut(abc, title) {
    try {
      var rows = A.markers(A.parse(abc));
      if (!rows.length) return toast("This score has no section comments (% verse …)", true);
      // Reaper's region/marker CSV: #, Name, Start; plain seconds work in most DAWs
      var csv = "#,Name,Start\n" + rows.map(function (m, k) { return "M" + (k + 1) + "," + JSON.stringify(m.name) + "," + m.seconds.toFixed(3); }).join("\n") + "\n";
      save(csv, fileName(title, " markers.csv"), "text/csv");
    } catch (error) { toast("No markers: " + error.message, true); }
  }
  var toast = function (text, bad) { if (window.HeresyScore.toast) window.HeresyScore.toast(text, bad ? "bad" : ""); };

  // ---- the take card
  var takeAbc = "", takeTitle = "";
  function take(abc, title) {
    takeAbc = abc || ""; takeTitle = title || "";
    paint($("takeScoreCheck"), takeAbc);
    var ok = !!takeAbc.trim();
    ["takeMidi", "takeMarkers"].forEach(function (id) { if ($(id)) $(id).disabled = !ok; });
  }

  // ---- the form's score
  var formTimer = 0;
  function form() {
    clearTimeout(formTimer);
    formTimer = setTimeout(function () {
      var abc = $("abc").value, s = paint($("formScoreCheck"), abc);
      $("voiceShiftRow").classList.toggle("is-hidden", !s);
      if ($("reciteRow")) $("reciteRow").classList.toggle("is-hidden", !s);   // HERESY 1169 · 1238
      ["formMidi", "formMarkers"].forEach(function (id) { $(id).disabled = !s; });
    }, 250);
  }

  function init(hooks) {
    window.HeresyScore.toast = hooks.toast;
    var set = hooks.setAbc;
    if ($("takeMidi")) $("takeMidi").addEventListener("click", function () { midiOut(takeAbc, takeTitle); });
    if ($("takeMarkers")) $("takeMarkers").addEventListener("click", function () { markersOut(takeAbc, takeTitle); });
    if (!$("abc")) return;
    $("abc").addEventListener("input", form);
    // HERESY 1262 (Viktor 09.10.2026: «Recite on a score либо не вижу, либо не там смотрю»): a score the page itself puts into the
    // field (a take loaded into the form, Edit score, an example) sends no input event, so its rows stayed hidden and MIDI dim
    // until a key was pressed in it; the field's own value setter tells the check as well
    (function () {
      var el = $("abc"), d = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
      if (!d || !d.set) return;
      Object.defineProperty(el, "value", { configurable: true, enumerable: true,
        get: function () { return d.get.call(this); }, set: function (v) { d.set.call(this, v); form(); } });
    })();
    $("formMidi").addEventListener("click", function () { midiOut($("abc").value, hooks.title()); });
    $("formMarkers").addEventListener("click", function () { markersOut($("abc").value, hooks.title()); });
    // HERESY 1704: the chord bed's row: the key and the tempo from the style when it names them, a new draw at each press
    if ($("bedWrite")) {
      var styleKey = function () {
        var m = /(^|[^A-Za-z])([A-G])(#|b|♯|♭)?\s*(major|minor|Major|Minor|maj|min|m)(?![a-z])/.exec(($("style") || {}).value || ""), s = /(\d{2,3})\s*bpm/i.exec(($("style") || {}).value || "");
        return { key: m ? m[2] + (m[3] ? m[3].replace("♯", "#").replace("♭", "b") : "") + (/^(minor|min|m)$/i.test(m[4]) ? "m" : "") : "", bpm: s ? +s[1] : 0 };
      };
      var fillBed = function () {
        var sk = styleKey();
        if (sk.key && $("bedKey").querySelector('option[value="' + sk.key + '"]')) $("bedKey").value = sk.key;
        if (sk.bpm >= 40 && sk.bpm <= 240) $("bedBpm").value = sk.bpm;
      };
      $("scoreDrawer") && $("scoreDrawer").addEventListener("toggle", function () { if (this.open) fillBed(); });
      fillBed();
      $("bedWrite").addEventListener("click", function () {
        var r;
        try {
          r = A.chordBed({ key: $("bedKey").value, meter: $("bedMeter").value, bpm: $("bedBpm").value, lyrics: ($("lyrics") || {}).value || "",
                           seed: Math.floor(Math.random() * 4294967296) });
        } catch (error) { toast(error.message, true); return; }
        (($("abc").value || "").trim() ? window.HeresyDialog.confirm("Replace the score in the form with a chord bed?", { ok: "Replace" }) : Promise.resolve(true)).then(function (ok) {
          if (!ok) return;
          set(r.abc);
          var off = document.querySelector('input[name="cot"]:checked'), full = document.querySelector('input[name="cot"][value="full"]');
          if (full && (!off || off.value !== "full")) full.click();   // a score is sung in Full
          $("bedNote").textContent = "A bed of " + r.bars + " bars in " + r.key + ": verse " + r.progressions[0].join(" ") + " · chorus " + r.progressions[1].join(" ") + " · bridge " + r.progressions[2].join(" ");
          toast("Chord bed written: " + r.bars + " bars; the planning mode is Full");
        });
      });
    }
    $("voiceShiftBtn").addEventListener("click", function () {
      var steps = parseInt($("voiceShift").value, 10), voice = $("voiceShiftWho").value;
      try {
        var r = A.shiftVoice($("abc").value, voice, steps);
        set(r.abc);
        $("voiceShiftNote").textContent = voice + ": " + r.notes + " written notes moved (tied ones count apart), now " + r.low + "–" + r.high;
        toast(voice + " moved " + $("voiceShift").selectedOptions[0].textContent);
      } catch (error) { toast(error.message, true); }
    });
    $("midiIn").addEventListener("change", function () {
      var file = this.files && this.files[0];
      this.value = "";
      if (!file) return;
      ($("abc").value.trim() ? window.HeresyDialog.confirm("Replace the score in the form with " + file.name + "?", { ok: "Replace" }) : Promise.resolve(true)).then(function (ok) {
        if (!ok) throw null;
        return file.arrayBuffer();
      }).then(function (buf) {
        var r = A.fromMidi(new Uint8Array(buf), { key: $("midiInKey").value || undefined });
        set(r.abc);
        toast("Score from " + file.name + ": Vocal " + r.from.vocal + " (" + r.report.voices.Vocal.notes + " notes), Ins " + r.from.ins +
              " (" + r.report.voices.Ins.notes + "), " + r.report.key + ", " + r.report.bpm + " BPM");
      }).catch(function (error) { if (error) toast("This MIDI could not become a score: " + error.message, true); });
    });
    form();
  }

  window.HeresyScore = { init: init, take: take, form: form };
})();
