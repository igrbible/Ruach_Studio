// HERESY 1986 (Viktor 01.11.2026: «Для Pianoteq добавь динамическую вкладку в Движок. Распиши что это и с чем его едят, как установить,
// зарегистрировать, обновлять, разные наборы на моём примере покупки… Всё в одном месте»): Engine → Pianoteq, over the lab's pianoteq_live.status()
// and activate(). What is installed and activated here, asked of Pianoteq itself each time the tab opens; its instruments, what of them plays in full;
// the serial given to Pianoteq through its own RPC and gone from the page at once; how to install, activate, update and deactivate it. Deactivation has
// no button: Pianoteq gives none (no option, no RPC method), and Modartt's user area is where it is done.
//
//   HeresyPtqEngine.load() · HeresyPtqEngine.state()   (the last for the checks)
(function () {
  "use strict";
  var S = { data: null, busy: false };
  function $(id) { return document.getElementById(id); }
  function tr(s) { return window.RuachI18n ? window.RuachI18n.t(s) : s; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function toast(t, k) { if (window.HeresyToast) window.HeresyToast(t, k); }
  function scoped(path) {                                      // a test page says so to the lab, which then activates nothing
    var m = /[?&]scope=([^&#]+)/.exec(location.search);
    return m ? path + (path.indexOf("?") < 0 ? "?" : "&") + "scope=" + m[1] : path;
  }
  function lab(path, body) {
    var opt = body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {};
    return fetch("/lab" + (body ? scoped(path) : path), opt)
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || "HTTP " + r.status); return d; }); });
  }
  function load() {
    var line = $("ptqLine");
    if (!line || S.busy) return Promise.resolve();
    line.textContent = tr("Asking Pianoteq…");
    line.className = "upd-line ptq-line";
    return lab("/pianoteq/status").then(paint).catch(function (e) {
      line.textContent = tr("The lab does not answer:") + " " + e.message;
      line.className = "upd-line ptq-line is-bad";
    });
  }
  function paint(d) {
    S.data = d;
    var line = $("ptqLine"), act = d.activation || null, on = !!(act && act.status === 1), txt, cls = "";
    if (!d.installed) txt = tr("No Pianoteq here: below it says where to put it.");
    else if (on) { txt = tr("Pianoteq {0} is activated here: {1}.").replace("{0}", d.version).replace("{1}", act.addons.length ? act.addons.join(", ") : tr("no packs")); cls = "is-good"; }
    else { txt = tr("Pianoteq {0} is here but not activated: it plays as a demo, some keys silent.").replace("{0}", d.version || ""); cls = "is-warn"; }
    if (act && act.error) txt += " " + tr("Pianoteq says: {0}").replace("{0}", act.error);
    line.textContent = txt;
    line.className = "upd-line ptq-line " + cls;
    var facts = [];
    if (d.installed) {
      facts.push(["Program", d.program]);
      facts.push(["Version", d.version + (d.build ? " · " + d.build : "")]);
      if (d.presets) facts.push(["Presets", tr("{0} of {1} play in full").replace("{0}", d.presets.full).replace("{1}", d.presets.total)]);
      facts.push(["Edition", d.editable ? tr("{0} parameters yours to change, {1} kept by this edition").replace("{0}", d.editable.free).replace("{1}", d.editable.locked)
        : tr("the Pianoteq step's window reads it once it opens")]);
    }
    facts.push(["Preferences", d.prefs ? tr("here: its activation lives in them") : tr("none yet: start Pianoteq once on this machine")]);
    $("ptqFacts").innerHTML = facts.map(function (f) { return "<dt>" + esc(tr(f[0])) + "</dt><dd>" + esc(f[1]) + "</dd>"; }).join("");
    var inst = d.instruments || [];
    $("ptqInst").innerHTML = inst.length ? '<table class="ptq-table"><thead><tr><th>' + esc(tr("Instrument")) + "</th><th>" + esc(tr("Kind")) + "</th><th>" +
      esc(tr("Presets")) + "</th><th>" + esc(tr("In full")) + "</th></tr></thead><tbody>" + inst.map(function (r) {
        return '<tr class="' + (r.full ? "is-full" : "is-demo") + '"><td translate="no">' + esc(r.instr) + '</td><td translate="no">' + esc(r["class"]) + "</td><td>" + r.presets +
          "</td><td>" + (r.full ? r.full : esc(tr("demo"))) + "</td></tr>";
      }).join("") + "</tbody></table>" : "";
    $("ptqActivate").disabled = !d.installed || S.busy;
    $("ptqSerial").disabled = !d.installed || S.busy;
  }
  function activate() {
    var f = $("ptqSerial"), serial = (f.value || "").trim();
    if (!serial) { toast(tr("Paste the serial first."), "bad"); f.focus(); return; }
    return window.HeresyDialog.confirm(tr("Activate Pianoteq with this serial?") + "\n\n" +
      tr("Pianoteq on the Studio's machine asks Modartt with it; it takes a few seconds. The serial is kept nowhere."), { ok: tr("Activate") }).then(function (yes) {
      if (!yes) return;
      f.value = "";                                            // gone from the page at once; it lives only in this request
      S.busy = true;
      $("ptqLine").textContent = tr("Pianoteq asks Modartt…");
      $("ptqActivate").disabled = f.disabled = true;
      var body = { serial: serial };
      serial = "";
      return lab("/pianoteq/activate", body).then(function (d) {
        body = null;
        S.busy = false;
        paint(d);
        var act = d.activation || {};
        if (d.said || act.status !== 1) toast(tr("Not activated: {0}").replace("{0}", d.said || act.error || "?"), "bad");
        else toast(tr("Activated: {0}").replace("{0}", (act.addons || []).join(", ") || tr("no packs")), "good");
      }).catch(function (e) {
        body = null;
        S.busy = false;
        toast(tr("Not activated: {0}").replace("{0}", e.message), "bad");
        load();
      });
    });
  }
  function init() {
    var card = $("pianoteqCard");
    if (!card) return;
    $("ptqActivate").addEventListener("click", activate);
    $("ptqAgain").addEventListener("click", load);
    $("ptqSerial").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); activate(); } });
    document.addEventListener("click", function (e) {           // asked again each time its tab opens
      if (e.target.closest && e.target.closest('#engineTabs [data-etab="pianoteq"]')) setTimeout(load, 0);
    });
    window.addEventListener("ruach-lang", function () { if (S.data) paint(S.data); });
    var v = $("view-engine");
    if (v && v.dataset.etab === "pianoteq" && !v.classList.contains("is-hidden")) load();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
  window.HeresyPtqEngine = { load: load, state: function () { return { data: S.data, busy: S.busy }; } };
})();
