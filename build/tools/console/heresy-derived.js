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
  // HERESY 2296: a flag's time to the millisecond, «0:11.347» (clock() floored it: a flag set at 11.8 s stood at 11.0, before the click)
  function clockMs(t) { var q = Math.max(0, Math.round((+t || 0) * 1000)), m = Math.floor(q / 60000), s = Math.floor(q % 60000 / 1000), r = q % 1000; return m + ":" + (s < 10 ? "0" : "") + s + "." + (r < 10 ? "00" : r < 100 ? "0" : "") + r; }
  // HERESY 1061: from the engine itself (native Range); the lab proxy failed on big files and on seeks
  // HERESY 1484: a step's report (read, not played)
  function isText(f) { return f.kind === "text" || /\.(txt|json|md|csv)$/i.test(f.file || f.path || ""); }
  function isImage(f) { return f.kind === "image" || /\.(png|jpe?g|webp|svg)$/i.test(f.file || f.path || ""); }   // HERESY 1557: a step's picture
  function isMidi(f) { return f.kind === "midi" || /\.midi?$/i.test(f.file || f.path || ""); }   // HERESY 1834: a MIDI set's file: downloaded, not played
  // HERESY 1489: a download signed on the way when Content Credentials are on (app.js holds the switch)
  function signed(url, fmt, take, path) { return window.HeresyC2pa ? window.HeresyC2pa.url(url, fmt, take, path) : url; }
  function fileUrl(name, path) { return "/library/file?name=" + encodeURIComponent(name) + "&path=" + encodeURIComponent(path); }
  var KIND = { stems: "Stems", remaster: "Remaster", upscale: "Upscale", debuzz: "Debuzz", daw: "DAW mix", gate: "Digital Gateway", midi: "Sound to MIDI", bounce: "Bounce in place" };   // HERESY 2316   // HERESY 1471; 1547; 1834
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
  function kindName(m) { return m.kind === "plugin" ? (m.label || "Plugin") : KIND[m.kind] || m.kind; }   // HERESY 1460: a plugin's step names itself (1553: the Studio's own translated)
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
  function player(url, peaksUrl, secsOf) {             // HERESY 2232: secsOf, the take whose sections its wave shows (the original's row)
    return '<span class="dv-player" data-dv-peaks="' + esc(peaksUrl) + '"' + (secsOf ? ' data-dv-secs="' + esc(secsOf) + '"' : "") + '><button type="button" class="dv-play" aria-label="Play"></button>' +
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
      el.addEventListener("mouseleave", function () { el.classList.remove("is-hover"); el._hover = null; draw(); });
      // HERESY 2260: where the pointer is on the wave, for its time and the whole name of its section (a name cut short on the wave reads whole here)
      cv.addEventListener("mousemove", function (ev) { var r = cv.getBoundingClientRect(); el._hover = Math.max(0, Math.min(1, (ev.clientX - r.left) / (r.width || 1))); draw(); });
      cv.addEventListener("click", function (ev) {
        var r = cv.getBoundingClientRect(), f = Math.max(0, Math.min(1, (ev.clientX - r.left) / (r.width || 1)));
        var go = function () {
          if (!(isFinite(a.duration) && a.duration > 0)) return;
          var t = f * a.duration, near = el._secList && state.hooks.sectionNear ? state.hooks.sectionNear(el._secList, t, a.duration, r.width) : null;   // HERESY 2232: by a line, its start
          a.currentTime = near ? near.t : t; draw();
        };
        if (isFinite(a.duration) && a.duration > 0) go(); else { a.preload = "metadata"; a.addEventListener("loadedmetadata", go, { once: true }); a.load(); }
      });
      if (io) io.observe(el); else loadPeaks(el);
      if (el.dataset.dvSecs) loadSections(el);
    });
  }
  // HERESY 2232 (TODO.md, from SUNO v6: «The same over the take's own waveform in the room»): the take's sections over the original's wave in the
  // Refiner, from app.js (the player's placing, its painter, its click by a line); asked once a take, again when the player places them anew or its ear is turned
  var SECS = {};
  function loadSections(el) {
    var name = el.dataset.dvSecs, h = state.hooks, cv = el.querySelector(".dv-wave");
    if (!h.sections || !h.paintSections) return;
    var put = function (list) { el._secList = list; drawPlayer(el); };
    if (Array.isArray(SECS[name])) return put(SECS[name]);
    (SECS[name] = SECS[name] || h.sections(name).then(function (list) { SECS[name] = list || []; return SECS[name]; }, function (e) { delete SECS[name]; throw e; }))
      .then(function (list) { if (el.isConnected) { cv.removeAttribute("data-tip"); put(list); } }, function (e) {
        // said on the wave itself: a wave without lines because they could not be read is not a take without sections
        if (el.isConnected) cv.setAttribute("data-tip", tt("The take's sections could not be read for this wave: {0}").replace("{0}", tt((e && e.message) || String(e))));
      });
  }
  window.addEventListener("heresy-sections", function (e) {
    var name = e.detail && e.detail.name;
    if (name) delete SECS[name]; else SECS = {};
    Array.prototype.forEach.call(document.querySelectorAll(".dv-player[data-dv-secs]"), function (el) { if (!name || el.dataset.dvSecs === name) loadSections(el); });   // the tree and a node window's Output
  });
  function loadPeaks(el) {
    var u = el.dataset.dvPeaks;
    if (!u) return;
    if (PEAKS[u]) { el._peaks = PEAKS[u].peaks; el._secs = PEAKS[u].seconds; return drawPlayer(el); }
    fetch(u).then(function (r) { return r.ok ? r.json() : null; }).then(function (p) {
      if (!p || !p.peaks || !p.peaks.length) return;
      PEAKS[u] = p; el._peaks = p.peaks; el._secs = p.seconds; drawPlayer(el);
    }).catch(function () { /* no wave: the line stays */ });
  }
  // HERESY 2260 (Viktor 08.11.2026: «ДА, по возможности»): the names on a 38 px wave, larger (10.5 px against 9) in one row, nearly opaque on a
  // firmer ground; a name with no room is cut with «…» as before, and the pointer says it whole with its time
  function ROOM_MARKS(el) { return { size: 10.5, rows: 1, ink: 0.94, back: 0.9, at: el._hover }; }
  // HERESY 2260: a stem's or a remaster's wave carries the take's sections when it keeps the take's own time (its length the take's, within half a
  // second or a hundredth), the lines and names where the original's wave has them; a file of another length, or of no known length, stays bare
  function secsFor(m, f, take) {
    var a = +f.seconds || 0, b = +take.seconds || 0;
    return (m.kind === "stems" || m.kind === "remaster") && a > 0 && b > 0 && Math.abs(a - b) <= Math.max(0.5, b * 0.01) ? take.name : "";
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
    if (el._secList && el._secList.length && d && state.hooks.paintSections) state.hooks.paintSections(ctx, el._secList, d, w, h, ROOM_MARKS(el));   // HERESY 2232: the player's painter; 2260: at the room's measure
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

  // HERESY 1964: the original's row and one branch as the tree draws them, for the tree and for a node window's Output
  function origHtml(take) {
    var orig = "/library/listen?name=" + encodeURIComponent(take.name);
    return '<div class="dv-node dv-root dv-orig"><span class="dv-name"><span translate="no">' + esc(take.label || take.name) + '</span> <em class="dv-orig-tag">the original</em></span>' +
      '<span class="dv-meta mono">' + (take.seconds ? clock(take.seconds) : "") + "</span>" +
      player(orig, "/library/peaks?name=" + encodeURIComponent(take.name), take.name) +   // HERESY 1487; 2232: its sections over it
      '<span class="dv-acts"><button type="button" class="btn small primary dv-compare" data-dv-compare="0" data-tip="Every version of this take in one player: switch between them at the same second (1–9, Space)">Compare all</button>' +
      '<button type="button" class="btn ghost small dv-mon" data-dv-mon="' + esc("") + '" aria-pressed="false" data-tip="Play it through Forge\'s monitor (Audio I/O), from where its player stands; again to stop. The browser plays as before">On Forge</button>' +   // HERESY 1548
      '<a class="btn ghost small" href="' + esc(signed("/library/flac?name=" + encodeURIComponent(take.name), "flac", take)) + '" download="' + esc((take.label || take.name) + ".flac") + '">FLAC</a></span></div>';   // HERESY 1489; 1513: its buttons one column
  }
  function branchHtml(c, take) {
    var h = "";
    var m = c.m;
    h += '<div class="dv-group" data-dv-id="' + esc(m.id || "") + '" data-kind="' + esc(m.kind || "") + '"' +
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
      var nm = m.builtin ? '<span class="dv-name">↳ <span>' + esc(title(f)) + "</span></span>" : '<span class="dv-name" translate="no">↳ ' + esc(title(f)) + "</span>";   // HERESY 1557: the Studio's own in the page's words
      if (isImage(f)) {                               // HERESY 1557: a step's picture, looked at here, or its file
        h += '<div class="dv-node is-image">' + nm + '<a class="dv-pic" href="' + esc(url) + '" target="_blank" rel="noopener"><img src="' + esc(url) + '" alt="" loading="lazy" /></a>' +
          '<a class="btn ghost small" translate="no" href="' + esc(url) + '" download="' + esc((take.label || take.name) + " - " + (f.file || title(f))) + '">' +
          esc(String(f.file || f.path).split(".").pop().toUpperCase()) + "</a></div>";
        return;
      }
      if (isMidi(f)) {                                // HERESY 1834: a MIDI file: downloaded (a DAW, the roll), not played here
        h += '<div class="dv-node is-midi">' + nm + '<a class="btn ghost small" translate="no" href="' + esc(url) + '" download="' + esc((take.label || take.name) + " · " + (m.size || "midi") + ".mid") + '">MIDI</a></div>';
        return;
      }
      if (isText(f)) {                                // HERESY 1484: a report: read here, or its file
        h += '<div class="dv-node is-text">' + nm +
          '<button type="button" class="btn ghost small" data-dv-read="' + esc(f.path) + '" data-dv-read-title="' + esc(title(f)) + '">Read</button>' +
          '<a class="btn ghost small" translate="no" href="' + esc(url) + '" download="' + esc((take.label || take.name) + " - " + (f.file || title(f))) + '">' +
          esc(String(f.file || f.path).split(".").pop().toUpperCase()) + "</a></div>";
        return;
      }
      h += '<div class="dv-node">' + nm + '<span class="dv-meta mono">' + (f.seconds ? clock(f.seconds) : "") + "</span>" +
        player(url, "/lab/peaks?name=" + encodeURIComponent(take.name) + "&path=" + encodeURIComponent(f.path) + "&n=400", secsFor(m, f, take)) +   // HERESY 1487; 2260: the take's sections
        '<span class="dv-acts"><button type="button" class="btn ghost small" data-dv-compare-path="' + esc(f.path) + '" data-tip="Compare it with the original and every other version, at the same second">Compare</button>' +
        '<button type="button" class="btn ghost small" data-dv-spectrum="' + esc(f.path) + '" data-tip="Lay this file over the take in the spectrum">Spectrum</button>' +
        (window.HeresyPost && window.HeresyPost.has && window.HeresyPost.has("pl-ruach-reportPanel") ?   // HERESY 1557
          '<button type="button" class="btn ghost small" data-dv-report="' + esc(f.path) + '" data-tip="Measure this file against what it was made from: loudness, true peak, range, width, bands, the spectra at equal loudness; a page and a picture in the tree">Before / after</button>' : "") +
        '<button type="button" class="btn ghost small dv-mon" data-dv-mon="' + esc(f.path) + '" aria-pressed="false" data-tip="Play it through Forge\'s monitor (Audio I/O), from where its player stands; again to stop. The browser plays as before">On Forge</button>' +   // HERESY 1548
        (/vocal/i.test(f.name) ? '<button type="button" class="btn ghost small" data-dv-gloss="' + esc(f.path) + '" data-tip="Whisper on this file against the lyrics">Lyrics check</button>' : "") +
        '<a class="btn ghost small" href="' + esc(signed(url, String(f.file || f.path).split(".").pop().toLowerCase(), take, f.path)) + '" download="' + esc((take.label || take.name) + " - " + title(f) + ".flac") + '">FLAC</a></span></div>';   // HERESY 1489; 1513
    });
    h += "</div>";
    return h;
  }
  function paint() {
    var host = $("derivedTree"), take = state.take;
    if (!take) { host.innerHTML = '<p class="row-hint">Pick a take on the right.</p>'; return; }
    // HERESY 1138: the take itself is a node of the tree like its branches: it plays, it downloads, and it opens the
    // comparison of every version (the original first)
    var html = origHtml(take);
    if (!state.list.length && !state.running.length) html += state.reading ? '<p class="row-hint dv-empty is-reading">Reading what was made from this take…</p>' : state.unread ? '<p class="row-hint dv-empty is-unread">What was made from this take could not be read: the lab\'s answer broke off or did not parse. Open the take again; if it stays, a branch\'s manifest.json is at fault (Engine → Server and log)</p>'   // HERESY 1576: not an empty that lies
      : '<p class="row-hint dv-empty">Nothing made from this take yet.</p>';
    // HERESY 1129: what runs now stands first: the tree grows upward, the newest on top
    state.running.forEach(function (j, i) {
      var failed = j.status === "failed", p = progress(j);
      html += '<div class="dv-group is-running' + (failed ? " is-failed" : "") + '" data-job="' + i + '" data-kind="' + esc(j.kind || "") + '"><div class="dv-group-head"><strong' + (j.kind === "plugin" && !j.builtin ? ' translate="no"' : "") + ">" + esc(kindName(j) || "Job") + "</strong>" +
        (j.mode ? " · " + esc(MODE[j.mode] || j.mode) : "") + '<span class="dv-meta">' + (failed ? "failed: " + esc(j.error || "") : esc(p.say)) + "</span></div>" +
        (failed ? "" : '<div class="job-bar' + (j.status === "queued" ? " is-queued" : "") + '"><i style="width:' + p.pct + '%"></i></div>') + "</div>";
    });
    chain(state.list).forEach(function (c) { html += branchHtml(c, take); });   // HERESY 1486: in the chain's order (1964: each branch drawn by branchHtml)
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
    if (j.status === "queued" && j.lamp)               // HERESY 2301: the analog gateway's line, one stream on the machine: the place and the time ahead
      return { pct: 3, say: tt("the lamp's queue: number {0}, about {1}").replace("{0}", j.lamp.position).replace("{1}", clockS(Math.max(0, Math.round(j.lamp.eta || 0)))) };
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
  var LANDED_SEEN = {};                             // HERESY 2298: each branch that landed with a Reader's take said once
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
        // HERESY 2298: made here with a Reader's take in it, it is the Reader's and landed with that take: said, or it would seem lost
        (d.landed || []).forEach(function (l) {
          if (!l || LANDED_SEEN[l.id]) return;
          LANDED_SEEN[l.id] = 1;
          (window.HeresyToast || say)(tt("Made with the Narrator's take, so it is the Narrator's: it landed with \u201c{0}\u201d").replace("{0}", l.title || l.take));
        });
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
        // HERESY 2570 (the UIX audit, item 65): English here, the catalog's «Small · suggested» where it shows, so a language changed later changes it too
        return '<option value="' + s + '">' + esc((s === "large" ? "Large" : s === "medium" ? "Medium" : "Small") + (s === st.suggest ? " \u00b7 suggested" : "")) + "</option>";
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

  // HERESY 1964: the tree's own handlers, kept to be put on a node window's Output as well
  var TREE_ON = [];
  function onTree(type, fn, cap) { TREE_ON.push([type, fn, !!cap]); $("derivedTree").addEventListener(type, fn, !!cap); }
  function wire(host) {
    if (!host || host.dataset.dvWired) return;
    host.dataset.dvWired = "1";
    TREE_ON.forEach(function (x) { host.addEventListener(x[0], x[1], x[2]); });
  }
  // what went into a branch: the take, one of its files, or a set of the tree
  function sourceHtml(take, src) {
    src = String(src || "");
    if (!src || src === "the take") return origHtml(take);
    var dir = /^derived\/([^/]+)$/.exec(src), byId = {};
    state.list.forEach(function (x) { byId[x.id] = x; });
    if (dir && byId[dir[1]]) return branchHtml({ m: byId[dir[1]], depth: 0 }, take);
    var f = null;
    state.list.forEach(function (x) { (x.files || []).forEach(function (y) { if (y.path === src) f = y; }); });
    var url = fileUrl(take.name, src), nm = f ? title(f) : src.split("/").pop();
    return '<div class="dv-node"><span class="dv-name" translate="no">' + esc(nm) + '</span><span class="dv-meta mono">' + (f && f.seconds ? clock(f.seconds) : "") + "</span>" +
      player(url, "/lab/peaks?name=" + encodeURIComponent(take.name) + "&path=" + encodeURIComponent(src) + "&n=400") +
      '<span class="dv-acts"><button type="button" class="btn ghost small" data-dv-compare-path="' + esc(src) + '">Compare</button>' +
      '<button type="button" class="btn ghost small dv-mon" data-dv-mon="' + esc(src) + '" aria-pressed="false">On Forge</button></span></div>';
  }
  // a node window's Output: what went in, then what the node made (by the branches' ids, newest first)
  function renderInto(host, ids) {
    var take = state.take;
    if (!host) return 0;
    var want = {}, cs;
    (ids || []).forEach(function (i) { want[i] = 1; });
    cs = state.list.filter(function (m) { return want[m.id]; });
    if (!take || !cs.length) {
      host.innerHTML = '<p class="row-hint nd-out-none">' + esc(tt(take ? "Nothing made by this node from this take yet: run it, and what it makes comes here." : "Pick a take first.")) + "</p>";
      return 0;
    }
    host.innerHTML = '<div class="nd-out-part"><span class="label">' + esc(tt("What went in")) + '</span><div class="dv-tree nd-out-tree">' + sourceHtml(take, cs[0].source || cs[0].set || "") + "</div></div>" +
      '<div class="nd-out-part"><span class="label">' + esc(tt("What this node made")) + " · " + cs.length + '</span><div class="dv-tree nd-out-tree">' +
      cs.map(function (m) { return branchHtml({ m: m, depth: 0 }, take); }).join("") + "</div></div>";
    wire(host);
    var ts = host.querySelectorAll(".nd-out-tree"), align = function () {   // the two parts one column, as the tree's: every wave ends where the take's does
      var w = 0;
      Array.prototype.forEach.call(ts, function (t) { alignTree(t); w = Math.max(w, parseInt(t.style.getPropertyValue("--dv-acts"), 10) || 0); });
      if (w) Array.prototype.forEach.call(ts, function (t) { t.style.setProperty("--dv-acts", w + "px"); });
      Array.prototype.forEach.call(host.querySelectorAll(".dv-player"), drawPlayer);
    };
    if (host.offsetWidth) align(); else requestAnimationFrame(align);   // a window opened straight on its output is still hidden here: once it shows
    Array.prototype.forEach.call(ts, function (t) { initPlayers(t); });
    return cs.length;
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
    onTree("click", function (event) {
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
    // HERESY 1484: a report read in the Studio's dialog
    onTree("click", function (event) {
      var rd = event.target.closest("[data-dv-read]");
      if (!rd || !state.take) return;
      var head = rd.dataset.dvReadTitle || "";
      fetch(fileUrl(state.take.name, rd.dataset.dvRead)).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); })
        .then(function (text) { return window.HeresyDialog.alert(head + "\n\n" + text.trim(), { ok: "Close" }); })
        .catch(function (e) { say(head + ": " + e.message, true); });
    });
    // HERESY 1557: Before / after on a file of the tree; 1558: a match's bands onto the DAW's master EQ
    onTree("click", function (event) {
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
    onTree("click", function (event) {
      var sp = event.target.closest("[data-dv-spectrum]"), gl = event.target.closest("[data-dv-gloss]");
      if (sp && state.hooks.compare) state.hooks.compare(sp.dataset.dvSpectrum);
      if (gl && state.hooks.gloss) state.hooks.gloss(gl.dataset.dvGloss);
    });
    // HERESY 1138: the comparison, from the original's row or any branch's
    onTree("click", function (event) {
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
    onTree("play", function (event) {
      Array.prototype.forEach.call(document.querySelectorAll(".dv-player audio"), function (a) { if (a !== event.target) a.pause(); });   // 1964: the windows' players too
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
  // HERESY 1995 (Viktor 01.11.2026: «"Скрыть дизлайкнутые" с его чекбоксом переделай на пальчик вниз. Если нажат - показываем, если грейскейлом -
  // скрыто… По умолчанию сделай нескрытыми, но в локал сторидж память о позиции кнопки»)
  var CMP_SHOW = "yue2.cmpShowDisliked", CMP_KEEP = "yue2.cmpKeepSecond";
  var CMP_BLIND = "yue2.cmpBlind";                     // HERESY 2009 (Viktor 01.11.2026: «Кнопка ВСЛЕПУЮ не запоминается в сравнении»)
  // HERESY 2063 (Viktor 05.11.2026: «если есть в названии трека `the original`, мы не скрываем его, а тасуем только остальные, что выбраны. Тогда я точно буду видеть, где оригинал в слепой прослушке»): a version whose title
  // holds «the original», in any case, is the original: Blind leaves it as it is, first
  // HERESY 2074 (Viktor 05.11.2026: «Давай, быстрецом гоним всё до и для среза 2.0.6»): «the original» as whole words, any case («Breathe Original», «The Originality» are none)
  function cmpIsOrig(v) { return /\bthe\s+original\b/i.test(String((v && v.label) || "")); }
  function cmpGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function cmpPut(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* private */ } }
  function cmpHide() { return cmpGet(CMP_SHOW) === "0"; }
  function cmpKeep() { return cmpGet(CMP_KEEP) !== "0"; }   // a switch keeps the second unless told to start from the start
  // where a switch starts the other version: the second it left, or 0 when told so or when the one left had ended
  function cmpStartAt(t, d, ended, keep) { return !keep || ended || (d > 0 && t >= d - 0.25) ? 0 : t; }
  // ⏪ ⏩ as the player's own: to the last or the next mark of every step seconds (Engine → Defaults, 15 s)
  function cmpStep() { var v = +cmpGet("yue2.seekBtn"); return v > 0 && v <= 600 ? v : 15; }
  function cmpSeek(t, step, dir, d) { var x = dir > 0 ? (Math.floor(t / step + 1e-6) + 1) * step : Math.floor((t - 0.5) / step) * step; return Math.max(0, d > 0 ? Math.min(x, Math.max(0, d - 0.05)) : x); }
  // the ruler's ticks: a minute the tallest, then 30 s and 15 s, the seconds the lowest, thinned on a long take (every 2, 3 or 5 s, or none)
  // HERESY 2000: the marks a take's note holds, «1:23 — a word» each on a line: [seconds, its word]
  // HERESY 2296 (Viktor 09.11.2026: «Добавь миллисекунды сюда в волну… И можно тоже с флажком выделять и флаговать целый сегмент»): «0:11.347 — a word»
  // to the millisecond (the old «1:23 — a word» read as before), and a stretch «0:11.347–0:12.120 — a word»: [start, word] or [start, word, end]
  var MARK_RE = /^(\d+):(\d\d)(?:\.(\d{1,3}))?(?:\s*[\u2013-]\s*(\d+):(\d\d)(?:\.(\d{1,3}))?)?\s+\u2014\s*(.*)$/;
  function cmpSec(m, s, ms) { return +m * 60 + +s + (ms ? +("0." + ms) : 0); }
  function cmpMarkLines(note) {
    var out = [];
    String(note || "").split("\n").forEach(function (ln, i) {
      var m = MARK_RE.exec(ln.replace(/\r$/, ""));
      if (!m) return;
      var t = cmpSec(m[1], m[2], m[3]), e = m[4] != null ? cmpSec(m[4], m[5], m[6]) : null;
      if (e != null && e < t) { var x = t; t = e; e = x; }
      out.push({ line: i, t: t, e: e != null && e > t ? e : null, word: m[7] });
    });
    return out;
  }
  function cmpMarks(note) { return cmpMarkLines(note).map(function (k) { return k.e != null ? [k.t, k.word, k.e] : [k.t, k.word]; }); }
  // a second of one version as the same music's second in another, each placed by its sound against the first (off: its lag, seconds)
  function cmpShift(t, offFrom, offTo) { return Math.max(0, t - offFrom + offTo); }
  function cmpTicks(d, w) {
    var pps = d > 0 ? w / d : 0, every = pps >= 4 ? 1 : pps >= 2 ? 2 : pps >= 1.2 ? 3 : pps >= 0.6 ? 5 : 0, out = [];
    for (var s = 0; s <= Math.floor(d); s++) {
      var k = s % 60 === 0 ? 4 : s % 30 === 0 ? 3 : s % 15 === 0 ? 2 : every && s % every === 0 ? 1 : 0;
      if (k) out.push([s, k]);
    }
    return out;
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
    // HERESY 2044: the player's take, playing, goes on here from its second (and the version playing goes back there when the window closes)
    var main = hk.playingAt ? hk.playingAt() : null, mainAt = -1;
    if (main && main.playing) versions.forEach(function (v, i) { if (mainAt < 0 && v.take && v.take === main.name) mainAt = i; });
    if (hk.pauseMain) hk.pauseMain();
    active = Math.max(0, Math.min(versions.length - 1, mainAt >= 0 ? mainAt : active || 0));
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
        // HERESY 2063 (Viktor 04.11.2026: «В сравнении поменяй местами на треках кнопку дизлайка и звезды. И со сторон дизлайка дай отступ в 5px»): ☆ before 👎, 👎 5 px off each side (app.css)
        (v.mark || hk.favorite ? '<button type="button" class="coll-act fav" data-cmp-fav="1" aria-label="Favourite">' + ico("star") + "</button>" : "") +
        '<button type="button" class="coll-act" data-cmp-rate="-1" aria-label="Dislike">' + ico("dislike") + "</button>" +
        (v.take && hk.note && hk.setNote ? '<button type="button" class="coll-act cmp-note" data-cmp-note="1" aria-label="Note" data-tip="A note on this take">' + ico("note") + "</button>" : "") + "</span>";   // HERESY 1724
    };
    // HERESY 1995 (Viktor: «переключатель "при переключении на другой трек держаться текущего таймстемпа или другой трек с самого начала"»)
    var KEEP_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">' +
      '<path d="M3 7h7M3 17h7M14 7h7M14 17h7M12 3v18"/></svg>';
    var KEEP_TIP = "Lit: a switch to another version keeps the second. Grey: the other version starts from its start";
    var DIS_TIP = "The disliked versions: lit, they are in the list; grey, they are hidden. Remembered";
    var CMP_ALIGN = "yue2.cmpAlign", ALIGN_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">' +
      '<path d="M2 8h3l2-3 2 6 2-3h4M9 16h3l2-3 2 6 2-3h4M5 3v18"/></svg>';
    // HERESY 2281 · 2286: a version picked for First and second on its row (its order in the square, 1 to 4: the others measured against 1), and the strip's button that runs it
    var PICK_HTML = '<button type="button" class="coll-act cmp-pick" data-cmp-pick="1" aria-pressed="false" aria-label="Pick for First and second" data-tip="Pick it for First and second, up to four: numbered 1 to 4 as picked, 1 the one the others are measured against; a fifth takes the place of the oldest">' +
      '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3.5" fill="none" stroke="currentColor" stroke-width="1.8"/></svg><span class="cmp-pick-n mono" aria-hidden="true"></span></button>';
    var AB_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M3 19V10M6.5 19V6M10 19v-5M12 3v18M14 19v-8M17.5 19V8M21 19v-4"/></svg>';
    var AB_TIP = "First and second of the versions picked on their rows, two to four, measured against 1: the measures side by side, the spectrograms of each, the difference of a chosen pair, a verdict";
    var ALIGN_TIP = "Lit: each version placed by its own sound against the first (a print through gear comes back late), so a switch keeps the music. Grey: by the clock";
    var MARK_TIP = "Mark this moment (M): a word at this moment goes into the take's note to the millisecond, and a flag stands on the wave. Shift+drag on the wave flags a stretch; a double click on a flag or a stretch changes its word";   // HERESY 2296
    var BLIND_TIP = "Blind: the versions shuffled and named A, B, C…, all that tells them apart hidden; off, their names come back";
    var LOUD_WAVE = '<svg class="loud-wave" viewBox="0 0 44 18" preserveAspectRatio="none" aria-hidden="true"><path class="loud-body" d="M0 18 L0 13 L2 10 L4 12 L6 8 L8 11 L10 6 L12 10 L14 3 L16 9 L18 7 L20 11 L22 5 L24 9 L26 8 L28 12 L30 2 L32 8 L34 6 L36 10 L38 4 L40 9 L42 7 L44 12 L44 18Z"/><path class="loud-tips" d="M13.43 5 L14 3 L14.67 5Z M29.4 5 L30 2 L31 5Z M37.67 5 L38 4 L38.4 5Z"/></svg>';   // HERESY 2044b: the top of a wave, its tips red
    var TALL_WAVE = '<svg class="loud-wave" viewBox="0 0 44 18" preserveAspectRatio="none" aria-hidden="true"><path class="loud-body" d="M0 9 L0 7 L2 5.5 L4 6.5 L6 4.5 L8 6 L10 3 L12 5 L14 1.5 L16 4 L18 2.5 L20 5.5 L22 3.5 L24 4.5 L26 2 L28 5 L30 1 L32 4 L34 3 L36 6 L38 4.5 L40 6.5 L42 5.5 L44 7.5 L44 9 L44 10.5 L42 12.5 L40 11.5 L38 13.5 L36 12 L34 15 L32 14 L30 17 L28 13 L26 16 L24 13.5 L22 14.5 L20 12.5 L18 15.5 L16 14 L14 16.5 L12 13 L10 15 L8 12 L6 13.5 L4 11.5 L2 12.5 L0 11 Z"/></svg>';   // HERESY 2045: the whole wave, mirrored
    var LOUD_TIP = "As loud as before the cut came out: each take raised by its own measure (the level the old Peak clip raised to full scale, about 2 dB), a limiter holding the few peaks over it; the file stays as it is";   // HERESY 2037
    // HERESY 2044 (Viktor 03.11.2026, «Для попапа сравнения»): Play on, Ring, Shuffle (off until lit, remembered), the window's volume to 150 %,
    // the wave twice as tall, the window up to 2000 px, the wave coloured by its bands, the memory a graph
    var CMP_ON = "yue2.cmpPlayOn", CMP_RING = "yue2.cmpRing", CMP_SHUF = "yue2.cmpShuffle", CMP_VOL = "yue2.cmpVol", CMP_TALL = "yue2.cmpTall", CMP_WIDE = "yue2.cmpWide", CMP_SPEC = "yue2.cmpSpec";
    var ON_TIP = "Play on: when a version ends, the next one in the list plays from its start. Off by default; remembered";
    var RING_TIP = "Ring: after the last version the first comes again (Play on lights with it)";
    var SHUF_TIP = "Shuffle: each version once, by chance, then it stops; with Ring it goes round again (Play on lights with it)";
    var VOL_TIP = "Volume of this window, to 150 %: past 100 % it turns red, a limiter holding the peaks; a drag from below stops at 100 %, let go and drag again to go past it";
    var TALL_TIP = "The wave twice as tall, for the peaks and the fades; remembered";
    var WIDE_TIP = "Wide: the window up to 2000 px, 20 px from the screen's edges, for a longer wave and ruler; remembered";
    // HERESY 2057 (Viktor 04.11.2026: «убери регулировку скорости воспроизведения. Для того оно и сравнение, чтобы углы не срезать»): every version at its own pace
    var SPEC_TIP = "The wave coloured by its bands: warm where the bass leads, amber in the middle, cold where the highs lead (against the take's own balance); remembered";
    var back = document.createElement("div");
    back.className = "cmp-back";
    back.innerHTML = '<div class="cmp-box" role="dialog" aria-modal="true" aria-label="Compare the versions">' +
      // HERESY 2057 (Viktor: «перенеси кнопку полного экрана вверх влево перед заголовком оверлея, с отступом между»): Wide heads the window
      '<div class="cmp-head"><button type="button" class="cmp-keep cmp-mode cmp-wide-btn" data-cmp="wide" aria-pressed="' + (cmpGet(CMP_WIDE) === "1") + '" aria-label="Wide" data-tip-head="Wide" data-tip="' + WIDE_TIP + '">' + ico(cmpGet(CMP_WIDE) === "1" ? "minimize" : "maximize") + "</button>" +
      '<div class="cmp-head-t"><div class="cmp-title">Compare · ' + esc(title) + '<span class="cmp-now" translate="no"></span></div>' +   // HERESY 2043: the version playing
      '<div class="row-hint">' + versions.length + " versions · a click (or its number) plays it from the same second · Space plays and pauses · ← → five seconds</div></div>" +
      '<span class="cmp-head-r"><span class="cmp-head-b"><button type="button" class="cmp-loud cmp-tall mono" data-cmp="tall" aria-pressed="' + (cmpGet(CMP_TALL) !== "0") + '" aria-label="The wave twice as tall" data-tip="' + TALL_TIP + '">' +   // HERESY 2045: beside +dB, its own wave
      TALL_WAVE + '<span class="loud-t">\u00d72</span></button>' +
      '<button type="button" class="cmp-loud mono" data-cmp="loud" aria-pressed="' + (cmpGet("yue2.oldLoud") === "1") + '" aria-label="As loud as before the cut" data-tip="' + LOUD_TIP + '">' +   // HERESY 2044b: in the head, its wave under it
      LOUD_WAVE + '<span class="loud-t">+dB</span></button></span>' +
      '<button type="button" class="btn ghost small" data-cmp="close">Close</button></span></div>' +
      '<div class="cmp-wavebox"><canvas class="cmp-wave" role="slider" aria-label="Position" tabindex="-1"></canvas><span class="cmp-hover mono" hidden></span><span class="cmp-db mono" aria-hidden="true" translate="no"></span>' +
        '<span class="cmp-grip" data-grip="a" role="slider" tabindex="0" hidden aria-label="Loop start" data-tip="The loop\'s start: drag it, or ← → while it has the focus (0.1 s, with Shift 1 s)"></span>' +
        '<span class="cmp-grip" data-grip="b" role="slider" tabindex="0" hidden aria-label="Loop end" data-tip="The loop\'s end: drag it, or ← → while it has the focus (0.1 s, with Shift 1 s)"></span></div>' +   // HERESY 2289: the loop's grips   // HERESY 1995: the second under the pointer
      '<canvas class="cmp-ruler" aria-hidden="true"></canvas>' +   // HERESY 1995: a minute, 30 s, 15 s, a second
      '<div class="cmp-transport"><button type="button" class="cmp-play" data-cmp="play" aria-label="Play"></button>' +
      '<button type="button" class="cmp-skip" data-cmp="rew" aria-label="Back" data-tip="Back to the last mark, by the player\'s own step (Engine → Defaults)">' + ico("rewind") + "</button>" +
      '<button type="button" class="cmp-skip" data-cmp="fwd" aria-label="On" data-tip="On to the next mark, by the player\'s own step (Engine → Defaults)">' + ico("forward") + "</button>" +
      '<button type="button" class="cmp-keep cmp-mode" data-cmp="playon" aria-pressed="' + (cmpGet(CMP_ON) === "1") + '" aria-label="Play on" data-tip-head="Play on" data-tip="' + ON_TIP + '">' + ico("playon") + "</button>" +   // HERESY 2044
      '<button type="button" class="cmp-keep cmp-mode" data-cmp="ring" aria-pressed="' + (cmpGet(CMP_RING) === "1") + '" aria-label="Ring" data-tip-head="Ring" data-tip="' + RING_TIP + '">' + ico("repeat") + "</button>" +
      '<button type="button" class="cmp-keep cmp-mode" data-cmp="shuffle" aria-pressed="' + (cmpGet(CMP_SHUF) === "1") + '" aria-label="Shuffle" data-tip-head="Shuffle" data-tip="' + SHUF_TIP + '">' + ico("shuffle") + "</button>" +
      '<span class="cmp-time mono">0:00 / 0:00</span>' +   // HERESY 1724: now / length, one place
      '<span class="cmp-volbox" data-cmp="vol"><input type="range" class="cmp-vol" min="0" max="1.5" step="0.01" value="1" aria-label="Volume" data-tip="' + VOL_TIP + '"><span class="cmp-vol-n mono" hidden></span></span>' +   // HERESY 2044
      '<button type="button" class="cmp-keep cmp-g2" data-cmp="keep" aria-pressed="' + cmpKeep() + '" aria-label="Keep the second" data-tip-head="Keep the second" data-tip="' + KEEP_TIP + '">' + KEEP_SVG + "</button>" +   // HERESY 1995
      '<button type="button" class="cmp-keep" data-cmp="align" aria-pressed="' + (cmpGet(CMP_ALIGN) !== "0") + '" aria-label="Sync by sound" data-tip-head="Sync by sound" data-tip="' + ALIGN_TIP + '">' + ALIGN_SVG + "</button>" +   // HERESY 2000
      (hk.sheet && versions.some(function (v) { return v.take; }) ? '<button type="button" class="cmp-skip cmp-sheet-btn" data-cmp="sheet" aria-pressed="false" aria-label="Style and lyrics" data-tip="Its style and lyrics in a sheet beside the window: the version playing">' + ico("sheet-portrait") + "</button>" : "") +   // HERESY 1872, 2043: one, in the strip
      '<button type="button" class="cmp-skip" data-cmp="mark" aria-label="Mark this moment" data-tip="' + MARK_TIP + '">' + ico("flag") + "</button>" +
      '<button type="button" class="cmp-dis cmp-blind" data-cmp="blind" aria-pressed="' + (cmpGet(CMP_BLIND) === "1") + '" aria-label="Blind" data-tip="' + BLIND_TIP + '">' + ico("blind") + "</button>" +   // HERESY 2000; 2043: 🫣, by the flag
      '<button type="button" class="cmp-keep cmp-mode" data-cmp="spec" aria-pressed="' + (cmpGet(CMP_SPEC) === "1") + '" aria-label="Colours of the bands" data-tip-head="Colours of the bands" data-tip="' + SPEC_TIP + '">' + ico("spectrum") + "</button>" +   // HERESY 2044
      '<button type="button" class="cmp-skip cmp-ab" data-cmp="ab" aria-disabled="true" aria-label="First and second" data-tip="' + AB_TIP + '">' + AB_SVG + "</button>" +   // HERESY 2281
      '<span class="cmp-fill"></span>' +
      (rated ? '<button type="button" class="cmp-dis" data-cmp="dis" aria-pressed="' + !hideDis + '" aria-label="Disliked" data-tip="' + DIS_TIP + '">' + ico("dislike") + "</button>" : "") +   // HERESY 1995
      '<span class="cmp-cache cmp-mem" data-tip="Each version fetched whole into memory as the window opens: a switch plays from memory, not the network">' +   // HERESY 1621; 2044: a graph, its words in the tip
      '<svg class="cmp-mem-g" viewBox="0 0 60 20" aria-hidden="true"></svg><span class="cmp-mem-t"></span></span>' +
      "</div>" +
      '<ol class="cmp-list">' + versions.map(function (v, i) {
        return '<li class="cmp-li" data-cmp-li="' + i + '"><button type="button" class="cmp-row" data-cmp-i="' + i + '"><span class="cmp-n mono">' + (i < 9 ? i + 1 : "") + '</span><span class="cmp-name">' + esc(v.label) + '<span class="cmp-off mono" data-cmp-off="' + i + '" hidden></span></span>' +   // HERESY 2000: its lag
          '<span class="cmp-group">' + esc(v.group || "as YuE2 made it") + '</span><span class="cmp-lufs mono" data-cmp-lufs="' + i + '">\u2026</span><span class="cmp-dur mono">' + (v.seconds ? clock(v.seconds) : "") + "</span></button>" + PICK_HTML + rateHtml(v) + "</li>";   // 1550
      }).join("") + "</ol></div>";
    document.body.appendChild(back);
    var box = back.querySelector(".cmp-box"), wave = box.querySelector(".cmp-wave"), playBtn = box.querySelector(".cmp-play"), dragging = false;
    box.classList.toggle("is-tall", cmpGet(CMP_TALL) !== "0");
    // HERESY 2057 (Viktor: «куда подевалась кнопка вывода второго оверлея листовкой сравниваемых треков?»): in Blind the sheet hid with the titles; it stays
    // when every version has the same style and lyrics (it tells nothing apart then), its name masked
    if (hk.sheet) Promise.all(versions.map(function (v) { return v.take ? Promise.resolve(hk.sheet(v.take)).catch(function () { return null; }) : Promise.resolve(null); })).then(function (ds) {
      var key = function (d) { return d ? String(d.style || "") + "\u0000" + String(d.lyrics || "") : null; }, k0 = key(ds[0]);
      box.classList.toggle("sheet-same", k0 !== null && ds.every(function (d) { return key(d) === k0; }));
    });   // HERESY 2044; 2047: tall unless turned off
    if (cmpGet("yue2.cmpSpeed")) cmpPut("yue2.cmpSpeed", null);   // HERESY 2057: a speed kept by 2044d let go
    back.classList.toggle("is-wide", cmpGet(CMP_WIDE) === "1");
    // HERESY 1550: each version's loudness, and the louder ones turned down to the quietest while «Equal loudness» is on
    var lufs = versions.map(function () { return null; });
    function levels() {
      var on = false, known = lufs.filter(function (x) { return x != null; }), lo = known.length ? Math.min.apply(null, known) : null;
      audios.forEach(function (a, i) {
        var l = lufs[i], g = on && l != null && lo != null ? Math.pow(10, (lo - l) / 20) : 1, el = box.querySelector('[data-cmp-lufs="' + i + '"]');
        a.volume = Math.max(0, Math.min(1, g * Math.min(1, VOL.v)));   // HERESY 2044: the window's own volume
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

    // HERESY 2000: each version placed by its sound against the first; a lag shown on its row when it is the same music
    var offs = versions.map(function () { return 0; });
    function off(i) { return cmpGet(CMP_ALIGN) !== "0" ? offs[i] || 0 : 0; }
    (function () {
      var r0 = versions[0], rn = r0.take || (state.take && state.take.name) || "", rp = r0.take ? "" : r0.path || "";
      if (!rn) return;
      versions.forEach(function (v, i) {
        var nm = v.take || (state.take && state.take.name) || "", p = v.take ? "" : v.path || "";
        if (!i || !nm) return;
        fetch("/lab/align?name=" + encodeURIComponent(nm) + (p ? "&path=" + encodeURIComponent(p) : "") + "&ref=" + encodeURIComponent(rn) + (rp ? "&ref_path=" + encodeURIComponent(rp) : ""), { priority: "low" })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (j) {
            if (!j || !(j.likeness >= 0.6) || Math.abs(j.lag_ms) < 20 || !back.isConnected) return;
            offs[i] = j.lag_ms / 1000;
            var el = box.querySelector('[data-cmp-off="' + i + '"]');
            if (el) { el.textContent = (offs[i] > 0 ? "+" : "\u2212") + Math.abs(offs[i]).toFixed(2) + " s"; el.hidden = false; el.dataset.tip = tt("Its sound comes this much later than the first version's; a switch keeps the music"); }
          }, function () { /* no lab: by the clock */ });
      });
    })();
    // HERESY 2000: an A–B loop dragged on the ruler (kept in the first version's clock, so it follows the music), a click there takes it off
    var loopA = null, loopB = null, rDrag = null;
    // HERESY 2281 (Viktor 09.11.2026: «…чекбоксами или SVG иконкой выбираешь два семпла в сравнении, и получаешь тот же анализ и графы, что в ноде
    // Огранщика»): two versions picked on their rows, the first before and the second after (a third takes the oldest one's place), the strip's
    // button runs 1991's analyzer on them; each named as its row names it now, so Blind's letters while Blind is on
    var abPick = [];
    function abPaint() {
      Array.prototype.forEach.call(box.querySelectorAll("[data-cmp-pick]"), function (p) {
        var at = abPick.indexOf(+p.closest("[data-cmp-li]").dataset.cmpLi);
        p.setAttribute("aria-pressed", String(at >= 0));
        p.querySelector(".cmp-pick-n").textContent = at >= 0 ? String(at + 1) : "";
      });
      var abBtn = box.querySelector('[data-cmp="ab"]');
      if (abBtn) abBtn.setAttribute("aria-disabled", String(abPick.length < 2));
    }
    function abToggle(i) {
      var at = abPick.indexOf(i);
      if (at >= 0) abPick.splice(at, 1); else { abPick.push(i); if (abPick.length > 4) abPick.shift(); }   // HERESY 2286: up to four
      abPaint();
    }
    function abSide(i) {
      var v = versions[i], nm = box.querySelector('[data-cmp-li="' + i + '"] .cmp-name'), c = nm ? nm.cloneNode(true) : null;
      if (c) Array.prototype.forEach.call(c.querySelectorAll(".cmp-off"), function (x) { x.remove(); });
      return { name: v.take || (state.take && state.take.name) || "", path: v.take ? "" : v.path || "", label: (c ? c.textContent : "").trim() || v.label };
    }
    function abRun() {
      if (abPick.length < 2) return (window.HeresyToast || say)(tt("Pick two to four versions on their rows first"));
      abOpen(abPick.map(abSide));
    }
    // HERESY 2000: blind: the shown order of the versions (a digit and ↑ ↓ follow it)
    var order = versions.map(function (v, i) { return i; });
    var peaks = [];
    // HERESY 2037: +dB here too, the player's setting: a version that is a take played as loud as the old Peak clip made it (its own measure),
    // its peaks over that level red at the wave's edges; the graph made at the first touch inside the window while it is on
    var LD = { on: cmpGet("yue2.oldLoud") === "1", db: versions.map(function () { return 0; }), hot: versions.map(function () { return null; }), ctx: null, lim: null, gains: [] };
    // HERESY 2044: the window's volume, to 150 %: to 100 % the elements' own, past it the graph's gain with the limiter on
    var VOL = { v: 1, from: null }, volKept = parseFloat(cmpGet(CMP_VOL));
    if (isFinite(volKept)) VOL.v = Math.max(0, Math.min(1.5, volKept));
    audios.forEach(function (a) { a.volume = Math.min(1, VOL.v); });
    function ldGains() {
      LD.gains.forEach(function (g, i) { g.gain.value = (LD.on ? Math.pow(10, LD.db[i] / 20) : 1) * Math.max(1, VOL.v); });
      var held = LD.on || VOL.v > 1;
      if (LD.lim) { LD.lim.threshold.value = held ? -1 : 0; LD.lim.ratio.value = held ? 20 : 1; }
    }
    function ldWire() {
      if (LD.ctx || !(LD.on || VOL.v > 1)) return;
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        LD.ctx = new AC();
        LD.lim = LD.ctx.createDynamicsCompressor();
        LD.lim.knee.value = 0; LD.lim.attack.value = 0.002; LD.lim.release.value = 0.12;
        LD.lim.connect(LD.ctx.destination);
        LD.gains = audios.map(function (a) { var s = LD.ctx.createMediaElementSource(a), g = LD.ctx.createGain(); s.connect(g); g.connect(LD.lim); return g; });
      } catch (e) { LD.ctx = null; LD.gains = []; return; }
      ldGains();
    }
    function ldTouch() { if (LD.on || VOL.v > 1) ldWire(); if (LD.ctx && LD.ctx.state === "suspended") LD.ctx.resume(); }
    function ldPaint() {
      var b = box.querySelector('[data-cmp="loud"]'), db = LD.db[active] || 0;
      if (!b) return;
      b.setAttribute("aria-pressed", String(LD.on));
      (b.querySelector(".loud-t") || b).textContent = LD.on && db >= 0.05 && !box.classList.contains("is-blind") ? "+" + db.toFixed(1) + " dB" : "+dB";   // HERESY 2044b
    }
    versions.forEach(function (v, i) {
      if (!v.take) return;
      fetch("/lab/take/wave?name=" + encodeURIComponent(v.take) + "&n=600").then(function (r) { return r.ok ? r.json() : null; }).then(function (w) {
        if (!w) return;
        LD.hot[i] = { n: 600, hot: w.hot || [], flats: w.over > 0 ? [] : (w.flats || []) };
        LD.db[i] = w.cut > 0 && w.cut < 1 ? Math.min(6, -20 * Math.log10(w.cut)) : 0;
        ldGains(); ldPaint(); drawWave();
      }, function () { /* no lab: no marks, no +dB */ });
    });
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
      var n = audios.filter(function (a) { return a.dataset.cached === "1"; }).length, el = box.querySelector(".cmp-mem-t");   // HERESY 2044: the words under the graph, in its tip
      var mb = function (x) { return (x / 1048576).toFixed(x < 10485760 ? 1 : 0); }, have = (typeof got !== "undefined" ? got : []).reduce(function (s, x) { return s + x; }, 0),
          tot = (typeof size !== "undefined" ? size : []).reduce(function (s, x) { return s + x; }, 0);   // HERESY 1716: the megabytes in
      var words = (n === audios.length ? tt("all {0} in memory").replace("{0}", n) : tt("in memory: {0} of {1}").replace("{0}", n).replace("{1}", audios.length)) +
        (n < audios.length && have ? " \u00b7 " + (tot ? tt("{0} of {1} MB").replace("{0}", mb(have)).replace("{1}", mb(tot)) : tt("{0} MB").replace("{0}", mb(have))) : "");
      if (el) el.textContent = words;
      var wrap = box.querySelector(".cmp-mem");
      if (wrap) wrap.dataset.tip = words + " \u00b7 " + tt("Each version fetched whole into memory as the window opens: a switch plays from memory, not the network");
    }
    audios.forEach(function (a, i) { a.addEventListener("pause", function () { if (a === cur() && !a.ended) useCached(i); }); });   // HERESY 2044c: not at its end (the swap ate its «ended»)
    // HERESY 1716 (Viktor 22.10.2026: «Форсированную загрузку треков для сравнения, кеширование и прогресс бар, пока не загрузится, чтобы переключение
    // было моментальным»): every version fetched whole as the window opens, three at a time, the chosen one first, each read as it comes so a bar shows
    // the bytes and the line says the megabytes; a version streams as before only until its copy is in
    var got = versions.map(function () { return 0; }), size = versions.map(function () { return 0; });
    function paintLoad() {                               // HERESY 2044 (Viktor: «динамичный SVG граф 1x3… полупрозрачно… не кнопка, а статистика»): a column a version, filled as it comes
      var g = box.querySelector(".cmp-mem-g");
      if (!g) return;
      var n = versions.length, W = 60, H = 20, gap = n > 8 ? 1.5 : 4,   // HERESY 2044e: air between the columns
          cw = Math.max(1, (W - gap * (n - 1)) / n), out = "";
      for (var i = 0; i < n; i++) {
        var fr = cached[i] ? 1 : size[i] > 0 ? Math.min(1, got[i] / size[i]) : 0, x = (i * (cw + gap)).toFixed(2), fh = fr * H;
        out += '<rect class="cmp-mem-bg" x="' + x + '" y="0" width="' + cw.toFixed(2) + '" height="' + H + '" rx="1"/>' +
          '<rect class="cmp-mem-in' + (cached[i] ? " is-in" : "") + '" x="' + x + '" y="' + (H - fh).toFixed(2) + '" width="' + cw.toFixed(2) + '" height="' + fh.toFixed(2) + '" rx="1"/>';
      }
      g.innerHTML = out;
      box.querySelector(".cmp-mem").classList.toggle("is-full", cached.every(Boolean));
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
            fetchWhole(i).then(function (b) { if (!back.isConnected) return; cached[i] = URL.createObjectURL(b); useCached(i); wantPeaks(i); }, function () { /* this one streams as before */ })
              .then(function () { running--; paintCached(); paintLoad(); go(); });
          })(order[k++]);
        }
      };
      paintCached(); paintLoad(); go();
    })();
    function wantPeaks(i) {
      if (peaks[i] !== undefined) return;
      peaks[i] = null;
      cmpPeaks(cached[i] && !versions[i].take ? Object.assign({}, versions[i], { url: cached[i] }) : versions[i]).then(function (p) {   // HERESY 2094: a copy in memory read there
         peaks[i] = p && p.length ? p : "none"; drawWave(); }, function () { peaks[i] = "none"; drawWave(); });
    }
    // HERESY 2044 (Viktor: «где тектоника басов, а где сверлящая нежность верхов»): a take's three bands a stretch from the lab, each against the
    // take's own mean and squared to tell them apart, as shares: warm for the bass, amber for the middle, cold for the highs
    var bands = [], SPEC_LO = [214, 78, 52], SPEC_MID = [226, 168, 66], SPEC_HI = [92, 184, 236];
    function bandsNorm(B) {
      var mean = [0, 0, 0], k = 0;
      B.forEach(function (r) { if (r[0] + r[1] + r[2] > 0) { mean[0] += r[0]; mean[1] += r[1]; mean[2] += r[2]; k++; } });
      if (!k) return "none";
      mean = mean.map(function (x) { return x / k || 1e-6; });
      return B.map(function (r) {
        if (!(r[0] + r[1] + r[2] > 0)) return null;
        var w = r.map(function (x, j) { var q = x / mean[j]; return q * q; }), s = w[0] + w[1] + w[2];
        return s > 0 ? [w[0] / s, w[1] / s, w[2] / s] : null;
      });
    }
    function wantBands(i) {
      var v = versions[i];
      if (bands[i] !== undefined) return;
      if (!v.take) { bands[i] = "none"; return; }
      bands[i] = null;
      fetch("/lab/take/bands?name=" + encodeURIComponent(v.take) + "&n=600", { priority: "low" }).then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { bands[i] = j && j.bands && j.bands.length ? bandsNorm(j.bands) : "none"; drawWave(); }, function () { bands[i] = "none"; });
    }
    // HERESY 2044 (Viktor: «кнопка автоплея с текущего и до конца, повтор по кольцу, плей в перемешку. По умолчанию всё выключено здесь»)
    function modeOn(k) { return cmpGet(k) === "1"; }
    function modePaint() {
      [["playon", CMP_ON], ["ring", CMP_RING], ["shuffle", CMP_SHUF]].forEach(function (p) { var b = box.querySelector('[data-cmp="' + p[0] + '"]'); if (b) b.setAttribute("aria-pressed", String(modeOn(p[1]))); });
    }
    function modeFlip(which) {
      var k = which === "playon" ? CMP_ON : which === "ring" ? CMP_RING : CMP_SHUF, on = !modeOn(k);
      cmpPut(k, on ? "1" : null);
      if (on && k !== CMP_ON) cmpPut(CMP_ON, "1");               // Ring and Shuffle play on
      if (!on && k === CMP_ON) { cmpPut(CMP_RING, null); cmpPut(CMP_SHUF, null); }   // and go out with it
      if (k === CMP_SHUF) heard = {};
      modePaint();
    }
    var heard = {};                                      // Shuffle: the versions heard in this round
    function nextUp() {                                  // the version after the one that ended, by the shown order; null at the end without Ring
      var list = order.filter(function (i) { return shown(i); });
      if (!list.length) return null;
      if (modeOn(CMP_SHUF)) {
        heard[active] = true;
        var left = list.filter(function (i) { return !heard[i]; });
        if (!left.length) {
          if (!modeOn(CMP_RING)) return null;
          heard = {}; heard[active] = true;
          left = list.filter(function (i) { return i !== active; });
          if (!left.length) return active;
        }
        return left[Math.floor(Math.random() * left.length)];
      }
      var at = list.indexOf(active);
      if (at < list.length - 1) return list[at + 1];
      return modeOn(CMP_RING) ? list[0] : null;
    }
    // HERESY 2094 (Viktor 05.11.2026: «зафиксим скейл волны с максимальным пиком в 4–6 dB… градации по dB прорисовать слева от волны и 1px рисочки
    // светлосерые через всю волну как слой-подложку. Мега плееры не трогаем»): every version drawn on one scale, not each against its own loudest peak (a
    // quieter original looked as «fat» as the decoders): the top a whole dB 4 to 5 dB over the loudest peak among the versions loaded (the server's peaks
    // and the page's own read are both full-scale levels); marks every 6 dB under the top, at the wave's left (.cmp-db), their lines 1 px under the bars
    // HERESY 2096 (Viktor 05.11.2026: «волна x2 даже меньше, чем раньше. И много свободного места сверху и снизу. Увеличь её на 10px сверху и
    // снизу»): the top 2 to 3 dB over the loudest peak (was 4 to 5): in the double-height box its bars reach 10 to 15 px further each way
    function scaleTop() {
      var top = 0;
      peaks.forEach(function (p) { if (p && p !== "none") for (var k = 0; k < p.length; k++) if (p[k] > top) top = p[k]; });
      if (!(top > 0)) return { amp: 1, db: 0 };
      var db = Math.ceil(20 * Math.log10(top) + 2);   // HERESY 2096
      return { amp: Math.pow(10, db / 20), db: db };
    }
    var dbKey = "";
    function dbMarks(ctx, w, h, top, dim) {
      var half = (h - 6) / 2, mid = h / 2, marks = [];
      for (var m = Math.floor((top.db - 1) / 6) * 6; m > top.db - 96; m -= 6) {
        var off = half * Math.pow(10, (m - top.db) / 20);
        if (off < 5) break;
        marks.push([m, off]);
      }
      ctx.globalAlpha = 0.3; ctx.fillStyle = dim;
      marks.forEach(function (mk) { ctx.fillRect(0, Math.round(mid - mk[1]), w, 1); ctx.fillRect(0, Math.round(mid + mk[1]) - 1, w, 1); });
      ctx.globalAlpha = 1;
      var el = box.querySelector(".cmp-db"), key = h + ":" + top.db;
      if (el && key !== dbKey) {
        dbKey = key;
        var lastY = -1e9;   // HERESY 2096: a label that would touch the one above it is left out (its line stays)
        el.innerHTML = marks.filter(function (mk) { var y = Math.round(mid - mk[1]); if (y - lastY < 10) return false; lastY = y; return true; }).map(function (mk) {
          return '<i style="top:' + Math.round(mid - mk[1]) + 'px">' + (mk[0] > 0 ? "+" + mk[0] : mk[0] < 0 ? "\u2212" + -mk[0] : "0") + "</i>";
        }).join("");
      }
      return marks;
    }
    function drawWave() {
      gripPaint();                                       // HERESY 2289
      var w = wave.clientWidth, h = wave.clientHeight, dpr = window.devicePixelRatio || 1;
      if (!w || !h) return;
      if (wave.width !== Math.round(w * dpr) || wave.height !== Math.round(h * dpr)) { wave.width = Math.round(w * dpr); wave.height = Math.round(h * dpr); }
      var ctx = wave.getContext("2d"), css = getComputedStyle(box), p = peaks[active], d = dur(), at = d ? Math.min(1, (cur().currentTime || 0) / d) : 0;
      var lit = css.getPropertyValue("--amber").trim() || "#d9a441", dim = css.getPropertyValue("--dim").trim() || "#888";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      if (!p || p === "none") {
        if (dbKey) { dbKey = ""; var dbEl = box.querySelector(".cmp-db"); if (dbEl) dbEl.innerHTML = ""; }   // HERESY 2094: no wave, no marks
        ctx.fillStyle = dim; ctx.fillRect(0, h / 2 - 0.5, w, 1);
        ctx.fillStyle = lit; ctx.fillRect(0, h / 2 - 1, w * at, 2);
      } else {
        var k, top = scaleTop(), max = top.amp;   // HERESY 2094: one scale for every version, its marks under the bars
        dbMarks(ctx, w, h, top, dim);
        var bars = Math.max(1, Math.floor(w / 3)), SB = cmpGet(CMP_SPEC) === "1" ? bands[active] : null;   // HERESY 2044: the bands' colours
        if (SB === "none") SB = null;
        for (var x = 0; x < bars; x++) {
          var k0 = Math.floor(x * p.length / bars), k1 = Math.max(k0 + 1, Math.floor((x + 1) * p.length / bars)), m = 0;
          for (k = k0; k < k1 && k < p.length; k++) if (p[k] > m) m = p[k];
          var bh = Math.max(1, m / max * (h - 6)), played = (x + 0.5) / bars <= at, col = null;
          if (SB) {
            var q0 = Math.floor(x * SB.length / bars), q1 = Math.max(q0 + 1, Math.floor((x + 1) * SB.length / bars)), cl = 0, cm = 0, ch = 0, cn = 0;
            for (var q = q0; q < q1 && q < SB.length; q++) if (SB[q]) { cl += SB[q][0]; cm += SB[q][1]; ch += SB[q][2]; cn++; }
            if (cn) col = "rgb(" + [0, 1, 2].map(function (c) { return Math.round((cl * SPEC_LO[c] + cm * SPEC_MID[c] + ch * SPEC_HI[c]) / cn); }).join(",") + ")";
          }
          ctx.fillStyle = col || (played ? lit : dim);
          ctx.globalAlpha = col && !played ? 0.45 : 1;
          ctx.fillRect(x * 3, (h - bh) / 2, 2, bh);
          ctx.globalAlpha = 1;
        }
        var H = LD.hot[active];                           // HERESY 2037: over the old cut's level, red at the top (2053); a flat top cut before 2007, amber
        if (H) {
          var hw = Math.max(1, Math.ceil(w / H.n)), bad = css.getPropertyValue("--bad").trim() || "#d0563c";
          [[H.flats, lit], [H.hot, bad]].forEach(function (mk2) {
            ctx.fillStyle = mk2[1];
            mk2[0].forEach(function (i) { var hx = Math.floor(i / H.n * w); ctx.fillRect(hx, 0, hw, 3); });   // HERESY 2053: at the top only
          });
        }
      }
      if (loopA != null && d) {                         // HERESY 2000: the loop's stretch
        var la = (loopA + off(active)) / d, lb = (loopB + off(active)) / d;
        ctx.globalAlpha = 0.16; ctx.fillStyle = lit; ctx.fillRect(Math.round(w * la), 0, Math.max(2, Math.round(w * (lb - la))), h); ctx.globalAlpha = 1;
      }
      if (d) {                                           // HERESY 2000: its marked moments; 2296: each with its time to the millisecond, a stretch a band
        var band = css.getPropertyValue("--patina").trim() || "#6fb3a8", lastX = -1e9;
        var bandDraw = function (a, b, alpha) {
          var x0 = Math.round(w * Math.min(1, a / d)), bw = Math.max(2, Math.round(w * Math.min(1, b / d)) - x0);
          ctx.fillStyle = band; ctx.globalAlpha = alpha; ctx.fillRect(x0, 0, bw, h);
          ctx.globalAlpha = 0.85; ctx.fillRect(x0, 0, bw, 3); ctx.globalAlpha = 1; ctx.fillRect(x0, 0, 1, h); ctx.fillRect(x0 + bw - 1, 0, 1, h);
          return x0;
        };
        ctx.font = "10px " + (css.getPropertyValue("--mono").trim() || "monospace"); ctx.textBaseline = "top";
        marksNow().sort(function (p, q) { return p.t - q.t; }).forEach(function (k) {
          var lx, label;
          if (k.e != null) { lx = bandDraw(k.t, k.e, 0.14) + 3; label = clockMs(k.t) + "\u2013" + clockMs(k.e); ctx.fillStyle = band; }
          else {
            var mx = Math.round(w * Math.min(1, k.t / d));
            ctx.fillStyle = lit; ctx.fillRect(mx, 0, 1, h);
            ctx.beginPath(); ctx.moveTo(mx, 0); ctx.lineTo(mx + 7, 3.5); ctx.lineTo(mx, 7); ctx.closePath(); ctx.fill();
            lx = mx + 9; label = clockMs(k.t);
          }
          var tw = ctx.measureText(label).width;
          if (lx > lastX + 4 && lx + tw <= w) { ctx.fillText(label, lx, k.e != null ? 5 : 0); lastX = lx + tw; }
        });
        var sel = segDrag || segPend;
        if (sel) bandDraw(Math.min(sel.a, sel.b), Math.max(sel.a, sel.b), 0.26);
      }
      ctx.fillStyle = lit; ctx.fillRect(Math.round(w * at) - 1, 0, 2, h);
      drawRuler();
    }
    function drawRuler() {                               // HERESY 1995
      var c = box.querySelector(".cmp-ruler"), w = c ? c.clientWidth : 0, h = c ? c.clientHeight : 0, dpr = window.devicePixelRatio || 1, d = dur();
      if (!w || !h) return;
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
      var ctx = c.getContext("2d"), css = getComputedStyle(box), ink = css.getPropertyValue("--muted").trim() || "#777", dim = css.getPropertyValue("--dim").trim() || "#aaa";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      if (!d) return;
      var pps = w / d, LEN = [0, 0.22, 0.42, 0.6, 1];
      ctx.font = "10.5px " + (css.getPropertyValue("--mono").trim() || "monospace");
      ctx.textBaseline = "bottom";
      cmpTicks(d, w).forEach(function (tk) {
        var x = Math.min(w - 1, Math.round(tk[0] * pps));
        ctx.fillStyle = tk[1] >= 2 ? ink : dim;
        ctx.fillRect(x, 0, 1, Math.round(LEN[tk[1]] * (h - 1)));
        if (tk[0] && (tk[1] === 4 || (tk[1] === 3 && pps * 30 >= 70))) { ctx.fillStyle = ink; ctx.fillText(clock(tk[0]), x + 3, h); }
      });
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
        if (nb) { var nt = noteOf(v); nb.setAttribute("aria-pressed", String(!!nt)); nb.dataset.tip = nt ? (nt.length > 1200 ? nt.slice(0, 1200) + "\n\u2026" : nt) : "A note on this take"; }   // HERESY 2043: 600, not 160; 2404: 1200
      });
      if (!shown(active)) {                                 // the one playing disliked and hidden: the next shown one goes on from its second
        for (var k = 1; k < versions.length; k++) { var j = (active + k) % versions.length; if (shown(j)) { pick(j); break; } }
      }
    }
    // HERESY 2362 (Viktor 11.11.2026: «Синхронизация сравнителя с мегаплеером… принял твоё решение. Так и сделай»): the footer's player under the veil
    // follows this window's clock without playing: the version in hand (a take; not Blind, its name would say which) loaded there paused, its wave,
    // playhead and time moving with this window's, the live spectrum hearing this window (2357); closed, the player goes on from this second in the same
    // moment, or stands paused there when this window was paused. One sound: this window's, then the player's
    function followMain() {
      if (!hk.follow || !back.isConnected) return;
      var v = versions[active], a = cur();
      hk.follow(v && v.take && !box.classList.contains("is-blind") ? v.take : "", a.readyState >= 1 ? (a.currentTime || 0) : lastT, !a.paused && !a.ended);
    }
    function paint() {
      var a = cur(), d = dur();
      if (a.readyState >= 1) lastT = a.currentTime || 0;
      playBtn.innerHTML = ico(a.paused ? "play" : "pause");
      playBtn.setAttribute("aria-label", a.paused ? "Play" : "Pause");
      box.querySelector(".cmp-time").textContent = clock(a.currentTime || 0) + " / " + (d ? clock(d) : "0:00");   // HERESY 1724
      wave.setAttribute("aria-valuenow", String(Math.round(a.currentTime || 0)));
      box.dataset.t = (a.currentTime || 0).toFixed(2);   // HERESY 2285: the playhead to the hundredth, for the checks
      var nowEl = box.querySelector(".cmp-now"), nowName = box.querySelector('[data-cmp-li="' + active + '"] .cmp-name');   // HERESY 2043: the head names it
      if (nowEl) nowEl.textContent = nowName ? " \u00b7 " + nowName.textContent : "";
      Array.prototype.forEach.call(box.querySelectorAll(".cmp-row"), function (r) {   // HERESY 2033: by the version a row holds, not its place (blind shuffles)
        var on = +r.dataset.cmpI === active;
        r.classList.toggle("is-on", on);
        r.classList.toggle("is-playing", on && !a.paused);
      });
      wantPeaks(active);
      if (cmpGet(CMP_SPEC) === "1") wantBands(active);  // HERESY 2044
      drawWave();
      ldPaint();                                         // HERESY 2037
      followMain();                                      // HERESY 2362
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
      var sbOn = box.querySelector('[data-cmp="sheet"]'); if (sbOn) sbOn.setAttribute("aria-pressed", "true");   // HERESY 2043
      el.querySelector(".cmp-sheet-name").textContent = box.classList.contains("is-blind") && !cmpIsOrig(v) ? "\ud83e\udee3" : v.label;   // HERESY 2057: Blind, its name masked; 2063: an original's shown
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
      var sbOff = box.querySelector('[data-cmp="sheet"]'); if (sbOff) sbOff.setAttribute("aria-pressed", "false");   // HERESY 2043
      requestAnimationFrame(drawWave);
      box.focus();
    }
    function pick(i) {
      if (i < 0 || i >= audios.length || i === active) return;
      if (sheet && versions[i].take) sheetFill(i);       // HERESY 1872: the sheet follows the version playing
      var from = cur(), to = audios[i], t = from.readyState >= 1 ? (from.currentTime || 0) : lastT, playing = !from.paused;
      var tFrom = t;
      t = cmpStartAt(t, isFinite(from.duration) ? from.duration : 0, from.ended, cmpKeep());   // HERESY 1995
      if (t > 0) t = cmpShift(t, off(active), off(i));   // HERESY 2000: the same music's second, not the clock's
      // HERESY 2285 (Viktor 09.11.2026: «Когда в сравнителе выключена синхронизация по времени, риска выскакивает из сегмента выделения и становится на ноль в
      // другом треке. Это закон — держать риску в сегменте по всем переключениям и режимам синхронизации», and then: «При отключенном синхроне в сегменте …
      // должна спрыгивать в таком режиме без синхронизации по таймстемпам на начало сегмента, вровень повторяя общую задумку, а когда синхронизация включена,
      // двигаться при перемещении по трекам как задумано, синхронизируясь»): a loop on, a switch (a click, a digit, ↑ ↓, Blind or not) lands in it: with Keep
      // the second off at its start, as a switch without a loop starts from the start; with it on at the same second of the music (Sync by sound's lag
      // when that is on), and at the loop's start when that second is out of the loop
      if (loopA != null) {
        var LA = loopA + off(i), LB = loopB + off(i), tm = cmpShift(tFrom, off(active), off(i));
        t = cmpKeep() && tm >= LA && tm < LB - 0.05 ? tm : LA;
      }
      lastT = t;
      var place = function () { try { to.currentTime = Math.min(t, isFinite(to.duration) ? Math.max(0, to.duration - 0.05) : t); } catch (e) { /* not seekable yet */ } };
      active = i;
      if (to.readyState >= 1) place(); else to.addEventListener("loadedmetadata", place, { once: true });
      if (playing) {
        to.play().then(settle, settle);
      } else { from.pause(); }
      paint();
    }
    // HERESY 2092 (Viktor 05.11.2026: «в Compare очень часто, по факту загрузки треков не начинается проигрывание, висит кнопка в проигрывание, но нужно два
    // раза кликнуть»): a play that does not take is played again. A version whose source failed (an error, no source: the Opus stream's seeks answered 416
    // over the engine, 2088) takes its copy in memory, or its address again, before it plays; a version at its end plays from its start (the swap to
    // memory as it stopped kept it there, so a click played nothing and only the second began again); a play a load cut short (AbortError: the swap
    // under it) goes again once the version can play, while the window still means to play (Pause means it no longer does)
    var wantPlay = false;
    function playNow(a) {
      wantPlay = true;
      var i = audios.indexOf(a);
      if (a.error || a.networkState === 3) {
        if (i >= 0 && cached[i] && a.getAttribute("src") !== cached[i]) {
          var t0 = lastT;
          a.src = cached[i]; a.dataset.cached = "1";
          if (t0) a.addEventListener("loadedmetadata", function () { try { a.currentTime = isFinite(a.duration) && t0 >= a.duration - 0.25 ? 0 : t0; } catch (e) { /* not seekable yet */ } }, { once: true });
          paintCached();
        } else a.load();
      }
      var d = a.duration;                            // at its end (its copy swapped in there as it stopped): from the start, as a switch does (1995)
      if (isFinite(d) && d > 0 && (a.ended || a.currentTime >= d - 0.25)) { try { a.currentTime = 0; } catch (e) { /* not seekable yet */ } }
      return a.play().catch(function (e) {
        if (!e || e.name !== "AbortError") return;
        a.addEventListener("canplay", function () { if (wantPlay && a === cur() && a.paused) a.play().catch(function () {}); }, { once: true });
      });
    }
    function toggle() { var a = cur(); if (a.paused) playNow(a); else { wantPlay = false; a.pause(); } paint(); }
    function close() {
      var v0 = versions[active], a0 = cur(), on0 = !a0.paused && !a0.ended,   // HERESY 2044: a take playing goes on in the player (not blind: its name would say which)
          handBack = v0 && v0.take && hk.takeOver && !box.classList.contains("is-blind") && (on0 || hk.follow) ? { name: v0.take, at: a0.readyState >= 1 ? (a0.currentTime || 0) : lastT, play: on0 } : null;   // HERESY 2362: a paused one too, paused there
      clearInterval(tick);                               // HERESY 2362: the hand-over first: this window silent and the player on in the same moment
      audios.forEach(function (a) { a.pause(); });
      if (handBack) hk.takeOver(handBack.name, handBack.at, handBack.play); else if (hk.follow) hk.follow("", 0, false);
      if (sheet && sheet.ro) sheet.ro.disconnect();     // HERESY 1872
      sheet = null;
      setTimeout(function () {                           // HERESY 2362: after the hand-over's task, so the player's start waits for none of it
        audios.forEach(function (a) { a.pause(); a.removeAttribute("src"); a.load(); });
        cached.forEach(function (u) { if (u) URL.revokeObjectURL(u); });   // HERESY 1621: the memory given back
      }, 0);
      document.removeEventListener("keydown", key, true);
      window.removeEventListener("resize", drawWave);
      clearInterval(tick);
      back.remove();
    }
    function key(e) {
      ldTouch();                                         // HERESY 2037
      if (document.querySelector(".hd-back")) return;   // HERESY 1724: a dialog over the window (the note) has the keys
      var shOver = document.getElementById("collSheet");   // HERESY 2043: the sheet or the datasheet opened over it close first
      if (document.querySelector(".ds-back") || (shOver && !shOver.hidden)) return;
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); if (loopA != null) { loopA = loopB = null; return drawWave(); } return sheet ? sheetClose() : close(); }   // HERESY 1872: the sheet first; 2000: the loop before it
      if (e.target && box.contains(e.target) && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && e.target.type !== "checkbox") return;
      if (e.target && e.target.dataset && e.target.dataset.grip && loopA != null && gripKey(e)) return;   // HERESY 2289: a grip in focus moves its edge
      if (e.key === " ") { e.preventDefault(); return toggle(); }
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); var a = cur(), t5 = a.currentTime || 0; a.currentTime = inLoop(t5, Math.max(0, t5 + (e.key === "ArrowRight" ? 5 : -5))); return paint(); }   // HERESY 2279: inside the loop
      if (/^[1-9]$/.test(e.key)) { e.preventDefault(); var vi = order[+e.key - 1]; if (vi != null && shown(vi)) pick(vi); }   // HERESY 2000: by the shown order
      if (e.key === "m" || e.key === "M") { e.preventDefault(); return markMoment(); }
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {   // HERESY 1982 (Viktor 01.11.2026): the next or the previous version, as its digit picks it
        e.preventDefault();
        var n = audios.length, d = e.key === "ArrowDown" ? 1 : -1, at0 = order.indexOf(active);   // HERESY 2000: by the shown order
        for (var j = 1; j < n; j++) { var k = order[((at0 + d * j) % n + n) % n]; if (shown(k)) { pick(k); break; } }
      }
    }
    var seekAt = function (e) {
      var r = wave.getBoundingClientRect(), d = dur();
      if (!d || !r.width) return;
      cur().currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * d;
      paint();
    };
    // HERESY 2296: a stretch flagged by Shift+drag on the wave (a plain drag seeks), its band's top (12 px) plays it once, or loops it with Ring on; a double
    // click on a flag or in a band asks its word again (empty takes it away); the time read where the pointer is, to the millisecond
    var segDrag = null, segPend = null, bandStop = null;
    function marksNow() { return cmpMarkLines(noteOf(versions[active])); }
    function waveT(e) { var r = wave.getBoundingClientRect(), d = dur(); return d && r.width ? Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * d : 0; }
    function flagAt(e) {
      var r = wave.getBoundingClientRect(), d = dur(), near = null;
      if (d && r.width) marksNow().forEach(function (k) { if (k.e == null && Math.abs(k.t / d * r.width - (e.clientX - r.left)) <= 5) near = k; });
      return near;
    }
    function bandAt(e, capOnly) {
      var r = wave.getBoundingClientRect(), d = dur(), hit = null;
      if (!d || !r.width || (capOnly && e.clientY - r.top > 12)) return null;
      var t = waveT(e), pad = 3 / r.width * d;
      marksNow().forEach(function (k) { if (k.e != null && t >= k.t - pad && t <= k.e + pad) hit = k; });
      return hit;
    }
    function spanOf(k) { return k.e != null ? clockMs(k.t) + "\u2013" + clockMs(k.e) : clockMs(k.t); }
    function playBand(k) {
      var a = cur(), o = off(active);
      if (modeOn(CMP_RING)) { loopA = Math.max(0, k.t - o); loopB = Math.max(loopA + 0.05, k.e - o); bandStop = null; }
      else { loopA = loopB = null; bandStop = { i: active, e: k.e }; }
      try { a.currentTime = k.t; } catch (x) { /* not seekable yet */ }
      if (a.paused) playNow(a);
      paintLoop(); paint();
    }
    function addMarkLine(v, line) {
      var note = noteOf(v), p = hk.setNote(v.take, note ? note.replace(/\s+$/, "") + "\n" + line : line);
      var done = function () { paintRates(); drawWave(); box.focus(); };
      if (p && p.then) p.then(done, done); else done();
    }
    function flagStretch(a, b) {
      var v = versions[active];
      if (!v.take || !hk.setNote) { (window.HeresyToast || say)(tt("A moment is marked in a take's note: this version is a file of a tree")); return; }
      var span = clockMs(a) + "\u2013" + clockMs(b);
      segPend = { a: a, b: b }; drawWave();
      window.HeresyDialog.prompt(tt("Flag this stretch {0}").replace("{0}", span) + "\n\n" + tt("A word or two: it goes into the take's note as a line with the stretch's start and end, and a shaded band stands on the wave; a click on the band's top plays it."), "",
        { ok: tt("Flag it"), max: 200 }).then(function (word) {
          segPend = null;
          if (word === null) { drawWave(); return box.focus(); }
          addMarkLine(v, span + " \u2014 " + (String(word).trim() || "\u2605"));
        });
    }
    function editFlag(k) {
      var v = versions[active];
      if (!v.take || !hk.setNote) return;
      window.HeresyDialog.prompt(tt("Change the flag at {0}").replace("{0}", spanOf(k)) + "\n\n" + tt("Its word, or empty to take the flag away."), k.word,
        { ok: tt("Keep it"), max: 200 }).then(function (word) {
          if (word === null) return box.focus();
          var lines = noteOf(v).split("\n"), ln = lines[k.line] || "", w = String(word).trim();
          if (!MARK_RE.test(ln.replace(/\r$/, ""))) return box.focus();   // the note changed meanwhile: its line is not there
          if (w) lines[k.line] = ln.replace(/\s+\u2014[\s\S]*$/, "") + " \u2014 " + w; else lines.splice(k.line, 1);
          var p = hk.setNote(v.take, lines.join("\n")), done = function () { paintRates(); drawWave(); box.focus(); };
          if (p && p.then) p.then(done, done); else done();
        });
    }
    function segUp() {
      var sd = segDrag; segDrag = null; drawWave();
      if (!sd) return;
      var a = Math.min(sd.a, sd.b), b = Math.max(sd.a, sd.b);
      if (b - a >= 0.05) flagStretch(a, b);
    }
    wave.addEventListener("pointerdown", function (e) {
      bandStop = null;
      if (e.button === 0 && e.shiftKey) { var t0 = waveT(e); segDrag = { a: t0, b: t0 }; try { wave.setPointerCapture(e.pointerId); } catch (x) { /* none */ } return drawWave(); }
      var bd = e.button === 0 ? bandAt(e, true) : null;
      if (bd) return playBand(bd);
      dragging = true; try { wave.setPointerCapture(e.pointerId); } catch (x) { /* none */ } seekAt(e);
    });
    wave.addEventListener("pointermove", function (e) { if (segDrag) { segDrag.b = waveT(e); return drawWave(); } if (dragging) seekAt(e); });
    wave.addEventListener("pointerup", function () { dragging = false; if (segDrag) segUp(); });
    wave.addEventListener("dblclick", function (e) { var k = flagAt(e) || bandAt(e, false); if (k) { e.preventDefault(); editFlag(k); } });
    var hov = box.querySelector(".cmp-hover");          // HERESY 1995: the second under the pointer
    wave.addEventListener("pointermove", function (e) {
      var r = wave.getBoundingClientRect(), d = dur();
      if (!d || !r.width) return;
      var fr = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), near = flagAt(e) || bandAt(e, false);   // HERESY 2000: a mark's word; 2296: a stretch's too
      hov.textContent = segDrag ? clockMs(Math.min(segDrag.a, segDrag.b)) + "\u2013" + clockMs(Math.max(segDrag.a, segDrag.b)) : near ? spanOf(near) + " \u2014 " + near.word : clock(fr * d);
      hov.hidden = false; hov.style.left = Math.round(fr * r.width) + "px";
    });
    // HERESY 2000: the A–B loop on the ruler: dragged, it loops the stretch (in the first version's clock, so a switch keeps it on the music)
    var ruler = box.querySelector(".cmp-ruler");
    ruler.dataset.tip = tt("Drag here for an A–B loop; a click here or Esc takes it off");
    function rulerT(e) { var r = ruler.getBoundingClientRect(), d = dur(); return d && r.width ? Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * d : 0; }
    function paintLoop() { box.dataset.loop = loopA == null ? "" : loopA.toFixed(2) + "-" + loopB.toFixed(2); drawWave(); }
    // HERESY 2279 (Viktor 09.11.2026: «как только выделил сегмент, риска сразу в него, и кнопками влево/вправо пять секунд перемотку, и ни в коем случае, чтобы
    // клавиши не выгоняли риску из сегмента»): a step of the arrows or of ⏪ ⏩ while a loop is on stays in it: past its end it goes round to its start, before
    // its start it stops there, and from outside the loop (a click on the wave out of it) it comes to the start; without a loop the step as it was
    function inLoop(t, to) {
      if (loopA == null) return to;
      var A = loopA + off(active), B = loopB + off(active);
      if (t < A - 0.05 || t > B + 0.05) return A;
      return to >= B - 0.05 ? A : Math.max(A, to);
    }
    ruler.addEventListener("pointerdown", function (e) { rDrag = { a: rulerT(e), moved: false }; try { ruler.setPointerCapture(e.pointerId); } catch (x) { /* none */ } });
    ruler.addEventListener("pointermove", function (e) {
      if (!rDrag) return;
      var tq = rulerT(e);
      if (Math.abs(tq - rDrag.a) < 0.25) return;
      rDrag.moved = true;
      loopA = Math.min(rDrag.a, tq) - off(active); loopB = Math.max(rDrag.a, tq) - off(active);
      paintLoop();
    });
    // HERESY 2279: a loop made (either way, to the very end too) takes the playhead to its start at once, playing on if it played (before, only a playhead
    // out of it moved: one at the end, where a loop dragged to the end also ends, stayed there); a lost capture ends the drag as the release does
    function rulerUp() {
      if (!rDrag) return;
      if (!rDrag.moved) { loopA = loopB = null; }
      else if (loopA != null) { try { cur().currentTime = loopA + off(active); } catch (x) { /* not seekable yet */ } paint(); }
      rDrag = null;
      paintLoop();
    }
    ruler.addEventListener("pointerup", rulerUp);
    ruler.addEventListener("lostpointercapture", rulerUp);
    // HERESY 2289 (Viktor 09.11.2026: «На края (левый и правый) сегмента выделения прикрути шторки для сдвига краёв вправо/влево»): a grip on each edge of
    // the loop, dragged to move that edge (a quarter of a second from the other at least), or ← → while it has the focus (0.1 s, Shift 1 s); the playhead
    // kept in the loop as its edges move (2285's law): one an edge passes is put at the nearest second inside
    function gripPaint() {
      var d = dur();
      Array.prototype.forEach.call(box.querySelectorAll(".cmp-grip"), function (g) {
        var on = loopA != null && d > 0;
        g.hidden = !on;
        if (on) { var t = (g.dataset.grip === "a" ? loopA : loopB) + off(active); g.style.left = (Math.max(0, Math.min(1, t / d)) * 100) + "%"; g.setAttribute("aria-valuenow", t.toFixed(1)); }
      });
    }
    function gripTo(which, t) {                         // t in the playing version's clock
      var d = dur(), o = off(active);
      if (which === "a") loopA = Math.max(0, Math.min(t - o, loopB - 0.25));
      else loopB = Math.min(Math.max(t - o, loopA + 0.25), Math.max(loopA + 0.25, d - o));
      var a = cur(), A = loopA + o, B = loopB + o, at = a.currentTime || 0;
      try { if (at < A) a.currentTime = A; else if (at > B) a.currentTime = Math.max(A, B - 0.05); } catch (x) { /* not seekable yet */ }
      paintLoop(); paint();
    }
    var gDrag = null;
    Array.prototype.forEach.call(box.querySelectorAll(".cmp-grip"), function (g) {
      g.addEventListener("pointerdown", function (e) { e.preventDefault(); e.stopPropagation(); gDrag = g.dataset.grip; try { g.setPointerCapture(e.pointerId); } catch (x) { /* none */ } g.focus(); });
      g.addEventListener("pointermove", function (e) {
        if (gDrag !== g.dataset.grip) return;
        var r = wave.getBoundingClientRect(), d = dur();
        if (d && r.width) gripTo(gDrag, Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * d);
      });
      var up = function () { gDrag = null; };
      g.addEventListener("pointerup", up); g.addEventListener("lostpointercapture", up);
    });
    function gripKey(e) {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return false;
      e.preventDefault();
      var which = e.target.dataset.grip;
      gripTo(which, (which === "a" ? loopA : loopB) + off(active) + (e.key === "ArrowRight" ? 1 : -1) * (e.shiftKey ? 1 : 0.1));
      return true;
    }
    (function keepLoop() {
      if (!back.isConnected) return;
      if (loopA != null) { var a = cur(), B = loopB + off(active); if (!a.paused && a.currentTime >= B) a.currentTime = loopA + off(active); }
      if (bandStop) {                                    // HERESY 2296: a stretch played once ends at its end
        var ab = cur();
        if (bandStop.i !== active || loopA != null) bandStop = null;
        else if (!ab.paused && ab.currentTime >= bandStop.e) { bandStop = null; wantPlay = false; ab.pause(); try { ab.currentTime = ab.currentTime; } catch (x) { /* none */ } paint(); }
      }
      requestAnimationFrame(keepLoop);
    })();
    // HERESY 2000: blind: shuffled, named A, B, C…, what tells them apart hidden (the CSS); off, the names and the order back
    function setBlind(on) {
      var list = box.querySelector(".cmp-list");
      if (on && sheet && !box.classList.contains("sheet-same")) sheetClose();   // HERESY 2057: a sheet that would tell them apart goes
      // HERESY 2063 (Viktor 05.11.2026: «если есть в названии трека `the original`, мы не скрываем его, а тасуем только остальные, что выбраны. Тогда я точно буду видеть, где оригинал в слепой прослушке»):
      // the originals first, as they are (their name, their group, their whole row); only the others shuffled and named A, B, C…
      var all = versions.map(function (v, i) { return i; }), origs = on ? all.filter(function (i) { return cmpIsOrig(versions[i]); }) : [];
      var rest = all.filter(function (i) { return origs.indexOf(i) < 0; });
      if (on) for (var k = rest.length - 1; k > 0; k--) { var j = Math.floor(Math.random() * (k + 1)), x = rest[k]; rest[k] = rest[j]; rest[j] = x; }
      order = origs.concat(rest);
      order.forEach(function (vi, pos) {
        var li = list.querySelector('[data-cmp-li="' + vi + '"]'), nm = li.querySelector(".cmp-name"), orig = origs.indexOf(vi) >= 0;
        list.appendChild(li);
        li.classList.toggle("is-orig", orig);
        li.querySelector(".cmp-n").textContent = pos < 9 ? pos + 1 : "";
        if (nm.dataset.real == null) nm.dataset.real = nm.innerHTML;
        nm.innerHTML = on && !orig ? esc(tt("Version {0}").replace("{0}", String.fromCharCode(65 + (pos - origs.length) % 26))) : nm.dataset.real;
      });
      box.classList.toggle("is-blind", on);
      // HERESY 2074 (Viktor 05.11.2026: «Давай, быстрецом гоним всё до и для среза 2.0.6»): a sheet 2057 keeps (every version has the same style and lyrics) is not
      // shut here after all; its name masked in Blind (an original's shown, 2063) and back when Blind is off
      if (sheet) sheet.el.querySelector(".cmp-sheet-name").textContent = on && !cmpIsOrig(versions[sheet.i]) ? "\ud83e\udee3" : versions[sheet.i].label;
    }
    // HERESY 2000: a moment marked: a word at this second into the take's note, «1:23 — the word», a flag on the wave
    function markMoment() {
      var v = versions[active], a = cur(), at = a.currentTime || 0;
      if (!v.take || !hk.setNote) { (window.HeresyToast || say)(tt("A moment is marked in a take's note: this version is a file of a tree")); return; }
      window.HeresyDialog.prompt(tt("Mark this moment at {0}").replace("{0}", clockMs(at)) + "\n\n" + tt("A word or two: it goes into the take's note as a line with its second, and a flag stands on the wave."), "",
        { ok: tt("Mark it"), max: 200 }).then(function (word) {
          if (word === null) return box.focus();
          addMarkLine(v, clockMs(at) + " \u2014 " + (String(word).trim() || "\u2605"));   // HERESY 2296: to the millisecond
        });
    }
    wave.addEventListener("pointerleave", function () { hov.hidden = true; });
    box.addEventListener("contextmenu", function (e) {   // HERESY 1995: a take's own menu on its row; a way out of the room closes the window
      var li = e.target.closest("[data-cmp-li]"), v = li ? versions[+li.dataset.cmpLi] : null;
      if (!v || !v.take || !hk.menu) return;
      e.preventDefault();
      var tab = document.body.dataset.tab;
      hk.menu(v.take, e.clientX, e.clientY);
      [400, 1200, 2500].forEach(function (ms) { setTimeout(function () { if (back.isConnected && document.body.dataset.tab !== tab) close(); }, ms); });
    });
    wave.addEventListener("pointercancel", function () { dragging = false; if (segDrag) { segDrag = null; drawWave(); } });
    window.addEventListener("resize", drawWave);
    document.addEventListener("keydown", key, true);
    back.addEventListener("mousedown", function (e) { if (e.target === back) close(); });
    box.addEventListener("click", function (e) {
      ldTouch();                                         // HERESY 2037
      if (e.target.closest('[data-cmp="loud"]')) {        // HERESY 2037: the player's setting, from here
        LD.on = !LD.on;
        cmpPut("yue2.oldLoud", LD.on ? "1" : null);
        ldWire(); ldGains(); ldPaint();
        window.dispatchEvent(new Event("ruach-loud"));
        return;
      }
      var rb = e.target.closest("[data-cmp-rate]"), fb = e.target.closest("[data-cmp-fav]"), nb = e.target.closest("[data-cmp-note]"), sb = e.target.closest("[data-cmp-sheet]");
      var pk = e.target.closest("[data-cmp-pick]");   // HERESY 2281
      if (pk) return abToggle(+pk.closest("[data-cmp-li]").dataset.cmpLi);
      if (sb) return sheetOpen(+sb.closest("[data-cmp-li]").dataset.cmpLi);   // HERESY 1872
      if (nb) {                                          // HERESY 1724: the take's note, as its card's menu writes it
        var vn = versions[+nb.closest("[data-cmp-li]").dataset.cmpLi];
        window.HeresyDialog.prompt("A note on “" + vn.label + "”\n\nEmpty removes it.", noteOf(vn), { ok: "Keep the note", max: 6000, area: true, rows: 6, cls: "hd-note" })
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
      if (b && (b.dataset.cmp === "rew" || b.dataset.cmp === "fwd")) { var sa = cur(); sa.currentTime = inLoop(sa.currentTime || 0, cmpSeek(sa.currentTime || 0, cmpStep(), b.dataset.cmp === "fwd" ? 1 : -1, dur())); return paint(); }   // HERESY 1995; 2279: inside the loop
      if (b && b.dataset.cmp === "keep") { cmpPut(CMP_KEEP, cmpKeep() ? "0" : null); b.setAttribute("aria-pressed", String(cmpKeep())); return; }
      if (b && b.dataset.cmp === "align") { cmpPut(CMP_ALIGN, cmpGet(CMP_ALIGN) !== "0" ? "0" : null); b.setAttribute("aria-pressed", String(cmpGet(CMP_ALIGN) !== "0")); return drawWave(); }   // HERESY 2000
      if (b && b.dataset.cmp === "mark") return markMoment();
      if (b && b.dataset.cmp === "ab") return abRun();   // HERESY 2281
      if (b && b.dataset.cmp === "sheet") { if (sheet) return sheetClose(); return versions[active].take ? sheetOpen(active) : (window.HeresyToast || say)(tt("This version is a file of a tree: it has no style and lyrics of its own")); }   // HERESY 2043
      if (b && b.dataset.cmp === "blind") { var bl = b.getAttribute("aria-pressed") !== "true"; b.setAttribute("aria-pressed", String(bl)); cmpPut(CMP_BLIND, bl ? "1" : null); return setBlind(bl); }   // 2009: kept
      if (b && (b.dataset.cmp === "playon" || b.dataset.cmp === "ring" || b.dataset.cmp === "shuffle")) return modeFlip(b.dataset.cmp);   // HERESY 2044
      if (b && b.dataset.cmp === "tall") { var tl = !box.classList.contains("is-tall"); box.classList.toggle("is-tall", tl); cmpPut(CMP_TALL, tl ? null : "0"); /* HERESY 2047: on by default, off remembered */ b.setAttribute("aria-pressed", String(tl)); return requestAnimationFrame(drawWave); }
      if (b && b.dataset.cmp === "wide") { var wd = !back.classList.contains("is-wide"); back.classList.toggle("is-wide", wd); cmpPut(CMP_WIDE, wd ? "1" : null); b.setAttribute("aria-pressed", String(wd)); b.innerHTML = ico(wd ? "minimize" : "maximize"); return requestAnimationFrame(drawWave); }
      if (b && b.dataset.cmp === "spec") { var sp = cmpGet(CMP_SPEC) !== "1"; cmpPut(CMP_SPEC, sp ? "1" : null); b.setAttribute("aria-pressed", String(sp)); if (sp) wantBands(active); return drawWave(); }
      if (b && b.dataset.cmp === "dis") { hideDis = !hideDis; cmpPut(CMP_SHOW, hideDis ? "0" : null); b.setAttribute("aria-pressed", String(!hideDis)); return paintRates(); }
    });
    audios.forEach(function (a, i) {
      a.addEventListener("ended", function () {
        if (i !== active) return;
        if (loopA != null) {                             // 09.11.2026: a loop dragged to the very end: the audio ends before keepLoop sees B
          a.currentTime = loopA + off(active); a.play().catch(function () {}); return paint();
        }
        if (modeOn(CMP_ON) && loopA == null) {           // HERESY 2044: on to the next one, from its start
          var nx = nextUp();
          if (nx === active) { a.currentTime = 0; a.play().catch(function () {}); return paint(); }
          if (nx != null) { pick(nx); audios[nx].play().then(settle, settle); return; }
        }
        useCached(i);                                    // HERESY 2044d: its copy in now that it has ended (2044c kept it off the «pause»)
        paint();
      });
    });
    // HERESY 2044: the window's volume slider: to 150 %, red past 100 %; a drag that starts below 100 % stops there (the player's detent, 1700)
    var volEl = box.querySelector(".cmp-vol");
    function volPaint() {
      var over = VOL.v > 1.0001, vn = box.querySelector(".cmp-vol-n");
      volEl.value = String(VOL.v);
      volEl.classList.toggle("is-over", over);
      volEl.style.setProperty("--vol", (VOL.v / 1.5 * 100).toFixed(1) + "%");
      volEl.setAttribute("aria-valuetext", Math.round(VOL.v * 100) + " %");
      vn.textContent = Math.round(VOL.v * 100) + " %"; vn.hidden = Math.abs(VOL.v - 1) < 0.005; vn.classList.toggle("is-over", over);
    }
    volEl.addEventListener("pointerdown", function () { VOL.from = parseFloat(volEl.value); });
    var volUp = function () { if (VOL.from === null) return; VOL.from = null; volEl.blur(); box.focus(); };   // the keys go back to the window
    volEl.addEventListener("pointerup", volUp);
    volEl.addEventListener("pointercancel", volUp);
    volEl.addEventListener("input", function () {
      var v = parseFloat(volEl.value);
      if (VOL.from !== null && VOL.from < 1 && v > 1) v = 1;
      VOL.v = Math.max(0, Math.min(1.5, isFinite(v) ? v : 1));
      cmpPut(CMP_VOL, Math.abs(VOL.v - 1) < 0.005 ? null : String(VOL.v));
      audios.forEach(function (a) { a.volume = Math.min(1, VOL.v); });
      if (VOL.v > 1) ldWire();
      ldTouch(); ldGains(); volPaint();
    });
    volPaint();
    var tick = setInterval(paint, 250);
    back.cmpChecks = { audio: function () { return cur(); }, wants: function () { return wantPlay; }, scale: function () { return typeof scaleTop === "function" ? scaleTop() : null; } };   // HERESY 2092 · 2094: for the checks
    if (cmpGet(CMP_BLIND) === "1") setBlind(true);       // HERESY 2009: blind as it was left
    paintRates();
    paint();
    box.setAttribute("tabindex", "-1");                  // the keys are the popup's now, not the field left behind it
    box.focus();
    if (mainAt >= 0 && main.at > 0) {                    // HERESY 2044: from the player's second
      var a0 = cur(), at0 = main.at;
      lastT = at0;
      var put0 = function () { try { a0.currentTime = Math.min(at0, isFinite(a0.duration) ? Math.max(0, a0.duration - 0.05) : at0); } catch (e) { /* not seekable yet */ } };
      var go0 = function () { put0(); playNow(a0); };   // HERESY 2092: played as a click plays   // HERESY 2044f: it plays once it stands at that second (no blip of 0:00)
      if (a0.readyState >= 1) go0(); else a0.addEventListener("loadedmetadata", go0, { once: true });
    } else playNow(cur());   // HERESY 2092
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
  // HERESY 2281 · 2286 (Viktor 09.11.2026: «Для пользователя в сравнителе название "До и После" — это вообще непонятная фигня… заменить название на "Первый и
  // второй"… Нет переводов в этой ноде и её выхлопах… замеры оформить структурированно с колонками… можно ли дописать сравнение более чем двух? Скажем, до
  // четырёх?»): First and second, 1991's analyzer (the Refiner's node keeps its Before and after) on two to four versions ({name, path, label} each, a take
  // or a file of a take's tree), each measured against the first. The measures open it, a column a version (a row a measure, its unit in its name, the
  // difference where two); past two, the spectrograms of all side by side; then for the pair chosen (1 ↔ 2 first) the verdict, the tone by zone, the
  // spectrograms of both and their difference, the measures' picture. Every word in the page's language: the lab's templates said here, the pictures
  // drawn in the words the page gives; its files to download (the page and the numbers made here, in that language)
  var AB_ROWS = [["lufs", "Integrated loudness, LUFS"], ["true_peak_dbtp", "True peak, dBTP"], ["peak_dbfs", "Sample peak, dBFS"], ["plr_db", "Peak over loudness, dB"],
    ["lra_lu", "Loudness range, LU"], ["crest_db", "Crest, dB"], ["width_db", "Width (side over mid), dB"], ["correlation", "Correlation"], ["balance_db", "Left over right, dB"],
    ["quiet_dbfs", "The quietest moments, dBFS"], ["clipped_runs", "Clipped runs"]];
  var AB_REL = [["lag_ms", "Later than 1, ms"], ["likeness", "Likeness to 1"], ["level_db", "Loudness against 1, LU"]];
  var AB_ZONES = { sub: "sub-bass", low: "bass", mid: "mids", "hi-mid": "upper mids", high: "highs", air: "air" };
  var AB_PIC = { eq: "{0} (at equal loudness)", diff: "{1} − {0}: red where it is louder, blue where it is quieter (±6 dB)", time: "time, s",
    spec: "Average spectrum at equal loudness", tone: "What changed in the tone (grey: ±1 dB) · blue: what no filter makes", nolin: "no filter makes it, dB under the music",
    dynx: "the level of {0} in 50 ms windows, dBFS", dyny: "{1} − {0}, dB", dyn: "Dynamics: glue {0} dB, peaks {1} dB", st: "Short-term loudness" };
  function abNum(v, k, signed) {
    if (v == null || v === "" || !isFinite(+v)) return "—";
    var x = +v, s = k === "clipped_runs" ? String(Math.round(x)) : x.toFixed(k === "correlation" || k === "likeness" ? 3 : 2);
    return (signed && x >= 0 ? "+" : "") + s.replace("-", "−");
  }
  function abSay(s) {   // a sentence of the verdict: its template in the page's language, a zone's name too
    var args = s[1] || [];
    return tt(s[0]).replace(/\{(\d+)\}/g, function (m, i) {
      var a = args[+i];
      if (a == null) return m;
      if (a.zones) return a.zones.map(function (z) { return tt(AB_ZONES[z[0]] || z[0]) + " " + String(z[1]).replace("-", "−") + " dB"; }).join(", ");
      return String(a).replace(/^-(?=\d)/, "−");
    });
  }
  function abOpen(sides) {
    sides = (sides || []).slice(0, 4);
    if (sides.length < 2) return;
    var was = document.activeElement, stop = false, timer = 0, enc = encodeURIComponent, blobs = [], R = null, at = 0;
    var names = sides.map(function (s, i) { return (i + 1) + " · " + (s.label || s.name); }), words = {};
    Object.keys(AB_PIC).forEach(function (k) { var w = tt(AB_PIC[k]); if (w !== AB_PIC[k]) words[k] = w; });
    var back = document.createElement("div");
    back.className = "hd-back ab-back";
    back.innerHTML = '<div class="hd-box hd-ab" role="dialog" aria-modal="true" aria-label="First and second"><div class="hd-title">First and second</div>' +
      '<div class="ab-body" translate="no"><p class="ab-wait">' + esc(tt("Measuring them against the first…")) + "</p></div>" +
      '<div class="hd-acts"><span class="ab-files" translate="no"></span><span class="hd-spacer"></span><button type="button" class="btn small primary hd-yes">Close</button></div></div>';
    document.body.appendChild(back);
    var body = back.querySelector(".ab-body");
    function unblob() { blobs.forEach(function (u) { URL.revokeObjectURL(u); }); blobs = []; }
    function shut() {
      stop = true; clearTimeout(timer); unblob();
      document.removeEventListener("keydown", key, true);
      back.classList.remove("is-on"); back.classList.add("is-leaving");
      setTimeout(function () { back.remove(); }, 120);
      if (was && was.focus && was.isConnected) was.focus();
    }
    function key(e) { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); shut(); } }
    document.addEventListener("keydown", key, true);
    back.addEventListener("mousedown", function (e) { if (e.target === back) shut(); });
    back.querySelector(".hd-yes").addEventListener("click", shut);
    body.addEventListener("click", function (e) {
      var pb = e.target.closest("[data-ab-pair]");
      if (!pb || !R) return;
      at = +pb.dataset.abPair;
      body.querySelector(".ab-pair").innerHTML = pairHtml();
      files();
    });
    requestAnimationFrame(function () { back.classList.add("is-on"); back.querySelector(".hd-yes").focus(); });
    var q = "/lab/abcompare?s=" + enc(JSON.stringify(sides.map(function (s) { return [s.name, s.path || ""]; }))) + "&names=" + enc(JSON.stringify(names)) +
      (Object.keys(words).length ? "&words=" + enc(JSON.stringify(words)) : "");
    function url(f) { return "/lab/abcompare/file?key=" + R.key + "&f=" + f; }
    function col(i, k) { var p = R.pairs[Math.max(0, i - 1)]; return p ? (i ? p.after : p.before)[k] : null; }
    function cells() {                                   // the measures: [head, [a value a version…], the difference or null]
      var two = R.n === 2, rows = AB_ROWS.map(function (r) {
        var v = names.map(function (n, i) { return abNum(col(i, r[0]), r[0]); }), a = col(0, r[0]), b = col(1, r[0]);
        return [tt(r[1]), v, two ? (a == null || b == null ? "—" : abNum(b - a, r[0], true)) : null];
      });
      return rows.concat(AB_REL.map(function (r) {
        return [tt(r[1]), ["—"].concat(R.pairs.map(function (p) { return abNum(p[r[0]], r[0], r[0] !== "likeness") + (r[0] === "lag_ms" && p.polarity === "inverted" ? " ⇅" : ""); })), two ? "" : null];
      }));
    }
    function table() {
      var two = R.n === 2;
      return '<table class="ab-tbl"><tr><th></th>' + names.map(function (n) { return '<th title="' + esc(n) + '">' + esc(n) + "</th>"; }).join("") + (two ? "<th>Δ</th>" : "") + "</tr>" +
        cells().map(function (c, i) { return "<tr" + (i >= AB_ROWS.length ? ' class="ab-rel"' : "") + "><th>" + esc(c[0]) + "</th>" + c[1].map(function (v) { return "<td>" + esc(v) + "</td>"; }).join("") + (c[2] == null ? "" : "<td>" + esc(c[2]) + "</td>") + "</tr>"; }).join("") + "</table>";
    }
    function pic(f) { return '<a class="ab-pic" href="' + esc(url(f)) + '" target="_blank" rel="noopener"><img src="' + esc(url(f)) + '" alt="" /></a>'; }
    function zones(p) { var z = p.zones_db || {}; return Object.keys(z).map(function (k) { return [tt(AB_ZONES[k] || k), abNum(z[k], k, true)]; }); }
    function pairHtml() {
      var p = R.pairs[at], z = zones(p);
      return (R.n > 2 ? '<div class="ab-pairs" role="group">' + R.pairs.map(function (q2, i) {
        return '<button type="button" class="btn ghost small" data-ab-pair="' + i + '" aria-pressed="' + (i === at) + '">' + q2.nums[0] + " ↔ " + q2.nums[1] + "</button>";
      }).join("") + "</div>" : "") +
        '<h3 class="ab-h">' + esc(tt("Verdict")) + " · " + p.nums[0] + " ↔ " + p.nums[1] + '</h3><ul class="ab-verdict">' +
        (p.verdict12 || []).map(function (s) { return "<li>" + esc(abSay(s)) + "</li>"; }).join("") + "</ul>" +
        '<table class="ab-tbl ab-zones"><tr><th>' + esc(tt("The tone by zone at equal loudness, dB against 1")) + "</th>" + z.map(function (c) { return "<th>" + esc(c[0]) + "</th>"; }).join("") + "</tr>" +
        "<tr><th>" + p.nums[1] + " − " + p.nums[0] + "</th>" + z.map(function (c) { return "<td>" + esc(c[1]) + "</td>"; }).join("") + "</tr></table>" +
        pic("pair" + (at + 1) + "/spectrograms.jpg") + pic("pair" + (at + 1) + "/measures.png");
    }
    function md() {
      var two = R.n === 2, row = function (c) { return "| " + c.join(" | ") + " |"; };
      var dash = function (n) { var a = []; while (a.length < n) a.push("---"); return row(a); };
      var L = ["# " + tt("First and second"), "", row([""].concat(names, two ? ["\u0394"] : [])), dash(1 + names.length + (two ? 1 : 0))];
      cells().forEach(function (c) { L.push(row([c[0]].concat(c[1], c[2] == null ? [] : [c[2]]))); });
      R.pairs.forEach(function (p) {
        var z = zones(p);
        L.push("", "## " + tt("Verdict") + " · " + p.nums[0] + " ↔ " + p.nums[1], "");
        (p.verdict12 || []).forEach(function (s) { L.push("- " + abSay(s)); });
        L.push("", row([tt("The tone by zone at equal loudness, dB against 1")].concat(z.map(function (c) { return c[0]; }))), dash(1 + z.length),
          row([p.nums[1] + " − " + p.nums[0]].concat(z.map(function (c) { return c[1]; }))));
      });
      return L.join("\n") + "\n";
    }
    function files() {
      unblob();
      var stem = (tt("First and second") + " - " + sides.map(function (s) { return s.label || s.name; }).join(" - ")).replace(/[\\/:*?"<>|]+/g, " ").slice(0, 180);
      var blob = function (text, type) { var u = URL.createObjectURL(new Blob([text], { type: type })); blobs.push(u); return u; };
      var link = function (href, ext, label) { return '<a class="btn ghost small" href="' + esc(href) + '" download="' + esc(stem + "." + ext) + '">' + esc(label) + "</a>"; };
      var p = "pair" + (at + 1) + "/";
      back.querySelector(".ab-files").innerHTML = link(blob(md(), "text/markdown"), "md", "MD") + link(blob(JSON.stringify(R, null, 1), "application/json"), "json", "JSON") +
        link(url(p + "spectrograms.jpg"), "jpg", "JPG") + link(url(p + "measures.png"), "png", "PNG") + (R.grid ? link(url("grid.jpg"), "jpg", "JPG ▦") : "");
    }
    (function poll() {
      fetch(q).then(function (r) { return r.json().then(function (j) { return { s: r.status, j: j }; }, function () { return { s: r.status, j: null }; }); })
        .then(function (o) {
          if (stop) return;
          if (o.s === 202) { timer = setTimeout(poll, 1500); return; }
          if (o.s !== 200 || !o.j || !o.j.key || !(o.j.pairs || []).length) throw new Error((o.j && o.j.error) || "HTTP " + o.s);
          R = o.j;
          body.innerHTML = table() + (R.grid ? pic("grid.jpg") : "") + '<div class="ab-pair">' + pairHtml() + "</div>";
          files();
        })
        .catch(function (e) { if (!stop) body.innerHTML = '<p class="ab-err">' + esc(tt("First and second did not run: {0}").replace("{0}", e.message)) + "</p>"; });
    })();
  }
  window.HeresyAB = { open: abOpen };
  window.HeresyDerived = { cmp: { startAt: cmpStartAt, seek: cmpSeek, ticks: cmpTicks, keep: cmpKeep, hide: cmpHide, marks: cmpMarks, clockMs: clockMs, shift: cmpShift, isOrig: cmpIsOrig },   // HERESY 1995 · 2000: for the checks; 2063: isOrig
    init: init, setTake: setTake, files: files, refresh: refresh, mdSizes: paintMdSizes, remasterSettings: remasterSettings, chainDeess: chainDeess, compareList: openCompare,
                           list: function () { return state.list.slice(); }, renderInto: renderInto,   // HERESY 1964   // 1506: the branches as the lab names them (kind, source), for the Refiner's canvas
                           marks: function (name) { return Object.assign({}, MARKS[name] || {}); } };   // 1415; 1504
})();
