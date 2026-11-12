/* HERESY 2098–2101 (Viktor's debug journal of 05.11.2026, ticket RS-20261105-9bf61f, read back that night; his word on the guard it serves, 05.11.2026:
   «Нам хаос не нужен, и потенциальная порча json файлов пользователя»): the page's writes and its line to the Studio, watched in one place.
   · 2098, a read-only window (2081's lease held by another): the controls that write are greyed and say why when pressed; a write refused, here or by
     the lab, is said in a toast that names what was pressed («Not saved (Like): …»), the same refusal never twice, and a refusal nobody caught is caught
     here, not left in the console. Nothing is lost without a word.
   · 2099, the writes: each one the page sends is counted until the Studio answers it; the count stands in the bar while any has waited over a second
     and a half, its tip naming them. The quick ones (a mark, a note, the settings, the Librarian's changes…) carry a write id (?wid=) and wait 20 s
     (60 on a far line); no answer, and they go again, twice more, 2 and 6 s apart, the lab answering a write it has done already with its first
     answer (lab/write_once.py): sent again is said, and a write that finally fails says so, and what it was.
   · 2101, the line: when three or more requests to the Studio and its lab have waited 8 s (24 on a far line) and nothing has answered in that time,
     the line is stuck, not the Studio: a quiet sign in the bar and beside the log's line time, and the background asks (the cards' graphs, the
     activity, the hardware…) wait until something answers, one each; the sign goes with the first answer.
   · HERESY 2120, one toast a failure: what this file has to say of a write lost (no answer, the last try answered 5xx) waits a moment (grace, 400 ms)
     for the caller's own toast of it («The chain did not start: …»); when one comes, these words stand under it as its second line (or nothing, when it
     says them already), and only when none comes are they a toast of their own.
   · HERESY 2121, a quick write held by the lease while its Create here is asked (heresy-lease.js) waits for the answer: that wait is the user's, never
     counted against its 20 s, so it never ends in «Not saved… after 3 tries» with nothing wrong on the line.
   window.HeresyLink: pending() · stuck() · actOf(el) · config({wait, stall, pauses, grace}) (the checks) */
(function () {
  "use strict";
  var F = window.fetch;                                // the lease's (it names a write and answers a refused one), around the journal's, around the browser's
  if (!F || window.HeresyLink) return;
  var QUICK = { "/lab/collection": 1, "/lab/settings": 1, "/lab/presets": 1, "/lab/playback": 1, "/lab/lyrics": 1, "/lab/writer": 1, "/lab/writer/versions": 1,
    "/lab/refiner/profiles": 1, "/lab/artist/note": 1, "/lab/artist/star": 1, "/lab/artist/protect": 1, "/lab/derived/mark": 1, "/lab/backups/seen": 1,
    "/lab/llm/hosts": 1, "/lab/video/save": 1, "/lab/orchestra/map": 1, "/lab/audio/gateway": 1, "/lab/audio/balance": 1, "/lab/train/protect": 1 };
  var QUIET = { "/lab/lease": 1, "/lab/perf/beat": 1 };   // the page's own heartbeat: never counted as the user's change
  // what waits for a long answer by its nature (a stream, a writer's reply, an upload, a download): never taken for a stalled line
  var LONG = /^\/(logs|events|lab\/(listen|relay|llm\/|debug\/|import|export|train\/file|weights|update|studio\/restart|video\/frame-upload)|library\/(listen|download)|api\/|transcribe$)/;
  // the background's asks: they wait while the line is stuck
  var POLL = /^\/(hardware|props|health\/engine|lab\/(gpus\/live|gpus|activity|perf|chain\/batch|section\/live|topology|backups|llm\/status|tls|refined|arts|sung\/marks|tail\/marks|train\/run|train\/datasets|train\/trash))$/;
  var WRITES = ["#generateBtn", "#assistBtn", "#applyDraft", "#wrNew", "#wrHandBtn", "#wrVersionRestore", "#pcRun", "#pcvSaveAs", "#impRun", "#gtRun", "#rmRun",
    "#mdRun", "#upRun", "#dbRun", "#inRun", "#glossRun", "#ktRun", "#arDraw", "#trMake", "#trRun", "#bbClean", "#bbNotes", "#bbBuild", "#saveSettings",
    "#gpuSave", "#ptqActivate", "#wtFetch", "#updRun", "#accSave", "#bkNow", "#c2paSave", "#orKeySave", "#orKeyForget", "#postDaw",
    "[data-lrate]", "[data-lfav]", "[data-crate]", "[data-cfav]", "[data-cmp-rate]", "[data-cmp-fav]", "[data-cmp-note]", "[data-ln-rate]", ".hmark", ".hreact",
    ".coll-act.prot", ".coll-note", ".coll-ren"].join(", ");
  var SAY = "Not saved: this window is read-only, the Studio works in another one.";
  var SAY_ACT = "Not saved ({0}): this window is read-only, the Studio works in another one.";
  var PHRASE = { "/lab/collection": "a change in the Librarian", "/lab/settings": "the settings", "/lab/presets": "the presets", "/lab/writer": "the Writer's document",
    "/lab/writer/versions": "the Musician's version", "/lab/refiner/profiles": "the Refiner's profile", "/lab/playback": "where the player stopped" };
  var C = { wait: 20000, stall: 8000, pauses: [2000, 6000], tries: 3, show: 1500, far: null, grace: 400 };   // far: null as HeresyNet measures it (the checks set it)
  var S = { seq: 0, open: {}, flight: {}, last: Date.now(), stuck: false, held: {}, act: null, said: {}, badge: null, link: null, timer: 0, saying: [] };

  function tr(s) { return window.RuachI18n ? window.RuachI18n.t(s) : s; }
  function far() { return C.far !== null ? !!C.far : !!(window.HeresyNet && window.HeresyNet.far && window.HeresyNet.far()); }
  function wait() { return far() ? C.wait * 3 : C.wait; }
  function stall() { return far() ? C.stall * 3 : C.stall; }
  function toast(t, kind) {                            // this file's own toasts are marked, so they are never taken for a caller's (2120)
    if (!window.HeresyToast) return;
    window.HeresyToast(t, kind || "");
    var box = document.getElementById("toasts"), el = box && box.lastChild;
    if (el && el.nodeType === 1) el.dataset.link = "1";
  }
  // HERESY 2120: a failure said once: the caller's own toast of it, if one comes within the grace, carries these words; else they are a toast
  function sayLost(text) {
    var s = { at: Date.now(), text: text, done: false };
    S.saying.push(s);
    setTimeout(function () {
      S.saying = S.saying.filter(function (x) { return x !== s; });
      if (!s.done) { s.done = true; toast(text, "bad"); }
    }, C.grace);
  }
  function joined(n) {                                 // a caller's toast of a failure come within the grace: the words under it, once
    if (!S.saying.length || n.dataset.link || !n.classList.contains("bad")) return;
    var now = Date.now();
    S.saying.forEach(function (s) {
      if (s.done || now - s.at > C.grace + 100) return;
      s.done = true;
      if ((n.textContent || "").indexOf(s.text) >= 0) return;   // it says them already (a caller's toast of the rejection's own words)
      var w = document.createElement("div"); w.className = "toast-why"; w.textContent = s.text; n.appendChild(w);
    });
  }
  function wid() {
    var a = new Uint8Array(9);
    try { crypto.getRandomValues(a); } catch (e) { for (var i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256); }
    return Array.prototype.map.call(a, function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
  }
  function pathOf(u) {
    try { var x = new URL(String(u), location.href); return x.origin === location.origin ? x.pathname : null; } catch (e) { return null; }
  }
  function tell(what, d) {                             // the debug journal hears it (heresy-debug.js)
    try { window.dispatchEvent(new CustomEvent("ruach-write", { detail: Object.assign({ what: what }, d) })); } catch (e) { /* an old browser */ }
  }

  // ---- what was pressed: the control a write came from, named as the page shows it (its words, else its tip), for the toast
  function actOf(el) {
    var c = el && el.closest ? el.closest(".hm-item, button, [role=button], [role=menuitem], a[href], label, input, select, textarea") : null;
    if (!c) return "";
    if (c.classList.contains("hm-item")) { var l = c.querySelector(".hm-label"); return l ? l.textContent.trim().slice(0, 60) : ""; }
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(c.tagName)) {
      var lab = c.closest("label") || (c.id && document.querySelector('label[for="' + c.id + '"]'));
      var w = lab ? ((lab.querySelector(".label") || lab).textContent || "").trim() : "";
      return w.slice(0, 60);
    }
    var words = (c.textContent || "").replace(/\s+/g, " ").trim();
    if (words && words.length <= 40 && /[\p{L}\d]/u.test(words)) return words;
    var k = c.getAttribute("aria-label") || c.getAttribute("data-tip") || c.title || "";
    return tr(k).split(/[:.;(]/)[0].trim().slice(0, 60);
  }
  ["click", "change"].forEach(function (t) {
    document.addEventListener(t, function (e) { if (e.isTrusted || window.__ruachActs) S.act = { at: Date.now(), el: e.target, name: actOf(e.target) }; }, true);
  });
  function act(path) {                                 // the control pressed a moment ago, else what the path is
    if (S.act && Date.now() - S.act.at < 4000 && S.act.name) return { name: S.act.name, el: S.act.el };
    return { name: tr(PHRASE[path] || "the change"), el: S.act && Date.now() - S.act.at < 4000 ? S.act.el : null };
  }

  // ---- 2098: a refusal said once, by what was pressed
  function refusal(path, a) {
    var t = a && a.name ? tr(SAY_ACT).replace("{0}", a.name) : tr(SAY);
    if (S.said[t] && Date.now() - S.said[t] < 3000) return;
    S.said[t] = Date.now(); S.said.any = Date.now();
    toast(t, "bad");
  }
  function isRefusal(text) {
    var m = String(text || "");
    return m.indexOf(SAY.slice(0, 40)) >= 0 || m.indexOf(tr(SAY).slice(0, 30)) >= 0 || /read-only, the Studio works in another/.test(m);
  }
  window.addEventListener("unhandledrejection", function (e) {   // a refusal nobody caught: said here, not left in the console
    var r = e.reason, m = r && r.message || r;
    if (!isRefusal(m)) return;
    e.preventDefault();
    if (!S.said.any || Date.now() - S.said.any > 3000) refusal("", act(""));
  });
  // a caller's own toast of the same refusal, a moment after this one's: one is enough
  function watchToasts() {
    var box = document.getElementById("toasts");
    if (!box || !window.MutationObserver) return;
    new MutationObserver(function (list) {
      list.forEach(function (m) {
        Array.prototype.forEach.call(m.addedNodes, function (n) {
          if (n.nodeType !== 1) return;
          joined(n);                                   // HERESY 2120
          if (!S.said.any || Date.now() - S.said.any > 3000) return;
          if (isRefusal(n.textContent) && !S.said[n.textContent]) n.remove();
        });
      });
    }).observe(box, { childList: true });
  }

  // ---- 2098: a read-only window: the controls that write greyed, and saying why when pressed
  function readOnly() { var L = window.ruachLease; return !!L && (L.state() === "read-only" || L.state() === "dormant"); }
  function paintRO() { document.documentElement.classList.toggle("rl-ro", readOnly()); }
  window.addEventListener("ruach-lease", paintRO);
  function greyRule() {                                // the one list above, greyed while read-only (app.css has the rest of the look)
    var st = document.createElement("style");
    st.id = "rlRoRule";
    st.textContent = "html.rl-ro :is(" + WRITES + ") { opacity: .42; filter: grayscale(1); cursor: not-allowed; }";
    (document.head || document.documentElement).appendChild(st);
  }
  document.addEventListener("click", function (e) {
    if (!readOnly()) return;
    var c = e.target && e.target.closest ? e.target.closest(WRITES) : null;
    if (!c || c.closest(".rl-banner, .rl-screen")) return;
    e.preventDefault(); e.stopImmediatePropagation();
    refusal("", { name: actOf(c), el: c });
    tell("refused", { m: "", p: "", el: c, why: "a write control in a read-only window" });
  }, true);

  // ---- 2099: the writes counted until answered; the count in the bar
  function track(m, path, a) {
    var id = ++S.seq;
    S.open[id] = { m: m, p: path, at: Date.now(), name: a.name, el: a.el, tries: 1 };
    schedule();
    return id;
  }
  function untrack(id) { delete S.open[id]; paint(); }
  function schedule() { clearTimeout(S.timer); S.timer = setTimeout(function () { paint(); }, C.show + 50); }
  function badge() {
    if (S.badge) return S.badge;
    var b = document.getElementById("wireBadge");
    if (b && window.HeresyIcons) b.querySelector(".wb-ico").innerHTML = window.HeresyIcons.ui("upload");
    return (S.badge = b);
  }
  function paint() {
    var b = badge(), now = Date.now(), list = Object.keys(S.open).map(function (k) { return S.open[k]; }).filter(function (x) { return now - x.at >= C.show; });
    if (!b) return;
    b.hidden = !list.length;
    if (!list.length) { b.classList.remove("is-again"); return; }
    b.querySelector(".wb-n").textContent = String(list.length);
    var again = list.filter(function (x) { return x.tries > 1; });
    b.classList.toggle("is-again", !!again.length);
    var tip = tr("Changes sent, not confirmed by the Studio yet: {0}").replace("{0}", list.length) + "\n" +
      list.slice(0, 8).map(function (x) { return "· " + x.name + " · " + Math.round((now - x.at) / 1000) + " s" + (x.tries > 1 ? " · " + tr("sent again ({0})").replace("{0}", x.tries - 1) : ""); }).join("\n");
    b.dataset.tip = tip;
    b.setAttribute("aria-label", tr("Changes sent, not confirmed by the Studio yet: {0}").replace("{0}", list.length));
    if (list.length) schedule();
  }

  // ---- 2101: the line stuck: several requests waiting together, nothing answering
  function lineStuck(on, waiting) {
    if (S.stuck === on) return;
    S.stuck = on;
    var l = document.getElementById("linkBadge");
    if (l) {
      if (window.HeresyIcons && !l.querySelector("svg")) l.innerHTML = window.HeresyIcons.ui("unlink");
      l.hidden = !on;
      if (on) {
        l.dataset.tip = tr("The line to the Studio is stuck: {0} requests have waited over {1} s and none has been answered. The Studio itself may be well; the page holds its background asks until one answers.")
          .replace("{0}", waiting).replace("{1}", Math.round(stall() / 1000));
        l.setAttribute("aria-label", tr("The line to the Studio is stuck"));
      }
    }
    try { window.dispatchEvent(new CustomEvent("ruach-link", { detail: { stuck: on, waiting: waiting, s: Math.round(stall() / 1000), held: Object.keys(S.held).length } })); } catch (e) { /* old */ }
    if (window.HeresyNet && window.HeresyNet.paint) window.HeresyNet.paint();
    if (!on) Object.keys(S.held).forEach(function (p) { var h = S.held[p]; delete S.held[p]; h(); });
  }
  setInterval(function () {
    var now = Date.now(), lim = stall();
    var old = Object.keys(S.flight).filter(function (k) { return now - S.flight[k].at > lim; }).length;
    if (!S.stuck && old >= 3 && now - S.last > lim && !document.hidden) lineStuck(true, old);
    else if (S.stuck && old < 3 && now - S.last <= lim) lineStuck(false, 0);
  }, 1000);
  function answered() { S.last = Date.now(); if (S.stuck) lineStuck(false, 0); }

  // ---- the page's requests
  window.fetch = function (input, init) {
    var self = this, args = arguments, url = typeof input === "string" ? input : input && input.url ? input.url : String(input), path = pathOf(url);
    if (path === null) return F.apply(self, args);
    var m = String((init && init.method) || (input && input.method) || "GET").toUpperCase();
    if (S.stuck && (m === "GET" || m === "HEAD") && POLL.test(path)) {   // 2101: a background ask waits for the line, one for each path
      if (S.held[path]) return Promise.reject(new Error(tr("Held: the line to the Studio is stuck; asked again when it answers")));
      return new Promise(function (ok) { S.held[path] = ok; }).then(function () { return window.fetch.apply(self, args); });
    }
    var long = LONG.test(path), fid = long ? 0 : ++S.seq;
    if (fid) S.flight[fid] = { p: path, at: Date.now() };
    var write = !long && m !== "GET" && m !== "HEAD" && m !== "OPTIONS" && !QUIET[path] && !(window.ruachLease && window.ruachLease.isOpen && window.ruachLease.isOpen(path));
    var a = write ? act(path) : null, tid = write ? track(m, path, a) : 0;
    var p = write && QUICK[path] && typeof input === "string" && reusable(init) ? quick(self, url, init, m, path, a, tid) : F.apply(self, args);
    return p.then(function (r) {
      if (fid) delete S.flight[fid];
      answered();
      if (tid) untrack(tid);
      if (write && r.status === 409) {
        r.clone().json().then(function (b) {
          if (b && b.lease) { refusal(path, a); tell("refused", { m: m, p: path, el: a.el, why: "409: " + String(b.error || "").slice(0, 80) }); }
        }, function () { /* another 409, the caller's */ });
      } else if (tid) tell("done", { m: m, p: path });
      return r;
    }, function (e) {
      if (fid) delete S.flight[fid];
      if (tid) {
        untrack(tid);
        if (!(e && e.name === "AbortError" && init && init.signal && init.signal.aborted)) {   // the caller's own abort is no failure
          if (!e || !e.ruachSaid) {
            sayLost(tr("No answer from the Studio for «{0}»: it may not have been done. Look before you do it again.").replace("{0}", a.name));   // HERESY 2120
            tell("failed", { m: m, p: path, el: a.el, why: String((e && e.message) || e) });
          }
        }
      }
      throw e;
    });
  };
  function reusable(init) {
    var b = init && init.body;
    return !b || typeof b === "string" || (window.FormData && b instanceof FormData) || (window.Blob && b instanceof Blob) ||
      (window.URLSearchParams && b instanceof URLSearchParams) || b instanceof ArrayBuffer || ArrayBuffer.isView(b);
  }
  // 2099: a quick write: its own id, its time, and two more tries, the lab answering one it has done with its first answer
  function quick(self, url, init, m, path, a, tid) {
    var id = wid(), u = url + (url.indexOf("?") >= 0 ? "&" : "?") + "wid=" + id, tries = 0, outer = init && init.signal, t0 = Date.now();
    return new Promise(function (resolve, reject) {
      (function go() {
        tries++;
        if (S.open[tid]) S.open[tid].tries = tries;
        var ctl = window.AbortController ? new AbortController() : null, ms = wait(), cut = false, over = false, timer = 0;
        // HERESY 2121: while the lease asks Create here (its dialog up), the write waits there for the user's answer: the time is counted anew from that answer
        var arm = function () {
          var L = window.ruachLease;
          if (L && L.asking && L.asking() && L.settled) {
            tell("held", { m: m, p: path, el: a.el, tries: tries, why: "the lease's Create here asked" });
            L.settled().then(function () { if (!over) arm(); });
            return;
          }
          timer = setTimeout(function () {
            var L2 = window.ruachLease;
            if (!over && L2 && L2.asking && L2.asking()) { arm(); return; }   // asked meanwhile: counted anew once it is answered
            cut = true;
            try { ctl.abort(new DOMException("no answer in " + Math.round(ms / 1000) + " s", "TimeoutError")); } catch (e) { ctl.abort(); }
          }, ms);
        };
        if (ctl) arm();
        if (outer && ctl) { if (outer.aborted) ctl.abort(outer.reason); else outer.addEventListener("abort", function () { ctl.abort(outer.reason); }); }
        var mine = Object.assign({}, init || {}, ctl ? { signal: ctl.signal } : {});
        F.call(self, u, mine).then(function (r) {
          over = true; clearTimeout(timer);
          var gone = r.status === 502 || r.status === 503 || r.status === 504;   // the engine without its lab, the lab still at the same write
          if (gone && tries < C.tries && !(outer && outer.aborted)) return again("HTTP " + r.status);
          if (gone) {                                    // the last try answered so too: said, and the answer handed on as it came
            sayLost(tr("Not saved: «{0}». The Studio did not answer after {1} tries ({2}); your change is not on its disk. Try again when the line is back.")
              .replace("{0}", a.name).replace("{1}", tries).replace("{2}", "HTTP " + r.status));   // HERESY 2120: under the caller's own toast, if it makes one
            tell("failed", { m: m, p: path, el: a.el, tries: tries, ms: Date.now() - t0, why: "HTTP " + r.status });
          } else if (tries > 1) tell("answered", { m: m, p: path, el: a.el, tries: tries, ms: Date.now() - t0 });
          resolve(r);
        }, function (e) {
          over = true; clearTimeout(timer);
          if (outer && outer.aborted) return reject(e);
          var why = cut ? tr("no answer in {0} s").replace("{0}", Math.round(ms / 1000)) : String((e && e.message) || e);
          if (tries < C.tries) return again(why);
          var err = new Error(tr("Not saved: «{0}». The Studio did not answer after {1} tries ({2}); your change is not on its disk. Try again when the line is back.")
            .replace("{0}", a.name).replace("{1}", tries).replace("{2}", why));
          err.ruachSaid = true;
          sayLost(err.message);                          // HERESY 2120: a caller that says the rejection says these words: one toast
          tell("failed", { m: m, p: path, el: a.el, tries: tries, ms: Date.now() - t0, why: why });
          reject(err);
        });
        function again(why) {
          tell("again", { m: m, p: path, el: a.el, tries: tries, ms: Date.now() - t0, why: why });
          if (tries === 1) toast(tr("No answer yet ({0}): «{1}» is sent again").replace("{0}", why).replace("{1}", a.name));
          if (S.open[tid]) S.open[tid].tries = tries + 1;
          paint();
          setTimeout(go, C.pauses[Math.min(tries, C.pauses.length) - 1]);
        }
      })();
    });
  }

  // an upload with its progress (Import) refused by the lab in a read-only window: said as a fetch's refusal is
  var XS = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function () {
    var x = this, a = act("");
    x.addEventListener("loadend", function () {
      if (x.status !== 409) return;
      try { var b = JSON.parse(x.responseText || "{}"); if (b && b.lease) { refusal("", a); tell("refused", { m: "POST", p: x.responseURL || "", el: a.el, why: "409" }); } } catch (e) { /* not the lease's */ }
    });
    return XS.apply(this, arguments);
  };

  function wire() { paintRO(); watchToasts(); badge(); }
  greyRule();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire); else wire();
  window.HeresyLink = {
    pending: function () { return Object.keys(S.open).map(function (k) { var x = S.open[k]; return { m: x.m, p: x.p, name: x.name, tries: x.tries, s: Math.round((Date.now() - x.at) / 1000) }; }); },
    stuck: function () { return S.stuck; }, held: function () { return Object.keys(S.held); }, actOf: actOf, writes: function () { return WRITES; },
    config: function (o) { Object.keys(o || {}).forEach(function (k) { C[k] = o[k]; }); return Object.assign({}, C); },
    refuse: function (name) { refusal("", { name: tr(name || ""), el: null }); tell("refused", { m: "", p: "", why: name || "" }); },
    texts: function () { return { say: SAY, sayAct: SAY_ACT }; }
  };
})();
