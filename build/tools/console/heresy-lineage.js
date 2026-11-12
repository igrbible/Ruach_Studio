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
// HERESY 2022 (Viktor 02.11.2026: «В попапе родословного дерева добавь в самый верх на полную ширину крупную волну с линейкой как в попапе сравнения.
// И ... вот те пики, срез которых мы удалили из движка, их можно помечать оттенком, всю waveform немного подкрасить на её пиковых краях»): at the top,
// the whole width, a take's wave and its ruler as the compare window draws them: the take the player holds when it is of the family, else the one
// shown or asked. Where the old Peak clip (99.999th percentile to full scale, cut flat, taken out in 2007) would have cut, the wave's tips are red
// over its level, faint lines at that level; a take made before 2.0.5, cut already, has its flat tops red. A click or a drag plays it from that
// second in the player. From the lab's /take/wave (peakedge.py).
//
//   HeresyLineage.init(hooks) · HeresyLineage.open(name) · HeresyLineage.close() · HeresyLineage.state()   (the last for the checks)
//   hooks: play(name), playing() → name, audio, open(name), library(name), refine(name, id), find(name) → take, rating(name), rate(name, v),
//          favorite(name), setFavorite(name, on), compare(names), ask(text, opts) → Promise<bool>, current() → name, seek(name, seconds)
(function () {
  "use strict";
  var S = { hooks: {}, data: null, el: null, name: "", shown: "", rows: [], wname: "", wdata: null };
  var WAVES = {};                                     // HERESY 2022: a take's wave as the lab drew it, kept while the page lives
  var KIND = { stems: "stems", debuzz: "debuzz", remaster: "remaster", upscale: "upscale", vupscale: "Voice upscale", daw: "DAW mix", gate: "Digital Gateway",
               plugin: "plugin", midi: "MIDI", orchestra: "MIDI orchestra", ambience: "Ambient", pianoteq: "Pianoteq", organteq: "Organteq", airteq: "Airteq" };
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
  // HERESY 2298: what a version was made from, and the other takes it took in as links (a Reader's mix: its music stays the Creator's, linked)
  function dvFrom(m) {
    var s = /^take:/.test(String(m.source || "")) ? "" : source(m.source);
    var lk = (m.links || []).map(function (l) { return "\ud83d\udd17 " + l.title + " (" + tr(l.realm === "reader" ? "Narrator" : "Musician") + ")"; }).join(", ");
    return lk ? (s ? s + " \u00b7 " : "") + tr("with {0}").replace("{0}", lk) : s;
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
        esc(tr(m.label || KIND[m.kind] || m.kind)) + '</span><span class="cmp-group">' + esc(dvFrom(m)) + '</span><span class="ln-when mono">' + esc(when(m.when)) +
        '</span><span class="cmp-dur mono"></span><span></span><span></span></button></li>';
    }
    var n = r.node, t = S.hooks.find ? S.hooks.find(n.name) : null, here = n.here && t;
    var vae = here && S.hooks.vae ? S.hooks.vae(n.name) : "";   // HERESY 2304: the VAE that made it
    return '<li class="cmp-li ln-li" data-ln-i="' + i + '" data-name="' + esc(n.name) + '" style="--d:' + r.depth + '"><div class="cmp-row ln-row' + (n.name === focus ? " is-focus" : "") + (n.name === S.shown ? " is-on" : "") +
      (here ? "" : " is-gone") + '">' +
      (here ? '<button type="button" class="ln-play" data-ln-play="' + esc(n.name) + '" aria-label="' + esc(tr("Play")) + '">' + ico("play") + "</button>" : '<span class="ln-play"></span>') +
      '<button type="button" class="cmp-name ln-title" data-ln-open="' + esc(n.name) + '"' + (here ? "" : " disabled") + ' translate="no" data-tip="' +
      esc(!here ? tr("No longer in the library") : where === "library" ? tr("Show it in the Librarian; this window stays") : tr("Open it; this window stays")) + '">' +
      (r.depth ? '<span class="ln-tw" aria-hidden="true">\u21b3\u00a0</span>' : "") + esc(n.title) + "</button>" +
      '<span class="cmp-group">' + esc(n.what ? tr(n.what) : "") + (vae ? ' <span class="ln-vae" translate="no">' + esc(vae + " VAE") + "</span>" : "") + (n.name === focus ? ' <span class="ln-here">' + esc(tr("this take")) + "</span>" : "") + "</span>" +
      '<span class="ln-when mono">' + esc(when(n.created)) + '</span><span class="cmp-dur mono">' + esc(clock(t && t.seconds)) + "</span>" +
      (here ? rateHtml(n.name) : "<span></span>") +
      (here && where !== "library" && S.hooks.library ? '<button type="button" class="coll-act ln-lib" data-ln-lib="' + esc(n.name) + '" aria-label="' + esc(tr("Show in the Librarian")) + '" data-tip="' +
        esc(tr("Show in the Librarian")) + '">' + LIB_ICO + "</button>" : "<span></span>") + "</div></li>";
  }
  // ---- HERESY 2022: the wave at the top
  function family(name) { return !!name && S.rows.some(function (r) { return r.node && r.node.here && r.node.name === name; }); }
  function waveOf(name) {
    if (!name) return;
    if (S.wname !== name) { S.wname = name; S.wdata = WAVES[name] || null; paintWaveHead(); }
    drawWave();
    if (WAVES[name]) return;
    WAVES[name] = null;
    fetch("/lab/take/wave?name=" + encodeURIComponent(name) + "&n=1200", { priority: "low" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { return d && Array.isArray(d.peaks) && d.peaks.length ? d : "none"; }, function () { return "none"; })
      .then(function (d) {
        WAVES[name] = d;
        var ks = Object.keys(WAVES);
        if (ks.length > 60) delete WAVES[ks[0]];
        if (S.wname === name) { S.wdata = d; paintWaveHead(); drawWave(); }
      });
  }
  function pickWave() {                               // the take in the player when it is of the family, else the one shown, else the one asked
    var h = S.hooks, cur = h.current ? h.current() : "";
    waveOf(family(cur) ? cur : family(S.shown) ? S.shown : S.data && S.data.focus);
  }
  function paintWaveHead() {
    if (!S.el) return;
    var t = S.hooks.find ? S.hooks.find(S.wname) : null, d = S.wdata, say = "";
    S.el.querySelector(".ln-wavename").textContent = t && t.title ? t.title : S.wname;
    if (d && d !== "none" && d.over > 0) {
      var top = Math.max.apply(null, d.peaks) || 1;
      say = tr("In red: what the old Peak clip would have cut for {2} dB more loudness: {0} samples in {1} places")
        .replace("{0}", d.over).replace("{1}", d.places).replace("{2}", (20 * Math.log10(top / (d.cut || top))).toFixed(1));
    } else if (d && d !== "none" && d.flat > 0) {
      say = tr("In red: cut flat at full scale when it was made (the Peak clip before 2.0.5), {0} samples").replace("{0}", d.flat);
    }
    var el = S.el.querySelector(".ln-wavesay");
    el.innerHTML = say ? '<i class="ln-swatch" aria-hidden="true"></i>' + esc(say) : "";
  }
  function ticks(d, w) {                              // as the compare window's: a minute, 30 s, 15 s, a second when there is room
    var pps = d > 0 ? w / d : 0, every = pps >= 4 ? 1 : pps >= 2 ? 2 : pps >= 1.2 ? 3 : pps >= 0.6 ? 5 : 0, out = [];
    for (var s = 0; s <= Math.floor(d); s++) {
      var k = s % 60 === 0 ? 4 : s % 30 === 0 ? 3 : s % 15 === 0 ? 2 : every && s % every === 0 ? 1 : 0;
      if (k) out.push([s, k]);
    }
    return out;
  }
  function fit(c) {
    var w = c.clientWidth, h = c.clientHeight, dpr = window.devicePixelRatio || 1;
    if (w && h && (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr))) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    var ctx = c.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx: ctx, w: w, h: h };
  }
  function secsOf() { var d = S.wdata; return d && d !== "none" ? d.seconds || 0 : 0; }
  function drawWave() {
    if (!S.el) return;
    var c = S.el.querySelector(".ln-wave");
    if (!c || !c.clientWidth) return;
    var f = fit(c), ctx = f.ctx, w = f.w, h = f.h, css = getComputedStyle(c), p = S.wdata, h2 = S.hooks, a = h2.audio;
    var lit = css.getPropertyValue("--amber").trim() || "#d9a441", dim = css.getPropertyValue("--dim").trim() || "#888", bad = css.getPropertyValue("--bad").trim() || "#d0563c";
    var d = secsOf(), mine = !!(a && h2.current && h2.current() === S.wname), at = mine && d ? Math.min(1, (a.currentTime || 0) / d) : 0;
    if (!p || p === "none") {
      ctx.fillStyle = dim; ctx.fillRect(0, h / 2 - 0.5, w, 1);
      ctx.font = "12px " + (css.getPropertyValue("--sans").trim() || "sans-serif");
      ctx.fillText(tr(p === "none" ? "No wave for this take" : "Reading the wave…"), 8, h / 2 - 6);
    } else {
      var pk = p.peaks, max = 0, k;
      for (k = 0; k < pk.length; k++) if (pk[k] > max) max = pk[k];
      max = max || 1;
      var over = p.over > 0, hot = {}, list = over ? p.hot : p.flat > 0 ? p.flats : [];
      (list || []).forEach(function (i) { hot[i] = 1; });
      var lvl = over ? Math.min(1, p.cut / max) : 1, span = h - 6, bars = Math.max(1, Math.floor(w / 3));
      for (var x = 0; x < bars; x++) {
        var k0 = Math.floor(x * pk.length / bars), k1 = Math.max(k0 + 1, Math.floor((x + 1) * pk.length / bars)), m = 0, red = false;
        for (k = k0; k < k1 && k < pk.length; k++) { if (pk[k] > m) m = pk[k]; if (hot[k]) red = true; }
        var bh = Math.max(1, m / max * span), y0 = (h - bh) / 2;
        ctx.fillStyle = (x + 0.5) / bars <= at ? lit : dim;
        ctx.fillRect(x * 3, y0, 2, bh);
        if (red) {                                    // the tips over the old cut's level, or a flat top's last pixels
          var tip = over ? Math.max(1.5, (m / max - lvl) * span / 2) : Math.min(3, bh / 2);
          ctx.fillStyle = bad;
          ctx.fillRect(x * 3, y0, 2, tip); ctx.fillRect(x * 3, y0 + bh - tip, 2, tip);
        }
      }
      if (over) {                                     // the level itself, faint
        var ly = (h - lvl * span) / 2;
        ctx.globalAlpha = 0.35; ctx.fillStyle = bad;
        for (var dx = 0; dx < w; dx += 6) { ctx.fillRect(dx, Math.round(ly), 3, 1); ctx.fillRect(dx, Math.round(h - ly), 3, 1); }
        ctx.globalAlpha = 1;
      }
    }
    if (mine && d) { ctx.fillStyle = lit; ctx.fillRect(Math.round(w * at) - 1, 0, 2, h); }
    drawRuler();
  }
  function drawRuler() {
    var c = S.el && S.el.querySelector(".ln-ruler");
    if (!c || !c.clientWidth) return;
    var f = fit(c), ctx = f.ctx, w = f.w, h = f.h, css = getComputedStyle(c), d = secsOf();
    if (!d) return;
    var ink = css.getPropertyValue("--muted").trim() || "#777", dim = css.getPropertyValue("--dim").trim() || "#aaa", pps = w / d, LEN = [0, 0.22, 0.42, 0.6, 1];
    ctx.font = "10.5px " + (css.getPropertyValue("--mono").trim() || "monospace");
    ctx.textBaseline = "bottom";
    ticks(d, w).forEach(function (tk) {
      var x = Math.min(w - 1, Math.round(tk[0] * pps));
      ctx.fillStyle = tk[1] >= 2 ? ink : dim;
      ctx.fillRect(x, 0, 1, Math.round(LEN[tk[1]] * (h - 1)));
      if (tk[0] && (tk[1] === 4 || (tk[1] === 3 && pps * 30 >= 70))) { ctx.fillStyle = ink; ctx.fillText(clock(tk[0]), x + 3, h); }
    });
  }
  function secAt(e) {
    var c = S.el.querySelector(".ln-wave"), r = c.getBoundingClientRect(), d = secsOf();
    return d && r.width ? Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * d : null;
  }
  var dragging = false;
  function onWaveDown(e) {
    var t = secAt(e);
    if (t == null || !S.hooks.seek) return;
    dragging = true;
    e.preventDefault();
    S.hooks.seek(S.wname, t);
    setTimeout(paintState, 60);
  }
  function onWaveMove(e) {
    if (!S.el) return;
    var hv = S.el.querySelector(".ln-wavebox .cmp-hover"), c = S.el.querySelector(".ln-wave"), t = secAt(e);
    if (dragging && t != null && S.hooks.seek && S.hooks.current && S.hooks.current() === S.wname && S.hooks.audio) { try { S.hooks.audio.currentTime = t; } catch (x) { /* not yet */ } drawWave(); }
    if (!hv) return;
    if (t == null || e.target !== c && !dragging) { hv.hidden = true; return; }
    var r = c.getBoundingClientRect();
    hv.hidden = false; hv.textContent = clock(t) || "0:00"; hv.style.left = Math.max(0, Math.min(r.width, e.clientX - r.left)) + "px";
  }
  function onWaveUp() { dragging = false; }
  function onResize() { drawWave(); }
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
    pickWave();                                        // HERESY 2022
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
    var cur = h.current ? h.current() : "";           // HERESY 2022: the wave follows the take the player takes up, when it is of the family
    if (S.data && cur && cur !== S.wname && family(cur)) waveOf(cur); else drawWave();
  }
  function onTime() { if (S.el && S.hooks.current && S.hooks.current() === S.wname) drawWave(); }
  function shown(name) {
    S.shown = name;
    if (!S.el) return;
    Array.prototype.forEach.call(S.el.querySelectorAll(".ln-row.is-on"), function (r) { r.classList.remove("is-on"); });
    var li = S.el.querySelector('.ln-li[data-name="' + (window.CSS && CSS.escape ? CSS.escape(name) : name) + '"] .ln-row');
    if (li) li.classList.add("is-on");
    var cur = S.hooks.current ? S.hooks.current() : "";   // HERESY 2022: the take shown, unless the player holds one of the family
    if (!family(cur)) waveOf(name);
  }
  function close() {
    if (!S.el) return;
    S.el.remove();
    S.el = null;
    document.removeEventListener("keydown", onKey, true);
    document.removeEventListener("pointermove", onWaveMove);
    document.removeEventListener("pointerup", onWaveUp);
    window.removeEventListener("resize", onResize);
    dragging = false;
    var a = S.hooks.audio;
    if (a) { a.removeEventListener("play", paintState); a.removeEventListener("pause", paintState); a.removeEventListener("emptied", paintState); a.removeEventListener("timeupdate", onTime); a.removeEventListener("seeked", onTime); }
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
    if (p) { if (h.play) h.play(p.dataset.lnPlay); waveOf(p.dataset.lnPlay); setTimeout(paintState, 60); return; }   // HERESY 2022: its wave on top
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
    S.wname = ""; S.wdata = null;
    var back = document.createElement("div");
    back.className = "cmp-back ln-back";
    back.innerHTML = '<div class="cmp-box ln-box" role="dialog" aria-modal="true" aria-label="' + esc(tr("Family tree")) + '" tabindex="-1">' +
      '<div class="cmp-head"><div class="ln-headtext"><div class="cmp-title">' + esc(tr("Family tree")) + '</div><div class="row-hint ln-hint">' + esc(tr("Asking the lab…")) + "</div></div>" +
      '<div class="ln-acts"><button type="button" class="btn ghost small" data-ln-compare="1" hidden data-tip="' + esc(tr("The family's takes in the compare player, played from the same second (twelve at most there)")) + '"></button>' +
      '<button type="button" class="btn ghost small" data-ln-close="1">' + esc(tr("Close")) + "</button></div></div>" +
      // HERESY 2022: the wave, the whole width, and its ruler
      '<div class="ln-wavehead"><span class="ln-wavename" translate="no"></span><span class="row-hint ln-wavesay"></span></div>' +
      '<div class="cmp-wavebox ln-wavebox"><canvas class="cmp-wave ln-wave" role="slider" aria-label="' + esc(tr("Position")) + '" tabindex="-1" data-tip="' +
      esc(tr("A click plays it from that second")) + '"></canvas><span class="cmp-hover mono" hidden></span></div>' +
      '<canvas class="cmp-ruler ln-ruler" aria-hidden="true"></canvas>' +
      '<ol class="cmp-list ln-list"></ol></div>';
    document.body.appendChild(back);
    S.el = back;
    back.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey, true);
    back.querySelector(".ln-wave").addEventListener("pointerdown", onWaveDown);   // HERESY 2022
    document.addEventListener("pointermove", onWaveMove);
    document.addEventListener("pointerup", onWaveUp);
    window.addEventListener("resize", onResize);
    var a = S.hooks.audio;
    if (a) { a.addEventListener("play", paintState); a.addEventListener("pause", paintState); a.addEventListener("emptied", paintState); a.addEventListener("timeupdate", onTime); a.addEventListener("seeked", onTime); }
    return fetch("/lab/lineage?name=" + encodeURIComponent(name))
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || "HTTP " + r.status); return d; }); })
      .then(function (d) { if (S.name !== name || !S.el) return; S.data = d; paint(d); })
      .catch(function (e) {
        var hn = S.el && S.el.querySelector(".ln-hint");
        if (hn) { hn.textContent = tr("The family tree did not come:") + " " + e.message; hn.classList.add("is-bad"); }
      });
  }
  window.HeresyLineage = { init: function (hooks) { S.hooks = hooks || {}; }, open: open, close: close, repaint: paintState,
    state: function () {
      var w = S.wdata && S.wdata !== "none" ? S.wdata : null;
      return { open: !!S.el, data: S.data, name: S.name, shown: S.shown, rows: S.rows.length, hooks: S.hooks,
               wave: { name: S.wname, state: w ? "drawn" : S.wdata || "asked", n: w ? w.peaks.length : 0, cut: w ? w.cut : 0, over: w ? w.over : 0, places: w ? w.places : 0, flat: w ? w.flat : 0 } };   // HERESY 2022
    } };
})();
