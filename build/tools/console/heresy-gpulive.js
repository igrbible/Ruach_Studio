// HERESY 1264 (Viktor 09.10.2026: «Добавь в страничку Engine в GPUs секцию под каждым btop-like монитор утилизации/VRAM usage в
// реальном времени»; «btop ересь можно прикрутить и к фрейму лога сервера. Разрешаю сделать его шире на 200-400px, В две колонки. В
// одной живой лог, в другой живая шкала активных GPU, где главная карта особо обрамлена. Пометки над блоками графов — какая роль
// карты»): the cards second by second (the lab's /gpus/live: one nvidia-smi while a page looks), drawn as btop draws them: a bar a
// second for the load and one for the memory, two minutes wide, green to yellow to red. In Engine → GPUs under each card's row; beside
// the server log, a column of the cards that have a role, each block headed by what its card is given to, the studio's card framed.
// It asks only while one of the two is in sight, and the page is.
(function () {
  "use strict";
  var KEEP = 120, COLORS = ["#3f9a4a", "#e0b030", "#c8372d"];          // the level meter's green, yellow and red
  var S = { rings: {}, names: {}, roles: null, since: 0, busy: false, error: "", seen: false };
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function tr(s) { return window.RuachI18n ? window.RuachI18n.t(s) : s; }
  function gb(mb) { return mb == null ? "?" : (mb / 1024).toFixed(1); }

  function where() {                                  // what is in sight: the unfolded log, the Engine room
    if (document.visibilityState !== "visible") return [];
    var out = [], dock = $("logDock"), eng = $("view-engine");
    if (dock && !dock.classList.contains("is-folded")) out.push("dock");
    if (eng && !eng.classList.contains("is-hidden")) out.push("engine");
    return out;
  }
  function roleOf(i) {                                // what the card is given to, as the column's head says it
    var r = S.roles, say = [];
    if (!r) return "";
    if (r.studio === i) say.push(tr("Studio"));
    if ((r.train || []).indexOf(i) >= 0) say.push(tr("Training") + (r.training && r.training[String(i)] ? " " + r.training[String(i)] : ""));
    if ((r.jobs || []).indexOf(i) >= 0) say.push(tr("Lab jobs"));
    return say.join(" · ");
  }
  function color(v) {                                 // 0…1 → green, yellow, red, as btop's own gradient
    var a = Math.max(0, Math.min(1, v)) * 2, k = Math.min(1, Math.floor(a)), f = a - k;
    var c0 = COLORS[k], c1 = COLORS[Math.min(2, k + 1)];
    var mix = function (s, e) { return Math.round(parseInt(c0.substr(s, 2), 16) * (1 - f) + parseInt(c1.substr(s, 2), 16) * f); };
    return "rgb(" + mix(1) + "," + mix(3) + "," + mix(5) + ")";
  }
  function draw(canvas, ring, wide) {                 // two lanes: the load above, the memory below; the newest bar at the right
    var dpr = window.devicePixelRatio || 1, w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    var g = canvas.getContext("2d"), cs = getComputedStyle(document.documentElement);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    var lane = (h - 2) / 2, bw = w / KEEP, n = ring.length, ink = cs.getPropertyValue("--ink").trim() || "#444";
    g.fillStyle = ink;                                  // each lane's own faint ground, so an empty one reads as a lane
    g.globalAlpha = 0.05;
    g.fillRect(0, 0, w, lane);
    g.fillRect(0, lane + 2, w, lane);
    g.globalAlpha = 1;
    for (var k = 0; k < n; k++) {
      var s = ring[k], x = w - (n - k) * bw, util = (s[1] || 0) / 100, mem = s[3] ? (s[2] || 0) / s[3] : 0;
      var bh = Math.max(util > 0 ? 1 : 0, util * (lane - 1));
      g.fillStyle = color(util);
      g.fillRect(x, lane - bh, Math.max(1, bw - (wide ? 1 : 0.4)), bh);
      var mh = Math.max(mem > 0 ? 1 : 0, mem * (lane - 1));
      g.fillStyle = color(mem);
      g.fillRect(x, h - mh, Math.max(1, bw - (wide ? 1 : 0.4)), mh);
    }
    g.font = "9px " + (cs.getPropertyValue("--mono").trim() || "monospace");      // the lanes' names, small, at their left
    g.fillStyle = cs.getPropertyValue("--muted").trim() || "#888";
    g.textBaseline = "top";
    g.fillText(tr("load"), 3, 2);
    g.fillText("VRAM", 3, lane + 4);
  }
  function nums(ring) {
    var s = ring[ring.length - 1];
    if (!s) return '<span class="gl-wait">' + esc(tr("waiting for the first second…")) + "</span>";
    return '<span class="gl-util">' + esc(tr("load")) + " <b>" + Math.round(s[1] || 0) + "%</b></span>" +
      '<span class="gl-mem">VRAM <b>' + gb(s[2]) + "</b> / " + gb(s[3]) + " GB</span>" +
      (s[4] != null ? '<span class="gl-temp">' + Math.round(s[4]) + " °C</span>" : "") +
      (s[5] != null ? '<span class="gl-watt">' + Math.round(s[5]) + " W</span>" : "");
  }
  function paintEngine() {
    Array.prototype.forEach.call(document.querySelectorAll("#gpuRoles .gpu-live[data-gpu]"), function (box) {
      var i = +box.dataset.gpu, ring = S.rings[i] || [];
      if (!box.firstChild) box.innerHTML = '<canvas class="gl-graph gl-wide" aria-hidden="true"></canvas><div class="gl-nums mono"></div>';
      box.querySelector(".gl-nums").innerHTML = nums(ring);
      draw(box.querySelector("canvas"), ring, true);
    });
  }
  function paintDock() {
    var host = $("logDockGpus"), dock = $("logDock");
    if (!host || !dock) return;
    var ids = Object.keys(S.rings).map(Number).sort(function (a, b) { return a - b; });
    var withRole = ids.filter(function (i) { return roleOf(i); });
    var show = withRole.length ? withRole : ids;
    dock.classList.toggle("has-gpus", show.length > 0);
    if (!show.length) { host.innerHTML = S.error ? '<p class="gl-wait">' + esc(S.error) + "</p>" : ""; return; }
    if (host.dataset.ids !== show.join(",")) {
      host.dataset.ids = show.join(",");
      host.innerHTML = show.map(function (i) {
        return '<div class="gl-card" data-gpu="' + i + '"><div class="gl-head"><span class="gl-role"></span><span class="gl-name mono"></span></div>' +
          '<canvas class="gl-graph" aria-hidden="true"></canvas><div class="gl-nums mono"></div></div>';
      }).join("");
    }
    var main = S.roles ? S.roles.studio : null;
    show.forEach(function (i) {
      var card = host.querySelector('.gl-card[data-gpu="' + i + '"]'), ring = S.rings[i] || [];
      card.classList.toggle("is-main", i === main);
      card.querySelector(".gl-role").textContent = roleOf(i) || tr("No role");
      card.querySelector(".gl-name").textContent = "GPU" + i + " · " + String(S.names[i] || "").replace(/^NVIDIA GeForce /, "");
      card.querySelector(".gl-nums").innerHTML = nums(ring);
      draw(card.querySelector("canvas"), ring, false);
    });
    // the dock as tall as its cards need (the log beside them as tall), never more than 60 % of the window: both scroll inside
    dock.style.setProperty("--gl-h", Math.min(Math.max(host.scrollHeight, 181), Math.round(innerHeight * 0.6)) + "px");
  }
  function paint(on) {
    if (on.indexOf("engine") >= 0) paintEngine();
    if (on.indexOf("dock") >= 0) paintDock();
  }
  function tick() {
    var on = where();
    if (!on.length || S.busy) return;
    S.busy = true;
    fetch("/lab/gpus/live?since=" + S.since).then(function (r) {
      return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || "HTTP " + r.status); return d; });
    }).then(function (d) {
      S.error = d.error || "";
      (d.cards || []).forEach(function (c) {
        var ring = S.rings[c.index] || (S.rings[c.index] = []);
        (c.samples || []).forEach(function (s) { ring.push(s); if (s[0] > S.since) S.since = s[0]; });
        if (ring.length > KEEP) ring.splice(0, ring.length - KEEP);
        S.names[c.index] = c.name;
      });
      if (d.roles && !d.roles.error) S.roles = d.roles;
      paint(on);
    }).catch(function (e) { S.error = tr("The lab does not answer") + ": " + e.message; paint(on); })
      .then(function () { S.busy = false; });
  }
  setInterval(tick, 1000);
  document.addEventListener("visibilitychange", tick);
  window.HeresyGpuLive = { tick: tick, state: S };
})();
