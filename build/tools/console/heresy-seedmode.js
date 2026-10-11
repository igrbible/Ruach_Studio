/* HERESY 1169 · 1330 (Viktor 10.10.2026: «Для SEED сделай рандом -1, рандом fixed, fixed, next, prev»; «можно и в творце»): a seed field's
   mode, beside it, kept in this browser for each field: Random (−1: a new seed each run, the field empty), Random, fixed (a random seed put in
   now and kept), Fixed (the seed as typed), Next (after a run: the seed plus the seeds the run used), Previous (minus them). A field left
   empty in Random fixed, Next or Previous gets a random seed before the run (an empty Fixed is a new seed each run, as an empty field always was), so the run's seed is known and the next one follows from it.
   HeresySeedMode.attach(input, key, { after: element, big: true for the 64-bit seeds of a song }) → { mode(), before(), after(used, seed) } */
(function () {
  var MODES = [["random", "Random (−1)"], ["roll", "Random, fixed"], ["fixed", "Fixed"], ["next", "Next"], ["prev", "Previous"]];
  var TIPS = { random: "A new seed each run: the field stays empty (−1)", roll: "A random seed put in now, then kept for every run (choose it again for another)",
               fixed: "The seed as written, every run", next: "After each run the seed moves on past the seeds it used", prev: "After each run the seed moves back by the seeds it used" };
  function tr(s) { return window.RuachI18n ? window.RuachI18n.t(s) : s; }
  function recall(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function keep(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* private window */ } }
  function roll() { return String(Math.floor(Math.random() * 2147483647)); }
  function attach(input, key, opts) {
    opts = opts || {};
    if (!input) return null;
    var sel = document.createElement("select");
    sel.className = "seed-mode";
    sel.setAttribute("aria-label", tr("The seed's mode"));
    sel.innerHTML = MODES.map(function (m) { return '<option value="' + m[0] + '">' + tr(m[1]) + "</option>"; }).join("");
    var was = recall(key);
    sel.value = MODES.some(function (m) { return m[0] === was; }) ? was : (input.value.trim() ? "fixed" : "random");
    var tip = function () { sel.dataset.tip = tr(TIPS[sel.value]); };
    tip();
    (opts.after || input).insertAdjacentElement("afterend", sel);
    var said = function () { input.dispatchEvent(new Event("input", { bubbles: true })); };
    sel.addEventListener("change", function () {
      keep(key, sel.value === "random" ? null : sel.value);
      if (sel.value === "random") { input.value = ""; said(); }
      else if (sel.value === "roll" || !input.value.trim()) { input.value = roll(); said(); }
      tip();
    });
    var ctl = {
      el: sel,
      mode: function () { return sel.value; },
      set: function (m) { sel.value = m; keep(key, m === "random" ? null : m); tip(); },
      before: function () {                              // the field as the mode wants it for this run
        // a seed in the field means that seed, as it always did (typed, or put in by Retake, a prompt file, a plan): Random became
        // Fixed; only choosing Random empties the field
        var has = /^\d+$/.test(input.value.trim());
        if (sel.value === "random" || sel.value === "fixed") { if (has && sel.value === "random") ctl.set("fixed"); }   // an empty field: a new seed, as ever
        else if (!has) { input.value = roll(); said(); }   // Random fixed, Next and Previous need a seed to keep or to move from
      },
      after: function (used, seed) {                     // the run went out with this seed and used so many
        if (sel.value !== "next" && sel.value !== "prev") return;
        var v = String(seed != null ? seed : input.value).trim();
        if (!/^\d+$/.test(v)) return;
        var n = Math.max(1, +used || 1), next;
        if (opts.big && window.BigInt) {
          var b = BigInt(v) + (sel.value === "next" ? BigInt(n) : -BigInt(n));
          next = String(b < 0n ? 0n : b);
        } else next = String(Math.max(0, +v + (sel.value === "next" ? n : -n)));
        input.value = next;
        said();
      }
    };
    // a seed typed into the field while it was Random: the field means it, so Fixed
    ["input", "change"].forEach(function (ev) { input.addEventListener(ev, function () {
      var v = input.value.trim();
      if (sel.value === "random" && /^\d+$/.test(v)) ctl.set("fixed");      // a seed typed: that seed
      else if (sel.value === "fixed" && !v) ctl.set("random");               // the field emptied: a new one each run
    }); });
    return ctl;
  }
  window.HeresySeedMode = { attach: attach, modes: MODES.map(function (m) { return m[0]; }) };
})();
