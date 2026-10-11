// HERESY 1169 · 1346 (Viktor 10.10.2026: «По аутпеинтингу было бы хорошо определять точное положение (позировать) референсного
// изображения на холсте проэцируемых соотношений сторон в генерируемых картинках, скейлить референс и т.п. Ловишь?»; «И очень хочу,
// чтобы ты представил это в подобной ереси канваса аутпеинта, инпеинта именно так, как в InvokeAI»): the Artist's canvas. Each shape's
// frame (InvokeAI's bounding box) on a board; the reference laid in it, moved and scaled by hand or by numbers; the mask painted over the
// picture (InvokeAI's inpaint mask), one for every shape; the part of a frame the picture leaves bare is painted around it (outpaint), a
// frame it covers is painted from it (image to image). A place: x, y the picture's middle in the frame's share, s its width in frame widths
// (lab/artist.py _places, artist_job.placed).
(function () {
  "use strict";
  var FRAME = { "1:1": [1280, 1280], "16:9": [1920, 1080], "9:16": [1080, 1920] };
  var ORDER = ["1:1", "16:9", "9:16"];
  var MASK_MAX = 1536;                                  // the mask's long side in its own pixels (the lab scales it to the picture)
  var UNDO = 30;
  var ICONS = {
    move: '<path d="M12 2v20M2 12h20M12 2l-3 3M12 2l3 3M12 22l-3-3M12 22l3-3M2 12l3-3M2 12l3 3M22 12l-3-3M22 12l-3 3"/>',
    brush: '<path d="M14.5 4.5l5 5L9 20H4v-5z"/><path d="M12 7l5 5"/>',
    erase: '<path d="M7 20h13"/><path d="M4.5 14.5l9-9a2 2 0 0 1 2.8 0l3.2 3.2a2 2 0 0 1 0 2.8L12 19H8z"/><path d="M9 10l5 5"/>',
    hand: '<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12M11 11V4.5a1.5 1.5 0 0 1 3 0V12M14 11.5V6a1.5 1.5 0 0 1 3 0v8a6 6 0 0 1-6 6h-1a6 6 0 0 1-4.6-2.2L3 14a1.5 1.5 0 0 1 2.2-2l2.8 2.6"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
    redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>',
    view: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'
  };
  function icon(n) { return '<svg viewBox="0 0 24 24" aria-hidden="true" class="cv-ico">' + ICONS[n] + "</svg>"; }
  function tr(s) { return window.RuachI18n ? window.RuachI18n.t(s) : s; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function round4(v) { return Math.round(v * 10000) / 10000; }

  // a place for a picture of rw × rh: the whole of it in the frame's middle (contain), or the frame covered (cover)
  function fitPlace(shape, rw, rh, how) {
    var f = FRAME[shape], k = how === "cover" ? Math.max(f[0] / rw, f[1] / rh) : Math.min(f[0] / rw, f[1] / rh);
    return { x: 0.5, y: 0.5, s: round4(rw * k / f[0]) };
  }
  function boxOf(shape, p, rw, rh) {                    // the picture's box in the frame's pixels
    var f = FRAME[shape], w = p.s * f[0], h = w * rh / rw;
    return { l: p.x * f[0] - w / 2, t: p.y * f[1] - h / 2, w: w, h: h };
  }
  function covers(shape, p, rw, rh) {
    var f = FRAME[shape], b = boxOf(shape, p, rw, rh);
    return b.l <= 0.5 && b.t <= 0.5 && b.l + b.w >= f[0] - 0.5 && b.t + b.h >= f[1] - 0.5;
  }
  function places(rw, rh, fit, have) {                  // every shape's place: kept ones as they are, the rest as the form would paint them
    var out = {};
    ORDER.forEach(function (s) { out[s] = have && have[s] ? { x: have[s].x, y: have[s].y, s: have[s].s } : fitPlace(s, rw, rh, fit ? "contain" : "cover"); });
    return out;
  }
  function modeOf(shape, p, rw, rh, masked) {           // what the lab will do with this shape
    return covers(shape, p, rw, rh) ? (masked ? "repainted by the mask" : "painted from the picture") : (masked ? "painted around, and by the mask" : "painted around the picture");
  }

  // opts: { pic (an Image, loaded), mask ({data, view} or null), place ({shape: {x, y, s}} or null), fit (the form's «Paint around it»),
  //         shapes (the ones picked in the form), shape (the one to begin with), onDone({ place, mask }) — mask undefined when untouched }
  function open(opts) {
    var pic = opts.pic, rw = pic.naturalWidth || pic.width, rh = pic.naturalHeight || pic.height;
    var picked = (opts.shapes && opts.shapes.length ? opts.shapes : ["1:1"]).filter(function (s) { return FRAME[s]; });
    var st = { shape: picked.indexOf(opts.shape) >= 0 ? opts.shape : picked[0], place: places(rw, rh, opts.fit, opts.place), tool: "move",
               z: 1, ox: 0, oy: 0, refOn: true, maskOn: true, refAlpha: 1, brush: Math.max(4, Math.min(400, parseInt(recall("yue2.cvBrush"), 10) || 80)),
               drag: null, space: false, at: null, maskTouched: false };
    // the mask: red strokes over a clear field, the picture's own proportions (white where red when the canvas is done)
    var k = Math.min(1, MASK_MAX / Math.max(rw, rh)), mw = Math.max(1, Math.round(rw * k)), mh = Math.max(1, Math.round(rh * k));
    var mask = document.createElement("canvas");
    mask.width = mw; mask.height = mh;
    var mg = mask.getContext("2d");
    var undo = [], redo = [];

    var back = document.createElement("div");
    back.className = "cv";
    back.setAttribute("role", "dialog");
    back.setAttribute("aria-label", tr("The canvas: the picture in each shape's frame"));
    back.innerHTML =
      '<div class="cv-top"><b class="cv-title">' + esc(tr("Canvas")) + "</b>" +
        '<span class="cv-tabs" role="tablist">' + ORDER.map(function (s) {
          return '<button type="button" class="cv-tab" role="tab" data-shape="' + s + '"' + (picked.indexOf(s) < 0 ? ' data-tip="' + esc(tr("Not picked in the form: placed for when it is")) + '"' : "") +
            '><b translate="no">' + s + '</b><em class="cv-tab-mode"></em></button>'; }).join("") + "</span>" +
        '<span class="cv-group"><button type="button" class="btn ghost small" data-cv="contain" data-tip="' + esc(tr("The whole picture in the frame's middle: the bare edges are painted around it")) + '">' + esc(tr("Fit")) + "</button>" +
        '<button type="button" class="btn ghost small" data-cv="cover" data-tip="' + esc(tr("The frame covered by the picture: painted from it, as image to image")) + '">' + esc(tr("Fill")) + "</button>" +
        '<button type="button" class="btn ghost small" data-cv="centre" data-tip="' + esc(tr("The picture in the frame's middle, its size kept")) + '">' + esc(tr("Centre")) + "</button>" +
        '<button type="button" class="btn ghost small" data-cv="same" data-tip="' + esc(tr("This place in the other shapes too: the picture as large in pixels, its middle where it is here")) + '">' + esc(tr("Same in all")) + "</button></span>" +
        '<label class="cv-brush" hidden><span>' + esc(tr("Brush")) + '</span><input type="range" min="4" max="400" step="2" data-cv-size aria-label="' + esc(tr("The brush's size ([ and ])")) + '" /><output></output></label>' +
        '<span class="spacer"></span>' +
        '<button type="button" class="pb-btn" data-cv="undo" aria-label="' + esc(tr("Undo (Ctrl+Z)")) + '" data-tip="' + esc(tr("Undo (Ctrl+Z)")) + '">' + icon("undo") + "</button>" +
        '<button type="button" class="pb-btn" data-cv="redo" aria-label="' + esc(tr("Redo (Ctrl+Shift+Z)")) + '" data-tip="' + esc(tr("Redo (Ctrl+Shift+Z)")) + '">' + icon("redo") + "</button>" +
        '<button type="button" class="pb-btn" data-cv="view" aria-label="' + esc(tr("The frame and the picture in sight (F)")) + '" data-tip="' + esc(tr("The frame and the picture in sight (F)")) + '">' + icon("view") + "</button>" +
        '<button type="button" class="btn primary small" data-cv="done">' + esc(tr("Done")) + "</button></div>" +
      '<div class="cv-body"><div class="cv-tools" role="toolbar" aria-label="' + esc(tr("Tools")) + '">' +
        [["move", "Move and scale the picture: drag it, or a corner (V); arrows nudge it"], ["brush", "Paint the mask: what it covers is repainted (B)"],
         ["erase", "Erase the mask (E)"], ["hand", "Move the board (H, or hold Space)"]].map(function (t) {
          return '<button type="button" class="cv-tool" data-tool="' + t[0] + '" aria-label="' + esc(tr(t[1])) + '" data-tip="' + esc(tr(t[1])) + '">' + icon(t[0]) + "</button>"; }).join("") + "</div>" +
        '<div class="cv-board"><canvas class="cv-canvas"></canvas></div>' +
        '<aside class="cv-side"><div class="cv-h">' + esc(tr("Layers")) + "</div>" +
          '<div class="cv-layer cv-layer-mask"><button type="button" class="pb-btn cv-eye is-on" data-cv="mask-eye" aria-label="' + esc(tr("Show the mask")) + '">' + icon("eye") + "</button>" +
            '<span class="cv-swatch"></span><b>' + esc(tr("Inpaint mask")) + '</b><span class="spacer"></span>' +
            '<button type="button" class="btn ghost small" data-cv="invert" data-tip="' + esc(tr("What is painted stays, the rest of the picture is repainted")) + '">' + esc(tr("Invert")) + "</button>" +
            '<button type="button" class="btn ghost small" data-cv="clear">' + esc(tr("Clear")) + "</button></div>" +
          '<div class="cv-layer cv-layer-ref"><button type="button" class="pb-btn cv-eye is-on" data-cv="ref-eye" aria-label="' + esc(tr("Show the picture")) + '">' + icon("eye") + "</button>" +
            '<img class="cv-thumb" alt="" /><b>' + esc(tr("Reference")) + '</b><span class="spacer"></span>' +
            '<input type="range" min="0.2" max="1" step="0.05" value="1" data-cv-alpha aria-label="' + esc(tr("The picture's opacity on the board")) + '" data-tip="' + esc(tr("The picture's opacity on the board (only here: the painting takes it whole)")) + '" /></div>' +
          '<div class="cv-h">' + esc(tr("Its place in this frame")) + "</div>" +
          '<div class="cv-nums"><label><span>' + esc(tr("Width")) + '</span><input type="number" data-num="s" step="1" min="5" max="600" /><em>%</em></label>' +
            '<label><span>X</span><input type="number" data-num="x" step="0.5" min="-100" max="200" /><em>%</em></label>' +
            '<label><span>Y</span><input type="number" data-num="y" step="0.5" min="-100" max="200" /><em>%</em></label></div>' +
          '<p class="cv-say"></p><div class="cv-h">' + esc(tr("How it is painted")) + '</div><p class="cv-mode"></p>' +
          '<p class="cv-keys">' + esc(tr("V move · B brush · E eraser · H or Space the board · [ ] the brush · wheel zoom · Alt+wheel the picture's size · F in sight · 1 2 3 the shapes · Ctrl+Z")) + "</p></aside></div>" +
      '<div class="cv-foot"><span class="cv-frame mono"></span><span class="cv-zoom mono"></span><span class="cv-at mono"></span></div>';
    document.body.appendChild(back);
    var cv = back.querySelector(".cv-canvas"), board = back.querySelector(".cv-board"), g = cv.getContext("2d");
    back.querySelector(".cv-thumb").src = pic.src;
    var size = back.querySelector("[data-cv-size]");
    size.value = String(st.brush);

    // the mask kept from the form (red over the picture), its own proportions
    if (opts.mask) {
      var was = new Image();
      was.onload = function () { mg.drawImage(was, 0, 0, mw, mh); mg.globalCompositeOperation = "source-in"; mg.fillStyle = "#e02828"; mg.fillRect(0, 0, mw, mh); mg.globalCompositeOperation = "source-over"; draw(); paintSide(); };
      was.src = opts.mask.view || opts.mask.data;
    }
    function hasMask() {
      var d = mg.getImageData(0, 0, mw, mh).data;
      for (var i = 3; i < d.length; i += 4 * 7) if (d[i] > 0) return true;
      return false;
    }
    var maskSeen = !!opts.mask;                         // kept up to date by the strokes, so the board need not read the mask each time

    // ---- the view: frame pixels to the board's
    function fitView() {
      var f = FRAME[st.shape], b = boxOf(st.shape, st.place[st.shape], rw, rh);
      var l = Math.min(0, b.l), t = Math.min(0, b.t), r = Math.max(f[0], b.l + b.w), bt = Math.max(f[1], b.t + b.h);
      var W = cv.clientWidth, H = cv.clientHeight, m = 56;
      st.z = Math.max(0.02, Math.min((W - 2 * m) / (r - l), (H - 2 * m) / (bt - t)));
      st.ox = (W - (r - l) * st.z) / 2 - l * st.z;
      st.oy = (H - (bt - t) * st.z) / 2 - t * st.z;
      draw();
    }
    function toFrame(e) { var r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left - st.ox) / st.z, y: (e.clientY - r.top - st.oy) / st.z }; }
    function size2() {
      var dpr = window.devicePixelRatio || 1, W = board.clientWidth, H = board.clientHeight;
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + "px"; cv.style.height = H + "px"; return true; }
      return false;
    }

    // ---- drawing the board
    var tint = document.createElement("canvas");
    function draw() {
      size2();
      var dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight, cs = getComputedStyle(back);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      g.fillStyle = cs.getPropertyValue("--cv-bg").trim() || "#141414";
      g.fillRect(0, 0, W, H);
      g.fillStyle = cs.getPropertyValue("--cv-dot").trim() || "rgba(255,255,255,.07)";   // InvokeAI's dotted board
      var step = 22, dx = ((st.ox % step) + step) % step, dy = ((st.oy % step) + step) % step;
      for (var x = dx; x < W; x += step) for (var y = dy; y < H; y += step) g.fillRect(x, y, 1, 1);
      var f = FRAME[st.shape], fx = st.ox, fy = st.oy, fw = f[0] * st.z, fh = f[1] * st.z;
      g.save();                                           // the frame's bare part as a checkerboard: what is painted there is new
      g.beginPath(); g.rect(fx, fy, fw, fh); g.clip();
      var c = 14;
      for (var cx = 0; cx * c < fw; cx++) for (var cy = 0; cy * c < fh; cy++) { g.fillStyle = (cx + cy) % 2 ? "#3a3a3a" : "#2c2c2c"; g.fillRect(fx + cx * c, fy + cy * c, c, c); }
      g.restore();
      var p = st.place[st.shape], b = boxOf(st.shape, p, rw, rh), bx = st.ox + b.l * st.z, by = st.oy + b.t * st.z, bw = b.w * st.z, bh = b.h * st.z;
      if (st.refOn) { g.globalAlpha = st.refAlpha; g.imageSmoothingQuality = "high"; g.drawImage(pic, bx, by, bw, bh); g.globalAlpha = 1; }
      if (st.maskOn && maskSeen) { g.globalAlpha = 0.55; g.drawImage(mask, bx, by, bw, bh); g.globalAlpha = 1; }
      g.fillStyle = "rgba(0, 0, 0, .58)";                 // outside the frame dimmed, as InvokeAI dims outside its box
      g.beginPath(); g.rect(0, 0, W, H); g.rect(fx, fy, fw, fh); g.fill("evenodd");
      g.strokeStyle = cs.getPropertyValue("--cv-frame").trim() || "#e8a33d"; g.lineWidth = 2;
      g.strokeRect(Math.round(fx) - 1, Math.round(fy) - 1, Math.round(fw) + 2, Math.round(fh) + 2);
      g.font = "600 11px " + (cs.getPropertyValue("--sans").trim() || "sans-serif");
      g.fillStyle = g.strokeStyle; g.textBaseline = "bottom";
      g.fillText(st.shape + " · " + f[0] + "×" + f[1], fx, fy - 6);
      if (st.tool === "move" && st.refOn) {               // the picture's outline and its corners
        g.setLineDash([5, 4]); g.strokeStyle = "rgba(255, 255, 255, .85)"; g.lineWidth = 1;
        g.strokeRect(bx + 0.5, by + 0.5, bw, bh); g.setLineDash([]);
        [[bx, by], [bx + bw, by], [bx, by + bh], [bx + bw, by + bh]].forEach(function (q) {
          g.fillStyle = "#fff"; g.fillRect(q[0] - 5, q[1] - 5, 10, 10); g.strokeStyle = "#111"; g.strokeRect(q[0] - 5 + 0.5, q[1] - 5 + 0.5, 9, 9);
        });
      }
      if ((st.tool === "brush" || st.tool === "erase") && st.at && !st.space) {   // the brush's ring where it paints
        g.beginPath(); g.arc(st.at.sx, st.at.sy, st.brush / 2, 0, Math.PI * 2);
        g.strokeStyle = "rgba(255, 255, 255, .9)"; g.lineWidth = 1.5; g.stroke();
        g.beginPath(); g.arc(st.at.sx, st.at.sy, st.brush / 2 + 1.5, 0, Math.PI * 2); g.strokeStyle = "rgba(0, 0, 0, .6)"; g.lineWidth = 1; g.stroke();
      }
      back.querySelector(".cv-zoom").textContent = Math.round(st.z * 100) + "%";
    }

    // ---- the side, the tabs, the numbers
    function paintSide() {
      var p = st.place[st.shape], f = FRAME[st.shape], b = boxOf(st.shape, p, rw, rh);
      Array.prototype.forEach.call(back.querySelectorAll(".cv-tab"), function (t) {
        var s = t.dataset.shape, cov = covers(s, st.place[s], rw, rh);
        t.classList.toggle("is-on", s === st.shape);
        t.classList.toggle("is-off", picked.indexOf(s) < 0);
        t.setAttribute("aria-selected", s === st.shape ? "true" : "false");
        t.querySelector(".cv-tab-mode").textContent = tr(cov ? "from it" : "around");
      });
      Array.prototype.forEach.call(back.querySelectorAll(".cv-tool"), function (t) { t.classList.toggle("is-on", t.dataset.tool === st.tool); t.setAttribute("aria-pressed", t.dataset.tool === st.tool ? "true" : "false"); });
      back.querySelector(".cv-brush").hidden = !(st.tool === "brush" || st.tool === "erase");
      back.querySelector(".cv-brush output").textContent = st.brush + " px";
      var nums = { s: p.s * 100, x: p.x * 100, y: p.y * 100 };
      Array.prototype.forEach.call(back.querySelectorAll("[data-num]"), function (i) { if (document.activeElement !== i) i.value = String(Math.round(nums[i.dataset.num] * 10) / 10); });
      back.querySelector(".cv-say").textContent = tr("The picture " + Math.round(b.w) + "×" + Math.round(b.h) + " px in the frame's " + f[0] + "×" + f[1] + ", ×" + (b.w / rw).toFixed(2) + " its own size");
      back.querySelector(".cv-mode").textContent = tr(modeOf(st.shape, p, rw, rh, maskSeen));
      back.querySelector(".cv-frame").textContent = st.shape + " · " + f[0] + "×" + f[1];
      back.querySelector('[data-cv="mask-eye"]').classList.toggle("is-on", st.maskOn);
      back.querySelector('[data-cv="ref-eye"]').classList.toggle("is-on", st.refOn);
      back.querySelector('[data-cv="undo"]').disabled = !undo.length;
      back.querySelector('[data-cv="redo"]').disabled = !redo.length;
    }
    function setShape(s) { if (!FRAME[s]) return; st.shape = s; paintSide(); fitView(); }
    function setTool(t) { st.tool = t; board.dataset.tool = t; paintSide(); draw(); }

    // ---- undo and redo: the places, and the mask when a stroke changed it
    function snap(withMask) {
      undo.push({ place: JSON.stringify(st.place), mask: withMask ? mg.getImageData(0, 0, mw, mh) : null, seen: maskSeen });
      if (undo.length > UNDO) undo.shift();
      redo.length = 0;
    }
    function step(from, to) {
      var s = from.pop();
      if (!s) return;
      to.push({ place: JSON.stringify(st.place), mask: s.mask ? mg.getImageData(0, 0, mw, mh) : null, seen: maskSeen });
      st.place = JSON.parse(s.place);
      if (s.mask) { mg.putImageData(s.mask, 0, 0); maskSeen = s.seen; st.maskTouched = true; }
      paintSide(); draw();
    }
    function setPlace(p, quiet) {
      if (!quiet) snap(false);
      st.place[st.shape] = { x: round4(clamp(p.x, -1, 2)), y: round4(clamp(p.y, -1, 2)), s: round4(clamp(p.s, 0.05, 6)) };
      paintSide(); draw();
    }

    // ---- the mask's strokes, in the picture's own proportions
    function maskAt(fp) {                                 // a frame point → the mask's pixel
      var b = boxOf(st.shape, st.place[st.shape], rw, rh);
      return { x: (fp.x - b.l) / b.w * mw, y: (fp.y - b.t) / b.h * mh };
    }
    function dab(fp, last) {
      var b = boxOf(st.shape, st.place[st.shape], rw, rh), r = st.brush / 2 / st.z * mw / b.w, q = maskAt(fp);
      mg.globalCompositeOperation = st.tool === "erase" ? "destination-out" : "source-over";
      mg.strokeStyle = mg.fillStyle = "#e02828"; mg.lineCap = "round"; mg.lineJoin = "round"; mg.lineWidth = r * 2;
      mg.beginPath();
      if (last) { var p0 = maskAt(last); mg.moveTo(p0.x, p0.y); mg.lineTo(q.x, q.y); mg.stroke(); } else { mg.arc(q.x, q.y, r, 0, Math.PI * 2); mg.fill(); }
      mg.globalCompositeOperation = "source-over";
      if (st.tool === "brush") maskSeen = true;
      st.maskTouched = true;
    }

    // ---- the pointer
    function hitCorner(e) {
      var b = boxOf(st.shape, st.place[st.shape], rw, rh), r = cv.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
      var cs = [[0, 0], [1, 0], [0, 1], [1, 1]];
      for (var i = 0; i < 4; i++) {
        var qx = st.ox + (b.l + cs[i][0] * b.w) * st.z, qy = st.oy + (b.t + cs[i][1] * b.h) * st.z;
        if (Math.abs(sx - qx) <= 9 && Math.abs(sy - qy) <= 9) return cs[i];
      }
      return null;
    }
    function inside(fp) { var b = boxOf(st.shape, st.place[st.shape], rw, rh); return fp.x >= b.l && fp.x <= b.l + b.w && fp.y >= b.t && fp.y <= b.t + b.h; }
    cv.addEventListener("pointerdown", function (e) {
      if (e.button !== 0 && e.button !== 1) return;
      e.preventDefault();
      cv.setPointerCapture(e.pointerId);
      var fp = toFrame(e), tool = e.button === 1 || st.space ? "hand" : st.tool;
      if (tool === "hand") { st.drag = { kind: "pan", x: e.clientX, y: e.clientY, ox: st.ox, oy: st.oy }; return; }
      if (tool === "brush" || tool === "erase") { snap(true); st.drag = { kind: "paint", last: fp }; dab(fp, null); draw(); return; }
      var c = hitCorner(e), b = boxOf(st.shape, st.place[st.shape], rw, rh);
      if (c) {                                            // a corner: scaled, the opposite corner kept where it is
        snap(false);
        st.drag = { kind: "scale", ax: b.l + (1 - c[0]) * b.w, ay: b.t + (1 - c[1]) * b.h, cx: c[0] ? 1 : -1, cy: c[1] ? 1 : -1 };
      } else if (inside(fp)) {
        snap(false);
        st.drag = { kind: "move", fx: fp.x, fy: fp.y, p: { x: st.place[st.shape].x, y: st.place[st.shape].y, s: st.place[st.shape].s } };
      } else st.drag = { kind: "pan", x: e.clientX, y: e.clientY, ox: st.ox, oy: st.oy };
    });
    cv.addEventListener("pointermove", function (e) {
      var r = cv.getBoundingClientRect(), fp = toFrame(e), f = FRAME[st.shape];
      st.at = { sx: e.clientX - r.left, sy: e.clientY - r.top };
      back.querySelector(".cv-at").textContent = Math.round(fp.x) + ", " + Math.round(fp.y);
      var d = st.drag;
      if (!d) {
        if (st.tool === "move" && !st.space) cv.style.cursor = hitCorner(e) ? "nwse-resize" : inside(fp) ? "move" : "grab";
        else cv.style.cursor = st.space || st.tool === "hand" ? "grab" : "none";
        if (st.tool === "brush" || st.tool === "erase") draw();
        return;
      }
      if (d.kind === "pan") { st.ox = d.ox + e.clientX - d.x; st.oy = d.oy + e.clientY - d.y; cv.style.cursor = "grabbing"; draw(); }
      else if (d.kind === "paint") { dab(fp, d.last); d.last = fp; draw(); }
      else if (d.kind === "move") {
        setPlace({ x: d.p.x + (fp.x - d.fx) / f[0], y: d.p.y + (fp.y - d.fy) / f[1], s: d.p.s }, true);
      } else if (d.kind === "scale") {
        var w = Math.max(Math.abs(fp.x - d.ax), Math.abs(fp.y - d.ay) * rw / rh, 8), h = w * rh / rw;
        setPlace({ x: (d.ax + d.cx * w / 2) / f[0], y: (d.ay + d.cy * h / 2) / f[1], s: w / f[0] }, true);
      }
    });
    function up() { if (st.drag && st.drag.kind === "paint") paintSide(); st.drag = null; }
    cv.addEventListener("pointerup", up);
    cv.addEventListener("pointercancel", up);
    cv.addEventListener("pointerleave", function () { st.at = null; draw(); });
    cv.addEventListener("wheel", function (e) {
      e.preventDefault();
      var r = cv.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top, k = Math.pow(1.0015, -e.deltaY);
      if (e.altKey) {                                     // the picture's size, the point under the pointer kept where it is
        var fp = toFrame(e), p = st.place[st.shape], f = FRAME[st.shape], b = boxOf(st.shape, p, rw, rh), s2 = clamp(p.s * k, 0.05, 6), q = s2 / p.s;
        if (!st.wheelSnap) { snap(false); st.wheelSnap = setTimeout(function () { st.wheelSnap = null; }, 600); }
        var nl = fp.x - (fp.x - b.l) * q, nt = fp.y - (fp.y - b.t) * q;
        setPlace({ x: (nl + b.w * q / 2) / f[0], y: (nt + b.h * q / 2) / f[1], s: s2 }, true);
        return;
      }
      var z2 = clamp(st.z * k, 0.02, 8);
      st.ox = sx - (sx - st.ox) * z2 / st.z; st.oy = sy - (sy - st.oy) * z2 / st.z; st.z = z2;
      draw();
    }, { passive: false });

    // ---- the buttons, the numbers, the keys
    back.addEventListener("click", function (e) {
      var t = e.target.closest("[data-shape]"), tool = e.target.closest("[data-tool]"), b = e.target.closest("[data-cv]");
      if (t) return setShape(t.dataset.shape);
      if (tool) return setTool(tool.dataset.tool);
      if (!b) return;
      var k = b.dataset.cv, p = st.place[st.shape];
      if (k === "contain" || k === "cover") setPlace(fitPlace(st.shape, rw, rh, k));
      else if (k === "centre") setPlace({ x: 0.5, y: 0.5, s: p.s });
      else if (k === "same") {                            // the picture as large in pixels in every frame, its middle in the same share
        snap(false);
        var px = p.s * FRAME[st.shape][0];
        ORDER.forEach(function (s) { if (s !== st.shape) st.place[s] = { x: p.x, y: p.y, s: round4(clamp(px / FRAME[s][0], 0.05, 6)) }; });
        paintSide(); draw();
      } else if (k === "undo") step(undo, redo);
      else if (k === "redo") step(redo, undo);
      else if (k === "view") fitView();
      else if (k === "mask-eye") { st.maskOn = !st.maskOn; paintSide(); draw(); }
      else if (k === "ref-eye") { st.refOn = !st.refOn; paintSide(); draw(); }
      else if (k === "clear") { snap(true); mg.clearRect(0, 0, mw, mh); maskSeen = false; st.maskTouched = true; paintSide(); draw(); }
      else if (k === "invert") {
        snap(true);
        var tmp = document.createElement("canvas"); tmp.width = mw; tmp.height = mh;
        var tg = tmp.getContext("2d"); tg.fillStyle = "#e02828"; tg.fillRect(0, 0, mw, mh); tg.globalCompositeOperation = "destination-out"; tg.drawImage(mask, 0, 0);
        mg.clearRect(0, 0, mw, mh); mg.drawImage(tmp, 0, 0); maskSeen = hasMask(); st.maskTouched = true; paintSide(); draw();
      } else if (k === "done") done();
    });
    back.querySelector("[data-cv-alpha]").addEventListener("input", function () { st.refAlpha = +this.value; draw(); });
    size.addEventListener("input", function () { st.brush = +size.value; keep("yue2.cvBrush", size.value); paintSide(); draw(); });
    Array.prototype.forEach.call(back.querySelectorAll("[data-num]"), function (i) {
      i.addEventListener("change", function () {
        var p = st.place[st.shape], v = +i.value / 100;
        if (!isFinite(v)) return paintSide();
        var q = { x: p.x, y: p.y, s: p.s };
        if (i.dataset.num === "s") {                       // the width asked, the middle kept
          q.s = v;
        } else q[i.dataset.num] = v;
        setPlace(q);
      });
    });
    function key(e) {
      if (e.target.closest && e.target.closest(".cv-nums input")) { if (e.key === "Escape") e.target.blur(); return; }
      var k = e.key, p = st.place[st.shape], f = FRAME[st.shape];
      if (k === " ") { if (!st.space) { st.space = true; cv.style.cursor = "grab"; draw(); } e.preventDefault(); return; }
      if ((e.ctrlKey || e.metaKey) && (k === "z" || k === "Z")) { e.preventDefault(); step(e.shiftKey ? redo : undo, e.shiftKey ? undo : redo); return; }
      if ((e.ctrlKey || e.metaKey) && (k === "y" || k === "Y")) { e.preventDefault(); step(redo, undo); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (k === "Escape" || k === "Enter") { e.preventDefault(); e.stopPropagation(); done(); return; }
      var nudge = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k];
      if (nudge) { e.preventDefault(); var n = e.shiftKey ? 10 : 1; setPlace({ x: p.x + nudge[0] * n / f[0], y: p.y + nudge[1] * n / f[1], s: p.s }); return; }
      var tools = { v: "move", V: "move", b: "brush", B: "brush", e: "erase", E: "erase", h: "hand", H: "hand" };
      if (tools[k]) { e.preventDefault(); setTool(tools[k]); return; }
      if (k === "f" || k === "F") { e.preventDefault(); fitView(); return; }
      if (k === "1" || k === "2" || k === "3") { e.preventDefault(); setShape(ORDER[+k - 1]); return; }
      if (k === "[" || k === "]") { e.preventDefault(); st.brush = clamp(st.brush + (k === "]" ? 10 : -10), 4, 400); size.value = String(st.brush); keep("yue2.cvBrush", size.value); paintSide(); draw(); }
      e.stopPropagation();
    }
    function keyUp(e) { if (e.key === " ") { st.space = false; draw(); } }
    document.addEventListener("keydown", key, true);
    document.addEventListener("keyup", keyUp, true);
    var ro = window.ResizeObserver ? new ResizeObserver(function () { if (size2()) fitView(); }) : null;
    if (ro) ro.observe(board);

    // ---- done: the places, and the mask as the form keeps it (white repaints, black stays, the picture's own size)
    function done() {
      document.removeEventListener("keydown", key, true);
      document.removeEventListener("keyup", keyUp, true);
      if (ro) ro.disconnect();
      var out = { place: st.place };
      if (st.maskTouched) {
        if (!hasMask()) out.mask = null;
        else {
          var white = document.createElement("canvas"); white.width = mw; white.height = mh;
          var wg = white.getContext("2d"); wg.drawImage(mask, 0, 0); wg.globalCompositeOperation = "source-in"; wg.fillStyle = "#fff"; wg.fillRect(0, 0, mw, mh);
          var full = document.createElement("canvas"); full.width = rw; full.height = rh;
          var fg = full.getContext("2d"); fg.fillStyle = "#000"; fg.fillRect(0, 0, rw, rh); fg.drawImage(white, 0, 0, rw, rh);
          out.mask = { data: full.toDataURL("image/png"), view: white.toDataURL("image/png") };
        }
      }
      back.remove();
      if (opts.onDone) opts.onDone(out);
    }
    setTool("move");
    requestAnimationFrame(function () { size2(); fitView(); paintSide(); });
    return { close: done, state: st, el: back };
  }
  function recall(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function keep(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* private window */ } }
  window.HeresyCanvas = { open: open, covers: covers, fitPlace: fitPlace, places: places, FRAME: FRAME };
})();
