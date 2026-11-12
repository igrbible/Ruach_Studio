// HERESY 2351 (Timon's cherry ③: his #23, #145, #110, #149 and the beginner's #166 asking to be warned before a run; the plan of 08.11.2026,
// the Trainer: «доктор набора перед обучением LoRA»): the dataset doctor in the Trainer's first step. When a raw folder is picked, the lab's
// doctor (lab/dataset_doctor.py) looks at it track by track against the Studio's own guide (LORA-TRAINING.md): how many different songs and
// how long, versions of one song, the same file twice, too short or too long, lossy sources and highs cut at an encoder's ceiling, a low
// rate or mono, clipping, silence at an end, a loudness apart, the tempo's spread. It is said in a panel under the folder, each finding with
// the names it is about; it decides nothing. A folder of up to 60 tracks is looked at by itself when picked; a bigger one on a press. The
// report is the lab's, kept until the folder changes. Its own module: the Trainer's code is not touched; it listens to the folder's pick.
(function () {
  "use strict";
  function $(id) { return document.getElementById(id); }
  function tr(s) { return window.RuachI18n ? window.RuachI18n.t(s) : s; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function num(n) { return Number(n).toLocaleString(window.RuachI18n && window.RuachI18n.locales ? window.RuachI18n.locales() : undefined); }
  function span(sec) { sec = Math.round(sec || 0); var h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60; return h ? h + ":" + ("0" + m).slice(-2) + ":" + ("0" + s).slice(-2) : m + ":" + ("0" + s).slice(-2); }
  function api(path, body) {
    var opt = body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
    return fetch("/lab" + path, opt).then(function (r) { return r.json().then(function (b) { if (!r.ok && r.status !== 202) throw new Error(b.error || r.status); return b; }); });
  }
  var AUTO = 60, name = null, timer = null, panel = null;

  function ensure() {
    if (panel && document.body.contains(panel)) return panel;
    var voice = $("trVoice");
    if (!voice) return null;
    panel = document.createElement("div");
    panel.className = "tr-doctor";
    panel.id = "trDoctor";
    panel.hidden = true;
    voice.insertAdjacentElement("afterend", panel);
    panel.addEventListener("click", function (e) {
      var b = e.target.closest("[data-doc]");
      if (!b || !name) return;
      if (b.dataset.doc === "look" || b.dataset.doc === "again") look(b.dataset.doc === "again");
    });
    return panel;
  }
  function head(right) {
    return '<div class="tr-doc-head"><span class="tr-voice-cap">' + esc(tr("Dataset doctor")) + "</span>" + (right || "") + "</div>";
  }
  function line(level, text, names, note) {
    var list = (names || []).filter(function (n) { return n !== undefined && n !== null && n !== ""; });
    var shown = list.slice(0, 12).map(function (n) { return '<span class="tr-doc-name" translate="no">' + esc(n) + "</span>"; }).join("");
    var more = list.length > 12 ? '<span class="tr-doc-more">' + esc(tr("and {0} more").replace("{0}", num(list.length - 12))) + "</span>" : "";
    var body = list.length ? '<div class="tr-doc-names">' + shown + more + "</div>" : "";
    return '<li class="tr-doc-' + level + '"><span class="tr-doc-say">' + esc(text) + "</span>" + (note ? '<span class="tr-doc-note">' + esc(note) + "</span>" : "") + body + "</li>";
  }
  function paint(st) {
    var p = ensure();
    if (!p) return;
    p.hidden = !name;
    if (!name) return;
    if (st.status === "running") {
      p.innerHTML = head('<span class="row-hint">' + esc(tr("Looking at the tracks: {0} of {1}…").replace("{0}", num(st.done || 0)).replace("{1}", num(st.total || 0))) + "</span>");
      return;
    }
    var r = st.report;
    if (st.status === "failed" && st.error) {
      p.innerHTML = head('<button type="button" class="btn ghost small" data-doc="again">' + esc(tr("Look again")) + "</button>") +
        '<p class="tr-warn">' + esc(st.error) + "</p>";
      return;
    }
    if (!r || r.name !== name) {
      p.innerHTML = head('<button type="button" class="btn ghost small" data-doc="look">' + esc(tr("Look at the set")) + "</button>") +
        '<p class="row-hint">' + esc(tr("Not looked at yet: the doctor reads every track (length, source, highs, clipping, silence, loudness, tempo), about a second each.")) + "</p>";
      return;
    }
    var L = [];
    var songs = r.songs || 0;
    L.push(line(songs >= 20 ? "ok" : "warn", tr("Different songs: {0} · tracks: {1} · in all {2}").replace("{0}", num(songs)).replace("{1}", num(r.tracks)).replace("{2}", span(r.seconds)), null,
      songs >= 100 ? tr("Enough for a language, when the lyrics are exact; a style wants 20 or more, a voice 30 or a few hours")
        : songs >= 20 ? tr("Enough for a style (20 or more); a voice wants 30 or a few hours, a language a hundred and more")
        : tr("Under 20 different songs: a style wants 20 or more, a voice 30 or a few hours")));
    if (r.versions && r.versions.length) L.push(line("warn", tr("Versions of one song: {0}").replace("{0}", num(r.versions.length)), r.versions.map(function (v) { return v[0] + " ×" + v[1]; }),
      tr("Ten takes of one song teach the music half that song, not the style: one or two of each are enough")));
    if (r.same && r.same.length) L.push(line("warn", tr("The same file twice: {0}").replace("{0}", num(r.same.length)), r.same.map(function (g) { return g.join(" = "); })));
    if (r.short && r.short.length) L.push(line("warn", tr("Under 0:30: {0}").replace("{0}", num(r.short.length)), r.short));
    if (r.long && r.long.length) L.push(line("warn", tr("Over 6:00: {0}").replace("{0}", num(r.long.length)), r.long,
      tr("The music half trains on the whole song: memory and time, nothing more learnt")));
    if (r.lossy && r.lossy.length) L.push(line("warn", tr("Lossy sources (MP3, OGG, M4A…): {0}").replace("{0}", num(r.lossy.length)), r.lossy, tr("WAV or FLAC over MP3, as the guide says")));
    if (r.cut16 && r.cut16.length) L.push(line("bad", tr("Highs cut near 16 kHz (an MP3 of 128 kb/s or less, even inside a WAV or FLAC): {0}").replace("{0}", num(r.cut16.length)),
      r.cut16.map(function (c) { return c[0] + " · " + c[1] + " kHz"; })));
    if (r.cut && r.cut.length) L.push(line("warn", tr("Highs cut below 20 kHz: {0}").replace("{0}", num(r.cut.length)), r.cut.map(function (c) { return c[0] + " · " + c[1] + " kHz"; })));
    if (r.low_rate && r.low_rate.length) L.push(line("warn", tr("Below 44.1 kHz: {0}").replace("{0}", num(r.low_rate.length)), r.low_rate.map(function (c) { return c[0] + " · " + c[1] + " Hz"; })));
    if (r.mono && r.mono.length) L.push(line("warn", tr("Mono: {0}").replace("{0}", num(r.mono.length)), r.mono));
    if (r.clipped && r.clipped.length) L.push(line("bad", tr("Clipping: {0}").replace("{0}", num(r.clipped.length)), r.clipped.map(function (c) { return c[0] + " · " + c[1] + " %"; })));
    if (r.silent_ends && r.silent_ends.length) L.push(line("warn", tr("Silence over 3 s at the start or the end: {0}").replace("{0}", num(r.silent_ends.length)),
      r.silent_ends.map(function (c) { return c[0] + " · " + c[1] + " s / " + c[2] + " s"; })));
    var lo = r.loudness;
    if (lo) L.push(line(lo.apart && lo.apart.length ? "warn" : "ok", tr("Loudness {0} to {1} dBFS; more than 6 dB from the rest: {2}").replace("{0}", lo.low).replace("{1}", lo.high).replace("{2}", num((lo.apart || []).length)),
      (lo.apart || []).map(function (c) { return c[0] + " · " + c[1] + " dBFS"; })));
    var te = r.tempo;
    if (te) L.push(line(te.mixed ? "warn" : "ok", (te.mixed ? tr("Tempo by estimate {0}–{1} BPM: a mixed set, the adapter learns their middle") : tr("Tempo by estimate {0}–{1} BPM: one family"))
      .replace("{0}", te.low).replace("{1}", te.high)));
    if (r.unreadable && r.unreadable.length) L.push(line("bad", tr("Unreadable: {0}").replace("{0}", num(r.unreadable.length)), r.unreadable));
    if (r.parquet_rows) L.push(line("note", tr("Rows in parquet shards, counted, not looked at: {0}").replace("{0}", num(r.parquet_rows))));
    if (r.examined < r.tracks) L.push(line("note", tr("Tracks looked at: {0} of {1}, spread over the folder").replace("{0}", num(r.examined)).replace("{1}", num(r.tracks))));
    var clean = L.length === 2 && !(lo && lo.apart && lo.apart.length) && !(te && te.mixed) && songs >= 20;
    p.innerHTML = head((st.fresh ? "" : '<span class="row-hint tr-doc-stale">' + esc(tr("The folder changed since it was looked at")) + "</span>") +
      '<button type="button" class="btn ghost small" data-doc="again">' + esc(tr("Look again")) + "</button>") +
      '<ul class="tr-doc-list">' + L.join("") + "</ul>" +
      '<p class="row-hint tr-doc-foot">' + esc(clean ? tr("Nothing to say: every track as the guide asks.") : tr("The doctor says, the learner decides: it leaves nothing out by itself.")) + "</p>";
  }
  function refresh() {
    var asked = name;
    if (!asked) return Promise.resolve(null);
    return api("/train/doctor?name=" + encodeURIComponent(asked)).then(function (st) {
      if (asked !== name) return null;
      paint(st);
      clearTimeout(timer);
      if (st.status === "running") timer = setTimeout(refresh, 1500);
      return st;
    }).catch(function (e) {
      if (asked !== name) return null;
      paint({ status: "failed", error: e.message });
      return null;
    });
  }
  function look(again) {
    if (!name) return;
    api("/train/doctor", { name: name, again: !!again }).then(function (st) {
      if (st.status === "busy") window.HeresyDialog && window.HeresyDialog.alert(tr("The doctor is looking at another folder: when it is done, press again."));
      refresh();
    }).catch(function (e) { paint({ status: "failed", error: e.message }); });
  }
  function picked(n) {
    name = n;
    clearTimeout(timer);
    if (!ensure()) return;
    refresh().then(function (st) {
      if (st && st.status !== "running" && (!st.report || !st.fresh) && st.tracks > 0 && st.tracks <= AUTO) look(!!st.report);
    });
  }
  document.addEventListener("click", function (e) {   // in the capture: the Trainer paints its folders anew on the pick, the button leaves the page
    var b = e.target.closest && e.target.closest("#trRaw [data-raw]");
    if (b) { var n = b.dataset.raw; setTimeout(function () { picked(n); }, 0); }
  }, true);
  window.HeresyTrainDoctor = { picked: picked, refresh: refresh, paint: paint, name: function () { return name; } };   // for the checks
})();
