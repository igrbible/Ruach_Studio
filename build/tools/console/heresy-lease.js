// HERESY 2081 (Viktor 05.11.2026: «впиши в код Сторожа… глобально, как для браузера, так и для PWA, чтобы обрубал новые/дублирующие вкладки Студии и PWA,
// учитывая то, что в неё можно постучаться как на порту 7777, так и на 7443. Амэн? Нам хаос не нужен, и потенциальная порча json файлов пользователя.»):
// one Studio at a time. A tab on 7777 and one over https on 7443 are two origins, which share no BroadcastChannel and no Web Lock, so the lab holds a
// single writer's lease (lab/lease.py). This page makes an id as it loads, claims the lease and keeps it with a beat every 10 s (at once when it is
// hidden or shown again); it gives it back as it goes (closed, reloaded, left).
// · Another live window holds it (asked twice, 1.5 s apart: a reload's own window may still be giving it back): the page's own dialog asks. Work here
//   takes it, and the other window turns read-only at its next beat or write; Close this one closes this window (an app's window or one a script
//   opened closes; a tab the browser keeps open says calmly that it can be closed, with Work here in case).
// · Read-only: a plain banner under the bar and Work here, which takes the lease back and reads the Studio afresh (a reload, so nothing the other
//   window changed is written over). Its writes go nowhere: every request but a read or a listen is answered here with a 409 that says why; the lab
//   refuses them too, and its 409 turns a page that still believed itself the writer read-only at once.
// · Every write to the lab names this page (?inst=ID, ID@SCOPE for a page opened with ?scope=, whose lease is its own), so the lab can refuse it; the
//   engine's own few writes (Compute, Security, a take's card, a take deleted, a generation) are held here, in the page.
// · Not by itself in a test browser (the checks start it: window.ruachLease.start()); a lab without the lease (an older one, the suite's mock without
//   it) leaves the page as it was, and a lab not answering yet is asked again in 3 s. HERESY 2081b: a lease request waits up to 20 s (the live lab
//   answers in a second or two while a page comes up; 5 s cut a busy lab's answer, and the page ran unguarded until its retry)
// HERESY 2100 (Viktor's debug journal of 05.11.2026, ticket RS-20261105-9bf61f: on the road 213 lease requests fell between 16:00 and 20:00, 201 of
//   them cut by this page's own 20 s timer, and at 16:45 nineteen went out in 3.6 s): one lease request in flight at a time (a beat asked while one is
//   on its way is that one); a beat that gets no answer is a miss, and the next waits longer (10, 20, 40, 60 s), the misses said to the lab, which
//   keeps a holder on a bad line 90 s; a beat waits 8 s and a claim 15 s, each cut by a timer that says it is the lease's own; the page turns read-only
//   when two answers in a row say another window holds the lease (at once when it was taken by Create here there); one listener for the page's
//   comings and goings, at most one beat in 1.5 s from them. Each change is said to the page ("ruach-lease": {state, why}) and to the debug journal.
//   window.ruachLease: start(opts) · stop() · beat() · id() · scope() · state() · mayWrite() · takeBack() · isOpen(path) · misses() · asking() · settled()
// HERESY 2121: asking() (its Create here dialog up) and settled() (the promise of its answer), so a quick write held behind the question (heresy-link.js)
//   waits for the user's answer without counting that time against its own timer
(function () {
  "use strict";
  if (window.ruachLease) return;                       // HERESY 2100: one guard, one set of listeners
  var OPEN = { "/lab/lease": 1, "/lab/lora/bases": 1, "/lab/pianoteq/preview": 1, "/lab/audio/monitor/tone": 1, "/lab/audio/monitor/play": 1,
    "/lab/audio/monitor/stop": 1, "/lab/audio/probe": 1, "/lab/audio/loop": 1, "/lab/handoff": 1, "/tokenize": 1,
    "/lab/debug/bundle": 1, "/lab/debug/send": 1, "/lab/debug/clear": 1 };   // lab/lease.py's OPEN, and the engine's count of tokens (2102: the journal too)
  var TAKE_FLAG = "ruach.lease.take", BEAT = 10000, PAUSE = [10000, 20000, 40000, 60000];
  var W = { beat: 8000, claim: 15000 };                // HERESY 2100: how long a beat and a claim wait (the checks shorten them: config())
  var SCOPE = (function () { try { return new URLSearchParams(location.search).get("scope") || ""; } catch (e) { return ""; } })();
  var TITLE = "The Studio is already open in another window";
  var BODY = "Two windows at once could write over each other's changes, so one works and the other only shows and plays. Create here, and the other window turns read-only until you choose Create here in it again.";
  var WORK = "Create here", CLOSE = "Close this one";   // HERESY 2081c (Viktor 05.11.2026: «Творить здесь!»): no root «раб» in any language
  var BANNER = "Read-only: the Studio works in another window. Here you can look and listen; nothing is saved.";
  var GONE_T = "You can close this tab", GONE_P = "The Studio works in your other window.";
  var SAY = "Not saved: this window is read-only, the Studio works in another one.";
  var S = { id: newId(), on: false, state: "off", timer: 0, retry: 0, wait: null, done: null, banner: null, screen: null, hooks: {},
    flight: null, misses: 0, notHeld: 0, nudged: 0, nextAt: 0 };

  function tr(s) { return window.RuachI18n ? window.RuachI18n.t(s) : s; }
  function newId() {
    var a = new Uint8Array(12);
    try { crypto.getRandomValues(a); } catch (e) { for (var i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256); }
    return Array.prototype.map.call(a, function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
  }
  function app() {
    return !!window.matchMedia && ["standalone", "window-controls-overlay", "minimal-ui"].some(function (m) { return window.matchMedia("(display-mode: " + m + ")").matches; });
  }
  function pathOf(u) {
    try { var x = new URL(String(u), location.href); return x.origin === location.origin ? x.pathname : null; } catch (e) { return null; }
  }
  function named(u) {                                  // the page's name on a write to the lab
    var x = new URL(String(u), location.href);
    x.searchParams.set("inst", S.id + (SCOPE ? "@" + SCOPE : ""));
    return x.pathname + x.search + x.hash;
  }
  function refused() {
    return new Response(JSON.stringify({ error: tr(SAY), lease: { held: false, here: true } }), { status: 409, statusText: "Conflict", headers: { "Content-Type": "application/json" } });
  }
  function settled() { return S.wait || Promise.resolve(); }
  function waitFor() { if (!S.wait) S.wait = new Promise(function (r) { S.done = r; }); }
  function settle(state, why) {
    var was = S.state;
    S.state = state;
    var d = S.done;
    S.wait = null; S.done = null;
    if (d) d();
    if (was !== state) tell(state, why || "");
    return state;
  }
  function tell(state, why) {                           // HERESY 2100: the page and the debug journal hear each change, with its reason
    try { window.dispatchEvent(new CustomEvent("ruach-lease", { detail: { state: state, why: why, misses: S.misses } })); } catch (e) { /* an old browser */ }
    if (window.HeresyDebug && window.HeresyDebug.note) window.HeresyDebug.note({ k: "lease", to: state, why: why, missed: S.misses || undefined });
  }

  // ---- the page's requests: a write waits while the lease is asked for, goes named while this page holds it, and is answered here otherwise
  var nativeFetch = window.fetch;
  if (nativeFetch) window.fetch = function (input, init) {
    var self = this, args = arguments;
    if (S.state === "off") return nativeFetch.apply(self, args);
    var m = String((init && init.method) || (input && input.method) || "GET").toUpperCase();
    if (m === "GET" || m === "HEAD" || m === "OPTIONS") return nativeFetch.apply(self, args);
    var url = typeof input === "string" ? input : input && input.url ? input.url : String(input), p = pathOf(url);
    if (p === null || OPEN[p]) return nativeFetch.apply(self, args);   // another site's; a read or a listen
    // HERESY 2081c (Viktor 05.11.2026: the Studio «лежит мёртвецом» after Ctrl+F5 until the lease answered; 2081b let the claim take 20 s): a write never
    // waits for the lease to be asked for. While the claim is on its way it goes out at once, named, and the lab judges it (a free lease is this page's by
    // its write); one the lab refuses because another page holds the lease waits for the claim's answer and goes again if this page holds it then. The
    // dialog's question is the one wait left
    if (S.state === "pending") return send(true);
    return settled().then(function () {
      if (S.state === "off") return nativeFetch.apply(self, args);
      if (S.state !== "held") return refused();
      return send(false);
    });
    function send(early) {
      if (p.indexOf("/lab/") !== 0 || (typeof input !== "string" && !(input instanceof URL))) return nativeFetch.apply(self, args);
      return nativeFetch.call(self, named(url), init).then(function (r) {
        if (r.status !== 409) return r;
        return r.clone().json().then(function (b) {
          if (!b || !b.lease || b.lease.here) return r;
          if (early) return settled().then(function () { return S.state === "held" ? nativeFetch.call(self, named(url), init) : S.state === "off" ? r : refused(); });
          lost();
          return refused();
        }, function () { return r; });
      });
    }
  };
  var XO = XMLHttpRequest.prototype.open;              // an upload with its progress (Import): named, and refused by the lab when it must be
  XMLHttpRequest.prototype.open = function (m, u) {
    var a = Array.prototype.slice.call(arguments);
    try {
      var mm = String(m || "GET").toUpperCase(), p = S.state === "off" ? null : pathOf(u);
      if (p && p.indexOf("/lab/") === 0 && mm !== "GET" && mm !== "HEAD" && !OPEN[p]) a[1] = named(u);
    } catch (e) { /* as it was asked */ }
    return XO.apply(this, a);
  };
  if (navigator.sendBeacon) {                          // the settings sent as the page goes
    var NB = navigator.sendBeacon.bind(navigator);
    try {
      navigator.sendBeacon = function (u, data) {
        if (S.state === "off") return NB(u, data);
        var p = pathOf(u);
        if (p === null || OPEN[p]) return NB(u, data);
        if (S.state !== "held" && S.state !== "pending") return false;   // HERESY 2081c: named while the claim is on its way too
        return NB(p.indexOf("/lab/") === 0 ? named(u) : u, data);
      };
    } catch (e) { /* a browser that keeps it its own: the lab still refuses */ }
  }

  // ---- the lease
  function lab(op, extra) {
    var body = { op: op, id: S.id, hidden: document.visibilityState === "hidden", kind: app() ? "app" : "tab", port: location.port || (location.protocol === "https:" ? "443" : "80") };
    Object.keys(extra || {}).forEach(function (k) { body[k] = extra[k]; });
    // a lab that hangs is a lab not answering (2081b: 20 s, not 5; HERESY 2100: a beat 8 s, a claim 15 s, and the cut says it is the lease's own timer,
    // so the journal does not take it for a request stuck on the line)
    var ms = op === "beat" ? W.beat : W.claim;
    var ctl = op !== "release" && window.AbortController ? new AbortController() : null, t = ctl ? setTimeout(function () {
      var why = "the lease's own timer: no answer to its " + op + " in " + ms / 1000 + " s";
      try { ctl.abort(new DOMException(why, "TimeoutError")); } catch (e) { ctl.abort(); }
    }, ms) : 0;
    return nativeFetch("/lab/lease" + (SCOPE ? "?scope=" + encodeURIComponent(SCOPE) : ""), { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body), keepalive: op === "release", signal: ctl ? ctl.signal : undefined })
      .then(function (r) {
        clearTimeout(t);
        if (r.status === 404 || r.status === 405 || r.status === 501) return null;   // a lab without the lease
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      }, function (e) { clearTimeout(t); throw e; });
  }
  function start(opts) {
    opts = opts || {};
    if (opts.reload) S.hooks.reload = opts.reload;
    if (opts.close) S.hooks.close = opts.close;
    if (S.on) return settled().then(function () { return S.state; });
    S.on = true;
    var take = false;
    try { take = sessionStorage.getItem(TAKE_FLAG) === "1"; sessionStorage.removeItem(TAKE_FLAG); } catch (e) { /* no storage: claimed as any page */ }
    return claim(take, false);
  }
  function claim(take, again) {
    S.state = "pending"; waitFor();
    return lab(take ? "take" : "claim").then(function (st) {
      if (!st) return settle("off", "a lab without the lease");
      if (st.held) return hold(take ? "taken back (Create here)" : "claimed");
      if (!again) return new Promise(function (r) { setTimeout(r, 1500); }).then(function () { return S.on ? claim(false, true) : settle("off"); });
      return ask(st);
    }, function () {                                   // the lab not answering yet: the page as it was, asked again in 3 s (2081b)
      clearTimeout(S.retry);
      S.retry = setTimeout(function () { if (S.on && S.state === "off") claim(false, true); }, 3000);
      return settle("off", "the lab did not answer the claim: asked again in 3 s");
    });
  }
  function hold(why) {
    hideBanner(); hideScreen();
    S.misses = 0; S.notHeld = 0;
    next(BEAT);
    return settle("held", why || "held");
  }
  function next(ms) { clearTimeout(S.timer); S.nextAt = Date.now() + ms; S.timer = setTimeout(beat, ms); }   // HERESY 2100: a chain of timeouts, not an interval: a pause after a miss
  function beat() {
    if (!S.on || S.state !== "held") return Promise.resolve(S.state);
    if (S.flight) return S.flight;                     // HERESY 2100: one in flight; a beat asked meanwhile is that one
    clearTimeout(S.timer);
    var f = S.flight = lab("beat", { had: true, missed: S.misses }).then(function (st) {
      S.flight = null;
      if (S.misses) tell(S.state, "answered again after " + S.misses + " missed beat" + (S.misses > 1 ? "s" : ""));
      S.misses = 0;
      if (!st || st.held || S.state !== "held") { S.notHeld = 0; if (S.state === "held") next(BEAT); return S.state; }
      // another window holds it: at once when it was taken there by Create here; else at the second answer in a row (HERESY 2100)
      if (st.lost || ++S.notHeld >= 2) lost(st.lost ? "taken by Create here in another window" : "another window holds the lease (" + S.notHeld + " answers in a row)");
      else next(2000);
      return S.state;
    }, function (e) {                                  // a lab restarting, a line stalled: still the writer; the next beat after a pause
      S.flight = null;
      S.misses++;
      if (S.state === "held") {
        next(PAUSE[Math.min(S.misses, PAUSE.length) - 1]);
        if (window.HeresyDebug && window.HeresyDebug.note) window.HeresyDebug.note({ k: "lease", to: "held", why: "missed beat " + S.misses + ": " + String((e && e.message) || e).slice(0, 120), missed: S.misses });
      }
      return S.state;
    });
    return f;
  }
  function lost(why) {
    if (S.state !== "held") return;
    clearTimeout(S.timer);
    settle("read-only", why || "a write refused by the lab: another window holds the lease");
    showBanner();
  }
  function lostNow(why) { settle("read-only", typeof why === "string" ? why : "the take was not heard"); showBanner(); return S.state; }
  function ask(st) {
    S.state = "asking";
    var D = window.HeresyDialog;
    if (!D) return settle("read-only");
    return D.confirm(tr(TITLE) + "\n\n" + tr(BODY), { ok: tr(WORK), cancel: tr(CLOSE), must: true, cls: "rl-ask" }).then(function (yes) {
      if (!S.on) return settle("off");
      if (yes) return lab("take").then(function (t) { return !t ? settle("off") : t.held ? hold("Create here") : lostNow("Create here was not held"); }, lostNow);   // a take not heard: read-only, Work here again
      settle("dormant", "Close this one");
      try { (S.hooks.close || function () { window.close(); })(); } catch (e) { /* a tab the browser keeps */ }
      setTimeout(function () { if (S.state === "dormant") showScreen(); }, 400);
      return S.state;
    });
  }
  function takeBack() {                                // the lease back, and the Studio read afresh
    try { sessionStorage.setItem(TAKE_FLAG, "1"); } catch (e) { /* no storage: the reload claims, and asks if it must */ }
    (S.hooks.reload || function () { location.reload(); })();
  }
  function showBanner() {
    if (S.banner) return;
    var b = document.createElement("div");
    b.className = "rl-banner";
    b.setAttribute("role", "status");
    b.innerHTML = '<span class="rl-say"></span><button type="button" class="btn small primary rl-take"></button>';
    b.querySelector(".rl-say").textContent = BANNER;     // English here: the catalogs put it in the page's language, again when it changes
    b.querySelector(".rl-take").textContent = WORK;
    b.querySelector(".rl-take").addEventListener("click", takeBack);
    document.body.appendChild(b);
    S.banner = b;
  }
  function hideBanner() { if (S.banner) { S.banner.remove(); S.banner = null; } }
  function showScreen() {
    if (S.screen) return;
    var s = document.createElement("div");
    s.className = "rl-screen";
    s.innerHTML = '<div class="rl-box"><h2 class="rl-gone"></h2><p class="rl-other"></p><button type="button" class="btn ghost small rl-take"></button></div>';
    s.querySelector(".rl-gone").textContent = GONE_T;
    s.querySelector(".rl-other").textContent = GONE_P;
    s.querySelector(".rl-take").textContent = WORK;
    s.querySelector(".rl-take").addEventListener("click", takeBack);
    document.body.appendChild(s);
    S.screen = s;
  }
  function hideScreen() { if (S.screen) { S.screen.remove(); S.screen = null; } }
  function stop() {                                    // the checks' end: the lease given back, the page as it was
    var was = S.state;
    S.on = false;
    clearTimeout(S.timer); clearTimeout(S.retry);
    hideBanner(); hideScreen();
    S.flight = null; S.misses = 0; S.notHeld = 0;
    settle("off", "stopped");
    return was === "held" ? lab("release").catch(function () { return null; }) : Promise.resolve(null);
  }

  // HERESY 2100: the page's comings and goings beat at most once in 1.5 s, and never while a beat is on its way or a miss's pause runs
  document.addEventListener("visibilitychange", function () {
    var now = Date.now();
    if (S.state !== "held" || S.flight || S.misses || now - S.nudged < 1500) return;
    S.nudged = now;
    beat();
  });
  window.addEventListener("pagehide", function () { if (S.on && S.state === "held") lab("release").catch(function () {}); });
  window.addEventListener("pageshow", function (e) {   // back from the browser's cache: asked again, as a page that comes up
    if (e.persisted && S.on && (S.state === "held" || S.state === "off")) { clearTimeout(S.timer); S.flight = null; claim(false, false); }
  });
  window.ruachLease = { start: start, stop: stop, beat: beat, takeBack: takeBack, id: function () { return S.id; }, scope: function () { return SCOPE; },
    state: function () { return S.state; }, mayWrite: function () { return S.state === "off" || S.state === "held" || S.state === "pending"; }   /* HERESY 2081c: the claim on its way holds no write back */,
    isOpen: function (p) { return !!OPEN[p]; }, misses: function () { return S.misses; }, asking: function () { return S.state === "asking"; }, settled: settled, nextIn: function () { return S.state === "held" && !S.flight ? Math.max(0, S.nextAt - Date.now()) : null; },
    config: function (o) { Object.keys(o || {}).forEach(function (k) { if (k in W) W[k] = +o[k]; }); return Object.assign({}, W); }, texts: function () {
      return { title: TITLE, body: BODY, work: WORK, close: CLOSE, banner: BANNER, goneTitle: GONE_T, goneText: GONE_P, say: SAY }; } };
  if (!navigator.webdriver) start();                    // at once: a write the page makes as it comes up waits for the answer
})();
