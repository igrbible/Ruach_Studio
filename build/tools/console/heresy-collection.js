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
  // HERESY 2294 (Viktor 09.11.2026: «для Чтеца будет та же Библиотека, но со своими пространствами, древами и т.п. Кнопка на баре в полосе, где
  // пространство пишется, и где поле поиска. Она переключает библиотекаря между Творец, ОБА, Чтец. Каждый трек принадлежит своему оригиналу Творца
  // или Чтеца, не перемещается из рэлма, но может линковаться. Огранщик также привязывается к оригинальному корню»): two realms in one Library.
  // A take's realm is its root's (the lab says it, r.realm); a workspace's is its top's (d.ws_realm). The switch on the head's bar shows one realm
  // or both, remembered; each realm keeps its own workspace in hand; a take of the other realm in a workspace is a link, and says so
  var REALM_KEY = "yue2.libRealm";
  // the realms are on where the Reader is (its module, or a workspace of its realm): a Studio without it has one Library, as before, and no switch
  function realmsOn() { return !!((window.RuachRooms && window.RuachRooms.read) || (state.wsRealm && Object.keys(state.wsRealm).length)); }
  function realmNow() { if (!realmsOn()) return "off"; var v = recall(REALM_KEY); return v === "reader" || v === "both" ? v : "creator"; }
  function wsRealm(w) { return (state.wsRealm || {})[String(w || "").split(" / ")[0]] === "reader" ? "reader" : "creator"; }
  function rowRealm(r) { return r && r.realm === "reader" ? "reader" : "creator"; }
  function realmWs(w) { var m = realmNow(); return m === "both" || m === "off" || wsRealm(w) === m; }
  function inRealm(r) { var m = realmNow(); return m === "both" || m === "off" || rowRealm(r) === m; }
  function isLink(r) { return realmsOn() && !!state.place && state.place.charAt(0) !== "_" && rowRealm(r) !== wsRealm(state.place); }
  function currentIn(realm) {                    // the realm's own workspace in hand: the one in hand when it is the realm's, else the last it had
    var w = current();
    if (w && wsRealm(w) === realm) return w;
    var k = workable(recall(WS_KEY + "." + realm) || "");
    return k && state.ws.indexOf(k) >= 0 && wsRealm(k) === realm ? k : "";
  }
  function realmBadge(r) {
    if (isLink(r)) return badge(rowRealm(r) === "reader" ? "Linked from the Narrator" : "Linked from the Musician", "k-link");
    return realmNow() === "both" ? badge(rowRealm(r) === "reader" ? "Narrator" : "Musician", "k-realm k-realm-" + rowRealm(r)) : "";
  }
  // HERESY 2298 (Viktor 09.11.2026): one small slider of three positions, as an equalizer's «+6 dB | Bypass | +12 dB»: Creator left, Both middle,
  // Reader right; a click on a position, the knob dragged, or ← →; and each realm comes back to the workspace last open in it
  var REALM_POS = ["creator", "both", "reader"], REALM_NAME = { creator: "Musician", both: "Both", reader: "Narrator" }, PLACE_KEY = "yue2.libPlace", REALM_STEP = 30;
  function paintRealm() {
    var box = document.getElementById("collRealm"), m = realmNow();
    if (!box) return;
    box.hidden = m === "off";
    var i = Math.max(0, REALM_POS.indexOf(m)), k = box.querySelector(".rs-knob");
    box.dataset.pos = REALM_POS[i];
    box.setAttribute("aria-valuenow", String(i));
    box.setAttribute("aria-valuetext", tr(REALM_NAME[REALM_POS[i]]));
    if (k && !box.classList.contains("is-drag")) k.style.transform = "translateX(" + i * REALM_STEP + "px)";
  }
  function setRealm(m) {
    var old = realmNow();
    if (REALM_POS.indexOf(m) < 0 || m === old) { paintRealm(); return; }
    if (old !== "off") store(PLACE_KEY + "." + old, state.place || "");   // the workspace open in the realm left, to come back to
    store(REALM_KEY, m);
    var p = state.place || "";
    var fits = function (w) { return !!w && (w.charAt(0) === "_" || (state.ws.indexOf(w) >= 0 && (m === "both" || wsRealm(w) === m))); };
    // one open that the realm shows stays (Both shows every one; a system place every realm); else the realm's own last, else its own in hand
    if (!(p && (p.charAt(0) === "_" || m === "both" || wsRealm(p) === m))) {
      var back = recall(PLACE_KEY + "." + m) || "";
      state.place = fits(back) ? back : m === "both" ? "" : currentIn(m);
    }
    state.sel = {};
    paintRealm(); paint();
  }
  function realmBar() {
    var tools = document.getElementById("collHeadTools"), q = document.getElementById("collSearch");
    if (!tools || document.getElementById("collRealm")) return;
    var box = document.createElement("span");
    box.id = "collRealm"; box.className = "coll-realm"; box.tabIndex = 0;
    box.setAttribute("role", "slider"); box.setAttribute("aria-label", tr("Realm")); box.setAttribute("aria-valuemin", "0"); box.setAttribute("aria-valuemax", "2");
    box.dataset.tip = "The Library's realm: Musician on the left, Both in the middle, Narrator on the right (click a position, drag the knob, or press \u2190 \u2192). A take stays in its root's realm; what the Refiner makes with a Narrator's take in it is the Narrator's; Add to workspace links a take into the other realm's workspace, a move never takes it there";
    // HERESY 2298: the track, a dot at each position, the knob with the realm's sign (a note, both, a word said); three hit zones over the thirds
    box.innerHTML = '<svg class="rs-svg" viewBox="0 0 88 22" width="88" height="22" aria-hidden="true" focusable="false">' +
      '<rect class="rs-track" x="1" y="3" width="86" height="16" rx="8"/><circle class="rs-dot" cx="14" cy="11" r="1.7"/><circle class="rs-dot" cx="44" cy="11" r="1.7"/>' +
      '<circle class="rs-dot" cx="74" cy="11" r="1.7"/><g class="rs-knob"><circle class="rs-ball" cx="14" cy="11" r="7.5"/>' +
      '<path class="rs-i rs-i-creator" d="M15 6.6v5.7a1.6 1.6 0 1 1-1-1.5V6.6zM15 6.6l2.2 1.1v1.3L15 7.9z"/>' +
      '<path class="rs-i rs-i-both" d="M10.6 9h6.8M10.6 13h6.8"/>' +
      '<path class="rs-i rs-i-reader" d="M10.4 7.6h7.2a.9.9 0 0 1 .9.9v3.4a.9.9 0 0 1-.9.9h-3.9l-2 1.6v-1.6h-1.3a.9.9 0 0 1-.9-.9V8.5a.9.9 0 0 1 .9-.9z"/></g></svg>' +
      REALM_POS.map(function (k, i) { return '<span class="rs-hit" data-realm="' + k + '" style="left:' + (i * 100 / 3) + '%"></span>'; }).join("");
    var drag = null, dragged = false;
    box.addEventListener("click", function (e) {
      var b = e.target.closest("[data-realm]");
      if (dragged) { dragged = false; return; }                  // a drag ends where the knob was let go, not where the click landed
      if (b) setRealm(b.dataset.realm);
    });
    box.addEventListener("keydown", function (e) {
      var i = REALM_POS.indexOf(realmNow()), to = e.key === "ArrowLeft" ? i - 1 : e.key === "ArrowRight" ? i + 1 : e.key === "Home" ? 0 : e.key === "End" ? 2 : -9;
      if (to === -9) return;
      e.preventDefault();
      setRealm(REALM_POS[Math.max(0, Math.min(2, to))]);
    });
    box.addEventListener("pointerdown", function (e) {
      if (e.button !== 0) return;
      var r = box.getBoundingClientRect();
      drag = { x0: e.clientX, left: r.left, id: e.pointerId, on: false };
    });
    box.addEventListener("pointermove", function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      if (!drag.on && Math.abs(e.clientX - drag.x0) < 4) return;
      if (!drag.on) { drag.on = true; box.classList.add("is-drag"); try { box.setPointerCapture(e.pointerId); } catch (x) { /* gone */ } }
      var k = box.querySelector(".rs-knob"), x = Math.max(0, Math.min(2 * REALM_STEP, e.clientX - drag.left - 14));
      if (k) k.style.transform = "translateX(" + x + "px)";
      drag.at = x;
    });
    function dragEnd(e) {
      if (!drag || e.pointerId !== drag.id) return;
      var was = drag;
      drag = null;
      box.classList.remove("is-drag");
      if (!was.on) return;
      dragged = true;
      setTimeout(function () { dragged = false; }, 0);
      setRealm(REALM_POS[Math.round((was.at || 0) / REALM_STEP)]);
      paintRealm();
    }
    box.addEventListener("pointerup", dragEnd);
    box.addEventListener("pointercancel", dragEnd);
    tools.insertBefore(box, q && q.parentNode === tools ? q : tools.firstChild);
    var st = document.createElement("style");
    st.textContent = ".coll-realm { position: relative; display: inline-block; flex: none; width: 88px; height: 22px; cursor: pointer; touch-action: none; border-radius: 11px; vertical-align: middle; }" +
      " .coll-realm:focus-visible { outline: 2px solid var(--amber, currentColor); outline-offset: 2px; } .coll-realm .rs-svg { display: block; overflow: visible; }" +
      " .coll-realm .rs-track { fill: var(--sunk, rgba(0,0,0,.08)); stroke: var(--line-strong, currentColor); stroke-width: 1; }" +
      " .coll-realm .rs-dot { fill: var(--muted, currentColor); opacity: .7; } .coll-realm .rs-knob { transition: transform .2s cubic-bezier(.3,.7,.3,1.2); }" +
      " .coll-realm.is-drag .rs-knob { transition: none; } .coll-realm .rs-ball { fill: var(--amber, #a01e32); stroke: var(--amber-edge, transparent); stroke-width: 1; }" +
      " .coll-realm:hover .rs-ball { fill: var(--amber-hi, var(--amber, #a01e32)); } .coll-realm .rs-i { display: none; fill: var(--on-amber, #fff); stroke: none; }" +
      " .coll-realm .rs-i-both { fill: none; stroke: var(--on-amber, #fff); stroke-width: 1.6; stroke-linecap: round; }" +
      " .coll-realm[data-pos=creator] .rs-i-creator, .coll-realm[data-pos=both] .rs-i-both, .coll-realm[data-pos=reader] .rs-i-reader { display: inline; }" +
      " .coll-realm .rs-hit { position: absolute; top: 0; bottom: 0; width: 33.34%; }" +
      " .coll-badge.k-link::before { content: \"\\1F517  \"; } .coll-badge.k-realm-reader { border-style: dashed; }";
    document.head.appendChild(st);
    paintRealm();
  }
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
  // HERESY 1057: the Studio's own dialogs (heresy-dialog.js)
  function ask(text, opts) { return window.HeresyDialog.confirm(text, opts); }
  // HERESY 1167 (Viktor: «Укорачиваю до… 32 символа макс. Исправь лимиты везде»): 32 characters on each level of a
  // workspace's path (the lab says the same, and takes a name already there as it is)
  var WS_PART = 56;   // 09.11.2026: 56 by his word (was 32)
  function askName(text, value, opts) {
    opts = Object.assign({ max: WS_PART }, opts || {});
    return window.HeresyDialog.prompt(text, value, opts).then(function (v) { return (v || "").trim(); });
  }
  function toast(t, bad) { state.hooks && state.hooks.toast(t, bad ? "bad" : ""); }
  // HERESY 2181 (the cache stage's «For Viktor»): /lab/catalog was asked twice at every load, here and by the instruments' sheet, at the same moment:
  // one ask shared while it is on its way, never kept after it answers (a load after a move must read the lab anew); its failure is each caller's own
  // (the integration's suite: an ask that never answers, a stalled link, held every load after it for good: the Librarian stopped reading the lab
  // until the page was reloaded; a shared ask older than 3 s, longer than the page load that shares it (about 1.2 s), is no longer waited on, and the next load asks anew)
  // HERESY 2219 (the integration's suite: «not held: a lock on another workspace» read the lock of the ask before): an ask on its way when the lab changed
  // (a take landed, ruach-catalog, or a write of the page's own) answers what was there before the change; a load after it asks anew, never shares the older one
  var catalogAsked = null, catalogAt = 0, catalogGen = 0, catalogAskedGen = -1;
  function catalog() {
    var now = Date.now();
    if (!catalogAsked || now - catalogAt > 3000 || catalogAskedGen !== catalogGen) {
      var asked = catalogAsked = api("/catalog"), done = function () { if (catalogAsked === asked) catalogAsked = null; };
      catalogAt = now; catalogAskedGen = catalogGen;
      asked.then(done, done);
    }
    return catalogAsked;
  }
  window.ruachCatalog = catalog;
  function api(path, body, keep) {   // keep (HERESY 2158): sent with keepalive, so a page going hidden or away still sends it
    var opt = body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
    if (keep && body !== undefined) opt.keepalive = true;
    if (body !== undefined) catalogGen++;          // HERESY 2219: a write: the catalog ask on its way is from before it
    return fetch("/lab" + path, opt).then(function (r) { return r.json().then(function (b) { if (!r.ok && r.status !== 202) { var e = new Error(b.error || r.status); e.status = r.status; e.lease = !!(b && b.lease); throw e; } return b; }); })   // HERESY 2158: e.lease, the lease's refusal
      .then(function (b) {
        // HERESY 1168 (Viktor 06.10.2026: «Когда трек "Move to Trash"… и если проигрывается в данный момент, сразу снимай его
        // с проигрыша»): whichever way takes go to the trash (a card's menu, the checked ones, a workspace deleted), the page
        // hears which went
        if (path === "/trash" && body && body.op === "move" && b && b.moved && b.moved.length && state.hooks && state.hooks.trashed) state.hooks.trashed(b.moved);
        return b;
      });
  }

  // HERESY 2028 (Viktor 02.11.2026: «В поиск у Библиотекаря добавь простой regex для рваного матча типа "милости * 0.6", "милост * !0.75"»): the words
  // found anywhere, in any order; with «*» (any run) or «?» (one character) a pattern found anywhere, its words in their order («милости * 0.6»);
  // «!word» leaves out a take that has it in any of its fields («милост * !0.75»). Case and accents ignored. m(fields): a string or a list of them
  function fold(s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }
  // HERESY 2048 (Viktor: «Поиск по авто-раскладке EN-RU-EN… многие русскоязычные будут благодарны»): the same keys in the other layout
  var LAYOUT_EN = "qwertyuiop[]asdfghjkl;'zxcvbnm,.`";
  var LAYOUTS = ["йцукенгшщзхъфывапролджэячсмитьбюё", "йцукенгшщзхїфівапролджєячсмитьбю'", "йцукенгшўзх'фывапролджэячсмітьбюё"];   // ru, uk, be
  function relaid(q) {
    var out = [], low = String(q || "").toLowerCase();
    if (!/[a-z\u0400-\u04ff]/.test(low) || /!/.test(low)) return out;
    LAYOUTS.forEach(function (L) {
      var to = "", back = "";
      for (var i = 0; i < low.length; i++) {
        var c = low.charAt(i), a = LAYOUT_EN.indexOf(c), b = L.indexOf(c);
        to += a >= 0 ? L.charAt(a) : c;
        back += b >= 0 ? LAYOUT_EN.charAt(b) : c;
      }
      [to, back].forEach(function (x) { if (x !== low && out.indexOf(x) < 0) out.push(x); });
    });
    return out;
  }
  function matcher(q) {
    var own = matcher1(q), alts = relaid(q).map(matcher1);
    if (!alts.length) return own;
    return function (fields) { return own(fields) || alts.some(function (m) { return m(fields); }); };
  }
  function matcher1(q) {
    var esc = function (w) { return w.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, "."); };
    var test = function (w) { if (/[*?]/.test(w)) { var re = new RegExp(esc(w)); return function (s) { return re.test(s); }; } return function (s) { return s.indexOf(w) >= 0; }; };
    // HERESY 2095 (Viktor 05.11.2026: «При "seed 1" запросе выводит оба сида первый и второй, а должно же фильтровать»): a word of digits is a
    // whole number, never a piece of a longer one (a «1» sits in nearly every title: 01, the dates), and typed after a word it goes with that
    // word: «seed 1» is seed, at most three signs, then 1 («seed 1», «seed: 1», «seed1»), never seed 12 or seed 2 beside a card 01
    // HERESY 2130 (the audit of 06.11.2026: «Поиск после HERESY 2095 зависит от порядка слов»): the number goes with the word before it only in a take where
    // that word is followed by a number («seed 1»: seed 1, never seed 2 or seed 12); where the word stands without one («love song 2026», «фолк-фьюжн · №8»)
    // the number is found anywhere, whole, as the words are: in any order. Each test is asked of a take's fields together
    var any = function (t) { return function (all) { return all.some(t); }; };
    var number = function (n, before) {
      var whole = new RegExp("(^|[^\\p{N}])" + n + "(?![\\p{N}])", "u");
      if (!before || /^\d+$/.test(before)) return any(function (s) { return whole.test(s); });
      var w = before.replace(/[.+^${}()|[\]\\*?]/g, "\\$&");
      var glued = new RegExp(w + "[^\\p{L}\\p{N}]{0,3}" + n + "(?![\\p{N}])", "u"), numbered = new RegExp(w + "[^\\p{L}\\p{N}]{0,3}\\p{N}", "u");
      return function (all) {
        if (all.some(function (s) { return glued.test(s); })) return true;
        return !all.some(function (s) { return numbered.test(s); }) && all.some(function (s) { return whole.test(s); });
      };
    };
    var words = fold(q).trim().split(/\s+/).filter(Boolean), yes = [], not = [];
    words.forEach(function (w) { if (w.charAt(0) === "!") { if (w.length > 1) not.push(test(w.slice(1))); } else yes.push(w); });
    var good = yes.some(function (w) { return /[*?]/.test(w); })
      ? [any(test(yes.join(" ").replace(/\s*\*\s*/g, "*")))]          // the pattern whole: its words in their order, a « * » any run between them
      : yes.map(function (w, i) { return /^\d+$/.test(w) ? number(w, yes[i - 1]) : any(test(w)); });   // HERESY 2095
    if (!good.length && !not.length) return function () { return true; };
    return function (fields) {
      var all = (Array.isArray(fields) ? fields : [fields]).map(fold);
      return good.every(function (t) { return t(all); }) && !not.some(function (t) { return all.some(t); });
    };
  }

  // HERESY 2058 (Viktor 04.11.2026: «Как мне узнать, где проба 1e53bb? Прикрути поиск в библиотекаре по ID проб и будет нам счастье»): a search that
  // looks like a take's ID (its folder's name or a part of it: «20261104-180155», the time «180155», a blind take's tail «1e53bb») looks through every
  // take wherever it lives (every workspace and none, hidden, archived, frozen), whatever place is open and whatever is ticked; each card found says
  // where it lives, and a click there opens that place with the take in sight
  function idQuery(q) {
    var s = String(q || "").trim().toLowerCase();
    if (!s || !/^[a-z0-9-]+$/.test(s)) return "";
    return /\d{6}/.test(s) || /(^|-)(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{6}(-|$)/.test(s) ? s : "";
  }
  function foundAt(r) {
    var at = r.workspaces.map(function (w) { return [w, (archivedWs(w) ? "🗄 " : frozenWs(w) ? "❄ " : "") + w, true]; });
    if (!r.workspaces.length) at.push(["__none", "Not in a workspace", false]);
    if (r.hidden && !r.frozen && !r.archived) at.push(["__hidden", "Hidden", false]);
    return '<div class="coll-found"><span class="coll-found-cap">Where it lives:</span>' + at.map(function (a) {
      return '<button type="button" class="coll-found-at" data-found-at="' + esc(a[0]) + '" data-found-name="' + esc(r.name) + '" data-tip="Open it there">' +
        (a[2] ? '<span translate="no">' + esc(a[1]) + "</span>" : esc(a[1])) + "</button>";
    }).join("") + "</div>";
  }
  function openFound(name, place) {
    state.q = ""; $("collSearch").value = ""; state.kinds = {}; state.derived = {};
    openPlace(place);
    var eye = $("collReveal");
    if (!shown().some(function (x) { return x.name === name; }) && !state.reveal && eye) eye.click();   // hidden or disliked: the eye brings it, dimmed
    else paint();
    bringIn(name);
    var card = document.querySelector('#collGrid .coll-card[data-name="' + (window.CSS && CSS.escape ? CSS.escape(name) : name) + '"]');
    if (!card) return;
    card.scrollIntoView({ block: "center", behavior: "smooth" });
    card.classList.add("is-flash");
    setTimeout(function () { card.classList.remove("is-flash"); }, 1800);
  }

  // HERESY 1167 (Viktor: «thumbdown не убирает трек из списка»): a catalog asked for before a rating was given and answered
  // after it is only older, not truer: the ratings given since stay as given (the lab has them)
  var rated = {}, rateSeq = 0;
  // HERESY 1802 (Viktor 27.10.2026: «после того как я поставил лайк… по клику на звёздочку нужно ждать иногда до 10 секунд, пока станет активной»): a
  // like's answer is the whole list as the lab read it when the like was asked; a star (a 🔥, a 💎) set while it travelled was not in it, and the
  // list put it out again until the next reload. What is set here is held as the ratings are, by its turn: a list older than it keeps it
  var held = {};
  // HERESY 2128 (the audit of 06.11.2026: «Заметка в листе откатывается от клика 👍/⭐, и следующая клавиша пишет старый текст поверх»): a note typed and
  // not yet the lab's (waiting its 900 ms, or on its way) is newer than any list, whenever that list was asked: {name: {text, timer, flight}}
  var notePend = {}, noteSent = {};
  function remember(name, value) { rated[name] = { v: value, seq: ++rateSeq }; }
  function hold(name, field, v) { (held[name] = held[name] || {})[field] = { v: v, seq: ++rateSeq }; }
  function fresh(rows, asked) {
    (rows || []).forEach(function (r) {
      var x = rated[r.name]; if (x && x.seq > asked) r.rating = x.v;
      var h = held[r.name]; if (h) Object.keys(h).forEach(function (f) { if (h[f].seq > asked) r[f] = h[f].v; });
      var p = notePend[r.name]; if (p) r.note = p.text;   // HERESY 2128
    });
    return rows;
  }
  var actsDone = 0;                                // HERESY 2130: the lab's answers to act(), counted: a list asked before one of them is older than it
  // HERESY 2154: the gone places this device has been told of (a ruach.* key: heresy-settings.js mirrors only yue2.*, so it never reaches another device)
  var GONE_KEY = "ruach.placeGone";
  function goneSaid() { try { var v = JSON.parse(recall(GONE_KEY) || "[]"); return Array.isArray(v) ? v.filter(function (w) { return typeof w === "string"; }) : []; } catch (e) { return []; } }
  function goneMark(list) { store(GONE_KEY, JSON.stringify(list.slice(-50))); }
  function load() {
    var asked = rateSeq, acts = actsDone;
    // HERESY 1846: with the catalog, the takes timed already and whether each is sung to its end (a lab without it: none marked)
    // HERESY 2130 (the audit of 06.11.2026): a read that fails otherwise keeps the marks read before and says so once: «every take heard to its end» was
    // what a lab in trouble said, the END NOT SUNG chips gone exactly when they matter
    var marks = function (path) { return api(path).catch(function (e) { return e && e.status === 404 ? { marks: {} } : { failed: e }; }); };
    // HERESY 2166 (Viktor 06.11.2026: «Абсолютно все мелочи закрываем»; creator-NOTES open 5): a Studio whose lab has no Librarian (404) was asked all three
    // again at every finished run (landed); once it has said 404, the catalog is asked alone first and the marks only when it answers (2181: the one shared ask)
    var asking = state.loadStatus === 404
      ? catalog().then(function (d) { return Promise.all([d, marks("/sung/marks"), marks("/tail/marks")]); })
      : Promise.all([catalog(), marks("/sung/marks"), marks("/tail/marks")]);
    return asking.then(function (both) {   // HERESY 2056: and what the tail guard heard
      var d = both[0], bad = [both[1], both[2]].filter(function (x) { return x && x.failed; });
      state.sung = both[1] && both[1].failed ? state.sung || {} : (both[1] && both[1].marks) || {};
      state.tail = both[2] && both[2].failed ? state.tail || {} : (both[2] && both[2].marks) || {};
      if (bad.length && !state.marksBad) toast("The sung marks could not be read: " + ((bad[0].failed && bad[0].failed.message) || bad[0].failed) + ". The cards keep the ones read before", true);
      state.marksBad = bad.length > 0;
      if (window.ruachPaintUnsung) window.ruachPaintUnsung();   // HERESY 1854
      state.rows = fresh(d.takes || [], asked); state.ws = d.workspaces || []; state.wsRealm = d.ws_realm || {}; /* HERESY 2294 */ state.trashDays = d.trash_days || 0; state.loaded = true; state.locks = d.locks || {}; state.pins = d.pins || {};
      state.loadStatus = 200;                      // HERESY 1434
      state.loadError = "";                        // HERESY 2169
      state.frozen = d.frozen || [];               // HERESY 1166
      state.archived = d.archived || [];           // HERESY 2049
      state.albums = d.albums || [];               // HERESY 2050
      state.blind = d.blind || [];                 // HERESY 1874
      state.playlist = d.playlist || [];   // HERESY 1731; 2019 (D1): its crossfade gone, as from the player in 1990
      state.wsNotes = d.ws_notes || {};            // HERESY 1802
      state.clips = d.clips || {};                 // HERESY 2327: each take's finished clips, a card beside its song
      // HERESY 2130 (the audit of 06.11.2026: «Библиотекарь открывает пространство, которого нет»): the place kept from before (yue2.workspace, which other
      // windows and devices share) gone, renamed or deleted elsewhere: All Workspaces opens and says why, instead of «Nothing here» under the old name
      // HERESY 2154 (the audit's review of 2130): yue2.workspace keeps the gone name, and it is the key every window and device shares, so no window clears
      // it (another device's choice is its own); the toast came again at every F5. Said once a gone name on this device (its own mark, never mirrored),
      // with what to do; a name that is here again loses its mark, so it is said again should it go again
      var saidGone = goneSaid(), stillGone = saidGone.filter(function (w) { return state.ws.indexOf(w) < 0; });
      if (stillGone.length !== saidGone.length) goneMark(stillGone);
      if (acts === actsDone && state.place && state.place.charAt(0) !== "_" && state.ws.indexOf(state.place) < 0) {
        var lost = state.place;
        state.place = ""; state.sel = {};
        if (stillGone.indexOf(lost) < 0) {
          goneMark(stillGone.concat([lost]));
          toast(tr("\u201c{0}\u201d is not here any more (renamed or deleted, maybe in another window): All Workspaces is open. Choose a workspace in the bar to put one in hand; said once on this device").replace("{0}", lost));
        }
      }
      firstWs();                                   // HERESY 1434
      var names = {};
      state.rows.forEach(function (r) { names[r.name] = 1; });
      Object.keys(state.sel).forEach(function (n) { if (!names[n]) delete state.sel[n]; });
      paint();
      paintCurrent();
      if (state.hooks.libraryChanged) state.hooks.libraryChanged();
    }).catch(function (e) {
      state.loadStatus = (e && e.status) || 0;     // HERESY 1434: 404, no Librarian in this Studio; else one that does not answer
      state.loadError = String((e && e.message) || e || "?");   // HERESY 2169: kept for F5's toast, which said «read again» over it
      $("collGrid").innerHTML = '<p class="row-hint">The Librarian lives in Forge\'s lab, which does not answer: ' + esc(e.message) + "</p>";
    });
  }

  // HERESY 1161 (Viktor: «В воркспейсы можно один уровень подразделов? Максимум два»): a section is a workspace named by its
  // path, "Parent / Section"; a place shows its own takes and its sections' (the lab keeps the names; the page the tree)
  var SEP = " / ", DEPTH = 3;
  function wsParts(w) { return String(w).split(SEP); }
  function wsLeaf(w) { var p = wsParts(w); return p[p.length - 1]; }
  var SOURCED = "Sourced for Regeneration";      // HERESY 1162: a section of the replaced, not shown in its parent
  var STUDIO_SECTIONS = { "Sourced for Regeneration": 1, "Refined": 1 };   // HERESY 1165: the sections the Studio names (they translate)
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
  function closedWs(w) { return DIAMOND.test(wsParts(w)[0] || "") || frozenWs(w) || archivedWs(w); }   // HERESY 2049: nor an archived one
  function archivedWs(w) { return (state.archived || []).some(function (a) { return w === a || String(w).indexOf(a + SEP) === 0; }); }   // HERESY 2049
  function archRoot(w) { return (state.archived || []).filter(function (a) { return w === a || String(w).indexOf(a + SEP) === 0; })[0] || w; }
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
  function iceHere(r) { return iceAt(r, state.place); }   // HERESY 1166; 2049: an archived take only in its archived workspace, or in Archived
  // HERESY 2058b (the re-audit of 04.11.2026: Hidden's ⋯ brought back archived takes its list does not show): the list's test for any place, so Show the
  // hidden again acts on what that place's list shows
  function iceAt(r, place) {
    var own = !!place && place.charAt(0) !== "_";
    if (place === "__archived") return !!r.archived;
    return (!r.frozen || (own && frozenWs(place))) && (!r.archived || (own && archivedWs(place)));
  }
  // HERESY 1169 · 1241 (Viktor 08.10.2026: «трансформируй полосу фильтров показа карточек… Идея фильтра SUNO, с чекбоксами, логикой AND, OR, NOR»): what can be ticked, and how a take answers each
  // HERESY 1873: a take's reactions, by their emotional zones (the lab's own order): [key, face, word, zone]; 2027 (Viktor: «Добавь ещё в ленту emoji 🔥 и 💥»): two more
  var REACTS = [["love", "❤️‍🔥", "Burning love", "Love"], ["adore", "🥰", "Tenderness", "Love"], ["hundred", "💯", "Spot on", "A hit"], ["party", "🎉", "A win", "A hit"], ["hot", "🔥", "Hot", "A hit"], ["lol", "🤣", "Hilarious", "Laughter"], ["mindblown", "🤯", "Mind blown", "Wonder"], ["wow", "😮", "Wow", "Wonder"], ["boom", "💥", "Explosive", "Wonder"], ["tears", "😭", "To tears", "Tears"], ["think", "🤔", "Makes me think", "Thought"], ["look", "👀", "Worth a closer look", "Thought"], ["nerd", "🤓", "Clever", "Thought"], ["peek", "🫣", "Awkward to hear", "Awkward"], ["melt", "🫠", "Melting away", "Awkward"], ["poop", "💩", "Crap", "Refusal"]];
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
    var m = matcher(state.q), on = filterOn(), logic = state.logic || "and", idq = idQuery(state.q);
    var rows = state.rows.filter(function (r) {
      if (idq) return m([r.title, r.name, r.note || ""].concat(r.workspaces));   // HERESY 2058: an ID: every take, wherever it lives
      if (!iceHere(r)) return false;               // HERESY 1166
      if ((!state.place || state.place.charAt(0) === "_") && !inRealm(r)) return false;   // HERESY 2294: the realm's own; a workspace shows its links too
      if (state.place === "__fav" && !r.favorite) return false;
      if (state.place === "__pinned" && !pinnedAll()[r.name]) return false;   // HERESY 1105
      if (state.place === "__none" && r.workspaces.length) return false;   // HERESY 1058
      if (state.place === "__hidden") { if (!r.hidden) return false; }
      else if (r.hidden && !state.reveal) return false;   // HERESY 2046: the eye shows them, dimmed
      if (r.rating < 0 && !showDis() && !state.reveal && !(state.kinds.__disliked && logic !== "nor")) return false;   // HERESY 1167; 1241: shown when the filter asks for the disliked
      if (state.place && state.place.charAt(0) !== "_" && !inTree(r, state.place)) return false;   // its sections too (1161)
      if (!passes(r, on, logic)) return false;   // HERESY 1169 · 1241: the ticked filters, joined AND, OR or NOR
      // HERESY 1167: a take's workspaces and sections are searched too (a section's name finds its takes)
      return m([r.title, r.name, r.note || ""].concat(r.workspaces));   // HERESY 2028: all its fields at once, so «!word» leaves a take out whichever has it
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
    // HERESY 2163: the per-workspace tallies of 2046 (perWs, perHid) went with 2089, which counts every place in tallyN below; they were written and never read
    var counts = { "": 0, __fav: 0, __hidden: 0, __none: 0 };
    var hidSys = { "": 0, __none: 0 };               // HERESY 2058: the hidden of All Workspaces and of Not in a workspace, for their ⋯
    // HERESY 2058b (Viktor 03.11.2026: «На счётчике … если есть скрытые … дробное отображение типа `189/208`»; the re-audit of 04.11.2026: ⓘ counts a disliked
    // take the Engine keeps out as hidden, the tree did not): the tree counts the same way, out of a place's shown number and into its hidden part
    var disOut = function (r) { return !r.hidden && r.rating < 0 && !showDis(); };
    state.rows.forEach(function (r) {
      if (!inRealm(r)) return;                       // HERESY 2294: the system places count the realm's own takes
      // HERESY 2074 (Viktor 05.11.2026: «Давай, быстрецом гоним всё до и для среза 2.0.6»): Hidden's own number counts what its list shows (no archived or frozen take,
      // no disliked one the list leaves out), as its ⋯ does: the row, the list and the menu agree (the rule of 03.11.2026, «…дробное отображение типа `189/208`»)
      if (r.hidden) { if (iceAt(r, "__hidden") && !disOutOfList(r)) counts.__hidden++; if (!r.frozen && !r.archived) hidSys[""]++; if (!r.workspaces.length) hidSys.__none++; return; }
      if (disOut(r)) return;                         // HERESY 2058b: disliked, out of the lists: hidden in its workspaces, shown nowhere
      if (!r.frozen && !r.archived) { counts[""]++; if (r.favorite) counts.__fav++; }   // HERESY 1166: a frozen take only in its own; 2049: an archived one too
      if (!r.workspaces.length) counts.__none++;
    });
    // HERESY 2089 (Viktor 05.11.2026: «…Чтобы не раздувать по ширине колонку и не обрезать имена пространств, предлагая при наведении мышки на число треков
    // поднимать тултип с подсчётами, а ту косую так и оставить»): every place counted in one pass as ⓘ counts it since 2078b (the list's own test, iceAt):
    // shown, hidden by hand, disliked kept out while the Engine hides them, and apart what only a frozen workspace or the archive shows. A place holding
    // hidden takes shows «/» and the whole (ⓘ's number), so the names keep the column's width (the fraction ran under the ⋯); the counts in the number's tip,
    // English in the page for the catalogs, a line each
    var tallyN = {};
    state.rows.forEach(function (r) {
      var once = {}, at = function (a) {
        if (once[a]) return;
        once[a] = 1;
        var c = tallyN[a] || (tallyN[a] = { shown: 0, hand: 0, dis: 0, ice: 0, arch: 0 });
        if (!iceAt(r, a)) { if (r.archived) c.arch++; else c.ice++; } else if (r.hidden) c.hand++; else if (disOut(r)) c.dis++; else c.shown++;
      };
      if (r.archived && inRealm(r)) at("__archived");   // HERESY 2294
      r.workspaces.forEach(function (w) {
        var parts = wsParts(w), from = wsLeaf(w) === SOURCED ? parts.length : 1;
        for (var i = from; i <= parts.length; i++) at(parts.slice(0, i).join(SEP));
      });
    });
    var nText = function (key) { var c = tallyN[key] || { shown: 0, hand: 0, dis: 0 }; return (c.hand + c.dis ? "/" : "") + (c.shown + c.hand + c.dis); };
    var nSpan = function (key) {
      var c = tallyN[key], tip = [];
      if (c && (c.hand || c.dis || c.ice || c.arch)) {
        tip.push("Shown: " + c.shown);
        if (c.hand) tip.push("Hidden by hand: " + c.hand);
        if (c.dis) tip.push("Hidden as disliked: " + c.dis);
        if (c.ice) tip.push("In a frozen workspace: " + c.ice);
        if (c.arch) tip.push("In the archive: " + c.arch);
      }
      return '<span class="coll-n"' + (tip.length ? ' data-tip="' + esc(tip.join("\n")) + '"' : "") + ">";
    };
    // HERESY 1165: a workspace's name is the user's, kept as typed in every language; the Studio's own places translate
    var UIc = function (nm) { return window.HeresyIcons && window.HeresyIcons.ui ? '<span class="coll-ico" aria-hidden="true">' + window.HeresyIcons.ui(nm) + "</span>" : ""; };   // HERESY 1998
    var item = function (key, label, n, own, ico) {
      return '<button type="button" class="coll-place' + (state.place === key ? " is-on" : "") + (ico ? " has-ico" : "") + '" data-place="' + esc(key) + '">' + (ico ? UIc(ico) : "") + "<span" + (own ? ' translate="no"' : "") + ">" + esc(label) +
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
    // HERESY 2049: Archived, and under it each archived workspace whole (its ⋯: back, or to the trash)
    // (HERESY 2163: 2058's archN, archHid and frac went too: Archived and its workspaces count by tallyN since 2089)
    var arch = treeOrder(state.ws.filter(function (w) { return archivedWs(w) && realmWs(w); }));   // HERESY 2294: the realm's
    var archivedHtml = arch.length ? item("__archived", "Archived", nText("__archived"), false, "archive").replace('<span class="coll-n">', nSpan("__archived")) + arch.map(function (w) {
      var dp = wsParts(w).length;
      return item(w, dp > 1 ? wsLeaf(w) : w, nText(w), true).replace('class="coll-place', 'class="coll-place is-sub d' + (dp + 1) + " is-archived")
        .replace('<span class="coll-n">', '<span class="coll-ws-more" data-ws-menu="' + esc(w) + '" title="Bring it back, or send it to the trash" role="button">\u22ef</span><span class="coll-n">').replace('<span class="coll-n">', nSpan(w));
    }).join("") : "";
    // HERESY 2078b (Viktor 05.11.2026, to the proposal «277 · ещё 1 в замороженном»: «Да, делай как предложил»): Pinned counts by its list's own test (iceAt), as ⓘ
    // does: an archived pinned take, which Pinned's list never shows, is out too
    var pinAll = pinnedAll(), pinN = state.rows.filter(function (r) { return pinAll[r.name] && !r.hidden && iceAt(r, "__pinned") && !disOut(r); }).length;   /* HERESY 2058b */
    // HERESY 1731: the playlist at the very top, never renamed or deleted (a place of the Studio's own, as Favourites)
    // HERESY 2058 (Viktor 03.11.2026: «Нужна команда "Отобразить все скрытые"»): All Workspaces, Not in a workspace and Hidden have a ⋯ while they hold hidden takes
    var sysMore = function (key, n) { return (n ? '<span class="coll-ws-more" data-sys-menu="' + key + '" title="Show the hidden again" role="button">\u22ef</span>' : "") + '<span class="coll-n">'; };
    // HERESY 2058 (Viktor: «Корень Плейлиста видит все треки, даже те что в альбомах»): Playlist counts the root's whole list, whatever album or tag is open
    $("collSide").innerHTML = item("__playlist", "Playlist", plRootCount(), false, "playlist") +   // HERESY 1998: the Studio's own outlines
      item("", "All Workspaces", counts[""], false, "horn").replace('<span class="coll-n">', sysMore("", hidSys[""])) + item("__fav", "Favourites", counts.__fav, false, "star") +
      item("__pinned", "Pinned", pinN, false, "pin") +
      item("__none", "Not in a workspace", counts.__none, false, "folder-minus").replace('<span class="coll-n">', sysMore("__none", hidSys.__none)) +
      '<div class="coll-cap">Workspaces</div>' + treeOrder(state.ws.filter(function (w) { return !archivedWs(w) && realmWs(w); })).map(function (w) {   // HERESY 2049: the archived under Archived
        var ice = (frozenWs(w) ? '<span class="coll-ice" title="Frozen: its takes are heard, never changed">\u2744</span>' : "") +   // HERESY 1166
          ((state.blind || []).indexOf(w) >= 0 ? '<span class="coll-blind" data-tip="Blind: what made its takes is hidden">' + ico("blind") + "</span>" : "");   // HERESY 1874
        var lk = (state.locks || {})[w] || {}, lock = ice + (lk.workspace || lk.tracks ?   // HERESY 1070
          '<span class="coll-lock" title="' + (lk.workspace ? "the workspace is locked against deletion" : "") + (lk.workspace && lk.tracks ? "; " : "") + (lk.tracks ? "its takes are locked against deletion" : "") + '">\ud83d\udd12</span>' : "");
        var depth = wsParts(w).length;               // a section: its own name, indented under its parent (1161)
        return item(w, depth > 1 ? wsLeaf(w) : w, nText(w), depth < 2 || !STUDIO_SECTIONS[wsLeaf(w)]).replace('class="coll-place', 'class="coll-place' + (depth > 1 ? " is-sub d" + depth : "") + (frozenWs(w) ? " is-frozen" : "") +
            (secAway(w) ? " is-sec-away" : "") + (secShut.indexOf(w) >= 0 && String(state.place || "").indexOf(w + SEP) === 0 ? " has-on-inside" : ""))
          .replace('<button type="button" ', '<button type="button" ' + wsTip(w))   // HERESY 1802: its note under the pointer
          .replace('<span class="coll-n">', lock + secHandle(w) + '<span class="coll-ws-more" data-ws-menu="' + esc(w) + '" title="Rename, delete, lock, a section…" role="button">\u22ef</span><span class="coll-n">').replace('<span class="coll-n">', nSpan(w));
      }).join("") +
      '<button type="button" class="coll-place coll-new" data-ws-new="1">+ New workspace</button>' +
      '<button type="button" class="coll-place coll-new coll-hub" data-ws-hub="1">\ud83d\udc8e From Hugging Face\u2026</button>' +   // HERESY 1166
      '<div class="coll-cap">Out of sight</div>' + archivedHtml + item("__hidden", "Hidden", counts.__hidden, false, "eye-off").replace('<span class="coll-n">', sysMore("__hidden", counts.__hidden)) +
      (state.trashErr ? item("__trash", "Trash", "?", false, "trash").replace('<button type="button" ', '<button type="button" data-tip="' + esc("The trash could not be read: " + state.trashErr) + '" ')   // HERESY 2130
        : item("__trash", "Trash", state.trash.length || undefined, false, "trash")) +
      (state.artBinErr ? item("__trash_art", "Trash (Art)", "?", false, "trash").replace('<button type="button" ', '<button type="button" data-tip="' + esc("The art's trash could not be read: " + state.artBinErr) + '" ')   // HERESY 2339: «?» and why, as the Trash (2130)
        : item("__trash_art", "Trash (Art)", artCount() || undefined, false, "trash"));   // HERESY 1337; 1998: their outlines
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
  // kept as typed, the Studio's own sections («Refined» → «Огранённые») in the page's language
  function wsBadge(w) {
    return '<span class="coll-badge w">' + wsParts(w).map(function (p, i) {
      return "<span" + (i && STUDIO_SECTIONS[p] ? "" : ' translate="no"') + ">" + esc(p) + "</span>";
    }).join(esc(SEP)) + "</span>";
  }
  function sungMark(name, done) {                     // HERESY 1854: what a timing found, on the cards and in the player at once
    state.sung = state.sung || {}; state.sung[name] = done;
    if (window.ruachPaintUnsung) window.ruachPaintUnsung();
  }
  function tailMark(name, heard) {                    // HERESY 2056: what the tail guard heard, on the cards and in the player at once
    state.tail = state.tail || {};
    if (heard) state.tail[name] = heard; else delete state.tail[name];
    if (window.ruachPaintUnsung) window.ruachPaintUnsung();
    if (state.loaded) paint();
  }
  function tailBadge(name) {                         // HERESY 2056: its sound comes back after a silence near its end
    var t = (state.tail || {})[name];
    if (!t || !t.gap) return "";
    var clk = function (x) { var m = Math.floor(x / 60), s = x - m * 60; return m + ":" + (s < 10 ? "0" : "") + s.toFixed(1); };
    return '<span class="coll-badge tail" data-tip="' + esc(tr("The sound comes back at {0} after {1} s of silence; End at… offers to end it there").replace("{0}", clk(t.gap[1]))
      .replace("{1}", (t.gap[1] - t.gap[0]).toFixed(1))) + '">' + esc(tr("tail after the end")) + "</span>";
  }
  function unsungBadge(name) {                       // HERESY 1846: its timing heard its lyrics stop before their end
    return (state.sung || {})[name] === false ? '<span class="coll-badge unsung" data-tip="' + esc(tr("The end not sung: its last lines were not heard; Sung to the end? in its datasheet says which")) + '">' + esc(tr("end not sung")) + "</span>" : "";
  }
  // HERESY 1988: a take with a family (made from another, made again from one, a version made in the Refiner, a take made from it) shows the tree's button
  var KIDS = null, KIDS_OF = null;
  function family(r) {
    if (KIDS_OF !== state.rows) {
      KIDS = {};
      state.rows.forEach(function (x) { if (x.parent) KIDS[x.parent] = 1; if (x.regen_of) KIDS[x.regen_of] = 1; });
      KIDS_OF = state.rows;
    }
    return !!(r.parent || r.regen_of || (r.derived && r.derived.length) || KIDS[r.name]);
  }
  var TREE_ICO = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M5 2.5v11M5 8c3.5 0 6-1.6 6-5M5 11c3 0 6 .8 6 3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
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
      r.workspaces.map(function (w) { return wsBadge(w); }).join("") + unsungBadge(name) + tailBadge(name) + "</span>" +
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
      : emptyHtml();                                 // HERESY 2046
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
      return '<article class="coll-card' + (sel ? " is-sel" : "") + (r.hidden ? " is-hidden-take" : "") + (!r.hidden && state.reveal && r.rating < 0 && !showDis() ? " is-dis-hidden" : "") /* HERESY 2058 */ + (r.frozen ? " is-frozen" : "") + (r.fresh ? " is-fresh" : "") + (window.HeresyRegen && window.HeresyRegen.has(r.name) ? " is-regenerating" : "") + (mine ? " is-current" : "") + (mine && now.playing ? " is-sounding" : "") + (art ? " has-art" : "") + '" data-name="' + esc(r.name) + '"' + sandAt(r.name) + ' draggable="true">' + reactMark(r.name) +   // HERESY 1877
        '<label class="coll-check"><input type="checkbox" data-sel="' + esc(r.name) + '"' + (sel ? " checked" : "") + ' aria-label="Select" /></label>' +
        '<button type="button" class="coll-play' + (mine && now.playing ? " is-playing" : "") + '" data-play="' + esc(r.name) + '" aria-label="' + (mine && now.playing ? "Pause" : "Play") + '">' + ico(mine && now.playing ? "pause" : "play") + "</button>" +
        '<div class="coll-body"><div class="coll-title"><span class="coll-title-text" data-open="' + esc(r.name) + '">' + esc(r.title) + "</span>" +
        '<button type="button" class="coll-ren" data-ren="' + esc(r.name) + '" title="Rename" aria-label="Rename">✎</button></div>' +
        // HERESY 1165: each piece its own text, so the words among the numbers translate (heresy-i18n.js matches whole texts)
        '<div class="coll-meta">' + (state.hooks.when ? state.hooks.when(r.created, r.name) : "<span>" + esc(r.created ? ago(r.created) : "") + "</span>") + (r.seconds ? " · <span>" + clock(r.seconds) + "</span>" : "") /* HERESY 1720 */ + (r.cot ? " · <span>" + esc(cotWord(r.cot)) + "</span>" : "") + "</div>" +
        '<div class="coll-badges">' + badge(KINDS[r.kind] || r.kind, "k-" + r.kind) + realmBadge(r) /* HERESY 2294 */ + (r.no_train ? badge("never for training", "k-notrain") : "") /* HERESY 2333: the Reader's takes, never for training */ + r.derived.map(dbadge).join("") +
        r.workspaces.map(function (w) { return wsBadge(w); }).join("") +
        // HERESY 1162: what it was made again from, on its card
        (r.regen_of ? '<span class="coll-badge rg" data-tip="Regenerated with a new seed from ' + esc(r.regen_of) + '">regen</span>' : "") + unsungBadge(r.name) + tailBadge(r.name) + "</div>" +
        (idQuery(state.q) ? foundAt(r) : "") +            // HERESY 2058: where a take found by its ID lives, each place a button
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
        (family(r) ? '<button type="button" class="coll-act coll-tree" data-ctree="1" aria-label="Family tree" data-tip="Its family tree: where it came from and what came of it">' + TREE_ICO + "</button>" : "") +   // HERESY 1988
        noteBtn(r, 'data-cnote="' + esc(r.name) + '"') +
        // HERESY 1900 («уведи вправо троеточие… иконку заметки поставь перед троеточием с небольшим отступом»): ⋯ last, at the strip's right end
        '<button type="button" class="coll-act coll-more-btn" data-cmenu="1" title="More (or right-click the card)" aria-label="More">\u22ef</button>' + "</div></article>" +
        clipCards(r);                              // HERESY 2327
    }
  }
  // HERESY 2327 (Viktor 10.11.2026: the clip of «Буратино» had no card in the Library beside its song): a take's finished clips (each shape its own),
  // each a card right after the take's, so it stands in the song's realm and workspace; ▶ plays it over the page, 🎥 opens the take in the Videographer
  function clipCards(r) {
    var cs = (state.clips || {})[r.name];
    if (!cs || !cs.length || inTrash()) return "";
    clipWire();
    var clock = state.hooks.clock;
    return cs.map(function (c) {
      var key = r.name + "|" + c.shape, go = tr("Open in the Videographer");
      return '<article class="coll-card coll-clip" data-clipof="' + esc(r.name) + '">' +
        '<button type="button" class="coll-play" data-cclip="' + esc(key) + '" aria-label="' + esc(tr("Play the clip")) + '">' + ico("play") + "</button>" +
        '<div class="coll-body"><div class="coll-title"><span class="coll-title-text" data-cclip="' + esc(key) + '">\ud83c\udfac ' + esc(c.title || r.title) + "</span></div>" +
        '<div class="coll-meta"><span>' + esc(tr("Video clip")) + '</span> · <span translate="no">' + esc(c.shape) + "</span>" + (c.seconds ? " · <span>" + clock(c.seconds) + "</span>" : "") +
        " · <span>" + Math.max(1, Math.round((c.bytes || 0) / 1048576)) + " MB</span></div>" +
        '<div class="coll-badges">' + realmBadge(r) + "</div></div>" +
        '<div class="coll-acts"><button type="button" class="coll-act" data-cclipgo="' + esc(r.name) + '" data-tip="' + esc(go) + '" aria-label="' + esc(go) + '">\ud83c\udfa5</button></div></article>';
    }).join("");
  }
  function clipWire() {
    if (clipWire.done || !$("collGrid")) return;
    clipWire.done = true;
    $("collGrid").addEventListener("click", function (e) {      // before the grid's own (a clip's card is no take's: no data-name)
      var p = e.target.closest && e.target.closest("[data-cclip]"), g = e.target.closest && e.target.closest("[data-cclipgo]");
      if (!p && !g) return;
      e.preventDefault(); e.stopPropagation();
      if (g) return clipGo(g.dataset.cclipgo);
      clipPlay(p.dataset.cclip);
    }, true);
  }
  function clipGo(name) {
    if (state.hooks.openTake) state.hooks.openTake(name, "create");
    var tab = document.querySelector('.topbar [data-tab="video"]');
    if (tab) tab.click();
  }
  function clipPlay(key) {
    var k = String(key).split("|"), name = k[0], shape = k[1] || "16:9";
    var src = "/lab/video/clip.mp4?name=" + encodeURIComponent(name) + (shape !== "16:9" ? "&shape=" + encodeURIComponent(shape) : "");
    Array.prototype.forEach.call(document.querySelectorAll("audio, video"), function (m) { if (!m.paused) m.pause(); });   // one sound at a time (1860)
    var o = document.createElement("div");
    o.className = "coll-clip-over";
    o.setAttribute("role", "dialog");
    o.style.cssText = "position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,.88);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:16px";
    o.innerHTML = '<video controls autoplay playsinline preload="auto" style="max-width:100%;max-height:calc(100vh - 90px);background:#000;border-radius:6px" src="' + esc(src) + '"></video>' +
      '<div style="display:flex;gap:8px"><button type="button" class="btn ghost small" data-x="go">\ud83c\udfa5 ' + esc(tr("Open in the Videographer")) + "</button>" +
      '<button type="button" class="btn ghost small" data-x="close">' + esc(tr("Close")) + "</button></div>";
    var close = function () { var v = o.querySelector("video"); if (v) { v.pause(); v.removeAttribute("src"); v.load(); } o.remove(); document.removeEventListener("keydown", esc_); };
    var esc_ = function (e) { if (e.key === "Escape") close(); };
    o.addEventListener("click", function (e) {
      var b = e.target.closest("[data-x]");
      if (b && b.dataset.x === "go") { close(); return clipGo(name); }
      if (b || e.target === o) close();
    });
    document.addEventListener("keydown", esc_);
    document.body.appendChild(o);
  }
  // HERESY 2046 (Viktor: «Если по фильтру ничего не найдено… очень мелкая. Увеличить, в две строки, отцентрировать»): what is empty and why
  function emptyHtml() {
    var on = filterOn().length, q = state.q;
    var why = q && on ? tr("No take matches “{0}” with the filters on.").replace("{0}", q) : q ? tr("No take matches “{0}”.").replace("{0}", q)
      : on ? tr("No take passes the filters.") : tr("This place has no takes to show.");
    return '<div class="coll-empty coll-none"><p class="coll-none-1">' + esc(tr("Nothing here")) + '</p><p class="coll-none-2">' + esc(why) + "</p>" +
      (q || on ? '<p class="coll-none-3"><button type="button" class="btn ghost small" data-coll-reset="1">' + esc(tr("Clear the search and the filters")) + "</button></p>" : "") + "</div>";
  }
  // HERESY 2046 (Viktor: «SVG иконкой `i`… оверлеем максимальную статистику по (под)пространству»): the place's numbers, its hidden too
  function statsHtml() {
    // HERESY 2078b (Viktor 05.11.2026, to the proposal «277 · ещё 1 в замороженном»: «Да, делай как предложил»): ⓘ counts the takes of the place its list shows,
    // by the list's own test (iceAt, 2058b): a favourite, a pinned or a hidden take that only a frozen workspace or the archive shows is out of the number and
    // said after it, frozen and archived apart (a take both frozen and archived: the archive's), so ⓘ's old total is the parts' sum; the plans, the time, the
    // marks and the rest count what the list shows
    var ofPlace = function (r) {
      if (state.place === "__fav") return r.favorite;
      if (state.place === "__pinned") return !!pinnedAll()[r.name];
      if (state.place === "__none") return !r.workspaces.length;
      if (state.place === "__hidden") return r.hidden;
      if (state.place === "__archived") return r.archived;   // HERESY 2049
      if (state.place && state.place.charAt(0) !== "_") return inTree(r, state.place);
      return !r.frozen && !r.archived;
    };
    var all = state.rows.filter(function (r) { return ofPlace(r) && iceAt(r, state.place); });
    var away = state.rows.filter(function (r) { return ofPlace(r) && !iceAt(r, state.place); }), awayArch = away.filter(function (r) { return r.archived; }).length;
    var aways = (away.length > awayArch ? " \u00b7 " + esc(tr("{0} more in a frozen workspace").replace("{0}", away.length - awayArch)) : "") +
      (awayArch ? " \u00b7 " + esc(tr("{0} more in the archive").replace("{0}", awayArch)) : "");
    // HERESY 2058 (Viktor 03.11.2026: «максимальную статистику… План (Full/Direct/Instrumental)»): hidden by hand and, while the Engine keeps them out of the
    // lists, disliked: both out of sight
    var n = all.length, hidHand = all.filter(function (r) { return r.hidden; }).length, sec = all.reduce(function (s, r) { return s + (+r.seconds || 0); }, 0);
    var hidDis = all.filter(function (r) { return !r.hidden && r.rating < 0 && !showDis(); }).length, hid = hidHand + hidDis;
    var cnt = function (f) { return all.filter(f).length; }, clock = state.hooks.clock;
    var hms = function (s) { s = Math.round(s); var h = Math.floor(s / 3600); return h ? h + ":" + ("0" + Math.floor(s % 3600 / 60)).slice(-2) + ":" + ("0" + s % 60).slice(-2) : clock(s); };
    // HERESY 2058: one plan a take: imported first (its cot «off» is no Direct), then an instrumental (the lab's flag), then by its cot
    var planOf = function (r) { return r.kind === "imported" ? "imported" : r.instrumental ? "instrumental" : ["full", "off", "melody"].indexOf(r.cot) >= 0 ? r.cot : ""; };
    var plans = [["full", "Full"], ["off", "Direct"], ["melody", "Melody only"], ["instrumental", "Instrumental"], ["imported", "Imported"], ["", "unknown"]]
      .map(function (p) { return [tr(p[1]), cnt(function (r) { return planOf(r) === p[0]; })]; }).filter(function (p) { return p[1]; });
    var kinds = [["generated", "made here"], ["imported", "imported"], ["regenerated", "regenerated"], ["rerendered", "re-rendered"]]
      .map(function (k) { return [tr(k[1]), cnt(function (r) { return r.kind === k[0]; })]; }).filter(function (k) { return k[1]; });
    var marks = [["\ud83d\udc4d", cnt(function (r) { return r.rating > 0; })], ["\ud83d\udc4e", cnt(function (r) { return r.rating < 0; })], ["\u2b50", cnt(function (r) { return r.favorite; })],
      ["\ud83d\udd25", cnt(function (r) { return markOf(r.name, "fire"); })], ["\ud83d\udc8e", cnt(function (r) { return markOf(r.name, "gem"); })],
      ["\ud83d\udee1", cnt(function (r) { return r.protected; })], ["\u270e", cnt(function (r) { return !!(r.note || "").trim(); })]].filter(function (m) { return m[1]; });
    var re = {};
    all.forEach(function (r) { var k = reactOf(r.name); if (k) re[k] = (re[k] || 0) + 1; });
    var reacts = REACTS.filter(function (x) { return re[x[0]]; }).map(function (x) { return [x[1], re[x[0]]]; });
    var days = all.map(function (r) { return r.created || 0; }).filter(Boolean).sort();
    var day = function (t) { var d = new Date(t * 1000), z = function (x) { return (x < 10 ? "0" : "") + x; }; return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate()); };   // HERESY 2130: the day here, as artDay (toISOString said UTC: an evening take in Canada fell on the morrow)
    var row = function (k, v) { return v ? '<div class="cs-k">' + esc(tr(k)) + '</div><div class="cs-v">' + v + "</div>" : ""; };
    var list = function (xs) { return xs.map(function (x) { return '<span class="cs-i">' + esc(x[0]) + ' <b class="mono">' + x[1] + "</b></span>"; }).join(""); };
    return '<div class="cs-head">' + esc(placeName()) + "</div>" + '<div class="cs-grid">' +
      row("Takes", '<b class="mono">' + n + "</b>" + (hid ? " \u00b7 " + esc((hidDis ? tr("{0} shown, {1} hidden ({2} by hand, {3} disliked)") : tr("{0} shown, {1} hidden")).replace("{0}", n - hid).replace("{1}", hid)
        .replace("{2}", hidHand).replace("{3}", hidDis)) : "") + aways) +   // HERESY 2078b: the rest, after the number
      row("Plan", list(plans)) +
      row("Time", n ? esc(tr("{0} in all · {1} on average").replace("{0}", hms(sec)).replace("{1}", clock(sec / n))) : "") +
      row("Marks", list(marks)) + row("Reactions", list(reacts)) + row("Made", list(kinds)) +
      row("Days", days.length ? esc(day(days[0]) + (day(days[0]) !== day(days[days.length - 1]) ? " \u2192 " + day(days[days.length - 1]) : "")) : "") + "</div>";
  }
  function placeName() {
    var own = { "": "All Workspaces", __fav: "Favourites", __pinned: "Pinned", __none: "Not in a workspace", __hidden: "Hidden", __archived: "Archived" };
    return state.place in own ? tr(own[state.place]) : state.place;
  }
  function statsOpen(on) {
    var pop = $("collStatsPop"), b = $("collStats");
    if (!pop) return;
    if (on === undefined) on = pop.hidden;
    if (on) pop.innerHTML = statsHtml();
    pop.hidden = !on;
    b.setAttribute("aria-expanded", String(on));
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
  // HERESY 2023: one line when the whole path fits the heading's room, measured as drawn; watched as the room changes
  function fitHead() {
    var w = $("collWhere"), h2 = w && w.parentNode;
    if (!h2) return;
    var sub = w.querySelector(".coll-sub"), base = w.firstElementChild;
    if (sub) sub.style.marginLeft = "";
    h2.classList.toggle("is-one", !!sub);
    if (sub && h2.clientWidth && h2.scrollWidth > h2.clientWidth + 1) h2.classList.remove("is-one");
    // HERESY 2025 (Viktor: «сдвинь поддиректорию прямо под саму основу»): under the workspace's first letter, as drawn
    if (sub && base && base !== sub && !h2.classList.contains("is-one")) {
      var cs = getComputedStyle(h2), at = base.getBoundingClientRect().left - h2.getBoundingClientRect().left - parseFloat(cs.paddingLeft) - parseFloat(cs.borderLeftWidth);
      sub.style.marginLeft = Math.max(0, Math.round(at)) + "px";
    }
  }
  var headFit = 0;
  if (window.ResizeObserver && $("collWhere") && $("collWhere").parentNode) {
    new ResizeObserver(function () { cancelAnimationFrame(headFit); headFit = requestAnimationFrame(fitHead); }).observe($("collWhere").parentNode.parentNode);
  }
  function paintHead(rows) {
    paintRealm();                                    // HERESY 2294: the switch, shown where the realms are on
    if (idQuery(state.q)) {                          // HERESY 2058: a search by ID is the whole library's, and the heading says so
      $("collWhere").innerHTML = " \u203a <span>Search by ID: the whole library</span>";
      if ($("collWhere").parentNode) $("collWhere").parentNode.removeAttribute("data-tip");
      fitHead();
      $("collNote").innerHTML = "<span>" + esc(tr("Found by ID: {0}, wherever they live").replace("{0}", rows.length)) + "</span> \u00b7 <span>" + esc(state.rows.length + " in the library") + "</span>";
      paintFilterBtn();
      return paintBulk(rows);
    }
    // HERESY 1098 (Viktor, 02.10.2026): the heading says which collection is open, then what it holds
    var placeName = { "": "All Workspaces", __fav: "Favourites", __pinned: "Pinned", __none: "Not in a workspace", __hidden: "Hidden" }[state.place];
    // HERESY 1165: the Studio's places translate; a workspace's name is kept as typed (its studio-made sections translate)
    // HERESY 2004 (Viktor: «Поддиректорию… второй строкой меньшим кеглем прямо под названием её корневого пространства»): the workspace on the
    // heading's line, its sections under it in a smaller type; the whole path the heading's tip
    var wp = placeName ? [] : wsParts(state.place), wsp = function (p, i) { return "<span" + (i && STUDIO_SECTIONS[p] ? "" : ' translate="no"') + ">" + esc(p) + "</span>"; };
    // HERESY 2023 (Viktor 02.11.2026: «Текст пошёл на вторую строку. Ты убрал ячейки здесь»): the path on the heading's line, its parts as before
    // 2004, while it fits; under it only when that line would be cut
    $("collWhere").innerHTML = " \u203a " + (placeName ? "<span>" + esc(placeName) + "</span>" : wsp(wp[0], 0) +
      (wp.length > 1 ? '<span class="coll-sub"><span class="coll-subsep">' + SEP + "</span>" + wp.slice(1).map(function (p, i) { return wsp(p, i + 1); }).join(SEP) + "</span>" : ""));
    var h2 = $("collWhere").parentNode;
    if (h2) { if (wp.length > 1) h2.setAttribute("data-tip", wp.join(SEP)); else h2.removeAttribute("data-tip"); }
    fitHead();
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
    $("collSlot").classList.toggle("is-bulk", n > 0);   // HERESY 2218: the bar of the checked half the slot's height
    $("collSlot").classList.toggle("is-sticky", n > 0 || pinsHere().length > 0);   // HERESY 2046: held under the head while it has pins or the checked
    // HERESY 2058 (Viktor 03.11.2026: «Только если нет пинов и нет селекции — не показываем»): no pin and nothing checked: no strip at all
    $("collSlot").hidden = !n && !pinsHere().length;
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
    // HERESY 1415: two to four; 1621: to six; 2043 (Viktor: «обещали до 12 треков»): to twelve, and over twelve it says why (a disabled button shows no tip)
    var cb = $("collCompare"), over = n > 12;
    cb.disabled = n < 2;
    cb.classList.toggle("is-over", over);
    cb.setAttribute("aria-disabled", String(over));
    cb.dataset.tip = over ? tr("Twelve at most to compare: uncheck {0}").replace("{0}", n - 12) : "Compare the checked ones, two to twelve, in one player from the same second";
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

  // HERESY 2130 (the audit of 06.11.2026: «Корзина не говорит, когда автоочистка удалит каждый дубль»): with a term set (Engine → Defaults, or the trash's own
  // choice), each row says when the hourly empty takes it for good, amber in its last two days
  function trashLeft(it) {
    if (!state.trashDays || !it.trashed) return "";
    var left = +it.trashed + state.trashDays * 86400 - Date.now() / 1000;
    var text = left <= 0 ? "deleted for good within the hour" : left < 2 * 86400 ? "deleted for good in " + Math.max(1, Math.ceil(left / 3600)) + " h"
      : "deleted for good in " + Math.ceil(left / 86400) + " days";
    return ' · <span class="' + (left < 2 * 86400 ? "coll-soon" : "") + '">' + esc(text) + "</span>";
  }
  function paintTrash() {
    var clock = state.hooks.clock;
    $("collTrashDays").value = String(state.trashDays === 28 ? 30 : state.trashDays || 0);   // HERESY 1996: 28 as it was set reads as 30 now
    if ($("defTrashDays")) $("defTrashDays").value = $("collTrashDays").value;
    $("collWhere").innerHTML = " \u203a <span>Trash</span>";   // HERESY 1165: the word its own text
    $("collNote").innerHTML = state.trashErr ? "<span>" + esc("The trash could not be read: " + state.trashErr) + "</span>"   // HERESY 2130: the list below is the one read before
      : "<span>" + state.trash.length + " in the trash</span> · <span>" + (state.trash.reduce(function (s, i) { return s + i.bytes; }, 0) / 1e9).toFixed(2) + " GB</span>";   // HERESY 1166
    $("collGrid").className = "coll-grid list";
    var nsel = Object.keys(state.tsel).length;             // HERESY 1058: the button says what it will do
    $("collEmpty").textContent = nsel ? "Delete " + nsel + " for good" : "Wipe out the trash";
    $("collEmpty").disabled = !state.trash.length;
    $("collRestore").disabled = !nsel;
    $("collGrid").innerHTML = state.trash.length ? state.trash.map(function (it) {
      var key = it.day + "/" + it.name, sel = !!state.tsel[key];
      return '<article class="coll-card' + (sel ? " is-sel" : "") + '"><label class="coll-check"><input type="checkbox" data-tsel="' + esc(key) + '"' + (sel ? " checked" : "") + " /></label>" +
        '<div class="coll-body"><div class="coll-title" translate="no">' + esc(it.title) + '</div><div class="coll-meta"><span>in the trash since ' + esc(it.day) + "</span>" + trashLeft(it) +
        (it.seconds ? " · <span>" + clock(it.seconds) + "</span>" : "") + " · <span>" + (it.bytes / 1e6).toFixed(0) + " MB</span></div></div></article>";
    }).join("") : '<p class="row-hint coll-empty">' + (state.trashErr ? esc("The trash could not be read: " + state.trashErr) : "The trash is empty.") + "</p>";   // HERESY 2130
  }

  function loadTrash() {
    return api("/trash").then(function (d) { state.trash = d.items || []; state.trashErr = ""; state.tsel = {}; paint(); },
      function (e) { state.trashErr = (e && e.message) || String(e); paint(); });   // HERESY 2130: said, never «The trash is empty.»
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
      // HERESY 2130 (the audit of 06.11.2026): out of the place open and its sections (tree), as its view shows them: a section's take moved from its
      // parent's view stayed where it was, and the toast said «out of» the parent
      return act({ op: "ws-move", workspace: w, from: from, tree: !!from, names: list }, n + " moved to “" + w + "”" + (from ? " (out of “" + from + "”)" : " (out of every other workspace)"))
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
  // and its sections in the Studio's own dialog, one click picks; a new workspace, or a section of the one in hand, made from
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
    if (w) store(WS_KEY + "." + wsRealm(w), w);   // HERESY 2294: the realm's own in hand
    if (!quiet && w) toast("Workspace \u201c" + w + "\u201d in hand: the list shows it, new takes land in it");
    state.place = w || ""; state.sel = {};
    paint(); paintCurrent();
    if (state.hooks.libraryChanged) state.hooks.libraryChanged();
  }
  // HERESY 2135 (the audit of 06.11.2026): ws, the workspace the run was sent into (an F5 between: the one in hand may be another), while it still
  // takes takes; else the one in hand. A refusal (the lab busy or rising, a window read-only) was swallowed, and the next read of the catalog took
  // the take out of the Takes column unseen: said with its reason and «File them again», the names held and sent again with the next landing
  // there and by themselves a few times (10 s, 30 s, 90 s)
  var UNFILED = {}, unfiledTimer = 0, unfiledTries = 0;
  // HERESY 2159 (the audit's review of 2135): a read-only window (2081: the lease held by another) never files. Reloaded during a run, it took the
  // run's end for its own and said «Not filed into…», then tried three times more (10, 30, 90 s), each refused; now it asks the lab nothing, holds
  // nothing, and says one plain line, or nothing when the lab's own refusal was said already (heresy-link.js) or nothing would have been filed
  function readOnlyHere() { var L = window.ruachLease; return !!(L && L.mayWrite && !L.mayWrite()); }
  function unfiledOff(cur) { delete UNFILED[cur]; if (!Object.keys(UNFILED).length) { clearTimeout(unfiledTimer); unfiledTries = 0; } }
  function landed(takeNames, ws, again) {
    if (!takeNames || !takeNames.length) return Promise.resolve(false);
    if (readOnlyHere()) {
      var meant = ws || workable(recall(WS_KEY) || "");
      if (meant) unfiledOff(meant);
      if (meant && again !== "timer") toast("This window is read-only and files nothing: the new takes are in the library, not filed into \u201c" + meant + "\u201d from here");
      return Promise.resolve(false);
    }
    var fail = function (cur, list, why) {
      // HERESY 2135 (the review): with the ones held from an earlier refusal (the Librarian down twice in a row dropped the first run's names)
      var held = UNFILED[cur] = list.concat((UNFILED[cur] || []).filter(function (n) { return list.indexOf(n) < 0; }));
      if (!again || again === "button") {
        // HERESY 2155: one take is «1 new take is», as English says it (the catalogs: the singular its own key, the plural their plural forms)
        state.hooks.toast("Not filed into \u201c" + cur + "\u201d (" + why + "): " + (held.length === 1 ? "1 new take is" : held.length + " new takes are") +
          " in the library, in no workspace yet", "bad", { label: "File them again", fn: function () { refile("button"); } });
      }
      if (unfiledTries < 3) {
        clearTimeout(unfiledTimer);
        unfiledTimer = setTimeout(function () { refile("timer"); }, [10000, 30000, 90000][unfiledTries++]);
      }
      return false;
    };
    return (state.loaded ? Promise.resolve() : load()).then(function () {
      if (!state.loaded) {                               // the Librarian does not answer (404: none in this Studio, nothing to file into)
        var meant = ws || workable(recall(WS_KEY) || "");
        // HERESY 2166: none in this Studio is no failure to toast, but it is said once a page in the debug journal (it was said nowhere)
        if (state.loadStatus === 404 && !state.absentNoted && window.HeresyDebug && window.HeresyDebug.note) {
          state.absentNoted = true;
          window.HeresyDebug.note({ k: "librarian", to: "absent", why: "404: no Librarian in this Studio, so the finished runs are filed into no workspace" });
        }
        return state.loadStatus === 404 || !meant ? false : fail(meant, takeNames.slice(), "the Librarian does not answer");
      }
      var cur = ws && state.ws.indexOf(ws) >= 0 && !closedWs(ws) ? ws : landable();   // HERESY 1434: never into a 💎 set or a frozen workspace
      // HERESY 2135 (the review): the run's workspace closed or gone meanwhile and none in hand that takes takes: said and held (File them again
      // files them into the one in hand once there is one), not dropped unseen; a landing that names none (the import's) as before
      if (!cur) return ws ? fail(ws, takeNames.slice(), "it takes no new takes now, nor does the workspace in hand") : false;
      var list = takeNames.concat(UNFILED[cur] || []).filter(function (n, i, a) { return a.indexOf(n) === i; });
      delete UNFILED[cur];
      var asked = rateSeq;
      return api("/collection", { op: "ws-add", workspace: cur, names: list }).then(function (d) {
        state.rows = d.takes ? fresh(d.takes, asked) : state.rows;
        if (state.hooks.libraryChanged) state.hooks.libraryChanged();
        if (again) toast("Filed into \u201c" + cur + "\u201d after all: " + list.length);
        if (!Object.keys(UNFILED).length) { clearTimeout(unfiledTimer); unfiledTries = 0; }
        return true;
      }, function (e) {
        // HERESY 2159: refused by the lease (this window turned read-only while the run ran, or as it ended): heresy-link.js said it once; held for no retry
        if ((e && e.lease) || readOnlyHere()) { unfiledOff(cur); return false; }
        return fail(cur, list, (e && e.message) || String(e));
      });
    });
  }
  function refile(how) {
    Object.keys(UNFILED).forEach(function (w) { var names = UNFILED[w]; delete UNFILED[w]; landed(names, w, how); });
  }
  window.ruachUnfiled = function (clear) {                // for the checks; clear: a check's own refusal held no longer, its retry off
    if (clear) { UNFILED = {}; clearTimeout(unfiledTimer); unfiledTries = 0; }
    return JSON.parse(JSON.stringify(UNFILED));
  };
  function inCurrent(name) {
    var cur = current();
    if (!cur) return true;
    var r = rowOf(name);                                                             // HERESY 2011 (P1)
    if (!r) return true;                                                             // HERESY 1434: just made, landing in the one in hand
    return inTree(r, cur);                                                           // HERESY 1161: with its sections
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
    if (/^ws-(create|add|move|merge)$/.test(body.op || "") && realmNow() === "reader" && !body.realm) body.realm = "reader";   // HERESY 2294
    var undo = quiet ? null : undoFor(body), asked = rateSeq;   // what was, read before the change
    return api("/collection", body).then(function (d) {
      actsDone++;
      state.rows = d.takes ? fresh(d.takes, asked) : state.rows; state.ws = d.workspaces || state.ws; state.trashDays = d.trash_days || 0; state.locks = d.locks || state.locks || {};
      if (d.ws_realm) state.wsRealm = d.ws_realm;   // HERESY 2294
      state.pins = d.pins || state.pins || {};
      state.frozen = d.frozen || state.frozen || [];   // HERESY 1166
      state.blind = d.blind || state.blind || [];   // HERESY 1874
      if (d.archived) state.archived = d.archived;     // HERESY 2050b: the archive (2049) and the albums (2050) as the lab answered
      if (d.albums) state.albums = d.albums;
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
      '<div class="hd-body">The Studio\'s approved sets, as their author published them. Each comes in as a workspace of its own, ' +
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

  // HERESY 2059 (Viktor 03.11.2026: «Пройтись по бару… и добавить недостающие действия в контекстное меню»): a take's menu packs the checked too and
  // names the format and what goes with them itself; asked so, the bar's ⤓ is set to them first, so the bar and the menu say one choice. exportHow
  // tells the menu which the bar holds now (its tick)
  function exportHow() {
    var f = $("collExportFmt"), d = $("collExportDer");
    return { format: f ? f.value : "flac", derived: !!(d && d.checked) };
  }
  function exportZip(how) {
    var n = names(); if (!n.length) return;
    if (how && (how.format === "flac" || how.format === "wav")) { $("collExportFmt").value = how.format; $("collExportDer").checked = !!how.derived; }
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
          if (s.no_song) toast(s.no_song + " of them had no song in their folder (audio.wav, .flac or .mp3): only what was made from them went in.", true);   // HERESY 2011 (C2)
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
    realmBar();                                      // HERESY 2294
    $("collSearch").addEventListener("input", function () { state.q = this.value; paint(); });
    // HERESY 2046: the empty view's reset, the eye, ⓘ, and the pins' strip held right under the column's own sticky head
    $("collGrid").addEventListener("click", function (e) {
      if (!e.target.closest("[data-coll-reset]")) return;
      state.q = ""; $("collSearch").value = ""; state.kinds = {}; state.derived = {};
      paint();
    });
    if ($("collReveal")) {
      $("collReveal").innerHTML = ico("eye");
      $("collReveal").addEventListener("click", function () {
        state.reveal = !state.reveal;
        this.setAttribute("aria-pressed", String(state.reveal));
        this.innerHTML = ico(state.reveal ? "eye-off" : "eye");
        paint();
      });
    }
    if ($("collStats")) {
      $("collStats").addEventListener("click", function (e) { e.stopPropagation(); statsOpen(); });
      document.addEventListener("mousedown", function (e) { if (!$("collStatsPop").hidden && !e.target.closest(".coll-stats-wrap")) statsOpen(false); }, true);
      document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("collStatsPop").hidden) { e.stopPropagation(); statsOpen(false); } }, true);
    }
    (function () {
      var head = document.querySelector("#view-collection > .col-head"), col = $("view-collection");
      if (!head || !window.ResizeObserver) return;
      var put = function () { col.style.setProperty("--coll-head-h", head.offsetHeight + "px"); };
      new ResizeObserver(put).observe(head);
      put();
    })();
    $("collSort").value = recall(SORT_KEY) || "new";
    $("collSort").addEventListener("change", function () { if (this.value === "shuffle") DEAL = {}; store(SORT_KEY, this.value); paint(); });   // HERESY 1863: dealt anew
    // HERESY 2004: the sort's button opens its choices, the hidden select's own
    if ($("collSortBtn")) $("collSortBtn").addEventListener("click", function () {
      var sel = $("collSort"), r = this.getBoundingClientRect();
      if (!window.HeresyMenu) return;
      window.HeresyMenu.open(r.left, r.bottom + 4, Array.prototype.map.call(sel.options, function (o) {
        return { label: o.textContent, checked: o.value === sel.value, action: function () { sel.value = o.value; sel.dispatchEvent(new Event("change")); } };
      }));
    });
    // HERESY 1167: the disliked shown or not: the rooms' takes column's ⋯ («The disliked ones too»), one setting with this
    window.addEventListener("ruach-disliked", function () { paint(); });
    window.addEventListener("ruach-catalog", function () { catalogGen++; if (state.loaded) load(); });   // HERESY 1425: a take landed from the lab; 2219: asked anew
    // HERESY 1169 · 1241: the filters' window, from the button at the end of the search row
    state.logic = recall(LOGIC_KEY) || "and";
    $("collFilterBtn").addEventListener("click", function () { openFilter(); });
    Array.prototype.forEach.call(document.querySelectorAll("[data-coll-view]"), function (b) {
      b.addEventListener("click", function () { store(VIEW_KEY, b.dataset.collView); paint(); });
    });
    $("collSide").addEventListener("click", function (e) {
      var sf = e.target.closest("[data-sec-fold]");           // HERESY 1685: its sections folded or back, the place in hand as it was
      if (sf) { e.stopPropagation(); secFold(sf.dataset.secFold); return; }
      var sysm = e.target.closest("[data-sys-menu]");         // HERESY 2058: All Workspaces, Not in a workspace, Hidden: their hidden shown again
      if (sysm) { e.stopPropagation(); var rs = sysm.getBoundingClientRect(); sysMenu(sysm.dataset.sysMenu, rs.left, rs.bottom + 2); return; }
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
      if (p && p.dataset.place === "__trash" && window.HeresyMenu) { e.preventDefault(); return trashMenu(e.clientX, e.clientY); }   // HERESY 1996
      if (p && /^(|__none|__hidden)$/.test(p.dataset.place) && window.HeresyMenu) { e.preventDefault(); return sysMenu(p.dataset.place, e.clientX, e.clientY); }   // HERESY 2058
      if (!p || !p.dataset.place || p.dataset.place.charAt(0) === "_" || !window.HeresyMenu) return;
      e.preventDefault();
      wsMenu(p.dataset.place, e.clientX, e.clientY);
    });
    $("collDialog").addEventListener("click", function (e) {
      if (e.target === $("collDialog") || e.target.closest("[data-dlg-close]")) closeDialog();
    });
    // HERESY 1996 (Viktor 01.11.2026: «добавь две функции на Корзину, в контекстное меню: очистить безвозвратно, восстановить ВСЁ с пересозданием
    // оригинальных воркспейсов и из поддиректорий»): the trash's own menu in the column; everything given back where it stood, or wiped out, asked first
    function trashMenu(x, y) {
      api("/trash").then(function (d) {
        var items = d.items || [], n = items.length;
        window.HeresyMenu.open(x, y, [
          { label: "Everything back, its workspaces and sections made again", icon: "\u21ba", disabled: !n,
            hint: n ? undefined : "the trash is empty",
            action: function () {
              api("/trash", { op: "restore-all" }).then(function (r) {
                toast(r.restored.length + " back in the library" + (r.made_again && r.made_again.length ? ", " + r.made_again.length + " workspaces made again" : ""));
                saidSkipped(r);                              // HERESY 2130
                if (hooks.refreshLibrary) hooks.refreshLibrary();
                return load().then(function () { if (state.place === "__trash") return loadTrash(); paint(); });
              }).catch(function (e) { toast(e.message, true); });
            } },
          { sep: true },
          { label: "Wipe out the trash for good…", icon: "\u2716", danger: true, disabled: !n,
            action: function () {
              ask("Wipe out the whole trash: " + n + " take" + (n > 1 ? "s" : "") + ", with everything made from them.\n\nThis cannot be undone.", { ok: "Wipe out", danger: true }).then(function (ok) {
                // HERESY 2130: the very takes the question counted, never what lies there by the time it is answered
                if (ok) return api("/trash", { op: "empty", items: items.map(function (i) { return { day: i.day, name: i.name }; }) }).then(function (r) {
                  toast(r.emptied.length + " deleted for good"); saidProtected(r, true); saidSkipped(r); state.tsel = {}; return state.place === "__trash" ? loadTrash() : load().then(paint);
                });
              }).catch(function (e) { toast(e.message, true); });
            } }]);
      }).catch(function (e) { toast(e.message, true); });
    }
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
        act(add ? { op: "ws-add", workspace: w, names: list } : { op: "ws-move", workspace: w, from: from, tree: !!from, names: list },   // HERESY 2130
            n + (add ? " added to \u201c" : " moved to \u201c") + w + "\u201d" + (add ? "" : from ? " (out of \u201c" + from + "\u201d)" : " (out of every other workspace)"));
        state.sel = {};
      });
    });
    $("collCompare").addEventListener("click", function () {   // HERESY 1415; 2043: over twelve, a word instead
      var n = names();
      if (n.length > 12) return toast(tr("Twelve at most to compare: uncheck {0}").replace("{0}", n.length - 12), true);
      if (window.HeresyCompare) window.HeresyCompare.takes(n);
    });
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
          act({ op: "ws-move", workspace: w, from: from, tree: !!from, names: names() }, n + " moved to \u201c" + w + "\u201d" + (from ? " (out of \u201c" + from + "\u201d)" : " (out of every other workspace)"));   // HERESY 2130
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
      var fat = e.target.closest("[data-found-at]");          // HERESY 2058: a take found by its ID, opened where it lives
      if (fat) { openFound(fat.dataset.foundName, fat.dataset.foundAt); return; }
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
      if (e.target.closest("[data-ctree]")) { if (window.HeresyLineage) window.HeresyLineage.open(cname); return; }   // HERESY 1988
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
    $("collGrid").addEventListener("contextmenu", function (e) {   // HERESY 1048: the Studio's own menu
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
      // HERESY 2128 (the audit of 06.11.2026): a 👍, 👎, ⭐ or a rename sends the note typed first (never after the list it brings back), and paints the
      // sheet again only while it is still open, its head alone (paintSheet): a sheet closed meanwhile no longer opens by itself
      var again = function () { if (sheetName === name && !$("collSheet").hidden) openSheet(name); };
      var sren = e.target.closest("[data-sheet-ren]");
      if (sren) { noteFlush(name); renameIn(sren, name, again); return; }
      if (e.target.closest(".coll-title-edit")) return;
      if (e.target.closest("[data-sheet-play]")) {
        var now = hooks.playing();
        if (now.name === name) hooks.togglePlay(); else { var t = hooks.findTake(name); if (t) hooks.playNow(t); }
        return;
      }
      var rt = e.target.closest("[data-sheet-rate]");
      if (rt) { var v = +rt.dataset.sheetRate; noteFlush(name); rate(name, r.rating === v ? 0 : v).then(again, function (er) { toast(er.message, true); }); return; }
      if (e.target.closest("#sheetFav")) {
        var tk = hooks.findTake(name);
        if (tk) { noteFlush(name); hooks.updateTake(tk, { favorite: !tk.favorite }).then(load).then(again, function (er) { toast(er && er.message || String(er), true); }); }
        return;
      }
      var go = e.target.closest("[data-sheet-go]");
      if (go) { closeSheet(); hooks.openTake(name, go.dataset.sheetGo); }
    });
    $("collSheet").addEventListener("input", function (e) {
      if (e.target.id !== "sheetNote" || !sheetName) return;
      noteQueue(sheetName, e.target.value);       // HERESY 2128: its own timer a take, held against every older list
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
    // HERESY 2288 (Viktor 09.11.2026: «когда выделены треки в списке/тайлинге, появляется бар с кнопками по массовым действиям. Предлагаю к ним прикрутить
    // шорткаты одной кнопкой, на всех языках Студии с ремаппингом, если не английская раскладка и Shift»): the bar of the checked by one key each, as
    // mainstream players and file managers have them; a Latin layout by its own letter (AZERTY, QWERTZ, Dvorak), any other by the key's place, a keyboard
    // that sends no place by the letter its layout types there; Shift too. No key for the workspaces («от беды подальше») nor for delete (Delete above
    // keeps asking first); none for the protection (a second press takes it off every checked take) nor for the lyrics check (Whisper on the processor)
    var BULK_KEYS = { C: "collCompare", H: "collHide", L: "collLike", D: "collDislike", F: "collFav", P: "collPlBtn", E: "collDlBtn" };
    var BULK_TYPED = { C: "сψב", H: "рηי", L: "дλך", D: "вδג", F: "аφכ", P: "зπפ", E: "уεק" };   // ЙЦУКЕН (ru, uk, be), Greek, Hebrew
    function bulkKeyOf(e) {
      var k = e.key || "", m = /^Key([A-Z])$/.exec(e.code || "");
      if (/^[a-z]$/i.test(k)) return k.toUpperCase();
      if (m) return m[1];
      k = k.toLowerCase();
      for (var K in BULK_TYPED) if (k.length === 1 && BULK_TYPED[K].indexOf(k) >= 0) return K;
      return "";
    }
    Object.keys(BULK_KEYS).forEach(function (K) {
      var b = $(BULK_KEYS[K]);
      if (!b) return;
      b.dataset.key = K;                                    // its cap on the button, from app.css
      b.setAttribute("aria-keyshortcuts", K);
      b.tipMore = function () { return tr("Key: {0} (in any keyboard layout)").replace("{0}", K); };
    });
    document.addEventListener("keydown", function (e) {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      if (document.body.dataset.tab !== "collection" || $("collBulk").hidden || !names().length) return;
      var t = e.target, ve = $("view-engine");
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (document.querySelector(".hd-back, .ds-back, .cmp-back, .hg-back:not([hidden]), .hm-pop:not([hidden]), .menu-pop:not(.is-hidden)") || !$("collDialog").hidden || !$("collSheet").hidden) return;
      if (ve && !ve.classList.contains("is-hidden")) return;
      var K = bulkKeyOf(e), b = BULK_KEYS[K] ? $(BULK_KEYS[K]) : null;
      if (!b || b.disabled || b.hidden || !b.offsetParent) return;
      var pop = document.querySelector(".coll-pl-pop:not([hidden]), .coll-dl-pop:not([hidden])");
      if (pop && !b.parentNode.contains(pop)) return;      // one overlay at a time: its own key closes it, Esc too
      e.preventDefault();
      b.click();
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
    // HERESY 2048: add and move through the Studio's own chooser (the tree, its filter, a new one)
    var wsChoose = function (title, but) {
      var items = state.ws.filter(function (w) { return w !== but && !closedWs(w) && wsLeaf(w) !== SOURCED; }).map(function (w) {
        return { value: w, label: wsParts(w).length > 1 ? wsLeaf(w) : w, depth: wsParts(w).length - 1, path: wsParts(w).slice(0, -1).join(" \u203a "),
                 note: String(state.rows.filter(function (r) { return inTree(r, w); }).length) };
      });
      return window.HeresyDialog.choose(title, items, { more: [{ label: "+ New workspace\u2026", value: "__new" }], cancel: "Cancel", filter: "Filter the workspaces" })
        .then(function (v) {
          if (v !== "__new") return v || "";
          return askName("A new workspace for the selected", "", { ok: "Make it", placeholder: "its name" }).then(function (n) {
            n = String(n || "").replace(/\s*\/\s*/g, " ").trim();
            return n ? act({ op: "ws-create", workspace: n }, null, true).then(function (ok) { return ok ? n : ""; }) : "";
          });
        });
    };
    if ($("collWsAddBtn")) $("collWsAddBtn").addEventListener("click", function () {
      var n = names();
      if (!n.length) return;
      wsChoose(tr("Add {0} to a workspace").replace("{0}", n.length)).then(function (w) { if (w) act({ op: "ws-add", workspace: w, names: n }, n.length + " added to “" + w + "”"); });
    });
    if ($("collWsMoveBtn")) $("collWsMoveBtn").addEventListener("click", function () {
      var n = names();
      if (!n.length) return;
      wsChoose(tr("Move {0} to a workspace").replace("{0}", n.length), state.place).then(function (w) { if (w) moveTo(w, n, true); });
    });
    // HERESY 2058 (Viktor's playlist, the audit of 04.11.2026: no «Add to playlist» in the bar): the checked into the playlist, first, last or anywhere, or
    // into an album (a new one too), from the bar's own small overlay, closed by a click away and Esc as ⤓'s
    if ($("collPlBtn")) {
      var plPopHtml = function () {
        var b = function (k, label, raw) { return '<button type="button" class="btn ghost small coll-plp" data-plp="' + esc(k) + '">' + (raw ? '<span translate="no">' + esc(label) + "</span>" : esc(label)) + "</button>"; };
        return '<div class="coll-plp-cap">Playlist</div><div class="coll-plp-row">' + b("first", "First") + b("last", "Last") + b("random", "Random") + "</div>" +
          '<div class="coll-plp-cap">Into an album</div><div class="coll-plp-col">' + (state.albums || []).map(function (a) { return b("album:" + a.name, "▣ " + a.name, true); }).join("") +
          b("new", "New album…") + "</div>";
      };
      var plPopOpen = function (on) {
        var p = $("collPlPop");
        if (on === undefined) on = p.hidden;
        if (on) p.innerHTML = plPopHtml();
        p.hidden = !on;
        $("collPlBtn").setAttribute("aria-expanded", String(on));
      };
      $("collPlBtn").addEventListener("click", function (e) { e.stopPropagation(); plPopOpen(); });
      $("collPlPop").addEventListener("click", function (e) {
        var b = e.target.closest("[data-plp]"), list = names();
        if (!b) return;
        plPopOpen(false);
        if (!list.length) return;
        var k = b.dataset.plp;
        if (k === "new") plAlbumNew(list);
        else if (k.indexOf("album:") === 0) { var al = k.slice(6); plOp({ op: "album-add", album: al, names: list, where: "last" }, tr("Into the album “{0}”: {1}").replace("{0}", al).replace("{1}", list.length)); }
        else plAdd(list, k);
      });
      document.addEventListener("mousedown", function (e) { if (!$("collPlPop").hidden && !e.target.closest(".coll-pl-wrap")) plPopOpen(false); }, true);
      document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("collPlPop").hidden) { e.stopPropagation(); plPopOpen(false); } }, true);
    }
    // HERESY 2048: ⤓ by the trash: the format, what goes with them, the ZIP, in one overlay
    if ($("collDlBtn")) {
      var dlOpen = function (on) { var p = $("collDlPop"); if (on === undefined) on = p.hidden; p.hidden = !on; $("collDlBtn").setAttribute("aria-expanded", String(on)); };
      $("collDlBtn").addEventListener("click", function (e) { e.stopPropagation(); dlOpen(); });
      $("collExport").addEventListener("click", function () { dlOpen(false); });
      document.addEventListener("mousedown", function (e) { if (!$("collDlPop").hidden && !e.target.closest(".coll-dl-wrap")) dlOpen(false); }, true);
      document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("collDlPop").hidden) { e.stopPropagation(); dlOpen(false); } }, true);
    }
    $("collWsPick").addEventListener("change", function () {
      var w = this.value; this.value = "";
      if (!w) return;
      (w === "__new" ? askName("A new workspace for the selected", "", { ok: "Add them there", placeholder: "its name" }) : Promise.resolve(w)).then(function (w) {
        if (w) act({ op: "ws-add", workspace: w, names: names() }, names().length + " added to “" + w + "”");
      });
    });
    $("collWsOut").addEventListener("click", function () {     // HERESY 1108: more than one asks first
      var n = names(), go = function () { act({ op: "ws-remove", workspace: state.place, tree: true, names: n }, n.length + " taken out of “" + state.place + "”"); state.sel = {}; };   // HERESY 2130: its sections too
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
        saidSkipped(d);                                    // HERESY 2130
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
      api("/trash", { op: "restore", items: items }).then(function (d) { toast(d.restored.length + " back in the library"); saidSkipped(d); if (hooks.refreshLibrary) hooks.refreshLibrary(); return load().then(loadTrash); })   // HERESY 2130
        .catch(function (e) { toast(e.message, true); });
    });
    $("collEmpty").addEventListener("click", function () {
      if (state.place === "__trash_art") return artBinAct("delete");    // HERESY 1337
      var items = chosen(), all = !items.length;
      var n = all ? state.trash.length : items.length;
      if (!n) return;
      ask((all ? "Wipe out the whole trash: " : "Delete for good: ") + n + " take" + (n > 1 ? "s" : "") + ", with everything made from them.\n\nThis cannot be undone.", { ok: all ? "Wipe out" : "Delete for good", danger: true }).then(function (ok) {
        // HERESY 2130: all is the list shown and counted, sent as it is (items: null wiped whatever lay there when it was answered)
        if (ok) return api("/trash", { op: "empty", items: all ? state.trash.map(function (i) { return { day: i.day, name: i.name }; }) : items }).then(function (d) {
          toast(d.emptied.length + " deleted for good"); saidProtected(d, true); saidSkipped(d); state.tsel = {}; return loadTrash();
        });
      }).catch(function (e) { toast(e.message, true); });
    });
    function trashDaysAsk() {                         // HERESY 1996: the Librarian's trash and Engine → Defaults, one choice
      var days = parseInt(this.value, 10) || 0, sel = this;
      (days ? ask("Empty the trash by itself?\n\nWhatever has lain there more than " + days + " days is deleted for good, every hour from now on.", { ok: "Every " + days + " days", danger: true }) : Promise.resolve(true)).then(function (ok) {
        if (!ok) { sel.value = String(state.trashDays === 28 ? 30 : state.trashDays || 0); return; }
        act({ op: "trash-days", days: days }, days ? "The trash empties itself after " + days + " days" : "The trash keeps everything until you empty it");
      });
    }
    $("collTrashDays").addEventListener("change", trashDaysAsk);
    if ($("defTrashDays")) $("defTrashDays").addEventListener("change", trashDaysAsk);
    $("wsCurrent").addEventListener("click", function () { chooseCurrent(); });   // HERESY 1167: the workspace in hand, chosen in a dialog
    paintCurrent();
    state.place = recall(WS_KEY) || "";
    load();
    // HERESY 2158: what the last page sent as it went, held to the lab's own list a few seconds on (a beacon still on its way when this page asked first)
    if (recall(LEFT_KEY)) setTimeout(function () { catalog().then(function (d) { notesLeftCheck(d.takes || []); }, function () { /* asked again at the next load */ }); }, 4000);
    api("/trash").then(function (d) { state.trash = d.items || []; state.trashErr = ""; paintSide(); })
      .catch(function (e) { state.trashErr = (e && e.message) || String(e); paintSide(); });   // HERESY 2130: «?» and why, never a 0 that was not read
    loadArtBin(true);                                    // HERESY 1337: its number in the column
  }

  // HERESY 1042: likes, as SUNO has them (the player sets them)
  // HERESY 1169: a take without a row here (the Creator's take head, another workspace's take) reads what rate() remembered
  function rating(name) { var r = rowOf(name); return r ? r.rating || 0 : rated[name] ? rated[name].v || 0 : 0; }
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
  // HERESY 2130 (the audit of 06.11.2026: «0 back in the library»; «Wipe out the whole trash стирает не то, что посчитал диалог»): what the trash did not do,
  // said with the lab's reason, apart from what it did: a take not moved (not in the library, one of its name in today's trash), not given back (a take of
  // its name lives in the library), no longer in the trash, or not deleted (its files held)
  function saidSkipped(d) {
    var say = function (list, head) {
      var by = {};
      // HERESY 2162 (the audit's review of 2130): an item the lab names without a reason gets one the catalogs know, so the toast matches its key whole
      // («{0} not moved to the trash: {1}»); without it the text matched no key and came out half translated («3 not перенесено…»)
      (list || []).forEach(function (x) { var w = (x && x.why) || "the Librarian gave no reason"; by[w] = (by[w] || 0) + 1; });
      Object.keys(by).forEach(function (w) { toast(by[w] + " " + head + ": " + w, true); });
    };
    if (!d) return;
    say(d.missing, "not moved to the trash");
    say(d.skipped, "not given back");
    if (d.absent && d.absent.length) toast(d.absent.length + " no longer in the trash: given back or deleted meanwhile", true);
    say(d.failed, "not deleted");
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
  // HERESY 2011 (the audit of 02.11.2026, P1): every lookup by name was a pass over the whole Library, several for each card (650 ms a paint of
  // 3133 takes); one Map, made again whenever state.rows is replaced (it is never changed in place), and the first row of a name kept, as filter's [0]
  var BY_NAME = null, BY_NAME_OF = null;
  function rowOf(name) {
    if (BY_NAME_OF !== state.rows) {
      BY_NAME = new Map();
      state.rows.forEach(function (r) { if (!BY_NAME.has(r.name)) BY_NAME.set(r.name, r); });
      BY_NAME_OF = state.rows;
    }
    return BY_NAME.get(name);
  }
  // HERESY 1473 (Viktor 15.10.2026: «Сторожа на все удаления, перемещения и т.п. По максимуму. Лучше семь раз спросить, чем за один
  // всё проебать»): where a mass action reaches, said before it goes; a second question when it reaches past the place you stand in
  function tl(s) { return window.RuachI18n ? window.RuachI18n.t(s) : s; }
  // HERESY 2165: at = { place, shown } when another view asks (the Creator's Takes column: its workspace, "" for every one, and the names it shows),
  // so «You stand in …» and «not shown» speak of that view and not of the Librarian's place; without it, the Librarian's place as before
  function reach(list, own, at) {
    var byWs = {}, none = 0, gems = 0, seen = {}, place = at ? String(at.place || "") : state.place;
    if (at) (at.shown || []).forEach(function (n) { seen[n] = 1; }); else shown().forEach(function (r) { seen[r.name] = 1; });
    list.forEach(function (name) {
      var r = rowOf(name), tops = {};
      if (!r) return;
      if (!r.workspaces.length) none++;
      r.workspaces.forEach(function (w) { tops[w.split(SEP)[0]] = 1; });
      Object.keys(tops).forEach(function (w) { byWs[w] = (byWs[w] || 0) + 1; });
      if (Object.keys(tops).some(function (w) { return w.indexOf("\ud83d\udc8e") === 0; })) gems++;
    });
    var here = place && place.charAt(0) !== "_" ? place.split(SEP)[0] : "";
    var wss = Object.keys(byWs).sort(function (a, b) { return byWs[b] - byWs[a]; });
    var unseen = list.filter(function (x) { return !seen[x]; }).length, foreign = own ? [] : wss.filter(function (w) { return w !== here; });
    return { n: list.length, byWs: byWs, wss: wss, none: none, gems: gems, here: here, unseen: unseen, foreign: foreign, place: place, column: !!at,
             risky: !here || foreign.length > 0 || gems > 0 || list.length > 50 || unseen > 0 };
  }
  function reachText(R) {
    var L = [!R.place ? tl("You stand in All Workspaces: this reaches every workspace.")
      : R.here ? tl("You stand in \u201c" + R.place + "\u201d.") : tl("You stand in a view across workspaces.")];
    if (R.wss.length) {
      L.push(tl("They are in:"));
      R.wss.slice(0, 8).forEach(function (w) { L.push("\u00b7 " + w + ": " + R.byWs[w]); });
      if (R.wss.length > 8) L.push(tl("\u00b7 and " + (R.wss.length - 8) + " more workspaces"));
    }
    if (R.none) L.push(tl("\u00b7 in no workspace: " + R.none));
    if (R.gems) L.push(tl(R.gems + " of them sit in published \ud83d\udc8e sets."));
    if (R.unseen) L.push(R.column ? tl(R.unseen + " of them are not shown in the column: its search or filters leave them out.")
                                  : tl(R.unseen + " of them are not shown here: picked in another view."));
    return L.join("\n");
  }
  function guarded(first, ok, list, own, at) {      // own: the action touches only the place you stand in (a take-out); at: another view's place (2165)
    var R = reach(list, own, at);
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

  var sheetName = "";
  function openSheet(name) {
    hidePeek();
    var r = rowOf(name);
    if (!r) return;
    if (sheetName && sheetName !== name) noteFlush(sheetName);   // HERESY 2128: another take's sheet: the note typed in this one goes now
    sheetName = name;
    requestOf(name).then(function (req) { if (sheetName === name) paintSheet(rowOf(name) || r, req); })
      .catch(function (e) { if (sheetName === name) paintSheet(rowOf(name) || r, {}); toast(e.message, true); });
  }
  // HERESY 2128 (the audit of 06.11.2026): the same take's sheet painted again (a 👍, a ⭐, a rename answered) gets its head and its workspaces anew, and its
  // note stays as it stands while it is typed in or waits to be saved: the whole sheet made anew put the old note back, out of focus, and the next key
  // wrote that old note over the new one
  function paintSheet(r, req) {
    var body = $("collSheetBody"), ta = $("sheetNote");
    if (ta && body.dataset.sheetFor === r.name && !$("collSheet").hidden) {
      var head = body.querySelector(".sheet-head"), was = body.querySelector(".sheet-head + .coll-badges");
      if (was) was.remove();
      if (head) { head.insertAdjacentHTML("afterend", sheetBadges(r)); head.outerHTML = sheetHead(r, req); }
      if (document.activeElement !== ta && !notePend[r.name]) ta.value = r.note || "";
      return;
    }
    body.dataset.sheetFor = r.name;
    body.innerHTML = sheetHead(r, req) + sheetBadges(r) +
      '<div class="sheet-cols"><div><div class="peek-cap">Style</div><pre class="sheet-text">' + esc(req.style || "") + "</pre></div>" +
      '<div><div class="peek-cap">Lyrics</div><pre class="sheet-text sheet-lyrics">' + esc(req.lyrics || "") + "</pre></div></div>" +
      '<label class="field"><span class="label">Note <em id="sheetNoteState"></em></span><textarea id="sheetNote" rows="3" maxlength="600"' +
        (r.frozen ? ' readonly aria-readonly="true" data-tip="' + esc(NOTE_ICE) + '"' : "") + ">" + esc(r.note || "") + "</textarea></label>" +   // HERESY 2128
      '<div class="dv-actions sheet-acts"><button type="button" class="btn ghost small" data-sheet-go="create">Open in the Musician</button>' +
      '<button type="button" class="btn ghost small" data-sheet-go="post">Open in the Refiner</button><span class="spacer"></span>' +
      '<button type="button" class="btn ghost small" data-sheet-close="1">Close</button></div>';
    var p = notePend[r.name];
    if (r.frozen) $("sheetNoteState").textContent = "frozen: read only";   // HERESY 2128: the field read only, its tip says why
    else if (p) $("sheetNoteState").textContent = "…";     // still on its way from before
    $("collSheet").hidden = false;
  }
  function sheetBadges(r) { return r.workspaces.length ? '<div class="coll-badges">' + r.workspaces.map(function (w) { return wsBadge(w); }).join("") + "</div>" : ""; }
  function sheetHead(r, req) {
    var now = state.hooks.playing(), mine = now.name === r.name && now.playing;
    return '<div class="sheet-head"><button type="button" class="coll-play' + (mine ? " is-playing" : "") + '" data-sheet-play="1">' + ico(mine ? "pause" : "play") + "</button>" +
      '<div><div class="sheet-title"><span class="coll-title-text" data-sheet-ren="1" title="Click to rename">' + esc(r.title) + '</span></div><div class="coll-meta"><span>' + esc(state.hooks.ago(r.created, r.name)) + "</span>" +
      (r.seconds ? " \u00b7 <span>" + state.hooks.clock(r.seconds) + "</span>" : "") + (req.cot ? " \u00b7 <span>" + esc(cotWord(req.cot)) + "</span>" : "") + " \u00b7 <span>" + esc(KINDS[r.kind] || r.kind) + "</span>" +
      (r.derived.length ? " \u00b7 <span>made from it: " + esc(r.derived.join(", ")) + "</span>" : "") + "</div></div>" +
      '<span class="pb-rate"><button type="button" class="pb-btn" data-sheet-rate="1" aria-pressed="' + (r.rating > 0) + '">' + ico("like") + '</button>' +
      markBtns(r.name, "pb-btn") +                     // HERESY 1802
      '<button type="button" class="pb-btn" data-sheet-rate="-1" aria-pressed="' + (r.rating < 0) + '">' + ico("dislike") + '</button>' +
      '<button type="button" class="pb-btn" id="sheetFav" aria-pressed="' + r.favorite + '" >' + ico("star") + "</button></span></div>";
  }
  function closeSheet() { if (sheetName) noteFlush(sheetName); if ($("collSheet")) $("collSheet").hidden = true; sheetName = ""; }   // HERESY 2128: its note goes at once

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

  // HERESY 2042: a whole workspace into the playlist, one entry, after a question (a slip of the hand would pour hundreds of takes in)
  function plWsItem(w, n) {
    if (!w || w.charAt(0) === "_" || !n) return null;
    var inPl = (state.playlist || []).indexOf(PL_WS + w) >= 0;
    var go = function (where) {
      window.HeresyDialog.confirm(tr("The whole workspace “{0}” into the playlist?").replace("{0}", w) + "\n\n" +
        tr("Its {0} takes, its sections with it, play as one item; × takes it out whole, the takes stay where they are.").replace("{0}", n), { ok: tr("Into the playlist") })
        .then(function (yes) { if (yes) plOp({ op: "playlist-add", workspace: w, names: [], where: where }, tr("Into the playlist, whole: “{0}”").replace("{0}", w)); });
    };
    return { icon: "\u2630", label: inPl ? "In the playlist, whole" : "Add to playlist, whole", hint: n + "", items: [
      { label: "First", action: function () { go("first"); } }, { label: "Last", action: function () { go("last"); } },
      { label: "Random", hint: "anywhere in it", action: function () { go("random"); } }].concat(plWsAlbums(w, n)) };
  }
  // HERESY 2058 (the audit of 04.11.2026: «a whole workspace can go only into the root»): into an album too, one item there as in the root, after the same
  // question; a new album made with it
  function plWsAlbums(w, n) {
    var into = function (al) {
      window.HeresyDialog.confirm(tr("The whole workspace “{0}” into the album “{1}”?").replace("{0}", w).replace("{1}", al) + "\n\n" +
        tr("Its {0} takes, its sections with it, play as one item; × takes it out whole, the takes stay where they are.").replace("{0}", n), { ok: tr("Into the album") })
        .then(function (yes) { if (yes) plOp({ op: "album-add", album: al, names: [PL_WS + w], where: "last" }, tr("Into the album “{0}”, whole: “{1}”").replace("{0}", al).replace("{1}", w)); });
    };
    var made = function () {
      askName(tr("A new album") + "\n\n" + tr("The whole workspace “{0}” goes into it as one item.").replace("{0}", w), "", { ok: "Make it", placeholder: "its name", max: 60 }).then(function (a) {
        a = String(a || "").trim();
        if (a) plOp({ op: "album-create", album: a, names: [PL_WS + w] }, tr("Album “{0}” made").replace("{0}", a));
      });
    };
    return [{ sep: true }].concat((state.albums || []).map(function (a) { return { label: "▣ " + a.name, raw: true, action: function () { into(a.name); } }; }))
      .concat([{ label: "New album…", action: made }]);
  }

  // HERESY 2058 (Viktor 03.11.2026: «Нужна команда "Отобразить все скрытые"»): the hidden takes of a place shown again, one command wherever there are any:
  // a workspace's ⋯ (2046), an archived or a frozen one's, and the ⋯ (or a right click) of All Workspaces, Not in a workspace and Hidden. A take frozen
  // with its workspace stays as it is (the lab refuses to change it)
  // HERESY 2074 (Viktor 05.11.2026: «Давай, быстрецом гоним всё до и для среза 2.0.6»): the lists' dislike test (shown()): a disliked take is left out while the
  // Engine hides the disliked, the eye is off and no filter asks for the disliked. Hidden's ⋯ and Hidden's own number take it too (2058b)
  function disOutOfList(r) { return r.rating < 0 && !showDis() && !state.reveal && !(state.kinds.__disliked && (state.logic || "and") !== "nor"); }
  function hiddenOf(place) {
    return state.rows.filter(function (r) {
      if (!r.hidden) return false;
      if (!iceAt(r, place)) return false;            // HERESY 2058b: what the place's list shows, no more (Hidden holds no archived take)
      if (place === "") return !r.frozen && !r.archived;
      if (place === "__none") return !r.workspaces.length;
      if (place === "__hidden") return !disOutOfList(r);   // HERESY 2074: nor a disliked take the list leaves out, so the menu sends and counts what it shows
      return inTree(r, place);
    });
  }
  // HERESY 2089b (Viktor 05.11.2026: «в контекстное меню пространства, если есть скрытые треки, динамически добавлять опцию вернуть из скрытых. Я это дал тебе
  // в заказе вчера, но так и не сделано»): the count in the item's name, as the tree's tip counts the hidden by hand; the disliked a workspace's list leaves
  // out (the tree counts them hidden too) said beside it: the eye shows them, their dislike stays the user's own (this command never undoes it); with none
  // hidden by hand but some disliked, the item stands muted and says so. It acts on that place's takes hidden by hand alone, as before
  function showHiddenItem(place) {
    var all = hiddenOf(place), go = all.filter(function (r) { return !r.frozen; }).map(function (r) { return r.name; }), ice = all.length - go.length;
    var dis = place && place.charAt(0) !== "_" ? state.rows.filter(function (r) { return !r.hidden && r.rating < 0 && !showDis() && iceAt(r, place) && inTree(r, place); }).length : 0;
    var disSay = dis ? dis + " disliked stay out: the eye shows them" : "";
    if (!all.length) return dis ? { icon: "👁", label: "Show the hidden again", muted: true, hint: disSay } : null;
    if (!go.length) return { icon: "👁", label: "Show the hidden again", muted: true, hint: "Frozen with their workspace: unfreeze it first" };
    return { icon: "👁", label: "Show the hidden again (" + go.length + ")", hint: (ice ? tr("{0} frozen stay hidden").replace("{0}", ice) : "") + (ice && dis ? " · " : "") + disSay, action: function () {
      act({ op: "show", names: go }, "Shown again: " + go.length);
    } };
  }
  function sysMenu(place, x, y) {
    if (!window.HeresyMenu) return;
    var label = { "": "All Workspaces", __none: "Not in a workspace", __hidden: "Hidden" }[place] || "";
    window.HeresyMenu.open(x, y, [{ head: tr(label) }, showHiddenItem(place) || { icon: "👁", label: "Show the hidden again", muted: true, hint: "Nothing hidden here" }]);
  }

  // ---- HERESY 1050: a workspace renamed or deleted (three ways)
  function wsMenu(w, x, y) {
    if (!window.HeresyMenu) return;
    var n = state.rows.filter(function (r) { return inTree(r, w); }).length;
    if (archivedWs(w)) {                           // HERESY 2049: archived: opened, brought back, a note, or sent to the trash with its takes
      var root = archRoot(w);
      return window.HeresyMenu.open(x, y, [
        { head: w + " \u00b7 " + n + " take" + (n === 1 ? "" : "s") },
        { icon: "\u25a6", label: "Open", action: function () { openPlace(w); paint(); } },
        { icon: "\u21ba", label: "Bring it back", hint: root !== w ? "\u201c" + root + "\u201d with its sections" : "", action: function () {
          act({ op: "archive", workspace: root, on: false }, "Back from the archive: \u201c" + root + "\u201d", true);
        } },
        { icon: "✎", label: "Note…", hint: (state.wsNotes || {})[w] ? "✓" : "", action: function () { wsNote(w); } },
        showHiddenItem(w),                             // HERESY 2058: its hidden shown again, here too
        { sep: true },
        { icon: "\ud83d\uddd1", label: "Send to the trash\u2026", danger: true, muted: !!delStop(w), hint: delStop(w) || "with its takes", action: function () { deleteWs(w, "trash"); } }   // HERESY 2130
      ].filter(Boolean));
    }
    if (frozenWs(w)) {                             // HERESY 1166: frozen, it is opened or thawed, nothing else
      var own = (state.frozen || []).indexOf(w) >= 0, by = (state.frozen || []).filter(function (f) { return w.indexOf(f + SEP) === 0; })[0];
      return window.HeresyMenu.open(x, y, [
        { head: w + " \u00b7 " + n + " take" + (n === 1 ? "" : "s") },
        { icon: "\u25a6", label: "Open", action: function () { openPlace(w); paint(); } },
        { icon: "✎", label: "Note…", hint: (state.wsNotes || {})[w] ? "✓" : "", action: function () { wsNote(w); } },   // HERESY 1802
        plWsItem(w, n),                                // HERESY 2042: a frozen one is listened to most
        showHiddenItem(w),                             // HERESY 2058: what of it is not frozen with it (a take frozen with it stays hidden)
        { sep: true },
        own ? { icon: "\u2600", label: "Unfreeze", action: function () { act({ op: "freeze", workspace: w, on: false }, "Unfrozen: \u201c" + w + "\u201d", true); } }
            : { icon: "\u2744", label: "Frozen with \u201c" + by + "\u201d", disabled: true }
      ].filter(Boolean));
    }
    window.HeresyMenu.open(x, y, [
      { head: w + " \u00b7 " + n + " take" + (n === 1 ? "" : "s") },
      { icon: "\u25a6", label: "Open", action: function () { openPlace(w); paint(); } },
      { icon: "\u2193", label: "New takes land here", checked: current() === w, action: function () { store(WS_KEY, current() === w ? "" : w); paintCurrent(); state.hooks.libraryChanged && state.hooks.libraryChanged(); } },
      plWsItem(w, n),                                  // HERESY 2042
      showHiddenItem(w),                               // HERESY 2046 (Viktor: «Нужна команда "Отобразить все скрытые"»): its hidden, sections too; 2058: one helper, a frozen section's stay
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
      { icon: "\ud83d\uddc4", label: "Archive\u2026", hint: "out of the tree, kept whole", action: function () { archiveWs(w); } },   // HERESY 2049
      { icon: "\u2744", label: "Freeze\u2026", hint: "heard, never changed", action: function () { freezeWs(w); } },   // HERESY 1166
      (function () {                                   // HERESY 1874: blind listening, its sections with it
        var own = (state.blind || []).indexOf(w) >= 0, by = !own && blindWs(w);
        return by ? { icon: "\ud83e\udee3", label: "Blind listening", hint: "with its parent", disabled: true }   // HERESY 2043: 🫣
          : { icon: "\ud83e\udee3", label: own ? "Lift the blindness" : "Blind listening", hint: own ? "" : "what made its takes hidden", checked: own,
              action: function () { act({ op: "blind", workspace: w, on: !own }, (own ? "Seen again: \u201c" : "Blind: \u201c") + w + "\u201d", true); } };
      })(),
      lockItem(w, "workspace", "Workspace Deletion"),
      lockItem(w, "tracks", "Tracks Deletion"),
      { sep: true },
      { icon: "\ud83d\uddd1", label: "Delete\u2026", danger: true, muted: !!delStop(w), hint: delStop(w), action: function () { deleteWs(w); } }   // HERESY 2130
    ].filter(Boolean));
  }
  function archiveWs(w) {                          // HERESY 2049
    ask(tr("Archive “{0}”?").replace("{0}", w) + "\n\n" + tr("It leaves the tree for Archived (under Out of sight), its sections with it, whole with its takes: they leave All Workspaces and the search, and no new take lands in it. Its ⋯ there brings it back, or sends it to the trash."),
        { ok: "Archive" }).then(function (yes) {
      if (!yes) return;
      act({ op: "archive", workspace: w, on: true }, "Archived: \u201c" + w + "\u201d", true);
    });
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
  // HERESY 2130 (the audit of 06.11.2026: «сначала корзина, потом отказ»): what keeps a workspace from going, as the lab sees it: a lock against deletion on it
  // or on any of its sections, or a section frozen; said before anything moves (the takes went to the trash, and then the lab refused the workspace)
  function delStop(w) {
    var fam = state.ws.filter(function (x) { return x === w || x.indexOf(w + SEP) === 0; });
    var lk = fam.filter(function (x) { return isLocked(x, "workspace"); })[0];
    if (lk) return lk === w ? "locked" : tr("its section \u201c{0}\u201d is locked").replace("{0}", wsLeaf(lk));
    var ice = fam.filter(function (x) { return frozenWs(x); })[0];
    return ice ? tr("its section \u201c{0}\u201d is frozen").replace("{0}", wsLeaf(ice)) : "";
  }
  function lockItem(w, what, label) {
    var on = isLocked(w, what);
    return { icon: on ? "\ud83d\udd13" : "\ud83d\udd12", label: (on ? "Unlock " : "Lock ") + label, action: function () {
      act({ op: "lock", workspace: w, what: what, on: !on }, (on ? "Unlocked: " : "Locked: ") + label.toLowerCase() + " of \u201c" + w + "\u201d").then(function () { paint(); });
    } };
  }
  // a take no deletion may reach: it is in a workspace under a lock of either kind, its own or that of a workspace it is a section of
  // (HERESY 2011: the lab's rule since 1473, collection.locked_takes, which the engine keeps now as well; a lock on the tracks of the workspace
  // itself alone let the 💎 sets, locked as workspaces, through to «Delete for good»)
  function takeLocked(name) {
    var r = rowOf(name);
    return !!r && r.workspaces.some(function (w) {
      var parts = w.split(SEP);
      return parts.some(function (x, i) { var p = parts.slice(0, i + 1).join(SEP); return isLocked(p, "tracks") || isLocked(p, "workspace"); });
    });
  }
  // the place on the left and the workspace in hand follow it. HERESY 2130 (the audit of 06.11.2026): a section of it open or in hand follows too, by its
  // prefix when renamed («A / B» is «C / B»), or to `to` itself when the takes went there whole (poured, merged) or nowhere (deleted: All Workspaces)
  function followRename(from, to, whole) {
    var map = function (w) {
      if (w === from) return to;
      if (w && from && w.indexOf(from + SEP) === 0) return whole || !to ? to : to + w.slice(from.length);
      return null;
    };
    var p = map(state.place), h = map(recall(WS_KEY) || "");
    if (p !== null) state.place = p;
    if (h !== null) store(WS_KEY, h);
  }
  function renameWs(w) {
    var parent = wsParts(w).slice(0, -1).join(SEP);                       // HERESY 1161: a section keeps its parent
    askName((parent ? "Rename the section \u201c" + wsLeaf(w) + "\u201d of \u201c" + parent + "\u201d" : "Rename the workspace \u201c" + w + "\u201d"),
            parent ? wsLeaf(w) : w, { ok: "Rename", max: WS_PART, guard: true }).then(function (to) {   // HERESY 2039: a slip of the hand asks first
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
    // HERESY 2363 (Viktor 11.11.2026: «Нечаянно переместил в пространство как подпространство VLA. А вот вернуть или в корень его обратно — никак»): a
    // section is offered the top level first (a workspace of its own again, its sections and takes along, its name kept); the workspace it stands in
    // takes only its takes (as a section it is there already)
    var TOP = "\u0000top", home = wsParts(w).slice(0, -1).join(SEP);
    if (home) items.unshift({ value: TOP, label: "The top level", words: true, depth: 0, note: "" });
    window.HeresyDialog.choose("Move “" + w + "” into", items, { cancel: "Cancel", filter: "Filter the workspaces" }).then(function (to) {
      if (!to) return;
      if (to === TOP) {
        var top = wsLeaf(w);
        if (state.ws.indexOf(top) >= 0) return toast("There is a workspace “" + top + "” already", true);
        return window.HeresyDialog.confirm("Move “" + top + "” to the top level\n\nIt becomes a workspace of its own, with its sections and its takes, its name kept.", { ok: "Move it", cancel: "Cancel" }).then(function (yes) {
          if (!yes) return;
          return act({ op: "ws-rename", workspace: w, to: top }, "“" + top + "” is a workspace of its own now", true)
            .then(function (ok) { if (ok) { followRename(w, top); paint(); paintCurrent(); } });
        });
      }
      var fits = wsParts(to).length + 1 + height <= DEPTH && to !== home, asSec = to + SEP + wsLeaf(w);
      return window.HeresyDialog.confirm("Move “" + w + "” into “" + to + "”\n\n" +
          (fits ? "As a section: it goes inside it, with its sections and its takes, its name kept." : to === home ? "It is a section of it already." : "As a section: it would be more than two levels of sections deep, so not here.") +
          "\nOnly its takes: they go in, and the workspace itself goes, empty (its sections too).",
          { ok: fits ? "As a section" : "Only its takes", alt: fits ? "Only its takes" : null, cancel: "Cancel" }).then(function (how) {
        if (!how) return;
        var section = fits && how === true;
        if (section && state.ws.indexOf(asSec) >= 0) return toast("There is a workspace “" + asSec + "” already", true);
        return (section ? act({ op: "ws-rename", workspace: w, to: asSec }, "“" + wsLeaf(w) + "” is a section of “" + to + "” now", true)
                        : act({ op: "ws-pour", workspace: w, to: to }, "The takes of “" + w + "” are in “" + to + "” now", true))
          .then(function (ok) { if (ok) { followRename(w, section ? asSec : to, !section); paint(); paintCurrent(); } });
      });
    });
  }
  function closeDialog() { $("collDialog").hidden = true; $("collDialogBody").innerHTML = ""; }
  function deleteWs(w, how) {                       // HERESY 2049: how, the choice made already (the archive's «Send to the trash»)
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
    if (how) { var pre = $("collDialogBody").querySelector('input[name="wsDel"][value="' + how + '"]'); if (pre) pre.checked = true; }   // HERESY 2049
    $("wsDelTo").addEventListener("focus", function () { $("collDialogBody").querySelector('[value="move"]').checked = true; });
    $("wsDelGo").addEventListener("click", function () {
      var how = $("collDialogBody").querySelector('input[name="wsDel"]:checked').value, done, stop = delStop(w);
      if (stop) { closeDialog(); return toast(tr("\u201c{0}\u201d cannot go: {1}. Nothing was moved.").replace("{0}", w).replace("{1}", tr(stop)), true); }   // HERESY 2130
      if (how === "only") {
        done = act({ op: "ws-delete", workspace: w }, "Workspace \u201c" + w + "\u201d deleted; its takes stay unsorted").then(function (ok) { if (ok) followRename(w, ""); });
      } else if (how === "move") {
        var pick = $("wsDelTo").value;
        var secs = state.ws.some(function (x) { return x.indexOf(w + SEP) === 0; });
        done = (pick === "__new" || !pick ? askName("A new workspace for its takes", "", { ok: "Move them there", placeholder: "its name" }) : Promise.resolve(pick)).then(function (to) {
          if (!to) return;
          // HERESY 2130 (the audit of 06.11.2026): with sections ws-merge was always refused («has sections: merge or delete them first»); its takes and its
          // sections' are poured into the other instead (1808's ws-pour), a new one made first
          var made = secs && state.ws.indexOf(to) < 0 ? act({ op: "ws-create", workspace: to }, null, true) : Promise.resolve(true);
          return made.then(function (ok0) {
            if (!ok0) return;
            return act(secs ? { op: "ws-pour", workspace: w, to: to } : { op: "ws-merge", workspace: w, to: to }, takes.length + " moved into \u201c" + to + "\u201d; \u201c" + w + "\u201d deleted")
              .then(function (ok) { if (ok) followRename(w, to, true); });
          });
        });
      } else {
        var spare = $("wsDelSpare") && $("wsDelSpare").checked;
        var gone = takes.filter(function (r) { return !(spare && r.workspaces.length > 1); }).map(function (r) { return r.name; });
        done = api("/trash", { op: "move", names: gone }).then(function (d) {
          saidProtected(d);                                // HERESY 1368: they stay in the library, in no workspace
          saidSkipped(d);                                  // HERESY 2130
          var said = d.moved.length + " take" + (d.moved.length === 1 ? "" : "s") + " to the trash; \u201c" + w + "\u201d deleted" +
            (d.locked && d.locked.length ? "; " + d.locked.length + " stayed: another workspace locks them" : "");
          // HERESY 2130: Ctrl+Z gives the takes back, and the workspace with them (each stands again where it stood, 1996); a refusal that still comes after
          // the takes went says how many went, with the same way back
          return act({ op: "ws-delete", workspace: w }, null, true).then(function (ok) {
            if (ok) { followRename(w, ""); if (d.moved.length) undoable(said, untrash(d.moved)); else toast(said); }
            else if (d.moved.length) undoable(tr("Went to the trash before the refusal: {0}. Undo gives them back").replace("{0}", d.moved.length), untrash(d.moved));
            return ok;
          });
        }).then(function () { if (state.hooks.refreshLibrary) state.hooks.refreshLibrary(); return load(); }, function (e) { toast(e.message, true); });
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
        '<button type="button" class="btn ghost small" data-ds="create">Open in the Musician</button><button type="button" class="btn ghost small" data-ds="close">Close</button></div>' +
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
      // HERESY 2339 (the neutral-value pass): a 404 is «no score from the sound yet»; any other refusal is said in the sheet, never left as «A Direct take writes no score»
      else fetch("/lab/score?name=" + encodeURIComponent(name)).then(function (r) {
        if (r.status === 404) return null;
        return r.json().then(function (b) { if (!r.ok) throw new Error((b && b.error) || "HTTP " + r.status); return b; }, function () { throw new Error("HTTP " + r.status); });
      }).then(function (d) {
        if (d && d.abc) showScore(d.abc, "written from its sound by " + (d.by || "the transcriber") + (d.made ? ", " + d.made : ""));
      }).catch(function (e) {
        var none = back.querySelector(".ds-noscore");
        if (none) none.insertAdjacentHTML("afterbegin", '<span class="ds-score-fail">' + esc(tr("The score from its sound could not be read: {0}").replace("{0}", (e && e.message) || String(e))) + "</span> ");
      });
      // a Direct take's score from its sound: the engine's transcriber on the take's own audio. The page never adopts this
      // job (the cover form in the Creator is not touched): the sheet watches it itself, and the lab keeps the score.
      function scoreFromSound(btn) {
        var run = back.querySelector(".ds-score-run"), t0 = Date.now(), tick;
        btn.disabled = true;
        var said = function (text) { if (run) run.textContent = text; };
        // HERESY 2377: with the transcriber's mode chosen in the Musician (app.js keeps it), as a take's own page asks
        var how = window.RuachTranscriber ? window.RuachTranscriber.query() : "";
        fetch("/transcribe?take=" + encodeURIComponent(name) + how, { method: "POST" }).then(function (r) { return r.json().then(function (b) { if (!r.ok) throw new Error(b.error || r.status); return b; }); })
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
            return fetch("/lab/score?name=" + encodeURIComponent(name), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ abc: abc, transcriber: res.transcriber || "" }) })
              .then(function () { showScore(abc, "written from its sound by the transcriber (" + (window.RuachTranscriber ? window.RuachTranscriber.name(res.transcriber || "") : "SheetSage2") + "), now"); });
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
        // HERESY 2339: a 404 (an older lab) has none; any other refusal is said where the earlier covers stand, never hidden as none
        fetch("/lab/art/versions?name=" + encodeURIComponent(name)).then(function (r) { if (r.status === 404) return null; if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); }).then(function (cv) {
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
        }).catch(function (e) {
          if (!covWrap) return;
          covWrap.hidden = false;
          back.querySelector(".ds-cov-say").textContent = tr("The earlier covers could not be read: {0}").replace("{0}", (e && e.message) || String(e));
          covBox.innerHTML = "";
        });
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
    var here = function () { return shown().some(function (r) { return r.name === name; }); };
    var rr = rowOf(name);                             // HERESY 2294: a take of the other realm: its realm is shown first
    if (rr && !inRealm(rr)) { store(REALM_KEY, rowRealm(rr)); paintRealm(); }
    if (!here()) {                                    // out of the current view: no search, no filter, and its own workspace
      state.q = ""; state.kinds = {}; state.derived = {};
      $("collSearch").value = "";
      Array.prototype.forEach.call(document.querySelectorAll("#collFilters .is-on"), function (b) { b.classList.remove("is-on"); });
      // HERESY 2032 (Viktor 02.11.2026: «Баг со ссылкой на пространство трека. Перебрасывает во "Все пространства"»): the take's own workspace,
      // the one in hand when it holds the take; All only for a take of no workspace, or one its workspace does not show (hidden, trashed)
      var r = rowOf(name), own = ((r && r.workspaces) || []).filter(function (w) { return state.ws.indexOf(w) >= 0; }), cur = current();
      openPlace(own.length ? (own.indexOf(cur) >= 0 ? cur : own[0]) : "");
      if (!here()) state.place = "";
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
  // HERESY 2042: a whole workspace in the playlist, one entry («@ws:» and its name): every take of it and its sections (the hidden ones not), oldest first
  var PL_WS = "@ws:";
  function plWs(n) { return n && String(n).indexOf(PL_WS) === 0 ? String(n).slice(PL_WS.length) : ""; }
  function plWsTakes(w) { return state.rows.filter(function (r) { return inTree(r, w) && !r.hidden; }).sort(function (a, b) { return (a.created || 0) - (b.created || 0); }); }
  function plExpand(list) {
    var out = [], seen = {};
    (list || []).forEach(function (n) {
      var w = plWs(n);
      (w ? plWsTakes(w).map(function (r) { return r.name; }) : [n]).forEach(function (x) { if (!seen[x]) { seen[x] = 1; out.push(x); } });
    });
    return out;
  }
  function plFirst(n) { var w = plWs(n), t = w ? plWsTakes(w)[0] : null; return w ? (t ? t.name : "") : n; }
  // HERESY 2050: albums. An album open: its own takes; Everything: the playlist's own, then every album's not among them («Корень видит все треки»)
  state.plAlbum = recall("yue2.plAlbum") || "";
  state.plTags = [];
  function plAlbumOf(n) { return (state.albums || []).filter(function (a) { return a.name === n; })[0] || null; }
  function plAlbumOpen() { var a = state.plAlbum ? plAlbumOf(state.plAlbum) : null; if (!a && state.plAlbum) state.plAlbum = ""; return a; }
  function plList() {
    var a = plAlbumOpen();
    if (a) return plExpand(a.items);                   // HERESY 2058: an album may hold a whole workspace, as the root does
    var out = plExpand(state.playlist);
    (state.albums || []).forEach(function (x) { plExpand(x.items).forEach(function (n) { if (out.indexOf(n) < 0) out.push(n); }); });
    return out;
  }
  function plRootCount() {                             // HERESY 2058: the root's whole list, whatever album is open (the tags never cut the list it plays from)
    var keep = state.plAlbum;
    state.plAlbum = "";
    var n = plList().length;
    state.plAlbum = keep;
    return n;
  }
  function plStyle(n) { var t = state.hooks.findTake ? state.hooks.findTake(n) : null; return fold((t && t.style) || ""); }
  // HERESY 2058 (the audit of 04.11.2026: the count by whole parts, the filter by a piece of text): a ticked tag is one of the style's parts, as the
  // overlay counts them, so «rock» no longer finds «punk rock»
  function plParts(n) { var out = {}; plStyle(n).split(/[,.;\n]+/).forEach(function (p) { p = p.replace(/\s+/g, " ").trim(); if (p) out[p] = 1; }); return out; }
  function plTagOk(n) { if (!state.plTags.length) return true; var s = plParts(n); return state.plTags.every(function (t) { return !!s[t]; }); }
  function plTags() {                                    // the styles' parts of the takes in view, by how often they come
    var c = {};
    plList().forEach(function (n) {
      var seen = {};
      plStyle(n).split(/[,.;\n]+/).forEach(function (p) {
        p = p.replace(/\s+/g, " ").trim();
        if (p.length < 2 || p.length > 40 || /^no\s/.test(p) || seen[p]) return;
        seen[p] = 1; c[p] = (c[p] || 0) + 1;
      });
    });
    return Object.keys(c).sort(function (x, y) { return c[y] - c[x] || x.localeCompare(y); }).slice(0, 48).map(function (k) { return [k, c[k]]; });
  }
  function plPlayOrder(current) { return plList().filter(function (n) { return n === current || (plMatches(n) && plTagOk(n)); }); }
  function plRows() {
    var by = {}; state.rows.forEach(function (r) { by[r.name] = r; });
    var a = plAlbumOpen(), rows;
    var entry = function (n) { var w = plWs(n); return w ? { ws: w, name: n, takes: plWsTakes(w) } : by[n]; };   // HERESY 2058: a whole workspace in an album too
    if (a) rows = a.items.map(entry).filter(Boolean);
    else {
      rows = (state.playlist || []).map(entry).filter(Boolean);
      var own = plExpand(state.playlist);
      (state.albums || []).forEach(function (x) { x.items.forEach(function (n) {
        if (rows.some(function (r) { return r.name === n; })) return;
        if (plWs(n)) rows.push(Object.assign(entry(n), { inAlbum: x.name }));   // HERESY 2058
        else if (own.indexOf(n) < 0 && by[n]) rows.push(Object.assign({}, by[n], { inAlbum: x.name }));
      }); });
    }
    return state.plTags.length ? rows.filter(function (r) { return r.ws ? r.takes.some(function (t) { return plTagOk(t.name); }) : plTagOk(r.name); }) : rows;
  }
  function plCovers(names, pick) {
    var one = pick && names.indexOf(pick) >= 0 && window.HeresyArt ? window.HeresyArt.url(pick) : "";   // HERESY 2058: the cover chosen, square and alone
    if (one) return '<img alt="" loading="lazy" src="' + esc(one) + '" />';
    var art = names.map(function (n) { return window.HeresyArt ? window.HeresyArt.url(n) : ""; }).filter(Boolean);
    if (!art.length) return '<span class="pl-nocover">' + ico("music") + "</span>";
    if (art.length < 4) return '<img alt="" loading="lazy" src="' + esc(art[0]) + '" />';
    return '<span class="pl-mosaic">' + art.slice(0, 4).map(function (u) { return '<img alt="" loading="lazy" src="' + esc(u) + '" />'; }).join("") + "</span>";
  }
  function plAlbumsHtml() {
    var tile = function (key, label, names, own) {
      var on = (state.plAlbum || "") === key, al = own ? plAlbumOf(key) : null;
      return '<button type="button" class="pl-album' + (on ? " is-on" : "") + '" data-pl-album="' + esc(key) + '"' + (own ? ' data-pl-album-own="1"' : "") + ">" +
        '<span class="pl-album-cover">' + plCovers(names, al && al.cover) + "</span><span class=\"pl-album-name\"" + (own ? ' translate="no"' : "") + ">" + esc(label) + '</span><span class="pl-album-n mono">' + names.length + "</span>" +
        // HERESY 2058 (the audit: renaming and deleting only by a right click): an album's ⋯ in sight on its tile
        (own ? '<span class="pl-album-more" data-pl-album-menu="' + esc(key) + '" role="button" aria-label="More" data-tip="Rename, its cover, delete">\u22ef</span>' : "") + "</button>";
    };
    var keep = state.plAlbum; state.plAlbum = ""; var all = plList(); state.plAlbum = keep;
    return '<div class="pl-albums">' + tile("", tr("Everything"), all, false) + (state.albums || []).map(function (a) { return tile(a.name, a.name, plExpand(a.items), true); }).join("") +
      '<button type="button" class="pl-album pl-album-new" data-pl-album-new="1"><span class="pl-album-cover"><span class="pl-nocover">+</span></span><span class="pl-album-name">' + esc(tr("New album")) + "</span></button></div>";
  }
  function plAlbumNew(names) {
    return askName(tr("A new album") + (names && names.length ? "\n\n" + tr("{0} takes go into it.").replace("{0}", names.length) : ""), "", { ok: "Make it", placeholder: "its name", max: 60 }).then(function (n) {
      n = String(n || "").trim();
      if (!n) return false;
      return plOp({ op: "album-create", album: n, names: names || [] }, tr("Album “{0}” made").replace("{0}", n)).then(function (ok) { if (ok && !names) { state.plAlbum = n; store("yue2.plAlbum", n); plChanged(); } return ok; });
    });
  }
  function plAlbumMenu(names) {                          // the take menu's albums under Add to playlist
    var items = (state.albums || []).map(function (a) { return { label: "\u25a3 " + a.name, raw: true, action: function () { plOp({ op: "album-add", album: a.name, names: names, where: "last" }, tr("Into the album “{0}”: {1}").replace("{0}", a.name).replace("{1}", names.length)); } }; });
    return [{ sep: true }].concat(items).concat([{ label: "New album\u2026", action: function () { plAlbumNew(names); } }]);
  }
  function plAlbumTileMenu(name, x, y) {
    if (!window.HeresyMenu || !name) return;
    window.HeresyMenu.open(x, y, [
      { head: name },
      { icon: "Aa", label: "Rename the album\u2026", action: function () {
        askName(tr("Rename the album “{0}”").replace("{0}", name), name, { ok: "Rename", max: 60 }).then(function (to) {
          to = String(to || "").trim();
          if (to && to !== name) plOp({ op: "album-rename", album: name, to: to }).then(function (ok) { if (ok && state.plAlbum === name) { state.plAlbum = to; store("yue2.plAlbum", to); plChanged(); } });
        });
      } },
      { icon: "\u25a3", label: "Cover from\u2026", hint: "Which take's cover is the album's; Automatic: its takes' first covers, as before", action: function () { plAlbumCover(name); } },   // HERESY 2058
      { sep: true },
      { icon: "\ud83d\uddd1", label: "Delete the album\u2026", danger: true, action: function () {
        // HERESY 2130 (the audit of 06.11.2026): the promise is kept by the lab now (album-delete puts a take only in this album at the playlist's end), and
        // the dialog says how many that is
        var a = plAlbumOf(name), seen = {};
        plExpand(state.playlist).forEach(function (n) { seen[n] = 1; });
        (state.albums || []).forEach(function (x) { if (x.name !== name) plExpand(x.items).forEach(function (n) { seen[n] = 1; }); });
        var only = a ? plExpand(a.items).filter(function (n) { return !seen[n]; }).length : 0;
        ask(tr("Delete the album “{0}”?").replace("{0}", name) + "\n\n" + tr("Its takes stay in the library and in the playlist; only the album goes.") +
            (only ? "\n" + tr("{0} of them are in no other album and not in the playlist yet: they go to the playlist's end, so Everything keeps them.").replace("{0}", only) : ""),
            { ok: "Delete the album" }).then(function (yes) {
          if (yes) plOp({ op: "album-delete", album: name }).then(function () { if (state.plAlbum === name) { state.plAlbum = ""; store("yue2.plAlbum", ""); plChanged(); } });
        });
      } }
    ]);
  }
  // HERESY 2058 (Viktor 03.11.2026: «1:1 обложку, которую подгружаем из обложек треков»): the album's cover chosen from its takes' covers, square;
  // Automatic, the mosaic of its first covers, stays while none is chosen
  function plAlbumCover(name) {
    var a = plAlbumOf(name);
    if (!a || !window.HeresyDialog) return;
    var art = plExpand(a.items).filter(function (n) { return window.HeresyArt && window.HeresyArt.url(n); });
    if (!art.length) return toast(tr("None of its takes has a cover yet"), true);
    var items = art.map(function (n) { var r = rowOf(n); return { value: n, label: r ? r.title : n, current: a.cover === n }; });
    window.HeresyDialog.choose(tr("The cover of the album “{0}”").replace("{0}", name) + "\n\n" + tr("One of its takes' covers, square; Automatic: its first covers, as before."), items,
      { more: [{ label: tr("Automatic"), value: "__auto" }], cancel: "Cancel", filter: "Filter the takes" }).then(function (v) {
      if (!v) return;
      plOp({ op: "album-cover", album: name, take: v === "__auto" ? "" : v }, v === "__auto" ? tr("The album's cover: automatic") : tr("The album's cover chosen"));
    });
  }
  // HERESY 2058: the album tile a card is held over, lit
  function plDropMark(tl) {
    Array.prototype.forEach.call(document.querySelectorAll(".pl-album.is-drop"), function (x) { if (x !== tl) x.classList.remove("is-drop"); });
    if (tl) tl.classList.add("is-drop");
  }
  // HERESY 2058 (the audit: the tags' overlay closed only by its own button): closed by a click away and by Esc too, as the Studio's other overlays
  var plTagsWatched = false;
  function plTagsWatch() {
    if (plTagsWatched) return;
    plTagsWatched = true;
    document.addEventListener("mousedown", function (e) {
      Array.prototype.forEach.call(document.querySelectorAll(".pl-tags-pop:not([hidden])"), function (p) { if (!p.parentNode.contains(e.target)) p.hidden = true; });
    }, true);
    window.addEventListener("keydown", function (e) {
      var open = document.querySelectorAll(".pl-tags-pop:not([hidden])");
      if (e.key !== "Escape" || !open.length) return;
      e.preventDefault(); e.stopPropagation();
      Array.prototype.forEach.call(open, function (p) { p.hidden = true; });
    }, true);
  }
  function plWsCard(r) {
    var secs = r.takes.reduce(function (a, t) { return a + (+t.seconds || 0); }, 0), now = state.hooks.playing ? state.hooks.playing() : {};
    var mine = r.takes.some(function (t) { return t.name === now.name; }), on = mine && now.playing;
    return '<article class="pl-card pl-ws' + (mine ? " is-current" : "") + '" draggable="' + !r.inAlbum + '" data-pl="' + esc(r.name) + '">' +   // HERESY 2058: an album's in Everything stays put
      '<button type="button" class="pl-play' + (on ? " is-playing" : "") + '" data-pl-play="' + esc(r.name) + '" aria-label="' + (on ? "Pause" : "Play") + '">' + ico(on ? "pause" : "play") + "</button>" +
      '<div class="pl-main"><div class="pl-title" translate="no">\u25a6 ' + esc(r.ws) + "</div>" +
      '<div class="pl-meta"><span>' + r.takes.length + " " + (r.takes.length === 1 ? tr("take") : tr("takes")) + "</span> · <span>" + state.hooks.clock(secs) + "</span> · <span>" + tr("a whole workspace") + "</span></div>" +
      '<div class="pl-marks">' + (r.inAlbum ? '<span class="pl-in-album" translate="no" title="' + esc(tr("In the album “{0}”").replace("{0}", r.inAlbum)) + '">\u25a3 ' + esc(r.inAlbum) + "</span>"   // HERESY 2058
        : '<button type="button" class="pl-out" data-pl-out="' + esc(r.name) + '" title="' + esc(tr(plAlbumOpen() ? "Out of the album, whole (the workspace and its takes stay)" : "Out of the playlist, whole (the workspace and its takes stay)")) +
          '" aria-label="' + esc(tr(plAlbumOpen() ? "Out of the album, whole (the workspace and its takes stay)" : "Out of the playlist, whole (the workspace and its takes stay)")) + '">✕</button>') + "</div></div>" +
      '<div class="pl-cover"><span class="pl-nocover">' + ico("music") + "</span></div></article>";
  }
  function plCard(r) {
    if (r.ws) return plWsCard(r);                        // HERESY 2042
    var now = state.hooks.playing ? state.hooks.playing() : {}, mine = now.name === r.name, on = mine && now.playing, art = window.HeresyArt ? window.HeresyArt.url(r.name) : "";
    var mk = function (lit, icon, tip) { return '<span class="pl-mark' + (lit ? " is-on" : "") + '" title="' + esc(tip) + '">' + ico(icon) + "</span>"; };
    var when = state.hooks.when ? state.hooks.when(r.created, r.name) : "<span>" + esc(r.created ? state.hooks.ago(r.created, r.name) : "") + "</span>";
    return '<article class="pl-card' + (mine ? " is-current" : "") + '" draggable="' + !r.inAlbum + '" data-pl="' + esc(r.name) + '">' +   // HERESY 2050: an album's take in Everything stays put
      '<button type="button" class="pl-play' + (on ? " is-playing" : "") + '" data-pl-play="' + esc(r.name) + '" aria-label="' + (on ? "Pause" : "Play") + '">' + ico(on ? "pause" : "play") + "</button>" +
      '<div class="pl-main"><div class="pl-title" translate="no">' + esc(r.title) + "</div>" +
      '<div class="pl-meta">' + when + (r.seconds ? " · <span>" + state.hooks.clock(r.seconds) + "</span>" : "") + (r.cot ? " · <span>" + esc(cotWord(r.cot)) + "</span>" : "") + "</div>" +
      '<div class="pl-marks">' + mk(r.rating > 0, "like", "Liked") + mk(markOf(r.name, "fire"), "flame", "On fire") + mk(markOf(r.name, "gem"), "gem", "A gem") + mk(r.rating < 0, "dislike", "Disliked") + mk(favOf(r.name, r), "star", "Favourite") +
      mk(!!r.note, "note", r.note ? String(r.note).slice(0, 160) : "Without a note") +
      (r.inAlbum ? '<span class="pl-in-album" translate="no" title="' + esc(tr("In the album “{0}”").replace("{0}", r.inAlbum)) + '">\u25a3 ' + esc(r.inAlbum) + "</span>"   // HERESY 2050
        : '<button type="button" class="pl-out" data-pl-out="' + esc(r.name) + '" title="' + esc(plAlbumOpen() ? tr("Out of the album (the take stays)") : "Out of the playlist (the take stays)") + '" aria-label="' +
          esc(plAlbumOpen() ? tr("Out of the album (the take stays)") : "Out of the playlist (the take stays)") + '">✕</button>') + "</div></div>" +
      '<div class="pl-cover">' + (art ? '<img alt="" loading="lazy" src="' + esc(art) + '" />' : '<span class="pl-nocover">' + ico("music") + "</span>") + "</div></article>";
  }
  function plHtml() {
    var rows = plRows(), tags = state.plTags.length;
    return plAlbumsHtml() + '<div class="pl-head"><button type="button" class="btn small primary" data-pl-go="1"' + (rows.length ? "" : " disabled") + ">Play from the top</button>" +
      '<button type="button" class="btn ghost small" data-pl-shuffle="1"' + (rows.length > 1 ? "" : " disabled") + ' title="A deck\'s shuffle: every take to a new place">Shuffle the deck</button>' +
      '<label class="pl-only" title="Only the takes with this mark play; the playlist keeps every take"><span>Play only</span><select data-pl-only="1">' +   // HERESY 1814
      [["", "every take"], ["like", "Liked"], ["fire", "On fire"], ["gem", "A gem"], ["star", "Favourite"]].map(function (o) {
        return '<option value="' + o[0] + '"' + (state.plOnly === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select></label>" +
      '<span class="pl-tags-wrap"><button type="button" class="btn ghost small icon-btn pl-tags-btn' + (tags ? " is-on" : "") + '" data-pl-tags="1" aria-haspopup="dialog" aria-label="Tags" data-tip="' +   // HERESY 2050
        esc(tr("The tags of the styles here: a click filters the playlist by them, all ticked at once, and what plays with it")) + '"><svg viewBox="0 0 24 24" class="ui-ico" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12.6 2.6a2 2 0 0 0-1.4-.6H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.7 8.7a2.4 2.4 0 0 0 3.4 0l6.6-6.6a2.4 2.4 0 0 0 0-3.4z"/><circle cx="7.5" cy="7.5" r="1.2"/></svg>' + (tags ? '<b class="pl-tags-n mono">' + tags + "</b>" : "") + "</button>" +
        '<span class="pl-tags-pop" hidden></span></span>' +
      '<span class="pl-hint">Drag a take to its place; × takes it out of the playlist, never out of the library</span></div>' +
      (rows.length ? '<div class="pl-list">' + rows.map(plCard).join("") + "</div>"
        : '<p class="row-hint coll-empty">The playlist is empty: «Add to playlist» in a take\'s menu puts takes here</p>');
  }
  function plTagsHtml() {
    var list = plTags();
    if (!list.length) return '<span class="row-hint">' + esc(tr("No styles to read tags from here")) + "</span>";
    return list.map(function (t) { var on = state.plTags.indexOf(t[0]) >= 0; return '<button type="button" class="pl-tag' + (on ? " is-on" : "") + '" data-pl-tag="' + esc(t[0]) + '" translate="no">' + esc(t[0]) + ' <b class="mono">' + t[1] + "</b></button>"; }).join("") +
      (state.plTags.length ? '<button type="button" class="pl-tag pl-tag-clear" data-pl-tag="">' + esc(tr("Clear the tags")) + "</button>" : "");
  }
  function plHead() {                                    // the Librarian's heading, as for its other places
    // HERESY 2042: the takes it plays (a workspace's every one), the workspaces among them, the whole time
    var names = plList(), ws = ((plAlbumOpen() ? plAlbumOpen().items : state.playlist) || []).filter(plWs).length,   /* HERESY 2058: an album's whole workspaces too */ secs = names.reduce(function (a, n) { var r = rowOf(n); return a + (r ? +r.seconds || 0 : 0); }, 0);
    $("collWhere").innerHTML = " › <span>Playlist</span>" + (plAlbumOpen() ? ' › <span translate="no">' + esc(state.plAlbum) + "</span>" : "");   // HERESY 2050
    $("collNote").innerHTML = "<span>" + names.length + " takes</span>" + (ws ? " · <span>" + ws + " " + (ws === 1 ? tr("workspace") : tr("workspaces")) + "</span>" : "") +
      " · <span>" + state.hooks.clock(secs) + "</span>";
  }
  function plPaint() {                                   // paint() hands the place over here
    $("collGrid").className = "coll-grid pl-view";
    $("collGrid").innerHTML = plHtml();
    if ($("collMore")) $("collMore").hidden = true;      // the lazy rows of the place before stay out
    plBind($("collGrid"));
    plHead();
  }
  function plChanged(d, asked) {
    if (d) { state.playlist = d.playlist || []; if (d.albums) state.albums = d.albums; if (d.takes) state.rows = fresh(d.takes, asked); }   // HERESY 2050: and the albums
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
    plTagsWatch();                                     // HERESY 2058
    root.addEventListener("click", function (e) {
      var am = e.target.closest("[data-pl-album-menu]");   // HERESY 2058: an album tile's ⋯: rename, its cover, delete
      if (am) { e.preventDefault(); e.stopPropagation(); var ar = am.getBoundingClientRect(); plAlbumTileMenu(am.dataset.plAlbumMenu, ar.left, ar.bottom + 2); return; }
      var b = e.target.closest("[data-pl-play]"), out = e.target.closest("[data-pl-out]");
      if (b) { var pn = plFirst(b.dataset.plPlay); if (pn && state.hooks.playPlaylist) state.hooks.playPlaylist(pn); return; }   // HERESY 2042: a workspace from its first
      if (out) { var oa = plAlbumOpen(); plOp(oa ? { op: "album-remove", album: oa.name, names: [out.dataset.plOut] } : { op: "playlist-remove", names: [out.dataset.plOut] }); return; }   // HERESY 2050
      if (e.target.closest("[data-pl-go]")) { var first = plPlayOrder("")[0]; if (first && state.hooks.playPlaylist) state.hooks.playPlaylist(first, true); return; }   // HERESY 2050: the view's own
      var ab = e.target.closest("[data-pl-album]"), an = e.target.closest("[data-pl-album-new]"), tg = e.target.closest("[data-pl-tag]"), tb = e.target.closest("[data-pl-tags]");
      if (an) { plAlbumNew(null); return; }
      if (ab) { state.plAlbum = ab.dataset.plAlbum; state.plTags = []; store("yue2.plAlbum", state.plAlbum); plChanged(); return; }
      if (tb) { var pop = root.querySelector(".pl-tags-pop"); if (pop.hidden) { pop.innerHTML = plTagsHtml(); pop.hidden = false; } else pop.hidden = true; return; }
      if (tg) {
        var k = tg.dataset.plTag;
        state.plTags = k === "" ? [] : state.plTags.indexOf(k) >= 0 ? state.plTags.filter(function (x) { return x !== k; }) : state.plTags.concat([k]);
        plChanged();
        var pop2 = root.querySelector(".pl-tags-pop"); if (pop2) { pop2.innerHTML = plTagsHtml(); pop2.hidden = false; }
        return;
      }
      if (e.target.closest("[data-pl-shuffle]")) {
        var al = plAlbumOpen();
        if (al) { var sh = al.items.slice(); for (var i = sh.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), x2 = sh[i]; sh[i] = sh[j]; sh[j] = x2; } plOp({ op: "album-order", album: al.name, names: sh }, "Shuffled"); }
        else plOp({ op: "playlist-shuffle" }, "Shuffled");
      }
    });
    root.addEventListener("change", function (e) {        // HERESY 1814: «Play only», this viewer's own
      var x = e.target.closest && e.target.closest("[data-pl-only]");
      if (!x) return;
      state.plOnly = x.value;
      if (x.value) store("yue2.plOnly", x.value); else { try { localStorage.removeItem("yue2.plOnly"); } catch (y) { /* private */ } }
      plChanged();
    });
    root.addEventListener("contextmenu", function (e) {   // the take's own menu, as on its card
      var tile = e.target.closest("[data-pl-album-own]");   // HERESY 2050: an album's tile: rename, delete
      if (tile) { e.preventDefault(); plAlbumTileMenu(tile.dataset.plAlbum, e.clientX, e.clientY); return; }
      var card = e.target.closest(".pl-card[data-pl]");
      if (!card || !state.hooks.menu) return;
      e.preventDefault();
      state.hooks.menu(card.dataset.pl, e.clientX, e.clientY);
    });
    var drag = null, dropped = false, onTile = "";   // HERESY 2058: onTile, the album a card was let go on
    root.addEventListener("dragstart", function (e) {
      var card = e.target.closest && e.target.closest(".pl-card[data-pl]");
      if (!card) return;
      drag = card.dataset.pl; dropped = false;
      card.classList.add("is-dragging");
      // HERESY 2058b (the re-audit of 04.11.2026: a card dragged onto an album's tile with a real mouse did nothing): the drag allowed «move» alone while
      // the tile asks for «copy» (the take stays where it was and goes into the album too), and a browser drops only what the drag allows; both now
      e.dataTransfer.effectAllowed = "copyMove";
      try { e.dataTransfer.setData("text/plain", drag); } catch (x) { /* some browsers */ }
    });
    root.addEventListener("dragover", function (e) {
      var tl = drag && e.target.closest && e.target.closest("[data-pl-album-own]");   // HERESY 2058 (the audit: a card dragged onto an album's tile goes in)
      plDropMark(tl || null);
      if (tl) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; return; }
      if (!drag || !(e.target.closest && e.target.closest(".pl-list"))) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      var card = e.target.closest(".pl-card[data-pl]");
      if (!card || card.dataset.pl === drag) return;
      var box = card.getBoundingClientRect(), list = card.parentNode, moving = list.querySelector('.pl-card[data-pl="' + CSS.escape(drag) + '"]');
      if (moving) list.insertBefore(moving, e.clientY > box.top + box.height / 2 ? card.nextSibling : card);
    });
    root.addEventListener("drop", function (e) {
      if (!drag) return;
      e.preventDefault();
      var tl = e.target.closest && e.target.closest("[data-pl-album-own]");   // HERESY 2058: on an album's tile: into it, not a new order
      if (tl) onTile = tl.dataset.plAlbum; else dropped = true;
    });
    root.addEventListener("dragend", function (e) {
      if (!drag) return;
      var held = drag, into = onTile, inAl = plAlbumOpen();
      drag = null; onTile = ""; plDropMark(null);
      if (into) {                                      // HERESY 2058: let go on an album's tile: into that album, the list as it was
        plChanged();
        if (!inAl || inAl.name !== into) plOp({ op: "album-add", album: into, names: [held], where: "last" }, tr("Into the album “{0}”: {1}").replace("{0}", into).replace("{1}", 1));
        return;
      }
      var list = root.querySelector(".pl-list"), pl = state.playlist || [];
      if (!list || !dropped) { plChanged(); return; }   // let go outside the list (or Esc): back where it was
      var order = Array.prototype.map.call(list.querySelectorAll(".pl-card[data-pl]"), function (x) { return x.dataset.pl; });
      Array.prototype.forEach.call(list.querySelectorAll(".is-dragging"), function (x) { x.classList.remove("is-dragging"); });
      var oal = plAlbumOpen();                          // HERESY 2050: an album's own order; in Everything the playlist's own (an album's takes stay put)
      if (oal) { if (order.join("\n") !== oal.items.join("\n") && !state.plTags.length) plOp({ op: "album-order", album: oal.name, names: order }); return; }
      order = order.filter(function (n) { return pl.indexOf(n) >= 0; });
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
  var NOTE_ICE = "Frozen with its workspace: its note is read, never changed (unfreeze the workspace first)";   // HERESY 2128
  // HERESY 2128 (the audit of 06.11.2026): a refusal said, and the window opened again with the text as typed (it was lost with the window); a frozen
  // take's note is not offered to change (the lab refuses it)
  function editNote(name, title, typed) {             // the same window as the menu's «Note…», its text 2 pt larger
    if (!window.HeresyDialog) return Promise.resolve();
    var had = note(name), h = state.hooks || {}, t = h.findTake ? h.findTake(name) : null, r = rowOf(name);
    if (r && r.frozen) { toast(NOTE_ICE, true); return Promise.resolve(); }
    return window.HeresyDialog.prompt("A note on “" + (title || (t && (t.title || t.name)) || name) + "”\n\nEmpty removes it.", typed !== undefined ? typed : had,
      { ok: "Keep the note", max: 600, area: true, rows: 6, cls: "hd-note" }).then(function (v) {
      if (v === null || v === had) return;
      return setNote(name, v).catch(function (e) {
        toast("Not saved: " + ((e && e.message) || String(e)), true);
        return editNote(name, title, v);
      });
    });
  }
  // HERESY 1044: a note on a take (the take card edits it)
  function note(name) { var r = rowOf(name); return r ? r.note || "" : ""; }
  // HERESY 2128 (the audit of 06.11.2026): a note on its way is held against every list older than the lab's answer (fresh), and once answered it is
  // held as the marks are (1802), so a 👍 asked before it and answered after it never puts the old note back. The answer that is not the last one
  // sent for the take does neither. A refusal still goes to the caller (the sheet, the take's head, the compare's note say it)
  function setNote(name, text, keep) {                 // keep (HERESY 2158): with keepalive, the page going hidden
    var p = notePend[name] || (notePend[name] = {}), n = noteSent[name] = (noteSent[name] || 0) + 1, asked = rateSeq;
    var last = function () { return noteSent[name] === n; }, done = function () { var q = notePend[name]; if (last() && q && !q.timer) delete notePend[name]; };
    p.text = text;                                     // a sheet's timer still waiting sends the newest text when it fires
    p.flight = api("/collection", { op: "note", names: [name], text: text }, keep).then(function (d) {
      if (last()) hold(name, "note", text);
      done();
      state.rows = d.takes ? fresh(d.takes, asked) : state.rows; paint();
    }, function (e) { done(); throw e; });
    return p.flight;
  }
  // the sheet's note: its own timer a take (a key in another take's sheet cancels nothing), sent at once when the sheet closes, gives way to
  // another take's, or a 👍, 👎, ⭐ or a rename is clicked in it
  function noteSay(name, text, bad) {
    var el = $("sheetNoteState");
    if (sheetName !== name || !el) return;
    el.textContent = text;
    el.classList.toggle("is-bad", !!bad);
  }
  // HERESY 2128 (the audit of 06.11.2026: «Отказ сохранить заметку проглатывается»): a refusal (a frozen take, a read-only window, the lab away) is
  // said where the note was typed, and once by a toast; the status no longer stays «…» for ever
  var noteBad = {};
  function noteSave(name, text, keep) {
    noteSay(name, "…");
    return setNote(name, text, keep).then(function () {
      delete noteBad[name];
      if (!(notePend[name] && notePend[name].timer)) noteSay(name, "saved");
      return true;
    }, function (e) {
      var why = (e && e.message) || String(e), r = rowOf(name);
      if (keep) noteJournal("failed", 1, why);         // HERESY 2158: sent as the page went hidden, refused
      noteSay(name, "not saved: " + why, true);
      if (!noteBad[name] || sheetName !== name) toast("The note on \u201c" + (r ? r.title : name) + "\u201d is not saved: " + why, true);
      noteBad[name] = 1;
      return false;
    });
  }
  function noteQueue(name, text) {
    var p = notePend[name] || (notePend[name] = {});
    clearTimeout(p.timer);
    p.text = text;
    noteSay(name, "…");
    p.timer = setTimeout(function () { var q = notePend[name] || p; q.timer = 0; noteSave(name, q.text); }, 900);
  }
  function noteFlush(name, keep) {
    var p = notePend[name];
    if (!p) return Promise.resolve(true);
    if (p.timer) { clearTimeout(p.timer); p.timer = 0; return noteSave(name, p.text, keep); }
    return p.flight ? p.flight.then(function () { return true; }, function () { return false; }) : Promise.resolve(true);
  }
  // HERESY 2158 (the audit's review of 2128, 06.11.2026): a note typed within its 0.9 s before an F5 or a closed tab was lost with its timer. The page
  // going hidden sends every note still waiting at once, with keepalive (the page lives on: its answer is read as ever); the page going away (pagehide,
  // which comes first on a reload) sends them by sendBeacon. The beacon names no page instance: a keepalive write that named it would reach the lab
  // after the lease's own release, and the lab gives a free lease to whoever writes (lease.py), so the reloaded page would find its own dead
  // instance holding it; a read-only window sends nothing (2081). What went is kept on this device by a hash of its text (ruach.notesLeft, never
  // mirrored), and the next load reads the lab: a note that is not there, or a beacon the browser would not queue, is said in the debug journal
  var LEFT_KEY = "ruach.notesLeft";
  function noteHash(t) { var h = 2166136261; t = String(t || ""); for (var i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h.toString(36) + "." + t.length; }
  function noteJournal(what, n, why) {
    var D = window.HeresyDebug;
    if (!D || !D.note) return;
    D.note({ k: "note-flush", what: what, n: n, why: String(why || "").slice(0, 120) });   // never the note's words nor the take's name
    if (what !== "failed" && D.flush) D.flush();
  }
  function notesLeaving() {
    var L = window.ruachLease, mine = !L || !L.mayWrite || L.mayWrite(), left = {}, unsent = 0;
    Object.keys(notePend).forEach(function (name) {
      var p = notePend[name];
      if (!p || !p.timer) return;                      // on its way already (its keepalive or the sheet's own), or answered
      clearTimeout(p.timer); p.timer = 0;
      var ok = false;
      try {
        ok = mine && !!navigator.sendBeacon && navigator.sendBeacon("/lab/collection",
          new Blob([JSON.stringify({ op: "note", names: [name], text: p.text })], { type: "application/json" }));
      } catch (e) { ok = false; }
      left[name] = { h: noteHash(p.text), sent: ok, ro: !mine };
      if (!ok) unsent++;
    });
    if (!Object.keys(left).length) return;
    store(LEFT_KEY, JSON.stringify({ at: Date.now(), notes: left }));
    if (unsent) noteJournal(mine ? "not queued" : "read-only", unsent, mine ? "sendBeacon queued nothing as the page went" : "a read-only window sends no write");
  }
  function notesLeftCheck(rows) {                      // the next load: what went as the last page went, held to the lab's answer
    var raw = recall(LEFT_KEY), rec = null;
    if (!raw) return;
    try { localStorage.removeItem(LEFT_KEY); } catch (e) { /* private */ }
    try { rec = JSON.parse(raw); } catch (e) { rec = null; }
    if (!rec || !rec.notes || typeof rec.notes !== "object") return;
    var by = {}, lost = 0, unsent = 0;
    (rows || []).forEach(function (r) { by[r.name] = r; });
    Object.keys(rec.notes).forEach(function (name) {
      var x = rec.notes[name] || {};
      if (!x.sent) { unsent++; return; }
      if (!by[name] || noteHash(by[name].note || "") !== x.h) lost++;
    });
    if (unsent) noteJournal("not sent", unsent, "the last page went with a note it could not send");
    if (lost) noteJournal("not on the lab's disk", lost, "a note sent as the last page went is not what the lab holds");
  }
  window.addEventListener("pagehide", notesLeaving);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState !== "hidden") return;
    Object.keys(notePend).forEach(function (name) { if (notePend[name] && notePend[name].timer) noteFlush(name, true); });
  });

  // for the takes column: hidden ones stay out of it
  function isHidden(name) { var r = rowOf(name); return !!(r && r.hidden); }
  // HERESY 1162 (Viktor: «снимать её при первом же проигрывании трека»): the first play takes a take's freshness off
  function isFresh(name) { var r = rowOf(name); return !!(r && r.fresh); }
  function markPlayed(name) {
    var r = rowOf(name);
    if (!r || !r.fresh) return;
    r.fresh = false;
    Array.prototype.forEach.call(document.querySelectorAll('.is-fresh[data-name="' + (window.CSS && CSS.escape ? CSS.escape(name) : name) + '"]'),
      function (el) { el.classList.remove("is-fresh"); });
    api("/collection", { op: "played", names: [name] }).catch(function () { r.fresh = true; });
  }

  window.HeresyCollection = { init: init, reload: load, hubOpen: hubOpen, repaint: paint, paintArts: paintArts, isHidden: isHidden, isFresh: isFresh, markPlayed: markPlayed, takeLocked: takeLocked, cardExtras: cardExtras, matcher: matcher, landed: landed, inCurrent: inCurrent,
                              current: function () { return currentIn("creator"); }, currentIn: currentIn, realm: realmNow, /* HERESY 2294: the Creator's own in hand */ landable: landable, closedWs: closedWs, firstWs: firstWs, absent: function () { return state.loadStatus === 404; }, readFailed: function () { return state.loadStatus === 404 ? "" : state.loadError || ""; }, chooseCurrent: chooseCurrent, setCurrent: setCurrent, rating: rating, rate: rate, rateMany: rateMany, favMany: favMany, exportChecked: exportZip, exportHow: exportHow, note: note, setNote: setNote, editNote: editNote, playlist: function () { return (state.playlist || []).slice(); }, playlistOrder: plPlayOrder, playlistOnly: function () { return state.plOnly; }, playlistAdd: plAdd, openPlaylist: plOpen, paintPlaying: paintPlaying, loaded: function () { return state.loaded; },
                              order: function () { return state.place === "__trash" ? [] : state.place === "__playlist" ? plList() : shown().map(function (r) { return r.name; }); },
                              deal: function (names) { if (!names) { DEAL = {}; return []; } return names.slice().sort(function (x, y) { return dealt(x) - dealt(y); }); },   // HERESY 1863: for the checks
                              notesLeft: notesLeftCheck, noteHash: noteHash,   // HERESY 2158: for the checks
                              datasheet: openDatasheet, sung: sungMany, sungOf: function (n) { return (state.sung || {})[n]; }, sungMark: sungMark, tailOf: function (n) { return (state.tail || {})[n] || null; }, tailMark: tailMark, modelLine: modelLine, reveal: function (name) { return (state.loaded ? Promise.resolve() : load()).then(function () { reveal(name); }); },
                              row: rowOf, workspaces: function () { return state.ws.slice(); }, act: act, openSheet: openSheet, requestOf: requestOf, fitHead: fitHead, matcher: matcher,   // 2028: for the checks   // 2023: fitHead for the checks
                              selected: names, place: function () { return state.place; }, moveTo: moveTo,
                              albumMenu: plAlbumMenu, albums: function () { return (state.albums || []).map(function (a) { return a.name; }); }, plTags: plTags,   // HERESY 2050
                              idQuery: idQuery, plRootCount: plRootCount, plTagOk: plTagOk, tagsOn: function (t) { if (t) state.plTags = t.slice(); return state.plTags.slice(); },   // HERESY 2058: for the checks
                              markFavorite: markFavorite, markBtns: markBtns, markOf: markOf, isBlind: isBlind, paintMarks: paintMarks, reactBtn: reactBtn, reactOf: reactOf, setReact: setReact, reactClose: reactClose, REACTS: REACTS,   // HERESY 1802
                              pinned: function (name) { return ((state.pins || {})[state.place] || []).indexOf(name) >= 0; }, pin: pin,
                              pinPlaces: pinPlaces, unpinAll: unpinAll, pinTarget: pinTarget, pinIn: pinIn,   // HERESY 1167
                              isFrozen: function (name) { var r = rowOf(name); return !!(r && r.frozen); },   // HERESY 1166
                              isProtected: isProtected, protect: protect, protectMany: protectMany, protTip: function (on) { return on ? PROT_ON : PROT_OFF; },   // HERESY 1368
                              undoable: undoable, untrash: untrash, guard: guarded,   // HERESY 1474: the take's menu asks as the bar does
                              trash: function (names) { return api("/trash", { op: "move", names: names }).then(function (d) { saidProtected(d); saidSkipped(d); if (d && d.locked && d.locked.length) toast(d.locked.length + " stayed: their workspace locks its takes", true); ((d && d.moved) || names).forEach(function (n) { delete state.sel[n]; }); return load().then(function () { return d; }); }); },
                              // HERESY 1169 · 1239 (Viktor 08.10.2026: «Я переместил в корзину три трека, а блок так и остался раскрытым, и не исчез обратно в "тень"»): what the menu sends away leaves the choice, as with the bar's own buttons
                              unselect: function (names) { (names || []).forEach(function (n) { delete state.sel[n]; }); paint(); } };
})();
