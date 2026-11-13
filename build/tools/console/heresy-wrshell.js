// HERESY 2490 (Viktor 12.11.2026, the Writer gone through by hand: «Сама страница очень завалена всем… пошаговый аккордион с движением от левой колонки
// с карточками… к КОМНАТЕ ПИСЬМА, а в конце… ВЫХЛОП LLM ПОМОЩНИКА»; «С открытой карточки переход на изначальный чистый канвас… набор красивых кнопок-
// карточек по действиям»; «В верхней полосе-баре ПИСАТЕЛЬ оформи переключатель миров»; «В блоке ПЕСНЯ СЕЙЧАС… при выборе других карточек либо
// опустошать»): the Writer's shell around the notebook (heresy-writer.js) and the Writing room (app.js).
//
// The bar's knob is the Library's own (its look comes from heresy-collection.js): Musician, both, Narrator; it is the list's world (the filter) and the
// world a new document is born in. The right side is three steps, one open at a time so nothing needs a scroll: 1 the document, 2 the Writing room,
// 3 what the model answered. The Musician's song shows in step 2 only while the room writes there. A draft written for another document (or for the
// Musician's song) steps aside when that is not the one in hand, and comes back with it; every draft is kept in its history anyway (2481).
(function () {
  "use strict";
  function $(id) { return document.getElementById(id); }
  function tr(s) { return window.RuachI18n && window.RuachI18n.t ? window.RuachI18n.t(s) : s; }
  var POS = ["creator", "both", "reader"], NAME = { creator: "Musician", both: "Both", reader: "Narrator" }, STEP = 30;
  var FILTER = { creator: "creator", both: "all", reader: "reader" };

  function world() {
    var f = $("wrFilter") ? $("wrFilter").value : "all";
    return f === "creator" ? "creator" : f === "reader" ? "reader" : "both";
  }
  function paintWorld() {
    var box = $("wrWorlds"), w = world(), i = POS.indexOf(w), k = box && box.querySelector(".rs-knob");
    if (!box) return;
    box.dataset.pos = w;
    box.setAttribute("aria-valuenow", String(i));
    box.setAttribute("aria-valuetext", tr(NAME[w]));
    if (k) k.style.transform = "translateX(" + i * STEP + "px)";
    var n = $("wrWorldName"), say = tr(NAME[w]);
    if (n && n.textContent !== say) n.textContent = say;
  }
  function setWorld(w) {
    var f = $("wrFilter");
    if (!f || POS.indexOf(w) < 0) return;
    if (f.value !== FILTER[w]) { f.value = FILTER[w]; f.dispatchEvent(new Event("change", { bubbles: true })); }
    paintWorld();
  }

  // ---- the steps
  function steps() { return ["wrStepDoc", "assistDrawer", "wrStepOut"].map($).filter(Boolean); }
  function openStep(el) {
    if (!el || el.hidden) return;
    if (!el.open) el.open = true;
  }
  function docOpen() { var d = $("wrDoc"); return !!d && !d.hidden; }

  function target() { try { return window.ruachWriteTarget ? window.ruachWriteTarget() : { kind: "song" }; } catch (e) { return { kind: "song" }; } }
  function draftFor() { try { return window.ruachDraftFor ? window.ruachDraftFor() : null; } catch (e) { return null; } }
  function same(a, b) { return !!a && !!b && a.kind === b.kind && (a.kind !== "doc" || a.id === b.id); }

  var lastDoc = null, roomWas = "creator";
  function sync() {
    var doc = docOpen(), s1 = $("wrStepDoc"), home = $("wrHome");
    if (s1) s1.hidden = !doc;
    if (home) home.hidden = !doc;
    var d = window.HeresyWriter && window.HeresyWriter.openDoc ? window.HeresyWriter.openDoc() : null;
    var sayDoc = $("wrStepDocSay");
    if (sayDoc) {
      var t = d ? (d.title || tr("Untitled")) + " · " + tr(d.realm === "reader" ? "Narrator" : "Musician") : "";
      if (sayDoc.textContent !== t) sayDoc.textContent = t;
    }
    var id = d ? d.id : null;
    if (id !== lastDoc) {                               // another document in hand: its own step opens
      lastDoc = id;
      if (id) openStep(s1);
    }
    // HERESY 2494: the document's own way out first: a song's «Load into the Musician», a reading's «Read in the Narrator»; the other one steps back
    var hand = $("wrHandBtn"), rd = $("wrToReader"), reading = !!d && d.realm === "reader";
    if (hand) { hand.classList.toggle("primary", !reading); hand.classList.toggle("ghost", reading); }
    if (rd) { rd.classList.toggle("primary", reading); rd.classList.toggle("ghost", !reading); }
    // the Musician's song, only while the room writes there
    var tg = target(), now = $("wrSongNow");
    // HERESY 2497: a reading open (and the room writing into it) turns the room to the Narrator's world; anything else is the Musician's
    var rr = tg.kind === "doc" && d && d.realm === "reader" ? "reader" : "creator";
    if (rr !== roomWas && window.ruachAssistWorld) { roomWas = rr; window.ruachAssistWorld(rr).then(function (got) { roomWas = got; }); }
    if (now) now.classList.toggle("is-hidden", tg.kind !== "song");
    // the draft: shown for the one it was written for
    var box = $("assistDraft"), shown = box && !box.classList.contains("is-hidden"), df = draftFor(), away = !!(shown && df && !same(df, tg));
    if (box) box.classList.toggle("wr-draft-away", away);
    var els = $("wrOutElse"), none = $("wrOutNone");
    if (els) {
      var msg = away ? tr("The draft written for {0} waits for it: open it to see the draft; every draft is kept in its history too.")
        .replace("{0}", df.kind === "doc" ? "“" + (df.title || tr("Untitled")) + "”" : tr("the Musician's song")) : "";
      if (els.textContent !== msg) els.textContent = msg;
      els.classList.toggle("is-hidden", !away);
    }
    if (none) none.classList.toggle("is-hidden", !!shown);
    var sayOut = $("wrStepOutSay");
    if (sayOut) {
      var hn = $("assistHistoryN") ? ($("assistHistoryN").textContent.match(/\d+/) || [""])[0] : "";   // HERESY 2496: the answers kept, said on the step
      var o = shown && !away ? tr("a draft to review") : away ? tr("a draft waits for another document") : "";
      if (hn && +hn > 0) o = (o ? o + " · " : "") + tr("answers kept: {0}").replace("{0}", hn);
      if (sayOut.textContent !== o) sayOut.textContent = o;
    }
    // HERESY 2495: the folded writer-and-model line says what is picked
    var ms = $("assistModelSay");
    if (ms) {
      var pv = $("assistProvider"), pt = pv && pv.selectedIndex >= 0 ? pv.options[pv.selectedIndex].textContent.trim() : "";
      var lm = $("assistLocalModel"), om = $("orModel"), model = om && om.offsetParent !== null && om.value ? om.value : lm && lm.offsetParent !== null && lm.selectedIndex >= 0 ? lm.options[lm.selectedIndex].textContent.trim() : "";
      var t = $("assistTemp"), mx = $("assistMax");
      var line = [pt, model, (t && t.value ? "T " + t.value : "T auto"), (mx && mx.value ? mx.value + " tok" : "")].filter(Boolean).join(" · ");
      if (ms.textContent !== line) ms.textContent = line;
    }
    paintWorld();
  }

  var draftWas = false;
  function onDraft() {
    var box = $("assistDraft"), shown = !!box && !box.classList.contains("is-hidden");
    if (shown && !draftWas) { sync(); if (!box.classList.contains("wr-draft-away")) openStep($("wrStepOut")); }
    draftWas = shown;
  }

  function init() {
    var box = $("wrWorlds");
    if (!box || box.dataset.wired) return;
    box.dataset.wired = "1";
    box.addEventListener("click", function (e) { var b = e.target.closest("[data-realm]"); if (b) setWorld(b.dataset.realm); });
    box.addEventListener("keydown", function (e) {
      var i = POS.indexOf(world()), to = e.key === "ArrowLeft" ? i - 1 : e.key === "ArrowRight" ? i + 1 : e.key === "Home" ? 0 : e.key === "End" ? 2 : -9;
      if (to === -9) return;
      e.preventDefault();
      setWorld(POS[Math.max(0, Math.min(2, to))]);
    });
    if ($("wrFilter")) $("wrFilter").addEventListener("change", paintWorld);
    // one step open at a time
    steps().forEach(function (el) {
      el.addEventListener("toggle", function () {
        if (!el.open) return;
        steps().forEach(function (o) { if (o !== el && o.open) o.open = false; });
        if (el.id === "assistDrawer" || el.id === "wrStepOut") sync();
      });
    });
    // the start canvas's cards do what the bar's buttons do
    var acts = $("wrActs");
    if (acts) acts.addEventListener("click", function (e) {
      var b = e.target.closest("[data-wr-act]");
      if (!b) return;
      var a = b.dataset.wrAct, click = function (id) { if ($(id)) $(id).click(); };
      if (a === "new-song") { setWorld("creator"); click("wrNew"); }
      else if (a === "new-reading") { setWorld("reader"); click("wrNew"); }
      else click({ from: "wrFromCreate", vers: "wrCreatorVersions", trash: "wrTrashBtn", "import": "wrImport", "export": "wrExport" }[a]);
    });
    if ($("wrHome")) $("wrHome").addEventListener("click", function () {
      if (window.HeresyWriter && window.HeresyWriter.close) window.HeresyWriter.close().then(sync);
    });
    if ($("assistTargetSwap")) $("assistTargetSwap").addEventListener("click", function () { setTimeout(sync, 0); });
    // what changes the shell's state: a document opened or closed, a draft shown or hidden, the room's target said again
    var mo = new MutationObserver(function () { sync(); onDraft(); });
    ["wrDoc", "assistDraft", "assistTargetSay", "wrTitle", "assistHistoryN"].map($).filter(Boolean).forEach(function (el) {
      mo.observe(el, { attributes: true, attributeFilter: ["hidden", "class"], childList: true, characterData: true, subtree: el.id === "assistTargetSay" || el.id === "assistHistoryN" });
    });
    if ($("wrTitle")) $("wrTitle").addEventListener("input", function () { setTimeout(sync, 0); });
    ["assistProvider", "assistLocalModel", "orModel", "assistTemp", "assistMax"].map($).filter(Boolean).forEach(function (el) {   // HERESY 2495
      el.addEventListener("change", sync); el.addEventListener("input", sync);
    });
    if ($("assistModelBox")) $("assistModelBox").addEventListener("toggle", sync);
    setTimeout(sync, 1500); setTimeout(sync, 5000);    // the writers' list arrives after the page
    sync();
  }

  window.HeresyWrShell = { init: init, sync: sync, setWorld: setWorld, world: world };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { setTimeout(init, 0); });
  else setTimeout(init, 0);
})();
