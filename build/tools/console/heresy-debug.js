/* HERESY 2054 (Viktor 03.11.2026: «В Движке добавляем вкладку Debugging… ничего не отсылается никуда, кроме как по решению пользователя… Анонимизация
   абсолютная… Сторож на приватные данные пользователя… "Скачать лог", "Отправить лог"»; 04.11.2026: «Гони»): the debug journal. Off unless chosen (yue2.debug).
   On, this browser keeps (IndexedDB, the last day only, sixty thousand events at most): what was clicked, right-clicked, double-clicked or dropped (the
   element by its id and kind, never its words), keys pressed as commands (never what was typed), the rooms and windows opened, each request to the Studio
   (method, path, status, time; no query, no body; a GET answered well is kept once a minute), the page's own errors; with «A detailed pointer trail», where
   the pointer went, five times a second. A DEBUG mark in the bar while it is on (a click: Engine → Debugging). Engine → Debugging: the switch, how much is
   kept, Download, Send, Clear. Download and Send go through the lab (debugbundle.py), which puts the Studio's and the lab's own logs of the same hours beside
   it and scrubs all of it; the guard then says what it still found, and nothing leaves without a yes. Send posts the ZIP to the Studio's receiver and gives
   a ticket, which is all a public issue needs.
   HERESY 2102 (Viktor's journal of 05.11.2026, ticket RS-20261105-9bf61f, read back: what it lacked to tell a stalled line from a stalled page): keys by
   their code (Ctrl+Shift+2, not Ctrl+Shift+@), never a modifier alone, and nothing at all from a secret field (a password, the Pianoteq serial, the
   OpenRouter key, any field kept from autofill); the tab hidden or shown, and every request marked when it was made or answered in a hidden tab; the
   line as the browser knows it (navigator.connection) at load and at each change; how the page came (navigate, reload, back_forward), how long after
   the last load, and the build it is, at load and beside every stack; tasks of the page longer than 200 ms, and its memory once a minute; each
   request's start, the requests cut by the page's going, and for the polls folded into a minute their fastest, middle and slowest; the player's
   waits, stalls and errors and the time from a play to its sound; the lease's changes with their reasons; a write refused, sent again or lost, with
   its method, path and the control it came from; an icon's button by its tip, the Studio's own words; a window id on every event, so two windows of
   one browser are told apart; no «open» from the scripts that build the page, only after a hand has touched it. */
(function () {
  "use strict";
  var KEY = "yue2.debug", TRAIL = "yue2.debugTrail", SALT = "ruach.debugSalt", DBN = "ruach-debug", ST = "events", DAY = 864e5, MAX = 60000;
  var dbP = null, queue = [], timer = null, lastMove = 0, lastGet = {};
  // HERESY 2102: this window's own id (two documents of one browser told apart), the build, and whether a hand has touched the page yet
  var WIN = (function () {
    var a = [0, 0, 0];
    try { a = crypto.getRandomValues(new Uint8Array(3)); } catch (e) { a = [Math.random() * 256, Math.random() * 256, Math.random() * 256]; }
    return Array.prototype.map.call(a, function (b) { return ("0" + (b & 255).toString(16)).slice(-2); }).join("");
  })();
  var BUILD = (function () { var m = document.querySelector('meta[name="ruach-build"]'); return (m && m.content) || "dev"; })();
  var touched = false, flight = {}, seq = 0, lastPlayClick = 0;
  function $(id) { return document.getElementById(id); }
  function tr(s) { return window.RuachI18n ? window.RuachI18n.t(s) : s; }
  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function put(k, v) {
    try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* private mode */ }
    if (window.HeresySettings && window.HeresySettings.flush) window.HeresySettings.flush();
  }
  function on() { return get(KEY) === "on"; }
  function trail() { return on() && get(TRAIL) === "on"; }
  function toast(t, kind) { if (window.HeresyToast) window.HeresyToast(t, kind || ""); }

  // ------------------------------------------------------------------ the store
  function open() {
    if (dbP) return dbP;
    dbP = new Promise(function (ok, no) {
      if (!window.indexedDB) return no(new Error("no IndexedDB"));
      var r = indexedDB.open(DBN, 1);
      r.onupgradeneeded = function () { r.result.createObjectStore(ST, { autoIncrement: true }).createIndex("t", "t"); };
      r.onsuccess = function () { ok(r.result); };
      r.onerror = function () { no(r.error); };
    });
    dbP.catch(function () { dbP = null; });
    return dbP;
  }
  function flush() {
    clearTimeout(timer); timer = null;
    if (!queue.length) return Promise.resolve();
    var batch = queue.splice(0);
    return open().then(function (d) {
      return new Promise(function (ok) {
        var tx = d.transaction(ST, "readwrite"), s = tx.objectStore(ST);
        batch.forEach(function (e) { s.add(e); });
        tx.oncomplete = ok; tx.onerror = ok; tx.onabort = ok;
      });
    }).catch(function () {});
  }
  function note(e) {
    if (!on()) return;
    e.t = Date.now(); e.room = (document.body && document.body.dataset.tab) || ""; e.w = WIN;
    queue.push(e);
    if (queue.length > 400) flush(); else if (!timer) timer = setTimeout(flush, 1500);
  }
  function prune() {                                   // older than a day, and more than MAX: the oldest go
    return open().then(function (d) {
      return new Promise(function (ok) {
        var tx = d.transaction(ST, "readwrite"), s = tx.objectStore(ST);
        s.index("t").openCursor(IDBKeyRange.upperBound(Date.now() - DAY)).onsuccess = function (ev) { var c = ev.target.result; if (c) { c.delete(); c.continue(); } };
        s.count().onsuccess = function (ev) {
          var over = ev.target.result - MAX;
          if (over > 0) s.openCursor().onsuccess = function (e2) { var c = e2.target.result; if (c && over-- > 0) { c.delete(); c.continue(); } };
        };
        tx.oncomplete = ok; tx.onerror = ok; tx.onabort = ok;
      });
    }).catch(function () {});
  }
  function all() {
    return flush().then(open).then(function (d) {
      return new Promise(function (ok, no) {
        var r = d.transaction(ST).objectStore(ST).getAll();
        r.onsuccess = function () { var cut = Date.now() - DAY; ok((r.result || []).filter(function (e) { return e.t >= cut; })); };
        r.onerror = function () { no(r.error); };
      });
    });
  }
  function clearAll() {
    queue.length = 0;
    try { localStorage.removeItem(SALT); } catch (e) { /* private mode */ }   // a new journal, new marks
    return open().then(function (d) {
      return new Promise(function (ok) { var tx = d.transaction(ST, "readwrite"); tx.objectStore(ST).clear(); tx.oncomplete = ok; tx.onerror = ok; });
    }).catch(function () {});
  }

  // ------------------------------------------------------------------ what is kept
  var DATA = ["tab", "etab", "act", "ui", "cmp", "place", "ds", "sm", "i", "def", "defCheck", "hmark", "lrate", "ptqProduct", "dhi", "mode", "op", "kind", "view", "look"];
  function who(el) {                                   // an element by what the page calls it, its id or its data-* name; never its words
    var parts = [];
    for (var x = el, n = 0; x && x.nodeType === 1 && n < 4; x = x.parentElement, n++) {
      var bits = x.tagName.toLowerCase();
      if (x.id) bits += "#" + x.id;
      var tip = iconTip(x);
      if (tip) bits += "[tip=" + tip + "]";
      for (var i = 0; i < DATA.length; i++) {
        var v = x.dataset ? x.dataset[DATA[i]] : null;
        if (v != null && String(v).length <= 32) bits += "[" + DATA[i] + "=" + v + "]";
      }
      var cls = typeof x.className === "string" ? x.className.split(/\s+/).filter(Boolean)[0] : "";
      if (cls) bits += "." + cls;
      parts.push(bits);
      if (x.id) break;
    }
    return parts.join(" < ");
  }
  // HERESY 2102: an icon's button (no words of its own) by its tip or label, the Studio's own English (the page's dictionary key), never a user's words
  function iconTip(x) {
    if (!/^(BUTTON|A)$/.test(x.tagName) && x.getAttribute("role") !== "button") return "";
    if ((x.textContent || "").replace(/[\s\u22ef\u2026]/g, "") !== "" || !x.querySelector("svg, img, .hz-icon, .ui-ico")) return "";
    var I = window.RuachI18n, k = x.dataset.tip || x.getAttribute("aria-label") || x.title || "";
    if (I && I.en && !x.dataset.tip && x.getAttribute("aria-label")) { try { k = I.en(x) || k; } catch (e) { /* as it is */ } }
    k = String(k).replace(/[\[\]<]/g, " ").trim();
    return k.length <= 60 ? k : k.slice(0, 57) + "...";
  }
  function editable(t) { return !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || "")); }
  // HERESY 2102: a secret field: nothing of it is kept, not even that a key was pressed in it
  function secret(t) {
    if (!t || !t.tagName || !/^(INPUT|TEXTAREA)$/.test(t.tagName)) return false;
    var ac = String(t.getAttribute("autocomplete") || "").toLowerCase();
    return t.type === "password" || /^(off|one-time-code|new-password|current-password|cc-)/.test(ac) || t.hasAttribute("data-secret") ||
      /serial|key|token|secret|pass|otp/i.test(t.id || "");
  }
  function point(kind) {
    return function (e) {
      if (e.isTrusted) touched = true;
      if (secret(e.target)) return;                    // HERESY 2102
      if (kind === "click") lastPlayClick = Date.now();   // the click before a play (below: the time from it to the sound)
      note({ k: kind, el: who(e.target), x: Math.round(e.clientX || 0), y: Math.round(e.clientY || 0), b: e.button });
    };
  }
  document.addEventListener("click", point("click"), true);
  document.addEventListener("contextmenu", point("menu"), true);
  document.addEventListener("dblclick", point("dbl"), true);
  document.addEventListener("dragstart", function (e) { note({ k: "drag", el: who(e.target) }); }, true);
  document.addEventListener("drop", function (e) { note({ k: "drop", el: who(e.target), files: e.dataTransfer && e.dataTransfer.files ? e.dataTransfer.files.length : 0 }); }, true);
  var COMMAND = /^(Escape|Enter|Tab|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Home|End|PageUp|PageDown|Delete|Backspace|Insert|F\d{1,2}| )$/;
  // HERESY 2102: the key by its code (where it sits, not what it typed: Shift+2 is «2», not «@»), a modifier alone never
  function keyName(e) {
    var c = e.code || "";
    if (/^Key[A-Z]$/.test(c)) return c.slice(3);
    if (/^Digit\d$/.test(c)) return c.slice(5);
    if (/^Numpad\d$/.test(c)) return "Num" + c.slice(6);
    if (c === "Space" || e.key === " ") return "Space";
    if (c && !/^(Control|Shift|Alt|Meta|OS)(Left|Right)?$/.test(c) && !/^(Intl|Lang)/.test(c)) return c.replace(/^Numpad/, "Num");
    var k = e.key || "";
    return k.length === 1 ? k.toUpperCase() : k;
  }
  document.addEventListener("keydown", function (e) {
    if (e.isTrusted) touched = true;
    var mod = e.ctrlKey || e.metaKey || e.altKey, k = e.key || "", field = editable(e.target);
    if (/^(Control|Shift|Alt|AltGraph|Meta|OS|CapsLock|NumLock|ScrollLock|Fn|Hyper|Super)$/.test(k)) return;   // HERESY 2102: a modifier alone
    if (secret(e.target)) return;                                             // HERESY 2102: nothing from a secret field, not even Ctrl+V
    if (!mod && !COMMAND.test(k)) return;                                     // a letter, a digit, a sign: typing, never kept
    if (!mod && field && !/^(Escape|Tab|F\d{1,2})$/.test(k)) return;          // in a field even Enter and the arrows are its own
    if (mod && field && k.length === 1 && !/^[a-z]$/i.test(k) && (e.altKey || !/^(Key|Digit)/.test(e.code || ""))) return;   // AltGr's signs (Ctrl+Alt on Windows) and a Mac's Option ones are typing too; Ctrl+С of another layout is Ctrl+C
    note({ k: "key", key: (e.ctrlKey ? "Ctrl+" : "") + (e.metaKey ? "Meta+" : "") + (e.altKey ? "Alt+" : "") + (e.shiftKey && mod ? "Shift+" : "") +
           keyName(e), el: who(e.target) });
  }, true);
  document.addEventListener("pointermove", function (e) {
    var now = Date.now();
    if (now - lastMove < 200 || !trail()) return;
    lastMove = now;
    note({ k: "move", x: Math.round(e.clientX), y: Math.round(e.clientY) });
  }, true);
  new MutationObserver(function (list) {               // the rooms, and the windows and menus put over the page
    list.forEach(function (m) {
      if (m.type === "attributes") return note({ k: "room", to: document.body.dataset.tab || "" });
      if (!touched) return;                            // HERESY 2102: what the page builds as it comes up is no window opened
      Array.prototype.forEach.call(m.addedNodes, function (n) {
        if (n.nodeType === 1 && !/\b(toast|tip|hm-tip)\b/.test(String(n.className || ""))) note({ k: "open", el: who(n) });
      });
    });
  }).observe(document.body, { attributes: true, attributeFilter: ["data-tab"], childList: true });

  function pathOf(u) {
    var p = String(u || "").split("#")[0].split("?")[0];
    // HERESY 2102: another site's host is its class only («external»), as the lab's scrubber writes it
    try { var a = new URL(p, location.href); return a.origin === location.origin ? a.pathname : "external" + a.pathname; } catch (e) { return p.slice(0, 200); }
  }
  function med(a) { var s = a.slice().sort(function (x, y) { return x - y; }); return s[Math.floor(s.length / 2)]; }
  function fold(g) {                                   // HERESY 2102: the polls folded into a minute: how many, the fastest, the middle, the slowest
    if (!g || !g.n) return;
    note({ k: "net", m: g.m, p: g.p, s: g.s, fold: g.n, min: Math.min.apply(null, g.ms), med: med(g.ms), max: Math.max.apply(null, g.ms), h: g.h || undefined, st: g.st || undefined });
    g.n = 0; g.ms = []; g.h = 0; g.st = 0;
  }
  function net(m, p, s, ms, err, x) {
    if (!on() || p.indexOf("/lab/debug/") >= 0) return;
    x = x || {};
    var now = Date.now(), k = m + " " + p, hid = x.h ? 1 : undefined;
    if (m === "GET" && s >= 200 && s < 400) {          // the polls: once a minute, the rest folded into it (2102: with their times)
      var g = lastGet[k];
      if (g && now - g.t < 60000) { g.n++; g.ms.push(Math.round(ms)); if (hid) g.h++; if (!g.st) g.st = x.st; return; }
      fold(g);
      lastGet[k] = { t: now, n: 0, ms: [], m: m, p: p, s: s, h: 0, st: 0 };
      return note({ k: "net", m: m, p: p, s: s, ms: Math.round(ms), st: x.st, h: hid });
    }
    note({ k: "net", m: m, p: p, s: s, ms: Math.round(ms), st: x.st, h: hid, err: err ? String(err).slice(0, 160) : undefined, cut: x.cut || undefined });
  }
  // HERESY 2102: each request's start (the page's clock), whether its tab was hidden then or as it was answered, and the ones still out when the page goes
  function begin(m, p) {
    var id = ++seq;
    flight[id] = { m: m, p: p, t0: performance.now(), st: Date.now(), h: document.hidden };
    return id;
  }
  function end(id) { var f = flight[id]; delete flight[id]; return f; }
  var nativeFetch = window.fetch;
  if (nativeFetch) window.fetch = function (input, init) {
    var m = String((init && init.method) || (input && input.method) || "GET").toUpperCase(), p = pathOf(input && input.url || input);
    var r = nativeFetch.apply(this, arguments);
    if (on()) {
      var id = begin(m, p);
      r.then(function (res) { var f = end(id); if (f) net(m, p, res.status, performance.now() - f.t0, null, { st: f.st, h: f.h || document.hidden }); },
        function (e) { var f = end(id); if (f) net(m, p, 0, performance.now() - f.t0, (e && e.name && e.name !== "Error" && e.name !== "TypeError" ? e.name + ": " : "") + (e && e.message || e), { st: f.st, h: f.h || document.hidden }); });
    }
    return r;
  };
  var XO = XMLHttpRequest.prototype.open, XS = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, u) { this.__dbg = { m: String(m || "GET").toUpperCase(), p: pathOf(u) }; return XO.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function () {
    var x = this, d = x.__dbg;
    if (d && on()) {
      var id = begin(d.m, d.p);
      x.addEventListener("loadend", function () { var f = end(id); if (f) net(d.m, d.p, x.status, performance.now() - f.t0, null, { st: f.st, h: f.h || document.hidden }); });
    }
    return XS.apply(this, arguments);
  };
  window.addEventListener("error", function (e) {
    if (e.target && e.target !== window && e.target.tagName) return note({ k: "load-error", el: who(e.target) });
    note({ k: "error", msg: String(e.message || "").slice(0, 400), src: String(e.filename || "").split("/").pop().split("?")[0], line: e.lineno, col: e.colno,
           stack: String(e.error && e.error.stack || "").slice(0, 2000), b: BUILD, at: where(e.lineno) });
  }, true);
  window.addEventListener("unhandledrejection", function (e) {
    var r = e.reason;
    note({ k: "rejection", msg: String(r && r.message || r).slice(0, 400), stack: String(r && r.stack || "").slice(0, 2000), b: BUILD, at: whereStack(r && r.stack) });
  });
  // HERESY 2102: a line of the built page found in its source: the build's map (build.sh writes it at the page's end) names the file and its line
  function where(line) {
    var map = window.RUACH_BUILD_MAP;
    if (!map || !line) return undefined;
    var at = null;
    for (var i = 0; i < map.length && map[i][0] <= line; i++) at = map[i];
    return at ? at[1] + ":" + (line - at[0] + 1) : undefined;
  }
  function whereStack(stack) { var m = /:(\d+):\d+\)?\s*$/m.exec(String(stack || "").split("\n").slice(0, 3).join("\n")); return m ? where(+m[1]) : undefined; }
  var consoleError = console.error;
  console.error = function () {
    try {
      note({ k: "console", msg: Array.prototype.map.call(arguments, function (a) {
        if (a && a.stack) return String(a.stack);
        if (typeof a === "string") return a;
        try { return JSON.stringify(a); } catch (x) { return String(a); }
      }).join(" ").slice(0, 1000), b: BUILD });
    } catch (x) { /* never in the way */ }
    return consoleError.apply(console, arguments);
  };

  // ------------------------------------------------------------------ Engine → Debugging and the DEBUG mark
  function stats() {
    var line = $("dbgLine");
    if (!line) return Promise.resolve();
    return all().then(function (ev) {
      if (!ev.length) { line.textContent = tr(on() ? "On: nothing kept yet" : "Off: nothing is kept"); return; }
      var mb = JSON.stringify(ev).length / 1e6, hours = (Date.now() - ev[0].t) / 36e5;
      line.textContent = tr("{0} events over {1} h, {2} MB").replace("{0}", ev.length.toLocaleString()).replace("{1}", hours.toFixed(1)).replace("{2}", mb.toFixed(2)) +
        (on() ? "" : " · " + tr("off: nothing more is kept"));
    }).catch(function () { line.textContent = tr("This browser keeps no journal: its storage is closed to the page"); });
  }
  function paint() {
    var c = $("dbgOn"), t = $("dbgTrail"), b = $("debugBadge");
    if (c) c.checked = on();
    if (t) { t.checked = get(TRAIL) === "on"; t.disabled = !on(); }
    if (b) b.hidden = !on();
    return stats();
  }
  function setOn(v) {
    put(KEY, v ? "on" : null);
    if (v) note({ k: "start" });
    paint();
  }
  function salt() {
    var s = get(SALT);
    if (!s) {
      var a = new Uint8Array(8);
      if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(a); else for (var i = 0; i < a.length; i++) a[i] = Math.random() * 256;
      s = Array.prototype.map.call(a, function (x) { return ("0" + x.toString(16)).slice(-2); }).join("");
      try { localStorage.setItem(SALT, s); } catch (e) { /* private mode: a salt for this one */ }
    }
    return s;
  }
  function post(url, body) {
    var scope = new URLSearchParams(location.search).get("scope");
    return fetch(url + (scope ? "?scope=" + encodeURIComponent(scope) : ""), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (b) { if (!r.ok) throw new Error(b.error || "HTTP " + r.status); return b; }); });
  }
  function make() {                                     // the lab scrubs it, puts its logs beside it, and the guard reads it
    return all().then(function (ev) {
      if (!ev.length) throw new Error(tr("The journal is empty: turn it on and use the Studio first"));
      toast(tr("Making the journal: the lab scrubs it and reads it once more…"));
      return post("/lab/debug/bundle", { events: ev, salt: salt(), ua: navigator.userAgent, screen: screen.width + "x" + screen.height + "@" + (window.devicePixelRatio || 1),
                                         lang: document.documentElement.lang || "", since: Math.ceil((Date.now() - ev[0].t) / 1000) + 120 });
    });
  }
  function found(r) {
    var head = tr("The journal: {0} events, {1} h, {2} KB as a ZIP, scrubbed.").replace("{0}", (r.events || 0).toLocaleString()).replace("{1}", r.hours)
      .replace("{2}", Math.round((r.bytes || 0) / 1024));
    var f = r.findings || [];
    if (!f.length) return head + "\n\n" + tr("The guard found nothing private left in it.");
    return head + "\n\n" + tr("The guard still found:") + "\n" + f.map(function (x) { return "· " + tr(x.kind) + ": " + x.file + " × " + x.count + " (" + x.sample + ")"; }).join("\n") +
      "\n\n" + tr("Download it and look before it goes anywhere.");
  }
  function download() {
    make().then(function (r) {
      return window.HeresyDialog.confirm(found(r), { ok: tr("Download it") }).then(function (yes) {
        if (!yes) return;
        var a = document.createElement("a");
        a.href = "/lab/debug/download?id=" + encodeURIComponent(r.id); a.download = "ruach-debug-" + r.id + ".zip";
        document.body.appendChild(a); a.click(); a.remove();
      });
    }).catch(function (e) { toast(e.message, "bad"); });
  }
  function send() {
    make().then(function (r) {
      // HERESY 2140: the receiver at the card's own domain (the key changed with it in the 11 catalogs)
      return window.HeresyDialog.prompt(found(r) + "\n\n" + tr("It goes to the Studio's own receiver (ruachstudio.art), not to a public place. A word on what went wrong, if you like (no names, please):"),
        "", { ok: tr("Send it"), max: 500, placeholder: tr("what went wrong") }).then(function (note) {
        if (note === null) return;
        return post("/lab/debug/send", { id: r.id, note: note }).then(function (b) {
          return window.HeresyDialog.alert(tr("Sent. Your ticket: {0}").replace("{0}", b.ticket) + "\n\n" +
            tr("If you open an issue on GitHub, give it only this number: the journal itself stays with us, not in public."));
        });
      });
    }).catch(function (e) { toast(e.message, "bad"); });
  }
  function clearIt() {
    window.HeresyDialog.confirm(tr("Clear the journal? Everything kept in this browser goes, and the lab's last ZIP with it."), { ok: tr("Clear it") }).then(function (yes) {
      if (!yes) return;
      return clearAll().then(function () { return post("/lab/debug/clear", {}).catch(function () {}); }).then(function () { toast(tr("The journal is cleared")); paint(); });
    });
  }
  function wire() {
    if ($("dbgOn")) $("dbgOn").addEventListener("change", function () { setOn(this.checked); });
    if ($("dbgTrail")) $("dbgTrail").addEventListener("change", function () { put(TRAIL, this.checked ? "on" : null); });
    if ($("dbgDownload")) $("dbgDownload").addEventListener("click", download);
    if ($("dbgSend")) $("dbgSend").addEventListener("click", send);
    if ($("dbgClear")) $("dbgClear").addEventListener("click", clearIt);
    if ($("debugBadge")) $("debugBadge").addEventListener("click", function () {
      var t = $("engineToggle");
      if (document.body.dataset.tab !== "engine" && t) t.click();
      if (window.ruachEngineTab) window.ruachEngineTab("debug");
      paint();
    });
    var tab = document.querySelector('#engineTabs [data-etab="debug"]');
    if (tab) tab.addEventListener("click", function () { setTimeout(paint, 0); });
    paint();
    prune();
    setInterval(prune, 3600 * 1000);
    window.addEventListener("pagehide", function () { going(); flush(); });
    if (on()) loaded();
  }
  // ------------------------------------------------------------------ HERESY 2102: why the page is as it is
  function conn() {
    var c = navigator.connection;
    return c ? { type: c.type || undefined, eff: c.effectiveType || undefined, rtt: c.rtt, down: c.downlink, save: c.saveData || undefined } : undefined;
  }
  function loaded() {
    var nav = performance.getEntriesByType ? performance.getEntriesByType("navigation")[0] : null, last = 0, nowT = Date.now();
    try { last = +localStorage.getItem("ruach.debugLastLoad") || 0; localStorage.setItem("ruach.debugLastLoad", String(nowT)); } catch (e) { /* private mode */ }
    note({ k: "page", how: nav ? nav.type : (performance.navigation ? ["navigate", "reload", "back_forward"][performance.navigation.type] : undefined),
           since: last ? Math.round((nowT - last) / 1000) : undefined, b: BUILD, conn: conn(), hidden: document.hidden || undefined,
           ready: nav ? Math.round(nav.domContentLoadedEventEnd) : undefined, lease: window.ruachLease ? window.ruachLease.state() : undefined });
  }
  function going() {                                   // the requests still out as the page goes: cut by its going, said
    if (!on()) return;
    Object.keys(lastGet).forEach(function (k) { fold(lastGet[k]); });
    Object.keys(flight).forEach(function (id) {
      var f = flight[id];
      note({ k: "net", m: f.m, p: f.p, s: 0, ms: Math.round(performance.now() - f.t0), st: f.st, cut: "the page went", h: f.h || undefined });
    });
    flight = {};
  }
  document.addEventListener("visibilitychange", function () { note({ k: "vis", to: document.visibilityState }); });
  if (navigator.connection && navigator.connection.addEventListener) navigator.connection.addEventListener("change", function () { note({ k: "conn", conn: conn() }); });
  if (window.PerformanceObserver) {
    try {
      new PerformanceObserver(function (list) {
        list.getEntries().forEach(function (x) { if (x.duration >= 200) note({ k: "long", ms: Math.round(x.duration), at: Math.round(x.startTime) }); });
      }).observe({ type: "longtask", buffered: true });
    } catch (e) { /* a browser without longtasks */ }
  }
  function memNow() {                                  // the page's memory, once a minute (Chrome's own measure)
    var m = performance.memory;
    if (on() && m) note({ k: "mem", used: Math.round(m.usedJSHeapSize / 1048576), total: Math.round(m.totalJSHeapSize / 1048576), limit: Math.round(m.jsHeapSizeLimit / 1048576) });
    return !!m;
  }
  setInterval(memNow, 60000);
  // the player: what waited for data, what stalled, what failed, and how long a play took to sound (and from the click before it)
  var played = typeof WeakMap === "function" ? new WeakMap() : null;
  ["play", "playing", "waiting", "stalled", "error"].forEach(function (ev) {
    document.addEventListener(ev, function (e) {
      var a = e.target;
      if (!on() || !a || !/^(AUDIO|VIDEO)$/.test(a.tagName || "")) return;
      var src = pathOf(a.currentSrc || a.src || "");
      if (ev === "play") { if (played) played.set(a, { t: performance.now(), click: Date.now() - lastPlayClick < 4000 ? Date.now() - lastPlayClick : undefined }); return; }
      if (ev === "playing") {
        var p0 = played && played.get(a);
        if (p0) {
          played.delete(a);
          var ms = Math.round(performance.now() - p0.t);
          note({ k: "audio", ev: "sound", ms: ms, click: p0.click !== undefined ? Math.round(p0.click + ms) : undefined, src: src, el: who(a) });
        }
        return;
      }
      note({ k: "audio", ev: ev, src: src, el: who(a), at: Math.round((a.currentTime || 0) * 10) / 10, code: ev === "error" && a.error ? a.error.code : undefined,
             msg: ev === "error" && a.error && a.error.message ? String(a.error.message).slice(0, 160) : undefined });
    }, true);
  });
  // a write the page refused, sent again or lost (heresy-link.js says it), with its method, path and the control it came from
  window.addEventListener("ruach-write", function (e) {
    var d = e.detail || {};
    if (d.what === "done") return;
    note({ k: "write", what: d.what, m: d.m, p: pathOf(d.p), el: d.el ? who(d.el) : undefined, tries: d.tries || undefined, ms: d.ms, why: d.why ? String(d.why).slice(0, 160) : undefined });
  });
  window.addEventListener("ruach-link", function (e) { var d = e.detail || {}; note({ k: "link", stuck: !!d.stuck, waiting: d.waiting, s: d.s, held: d.held || undefined }); });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire); else wire();
  window.HeresyDebug = { on: on, note: note, all: all, flush: flush, clear: clearAll, paint: paint, who: who, make: make, win: function () { return WIN; },
    build: function () { return BUILD; }, keyName: keyName, secret: secret, where: where,
    memNow: memNow, foldNow: function () { Object.keys(lastGet).forEach(function (k) { fold(lastGet[k]); }); }, loaded: loaded };   // the checks
})();
