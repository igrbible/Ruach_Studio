// HERESY 2083 (Viktor 05.11.2026: «в Движок умолчанием пропиши ежесуточный/ежечасовой бекап json данных пользователя, с предвыбранной ротацией gz
// бекапов. Это когда-то, да спасёт кого-то от потери всего… А восстановление только при одном единственном условии — реально битые файлы настроек,
// библиотеки и т.п.»): Engine → Folders and Security → Backups of your data, over the lab's backups.py. Every hour and every day on or off, how many
// of each to keep, the folder, Back up now, the last snapshot's time and size. No button puts a snapshot back: the lab does it alone, over a file
// that is truly broken, and the page says once which file came back and from when (a dialog after the start, by the window that writes).
// A test page (?scope=…) changes nothing: the lab answers it with the state as it stands.
//   HeresyBackups.init(hooks) · HeresyBackups.load() · HeresyBackups.notices() · HeresyBackups.state()   (the last two for the checks)
(function () {
  "use strict";
  var S = { data: null, hooks: {}, busy: false, told: {} };
  function $(id) { return document.getElementById(id); }
  function tr(s) { return window.RuachI18n ? window.RuachI18n.t(s) : s; }
  function toast(t, k) { if (S.hooks.toast) S.hooks.toast(t, k); }
  function size(b) {
    if (b == null || !isFinite(b)) return "";
    return b >= 1073741824 ? (b / 1073741824).toFixed(1) + " GB" : b >= 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB";
  }
  function when(at) {
    var lang = document.documentElement.lang || undefined;
    try { return new Date(at * 1000).toLocaleString(lang, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }); }
    catch (e) { return new Date(at * 1000).toLocaleString(); }
  }
  function scoped(path) {
    var m = /[?&]scope=([^&#]+)/.exec(location.search);
    return m ? path + (path.indexOf("?") < 0 ? "?" : "&") + "scope=" + m[1] : path;
  }
  function lab(path, body) {
    var opt = body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {};
    return fetch("/lab" + (body ? scoped(path) : path), opt)
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || "HTTP " + r.status); return d; }); });
  }

  function load() {
    if (!$("backupsCard")) return Promise.resolve(null);
    return lab("/backups").then(function (d) { S.data = d; paint(); return d; }).catch(function (e) {
      $("bkLine").textContent = tr("The lab does not answer:") + " " + e.message;
      return null;
    });
  }
  function paint() {
    var d = S.data;
    if (!d) return;
    $("bkHourly").checked = !!d.on.hourly;
    $("bkDaily").checked = !!d.on.daily;
    if (document.activeElement !== $("bkKeepHourly")) $("bkKeepHourly").value = d.keep.hourly;
    if (document.activeElement !== $("bkKeepDaily")) $("bkKeepDaily").value = d.keep.daily;
    $("bkLine").textContent = d.last ? tr("Last snapshot: {0} · {1}").replace("{0}", when(d.last.at)).replace("{1}", size(d.last.size)) : tr("No snapshot yet.");
    $("bkWhere").textContent = tr("Folder: {0}").replace("{0}", d.folder || "");
    $("bkNow").disabled = S.busy;
  }
  function keep(input) {
    var n = Math.round(+input.value);
    return isFinite(n) && n >= 1 && n <= 1000 ? n : null;
  }
  function change() {
    var body = { hourly: $("bkHourly").checked, daily: $("bkDaily").checked }, h = keep($("bkKeepHourly")), dd = keep($("bkKeepDaily"));
    if (h) body.keep_hourly = h;
    if (dd) body.keep_daily = dd;
    return lab("/backups", body).then(function (d) { S.data = d; paint(); }, function (e) { toast(e.message, "bad"); paint(); });
  }
  function now() {
    S.busy = true; paint();
    return lab("/backups/now", {}).then(function (d) {
      S.busy = false; S.data = d; paint();
      if (d.made) toast(tr("Backed up: {0}").replace("{0}", size(d.made.size)));
    }, function (e) { S.busy = false; paint(); toast(e.message, "bad"); });
  }

  // the files the lab put back since the page last said so: once, in a dialog, by the window that writes (a read-only one leaves it to that one)
  function notices(given) {
    var L = window.ruachLease;
    if (L && !L.mayWrite()) return Promise.resolve(null);
    return (given ? Promise.resolve(given) : lab("/backups")).then(function (d) {
      var list = ((d && d.notices) || []).filter(function (n) { return !S.told[n.id]; });
      if (!list.length || !window.HeresyDialog) return null;
      list.forEach(function (n) { S.told[n.id] = 1; });
      var lines = list.map(function (n) {
        return n.restored ? tr("{0} was broken: it is back as it was at {1}.").replace("{0}", n.file).replace("{1}", when(n.from)) + " " +
          tr("The broken copy is kept in {0}.").replace("{0}", n.aside || "user/backups/broken/")
          : tr("{0} is broken, and no snapshot holds it whole: it stays as it is.").replace("{0}", n.file);
      });
      return window.HeresyDialog.alert(tr("Restored from a backup") + "\n\n" + lines.join("\n")).then(function () {
        return lab("/backups/seen", { ids: list.map(function (n) { return n.id; }) }).catch(function () { return null; });
      });
    }).catch(function () { return null; });
  }

  function init(hooks) {
    S.hooks = hooks || {};
    if ($("bkHourly")) {
      ["bkHourly", "bkDaily"].forEach(function (id) { $(id).addEventListener("change", change); });
      ["bkKeepHourly", "bkKeepDaily"].forEach(function (id) { $(id).addEventListener("change", function () { if (keep($(id))) change(); else paint(); }); });
      $("bkNow").addEventListener("click", now);
    }
    // the start's notice: not by itself in a test browser or on a test page (the checks call HeresyBackups.notices over a mock of their own)
    if (!navigator.webdriver && !/[?&]scope=/.test(location.search)) setTimeout(notices, 6000);
  }
  window.HeresyBackups = { init: init, load: load, notices: notices, state: function () { return S.data; } };
})();
