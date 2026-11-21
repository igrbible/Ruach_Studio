// HERESY 2913 (Viktor 20.11.2026: «экспорт в MIDI из всего, к чему он прикручен, поднимать модальное окно с диалогом, скачивать модель, если не
// скачана, и давать выбор пользователю, либо скачивает, если есть партитура, которая при экспорте не сломается, обычный партитурный миди, либо пусть
// прямо здесь запускает профессиональное стемирование через MuScriptor, и дожидается результата. Все такие стемы сразу привязываем к этому
// родительскому треку, и их же можно в огранщике будет юзать»): one window for every MIDI export of a take (the take's card and menu, its passport,
// the Refiner's MIDI step), three ways:
//   · the score's MIDI: offered only when the take's score reads (a re-decode's, a re-denoise's: its parent's, whose music codes it keeps), at once;
//   · MuScriptor on the mix: one pass, 34 instrument groups and the drums, every note at one velocity;
//   · MuScriptor per stem: the take's stems (split first when it has none, on a card), each with its own groups, each note's velocity from its stem.
// The two transcriptions are the lab's (GET /lab/midi/export: 202 while it runs, then its set of the tree, derived/midi-export-…), written on the take's
// own beats (the tempo heard, not the score's Q: YuE2 sings 0.1–1.3 % off it, bargrid.py), quantize off unless asked. A missing size is fetched first
// in the same window (Engine → Models' own fetch); the estimate is this machine's own past runs; the progress in the window and on the strip; Stop.
// An export made already downloads at once, «Transcribe again» stays. The last choice is kept (yue2.midiExport).
(function () {
  "use strict";
  var KEY = "yue2.midiExport", H = {}, W = null;
  function tr(s) { return window.RuachI18n ? window.RuachI18n.t(s) : s; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]; }); }
  function toast(t, bad) { if (H.toast) H.toast(t, bad ? "bad" : ""); }
  function recall() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } }
  function keep(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { /* private window */ } }
  function clock(s) { s = Math.max(0, Math.round(s || 0)); var m = Math.floor(s / 60), x = s % 60; return m + ":" + (x < 10 ? "0" : "") + x; }
  function mb(b) { return b >= 1e9 ? (b / 1e9).toFixed(1) + " GB" : Math.round(b / 1e6) + " MB"; }
  function size(s) { return tr(s === "small" ? "Small" : s === "medium" ? "Medium" : "Large"); }
  function fileUrl(name, path) { return "/library/file?name=" + encodeURIComponent(name) + "&path=" + encodeURIComponent(path); }
  function safe(s) { return String(s || "take").replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 120); }
  function get(u) { return fetch(u).then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { code: r.status, d: d }; }); }); }
  function post(u, b) { return fetch(u, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) throw new Error(d.error || "HTTP " + r.status); return d; }); }); }
  function save(href, file) { var a = document.createElement("a"); a.href = href; a.download = file; document.body.appendChild(a); a.click(); a.remove(); }

  // the score a take's MIDI is written from: its own when it reads; a take that keeps its parent's music codes (a re-decode, a re-denoise, another
  // decoder) its parent's (the bug of 20.11: «MIDI нет: Incomplete native two-voice ABC» on a re-decoded take)
  function reads(abc) {                               // "" when it reads, else why not
    if (!abc) return tr("No score");
    if (!window.HeresyAbc) return "no ABC reader";
    try { window.HeresyAbc.parse(abc); return ""; } catch (e) { return e.message || String(e); }
  }
  function sameCodes(req, preq) {
    if (req.semantic_tokens && preq.semantic_tokens) return req.semantic_tokens === preq.semantic_tokens;
    return req.lm_seed != null && String(req.lm_seed) === String(preq.lm_seed) && String(req.seed) === String(preq.seed);
  }
  function scoreOf(take, find) {                     // find: how a parent is looked up (the library's own; the checks pass their line)
    find = find || H.findTake;
    if (!take || !H.getRequest) return Promise.resolve({ abc: "", why: tr("No score") });
    return H.getRequest(take).then(function (req) {
      var own = String(req.abc || ""), bad = reads(own);
      if (own && !bad) return { abc: own, from: "" };
      // HERESY 2927 (Viktor 20.11.2026: «a re-decode and every edit that keeps the score take it from the parent»): up the whole line while the
      // music codes stay the same (a re-decode of a re-decode), to the first score that reads; eight steps at most
      var up = function (t, r, depth) {
        var parent = t.parent && find ? find(t.parent) : null;
        if (!parent || depth > 8) return Promise.resolve(null);
        return H.getRequest(parent).then(function (preq) {
          if (!sameCodes(r, preq)) return null;
          var pa = String(preq.abc || "");
          if (pa && !reads(pa)) return { abc: pa, from: parent.name, fromTitle: H.title ? H.title(parent) : parent.name };
          return up(parent, preq, depth + 1);
        }, function () { return null; });
      };
      var fromParent = up(take, req, 1);
      // HERESY 2913 (Viktor 20.11.2026, his additions: a Direct take's score MIDI means SheetSage2 first): no score of its own or of its parent: the one
      // written from its sound before (/lab/score), else the transcriber offered first, its time and its card said
      return fromParent.then(function (pr) {
        if (pr) return pr;
        return fetch("/lab/score?name=" + encodeURIComponent(take.name)).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }).then(function (d) {
          if (d && d.abc && !reads(d.abc)) return { abc: d.abc, from: "sound" };
          return { abc: "", why: bad, sound: !!H.transcribe };
        });
      });
    }).catch(function (e) { return { abc: "", why: e && e.message || String(e) }; });
  }

  function open(name, opts) {
    opts = opts || {};
    var take = H.findTake ? H.findTake(name) : null;
    if (!take || take.session) return toast(tr("Open a take of the library first"), true);
    close();
    var title = H.title ? H.title(take) : take.title || name, last = recall();
    var back = document.createElement("div");
    back.className = "hd-back mxe-back";
    back.innerHTML = '<div class="hd-box hd-midi" role="dialog" aria-modal="true" aria-label="MIDI">' +
      '<div class="hd-title">MIDI · <span translate="no">' + esc(title) + "</span></div>" +
      '<div class="mxe-ways" role="radiogroup">' +
        way("score", tr("The score's MIDI"), "") + way("mix", tr("MuScriptor on the mix"), "") + way("stems", tr("MuScriptor per stem"), "") + "</div>" +
      '<div class="mxe-opts"><label class="field"><span class="label">' + esc(tr("Model")) + '</span><select class="mxe-size"></select></label>' +
        '<label class="field"><span class="label">' + esc(tr("Quantize")) + '</span><select class="mxe-q"><option value="off">' + esc(tr("off")) +
        '</option><option value="1/8">1/8</option><option value="1/16">1/16</option></select></label></div>' +
      '<p class="mxe-note"></p><div class="mxe-run" hidden><div class="mxe-stage mono"></div><div class="mxe-bar"><i></i></div></div>' +
      '<div class="hd-acts"><button type="button" class="btn ghost small mxe-again" hidden>' + esc(tr("Transcribe again")) + "</button>" +
        '<button type="button" class="btn ghost small mxe-stop" hidden>' + esc(tr("Stop")) + "</button>" +
        '<button type="button" class="btn ghost small hd-no">' + esc(tr("Cancel")) + '</button><button type="button" class="btn primary small hd-yes mxe-go">' + esc(tr("Download")) + "</button></div></div>";
    document.body.appendChild(back);
    W = { back: back, name: name, take: take, title: title, plan: null, score: null, way: last.way || "", size: last.size || "", q: last.quantize || "off", timer: 0, fetching: false, running: false };
    var $ = function (s) { return back.querySelector(s); };
    $(".mxe-q").value = W.q;
    requestAnimationFrame(function () { back.classList.add("is-on"); });
    back.addEventListener("mousedown", function (e) { if (e.target === back && !W.running) close(); });
    back.addEventListener("change", function (e) {
      if (e.target.name === "mxeWay") W.way = e.target.value;
      if (e.target.classList.contains("mxe-size")) W.size = e.target.value;
      if (e.target.classList.contains("mxe-q")) W.q = e.target.value;
      keep({ way: W.way, size: W.size, quantize: W.q });
      paint();
    });
    back.addEventListener("click", function (e) {
      if (e.target.closest(".hd-no")) return close();
      if (e.target.closest(".mxe-go")) return go(false);
      if (e.target.closest(".mxe-again")) return go(true);
      if (e.target.closest(".mxe-stop")) return stop();
    });
    Promise.all([scoreOf(take), get("/lab/midi/export/plan?name=" + encodeURIComponent(name)).catch(function () { return { code: 0, d: {} }; })]).then(function (x) {
      if (!W || W.back !== back) return;
      W.score = x[0];
      W.plan = x[1].code === 200 ? x[1].d : null;
      W.planCode = x[1].code;
      if (!W.way || (W.way === "score" && !W.score.abc && !W.score.sound)) W.way = W.score.abc ? "score" : "mix";
      if (W.plan && W.plan.job && (W.plan.job.status === "queued" || W.plan.job.status === "running")) { W.way = W.plan.job.way; W.size = W.plan.job.size; follow(); }
      paint();
    });
    paint();
    function way(v, head) {
      return '<label class="mxe-way" data-way="' + v + '"><input type="radio" name="mxeWay" value="' + v + '"><span class="mxe-head">' + esc(head) + '</span><span class="mxe-sub"></span></label>';
    }
  }
  function sizesHere() { return W.plan && W.plan.status ? W.plan.status.here || [] : []; }
  function pickSize() {
    var st = W.plan && W.plan.status, here = sizesHere();
    if (!st) return W.size || "";
    if (W.size && st.sizes.indexOf(W.size) >= 0) return W.size;
    return here.indexOf(st.suggest) >= 0 ? st.suggest : here[0] || st.suggest || "small";
  }
  function made(way, sz) { return ((W.plan && W.plan.made) || []).filter(function (m) { return m.way === way && m.size === sz && (m.quantize || "off") === W.q; })[0] || null; }
  function paint() {
    if (!W) return;
    var b = W.back, $ = function (s) { return b.querySelector(s); }, P = W.plan, st = P && P.status, sz = pickSize(), est = P && P.estimate && P.estimate[sz];
    W.size = sz;
    var labOld = W.planCode === 404, noProg = st && !st.built;
    // the ways: the score's when it reads; the transcriptions when the lab has the program
    var rows = { score: W.score ? (W.score.abc ? (W.score.from === "sound" ? tr("the score written from its sound before (SheetSage2): its melody and its instrument line, two tracks; at once")
                                                   : W.score.from ? tr("the score of “{0}”, whose music codes it keeps: the plan's melody and its instrument line, two tracks; at once").replace("{0}", W.score.fromTitle)
                                                   : tr("the plan's melody and its instrument line, two tracks; at once"))
                                               : W.score.sound ? tr("no score of its own (a Direct take): SheetSage2 writes one from its sound first, on the Studio's card in the queue, a minute or two and more for a long song; then its MIDI")
                                               : tr("not offered: {0}").replace("{0}", W.score.why || tr("No score"))) : tr("Reading the score…"),
      mix: labOld ? tr("the Studio's lab learns it at its next restart") : noProg ? tr("The transcriber is not built: ./build.sh builds it") :
        tr("one pass: 34 instrument groups and the drums, every note at one velocity") + (est ? " · " + tr("about {0} here").replace("{0}", clock(est.mix)) : ""),
      stems: labOld ? tr("the Studio's lab learns it at its next restart") : noProg ? tr("The transcriber is not built: ./build.sh builds it") :
        (P && P.stems ? tr("its stems are here ({0}): each transcribed with its own instruments, each note's velocity from its stem").replace("{0}", P.stems.files.length)
                      : tr("its stems first (a card, a minute or two), then each transcribed with its own instruments, each note's velocity from its stem")) +
        (est ? " · " + tr("about {0} here").replace("{0}", clock(est.stems)) : "") };
    Array.prototype.forEach.call(b.querySelectorAll(".mxe-way"), function (l) {
      var v = l.dataset.way, off = v === "score" ? !(W.score && (W.score.abc || W.score.sound)) : labOld || !st || noProg;
      l.classList.toggle("is-off", off);
      l.querySelector("input").disabled = off || W.running || W.fetching;
      l.querySelector("input").checked = W.way === v;
      l.querySelector(".mxe-sub").textContent = rows[v];
    });
    var mus = W.way !== "score";
    $(".mxe-opts").hidden = !mus;
    if (st) {
      $(".mxe-size").innerHTML = st.sizes.map(function (s) {
        var here = sizesHere().indexOf(s) >= 0, big = s === "large" && st.suggest !== "large";
        return '<option value="' + s + '"' + (s === sz ? " selected" : "") + ">" + esc(size(s)) + (s === st.suggest ? " · " + esc(tr("suggested")) : "") +
          (here ? "" : " · " + esc(tr("fetched first, {0}").replace("{0}", mb(P.bytes[s])))) + (big ? " · " + esc(tr("for a card of 8 GB")) : "") + "</option>";
      }).join("");
      $(".mxe-size").disabled = W.running || W.fetching;
      $(".mxe-q").disabled = W.running || W.fetching;
    }
    var m = mus ? made(W.way, sz) : null, needFetch = mus && st && sizesHere().indexOf(sz) < 0;
    var note = "";
    if (mus && st) {
      note = tr("Tempo from the heard beats (the score's Q drifts from what is sung); bars and beats fall on the song's own.") + " " +
        tr("MuScriptor's weights are CC BY-NC 4.0: non-commercial use only.");
      if (P.behind) note += " " + tr("A training runs: the transcriber goes behind it ({0} threads), slower than the estimate.").replace("{0}", P.threads);
      if (m) note = tr("Made {0}: it downloads at once.").replace("{0}", m.created) + " " + note;
    }
    if (W.way === "stems" && st && !P.stems && P.cards === 0) note = tr("No card for the stems here: MuScriptor on the mix runs on the processor.") + " " + note;
    $(".mxe-note").textContent = note;
    $(".mxe-again").hidden = !m || W.running || W.fetching;
    $(".mxe-stop").hidden = !W.running;
    var go = $(".mxe-go");
    go.disabled = W.running || W.fetching || (W.way === "score" ? !(W.score && (W.score.abc || W.score.sound)) : !st || noProg || labOld);
    go.textContent = W.way === "score" && W.score && !W.score.abc && W.score.sound ? tr("Write its score (SheetSage2), then download") : W.way === "score" || m ? tr("Download") : needFetch ? tr("Fetch {0} ({1}) and transcribe").replace("{0}", size(sz)).replace("{1}", mb(P.bytes[sz])) : tr("Transcribe");
  }
  function run(text, frac) {
    if (!W) return;
    var r = W.back.querySelector(".mxe-run");
    r.hidden = !text;
    W.back.querySelector(".mxe-stage").textContent = text || "";
    var i = W.back.querySelector(".mxe-bar i");
    i.style.width = frac == null ? "" : Math.round(Math.max(0, Math.min(1, frac)) * 100) + "%";
    i.classList.toggle("is-wave", frac == null);
  }
  function go(again) {
    if (!W) return;
    keep({ way: W.way, size: W.size, quantize: W.q });
    if (W.way === "score" && !W.score.abc && W.score.sound) {         // a Direct take: SheetSage2 first, then its score's MIDI
      W.running = true; paint(); run(tr("SheetSage2 writes its score from its sound…"), null);
      var t0 = Date.now(), tick = setInterval(function () { run(tr("SheetSage2 writes its score from its sound…") + " " + Math.round((Date.now() - t0) / 1000) + " s", null); }, 1000);
      return H.transcribe(W.take).then(function (res) {
        clearInterval(tick);
        if (!W) return;
        W.running = false; run("", 0);
        W.score = { abc: res.abc, from: "sound" };
        go(false);
      }, function (e) { clearInterval(tick); fail(e && e.message || String(e)); });
    }
    if (W.way === "score") {
      try { var bytes = window.HeresyAbc.toMidi(window.HeresyAbc.parse(W.score.abc)); }
      catch (e) { return toast(tr("No MIDI: {0}").replace("{0}", e.message), true); }
      // HERESY 2927 (Viktor 20.11.2026: the tempo from the heard beats): the lab lays the score on the take's own beats (bargrid), as the
      // transcriptions are; when it cannot, the score's own tempo, said aloud
      var file = safe(W.title) + " · " + tr("score") + ".mid", raw = bytes, bin = "";
      for (var i = 0; i < raw.length; i += 8192) bin += String.fromCharCode.apply(null, Array.prototype.slice.call(raw, i, i + 8192));
      W.running = true; paint(); run(tr("Laying the score on the take's heard beats…"), null);
      return post("/lab/midi/score", { name: W.name, midi: btoa(bin), title: W.title }).then(function (d) {
        if (!d || !d.midi) throw new Error((d && d.error) || "no answer");
        var s = atob(d.midi), u = new Uint8Array(s.length);
        for (var k = 0; k < s.length; k++) u[k] = s.charCodeAt(k);
        save(URL.createObjectURL(new Blob([u], { type: "audio/midi" })), file);
        if (d.bpm) toast(tr("MIDI of the score on the take's beats ({0})").replace("{0}", d.bpm + " bpm"));
        else toast(tr("MIDI of the score at its own tempo: the take's beats could not be read ({0})").replace("{0}", d.said || ""), true);
        close();
      }, function (e) {
        save(URL.createObjectURL(new Blob([raw], { type: "audio/midi" })), file);
        toast(tr("MIDI of the score at its own tempo: the take's beats could not be read ({0})").replace("{0}", e && e.message || String(e)), true);
        close();
      });
    }
    var sz = W.size, m = again ? null : made(W.way, sz);
    if (m) { download(m); return close(); }
    if (sizesHere().indexOf(sz) < 0) return fetchModel(sz, function () { go(again); });
    start(again);
  }
  // the size not here: Engine → Models' own fetch (fetch-heresy.sh --muscriptor SIZE), its lines followed here
  function fetchModel(sz, then) {
    W.fetching = true; paint(); run(tr("Fetching MuScriptor {0}…").replace("{0}", size(sz)), null);
    var body = {}; body.muscriptor = sz;
    post("/lab/weights/fetch", body).then(function () {
      var tick = function () {
        if (!W) return;
        Promise.all([get("/lab/weights"), get("/lab/midi/status")]).then(function (x) {
          var j = x[0].d && x[0].d.job, here = (x[1].d && x[1].d.here) || [];
          if (here.indexOf(sz) >= 0 && (!j || j.status !== "running")) { W.fetching = false; W.plan.status.here = here; run("", 0); paint(); return then(); }
          if (j && j.status !== "running") throw new Error((j.lines || []).slice(-1)[0] || tr("the fetch ended without the model"));
          var line = j && j.lines ? j.lines.slice(-1)[0] : "";
          run(tr("Fetching MuScriptor {0}…").replace("{0}", size(sz)) + (line ? " " + line : ""), null);
          W.timer = setTimeout(tick, 1500);
        }).catch(function (e) { W.fetching = false; run("", 0); paint(); toast(tr("Not fetched:") + " " + e.message, true); });
      };
      tick();
    }).catch(function (e) { W.fetching = false; run("", 0); paint(); toast(tr("Not fetched:") + " " + e.message, true); });
  }
  function ask(again) {
    return "/lab/midi/export?name=" + encodeURIComponent(W.name) + "&way=" + W.way + "&size=" + encodeURIComponent(W.size) + "&quantize=" + encodeURIComponent(W.q) +
      (again ? "&again=1" : "") + "&title=" + encodeURIComponent(W.title);
  }
  function start(again) {
    W.running = true; paint(); run(tr("Waits its turn"), 0);
    get(ask(again)).then(function (x) { take(x, again); }).catch(function (e) { fail(e.message); });
  }
  function follow() { W.running = true; paint(); get(ask(false)).then(function (x) { take(x, false); }).catch(function (e) { fail(e.message); }); }
  function take(x, again) {
    if (!W) return;
    var d = x.d || {};
    if (x.code >= 400) return fail(d.error || "HTTP " + x.code);
    if (d.status === "queued" || d.status === "running") {
      run(stage(d), d.progress || 0);
      W.timer = setTimeout(function () { if (W) get(ask(false)).then(function (y) { take(y, false); }).catch(function (e) { fail(e.message); }); }, 1500);
      return;
    }
    if (d.status === "failed" || d.status === "cancelled") return fail(d.status === "cancelled" ? tr("stopped") : d.error || tr("failed"));
    W.running = false; run("", 1);
    download(d);
    toast(tr("MIDI: {0} parts, {1} notes, on the take's beats ({2})").replace("{0}", (d.parts || []).length).replace("{1}", d.notes || 0)
      .replace("{2}", d.tempo && d.tempo.bpm ? d.tempo.bpm + " bpm" : tr("no beats heard: 120 bpm")));
    close();
  }
  function stage(d) {
    var s = d.stage || "Waits its turn", step = d.steps > 1 ? " · " + d.step + "/" + d.steps : "";
    return tr(s) + step + " · " + Math.round((d.progress || 0) * 100) + " %" + (d.notes ? " · " + tr("{0} notes").replace("{0}", d.notes) : "");
  }
  function fail(why) {
    if (!W) return;
    W.running = false; run("", 0);
    // the stems need a card with room (a training may hold all three): said so, and the mix offered, which runs on the processor
    if (W.way === "stems" && /no card/i.test(why || "")) {
      W.way = "mix"; paint();
      return toast(tr("The stems need a card with room, and none has it now: MuScriptor on the mix runs on the processor, or ask for the stems later.") + " (" + why + ")", true);
    }
    paint(); toast(tr("No MIDI: {0}").replace("{0}", why), true);
  }
  function stop() { if (W) post("/lab/midi/export/cancel", { name: W.name }).catch(function (e) { toast(e.message, true); }); }
  function download(m) {
    var head = safe(W ? W.title : m.parent) + " · MuScriptor " + (m.way === "stems" ? tr("stems") : tr("mix")) + " " + m.size;
    (m.files || []).forEach(function (f) { save(fileUrl(m.parent, f.path), head + (f.kind === "zip" ? ".zip" : ".mid")); });
  }
  function close() {
    if (!W) return;
    clearTimeout(W.timer);
    var b = W.back;
    W = null;
    b.classList.remove("is-on"); b.classList.add("is-leaving");
    setTimeout(function () { b.remove(); }, 160);
  }
  // every way into it: a button with data-midi-export (its take: data-name, else the take in hand)
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-midi-export]");
    if (!b) return;
    e.preventDefault();
    var n = b.dataset.name || (H.current ? H.current() : "");
    if (n) open(n); else toast(tr("Open a take of the library first"), true);
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && W && !document.querySelector(".hd-back.is-on:not(.mxe-back)")) { e.preventDefault(); e.stopPropagation(); close(); } }, true);

  // the DAW projects (REAPER, DAWproject) take the newest export's MIDI when the take has one: base64, or "" (then the score's, as before)
  function projectMidi(name) {
    return get("/lab/midi/export/plan?name=" + encodeURIComponent(name)).then(function (x) {
      var m = x.code === 200 && x.d.made && x.d.made[0];
      if (!m) return "";
      return fetch(fileUrl(name, m.files[0].path)).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.arrayBuffer(); }).then(function (buf) {
        var u = new Uint8Array(buf), bin = "";
        for (var i = 0; i < u.length; i += 8192) bin += String.fromCharCode.apply(null, Array.prototype.slice.call(u, i, i + 8192));
        return btoa(bin);
      });
    }).catch(function () { return ""; });
  }

  window.HeresyMidiExport = { init: function (h) { H = h || {}; }, open: open, close: close, scoreOf: scoreOf, projectMidi: projectMidi,
    state: function () { return W ? { way: W.way, size: W.size, q: W.q, running: W.running, fetching: W.fetching, plan: !!W.plan, score: W.score } : null; } };   // for the checks
})();
