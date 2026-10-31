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
  // HERESY 1484: a step's report (read, not played)
  function isText(f) { return f.kind === "text" || /\.(txt|json|md|csv)$/i.test(f.file || f.path || ""); }
  function isImage(f) { return f.kind === "image" || /\.(png|jpe?g|webp|svg)$/i.test(f.file || f.path || ""); }   // HERESY 1557: a step's picture
  function isMidi(f) { return f.kind === "midi" || /\.midi?$/i.test(f.file || f.path || ""); }   // HERESY 1834: a MIDI set's file: downloaded, not played
  // HERESY 1489: a download signed on the way when Content Credentials are on (app.js holds the switch)
  function signed(url, fmt, take, path) { return window.HeresyC2pa ? window.HeresyC2pa.url(url, fmt, take, path) : url; }
  function fileUrl(name, path) { return "/library/file?name=" + encodeURIComponent(name) + "&path=" + encodeURIComponent(path); }
  var KIND = { stems: "Stems", remaster: "Remaster", upscale: "Upscale", debuzz: "Debuzz", daw: "DAW mix", gate: "Digital Gateway", midi: "Sound to MIDI" };   // HERESY 1471; 1547; 1834
  // HERESY 1834: a MIDI set in a line: its size, its notes, its instruments by how many notes each played
  function midiSummary(m) {
    var size = tt(m.size === "large" ? "Large" : m.size === "medium" ? "Medium" : "Small");
    return [size, tt("{0} notes").replace("{0}", m.notes || 0)].concat((m.instruments || []).slice().sort(function (a, b) { return b.notes - a.notes; }).slice(0, 5)
      .map(function (i) { return String(i.label).replace(/_/g, " ") + " " + i.notes; })).join(" · ");
  }
  // HERESY 1471: a DAW mix in a line: its set, its loudness, the stems it played in another version
  function dawSummary(m) {
    var l = m.loudness || {}, v = m.versions || {}, other = Object.keys(v).filter(function (k) { return !/^derived\/stems-/.test(v[k]); });
    return ["from " + String(m.source || "").replace("derived/", "")].concat(l.integrated_lufs != null ? [l.integrated_lufs + " LUFS, " + l.true_peak_dbtp + " dBTP"] : [])
      .concat(other.length ? [other.join(", ") + " in another version"] : []).concat(m.lowered_db ? ["lowered " + m.lowered_db + " dB"] : []).join(", ");
  }
  function kindName(m) { return m.kind === "plugin" ? (m.label || "Plugin") : KIND[m.kind] || m.kind; }   // HERESY 1460: a plugin's step names itself (1553: the studio's own translated)
  function pluginSummary(m) {
    var p = m.params || {}, from = m.source && m.source !== "the take" ? "from " + String(m.source).replace("derived/", "") : "from the take";
    return [from].concat(Object.keys(p).map(function (k) { return k + " " + (p[k] === true ? "on" : p[k] === false ? "off" : p[k]); })).join(", ");
  }
  var MODE = { vocals: "vocals + instrumental", four: "four stems", six: "six stems", eight: "eight stems" };   // HERESY 1462, 1463
  function title(f) { return f.title || f.name; }   // HERESY 1463: a stem's proper title (Lead Vocal, Backing Vocals…) where the lab gives one
  // HERESY 1169: a set of stems split from a file of the tree (the chain splits the debuzzed or upscaled take) says which
  function fromWhat(src) {
    var dir = String(src || "").replace(/^derived\//, "").split("/")[0];
    var m = /^(debuzz|upscale)-([a-z0-9]+)-\d{8}-(\d\d)(\d\d)/.exec(dir);
    return !m ? dir : (m[1] === "debuzz" ? "debuzzed " + m[2] + " %" : "upscaled, " + m[2]) + " \u00b7 " + m[3] + ":" + m[4];
  }
  function stemsFrom(m) { return m.kind === "stems" && m.source && m.source !== "the take" ? ", from " + fromWhat(m.source) : ""; }

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
        if (isText(f) || isImage(f) || isMidi(f)) return;   // HERESY 1484: a report is no source (1557: nor a picture; 1834: nor MIDI)
        out.push({ name: take.name, source: f.path, url: fileUrl(take.name, f.path), kind: m.kind,
                   step: m.kind === "plugin" ? "plugin:" + m.plugin + ":" + m.step : undefined,   // HERESY 1460
                   label: "↳ " + title(f) + " (" + kindName(m) + (m.mode ? ", " + (MODE[m.mode] || m.mode) : "") + stemsFrom(m) + ")" });
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

  // HERESY 1547: the gateway in a line: its character and drive, what it adds to a −12 dBFS tone, its loudness
  var GATE_CH = { tape: "tape", console: "console", tube: "tube", transformer: "transformer", vinyl: "vinyl" };
  function gateSummary(m) {
    var s = m.settings || {}, r = m.measure || {}, h = r.harmonics || {}, parts = ["from " + String(m.source || "the take").replace("derived/", "")];
    parts.push((GATE_CH[m.character] || m.character) + (m.character === "tape" ? " " + s.speed + " ips" : "") + ", drive " + s.drive_db + " dB" + (s.mix < 1 ? ", " + Math.round(s.mix * 100) + " % in parallel" : ""));
    if (h.h2_db != null) parts.push("2nd " + h.h2_db + " dB, 3rd " + h.h3_db + " dB at −12 dBFS");
    if (r.lufs_out != null) parts.push(r.lufs_out + " LUFS" + (s.level === "came" ? " as it came" : "") + (r.lowered_db ? ", lowered " + r.lowered_db + " dB to −0.3 dBTP" : ""));
    return parts.join(" · ");
  }
  // HERESY 1030: the frame ripple in and out, against the controls
  function debuzzSummary(m) {
    var r = m.measure || {}, b = r.before || {}, a = r.after || {};
    var from = "from " + String(m.source || "the take").replace("derived/", "") + ", " + Math.round((m.strength || 0) * 100) + " %";
    if (!r.found) return from + " · no frame ripple found (" + (b.frame || 0).toFixed(1) + " % at 1920 against " + (b.control || 0).toFixed(1) + " % by chance)";
    return from + " · ripple " + b.frame.toFixed(1) + " % → " + a.frame.toFixed(1) + " % (by chance " + b.control.toFixed(1) + " %)";
  }

  // HERESY 1487 (Viktor 15.10.2026: the tree's players as the compare window's: our own wave, its top half, the lower half on
  // hover): a play button, the wave (the played part lit, a click seeks); the row's own <audio>, hidden, sounds it (1476 hands over)
  function player(url, peaksUrl) {
    return '<span class="dv-player" data-dv-peaks="' + esc(peaksUrl) + '"><button type="button" class="dv-play" aria-label="Play"></button>' +
      '<canvas class="dv-wave" role="slider" aria-label="Position"></canvas><audio preload="none" src="' + esc(url) + '"></audio></span>';
  }
  var PEAKS = {};
  function playIcon(n) { return window.HeresyIcons && window.HeresyIcons.ui ? window.HeresyIcons.ui(n) : (n === "pause" ? "\u275a\u275a" : "\u25b6"); }
  // HERESY 1513 (Viktor 16.10.2026: «в равномерную ширину оформи все волны, чтобы они не бегали вправо-влево»): the buttons' column as wide as
  // the widest set of them, the names' column narrowed by each row's own indent: every wave starts and ends where the others do
  function alignTree(host) {
    if (!host || !host.offsetWidth) return;
    var rows = host.querySelectorAll(".dv-node:not(.is-text)"), acts = 0, hr = host.getBoundingClientRect();
    host.style.removeProperty("--dv-acts");
    Array.prototype.forEach.call(rows, function (r) { var a = r.querySelector(".dv-acts"); if (a) acts = Math.max(acts, a.scrollWidth); });
    host.style.setProperty("--dv-acts", Math.ceil(acts) + "px");
    host.style.setProperty("--dv-name", Math.round(Math.max(220, Math.min(440, hr.width * 0.26))) + "px");
    Array.prototype.forEach.call(rows, function (r) { r.style.setProperty("--dv-off", Math.max(0, Math.round(r.getBoundingClientRect().left - hr.left)) + "px"); });
  }
  window.addEventListener("resize", function () { var h = $("derivedTree"); if (h) alignTree(h); });
  if (window.ResizeObserver) setTimeout(function () { var h = $("derivedTree"); if (h) new ResizeObserver(function () { alignTree(h); }).observe(h); }, 0);
  function initPlayers(host) {
    var io = window.IntersectionObserver ? new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { io.unobserve(e.target); loadPeaks(e.target); } });
    }) : null;
    Array.prototype.forEach.call(host.querySelectorAll(".dv-player"), function (el) {
      var a = el.querySelector("audio"), btn = el.querySelector(".dv-play"), cv = el.querySelector(".dv-wave");
      var draw = function () { drawPlayer(el); };
      var mark = function () {
        btn.innerHTML = playIcon(a.paused ? "play" : "pause");
        btn.setAttribute("aria-label", a.paused ? "Play" : "Pause");
        el.classList.toggle("is-playing", !a.paused);
        draw();
      };
      mark();
      btn.addEventListener("click", function () { if (a.paused) a.play().catch(function () {}); else a.pause(); });
      ["play", "pause", "ended"].forEach(function (k) { a.addEventListener(k, mark); });
      a.addEventListener("timeupdate", draw);
      a.addEventListener("loadedmetadata", draw);
      el.addEventListener("mouseenter", function () { el.classList.add("is-hover"); draw(); });
      el.addEventListener("mouseleave", function () { el.classList.remove("is-hover"); draw(); });
      cv.addEventListener("click", function (ev) {
        var r = cv.getBoundingClientRect(), f = Math.max(0, Math.min(1, (ev.clientX - r.left) / (r.width || 1)));
        var go = function () { if (isFinite(a.duration) && a.duration > 0) { a.currentTime = f * a.duration; draw(); } };
        if (isFinite(a.duration) && a.duration > 0) go(); else { a.preload = "metadata"; a.addEventListener("loadedmetadata", go, { once: true }); a.load(); }
      });
      if (io) io.observe(el); else loadPeaks(el);
    });
  }
  function loadPeaks(el) {
    var u = el.dataset.dvPeaks;
    if (!u) return;
    if (PEAKS[u]) { el._peaks = PEAKS[u].peaks; el._secs = PEAKS[u].seconds; return drawPlayer(el); }
    fetch(u).then(function (r) { return r.ok ? r.json() : null; }).then(function (p) {
      if (!p || !p.peaks || !p.peaks.length) return;
      PEAKS[u] = p; el._peaks = p.peaks; el._secs = p.seconds; drawPlayer(el);
    }).catch(function () { /* no wave: the line stays */ });
  }
  function drawPlayer(el) {
    var cv = el.querySelector(".dv-wave"), a = el.querySelector("audio");
    var w = cv.clientWidth, h = cv.clientHeight, dpr = window.devicePixelRatio || 1;
    if (!w || !h) return;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    var ctx = cv.getContext("2d"), css = getComputedStyle(el), lit = css.getPropertyValue("--amber").trim() || "#d9a441", dim = css.getPropertyValue("--dim").trim() || "#888";
    var d = isFinite(a.duration) && a.duration > 0 ? a.duration : (el._secs || 0), at = d ? Math.min(1, (a.currentTime || 0) / d) : 0;
    var base = h / 2, p = el._peaks;                 // HERESY 1491: the whole wave about its middle, always
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!p) { ctx.fillStyle = dim; ctx.fillRect(0, base - 0.5, w, 1); ctx.fillStyle = lit; ctx.fillRect(0, base - 1, w * at, 2); return; }
    var max = 0, k;
    for (k = 0; k < p.length; k++) if (p[k] > max) max = p[k];
    var amp = (base - 1) / (max || 1), bw = w / p.length;
    for (k = 0; k < p.length; k++) {
      var x = k * bw, v = Math.max(0.5, p[k] * amp);
      ctx.fillStyle = (k + 0.5) / p.length <= at ? lit : dim;
      ctx.fillRect(x, base - v, Math.max(1, bw - 0.5), 2 * v);
    }
  }

  // HERESY 1486 (Viktor 15.10.2026: «"Сделано из этого семпла" хаотично»): the branches in the chain's order, each under the branch
  // its source lies in (derived/<id>/…), deeper by one; siblings keep the lab's order (the newest first); a branch whose source is
  // gone stands at the top
  function chain(list) {
    var ids = {}, kids = {}, out = [], seen = {};
    list.forEach(function (m) { ids[m.id] = true; });
    list.forEach(function (m) {
      var p = /^derived\/([^/]+)/.exec(String(m.source || "")), up = p && ids[p[1]] && p[1] !== m.id ? p[1] : "";
      (kids[up] = kids[up] || []).push(m);
    });
    (function walk(up, depth) {
      (kids[up] || []).forEach(function (m) { if (seen[m.id]) return; seen[m.id] = true; out.push({ m: m, depth: depth }); walk(m.id, depth + 1); });
    })("", 0);
    return out;
  }

  function paint() {
    var host = $("derivedTree"), take = state.take;
    if (!take) { host.innerHTML = '<p class="row-hint">Pick a take on the right.</p>'; return; }
    // HERESY 1138: the take itself is a node of the tree like its branches: it plays, it downloads, and it opens the
    // comparison of every version (the original first)
    var orig = "/library/listen?name=" + encodeURIComponent(take.name);
    var html = '<div class="dv-node dv-root dv-orig"><span class="dv-name"><span translate="no">' + esc(take.label || take.name) + '</span> <em class="dv-orig-tag">the original</em></span>' +
      '<span class="dv-meta mono">' + (take.seconds ? clock(take.seconds) : "") + "</span>" +
      player(orig, "/library/peaks?name=" + encodeURIComponent(take.name)) +   // HERESY 1487
      '<span class="dv-acts"><button type="button" class="btn small primary dv-compare" data-dv-compare="0" data-tip="Every version of this take in one player: switch between them at the same second (1–9, Space)">Compare all</button>' +
      '<button type="button" class="btn ghost small dv-mon" data-dv-mon="' + esc("") + '" aria-pressed="false" data-tip="Play it through Forge\'s monitor (Audio I/O), from where its player stands; again to stop. The browser plays as before">On Forge</button>' +   // HERESY 1548
      '<a class="btn ghost small" href="' + esc(signed("/library/flac?name=" + encodeURIComponent(take.name), "flac", take)) + '" download="' + esc((take.label || take.name) + ".flac") + '">FLAC</a></span></div>';   // HERESY 1489; 1513: its buttons one column
    if (!state.list.length && !state.running.length) html += state.reading ? '<p class="row-hint dv-empty is-reading">Reading what was made from this take…</p>' : state.unread ? '<p class="row-hint dv-empty is-unread">What was made from this take could not be read: the lab\'s answer broke off or did not parse. Open the take again; if it stays, a branch\'s manifest.json is at fault (Engine → Server and log)</p>'   // HERESY 1576: not an empty that lies
      : '<p class="row-hint dv-empty">Nothing made from this take yet.</p>';
    // HERESY 1129: what runs now stands first: the tree grows upward, the newest on top
    state.running.forEach(function (j, i) {
      var failed = j.status === "failed", p = progress(j);
      html += '<div class="dv-group is-running' + (failed ? " is-failed" : "") + '" data-job="' + i + '" data-kind="' + esc(j.kind || "") + '"><div class="dv-group-head"><strong' + (j.kind === "plugin" && !j.builtin ? ' translate="no"' : "") + ">" + esc(kindName(j) || "Job") + "</strong>" +
        (j.mode ? " · " + esc(MODE[j.mode] || j.mode) : "") + '<span class="dv-meta">' + (failed ? "failed: " + esc(j.error || "") : esc(p.say)) + "</span></div>" +
        (failed ? "" : '<div class="job-bar' + (j.status === "queued" ? " is-queued" : "") + '"><i style="width:' + p.pct + '%"></i></div>') + "</div>";
    });
    chain(state.list).forEach(function (c) {             // HERESY 1486: in the chain's order
      var m = c.m;
      html += '<div class="dv-group" data-dv-id="' + esc(m.id || "") + '" data-kind="' + esc(m.kind || "") + '"' +
        (c.depth ? ' data-depth="' + c.depth + '" style="--dv-depth:' + c.depth + '"' : "") + '><div class="dv-group-head"><strong' + (m.kind === "plugin" && !m.builtin ? ' translate="no"' : "") + ">" + esc(kindName(m)) + "</strong>" +
        (m.kind === "plugin" ? '<span translate="no"> · ' + esc(pluginSummary(m)) + "</span>" : "") +
        (m.kind === "plugin" && m.summary ? '<span class="dv-say" translate="no"> · ' + esc(m.summary) + "</span>" : "") +   // HERESY 1484
        (m.mode ? " · " + esc(MODE[m.mode] || m.mode) : "") + esc(stemsFrom(m).replace(", from", " · from")) + (m.kind === "remaster" ? " · " + esc(summary(m)) : "") +
        (m.kind === "debuzz" ? " · " + esc(debuzzSummary(m)) : "") +
        (m.kind === "gate" ? " · " + esc(gateSummary(m)) : "") +   // HERESY 1547
        (m.kind === "midi" ? ' · <span translate="no">' + esc(midiSummary(m)) + "</span>" : "") +   // HERESY 1834
        (m.kind === "daw" ? " · " + esc(dawSummary(m)) : "") +   // HERESY 1471
        (m.kind === "upscale" ? " · from " + esc(String(m.source || "the take").replace("derived/", "")) + ", above " + Math.round((m.cutoff_hz || 0) / 1000) + " kHz" + (m.keep_low ? ", original kept below" : "") : "") +
        '<span class="dv-meta">' + esc((m.models || []).join(" + ")) + " · " + esc(m.created || "") + (m.took ? " · " + Math.round(m.took) + " s" : "") + "</span>" +
        (m.kind === "plugin" && m.plugin === "ruach" && m.step === "match" && m.measure && (m.measure.bands || []).length ?   // HERESY 1558
          '<button type="button" class="btn ghost small" data-dv-eq="' + esc(m.id || "") + '" data-tip="Put the match\'s bands on the DAW\'s master EQ, to hear the match live on the mix in hand">Onto the DAW\'s master</button>' : "") +
        '<button type="button" class="btn ghost small dv-del" data-dv-del="' + esc(m.id || "") + '" data-tip="Into this take\'s trash, from where it comes back">Delete</button></div>';   // HERESY 1527
      (m.files || []).forEach(function (f) {
        var url = fileUrl(take.name, f.path);
        var nm = m.builtin ? '<span class="dv-name">↳ <span>' + esc(title(f)) + "</span></span>" : '<span class="dv-name" translate="no">↳ ' + esc(title(f)) + "</span>";   // HERESY 1557: the studio's own in the page's words
        if (isImage(f)) {                               // HERESY 1557: a step's picture, looked at here, or its file
          html += '<div class="dv-node is-image">' + nm + '<a class="dv-pic" href="' + esc(url) + '" target="_blank" rel="noopener"><img src="' + esc(url) + '" alt="" loading="lazy" /></a>' +
            '<a class="btn ghost small" translate="no" href="' + esc(url) + '" download="' + esc((take.label || take.name) + " - " + (f.file || title(f))) + '">' +
            esc(String(f.file || f.path).split(".").pop().toUpperCase()) + "</a></div>";
          return;
        }
        if (isMidi(f)) {                                // HERESY 1834: a MIDI file: downloaded (a DAW, the roll), not played here
          html += '<div class="dv-node is-midi">' + nm + '<a class="btn ghost small" translate="no" href="' + esc(url) + '" download="' + esc((take.label || take.name) + " · " + (m.size || "midi") + ".mid") + '">MIDI</a></div>';
          return;
        }
        if (isText(f)) {                                // HERESY 1484: a report: read here, or its file
          html += '<div class="dv-node is-text">' + nm +
            '<button type="button" class="btn ghost small" data-dv-read="' + esc(f.path) + '" data-dv-read-title="' + esc(title(f)) + '">Read</button>' +
            '<a class="btn ghost small" translate="no" href="' + esc(url) + '" download="' + esc((take.label || take.name) + " - " + (f.file || title(f))) + '">' +
            esc(String(f.file || f.path).split(".").pop().toUpperCase()) + "</a></div>";
          return;
        }
        html += '<div class="dv-node">' + nm + '<span class="dv-meta mono">' + (f.seconds ? clock(f.seconds) : "") + "</span>" +
          player(url, "/lab/peaks?name=" + encodeURIComponent(take.name) + "&path=" + encodeURIComponent(f.path) + "&n=400") +   // HERESY 1487
          '<span class="dv-acts"><button type="button" class="btn ghost small" data-dv-compare-path="' + esc(f.path) + '" data-tip="Compare it with the original and every other version, at the same second">Compare</button>' +
          '<button type="button" class="btn ghost small" data-dv-spectrum="' + esc(f.path) + '" data-tip="Lay this file over the take in the spectrum">Spectrum</button>' +
          (window.HeresyPost && window.HeresyPost.has && window.HeresyPost.has("pl-ruach-reportPanel") ?   // HERESY 1557
            '<button type="button" class="btn ghost small" data-dv-report="' + esc(f.path) + '" data-tip="Measure this file against what it was made from: loudness, true peak, range, width, bands, the spectra at equal loudness; a page and a picture in the tree">Before / after</button>' : "") +
          '<button type="button" class="btn ghost small dv-mon" data-dv-mon="' + esc(f.path) + '" aria-pressed="false" data-tip="Play it through Forge\'s monitor (Audio I/O), from where its player stands; again to stop. The browser plays as before">On Forge</button>' +   // HERESY 1548
          (/vocal/i.test(f.name) ? '<button type="button" class="btn ghost small" data-dv-gloss="' + esc(f.path) + '" data-tip="Whisper on this file against the lyrics">Lyrics check</button>' : "") +
          '<a class="btn ghost small" href="' + esc(signed(url, String(f.file || f.path).split(".").pop().toLowerCase(), take, f.path)) + '" download="' + esc((take.label || take.name) + " - " + title(f) + ".flac") + '">FLAC</a></span></div>';   // HERESY 1489; 1513
      });
      html += "</div>";
    });
    var bin = state.trash || [];                        // HERESY 1527: the take's trash, under its tree
    if (bin.length) {
      html += '<div class="dv-trash"><button type="button" class="btn ghost small" data-dv-trash="1" aria-expanded="' + !!state.trashOpen + '">' + esc(tt("Trash ({0})").replace("{0}", bin.length)) + "</button>" +
        (state.trashOpen ? bin.map(function (x) {
          var m = x.manifest || {};
          return '<div class="dv-trash-row"><span class="dv-name"><strong' + (m.kind === "plugin" && !m.builtin ? ' translate="no"' : "") + ">" + esc(kindName(m)) + "</strong>" + (m.mode ? " · " + esc(MODE[m.mode] || m.mode) : "") +
            '</span><span class="dv-meta">' + esc(m.created || "") + (x.with ? " · " + esc(tt("deleted with {0}").replace("{0}", x.with)) : "") + "</span>" +
            '<button type="button" class="btn ghost small" data-dv-back="' + esc(x.trash_id) + '">Bring back</button></div>';
        }).join("") + '<button type="button" class="btn ghost small danger dv-empty" data-dv-empty="1">Empty the trash</button>' : "") + "</div>";
    }
    host.innerHTML = html;
    alignTree(host);                                    // HERESY 1513: every wave from one x to one x
    initPlayers(host);                                  // HERESY 1487
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
  var RATE = { debuzz: 0.18, remaster: 0.12, upscale: 1.8, stems: 0.7, daw: 0.05, gate: 0.12 };   // 1547: 36–50 s for 6:37 at 4×   // HERESY 1471: 18 s for 6:37 of eight stems
  function progress(j) {
    var el = Math.max(0, Math.round(Date.now() / 1000 - (j.started || Date.now() / 1000)));
    if (j.kind === "midi" && j.status === "running" && j.progress != null)   // HERESY 1834: the program says how far: the real bar
      return { pct: Math.max(3, Math.round(j.progress * 100)), say: tt("{0} % · {1} notes").replace("{0}", Math.round(j.progress * 100)).replace("{1}", j.notes || 0) };
    var len = state.take && state.take.seconds || 0, rate = RATE[j.kind] * (j.kind === "stems" && j.mode === "four" ? 1.8 : j.kind === "stems" && j.mode === "six" ? 1.1 : j.kind === "stems" && j.mode === "eight" ? 2.1 : 1);   // 1462: six measured 0.75 s a second
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
  var PANEL = { stems: "derivedPanel", remaster: "remasterPanel", upscale: "upscalePanel", debuzz: "debuzzPanel", gate: "gatePanel", midi: "midiPanel" };   // 1547; 1834
  var STEP_KIND = { derivedPanel: "stems", remasterPanel: "remaster", upscalePanel: "upscale", debuzzPanel: "debuzz", dawPanel: "daw", gatePanel: "gate", midiPanel: "midi" };   // 1471; 1547; 1834
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
    var what = m.kind === "stems" ? (MODE[m.mode] || m.mode || "stems") + stemsFrom(m)
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

  // HERESY 1504: the marks on the files made from each take, as the lab keeps them ({take: {path: {rating, fav}}})
  var MARKS = {};
  function markOf(m) { return (MARKS[m.take] || {})[m.path] || {}; }
  function putMark(m, change) {
    var was = markOf(m), now = Object.assign({}, was, change);
    if (!now.rating) delete now.rating;
    if (!now.fav) delete now.fav;
    MARKS[m.take] = Object.assign({}, MARKS[m.take] || {});
    if (now.rating || now.fav) MARKS[m.take][m.path] = now; else delete MARKS[m.take][m.path];
    return fetch("/lab/derived/mark", { method: "POST", headers: { "Content-Type": "application/json" },
                                         body: JSON.stringify(Object.assign({ name: m.take, path: m.path }, change)) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || r.status); return j; }); })
      .then(function (j) { MARKS[m.take] = j.marks || {}; }, function (e) {
        MARKS[m.take] = Object.assign({}, MARKS[m.take] || {});
        if (was.rating || was.fav) MARKS[m.take][m.path] = was; else delete MARKS[m.take][m.path];
        (state.hooks.toast || say)("The mark was not kept: " + (e && e.message || e), true);   // said, never kept only on the page
      });
  }

  function tt(x) { return window.RuachI18n && window.RuachI18n.t ? window.RuachI18n.t(x) : x; }   // HERESY 1527
  function refresh() {
    if (!state.take) { paint(); return Promise.resolve(); }
    var token = state.token, name = state.take.name;
    return fetch("/lab/derived?name=" + encodeURIComponent(name), { priority: "low" }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (token !== state.token) return;
        state.reading = false;                        // HERESY 1906
        if (!d) { state.unread = true; if (!state.list.length) paint(); return; }   // HERESY 1576
        state.unread = false;
        state.list = d.derived || [];
        MARKS[name] = d.marks || {};                    // HERESY 1504
        state.running = d.running || [];
        state.trash = d.trash || [];                    // HERESY 1527
        paint();
        paintSources();
        paintUpSources();
        paintDbSources();
        paintStSources();
        paintMdSources();                               // HERESY 1834
        // while Forge works on this take, look again every three seconds
        clearTimeout(state.watch);
        if (state.running.some(function (j) { return j.status !== "failed"; })) state.watch = setTimeout(refresh, 3000);
      }).catch(function () {
        if (token === state.token) { state.reading = false; state.unread = true; if (!state.list.length) paint(); }   // HERESY 1576: an answer that did not parse is said, not shown as nothing
        // a dropped answer on a slow line: keep watching while something was running
        if (token === state.token && state.running.some(function (j) { return j.status !== "failed"; })) {
          clearTimeout(state.watch);
          state.watch = setTimeout(refresh, 5000);
        }
      });
  }

  // HERESY 1169: the stems from the take or from a debuzzed or upscaled file of it (the chain splits them so)
  function paintStSources() {
    var sel = $("stSource");
    if (!sel) return;
    var keep = sel.value;
    sel.innerHTML = '<option value="">the take</option>' + files().filter(function (f) { return f.kind === "debuzz" || f.kind === "upscale"; }).map(function (f) {
      return '<option value="' + esc(f.source) + '">' + esc(f.label.replace(/^↳ /, "")) + "</option>";
    }).join("");
    sel.value = Array.prototype.some.call(sel.options, function (o) { return o.value === keep; }) ? keep : "";
  }
  function split(mode) {
    if (!state.take) return;
    var token = state.token, name = state.take.name, started = Date.now(), src = $("stSource") ? $("stSource").value : "";
    var ticker = setInterval(function () { say("Forge is splitting (" + MODE[mode] + ")… " + Math.round((Date.now() - started) / 1000) + "s"); }, 1000);
    all(true);
    function ask() {
      return fetch("/lab/stems?name=" + encodeURIComponent(name) + "&mode=" + mode + (src ? "&source=" + encodeURIComponent(src) : "")).then(function (r) {
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
      return '<option value="derived/' + esc(m.id) + '">stems: ' + esc((MODE[m.mode] || m.mode) + stemsFrom(m)) + "</option>";
    }).join("") + single.map(function (f) {
      return '<option value="' + esc(f.source) + '">' + esc(f.label.replace(/^↳ /, "")) + "</option>";
    }).join("");
    sel.value = Array.prototype.some.call(sel.options, function (o) { return o.value === keep; }) ? keep : "";
    paintLevels();
  }
  // HERESY 1148: the preset and the de-esser act on stems before the Debunker mixes them; on a single file (the take, a
  // debuzzed file) it goes straight on and they would do nothing, so they are off there, and the tip says why. HERESY 1169:
  // the chain's Stems splits a set before its remaster, so while it is on they are live for the chain as well
  function stemsPicked() {
    var src = $("rmSource") ? $("rmSource").value : "";
    return state.list.some(function (x) { return x.kind === "stems" && "derived/" + x.id === src; });
  }
  function paintRmLocks() {
    var on = stemsPicked() || !!($("pcStems") && $("pcStems").checked);
    ["rmPreset", "rmDeess", "rmDeessMode"].forEach(function (id) { if ($(id)) $(id).disabled = !on; });
  }
  function paintLevels() {
    var src = $("rmSource").value, box = $("rmLevels");
    var m = state.list.filter(function (x) { return "derived/" + x.id === src; })[0];
    box.classList.toggle("is-hidden", !m);
    paintRmLocks();
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

  // ---- HERESY 1834: sound to MIDI (MuScriptor): the take or any file of the tree, at a size the lab has (the suggested first)
  function paintMdSources() {
    var sel = $("mdSource");
    if (!sel) return;
    var keep = sel.value;
    sel.innerHTML = '<option value="">the take</option>' + files().map(function (f) {
      return '<option value="' + esc(f.source) + '">' + esc(f.label.replace(/^↳ /, "")) + "</option>";
    }).join("");
    sel.value = Array.prototype.some.call(sel.options, function (o) { return o.value === keep; }) ? keep : "";
  }
  function paintMdSizes() {
    var sel = $("mdSize");
    if (!sel) return Promise.resolve();
    return fetch("/lab/midi/status").then(function (r) { return r.json(); }).then(function (st) {
      var keep = sel.value, here = st.here || [];
      sel.innerHTML = here.map(function (s) {
        return '<option value="' + s + '">' + esc(tt(s === "large" ? "Large" : s === "medium" ? "Medium" : "Small")) + (s === st.suggest ? " · " + esc(tt("suggested")) : "") + "</option>";
      }).join("");
      sel.value = here.indexOf(keep) >= 0 ? keep : here.indexOf(st.suggest) >= 0 ? st.suggest : (here[0] || "");
      $("mdRun").disabled = !st.built || !here.length;
      $("mdState").textContent = !st.built ? tt("The transcriber is not built: ./build.sh builds it") :
        !here.length ? tt("No MuScriptor model here: Engine → Models and LoRAs → Sound to MIDI fetches one") : "";
    }).catch(function () { /* the lab answers later: asked again when the step opens */ });
  }
  function midi() {
    if (!state.take) return;
    var q = "name=" + encodeURIComponent(state.take.name) + "&size=" + encodeURIComponent($("mdSize").value || "") +
      ($("mdSource").value ? "&source=" + encodeURIComponent($("mdSource").value) : "");
    $("mdRun").disabled = true;
    $("mdState").textContent = "sending to Forge…";
    fetch("/lab/midi?" + q).then(function (r) { return r.json().then(function (b) { if (!r.ok && r.status !== 202) throw new Error(b.error || r.status); return b; }); })
      .then(function () { $("mdState").textContent = "running on Forge: the bar above says how far; it lands in the tree"; refresh(); })
      .catch(function (e) { $("mdState").textContent = "Could not: " + (e.message || e); })
      .then(function () { $("mdRun").disabled = false; });
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
              deess: $("rmDeess").checked && stemsPicked(), deess_mode: $("rmDeessMode").value, hz432: $("rm432").checked,
              loudnorm: $("rmLoud").checked, lufs: parseFloat($("rmLufs").value) || -14, tp: parseFloat($("rmTp").value) || -1,
              colour: $("rmColour") ? $("rmColour").value : "", colour_db: $("rmColourDb") ? (parseFloat($("rmColourDb").value) || -36) : -36,   // HERESY 1425
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
    if ($("mdRun")) {                                   // HERESY 1834
      $("mdRun").addEventListener("click", midi);
      $("midiPanel").addEventListener("toggle", function () { if (this.open) paintMdSizes(); });
      paintMdSizes();
    }
    if ($("dbRun")) $("dbRun").addEventListener("click", debuzz);   // HERESY 1030
    if ($("rmRun")) {
      $("rmRun").addEventListener("click", remaster);
      $("rmSource").addEventListener("change", paintLevels);
      paintLevels();                                      // HERESY 1148: the take is the source until stems exist
      document.addEventListener("change", function (event) { if (event.target && event.target.id === "pcStems") paintRmLocks(); });
    }
    Array.prototype.forEach.call(document.querySelectorAll("[data-dv-split]"), function (b) {
      b.addEventListener("click", function () { split(b.dataset.dvSplit); });
    });
    // HERESY 1527 (Viktor 17.10.2026: «удаление ненужного артефакта, чтобы не плодить мусорку в пайплайне»): a branch into the take's
    // trash, asked; one others were made from asks again, naming them, and goes with them; the trash: Bring back, Empty (asked, for good)
    function trashCall(path, body) {
      return fetch("/lab/derived/" + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.assign({ name: state.take.name }, body)) })
        .then(function (r) { return r.json().then(function (j) { if (!r.ok) { var e = new Error(j.error || r.status); e.children = j.children; throw e; } return j; }); });
    }
    function named(id) { var m = state.list.filter(function (x) { return x.id === id; })[0]; return m ? kindName(m) + (m.mode ? " · " + (MODE[m.mode] || m.mode) : "") + " · " + (m.created || "") : id; }
    function delBranch(id, withKids) {
      if (!state.take) return;
      var ask = window.HeresyDialog;
      (withKids ? Promise.resolve(true) : ask.confirm(tt("Delete the branch «{0}»?").replace("{0}", named(id)) + "\n\n" + tt("It goes into this take's trash, from where it comes back."),
        { ok: tt("Delete"), cancel: tt("Cancel"), danger: true })).then(function (yes) {
        if (yes !== true) return;
        trashCall("delete", { id: id, with_children: !!withKids }).then(function (d) {
          say(tt("Into the trash: {0}").replace("{0}", (d.moved || []).length));
          return refresh();
        }, function (e) {
          if (!e.children) { say(e.message, true); return; }
          ask.confirm(tt("Branches were made from «{0}»: {1}.").replace("{0}", named(id)).replace("{1}", e.children.map(named).join("; ")) + "\n\n" +
            tt("They go into the trash with it, and come back from it each on its own."), { ok: tt("Delete them too"), cancel: tt("Cancel"), danger: true })
            .then(function (yes) { if (yes === true) delBranch(id, true); });
        });
      });
    }
    $("derivedTree").addEventListener("click", function (event) {
      var del = event.target.closest("[data-dv-del]"), tg = event.target.closest("[data-dv-trash]"), back = event.target.closest("[data-dv-back]"), em = event.target.closest("[data-dv-empty]");
      if (del) { delBranch(del.dataset.dvDel, false); return; }
      if (tg) { state.trashOpen = !state.trashOpen; paint(); return; }
      if (back) { trashCall("restore", { id: back.dataset.dvBack }).then(function () { say(tt("Back on the tree")); return refresh(); }, function (e) { say(e.message, true); }); return; }
      if (em) {
        window.HeresyDialog.confirm(tt("Empty this take's trash?") + "\n\n" + tt("Branches gone for good: {0}. This cannot be undone.").replace("{0}", (state.trash || []).length),
          { ok: tt("Empty the trash"), cancel: tt("Cancel"), danger: true }).then(function (yes) {
          if (yes !== true) return;
          trashCall("empty", {}).then(function (d) { state.trashOpen = false; say(tt("The take's trash emptied: {0}").replace("{0}", d.emptied || 0)); return refresh(); }, function (e) { say(e.message, true); });
        });
      }
    });
    // HERESY 1484: a report read in the studio's dialog
    $("derivedTree").addEventListener("click", function (event) {
      var rd = event.target.closest("[data-dv-read]");
      if (!rd || !state.take) return;
      var head = rd.dataset.dvReadTitle || "";
      fetch(fileUrl(state.take.name, rd.dataset.dvRead)).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); })
        .then(function (text) { return window.HeresyDialog.alert(head + "\n\n" + text.trim(), { ok: "Close" }); })
        .catch(function (e) { say(head + ": " + e.message, true); });
    });
    // HERESY 1557: Before / after on a file of the tree; 1558: a match's bands onto the DAW's master EQ
    $("derivedTree").addEventListener("click", function (event) {
      var rp = event.target.closest("[data-dv-report]"), eq = event.target.closest("[data-dv-eq]");
      if (rp && state.take) {
        rp.disabled = true;
        fetch("/lab/plugin/run", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: state.take.name, source: rp.dataset.dvReport, plugin: "ruach", step: "report", params: {} }) })
          .then(function (r) { return r.json().then(function (b) { if (!r.ok) throw new Error(b.error || r.status); return b; }); })
          .then(function () { say(tt("Started: {0}").replace("{0}", tt("Before and after"))); return refresh(); }, function (e) { rp.disabled = false; say(e.message, true); });
      }
      if (eq && state.take) {
        var m = state.list.filter(function (x) { return x.id === eq.dataset.dvEq; })[0], M = window.HeresyMixer, st = M && M.state ? M.state() : null;
        if (!m || !st || st.take !== state.take.name || !st.strips.length) { say(tt("Open this take's set in the DAW first"), true); return; }
        if (M.k.mark) M.k.mark();                      // one step of the DAW's undo: the master's own EQ comes back
        M.k.set("*", "eq", { on: true, bands: m.measure.bands.map(function (b) { return Object.assign({}, b); }) });
        say(tt("The match's bands are on the DAW's master EQ"));
      }
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
    var GROUP = { debuzz: "Debuzz", remaster: "Remaster", upscale: "Upscale", stems: "Stems", daw: "DAW mix", gate: "Digital Gateway", plugin: "" };   // 1547   // 1504: the DAW's mixes
    var versions = [{ label: "The original", group: "", url: "/library/listen?name=" + encodeURIComponent(take.name), path: "", seconds: take.seconds, take: take.name }];
    // HERESY 1311: the take's family (the same music in other takes), the disliked left out, after the original
    (state.hooks.family ? state.hooks.family(take.name) : []).forEach(function (t) {
      versions.push({ label: t.label || t.name, group: t.group || "The same music", url: t.url, path: "take:" + t.name, seconds: t.seconds, take: t.name });
    });
    ["debuzz", "remaster", "upscale", "stems", "daw", "gate", "plugin"].forEach(function (kind) {   // HERESY 1460: a plugin's too; 1504: the DAW's; 1547: the gateway's
      state.list.filter(function (m) { return m.kind === kind; }).forEach(function (m) {
        (m.files || []).forEach(function (f) {
          if (isText(f) || isImage(f)) return;          // HERESY 1484: a report is no version (1557: nor a picture)
          versions.push({ label: title(f), group: (kind === "plugin" ? kindName(m) : GROUP[kind]) + (m.mode ? " · " + (MODE[m.mode] || m.mode) : "") + (m.created ? " · " + String(m.created).slice(11, 16) : ""),
                          url: fileUrl(take.name, f.path), path: f.path, seconds: f.seconds, mark: { take: take.name, path: f.path } });   // 1504
        });
      });
    });
    var active = Math.max(0, versions.findIndex(function (v) { return v.path === startPath; }));
    openCompare(take.label || take.name, versions, active);
  }
  // HERESY 1415: the same player for any takes (a take's namesakes, the Librarian's checked ones): versions [{label, group, url, path, seconds, take}]
  // HERESY 1425 (Viktor 13.10.2026: «Попап сравнения можешь сделать на 1200px ширины и с wavesurfer wave? Стяжка ширины при утирании в ширину
  // заскейленного экрана»; «добавь лайк, дизлайк и заезду. Галочку "скрыть дизлайк" как в Суно»): 1200 px wide, narrower with the window; the
  // playing version's wave (the server's peaks of a take, a file's own read in the page) is the seek bar, played part lit; each take its
  // thumbs and star (the Librarian's own), the disliked hidden when so ticked (kept for the next time); a version disliked while it plays
  // gives way to the next one shown, from the same second
  var CMP_HIDE = "yue2.cmpHideDisliked";
  function cmpHide() { return true; }                 // HERESY 1724 («Сделай умолчанием "Скрыть 👎"»): on whenever the window opens
  function cmpEqual(on) {                             // HERESY 1550: «Equal loudness», on unless turned off, remembered
    try { if (on != null) localStorage.setItem("yue2.cmpEqual", on ? "1" : "0"); return localStorage.getItem("yue2.cmpEqual") !== "0"; } catch (e) { return on != null ? !!on : true; }
  }
  function cmpPeaks(v) {
    var decode = function () {
      var Off = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      if (!Off) return null;
      return fetch(v.url).then(function (r) { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
        .then(function (buf) { return new Off(1, 1, 44100).decodeAudioData(buf); })
        .then(function (au) {
          var ch = au.getChannelData(0), n = 900, step = Math.max(1, Math.floor(ch.length / n)), out = [];
          for (var k = 0; k < n; k++) {
            var m = 0;
            for (var j = k * step, e = Math.min(ch.length, j + step); j < e; j += 4) { var x = Math.abs(ch[j]); if (x > m) m = x; }
            out.push(m);
          }
          return out;
        });
    };
    if (!v.take) return Promise.resolve().then(decode);
    return fetch("/library/peaks?name=" + encodeURIComponent(v.take)).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (p) { return p && p.peaks && p.peaks.length ? p.peaks : decode(); }, decode);
  }
  function openCompare(title, versions, active) {
    if (!versions || !versions.length) return;
    var hk = state.hooks || {};
    if (hk.pauseMain) hk.pauseMain();
    active = Math.max(0, Math.min(versions.length - 1, active || 0));
    var audios = versions.map(function (v) { var a = new Audio(); a.preload = "metadata"; a.src = v.url; a.dataset.oneSound = "compare"; return a; });   // HERESY 1476: they hand over among themselves
    // HERESY 1871: a take's Opus the lab cannot make: its FLAC, as the footer's player does
    audios.forEach(function (a, i) {
      a.addEventListener("error", function () {
        var v = versions[i];
        if (!v.flac || v.url === v.flac || a.dataset.cached === "1") return;
        var t = a.currentTime || 0, was = !a.paused;
        v.url = v.flac; a.src = v.flac;
        if (t) a.addEventListener("loadedmetadata", function () { try { a.currentTime = t; } catch (e) { /* not seekable yet */ } }, { once: true });
        if (was) a.play().catch(function () {});
      });
    });
    // HERESY 1504: a take rated through the Librarian's hooks, a file made from one through the lab's marks
    var byTake = !!(hk.rating && hk.rate);
    var rated = (byTake && versions.some(function (v) { return v.take; })) || versions.some(function (v) { return v.mark; });
    var rateable = function (v) { return (byTake && v.take) || v.mark; };
    var rOf = function (v) { return v.take ? (byTake ? hk.rating(v.take) || 0 : 0) : v.mark ? markOf(v.mark).rating || 0 : 0; };
    var favAsked = {};                                   // HERESY 1724: a star as asked, painted at once while the lab answers
    var fOf = function (v) { var k = v.take || v.mark; if (k && k in favAsked) return favAsked[k]; return v.take ? !!(hk.favorite && hk.favorite(v.take)) : v.mark ? !!markOf(v.mark).fav : false; };
    var setFav = function (v, on) {
      var k = v.take || v.mark; favAsked[k] = !!on;
      var p = v.take ? (hk.setFavorite ? hk.setFavorite(v.take, !!on) : (fOf(v) !== !!on && hk.toggleFavorite ? hk.toggleFavorite(v.take) : null)) : putMark(v.mark, { fav: !!on });
      var done = function () { delete favAsked[k]; paintRates(); };
      if (p && p.then) p.then(done, done); else done();
      return p;
    };
    var noteOf = function (v) { return v.take && hk.note ? hk.note(v.take) || "" : ""; };
    var hideDis = rated && cmpHide();
    var ico = function (n) { return window.HeresyIcons && window.HeresyIcons.ui ? window.HeresyIcons.ui(n) : (n === "pause" ? "❚❚" : "▶"); };
    var rateHtml = function (v) {
      if (!rated || !rateable(v)) return "";
      return '<span class="cmp-rate"><button type="button" class="coll-act" data-cmp-rate="1" aria-label="Like">' + ico("like") + "</button>" +
        (v.take && window.HeresyCollection && window.HeresyCollection.markBtns ? window.HeresyCollection.markBtns(v.take) : "") +   // HERESY 1871: 🔥 💎 after 👍, as on the cards
        '<button type="button" class="coll-act" data-cmp-rate="-1" aria-label="Dislike">' + ico("dislike") + "</button>" +
        (v.mark || hk.favorite ? '<button type="button" class="coll-act fav" data-cmp-fav="1" aria-label="Favourite">' + ico("star") + "</button>" : "") +
        (v.take && hk.sheet ? '<button type="button" class="coll-act cmp-sheet-btn" data-cmp-sheet="1" aria-pressed="false" aria-label="Style and lyrics" data-tip="Its style and lyrics in a sheet beside the window">' + ico("sheet-portrait") + "</button>" : "") +   // HERESY 1872
        (v.take && hk.note && hk.setNote ? '<button type="button" class="coll-act cmp-note" data-cmp-note="1" aria-label="Note" data-tip="A note on this take">' + ico("note") + "</button>" : "") + "</span>";   // HERESY 1724
    };
    var back = document.createElement("div");
    back.className = "cmp-back";
    back.innerHTML = '<div class="cmp-box" role="dialog" aria-modal="true" aria-label="Compare the versions">' +
      '<div class="cmp-head"><div><div class="cmp-title">Compare · ' + esc(title) + '</div>' +
      '<div class="row-hint">' + versions.length + " versions · a click (or its number) plays it from the same second · Space plays and pauses · ← → five seconds</div></div>" +
      '<button type="button" class="btn ghost small" data-cmp="close">Close</button></div>' +
      '<canvas class="cmp-wave" role="slider" aria-label="Position" tabindex="-1"></canvas>' +
      '<div class="cmp-transport"><button type="button" class="cmp-play" data-cmp="play" aria-label="Play"></button>' +
      '<span class="cmp-time mono">0:00 / 0:00</span>' +   // HERESY 1724: now / length, one place
      '<label class="cmp-hide cmp-eq" data-tip="Each version turned down to the quietest one\'s loudness (BS.1770, measured on Forge), so the ear hears the sound and not the level"><input type="checkbox" data-cmp-eq="1"' + (cmpEqual() ? " checked" : "") + "> Equal loudness</label>" +   // HERESY 1550; 1724: right after the time
      '<span class="cmp-fill"></span>' +
      (rated ? '<label class="cmp-hide"><input type="checkbox" data-cmp-hide="1"' + (hideDis ? " checked" : "") + "> Hide disliked</label>" : "") +
      '<span class="cmp-load" aria-hidden="true"><i></i></span>' +   // HERESY 1716: the bytes in, while they come
      '<span class="cmp-cache row-hint mono" data-tip="Each version fetched whole into memory as the window opens: a switch plays from memory, not the network"></span>' +   // HERESY 1621
      "</div>" +
      '<ol class="cmp-list">' + versions.map(function (v, i) {
        return '<li class="cmp-li" data-cmp-li="' + i + '"><button type="button" class="cmp-row" data-cmp-i="' + i + '"><span class="cmp-n mono">' + (i < 9 ? i + 1 : "") + '</span><span class="cmp-name">' + esc(v.label) + "</span>" +
          '<span class="cmp-group">' + esc(v.group || "as YuE2 made it") + '</span><span class="cmp-lufs mono" data-cmp-lufs="' + i + '">\u2026</span><span class="cmp-dur mono">' + (v.seconds ? clock(v.seconds) : "") + "</span></button>" + rateHtml(v) + "</li>";   // 1550
      }).join("") + "</ol></div>";
    document.body.appendChild(back);
    var box = back.querySelector(".cmp-box"), wave = box.querySelector(".cmp-wave"), playBtn = box.querySelector(".cmp-play"), dragging = false;
    // HERESY 1550: each version's loudness, and the louder ones turned down to the quietest while «Equal loudness» is on
    var lufs = versions.map(function () { return null; });
    function levels() {
      var on = cmpEqual(), known = lufs.filter(function (x) { return x != null; }), lo = known.length ? Math.min.apply(null, known) : null;
      audios.forEach(function (a, i) {
        var l = lufs[i], g = on && l != null && lo != null ? Math.pow(10, (lo - l) / 20) : 1, el = box.querySelector('[data-cmp-lufs="' + i + '"]');
        a.volume = Math.max(0, Math.min(1, g));
        if (el) el.textContent = l == null ? (el.textContent === "\u2014" ? "\u2014" : "\u2026") : String(l.toFixed(1)).replace("-", "\u2212") + " LUFS" + (on && g < 0.994 ? " \u00b7 " + String((20 * Math.log10(g)).toFixed(1)).replace("-", "\u2212") + " dB" : "");
      });
    }
    versions.forEach(function (v, i) {
      var nm = v.take || (state.take && state.take.name) || "", p = v.take ? "" : v.path || "";
      if (!nm) return;
      fetch("/lab/loudness?name=" + encodeURIComponent(nm) + (p ? "&path=" + encodeURIComponent(p) : ""), { priority: "low" })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { lufs[i] = j && j.lufs != null ? j.lufs : null; if (lufs[i] == null) { var el = box.querySelector('[data-cmp-lufs="' + i + '"]'); if (el) el.textContent = "\u2014"; } levels(); }, function () { /* no lab: as they are */ });
    });
    box.addEventListener("change", function (e) { if (e.target.closest && e.target.closest("[data-cmp-eq]")) { cmpEqual(e.target.checked); levels(); } });
    var peaks = [];
    function cur() { return audios[active]; }
    function dur() { var a = cur(); return isFinite(a.duration) && a.duration > 0 ? a.duration : (versions[active].seconds || 0); }
    function shown(i) { return !(hideDis && rateable(versions[i]) && rOf(versions[i]) < 0); }   // 1504: a disliked branch too
    // HERESY 1421 (Viktor 13.10.2026: «кликание обратно со второго трека на первый останавливает воспроизведение»): a version's play
    // resolves when it has loaded, and the old callback paused the one it had been switched from, which by then could be the
    // chosen one again; now whatever resolves last, every version but the chosen one is paused. And the second the switch
    // goes from is the last one known, not the 0:00 of a version whose length has not loaded yet
    var lastT = 0;
    function settle() { audios.forEach(function (a, i) { if (a !== cur()) { a.pause(); useCached(i); } }); paint(); }
    // HERESY 1621: every version whole in memory, the chosen one first; a version takes its copy unless it is the one playing
    var cached = versions.map(function () { return null; });
    function useCached(i) {
      var a = audios[i], u = cached[i];
      if (!u || a.dataset.cached === "1" || (a === cur() && !a.paused)) return;
      var t = a.currentTime || 0;
      a.src = u; a.dataset.cached = "1";
      if (t) a.addEventListener("loadedmetadata", function () { try { a.currentTime = t; } catch (e) { /* not seekable yet */ } }, { once: true });
      paintCached();
    }
    function paintCached() {
      var n = audios.filter(function (a) { return a.dataset.cached === "1"; }).length, el = box.querySelector(".cmp-cache");
      var mb = function (x) { return (x / 1048576).toFixed(x < 10485760 ? 1 : 0); }, have = (typeof got !== "undefined" ? got : []).reduce(function (s, x) { return s + x; }, 0),
          tot = (typeof size !== "undefined" ? size : []).reduce(function (s, x) { return s + x; }, 0);   // HERESY 1716: the megabytes in
      if (el) el.textContent = (n === audios.length ? tt("all {0} in memory").replace("{0}", n) : tt("in memory: {0} of {1}").replace("{0}", n).replace("{1}", audios.length)) +
        (n < audios.length && have ? " \u00b7 " + (tot ? tt("{0} of {1} MB").replace("{0}", mb(have)).replace("{1}", mb(tot)) : tt("{0} MB").replace("{0}", mb(have))) : "");
    }
    audios.forEach(function (a, i) { a.addEventListener("pause", function () { if (a === cur()) useCached(i); }); });
    // HERESY 1716 (Viktor 22.10.2026: «Форсированную загрузку треков для сравнения, кеширование и прогресс бар, пока не загрузится, чтобы переключение
    // было моментальным»): every version fetched whole as the window opens, three at a time, the chosen one first, each read as it comes so a bar shows
    // the bytes and the line says the megabytes; a version streams as before only until its copy is in
    var got = versions.map(function () { return 0; }), size = versions.map(function () { return 0; });
    function paintLoad() {
      var el = box.querySelector(".cmp-load"), n = cached.filter(Boolean).length;
      if (!el) return;
      var tot = size.reduce(function (s, x) { return s + x; }, 0), have = got.reduce(function (s, x) { return s + x; }, 0), known = size.every(function (x, i) { return x > 0 || cached[i]; });
      el.hidden = n === versions.length;
      el.firstChild.style.width = Math.min(100, known && tot ? have / tot * 100 : n / versions.length * 100) + "%";
    }
    function fetchWhole(i) {
      return fetch(versions[i].url).then(function (r) {
        if (!r.ok && versions[i].flac && versions[i].url !== versions[i].flac) { versions[i].url = versions[i].flac; return fetch(versions[i].flac); }   // HERESY 1871
        return r;
      }).then(function (r) {
        if (!r.ok) throw new Error(r.status);
        size[i] = +r.headers.get("Content-Length") || 0;
        if (!r.body || !r.body.getReader) return r.blob();
        var reader = r.body.getReader(), parts = [], type = r.headers.get("Content-Type") || "";
        var pump = function () {
          return reader.read().then(function (x) {
            if (x.done) return new Blob(parts, type ? { type: type } : undefined);
            if (!back.isConnected) { try { reader.cancel(); } catch (e) { /* gone */ } throw new Error("closed"); }
            parts.push(x.value); got[i] += x.value.length; paintLoad(); paintCached();
            return pump();
          });
        };
        return pump();
      });
    }
    (function cacheAll() {
      var order = versions.map(function (v, i) { return i; }).sort(function (x, y) { return (x === active ? 0 : 1) - (y === active ? 0 : 1); });
      var k = 0, running = 0;
      var go = function () {
        while (running < 3 && k < order.length && back.isConnected) {
          (function (i) {
            running++;
            fetchWhole(i).then(function (b) { if (!back.isConnected) return; cached[i] = URL.createObjectURL(b); useCached(i); }, function () { /* this one streams as before */ })
              .then(function () { running--; paintCached(); paintLoad(); go(); });
          })(order[k++]);
        }
      };
      paintCached(); paintLoad(); go();
    })();
    function wantPeaks(i) {
      if (peaks[i] !== undefined) return;
      peaks[i] = null;
      cmpPeaks(versions[i]).then(function (p) { peaks[i] = p && p.length ? p : "none"; drawWave(); }, function () { peaks[i] = "none"; drawWave(); });
    }
    function drawWave() {
      var w = wave.clientWidth, h = wave.clientHeight, dpr = window.devicePixelRatio || 1;
      if (!w || !h) return;
      if (wave.width !== Math.round(w * dpr) || wave.height !== Math.round(h * dpr)) { wave.width = Math.round(w * dpr); wave.height = Math.round(h * dpr); }
      var ctx = wave.getContext("2d"), css = getComputedStyle(box), p = peaks[active], d = dur(), at = d ? Math.min(1, (cur().currentTime || 0) / d) : 0;
      var lit = css.getPropertyValue("--amber").trim() || "#d9a441", dim = css.getPropertyValue("--dim").trim() || "#888";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      if (!p || p === "none") {
        ctx.fillStyle = dim; ctx.fillRect(0, h / 2 - 0.5, w, 1);
        ctx.fillStyle = lit; ctx.fillRect(0, h / 2 - 1, w * at, 2);
      } else {
        var max = 0, k;
        for (k = 0; k < p.length; k++) if (p[k] > max) max = p[k];
        max = max || 1;
        var bars = Math.max(1, Math.floor(w / 3));
        for (var x = 0; x < bars; x++) {
          var k0 = Math.floor(x * p.length / bars), k1 = Math.max(k0 + 1, Math.floor((x + 1) * p.length / bars)), m = 0;
          for (k = k0; k < k1 && k < p.length; k++) if (p[k] > m) m = p[k];
          var bh = Math.max(1, m / max * (h - 6));
          ctx.fillStyle = (x + 0.5) / bars <= at ? lit : dim;
          ctx.fillRect(x * 3, (h - bh) / 2, 2, bh);
        }
      }
      ctx.fillStyle = lit; ctx.fillRect(Math.round(w * at) - 1, 0, 2, h);
    }
    function paintRates() {
      if (!rated) return;
      Array.prototype.forEach.call(box.querySelectorAll(".cmp-li"), function (li) {
        var v = versions[+li.dataset.cmpLi];
        li.hidden = !shown(+li.dataset.cmpLi);
        if (!rateable(v)) return;
        var r = rOf(v);
        li.querySelectorAll("[data-cmp-rate]").forEach(function (b) { b.setAttribute("aria-pressed", String(+b.dataset.cmpRate === 1 ? r > 0 : r < 0)); });
        var f = li.querySelector("[data-cmp-fav]");
        if (f) f.setAttribute("aria-pressed", String(fOf(v)));
        var nb = li.querySelector("[data-cmp-note]");
        if (nb) { var nt = noteOf(v); nb.setAttribute("aria-pressed", String(!!nt)); nb.dataset.tip = nt ? nt.slice(0, 160) : "A note on this take"; }
      });
      if (!shown(active)) {                                 // the one playing disliked and hidden: the next shown one goes on from its second
        for (var k = 1; k < versions.length; k++) { var j = (active + k) % versions.length; if (shown(j)) { pick(j); break; } }
      }
    }
    function paint() {
      var a = cur(), d = dur();
      if (a.readyState >= 1) lastT = a.currentTime || 0;
      playBtn.innerHTML = ico(a.paused ? "play" : "pause");
      playBtn.setAttribute("aria-label", a.paused ? "Play" : "Pause");
      box.querySelector(".cmp-time").textContent = clock(a.currentTime || 0) + " / " + (d ? clock(d) : "0:00");   // HERESY 1724
      wave.setAttribute("aria-valuenow", String(Math.round(a.currentTime || 0)));
      Array.prototype.forEach.call(box.querySelectorAll(".cmp-row"), function (r, i) {
        r.classList.toggle("is-on", i === active);
        r.classList.toggle("is-playing", i === active && !a.paused);
      });
      wantPeaks(active);
      drawWave();
    }
    // HERESY 1872: a take's sheet beside the window: its style (five lines, scrolling) over its lyrics, the window a fifth narrower to its left,
    // the pair centred; its corner makes it wider and taller (kept), its text − + ⟲ (kept); it follows the version playing
    var sheet = null, SHEET_SIZE = "yue2.cmpSheetSize", SHEET_Z = "yue2.cmpSheetZoom";
    function sheetGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function sheetPut(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* the session's own */ } }
    function sheetZoom() { var k = parseInt(sheetGet(SHEET_Z) || "0", 10); return isFinite(k) ? Math.max(-2, Math.min(2, k)) : 0; }
    function sheetPaintZoom() {
      if (!sheet) return;
      var k = sheetZoom();
      sheet.el.style.setProperty("--sheet-t", String(Math.round(Math.pow(1.1, k) * 1000) / 1000));
      sheet.el.querySelector('[data-sheet-z="-1"]').disabled = k <= -2;
      sheet.el.querySelector('[data-sheet-z="1"]').disabled = k >= 2;
      sheet.el.querySelector('[data-sheet-z="0"]').disabled = k === 0;
    }
    function sheetFill(i) {
      if (!sheet) return;
      var v = versions[i], my = sheet.seq = (sheet.seq || 0) + 1, el = sheet.el;
      sheet.i = i;
      Array.prototype.forEach.call(box.querySelectorAll("[data-cmp-sheet]"), function (b) { b.setAttribute("aria-pressed", String(+b.closest("[data-cmp-li]").dataset.cmpLi === i)); });
      el.querySelector(".cmp-sheet-name").textContent = v.label;
      var put = function (d) {
        if (!sheet || sheet.seq !== my) return;
        var st = el.querySelector(".cmp-sheet-style"), ly = el.querySelector(".cmp-sheet-lyrics"), style = d && d.style ? String(d.style) : "", lyrics = d && d.lyrics ? String(d.lyrics) : "";
        st.classList.toggle("is-empty", !style);
        st.textContent = style || tt("No style");
        ly.classList.toggle("is-empty", !lyrics);
        ly.innerHTML = lyrics ? lyrics.replace(/\r\n?/g, "\n").split("\n").map(function (line) {
          return /^\s*\[[^\]]*\]\s*$/.test(line) ? '<span class="cmp-sheet-tag">' + esc(line) + "</span>" : esc(line);
        }).join("\n") : esc(tt("No lyrics"));
        ly.scrollTop = 0; st.scrollTop = 0;
      };
      var p = v.take && hk.sheet ? hk.sheet(v.take) : null;
      if (p && p.then) p.then(put, function () { put(null); }); else put(null);
    }
    function sheetOpen(i) {
      if (sheet) { if (sheet.i === i) return sheetClose(); return sheetFill(i); }
      var el = document.createElement("aside");
      el.className = "cmp-sheet";
      el.setAttribute("aria-label", "Style and lyrics");
      var ui = function (n) { return window.HeresyIcons && window.HeresyIcons.ui ? window.HeresyIcons.ui(n) : ""; };
      el.innerHTML = '<div class="cmp-sheet-head" data-tip="Drag its corner to make it wider and taller; a double click here puts its size back"><div class="cmp-sheet-title">' +
        '<span class="cmp-sheet-k">Style and lyrics</span><b class="cmp-sheet-name" translate="no"></b></div>' +
        '<span class="lyr-over-fs" role="group" aria-label="Text size"><button type="button" class="btn ghost small icon-btn" data-sheet-z="-1" aria-label="Smaller text" data-tip="Smaller text here">' + ui("text-smaller") +
        '</button><button type="button" class="btn ghost small icon-btn" data-sheet-z="1" aria-label="Larger text" data-tip="Larger text here">' + ui("text-larger") +
        '</button><button type="button" class="btn ghost small icon-btn" data-sheet-z="0" aria-label="The text as it starts" data-tip="The text as it starts">' + ui("text-reset") + "</button></span>" +
        '<button type="button" class="btn ghost small icon-btn" data-sheet="close" aria-label="Close the sheet (Esc)" data-tip="Close the sheet (Esc)">' + ui("x") + "</button></div>" +
        '<div class="cmp-sheet-label">Style</div><div class="cmp-sheet-style" translate="no"></div>' +
        '<div class="cmp-sheet-label">Lyrics</div><div class="cmp-sheet-lyrics" translate="no"></div>';
      var kept = null;
      try { kept = JSON.parse(sheetGet(SHEET_SIZE) || "null"); } catch (e) { kept = null; }
      if (kept && kept.w > 0 && kept.h > 0) { el.style.width = Math.round(kept.w) + "px"; el.style.height = Math.round(kept.h) + "px"; }
      back.appendChild(el);
      back.classList.add("has-sheet");
      sheet = { el: el, i: -1, w0: 0, h0: 0 };
      var r0 = el.getBoundingClientRect();
      sheet.w0 = r0.width; sheet.h0 = r0.height;
      if (window.ResizeObserver) {                       // its corner dragged: the size kept for the next time
        sheet.ro = new ResizeObserver(function () {
          if (!sheet || sheet.el !== el) return;
          var r = el.getBoundingClientRect();
          if (Math.abs(r.width - sheet.w0) > 2 || Math.abs(r.height - sheet.h0) > 2) { sheetPut(SHEET_SIZE, JSON.stringify({ w: Math.round(r.width), h: Math.round(r.height) })); sheet.w0 = r.width; sheet.h0 = r.height; }
          drawWave();
        });
        sheet.ro.observe(el);
      }
      el.querySelector(".cmp-sheet-head").addEventListener("dblclick", function (e) {
        if (e.target.closest("button")) return;
        sheetPut(SHEET_SIZE, null); el.style.width = ""; el.style.height = "";
        var r = el.getBoundingClientRect(); sheet.w0 = r.width; sheet.h0 = r.height;
      });
      el.addEventListener("click", function (e) {
        var z = e.target.closest("[data-sheet-z]"), c = e.target.closest('[data-sheet="close"]');
        if (c) return sheetClose();
        if (z) { var k = +z.dataset.sheetZ === 0 ? 0 : Math.max(-2, Math.min(2, sheetZoom() + +z.dataset.sheetZ)); sheetPut(SHEET_Z, k ? String(k) : null); sheetPaintZoom(); }
      });
      sheetPaintZoom();
      sheetFill(i);
      requestAnimationFrame(drawWave);
    }
    function sheetClose() {
      if (!sheet) return;
      if (sheet.ro) sheet.ro.disconnect();
      sheet.el.remove();
      sheet = null;
      back.classList.remove("has-sheet");
      Array.prototype.forEach.call(box.querySelectorAll("[data-cmp-sheet]"), function (b) { b.setAttribute("aria-pressed", "false"); });
      requestAnimationFrame(drawWave);
      box.focus();
    }
    function pick(i) {
      if (i < 0 || i >= audios.length || i === active) return;
      if (sheet && versions[i].take) sheetFill(i);       // HERESY 1872: the sheet follows the version playing
      var from = cur(), to = audios[i], t = from.readyState >= 1 ? (from.currentTime || 0) : lastT, playing = !from.paused;
      lastT = t;
      var place = function () { try { to.currentTime = Math.min(t, isFinite(to.duration) ? Math.max(0, to.duration - 0.05) : t); } catch (e) { /* not seekable yet */ } };
      active = i;
      if (to.readyState >= 1) place(); else to.addEventListener("loadedmetadata", place, { once: true });
      if (playing) {
        to.play().then(settle, settle);
      } else { from.pause(); }
      paint();
    }
    function toggle() { var a = cur(); if (a.paused) a.play().catch(function () {}); else a.pause(); paint(); }
    function close() {
      if (sheet && sheet.ro) sheet.ro.disconnect();     // HERESY 1872
      sheet = null;
      audios.forEach(function (a) { a.pause(); a.removeAttribute("src"); a.load(); });
      cached.forEach(function (u) { if (u) URL.revokeObjectURL(u); });   // HERESY 1621: the memory given back
      document.removeEventListener("keydown", key, true);
      window.removeEventListener("resize", drawWave);
      clearInterval(tick);
      back.remove();
    }
    function key(e) {
      if (document.querySelector(".hd-back")) return;   // HERESY 1724: a dialog over the window (the note) has the keys
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); return sheet ? sheetClose() : close(); }   // HERESY 1872: the sheet first
      if (e.target && box.contains(e.target) && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && e.target.type !== "checkbox") return;
      if (e.key === " ") { e.preventDefault(); return toggle(); }
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); var a = cur(); a.currentTime = Math.max(0, (a.currentTime || 0) + (e.key === "ArrowRight" ? 5 : -5)); return paint(); }
      if (/^[1-9]$/.test(e.key)) { e.preventDefault(); if (shown(+e.key - 1)) pick(+e.key - 1); }
    }
    var seekAt = function (e) {
      var r = wave.getBoundingClientRect(), d = dur();
      if (!d || !r.width) return;
      cur().currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * d;
      paint();
    };
    wave.addEventListener("pointerdown", function (e) { dragging = true; try { wave.setPointerCapture(e.pointerId); } catch (x) { /* none */ } seekAt(e); });
    wave.addEventListener("pointermove", function (e) { if (dragging) seekAt(e); });
    wave.addEventListener("pointerup", function () { dragging = false; });
    wave.addEventListener("pointercancel", function () { dragging = false; });
    window.addEventListener("resize", drawWave);
    document.addEventListener("keydown", key, true);
    back.addEventListener("mousedown", function (e) { if (e.target === back) close(); });
    box.addEventListener("change", function (e) {
      if (!e.target.dataset.cmpHide) return;
      hideDis = e.target.checked;                        // HERESY 1724: for this window only
      paintRates();
    });
    box.addEventListener("click", function (e) {
      var rb = e.target.closest("[data-cmp-rate]"), fb = e.target.closest("[data-cmp-fav]"), nb = e.target.closest("[data-cmp-note]"), sb = e.target.closest("[data-cmp-sheet]");
      if (sb) return sheetOpen(+sb.closest("[data-cmp-li]").dataset.cmpLi);   // HERESY 1872
      if (nb) {                                          // HERESY 1724: the take's note, as its card's menu writes it
        var vn = versions[+nb.closest("[data-cmp-li]").dataset.cmpLi];
        window.HeresyDialog.prompt("A note on “" + vn.label + "”\n\nEmpty removes it.", noteOf(vn), { ok: "Keep the note", max: 600, area: true, rows: 6, cls: "hd-note" })
          .then(function (t) { if (t !== null) { var p = hk.setNote(vn.take, t); if (p && p.then) p.then(paintRates, paintRates); else paintRates(); } box.focus(); });
        return;
      }
      if (rb || fb) {
        var v = versions[+(rb || fb).closest("[data-cmp-li]").dataset.cmpLi];
        if (rb) {
          var want = +rb.dataset.cmpRate, now = rOf(v), to = now === want ? 0 : want;
          var done = v.take ? hk.rate(v.take, to) : putMark(v.mark, { rating: to });   // 1504
          if (to < 0 && fOf(v)) setFav(v, false);        // HERESY 1724: a dislike takes the star off
          paintRates();
          if (done && done.then) done.then(paintRates, paintRates);
        } else {
          var on = !fOf(v);
          setFav(v, on);
          if (on && rOf(v) < 0) { var un = v.take ? hk.rate(v.take, 0) : putMark(v.mark, { rating: 0 }); if (un && un.then) un.then(paintRates, paintRates); }   // and a star the dislike
          paintRates();
        }
        return;
      }
      var row = e.target.closest("[data-cmp-i]"), b = e.target.closest("[data-cmp]");
      if (row) {
        var i = +row.dataset.cmpI;
        if (i === active) return toggle();
        var wasPaused = cur().paused;
        pick(i);
        if (wasPaused) audios[i].play().then(settle, settle);   // a click on a version means: hear it
        return;
      }
      if (b && b.dataset.cmp === "close") return close();
      if (b && b.dataset.cmp === "play") return toggle();
    });
    audios.forEach(function (a, i) { a.addEventListener("ended", function () { if (i === active) paint(); }); });
    var tick = setInterval(paint, 250);
    paintRates();
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
    state.reading = !!take;                         // HERESY 1906: until the lab answers, «Reading…», never «Nothing made»
    say("");
    paint();
    refresh();
  }

  // HERESY 1169: the de-esser as set, for the chain when it splits stems (remasterSettings says it for this step's own source)
  function chainDeess() { return !!($("rmDeess") && $("rmDeess").checked); }
  window.HeresyDerived = { init: init, setTake: setTake, files: files, refresh: refresh, mdSizes: paintMdSizes, remasterSettings: remasterSettings, chainDeess: chainDeess, compareList: openCompare,
                           list: function () { return state.list.slice(); },   // 1506: the branches as the lab names them (kind, source), for the Refiner's canvas
                           marks: function (name) { return Object.assign({}, MARKS[name] || {}); } };   // 1415; 1504
})();
