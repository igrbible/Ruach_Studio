// HERESY 1011: the take's lyrics checked by ear — Whisper against the lyrics, per minute.
//
// The listening runs on Forge in heresy-lab (lab/lab.py, port 41870, reached through the
// Kit server's /lab/ proxy): Whisper large-v3
// loads for one take, transcribes it, and leaves VRAM (Viktor 30.09.2026: load only
// when needed, unload at once). The measure is lab/gloss_core.py:
//   per minute   mean match of what was heard to the closest lyric line (0..1)
//   reached      the furthest lyric line a match of 0.5+ reached — not a count of lines sung
//   backs        returns 8+ lines behind the furthest: the song going round
//   loop         Whisper repeating one text: then the measurement itself is void
(function () {
  "use strict";

  var state = { take: null, hooks: null, token: 0, source: "" };   // source: "" the take, or derived/… (HERESY 1021)
  function src() { return state.source ? "&source=" + encodeURIComponent(state.source) : ""; }
  function $(id) { return document.getElementById(id); }
  // through the Kit server (/lab/… → 127.0.0.1:41870): one origin, one port to reach
  function lab() { return "/lab"; }
  function clock(t) { var m = Math.floor(t / 60), s = Math.floor(t % 60); return m + ":" + (s < 10 ? "0" : "") + s; }
  function grade(v) { return v === null || v === undefined ? "none" : v >= 0.6 ? "ok" : v >= 0.4 ? "weak" : "bad"; }
  // HERESY 1166: the summary lines translated piece by piece; the last results drawn again when the language changes
  function tr(s) { return window.RuachI18n ? window.RuachI18n.t(s) : s; }
  var last = { gloss: null, timing: null };
  window.addEventListener("ruach-lang", function () {
    try { if (last.gloss && state.take) paint(last.gloss); if (last.timing && state.take) ktPaint(last.timing); } catch (e) { /* gone */ }
  });

  function say(text, bad) {
    $("glossState").textContent = text || "";
    $("glossState").classList.toggle("is-bad", !!bad);
  }

  function paint(r) {
    last.gloss = r;
    if (state.take) window.dispatchEvent(new CustomEvent("heresy-step", { detail: { name: state.take.name, step: "gloss" } }));   // HERESY 1029
    var box = $("glossResult");
    box.textContent = "";
    if (r.loop) {
      var warn = document.createElement("p");
      warn.className = "gloss-loop";
      var said = "⚠ Whisper went round on one text (“" + r.loop.text + "” ×" + r.loop.times +
        "): this measurement says nothing about the song. Press Listen again.";
      if (window.ruachSigned) window.ruachSigned(warn, said); else warn.textContent = said;   // HERESY 1169 · 1247: the sign drawn
      box.appendChild(warn);
    }
    var bars = document.createElement("div");
    bars.className = "gloss-bars";
    r.minutes.forEach(function (v, m) {
      var cell = document.createElement("div");
      cell.className = "gloss-bar is-" + grade(v);
      cell.innerHTML = '<span class="gloss-fill"></span><span class="gloss-min mono"></span><span class="gloss-val mono"></span>';
      cell.querySelector(".gloss-fill").style.height = Math.round((v || 0) * 100) + "%";
      cell.querySelector(".gloss-min").textContent = m + ":00";
      cell.querySelector(".gloss-val").textContent = v === null ? "—" : v.toFixed(2);
      cell.dataset.tip = v === null ? "No words heard in this minute" : "Minute " + m + ": mean match " + v.toFixed(2) +
        (v >= 0.6 ? " — clear" : v >= 0.4 ? " — blurred" : " — glossolalia");
      cell.addEventListener("click", function () { if (state.hooks) state.hooks.seek(state.take, m * 60); });
      bars.appendChild(cell);
    });
    box.appendChild(bars);

    var sum = document.createElement("p");
    sum.className = "gloss-sum";
    sum.textContent = [tr(r.reached ? "Reached lyric line " + r.reached.line + " of " + r.lines + " at " + clock(r.reached.at) : "No lyric line matched"),
      tr("returns back: " + r.backs), tr(r.distinct + " distinct of " + r.total + " heard segments"),
      r.model + ", GPU" + r.gpu + ", " + r.took + " s"].concat(r.at ? [r.at] : []).join(" · ");
    box.appendChild(sum);

    var list = document.createElement("ol");
    list.className = "gloss-list";
    r.segments.forEach(function (s) {
      var li = document.createElement("li");
      li.className = "is-" + grade(s.score);
      li.innerHTML = '<button type="button" class="gloss-time mono"></button><span class="gloss-score mono"></span>' +
        '<span class="gloss-heard"></span><span class="gloss-lyric"></span>';
      li.querySelector(".gloss-time").textContent = clock(s.start);
      li.querySelector(".gloss-time").addEventListener("click", function () { if (state.hooks) state.hooks.seek(state.take, s.start); });
      li.querySelector(".gloss-score").textContent = s.score.toFixed(2);
      li.querySelector(".gloss-heard").textContent = s.text;
      li.querySelector(".gloss-lyric").textContent = s.line >= 0 ? (s.line + 1) + ". " + s.lyric : "";
      list.appendChild(li);
    });
    var det = document.createElement("details");
    det.className = "gloss-segs";
    det.innerHTML = "<summary></summary>";
    det.querySelector("summary").textContent = "What Whisper heard, " + r.segments.length + " segments: heard → closest lyric line";
    det.appendChild(list);
    box.appendChild(det);
  }

  // The lab answers at once: 202 while the job is queued or running, the result when done.
  // The page asks again every two seconds (HERESY 1013: heresy-lab is asynchronous).
  function run(force) {
    if (!state.take) return;
    var token = ++state.token, started = Date.now(), take = state.take, first = true;
    $("glossRun").disabled = true;
    var ticker = setInterval(function () { say("Whisper is listening on Forge\u2026 " + Math.round((Date.now() - started) / 1000) + "s"); }, 1000);
    say("asking heresy-lab\u2026");
    function ask() {
      var url = lab() + "/gloss?name=" + encodeURIComponent(take.name) + src() + (force && first ? "&force=1" : "");
      first = false;
      return fetch(url).then(function (r) {
        return r.json().then(function (body) {
          if (r.status === 202) {
            if (token !== state.token) return null;
            return new Promise(function (resolve) { setTimeout(resolve, 2000); }).then(ask);
          }
          if (!r.ok) throw new Error(body.error || "heresy-lab answered " + r.status);
          return body;
        });
      });
    }
    ask().then(function (r) {
      if (!r || token !== state.token) return;
      paint(r);
      say("");
      $("glossRun").textContent = "Listen again";
    }).catch(function (error) {
      if (token !== state.token) return;
      say("Could not check: " + (error && error.message || error), true);
    }).then(function () { clearInterval(ticker); $("glossRun").disabled = false; });
  }

  // ---- HERESY 1056: karaoke timing
  var kt = { timer: 0 };
  function ktClock(t) { var m = Math.floor(t / 60), s = (t % 60).toFixed(1); return m + ":" + (s < 10 ? "0" : "") + s; }
  function ktPaint(r) {
    var name = state.take && state.take.name, base = "/lab/timing?name=" + encodeURIComponent(name || "");
    var file = (state.take && state.take.label ? state.take.label : name || "take").replace(/[\\/:*?"<>|]+/g, " ").trim();
    $("ktLrc").hidden = $("ktSrt").hidden = !r;
    $("ktRows").hidden = !r;
    if (!r) { $("ktRows").innerHTML = ""; return; }
    $("ktLrc").href = base + "&fmt=lrc"; $("ktLrc").download = file + ".lrc";
    $("ktSrt").href = base + "&fmt=srt"; $("ktSrt").download = file + ".srt";
    var guessed = r.rows.filter(function (x) { return x.guessed; }).length;
    last.timing = r;
    $("ktState").textContent = [r.rows.length + " lines", Math.round(r.heard * 100) + " % on heard words", guessed ? guessed + " guessed" : ""].filter(Boolean).map(tr).concat([r.language]).join(" · ");
    $("ktRun").textContent = "Time again";
    $("ktRows").innerHTML = r.rows.map(function (x) {
      return '<li class="' + (x.guessed ? "is-guessed" : "") + '"><button type="button" class="kt-t mono" data-kt="' + x.start + '">' + ktClock(x.start) + "</button><span>" +
        x.text.replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }) + "</span></li>";
    }).join("");
  }
  function ktPeek() {
    if (!state.take) return;
    var name = state.take.name;
    fetch("/lab/timing?name=" + encodeURIComponent(name) + "&cached=1").then(function (r) { return r.ok ? r.json() : null; })
      .then(function (r) { if (state.take && state.take.name === name) ktPaint(r && r.rows ? r : null); }).catch(function () {});
  }
  function ktRun(force) {
    if (!state.take) return;
    var name = state.take.name, t0 = Date.now();
    clearTimeout(kt.timer);
    $("ktRun").disabled = true;
    (function poll(first) {
      fetch("/lab/timing?name=" + encodeURIComponent(name) + (first && force ? "&force=1" : ""))
        .then(function (r) { return r.json().then(function (b) { if (!r.ok && r.status !== 202) throw new Error(b.error || r.status); return b; }); })
        .then(function (r) {
          if (!state.take || state.take.name !== name) return;
          if (r.rows) { ktPaint(r); $("ktRun").disabled = false; return; }
          $("ktState").textContent = (r.status === "queued" ? "waiting for the GPU" : "Whisper listens") + " · " + Math.round((Date.now() - t0) / 1000) + " s";
          kt.timer = setTimeout(function () { poll(false); }, 2000);
        }).catch(function (e) { $("ktState").textContent = "Could not: " + e.message; $("ktRun").disabled = false; });
    })(true);
  }

  function init(hooks) {
    if (!$("glossPanel")) return;
    state.hooks = hooks;
    $("ktRun").addEventListener("click", function () { ktRun((window.RuachI18n ? RuachI18n.en(this) : this.textContent) === "Time again"); });
    $("ktRows").addEventListener("click", function (e) {
      var b = e.target.closest("[data-kt]");
      if (b && state.hooks && state.hooks.seek) state.hooks.seek(state.take, parseFloat(b.dataset.kt));
    });
    $("glossRun").addEventListener("click", function () { run((window.RuachI18n ? RuachI18n.en($("glossRun")) : $("glossRun").textContent) === "Listen again"); });
    $("glossSource").addEventListener("change", function () { useSource(this.value, false); });
    // the take's derived files (vocal stems first) become sources as they appear
    window.addEventListener("heresy-derived", function (event) {
      if (!state.take || event.detail.name !== state.take.name) return;
      var keep = state.source, sel = $("glossSource");
      sel.innerHTML = '<option value="">the take</option>' + event.detail.files.filter(function (f) { return f.kind === "stems"; })
        .sort(function (a, b) { return (/vocal/i.test(b.label) ? 1 : 0) - (/vocal/i.test(a.label) ? 1 : 0); })
        .map(function (f) { return '<option value="' + f.source + '">' + f.label.replace(/^\u21b3 /, "") + "</option>"; }).join("");
      sel.value = Array.prototype.some.call(sel.options, function (o) { return o.value === keep; }) ? keep : "";
    });
    // An already measured take shows at once when the drawer opens (the lab keeps a cache).
    $("glossPanel").addEventListener("toggle", function () { if ($("glossPanel").open && !$("glossResult").childNodes.length) { peek(); ktPeek(); } });
  }

  function peek() {
    if (!state.take) return;
    var token = state.token, name = state.take.name;
    fetch(lab() + "/gloss?name=" + encodeURIComponent(name) + src() + "&cached=1").then(function (r) { return r.ok ? r.json() : null; })
      .then(function (r) { if (r && !r.error && token === state.token && state.take && state.take.name === name) { paint(r); $("glossRun").textContent = "Listen again"; } })
      .catch(function () { /* nothing measured yet, or no lab: the button says the rest */ });
  }

  function useSource(source, run_) {
    state.source = source || "";
    if ($("glossSource").value !== state.source) $("glossSource").value = state.source;
    state.token++;
    $("glossResult").textContent = "";
    $("glossRun").textContent = "Listen with Whisper";
    say("");
    if (run_) run(false); else peek();
  }

  // take: { name, label }
  function setTake(take) {
    if (!$("glossPanel")) return;
    if (state.take && take && state.take.name === take.name) return;
    state.take = take;
    state.source = "";
    $("glossSource").innerHTML = '<option value="">the take</option>';
    state.token++;
    $("glossResult").textContent = "";
    $("glossRun").textContent = "Listen with Whisper";
    say("");
    clearTimeout(kt.timer); $("ktRun").textContent = "Time the lines"; $("ktRun").disabled = false; $("ktState").textContent = ""; ktPaint(null);
    if ($("glossPanel").open) { peek(); ktPeek(); }
  }

  window.HeresyGloss = { init: init, setTake: setTake, useSource: useSource };
})();
