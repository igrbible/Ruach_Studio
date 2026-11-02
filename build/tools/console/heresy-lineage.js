// HERESY 1988 (Viktor 01.11.2026: «Огромное упущение у нас в карточках треков - если трек модифицировался через Огранщика, пометок мало, нужно полное
// родословное дерево… в контекстное меню, плюс кнопочку ДРЕВА родителей и потомков, и в попапе выводить… подобное тому древу, что в Огранщике, с быстрым
// переходом на нужной дериватив или производный»): a take's family tree over the room, from the lab's lineage.py. The oldest take still here at its top,
// every take made from it under it, the take asked lit; under each take what the Refiner made in it.
// HERESY 1992 (Viktor 01.11.2026: «Оформи его в том же стиле, что и модалка сравнения семплов. Здесь уже без ограничений по количеству, потому что может
// быть и три десятка дорожек. Клик по реальному дублю подтягивает его в библиотеке, но не закрывает модалку. Внутренние дорожки Огранщика помечаем как
// доступные в огранщике и спрашиваем, или пользователь хочет перейти в огранщик, с подтяжкой всего и открытием древа в Огранщике. Навигация у нас должна
// быть безупречно двусторонней и не терять человека у разбитого корыта»): the compare window's box, head and rows, as many as the family has. A take's
// name shows it where it is asked from and the window stays: its card in the Librarian, the take itself in the Refiner and elsewhere; ▶ plays it in the
// player and pauses it there; its 👍 🔥 💎 👎 ★ are the cards' own. A version the Refiner made is marked so, and asks before it leaves the room: the
// Refiner opens on its take, its tree open, the version found and lit. Back again: the take's 🌳 in its head brings this window, where each take has
// «Show in the Librarian». «Compare these» puts the family's takes in the compare player (twelve at most there). Esc, Close or a click around it closes it.
//
//   HeresyLineage.init(hooks) · HeresyLineage.open(name) · HeresyLineage.close() · HeresyLineage.state()   (the last for the checks)
//   hooks: play(name), playing() → name, audio, open(name), library(name), refine(name, id), find(name) → take, rating(name), rate(name, v),
//          favorite(name), setFavorite(name, on), compare(names), ask(text, opts) → Promise<bool>
(function () {
  "use strict";
  var S = { hooks: {}, data: null, el: null, name: "", shown: "", rows: [] };
  var KIND = { stems: "stems", debuzz: "debuzz", remaster: "remaster", upscale: "upscale", vupscale: "Voice upscale", daw: "DAW mix", gate: "Digital Gateway",
               plugin: "plugin", midi: "MIDI", orchestra: "MIDI orchestra", ambience: "Ambient", pianoteq: "Pianoteq" };
  var LIB_ICO = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M4 4h3.2v16H4zM9.2 6.5h3.2V20H9.2zM14.4 7.4l3-.8 3.5 13-3 .8zM2.5 20.5h19"/></svg>';
  function tr(s) { return window.RuachI18n ? window.RuachI18n.t(s) : s; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function ico(n) { return window.HeresyIcons && window.HeresyIcons.ui ? window.HeresyIcons.ui(n) : (n === "pause" ? "❚❚" : n === "play" ? "▶" : ""); }
  function room() { var t = document.body.dataset.tab; return t === "collection" ? "library" : t === "post" ? "refiner" : "other"; }
  function when(t) {
    if (!t) return "";
    var d = new Date((t > 1e12 ? t : t * 1000)), z = function (n) { return (n < 10 ? "0" : "") + n; };
    return z(d.getDate()) + "." + z(d.getMonth() + 1) + "." + String(d.getFullYear()).slice(2) + " " + z(d.getHours()) + ":" + z(d.getMinutes());
  }
  function clock(s) { s = Math.round(s || 0); return s ? Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2) : ""; }
  function source(s) {
    if (!s || s === "the take") return tr("from the take");
    var p = String(s).split("/");
    if (p[0] === "derived" && p.length === 2) return tr("from the set");          // a whole set (the stems' folder), not one of its files
    return tr("from {0}").replace("{0}", p.pop());
  }
  // the family as rows, the takes in the tree's order, each take's Refiner versions under it as its tree draws them
  function flatten(d) {
    var rows = [];
    function versions(take, list, depth) {
      var by = {}, kids = {}, top = [], seen = {};
      list.forEach(function (m) { by[m.id] = m; });
      list.forEach(function (m) {
        var s = String(m.source || "").split("/"), p = s[0] === "derived" ? s[1] : "";
        if (p && by[p] && p !== m.id) (kids[p] = kids[p] || []).push(m); else top.push(m);
      });
      (function walk(ms, dp) {
        ms.forEach(function (m) {
          if (seen[m.id]) return;
          seen[m.id] = 1;
          rows.push({ dv: m, take: take, depth: dp });
          if (kids[m.id]) walk(kids[m.id], dp + 1);
        });
      })(top, depth);
    }
    (function walk(n, depth) {
      rows.push({ node: n, depth: depth });
      if (n.derived && n.derived.length) versions(n.name, n.derived, depth + 1);
      (n.children || []).forEach(function (k) { walk(k, depth + 1); });
    })(d.root, 0);
    return rows;
  }
  function rateHtml(name) {
    var h = S.hooks;
    if (!h.rating) return "<span></span>";
    return '<span class="cmp-rate ln-rate"><button type="button" class="coll-act" data-ln-rate="1" data-name="' + esc(name) + '" aria-label="Like" data-tip="Like">' + ico("like") + "</button>" +
      (window.HeresyCollection && window.HeresyCollection.markBtns ? window.HeresyCollection.markBtns(name) : "") +
      '<button type="button" class="coll-act" data-ln-rate="-1" data-name="' + esc(name) + '" aria-label="Dislike" data-tip="Dislike">' + ico("dislike") + "</button>" +
      (h.favorite ? '<button type="button" class="coll-act fav" data-ln-fav="1" data-name="' + esc(name) + '" aria-label="Favourite" data-tip="Favourite">' + ico("star") + "</button>" : "") + "</span>";
  }
  function rowHtml(r, i, focus) {
    var where = room();
    if (r.dv) {
      var m = r.dv;
      return '<li class="cmp-li ln-li is-dv" data-ln-i="' + i + '" style="--d:' + r.depth + '"><button type="button" class="cmp-row ln-row ln-dvrow" data-ln-take="' + esc(r.take) + '" data-ln-dv="' + esc(m.id) +
        '" data-tip="' + esc(where === "refiner" ? tr("Find it in the Refiner's tree of its take") : tr("Made in the Refiner: it opens there, its take's tree open and this version lit (asks first)")) + '">' +
        '<span></span><span class="cmp-name ln-kind"><span class="ln-tw" aria-hidden="true">\u21b3\u00a0</span><span class="ln-badge">' + esc(tr("Refiner")) + "</span>" +
        esc(tr(m.label || KIND[m.kind] || m.kind)) + '</span><span class="cmp-group">' + esc(source(m.source)) + '</span><span class="ln-when mono">' + esc(when(m.when)) +
        '</span><span class="cmp-dur mono"></span><span></span><span></span></button></li>';
    }
    var n = r.node, t = S.hooks.find ? S.hooks.find(n.name) : null, here = n.here && t;
    return '<li class="cmp-li ln-li" data-ln-i="' + i + '" data-name="' + esc(n.name) + '" style="--d:' + r.depth + '"><div class="cmp-row ln-row' + (n.name === focus ? " is-focus" : "") + (n.name === S.shown ? " is-on" : "") +
      (here ? "" : " is-gone") + '">' +
      (here ? '<button type="button" class="ln-play" data-ln-play="' + esc(n.name) + '" aria-label="' + esc(tr("Play")) + '">' + ico("play") + "</button>" : '<span class="ln-play"></span>') +
      '<button type="button" class="cmp-name ln-title" data-ln-open="' + esc(n.name) + '"' + (here ? "" : " disabled") + ' translate="no" data-tip="' +
      esc(!here ? tr("No longer in the library") : where === "library" ? tr("Show it in the Librarian; this window stays") : tr("Open it; this window stays")) + '">' +
      (r.depth ? '<span class="ln-tw" aria-hidden="true">\u21b3\u00a0</span>' : "") + esc(n.title) + "</button>" +
      '<span class="cmp-group">' + esc(n.what ? tr(n.what) : "") + (n.name === focus ? ' <span class="ln-here">' + esc(tr("this take")) + "</span>" : "") + "</span>" +
      '<span class="ln-when mono">' + esc(when(n.created)) + '</span><span class="cmp-dur mono">' + esc(clock(t && t.seconds)) + "</span>" +
      (here ? rateHtml(n.name) : "<span></span>") +
      (here && where !== "library" && S.hooks.library ? '<button type="button" class="coll-act ln-lib" data-ln-lib="' + esc(n.name) + '" aria-label="' + esc(tr("Show in the Librarian")) + '" data-tip="' +
        esc(tr("Show in the Librarian")) + '">' + LIB_ICO + "</button>" : "<span></span>") + "</div></li>";
  }
  function count(rows) { return rows.reduce(function (a, r) { a[r.dv ? 1 : 0]++; return a; }, [0, 0]); }
  function hint() {
    var c = count(S.rows), where = room();
    var say = c[0] === 1 ? tr("1 take") : tr("{0} takes").replace("{0}", c[0]);
    if (c[1]) say += " · " + (c[1] === 1 ? tr("1 version made in the Refiner") : tr("{0} versions made in the Refiner").replace("{0}", c[1]));
    say += " · " + (where === "library" ? tr("a take's name shows it in the Librarian and the window stays") : tr("a take's name opens it and the window stays")) +
      " · " + tr("▶ plays it") + " · " + (where === "refiner" ? tr("a version is found in the Refiner's tree") : tr("a version of the Refiner asks to go there"));
    return say;
  }
  function paint(d) {
    var box = S.el && S.el.querySelector(".ln-box");
    if (!box) return;
    S.rows = flatten(d);
    var lone = S.rows.length === 1;
    box.querySelector(".cmp-title").textContent = tr("Family tree") + " · " + d.root.title;
    box.querySelector(".ln-hint").textContent = lone ? tr("No family yet: made from no other take, and nothing made from it.") : hint();
    var takes = S.rows.filter(function (r) { return r.node && r.node.here; });
    var cmp = box.querySelector("[data-ln-compare]");
    cmp.hidden = !(S.hooks.compare && takes.length >= 2);
    cmp.textContent = tr("Compare these ({0})").replace("{0}", Math.min(12, takes.length));
    box.querySelector(".ln-list").innerHTML = (d.gone_parent ? '<li class="row-hint ln-gone">' + esc(tr("Its first parent is no longer in the library.")) + "</li>" : "") +
      S.rows.map(function (r, i) { return rowHtml(r, i, d.focus); }).join("");
    paintState();
    var f = box.querySelector(".ln-row.is-focus");
    if (f && f.scrollIntoView) f.scrollIntoView({ block: "nearest" });
  }
  // the player's state and the marks, painted again as they change
  function paintState() {
    if (!S.el) return;
    var h = S.hooks, now = h.playing ? h.playing() : "";
    Array.prototype.forEach.call(S.el.querySelectorAll(".ln-li[data-name]"), function (li) {
      var name = li.dataset.name, row = li.querySelector(".ln-row"), b = li.querySelector("[data-ln-play]");
      if (row) row.classList.toggle("is-playing", name === now);
      if (b) { b.innerHTML = ico(name === now ? "pause" : "play"); b.setAttribute("aria-label", tr(name === now ? "Pause" : "Play")); }
      var r = h.rating ? h.rating(name) : 0;
      li.querySelectorAll("[data-ln-rate]").forEach(function (x) { x.setAttribute("aria-pressed", String(+x.dataset.lnRate === 1 ? r > 0 : r < 0)); });
      var f = li.querySelector("[data-ln-fav]");
      if (f) f.setAttribute("aria-pressed", String(!!(h.favorite && h.favorite(name))));
    });
  }
  function shown(name) {
    S.shown = name;
    if (!S.el) return;
    Array.prototype.forEach.call(S.el.querySelectorAll(".ln-row.is-on"), function (r) { r.classList.remove("is-on"); });
    var li = S.el.querySelector('.ln-li[data-name="' + (window.CSS && CSS.escape ? CSS.escape(name) : name) + '"] .ln-row');
    if (li) li.classList.add("is-on");
  }
  function close() {
    if (!S.el) return;
    S.el.remove();
    S.el = null;
    document.removeEventListener("keydown", onKey, true);
    var a = S.hooks.audio;
    if (a) { a.removeEventListener("play", paintState); a.removeEventListener("pause", paintState); a.removeEventListener("emptied", paintState); }
  }
  function onKey(e) { if (e.key === "Escape" && S.el && !document.querySelector(".hd-back.is-on, .cmp-back:not(.ln-back)")) { e.preventDefault(); e.stopPropagation(); close(); } }
  function toRefiner(take, id) {
    close();
    if (S.hooks.refine) S.hooks.refine(take, id);
  }
  function onClick(e) {
    var h = S.hooks;
    if (e.target === S.el || e.target.closest("[data-ln-close]")) return close();
    var p = e.target.closest("[data-ln-play]"), o = e.target.closest("[data-ln-open]"), v = e.target.closest("[data-ln-dv]"), lib = e.target.closest("[data-ln-lib]");
    var rb = e.target.closest("[data-ln-rate]"), fb = e.target.closest("[data-ln-fav]"), cmp = e.target.closest("[data-ln-compare]");
    if (p) { if (h.play) h.play(p.dataset.lnPlay); setTimeout(paintState, 60); return; }
    if (o) { shown(o.dataset.lnOpen); if (h.open) h.open(o.dataset.lnOpen); return; }
    if (lib) {                                         // the room is the Librarian's now: its rows say so, the place in the list kept
      var box = S.el.querySelector(".ln-box"), top = box.scrollTop;
      shown(lib.dataset.lnLib);
      if (h.library) h.library(lib.dataset.lnLib);
      paint(S.data);
      box.scrollTop = top;
      return;
    }
    if (rb) {
      var want = +rb.dataset.lnRate, nm = rb.dataset.name, to = (h.rating(nm) || 0) === want ? 0 : want, done = h.rate(nm, to);
      if (to < 0 && h.favorite && h.favorite(nm) && h.setFavorite) h.setFavorite(nm, false);   // a dislike takes the star off, as on the cards
      paintState();
      if (done && done.then) done.then(paintState, paintState);
      return;
    }
    if (fb) {
      var fn = fb.dataset.name, on = !(h.favorite && h.favorite(fn)), dn = h.setFavorite ? h.setFavorite(fn, on) : null;
      if (on && (h.rating(fn) || 0) < 0) h.rate(fn, 0);
      paintState();
      if (dn && dn.then) dn.then(paintState, paintState);
      return;
    }
    if (cmp) { var names = S.rows.filter(function (r) { return r.node && r.node.here; }).map(function (r) { return r.node.name; }); if (h.compare) h.compare(names.slice(0, 12)); return; }
    if (v) {
      var take = v.dataset.lnTake, id = v.dataset.lnDv, row = S.rows[+v.closest("[data-ln-i]").dataset.lnI], label = row && row.dv ? tr(row.dv.label || KIND[row.dv.kind] || row.dv.kind) : id;
      var t = h.find ? h.find(take) : null, title = t && t.title ? t.title : take;
      if (room() === "refiner") return toRefiner(take, id);
      var ask = h.ask ? h.ask(tr("Go to the Refiner?") + "\n\n" + tr("«{0}» was made in the Refiner from «{1}». The Refiner opens on that take, its tree open and this version lit. To come back: the 🌳 in the take's head brings this window, and «Show in the Librarian» on each take.")
        .replace("{0}", label).replace("{1}", title), { ok: tr("Go to the Refiner") }) : Promise.resolve(true);
      ask.then(function (yes) { if (yes) toRefiner(take, id); });
    }
  }
  function open(name) {
    close();
    S.name = name;
    S.data = null;
    S.shown = "";
    S.rows = [];
    var back = document.createElement("div");
    back.className = "cmp-back ln-back";
    back.innerHTML = '<div class="cmp-box ln-box" role="dialog" aria-modal="true" aria-label="' + esc(tr("Family tree")) + '" tabindex="-1">' +
      '<div class="cmp-head"><div class="ln-headtext"><div class="cmp-title">' + esc(tr("Family tree")) + '</div><div class="row-hint ln-hint">' + esc(tr("Asking the lab…")) + "</div></div>" +
      '<div class="ln-acts"><button type="button" class="btn ghost small" data-ln-compare="1" hidden data-tip="' + esc(tr("The family's takes in the compare player, played from the same second (twelve at most there)")) + '"></button>' +
      '<button type="button" class="btn ghost small" data-ln-close="1">' + esc(tr("Close")) + "</button></div></div>" +
      '<ol class="cmp-list ln-list"></ol></div>';
    document.body.appendChild(back);
    S.el = back;
    back.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey, true);
    var a = S.hooks.audio;
    if (a) { a.addEventListener("play", paintState); a.addEventListener("pause", paintState); a.addEventListener("emptied", paintState); }
    return fetch("/lab/lineage?name=" + encodeURIComponent(name))
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || "HTTP " + r.status); return d; }); })
      .then(function (d) { if (S.name !== name || !S.el) return; S.data = d; paint(d); })
      .catch(function (e) {
        var hn = S.el && S.el.querySelector(".ln-hint");
        if (hn) { hn.textContent = tr("The family tree did not come:") + " " + e.message; hn.classList.add("is-bad"); }
      });
  }
  window.HeresyLineage = { init: function (hooks) { S.hooks = hooks || {}; }, open: open, close: close, repaint: paintState,
    state: function () { return { open: !!S.el, data: S.data, name: S.name, shown: S.shown, rows: S.rows.length, hooks: S.hooks }; } };
})();
