// HERESY 2299 (Viktor 09.11.2026: «В Художнике, Огранщике и Видеографе предлагаю минипанель под хедером студии с реальными метриками по утилизации
// CPU/GPU/RAM/VRAM/NVMe/HDD, и туда же в неё прогресс-бары, чтобы юзер видел свою систему, а не гадал и не бегал в отдельные консоли за
// nvidia-smi/nvitop/btop/htop. При наведении мышкой на каждую позицию — тултипом вывод метрик и графов. Давай переплюнем ComfyUI подобные плагины»;
// again the same day: «За бар с утилизацией устройств не забыл? Сделай его сейчас»): a thin bar under the Studio's header, in the Artist, the Refiner
// and the Videographer (Engine → Defaults: in every room, or nowhere): the processor, the memory, each card (NVIDIA's and an Intel Arc), each disk
// something is mounted from, and the room's running jobs as bars. Each item's tooltip: its numbers, its last minute and its last ten minutes drawn.
// The machine's numbers come from the lab's /lab/sys/live (the kernel's /proc, once a second while a page looks, nothing at all when none does),
// the cards' from what heresy-gpulive.js already asks (/lab/gpus/live, one nvidia-smi), the jobs from the page's own «heresy-activity». Through the
// friends' door the machine is not a friend's to see: the door refuses /lab/sys/live, and the bar leaves the page for good on that refusal.
// HERESY 2302 (Viktor 09.11.2026: «Бар до такой степени тонкий, что я бы во все комнаты открыл его, абсолютно во все. И в комнате Тренера он точно
// нужен… по умолчанию пусть везде будет включён. А чтобы глаза не мозолил… можно сворачивать плашкой вправо вверху в его вертикальной позиции»):
// every room is the Studio's own (the three rooms a choice now; a choice made stays); the tab at the bar's right end folds it to a strip with the tab
// hanging from it, kept in this browser (ruach.sysbarFold: not a yue2.* key, which the settings carry to every browser); folded, it asks the lab nothing.
(function () {
  "use strict";
  var KEY = "yue2.sysbar", FOLD = "ruach.sysbarFold";   // empty (or "all"): every room; "rooms": the Artist, the Refiner and the Videographer; "off": nowhere
  var ROOMS = { artist: 1, post: 1, video: 1 };
  var KINDS = { artist: /^(art|artist)$/, post: /^(stems|midi|remaster|upscale|debuzz|gate|timing|textend|spectrum|inspect)$/, video: /^video$/ };
  var KEEP = 600, GKEEP = 300, CORE_KEEP = 60;      // ten minutes of the machine (a second each), of the cards (two seconds each); the cores' minute
  var S = { since: 0, ring: [], cores: [], disks: [], cpu: null, load: [], skew: 0, busy: false, gone: false, missing: 0, error: "",
            g: {}, gsince: {}, jobs: [], jobsAt: 0, hover: null, keys: "", hideT: 0, tight: 0, fitSig: "",
            fold: (function () { try { return localStorage.getItem("ruach.sysbarFold") === "1"; } catch (e) { return false; } })() };
  function $(id) { return document.getElementById(id); }
  function tr(s) { return window.RuachI18n ? window.RuachI18n.t(s) : s; }
  function fmt(s) { var a = arguments; return tr(s).replace(/\{(\d)\}/g, function (m, i) { return a[+i + 1] != null ? a[+i + 1] : ""; }); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function recall() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function now() { return Date.now() / 1000 + S.skew; }
  function gb(mb, d) { return mb == null ? "?" : (mb / 1024).toFixed(d == null ? 1 : d); }
  function bytes(b) {                               // 4.5 TB, 644 GB, 12 MB
    if (b == null) return "?";
    var u = ["B", "KB", "MB", "GB", "TB", "PB"], k = 0;
    while (b >= 1000 && k < u.length - 1) { b /= 1000; k++; }
    return (b >= 100 || k === 0 ? Math.round(b) : b.toFixed(1)) + " " + u[k];
  }
  function rate(b) {                                // a rate in the bar: 0, 512K, 12M, 1.2G
    if (!b || b < 1000) return "0";
    var u = ["K", "M", "G"], k = -1;
    while (b >= 1000 && k < 2) { b /= 1000; k++; }
    return (b >= 10 ? Math.round(b) : b.toFixed(1)) + u[k];
  }
  function pct(v) { return v == null ? "?" : Math.round(v) + "%"; }
  function lv(f) { return f == null ? "" : f >= 0.85 ? "lv-hot" : f >= 0.6 ? "lv-mid" : "lv-ok"; }
  function css(name, d) { var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim(); return v || d; }

  // ------------------------------------------------------------------ where it shows
  function bar() { return $("sysBar"); }
  function wanted() {
    var v = recall(), tab = document.body.dataset.tab;
    if (S.gone || v === "off" || !bar()) return false;
    if (window.matchMedia && window.matchMedia("(max-width: 760px)").matches) return false;   // a phone: its three rooms keep their room
    return v !== "rooms" || !!ROOMS[tab];
  }
  function apply() {
    var on = wanted(), el = bar();
    if (!el) return false;
    if (el.hidden === on) el.hidden = !on;
    if (document.body.classList.contains("has-sysbar") !== on) document.body.classList.toggle("has-sysbar", on);
    foldPaint();
    if (!on || S.fold) hidePop(true);
    return on;
  }
  function foldPaint() {                            // HERESY 2302: folded or not, and the tab saying what its click does
    var b = $("sbFold"), say = S.fold ? "Unfold the system bar" : "Fold the system bar to a small tab (this browser keeps it so)";
    if (document.body.classList.contains("sysbar-folded") !== S.fold) document.body.classList.toggle("sysbar-folded", S.fold);
    if (b && b.getAttribute("aria-expanded") !== String(!S.fold)) { b.setAttribute("aria-expanded", String(!S.fold)); b.setAttribute("aria-label", say); b.dataset.tip = say; }
  }
  function setFold(on) {                            // the tab's click: kept in this browser (a private window: for this page only)
    S.fold = !!on;
    try { if (S.fold) localStorage.setItem(FOLD, "1"); else localStorage.removeItem(FOLD); } catch (e) { /* no storage */ }
    S.fitSig = "";
    if (apply()) tick();
  }

  // ------------------------------------------------------------------ what it asks
  function gpus() {                                 // the cards' new samples from heresy-gpulive's own rings, into ten minutes of ours
    var L = window.HeresyGpuLive && window.HeresyGpuLive.state;
    if (!L) return;
    Object.keys(L.rings || {}).forEach(function (k) {
      var i = +k, ring = L.rings[k] || [], mine = S.g[i] || (S.g[i] = []), from = S.gsince[i] || 0;
      ring.forEach(function (s) { if (s[0] > from) { mine.push(s); from = s[0]; } });
      S.gsince[i] = from;
      if (mine.length > GKEEP) mine.splice(0, mine.length - GKEEP);
    });
  }
  function tick() {
    if (!apply() || S.fold || document.visibilityState !== "visible") return;   // HERESY 2302: folded, nothing asked
    gpus();
    if (S.busy || (S.missing && Date.now() < S.missing)) { paint(); return; }
    S.busy = true;
    fetch("/lab/sys/live?since=" + S.since).then(function (r) {
      if (r.status === 403) { S.gone = true; apply(); throw null; }      // the friends' door: not a friend's to see, and no asking again
      if (r.status === 404) { S.missing = Date.now() + 30000; S.error = tr("This lab does not report the machine yet (restart it)"); throw null; }
      return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || "HTTP " + r.status); return d; });
    }).then(function (d) {
      S.missing = 0;
      S.error = d.error || "";
      S.skew = (d.now || Date.now() / 1000) - Date.now() / 1000;
      S.cpu = d.cpu || S.cpu; S.load = d.load || []; S.disks = d.disks || [];
      (d.samples || []).forEach(function (s) { S.ring.push(s); if (s[0] > S.since) S.since = s[0]; });
      if (S.ring.length > KEEP) S.ring.splice(0, S.ring.length - KEEP);
      (d.cores || []).forEach(function (c) { S.cores.push(c); });
      if (S.cores.length > CORE_KEEP) S.cores.splice(0, S.cores.length - CORE_KEEP);
    }).catch(function (e) { if (e) S.error = tr("The lab does not answer") + ": " + e.message; })
      .then(function () { S.busy = false; paint(); });
  }

  // ------------------------------------------------------------------ the bar
  function last() { return S.ring[S.ring.length - 1] || null; }
  function gLast(i) { var r = S.g[i] || []; return r[r.length - 1] || null; }
  function cards() { return Object.keys(S.g).map(Number).sort(function (a, b) { return a - b; }); }
  function gpuShort(i) { return i >= 100 ? "Arc" + (i - 100) : "GPU" + i; }
  function gpuName(i) {
    var L = window.HeresyGpuLive && window.HeresyGpuLive.state, n = L && L.names ? L.names[i] : "";
    return window.HeresyGpuLabel ? window.HeresyGpuLabel(i, n) : gpuShort(i) + " · " + (n || "");
  }
  function diskSub(d) {                             // the disk's own word in the bar: where it is mounted, its last folder
    var m = d.mounts && d.mounts[0];
    if (!m) return d.id;
    return m === "/" ? "/" : m.replace(/\/+$/, "").split("/").pop();
  }
  function meter(lanes) {
    return '<span class="sb-meter' + (lanes > 1 ? " is-two" : "") + '">' + new Array(lanes + 1).join("<b><i></i></b>") + "</span>";
  }
  function item(key, name, sub, lanes) {
    return '<div class="sb-item" data-sb="' + esc(key) + '" tabindex="0" role="button" aria-haspopup="true">' +
      (key.indexOf("disk:") === 0 && window.HeresyIcons ? '<span class="sb-dico" aria-hidden="true">' + window.HeresyIcons.ui("hard-drive") + "</span>" : "") +   // HERESY 2523
      '<span class="sb-name" translate="no">' + esc(name) + "</span>" +
      (sub ? '<span class="sb-sub mono" translate="no">' + esc(sub) + "</span>" : "") + meter(lanes) + '<span class="sb-val mono"></span></div>';
  }
  function setMeter(el, fracs) {
    var bs = el.querySelectorAll(".sb-meter > b");
    fracs.forEach(function (f, k) {
      var b = bs[k];
      if (!b) return;
      var w = f == null ? 0 : Math.max(0, Math.min(1, f)) * 100;
      b.firstChild.style.width = w.toFixed(1) + "%";
      b.className = lv(f);
    });
  }
  function build() {
    var host = $("sbItems"), ks = ["cpu", "ram"].concat(cards().map(function (i) { return "gpu:" + i; }), S.disks.map(function (d) { return "disk:" + d.id; }));
    var sig = ks.join(",") + "|" + (window.RuachI18n ? window.RuachI18n.lang() : "en");
    if (S.keys === sig) return host;
    S.keys = sig;
    host.innerHTML = item("cpu", "CPU", "", 1) + item("ram", "RAM", "", 1) +
      cards().map(function (i) { return item("gpu:" + i, gpuShort(i), "", 2); }).join("") +
      S.disks.map(function (d) { return item("disk:" + d.id, d.kind, diskSub(d), 2); }).join("");
    return host;
  }
  function paint() {
    var el = bar();
    if (!el || el.hidden || S.fold) return;
    var host = build();
    paintJobs();
    // as tight as the window needs: first the disks' folders and the cards' temperatures go, then the disks' rates (their tooltips keep all)
    var sig = S.keys + "|" + document.documentElement.clientWidth + "|" + $("sbJobs").childElementCount + "|" + !!S.error;
    if (S.fitSig !== sig) {
      S.fitSig = sig;
      for (var t = 0; t <= 4; t++) { S.tight = t; el.dataset.tight = t; texts(host); if (host.scrollWidth <= host.clientWidth + 1) break; }   // HERESY 2523: 3, the disks' marks; 4, the cards' percent alone
    } else texts(host);
    var note = $("sbNote");
    if (note) { note.hidden = !S.error; note.textContent = S.error; }
    if (S.hover) paintPop();
  }
  function texts(host) {
    var s = last();
    var cpu = host.querySelector('[data-sb="cpu"]'), ram = host.querySelector('[data-sb="ram"]');
    bar().classList.toggle("is-quiet", !s);
    if (cpu) { setMeter(cpu, [s ? s[1] / 100 : null]); cpu.querySelector(".sb-val").textContent = s ? pct(s[1]) : "—"; }
    if (ram) { setMeter(ram, [s && s[4] ? s[3] / s[4] : null]); ram.querySelector(".sb-val").textContent = s ? gb(s[3], 0) + "/" + gb(s[4], 0) + " GB" : "—"; }
    cards().forEach(function (i) {
      var it = host.querySelector('[data-sb="gpu:' + i + '"]'), g = gLast(i);
      if (!it) return;
      setMeter(it, [g ? (g[1] || 0) / 100 : null, g && g[3] ? (g[2] || 0) / g[3] : null]);
      it.querySelector(".sb-val").textContent = g ? pct(g[1]) + (S.tight >= 4 ? "" : " · " + gb(g[2]) + "/" + gb(g[3], 0) + " GB") + (g[4] != null && !S.tight ? " · " + Math.round(g[4]) + "°" : "") : "—";
    });
    S.disks.forEach(function (d) {
      var it = host.querySelector('[data-sb="disk:' + d.id + '"]'), r = s && s[8] ? s[8][d.id] : null;
      if (!it) return;
      setMeter(it, [r ? r[2] / 100 : null, d.total ? 1 - d.free / d.total : null]);
      it.querySelector(".sb-val").textContent = r ? "⇣" + rate(r[0]) + " ⇡" + rate(r[1]) : "—";
    });
  }

  // ------------------------------------------------------------------ the room's jobs
  function clock(s) { s = Math.max(0, Math.round(s)); return s >= 3600 ? Math.floor(s / 3600) + ":" + ("0" + Math.floor(s % 3600 / 60)).slice(-2) + ":" + ("0" + s % 60).slice(-2) : Math.floor(s / 60) + ":" + ("0" + s % 60).slice(-2); }
  function title(name) { return String(name || "").replace(/^\d{8}-\d{6}-(\d+-)?/, ""); }
  function roomJobs() {
    var tab = document.body.dataset.tab, k = KINDS[tab];
    return S.jobs.filter(function (r) {
      var kind = r.kind || String(r.key || "").split(":")[0];
      return k ? k.test(kind) : true;
    });
  }
  function jobState(r) {                            // [fraction or null, what it says]: as the strip above the player says it
    var since = (Date.now() - S.jobsAt) / 1000;
    if (r.status !== "running") return [null, tr("waiting")];
    if (r.steps) return [Math.min(1, (r.step || 0) / r.steps), fmt("step {0} of {1}", r.step || 0, r.steps)];
    if (r.expect) {
      var e = (r.elapsed || 0) + since;
      return [Math.min(0.97, e / r.expect), clock(e) + (e < r.expect ? " · " + fmt("about {0} left", clock(r.expect - e)) : " · " + tr("longer than usual"))];
    }
    return [null, r.elapsed != null ? clock(r.elapsed + since) : ""];
  }
  function jobWhat(r) { return String(r.what || "").split(" · ").map(tr).join(" · "); }
  function paintJobs() {
    var host = $("sbJobs");
    if (!host) return;
    var rows = roomJobs(), shown = rows.slice(0, 3);
    host.hidden = !rows.length;
    var html = shown.map(function (r, k) {
      var st = jobState(r);
      // HERESY 2523 (the UIX audit 13.11.2026, №6): its kind and its percent; the run's or take's name is its tooltip's (it cut the disks short)
      var trn = String(r.key || "").indexOf("train:") === 0;
      return '<div class="sb-job' + (st[0] == null ? " is-open" : "") + (trn ? " is-train" : "") + '" data-sb="job:' + k + '" tabindex="0" role="button" aria-haspopup="true">' +
        '<span class="sb-jname">' + esc(jobWhat(r)) + "</span>" +
        '<span class="sb-jbar"><i style="width:' + (st[0] == null ? 100 : Math.round(st[0] * 100)) + '%"></i></span>' +
        '<span class="sb-jpct mono">' + (st[0] == null ? "" : Math.round(st[0] * 100) + "%") + "</span></div>";
    }).join("") + (rows.length > 3 ? '<span class="sb-more mono">' + esc(fmt("and {0} more", rows.length - 3)) + "</span>" : "");
    if (host.dataset.html !== html) { host.dataset.html = html; host.innerHTML = html; }
    if (S.hover && S.hover.indexOf("job:") === 0) { var on = host.querySelector('[data-sb="' + S.hover + '"]'); if (on) on.classList.add("is-on"); }
  }
  window.addEventListener("heresy-activity", function (e) {
    S.jobs = ((e.detail && e.detail.running) || []).slice();
    S.jobsAt = Date.now();
    paintJobs();
  });

  // ------------------------------------------------------------------ the tooltip: numbers and two graphs
  function pop() {
    var p = $("sbPop");
    if (!p) { p = document.createElement("div"); p.id = "sbPop"; p.className = "sb-pop"; p.hidden = true; p.setAttribute("role", "tooltip"); document.body.appendChild(p); }
    return p;
  }
  function fit(c) {
    var dpr = window.devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight;
    if (!w || !h) return null;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    var g = c.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    return { g: g, w: w, h: h };
  }
  // lines: [{ pts: [[t, v], …], color, fill }]; max: the top (0: the highest point and a little); label(max): the top's words at the left
  function plot(c, lines, span, max, label) {
    var f = fit(c);
    if (!f) return;
    var g = f.g, w = f.w, h = f.h, t1 = now();
    g.fillStyle = css("--ink", "#444");
    g.globalAlpha = 0.05; g.fillRect(0, 0, w, h);
    g.globalAlpha = 0.14; g.fillRect(0, Math.round(h / 2), w, 1);
    g.globalAlpha = 1;
    lines.forEach(function (l) { l.pts = l.pts.filter(function (p) { return t1 - p[0] <= span && p[1] != null; }); });
    if (!max) { lines.forEach(function (l) { l.pts.forEach(function (p) { if (p[1] > max) max = p[1]; }); }); max = (max || 1) * 1.15; }
    var X = function (t) { return w - (t1 - t) / span * w; }, Y = function (v) { return h - 1 - Math.min(1, Math.max(0, v / max)) * (h - 3); };
    lines.forEach(function (l) {
      if (l.pts.length < 2) return;
      g.beginPath();
      l.pts.forEach(function (p, k) { if (k) g.lineTo(X(p[0]), Y(p[1])); else g.moveTo(X(p[0]), Y(p[1])); });
      g.strokeStyle = l.color; g.lineWidth = 1.25; g.lineJoin = "round"; g.stroke();
      if (l.fill) {
        g.lineTo(X(l.pts[l.pts.length - 1][0]), h); g.lineTo(X(l.pts[0][0]), h); g.closePath();
        g.globalAlpha = 0.16; g.fillStyle = l.color; g.fill(); g.globalAlpha = 1;
      }
    });
    if (label) {
      g.font = "9px " + (css("--mono", "monospace"));
      g.fillStyle = css("--muted", "#888"); g.textBaseline = "top";
      g.fillText(label(max), 3, 2);
    }
  }
  function coresGrid(c) {                           // a sparkline a core, eight to a row, each in its level's colour
    var f = fit(c);
    if (!f || !S.cores.length) return;
    var g = f.g, w = f.w, n = S.cores[S.cores.length - 1][1].length, cols = 8, cw = w / cols, ch = 18, k, j;
    var col = { "lv-ok": css("--good", "#3f9a4a"), "lv-mid": css("--star-gold", "#c9a13b"), "lv-hot": css("--bad", "#c8372d") }, ink = css("--ink", "#444");
    for (k = 0; k < n; k++) {
      var x0 = (k % cols) * cw + 1, y0 = Math.floor(k / cols) * (ch + 2), cur = S.cores[S.cores.length - 1][1][k] || 0, m = S.cores.length;
      g.fillStyle = ink; g.globalAlpha = 0.05; g.fillRect(x0, y0, cw - 2, ch); g.globalAlpha = 1;
      g.beginPath();
      for (j = 0; j < m; j++) {
        var v = (S.cores[j][1][k] || 0) / 100, x = x0 + (cw - 2) * (CORE_KEEP - m + j) / (CORE_KEEP - 1), y = y0 + ch - 1 - v * (ch - 2);
        if (j) g.lineTo(x, y); else g.moveTo(x, y);
      }
      g.strokeStyle = col[lv(cur / 100)]; g.lineWidth = 1; g.stroke();
    }
  }
  function grid(rows) { return '<div class="sb-grid">' + rows.filter(Boolean).map(function (r) { return "<span>" + esc(r[0]) + '</span><span class="mono">' + esc(r[1]) + "</span>"; }).join("") + "</div>"; }
  function keys(list) { return '<span class="sb-keys">' + list.map(function (k) { return '<span><i style="background:' + k[1] + '"></i>' + esc(k[0]) + "</span>"; }).join("") + "</span>"; }
  function graphs(legend) {
    return '<div class="sb-cap"><span>' + esc(tr("the last minute")) + "</span>" + (legend || "") + '</div><canvas class="sb-g1" aria-hidden="true"></canvas>' +
      '<div class="sb-cap"><span>' + esc(tr("the last ten minutes")) + '</span></div><canvas class="sb-g10" aria-hidden="true"></canvas>';
  }
  function peak(pts) { var m = null; pts.forEach(function (p) { if (p[1] != null && (m == null || p[1] > m)) m = p[1]; }); return m; }
  function mean(pts) { var a = 0, n = 0; pts.forEach(function (p) { if (p[1] != null) { a += p[1]; n++; } }); return n ? a / n : null; }
  function col(name, d) { return css(name, d); }
  function popFor(key) {                            // [html, draw(p)] for the item
    var s = last(), A = col("--amber", "#e0b030"), G = col("--good", "#3f9a4a"), B = col("--star-gold", "#c9a13b");
    var series = function (idx, scale) { return S.ring.map(function (r) { return [r[0], typeof idx === "function" ? idx(r) : r[idx] * (scale || 1)]; }); };
    var draw2 = function (lines, max, label) {
      return function (p) {
        var c1 = p.querySelector(".sb-g1"), c10 = p.querySelector(".sb-g10");
        if (c1) plot(c1, lines(), 60, max, label);
        if (c10) plot(c10, lines(), 600, max, label);
      };
    };
    if (key === "cpu") {
      var busy = series(1), top = s && S.cores.length ? S.cores[S.cores.length - 1][1].map(function (v, k) { return [k, v]; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 4) : [];
      return ['<h5 translate="no">CPU · ' + esc(S.cpu ? String(S.cpu.cpu).replace(/\((R|TM)\)/g, "").replace(/ CPU /, " ").replace(/\s+/g, " ") : "") + "</h5>" + grid([
        [tr("Load now"), s ? pct(s[1]) : "—"], [tr("Waiting for the disks"), s ? pct(s[2]) : "—"],
        [tr("Threads"), S.cpu ? String(S.cpu.threads) : "?"], S.load.length ? [tr("Load average (1, 5, 15 min)"), S.load.join(" · ")] : null,
        [tr("Average and peak, ten minutes"), pct(mean(busy)) + " · " + pct(peak(busy))],
        top.length ? [tr("The busiest cores"), top.map(function (c) { return "#" + c[0] + " " + c[1] + "%"; }).join("  ")] : null]) +
        graphs(keys([[tr("load"), A], [tr("waiting for the disks"), B]])) +
        '<div class="sb-cap"><span>' + esc(tr("Each core, the last minute")) + '</span></div><canvas class="sb-cores" aria-hidden="true" style="height:' +
        (Math.ceil(((S.cores.length ? S.cores[S.cores.length - 1][1].length : 8)) / 8) * 20) + 'px"></canvas>',
        function (p) {
          draw2(function () { return [{ pts: series(1), color: A, fill: true }, { pts: series(2), color: B }]; }, 100, function () { return "100%"; })(p);
          var cc = p.querySelector(".sb-cores");
          if (cc) coresGrid(cc);
        }];
    }
    if (key === "ram") {
      var used = series(function (r) { return r[4] ? r[3] / r[4] * 100 : null; });
      return ["<h5>" + esc(tr("Memory (RAM)")) + "</h5>" + grid([
        [tr("In use"), s ? gb(s[3]) + " / " + gb(s[4]) + " GB · " + pct(s[4] ? s[3] / s[4] * 100 : null) : "—"],
        [tr("Available"), s ? gb(s[4] - s[3]) + " GB" : "—"],
        [tr("Cache (given back when asked)"), s ? gb(s[5]) + " GB" : "—"],
        [tr("Swap"), s ? (s[7] ? gb(s[6]) + " / " + gb(s[7]) + " GB" : tr("none")) : "—"],
        [tr("Peak, ten minutes"), pct(peak(used))]]) +
        graphs(keys([[tr("in use"), A], [tr("cache"), G], [tr("swap"), B]])),
        draw2(function () {
          return [{ pts: series(function (r) { return r[4] ? r[3] / r[4] * 100 : null; }), color: A, fill: true },
                  { pts: series(function (r) { return r[4] ? r[5] / r[4] * 100 : null; }), color: G },
                  { pts: series(function (r) { return r[7] ? r[6] / r[7] * 100 : null; }), color: B }];
        }, 100, function () { return "100%"; })];
    }
    if (key.indexOf("gpu:") === 0) {
      var i = +key.slice(4), g = gLast(i), ring = S.g[i] || [], L = window.HeresyGpuLive && window.HeresyGpuLive.state, ro = L && L.roles, say = [];
      if (ro) {
        if (ro.studio === i) say.push(tr("Studio"));
        if ((ro.train || []).indexOf(i) >= 0) say.push(tr("Training"));
        if ((ro.jobs || []).indexOf(i) >= 0) say.push(tr("Lab jobs"));
      }
      var u = ring.map(function (r) { return [r[0], r[1]]; });
      return ['<h5 translate="no">' + esc(gpuName(i)) + "</h5>" + grid([
        [tr("Given to"), say.join(" · ") || tr("No role")],
        [tr("Load now"), g ? pct(g[1]) : "—"],
        ["VRAM", g ? gb(g[2]) + " / " + gb(g[3]) + " GB" + (g[3] ? " · " + pct(g[2] / g[3] * 100) : "") : "—"],
        [tr("Temperature"), g && g[4] != null ? Math.round(g[4]) + " °C" : "—"],
        [tr("Power"), g && g[5] != null ? Math.round(g[5]) + " W" : "—"],
        [tr("Average and peak, ten minutes"), pct(mean(u)) + " · " + pct(peak(u))]]) +
        graphs(keys([[tr("load"), A], ["VRAM", G]])),
        draw2(function () {
          var r = S.g[i] || [];
          return [{ pts: r.map(function (x) { return [x[0], x[1]]; }), color: A, fill: true }, { pts: r.map(function (x) { return [x[0], x[3] ? x[2] / x[3] * 100 : null]; }), color: G }];
        }, 100, function () { return "100%"; })];
    }
    if (key.indexOf("disk:") === 0) {
      var id = key.slice(5), d = S.disks.filter(function (x) { return x.id === id; })[0];
      if (!d) return null;
      var rd = series(function (r) { return r[8] && r[8][id] ? r[8][id][0] : null; }), wr = series(function (r) { return r[8] && r[8][id] ? r[8][id][1] : null; });
      var cur = s && s[8] ? s[8][id] : null, roles = [];
      if (/system/.test(d.role)) roles.push(tr("the system's disk"));
      if (/studio/.test(d.role)) roles.push(tr("the Studio's disk"));
      return ['<h5 translate="no">' + esc(d.kind + " · " + d.model) + "</h5>" + grid([
        roles.length ? [tr("It holds"), roles.join(", ")] : null,
        [tr("Mounted at"), (d.mounts || []).slice(0, 3).join("  ") + ((d.mounts || []).length > 3 ? "  …" : "")],
        d.usb ? [tr("Connected"), "USB"] : null,
        [tr("Free"), d.total ? bytes(d.free) + " / " + bytes(d.total) + " · " + fmt("{0} used", pct((1 - d.free / d.total) * 100)) : "?"],
        ["⇣ " + tr("Reading now"), cur ? bytes(cur[0]) + "/s" : "—"],
        ["⇡ " + tr("Writing now"), cur ? bytes(cur[1]) + "/s" : "—"],
        [tr("Busy now"), cur ? pct(cur[2]) : "—"],
        [tr("Peak, ten minutes"), "⇣ " + bytes(peak(rd)) + "/s · ⇡ " + bytes(peak(wr)) + "/s"]]) +
        graphs(keys([["⇣ " + tr("reading"), G], ["⇡ " + tr("writing"), A]])),
        draw2(function () {
          return [{ pts: series(function (r) { return r[8] && r[8][id] ? r[8][id][0] : null; }), color: G, fill: true },
                  { pts: series(function (r) { return r[8] && r[8][id] ? r[8][id][1] : null; }), color: A, fill: true }];
        }, 0, function (m) { return bytes(m) + "/s"; })];
    }
    if (key.indexOf("job:") === 0) {
      var r = roomJobs()[+key.slice(4)];
      if (!r) return null;
      var st = jobState(r);
      return ["<h5>" + esc(jobWhat(r)) + "</h5>" + grid([
        // HERESY 2425 (Viktor 11.11.2026, a screenshot of the bar: «тренировка LoRA … Семпл … Карта GPUNaN»): a training run is named as a
        // run, not a take, and a run on several cards (the lab's "0+1+2", HERESY 1631) shows each card instead of NaN
        r.name ? [tr(String(r.key || "").indexOf("train:") === 0 ? "Run" : "Take"), title(r.name)] : null, r.label ? [tr("What"), r.label] : null,
        [tr("Progress"), st[1] + (st[0] != null ? " · " + Math.round(st[0] * 100) + "%" : "")],
        r.gpu != null ? (function () {
          var g = String(r.gpu).split("+").filter(Boolean);
          return [tr(g.length > 1 ? "Cards" : "Card"), r.gpu === "cpu" ? "CPU" : g.map(function (c) { return gpuName(+c); }).join(" · ")];
        })() : null]), null];
    }
    return null;
  }
  function paintPop() {
    var p = pop(), el = S.hover && document.querySelector('#sysBar [data-sb="' + S.hover + '"]');
    var made = el && popFor(S.hover);
    if (!made) { hidePop(true); return; }
    if (p.dataset.html !== made[0]) { p.dataset.html = made[0]; p.innerHTML = made[0]; }
    p.hidden = false;
    var b = el.getBoundingClientRect(), w = p.offsetWidth, vw = document.documentElement.clientWidth;
    p.style.left = Math.round(Math.max(8, Math.min(vw - w - 8, b.left + b.width / 2 - w / 2))) + "px";
    p.style.top = Math.round(b.bottom + 6) + "px";
    if (made[1]) made[1](p);
  }
  function showPop(key) { clearTimeout(S.hideT); S.hover = key; document.querySelectorAll("#sysBar .is-on").forEach(function (x) { x.classList.remove("is-on"); });
    var el = document.querySelector('#sysBar [data-sb="' + key + '"]'); if (el) el.classList.add("is-on"); paintPop(); }
  function hidePop(now) {
    var go = function () { S.hover = null; var p = $("sbPop"); if (p) p.hidden = true; document.querySelectorAll("#sysBar .is-on").forEach(function (x) { x.classList.remove("is-on"); }); };
    clearTimeout(S.hideT);
    if (now) go(); else S.hideT = setTimeout(go, 120);
  }

  function wire() {
    var el = bar();
    if (!el) return;
    el.addEventListener("pointerover", function (e) { var it = e.target.closest("[data-sb]"); if (it && it.dataset.sb !== S.hover) showPop(it.dataset.sb); });
    el.addEventListener("pointerout", function (e) { var it = e.target.closest("[data-sb]"); if (it && !(e.relatedTarget && it.contains(e.relatedTarget))) hidePop(false); });
    el.addEventListener("focusin", function (e) { var it = e.target.closest("[data-sb]"); if (it) showPop(it.dataset.sb); });
    el.addEventListener("focusout", function () { hidePop(false); });
    el.addEventListener("keydown", function (e) { if (e.key === "Escape") hidePop(true); });
    // HERESY 2522 (audit №2): a training run's bar is the way to its room, as its card above the log was
    var toTrain = function (e) {
      var it = e.target.closest && e.target.closest(".sb-job.is-train");
      if (!it || (e.type === "keydown" && e.key !== "Enter")) return;
      var t = document.querySelector('.topbar [data-tab="train"]'); if (t) t.click();
    };
    el.addEventListener("click", toTrain); el.addEventListener("keydown", toTrain);
    window.addEventListener("scroll", function () { if (S.hover) paintPop(); }, { passive: true });
    if (window.MutationObserver) new MutationObserver(function () { if (apply()) tick(); }).observe(document.body, { attributes: true, attributeFilter: ["data-tab"] });
    var dc = $("defaultsCard");
    if (dc) dc.addEventListener("change", function (e) { if (e.target.closest('[data-def="' + KEY + '"]')) setTimeout(function () { if (apply()) tick(); }, 0); });
    window.addEventListener("ruach-lang", function () { S.keys = ""; paint(); });
    window.addEventListener("resize", function () { if (!bar().hidden) paint(); });
    window.addEventListener("storage", function (e) { if (e.key === KEY) apply(); if (e.key === FOLD) { S.fold = e.newValue === "1"; S.fitSig = ""; if (apply()) tick(); } });
    var fb = $("sbFold");
    if (fb) fb.addEventListener("click", function () { setFold(!S.fold); });   // HERESY 2302
    document.addEventListener("visibilitychange", tick);
    apply();
    tick();
  }
  setInterval(tick, 1000);                          // asks only while the bar is shown and the page is seen; the lab samples only while asked
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire); else wire();
  window.HeresySysBar = { state: S, tick: tick, apply: apply, paint: paint, show: showPop, hide: hidePop, wanted: wanted, fold: setFold };
})();
