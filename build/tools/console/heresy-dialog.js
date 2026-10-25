// HERESY 1057 (Viktor): the studio's own dialogs instead of the browser's confirm() and prompt().
// HeresyDialog.confirm(text, {ok, cancel, alt, danger, must}) -> Promise<boolean|"alt">; alt: a third button between the two
// (HERESY 1169), its answer "alt"; must: one of the buttons and nothing else
// answers (Esc and a click beside the box do not), for a choice the page cannot make for you (HERESY 1166)
// HeresyDialog.prompt(text, value, {ok, placeholder, max}) -> Promise<string|null>
// HeresyDialog.choose(text, items, {cancel, more, filter}) -> Promise<value|null> (HERESY 1167): a list to pick from, one
// click picks; items [{value, label, depth, current, note}]; more [{label, value}]: buttons under the list; a filter
// field above the list when it is long
// The first paragraph of the text is the title, the rest the explanation. Enter answers yes (or
// gives the field), Esc answers no; a click beside the box is no as well. One dialog at a time.
(function () {
  "use strict";

  var chain = Promise.resolve();
  // HERESY 1729 (Viktor 22.10.2026: «вставлять его же волну и тегировать по волне донора и грядущей»): opts.wave {peaks (or their promise), seconds,
  // marks [{a, b, kind, label}], forItem(value), forValues(values)}: the take's own wave over the dialog, its stretches marked by kind
  var WAVE_KINDS = { donor: ["--amber", "#e8a33d"], place: ["--patina", "#6fb3a8"], cut: ["--bad", "#ee7a68"], keep: ["--good", "#86c07d"] };
  function waveHtml(opts) { return opts && opts.wave ? '<canvas class="hd-wave" aria-hidden="true"></canvas>' : ""; }
  function waveDraw(back, opts, marks) {
    var w = opts && opts.wave, cv = back.querySelector(".hd-wave");
    if (!w || !cv) return;
    cv._marks = marks || w.marks || [];
    Promise.resolve(w.peaks).then(function (peaks) {
      var dpr = window.devicePixelRatio || 1, W = Math.max(1, Math.round(cv.clientWidth * dpr)), H = Math.max(1, Math.round(cv.clientHeight * dpr));
      cv.width = W; cv.height = H;
      var g = cv.getContext("2d"), cs = getComputedStyle(document.documentElement), sec = +w.seconds || 1;
      var col = function (k) { var v = WAVE_KINDS[k] || WAVE_KINDS.donor; return (cs.getPropertyValue(v[0]) || "").trim() || v[1]; };
      g.clearRect(0, 0, W, H);
      (cv._marks || []).forEach(function (m) {
        var x0 = Math.max(0, Math.min(W, m.a / sec * W)), x1 = Math.max(x0 + 2 * dpr, Math.min(W, m.b / sec * W));
        g.globalAlpha = 0.2; g.fillStyle = col(m.kind); g.fillRect(x0, 0, x1 - x0, H);
        g.globalAlpha = 1; g.fillRect(x0, 0, x1 - x0, 2 * dpr);
      });
      var n = peaks && peaks.length ? peaks.length : 0, ink = (cs.getPropertyValue("--muted") || "").trim() || "#8a8a8a";
      if (n) {
        g.globalAlpha = 0.75; g.fillStyle = ink;
        var bw = W / n, mid = H / 2 + 4 * dpr, amp = (H - 16 * dpr) / 2;
        for (var i = 0; i < n; i++) { var v = Math.min(1, +peaks[i] || 0) * amp; g.fillRect(i * bw, mid - v, Math.max(1, bw * 0.7), Math.max(1, v * 2)); }
      }
      g.globalAlpha = 1; g.font = Math.round(10.5 * dpr) + "px " + ((cs.getPropertyValue("--sans") || "").trim() || "sans-serif"); g.textBaseline = "top";
      (cv._marks || []).forEach(function (m) {
        if (!m.label) return;
        var x0 = Math.max(0, Math.min(W - 4 * dpr, m.a / sec * W));
        g.fillStyle = col(m.kind); g.fillText(m.label, x0 + 3 * dpr, 4 * dpr);
      });
    }, function () { /* no wave: the dialog as it was */ });
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  function show(kind, text, value, opts) {
    opts = opts || {};
    var parts = String(text || "").split(/\n\s*\n/), title = parts.shift(), body = parts.join("\n\n");
    return new Promise(function (resolve) {
      var back = document.createElement("div"), before = document.activeElement;
      back.className = "hd-back";
      back.innerHTML = '<div class="hd-box" role="dialog" aria-modal="true" aria-label="' + esc(title) + '">' +
        '<div class="hd-title">' + esc(title) + "</div>" + (body ? '<div class="hd-body">' + esc(body) + "</div>" : "") + waveHtml(opts) +
        (kind === "prompt" && opts.area ? '<textarea class="hd-input hd-area" rows="' + (opts.rows || 8) + '" maxlength="' + (opts.max || 4000) + '" placeholder="' + esc(opts.placeholder || "") + '"></textarea>'   // HERESY 1428: lines, Ctrl+Enter keeps
          : kind === "prompt" ? '<input type="text" class="hd-input" maxlength="' + (opts.max || 200) + '" placeholder="' + esc(opts.placeholder || "") + '" />' : "") +
        '<div class="hd-acts">' + (kind === "alert" ? "" : '<button type="button" class="btn ghost small hd-no">' + esc(opts.cancel || "Cancel") + "</button>") +
        (opts.alt && kind === "confirm" ? '<button type="button" class="btn ghost small hd-alt">' + esc(opts.alt) + "</button>" : "") +
        '<button type="button" class="btn small ' + (opts.danger ? "danger-fill" : "primary") + ' hd-yes">' + esc(opts.ok || (kind === "prompt" ? "OK" : opts.danger ? "Delete" : "OK")) + "</button></div></div>";
      document.body.appendChild(back);
      var input = back.querySelector(".hd-input");
      if (input) { input.value = value == null ? "" : String(value); }
      function done(yes) {
        document.removeEventListener("keydown", key, true);
        back.classList.add("is-leaving");
        setTimeout(function () { back.remove(); }, 120);
        if (before && before.focus) { try { before.focus({ preventScroll: true }); } catch (e) { /* gone */ } }
        resolve(kind === "prompt" ? (yes ? input.value : null) : yes === "alt" ? "alt" : !!yes);
      }
      // HERESY 1169 (Viktor: «По кнопкам в F5 диалоге - добавь LEFT/RIGHT клавиатурными передвижение по кнопкам»): ← and → go along
      // the buttons; Enter presses the one in focus (with arrows it may be another than Yes), else Yes as before
      function key(e) {
        var buttons = Array.prototype.slice.call(back.querySelectorAll(".hd-acts button")), at = buttons.indexOf(document.activeElement);
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); if (!opts.must) done(false); }
        else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && document.activeElement !== input && buttons.length > 1) {
          e.preventDefault(); e.stopPropagation();
          var to = at < 0 ? buttons.length - 1 : (at + (e.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
          buttons[to].focus();
        }
        else if (e.key === "Enter" && opts.area && document.activeElement === input && !(e.ctrlKey || e.metaKey)) { /* a new line */ }
        else if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault(); e.stopPropagation();
          if (at >= 0 && !buttons[at].classList.contains("hd-yes")) buttons[at].click(); else done(true);
        }
      }
      document.addEventListener("keydown", key, true);
      back.addEventListener("mousedown", function (e) { if (e.target === back && !opts.must) done(false); });
      back.querySelector(".hd-yes").addEventListener("click", function () { done(true); });
      var no = back.querySelector(".hd-no"), alt = back.querySelector(".hd-alt");
      if (no) no.addEventListener("click", function () { done(false); });
      if (alt) alt.addEventListener("click", function () { done("alt"); });
      requestAnimationFrame(function () { back.classList.add("is-on"); waveDraw(back, opts); (input || back.querySelector(".hd-yes")).focus(); if (input && !opts.area) input.select(); });
    });
  }
  // HERESY 1167 (Viktor: «кликаешь на него... и вуаля»): a list in the studio's dialog; a click on a row is the answer
  // HERESY 1709: an item's own tip (opts.tipSide, opts.tipWidth: where the page's tip stands and how wide)
  function tipAttrs(it, opts) {
    if (!it.tip) return "";
    return ' data-tip="' + esc(it.tip) + '"' + (opts.tipSide ? ' data-tip-side="' + esc(opts.tipSide) + '"' : "") + (opts.tipWidth ? ' data-tip-width="' + esc(opts.tipWidth) + '"' : "");
  }
  function showChoose(text, items, opts) {
    opts = opts || {};
    var parts = String(text || "").split(/\n\s*\n/), title = parts.shift(), body = parts.join("\n\n");
    return new Promise(function (resolve) {
      var back = document.createElement("div"), before = document.activeElement, long = items.length > 8;
      back.className = "hd-back";
      back.innerHTML = '<div class="hd-box hd-choose" role="dialog" aria-modal="true" aria-label="' + esc(title) + '">' +
        '<div class="hd-title">' + esc(title) + "</div>" + (body ? '<div class="hd-body">' + esc(body) + "</div>" : "") +
        waveHtml(opts) + (long ? '<input type="search" class="hd-input hd-filter" placeholder="' + esc(opts.filter || "Filter") + '" />' : "") +
        '<div class="hd-list" role="listbox">' + items.map(function (it, i) {
          return '<button type="button" role="option" class="hd-item' + (it.current ? " is-current" : "") + '" data-i="' + i +
            '" style="--depth:' + (it.depth || 0) + '"' + tipAttrs(it, opts) + (it.current ? ' aria-selected="true"' : "") + '><span class="hd-item-label"' + (it.words ? "" : ' translate="no"') + '>' +   // HERESY 1379b: words: true, a word to translate, not a name
            esc(it.label) + "</span>" + (it.note != null && it.note !== "" ? '<span class="hd-item-note">' + esc(it.note) + "</span>" : "") +
            (it.current ? '<span class="hd-item-tick" aria-hidden="true">\u2713</span>' : "") + "</button>";
        }).join("") + "</div>" +
        '<div class="hd-acts">' + (opts.more || []).map(function (m, i) {
          return '<button type="button" class="btn ghost small hd-more" data-m="' + i + '">' + esc(m.label) + "</button>";
        }).join("") + '<span class="hd-spacer"></span><button type="button" class="btn ghost small hd-no">' + esc(opts.cancel || "Cancel") + "</button></div></div>";
      document.body.appendChild(back);
      var filter = back.querySelector(".hd-filter"), rows = Array.prototype.slice.call(back.querySelectorAll(".hd-item"));
      function shown() { return rows.filter(function (r) { return !r.hidden; }); }
      function done(v) {
        document.removeEventListener("keydown", key, true);
        back.classList.add("is-leaving");
        setTimeout(function () { back.remove(); }, 120);
        if (before && before.focus) { try { before.focus({ preventScroll: true }); } catch (e) { /* gone */ } }
        resolve(v);
      }
      function key(e) {
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); done(null); return; }
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          var list = shown(), at = list.indexOf(document.activeElement);
          var next = list[Math.max(0, Math.min(list.length - 1, at + (e.key === "ArrowDown" ? 1 : -1)))] || list[0];
          if (next) next.focus();
        } else if (e.key === "Enter" && document.activeElement === filter) {
          e.preventDefault();
          var first = shown()[0];
          if (first) done(items[+first.dataset.i].value);
        }
      }
      document.addEventListener("keydown", key, true);
      back.addEventListener("mousedown", function (e) { if (e.target === back) done(null); });
      rows.forEach(function (r) { r.addEventListener("click", function () { done(items[+r.dataset.i].value); }); });
      if (opts.wave && opts.wave.forItem) rows.forEach(function (r) {   // HERESY 1729: the row under the pointer (or in focus) marks its own
        var mark = function () { waveDraw(back, opts, opts.wave.forItem(items[+r.dataset.i].value)); };
        r.addEventListener("mouseenter", mark); r.addEventListener("focus", mark);
      });
      Array.prototype.forEach.call(back.querySelectorAll(".hd-more"), function (b) { b.addEventListener("click", function () { done(opts.more[+b.dataset.m].value); }); });
      back.querySelector(".hd-no").addEventListener("click", function () { done(null); });
      if (filter) filter.addEventListener("input", function () {
        var q = filter.value.trim().toLowerCase();
        rows.forEach(function (r) { r.hidden = !!q && r.textContent.toLowerCase().indexOf(q) < 0; });
      });
      requestAnimationFrame(function () {
        back.classList.add("is-on");
        waveDraw(back, opts);
        var cur = back.querySelector(".hd-item.is-current");
        (filter || cur || rows[0] || back.querySelector(".hd-no")).focus();
        if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: "nearest" });
      });
    });
  }
  // HERESY 1169 · 1241 (Viktor 08.10.2026: «Вижу визуал так же как в попап селектре воркспейса… Идея фильтра SUNO, с чекбоксами, логикой AND, OR, NOR»): several to tick, in groups, with how the ticked ones join; count(values, logic) says on the OK button how many it would show
  function showPick(text, groups, opts) {
    opts = opts || {};
    var parts = String(text || "").split(/\n\s*\n/), title = parts.shift(), body = parts.join("\n\n"), logic = opts.logic || "";
    return new Promise(function (resolve) {
      var back = document.createElement("div"), before = document.activeElement;
      back.className = "hd-back";
      back.innerHTML = '<div class="hd-box hd-choose hd-pick' + (opts.wide ? " is-wide" : "") + '" role="dialog" aria-modal="true" aria-label="' + esc(title) + '">' +   // HERESY 1619: wide
        '<div class="hd-title">' + esc(title) + "</div>" + (body ? '<div class="hd-body">' + esc(body) + "</div>" : "") +
        ((opts.logics || []).length ? '<div class="hd-logic" role="radiogroup" aria-label="' + esc(opts.logicLabel || "How the ticked ones join") + '">' + opts.logics.map(function (l) {
          return '<button type="button" role="radio" class="hd-logic-b" data-logic="' + esc(l.value) + '" aria-checked="false"' + (l.tip ? ' data-tip="' + esc(l.tip) + '"' : "") + ">" + esc(l.label) + "</button>";
        }).join("") + "</div>" : "") +
        waveHtml(opts) + '<div class="hd-list hd-pick-list">' + groups.map(function (g) {
          return '<div class="hd-group">' + esc(g.label) + "</div>" + g.items.map(function (it) {
            return '<label class="hd-item hd-check"><input type="checkbox" data-v="' + esc(it.value) + '"' + (it.checked ? " checked" : "") + ' /><span class="hd-item-ico" aria-hidden="true">' + (it.icon || "") +
              '</span><span class="hd-item-label"' + (it.raw ? ' translate="no"' : "") + ">" + esc(it.label) + "</span>" + (it.note != null && it.note !== "" ? '<span class="hd-item-note">' + esc(it.note) + "</span>" : "") + "</label>";   // HERESY 1732: raw, a name kept as it is
          }).join("");
        }).join("") + "</div>" +
        '<div class="hd-acts"><button type="button" class="btn ghost small hd-clear">' + esc(opts.clear || "Clear") + '</button><span class="hd-spacer"></span>' +
        '<button type="button" class="btn ghost small hd-no">' + esc(opts.cancel || "Cancel") + '</button><button type="button" class="btn small primary hd-yes"></button></div></div>';
      document.body.appendChild(back);
      var boxes = Array.prototype.slice.call(back.querySelectorAll(".hd-check input")), yes = back.querySelector(".hd-yes");
      function values() { return boxes.filter(function (b) { return b.checked; }).map(function (b) { return b.dataset.v; }); }
      function paint() {
        Array.prototype.forEach.call(back.querySelectorAll(".hd-logic-b"), function (b) { var on = b.dataset.logic === logic; b.classList.toggle("is-on", on); b.setAttribute("aria-checked", on ? "true" : "false"); });
        boxes.forEach(function (b) { b.closest(".hd-check").classList.toggle("is-on", b.checked); });
        var n = opts.count ? opts.count(values(), logic) : null;
        yes.textContent = (opts.ok || "Show") + (n === null || n === undefined ? "" : " " + n);
        if (opts.wave) waveDraw(back, opts, opts.wave.forValues ? opts.wave.forValues(values()) : null);   // HERESY 1729: the ticks marked
      }
      function done(v) {
        document.removeEventListener("keydown", key, true);
        back.classList.add("is-leaving");
        setTimeout(function () { back.remove(); }, 120);
        if (before && before.focus) { try { before.focus({ preventScroll: true }); } catch (e) { /* gone */ } }
        resolve(v);
      }
      function key(e) {
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); done(null); }
        else if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); done({ values: values(), logic: logic }); }
      }
      document.addEventListener("keydown", key, true);
      back.addEventListener("mousedown", function (e) { if (e.target === back) done(null); });
      back.addEventListener("click", function (e) { var b = e.target.closest(".hd-logic-b"); if (b) { logic = b.dataset.logic; paint(); } });
      boxes.forEach(function (b) { b.addEventListener("change", paint); });
      back.querySelector(".hd-clear").addEventListener("click", function () { boxes.forEach(function (b) { b.checked = false; }); paint(); });
      back.querySelector(".hd-no").addEventListener("click", function () { done(null); });
      yes.addEventListener("click", function () { done({ values: values(), logic: logic }); });
      requestAnimationFrame(function () { back.classList.add("is-on"); paint(); (boxes[0] || yes).focus(); });
    });
  }
  function queued(kind, text, value, opts) {
    var p = chain.then(function () { return kind === "choose" ? showChoose(text, value, opts) : kind === "pick" ? showPick(text, value, opts) : show(kind, text, value, opts); });
    chain = p.then(function () {}, function () {});
    return p;
  }

  window.HeresyDialog = {
    confirm: function (text, opts) { return queued("confirm", text, null, opts); },
    prompt: function (text, value, opts) { return queued("prompt", text, value, opts); },
    alert: function (text, opts) { return queued("alert", text, null, opts); },
    choose: function (text, items, opts) { return queued("choose", text, items || [], opts); },
    pick: function (text, groups, opts) { return queued("pick", text, groups || [], opts); },   // HERESY 1169 · 1241   // HERESY 1167
    waveDraw: waveDraw                                    // HERESY 1729: for the checks
  };
})();
