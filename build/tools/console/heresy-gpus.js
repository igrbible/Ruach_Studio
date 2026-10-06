// HERESY 1091 (Viktor, 02.10.2026): which card does what, and synthesis kept off a card that is training.
// Engine → GPUs: every card with its memory and what runs on it now; the studio on one card (start.sh takes it
// at its next start: a button restarts it when it is idle), training on the cards given to it, the lab's other
// jobs (listener, Whisper, stems, remaster, upscale) on theirs. Saved in user/gpus.json by the lab.
// guard(): before a synthesis, asked of the lab; while a run trains on the studio's own card the synthesis
// waits, and the page says why and what to do instead.
(function () {
  "use strict";

  var state = { data: null, hooks: null };
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function gb(mb) { return (mb / 1024).toFixed(1) + " GB"; }
  function lab(path, body) {
    var opt = body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
    return fetch("/lab" + path, opt).then(function (r) { return r.json().then(function (b) { if (!r.ok && r.status !== 202) throw new Error(b.error || r.status); return b; }); });
  }
  function toast(t, kind) { if (state.hooks) state.hooks.toast(t, kind); }
  // HERESY 1166: the hint's sentences translated each, and again when the language changes
  function tr(s) { return window.RuachI18n ? window.RuachI18n.t(s) : s; }
  window.addEventListener("ruach-lang", function () { if (state.data) hint(); });

  function paint() {
    var host = $("gpuRoles");
    if (!host) return;
    lab("/gpus").then(function (d) {
      state.data = d;
      var r = d.roles, studioNow = d.studio_now;
      if (!Array.isArray(d.cards) || !d.cards.length) { host.innerHTML = '<p class="row-hint">' + esc((d.cards && d.cards.error) || "No card found") + "</p>"; return; }
      host.innerHTML = '<table class="gpu-table"><tr><th>card</th><th data-tip="The card the studio’s synthesis runs on: one">studio</th>' +
        '<th data-tip="Cards a training run may take">training</th><th data-tip="The listener, Whisper, stems, remaster, upscale">lab jobs</th><th>now</th>' +
        '<th data-tip="What the GPU guard says of the card this moment: open to the studio\u2019s work, or closed by another program\u2019s service (more than 2 GiB); the desktop\u2019s small ones do not close it">the guard</th></tr>' +
        d.cards.map(function (c) {
          var i = c.index, now = [];
          if (studioNow === i) now.push("the studio");
          if (d.training[String(i)]) now.push("training " + d.training[String(i)]);
          return "<tr><td><b>GPU" + i + "</b> <span class=\"row-hint\">" + esc(c.name.replace(/^NVIDIA GeForce /, "")) + " · " + gb(c.total_mb) + "</span></td>" +
            '<td><input type="radio" name="gpuStudio" value="' + i + '"' + (r.studio === i ? " checked" : "") + " /></td>" +
            '<td><input type="checkbox" data-role="train" value="' + i + '"' + (r.train.indexOf(i) >= 0 ? " checked" : "") + " /></td>" +
            '<td><input type="checkbox" data-role="jobs" value="' + i + '"' + (r.jobs.indexOf(i) >= 0 ? " checked" : "") + " /></td>" +
            '<td class="mono">' + gb(c.total_mb - c.free_mb) + " used" + (now.length ? " · " + esc(now.join(", ")) : "") + "</td>" + guardCell(d.guard, i) + "</tr>";
        }).join("") + "</table>";
      hint();
    }).catch(function (e) { host.innerHTML = '<p class="tr-err">The lab does not answer: ' + esc(e.message) + "</p>"; });
  }
  // HERESY 1140: the guard's verdict: open (with what is free, and the desktop's small programs in the tip), or closed
  // and by whom
  function guardCell(guard, i) {
    if (!Array.isArray(guard)) return '<td class="row-hint">' + esc((guard && guard.error) || "not read") + "</td>";
    var g = guard.filter(function (x) { return x.index === i; })[0];
    if (!g) return "<td></td>";
    var small = (g.foreign || []).filter(function (f) { return !f.heavy; });
    var tip = small.length ? "The desktop’s own on it: " + small.map(function (f) { return f.name + " " + f.mb + " MiB"; }).join(", ") : "Nothing of anyone else’s on it";
    if (g.ok) return '<td class="gpu-guard is-open" data-tip="' + esc(tip) + '"><span class="gpu-dot"></span>open · ' + gb(g.free_mb) + " free</td>";
    var heavy = (g.foreign || []).filter(function (f) { return f.heavy; });
    return '<td class="gpu-guard is-closed" data-tip="' + esc(g.why) + '"><span class="gpu-dot"></span>closed: ' +
      esc(heavy.map(function (f) { return f.name + " " + gb(f.mb); }).join(", ")) + "</td>";
  }
  function chosen() {
    var pick = function (role) { return Array.prototype.map.call(document.querySelectorAll('#gpuRoles input[data-role="' + role + '"]:checked'), function (x) { return +x.value; }); };
    var s = document.querySelector('#gpuRoles input[name="gpuStudio"]:checked');
    return { studio: s ? +s.value : 0, train: pick("train"), jobs: pick("jobs") };
  }
  function hint() {
    var d = state.data, c = chosen(), say = [];
    if (!d) return;
    if (c.train.indexOf(c.studio) >= 0) say.push("Training may take GPU" + c.studio + ", the studio’s card: while it does, synthesis waits.");
    else say.push("Training never takes GPU" + c.studio + ": synthesis and training go on side by side.");
    if (d.studio_now != null && d.studio_now !== d.roles.studio) say.push("Saved: the studio on GPU" + d.roles.studio + "; it still runs on GPU" + d.studio_now + " until it restarts.");
    $("gpuHint").textContent = say.map(tr).join(" ");
    var b = $("gpuRestart");
    b.hidden = !(d.studio_now != null && d.studio_now !== d.roles.studio);
    b.textContent = "Restart the studio on GPU" + d.roles.studio;
  }
  function save() {      // true when the lab took it (HERESY 1166: the Engine page waits on it before it goes)
    var c = chosen();
    if (!c.train.length || !c.jobs.length) { toast("Give training and the lab’s jobs one card at least", "bad"); return Promise.resolve(false); }
    return lab("/gpus", c).then(function (d) {
      state.data = d; hint();
      toast(d.studio_now != null && d.studio_now !== d.roles.studio ? "Saved: the studio moves to GPU" + d.roles.studio + " when it restarts" : "Saved", "good");
      paint();
      return true;
    }).catch(function (e) { toast(e.message, "bad"); return false; });
  }
  // HERESY 1166: the boxes put back as the lab keeps them, at once (a change ignored), then read afresh
  function reset() {
    var r = state.data && state.data.roles;
    if (r) Array.prototype.forEach.call(document.querySelectorAll("#gpuRoles input"), function (x) {
      x.checked = x.name === "gpuStudio" ? +x.value === r.studio : (r[x.dataset.role] || []).indexOf(+x.value) >= 0;
    });
    hint();
    paint();
  }
  // HERESY 1166: the roles on the page differ from the ones the lab keeps: a change not saved yet
  function unsaved() {
    var d = state.data;
    if (!d || !d.roles || !document.querySelector("#gpuRoles input")) return false;
    var c = chosen(), r = d.roles, same = function (a, b) { return a.slice().sort().join() === (b || []).slice().sort().join(); };
    return c.studio !== r.studio || !same(c.train, r.train) || !same(c.jobs, r.jobs);
  }
  function restart() {
    var to = state.data && state.data.roles.studio;
    window.HeresyDialog.confirm("Restart the studio on GPU" + to + "?\n\nThe models load again on the new card at the next song; the page reconnects by itself. Nothing is rendering now.", { ok: "Restart" })
      .then(function (ok) {
        if (!ok) return;
        return lab("/studio/restart", {}).then(function () {
          toast("The studio restarts on GPU" + to + "…");
          var tries = 0;
          (function wait() {
            setTimeout(function () {
              fetch("/hardware").then(function (r) { if (!r.ok) throw new Error(); toast("The studio is back on GPU" + to, "good"); paint(); })
                .catch(function () { if (++tries < 60) wait(); });
            }, 2000);
          })();
        });
      }).catch(function (e) { toast(e.message, "bad"); });
  }

  // before a synthesis: true when it may start. A lab that does not answer does not block the studio (it cannot
  // know), and says so in the console only.
  function guard() {
    return lab("/gpus").then(function (d) {
      if (!d.studio_training) return true;
      var g = d.studio_now != null ? d.studio_now : d.roles.studio;
      return window.HeresyDialog.confirm("GPU" + g + " is training " + d.studio_training + "\n\nIt is the studio’s own card: a synthesis now would fight the training for its memory, and one of them would fail. " +
        "The synthesis waits until the run ends, or until you stop it (Train). To create while training, give training another card: Engine → GPUs.",
        { ok: "Open Train", cancel: "Wait" }).then(function (go) {
        if (go) { var t = document.querySelector('#tabs [data-tab="train"]'); if (t) t.click(); }
        return false;
      });
    }).catch(function (e) { console.warn("the GPU guard could not ask the lab:", e.message); return true; });
  }

  function init(hooks) {
    state.hooks = hooks || null;
    if (!$("gpuRoles")) return;
    $("gpuSave").addEventListener("click", save);
    $("gpuRestart").addEventListener("click", restart);
    $("gpuRoles").addEventListener("change", hint);
    var open = $("engineToggle");
    if (open) open.addEventListener("click", function () { setTimeout(paint, 60); });
    paint();
  }
  window.HeresyGpus = { init: init, paint: paint, guard: guard, unsaved: unsaved, save: save, reset: reset };
})();
