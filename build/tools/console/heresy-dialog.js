// HERESY 1057 (Viktor): the studio's own dialogs instead of the browser's confirm() and prompt().
// HeresyDialog.confirm(text, {ok, cancel, danger, must}) -> Promise<boolean>; must: one of the two buttons and nothing else
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
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  function show(kind, text, value, opts) {
    opts = opts || {};
    var parts = String(text || "").split(/\n\s*\n/), title = parts.shift(), body = parts.join("\n\n");
    return new Promise(function (resolve) {
      var back = document.createElement("div"), before = document.activeElement;
      back.className = "hd-back";
      back.innerHTML = '<div class="hd-box" role="dialog" aria-modal="true" aria-label="' + esc(title) + '">' +
        '<div class="hd-title">' + esc(title) + "</div>" + (body ? '<div class="hd-body">' + esc(body) + "</div>" : "") +
        (kind === "prompt" ? '<input type="text" class="hd-input" maxlength="' + (opts.max || 200) + '" placeholder="' + esc(opts.placeholder || "") + '" />' : "") +
        '<div class="hd-acts">' + (kind === "alert" ? "" : '<button type="button" class="btn ghost small hd-no">' + esc(opts.cancel || "Cancel") + "</button>") +
        '<button type="button" class="btn small ' + (opts.danger ? "danger-fill" : "primary") + ' hd-yes">' + esc(opts.ok || (kind === "prompt" ? "OK" : opts.danger ? "Delete" : "OK")) + "</button></div></div>";
      document.body.appendChild(back);
      var input = back.querySelector(".hd-input");
      if (input) { input.value = value == null ? "" : String(value); }
      function done(yes) {
        document.removeEventListener("keydown", key, true);
        back.classList.add("is-leaving");
        setTimeout(function () { back.remove(); }, 120);
        if (before && before.focus) { try { before.focus({ preventScroll: true }); } catch (e) { /* gone */ } }
        resolve(kind === "prompt" ? (yes ? input.value : null) : !!yes);
      }
      function key(e) {
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); if (!opts.must) done(false); }
        else if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); done(true); }
      }
      document.addEventListener("keydown", key, true);
      back.addEventListener("mousedown", function (e) { if (e.target === back && !opts.must) done(false); });
      back.querySelector(".hd-yes").addEventListener("click", function () { done(true); });
      var no = back.querySelector(".hd-no");
      if (no) no.addEventListener("click", function () { done(false); });
      requestAnimationFrame(function () { back.classList.add("is-on"); (input || back.querySelector(".hd-yes")).focus(); if (input) input.select(); });
    });
  }
  // HERESY 1167 (Viktor: «кликаешь на него... и вуаля»): a list in the studio's dialog; a click on a row is the answer
  function showChoose(text, items, opts) {
    opts = opts || {};
    var parts = String(text || "").split(/\n\s*\n/), title = parts.shift(), body = parts.join("\n\n");
    return new Promise(function (resolve) {
      var back = document.createElement("div"), before = document.activeElement, long = items.length > 8;
      back.className = "hd-back";
      back.innerHTML = '<div class="hd-box hd-choose" role="dialog" aria-modal="true" aria-label="' + esc(title) + '">' +
        '<div class="hd-title">' + esc(title) + "</div>" + (body ? '<div class="hd-body">' + esc(body) + "</div>" : "") +
        (long ? '<input type="search" class="hd-input hd-filter" placeholder="' + esc(opts.filter || "Filter") + '" />' : "") +
        '<div class="hd-list" role="listbox">' + items.map(function (it, i) {
          return '<button type="button" role="option" class="hd-item' + (it.current ? " is-current" : "") + '" data-i="' + i +
            '" style="--depth:' + (it.depth || 0) + '"' + (it.current ? ' aria-selected="true"' : "") + '><span class="hd-item-label" translate="no">' +
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
      Array.prototype.forEach.call(back.querySelectorAll(".hd-more"), function (b) { b.addEventListener("click", function () { done(opts.more[+b.dataset.m].value); }); });
      back.querySelector(".hd-no").addEventListener("click", function () { done(null); });
      if (filter) filter.addEventListener("input", function () {
        var q = filter.value.trim().toLowerCase();
        rows.forEach(function (r) { r.hidden = !!q && r.textContent.toLowerCase().indexOf(q) < 0; });
      });
      requestAnimationFrame(function () {
        back.classList.add("is-on");
        var cur = back.querySelector(".hd-item.is-current");
        (filter || cur || rows[0] || back.querySelector(".hd-no")).focus();
        if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: "nearest" });
      });
    });
  }
  function queued(kind, text, value, opts) {
    var p = chain.then(function () { return kind === "choose" ? showChoose(text, value, opts) : show(kind, text, value, opts); });
    chain = p.then(function () {}, function () {});
    return p;
  }

  window.HeresyDialog = {
    confirm: function (text, opts) { return queued("confirm", text, null, opts); },
    prompt: function (text, value, opts) { return queued("prompt", text, value, opts); },
    alert: function (text, opts) { return queued("alert", text, null, opts); },
    choose: function (text, items, opts) { return queued("choose", text, items || [], opts); }   // HERESY 1167
  };
})();
