// HERESY 1021: what is made from a take — stems now, remasters and upscales next — as a tree
// under it, in the Refiner. heresy-lab keeps each derived thing in outputs/TAKE/derived/ID/ with a
// manifest.json (kind, models, files, when), so deleting the take deletes its children.
// Every file in the tree can be played, laid over the take in the spectrum, and given to
// the lyrics check (a vocal stem is what Whisper hears best).
(function () {
  "use strict";

  var state = { take: null, list: [], running: [], token: 0, hooks: null, lit: "" };
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function clock(t) { var m = Math.floor(t / 60), s = Math.floor(t % 60); return m + ":" + (s < 10 ? "0" : "") + s; }
  // HERESY 1061: from the engine itself (native Range); the lab proxy failed on big files and on seeks
  function fileUrl(name, path) { return "/library/file?name=" + encodeURIComponent(name) + "&path=" + encodeURIComponent(path); }
  var KIND = { stems: "Stems", remaster: "Remaster", upscale: "Upscale", debuzz: "Debuzz" };
  var MODE = { vocals: "vocals + instrumental", four: "four stems" };

  function say(text, bad) {
    $("derivedState").textContent = text || "";
    $("derivedState").classList.toggle("is-bad", !!bad);
  }

  // every playable file of the shown take: [{name, source, url, label, kind}]
  function files() {
    var take = state.take, out = [];
    if (!take) return out;
    state.list.forEach(function (m) {
      (m.files || []).forEach(function (f) {
        out.push({ name: take.name, source: f.path, url: fileUrl(take.name, f.path), kind: m.kind,
                   label: "↳ " + f.name + " (" + (KIND[m.kind] || m.kind) + (m.mode ? ", " + (MODE[m.mode] || m.mode) : "") + ")" });
      });
    });
    return out;
  }

  // a remaster's settings in a line: where from, preset, the steps on, loudness in -> out (HERESY 1022)
  function summary(m) {
    var s = m.settings || {}, from = m.source && m.source !== "the take" ? String(m.source).replace("derived/", "") : "";
    var parts = [from ? "from " + from : "from the take"];
    if (from) parts.push(s.preset || "balanced");
    if (s.cleanup !== false) parts.push("cleanup");
    if (s.fade) parts.push("fade " + s.fade + " s");
    if (s.deess) parts.push("de-ess " + (s.deess_mode || "subtle"));
    parts.push(s.hz432 === false ? "440 Hz" : "432 Hz");
    if (s.loudnorm !== false) parts.push((s.lufs || -14) + " LUFS");
    if (m.lufs_in != null && m.lufs_out != null) parts.push("measured " + m.lufs_in + " → " + m.lufs_out + " LUFS");
    return parts.join(", ");
  }

  // HERESY 1030: the frame ripple in and out, against the controls
  function debuzzSummary(m) {
    var r = m.measure || {}, b = r.before || {}, a = r.after || {};
    var from = "from " + String(m.source || "the take").replace("derived/", "") + ", " + Math.round((m.strength || 0) * 100) + " %";
    if (!r.found) return from + " · no frame ripple found (" + (b.frame || 0).toFixed(1) + " % at 1920 against " + (b.control || 0).toFixed(1) + " % by chance)";
    return from + " · ripple " + b.frame.toFixed(1) + " % → " + a.frame.toFixed(1) + " % (by chance " + b.control.toFixed(1) + " %)";
  }

  function paint() {
    var host = $("derivedTree"), take = state.take;
    if (!take) { host.innerHTML = '<p class="row-hint">Pick a take on the right.</p>'; return; }
    // HERESY 1138: the take itself is a node of the tree like its branches: it plays, it downloads, and it opens the
    // comparison of every version (the original first)
    var orig = "/library/listen?name=" + encodeURIComponent(take.name);
    var html = '<div class="dv-node dv-root dv-orig"><span class="dv-name">' + esc(take.label || take.name) + ' <em class="dv-orig-tag">the original</em></span>' +
      '<span class="dv-meta mono">' + (take.seconds ? clock(take.seconds) : "") + "</span>" +
      '<audio controls preload="none" src="' + esc(orig) + '"></audio>' +
      '<button type="button" class="btn small primary dv-compare" data-dv-compare="0" data-tip="Every version of this take in one player: switch between them at the same second (1–9, Space)">Compare all</button>' +
      '<a class="btn ghost small" href="/library/flac?name=' + encodeURIComponent(take.name) + '" download="' + esc((take.label || take.name) + ".flac") + '">FLAC</a></div>';
    if (!state.list.length && !state.running.length) html += '<p class="row-hint dv-empty">Nothing made from this take yet.</p>';
    // HERESY 1129: what runs now stands first: the tree grows upward, the newest on top
    state.running.forEach(function (j, i) {
      var failed = j.status === "failed", p = progress(j);
      html += '<div class="dv-group is-running' + (failed ? " is-failed" : "") + '" data-job="' + i + '" data-kind="' + esc(j.kind || "") + '"><div class="dv-group-head"><strong>' + esc(KIND[j.kind] || j.kind || "Job") + "</strong>" +
        (j.mode ? " · " + esc(MODE[j.mode] || j.mode) : "") + '<span class="dv-meta">' + (failed ? "failed: " + esc(j.error || "") : esc(p.say)) + "</span></div>" +
        (failed ? "" : '<div class="job-bar' + (j.status === "queued" ? " is-queued" : "") + '"><i style="width:' + p.pct + '%"></i></div>') + "</div>";
    });
    state.list.forEach(function (m) {
      html += '<div class="dv-group" data-dv-id="' + esc(m.id || "") + '" data-kind="' + esc(m.kind || "") + '"><div class="dv-group-head"><strong>' + esc(KIND[m.kind] || m.kind) + "</strong>" +
        (m.mode ? " · " + esc(MODE[m.mode] || m.mode) : "") + (m.kind === "remaster" ? " · " + esc(summary(m)) : "") +
        (m.kind === "debuzz" ? " · " + esc(debuzzSummary(m)) : "") +
        (m.kind === "upscale" ? " · from " + esc(String(m.source || "the take").replace("derived/", "")) + ", above " + Math.round((m.cutoff_hz || 0) / 1000) + " kHz" + (m.keep_low ? ", original kept below" : "") : "") +
        '<span class="dv-meta">' + esc((m.models || []).join(" + ")) + " · " + esc(m.created || "") + (m.took ? " · " + Math.round(m.took) + " s" : "") + "</span></div>";
      (m.files || []).forEach(function (f) {
        var url = fileUrl(take.name, f.path);
        html += '<div class="dv-node"><span class="dv-name">↳ ' + esc(f.name) + '</span><span class="dv-meta mono">' + (f.seconds ? clock(f.seconds) : "") + "</span>" +
          '<audio controls preload="none" src="' + esc(url) + '"></audio>' +
          '<button type="button" class="btn ghost small" data-dv-compare-path="' + esc(f.path) + '" data-tip="Compare it with the original and every other version, at the same second">Compare</button>' +
          '<button type="button" class="btn ghost small" data-dv-spectrum="' + esc(f.path) + '" data-tip="Lay this file over the take in the spectrum">Spectrum</button>' +
          (/vocal/i.test(f.name) ? '<button type="button" class="btn ghost small" data-dv-gloss="' + esc(f.path) + '" data-tip="Whisper on this file against the lyrics">Lyrics check</button>' : "") +
          '<a class="btn ghost small" href="' + esc(url) + '" download="' + esc((take.label || take.name) + " - " + f.name + ".flac") + '">FLAC</a></div>';
      });
      html += "</div>";
    });
    host.innerHTML = html;
    if (!state.lit) {                                   // the step open when the page loaded lights its branches too
      var open = document.querySelector("#postSteps .is-active[data-step-panel]");
      if (open) state.lit = STEP_KIND[open.dataset.stepPanel] || "";
    }
    host.dataset.lit = state.lit || "";
    paintLive();
    paintMade();
    window.dispatchEvent(new CustomEvent("heresy-derived", { detail: { name: take.name, files: files() } }));
  }

  // ---- HERESY 1060: progress, estimated: the lab says running or queued, not how far. The rates are
  // measured on Forge (seconds of work per second of audio); the bar stops at 95 % until the file lands.
  var RATE = { debuzz: 0.18, remaster: 0.12, upscale: 1.8, stems: 0.7 };
  function progress(j) {
    var el = Math.max(0, Math.round(Date.now() / 1000 - (j.started || Date.now() / 1000)));
    var len = state.take && state.take.seconds || 0, rate = RATE[j.kind] * (j.kind === "stems" && j.mode === "four" ? 1.8 : 1);
    var clockS = function (s) { return s >= 60 ? Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2) : s + " s"; };
    if (j.status === "queued") return { pct: 3, say: "waiting for Forge\u2026 " + clockS(el) };
    if (!len || !rate) return { pct: 50, say: "running\u2026 " + clockS(el) };
    var est = Math.max(5, len * rate), pct = Math.min(95, Math.round(100 * el / est));
    return { pct: pct, say: clockS(el) + (el < est ? " \u00b7 about " + clockS(Math.round(est - el)) + " left" : " \u00b7 longer than usual") };
  }
  // HERESY 1129: what runs, where the eye already is. The room's head (always in sight) names every job with its bar;
  // the step's own block carries its jobs at its top, its tab a beating dot; each step shows what it has made for the
  // take (a click finds it in the tree), and the step open lights its own branches in the tree. The floating card of
  // 1060 (it sat over the server log and the takes) is retired.
  var PANEL = { stems: "derivedPanel", remaster: "remasterPanel", upscale: "upscalePanel", debuzz: "debuzzPanel" };
  var STEP_KIND = { derivedPanel: "stems", remasterPanel: "remaster", upscalePanel: "upscale", debuzzPanel: "debuzz" };
  function slots(kind) {
    var p = $(PANEL[kind]), body = p && p.querySelector(".drawer-body");
    if (!body) return null;
    var live = body.querySelector(":scope > .dv-live"), made = body.querySelector(":scope > .dv-made");
    if (!live) { live = document.createElement("div"); live.className = "dv-live"; body.insertBefore(live, body.firstChild); }
    if (!made) { made = document.createElement("div"); made.className = "dv-made"; live.after(made); }
    return { live: live, made: made };
  }
  function liveRow(j) {
    var p = progress(j), failed = j.status === "failed";
    return '<div class="dv-live-row' + (failed ? " is-failed" : "") + '"><div class="dv-live-head"><b>' + esc(KIND[j.kind] || j.kind || "Job") + (j.mode ? " \u00b7 " + esc(MODE[j.mode] || j.mode) : "") + "</b>" +
      "<span>" + (failed ? "failed: " + esc(j.error || "") : esc(p.say)) + "</span></div>" +
      (failed ? "" : '<div class="job-bar' + (j.status === "queued" ? " is-queued" : "") + '"><i style="width:' + p.pct + '%"></i></div>') + "</div>";
  }
  function paintLive() {
    var head = $("postLive"), live = state.running.filter(function (j) { return j.status !== "failed"; });
    if (!head) {
      var ch = document.querySelector("#view-post .col-head");
      if (ch) { head = document.createElement("div"); head.id = "postLive"; head.className = "post-live"; ch.appendChild(head); }
    }
    if (head) { head.innerHTML = live.map(liveRow).join(""); head.hidden = !live.length; }
    Object.keys(PANEL).forEach(function (kind) {
      var s = slots(kind);
      if (!s) return;
      var mine = state.running.filter(function (j) { return j.kind === kind; });
      s.live.innerHTML = mine.map(liveRow).join("");
      s.live.hidden = !mine.length;
      var tab = document.querySelector('#postSteps [data-step-panel="' + PANEL[kind] + '"]');
      if (tab) tab.classList.toggle("is-running", mine.some(function (j) { return j.status !== "failed"; }));
    });
    var old = document.getElementById("postJobs");
    if (old) old.remove();
  }
  function madeLabel(m) {
    var s = m.settings || {}, at = String(m.created || "").slice(11, 16);
    var what = m.kind === "stems" ? (MODE[m.mode] || m.mode || "stems")
      : m.kind === "remaster" ? (m.source && m.source !== "the take" ? (s.preset || "balanced") + " from stems" : "from the take") + (s.loudnorm !== false ? ", " + (s.lufs || -14) + " LUFS" : "")
      : m.kind === "upscale" ? (m.mode || "upscale") + ", " + ((m.files || []).length) + " file" + ((m.files || []).length === 1 ? "" : "s")
      : m.kind === "debuzz" ? Math.round((m.strength || 0) * 100) + " %" : m.kind;
    return what + (at ? " \u00b7 " + at : "");
  }
  function paintMade() {
    Object.keys(PANEL).forEach(function (kind) {
      var s = slots(kind);
      if (!s) return;
      var mine = state.list.filter(function (m) { return m.kind === kind; });
      s.made.innerHTML = !state.take ? "" : '<span class="dv-made-cap">Made here</span>' + (mine.length ? mine.map(function (m) {
        return '<button type="button" class="dv-chip" data-dv-go="' + esc(m.id || "") + '" data-tip="Find it in the tree below">' + esc(madeLabel(m)) + "</button>";
      }).join("") : '<span class="dv-made-none">nothing yet for this take</span>');
    });
  }
  function lightStep(panel) {
    state.lit = STEP_KIND[panel] || "";
    var host = $("derivedTree");
    if (host) host.dataset.lit = state.lit;
  }
  // each second: only the bars and their words, never the tree (its players would start over)
  setInterval(function () {
    state.running.forEach(function (j, i) {
      var g = document.querySelector('#derivedTree [data-job="' + i + '"]');
      if (!g || j.status === "failed") return;
      var p = progress(j), meta = g.querySelector(".dv-meta"), bar = g.querySelector(".job-bar i");
      if (meta) meta.textContent = p.say;
      if (bar) bar.style.width = p.pct + "%";
    });
    if (state.running.length) paintLive();
  }, 1000);

  function refresh() {
    if (!state.take) { paint(); return Promise.resolve(); }
    var token = state.token, name = state.take.name;
    return fetch("/lab/derived?name=" + encodeURIComponent(name)).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (token !== state.token || !d) return;
        state.list = d.derived || [];
        state.running = d.running || [];
        paint();
        paintSources();
        paintUpSources();
        paintDbSources();
        // while Forge works on this take, look again every three seconds
        clearTimeout(state.watch);
        if (state.running.some(function (j) { return j.status !== "failed"; })) state.watch = setTimeout(refresh, 3000);
      }).catch(function () {
        // a dropped answer on a slow line: keep watching while something was running
        if (token === state.token && state.running.some(function (j) { return j.status !== "failed"; })) {
          clearTimeout(state.watch);
          state.watch = setTimeout(refresh, 5000);
        }
      });
  }

  function split(mode) {
    if (!state.take) return;
    var token = state.token, name = state.take.name, started = Date.now();
    var ticker = setInterval(function () { say("Forge is splitting (" + MODE[mode] + ")… " + Math.round((Date.now() - started) / 1000) + "s"); }, 1000);
    all(true);
    function ask() {
      return fetch("/lab/stems?name=" + encodeURIComponent(name) + "&mode=" + mode).then(function (r) {
        return r.json().then(function (body) {
          if (r.status === 202) {
            if (token === state.token && !state.running.length) refresh();
            return new Promise(function (resolve) { setTimeout(resolve, 3000); }).then(ask);
          }
          if (!r.ok) throw new Error(body.error || "heresy-lab answered " + r.status);
          return body;
        });
      });
    }
    ask().then(function (m) {
      if (token === state.token) say("Done: " + (m.files || []).map(function (f) { return f.name; }).join(", ") + " in " + Math.round(m.took || 0) + " s");
    }).catch(function (error) {
      if (token === state.token) say("Could not split: " + (error && error.message || error), true);
    }).then(function () { clearInterval(ticker); all(false); refresh(); });
  }
  function all(busy) {
    Array.prototype.forEach.call(document.querySelectorAll("[data-dv-split]"), function (b) { b.disabled = busy; });
  }

  // ---- remaster (HERESY 1022): the Debunker v6 on the take or one of its stem sets
  function paintSources() {
    var sel = $("rmSource");
    if (!sel) return;
    var keep = sel.value, stems = state.list.filter(function (m) { return m.kind === "stems"; });
    // HERESY 1030: a debuzzed file is a source too (the stems as a set, a debuzzed one as it is)
    var single = files().filter(function (f) { return f.kind === "debuzz"; });
    sel.innerHTML = '<option value="">the take</option>' + stems.map(function (m) {
      return '<option value="derived/' + esc(m.id) + '">stems: ' + esc(MODE[m.mode] || m.mode) + "</option>";
    }).join("") + single.map(function (f) {
      return '<option value="' + esc(f.source) + '">' + esc(f.label.replace(/^↳ /, "")) + "</option>";
    }).join("");
    sel.value = Array.prototype.some.call(sel.options, function (o) { return o.value === keep; }) ? keep : "";
    paintLevels();
  }
  function paintLevels() {
    var src = $("rmSource").value, box = $("rmLevels");
    var m = state.list.filter(function (x) { return "derived/" + x.id === src; })[0];
    box.classList.toggle("is-hidden", !m);
    // HERESY 1148: the preset and the de-esser act on stems before the Debunker mixes them; on a single file (the take, a
    // debuzzed file) it goes straight on and they would do nothing, so they are off there, and the tip says why
    ["rmPreset", "rmDeess", "rmDeessMode"].forEach(function (id) { if ($(id)) $(id).disabled = !m; });
    if (!m) { box.innerHTML = ""; return; }
    var names = (m.files || []).map(function (f) { return f.name; });
    if (names.indexOf("drums") >= 0) names = names.filter(function (n) { return n !== "instrumental"; });   // the sum of the others
    box.innerHTML = '<span class="label">Levels, dB <em>blank: the preset decides</em></span><div class="rm-grid">' + names.map(function (n) {
      return '<label class="field rm-num"><span class="label">' + esc(n) + '</span><input type="number" step="0.5" min="-24" max="12" data-rm-level="' + esc(n) + '" placeholder="preset" /></label>';
    }).join("") + "</div>";
  }
  // ---- upscale (HERESY 1024): any file of the tree, or the take
  function paintUpSources() {
    var sel = $("upSource");
    if (!sel) return;
    var keep = sel.value;
    sel.innerHTML = '<option value="">the take</option>' + files().filter(function (f) { return f.kind !== "upscale"; }).map(function (f) {
      return '<option value="' + esc(f.source) + '">' + esc(f.label.replace(/^↳ /, "")) + "</option>";
    }).join("");
    sel.value = Array.prototype.some.call(sel.options, function (o) { return o.value === keep; }) ? keep : "";
  }
  function upscale() {
    if (!state.take) return;
    var q = "name=" + encodeURIComponent(state.take.name) + "&mode=" + $("upMode").value + "&variants=" + $("upVariants").value +
      "&keep=" + ($("upKeep").checked ? "1" : "0") + ($("upSource").value ? "&source=" + encodeURIComponent($("upSource").value) : "");
    $("upRun").disabled = true;
    $("upState").textContent = "sending to Forge…";
    fetch("/lab/upscale?" + q).then(function (r) { return r.json().then(function (b) { if (!r.ok && r.status !== 202) throw new Error(b.error || r.status); return b; }); })
      .then(function () { $("upState").textContent = "running on Forge: the bar above says how far; it lands in the tree"; refresh(); })
      .catch(function (e) { $("upState").textContent = "Could not: " + (e.message || e); })
      .then(function () { $("upRun").disabled = false; });
  }

  // ---- debuzz (HERESY 1030): the take or any file of the tree but a debuzzed or upscaled one
  function paintDbSources() {
    var sel = $("dbSource");
    if (!sel) return;
    var keep = sel.value;
    sel.innerHTML = '<option value="">the take</option>' + files().filter(function (f) { return f.kind !== "debuzz" && f.kind !== "upscale"; }).map(function (f) {
      return '<option value="' + esc(f.source) + '">' + esc(f.label.replace(/^↳ /, "")) + "</option>";
    }).join("");
    sel.value = Array.prototype.some.call(sel.options, function (o) { return o.value === keep; }) ? keep : "";
  }
  function debuzz() {
    if (!state.take) return;
    var fr = state.hooks.frame ? state.hooks.frame() : null;    // HERESY 1055: the model's frame, from /props
    var q = "name=" + encodeURIComponent(state.take.name) + "&strength=" + $("dbStrength").value +
      (fr ? "&period=" + fr.period + "&rate=" + fr.rate : "") +
      ($("dbSource").value ? "&source=" + encodeURIComponent($("dbSource").value) : "");
    $("dbRun").disabled = true;
    $("dbState").textContent = "sending to Forge…";
    fetch("/lab/debuzz?" + q).then(function (r) { return r.json().then(function (b) { if (!r.ok && r.status !== 202) throw new Error(b.error || r.status); return b; }); })
      .then(function () { $("dbState").textContent = "running on Forge: the bar above says how far; it lands in the tree"; refresh(); })
      .catch(function (e) { $("dbState").textContent = "Could not: " + (e.message || e); })
      .then(function () { $("dbRun").disabled = false; });
  }

  function remasterSettings() {            // HERESY 1054: the form's settings, for the Remaster button and the chain
    var levels = {};
    Array.prototype.forEach.call(document.querySelectorAll("[data-rm-level]"), function (i) {
      if (i.value.trim() !== "") levels[i.dataset.rmLevel] = parseFloat(i.value);
    });
    var s = { source: $("rmSource").value, preset: $("rmPreset").value, levels: levels,
              cleanup: $("rmCleanup").checked, fade: parseFloat($("rmFade").value) || 0,
              trim_start: parseFloat($("rmTrimStart").value) || 0, trim_end: parseFloat($("rmTrimEnd").value) || 0,
              deess: $("rmDeess").checked && !$("rmDeess").disabled, deess_mode: $("rmDeessMode").value, hz432: $("rm432").checked,
              loudnorm: $("rmLoud").checked, lufs: parseFloat($("rmLufs").value) || -14, tp: parseFloat($("rmTp").value) || -1,
              formats: $("rmMp3").checked ? ["wav", "flac", "mp3"] : ["wav", "flac"] };
    return s;
  }
  function remaster() {
    if (!state.take) return;
    var s = remasterSettings();
    $("rmRun").disabled = true;
    $("rmState").textContent = "sending to Forge…";
    fetch("/lab/remaster?name=" + encodeURIComponent(state.take.name) + "&s=" + encodeURIComponent(JSON.stringify(s)))
      .then(function (r) { return r.json().then(function (b) { if (!r.ok && r.status !== 202) throw new Error(b.error || r.status); return b; }); })
      .then(function () { $("rmState").textContent = "running on Forge: the bar above says how far; it lands in the tree"; refresh(); })
      .catch(function (e) { $("rmState").textContent = "Could not: " + (e.message || e); })
      .then(function () { $("rmRun").disabled = false; });
  }

  function init(hooks) {
    if (!$("derivedPanel")) return;
    state.hooks = hooks || {};
    if ($("upRun")) $("upRun").addEventListener("click", upscale);
    if ($("dbRun")) $("dbRun").addEventListener("click", debuzz);   // HERESY 1030
    if ($("rmRun")) {
      $("rmRun").addEventListener("click", remaster);
      $("rmSource").addEventListener("change", paintLevels);
      paintLevels();                                      // HERESY 1148: the take is the source until stems exist
    }
    Array.prototype.forEach.call(document.querySelectorAll("[data-dv-split]"), function (b) {
      b.addEventListener("click", function () { split(b.dataset.dvSplit); });
    });
    $("derivedTree").addEventListener("click", function (event) {
      var sp = event.target.closest("[data-dv-spectrum]"), gl = event.target.closest("[data-dv-gloss]");
      if (sp && state.hooks.compare) state.hooks.compare(sp.dataset.dvSpectrum);
      if (gl && state.hooks.gloss) state.hooks.gloss(gl.dataset.dvGloss);
    });
    // HERESY 1138: the comparison, from the original's row or any branch's
    $("derivedTree").addEventListener("click", function (event) {
      var all = event.target.closest("[data-dv-compare]"), one = event.target.closest("[data-dv-compare-path]");
      if (all) compare("");
      if (one) compare(one.dataset.dvComparePath);
    });
    // HERESY 1129: a step's chips find what it made in the tree; the step open lights its own branches
    document.addEventListener("click", function (event) {
      var go = event.target.closest("[data-dv-go]");
      if (!go) return;
      var g = document.querySelector('#derivedTree [data-dv-id="' + go.dataset.dvGo + '"]');
      if (!g) return;
      g.scrollIntoView({ block: "center", behavior: "smooth" });
      g.classList.remove("is-flash"); void g.offsetWidth; g.classList.add("is-flash");
    });
    document.addEventListener("mouseover", function (event) {
      var go = event.target.closest && event.target.closest("[data-dv-go]");
      Array.prototype.forEach.call(document.querySelectorAll("#derivedTree .dv-group.is-lit"), function (g) { g.classList.remove("is-lit"); });
      if (go) { var g = document.querySelector('#derivedTree [data-dv-id="' + go.dataset.dvGo + '"]'); if (g) g.classList.add("is-lit"); }
    });
    window.addEventListener("heresy-post-step", function (e) { lightStep(e.detail && e.detail.panel); });
    // one player at a time: starting a stem pauses the others
    $("derivedTree").addEventListener("play", function (event) {
      Array.prototype.forEach.call($("derivedTree").querySelectorAll("audio"), function (a) { if (a !== event.target) a.pause(); });
      if (state.hooks.pauseMain) state.hooks.pauseMain();
    }, true);
  }

  // ---- HERESY 1138: every version of the take in one player, as SUNO switches versions: the original, then each
  // branch of the tree (debuzz, remasters, upscales, stems), one transport; a click on another version (or its number)
  // plays it from the same second. Each version is its own audio element, so a switch seeks only the one coming in,
  // which starts before the one going out stops: no gap to hear, no restart.
  function compare(startPath) {
    var take = state.take;
    if (!take) return;
    if (state.hooks.pauseMain) state.hooks.pauseMain();
    Array.prototype.forEach.call(document.querySelectorAll("#derivedTree audio"), function (a) { a.pause(); });
    var GROUP = { debuzz: "Debuzz", remaster: "Remaster", upscale: "Upscale", stems: "Stems" };
    var versions = [{ label: "The original", group: "", url: "/library/listen?name=" + encodeURIComponent(take.name), path: "", seconds: take.seconds }];
    ["debuzz", "remaster", "upscale", "stems"].forEach(function (kind) {
      state.list.filter(function (m) { return m.kind === kind; }).forEach(function (m) {
        (m.files || []).forEach(function (f) {
          versions.push({ label: f.name, group: GROUP[kind] + (m.mode ? " · " + (MODE[m.mode] || m.mode) : "") + (m.created ? " · " + String(m.created).slice(11, 16) : ""),
                          url: fileUrl(take.name, f.path), path: f.path, seconds: f.seconds });
        });
      });
    });
    var active = Math.max(0, versions.findIndex(function (v) { return v.path === startPath; }));
    var audios = versions.map(function (v) { var a = new Audio(); a.preload = "metadata"; a.src = v.url; return a; });
    var back = document.createElement("div");
    back.className = "cmp-back";
    back.innerHTML = '<div class="cmp-box" role="dialog" aria-modal="true" aria-label="Compare the versions">' +
      '<div class="cmp-head"><div><div class="cmp-title">Compare · ' + esc(take.label || take.name) + '</div>' +
      '<div class="row-hint">' + versions.length + " versions · a click (or its number) plays it from the same second · Space plays and pauses · ← → five seconds</div></div>" +
      '<button type="button" class="btn ghost small" data-cmp="close">Close</button></div>' +
      '<div class="cmp-transport"><button type="button" class="cmp-play" data-cmp="play" aria-label="Play"></button>' +
      '<span class="cmp-time mono">0:00</span><input type="range" class="cmp-seek" min="0" max="1000" value="0" aria-label="Position" /><span class="cmp-total mono">0:00</span></div>' +
      '<ol class="cmp-list">' + versions.map(function (v, i) {
        return '<li><button type="button" class="cmp-row" data-cmp-i="' + i + '"><span class="cmp-n mono">' + (i < 9 ? i + 1 : "") + '</span><span class="cmp-name">' + esc(v.label) + "</span>" +
          '<span class="cmp-group">' + esc(v.group || "as YuE2 made it") + '</span><span class="cmp-dur mono">' + (v.seconds ? clock(v.seconds) : "") + "</span></button></li>";
      }).join("") + "</ol></div>";
    document.body.appendChild(back);
    var box = back.querySelector(".cmp-box"), seek = box.querySelector(".cmp-seek"), playBtn = box.querySelector(".cmp-play"), dragging = false;
    var ico = function (n) { return window.HeresyIcons && window.HeresyIcons.ui ? window.HeresyIcons.ui(n) : (n === "pause" ? "❚❚" : "▶"); };
    function cur() { return audios[active]; }
    function paint() {
      var a = cur(), d = isFinite(a.duration) ? a.duration : (versions[active].seconds || 0);
      playBtn.innerHTML = ico(a.paused ? "play" : "pause");
      playBtn.setAttribute("aria-label", a.paused ? "Play" : "Pause");
      box.querySelector(".cmp-time").textContent = clock(a.currentTime || 0);
      box.querySelector(".cmp-total").textContent = d ? clock(d) : "0:00";
      if (!dragging && d) seek.value = String(Math.round(1000 * (a.currentTime || 0) / d));
      Array.prototype.forEach.call(box.querySelectorAll(".cmp-row"), function (r, i) {
        r.classList.toggle("is-on", i === active);
        r.classList.toggle("is-playing", i === active && !a.paused);
      });
    }
    function pick(i) {
      if (i < 0 || i >= audios.length || i === active) return;
      var from = cur(), to = audios[i], t = from.currentTime || 0, playing = !from.paused;
      var place = function () { try { to.currentTime = Math.min(t, isFinite(to.duration) ? Math.max(0, to.duration - 0.05) : t); } catch (e) { /* not seekable yet */ } };
      active = i;
      if (to.readyState >= 1) place(); else to.addEventListener("loadedmetadata", place, { once: true });
      if (playing) {
        to.play().then(function () { from.pause(); paint(); }, function () { from.pause(); paint(); });
      } else { from.pause(); }
      paint();
    }
    function toggle() { var a = cur(); if (a.paused) a.play().catch(function () {}); else a.pause(); paint(); }
    function close() {
      audios.forEach(function (a) { a.pause(); a.removeAttribute("src"); a.load(); });
      document.removeEventListener("keydown", key, true);
      clearInterval(tick);
      back.remove();
    }
    function key(e) {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); return close(); }
      if (e.target && box.contains(e.target) && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && e.target !== seek) return;
      if (e.key === " ") { e.preventDefault(); return toggle(); }
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); var a = cur(); a.currentTime = Math.max(0, (a.currentTime || 0) + (e.key === "ArrowRight" ? 5 : -5)); return paint(); }
      if (/^[1-9]$/.test(e.key)) { e.preventDefault(); pick(+e.key - 1); }
    }
    document.addEventListener("keydown", key, true);
    back.addEventListener("mousedown", function (e) { if (e.target === back) close(); });
    box.addEventListener("click", function (e) {
      var row = e.target.closest("[data-cmp-i]"), b = e.target.closest("[data-cmp]");
      if (row) {
        var i = +row.dataset.cmpI;
        if (i === active) return toggle();
        var wasPaused = cur().paused;
        pick(i);
        if (wasPaused) { audios[i].play().catch(function () {}); paint(); }   // a click on a version means: hear it
        return;
      }
      if (b && b.dataset.cmp === "close") return close();
      if (b && b.dataset.cmp === "play") return toggle();
    });
    seek.addEventListener("input", function () { dragging = true; var a = cur(), d = a.duration || versions[active].seconds || 0; box.querySelector(".cmp-time").textContent = clock(d * seek.value / 1000); });
    seek.addEventListener("change", function () { var a = cur(), d = a.duration || versions[active].seconds || 0; if (d) a.currentTime = d * seek.value / 1000; dragging = false; paint(); });
    audios.forEach(function (a, i) { a.addEventListener("ended", function () { if (i === active) paint(); }); });
    var tick = setInterval(paint, 250);
    paint();
    box.setAttribute("tabindex", "-1");                  // the keys are the popup's now, not the field left behind it
    box.focus();
    cur().play().catch(function () {});
  }

  // take: { name, label }
  function setTake(take) {
    if (!$("derivedPanel")) return;
    if (state.take && take && state.take.name === take.name) return;
    state.take = take;
    state.token++;
    clearTimeout(state.watch);
    state.list = [];
    state.running = [];
    say("");
    paint();
    refresh();
  }

  window.HeresyDerived = { init: init, setTake: setTake, files: files, refresh: refresh, remasterSettings: remasterSettings };
})();
