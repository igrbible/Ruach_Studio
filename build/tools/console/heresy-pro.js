// HERESY 1599 (Viktor 20.10.2026: «если есть в активе мои Pro плагины, отключение оных ради теста Паблик воркфлоу. Так сможем имитировать
// публичный код в Промо и на скринах… И чтобы не было видно выключателя, помести его в системный бар Студии в ниспадающее меню»): a row in
// ☰, shown only when a plugin that is not the studio's own is in user/plugins/. Off, the page reads the plugins as a public studio would: no
// step, pipeline, DAW insert or MIDI script of such a plugin (the lab keeps them; nothing is deleted); the page reloads to read them anew.
// Kept in this browser
(function () {
  "use strict";
  var KEY = "yue2.proOff";
  function off() { try { return localStorage.getItem(KEY) === "1"; } catch (e) { return false; } }
  function keep(pl) { return !pl || !!pl.builtin || !off(); }
  function row() {
    var items = document.querySelector("#headMorePop .head-more-items");
    if (!items || document.getElementById("proRow")) return document.getElementById("proRow");
    var r = document.createElement("label");
    r.className = "head-more-row hm-pro"; r.id = "proRow"; r.hidden = true;
    r.dataset.tip = "Your own plugins (not the studio's) on or off for this browser: off, the Refiner, the DAW and MIDI show only what a public studio has, for a test of the public way, the promo and the pictures. Nothing is deleted; the page reloads";
    r.innerHTML = '<span>Own plugins</span><input type="checkbox" id="proOn" aria-label="Own plugins" />';
    items.parentNode.insertBefore(r, items);
    r.querySelector("input").addEventListener("change", function () {
      try { localStorage.setItem(KEY, this.checked ? "" : "1"); } catch (e) { /* private mode */ }
      setTimeout(function () { location.reload(); }, 150);
    });
    return r;
  }
  function init() {
    var r = row();
    if (!r || !window.fetch) return;
    fetch("/lab/plugins", { priority: "low" }).then(function (x) { return x.ok ? x.json() : { plugins: [] }; }).then(function (d) {
      var own = (d.plugins || []).filter(function (p) { return !p.builtin; });
      r.hidden = !own.length;
      r.querySelector("input").checked = !off();
      document.documentElement.classList.toggle("pro-off", off() && own.length > 0);
    }).catch(function () { /* no lab: nothing to switch */ });
  }
  window.HeresyPro = { off: off, keep: keep };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
