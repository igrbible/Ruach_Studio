// HERESY 2987 (Viktor 25.11.2026: «Подбери кандидатов NAM до среза и оформи всё в срез. Пусть пользователь имеет выбор.» «NAM — 🔥»): the
// Refiner's Amp (NAM) step's list of captures. The step's hidden «capture» field (profiles and the way keep it) gets a list beside its stem:
// the Studio's captures by kind (guitar amps, bass amps, pedals, full rigs, outboard), then the user's own .nam files from user/nam/, each with
// its gear and maker, who captured it and its licence. The lab reads the list anew (/lab/nam/captures) each time the step's drawer opens, so a
// file just put in user/nam/ is there without a reload. A capture the Studio cannot read yet is listed dimmed, with its reason; an empty list
// says where to put one. Nothing is asked of the lab until the drawer opens.
(function () {
  "use strict";
  function tr(s) { return window.RuachI18n ? window.RuachI18n.t(s) : s; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function fire(el) { el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); }
  function gear(c) { var g = c.gear || ""; return c.maker && g.indexOf(c.maker) < 0 ? (c.maker + " " + g).trim() : g; }
  function about(c) {
    if (!c.ok) return tr("The Studio cannot play it: {0}").replace("{0}", c.why || "?");
    return [gear(c), c.author ? tr("captured by {0}").replace("{0}", c.author) : "",
      c.licence ? tr("licence: {0}").replace("{0}", c.licence) : (String(c.id).indexOf("user:") === 0 ? tr("your own file, user/nam/{0}").replace("{0}", c.file || "") : ""),
      c.head ? tr("an amp head without a cabinet: on Auto the generic cab follows it") : ""]   // HERESY 2994: what the step's «Cabinet» Auto does with it
      .filter(Boolean).join(" · ");
  }
  var ADD_MOST = 64 * 1024 * 1024;                     // HERESY 3012: the lab's own limit (nam_amp.ADD_MOST), said before a byte is sent
  var ADD_TIP = "Add a capture of your own: a .nam file from your computer; the lab checks that the step can play it and keeps it in user/nam/";
  function mount(d, s) {
    var hid = d.querySelector('[data-pl-key="capture"]');
    if (!hid || d.querySelector(".nam-pick")) return;
    var spec = ((s && s.spec && s.spec.params) || []).filter(function (p) { return p.key === "capture"; })[0] || {};
    var field = document.createElement("label");
    field.className = "field nam-field";
    if (spec.tip) field.dataset.tip = spec.tip;
    field.innerHTML = '<span class="label">' + esc(spec.label || "Capture") + '</span><select class="nam-pick"><option value="">' + esc(tr("choose a capture")) + "</option></select>";
    var stem = d.querySelector('[data-pl-key="stem"]'), at = stem && stem.closest(".field");
    if (at && at.parentNode) at.parentNode.insertBefore(field, at.nextSibling);
    else d.querySelector(".rm-grid").appendChild(field);
    var line = document.createElement("p");
    line.className = "row-hint mono nam-about";
    d.querySelector(".rm-grid").insertAdjacentElement("afterend", line);
    var pack = document.createElement("p");          // HERESY 2994: the Studio's set not here: its part in Engine → Models, a button away
    pack.className = "row-hint nam-pack";
    line.insertAdjacentElement("afterend", pack);
    // HERESY 3012 (Viktor 25.11.2026, on NAM: «прикрути возможность подгружать собственные снимки, которые пользователи имеют у себя»): a capture
    // of the user's own from the computer: the lab reads it as the step will play it (JSON, an architecture its torch engine reads, a sane size)
    // and keeps it in user/nam/ under a safe name; the list is read anew with it chosen; a refusal said in words, the pick left as it was
    var addRow = document.createElement("p");
    addRow.className = "row-hint nam-add-row";
    addRow.innerHTML = '<button type="button" class="btn ghost small nam-add" data-tip="' + esc(tr(ADD_TIP)) + '">' + esc(tr("Add capture…")) + "</button>" +
      '<input type="file" class="nam-file" accept=".nam" hidden>';
    pack.insertAdjacentElement("afterend", addRow);
    var fileIn = addRow.querySelector(".nam-file"), want = null;
    var sel = field.querySelector("select"), list = {}, asked = 0;
    function say(text, bad) { line.textContent = text || ""; line.classList.toggle("is-bad", !!bad); }
    function pick(id, quiet) {
      var c = list[id];
      if (hid.value !== id) { hid.value = id; if (!quiet) fire(hid); }
      say(c ? about(c) : id ? tr("That capture is not here any more: choose another") : "", !!id && (!c || !c.ok));
    }
    function paint(b) {
      var keep = hid.value, first = "";
      list = {};
      if (window.HeresyWeights) window.HeresyWeights.packSay(pack, b.studio ? "" : tr("The Studio's own captures are not here yet: Engine → Models brings them (NAM amps, 3 MB)"), "nam");
      if (!b.count) {
        sel.innerHTML = '<option value="">' + esc(tr("choose a capture")) + "</option>";
        say(tr(b.empty || "No NAM capture here yet: put .nam files in user/nam/ (any folder under it) and open the step again"), true);
        return;
      }
      sel.innerHTML = '<option value="">' + esc(tr("choose a capture")) + "</option>" + b.groups.map(function (g) {
        return '<optgroup label="' + esc(tr(g.label)) + '" data-nam-group="' + esc(g.id) + '">' + g.captures.map(function (c) {
          list[c.id] = c;
          if (c.ok && !first) first = c.id;
          var g2 = gear(c);
          return '<option value="' + esc(c.id) + '"' + (c.ok ? "" : " disabled") + ' translate="no">' + esc(c.name + (g2 && g2 !== c.name ? " · " + g2 : "")) + "</option>";
        }).join("") + "</optgroup>";
      }).join("");
      var id = keep && list[keep] ? keep : keep ? "" : first;
      if (keep && !list[keep]) {                       // a profile's capture that is gone: kept in the field, said, never swapped silently
        sel.insertAdjacentHTML("afterbegin", '<option value="' + esc(keep) + '" disabled translate="no">' + esc(String(keep).replace(/^[a-z]+:/, "")) + "</option>");
        id = keep;
      }
      sel.value = id;
      pick(id, id === keep);
      if (want) {                                      // HERESY 3012: the capture just added, chosen and said
        var w0 = want; want = null;
        if (list[w0.id]) { sel.value = w0.id; pick(w0.id); say(tr(w0.same ? "Already here: {0}" : "Added: {0}").replace("{0}", "user/nam/" + w0.file) + " \u00b7 " + about(list[w0.id]), !list[w0.id].ok); }
      }
    }
    function load() {
      var n = ++asked;
      say(tr("Reading the captures…"));
      fetch("/lab/nam/captures", { cache: "no-store" }).then(function (r) {
        return r.json().then(function (b) { if (!r.ok) throw new Error((b && b.error) || "HTTP " + r.status); return b; });
      }).then(function (b) { if (n === asked) paint(b); }, function (e) { if (n === asked) say(tr("The captures did not load: {0}").replace("{0}", e.message), true); });
    }
    sel.addEventListener("change", function () { pick(sel.value); });
    addRow.querySelector(".nam-add").addEventListener("click", function () { fileIn.value = ""; fileIn.click(); });   // HERESY 3012
    fileIn.addEventListener("change", function () {
      var f = fileIn.files && fileIn.files[0];
      if (!f) return;
      if (!/\.nam$/i.test(f.name)) return say(tr("Not added: a capture is a .nam file"), true);
      if (f.size > ADD_MOST) return say(tr("Not added: a NAM capture is at most 64 MB"), true);
      say(tr("Adding {0}…").replace("{0}", f.name));
      fetch("/lab/nam/capture-add?name=" + encodeURIComponent(f.name), { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: f }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (b) { if (!r.ok || !b.id) throw new Error((b && b.error) || "HTTP " + r.status); return b; });
      }).then(function (b) { want = b; load(); }, function (e) { say(tr("Not added: {0}").replace("{0}", tr(e.message)), true); });
    });
    d.addEventListener("toggle", function () { if (d.open) load(); });   // read anew at each opening: a file just put in user/nam/ is there
    if (d.open) load();
  }
  window.HeresyNam = { mount: mount };
})();
