// HERESY 1102 (Viktor, 02.10.2026): the DAW button's landing. Two ways out of the studio, and only two: the mixed
// track as it is, with no DAW's magic, or the whole take handed to the user's own DAW, where whatever happens next
// happens outside the studio. REAPER first, Waveform second; others by pull request. The lab says which DAWs the
// studio's own machine has (GET /lab/daw); a DAW on another computer cannot be seen from there, so the user names
// theirs, and the choice is kept with the page.
(function () {
  "use strict";

  var KEY = "yue2.daw";
  var state = { el: null, data: null, hooks: {} };
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function recall(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function keep(k, v) { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (e) { /* a private window */ } }

  // the take in hand's own download links, as its tools have them (WAV, FLAC, MP3)
  function mixLinks() {
    if (state.hooks.links) {                         // HERESY 1123: the take the page names (open, playing, or checked)
      return state.hooks.links().map(function (l) {
        return '<a class="btn ghost small" href="' + esc(l.href) + '" download="' + esc(l.file || "") + '">' + esc(l.label) + "</a>";
      }).join("");
    }
    return ["dlTakeWav", "dlTakeFlac", "dlTakeMp3"].map(function (id) {
      var a = $(id);
      if (!a || !a.getAttribute("href") || a.hidden || a.classList.contains("is-disabled")) return "";
      return '<a class="btn ghost small" href="' + esc(a.getAttribute("href")) + '" download="' + esc(a.getAttribute("download") || "") + '">' + esc(id.replace("dlTake", "")) + "</a>";
    }).join("");
  }
  function paint() {
    var d = state.data, mine = recall(KEY) || "", title = state.hooks.title ? state.hooks.title() : "";
    var links = mixLinks();
    var html = '<header class="dw-head"><div><b>Out of the studio</b><span class="row-hint">two ways: the mixed track as it is, or the whole take into your DAW, where the rest happens outside the studio</span></div>' +
      '<button type="button" class="btn ghost small dw-close" aria-label="Close">✕</button></header>' +
      '<section class="dw-way"><h3>The mixed track</h3><p class="row-hint">As the studio made it (and the Refiner finished it), no DAW in between.' +
      (title ? " The take in hand: <b>" + esc(title) + "</b>" : "") + "</p>" +
      (links ? '<div class="dw-links">' + links + "</div>" : '<p class="row-hint">Open a take, play one, or check one in the Librarian: its WAV, FLAC and MP3 come here.</p>') + "</section>" +
      '<section class="dw-way"><h3>Into your DAW <span class="dw-exp" data-tip="It works and was checked, but it still needs crash tests on other machines and projects, and more work">experimental</span></h3><p class="row-hint">The whole take as a project of your DAW: the stems on their tracks, the score as MIDI, ' +
      "the tempo, the sections as regions, the lyrics on the timeline. Which DAW do you use?</p>";   // HERESY 1148: experimental, said
    if (!d) html += '<p class="row-hint">Asking the lab…</p>';
    else if (d.error) html += '<p class="tr-warn">The lab does not answer: ' + esc(d.error) + "</p>";
    else html += '<div class="dw-daws">' + d.daws.map(function (x) {
      var on = mine === x.id;
      return '<div class="dw-daw' + (on ? " is-on" : "") + '"><div class="dw-daw-head"><b>' + esc(x.name) + "</b><span>" + esc(x.by) + "</span>" +
        '<span class="dw-state">' + esc(x.state === "first" ? "first" : x.state === "second" ? "next" : x.state) + "</span></div>" +
        (x.here ? '<p class="dw-here">✓ on the studio’s machine' + (x.version ? " · " + esc(x.version) : "") + "<br><code>" + esc(x.path) + "</code></p>"
                : '<p class="row-hint">not on the studio’s machine; on your own computer it may well be</p>') +
        '<p class="row-hint">' + esc(x.licence) + "</p>" +
        (x.here ? "" : '<details class="dw-install"><summary>How to install it</summary><p>' + esc(x.install) + "</p></details>") +
        '<div class="dw-acts"><button type="button" class="btn small' + (on ? " primary" : " ghost") + '" data-dw-pick="' + esc(x.id) + '">' + (on ? "Your DAW ✓" : "I use this one") + "</button>" +
        (x.id === "reaper" ? '<button type="button" class="btn small ghost" data-dw-reaper="1"' + (title ? "" : " disabled") + '>Export the take</button>' : "") +
        // HERESY 1134: the DAWs that open DAWproject get it from here too
        (x.id === "waveform" || x.id === "bitwig" ? '<button type="button" class="btn small ghost" data-dw-dawproject="1"' + (title ? "" : " disabled") + ' title="A DAWproject: the mix, the stems, the score as notes, the sections as markers">Export the take</button>' : "") + "</div></div>";
    }).join("") + "</div>";
    html += '<p class="row-hint dw-now">Now: the <b>REAPER</b> project (the mix, every stem, the score as MIDI; the lyrics and sections once the take is timed in the Refiner’s lyrics check), and <b>DAWproject</b> (the mix, every stem, the score as notes, the sections as markers: Waveform 14, Bitwig, Studio One, Cubase); both also in a take’s menu → Download. ' +
      "Waveform: 14 or newer.</p></section>";
    state.el.querySelector(".dw-box").innerHTML = html;
  }
  function load() {
    return fetch("/lab/daw").then(function (r) { return r.json().then(function (b) { if (!r.ok) throw new Error(b.error || r.status); return b; }); })
      .then(function (d) { state.data = d; paint(); }, function (e) { state.data = { error: e.message }; paint(); });
  }
  function build() {
    var el = document.createElement("div");
    el.className = "dw-back"; el.hidden = true;
    el.innerHTML = '<div class="dw-box" role="dialog" aria-modal="true" aria-label="Out of the studio"></div>';
    document.body.appendChild(el);
    el.addEventListener("click", function (e) {
      var b;
      if (e.target === el || e.target.closest(".dw-close")) return close();
      if ((b = e.target.closest("[data-dw-pick]"))) { keep(KEY, recall(KEY) === b.dataset.dwPick ? "" : b.dataset.dwPick); paint(); }
      if ((b = e.target.closest("[data-dw-dawproject]")) && state.hooks.dawproject) {   // HERESY 1134
        b.disabled = true; b.textContent = "Packing…";
        state.hooks.dawproject().then(function () { close(); }, function () { b.disabled = false; b.textContent = "Export the take"; });
      }
      if ((b = e.target.closest("[data-dw-reaper]")) && state.hooks.reaper) {   // HERESY 1104: the take in hand, packed for REAPER
        b.disabled = true; b.textContent = "Packing…";
        state.hooks.reaper().then(function () { close(); }, function () { b.disabled = false; b.textContent = "Export the take"; });
      }
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && state.el && !state.el.hidden) close(); });
    state.el = el;
  }
  function open() {
    if (!state.el) build();
    state.el.hidden = false;
    requestAnimationFrame(function () { state.el.classList.add("is-on"); });
    paint(); load();
  }
  function close() { if (!state.el) return; state.el.classList.remove("is-on"); state.el.hidden = true; }

  function init(hooks) {
    state.hooks = hooks || {};
    var b = $("dawOpen");
    if (b) b.addEventListener("click", open);
  }
  window.HeresyDaw = { init: init, open: open, close: close };
})();
