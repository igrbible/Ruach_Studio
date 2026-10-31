// HERESY 1041: the Librarian, a fourth tab (Viktor, 01.10.2026): every take as a card or a row,
// searched (wildcards * and ?), filtered (what it is, what is made from it, favourites, hidden),
// sorted, grouped in workspaces (as SUNO has them), selected many at once and acted on together:
// favourite, add to or take from a workspace, hide from the list (not deleted), export as a ZIP,
// move to the trash. The trash lists what went there and gives it back, or empties it when asked;
// an automatic empty after 7, 14 or 28 days runs only once chosen. The lab keeps the marks
// (user/collection.json) and the trash (trash/DATE/TAKE); the takes stay the server's.
(function () {
  "use strict";

  // HERESY 1706 (Viktor 22.10.2026: «метку `created` замени на `raw / сырец`»): a take straight from the model is «raw»; its key stays «generated»
  var KINDS = { generated: "raw", imported: "imported", regenerated: "regenerated", rerendered: "re-rendered" };
  var DERIVED = { stems: "stems", debuzz: "debuzz", remaster: "remaster", upscale: "upscale", daw: "DAW mix", gate: "Digital Gateway", plugin: "plugin" };   // 1802: every kind
  var VIEW_KEY = "yue2.collView", SORT_KEY = "yue2.collSort", WS_KEY = "yue2.workspace";
  // HERESY 1685 (Viktor 21.10.2026: «прикрути ручку для сворачивания подкатегорий»): the workspaces whose sections are folded out of the column
  var SECFOLD_KEY = "yue2.collSecFold";
  function secFolded() { try { var v = JSON.parse(recall(SECFOLD_KEY) || "[]"); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
  function secFold(w) {
    var shut = secFolded(), i = shut.indexOf(w);
    if (i < 0) shut.push(w); else shut.splice(i, 1);
    store(SECFOLD_KEY, JSON.stringify(shut));
    paintSide();
  }
  // HERESY 1167 (Viktor: «`Sourced for Regeneration` исключай из выбора как рабочий воркспейс. Даже если в Библиотеке
  // выбрал, генерация у Творца идёт в родительский»): such a section is never the workspace in hand; its parent is
  function workable(w) { var p = String(w || "").split(" / "); return p.length > 1 && p[p.length - 1] === "Sourced for Regeneration" ? p.slice(0, -1).join(" / ") : String(w || ""); }
  function current() { var w = workable(recall(WS_KEY) || ""); return state.ws.indexOf(w) >= 0 ? w : ""; }
  var state = { rows: [], ws: [], trashDays: 0, place: "", q: "", kinds: {}, derived: {}, sel: {}, last: null,
                trash: [], tsel: {}, artBin: null, artBinErr: "", asel: {}, hooks: null, loaded: false };   // 1337: the art's trash, its ticked
  function $(id) { return document.getElementById(id); }
  function tr(s) { return window.RuachI18n ? window.RuachI18n.t(s) : s; }   // HERESY 1339: counts said inside a sentence
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
    return fetch("/lab" + path, opt).then(function (r) { return r.json().then(function (b) { if (!r.ok && r.status !== 202) { var e = new Error(b.error || r.status); e.status = r.status; throw e; } return b; }); })
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
  // HERESY 1802 (Viktor 27.10.2026: «после того как я поставил лайк… по клику на звёздочку нужно ждать иногда до 10 секунд, пока станет активной»): a
  // like's answer is the whole list as the lab read it when the like was asked; a star (a 🔥, a 💎) set while it travelled was not in it, and the
  // list put it out again until the next reload. What is set here is held as the ratings are, by its turn: a list older than it keeps it
  var held = {};
  function remember(name, value) { rated[name] = { v: value, seq: ++rateSeq }; }
  function hold(name, field, v) { (held[name] = held[name] || {})[field] = { v: v, seq: ++rateSeq }; }
  function fresh(rows, asked) {
    (rows || []).forEach(function (r) {
      var x = rated[r.name]; if (x && x.seq > asked) r.rating = x.v;
      var h = held[r.name]; if (h) Object.keys(h).forEach(function (f) { if (h[f].seq > asked) r[f] = h[f].v; });
    });
    return rows;
  }
  function load() {
    var asked = rateSeq;
    // HERESY 1846: with the catalog, the takes timed already and whether each is sung to its end (a lab without it: none marked)
    return Promise.all([api("/catalog"), api("/sung/marks").catch(function () { return { marks: {} }; })]).then(function (both) {
      var d = both[0];
      state.sung = (both[1] && both[1].marks) || {};
      if (window.ruachPaintUnsung) window.ruachPaintUnsung();   // HERESY 1854
      state.rows = fresh(d.takes || [], asked); state.ws = d.workspaces || []; state.trashDays = d.trash_days || 0; state.loaded = true; state.locks = d.locks || {}; state.pins = d.pins || {};
      state.loadStatus = 200;                      // HERESY 1434
      state.frozen = d.frozen || [];               // HERESY 1166
      state.blind = d.blind || [];                 // HERESY 1874
      state.playlist = d.playlist || []; state.plXfade = d.playlist_xfade || 0;   // HERESY 1731
      state.wsNotes = d.ws_notes || {};            // HERESY 1802
      firstWs();                                   // HERESY 1434
      var names = {};
      state.rows.forEach(function (r) { names[r.name] = 1; });
      Object.keys(state.sel).forEach(function (n) { if (!names[n]) delete state.sel[n]; });
      paint();
      paintCurrent();
      if (state.hooks.libraryChanged) state.hooks.libraryChanged();
    }).catch(function (e) {
      state.loadStatus = (e && e.status) || 0;     // HERESY 1434: 404, no Librarian in this studio; else one that does not answer
      $("collGrid").innerHTML = '<p class="row-hint">The Librarian lives in Forge\'s lab, which does not answer: ' + esc(e.message) + "</p>";
    });
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
  // HERESY 1169 (Viktor 08.10.2026: «всё, что с начальным диамандом 💎, чтобы алфавитно шло вниз древа. Там мои пробы и семплы
  // глобально публичные»): the 💎 workspaces (the public sets) at the tree's foot, in their own order by name without the 💎
  // «И суфиксные `💎 ... LoRA` гони в самый низ как вечное правило. Мы на будущее проектируем»: a 💎 one named «… LoRA» lower still
  var DIAMOND = /^\s*\uD83D\uDC8E\s*/, LORA_END = /\bLoRAs?\s*$/i;
  function treeRank(top) { return !DIAMOND.test(top) ? 0 : LORA_END.test(top) ? 2 : 1; }
  function treeOrder(list) {                     // a parent, then its sections, whatever names stand between them
    return list.slice().sort(function (a, b) {
      var A = wsParts(a), B = wsParts(b), rA = treeRank(A[0]), rB = treeRank(B[0]);
      if (rA !== rB) return rA - rB;
      if (rA) { A[0] = A[0].replace(DIAMOND, ""); B[0] = B[0].replace(DIAMOND, ""); }
      for (var i = 0; i < Math.min(A.length, B.length); i++) if (A[i] !== B[i]) return A[i] < B[i] ? -1 : 1;
      return A.length - B.length;
    });
  }
  window.ruachTreeOrder = treeOrder;   // for the checks
  // HERESY 1166 (Viktor: «Деактивация воркспейса. Замораживаются все треки в этом представлении, никаких действий по ним,
  // в `All Workspaces` и в поиске не отображаются. Сам деактивированный воркспейс немного засЕривается»): a take frozen with
  // its workspace (the lab says which: in no workspace that is not frozen) shows only inside it, greyed, heard and read
  // HERESY 1167 (Viktor: «как в SUNO… дизлайк прятал трек, не удаляя»): a disliked take leaves the lists unless this says
  // show them (the Librarian's box, the column's ⋯: one setting); the 👎 chip shows them whatever it says
  var DISLIKED_KEY = "yue2.showDisliked";
  var DIS_TIP = "Dislike: the take leaves the lists while «Show disliked takes in the lists» is off (Engine → Defaults); «Only the disliked» still finds it";   // HERESY 1820
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
  function blindWs(w) { return (state.blind || []).some(function (b) { return w === b || String(w).indexOf(b + SEP) === 0; }); }   // HERESY 1874
  function isBlind(name) { var r = rowOf(name); return !!(r && r.blind); }
  function frozenWs(w) { return (state.frozen || []).some(function (f) { return w === f || String(w).indexOf(f + SEP) === 0; }); }
  // HERESY 1434 (Viktor 14.10.2026: «В наши 💎 пространства и их сабы - запрет генерации»): a 💎 set and its sections, or a frozen
  // workspace, take no new take; the workspace in hand for new takes is one that does («» when there is none)
  function closedWs(w) { return DIAMOND.test(wsParts(w)[0] || "") || frozenWs(w); }
  function landable() { var c = current(); return c && !closedWs(c) ? c : ""; }
  // a new install has a workspace in hand from the start: «My songs», made once when none takes new takes
  function firstWs() {
    var open = state.ws.filter(function (w) { return !closedWs(w) && wsLeaf(w) !== SOURCED; });
    // the only workspace that takes new takes, none in hand: in hand, unasked (Viktor: «Пространство всегда должно быть выбрано»)
    if (state.loaded && !landable() && open.length === 1) { setCurrent(open[0], true); return Promise.resolve(open[0]); }
    if (!state.loaded || open.length) return Promise.resolve(landable());
    if (state.making) return state.making;             // one making at a time
    var name = tr("My songs");
    state.making = act({ op: "ws-create", workspace: name }, "", true).then(function (ok) {
      state.making = null;
      if (ok) { setCurrent(name, true); toast(tr("Workspace “{0}” made and in hand: new takes land in it").replace("{0}", name)); }
      return ok ? name : "";
    });
    return state.making;
  }
  function iceHere(r) { return !r.frozen || (!!state.place && state.place.charAt(0) !== "_" && frozenWs(state.place)); }
  // HERESY 1169 · 1241 (Viktor 08.10.2026: «трансформируй полосу фильтров показа карточек… Идея фильтра SUNO, с чекбоксами, логикой AND, OR, NOR»): what can be ticked, and how a take answers each
  // HERESY 1873: a take's reactions, by their emotional zones (the lab's own order): [key, face, word, zone]
  var REACTS = [["love", "❤️‍🔥", "Burning love", "Love"], ["adore", "🥰", "Tenderness", "Love"], ["hundred", "💯", "Spot on", "A hit"], ["party", "🎉", "A win", "A hit"], ["lol", "🤣", "Hilarious", "Laughter"], ["mindblown", "🤯", "Mind blown", "Wonder"], ["wow", "😮", "Wow", "Wonder"], ["tears", "😭", "To tears", "Tears"], ["think", "🤔", "Makes me think", "Thought"], ["look", "👀", "Worth a closer look", "Thought"], ["nerd", "🤓", "Clever", "Thought"], ["peek", "🫣", "Awkward to hear", "Awkward"], ["melt", "🫠", "Melting away", "Awkward"], ["poop", "💩", "Crap", "Refusal"]];
  var FILTERS = [
    { label: "Made", items: [["generated", "raw", "sparkles"], ["imported", "imported", "import"], ["regenerated", "regenerated", "refresh"], ["rerendered", "re-rendered", "waveform"]] },
    { label: "Marked", items: [["__liked", "liked", "like"], ["__disliked", "disliked", "dislike"], ["__starred", "favourites", "star"], ["__unrated", "no like or dislike", "filter-x"], ["__note", "with a note", "note"], ["__art", "with artwork", "image"], ["__protected", "protected", "shield"], ["__fire", "on fire", "flame"], ["__gem", "gems", "gem"]] },
    { label: "Has", items: [["stems", "stems", "layers"], ["debuzz", "debuzz", "eraser"], ["remaster", "remaster", "sliders"], ["upscale", "upscale", "chevrons-up"], ["daw", "DAW mix", "music"], ["gate", "Digital Gateway", "gauge"], ["plugin", "plugin", "braces"]] }
  ];
  // HERESY 1802 (Viktor 27.10.2026: «На карточках наш Огранщик рисует свои прометки, но что это - одному Клоду известно»): this map was named DERIVED
  // too, declared again over the names above in the same scope, so a card said «1» where it meant stems, Debuzz, a remaster or an upscale
  var HAS = { stems: 1, debuzz: 1, remaster: 1, upscale: 1, daw: 1, gate: 1, plugin: 1 }, LOGIC_KEY = "yue2.collLogic";
  function filterTest(v) {
    if (HAS[v]) return function (r) { return (r.derived || []).indexOf(v) >= 0; };
    if (v === "__liked") return function (r) { return r.rating > 0; };
    if (v === "__disliked") return function (r) { return r.rating < 0; };
    if (v === "__unrated") return function (r) { return !r.rating; };   // HERESY 1877
    if (v === "__starred") return function (r) { return !!r.favorite; };
    if (v === "__note") return function (r) { return !!r.note; };
    if (v === "__protected") return function (r) { return !!r.protected; };   // HERESY 1368
    if (v === "__fire" || v === "__gem") return function (r) { return markOf(r.name, v.slice(2)); };   // HERESY 1802
    if (v === "__art") return function (r) { return !!(window.HeresyArt && window.HeresyArt.url(r.name)); };
    return function (r) { return r.kind === v; };
  }
  function filterOn() { return Object.keys(state.kinds).concat(Object.keys(state.derived)); }
  function passes(r, on, logic) {
    if (!on.length) return true;
    var hits = on.filter(function (v) { return filterTest(v)(r); }).length;
    return logic === "or" ? hits > 0 : logic === "nor" ? hits === 0 : hits === on.length;
  }
  // HERESY 1863 (Viktor 29.10.2026: «режим "Shuffled / Вперемешку". Так мне будет меньше шанса схалтурить во время прослушки»): each take its own
  // random place, kept while the list repaints, dealt anew when «shuffled» is chosen again and on every load
  var DEAL = {};
  function dealt(name) { if (!(name in DEAL)) DEAL[name] = Math.random(); return DEAL[name]; }
  function shown() {
    var m = matcher(state.q), on = filterOn(), logic = state.logic || "and";
    var rows = state.rows.filter(function (r) {
      if (!iceHere(r)) return false;               // HERESY 1166
      if (state.place === "__fav" && !r.favorite) return false;
      if (state.place === "__pinned" && !pinnedAll()[r.name]) return false;   // HERESY 1105
      if (state.place === "__none" && r.workspaces.length) return false;   // HERESY 1058
      if (state.place === "__hidden") { if (!r.hidden) return false; }
      else if (r.hidden) return false;
      if (r.rating < 0 && !showDis() && !(state.kinds.__disliked && logic !== "nor")) return false;   // HERESY 1167; 1241: shown when the filter asks for the disliked
      if (state.place && state.place.charAt(0) !== "_" && !inTree(r, state.place)) return false;   // its sections too (1161)
      if (!passes(r, on, logic)) return false;   // HERESY 1169 · 1241: the ticked filters, joined AND, OR or NOR
      // HERESY 1167: a take's workspaces and sections are searched too (a section's name finds its takes)
      return m(r.title) || m(r.name) || (r.note && m(r.note)) || r.workspaces.some(function (w) { return m(w); });
    });
    var sort = recall(SORT_KEY) || "new";
    rows.sort(function (a, b) {
      if (sort === "old") return (a.created || 0) - (b.created || 0);
      if (sort === "title") return fold(a.title).localeCompare(fold(b.title));
      if (sort === "long") return (b.seconds || 0) - (a.seconds || 0);
      if (sort === "shuffle") return dealt(a.name) - dealt(b.name);   // HERESY 1863
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
    // HERESY 1685: which workspaces have sections (a handle on their row), which are folded, and the rows a folded parent keeps out of sight
    var secShut = secFolded(), secHas = {};
    state.ws.forEach(function (w) { var p = wsParts(w); for (var i = 1; i < p.length; i++) secHas[p.slice(0, i).join(SEP)] = 1; });
    var secAway = function (w) { var p = wsParts(w); for (var i = 1; i < p.length; i++) if (secShut.indexOf(p.slice(0, i).join(SEP)) >= 0) return true; return false; };
    var secHandle = function (w) {
      if (!secHas[w]) return "";
      var open = secShut.indexOf(w) < 0;
      return '<span class="coll-sec-fold" data-sec-fold="' + esc(w) + '" role="button" aria-expanded="' + open + '" title="' + (open ? "Fold its sections" : "Unfold its sections") + '"></span>';
    };
    var pinAll = pinnedAll(), pinN = state.rows.filter(function (r) { return pinAll[r.name] && !r.hidden && !r.frozen; }).length;
    // HERESY 1731: the playlist at the very top, never renamed or deleted (a place of the studio's own, as Favourites)
    $("collSide").innerHTML = item("__playlist", "\u25b6 Playlist", plRows().length) +
      item("", "All Workspaces", counts[""]) + item("__fav", "★ Favourites", counts.__fav) +
      item("__pinned", "\ud83d\udccc Pinned", pinN) +
      item("__none", "Not in a workspace", counts.__none) +
      '<div class="coll-cap">Workspaces</div>' + treeOrder(state.ws).map(function (w) {
        var ice = (frozenWs(w) ? '<span class="coll-ice" title="Frozen: its takes are heard, never changed">\u2744</span>' : "") +   // HERESY 1166
          ((state.blind || []).indexOf(w) >= 0 ? '<span class="coll-blind" data-tip="Blind: what made its takes is hidden">\ud83d\ude48</span>' : "");   // HERESY 1874
        var lk = (state.locks || {})[w] || {}, lock = ice + (lk.workspace || lk.tracks ?   // HERESY 1070
          '<span class="coll-lock" title="' + (lk.workspace ? "the workspace is locked against deletion" : "") + (lk.workspace && lk.tracks ? "; " : "") + (lk.tracks ? "its takes are locked against deletion" : "") + '">\ud83d\udd12</span>' : "");
        var depth = wsParts(w).length;               // a section: its own name, indented under its parent (1161)
        return item(w, depth > 1 ? wsLeaf(w) : w, perWs[w] || 0, depth < 2 || !STUDIO_SECTIONS[wsLeaf(w)]).replace('class="coll-place', 'class="coll-place' + (depth > 1 ? " is-sub d" + depth : "") + (frozenWs(w) ? " is-frozen" : "") +
            (secAway(w) ? " is-sec-away" : "") + (secShut.indexOf(w) >= 0 && String(state.place || "").indexOf(w + SEP) === 0 ? " has-on-inside" : ""))
          .replace('<button type="button" ', '<button type="button" ' + wsTip(w))   // HERESY 1802: its note under the pointer
          .replace('<span class="coll-n">', lock + secHandle(w) + '<span class="coll-ws-more" data-ws-menu="' + esc(w) + '" title="Rename, delete, lock, a section…" role="button">\u22ef</span><span class="coll-n">');
      }).join("") +
      '<button type="button" class="coll-place coll-new" data-ws-new="1">+ New workspace</button>' +
      '<button type="button" class="coll-place coll-new coll-hub" data-ws-hub="1">\ud83d\udc8e From Hugging Face\u2026</button>' +   // HERESY 1166
      '<div class="coll-cap">Out of sight</div>' + item("__hidden", "Hidden", counts.__hidden) + item("__trash", "Trash", state.trash.length || undefined) +
      item("__trash_art", "Trash (Art)", artCount() || undefined);   // HERESY 1337
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
    // HERESY 1688: the room's head sticks over the column; the column sticks under it, as high as the head stands now
    var head = document.querySelector("#view-collection .coll-head"), lay = side.closest(".coll-layout"), hs = head && getComputedStyle(head);
    if (lay) lay.style.setProperty("--coll-side-top", (hs && hs.position === "sticky" ? Math.max(8, Math.round(head.offsetHeight + (parseFloat(hs.top) || 0) + 8)) : 8) + "px");
    var bottom = window.innerHeight, pb = document.getElementById("playbar"), dock = document.querySelector(".log-dock");
    if (pb && getComputedStyle(pb).display !== "none") bottom = Math.min(bottom, pb.getBoundingClientRect().top);
    var sr = side.getBoundingClientRect(), dr = dock && getComputedStyle(dock).display !== "none" ? dock.getBoundingClientRect() : null;
    if (dr && dr.left < sr.right && dr.right > sr.left) bottom = Math.min(bottom, dr.top);   // the log box only where it is above the column
    // HERESY 1733: measured where it sticks, not where the room's end pushed it up for a moment (that made it taller each time, its foot under the player)
    var room = side.closest("[id^='view-']"), rr = room && room.getBoundingClientRect(), top = side.getBoundingClientRect().top;
    if (rr) {
      top = Math.max(top, rr.top + (parseFloat(getComputedStyle(room).paddingTop) || 0) + (parseFloat(getComputedStyle(side).top) || 0));   // it sticks below the room's padding
      bottom = Math.min(bottom, rr.bottom);
    }
    side.style.maxHeight = Math.max(160, Math.floor(bottom - top - 10)) + "px";
    // HERESY 1802 (Viktor 27.10.2026: «При Тяжёлой перезагрузке страницы Библиотекаря пусть активный воркспейс в левой колонке центруется максимально
    // при жирном списке»): once a page, when the column first stands with its list, its lit place in the middle of what the column shows
    if (!state.centred && state.loaded && side.clientHeight > 0) {
      state.centred = true;
      var lit = side.querySelector(".coll-place.is-on");
      if (lit && side.scrollHeight > side.clientHeight)
        side.scrollTop = Math.max(0, side.scrollTop + lit.getBoundingClientRect().top - side.getBoundingClientRect().top - (side.clientHeight - lit.offsetHeight) / 2);
    }
  }
  function fitSideSoon() { if (!sideFrame) sideFrame = requestAnimationFrame(function () { sideFrame = 0; fitSide(); }); }
  function watchSide() {
    var room = $("collSide").closest("[id^='view-']") || document.getElementById("view-collection");
    window.addEventListener("resize", fitSideSoon);
    if (room) {
      room.addEventListener("scroll", fitSideSoon, { passive: true });
      if (window.ResizeObserver) new ResizeObserver(fitSideSoon).observe(room);   // shown, hidden, the window resized
      var head = room.querySelector(".coll-head");                                   // HERESY 1688: the head's counts wrapping or not
      if (head && window.ResizeObserver) new ResizeObserver(fitSideSoon).observe(head);
    }
  }

  function ico(name) { return window.HeresyIcons && window.HeresyIcons.ui ? window.HeresyIcons.ui(name) : ""; }   // HERESY 1051
  // HERESY 1165: the plan mode by the name the form gives it (the card said its raw value, off), so it reads and translates
  function cotWord(c) { return { off: "direct", full: "full plan", melody: "melody only" }[c] || c; }
  function badge(text, cls) { return '<span class="coll-badge ' + (cls || "") + '">' + esc(text) + "</span>"; }
  // HERESY 1906 (Viktor 29.10.2026: «Как мне понять по меткам на карточках, какая реально — рефайн?»): a workspace's badge as the heading draws it: the name
  // kept as typed, the studio's own sections («Refined» → «Огранённые») in the page's language
  function wsBadge(w) {
    return '<span class="coll-badge w">' + wsParts(w).map(function (p, i) {
      return "<span" + (i && STUDIO_SECTIONS[p] ? "" : ' translate="no"') + ">" + esc(p) + "</span>";
    }).join(esc(SEP)) + "</span>";
  }
  function sungMark(name, done) {                     // HERESY 1854: what a timing found, on the cards and in the player at once
    state.sung = state.sung || {}; state.sung[name] = done;
    if (window.ruachPaintUnsung) window.ruachPaintUnsung();
  }
  function unsungBadge(name) {                       // HERESY 1846: its timing heard its lyrics stop before their end
    return (state.sung || {})[name] === false ? '<span class="coll-badge unsung" data-tip="' + esc(tr("The end not sung: its last lines were not heard; Sung to the end? in its datasheet says which")) + '">' + esc(tr("end not sung")) + "</span>" : "";
  }
  function dbadge(k) {                               // HERESY 1802: what the Refiner made from it, by its name, the why under the pointer
    var name = DERIVED[k] || k;
    return '<span class="coll-badge d" data-tip="Made from it in the Refiner: ' + esc(name) + '">' + esc(name) + "</span>";
  }

  // HERESY 1368 (Viktor 11.10.2026: «И на аудио треки в студии тоже защиту добавь в опцию и в фильтр в Библиотеке не забудь эту
  // опцию»): the shield beside the star; lit, the take never goes to the trash nor is deleted for good
  var PROT_ON = "This take is protected: never to the trash, never deleted; the shield takes the protection off";
  var PROT_OFF = "Protect this take: never to the trash, never deleted for good";
  function protBtn(r, data, named) {                 // HERESY 1434: named, the takes' list's rule (its name, no tip)
    return '<button type="button" class="coll-act prot" ' + data + ' aria-pressed="' + !!r.protected + '" aria-label="' + (r.protected ? "Take its protection off" : "Protect it") +
      '"' + (named ? "" : ' data-tip="' + (r.protected ? PROT_ON : PROT_OFF) + '"') + ">" + ico("shield") + "</button>";
  }
  // HERESY 1082: the Librarian's marks for a take in the Creator's column: derived, workspaces, like, dislike, note
  function cardExtras(name) {
    var r = rowOf(name);
    if (!r) return "";
    return '<div class="take-extra"><span class="coll-badges">' + r.derived.map(dbadge).join("") +
      r.workspaces.map(function (w) { return wsBadge(w); }).join("") + unsungBadge(name) + "</span>" +
      '<span class="take-rate"><button type="button" class="coll-act" data-lrate="1" data-name="' + esc(name) + '" aria-pressed="' + (r.rating > 0) + '" aria-label="Like">' + ico("like") + "</button>" +
      markBtns(name) +                                 // HERESY 1802: 🔥 💎 after 👍
      '<button type="button" class="coll-act" data-lrate="-1" data-name="' + esc(name) + '" aria-pressed="' + (r.rating < 0) + '" aria-label="Dislike" data-tip="' + DIS_TIP + '">' + ico("dislike") + "</button>" +
      // HERESY 1167 (Viktor: «У Творца во фрейме Takes… И нет звёздочки»): the favourite beside them, as on the Librarian's cards
      '<button type="button" class="coll-act fav" data-lfav="1" data-name="' + esc(name) + '" aria-pressed="' + favOf(name, r) + '" aria-label="Favourite" data-tip="Favourite">' + ico("star") + "</button>" +
      protBtn(r, 'data-lprot="1" data-name="' + esc(name) + '"', true) +
      noteBtn(r, 'data-lnote="' + esc(name) + '"') + "</span></div>";   // HERESY 1825: on every card, grey without a note
  }
  function favOf(name, r) { var t = state.hooks && state.hooks.findTake ? state.hooks.findTake(name) : null; return t ? !!t.favorite : !!r.favorite; }
  // HERESY 1802 (Viktor 27.10.2026: «Может давай повсюду в Студии прикрутим к картам треков 🔥 и 💎? После кнопки thumbup?»): two marks of a take's own
  // after 👍 wherever a take shows its marks (the cards, the Creator's takes, the sheet, the take's head, the player); on or off, seen at once,
  // confirmed by the lab, held over an older list as the star is; one handler for all of them (data-hmark)
  var MARKS = [["fire", "flame", "On fire"], ["gem", "gem", "A gem"]];
  function markOf(name, m) { var r = rowOf(name), h = held[name] && held[name][m]; return h ? !!h.v : !!(r && r[m]); }
  function markBtns(name, cls) {
    return MARKS.map(function (k) {
      var on = markOf(name, k[0]);
      return '<button type="button" class="' + (cls || "coll-act") + " hmark hmark-" + k[0] + '" data-hmark="' + k[0] + '" data-name="' + esc(name) + '" aria-pressed="' + on +
        '" aria-label="' + k[2] + '" data-tip="' + k[2] + '">' + ico(k[1]) + "</button>";
    }).join("") + reactBtn(name, cls);                 // HERESY 1873: the take's reaction after 🔥 💎
  }
  // HERESY 1873 (Viktor 29.10.2026: «как на Фейсбуке сделаем полосу с emoji?»; «выбранной реакцией заменяй кнопку плюса. Так не будет сдвигов в
  // полосе… иконку в ту полосу 14 в самом начале добавь на обнуление реакции»): one reaction a take. The button is its face, or a smile with a plus
  // when there is none, so the row never moves; a click opens the palette by zones: «No reaction» first, a face sets it (the chosen one again takes
  // it off), and the palette closes. Kept by the lab, seen at once wherever the take shows its marks
  var REACT_ADD = '<svg class="ui-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M21 12a9 9 0 1 1-6.2-8.56"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><path d="M9 9h.01M15 9h.01"/><path d="M19 2v6M16 5h6"/></svg>';
  var REACT_NONE = '<svg class="ui-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/></svg>';
  function reactOf(name) {
    var h = held[name] && held[name].react, r = rowOf(name);
    return (h ? h.v : (r && r.react)) || "";
  }
  function reactRow(key) { return REACTS.filter(function (x) { return x[0] === key; })[0] || null; }
  function reactFace(name) { var x = reactRow(reactOf(name)); return x ? '<span class="hreact-e">' + x[1] + "</span>" : REACT_ADD; }
  function reactTip(name) { var x = reactRow(reactOf(name)); return x ? tr(x[2]) + " \u00b7 " + tr("a click changes it or takes it off") : "Reactions: a click opens them all, by zones"; }
  function reactBtn(name, cls) {
    return '<button type="button" class="' + (cls || "coll-act") + ' hreact" data-hreact="' + esc(name) + '" aria-haspopup="dialog" aria-pressed="' + !!reactOf(name) +
      '" aria-label="Reactions" data-tip="' + esc(reactTip(name)) + '">' + reactFace(name) + "</button>";
  }
  var reactPal = null;
  // HERESY 1877 (Viktor 29.10.2026: «прорисовываем эту реакцию, едва заметную монотонную в песочном бекграунде карточки. И эту опцию в юзерские
  // предпочтения в Движке»): Engine → Defaults → «A take's reaction faint in its card's background», off unless ticked
  function reactMark(name) {
    var on = false;
    try { on = localStorage.getItem("yue2.reactMark") === "on"; } catch (e) { on = false; }
    var x = on ? reactRow(reactOf(name)) : null;
    return x ? '<span class="coll-react-wm" aria-hidden="true">' + x[1] + "</span>" : "";
  }
  function reactPaint(name) {
    Array.prototype.forEach.call(document.querySelectorAll("[data-hreact]"), function (b) {
      if (b.dataset.hreact !== name) return;
      b.innerHTML = reactFace(name);
      b.setAttribute("aria-pressed", String(!!reactOf(name)));
      b.dataset.tip = reactTip(name);
    });
  }
  function setReact(name, key) {
    var r = rowOf(name), asked = rateSeq, was = reactOf(name);
    key = reactRow(key) ? key : "";
    hold(name, "react", key);
    if (r) r.react = key;
    reactPaint(name);
    return api("/collection", { op: "react", react: key, names: [name] }).then(function (d) {
      state.rows = d.takes ? fresh(d.takes, asked) : state.rows; paint(); reactPaint(name);
      if (state.hooks.libraryChanged) state.hooks.libraryChanged();
    }, function (e) { hold(name, "react", was); if (r) r.react = was; reactPaint(name); toast(e.message, true); });
  }
  function reactClose() {
    if (!reactPal) return;
    reactPal.el.remove();
    if (reactPal.from && reactPal.from.isConnected) reactPal.from.setAttribute("aria-expanded", "false");
    reactPal = null;
  }
  function reactOpen(btn) {
    var name = btn.dataset.hreact;
    if (reactPal && reactPal.name === name && reactPal.from === btn) return reactClose();
    reactClose();
    var el = document.createElement("div"), on = reactOf(name), zones = [];
    el.className = "hreact-pal";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", "Reactions");
    REACTS.forEach(function (x) { if (zones.indexOf(x[3]) < 0) zones.push(x[3]); });
    el.innerHTML = '<div class="hreact-zone hreact-clear"><div class="hreact-row"><button type="button" class="hreact-pick" data-hreact-key="" aria-pressed="' + !on +
      '" aria-label="No reaction" data-tip="No reaction">' + REACT_NONE + '</button></div><div class="hreact-z" aria-hidden="true">\u00a0</div></div>' +
      zones.map(function (z) {
        return '<div class="hreact-zone"><div class="hreact-row">' + REACTS.filter(function (x) { return x[3] === z; }).map(function (x) {
          return '<button type="button" class="hreact-pick" data-hreact-key="' + x[0] + '" aria-pressed="' + (on === x[0]) + '" aria-label="' + x[2] + '" data-tip="' + x[2] + '">' +
            '<span class="hreact-e">' + x[1] + "</span></button>";
        }).join("") + '</div><div class="hreact-z">' + z + "</div></div>";
      }).join("");
    document.body.appendChild(el);
    reactPal = { el: el, name: name, from: btn };
    btn.setAttribute("aria-expanded", "true");
    var b = btn.getBoundingClientRect(), p = el.getBoundingClientRect(), gap = 8;
    var top = b.top - p.height - gap >= 8 ? b.top - p.height - gap : Math.min(window.innerHeight - p.height - 8, b.bottom + gap);   // above it, as Facebook's, else below
    var left = Math.max(8, Math.min(window.innerWidth - p.width - 8, b.left + b.width / 2 - p.width / 2));
    el.style.top = Math.round(top) + "px"; el.style.left = Math.round(left) + "px";
    el.addEventListener("click", function (e) {
      var k = e.target.closest("[data-hreact-key]");
      if (!k) return;
      e.preventDefault(); e.stopPropagation();
      var key = k.dataset.hreactKey;
      setReact(name, key && key !== reactOf(name) ? key : "");
      reactClose();
    });
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-hreact]");
    if (!b || !b.dataset.hreact) return;
    e.preventDefault(); e.stopPropagation();
    reactOpen(b);
  }, true);
  document.addEventListener("mousedown", function (e) {
    if (reactPal && !reactPal.el.contains(e.target) && !(e.target.closest && e.target.closest("[data-hreact]"))) reactClose();
  }, true);
  window.addEventListener("keydown", function (e) {   // before the windows' own keys (the compare closes on Esc): the palette first
    if (reactPal && e.key === "Escape") { e.preventDefault(); e.stopPropagation(); reactClose(); }
  }, true);
  window.addEventListener("resize", reactClose);
  function paintMarks(name) {
    Array.prototype.forEach.call(document.querySelectorAll("[data-hmark]"), function (b) {
      if (b.dataset.name === name) b.setAttribute("aria-pressed", String(markOf(name, b.dataset.hmark)));
    });
    reactPaint(name);                                  // HERESY 1873
  }
  function setMark(name, m, on) {
    var r = rowOf(name), asked = rateSeq;
    hold(name, m, on);
    if (r) r[m] = on;
    paintMarks(name);
    return api("/collection", { op: "mark", mark: m, names: [name], on: on }).then(function (d) {
      state.rows = d.takes ? fresh(d.takes, asked) : state.rows; paint(); paintMarks(name);
      if (state.hooks.libraryChanged) state.hooks.libraryChanged();
    }, function (e) { hold(name, m, !on); if (r) r[m] = !on; paintMarks(name); toast(e.message, true); });
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-hmark]");
    if (!b || !b.dataset.name) return;
    e.preventDefault(); e.stopPropagation();
    setMark(b.dataset.name, b.dataset.hmark, !markOf(b.dataset.name, b.dataset.hmark));
  }, true);

  // HERESY 1166: a frozen card's check, rename and actions answer nothing; its play button and its title still do
  function iceCards() {
    Array.prototype.forEach.call($("collGrid").querySelectorAll(".coll-card.is-frozen"), function (c) {
      c.setAttribute("draggable", "false");
      Array.prototype.forEach.call(c.querySelectorAll(".coll-check input, .coll-ren, .coll-act"), function (b) { b.disabled = true; });
    });
  }
  function paint() {
    paintSide();
    var trash = inTrash();                                 // HERESY 1337: the takes' trash or the art's
    $("collBar").hidden = trash; $("collTrashBar").hidden = !trash; $("collSlot").hidden = trash; $("collHeadTools").hidden = trash;
    $("collTrashDays").closest("label").style.display = state.place === "__trash_art" ? "none" : "";   // the takes' trash's own
    if (state.place === "__trash_art") return paintArtBin();
    if (trash) return paintTrash();
    // HERESY 1731: the playlist's own view, no tiles, no filter, no bar, no pins
    var plOn = state.place === "__playlist";
    $("collBar").hidden = plOn; $("collSlot").hidden = plOn; $("collHeadTools").hidden = plOn;
    if (plOn) return plPaint();
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
    return [state.place, state.q, JSON.stringify(state.kinds), JSON.stringify(state.derived), state.logic, recall(SORT_KEY) || "new", recall(VIEW_KEY) || "tiles"].join("|");
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
    if (!s || s.hidden || inTrash() || LAZY.shown >= LAZY.rows.length) return;
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
      return '<article class="coll-card' + (sel ? " is-sel" : "") + (r.hidden ? " is-hidden-take" : "") + (r.frozen ? " is-frozen" : "") + (r.fresh ? " is-fresh" : "") + (window.HeresyRegen && window.HeresyRegen.has(r.name) ? " is-regenerating" : "") + (mine ? " is-current" : "") + (mine && now.playing ? " is-sounding" : "") + (art ? " has-art" : "") + '" data-name="' + esc(r.name) + '"' + sandAt(r.name) + ' draggable="true">' + reactMark(r.name) +   // HERESY 1877
        '<label class="coll-check"><input type="checkbox" data-sel="' + esc(r.name) + '"' + (sel ? " checked" : "") + ' aria-label="Select" /></label>' +
        '<button type="button" class="coll-play' + (mine && now.playing ? " is-playing" : "") + '" data-play="' + esc(r.name) + '" aria-label="' + (mine && now.playing ? "Pause" : "Play") + '">' + ico(mine && now.playing ? "pause" : "play") + "</button>" +
        '<div class="coll-body"><div class="coll-title"><span class="coll-title-text" data-open="' + esc(r.name) + '">' + esc(r.title) + "</span>" +
        '<button type="button" class="coll-ren" data-ren="' + esc(r.name) + '" title="Rename" aria-label="Rename">✎</button></div>' +
        // HERESY 1165: each piece its own text, so the words among the numbers translate (heresy-i18n.js matches whole texts)
        '<div class="coll-meta">' + (state.hooks.when ? state.hooks.when(r.created, r.name) : "<span>" + esc(r.created ? ago(r.created) : "") + "</span>") + (r.seconds ? " · <span>" + clock(r.seconds) + "</span>" : "") /* HERESY 1720 */ + (r.cot ? " · <span>" + esc(cotWord(r.cot)) + "</span>" : "") + "</div>" +
        '<div class="coll-badges">' + badge(KINDS[r.kind] || r.kind, "k-" + r.kind) + r.derived.map(dbadge).join("") +
        r.workspaces.map(function (w) { return wsBadge(w); }).join("") +
        // HERESY 1162: what it was made again from, on its card
        (r.regen_of ? '<span class="coll-badge rg" data-tip="Regenerated with a new seed from ' + esc(r.regen_of) + '">regen</span>' : "") + unsungBadge(r.name) + "</div>" +
        "</div>" +
        // HERESY 1155 (Viktor: «Не уходим из студии в другие окна и вкладки, если не нужно»): the whole picture over the page
        (art ? '<button type="button" class="coll-art" data-art="' + esc(r.name) + '" style="background-image:url(&quot;' + esc(art) + '&quot;)" data-tip="The artwork: see it whole" aria-label="The artwork"></button>' : "") +
        // HERESY 1048: like, dislike, favourite, Post and the menu, on the card itself
        '<div class="coll-acts"><button type="button" class="coll-act" data-crate="1" aria-pressed="' + (r.rating > 0) + '" aria-label="Like">' + ico("like") + '</button>' +
        markBtns(r.name) +                             // HERESY 1802: 🔥 💎 after 👍
        '<button type="button" class="coll-act fav" data-cfav="1" aria-pressed="' + r.favorite + '" aria-label="Favourite" data-tip="Favourite">' + ico("star") + "</button>" +
        protBtn(r, 'data-cprot="1"') +
        // HERESY 1900 (Viktor 29.10.2026: «дизлайк вынеси из общей полосы реакций и тоже обособь… после щита защиты, чтобы ненароком не кликнуть пальцем вниз»)
        '<button type="button" class="coll-act coll-dis" data-crate="-1" aria-pressed="' + (r.rating < 0) + '" aria-label="Dislike" data-tip="' + DIS_TIP + '">' + ico("dislike") + '</button>' +
        // HERESY 1058: a note is a mark at the row's end (its words on hover, the sheet to edit), so cards keep one height; 1825: on every card, a click writes it
        noteBtn(r, 'data-cnote="' + esc(r.name) + '"') +
        // HERESY 1900 («уведи вправо троеточие… иконку заметки поставь перед троеточием с небольшим отступом»): ⋯ last, at the strip's right end
        '<button type="button" class="coll-act coll-more-btn" data-cmenu="1" title="More (or right-click the card)" aria-label="More">\u22ef</button>' + "</div></article>";
    }
  }
  function placeRows() {   // the takes of the place open (HERESY 1169 · 1241: the head's counts and the filter window's)
    return state.rows.filter(function (r) {
      if (state.place === "__fav") return r.favorite && !r.hidden;
      if (state.place === "__pinned") return !!pinnedAll()[r.name] && !r.hidden;
      if (state.place === "__none") return !r.workspaces.length && !r.hidden;
      if (state.place === "__hidden") return r.hidden;
      if (state.place) return !r.hidden && inTree(r, state.place);     // HERESY 1161: with its sections
      return !r.hidden;
    }).filter(iceHere);                            // HERESY 1166: frozen takes count only in their own workspace
  }
  function paintFilterBtn() {
    var b = $("collFilterBtn"), n = $("collFilterN"), on = filterOn(), lg = String(state.logic || "and").toUpperCase();
    if (!b) return;
    b.classList.toggle("is-on", on.length > 0);
    n.hidden = !on.length;
    n.textContent = on.length ? on.length + " · " + lg : "";
    b.setAttribute("aria-label", on.length ? "Filter: " + on.length + " on, joined " + lg : "Filter");
  }
  function countWith(values, logic) {
    var kinds = state.kinds, derived = state.derived, lg = state.logic;
    state.kinds = {}; state.derived = {}; state.logic = logic;
    values.forEach(function (v) { (HAS[v] ? state.derived : state.kinds)[v] = 1; });
    var n = shown().length;
    state.kinds = kinds; state.derived = derived; state.logic = lg;
    return n;
  }
  function openFilter() {
    var inPlace = placeRows();
    var groups = FILTERS.map(function (g) {
      return { label: g.label, items: g.items.map(function (it) {
        return { value: it[0], label: it[1], icon: ico(it[2]), note: String(inPlace.filter(filterTest(it[0])).length), checked: !!(state.kinds[it[0]] || state.derived[it[0]]) };
      }) };
    });
    return window.HeresyDialog.pick("Filter the takes\n\nTick what to look for. A take is shown when it has all of the ticked (AND), any of them (OR) or none of them (NOR); the numbers count the takes of this place.", groups, {
      logic: state.logic || "and", ok: "Show", count: countWith,
      logics: [{ value: "and", label: "All · AND", tip: "A take shows when it has every ticked thing" }, { value: "or", label: "Any · OR", tip: "A take shows when it has at least one ticked thing" },
               { value: "nor", label: "None · NOR", tip: "A take shows when it has none of the ticked things" }]
    }).then(function (r) {
      if (!r) return;
      state.kinds = {}; state.derived = {};
      r.values.forEach(function (v) { (HAS[v] ? state.derived : state.kinds)[v] = 1; });
      state.logic = r.logic || "and";
      if (state.logic === "and") { try { localStorage.removeItem(LOGIC_KEY); } catch (e) { /* private */ } } else store(LOGIC_KEY, state.logic);   // AND, the default, leaves no key
      paint();
    });
  }
  function paintHead(rows) {
    // HERESY 1098 (Viktor, 02.10.2026): the heading says which collection is open, then what it holds
    var placeName = { "": "All Workspaces", __fav: "Favourites", __pinned: "Pinned", __none: "Not in a workspace", __hidden: "Hidden" }[state.place];
    // HERESY 1165: the studio's places translate; a workspace's name is kept as typed (its studio-made sections translate)
    $("collWhere").innerHTML = " \u203a " + (placeName ? "<span>" + esc(placeName) + "</span>" : wsParts(state.place).map(function (p, i) {
      return "<span" + (i && STUDIO_SECTIONS[p] ? "" : ' translate="no"') + ">" + esc(p) + "</span>";
    }).join(SEP));
    var inPlace = placeRows();
    var secs = inPlace.reduce(function (s, r) { return s + (r.seconds || 0); }, 0), hm = function (t) { var h = Math.floor(t / 3600), m = Math.round(t % 3600 / 60); return h ? h + " h " + m + " min" : m + " min"; };
    var count = function (f) { return inPlace.filter(f).length; }, kinds = {};
    inPlace.forEach(function (r) { kinds[r.kind] = (kinds[r.kind] || 0) + 1; });
    var parts = [inPlace.length + " take" + (inPlace.length === 1 ? "" : "s") + (rows.length !== inPlace.length ? " (" + rows.length + " shown)" : ""), hm(secs)];
    var kindsSaid = Object.keys(kinds).sort(function (a, b) { return kinds[b] - kinds[a]; }).map(function (k) { return kinds[k] + " " + (KINDS[k] || k); });
    var liked = count(function (r) { return r.rating > 0; }), disliked = count(function (r) { return r.rating < 0; }), fav = count(function (r) { return r.favorite; }), notes = count(function (r) { return r.note; });
    if (liked) parts.push(liked + " liked"); if (disliked) parts.push(disliked + " disliked"); if (fav) parts.push(fav + " \u2605"); if (notes) parts.push(notes + " with a note");
    var prot = count(function (r) { return r.protected; }); if (prot) parts.push(prot + " protected");   // HERESY 1368
    parts.push(kindsSaid);
    parts.push(state.rows.length + " in the library");
    paintFilterBtn();   // HERESY 1169 · 1241
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
        '<div class="coll-pin-body"><span class="coll-title-text" data-open="' + esc(r.name) + '">' + esc(r.title) + '</span><span class="coll-meta"><span>' + esc(state.hooks.ago(r.created, r.name)) + "</span>" +
        (r.seconds ? " \u00b7 <span>" + state.hooks.clock(r.seconds) + "</span>" : "") + "</span></div>" +
        '<button type="button" class="coll-unpin" data-unpin="' + esc(r.name) + '" aria-label="Unpin" data-tip="Unpin">\u00d7</button></div>';
    }).join("") : '<p class="row-hint coll-pins-hint">' + (state.place === "__pinned" ? "Every take pinned in any workspace is below; each workspace shows its own four in this strip."
      : "Pin up to four takes of this place here: right-click a take \u2192 Pin here.") + '</p>';
  }
  function markFavorite(name, on) {              // HERESY 1105: a favourite set elsewhere, shown here without asking the lab
    hold(name, "favorite", on);                  // HERESY 1802: and kept over a list the lab read before it
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
    $("collSelCount").textContent = n + " selected" + (n && !state.place ? " \u00b7 across ALL workspaces" : "");   // HERESY 1473
    $("collSelCount").classList.toggle("is-all", !!n && !state.place);
    $("collWsMove").innerHTML = '<option value="">Move to workspace…</option>' + state.ws.filter(function (w) { return w !== state.place; }).map(function (w) { return '<option translate="no">' + esc(w) + "</option>"; }).join("") +
      '<option value="__new">+ a new one…</option>';
    $("collWsPick").innerHTML = '<option value="">Add to workspace…</option>' + state.ws.map(function (w) { return '<option translate="no">' + esc(w) + "</option>"; }).join("") +
      '<option value="__new">+ a new one…</option>';
    var hid = state.place === "__hidden", hb = $("collHide");                 // HERESY 1169: an icon, its words in its tip
    hb.innerHTML = window.HeresyIcons ? window.HeresyIcons.ui(hid ? "eye" : "eye-off") : (hid ? "Show again" : "Hide");
    hb.setAttribute("aria-label", hid ? "Show again" : "Hide");
    hb.dataset.tip = hid ? "Show again: back in the lists" : "Out of the lists, not deleted: Hidden on the left shows them again";
    $("collWsOut").hidden = !state.place || state.place.charAt(0) === "_";
    $("collCompare").disabled = n < 2 || n > 6;                // HERESY 1415: two to four; 1621: to six
  }

  // HERESY 1843 (TODO 2.0.x from RC3's report of 08.10.2026: «Проверка лирики пачкой на отмеченных дублях из меню Библиотекаря»): sung to the end,
  // the checked takes one after another (1842's check: the take's timing, Whisper on its lyrics; one timed already answers at once), a list that
  // fills as they come, each one not sung to its end with its Regenerate from. Closing it stops the queue; a timing running finishes in the lab
  function sungMany(list) {
    var h = state.hooks, takes = list.map(function (n) { return h.findTake(n); }).filter(function (t) { return t && !t.session; }), stop = false, got = [];
    if (!takes.length) return;
    var back = document.createElement("div");
    back.className = "ds-back";
    back.innerHTML = '<div class="ds-box sung-many" role="dialog" aria-modal="true"><div class="ds-head"><div><div class="sheet-title">' + esc(tr("Sung to the end?")) + "</div>" +
      '<div class="coll-meta sm-meta">' + esc(tr("Whisper listens to each in turn, on the processor: a minute or two a take")) + "</div></div>" +
      '<span class="spacer"></span><button type="button" class="btn ghost small" data-sm="close">' + esc(tr("Close")) + "</button></div>" +
      '<div class="sm-list">' + takes.map(function (t, i) {
        return '<div class="sm-row" data-smi="' + i + '"><span class="sm-name" translate="no">' + esc(h.title ? h.title(t) : (t.title || t.name)) + '</span><span class="sm-say">' + esc(tr("waits its turn")) + "</span></div>";
      }).join("") + "</div></div>";
    document.body.appendChild(back);
    function close() { stop = true; document.removeEventListener("keydown", key, true); back.remove(); paint(); }   // HERESY 1846: the cards say what was found
    function key(e) { if (e.key === "Escape" && !document.querySelector(".hd-back")) { e.preventDefault(); e.stopPropagation(); close(); } }
    document.addEventListener("keydown", key, true);
    back.addEventListener("mousedown", function (e) { if (e.target === back) close(); });
    function clk(t) { var m = Math.floor(t / 60), s = t - m * 60; return m + ":" + (s < 10 ? "0" : "") + s.toFixed(1); }
    function cell(i) { return back.querySelector('[data-smi="' + i + '"] .sm-say'); }
    function show(i, sg) {
      var c = cell(i), t = takes[i];
      got[i] = sg.done;
      sungMark(t.name, sg.done);                    // HERESY 1846 · 1854
      c.className = "sm-say" + (sg.done === true ? " is-good" : "");
      if (sg.done === true) c.textContent = "✓ " + tr("Every line heard; the last ends at {0}").replace("{0}", clk(sg.last || 0));
      else if (sg.done === false) c.innerHTML = '<span class="is-bad">✗ ' + esc(tr("Lines not heard at the end: {0}, after {1}").replace("{0}", sg.count).replace("{1}", clk(sg.suggest))) + "</span>" +
        ' <button type="button" class="btn ghost small" data-sm="regen" data-name="' + esc(t.name) + '" data-at="' + esc(String(sg.suggest)) + '">' + esc(tr("Regenerate from {0}").replace("{0}", clk(sg.suggest))) + "</button>";
      else c.textContent = tr("The timing heard too little of this take to say");
    }
    function ask(name, run) {
      return fetch("/lab/sung?name=" + encodeURIComponent(name) + (run ? "&run=1" : "")).then(function (r) { return r.json().then(function (b) { if (!r.ok && r.status !== 202) throw new Error(b.error || r.status); return b; }); });
    }
    function one(i) {
      if (stop) return;
      if (i >= takes.length) {
        var yes = got.filter(function (x) { return x === true; }).length, no = got.filter(function (x) { return x === false; }).length;
        back.querySelector(".sm-meta").textContent = tr("Done: {0} sung to the end, {1} not, {2} could not say").replace("{0}", yes).replace("{1}", no).replace("{2}", takes.length - yes - no);
        return;
      }
      cell(i).textContent = tr("Whisper listens…");
      (function poll(run, n) {
        ask(takes[i].name, run).then(function (sg) {
          if (stop) return;
          if (sg.timed === false && n < 400) return setTimeout(function () { poll(false, n + 1); }, 2500);
          show(i, sg); one(i + 1);
        }).catch(function (e) { if (stop) return; var c = cell(i); c.textContent = e.message; c.className = "sm-say is-bad"; one(i + 1); });
      })(true, 0);
    }
    back.querySelector(".ds-box").addEventListener("click", function (e) {
      var b = e.target.closest("[data-sm]");
      if (!b) return;
      if (b.dataset.sm === "close") return close();
      if (b.dataset.sm === "regen") { var at = +b.dataset.at, n = b.dataset.name; close(); h.openTake(n, "create"); if (window.ruachRegenFrom) window.ruachRegenFrom(at, n); }
    });
    one(0);
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

  // HERESY 1337 (Viktor 10.10.2026: «картинки у нас куда удаляются с обложек треков и остального? Может отдельный Trash сделать в колонке
  // воркспейсов? `Trash (Art)`. Вижу Trash у Артиста, но пока что очистки и удаления нет.»): the art put away, one list of three kinds:
  // the Artist's runs in the trash, the pictures put aside, the covers taken off the takes (by a redraw, by Remove, by a new cover);
  // ticked, given back or deleted for good (asked first); a frozen workspace's covers stay as they are
  function inTrash() { return state.place === "__trash" || state.place === "__trash_art"; }
  function artItems() {
    var b = state.artBin || {};
    return (b.runs || []).map(function (r) { return { kind: "run", id: r.id, r: r, bytes: +r.bytes || 0 }; })
      .concat((b.pictures || []).map(function (p) { return { kind: "picture", id: p.id, file: p.file, p: p, bytes: +p.bytes || 0 }; }))
      .concat((b.covers || []).map(function (c) { return { kind: "cover", take: c.take, stamp: c.stamp, c: c, frozen: !!c.frozen, bytes: +c.bytes || 0 }; }))
      .concat((b.loras || []).map(function (l) { return { kind: "lora", stamp: l.stamp, l: l, bytes: +l.bytes || 0 }; }));   // HERESY 1353: the LoRA library's adapters
  }
  function artKey(it) { return it.kind === "run" ? "run:" + it.id : it.kind === "picture" ? "pic:" + it.id + "|" + it.file : it.kind === "lora" ? "lora:" + it.stamp : "cover:" + it.take + "|" + it.stamp; }
  function artCount() { return state.artBin ? artItems().length : 0; }
  function artDay(t) {
    var d = new Date((+t || 0) * 1000), z = function (n) { return (n < 10 ? "0" : "") + n; };
    return +t ? d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate()) + " " + z(d.getHours()) + ":" + z(d.getMinutes()) : "";
  }
  function stampDay(s) { return String(s).replace(/^(\d{4})(\d\d)(\d\d)-(\d\d)(\d\d).*$/, "$1-$2-$3 $4:$5"); }
  function loadArtBin(quiet) {
    return api("/artist/bin").then(function (d) { state.artBin = d; state.artBinErr = ""; state.asel = {}; if (quiet) paintSide(); else paint(); })
      .catch(function (e) { state.artBin = null; state.artBinErr = e.message || String(e); if (quiet) paintSide(); else paint(); });
  }
  function paintArtBin() {
    var list = artItems(), b = state.artBin, nsel = Object.keys(state.asel).length;
    $("collWhere").innerHTML = " \u203a <span>Trash (Art)</span>";
    $("collNote").innerHTML = b ? "<span>" + list.length + " in the art's trash</span> · <span>" + ((+b.bytes || 0) / 1e9).toFixed(2) + " GB</span>" : "";
    $("collGrid").className = "coll-grid artbin";      // HERESY 1406: tiles (the takes' trash stays a list)
    $("collEmpty").textContent = nsel ? "Delete " + nsel + " for good" : "Wipe out the art's trash";
    $("collEmpty").disabled = !list.some(function (it) { return !it.frozen; });
    $("collRestore").disabled = !nsel;
    if (!b) {
      $("collGrid").innerHTML = '<p class="row-hint coll-empty">' + esc(state.artBinErr ? "The art's trash could not be read: " + state.artBinErr : "Reading the art's trash…") + "</p>";
      return;
    }
    $("collGrid").innerHTML = list.length ? list.map(function (it) {
      var key = artKey(it), sel = !!state.asel[key], src = "", title = "", meta = [], mine = "";
      if (it.kind === "run") {
        var kept = (it.r.pictures || []).filter(function (p) { return p.kept; }), first = kept[0];
        if (first) src = "/lab/artist/file?id=" + encodeURIComponent(it.id) + "&file=" + encodeURIComponent(first.thumb || first.file) + "&trash=1";
        title = it.r.prompt || it.id;
        meta = ["The Artist's run", kept.length + (kept.length === 1 ? " picture" : " pictures"), "in the trash since " + artDay(it.r.trashed_at)];
      } else if (it.kind === "picture") {
        src = "/lab/artist/file?id=" + encodeURIComponent(it.id) + "&file=" + encodeURIComponent(it.p.thumb || it.p.file);
        title = it.p.prompt || it.file;
        meta = ["A picture put aside", it.p.shape + " · seed " + it.p.seed, artDay(it.p.created)];
      } else if (it.kind === "lora") {                   // HERESY 1353
        title = it.l.title || it.l.name;
        meta = ["An adapter of the LoRA library", String(it.l.id).split("/")[0], "in the trash since " + artDay(it.l.at)];
      } else {
        src = "/lab/artist/bin-file?take=" + encodeURIComponent(it.take) + "&stamp=" + encodeURIComponent(it.stamp);
        title = it.c.title || it.take;
        meta = ["A cover taken off its take", "taken off " + stampDay(it.stamp)];
        if (it.c.prompt) mine = it.c.prompt;
      }
      meta.push((it.bytes / 1e6).toFixed(1) + " MB");
      return '<article class="coll-card coll-binart' + (sel ? " is-sel" : "") + (it.frozen ? " is-frozen" : "") + '" data-akind="' + it.kind + '">' +
        '<label class="coll-check"><input type="checkbox" data-asel="' + esc(key) + '"' + (sel ? " checked" : "") + (it.frozen ? ' disabled title="Frozen: its takes are heard, never changed"' : "") + " /></label>" +
        (src ? '<img class="coll-art-pic" alt="" loading="lazy" draggable="false" src="' + esc(src) + '" />' : '<span class="coll-art-pic"></span>') +
        '<div class="coll-body"><div class="coll-title" translate="no">' + esc(title) + '</div><div class="coll-meta">' + meta.map(function (m) { return "<span>" + esc(m) + "</span>"; }).join(" · ") +
        (mine ? ' · <span translate="no">' + esc(mine) + "</span>" : "") + "</div></div></article>";
    }).join("") : '<p class="row-hint coll-empty">The art\'s trash is empty.</p>';
  }
  function artBinAct(op) {
    var list = artItems(), picked = list.filter(function (it) { return state.asel[artKey(it)]; }), all = op === "delete" && !picked.length;
    if (op === "restore" && !picked.length) return toast("Tick what to give back", true);
    var go = all ? list.filter(function (it) { return !it.frozen; }) : picked;
    if (!go.length) return;
    var many = function (k, one, more) { var n = go.filter(function (it) { return it.kind === k; }).length; return n ? tr(n === 1 ? "1 " + one : n + " " + more) : ""; };   // HERESY 1339
    var what = [many("run", "run", "runs"), many("picture", "picture", "pictures"), many("cover", "cover", "covers"), many("lora", "adapter", "adapters")].filter(Boolean).join(", ");
    var mb = go.reduce(function (s, it) { return s + it.bytes; }, 0) / 1e6, body = { op: all ? "empty" : op };
    if (!all) body.items = go.map(function (it) { return it.kind === "run" ? { kind: "run", id: it.id } : it.kind === "picture" ? { kind: "picture", id: it.id, file: it.file } : it.kind === "lora" ? { kind: "lora", stamp: it.stamp } : { kind: "cover", take: it.take, stamp: it.stamp }; });
    var run = function () {
      return api("/artist/bin", body).then(function (d) {
        var n = (d.done || []).length, kept = d.kept || [];
        toast((op === "restore" ? n + " given back" : n + " deleted for good") + (kept.length ? "; " + kept.length + " stayed: " + kept[0].why : ""), !!kept.length && !n);
        state.asel = {};
        if (state.hooks && state.hooks.refreshArts) state.hooks.refreshArts();          // a cover given back shows on its take
        if (window.HeresyArtist && window.HeresyArtist.reload) window.HeresyArtist.reload();   // the Artist room's runs and pictures
        if (window.HeresyArtist && window.HeresyArtist.loras) window.HeresyArtist.loras.reload();   // HERESY 1353: an adapter given back
        return loadArtBin();
      }).catch(function (e) { toast(e.message, true); });
    };
    if (op === "restore") return run();
    return ask((all ? "Wipe out the art's trash: " : "Delete for good: ") + what + " (" + mb.toFixed(1) + " MB).\n\nThis cannot be undone." +
      (all && list.some(function (it) { return it.frozen; }) ? "\n\nThe covers of a frozen workspace's takes stay." : ""), { ok: all ? "Wipe out" : "Delete for good", danger: true })
      .then(function (ok) { if (ok) return run(); });
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
    if (e.button !== 0 || inTrash() || state.place === "__playlist") return;   // HERESY 1731: its cards drag themselves
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
    var go = function () {
      return act({ op: "ws-move", workspace: w, from: from, names: list }, n + " moved to “" + w + "”" + (from ? " (out of “" + from + "”)" : " (out of every other workspace)"))
        .then(function (ok) { if (ok) { list.forEach(function (k) { delete state.sel[k]; }); paint(); } return ok; });
    };
    // HERESY 1474: from the take's menu as from the bar (1473): several takes, or one that lives in more than one workspace, asked first
    if (n < 2 && (from || reach(list, false).wss.length < 2)) return go();
    return guarded(tl(n > 1 ? "Move " + n + " takes to \u201c" + w + "\u201d?" : "Move 1 take to \u201c" + w + "\u201d?") + "\n\n" +
                   (from ? tl("They leave \u201c" + from + "\u201d.") : tl("They leave every other workspace they are in (a locked one keeps its own).")),
                   tl("Move them"), list, !!from).then(function (yes) { return yes ? go() : false; });
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
    btn.classList.toggle("is-closed", !!cur && closedWs(cur));   // HERESY 1434: in hand to look at, not to take new takes
    btn.closest(".ws-current").classList.toggle("is-set", !!cur);
  }
  // HERESY 1167 (Viktor: «кликаешь на него... и вуаля. И предупреждение, что все новые семплы идут в него»): every workspace
  // and its sections in the studio's own dialog, one click picks; a new workspace, or a section of the one in hand, made from
  // there. The frozen and the «Sourced for Regeneration» sections are not offered: nothing new lands in them. why: the
  // question, when a run asks first.
  function chooseCurrent(why) {
    var cur = current();
    var items = state.ws.filter(function (w) { return !closedWs(w) && wsLeaf(w) !== SOURCED; }).map(function (w) {   // 1434: no 💎 set
      var n = state.rows.filter(function (r) { return inTree(r, w); }).length;
      return { value: w, label: wsParts(w).length > 1 ? wsLeaf(w) : w, depth: wsParts(w).length - 1, path: wsParts(w).slice(0, -1).join(" \u203a "), current: w === cur, note: String(n) };   // 1853: path
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
    var cur = landable();                              // HERESY 1434: never into a 💎 set or a frozen workspace
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
    if (!state.rows.some(function (r) { return r.name === name; })) return true;   // HERESY 1434: just made, landing in the one in hand
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
      state.blind = d.blind || state.blind || [];   // HERESY 1874
      if (d.playlist) state.playlist = d.playlist;     // HERESY 1731: a take gone from the library is gone from the playlist
      if (d.ws_notes) state.wsNotes = d.ws_notes;      // HERESY 1802
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
      // HERESY 1169: the styles' covers are their own scores (SheetSage2 heard each take), the instruments' still painted
      "The instruments' covers are painted by an image model: some show an instrument not quite as it really is; the styles' covers are each take's own score.</div>" +
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
          if (s.missing) toast(s.done + " of " + s.total + " takes are in it: " + s.missing + " were no longer in the library while it packed (in the trash, or gone).", true);   // HERESY 1473
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
    $("collSort").addEventListener("change", function () { if (this.value === "shuffle") DEAL = {}; store(SORT_KEY, this.value); paint(); });   // HERESY 1863: dealt anew
    // HERESY 1167: the disliked shown or not: the rooms' takes column's ⋯ («The disliked ones too»), one setting with this
    window.addEventListener("ruach-disliked", function () { paint(); });
    window.addEventListener("ruach-catalog", function () { if (state.loaded) load(); });   // HERESY 1425: a take landed from the lab
    // HERESY 1169 · 1241: the filters' window, from the button at the end of the search row
    state.logic = recall(LOGIC_KEY) || "and";
    $("collFilterBtn").addEventListener("click", function () { openFilter(); });
    Array.prototype.forEach.call(document.querySelectorAll("[data-coll-view]"), function (b) {
      b.addEventListener("click", function () { store(VIEW_KEY, b.dataset.collView); paint(); });
    });
    $("collSide").addEventListener("click", function (e) {
      var sf = e.target.closest("[data-sec-fold]");           // HERESY 1685: its sections folded or back, the place in hand as it was
      if (sf) { e.stopPropagation(); secFold(sf.dataset.secFold); return; }
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
      if (state.place === "__trash") loadTrash(); else if (state.place === "__trash_art") loadArtBin(); else paint();   // HERESY 1337
    });
    $("collSide").addEventListener("dblclick", function (e) {
      if (e.target.closest("[data-sec-fold]")) return;       // HERESY 1685: two quick clicks on the handle fold and unfold, they do not rename
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
      if (e.target.closest && e.target.closest(".pl-card")) return;   // HERESY 1731: the playlist's cards drag themselves
      var card = e.target.closest && e.target.closest(".coll-card[data-name]");
      if (!card || inTrash() || card.classList.contains("is-frozen") || (e.target.closest && e.target.closest("input, textarea"))) { e.preventDefault(); return; }
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
    $("collCompare").addEventListener("click", function () { if (window.HeresyCompare) window.HeresyCompare.takes(names()); });   // HERESY 1415
    if ($("collSung")) $("collSung").addEventListener("click", function () {   // HERESY 1843: past ten, asked first
      var list = names();
      (list.length > 10 ? window.HeresyDialog.confirm(tr("Whisper listens to {0} takes in turn, a minute or two each. Start?").replace("{0}", list.length), { ok: "Start" }) : Promise.resolve(true))
        .then(function (ok) { if (ok) sungMany(list); });
    });
    $("collWsMove").addEventListener("change", function () {   // HERESY 1050: into one workspace, out of this one
      var w = this.value; this.value = "";
      if (!w) return;
      var from = state.place && state.place.charAt(0) !== "_" ? state.place : "", n = names().length;
      (w === "__new" ? askName("A new workspace for the " + n + " selected", "", { ok: "Move them there", placeholder: "its name" }) : Promise.resolve(w)).then(function (w) {
        if (!w) return;
        // HERESY 1473: a move out of every other workspace (from All Workspaces) asked as the trash is
        return guarded(tl("Move " + n + " takes to \u201c" + w + "\u201d?") + "\n\n" + (from ? tl("They leave \u201c" + from + "\u201d.") : tl("They leave every other workspace they are in (a locked one keeps its own).")),
                       tl("Move them"), names(), !!from).then(function (yes) {
          if (!yes) return;
          act({ op: "ws-move", workspace: w, from: from, names: names() }, n + " moved to \u201c" + w + "\u201d" + (from ? " (out of \u201c" + from + "\u201d)" : " (out of every other workspace)"));
          state.sel = {};
        });
      });
    });
    $("collGrid").addEventListener("click", function (e) {
      var play = e.target.closest("[data-play]"), open = e.target.closest("[data-open]"), cb = e.target.closest("[data-sel]"), tcb = e.target.closest("[data-tsel]");
      if (tcb) { if (tcb.checked) state.tsel[tcb.dataset.tsel] = 1; else delete state.tsel[tcb.dataset.tsel]; return paint(); }
      var acb = e.target.closest("[data-asel]");         // HERESY 1337: the art's trash
      if (acb) { if (acb.checked) state.asel[acb.dataset.asel] = 1; else delete state.asel[acb.dataset.asel]; return paint(); }
      var atile = e.target.closest(".coll-binart");      // HERESY 1406: a click on a tile of the art's trash ticks it
      if (atile && !e.target.closest("label, input")) { var abox = atile.querySelector("input[data-asel]:not(:disabled)"); if (abox) abox.click(); return; }
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
      var cnote = e.target.closest("[data-cnote]");           // HERESY 1825: the note's window, not the menu
      if (cnote) { editNote(cnote.dataset.cnote).then(function () { if (hooks.libraryChanged) hooks.libraryChanged(); }); return; }
      var ren = e.target.closest("[data-ren]");               // HERESY 1049: rename in place
      if (ren) { renameIn(ren.closest(".coll-title").querySelector(".coll-title-text"), ren.dataset.ren); return; }
      if (e.target.closest(".coll-title-edit")) return;
      if (open) { openSheet(open.dataset.open); return; }   // HERESY 1046: a sheet here; Create only by choice
      var card = e.target.closest(".coll-card[data-name]"), cname = card && card.dataset.name;   // HERESY 1048
      var crate = e.target.closest("[data-crate]");
      var many = cname && state.sel[cname] && names().length > 1;   // HERESY 1108: a checked card speaks for all checked
      if (crate && many) { rateMany(names(), +crate.dataset.crate); return; }
      if (e.target.closest("[data-cfav]") && many) { favMany(names()); return; }
      if (e.target.closest("[data-cprot]")) { if (many) protectMany(names()); else protect([cname], !isProtected(cname)); return; }   // HERESY 1368
      if (crate) { var v = +crate.dataset.crate; rate(cname, rating(cname) === v ? 0 : v).then(function () { if (hooks.libraryChanged) hooks.libraryChanged(); }); return; }
      if (e.target.closest("[data-cfav]")) {          // HERESY 1105: the card and the player follow at once
        var ft = hooks.findTake(cname), want = !!ft && !ft.favorite;
        if (ft) {                                      // HERESY 1802: lit at the click, as the like is; the server's word confirms it or takes it back
          markFavorite(cname, want);
          hooks.updateTake(ft, { favorite: want }).then(function (entry) { markFavorite(cname, !!(entry || ft).favorite); if (hooks.libraryChanged) hooks.libraryChanged(); },
            function (er) { markFavorite(cname, !want); toast(er.message, true); });
        }
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
    // HERESY 1268 (Viktor 09.10.2026: «Убери из тултипа в плеере вывод промпта трека. Это лишнее. И так всё под рукой. И пройдись по
    // таким местам и убери лишние тултипы»; his picture of the Librarian with the peek open over the cards): no peek on hover any more,
    // the take's style and lyrics are a click away (its sheet)
    $("collGrid").addEventListener("mouseleave", function () { clearTimeout(peekTimer); clearTimeout(peekHide); peekHide = setTimeout(hidePeek, 1200); });
    $("collPeek").addEventListener("mouseenter", function () { clearTimeout(peekTimer); clearTimeout(peekHide); });
    $("collPeek").addEventListener("mouseleave", function () { clearTimeout(peekHide); peekHide = setTimeout(hidePeek, 300); });
    // HERESY 1802 (Viktor 27.10.2026: «двойной клик по пространству карточки - плей/стоп»): a double-click on a card's own ground does what its round
    // button does; never on its buttons, fields, checkbox or title (a click there opens the sheet)
    document.addEventListener("dblclick", function (e) {
      if (recall("yue2.dblPlay") === "off") return;   // HERESY 1804: Engine → Defaults
      var card = e.target.closest && e.target.closest(".coll-card[data-name], .pl-card[data-pl]");
      if (!card || e.target.closest("button, a, input, textarea, select, label, [data-open], [data-ren], [contenteditable], .coll-title-edit")) return;
      var btn = card.querySelector(".coll-play, .pl-play");
      if (!btn) return;
      if (window.getSelection) { var sel = window.getSelection(); if (sel && sel.removeAllRanges) sel.removeAllRanges(); }   // the word the double-click selected
      btn.click();
    });
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
      if (mod && k === "a" && !inTrash()) { e.preventDefault(); shown().forEach(function (r) { if (!r.frozen) state.sel[r.name] = 1; }); paint(); }
      else if (mod && k === "z" && undoState.fn) { e.preventDefault(); undoLast(); }
      else if (e.key === "Escape" && names().length) { state.sel = {}; paint(); }
      else if (e.key === "Delete" && names().length && !inTrash()) { e.preventDefault(); $("collTrash").click(); }
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
        fb.dataset.tip = on ? "Show the workspaces" : "Fold the workspaces away: the cards grow wider";
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
    if ($("collProtect")) $("collProtect").addEventListener("click", function () { protectMany(names()); });   // HERESY 1368
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
      guarded(tl("Take " + n.length + " takes out of \u201c" + state.place + "\u201d?") + "\n\n" + tl("They stay in the library and in any other workspace; only this workspace lets them go."), tl("Take them out"), n, true)
        .then(function (ok) { if (ok) go(); });   // HERESY 1473
    });
    $("collHide").addEventListener("click", function () {
      var show = state.place === "__hidden", n = names().length;
      var go = function () { act({ op: show ? "show" : "hide", names: names() }, (show ? "Shown again: " : "Hidden from the lists (not deleted): ") + n); state.sel = {}; };
      if (show || n < 2) return go();
      guarded(tl("Hide " + n + " takes from the lists?") + "\n\n" + tl("Nothing is deleted: Hidden on the left shows them again."), tl("Hide them"), names())
        .then(function (ok) { if (ok) go(); });   // HERESY 1473
    });
    $("collExport").addEventListener("click", exportZip);
    $("collTrash").addEventListener("click", function () {
      var n = names(); if (!n.length) return;
      guarded(tl("Move " + n.length + " take" + (n.length > 1 ? "s" : "") + " to the trash?") + "\n\n" + tl("Nothing is deleted: the trash gives them back until it is emptied."),
              tl("To the trash"), n).then(function (ok) {   // HERESY 1473
        if (ok) return api("/trash", { op: "move", names: n });
      }).then(function (d) {
        if (!d) return;
        var said = d.moved.length + " moved to the trash" + (d.locked && d.locked.length ? "; " + d.locked.length + " stayed: their workspace locks its takes" : "");
        if (d.moved.length) undoable(said, untrash(d.moved)); else toast(said, true);
        saidProtected(d);                                  // HERESY 1368
        state.sel = {};
        if (hooks.refreshLibrary) hooks.refreshLibrary();
        return load();
      }).catch(function (e) { toast(e.message, true); });
    });
    // the trash
    var chosen = function () { return Object.keys(state.tsel).map(function (k) { var p = k.split("/"); return { day: p[0], name: p[1] }; }); };
    $("collTSelAll").addEventListener("click", function () {
      if (state.place === "__trash_art") { artItems().forEach(function (it) { if (!it.frozen) state.asel[artKey(it)] = 1; }); return paint(); }   // HERESY 1337
      state.trash.forEach(function (it) { state.tsel[it.day + "/" + it.name] = 1; }); paint();
    });
    $("collTSelNone").addEventListener("click", function () { state.tsel = {}; state.asel = {}; paint(); });
    $("collRestore").addEventListener("click", function () {
      if (state.place === "__trash_art") return artBinAct("restore");   // HERESY 1337
      var items = chosen(); if (!items.length) return toast("Tick what to give back", true);
      api("/trash", { op: "restore", items: items }).then(function (d) { toast(d.restored.length + " back in the library"); if (hooks.refreshLibrary) hooks.refreshLibrary(); return load().then(loadTrash); })
        .catch(function (e) { toast(e.message, true); });
    });
    $("collEmpty").addEventListener("click", function () {
      if (state.place === "__trash_art") return artBinAct("delete");    // HERESY 1337
      var items = chosen(), all = !items.length;
      var n = all ? state.trash.length : items.length;
      if (!n) return;
      ask((all ? "Wipe out the whole trash: " : "Delete for good: ") + n + " take" + (n > 1 ? "s" : "") + ", with everything made from them.\n\nThis cannot be undone.", { ok: all ? "Wipe out" : "Delete for good", danger: true }).then(function (ok) {
        if (ok) return api("/trash", { op: "empty", items: all ? null : items }).then(function (d) { toast(d.emptied.length + " deleted for good"); saidProtected(d, true); state.tsel = {}; return loadTrash(); });
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
    loadArtBin(true);                                    // HERESY 1337: its number in the column
  }

  // HERESY 1042: likes, as SUNO has them (the player sets them)
  // HERESY 1169: a take without a row here (the Creator's take head, another workspace's take) reads what rate() remembered
  function rating(name) { var r = state.rows.filter(function (x) { return x.name === name; })[0]; return r ? r.rating || 0 : rated[name] ? rated[name].v || 0 : 0; }
  // HERESY 1108: many takes rated at once; all of them rated so already: taken back to none
  function rateMany(list, value) {
    var rows = list.map(rowOf).filter(Boolean), all = rows.length && rows.every(function (r) { return r.rating === value; });
    var v = all ? 0 : value, before = rows.map(function (r) { return r.rating; });
    rows.forEach(function (r) { r.rating = v; });
    if (v < 0 && !showDis()) list.forEach(function (n) { delete state.sel[n]; });   // HERESY 1169 · 1239: a dislike sends them out of the lists, so out of the choice
    paint();
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
  // HERESY 1368: a take protected never goes to the trash nor is deleted for good; many at once: all protected already, the protection
  // comes off. Undone as it was: only the takes this changed
  function isProtected(name) { var r = rowOf(name); return !!(r && r.protected); }
  function protect(list, on) {
    var changed = list.filter(function (n) { return isProtected(n) !== !!on; });
    return act({ op: "protect", names: list, on: !!on }, null).then(function (ok) {
      if (!ok) return false;
      var said = on ? list.length + " protected: never to the trash, never deleted" : "Protection taken off: " + list.length;
      if (changed.length) undoable(said, function () { return act({ op: "protect", names: changed, on: !on }, null, true); }); else toast(said);
      return true;
    });
  }
  function protectMany(list) {
    var rows = list.map(rowOf).filter(Boolean);
    return protect(list, !(rows.length && rows.every(function (r) { return r.protected; })));
  }
  function saidProtected(d, bin) {                        // what stayed because it is protected, said apart
    var n = d && d.protected ? d.protected.length : 0;
    if (!n) return;
    toast(bin ? (n === 1 ? "1 protected take stayed in the trash: it is never deleted" : n + " protected takes stayed in the trash: they are never deleted")
              : (n === 1 ? "1 protected take stayed in the library: take its protection off first" : n + " protected takes stayed in the library: take their protection off first"));
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
  // HERESY 1473 (Viktor 15.10.2026: «Сторожа на все удаления, перемещения и т.п. По максимуму. Лучше семь раз спросить, чем за один
  // всё проебать»): where a mass action reaches, said before it goes; a second question when it reaches past the place you stand in
  function tl(s) { return window.RuachI18n ? window.RuachI18n.t(s) : s; }
  function reach(list, own) {
    var byWs = {}, none = 0, gems = 0, seen = {};
    shown().forEach(function (r) { seen[r.name] = 1; });
    list.forEach(function (name) {
      var r = rowOf(name), tops = {};
      if (!r) return;
      if (!r.workspaces.length) none++;
      r.workspaces.forEach(function (w) { tops[w.split(SEP)[0]] = 1; });
      Object.keys(tops).forEach(function (w) { byWs[w] = (byWs[w] || 0) + 1; });
      if (Object.keys(tops).some(function (w) { return w.indexOf("\ud83d\udc8e") === 0; })) gems++;
    });
    var here = state.place && state.place.charAt(0) !== "_" ? state.place.split(SEP)[0] : "";
    var wss = Object.keys(byWs).sort(function (a, b) { return byWs[b] - byWs[a]; });
    var unseen = list.filter(function (x) { return !seen[x]; }).length, foreign = own ? [] : wss.filter(function (w) { return w !== here; });
    return { n: list.length, byWs: byWs, wss: wss, none: none, gems: gems, here: here, unseen: unseen, foreign: foreign,
             risky: !here || foreign.length > 0 || gems > 0 || list.length > 50 || unseen > 0 };
  }
  function reachText(R) {
    var L = [!state.place ? tl("You stand in All Workspaces: this reaches every workspace.")
      : R.here ? tl("You stand in \u201c" + state.place + "\u201d.") : tl("You stand in a view across workspaces.")];
    if (R.wss.length) {
      L.push(tl("They are in:"));
      R.wss.slice(0, 8).forEach(function (w) { L.push("\u00b7 " + w + ": " + R.byWs[w]); });
      if (R.wss.length > 8) L.push(tl("\u00b7 and " + (R.wss.length - 8) + " more workspaces"));
    }
    if (R.none) L.push(tl("\u00b7 in no workspace: " + R.none));
    if (R.gems) L.push(tl(R.gems + " of them sit in published \ud83d\udc8e sets."));
    if (R.unseen) L.push(tl(R.unseen + " of them are not shown here: picked in another view."));
    return L.join("\n");
  }
  function guarded(first, ok, list, own) {          // own: the action touches only the place you stand in (a take-out)
    var R = reach(list, own);
    return ask(first + "\n\n" + reachText(R), { ok: ok, danger: true }).then(function (yes) {
      if (!yes || !R.risky) return yes;
      return ask(tl("Once more: " + R.n + " takes, from " + Math.max(1, R.wss.length) + " workspaces. Sure?") + "\n\n" +
        tl("Better to ask seven times than to lose them all at once."), { ok: tl("Yes, all " + R.n), danger: true });
    });
  }
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
      box.innerHTML = '<div class="peek-title">' + esc(r.title) + '</div><div class="coll-meta"><span>' + esc(state.hooks.ago(r.created, r.name)) + "</span>" +
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
      '<div><div class="sheet-title"><span class="coll-title-text" data-sheet-ren="1" title="Click to rename">' + esc(r.title) + '</span></div><div class="coll-meta"><span>' + esc(state.hooks.ago(r.created, r.name)) + "</span>" +
      (r.seconds ? " \u00b7 <span>" + state.hooks.clock(r.seconds) + "</span>" : "") + (req.cot ? " \u00b7 <span>" + esc(cotWord(req.cot)) + "</span>" : "") + " \u00b7 <span>" + esc(KINDS[r.kind] || r.kind) + "</span>" +
      (r.derived.length ? " \u00b7 <span>made from it: " + esc(r.derived.join(", ")) + "</span>" : "") + "</div></div>" +
      '<span class="pb-rate"><button type="button" class="pb-btn" data-sheet-rate="1" aria-pressed="' + (r.rating > 0) + '">' + ico("like") + '</button>' +
      markBtns(r.name, "pb-btn") +                     // HERESY 1802
      '<button type="button" class="pb-btn" data-sheet-rate="-1" aria-pressed="' + (r.rating < 0) + '">' + ico("dislike") + '</button>' +
      '<button type="button" class="pb-btn" id="sheetFav" aria-pressed="' + r.favorite + '" >' + ico("star") + "</button></span></div>" +
      (r.workspaces.length ? '<div class="coll-badges">' + r.workspaces.map(function (w) { return wsBadge(w); }).join("") + "</div>" : "") +
      '<div class="sheet-cols"><div><div class="peek-cap">Style</div><pre class="sheet-text">' + esc(req.style || "") + "</pre></div>" +
      '<div><div class="peek-cap">Lyrics</div><pre class="sheet-text sheet-lyrics">' + esc(req.lyrics || "") + "</pre></div></div>" +
      '<label class="field"><span class="label">Note <em id="sheetNoteState"></em></span><textarea id="sheetNote" rows="3" maxlength="600">' + esc(r.note || "") + "</textarea></label>" +
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
    plPlaying(now);                                   // HERESY 1731
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

  // HERESY 1802 (Viktor 27.10.2026: «Давай в воркспейсы и их подкатегории прикрутим Notes, и будем выводить их как тултипы. Больше места для
  // заметок»): a workspace's or a section's note, the tip of its name in the column (its name underlined with dots); 600 characters, empty takes it off
  var NOTE_MAX = 600;
  function wsNote(w) {
    if (!window.HeresyDialog) return;
    var had = (state.wsNotes || {})[w] || "";
    window.HeresyDialog.prompt("A note on “" + w + "”\n\nShown when the pointer rests on its name; 600 characters at most.\nEmpty removes it.", had,
      { area: true, rows: 6, max: NOTE_MAX, ok: "Keep" }).then(function (t) {
      if (t == null) return;
      t = String(t).trim();
      if (t === had) return;
      act({ op: "ws-note", workspace: w, text: t }, t ? "Note kept on “" + w + "”" : "Note taken off “" + w + "”", true);
    });
  }
  function wsTip(w) {
    var n = (state.wsNotes || {})[w];
    return n ? 'data-tip="' + esc(n.length > NOTE_MAX ? n.slice(0, NOTE_MAX - 1) + "…" : n) + '" data-has-note="1" ' : "";
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
        { icon: "✎", label: "Note…", hint: (state.wsNotes || {})[w] ? "✓" : "", action: function () { wsNote(w); } },   // HERESY 1802
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
      { icon: "✎", label: "Note…", hint: (state.wsNotes || {})[w] ? "✓" : "", action: function () { wsNote(w); } },   // HERESY 1802
      { icon: "↳", label: "Move into…", action: function () { moveWs(w); } },   // HERESY 1808
      { sep: true },                                   // HERESY 1070: the safety catches
      { icon: "\u2744", label: "Freeze\u2026", hint: "heard, never changed", action: function () { freezeWs(w); } },   // HERESY 1166
      (function () {                                   // HERESY 1874: blind listening, its sections with it
        var own = (state.blind || []).indexOf(w) >= 0, by = !own && blindWs(w);
        return by ? { icon: "\ud83d\ude48", label: "Blind listening", hint: "with its parent", disabled: true }
          : { icon: "\ud83d\ude48", label: own ? "Lift the blindness" : "Blind listening", hint: own ? "" : "what made its takes hidden", checked: own,
              action: function () { act({ op: "blind", workspace: w, on: !own }, (own ? "Seen again: \u201c" : "Blind: \u201c") + w + "\u201d", true); } };
      })(),
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
  // HERESY 1808 (Viktor 28.10.2026: «добавь в функционал воркспейсов Move into ... Workspace > Move as a subfolder / Move just the samples»): another
  // workspace chosen, then as a section of it (a rename under it: its sections and takes go along, its name kept; two levels of sections at most) or only
  // its takes (they go in, and the workspace goes, empty, with its sections). The 💎 sets, the frozen and the regeneration's sections are not offered
  function moveWs(w) {
    if (!window.HeresyDialog) return;
    var subs = state.ws.filter(function (x) { return x.indexOf(w + SEP) === 0; });
    var height = Math.max.apply(null, [w].concat(subs).map(function (x) { return wsParts(x).length; })) - wsParts(w).length;
    var items = state.ws.filter(function (x) { return x !== w && x.indexOf(w + SEP) !== 0 && !closedWs(x) && wsLeaf(x) !== SOURCED; }).map(function (x) {
      var n = state.rows.filter(function (r) { return inTree(r, x); }).length;
      return { value: x, label: wsParts(x).length > 1 ? wsLeaf(x) : x, depth: wsParts(x).length - 1, path: wsParts(x).slice(0, -1).join(" \u203a "), note: String(n) };   // 1853: path
    });
    window.HeresyDialog.choose("Move “" + w + "” into", items, { cancel: "Cancel", filter: "Filter the workspaces" }).then(function (to) {
      if (!to) return;
      var fits = wsParts(to).length + 1 + height <= DEPTH, asSec = to + SEP + wsLeaf(w);
      return window.HeresyDialog.confirm("Move “" + w + "” into “" + to + "”\n\n" +
          (fits ? "As a section: it goes inside it, with its sections and its takes, its name kept." : "As a section: it would be more than two levels of sections deep, so not here.") +
          "\nOnly its takes: they go in, and the workspace itself goes, empty (its sections too).",
          { ok: fits ? "As a section" : "Only its takes", alt: fits ? "Only its takes" : null, cancel: "Cancel" }).then(function (how) {
        if (!how) return;
        var section = fits && how === true;
        if (section && state.ws.indexOf(asSec) >= 0) return toast("There is a workspace “" + asSec + "” already", true);
        return (section ? act({ op: "ws-rename", workspace: w, to: asSec }, "“" + wsLeaf(w) + "” is a section of “" + to + "” now", true)
                        : act({ op: "ws-pour", workspace: w, to: to }, "The takes of “" + w + "” are in “" + to + "” now", true))
          .then(function (ok) { if (ok) { followRename(w, section ? asSec : to); paint(); paintCurrent(); } });
      });
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
          saidProtected(d);                                // HERESY 1368: they stay in the library, in no workspace
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
  // HERESY 1502 (Viktor 16.10.2026: «В паспорте семпла не указана модель и её разрядность. Добавь прямо над VAE»): the backbone a take
  // was made with («IRAE-BF16», «Merge3-Q6_K»; the base one only its quant), the quant and the width it keeps in bits; none for imported sound
  var QUANT_BITS = { F32: 32, BF16: 16, F16: 16, Q8_0: 8, Q6_K: 6, Q5_K_M: 5, Q5_K_S: 5, Q5_0: 5, Q4_K_M: 4, Q4_K_S: 4, Q4_0: 4 };
  function modelLine(m) {
    if (!m || m === "import") return null;
    var parts = String(m).split("-"), quant = QUANT_BITS[parts[parts.length - 1]] ? parts.pop() : "";
    return { name: parts.join("-") || "YuE2", quant: quant, bits: quant ? QUANT_BITS[quant] : 0 };
  }
  function modelRow(m) {
    var x = modelLine(m);
    return x ? '<div class="ds-kv" data-ds-model="1"><span>model</span><b><span translate="no">' + esc(x.name + (x.quant ? " \u00b7 " + x.quant : "")) + "</span>" +
      (x.bits ? " \u00b7 " + esc(tr("{0}-bit").replace("{0}", x.bits)) : "") + "</b></div>" : "";
  }
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
        (String(q.lyrics || "").trim() ? '<div class="ds-sung"></div>' : "") +   // HERESY 1842: sung to the end?
        // HERESY 1131 (Viktor: «нотный ряд ABC… сложенный аккордеон не нужен»): the score open and drawn, its ABC under it;
        // a Direct take writes none: the one written from its sound, or the way to write it
        '<div class="peek-cap">Score <em class="ds-score-say"></em></div><div class="ds-staff"></div>' +
        '<pre class="sheet-text mono ds-abc"' + (q.abc ? "" : " hidden") + ">" + esc(q.abc || "") + "</pre>" +
        (q.abc ? "" : '<div class="ds-noscore row-hint">A Direct take writes no score. <button type="button" class="btn ghost small" data-ds="score">Write it from the sound</button> <span class="ds-score-run mono"></span></div>') +
        '<div class="peek-cap">MIDI <em class="ds-midi-say"></em></div><div class="ds-midi"></div>' +   // HERESY 1834
        '<div class="ds-covers-wrap" hidden><div class="peek-cap">Covers <em class="ds-cov-say"></em></div><div class="ds-covers"></div></div>' +   // HERESY 1848
        "</div>" +
        '<div class="ds-knobs"><div class="ds-group"><div class="peek-cap">Song</div>' + kv("mode", MODES[q.cot] || q.cot) + kv("length asked", q.duration ? h.clock(q.duration) : "") +
        kv("format", q.output_format + (q.output_format === "mp3" ? " " + q.mp3_bitrate : "")) + modelRow(t.model || r.model) + kv("VAE", q.vae) + kv("peak clip", q.peak_clip) +
        kv("music codes", codes ? codes + " (" + h.clock(codes / 25) + ")" : "") + kv("kept from the parent", keep ? keep + " codes (" + h.clock(keep / 25) + ")" : "") + "</div>" +
        '<div class="ds-group"><div class="peek-cap">Sound</div>' + kv("guidance", q.cfg_scale) + kv("steps", q.steps) + kv("solver", q.solver) +
        kv("batch", (q.lm_batch_size || 1) + " \u00d7 " + (q.synth_batch_size || 1)) + "</div>" +
        '<div class="ds-group"><div class="peek-cap">Seeds</div>' + kv("music", q.lm_seed) + kv("sound", q.seed) + "</div>" +
        samplingTable("Score sampling", q.abc_sampling) + samplingTable("Music sampling", q.semantic_sampling) +
        '<div class="ds-group"><div class="peek-cap">' + ((q.sliders || []).length ? "Sliders and LoRAs" : "LoRAs") + "</div>" +   // HERESY 1451: sliders only where an old take had them
          // HERESY 1128: as a take keeps them: sliders {id, strength}, LoRAs {id, ar, nar} (the music half's strength and the
          // sound half's); the older names (name, path, scale) still read
          ((q.sliders || []).map(function (s) {
            var v = s.strength != null ? s.strength : (s.scale != null ? s.scale : s.value);
            return kvFull(String(s.id || s.name || s.path || "slider"), v);
          }).join("")) +
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
          window.ABCJS.renderAbc(staffBox, abc, { responsive: "resize", staffwidth: 900, paddingtop: 4, paddingbottom: 8, add_classes: true,
            foregroundColor: getComputedStyle(staffBox).getPropertyValue("--paper-ink").trim() || "#111111" });   // HERESY 1167: the Creator's ink
          if (window.HeresyAbc && window.HeresyAbc.dress) window.HeresyAbc.dress(staffBox);   // HERESY 1601
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
      // HERESY 1834 (Viktor 28.10.2026: «вживляй MuScriptor в Студию — в паспорт треков и в самого Огранщика»): the take as multi-instrument
      // MIDI (MuScriptor): its sets, each with its instruments and its file; a size to pick (the suggested first, the ones done marked) and the
      // run, its progress here while the datasheet is open
      var midiBox = back.querySelector(".ds-midi"), midiSay = back.querySelector(".ds-midi-say"), midiState = { status: null, sets: [], jobs: [], timer: 0, pick: "" };
      function midiLab(path) {
        return fetch("/lab" + path).then(function (res) { return res.json().then(function (b) { if (!res.ok && res.status !== 202) throw new Error(b.error || res.statusText); return b; }); });
      }
      function midiSize(s) { return tr(s === "large" ? "Large" : s === "medium" ? "Medium" : "Small"); }
      function midiFile(path) { return "/library/file?name=" + encodeURIComponent(name) + "&path=" + encodeURIComponent(path); }
      function midiPaint() {
        if (!document.body.contains(back) || !midiBox) return;
        var st = midiState.status, sets = midiState.sets, done = {};
        var run = midiState.jobs.filter(function (j) { return j.status === "queued" || j.status === "running"; })[0];
        var failed = midiState.jobs.filter(function (j) { return j.status === "failed"; })[0];
        sets.forEach(function (m) { if ((m.source || "the take") === "the take" && !m.only) done[m.size] = 1; });
        midiSay.textContent = st ? tr(st.licence) : "";
        var html = sets.map(function (m) {
          var file = (m.files || [])[0] || {};
          return '<div class="ds-midi-set"><div class="ds-midi-head"><b>' + esc(midiSize(m.size)) + "</b><span>" + esc(tr("{0} notes").replace("{0}", m.notes)) + "</span><span>" + esc(h.clock(m.took || 0)) + "</span>" +
            (m.source && m.source !== "the take" ? '<span translate="no">' + esc(String(m.source).replace(/^derived\//, "")) + "</span>" : "") +
            '<span class="spacer"></span><button type="button" class="btn ghost small" data-ds="midi-roll" data-id="' + esc(m.id) + '">' + esc(tr("Open in the roll")) + "</button>" +   // HERESY 1835
            '<a class="btn ghost small" translate="no" href="' + esc(midiFile(file.path || "")) + '" download="' + esc((r.title || t.title || name) + " · " + m.size + ".mid") + '">MIDI</a></div>' +
            '<div class="ds-midi-chips">' + (m.instruments || []).slice().sort(function (a, b) { return b.notes - a.notes; }).map(function (i) {
              return '<span class="ds-midi-chip" translate="no">' + esc(String(i.label).replace(/_/g, " ")) + " <b>" + i.notes + "</b></span>"; }).join("") + "</div></div>";
        }).join("");
        if (st && !st.built) html += '<p class="row-hint">' + esc(tr("The transcriber is not built: ./build.sh builds it")) + "</p>";
        else if (st && !st.here.length) html += '<p class="row-hint">' + esc(tr("No MuScriptor model here: Engine → Models and LoRAs → Sound to MIDI fetches one")) +
          ' <button type="button" class="btn ghost small" data-ds="midi-engine">' + esc(tr("Engine → Models and LoRAs")) + "</button></p>";
        else if (st) {
          var pick = st.here.indexOf(midiState.pick) >= 0 ? midiState.pick : st.here.indexOf(st.suggest) >= 0 ? st.suggest : st.here[0];
          html += '<div class="ds-midi-go"><select class="ds-midi-size" aria-label="' + esc(tr("Size")) + '">' + st.here.map(function (s) {
              return '<option value="' + s + '"' + (s === pick ? " selected" : "") + ">" + esc(midiSize(s)) + (s === st.suggest ? " · " + esc(tr("suggested")) : "") + (done[s] ? " · " + esc(tr("done")) : "") + "</option>";
            }).join("") + "</select>" +
            '<button type="button" class="btn ghost small" data-ds="midi"' + (run || done[pick] ? " disabled" : "") + ">" + esc(tr("Transcribe to MIDI")) + "</button>" +
            '<span class="ds-midi-run mono">' + (run ? esc(run.status === "queued" ? tr("waits its turn") : tr("{0} % · {1} notes").replace("{0}", Math.round((run.progress || 0) * 100)).replace("{1}", run.notes || 0)) :
              failed ? esc(failed.error || "") : "") + "</span></div>";
        }
        midiBox.innerHTML = html;
      }
      function midiLoad() {
        if (!midiBox) return Promise.resolve();
        return Promise.all([midiLab("/midi/status"), midiLab("/midi/sets?name=" + encodeURIComponent(name))]).then(function (x) {
          midiState.status = x[0]; midiState.sets = x[1].sets || []; midiState.jobs = x[1].jobs || [];
          midiPaint();
          clearTimeout(midiState.timer);
          if (midiState.jobs.some(function (j) { return j.status === "queued" || j.status === "running"; }) && document.body.contains(back)) midiState.timer = setTimeout(midiLoad, 2000);
        }).catch(function (err) { midiBox.innerHTML = '<p class="row-hint">' + esc(err.message) + "</p>"; });
      }
      function midiGo() {
        var sel = midiBox.querySelector(".ds-midi-size");
        midiState.pick = sel ? sel.value : "";
        midiLab("/midi?name=" + encodeURIComponent(name) + "&size=" + encodeURIComponent(midiState.pick)).then(midiLoad).catch(function (err) { toast(err.message, true); });
      }
      if (midiBox) {
        midiBox.addEventListener("change", function (e) { if (e.target.classList.contains("ds-midi-size")) { midiState.pick = e.target.value; midiPaint(); } });
        midiLoad();
      }
      // HERESY 1842: sung to the end? The take's timing (Whisper on its lyrics, line by line) says whether its last lines were heard; run on the word
      var sungBox = back.querySelector(".ds-sung"), sungTimer = 0;
      function sungClock(t) { var m = Math.floor(t / 60), s = t - m * 60; return m + ":" + (s < 10 ? "0" : "") + s.toFixed(1); }
      function sungPaint(sg) {
        if (!sungBox) return;
        if (sg && sg.timed) sungMark(name, sg.done);   // HERESY 1846: its card says so at the next paint; 1854: the player at once
        var tip = tr("Whisper listens to the take and times its lyrics line by line (on the processor, a minute or two): were its last lines sung?");
        sungBox.innerHTML = !sg || sg.timed === false ? (sg && sg.running ? '<span class="ds-sung-say mono">' + esc(tr("Whisper listens…")) + "</span>" :
            '<button type="button" class="btn ghost small" data-ds="sung" data-tip="' + esc(tip) + '">' + esc(tr("Sung to the end?")) + "</button>")
          : sg.done === true ? '<span class="ds-sung-say is-good">✓ ' + esc(tr("Every line heard; the last ends at {0}").replace("{0}", sungClock(sg.last || 0))) + "</span>"
          : sg.done === false ? '<span class="ds-sung-say is-bad">✗ ' + esc(tr("Lines not heard at the end: {0}, after {1}").replace("{0}", sg.count).replace("{1}", sungClock(sg.suggest))) + "</span>" +
            ((sg.unsung || [])[0] ? '<q translate="no">' + esc(sg.unsung[0]) + "</q>" : "") +
            '<button type="button" class="btn ghost small" data-ds="sung-regen" data-at="' + esc(String(sg.suggest)) + '">' + esc(tr("Regenerate from {0}").replace("{0}", sungClock(sg.suggest))) + "</button>"
          : '<span class="ds-sung-say">' + esc(tr("The timing heard too little of this take to say")) + "</span>";
      }
      function sungLoad(run) {
        if (!sungBox) return;
        fetch("/lab/sung?name=" + encodeURIComponent(name) + (run ? "&run=1" : "")).then(function (r) { return r.json().then(function (b) { if (!r.ok && r.status !== 202) throw new Error(b.error || r.status); return b; }); })
          .then(function (sg) { sungPaint(sg); clearTimeout(sungTimer); if (sg.running && document.body.contains(back)) sungTimer = setTimeout(function () { sungLoad(false); }, 2500); })
          .catch(function (err) { if (run) sungBox.innerHTML = '<span class="ds-sung-say is-bad">' + esc(err.message) + "</span>"; else sungPaint(null); });
      }
      sungLoad(false);
      // HERESY 1848 (TODO: «версии картинки дубля»): the take's cover and its earlier ones, each to put back (the one it had goes among the earlier)
      var covWrap = back.querySelector(".ds-covers-wrap"), covBox = back.querySelector(".ds-covers");
      function covLoad() {
        if (!covBox) return;
        fetch("/lab/art/versions?name=" + encodeURIComponent(name)).then(function (r) { return r.ok ? r.json() : null; }).then(function (cv) {
          var vs = (cv && cv.versions) || [], now = window.HeresyArt ? window.HeresyArt.url(name) : "";
          covWrap.hidden = !cv || (!cv.current && !vs.length);
          if (covWrap.hidden) return;
          back.querySelector(".ds-cov-say").textContent = vs.length ? tr("{0} earlier").replace("{0}", vs.length) : "";
          covBox.innerHTML = (cv.current && now ? '<figure class="ds-cov is-now"><img src="' + esc(now) + '" alt="" loading="lazy" /><figcaption>' + esc(tr("now")) + "</figcaption></figure>" : "") +
            vs.map(function (v) {
              return '<figure class="ds-cov"><img src="/lab/artist/bin-file?take=' + encodeURIComponent(name) + "&stamp=" + encodeURIComponent(v.stamp) + '" alt="" loading="lazy" data-tip="' +
                esc((v.painter ? v.painter + " · " : "") + (v.prompt || "")) + '" /><figcaption>' + esc(h.ago(v.when)) +
                (cv.frozen ? "" : ' <button type="button" class="btn ghost small" data-ds="cov-back" data-stamp="' + esc(v.stamp) + '">' + esc(tr("Put it back")) + "</button>") + "</figcaption></figure>";
            }).join("");
        }).catch(function () { if (covWrap) covWrap.hidden = true; });
      }
      covLoad();
      back.querySelector(".ds-box").addEventListener("click", function (e) {
        var b = e.target.closest("[data-ds]");
        if (!b) return;
        if (b.dataset.ds === "close") return close();
        if (b.dataset.ds === "score") return scoreFromSound(b);
        if (b.dataset.ds === "midi") return midiGo();   // HERESY 1834
        if (b.dataset.ds === "sung") { b.disabled = true; return sungLoad(true); }   // HERESY 1842
        if (b.dataset.ds === "cov-back") {               // HERESY 1848: an earlier cover back on the take; the one it had goes among the earlier
          b.disabled = true;
          fetch("/lab/artist/bin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "restore", items: [{ kind: "cover", take: name, stamp: b.dataset.stamp }] }) })
            .then(function (r) { return r.json().then(function (x) { if (!r.ok) throw new Error(x.error || r.status); if ((x.kept || []).length) throw new Error(x.kept[0].why); return x; }); })
            .then(function () { toast(tr("The earlier cover is back; the one it had is among the earlier")); return window.HeresyArt ? window.HeresyArt.refresh() : null; })
            .then(covLoad, function (err) { b.disabled = false; toast(err.message, true); });
          return;
        }
        if (b.dataset.ds === "sung-regen") { var at = +b.dataset.at; close(); h.openTake(name, "create"); if (window.ruachRegenFrom) window.ruachRegenFrom(at, name); return; }
        if (b.dataset.ds === "midi-roll") {             // HERESY 1835: the set's MIDI as the form's score, the roll on it
          midiLab("/midi/score?name=" + encodeURIComponent(name) + "&id=" + encodeURIComponent(b.dataset.id)).then(function (sc) {
            var box = document.getElementById("abc");
            if (!box) return;
            return (box.value.trim() ? window.HeresyDialog.confirm(tr("Replace the score in the form with this MIDI?"), { ok: "Replace" }) : Promise.resolve(true)).then(function (ok) {
              if (!ok) return;
              close();
              box.value = sc.abc; box.dispatchEvent(new Event("input", { bubbles: true }));
              var tab = document.querySelector('.topbar [data-tab="create"]');
              if (tab) tab.click();
              setTimeout(function () { if (window.HeresyRoll) window.HeresyRoll.open(); }, 300);
              toast(tr("The roll opens on the MIDI: {0}, {1} BPM, {2} bars").replace("{0}", sc.key).replace("{1}", sc.bpm).replace("{2}", sc.bars));
            });
          }).catch(function (err) { toast(err.message, true); });
          return;
        }
        if (b.dataset.ds === "midi-engine") { close(); var et = document.getElementById("engineToggle"); if (et) et.click(); if (window.ruachEngineTab) window.ruachEngineTab("models"); return; }
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

  // HERESY 1726 (Viktor 22.10.2026: «Песок на карточке имеет предсказуемый паттерн»): where a card's gold grain starts, from its name, so neighbours differ
  function sandAt(name) {
    var h = 2166136261;
    for (var k = 0; k < String(name).length; k++) { h ^= String(name).charCodeAt(k); h = Math.imul(h, 16777619); }
    return ' style="--sand-x:' + ((h >>> 0) % 320) + "px;--sand-y:" + ((h >>> 9) % 320) + 'px"';
  }
  // HERESY 1731 (Viktor 22.10.2026, the playlist): its takes in his order, apart from the workspaces; its view in the Librarian and in a window
  var plWin = null;
  // HERESY 1814 (Plenio's presets, our marks): «Play only» a mark; the playlist keeps every take, the playing goes through the marked ones
  state.plOnly = recall("yue2.plOnly") || "";
  function plMatches(n) {
    var r = rowOf(n), k = state.plOnly;
    if (!k || !r) return !k;
    return k === "like" ? r.rating > 0 : k === "star" ? favOf(n, r) : markOf(n, k === "fire" ? "fire" : "gem");
  }
  function plPlayOrder(current) { return (state.playlist || []).filter(function (n) { return n === current || plMatches(n); }); }
  function plRows() { var by = {}; state.rows.forEach(function (r) { by[r.name] = r; }); return (state.playlist || []).map(function (n) { return by[n]; }).filter(Boolean); }
  function plCard(r) {
    var now = state.hooks.playing ? state.hooks.playing() : {}, mine = now.name === r.name, on = mine && now.playing, art = window.HeresyArt ? window.HeresyArt.url(r.name) : "";
    var mk = function (lit, icon, tip) { return '<span class="pl-mark' + (lit ? " is-on" : "") + '" title="' + esc(tip) + '">' + ico(icon) + "</span>"; };
    var when = state.hooks.when ? state.hooks.when(r.created, r.name) : "<span>" + esc(r.created ? state.hooks.ago(r.created, r.name) : "") + "</span>";
    return '<article class="pl-card' + (mine ? " is-current" : "") + '" draggable="true" data-pl="' + esc(r.name) + '">' +
      '<button type="button" class="pl-play' + (on ? " is-playing" : "") + '" data-pl-play="' + esc(r.name) + '" aria-label="' + (on ? "Pause" : "Play") + '">' + ico(on ? "pause" : "play") + "</button>" +
      '<div class="pl-main"><div class="pl-title" translate="no">' + esc(r.title) + "</div>" +
      '<div class="pl-meta">' + when + (r.seconds ? " · <span>" + state.hooks.clock(r.seconds) + "</span>" : "") + (r.cot ? " · <span>" + esc(cotWord(r.cot)) + "</span>" : "") + "</div>" +
      '<div class="pl-marks">' + mk(r.rating > 0, "like", "Liked") + mk(markOf(r.name, "fire"), "flame", "On fire") + mk(markOf(r.name, "gem"), "gem", "A gem") + mk(r.rating < 0, "dislike", "Disliked") + mk(favOf(r.name, r), "star", "Favourite") +
      mk(!!r.note, "note", r.note ? String(r.note).slice(0, 160) : "Without a note") +
      '<button type="button" class="pl-out" data-pl-out="' + esc(r.name) + '" title="Out of the playlist (the take stays)" aria-label="Out of the playlist (the take stays)">✕</button></div></div>' +
      '<div class="pl-cover">' + (art ? '<img alt="" loading="lazy" src="' + esc(art) + '" />' : '<span class="pl-nocover">' + ico("music") + "</span>") + "</div></article>";
  }
  function plHtml() {
    var rows = plRows();
    return '<div class="pl-head"><button type="button" class="btn small primary" data-pl-go="1"' + (rows.length ? "" : " disabled") + ">Play from the top</button>" +
      '<button type="button" class="btn ghost small" data-pl-shuffle="1"' + (rows.length > 1 ? "" : " disabled") + ' title="A deck\'s shuffle: every take to a new place">Shuffle the deck</button>' +
      '<label class="pl-xf" title="The crossfade between the playlist\'s takes, 0 to 4 s; Previous and Next change at once"><span>Crossfade</span>' +   // HERESY 1737
      '<input type="range" min="0" max="4" step="1" value="' + (+state.plXfade || 0) + '" data-pl-xf="1" /><span class="mono pl-xf-n">' + (+state.plXfade || 0) + " s</span></label>" +
      '<label class="pl-only" title="Only the takes with this mark play; the playlist keeps every take"><span>Play only</span><select data-pl-only="1">' +   // HERESY 1814
      [["", "every take"], ["like", "Liked"], ["fire", "On fire"], ["gem", "A gem"], ["star", "Favourite"]].map(function (o) {
        return '<option value="' + o[0] + '"' + (state.plOnly === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select></label>" +
      '<span class="pl-hint">Drag a take to its place; × takes it out of the playlist, never out of the library</span></div>' +
      (rows.length ? '<div class="pl-list">' + rows.map(plCard).join("") + "</div>"
        : '<p class="row-hint coll-empty">The playlist is empty: «Add to playlist» in a take\'s menu puts takes here</p>');
  }
  function plHead() {                                    // the Librarian's heading, as for its other places
    var rows = plRows(), secs = rows.reduce(function (a, r) { return a + (+r.seconds || 0); }, 0);
    $("collWhere").innerHTML = " › <span>Playlist</span>";
    $("collNote").innerHTML = "<span>" + rows.length + " takes</span> · <span>" + state.hooks.clock(secs) + "</span>";
  }
  function plPaint() {                                   // paint() hands the place over here
    $("collGrid").className = "coll-grid pl-view";
    $("collGrid").innerHTML = plHtml();
    if ($("collMore")) $("collMore").hidden = true;      // the lazy rows of the place before stay out
    plBind($("collGrid"));
    plHead();
  }
  function plChanged(d, asked) {
    if (d) { state.playlist = d.playlist || []; state.plXfade = d.playlist_xfade || 0; if (d.takes) state.rows = fresh(d.takes, asked); }
    if (state.place === "__playlist") paint(); else paintSide();
    if (plWin) plWin.querySelector(".pl-body").innerHTML = plHtml();
    if (state.hooks.playlistChanged) state.hooks.playlistChanged();
  }
  function plOp(body, said) {
    var asked = rateSeq;
    return api("/collection", body).then(function (d) { plChanged(d, asked); if (said) toast(said); return true; },
      function (e) { toast(e.message, true); plChanged(); return false; });
  }
  function plAdd(names, where) {
    return plOp({ op: "playlist-add", names: names, where: where }, names.length > 1 ? "Into the playlist: " + names.length : "Into the playlist");
  }
  function plPlaying(now) {                              // the play buttons follow the player, as the cards' do
    Array.prototype.forEach.call(document.querySelectorAll(".pl-card[data-pl]"), function (card) {
      var mine = card.dataset.pl === now.name, on = mine && !!now.playing, b = card.querySelector(".pl-play");
      card.classList.toggle("is-current", mine);
      if (!b) return;
      b.classList.toggle("is-playing", on);
      b.innerHTML = ico(on ? "pause" : "play");
      b.setAttribute("aria-label", on ? "Pause" : "Play");
    });
  }
  function plBind(root) {                                // the playlist's own clicks and drags, wherever its view stands
    if (root.dataset.plBound) return;
    root.dataset.plBound = "1";
    root.addEventListener("click", function (e) {
      var b = e.target.closest("[data-pl-play]"), out = e.target.closest("[data-pl-out]");
      if (b) { if (state.hooks.playPlaylist) state.hooks.playPlaylist(b.dataset.plPlay); return; }
      if (out) { plOp({ op: "playlist-remove", names: [out.dataset.plOut] }); return; }
      if (e.target.closest("[data-pl-go]")) { var first = (state.playlist || [])[0]; if (first && state.hooks.playPlaylist) state.hooks.playPlaylist(first, true); return; }
      if (e.target.closest("[data-pl-shuffle]")) plOp({ op: "playlist-shuffle" }, "Shuffled");
    });
    // HERESY 1737: the crossfade, 0 to 4 s, kept by the lab
    root.addEventListener("input", function (e) { var x = e.target.closest && e.target.closest("[data-pl-xf]"), n = x && root.querySelector(".pl-xf-n"); if (n) n.textContent = x.value + " s"; });
    root.addEventListener("change", function (e) { var x = e.target.closest && e.target.closest("[data-pl-xf]"); if (x) plOp({ op: "playlist-xfade", seconds: +x.value }); });
    root.addEventListener("change", function (e) {        // HERESY 1814: «Play only», this viewer's own
      var x = e.target.closest && e.target.closest("[data-pl-only]");
      if (!x) return;
      state.plOnly = x.value;
      if (x.value) store("yue2.plOnly", x.value); else { try { localStorage.removeItem("yue2.plOnly"); } catch (y) { /* private */ } }
      plChanged();
    });
    root.addEventListener("contextmenu", function (e) {   // the take's own menu, as on its card
      var card = e.target.closest(".pl-card[data-pl]");
      if (!card || !state.hooks.menu) return;
      e.preventDefault();
      state.hooks.menu(card.dataset.pl, e.clientX, e.clientY);
    });
    var drag = null, dropped = false;
    root.addEventListener("dragstart", function (e) {
      var card = e.target.closest && e.target.closest(".pl-card[data-pl]");
      if (!card) return;
      drag = card.dataset.pl; dropped = false;
      card.classList.add("is-dragging");
      e.dataTransfer.effectAllowed = "move";
      try { e.dataTransfer.setData("text/plain", drag); } catch (x) { /* some browsers */ }
    });
    root.addEventListener("dragover", function (e) {
      if (!drag || !(e.target.closest && e.target.closest(".pl-list"))) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      var card = e.target.closest(".pl-card[data-pl]");
      if (!card || card.dataset.pl === drag) return;
      var box = card.getBoundingClientRect(), list = card.parentNode, moving = list.querySelector('.pl-card[data-pl="' + CSS.escape(drag) + '"]');
      if (moving) list.insertBefore(moving, e.clientY > box.top + box.height / 2 ? card.nextSibling : card);
    });
    root.addEventListener("drop", function (e) { if (drag) { e.preventDefault(); dropped = true; } });
    root.addEventListener("dragend", function (e) {
      if (!drag) return;
      drag = null;
      var list = root.querySelector(".pl-list"), pl = state.playlist || [];
      if (!list || !dropped) { plChanged(); return; }   // let go outside the list (or Esc): back where it was
      var order = Array.prototype.map.call(list.querySelectorAll(".pl-card[data-pl]"), function (x) { return x.dataset.pl; });
      Array.prototype.forEach.call(list.querySelectorAll(".is-dragging"), function (x) { x.classList.remove("is-dragging"); });
      var drawn = pl.filter(function (n) { return order.indexOf(n) >= 0; });
      if (order.join("\n") === drawn.join("\n")) return;
      plOp({ op: "playlist-order", names: order.concat(pl.filter(function (n) { return order.indexOf(n) < 0; })) });
    });
  }
  function plOpen() {                                    // the playlist in a window of its own (the player's last button)
    if (plWin) return;
    var back = document.createElement("div");
    back.className = "cmp-back pl-back";
    back.innerHTML = '<div class="cmp-box pl-box" role="dialog" aria-modal="true" aria-label="Playlist"><div class="cmp-head"><div class="cmp-title">Playlist</div>' +
      '<button type="button" class="btn ghost small" data-pl-close="1">Close</button></div><div class="pl-body"></div></div>';
    document.body.appendChild(back);
    plWin = back;
    var body = back.querySelector(".pl-body");
    body.innerHTML = plHtml();
    plBind(body);
    var key = function (e) { if (e.key === "Escape" && !document.querySelector(".hd-back:not(.is-leaving)")) { e.preventDefault(); e.stopPropagation(); shut(); } };
    var shut = function () { document.removeEventListener("keydown", key, true); back.remove(); plWin = null; };
    document.addEventListener("keydown", key, true);
    back.addEventListener("mousedown", function (e) { if (e.target === back) shut(); });
    back.querySelector("[data-pl-close]").addEventListener("click", shut);
  }
  // HERESY 1825: the note's button, on every card: its own colour with a note (its words as the tip), grey without one; a click opens its window
  function noteBtn(r, attr) {
    return '<button type="button" class="coll-act coll-note' + (r.note ? " coll-hasnote" : "") + '" ' + attr + ' aria-label="' + (r.note ? "Has a note" : "Note…") +
      '" data-tip="' + esc(r.note ? String(r.note).slice(0, 300) : NOTE_NONE) + '"' + (r.note ? ' translate="no"' : "") + ">" + ico("note") + "</button>";
  }
  var NOTE_NONE = "No note yet: a click writes one";
  function editNote(name, title) {                    // the same window as the menu's «Note…», its text 2 pt larger
    if (!window.HeresyDialog) return Promise.resolve();
    var had = note(name), h = state.hooks || {}, t = h.findTake ? h.findTake(name) : null;
    return window.HeresyDialog.prompt("A note on “" + (title || (t && (t.title || t.name)) || name) + "”\n\nEmpty removes it.", had,
      { ok: "Keep the note", max: 600, area: true, rows: 6, cls: "hd-note" }).then(function (v) { if (v !== null && v !== had) return setNote(name, v); });
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

  window.HeresyCollection = { init: init, reload: load, hubOpen: hubOpen, repaint: paint, paintArts: paintArts, isHidden: isHidden, isFresh: isFresh, markPlayed: markPlayed, takeLocked: takeLocked, cardExtras: cardExtras, matcher: matcher, landed: landed, inCurrent: inCurrent,
                              current: current, landable: landable, closedWs: closedWs, firstWs: firstWs, absent: function () { return state.loadStatus === 404; }, chooseCurrent: chooseCurrent, setCurrent: setCurrent, rating: rating, rate: rate, rateMany: rateMany, favMany: favMany, exportChecked: exportZip, note: note, setNote: setNote, editNote: editNote, playlist: function () { return (state.playlist || []).slice(); }, playlistOrder: plPlayOrder, playlistOnly: function () { return state.plOnly; }, playlistAdd: plAdd, openPlaylist: plOpen, playlistXfade: function () { return +state.plXfade || 0; }, paintPlaying: paintPlaying, loaded: function () { return state.loaded; },
                              order: function () { return state.place === "__trash" ? [] : state.place === "__playlist" ? (state.playlist || []).slice() : shown().map(function (r) { return r.name; }); },
                              deal: function (names) { if (!names) { DEAL = {}; return []; } return names.slice().sort(function (x, y) { return dealt(x) - dealt(y); }); },   // HERESY 1863: for the checks
                              datasheet: openDatasheet, sung: sungMany, sungOf: function (n) { return (state.sung || {})[n]; }, sungMark: sungMark, modelLine: modelLine, reveal: function (name) { return (state.loaded ? Promise.resolve() : load()).then(function () { reveal(name); }); },
                              row: rowOf, workspaces: function () { return state.ws.slice(); }, act: act, openSheet: openSheet, requestOf: requestOf,
                              selected: names, place: function () { return state.place; }, moveTo: moveTo,
                              markFavorite: markFavorite, markBtns: markBtns, markOf: markOf, isBlind: isBlind, paintMarks: paintMarks, reactBtn: reactBtn, reactOf: reactOf, setReact: setReact, reactClose: reactClose, REACTS: REACTS,   // HERESY 1802
                              pinned: function (name) { return ((state.pins || {})[state.place] || []).indexOf(name) >= 0; }, pin: pin,
                              pinPlaces: pinPlaces, unpinAll: unpinAll, pinTarget: pinTarget, pinIn: pinIn,   // HERESY 1167
                              isFrozen: function (name) { var r = rowOf(name); return !!(r && r.frozen); },   // HERESY 1166
                              isProtected: isProtected, protect: protect, protectMany: protectMany, protTip: function (on) { return on ? PROT_ON : PROT_OFF; },   // HERESY 1368
                              undoable: undoable, untrash: untrash, guard: guarded,   // HERESY 1474: the take's menu asks as the bar does
                              trash: function (names) { return api("/trash", { op: "move", names: names }).then(function (d) { saidProtected(d); ((d && d.moved) || names).forEach(function (n) { delete state.sel[n]; }); return load().then(function () { return d; }); }); },
                              // HERESY 1169 · 1239 (Viktor 08.10.2026: «Я переместил в корзину три трека, а блок так и остался раскрытым, и не исчез обратно в "тень"»): what the menu sends away leaves the choice, as with the bar's own buttons
                              unselect: function (names) { (names || []).forEach(function (n) { delete state.sel[n]; }); paint(); } };
})();
