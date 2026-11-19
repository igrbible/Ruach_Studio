// HERESY 2691 (the Musician's item of the plan after 2.0.8 «Несколько партитур на тех же сидах в FULL и Cover, по запросу»; Viktor's heresy of
// 17.11.2026: compare the variants, and where one is cut short or has a short Ins, offer the longer; «Партитура стоит секунды, звук — минуты»):
// several scores before any sound. The score button's sibling asks the engine for 2 to 4 plans of the form at once (as many as Probes, 3 when it
// is 1), each on a music seed of its own: the form's seed and the next ones when it is fixed, drawn here when not. They stand in the take column
// side by side: each its bars, its sections with their bars (the instrumental ones marked), whether it sings every section of the lyrics, its
// shortest instrumental; the longest that sings them all is offered. One into the form with its seed: Generate sings exactly that score on the
// seed that planned it.
(function () {
  "use strict";
  var H = null, st = { open: false, set: null, timer: 0 };
  function $(id) { return document.getElementById(id); }
  function tr(s) { return window.RuachI18n && window.RuachI18n.t ? window.RuachI18n.t(s) : s; }
  function fmt(s) { var a = arguments; return tr(s).replace(/\{(\d)\}/g, function (m, i) { return a[+i + 1] != null ? a[+i + 1] : m; }); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function ico(n) { return window.HeresyIcons ? window.HeresyIcons.ui(n) : ""; }
  var SHORT = 4;                                             // an instrumental section under 4 bars is a short one
  var INST = /^(intro|interlude|outro|instrumental|inst|ins|break|solo)\b/;   // named so; or a section the vocal rests in three bars of four

  // ---- a score read: its sections («% verse») and their bars, the vocal's bars sung or resting
  function bars(line) { return (line.replace(/"[^"]*"/g, "").match(/\|+/g) || []).length; }
  function sungIn(line) { return /[a-gA-G]/.test(line.replace(/"[^"]*"/g, "").replace(/![^!]*!/g, "")); }
  function read(abc) {
    var secs = [], cur = null, voice = "";
    String(abc || "").split(/\r?\n/).forEach(function (raw) {
      var line = raw.trim(), m = line.match(/^%\s*([A-Za-z][\w -]*)\s*$/);
      if (m) { cur = { name: m[1].trim().toLowerCase(), bars: 0, sung: 0 }; secs.push(cur); return; }
      var v = line.match(/^V:\s*(\S+)/) || line.match(/^\[V:\s*(\S+?)\]/);
      if (v) { voice = v[1].toLowerCase(); return; }
      if (!cur || !line || /^[A-Za-z]:/.test(line) || voice.indexOf("vocal") !== 0) return;
      line.split("|").forEach(function (cell, k, all) { if (k < all.length - 1 && cell.trim()) { cur.bars++; if (sungIn(cell)) cur.sung++; } });
    });
    secs = secs.filter(function (s) { return s.bars > 0; });
    secs.forEach(function (s) { s.inst = INST.test(s.name) || s.sung <= s.bars * 0.25; s.rest = s.inst ? s.bars - s.sung : 0; });   // its pickup bars are the vocal's
    var total = secs.reduce(function (n, s) { return n + s.bars; }, 0), head = String(abc || "");
    var mm = head.match(/^M:\s*(C\|?|\d+\s*\/\s*\d+)/m), qq = head.match(/^Q:\s*(?:(\d+)\s*\/\s*(\d+)\s*=\s*)?(\d+(?:\.\d+)?)/m), barSec = 0;
    if (mm && qq && +qq[3]) {                              // a bar's seconds by its meter and tempo, as section.py's _bar
      var nd = mm[1].charAt(0) === "C" ? [4, 4] : mm[1].replace(/\s/g, "").split("/").map(Number);
      barSec = (nd[0] / nd[1]) / (qq[1] ? +qq[1] / +qq[2] : 0.25) * 60 / +qq[3];
      if (!(barSec >= 0.3 && barSec <= 8)) barSec = 0;
    }
    var inst = secs.filter(function (s) { return s.inst; });
    return { secs: secs, bars: total, seconds: barSec ? total * barSec : 0, sungSecs: secs.length - inst.length, inst: inst, shortest: inst.length ? Math.min.apply(null, inst.map(function (s) { return s.rest; })) : 0 };
  }
  // the lyrics' sections that have words: what a full plan sings
  function lyricSections(lyrics) {
    var n = 0, open = false;
    String(lyrics || "").split(/\r?\n/).forEach(function (l) {
      var t = l.trim();
      if (/^\[[^\]]+\]$/.test(t)) { open = true; return; }
      if (t && open) { n++; open = false; }
    });
    return n;
  }
  function judge(set) {
    var done = set.items.filter(function (x) { return x.r; }), want = set.lyricSecs;
    done.forEach(function (x) { x.short = want > 0 && x.r.sungSecs < want; x.shortIns = x.r.inst.filter(function (s) { return s.rest < SHORT; }); });
    var whole = done.filter(function (x) { return !x.short; }), pool = whole.length ? whole : done;
    set.offer = null;
    pool.forEach(function (x) { if (!set.offer || x.r.sungSecs > set.offer.r.sungSecs || (x.r.sungSecs === set.offer.r.sungSecs && x.r.bars > set.offer.r.bars)) set.offer = x; });
    if (set.offer && done.length < 2) set.offer = null;      // one alone is offered nothing against
  }

  // ---- the panel in the take column
  function host() {
    var box = $("scoreSet");
    if (box && !box.dataset.wired) {
      box.dataset.wired = "1";
      box.addEventListener("click", function (e) {
        var b = e.target.closest("[data-sc]");
        if (!b) return;
        if (b.dataset.sc === "close") return close();
        if (b.dataset.sc === "use") return use(+b.dataset.i);
      });
      box.addEventListener("keydown", function (e) { if (e.key === "Escape" && !document.querySelector(".hd-back")) { e.preventDefault(); close(); } });
    }
    return box;
  }
  function itemHtml(x, set) {
    var head = '<span class="sc-n">' + (x.i + 1) + '</span><span class="sc-seed mono" translate="no">' + esc(fmt("seed {0}", x.seed)) + "</span>";
    if (x.error) return '<div class="sc-item is-bad">' + head + '<span class="sc-state">' + esc(x.error) + "</span></div>";
    if (!x.r) return '<div class="sc-item is-wait">' + head + '<span class="sc-state">' + esc(tr(x.state === "running" ? "planning…" : "waiting in the queue…")) + "</span></div>";
    var strip = x.r.secs.map(function (s) {
      return '<span class="sc-sec' + (s.inst ? " is-inst" : "") + (s.inst && s.rest < SHORT ? " is-short" : "") + '" translate="no">' + esc(s.name) + " " + s.bars + "</span>";
    }).join("");
    var flags = (x.short ? '<span class="sc-flag is-bad">' + esc(fmt("sings {0} of the lyrics' {1} sections", x.r.sungSecs, set.lyricSecs)) + "</span>" : "") +
      x.shortIns.map(function (s) { return '<span class="sc-flag is-warn">' + esc(fmt("a short instrumental: {0}, {1} bars", s.name, s.rest)) + "</span>"; }).join("");
    var offered = set.offer === x;
    return '<div class="sc-item' + (offered ? " is-offer" : "") + '"><div class="sc-line">' + head + '<span class="sc-bars">' + esc(fmt("{0} bars · {1} sections", x.r.bars, x.r.secs.length)) + (x.r.seconds ? " · ≈" + H.clock(x.r.seconds) : "") + "</span>" +
      '<span class="spacer"></span>' +
      '<button type="button" class="btn ghost small icon-btn" data-sc="use" data-i="' + x.i + '" aria-label="' + esc(fmt("Score {0} into the form", x.i + 1)) + '" data-tip="' + esc(fmt("Score {0} into the form with its music seed {1}: Generate then sings exactly this score on the seed that planned it", x.i + 1, x.seed)) + '">' + ico("corner-up-left") + "</button></div>" +
      (offered ? '<div class="sc-offer-line"><span class="sc-offer">' + esc(tr("the longest that sings every section")) + "</span></div>" : "") +
      '<div class="sc-strip">' + strip + "</div>" + (flags ? '<div class="sc-flags">' + flags + "</div>" : "") + "</div>";
  }
  function paint() {
    var box = host(), set = st.set;
    if (!box || !st.open || !set) return;
    judge(set);
    box.innerHTML = '<div class="sc-head"><span class="sc-ico">' + ico("layers") + '</span><h3 class="sc-title">' + esc(tr("Scores to choose from")) + '</h3><span class="sc-base" translate="no">' + esc(set.title) + "</span>" +
      '<span class="spacer"></span><button type="button" class="btn ghost small icon-btn" data-sc="close" aria-label="' + esc(tr("Close the scores")) + '" data-tip="' + esc(tr("Close the scores (Esc)")) + '">' + ico("x") + "</button></div>" +
      '<p class="row-hint sc-hint">' + esc(set.lyricSecs ? fmt("The lyrics have {0} sections with words; a score that sings fewer is cut short.", set.lyricSecs) : tr("A score costs seconds, its sound minutes: choose before singing.")) + "</p>" +
      '<div class="sc-list">' + set.items.map(function (x) { return itemHtml(x, set); }).join("") + "</div>";
  }
  // each plan's run followed by its record: «done» lands through the page's own finish (got), a failure or a cancel by the run's state
  function follow() {
    var set = st.set;
    if (!set) return;
    var jobs = H.jobs(), changed = false;
    set.items.forEach(function (x) {
      if (x.r || x.error || !x.job) return;
      var j = jobs.filter(function (q) { return q.id === x.job; })[0];
      if (!j) return;
      var s = j.status === "running" || j.status === "saving" ? "running" : j.status;
      if (s === "failed" || s === "cancelled") { x.error = s === "cancelled" ? tr("cancelled") : (j.error || tr("the plan failed")); changed = true; }
      else if (s !== x.state) { x.state = s; changed = true; }
    });
    if (changed) paint();
    if (set.items.every(function (x) { return x.r || x.error; })) { clearInterval(st.timer); st.timer = 0; }
  }
  // the page's finishPlan hands a plan of a set here; true when it was one
  function got(jobId, abc) {
    var set = st.set, x = set && set.items.filter(function (y) { return y.job === jobId; })[0];
    if (!x) return false;
    x.abc = abc; x.r = read(abc);
    if (!x.r.bars) { x.r = null; x.error = tr("no bars in the score it wrote"); }
    if (st.open) paint();
    return true;
  }
  function use(i) {
    var x = st.set && st.set.items[i];
    if (!x || !x.abc) return;
    H.put(x.abc, x.seed, st.set.loras);
    H.toast(fmt("Score {0} in the form with its music seed {1}: Generate sings exactly it", i + 1, x.seed), "good");
  }

  function ask() {
    var body;
    try { body = H.build(); } catch (e) { return H.toast(e.message, "bad"); }
    if (body.cot === "off") return H.toast(tr("Planning writes a score: choose Full plan or Melody only"), "bad");
    if (!body.style || !String(body.lyrics || "").trim()) return H.toast(tr("A style prompt and lyrics are both required"), "bad");
    var n = Math.max(2, Math.min(4, H.probes() > 1 ? H.probes() : 3)), fixed = H.fixedSeed(), seeds = [];
    for (var k = 0; k < n; k++) seeds.push(fixed !== null ? String(BigInt(fixed) + BigInt(k)) : String(H.seed()));
    var set = { title: body.title || tr("Untitled"), lyricSecs: lyricSections(body.lyrics), loras: body.loras || [], items: seeds.map(function (s, k) { return { i: k, seed: s, state: "queued" }; }) };
    st.set = set; open();
    var chain = Promise.resolve();
    set.items.forEach(function (x) {
      chain = chain.then(function () {
        var plan = Object.assign({}, body, { plan_only: true, lm_seed: x.seed, lm_batch_size: 1, title: (body.title || "") + " · " + fmt("score {0}", x.i + 1) });
        if (body.abc) delete plan.abc;
        return H.submit(plan, { kind: "plan", title: plan.title }).then(function (job) { x.job = job.id; H.mark(job.id); }, function (e) { x.error = e.message; });
      }).then(paint);
    });
    chain.then(function () { clearInterval(st.timer); st.timer = setInterval(follow, 1500); follow(); });
    H.toast(fmt("Planning {0} scores on their own seeds: seconds each", n));
  }
  function open() {
    var box = host();
    if (!box) return;
    if (window.HeresySongHist && window.HeresySongHist.isOpen()) window.HeresySongHist.close();
    st.open = true;
    $("view-take").classList.add("is-scores");
    box.hidden = false;
    paint();
    $("view-take").scrollTop = 0;
  }
  function close() {
    if (!st.open) return;
    st.open = false;
    var box = $("scoreSet");
    if (box) { box.hidden = true; box.innerHTML = ""; }
    $("view-take").classList.remove("is-scores");
  }
  function init(hooks) {
    H = hooks;
    var b = $("scoresBtn"), plan = $("planBtn");
    if (b) b.addEventListener("click", function () { if (!b.disabled) ask(); });
    if (b && plan) {                                         // as the score button: off in Direct, on with a mode that plans
      var mirror = function () { b.disabled = plan.disabled; };
      new MutationObserver(mirror).observe(plan, { attributes: true, attributeFilter: ["disabled"] }); mirror();
    }
    var chain = $("chain");
    if (chain) new MutationObserver(function () { if (st.open && !chain.hidden) close(); }).observe(chain, { attributes: true, attributeFilter: ["hidden"] });
  }
  // for the checks: a set of the given scores as if planned on these seeds, the engine left out
  function feed(abcs, seeds, lyrics) {
    st.set = { title: "check", lyricSecs: lyricSections(lyrics), loras: [], items: abcs.map(function (a, k) { return { i: k, seed: String(seeds[k]), state: "running", job: "feed-" + k }; }) };
    open();
    abcs.forEach(function (a, k) { got("feed-" + k, a); });
  }
  window.HeresyScores = { init: init, got: got, open: open, close: close, read: read, lyricSections: lyricSections, feed: feed, set: function () { return st.set; }, isOpen: function () { return st.open; } };
})();
