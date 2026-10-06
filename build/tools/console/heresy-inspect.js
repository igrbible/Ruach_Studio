// HERESY 1025: artifacts of a take, or of a file made from it, measured on Forge
// (lab/inspect_job.py): held tones (named as notes, so a drone is not taken for a fault),
// the VAE's frame buzz (the highs trembling at 25 Hz and its multiples), click candidates,
// clipping, dropouts, DC, stereo correlation and loudness. Every finding with a time seeks.
(function () {
  "use strict";

  var state = { take: null, source: "", token: 0, hooks: null };
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function clock(t) { var m = Math.floor(t / 60), s = Math.floor(t % 60); return m + ":" + (s < 10 ? "0" : "") + s; }
  function at(t) { return '<button type="button" class="gloss-time mono" data-in-seek="' + t + '">' + clock(t) + "</button>"; }
  function say(text, bad) { $("inState").textContent = text || ""; $("inState").classList.toggle("is-bad", !!bad); }
  function src() { return state.source ? "&source=" + encodeURIComponent(state.source) : ""; }

  function chip(label, value, level, tip) {
    return '<span class="in-chip is-' + level + '" data-tip="' + esc(tip || "") + '"><span class="in-chip-k">' + esc(label) + "</span>" + value + "</span>";
  }

  function paint(r) {
    var L = r.loudness || {}, fb = r.framebuzz || {}, st = r.stereo || {}, clip = r.clipping || {};
    var tp = L.true_peak, buzz = fb.mean_db;
    var html = '<div class="in-chips">' +
      chip("LUFS", L.lufs != null ? L.lufs.toFixed(1) : "—", "ok", "Integrated loudness (EBU R128)") +
      chip("LRA", L.lra != null ? L.lra.toFixed(1) + " LU" : "—", "ok", "Loudness range") +
      chip("True peak", tp != null ? (tp > 0 ? "+" : "") + tp.toFixed(1) + " dBTP" : "—", tp > 0 ? "bad" : tp > -1 ? "warn" : "ok",
           "Above 0 dBTP the take clips on most players; the Remaster's -1 dBTP fixes it") +
      chip("Clipping", (clip.runs || 0) + " runs", clip.runs ? "bad" : "ok", "Runs of 3+ samples at full scale") +
      chip("Frame buzz", buzz != null ? buzz.toFixed(1) + " dB" : "—", buzz > 10 ? "bad" : buzz > 5 ? "warn" : "ok",
           "The 4–12 kHz envelope at 25, 50 … 150 Hz above its neighbours, mean of all windows: the VAE's 25 frames a second heard as an electric buzz in the highs") +
      chip("DC", (r.dc || []).map(function (v) { return v.toFixed(4); }).join(" / "), (r.dc || []).some(function (v) { return Math.abs(v) > 0.002; }) ? "warn" : "ok", "Offset of zero per channel") +
      "</div>";

    // tones
    var tones = r.tones || [];
    html += '<h4 class="in-h">Held tones <em>narrow peaks standing 8+ dB above their ±1/6 octave in 35%+ of the song</em></h4>';
    html += tones.length ? '<table class="in-table"><tr><th>Hz</th><th>pitch</th><th>of the time</th><th>above</th><th></th></tr>' + tones.map(function (t) {
      var kind = t.mains ? '<span class="in-tag is-bad">mains ' + esc(t.mains) + "</span>" : t.musical ? '<span class="in-tag is-ok">music</span>'
        : '<span class="in-tag is-warn">' + (t.hz > 12000 ? "high whine" : "suspect") + "</span>";
      return "<tr><td class=\"mono\">" + t.hz.toFixed(1) + "</td><td class=\"mono\">" + esc(t.note || "") + "</td><td>" + Math.round(t.share * 100) +
        "%</td><td>" + t.above_db.toFixed(1) + " dB</td><td>" + kind + "</td></tr>";
    }).join("") + "</table>" : '<p class="row-hint">None.</p>';

    // frame buzz windows
    if ((fb.windows || []).length) {
      var max = Math.max.apply(null, fb.windows.map(function (w) { return w.mean_db; }).concat([12]));
      html += '<h4 class="in-h">Frame buzz per 30 s <em>25–150 Hz in the highs\' envelope, dB above the neighbours</em></h4><div class="in-bars">' +
        fb.windows.map(function (w) {
          var lv = w.mean_db > 10 ? "bad" : w.mean_db > 5 ? "warn" : "ok";
          return '<button type="button" class="in-bar is-' + lv + '" data-in-seek="' + w.at + '" data-tip="' + clock(w.at) + ": " + w.by_hz.map(function (v, i) { return fb.hz[i] + " Hz " + v.toFixed(1); }).join(" · ") +
            '"><span style="height:' + Math.max(4, Math.round(Math.max(0, w.mean_db) / max * 100)) + '%"></span><em>' + clock(w.at) + "</em></button>";
        }).join("") + "</div>";
    }

    // clicks, dropouts, stereo
    var clicks = r.clicks || [];
    html += '<h4 class="in-h">Click candidates <em>' + clicks.length + ' — a sharp corner in the waveform; a harp or a drum hit can look the same: listen</em></h4>' +
      (clicks.length ? '<div class="in-list">' + clicks.map(function (c) { return '<span class="in-item">' + at(c.at) + " ×" + Math.round(c.strength) + "</span>"; }).join("") + "</div>" : "");
    var drops = r.dropouts || [];
    if (drops.length) html += '<h4 class="in-h">Dropouts</h4><div class="in-list">' + drops.map(function (d) { return '<span class="in-item">' + at(d.at) + " " + d.ms + " ms, −" + d.depth_db + " dB</span>"; }).join("") + "</div>";
    if (st.bands) {
      html += '<h4 class="in-h">Stereo <em>left–right correlation per band; below 0, the channels work against each other</em></h4><div class="in-chips">' +
        st.bands.map(function (b) { return chip(b.band, b.correlation.toFixed(2), b.correlation < 0 ? "bad" : b.correlation < 0.3 ? "warn" : "ok", ""); }).join("") + "</div>" +
        ((st.negative || []).length ? '<div class="in-list">' + st.negative.map(function (n) { return '<span class="in-item">' + at(n.at) + " " + n.correlation.toFixed(2) + "</span>"; }).join("") + "</div>" : "");
    }
    html += '<p class="row-hint">' + clock(r.seconds || 0) + " · " + (r.rate || "") + " Hz · measured in " + (r.took || "?") + " s on Forge</p>";
    $("inResult").innerHTML = html;
    if (state.take) window.dispatchEvent(new CustomEvent("heresy-step", { detail: { name: state.take.name, step: "inspect" } }));   // HERESY 1029
  }

  function run(force) {
    if (!state.take) return;
    var token = ++state.token, started = Date.now();
    $("inRun").disabled = true;
    var ticker = setInterval(function () { say("Forge is listening for faults… " + Math.round((Date.now() - started) / 1000) + "s"); }, 1000);
    function ask(first) {
      return fetch("/lab/inspect?name=" + encodeURIComponent(state.take.name) + src() + (force && first ? "&force=1" : "")).then(function (r) {
        return r.json().then(function (b) {
          if (r.status === 202) return new Promise(function (res) { setTimeout(res, 2000); }).then(function () { return ask(false); });
          if (!r.ok) throw new Error(b.error || r.status);
          return b;
        });
      });
    }
    ask(true).then(function (r) { if (token === state.token) { paint(r); say(""); $("inRun").textContent = "Inspect again"; } })
      .catch(function (e) { if (token === state.token) say("Could not: " + (e.message || e), true); })
      .then(function () { clearInterval(ticker); $("inRun").disabled = false; });
  }

  function init(hooks) {
    if (!$("inspectPanel")) return;
    state.hooks = hooks || {};
    $("inRun").addEventListener("click", function () { run((window.RuachI18n ? RuachI18n.en($("inRun")) : $("inRun").textContent) === "Inspect again"); });
    $("inSource").addEventListener("change", function () { state.source = this.value; $("inResult").innerHTML = ""; $("inRun").textContent = "Inspect"; });
    $("inResult").addEventListener("click", function (e) {
      var b = e.target.closest("[data-in-seek]");
      if (b && state.hooks.seek) state.hooks.seek(state.take, parseFloat(b.dataset.inSeek));
    });
    window.addEventListener("heresy-derived", function (event) {
      if (!state.take || event.detail.name !== state.take.name) return;
      var keep = state.source, sel = $("inSource");
      sel.innerHTML = '<option value="">the take</option>' + event.detail.files.map(function (f) {
        return '<option value="' + esc(f.source) + '">' + esc(f.label.replace(/^↳ /, "")) + "</option>";
      }).join("");
      sel.value = Array.prototype.some.call(sel.options, function (o) { return o.value === keep; }) ? keep : "";
      state.source = sel.value;
    });
  }

  function setTake(take) {
    if (!$("inspectPanel")) return;
    if (state.take && take && state.take.name === take.name) return;
    state.take = take; state.source = ""; state.token++;
    $("inSource").innerHTML = '<option value="">the take</option>';
    $("inResult").innerHTML = ""; $("inRun").textContent = "Inspect"; say("");
    // an earlier measurement shows at once (the lab keeps it)
    var token = state.token;
    fetch("/lab/inspect?cached=1&name=" + encodeURIComponent(take.name)).then(function (r) { return r.status === 200 ? r.json() : null; })
      .then(function (r) { if (r && token === state.token && r.loudness) { paint(r); $("inRun").textContent = "Inspect again"; } })
      .catch(function () {});
  }

  // HERESY 1059: a source chosen from outside (the chain's final file), its measurement shown if made
  function useSource(source) {
    if (!state.take || !$("inspectPanel")) return;
    var sel = $("inSource");
    if (!Array.prototype.some.call(sel.options, function (o) { return o.value === source; })) {
      var o = document.createElement("option");
      o.value = source; o.textContent = source.split("/").slice(-2).join(" · ");
      sel.appendChild(o);
    }
    sel.value = source; state.source = source; state.token++;
    $("inResult").innerHTML = ""; $("inRun").textContent = "Inspect"; say("");
    var token = state.token;
    fetch("/lab/inspect?cached=1&name=" + encodeURIComponent(state.take.name) + src()).then(function (r) { return r.status === 200 ? r.json() : null; })
      .then(function (r) { if (r && token === state.token && r.loudness) { paint(r); $("inRun").textContent = "Inspect again"; } })
      .catch(function () {});
  }

  window.HeresyInspect = { init: init, setTake: setTake, useSource: useSource };
})();
