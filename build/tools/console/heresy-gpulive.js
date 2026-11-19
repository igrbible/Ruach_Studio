// HERESY 1264 (Viktor 09.10.2026: «Добавь в страничку Engine в GPUs секцию под каждым btop-like монитор утилизации/VRAM usage в
// реальном времени»; «btop ересь можно прикрутить и к фрейму лога сервера. Разрешаю сделать его шире на 200-400px, В две колонки. В
// одной живой лог, в другой живая шкала активных GPU, где главная карта особо обрамлена. Пометки над блоками графов — какая роль
// карты»): the cards second by second (the lab's /gpus/live: one nvidia-smi while a page looks), drawn as btop draws them: a bar a
// second for the load and one for the memory, two minutes wide, green to yellow to red. In Engine → GPUs under each card's row; beside
// the server log, a column of the cards that have a role, each block headed by what its card is given to, the Studio's card framed.
// It asks only while one of the two is in sight, and the page is.
(function () {
  "use strict";
  var KEEP = 120, COLORS = ["#3f9a4a", "#e0b030", "#c8372d"];          // the level meter's green, yellow and red
  var S = { rings: {}, names: {}, roles: null, since: 0, busy: false, error: "", seen: false, asked: 0 }, IDLE_EVERY = 50000;   // HERESY 2727
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function tr(s) { return window.RuachI18n ? window.RuachI18n.t(s) : s; }
  function gb(mb) { return mb == null ? "?" : (mb / 1024).toFixed(1); }

  // HERESY 1343 (Viktor 10.10.2026: «детач лога сервера сделай вместе с GPU колонкой»): the log's own window, when it is open
  function popOpen() { var p = window.ruachLogPop && window.ruachLogPop(); return p && p.gpus && p.win && !p.win.closed ? p : null; }
  function where() {                                  // what is in sight: the unfolded log, the Engine room, the log's window
    var pop = popOpen(), seen = document.visibilityState === "visible";
    if (!seen && !pop) return [];
    var out = [], dock = $("logDock"), eng = $("view-engine");
    if (seen && dock && !dock.classList.contains("is-folded")) out.push("dock");
    if (seen && eng && !eng.classList.contains("is-hidden")) out.push("engine");
    if (pop) out.push("pop");
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
    var vw = (canvas.ownerDocument && canvas.ownerDocument.defaultView) || window;   // HERESY 1343: its own window (the log's may be on another screen)
    var dpr = vw.devicePixelRatio || 1, w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    var g = canvas.getContext("2d"), cs = vw.getComputedStyle(canvas.ownerDocument.documentElement);
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
  // HERESY 1680: a card's label with its short name. HERESY 2733 (Viktor 18.11.2026: «XPU для Arc. GPU для геймерских RTX… GPU для всех Nvidia…
  // осторожно — Nvidia GPU, «GPU · RTX 3090» и «GPU · A100»… AMD Radeon своим кагалем… CUDA, SYCL, Vulkan, etc.»): one way to name a processor in
  // the whole page: an NVIDIA card GPUn · its model (GPU0 · RTX 3090, GPU · A100), an Intel Arc XPUn · its model (XPU0 · Arc Pro B50: the lab
  // numbers them from 100, shown from 0), an AMD Radeon GPUn · Radeon its model (a family of its own), the processor CPU; the backend by its
  // own name where it is said (CUDA, SYCL, Vulkan, ROCm, Metal, CPU). Only what is shown: the lab's indices (0, 1, 100) and the engine's
  // devices (CUDA0, SYCL0) stay what they are underneath
  function procModel(name) {
    return String(name || "").replace(/\((R|TM|tm)\)/g, "").replace(/^\s*NVIDIA\s+(GeForce\s+)?/i, "").replace(/^\s*Intel\s+/i, "").replace(/^\s*AMD\s+/i, "")
      .replace(/\s+Graphics\b.*$/i, "").replace(/\s*\([^)]*\)\s*$/, "").replace(/\s+/g, " ").trim();   // a driver's own word in brackets goes
  }
  function procShort(g, name) {                      // a card (or the lab's "0+1+2", or a list) as GPU0, XPU0, GPU0+1+2; "cpu" CPU, "arc" XPU
    if (Array.isArray(g)) return procShort(g.join("+"));
    var s = String(g == null ? "" : g).trim();
    if (/[+,]/.test(s)) { var p = s.split(/[+,]\s*/).filter(Boolean), k = procShort(p[0]); return k + p.slice(1).map(function (x) { return "+" + procShort(x).replace(/^[A-Z]+/, ""); }).join(""); }
    if (/^cpu$/i.test(s)) return "CPU";
    if (/^(arc|xpu)$/i.test(s)) return "XPU";
    var i = parseInt(s, 10);
    if (isNaN(i)) return s;
    return i >= 100 ? "XPU" + (i - 100) : (/\b(Arc|Intel)\b/i.test(String(name || "")) ? "XPU" : "GPU") + i;
  }
  function gpuLabel(i, name) { var m = procModel(name); return procShort(i, name) + (m ? " · " + m : ""); }
  function procBackend(dev) {                        // the engine's device (CUDA0, SYCL0, Vulkan0, ROCm0, Metal, CPU): its backend's own name
    var m = /^(CUDA|SYCL|Vulkan|ROCm|HIP|Metal|CPU)/i.exec(String(dev || ""));
    return m ? { cuda: "CUDA", sycl: "SYCL", vulkan: "Vulkan", rocm: "ROCm", hip: "ROCm", metal: "Metal", cpu: "CPU" }[m[1].toLowerCase()] : "";
  }
  function procKind(dev, description) {            // what an engine's device is: XPU (an Intel Arc), CPU, else GPU
    var b = procBackend(dev);
    return b === "CPU" ? "CPU" : b === "SYCL" || /\b(Arc|Intel)\b/i.test(String(description || "")) ? "XPU" : "GPU";
  }
  function procDevice(dev, description) {          // the engine's device by the same rule: XPU · Arc Pro B50 · SYCL, GPU · RTX 3090 · CUDA
    var k = procKind(dev, description), m = procModel(description || dev), b = procBackend(dev);
    return k === "CPU" ? "CPU" : k + (m ? " · " + m : "") + (b ? " · " + b : "");
  }
  window.HeresyGpuLabel = gpuLabel;
  window.HeresyProc = { label: gpuLabel, short: procShort, model: procModel, backend: procBackend, kind: procKind, device: procDevice };
  function shown() {                                  // the cards with a role, else all of them
    var ids = Object.keys(S.rings).map(Number).sort(function (a, b) { return a - b; });
    var withRole = ids.filter(function (i) { return roleOf(i); });
    return withRole.length ? withRole : ids;
  }
  // HERESY 1343: the column's cards into a host, the dock's or the log window's; false when there are none to show
  function cardsInto(host, show) {
    if (!show.length) { host.innerHTML = S.error ? '<p class="gl-wait">' + esc(S.error) + "</p>" : ""; host.dataset.ids = ""; return false; }
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
      card.querySelector(".gl-name").textContent = gpuLabel(i, S.names[i]);   // HERESY 1680: an Intel card as Arc0
      card.querySelector(".gl-nums").innerHTML = nums(ring);
      draw(card.querySelector("canvas"), ring, false);
    });
    return true;
  }
  function paintPop() { var p = popOpen(); if (p) cardsInto(p.gpus, shown()); }   // HERESY 1343
  function paintDock() {
    var host = $("logDockGpus"), dock = $("logDock");
    if (!host || !dock) return;
    var show = shown();
    dock.classList.toggle("has-gpus", show.length > 0);
    if (!cardsInto(host, show)) return;
    // the dock as tall as its cards need (the log beside them as tall), never more than 60 % of the window: both scroll inside.
    // HERESY 1293: what the cards need is the last one's bottom, not the column's scrollHeight: the column is --gl-h itself, so that
    // kept a full height's size after folding back, and lost the column's border, a pixel a tick
    var last = host.lastElementChild, cs = getComputedStyle(host);
    if (!last) return;
    var need = Math.ceil(last.getBoundingClientRect().bottom - host.getBoundingClientRect().top + host.scrollTop +
                         (parseFloat(cs.paddingBottom) || 0) + (parseFloat(cs.borderBottomWidth) || 0));
    var h = Math.min(Math.max(need, 181), Math.round(innerHeight * 0.6)) + "px";
    if (dock.style.getPropertyValue("--gl-h") !== h) dock.style.setProperty("--gl-h", h);
  }
  function paint(on) {
    if (on.indexOf("engine") >= 0) paintEngine();
    if (on.indexOf("dock") >= 0) paintDock();
    if (on.indexOf("pop") >= 0) paintPop();   // HERESY 1343
  }
  function tick() {
    var on = where();
    if (S.busy) return;                                // HERESY 1625: the samples come in all the while; drawn where in sight
    // HERESY 2727 (the resource audit of 18.11.2026, R3: a tab in the background asked every 2 s too, 5 400 times in three night hours; Viktor's rule
    // of the modes, 2721: the cards' sampling is the one job awake in every mode): the page idle (hidden, or untouched) asks once in 50 s, inside the
    // lab's minute and its four minutes of samples, so the lab's sampler goes on and the rings get every sample; awake again, at once and every 2 s
    if (window.HeresyIdle && window.HeresyIdle.mode() === "idle_ui" && !popOpen() && Date.now() - S.asked < IDLE_EVERY) return;
    S.asked = Date.now();

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
  // HERESY 1625 (Viktor 20.10.2026: «правильнее рисовать их постоянно, чтобы при развороте граф видеокарт не начинался с пустоты. И шаг увеличь с
  // секунды до 2-х»): asked every two seconds whether in sight or not, the lab's sampler at two seconds too (120 bars: four minutes); the log
  // unfolded or the Engine room shown draws at once what came in meanwhile
  var EVERY = 2000;
  setInterval(tick, EVERY);
  if (window.HeresyIdle) window.HeresyIdle.on(function (why) { if (why === "awake") tick(); });   // HERESY 2727: awake again (the tab seen, a hand), at once
  else document.addEventListener("visibilitychange", tick);
  function seen() { var on = where(); if (on.length) paint(on); }
  function watch() {
    if (!window.MutationObserver) return;
    ["logDock", "view-engine"].forEach(function (id) { var el = $(id); if (el) new MutationObserver(seen).observe(el, { attributes: true, attributeFilter: ["class"] }); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", watch); else watch();
  window.HeresyGpuLive = { tick: tick, state: S, every: EVERY, paint: seen };   // HERESY 2087: paint, drawn again where in sight (the log's window resized)
})();
