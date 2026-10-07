// HERESY 1041: the Librarian, a fourth tab (Viktor, 01.10.2026): every take as a card or a row,
// searched (wildcards * and ?), filtered (what it is, what is made from it, favourites, hidden),
// sorted, grouped in workspaces (as SUNO has them), selected many at once and acted on together:
// favourite, add to or take from a workspace, hide from the list (not deleted), export as a ZIP,
// move to the trash. The trash lists what went there and gives it back, or empties it when asked;
// an automatic empty after 7, 14 or 28 days runs only once chosen. The lab keeps the marks
// (user/collection.json) and the trash (trash/DATE/TAKE); the takes stay the server's.
(function () {
  "use strict";

  var KINDS = { generated: "generated", imported: "imported", regenerated: "regenerated", rerendered: "re-rendered" };
  var DERIVED = { stems: "stems", debuzz: "debuzz", remaster: "remaster", upscale: "upscale" };
  var VIEW_KEY = "yue2.collView", SORT_KEY = "yue2.collSort", WS_KEY = "yue2.workspace";
  // HERESY 1167 (Viktor: «`Sourced for Regeneration` исключай из выбора как рабочий воркспейс. Даже если в Библиотеке
  // выбрал, генерация у Творца идёт в родительский»): such a section is never the workspace in hand; its parent is
  function workable(w) { var p = String(w || "").split(" / "); return p.length > 1 && p[p.length - 1] === "Sourced for Regeneration" ? p.slice(0, -1).join(" / ") : String(w || ""); }
  function current() { var w = workable(recall(WS_KEY) || ""); return state.ws.indexOf(w) >= 0 ? w : ""; }
  var state = { rows: [], ws: [], trashDays: 0, place: "", q: "", kinds: {}, derived: {}, sel: {}, last: null,
                trash: [], tsel: {}, hooks: null, loaded: false };
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function recall(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function store(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private */ } }
  // HERESY 1057: the studio's own dialogs (heresy-dialog.js)
  function ask(text, opts) { return window.HeresyDialog.confirm(text, opts); }
  // HERESY 1167 (Viktor: «Укорачиваю до… 32 символа макс. Исправь лимиты везде»): 32 characters on each level of a
  // workspace's path (the lab says the same, and takes a name already there as it is)
  var WS_PART = 32;
  function askName(text, value, opts) {
    opts = Object.assign({ max: WS_PART }, opts || {});
    return window.HeresyDialog.prompt(text, value, opts).then(function (v) { return (v || "").trim(); });
  }
  function toast(t, bad) { state.hooks && state.hooks.toast(t, bad ? "bad" : ""); }
  function api(path, body) {
    var opt = body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
    return fetch("/lab" + path, opt).then(function (r) { return r.json().then(function (b) { if (!r.ok && r.status !== 202) throw new Error(b.error || r.status); return b; }); })
      .then(function (b) {
        // HERESY 1168 (Viktor 06.10.2026: «Когда трек "Move to Trash"… и если проигрывается в данный момент, сразу снимай его
        // с проигрыша»): whichever way takes go to the trash (a card's menu, the checked ones, a workspace deleted), the page
        // hears which went
        if (path === "/trash" && body && body.op === "move" && b && b.moved && b.moved.length && state.hooks && state.hooks.trashed) state.hooks.trashed(b.moved);
        return b;
      });
  }

  // "*" any run, "?" one character; without either, a plain substring. Case and accents ignored.
  function fold(s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }
  function matcher(q) {
    q = fold(q.trim());
    if (!q) return function () { return true; };
    if (!/[*?]/.test(q)) return function (s) { return fold(s).indexOf(q) >= 0; };
    var re = new RegExp("^" + q.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$");
    return function (s) { return re.test(fold(s)); };
  }

  // HERESY 1167 (Viktor: «thumbdown не убирает трек из списка»): a catalog asked for before a rating was given and answered
  // after it is only older, not truer: the ratings given since stay as given (the lab has them)
  var rated = {}, rateSeq = 0;
  function remember(name, value) { rated[name] = { v: value, seq: ++rateSeq }; }
  function fresh(rows, asked) {
    (rows || []).forEach(function (r) { var x = rated[r.name]; if (x && x.seq > asked) r.rating = x.v; });
    return rows;
  }
  function load() {
    var asked = rateSeq;
    return api("/catalog").then(function (d) {
      state.rows = fresh(d.takes || [], asked); state.ws = d.workspaces || []; state.trashDays = d.trash_days || 0; state.loaded = true; state.locks = d.locks || {}; state.pins = d.pins || {};
      state.frozen = d.frozen || [];               // HERESY 1166
      var names = {};
      state.rows.forEach(function (r) { names[r.name] = 1; });
      Object.keys(state.sel).forEach(function (n) { if (!names[n]) delete state.sel[n]; });
      paint();
      paintCurrent();
      if (state.hooks.libraryChanged) state.hooks.libraryChanged();
    }).catch(function (e) { $("collGrid").innerHTML = '<p class="row-hint">The Librarian lives in Forge\'s lab, which does not answer: ' + esc(e.message) + "</p>"; });
  }

  // HERESY 1161 (Viktor: «В воркспейсы можно один уровень подразделов? Максимум два»): a section is a workspace named by its
  // path, "Parent / Section"; a place shows its own takes and its sections' (the lab keeps the names; the page the tree)
  var SEP = " / ", DEPTH = 3;
  function wsParts(w) { return String(w).split(SEP); }
  function wsLeaf(w) { var p = wsParts(w); return p[p.length - 1]; }
  var SOURCED = "Sourced for Regeneration";      // HERESY 1162: a section of the replaced, not shown in its parent
  var STUDIO_SECTIONS = { "Sourced for Regeneration": 1, "Refined": 1 };   // HERESY 1165: the sections the studio names (they translate)
  function inTree(r, place) {
    return r.workspaces.some(function (w) { return w === place || (w.indexOf(place + SEP) === 0 && wsLeaf(w) !== SOURCED); });
  }
  function treeOrder(list) {                     // a parent, then its sections, whatever names stand between them
    return list.slice().sort(function (a, b) {
      var A = wsParts(a), B = wsParts(b);
      for (var i = 0; i < Math.min(A.length, B.length); i++) if (A[i] !== B[i]) return A[i] < B[i] ? -1 : 1;
      return A.length - B.length;
    });
  }
  // HERESY 1166 (Viktor: «Деактивация воркспейса. Замораживаются все треки в этом представлении, никаких действий по ним,
  // в `All Workspaces` и в поиске не отображаются. Сам деактивированный воркспейс немного засЕривается»): a take frozen with
  // its workspace (the lab says which: in no workspace that is not frozen) shows only inside it, greyed, heard and read
  // HERESY 1167 (Viktor: «как в SUNO… дизлайк прятал трек, не удаляя»): a disliked take leaves the lists unless this says
  // show them (the Librarian's box, the column's ⋯: one setting); the 👎 chip shows them whatever it says
  var DISLIKED_KEY = "yue2.showDisliked";
  function showDis() { return recall(DISLIKED_KEY) === "1"; }
  // HERESY 1167 (Viktor: «В Библиотеке переход по воркспейсам не синхронизирует выбор в баре»): a workspace opened here is
  // the one in hand in the bar too (new takes land in it, the rooms' column shows it); All Workspaces is All again; the
  // studio's own views and a frozen workspace leave the bar as it is
  function openPlace(place) {
    state.place = place; state.sel = {};
    var ws = place === "" || (place.charAt(0) !== "_" && state.ws.indexOf(place) >= 0 && !frozenWs(place));
    if (ws && (recall(WS_KEY) || "") !== place) {
      store(WS_KEY, place);
      paintCurrent();
      if (state.hooks.libraryChanged) state.hooks.libraryChanged();
    }
  }
  function frozenWs(w) { return (state.frozen || []).some(function (f) { return w === f || String(w).indexOf(f + SEP) === 0; }); }
  function iceHere(r) { return !r.frozen || (!!state.place && state.place.charAt(0) !== "_" && frozenWs(state.place)); }
  function shown() {
    var m = matcher(state.q), anyDer = Object.keys(state.derived).length;
    var rows = state.rows.filter(function (r) {
      if (!iceHere(r)) return false;               // HERESY 1166
      if (state.place === "__fav" && !r.favorite) return false;
      if (state.place === "__pinned" && !pinnedAll()[r.name]) return false;   // HERESY 1105
      if (state.place === "__none" && r.workspaces.length) return false;   // HERESY 1058
      if (state.place === "__hidden") { if (!r.hidden) return false; }
      else if (r.hidden) return false;
      if (r.rating < 0 && !showDis() && !state.kinds.__disliked) return false;   // HERESY 1167
      if (state.place && state.place.charAt(0) !== "_" && !inTree(r, state.place)) return false;   // its sections too (1161)
      if (state.kinds.__liked && !(r.rating > 0)) return false;
      if (state.kinds.__disliked && !(r.rating < 0)) return false;
      if (state.kinds.__starred && !r.favorite) return false;   // HERESY 1168: the favourites, where you are
      var realKinds = Object.keys(state.kinds).filter(function (k) { return k.charAt(0) !== "_"; });
      if (realKinds.length && !state.kinds[r.kind]) return false;
      if (anyDer && !r.derived.some(function (k) { return state.derived[k]; })) return false;
      // HERESY 1167: a take's workspaces and sections are searched too (a section's name finds its takes)
      return m(r.title) || m(r.name) || (r.note && m(r.note)) || r.workspaces.some(function (w) { return m(w); });
    });
    var sort = recall(SORT_KEY) || "new";
    rows.sort(function (a, b) {
      if (sort === "old") return (a.created || 0) - (b.created || 0);
      if (sort === "title") return fold(a.title).localeCompare(fold(b.title));
      if (sort === "long") return (b.seconds || 0) - (a.seconds || 0);
      return (b.created || 0) - (a.created || 0);
    });
    return rows;
  }

  function paintSide() {
    var counts = { "": 0, __fav: 0, __hidden: 0, __none: 0 }, perWs = {};
    state.rows.forEach(function (r) {
      if (r.hidden) { counts.__hidden++; return; }
      if (!r.frozen) { counts[""]++; if (r.favorite) counts.__fav++; }   // HERESY 1166: a frozen take only in its own
      if (!r.workspaces.length) counts.__none++;
      var once = {};                                 // HERESY 1161: a take counted once in a parent, from any of its sections
      r.workspaces.forEach(function (w) {
        var parts = wsParts(w), from = wsLeaf(w) === SOURCED ? parts.length : 1;   // 1162: the replaced count in their section only
        for (var i = from; i <= parts.length; i++) { var a = parts.slice(0, i).join(SEP); if (!once[a]) { once[a] = 1; perWs[a] = (perWs[a] || 0) + 1; } }
      });
    });
    // HERESY 1165: a workspace's name is the user's, kept as typed in every language; the studio's own places translate
    var item = function (key, label, n, own) {
      return '<button type="button" class="coll-place' + (state.place === key ? " is-on" : "") + '" data-place="' + esc(key) + '"><span' + (own ? ' translate="no"' : "") + ">" + esc(label) +
        '</span><span class="coll-n">' + (n === undefined ? "" : n) + "</span></button>";
    };
    var pinAll = pinnedAll(), pinN = state.rows.filter(function (r) { return pinAll[r.name] && !r.hidden && !r.frozen; }).length;
    $("collSide").innerHTML = item("", "All Workspaces", counts[""]) + item("__fav", "★ Favourites", counts.__fav) +
      item("__pinned", "\ud83d\udccc Pinned", pinN) +
      item("__none", "Not in a workspace", counts.__none) +
      '<div class="coll-cap">Workspaces</div>' + treeOrder(state.ws).map(function (w) {
        var ice = frozenWs(w) ? '<span class="coll-ice" title="Frozen: its takes are heard, never changed">\u2744</span>' : "";   // HERESY 1166
        var lk = (state.locks || {})[w] || {}, lock = ice + (lk.workspace || lk.tracks ?   // HERESY 1070
          '<span class="coll-lock" title="' + (lk.workspace ? "the workspace is locked against deletion" : "") + (lk.workspace && lk.tracks ? "; " : "") + (lk.tracks ? "its takes are locked against deletion" : "") + '">\ud83d\udd12</span>' : "");
        var depth = wsParts(w).length;               // a section: its own name, indented under its parent (1161)
        return item(w, depth > 1 ? wsLeaf(w) : w, perWs[w] || 0, depth < 2 || !STUDIO_SECTIONS[wsLeaf(w)]).replace('class="coll-place', 'class="coll-place' + (depth > 1 ? " is-sub d" + depth : "") + (frozenWs(w) ? " is-frozen" : ""))
          .replace('<span class="coll-n">', lock + '<span class="coll-ws-more" data-ws-menu="' + esc(w) + '" title="Rename, delete, lock, a section…" role="button">\u22ef</span><span class="coll-n">');
      }).join("") +
      '<button type="button" class="coll-place coll-new" data-ws-new="1">+ New workspace</button>' +
      '<button type="button" class="coll-place coll-new coll-hub" data-ws-hub="1">\ud83d\udc8e From Hugging Face\u2026</button>' +   // HERESY 1166
      '<div class="coll-cap">Out of sight</div>' + item("__hidden", "Hidden", counts.__hidden) + item("__trash", "Trash", state.trash.length || undefined);
    fitSide();
  }

  // HERESY 1127: the workspaces column scrolls on its own. Sticky and taller than the window, it never showed what lies
  // below (Hidden, Trash) unless the page was zoomed out; now it ends above the server log and the player, measured
  // from where it stands (it climbs to its sticky top as the room scrolls), again on every resize and zoom.
  var sideFrame = 0;
  function fitSide() {
    var side = $("collSide");
    if (!side) return;
    if (!side.offsetParent || getComputedStyle(side).position !== "sticky") { side.style.maxHeight = ""; return; }
    var bottom = window.innerHeight, pb = document.getElementById("playbar"), dock = document.querySelector(".log-dock");
    if (pb && getComputedStyle(pb).display !== "none") bottom = Math.min(bottom, pb.getBoundingClientRect().top);
    var sr = side.getBoundingClientRect(), dr = dock && getComputedStyle(dock).display !== "none" ? dock.getBoundingClientRect() : null;
    if (dr && dr.left < sr.right && dr.right > sr.left) bottom = Math.min(bottom, dr.top);   // the log box only where it is above the column
    side.style.maxHeight = Math.max(160, Math.floor(bottom - side.getBoundingClientRect().top - 10)) + "px";
  }
  function fitSideSoon() { if (!sideFrame) sideFrame = requestAnimationFrame(function () { sideFrame = 0; fitSide(); }); }
  function watchSide() {
    var room = $("collSide").closest("[id^='view-']") || document.getElementById("view-collection");
    window.addEventListener("resize", fitSideSoon);
    if (room) {
      room.addEventListener("scroll", fitSideSoon, { passive: true });
      if (window.ResizeObserver) new ResizeObserver(fitSideSoon).observe(room);   // shown, hidden, the window resized
    }
  }

  function ico(name) { return window.HeresyIcons && window.HeresyIcons.ui ? window.HeresyIcons.ui(name) : ""; }   // HERESY 1051
  // HERESY 1165: the plan mode by the name the form gives it (the card said its raw value, off), so it reads and translates
  function cotWord(c) { return { off: "direct", full: "full plan", melody: "melody only" }[c] || c; }
  function badge(text, cls) { return '<span class="coll-badge ' + (cls || "") + '">' + esc(text) + "</span>"; }

  // HERESY 1082: the Librarian's marks for a take in the Creator's column: derived, workspaces, like, dislike, note
  function cardExtras(name) {
    var r = rowOf(name);
    if (!r) return "";
    return '<div class="take-extra"><span class="coll-badges">' + r.derived.map(function (k) { return badge(DERIVED[k] || k, "d"); }).join("") +
      r.workspaces.map(function (w) { return badge(w, "w"); }).join("") + "</span>" +
      '<span class="take-rate"><button type="button" class="coll-act" data-lrate="1" data-name="' + esc(name) + '" aria-pressed="' + (r.rating > 0) + '" title="Like">' + ico("like") + "</button>" +
      '<button type="button" class="coll-act" data-lrate="-1" data-name="' + esc(name) + '" aria-pressed="' + (r.rating < 0) + '" title="Dislike">' + ico("dislike") + "</button>" +
      // HERESY 1167 (Viktor: «У Творца во фрейме Takes… И нет звёздочки»): the favourite beside them, as on the Librarian's cards
      '<button type="button" class="coll-act fav" data-lfav="1" data-name="' + esc(name) + '" aria-pressed="' + favOf(name, r) + '" title="Favourite">' + ico("star") + "</button>" +
      (r.note ? '<span class="coll-act coll-hasnote" aria-label="Has a note">' + ico("note") + "</span>" : "") + "</span></div>";
  }
  function favOf(name, r) { var t = state.hooks && state.hooks.findTake ? state.hooks.findTake(name) : null; return t ? !!t.favorite : !!r.favorite; }

  // HERESY 1166: a frozen card's check, rename and actions answer nothing; its play button and its title still do
  function iceCards() {
    Array.prototype.forEach.call($("collGrid").querySelectorAll(".coll-card.is-frozen"), function (c) {
      c.setAttribute("draggable", "false");
      Array.prototype.forEach.call(c.querySelectorAll(".coll-check input, .coll-ren, .coll-act"), function (b) { b.disabled = true; });
    });
  }
  function paint() {
    paintSide();
    var trash = state.place === "__trash";
    $("collBar").hidden = trash; $("collTrashBar").hidden = !trash; $("collSlot").hidden = trash; $("collHeadTools").hidden = trash;
    if (trash) return paintTrash();
    var rows = shown(), view = recall(VIEW_KEY) || "tiles";
    $("collGrid").className = "coll-grid " + view;
    Array.prototype.forEach.call(document.querySelectorAll("[data-coll-view]"), function (b) { b.classList.toggle("is-on", b.dataset.collView === view); });
    // HERESY 1167: whole rows, about thirty cards at a time; a repaint keeps as many as were shown, a new view starts anew
    var per = perRow(), sig = viewSig();
    if (sig !== LAZY.sig) { LAZY.sig = sig; LAZY.shown = batch(); }
    LAZY.shown = Math.max(batch(), Math.ceil(LAZY.shown / per) * per);
    LAZY.rows = rows;
    $("collGrid").innerHTML = rows.length ? rows.slice(0, LAZY.shown).map(cardHtml).join("")
      : '<p class="row-hint coll-empty">Nothing here' + (state.q ? " for “" + esc(state.q) + "”" : "") + ".</p>";
    moreWatch();
    iceCards();                                    // HERESY 1166: a frozen card's controls off
    paintHead(rows);
  }
  // the next whole rows, as the end of the list nears (the sentinel under the grid in sight, or nearly)
  var LAZY = { shown: 0, sig: "", rows: [], io: null };
  function perRow() {
    var g = $("collGrid"), cs = getComputedStyle(g), tpl = cs.gridTemplateColumns || "";
    if (cs.display !== "grid" || !tpl || tpl === "none") return 1;
    var m = /repeat\((\d+)/.exec(tpl);           // a hidden grid answers with its rule, not its columns
    return Math.max(1, m ? +m[1] : tpl.split(" ").filter(Boolean).length);
  }
  function batch() { var n = perRow(); return n * Math.ceil(30 / n); }
  function viewSig() {
    return [state.place, state.q, JSON.stringify(state.kinds), JSON.stringify(state.derived), recall(SORT_KEY) || "new", recall(VIEW_KEY) || "tiles"].join("|");
  }
  function moreWatch() {
    var g = $("collGrid"), s = $("collMore");
    if (!s) {
      s = document.createElement("div");
      s.id = "collMore"; s.className = "coll-more"; s.setAttribute("aria-hidden", "true");
      g.insertAdjacentElement("afterend", s);
    }
    s.hidden = LAZY.shown >= LAZY.rows.length;
    if (!LAZY.io && window.IntersectionObserver) {
      LAZY.io = new IntersectionObserver(function (es) { if (es.some(function (x) { return x.isIntersecting; })) more(); }, { rootMargin: "0px 0px 900px 0px" });
      LAZY.io.observe(s);
    }
  }
  function more() {
    var s = $("collMore");
    if (!s || s.hidden || state.place === "__trash" || LAZY.shown >= LAZY.rows.length) return;
    var from = LAZY.shown;
    LAZY.shown = Math.min(LAZY.rows.length, from + batch());
    $("collGrid").insertAdjacentHTML("beforeend", LAZY.rows.slice(from, LAZY.shown).map(cardHtml).join(""));
    iceCards();
    s.hidden = LAZY.shown >= LAZY.rows.length;
    requestAnimationFrame(function () {           // still in sight (a short batch, a tall window): the next one too
      var b = s.getBoundingClientRect();
      if (!s.hidden && b.top < innerHeight + 900 && b.width) more();
    });
  }
  // a take to reveal: the rows up to it brought in first
  function bringIn(name) {
    var i = LAZY.rows.map(function (r) { return r.name; }).indexOf(name), per = perRow();
    if (i >= LAZY.shown) { LAZY.shown = (Math.ceil((i + 1) / per) + 1) * per; paint(); }
  }
  function cardHtml(r) {
    var clock = state.hooks.clock, ago = state.hooks.ago;
    {
      var sel = !!state.sel[r.name], now = state.hooks.playing ? state.hooks.playing() : {};
      var mine = now.name === r.name;
      var art = window.HeresyArt ? window.HeresyArt.url(r.name) : "";   // HERESY 1154: beside the title, not in the play button
      return '<article class="coll-card' + (sel ? " is-sel" : "") + (r.hidden ? " is-hidden-take" : "") + (r.frozen ? " is-frozen" : "") + (r.fresh ? " is-fresh" : "") + (window.HeresyRegen && window.HeresyRegen.has(r.name) ? " is-regenerating" : "") + (mine ? " is-current" : "") + (mine && now.playing ? " is-sounding" : "") + (art ? " has-art" : "") + '" data-name="' + esc(r.name) + '" draggable="true">' +
        '<label class="coll-check"><input type="checkbox" data-sel="' + esc(r.name) + '"' + (sel ? " checked" : "") + ' aria-label="Select" /></label>' +
        '<button type="button" class="coll-play' + (mine && now.playing ? " is-playing" : "") + '" data-play="' + esc(r.name) + '" aria-label="' + (mine && now.playing ? "Pause" : "Play") + '">' + ico(mine && now.playing ? "pause" : "play") + "</button>" +
        '<div class="coll-body"><div class="coll-title"><span class="coll-title-text" data-open="' + esc(r.name) + '">' + esc(r.title) + "</span>" +
        '<button type="button" class="coll-ren" data-ren="' + esc(r.name) + '" title="Rename" aria-label="Rename">✎</button></div>' +
        // HERESY 1165: each piece its own text, so the words among the numbers translate (heresy-i18n.js matches whole texts)
        '<div class="coll-meta"><span>' + esc(r.created ? ago(r.created) : "") + "</span>" + (r.seconds ? " · <span>" + clock(r.seconds) + "</span>" : "") + (r.cot ? " · <span>" + esc(cotWord(r.cot)) + "</span>" : "") + "</div>" +
        '<div class="coll-badges">' + badge(KINDS[r.kind] || r.kind, "k-" + r.kind) + r.derived.map(function (k) { return badge(DERIVED[k] || k, "d"); }).join("") +
        r.workspaces.map(function (w) { return badge(w, "w"); }).join("") +
        // HERESY 1162: what it was made again from, on its card
        (r.regen_of ? '<span class="coll-badge rg" data-tip="Regenerated with a new seed from ' + esc(r.regen_of) + '">regen</span>' : "") + "</div>" +
        "</div>" +
        // HERESY 1155 (Viktor: «Не уходим из студии в другие окна и вкладки, если не нужно»): the whole picture over the page
        (art ? '<button type="button" class="coll-art" data-art="' + esc(r.name) + '" style="background-image:url(&quot;' + esc(art) + '&quot;)" data-tip="The artwork: see it whole" aria-label="The artwork"></button>' : "") +
        // HERESY 1048: like, dislike, favourite, Post and the menu, on the card itself
        '<div class="coll-acts"><button type="button" class="coll-act" data-crate="1" aria-pressed="' + (r.rating > 0) + '" title="Like">' + ico("like") + '</button>' +
        '<button type="button" class="coll-act" data-crate="-1" aria-pressed="' + (r.rating < 0) + '" title="Dislike">' + ico("dislike") + '</button>' +
        '<button type="button" class="coll-act fav" data-cfav="1" aria-pressed="' + r.favorite + '" title="Favourite">' + ico("star") + "</button>" +
        '<button type="button" class="coll-act post" data-cgo="post" title="Load into the Refiner">Refine</button>' +
        '<button type="button" class="coll-act" data-cmenu="1" title="More (or right-click the card)" aria-label="More">\u22ef</button>' +
        // HERESY 1058: a note is a mark at the row's end (its words on hover, the sheet to edit), so cards keep one height
        (r.note ? '<button type="button" class="coll-act coll-hasnote" data-open="' + esc(r.name) + '" aria-label="Has a note">' + ico("note") + "</button>"
                : '<span class="coll-act coll-nonote" aria-hidden="true"></span>') + "</div></article>";
    }
  }
  function paintHead(rows) {
    // HERESY 1098 (Viktor, 02.10.2026): the heading says which collection is open, then what it holds
    var placeName = { "": "All Workspaces", __fav: "Favourites", __pinned: "Pinned", __none: "Not in a workspace", __hidden: "Hidden" }[state.place];
    // HERESY 1165: the studio's places translate; a workspace's name is kept as typed (its studio-made sections translate)
    $("collWhere").innerHTML = " \u203a " + (placeName ? "<span>" + esc(placeName) + "</span>" : wsParts(state.place).map(function (p, i) {
      return "<span" + (i && STUDIO_SECTIONS[p] ? "" : ' translate="no"') + ">" + esc(p) + "</span>";
    }).join(SEP));
    var inPlace = state.rows.filter(function (r) {
      if (state.place === "__fav") return r.favorite && !r.hidden;
      if (state.place === "__pinned") return !!pinnedAll()[r.name] && !r.hidden;
      if (state.place === "__none") return !r.workspaces.length && !r.hidden;
      if (state.place === "__hidden") return r.hidden;
      if (state.place) return !r.hidden && inTree(r, state.place);     // HERESY 1161: with its sections
      return !r.hidden;
    }).filter(iceHere);                            // HERESY 1166: frozen takes count only in their own workspace
    var secs = inPlace.reduce(function (s, r) { return s + (r.seconds || 0); }, 0), hm = function (t) { var h = Math.floor(t / 3600), m = Math.round(t % 3600 / 60); return h ? h + " h " + m + " min" : m + " min"; };
    var count = function (f) { return inPlace.filter(f).length; }, kinds = {};
    inPlace.forEach(function (r) { kinds[r.kind] = (kinds[r.kind] || 0) + 1; });
    var parts = [inPlace.length + " take" + (inPlace.length === 1 ? "" : "s") + (rows.length !== inPlace.length ? " (" + rows.length + " shown)" : ""), hm(secs)];
    var kindsSaid = Object.keys(kinds).sort(function (a, b) { return kinds[b] - kinds[a]; }).map(function (k) { return kinds[k] + " " + (KINDS[k] || k); });
    var liked = count(function (r) { return r.rating > 0; }), disliked = count(function (r) { return r.rating < 0; }), fav = count(function (r) { return r.favorite; }), notes = count(function (r) { return r.note; });
    if (liked) parts.push(liked + " liked"); if (disliked) parts.push(disliked + " disliked"); if (fav) parts.push(fav + " \u2605"); if (notes) parts.push(notes + " with a note");
    parts.push(kindsSaid);
    parts.push(state.rows.length + " in the library");
    // HERESY 1166: every piece its own text, so each translates (the kinds of take as a list of their own)
    $("collNote").innerHTML = parts.filter(function (p) { return p && p.length; }).map(function (p) {
      return Array.isArray(p) ? p.map(function (k) { return "<span>" + esc(k) + "</span>"; }).join(", ") : "<span>" + esc(p) + "</span>";
    }).join(" \u00b7 ");
    paintBulk(rows);
  }

  // HERESY 1103: the pinned takes of the place in hand, small, in their own tone; four at most
  function pinsHere() {
    return ((state.pins || {})[state.place] || []).map(rowOf).filter(Boolean);
  }
  function paintPins() {
    var el = $("collPins"), list = pinsHere(), now = state.hooks.playing ? state.hooks.playing() : {};
    el.innerHTML = list.length ? list.map(function (r) {
      var on = now.name === r.name && now.playing;
      return '<div class="coll-pin" data-name="' + esc(r.name) + '"><button type="button" class="coll-play' + (on ? " is-playing" : "") + '" data-play="' + esc(r.name) + '" aria-label="' + (on ? "Pause" : "Play") + '">' + ico(on ? "pause" : "play") + "</button>" +
        '<div class="coll-pin-body"><span class="coll-title-text" data-open="' + esc(r.name) + '">' + esc(r.title) + '</span><span class="coll-meta"><span>' + esc(state.hooks.ago(r.created)) + "</span>" +
        (r.seconds ? " \u00b7 <span>" + state.hooks.clock(r.seconds) + "</span>" : "") + "</span></div>" +
        '<button type="button" class="coll-unpin" data-unpin="' + esc(r.name) + '" aria-label="Unpin" data-tip="Unpin">\u00d7</button></div>';
    }).join("") : '<p class="row-hint coll-pins-hint">' + (state.place === "__pinned" ? "Every take pinned in any workspace is below; each workspace shows its own four in this strip."
      : "Pin up to four takes of this place here: right-click a take \u2192 Pin here.") + '</p>';
  }
  function markFavorite(name, on) {              // HERESY 1105: a favourite set elsewhere, shown here without asking the lab
    var r = rowOf(name);
    if (r && r.favorite !== on) { r.favorite = on; paint(); }
  }
  function pinnedAll() {                         // HERESY 1105: every take pinned anywhere
    var all = {};
    Object.keys(state.pins || {}).forEach(function (k) { (state.pins[k] || []).forEach(function (n) { all[n] = 1; }); });
    return all;
  }
  // HERESY 1166 (Viktor: «И в меню нет Unpin»): the Pinned view is no workspace, so its menu had no Unpin; there a take
  // comes out of every strip it stands in
  function pinPlaces(name) {
    return Object.keys(state.pins || {}).filter(function (k) { return (state.pins[k] || []).indexOf(name) >= 0; });
  }
  function unpinAll(name) {
    return pinPlaces(name).reduce(function (p, k) {
      return p.then(function (ok) { return ok && act({ op: "pin", place: k, on: false, names: [name] }, null, true); });
    }, Promise.resolve(true)).then(function (ok) { if (ok) toast("Unpinned"); return ok; });
  }
  function pin(name, on) {
    // HERESY 1105: seen at once, then said by the lab (a far lab answers a second later); a refusal puts it back
    var key = state.place, before = ((state.pins || {})[key] || []).slice();
    if (!on) {
      state.pins = state.pins || {};
      state.pins[key] = before.filter(function (n) { return n !== name; });
      paint();
    }
    return act({ op: "pin", place: key, on: !!on, names: [name] }, on ? "Pinned here" : "Unpinned").then(function (ok) {
      if (!ok) { state.pins[key] = before; paint(); }
      return ok;
    });
  }
  // HERESY 1167 (Viktor: «в Takes на мышечное меню… `Pin in it's (sub)workspace` добавить, если лимит по пинам не
  // достигнут»): the strip a take is pinned into from a room's column: the workspace in hand when the take is in it, else
  // its section under the one in hand, else its first own; never a frozen one, never «Sourced for Regeneration»
  var PINS_MAX = 4;   // the lab's PINS_MAX, Viktor's number
  function pinTarget(name) {
    var r = rowOf(name);
    if (!r) return null;
    var cur = current(), own = (r.workspaces || []).filter(function (w) { return !frozenWs(w) && workable(w) === w; });
    var place = own.indexOf(cur) >= 0 ? cur : own.filter(function (w) { return cur && w.indexOf(cur + SEP) === 0; })[0] || own[0];
    if (!place) return null;
    var have = (state.pins || {})[place] || [];
    return { place: place, pinned: have.indexOf(name) >= 0, count: have.length, max: PINS_MAX };
  }
  function pinIn(name, place, on) {
    var before = ((state.pins || {})[place] || []).slice();
    return act({ op: "pin", place: place, on: !!on, names: [name] }, (on ? "Pinned in \u201c" : "Unpinned from \u201c") + place + "\u201d").then(function (ok) {
      if (!ok) { state.pins = state.pins || {}; state.pins[place] = before; paint(); }
      return ok;
    });
  }
  function paintBulk(rows) {
    var n = Object.keys(state.sel).length;
    $("collBulk").hidden = !n;
    $("collPins").hidden = !!n;
    if (!n) paintPins();
    $("collSelCount").textContent = n + " selected";
    $("collWsMove").innerHTML = '<option value="">Move to workspace…</option>' + state.ws.filter(function (w) { return w !== state.place; }).map(function (w) { return '<option translate="no">' + esc(w) + "</option>"; }).join("") +
      '<option value="__new">+ a new one…</option>';
    $("collWsPick").innerHTML = '<option value="">Add to workspace…</option>' + state.ws.map(function (w) { return '<option translate="no">' + esc(w) + "</option>"; }).join("") +
      '<option value="__new">+ a new one…</option>';
    $("collHide").textContent = state.place === "__hidden" ? "Show again" : "Hide";
    $("collWsOut").hidden = !state.place || state.place.charAt(0) === "_";
  }

  function paintTrash() {
    var clock = state.hooks.clock;
    $("collTrashDays").value = String(state.trashDays || 0);
    $("collWhere").innerHTML = " \u203a <span>Trash</span>";   // HERESY 1165: the word its own text
    $("collNote").innerHTML = "<span>" + state.trash.length + " in the trash</span> · <span>" + (state.trash.reduce(function (s, i) { return s + i.bytes; }, 0) / 1e9).toFixed(2) + " GB</span>";   // HERESY 1166
    $("collGrid").className = "coll-grid list";
    var nsel = Object.keys(state.tsel).length;             // HERESY 1058: the button says what it will do
    $("collEmpty").textContent = nsel ? "Delete " + nsel + " for good" : "Wipe out the trash";
    $("collEmpty").disabled = !state.trash.length;
    $("collRestore").disabled = !nsel;
    $("collGrid").innerHTML = state.trash.length ? state.trash.map(function (it) {
      var key = it.day + "/" + it.name, sel = !!state.tsel[key];
      return '<article class="coll-card' + (sel ? " is-sel" : "") + '"><label class="coll-check"><input type="checkbox" data-tsel="' + esc(key) + '"' + (sel ? " checked" : "") + " /></label>" +
        '<div class="coll-body"><div class="coll-title" translate="no">' + esc(it.title) + '</div><div class="coll-meta"><span>in the trash since ' + esc(it.day) + "</span>" +
        (it.seconds ? " · <span>" + clock(it.seconds) + "</span>" : "") + " · <span>" + (it.bytes / 1e6).toFixed(0) + " MB</span></div></div></article>";
    }).join("") : '<p class="row-hint coll-empty">The trash is empty.</p>';
  }

  function loadTrash() {
    return api("/trash").then(function (d) { state.trash = d.items || []; state.tsel = {}; paint(); });
  }

  function names() { return Object.keys(state.sel); }

  // HERESY 1101: a card checked or unchecked by a click on it (Shift: the whole range from the last one)
  function toggleCard(name, range) {
    var rows = shown(), i = rows.findIndex(function (r) { return r.name === name; }), on = !state.sel[name];
    if (i < 0 || rows[i].frozen) return;           // HERESY 1166: a frozen take is not checked
    if (range && state.last !== null) {
      var a = Math.min(state.last, i), b = Math.max(state.last, i);
      for (var k = a; k <= b; k++) if (on && !rows[k].frozen) state.sel[rows[k].name] = 1; else delete state.sel[rows[k].name];
    } else if (on) state.sel[name] = 1; else delete state.sel[name];
    state.last = i;
    paint();
  }

  // HERESY 1101: the rubber band. A drag that starts on the grid's empty space draws it and checks what it
  // touches (instead of what was checked; with Ctrl, in addition); Ctrl+drag starts it on a card too. Near the
  // top or bottom edge the page scrolls on, and the band keeps its corner in the content, not on the screen.
  var band = { on: false, ate: false, x0: 0, y0: 0, base: null, el: null, scroller: null, raf: 0, mx: 0, my: 0 };
  function scrollerOf(el) {
    for (var e = el.parentElement; e && e !== document.body; e = e.parentElement) {
      var o = getComputedStyle(e).overflowY;
      if ((o === "auto" || o === "scroll") && e.scrollHeight > e.clientHeight) return e;
    }
    return document.scrollingElement || document.documentElement;
  }
  function bandStart(e) {
    if (e.button !== 0 || state.place === "__trash") return;
    var onCard = e.target.closest(".coll-card[data-name]");
    if (onCard && !e.ctrlKey) return;
    if (e.target.closest("button, input, a, select, textarea, .coll-title-edit") && !e.ctrlKey) return;
    band.scroller = scrollerOf($("collGrid"));
    band.x0 = e.clientX; band.y0 = e.clientY + band.scroller.scrollTop; band.mx = e.clientX; band.my = e.clientY;
    band.base = e.ctrlKey ? Object.assign({}, state.sel) : {};
    band.toggle = !!e.ctrlKey;                        // HERESY 1108: Ctrl toggles what the band crosses
    band.on = "armed";
    e.preventDefault();                               // no text selection while dragging
    document.addEventListener("mousemove", bandMove);
    document.addEventListener("mouseup", bandEnd, { once: true });
  }
  function bandMove(e) {
    band.mx = e.clientX; band.my = e.clientY;
    if (band.on === "armed") {
      if (Math.abs(e.clientX - band.x0) + Math.abs(e.clientY + band.scroller.scrollTop - band.y0) < 6) return;
      band.on = true; hidePeek();
      band.el = document.createElement("div"); band.el.className = "coll-band"; document.body.appendChild(band.el);
      band.raf = requestAnimationFrame(bandTick);
    }
  }
  function bandTick() {
    if (band.on !== true) return;
    var sc = band.scroller, top = sc === document.scrollingElement ? 0 : sc.getBoundingClientRect().top;
    var bottom = sc === document.scrollingElement ? innerHeight : sc.getBoundingClientRect().bottom;
    if (band.my < top + 32) sc.scrollTop -= 14; else if (band.my > bottom - 32) sc.scrollTop += 14;
    var y0 = band.y0 - sc.scrollTop, x1 = band.mx, y1 = band.my;
    var L = Math.min(band.x0, x1), T = Math.min(y0, y1), R = Math.max(band.x0, x1), B = Math.max(y0, y1);
    band.el.style.cssText = "left:" + L + "px;top:" + T + "px;width:" + (R - L) + "px;height:" + (B - T) + "px";
    var picked = Object.assign({}, band.base);
    Array.prototype.forEach.call(document.querySelectorAll("#collGrid .coll-card[data-name]"), function (c) {
      var r = c.getBoundingClientRect(), hit = r.right > L && r.left < R && r.bottom > T && r.top < B;
      if (hit) { if (band.toggle && band.base[c.dataset.name]) delete picked[c.dataset.name]; else picked[c.dataset.name] = 1; }
      c.classList.toggle("is-sel", !!picked[c.dataset.name]);
      var box = c.querySelector("[data-sel]"); if (box) box.checked = !!picked[c.dataset.name];
    });
    band.picked = picked;
    band.raf = requestAnimationFrame(bandTick);
  }
  function bandEnd() {
    document.removeEventListener("mousemove", bandMove);
    cancelAnimationFrame(band.raf);
    if (band.on === true) {
      state.sel = band.picked || band.base; band.ate = true;
      setTimeout(function () { band.ate = false; }, 0);   // only the click this mouseup makes
      if (band.el) band.el.remove();
      paint();
    }
    band.on = false; band.el = null; band.picked = null;
  }

  // HERESY 1101: a move into one workspace, for the menu on a card (the selection when the card is in it)
  function moveTo(w, list, fromHere) {
    var from = fromHere && state.place && state.place.charAt(0) !== "_" ? state.place : "", n = list.length;
    return act({ op: "ws-move", workspace: w, from: from, names: list }, n + " moved to “" + w + "”" + (from ? " (out of “" + from + "”)" : " (out of every other workspace)"))
      .then(function (ok) { if (ok) { list.forEach(function (k) { delete state.sel[k]; }); paint(); } return ok; });
  }

  // the workspace in hand (the header): the list shows it, new takes land in it
  function paintCurrent() {
    var btn = $("wsCurrent");
    if (!btn) return;
    var cur = current(), name = btn.querySelector(".ws-btn-name");
    name.textContent = cur || "Choose a workspace";
    name.setAttribute("translate", cur ? "no" : "yes");                    // a name is the user's; the call is the page's
    btn.classList.toggle("is-set", !!cur);
    btn.classList.toggle("is-none", !cur && state.loaded);
    btn.closest(".ws-current").classList.toggle("is-set", !!cur);
  }
  // HERESY 1167 (Viktor: «кликаешь на него... и вуаля. И предупреждение, что все новые семплы идут в него»): every workspace
  // and its sections in the studio's own dialog, one click picks; a new workspace, or a section of the one in hand, made from
  // there. The frozen and the «Sourced for Regeneration» sections are not offered: nothing new lands in them. why: the
  // question, when a run asks first.
  function chooseCurrent(why) {
    var cur = current();
    var items = state.ws.filter(function (w) { return !frozenWs(w) && wsLeaf(w) !== SOURCED; }).map(function (w) {
      var n = state.rows.filter(function (r) { return inTree(r, w); }).length;
      return { value: w, label: wsParts(w).length > 1 ? wsLeaf(w) : w, depth: wsParts(w).length - 1, current: w === cur, note: String(n) };
    });
    var more = [{ label: "+ New workspace\u2026", value: "__new" }];
    if (cur && wsParts(cur).length < DEPTH) more.push({ label: "+ New section of \u201c" + wsLeaf(cur) + "\u201d\u2026", value: "__section" });
    var text = (why || "The workspace in hand") + "\n\nEvery new take lands in it, and the Takes column shows it.";
    return window.HeresyDialog.choose(text, items, { more: more, cancel: why ? "Send nothing" : "Cancel", filter: "Filter the workspaces" }).then(function (v) {
      if (v === "__new" || v === "__section") {
        var parent = v === "__section" ? cur : "";
        return askName(parent ? "A new section of \u201c" + parent + "\u201d\n\nIt is in hand at once: new takes land in it."
                              : "A new workspace\n\nIt is in hand at once: new takes land in it.", "", { ok: "Make it", placeholder: "its name" }).then(function (name) {
          name = String(name || "").replace(/\s*\/\s*/g, " ").trim();
          if (!name) return why ? chooseCurrent(why) : "";
          var w = parent ? parent + SEP + name : name;
          return act({ op: "ws-create", workspace: w }, (parent ? "Section" : "Workspace") + " \u201c" + name + "\u201d made and in hand: new takes land in it").then(function (ok) {
            if (!ok) return why ? chooseCurrent(why) : "";
            setCurrent(w, true);
            return w;
          });
        });
      }
      if (v) setCurrent(v);
      return v || "";
    });
  }
  function setCurrent(w, quiet) {
    store(WS_KEY, w || "");
    if (!quiet && w) toast("Workspace \u201c" + w + "\u201d in hand: the list shows it, new takes land in it");
    state.place = w || ""; state.sel = {};
    paint(); paintCurrent();
    if (state.hooks.libraryChanged) state.hooks.libraryChanged();
  }
  function landed(takeNames) {
    var cur = current();
    if (!cur || !takeNames || !takeNames.length) return;
    var asked = rateSeq;
    api("/collection", { op: "ws-add", workspace: cur, names: takeNames }).then(function (d) {
      state.rows = d.takes ? fresh(d.takes, asked) : state.rows;
      if (state.hooks.libraryChanged) state.hooks.libraryChanged();
    }).catch(function () { /* the take is in the library anyway */ });
  }
  function inCurrent(name) {
    var cur = current();
    if (!cur) return true;
    return state.rows.some(function (r) { return r.name === name && inTree(r, cur); });   // HERESY 1161: with its sections
  }
  // ---- HERESY 1135: undo, as a file manager has it. The last move, pin, hide, adding or taking out, marking or
  // trashing in the Librarian goes back: the pill's Undo, or Ctrl+Z, for ten seconds after.
  var undoState = { fn: null, timer: 0 };
  function undoable(text, fn) {
    var el = $("collUndo");
    if (!el) {
      el = document.createElement("div"); el.id = "collUndo"; el.className = "coll-undo"; el.hidden = true; el.setAttribute("role", "status");
      el.innerHTML = '<span class="coll-undo-text"></span><button type="button" class="btn ghost small">Undo <kbd>Ctrl+Z</kbd></button>';
      document.body.appendChild(el);
      el.querySelector("button").addEventListener("click", undoLast);
    }
    undoState.fn = fn;
    el.querySelector(".coll-undo-text").textContent = text;
    el.hidden = false;
    clearTimeout(undoState.timer);
    undoState.timer = setTimeout(function () { el.hidden = true; undoState.fn = null; }, 10000);
  }
  function undoLast() {
    var fn = undoState.fn, el = $("collUndo");
    if (!fn) return;
    undoState.fn = null;
    if (el) el.hidden = true;
    Promise.resolve(fn()).then(function () { toast("Undone"); }, function (e) { toast("Not undone: " + (e && e.message || e), true); });
  }
  // the workspaces each take had, given back: out of the ones it gained, into the ones it lost
  function restoreWs(before) {
    var gain = {}, lose = {};
    Object.keys(before).forEach(function (n) {
      var now = (rowOf(n) || { workspaces: [] }).workspaces, was = before[n];
      now.forEach(function (w) { if (was.indexOf(w) < 0) (gain[w] = gain[w] || []).push(n); });
      was.forEach(function (w) { if (now.indexOf(w) < 0) (lose[w] = lose[w] || []).push(n); });
    });
    var steps = Object.keys(gain).map(function (w) { return { op: "ws-remove", workspace: w, names: gain[w] }; })
      .concat(Object.keys(lose).map(function (w) { return { op: "ws-add", workspace: w, names: lose[w] }; }));
    return steps.reduce(function (p, b) { return p.then(function () { return act(b, null, true); }); }, Promise.resolve());
  }
  function undoFor(body) {
    var list = (body.names || []).slice();
    if (body.op === "ws-add" || body.op === "ws-remove" || body.op === "ws-move") {
      var before = {};
      list.forEach(function (n) { var r = rowOf(n); if (r) before[n] = r.workspaces.slice(); });
      return function () { return restoreWs(before); };
    }
    if (body.op === "hide" || body.op === "show") return function () { return act({ op: body.op === "hide" ? "show" : "hide", names: list }, null, true); };
    if (body.op === "pin") return function () { return act({ op: "pin", place: body.place, on: !body.on, names: list }, null, true); };
    return null;
  }
  // a trash move given back: the takes from today's folder of the trash
  function untrash(moved) {
    return function () {
      return api("/trash").then(function (d) {
        var latest = {};
        (d.items || []).forEach(function (it) { if (moved.indexOf(it.name) >= 0 && (!latest[it.name] || it.day > latest[it.name].day)) latest[it.name] = it; });
        var items = Object.keys(latest).map(function (n) { return { day: latest[n].day, name: n }; });
        if (!items.length) throw new Error("they are no longer in the trash");
        return api("/trash", { op: "restore", items: items });
      }).then(function () { if (state.hooks.refreshLibrary) state.hooks.refreshLibrary(); return load(); });
    };
  }
  function act(body, done, quiet) {
    var undo = quiet ? null : undoFor(body), asked = rateSeq;   // what was, read before the change
    return api("/collection", body).then(function (d) {
      state.rows = d.takes ? fresh(d.takes, asked) : state.rows; state.ws = d.workspaces || state.ws; state.trashDays = d.trash_days || 0; state.locks = d.locks || state.locks || {};
      state.pins = d.pins || state.pins || {};
      state.frozen = d.frozen || state.frozen || [];   // HERESY 1166
      if (done) { if (undo) undoable(done, undo); else toast(done); }
      paint();
      paintCurrent();
      if (state.hooks.libraryChanged) state.hooks.libraryChanged();
      return true;
    }).catch(function (e) { toast(e.message, true); return false; });   // true when the lab took it
  }

  // HERESY 1166 (Viktor 04.10.2026: «Воркспейсы с 💎 — именно эти идут в соответствующие репозитории. И допиши код
  // подтягивания этих воркспейсов из репо, по запросу пользователя, и если такой существует, спрашивать о восстановлении
  // оригинальной копией, и краткий быстрый гайд в попап оверлее… Вдруг чел туда своего напишет, а мы перезатрём всё»): the
  // published 💎 sets (lab/diamond.py), each fetched on a click into a workspace of its own, locked; one of that name here
  // is asked about first, with the way to keep it (rename it, then Get: the original comes in beside it)
  var hub = null;
  function hubSize(b) { return b >= 1e9 ? (b / 1e9).toFixed(1) + " GB" : Math.max(1, Math.round(b / 1e6)) + " MB"; }
  function hubOpen() {
    if (hub) return;
    var back = document.createElement("div");
    back.className = "hd-back hub-back";
    back.innerHTML = '<div class="hd-box hub-box" role="dialog" aria-modal="true" aria-label="💎 Sets from Hugging Face">' +
      '<div class="hd-title">💎 Sets from Hugging Face</div>' +
      '<div class="hd-body">The studio\'s approved sets, as their author published them. Each comes in as a workspace of its own, ' +
      "locked against deletion: its takes as MP3 with their covers, titles and notes. Only what you ask for is downloaded. " +
      // HERESY 1167 (Viktor: «дисклеймер по картинкам… сгенерированы нейросетью»)
      "The covers are painted by an image model: some show an instrument not quite as it really is.</div>" +
      '<div class="hub-list"><p class="row-hint">Asking Hugging Face…</p></div>' +
      '<div class="hd-acts"><button type="button" class="btn ghost small hub-close">Close</button></div></div>';
    document.body.appendChild(back);
    requestAnimationFrame(function () { back.classList.add("is-on"); });
    hub = { back: back, timer: 0, was: {} };
    function key(e) {
      if (e.key !== "Escape" || document.querySelector(".hd-back:not(.hub-back)")) return;   // a question on top answers first
      e.preventDefault(); e.stopPropagation(); hubClose();
    }
    hub.key = key;
    document.addEventListener("keydown", key, true);
    back.addEventListener("mousedown", function (e) { if (e.target === back) hubClose(); });
    back.querySelector(".hub-close").addEventListener("click", hubClose);
    back.querySelector(".hub-list").addEventListener("click", function (e) {
      var b = e.target.closest("[data-hub-get]");
      if (b && !b.disabled) { b.disabled = true; hubGet(b.dataset.hubGet, false); }
    });
    hubLoad();
  }
  function hubClose() {
    if (!hub) return;
    clearTimeout(hub.timer);
    document.removeEventListener("keydown", hub.key, true);
    var back = hub.back;
    back.classList.add("is-leaving");
    setTimeout(function () { back.remove(); }, 120);
    hub = null;
  }
  function hubLoad() {
    if (!hub) return;
    api("/collection/diamonds").then(function (d) { if (hub) hubPaint(d.sets || []); })
      .catch(function (e) { if (hub) hub.back.querySelector(".hub-list").innerHTML = '<p class="row-hint">The lab does not answer: ' + esc(e.message) + "</p>"; });
  }
  function hubPaint(sets) {
    var running = false, came = [];
    hub.back.querySelector(".hub-list").innerHTML = sets.map(function (s) {
      var j = s.job || {}, run = j.status === "running";
      running = running || run;
      if (hub.was[s.name] === "running" && j.status === "done") came.push(s);
      hub.was[s.name] = j.status || "";
      var facts = s.published ? "<span>" + s.takes + " takes</span> · " + '<span translate="no">' + hubSize(s.bytes) + "</span>" +
        (s.date ? " · <span>published " + esc(s.date) + "</span>" : "") : "";
      var state = run ? '<span class="hub-state">files: ' + (j.done || 0) + " of " + (j.total || 0) + '</span> · <span translate="no">' + hubSize(j.got || 0) + "</span>"
        : j.status === "failed" ? '<span class="hub-state is-bad">failed: ' + esc(j.error || "") + "</span>"
        : !s.published ? '<span class="hub-state is-bad">' + esc(s.error || "Not on Hugging Face yet") + "</span>"
        : s.here ? '<span class="hub-state is-here">' + s.here_takes + " takes here</span>"
        : '<span class="hub-state">Not here yet</span>';
      var btn = !s.published ? "" : run ? '<button type="button" class="btn small" disabled>Getting…</button>'
        : '<button type="button" class="btn small ' + (s.here ? "ghost" : "primary") + '" data-hub-get="' + esc(s.name) + '">' +
          (j.status === "failed" ? "Try again" : s.here ? "Restore the original…" : "Get") + "</button>";
      return '<div class="hub-row"><div class="hub-head"><span class="hub-name" translate="no">' + esc(s.name) + "</span>" +
        '<a class="hub-link" href="' + esc(s.url) + '" target="_blank" rel="noopener noreferrer" data-tip="Open it on Hugging Face (new tab)">↗</a></div>' +
        (facts ? '<div class="hub-facts">' + facts + "</div>" : "") + '<div class="hub-line">' + state + "</div>" + btn + "</div>";
    }).join("");
    came.forEach(function (s) { toast("“" + s.name + "” " + ((s.job || {}).restore ? "restored from Hugging Face" : "came from Hugging Face")); });
    if (came.length) load();
    clearTimeout(hub.timer);
    if (running) hub.timer = setTimeout(hubLoad, 1500);
  }
  function hubGet(name, restore) {
    fetch("/lab/collection/diamonds", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name, restore: restore }) })
      .then(function (r) { return r.json().then(function (b) { return { status: r.status, body: b }; }); })
      .then(function (x) {
        if (x.status === 409) {
          return ask("“" + name + "” is here already\n\n" +
            "Restoring brings back the copy published on Hugging Face: the takes it lacks come again, titles and notes return to the " +
            "published ones, and what was added to it leaves the workspace (those takes stay in the library; its own sections stay).\n\n" +
            "To keep yours as it is: Cancel, rename your workspace (the ⋯ beside its name, then Rename…), and Get again: the original " +
            "comes in beside it under its own name.", { ok: "Restore the original", danger: true })
            .then(function (yes) { if (yes) return hubGet(name, true); if (hub) hubLoad(); });
        }
        if (x.status >= 400) throw new Error(x.body.error || String(x.status));
        if (hub) hubPaint(x.body.sets || []);
      }).catch(function (e) { toast(e.message, true); if (hub) hubLoad(); });
  }

  function exportZip() {
    var n = names(); if (!n.length) return;
    var fmt = $("collExportFmt").value, derived = $("collExportDer").checked;
    toast("Packing " + n.length + " take" + (n.length > 1 ? "s" : "") + " as " + fmt.toUpperCase() + (derived ? " with what is made from them" : "") + "…");
    api("/export", { names: n, format: fmt, derived: derived }).then(function (j) {
      var id = j.id, poll = function () {
        return api("/export?id=" + id).then(function (s) {
          if (s.status === "running") { $("collSelCount").textContent = "packing " + s.done + " / " + s.total + "…"; return new Promise(function (r) { setTimeout(r, 1500); }).then(poll); }
          if (s.status !== "done") throw new Error(s.error || "the export failed");
          var a = document.createElement("a");
          a.href = "/lab/exportfile?id=" + id; a.download = s.file;
          document.body.appendChild(a); a.click(); a.remove();
          toast("ZIP ready: " + s.file + " (" + (s.bytes / 1e6).toFixed(0) + " MB). The browser saves it where you tell it.");
          paintBulk(shown());
        });
      };
      return poll();
    }).catch(function (e) { toast(e.message, true); });
  }

  function init(hooks) {
    watchSide();
    if (!$("view-collection")) return;
    state.hooks = hooks;
    $("collSearch").addEventListener("input", function () { state.q = this.value; paint(); });
    $("collSort").value = recall(SORT_KEY) || "new";
    $("collSort").addEventListener("change", function () { store(SORT_KEY, this.value); paint(); });
    // HERESY 1167: the disliked shown or not: the rooms' takes column's ⋯ («The disliked ones too»), one setting with this
    window.addEventListener("ruach-disliked", function () { paint(); });
    Array.prototype.forEach.call(document.querySelectorAll('#collFilters [data-kind="__liked"], #collFilters [data-kind="__disliked"], #collFilters [data-kind="__starred"]'), function (b) {
      var svg = ico({ __liked: "like", __disliked: "dislike", __starred: "star" }[b.dataset.kind]);   // the cards' one-colour icons, not the emoji
      if (svg) b.innerHTML = svg;
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-coll-view]"), function (b) {
      b.addEventListener("click", function () { store(VIEW_KEY, b.dataset.collView); paint(); });
    });
    $("collFilters").addEventListener("click", function (e) {
      var b = e.target.closest("[data-kind],[data-der]");
      if (!b) return;
      var bag = b.dataset.kind ? state.kinds : state.derived, k = b.dataset.kind || b.dataset.der;
      if (bag[k]) delete bag[k]; else bag[k] = 1;
      b.classList.toggle("is-on", !!bag[k]);
      paint();
    });
    $("collSide").addEventListener("click", function (e) {
      var more = e.target.closest("[data-ws-menu]");          // HERESY 1050
      if (more) { e.stopPropagation(); var rc = more.getBoundingClientRect(); wsMenu(more.dataset.wsMenu, rc.left, rc.bottom + 2); return; }
      if (e.target.closest("[data-ws-hub]")) return void hubOpen();   // HERESY 1166: the published 💎 sets
      var nw = e.target.closest("[data-ws-new]");
      if (nw) {
        askName("A new workspace", "", { ok: "Make it", placeholder: "its name" }).then(function (name) {
          if (name) act({ op: "ws-create", workspace: name }, "Workspace “" + name + "” made");
        });
        return;
      }
      var p = e.target.closest("[data-place]");
      if (!p) return;
      openPlace(p.dataset.place);                       // HERESY 1167: the bar follows
      if (state.place === "__trash") loadTrash(); else paint();
    });
    $("collSide").addEventListener("dblclick", function (e) {
      var p = e.target.closest("[data-place]");
      if (p && p.dataset.place && p.dataset.place.charAt(0) !== "_") renameWs(p.dataset.place);
    });
    $("collSide").addEventListener("contextmenu", function (e) {
      var p = e.target.closest("[data-place]");
      if (!p || !p.dataset.place || p.dataset.place.charAt(0) === "_" || !window.HeresyMenu) return;
      e.preventDefault();
      wsMenu(p.dataset.place, e.clientX, e.clientY);
    });
    $("collDialog").addEventListener("click", function (e) {
      if (e.target === $("collDialog") || e.target.closest("[data-dlg-close]")) closeDialog();
    });
    // HERESY 1159 (Viktor: «Drag&Drop для перемещения выбранного в другой воркспейс… С диалогом подтверждения, чтобы не
    // произошло случайного перемещения треков»): a card dragged onto a workspace on the left moves there, all the checked
    // ones when it is checked (with Ctrl: added there, kept here); asked first, always; Ctrl+Z gives it back
    var drag = null;
    function dropTarget(e) {
      var b = e.target.closest && e.target.closest(".coll-place[data-place]");
      return b && b.dataset.place && b.dataset.place.charAt(0) !== "_" ? b : null;   // a workspace, not All, Favourites, Trash…
    }
    function clearDrop() { Array.prototype.forEach.call(document.querySelectorAll(".coll-place.is-drop"), function (b) { b.classList.remove("is-drop"); }); }
    $("collGrid").addEventListener("dragstart", function (e) {
      var card = e.target.closest && e.target.closest(".coll-card[data-name]");
      if (!card || state.place === "__trash" || card.classList.contains("is-frozen") || (e.target.closest && e.target.closest("input, textarea"))) { e.preventDefault(); return; }
      var n = card.dataset.name, list = state.sel[n] ? names() : [n], r = rowOf(n);
      drag = list;
      hidePeek();
      e.dataTransfer.effectAllowed = "copyMove";
      try { e.dataTransfer.setData("text/plain", list.length === 1 ? (r ? r.title : n) : list.length + " takes"); } catch (x) { /* some browsers */ }
      var ghost = document.createElement("div");
      ghost.className = "coll-drag-ghost";
      ghost.textContent = list.length === 1 ? (r ? r.title : n) : list.length + " takes";
      document.body.appendChild(ghost);
      try { e.dataTransfer.setDragImage(ghost, 14, 14); } catch (x) { /* the card itself then */ }
      setTimeout(function () { ghost.remove(); }, 0);
      document.body.classList.add("coll-dragging");
    });
    $("collGrid").addEventListener("dragend", function () { drag = null; document.body.classList.remove("coll-dragging"); clearDrop(); });
    $("collSide").addEventListener("dragover", function (e) {
      var b = drag && dropTarget(e);
      if (!b || b.dataset.place === state.place) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = e.ctrlKey ? "copy" : "move";
      if (!b.classList.contains("is-drop")) { clearDrop(); b.classList.add("is-drop"); }
    });
    $("collSide").addEventListener("dragleave", function (e) {
      var b = dropTarget(e);
      if (b && !b.contains(e.relatedTarget)) b.classList.remove("is-drop");
    });
    $("collSide").addEventListener("drop", function (e) {
      var b = drag && dropTarget(e), list = drag;
      clearDrop();
      if (!b || !list) return;
      e.preventDefault();
      var w = b.dataset.place, add = e.ctrlKey, from = state.place && state.place.charAt(0) !== "_" ? state.place : "", n = list.length;
      var r = rowOf(list[0]), what = n === 1 ? "\u201c" + (r ? r.title : list[0]) + "\u201d" : n + " takes";
      var text = (add ? "Add " + what + " to \u201c" + w + "\u201d?" : "Move " + what + " to \u201c" + w + "\u201d?") + "\n\n" +
        (add ? "They stay where they are as well." : from ? "Out of \u201c" + from + "\u201d." : "Out of every other workspace they are in.") +
        " Ctrl+Z gives it back.";
      window.HeresyDialog.confirm(text, { ok: add ? "Add" : "Move" }).then(function (yes) {
        if (!yes) return;
        act(add ? { op: "ws-add", workspace: w, names: list } : { op: "ws-move", workspace: w, from: from, names: list },
            n + (add ? " added to \u201c" : " moved to \u201c") + w + "\u201d" + (add ? "" : from ? " (out of \u201c" + from + "\u201d)" : " (out of every other workspace)"));
        state.sel = {};
      });
    });
    $("collWsMove").addEventListener("change", function () {   // HERESY 1050: into one workspace, out of this one
      var w = this.value; this.value = "";
      if (!w) return;
      var from = state.place && state.place.charAt(0) !== "_" ? state.place : "", n = names().length;
      (w === "__new" ? askName("A new workspace for the " + n + " selected", "", { ok: "Move them there", placeholder: "its name" }) : Promise.resolve(w)).then(function (w) {
        if (!w) return;
        act({ op: "ws-move", workspace: w, from: from, names: names() }, n + " moved to \u201c" + w + "\u201d" + (from ? " (out of \u201c" + from + "\u201d)" : " (out of every other workspace)"));
        state.sel = {};
      });
    });
    $("collGrid").addEventListener("click", function (e) {
      var play = e.target.closest("[data-play]"), open = e.target.closest("[data-open]"), cb = e.target.closest("[data-sel]"), tcb = e.target.closest("[data-tsel]");
      if (tcb) { if (tcb.checked) state.tsel[tcb.dataset.tsel] = 1; else delete state.tsel[tcb.dataset.tsel]; return paint(); }
      if (band.ate) { band.ate = false; return; }             // the click that ends a rubber band is not a click
      var artb = e.target.closest("[data-art]");             // HERESY 1155: ‹ › walk the pictures of the cards shown
      if (artb && window.HeresyArt && window.HeresyArt.show) {
        window.HeresyArt.show(artb.dataset.art, Array.prototype.map.call($("collGrid").querySelectorAll("[data-art]"), function (b) { return b.dataset.art; }));
        return;
      }
      // HERESY 1101 (Viktor: "повадки, как в Плазме под Кедами"): once one card is checked, a click anywhere on
      // another card that is not one of its buttons checks it too; Shift takes the range from the last one
      var tapped = e.target.closest(".coll-card[data-name]");
      if (tapped && names().length && !e.target.closest("button, input, a, label, [data-play], [data-ren], .coll-title-edit")) {
        toggleCard(tapped.dataset.name, e.shiftKey); return;
      }
      if (play) {                                    // HERESY 1042: the same button as the player's for the take in it
        var now = hooks.playing ? hooks.playing() : {};
        if (now.name === play.dataset.play) { hooks.togglePlay(); return; }
        var t = hooks.findTake(play.dataset.play); if (t) hooks.playNow(t); return;
      }
      var ren = e.target.closest("[data-ren]");               // HERESY 1049: rename in place
      if (ren) { renameIn(ren.closest(".coll-title").querySelector(".coll-title-text"), ren.dataset.ren); return; }
      if (e.target.closest(".coll-title-edit")) return;
      if (open) { openSheet(open.dataset.open); return; }   // HERESY 1046: a sheet here; Create only by choice
      var card = e.target.closest(".coll-card[data-name]"), cname = card && card.dataset.name;   // HERESY 1048
      var crate = e.target.closest("[data-crate]");
      var many = cname && state.sel[cname] && names().length > 1;   // HERESY 1108: a checked card speaks for all checked
      if (crate && many) { rateMany(names(), +crate.dataset.crate); return; }
      if (e.target.closest("[data-cfav]") && many) { favMany(names()); return; }
      if (crate) { var v = +crate.dataset.crate; rate(cname, rating(cname) === v ? 0 : v).then(function () { if (hooks.libraryChanged) hooks.libraryChanged(); }); return; }
      if (e.target.closest("[data-cfav]")) {          // HERESY 1105: the card and the player follow at once
        var ft = hooks.findTake(cname);
        if (ft) hooks.updateTake(ft, { favorite: !ft.favorite }).then(function (entry) { markFavorite(cname, !!(entry || ft).favorite); if (hooks.libraryChanged) hooks.libraryChanged(); });
        return;
      }
      var cgo = e.target.closest("[data-cgo]");
      if (cgo) { hooks.openTake(cname, cgo.dataset.cgo); return; }
      if (e.target.closest("[data-cmenu]") && hooks.menu) { var rc = e.target.getBoundingClientRect(); hooks.menu(cname, rc.left, rc.bottom + 2); return; }
      if (cb) {
        var rows = shown(), i = rows.findIndex(function (r) { return r.name === cb.dataset.sel; });
        if (e.shiftKey && state.last !== null) {            // a range, from the last one clicked
          var a = Math.min(state.last, i), b = Math.max(state.last, i);
          for (var k = a; k <= b; k++) if (cb.checked) state.sel[rows[k].name] = 1; else delete state.sel[rows[k].name];
        } else if (cb.checked) state.sel[cb.dataset.sel] = 1; else delete state.sel[cb.dataset.sel];
        state.last = i;
        paint();
      }
    });
    // HERESY 1046: peek on hover, sheet on click
    // HERESY 1167 (Viktor: «задержку в пропадании на 1200ms, чтобы успеть мышкой перескочить, а при наведении разворачивать
    // вниз»): the peek shown stays while the pointer crosses other cards on its way to it (a card rested on for 400 ms takes
    // its place); it goes 1200 ms after the pointer leaves the cards; entered, it stays and opens downward
    $("collGrid").addEventListener("mouseover", function (e) {
      var card = e.target.closest(".coll-card[data-name]");
      if (!card || card.dataset.name === peekFor) return;
      clearTimeout(peekTimer); clearTimeout(peekHide);
      peekTimer = setTimeout(function () { showPeek(card); }, 400);
    });
    $("collGrid").addEventListener("mouseleave", function () { clearTimeout(peekTimer); clearTimeout(peekHide); peekHide = setTimeout(hidePeek, 1200); });
    $("collPeek").addEventListener("mouseenter", function () { clearTimeout(peekTimer); clearTimeout(peekHide); });
    $("collPeek").addEventListener("mouseleave", function () { clearTimeout(peekHide); peekHide = setTimeout(hidePeek, 300); });
    $("collGrid").addEventListener("contextmenu", function (e) {   // HERESY 1048: the studio's own menu
      var card = e.target.closest(".coll-card[data-name]");
      if (!card || !hooks.menu) return;
      e.preventDefault(); hidePeek();
      hooks.menu(card.dataset.name, e.clientX, e.clientY);
    });
    $("collGrid").addEventListener("mousedown", hidePeek);
    $("collGrid").addEventListener("mousedown", bandStart);          // HERESY 1101: the rubber band
    // HERESY 1105: a workspace name cut by the column, shown whole over the grid while the pointer is on it
    var fullName = null;
    $("collSide").addEventListener("mouseover", function (e) {
      var b = e.target.closest(".coll-place"), lab = b && b.firstElementChild;
      if (fullName && fullName.owner === b) return;
      if (fullName) { fullName.remove(); fullName = null; }
      if (!lab || lab.scrollWidth <= lab.clientWidth + 1) return;
      var r = lab.getBoundingClientRect(), cs = getComputedStyle(b);
      fullName = document.createElement("div");
      fullName.className = "coll-fullname"; fullName.owner = b; fullName.textContent = lab.textContent;
      fullName.style.cssText = "left:" + (r.left - 6) + "px;top:" + (r.top - 3) + "px;font-weight:" + cs.fontWeight;
      document.body.appendChild(fullName);
    });
    $("collSide").addEventListener("mouseleave", function () { if (fullName) { fullName.remove(); fullName = null; } });
    $("collPins").addEventListener("click", function (e) {          // HERESY 1103: the pinned takes
      var b = e.target.closest("[data-play]"), o = e.target.closest("[data-open]"), u = e.target.closest("[data-unpin]");
      if (u) return void pin(u.dataset.unpin, false);
      if (b) { var now = hooks.playing ? hooks.playing() : {}; if (now.name === b.dataset.play) return void hooks.togglePlay(); var t = hooks.findTake(b.dataset.play); if (t) hooks.playNow(t); return; }
      if (o) openSheet(o.dataset.open);
    });
    $("collPins").addEventListener("contextmenu", function (e) {
      var c = e.target.closest(".coll-pin[data-name]");
      if (!c || !hooks.menu) return;
      e.preventDefault(); hooks.menu(c.dataset.name, e.clientX, e.clientY);
    });
    $("collSheet").addEventListener("click", function (e) {
      if (e.target === $("collSheet") || e.target.closest("[data-sheet-close]")) return closeSheet();
      var name = sheetName, r = rowOf(name);
      if (!r) return;
      var sren = e.target.closest("[data-sheet-ren]");
      if (sren) { renameIn(sren, name, function () { openSheet(name); }); return; }
      if (e.target.closest(".coll-title-edit")) return;
      if (e.target.closest("[data-sheet-play]")) {
        var now = hooks.playing();
        if (now.name === name) hooks.togglePlay(); else { var t = hooks.findTake(name); if (t) hooks.playNow(t); }
        return;
      }
      var rt = e.target.closest("[data-sheet-rate]");
      if (rt) { var v = +rt.dataset.sheetRate; rate(name, r.rating === v ? 0 : v).then(function () { openSheet(name); }); return; }
      if (e.target.closest("#sheetFav")) { var tk = hooks.findTake(name); if (tk) hooks.updateTake(tk, { favorite: !tk.favorite }).then(load).then(function () { openSheet(name); }); return; }
      var go = e.target.closest("[data-sheet-go]");
      if (go) { closeSheet(); hooks.openTake(name, go.dataset.sheetGo); }
    });
    $("collSheet").addEventListener("input", function (e) {
      if (e.target.id !== "sheetNote") return;
      var name = sheetName, text = e.target.value;
      $("sheetNoteState").textContent = "\u2026";
      clearTimeout(sheetNoteTimer);
      sheetNoteTimer = setTimeout(function () { setNote(name, text).then(function () { if ($("sheetNoteState")) $("sheetNoteState").textContent = "saved"; }); }, 900);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      if (!$("collDialog").hidden) closeDialog(); else if (!$("collSheet").hidden) closeSheet();
    });

    $("collSelAll").addEventListener("click", function () { shown().forEach(function (r) { state.sel[r.name] = 1; }); paint(); });
    // HERESY 1135: the keyboard, as in a file manager: Ctrl+A every take shown, Esc none, Delete to the trash (asked),
    // Ctrl+Z the last change back. Only in the Librarian, never while typing or with a window open over it.
    document.addEventListener("keydown", function (e) {
      if (document.body.dataset.tab !== "collection") return;
      var t = e.target, typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
      if (typing || document.querySelector(".hd-back, .ds-back, .hm-pop:not([hidden])") || !$("collDialog").hidden || !$("collSheet").hidden) return;
      var mod = e.ctrlKey || e.metaKey, k = (e.key || "").toLowerCase();
      // HERESY 1167: the browser's own find sees only the cards drawn; the Librarian's search sees every take
      if (mod && k === "f") { e.preventDefault(); $("collSearch").focus(); $("collSearch").select(); return; }
      if (mod && k === "a" && state.place !== "__trash") { e.preventDefault(); shown().forEach(function (r) { if (!r.frozen) state.sel[r.name] = 1; }); paint(); }
      else if (mod && k === "z" && undoState.fn) { e.preventDefault(); undoLast(); }
      else if (e.key === "Escape" && names().length) { state.sel = {}; paint(); }
      else if (e.key === "Delete" && names().length && state.place !== "__trash") { e.preventDefault(); $("collTrash").click(); }
    });
    // HERESY 1162 (Viktor: «на столбик воркспейсов возможность перетягивать, менять ширину, и схлопывать эту колонку. Можно при
    // схлопнутой добавлять ещё одну колонку в тайл карточек»): its edge dragged (the width kept), « folds it away and the tiles
    // take one column more, » brings it back; a double click on the edge, or Enter on it, folds too; ← → from the keyboard
    (function () {
      var lay = document.querySelector(".coll-layout"), rz = $("collResizer"), fb = $("collFold");
      if (!lay || !rz || !fb) return;
      var W_KEY = "yue2.collSideW", F_KEY = "yue2.collSideFolded", MIN = 150, MAX = 440;
      function setW(w) { w = Math.max(MIN, Math.min(MAX, Math.round(w))); lay.style.setProperty("--coll-side-w", w + "px"); return w; }
      function folded() { return lay.classList.contains("is-folded"); }
      function fold(on) {
        lay.classList.toggle("is-folded", on);
        store(F_KEY, on ? "1" : "0");
        fb.textContent = on ? "\u00bb" : "\u00ab";
        fb.dataset.tip = on ? "Show the workspaces" : "Fold the workspaces away: the cards take one column more";
        fb.setAttribute("aria-label", fb.dataset.tip);
        rz.setAttribute("aria-valuenow", on ? "0" : String(Math.round($("collSide").getBoundingClientRect().width)));
        fitSideSoon();
      }
      var saved = parseInt(recall(W_KEY), 10);
      if (saved) setW(saved);
      fold(recall(F_KEY) === "1");
      rz.addEventListener("pointerdown", function (e) {
        if (e.button !== 0 || e.target.closest("#collFold") || folded()) return;
        e.preventDefault();
        rz.setPointerCapture(e.pointerId);
        rz.classList.add("is-drag");
        var x0 = e.clientX, w0 = $("collSide").getBoundingClientRect().width;
        function move(ev) { setW(w0 + ev.clientX - x0); }
        function up() {
          rz.classList.remove("is-drag");
          rz.removeEventListener("pointermove", move); rz.removeEventListener("pointerup", up); rz.removeEventListener("pointercancel", up);
          store(W_KEY, String(Math.round($("collSide").getBoundingClientRect().width)));
          fitSideSoon();
        }
        rz.addEventListener("pointermove", move); rz.addEventListener("pointerup", up); rz.addEventListener("pointercancel", up);
      });
      rz.addEventListener("dblclick", function (e) { if (!e.target.closest("#collFold")) fold(!folded()); });
      fb.addEventListener("click", function (e) { e.stopPropagation(); fold(!folded()); });
      rz.addEventListener("keydown", function (e) {
        if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && !folded()) {
          e.preventDefault(); e.stopPropagation();          // not the player's seek
          store(W_KEY, String(setW($("collSide").getBoundingClientRect().width + (e.key === "ArrowRight" ? 16 : -16))));
        } else if (e.key === "Enter" && e.target === rz) { e.preventDefault(); fold(!folded()); }
      });
    })();
    $("collSelNone").addEventListener("click", function () { state.sel = {}; paint(); });
    $("collLike").addEventListener("click", function () { rateMany(names(), 1); });        // HERESY 1108
    $("collDislike").addEventListener("click", function () { rateMany(names(), -1); });
    $("collFav").addEventListener("click", function () { favMany(names()); });
    $("collWsPick").addEventListener("change", function () {
      var w = this.value; this.value = "";
      if (!w) return;
      (w === "__new" ? askName("A new workspace for the selected", "", { ok: "Add them there", placeholder: "its name" }) : Promise.resolve(w)).then(function (w) {
        if (w) act({ op: "ws-add", workspace: w, names: names() }, names().length + " added to “" + w + "”");
      });
    });
    $("collWsOut").addEventListener("click", function () {     // HERESY 1108: more than one asks first
      var n = names(), go = function () { act({ op: "ws-remove", workspace: state.place, names: n }, n.length + " taken out of “" + state.place + "”"); state.sel = {}; };
      if (n.length < 2) return go();
      ask("Take " + n.length + " takes out of “" + state.place + "”?\n\nThey stay in the library and in any other workspace; only this workspace lets them go.", { ok: "Take them out" })
        .then(function (ok) { if (ok) go(); });
    });
    $("collHide").addEventListener("click", function () {
      var show = state.place === "__hidden", n = names().length;
      act({ op: show ? "show" : "hide", names: names() }, (show ? "Shown again: " : "Hidden from the lists (not deleted): ") + n);
      state.sel = {};
    });
    $("collExport").addEventListener("click", exportZip);
    $("collTrash").addEventListener("click", function () {
      var n = names(); if (!n.length) return;
      ask("Move " + n.length + " take" + (n.length > 1 ? "s" : "") + " to the trash?\n\nNothing is deleted: the trash gives them back until it is emptied.", { ok: "To the trash", danger: true }).then(function (ok) {
        if (ok) return api("/trash", { op: "move", names: n });
      }).then(function (d) {
        if (!d) return;
        var said = d.moved.length + " moved to the trash" + (d.locked && d.locked.length ? "; " + d.locked.length + " stayed: their workspace locks its takes" : "");
        if (d.moved.length) undoable(said, untrash(d.moved)); else toast(said, true);
        state.sel = {};
        if (hooks.refreshLibrary) hooks.refreshLibrary();
        return load();
      }).catch(function (e) { toast(e.message, true); });
    });
    // the trash
    var chosen = function () { return Object.keys(state.tsel).map(function (k) { var p = k.split("/"); return { day: p[0], name: p[1] }; }); };
    $("collTSelAll").addEventListener("click", function () { state.trash.forEach(function (it) { state.tsel[it.day + "/" + it.name] = 1; }); paint(); });
    $("collTSelNone").addEventListener("click", function () { state.tsel = {}; paint(); });
    $("collRestore").addEventListener("click", function () {
      var items = chosen(); if (!items.length) return toast("Tick what to give back", true);
      api("/trash", { op: "restore", items: items }).then(function (d) { toast(d.restored.length + " back in the library"); if (hooks.refreshLibrary) hooks.refreshLibrary(); return load().then(loadTrash); })
        .catch(function (e) { toast(e.message, true); });
    });
    $("collEmpty").addEventListener("click", function () {
      var items = chosen(), all = !items.length;
      var n = all ? state.trash.length : items.length;
      if (!n) return;
      ask((all ? "Wipe out the whole trash: " : "Delete for good: ") + n + " take" + (n > 1 ? "s" : "") + ", with everything made from them.\n\nThis cannot be undone.", { ok: all ? "Wipe out" : "Delete for good", danger: true }).then(function (ok) {
        if (ok) return api("/trash", { op: "empty", items: all ? null : items }).then(function (d) { toast(d.emptied.length + " deleted for good"); state.tsel = {}; return loadTrash(); });
      }).catch(function (e) { toast(e.message, true); });
    });
    $("collTrashDays").addEventListener("change", function () {
      var days = parseInt(this.value, 10) || 0, sel = this;
      (days ? ask("Empty the trash by itself?\n\nWhatever has lain there more than " + days + " days is deleted for good, every hour from now on.", { ok: "Every " + days + " days", danger: true }) : Promise.resolve(true)).then(function (ok) {
        if (!ok) { sel.value = String(state.trashDays || 0); return; }
        act({ op: "trash-days", days: days }, days ? "The trash empties itself after " + days + " days" : "The trash keeps everything until you empty it");
      });
    });
    $("wsCurrent").addEventListener("click", function () { chooseCurrent(); });   // HERESY 1167: the workspace in hand, chosen in a dialog
    paintCurrent();
    state.place = recall(WS_KEY) || "";
    load();
    api("/trash").then(function (d) { state.trash = d.items || []; paintSide(); }).catch(function () {});
  }

  // HERESY 1042: likes, as SUNO has them (the player sets them)
  function rating(name) { var r = state.rows.filter(function (x) { return x.name === name; })[0]; return r ? r.rating || 0 : 0; }
  // HERESY 1108: many takes rated at once; all of them rated so already: taken back to none
  function rateMany(list, value) {
    var rows = list.map(rowOf).filter(Boolean), all = rows.length && rows.every(function (r) { return r.rating === value; });
    var v = all ? 0 : value, before = rows.map(function (r) { return r.rating; });
    rows.forEach(function (r) { r.rating = v; }); paint();
    list.forEach(function (n) { remember(n, v); });
    var asked = rateSeq;
    return api("/collection", { op: "rate", names: list, value: v }).then(function (d) {
      state.rows = d.takes ? fresh(d.takes, asked) : state.rows; paint();
      var was = {};                                       // HERESY 1135: each take's own mark back
      rows.forEach(function (r, i) { (was[before[i]] = was[before[i]] || []).push(r.name); });
      undoable((v > 0 ? "Liked: " : v < 0 ? "Disliked: " : "Neither liked nor disliked: ") + list.length, function () {
        return Object.keys(was).reduce(function (p, val) {
          return p.then(function () { return api("/collection", { op: "rate", names: was[val], value: +val }); });
        }, Promise.resolve()).then(function (d2) { if (d2) state.rows = d2.takes || state.rows; paint(); if (state.hooks.libraryChanged) state.hooks.libraryChanged(); });
      });
      if (state.hooks.libraryChanged) state.hooks.libraryChanged();
    }, function (e) { rows.forEach(function (r, i) { r.rating = before[i]; remember(r.name, before[i]); }); paint(); toast(e.message, true); });
  }
  function favMany(list) {
    var takes = list.map(hk().findTake).filter(Boolean), on = takes.some(function (t) { return !t.favorite; });
    takes.forEach(function (t) { markFavorite(t.name, on); });
    return Promise.all(takes.map(function (t) { return hk().updateTake(t, { favorite: on }); }))
      .then(function () { toast((on ? "Favourites: " : "Not favourites: ") + takes.length); if (state.hooks.libraryChanged) state.hooks.libraryChanged(); })
      .catch(function (e) { toast(e.message, true); return load(); });
  }
  function hk() { return state.hooks; }
  function rate(name, value) {
    // HERESY 1107: seen at once, confirmed by the lab; a refusal takes it back (and the caller says why)
    var r = rowOf(name), before = r ? r.rating : 0;
    if (r) { r.rating = value; paint(); }
    if (value < 0 && !showDis()) {                       // HERESY 1167: it leaves the lists; said where it went
      toast("“" + (r ? r.title : name) + "” disliked: it leaves the lists; nothing is deleted (the 👎 filter shows it)");
    }
    var told = function () { if (state.hooks.libraryChanged) state.hooks.libraryChanged(); };   // HERESY 1167: the column too
    remember(name, value);
    var asked = rateSeq;
    told();
    return api("/collection", { op: "rate", names: [name], value: value }).then(function (d) {
      state.rows = d.takes ? fresh(d.takes, asked) : state.rows; paint(); told();
      return value;
    }, function (e) { remember(name, before); if (r) { r.rating = before; paint(); told(); } throw e; });
  }

  // ---- HERESY 1046: the take without leaving the Librarian: a hover peek (400 ms) and a sheet on click
  var reqCache = {}, peekTimer = 0, peekHide = 0, peekFor = "";
  function requestOf(name) {
    if (reqCache[name]) return Promise.resolve(reqCache[name]);
    var t = state.hooks.findTake(name);
    if (!t) return Promise.reject(new Error("not in the library"));
    return state.hooks.getRequest(t).then(function (r) { reqCache[name] = r; return r; });
  }
  function rowOf(name) { return state.rows.filter(function (r) { return r.name === name; })[0]; }
  // HERESY 1155 (Viktor: \u00ab\u0422\u0443\u043b\u0442\u0438\u043f \u043f\u043e\u043a\u0440\u044b\u0432\u0430\u0435\u0442 \u043f\u0435\u0440\u0432\u044b\u0439 \u0440\u044f\u0434 \u043a\u0430\u0440\u0442\u043e\u0447\u0435\u043a\u2026 \u0434\u0430\u0432\u0430\u0439 \u043c\u0435\u043d\u044c\u0448\u0435 \u0435\u0433\u043e \u043f\u043e \u0432\u044b\u0441\u043e\u0442\u0435\u00bb): the peek's words without
  // empty lines, a run of bare section tags on one line ([Intro] [Verse] [Chorus]: an instrumental's whole text)
  function lyricsTight(text, lines) {
    var out = [];
    String(text || "").split("\n").forEach(function (l) {
      l = l.trim();
      if (!l) return;
      var tag = /^\[[^\]]*\]$/.test(l), last = out.length ? out[out.length - 1] : null;
      if (tag && last && last.tag) last.text += " " + l; else out.push({ text: l, tag: tag });
    });
    var head = out.slice(0, lines).map(function (o) { return o.text; }).join("\n");
    return out.length > lines ? head + "\n\u2026" : head;
  }
  function showPeek(card) {
    var name = card.dataset.name, r = rowOf(name);
    if (!r) return;
    peekFor = name;
    requestOf(name).then(function (req) {
      if (peekFor !== name) return;
      var box = $("collPeek"), style = String(req.style || "");
      box.innerHTML = '<div class="peek-title">' + esc(r.title) + '</div><div class="coll-meta"><span>' + esc(state.hooks.ago(r.created)) + "</span>" +
        (r.seconds ? " \u00b7 <span>" + state.hooks.clock(r.seconds) + "</span>" : "") + (req.cot ? " \u00b7 <span>" + esc(cotWord(req.cot)) + "</span>" : "") + "</div>" +
        (style ? '<div class="peek-cap">Style</div><div class="peek-style">' + esc(style) + "</div>" : "") +   // HERESY 1167: whole (three lines until hovered)
        (req.lyrics ? '<div class="peek-cap">Lyrics</div><pre class="peek-lyrics">' + esc(lyricsTight(req.lyrics, 6)) + "</pre>" +
          '<pre class="peek-lyrics-full">' + esc(String(req.lyrics).trim().slice(0, 6000)) + "</pre>" : "") +   // HERESY 1167: whole, when hovered
        (r.note ? '<div class="peek-cap">Note</div><div class="peek-note">' + esc(r.note) + "</div>" : "");
      // HERESY 1151 (Viktor: «попап тултип при наведении на карточку перенести в фиксированный правый верхний угол? Так
      // никому мешать не будет»): the window's top right corner. HERESY 1155 (Viktor: «тултип смести прямо поверх бара,
      // он же временный… меньше по высоте»): over the bar itself, and no lower than where the cards begin
      var grid = $("collGrid"), sc = scrollerOf(grid), top = 8;
      var floor = Math.max(grid.getBoundingClientRect().top, sc === document.scrollingElement || sc === document.documentElement ? 0 : sc.getBoundingClientRect().top);
      box.style.left = "auto";
      box.style.right = "16px";
      box.style.top = top + "px";
      box.style.maxHeight = Math.round(Math.max(170, floor - 8 - top)) + "px";
      box.hidden = false;
    }).catch(function () {});
  }
  function hidePeek() { clearTimeout(peekTimer); clearTimeout(peekHide); peekFor = ""; if ($("collPeek")) $("collPeek").hidden = true; }
  // HERESY 1155: artwork drawn meanwhile (a batch, the API, another browser) put on the cards shown, in place: nothing
  // else repainted, so a rename being typed or a rubber band being drawn is left alone
  function paintArts() {
    if (!window.HeresyArt) return;
    Array.prototype.forEach.call($("collGrid").querySelectorAll(".coll-card[data-name]"), function (card) {
      var name = card.dataset.name, art = window.HeresyArt.url(name), b = card.querySelector(".coll-art");
      card.classList.toggle("has-art", !!art);
      if (!art) { if (b) b.remove(); return; }
      if (!b) {
        b = document.createElement("button");
        b.type = "button"; b.className = "coll-art"; b.dataset.art = name;
        b.dataset.tip = "The artwork: see it whole"; b.setAttribute("aria-label", "The artwork");
        card.insertBefore(b, card.querySelector(".coll-acts"));
      }
      b.style.backgroundImage = 'url("' + art + '")';
    });
  }

  var sheetName = "", sheetNoteTimer = 0;
  function openSheet(name) {
    hidePeek();
    var r = rowOf(name);
    if (!r) return;
    sheetName = name;
    requestOf(name).then(function (req) { paintSheet(r, req); }).catch(function (e) { paintSheet(r, {}); toast(e.message, true); });
  }
  function paintSheet(r, req) {
    var now = state.hooks.playing(), mine = now.name === r.name && now.playing;
    $("collSheetBody").innerHTML =
      '<div class="sheet-head"><button type="button" class="coll-play' + (mine ? " is-playing" : "") + '" data-sheet-play="1">' + ico(mine ? "pause" : "play") + "</button>" +
      '<div><div class="sheet-title"><span class="coll-title-text" data-sheet-ren="1" title="Click to rename">' + esc(r.title) + '</span></div><div class="coll-meta"><span>' + esc(state.hooks.ago(r.created)) + "</span>" +
      (r.seconds ? " \u00b7 <span>" + state.hooks.clock(r.seconds) + "</span>" : "") + (req.cot ? " \u00b7 <span>" + esc(cotWord(req.cot)) + "</span>" : "") + " \u00b7 <span>" + esc(KINDS[r.kind] || r.kind) + "</span>" +
      (r.derived.length ? " \u00b7 <span>made from it: " + esc(r.derived.join(", ")) + "</span>" : "") + "</div></div>" +
      '<span class="pb-rate"><button type="button" class="pb-btn" data-sheet-rate="1" aria-pressed="' + (r.rating > 0) + '">' + ico("like") + '</button>' +
      '<button type="button" class="pb-btn" data-sheet-rate="-1" aria-pressed="' + (r.rating < 0) + '">' + ico("dislike") + '</button>' +
      '<button type="button" class="pb-btn" id="sheetFav" aria-pressed="' + r.favorite + '" >' + ico("star") + "</button></span></div>" +
      (r.workspaces.length ? '<div class="coll-badges">' + r.workspaces.map(function (w) { return badge(w, "w"); }).join("") + "</div>" : "") +
      '<div class="sheet-cols"><div><div class="peek-cap">Style</div><pre class="sheet-text">' + esc(req.style || "") + "</pre></div>" +
      '<div><div class="peek-cap">Lyrics</div><pre class="sheet-text sheet-lyrics">' + esc(req.lyrics || "") + "</pre></div></div>" +
      '<label class="field"><span class="label">Note <em id="sheetNoteState"></em></span><textarea id="sheetNote" rows="3" maxlength="4000">' + esc(r.note || "") + "</textarea></label>" +
      '<div class="dv-actions sheet-acts"><button type="button" class="btn ghost small" data-sheet-go="create">Open in the Creator</button>' +
      '<button type="button" class="btn ghost small" data-sheet-go="post">Open in the Refiner</button><span class="spacer"></span>' +
      '<button type="button" class="btn ghost small" data-sheet-close="1">Close</button></div>';
    $("collSheet").hidden = false;
  }
  function closeSheet() { if ($("collSheet")) $("collSheet").hidden = true; sheetName = ""; }

  // the play buttons follow the player (called on play, pause, end, a new take)
  function paintPlaying() {
    var now = state.hooks && state.hooks.playing ? state.hooks.playing() : {};
    if ($("collPins") && !$("collPins").hidden && state.loaded) paintPins();   // HERESY 1103
    var sp = document.querySelector("[data-sheet-play]");
    if (sp && sheetName) { var on0 = now.name === sheetName && now.playing; sp.innerHTML = ico(on0 ? "pause" : "play"); sp.classList.toggle("is-playing", on0); }
    Array.prototype.forEach.call(document.querySelectorAll("#collGrid .coll-card[data-name]"), function (card) {
      var mine = card.dataset.name === now.name, b = card.querySelector(".coll-play");
      card.classList.toggle("is-current", mine);
      card.classList.toggle("is-sounding", mine && !!now.playing);   // HERESY 1058: a pulse under the card that sounds
      if (!b) return;
      var on = mine && now.playing;
      b.classList.toggle("is-playing", on);
      b.innerHTML = ico(on ? "pause" : "play");
      b.setAttribute("aria-label", on ? "Pause" : "Play");
    });
  }

  // ---- HERESY 1050: a workspace renamed or deleted (three ways)
  function wsMenu(w, x, y) {
    if (!window.HeresyMenu) return;
    var n = state.rows.filter(function (r) { return inTree(r, w); }).length;
    if (frozenWs(w)) {                             // HERESY 1166: frozen, it is opened or thawed, nothing else
      var own = (state.frozen || []).indexOf(w) >= 0, by = (state.frozen || []).filter(function (f) { return w.indexOf(f + SEP) === 0; })[0];
      return window.HeresyMenu.open(x, y, [
        { head: w + " \u00b7 " + n + " take" + (n === 1 ? "" : "s") },
        { icon: "\u25a6", label: "Open", action: function () { openPlace(w); paint(); } },
        { sep: true },
        own ? { icon: "\u2600", label: "Unfreeze", action: function () { act({ op: "freeze", workspace: w, on: false }, "Unfrozen: \u201c" + w + "\u201d", true); } }
            : { icon: "\u2744", label: "Frozen with \u201c" + by + "\u201d", disabled: true }
      ]);
    }
    window.HeresyMenu.open(x, y, [
      { head: w + " \u00b7 " + n + " take" + (n === 1 ? "" : "s") },
      { icon: "\u25a6", label: "Open", action: function () { openPlace(w); paint(); } },
      { icon: "\u2193", label: "New takes land here", checked: current() === w, action: function () { store(WS_KEY, current() === w ? "" : w); paintCurrent(); state.hooks.libraryChanged && state.hooks.libraryChanged(); } },
      { sep: true },
      // HERESY 1161: a section inside it, two levels below a workspace at most
      wsParts(w).length < DEPTH ? { icon: "+", label: "New section\u2026", hint: "inside \u201c" + wsLeaf(w) + "\u201d", action: function () {
        askName("A new section of \u201c" + w + "\u201d", "", { ok: "Make it", placeholder: "its name", max: WS_PART }).then(function (name) {
          name = String(name || "").replace(/\s*\/\s*/g, " ").trim();
          if (name) act({ op: "ws-create", workspace: w + SEP + name }, "Section \u201c" + name + "\u201d made in \u201c" + w + "\u201d");
        });
      } } : null,
      { icon: "Aa", label: "Rename\u2026", action: function () { renameWs(w); } },
      { sep: true },                                   // HERESY 1070: the safety catches
      { icon: "\u2744", label: "Freeze\u2026", hint: "heard, never changed", action: function () { freezeWs(w); } },   // HERESY 1166
      lockItem(w, "workspace", "Workspace Deletion"),
      lockItem(w, "tracks", "Tracks Deletion"),
      { sep: true },
      { icon: "\ud83d\uddd1", label: "Delete\u2026", danger: true, disabled: isLocked(w, "workspace"), hint: isLocked(w, "workspace") ? "locked" : "", action: function () { deleteWs(w); } }
    ].filter(Boolean));
  }
  function freezeWs(w) {                           // HERESY 1166
    ask("Freeze \u201c" + w + "\u201d?\n\nIts takes stay as they are: they are heard and read, never changed, moved or thrown away, " +
        "and they leave All Workspaces and the search (a take also in a workspace that is not frozen stays there). The workspace " +
        "greys out; Unfreeze in its \u22ef menu brings everything back.", { ok: "Freeze" }).then(function (yes) {
      if (!yes) return;
      state.sel = {};
      act({ op: "freeze", workspace: w, on: true }, "Frozen: \u201c" + w + "\u201d", true);
    });
  }
  function isLocked(w, what) { return !!((state.locks || {})[w] || {})[what]; }
  function lockItem(w, what, label) {
    var on = isLocked(w, what);
    return { icon: on ? "\ud83d\udd13" : "\ud83d\udd12", label: (on ? "Unlock " : "Lock ") + label, action: function () {
      act({ op: "lock", workspace: w, what: what, on: !on }, (on ? "Unlocked: " : "Locked: ") + label.toLowerCase() + " of \u201c" + w + "\u201d").then(function () { paint(); });
    } };
  }
  // a take no deletion may reach: it is in a workspace whose tracks are locked
  function takeLocked(name) {
    var r = rowOf(name);
    return !!r && r.workspaces.some(function (w) { return isLocked(w, "tracks"); });
  }
  function followRename(from, to) {           // the place on the left and the workspace in hand follow it
    if (state.place === from) state.place = to;
    if (recall(WS_KEY) === from) store(WS_KEY, to);
  }
  function renameWs(w) {
    var parent = wsParts(w).slice(0, -1).join(SEP);                       // HERESY 1161: a section keeps its parent
    askName((parent ? "Rename the section \u201c" + wsLeaf(w) + "\u201d of \u201c" + parent + "\u201d" : "Rename the workspace \u201c" + w + "\u201d"),
            parent ? wsLeaf(w) : w, { ok: "Rename", max: WS_PART }).then(function (to) {
      if (to && parent) to = parent + SEP + String(to).replace(/\s*\/\s*/g, " ").trim();
      if (!to || to === w) return;
      if (state.ws.indexOf(to) >= 0) return toast("There is a workspace \u201c" + to + "\u201d already", true);
      act({ op: "ws-rename", workspace: w, to: to }, "Workspace renamed").then(function (ok) { if (ok) { followRename(w, to); paint(); paintCurrent(); } });
    });
  }
  function closeDialog() { $("collDialog").hidden = true; $("collDialogBody").innerHTML = ""; }
  function deleteWs(w) {
    var takes = state.rows.filter(function (r) { return inTree(r, w); });               // HERESY 1161: its sections go with it
    var shared = takes.filter(function (r) { return r.workspaces.length > 1; }), others = state.ws.filter(function (x) { return x !== w && x.indexOf(w + SEP) !== 0; });
    $("collDialogBody").innerHTML =
      '<div class="sheet-title">Delete the workspace \u201c' + esc(w) + '\u201d' + (function () {      // HERESY 1161
        var subs = state.ws.filter(function (x) { return x.indexOf(w + SEP) === 0; }).length;
        return subs ? " and its " + subs + " section" + (subs === 1 ? "" : "s") : "";
      })() + "</div>" +
      '<p class="row-hint">' + takes.length + " take" + (takes.length === 1 ? "" : "s") + " in it. What becomes of them?</p>" +
      '<label class="coll-opt"><input type="radio" name="wsDel" value="only" checked /><span><b>Only the workspace goes.</b> Its takes stay in the library, unsorted: in All Workspaces, and in any other workspace they belong to.</span></label>' +
      '<label class="coll-opt"><input type="radio" name="wsDel" value="move" /><span><b>Its takes move into</b> <select id="wsDelTo">' +
        others.map(function (x) { return '<option translate="no">' + esc(x) + "</option>"; }).join("") + '<option value="__new">+ a new workspace\u2026</option></select>, then the workspace goes.</span></label>' +
      '<label class="coll-opt is-danger"><input type="radio" name="wsDel" value="trash" /><span><b>The workspace goes with its takes.</b> The takes go to the trash, which gives them back until it is emptied.</span></label>' +
      (shared.length ? '<label class="check coll-opt-sub"><input type="checkbox" id="wsDelSpare" checked /> <span>Spare the ' + shared.length + " take" + (shared.length === 1 ? "" : "s") + " that also belong to another workspace</span></label>" : "") +
      '<div class="dv-actions sheet-acts"><span class="spacer"></span><button type="button" class="btn ghost small" data-dlg-close="1">Cancel</button>' +
      '<button type="button" class="btn small danger-fill" id="wsDelGo">Delete the workspace</button></div>';
    $("collDialog").hidden = false;
    $("wsDelTo").addEventListener("focus", function () { $("collDialogBody").querySelector('[value="move"]').checked = true; });
    $("wsDelGo").addEventListener("click", function () {
      var how = $("collDialogBody").querySelector('input[name="wsDel"]:checked').value, done;
      if (how === "only") {
        done = act({ op: "ws-delete", workspace: w }, "Workspace \u201c" + w + "\u201d deleted; its takes stay unsorted").then(function (ok) { if (ok) followRename(w, ""); });
      } else if (how === "move") {
        var pick = $("wsDelTo").value;
        done = (pick === "__new" || !pick ? askName("A new workspace for its takes", "", { ok: "Move them there", placeholder: "its name" }) : Promise.resolve(pick)).then(function (to) {
          if (!to) return;
          return act({ op: "ws-merge", workspace: w, to: to }, takes.length + " moved into \u201c" + to + "\u201d; \u201c" + w + "\u201d deleted").then(function (ok) { if (ok) followRename(w, to); });
        });
      } else {
        var spare = $("wsDelSpare") && $("wsDelSpare").checked;
        var gone = takes.filter(function (r) { return !(spare && r.workspaces.length > 1); }).map(function (r) { return r.name; });
        done = api("/trash", { op: "move", names: gone }).then(function (d) {
          return act({ op: "ws-delete", workspace: w }, d.moved.length + " take" + (d.moved.length === 1 ? "" : "s") + " to the trash; \u201c" + w + "\u201d deleted" +
            (d.locked && d.locked.length ? "; " + d.locked.length + " stayed: another workspace locks them" : ""));
        }).then(function (ok) { if (ok) followRename(w, ""); if (state.hooks.refreshLibrary) state.hooks.refreshLibrary(); return load(); });
      }
      closeDialog();
      Promise.resolve(done).then(function () { paint(); paintCurrent(); });
    });
  }

  // ---- HERESY 1059: the datasheet: everything a take was made with, as Create shows it, without going there
  var MODES = { off: "Direct", plan: "Plan", full: "Full" };
  function kv(k, v) { return v === undefined || v === null || v === "" ? "" : '<div class="ds-kv"><span>' + esc(k) + "</span><b>" + esc(v) + "</b></div>"; }
  // HERESY 1128: a long name (a LoRA's path) wraps under its value instead of pushing it out; the whole id on hover
  function kvFull(k, v, full) { return '<div class="ds-kv ds-kv-long" title="' + esc(full || k) + '"><span translate="no">' + esc(k) + "</span><b>" + esc(v) + "</b></div>"; }   // 1166: a slider's or a LoRA's name
  function samplingTable(title, s) {
    if (!s) return "";
    var names = { temperature: "temperature", top_p: "top-p", top_k: "top-k", repetition_penalty: "repetition penalty", penalty_window: "penalty window", min_tokens: "min tokens", max_tokens: "max tokens" };
    return '<div class="ds-group"><div class="peek-cap">' + esc(title) + "</div>" + Object.keys(s).map(function (k) { return kv(names[k] || k, s[k]); }).join("") + "</div>";
  }
  function openDatasheet(name) {
    hidePeek();
    var h = state.hooks, t = h.findTake(name);
    if (!t) return toast("Not in the library", true);
    var back = document.createElement("div");
    back.className = "ds-back";
    back.innerHTML = '<div class="ds-box" role="dialog" aria-modal="true"><p class="row-hint">Reading the take\u2026</p></div>';
    document.body.appendChild(back);
    function close() { document.removeEventListener("keydown", key, true); back.remove(); }
    function key(e) { if (e.key === "Escape" && !document.querySelector(".hd-back")) { e.preventDefault(); e.stopPropagation(); close(); } }
    document.addEventListener("keydown", key, true);
    back.addEventListener("mousedown", function (e) { if (e.target === back) close(); });
    h.getRequest(t).then(function (q) {
      var r = rowOf(name) || {}, codes = String(q.semantic_tokens || "").split(",").filter(Boolean).length, keep = String(q.semantic_keep || "").split(",").filter(Boolean).length;
      var known = { style: 1, lyrics: 1, abc: 1, cot: 1, duration: 1, lm_seed: 1, seed: 1, solver: 1, steps: 1, abc_sampling: 1, semantic_sampling: 1, semantic_tokens: 1, semantic_keep: 1,
                    cfg_scale: 1, output_format: 1, title: 1, vae: 1, sliders: 1, loras: 1, parent: 1, plan_only: 1, mp3_bitrate: 1, peak_clip: 1, lm_batch_size: 1, synth_batch_size: 1 };
      var rest = Object.keys(q).filter(function (k) { return !known[k] && (typeof q[k] !== "object" || q[k] === null); });
      back.querySelector(".ds-box").innerHTML =
        '<div class="ds-head"><div><div class="sheet-title" translate="no">' + esc(r.title || t.title || name) + '</div><div class="coll-meta mono" translate="no">' + esc(name) + "</div>" +
        '<div class="coll-meta"><span>' + esc(h.ago(t.created)) + "</span>" + (t.seconds ? " \u00b7 <span>" + h.clock(t.seconds) + "</span>" : "") + (t.render_seconds ? " \u00b7 <span>made in " + h.clock(t.render_seconds) + "</span>" : "") +
        (t.model ? " \u00b7 <span translate=\"no\">" + esc(t.model) + "</span>" : "") + (t.truncated ? " \u00b7 <span>hit the token cap</span>" : "") + (q.parent ? " \u00b7 <span>from " + esc(q.parent) + "</span>" : "") + "</div></div>" +
        '<span class="spacer"></span><button type="button" class="btn ghost small" data-ds="json">Copy request JSON</button>' +
        '<button type="button" class="btn ghost small" data-ds="create">Open in the Creator</button><button type="button" class="btn ghost small" data-ds="close">Close</button></div>' +
        '<div class="ds-cols"><div class="ds-texts"><div class="peek-cap">Style <em>' + (q.style || "").length + ' chars</em></div><pre class="sheet-text">' + esc(q.style || "") + "</pre>" +
        '<div class="peek-cap">Lyrics</div><pre class="sheet-text ds-lyrics">' + esc(q.lyrics || "") + "</pre>" +
        // HERESY 1131 (Viktor: «нотный ряд ABC… сложенный аккордеон не нужен»): the score open and drawn, its ABC under it;
        // a Direct take writes none: the one written from its sound, or the way to write it
        '<div class="peek-cap">Score <em class="ds-score-say"></em></div><div class="ds-staff"></div>' +
        '<pre class="sheet-text mono ds-abc"' + (q.abc ? "" : " hidden") + ">" + esc(q.abc || "") + "</pre>" +
        (q.abc ? "" : '<div class="ds-noscore row-hint">A Direct take writes no score. <button type="button" class="btn ghost small" data-ds="score">Write it from the sound</button> <span class="ds-score-run mono"></span></div>') +
        "</div>" +
        '<div class="ds-knobs"><div class="ds-group"><div class="peek-cap">Song</div>' + kv("mode", MODES[q.cot] || q.cot) + kv("length asked", q.duration ? h.clock(q.duration) : "") +
        kv("format", q.output_format + (q.output_format === "mp3" ? " " + q.mp3_bitrate : "")) + kv("VAE", q.vae) + kv("peak clip", q.peak_clip) +
        kv("music codes", codes ? codes + " (" + h.clock(codes / 25) + ")" : "") + kv("kept from the parent", keep ? keep + " codes (" + h.clock(keep / 25) + ")" : "") + "</div>" +
        '<div class="ds-group"><div class="peek-cap">Sound</div>' + kv("guidance", q.cfg_scale) + kv("steps", q.steps) + kv("solver", q.solver) +
        kv("batch", (q.lm_batch_size || 1) + " \u00d7 " + (q.synth_batch_size || 1)) + "</div>" +
        '<div class="ds-group"><div class="peek-cap">Seeds</div>' + kv("music", q.lm_seed) + kv("sound", q.seed) + "</div>" +
        samplingTable("Score sampling", q.abc_sampling) + samplingTable("Music sampling", q.semantic_sampling) +
        '<div class="ds-group"><div class="peek-cap">Sliders and LoRAs</div>' +
          // HERESY 1128: as a take keeps them: sliders {id, strength}, LoRAs {id, ar, nar} (the music half's strength and the
          // sound half's); the older names (name, path, scale) still read
          ((q.sliders || []).map(function (s) {
            var v = s.strength != null ? s.strength : (s.scale != null ? s.scale : s.value);
            return kvFull(String(s.id || s.name || s.path || "slider"), v);
          }).join("") || '<div class="ds-kv"><span>sliders</span><b>none</b></div>') +
          ((q.loras || []).map(function (l) {
            var id = String(l.id || l.name || l.path || "LoRA"), parts = [];
            if (Number(l.ar)) parts.push("music " + l.ar);
            if (Number(l.nar)) parts.push("sound " + l.nar);
            if (!parts.length && l.scale != null) parts.push(String(l.scale));
            return kvFull(id.replace(/\/lora\.safetensors$/, "").replace(/\.safetensors$/, "").replace(/\//g, " / "), parts.join(" · ") || "off", id);
          }).join("") || '<div class="ds-kv"><span>LoRAs</span><b>none</b></div>') + "</div>" +
        (rest.length ? '<div class="ds-group"><div class="peek-cap">The rest</div>' + rest.map(function (k) { return kv(k, String(q[k])); }).join("") + "</div>" : "") +
        "</div></div>";
      // HERESY 1131: draw a score into the sheet (abcjs comes from the network: wait for it a little)
      var staffBox = back.querySelector(".ds-staff"), abcBox = back.querySelector(".ds-abc"), sayBox = back.querySelector(".ds-score-say");
      function drawScore(abc, tries) {
        if (!window.ABCJS) {
          if ((tries || 0) < 20) return setTimeout(function () { drawScore(abc, (tries || 0) + 1); }, 500);
          staffBox.textContent = "The engraver did not load: the ABC below is the score.";
          return;
        }
        try {
          window.ABCJS.renderAbc(staffBox, abc, { responsive: "resize", staffwidth: 900, paddingtop: 4, paddingbottom: 8,
            foregroundColor: getComputedStyle(staffBox).getPropertyValue("--paper-ink").trim() || "#111111" });   // HERESY 1167: the Creator's ink
        } catch (err) { staffBox.textContent = "This score could not be engraved; read it as ABC below."; }
      }
      function showScore(abc, note) {
        abcBox.textContent = abc; abcBox.hidden = false;
        var none = back.querySelector(".ds-noscore");
        if (none) none.remove();
        if (note) sayBox.textContent = note;
        drawScore(abc);
      }
      if (q.abc) drawScore(q.abc);
      else fetch("/lab/score?name=" + encodeURIComponent(name)).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
        if (d && d.abc) showScore(d.abc, "written from its sound by " + (d.by || "the transcriber") + (d.made ? ", " + d.made : ""));
      }).catch(function () {});
      // a Direct take's score from its sound: the engine's transcriber on the take's own audio. The page never adopts this
      // job (the cover form in the Creator is not touched): the sheet watches it itself, and the lab keeps the score.
      function scoreFromSound(btn) {
        var run = back.querySelector(".ds-score-run"), t0 = Date.now(), tick;
        btn.disabled = true;
        var said = function (text) { if (run) run.textContent = text; };
        fetch("/transcribe?take=" + encodeURIComponent(name), { method: "POST" }).then(function (r) { return r.json().then(function (b) { if (!r.ok) throw new Error(b.error || r.status); return b; }); })
          .then(function (job) {
            tick = setInterval(function () { said("the transcriber is writing it… " + Math.round((Date.now() - t0) / 1000) + " s"); }, 1000);
            var ask = function () {
              return fetch("/job?id=" + encodeURIComponent(job.id)).then(function (r) { return r.json(); }).then(function (st) {
                if (st.status === "done") return fetch("/job?id=" + encodeURIComponent(job.id) + "&result=1").then(function (r) { return r.json(); });
                if (st.status === "failed" || st.status === "cancelled") throw new Error(st.error || st.status);
                return new Promise(function (ok) { setTimeout(ok, 2000); }).then(ask);
              });
            };
            return ask();
          }).then(function (res) {
            var abc = res && res.abc;
            if (!abc) throw new Error("the transcriber wrote nothing");
            return fetch("/lab/score?name=" + encodeURIComponent(name), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ abc: abc }) })
              .then(function () { showScore(abc, "written from its sound by the transcriber (SheetSage2), now"); });
          }).catch(function (e) { said("not written: " + (e.message || e)); btn.disabled = false; })
          .then(function () { clearInterval(tick); });
      }
      back.querySelector(".ds-box").addEventListener("click", function (e) {
        var b = e.target.closest("[data-ds]");
        if (!b) return;
        if (b.dataset.ds === "close") return close();
        if (b.dataset.ds === "score") return scoreFromSound(b);
        if (b.dataset.ds === "create") { close(); h.openTake(name, "create"); return; }
        if (b.dataset.ds === "json") {
          var copy = Object.assign({}, q);
          if (copy.semantic_tokens) copy.semantic_tokens = "(" + codes + " codes, left out)";
          navigator.clipboard.writeText(JSON.stringify(copy, null, 2)).then(function () { toast("The request is on the clipboard (music codes left out)"); })
            .catch(function (e) { toast("Not copied: " + e.message, true); });
        }
      });
    }).catch(function (e) { close(); toast(e.message, true); });
  }

  // ---- HERESY 1059: "Open in Collection": the Librarian with the take in sight, flashed
  function reveal(name) {
    if (!shown().some(function (r) { return r.name === name; })) {   // out of the current view: the whole library, no search
      state.place = ""; state.q = ""; state.kinds = {}; state.derived = {};
      $("collSearch").value = "";
      Array.prototype.forEach.call(document.querySelectorAll("#collFilters .is-on"), function (b) { b.classList.remove("is-on"); });
    }
    paint();
    bringIn(name);                                  // HERESY 1167: past the cards shown: the rows up to it come in
    var card = document.querySelector('#collGrid .coll-card[data-name="' + (window.CSS && CSS.escape ? CSS.escape(name) : name) + '"]');
    if (!card) return;
    card.scrollIntoView({ block: "center", behavior: "smooth" });
    card.classList.add("is-flash");
    setTimeout(function () { card.classList.remove("is-flash"); }, 1800);
  }

  // HERESY 1049: the title edited where it stands (Enter or leaving the field keeps it, Esc does not)
  function renameIn(span, name, after) {
    if (!span || !state.hooks.rename || span.parentNode.querySelector(".coll-title-edit")) return;
    hidePeek();
    var input = document.createElement("input"), old = span.textContent, done = false;
    input.type = "text"; input.className = "coll-title-edit"; input.value = old; input.maxLength = 80;
    input.setAttribute("aria-label", "New title");
    span.hidden = true;
    span.parentNode.insertBefore(input, span);
    var card = span.closest("[draggable]");                 // HERESY 1159: the mouse selects in the field, not drags the card
    if (card) card.draggable = false;
    input.focus(); input.select();
    function finish(save) {
      if (done) return;
      done = true;
      var text = input.value;
      if (card) card.draggable = true;
      input.remove(); span.hidden = false;
      if (!save || text.trim() === old) return;
      state.hooks.rename(name, text).then(function (ok) { if (ok) return load().then(function () { if (after) after(); }); })
        .catch(function (e) { toast(e.message, true); });
    }
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); finish(true); }
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); finish(false); }
    });
    input.addEventListener("blur", function () { finish(true); });
  }

  // HERESY 1044: a note on a take (the take card edits it)
  function note(name) { var r = state.rows.filter(function (x) { return x.name === name; })[0]; return r ? r.note || "" : ""; }
  function setNote(name, text) {
    return api("/collection", { op: "note", names: [name], text: text }).then(function (d) { state.rows = d.takes || state.rows; paint(); });
  }

  // for the takes column: hidden ones stay out of it
  function isHidden(name) { return state.rows.some(function (r) { return r.name === name && r.hidden; }); }
  // HERESY 1162 (Viktor: «снимать её при первом же проигрывании трека»): the first play takes a take's freshness off
  function isFresh(name) { return state.rows.some(function (r) { return r.name === name && r.fresh; }); }
  function markPlayed(name) {
    var r = rowOf(name);
    if (!r || !r.fresh) return;
    r.fresh = false;
    Array.prototype.forEach.call(document.querySelectorAll('.is-fresh[data-name="' + (window.CSS && CSS.escape ? CSS.escape(name) : name) + '"]'),
      function (el) { el.classList.remove("is-fresh"); });
    api("/collection", { op: "played", names: [name] }).catch(function () { r.fresh = true; });
  }

  window.HeresyCollection = { init: init, reload: load, repaint: paint, paintArts: paintArts, isHidden: isHidden, isFresh: isFresh, markPlayed: markPlayed, takeLocked: takeLocked, cardExtras: cardExtras, matcher: matcher, landed: landed, inCurrent: inCurrent,
                              current: current, chooseCurrent: chooseCurrent, setCurrent: setCurrent, rating: rating, rate: rate, note: note, setNote: setNote, paintPlaying: paintPlaying, loaded: function () { return state.loaded; },
                              order: function () { return state.place === "__trash" ? [] : shown().map(function (r) { return r.name; }); },
                              datasheet: openDatasheet, reveal: function (name) { return (state.loaded ? Promise.resolve() : load()).then(function () { reveal(name); }); },
                              row: rowOf, workspaces: function () { return state.ws.slice(); }, act: act, openSheet: openSheet, requestOf: requestOf,
                              selected: names, place: function () { return state.place; }, moveTo: moveTo,
                              markFavorite: markFavorite,
                              pinned: function (name) { return ((state.pins || {})[state.place] || []).indexOf(name) >= 0; }, pin: pin,
                              pinPlaces: pinPlaces, unpinAll: unpinAll, pinTarget: pinTarget, pinIn: pinIn,   // HERESY 1167
                              isFrozen: function (name) { var r = rowOf(name); return !!(r && r.frozen); },   // HERESY 1166
                              undoable: undoable, untrash: untrash,
                              trash: function (names) { return api("/trash", { op: "move", names: names }).then(function (d) { return load().then(function () { return d; }); }); } };
})();
