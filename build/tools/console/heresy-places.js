// HERESY 1283 (Viktor 09.10.2026: «время в движок Студии допилить кастомные пути для пользовательских данных… Предусмотри, чтобы
// RC3 автоматом подтягивал существующие пути развёртки, и в Engine — опции по изменению локации с переносом данных с одного
// места в другое»): the Engine's Folders card, over the lab's places.py of 1261. Where each folder of the user's work lives
// (Songs, Trash, Pictures, Writer), what it holds and the room left on its disk. Move… asks where to, has the lab say what the
// move would do (a rename on the same disk; else a copy, checked file by file, then the link switched, the old copy kept,
// renamed), and moves only on a second yes; the move's progress shows while it runs, and where the old copy stays when it is
// done. Back home brings a folder that lives elsewhere into the studio's folder again; Link again where the record knows a place
// the studio's folder does not point to (a fresh clone, a disk mounted late). A test page (?scope=…) moves nothing: the lab refuses.
//
//   HeresyPlaces.init(hooks) · HeresyPlaces.load() · HeresyPlaces.state()   (the last for the checks)
(function () {
  "use strict";
  var S = { data: null, timer: 0, hooks: {}, asked: false };
  function $(id) { return document.getElementById(id); }
  function tr(s) { return window.RuachI18n ? window.RuachI18n.t(s) : s; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function toast(t, k) { if (S.hooks.toast) S.hooks.toast(t, k); }
  function gb(b) {
    if (b == null || !isFinite(b)) return "";
    return b >= Math.pow(2, 40) ? (b / Math.pow(2, 40)).toFixed(2) + " TB" : b >= Math.pow(2, 30) ? (b / Math.pow(2, 30)).toFixed(1) + " GB" : Math.max(0, Math.round(b / Math.pow(2, 20))) + " MB";
  }
  function count(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, "\u202f"); }
  function scoped(path) {                                      // a test page says so to the lab, which then moves nothing
    var m = /[?&]scope=([^&#]+)/.exec(location.search);
    return m ? path + (path.indexOf("?") < 0 ? "?" : "&") + "scope=" + m[1] : path;
  }
  function lab(path, body) {
    var opt = body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {};
    return fetch("/lab" + (body ? scoped(path) : path), opt)
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || "HTTP " + r.status); return d; }); });
  }
  function seen() { var v = $("view-engine"); return !!(v && !v.classList.contains("is-hidden")); }
  function moving() { var j = S.data && S.data.job; return !!(j && j.phase !== "done" && j.phase !== "failed"); }
  function place(name) { return ((S.data && S.data.places) || []).filter(function (p) { return p.name === name; })[0] || null; }

  function load(refresh) {
    clearTimeout(S.timer);
    return lab("/places" + (refresh ? "?refresh=1" : "")).then(function (d) { S.data = d; paint(); }).catch(function (e) {
      $("plRows").innerHTML = '<p class="hint pl-bad">' + esc(tr("The lab does not answer:")) + " " + esc(e.message) + "</p>";
    }).then(schedule);
  }
  // while the card is seen: every 2 s while a move runs or a size is being counted, else nothing (a reopened Engine asks again)
  function schedule() {
    clearTimeout(S.timer);
    var counting = S.data && S.data.places && S.data.places.some(function (p) { return p.counting; });
    if (seen() && (moving() || counting)) S.timer = setTimeout(load, 2000);
  }

  var PHASE = { starting: "Starting…", count: "Counting what to copy…", rename: "Renaming…", check: "Checking the copy against the folder…", "switch": "Switching the link…" };
  function paint() {
    var d = S.data, box = $("plRows");
    if (!d || !box) return;
    var busy = moving();
    box.innerHTML = d.places.map(function (p) {
      var size = p.bytes != null ? count(p.files) + " " + tr("files") + " · " + gb(p.bytes) : p.counting ? tr("counting…") : "";
      var note = p.missing ? tr("not there: a disk not mounted?") : p.linked ? tr("linked from the studio's folder") : tr("in the studio's folder");
      if (p.elsewhere) note = tr("the record says it lives at") + " " + p.elsewhere;
      var acts = '<button type="button" class="btn ghost small" data-pl-move="' + esc(p.name) + '"' + (busy || p.missing ? " disabled" : "") + ">" + esc(tr("Move…")) + "</button>";
      if (p.linked && !p.missing) acts += '<button type="button" class="btn ghost small" data-pl-home="' + esc(p.name) + '"' + (busy ? " disabled" : "") + ">" + esc(tr("Back home")) + "</button>";
      if ((p.missing || p.elsewhere) && p.record && p.record.at) acts += '<button type="button" class="btn ghost small" data-pl-relink="' + esc(p.name) + '"' + (busy ? " disabled" : "") + ">" + esc(tr("Link again")) + "</button>";
      return '<div class="pl-row' + (p.missing ? " is-missing" : "") + '" data-name="' + esc(p.name) + '">' +
        '<div class="pl-name"><b>' + esc(tr(p.label)) + "</b><span>" + esc(tr(p.what)) + "</span></div>" +
        '<div class="pl-where"><code class="pl-path" translate="no">' + esc(p.real) + '</code><span class="pl-note">' + esc(note) +
          (p.free != null && !p.missing ? " · " + esc(gb(p.free)) + " " + esc(tr("free on its disk")) : "") + "</span></div>" +
        '<div class="pl-size mono">' + esc(size) + '</div><div class="pl-acts">' + acts + "</div></div>";
    }).join("");
    paintJob(d.job);
  }
  function paintJob(j) {
    var el = $("plJob");
    if (!el) return;
    el.hidden = !j;
    if (!j) return;
    var label = (place(j.name) || {}).label || j.name, txt;
    if (j.phase === "done") {
      txt = tr("{0} moved to {1}.").replace("{0}", tr(label)).replace("{1}", j.home ? tr("the studio's folder") : j.to) +
        (j.old ? " " + tr("The old copy stays at {0}: remove it after a look.").replace("{0}", j.old) : "");
    } else if (j.phase === "failed") {
      txt = tr("{0} did not move: {1}").replace("{0}", tr(label)).replace("{1}", j.error || "");
    } else if (j.phase === "copy") {
      var pct = j.total ? Math.min(100, Math.round(j.done / j.total * 100)) : 0;
      txt = tr("Copying {0}: {1} %, {2} of {3}, {4} of {5} files").replace("{0}", tr(label)).replace("{1}", pct).replace("{2}", gb(j.done)).replace("{3}", gb(j.total))
        .replace("{4}", count(j.files)).replace("{5}", count(j.of));
    } else {
      txt = tr(label) + ": " + tr(PHASE[j.phase] || j.phase);
    }
    el.textContent = txt;
    el.classList.toggle("is-bad", j.phase === "failed");
    el.classList.toggle("is-good", j.phase === "done");
  }

  function move(name, home) {
    var p = place(name);
    if (!p || moving()) return;
    var L = tr(p.label);
    var ask = home ? Promise.resolve("") : window.HeresyDialog.prompt(
      tr("Move {0} to another folder").replace("{0}", L) + "\n\n" +
      tr("A folder that is there already; {0} goes into it as «{1}». On the same disk it is renamed at once; on another it is copied, checked file by file, then the link is switched, and the old copy stays, renamed, for you to remove after a look.")
        .replace("{0}", L).replace("{1}", p.name) +
      (S.data.wsl ? "\n\n" + tr("A Windows path works too: D:\\Music is /mnt/d/Music.") : ""), "", { ok: tr("Plan the move"), max: 1000, placeholder: "/mnt/data/Ruach" });
    return ask.then(function (to) {
      if (to == null || (!home && !String(to).trim())) return;
      return lab("/places/plan?name=" + encodeURIComponent(name) + "&to=" + encodeURIComponent(to)).then(function (pl) {
        if (!pl.ok) return window.HeresyDialog.alert(tr("{0} cannot move there").replace("{0}", L) + "\n\n" + pl.why);
        var how = pl.same_disk ? tr("The same disk: the folder is renamed there at once, nothing is copied.")
          : tr("Another disk: {0} copied (free there: {1}), checked file by file, then the link switched. The old copy stays, renamed, until you remove it.")
            .replace("{0}", pl.need == null ? tr("all it holds") : gb(pl.need)).replace("{1}", gb(pl.free));
        return window.HeresyDialog.confirm(tr("Move {0} to {1}?").replace("{0}", L).replace("{1}", pl.home ? tr("the studio's folder") : pl.dest) + "\n\n" + how + "\n\n" +
          tr("Nothing may render or run while it moves; the studio says so if something does."), { ok: tr("Move") }).then(function (yes) {
          if (!yes) return;
          return lab("/places/move", { name: name, to: to }).then(function (d) { S.data = d; paint(); schedule(); });
        });
      });
    }).catch(function (e) { toast(tr("Not moved:") + " " + e.message, "bad"); });
  }
  function relink(name) {
    var p = place(name);
    if (!p || !p.record || !p.record.at) return;
    return window.HeresyDialog.confirm(tr("Link {0} to {1} again?").replace("{0}", tr(p.label)).replace("{1}", p.record.at) + "\n\n" +
      tr("The record says it lives there; the studio's folder is pointed at it again. Nothing is copied or deleted."), { ok: tr("Link again") }).then(function (yes) {
      if (!yes) return;
      return lab("/places/relink", { name: name }).then(function (d) { S.data = d; paint(); toast(tr("{0} linked again").replace("{0}", tr(p.label)), "good"); });
    }).catch(function (e) { toast(tr("Not linked:") + " " + e.message, "bad"); });
  }

  function init(hooks) {
    S.hooks = hooks || {};
    var box = $("plRows");
    if (!box) return;
    box.addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (!b || b.disabled) return;
      if (b.dataset.plMove) move(b.dataset.plMove, false);
      else if (b.dataset.plHome) move(b.dataset.plHome, true);
      else if (b.dataset.plRelink) relink(b.dataset.plRelink);
    });
    var again = $("plRefresh");
    if (again) again.addEventListener("click", function () { load(true); });
    window.addEventListener("ruach-lang", paint);
  }
  window.HeresyPlaces = { init: init, load: load, state: function () { return { data: S.data, moving: moving() }; } };
})();
