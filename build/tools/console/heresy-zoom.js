// HERESY 1007: a picture opened over the whole screen, to zoom and to scroll.
//
// Used by the spectrum (heresy-spectrum.js) and the staff of the score. The caller
// gives a render(width, height) that returns a fresh element of that size, so a
// raster picture is drawn again at every zoom instead of being stretched, and a
// vector one simply comes out larger.
//
//   Ctrl + wheel     zoom around the pointer        wheel, Shift + wheel   scroll
//   drag             scroll                          + − 0                  zoom in, out, fit
//   Esc or ✕         close
(function () {
  "use strict";

  var view = null, cur = null, renderTimer = 0;

  function build() {
    view = document.createElement("div");
    view.className = "hz-view";
    view.hidden = true;
    view.innerHTML =
      '<div class="hz-bar">' +
        '<span class="hz-title"></span><div class="spacer"></div>' +
        '<span class="hz-hint">Ctrl + wheel: zoom · drag or wheel: scroll · 0: fit · Esc: close</span>' +
        '<button type="button" class="btn ghost small" data-hz="out" aria-label="Zoom out">−</button>' +
        '<span class="hz-level mono">100%</span>' +
        '<button type="button" class="btn ghost small" data-hz="in" aria-label="Zoom in">+</button>' +
        '<button type="button" class="btn ghost small" data-hz="fit">Fit</button>' +
        '<button type="button" class="btn ghost small" data-hz="close" aria-label="Close">✕</button>' +
      '</div>' +
      '<div class="hz-scroll"><div class="hz-stage"></div></div>';
    document.body.appendChild(view);
    view.querySelector('[data-hz="in"]').addEventListener("click", function () { zoomAt(cur.scale * 1.25); });
    view.querySelector('[data-hz="out"]').addEventListener("click", function () { zoomAt(cur.scale / 1.25); });
    view.querySelector('[data-hz="fit"]').addEventListener("click", function () { zoomAt(1); });
    view.querySelector('[data-hz="close"]').addEventListener("click", close);

    var scroller = view.querySelector(".hz-scroll");
    scroller.addEventListener("wheel", function (event) {
      if (!event.ctrlKey) return;               // plain wheel scrolls, as everywhere
      event.preventDefault();
      var box = scroller.getBoundingClientRect();
      zoomAt(cur.scale * Math.pow(1.0015, -event.deltaY), event.clientX - box.left, event.clientY - box.top);
    }, { passive: false });

    // Drag to scroll; a press that barely moves stays a click for the picture.
    var drag = null;
    scroller.addEventListener("mousedown", function (event) {
      if (event.button !== 0) return;
      drag = { x: event.clientX, y: event.clientY, left: scroller.scrollLeft, top: scroller.scrollTop, moved: false };
      event.preventDefault();
    });
    window.addEventListener("mousemove", function (event) {
      if (!drag) return;
      var dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
      scroller.scrollLeft = drag.left - dx;
      scroller.scrollTop = drag.top - dy;
      scroller.classList.toggle("is-dragging", drag.moved);
    });
    window.addEventListener("mouseup", function (event) {
      if (!drag) return;
      var was = drag;
      drag = null;
      scroller.classList.remove("is-dragging");
      if (!was.moved && cur && cur.onClick) {
        var el = view.querySelector(".hz-stage").firstChild, box = el && el.getBoundingClientRect();
        if (box) cur.onClick(event.clientX - box.left, event.clientY - box.top, box.width, box.height);
      }
    });
    document.addEventListener("keydown", function (event) {
      if (view.hidden) return;
      if (event.key === "Escape") { close(); event.preventDefault(); }
      else if (event.key === "+" || event.key === "=") zoomAt(cur.scale * 1.25);
      else if (event.key === "-") zoomAt(cur.scale / 1.25);
      else if (event.key === "0") zoomAt(1);
    });
    window.addEventListener("resize", function () { if (!view.hidden) zoomAt(cur.scale); });
  }

  // The size at zoom 1: the picture fitted to the viewer, by width (and by height when asked).
  function fitSize() {
    var scroller = view.querySelector(".hz-scroll");
    // a viewer not laid out yet (a background tab) has no size: the window's stands in
    var w = Math.max(320, (scroller.clientWidth || window.innerWidth || 1280) - 24);
    var h = Math.max(200, (scroller.clientHeight || (window.innerHeight || 800) - 50) - 24);
    if (cur.fill) return { w: w, h: h };
    return { w: w, h: Math.round(w * cur.aspect) };
  }

  function size(scale) {
    var fit = fitSize(), dpr = window.devicePixelRatio || 1;
    var most = cur.maxPixels ? Math.min(cur.maxPixels / (fit.w * dpr), cur.maxPixels / (fit.h * dpr)) : 40;
    if (cur.maxWidth) most = Math.min(most, cur.maxWidth / fit.w);   // HERESY 1021: a width ceiling (4K for the spectrum)
    scale = Math.max(1, Math.min(scale, most, 40));
    return { scale: scale, w: Math.round(fit.w * scale), h: Math.round(fit.h * scale) };
  }

  // Zoom to a scale, keeping the point under the pointer (or the middle) where it is.
  function zoomAt(scale, px, py) {
    var scroller = view.querySelector(".hz-scroll"), stage = view.querySelector(".hz-stage");
    var old = size(cur.scale), next = size(scale);
    if (px === undefined) { px = scroller.clientWidth / 2; py = scroller.clientHeight / 2; }
    var fx = (scroller.scrollLeft + px) / Math.max(1, old.w), fy = (scroller.scrollTop + py) / Math.max(1, old.h);
    cur.scale = next.scale;
    view.querySelector(".hz-level").textContent = Math.round(next.scale * 100) + "%";
    var el = stage.firstChild;
    if (el) { el.style.width = next.w + "px"; el.style.height = next.h + "px"; }   // at once, stretched
    scroller.scrollLeft = fx * next.w - px;
    scroller.scrollTop = fy * next.h - py;
    clearTimeout(renderTimer);
    renderTimer = setTimeout(function () { draw(next); }, cur.vector ? 0 : 140);   // then drawn sharp
  }

  function draw(sz) {
    var stage = view.querySelector(".hz-stage");
    var el = cur.render(sz.w, sz.h);
    if (!el) return;
    el.style.width = sz.w + "px";
    el.style.height = sz.h + "px";
    stage.textContent = "";
    stage.appendChild(el);
  }

  // opts: { title, render(w, h) → element, aspect (height / width) or fill: true,
  //         vector: true for SVG, maxPixels: the longest canvas side allowed, onClick(x, y, w, h) }
  function open(opts) {
    if (!view) build();
    cur = { title: opts.title, render: opts.render, aspect: opts.aspect || 0.5, fill: !!opts.fill,
            vector: !!opts.vector, maxPixels: opts.maxPixels || 0, maxWidth: opts.maxWidth || 0, onClick: opts.onClick || null, scale: 1 };
    view.querySelector(".hz-title").textContent = opts.title || "";
    view.hidden = false;
    document.documentElement.classList.add("hz-open");
    var scroller = view.querySelector(".hz-scroll");
    scroller.scrollLeft = 0;
    scroller.scrollTop = 0;
    view.querySelector(".hz-level").textContent = "100%";
    draw(size(1));
  }

  function close() {
    if (!view || view.hidden) return;
    view.hidden = true;
    view.querySelector(".hz-stage").textContent = "";
    document.documentElement.classList.remove("hz-open");
    cur = null;
  }

  function isOpen() { return !!(view && !view.hidden); }

  window.HeresyZoom = { open: open, close: close, isOpen: isOpen };
})();
