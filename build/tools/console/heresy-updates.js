// HERESY 1169 (Viktor 07.10.2026: «проверка на обновления — раз в сутки, неделю, месяц, никогда, кнопка "проверить сейчас",
// ... обновить автоматом, вручную. Попап для пользователя нового, скажем, через сутки. Настройка в Engine… на тегах новых
// релизов»; «для свежей установки Студии, и при апдейтах, если у пользователя не скачаны мои 💎 Воркспейсы, тоже попапом
// предложить скачать их. Гарантия, что только единицы додумаются до этого сами»): the Engine's Updates card; the look at
// GitHub's releases on this page's schedule (the lab asks: lab/updates.py); the window when one is out; after a day of use,
// the question how often; and the 💎 sets offered on a new studio and after each update, until they are here or refused.
// Nothing shows unless the lab answers: a studio without its lab, or the page's tests, stay quiet.
(function () {
  "use strict";
  var KEY = "yue2.updates", DAY = 86400000, EVERY = { day: DAY, week: 7 * DAY, month: 30 * DAY, never: 0 };
  var DEF = { every: "week", mode: "ask", rc: null, skip: "", asked: false, first: 0, seen: "", gems: "" };
  var S = { st: null, hooks: {}, watching: false };
  function $(id) { return document.getElementById(id); }
  function prefs() {
    var p = {};
    try { p = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { p = {}; }
    return Object.assign({}, DEF, p);
  }
  function keep(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { /* a private window */ } }
  function toast(t, k) { if (S.hooks.toast) S.hooks.toast(t, k); }
  function lab(path, body) {
    return fetch("/lab" + path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined)
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || "HTTP " + r.status); return d; }); });
  }
  function ago(ts) {
    var m = Math.round((Date.now() / 1000 - ts) / 60);
    return m < 2 ? "just now" : m < 120 ? m + " min ago" : m < 2880 ? Math.round(m / 60) + " h ago" : Math.round(m / 1440) + " days ago";
  }
  function size(b) { return b >= 1e9 ? (b / 1e9).toFixed(1) + " GB" : Math.max(1, Math.round(b / 1e6)) + " MB"; }
  function rcWanted(st) { var p = prefs(); return p.rc == null ? /-rc/.test((st && st.current) || "") : !!p.rc; }

  function paint() {
    var st = S.st, p = prefs(), line = $("updLine");
    if (!line) return;
    if (!st) { line.textContent = "Asking the lab…"; return; }
    var l = st.latest;
    line.textContent = st.current === undefined ? "The lab does not answer: " + (st.error || "") :
      "Ruach Studio " + st.current + " · " + (st.error ? "could not ask GitHub: " + st.error : !st.checked ? "not looked yet" :
        (st.newer ? l.version + " is out" : "up to date") + ", looked " + ago(st.checked));
    $("updEvery").value = p.every;
    $("updMode").value = p.mode;
    $("updRc").checked = rcWanted(st);
    $("updMode").disabled = !st.can_run;
    $("updWhy").textContent = st.can_run || !st.why ? "" : st.why;
    $("updRun").hidden = !(st.newer && st.can_run);
    $("updRun").textContent = st.newer ? "Update to " + l.version : "Update";
    $("updNotes").hidden = !l;
  }
  function refresh() {
    return lab("/update").then(function (st) { S.st = st; paint(); return st; },
      function (e) { S.st = { error: e.message }; paint(); return null; });
  }
  function check(manual) {
    if ($("updCheck")) $("updCheck").disabled = true;
    return lab("/update", { check: true, rc: rcWanted(S.st) }).then(function (st) {
      S.st = st; paint();
      if (manual) toast(st.error ? "Could not ask GitHub: " + st.error : st.newer ? "Ruach Studio " + st.latest.version + " is out" : "Up to date: " + st.current, st.error ? "bad" : "");
      return st;
    }, function (e) { if (manual) toast("No answer: " + e.message, "bad"); return null; })
      .then(function (st) { if ($("updCheck")) $("updCheck").disabled = false; return st; });
  }
  function said(notes) {
    var t = String(notes || "").replace(/\r/g, "").replace(/^#+\s*/gm, "").replace(/\*\*/g, "").trim();
    return t.length > 1400 ? t.slice(0, 1400).replace(/\s+\S*$/, "") + "…" : t;
  }
  function offer(st, fromCard) {
    var l = st.latest, p = prefs();
    var text = "Ruach Studio " + l.version + " is out\n\n" + (l.candidate ? "A release candidate: everything in it works and was checked, the last polish comes in the release.\n\n" : "") +
      said(l.notes) + "\n\n" + (st.can_run ? "The update fetches it, builds it and restarts the studio when nothing runs; your songs, models and settings stay."
        : "Here it cannot update by itself: " + st.why + ".");
    return window.HeresyDialog.confirm(text, { ok: st.can_run ? "Update now" : "Open the release page", cancel: "Later", alt: fromCard ? "" : "Skip this version" }).then(function (a) {
      if (a === "alt") { p.skip = l.version; keep(p); toast("Skipped " + l.version + ": the next release will be offered"); return; }
      if (a !== true) return;
      if (st.can_run) return run(st);
      window.open(l.url, "_blank", "noopener");
    });
  }
  function run(st) {
    if (S.hooks.idle && !S.hooks.idle()) { toast("A run is going: the update waits until nothing runs", "bad"); return; }
    return lab("/update", { run: st.latest.version }).then(function () {
      toast("Updating to " + st.latest.version + ": the studio builds it, then restarts");
      watch(st.latest.version);
    }, function (e) { toast("No update: " + e.message, "bad"); });
  }
  function watch(version) {                 // the update's last words in the card; back with the new version: the page reloads
    if (S.watching) return;
    S.watching = true;
    var t = setInterval(function () {
      lab("/update/log").then(function (d) { var last = (d.log || "").trim().split("\n").pop(); if (last && $("updWhy")) $("updWhy").textContent = last; }, function () {});
      lab("/update").then(function (st) {
        if (st.current === version) { clearInterval(t); toast("Ruach Studio " + version + ": reloading the page"); setTimeout(function () { location.reload(); }, 1500); }
      }, function () { /* restarting */ });
    }, 3000);
  }
  function askHowOften() {
    return window.HeresyDialog.choose("How often should the studio look for a new release?\n\nIt asks GitHub for the list of its releases, nothing more. When one is out you are asked first; Engine → Updates can update by itself instead, and look whenever you ask.",
      [{ label: "Every week", value: "week", note: "recommended", current: true }, { label: "Every day", value: "day" }, { label: "Every month", value: "month" },
        { label: "Never", value: "never", note: "Engine → Updates looks when you ask" }], { cancel: "Ask me later" }).then(function (v) {
      if (!v) return;
      var p = prefs(); p.every = v; p.asked = true; keep(p); paint();
    });
  }
  function gems(st) {                       // the 💎 sets, on a new studio and after an update, until here or refused
    var p = prefs();
    if (p.gems === "never" || p.seen === st.current) return Promise.resolve();
    return lab("/collection/diamonds").then(function (d) {
      var missing = (d.sets || []).filter(function (s) { return s.published && !s.here; }), q = prefs();
      q.seen = st.current; keep(q);
      if (!missing.length) return;
      var list = missing.map(function (s) { return "💎 " + String(s.name).replace(/^💎\s*/, "") + (s.takes ? " · " + s.takes + " takes" : "") + (s.bytes ? " · " + size(s.bytes) : ""); }).join("\n");
      return window.HeresyDialog.confirm("The studio's 💎 sets\n\nTakes made with this studio and approved by its author, to hear what YuE2 does and make it again: instruments, " +
        "styles and voices, each with its whole request. You do not have these yet:\n\n" + list + "\n\nEach comes as a workspace of its own; only what you pick is downloaded.",
        { ok: "Open the sets", cancel: "Not now", alt: "Don't ask again" }).then(function (a) {
        if (a === "alt") { var r = prefs(); r.gems = "never"; keep(r); }
        else if (a === true && S.hooks.hub) S.hooks.hub();
      });
    }, function () { /* no lab, no list: nothing to offer */ });
  }
  function due(st) {
    var every = EVERY[prefs().every] || 0;
    return !!every && (!st.checked || Date.now() / 1000 - st.checked >= every / 1000);
  }
  function schedule() {
    var p = prefs();
    if (!p.first) { p.first = Date.now(); keep(p); }
    return refresh().then(function (st) {
      if (!st || st.current === undefined) return null;      // no lab: quiet
      return gems(st).then(function () {
        var q = prefs();
        return !q.asked && Date.now() - q.first >= DAY ? askHowOften() : null;
      }).then(function () { return due(st) ? check(false) : st; });
    }).then(function (st) {
      if (!st || !st.newer || st.latest.version === prefs().skip) return;
      if (prefs().mode === "auto" && st.can_run && (!S.hooks.idle || S.hooks.idle())) return run(st);
      return offer(st, false);
    }).catch(function () {});
  }
  function init(hooks) {
    S.hooks = hooks || {};
    if ($("updEvery")) {
      $("updEvery").addEventListener("change", function () { var p = prefs(); p.every = this.value; p.asked = true; keep(p); });
      $("updMode").addEventListener("change", function () { var p = prefs(); p.mode = this.value; keep(p); });
      $("updRc").addEventListener("change", function () { var p = prefs(); p.rc = this.checked; keep(p); });
      $("updCheck").addEventListener("click", function () { check(true); });
      $("updRun").addEventListener("click", function () { if (S.st && S.st.newer) offer(S.st, true); });
      $("updNotes").addEventListener("click", function () {
        var l = S.st && S.st.latest;
        if (l) window.HeresyDialog.alert("Ruach Studio " + l.version + "\n\n" + said(l.notes) + (l.url ? "\n\n" + l.url : ""));
      });
    }
    paint();
    setTimeout(schedule, S.hooks.delay == null ? 12000 : S.hooks.delay);   // after the page has settled
  }
  window.HeresyUpdates = { init: init, refresh: refresh, check: check, schedule: schedule, gems: gems, offer: offer, prefs: prefs, paint: paint };
})();
