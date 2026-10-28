/* YuE2 Console for the C++ server — client. The same page as the PyTorch
   console: runs are followed through the server's own log stream, finished
   songs come from its library on disk. */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var all = function (selector, root) { return Array.prototype.slice.call((root || document).querySelectorAll(selector)); };

  /* ------------------------------------------------------------ JSON + seeds */
  // Seeds are 63-bit integers. A browser number keeps 53 bits, so inside the
  // page they are digit strings, and on the wire they go back to bare integers.
  var SEED_IN = /("(?:lm_seed|seed)"\s*:\s*)(-?\d+)(?=\s*[,}\]])/g;
  var SEED_OUT = /("(?:lm_seed|seed)"\s*:\s*)"(-?\d+)"/g;

  function parseJSON(text) { return JSON.parse(String(text).replace(SEED_IN, '$1"$2"')); }
  function toJSON(value, indent) { return JSON.stringify(value, null, indent).replace(SEED_OUT, "$1$2"); }

  function api(path, options) {
    return fetch(path, options).then(function (r) {
      return r.text().then(function (text) {
        var body = null;
        if (text) { try { body = parseJSON(text); } catch (error) { body = null; } }
        if (!r.ok) {
          var failure = new Error((body && (body.error || body.detail)) || (r.status + " " + r.statusText));
          failure.status = r.status;
          throw failure;
        }
        return body;
      });
    });
  }

  function post(path, value) {
    var options = { method: "POST" };
    if (value !== undefined) {
      options.headers = { "Content-Type": "application/json" };
      options.body = toJSON(value);
    }
    return api(path, options);
  }

  var STATE = {
    props: null,
    defaults: {},
    vaes: [],
    defaultVae: "standard",
    sliderCatalog: [],
    maxBatch: 1,
    transcriber: false,
    library: true,
    online: false,
    takes: [],          // the library, newest first (plus takes kept in this tab)
    session: [],        // takes kept in this tab when the server has no library
    take: null,         // the take being inspected
    requests: {},       // replay requests by take name
    noRequest: {},      // takes whose saved request could not be read
    peakCache: {},      // waveform peaks by audio url
    peakLoading: {},
    peaks: null,
    jobs: [],           // every run this page knows about
    job: null,          // the run shown in the take column
    running: null,      // the live run, even while a finished take is open
    sliderChoice: [],
    codes: null,        // a take's music codes loaded into the form
    favOnly: false,
    abcRendered: ""
  };

  var SAMPLER_KNOBS = [
    ["temperature", "Temperature", 0.05],
    ["top_p", "Top-p", 0.01],
    ["top_k", "Top-k", 1],
    ["repetition_penalty", "Repetition penalty", 0.005],
    ["penalty_window", "Penalty window", 1],
    ["min_tokens", "Min tokens", 1],
    ["max_tokens", "Max tokens", 100]
  ];

  // The fallbacks are the protocol's own values; /props replaces them.
  var PROTOCOL_DEFAULTS = {
    cot: "full", duration: 480, steps: 32, peak_clip: 10, mp3_bitrate: 128, output_format: "wav24",   // HERESY 1413: the engine's own default
    // HERESY 1031: Viktor's stable set, as the engine now has it
    // HERESY 1088: floors as fuses: a score not under 200 tokens, the music not under 750 (30 s)
    abc_sampling: { temperature: 0.95, top_p: 0.95, top_k: 50, repetition_penalty: 1.005, penalty_window: 100, min_tokens: 200, max_tokens: 6144 },
    semantic_sampling: { temperature: 0.9, top_p: 0.95, top_k: 100, repetition_penalty: 1.3, penalty_window: 100, min_tokens: 750, max_tokens: 12000 }
  };

  var FRAME_RATE = 25;    // music tokens per second of audio

  var VAE_NOTES = { standard: "best sound", legacy: "benchmark" };
  // what each VAE is, on hover (the repo follows on its own line)
  var VAE_TIPS = {
    standard: "Standard: the quality choice, and the newer model. The current official decoder and the default, the cleanest sound.",
    legacy: "Legacy: the older official decoder. The published benchmark scores were made with it; less clean than Standard, and some hear it as more musical.",
    blend: "Blend: a mix of the two official decoders, \u2154 Standard and \u2153 Legacy (a community weight mix, not newly trained)."
  };
  var VAE_NOTES_LONG = {
    standard: "stock: current official, best sound",
    legacy: "stock: older official, used for the published scores",
    blend: "add-on: a community mix, \u2154 Standard + \u2153 Legacy"
  };
  var FORMAT_LABELS = { wav24: "WAV 24-bit", wav16: "WAV 16-bit", wav32: "WAV 32-bit float", mp3: "MP3" };
  var MODES = { full: "Full plan", melody: "Melody only", off: "Direct" };

  // Short original examples for "Supply your own score": an eight-bar melody
  // for the City Lights words, and the same with chords (HERESY 1167: the jazz one gone, Viktor: «Это никому не нужно»).
  var ABC_HEAD = 'X:1\nT:\nM:4/4\nL:1/16\nQ:1/4=88\nV: Vocal clef=treble name="Vocal Melody" snm="Vocal"\n' +
                 'V: Ins clef=treble name="Ins Melody" snm="Inst."\nK:C\n';
  function exampleScore(v1, v2, v3, v4, c1, c2, c3, c4) {
    return ABC_HEAD + "% verse\nV: Vocal\n" +
      v1 + "E2G2A2G2E2D2C4|" + v2 + "D2E2G2E2D2C2D4|" + v3 + "E2G2A2c2B2A2G4|" + v4 + "F2E2D2E2G2E2C4|\nV: Ins\nZ4|\n" +
      "% chorus\nV: Vocal\n" +
      c1 + "G2A2c2B2A2G2E4|" + c2 + "F2A2G2E2D2E2G4|" + c3 + "A2c2B2A2G2E2D4|" + c4 + "E2G2A2G2E2D2C4|\nV: Ins\nZ4|\n";
  }
  var EXAMPLE_ABC = {
    melody: exampleScore("", "", "", "", "", "", "", ""),
    score: exampleScore('"C"', '"G"', '"Am"', '"F"', '"C"', '"F"', '"G"', '"C"')
  };

  /* ------------------------------------------------------------ helpers */

  function clock(seconds) {
    if (!isFinite(seconds) || seconds < 0) seconds = 0;
    var m = Math.floor(seconds / 60), s = Math.floor(seconds % 60);
    return m + ":" + (s < 10 ? "0" : "") + s;
  }

  function ago(epoch) {
    var d = (Date.now() / 1000) - epoch;
    if (d < 60) return "just now";
    if (d < 3600) return Math.floor(d / 60) + " min ago";
    if (d < 86400) return Math.floor(d / 3600) + " h ago";
    return new Date(epoch * 1000).toLocaleDateString(loc());   // HERESY 1165, 1166: the page's language
  }

  // HERESY 1720 (Viktor 22.10.2026: «время создания трека по идее флип карточки сделать… Дефолт пусть будет как есть сейчас - как давно»): a take's
  // time as Engine › Appearance › Take time says, how long ago (the default) or its exact date and time; a click on a card's flips that take's
  var whenFlip = {};
  function exactTime(epoch) {
    return new Date(epoch * 1000).toLocaleString(loc(), { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  }
  function whenExact(name) { return (savedLook().when === "exact") !== !!(name && whenFlip[name]); }
  function takeTime(epoch, name) { return !epoch ? "" : whenExact(name) ? exactTime(epoch) : ago(epoch); }
  function whenHtml(epoch, name) {                      // a card's time: the one the setting says, the other in its tip, a click flips it
    if (!epoch) return "<span></span>";
    var x = whenExact(name);
    return '<span class="when" data-when="' + epoch + '" data-when-name="' + escape(name || "") + '" data-tip="' + escape(tr(x ? ago(epoch) : exactTime(epoch))) + '">' +
      escape(tr(x ? exactTime(epoch) : ago(epoch))) + "</span>";
  }
  function repaintWhen(name) {
    document.querySelectorAll(".when[data-when]").forEach(function (el) {
      if (name && el.dataset.whenName !== name) return;
      var e = +el.dataset.when, x = whenExact(el.dataset.whenName);
      el.textContent = tr(x ? exactTime(e) : ago(e));
      el.dataset.tip = tr(x ? ago(e) : exactTime(e));
    });
  }
  document.addEventListener("click", function (e) {    // before the card's own click: the time flips, the card does not open or play
    var w = e.target && e.target.closest ? e.target.closest(".when[data-when]") : null;
    if (!w) return;
    e.preventDefault();
    e.stopPropagation();
    var n = w.dataset.whenName;
    whenFlip[n] = !whenFlip[n];
    repaintWhen(n);
  }, true);
  window.ruachTakeTime = takeTime; window.ruachWhenHtml = whenHtml;   // for the checks

  function toast(message, kind) {
    var el = document.createElement("div");
    el.className = "toast" + (kind ? " " + kind : "");
    el.textContent = message;
    $("toasts").appendChild(el);
    setTimeout(function () {
      el.style.transition = "opacity .3s ease";
      el.style.opacity = "0";
      setTimeout(function () { el.remove(); }, 320);
    }, kind === "bad" ? 13000 : 9200);   // HERESY 1026: five seconds more to read
  }

  // HERESY 1166: a text the code glues from words, names and numbers is translated piece by piece where it is made (the
  // page's translator matches whole texts); what is drawn so is drawn again when the language changes (below)
  function tr(s) { return window.RuachI18n ? window.RuachI18n.t(s) : s; }

  // HERESY 1168 (Viktor 06.10.2026: «Кнопка копирования в буфер не копирует стиль и карты трека… И из Prompt тоже»): the
  // studio is opened by the machine's address (http://192.168.…), which is no secure context, and there the browser gives
  // no navigator.clipboard: every copy button threw before it copied, silently. The old way stands in for it there (and is
  // the page's own, ruachCopyText): the text in a hidden box, selected, copied, the focus given back where it was.
  window.ruachCopyText = function (text) {
    return new Promise(function (ok, no) {
      var was = document.activeElement, area = document.createElement("textarea"), done = false;
      area.value = String(text);
      area.setAttribute("readonly", "");
      area.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
      document.body.appendChild(area);
      area.select();
      try { done = document.execCommand("copy"); } catch (e) { done = false; }
      area.remove();
      if (was && was.focus) was.focus({ preventScroll: true });
      if (done) ok(); else no(new Error("The browser refused to copy"));
    });
  };
  if (!(navigator.clipboard && navigator.clipboard.writeText)) {
    try { Object.defineProperty(navigator, "clipboard", { value: { writeText: window.ruachCopyText }, configurable: true }); } catch (e) { /* left as it is */ }
  }
  function loc() { return window.RuachI18n ? window.RuachI18n.locales() : undefined; }   // HERESY 1166: numbers and dates as the page's language writes them
  window.addEventListener("ruach-lang", function () {
    try {
      paintAllRuns();
      if (STATE.take) paintTakeHead();
      paintCardFolds();
      paintOutput();
      paintSliders();
      paintComputeHint();
      all("[data-fold]").forEach(function (block) { if (block.querySelector(":scope > .label > .fold-peek")) paintFold(block); });
    } catch (e) { /* the page not built yet: it paints in the language anyway */ }
  });

  var toasted = {};
  function toastOnce(key, message, kind) {
    if (toasted[key]) return;
    toasted[key] = true;
    toast(message, kind);
  }

  function escape(text) {
    return String(text).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function basename(path) { return String(path || "").split(/[\\/]/).pop(); }
  function round(value, digits) { return Number(Number(value).toFixed(digits)); }

  function slug(text) {
    return String(text || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "song";
  }

  function downloadText(name, text, type) {
    var link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([text], { type: type }));
    link.download = name;
    document.body.appendChild(link);
    link.click();
    setTimeout(function () { URL.revokeObjectURL(link.href); link.remove(); }, 1000);
  }

  function store(key, value) {
    try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch (error) { /* private mode */ }
    // HERESY 1168 (Viktor: «Play new takes вроде бы как перестал работать»): the settings file heard of a change only every
    // 4 s; a setting turned back on (its key removed) and an F5 within them, and the file gave the old «off» back. Now the
    // change goes out at once (a fifth of a second, for a burst of them)
    if (window.HeresySettings) { clearTimeout(store.soon); store.soon = setTimeout(function () { window.HeresySettings.flush(); }, 150); }
  }
  function recall(key) {
    try { return localStorage.getItem(key); } catch (error) { return null; }
  }

  function randomSeed63() {
    var words = new Uint32Array(2);
    crypto.getRandomValues(words);
    return ((BigInt(words[0] & 0x7fffffff) << BigInt(32)) | BigInt(words[1])).toString();
  }

  /* --------------------------------------------------------------- views */
  /* Compose and the running take share the screen, so the only thing that
     shows and hides is the engine panel. */

  // HERESY 1166 (Viktor: «Когда страничка Engine выведена в фокус, единственная возможность уйти с неё, либо кнопка «Назад к
  // сочинению», либо F5. Добавь кликание по бару Студии… если в GPU что-то изменил, но не сохранил, требовать в попап диалоге
  // действие — сохранить/игнорировать»): every way out of the Engine page (a room in the bar, the logo, Back, Esc, its own
  // button) goes through here; GPU roles changed and not saved are saved or put back first, the dialog answered by one of
  // the two. True when the page is gone.
  function leaveEngine() {
    var v = $("view-engine"), G = window.HeresyGpus;
    if (v.classList.contains("is-hidden")) return Promise.resolve(true);
    var ask = G && G.unsaved && G.unsaved()
      ? window.HeresyDialog.confirm("The GPU roles changed and are not saved\n\nSave them, or leave the cards as they were.",
          { ok: "Save", cancel: "Ignore", must: true }).then(function (save) { if (save) return G.save(); G.reset(); return true; })
      : Promise.resolve(true);
    return ask.then(function (ok) { if (ok) v.classList.add("is-hidden"); return ok; });
  }

  // HERESY 1450 (Viktor 14.10.2026: «Единой тематики блоки в единую вкладку. Отсортировать позиции по интуитивному движению с
  // начала в конец»): the Engine's cards by theme, a tab each theme, in the order one goes through them: the server and its
  // log, the machine, the models, the rooms' helpers, where the work lives and who may open it, the look, the updates. One
  // tab's cards are shown, the rest stay in the page (their code runs as before); a card no tab names shows with the last
  var ENGINE_TABS = { server: ["eg-server", "eg-log"], machine: ["eg-hardware", "eg-compute", "eg-gpus", "eg-midi"], models: ["eg-models", "eg-vae", "eg-loras"], creator: ["eg-creator"],
    rooms: ["eg-writer", "eg-art"], refiner: ["eg-refiner"], places: ["eg-folders", "eg-access", "eg-c2pa"], look: ["eg-look"], about: ["eg-updates", "eg-about"] };
  function engineTabOf(card) {
    for (var k in ENGINE_TABS) if (ENGINE_TABS[k].some(function (c) { return card.classList.contains(c); })) return k;
    return "about";
  }
  function engineTab(name, focus, quiet) {
    if (!ENGINE_TABS[name]) name = "server";
    all("#engineTabs [data-etab]").forEach(function (b) {
      var on = b.dataset.etab === name;
      b.setAttribute("aria-selected", on ? "true" : "false");
      b.tabIndex = on ? 0 : -1;
      if (on && focus) b.focus();
    });
    all("#view-engine .engine-grid > .card").forEach(function (c) { c.classList.toggle("is-tab-off", engineTabOf(c) !== name); });
    $("view-engine").dataset.etab = name;
    $("view-engine").querySelector(".engine-grid").scrollTop = 0;
    if (!quiet) store("yue2.engineTab", name);
    if (name === "server") scrollLogToEnd();
  }
  window.ruachEngineTab = function (where) {   // a tab by its name, or the tab of the card an element sits in
    var card = where && where.closest ? where.closest("#view-engine .engine-grid > .card") : null;
    engineTab(card ? engineTabOf(card) : where);
  };
  (function () {
    var bar = $("engineTabs");
    if (!bar) return;
    bar.addEventListener("click", function (e) { var b = e.target.closest("[data-etab]"); if (b) engineTab(b.dataset.etab); });
    bar.addEventListener("keydown", function (e) {
      var tabs = all("#engineTabs [data-etab]"), i = tabs.indexOf(document.activeElement), j = -1;
      if (i < 0) return;
      if (e.key === "ArrowDown" || e.key === "ArrowRight") j = (i + 1) % tabs.length;
      else if (e.key === "ArrowUp" || e.key === "ArrowLeft") j = (i - 1 + tabs.length) % tabs.length;
      else if (e.key === "Home") j = 0;
      else if (e.key === "End") j = tabs.length - 1;
      if (j < 0) return;
      e.preventDefault();
      engineTab(tabs[j].dataset.etab, true);
    });
    engineTab(recall("yue2.engineTab") || "server", false, true);
  })();
  // HERESY 1450: a click on the dimmed room around the Engine closes it, as Esc does
  $("view-engine").addEventListener("click", function (e) { if (e.target === this) leaveEngine(); });

  function show(view) {
    if (view === "engine") {
      if (!$("view-engine").classList.contains("is-hidden")) return void leaveEngine();
      $("view-engine").classList.remove("is-hidden");
      if (window.ruachPaintDefaults) window.ruachPaintDefaults();   // HERESY 1804: the defaults as they stand now
      engineTab($("view-engine").dataset.etab || recall("yue2.engineTab") || "server", false, true);   // HERESY 1450: the tab it was left on
      scrollLogToEnd();
      if (window.HeresyPlaces) window.HeresyPlaces.load();   // HERESY 1283: the Folders card asks the lab when the page is seen
      if (window.HeresyWeights) window.HeresyWeights.load(); // HERESY 1289: and the Models and LoRAs card
    } else if (view === "take") {
      $("view-engine").classList.add("is-hidden");
      drawWave();
      if (window.innerWidth <= 1150) $("view-take").scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (view === "compose" && document.body.dataset.frame) {
      frameOver("compose");   // HERESY 1168: what brings the form forward brings its frame over the room
    }
  }

  $("engineToggle").addEventListener("click", function () { show("engine"); });
  $("engineBack").addEventListener("click", function () { leaveEngine(); });
  var brandMark = document.querySelector(".brand");                  // HERESY 1166: the logo in the bar leaves it too
  if (brandMark) brandMark.addEventListener("click", function () { leaveEngine(); });

  function closeMenus() {
    all(".menu-pop").forEach(function (menu) { menu.classList.add("is-hidden"); });
    all("[aria-haspopup]").forEach(function (button) { button.setAttribute("aria-expanded", "false"); });
  }

  function menuToggle(buttonId, menuId) {
    $(buttonId).addEventListener("click", function (event) {
      event.stopPropagation();
      var menu = $(menuId), opening = menu.classList.contains("is-hidden");
      closeMenus();
      if (opening) {
        menu.classList.remove("is-hidden");
        // HERESY 1432: no room under it (the takes' ⋯ low on the page, over the player): it opens upwards
        menu.classList.remove("is-up");
        var mr = menu.getBoundingClientRect(), bar = $("playbar"), floor = bar && bar.getClientRects().length ? Math.min(window.innerHeight, bar.getBoundingClientRect().top) : window.innerHeight;
        if (mr.bottom > floor - 4 && this.getBoundingClientRect().top - mr.height - 10 >= 0) menu.classList.add("is-up");
        this.setAttribute("aria-expanded", "true");
        var first = menu.querySelector("button");
        if (first) first.focus();
      }
    });
  }
  // HERESY 1092: the rest of the bar behind the ☰. Not a .menu-pop: its own menus (examples, the themes)
  // open inside it, and closeMenus() would close it under them; it closes on a click outside or Esc
  (function () {
    var btn = $("headMore"), pop = $("headMorePop");
    if (!btn || !pop) return;
    function close() { pop.classList.add("is-hidden"); btn.setAttribute("aria-expanded", "false"); }
    btn.addEventListener("click", function (event) {
      event.stopPropagation();
      var open = pop.classList.toggle("is-hidden") === false;
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });
    document.addEventListener("click", function (event) {
      if (pop.classList.contains("is-hidden") || pop.contains(event.target) || event.target === btn) return;
      if (event.target.closest && event.target.closest(".theme-popup")) return;
      close();
    });
    document.addEventListener("keydown", function (event) { if (event.key === "Escape") close(); });
    ["openPrompt", "unloadModel", "engineToggle", "dawOpen"].forEach(function (id) { var b = $(id); if (b) b.addEventListener("click", function () { setTimeout(close, 0); }); });
    pop.addEventListener("click", function (event) { if (event.target.closest("#exampleMenu [data-example]")) setTimeout(close, 0); });
  })();
  menuToggle("savePrompt", "saveMenu");
  menuToggle("libMenuBtn", "libMenu");
  // HERESY 1149 (Viktor, 03.10.2026: «даже при 1920×1080 WORKSPACE упирается в лого»): the bar breathes by what it holds,
  // not by the window's width alone (a workspace's long name made the difference): when its right side comes within 18 px
  // of the centred logo, the word WORKSPACE goes first, then the workspace box narrows; the logo loses its words at 1659 px
  function fitBar() {
    var bar = document.querySelector(".topbar"), logo = document.querySelector(".topbar .brand"), ws = document.querySelector(".topbar .ws-current");
    if (!bar || !logo || !ws) return;
    bar.classList.remove("ws-tight", "ws-tighter");
    ws.style.removeProperty("--ws-shift");             // HERESY 1632: measured where the flow puts it, then moved (centreWs)
    // HERESY 1493: with the buttons a step larger (his +2 pt by default) the bar at ~1100 px ran onto a second row: the workspace box
    // narrows first, as it does by the logo
    var acts = bar.querySelector(".head-actions");
    if (acts && acts.getBoundingClientRect().width && acts.getBoundingClientRect().top >= ws.getBoundingClientRect().bottom - 2) { bar.classList.add("ws-tight", "ws-tighter"); return; }
    // HERESY 1169 (Viktor: «… Библиотекарь ЛОГО Trainer»): the Trainer's pill stands right of the tall bar's logo (app.css),
    // by the logo's proportions in the page's language; the workspace then meets the pill, not the logo
    var full = logo.querySelector(".brand-full"), vb = full && full.viewBox && full.viewBox.baseVal;
    if (vb && vb.height) bar.style.setProperty("--logo-aspect", (vb.width / vb.height).toFixed(4));
    var ls = getComputedStyle(logo);
    if (ls.display === "none" || ls.position !== "absolute") return;   // no logo (1157), or at the bar's start: nothing to meet
    var side = $("tabsSide") && getComputedStyle($("tabsSide")).position === "absolute" ? $("tabsSide") : logo;
    var gap = function () { return ws.getBoundingClientRect().left - side.getBoundingClientRect().right; };
    if (gap() < 18) bar.classList.add("ws-tight");
    if (gap() < 18) bar.classList.add("ws-tighter");
    centreWs(ws, side);
  }
  // HERESY 1632 (Viktor 20.10.2026: «Выровняй по центру между TRAINER и кружком активности»): the workspace's middle at the middle of the room
  // between the Trainer's pill (or the logo) and the engine's lamp; moved, not laid out again, so nothing beside it moves
  function centreWs(ws, side) {
    var lamp = $("engineLamp");
    if (!lamp || !lamp.getBoundingClientRect().width) return;
    // HERESY 1687: the lamp by the logo now (left of the Trainer): the room's right end is the buttons' start
    var chip = lamp.closest(".engine-chip"), acts = document.querySelector(".topbar .head-actions");
    var right = chip && acts && getComputedStyle(chip).position === "absolute" ? acts : lamp;
    var a = side.getBoundingClientRect().right, b = right.getBoundingClientRect().left, r = ws.getBoundingClientRect();
    if (b - a < r.width + 16) return;                  // no room to be in the middle: where the flow put it
    ws.style.setProperty("--ws-shift", Math.round((a + b) / 2 - (r.left + r.width / 2)) + "px");
  }
  var fitBarSoon = (function () { var raf = 0; return function () { cancelAnimationFrame(raf); raf = requestAnimationFrame(fitBar); }; })();
  window.addEventListener("resize", fitBarSoon);
  window.addEventListener("ruach-lang", fitBarSoon);                  // a language's words are wider or narrower
  window.addEventListener("ruach-fonts", fitBarSoon);                 // HERESY 1493: so are a font's and a size's
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitBarSoon);
  if ($("wsCurrent")) new MutationObserver(fitBarSoon).observe($("wsCurrent"), { childList: true, subtree: true, characterData: true });   // HERESY 1167: the name in the button
  fitBarSoon();
  document.addEventListener("click", function (event) {
    if (!event.target.closest(".menu-pop")) closeMenus();
  });

  // HERESY 1155 (Viktor, 03.10.2026: «убрать браузерное меню вне полей и ссылок — абсолютное ДА. По всей студии. Как в
  // ComfyUI — всё — собственный канвас как система в окне браузера»): the browser's right-click menu only in a field or on a
  // link (paste, copy, open in a new tab); everywhere else nothing, or the studio's own menu. Shift+right-click still
  // gives the browser's anywhere (and with it whatever the browser offers, its reading mode too)
  document.addEventListener("contextmenu", function (event) {
    if (event.shiftKey || event.defaultPrevented) return;
    if (event.target.closest && event.target.closest("input, textarea, select, [contenteditable], a[href]")) return;
    event.preventDefault();
  });
  // HERESY 1148 (Viktor, 03.10.2026): Ctrl+A only in a field one types into
  // HERESY 1169 (Viktor 07.10.2026: «как в видеоплеерах по аналогу ключевых фреймов… перематываем по 5, 15 сек в чистой
  // кратности с 0:00»): a jump lands on the next whole multiple of its step, or the last one; back from just past a mark
  // (under a second, as playing on keeps it) goes to the one before, so a press never lands where the music already is
  function seekTarget(t, step, dir) {
    return dir > 0 ? (Math.floor(t / step + 1e-6) + 1) * step : Math.max(0, Math.floor((t - 1) / step) * step);
  }
  window.ruachSeekTarget = seekTarget;   // the page's tests read it
  function seekMark(step, dir) {
    var audio = $("audio");
    if (!audio.getAttribute("src") || !isFinite(audio.duration) || audio.duration <= 0) return;
    audio.currentTime = Math.min(audio.duration - 0.05, seekTarget(audio.currentTime || 0, step, dir));
  }
  function typingField(el) {
    if (!el) return false;
    if (el.isContentEditable || el.tagName === "TEXTAREA") return true;
    return el.tagName === "INPUT" && /^(text|search|email|url|number|password|tel)$/i.test(el.type || "text");
  }
  document.addEventListener("keydown", function (event) {
    if (event.defaultPrevented) return;   // a list card already used the key
    if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.code === "KeyA" && !typingField(event.target)) { event.preventDefault(); return; }
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) return;
    if (event.key === "Escape") { leaveEngine(); closeMenus(); }
    if (event.key === " " && (audio.getAttribute("src") || STATE.take) && !event.target.closest(".menu-pop")) { event.preventDefault(); togglePlay(); }
    // HERESY 1111: seek and mute from the keyboard, outside text fields and menus; 1169: to the marks of 5 s (Shift: 30) from 0:00
    if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && audio.getAttribute("src") && isFinite(audio.duration) && !event.target.closest(".menu-pop, [role=menu], .col-grip")) {
      event.preventDefault();
      seekMark(event.shiftKey ? seekStep("shift") : seekStep("key"), event.key === "ArrowRight" ? 1 : -1);   // HERESY 1804
    }
    if ((event.key === "m" || event.key === "M") && !event.ctrlKey && !event.metaKey && !event.altKey) $("muteBtn").click();
  });

  /* ------------------------------------------------------------ info tips */
  // HERESY 1169 · 1247 (Viktor 08.10.2026: «В блоке LoRAs… жёлтым треуголик с воскл. знаком. Такое тоже переделай в правильную SVG
  // иконку. И всюду пройдись и подобные артефакты замени на svg иконки»): the ⚠ that leads a warning is drawn (.warn-ico) instead of
  // the emoji font's yellow triangle. A tip draws it in its text as it shows (translated by then); the page's own lines are written
  // as the sign and the words apart (ruachSigned), and heresy-i18n.js finds the words' translation under the catalog's «⚠ …»
  var SIGN = /\u26a0\ufe0f?[ \u00a0]?/;
  function signIcon() {
    var s = document.createElement("span");
    s.className = "warn-ico";
    s.setAttribute("role", "img");
    s.setAttribute("aria-label", "Warning");
    return s;
  }
  function signedInto(parent, text, before) {
    String(text).split(SIGN).forEach(function (part, i) {
      if (i) parent.insertBefore(signIcon(), before || null);
      if (part) parent.insertBefore(document.createTextNode(part), before || null);
    });
  }
  function signed(el, text) { el.textContent = ""; signedInto(el, text); return el; }
  function drawSigns(root) {
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), found = [];
    while (w.nextNode()) if (w.currentNode.nodeValue.indexOf("\u26a0") >= 0) found.push(w.currentNode);
    found.forEach(function (node) { signedInto(node.parentNode, node.nodeValue, node); node.remove(); });
  }
  window.ruachSigned = signed;

  // One floating tip for the page: [data-tip] shows its text, [data-tip-ref] a
  // <template>. It sits on the body, so a scrolling column cannot clip it.
  var tip = document.createElement("div");
  tip.className = "tip";
  tip.setAttribute("role", "tooltip");
  document.body.appendChild(tip);
  var tipFor = null, tipKept = false;   // HERESY 1167: kept = reached by the keyboard, it stays while focused

  // HERESY 1279 (Viktor 09.10.2026: «По всей студии добавь спейсинг между параграфами в тултипах, гайдах и читшитах. Так
  // красивее типографически, но не сломай редактор лирики»): a plain tip's lines are its paragraphs, with air between them (a
  // blank line in the text a little more); its text stays the same for whoever reads it (the line ends kept between them)
  function tipParagraphs(el, text) {
    var parts = String(text == null ? "" : text).split(/(\n[ \t]*\n\s*|\n)/);
    if (parts.length < 3) { el.textContent = text; return; }
    for (var i = 0; i < parts.length; i += 2) {
      if (i) el.appendChild(document.createTextNode(parts[i - 1]));
      var p = document.createElement("p");
      p.className = "tip-p" + (i && /\n[ \t]*\n/.test(parts[i - 1]) ? " tip-gap" : "");
      p.textContent = parts[i];
      el.appendChild(p);
    }
    el.classList.add("tip-paras");
  }

  function showTip(target) {
    var ref = target.dataset.tipRef;
    tip.textContent = "";
    tip.classList.remove("tip-paras");
    if (ref) tip.appendChild(document.getElementById(ref).content.cloneNode(true));
    else tipParagraphs(tip, target.dataset.tip);
    // HERESY 1494: a part worked out when the tip shows (the chosen backbone's merge), after its own words; nothing to say, no tip
    var more = !ref && typeof target.tipMore === "function" ? target.tipMore() : "";
    if (more) { var mb = document.createElement("div"); mb.className = "tip-more"; tipParagraphs(mb, more); tip.appendChild(mb); }
    else if (!ref && !target.dataset.tip) return;
    if (target.dataset.tipHead) {   // HERESY 1168: a label's short note, moved off the label, is the tip's first line
      var head = document.createElement("div");
      head.className = "tip-head";
      head.textContent = target.dataset.tipHead;
      tip.insertBefore(head, tip.firstChild);
    }
    drawSigns(tip);   // HERESY 1169 · 1247
    tip.classList.toggle("tip-rich", !!ref);
    tip.classList.toggle("tip-big", target.dataset.tipSize === "big");   // HERESY 1167: the Style's WARNING, at 16 pt
    tip.style.width = target.dataset.tipWidth || ""; tip.style.maxWidth = target.dataset.tipWidth ? "calc(100vw - 16px)" : "";   // HERESY 1709: a width of its own
    tip.classList.toggle("tip-over", !!target.closest(".hd-back"));   // HERESY 1709: over the studio's dialog when its target is in one
    tip.classList.add("is-on");
    var box = target.getBoundingClientRect(), width = tip.offsetWidth, height = tip.offsetHeight;
    var top = box.top - height - 8;
    if (top < 60) top = Math.min(box.bottom + 8, window.innerHeight - height - 8);   // no room above: below
    var left = Math.max(8, Math.min(box.left + box.width / 2 - width / 2, window.innerWidth - width - 8));
    // HERESY 1167: a big tip that fits neither above nor below would cover its target (the Style's WARNING in a short
    // window): beside it, on the side with room, as high as the window lets it
    if (tip.classList.contains("tip-big") && top < box.bottom && top + height > box.top) {
      var beside = box.right + 12 + width <= window.innerWidth - 8 ? box.right + 12 : box.left - 12 - width >= 8 ? box.left - 12 - width : null;
      if (beside !== null) {
        left = beside;
        top = Math.max(8, Math.min(box.top + box.height / 2 - height / 2, window.innerHeight - height - 8));
      }
    }
    // HERESY 1709 (Viktor 22.10.2026: «влево, чтобы не перекрывала список»): data-tip-side="left", beside the dialog (or the target) on its left, by
    // the target's middle, when there is room; else above or below as any tip
    var leftOf = target.dataset.tipSide === "left" ? (target.closest(".hd-box") || target).getBoundingClientRect().left - 12 - width : -1;
    if (leftOf >= 8) { left = leftOf; top = Math.max(8, Math.min(box.top + box.height / 2 - height / 2, window.innerHeight - height - 8)); }
    tip.style.left = left + "px";
    tip.style.top = Math.max(8, top) + "px";
    tipFor = target;
  }

  function hideTip() { tip.classList.remove("is-on"); tipFor = null; tipKept = false; }

  function tipTarget(node) { return node && node.closest ? node.closest("[data-tip], [data-tip-ref]") : null; }

  // HERESY 1167 (Viktor: «Глобально по всем тултипам Студии, выставь задержку в показ на 400ms… А то у нас сотни тултипов
  // на странице, и куда не двинешь мышью, куча выскачек»): a tip shows when the pointer rests 400 ms on its target
  // (data-tip-delay names another wait); one reached by the keyboard shows at once
  var tipWait = 0, tipNext = null;
  document.addEventListener("mouseover", function (event) {
    var target = tipTarget(event.target);
    if (target === tipNext || (target && target === tipFor)) return;
    clearTimeout(tipWait);
    tipNext = target;
    if (target) {
      var wait = parseInt(target.dataset.tipDelay, 10);
      tipWait = setTimeout(function () { if (tipNext === target && target.isConnected) { showTip(target); tipKept = false; } }, isFinite(wait) ? wait : 400);
    }
    if (!target && tipFor && !tipKept) hideTip();   // HERESY 1167: one reached by the keyboard stays
    else if (target && tipFor && tipFor !== target && !tipKept) hideTip();
  });
  // HERESY 1167 (Viktor: «Попап переключения режима темы не исчезает, только если где-то кликнуть»): Chrome focuses a button
  // clicked with the mouse too, so focus alone does not say the keyboard came; a press of the mouse puts the tip away
  // (what it said is done) and the focus it gives shows none
  var pointerAt = 0;
  document.addEventListener("pointerdown", function () {
    pointerAt = Date.now();
    clearTimeout(tipWait);
    if (tipFor) hideTip();
  }, true);
  document.addEventListener("focusin", function (event) {
    var target = tipTarget(event.target);
    if (Date.now() - pointerAt < 800) return;   // the mouse gave this focus
    if (target) { showTip(target); tipKept = true; } else if (tipFor) hideTip();
  });
  document.addEventListener("focusout", hideTip);
  // A scroll moves the target away from its tip; one reached by the keyboard keeps it. A box that scrolls
  // without holding the target (the server log following new lines) leaves the tip alone.
  document.addEventListener("scroll", function (event) {
    if (!tipFor) return;
    var box = event.target;
    if (box !== document && !(box.contains && box.contains(tipFor))) return;
    if (tipFor === document.activeElement) showTip(tipFor); else hideTip();
  }, true);

  // The VAE tip lists what this server actually offers; the versions tip says
  // how many songs one pass holds.
  function fillTips() {
    var list = $("tip-vae").content.querySelector('[data-fill="vaes"]');
    if (list && STATE.vaes.length) {
      list.innerHTML = STATE.vaes.map(function (v) {
        var note = VAE_NOTES_LONG[v.name];
        return "<dt>" + escape(v.label || v.name) + "</dt><dd><code>" + escape(v.repo || v.name) + "</code>" +
          (note ? "<br />" + escape(note) : "") + "</dd>";
      }).join("");
    }
    var batch = $("tip-versions").content.querySelector('[data-fill="max-batch"]');
    if (batch) batch.textContent = String(STATE.maxBatch);
  }

  /* -------------------------------------------------------------- themes */
  // The theme is applied in <head> before first paint; this is the picker.
  // Canvas drawing reads its colours from the active theme's CSS variables.
  var themeCache = {};

  function themeRGB(name) {
    if (!themeCache[name]) {
      var hex = getComputedStyle(document.documentElement).getPropertyValue("--" + name).trim().replace("#", "");
      if (hex.length === 3) hex = hex.replace(/./g, "$&$&");
      themeCache[name] = [parseInt(hex.slice(0, 2), 16) || 0, parseInt(hex.slice(2, 4), 16) || 0, parseInt(hex.slice(4, 6), 16) || 0];
    }
    return themeCache[name];
  }

  function themeRGBA(name, alpha) {
    var c = themeRGB(name);
    return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + alpha + ")";
  }

  // The theme picker (themes.js, shared with the other console): a preview or a change redraws
  // what the page paints itself from the theme's colours
  // HERESY 1017: the takes list folds to a strip on the right and back; kept per browser
  // HERESY 1167 (Viktor: «У Писателя пусть по умолчанию вкладка Takes будет свёрнута»): each room keeps its own fold; the
  // Writer's starts folded
  // HERESY 1258 (Viktor 08.10.2026: «комнате художника предлагаю колонку Taker… по умолчанию свёрнутой»): the Artist folds its own,
  // folded until unfolded, as the Writer does
  function libFoldKey() { var t = document.body.dataset.tab; return t === "write" || t === "artist" ? "yue2.libFolded." + t : "yue2.libFolded"; }
  function libFolded() { var v = recall(libFoldKey()); return v === null ? libFoldKey() !== "yue2.libFolded" : v === "1"; }
  function paintLibFold() {
    var folded = libFolded();
    if ($("library").classList.contains("is-peek")) libPeek(false);   // HERESY 1432
    $("library").classList.toggle("is-folded", folded);
    document.querySelector(".workspace").classList.toggle("lib-folded", folded);
    $("libUnfoldCount").textContent = $("libCount").textContent;
    window.dispatchEvent(new Event("resize"));
  }
  // HERESY 1432: opened over the take by the mouse, its Fold button keeps the list open instead
  $("libFold").addEventListener("click", function () {
    store(libFoldKey(), $("library").classList.contains("is-peek") ? (libFoldKey() !== "yue2.libFolded" ? "0" : null) : "1");
    paintLibFold();
  });
  // HERESY 1432 (Viktor 14.10.2026: «При свёрнутом виде дать возможность при наведении на полосу мышкой временно распахивать, и
  // при потере фокуса через секунду обратно сворачивать»): the folded strip opens over the take while the mouse is on it (a fifth
  // of a second first, so a mouse passing by opens nothing) and folds a second after the mouse leaves; a click on the strip still
  // unfolds it for good
  var libPeekOpen = 0, libPeekShut = 0;
  function libPeek(on) {
    clearTimeout(libPeekOpen);
    clearTimeout(libPeekShut);
    if ($("library").classList.contains("is-peek") === on) return;
    $("library").classList.toggle("is-peek", on);
    $("libFold").dataset.tip = tr(on ? "Keep the list open" : "Fold the takes list to the right");
    if (on) window.dispatchEvent(new Event("resize"));
  }
  $("library").addEventListener("mouseenter", function () {
    clearTimeout(libPeekShut);
    if ($("library").classList.contains("is-folded") && !$("library").classList.contains("is-peek"))
      libPeekOpen = setTimeout(function () { libPeek(true); }, 200);
  });
  $("library").addEventListener("mouseleave", function () {
    clearTimeout(libPeekOpen);
    if ($("library").classList.contains("is-peek")) libPeekShut = setTimeout(function () { libPeek(false); }, 1000);
  });
  $("libUnfold").addEventListener("click", function () { store(libFoldKey(), libFoldKey() !== "yue2.libFolded" ? "0" : null); paintLibFold(); });
  if (window.HeresyIcons) $("libUnfold").querySelector(".lib-unfold-icon").innerHTML = window.HeresyIcons.svg("expand");
  paintLibFold();

  // HERESY 1015: day and night, as is customary — ☀ day, ☾ night, ◐ as the system says.
  // Day and night each keep their own theme: a light one picked in the list becomes the
  // day theme, a dark one the night theme. Defaults: Scroll & Brick and Scroll by Lamplight.
  var SCHEME_KEY = "yue2.scheme", DAY_KEY = "yue2.theme.day", NIGHT_KEY = "yue2.theme.night";
  var darkQuery = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  var applyingScheme = false, lastKept = null;
  function themeInfo(id) { return YueThemes.list.filter(function (t) { return t.id === id; })[0] || null; }
  function schemeNow() { return recall(SCHEME_KEY) || "auto"; }   // HERESY 1167 (Viktor: «дефолтом поставь СИСТЕМА»)
  function wantsDark() { var s = schemeNow(); return s === "dark" || (s === "auto" && !!darkQuery && darkQuery.matches); }
  function applyScheme() {
    var id = wantsDark() ? (recall(NIGHT_KEY) || "igr-night") : (recall(DAY_KEY) || "igr-day");
    if (!themeInfo(id)) id = wantsDark() ? "igr-night" : "igr-day";
    if (YueThemes.current() !== id) { applyingScheme = true; YueThemes.set(id); applyingScheme = false; }
    lastKept = YueThemes.current();
    paintDayNight();
  }
  function paintDayNight() {
    var s = schemeNow(), b = $("dayNight");
    var face = s === "dark" ? "moon" : s === "auto" ? "auto" : "sun";   // HERESY 1017: icons
    b.innerHTML = window.HeresyIcons ? window.HeresyIcons.svg(face) : (s === "dark" ? "\u263e" : s === "auto" ? "\u25d0" : "\u2600");
    b.dataset.tip = (s === "dark" ? "Night" : s === "auto" ? "As the system: " + (wantsDark() ? "night now" : "day now") : "Day") +
      ". Click: day \u2192 night \u2192 as the system. Day " + ((themeInfo(recall(DAY_KEY) || "igr-day") || {}).name || "") +
      ", night " + ((themeInfo(recall(NIGHT_KEY) || "igr-night") || {}).name || "") + ": pick another in the list to change either.";
  }
  function rememberPicked() {
    var t = themeInfo(YueThemes.current());
    if (!t) return;
    store(t.dark ? NIGHT_KEY : DAY_KEY, t.id);
    // HERESY 1167: as the system, a theme of the kind it shows now is that kind's theme; one of the other kind is a
    // choice against the system: day or night as it is
    if (schemeNow() !== "auto" || t.dark !== wantsDark()) store(SCHEME_KEY, t.dark ? "dark" : "light");
    lastKept = t.id;
    paintDayNight();
  }

  YueThemes.mount($("themeButton"), {
    onChange: function () {
      if (!applyingScheme && YueThemes.current() !== lastKept && lastKept !== null) rememberPicked();   // a kept pick, not a hover preview
      if ($("lookTheme").value !== YueThemes.current()) $("lookTheme").value = YueThemes.current();   // the Appearance card follows
      themeCache = {};
      drawWave();
      if (STATE.abcRendered) renderScore(STATE.abcRendered);
    }
  });

  /* ------------------------------------------------------------ sampling */

  // Decimal knobs step fine enough to reach every value the docs and model cards
  // use: temperature 0.70 -> 0.71 (presets 0.55/0.85, cards 0.82/0.88/0.94), top-p
  // by 0.005 (a card uses 0.975), repetition penalty 0.005 in the planner (1.005)
  // and 0.01 for music tokens (cards use 1.18 and 1.24 around the 1.2 default).
  // Anything else uses the step column of SAMPLER_KNOBS (top-k 1, window 1, max
  // tokens 100).
  function knobStep(knob, def) {
    if (knob[0] === "temperature") return 0.01;
    if (knob[0] === "top_p") return 0.005;
    if (knob[0] === "repetition_penalty") return def < 1.05 ? 0.005 : 0.01;
    return knob[2] || 1;
  }
  // the server refuses values past these (protocol bounds)
  var KNOB_MAX = { temperature: 5, top_p: 1, penalty_window: 100 };
  // HERESY 1088 (Viktor, 02.10.2026): every knob held inside sane bounds (a value past them is pulled back
  // and said aloud), and the token floors and ceilings locked against a stray edit: the lock opens them
  var KNOB_BOUNDS = {
    temperature: [0.1, 2], top_p: [0.5, 1], top_k: [1, 1000], repetition_penalty: [1, 2], penalty_window: [1, 100],
    // HERESY 1167: the music up to 16:00 (Direct gives it nearly the whole window: Speech · up to 15:00)
    // HERESY 1169 · 1253 (Viktor 08.10.2026: «the 6144 default score cap (8192 at max limit)»): the score's ceiling 8192, its default stays 6144
    min_tokens: { abc: [0, 8192], semantic: [0, 24000] }, max_tokens: { abc: [256, 8192], semantic: [250, 24000] }
  };
  var LOCKED_KNOBS = { min_tokens: true, max_tokens: true };
  // HERESY 1167 (Viktor: «Лучше один раз объяснить, чем слушать треш»): why each bound is where it is
  var KNOB_WHY = {
    temperature: "Above 2 the choice is close to random; below 0.1 it is nearly fixed and loops.",
    top_p: "Below 0.5 only a few of the likeliest tokens stay, and the line turns monotone.",
    top_k: "1 always takes the likeliest token; past 1000 it narrows nothing, top-p decides.",
    repetition_penalty: "1 switches it off; above 2 every repeat is avoided, and the song loses its refrains and its beat.",
    penalty_window: "The engine looks back 100 tokens at most.",
    "abc.min_tokens": "The score's window holds 8,192 tokens.",
    "abc.max_tokens": "Below 256 a score has no room for its sections; past 8,192 it overflows its window.",
    "semantic.min_tokens": "The floor never goes above the music's Max length.",   // HERESY 1169: Max length is beside it now
    "semantic.max_tokens": "Music up to 10:00 (8:00 by default): past it a song loses its way (one ran on to 9:30, and that was too much). Speech (Direct) up to 15:00."   // HERESY 1468
  };
  // HERESY 1167 (Viktor: «CFG при вводе 3 не опускает его до макс. 2. Поставь сторожа на все поля в семплинге и уведомления
  // оверлеями»; «2.4 - макс стабильности. 2.6 и выше - дурдом. Может макс выставим до 4?»): Guidance and Sound and output
  // kept in their bounds, each saying why; a field emptied shows its default again when you leave it
  var FIELD_GUARDS = {
    cfg: [0, 10, "Viktor's range: the music 1.0 to 4.0; past it the light beside the field turns amber, then red"],   // HERESY 1400: the light, not a clamp at 4
    cfgLyrics: [0, 10, "Viktor's range: the lyrics 1.0 to 2.6; past it the light beside the field turns amber, then red. Empty: the same as Guidance"],   // HERESY 1397, 1400
    odeSteps: [1, 160, "32 is the release; 8–16 are quick drafts; 160 is the ceiling."],
    maxLength: [10, 960, "Music up to 10:00 (8:00 by default): past it a song loses its way (one ran on to 9:30, and that was too much). Speech (Direct) up to 15:00."],   // HERESY 1468: the top is the mode's (lengthCap)
    variations: [1, 9, "One pass renders nine at most."],
    peakClip: [0, 1000, "0 normalises to the true peak; past 1000 (0.1% of the samples cut flat) the peaks distort."]
  };
  function fieldDefault(id) {
    return id === "odeSteps" ? outDefault("steps") : id === "maxLength" ? outDefault("duration") : id === "peakClip" ? outDefault("peak_clip") : 1;
  }
  function fieldLabel(el) {
    var l = el.closest(".field") && el.closest(".field").querySelector(".label");
    return l && l.firstChild ? l.firstChild.textContent.trim() : el.id;
  }
  // a toast whose reason is a line of its own (each part looked up in the page's language on its own)
  function toastWhy(head, why, kind) {
    toast(head, kind);
    var el = $("toasts").lastChild;
    if (el && why) { var w = document.createElement("div"); w.className = "toast-why"; w.textContent = why; el.appendChild(w); }
  }
  function guardField(id) {
    var el = $(id), g = FIELD_GUARDS[id], v = parseFloat(el.value);
    if (id === "maxLength") g = [g[0], lengthCap(), g[2]];   // HERESY 1468
    if (id === "cfg") {
      if (!el.value.trim() || !isFinite(v)) { el.value = ""; el.dataset.touched = ""; fillCfg(); syncShape(); return; }
    } else if (id === "cfgLyrics") {                     // HERESY 1397: empty is its own answer (as Guidance)
      if (!el.value.trim() || !isFinite(v)) { el.value = ""; return; }
    } else if (!el.value.trim() || !isFinite(v)) {
      el.value = fieldDefault(id);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }
    if (v < g[0] || v > g[1]) {
      el.value = Math.min(g[1], Math.max(g[0], v));
      el.dispatchEvent(new Event("input", { bubbles: true }));
      toastWhy(fieldLabel(el) + " is kept within " + g[0] + "–" + g[1], g[2], "bad");
    } else if (id === "cfg" && v > 2.6 && !$("cfgLyrics").value.trim()) {   // HERESY 1400: the music may go to 4, the words follow it unless told
      toast(tr("The lyrics follow Guidance here: past 2.6 they begin to burn; give them their own Lyrics guidance (2.2 holds them with the music at 4.0)"));
    }
    cfgLights();
  }
  setTimeout(function () {
    Object.keys(FIELD_GUARDS).forEach(function (id) { if ($(id)) $(id).addEventListener("change", function () { guardField(id); }); });
  }, 0);
  function knobBounds(group, key) {
    var b = KNOB_BOUNDS[key];
    b = b && !Array.isArray(b) ? b[group] : b;
    return group === "semantic" && key === "max_tokens" && b ? [b[0], Math.min(b[1], lengthCap() * FRAME_RATE)] : b;   // HERESY 1468
  }
  // HERESY 1468 (Viktor 15.10.2026): the song's length at most by its mode: music 10:00 (its default 8:00), Direct's speech 15:00
  function lengthCap() { return currentCot() === "off" ? 900 : 600; }
  function clampLength(why) {
    var s = parseFloat($("maxLength").value), cap = lengthCap();
    if (!(s > cap)) return;
    $("maxLength").value = cap;
    syncMusicCeiling();
    paintOutput();
    toastWhy(tr(why || "Max length") + " is kept within " + clock(cap) + (cap === 600 ? " in music" : " in Direct"), KNOB_WHY["semantic.max_tokens"], "bad");
  }
  window.ruachLengthCap = lengthCap;
  var LOCK_SVG = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor"/>' +
    '<path class="shackle" d="M5 7V5a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';

  function samplingDefault(group, key) {
    var preset = STATE.defaults[group + "_sampling"] || PROTOCOL_DEFAULTS[group + "_sampling"];
    return preset[key];
  }

  function buildKnobs() {
    ["abc", "semantic"].forEach(function (group) {
      var host = document.querySelector('.knobs[data-group="' + group + '"]');
      host.innerHTML = "";
      SAMPLER_KNOBS.forEach(function (knob) {
        var wrap = document.createElement("label");
        wrap.className = "knob";
        wrap.innerHTML = "<span>" + knob[1] + (LOCKED_KNOBS[knob[0]] ? ' <span class="knob-lock" role="button" tabindex="0" data-tip="Locked against a stray edit: click to change it">' + LOCK_SVG + "</span>" : "") + "</span>";
        var input = document.createElement("input");
        input.type = "number";
        // The default also goes in the value attribute: that makes it the step
        // base, so arrows move 0.7 -> 0.8 / 0.6 and a default like 1.005 stays on
        // the step grid. Never set min: it would override the step base.
        var def = round(samplingDefault(group, knob[0]), 6);
        input.step = String(knobStep(knob, def));
        if (KNOB_MAX[knob[0]] !== undefined) input.max = String(KNOB_MAX[knob[0]]);
        input.dataset.group = group;
        input.dataset.key = knob[0];
        input.setAttribute("value", def);
        input.value = def;
        if (LOCKED_KNOBS[knob[0]]) { input.readOnly = true; wrap.classList.add("is-locked"); }
        wrap.appendChild(input);
        if (group === "semantic" && /_tokens$/.test(knob[0])) secsKnob(wrap, input, knob[0]);   // HERESY 1167
        host.appendChild(wrap);
      });
    });
    syncMusicCeiling();
    if (window.YueHelp) YueHelp.decorate();   // the knobs were just rebuilt
  }
  // HERESY 1167 (Viktor: «синхронизируем max music tokens с секундами в Sound and output… И так же делаем min tokens в
  // музыкальных токенах. Партитурные так и оставляем в токенах, потому как это не минуты, а ABC»): the music's floor and
  // ceiling in time, 25 tokens a second. The ceiling follows Max length (the engine caps the music there anyway); the floor
  // is set in seconds behind its lock. The token fields stay underneath, hidden: the request, the profiles and the meter
  // read them as before.
  function secsKnob(wrap, input, key) {
    var max = key === "max_tokens", name = wrap.querySelector("span");
    wrap.classList.add("knob-time");
    if (name && name.firstChild) name.firstChild.textContent = max ? "Max length " : "Min length ";
    input.hidden = true;
    var shown = document.createElement("input");
    shown.type = "text";
    shown.className = "knob-secs mono";
    shown.dataset.secsFor = key;
    shown.readOnly = true;
    shown.setAttribute("aria-label", max ? "Max length of the music" : "Min length of the music");
    wrap.appendChild(shown);
    // HERESY 1168 (Viktor 07.10.2026: «То поле в блоке семплера вообще нужно убрать и передавать туда секундное значение. Нет
    // смысла дублировать»; «В Sound and Output поле max length так и осталось»): the song's Max length is set here, as time, and
    // only here: Sound and output has no field for it any more; its value (the request's duration) follows this one. No lock:
    // it is the length of the song, as the field it replaces was
    if (max) {
      var lock = wrap.querySelector(".knob-lock");
      if (lock) lock.remove();
      wrap.classList.remove("is-locked");
      // HERESY 1169 (Viktor: «Подсказка по макс продолжительности выскочила из отключенного тобою поля»): the window's word, once
      // under Sound and output where no length field is left, is this field's own now
      shown.dataset.tip = "The song's length at most, as m:ss (the music's tokens, 25 a second): songs end on their own before it, and the engine cuts a song to what fits in the window of 24,576 tokens beside the style, the lyrics and (outside Direct) the score.";
    }
    shown.readOnly = false;
    shown.addEventListener("change", function () {
      var s = max ? parseLength(shown.value) : parseClock(shown.value);   // HERESY 1421
      if (isFinite(s)) {
        delete input.dataset.floor; delete input.dataset.held;   // a floor set by hand is the floor
        // the request's duration first: guardKnob re-syncs the ceiling from it (syncMusicCeiling), and an old one would
        // pull the new value straight back
        if (max) $("maxLength").value = round(s, 3);
        input.value = Math.round(s * FRAME_RATE);
        guardKnob(input);
        if (max) {                                    // as the bounds kept it, and with it the outputs' summary
          $("maxLength").value = round(parseFloat(input.value) / FRAME_RATE, 3);
          paintOutput();
        }
      }
      paintTokenTimes();
      shown.value = clock(parseFloat(input.value) / FRAME_RATE);   // HERESY 1421: what it read, shown at once (Tab leaves while it has the focus)
    });
  }
  // HERESY 1421 (Viktor 13.10.2026: «Макс длина… обнуляется с опустошённого поля на 0:10. Когда ввёл 9 и Таб, всё равно на 0:10
  // выставляет. Сделай дефолт для макс длины 8:00, и при табе, если ввёл в лимитах до 15 минут, нормализуй введённое в правильный
  // временной формат»): the song's Max length as typed: empty is the default (8:00); a bare number up to 15 is minutes (9 is 9:00,
  // not nine seconds raised to the floor's 0:10), above 15 seconds; m:ss (or m.ss) as written
  function parseLength(v) {
    var t = String(v).trim(), m = t.match(/^(\d+)[:.,](\d{1,2})$/);
    if (!t) return outDefault("duration");
    if (m) return +m[1] * 60 + +m[2];
    return /^\d+$/.test(t) ? (+t <= 15 ? +t * 60 : +t) : NaN;
  }
  window.ruachParseLength = parseLength;
  function parseClock(v) {                            // "30", "0:30", "1:05"
    var m = String(v).trim().match(/^(\d+)(?::(\d{1,2}))?$/);
    return !m ? NaN : m[2] !== undefined ? +m[1] * 60 + +m[2] : +m[1];
  }
  function paintTokenTimes() {
    all(".knob-secs").forEach(function (shown) {
      var input = knobInput("semantic", shown.dataset.secsFor);
      if (input && document.activeElement !== shown) shown.value = clock(parseFloat(input.value) / FRAME_RATE);
    });
  }
  function syncMusicCeiling() {
    var hi = knobInput("semantic", "max_tokens"), lo = knobInput("semantic", "min_tokens");
    if (!hi) return;
    var secs = parseFloat($("maxLength").value), b = knobBounds("semantic", "max_tokens");
    var v = isFinite(secs) && secs > 0 ? Math.round(secs * FRAME_RATE) : samplingDefault("semantic", "max_tokens");
    hi.value = Math.min(b[1], Math.max(b[0], v));
    if (lo) {   // a ceiling below the floor takes it down with it; the floor comes back when the ceiling rises again
      var held = lo.dataset.held !== undefined && lo.value === lo.dataset.held;
      var floor = held ? parseFloat(lo.dataset.floor) : parseFloat(lo.value), top = parseFloat(hi.value);
      if (floor > top) { lo.value = top; lo.dataset.floor = floor; lo.dataset.held = lo.value; }
      else if (held) { lo.value = floor; delete lo.dataset.floor; delete lo.dataset.held; }
    }
    paintTokenTimes();
  }

  function samplingOverrides(group) {
    var out = {};
    all('input[data-group="' + group + '"]').forEach(function (input) {
      var value = parseFloat(input.value);
      if (isFinite(value) && value !== round(samplingDefault(group, input.dataset.key), 6)) {
        out[input.dataset.key] = /_(k|window|tokens)$/.test(input.dataset.key) ? Math.round(value) : value;
      }
    });
    return out;
  }

  // Guidance shows the value the engine actually uses for the chosen planning
  // mode (HERESY 1031: 1.6 in every mode; the release had 1.0, and 1.01 in Direct) until you type your own.
  function defaultCfg(cot) { return 1.6; }   // HERESY 1031: the engine's default in every mode (the release: 1.01 off, 1.0 else)
  function currentCot() {
    var checked = document.querySelector('input[name="cot"]:checked');
    return checked ? checked.value : "full";
  }
  // HERESY 1167 (Viktor: «В Direct Mode деактивируй кнопку Play Score only»): Direct writes no score, so there is none to plan
  function paintPlanBtn() {
    var b = $("planBtn"), direct = currentCot() === "off";
    if (!b) return;
    b.disabled = direct;
    b.title = direct ? "Direct mode writes no score: choose Full plan or Melody only to plan one"
      : "Write only the score (seconds, no audio). Check its sections, then Generate renders exactly that score.";
  }
  document.addEventListener("change", function (e) { if (e.target && e.target.name === "cot") paintPlanBtn(); });
  setTimeout(paintPlanBtn, 0);
  function setCot(cot) {
    var radio = document.querySelector('input[name="cot"][value="' + cot + '"]');
    if (radio) radio.checked = true;
    paintPlanBtn();
    fillCfg();
    paintSliders();
    YueLoras.repaint();
  }
  function fillCfg() {
    if ($("cfg").dataset.touched) return;
    // HERESY 1032: the engine's default (1031 moved it to 1.6 and left this at 1.0 / 1.01, so the
    // untouched field went out as an explicit 1.0 and the new default never ran)
    var def = String(defaultCfg(currentCot()));
    $("cfg").setAttribute("value", def);   // step base: arrows go 1.6 -> 1.7 / 1.5 (HERESY 1421: tenths)
    $("cfg").value = def;
    cfgLights();                                         // HERESY 1400
  }
  // HERESY 1400: a light beside each guidance: green inside Viktor's range (the music 1.0–4.0, the lyrics 1.0–2.6), amber a little past
  // it, red far past; an empty Lyrics guidance lit by the Guidance it follows
  var CFG_ZONES = { cfg: [1, 4, 4.6], cfgLyrics: [1, 2.6, 3] };
  var LYRICS_CFG = "2.2";                                // the lyrics' own beside the default 1.6: his 1.6 / 2.2 kept the words (12.10.2026)
  var CFG_SAYS = {
    cfg: ["Within Viktor's range for the music, 1.0 to 4.0: 4.0 the brightest, 3.0 just as bright, 1.6 the studio's own",
      "Past 4.0: brighter still, and the music may begin to break; listen before you keep it", "Far past Viktor's range for the music (1.0 to 4.0): expect a broken take"],
    cfgLyrics: ["Within Viktor's range for the lyrics, 1.0 to 2.6: 2.2 holds the words with the music at 4.0; at 1.6 they dissolve, velvety",
      "Past 2.6: the words begin to burn", "Far past 2.6: burnt words"]
  };
  function cfgLights() {
    if (!$("cfgLight") || !$("cfgLyricsLight")) return;
    var music = parseFloat($("cfg").value), own = $("cfgLyrics").value.trim(), lyrics = own === "" ? music : parseFloat(own);
    if (!isFinite(music)) music = defaultCfg(currentCot());
    if (own === "") lyrics = music;
    [["cfg", music], ["cfgLyrics", lyrics]].forEach(function (x) {
      var dot = $(x[0] + "Light"), v = x[1], z = CFG_ZONES[x[0]];
      var k = !isFinite(v) ? -1 : v < z[0] || v > z[2] ? 2 : v > z[1] ? 1 : 0;
      var tip = k < 0 ? "" : x[0] === "cfgLyrics" && own === "" && k > 0
        ? tr("The lyrics follow Guidance here: past 2.6 they begin to burn; give them their own Lyrics guidance (2.2 holds them with the music at 4.0)")
        : tr(CFG_SAYS[x[0]][k]);
      // HERESY 1400 (Viktor: «Оба CFG должны отличаться один от другого хотя бы на 0.1, а в идеале на все 0.4-1.0. Единое значение уходит в
      // ту самую галлюцинацию в половинке лиричной»; on 2.6/2.6 and 4.0/4.0: «потеря С и косые ударности на гласных»): the two apart
      var apart = Math.abs(music - lyrics), s = !isFinite(apart) ? -1 : apart < 0.1 ? 2 : apart < 0.4 ? 1 : 0;
      if (x[0] === "cfgLyrics" && s > Math.max(k, 0)) {
        k = s;
        tip = tr("The two guidances should differ: by 0.1 at the least, by 0.4 to 1.0 at best (Viktor's ear); equal, half the lyrics drift into hallucination, and the vowels lose their stress");
      }
      dot.className = "cfg-light" + (k < 0 ? "" : " is-" + ["green", "amber", "red"][k]);
      dot.dataset.tip = tip;
      dot.setAttribute("aria-label", tip);
    });
  }
  // HERESY 1167 (Viktor: «когда Backspace в цифровом поле до конца, обнуляется на одну цифру… это лучше делать при потере
  // фокуса курсора»): emptied, it keeps empty while you type; it shows its default again when you leave it (guardField)
  $("cfg").addEventListener("input", function () { this.dataset.touched = this.value.trim() ? "1" : ""; });
  ["cfg", "cfgLyrics"].forEach(function (id) { $(id).addEventListener("input", cfgLights); });   // HERESY 1400
  window.addEventListener("ruach-lang", cfgLights);
  all('input[name="cot"]').forEach(function (radio) { radio.addEventListener("change", fillCfg); });
  all('input[name="cot"]').forEach(function (radio) { radio.addEventListener("change", function () { clampLength(); }); });   // HERESY 1468
  fillCfg();
  // HERESY 1419 (Viktor 13.10.2026: «Может ползунками сделаем как с LoRA адаптерами? Места в горизонтали хватает»): a road before each
  // guidance, red under 1, green in Viktor's range, amber past it, red far past. The number stays the truth (an empty Guidance: the
  // profile's default; an empty Lyrics guidance: as Guidance, its thumb hollow there); the road follows the number whoever sets it, and a
  // drag writes the number as typing does (its input; its change on release, so the guard and the light have their say)
  var CFG_ROAD = 6, cfgRoadQueued = false;
  function paintCfgRoads() {
    cfgRoadQueued = false;
    var music = parseFloat($("cfg").value), own = $("cfgLyrics").value.trim();
    if (!isFinite(music)) music = defaultCfg(currentCot());
    [["cfg", music, false], ["cfgLyrics", own === "" ? music : parseFloat(own), own === ""]].forEach(function (x) {
      var r = $(x[0] + "Range"), z = CFG_ZONES[x[0]];
      if (!r) return;
      ["--z0", "--z1", "--z2"].forEach(function (k, i) { r.style.setProperty(k, (z[i] / CFG_ROAD * 100).toFixed(2) + "%"); });
      r.value = isFinite(x[1]) ? Math.min(CFG_ROAD, Math.max(0, x[1])) : 0;
      r.classList.toggle("is-auto", x[2]);
    });
  }
  function queueCfgRoads() {
    if (cfgRoadQueued) return;
    cfgRoadQueued = true;
    requestAnimationFrame(paintCfgRoads);
  }
  ["cfg", "cfgLyrics"].forEach(function (id) {
    var el = $(id), r = $(id + "Range"), d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    if (!el || !r) return;
    Object.defineProperty(el, "value", { configurable: true, get: function () { return d.get.call(this); },   // a value set in code moves the road too
      set: function (v) { d.set.call(this, v); queueCfgRoads(); } });
    el.addEventListener("input", queueCfgRoads);
    r.addEventListener("input", function () {
      el.value = String(Math.round(parseFloat(r.value) * 10) / 10);   // HERESY 1421: tenths
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    r.addEventListener("change", function () { el.dispatchEvent(new Event("change", { bubbles: true })); });
  });
  window.ruachCfgRoads = paintCfgRoads;
  queueCfgRoads();

  // HERESY 1081 (Viktor 02.10.2026): a knob left empty (or with no number in it) shows its default again;
  // empty already sent nothing (the engine used its default), but the box looked broken
  document.addEventListener("change", function (e) {
    var input = e.target;
    if (!input.matches || !input.matches("input[data-group][data-key]")) return;
    if (!isFinite(parseFloat(input.value))) {
      input.value = round(samplingDefault(input.dataset.group, input.dataset.key), 6);
      syncShape();
    }
    guardKnob(input);
  });
  // HERESY 1088: a value past its bounds comes back inside them, and a floor never above its ceiling
  function guardKnob(input) {
    var group = input.dataset.group, key = input.dataset.key, b = knobBounds(group, key), v = parseFloat(input.value);
    var label = (input.parentNode.querySelector("span") || {}).textContent || key;
    var music = group === "semantic" && /_tokens$/.test(key);   // HERESY 1167: said in time, and why
    if (b && isFinite(v) && (v < b[0] || v > b[1])) {
      input.value = Math.min(b[1], Math.max(b[0], v));
      toastWhy(label.trim() + " is kept within " + (music ? clock(b[0] / FRAME_RATE) + "–" + clock(b[1] / FRAME_RATE) : b[0] + "–" + b[1]),
               KNOB_WHY[group + "." + key] || KNOB_WHY[key], "bad");
    }
    if (key === "min_tokens" || key === "max_tokens") {
      var lo = knobInput(group, "min_tokens"), hi = knobInput(group, "max_tokens");
      if (lo && hi && parseFloat(lo.value) > parseFloat(hi.value)) {
        if (key === "min_tokens") lo.value = hi.value; else hi.value = lo.value;
        toast(music ? "The music's Min length may not pass its Max length (Max length in Sound and output)" : "Min tokens may not pass Max tokens", "bad");
      }
    }
    syncShape();
  }
  // the lock beside Min and Max tokens: open to change them, closed again by a second click
  document.addEventListener("click", function (e) {
    var lock = e.target.closest && e.target.closest(".knob-lock");
    if (!lock) return;
    e.preventDefault();
    var wrap = lock.closest(".knob"), input = wrap.querySelector(".knob-secs") || wrap.querySelector("input");   // HERESY 1167: the time field
    var open = wrap.classList.toggle("is-locked") === false;
    input.readOnly = !open;
    lock.dataset.tip = open ? "Open: click to lock it again" : "Locked against a stray edit: click to change it";
    if (open) { input.focus(); input.select(); }
  });
  document.addEventListener("keydown", function (e) {
    if ((e.key === "Enter" || e.key === " ") && e.target.classList && e.target.classList.contains("knob-lock")) { e.preventDefault(); e.target.click(); }
  });

  // HERESY 1169: the resets ask first when a value set here would go; at the defaults already they simply reset
  function askReset(changed, text) { return changed ? window.HeresyDialog.confirm(text, { ok: "Reset" }) : Promise.resolve(true); }
  function samplingChanged() {
    return all("input[data-group]").some(function (input) {
      if (input.dataset.group === "semantic" && input.dataset.key === "max_tokens") return false;   // the song's length: Max length's, not a knob's
      return Number(input.value) !== round(samplingDefault(input.dataset.group, input.dataset.key), 6);
    }) || !!$("cfg").dataset.touched || $("cfgLyrics").value.trim() !== LYRICS_CFG;   // HERESY 1400: its own default is 2.2
  }
  $("resetSampling").addEventListener("click", function () {
    askReset(samplingChanged(), "Reset sampling to the defaults?\n\nThe values set here now are kept nowhere else.").then(function (ok) {
      if (!ok) return;
      all("input[data-group]").forEach(function (input) {
        input.value = round(samplingDefault(input.dataset.group, input.dataset.key), 6);
      });
      $("cfg").dataset.touched = "";
      $("cfgLyrics").value = LYRICS_CFG;                 // HERESY 1397, 1400: apart from the start
      $("cfg").value = "";
      fillCfg();
      syncShape();
      toast("Sampling reset to defaults");
    });
  });

  /* --------------------------------------------------------- shape sliders */
  // Five-step shortcuts over the sampling knobs, using the reference studio's
  // published mappings. Position 2 is the engine default.
  var SHAPES = {
    // HERESY 1031: re-centred on Viktor's stable set (the middle is the default)
    shapeComposition: { group: "abc", keys: ["temperature", "top_p", "top_k"],
      steps: [[0.7, 0.9, 30], [0.85, 0.92, 40], [0.95, 0.95, 50], [1.05, 0.96, 64], [1.15, 0.97, 80]] },
    shapePerformance: { group: "semantic", keys: ["temperature", "top_p", "top_k"],
      steps: [[0.75, 0.9, 60], [0.85, 0.93, 80], [0.9, 0.95, 100], [1.0, 0.95, 100], [1.1, 0.97, 140]] },
    shapeStyle: { cfg: [1.2, 1.4, null, 1.8, 2.0] }
  };
  var SHAPE_LABELS = ["lowest", "low", "default", "high", "highest"];

  function knobInput(group, key) {
    return document.querySelector('input[data-group="' + group + '"][data-key="' + key + '"]');
  }

  function applyShape(id) {
    var spec = SHAPES[id], pos = parseInt($(id).value, 10);
    if (spec.cfg) {
      var value = spec.cfg[pos];
      if (value === null) { $("cfg").dataset.touched = ""; fillCfg(); }
      else { $("cfg").value = value; $("cfg").dataset.touched = "1"; }
    } else {
      spec.keys.forEach(function (key, i) {
        var input = knobInput(spec.group, key);
        if (input) input.value = spec.steps[pos][i];
      });
    }
    syncShape();
  }

  // Show where the knobs sit; "custom" when they match no position.
  function syncShape() {
    syncMusicCeiling();                               // HERESY 1167
    Object.keys(SHAPES).forEach(function (id) {
      var spec = SHAPES[id], found = -1;
      if (spec.cfg) {
        var auto = !$("cfg").dataset.touched;
        spec.cfg.forEach(function (v, pos) {
          if ((v === null && auto) || (v !== null && !auto && parseFloat($("cfg").value) === v)) found = pos;
        });
      } else {
        spec.steps.forEach(function (values, pos) {
          var every = spec.keys.every(function (key, i) {
            var input = knobInput(spec.group, key);
            return input && parseFloat(input.value) === values[i];
          });
          if (every) found = pos;
        });
      }
      if (found >= 0) $(id).value = found;
      var out = $(id + "Out");
      out.textContent = found >= 0 ? SHAPE_LABELS[found] : "custom";
      out.classList.toggle("custom", found < 0);
    });
  }

  Object.keys(SHAPES).forEach(function (id) {
    $(id).addEventListener("input", function () { applyShape(id); });
  });
  $("shapeReset").addEventListener("click", function () {
    var moved = Object.keys(SHAPES).some(function (id) { return Number($(id).value) !== 2; });
    askReset(moved, "Put the sliders back to the tuned defaults?\n\nThe sampling values they set now are kept nowhere else.").then(function (ok) {
      if (!ok) return;
      Object.keys(SHAPES).forEach(function (id) { $(id).value = 2; applyShape(id); });
      toast("Sliders reset to the tuned defaults");
    });
  });
  document.querySelector(".sampler-grid").addEventListener("input", syncShape);
  $("cfg").addEventListener("input", syncShape);

  /* ------------------------------------------------------ sound and output */
  // The C++ engine's own settings: ODE steps, the length cap, variations per
  // song, and how the audio file is written.

  // HERESY 1710 (Viktor 22.10.2026: «ставь AB2… давай лучше 48 шагов по умолчанию»): the page's default steps 48 (with AB2); the engine's own stays
  // its 32, which a request without steps gets: what the page sends is weighed against the engine's
  var PAGE_STEPS = 48;
  function engineSteps() { var v = STATE.defaults.steps; return v === undefined || v === null ? PROTOCOL_DEFAULTS.steps : v; }
  function outDefault(key) {
    if (key === "steps") return PAGE_STEPS;              // HERESY 1710
    var value = STATE.defaults[key];
    return value === undefined || value === null ? PROTOCOL_DEFAULTS[key] : value;
  }

  function paintOutputDefaults() {
    [["odeSteps", "steps"], ["maxLength", "duration"], ["peakClip", "peak_clip"]].forEach(function (pair) {
      var def = round(outDefault(pair[1]), 3);
      $(pair[0]).setAttribute("value", def);
      $(pair[0]).value = def;
    });
    var saved = null;
    try { saved = JSON.parse(recall("yue2.output") || "null"); } catch (error) { saved = null; }
    // WAV 24 by default: the fair comparison with the other console's 24-bit files.
    $("outFormat").value = saved && FORMAT_LABELS[saved.format] ? saved.format : "wav24";
    $("mp3Bitrate").value = saved && saved.bitrate ? String(saved.bitrate) : String(outDefault("mp3_bitrate"));
    if (!$("mp3Bitrate").value) $("mp3Bitrate").value = "128";
    paintOutput();
  }

  // HERESY 1498 (Viktor 16.10.2026: «Шаг 8. Дефолт 32… шаг, между 8 и 32 = 8, выше по экспоненте 32-64=16, 64-128=32, 128-160=32»): the steps on
  // a road of nine stops; the number field holds the value for the rest of the page (a take's own count, 92 say, is shown as it is, the
  // thumb at the stop nearest it)
  var STEP_STOPS = [8, 16, 24, 32, 48, 64, 96, 128, 160], stepsShown = null;
  function stepStop(v) {
    var best = 0;
    STEP_STOPS.forEach(function (s, i) { if (Math.abs(Math.log(s / v)) < Math.abs(Math.log(STEP_STOPS[best] / v))) best = i; });
    return best;
  }
  function syncStepsRange() {
    var v = parseInt($("odeSteps").value, 10);
    if (!isFinite(v) || v < 1) v = outDefault("steps") || 32;
    stepsShown = String($("odeSteps").value);
    $("odeStepsRange").value = String(stepStop(v));
    $("odeStepsOut").textContent = String(v);
  }
  $("odeStepsRange").addEventListener("input", function () {
    $("odeSteps").value = String(STEP_STOPS[+this.value]);
    syncStepsRange();
    $("odeSteps").dispatchEvent(new Event("input", { bubbles: true }));
    $("odeSteps").dispatchEvent(new Event("change", { bubbles: true }));
  });
  setInterval(function () { if (String($("odeSteps").value) !== stepsShown) syncStepsRange(); }, 400);   // a value the page set by itself (a take's form)

  function paintOutput() {
    syncStepsRange();                                 // HERESY 1498
    var format = $("outFormat").value;
    $("bitrateField").classList.toggle("is-hidden", format !== "mp3");
    var parts = [FORMAT_LABELS[format] + (format === "mp3" ? " " + $("mp3Bitrate").value + " kbps" : "")];
    var steps = parseInt($("odeSteps").value, 10), length = parseFloat($("maxLength").value);
    if (isFinite(steps) && steps !== outDefault("steps")) parts.push(steps + " steps");
    if (isFinite(length) && length !== outDefault("duration")) parts.push("up to " + clock(length));
    $("outSummary").textContent = parts.map(tr).join(" · ");   // HERESY 1166
    var notes = [];
    // HERESY 1167: the music's ceiling is Max length itself now; the window is the other cap (1169: said in Max length's own tip)
    if (format === "wav32") notes.push("WAV 32 is raw float: peak clip is ignored.");
    $("outHint").textContent = notes.map(tr).join(" ");
    syncMusicCeiling();                               // HERESY 1167: the music's Max length follows
    if (window.YueLoras && YueLoras.relayout) YueLoras.relayout();   // HERESY 1458: the waves' time grid follows it too
  }

  function saveOutputChoice() {
    store("yue2.output", JSON.stringify({ format: $("outFormat").value, bitrate: parseInt($("mp3Bitrate").value, 10) }));
  }

  $("outFormat").addEventListener("change", function () { saveOutputChoice(); paintOutput(); });
  $("mp3Bitrate").addEventListener("change", function () { saveOutputChoice(); paintOutput(); });
  ["odeSteps", "maxLength", "peakClip"].forEach(function (id) { $(id).addEventListener("input", paintOutput); });
  // HERESY 1169: Songs × Sounds beside Generate, and how many takes that makes
  function paintCounts() {
    var songs = +$("versions").value || 1, sounds = +$("variations").value || 1, takes = songs * sounds;
    $("versionsOut").textContent = songs;
    $("variationsOut").textContent = sounds;
    ["versions", "variations"].forEach(function (id) {               // HERESY 1169 · 1236: the track filled to the thumb (the page draws it)
      var el = $(id), lo = +el.min || 0, hi = +el.max || 1;
      el.style.setProperty("--fill", ((+el.value - lo) / Math.max(1, hi - lo) * 100) + "%");
    });
    $("takesTotal").textContent = takes + (takes === 1 ? " take" : " takes");   // the catalogs know «{0} takes»
  }
  ["versions", "variations"].forEach(function (id) { $(id).addEventListener("input", paintCounts); });
  paintCounts();

  function outputChanged() {
    var off = function (id, key) { var v = parseFloat($(id).value); return isFinite(v) && v !== round(outDefault(key), 3); };
    return off("odeSteps", "steps") || off("maxLength", "duration") || off("peakClip", "peak_clip") ||
      $("odeSolver").value !== "multistep" || $("outFormat").value !== "wav24" ||   // HERESY 1710: AB2 the default
      $("narDecode").value !== "standard";                                         // HERESY 1768: the whole-song decode the default
  }
  $("resetOutput").addEventListener("click", function () {
    askReset(outputChanged(), "Reset the output to the defaults?\n\nWAV 24-bit, " + outDefault("steps") + " denoising steps, the AB2 solver, the songs up to " +
      clock(outDefault("duration")) + ": what is set here now is kept nowhere else.").then(function (ok) { if (ok) resetOutputNow(); });
  });
  function resetOutputNow() {
    store("yue2.output", null);
    paintOutputDefaults();
    // HERESY 1168 (Viktor 07.10.2026: «Reset output не обнуляет выбор резолвера»): the solver back to midpoint too
    $("odeSolver").value = "multistep";                 // HERESY 1710: AB2 the default now (Midpoint before)
    $("odeSolver").dispatchEvent(new Event("change", { bubbles: true }));
    $("narDecode").value = "standard";                  // HERESY 1768: the whole-song decode
    paintOutput();
    toast("Output reset: WAV 24-bit, " + outDefault("steps") + " denoising steps, the AB2 solver, the songs up to " + clock(outDefault("duration")));
  }

  function readOutput() {
    var out = {};
    var steps = $("odeSteps").value.trim(), length = $("maxLength").value.trim();
    var variations = $("variations").value.trim(), clip = $("peakClip").value.trim();
    if (steps !== "") {
      var s = Number(steps);
      if (!Number.isInteger(s) || s < 1) throw new Error("Denoising steps must be a whole number, 1 or more");
      if (s !== engineSteps()) out.steps = s;              // HERESY 1710: against the engine's default, which a request without steps gets
    }
    if (length !== "") {
      var d = Number(length);
      if (!isFinite(d) || d <= 0) throw new Error("Max length must be a number of seconds above 0");
      if (d !== outDefault("duration")) out.duration = d;
    }
    if (variations !== "") {
      var v = Number(variations);
      if (!Number.isInteger(v) || v < 1 || v > 9) throw new Error("Sound variations must be between 1 and 9");
      if (v > 1) out.synth_batch_size = v;
    }
    out.output_format = $("outFormat").value;
    if (out.output_format === "mp3") out.mp3_bitrate = parseInt($("mp3Bitrate").value, 10) || 128;
    if (clip !== "") {
      var c = Number(clip);
      if (!Number.isInteger(c) || c < 0) throw new Error("Peak clip must be a whole number, 0 or more");
      if (c !== outDefault("peak_clip")) out.peak_clip = c;
    }
    return out;
  }

  /* ---------------------------------------------------------------- VAEs */

  function vaeInfo(name) { return STATE.vaes.filter(function (v) { return v.name === name; })[0] || null; }
  function vaeLabel(name) { var v = vaeInfo(name); return v ? (v.label || v.name) : (name || "default"); }

  // One VAE per song, kept per browser. A take can gain another VAE version
  // later from its page.
  function paintVaes() {
    var current = selectedVae(true);
    $("decoders").innerHTML = STATE.vaes.map(function (v) {
      var tip = (VAE_TIPS[v.name] ? VAE_TIPS[v.name] + "\n" : "") + (v.repo || v.name);
      return '<label class="toggle" data-tip="' + escape(tip) + '"><input type="radio" name="vae" value="' +
        escape(v.name) + '" /><span><span class="vae-name">' + escape(v.label || v.name) + "</span>" +
        (YueVaes.kindOf(v) === "add-on" ? YueVaes.badge("add-on") : "") + "</span>" +
        (VAE_NOTES[v.name] ? "<small>" + VAE_NOTES[v.name] + "</small>" : "") + "</label>";
    }).join("");
    // HERESY 1168: the ☰ menu's VAE row, under the model: the choice the Composer's (now hidden) radios hold
    ["vaePick", "setVae"].forEach(function (id) {            // HERESY 1425: and Engine → Compute's, the same choice
      if ($(id)) $(id).innerHTML = STATE.vaes.map(function (v) {
        return '<option value="' + escape(v.name) + '">' + escape((v.label || v.name) + (YueVaes.kindOf(v) === "add-on" ? " · add-on" : "")) + "</option>";
      }).join("");
    });
    var want = current || recall("yue2.vae");
    if (!vaeInfo(want)) want = STATE.defaultVae;
    checkVae(want);
  }

  function checkVae(name) {
    all("#decoders input").forEach(function (input) { input.checked = input.value === name; });
    if (!document.querySelector("#decoders input:checked")) {
      var first = document.querySelector("#decoders input");
      if (first) first.checked = true;
    }
    if ($("vaePick")) $("vaePick").value = selectedVae();   // HERESY 1168: the menu says the same
    if ($("setVae")) $("setVae").value = selectedVae();     // HERESY 1425: Engine → Compute too
    YueVaes.repaint();
  }

  function selectedVae(noFallback) {
    var input = document.querySelector("#decoders input:checked");
    return input ? input.value : (noFallback ? null : STATE.defaultVae);
  }

  $("decoders").addEventListener("change", function () {
    store("yue2.vae", selectedVae());
    if ($("vaePick")) $("vaePick").value = selectedVae();
    if ($("setVae")) $("setVae").value = selectedVae();
    YueVaes.repaint();
  });
  ["vaePick", "setVae"].forEach(function (id) {             // HERESY 1168: the ☰ menu's VAE; 1425: Engine → Compute's
    if ($(id)) $(id).addEventListener("change", function () {
      checkVae(this.value);
      store("yue2.vae", selectedVae());
      toast("VAE for the songs to come: " + vaeLabel(selectedVae()));
    });
  });

  // The Engine panel's VAE tiles (vaes.js) mark the one the form has picked
  YueVaes.listInto($("vaeCard"), $("vaeCardNote"), { current: function () { return selectedVae(true) || ""; } });

  /* ------------------------------------------------------------- sliders */
  // HERESY 1449 (Viktor 15.10.2026: «Я вижу только негатив в реальном смысле аудио выплеска»; «Нахер убирай это слайдерное говно
  // из нашей Студии, но сами адаптации волнового инджеста забери»): the voice and genre sliders are gone from the studio, measured
  // before they went (three seeds: from the fifth music token another song, the sound pushed every way at random, no pull toward
  // its genre). Their wave lives on in the LoRAs' (loras.js; the engine's lora-rt.h). What still asks after them gets nothing: no
  // slider is known, none is sent, a prompt or a take that had some says so when it opens
  function sliderLabels() { return {}; }
  function paintSliderCard() {}
  function paintSliders() {}
  function slidersBody() { return []; }
  function curveClean() { return null; }

  /* ---------------------------------------------------------------- LoRAs */
  // The picker is shared with the other console (loras.js); the catalog comes with /props.
  YueLoras.mount($("loraPicker"), {
    cot: function () { return currentCot(); },
    // HERESY 1458: the length the engine runs a wave over (the request's duration caps the music half's frames, pipeline.h)
    songLength: function () { return parseFloat($("maxLength").value) || outDefault("duration") || 0; },
    lyrics: function () { return $("lyrics").value; },                                          // HERESY 1665: a wave by sections
    score: function () { return currentCot() !== "off" ? $("abc").value : ""; },
    onChange: function () { paintScoreGuard(); },        // HERESY 1327: the score's adapters against these
    scoreGiven: function () { return currentCot() !== "off" && !!$("abc").value.trim(); },   // HERESY 1623: a score in the form lifts the music half's ceiling
    addToStyle: function (word) {
      var style = $("style").value;
      if (new RegExp("(^|[^\\w])" + word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "([^\\w]|$)", "i").test(style)) {
        return toast("The style already has \u201c" + word + "\u201d");
      }
      $("style").value = word + (style.trim() ? ", " + style.trim() : "");
      $("style").dispatchEvent(new Event("input", { bubbles: true }));   // HERESY 1018: the draft and the meters see it
      toast("Added \u201c" + word + "\u201d to the style");
      YueLoras.repaint();
    },
    styleText: function () { return $("style").value; },   // HERESY 1018: the row says when the trigger word is in
    lyricsText: function () { return $("lyrics").value; }, // HERESY 1095: an instrumental score adapter with words to sing
    // HERESY 1167 (Viktor: «адаптер из локального тренинга… Убрать из списка (адаптер в своей сессии Тренера)»): out of loras/,
    // its checkpoint still in its run; the Trainer puts it back
    // HERESY 1496: an adapter's files out of loras/ for good: the lab says first what goes (a folder left with no adapter goes with them)
    deleteFiles: function (ids, name) {
      var mb = function (n) { return n >= 1073741824 ? (n / 1073741824).toFixed(1) + " GB" : (n / 1048576).toFixed(n >= 10485760 ? 0 : 1) + " MB"; };
      var ask = function (dry) { return api("/lab/lora/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: ids, dry: dry }) }); };
      ask(true).then(function (plan) {
        return window.HeresyDialog.confirm(tr("Delete " + name + " from loras/ for good?") + "\n\n" +
          tr("Gone from the disk, not into a trash: " + mb(plan.bytes) + ".") + "\n" + plan.files.join("\n") +
          (plan.folders.length ? "\n\n" + tr("Its folder goes with them (no other adapter is left in it): " + plan.folders.join(", ")) : "") + "\n\n" +
          tr("An adapter of your own run stays in the Trainer while its checkpoint is there; a downloaded one comes back only by downloading it again."),
          { ok: tr("Delete for good"), danger: true }).then(function (ok) {
          if (!ok) return;
          return ask(false).then(function (done) {
            YueLoras.set(YueLoras.kept().filter(function (c) { return ids.indexOf(c.id) < 0; }), YueLoras.groups ? YueLoras.groups() : []);
            toast(tr(name + " is deleted from loras/ (" + mb(done.bytes) + " freed)"));
            pollProps();
          });
        });
      }).catch(function (error) { toast(error.message, "bad"); pollProps(); });
    },
    unpublish: function (ids) {
      Promise.all(ids.map(function (id) {
        var parts = id.split("/");
        return api("/lab/train/unpublish", { method: "POST", headers: { "Content-Type": "application/json" },
                                             body: JSON.stringify({ name: parts[0], lora: parts[parts.length - 1] }) });
      })).then(function () {
        toast("Out of the list; its checkpoint stays in the Trainer's run " + ids[0].split("/")[0] + " (the Trainer puts it back)");
        pollProps();
      }, function (error) { toast(error.message, "bad"); pollProps(); });
    }
  });
  $("lyrics").addEventListener("change", function () { YueLoras.repaint(); });
  $("style").addEventListener("change", function () { YueLoras.repaint(); });
  all('input[name="cot"]').forEach(function (radio) { radio.addEventListener("change", function () { YueLoras.repaint(); }); });
  YueLoras.listInto($("loraCard"), $("loraCardNote"), $("loraCardLocal"));   // HERESY 1166: trained here, and from Hugging Face   // the Engine panel's list, under the VAEs

  /* ------------------------------------------------------- reused codes */
  // A take's music codes in the form: Generate renders exactly that music
  // again, with whatever sound settings the form now holds.

  function setCodes(codes) {
    STATE.codes = codes;
    $("codesNote").classList.toggle("is-hidden", !codes);
    if (codes) {
      $("codesNoteText").textContent = (codes.title ? "From \u201c" + codes.title + "\u201d. " : "") +
        "Generate renders that same music (" + clock(codes.frames / FRAME_RATE) + ") again; the VAE, the sound seed " +
        "and the sound settings decide how it sounds. Versions do not apply.";   // HERESY 1451
    }
    paintSliders();
    paintSubmitNote();
  }

  function countCodes(tokens) {
    var text = String(tokens || "").trim();
    return text ? text.split(",").length : 0;
  }

  $("dropCodes").addEventListener("click", function () {
    setCodes(null);
    toast("Codes dropped: Generate writes new music from the prompt");
  });

  /* -------------------------------------------------------------- compose */

  // Verse, Chorus, Bridge and Interlude are the tags YuE2's own score vocabulary
  // documents; the rest are passed through as written, so say so plainly.
  var STRUCTURE_NOTES = {
    simple: "Verse and Chorus only.",
    bridge: "Verse, Chorus and Bridge — the tags YuE2's score vocabulary documents.",
    prechorus: "Adds [Pre-Chorus], which is not one of YuE2's documented tags: it is passed " +
               "through as written and may be sung as an ordinary section.",
    full: "Adds [Intro], [Pre-Chorus] and [Outro]. Only Verse, Chorus, Bridge and Interlude are " +
          "documented tags; the others are passed through as written, and instrumental sections " +
          "carry no lyrics, so the model may or may not leave them wordless."
  };

  // the chosen structure's note rides in the Structure (i), after its help text
  function paintStructureHint() {
    var info = $("structure").closest(".field").querySelector(".info");
    if (!info) return;
    info.dataset.base = info.dataset.base || info.dataset.tip;
    info.dataset.tip = info.dataset.base + " Now: " + (STRUCTURE_NOTES[$("structure").value] || "");
  }
  $("structure").addEventListener("change", paintStructureHint);
  paintStructureHint();

  // A 10-row box hides the bridge below the fold, which reads as truncated lyrics.
  // HERESY 1006: it grows to data-max-rows (16) and then scrolls, through the same
  // fitText as the style box; every caller here keeps working unchanged.
  function growLyrics() {
    fitText($("lyrics"));
  }
  $("lyrics").addEventListener("input", growLyrics);
  // HERESY 1168: the lyrics' meter: each line's syllables against its group's ruler, the counts under the box, the browser's
  // spelling check; the box drawn by hand keeps its height (heresy-lyrics.js)
  var lyricsMeter = window.HeresyLyrics ? window.HeresyLyrics.attach($("lyrics"), { meter: $("lyricsMeter"), style: $("style"), fit: function (area) { fitText(area); },
    head: $("lyrics").closest(".field").querySelector(".label") }) : null;   // HERESY 1427: the line numbers and spelling by the title
  if (window.HeresyLyrics) window.HeresyLyrics.aids($("wrLyrics"), null, $("wrLyrics").closest(".field").querySelector(".label"));   // HERESY 1169: the Writer's lyrics numbered, marked, their tags lit; its label says the keys

  // Each dice toggles: an empty box (random each run) gets a seed to keep or edit; a seed is cleared
  var DICE = [["lmSeed", "rollLmSeed", "music seed"], ["soundSeed", "rollSoundSeed", "sound seed"]];
  function paintDice() {
    DICE.forEach(function (d) {
      var set = !!$(d[0]).value.trim(), dice = $(d[1]);
      var tip = set ? "Clear the " + d[2] + ": every run picks a random one again"
                    : "Put in a random " + d[2] + ", to keep or edit (press again to clear it)";
      dice.classList.toggle("is-set", set);
      dice.dataset.tip = tip;
      dice.setAttribute("aria-label", tip);
    });
  }
  DICE.forEach(function (d) {
    $(d[1]).addEventListener("click", function () {
      $(d[0]).value = $(d[0]).value.trim() ? "" : Math.floor(Math.random() * 2147483647);
      paintDice();
    });
    $(d[0]).addEventListener("input", paintDice);
    $(d[1]).addEventListener("mouseover", paintDice);   // seeds the page fills in (Retake, a plan) fire no input
  });
  paintDice();
  // HERESY 1330: each seed's mode beside its dice (Random −1, Random fixed, Fixed, Next, Previous)
  var SEEDMODE = window.HeresySeedMode ? { music: HeresySeedMode.attach($("lmSeed"), "yue2.seedMode.music", { after: $("rollLmSeed").parentNode, big: true }),
                                          sound: HeresySeedMode.attach($("soundSeed"), "yue2.seedMode.sound", { after: $("rollSoundSeed").parentNode, big: true }) } : {};
  ["lmSeed", "soundSeed"].forEach(function (id) { $(id).addEventListener("input", paintDice); });

  // A new song: everything about the song back to its default; the VAE, output and theme choices stay
  // HERESY 1288 (Viktor 09.10.2026, the studio in Pinokio: «можно будет в Пинокио Ctrl+N использовать»): Ctrl+N is New song,
  // in the Creator, where the page is handed the key (Pinokio's window); a browser keeps Ctrl+N for its own new window
  document.addEventListener("keydown", function (e) {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || (e.code !== "KeyN" && (e.key || "").toLowerCase() !== "n")) return;
    e.preventDefault();
    if (document.querySelector(".hd-back.is-on")) return;          // a question open: it is answered first
    if (document.body.dataset.tab !== "create") setTab("create");
    $("newSong").click();
  });
  function newSong() {
    ["title", "titleVersion", "style", "lyrics", "abc", "lmSeed", "soundSeed", "cfg", "cfgLyrics"].forEach(function (id) { if ($(id)) $(id).value = ""; });   // HERESY 1614: the version too   // HERESY 1397
    $("cfgLyrics").value = LYRICS_CFG;                   // HERESY 1400: a new song starts with the two apart
    setCot("full");                                   // HERESY 1169 · 1253 (Viktor 08.10.2026: «Full as the default»; 1167 had Direct)
    $("instrumental").checked = false;
    if (window.HeresyHarmony) HeresyHarmony.set(HeresyHarmony.dflt);   // HERESY 1613: Chords back to Gentle
    all("input[data-group]").forEach(function (input) {
      input.value = round(samplingDefault(input.dataset.group, input.dataset.key), 6);
    });
    $("cfg").dataset.touched = "";
    fillCfg();
    syncShape();
    $("versions").value = 1;
    $("variations").value = 1;
    paintCounts();
    STATE.sliderChoice = [];
    paintSliders();
    YueLoras.set([]);
    setCodes(null);
    $("scoreDrawer").open = false;
    growLyrics();
    paintDice();
    show("compose");
    $("view-compose").scrollTop = 0;
    $("title").focus();
    toast("New song: the form is back to its defaults (your VAE, output and theme choices stay)");
  }
  // HERESY 1167 (Viktor: «кнопка New Song… без сторожа и диалогового окна всё сотрёт в формах»): it asks first, as Clear
  $("newSong").addEventListener("click", function () {
    window.HeresyDialog.confirm("Start a new song?\n\nIts title, style, lyrics, score, seeds, the mode, sampling and LoRAs go back to the defaults. Sound and output (VAE, solver, steps, length, format) and the takes stay.",
      { ok: "New song", danger: true }).then(function (yes) { if (yes) newSong(); });
  });
  // HERESY 1167 (Viktor: «Кнопка CLEAR не имеет сторожа. Нечаянно нажал - и полетели все формы в пустоту»): it asks first.
  // HERESY 1168 (Viktor: «Кнопка Clear the Form очищает только формы? Не трогает LoRA и другие параметры? И чем она отличается
  // от `Start new song`? Это нужно утрясти»): it did the same as New song. Now Clear takes the words away (title, style,
  // lyrics, the score), the seeds and loaded music codes with them; the machine stays as set: mode, sampling, guidance,
  // sliders, LoRAs, Instrumental, VAE and output. New song puts the machine back to its defaults too.
  function clearWords() {
    ["title", "titleVersion", "style", "lyrics", "abc", "lmSeed", "soundSeed"].forEach(function (id) { if ($(id)) $(id).value = ""; });   // HERESY 1614: the version too
    setCodes(null);
    ["style", "lyrics", "abc"].forEach(function (id) { $(id).dispatchEvent(new Event("input", { bubbles: true })); });
    $("scoreDrawer").open = false;
    growLyrics();
    paintDice();
    $("view-compose").scrollTop = 0;
    $("title").focus();
    toast("Cleared: the words, the score, the seeds and loaded codes; the mode, knobs and LoRAs stay");
  }
  $("clearForm").addEventListener("click", function () {
    window.HeresyDialog.confirm("Clear the words?\n\nThe title, style, lyrics, score, both seeds and loaded music codes go. The mode, sampling, LoRAs and Sound and output stay as they are; New song puts the mode, sampling and LoRAs back to the defaults too.",
      { ok: "Clear the words", danger: true }).then(function (yes) { if (yes) clearWords(); });
  });

  // HERESY 1035: a menu: a random official demo, or one of ours by name, grouped (Readings…)
  function loadExample(ex) {
    keepForm("before");                                // HERESY 1596: the form as it was, kept before an example replaces it
    setTitle(ex.title || "");   // HERESY 1614
    $("style").value = String(ex.style || "").trim();
    $("lyrics").value = ex.lyrics || "";
    $("abc").value = ex.abc || "";
    $("lmSeed").value = ex.seed !== undefined && ex.seed !== null && /^\d+$/.test(String(ex.seed)) ? String(ex.seed) : "";
    $("soundSeed").value = "";
    paintDice();
    setCodes(null);
    setCot(ex.cot || "full");
    if (ex.abc) $("scoreDrawer").open = true;
    ["style", "lyrics", "abc"].forEach(function (id) { $(id).dispatchEvent(new Event("input", { bubbles: true })); });
    growLyrics();
    toast("Example loaded: " + (ex.title || "untitled") + (ex.abc ? " (with its score)" : "") + (ex.cot === "off" ? " · Direct mode" : ""));
  }
  (function () {
    var examples = window.YUE2_EXAMPLES || [], official = examples.filter(function (e) { return !e.group; }), groups = {};
    examples.forEach(function (e, i) { if (e.group) (groups[e.group] = groups[e.group] || []).push(i); });
    $("exampleMenu").innerHTML = '<button type="button" role="menuitem" data-example="random">A random official demo <span class="menu-note">' + official.length + "</span></button>" +
      Object.keys(groups).map(function (g) {
        return '<div class="menu-cap">' + escape(g) + "</div>" + groups[g].map(function (i) {
          return '<button type="button" role="menuitem" data-example="' + i + '">' + escape(examples[i].title || "untitled") + "</button>";
        }).join("");
      }).join("");
    menuToggle("loadExample", "exampleMenu");
    $("exampleMenu").addEventListener("click", function (event) {
      var b = event.target.closest("[data-example]");
      if (!b) return;
      closeMenus();
      if (b.dataset.example === "random") {
        if (!official.length) return toast("No examples were built into this page", "bad");
        return loadExample(official[Math.floor(Math.random() * official.length)]);
      }
      loadExample(examples[+b.dataset.example]);
    });
  })();

  // HERESY 1169 (the rc3 list: «Every button that cannot be undone behind a dialog»): a score in the form is not taken away
  // or written over without a word (an empty field, or the same example again, is simply done)
  all("[data-abc]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var key = btn.dataset.abc, now = $("abc").value.trim();
      var go = !now || (key && now === String(EXAMPLE_ABC[key]).trim()) ? Promise.resolve(true) : window.HeresyDialog.confirm(key
        ? "Replace the score in the form with the example?\n\nThe score there now is kept nowhere else: save the song first (the Save button above) to keep it."
        : "Remove the score from the form?\n\nIt is kept nowhere else: save the song first (the Save button above) to keep it.", { ok: key ? "Replace" : "Remove", danger: !key });
      go.then(function (ok) {
        if (!ok) return;
        keepForm("before");                            // HERESY 1596
        if (!key) { $("abc").value = ""; return toast("Score removed"); }
        $("abc").value = EXAMPLE_ABC[key];
        toast("Score loaded — melody mode suits covers best");
      });
    });
  });

  function readSeed(id, label) {
    var raw = $(id).value.trim();
    if (!raw) return null;
    if (!/^\d+$/.test(raw)) throw new Error(label + " must be a whole number, or blank for random");
    if (BigInt(raw) >= (BigInt(1) << BigInt(63))) throw new Error(label + " must be below 2^63");
    return BigInt(raw).toString();
  }

  // HERESY 1040: a title is at most 80 characters, and never carries the invisible characters that
  // reorder or hide text (bidi overrides and isolates, zero-width marks, controls): they can make a
  // file name or a list read other than it is. Plain right-to-left text (Hebrew) is untouched.
  var TITLE_MAX = 80;
  var TITLE_BAD = /[\u0000-\u001f\u007f-\u009f\u200b-\u200d\u2060-\u2064\u202a-\u202e\u2066-\u2069\ufeff\ufff9-\ufffb]/g;
  function cleanTitle(text) {
    var raw = String(text || ""), clean = raw.replace(TITLE_BAD, "").replace(/\s+/g, " ").trim();
    var chars = Array.from(clean);
    if (chars.length > TITLE_MAX) clean = chars.slice(0, TITLE_MAX).join("").trim();
    return { text: clean, removed: raw.replace(/\s+/g, " ").trim().replace(TITLE_BAD, "") !== raw.replace(/\s+/g, " ").trim() };
  }
  // HERESY 1614 (Viktor 19.10.2026: «В Title имеем чистое название трека, а во втором Version - его версию, и сторож только по числам и
  // точкам»): the version apart from the name; what goes out is «Name vN.N», as his tracks are called, and comes back split
  var VERSION_TAIL = /^(.*\S)\s+v(\d+(?:\.\d+)*)$/i;
  function cleanVersion(v) { return String(v || "").replace(/[^0-9.]/g, "").replace(/\.{2,}/g, ".").replace(/^\.+/, ""); }
  function titleVersion() { return $("titleVersion") ? cleanVersion($("titleVersion").value).replace(/\.+$/, "") : ""; }
  function fullTitle() { var t = $("title").value.trim(), v = titleVersion(); return t && v ? t + " v" + v : t; }
  function splitTitle(full) { var t = String(full || "").trim(), m = VERSION_TAIL.exec(t); return m ? { name: m[1], version: m[2] } : { name: String(full || ""), version: "" }; }
  function setTitleParts(name, version) { $("title").value = name; if ($("titleVersion")) $("titleVersion").value = cleanVersion(version).replace(/\.+$/, ""); }
  function setTitle(full) { var p = splitTitle(full); setTitleParts(p.name, p.version); }
  window.ruachTitle = { full: fullTitle, set: setTitle, split: splitTitle };
  if ($("titleVersion")) {
    $("titleVersion").addEventListener("input", function () {     // the guard: digits and dots, none doubled, none first
      var c = cleanVersion(this.value);
      if (c !== this.value) { var at = Math.max(0, (this.selectionStart || 0) - (this.value.length - c.length)); this.value = c; this.setSelectionRange(at, at); }
    });
    $("titleVersion").addEventListener("change", function () { this.value = cleanVersion(this.value).replace(/\.+$/, ""); });
  }
  $("title").addEventListener("change", function () {             // a title typed or pasted with its version splits into the two
    var p = splitTitle(this.value);
    if (p.version && !titleVersion()) { setTitleParts(p.name, p.version); $("title").dispatchEvent(new Event("input", { bubbles: true })); }
  });
  $("title").addEventListener("input", function () {
    var c = cleanTitle(this.value);
    if (c.removed) {
      var at = this.selectionStart;
      this.value = c.text;
      try { this.setSelectionRange(at - 1, at - 1); } catch (e) { /* not a text field now */ }
      toast("Invisible control characters were taken out of the title (they can reorder or hide text)", "bad");
    }
  });

  // What the take is called when no title was typed: the hook line, or the style.
  function songTitle() {
    var title = cleanTitle(fullTitle()).text;   // HERESY 1614: with its version
    if (title) return title;
    var sung = $("lyrics").value.split(/\r?\n/).map(function (l) { return l.trim(); })
      .filter(function (l) { return l && l.charAt(0) !== "[" && l.charAt(0) !== "("; })[0];
    if (sung) return sung.replace(/[,.!?;:]+$/, "").slice(0, 48);
    var style = $("style").value.trim().split(/[,\n]/)[0];
    return style ? style.slice(0, 48) : "Untitled";
  }

  // HERESY 1421 (Viktor 13.10.2026: «Музыкальный стиль скармливаем движку одной строкой, если в поле стиля многострочие - всё
  // объединяем»): the Style's lines go to the engine as one, a comma between two unless the first already ends in one (or ; . : ! ?)
  function styleOneLine(text) {
    return String(text || "").split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean)
      .reduce(function (acc, l) { return !acc ? l : acc + (/[,;.:!?]$/.test(acc) ? " " : ", ") + l; }, "");
  }
  window.ruachStyleOneLine = styleOneLine;

  // One request for a full render or a score-only plan, in the server's own
  // field names. Blank seeds stay out, and the server rolls them.
  function buildRequest(plan, instrumental, loose) {
    var cot = currentCot();
    var abc = $("abc").value.trim();
    // an instrumental picks its own mode from the score
    // (loose, HERESY 1032: the form read as it stands, for a saved profile, with no checks on the texts)
    if (abc && cot === "off" && !instrumental && !loose) throw new Error("Direct mode ignores a supplied score — pick full or melody");
    var style = styleOneLine($("style").value), lyrics = $("lyrics").value;   // HERESY 1421
    if (!style && !lyrics.trim() && !STATE.codes && !loose) throw new Error("Write a style prompt or lyrics first");
    var body = { title: songTitle(), style: style, lyrics: lyrics, cot: cot };
    if (abc) body.abc = abc;
    var lm = readSeed("lmSeed", "Music seed"), sound = readSeed("soundSeed", "Sound seed");
    if (lm !== null) body.lm_seed = lm;
    if (sound !== null) body.seed = sound;
    var cfgRaw = $("cfg").value.trim();
    // the mode default goes out as nothing, exactly as a blank field did
    if (cfgRaw !== "" && parseFloat(cfgRaw) !== defaultCfg(cot)) {
      var cfg = parseFloat(cfgRaw);
      if (!isFinite(cfg) || cfg < 0) throw new Error("Guidance must be a number, 0 or more");
      body.cfg_scale = cfg;
    }
    var lyrRaw = $("cfgLyrics").value.trim();            // HERESY 1397: the lyrics' own guidance; empty: as Guidance
    if (lyrRaw !== "") {
      var lyr = parseFloat(lyrRaw);
      if (!isFinite(lyr) || lyr < 0) throw new Error("Lyrics guidance must be a number, 0 or more");
      body.cfg_lyrics = lyr;
    }
    if (freeTempoOn() && cot !== "off") body.free_tempo = true;   // HERESY 1416: with a score only
    if (cot !== "off" && String(body.abc || "").trim() && $("abcOpening") && $("abcOpening").checked) body.abc_continue = true;   // HERESY 1609: an opening, planned on from
    if (cot !== "off" && (!String(body.abc || "").trim() || body.abc_continue) && harmonyBody()) body.harmony = harmonyBody();   // HERESY 1607: when the model plans the score
    if (cot === "full" && !instrumental && !String(body.abc || "").trim() && !STATE.codes && fullOctave()) body.vocal_octave = fullOctave();   // HERESY 1743: the planned Vocal line
    var abcSampling = samplingOverrides("abc"), semanticSampling = samplingOverrides("semantic");
    if (Object.keys(abcSampling).length) body.abc_sampling = abcSampling;
    if (Object.keys(semanticSampling).length) body.semantic_sampling = semanticSampling;
    body.vae = selectedVae();
    if ($("odeSolver").value !== "midpoint") body.solver = $("odeSolver").value;  // HERESY 1004
    if ($("narDecode").value === "ladder") body.nar_ladder = true;   // HERESY 1768: the decode ladder, experimental, the Creator's own
    if (STATE.sliderChoice.length) {
      body.sliders = slidersBody();             // HERESY 1166: with each one's curve, where it is not flat
    }
    var loras = YueLoras.value();
    if (loras.length) {
      body.loras = loras;
      var budgets = YueLoras.groups ? YueLoras.groups() : [];   // HERESY 1447: the budgets the loras' groups name
      if (budgets.length) body.lora_groups = budgets;
      // HERESY 1167 (Viktor: «суффиксом приклинивай все триггеры в системный промпт»): the adapters' words at the style's end,
      // in the request only (the field stays as written; a word already in it is not doubled)
      var trig = YueLoras.triggersFor ? YueLoras.triggersFor(body.style) : [];
      if (trig.length) body.style = (body.style ? body.style.replace(/[\s,.;]+$/, "") + ", " : "") + trig.join(", ");
    }
    var out = readOutput();
    Object.keys(out).forEach(function (key) { body[key] = out[key]; });
    if (plan) {
      body.plan_only = true;
    } else if (STATE.codes) {
      body.semantic_tokens = STATE.codes.tokens;
      if (STATE.codes.from) body.parent = STATE.codes.from;
    }
    return body;
  }

  function paintSubmitNote() {
    var live = STATE.jobs.filter(function (j) { return isLive(j) && j.kind !== "transcribe"; });
    var note;
    if (!STATE.online) note = "The server is not answering; runs cannot start.";
    else if (live.length) note = "A run is in progress; the next song is queued behind it.";
    else if (STATE.codes) note = "Codes loaded: Generate renders that music again, in seconds.";
    else note = "";   // nothing to say: the bar stays clean
    $("submitNote").textContent = note;
  }

  /* ----------------------------------------------------------- instrumental */
  // The official recipe (instrumental.js): the score's vocal notes move to the
  // instrument voice, the lyrics become the section tags alone, the style gains
  // "Instrumental ... no vocals", and the mode follows the score (chords: full).
  function instrumentalBody(body) {
    var result = YueInstrumental.convert(body.abc);
    $("abc").value = result.abc;
    var cot = YueInstrumental.mode(result.abc);
    var out = Object.assign({}, body, { abc: result.abc, cot: cot, style: YueInstrumental.style(body.style),
      lyrics: YueInstrumental.lyricTags(result.abc) });
    if (out.cfg_scale !== undefined && out.cfg_scale === defaultCfg(cot)) delete out.cfg_scale;
    return { body: out, check: result.check,
      note: result.check.vocalNotes + " vocal notes moved to the instrument, " + (cot === "full" ? "Full plan" : "Melody only") + " mode" };
  }

  // No score yet: plan one (the form's lyrics, or a bare section skeleton), then convert and render it.
  // HERESY 1618: a plan the page asked for is read before it is sung; a broken one is planned again once (a random music seed) or stopped
  function planBroken(abc) {
    if (!window.HeresyAbc || !window.HeresyAbc.parse) return "";
    try { window.HeresyAbc.parse(String(abc || "")); return ""; } catch (e) { return String(e.message || e); }
  }
  window.ruachPlanBroken = planBroken;   // HERESY 1618: for the checks
  // HERESY 1625: the plan's own count, carried to the song it planned (its step 1 says it instead of «Supplied score»)
  function planScoreOf(job) {
    var s = stageOf(job, "score");
    if (!s) return null;
    var n = s.tokens || s.done || 0, secs = s.seconds || (s.t0 && s.t1 ? (s.t1 - s.t0) / 1000 : 0);
    return n ? { tokens: n, seconds: Math.round(secs * 10) / 10 } : null;
  }
  function planAgainOrStop(pending, why, again, job, abc) {
    var fixed = /^\d+$/.test(String(pending.body.lm_seed || "").trim());
    addLogLine("[Plan] the planned score is broken, not sung: " + why, true);
    seedBroke(fixed ? pending.body.lm_seed : job && job.resolved && job.resolved.lm_seed, pending.body.loras, why);   // HERESY 1623
    if (!fixed && !pending.retried) { toast(tr("The planned score is broken ({0}): the model plans it again with a new music seed").replace("{0}", why), "bad"); again(); return; }
    // HERESY 1623: the Babel window says what weighed on the plan, and plans it again with a new seed on a word
    if (job) return showBrokenScore(job, why, abc || "", { fixed: fixed, anew: function () {
      newSeed("lmSeed");
      var v = $("lmSeed").value.trim();
      if (/^\d+$/.test(v)) pending.body.lm_seed = v; else delete pending.body.lm_seed;
      again();
    } });
    toast(tr(fixed ? "The planned score is broken ({0}) and the music seed is fixed: nothing sung. Change the seed, the Chords or the adapters' music strength"
                   : "The planned score is broken again ({0}): nothing sung. Change the Chords or the adapters' music strength").replace("{0}", why), "bad");
  }
  // HERESY 1623: a plan the page asked for that the engine refused (its own guard, 1087) goes the way of one the page found broken (1618)
  function planRefused(job, why, abc) {
    var k = STATE.keyPlan && STATE.keyPlan.job === job.id ? "keyPlan" : STATE.instrumentalPlan && STATE.instrumentalPlan.job === job.id ? "instrumentalPlan" : "";
    if (!k) return false;
    var pending = STATE[k];
    STATE[k] = null;
    planAgainOrStop(pending, why, function () { (k === "keyPlan" ? planForKey : planForInstrumental)(pending.body, pending.versions, true); }, job, abc);
    return true;
  }
  function planForInstrumental(body, versions, retried) {
    if (!body.style) return toast("A style prompt is required", "bad");
    if (document.body.dataset.frame) frameOver("take");   // HERESY 1168: a run starts: the take's frame, where it shows
    var plan = Object.assign({}, body, { plan_only: true, cot: body.cot === "off" ? "full" : body.cot,
      lyrics: body.lyrics.trim() ? body.lyrics : YueInstrumental.planningLyrics });
    var eased = planEased(body, planFused());          // HERESY 1629
    if (eased) planWith(plan, eased);
    $("generateBtn").disabled = true;
    submitJob(plan, { kind: "plan", title: plan.title }).then(function (job) {
      STATE.instrumentalPlan = { job: job.id, versions: versions, body: body, retried: !!retried };   // HERESY 1618
      watchJob(job);
      show("take");
      toast("Instrumental: planning the score first, then the vocal line moves to the instrument and it renders");
    }).catch(function (error) { toast(error.message, "bad"); })
      .then(function () { $("generateBtn").disabled = false; });
  }

  // HERESY 1743 (Viktor 22.10.2026: «автоматом в FULL режиме херачить октавой ниже? И в `Engine > Creator Heresy` дадим настройку по октавам?»): the
  // Vocal line of a score the model plans in Full, moved by the engine before it is sung (each version its own plan); an octave down unless set
  var FULL_OCTAVE_KEY = "yue2.fullOctave", OCTAVE_SAID = { "-2": "Two octaves down", "-1": "An octave down", "0": "As the model wrote it", "1": "An octave up", "2": "Two octaves up" };
  function fullOctave() { var v = parseInt(recall(FULL_OCTAVE_KEY), 10); return isFinite(v) && v >= -2 && v <= 2 ? v : -1; }
  function octaveSaid(v) { return OCTAVE_SAID[String(v)] || String(v); }
  if ($("setFullOctave")) {
    $("setFullOctave").value = String(fullOctave());
    $("setFullOctave").addEventListener("change", function () { store(FULL_OCTAVE_KEY, this.value === "-1" ? null : this.value); });
  }
  window.ruachFullOctave = fullOctave;   // for the checks
  // HERESY 1480: Full with a key chosen beside the title and no score in the form: the score is planned, moved to the key, sung
  function wantedKey() {
    var TRs = window.HeresyTranspose, w = recall("yue2.wantKey");
    var k = w && TRs ? TRs.parseKey(w) : null;
    return k ? TRs.usual(k) : null;
  }
  function toWanted(abc) {                             // the planned score in the wanted key, said; as it came when it cannot move
    var TRs = window.HeresyTranspose, k = wantedKey(), sk = TRs && TRs.scoreKey(abc);
    if (!k || !sk) return { abc: abc, said: "" };
    try {
      var r = TRs.transpose(abc, k, "near");
      var minorOnly = k.mode !== (sk.mode === -3 ? -3 : 0);
      return { abc: r.abc, said: TRs.keyLabel(r.from) + " \u2192 " + TRs.keyLabel(r.to) + (r.semis ? " (" + (r.semis > 0 ? "+" : "") + r.semis + ")" : "") +
               (minorOnly ? "; the planner wrote it in " + (sk.mode === -3 ? "minor" : "major") + ", so " + (sk.mode === -3 ? "minor" : "major") + " it stays" : "") };
    } catch (e) {
      return { abc: abc, said: "it stays in " + TRs.keyLabel(sk) + " (" + e.message + ")" };
    }
  }
  // HERESY 1620: the plan's fuse: the music half's adapters together at most PLAN_AR_SAFE while the score is planned
  var PLAN_AR_SAFE = 1.0;
  // HERESY 1623 (Viktor 20.10.2026: «На IRAEv3 чаще падения, чем на оригинальной и IRA/IRAE. На v3 нужно понижать общее AR адаптеров»): the fuse by the
  // backbone: on IRAEv3 0.8 (at 1.2 together 8 of its 10 plans broke, at 0.87 the one tried came whole), on the others 1.0
  function planArSafe(model) { return /IRAEv3/i.test(String(model !== undefined ? model : (STATE.settings && STATE.settings.model) || "")) ? 0.8 : PLAN_AR_SAFE; }
  window.ruachPlanArSafe = planArSafe;   // for the checks
  function planArSum(body) { return (body.loras || []).reduce(function (s, l) { return s + (+l.ar > 0 ? +l.ar : 0); }, 0); }
  // HERESY 1629 (Viktor 20.10.2026: «Но в Партитуру мы всё равно шлём с лимитом. Также можно секинить адаптеры, которые вообще не должны участвовать в написании
  // ABC, хотя у них есть AR, - но это идёт в синтез»): the adapters out of the score left out of the plan, the rest eased to the fuse; fused false (the Score
  // button, an instrumental's plan): only the ones out of the score, the fuse there only while the sliders are past the limits
  function planEased(body, fused) {
    var all = body.loras || [], out = all.filter(function (l) { return l.noscore && +l.ar > 0; });
    var keep = all.filter(function (l) { return out.indexOf(l) < 0; }), sum = planArSum({ loras: keep }), safe = planArSafe();
    var f = fused !== false && sum > safe + 1e-6 ? safe / sum : 1;
    if (f === 1 && !out.length) return null;
    return { sum: sum, f: f, safe: safe, out: out.map(function (l) { return YueLoras.name ? YueLoras.name(l.id) : l.id; }),
      loras: keep.map(function (l) { return f === 1 ? l : Object.assign({}, l, { ar: Math.round((+l.ar || 0) * f * 1000) / 1000 }); }) };
  }
  function planFused() { return !!(YueLoras.free && YueLoras.free()); }
  function planWith(plan, eased) {                    // the plan's body with the adapters it may take, said in the log
    plan.loras = eased.loras;
    if (!plan.loras.length) { delete plan.loras; delete plan.lora_groups; }
    if (eased.f < 1) addLogLine("[Plan] the adapters' music half " + round(eased.sum, 2) + " together, eased to " + eased.safe + " for the plan (×" + round(eased.f, 3) + "); sung at their own", false);
    if (eased.out.length) addLogLine("[Plan] out of the score: " + eased.out.join(", ") + "; the plan is written without them, they sing it", false);
  }
  function planToast(eased) {
    if (eased.f < 1) toast(tr("The adapters' music strengths add up to {0}: the score is planned with them eased to {1}, then sung at their own").replace("{0}", round(eased.sum, 2)).replace("{1}", eased.safe));
    if (eased.out.length) toast(tr("Out of the score: {0}. The score is planned without them, then sung with them").replace("{0}", eased.out.join(", ")));
  }
  window.ruachPlanEased = planEased;   // for the checks
  function planForKey(body, versions, retried) {
    if (!body.style || !body.lyrics.trim()) return toast("A style prompt and lyrics are both required", "bad");
    if (document.body.dataset.frame) frameOver("take");
    var plan = Object.assign({}, body, { plan_only: true }), eased = planEased(body);
    if (eased) planWith(plan, eased);                    // HERESY 1620: the fuse; 1629: and the adapters out of the score
    $("generateBtn").disabled = true;
    submitJob(plan, { kind: "plan", title: plan.title }).then(function (job) {
      STATE.keyPlan = { job: job.id, versions: versions, body: body, retried: !!retried };   // HERESY 1618
      watchJob(job);
      show("take");
      if (wantedKey()) toast("Full in " + window.HeresyTranspose.keyLabel(wantedKey()) + ": the score is planned first, moved to the key, then sung");
      if (eased) planToast(eased);
    }).catch(function (error) { toast(error.message, "bad"); })
      .then(function () { $("generateBtn").disabled = false; });
  }
  function keyAfterPlan(job, abc) {
    var pending = STATE.keyPlan;
    if (!pending || pending.job !== job.id) return false;
    STATE.keyPlan = null;
    var broken = planBroken(abc);                         // HERESY 1618: never sung off the dialect
    if (broken) { planAgainOrStop(pending, broken, function () { planForKey(pending.body, pending.versions, true); }, job, abc); return true; }
    var moved = toWanted(abc), seed = job.resolved.lm_seed || job.request.lm_seed;
    $("abc").value = moved.abc;
    $("abc").dispatchEvent(new Event("input", { bubbles: true }));
    // HERESY 1623: the plan's seed goes with the song (below), not into the field, which keeps to its mode: written there, the next Generate took it
    // as Fixed, and 26 of 63 runs went on one seed (19–20.10.2026)
    toast("Score planned, " + moved.said + "; singing it now", "good");
    STATE.planScore = planScoreOf(job);                  // HERESY 1625: the plan's count goes with the song
    queueVersions(Object.assign({}, pending.body, { abc: moved.abc, score_planned: true }, seed && /^\d+$/.test(String(seed)) ? { lm_seed: String(seed) } : {}), pending.versions);   // HERESY 1618: planned, not supplied
    return true;
  }

  function instrumentalAfterPlan(job, abc) {
    var pending = STATE.instrumentalPlan;
    if (!pending || pending.job !== job.id) return false;
    STATE.instrumentalPlan = null;
    var broken = planBroken(abc);                         // HERESY 1618
    if (broken) { planAgainOrStop(pending, broken, function () { planForInstrumental(pending.body, pending.versions, true); }, job, abc); return true; }
    var keyed = toWanted(abc);                          // HERESY 1480: an instrumental in the key chosen too
    if (keyed.said) { abc = keyed.abc; toast("The planned score: " + keyed.said); }
    var seed = job.resolved.lm_seed || job.request.lm_seed, made;
    try {
      made = instrumentalBody(Object.assign({}, pending.body, { abc: abc }, seed && /^\d+$/.test(String(seed)) ? { lm_seed: String(seed) } : {}));
    } catch (error) {
      toast("The planned score could not be made instrumental: " + error.message, "bad");
      return true;
    }
    toast("Score planned; " + made.note + ". Rendering the instrumental.", "good");
    made.body.score_planned = true;                       // HERESY 1618: planned, not supplied
    STATE.planScore = planScoreOf(job);                  // HERESY 1625
    queueVersions(made.body, pending.versions);
    return true;
  }

  $("abcInstrumental").addEventListener("click", function () {
    var abc = $("abc").value.trim();
    if (!abc) return toast("Plan or paste a score first; this moves its vocal melody to the instrument", "bad");
    try {
      var result = YueInstrumental.convert(abc);
      keepForm("before");                              // HERESY 1596
      $("abc").value = result.abc;
      $("instrumental").checked = true;
      toast(result.check.vocalNotes + " vocal notes moved to the instrument; Instrumental is on for Generate", "good");
    } catch (error) {
      toast("Cannot convert this score: " + error.message, "bad");
    }
  });

  // HERESY 1169 (Viktor 08.10.2026: «Открыл `[` и не закрыл. Целый блок проебал в синтезе... И из-за этого срань пошла в конце
  // трека»): a tag not closed or astray in the lyrics asks before the run: to the line, or as it is
  // HERESY 1169 · 1327 (Viktor 10.10.2026: «Для кнопки Generate song, если есть уже Score в поле, тогда попап с вопросом… И нужно иметь
  // сторожа для LoRA адаптеров и силы их весов. При изменении силы партитура может сильно изменяться, особенно с Industrial Rock и
  // Instrumental… При FULL режиме всегда держим Supply Your Own Score открытым»): a score remembers the adapters' music halves that wrote it
  // (by its own text, in this browser: a plan, a take's score); Generate with one asks first; Full keeps it open while it holds one
  var scoreAnswered = false;
  function scoreKey(abc) { var s = String(abc || "").trim(), h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return s.length + ":" + h; }
  function arOf(loras) {
    return (loras || []).filter(function (l) { return +l.ar > 0 && !l.muted; }).map(function (l) { return { id: l.id, ar: Math.round(+l.ar * 100) / 100 }; })
      .sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
  }
  function scoreWrittenBy(loras, what) {               // the form's score came from this: its adapters (null: not known)
    try { localStorage.setItem("yue2.scoreFrom", JSON.stringify({ key: scoreKey($("abc").value), loras: loras === null ? null : arOf(loras), what: what || "" })); } catch (e) { /* private mode */ }
    paintScoreGuard();
  }
  function scoreFrom() {
    var abc = $("abc").value.trim();
    if (!abc) return null;
    try { var f = JSON.parse(localStorage.getItem("yue2.scoreFrom") || "null"); return f && f.key === scoreKey(abc) ? f : null; } catch (e) { return null; }
  }
  function scoreLoraDiff() {                            // "" when the adapters are those that wrote it, or that is not known
    var f = scoreFrom();
    if (!f || !f.loras || typeof YueLoras === "undefined") return "";
    var now = arOf(YueLoras.value());
    if (JSON.stringify(now) === JSON.stringify(f.loras)) return "";
    var say = function (list) { return list.length ? YueLoras.describe(list) : tr("no adapters"); };
    return tr("Written with:") + " " + say(f.loras) + ". " + tr("Now:") + " " + say(now) + ".";
  }
  function paintScoreGuard() {
    var g = $("scoreGuard");
    if (!g) return;
    var diff = currentCot() !== "off" ? scoreLoraDiff() : "";
    g.hidden = !diff;
    g.textContent = diff ? "\u26a0 " + diff + " " + tr("At other strengths the music may part from the score (Industrial Rock and instrumentals most): set them back, or plan it anew.") : "";
  }
  function keepScoreOpen() { if (currentCot() === "full" && $("abc").value.trim()) $("scoreDrawer").open = true; }
  function scoreSays() { if (window.YueLoras && YueLoras.scoreSays) YueLoras.scoreSays(); }   // HERESY 1623
  $("abc").addEventListener("input", function () { keepScoreOpen(); paintScoreGuard(); scoreSays(); });
  all('input[name="cot"]').forEach(function (radio) { radio.addEventListener("change", function () { keepScoreOpen(); paintScoreGuard(); scoreSays(); }); });
  $("scoreDrawer").addEventListener("toggle", function () {
    if (this.open || currentCot() !== "full" || !$("abc").value.trim()) return;
    this.open = true;
    toastOnce("score-open", tr("In Full the score stays open while it holds one: empty it, or choose another mode, to fold it"));
  });
  setTimeout(function () { keepScoreOpen(); paintScoreGuard(); scoreSays(); }, 400);   // the draft is back by then
  window.ruachScoreFrom = { set: scoreWrittenBy, get: scoreFrom, diff: scoreLoraDiff };   // for the checks
  window.ruachScoreGuard = paintScoreGuard;
  var lintAnswered = false;
  // HERESY 1623 (Viktor 20.10.2026: «почему у меня те 6 падений были на одном сиде? Потому что генератор партитуры херачит сид сразу же в семплинг…
  // Нужен сторож на сиды. Предупреждение и действие при изменении параметров адаптеров. Держать на том же сиде, или с рандом»): each fixed music seed
  // that went out is remembered with its adapters' music halves and its backbone (the newest 30, in this browser), and one that broke a plan with
  // them; Generate on a fixed music seed whose adapters or backbone moved since, or that broke a plan the model is about to write again, asks first:
  // a new seed, or keep it
  var seedAnswered = false;
  function seedRecipe(loras) { return { model: (STATE.settings && STATE.settings.model) || "", loras: arOf(loras) }; }
  function sameRecipe(a, b) { return !!a && !!b && a.model === b.model && JSON.stringify(a.loras || []) === JSON.stringify(b.loras || []); }
  function seedRuns() { try { var v = JSON.parse(localStorage.getItem("yue2.seedRuns") || "{}"); return v && typeof v === "object" ? v : {}; } catch (e) { return {}; } }
  function keepSeedRun(seed, rec) {
    if (!/^\d+$/.test(String(seed || ""))) return;
    var all = seedRuns();
    all[String(seed)] = rec;
    Object.keys(all).sort(function (a, b) { return (all[b].at || 0) - (all[a].at || 0); }).slice(30).forEach(function (k) { delete all[k]; });
    try { localStorage.setItem("yue2.seedRuns", JSON.stringify(all)); } catch (e) { /* a private window */ }
  }
  function seedRan(body) {                              // a run went out on this music seed: with these adapters (a break with the same ones stays said)
    var r = seedRecipe(body.loras || []), was = seedRuns()[String(body.lm_seed)];
    keepSeedRun(body.lm_seed, Object.assign(r, { at: Date.now(), broke: was && was.broke && sameRecipe(was, r) ? was.broke : null }));
  }
  function seedBroke(seed, loras, why) {
    keepSeedRun(seed, Object.assign(seedRecipe(loras || []), { at: Date.now(), broke: { why: String(why || ""), at: Date.now() } }));
  }
  function newSeed(id) {                                // a new seed as the field's mode has it: Random and Fixed empty it, the others take a new one
    var mode = SEEDMODE[id === "lmSeed" ? "music" : "sound"], m = mode ? mode.mode() : "random";
    $(id).value = m === "roll" || m === "next" || m === "prev" ? String(Math.floor(Math.random() * 2147483647)) : "";
    $(id).dispatchEvent(new Event("input", { bubbles: true }));
    paintDice();
  }
  function seedQuestion() {                             // what to ask before this run, or ""
    var seed = $("lmSeed").value.trim();
    if (!/^\d+$/.test(seed) || STATE.codes || typeof YueLoras === "undefined") return "";
    var rec = seedRuns()[seed];
    if (!rec) return "";
    var now = seedRecipe(YueLoras.value()), same = sameRecipe(rec, now), plans = currentCot() !== "off" && !$("abc").value.trim();
    var say = function (r) { return ((r.loras || []).length ? YueLoras.describe(r.loras) : tr("no adapters")) + (r.model ? " \u00b7 " + r.model : ""); };
    var broke = rec.broke && plans, head = tr("The music seed {0} is fixed.").replace("{0}", seed), lines = [];
    if (broke) {
      var at = new Date(rec.broke.at), hm = ("0" + at.getHours()).slice(-2) + ":" + ("0" + at.getMinutes()).slice(-2);
      lines.push(tr("It broke the planned score at {0} ({1}) with: {2}.").replace("{0}", hm).replace("{1}", rec.broke.why).replace("{2}", say(rec)));
      if (same) lines.push(tr("From the same seed the model plans the same way: with the same adapters it breaks again."));
    }
    if (!same) lines.push((broke ? "" : tr("It last ran with: {0}. Now: {1}.").replace("{0}", say(rec)).replace("{1}", say(now)) + " ") +
      tr("A fixed seed with other adapters is another song, and a seed that held with the old ones may break the plan with these."));
    if (!lines.length) return "";
    return head + "\n\n" + lines.join("\n") + "\n\n" + tr("A new seed: a new one from this run on, as the seed's mode has it. Keep the seed: this run goes with it.");
  }
  window.ruachSeeds = { question: seedQuestion, ran: seedRan, broke: seedBroke, anew: newSeed };   // for the checks
  $("composeForm").addEventListener("submit", function (event) {
    event.preventDefault();
    // HERESY 1496: an adapter of the song gone from loras/ is never sent: another in its place, out of the song, or the song waits
    if (window.YueLoras && YueLoras.missing && YueLoras.missing().length) {
      if (!YueLoras.askMissing(true)) toast(tr("An adapter of the song is not in loras/ any more: answer its question first"), "bad");
      return;
    }
    if (!lintAnswered && window.HeresyLyrics && window.HeresyDialog) {
      var broken = window.HeresyLyrics.lint($("lyrics").value).filter(function (f) { return f.bad; });
      if (broken.length) {
        window.HeresyDialog.confirm(tr("A tag in the lyrics is not closed or astray: line {0}").replace("{0}", broken[0].line + 1) + "\n\n" +
          tr(broken[0].say) + (broken.length > 1 ? " " + tr("({0} in all)").replace("{0}", broken.length) : "") + "\n\n" +
          tr("What follows a «[» not closed may be lost in the song, and its end may go wrong."),
          { ok: tr("Go to the line"), alt: tr("Generate as it is"), cancel: tr("Stay") }).then(function (r) {
            if (r === "alt") { lintAnswered = true; $("generateBtn").click(); }
            else if (r && lyricsMeter && lyricsMeter.lintNext) lyricsMeter.lintNext(true);
          });
        return;
      }
    }
    // HERESY 1327: a score in the form (Full or Melody, no codes loaded): on it, or a new one? The adapters' difference said
    if (!scoreAnswered && recall("yue2.askScore") !== "off" && currentCot() !== "off" && $("abc").value.trim() && !STATE.codes && window.HeresyDialog) {
      var diff = scoreLoraDiff();
      window.HeresyDialog.confirm(tr("Generate on the score in the form, or write a new one?") + "\n\n" +
        (diff ? tr("The adapters differ from those that wrote this score.") + " " + diff + " " +
          tr("A score follows the adapters it was written with: at other strengths the music may part from it, Industrial Rock and instrumentals most.") + "\n\n" : "") +
        tr("On this score: the music follows it bar by bar. A new score: the song model writes one from the style and the lyrics with new seeds, and this one goes."),
        { ok: tr("On this score"), alt: tr("A new score"), cancel: tr("Stay") }).then(function (r) {
          // HERESY 1623 (Viktor 20.10.2026: «"A New Score" = "New seeds"»)
          if (r === "alt") { $("abc").value = ""; $("abc").dispatchEvent(new Event("input", { bubbles: true })); newSeed("lmSeed"); newSeed("soundSeed"); }
          if (r === true || r === "alt") { scoreAnswered = true; $("generateBtn").click(); }
          else lintAnswered = false;
        });
      return;
    }
    // HERESY 1623: a fixed music seed whose adapters moved, or that broke the plan about to be written: a new seed, or keep it
    var seedAsk = !seedAnswered && recall("yue2.askSeed") !== "off" && window.HeresyDialog ? seedQuestion() : "";
    if (seedAsk) {
      window.HeresyDialog.confirm(seedAsk, { ok: tr("A new seed"), alt: tr("Keep the seed"), cancel: tr("Stay") }).then(function (r) {
        if (r === true) newSeed("lmSeed");
        if (r === true || r === "alt") { seedAnswered = true; $("generateBtn").click(); }
        else { lintAnswered = false; scoreAnswered = false; }
      });
      return;
    }
    scoreAnswered = false;
    lintAnswered = false;
    seedAnswered = false;
    if (!STATE.codes) { if (SEEDMODE.music) SEEDMODE.music.before(); if (SEEDMODE.sound) SEEDMODE.sound.before(); paintDice(); }   // HERESY 1330
    var body, instrumental = $("instrumental").checked;
    try { body = buildRequest(false, instrumental); } catch (error) { return toast(error.message, "bad"); }
    if (/^\d+$/.test(String(body.lm_seed || ""))) seedRan(body);   // HERESY 1623: this seed, with these adapters
    if (alsoChosen().length) body.title = solverTitle(body.title, $("odeSolver").value, parseInt($("odeSteps").value, 10));   // HERESY 1498: whose sound it is
    var versions = Math.max(1, Math.min(10, parseInt($("versions").value, 10) || 1));
    var seedsGone = { music: body.lm_seed, sound: body.seed, versions: versions, variations: body.synth_batch_size || 1 };   // HERESY 1330
    if (instrumental) {
      if (body.semantic_tokens) return toast("Loaded codes already fix the music; clear them to make an instrumental", "bad");
      if (!body.abc) return planForInstrumental(body, versions);
      try {
        var made = instrumentalBody(body);
        body = made.body;
        toast("Instrumental: " + made.note);
      } catch (error) {
        return toast("Cannot make this score instrumental: " + error.message, "bad");
      }
    }
    // HERESY 1480: Full, a key chosen and no score yet: plan, move to the key, sing, in one press
    if (!instrumental && body.cot === "full" && !body.abc && !body.semantic_tokens && (wantedKey() || planEased(body))) {   // HERESY 1620: or the plan's fuse
      planForKey(body, versions);
    } else queueVersions(body, versions);
    if (!body.semantic_tokens) {                         // HERESY 1330: Next or Previous moves past the seeds this Generate used
      if (SEEDMODE.music) SEEDMODE.music.after(seedsGone.versions, seedsGone.music);
      if (SEEDMODE.sound) SEEDMODE.sound.after(seedsGone.variations, seedsGone.sound);
      paintDice();
    }
  });

  // HERESY 1169: what a pass of probes needs on the card, by the parts measured on a 24 GB one (07.10.2026, tmp/claude-vram):
  // the weights as their GGUF weighs (both halves) with the decoder and the engine's base, a KV set 2.63 GiB and two of them a
  // guided probe, the sound's and the decoder's working memory by the song's length (120 s: 4.8 GiB, 452 s: 7.2), a margin
  var MODEL_GIB = { BF16: 6.68, Q8_0: 3.55, Q6_K: 2.74, Q5_K_M: 2.44 };
  // HERESY 1498 (Viktor 16.10.2026: «При смене семплера произошёл OOM… batch=2 убил VRAM»): a probe holds as many KV sets as the engine
  // allocates for it (generate.h: 3 with the lyrics' own guidance since 1397, 2 guided, 1 not), each 2.63 GiB at the whole context and
  // its share at a shorter one; a merge weighs as its quant (IRA-BF16 as BF16). Two guided probes of 2 min with the lyrics' own CFG on BF16
  // asked 16.1 GB of KV over 7.2 GB of weights: no room for the sound (16.10, 16:17 and 16:22)
  function fitBatchFor(vramGib, model, secs, sets, ctxShare) {
    if (!vramGib) return 99;                         // no word from the card: the engine's own limit decides
    var q = String(model || "BF16").split("-").pop(), kv = 2.63 * (sets || 2) * (ctxShare || 1);
    var room = vramGib - 0.6 - ((MODEL_GIB[q] || MODEL_GIB.BF16) + 0.4) - (3.9 + 0.0072 * secs);
    return Math.max(1, Math.floor(room / kv));
  }
  function kvSetsNow() {                              // HERESY 1498: as generate.h counts them for the form as it stands
    var g = parseFloat($("cfg").value), own = $("cfgLyrics").value.trim(), l = parseFloat(own);
    var split = own !== "" && isFinite(l) && l >= 0 && l !== g, guided = !isFinite(g) || g !== 1 || split;
    return split ? 3 : guided ? 2 : 1;
  }
  window.ruachFitBatchFor = fitBatchFor;              // the page's tests read it
  function fitBatch() {
    var ctx = STATE.settings && +STATE.settings.max_seq ? Math.min(1, +STATE.settings.max_seq / fullContext()) : 1;   // HERESY 1498
    return fitBatchFor(gpuGib(), (STATE.settings && STATE.settings.model) || "BF16", parseFloat($("maxLength").value) || outDefault("duration") || 240, kvSetsNow(), ctx);
  }
  function queueVersions(body, versions) {
    // HERESY 1168 (Viktor, the same night: «при начале генерации всё же не нужно схлопывать фрейм… Просто переключаться на
    // правый, где генерация идёт. Так можно стоять в этих оверлеях Вечно»): a lifted frame turns to the take's, the run
    if (document.body.dataset.frame) frameOver("take");
    if (body.semantic_tokens && versions > 1) {
      versions = 1;
      toast("Loaded codes render one song; use Sound variations for more takes of it");
    }
    // HERESY 1169 (Viktor 07.10.2026: «адаптивно под VRAM… + выбор и реальный вес GGUF'ов… дабы избежать OOM»): probes go
    // together only as many as the card holds, by the parts measured on it (fitBatchFor); the engine's max-batch stays above
    var fits = fitBatch(), batch = Math.min(versions, Math.max(1, STATE.maxBatch), fits), passes = Math.ceil(versions / batch);
    if (versions > 1 && fits < Math.min(versions, STATE.maxBatch)) {
      toast("This card holds " + fits + " probe" + (fits === 1 ? "" : "s") + " of this length at once with " + (((STATE.settings && STATE.settings.model) || "BF16")) +
        ": they go " + (fits === 1 ? "one after another" : fits + " at a time"));
    }
    var group = "g" + Date.now(), baseTitle = body.title, first = null, chain = Promise.resolve();
    var words = { title: baseTitle, style: $("style").value, lyrics: $("lyrics").value, abc: $("abc").value };   // HERESY 1519: as the form holds them
    var variations = body.synth_batch_size || 1;
    $("generateBtn").disabled = true;
    for (var i = 0; i < passes; i++) {
      (function (index) {
        chain = chain.then(function () {
          var each = Object.assign({}, body);
          var count = Math.min(batch, versions - index * batch);
          if (count > 1) each.lm_batch_size = count;
          // every pass continues the music seeds where the last one stopped
          if (body.lm_seed !== undefined && index > 0) each.lm_seed = (BigInt(body.lm_seed) + BigInt(index * batch)).toString();
          return submitJob(each, {
            kind: "song", title: baseTitle, group: group, index: index * batch, count: count,
            versioned: versions > 1, variations: variations, baseTitle: baseTitle, words: words,   // HERESY 1498; 1519
            also: alsoChosen().map(function (a) { return each.nar_ladder ? Object.assign({ nar_ladder: true }, a) : a; })   // 1768: the run's decode with them
          }).then(function (job) {
            if (!first) { first = job; watchJob(job); show("take"); }
          });
        });
      })(i);
    }
    chain.then(function () {
      toast(versions > 1
        ? "Queued " + versions + " versions of " + baseTitle + (passes > 1 ? " in " + passes + " passes of up to " + batch : "")
        : "Queued: " + baseTitle);
    }).catch(function (error) {
      toast(error.message, "bad");
    }).then(function () {
      // Runs queue server-side, so the button only stays down for the requests
      // themselves. It must never depend on a later event to come back to life.
      $("generateBtn").disabled = false;
    });
  }

  $("planBtn").addEventListener("click", function () {
    var body, button = this;
    try { body = buildRequest(true); } catch (error) { return toast(error.message, "bad"); }
    if (body.cot === "off") return toast("Planning writes a score: choose Full plan or Melody only", "bad");
    // HERESY 1089 (Viktor, 02.10.2026): a score already in the field gives way to a new one (it used to refuse, and every new
    // plan meant a trip to Supply your own score to empty the box). HERESY 1169 · 1249 (Viktor 08.10.2026: «И даже если есть уже
    // партитура, тоже должна быть активной, с попапом предупреждением о перезаписывании текущего ABC»): only after the question
    var ask = $("abc").value.trim() ? window.HeresyDialog.confirm("Create a new ABC score?\n\nThe score now in the form is written over by the one planned from the style and the lyrics.",
      { ok: "Write over it", danger: true }) : Promise.resolve(true);
    ask.then(function (yes) {
      if (!yes) return;
      if ($("abc").value.trim()) {
        $("abc").value = "";
        $("abc").dispatchEvent(new Event("input", { bubbles: true }));
        try { body = buildRequest(true); } catch (error) { return toast(error.message, "bad"); }
      }
      if (!body.style || !body.lyrics.trim()) return toast("A style prompt and lyrics are both required", "bad");
      var eased = planEased(body, planFused());      // HERESY 1629: the ones out of the score left out; past the limits, the fuse
      if (eased) planWith(body, eased);
      button.disabled = true;
      submitJob(body, { kind: "plan", title: body.title }).then(function (job) {
        watchJob(job);
        show("take");
        toast("Creating the ABC score for " + job.title);
        if (eased) planToast(eased);
      }).catch(function (error) { toast(error.message, "bad"); })
        .then(function () { button.disabled = false; paintPlanBtn(); });
    });
  });

  /* ------------------------------------------------- prompt files (open/save) */

  function seedText(value) {
    var text = value === undefined || value === null ? "" : String(value).trim();
    return /^\d+$/.test(text) ? text : "";
  }

  // Fill the form from a request (a saved prompt, or a take's replay request).
  function loadRequestIntoForm(req, opts) {
    opts = opts || {};
    keepForm("before");                                // HERESY 1596: a take's or a recipe's words over the form: the form as it was kept
    setTitle(opts.title !== undefined ? opts.title : String(req.title || ""));   // HERESY 1614: «Name vN.N» into its two fields
    $("style").value = String(req.style || "");
    $("lyrics").value = String(req.lyrics || "");
    $("abc").value = String(req.abc || "");
    if (req.abc) $("scoreDrawer").open = true;
    if (req.abc && !scoreFrom()) scoreWrittenBy(req.loras || [], "its take");   // HERESY 1327: the adapters its own score was written with
    setTimeout(function () { keepScoreOpen(); paintScoreGuard(); }, 0);
    $("lmSeed").value = seedText(req.lm_seed);
    $("soundSeed").value = seedText(req.seed);
    paintDice();
    var cot = MODES[req.cot] ? req.cot : "full";
    document.querySelector('input[name="cot"][value="' + cot + '"]').checked = true;
    paintPlanBtn();   // HERESY 1169 · 1249 (Viktor: «Кнопка … в режиме FULL неактивна»): a mode set here (the draft on load, Retake, Reuse, a prompt file) moved no change event, and the button kept the Direct it was first painted in
    $("cfgLyrics").value = typeof req.cfg_lyrics === "number" && req.cfg_lyrics >= 0 ? round(req.cfg_lyrics, 4) : "";   // HERESY 1397
    setFreeTempo(req.free_tempo === true);                // HERESY 1416: a take's own, the draft's, a prompt file's
    // HERESY 1607; 1613: a draft kept before Chords existed has no «harmony» and keeps the default; a take or a file opens as it was made
    if (!opts.draft || Object.prototype.hasOwnProperty.call(req, "harmony")) setHarmony(harmonyLevelOf(req.harmony));
    if ($("abcOpening")) $("abcOpening").checked = req.abc_continue === true;   // HERESY 1609
    STATE.tempoAsked = TEMPO_FREE.test(String(req.style || "")) && !STYLE_BPM.test(String(req.style || ""));
    setTimeout(cfgLights, 0);                            // HERESY 1400
    if (typeof req.cfg_scale === "number" && req.cfg_scale >= 0 && round(req.cfg_scale, 4) !== defaultCfg(cot)) {
      $("cfg").value = round(req.cfg_scale, 4);
      $("cfg").dataset.touched = "1";
    } else {
      $("cfg").dataset.touched = "";
    }
    fillCfg();
    ["abc", "semantic"].forEach(function (group) {
      var preset = req[group + "_sampling"] || {};
      all('input[data-group="' + group + '"]').forEach(function (input) {
        var value = preset[input.dataset.key];
        input.value = typeof value === "number" && isFinite(value) ? round(value, 6) : round(samplingDefault(group, input.dataset.key), 6);
      });
    });
    if (req.vae && vaeInfo(req.vae)) { checkVae(req.vae); store("yue2.vae", req.vae); }
    var known = sliderLabels();
    STATE.sliderChoice = (Array.isArray(req.sliders) ? req.sliders : []).filter(function (c) {
      return c && known[c.id] !== undefined;
    }).map(function (c) {
      var strength = typeof c.strength === "number" ? c.strength : 1;
      var out = { id: String(c.id), strength: round(Math.min(1, Math.max(0, strength)), 2) }, curve = curveClean(c.curve);
      if (curve) out.curve = curve;            // HERESY 1166: its curve, as the take ran it
      return out;
    });
    YueLoras.set(Array.isArray(req.loras) ? req.loras : [], Array.isArray(req.lora_groups) ? req.lora_groups : undefined);   // HERESY 1447
    if (typeof req.steps === "number") { $("odeSteps").value = req.steps; syncStepsRange(); }   // HERESY 1498
    else { $("odeSteps").value = String(engineSteps()); syncStepsRange(); }   // HERESY 1710: a request without steps was made at the engine's
    $("odeSolver").value = ["midpoint", "multistep", "heun", "euler"].indexOf(req.solver) >= 0 ? req.solver : "midpoint";
    $("narDecode").value = req.nar_ladder === true ? "ladder" : "standard";   // HERESY 1768: a take's own, the draft's, a profile's
    if (typeof req.duration === "number") $("maxLength").value = round(req.duration, 3);
    $("variations").value = typeof req.synth_batch_size === "number" ? Math.max(1, Math.min(9, req.synth_batch_size)) : 1;
    if (FORMAT_LABELS[req.output_format]) $("outFormat").value = req.output_format;
    if (typeof req.mp3_bitrate === "number" && $("mp3Bitrate").querySelector('option[value="' + req.mp3_bitrate + '"]')) {
      $("mp3Bitrate").value = String(req.mp3_bitrate);
    }
    if (typeof req.peak_clip === "number") $("peakClip").value = req.peak_clip;
    $("versions").value = typeof req.lm_batch_size === "number" ? Math.max(1, Math.min(10, req.lm_batch_size)) : 1;
    paintCounts();
    var tokens = typeof req.semantic_tokens === "string" ? req.semantic_tokens.trim() : "";
    setCodes(tokens ? { tokens: tokens, from: opts.fromTake || null, title: opts.codesTitle || $("title").value,
                        frames: countCodes(tokens) } : null);
    // HERESY 1167: the music's ceiling follows Max length now; a prompt that capped the music lower than its Max length
    // gets that as its Max length (the engine took the lower of the two either way)
    var semCap = req.semantic_sampling && req.semantic_sampling.max_tokens, lenNow = parseFloat($("maxLength").value);
    if (typeof semCap === "number" && semCap > 0 && (!isFinite(lenNow) || semCap / FRAME_RATE < lenNow)) $("maxLength").value = round(semCap / FRAME_RATE, 3);
    clampLength("This take's length");   // HERESY 1468: a longer one comes in at the mode's top, said aloud
    syncShape();
    paintOutput();
    growLyrics();
    queueComfort();   // HERESY 1145: every box's height, the style's too: Retake, Reuse and Open land after their click
  }

  // HERESY 1168 (Viktor 07.10.2026, of Open: «О том, что сброшено, Open молчит… да, конечно, это нужно допилить»): what of a
  // prompt file does not come into the form as written is said when it opens. A file that loads «clean» but lost a field, a
  // mode or an adapter on the way lies; each such place says what was there and what the form holds instead.
  // HERESY 1607, 1609: harmony and abc_continue among a prompt file's keys
  var PROMPT_KEYS = ["title", "style", "lyrics", "cot", "abc", "abc_continue", "lm_seed", "seed", "cfg_scale", "cfg_lyrics", "free_tempo", "vocal_octave", "harmony", "abc_sampling", "semantic_sampling",
    "vae", "solver", "nar_ladder", "sliders", "loras", "lora_groups", "plan_only", "semantic_tokens", "semantic_keep", "parent", "duration", "steps",
    "lm_batch_size", "synth_batch_size", "output_format", "mp3_bitrate", "peak_clip", "score_guard", "seconds", "instrumental"];
  var GROUP_NAMES = { abc: "Score planner", semantic: "Music tokens" };
  function openNotes(req) {
    var notes = [], say = function (text) { notes.push(text); };
    var q = function (v) { return "«" + (typeof v === "string" ? v : JSON.stringify(v)) + "»"; };
    var given = function (v) { return v !== undefined && v !== null && v !== ""; };
    var isNum = function (v) { return typeof v === "number" && isFinite(v); };
    Object.keys(req).forEach(function (k) {
      if (PROMPT_KEYS.indexOf(k) < 0) say(tr("{0}: no such field in a prompt, left out").replace("{0}", k));
    });
    if (!given(req.cot)) say(tr("No mode in the file: Full plan"));
    else if (!MODES[req.cot]) say(tr("Mode {0} unknown: Full plan").replace("{0}", q(req.cot)));
    if (given(req.lm_seed) && !seedText(req.lm_seed)) say(tr("Music seed {0} is no whole number: left empty (a random one)").replace("{0}", q(req.lm_seed)));
    if (given(req.seed) && !seedText(req.seed)) say(tr("Sound seed {0} is no whole number: left empty (a random one)").replace("{0}", q(req.seed)));
    if (given(req.cfg_scale) && !isNum(req.cfg_scale)) say(tr("Guidance {0} is no number: the mode's own").replace("{0}", q(req.cfg_scale)));
    ["abc", "semantic"].forEach(function (group) {
      var set = req[group + "_sampling"];
      if (!given(set)) return;
      if (typeof set !== "object" || Array.isArray(set)) { say(tr("{0}: not a set of knobs, the defaults").replace("{0}", GROUP_NAMES[group])); return; }
      Object.keys(set).forEach(function (k) {
        var knob = SAMPLER_KNOBS.filter(function (x) { return x[0] === k; })[0];
        if (!knob) say(tr("{0}: {1} unknown, left out").replace("{0}", GROUP_NAMES[group]).replace("{1}", k));
        else if (!isNum(set[k])) say(tr("{0} · {1} {2} is no number: its default").replace("{0}", GROUP_NAMES[group]).replace("{1}", knob[1]).replace("{2}", q(set[k])));
      });
    });
    if (given(req.vae) && !vaeInfo(req.vae)) say(tr("VAE {0} is not installed: yours stays").replace("{0}", q(req.vae)));
    if (given(req.sliders) && !Array.isArray(req.sliders)) say(tr("{0}: not a list, left out").replace("{0}", "sliders"));
    else if (Array.isArray(req.sliders)) {
      var known = sliderLabels();
      req.sliders.forEach(function (c) {
        if (!c || known[c.id] === undefined) say(tr("Slider {0} is not installed: left out").replace("{0}", q(c && c.id)));
        else if (isNum(c.strength) && (c.strength < 0 || c.strength > 1)) say(tr("Slider {0}: strength {1} kept within 0–1").replace("{0}", known[c.id] || c.id).replace("{1}", c.strength));
      });
    }
    if (given(req.loras) && !Array.isArray(req.loras)) say(tr("{0}: not a list, left out").replace("{0}", "loras"));
    else if (Array.isArray(req.loras)) {
      req.loras.forEach(function (c) {
        var id = c && String(c.id || "");
        if (!id || !(Number(c.ar) || Number(c.nar))) say(tr("Adapter {0} has no strength: left out").replace("{0}", q(id ? YueLoras.name(id) : c)));
        else if (YueLoras.has && YueLoras.has(id) === false) say(tr("Adapter {0} is not in loras/: the run cannot load it").replace("{0}", q(YueLoras.name(id))));
      });
    }
    if (given(req.steps) && !isNum(req.steps)) say(tr("Steps {0} is no number: yours stay").replace("{0}", q(req.steps)));
    if (given(req.solver) && ["midpoint", "multistep", "heun", "euler"].indexOf(req.solver) < 0) say(tr("Solver {0} unknown: midpoint").replace("{0}", q(req.solver)));
    if (given(req.duration) && !isNum(req.duration)) say(tr("Max length {0} is no number: yours stays").replace("{0}", q(req.duration)));
    // HERESY 1743: the planned Vocal line's octaves are the Engine's Creator Heresy, not the form's: a file with no score that names others says so
    if (given(req.vocal_octave) && !String(req.abc || "").trim() && +req.vocal_octave !== fullOctave()) say(tr("Vocal line {0}: the Engine's Creator Heresy decides it, now {1}").replace("{0}", tr(octaveSaid(req.vocal_octave))).replace("{1}", tr(octaveSaid(fullOctave()))));
    [["synth_batch_size", "Variations", 9], ["lm_batch_size", "Versions", 10]].forEach(function (f) {
      var v = req[f[0]];
      if (!given(v)) return;
      if (!isNum(v)) say(tr("{0} {1} is no number: 1").replace("{0}", f[1]).replace("{1}", q(v)));
      else if (v < 1 || v > f[2]) say(tr("{0} {1} kept within 1–{2}").replace("{0}", f[1]).replace("{1}", v).replace("{2}", f[2]));
    });
    if (given(req.output_format) && !FORMAT_LABELS[req.output_format]) say(tr("Format {0} unknown: yours stays").replace("{0}", q(req.output_format)));
    if (given(req.mp3_bitrate) && !(isNum(req.mp3_bitrate) && $("mp3Bitrate").querySelector('option[value="' + req.mp3_bitrate + '"]'))) {
      say(tr("MP3 bitrate {0} is not offered: yours stays").replace("{0}", q(req.mp3_bitrate)));
    }
    if (given(req.peak_clip) && !isNum(req.peak_clip)) say(tr("Peak clip {0} is no number: yours stays").replace("{0}", q(req.peak_clip)));
    return notes;
  }
  // after the load: a sampling knob past its bounds comes inside them, as one typed would (guardKnob), and says so
  function openHoldKnobs() {
    var notes = [];
    all("input[data-group]").forEach(function (input) {
      var key = input.dataset.key, b = knobBounds(input.dataset.group, key), v = parseFloat(input.value);
      if (!b || /_tokens$/.test(key) || !isFinite(v) || (v >= b[0] && v <= b[1])) return;
      input.value = Math.min(b[1], Math.max(b[0], v));
      var knob = SAMPLER_KNOBS.filter(function (x) { return x[0] === key; })[0];
      notes.push(tr("{0} · {1} {2} kept within {3}–{4}").replace("{0}", GROUP_NAMES[input.dataset.group]).replace("{1}", knob ? knob[1] : key)
        .replace("{2}", v).replace("{3}", b[0]).replace("{4}", b[1]));
    });
    if (notes.length) syncShape();
    return notes;
  }
  // a toast with a list under its first line, longer on screen the longer the list
  function toastList(head, lines, kind) {
    var el = document.createElement("div"), shown = lines.slice(0, 12);
    el.className = "toast" + (kind ? " " + kind : "");
    el.textContent = head;
    if (lines.length > 12) shown.push(tr("and {0} more").replace("{0}", lines.length - 12));
    shown.forEach(function (line) { var d = document.createElement("div"); d.className = "toast-why"; d.textContent = "· " + line; el.appendChild(d); });
    $("toasts").appendChild(el);
    setTimeout(function () {
      el.style.transition = "opacity .3s ease";
      el.style.opacity = "0";
      setTimeout(function () { el.remove(); }, 320);
    }, Math.min(32000, 9200 + 1800 * shown.length));
  }

  $("openPrompt").addEventListener("click", function () { $("openFile").click(); });

  $("openFile").addEventListener("change", function () {
    var file = this.files[0];
    this.value = "";
    if (!file) return;
    var ext = (file.name.split(".").pop() || "").toLowerCase();
    file.text().then(function (text) {
      var req = ext === "json" ? parseJSON(text) : parseYAML(text);
      if (!req || typeof req !== "object" || Array.isArray(req)) throw new Error("not a prompt");
      var notes = openNotes(req);                   // HERESY 1168: read before the form takes it
      loadRequestIntoForm(req, { title: String(req.title || file.name.replace(/\.(json|ya?ml)$/i, "")),
                                 codesTitle: file.name });
      notes = notes.concat(openHoldKnobs());
      if (notes.length) {
        toastList(tr("Prompt loaded from {0}; {1} not as in the file:").replace("{0}", file.name).replace("{1}", notes.length), notes, "warn");
      } else {
        toast("Prompt loaded from " + file.name, "good");
      }
    }).catch(function (error) {
      toast("Could not read " + file.name + " as a prompt (" + error.message + ")", "bad");
    });
  });

  $("saveMenu").addEventListener("click", function (event) {
    var button = event.target.closest("[data-save]");
    if (!button) return;
    closeMenus();
    var body;
    try { body = buildRequest(false); } catch (error) { return toast(error.message, "bad"); }
    var versions = Math.max(1, Math.min(STATE.maxBatch, parseInt($("versions").value, 10) || 1));
    if (versions > 1 && !body.semantic_tokens) body.lm_batch_size = versions;
    var name = slug(body.title);
    if (button.dataset.save === "json") downloadText(name + ".json", toJSON(body, 2) + "\n", "application/json");
    else downloadText(name + ".yaml", toYAML(body), "application/x-yaml");
  });

  /* ------------------------------------------------------ YAML, small subset */
  // Enough YAML for request files: maps, lists, block text, plain and quoted
  // scalars. Written the same way it is read. Long integers stay digit strings.

  function yamlScalar(value, key) {
    if (value === null || value === undefined) return "null";
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    var text = String(value);
    if ((key === "lm_seed" || key === "seed") && /^-?\d+$/.test(text)) return text;   // an integer, however long
    if (/^[A-Za-z_][\w .\/+-]*$/.test(text) && !/^(true|false|null|yes|no|on|off|~)$/i.test(text) &&
        !/\s$/.test(text) && !/: |\s#/.test(text)) return text;
    return JSON.stringify(text);
  }

  function toYAML(obj, indent) {
    indent = indent || "";
    var out = "";
    Object.keys(obj).forEach(function (key) {
      var value = obj[key];
      if (value === undefined) return;
      if (Array.isArray(value)) {
        if (!value.length) { out += indent + key + ": []\n"; return; }
        out += indent + key + ":\n";
        value.forEach(function (item) {
          if (item && typeof item === "object") {
            var inner = toYAML(item, indent + "    ");
            out += indent + "  - " + inner.slice(indent.length + 4);
          } else {
            out += indent + "  - " + yamlScalar(item) + "\n";
          }
        });
      } else if (value && typeof value === "object") {
        out += indent + key + ":\n" + toYAML(value, indent + "  ");
      } else if (typeof value === "string" && value.indexOf("\n") >= 0 && /^\S/.test(value) &&
                 !/\r/.test(value) && !/\n\n$/.test(value) && !/[ \t]\n/.test(value)) {
        var keep = /\n$/.test(value);
        out += indent + key + ": |" + (keep ? "" : "-") + "\n" +
          value.replace(/\n$/, "").split("\n").map(function (line) { return line ? indent + "  " + line : ""; }).join("\n") + "\n";
      } else {
        out += indent + key + ": " + yamlScalar(value, key) + "\n";
      }
    });
    return out;
  }

  function parseYAML(text) {
    var lines = String(text).replace(/\r\n?/g, "\n").split("\n"), i = 0;
    var indentOf = function (line) { return line.match(/^ */)[0].length; };
    var blank = function (line) { return /^\s*(#.*)?$/.test(line); };
    var skip = function () { while (i < lines.length && blank(lines[i])) i++; };

    function scalar(raw) {
      var text = raw.trim();
      if (text.charAt(0) === '"') return JSON.parse(text.replace(/\s+#.*$/, "").trim());
      if (text.charAt(0) === "'") return text.replace(/\s+#.*$/, "").trim().slice(1, -1).replace(/''/g, "'");
      text = text.replace(/\s+#.*$/, "");
      if (text === "" || text === "~" || text === "null") return null;
      if (text === "true") return true;
      if (text === "false") return false;
      if (/^-?\d+$/.test(text)) return text.replace("-", "").length > 15 ? text : Number(text);
      if (/^-?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(text)) return Number(text);
      if (/^[\[{]/.test(text)) { try { return JSON.parse(text); } catch (error) { return text; } }
      return text;
    }

    function block(parentIndent, style) {
      var chomp = /-/.test(style) ? "strip" : (/\+/.test(style) ? "keep" : "clip");
      var folded = style.charAt(0) === ">", body = [], width = null;
      while (i < lines.length) {
        var line = lines[i];
        if (line.trim() === "") { body.push(""); i++; continue; }
        var ind = indentOf(line);
        if (ind <= parentIndent) break;
        if (width === null) width = ind;
        body.push(line.slice(Math.min(width, ind)));
        i++;
      }
      var trailing = 0;
      while (body.length && body[body.length - 1] === "") { body.pop(); trailing++; }
      var textOut;
      if (folded) {
        textOut = body.reduce(function (acc, line, n) {
          if (n === 0) return line;
          if (line === "") return acc + "\n";
          return acc + (/\n$/.test(acc) ? "" : " ") + line;
        }, "");
      } else {
        textOut = body.join("\n");
      }
      if (chomp === "clip" && body.length) textOut += "\n";
      if (chomp === "keep") textOut += "\n" + new Array(trailing + 1).join("\n");
      return textOut;
    }

    function value(rest, ownIndent) {
      rest = rest === undefined ? "" : rest;
      var trimmed = rest.trim();
      if (/^[|>][-+0-9]*\s*(#.*)?$/.test(trimmed)) { i++; return block(ownIndent, trimmed.split(/\s/)[0]); }
      if (trimmed === "" || /^#/.test(trimmed)) {
        i++;
        skip();
        if (i >= lines.length) return null;
        var next = lines[i], ind = indentOf(next);
        if (ind > ownIndent) return node(ind);
        if (ind === ownIndent && /^-(\s|$)/.test(next.slice(ind))) return list(ind);
        return null;
      }
      i++;
      return scalar(trimmed);
    }

    function map(indent) {
      var obj = {};
      for (;;) {
        skip();
        if (i >= lines.length) break;
        var line = lines[i], ind = indentOf(line);
        if (ind < indent) break;
        if (ind > indent) throw new Error("unexpected indentation on line " + (i + 1));
        var m = line.slice(ind).match(/^("(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[^\s:#'"][^:#]*?)\s*:(?:\s+(.*)|\s*)$/);
        if (!m) break;
        var key = m[1].charAt(0) === '"' ? JSON.parse(m[1]) : (m[1].charAt(0) === "'" ? m[1].slice(1, -1) : m[1]);
        obj[key] = value(m[2], ind);
      }
      return obj;
    }

    function list(indent) {
      var arr = [];
      for (;;) {
        skip();
        if (i >= lines.length) break;
        var line = lines[i], ind = indentOf(line);
        if (ind !== indent || !/^-(\s|$)/.test(line.slice(ind))) break;
        var rest = line.slice(ind + 1).replace(/^\s+/, "");
        var inner = ind + 1 + (line.slice(ind + 1).length - rest.length);
        if (!rest) { arr.push(value("", ind)); continue; }
        if (/^("(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[^\s:#'"\[{][^:#]*?)\s*:(\s|$)/.test(rest)) {
          lines[i] = new Array(inner + 1).join(" ") + rest;   // a map item: read it in place
          arr.push(map(inner));
        } else {
          arr.push(value(rest, ind));
        }
      }
      return arr;
    }

    function node(indent) {
      skip();
      if (i >= lines.length) return null;
      return /^-(\s|$)/.test(lines[i].slice(indentOf(lines[i]))) ? list(indent) : map(indent);
    }

    skip();
    if (i < lines.length && /^---/.test(lines[i])) i++;
    skip();
    var result = node(i < lines.length ? indentOf(lines[i]) : 0);
    skip();
    if (i < lines.length && !/^(---|\.\.\.)/.test(lines[i])) throw new Error("could not read line " + (i + 1));
    return result;
  }

  /* ------------------------------------------------------------------ jobs */
  /* The server queues runs and answers /job?id= for their state. Progress
     comes from its log stream: each run starts with a "[Server] Job <id>" line
     and every later line belongs to it until the next one. */

  var JOB_KEY = "yue2.jobs";

  function jobById(id) { return STATE.jobs.filter(function (j) { return j.id === id; })[0] || null; }
  function isLive(job) { return job && (job.status === "queued" || job.status === "running" || job.status === "saving"); }

  function stageSkeleton(job) {
    var r = job.request, cot = r.cot || "full";
    var scoreNote = cot === "melody" ? "Melody only, written as ABC" : "Melody and chords, written as ABC";
    var stages = [
      { key: "score", label: "Score", note: scoreNote },
      { key: "tokens", label: "Music tokens", note: "25 per second of music" + (r.songs > 1 ? " · " + r.songs + " songs side by side" : "") },
      { key: "sound", label: "Sound", note: "Flow matching, " + r.steps + " steps" + (r.variations > 1 ? " · " + r.variations + " variations" : "") },
      { key: "decode", label: "Decode", note: "VAE: " + vaeLabel(r.vae || STATE.defaultVae) }
    ];
    stages.forEach(function (s) { s.state = "waiting"; s.done = 0; s.total = 0; s.skipNote = ""; });
    var skip = function (key, note) {
      stages.forEach(function (s) { if (s.key === key) { s.state = "skipped"; s.skipNote = note; } });
    };
    if (r.replay) { skip("score", "Codes supplied: the music is already written"); skip("tokens", "Codes supplied"); }
    else if (cot === "off") skip("score", "Direct mode writes no score");
    else if (r.hasAbc && r.planScore) stages.forEach(function (s) {   // HERESY 1625: planned first, the plan's count stays on the step
      if (s.key === "score") { s.state = "completed"; s.planned = true; s.tokens = s.done = r.planScore.tokens; s.seconds = r.planScore.seconds; }
    });
    else if (r.hasAbc) skip("score", "Supplied score");
    if (r.plan) { skip("tokens", "Plan only: no music"); skip("sound", "Plan only: no audio"); skip("decode", "Plan only: no audio"); }
    return stages;
  }

  function summarize(body) {
    return {
      cot: body.cot || outDefault("cot") || "full",
      hasAbc: !!(body.abc && String(body.abc).trim()),
      replay: !!(body.semantic_tokens && String(body.semantic_tokens).trim()),
      plan: !!body.plan_only,
      steps: body.steps || engineSteps(),                   // HERESY 1710
      songs: body.lm_batch_size || 1,
      variations: body.synth_batch_size || 1,
      vae: body.vae || STATE.defaultVae,
      format: body.output_format || outDefault("output_format"),
      sliders: body.sliders || [],
      lm_seed: body.lm_seed !== undefined ? String(body.lm_seed) : null,
      seed: body.seed !== undefined ? String(body.seed) : null,
      title: body.title || "",
      // HERESY 1623: the adapters and the backbone, for the Babel window and the score's guard (both read an empty list before: «No adapter weighed» with three on)
      loras: (body.loras || []).map(function (l) { return { id: l.id, ar: +l.ar || 0, nar: +l.nar || 0 }; }),
      model: body.backbone || (STATE.settings && STATE.settings.model) || "",   // HERESY 1765: the run's own backbone when it names one
      planScore: body.score_planned && STATE.planScore ? STATE.planScore : null   // HERESY 1625: the plan's count, the page's own
    };
  }

  function makeJob(id, meta, body) {
    var job = {
      id: id, kind: meta.kind, title: meta.title || body.title || "Untitled", group: meta.group || null,
      index: meta.index || 0, count: meta.count || 1, versioned: !!meta.versioned, baseTitle: meta.baseTitle || null,
      variations: meta.variations || body.synth_batch_size || 1, parent: meta.parent || null, what: meta.what || "",
      task: meta.task || null, fileName: meta.fileName || null, also: meta.also || null,   // HERESY 1498: the solvers each take goes through after
      words: meta.words || null,   // HERESY 1519: the form's words the run went with, kept as the Creator's version when it lands
      request: summarize(body), status: "queued", submitted: Date.now(), started: 0, finished: 0,
      takes: [], saved: [], error: "", resolved: {}, notes: {}
    };
    job.stages = stageSkeleton(job);
    return job;
  }

  // A job line can arrive before the POST that queued it has answered; the
  // record the log made then becomes this page's own.
  function registerJob(id, meta, body) {
    var job = jobById(id), fresh = makeJob(id, meta, body);
    if (job) {
      ["kind", "title", "group", "index", "count", "versioned", "baseTitle", "variations", "parent", "what", "task", "fileName", "also", "words"]
        .forEach(function (key) { job[key] = fresh[key]; });
      job.request = fresh.request;
      job.submitted = fresh.submitted;
      job.provisional = false;
      job.external = false;                           // HERESY 1766: the page's own after all (its POST answered after the log showed it)
      var progress = job.stages;
      job.stages = stageSkeleton(job);
      job.stages.forEach(function (s, n) { if (s.state !== "skipped" && !s.planned && progress[n]) Object.assign(s, progress[n], { note: s.note }); });   // 1625
    } else {
      job = fresh;
      STATE.jobs.push(job);
    }
    saveJobs();
    ensurePolling();
    return job;
  }

  // HERESY 1167 (Viktor: «для каждой комнаты поставить сторожа — никаких `All workspaces`. Либо выбрать активный воркспейс,
  // либо создать поддиректорию или новый воркспейс»); 1434 (Viktor 14.10.2026: «если пространство не выбрано, ничего не генерим
  // нигде… В наши 💎 пространства и их сабы - запрет генерации»): before anything that makes a take is sent, the library is read
  // (a Generate in the first seconds after a load waited for nothing before), and a workspace that takes new takes is in hand:
  // never a 💎 set, its sections or a frozen one; else the question; else nothing is sent
  var wsAsking = null;
  function wsGuard() {
    if (wsAsking) return wsAsking;                     // runs sent together (a plan's probes) share one question
    wsAsking = wsGuardNow();
    var clear = function () { wsAsking = null; };
    wsAsking.then(clear, clear);
    return wsAsking;
  }
  function wsGuardNow() {
    var HC = window.HeresyCollection;
    if (!HC || !HC.landable) return Promise.reject(new Error("Nothing sent: the library is not on this page to say where the new takes land"));
    return (HC.loaded() ? Promise.resolve() : HC.reload()).then(function () {
      if (!HC.loaded()) {
        // a studio with no Librarian at all (its /lab/catalog not there: 404) has no workspace to land a take in: nothing to keep
        if (HC.absent && HC.absent()) return { none: true };
        throw new Error("Nothing sent: the Librarian (Forge's lab) does not answer, so a new take would land in no workspace");
      }
      return HC.landable() || HC.firstWs();
    }).then(function (w) {
      if (w && w.none) return "";
      if (w) return w;
      var cur = HC.current();
      return HC.chooseCurrent(cur ? tr("“{0}” takes no new takes (a 💎 set, its section or a frozen workspace). Where do the new takes land?").replace("{0}", cur)
                                  : "Where do the new takes land?").then(function (v) {
        if (!v || !HC.landable()) throw new Error("Nothing sent: choose a workspace for the new takes first");
        return v;
      });
    });
  }
  window.ruachWsGuard = wsGuard;

  function submitJob(body, meta) {
    if (!meta || !meta.guarded) return wsGuard().then(function () { return submitJob(body, Object.assign({}, meta, { guarded: true })); });   // HERESY 1434
    // HERESY 1091: no synthesis on the studio's card while a run trains on it (the lab knows; it says why)
    var free = window.HeresyGpus ? window.HeresyGpus.guard() : Promise.resolve(true);
    return free.then(function (ok) {
      if (!ok) throw new Error("The synthesis waits: the studio\u2019s card is training");
      return post("/synth", body);
    }).then(function (data) {
      var job = registerJob(data.id, meta, body);
      paintAllRuns();
      return job;
    });
  }

  function saveJobs() {
    // Finished runs are only history; keep the newest few in memory.
    var settled = STATE.jobs.filter(function (j) { return !isLive(j) && j !== STATE.job; });
    if (settled.length > 40) {
      var drop = settled.slice(0, settled.length - 40);
      STATE.jobs = STATE.jobs.filter(function (j) { return drop.indexOf(j) < 0; });
    }
    var keep = STATE.jobs.filter(function (j) { return isLive(j) && !j.provisional && j.kind !== "external"; }).map(function (j) {
      return { id: j.id, kind: j.kind, title: j.title, group: j.group, index: j.index, count: j.count, versioned: j.versioned,
               baseTitle: j.baseTitle, variations: j.variations, parent: j.parent, what: j.what, task: j.task,
               fileName: j.fileName, words: j.words || null, request: j.request, submitted: j.submitted, started: j.started || 0, approx: !!j.approx };   // 1168: its clock; 1519: its words
    });
    store(JOB_KEY, keep.length ? JSON.stringify(keep) : null);
  }

  // After a reload, pick up the runs this browser had queued.
  function restoreJobs() {
    var saved = [];
    try { saved = JSON.parse(recall(JOB_KEY) || "[]"); } catch (error) { saved = []; }
    saved.forEach(function (s) {
      if (jobById(s.id)) return;
      var job = {
        id: s.id, kind: s.kind, title: s.title, group: s.group, index: s.index || 0, count: s.count || 1,
        versioned: !!s.versioned, baseTitle: s.baseTitle, variations: s.variations || 1, parent: s.parent, what: s.what || "",
        task: s.task, fileName: s.fileName, words: s.words || null, request: s.request, status: s.started ? "running" : "queued", submitted: s.submitted || Date.now(),
        // HERESY 1168 (Viktor: «Когда идёт генерация, счётчик тикает, но стоит во время генерации нажать F5, счётчик времени
        // обнуляется»): the run's start as this page saw it comes back with it; one it never saw start is marked approximate
        started: s.started || 0, approx: !!s.approx, finished: 0, takes: [], saved: [], error: "", resolved: {}, notes: {}, restored: true
      };
      job.stages = stageSkeleton(job);
      STATE.jobs.push(job);
    });
    if (saved.length) ensurePolling();
  }

  var pollTimer = null;
  function ensurePolling() {
    if (!pollTimer) pollTimer = setInterval(pollJobs, 1000);
    pollJobs();
  }

  function pollJobs() {
    var open = STATE.jobs.filter(function (j) { return isLive(j) && !j.provisional; });
    if (!open.length) { clearInterval(pollTimer); pollTimer = null; return; }
    open.forEach(function (job) {
      if (job.polling) return;
      job.polling = true;
      api("/job?id=" + encodeURIComponent(job.id)).then(function (data) {
        job.polling = false;
        applyStatus(job, data || {});
      }).catch(function (error) {
        job.polling = false;
        if (error.status === 404) failJob(job, "The server no longer knows this run: it was restarted, or the run was dropped from its memory.");
      });
    });
  }

  function applyStatus(job, data) {
    var status = data.status;
    // Synth jobs report the seeds the server resolved, from the moment they are queued.
    if (data.lm_seed !== undefined && data.lm_seed !== null) {
      STATE.statusKnowsQueue = true;
      job.resolved.lm_seed = String(data.lm_seed);
      if (data.seed !== undefined && data.seed !== null) job.resolved.seed = String(data.seed);
    }
    if (status === "queued") {
      STATE.statusKnowsQueue = true;
      paintAllRuns();
      return;
    }
    if (status === "running") {
      // A server that reports "queued" means "running" literally; an older one says
      // "running" for both, and then only the log line tells them apart.
      if (job.status === "queued" && (STATE.statusKnowsQueue || !LOG.connected)) {
        job.status = "running";
        if (!job.started && job.restored) job.approx = true;   // HERESY 1168: started while the page was away: «~»
        job.started = job.started || Date.now();
        saveJobs();                                            // HERESY 1168: its start kept for an F5
        paintAllRuns();
      }
      if (job.restored) job.seenRunning = true;   // HERESY 1168: still running after the F5
      if (job.restored && !job.rewatched && !STATE.job && !STATE.take && job.kind !== "transcribe" && job.kind !== "replay") {
        job.rewatched = true;
        watchJob(job);
      }
      return;
    }
    if (status === "done") return finishJob(job, data);
    if (status === "failed") return failJob(job, data.error || job.lastFatal || "The run failed; the server log (Engine) has the reason.", data);
    if (status === "cancelled") return cancelledJob(job);
  }

  function settle(job, status) {
    setTimeout(refreshHardware, 300);
    job.status = status;
    job.finished = job.finished || Date.now();
    if (!job.started) job.started = job.finished;
    job.stages.forEach(function (s) {
      if (status === "done" && s.state !== "skipped") s.state = "completed";
      if (status !== "done" && s.state === "running") s.state = "failed";
    });
    saveJobs();
    paintAllRuns();
  }

  function failJob(job, message, data) {
    if (!isLive(job)) return;
    job.error = message;
    settle(job, "failed");
    chimeFor(job, false);   // HERESY 1275: two notes down
    if (/^Broken score: /.test(message) && !toasted["babel" + job.id]) {
      toasted["babel" + job.id] = true;
      if (planRefused(job, message.replace(/^Broken score: /, ""), (data && data.abc) || "")) return;   // HERESY 1623
      seedBroke((job.resolved || {}).lm_seed || (job.request || {}).lm_seed, (job.request || {}).loras, message.replace(/^Broken score: /, ""));
      if (job.external) {                             // HERESY 1765: someone else's run: said, no window over this page, nothing of the form changed
        toastOnce("babel-ext:" + Math.floor(Date.now() / 60000), tr("A run started elsewhere stopped on a broken score: {0}. Nothing was sung, nothing here changed").replace("{0}", "«" + ((job.request && job.request.title) || job.title || job.id) + "»"), "bad");
        return;
      }
      return showBrokenScore(job, message.replace(/^Broken score: /, ""), (data && data.abc) || "");
    }
    // HERESY 1169 (Viktor 07.10.2026: «при OOM сторож ловит падение и предлагает пользователю осознанно с текущих весов
    // опуститься на порядок ниже. Т.е. с BF16 на Q8, с честным предупреждением, что качество начнёт страдать, при Q5 и ниже
    // галлюцинировать и ронять как ABC, так и музыкальные токены»): the engine says it ran out, the page offers the next copy
    if (/^Out of GPU memory/.test(message) && !toasted["oom" + job.id]) {
      toasted["oom" + job.id] = true;
      return offerSmallerModel(message);
    }
    toastOnce(job.id, message, "bad");
    if (job.kind === "transcribe") transcriptionFailed(job, message);
  }
  var MODEL_LADDER = ["BF16", "Q8_0", "Q6_K", "Q5_K_M"];
  var MODEL_WORD = {
    Q8_0: "near lossless, about half the size: the sound hardly changes.",
    Q6_K: "smaller still: the quality starts to suffer.",
    Q5_K_M: "the smallest: with it the music half hallucinates, and breaks the score (ABC) and the music tokens."
  };
  function offerSmallerModel(message) {
    var now = (STATE.settings && STATE.settings.model) || $("modelPick").value, models = (STATE.settings && STATE.settings.models) || [];
    var at = MODEL_LADDER.indexOf(now), next = MODEL_LADDER.slice(at + 1).filter(function (m) { return models.indexOf(m) >= 0; })[0];
    if (at < 0 || !next) { toast(message, "bad"); return Promise.resolve(false); }
    return window.HeresyDialog.confirm("Out of GPU memory\n\n" + message + "\n\nSwitch the engine to " + next + "? It is " + MODEL_WORD[next] +
      " It loads with the next song; ☰ → Model takes it back.", { ok: "Switch to " + next, cancel: "Keep " + now }).then(function (yes) {
      if (!yes) return false;
      $("modelPick").value = next;
      $("modelPick").dispatchEvent(new Event("change"));
      return true;
    });
  }
  window.ruachOfferSmallerModel = offerSmallerModel;   // the page's tests read it

  // HERESY 1087 (Viktor, 02.10.2026): "a Tower of Babel built on strengths past the ceiling". The engine
  // stops a run whose score is not a score before any music is made on it; here the user is told why, in
  // plain words: what is wrong with the score, which adapters weighed on the music half and how far past
  // their limits, and the way out: the green zone, fewer adapters on one half, or Direct mode.
  function showBrokenScore(job, why, abc, opts) {
    opts = opts || {};                                   // HERESY 1623: { anew: plan it again with a new seed, fixed: its seed was }
    var req = job.request || {}, loras = (req.loras || []).filter(function (c) { return c.ar > 0; });
    var seed = String((job.resolved && job.resolved.lm_seed) || req.lm_seed || ""), fixed = opts.fixed !== undefined ? !!opts.fixed : /^\d+$/.test(String(req.lm_seed || ""));
    var sum = loras.reduce(function (s, c) { return s + c.ar; }, 0);
    var rows = loras.map(function (c) {
      var z = YueLoras.zone ? YueLoras.zone(c.id, "ar") : null, cls = !z ? "" : c.ar > z.limit ? "is-red" : c.ar > z.safe ? "is-amber" : "is-green";
      return '<tr class="' + cls + '"><td>' + escape(YueLoras.name ? YueLoras.name(c.id) : c.id) + '</td><td class="mono">' + c.ar.toFixed(2) + "</td><td>" +
        (z ? escape(c.ar > z.limit ? tr("past its limit {0}").replace("{0}", z.limit) : c.ar > z.safe ? tr("amber (green to {0})").replace("{0}", z.safe) : tr("green zone")) : "") + "</td></tr>";   // HERESY 1793: in the page's language
    }).join("");
    var back = document.createElement("div");
    back.className = "hd-back";
    back.innerHTML = '<div class="hd-box sg-box" role="alertdialog" aria-modal="true" aria-label="Broken score">' +
      '<div class="hd-title">Babel in the score: the run stopped before the music</div>' +
      '<div class="hd-body"><p>The music half (AR) wrote a score that is not one: <b>' + escape(why) + "</b>. Music built on it is noise, so " +
        "the engine stopped here and nothing was spent on the sound.</p>" +
        "<p>" + escape(tr(fixed ? "On {0}, music seed {1}, fixed; the plan's fuse here: {2} together." : "On {0}, music seed {1}, random; the plan's fuse here: {2} together.")
          .replace("{0}", req.model || "?").replace("{1}", seed || "?").replace("{2}", planArSafe(req.model || undefined))) +
          (fixed ? " " + escape(tr("From the same seed the model plans the same way: with the same adapters it breaks again.")) + " " + escape(tr("A new seed plans it anew.")) : "") + "</p>" +   // HERESY 1623
        (loras.length ? "<p>What weighed on the music half in this run" + (loras.length > 1 ? " (" + loras.length + " adapters, together <b>" + sum.toFixed(2) + "</b>" +
          (YueLoras.total && sum > YueLoras.total().limit ? ", past the shared ceiling " + YueLoras.total().limit + ": each may sit in its green and the sum still break the score" : ": stacked, their changes add up") + ")" : "") + ":</p>" +
          '<table class="sg-table"><tr><th>adapter</th><th>music</th><th></th></tr>' + rows + "</table>" +
          "<p>Most often this is strength past the ceiling: bring the music strengths into the green, take an adapter off the music half " +
          "(its sound half can stay), or generate in Direct mode, which writes no score at all.</p>"
        : "<p>No adapter weighed on the music half: the score sampling may be too hot (temperature, top-k). Reset sampling, or try another seed.</p>") +
        (abc ? '<details class="sg-abc"><summary>What it wrote (' + abc.length + " characters)</summary><pre>" + escape(abc.slice(0, 4000)) + "</pre></details>" : "") +
      '</div><div class="hd-acts">' + (opts.anew ? '<button type="button" class="btn ghost small" data-sg="anew">' + escape(tr("Plan again with a new seed")) + "</button>"   // HERESY 1623
          : /^\d+$/.test($("lmSeed").value.trim()) ? '<button type="button" class="btn ghost small" data-sg="seed">' + escape(tr("A new music seed")) + "</button>" : "") +
        (loras.length && YueLoras.toGreen ? '<button type="button" class="btn ghost small" data-sg="green">Music strengths into the green</button>' : "") +
        '<button type="button" class="btn small primary" data-sg="ok">Understood</button></div></div>';
    document.body.appendChild(back);
    function close() { back.classList.add("is-leaving"); setTimeout(function () { back.remove(); }, 120); }
    back.addEventListener("click", function (e) {
      var b = e.target.closest("[data-sg]");
      if (e.target === back || (b && b.dataset.sg === "ok")) return close();
      if (b && b.dataset.sg === "anew") { close(); return opts.anew(); }   // HERESY 1623
      if (b && b.dataset.sg === "seed") { newSeed("lmSeed"); toast(tr("A new music seed for the next run"), "good"); return close(); }
      if (b && b.dataset.sg === "green") { var n = YueLoras.toGreen("ar"); toast(n ? n + " music strength" + (n > 1 ? "s" : "") + " brought into the green" : "Nothing was past the green", n ? "good" : ""); close(); }
    });
    requestAnimationFrame(function () { back.classList.add("is-on"); back.querySelector('[data-sg="ok"]').focus(); });
    document.addEventListener("keydown", function esc(e) { if (e.key === "Escape") { document.removeEventListener("keydown", esc, true); close(); } }, true);
  }
  window.HeresyScoreGuard = { show: showBrokenScore };     // the same window by hand: a test, or a look
  window.ruachLogLine = onLogLine; window.ruachJobById = jobById;   // HERESY 1765: for the checks (a run from elsewhere, line by line)
  window.ruachRegisterJob = registerJob;             // HERESY 1766: for the checks (a slow POST claiming its run)

  function cancelledJob(job) {
    if (!isLive(job)) return;
    job.error = "";
    settle(job, "cancelled");
    toastOnce(job.id, "Cancelled: " + job.title);
    if (job.kind === "transcribe") transcriptionFailed(job, "Transcription cancelled.");
  }

  function finishJob(job, data) {
    if (!isLive(job) || job.finishing) return;
    job.finishing = true;
    if (job.kind === "transcribe") { settle(job, "done"); chimeFor(job, true); return finishTranscription(job); }   // HERESY 1275
    if (job.request.plan) { settle(job, "done"); return finishPlan(job, data); }
    var names = data.takes || [];
    var land = names.length || STATE.library ? Promise.resolve(names) : sessionTakes(job);
    land.then(function (takes) {
      job.takes = takes;
      settle(job, "done");
      // HERESY 1116: only a run this page started is filed by it; a run from elsewhere (the API, another browser) is
      // filed by whoever started it (the API's own workspace field), never into this page's workspace in hand
      // HERESY 1168 (Viktor: «Play new takes вроде бы как перестал работать»): a run this page started and an F5 brought back
      // while it still ran (seenRunning) is its own as well: it lands in the workspace in hand and plays when done
      var mine = (!job.restored || job.seenRunning) && job.kind !== "external";
      if (window.HeresyCollection && mine) window.HeresyCollection.landed(takes);   // HERESY 1041: into the workspace in hand
      if (window.HeresyWriter && mine) window.HeresyWriter.landed(takes);           // HERESY 1047: to the document in hand
      if (window.HeresyVersions && mine && job.kind === "song" && job.words) window.HeresyVersions.keep(job.words, takes, job.request && job.request.cot, "generate", (function () { var r = Object.assign({}, job.request || {}); ["title", "style", "lyrics", "abc", "semantic_tokens", "parent"].forEach(function (k) { delete r[k]; }); return r; })());   // HERESY 1519 · 1596
      return refreshLibrary().catch(function () {}).then(function () { return nameVersions(job); });
    }).then(function () {
      paintAllRuns();
      if (job.also && job.also.length && job.kind === "song" && (!job.restored || job.seenRunning)) alsoRender(job);   // HERESY 1498
      if (job.kind === "replay") return replayLanded(job);
      var count = job.takes.length;
      if (job.restored && !job.seenRunning) return;   // one that ended while the page was away: no toast, no jump, no play
      var watching = STATE.job === job && !STATE.take && count, playing = isPlaying();
      toastOnce(job.id, "Song complete — " + job.title + (count > 1 ? " (" + count + " takes)" : "") +
                (watching && playing ? ". What you are playing keeps playing; ▶ Play this song when you are ready." : ""), "good");
      // Only jump to the new song if the run is what you were looking at;
      // opening it never cuts off a song that is playing.
      if (watching) openTake(job.takes[0]);
      // HERESY 1167 (Viktor: «Если плеер неактивен, по окончанию генерации трека прямо в проигрыш его»): a song made here
      // plays when it is done, unless something plays (the player's «Play new takes»)
      var plays = false;
      if (job.kind !== "external" && !playing && playNew()) {
        var fresh = findTake(job.takes[0]);
        if (fresh) { playNow(fresh); plays = true; }
      }
      if (!plays) chimeFor(job, true);   // HERESY 1275: the end heard, unless the new song itself is
    }).catch(function (error) {
      job.error = error.message;
      settle(job, "failed");
      toast(error.message, "bad");
    });
  }

  // Versions and sound variations get titles of their own ("· v2", "· sound 3"),
  // written into the library so every page sees the same names.
  function nameVersions(job) {
    if (job.kind !== "song" || (!job.versioned && job.variations < 2)) return Promise.resolve();
    var chain = Promise.resolve();
    job.takes.forEach(function (name) {
      var take = findTake(name);
      if (!take) return;
      var title = job.baseTitle || job.title;
      if (job.versioned) title += " · v" + (job.index + (take.song || 0) + 1);
      if (job.variations > 1) title += " · sound " + ((take.variation || 0) + 1);
      if (take.title === title) return;
      chain = chain.then(function () { return updateTake(take, { title: title }).catch(function () {}); });
    });
    return chain;
  }

  function finishPlan(job, data) {
    var got = data.abc ? Promise.resolve(data.abc)
      : api("/job?id=" + encodeURIComponent(job.id) + "&result=1").then(function (r) { return (r && r.abc) || ""; });
    got.then(function (abc) {
      job.abc = abc;
      if (job.restored) return;
      if (!abc) return toast("The plan finished without a score", "bad");
      if (!toasted["plan" + job.id]) {
        toasted["plan" + job.id] = true;
        if (keyAfterPlan(job, abc)) return;                 // HERESY 1480
        if (instrumentalAfterPlan(job, abc)) return;
        keepForm("before");                            // HERESY 1596: a plan's score over the one in the form
        $("abc").value = abc;
        scoreWrittenBy(job.request.loras || [], "planned");   // HERESY 1327
        // HERESY 1623: the plan's seed stays on its card; the field keeps to its mode (see keyAfterPlan)
        $("scoreDrawer").open = true;
        toast("Score planned. Check its sections under Supply your own score; Generate now renders exactly this score.", "good");
        chimeFor(job, true);   // HERESY 1275 (an instrumental run after it rings when it ends)
      }
      if (STATE.job === job && !STATE.take) showPlanScore(job);
    }).catch(function (error) { toast("Could not fetch the planned score: " + error.message, "bad"); });
  }

  // The plan's score stands in the take column under the finished run.
  function showPlanScore(job) {
    if (!job.abc) return;
    $("takeEmpty").classList.add("is-hidden");
    $("takeBody").classList.remove("is-hidden");
    $("takeBody").classList.add("is-running");
    $("scorePanel").classList.remove("is-hidden");
    $("scorePanel").open = true;
    renderScore(job.abc);
  }

  function replayLanded(job) {
    var name = job.takes[0];
    toastOnce(job.id, (job.what || "New version") + " ready — " + job.title, "good");
    chimeFor(job, true);   // HERESY 1275
    // Only switch if you are still listening to the take it came from.
    if (name && STATE.take && STATE.take.name === job.parent && !isPlaying()) openTake(name, { keep: true });
    else if (STATE.take) { paintDecodeSwitch(); paintSoundSwitch(); }
  }

  // With no library on the server, the finished songs are fetched once and
  // kept in this tab: audio and replay request, for as long as it stays open.
  function sessionTakes(job) {
    return fetch("/job?id=" + encodeURIComponent(job.id) + "&result=1").then(function (r) {
      if (!r.ok) throw new Error("Could not fetch the finished song (" + r.status + ")");
      var type = r.headers.get("Content-Type") || "";
      return r.arrayBuffer().then(function (buffer) { return { type: type, buffer: buffer }; });
    }).then(function (res) {
      var match = res.type.match(/boundary=([^\s;]+)/), pairs = [];
      if (match) {
        var pending = null;
        splitMultipart(new Uint8Array(res.buffer), match[1].replace(/"/g, "")).forEach(function (part) {
          if (/json/.test(part.type)) pending = parseJSON(new TextDecoder().decode(part.body));
          else if (pending) { pairs.push({ request: pending, audio: new Blob([part.body], { type: part.type }) }); pending = null; }
        });
      } else {
        pairs.push({ request: {}, audio: new Blob([res.buffer], { type: res.type || "audio/mpeg" }) });
      }
      var now = Date.now() / 1000, variations = job.request.variations || 1;
      return pairs.map(function (pair, n) {
        var req = pair.request, name = "session-" + job.id + "-" + (n + 1);
        STATE.requests[name] = req;
        var take = {
          name: name, session: true, url: URL.createObjectURL(pair.audio), title: req.title || job.title, created: now,
          seconds: 0, format: req.output_format || job.request.format, favorite: false, style: req.style || "",
          lyrics: req.lyrics || "", cot: req.cot || job.request.cot, lm_seed: req.lm_seed, seed: req.seed,
          vae: req.vae || job.request.vae, sliders: req.sliders || [], steps: req.steps || job.request.steps,
          cfg_scale: typeof req.cfg_scale === "number" ? req.cfg_scale : -1, cfg_lyrics: typeof req.cfg_lyrics === "number" ? req.cfg_lyrics : -1, duration: req.duration,
          truncated: false, render_seconds: job.finished ? (job.finished - job.started) / 1000 : 0,
          song: Math.floor(n / variations), variation: n % variations, parent: req.parent || "", has_score: !!req.abc
        };
        STATE.session.unshift(take);
        return name;
      });
    });
  }

  function splitMultipart(bytes, boundary) {
    var marker = new TextEncoder().encode("--" + boundary), parts = [], positions = [];
    for (var i = 0; i <= bytes.length - marker.length; i++) {
      var hit = true;
      for (var j = 0; j < marker.length; j++) { if (bytes[i + j] !== marker[j]) { hit = false; break; } }
      if (hit) { positions.push(i); i += marker.length - 1; }
    }
    for (var p = 0; p < positions.length - 1; p++) {
      var start = positions[p] + marker.length + 2, end = positions[p + 1] - 2, split = -1;
      for (var k = start; k < end - 3; k++) {
        if (bytes[k] === 13 && bytes[k + 1] === 10 && bytes[k + 2] === 13 && bytes[k + 3] === 10) { split = k; break; }
      }
      if (split < 0) continue;
      var head = new TextDecoder().decode(bytes.slice(start, split)), type = "application/octet-stream";
      head.split(/\r\n/).forEach(function (line) { var m = line.match(/^Content-Type:\s*(.+)$/i); if (m) type = m[1].trim(); });
      parts.push({ type: type, body: bytes.slice(split + 4, end) });
    }
    return parts;
  }

  /* ------------------------------------------------------------ log stream */

  var LOG = { source: null, connected: false, lines: [], pending: [], active: null, capture: null,
              backlog: true, backlogTimer: 0, lastJobId: null, retry: 0 };
  var LOG_KEEP = 400, LOG_WIDTH = 320;

  function connectLogs() {
    if (LOG.source) LOG.source.close();
    var source = new EventSource("/logs");
    LOG.source = source;
    source.onopen = function () {
      LOG.connected = true;
      LOG.backlog = true;
      LOG.active = null;
      LOG.capture = null;
      LOG.lines = [];
      LOG.pending = [];
      $("logBody").textContent = "";
      if (typeof ACT !== "undefined") ACT.since = 0;              // HERESY 1157: the lab's lines come again
      // The stream replays its backlog first, so progress is rebuilt from it.
      STATE.jobs.forEach(function (job) {
        if (!isLive(job)) return;
        var fresh = stageSkeleton(job);
        job.stages.forEach(function (s, n) { if (s.state !== "skipped") Object.assign(s, fresh[n]); });
      });
      clearTimeout(LOG.backlogTimer);
      LOG.backlogTimer = setTimeout(endBacklog, 900);
      paintLogState();
    };
    source.onmessage = function (event) { onLogLine(event.data); };
    source.onerror = function () {
      source.close();
      if (LOG.source !== source) return;
      LOG.source = null;
      LOG.connected = false;
      addLogLine("[Client] Server unavailable", true);
      paintLogState();
      clearTimeout(LOG.retry);
      LOG.retry = setTimeout(connectLogs, 2000);
    };
  }

  function paintLogState() {
    var pill = $("logState");
    pill.textContent = LOG.connected ? "live" : "reconnecting";
    pill.dataset.s = LOG.connected ? "ready" : "bad";
    var lamp = $("logDockLamp");                                 // HERESY 1094
    if (lamp) { lamp.dataset.s = LOG.connected ? "ready" : "bad"; lamp.title = LOG.connected ? "live" : "reconnecting"; }
  }

  // A run found still going when the backlog ends is shown as if started here.
  function endBacklog() {
    LOG.backlog = false;
    var id = LOG.lastJobId, job = id ? jobById(id) : null;
    if (!job || !job.provisional) return;
    api("/job?id=" + encodeURIComponent(id)).then(function (data) {
      if (data && data.status === "running" && job.provisional) promoteExternal(job);
      else dropProvisional(job);
    }).catch(function () { dropProvisional(job); });
  }

  function dropProvisional(job) {
    if (!job.provisional) return;
    STATE.jobs = STATE.jobs.filter(function (j) { return j !== job; });
  }

  function promoteExternal(job) {
    if (!job.provisional) return;
    job.provisional = false;
    job.kind = job.request.plan ? "plan" : "external";
    job.external = true;                              // HERESY 1765: a run this page did not start, its plans as well
    job.status = job.status === "queued" ? "running" : job.status;
    ensurePolling();
    if (!STATE.job && !STATE.take) watchJob(job);
    paintAllRuns();
  }

  function onLogLine(text) {
    addLogLine(text, false);
    if (LOG.backlog) { clearTimeout(LOG.backlogTimer); LOG.backlogTimer = setTimeout(endBacklog, 250); }
    // The request after a job line is printed over many lines; collect it.
    if (LOG.capture) {
      if (/^(\s|\}|\])/.test(text)) {
        LOG.capture.text += "\n" + text;
        if (text === "}") finishCapture();
        return;
      }
      finishCapture();
    }
    var m;
    if ((m = text.match(/^\[Server\] Transcribe job (\S+) failed: (.*)$/))) {
      var failed = jobById(m[1]);
      if (failed) { failed.lastFatal = m[2]; }
      return;
    }
    if ((m = text.match(/^\[Server\] Job (\S+): (.*)$/))) return jobLine(m[1], m[2], false);
    if ((m = text.match(/^\[Server\] Transcribe job (\S+): (.*)$/))) return jobLine(m[1], "", true);
    var job = LOG.active ? jobById(LOG.active) : null;
    if (job) progressLine(job, text);
  }

  function jobLine(id, rest, transcribe) {
    LOG.active = id;
    LOG.lastJobId = id;
    var job = jobById(id);
    if (!job) {
      // Someone else's run, or ours before its POST has answered: keep a
      // quiet record and decide what it is in a moment.
      job = makeJob(id, { kind: transcribe ? "transcribe" : "external", title: "A run from elsewhere" }, {});
      job.provisional = true;
      STATE.jobs = STATE.jobs.filter(function (j) { return !(j.provisional && j !== job && !isLiveVisible(j)); });
      STATE.jobs.push(job);
      if (!LOG.backlog && !transcribe) {
        setTimeout(function () { if (job.provisional) promoteExternal(job); }, 700);
      }
    }
    if (job.status === "queued") {
      job.status = "running";
      // HERESY 1168: after an F5 the log's backlog replays the run's start line now; a start the page kept stands
      if (!job.started) { job.started = Date.now(); job.approx = LOG.backlog; }
      if (job.restored) job.seenRunning = true;
      if (!job.provisional) saveJobs();
    }
    var body = rest.trim();
    if (body === "{") LOG.capture = { id: id, text: "{" };
    else if (body.charAt(0) === "{") applyJobRequest(id, body);
    scheduleRunPaint();
  }

  function isLiveVisible(job) { return !job.provisional && isLive(job); }

  function finishCapture() {
    var capture = LOG.capture;
    LOG.capture = null;
    if (capture) applyJobRequest(capture.id, capture.text);
  }

  function applyJobRequest(id, text) {
    var job = jobById(id), req;
    if (!job) return;
    try { req = parseJSON(text); } catch (error) { return; }
    if (req.lm_seed !== undefined) job.resolved.lm_seed = String(req.lm_seed);
    if (req.seed !== undefined) job.resolved.seed = String(req.seed);
    if (job.provisional || job.kind === "external") {
      job.title = req.title || job.title;
      var plannedWas = job.request && job.request.planScore;   // HERESY 1625: the plan's count, the page's own, kept when the server's request comes
      job.request = summarize(req);
      if (plannedWas && req.score_planned) job.request.planScore = plannedWas;
      var progress = job.stages;
      job.stages = stageSkeleton(job);
      job.stages.forEach(function (s, n) { if (s.state !== "skipped" && !s.planned && progress[n] && progress[n].state !== "waiting") Object.assign(s, progress[n], { note: s.note }); });
    }
    scheduleRunPaint();
  }

  function stageOf(job, key) { return job.stages.filter(function (s) { return s.key === key; })[0]; }

  // Mark a stage running; any stage before it that was still running is done.
  function runStage(job, key) {
    var reached = false;
    job.stages.forEach(function (s) {
      if (s.key === key) {
        reached = true;
        if (!s.planned && (s.state === "waiting" || s.state === "completed")) { s.state = "running"; s.t0 = s.t0 || Date.now(); }   // 1625: a plan's step stays
      } else if (!reached && s.state === "running") {
        s.state = "completed";
        s.t1 = s.t1 || Date.now();
      }
    });
    return stageOf(job, key);
  }

  function completeStage(job, key, seconds) {
    var s = stageOf(job, key);
    if (!s || s.state === "skipped" || s.planned) return;   // HERESY 1625: a plan's step keeps the plan's count
    s.state = "completed";
    s.t1 = s.t1 || Date.now();
    if (seconds !== undefined) s.seconds = seconds;
  }

  function currentStage(job) {
    return job.stages.filter(function (s) { return s.state === "running"; })[0] || null;
  }

  var AR_KEY = { Score: "score", Semantic: "tokens" };

  function progressLine(job, text) {
    var m, s;
    if ((m = text.match(/^\[Prompt\] cot=(\w+), songs=(\d+), variations=(\d+)/))) {
      job.request.songs = +m[2];
      job.request.variations = +m[3];
    } else if (/^\[Pipeline\] Replay: /.test(text)) {
      ["score", "tokens"].forEach(function (key) {
        var st = stageOf(job, key);
        if (st.state !== "skipped") { st.state = "skipped"; st.skipNote = "Codes supplied: the music is already written"; }
      });
    } else if ((m = text.match(/^\[AR\] Frame budget clamped to (\d+)/))) {
      stageOf(job, "tokens").total = +m[1];
    } else if ((m = text.match(/^\[AR\] (Score|Semantic) prefill: .*?(?:budget=(\d+))?(?:,|$)/))) {
      s = runStage(job, AR_KEY[m[1]]);
      var budget = text.match(/budget=(\d+)/);
      if (budget) s.total = +budget[1];
    } else if ((m = text.match(/^\[AR\] (Score|Semantic) (\d+)\/(\d+)\s*$/))) {
      s = runStage(job, AR_KEY[m[1]]);
      s.done = Math.max(s.done, +m[2]);
      s.total = +m[3];
    } else if ((m = text.match(/^\[AR\] (Score|Semantic) song (\d+): end token at step (\d+)/))) {
      s = runStage(job, AR_KEY[m[1]]);
      s.ended = (s.ended || 0) + 1;
      s.done = Math.max(s.done, +m[3]);
    } else if ((m = text.match(/^\[AR\] (Score|Semantic) song \d+: \d+ tokens (prefilled|copied)/))) {
      runStage(job, AR_KEY[m[1]]);
    } else if ((m = text.match(/^\[AR\] (Score|Semantic) song (\d+): (\d+) tokens( \(truncated\))?\s*$/))) {
      s = stageOf(job, AR_KEY[m[1]]);
      s.longest = Math.max(s.longest || 0, +m[3]);
      if (m[4]) s.truncated = true;
    } else if ((m = text.match(/^\[AR\] (Score|Semantic): (\d+) tokens over (\d+) songs?, (\d+) steps, ([\d.]+) s/))) {
      s = stageOf(job, AR_KEY[m[1]]);
      if (!s.planned) { s.done = Math.max(s.done, +m[4]); s.tokens = +m[2]; }   // HERESY 1625
      completeStage(job, AR_KEY[m[1]], +m[5]);
    } else if ((m = text.match(/^\[Sliders\] (.*)$/))) {
      // one "<id> at gain <g>" line per slider; the "Detached" line only closes them. HERESY 1447 (Viktor 15.10.2026: «К хуям
      // убери этот лог арки. Он там не нужен»): only those, a wave's way through the song never in the stage's words
      if (/ at gain /.test(m[1])) {
        var seen = job.notes.sliders ? job.notes.sliders.split(", ") : [];
        if (seen.indexOf(m[1]) < 0) seen.push(m[1]);
        job.notes.sliders = seen.join(", ");
      }
    } else if ((m = text.match(/^\[NAR\] Song (\d+): (\d+) frames \(([\d.]+) s\).*?(\d+) chunks? of (\d+), (\d+) variations?/))) {
      s = runStage(job, "sound");
      s.chunks = +m[4];
      s.song = +m[1];
      s.music = Math.max(s.music || 0, +m[3]);
      job.request.variations = +m[6];
      if (!s.stepsPer) s.stepsPer = job.request.steps;
    } else if ((m = text.match(/^\[NAR\] Step (\d+)\/(\d+)/))) {
      s = runStage(job, "sound");
      s.stepsPer = +m[2];
      s.done += 1;
    } else if (/^\[NAR\] Song \d+ chunk \d+\/\d+:/.test(text)) {
      s = stageOf(job, "sound");
      s.chunksDone = (s.chunksDone || 0) + 1;
    } else if ((m = text.match(/^\[VAE\] Track (\d+)\/(\d+)/))) {
      s = runStage(job, "decode");
      s.done = +m[1] - 1;
      s.total = +m[2];
    } else if ((m = text.match(/^\[VAE\] Tiled decode: (\d+) tiles/))) {
      s = runStage(job, "decode");
      s.tiles = +m[1];
      s.tilesDone = 0;
    } else if (/^\[VAE\] Decoded: /.test(text)) {
      // one line per tile in a tiled decode, one per track otherwise
      s = stageOf(job, "decode");
      if (s.tiles) s.tilesDone = Math.min(s.tiles, (s.tilesDone || 0) + 1);
      else if (s.state === "running") s.done = Math.min(s.total || 1, s.done + 1);
    } else if (/^\[VAE\] Tiled decode done/.test(text)) {
      s = stageOf(job, "decode");
      s.tiles = 0;
      s.tilesDone = 0;
      if (s.state === "running") s.done = Math.min(s.total || 1, s.done + 1);
    } else if ((m = text.match(/^\[Pipeline\] Done: (.*)$/))) {
      job.summary = m[1];
      job.stages.forEach(function (st) {
        if (st.state === "running" || st.state === "waiting") { st.state = "completed"; st.t1 = st.t1 || Date.now(); st.t0 = st.t0 || st.t1; }
      });
      if (job.status === "running") job.status = "saving";
      if (!job.provisional && !LOG.backlog) setTimeout(pollJobs, 150);
    } else if ((m = text.match(/^\[Library\] Saved (\S+)/))) {
      job.saved.push(m[1]);
      // a run from another page lands in the library too
      if (!LOG.backlog && (job.kind === "external" || job.provisional)) libraryRefreshSoon();
    } else if ((m = text.match(/^\[Store\] Load (\w+): (\d+) ms/))) {
      job.notes.load = { LM: "language model", NAR: "sound model", VAE: "VAE", SS2: "transcriber" }[m[1]] + " loaded in " + (+m[2] / 1000).toFixed(1) + " s";
    } else if (/Cancelled at /.test(text)) {
      job.lastFatal = "Cancelled";
    } else if (/FATAL/.test(text)) {
      job.lastFatal = text.replace(/^\[\w+\]\s*/, "");
    }
    scheduleRunPaint();
  }

  var libraryTimer = 0;
  function libraryRefreshSoon() {
    clearTimeout(libraryTimer);
    libraryTimer = setTimeout(function () { refreshLibrary().catch(function () {}); }, 600);
  }

  var runPaintQueued = false;
  function scheduleRunPaint() {
    if (runPaintQueued) return;
    runPaintQueued = true;
    requestAnimationFrame(function () { runPaintQueued = false; paintAllRuns(); });
  }

  function addLogLine(text, client) {
    if (!client && /\bthe Artist\b/.test(text)) artLogAdd(text.replace(/^\[Lab\]\s*/, "lab · "), logClass(text, client), true);   // HERESY 1334
    LOG.lines.push({ text: text, client: client });
    if (LOG.lines.length > LOG_KEEP) LOG.lines.splice(0, LOG.lines.length - LOG_KEEP);
    LOG.pending.push({ text: text, client: client });
    if (LOG.pending.length === 1) requestAnimationFrame(flushLog);
  }

  function logClass(text, client) {
    if (client) return "dim";
    if (/FATAL|failed|Cancel|error/i.test(text)) return "bad";
    if (/^\[Pipeline\] Done|^\[Library\] Saved/.test(text)) return "good";
    if (/^\[Server\]/.test(text)) return "srv";
    if (/^\[Lab\]/.test(text)) return /FAILED/.test(text) ? "bad" : "lab";   // HERESY 1157
    return "";
  }

  // HERESY 1630: which room a line of the server's log belongs to: the lab says its work by kind ("[Lab] 19:25:47 artwork · …"); the engine's own
  // lines and the page's are the Creator's
  function logSrc(text, client) {
    var t = String(text || "");
    if (client || !/^\[Lab\]/.test(t)) return "creator";
    var w = t.replace(/^\[Lab\]\s*(\d\d:\d\d:\d\d\s+)?/, ""), card = (/left its card for ([^(·]+)/.exec(w) || [])[1] || "";
    if (/^(LoRA training|the Trainer|dataset|prepare|pack)\b/i.test(w) || /training/i.test(card)) return "trainer";
    if (/^(artwork|the Artist)\b/.test(w) || /artwork|artist/i.test(card)) return "artist";
    if (/^(stems|remaster|upscale|debuzz|digital gateway|spectrum|inspection|listener|refined|DAW mix|Edit)\b/.test(w) || /stems|remaster|upscale|debuzz|refin|listener/i.test(card)) return "refiner";
    return "creator";
  }
  window.ruachLogSrc = logSrc;   // for the checks
  function dockNone() {               // a room with nothing in the log yet says so
    var db = $("logDockBody"), v = db && db.dataset.only;
    if (db) db.dataset.none = v && !db.querySelector('.log-line[data-src="' + v + '"]') ? tr("Nothing from this room in the log yet") : "";
  }

  function flushLog() {
    var body = $("logBody"), pending = LOG.pending;
    LOG.pending = [];
    if (!pending.length) return;
    var follow = $("logFollow").checked, fragment = document.createDocumentFragment();
    pending.slice(-LOG_KEEP).forEach(function (line) {
      var row = document.createElement("div");
      row.className = "log-line " + logClass(line.text, line.client);
      row.dataset.src = logSrc(line.text, line.client);   // HERESY 1630
      if (line.text.length > LOG_WIDTH) {
        row.textContent = line.text.slice(0, LOG_WIDTH);
        var cut = document.createElement("span");
        cut.className = "cut";
        cut.textContent = " \u2026 (+" + (line.text.length - LOG_WIDTH).toLocaleString(loc()) + " characters)";
        row.appendChild(cut);
      } else {
        row.textContent = line.text || " ";
      }
      fragment.appendChild(row);
    });
    // HERESY 1094: the same rows into the dock above the player, and its folded line shows the last one
    var dock = $("logDockBody");
    if (dock) {
      var dockFollow = $("logDockFollow").checked;
      Array.prototype.forEach.call(fragment.childNodes, function (row) { dock.appendChild(row.cloneNode(true)); });
      // HERESY 1166 (Viktor: «не возможно во время активности прокрутить и глянуть, что до этого»): while you read, the
      // lines under your eye stay put: the oldest go only past five times the count, and the view moves back by them
      var gone = 0, keep = dockFollow ? LOG_KEEP : LOG_KEEP * 5;
      while (dock.childElementCount > keep) { gone += dock.firstChild.offsetHeight || 0; dock.removeChild(dock.firstChild); }
      if (dockFollow) dock.scrollTop = dock.scrollHeight;
      else if (gone) dock.scrollTop = Math.max(0, dock.scrollTop - gone);
      var view = logView(), lastLine = view === "server" ? pending[pending.length - 1]   // HERESY 1630: a room's view, its own last
        : pending.filter(function (l) { return logSrc(l.text, l.client) === view; }).pop();
      dockNone();
      if (lastLine && view !== "artist") {               // HERESY 1334: the folded line says the view's last
        $("logDockLast").textContent = (lastLine.text || " ").slice(0, 160);
        $("logDockLast").className = "log-dock-last mono " + logClass(lastLine.text, lastLine.client);
      }
      popMirror("server", fragment.childNodes);          // HERESY 1334: and the log's own window, when it is open
    }
    body.appendChild(fragment);
    var cut = 0, keepBody = follow ? LOG_KEEP : LOG_KEEP * 5;       // HERESY 1166: the same in Engine's log
    while (body.childElementCount > keepBody) { cut += body.firstChild.offsetHeight || 0; body.removeChild(body.firstChild); }
    if (follow) body.scrollTop = body.scrollHeight;
    else if (cut) body.scrollTop = Math.max(0, body.scrollTop - cut);
  }

  function scrollLogToEnd() { if ($("logFollow").checked) $("logBody").scrollTop = $("logBody").scrollHeight; }

  // HERESY 1169 · 1334 (Viktor 10.10.2026: «Нужен отдельный логгер для Художника. Можно прикрутить его к фрейму логгера сервера отдельной
  // вкладкой. И по фрейму логгера идея... детачить, переносить на другой монитор, поддерживать поверх окон»): the Artist's log, kept in this
  // browser; the dock's two views, each room its own; a window of the log's own, mirroring both
  var ARTLOG_MAX = 400, artLog = (function () { try { var a = JSON.parse(localStorage.getItem("yue2.artistLog") || "[]"); return Array.isArray(a) ? a : []; } catch (e) { return []; } })();
  function hhmmss(ms) { var d = new Date(ms); return [d.getHours(), d.getMinutes(), d.getSeconds()].map(function (n) { return (n < 10 ? "0" : "") + n; }).join(":"); }
  function artLogRow(e, doc) { var row = (doc || document).createElement("div"); row.className = "log-line " + (e.k || ""); row.textContent = (e.lab ? "" : hhmmss(e.t) + "  ") + e.x; return row; }
  function artLogAdd(text, kind, lab) {
    if (!Array.isArray(artLog)) return;                 // a line before the page has its log: the lab's history comes again
    var x = String(text || "");
    if (lab && artLog.slice(-200).some(function (e) { return e.x === x; })) return;   // the server's history comes again with each page
    var e = { t: Date.now(), x: x, k: kind || "", lab: !!lab };
    artLog.push(e);
    if (artLog.length > ARTLOG_MAX) artLog.splice(0, artLog.length - ARTLOG_MAX);
    try { localStorage.setItem("yue2.artistLog", JSON.stringify(artLog)); } catch (err) { /* the browser's room is full: the page keeps it */ }
    var box = $("logDockArtist");
    if (box) {
      box.appendChild(artLogRow(e));
      while (box.childElementCount > ARTLOG_MAX) box.removeChild(box.firstChild);
      if ($("logDockFollow").checked) box.scrollTop = box.scrollHeight;
    }
    if (logView() === "artist") paintDockLast();
    popMirror("artist", [artLogRow(e)]);
  }
  window.RuachArtistLog = { add: function (text, kind) { artLogAdd(text, kind, false); }, lines: function () { return artLog.slice(); } };
  function logView() {
    var tab = document.body.dataset.tab || "create", v = recall("yue2.logView." + tab);
    return ["server", "creator", "trainer", "refiner", "artist"].indexOf(v) >= 0 ? v : tab === "artist" ? "artist" : "server";   // HERESY 1630: and the rooms
  }
  function paintDockLast() {
    var last = $("logDockLast");
    if (!last) return;
    if (logView() === "artist") {
      var e = artLog[artLog.length - 1];
      last.textContent = e ? e.x.slice(0, 160) : tr("the Artist's log is empty");
      last.className = "log-dock-last mono " + (e ? e.k : "");
    } else {
      var v = logView(), l = v === "server" ? LOG.lines[LOG.lines.length - 1] : LOG.lines.filter(function (x) { return logSrc(x.text, x.client) === v; }).pop();   // HERESY 1630
      if (l) { last.textContent = (l.text || " ").slice(0, 160); last.className = "log-dock-last mono " + logClass(l.text, l.client); }
      else if (v !== "server") { last.textContent = tr("Nothing from this room in the log yet"); last.className = "log-dock-last mono"; }
    }
  }
  function paintLogView() {
    var v = logView();
    all(".log-view").forEach(function (b) { var on = b.dataset.view === v; b.classList.toggle("is-on", on); b.setAttribute("aria-selected", on ? "true" : "false"); });
    var db = $("logDockBody");                         // HERESY 1630: the rooms' views are the server's lines filtered (app.css)
    if (db) {
      db.hidden = v === "artist"; db.dataset.only = v === "server" || v === "artist" ? "" : v; dockNone();
      if (v !== "artist" && $("logDockFollow").checked) db.scrollTop = db.scrollHeight;
    }
    if ($("logDockArtist")) { $("logDockArtist").hidden = v !== "artist"; if (v === "artist" && $("logDockFollow").checked) $("logDockArtist").scrollTop = $("logDockArtist").scrollHeight; }
    paintDockLast();
  }
  window.ruachLogView = paintLogView;
  (function () {
    var box = $("logDockArtist");
    if (box) artLog.forEach(function (e) { box.appendChild(artLogRow(e)); });
    all(".log-view").forEach(function (b) {
      b.addEventListener("click", function () { store("yue2.logView." + (document.body.dataset.tab || "create"), b.dataset.view); paintLogView(); });
    });
    paintLogView();
  })();
  // the log's own window: Document Picture-in-Picture (over every window) where the browser has it, else a pop-up; a mirror of both logs
  var POP = null;
  function popNone() {                                 // HERESY 1809: a room with nothing in the log yet says so, in the window too
    if (!POP || !POP.server) return;
    var v = POP.server.dataset.only;
    POP.server.dataset.none = v && !POP.server.querySelector('.log-line[data-src="' + v + '"]') ? tr("Nothing from this room in the log yet") : "";
  }
  function popMirror(view, rows) {
    if (!POP || POP.win.closed) return;
    var box = POP[view];
    Array.prototype.forEach.call(rows, function (r) { box.appendChild(POP.win.document.importNode(r, true)); });
    if (view === "server") popNone();
    while (box.childElementCount > LOG_KEEP * 2) box.removeChild(box.firstChild);
    if (POP.follow.checked) box.scrollTop = box.scrollHeight;
  }
  function popFill(win) {
    var d = win.document;
    Array.prototype.forEach.call(document.querySelectorAll('style, link[rel="stylesheet"]'), function (n) { d.head.appendChild(d.importNode(n, true)); });
    if (document.documentElement.dataset.theme) d.documentElement.dataset.theme = document.documentElement.dataset.theme;
    d.title = "Ruach Studio · " + tr("Server log");
    d.body.className = "log-pop";
    d.body.innerHTML = '<div class="log-pop-head"><span class="log-dock-views">' +   // HERESY 1809: the dock's every view
      [["server", "Server"], ["creator", "Creator"], ["trainer", "Trainer"], ["refiner", "Refiner"]].map(function (v) { return '<button type="button" class="log-view" data-view="' + v[0] + '">' + tr(v[1]) + "</button>"; }).join("") +
      '<button type="button" class="log-view" data-view="artist" translate="no">' + artistRoom() + '</button></span><label class="check small-check"><input type="checkbox" checked /> <span>' + tr("Follow") +
      '</span></label></div><div class="log-pop-main"><div class="log-pop-logs"><div class="log-dock-body mono" data-body="server"></div>' +
      '<div class="log-dock-body log-dock-artist mono" data-body="artist" hidden></div></div><div class="log-pop-gpus" data-body="gpus" aria-label="' + tr("The cards, live") + '"></div></div>';   // HERESY 1343: the cards beside it
    POP = { win: win, server: d.querySelector('[data-body="server"]'), artist: d.querySelector('[data-body="artist"]'), follow: d.querySelector("input"), gpus: d.querySelector('[data-body="gpus"]') };
    Array.prototype.forEach.call(($("logDockBody") || {}).childNodes || [], function (r) { POP.server.appendChild(d.importNode(r, true)); });
    artLog.forEach(function (e) { POP.artist.appendChild(artLogRow(e, d)); });
    var view = function (v) {                          // HERESY 1809: a room's view is the server's lines of that room, as in the dock
      Array.prototype.forEach.call(d.querySelectorAll(".log-view"), function (b) { b.classList.toggle("is-on", b.dataset.view === v); });
      var room = v === "creator" || v === "trainer" || v === "refiner";
      POP.server.hidden = v === "artist"; POP.artist.hidden = v !== "artist";
      POP.server.dataset.only = room ? v : "";
      popNone();
      var box = v === "artist" ? POP.artist : POP.server; box.scrollTop = box.scrollHeight;
    };
    Array.prototype.forEach.call(d.querySelectorAll(".log-view"), function (b) { b.addEventListener("click", function () { view(b.dataset.view); }); });
    view(logView());
    // HERESY 1343: the cards ticked by the window itself (a hidden page's timers are slowed, a window in sight is not); closed, the dock
    // unfolds again if it was open when the window came
    if (window.HeresyGpuLive) { win.setInterval(function () { window.HeresyGpuLive.tick(); }, 1000); window.HeresyGpuLive.tick(); }
    win.addEventListener("pagehide", function () {
      var p = POP; POP = null;
      if (p && p.tall && $("logDock")) $("logDock").classList.add("is-tall");   // HERESY 1809: its full height back, if it had it
      if (p && p.unfold && window.ruachLogDockFold) window.ruachLogDockFold(false);
    });
  }
  // HERESY 1343 (Viktor: «при детаче сразу сворачиваем открытый фрейм… при закрытии консоли с логом, если был фрейм в состоянии открытого,
  // обратно открываем его»): the window filled, the dock folded if it was open, and that remembered for the window's close
  function popOpened(win) {
    var dock = $("logDock"), was = !!dock && !dock.classList.contains("is-folded"), tallWas = !!dock && dock.classList.contains("is-tall");
    popFill(win);
    if (POP) { POP.unfold = was; POP.tall = tallWas; }
    // HERESY 1809 (Viktor: «при отсоединении фрейма серверного лога схлопывай наш разворачивающийся логгер»): folded whatever it was, and low
    if (dock) dock.classList.remove("is-tall");
    if (window.ruachLogDockFold) window.ruachLogDockFold(true);
  }
  if ($("logDockPop")) $("logDockPop").addEventListener("click", function () {
    if (POP && !POP.win.closed) { try { POP.win.focus(); } catch (e) { /* over the others already */ } return; }
    if (window.documentPictureInPicture && documentPictureInPicture.requestWindow) {
      // HERESY 1495 (Viktor 16.10.2026: «В детаче фрейма серверного лога нет колонки с GPU графами»): the size asked for each time, not the one
      // Chrome kept from an earlier window (a narrow one hid the cards)
      documentPictureInPicture.requestWindow({ width: 1240, height: 560, preferInitialWindowPlacement: true }).then(popOpened).catch(function (e) { toast(e.message, "bad"); });   // HERESY 1343: room for the cards
      return;
    }
    var w = window.open("", "ruach-log", "popup,width=1280,height=600");   // HERESY 1343: room for the cards
    if (!w) return toast(tr("The browser kept the log's window from opening: allow pop-ups for the studio"), "bad");
    popOpened(w);
  });
  window.ruachLogPop = function () { return POP; };

  $("logCopy").addEventListener("click", function () {
    navigator.clipboard.writeText(LOG.lines.map(function (l) { return l.text; }).join("\n"))
      .then(function () { toast("Server log copied (" + LOG.lines.length + " lines)"); })
      .catch(function () { toast("The browser refused clipboard access", "bad"); });
  });
  $("logClear").addEventListener("click", function () { LOG.lines = []; $("logBody").textContent = ""; if ($("logDockBody")) $("logDockBody").textContent = ""; });
  // HERESY 1094: the dock: folded by default, the choice kept; Copy as Engine's; Engine opens the whole log
  (function () {
    var dock = $("logDock");
    if (!dock) return;
    function fold(folded, passing) {                     // HERESY 1343: passing, the kept choice is left as it is (the log's window)
      dock.classList.toggle("is-folded", folded);
      $("logDockTab").setAttribute("aria-expanded", folded ? "false" : "true");
      if (!passing) store("yue2.logDock", folded ? null : "open");
      if (!folded && $("logDockFollow").checked) $("logDockBody").scrollTop = $("logDockBody").scrollHeight;
    }
    fold(recall("yue2.logDock") !== "open");
    window.ruachLogDockFold = function (folded) { fold(folded, true); };   // HERESY 1343: for the log's window
    $("logDockTab").addEventListener("click", function () {
      // HERESY 1809: while the log has a window of its own, the dock stays folded and its tab brings that window up
      if (POP && POP.win && !POP.win.closed && dock.classList.contains("is-folded")) { try { POP.win.focus(); } catch (e) { /* over the others already */ } return; }
      fold(!dock.classList.contains("is-folded"));
    });
    $("logDockCopy").addEventListener("click", function () {   // HERESY 1334: the view's own lines
      if (logView() !== "artist") return $("logCopy").click();
      navigator.clipboard.writeText(artLog.map(function (e) { return (e.lab ? "" : hhmmss(e.t) + "  ") + e.x; }).join("\n"))
        .then(function () { toast(tr("The Artist's log copied") + " (" + artLog.length + ")"); })
        .catch(function () { toast("The browser refused clipboard access", "bad"); });
    });
    $("logDockEngine").addEventListener("click", function () {
      $("engineToggle").click();
      if (window.ruachEngineTab) window.ruachEngineTab("server");   // HERESY 1450: the log is in the first tab
      setTimeout(function () { var b = $("logBody"); if (b) b.scrollIntoView({ block: "center" }); }, 120);
    });
    $("logDockFollow").addEventListener("change", function () { if (this.checked) $("logDockBody").scrollTop = $("logDockBody").scrollHeight; });
    // HERESY 1166 (Viktor: «кнопочку полной распашки консоли на всю высоту»): the log the window's full height, kept as chosen;
    // asked while folded, it unfolds too
    function tall(on) {
      if (on && POP && POP.win && !POP.win.closed) { try { POP.win.focus(); } catch (e) { /* over the others already */ } return; }   // HERESY 1809
      dock.classList.toggle("is-tall", on);
      $("logDockTall").setAttribute("aria-pressed", on ? "true" : "false");
      $("logDockTall").innerHTML = window.HeresyIcons ? window.HeresyIcons.ui(on ? "minimize" : "maximize") : (on ? "\u2921" : "\u2922");   // HERESY 1804: icons
      store("yue2.logDockTall", on ? "1" : null);
      if (on && dock.classList.contains("is-folded")) fold(false);
      if ($("logDockFollow").checked) $("logDockBody").scrollTop = $("logDockBody").scrollHeight;
    }
    tall(recall("yue2.logDockTall") === "1" && !dock.classList.contains("is-folded"));
    $("logDockTall").addEventListener("click", function () { tall(!dock.classList.contains("is-tall")); });
  })();
  $("logFollow").addEventListener("change", scrollLogToEnd);
  // HERESY 1166 (Viktor: «не возможно во время активности прокрутить и глянуть, что до этого»): Follow is on by default, and a
  // scroll up by hand (the wheel, a key, the scroll bar, a finger) lets go of it: it unticks and the log stays where you
  // read; back at the newest line it ticks again. A scroll the page makes itself (following) is not a hand.
  [["logDockBody", "logDockFollow"], ["logBody", "logFollow"]].forEach(function (pair) {
    var body = $(pair[0]), box = $(pair[1]), hand = 0;
    if (!body || !box) return;
    var mark = function () { hand = Date.now(); };
    ["wheel", "touchmove", "mousedown"].forEach(function (type) { body.addEventListener(type, mark, { passive: true }); });
    body.addEventListener("keydown", function (e) { if (/^(ArrowUp|ArrowDown|PageUp|PageDown|Home|End)$/.test(e.key)) mark(); });
    body.addEventListener("scroll", function () {
      if (Date.now() - hand > 800) return;
      var atEnd = body.scrollHeight - body.scrollTop - body.clientHeight < 24;
      if (atEnd !== box.checked) box.checked = atEnd;
    }, { passive: true });
  });

  /* ------------------------------------------------------------ run chain */

  var STATE_LABELS = { queued: "Queued", running: "Running", saving: "Saving", done: "Complete", failed: "Failed", cancelled: "Cancelled" };

  function watchJob(job) {
    STATE.job = job;
    STATE.take = null;
    paintPlayHere();   // HERESY 1168: no take shown, nothing to offer (it stood there from the take before)
    $("takeBody").classList.add("is-hidden");
    $("takeBody").classList.remove("is-running");
    $("takeEmpty").classList.add("is-hidden");
    $("chain").hidden = false;
    $("takeActions").innerHTML = "";
    $("stages").innerHTML = "";
    STATE.stageRows = null;
    paintAllRuns();
    if (job.abc) showPlanScore(job);
  }

  function paintAllRuns() {
    STATE.running = STATE.job && isLive(STATE.job) && !STATE.job.provisional ? STATE.job : liveMainJobs()[0] || null;
    paintRun();
    paintRunReturn();
    paintStatus();
    paintEngine();
    paintSubmitNote();
    // The library and the VAE row only change when the set of runs does; a
    // rebuild on every log line would flicker under the pointer.
    var signature = STATE.jobs.filter(function (j) { return isLive(j) && !j.provisional; }).map(function (j) {
      var stage = currentStage(j);
      return j.id + ":" + j.status + ":" + (stage ? stage.key : "") + ":" + j.title;
    }).join("|");
    if (signature !== STATE.runSignature) {
      STATE.runSignature = signature;
      paintLibrary();
      if (STATE.take) { paintDecodeSwitch(); paintSoundSwitch(); }
      if (tipFor && !tipFor.isConnected) hideTip();
    }
  }

  function liveMainJobs() {
    return STATE.jobs.filter(function (j) { return isLive(j) && !j.provisional && j.kind !== "transcribe" && j.kind !== "replay"; });
  }

  // The way back only makes sense while a run is live and you are elsewhere.
  function paintRunReturn() {
    var away = !!(STATE.running && STATE.take);
    $("backToRun").classList.toggle("is-hidden", !away);
    $("cancelAway").classList.toggle("is-hidden", !away);   // HERESY 1167
    if (away) $("backToRunLabel").textContent = "Back to " + STATE.running.title;
  }

  function activeJob() {
    return STATE.jobs.filter(function (j) { return (j.status === "running" || j.status === "saving") && !j.provisional; })[0] || null;
  }

  function runDescription(job) {
    var r = job.request, parts = [];
    if (job.kind === "replay") return tr(job.what || "same music, rendered again");
    if (job.kind === "external") parts.push("started elsewhere");
    if (r.plan) return (job.kind === "external" ? tr("started elsewhere") + " · " : "") + tr("score only");
    if (r.replay) parts.push("from saved codes");
    if (r.songs > 1) parts.push(r.songs + " songs");
    if (r.variations > 1) parts.push(r.variations + " sounds each");
    parts.push(vaeLabel(r.vae) + " VAE");
    if (FORMAT_LABELS[r.format]) parts.push(FORMAT_LABELS[r.format]);
    if (job.versioned && job.count) parts.push("versions " + (job.index + 1) + (job.count > 1 ? "\u2013" + (job.index + job.count) : ""));
    return parts.map(tr).join(" · ");              // HERESY 1166
  }

  function runSeeds(job, asList) {
    var lm = job.resolved.lm_seed || job.request.lm_seed, sound = job.resolved.seed || job.request.seed, parts = [];
    var songs = job.request.songs || 1, variations = job.request.variations || 1;
    if (job.kind === "transcribe") return "";
    if (lm && /^\d+$/.test(lm)) parts.push("music seed " + lm + (songs > 1 ? " \u2026 +" + (songs - 1) : ""));
    if (sound && /^\d+$/.test(sound) && !job.request.plan) parts.push("sound seed " + sound + (variations > 1 ? " \u2026 +" + (variations - 1) : ""));
    return asList ? parts.map(tr) : parts.map(tr).join(" · ");              // HERESY 1166
  }

  function stageRead(job, s) {
    var now = Date.now(), read = "";
    if (s.state === "skipped" || s.state === "waiting") return "";
    var elapsed = s.t0 ? Math.max(0, ((s.t1 || now) - s.t0) / 1000) : 0;
    if (s.key === "score" || s.key === "tokens") {
      var count = s.tokens || s.done;
      if (!count && s.state === "running") return elapsed > 0.5 ? clock(elapsed) : "";
      read = "<b>" + count.toLocaleString(loc()) + "</b> tokens";
      if (s.key === "tokens") read += " · " + clock((s.state === "completed" && s.longest ? s.longest : s.done) / FRAME_RATE);
      if (s.state === "running") {
        var songs = job.request.songs || 1;
        if (songs > 1 && s.ended) read += "<br>" + s.ended + " / " + songs + " ended";
        else if (elapsed > 0.5 && s.done) read += "<br>" + (s.done / elapsed).toFixed(0) + "/s";
      } else if (s.seconds || elapsed > 0.05) {
        read += "<br>" + (s.seconds || elapsed).toFixed(1) + "s";
      }
    } else if (s.key === "sound") {
      var total = soundTotal(job, s);
      read = "<b>" + s.done + "</b>" + (total ? " / " + total : "") + " steps";
      if (s.state === "running" && total && s.done > 0) {
        // A long song's sound runs for minutes at full tilt; without a
        // countdown that is indistinguishable from a hang.
        read += "<br>" + clock((total - s.done) * (elapsed / s.done)) + " left";
      } else if (s.state === "completed" && elapsed > 0.05) {
        read += "<br>" + elapsed.toFixed(1) + "s";
      }
    } else if (s.key === "decode") {
      read = "<b>" + s.done + "</b>" + (s.total ? " / " + s.total : "") + (s.total === 1 ? " track" : " tracks");
      if (s.state === "completed" && elapsed > 0.05) read += "<br>" + elapsed.toFixed(1) + "s";
    }
    return read;
  }

  function soundTotal(job, s) {
    var per = s.stepsPer || job.request.steps || 0;
    return (job.request.songs || 1) * (s.chunks || 1) * per;
  }

  function stagePercent(job, s) {
    if (s.key === "sound") { var t = soundTotal(job, s); return t ? Math.min(100, (s.done / t) * 100) : 0; }
    if (s.key === "decode") {
      var part = s.tiles ? (s.tilesDone || 0) / s.tiles : 0;
      return s.total ? Math.min(100, ((s.done + part) / s.total) * 100) : 0;
    }
    return -1;   // the token stages end when the model says so: open-ended
  }

  window.ruachStages = { skeleton: function (req) { return stageSkeleton({ request: req }); }, read: function (job, s) { return stageRead(job, s); },   // HERESY 1625: for the checks
                          note: function (job, s) { return stageNote(job, s); }, run: function (job, key) { return runStage(job, key); } };
  function stageNote(job, s) {
    if (s.state === "skipped") return tr(s.skipNote || "Skipped in this mode");
    var extra = [];
    if (s.key === "tokens" && job.notes.sliders && s.state !== "waiting") extra.push("sliders: " + job.notes.sliders);
    if (s.state === "running" && job.notes.load) extra.push(job.notes.load);
    if (s.key === "sound" && s.music) extra.push(clock(s.music) + " of music" + (s.chunks > 1 ? " in " + s.chunks + " chunks" : ""));
    if (s.planned) extra.push("planned first");          // HERESY 1625
    if (s.truncated) extra.push("hit the token cap");
    return [s.note].concat(extra).map(tr).join(" · ");   // HERESY 1166
  }

  function paintRun() {
    var job = STATE.job;
    if (!job) return;
    var label = STATE_LABELS[job.status] || job.status;
    var active = activeJob();
    $("runState").textContent = label;
    $("runState").dataset.s = job.status === "saving" ? "running" : job.status;
    $("cancelRun").classList.toggle("is-hidden", !isLive(job));
    $("runWhat").textContent = runDescription(job);
    // HERESY 1500 (Viktor 16.10.2026: «Звуковой сид на вторую строку, если сам сид отрывается от лейбла»): each seed with its word, one piece
    // that goes to the next line whole
    var seedsHtml = runSeeds(job, true).map(function (x) { return '<span class="seed-pair" translate="no">' + escape(x) + "</span>"; }).join(" · ");
    if ($("runSeeds").dataset.html !== seedsHtml) { $("runSeeds").innerHTML = seedsHtml; $("runSeeds").dataset.html = seedsHtml; }
    if (!STATE.take) {
      var eyebrow = label;
      if (job.status === "queued") eyebrow = active && active !== job ? "waiting behind " + active.title : "waiting for the server";
      else if (job.status === "saving") eyebrow = "writing the files";
      $("takeEyebrow").textContent = eyebrow;
      $("takeTitle").textContent = job.title;
      $("takeTitle").setAttribute("translate", "no");   // HERESY 1166: a title is the user's
    }
    var error = job.status === "failed" ? job.error : "";
    $("runError").classList.toggle("is-hidden", !error);
    $("runError").textContent = error || "";
    paintClock();

    if (!STATE.stageRows || STATE.stageRows.job !== job) {
      $("stages").innerHTML = job.stages.map(function (s, n) {
        return '<li class="stage" data-key="' + s.key + '"><span class="stage-num">' + (n + 1) + "</span>" +
          '<div class="stage-main"><div class="stage-label">' + escape(s.label) + "</div>" +
          '<div class="stage-note"></div><div class="meter"><i></i></div></div><div class="stage-read"></div></li>';
      }).join("");
      STATE.stageRows = { job: job, rows: all("#stages .stage") };
    }
    // Rows are updated in place, so a running meter keeps its animation.
    job.stages.forEach(function (s, n) {
      var row = STATE.stageRows.rows[n];
      if (!row) return;
      var shown = s.state, finished = !isLive(job);
      if (finished && s.state === "waiting") shown = "skipped";
      row.dataset.s = shown;
      row.querySelector(".stage-note").textContent = shown === "skipped" && s.state === "waiting" ? "Not reached" : stageNote(job, s);
      row.querySelector(".stage-read").innerHTML = stageRead(job, s);
      var meter = row.querySelector(".meter"), bar = meter.firstChild, pct = stagePercent(job, s);
      meter.classList.toggle("is-hidden", shown !== "running" && shown !== "completed");
      if (shown === "running") {
        meter.classList.toggle("indeterminate", pct < 0);
        bar.style.transform = pct < 0 ? "" : "scaleX(" + (pct / 100).toFixed(4) + ")";   // the indeterminate slide is CSS
        bar.style.background = "";
      } else if (shown === "completed") {
        meter.classList.remove("indeterminate");
        bar.style.transform = "scaleX(1)";
        bar.style.background = "var(--patina-dim)";
      }
    });
  }

  function paintClock() {
    var job = STATE.job;
    if (!job) return;
    var text = "0:00";
    if (job.started) text = (job.approx ? "~" : "") + clock(((job.finished || Date.now()) - job.started) / 1000);
    else if (job.status === "queued") text = clock((Date.now() - job.submitted) / 1000);
    $("runClock").textContent = text;
  }

  setInterval(function () {
    if (document.hidden) return;
    if (tipFor && !tipFor.isConnected) hideTip();
    paintClock();
    var job = STATE.job;
    if (job && isLive(job)) paintRun();
    if (activeJob()) paintEngine();
  }, 500);

  $("backToRun").addEventListener("click", function () {
    if (!STATE.running) return;
    STATE.take = null;
    $("takeBody").classList.add("is-hidden");
    watchJob(STATE.running);
    show("take");
  });

  // HERESY 1167 (Viktor: «Пропала кнопка отмены генерации»): one cancel for the run's view, its row in the Takes column and
  // the ✕ beside «Back to …»
  $("cancelRun").addEventListener("click", function () { cancelJob(STATE.job); });
  $("cancelAway").addEventListener("click", function () { cancelJob(STATE.running); });
  // HERESY 1489: the Content Credentials card keeps what is in it; the lab says what signs now
  $("c2paSave").addEventListener("click", function () {
    var body = { on: $("c2paOn").checked, author: $("c2paAuthor").value, contact: $("c2paContact").value, cert: $("c2paCert").value, key: $("c2paKey").value };
    post("/lab/c2pa", body).then(function (s) { takeC2pa(s); toast("Content Credentials kept"); }).catch(function (e) {
      $("c2paSay").textContent = tr(e.message); $("c2paSay").classList.add("is-bad");
    });
  });
  setTimeout(loadC2pa, 0);
  // HERESY 1488 (Viktor 16.10.2026: «нужно упростить карту, а весь "гламур"… перенести в контекстуху»; «Да, внедряй твою версию карты»):
  // the card without its rows of buttons by default (the take's menu holds them since 1483); «⋯» beside the title opens that menu,
  // and from it the card's buttons come back (kept in this browser)
  var CARD_TOOLS = "yue2.cardTools";
  function cardTools() { return recall(CARD_TOOLS) === "on"; }
  function paintCardTools() { document.body.classList.toggle("card-lean", !cardTools()); }
  paintCardTools();
  $("takeMore").addEventListener("click", function (e) {
    if (!STATE.take) return;
    var r = e.currentTarget.getBoundingClientRect();
    STATE.menuFromCard = true;
    takeMenu(STATE.take.name, r.left, r.bottom + 4);
  });
  function cancelJob(job) {
    if (!job || !isLive(job)) return;
    // Queued versions of the same song go with it.
    var doomed = STATE.jobs.filter(function (j) {
      return j === job || (job.group && j.group === job.group && j.status === "queued");
    });
    // HERESY 1410 (Viktor 13.10.2026: «Для `Cancel run` добавь диалоговое окно»): asked first, the run named
    var title = String((job.request && job.request.title) || "").trim();
    window.HeresyDialog.confirm("Cancel this run?" + (title ? "\n\n\u00ab" + title + "\u00bb" : "") + "\n\nWhat the engine has made of it so far is lost." +
      (doomed.length > 1 ? "\n\nIts queued versions go with it." : ""), { ok: "Cancel it", cancel: "Keep it running", danger: true })   // HERESY 1482
      .then(function (ok) { if (ok && isLive(job)) cancelNow(job, doomed); });
  }
  function cancelNow(job, doomed) {
    Promise.all(doomed.map(function (j) {
      return post("/job?id=" + encodeURIComponent(j.id) + "&cancel=1").catch(function (error) { toast(error.message, "bad"); });
    })).then(function () {
      toast(doomed.length > 1 ? "Cancelling this run and " + (doomed.length - 1) + " queued version" + (doomed.length > 2 ? "s" : "")
                              : "Cancelling after the current step");
      pollJobs();
    });
  }

  /* --------------------------------------------------------------- engine */

  function paintEngine() {
    var lamp = $("engineLamp"), state, detail, s;
    var live = activeJob();
    var queued = STATE.jobs.filter(function (j) { return j.status === "queued" && !j.provisional; }).length;
    if (!STATE.online) {
      s = "error"; state = "Server offline"; detail = "retrying every few seconds";
    } else if (live) {
      s = "busy";
      state = live.kind === "transcribe" ? "Transcribing" : (live.request.plan ? "Planning" : "Generating");
      var stage = currentStage(live);
      detail = (stage ? stage.label : (live.status === "saving" ? "Saving" : "Starting")) +
        (live.started ? " · " + clock((Date.now() - live.started) / 1000) : "") + (queued ? " · " + queued + " queued" : "");
    } else if (queued) {
      s = "loading"; state = "Queued"; detail = queued + (queued === 1 ? " run" : " runs") + " waiting";
    } else if (STATE.hardware && STATE.hardware.busy) {
      s = "busy"; state = "Busy"; detail = "a run from another page";
    } else {
      s = "idle"; state = "Ready";
      var backbone = STATE.settings && STATE.settings.model ? STATE.settings.model : basename(STATE.props && STATE.props.model).replace(/\.gguf$/i, "");
      detail = STATE.hardware && STATE.hardware.loaded_modules > 0 ? backbone + " resident" : (STATE.props ? "model not loaded yet" : "");
    }
    // HERESY 1157 (Viktor: «Зелёную точку в баре анимируй всегда, когда идёт GPU активность в студии, и тултипом при
    // наведении running jobs status»): the lab's work on the cards (artwork, stems, upscale, Whisper, training…) pulses the
    // lamp too, green while the engine rests; the tip says each thing running, its card and how far it is
    var act = (typeof ACT !== "undefined" && ACT) || { running: [] };   // painted before the poller below exists, too
    var lab = (act.running || []).filter(function (r) { return r.status === "running"; });
    if (s === "idle" && lab.length) { s = "working"; detail = lab.length === 1 ? lab[0].what : lab.length + " jobs on the cards"; }
    lamp.dataset.s = s;
    lamp.classList.toggle("is-gpu", s === "busy" || s === "working" || (s === "loading" && !!live));
    $("engineState").textContent = state;
    $("engineDetail").textContent = String(detail || "").split(" \u00b7 ").map(tr).join(" \u00b7 ");   // HERESY 1166
    // HERESY 1165: its words, and what runs and waits, are the queue panel's (below), no longer a tip
    if (typeof QP !== "undefined" && QP) { QP.state = state; QP.detail = detail; paintQueue(); }
  }

  // HERESY 1157: the lab's work, as it starts and ends, into the Server log ("[Lab] …"), and what runs now for the lamp
  var ACT = { since: 0, running: [], queue: [], busy: false, reloadTimer: 0 };
  function pollActivity() {
    if (ACT.busy) return;
    ACT.busy = true;
    var first = ACT.since === 0, filed = false;
    api("/lab/activity?since=" + ACT.since).then(function (d) {
      (d && d.lines || []).forEach(function (l) {
        ACT.since = Math.max(ACT.since, l[0]); addLogLine("[Lab] " + l[1], false);
        if (/^\S+ (regenerate · .* → |refined · .* · into )/.test(l[1])) filed = true;   // HERESY 1165: the lab moved takes
      });
      if (d && d.seq < ACT.since) ACT.since = 0;                 // the lab restarted: its count began again
      ACT.running = (d && d.running) || [];
      window.dispatchEvent(new CustomEvent("heresy-activity", { detail: { running: ACT.running } }));   // HERESY 1549: the bars above the player
      ACT.queue = (d && d.queue) || [];                           // HERESY 1165: the regenerations the engine has not begun
      var held = function (a) { return (a || []).map(function (p) { return p.gpu + ":" + p.painter + ":" + !!p.busy; }).join("|"); }, was = held(ACT.painters);
      ACT.painters = (d && d.painters) || [];                     // HERESY 1370: the Artist's painters kept between runs
      if (held(ACT.painters) !== was) paintHardware();
      markRegen((d && d.regenerating) || []);                     // HERESY 1167
      if (filed && !first) librarianSoon();
      paintEngine();
    }).catch(function () { ACT.running = []; ACT.queue = []; }).then(function () { ACT.busy = false; });
  }
  // HERESY 1167 (Viktor 05.10.2026: «Когда редженится карточка, можешь добавить ей 60% полупрозрачности и вибрацию до 75%
  // полупрозрачности?»): a take being made again, its regeneration waiting or running, breathes on its card (the takes
  // list's and the Librarian's) until the new one lands; the cards drawn anew meanwhile ask HeresyRegen.has
  var REGENNING = {};
  function markRegen(names) {
    var next = {};
    names.forEach(function (n) { next[n] = 1; });
    var same = Object.keys(next).length === Object.keys(REGENNING).length && Object.keys(next).every(function (n) { return REGENNING[n]; });
    REGENNING = next;
    if (same && !names.length) return;
    all(".take[data-name], .coll-card[data-name]").forEach(function (c) { c.classList.toggle("is-regenerating", !!REGENNING[c.dataset.name]); });
  }
  window.HeresyRegen = { has: function (name) { return !!REGENNING[name]; } };
  window.ruachTakes = function () { return STATE.takes.map(function (t) { return { name: t.name, title: t.label || t.title || t.name }; }); };   // HERESY 1557: a step's file field offers them

  // HERESY 1165 (Viktor: «В Instrumental Probe FAILED, to REGENERATE какая-то аномалия. Не вижу, или что перегенерилось»):
  // the lab files a regenerated take (and what the Refiner made) a moment after the engine ends it; the page read its
  // takes again then, not the workspaces, so the old card stayed where the new one stands. Read again when the lab says it
  // filed, never under a title being typed
  function librarianSoon() {
    clearTimeout(ACT.reloadTimer);
    ACT.reloadTimer = setTimeout(function again() {
      var a = document.activeElement;
      if (document.querySelector(".coll-title-edit") || (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.closest("#view-collection"))) {
        ACT.reloadTimer = setTimeout(again, 1500);
        return;
      }
      if (window.HeresyCollection) window.HeresyCollection.reload();
      refreshLibrary().catch(function () {});
    }, 300);
  }

  // HERESY 1165 (Viktor: «В баре тултипом под красную/зелёную — вывод списка очереди, и возможность удалить из очереди то
  // или иное ожидающее действо»): under the engine's lamp, what runs and what waits: the songs (this page's own, and the
  // regenerations the lab queued, which the engine's log names only when they begin) and the lab's work on the cards. A
  // waiting one comes off its queue by its ✕, pressed twice (the first press asks: a slip would cost a render). It opens
  // on hover or a click and stays while the pointer is on it, or until a click elsewhere when it was clicked open. The
  // list is built again only when what it holds changes, the times in place: a button replaced under the pointer every
  // half second would lose its click.
  var QP = { el: null, pinned: false, hideTimer: 0, armed: "", armTimer: 0, gone: {}, built: "", state: "", detail: "" };
  function queueRows() {
    var act = (typeof ACT !== "undefined" && ACT) || {}, rows = [];
    STATE.jobs.filter(function (j) { return isLive(j) && !j.provisional; }).forEach(function (j) {
      var run = j.status !== "queued", stage = run ? currentStage(j) : null;
      rows.push({ key: "engine:" + j.id, what: j.kind === "transcribe" ? "Transcription" : j.request && j.request.plan ? "Score plan" : "Song",
                  name: j.title || j.id, run: run,
                  state: run ? [stage ? stage.label : j.status === "saving" ? "Saving" : "Starting", j.started ? clock((Date.now() - j.started) / 1000) : ""] : ["waits"] });
    });
    (act.queue || []).forEach(function (q) {
      if (STATE.jobs.some(function (j) { return j.id === q.job; })) return;          // this page knows it already
      rows.push({ key: "engine:" + q.job, what: "Regenerate", name: q.old, run: false, state: ["waits"] });
    });
    (act.running || []).forEach(function (r) {
      rows.push({ key: "lab:" + r.key, what: r.what, name: r.name, run: r.status !== "queued",
                  state: r.status === "queued" ? ["waits for a card"]
                    : [r.gpu != null ? (r.gpu === "cpu" ? "CPU" : "GPU " + r.gpu) : "", r.steps ? (r.step || 0) + "/" + r.steps : "", r.since ? clock(Date.now() / 1000 - r.since) : ""] });
    });
    rows.forEach(function (r) { r.state = r.state.filter(Boolean); });
    return rows.sort(function (a, b) { return (b.run ? 1 : 0) - (a.run ? 1 : 0); });   // what runs first, then the waiting in their order
  }
  function queuePieces(list) { return list.map(function (p) { return "<span>" + escape(p) + "</span>"; }).join(" \u00b7 "); }
  function paintQueue() {
    if (!QP.el || QP.el.hidden) return;
    var rows = queueRows();
    QP.el.querySelector(".q-head").innerHTML = "<b>" + escape(QP.state) + "</b>" + (QP.detail ? '<span class="q-detail">' + queuePieces(QP.detail.split(" \u00b7 ")) + "</span>" : "");
    var built = rows.map(function (r) { return [r.key, r.run, !!QP.gone[r.key], QP.armed === r.key, r.what, r.name].join("|"); }).join("\n");
    var list = QP.el.querySelector(".q-list");
    if (built !== QP.built) {
      QP.built = built;
      list.innerHTML = rows.length ? rows.map(function (r) {
        var gone = !!QP.gone[r.key], armed = QP.armed === r.key;
        return '<li class="q-row' + (r.run ? " is-run" : " is-wait") + (gone ? " is-gone" : "") + '" data-q="' + escape(r.key) + '">' +
          '<span class="q-dot" aria-hidden="true"></span><span class="q-what">' + escape(r.what) + "</span>" +
          '<span class="q-name" translate="no">' + escape(r.name) + '</span><span class="q-state"></span>' +
          (r.run || gone ? "<span></span>" : '<button type="button" class="q-off' + (armed ? " is-armed" : "") + '" data-q-off="' + escape(r.key) + '" aria-label="' +
            (armed ? "Press again to take it off" : "Take it off the queue") + '">' + (armed ? "Take it off?" : "\u2715") + "</button>") + "</li>";
      }).join("") : '<li class="q-empty">Nothing runs and nothing waits.</li>';
    }
    rows.forEach(function (r) {
      var cell = list.querySelector('[data-q="' + (window.CSS && CSS.escape ? CSS.escape(r.key) : r.key) + '"] .q-state');
      var html = QP.gone[r.key] ? "<span>taken off</span>" : queuePieces(r.state);
      if (cell && cell.innerHTML !== html) cell.innerHTML = html;
    });
  }
  function takeOff(key) {
    if (QP.armed !== key) {                                       // the first press asks
      QP.armed = key;
      clearTimeout(QP.armTimer);
      QP.armTimer = setTimeout(function () { QP.armed = ""; paintQueue(); }, 4000);
      return paintQueue();
    }
    QP.armed = "";
    QP.gone[key] = 1;
    paintQueue();
    var kind = key.split(":")[0], id = key.slice(kind.length + 1);
    (kind === "engine" ? post("/job?id=" + encodeURIComponent(id) + "&cancel=1") : post("/lab/jobs/cancel", { key: id })).then(function () {
      toast("Taken off the queue");
      if (kind === "engine") pollJobs(); else pollActivity();
    }).catch(function (e) { delete QP.gone[key]; paintQueue(); toast(e.message, "bad"); });
  }
  function placeQueue() {
    var chip = $("engineLamp").closest(".engine-chip"), r = chip.getBoundingClientRect(), w = QP.el.offsetWidth;
    QP.el.style.top = Math.round(r.bottom + 6) + "px";
    QP.el.style.left = Math.round(Math.max(8, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 8))) + "px";
  }
  function queueOpen(pin) {
    if (!QP.el) {
      QP.el = document.createElement("div");
      QP.el.id = "queuePanel";
      QP.el.className = "q-panel";
      QP.el.setAttribute("role", "dialog");
      QP.el.setAttribute("aria-label", "What runs and what waits");
      QP.el.hidden = true;
      QP.el.innerHTML = '<div class="q-head"></div><ul class="q-list"></ul>' +
        '<p class="q-hint">A waiting one comes off its queue with its \u2715, pressed twice. What runs stops where it is shown: a song in its run, a training in the Trainer.</p>';
      document.body.appendChild(QP.el);
      QP.el.addEventListener("mouseenter", function () { clearTimeout(QP.hideTimer); });
      QP.el.addEventListener("mouseleave", function () { if (!QP.pinned) queueCloseSoon(); });
      QP.el.addEventListener("click", function (e) { var b = e.target.closest("[data-q-off]"); if (b) takeOff(b.dataset.qOff); });
    }
    clearTimeout(QP.hideTimer);
    if (pin) QP.pinned = true;
    QP.el.hidden = false;
    QP.built = "";
    paintQueue();
    placeQueue();
    $("engineLamp").closest(".engine-chip").setAttribute("aria-expanded", "true");
  }
  function queueCloseSoon() { clearTimeout(QP.hideTimer); QP.hideTimer = setTimeout(queueClose, 300); }
  function queueClose() {
    if (!QP.el || QP.el.hidden) return;
    QP.el.hidden = true; QP.pinned = false; QP.armed = "";
    $("engineLamp").closest(".engine-chip").setAttribute("aria-expanded", "false");
  }
  (function () {
    var chip = $("engineLamp").closest(".engine-chip");
    chip.setAttribute("tabindex", "0");
    chip.setAttribute("role", "button");
    chip.setAttribute("aria-haspopup", "dialog");
    chip.setAttribute("aria-expanded", "false");
    chip.setAttribute("aria-label", "What runs and what waits");
    chip.addEventListener("mouseenter", function () { queueOpen(false); });
    chip.addEventListener("mouseleave", function () { if (!QP.pinned) queueCloseSoon(); });
    chip.addEventListener("click", function () { if (QP.el && !QP.el.hidden && QP.pinned) queueClose(); else queueOpen(true); });
    chip.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); chip.click(); } });
    document.addEventListener("mousedown", function (e) { if (QP.el && !QP.el.hidden && !e.target.closest("#queuePanel, .engine-chip")) queueClose(); }, true);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && QP.el && !QP.el.hidden) queueClose(); });
    window.addEventListener("resize", function () { if (QP.el && !QP.el.hidden) placeQueue(); });
  })();
  setInterval(function () { if (document.visibilityState === "visible") pollActivity(); }, 3000);
  setTimeout(pollActivity, 1500);

  function paintServer() {
    var p = STATE.props || {};
    var rows = [
      ["Version", p.version || "—", ""],
      ["Backbone", basename(p.model) || "—", ""],
      ["Default VAE", vaeLabel(STATE.defaultVae), ""],
      ["Sample rate", p.sample_rate ? (p.sample_rate / 1000) + " kHz" : "—", ""],
      ["Context", p.context ? p.context.toLocaleString(loc()) + " tokens" : "—", ""],
      ["Songs per pass", String(STATE.maxBatch), ""],
      ["Transcriber", STATE.transcriber ? "loaded" : "not started with one", STATE.transcriber ? "ok" : "no"],
      ["Library", STATE.library ? "saved on disk" : "off (no --outputs)", STATE.library ? "ok" : "no"],
      ["Page settings", window.HeresySettings && window.HeresySettings.reachable() ? "on disk · user/settings.json" : "this browser only (lab is down)",   // HERESY 1027
       window.HeresySettings && window.HeresySettings.reachable() ? "ok" : "no"]
    ];
    $("serverCard").innerHTML = rows.map(function (row) {
      return "<div><dt>" + row[0] + '</dt><dd class="' + row[2] + '" title="' + escape(row[1]) + '">' + escape(row[1]) + "</dd></div>";
    }).join("");
    YueVaes.set(STATE.vaes, STATE.defaultVae);
    paintSliderCard();
    paintStrip();
    // Transcription needs the server's transcriber.
    $("coverFromAudio").disabled = !STATE.transcriber;
    $("coverFile").disabled = !STATE.transcriber;
    $("coverTask").disabled = !STATE.transcriber;
    if (!STATE.transcriber) {
      $("coverAudioStatus").textContent = "The server runs without a transcriber: start it with --transcriber to cover a recording.";
    } else if (!$("coverAudioStatus").dataset.busy) {
      $("coverAudioStatus").textContent = "Ready. Runs on the server, in its queue like a song.";
    }
    paintEngine();
  }

  function applyProps(props) {
    var first = !STATE.props;
    STATE.props = props;
    STATE.defaults = props.defaults || {};
    STATE.vaes = Array.isArray(props.vaes) && props.vaes.length ? props.vaes
      : [{ name: "standard", label: "Standard", repo: "m-a-p/YuE2-Vae" }];
    STATE.defaultVae = props.default_vae || STATE.vaes[0].name;
    STATE.sliderCatalog = Array.isArray(props.sliders) ? props.sliders : [];
    YueLoras.setCatalog(Array.isArray(props.loras) ? props.loras : []);
    STATE.sources = props.sources || {};
    paintAbout();
    YueLoras.setSources(STATE.sources.loras);
    YueVaes.setSources(STATE.sources.vaes);
    STATE.maxBatch = Math.max(1, parseInt(props.max_batch, 10) || 1);
    STATE.transcriber = !!props.transcriber;
    STATE.library = props.outputs !== false;
    if (props.frame_rate) FRAME_RATE = props.frame_rate;
    $("versions").max = "10";
    if (first) {
      buildKnobs();
      syncShape();
      paintOutputDefaults();
    }
    paintVaes();
    // drop sliders the server no longer offers
    var known = sliderLabels();
    STATE.sliderChoice = STATE.sliderChoice.filter(function (c) { return known[c.id] !== undefined; });
    paintSliders();
    fillTips();
    paintServer();
    paintSubmitNote();
  }


  /* ------------------------------------------- engine settings + hardware */
  // The server's own engine knobs: which backbone file, whether models stay in
  // GPU memory between songs, the context (key/value cache) size and the VAE
  // tile size. Presets only fill the form; Save applies.

  // HERESY 1071 (Viktor 02.10.2026): no size presets, Auto and Manual only. Auto fits the context and the
  // VAE tiles to the GPU the server found; the backbone (the top bar) and "Keep models loaded" stay yours.
  // 1071b: Auto named the backbone too, so a Q8_0 picked in the top bar made it Manual at every F5.
  // HERESY 1304: the tiers as measured on GPU2 10.10.2026 (the engine's peak by its pid, a song of some two minutes): BF16 the whole
  // context 9.6 GiB, 16 384 rows 7.9, 12 288 7.0; Q8_0 the whole 7.7, 16 384 6.0, 12 288 5.1, 8 192 4.2; Q6_K 8 192 3.7 (Q5_K_M
  // 3.6); the VAE's tiles changed nothing measurable. Q8_0 is quicker than the K-quants here (34 s the song against 42 and 36)
  function autoKnobs(gib) {
    if (gib >= 23) return { model: "BF16", max_seq: 0, vae_core: 1024 };
    if (gib >= 15.4) return { model: "BF16", max_seq: 0, vae_core: 512 };
    if (gib >= 11.4) return { model: "BF16", max_seq: 16384, vae_core: 512 };
    if (gib >= 7.4) return { model: "Q8_0", max_seq: 12288, vae_core: 256 };
    if (gib >= 5.4) return { model: "Q8_0", max_seq: 8192, vae_core: 256 };     // HERESY 1304: a 6 GB card
    if (gib >= 4.4) return { model: "Q6_K", max_seq: 8192, vae_core: 256 };     // HERESY 1304: smaller still, short songs
    return null;
  }
  function cardGib() { var gpu = STATE.hardware && (STATE.hardware.gpus || [])[0]; return gpu ? gpu.total_bytes / GIB : 0; }
  // HERESY 1294: what Auto plans for: the studio card's size, or its VRAM limit (Engine → GPUs) when one is set
  function gpuGib() { var t = cardGib(), lim = window.HeresyGpus && window.HeresyGpus.studioLimitGib ? window.HeresyGpus.studioLimitGib() : 0; return lim && t ? Math.min(t, lim) : t; }
  var SETTING_KEYS = ["model", "keep_loaded", "max_seq", "vae_core", "unload_after_min", "unload_at_once"];   // HERESY 1167: the idle unload
  var GIB = 1073741824;

  function fullContext() { return (STATE.settings && STATE.settings.max_seq_full) || (STATE.props && STATE.props.context) || 24576; }

  function modelThere(m) { return ((STATE.settings && STATE.settings.models) || []).indexOf(m) >= 0; }

  // The choice is kept (yue2.memPreset: auto | manual) and nothing is guessed from the knobs: Auto shows
  // only while the knobs are still what Auto set for this GPU; a knob moved by hand makes it Manual.
  var PRESET_KEY = "yue2.memPreset";
  // HERESY 1287 (Viktor 09.10.2026, a 16 GB laptop card: «Ручной пресет памяти не даёт мне выбрать объём VRAM из доступных 16GB VRAM.
  // В реалии я бы на этом железе выбрал бы 14GB, чтобы не было OOM»): Auto within N GB, from a gigabyte under the card down to 8:
  // the knobs for that much, the rest of the card left to what else runs on it. «auto» is the whole card, «auto:14» within 14 GB
  // HERESY 1294: the tiers went for each card's VRAM limit (Engine → GPUs); «auto:N» is read until it becomes the studio card's limit
  function budgetOf(v) { return v === "auto" ? gpuGib() : /^auto:\d+(\.\d+)?$/.test(v || "") ? parseFloat(v.slice(5)) : 0; }
  function shownPreset(settings) {
    var kept = recall(PRESET_KEY) || "", a = autoKnobs(budgetOf(kept));
    if (!/^auto(:\d+(\.\d+)?)?$/.test(kept) || !a) return "manual";
    return a.max_seq === settings.max_seq && a.vae_core === settings.vae_core ? "auto" : "manual";
  }
  // Auto says what it found and what it sets; each budget under the card, what it sets for that much
  function paintPresetSizes() {
    var tot = cardGib(), gib = gpuGib(), a = autoKnobs(gib), sel = $("memPreset"), was = sel.value, o = sel.querySelector('option[value="auto"]');
    var knobs = function (k) { return (k.max_seq ? "context " + k.max_seq.toLocaleString(loc()) : "whole context") + ", VAE tiles " + k.vae_core; };
    if (o) o.textContent = "Auto" + (tot ? " (" + tot.toFixed(1) + " GB found" + (gib < tot - 0.01 ? ", its limit " + gib.toFixed(1) + " GB in Engine \u2192 GPUs" : "") +
                                           (a ? ": " + knobs(a) : ": too small for YuE2") + ")" : " (detect)");
    Array.prototype.slice.call(sel.querySelectorAll('option[value^="auto:"]')).forEach(function (x) { x.remove(); });   // HERESY 1294: the tiers went
    if (was && sel.querySelector('option[value="' + was + '"]')) sel.value = was;
  }

  // Top-bar model choice: the backbone files the server was started with.
  var MODEL_SIZES = { BF16: "7.2 GB", Q8_0: "3.8 GB", Q6_K: "2.9 GB", Q5_K_M: "2.6 GB" };
  // HERESY 1490 (Viktor 16.10.2026: «более полные имена: стоковые веса `YuE2 ...`, мёрджи `YuE2 IRA/IRAE ...`»): a backbone by its file's
  // name (start.sh offers models/YuE2-3B-<name>.gguf as <name>): «YuE2 BF16», «YuE2 IRA Q8_0»; its size by its quant; what it is
  function modelSize(m) { return MODEL_SIZES[String(m).split("-").pop()] || ""; }
  // HERESY 1689 (Viktor 21.10.2026: «чтобы они правильно и в своей последовательности прописывались в барном дроплауне выбора модели и её форматности»):
  // a merge's own name kept whole, only its format set apart: «YuE2 IRAE-IR BF16»
  function modelLabel(m) { if (!m) return m; var parts = String(m).split("-"), q = parts.pop(); return "YuE2 " + (parts.length ? parts.join("-") + " " : "") + q; }
  // HERESY 1490c · 1689: m-a-p's own first; the merges in their lineage (IRA, IRAE, IRAEv2, IRAEv3, IRAE-IR); our own fine-tunes (RS-…) by name; any
  // other by name; within each, the formats from the fullest: BF16, Q8_0, Q6_K_L, Q6_K, Q5_K_L, Q5_K_M
  var MODEL_LINE = ["IRA", "IRAE", "IRAEv2", "IRAEv3", "IRAE-IR", "IRAE-IRv2"];   // HERESY 1708: IRAE-IRv2
  function modelOrder(list) {
    var Q = ["BF16", "Q8_0", "Q6_K_L", "Q6_K", "Q5_K_L", "Q5_K_M"], key = function (m) {
      var parts = String(m).split("-"), q = parts.pop(), merge = parts.join("-"), i = Q.indexOf(q), at = MODEL_LINE.indexOf(merge);
      return [!merge ? 0 : at >= 0 ? 1 : /^RS-/.test(merge) ? 2 : 3, at >= 0 ? at : 0, merge, i < 0 ? Q.length : i, q];
    };
    return list.slice().sort(function (a, b) {
      var x = key(a), y = key(b);
      for (var i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
      return 0;
    });
  }
  window.ruachModelOrder = modelOrder; window.ruachModelLabel = modelLabel;   // HERESY 1689: for the checks
  // HERESY 1494 (Viktor 16.10.2026: «В селекторе на наши мёрджи не забудь подсказки добавить и доли по слияниям, чтобы не потеряться
  // никому»): what each merge carries, read by the lab from its file (merge-loras writes it there, the quants keep it): its adapters and
  // their strengths after its name in Compute's list, and line by line in the tips of both selectors and of each entry. The lab away:
  // the names alone, as before, and asked again in half a minute
  var MERGES = { merges: {}, errors: {}, key: null, failed: null, retry: 0 };
  function loadMerges(models) {
    var key = (models || []).join("|");
    if (key === MERGES.key || (key === MERGES.failed && Date.now() < MERGES.retry)) return;   // another list is asked at once
    MERGES.key = key;
    fetch("/lab/models/merges").then(function (r) { return r.ok ? r.json() : Promise.reject(new Error(r.status)); }).then(function (d) {
      if (MERGES.key !== key) return;
      MERGES.merges = (d && d.merges) || {}; MERGES.errors = (d && d.errors) || {};
      if (STATE.settings) { paintModelPick(STATE.settings); fillSetModel(STATE.settings, true); }
    }).catch(function () { if (MERGES.key === key) { MERGES.key = null; MERGES.failed = key; MERGES.retry = Date.now() + 30000; } });
  }
  function mergeNum(x) { return String(Math.round(x * 1000) / 1000); }
  function mergeParts(m) {   // an adapter a line, its two halves together (Epic trailer's music file and its sound file)
    var by = {}, order = [];
    (MERGES.merges[m] || []).forEach(function (p) {
      if (!by[p.name]) { by[p.name] = { name: p.name, ar: 0, nar: 0 }; order.push(p.name); }
      by[p.name].ar += p.ar || 0; by[p.name].nar += p.nar || 0;
    });
    return order.map(function (n) { return by[n]; });
  }
  function mergeShort(m) {   // «Instrumental 0.75 + Real audio v9 0.85 + Epic trailer 0.32/0.32»
    return mergeParts(m).map(function (p) { return p.name + " " + (p.ar && p.nar ? mergeNum(p.ar) + "/" + mergeNum(p.nar) : mergeNum(p.ar || p.nar)); }).join(" + ");
  }
  function mergeTip(m) {
    if (MERGES.errors[m]) return tr(modelLabel(m) + ": what it carries could not be read (" + MERGES.errors[m] + ")");
    var parts = mergeParts(m);
    if (!parts.length) return "";
    return tr(modelLabel(m) + " is a merge: these adapters are in its weights, at these strengths. Do not load them again on top of it.") + "\n" +
      parts.map(function (p) {
        var h = [];
        if (p.ar) h.push(tr("music half " + mergeNum(p.ar)));
        if (p.nar) h.push(tr("sound half " + mergeNum(p.nar)));
        return "\u00b7 " + p.name + ": " + h.join(", ");
      }).join("\n");
  }
  function modelKind(m) {
    if (mergeParts(m).length) return " (merge: " + mergeShort(m) + ")";   // HERESY 1494
    var merge = String(m).indexOf("-") > 0, bf16 = /(^|-)BF16$/.test(m);
    if (/^IRA-/.test(m)) return bf16 ? " (IRA merge: Instrumental + Real Audio)" : " (IRA merge, quantized)";
    return merge ? (bf16 ? " (merge)" : " (merge, quantized)") : bf16 ? " (release weights)" : " (quantized)";
  }

  function paintModelPick(settings) {
    var pick = $("modelPick"), models = modelOrder((settings && settings.models) || []);   // 1490c
    loadMerges((settings && settings.models) || []);   // HERESY 1494
    pick.innerHTML = models.length ? models.map(function (m) {
      var tip = mergeTip(m);   // HERESY 1494
      return '<option value="' + escape(m) + '" translate="no"' + (tip ? ' title="' + escape(tip) + '"' : "") + ">" + escape(modelLabel(m)) + (modelSize(m) ? " · " + modelSize(m) : "") + "</option>";   // HERESY 1017; 1166 a file's name; 1490 «YuE2 …»
    }).join("") : '<option value="">Model: as started</option>';
    pick.value = (settings && settings.model) || "";
    pick.disabled = models.length < 2;
  }

  $("modelPick").addEventListener("change", function () {
    var name = this.value;
    post("/settings", { model: name }).then(function (data) {
      paintSettings(data, true);
      toast("Model " + modelLabel(name) + (data.applied ? " — it loads with the next song" : " — it applies before the next song"), "good");   // 1490
    }).catch(function (error) {
      toast(error.message, "bad");
      paintModelPick(STATE.settings);
    });
  });
  // HERESY 1494: both selectors say the chosen merge's adapters in their tips (Compute's has no words of its own: a merge's alone)
  $("modelPick").tipMore = function () { return mergeTip(this.value); };
  $("setModel").tipMore = function () { return mergeTip(this.value); };
  // HERESY 1709 (Viktor 22.10.2026: «подсказку сделай уже, во-первых, 600px, и влево, чтобы не перекрывала список. И перепроверь все подсказки по
  // моделям, все отформатируй красиво»): the browser's own list shows an option's tip as the system draws it; both model selectors open the studio's
  // list instead, each name with one tip in one shape: its name and size, what the copy is, and for a merge what it carries, line by line
  var QUANT_SAYS = { BF16: "the full weights, as released", Q8_0: "quantized: near lossless", Q6_K_L: "quantized: smaller, less VRAM", Q6_K: "quantized: smaller, less VRAM",
                     Q5_K_L: "quantized: smaller still", Q5_K_M: "quantized: smaller still" };
  function modelTip(m) {
    if (!m) return "";
    var q = String(m).split("-").pop(), merged = mergeParts(m).length > 0, says = QUANT_SAYS[q] || "";
    if (merged) says = q === "BF16" ? "the whole merge, unquantized" : says.replace("quantized:", "quantized from the merged BF16:");
    return [modelLabel(m) + (modelSize(m) ? " \u00b7 " + modelSize(m) : ""), says ? tr(says) : "", mergeTip(m)].filter(Boolean).join("\n");
  }
  function modelChooser(sel) {
    var open = function () {
      if (sel.disabled) return;
      var cur = sel.value, items = Array.prototype.filter.call(sel.options, function (o) { return o.value && !o.disabled; }).map(function (o, i) {
        return { value: "m" + i, raw: o.value, label: modelLabel(o.value) + (modelSize(o.value) ? " \u00b7 " + modelSize(o.value) : ""), current: o.value === cur, tip: modelTip(o.value) };
      });
      if (!items.length) return;
      window.HeresyDialog.choose("Model\n\nThe copy of the model the engine loads, from the next song. Rest the pointer on a name: what it is, and what a merge carries.",
        items, { cancel: "Cancel", filter: "Filter", tipSide: "left", tipWidth: "600px" }).then(function (v) {
        var it = items.filter(function (x) { return x.value === v; })[0];
        if (!it || it.raw === sel.value) return;
        sel.value = it.raw;
        sel.dispatchEvent(new Event("change", { bubbles: true }));
      });
    };
    sel.addEventListener("mousedown", function (e) { if (e.button !== 0) return; e.preventDefault(); sel.focus({ preventScroll: true }); open(); });
    sel.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " " || e.key === "F4" || (e.altKey && /^Arrow(Down|Up)$/.test(e.key))) { e.preventDefault(); open(); }
    });
  }
  modelChooser($("modelPick")); modelChooser($("setModel"));
  window.ruachModelTip = modelTip;   // for the checks
  if (!$("setModel").hasAttribute("data-tip")) $("setModel").setAttribute("data-tip", "");
  function fillSetModel(settings, keep) {   // HERESY 1494: Compute's list, again when the merges' word comes (the choice kept)
    var models = modelOrder(settings.models || []), was = $("setModel").value;   // 1490c
    $("setModel").innerHTML = models.length ? models.map(function (m) {
      var tip = mergeTip(m);
      return '<option value="' + escape(m) + '" translate="no"' + (tip ? ' title="' + escape(tip) + '"' : "") + ">" + escape(modelLabel(m)) + tr(modelKind(m)) + "</option>";   // HERESY 1490
    }).join("") : '<option value="">as started</option>';
    $("setModel").value = keep ? was : settings.model || "";
  }

  function paintSettings(settings, force) {
    STATE.settings = settings;
    paintModelPick(settings);
    // A background refresh must not wipe fields you are still editing; Save repaints them.
    if (STATE.settingsDirty && !force) {
      paintStrip();
      paintSubmitNote();
      return;
    }
    STATE.settingsDirty = false;
    fillSetModel(settings);   // HERESY 1494
    [["setMaxSeq", settings.max_seq], ["setVaeCore", settings.vae_core]].forEach(function (pair) {
      $(pair[0]).setAttribute("value", pair[1]);   // the step base, as with the sampling knobs
      $(pair[0]).value = pair[1];
    });
    $("setKeepLoaded").checked = !!settings.keep_loaded;
    // HERESY 1167: the idle unload (an engine without it: the knobs stay off)
    var hasUnload = settings.unload_after_min !== undefined;
    $("setUnloadAfter").value = settings.unload_after_min || 60;
    $("setUnloadAtOnce").checked = !!settings.unload_at_once;
    $("setUnloadAfter").disabled = $("setUnloadAtOnce").disabled = !hasUnload;
    paintUnload();
    $("memPreset").value = shownPreset(settings);   // HERESY 1027
    paintComputeHint();
    paintStrip();
    paintSubmitNote();
  }

  // HERESY 1167 (Viktor: «Models auto unload. Дефолт 60 минут… от 15 минут до 4 часов… мгновенная выгрузка (15 секунд
  // grace)»): the time said beside its name; At once leaves the slider aside
  function paintUnload() {
    var m = Number($("setUnloadAfter").value) || 60, h = Math.floor(m / 60), r = m % 60, once = $("setUnloadAtOnce").checked;
    $("setUnloadSay").textContent = tr(once ? "15 s after a song" : "after " + (h ? h + " h" + (r ? " " + r + " min" : "") : r + " min") + " idle");
    $("setUnloadAfter").classList.toggle("is-aside", once);
  }

  function paintComputeHint() {
    var rows = parseInt($("setMaxSeq").value, 10), notes = [];
    if (rows === 0 || isNaN(rows)) notes.push("Context: the whole " + fullContext().toLocaleString(loc()) + " rows, room for any song.");
    else notes.push("Context " + rows.toLocaleString(loc()) + " rows: songs up to about " + clock(Math.max(0, rows - 2500) / FRAME_RATE) +
                    " with a typical prompt; longer ones will not fit.");
    notes.push($("setKeepLoaded").checked ? "Models stay in GPU memory between songs." : "Each stage leaves GPU memory when it is done.");
    // HERESY 1287 (Viktor 09.10.2026: «BF16 не скачалась… можно ли будет со студии докачать BF16?»): where the full backbone comes from
    if (STATE.settings && (STATE.settings.models || []).length && (STATE.settings.models || []).indexOf("BF16") < 0) {
      notes.push("BF16 (7.2 GB) is not on this machine: Pinokio's «More models» fetches it, or heresy/fetch-heresy.sh --backbone BF16; the studio offers it after its next start.");
    }
    $("computeHint").textContent = notes.map(tr).join(" ");   // HERESY 1166
  }

  function readSettingsForm() {
    var maxSeq = Number($("setMaxSeq").value), vaeCore = Number($("setVaeCore").value), full = fullContext();
    if (!Number.isInteger(maxSeq) || (maxSeq !== 0 && (maxSeq < 4096 || maxSeq > full))) {
      throw new Error("Context size must be 0 (the whole " + full.toLocaleString(loc()) + ") or between 4,096 and " + full.toLocaleString(loc()));
    }
    if (!Number.isInteger(vaeCore) || vaeCore < 64 || vaeCore > 4096) throw new Error("VAE tile frames must be between 64 and 4,096");
    var out = { keep_loaded: $("setKeepLoaded").checked, max_seq: maxSeq, vae_core: vaeCore };
    if (!$("setUnloadAfter").disabled) { out.unload_after_min = Number($("setUnloadAfter").value); out.unload_at_once = $("setUnloadAtOnce").checked; }   // HERESY 1167
    if ($("setModel").value) out.model = $("setModel").value;
    return out;
  }

  function refreshSettings() {
    return api("/settings").then(function (settings) {
      $("computeCard").classList.remove("is-off");
      paintSettings(settings);
    }).catch(function (error) {
      if (error.status !== 404) return;
      // An older server without engine settings: the card says so and stays still.
      $("computeCard").classList.add("is-off");
      all("#computeCard select, #computeCard input, #computeCard button").forEach(function (el) { el.disabled = true; });
      $("computeHint").textContent = "This server has no engine settings; its start-up flags decide.";
    });
  }

  ["setMaxSeq", "setVaeCore", "setKeepLoaded", "setModel", "setUnloadAfter", "setUnloadAtOnce"].forEach(function (id) {
    $(id).addEventListener("input", function () {
      STATE.settingsDirty = true;
      // HERESY 1071: a knob moved by hand is Manual (the memory's knobs; keeping and unloading are no size)
      if (id !== "setKeepLoaded" && id.indexOf("setUnload") !== 0) $("memPreset").value = "manual";
      if (id.indexOf("setUnload") === 0) paintUnload();   // HERESY 1167
      paintComputeHint();
    });
    $(id).addEventListener("change", function () { STATE.settingsDirty = true; paintComputeHint(); });
  });

  $("memPreset").addEventListener("change", function () {
    STATE.settingsDirty = true;
    if (!/^auto/.test(this.value)) return paintComputeHint();      // Manual: the knobs stay as they are, yours
    var gib = budgetOf(this.value), a = autoKnobs(gib);            // HERESY 1287: the whole card, or within N GB
    if (!a) { this.value = "manual"; return toast(gib ? gib.toFixed(1) + " GB is too small for YuE2: set the knobs by hand" : "No GPU detected: set the knobs by hand", "bad"); }
    $("setMaxSeq").value = a.max_seq;
    $("setVaeCore").value = a.vae_core;
    paintComputeHint();
    toast("Auto for " + gib.toFixed(1) + " GB: " + (a.max_seq ? "context " + a.max_seq.toLocaleString(loc()) : "whole context") +
          ", VAE tiles " + a.vae_core + "; the backbone and keeping models loaded stay your choice. Press Save to apply.");
  });

  $("resetPageSettings").addEventListener("click", function () {   // HERESY 1027
    if (!window.HeresySettings) return;
    window.HeresyDialog.confirm("Reset every page setting to its default, in this browser and on disk?\n\nThe library, the songs and the engine settings stay as they are.", { ok: "Reset", danger: true })
      .then(function (ok) { if (ok) window.HeresySettings.reset(); });
  });

  $("saveSettings").addEventListener("click", function () {
    var next;
    try { next = readSettingsForm(); } catch (error) { return toast(error.message, "bad"); }
    var current = STATE.settings || {}, changed = {};
    SETTING_KEYS.forEach(function (key) { if (next[key] !== undefined && next[key] !== current[key]) changed[key] = next[key]; });
    store(PRESET_KEY, $("memPreset").value === "auto" ? "auto" : "manual");   // HERESY 1071; 1294: a card's limit is the budget now
    if (!Object.keys(changed).length) { paintSettings(STATE.settings || {}, true); return toast("Saved: the knobs were already so"); }
    var button = this;
    button.disabled = true;
    post("/settings", changed).then(function (data) {
      paintSettings(data, true);
      var loads = changed.model ? "the " + changed.model + " backbone" : "";
      var note = loads ? " — the next song loads " + loads : "";
      toast(data.applied ? "Saved and applied" + note : "Saved — the server is busy; it applies before the next song", "good");
      pollProps();
      return refreshHardware();
    }).catch(function (error) { toast(error.message, "bad"); })
      .then(function () { button.disabled = false; });
  });

  // HERESY 1304 (Viktor 10.10.2026: «Давай допишем при самом старте новой Студии сканирование устройств и выбор оптимальных
  // настроек для YuE2 BF16/кванта и для модели генерации обложек»): the machine as the lab reads it (/machine), and what suits
  // it: the backbone (BF16 only where the card does BF16 in tensor cores and Auto gives it; else Q8_0, or the nearest one that is
  // here), Auto's context and VAE tiles for the studio card's memory or limit, the painter that fits; one window, once per install
  var MACHINE_KEY = "yue2.machineScan", BACKBONES = ["BF16", "Q8_0", "Q6_K", "Q5_K_M"];
  var PAINTERS = {   // HERESY 1405: SDXL gone; 1428: Krea 2 gone
    // HERESY 1425 (Viktor 13.10.2026: «На RTX3090 я бы однозначно советовал QWEN Image 2512»): by the cards, as Engine → Artwork's first line
    "qwen2512-q6": "Qwen-Image 2512 Q6 by the cards (about 20 GB at its peak, the text encoder gone from the card by then)",
    "qwen2512-q4": "Qwen-Image 2512 Q4 by the cards (about 15 GB at its peak, the text encoder gone from the card by then)" };
  function machinePlan(m) {
    var have = (STATE.settings && STATE.settings.models) || [], list = m.cards || [];
    var card = list.filter(function (c) { return c.index === m.studio; })[0] || list[0];
    if (!card) return null;
    var gib = Math.min(card.total_mb, card.limit_mb || Infinity) / 1024, knobs = autoKnobs(gib), why = [];
    var want = knobs ? knobs.model : "Q5_K_M";
    if (want === "BF16" && card.bf16_cores === false) { want = "Q8_0"; why.push(tr("compute {0} has no BF16 tensor cores: BF16 runs slower than Q8_0 here").replace("{0}", card.compute)); }   // HERESY 1339
    var model = have.indexOf(want) >= 0 ? want : BACKBONES.slice(BACKBONES.indexOf(want)).filter(function (q) { return have.indexOf(q) >= 0; })[0] || "";
    if (model !== want) why.push(tr("{0} is not on this machine: Engine → Models and LoRAs fetches it").replace("{0}", want));
    return { card: card, gib: gib, knobs: knobs, model: model, want: want, why: why, painter: (m.painter || {}).suggest || "", ready: (m.painter || {}).ready || {} };
  }
  function machineScan(asked) {
    return fetch("/lab/machine").then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); }).then(function (m) {
      var plan = machinePlan(m);
      if (!plan) { if (asked) toast(m.error ? "The cards could not be read: " + m.error : "No GPU found: the studio needs an NVIDIA card", "bad"); return null; }
      var cards = (m.cards || []).map(function (c) {
        return "GPU" + c.index + " · " + c.name + " · " + tr((c.total_mb / 1024).toFixed(1) + " GB") + (c.compute ? " (" + tr("compute {0}").replace("{0}", c.compute) + ")" : "") +   // HERESY 1339
          (c.limit_mb ? ", " + tr("its limit {0} GB").replace("{0}", (c.limit_mb / 1024).toFixed(1)) : "") + (c.index === m.studio && (m.cards || []).length > 1 ? " · " + tr("the studio's") : "");
      });
      var k = plan.knobs, lines = [];
      lines.push("· " + tr("the backbone {0}").replace("{0}", plan.model || "—") + (plan.why.length ? ": " + plan.why.join("; ") : ""));   // HERESY 1339: a sentence a line
      lines.push(k ? "· " + (k.max_seq ? tr("context {0} rows").replace("{0}", k.max_seq.toLocaleString(loc())) : tr("the whole context")) + ", " + tr("VAE tiles {0}").replace("{0}", k.vae_core) +
                     " (" + tr("Auto for {0} GB").replace("{0}", plan.gib.toFixed(1)) + ")"
                   : "· " + tr("{0} GB is too small for YuE2: the knobs stay as they are").replace("{0}", plan.gib.toFixed(1)));
      lines.push("· " + (plan.painter ? tr("artwork: {0}").replace("{0}", tr(PAINTERS[plan.painter])) + (plan.ready[plan.painter] ? "" : ", " + tr("once fetched (Engine → Models and LoRAs)"))
                                    : tr("artwork: no painter fits on this machine yet (Qwen-Image 2512 Q4 wants a card of 6 GB, streamed from 32 GB of RAM)")));
      var text = tr("The machine, as the studio found it") + "\n\n" + cards.join("\n") + "\n\n" + tr("What suits it:") + "\n" + lines.join("\n") +
        "\n\n" + tr("Engine → Compute and Engine → Artwork keep them yours to change; «Scan the machine» there asks again.");
      return window.HeresyDialog.confirm(text, { ok: "Set them", cancel: "Not now" }).then(function (yes) {
        store(MACHINE_KEY, JSON.stringify({ at: Math.round(Date.now() / 1000), card: plan.card.name, gib: +plan.gib.toFixed(1), model: plan.model, painter: plan.painter, set: !!yes }));
        if (!yes) return plan;
        var cur = STATE.settings || {}, change = {};
        if (plan.model && plan.model !== cur.model) change.model = plan.model;
        if (k && k.max_seq !== cur.max_seq) change.max_seq = k.max_seq;
        if (k && k.vae_core !== cur.vae_core) change.vae_core = k.vae_core;
        if (k) store(PRESET_KEY, "auto");
        var pick = /^qwen2512/.test(plan.painter) ? "" : plan.painter;   // HERESY 1425: Qwen's as «By the cards», the lab picks Q6 or Q4
        if (plan.painter) { store("yue2.artPainter", pick || null); if ($("artPainter")) $("artPainter").value = pick; }
        var done = function () {
          var bits = [tr("the backbone {0}").replace("{0}", plan.model || tr("as it was"))];   // HERESY 1339: each piece a sentence of its own
          if (k) bits.push(k.max_seq ? tr("context {0}").replace("{0}", k.max_seq.toLocaleString(loc())) : tr("the whole context"), tr("VAE tiles {0}").replace("{0}", k.vae_core));
          toast(tr("Set for this machine: {0}").replace("{0}", bits.join(", ")) +
                (plan.painter ? "; " + tr("artwork {0}").replace("{0}", PAINTERS[plan.painter].replace(/ \(.*$/, "")) : ""), "good");
          return plan;
        };
        if (!Object.keys(change).length) { if ($("memPreset") && k) $("memPreset").value = "auto"; return done(); }
        return post("/settings", change).then(function (data) { paintSettings(data, true); if ($("memPreset") && k) $("memPreset").value = "auto"; return done(); });
      });
    }).catch(function (e) { if (asked) toast("The machine could not be read: " + e.message, "bad"); return null; });
  }
  window.ruachMachineScan = machineScan;               // for the checks: a test browser is never asked by itself
  // HERESY 1429 (Viktor 14.10.2026: «IP Студии и Лаба мы же раньше уже ограничивали локалхостом и масками локальных сетей… юзеры без
  // файрвола... или на публичном вайфае - это проблема. Может в Engine настройки блок по безопасности IP сетки добавить? И напоминалку
  // попапом для свежих инсталляций. С минигайдом там же, и чекбокс "Моё решение осознанное"»): who may open the studio, the engine's
  // own gate (GET/POST /access, user/access.json): this computer only, private networks (1114's, the default) or the networks listed.
  // Engine → Security changes it; a studio whose user never decided asks at its start, before the machine's scan
  var ACCESS = { a: null };
  var ACCESS_MODES = [
    ["local", "This computer only", "the safest: no other machine can open it, not even your phone"],
    ["private", "This computer and private networks", "your home or office network, a VPN or Tailscale; a café's, a hotel's or a train's Wi-Fi is a private network too"],
    ["list", "This computer and the networks I list", "only the networks you trust, written as 10.0.0.0/24, a comma between them"]];
  function accessYou(a) {
    if (!a || !a.you) return "";
    return (a.you_local ? tr("You open it from {0}: this computer") : a.you_private ? tr("You open it from {0}: a private network") : tr("You open it from {0}"))
      .replace("{0}", a.you);
  }
  function accessMine(a) {                              // the caller's own network, as a /24 (IPv4) to offer in the list
    var m = a && !a.you_local && /^(\d+)\.(\d+)\.(\d+)\.\d+$/.exec(a.you || "");
    return m ? m[1] + "." + m[2] + "." + m[3] + ".0/24" : "";
  }
  function accessFormHtml(a, name) {
    var mine = accessMine(a);
    return '<div class="acc-modes" role="radiogroup" aria-label="' + escape(tr("Who may open the studio")) + '">' +
      ACCESS_MODES.map(function (m) {
        return '<label class="acc-mode"><input type="radio" name="' + name + '" value="' + m[0] + '"' + (a && a.mode === m[0] ? " checked" : "") + " />" +
          '<span><b>' + escape(tr(m[1])) + "</b><small>" + escape(tr(m[2])) + "</small></span></label>";
      }).join("") + "</div>" +
      '<div class="acc-nets"><input type="text" class="acc-nets-in" spellcheck="false" autocomplete="off" placeholder="10.0.0.0/24, 172.16.0.0/24" value="' +
      escape(((a && a.nets) || []).join(", ")) + '" aria-label="' + escape(tr("The networks I list")) + '" />' +
      (mine ? '<button type="button" class="btn ghost small acc-mine" data-net="' + mine + '" data-tip="' + escape(tr("Add the network you open it from now: {0}").replace("{0}", mine)) + '">+ ' + escape(mine) + "</button>" : "") + "</div>";
  }
  function accessRead(box, name) {
    var r = box.querySelector('input[name="' + name + '"]:checked'), nets = box.querySelector(".acc-nets-in");
    return { mode: r ? r.value : "", nets: nets ? nets.value.split(/[\s,;]+/).filter(Boolean) : [] };
  }
  function accessWire(box, name, changed) {               // the box's listeners once (the card is painted again and again)
    box._accChanged = changed;
    var paint = function () {
      var v = accessRead(box, name), nets = box.querySelector(".acc-nets");
      if (nets) nets.classList.toggle("is-off", v.mode !== "list");
      if (box._accChanged) box._accChanged(v);
    };
    if (box._accWired) { paint(); return; }
    box._accWired = true;
    box.addEventListener("change", paint);
    box.addEventListener("input", paint);
    box.addEventListener("click", function (e) {
      var b = e.target.closest(".acc-mine");
      if (!b) return;
      var inp = box.querySelector(".acc-nets-in"), list = inp.value.split(/[\s,;]+/).filter(Boolean);
      if (list.indexOf(b.dataset.net) < 0) list.push(b.dataset.net);
      inp.value = list.join(", ");
      var r = box.querySelector('input[name="' + name + '"][value="list"]');
      if (r) r.checked = true;
      paint();
    });
    paint();
  }
  function accessSay(a) {
    return a.mode === "local" ? tr("the studio answers this computer only")
      : a.mode === "list" ? tr("the studio answers this computer and {0} listed networks").replace("{0}", String((a.nets || []).length))
      : tr("the studio answers this computer and private networks");
  }
  // the decision sent; one that closes the studio to whoever asks is asked again first
  function accessSend(v, extra) {
    var body = Object.assign({ mode: v.mode, nets: v.nets }, extra || {});
    return fetch("/access", { method: "POST", headers: { "Content-Type": "application/json" }, body: toJSON(body) }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (b) {
        if (r.ok) return b;
        if (r.status === 409 && b.lockout) {
          return window.HeresyDialog.confirm(tr("This closes the studio to you") + "\n\n" +
            tr("You open it from {0}, which the new choice leaves out: the page stops answering here, and only the studio's own computer can open it again (Engine → Security there, or delete user/access.json). Close it anyway?").replace("{0}", ACCESS.a && ACCESS.a.you || "?"),
            { ok: tr("Close it to me"), cancel: tr("Not now"), danger: true }).then(function (yes) {
            return yes ? accessSend(v, Object.assign({}, extra || {}, { lockout: true })) : null;
          });
        }
        var e = new Error(b.error || ("HTTP " + r.status));
        e.status = r.status;
        throw e;
      });
    });
  }
  function paintAccess(a) {
    var card = $("accessCard");
    if (!card) return;
    ACCESS.a = a;
    var why = $("accWhy");
    if (!a) {
      $("accYou").textContent = tr("The engine does not answer about its access: build it again (./build.sh --server).");
      $("accForm").innerHTML = ""; $("accSave").disabled = true; why.hidden = true;
      return;
    }
    $("accYou").textContent = accessYou(a) + (a.acknowledged ? " · " + tr("decided {0}").replace("{0}", String(a.acknowledged).replace("T", " ").slice(0, 16)) : "");
    $("accForm").innerHTML = accessFormHtml(a, "accMode");
    var notes = [];
    if (a.public) notes.push(tr("RUACH_ALLOW_PUBLIC=1 is set: the studio answers anyone, whatever is chosen here."));
    if (!a.kept) notes.push(tr("This engine keeps no settings file, so it answers this computer and private networks; start it with ./start.sh to choose."));
    why.hidden = !notes.length;
    why.textContent = notes.join(" ");
    accessWire($("accForm"), "accMode", function (v) {
      $("accSave").disabled = !a.kept || !v.mode || (v.mode === "list" && !v.nets.length) ||
        (v.mode === a.mode && v.nets.join(",") === (a.nets || []).join(","));
    });
  }
  function refreshAccess() {
    return api("/access").then(function (a) { paintAccess(a); return a; }).catch(function () { paintAccess(null); return null; });
  }
  if ($("accSave")) $("accSave").addEventListener("click", function () {
    var v = accessRead($("accForm"), "accMode"), b = this;
    b.disabled = true;
    accessSend(v, ACCESS.a && !ACCESS.a.acknowledged ? { acknowledged: true } : null).then(function (a) {
      if (!a) { paintAccess(ACCESS.a); return; }
      paintAccess(a);
      toast(tr("Kept: {0}").replace("{0}", accessSay(a)), "good");
    }).catch(function (e) { toast(tr("Not kept: {0}").replace("{0}", e.message), "bad"); paintAccess(ACCESS.a); });
  });
  // the first start's question: a mini guide, the three choices, «My decision is a conscious one»; Later asks again at the next start
  function accessAsk(a) {
    return new Promise(function (done) {
      var back = document.createElement("div"), before = document.activeElement, port = location.port || (location.protocol === "https:" ? "443" : "80");
      back.className = "hd-back acc-back";
      back.innerHTML = '<div class="hd-box acc-box" role="dialog" aria-modal="true" aria-label="' + escape(tr("Who may open this studio?")) + '">' +
        '<div class="hd-title">' + escape(tr("Who may open this studio?")) + "</div>" +
        '<div class="acc-guide">' + [
          tr("The studio listens on port {0} of every network this computer is on. Whoever opens its page can do everything you can: make and delete songs, read your lyrics, run your graphics cards, fetch models with your keys.").replace("{0}", port),
          tr("At home behind your router, private networks are what you want: your laptop and phone reach the studio, the internet does not."),
          tr("On a public Wi-Fi (a café, a hotel, a train) or on a laptop without a firewall, everyone on that network counts as a private network too: choose This computer only, or list your own networks."),
          tr("Engine → Security changes it any time. The internet at large is never let in, unless the studio is started with RUACH_ALLOW_PUBLIC=1.")
        ].map(function (t) { return "<p>" + escape(t) + "</p>"; }).join("") + "</div>" +
        '<p class="acc-you">' + escape(accessYou(a)) + "</p>" +
        '<div class="acc-form">' + accessFormHtml(a, "accAsk") + "</div>" +
        '<label class="check acc-sure"><input type="checkbox" class="acc-sure-in" /> <span>' + escape(tr("My decision is a conscious one")) + "</span></label>" +
        '<div class="hd-acts"><button type="button" class="btn ghost small hd-no">' + escape(tr("Later")) + '</button>' +
        '<button type="button" class="btn small primary hd-yes" disabled>' + escape(tr("Keep it")) + "</button></div></div>";
      document.body.appendChild(back);
      var form = back.querySelector(".acc-form"), sure = back.querySelector(".acc-sure-in"), yes = back.querySelector(".hd-yes");
      var gate = function () { var v = accessRead(form, "accAsk"); yes.disabled = !sure.checked || !v.mode || (v.mode === "list" && !v.nets.length); };
      accessWire(form, "accAsk", gate);
      sure.addEventListener("change", gate);
      var close = function (v) {
        document.removeEventListener("keydown", key, true);
        back.classList.add("is-leaving");
        setTimeout(function () { back.remove(); }, 120);
        if (before && before.focus) { try { before.focus({ preventScroll: true }); } catch (e) { /* gone */ } }
        done(v);
      };
      var key = function (e) { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(null); } };
      document.addEventListener("keydown", key, true);
      back.querySelector(".hd-no").addEventListener("click", function () { close(null); });
      yes.addEventListener("click", function () {
        var v = accessRead(form, "accAsk");
        yes.disabled = true;
        accessSend(v, { acknowledged: true }).then(function (got) {
          if (!got) { gate(); return; }
          paintAccess(got);
          toast(tr("Kept: {0}").replace("{0}", accessSay(got)), "good");
          close(got);
        }).catch(function (e) { toast(tr("Not kept: {0}").replace("{0}", e.message), "bad"); gate(); });
      });
      requestAnimationFrame(function () { back.classList.add("is-on"); var c = back.querySelector("input:checked") || back.querySelector('input[type="radio"]'); if (c) c.focus(); });
    });
  }
  function accessFirst() {                              // asked once a start while the user has not decided
    return refreshAccess().then(function (a) { return a && a.kept && !a.acknowledged && !a.public ? accessAsk(a) : null; });
  }
  window.ruachAccessAsk = accessAsk;                    // for the checks: a test browser is never asked by itself
  window.ruachAccess = { refresh: refreshAccess, paint: paintAccess, send: accessSend };

  if ($("scanMachine")) $("scanMachine").addEventListener("click", function () { machineScan(true); });
  function refreshHardware() {
    return api("/hardware").then(function (hw) {
      STATE.hardware = hw || {};
      paintPresetSizes();   // HERESY 1027
      if (STATE.settings && !STATE.settingsDirty) $("memPreset").value = shownPreset(STATE.settings);   // 1071b: Auto needs the GPU's size
      STATE.noHardware = false;
      paintHardware();
    }).catch(function (error) {
      if (error.status === 404) { STATE.noHardware = true; STATE.hardware = null; paintHardware(); }
    });
  }

  function gpuOf() { return STATE.hardware && (STATE.hardware.gpus || [])[0] || null; }
  function gib(bytes) { return (bytes / GIB).toFixed(1); }

  function paintHardware() {
    var hw = STATE.hardware || {}, gpu = gpuOf(), loaded = hw.loaded_modules || 0;
    var rows = [
      ["GPU", gpu ? (gpu.description || gpu.name) : (STATE.noHardware ? "not reported" : "none: runs on the CPU"), gpu ? "ok" : "no"],
      ["VRAM", gpu ? gib(gpu.total_bytes - gpu.free_bytes) + " / " + gib(gpu.total_bytes) + " GB" : "—", ""],
      ["Loaded", loaded ? gib(hw.loaded_bytes || 0) + " GB · " + loaded + (loaded === 1 ? " module" : " modules") : "nothing", loaded ? "amber" : ""],
      ["Busy", hw.busy ? "running a job" : "idle", hw.busy ? "amber" : ""]
    ];
    // HERESY 1370: the Artist's painters kept between runs (the lab's activity says which): the Bar's Unload lets them go too
    var held = keptPainters(), heldOn = held.map(function (p) { return p.gpu; }).join(", ");
    if (held.length) rows.push(["Artist", "a painter kept between runs · GPU " + heldOn, "amber"]);
    $("hwCard").innerHTML = rows.map(function (row) {
      if (row[0] === "Artist") return '<div><dt translate="no">' + escape(artistRoom()) + '</dt><dd class="' + row[2] + '" title="' + escape(row[1]) + '">' + escape(row[1]) + "</dd></div>";   // HERESY 1381: the room, not the performer
      return "<div><dt>" + row[0] + '</dt><dd class="' + row[2] + '"' + (row[0] === "GPU" && gpu ? ' translate="no"' : "") + ' title="' + escape(row[1]) + '">' + escape(row[1]) + "</dd></div>";   // HERESY 1339: the card's name
    }).join("");
    $("hwNote").textContent = STATE.noHardware ? "This server does not report its hardware."
      : (loaded && !hw.busy ? "Unload model frees it now; the next song loads it again." : "");
    // Unload only makes sense with a model loaded and nothing running on it.
    var canUnload = (!STATE.noHardware && loaded > 0 && !hw.busy) || held.some(function (p) { return !p.busy; });   // HERESY 1370: or a painter idle
    $("unloadModel").disabled = !canUnload;
    $("unloadNow").disabled = !canUnload;
    $("unloadModel").classList.toggle("is-loaded", loaded > 0 || held.length > 0);   // HERESY 1113: a loaded model, seen in the bar
    $("unloadModel").dataset.tip = held.length
      ? (loaded > 0 ? "Unload model: " + gib(hw.loaded_bytes || 0) + " GB in the card\u2019s memory now" + (hw.busy ? " (busy: it waits)" : "") + ", and the Artist\u2019s painter kept between runs on GPU " + heldOn
                    : "Unload: the Artist\u2019s painter kept between runs on GPU " + heldOn + ": let it go now")
      : loaded > 0 ? "Unload model: " + gib(hw.loaded_bytes || 0) + " GB in the card\u2019s memory now" + (hw.busy ? " (busy: it waits)" : "; drop it now")
      : "Unload model: nothing is loaded";
    paintStrip();
    paintEngine();
    paintSubmitNote();
  }

  // The top bar's readout: two small lines, the GPU and its memory, small enough to stay on a small screen.
  // The rest (the full GPU name, backbone, context, batch) is in its tip and on the Engine page.
  function shortGpu(name) {
    return String(name || "").replace(/^nvidia\s+/i, "").replace(/^geforce\s+/i, "").replace(/\s*\([^)]*\)\s*$/, "") || String(name || "");
  }
  function paintStrip() {
    var p = STATE.props || {}, s = STATE.settings, gpu = gpuOf(), rows = [];
    if (gpu) {
      rows.push(["GPU", shortGpu(gpu.description || gpu.name)]);
      rows.push(["VRAM", gib(gpu.total_bytes - gpu.free_bytes) + " / " + gib(gpu.total_bytes) + " GB"]);
    } else if (STATE.hardware) {
      rows.push(["GPU", "none (CPU)"]);
    }
    var backbone = s && s.model ? s.model : (basename(p.model).replace(/\.gguf$/i, "") || "—");
    var context = s ? (s.max_seq ? s.max_seq.toLocaleString(loc()) : "whole") : (p.context ? p.context.toLocaleString(loc()) : "—");
    $("hwStats").dataset.tip = (gpu ? (gpu.description || gpu.name) + " · " : "") + "backbone " + backbone + " · context " + context +
      " · batch " + STATE.maxBatch;
    $("hwStats").innerHTML = rows.map(function (row) {
      return "<div><dt>" + row[0] + "</dt><dd>" + escape(row[1]) + "</dd></div>";
    }).join("");
  }

  // HERESY 1370: the Artist's painters kept between runs, as the lab's activity last said them
  function keptPainters() { return (typeof ACT !== "undefined" && ACT && ACT.painters) || []; }
  function unloadModels() {
    var gpu = gpuOf(), before = gpu ? gib(gpu.total_bytes - gpu.free_bytes) : null, hw = STATE.hardware || {};
    var engine = !STATE.noHardware && (hw.loaded_modules || 0) > 0;
    $("unloadModel").disabled = true;
    $("unloadNow").disabled = true;
    // HERESY 1370 (Viktor 11.10.2026: «на кнопку ВЫГРУЗИТЬ в Баре тоже подключи выгруз не только YuE2 моделей, но абсолютно всего»): the
    // Artist's kept painters with the engine's models
    // HERESY 1426 (Viktor 14.10.2026: «На кнопке выгрузки моделей нет сторожа… перепроверь»): with a body: the lab takes no POST without
    // one («send the file as the body»), and since 1370 this one came back 400 and let go of nothing (a painter at work is never let go)
    var art = keptPainters().length ? post("/lab/artist/unload", {}).catch(function () { return null; }) : Promise.resolve(null);
    var eng = engine ? post("/unload") : Promise.resolve(null);
    var painted = function (a) {
      var gone = a && a.released || [], busy = a && a.busy || [];
      if (gone.length) toast((gone.length === 1 ? "The Artist\u2019s painter let go (GPU " : "The Artist\u2019s painters let go (GPU ") + gone.map(function (p) { return p.gpu; }).join(", ") + ")", "good");
      if (busy.length) toast("The Artist paints on GPU " + busy.map(function (p) { return p.gpu; }).join(", ") + ": Unload again when its run ends");
      if (a) pollActivity();
    };
    Promise.all([eng, art]).then(function (r) {
      var data = r[0];
      painted(r[1]);
      if (!engine) return refreshHardware();
      if (!data || !data.applied) {
        toast("The server is busy; it unloads when the running song is done");
        return refreshHardware();
      }
      return refreshHardware().then(function () {
        var now = gpuOf(), after = now ? gib(now.total_bytes - now.free_bytes) : null;
        toast("Model unloaded — " + Math.round(data.freed_mb || 0).toLocaleString(loc()) + " MB freed" +
              (before !== null && after !== null ? " (VRAM " + before + " GB -> " + after + " GB)" : ""), "good");
      });
    }).catch(function (error) { toast(error.message, "bad"); refreshHardware(); });
  }

  $("unloadModel").addEventListener("click", unloadModels);
  $("unloadNow").addEventListener("click", unloadModels);

  /* ---------------------------------------------------------------- take */

  function findTake(name) {
    return STATE.takes.filter(function (t) { return t.name === name; })[0] || null;
  }

  // The name a take is shown under: its title, or the folder's slug.
  function displayTitle(take) {
    if (!take) return "";
    if (take.title) return take.title;
    var bare = String(take.name || "").replace(/^\d{8}-\d{6}-/, "").replace(/^session-/, "").replace(/-/g, " ");
    return bare ? bare.charAt(0).toUpperCase() + bare.slice(1) : "Untitled";
  }

  // HERESY 1053: the player hears the take's listen.flac (lossless, ~70 % of the bytes; the engine writes
  // it at save, or at the first listen); downloads keep the WAV. A server without the route: the WAV.
  function takeAudioUrl(take) {
    if (take.session) return take.url;
    if (!STATE.listenOff) return "/library/listen?name=" + encodeURIComponent(take.name);
    return "/library/audio?name=" + encodeURIComponent(take.name);
  }
  function wavUrl(take) { return take.session ? take.url : "/library/audio?name=" + encodeURIComponent(take.name); }

  function formatExt(format) { return format === "mp3" ? "mp3" : "wav"; }

  // Downloads are named after the song ("Last Train Home.wav"), as the server names them: the title without
  // the characters Windows refuses in a file name. The Takes menu can put the date back (the library name,
  // "20260927-183418-last-train-home"); the server is told too, since its name beats the page's.
  function libraryNames() { return recall("yue2.dlNames") === "library"; }
  function fileTitle(take) {
    if (libraryNames()) return take.name;
    return displayTitle(take).replace(/[\u0000-\u001f\u007f\\/:*?"<>|\s]+/g, " ").replace(/[\s.]+$/, "").trim() || take.name;
  }
  function namesParam() { return libraryNames() ? "&names=library" : ""; }
  function audioFileName(take) { return fileTitle(take) + "." + formatExt(take.format); }
  function downloadUrl(take) { return take.session ? take.url : c2paUrl(wavUrl(take) + namesParam(), formatExt(take.format), take); }   // HERESY 1489

  // HERESY 1489 (Viktor 16.10.2026: «Подпись C2PA поддерживаю»; «для паблика нужен выключатель, и в настройках Engine нужные поля…»):
  // with Content Credentials on, a download of a take or of a file of its tree goes through the lab, which signs it on the way
  var C2PA = { on: false, available: false, signing: false };
  function c2paUrl(url, fmt, take, path) {
    // HERESY 1648: through the lab whenever it answered, for the tags (1635) even unsigned; no lab, the engine's own link
    if (!C2PA.lab || !take || take.session || !url || url.indexOf("/library/") !== 0 || ["wav", "flac", "mp3"].indexOf(fmt) < 0) return url;
    return "/lab/c2pa/file?name=" + encodeURIComponent(take.name) + "&format=" + fmt + (path ? "&path=" + encodeURIComponent(path) : "") +
      "&from=" + encodeURIComponent(url) + (C2PA.signing ? "" : "&sign=0");
  }
  function paintC2paCard() {
    if (!$("c2paCard")) return;
    var s = C2PA;
    $("c2paOn").checked = !!s.on;
    $("c2paAuthor").value = s.author || ""; $("c2paContact").value = s.contact || ""; $("c2paCert").value = s.cert || ""; $("c2paKey").value = s.key || "";
    var say = !s.available ? "Not available: " + (s.error || "the lab did not answer") + "."
      : !s.on ? "Downloads go out unsigned."
      : s.signer === "yours" ? "Downloads are signed by your certificate: " + s.subject + ", issued by " + s.issuer + ", valid until " + s.until + "."
      : "Downloads are signed by the studio's own certificate (readers say the signer is not verified), valid until " + s.until + ".";
    $("c2paSay").textContent = tr(say);
    $("c2paSay").classList.toggle("is-bad", !s.available);
  }
  function takeC2pa(s) {
    C2PA = s && typeof s === "object" ? s : { on: false, available: false, error: "the lab did not answer" };
    C2PA.signing = !!(C2PA.on && C2PA.available);
    C2PA.lab = !!(s && typeof s === "object");          // HERESY 1648: the lab answered: it tags every download
    paintC2paCard();
    if (STATE.take) paintTakeDownloads();
    paintLibrary();
    return C2PA;
  }
  function loadC2pa() {
    return fetch("/lab/c2pa").then(function (r) { return r.ok ? r.json() : null; }).then(takeC2pa, function () { return takeC2pa(null); });
  }
  window.HeresyC2pa = { url: c2paUrl, reload: loadC2pa, state: function () { return C2PA; } };

  // MP3 copies for sharing: made on the server at the bitrate chosen on the song page
  function mp3Rate() {
    var saved = 320;
    saved = parseInt(recall("yue2.mp3kbps") || "320", 10);
    return [128, 192, 256, 320].indexOf(saved) >= 0 ? saved : 320;
  }

  function mp3Url(take) {
    return c2paUrl("/library/mp3?name=" + encodeURIComponent(take.name) + "&kbps=" + mp3Rate() + namesParam(), "mp3", take);   // HERESY 1489
  }

  // Conversions need a saved WAV: a song still being made (session) has no library copy yet,
  // and a take made as MP3 is already the MP3 (its own download).
  function convertible(take) { return !!take && !take.session && take.format !== "mp3"; }

  function paintMp3Link(link, take, label) {
    link.classList.toggle("is-hidden", !convertible(take));
    if (!convertible(take)) return;
    link.href = mp3Url(take);
    link.setAttribute("download", fileTitle(take) + ".mp3");
    (link.querySelector(".tl-name") || link).textContent = label;   // HERESY 1459: its drawing stays
  }

  // the song page's download buttons: named after the song (or with the date), the server told the same
  function paintTakeDownloads() {
    var take = STATE.take;
    if (!take) return;
    $("dlTakeAudio").href = downloadUrl(take);
    ($("dlTakeAudio").querySelector(".tl-name") || $("dlTakeAudio")).textContent = formatExt(take.format).toUpperCase();   // HERESY 1459
    $("dlTakeAudio").setAttribute("download", audioFileName(take));
    paintMp3();
  }

  function paintMp3() {
    var take = STATE.take, flac = $("dlTakeFlac");
    $("mp3Rate").value = String(mp3Rate());
    $("mp3Rate").classList.toggle("is-hidden", !convertible(take));
    paintMp3Link($("dlTakeMp3"), take, "MP3");
    flac.classList.toggle("is-hidden", !convertible(take));
    if (convertible(take)) {
      flac.href = c2paUrl("/library/flac?name=" + encodeURIComponent(take.name) + namesParam(), "flac", take);   // HERESY 1489
      flac.setAttribute("download", fileTitle(take) + ".flac");
    }
  }

  $("mp3Rate").addEventListener("change", function () {
    store("yue2.mp3kbps", $("mp3Rate").value);
    paintMp3();
    paintLibrary();
    toast("MP3 downloads now at " + mp3Rate() + " kbps");
  });

  // True while a song is audibly playing; finished runs must not replace it.
  function isPlaying() { return !!audio.getAttribute("src") && !audio.paused && !audio.ended; }

  var requestsPending = {};
  function getRequest(take) {
    if (STATE.requests[take.name]) return Promise.resolve(STATE.requests[take.name]);
    if (take.session) return Promise.reject(new Error("This take's request is gone with the page reload"));
    if (requestsPending[take.name]) return requestsPending[take.name];   // one fetch for overlapping asks
    var name = take.name, pending = fetch("/library/request?name=" + encodeURIComponent(name)).then(function (r) {
      return r.text().then(function (text) {
        if (!r.ok) throw new Error("Could not read the take's request (" + r.status + ")");
        var req = parseJSON(text);
        STATE.requests[name] = req;
        return req;
      });
    });
    var done = function () { delete requestsPending[name]; };
    pending.then(done, done);
    requestsPending[name] = pending;
    return pending;
  }

  function openTake(name, opts) {
    var take = findTake(name);
    if (!take) return;
    opts = opts || {};
    // HERESY 1169 (Viktor 08.10.2026: «ПО умолчанию оба блока закрыты. Минимальное отображение всей карты трека»): another take
    // opens with its Style and its Lyrics folded, whatever the last one had open
    if (!STATE.take || STATE.take.name !== take.name) { cardFolds.prompt = true; cardFolds.lyrics = true; paintCardFolds(); }
    STATE.take = take;
    STATE.job = null;
    STATE.stageRows = null;
    $("chain").hidden = true;
    $("takeEmpty").classList.add("is-hidden");
    $("takeBody").classList.remove("is-hidden", "is-running");
    $("scoreAbc").classList.remove("paper-live");
    paintTakeHead();

    // Looking at a song never cuts off the one that is playing. The player follows
    // the page only while it is idle; a version chip (keep) is an explicit switch.
    var inPlayer = STATE.playerTake && STATE.playerTake.name === take.name;
    if (opts.keep) {
      var sameMusic = !!(STATE.playerTake && familyOf(take).some(function (t) { return t.name === STATE.playerTake.name; }));
      var wasPlaying = isPlaying();
      loadPlayer(take, sameMusic);
      if (!sameMusic && wasPlaying) audio.play().catch(function () {});
    } else if (inPlayer) {
      STATE.playerTake = take;
    } else if (!isPlaying()) {
      loadPlayer(take, false);
    }
    paintTakeDownloads();

    paintTakeMeta();
    if (window.HeresySpectrum) window.HeresySpectrum.setTake(spectrumTake(take));   // HERESY 1007
    if (window.HeresyGloss) window.HeresyGloss.setTake({ name: take.name, label: displayTitle(take) });   // HERESY 1011
    if (document.body.dataset.tab === "post") paintPost();   // HERESY 1014
    if (typeof paintNote === "function") setTimeout(paintNote, 0);   // HERESY 1044
    if (window.HeresyPost) window.HeresyPost.setTake({ name: take.name });   // HERESY 1029: before the tools report
    if (window.HeresyArtist) window.HeresyArtist.setTake({ name: take.name, label: displayTitle(take) });   // HERESY 1255: its cover
    if (window.HeresyInspect) window.HeresyInspect.setTake({ name: take.name, label: displayTitle(take) });   // HERESY 1025
    if (window.HeresyDerived) window.HeresyDerived.setTake({ name: take.name, label: displayTitle(take), seconds: take.seconds });
    if (window.HeresyMixer) window.HeresyMixer.setTake({ name: take.name, label: displayTitle(take), seconds: take.seconds });   // HERESY 1471   // HERESY 1021; 1060 its length for the estimates
    setTimeout(paintCardFolds, 0);   // HERESY 1009: the peeks read the texts filled below
    $("metaStyle").textContent = take.style;
    var parent = take.parent ? findTake(take.parent) : null;
    $("metaCover").textContent = take.parent ? "Re-rendered from \u201c" + (parent ? displayTitle(parent) : take.parent) + "\u201d" : "";
    // Section tags carry the structure, so they are marked rather than escaped flat.
    $("metaLyrics").innerHTML = (take.lyrics || "").split(/\r?\n/).map(function (line) {
      return line.trim().charAt(0) === "[" ? "<b>" + escape(line) + "</b>" : escape(line);
    }).join("\n");

    $("scorePanel").classList.toggle("is-hidden", !take.has_score && !!take.session);   // HERESY 1167: a Direct take's too
    $("dlScore").disabled = !take.has_score;
    $("scoreAbc").textContent = "";
    $("scoreStaff").textContent = "";
    STATE.abcRendered = "";
    paintFromSound(take);
    if (take.has_score) {
      getRequest(take).then(function (req) {
        if (STATE.take === take) renderScore(req.abc || "");
      }).catch(function () {});
    }

    paintDecodeSwitch();
    paintPlayHere();
    paintSoundSwitch();
    markActive();
    paintRunReturn();
    show("take");
  }

  function paintTakeHead() {
    var take = STATE.take;
    $("takeMore").classList.toggle("is-hidden", !take);   // HERESY 1488
    paintCardTools();
    if (!take) return;
    // how old, how long, how long it took (the seeds are in the details below)
    var eyebrow = [takeTime(take.created, take.name)];   // HERESY 1720
    if (take.seconds) eyebrow.push(clock(take.seconds) + " long");
    if (take.render_seconds) eyebrow.push("made in " + clock(take.render_seconds));
    $("takeEyebrow").textContent = eyebrow.map(tr).join(" · ");   // HERESY 1166
    // HERESY 1026: the take's ID, the folder name on disk; a click copies it
    $("takeEyebrow").insertAdjacentHTML("beforeend", ' · <button type="button" class="take-id mono" data-tip="The take\'s ID (its folder in outputs/). Click to copy."><span translate="no">' +
      escape(take.name) + "</span></button>");   // HERESY 1166: the name kept, the tip translated
    $("takeTitle").textContent = displayTitle(take);
    $("takeTitle").setAttribute("translate", "no");
    // Favourite, Rename and Delete as small icons on the title line (Delete asks first)
    // HERESY 1169 (Viktor 07.10.2026: «У Музыканта есть звезда фаворита, не хватает лайка/дизлайка до полного счастья»): the
    // take's own 👍 and 👎, the same mark as the player's and the cards' (HeresyCollection), in the player's order
    var HCh = window.HeresyCollection, rated = HCh && !take.session ? HCh.rating(take.name) : 0, IC = window.HeresyIcons;
    var shielded = !!(HCh && HCh.isProtected && !take.session && HCh.isProtected(take.name));   // HERESY 1368
    $("takeActions").innerHTML = (HCh && !take.session
      ? '<button type="button" class="btn ghost small icon-act" id="likeTake" data-rate="1" aria-pressed="' + (rated > 0) + '" aria-label="Like" data-tip="Like">' +
        (IC ? IC.ui("like") : "👍") + "</button>" +
        (HCh.markBtns ? HCh.markBtns(take.name, "btn ghost small icon-act") : "") +   // HERESY 1802: 🔥 💎 after 👍
        '<button type="button" class="btn ghost small icon-act" id="dislikeTake" data-rate="-1" aria-pressed="' + (rated < 0) + '" aria-label="Dislike" data-tip="Dislike">' +
        (IC ? IC.ui("dislike") : "👎") + "</button>" : "") +
      '<button type="button" class="btn ghost small icon-act' + (take.favorite ? " is-on" : "") + '" id="favTake" aria-pressed="' +
      (take.favorite ? "true" : "false") + '" aria-label="Favourite">' +
      (window.HeresyIcons ? window.HeresyIcons.ui("star") : take.favorite ? "★" : "☆") + "</button>" +   // HERESY 1169: drawn, as Compose's
      // HERESY 1368: the shield beside the star; lit, Delete waits for it to come off
      (HCh && HCh.protect && !take.session ? '<button type="button" class="btn ghost small icon-act" id="protTake" aria-pressed="' + shielded + '" aria-label="' + (shielded ? "Take its protection off" : "Protect it") +
        '" data-tip="' + HCh.protTip(shielded) + '">' + (IC ? IC.ui("shield") : "🛡") + "</button>" : "") +
      // HERESY 1167 (Viktor: «Жму на мигалку, открывает в Творце "медицинскую карту". А как обратно из неё перейти в
      // Библиотеку на этот же трек?»): the Librarian with this take in sight, flashed
      (window.HeresyCollection && window.HeresyCollection.reveal && !take.session
        ? '<button type="button" class="btn ghost small icon-act" id="libTake" aria-label="Show in the Librarian" data-tip="Show this take in the Librarian: its card found, in sight and flashed">' +
          '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
          '<path d="M4 4h3.2v16H4zM9.2 6.5h3.2V20H9.2zM14.4 7.4l3-.8 3.5 13-3 .8zM2.5 20.5h19"/></svg></button>' : "") +
      '<button type="button" class="btn ghost small icon-act" id="renameTake" aria-label="Rename" data-tip="Rename this take">' + (window.HeresyIcons ? window.HeresyIcons.ui("pencil") : "✎") + "</button>" +
      '<button type="button" class="btn ghost small icon-act danger' + (shielded ? " is-off" : "") + '" id="deleteTake" aria-label="Delete take" aria-disabled="' + shielded +
        '" data-tip="' + (shielded ? "This take is protected: take its protection off first" : "Delete this take (asks first)") + '">' +
      '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 12.5h9l1-12.5M10 11v5M14 11v5"/></svg></button>';
    paintPlayHere();
  }

  // Where a song's sampling sat on the three shape sliders: the position (0 lowest .. 4 highest, -1
  // custom), a note, and the same as plain text. Keys a saved request leaves out are the defaults.
  function shapeInfo(id, sampling) {
    var spec = SHAPES[id], pos = -1;
    var value = function (key) {
      return sampling && sampling[key] !== undefined ? round(Number(sampling[key]), 6) : round(samplingDefault(spec.group, key), 6);
    };
    spec.steps.forEach(function (v, i) { if (spec.keys.every(function (k, j) { return value(k) === v[j]; })) pos = i; });
    var values = "temperature " + value("temperature") + " · top-p " + value("top_p") + " · top-k " + value("top_k");
    return pos >= 0 ? { pos: pos, note: "", text: SHAPE_LABELS[pos] } : { pos: -1, note: values, text: "custom: " + values };
  }

  function styleInfo(take) {
    // HERESY 1031: "default" is whatever the engine had when the take was made (1.0 / 1.01 in the
    // release, 1.6 since); the saved request only says -1, so no number is claimed for it
    var auto = !(typeof take.cfg_scale === "number" && take.cfg_scale >= 0);
    var value = auto ? null : round(take.cfg_scale, 3);
    var pos = auto || value === defaultCfg(take.cot) ? 2 : SHAPES.shapeStyle.cfg.indexOf(value);
    // the guidance value only shows when it matches no position (a hover says it either way)
    var note = "guidance " + (auto ? "default (the engine's at the time)" : value);
    return { pos: pos, note: note, text: pos >= 0 ? SHAPE_LABELS[pos] : "custom " + value };
  }

  // The song's details: one compact card. Row one: Song | Sound | Shape side by side; row two: Sliders |
  // LoRAs; row three: the two seeds. Length and render time are on the line under the title. Every field
  // also carries its value as plain text (data-value), which the tests read.
  function paintTakeMeta() {
    var take = STATE.take;
    if (!take) return;
    var labels = sliderLabels();
    // Composition and Performance come from the saved request: fetched once, then painted again
    var req = STATE.requests[take.name], shapes = req ? true : (STATE.noRequest[take.name] ? false : null);
    if (shapes === null) {
      getRequest(take).then(function () { if (STATE.take === take) paintTakeMeta(); })
        .catch(function () { STATE.noRequest[take.name] = true; if (STATE.take === take) paintTakeMeta(); });
    }
    var field = function (label, html, text, key, cls, tip) {
      return '<div data-field="' + escape(key || label) + '" data-value="' + escape(text) + '"><dt>' + escape(label) + "</dt><dd" +
        (cls ? ' class="' + cls + '"' : "") + (tip ? ' title="' + escape(tip) + '"' : "") + ">" + html + "</dd></div>";
    };
    var plain = function (label, text, cls) { return field(label, escape(String(text)), String(text), "", cls); };
    var column = function (title, body, attrs) {
      return '<section class="meta-col"' + (attrs || "") + "><h4>" + title + "</h4>" + body + "</section>";
    };
    var scale = function (label, key, info) {
      var dots = "";
      for (var i = 0; i < 5; i++) dots += "<i" + (i === info.pos ? ' class="on"' : "") + "></i>";
      var shown = info.pos >= 0 ? SHAPE_LABELS[info.pos] : info.text.replace(/:.*$/, "");
      return field(label, '<span class="dots' + (info.pos < 0 ? " custom" : "") + '" aria-hidden="true">' + dots + "</span>" + escape(shown),
        info.text, key, "", info.note);
    };
    var addonList = function (key, text, items) {   // items: [name, amount html]
      var rows = items.length ? items.map(function (it) {
        return '<span class="name" translate="no">' + escape(it[0]) + '</span><span class="amt">' + it[1] + "</span>";
      }).join("") : '<span class="none">none</span>';
      return column(key, '<div class="meta-rows addons">' + rows + "</div>", ' data-field="' + key + '" data-value="' + escape(text) + '"');
    };
    var seed = function (label, key, value) {
      return '<div data-field="' + key + '" data-value="' + escape(value || "—") + '"><dt>' + label + '</dt><dd class="num">' + escape(value || "—") +
        '</dd><dd class="copy-cell">' + (value ? '<button type="button" class="seed-copy" data-copy="' + escape(value) + '" data-what="' +
        label.toLowerCase() + ' seed" aria-label="Copy the ' + label.toLowerCase() + ' seed" data-tip="Copy the ' + label.toLowerCase() + ' seed">⧉</button>' : "") +
        "</dd></div>";
    };

    var song = plain("Mode", MODES[take.cot] || take.cot || "—") + plain("Format", FORMAT_LABELS[take.format] || take.format || "—");
    if (take.truncated) song += plain("Limit", "hit token cap", "warn");
    // HERESY 1618: planned by the page first (a key, an instrumental): the flag, or before it the Chords, which only a plan is sent
    var plannedFirst = !!(req && (req.score_planned || (take.provided_score && req.harmony)));
    if (plannedFirst) song += plain("Score", "planned first");
    else if (take.provided_score) song += plain("Score", "supplied");
    // made while the F32 option existed (removed 2026-09-26): kept so those songs can still be compared
    if (take.precision === "f32") song += plain("Precision", "F32 (option since removed)");
    if (take.song > 0 || take.variation > 0) {
      song += plain("Batch", "song " + ((take.song || 0) + 1) + (take.variation > 0 ? ", sound " + (take.variation + 1) : ""));
    }
    if (take.session) song += plain("Kept", "this tab only");
    var sound = plain("VAE", vaeLabel(take.vae)) + plain("Model", take.model || "—") + plain("Steps", take.steps || "—", "num");
    var shape = (shapes ? scale("Composition", "", shapeInfo("shapeComposition", req.abc_sampling)) +
                          scale("Performance", "", shapeInfo("shapePerformance", req.semantic_sampling))
                        : plain("Composition", shapes === null ? "…" : "—") + plain("Performance", shapes === null ? "…" : "—")) +
                scale("Style", "Style influence", styleInfo(take));

    var sliders = take.sliders || [];
    var slidersText = sliders.length ? sliders.map(function (c) { return (labels[c.id] || c.id) + " " + round(c.strength, 2) + (curveClean(c.curve) ? " \u00b7 " + tr("curved") : ""); }).join(", ") : "none";   // HERESY 1166
    var sliderItems = sliders.map(function (c) {
      var strength = Math.max(0, Math.min(1, Number(c.strength) || 0));
      return [labels[c.id] || c.id, '<span class="bar"><b style="width:' + Math.round(strength * 100) + '%"></b></span>' + (Number(c.strength) || 0).toFixed(2)];
    });
    var loraItems = YueLoras.lines(take.loras).map(function (l) { return [l.name, escape(l.amounts)]; });
    var lorasText = (take.loras || []).length ? YueLoras.describe(take.loras) : "none";

    $("metaGrid").innerHTML =
      // HERESY 1412 (Viktor: «перенёс бы это в следующую полосу, в один ряд, заголовки над полосами с кружками»): Song | Sound, then Shape a band
      '<div class="meta-row pair">' + column("Song", '<dl class="meta-rows">' + song + "</dl>") +
        column("Sound", '<dl class="meta-rows">' + sound + "</dl>") + "</div>" +
      '<div class="meta-row shape-band">' + column("Shape", '<dl class="meta-rows shape-trio">' + shape + "</dl>") + "</div>" +
      '<div class="meta-row duo">' + addonList("LoRAs", lorasText, loraItems) + "</div>" +   // HERESY 1449: no sliders
      '<div class="meta-row seeds"><dl class="meta-rows seeds">' + seed("Music", "Music seed", seedText(take.lm_seed)) +
        seed("Sound", "Sound seed", seedText(take.seed)) + "</dl></div>" + medcard(take, req, field, column);
  }
  // HERESY 1399 (Viktor 12.10.2026: «У нас в медкарте трека не видны токены музыки и голоса, время на их генерацию. И остальное из
  // параметров генерации по планировщику партитуры и музыкальным токенам. Добавь это в карту ниже чисел сидов… нужна полная
  // амбулаторная карта трека»): how the take was made, stage by stage, as the Creator's form has it: the Score Planner's and the Music
  // Tokens' sampling, the tokens each wrote and their seconds, the guidance as applied, the sound; the engine records the stages from
  // 2.0.0 on (meta "stages"); an older take shows what its request says and a dash where nothing was kept
  function medcard(take, req, field, column) {
    var st = take.stages || null, rq = req || {}, music = st && st.music, score = st && st.score, sound = st && st.sound;
    var cell = function (label, key, text, cls) { text = String(text); return field(label, escape(text), text, key, cls === undefined ? "num" : cls); };
    var n = function (v) { return v === undefined || v === null || v === "" ? "\u2014" : String(v); };
    var secs = function (v) { return typeof v === "number" ? v.toFixed(1) + " s" : "\u2014"; };
    var smp = function (o, of) {
      o = o || {};
      return cell("Temperature", of + " temperature", n(o.temperature)) + cell("Top-p", of + " top-p", n(o.top_p)) + cell("Top-k", of + " top-k", n(o.top_k)) +
        cell("Repetition", of + " repetition", o.repetition_penalty == null ? "\u2014" : o.repetition_penalty + (o.penalty_window ? " \u00b7 " + o.penalty_window : "")) +
        cell("Min tokens", of + " min tokens", n(o.min_tokens)) + cell("Max tokens", of + " max tokens", n(o.max_tokens));
    };
    var codes = rq.semantic_tokens ? String(rq.semantic_tokens).split(",").length : null;
    var made = music ? music.tokens + (music.kept ? " + " + music.kept + " " + tr("kept") : "") : codes;
    var frames = music ? music.tokens + music.kept : codes;
    var g = music ? music.guidance : (typeof rq.cfg_scale === "number" && rq.cfg_scale >= 0 ? rq.cfg_scale : null);
    var gl = music ? music.lyrics_guidance : (typeof rq.cfg_lyrics === "number" && rq.cfg_lyrics >= 0 ? rq.cfg_lyrics : null);
    var plan = take.cot === "off" ? cell("Tokens", "Score tokens", tr("no score"), "") :
      cell("Tokens", "Score tokens", rq && (rq.score_planned || (take.provided_score && rq.harmony)) ? tr("planned first") : take.provided_score ? tr("supplied") : n(score ? score.tokens : null)) +   // HERESY 1618
      (rq && rq.vocal_octave && (rq.score_planned || !take.provided_score) ? cell("Vocal line", "Planned Vocal line", tr(octaveSaid(rq.vocal_octave)), "") : "") +   // HERESY 1743
      cell("Time", "Score time", score && score.tokens ? secs(score.seconds) : "\u2014") + smp(rq.abc_sampling, "Score");
    var mus = cell("Tokens", "Music tokens", n(made)) + cell("Seconds of music", "Music seconds", frames ? (frames / FRAME_RATE).toFixed(1) + " s" : "\u2014") +
      cell("Time", "Music time", music && !music.replayed ? secs(music.seconds) : music && music.replayed ? tr("supplied") : "\u2014") +
      cell("Guidance (CFG)", "Music guidance", g === null ? tr("default") : n(g)) + cell("Lyrics guidance", "Lyrics guidance", gl === null || gl === g ? tr("as Guidance") : n(gl)) +
      smp(rq.semantic_sampling, "Music") + cell("Length cap", "Length cap", rq.duration ? rq.duration + " s" : "\u2014");
    var run = cell("Solver", "Solver", n(rq.solver), "") + cell("Steps", "Run steps", n(rq.steps || take.steps)) + cell("Sound stage", "Sound stage", sound ? secs(sound.seconds) : "\u2014") +
      cell("Decoder", "Decoder", sound ? secs(sound.vae_seconds) : "\u2014") + cell("Whole run", "Whole run", secs(take.render_seconds)) +
      cell("Realtime", "Realtime", take.render_seconds && take.seconds ? "\u00d7" + (take.seconds / take.render_seconds).toFixed(2) : "\u2014") +
      cell("Versions \u00d7 variations", "Versions x variations", (rq.lm_batch_size || 1) + " \u00d7 " + (rq.synth_batch_size || 1)) +
      cell("Score guard", "Score guard", tr(rq.score_guard === false ? "off" : "on"), "") +
      cell("Free tempo", "Free tempo", rq.free_tempo === true ? tr("on") : "\u2014", "") +   // HERESY 1416 («off» is Direct's name in the catalogs)
      cell("Sound decode", "Sound decode", rq.nar_ladder === true ? tr("Ladder · experimental") : "\u2014", "") +   // HERESY 1768
      cell("Chords", "Chords", rq.harmony ? tr(HARMONY_NAMES[harmonyLevelOf(rq.harmony)] || "custom") : "\u2014", "");   // HERESY 1607
    return '<div class="meta-row trio medcard">' + column("Score Planner", '<dl class="meta-rows">' + plan + "</dl>") +
      column("Music Tokens", '<dl class="meta-rows">' + mus + "</dl>") + column("The run", '<dl class="meta-rows">' + run + "</dl>") + "</div>";
  }


  // About (bottom of the Engine page): the add-ons' own pages, from loras/sources.json. Only web links
  // become links; a LoRA split into two files (music half, sound half) appears once.
  function paintAbout() {
    var src = STATE.sources || {};
    var web = function (u) { return /^https?:\/\//i.test(String(u || "")) ? String(u) : ""; };
    var where = function (u) {
      var m = u.match(/^https?:\/\/[^/]+\/([^/?#]+\/[^/?#]+)/);
      return m ? m[1] : u.replace(/^https?:\/\//, "");
    };
    var item = function (name, url) {
      var u = web(url);
      return "<li>" + (u ? '<a href="' + escape(u) + '" target="_blank" rel="noopener noreferrer" translate="no">' + escape(name) + '</a><span class="about-where" translate="no">' +
        escape(where(u)) + "</span>" : '<span class="about-name" translate="no">' + escape(name) + "</span>") + "</li>";   // HERESY 1166: names
    };
    var list = function (title, items) {
      return "<section><h4>" + title + '</h4><ul class="about-links">' + (items.length ? items.join("") : '<li class="about-none">none listed</li>') + "</ul></section>";
    };
    var vaeNames = { standard: "Standard VAE", legacy: "Legacy VAE", blend: "Blend VAE" };
    var vaes = Object.keys(src.vaes || {}).map(function (k) { return item(vaeNames[k] || k + " VAE", (src.vaes[k] || {}).url); });
    var sliders = src.sliders && src.sliders.url ? [item("Voice and genre sliders", src.sliders.url)] : [];
    var byUrl = {}, order = [];
    Object.keys(src.loras || {}).forEach(function (k) {
      var e = src.loras[k] || {}, key = web(e.url) || "~" + k, name = e.title || k.replace(/\/+$/, "");
      if (!byUrl[key]) { byUrl[key] = { names: [], url: e.url }; order.push(key); }
      if (byUrl[key].names.indexOf(name) < 0) byUrl[key].names.push(name);
    });
    var loras = order.map(function (k) { return item(byUrl[k].names.join(" / "), byUrl[k].url); });
    $("aboutAddons").innerHTML = list("Sound decoders", vaes) + list("LoRAs", loras);   // HERESY 1449: no sliders
  }

  $("metaGrid").addEventListener("click", function (event) {
    var button = event.target.closest("[data-copy]");
    if (!button) return;
    navigator.clipboard.writeText(button.dataset.copy)
      .then(function () { toast("The " + button.dataset.what + " is copied"); })
      .catch(function () { toast("The browser refused clipboard access", "bad"); });
  });

  // HERESY 1167 (Viktor 05.10.2026: «для карт с Direct режимом добавить возможность генерации ABC из самого трека, чтобы не
  // прогонять его через Cover ради этого»): a Direct take's Score shows the one written from its sound when the lab keeps one,
  // else the button that writes it: the engine's transcriber on the take's own audio, watched here, kept by the lab (as the
  // Librarian's sheet has done since 1131); the cover form is not touched
  function paintFromSound(take) {
    var box = $("scoreFromSound"), run = $("scoreFromSoundRun"), btn = $("scoreFromSoundBtn");
    box.hidden = !!take.has_score || !!take.session;
    // HERESY 1168 (Viktor 06.10.2026: «если нет партитуры, нужно прятать все кнопки, которые касаются сессии с готовой
    // партитурой. FULL SCREEN, к примеру, не работает, потому что нечего разворачивать. Туда только кнопку "Сгенерить
    // партитуру из звука"»): with no score yet the card holds that one button; the score's tools come with a score
    $("scorePanel").toggleAttribute("data-empty", !box.hidden);
    if (box.hidden) return;
    run.textContent = ""; btn.disabled = false; btn.hidden = false;
    fetch("/lab/score?name=" + encodeURIComponent(take.name)).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (STATE.take !== take || !d || !d.abc) return;
      $("scorePanel").removeAttribute("data-empty");
      btn.hidden = true;
      run.textContent = "written from its sound by " + (d.by || "the transcriber") + (d.made ? ", " + d.made : "");
      renderScore(d.abc);
    }).catch(function () {});
  }
  $("scoreFromSoundBtn").addEventListener("click", function () {
    var take = STATE.take, btn = this, run = $("scoreFromSoundRun"), t0 = Date.now(), tick = 0;
    if (!take) return;
    btn.disabled = true;
    fetch("/transcribe?take=" + encodeURIComponent(take.name), { method: "POST" })
      .then(function (r) { return r.json().then(function (b) { if (!r.ok) throw new Error(b.error || r.status); return b; }); })
      .then(function (job) {
        tick = setInterval(function () { run.textContent = "the transcriber is writing it… " + Math.round((Date.now() - t0) / 1000) + " s"; }, 1000);
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
        return fetch("/lab/score?name=" + encodeURIComponent(take.name), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ abc: abc }) })
          .then(function () {
            if (STATE.take !== take) return;
            $("scorePanel").removeAttribute("data-empty");   // HERESY 1168: a score now, and its tools with it
            btn.hidden = true;
            run.textContent = "written from its sound by the transcriber (SheetSage2), now";
            renderScore(abc);
          });
      }).catch(function (e) { run.textContent = "not written: " + (e.message || e); btn.disabled = false; })
      .then(function () { clearInterval(tick); });
  });

  function renderScore(abc) {
    if (window.HeresyScore) window.HeresyScore.take(abc || "", STATE.take ? displayTitle(STATE.take) : "");   // HERESY 1028
    $("scoreAbc").textContent = abc || "";
    STATE.abcRendered = abc || "";
    if (!abc) { $("scoreStaff").textContent = ""; return; }
    if (!window.__abcjsFailed && typeof window.ABCJS === "undefined") {
      // the engraver is still on its way: the ABC tab has the score now, the staff is drawn when it lands
      window.__abcjsLanded = function () { window.__abcjsLanded = null; if (STATE.abcRendered) renderScore(STATE.abcRendered); };
      $("scoreStaff").textContent = "";   // not the last song's staff
      return;
    }
    if (window.__abcjsFailed) {
      // No renderer available: the ABC text is the score.
      $("scoreStaff").classList.add("is-hidden");
      $("scoreAbc").classList.remove("is-hidden");
      document.querySelector('.stab[data-score="staff"]').disabled = true;
      all(".stab").forEach(function (t) { t.classList.toggle("is-active", t.dataset.score === "abc"); });
      return;
    }
    try {
      window.ABCJS.renderAbc("scoreStaff", abc, {
        add_classes: true,                             // HERESY 1601: the words dressed by their kind
        responsive: "resize",
        staffwidth: 1050,   // HERESY 1007: 700 → 1050, landscape, so full screen at 1920 is not small
        paddingtop: 4,
        paddingbottom: 10,
        foregroundColor: getComputedStyle(document.documentElement).getPropertyValue("--paper-ink").trim() || "#2a2318"
      });
      if (window.HeresyAbc && window.HeresyAbc.dress) window.HeresyAbc.dress($("scoreStaff"));   // HERESY 1601
    } catch (error) {
      $("scoreStaff").textContent = "This score could not be engraved; read it as ABC.";
    }
  }

  all(".stab").forEach(function (tab) {
    tab.addEventListener("click", function () {
      all(".stab").forEach(function (t) { t.classList.toggle("is-active", t === tab); });
      var staff = tab.dataset.score === "staff";
      $("scoreStaff").classList.toggle("is-hidden", !staff);
      $("scoreAbc").classList.toggle("is-hidden", staff);
    });
  });

  // the prompt exactly as the song page shows it
  $("copyPrompt").addEventListener("click", function () {
    var text = $("metaStyle").textContent;
    if (!text) return toast("This take has no prompt", "bad");
    navigator.clipboard.writeText(text)
      .then(function () { toast("Style copied"); })
      .catch(function () { toast("The browser refused clipboard access", "bad"); });
  });

  $("copyLyrics").addEventListener("click", function () {
    var text = STATE.take ? STATE.take.lyrics : "";
    if (!text) return;
    navigator.clipboard.writeText(text)
      .then(function () { toast("Lyrics copied"); })
      .catch(function () { toast("The browser refused clipboard access", "bad"); });
  });

  $("reuseScore").addEventListener("click", function () {
    var take = STATE.take;
    if (!take) return;
    // HERESY 1168: a Direct take's score written from its sound (with its chords: the Full plan) goes into the form the same
    // way; the pencil shows only with a score now, so it never stands there doing nothing
    var fromSound = !take.has_score && !take.session && STATE.abcRendered;
    if (!take.has_score && !fromSound) return;
    (fromSound ? Promise.resolve({ abc: STATE.abcRendered }) : getRequest(take)).then(function (req) {
      var cot = fromSound ? "full" : take.cot;
      $("abc").value = req.abc || "";
      if (!fromSound && req.abc && !scoreFrom()) scoreWrittenBy(req.loras || [], "its take");   // HERESY 1327
      $("style").value = take.style;
      $("lyrics").value = take.lyrics;
      var tp = splitTitle(displayTitle(take)); setTitleParts(tp.name + " (edit)", tp.version);   // HERESY 1614
      if (MODES[cot] && cot !== "off") setCot(cot);
      setCodes(null);
      growLyrics();
      queueComfort();   // HERESY 1145: the style box's height too (this lands after the click)
      $("scoreDrawer").open = true;
      show("compose");
      $("abc").focus();
      toast("Score copied into the form — edit it, then generate");
    }).catch(function (error) { toast(error.message, "bad"); });
  });

  // Retake: this exact take again (score, seeds and music codes); Reuse: the same prompt,
  // lyrics and settings for a new song (no score, no seeds, no codes)
  $("retakeTake").addEventListener("click", function () {
    var take = STATE.take;
    if (!take) return;
    getRequest(take).then(function (req) {
      loadRequestIntoForm(req, { title: displayTitle(take), fromTake: take.session ? null : take.name, codesTitle: displayTitle(take) });
      show("compose");   // HERESY 1168 (Viktor: «Retake — сразу в левый фрейм переносит»)
      toast("Retake: this take is in the form with its music codes, so Generate renders that music again. Drop the codes to write new music.", "good");
    }).catch(function (error) { toast(error.message, "bad"); });
  });

  $("reuseTake").addEventListener("click", function () {
    var take = STATE.take;
    if (!take) return;
    getRequest(take).then(function (req) {
      var fresh = Object.assign({}, req, { abc: "", lm_seed: -1, seed: -1, semantic_tokens: "" });
      loadRequestIntoForm(fresh, { title: displayTitle(take) });
      $("scoreDrawer").open = false;
      show("compose");
      toast("Reuse: prompt, lyrics and settings are in the form, with no score, seeds or music codes. Generate writes a new song from them.", "good");
    }).catch(function (error) { toast(error.message, "bad"); });
  });

  $("dlRequest").addEventListener("click", function () {
    var take = STATE.take;
    if (!take) return;
    getRequest(take).then(function (req) {
      downloadText(slug(displayTitle(take)) + ".request.json", toJSON(req, 2) + "\n", "application/json");
    }).catch(function (error) { toast(error.message, "bad"); });
  });

  $("dlScore").addEventListener("click", function () {
    var take = STATE.take;
    if (!take || !take.has_score) return;
    getRequest(take).then(function (req) {
      downloadText(slug(displayTitle(take)) + ".abc", (req.abc || "").replace(/\n?$/, "\n"), "text/plain;charset=utf-8");
    }).catch(function (error) { toast(error.message, "bad"); });
  });

  $("rerenderSound").addEventListener("click", function () {
    var take = STATE.take;
    if (!take) return;
    var button = this;
    button.disabled = true;
    replayTake(take, { seed: randomSeed63() }, "New sound").then(function () {
      toast("Rendering " + displayTitle(take) + " again with a new sound seed…");
    }).catch(function (error) { toast(error.message, "bad"); })
      .then(function () { button.disabled = false; });
  });


  // HERESY 1037: keep the take up to a moment, write the music anew from there
  function parseClock(text) {
    var m = String(text || "").trim().match(/^(?:(\d+):)?(\d+(?:\.\d+)?)$/);
    return m ? (m[1] ? parseInt(m[1], 10) * 60 : 0) + parseFloat(m[2]) : NaN;
  }
  $("regenFrom").addEventListener("click", function () {
    var take = STATE.take, button = this;
    if (!take || take.session) return;
    var here = STATE.playerTake && STATE.playerTake.name === take.name && audio.currentTime > 0 ? audio.currentTime : null;
    var at;
    window.HeresyDialog.prompt("Regenerate from a moment\n\nKeep " + displayTitle(take) + " up to which moment (m:ss)? The music is written anew from there.",
                               here !== null ? clock(here) : "", { ok: "Regenerate", placeholder: "1:30" }).then(function (answer) {
      if (answer === null) throw null;
      at = parseClock(answer);
      if (!isFinite(at) || at <= 1 || at >= (take.seconds || 0) - 1) throw new Error("A moment between 0:01 and " + clock((take.seconds || 0) - 1));
      button.disabled = true;
      return getRequest(take);
    }).then(function (req) {
      var toks = String(req.semantic_tokens || "").split(",").filter(function (t) { return t.trim(); });
      if (!toks.length) throw new Error("This take's request carries no music codes to keep");
      var keep = Math.min(toks.length - 1, Math.round(at * FRAME_RATE));
      var body = Object.assign({}, req);
      delete body.plan_only;
      delete body.semantic_tokens;
      delete body.nar_ladder;                          // HERESY 1768: written anew from a moment on the standard decode
      body.semantic_keep = toks.slice(0, keep).join(",");
      body.lm_seed = randomSeed63();
      body.lm_batch_size = 1;
      body.synth_batch_size = 1;
      body.parent = take.name;
      body.title = displayTitle(take) + " \u00b7 from " + clock(at);
      return submitJob(body, { kind: "song", title: body.title, group: "regen-" + Date.now(), index: 0, count: 1,
                               versioned: false, variations: 1, baseTitle: body.title, parent: take.name });
    }).then(function () { toast("Writing " + displayTitle(take) + " anew from " + clock(at) + "; everything before stays"); })
      .catch(function (error) { if (error) toast(error.message, "bad"); })
      .then(function () { button.disabled = false; });
  });

  // HERESY 1651 (RIVALS 1, Viktor 20.10.2026: «ОДОБРЯЮ»): Extend: every code of the take kept, the music goes on 0:15 to 2:00 past its end, new lines
  // (if given) after the take's own; the music half's min and max raised to the new length so it goes on; a take planned with a score goes on Direct
  $("extendTake").addEventListener("click", function () {
    var take = STATE.take, button = this, more, lines;
    if (!take || take.session) return;
    window.HeresyDialog.prompt(tr("Extend {0}\n\nBy how much (m:ss), from 0:15 to 2:00? Everything it has stays as it is.").replace("{0}", displayTitle(take)),
                               "0:30", { ok: "Next", placeholder: "0:30" }).then(function (answer) {
      if (answer === null) throw null;
      more = parseClock(answer);
      if (!isFinite(more) || more < 15 || more > 120) throw new Error(tr("Between 0:15 and 2:00"));
      return window.HeresyDialog.prompt(tr("New lines for what comes after (optional). Empty: it plays on without words."), "",
                                        { ok: "Extend", area: true, rows: 6, placeholder: "[Outro]\n…" });
    }).then(function (answer) {
      if (answer === null) throw null;
      lines = String(answer || "").trim();
      button.disabled = true;
      return getRequest(take);
    }).then(function (req) {
      var toks = String(req.semantic_tokens || "").split(",").filter(function (t) { return t.trim(); });
      if (!toks.length) throw new Error("This take's request carries no music codes to keep");
      var total = Math.min(900, Math.ceil(toks.length / FRAME_RATE + more)), body = Object.assign({}, req);
      delete body.plan_only;
      delete body.semantic_tokens;
      delete body.abc;                                 // the score ends where the take ends: what comes after is written Direct
      delete body.nar_ladder;                          // HERESY 1768: extended on the standard decode
      body.cot = "off";
      body.semantic_keep = toks.join(",");
      body.duration = total;
      body.semantic_sampling = Object.assign({}, req.semantic_sampling || {}, { max_tokens: Math.round(total * FRAME_RATE),
        min_tokens: Math.min(Math.round(total * FRAME_RATE), toks.length + Math.round(more * FRAME_RATE * 0.75)) });   // it does go on
      if (lines) body.lyrics = String(req.lyrics || "").replace(/\s+$/, "") + "\n\n" + lines;
      body.lm_seed = randomSeed63();
      body.lm_batch_size = 1;
      body.synth_batch_size = 1;
      body.parent = take.name;
      body.title = displayTitle(take) + " \u00b7 +" + clock(more);
      return submitJob(body, { kind: "song", title: body.title, group: "extend-" + Date.now(), index: 0, count: 1,
                               versioned: false, variations: 1, baseTitle: body.title, parent: take.name });
    }).then(function () { toast(tr("Extending {0} by {1}; everything it has stays").replace("{0}", displayTitle(take)).replace("{1}", clock(more))); })
      .catch(function (error) { if (error) toast(error.message, "bad"); })
      .then(function () { button.disabled = false; });
  });

  // HERESY 1034: the same take, cut where its text ends (lab/textend_job.py finds the place)
  $("trimToText").addEventListener("click", function () {
    var take = STATE.take, button = this;
    if (!take) return;
    button.disabled = true;
    var started = Date.now(), ask = function () {
      return fetch("/lab/textend?name=" + encodeURIComponent(take.name)).then(function (r) {
        return r.json().then(function (b) {
          if (r.status === 202) {
            button.textContent = "Listening\u2026 " + Math.round((Date.now() - started) / 1000) + " s";
            return new Promise(function (res) { setTimeout(res, 2500); }).then(ask);
          }
          if (!r.ok) throw new Error(b.error || r.status);
          return b;
        });
      });
    };
    ask().then(function (r) {
      if (!r.text_end) throw new Error("No line of the text was heard in this take");
      if (r.confident === false) throw new Error("Where the text ends cannot be told with confidence here (" + r.heard + " of " + r.units +
        " lines heard in order, the last at line " + r.last_unit + "): nothing trimmed. Whisper hears some languages badly.");
      if (r.keep_frames >= r.frames_total - 25) return toast("The text runs to the end (" + clock(r.text_end) + " of " + clock(r.seconds) + "): nothing to trim");
      return window.HeresyDialog.confirm("The text ends at " + clock(r.text_end) + " of " + clock(r.seconds) + " (" + r.heard + " of " + r.units +
                   " lines heard in order).\n\nRender this take again, cut at " + clock(r.keep_seconds) + "? The same performance; only the sound stage runs.", { ok: "Trim it" }).then(function (ok) {
        if (!ok) return;
        return getRequest(take).then(function (req) {
        var toks = String(req.semantic_tokens || "").split(",").filter(function (t) { return t.trim(); });
        return replayTake(take, { semantic_tokens: toks.slice(0, r.keep_frames).join(","), duration: r.keep_frames / FRAME_RATE }, "Trimmed to the text");
        }).then(function () { toast("Rendering " + displayTitle(take) + " cut at " + clock(r.keep_seconds) + "\u2026"); });
      });
    }).catch(function (error) { toast(error.message, "bad"); })
      .then(function () { button.disabled = false; button.textContent = "Trim to the text"; });
  });

  // HERESY 1169 · 1233 (Viktor 08.10.2026: «после последнего правильного затухания какая-то… хуета выскакивает на 10-15 секунд»): the same take ending at a chosen moment, its last 2 s faded out; from its kept latents in seconds (the very sound, decoded again only so far), else its music codes cut there and rendered again
  $("endAt").addEventListener("click", function () {
    var take = STATE.take, button = this, fade = 2, at;
    if (!take) return;
    var here = STATE.playerTake && STATE.playerTake.name === take.name && audio.currentTime > 0 ? audio.currentTime : null;
    window.HeresyDialog.prompt("End the take at a moment\n\n" + displayTitle(take) + " ends at which moment (m:ss)? Its last " + fade + " s fade out, and nothing after it is kept. A new take; this one stays.",
                               here !== null ? clock(here) : "", { ok: "End it there", placeholder: "3:45" }).then(function (answer) {
      if (answer === null) throw null;
      at = parseClock(answer);
      if (!isFinite(at) || at <= fade + 1 || at >= (take.seconds || 0) - 0.5) throw new Error("A moment between " + clock(fade + 2) + " and " + clock((take.seconds || 0) - 1));
      button.disabled = true;
      return getRequest(take);
    }).then(function (req) {
      var toks = String(req.semantic_tokens || "").split(",").filter(function (t) { return t.trim(); });
      if (!toks.length) throw new Error("This take's request carries no music codes, so it cannot be re-rendered");
      var frames = Math.min(toks.length, Math.ceil(at * FRAME_RATE));
      var change = { semantic_tokens: toks.slice(0, frames).join(","), duration: frames / FRAME_RATE, end_at: at, fade_out: fade, title: displayTitle(take) + " \u00b7 ends at " + clock(at) };
      if (take.latents) change.decode_from = take.name;
      return replayTake(take, change, "Ended at " + clock(at));
    }).then(function () { toast("Ending " + displayTitle(take) + " at " + clock(at) + "\u2026"); })
      .catch(function (error) { if (error) toast(error.message, "bad"); })
      .then(function () { button.disabled = false; });
  });

  // HERESY 1169 · 1325 (from SUNO v6, TODO.md: «A loop from the song: 1, 2, 4 or 8 bars cut on the score's bar lines, seamless, as a
  // WAV (SUNO's Sounds: loops and one-shots with BPM and key)»): the take's score (its own, else the one written from its sound) gives
  // its bars in seconds at its tempo; the bar where the player stands (else the first), so many bars on; the lab cuts them from the
  // take's own WAV, its first 30 ms crossfaded from what follows them in the song, so played round the end runs into the start
  function barsOf(abc) {
    var score = window.HeresyAbc.parse(abc), v = score.voices.Vocal, f = function (a) { return a[0] / a[1]; }, k = 60 / score.bpm;
    return { bpm: score.bpm, key: score.key, keys: v.keys.map(function (x) { return { t: f(x[0]) * k, key: x[1] }; }),
             bars: v.bars.map(function (b) { return { t: f(b[0]) * k, len: f(b[1]) * k }; }) };
  }
  window.ruachBarsOf = barsOf;                                 // for the checks
  $("loopTake").addEventListener("click", function () {
    var take = STATE.take, button = this, plan, at = 0;
    if (!take || take.session) return;
    var here = STATE.playerTake && STATE.playerTake.name === take.name && audio.currentTime > 0 ? audio.currentTime : null;
    var got = take.has_score ? getRequest(take).then(function (req) { return (req && req.abc) || ""; })
      : fetch("/lab/score?name=" + encodeURIComponent(take.name)).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) { return (d && d.abc) || ""; });
    got.then(function (abc) {
      if (!abc) throw new Error("This take has no score to find its bars by: Transcribe this take writes one from its sound");
      plan = barsOf(abc);
      if (!plan.bars.length) throw new Error("Its score has no bars");
      if (here !== null) plan.bars.forEach(function (b, k) { if (b.t <= here + 0.05) at = k; });
      return window.HeresyDialog.prompt("A loop from this take\n\nFrom the bar at " + clock(plan.bars[at].t) + (here !== null ? " (where the player stands)" : " (the first: play the take and pause where the loop should begin)") +
        ", how many bars: 1, 2, 4 or 8? Seamless, its end running into its start; saved as a WAV.", "4", { ok: "Cut the loop", placeholder: "4" });
    }).then(function (answer) {
      if (answer === null) throw null;
      var n = parseInt(answer, 10), bars = plan.bars;
      if ([1, 2, 4, 8].indexOf(n) < 0) throw new Error("1, 2, 4 or 8 bars");
      if (at + n > bars.length) throw new Error("Only " + (bars.length - at) + " bars from there to the end of the score");
      var start = bars[at].t, last = bars[at + n - 1], secs = last.t + last.len - start;
      if (take.seconds && start + secs > take.seconds) throw new Error("The take ends before those bars do");
      var key = plan.key;
      plan.keys.forEach(function (x) { if (x.t <= start + 0.01) key = x.key; });
      var file = (displayTitle(take) + " · " + n + " bar" + (n > 1 ? "s" : "") + " from " + clock(start) + " · " + Math.round(plan.bpm) + " BPM · " + key)
        .replace(/[\\/:*?"<>|]+/g, "-") + ".wav";
      button.disabled = true;
      return fetch("/lab/loop?name=" + encodeURIComponent(take.name) + "&start=" + start.toFixed(4) + "&seconds=" + secs.toFixed(4))
        .then(function (r) { return r.ok ? r.blob() : r.json().then(function (b) { throw new Error(b.error || r.status); }); })
        .then(function (blob) {
          downloadText(file, blob, "audio/wav");
          toast("The loop: " + n + " bar" + (n > 1 ? "s" : "") + ", " + secs.toFixed(2) + " s at " + Math.round(plan.bpm) + " BPM, " + key, "good");
        });
    }).catch(function (error) { if (error) toast(error.message, "bad"); })
      .then(function () { button.disabled = false; });
  });

  // HERESY 1169 · 1356 (from SUNO v6; Viktor 11.10.2026: «Идеи из SUNO внедряй для релиза 2.0.0, чтобы не возвращаться к этому больше»): Crop,
  // Remove a section and Speed. The take's score (its own, else the one written from its sound) gives its sections in seconds and its
  // own lines; the lab cuts the take's sound on their starts (bar lines), each join healed by a short crossfade, or stretches it with
  // its pitch kept; the page cuts the score along (the sections' own lines) or writes its tempo anew. A new take each time
  function editScore(take) {
    return take.has_score ? getRequest(take).then(function (req) { return (req && req.abc) || ""; })
      : fetch("/lab/score?name=" + encodeURIComponent(take.name)).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) { return (d && d.abc) || ""; });
  }
  function scoreParts(abc, seconds) {                 // {head, parts: [{name, t, end, lines}]}: a part from each run of «% name» lines
    var score = window.HeresyAbc.parse(abc), k = 60 / score.bpm, f = function (a) { return a[0] / a[1]; };
    var lines = String(abc).replace(/\r/g, "").split("\n");
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    var parts = [], cur = null, s = 0, total = f(score.voices.Vocal.time) * k;
    for (var i = 8; i < lines.length; i++) {
      var l = lines[i], mark = l.indexOf("% ") === 0;
      if (mark && (!cur || cur.music)) {
        cur = { name: [], t: score.sections[s] ? f(score.sections[s][0]) * k : 0, lines: [], music: false };
        parts.push(cur);
      } else if (!cur) {
        cur = { name: [], t: 0, lines: [], music: false };
        parts.push(cur);
      }
      if (mark) { cur.name.push(l.slice(2).trim()); s++; } else cur.music = true;
      cur.lines.push(l);
    }
    parts.forEach(function (p, j) {
      p.name = p.name.join(" · ") || "Start";
      p.end = j < parts.length - 1 ? parts[j + 1].t : Math.max(total, +seconds || 0);   // the last runs to the take's end (its tail)
    });
    return { head: lines.slice(0, 8), parts: parts, bpm: score.bpm };
  }
  function scoreKeep(sp, keep) {                      // the score of the parts kept, or "" when it would not parse
    var abc = sp.head.concat([].concat.apply([], sp.parts.filter(function (p, j) { return keep[j]; }).map(function (p) { return p.lines; }))).join("\n") + "\n";
    try { window.HeresyAbc.parse(abc); return abc; } catch (e) { return ""; }
  }
  function editTake(take, body, said) {
    return post("/lab/take/edit", Object.assign({ name: take.name }, body)).then(function (r) {
      toast(said + ": " + r.title + " · " + clock(r.seconds), "good");
      return refreshLibrary().then(function () { openTake(r.name); });
    });
  }
  // HERESY 1729: the take's own wave for an edit dialog (its peaks as the player has them, else the lab's), its seconds, and the marks' words
  function waveFor(take, marks) {
    var url = takeAudioUrl(take), have = STATE.peakCache && STATE.peakCache[url];
    var peaks = have && have !== "none" ? Promise.resolve(have) : api("/library/peaks?name=" + encodeURIComponent(take.name)).then(function (d) { return d && d.peaks ? d.peaks : null; }, function () { return null; });
    return { peaks: peaks, seconds: +take.seconds || 1, marks: marks || [] };
  }
  function waveMark(a, b, kind, word) { return { a: +a || 0, b: +b || 0, kind: kind, label: word ? tr(word) : "" }; }
  window.ruachWaveFor = waveFor;
  function editPick(take, what) {                     // the take's parts, picked in the studio's pick window
    return editScore(take).then(function (abc) {
      if (!abc) throw new Error("This take has no score to find its sections by: Transcribe this take writes one from its sound");
      var sp = scoreParts(abc, take.seconds);
      if (sp.parts.length < 2) throw new Error("Its score has one section only: nothing to " + (what === "crop" ? "crop" : "take out") + " by sections");
      var groups = [{ label: what === "crop" ? "The sections to keep (from the first ticked to the last)" : "The sections to take out",
        items: sp.parts.map(function (p, j) { return { value: String(j), label: p.name, raw: true, note: clock(p.t) + "–" + clock(p.end) }; }) }];   // HERESY 1732: a tag, never translated
      var left = function (vals) {
        var on = vals.map(Number), secs = 0;
        if (what === "crop") { if (!on.length) return ""; var a = Math.min.apply(null, on), b = Math.max.apply(null, on); secs = sp.parts[b].end - sp.parts[a].t; }
        else secs = sp.parts.reduce(function (s, p, j) { return s + (on.indexOf(j) >= 0 ? 0 : p.end - p.t); }, 0);
        return "\u2192 " + clock(secs);
      };
      return window.HeresyDialog.pick((what === "crop" ? "Crop the take" : "Remove a section") + "\n\n" + displayTitle(take) +
        (what === "crop" ? ": the stretch from the first section ticked to the last stays, cut on the score's bar lines." : ": the sections ticked go, each join healed by a short crossfade on the bar line.") +
        " A new take; this one stays.", groups, { ok: what === "crop" ? "Crop" : "Take out", count: left, wave: Object.assign(waveFor(take), { forValues: function (vals) {   // HERESY 1729
          var on = vals.map(Number);
          if (!on.length) return [];
          if (what === "crop") {
            var a = Math.min.apply(null, on), b = Math.max.apply(null, on), out = [waveMark(sp.parts[a].t, sp.parts[b].end, "keep", "stays")];
            if (sp.parts[a].t > 0.05) out.push(waveMark(0, sp.parts[a].t, "cut", "goes"));
            if (sp.parts[b].end < (+take.seconds || 0) - 0.05) out.push(waveMark(sp.parts[b].end, +take.seconds, "cut", "goes"));
            return out;
          }
          return on.map(function (j) { return waveMark(sp.parts[j].t, sp.parts[j].end, "cut", "goes"); });
        } }) }).then(function (picked) {
        if (!picked || !picked.values.length) throw null;
        var on = picked.values.map(Number).sort(function (a, b) { return a - b; }), keep = sp.parts.map(function () { return what !== "crop"; }), names = [];
        if (what === "crop") { for (var j = on[0]; j <= on[on.length - 1]; j++) keep[j] = true; }
        else on.forEach(function (j) { keep[j] = false; });
        if (keep.every(Boolean)) throw new Error("Nothing taken out");
        if (!keep.some(Boolean)) throw new Error("Nothing would be left of the take");
        var spans = [];                                   // crop: the stretch kept; remove: each run of parts taken out
        sp.parts.forEach(function (p, j) {
          var want = what === "crop" ? keep[j] : !keep[j];
          if (!want) return;
          var last = spans[spans.length - 1];
          if (last && Math.abs(last[1] - p.t) < 1e-6) last[1] = p.end; else spans.push([p.t, p.end]);
          names.push(p.name);
        });
        var abc2 = scoreKeep(sp, keep);
        var title = displayTitle(take) + " \u00b7 " + (what === "crop" ? (names.length > 1 ? names[0] + " to " + names[names.length - 1] : names[0]) : "without " + names.join(", "));
        return { spans: spans, abc: abc2, title: title };
      });
    });
  }
  ["cropTake", "cutSection"].forEach(function (id) {
    $(id).addEventListener("click", function () {
      var take = STATE.take, button = this, what = id === "cropTake" ? "crop" : "remove";
      if (!take || take.session) return;
      editPick(take, what).then(function (e) {
        button.disabled = true;
        return editTake(take, { op: what, spans: e.spans, abc: e.abc, title: e.title }, what === "crop" ? "Cropped" : "Taken out")
          .then(function () { if (!e.abc) toast("The new take has no score: its score could not be cut on those sections", "bad"); });
      }).catch(function (error) { if (error) toast(error.message, "bad"); })
        .then(function () { button.disabled = false; });
    });
  });
  function speedOf(answer, bpm) {                       // «99» (BPM, with a score), «×1.1», «1.1x», «90%», «1.1»: {f, nb}
    var s = String(answer).trim().replace(",", "."), f, nb = 0, m;
    if ((m = /^([0-9.]+)\s*%$/.exec(s))) f = +m[1] / 100;
    else if ((m = /^[x\u00d7]\s*([0-9.]+)$|^([0-9.]+)\s*[x\u00d7]$/i.exec(s))) f = +(m[1] || m[2]);
    else if (bpm && /^[0-9]+$/.test(s) && +s >= 20) { nb = +s; f = nb / bpm; }
    else f = +s;
    if (!isFinite(f) || f < 0.5 || f > 2) throw new Error("From ×0.5 to ×2" + (bpm ? " (" + Math.ceil(bpm * 0.5) + " to " + Math.floor(bpm * 2) + " BPM)" : ""));
    if (bpm && !nb) { nb = Math.round(bpm * f); f = nb / bpm; }   // the score's tempo a whole number: the factor follows it
    if (Math.abs(f - 1) < 0.005) throw new Error("That is its own speed");
    return { f: f, nb: nb };
  }
  $("speedTake").addEventListener("click", function () {
    var take = STATE.take, button = this, bpm = 0, abc = "";
    if (!take || take.session) return;
    editScore(take).then(function (a) {
      abc = a || "";
      try { bpm = abc ? window.HeresyAbc.parse(abc).bpm : 0; } catch (e) { bpm = 0; abc = ""; }
      return window.HeresyDialog.prompt("Speed\n\n" + displayTitle(take) + (bpm ? " is at " + bpm + " BPM: the new tempo in BPM, or a factor (×1.1, 90%)?" : ": a factor (×1.1, 90%)? Its pitch stays.") +
        " From ×0.5 to ×2. A new take; this one stays.", bpm ? String(bpm) : "×1.1", { ok: "Change the speed", placeholder: bpm ? String(Math.round(bpm * 1.1)) : "×1.1" });
    }).then(function (answer) {
      if (answer === null) throw null;
      var sp = speedOf(answer, bpm), f = sp.f, nb = sp.nb;
      var abc2 = bpm ? abc.replace(/^Q:1\/4=\d+$/m, "Q:1/4=" + nb) : null;
      button.disabled = true;
      toast("Changing the speed of " + displayTitle(take) + " (×" + f.toFixed(3) + ")\u2026");
      return editTake(take, { op: "speed", factor: +f.toFixed(5), abc: abc2, title: displayTitle(take) + " \u00b7 " + (nb ? nb + " BPM" : "\u00d7" + f.toFixed(2)) }, "Its speed changed");
    }).catch(function (error) { if (error) toast(error.message, "bad"); })
      .then(function () { button.disabled = false; });
  });
  // HERESY 1714 (RIVALS 13, Viktor 20.10.2026: «Редактирование трека по операциям… ОДОБРЯЮ»; 22.10: «По операциям пункта 13 я понял теперь»): a take
  // arranged anew from its own sections: Repeat a section plays the sections ticked twice, the copy right after them; Insert a part puts a copy of one
  // section after another. The lab joins the stretches in this order (takeedit's arrange), each join healed as Crop's; the score joined the same way
  function arrangeAbc(sp, order) {                    // the score of the parts in this order, or "" when it would not parse
    var abc = sp.head.concat([].concat.apply([], order.map(function (j) { return sp.parts[j].lines; }))).join("\n") + "\n";
    try { window.HeresyAbc.parse(abc); return abc; } catch (e) { return ""; }
  }
  function arrangePick(take, what) {                  // {spans, abc, title} for the lab, or a refusal (null: put away)
    return editScore(take).then(function (abc) {
      if (!abc) throw new Error("This take has no score to find its sections by: Transcribe this take writes one from its sound");
      var sp = scoreParts(abc, take.seconds), len = +take.seconds || Infinity;
      // the parts the take really sings: a section planned past its end (the model stopped before it) is left out, the last cut at its end
      sp.parts = sp.parts.filter(function (p) { return p.t < len - 0.5; });
      sp.parts.forEach(function (p) { p.end = Math.min(p.end, len); });
      var rows = sp.parts.map(function (p, j) { return { value: String(j), label: p.name, raw: true, note: clock(p.t) + "–" + clock(p.end) }; });   // HERESY 1732: a tag
      var done = function (order, title) {
        return { spans: order.map(function (j) { return [sp.parts[j].t, sp.parts[j].end]; }), abc: arrangeAbc(sp, order), title: displayTitle(take) + " · " + title };
      };
      if (what === "repeat") {
        var more = function (vals) { var on = vals.map(Number); if (!on.length) return ""; var a = Math.min.apply(null, on), b = Math.max.apply(null, on); return "+ " + clock(sp.parts[b].end - sp.parts[a].t); };
        return window.HeresyDialog.pick("Repeat a section\n\n" + displayTitle(take) + ": the stretch from the first section ticked to the last plays twice, the copy right after it, each join healed by a short crossfade on the bar line. A new take; this one stays.",
          [{ label: "The sections to play twice (from the first ticked to the last)", items: rows }], { ok: "Repeat", count: more, wave: Object.assign(waveFor(take), { forValues: function (vals) {   // HERESY 1729
            var on = vals.map(Number); if (!on.length) return [];
            var a = Math.min.apply(null, on), b = Math.max.apply(null, on), t0 = sp.parts[a].t, t1 = sp.parts[b].end;
            return [waveMark(t0, t1, "donor", "copied"), waveMark(t1, t1 + (t1 - t0), "place", "its copy")];
          } }) }).then(function (picked) {
          if (!picked || !picked.values.length) throw null;
          var on = picked.values.map(Number), a = Math.min.apply(null, on), b = Math.max.apply(null, on), order = [];
          sp.parts.forEach(function (p, j) { order.push(j); if (j === b) for (var k = a; k <= b; k++) order.push(k); });
          return done(order, sp.parts.slice(a, b + 1).map(function (p) { return p.name; }).join(", ") + " twice");
        });
      }
      if (sp.parts.length < 2) throw new Error("Its score has one section only: nothing to arrange by sections");
      return window.HeresyDialog.choose("Insert a part\n\n" + displayTitle(take) + ": which section goes in once more?", rows.map(function (r) { return Object.assign({ words: false }, r); }),
        { cancel: "Cancel", wave: Object.assign(waveFor(take), { forItem: function (v) { var q = sp.parts[+v]; return q ? [waveMark(q.t, q.end, "donor", "copied")] : []; } }) }).then(function (v) {   // HERESY 1729
        if (v === null || v === undefined) throw null;
        var src = +v, where = [{ value: "-1", label: "At the start", note: "before " + sp.parts[0].name, words: true }].concat(sp.parts.map(function (p, j) {
          return { value: String(j), label: "After " + p.name, note: clock(p.end), words: true };
        }));
        var srcLen = sp.parts[src].end - sp.parts[src].t, donor = waveMark(sp.parts[src].t, sp.parts[src].end, "donor", "copied");
        return window.HeresyDialog.choose("Insert a part\n\n" + sp.parts[src].name + ": after which section? Each join healed by a short crossfade on the bar line. A new take; this one stays.", where,
          { cancel: "Cancel", wave: Object.assign(waveFor(take, [donor]), { forItem: function (w) { var at = +w < 0 ? 0 : sp.parts[+w].end; return [donor, waveMark(at, at + srcLen, "place", "goes in")]; } }) }).then(function (w) {   // HERESY 1729
          if (w === null || w === undefined) throw null;
          var after = +w, order = after < 0 ? [src] : [];
          sp.parts.forEach(function (p, j) { order.push(j); if (j === after) order.push(src); });
          return done(order, sp.parts[src].name + " after " + (after < 0 ? "the start" : sp.parts[after].name));
        });
      });
    });
  }
  [["repeatSection", "repeat", "Repeated"], ["insertPart", "insert", "Inserted"]].forEach(function (b3) {
    $(b3[0]).addEventListener("click", function () {
      var take = STATE.take, button = this;
      if (!take || take.session) return;
      arrangePick(take, b3[1]).then(function (e) {
        button.disabled = true;
        return editTake(take, { op: "arrange", spans: e.spans, abc: e.abc, title: e.title }, b3[2])
          .then(function () { if (!e.abc) toast("The new take has no score: its score could not be joined in that order", "bad"); });
      }).catch(function (error) { if (error) toast(error.message, "bad"); })
        .then(function () { button.disabled = false; });
    });
  });
  window.ruachTakeEdit = { parts: scoreParts, keep: scoreKeep, pick: editPick, speed: speedOf, arrange: arrangePick, arrangeAbc: arrangeAbc };   // for the checks (1714: arrange)

  // HERESY 1169 · 1324 (Viktor's screenshots of SUNO v6, 09.10.2026, «Наша студия уже круче, чем СУНО»: its Fade in beside our End at…):
  // the same take, its first seconds brought up from silence on a half cosine; from its kept latents in seconds (the very sound),
  // else its music codes rendered again; an ended take stays ended (its request's end_at and fade_out go along)
  $("fadeIn").addEventListener("click", function () {
    var take = STATE.take, button = this, secs;
    if (!take) return;
    window.HeresyDialog.prompt("Fade the take in\n\n" + displayTitle(take) + " rises from silence over how many seconds? A new take; this one stays.",
                               "2", { ok: "Fade it in", placeholder: "2" }).then(function (answer) {
      if (answer === null) throw null;
      secs = Math.round(parseFloat(String(answer).replace(",", ".")) * 10) / 10;
      if (!isFinite(secs) || secs < 0.2 || secs > 30 || secs > (take.seconds || 0) / 2) throw new Error("Between 0.2 and 30 seconds, and not more than half the take");
      button.disabled = true;
      var change = { fade_in: secs, title: displayTitle(take) + " \u00b7 fades in " + secs + " s" };
      if (take.latents) change.decode_from = take.name;
      return replayTake(take, change, "Faded in over " + secs + " s");
    }).then(function () { toast("Fading " + displayTitle(take) + " in over " + secs + " s\u2026"); })
      .catch(function (error) { if (error) toast(error.message, "bad"); })
      .then(function () { button.disabled = false; });
  });

  $("takeActions").addEventListener("click", function (event) {
    var take = STATE.take;
    if (!take) return;
    if (event.target.closest("#favTake")) toggleFavorite(take);
    var rateBtn = event.target.closest("#likeTake, #dislikeTake"), HCr = window.HeresyCollection;
    if (rateBtn && HCr && !take.session) {                       // HERESY 1169: as the player's (rateNow): at once, the lab confirms
      var value = +rateBtn.dataset.rate, sent = HCr.rate(take.name, HCr.rating(take.name) === value ? 0 : value);
      paintRate();
      sent.then(function () { paintRate(); paintLibrary(); }, function (e) { paintRate(); toast(e.message, "bad"); });
    }
    if (event.target.closest("#protTake") && window.HeresyCollection && !take.session) window.HeresyCollection.protect([take.name], !window.HeresyCollection.isProtected(take.name));   // HERESY 1368
    if (event.target.closest("#renameTake")) startRename();
    if (event.target.closest("#libTake") && window.HeresyCollection) { setTab("collection"); window.HeresyCollection.reveal(take.name); }   // HERESY 1167
    if (event.target.closest("#deleteTake")) deleteTake(take);
  });

  /* ------------------------------------------------------- lyrics export */

  // Sections keep their tag line; joining every section's text gives back the
  // lyrics exactly. No timing is invented: the words are what was supplied.
  function lyricSections(lyrics) {
    var sections = [], current = null;
    lyrics.split(/(?<=\n)/).forEach(function (line) {
      var tag = line.match(/^\s*\[([^\]]+)\]\s*$/);
      if (tag || !current) {
        current = { index: sections.length, tag: tag ? tag[1].trim() : null, text: "", lyrics: "" };
        sections.push(current);
      }
      current.text += line;
      if (!tag) current.lyrics += line;
    });
    sections.forEach(function (sec) { sec.lyrics = sec.lyrics.replace(/^\s+|\s+$/g, ""); });
    return sections;
  }

  $("lyricsTxt").addEventListener("click", function () {
    var take = STATE.take;
    if (!take || !take.lyrics) return toast("Open a take first", "bad");
    downloadText(slug(displayTitle(take)) + ".lyrics.txt", take.lyrics, "text/plain;charset=utf-8");
  });

  $("lyricsJson").addEventListener("click", function () {
    var take = STATE.take;
    if (!take || !take.lyrics) return toast("Open a take first", "bad");
    var doc = { schema: "song-lyrics-v1", title: displayTitle(take), style: take.style, lyrics: take.lyrics,
                take: take.name, seed: seedText(take.lm_seed), sound_seed: seedText(take.seed),
                sections: lyricSections(take.lyrics), timing: null };
    downloadText(slug(displayTitle(take)) + ".song.json", JSON.stringify(doc, null, 2) + "\n", "application/json");
  });

  /* ------------------------------------------- take family: VAEs and sounds */
  // A re-render names the take it came from (parent), so every take knows its
  // family: the same music under other VAEs and other sound seeds.

  function familyOf(take) {
    var byName = {};
    STATE.takes.forEach(function (t) { byName[t.name] = t; });
    var rootCache = {};
    function root(t) {
      if (rootCache[t.name]) return rootCache[t.name];
      var e = t, guard = 0;
      while (e.parent && byName[e.parent] && guard++ < 64) e = byName[e.parent];
      rootCache[t.name] = e.name;
      return e.name;
    }
    var mine = root(take);
    return STATE.takes.filter(function (t) { return root(t) === mine; });
  }

  function liveReplays(take) {
    var names = {};
    familyOf(take).forEach(function (t) { names[t.name] = true; });
    return STATE.jobs.filter(function (j) { return j.kind === "replay" && isLive(j) && names[j.parent]; });
  }

  function paintDecodeSwitch() {
    var take = STATE.take;
    if (!take || STATE.vaes.length < 2) { $("decodeSwitch").innerHTML = ""; return; }
    var family = familyOf(take), pending = liveReplays(take);
    $("decodeSwitch").innerHTML = '<span class="label">VAE</span>' + STATE.vaes.map(function (v) {
      var label = escape(v.label || v.name), repo = v.repo || v.name;
      if (v.name === take.vae) {
        var held = STATE.playerTake && STATE.playerTake.name === take.name;
        return '<button type="button" class="chip is-on" aria-pressed="true" data-tip="' + escape((held ? "Playing this version\n" : "This version\n") + repo) + '">' + label + "</button>";
      }
      var twin = family.filter(function (t) { return t.vae === v.name && String(t.seed) === String(take.seed); })[0];
      if (twin) {
        return '<button type="button" class="chip" data-play-take="' + escape(twin.name) + '" aria-pressed="false" data-tip="' +
          escape("Play this version\n" + repo) + '">' + label + "</button>";
      }
      var busy = pending.some(function (j) { return j.request.vae === v.name && String(j.request.seed) === String(take.seed); });
      if (busy) return '<button type="button" class="chip ghosted" disabled>Rendering ' + label + "\u2026</button>";
      // HERESY 1168 (Viktor 07.10.2026: «Кликнул на другой адаптер, получил обещание декодинга этим декодером, но по ходу
      // пошла полная синтезация трека с другим VAE, а должны лишь готовые латенты за 5-7 секунд декодироваться»): a take that
      // kept its latents is decoded again by the VAE alone; one made before renders its sound again, and says so
      return '<button type="button" class="chip ghosted" data-add-vae="' + escape(v.name) + '" data-tip="' +
        escape((take.latents ? "Decode this take again with this VAE: its own sound, another decoder, in seconds"
                             : "Render this take's sound again with this VAE: it was made before takes kept their latents, so it takes as long as its sound did") +
               "\n" + repo) + '">+ ' + label + "</button>";
    }).join("");
  }

  function paintSoundSwitch() {
    var take = STATE.take;
    if (!take) { $("soundSwitch").innerHTML = ""; return; }
    var seen = {}, versions = [];
    familyOf(take).filter(function (t) { return t.vae === take.vae; })
      .sort(function (a, b) { return a.created - b.created || (a.name < b.name ? -1 : 1); })
      .forEach(function (t) {
        var key = String(t.seed);
        if (seen[key]) { if (t.name === take.name) seen[key].name = t.name; return; }
        seen[key] = { seed: key, name: t.name };
        versions.push(seen[key]);
      });
    var pending = liveReplays(take).filter(function (j) { return j.request.vae === take.vae && String(j.request.seed) !== String(take.seed); });
    if (versions.length < 2 && !pending.length) { $("soundSwitch").innerHTML = ""; return; }
    $("soundSwitch").innerHTML = '<span class="label">Sound</span>' + versions.map(function (v, n) {
      var current = v.seed === String(take.seed);
      return '<button type="button" class="chip' + (current ? " is-on" : "") + '"' + (current ? "" : ' data-play-take="' + escape(v.name) + '"') +
        ' aria-pressed="' + current + '" data-tip="' + escape("Sound seed " + v.seed + "\nsame music, another grain") + '">' + (n + 1) + "</button>";
    }).join("") + (pending.length ? '<button type="button" class="chip ghosted" disabled>Rendering\u2026</button>' : "");
  }

  function onSwitchClick(event) {
    hideTip();
    var play = event.target.closest("[data-play-take]"), add = event.target.closest("[data-add-vae]");
    // Switching keeps the playback position, so A/B listening compares the same bar.
    if (play) openTake(play.dataset.playTake, { keep: true });
    if (add && STATE.take) {
      var take = STATE.take, vae = add.dataset.addVae;
      add.disabled = true;
      replayTake(take, take.latents ? { vae: vae, decode_from: take.name } : { vae: vae }, vaeLabel(vae) + " VAE version").then(function () {
        toast((take.latents ? "Decoding " : "Rendering the sound of ") + displayTitle(take) + " with the " + vaeLabel(vae) + " VAE…");
      }).catch(function (error) { toast(error.message, "bad"); add.disabled = false; });
    }
  }
  $("decodeSwitch").addEventListener("click", onSwitchClick);
  $("soundSwitch").addEventListener("click", onSwitchClick);

  // The same music again: the take's own replay request (codes, score, both
  // seeds) with one thing changed, and parent pointing back at the take.
  // HERESY 1498 (Viktor 16.10.2026: «Например выбрал 2 вариации + 3 семплера с их шагом. В итоге получил 6 семплов. Вижу разницу между Midpoint и
  // HEUN. Они вообще разные картинки рисуют»): beside the run's own solver, the others ticked under it, each at its steps; every take of the
  // run rendered again by each of them from its own music codes with its own sound seed, so only the solver and its steps differ. The
  // titles say whose sound: «· Heun 64»
  var SOLVER_NAMES = { midpoint: "Midpoint", multistep: "Multistep", heun: "Heun", euler: "Euler" };
  function alsoState() { try { return JSON.parse(recall("yue2.alsoSolvers") || "{}") || {}; } catch (e) { return {}; } }
  function alsoChosen() {
    var st = alsoState(), main = $("odeSolver").value;
    return Object.keys(SOLVER_NAMES).filter(function (k) { return k !== main && st[k] && st[k].on; })
      .map(function (k) { return { solver: k, steps: STEP_STOPS.indexOf(+st[k].steps) >= 0 ? +st[k].steps : 32 }; });
  }
  function solverTitle(title, solver, steps) {
    return String(title || "Untitled").replace(/ · (Midpoint|Multistep|Heun|Euler) \d+$/, "") + " · " + SOLVER_NAMES[solver || "midpoint"] + " " + steps;
  }
  function paintAlso() {
    var st = alsoState(), main = $("odeSolver").value, box = $("alsoSolvers");
    if (!box) return;
    box.innerHTML = Object.keys(SOLVER_NAMES).filter(function (k) { return k !== main; }).map(function (k) {
      var on = !!(st[k] && st[k].on), steps = st[k] && STEP_STOPS.indexOf(+st[k].steps) >= 0 ? +st[k].steps : (k === "heun" ? 64 : 32);
      return '<label class="also-row' + (on ? " is-on" : "") + '"><input type="checkbox" data-also="' + k + '"' + (on ? " checked" : "") + ' /> <span translate="no">' + SOLVER_NAMES[k] + "</span>" +
        '<select data-also-steps="' + k + '" aria-label="' + escape(tr(SOLVER_NAMES[k] + " steps")) + '" translate="no">' +
        STEP_STOPS.map(function (n) { return '<option value="' + n + '"' + (n === steps ? " selected" : "") + ">" + n + "</option>"; }).join("") + "</select></label>";
    }).join("");
  }
  function saveAlso(k, patch) {
    var st = alsoState();
    st[k] = Object.assign({ on: false, steps: k === "heun" ? 64 : 32 }, st[k] || {}, patch);
    store("yue2.alsoSolvers", JSON.stringify(st));
    paintAlso();
  }
  if ($("alsoSolvers")) {
    $("alsoSolvers").addEventListener("change", function (e) {
      var c = e.target.closest("[data-also]"), sel = e.target.closest("[data-also-steps]");
      if (c) saveAlso(c.dataset.also, { on: c.checked });
      if (sel) saveAlso(sel.dataset.alsoSteps, { steps: +sel.value });
    });
    $("odeSolver").addEventListener("change", paintAlso);
    paintAlso();
  }
  function alsoRender(job) {
    var chain = Promise.resolve(), n = 0;
    job.takes.forEach(function (name) {
      job.also.forEach(function (a) {
        n++;
        chain = chain.then(function () {
          var take = findTake(name);
          if (!take) return null;
          return replayTake(take, Object.assign({ solver: a.solver, steps: a.steps, title: solverTitle(displayTitle(take), a.solver, a.steps) },
                                              a.nar_ladder ? { nar_ladder: true } : {}), SOLVER_NAMES[a.solver] + " " + a.steps);   // HERESY 1768: as the run went
        }).catch(function (e) { toast(e.message, "bad"); });
      });
    });
    toast(tr("Then each take again with " + job.also.map(function (a) { return SOLVER_NAMES[a.solver] + " " + a.steps; }).join(", ") +
             ": the same music and sound seed, only the solver and its steps differ (" + n + " in the queue)"));
    return chain;
  }

  function replayTake(take, change, what) {
    return getRequest(take).then(function (req) {
      if (!req.semantic_tokens || !String(req.semantic_tokens).trim()) {
        throw new Error("This take's request carries no music codes, so it cannot be re-rendered");
      }
      var body = Object.assign({}, req);
      delete body.plan_only;
      if (!change.nar_ladder) delete body.nar_ladder;   // HERESY 1768: the player re-renders on the standard decode; the Creator's Also render keeps its own
      body.lm_batch_size = 1;
      body.synth_batch_size = 1;
      Object.keys(change).forEach(function (key) { body[key] = change[key]; });
      body.parent = take.session ? "" : take.name;
      if (!change.title) body.title = displayTitle(take);
      return submitJob(body, { kind: "replay", title: body.title, parent: take.name, what: what });
    }).then(function (job) {
      paintDecodeSwitch();
      paintSoundSwitch();
      return job;
    });
  }

  /* ------------------------------------------------------ library actions */

  function replaceTake(entry) {
    STATE.takes = STATE.takes.map(function (t) { return t.name === entry.name ? entry : t; });
    STATE.session = STATE.session.map(function (t) { return t.name === entry.name ? entry : t; });
    if (STATE.take && STATE.take.name === entry.name) {
      STATE.take = entry;
      paintTakeHead();
      paintTakeDownloads();   // named after the song: a rename renames them
    }
    if (STATE.playerTake && STATE.playerTake.name === entry.name) {
      STATE.playerTake = entry;
      $("playbarTitle").textContent = displayTitle(entry);
      $("playbarTitle").setAttribute("translate", "no");   // HERESY 1166: a title and its style are the user's
    }
    paintLibrary();
    paintCoverTakes();
  }

  function updateTake(take, change) {
    if (take.session) {
      var copy = Object.assign({}, take, change);
      replaceTake(copy);
      return Promise.resolve(copy);
    }
    return post("/library/update?name=" + encodeURIComponent(take.name), change).then(function (entry) {
      var fresh = entry && entry.name ? entry : Object.assign({}, take, change);
      replaceTake(fresh);
      return fresh;
    });
  }

  function toggleFavorite(take) {
    // HERESY 1802: lit at the click and held over a list the lab read before it (a like's answer put it out again, 10 s at times)
    var HC0 = window.HeresyCollection, want = !take.favorite, mark = HC0 && HC0.markFavorite && !take.session;
    if (mark) HC0.markFavorite(take.name, want);
    return updateTake(take, { favorite: want }).then(function (entry) {
      var HC = window.HeresyCollection;                 // HERESY 1105: the Librarian's cards follow at once
      if (HC && HC.markFavorite) HC.markFavorite(take.name, !!entry.favorite);
      toast(entry.favorite ? "Kept as a favourite: " + displayTitle(entry) : "Removed from favourites: " + displayTitle(entry));
    }).catch(function (error) { if (mark) HC0.markFavorite(take.name, !want); toast(error.message, "bad"); });
  }

  // HERESY 1049: a rename from anywhere (the Librarian's cards and sheet, the menu); true when it changed
  function renameTake(name, text) {
    var take = findTake(name), c = cleanTitle(text);
    if (!take || !c.text || c.text === displayTitle(take)) return Promise.resolve(false);
    return updateTake(take, { title: c.text }).then(function () {
      toast("Renamed to " + c.text + (c.removed ? " (hidden characters taken out)" : ""));
      return true;
    });
  }
  function startRename() {
    var take = STATE.take;
    if (!take || $("renameInput")) return;
    var heading = $("takeTitle"), input = document.createElement("input");
    input.type = "text";
    input.id = "renameInput";
    input.className = "title-edit";
    input.value = displayTitle(take);
    input.maxLength = 80;   // HERESY 1040
    input.setAttribute("aria-label", "New title");
    heading.classList.add("is-hidden");
    heading.parentNode.insertBefore(input, heading.nextSibling);
    input.focus();
    input.select();
    var finished = false;
    function finish(save) {
      if (finished) return;
      finished = true;
      var value = cleanTitle(input.value).text;   // HERESY 1040
      input.remove();
      heading.classList.remove("is-hidden");
      if (!save || !value || value === displayTitle(take)) return;
      updateTake(take, { title: value }).then(function () { toast("Renamed to " + value); })
        .catch(function (error) { toast(error.message, "bad"); });
    }
    input.addEventListener("keydown", function (event) {
      if (event.key === "Enter") { event.preventDefault(); finish(true); }
      if (event.key === "Escape") { event.preventDefault(); finish(false); }
    });
    input.addEventListener("blur", function () { finish(true); });
  }

  function clearTakeView() {
    STATE.take = null;
    $("takeBody").classList.add("is-hidden");
    $("takeEmpty").classList.remove("is-hidden");
    $("takeTitle").textContent = "Smithery Is Idle";   // HERESY 1167: the frame shows a run or a chosen take
    $("takeTitle").setAttribute("translate", "yes");
    $("takeEyebrow").textContent = "no run yet";
    $("takeActions").innerHTML = "";
    paintRunReturn();
  }

  function clearPlayer() {
    STATE.playerTake = null;
    audio.pause();
    audio.removeAttribute("src");
    delete audio.dataset.url; HOLD.url = ""; HOLD.want = false; holdPaint();   // HERESY 1746
    audio.load();
    STATE.peaks = null;
    $("playbar").classList.add("is-empty");
    $("playbarTitle").textContent = "Nothing loaded";
    $("playbarTitle").setAttribute("translate", "yes");
    paintCover(null);
    $("timeNow").textContent = "0:00";
    $("timeTotal").textContent = "0:00";
    drawWave();
    paintPlayHere();
    paintMp3();
  }

  function removeTake(take) {
    STATE.takes = STATE.takes.filter(function (t) { return t.name !== take.name; });
    STATE.session = STATE.session.filter(function (t) { return t.name !== take.name; });
    delete STATE.requests[take.name];
    delete STATE.peakCache[takeAudioUrl(take)];
    if (take.session && take.url) URL.revokeObjectURL(take.url);
    if (STATE.playerTake && STATE.playerTake.name === take.name) clearPlayer();
    if (STATE.take && STATE.take.name === take.name) clearTakeView();
  }

  function deleteTake(take, confirmed, quiet) {
    if (window.HeresyCollection && window.HeresyCollection.takeLocked(take.name)) {   // HERESY 1070
      toast("\u201c" + displayTitle(take) + "\u201d is in a workspace that locks its takes: unlock it first (right-click on the workspace)", "bad");
      return Promise.resolve(false);
    }
    if (window.HeresyCollection && window.HeresyCollection.isProtected && window.HeresyCollection.isProtected(take.name)) {   // HERESY 1368
      toast("\u201c" + displayTitle(take) + "\u201d is protected: take its protection off first (its shield, or right-click)", "bad");
      return Promise.resolve(false);
    }
    var asked = confirmed ? Promise.resolve(true)
      : window.HeresyDialog.confirm("Delete \u201c" + displayTitle(take) + "\u201d and its files?\n\nThis is for good. To keep a way back, move it to the trash from its menu (right-click).", { danger: true });
    return asked.then(function (ok) {
      if (!ok) return false;
      return (take.session ? Promise.resolve() : post("/library/delete?name=" + encodeURIComponent(take.name))).then(function () { return true; });
    }).then(function (went) {
      if (!went) return false;
      removeTake(take);
      if (!quiet) { paintLibrary(); paintCoverTakes(); }
      if (!confirmed) toast("Take deleted");
      return true;
    }).catch(function (error) { toast(error.message, "bad"); return false; });
  }

  function paintDlNames() { $("dlNamesDate").setAttribute("aria-checked", libraryNames() ? "true" : "false"); }
  $("dlNamesDate").addEventListener("click", function () {
    store("yue2.dlNames", libraryNames() ? null : "library");
    paintDlNames();
    closeMenus();
    paintTakeDownloads();
    paintLibrary();
    toast(libraryNames() ? "Downloads carry the date: 20260927-183418-song-title.wav" : "Downloads are named after the song: Song Title.wav");
  });
  paintDlNames();

  $("deleteNonFav").addEventListener("click", function () {
    closeMenus();
    // HERESY 1368: the protected pass by, said
    var HCd = window.HeresyCollection, shielded = function (t) { return !!(HCd && HCd.isProtected && HCd.isProtected(t.name)); };
    var spared = STATE.takes.filter(function (t) { return !t.favorite && shielded(t); }).length;
    var doomed = STATE.takes.filter(function (t) { return !t.favorite && !shielded(t); });
    var kept = STATE.takes.length - doomed.length - spared;
    if (!doomed.length) return toast(!STATE.takes.length ? "The library is empty" : spared ? "Every take is a favourite or protected; nothing to delete" : "Every take is a favourite; nothing to delete");
    var chain, count = 0;
    window.HeresyDialog.confirm("Delete " + doomed.length + (doomed.length === 1 ? " take that is" : " takes that are") +
                        " not a favourite, with their files?\n\n" + kept + (kept === 1 ? " favourite stays." : " favourites stay.") + " This is for good." +
                        (spared ? "\n\n" + (spared === 1 ? "1 protected take stays too." : spared + " protected takes stay too.") : ""), { danger: true }).then(function (ok) {
      if (!ok) return;
      chain = Promise.resolve();
      doomed.forEach(function (take) {
        chain = chain.then(function () { return deleteTake(take, true, true).then(function (ok) { if (ok) count++; }); });
      });
      return chain.then(function () {
      paintLibrary();
      paintCoverTakes();
      toast("Deleted " + count + (count === 1 ? " take; " : " takes; ") + kept + (kept === 1 ? " favourite kept" : " favourites kept"), "good");
      if (spared) toast(spared === 1 ? "1 protected take kept" : spared + " protected takes kept");
      });
    });
  });

  $("refreshLib").addEventListener("click", function () {
    closeMenus();
    refreshLibrary().then(function () { toast("Library read again: " + STATE.takes.length + " takes"); })
      .catch(function (error) { toast(error.message, "bad"); });
  });

  // HERESY 1132: the refined takes (the lab's index), read on entering the Refiner and when its tree changes
  STATE.refined = {};
  function refreshRefined() {
    return api("/lab/refined").then(function (d) { STATE.refined = (d && d.refined) || {}; paintLibrary(); }).catch(function () { /* the lab away */ });
  }
  var refinedSeen = "";
  window.addEventListener("heresy-derived", function (e) {          // a branch landed or started: the column follows
    var key = e.detail ? e.detail.name + ":" + (e.detail.files || []).length : "";
    if (key !== refinedSeen) { refinedSeen = key; refreshRefined(); }
  });
  $("refinedFilter").addEventListener("click", function () {
    store("yue2.postAll", recall("yue2.postAll") === "1" ? null : "1");
    paintLibrary();
  });
  // F5 in the Refiner: the take it was refining comes back (Viktor: «обновил страницу и потерялся полностью»)
  var postRestored = false;
  function restorePostTake() {
    if (postRestored || document.body.dataset.tab !== "post") return;
    var name = recall("yue2.postTake");
    if (!name || !findTake(name)) return;
    postRestored = true;
    if (!STATE.take || STATE.take.name !== name) openTake(name);
  }

  $("favFilter").addEventListener("click", function () {
    STATE.favOnly = !STATE.favOnly;
    store("yue2.favOnly", STATE.favOnly ? "1" : null);
    paintLibrary();
  });

  /* -------------------------------------------------------------- player */

  var audio = $("audio");
  var pendingSeek = null;   // the A/B switch's "same bar" handler, while its file loads

  // The player holds its own song, apart from the song page on screen.
  STATE.playerTake = null;

  function loadPlayer(take, keepTime) {
    var at = audio.currentTime, wasPlaying = !audio.paused;
    var url = takeAudioUrl(take);
    STATE.playerTake = take;
    if (!playerHolds(url)) {                           // HERESY 1746: the take's own address, its stream, its blob or its whole on the way
      if (!keepTime) playWanted = false;                // HERESY 1361: another take, not yet asked to play (A/B keeps the play state)
      audio.dataset.url = url;                          // HERESY 1746
      holdWhole(take, url);                             // HERESY 1737 · 1746: held, from the page at once; else the whole comes first (a slow line: the stream meanwhile)
      if (pendingSeek) { audio.removeEventListener("loadedmetadata", pendingSeek); pendingSeek = null; }
      if (keepTime) {
        // A/B between versions of the same music: same bar, same play state
        pendingSeek = function () {
          audio.removeEventListener("loadedmetadata", pendingSeek);
          pendingSeek = null;
          try { audio.currentTime = Math.min(at, audio.duration || at); } catch (error) { /* not seekable yet */ }
          if (wasPlaying) audio.play().catch(function () {});
        };
        audio.addEventListener("loadedmetadata", pendingSeek);
      } else {
        $("timeNow").textContent = "0:00";
        paintPlayButton(false);
      }
    }
    $("playbar").classList.remove("is-empty");
    // just the name (HERESY 1260, Viktor 09.10.2026, of the style on hover: «Это лишнее. И так всё под рукой»)
    $("playbarTitle").textContent = displayTitle(take);
    $("playbarTitle").setAttribute("translate", "no");
    paintRate();   // HERESY 1042
    paintCover(take);                                       // HERESY 1106: the subtitle and the cover tile
    paintMp3();
    $("timeTotal").textContent = clock(take.seconds);
    paintPlStrip();                                         // HERESY 1731: the playlist's strip, the take before and after
    loadPeaks(take);
    paintDecodeSwitch();
    paintPlayHere();
  }

  // "Play this song" shows when the page and the player hold different songs.
  function paintPlayHere() {
    var button = $("playHere");
    // HERESY 1168 (Viktor 06.10.2026: «PLAY THIS SONG не должна появляться, когда крутится синтез. А вот когда рендер
    // закончился, она наоборот - исчезла, а не появилась. Автоматический плей был выключен»): it offers the take shown
    // when that take is not playing; a run being watched has no take yet; a take the idle player only holds is offered
    // HERESY 1628: the take shown keeps its button, its place held: Play, or Pause while it plays; hidden only with no take shown
    if (button) {
      var mine = !!(STATE.take && STATE.playerTake && STATE.playerTake.name === STATE.take.name), on = mine && isPlaying(), want = on ? "pause" : "play";
      button.classList.toggle("is-hidden", !STATE.take);
      if (button.dataset.ui !== want) { button.dataset.ui = want; if (window.HeresyIcons) button.innerHTML = window.HeresyIcons.ui(want); }
      if (!button.dataset.tipPlay) button.dataset.tipPlay = button.dataset.tip || "";
      button.dataset.tip = on ? tr("Pause") : button.dataset.tipPlay;
      button.setAttribute("aria-label", tr(on ? "Pause" : "Play this song"));
      button.setAttribute("aria-pressed", on ? "true" : "false");
    }
    if ($("takeMore")) $("takeMore").classList.toggle("is-hidden", !STATE.take);   // HERESY 1488: a run being watched has no take's menu
  }

  // Put a song in the player and start it: "Play this song" (right after the title, on the left)
  // and a double-click in the list
  // HERESY 1064 (Viktor: "would not play" on the road): a refused play() says why. A load cut short by
  // the next click is nothing; the browser waiting for a click says so; a lost connection says so; only
  // a file it cannot decode is "would not play".
  function playRefused(e) {
    var name = e && e.name;
    if (name === "AbortError") return;
    if (name === "NotAllowedError") return toast("The browser waits for a click before it plays: press ▶", "bad");
    var err = audio.error && audio.error.code;
    if (err === 2) return toast("The connection dropped while the song was loading: press ▶ again", "bad");
    toast(err === 4 || name === "NotSupportedError" ? "Your browser would not play this file" : "It did not start: " + (e && e.message || "press ▶ again"), "bad");
  }
  function playNow(take) {
    if (!take) return;
    loadPlayer(take, false);
    audio.play().catch(playRefused);
    paintPlayHere();
  }
  $("playHere").addEventListener("click", function () {   // HERESY 1628: Pause on the take playing; on again from where it stood
    var mine = !!(STATE.take && STATE.playerTake && STATE.playerTake.name === STATE.take.name);
    if (mine && isPlaying()) return void audio.pause();
    if (mine && audio.getAttribute("src") && !audio.ended && audio.currentTime > 0) return void audio.play().catch(playRefused);
    playNow(STATE.take);
  });
  $("takeEyebrow").addEventListener("click", function (event) {   // HERESY 1026
    var b = event.target.closest(".take-id");
    if (!b) return;
    var text = b.textContent, done = function () { toast("Copied: " + text); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, function () { pick(b); });
    else pick(b);
    function pick(el) {   // over plain http the clipboard API is off: select it for Ctrl+C
      var r = document.createRange(); r.selectNodeContents(el);
      var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
      try { if (document.execCommand("copy")) { done(); return; } } catch (e) { /* fall through */ }
      toast("Selected: press Ctrl+C");
    }
  });

  function togglePlay() {
    if (!audio.getAttribute("src") && !(HOLD.url && HOLD.url === audio.dataset.url) && STATE.take) loadPlayer(STATE.take, false);
    if (!audio.getAttribute("src") && !(HOLD.url && HOLD.url === audio.dataset.url)) return;   // HERESY 1746: a take coming whole is asked to play, not dropped
    if (audio.paused) audio.play().catch(playRefused);
    else audio.pause();
  }

  $("playBtn").addEventListener("click", togglePlay);
  // HERESY 1258 (Viktor 08.10.2026: «Плеер при F5 не держит последний трек и его позицию. Ты фиксил, но не работает как
  // ожидалось»): F5 in the Librarian reads the list again and never stopped the music, but elsewhere a reload is a reload
  // (1202 asks first), and the player kept nothing of itself. Now its take, its place and whether it played are kept in this
  // browser (not in the settings file: they change every second) as it pauses or seeks, every two seconds while it plays and
  // as the page goes; the first list after the reload puts them back, and it plays on where the browser lets it unasked
  // (else the browser's «press ▶»). Kept only once that first list has been read, so the page's start never wipes them
  var PLAYER_AT = "ruach.playerAt", playerKeptAt = 0, playerBack = false;
  function keepPlayer() {
    if (!playerBack) return;
    var t = STATE.playerTake;
    try {
      if (!t || t.session || !audio.getAttribute("src")) localStorage.removeItem(PLAYER_AT);
      else localStorage.setItem(PLAYER_AT, JSON.stringify({ name: t.name, at: Math.round((audio.currentTime || 0) * 10) / 10, playing: isPlaying() }));
    } catch (e) { /* a private window keeps nothing */ }
  }
  audio.addEventListener("timeupdate", function () { if (Date.now() - playerKeptAt > 2000) { playerKeptAt = Date.now(); keepPlayer(); } });
  ["pause", "ended", "seeked", "emptied"].forEach(function (ev) { audio.addEventListener(ev, keepPlayer); });
  window.addEventListener("pagehide", keepPlayer);
  window.addEventListener("beforeunload", keepPlayer);
  function restorePlayer() {
    if (playerBack) return;
    playerBack = true;
    var kept = null;
    try { kept = JSON.parse(localStorage.getItem(PLAYER_AT) || "null"); } catch (e) { kept = null; }
    var take = kept && kept.name ? findTake(kept.name) : null;
    if (!take || isPlaying()) return;
    if (!STATE.playerTake || STATE.playerTake.name !== take.name) loadPlayer(take, false);
    var at = +kept.at || 0;
    var back = function () {
      audio.removeEventListener("loadedmetadata", back);
      try { audio.currentTime = Math.min(at, Math.max(0, (audio.duration || at) - 0.5)); } catch (e) { /* not seekable yet */ }
      paintTimes();
      if (kept.playing) audio.play().catch(playRefused);
    };
    if (audio.readyState >= 1) back(); else audio.addEventListener("loadedmetadata", back);
  }
  ["play", "pause", "ended", "emptied"].forEach(function (ev) {   // HERESY 1042: the Librarian's buttons follow the player
    audio.addEventListener(ev, function () { if (window.HeresyCollection) window.HeresyCollection.paintPlaying(); });
  });

  // Volume survives reloads; a browser remembering nothing is a small annoyance
  // people notice every single time.
  var storedVolume = recall("yue2.volume");
  // HERESY 1700 (Viktor 21.10.2026: «к регулятору звука через стопорный барьер усиление в промежутке 100-150? Постусиление»): up to 1.5 kept; the element
  // plays at most 1, and a gain through the Web Audio graph does the rest. The graph is made the first time a boost is asked for, by a hand (a context
  // made without one stays suspended and the take would play silent), and only for the studio's own sound (a foreign source plays silent through it);
  // a limiter follows the gain only while it is above 1, so at 100 % nothing but the gain of 1 stands in the way
  var boost = { ctx: null, src: null, gain: null, lim: null, on: false, wired: false, want: 1 };
  function boostable() { try { return !audio.currentSrc || new URL(audio.currentSrc, location.href).origin === location.origin; } catch (e) { return false; } }
  function boostTo(g) {
    boost.want = g;
    if (!boost.ctx) {
      if (g <= 1 || !boostable()) return;
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        boost.ctx = new AC();
        boost.src = boost.ctx.createMediaElementSource(audio);
      } catch (e) { boost.ctx = null; return; }
      boost.gain = boost.ctx.createGain();
      boost.lim = boost.ctx.createDynamicsCompressor();
      boost.lim.threshold.value = -1; boost.lim.knee.value = 0; boost.lim.ratio.value = 20; boost.lim.attack.value = 0.002; boost.lim.release.value = 0.12;
      boost.src.connect(boost.gain);
    }
    if (boost.ctx.state === "suspended") boost.ctx.resume();
    boost.gain.gain.value = Math.max(1, g);
    var lim = g > 1;
    if (lim !== boost.on || !boost.wired) {
      try { boost.gain.disconnect(); boost.lim.disconnect(); } catch (e) { /* not wired yet */ }
      if (lim) { boost.gain.connect(boost.lim); boost.lim.connect(boost.ctx.destination); } else boost.gain.connect(boost.ctx.destination);
      boost.on = lim; boost.wired = true;
    }
  }
  window.ruachVolumeBoost = function () { return { want: boost.want, made: !!boost.ctx, gain: boost.gain ? boost.gain.gain.value : 1, limiter: boost.on }; };   // for the checks
  var wantVolume = storedVolume === null ? 1 : Math.min(1.5, Math.max(0, parseFloat(storedVolume) || 0));
  audio.volume = Math.min(1, wantVolume);
  boost.want = wantVolume;
  $("volume").value = wantVolume;
  $("volume").classList.toggle("is-boost", wantVolume > 1);
  if (wantVolume > 1) {   // a boost kept from before: it starts with the first touch of the page (until then 100 %)
    var wakeBoost = function () { document.removeEventListener("pointerdown", wakeBoost, true); document.removeEventListener("keydown", wakeBoost, true); boostTo(boost.want); };
    document.addEventListener("pointerdown", wakeBoost, true);
    document.addEventListener("keydown", wakeBoost, true);
  }

  // HERESY 1106: the take in the player: the style's first words under the title, a tile of its own colour for a cover
  // (until covers are drawn for takes); one hue from the name, so a take keeps its tile
  // HERESY 1120: artwork for takes (Viktor: «просто иконка в плеере, в карточке и в mp3 файле»). The lab draws it: a
  // prompt from the take's style and words (Qwen3-4B), the picture (Qwen-Image 2512; 1405: SDXL gone; 1428: Krea 2 gone). Asked for, never on its own.
  STATE.arts = {};
  STATE.artsUnseen = {};            // HERESY 1156: pictures whose named subject the critic did not find: guesses
  STATE.artsCredit = {};            // HERESY 1166: pictures someone made (a photograph from Commons): name -> {text, url}
  function artUnseen(name) { return !!(name && STATE.artsUnseen[name]); }
  function artUrl(name) { var v = name && STATE.arts[name]; return v ? "/lab/art?name=" + encodeURIComponent(name) + "&v=" + v : ""; }
  // HERESY 1155: asked again every 20 s while the page is in sight, so pictures drawn meanwhile (a batch, the API,
  // another browser) reach the cards and the menu says Redraw; nothing is repainted when nothing changed
  var artsSeen = "";
  function refreshArts() {
    return api("/lab/arts").then(function (d) {
      var arts = (d && d.arts) || {}, unseen = (d && d.unseen) || [], credits = (d && d.credits) || {};
      var seen = JSON.stringify([arts, unseen, credits]);
      if (seen === artsSeen) return;
      artsSeen = seen;
      STATE.arts = arts;
      STATE.artsCredit = credits;
      STATE.artsUnseen = {};
      unseen.forEach(function (n) { STATE.artsUnseen[n] = 1; });
      paintCover(STATE.playerTake);
      paintSession();
      var HC = window.HeresyCollection;
      if (HC && HC.paintArts) HC.paintArts();          // on the cards in place: a rename being typed survives
      if (window.HeresyInstruments && window.HeresyInstruments.paintArts) window.HeresyInstruments.paintArts();
    }).catch(function () { /* the lab is away: no artwork shown, nothing else changes */ });
  }
  setInterval(function () { if (document.visibilityState === "visible" && !STATE.running) refreshArts(); }, 20000);   // HERESY 1363: not while a song renders

  // HERESY 1155 (Viktor, 03.10.2026: «Клик открывает в новой вкладке. Сделай оверлеем. Не уходим из студии в другие окна
  // и вкладки, если не нужно»): the artwork over the page, the player left free below it. ‹ › and the arrow keys walk
  // the takes given (the cards shown, the sheet's instruments), ▶ plays the one shown; Esc, × or a click beside the
  // picture closes. Space still plays and pauses the player.
  var artView = null;
  function showArt(name, names) {
    var list = (names && names.length ? names : [name]).filter(function (n) { return !!artUrl(n); });
    if (!list.length) return;
    var at = Math.max(0, list.indexOf(name));
    if (artView) artView.close(true);
    var back = document.createElement("div"), before = document.activeElement;
    back.className = "hd-back art-back";
    back.innerHTML = '<figure class="art-fig" role="dialog" aria-modal="true" aria-label="The artwork" tabindex="-1">' +
      '<img class="art-img" alt="" draggable="false" translate="no" />' +
      '<figcaption class="art-cap"><button type="button" class="coll-play art-play" aria-label="Play"></button>' +
      '<span class="art-title"></span><span class="art-count"></span>' +
      // HERESY 1167 (Viktor: «Добавь в оверлей бокс обложек кнопку скачать. Мы же отключили браузерные меню»)
      '<a class="pb-btn art-dl" aria-label="Download the picture" data-tip="Download the picture (JPEG)">' +
        (window.HeresyIcons ? window.HeresyIcons.ui("download") : "⤓") + "</a>" +
      '<button type="button" class="pb-btn art-close" aria-label="Close" data-tip="Close (Esc)">✕</button></figcaption>' +
      '<p class="art-guess" hidden>≈ A guess: the painter does not know this instrument, and the critic did not find it in any of the pictures it drew.</p>' +
      '<p class="art-credit" hidden><span>Picture:</span> <a target="_blank" rel="noopener noreferrer" ' +
      'data-tip="The picture\'s page: its author and licence"><span translate="no"></span></a></p></figure>' +
      '<button type="button" class="art-step art-prev" aria-label="Previous" data-tip="Previous (←)">‹</button>' +
      '<button type="button" class="art-step art-next" aria-label="Next" data-tip="Next (→)">›</button>';
    document.body.appendChild(back);
    var img = back.querySelector(".art-img");
    // HERESY 1166 (Viktor: «при 1024 обложке попап растягивался до 1024x1024»): the overlay takes the picture's own size
    img.addEventListener("load", function () { back.style.setProperty("--art-n", Math.max(320, Math.min(1024, img.naturalWidth || 768)) + "px"); });
    function shown() { return list[at]; }
    function paintPlay() {
      var mine = STATE.playerTake && STATE.playerTake.name === shown() && !audio.paused;
      var b = back.querySelector(".art-play");
      // HERESY 1165 (Viktor: «В оверлее картинок сделай такие же эстетичные полые кнопки воспроизведения как и везде»)
      b.innerHTML = window.HeresyIcons ? window.HeresyIcons.ui(mine ? "pause" : "play") : (mine ? "❚❚" : "▶");
      b.classList.toggle("is-playing", !!mine);
      b.setAttribute("aria-label", mine ? "Pause" : "Play");
    }
    function paint() {
      var n = shown(), take = findTake(n);
      img.src = artUrl(n);
      img.alt = take ? displayTitle(take) : n;
      back.querySelector(".art-title").textContent = take ? displayTitle(take) : n;
      back.querySelector(".art-count").textContent = list.length > 1 ? (at + 1) + " / " + list.length : "";
      back.querySelector(".art-play").hidden = !take;
      var dl = back.querySelector(".art-dl");             // HERESY 1167: saved under the take's title
      dl.href = artUrl(n);
      dl.setAttribute("download", (take ? fileTitle(take) : n) + ".jpg");
      back.querySelector(".art-guess").hidden = !artUnseen(n);
      // HERESY 1166: a picture someone made says whose it is, and under which licence (its page one click away)
      var credit = STATE.artsCredit[n], line = back.querySelector(".art-credit"), link = line.querySelector("a");
      line.hidden = !credit;
      link.firstChild.textContent = credit ? credit.text : "";     // the credit is data, the tip is the page's own words
      if (credit && /^https?:\/\//i.test(credit.url || "")) link.href = credit.url; else link.removeAttribute("href");   // HERESY 1430: a web page's link only
      Array.prototype.forEach.call(back.querySelectorAll(".art-step"), function (b) { b.hidden = list.length < 2; });
      [at - 1, at + 1].forEach(function (i) { var u = artUrl(list[(i + list.length) % list.length]); if (u) new Image().src = u; });
      paintPlay();
    }
    function step(d) { at = (at + d + list.length) % list.length; paint(); }
    function close(now) {
      document.removeEventListener("keydown", key, true);
      audio.removeEventListener("play", paintPlay); audio.removeEventListener("pause", paintPlay);
      artView = null;
      back.classList.add("is-leaving");
      setTimeout(function () { back.remove(); }, now ? 0 : 120);
      if (before && before.focus) { try { before.focus({ preventScroll: true }); } catch (e) { /* gone */ } }
    }
    function key(e) {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
      else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && !e.ctrlKey && !e.altKey) {
        e.preventDefault(); e.stopPropagation();
        if (list.length > 1) step(e.key === "ArrowRight" ? 1 : -1);
      }
    }
    document.addEventListener("keydown", key, true);
    audio.addEventListener("play", paintPlay); audio.addEventListener("pause", paintPlay);
    back.addEventListener("click", function (e) {
      if (e.target === back || e.target.closest(".art-close")) return close();
      if (e.target.closest(".art-prev")) return step(-1);
      if (e.target.closest(".art-next")) return step(1);
      if (e.target.closest(".art-play")) {
        var take = findTake(shown());
        if (!take) return;
        if (STATE.playerTake && STATE.playerTake.name === take.name) togglePlay(); else playNow(take);
      }
    });
    artView = { close: close };
    paint();
    requestAnimationFrame(function () { back.classList.add("is-on"); back.querySelector(".art-fig").focus({ preventScroll: true }); });
  }
  $("pbCover").addEventListener("click", function () {
    if (STATE.playerTake && artUrl(STATE.playerTake.name)) showArt(STATE.playerTake.name);
  });
  // HERESY 1167 (Viktor: «Когда пошла генерация обложки, запрещай на том же треке повторный запуск процесса»): one drawing
  // a take at a time from this page: while its artwork is drawn or waits for a card, a second ask is told so and not sent
  // (the lab keeps one job a take anyway; the page started a second poller and a second pair of toasts). The lab now holds
  // a job that finds no card with room in its queue: the wait is said once.
  var ARTING = {};
  // HERESY 1167: Engine → Artwork: the painter this browser asks for (empty: the lab decides by the cards)
  (function () {
    var sel = $("artPainter");
    if (!sel) return;
    sel.value = recall("yue2.artPainter") || "";
    if (sel.selectedIndex < 0) sel.value = "";         // HERESY 1428: a Krea 2 painter kept from before: by the cards
    sel.addEventListener("change", function () {
      store("yue2.artPainter", this.value || null);
      toast(this.value ? "Artwork from now on: " + this.options[this.selectedIndex].textContent : "Artwork: the painter by the cards");
    });
    // HERESY 1338 (Viktor 10.10.2026: «в Engine не забудь прописать выборы всех генеративных art моделей»): the Qwen painters this
    // machine has, as the Artist room lists them, a cover painted with Lightning; each fine-tune of 2512 its own line
    // HERESY 1423: as measured on an RTX 3090 (13.10.2026), the prompt writer and the critic included (Q4 125 s, Q6 131 s)
    var SPEED = { "qwen2512-q4": "about 105 s a picture", "qwen2512-q6": "about 130 s a picture", "qwen2512-fp8": "about 95 s a picture", "qwen21": "about 2 min a picture" };   // HERESY 1428: Q4 and fp8 BASE measured 14.10.2026
    function qwenRows(list) {
      var have = {};
      Array.prototype.forEach.call(sel.options, function (o) { have[o.value] = 1; });
      (list || []).forEach(function (p) {
        if (!/^qwen/.test(p.key) || !p.ready) return;
        var tail = (p.key === "qwen21" ? " · not for a song that is sold" : p.lightning ? " · Lightning" : " · without Lightning (its file is not here): slow") +
          " · about " + Math.round((+p.need_mb || 0) / 1024) + " GB · " + SPEED[p.key];
        var rows = p.key === "qwen2512-fp8" ? (p.models || []).map(function (m) { return [p.key + ":" + m, "Qwen-Image 2512 · " + m.replace(/\.safetensors$/, "") + tail]; })
          : [[p.key, p.label + tail]];
        rows.forEach(function (r) {
          if (have[r[0]]) return;
          var o = document.createElement("option");
          o.value = r[0];
          o.textContent = r[1];
          sel.appendChild(o);
        });
      });
      var want = recall("yue2.artPainter") || "";      // a Qwen painter chosen before: its line is here now
      if (want && sel.value !== want && Array.prototype.some.call(sel.options, function (o) { return o.value === want; })) sel.value = want;
    }
    window.ruachArtPainters = function (list) { qwenRows(list); return Array.prototype.map.call(sel.options, function (o) { return [o.value, o.textContent]; }); };   // for the checks
    api("/lab/artist/painters").then(function (d) { qwenRows(d && d.painters); }).catch(function () { /* the lab later: by the cards stands */ });
  })();
  function drawArt(name, again, quiet) {
    var take = findTake(name), title = take ? displayTitle(take) : name;
    if (ARTING[name]) {
      toast(ARTING[name] === "wait" ? "Artwork for “" + title + "” already waits in the queue for a card"
        : "Artwork for “" + title + "” is being drawn already");
      return Promise.resolve();
    }
    ARTING[name] = "draw";
    if (!quiet) toast("Drawing artwork for “" + title + "”: a prompt from its style and words, then the picture (a minute or two)");
    var painter = recall("yue2.artPainter") || "";      // HERESY 1167: Engine → Artwork; empty: by the cards
    var ask = function (first) {
      return api("/lab/art/draw?name=" + encodeURIComponent(name) + (first && again ? "&again=1" : "") +
                 (first && painter ? "&painter=" + encodeURIComponent(painter) : "")).then(function (d) {
        if (d && (d.status === "queued" || d.status === "running")) {
          if (d.status === "queued" && d.waiting && ARTING[name] !== "wait") {
            ARTING[name] = "wait";
            // HERESY 1297: why it waits, the guard's own words (the cards' memory and what it needs), not only that it does
            toast("Artwork for “" + title + "” waits in the queue: " + String(d.waiting).replace(/\.\s*$/, "") + ". It starts by itself when a card has room");
          } else if (d.status === "running") {
            ARTING[name] = "draw";
          }
          return new Promise(function (ok) { setTimeout(ok, 3000); }).then(function () { return ask(false); });
        }
        return d;
      });
    };
    return ask(true).then(function (d) {
      return refreshArts().then(function () { if (!quiet) toast("Artwork for “" + title + "” is ready"); return d; });
    }).catch(function (e) {
      toast("No artwork: " + String(e.message).replace(/^no artwork:\s*/i, ""), "bad");   // HERESY 1297: the lab's error begins so too
      // HERESY 1297: a refusal (400: no card here can hold the painter) is said once; artMany stops there
      return { status: "failed", error: e.message, refused: e.status === 400 };
    }).then(function (d) { delete ARTING[name]; return d; });
  }
  // HERESY 1169 · 1235 (Viktor 08.10.2026: «Та же генерация обложек. На одну уходит до минуты в Krea 2 Muse. `Человече, ты запрашиваешь генерацию обложек на 00 треков одним залпом? Твоя видеокарта не схудится?`»): artwork for every checked take, asked first, then drawn one after another; a redraw keeps the old picture beside its take
  function artMany(list) {
    var have = list.filter(function (n) { return !!artUrl(n); }), none = list.filter(function (n) { return !artUrl(n); });
    var text = "Human, artwork for " + list.length + " takes in one volley? Won't your graphics card waste away?\n\nEach picture is about two minutes on a GPU (Qwen-Image 2512 with Lightning, the prompt and the look-over included): some " + (list.length * 2) + " minutes in all, drawn one after another; the studio stays yours meanwhile." +
      (have.length && none.length ? "\n\n" + have.length + " of them have artwork already: drawing for the " + none.length + " without leaves those as they are; redrawing all keeps each old picture beside its take." :
       have.length ? "\n\nAll of them have artwork already: each old picture is kept beside its take." : "");
    var opts = have.length && none.length ? { ok: "Draw the " + none.length + " without", alt: "Redraw all " + list.length, cancel: "Not now" }
      : have.length ? { ok: "Redraw all " + list.length, cancel: "Not now" } : { ok: "Draw all " + list.length, cancel: "Not now" };
    return window.HeresyDialog.confirm(text, opts).then(function (r) {
      if (!r) return;
      var todo = r === "alt" || !none.length ? list : none, done = 0, i = 0;
      toast("Drawing artwork for " + todo.length + " takes, one after another: about " + (todo.length * 2) + " minutes");
      var next = function () {
        if (i >= todo.length) { toast("Artwork drawn: " + done + " of " + todo.length, done === todo.length ? "good" : "bad"); return; }
        var n = todo[i++];
        return drawArt(n, !!artUrl(n), true).then(function (d) {
          if (d && d.status !== "failed") done++;
          if (d && d.refused) i = todo.length;           // HERESY 1297: the same refusal would come for every take
        }).then(next);
      };
      return next();
    });
  }
  function removeArtMany(list) {
    return window.HeresyDialog.confirm("Take the artwork off " + list.length + " takes?\n\nEach picture is kept beside its take, in artwork-removed/, and their MP3s lose it as their cover; the menu can paint new ones.", { ok: "Take them off", danger: true })
      .then(function (ok) {
        if (!ok) return;
        return list.reduce(function (p, n) { return p.then(function () { return api("/lab/art/remove?name=" + encodeURIComponent(n)).catch(function () {}); }); }, Promise.resolve())
          .then(refreshArts).then(function () { toast("The artwork is off " + list.length + " takes: kept beside each, in artwork-removed/"); });
      });
  }
  // HERESY 1156: the picture taken off its take (the lab keeps it in the take's artwork-removed/, and drops the MP3s made
  // with it as their cover)
  function removeArt(name) {
    var take = findTake(name), title = take ? displayTitle(take) : name;
    // HERESY 1169: asked first: the page has no way to put it back (only the take's folder keeps it)
    return window.HeresyDialog.confirm("Take the artwork off \u201c" + title + "\u201d?\n\nIt is kept beside the take, in artwork-removed/, and the take's MP3s lose it as their cover; the take's menu can paint a new one.",
      { ok: "Take it off", danger: true }).then(function (ok) { return ok ? removeArtNow(name, title) : null; });
  }
  function removeArtNow(name, title) {
    return api("/lab/art/remove?name=" + encodeURIComponent(name)).then(function () {
      return refreshArts().then(function () { toast("The artwork is off “" + title + "”: kept beside the take, in artwork-removed/"); });
    }).catch(function (e) { toast("Not removed: " + e.message, "bad"); });
  }
  // HERESY 1425 (Viktor 13.10.2026: «В Библиотекаре на треке с обложкой можно опцию "Скопировать обложку в одноимённые семплы"?»): the
  // take's cover to its namesakes (as Compare finds them); where some have one of their own, asked: theirs replaced (kept beside each), or
  // only the ones without
  function coverToNamesakes(take) {
    var others = namesakes(take).filter(function (t) { return t.name !== take.name; }), own = others.filter(function (t) { return artUrl(t.name); });
    if (!others.length) return Promise.resolve(null);
    var title = displayTitle(take), text = "Copy the cover of \u201c" + title + "\u201d to its namesakes?\n\n" +
      others.map(function (t) { return "\u00b7 " + displayTitle(t) + (artUrl(t.name) ? " \u2014 " + tr("has a cover of its own") : ""); }).join("\n");
    var asked = own.length
      ? window.HeresyDialog.confirm(text + "\n\n" + tr("A cover replaced is kept beside its take, in artwork-removed/."), { ok: "Replace theirs too", alt: own.length < others.length ? "Only the ones without" : undefined })
      : window.HeresyDialog.confirm(text, { ok: "Copy" });
    return asked.then(function (yes) {
      if (!yes) return null;
      return post("/lab/art/namesakes", { name: take.name, to: others.map(function (t) { return t.name; }), replace: yes === true && own.length > 0 }).then(function (d) {
        return refreshArts().then(function () {
          var n = (d.copied || []).length;
          toast(n ? tr("The cover copied to {0} of its namesakes").replace("{0}", n) : tr("No namesake took the cover"), n ? "good" : "");
        });
      }).catch(function (e) { toast(e.message, "bad"); });
    });
  }
  window.ruachCoverToNamesakes = coverToNamesakes;
  window.HeresyArt = { url: artUrl, draw: drawArt, refresh: refreshArts, show: showArt, unseen: artUnseen, remove: removeArt, many: artMany };
  // HERESY 1136: the studio's version (VERSION, through the API) in Engine → About
  api("/api/v1").then(function (d) { if (d && d.studio && $("studioVersion")) $("studioVersion").textContent = d.studio; }).catch(function () {});
  setTimeout(refreshArts, 1200);

  function paintCover(take) {
    var sub = take && take.style ? String(take.style).split(/[.\n]/)[0].trim() : "";
    $("playbarSub").textContent = sub.length > 110 ? sub.slice(0, 108) + "…" : sub;
    var h = 0, n = take ? take.name : "";
    for (var i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) % 360;
    $("pbCover").style.background = take ? "linear-gradient(135deg, hsl(" + h + " 32% 52%), hsl(" + ((h + 48) % 360) + " 30% 30%))" : "";
    var art = take ? artUrl(take.name) : "";                     // HERESY 1120: the artwork, when the take has one
    $("pbCover").classList.toggle("has-art", !!art);
    if (art) $("pbCover").style.background = "center / cover no-repeat url(\"" + art + "\")";
  }
  function paintVolume() {
    var level = audio.muted ? 0 : Math.max(audio.volume, boost.want > 1 ? boost.want : 0);   // HERESY 1700: past 100 % the boost
    var HI = window.HeresyIcons;
    if (HI && HI.ui) $("muteGlyph").innerHTML = HI.ui(level === 0 ? "vol-off" : (level < 0.5 ? "vol-lo" : "vol-hi"));
    else $("muteGlyph").textContent = level === 0 ? "🔇" : (level < 0.5 ? "🔉" : "🔊");
    $("volume").value = level;
  }

  // HERESY 1700: the detent: a drag that starts below 100 % stops there; one that starts at it goes on into the boost (the keys step through it)
  var volFrom = null;
  $("volume").addEventListener("pointerdown", function () { volFrom = parseFloat(this.value); });
  document.addEventListener("pointerup", function () { volFrom = null; });
  $("volume").addEventListener("input", function () {
    var v = parseFloat(this.value);
    if ((volFrom !== null && volFrom < 1 && v > 1) || (v > 1 && !boostable())) { v = 1; this.value = "1"; }
    audio.volume = Math.min(1, v);
    audio.muted = v === 0;
    boostTo(v);
    store("yue2.volume", String(v));
    this.classList.toggle("is-boost", v > 1);
    this.setAttribute("aria-valuetext", Math.round(v * 100) + " %");
    paintVolume();
  });

  $("muteBtn").addEventListener("click", function () {
    audio.muted = !audio.muted;
    if (!audio.muted && audio.volume === 0) audio.volume = 0.7;
    paintVolume();
  });

  paintVolume();

  // HERESY 1101: the playback speed, kept like the volume. A new source resets playbackRate to the default rate,
  // so both are set; the browser keeps the pitch (preservesPitch is on by default).
  function setSpeed(v) {
    v = Math.min(2, Math.max(0.5, parseFloat(v) || 1));
    audio.defaultPlaybackRate = v; audio.playbackRate = v;
    $("playSpeed").value = String(v);
    $("playSpeed").classList.toggle("is-on", v !== 1);
    store("yue2.speed", v === 1 ? null : String(v));
  }
  setSpeed(recall("yue2.speed") || 1);
  $("playSpeed").addEventListener("change", function () { setSpeed(this.value); });
  audio.addEventListener("loadedmetadata", function () { if (audio.playbackRate !== audio.defaultPlaybackRate) audio.playbackRate = audio.defaultPlaybackRate; });
  // The play button's glyph, its state (the DMM theme draws icons from it) and its label for screen readers
  // HERESY 1111: the system's media keys, a headset's buttons and the desktop's media panel drive the player
  function paintSession() {
    if (!("mediaSession" in navigator) || !window.MediaMetadata) return;
    var t = STATE.playerTake;
    try {
      var art = t ? artUrl(t.name) : "";
      navigator.mediaSession.metadata = t ? new MediaMetadata({ title: displayTitle(t), artist: "Ruach Studio",
        album: t.style ? String(t.style).split(/[.\n]/)[0].slice(0, 80) : "",
        artwork: art ? [{ src: location.origin + art, sizes: "768x768", type: "image/jpeg" }] : [] }) : null;
      navigator.mediaSession.playbackState = t ? (isPlaying() ? "playing" : "paused") : "none";
    } catch (e) { /* an old browser */ }
  }
  if ("mediaSession" in navigator) {
    [["play", function () { audio.play().catch(function () {}); }], ["pause", function () { audio.pause(); }],
     ["previoustrack", function () { stepTake(-1); }], ["nexttrack", function () { stepTake(1); }],
     ["seekbackward", function (d) { audio.currentTime = Math.max(0, audio.currentTime - ((d && d.seekOffset) || 5)); }],
     ["seekforward", function (d) { audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + ((d && d.seekOffset) || 5)); }],
     ["seekto", function (d) { if (d && isFinite(d.seekTime)) audio.currentTime = d.seekTime; }]].forEach(function (h) {
      try { navigator.mediaSession.setActionHandler(h[0], h[1]); } catch (e) { /* not this one here */ }
    });
  }
  function paintPlayButton(playing) {
    $("playGlyph").textContent = playing ? "❚❚" : "▶";
    $("playBtn").classList.toggle("is-playing", playing);
    $("playBtn").setAttribute("aria-label", playing ? "Pause" : "Play");
  }
  audio.addEventListener("play", function () {
    paintPlayButton(true); markPlaying(); paintSession(); paintPlayHere();
    var HC = window.HeresyCollection;                   // HERESY 1162: heard once, fresh no more
    if (HC && HC.markPlayed && STATE.playerTake && !STATE.playerTake.session) HC.markPlayed(STATE.playerTake.name);
  });
  audio.addEventListener("loadedmetadata", function () { paintSession(); paintTimes(); });   // HERESY 1111
  audio.addEventListener("pause", function () { paintPlayButton(false); markPlaying(); paintSession(); paintPlayHere(); });   // HERESY 1168
  // HERESY 1361 (TODO.md: «A take that does not play on late in the long page test (buffered at readyState 1)»): a take asked to play whose
  // sound is all here yet that stays short of playing (readyState under 3, its time standing) for 4 s is loaded again in its place and
  // asked once more; a second time it is paused and said. Seen only late in the long page test (the media pipeline holding a take it
  // had whole, not understood); a slow line is not this (its sound is not all here yet) and waits as it did
  var stall = { timer: 0, tried: "" };
  var playWanted = false;                              // asked to play: the play event says it, a pause event or another take ends it
  audio.addEventListener("play", function () { playWanted = true; });
  audio.addEventListener("pause", function () { playWanted = false; });
  function watchStart() {
    clearTimeout(stall.timer);
    var name = STATE.playerTake ? STATE.playerTake.name : "", t0 = audio.currentTime;
    stall.timer = setTimeout(function () {
      if (audio.paused || audio.readyState >= 3 || Math.abs(audio.currentTime - t0) > 0.05 || !STATE.playerTake || STATE.playerTake.name !== name) return;
      var b = audio.buffered, d = audio.duration;
      if (!(b.length && isFinite(d) && b.end(b.length - 1) >= d - 0.5)) return;   // still coming: a slow line waits
      if (stall.tried === name) { audio.pause(); toast("The take would not start: press \u25b6 again", "bad"); return; }
      stall.tried = name;
      console.warn("[player] " + name + ": its sound all here, readyState " + audio.readyState + ", not playing: loaded again");
      var at = audio.currentTime;
      audio.load();
      try { audio.currentTime = at; } catch (e) { /* not seekable yet */ }
      audio.play().catch(playRefused);
      watchStart();
    }, 4000);
  }
  audio.addEventListener("play", watchStart);
  ["playing", "pause", "emptied"].forEach(function (ev) { audio.addEventListener(ev, function () { clearTimeout(stall.timer); }); });
  window.ruachPlayerChecks = { stall: stall, listenOff: function (v) { if (v !== undefined) STATE.listenOff = !!v; return !!STATE.listenOff; } };   // for the checks
  audio.addEventListener("ended", function () {
    if (EARLY.part && audio.currentSrc === EARLY.part.src) return void earlyRanOut();   // HERESY 1803: what had come ran out, not the take
    paintPlayButton(false); markPlaying();
    if (repeatMode() === "one") { audio.currentTime = 0; audio.play().catch(function () {}); return; }   // HERESY 1106
    if (playOn() || repeatMode() === "all" || STATE.playZone === "playlist") stepTake(1);   // HERESY 1731: a playlist plays on
  });

  // HERESY 1009: the takes in the order the list shows them, newest on top: "next"
  // goes down, into the history. A card that shows the playing take follows it.
  // HERESY 1052 (Viktor): play-on and ⏮⏭ stay in the zone the playing started from: the Librarian
  // as its search and filters show it now, or the takes column as its search shows it
  function listOrder() {
    var HC = window.HeresyCollection;
    if (STATE.playZone === "playlist" && HC && HC.playlist) return HC.playlistOrder ? HC.playlistOrder(STATE.playerTake && STATE.playerTake.name) : HC.playlist();   // HERESY 1731; 1814: «Play only»
    if (STATE.playZone === "collection" && HC && HC.order && HC.loaded()) return HC.order();
    var seen = {}, names = [];
    all("#libList .take[data-name]").forEach(function (card) {
      if (!seen[card.dataset.name]) { seen[card.dataset.name] = true; names.push(card.dataset.name); }
    });
    return names;
  }
  function stepTake(dir) {
    var names = listOrder(), from = STATE.playerTake ? names.indexOf(STATE.playerTake.name) : -1;
    var name = from < 0 ? (dir > 0 ? names[0] : null) : names[from + dir];
    // HERESY 1106: shuffle picks any other take of the list for "next"; repeat-all goes round the list
    if (dir > 0 && shuffleOn() && names.length > 1 && STATE.playZone !== "playlist") { /* HERESY 1737: the playlist's own order */ var k; do { k = Math.floor(Math.random() * names.length); } while (k === from); name = names[k]; }
    else if (!name && repeatMode() === "all" && names.length && from >= 0) name = dir > 0 ? names[0] : names[names.length - 1];
    var take = name ? findTake(name) : null;
    // HERESY 1169 (Viktor: «если нет предыдущего трека в списке - перемотка на начало текущего»)
    if (!take && dir < 0 && from >= 0 && audio.getAttribute("src")) { audio.currentTime = 0; return; }
    if (!take) { if (dir > 0 && from >= 0) toast("The end of the list"); return; }
    var follow = STATE.take && STATE.playerTake && STATE.take.name === STATE.playerTake.name;
    loadPlayer(take, false);
    audio.play().catch(playRefused);                   // HERESY 1361: a refusal on the way to the next take is said, not swallowed
    if (follow) openTake(take.name);
  }
  function playOn() { return recall("yue2.playOn") !== "off"; }

  // HERESY 1731 (Viktor 22.10.2026: «при активном плейлисте добавляем нижнюю полоску тонкую в плеер… три колонки 5+2+5»): the take before, the
  // playlist's place, the take after; the names a click to play, × leaves the playlist (the player lifts back)
  function paintPlStrip() {
    var HC = window.HeresyCollection, el = $("plStrip");
    if (!el) return;
    var names = HC && HC.playlistOrder ? HC.playlistOrder(STATE.playerTake && STATE.playerTake.name) : HC && HC.playlist ? HC.playlist() : [], at = STATE.playerTake ? names.indexOf(STATE.playerTake.name) : -1;   // 1814
    var on = STATE.playZone === "playlist" && at >= 0;
    el.hidden = !on;
    document.documentElement.classList.toggle("pl-on", on);
    if (!on) return;
    var round = repeatMode() === "all", prev = names[at - 1] || (round ? names[names.length - 1] : ""), next = names[at + 1] || (round ? names[0] : "");
    var said = function (n) { var t = n ? findTake(n) : null; return t ? displayTitle(t) : ""; };
    $("plPrev").textContent = prev ? "← " + said(prev) : ""; $("plPrev").dataset.name = prev || ""; $("plPrev").disabled = !prev;
    $("plNext").textContent = next ? said(next) + " →" : ""; $("plNext").dataset.name = next || ""; $("plNext").disabled = !next;
    $("plMid").textContent = "Playlist · " + (at + 1) + " / " + names.length;
    var xs = xfSeconds(); $("plXfN").textContent = xs ? "\u22c8 " + xs + " s" : ""; $("plXfN").hidden = !xs;   // HERESY 1737
  }
  // HERESY 1814 (Plenio's «Up next»): in a playlist take's last 12 seconds, the next one's card above the player: its cover, its title, the seconds
  // left; a click plays it now. A take shorter than half a minute, a pause or the end of the list shows none
  function paintUpNext() {
    var el = $("upNext"), next = $("plNext") && $("plNext").dataset.name, d = audio.duration, left = d - audio.currentTime;
    var on = STATE.playZone === "playlist" && !!next && !audio.paused && isFinite(d) && d > 30 && left <= 12 && left > 0;
    if (!el) return;
    if (!on) { if (!el.hidden) el.hidden = true; return; }
    if (el.dataset.name !== next) {
      var t = findTake(next), art = window.HeresyArt ? window.HeresyArt.url(next) : "";
      el.dataset.name = next;
      $("unTitle").textContent = t ? displayTitle(t) : next;
      $("unCover").innerHTML = art ? '<img alt="" src="' + escape(art) + '" />' : "";
    }
    $("unIn").textContent = "in " + Math.max(1, Math.ceil(left)) + " s";
    el.hidden = false;
  }
  audio.addEventListener("timeupdate", paintUpNext);
  ["pause", "ended", "emptied"].forEach(function (k) { audio.addEventListener(k, paintUpNext); });
  $("upNext").addEventListener("click", function () { var t = this.dataset.name ? findTake(this.dataset.name) : null; if (t) { this.hidden = true; STATE.playZone = "playlist"; playNow(t); paintPlStrip(); } });
  window.ruachUpNext = paintUpNext;   // for the checks
  ["plPrev", "plNext"].forEach(function (id) {
    $(id).addEventListener("click", function () { var t = this.dataset.name ? findTake(this.dataset.name) : null; if (t) { STATE.playZone = "playlist"; playNow(t); paintPlStrip(); } });
  });
  $("plLeave").addEventListener("click", function () { STATE.playZone = "list"; paintPlStrip(); });
  // HERESY 1741 (Viktor 22.10.2026: «выравниваем дистанцию слева и справа к центру… Зеркальная точность»): in the two-row player the left group is as wide
  // as the right one, so the controls stand at the same distance from both; the one-row player keeps its own rule
  function mirrorPlayer() {
    var pb = $("playbar"), row = pb && pb.querySelector(".pb-row"), id = pb && pb.querySelector(".playbar-id"), side = pb && pb.querySelector(".pb-side");
    if (!row || !id || !side) return;
    if (getComputedStyle(row).display !== "grid" || getComputedStyle(id).display === "none") { id.style.width = ""; id.style.flex = ""; return; }
    var kids = Array.prototype.filter.call(side.children, function (k) { return k.getBoundingClientRect().width > 0; });
    if (!kids.length) return;
    var lo = Math.min.apply(null, kids.map(function (k) { return k.getBoundingClientRect().left; })), hi = Math.max.apply(null, kids.map(function (k) { return k.getBoundingClientRect().right; }));
    var w = Math.round(hi - lo) + "px";
    if (id.style.width !== w) { id.style.width = w; id.style.flex = "none"; }
  }
  var mirrorFrame = 0;
  function mirrorSoon() { if (!mirrorFrame) mirrorFrame = requestAnimationFrame(function () { mirrorFrame = 0; mirrorPlayer(); }); }
  if (window.ResizeObserver) {
    var mirrorWatch = new ResizeObserver(mirrorSoon);
    mirrorWatch.observe($("playbar"));
    Array.prototype.forEach.call(document.querySelectorAll("#playbar .pb-side > *"), function (k) { mirrorWatch.observe(k); });   // the time growing, a part hidden
  }
  window.addEventListener("resize", mirrorSoon);
  mirrorSoon();
  window.ruachMirrorPlayer = mirrorPlayer;   // for the checks
  $("pbPlaylist").addEventListener("click", function () { var HC = window.HeresyCollection; if (HC && HC.openPlaylist) HC.openPlaylist(); });

  // HERESY 1713 (RIVALS 11, Viktor 20.10.2026: «ОДОБРЯЮ с созданием функционала плейлиста. Сторонимся от слова РАДИО»): the takes of Play on (or
  // Repeat all) crossed: the take's last seconds go on in a second, hidden player and fade out while the next take comes in under them; the one player
  // keeps all the rest (the wave, the spectrum, the boost, the place kept). ⋈ 0 plays them one after another, as before; a take shorter than twice
  // the crossfade plays whole; Repeat one never crosses; a pause, a refusal or a failed second player ends the crossing, the take as loud as the slider
  // HERESY 1722 (Viktor 22.10.2026: «Обрезает кусок с конца текущего и с начала следующего трека»): the next take comes in whole, at its own level,
  // as soon as this one goes quiet after its last loud moment (its wave), at most the crossfade's seconds before its end; only this one's quiet tail
  // fades under it, on a cosine, in the second player, made ready four seconds ahead
  var XF = { ghost: null, timer: 0, busy: false, crossed: 0, ready: "" };
  // HERESY 1737: awake in the playlist alone, at its own 0–4 s
  function xfSeconds() { var HC = window.HeresyCollection; return STATE.playZone === "playlist" && HC && HC.playlistXfade ? Math.max(0, Math.min(4, +HC.playlistXfade() || 0)) : 0; }
  function xfTarget() { return Math.min(1, Math.max(0, parseFloat($("volume").value) || 0)); }
  function xfHasNext() {
    var names = listOrder(), from = STATE.playerTake ? names.indexOf(STATE.playerTake.name) : -1;
    return from >= 0 && (from + 1 < names.length || repeatMode() === "all" || (shuffleOn() && STATE.playZone !== "playlist" && names.length > 1));   // HERESY 1737
  }
  function xfTail(d) {                                   // where this take goes quiet after its last loud moment, by its wave's peaks, or null
    var p = STATE.peaks;
    if (!p || p === "none" || !p.length || !isFinite(d) || d <= 0) return null;
    var sorted = Array.prototype.slice.call(p).sort(function (a, b) { return a - b; }), loud = sorted[Math.floor(sorted.length * 0.9)] || 0;
    if (!loud) return null;
    var i = p.length - 1;
    while (i > 0 && p[i] < loud * 0.063) i--;           // under −24 dB of its loud body: the reverb, the fade, the silence
    return (i + 1) / p.length * d;
  }
  function xfAt(cf, d) {                                 // the moment the crossing starts
    var tail = xfTail(d);
    return Math.max(d - cf, Math.min(d - 0.5, tail == null ? d - 0.5 : tail));
  }
  function xfDrop() {
    if (XF.ghost) { try { XF.ghost.pause(); XF.ghost.removeAttribute("src"); XF.ghost.load(); } catch (e) { /* gone already */ } }
    XF.ghost = null; XF.ready = "";
  }
  function xfEnd() {
    clearInterval(XF.timer); XF.timer = 0;
    xfDrop();
    if (XF.busy) audio.volume = xfTarget();
    XF.busy = false;
  }
  function xfReady() {                                   // this take's file in a second, silent player, ahead of the crossing
    xfDrop();
    var g = new Audio();
    g.preload = "auto"; g.muted = true;
    XF.ghost = g; XF.ready = audio.currentSrc;
    g.addEventListener("error", function () { if (XF.ghost === g && !XF.busy) xfDrop(); });
    g.src = (STATE.playerTake && xfBlob(takeAudioUrl(STATE.playerTake))) || audio.currentSrc;   // HERESY 1737: the tail from the page, not the line
  }
  function xfStart(d) {
    var ghost = XF.ghost;
    if (!ghost || XF.ready !== audio.currentSrc) { xfReady(); ghost = XF.ghost; }
    XF.busy = true;
    var rate = audio.playbackRate || 1, left = Math.max(0.5, (d - audio.currentTime) / rate);
    ghost.defaultPlaybackRate = rate; ghost.playbackRate = rate;
    ghost.addEventListener("ended", function () { if (XF.ghost === ghost) xfEnd(); });
    var go = function () {
      if (XF.ghost !== ghost) return;
      try { ghost.currentTime = Math.min(ghost.duration || audio.currentTime, audio.currentTime); } catch (e) { /* at its end, then */ }
      ghost.muted = audio.muted; ghost.volume = audio.volume;
      ghost.play().then(function () {
        if (XF.ghost !== ghost) return;
        var t0 = performance.now(), fadeIn = 150, fadeOut = left * 1000, startVol = ghost.volume;
        audio.volume = 0;
        stepTake(1);                                     // the next take, in the one player, whole
        XF.crossed++;
        XF.timer = setInterval(function () {
          var k = performance.now() - t0, target = xfTarget();
          if (audio.paused && k > 800) return void xfEnd();   // paused, or the browser refused the next one
          audio.volume = Math.min(target, target * k / fadeIn);
          if (XF.ghost) { XF.ghost.muted = audio.muted; XF.ghost.volume = Math.max(0, Math.min(1, startVol * Math.cos(Math.min(1, k / fadeOut) * Math.PI / 2))); }
          if (k >= fadeOut) xfEnd();
        }, 50);
      }, function () { if (XF.ghost === ghost) xfEnd(); });   // refused: no crossing, the take ends as before
    };
    if (ghost.readyState >= 1) go(); else ghost.addEventListener("loadedmetadata", go, { once: true });
  }
  audio.addEventListener("timeupdate", function () {
    var cf = xfSeconds();
    if (!cf || XF.busy || audio.paused || repeatMode() === "one" || !(playOn() || repeatMode() === "all" || STATE.playZone === "playlist")) return;   // HERESY 1737: a playlist plays on
    var d = audio.duration, rate = audio.playbackRate || 1, now = audio.currentTime;
    if (!isFinite(d) || d < cf * 2 || !xfHasNext()) return;
    var at = xfAt(cf, d);
    if (XF.ready !== audio.currentSrc && (at - now) / rate <= 4) xfReady();
    if (now >= at) xfStart(d);
  });
  audio.addEventListener("loadstart", function () { if (!XF.busy && XF.ready && XF.ready !== audio.currentSrc) xfDrop(); });   // another take: its own
  audio.addEventListener("ended", function () { if (XF.busy && !XF.timer) xfEnd(); });   // the second player never started in time
  window.ruachXfAt = function (cf, d, peaks) { var keep = STATE.peaks; STATE.peaks = peaks; try { return xfAt(cf, d); } finally { STATE.peaks = keep; } };   // for the checks
  // HERESY 1727 (Viktor 22.10.2026: «удалить тот кроссфейд… Он тупо не работает»): ⋈ is gone from the bar; the code sleeps at 0 s for the playlist
  function paintXfade() { var p = $("xfadePick"); if (!p) return; var v = xfSeconds(); p.value = String(v); p.classList.toggle("is-on", v > 0); }
  if ($("xfadePick")) $("xfadePick").addEventListener("change", function () { store("yue2.crossfade", this.value === "0" ? null : this.value); paintXfade(); });
  paintXfade();
  window.ruachCrossfade = function () { return { seconds: xfSeconds(), busy: XF.busy, ghost: !!XF.ghost, crossed: XF.crossed }; };   // for the checks
  // HERESY 1737: the playlist's takes held whole in the page ahead of the seam (1722 waited on the line there): the one playing and the next, as blobs
  var XFB = { urls: {}, order: [], pending: {}, bytes: {}, wait: {} };   // HERESY 1746: their sizes, and who waits for one
  function xfBlob(url) { return (url && XFB.urls[url]) || ""; }
  var XFB_KEEP = 8, XFB_BYTES = 450 * 1024 * 1024;     // HERESY 1746: eight takes or 450 MB, whichever comes first (1737: three)
  function xfKeep(url, done) {                         // HERESY 1746: as a stream, its progress said; whoever waits for it told
    if (!url || /^blob:/.test(url)) { if (done) done(""); return; }
    if (XFB.urls[url]) { if (done) done(XFB.urls[url]); return; }
    if (done) (XFB.wait[url] = XFB.wait[url] || []).push(done);
    if (XFB.pending[url]) return;
    var q = XFB.pending[url] = { got: 0, total: 0, t0: Date.now(), parts: null, type: "" };   // HERESY 1803: when it began, what has come
    var finish = function (b) {
      delete XFB.pending[url];
      var w = XFB.wait[url] || [];
      delete XFB.wait[url];
      if (b && !XFB.urls[url]) { XFB.urls[url] = URL.createObjectURL(b); XFB.bytes[url] = b.size; XFB.order.push(url); xfTrim(); }
      w.forEach(function (f) { try { f(XFB.urls[url] || ""); } catch (e) { console.warn(e); } });
      if (XFB.after && STATE.playerTake && url === takeAudioUrl(STATE.playerTake)) { XFB.after = false; xfPrefetch(); }   // HERESY 1803: the next once this one is whole
      holdPaint();
    };
    fetch(url).then(function (r) {
      if (!r.ok) return null;
      q.total = +(r.headers.get("Content-Length") || 0);
      if (!r.body || !r.body.getReader) return r.blob();
      var reader = r.body.getReader(), parts = [], type = r.headers.get("Content-Type") || "";
      return (function pump() {
        return reader.read().then(function (x) {
          if (x.done) return new Blob(parts, { type: type });
          parts.push(x.value); q.got += x.value.length; holdPaint();
          q.parts = parts; q.type = type; early(url, q);   // HERESY 1803
          return pump();
        });
      })();
    }).then(finish, function () { finish(null); });
  }
  function xfTrim() {                                  // the oldest let go, never the one playing or the crossfade's tail
    var total = 0;
    XFB.order.forEach(function (u) { total += XFB.bytes[u] || 0; });
    for (var i = 0; i < XFB.order.length && (XFB.order.length > XFB_KEEP || total > XFB_BYTES);) {
      var old = XFB.order[i], live = XFB.urls[old];
      if (old === audio.dataset.url || live === audio.currentSrc || (XF.ghost && live === XF.ghost.currentSrc)) { i++; continue; }
      XFB.order.splice(i, 1);
      total -= XFB.bytes[old] || 0;
      try { URL.revokeObjectURL(live); } catch (e) { /* gone */ }
      delete XFB.urls[old]; delete XFB.bytes[old];
    }
  }
  function xfNextName() {
    var names = listOrder(), from = STATE.playerTake ? names.indexOf(STATE.playerTake.name) : -1;
    return from < 0 ? "" : names[from + 1] || (repeatMode() === "all" ? names[0] : "");
  }
  function xfPrefetch() {                              // as a take of the playlist plays: it and the next one, whole
    if (!STATE.playerTake) return;                     // HERESY 1746: always now (1737: with a crossfade only)
    var cur = takeAudioUrl(STATE.playerTake);
    xfKeep(cur);
    if (XFB.pending[cur]) { XFB.after = true; return; }   // HERESY 1803: while the one playing comes, it keeps the whole line; the next after it
    var n = xfNextName(), t = n ? findTake(n) : null;
    if (t) xfKeep(takeAudioUrl(t));
  }
  audio.addEventListener("playing", xfPrefetch);
  // HERESY 1746 (Viktor 23.10.2026: «в плеер Студии 100% кеширование, иначе рвёт трек на проигрыше ужасно при херовом моём соединении»): every take held
  // whole before it plays; ▶ asked before it is all in waits (the bar says how much has come), then it plays from the page, its place and play state kept
  var HOLD = { url: "", want: false }, HOLD_GRACE = 1200;
  function playerHolds(url) {                          // the player has this take: its address, and the element on its stream, its blob or waiting for it
    if (!url || audio.dataset.url !== url) return false;   // (whoever set the element's src past loadPlayer, a check or an error's fallback, is seen)
    var src = audio.getAttribute("src") || "";
    return src === url || (!!src && src === xfBlob(url)) || (!src && HOLD.url === url) ||
      (!!src && EARLY.url === url && !!EARLY.part && src === EARLY.part.src);   // HERESY 1803: playing from what came
  }
  function holdWhole(take, url) {
    var have = xfBlob(url);
    if (!take || take.session || !url || /^blob:/.test(url) || have) { HOLD.url = ""; HOLD.want = false; holdPaint(); audio.src = have || url; return; }
    earlyReset(url, take);                             // HERESY 1803
    HOLD.url = url; HOLD.want = false;
    realPause(); audio.removeAttribute("src"); audio.load();   // the take before goes now; this one waits for its whole (a fast line: well within the grace)
    holdPaint();
    var slow = setTimeout(function () {                // a slow line: the stream gives the length and the wave meanwhile; ▶ still waits for the whole
      if (audio.dataset.url === url && HOLD.url === url && !audio.getAttribute("src") && !earlyOn()) audio.src = url;   // 1803: not beside an early start (one line, one download)
    }, HOLD_GRACE);
    xfKeep(url, function (blob) {
      clearTimeout(slow);
      if (audio.dataset.url !== url) return;            // another take since
      if (EARLY.url === url && (EARLY.part || EARLY.resumeAt != null)) { if (blob) earlyWhole(blob); return; }   // HERESY 1803: playing from what came
      var want = HOLD.want, streaming = !!audio.getAttribute("src");
      HOLD.url = ""; HOLD.want = false; holdPaint();
      if (!blob) {                                      // not held (a dropped line, an older server): the stream plays it, as before
        if (!streaming) audio.src = url;
        if (want) realPlay().catch(playRefused);
        return;
      }
      if (!streaming) { audio.src = blob; if (want) realPlay().catch(playRefused); return; }   // straight from the page: no stream ever played
      if (audio.currentSrc === blob) return;
      var at = audio.currentTime, go = want || !audio.paused;   // the stream had come meanwhile: the whole in its place, at its place
      audio.src = blob;
      var back = function () {
        audio.removeEventListener("loadedmetadata", back);
        try { if (at > 0) audio.currentTime = at; } catch (e) { /* not seekable yet */ }
        if (go) realPlay().catch(playRefused);
      };
      audio.addEventListener("loadedmetadata", back);
    });
  }
  var realPlay = audio.play.bind(audio), realPause = audio.pause.bind(audio);
  audio.play = function () {                            // ▶ before the whole has come: asked, and kept for it
    if (HOLD.url && HOLD.url === audio.dataset.url) { HOLD.want = true; playWanted = true; holdPaint(); return Promise.resolve(); }
    return realPlay();
  };
  audio.pause = function () { if (HOLD.want) { HOLD.want = false; playWanted = false; holdPaint(); } return realPause(); };
  function holdPaint() {
    var el = $("pbHold");
    if (!el) return;
    var early1803 = !!(EARLY.part && EARLY.url === audio.dataset.url);   // HERESY 1803: how much has come, while it plays from it too
    var on = !!(HOLD.url && HOLD.url === audio.dataset.url) || early1803, q = on ? XFB.pending[HOLD.url || EARLY.url] : null;
    el.hidden = !on;
    if (on) el.textContent = q && q.total ? Math.min(99, Math.floor(100 * q.got / q.total)) + " %" : "\u2026";
    $("playbar").classList.toggle("is-holding", on && HOLD.want);
  }
  // HERESY 1803 (Viktor 28.10.2026: «У нас сейчас кешируется весь первый трек. На удалёнке время занимает. Что, если начинать воспроизведение с первой
  // минуты закешированной?»): on a line slow enough that the whole would keep ▶ waiting, the take starts from what has come once its first minute is in
  // and the rest will come before the playing reaches it (the measured pace, a margin kept). What came plays as one file: measured 28.10, a FLAC cut short
  // says the whole take's length and, where its bytes end, jumps to that end and fires ended, and a seek past them stands silent. So a longer piece is put
  // in its place 20 s before it runs out and the whole when it is in, each at the quietest moment of the wave ahead; a line that falls behind, or a seek
  // past what came, waits on the bar as the hold did and goes on from where it stood. A fast line (the whole within 3 s) waits for the whole, as before.
  // Engine → Defaults → Start playing: «when the whole take is in» is 1746 as it was.
  var EARLY = { url: "", take: null, part: null, next: null, timer: 0, resumeAt: null, swaps: 0 };
  function earlyOn() { return recall("yue2.holdStart") !== "whole"; }
  function earlySecs() { var s = +(EARLY.take && EARLY.take.seconds) || 0; return s > 0 ? s : (isFinite(audio.duration) ? audio.duration : 0); }
  function earlyDrop(p) { if (p && p.mine) { try { URL.revokeObjectURL(p.src); } catch (e) { /* gone */ } } }
  function earlyReset(url, take) {
    clearTimeout(EARLY.timer);
    earlyDrop(EARLY.part); earlyDrop(EARLY.next);
    EARLY.url = url || ""; EARLY.take = take || null; EARLY.part = null; EARLY.next = null; EARLY.resumeAt = null; EARLY.swaps = 0;
  }
  function earlyPart(q) {                              // what has come as one file, and how much of the take it holds (a margin: a FLAC's bitrate varies)
    return { src: URL.createObjectURL(new Blob(q.parts.slice(), { type: q.type || "audio/flac" })), secs: earlySecs() * q.got / q.total * 0.97, mine: true };
  }
  function early(url, q) {
    if (!earlyOn() || EARLY.url !== url || EARLY.part || EARLY.resumeAt != null || audio.dataset.url !== url || HOLD.url !== url || !HOLD.want) return;
    var secs = earlySecs(), took = (Date.now() - q.t0) / 1000;
    if (!q.total || !secs || took < 1 || q.got >= q.total) return;
    var rate = q.got / took, left = (q.total - q.got) / rate, have = secs * q.got / q.total;
    if (left < 3) return;                              // the whole is near: it waits for it, as before
    if (have < Math.min(60, secs / 2)) return;         // its first minute (half a short take)
    if (left > secs - 20) return;                      // the rest would not come before the playing reaches it: more first
    EARLY.part = earlyPart(q);
    HOLD.url = ""; HOLD.want = false;
    audio.src = EARLY.part.src;
    realPlay().catch(playRefused);
    holdPaint();
  }
  function quietAt(from, to) {                         // the quietest moment of the wave between two times (its peaks)
    var pk = STATE.peaks, d = earlySecs();
    if (!pk || pk === "none" || !pk.length || !d || to <= from) return from;
    var n = pk.length, a = Math.max(0, Math.floor(from / d * n)), b = Math.min(n - 1, Math.ceil(to / d * n)), best = a;
    for (var i = a; i <= b; i++) if (pk[i] < pk[best]) best = i;
    return Math.max(from, best / n * d);
  }
  function earlyPut(p, at, play) {                     // the new file in the old one's place, at a time, playing as it was
    var old = EARLY.part;
    clearTimeout(EARLY.timer); EARLY.timer = 0;
    if (EARLY.next && EARLY.next !== p) earlyDrop(EARLY.next);
    EARLY.next = null;
    EARLY.part = p.whole ? null : p;
    EARLY.swaps++;
    audio.src = p.src;
    var back = function () {
      audio.removeEventListener("loadedmetadata", back);
      try { audio.currentTime = at; } catch (e) { /* not seekable yet */ }
      if (play) realPlay().catch(playRefused);
    };
    audio.addEventListener("loadedmetadata", back);
    if (old && old !== p) setTimeout(function () { earlyDrop(old); }, 4000);
    holdPaint();
  }
  function earlySwap(p) {                              // at the quietest moment of the next seconds, before what plays runs out
    clearTimeout(EARLY.timer);
    if (EARLY.next && EARLY.next !== p) earlyDrop(EARLY.next);
    EARLY.next = p;
    var now = audio.currentTime, end = EARLY.part ? EARLY.part.secs - 3 : now + 8;
    var at = quietAt(now + 0.4, Math.max(now + 0.5, Math.min(now + 40, end))), url = EARLY.url;   // 28.10: the change stands 0.3 s, so the quietest of all the time it has
    EARLY.timer = setTimeout(function () {
      EARLY.timer = 0;
      if (EARLY.url !== url || audio.dataset.url !== url || EARLY.next !== p) return;
      earlyPut(p, audio.currentTime, !audio.paused);
    }, Math.max(0, (at - now) / (audio.playbackRate || 1) * 1000));
  }
  function earlyWhole(blob) {                          // the whole is in: in its place (at once when the bar was waiting or nothing plays)
    var p = { src: blob, whole: true, mine: false };
    if (EARLY.resumeAt != null) { var at = EARLY.resumeAt; EARLY.resumeAt = null; HOLD.url = ""; HOLD.want = false; earlyPut(p, at, true); return; }
    if (EARLY.part && audio.currentSrc === EARLY.part.src && !audio.paused) return earlySwap(p);
    earlyPut(p, audio.currentTime, !audio.paused);
  }
  function earlyWait(at) {                             // the line fell behind, or a seek went past what came: the bar waits as the hold did
    clearTimeout(EARLY.timer); EARLY.timer = 0;
    EARLY.resumeAt = at;
    HOLD.url = EARLY.url; HOLD.want = true; holdPaint();
  }
  function earlyRanOut() {
    var q = XFB.pending[EARLY.url], at = EARLY.part.secs;
    if (q && q.parts) { var p = earlyPart(q); if (p.secs > at + 10) { earlyPut(p, at, true); return; } earlyDrop(p); }
    earlyWait(at);
  }
  audio.addEventListener("timeupdate", function () {   // a longer piece 20 s before this one runs out
    if (!EARLY.part || EARLY.next || audio.paused || audio.currentSrc !== EARLY.part.src || EARLY.part.secs - audio.currentTime > 20) return;
    var q = XFB.pending[EARLY.url];
    if (!q || !q.parts) return;
    var p = earlyPart(q);
    if (p.secs > EARLY.part.secs + 5) earlySwap(p); else earlyDrop(p);
  });
  audio.addEventListener("seeking", function () {      // past what came: wait for it there
    if (EARLY.part && audio.currentSrc === EARLY.part.src && audio.currentTime > EARLY.part.secs - 1) { var at = audio.currentTime; realPause(); earlyWait(at); }
  });
  window.ruachEarly = function () {                    // for the checks
    return { on: earlyOn(), url: EARLY.url, part: EARLY.part ? +EARLY.part.secs.toFixed(1) : null, next: !!EARLY.next, swaps: EARLY.swaps, resumeAt: EARLY.resumeAt,
             blob: /^blob:/.test(audio.currentSrc || ""), at: +audio.currentTime.toFixed(2), paused: audio.paused };
  };
  window.ruachHeld = function () {                     // for the checks
    var u = audio.dataset.url || "";
    return { url: u, held: !!xfBlob(u), blob: /^blob:/.test(audio.currentSrc || ""), waiting: !!(HOLD.url && HOLD.url === u), want: HOLD.want, kept: XFB.order.length };
  };
  window.ruachXfBlobs = function () { return { kept: Object.keys(XFB.urls), pending: Object.keys(XFB.pending), src: audio.currentSrc, next: xfNextName() }; };   // for the checks

  // HERESY 1106: shuffle and repeat (off · all · one), kept like the rest of the player
  function shuffleOn() { return recall("yue2.shuffle") === "on"; }
  function repeatMode() { var m = recall("yue2.repeat"); return m === "all" || m === "one" ? m : "off"; }
  function paintShuffleRepeat() {
    $("pbShuffle").setAttribute("aria-pressed", String(shuffleOn())); $("pbShuffle").classList.toggle("is-on", shuffleOn());
    var m = repeatMode();
    $("pbRepeat").dataset.mode = m; $("pbRepeat").setAttribute("aria-pressed", String(m !== "off")); $("pbRepeat").classList.toggle("is-on", m !== "off");
    $("pbRepeat").setAttribute("aria-label", m === "one" ? "Repeat this take" : m === "all" ? "Repeat the list" : "Repeat off");
  }
  $("pbShuffle").addEventListener("click", function () { store("yue2.shuffle", shuffleOn() ? null : "on"); paintShuffleRepeat(); });
  $("pbRepeat").addEventListener("click", function () { var m = repeatMode(); store("yue2.repeat", m === "off" ? "all" : m === "all" ? "one" : null); paintShuffleRepeat(); });
  paintShuffleRepeat();
  // HERESY 1040: play on click
  function clickPlay() { return recall("yue2.clickPlay") !== "off"; }
  function paintClickPlay() {
    var on = clickPlay();
    $("clickPlay").setAttribute("aria-pressed", on ? "true" : "false");
    $("clickPlay").classList.toggle("is-on", on);
  }
  $("clickPlay").addEventListener("click", function () { store("yue2.clickPlay", clickPlay() ? "off" : null); paintClickPlay(); });
  paintClickPlay();
  // HERESY 1167 (Viktor: «Можно к плееру выключатель третий добавить»): play new takes when they are done
  function playNew() { return recall("yue2.playNew") !== "off"; }
  function paintPlayNew() {
    var on = playNew();
    $("playNew").setAttribute("aria-pressed", on ? "true" : "false");
    $("playNew").classList.toggle("is-on", on);
  }
  $("playNew").addEventListener("click", function () { store("yue2.playNew", playNew() ? "off" : null); paintPlayNew(); });
  paintPlayNew();
  // HERESY 1804 (Viktor 28.10.2026: «Дать юзеру максимальную свободу изменять дефолты в Engine настройках… Дефолты выставляем как у нас сейчас в Студии»):
  // Engine → Defaults, each field a yue2.* key (user/settings.json keeps it as every key), empty = the studio's own; the player's and the lists' own
  // switches set the same keys, and the card reads them again whenever Engine opens
  var SEEK = { btn: ["yue2.seekBtn", 15], key: ["yue2.seekKey", 5], shift: ["yue2.seekKeyShift", 30] };
  function seekStep(kind) { var k = SEEK[kind], v = +recall(k[0]); return v > 0 && v <= 600 ? v : k[1]; }
  function paintSeekTips() {
    var b = seekStep("btn"), k = seekStep("key"), s = seekStep("shift");
    $("pbRew").setAttribute("aria-label", "Back " + b + " s"); $("pbFwd").setAttribute("aria-label", "On " + b + " s");
    $("pbRew").dataset.tip = "Back to the last mark of every " + b + " s; the \u2190 key: every " + k + " s, with Shift every " + s + " s";
    $("pbFwd").dataset.tip = "On to the next mark of every " + b + " s; the \u2192 key: every " + k + " s, with Shift every " + s + " s";
  }
  function paintDefaults() {
    if (!$("defaultsCard")) return;
    Array.prototype.forEach.call(document.querySelectorAll("#defaultsCard [data-def]"), function (sel) { sel.value = recall(sel.dataset.def) || sel.dataset.defIs; });
    Array.prototype.forEach.call(document.querySelectorAll("#defaultsCard [data-def-check]"), function (c) {
      var v = recall(c.dataset.defCheck);
      c.checked = c.dataset.defOn ? v === c.dataset.defOn : v !== c.dataset.defOff;
    });
  }
  function defaultsChanged() {
    paintClickPlay(); paintPlayNew(); paintSeekTips(); paintDefaults(); paintLibrary();
    if (window.HeresyCollection && window.HeresyCollection.repaint) window.HeresyCollection.repaint();
  }
  if ($("defaultsCard")) {
    $("defaultsCard").addEventListener("change", function (e) {
      var sel = e.target.closest("[data-def]"), c = e.target.closest("[data-def-check]");
      if (sel) store(sel.dataset.def, sel.value === sel.dataset.defIs ? null : sel.value);
      if (c) store(c.dataset.defCheck, c.dataset.defOn ? (c.checked ? c.dataset.defOn : null) : (c.checked ? null : c.dataset.defOff));
      defaultsChanged();
    });
    $("defaultsReset").addEventListener("click", function () {
      ["yue2.seekBtn", "yue2.seekKey", "yue2.seekKeyShift", "yue2.holdStart", "yue2.clickPlay", "yue2.playNew", "yue2.dblPlay", "yue2.showDisliked"].forEach(function (k) { store(k, null); });
      defaultsChanged();
    });
  }
  window.ruachPaintDefaults = paintDefaults;
  paintSeekTips(); paintDefaults();
  // HERESY 1275 (Viktor 28.09.2026: «звуковое оповещение при окончании генерации»): a sound when a run made here ends, two
  // notes up when it is done, two down when it failed; made here (no file), as loud as the player, none when it is muted
  function runChime() { return recall("yue2.runChime") !== "off"; }
  function paintRunChime() {
    var on = runChime();
    $("runChime").setAttribute("aria-pressed", on ? "true" : "false");
    $("runChime").classList.toggle("is-on", on);
  }
  $("runChime").addEventListener("click", function () { store("yue2.runChime", runChime() ? "off" : null); paintRunChime(); });
  paintRunChime();
  var chimeCtx = null;
  function chime(ok) {
    var level = audio.muted ? 0 : audio.volume;
    if (!runChime() || !level) return false;
    try {
      chimeCtx = chimeCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (chimeCtx.state === "suspended") chimeCtx.resume();
      var t0 = chimeCtx.currentTime + 0.03;
      (ok ? [880, 1318.5] : [659.25, 440]).forEach(function (hz, i) {   // a fifth up (A5, E6) or down (E5, A4)
        var o = chimeCtx.createOscillator(), g = chimeCtx.createGain(), at = t0 + i * 0.17;
        o.type = "sine";
        o.frequency.value = hz;
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(0.2 * level, at + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, at + 0.9);
        o.connect(g);
        g.connect(chimeCtx.destination);
        o.start(at);
        o.stop(at + 0.95);
      });
    } catch (e) { return false; }
    window.RuachChime.rung.push(ok ? "done" : "failed");
    if (window.RuachChime.rung.length > 20) window.RuachChime.rung.shift();
    return true;
  }
  // a run of this page, seen to its end here: not one from elsewhere, not one that ended while the page was away; a queue
  // of runs (versions, runs started one after another) is heard once, when its last one ends; a failure at once
  function chimeFor(job, ok) {
    if (job.kind === "external" || (job.restored && !job.seenRunning)) return;
    if (ok && STATE.jobs.some(function (j) { return j !== job && isLive(j) && !j.provisional && j.kind !== "external"; })) return;
    chime(ok);
  }
  window.RuachChime = { ring: chime, rung: [] };   // the other rooms ring it too (the Artist, the Refiner, the Trainer)
  function paintPlayOn() {
    var on = playOn();
    $("autoplay").setAttribute("aria-pressed", on ? "true" : "false");
    $("autoplay").classList.toggle("is-on", on);
  }
  $("autoplay").addEventListener("click", function () { store("yue2.playOn", playOn() ? "off" : null); paintPlayOn(); });
  $("prevTake").addEventListener("click", function () { stepTake(-1); });
  $("pbRew").addEventListener("click", function () { seekMark(seekStep("btn"), -1); });   // HERESY 1804: the step from Engine → Defaults   // HERESY 1169
  $("pbFwd").addEventListener("click", function () { seekMark(seekStep("btn"), 1); });
  $("nextTake").addEventListener("click", function () { stepTake(1); });
  paintPlayOn();
  audio.addEventListener("emptied", markPlaying);
  audio.addEventListener("error", function () {          // HERESY 1053: an older server, no FLAC: the WAV, as before
    var src = audio.getAttribute("src") || "";
    if (/^blob:/.test(src)) src = audio.dataset.url || "";   // HERESY 1746: what failed is the element's own src; a held take's blob is its address
    if (src.indexOf("/library/listen?") !== 0 || !STATE.playerTake) return;
    STATE.listenOff = true;
    // HERESY 1361: a take asked to play goes on; asked as the events say it (playWanted): Chrome has paused the element silently by the
    // time its error is heard (measured: a capture listener still saw it playing, this handler paused, no pause event between)
    var at = audio.currentTime, take = STATE.playerTake, asked = playWanted;
    audio.dataset.url = wavUrl(take); HOLD.url = ""; holdPaint();   // HERESY 1746: the WAV plays from the stream
    audio.src = wavUrl(take);
    try { audio.currentTime = at; } catch (e) { /* not seekable yet */ }
    if (asked) audio.play().catch(playRefused);
    toast("No FLAC route on this server: the player plays the WAVs this session", "bad");
  });

  // The card of the song that is playing says so (the list redraws often, so this runs after it too)
  function markPlaying() {
    var name = isPlaying() && STATE.playerTake ? STATE.playerTake.name : "";
    all("#libList .take[data-name]").forEach(function (card) {
      card.classList.toggle("is-playing", !!name && card.dataset.name === name);
    });
    paintStatus();
  }

  // The player bar's status: Rendering or Queued while a song is being made (a click shows the run),
  // Playing or Paused for the song in the player (a click opens it), else Idle.
  function paintStatus() {
    var job = STATE.running, pill = $("statusPill"), s = "idle", text = "Idle", tip = "Nothing is being made or played";
    if (job && job.status === "queued") { s = "queued"; text = "Queued"; tip = "Waiting to start: " + job.title + ". Click to watch it"; }
    else if (job) { s = "rendering"; text = "Rendering"; tip = "Making " + job.title + ". Click to watch it"; }
    else if (isPlaying() && STATE.playerTake) { s = "playing"; text = "Playing"; tip = "Playing " + displayTitle(STATE.playerTake) + ". Click to open it"; }
    else if (STATE.playerTake && audio.getAttribute("src")) { s = "paused"; text = "Paused"; tip = displayTitle(STATE.playerTake) + " is paused. Click to open it"; }
    pill.dataset.s = s;
    pill.dataset.tip = tip;
    $("statusText").textContent = text;
  }
  // HERESY 1165 (Viktor: «Кликание по кружочку… на регенерации как минимум не работает»): the run and the take are shown
  // in the Creator; from another room the click showed them there, unseen
  $("statusPill").addEventListener("click", function () {
    var s = this.dataset.s, shown = false;
    if ((s === "rendering" || s === "queued") && STATE.running) { if (document.body.dataset.tab !== "create") setTab("create"); $("backToRun").click(); shown = true; }
    else if ((s === "playing" || s === "paused") && STATE.playerTake) { if (document.body.dataset.tab !== "create") setTab("create"); openTake(STATE.playerTake.name); shown = true; }
    // HERESY 1169 · 1236 (Viktor 08.10.2026: «При клике в плеере на кружок зелёный/красный, при открытом оверлее с активным фреймом композитора пусть переключается во фрейм музыканта»): the run or the take it shows is the Musician's, so a lifted Compose turns to it
    if (shown && document.body.dataset.frame === "compose") frameOver("take");
  });
  audio.addEventListener("timeupdate", function () {
    $("timeNow").textContent = clock(audio.currentTime);
    drawWave();
  });
  audio.addEventListener("loadedmetadata", function () {
    if (!isFinite(audio.duration)) return;
    $("timeTotal").textContent = clock(audio.duration);
    if (STATE.take && !STATE.take.seconds) { STATE.take.seconds = audio.duration; paintTakeMeta(); }
  });

  // HERESY 1111: the waveform says the time under the pointer; the total turns to the time left on a click
  STATE.waveHover = null;
  $("wave").addEventListener("mousemove", function (event) {
    var r = this.getBoundingClientRect(); STATE.waveHover = (event.clientX - r.left) / r.width; drawWave(); wavePop(event);
    if (window.HeresyWaveScope) window.HeresyWaveScope.hover(event);      // HERESY 1374: the wave's scope comes up after a moment
  });
  $("wave").addEventListener("mouseleave", function (event) {
    var up = window.HeresyWaveScope && window.HeresyWaveScope.keeps(event);   // HERESY 1374: up into the scope: its line and card stay
    if (window.HeresyWaveScope) window.HeresyWaveScope.leave(event);
    if (up) return;
    STATE.waveHover = null; drawWave(); wavePop(null);
  });
  // HERESY 1315 (Viktor 10.10.2026: «при перетаскивании указателя курсора мыши по волне показывать в красивом попапе текст данной
  // секции — прямо из оригинального текста лирики»): a card over the wave with the section under the pointer, its time and its
  // lines as written in the lyrics, the line sung there lit; a section of the score alone says how to find its words
  var wavePopEl = null;
  function wavePop(event) {
    if (!wavePopEl) { wavePopEl = document.createElement("div"); wavePopEl.className = "wave-pop"; wavePopEl.hidden = true; document.body.appendChild(wavePopEl); }
    var secs = waveSections(), room = document.body.dataset.tab || "create";
    // HERESY 1317 (Viktor 10.10.2026: «этот оверхол нужен нам только в аудио комнатах — Творец, Огранщик и Библиотекарь»)
    if (!event || !secs.length || !isFinite(audio.duration) || audio.duration <= 0 || ["create", "post", "collection"].indexOf(room) < 0) { wavePopEl.hidden = true; wavePopEl.dataset.key = ""; return; }
    var r = $("wave").getBoundingClientRect(), t = Math.max(0, Math.min(1, (event.clientX - r.left) / r.width)) * audio.duration, s = sectionAt(t);
    if (!s) { wavePopEl.hidden = true; return; }
    var i = secs.indexOf(s), end = i + 1 < secs.length ? secs[i + 1].t : audio.duration, now = -1;
    (s.rows || []).forEach(function (row) { if (row.start <= t + 0.05) now = row.k; });
    var scope = !!(window.HeresyWaveScope && window.HeresyWaveScope.wanted());   // HERESY 1374: the whole spectrogram over the player
    var rpl = STATE.waveReplaced && STATE.playerTake && STATE.waveReplaced.name === STATE.playerTake.name && (STATE.waveReplaced.parts || [STATE.waveReplaced]).some(function (x) { return t >= x.a && t < x.b; });   // HERESY 1414, 1425: each part
    var key = (STATE.playerTake ? STATE.playerTake.name : "") + ":" + i + ":" + now + (scope ? ":scope" : "") + (binding() ? ":binding" : "") + (rpl ? ":anew" : "");   // HERESY 1409
    if (wavePopEl.dataset.key !== key) {
      wavePopEl.dataset.key = key;
      var html = '<div class="wave-pop-head"><b translate="no">' + escape(s.name) + "</b><span>" + clock(s.t) + "\u2013" + clock(end) + "</span></div>" +
        (rpl ? '<p class="wave-pop-hint wave-pop-anew">' + escape("Sung anew here (Replace a section); the rest is as its parent made it") + "</p>" : "");   // HERESY 1414
      // HERESY 1398 (Viktor 12.10.2026: «Из обычного режима подсветки тултипом убери спектрограмму. Пусть спектрограмма будет только в полном
      // режиме на весь трек. Пусть это будет уже в RC7»): 1358's slice of the spectrogram is gone from the card; the scope (1374) shows it whole
      if (s.lines && s.lines.length) {
        html += '<div class="wave-pop-lines" translate="no">' + s.lines.slice(0, 12).map(function (l, k) { return "<p" + (k === now ? ' class="is-now"' : "") + ">" + escape(l) + "</p>"; }).join("") +
          (s.lines.length > 12 ? '<p class="wave-pop-more">\u2026</p>' : "") + "</div>" +
          (s.unheard ? '<p class="wave-pop-hint">' + escape("placed between its neighbours: Whisper did not hear these lines clearly") + "</p>" : "");
      } else if (STATE.waveSections.how === "score") {
        html += '<p class="wave-pop-hint">' + escape(binding() ? "Wait: Whisper is binding the lyrics to the wave; the words come here in a moment"   // HERESY 1409
          : "A mark of the score. Each section of the lyrics with its words: the take's menu, Find the sections by ear") + "</p>";
      } else {
        html += '<p class="wave-pop-hint">' + escape("no words here") + "</p>";
      }
      wavePopEl.innerHTML = html;
    }
    wavePopEl.hidden = false;
    var w = wavePopEl.offsetWidth, h = wavePopEl.offsetHeight;
    wavePopEl.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, event.clientX - w / 2)) + "px";
    var over = window.HeresyWaveScope ? window.HeresyWaveScope.top() : null;   // HERESY 1374: over the scope while it is up
    wavePopEl.style.top = Math.max(8, (over !== null ? over : r.top) - h - 10) + "px";
  }
  $("timeTotal").addEventListener("click", function () { store("yue2.timeLeft", recall("yue2.timeLeft") ? null : "1"); paintTimes(); });
  function paintTimes() {
    if (!isFinite(audio.duration)) return;
    $("timeTotal").textContent = recall("yue2.timeLeft") ? "\u2212" + clock(Math.max(0, audio.duration - audio.currentTime)) : clock(audio.duration);
  }
  audio.addEventListener("timeupdate", function () { if (recall("yue2.timeLeft")) paintTimes(); });
  $("wave").addEventListener("click", function (event) { waveSeek(event.clientX); });
  // HERESY 1374: a click before the wave's scope came only goes there (the scope waits for the pointer to move on)
  $("wave").addEventListener("mousedown", function (event) { if (window.HeresyWaveScope) window.HeresyWaveScope.press(event); });
  function waveSeek(clientX) {                                 // HERESY 1374: the wave's and its scope's
    var rect = $("wave").getBoundingClientRect();
    var ratio = (clientX - rect.left) / rect.width;
    if (!isFinite(audio.duration)) return;
    var t = ratio * audio.duration, near = null;              // HERESY 1282: a click by a section's line goes to its very start
    waveSections().forEach(function (s) {
      if (Math.abs((s.t - t) / audio.duration * rect.width) <= 6 && (!near || Math.abs(s.t - t) < Math.abs(near.t - t))) near = s;
    });
    audio.currentTime = near ? near.t : t;
  }
  // HERESY 1282 (from SUNO v6, TODO.md: «Sections on the wave: the take's sections from its score… as labelled blocks over the
  // player's waveform; a click on one goes there»): the take's score (its own, from its request; else the one written from its
  // sound) gives each section's start in seconds at the score's tempo (HeresyAbc.markers); the wave draws a thin line at each
  // and its name at the foot of its block; the time under the pointer names its section
  STATE.waveSections = { name: "", list: [] };
  var sectionsNone = {};                                       // the takes with no score written from their sound: asked once
  function sectionsFrom(abc) {
    if (!abc || !window.HeresyAbc) return [];
    try {
      return window.HeresyAbc.markers(window.HeresyAbc.parse(abc)).filter(function (m) { return isFinite(m.seconds) && m.seconds >= 0 && m.name; })
        .map(function (m) { return { t: m.seconds, name: String(m.name).replace(/^%\s*/, "").trim() }; });
    } catch (e) { return []; }
  }
  function waveSections() { var ws = STATE.waveSections; return STATE.playerTake && ws && ws.name === STATE.playerTake.name ? ws.list : []; }
  window.ruachWaveSections = function (name) { var ws = STATE.waveSections; return ws && ws.name === name ? ws.list : null; };   // HERESY 1532: the DAW's ruler
  // HERESY 1315 (Viktor 10.10.2026, on his Buratino: «секуционка очень скудная на волне… Всего два verse показало. bridges вообще
  // нет»): a Full take's plan names only the sections its writer marked (4 to 13 in those takes, their lyrics 32 tags), so the
  // sections are the lyrics' own tags now, each placed by the karaoke timing (Whisper's word times, HERESY 1056): a sung one where
  // its first line begins, an instrumental one where the one before it ends (a run of them shares the gap up to the next sung one).
  // The score's marks stay for a take never timed; the timing is asked once and the lab keeps it.
  var sectionsTimed = {}, sectionsAsked = {};
  // HERESY 1409 (Viktor 13.10.2026: «Нужно дописать ПОДОЖДИ! ИДЁТ ПРИВЯЗКА ЛИРИКИ К ВОЛНЕ...»): Whisper binding the take in the player
  function binding() { return !!(STATE.playerTake && sectionsAsked && sectionsAsked[STATE.playerTake.name] === "running"); }
  function bindingChanged() { if (wavePopEl) wavePopEl.dataset.key = ""; drawWave(); }
  window.ruachBinding = function (on, how) {                 // for the checks: the take in the player as being bound, or not
    if (!STATE.playerTake) return false;
    if (on) sectionsAsked[STATE.playerTake.name] = "running"; else delete sectionsAsked[STATE.playerTake.name];
    if (how && STATE.waveSections) STATE.waveSections.how = how;
    bindingChanged();
    return binding();
  };
  function lyricParts(lyrics) {
    var out = [], cur = null;
    String(lyrics || "").split(/\r?\n/).forEach(function (raw) {
      var s = raw.trim(), tag = s.match(/^\[([^\]]+)\]/);
      if (tag) { cur = { name: tag[1].trim(), lines: [] }; out.push(cur); return; }
      if (!s || s.charAt(0) === "(") return;                // what timing.py leaves out as well
      if (!cur) { cur = { name: "", lines: [] }; out.push(cur); }
      cur.lines.push(s);
    });
    return out;
  }
  function taggedParts(lyrics) { return lyricParts(lyrics).filter(function (p) { return p.name; }).length; }
  function earSections(lyrics, rows) {
    var parts = lyricParts(lyrics), k = 0, list = [];
    rows = rows || [];
    parts.forEach(function (p) {
      var mine = [];
      p.lines.forEach(function (line, li) {                  // the timing's rows are the lyric lines in order; a line it left out is passed
        for (var j = k; j < Math.min(rows.length, k + 4); j++) {
          if (String(rows[j].text || "").trim() === line && isFinite(rows[j].start)) { mine.push({ k: li, start: +rows[j].start, end: +rows[j].end, guessed: !!rows[j].guessed }); k = j + 1; return; }
        }
      });
      list.push({ name: p.name || "Lyrics", lines: p.lines, rows: mine, t: mine.length ? mine[0].start : null, end: mine.length ? mine[mine.length - 1].end : null });
    });
    if (!list.some(function (s) { return s.t != null; })) return [];
    // a section whose first lines were only guessed: its first line heard, less the median heard line for each guessed one before it
    // (the timing shares a guessed run from the time before it, so Verse 1 of Buratino v9.3.6.8 began at 0:00 over its long intro)
    var lens = rows.filter(function (r) { return !r.guessed && r.end > r.start; }).map(function (r) { return r.end - r.start; }).sort(function (a, b) { return a - b; });
    var lineLen = lens.length ? lens[Math.floor(lens.length / 2)] : 3, before = 0;
    list.forEach(function (s) {
      var first = -1;
      s.rows.forEach(function (r, i) { if (first < 0 && !r.guessed) first = i; });
      if (first >= 0) s.t = Math.max(before, s.rows[first].start - s.rows[first].k * lineLen);
      else if (s.t != null) s.t = Math.max(before, s.t);
      if (s.t != null) before = s.t;
    });
    // the lyrics' end the take never sang (a Full take loses its text's end): after the last line heard, the sections all guessed
    // stay, marked, when the time left could hold their lines (1.5 s a line), else they are left out; an instrumental run after
    // them keeps the time left
    var lastHeard = -1;
    list.forEach(function (s, i) { if (s.rows.some(function (r) { return !r.guessed; })) lastHeard = i; });
    if (lastHeard < 0) return [];
    var heardEnd = list[lastHeard].end || list[lastHeard].t, dur = isFinite(audio.duration) && audio.duration > 0 ? audio.duration : heardEnd;
    var tailLines = list.slice(lastHeard + 1).reduce(function (n, s) { return n + s.rows.length; }, 0), tailFits = dur - heardEnd >= tailLines * 1.5;
    list = list.filter(function (s, i) { return i <= lastHeard || (s.rows.length ? tailFits : dur - heardEnd >= 2); });
    list.forEach(function (s) { s.unheard = s.rows.length > 0 && s.rows.every(function (r) { return r.guessed; }); });
    var last = 0;
    for (var i = 0; i < list.length; i++) {                  // an instrumental run shares the gap from the last sung end to the next sung start
      if (list[i].t != null) { last = Math.max(last, list[i].end || list[i].t); continue; }
      var j2 = i;
      while (j2 < list.length && list[j2].t == null) j2++;
      var next = j2 < list.length ? list[j2].t : (isFinite(audio.duration) ? audio.duration : last + 8 * (j2 - i)), a = i === 0 ? 0 : last, n = j2 - i;
      for (var q = i; q < j2; q++) list[q].t = a + (Math.max(a, next) - a) * (q - i) / n;
      i = j2 - 1;
    }
    return list.map(function (s) { return { t: Math.max(0, Math.round(s.t * 100) / 100), name: s.name, lines: s.lines, rows: s.rows, unheard: !!s.unheard }; });
  }
  // HERESY 1169 · 1358 (from SUNO v6, TODO.md: «The boundaries snapped to the music's own changes (spectral novelty) and the instrumental
  // breaks found by the voice's absence; a slice of the spectrogram in the card (Viktor 10.10)»): the lab hears where the take's music
  // changes (lab/takechanges.py: Foote's novelty over its timbre and harmony); each section's start moves to the strongest change within
  // SNAP seconds of it (never past its neighbours); where no voice sings for BREAK seconds inside a section, a Break is laid there and
  // the section goes on after it; a long start or end without a section of its own becomes Intro or Outro
  var SNAP = 1.5, BREAK = 7, waveChanges = {};
  function snapSections(list, changes) {
    if (!list.length || !changes || !changes.length) return list;
    return list.map(function (s, i) {
      if (i === 0 && s.t < 0.5) return s;
      var lo = i > 0 ? list[i - 1].t + 1 : 0, hi = i + 1 < list.length ? list[i + 1].t - 1 : Infinity, best = null;
      changes.forEach(function (c) {
        if (Math.abs(c.t - s.t) <= SNAP && c.t > lo && c.t < hi && (!best || c.strength > best.strength)) best = c;
      });
      return best ? Object.assign({}, s, { t: best.t, snapped: true }) : s;
    });
  }
  function breakSections(list, rows, dur) {
    var heard = (rows || []).filter(function (r) { return !r.guessed && isFinite(r.start) && isFinite(r.end); }).sort(function (a, b) { return a.start - b.start; });
    if (!list.length || heard.length < 2) return list;
    var out = list.slice(), has = function (a, b) { return out.some(function (s) { return s.t > a + 0.5 && s.t < b - 0.5; }); };
    for (var i = 0; i + 1 < heard.length; i++) {
      var a = heard[i].end, b = heard[i + 1].start;
      if (b - a < BREAK || has(a, b)) continue;          // a gap a section of the lyrics already fills (a tagged solo) stays as it is
      var inside = null, next = null;                    // the section the gap falls in (the latest begun by then), the one after it
      out.forEach(function (s) { if (s.t <= a && (!inside || s.t > inside.t)) inside = s; if (s.t > a + 0.5 && (!next || s.t < next.t)) next = s; });
      if (!inside) continue;
      out.push({ t: Math.round((a + 0.3) * 100) / 100, name: "Break", lines: [], rows: [], heard: "no voice" });
      if (!next || Math.abs(next.t - b) > 1.5) out.push(Object.assign({}, inside, { t: Math.round((b - 0.2) * 100) / 100, resumed: true }));   // inside it: it goes on after
    }
    var first = heard[0].start, last = heard[heard.length - 1].end;
    if (first >= BREAK && !out.some(function (s) { return s.t < first - 1 && !s.lines.length; }) && out[0] && out[0].t > 1) out.push({ t: 0, name: "Intro", lines: [], rows: [], heard: "no voice" });
    if (isFinite(dur) && dur - last >= BREAK + 1 && !has(last, dur + 1)) out.push({ t: Math.round((last + 0.3) * 100) / 100, name: "Outro", lines: [], rows: [], heard: "no voice" });
    return out.sort(function (x, y) { return x.t - y.t; });
  }
  window.ruachWaveSnap = { snap: snapSections, breaks: breakSections };   // for the checks
  function machineCards() {                                  // how many cards the lab sees, once
    if (STATE.machineCards != null) return Promise.resolve(STATE.machineCards);
    return fetch("/lab/machine").then(function (r) { return r.ok ? r.json() : null; })
      .then(function (m) { STATE.machineCards = m && Array.isArray(m.cards) ? m.cards.length : 0; return STATE.machineCards; }).catch(function () { return 0; });
  }
  function timeSections(name, force) {                       // the lab's karaoke timing of a take, then its sections from it
    if (sectionsAsked[name] === "running") return Promise.reject(new Error("already being heard"));
    sectionsAsked[name] = "running";
    bindingChanged();                                        // HERESY 1409: the wave says «wait»
    var poll = function (first) {
      return fetch("/lab/timing?name=" + encodeURIComponent(name) + (first && force ? "&force=1" : ""))
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { code: r.status, d: d }; }); })
        .then(function (x) {
          if (x.code === 202 || (x.d && (x.d.status === "queued" || x.d.status === "running"))) return new Promise(function (ok) { setTimeout(ok, 2500); }).then(function () { return poll(false); });
          if (x.code >= 400 || !x.d || !x.d.rows) throw new Error((x.d && (x.d.error || x.d.message)) || ("HTTP " + x.code));
          return x.d;
        });
    };
    return poll(true).then(function (d) {
      sectionsAsked[name] = "done"; sectionsTimed[name] = d;
      var t = findTake(name);
      if (t && STATE.playerTake && STATE.playerTake.name === name) loadWaveSections(t);
      return d;
    }, function (e) { sectionsAsked[name] = "failed"; bindingChanged(); throw e; });
  }
  // HERESY 1498 (Viktor 16.10.2026: «кнопку выключения Whisper отрисовки секций и лирики. Это полезно, когда херачишь кучу тестов, и каждый раз
  // Whisper забирает ресурсы… Режим минималки в волне плеера»): on until turned off, kept in this browser; off, the wave is bare: no Whisper,
  // no sections, no lines over it
  function waveEar() { return recall("yue2.waveEar") !== "off"; }
  function paintWaveEar() {
    var b = $("waveEarBtn");
    if (b) { b.setAttribute("aria-pressed", waveEar() ? "true" : "false"); b.classList.toggle("is-on", waveEar()); }
  }
  if ($("waveEarBtn")) $("waveEarBtn").addEventListener("click", function () {
    store("yue2.waveEar", waveEar() ? "off" : null);
    paintWaveEar();
    var t = STATE.playerTake && findTake(STATE.playerTake.name);
    if (t) loadWaveSections(t); else drawWave();
  });
  paintWaveEar();
  function loadWaveSections(take) {
    var name = take.name;
    if (!waveEar()) { STATE.waveSections = { name: name, list: [], how: "" }; STATE.waveReplaced = null; drawWave(); return; }   // HERESY 1498: the bare wave
    STATE.waveSections = { name: name, list: [], how: "" };
    STATE.waveReplaced = null;                               // HERESY 1414: what of it was sung anew, for the wave's mark
    if (take.session) return;
    fetch("/lab/section/mark?name=" + encodeURIComponent(name), { priority: "low" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (m) {
      if (m && +m.b > +m.a && STATE.playerTake && STATE.playerTake.name === name) { STATE.waveReplaced = { name: name, a: +m.a, b: +m.b, section: m.section || "", parts: m.parts || null }; drawWave(); }
    }).catch(function () {});
    var tagged = taggedParts(take.lyrics) >= 2;
    var timed = !tagged ? Promise.resolve(null) : sectionsTimed[name] ? Promise.resolve(sectionsTimed[name])
      : fetch("/lab/timing?cached=1&name=" + encodeURIComponent(name), { priority: "low" }).then(function (r) { return r.ok ? r.json() : null; })
          .then(function (d) { if (d && d.rows) { sectionsTimed[name] = d; return d; } return null; }).catch(function () { return null; });
    var got = take.has_score ? getRequest(take).then(function (req) { return (req && req.abc) || ""; })
      : sectionsNone[name] ? Promise.resolve("")
      : fetch("/lab/score?name=" + encodeURIComponent(name)).then(function (r) { return r.ok ? r.json() : null; })
          .then(function (d) { if (!d || !d.abc) sectionsNone[name] = true; return (d && d.abc) || ""; });
    var heardChanges = waveChanges[name] ? Promise.resolve(waveChanges[name])   // HERESY 1358: the music's own changes, asked once a take
      : fetch("/lab/changes?name=" + encodeURIComponent(name), { priority: "low" }).then(function (r) { return r.ok ? r.json() : null; })
          .then(function (d) { var c = (d && d.changes) || []; waveChanges[name] = c; return c; }).catch(function () { return []; });
    Promise.all([timed, got.catch(function () { return ""; }), heardChanges]).then(function (x) {
      if (!STATE.playerTake || STATE.playerTake.name !== name) return;
      var ear = x[0] ? earSections(take.lyrics, x[0].rows) : [];
      if (ear.length) ear = breakSections(ear, x[0].rows, isFinite(audio.duration) ? audio.duration : take.seconds);   // HERESY 1358
      STATE.waveSections = ear.length ? { name: name, list: snapSections(ear, x[2]), how: "ear" } : { name: name, list: snapSections(sectionsFrom(x[1]), x[2]), how: "score" };
      drawWave();
      // by itself on a machine of two cards or more, where Whisper takes a card of its own (never on a test page)
      if (!ear.length && tagged && !sectionsAsked[name] && !navigator.webdriver && !/[?&]scope=/.test(location.search)) {
        machineCards().then(function (n) { if (n >= 2 && STATE.playerTake && STATE.playerTake.name === name) timeSections(name, false).catch(function () {}); });
      }
    }).catch(function () {});
  }
  window.ruachEarSections = earSections;                     // HERESY 1315: for the checks
  // HERESY 1414 (Viktor 13.10.2026: «Межтактная склейка - это правильный ход… Внедряй в полноформатный плеер»): Replace a section.
  // The cuts lie in rests heard by ear: halfway from the last line before the section to its first line, and up to two seconds after its last
  // line (no further than halfway to the next): the lab keeps the take's codes outside them, the model sings what is inside anew
  function sectionCut(list, i) {
    var s = list[i];
    if (!s || !s.rows || !s.rows.length || s.resumed || s.rows[0].guessed || s.rows[s.rows.length - 1].guessed) return null;
    var first = s.rows[0].start, last = s.rows[s.rows.length - 1].end, prev = null, next = null, j;
    for (j = i - 1; j >= 0 && prev === null; j--) if (list[j].rows && list[j].rows.length && !list[j].resumed) prev = list[j].rows[list[j].rows.length - 1].end;
    for (j = i + 1; j < list.length && next === null; j++) if (list[j].rows && list[j].rows.length && !list[j].resumed) next = list[j].rows[0].start;
    var dur = isFinite(audio.duration) && audio.duration > 0 ? audio.duration : last + 2;
    var a = prev !== null && prev < first ? (prev + first) / 2 : Math.max(0, first - 0.3);
    var b = next !== null && next > last ? Math.min(last + 2, (last + next) / 2) : Math.min(last + 2, dur);
    return b - a >= 2 ? { a: Math.round(a * 100) / 100, b: Math.round(b * 100) / 100 } : null;
  }
  function sectionOcc(list, i) {                             // which of the sections of the same name and words it is
    var key = list[i].name + "\n" + (list[i].lines || []).join("\n"), n = 0;
    for (var j = 0; j < i; j++) if (!list[j].resumed && list[j].name + "\n" + (list[j].lines || []).join("\n") === key) n++;
    return n;
  }
  function lyricBlock(lyrics, name, lines, occ) {           // the section's own lines in the lyrics, as written (directions and all)
    var raw = String(lyrics || "").split(/\r?\n/), parts = [], cur = null;
    raw.forEach(function (l, i) {
      var tag = l.trim().match(/^\[([^\]]+)\]/);
      if (tag) { cur = { name: tag[1].trim(), from: i + 1, to: i + 1 }; parts.push(cur); return; }
      if (!cur) { cur = { name: "", from: 0, to: 0 }; parts.push(cur); }
      cur.to = i + 1;
    });
    var key = (lines || []).join("\n"), seen = 0;
    for (var k = 0; k < parts.length; k++) {
      var p = parts[k], sung = raw.slice(p.from, p.to).map(function (l) { return l.trim(); }).filter(function (l) { return l && l.charAt(0) !== "("; }).join("\n");
      if ((p.name || "Lyrics") === name && sung === key && seen++ === (occ || 0)) {
        var to = p.to;
        while (to > p.from && !raw[to - 1].trim()) to--;
        return { raw: raw, from: p.from, to: to, text: raw.slice(p.from, to).join("\n") };
      }
    }
    return null;
  }
  function replaceBlock(lyrics, name, lines, occ, text) {
    var b = lyricBlock(lyrics, name, lines, occ);
    if (!b) return null;
    return b.raw.slice(0, b.from).concat(String(text).replace(/\s+$/, "").split(/\r?\n/), b.raw.slice(b.to)).join("\n");
  }
  function syllables(text) {                                 // the vowels sung: tags and (directions) left out
    return String(text || "").split(/\r?\n/).filter(function (l) { l = l.trim(); return l && l.charAt(0) !== "[" && l.charAt(0) !== "("; })
      .join(" ").replace(/\([^)]*\)/g, " ").replace(/[^aeiouyаеёиоуыэюяіїєαεηιουωάέήίόύώ]/gi, "").length;
  }
  window.ruachSectionCut = sectionCut; window.ruachLyricBlock = lyricBlock; window.ruachReplaceBlock = replaceBlock; window.ruachSyllables = syllables;
  window.ruachPlayerTake = function () { return STATE.playerTake ? findTake(STATE.playerTake.name) : null; };   // for the checks
  window.ruachReplacedMark = function (m) { STATE.waveReplaced = m && STATE.playerTake ? Object.assign({ name: STATE.playerTake.name }, m) : null; drawWave(); return STATE.waveReplaced; };
  // HERESY 1425 (Viktor 13.10.2026: «Может можно добить так, чтобы множественные секции редактировать одним махом?»): the section
  // clicked, checked, and every other heard clearly beside it to check too; each checked one its own words; sung anew in one go
  // HERESY 1757 (TODO 6а; Viktor 15.10.2026: «растяжка до и после выбранного сегмента, в окне свои адаптеры, силы и волны»; «на волне плеера
  // выбирается окно»; 23.10.2026: «6б — начинай заканчивать»): a window of the take sung anew with adapters of its own, laid on its wave in a
  // dialog (a drag lays it, its edges move it; the section under the pointer the first guess). Over the ramps before and after it the take's own
  // adapters give way to the window's and back (lab/section.py window: the take's codes kept to the first ramp, one replay on its sound seed).
  var WIN_SHAPES = [["", "Flat"], ["arch", "Arch"], ["rise", "Rise"], ["fall", "Fall"]];
  function winClock(t) { var m = Math.floor(t / 60), s = t - m * 60; return m + ":" + (s < 9.95 ? "0" : "") + s.toFixed(1); }
  function winParse(v) {
    var m = /^\s*(?:(\d+):)?(\d+(?:[.,]\d+)?)\s*$/.exec(String(v || ""));
    return m ? (+(m[1] || 0)) * 60 + parseFloat(m[2].replace(",", ".")) : NaN;
  }
  function singWindow(take, t0) {
    var L = isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
    if (!L || !STATE.playerTake || STATE.playerTake.name !== take.name) return toast("Play the take first: its window is laid on its wave", "bad");
    var list = waveSections(), sec = sectionAt(t0), si = sec ? list.indexOf(sec) : -1;
    var W = sec ? { a: sec.t, b: si + 1 < list.length ? list[si + 1].t : L } : { a: Math.max(0, t0 - 5), b: Math.min(L, t0 + 5) };
    if (W.b - W.a < 1) W = { a: Math.max(0, t0 - 5), b: Math.min(L, t0 + 5) };
    W.pre = 2; W.post = 2;
    var cat = window.YueLoras ? YueLoras.catalog().filter(function (e) { return e && e.id; }) : [];
    var rows = (Array.isArray(take.loras) ? take.loras : []).filter(function (c) { return c && c.id; }).map(function (c) { return { id: c.id, ar: +c.ar || 0, nar: +c.nar || 0, curve: "" }; });
    var lname = function (id) { return window.YueLoras ? YueLoras.name(id) : id; };
    var back = document.createElement("div");
    back.className = "hd-back";
    back.innerHTML = '<div class="hd-box hd-section hd-window" role="dialog" aria-modal="true" aria-label="Sing a window anew"><div class="hd-title">Sing a window anew</div>' +
      '<p class="hd-say">A stretch of the take sung anew with adapters of its own: drag along the wave to lay the window, drag its edges to move them. Over the ramps before and after it the take&#39;s own adapters give way to the window&#39;s and back; the rest of the take stays as it is.</p>' +
      '<canvas class="hw-wave" height="96" aria-label="The take&#39;s wave: drag to lay the window"></canvas>' +
      '<div class="hw-times"><label>From<input type="text" class="hw-a mono" inputmode="decimal" spellcheck="false"></label><label>To<input type="text" class="hw-b mono" inputmode="decimal" spellcheck="false"></label>' +
      '<label>Ramp before, s<input type="number" class="hw-pre" min="0" max="10" step="0.5"></label><label>Ramp after, s<input type="number" class="hw-post" min="0" max="10" step="0.5"></label>' +
      '<span class="row-hint mono hw-len" translate="no"></span></div>' +
      '<div class="hw-sub">Adapters in the window</div><div class="hw-rows"></div>' +
      '<div class="hw-more"><button type="button" class="btn ghost small hw-add">+ Adapter</button><span class="row-hint hw-none">No adapters: the window is sung anew on the bare model</span></div>' +
      '<details class="hw-lyr"><summary>Lyrics</summary><textarea class="hd-text mono" rows="7" spellcheck="false" translate="no"></textarea></details>' +
      '<div class="hd-acts"><select class="hd-versions" aria-label="Versions"><option value="2">Two versions</option><option value="1">One version</option></select>' +
      '<span class="hd-spacer"></span><button type="button" class="btn ghost small hd-no">Cancel</button><button type="button" class="btn small primary hd-yes">Sing it anew</button></div></div>';
    document.body.appendChild(back);
    var q1 = function (s) { return back.querySelector(s); }, cv = q1(".hw-wave"), drag = null;
    q1(".hd-text").value = take.lyrics || "";
    var paintTimes = function () {
      q1(".hw-a").value = winClock(W.a); q1(".hw-b").value = winClock(W.b); q1(".hw-pre").value = W.pre; q1(".hw-post").value = W.post;
      q1(".hw-len").textContent = winClock(W.b - W.a) + (W.pre || W.post ? " + " + W.pre + " / " + W.post + " s" : "");
      q1(".hd-yes").disabled = W.b - W.a < 1;
    };
    var draw = function () {
      var r = cv.getBoundingClientRect(), w = Math.max(100, Math.round(r.width)), h = 96, dpr = window.devicePixelRatio || 1;
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      var g = cv.getContext("2d"), css = getComputedStyle(cv), ink = css.getPropertyValue("--ink").trim() || "#ddd", dim = css.getPropertyValue("--dim").trim() || "#888",
        acc = css.getPropertyValue("--amber").trim() || "#d99d10", X = function (t) { return t / L * w; }, pk = STATE.peaks && STATE.peaks !== "none" ? STATE.peaks : null;
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
      if (pk) {
        g.fillStyle = dim;
        for (var x = 0; x < w; x++) {
          var i0 = Math.floor(x / w * pk.length), i1 = Math.max(i0 + 1, Math.floor((x + 1) / w * pk.length)), m = 0;
          for (var i = i0; i < i1 && i < pk.length; i++) if (pk[i] > m) m = pk[i];
          var y = Math.max(1, m * (h / 2 - 4)); g.fillRect(x, h / 2 - y, 1, 2 * y);
        }
      }
      g.fillStyle = dim; g.globalAlpha = 0.6;
      list.forEach(function (s) { g.fillRect(Math.round(X(s.t)), 0, 1, h); });
      g.globalAlpha = 1;
      var A = Math.max(0, W.a - W.pre), B = Math.min(L, W.b + W.post), gr = g.createLinearGradient(X(A), 0, X(W.a) + 0.01, 0);
      gr.addColorStop(0, "rgba(217,157,16,0)"); gr.addColorStop(1, "rgba(217,157,16,.35)");
      g.fillStyle = gr; g.fillRect(X(A), 0, X(W.a) - X(A), h);
      g.fillStyle = "rgba(217,157,16,.35)"; g.fillRect(X(W.a), 0, X(W.b) - X(W.a), h);
      gr = g.createLinearGradient(X(W.b), 0, X(B) + 0.01, 0); gr.addColorStop(0, "rgba(217,157,16,.35)"); gr.addColorStop(1, "rgba(217,157,16,0)");
      g.fillStyle = gr; g.fillRect(X(W.b), 0, X(B) - X(W.b), h);
      g.fillStyle = acc; g.fillRect(Math.round(X(W.a)) - 1, 0, 2, h); g.fillRect(Math.round(X(W.b)) - 1, 0, 2, h);
      g.fillStyle = ink; g.font = "10px " + (css.getPropertyValue("--mono").trim() || "monospace"); g.textBaseline = "top";
      var la = winClock(W.a), lb = winClock(W.b);
      g.fillText(la, Math.min(w - g.measureText(la).width - 2, X(W.a) + 4), 3); g.fillText(lb, Math.max(2, X(W.b) - g.measureText(lb).width - 4), h - 13);
    };
    var paintRows = function () {
      q1(".hw-rows").innerHTML = rows.map(function (c, k) {
        var known = cat.some(function (e) { return e.id === c.id; });
        return '<div class="hw-row" data-k="' + k + '"><label>Adapter<select class="hw-id" translate="no">' +
          (known ? "" : '<option value="' + escape(c.id) + '" selected>' + escape(lname(c.id)) + "</option>") +
          cat.map(function (e) { return '<option value="' + escape(e.id) + '"' + (e.id === c.id ? " selected" : "") + ">" + escape(lname(e.id)) + "</option>"; }).join("") + "</select></label>" +
          '<label>Music<input type="number" class="hw-ar" min="0" max="2" step="0.05" value="' + c.ar + '"></label>' +
          '<label>Sound<input type="number" class="hw-nar" min="0" max="2" step="0.05" value="' + c.nar + '"></label>' +
          '<span class="hw-shape mc-chips" role="group" aria-label="Its wave over the window">' + WIN_SHAPES.map(function (s) {
            return '<button type="button" class="mc-chip' + (c.curve === s[0] ? " is-on" : "") + '" data-shape="' + s[0] + '" aria-pressed="' + (c.curve === s[0]) + '">' + s[1] + "</button>"; }).join("") + "</span>" +
          '<button type="button" class="mx-ms hw-del" aria-label="Remove" data-tip="Remove">\u2715</button></div>';
      }).join("");
      q1(".hw-none").hidden = rows.length > 0;
      q1(".hw-add").disabled = rows.length >= 8 || !cat.length;
    };
    var tAt = function (ev) { var r = cv.getBoundingClientRect(); return Math.max(0, Math.min(L, (ev.clientX - r.left) / r.width * L)); };
    var px = function (t) { return t / L * cv.getBoundingClientRect().width; };
    cv.addEventListener("pointerdown", function (ev) {
      if (ev.button !== 0) return;
      ev.preventDefault();
      var x = ev.clientX - cv.getBoundingClientRect().left, t = tAt(ev);
      drag = Math.abs(x - px(W.a)) <= 6 ? { k: "a" } : Math.abs(x - px(W.b)) <= 6 ? { k: "b" } : { k: "new", t0: t };
      if (drag.k === "new") { W.a = t; W.b = t; }
      try { cv.setPointerCapture(ev.pointerId); } catch (x2) { /* gone */ }
      paintTimes(); draw();
    });
    cv.addEventListener("pointermove", function (ev) {
      if (!drag) { var x = ev.clientX - cv.getBoundingClientRect().left; cv.style.cursor = Math.abs(x - px(W.a)) <= 6 || Math.abs(x - px(W.b)) <= 6 ? "ew-resize" : "crosshair"; return; }
      var t = tAt(ev);
      if (drag.k === "a") W.a = Math.min(t, W.b - 1); else if (drag.k === "b") W.b = Math.max(t, W.a + 1); else { W.a = Math.min(drag.t0, t); W.b = Math.max(drag.t0, t); }
      W.a = Math.max(0, W.a); W.b = Math.min(L, W.b);
      paintTimes(); draw();
    });
    cv.addEventListener("pointerup", function () {
      if (drag && drag.k === "new" && W.b - W.a < 1) { W.b = Math.min(L, W.a + 1); W.a = Math.max(0, W.b - 1); }   // a click: a second from there
      drag = null; paintTimes(); draw();
    });
    back.addEventListener("input", function (e) {
      var row = e.target.closest(".hw-row"), c = row && rows[+row.dataset.k];
      if (c && e.target.classList.contains("hw-ar")) c.ar = Math.max(0, Math.min(2, +e.target.value || 0));
      if (c && e.target.classList.contains("hw-nar")) c.nar = Math.max(0, Math.min(2, +e.target.value || 0));
      if (e.target.classList.contains("hw-pre")) { W.pre = Math.max(0, Math.min(10, +e.target.value || 0)); draw(); }
      if (e.target.classList.contains("hw-post")) { W.post = Math.max(0, Math.min(10, +e.target.value || 0)); draw(); }
    });
    back.addEventListener("change", function (e) {
      var row = e.target.closest(".hw-row"), c = row && rows[+row.dataset.k];
      if (c && e.target.classList.contains("hw-id")) c.id = e.target.value;
      if (e.target.classList.contains("hw-a") || e.target.classList.contains("hw-b")) {
        var a = winParse(q1(".hw-a").value), b = winParse(q1(".hw-b").value);
        if (isFinite(a) && isFinite(b) && a >= 0 && b - a >= 1) { W.a = a; W.b = Math.min(L, b); }
      }
      paintTimes(); draw();
    });
    var done = function (go) {
      document.removeEventListener("keydown", key, true);
      if (go && W.b - W.a < 1) return;
      var body = { name: take.name, a: Math.round(W.a * 100) / 100, b: Math.round(W.b * 100) / 100, pre: W.pre, post: W.post, lyrics: q1(".hd-text").value,
        versions: +q1(".hd-versions").value, loras: rows.map(function (c) { return { id: c.id, ar: c.ar, nar: c.nar, curve: c.curve }; }) };
      back.classList.add("is-leaving");
      setTimeout(function () { back.remove(); }, 120);
      if (!go) return;
      wsGuard().then(function () {                   // HERESY 1434: a workspace that takes new takes, first
        return fetch("/lab/section/window", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      })
        .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || "HTTP " + r.status); return d; }); })
        .then(function (d) { toast("Sung anew: its versions come as takes of their own, children of this one"); pollJobs(); if (d && d.id) followSection(d.id); },
              function (e) { toast(e.message, "bad"); });
    };
    back.addEventListener("click", function (e) {
      var row = e.target.closest(".hw-row"), c = row && rows[+row.dataset.k], sb = e.target.closest("[data-shape]");
      if (c && sb) { c.curve = sb.dataset.shape; paintRows(); return; }
      if (c && e.target.closest(".hw-del")) { rows.splice(+row.dataset.k, 1); paintRows(); return; }
      if (e.target.closest(".hw-add")) {
        var free = cat.filter(function (x) { return !rows.some(function (r2) { return r2.id === x.id; }); })[0];
        if (free) rows.push({ id: free.id, ar: 0.5, nar: 0.5, curve: "" });
        paintRows(); return;
      }
      if (e.target.closest(".hd-no")) return done(false);
      if (e.target.closest(".hd-yes")) return done(true);
    });
    var key = function (e) {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); done(false); }
      else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.stopPropagation(); done(true); }
    };
    document.addEventListener("keydown", key, true);
    back.addEventListener("mousedown", function (e) { if (e.target === back) done(false); });
    paintTimes(); paintRows();
    requestAnimationFrame(function () { back.classList.add("is-on"); draw(); });
  }
  window.ruachSingWindow = function (name, t) { var tk = findTake(name); if (tk) singWindow(tk, t); };   // for the checks
  function replaceSection(take, at) {
    var list = waveSections(), cands = [];
    list.forEach(function (sec, i) {
      var cut = sec.resumed ? null : sectionCut(list, i), occ = cut ? sectionOcc(list, i) : 0, blk = cut ? lyricBlock(take.lyrics, sec.name, sec.lines, occ) : null;
      if (cut && blk) cands.push({ section: sec, cut: cut, occ: occ, text: blk.text, before: syllables(blk.text), on: sec === at.section });
    });
    if (!cands.some(function (c) { return c.on; })) return toast("This section cannot be replaced: its lines were not heard clearly", "bad");
    var back = document.createElement("div");
    back.className = "hd-back";
    back.innerHTML = '<div class="hd-box hd-section" role="dialog" aria-modal="true" aria-label="Replace a section"><div class="hd-title">Replace a section</div>' +
      '<p class="hd-say">Its words as the lyrics have them: change what you will, and it is sung anew from its start to its end; the rest of the take stays as it is.</p>' +
      '<div class="hd-parts" role="group" aria-label="Sections to sing anew">' + cands.map(function (c, k) {
        return '<label class="hd-part"><input type="checkbox" data-k="' + k + '"' + (c.on ? " checked" : "") + '> <b translate="no">' + escape(c.section.name) +
          '</b> <span class="mono" translate="no">' + clock(c.cut.a) + "–" + clock(c.cut.b) + "</span></label>";
      }).join("") + "</div>" +
      '<div class="hd-texts"></div>' +
      '<div class="hd-acts"><select class="hd-versions" aria-label="Versions"><option value="2">Two versions</option><option value="1">One version</option></select>' +
      '<span class="hd-spacer"></span><button type="button" class="btn ghost small hd-no">Cancel</button><button type="button" class="btn small primary hd-yes">Sing it anew</button></div></div>';
    document.body.appendChild(back);
    var texts = back.querySelector(".hd-texts");
    var weigh = function (c, el) {
      var now = syllables(c.text), d = now - c.before, much = Math.abs(d) >= Math.max(2, Math.round(c.before * 0.1)), warn = el.querySelector(".hd-warn");
      warn.hidden = !much;
      if (!much) return;
      warn.querySelector(".hd-warn-say").textContent = d > 0 ? "More syllables than the section held: the model sings them faster, or runs over the cut"
        : "Fewer syllables than the section held: the model may stretch them or leave a rest";
      warn.querySelector(".hd-warn-n").textContent = (d > 0 ? "+" : "") + d;
    };
    var paintTexts = function () {
      texts.innerHTML = "";
      cands.forEach(function (c) {
        if (!c.on) return;
        var el = document.createElement("div");
        el.className = "hd-one";
        el.innerHTML = '<div class="hd-body"><b translate="no">' + escape(c.section.name) + '</b> <span class="mono" translate="no">' + clock(c.cut.a) + "–" + clock(c.cut.b) + "</span></div>" +
          '<textarea class="hd-text mono" rows="' + (cands.filter(function (x) { return x.on; }).length > 1 ? 5 : 7) + '" spellcheck="false" translate="no"></textarea>' +
          '<p class="hd-warn" hidden><span class="hd-warn-say"></span> <b class="mono hd-warn-n" translate="no"></b></p>';
        var box = el.querySelector(".hd-text");
        box.value = c.text;
        box.addEventListener("input", function () { c.text = box.value; weigh(c, el); });
        texts.appendChild(el);
        weigh(c, el);
      });
      back.querySelector(".hd-yes").disabled = !cands.some(function (c) { return c.on; });
    };
    back.querySelector(".hd-parts").addEventListener("change", function (e) {
      var c = cands[+e.target.dataset.k];
      if (c) { c.on = e.target.checked; paintTexts(); }
    });
    paintTexts();
    var done = function (go) {
      document.removeEventListener("keydown", key, true);
      back.classList.add("is-leaving");
      setTimeout(function () { back.remove(); }, 120);
      if (!go) return;
      var on = cands.filter(function (c) { return c.on; }), lyrics = take.lyrics;
      // the last first: a section's words changed never move the place of one before it
      on.slice().sort(function (x, y) { return y.cut.a - x.cut.a; }).forEach(function (c) {
        if (lyrics !== null) lyrics = replaceBlock(lyrics, c.section.name, c.section.lines, c.occ, c.text);
      });
      if (!on.length || lyrics === null) return toast("This section cannot be replaced: its lines were not heard clearly", "bad");
      var parts = on.map(function (c) { return { a: c.cut.a, b: c.cut.b, section: c.section.name }; }), versions = +back.querySelector(".hd-versions").value;
      wsGuard().then(function () {                   // HERESY 1434: a workspace that takes new takes, first
        return fetch("/lab/section", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: take.name, a: parts[0].a, b: parts[0].b, section: parts[0].section, parts: parts, lyrics: lyrics, versions: versions }) });
      })
        .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || "HTTP " + r.status); return d; }); })
        .then(function (d) { toast("Sung anew: its versions come as takes of their own, children of this one"); pollJobs(); if (d && d.id) followSection(d.id); },
              function (e) { toast(e.message, "bad"); });
    };
    var key = function (e) {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); done(false); }
      else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.stopPropagation(); done(true); }
    };
    document.addEventListener("keydown", key, true);
    back.addEventListener("mousedown", function (e) { if (e.target === back) done(false); });
    back.querySelector(".hd-yes").addEventListener("click", function () { done(true); });
    back.querySelector(".hd-no").addEventListener("click", function () { done(false); });
    requestAnimationFrame(function () { back.classList.add("is-on"); var b = back.querySelector(".hd-text"); if (b) b.focus(); });
  }
  // HERESY 1718 (RIVALS 13, «перепеть одну строку»): one line of a section heard by ear sung anew, the rest of the take as it was; Replace a
  // section's own job (the lab's /section), its cuts halfway to the lines around it (the section's own cut at its first and last line)
  function lineAt(at) {                                 // the line under the pointer: {k, n, a, b, line}, {short: true} under two seconds, or null
    var sec = at && at.section, rows = (sec && sec.rows) || [];
    if (!rows.length || at.t == null) return null;
    var j = 0, best = Infinity;
    rows.forEach(function (r, i) { var d = at.t < r.start ? r.start - at.t : at.t > r.end ? at.t - r.end : 0; if (d < best) { best = d; j = i; } });
    var r = rows[j];
    if (r.guessed || !sec.lines[r.k]) return null;
    var a = j > 0 ? (rows[j - 1].end + r.start) / 2 : at.cut.a, b = j < rows.length - 1 ? (r.end + rows[j + 1].start) / 2 : at.cut.b;
    a = Math.round(Math.max(a, at.cut.a) * 100) / 100; b = Math.round(Math.min(b, at.cut.b) * 100) / 100;
    return b - a >= 2 ? { k: r.k, n: r.k + 1, a: a, b: b, line: sec.lines[r.k] } : { short: true };
  }
  function replaceLine(lyrics, sec, occ, k, text) {     // the lyrics with the section's k-th sung line (directions not counted) changed, or null
    var blk = lyricBlock(lyrics, sec.name, sec.lines, occ);
    if (!blk) return null;
    var n = -1, at = -1;
    for (var i = blk.from; i < blk.to && at < 0; i++) {
      var l = blk.raw[i].trim();
      if (l && l.charAt(0) !== "(" && ++n === k) at = i;
    }
    if (at < 0) return null;
    var lead = blk.raw[at].match(/^\s*/)[0];
    return blk.raw.slice(0, at).concat([lead + String(text).replace(/\s+/g, " ").trim()], blk.raw.slice(at + 1)).join("\n");
  }
  function resingLine(take, at) {
    var L = lineAt(at), sec = at.section;
    if (L && L.short) return toast("This line is under two seconds: replace its section instead", "bad");
    if (!L || !lyricBlock(take.lyrics, sec.name, sec.lines, at.occ)) return toast("This line cannot be sung anew: it was not heard clearly", "bad");
    var span = sec.name + ", line " + L.n + " (" + clock(L.a) + "–" + clock(L.b) + ")", words = null;
    return window.HeresyDialog.prompt("Re-sing a line\n\n" + span + ": its words as the lyrics have them. Change them, or keep them and let only the music be new; the rest of the take stays as it is.",
      L.line, { ok: "Next", max: 400, wave: waveFor(take, [waveMark(L.a, L.b, "cut", "sung anew")]) }).then(function (answer) {   // HERESY 1729
      if (answer === null) return;
      words = String(answer).replace(/\s+/g, " ").trim();
      if (!words) return toast("The line is empty", "bad");
      var d = syllables(words) - syllables(L.line);
      if (Math.abs(d) >= Math.max(2, Math.round(syllables(L.line) * 0.15)))
        toast(d > 0 ? "More syllables than the line held: the model sings them faster, or runs over the cut" : "Fewer syllables than the line held: the model may stretch them or leave a rest", "bad");
      return window.HeresyDialog.confirm("Re-sing a line\n\n" + span + " is sung anew on a new music seed, cut halfway to the lines around it; the rest of the take stays as it is. Two versions take two seeds. New takes; this one stays.",
        { ok: "Two versions", alt: "One version", cancel: "Cancel", wave: waveFor(take, [waveMark(L.a, L.b, "cut", "sung anew")]) }).then(function (yes) {   // HERESY 1729
        if (!yes) return;
        var lyrics = replaceLine(take.lyrics, sec, at.occ, L.k, words);
        if (lyrics === null) return toast("This line cannot be sung anew: it was not heard clearly", "bad");
        var part = { a: L.a, b: L.b, section: sec.name + " · line " + L.n };
        return wsGuard().then(function () {
          return fetch("/lab/section", { method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: take.name, a: part.a, b: part.b, section: part.section, parts: [part], lyrics: lyrics, versions: yes === "alt" ? 1 : 2 }) });
        }).then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || "HTTP " + r.status); return d; }); })
          .then(function (d) { toast("Sung anew: its versions come as takes of their own, children of this one"); pollJobs(); if (d && d.id) followSection(d.id); },
                function (e) { toast(e.message, "bad"); });
      });
    });
  }
  window.ruachLineAt = lineAt; window.ruachReplaceLine = replaceLine;   // for the checks
  // HERESY 1715 (Viktor 22.10.2026: «клон 1:1… на лирике это не годится. В таких моментах нужно сид на +1 временно ставить… чтобы была вариация в
  // повторе»): a section heard by ear sung once more right after itself, a variation on the take's music seed + 1 (and + 2), by the lab
  function lyricsTwice(lyrics, name, lines, occ) {      // the lyrics with that section's block written twice in a row, or null
    var blk = lyricBlock(lyrics, name, lines, occ);
    return blk ? blk.raw.slice(0, blk.to).concat(["", "[" + name + "]"], blk.text.split(/\r?\n/), blk.raw.slice(blk.to)).join("\n") : null;
  }
  // HERESY 1717 (Viktor 22.10.2026 on the 1714 and 1715 probes: «Оно заработает, если будет музыкальный переход хоть 5-7 секунд»; «нужен микро
  // проигрыш, который настроит лад для повторения»): the repeat straight on or after music the model writes first, and an interlude the model writes
  // after a section, nothing sung again; the lab cuts each where the voice rests (its own vocal split, on the processor)
  var BREAK_TAG = "Interlude";                          // the music block's tag in the lyrics (Viktor: «пробуй как Interlude, так и Instrumental Break»)
  function lyricsWithInterlude(lyrics, name, lines, occ, again, tag) {   // a music block after the section's (and its lines again after it), or null
    var blk = lyricBlock(lyrics, name, lines, occ);
    if (!blk) return null;
    var add = ["", "[" + (tag || BREAK_TAG) + "]"].concat(again ? ["", "[" + name + "]"].concat(blk.text.split(/\r?\n/)) : []);
    return blk.raw.slice(0, blk.to).concat(add, blk.raw.slice(blk.to)).join("\n");
  }
  function barSeconds(abc) {                            // a bar's seconds by a score's head (M:, Q:), or 0: the lab cuts on its bar lines
    var m = /^M:\s*(C\|?|\d+\s*\/\s*\d+)/m.exec(String(abc || "")), q = /^Q:\s*(?:(\d+)\s*\/\s*(\d+)\s*=\s*)?(\d+(?:\.\d+)?)/m.exec(String(abc || ""));
    if (!m || !q || !+q[3]) return 0;
    var meter = /^C/.test(m[1]) ? 1 : (function (p) { return +p[0] / +p[1]; })(m[1].replace(/\s/g, "").split("/"));
    var sec = meter / (q[1] ? +q[1] / +q[2] : 0.25) * 60 / +q[3];
    return sec >= 0.3 && sec <= 8 ? Math.round(sec * 1000) / 1000 : 0;
  }
  function singOnceMore(take, at, kind) {
    var inter = kind === "interlude";
    var list = waveSections(), i = list.indexOf(at.section), sec = at.section;
    var cut = i >= 0 && !sec.resumed ? sectionCut(list, i) : null, occ = cut ? sectionOcc(list, i) : 0, blk = cut ? lyricBlock(take.lyrics, sec.name, sec.lines, occ) : null;
    if (!cut || !blk) return toast(inter ? "No interlude can go after this section: its lines were not heard clearly" : "This section cannot be sung again: its lines were not heard clearly", "bad");
    var key = inter ? "yue2.interludeGap" : "yue2.onceMoreGap", last = recall(key) || (inter ? "7" : "4");   // HERESY 1721: a breath first, by his ear
    var items = (inter ? [
      { value: "5", label: "About 5 seconds", note: "a short bridge" },
      { value: "7", label: "About 7 seconds", note: "time to turn the mood" },
      { value: "10", label: "About 10 seconds", note: "a passage of its own" }
    ] : [
      { value: "0", label: "Straight on", note: "its lines again at once" },
      { value: "4", label: "After a breath", note: "about 4 s of music first" },
      { value: "7", label: "After a short interlude", note: "about 7 s of music first" }
    ]).map(function (it) { it.words = true; it.current = it.value === last; return it; });
    var secLen = cut.b - cut.a, waveMarks = function (g) {   // HERESY 1729: the section, and what the model adds after it
      return inter ? [waveMark(cut.a, cut.b, "donor", sec.name), waveMark(cut.b, cut.b + (+g || 0), "place", "interlude")]
                   : [waveMark(cut.a, cut.b, "donor", sec.name), waveMark(cut.b, cut.b + (+g || 0) + secLen, "place", "once more")];
    };
    return window.HeresyDialog.choose(inter ? "Insert an interlude\n\nHow long a passage after " + sec.name + "? The model writes it at its own length near this, and the cut lies where its voice comes back."
                                            : "Sing it once more\n\nHow does " + sec.name + " come back?", items, { cancel: "Cancel", wave: Object.assign(waveFor(take, waveMarks(last)), { forItem: waveMarks }) }).then(function (v) {
      if (v === null || v === undefined) return;
      store(key, v);
      var gap = +v, span = sec.name + " (" + clock(cut.a) + "–" + clock(cut.b) + ")";
      var lyrics2 = inter || gap ? lyricsWithInterlude(take.lyrics, sec.name, sec.lines, occ, !inter) : lyricsTwice(take.lyrics, sec.name, sec.lines, occ);
      var text = inter ? "Insert an interlude\n\nAfter " + span + " the model writes about " + gap + " s of music on the take's music seed + 1, going on from its end; the take's own next section comes in where the model's voice would. Two versions take the seeds + 1 and + 2. New takes; this one stays."
        : gap ? "Sing it once more\n\n" + span + " is sung once more after about " + gap + " s of music: the model goes on from its end with music first, then its lines again, on the take's music seed + 1, so the repeat is a variation, not a copy; the copy ends where the voice rests after them, and the rest of the take follows. Two versions take the seeds + 1 and + 2. New takes; this one stays."
        : "Sing it once more\n\n" + span + " is sung once more right after itself: the model goes on from its end with its lines again and the take's music seed + 1, so the repeat is a variation, not a copy; the rest of the take follows, a section longer. Two versions take the seeds + 1 and + 2. New takes; this one stays.";
      return window.HeresyDialog.confirm(text, { ok: "Two versions", alt: "One version", cancel: "Cancel", wave: waveFor(take, waveMarks(gap)) }).then(function (answer) {
        if (!answer) return;
        var versions = answer === "alt" ? 1 : 2;
        // the score with the bars of the part that holds the section, twice; music the model writes past its score goes without one
        var scored = take.has_score && !inter && !gap ? editScore(take).then(function (abc) {
          if (!abc) return null;
          var sp = scoreParts(abc, take.seconds), best = -1, most = 0;
          sp.parts.forEach(function (q, j) { var o = Math.min(q.end, cut.b) - Math.max(q.t, cut.a); if (o > most) { most = o; best = j; } });
          if (best < 0) return null;
          var order = [];
          sp.parts.forEach(function (q, j) { order.push(j); if (j === best) order.push(j); });
          return arrangeAbc(sp, order) || null;
        }).catch(function () { return null; }) : Promise.resolve(null);
        var bar = editScore(take).then(barSeconds).catch(function () { return 0; });   // for a take without a score of its own
        return Promise.all([scored, wsGuard(), bar]).then(function (got) {
          return fetch("/lab/section/repeat", { method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: take.name, a: cut.a, b: cut.b, section: sec.name, lyrics: lyrics2, versions: versions, abc: got[0],
                                   gap: gap, kind: inter ? "interlude" : "repeat", bar: got[2] || null }) });
        }).then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || "HTTP " + r.status); return d; }); })
          .then(function (d) { toast(inter ? "Interlude asked: its versions come as takes of their own, children of this one" : "Sung once more: its versions come as takes of their own, children of this one"); pollJobs(); if (d && d.id) followSection(d.id); },
                function (e) { toast(e.message, "bad"); });
      });
    });
  }
  window.ruachSingOnceMore = singOnceMore; window.ruachLyricsTwice = lyricsTwice; window.ruachLyricsWithInterlude = lyricsWithInterlude;   // for the checks
  window.ruachBarSeconds = barSeconds;
  // HERESY 1425 (Viktor 13.10.2026: «При генерации семплов с заменённой секции в Takes не появляются 1/2 новых трека, и в Библиотеке в
  // воркспейсе тоже только по F5»): the lab's job followed to its takes; each one landed (in its workspaces too) reads the Takes and the
  // Librarian again. The jobs still running when the page opens are followed as well
  var sectionFollowed = {};
  function followSection(id) {
    if (sectionFollowed[id]) return;
    sectionFollowed[id] = { seen: {}, misses: 0 };
    var f = sectionFollowed[id];
    var tick = function () {
      fetch("/lab/section/job?id=" + encodeURIComponent(id), { priority: "low" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (st) {
        if (!st) { if (++f.misses < 5) setTimeout(tick, 6000); return; }
        f.misses = 0;
        var landed = (st.versions || []).filter(function (v) { return v.take && !f.seen[v.take]; });
        landed.forEach(function (v) { f.seen[v.take] = 1; });
        if (landed.length) {
          refreshLibrary().catch(function () {});
          window.dispatchEvent(new Event("ruach-catalog"));
        }
        if (st.status === "queued" || st.status === "running") setTimeout(tick, 3000);
      }).catch(function () { if (++f.misses < 5) setTimeout(tick, 6000); });
    };
    setTimeout(tick, 3000);
  }
  window.ruachFollowSection = followSection;
  fetch("/lab/section/live", { priority: "low" }).then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) { ((d && d.live) || []).forEach(function (j) { if (j.id) followSection(j.id); }); }).catch(function () {});
  window.ruachLyricParts = lyricParts;
  function sectionAt(t) {
    var at = null;
    waveSections().forEach(function (s) { if (s.t <= t + 0.01) at = s; });
    return at;
  }
  audio.addEventListener("durationchange", function () { if (waveSections().length) drawWave(); });   // the lines need the length
  // for the checks: the sections of a score, or (a list, use) laid on the take in the player
  window.ruachWaveSections = function (abc, use) {
    if (abc === undefined) return STATE.waveSections;
    var list = Array.isArray(abc) ? abc : sectionsFrom(abc);
    if (use && STATE.playerTake) { STATE.waveSections = { name: STATE.playerTake.name, list: list }; drawWave(); }
    return list;
  };
  // HERESY 1280 (TODO.md, the rooms' audit: the take's menu over the player's wave): a right click on the player's wave, its
  // picture or its name opens the menu of the take in the player, as one on the take in a list does
  function playerTakeMenu(event) {
    var t = STATE.playerTake && findTake(STATE.playerTake.name);
    if (!t || t.session) return;
    event.preventDefault();
    STATE.menuSection = null;                              // HERESY 1414: the section under the pointer, heard by ear, for Replace this section
    STATE.menuWhy = null;                                  // HERESY 1734: or why the wave's section edits cannot be had here, said in the menu
    STATE.menuWave = null;                                 // HERESY 1757: where on the wave, for a window
    if (event.currentTarget === $("wave") && isFinite(audio.duration) && audio.duration > 0) {
      var rw = $("wave").getBoundingClientRect();
      STATE.menuWave = { name: t.name, t: Math.max(0, Math.min(1, (event.clientX - rw.left) / rw.width)) * audio.duration };
      var ws = STATE.waveSections || {}, why = "";
      if (ws.how === "ear") {
        var r = $("wave").getBoundingClientRect(), at = Math.max(0, Math.min(1, (event.clientX - r.left) / r.width)) * audio.duration;
        var secs = waveSections(), sec = sectionAt(at), i = secs.indexOf(sec), cut = i >= 0 ? sectionCut(secs, i) : null;
        if (cut) STATE.menuSection = { name: t.name, section: sec, cut: cut, occ: sectionOcc(secs, i), t: at };   // 1718: the moment, for its line
        else why = noCutWhy(secs, i);
      } else {
        why = !waveEar() ? "Sections and lyrics on the wave are off (the player's switch)"
          : (ws.list || []).length ? "These are the score's marks: Find the sections by ear first (in this menu)" : "No sections on the wave yet: Find the sections by ear (in this menu)";
      }
      if (why) STATE.menuWhy = { name: t.name, why: why };
    }
    takeMenu(t.name, event.clientX, event.clientY);
  }
  // HERESY 1734: why a part of the wave takes none of the section edits (the four greyed in the menu, this beside them)
  function noCutWhy(list, i) {
    var s = list[i];
    if (!s) return "No section under the pointer";
    if (s.resumed) return "The rest of a part sung anew: the pointer over the part itself";
    if (!s.rows || !s.rows.length) return "No words here, an instrumental part: the pointer over a sung section";
    if (s.rows[0].guessed || s.rows[s.rows.length - 1].guessed) return "Whisper did not hear its first or last line clearly (marked ?)";
    return "Too short to cut";
  }
  $("wave").addEventListener("contextmenu", playerTakeMenu);
  document.querySelector("#playbar .playbar-id").addEventListener("contextmenu", playerTakeMenu);

  // The server reads the audio once and caches 900 peak values per take. The
  // browser decode below is only the fallback: a take kept in this tab, or a
  // server without the peaks route.
  function loadPeaks(take) {
    var url = takeAudioUrl(take);
    STATE.peaks = STATE.peakCache[url] || null;
    loadWaveSections(take);                                    // HERESY 1282
    drawWave();
    if (STATE.peaks || STATE.peakLoading[url]) return;
    STATE.peakLoading[url] = true;
    var fromServer = take.session ? Promise.reject(new Error("kept in this tab"))
      : api("/library/peaks?name=" + encodeURIComponent(take.name)).then(function (data) {
          if (!data || !Array.isArray(data.peaks) || !data.peaks.length) throw new Error("no peaks");
          return Float32Array.from(data.peaks);
        });
    fromServer.catch(function () {
      return fetch(url).then(function (r) {
        if (!r.ok) throw new Error(r.status + "");
        return r.arrayBuffer();
      }).then(decodePeaks);
    }).then(function (peaks) {
      STATE.peakCache[url] = peaks;
      var keys = Object.keys(STATE.peakCache);
      if (keys.length > 80) delete STATE.peakCache[keys[0]];
      if (STATE.playerTake && takeAudioUrl(STATE.playerTake) === url) { STATE.peaks = peaks; drawWave(); }
    }).catch(function () {
      if (STATE.playerTake && takeAudioUrl(STATE.playerTake) === url) { STATE.peaks = "none"; drawWave(); }
    }).then(function () { delete STATE.peakLoading[url]; });
  }

  function decodePeaks(buffer) {
    var Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!Offline) return Promise.reject(new Error("no decoder"));
    var context = new Offline(2, 1, 48000);
    return context.decodeAudioData(buffer).then(function (decoded) {
      var left = decoded.getChannelData(0), right = decoded.numberOfChannels > 1 ? decoded.getChannelData(1) : left;
      var buckets = 900, size = Math.max(1, Math.floor(left.length / buckets)), peaks = new Float32Array(buckets);
      for (var i = 0; i < buckets; i++) {
        var max = 0, start = i * size, end = Math.min(left.length, start + size);
        for (var j = start; j < end; j += 2) {
          var value = Math.max(Math.abs(left[j]), Math.abs(right[j]));
          if (value > max) max = value;
        }
        peaks[i] = max;
      }
      return peaks;
    });
  }

  // HERESY 1118: the waveform as a cloud, not a comb (Viktor: «единой сбленденной, без полосок, как облачное
  // распыление»). The peaks become one smooth envelope, mirrored about the middle and drawn in three soft layers: a
  // wide haze, a denser body, a bright core, so the sound thins out at its edges like breath. Drawn once per song,
  // size and theme into two sprites (played, waiting); a frame only cuts them at the playhead.
  var cloud = { peaks: null, w: 0, h: 0, dpr: 0, theme: null, played: null, rest: null };
  // the cloud's strengths, to be tried live from the browser's console (Viktor, 02.10): HeresyWave.set({rest: 0.05,
  // played: 0.6}); rest is the waiting part by day (×3 layers: 0.05 is ~8 % at the core), restNight the same by night,
  // played the part that has sounded (1 = the accent at full). HeresyWave.get() says what is in force.
  var WAVE = { rest: 0.05, restNight: 0.36, played: 0.6, epoch: 0 };
  // HERESY 1167 (Viktor: «рисочки… Попробуй 15% непрозрачности в них добавить»): the bars, over the cloud
  if (!isFinite(WAVE.bars)) WAVE.bars = 0.15;
  window.HeresyWave = {
    get: function () { return { rest: WAVE.rest, restNight: WAVE.restNight, played: WAVE.played, bars: WAVE.bars }; },
    set: function (o) { ["rest", "restNight", "played", "bars"].forEach(function (k) { if (o && isFinite(o[k])) WAVE[k] = Math.max(0, Math.min(1, +o[k])); });
      WAVE.epoch++; drawWave(); return this.get(); }
  };
  function cloudEnvelope(peaks, n) {
    var raw = new Float32Array(n), step = peaks.length / n, i, j;
    for (i = 0; i < n; i++) {                     // the loudest in each column, so no peak falls between two
      var a = Math.floor(i * step), b = Math.max(a + 1, Math.floor((i + 1) * step)), m = 0;
      for (j = a; j < b && j < peaks.length; j++) if (peaks[j] > m) m = peaks[j];
      raw[i] = m;
    }
    var out = new Float32Array(n), R = 4, w = [];
    for (j = -R; j <= R; j++) { w.push(Math.exp(-(j * j) / (2 * 2.2 * 2.2))); }
    for (i = 0; i < n; i++) {                     // a soft blur along time: neighbours lend each other their air
      var v = 0, ws = 0;
      for (j = -R; j <= R; j++) { var k = i + j; if (k < 0 || k >= n) continue; v += raw[k] * w[j + R]; ws += w[j + R]; }
      out[i] = Math.max(v / ws, raw[i] * 0.7);    // the blur rounds a peak, but never flattens it away
    }
    // the song's own shape fills the room: its loud (not its one loudest spike) reaches the edge, a quiet song too
    var s = Array.prototype.slice.call(out).sort(function (a, b) { return a - b; }), top = s[Math.floor(n * 0.98)] || 0;
    if (top > 0.01) { var gain = Math.min(3, 0.92 / top); for (i = 0; i < n; i++) out[i] = Math.pow(Math.min(1, out[i] * gain), 0.75); }   // and heard, not metered: the quiet lifted a little
    return out;
  }
  function cloudSprite(env, w, h, dpr, paint) {
    var c = document.createElement("canvas");
    c.width = Math.floor(w * dpr); c.height = Math.floor(h * dpr);
    var x = c.getContext("2d"), mid = h / 2, room = (h - 6) / 2, n = env.length;
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.fillStyle = paint(x, h);
    [[1.0, 0.32, 3.0], [0.86, 0.50, 1.4], [0.60, 0.80, 0.5]].forEach(function (layer) {
      x.globalAlpha = layer[1];
      x.filter = "blur(" + layer[2] + "px)";
      x.beginPath();
      x.moveTo(0, mid);
      for (var i = 0; i < n; i++) x.lineTo(i * w / (n - 1), mid - Math.max(0.6, env[i] * room * layer[0]));
      for (var k = n - 1; k >= 0; k--) x.lineTo(k * w / (n - 1), mid + Math.max(0.6, env[k] * room * layer[0]));
      x.closePath();
      x.fill();
    });
    x.filter = "none"; x.globalAlpha = 1;
    return c;
  }
  function cloudSprites(peaks, w, h, dpr) {
    if (cloud.peaks !== peaks || cloud.w !== w || cloud.h !== h || cloud.dpr !== dpr || cloud.theme !== themeCache || cloud.epoch !== WAVE.epoch) {
      var env = cloudEnvelope(peaks, Math.max(32, Math.floor(w / 2)));
      cloud = { peaks: peaks, w: w, h: h, dpr: dpr, theme: themeCache, epoch: WAVE.epoch,
        played: cloudSprite(env, w, h, dpr, function (x, hh) {     // the accent, brighter at the crests
          var g = x.createLinearGradient(0, 0, 0, hh);
          g.addColorStop(0, themeRGBA("amber-hi", WAVE.played)); g.addColorStop(0.5, themeRGBA("amber", WAVE.played)); g.addColorStop(1, themeRGBA("amber-hi", WAVE.played));
          return g;
        }),
        rest: cloudSprite(env, w, h, dpr, function () {             // the waiting part: a light grey by day (Viktor: "much lighter,
          var g = themeRGB("ground");                                 // it looks dirty"), as it was by night
          return themeRGBA("ink", (0.2126 * g[0] + 0.7152 * g[1] + 0.0722 * g[2]) / 255 > 0.5 ? WAVE.rest : WAVE.restNight);
        }) };
    }
    return cloud;
  }

  // HERESY 1492: a section's name as much as fits in `room` px: whole; with its long words shortened; cut with «…» (three letters at the least)
  var SECTION_SHORT = { INSTRUMENTAL: "INSTR.", "PRE-CHORUS": "PRE-CH.", "POST-CHORUS": "POST-CH.", INTERLUDE: "INTERL.", BREAKDOWN: "BRKDN", CHORUS: "CH.", VERSE: "V.",
                        BRIDGE: "BR.", OUTRO: "OUT.", INTRO: "INT.", REFRAIN: "REFR.", BREAK: "BRK" };
  function sectionLabel(name, room, ctx) {
    var fits = function (t) { return ctx.measureText(t).width + 6 <= room; };
    if (fits(name)) return name;
    var short = name.split(" ").map(function (w) { return SECTION_SHORT[w] || w; }).join(" ");
    if (fits(short)) return short;
    for (var n = short.length - 1; n >= 3; n--) { var cut = short.slice(0, n).replace(/[\s.]+$/, "") + "…"; if (fits(cut)) return cut; }
    return "";
  }
  function drawWave() {
    var canvas = $("wave");
    if (!canvas.clientWidth) return;
    var dpr = window.devicePixelRatio || 1;
    var width = canvas.clientWidth, height = canvas.clientHeight || 40;
    if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
    }
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    var middle = height / 2;
    ctx.strokeStyle = themeRGBA("ink", 0.08);
    ctx.beginPath();
    ctx.moveTo(0, middle + 0.5);
    ctx.lineTo(width, middle + 0.5);
    ctx.stroke();

    // the waveform belongs to the song in the player, whatever the page is showing (a run, another take)
    if (!STATE.playerTake) return;
    var progress = (isFinite(audio.duration) && audio.duration > 0) ? audio.currentTime / audio.duration : 0;

    if (!STATE.peaks || STATE.peaks === "none") {
      ctx.fillStyle = themeRGBA("ink", 0.22);
      ctx.font = '11px "IBM Plex Mono", monospace';
      ctx.fillText(STATE.peaks === "none" ? "no waveform for this file" : "reading waveform…", 12, middle + 4);
    } else {
      // HERESY 1118: the cloud, cut at the playhead: the played part from the accent sprite, the rest from the quiet one
      var sprites = cloudSprites(STATE.peaks, width, height, dpr), cut = Math.round(progress * canvas.width), ch = canvas.height;
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (cut > 0) ctx.drawImage(sprites.played, 0, 0, cut, ch, 0, 0, cut, ch);
      if (cut < canvas.width) ctx.drawImage(sprites.rest, cut, 0, canvas.width - cut, ch, cut, 0, canvas.width - cut, ch);
      ctx.restore();
      // HERESY 1167 (Viktor: «рисочки… 15% непрозрачности»): the bars the cloud replaced (1118), faint, over it: one every
      // 3 px, the played ones in the accent
      if (WAVE.bars > 0) {
        var peaks = STATE.peaks, bars = Math.min(peaks.length, Math.floor(width / 3)), step = peaks.length / bars;
        var accent = ctx.createLinearGradient(0, 0, 0, height);
        accent.addColorStop(0, themeRGBA("amber-hi", WAVE.bars)); accent.addColorStop(0.5, themeRGBA("amber", WAVE.bars)); accent.addColorStop(1, themeRGBA("amber-hi", WAVE.bars));
        var grey = themeRGBA("ink", WAVE.bars);
        for (var bi = 0; bi < bars; bi++) {
          var bh = Math.max(1.5, peaks[Math.floor(bi * step)] * (height - 10)), bx = bi * (width / bars);
          ctx.fillStyle = (bi / bars) <= progress ? accent : grey;
          ctx.fillRect(bx, middle - bh / 2, Math.max(1, width / bars - 1), bh);
        }
      }
    }

    // HERESY 1282: the take's sections: a thin line at each start, its name at the foot of its block where there is room
    var secs = waveEar() ? waveSections() : [];          // HERESY 1498: the bare wave draws none
    if (secs.length && isFinite(audio.duration) && audio.duration > 0) {
      ctx.font = window.ruachCanvasFont ? window.ruachCanvasFont("marks", 9, 600) : '600 9px "IBM Plex Mono", monospace';   // HERESY 1437
      // HERESY 1492 (Viktor 16.10.2026: «Pre-Chorus не прописывается среди других»): every section named at its own start.
      // HERESY 1494 (Viktor 16.10.2026: «По длинным названиям секций… делай двух-трёх рядную лесенку… надписи перенести в верх волны, и
      // лесенка будет спускаться, а не подыматься при оверфлоу надписей»): the names at the wave's top, each whole; one that would run
      // into a name before it steps a row down (three rows on the full wave, two on the compact one). Only when every row is taken at a
      // start does the name freed first give up its tail to make room (shortened or cut, 1492's way); past the wave's end a name is cut
      var shown = secs.filter(function (s) { return s.t < audio.duration; });
      var fpx = parseFloat((/([\d.]+)px/.exec(ctx.font) || [0, "9"])[1]) || 9, rowH = Math.ceil(fpx + 3), rows = height >= 50 ? 3 : 2, lanes = [];
      var marks = shown.map(function (s) {
        var full = s.name.toUpperCase() + (s.unheard ? " ?" : "");   // HERESY 1315: «?» not heard
        return { t: s.t, sx: Math.round(s.t / audio.duration * width) + 0.5, full: full, name: full, row: -1 };
      });
      marks.forEach(function (m) {
        var x = m.sx + 2, r;
        for (r = 0; r < rows; r++) if (!lanes[r] || lanes[r].end <= x) break;
        if (r === rows) {
          r = 0;
          for (var k = 1; k < rows; k++) if (lanes[k].end < lanes[r].end) r = k;
          var prev = lanes[r].mark;
          prev.name = sectionLabel(prev.full, x - prev.sx - 4, ctx);
          if (!prev.name) prev.row = -1;                     // no room even for three letters: its line alone
        }
        if (x + ctx.measureText(m.name).width + 6 > width) m.name = sectionLabel(m.full, width - x, ctx);
        if (!m.name) return;
        m.row = r;
        lanes[r] = { mark: m, end: x + ctx.measureText(m.name).width + 6 + 2 };
      });
      marks.forEach(function (m) {
        if (m.t > 0.05) { ctx.fillStyle = themeRGBA("ink", 0.24); ctx.fillRect(m.sx - 0.5, 2, 1, height - 4); }
        if (m.row < 0 || !m.name) return;
        var y = 2 + m.row * rowH, lw = ctx.measureText(m.name).width + 6;
        ctx.fillStyle = themeRGBA("panel", 0.72); ctx.fillRect(m.sx + 2, y, lw, rowH - 1);
        ctx.fillStyle = themeRGBA("ink", 0.62); ctx.fillText(m.name, m.sx + 5, y + rowH - 3.5);
      });
    }
    // HERESY 1414: a section sung anew (Replace a section): its stretch tinted, edged, «anew» at its top
    var rp = STATE.waveReplaced;
    if (rp && STATE.playerTake && rp.name === STATE.playerTake.name && isFinite(audio.duration) && audio.duration > 0) {
      (rp.parts || [rp]).forEach(function (x) {                // HERESY 1425: the sections of one go, each its own band
        var rx0 = Math.round(x.a / audio.duration * width), rx1 = Math.round(x.b / audio.duration * width);
        ctx.fillStyle = themeRGBA("amber", 0.14); ctx.fillRect(rx0, 2, Math.max(1, rx1 - rx0), height - 4);
        ctx.fillStyle = themeRGBA("amber", 0.85); ctx.fillRect(rx0, 2, 1, height - 4); ctx.fillRect(Math.max(rx0, rx1 - 1), 2, 1, height - 4);
        ctx.font = window.ruachCanvasFont ? window.ruachCanvasFont("marks", 9, 600) : '600 9px "IBM Plex Mono", monospace'; ctx.fillText(tr("anew"), rx0 + 4, height - 4.5);   // HERESY 1494: at the foot
      });
    }
    // HERESY 1409: the lyrics on their way to the wave, in its top right corner (the pointer's own label is drawn over it)
    if (binding()) {
      ctx.font = '600 11px "IBM Plex Mono", monospace';
      var wl = tr("Wait: binding the lyrics to the wave…"), ww = ctx.measureText(wl).width + 10, wx = Math.max(2, width - ww - 4);
      ctx.fillStyle = themeRGBA("panel", 0.92); ctx.fillRect(wx, 2, ww, 16);
      ctx.fillStyle = themeRGBA("amber", 1); ctx.fillText(wl, wx + 5, 14);
    }
    if (progress > 0) {
      ctx.fillStyle = themeRGBA("ink", 1);
      ctx.fillRect(progress * width - 0.5, 4, 1.5, height - 8);
    }
    // HERESY 1111: where a click would go, and when that is
    if (STATE.waveHover != null && isFinite(audio.duration) && audio.duration > 0) {
      var hx = Math.max(0, Math.min(1, STATE.waveHover)) * width, label = clock(STATE.waveHover * audio.duration);
      var hs = sectionAt(STATE.waveHover * audio.duration);  // HERESY 1282: and its section
      if (hs) label += " \u00b7 " + hs.name;
      ctx.fillStyle = themeRGBA("ink", 0.35); ctx.fillRect(hx - 0.5, 2, 1, height - 4);
      ctx.font = '11px "IBM Plex Mono", monospace';
      var tw = ctx.measureText(label).width + 10, tx = Math.min(width - tw - 2, Math.max(2, hx + 6));
      ctx.fillStyle = themeRGBA("panel", 0.92); ctx.fillRect(tx, 4, tw, 16);
      ctx.fillStyle = themeRGBA("ink", 0.9); ctx.fillText(label, tx + 5, 16);
    }
  }

  window.addEventListener("resize", drawWave);

  // HERESY 1118: rubato (Viktor: «анимацию карточки синхронизировать с пиками в waveform»). While a song plays, the
  // card that sounds glows with the song's own loudness, read from the very peaks the cloud is drawn from: quick to
  // rise, slow to fall, measured against the song's own quiet and loud, so a soft song breathes as much as a loud
  // one. The same frames move the playhead smoothly. Without peaks yet, the card keeps its even pulse (HERESY 1058);
  // for those who ask for less motion it stays still.
  var rubato = { raf: 0, level: 0, peaks: null, lo: 0, hi: 1 };
  var lessMotion = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
  function rubatoRange(peaks) {
    var s = Array.prototype.slice.call(peaks).sort(function (a, b) { return a - b; });
    rubato.lo = s[Math.floor(s.length * 0.12)] || 0;
    rubato.hi = Math.max(rubato.lo + 0.02, s[Math.floor(s.length * 0.97)] || 1);
    rubato.peaks = peaks;
  }
  function rubatoStill() {
    var lit = document.querySelectorAll(".is-rubato");
    for (var i = 0; i < lit.length; i++) { lit[i].classList.remove("is-rubato"); lit[i].style.removeProperty("--beat"); }
  }
  function rubatoTick() {
    rubato.raf = 0;
    if (!isPlaying() || lessMotion.matches) { rubatoStill(); document.body.classList.remove("is-sounding-page"); rubato.level = 0; drawWave(); return; }
    document.body.classList.add("is-sounding-page");   // HERESY 1660: the bar lives while a song plays
    var peaks = STATE.peaks, d = audio.duration;
    if (peaks && peaks !== "none" && isFinite(d) && d > 0) {
      if (rubato.peaks !== peaks) rubatoRange(peaks);
      var pos = Math.min(1, audio.currentTime / d) * (peaks.length - 1), i = Math.floor(pos), f = pos - i;
      var v = peaks[i] * (1 - f) + peaks[Math.min(peaks.length - 1, i + 1)] * f;
      var target = Math.max(0, Math.min(1, (v - rubato.lo) / (rubato.hi - rubato.lo)));
      rubato.level += (target - rubato.level) * (target > rubato.level ? 0.45 : 0.07);
      var cards = document.querySelectorAll(".coll-card.is-sounding"), beat = rubato.level.toFixed(3);
      for (var k = 0; k < cards.length; k++) { cards[k].classList.add("is-rubato"); cards[k].style.setProperty("--beat", beat); }
      var bar = document.querySelector(".topbar");   // HERESY 1660: the logo on the same beat as the card
      if (bar) { bar.classList.add("is-rubato"); bar.style.setProperty("--beat", beat); }
    } else rubatoStill();
    drawWave();
    rubato.raf = requestAnimationFrame(rubatoTick);
  }
  function rubatoStart() { if (!rubato.raf) rubato.raf = requestAnimationFrame(rubatoTick); }
  audio.addEventListener("play", rubatoStart);
  audio.addEventListener("playing", rubatoStart);

  // HERESY 1119: the logo lives: the wind in her, the cloud's billows and drift, the light over her white. On a slow
  // clock of its own, ten steps a second: SMIL ticks at the screen's rate and re-renders the filters every frame (a
  // quarter of a core, measured). Still for those who ask for less motion, asleep while the tab is out of sight.
  var logoTimer = 0, logoT = 0;
  function logoStep() {
    logoT += 0.1;
    var t = logoT, TAU = 2 * Math.PI, s1 = Math.sin(t * TAU / 11), s2 = Math.sin(t * TAU / 17), s3 = Math.sin(t * TAU / 9);
    document.querySelectorAll(".brand svg").forEach(function (svg) {
      if (!svg.getClientRects().length) return;                       // not shown at this width
      var turb = svg.querySelectorAll("feTurbulence"), cloud = svg.querySelector(".rl-cloud"), pearl = svg.querySelector('linearGradient[id$="Pearl"]');
      for (var i = 0; i < turb.length; i++) {
        var f = turb[i].parentNode.id || "";
        if (/Wind$/.test(f)) turb[i].setAttribute("baseFrequency", (0.007 + 0.001 * s1).toFixed(5) + " " + (0.018 + 0.002 * s1).toFixed(5));
        else if (/Cloud$/.test(f)) turb[i].setAttribute("baseFrequency", (0.0125 + 0.0015 * s2).toFixed(5) + " " + (0.0185 + 0.0015 * s2).toFixed(5));
      }
      if (cloud) cloud.setAttribute("transform", "translate(" + (2.5 * Math.sin(t * TAU / 23)).toFixed(2) + " " + (-1.5 * Math.cos(t * TAU / 23)).toFixed(2) + ")");
      if (pearl) pearl.setAttribute("gradientTransform", "translate(" + (0.4 * s3).toFixed(3) + " " + (0.4 * s3).toFixed(3) + ")");
    });
  }
  function logoMotion() {
    // HERESY 1266: the name alone has nothing that moves; the clock runs only for a logo with its cloud
    var on = !lessMotion.matches && !document.hidden && !!document.querySelector(".brand svg feTurbulence");
    if (on && !logoTimer) logoTimer = setInterval(logoStep, 100);
    else if (!on && logoTimer) { clearInterval(logoTimer); logoTimer = 0; }
  }
  logoMotion();
  if (lessMotion.addEventListener) lessMotion.addEventListener("change", logoMotion);
  document.addEventListener("visibilitychange", logoMotion);

  /* -------------------------------------------------------------- library */

  var libraryAsk = 0;
  function refreshLibrary() {
    if (!STATE.library) {
      STATE.takes = STATE.session.slice();
      paintLibrary();
      paintCoverTakes();
      return Promise.resolve();
    }
    var ask = ++libraryAsk;
    return api("/library").then(function (data) {
      if (ask !== libraryAsk) return;   // an older reply landing after a newer one
      STATE.takes = STATE.session.concat((data && data.takes) || []);
      if (STATE.take) {
        var fresh = findTake(STATE.take.name);
        if (fresh) { STATE.take = fresh; paintTakeHead(); paintTakeMeta(); }
      }
      paintLibrary();
      paintCoverTakes();
      if (STATE.take) { paintDecodeSwitch(); paintSoundSwitch(); }
      restorePostTake();   // HERESY 1132
      restorePlayer();     // HERESY 1258: after the Refiner's take, so the player's own comes back over it
    });
  }

  function markActive() {
    var name = STATE.take ? STATE.take.name : null;
    all("#libList .take[data-name]").forEach(function (card) { card.classList.toggle("is-active", card.dataset.name === name); });
  }

  // HERESY 1125: the Takes column's filters, kept per browser
  // HERESY 1167 (Viktor: «как в SUNO… дизлайк прятал трек, не удаляя»): a disliked take leaves the column unless shown;
  // one setting with the Librarian's «Show disliked» (each tells the other: ruach-disliked)
  function showDisliked() { return recall("yue2.showDisliked") === "1"; }
  window.addEventListener("ruach-disliked", function () { paintLibrary(); });
  function libFilters() {
    var f = {};
    try { f = JSON.parse(recall("yue2.libFilters") || "{}") || {}; } catch (e) { f = {}; }
    return { liked: !!f.liked, noDisliked: !!f.noDisliked, noted: !!f.noted, hidden: !!f.hidden, dislikedOnly: !!f.dislikedOnly, allWs: !!f.allWs };   // HERESY 1577
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-libf]");
    if (!b) return;
    if (b.dataset.libf === "disliked") {                 // HERESY 1167: the shared setting, not one of the column's own
      store("yue2.showDisliked", showDisliked() ? "0" : "1");
      window.dispatchEvent(new Event("ruach-disliked"));
      return;
    }
    var f = libFilters();
    f[b.dataset.libf] = !f[b.dataset.libf];
    if (b.dataset.libf === "liked" && f.liked) { f.noDisliked = false; f.dislikedOnly = false; }
    if (b.dataset.libf === "dislikedOnly" && f.dislikedOnly) f.liked = false;   // HERESY 1167: 👍 or 👎, not both
    store("yue2.libFilters", JSON.stringify(f));
    paintLibrary();
  });

  function paintLibrary() {
    var list = $("libList");
    var shown = STATE.favOnly ? STATE.takes.filter(function (t) { return t.favorite; }) : STATE.takes;
    // HERESY 1132: the Refiner's column holds what was refined, the newest refine first (Viktor: «в этой комнате не
    // нужно показывать всё общее, только то, что принадлежит артефактам рефайнера»); "All" for a take not refined yet
    var refinedOnly = document.body.dataset.tab === "post" && recall("yue2.postAll") !== "1";
    if (refinedOnly) {
      shown = shown.filter(function (t) { return STATE.refined[t.name] || (STATE.take && STATE.take.name === t.name); })
        .sort(function (a, b) { return (STATE.refined[b.name] || 9e9) - (STATE.refined[a.name] || 9e9); });
    }
    // HERESY 1041: the quick search, and the takes hidden in the Librarian stay out of the column
    var HC = window.HeresyCollection, q = $("libSearch") ? $("libSearch").value : "";
    var F = libFilters(), filtered = STATE.favOnly || F.liked || F.noDisliked || F.noted || F.dislikedOnly;
    if (HC) {
      var m = HC.matcher(q);
      shown = shown.filter(function (t) {                 // HERESY 1125: and the column's own filters
        if (!F.hidden && HC.isHidden(t.name)) return false;
        if (!(F.allWs || HC.inCurrent(t.name)) || !(m(displayTitle(t)) || m(t.name))) return false;   // HERESY 1577: the column's own all
        var r = HC.rating(t.name);
        if (F.dislikedOnly) return r < 0 && !(F.noted && !HC.note(t.name));   // HERESY 1167: 👎 only the disliked
        return !(F.liked && r <= 0) && !(r < 0 && !showDisliked()) && !(F.noted && !HC.note(t.name));   // HERESY 1167
      });
    }
    filtered = filtered || shown.length !== STATE.takes.length;   // HERESY 1167: the disliked out of it count too
    // HERESY 1167 (Viktor: «Нам нахер не нужно общее количество, если это не All workspaces»): a workspace in hand counts
    // its own takes only; the whole library's number only over All workspaces
    var inWs = !!(HC && HC.current && HC.current()) && !F.allWs;   // HERESY 1577
    $("libCount").textContent = inWs ? String(shown.length)
      : filtered || refinedOnly ? shown.length + " / " + STATE.takes.length : String(STATE.takes.length);
    $("refinedFilter").setAttribute("aria-pressed", refinedOnly ? "true" : "false");
    $("libMenuBtn").classList.toggle("has-filter", F.liked || showDisliked() || F.noted || F.hidden || F.allWs);
    all("[data-libf]").forEach(function (b) {
      var on = (b.dataset.libf === "disliked" ? showDisliked() : F[b.dataset.libf]) ? "true" : "false";
      b.setAttribute(b.classList.contains("lib-rate-f") ? "aria-pressed" : "aria-checked", on);   // HERESY 1167: the 👍 👎 toggles
    });
    $("favFilter").setAttribute("aria-pressed", STATE.favOnly ? "true" : "false");

    // A run in progress sits at the top of the list, so it is never lost.
    var running = STATE.jobs.filter(function (j) { return isLive(j) && !j.provisional && j.kind !== "transcribe"; }).map(function (job) {
      var stage = currentStage(job);
      var what = job.kind === "replay" ? (job.what || "re-rendering") + " — click for the take"
        : (job.status === "queued" ? "queued — click to watch" : "generating now — click to watch");
      return '<article class="take is-running-row" data-run="' + escape(job.id) + '" tabindex="0">' +
        '<button type="button" class="take-del take-cancel" data-cancel-run="' + escape(job.id) + '" title="Cancel run" aria-label="Cancel run">✕</button>' +   // HERESY 1167
        // HERESY 1421: the run's state at the tail of its title's row
        '<div class="take-head"><div class="take-title">' + escape(job.title) + '</div><span class="tag full">' + (job.status === "queued" ? "queued" : "running") + "</span></div>" +
        '<div class="take-style">' + escape(what) + "</div>" +
        '<div class="take-foot">' + (stage ? "<span>" + escape(stage.label) + "</span>" : "") + "</div></article>";
    }).join("");

    if (!shown.length) {
      var empty = STATE.favOnly ? "No favourites yet. Tap ☆ on a take to keep it here."      // HERESY 1169: one paragraph, no break
        : (STATE.library ? "No takes yet. Every finished song lands here."
                         : "The server keeps no library (start it with --outputs). Songs made in this tab stay until it reloads.");
      list.innerHTML = running + '<div class="lib-empty">' + empty + "</div>";
      return;
    }
    list.innerHTML = running + shown.map(function (take) {
      var active = STATE.take && STATE.take.name === take.name ? " is-active" : "";
      var title = displayTitle(take), tags = '<span class="tag ' + escape(take.cot || "off") + '">' + escape(take.cot || "?") + "</span>";
      var vaeTag = take.vae && take.vae !== STATE.defaultVae ? '<span class="tag vae">' + escape(vaeLabel(take.vae)) + "</span>" : "";   // HERESY 1421: in the title's row
      if (take.song > 0 && !/ · v\d+/.test(title)) tags += '<span class="tag">v' + (take.song + 1) + "</span>";
      if (take.variation > 0 && !/ · sound \d+/.test(title)) tags += '<span class="tag">sound ' + (take.variation + 1) + "</span>";
      if (take.format === "mp3") tags += '<span class="tag">mp3</span>';
      if (take.parent) tags += '<span class="tag re" title="Re-rendered from another take: same music">re-render</span>';
      var extras = HC && HC.cardExtras && !take.session ? HC.cardExtras(take.name) : "";   // HERESY 1082; 1167: the star in it
      return '<article class="take' + active + (extras ? " has-rate" : "") + (take.favorite ? " is-fav" : "") + (HC && HC.isHidden(take.name) ? " is-hidden-take" : "") + (HC && HC.isFresh && HC.isFresh(take.name) ? " is-fresh" : "") +
        (window.HeresyRegen && window.HeresyRegen.has(take.name) ? " is-regenerating" : "") + '" data-name="' + escape(take.name) + '" tabindex="0">' +
        // HERESY 1419 (Viktor: «Что это за кнопка, частично покрытая mp3?»): the hover tools in one row, left to right as they are seen,
        // each as wide as its word (Refine in Russian is wider than the fixed place it had, and «mp3» lay over it)
        '<span class="take-row-tools">' +
        (!convertible(take) ? "" : '<a class="take-mp3" data-dl="1" href="' + escape(mp3Url(take)) + '" download="' + escape(fileTitle(take)) +
        '.mp3" title="Download MP3 (' + mp3Rate() + ' kbps)" aria-label="Download MP3">mp3</a>') +
        (take.session ? "" : '<button type="button" class="take-post" data-post="' + escape(take.name) + '">Refine</button>') +
        '<a class="take-dl" data-dl="1" href="' + escape(downloadUrl(take)) + '" download="' + escape(audioFileName(take)) +
        '" title="Download ' + formatExt(take.format).toUpperCase() + '" aria-label="Download">⤓</a>' +
        (extras ? "" : '<button type="button" class="take-fav" data-fav="' + escape(take.name) + '" aria-pressed="' + (take.favorite ? "true" : "false") +
        '" aria-label="Favourite">' + (take.favorite ? "★" : "☆") + "</button>") +
        (HC && HC.isProtected && HC.isProtected(take.name) ? "" :   // HERESY 1368: a protected take has no ✕
        '<button type="button" class="take-del" data-del="' + escape(take.name) + '" title="Delete take" aria-label="Delete take">✕</button>') +
        "</span>" +
        // HERESY 1421 (Viktor: «со второй строки лучше перенести в хвост первой ИДЁТ/ИГРАЕТ и VAE. Так во второй появится больше места
        // для имени воркспейса»): playing and the decoder at the tail of the title's row
        '<div class="take-head"><div class="take-title">' + escape(title) + '</div><span class="tag playing-tag">playing</span>' + vaeTag + "</div>" +
        '<div class="take-style">' + escape(take.style || "") + "</div>" +
        '<div class="take-foot">' + tags + "<span>" + clock(take.seconds) + "</span>" +
        whenHtml(take.created, take.name) + "</div>" + extras + "</article>";   // HERESY 1082; 1720: its time flips
    }).join("");
    markPlaying();
  }

  $("libList").addEventListener("click", function (event) {
    if (event.target.closest("[data-dl]")) { event.stopPropagation(); return; }   // download, do not open
    var lrate = event.target.closest("[data-lrate]");   // HERESY 1082: like and dislike from the column, as in the Librarian
    if (lrate && window.HeresyCollection) {
      event.stopPropagation();
      var HCr = window.HeresyCollection, v = Number(lrate.dataset.lrate);
      HCr.rate(lrate.dataset.name, HCr.rating(lrate.dataset.name) === v ? 0 : v).then(function () { paintLibrary(); paintRate(); },
        function (e) { paintLibrary(); paintRate(); toast(e.message, "bad"); });   // HERESY 1167: a refusal said, not swallowed
      return;
    }
    var crun = event.target.closest("[data-cancel-run]");   // HERESY 1167: the run's own ✕ in the column
    if (crun) {
      event.stopPropagation();
      cancelJob(STATE.jobs.filter(function (j) { return j.id === crun.dataset.cancelRun; })[0]);
      return;
    }
    var lfav = event.target.closest("[data-lfav]");     // HERESY 1167 (Viktor: «И нет звёздочки»): the star beside the thumbs
    if (lfav) {
      event.stopPropagation();
      var lfavTake = findTake(lfav.dataset.name);
      if (lfavTake) toggleFavorite(lfavTake);
      return;
    }
    var lprot = event.target.closest("[data-lprot]");   // HERESY 1368: the shield beside the star
    if (lprot) {
      event.stopPropagation();
      var HCp = window.HeresyCollection;
      if (HCp && HCp.protect) HCp.protect([lprot.dataset.name], !HCp.isProtected(lprot.dataset.name));
      return;
    }
    var fav = event.target.closest("[data-fav]"), del = event.target.closest("[data-del]"), toPost = event.target.closest("[data-post]");
    if (toPost) { event.stopPropagation(); openTake(toPost.dataset.post); setTab("post"); return; }   // HERESY 1048
    if (fav) {
      event.stopPropagation();
      var favTake = findTake(fav.dataset.fav);
      if (favTake) toggleFavorite(favTake);
      return;
    }
    if (del) {
      event.stopPropagation();
      var take = findTake(del.dataset.del);
      if (take) deleteTake(take);
      return;
    }
    var card = event.target.closest(".take");
    if (!card) return;
    if (card.dataset.run) return openRunRow(card.dataset.run);
    STATE.playZone = "list";                                  // HERESY 1052
    // HERESY 1026/1040 (Viktor): with "play on click" on, a click on a take plays it at once, from
    // the start (the take already playing keeps playing). Off: a click only opens it.
    var already = STATE.playerTake && STATE.playerTake.name === card.dataset.name && isPlaying();
    openTake(card.dataset.name);
    if (clickPlay() && !already && event.detail !== 2) playNow(findTake(card.dataset.name));
    // A double-click plays the song (renaming is the song page's Rename button). It is read from the
    // second click itself: the first click redraws the list, and the browser then sends no dblclick.
    if (event.detail === 2) playNow(findTake(card.dataset.name));
  });

  $("libList").addEventListener("contextmenu", function (event) {   // HERESY 1048: the studio's own menu
    var card = event.target.closest(".take[data-name]");
    if (!card || !findTake(card.dataset.name) || findTake(card.dataset.name).session) return;
    event.preventDefault();
    takeMenu(card.dataset.name, event.clientX, event.clientY);
  });

  $("libList").addEventListener("keydown", function (event) {
    var card = event.target.closest(".take");
    if (!card || event.target.closest("button")) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (card.dataset.run) openRunRow(card.dataset.run); else openTake(card.dataset.name);
    }
  });

  function openRunRow(id) {
    var job = jobById(id);
    if (!job) return;
    if (job.kind === "replay") {
      if (findTake(job.parent)) openTake(job.parent);
      return;
    }
    watchJob(job);
    show("take");
  }

  /* ---------------------------------------------------------------- cover */

  function paintCoverTakes() {
    var scored = STATE.takes.filter(function (t) { return t.has_score; });
    var current = $("coverTake").value;
    $("coverTake").innerHTML = scored.length
      ? scored.map(function (t) { return '<option value="' + escape(t.name) + '" translate="no">' + escape(displayTitle(t)) + "</option>"; }).join("")   // 1165: titles are data
      : '<option value="">no take has a score yet</option>';
    if (current && scored.some(function (t) { return t.name === current; })) $("coverTake").value = current;
    $("coverFromTake").disabled = !scored.length;
    if (!$("coverStatus").dataset.note) {
      $("coverStatus").textContent = scored.length
        ? scored.length + (scored.length === 1 ? " take carries" : " takes carry") + " a score you can remix."
        : "Make a song in Full plan or Melody only mode first; Direct mode keeps no score.";
    }
  }

  // "Dm"-style chord symbols go, so a cover's accompaniment can be rebuilt.
  // Information fields quote things too -- V: lines carry name="Vocal Melody" --
  // so only music lines are touched, or the header would lose its voice names.
  function stripChordSymbols(abc) {
    return abc.split("\n").map(function (line) {
      if (/^\s*[A-Za-z]:/.test(line) || /^\s*%/.test(line)) return line;
      return line.replace(/"[^"\n]*"/g, "");
    }).join("\n");
  }

  // Keep one voice of a score: its declaration in the header and its lines
  // in the body. Section comments stay, since they belong to every voice.
  function keepVoice(abc, keep) {
    var out = [], inHeader = true, current = null;
    abc.split("\n").forEach(function (line) {
      var voice = line.match(/^\s*V:\s*([^\s]+)/);
      if (inHeader) {
        if (/^\s*K:/.test(line)) { inHeader = false; out.push(line); return; }
        if (voice && voice[1] !== keep) return;
        out.push(line);
        return;
      }
      if (voice) { current = voice[1]; if (current === keep) out.push(line); return; }
      if (/^\s*%/.test(line)) { out.push(line); return; }
      if (current !== null && current !== keep) return;
      out.push(line);
    });
    return out.join("\n");
  }

  function applyCoverScore(abc, note, cot) {
    keepForm("before");                                // HERESY 1596
    $("abc").value = abc;
    setCodes(null);
    setCot(cot || "melody");
    $("scoreDrawer").open = true;
    $("coverStatus").textContent = note;
    $("coverStatus").dataset.note = "1";
    toast(note, "good");
  }

  $("coverFromTake").addEventListener("click", function () {
    var take = findTake($("coverTake").value);
    if (!take) return toast("No take has a score to cover yet", "bad");
    getRequest(take).then(function (req) {
      var abc = req.abc || "";
      if (!abc) throw new Error("That take carries no score");
      if ($("coverMelodyOnly").checked) abc = stripChordSymbols(abc);
      if (!$("lyrics").value.trim()) { $("lyrics").value = take.lyrics || ""; growLyrics(); }
      applyCoverScore(abc, "Melody loaded from \u201c" + displayTitle(take) + "\u201d. Now write the new style and generate.");
    }).catch(function (error) { toast(error.message, "bad"); });
  });

  // WAV and MP3 go up as they are. Anything else the browser can play is
  // decoded here and sent as mono 24 kHz WAV, the rate the transcriber uses.
  function prepareAudio(file) {
    var ext = (file.name.split(".").pop() || "").toLowerCase();
    if (ext === "wav" || ext === "mp3") return Promise.resolve(file);
    var Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!Offline) return Promise.reject(new Error("This browser cannot convert ." + ext + "; use WAV or MP3"));
    return file.arrayBuffer().then(function (buffer) {
      return new Offline(1, 1, 24000).decodeAudioData(buffer);
    }).then(function (decoded) {
      var length = decoded.length, mono = new Float32Array(length);
      for (var c = 0; c < decoded.numberOfChannels; c++) {
        var data = decoded.getChannelData(c);
        for (var i = 0; i < length; i++) mono[i] += data[i] / decoded.numberOfChannels;
      }
      return new Blob([wav16(mono, decoded.sampleRate)], { type: "audio/wav" });
    }).catch(function (error) {
      throw new Error("Could not read " + file.name + " in the browser (" + (error.message || error) + "). Convert it to WAV or MP3.");
    });
  }

  function wav16(samples, rate) {
    var buffer = new ArrayBuffer(44 + samples.length * 2), view = new DataView(buffer);
    var text = function (offset, value) { for (var i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
    text(0, "RIFF"); view.setUint32(4, 36 + samples.length * 2, true); text(8, "WAVE");
    text(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    text(36, "data"); view.setUint32(40, samples.length * 2, true);
    for (var i = 0; i < samples.length; i++) {
      var s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return buffer;
  }

  // Listen to the chosen recording before transcribing it. It has its own player, so the one at the bottom
  // keeps its song; starting either one pauses the other.
  // HERESY 1476 (Viktor 15.10.2026: «Воспроизведение из Огранщика не останавливается при включении плей в другой комнате»): one sound
  // at a time: a player that starts (in the page or not, by a click on its controls or by the page) stops every other one that plays,
  // and the DAW; players of one group (the compare's versions) hand over among themselves. The DAW, when it starts, stops them all
  (function () {
    var live = [];
    function oneSound(el) {
      var g = el.dataset ? el.dataset.oneSound || "" : "";
      live = live.filter(function (b) { return b.isConnected || !b.paused; });
      live.forEach(function (b) { if (b !== el && !b.paused && !(g && b.dataset && b.dataset.oneSound === g)) b.pause(); });
      if (live.indexOf(el) < 0) live.push(el);
      if (window.HeresyMixer && window.HeresyMixer.state && window.HeresyMixer.state().playing) window.HeresyMixer.stop();
    }
    var play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () { try { oneSound(this); } catch (e) { /* the sound still plays */ } return play.apply(this, arguments); };
    document.addEventListener("play", function (e) { if (e.target instanceof HTMLMediaElement) oneSound(e.target); }, true);
    window.ruachOneSound = function () { live.forEach(function (b) { if (!b.paused) b.pause(); }); };
  })();
  var preview = new Audio(), previewUrl = "";
  preview.preload = "metadata";
  function paintListen() {
    var button = $("coverListen"), on = !preview.paused;
    button.disabled = !previewUrl;
    button.setAttribute("aria-pressed", on ? "true" : "false");
    button.textContent = on ? "❚❚ " + clock(preview.currentTime) + " / " + clock(isFinite(preview.duration) ? preview.duration : 0) : "▶ Listen";
  }
  $("coverFile").addEventListener("change", function () {
    preview.pause();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    var file = this.files[0];
    previewUrl = file ? URL.createObjectURL(file) : "";
    if (previewUrl) preview.src = previewUrl; else preview.removeAttribute("src");
    paintListen();
  });
  $("coverListen").addEventListener("click", function () {
    if (!previewUrl) return;
    if (!preview.paused) { preview.pause(); return; }
    if (!audio.paused) audio.pause();
    preview.play().catch(function () {
      toast("This browser cannot play " + (($("coverFile").files[0] || {}).name || "this file") + "; it can still be transcribed", "bad");
    });
  });
  ["play", "pause", "ended", "timeupdate", "loadedmetadata"].forEach(function (name) { preview.addEventListener(name, paintListen); });
  audio.addEventListener("play", function () { preview.pause(); });
  $("coverDrawer").addEventListener("toggle", function () { if (!this.open) preview.pause(); });

  // HERESY 1719 (RIVALS 9): Match sections, after timoncool's YuE2-Studio score/section_match.rs (MIT, Ilya Timonin), after HOT-Step's Cover
  // Studio: each block of the lyrics takes the tag of the score section it is sung in, by where Whisper heard its first line in the recording
  var MATCH_TAGS = { "intro": "Intro", "verse": "Verse", "pre-chorus": "Pre-Chorus", "chorus": "Chorus", "post-chorus": "Chorus", "bridge": "Bridge", "outro": "Outro",
    "rap": "Verse", "interlude": "Interlude", "instrumental": "Instrumental", "solo": "Instrumental", "fade-out": "Outro", "pre-outro": "Bridge", "loop": "Chorus",
    "intro and verse": "Verse", "pre-chorus and chorus": "Chorus", "verse and pre-chorus": "Verse", "theme": "Verse", "development": "Bridge", "variation": "Verse",
    "irregular": "Verse", "preshot": "Intro", "silence": "Intro" };   // SheetSage2's labels to lyrics tags; anything else a verse
  function matchKind(label) {                           // a section's kind: «Verse 2» a verse, SheetSage2's «intro and verse» too; a «Hook» stays a hook
    var k = String(label || "").toLowerCase().replace(/[\d#.:()]+/g, " ").replace(/\s+/g, " ").trim();   // (and is retagged Chorus: the model's own tag)
    return MATCH_TAGS[k] ? MATCH_TAGS[k].toLowerCase() : k;
  }
  function matchBlocks(lyrics) {                        // the lyrics' blocks: {tag, body, first (its first sung line's index), lines}
    var blocks = [], sung = [];
    String(lyrics || "").replace(/\r\n?/g, "\n").split("\n").forEach(function (line) {
      var t = line.trim(), m = /^\[([^\]]+)\]$/.exec(t);
      if (m && m[1].trim()) { blocks.push({ tag: m[1].trim(), body: "", first: sung.length, lines: 0 }); return; }
      if (!blocks.length) blocks.push({ tag: null, body: "", first: sung.length, lines: 0 });
      var b = blocks[blocks.length - 1];
      if (b.body || t) b.body += (b.body ? "\n" : "") + line;
      if (t && t.charAt(0) !== "(" && t.charAt(0) !== "[") { b.lines++; sung.push(t); }   // the lines the lab's timing times
    });
    blocks.forEach(function (b) { b.body = b.body.replace(/\s+$/, ""); });
    return { blocks: blocks.filter(function (b) { return b.tag || b.body.trim(); }), sung: sung };
  }
  function partSung(lines) {                            // the Vocal voice has a note in these score lines
    var voice = "";
    return lines.some(function (l) {
      var v = /^V:\s*(\S+)/.exec(l);
      if (v) { voice = v[1]; return false; }
      if (voice !== "Vocal" || /^%/.test(l)) return false;
      return /[A-Ga-g]/.test(l.replace(/"[^"]*"/g, "").replace(/![^!]*!/g, "").replace(/\[[A-Za-z]:[^\]]*\]/g, ""));
    });
  }
  function matchSections(abc, lyrics, rows) {           // {lyrics, blocks: [{index, tag, newTag, section, at, status}], filled: [{section, tag, copiedFrom}], unchanged}
    var sp = scoreParts(abc, 0), bar = barSeconds(abc) || 2;
    var spans = sp.parts.map(function (q) {
      var label = q.name === "Start" ? "" : q.name.split(" · ").pop();
      return { tag: MATCH_TAGS[label.toLowerCase()] || "Verse", label: label, start: q.t, end: q.end, sung: partSung(q.lines) };
    });
    if (!spans.some(function (x) { return x.label; })) throw new Error("The score has no named sections: transcribe the recording first");
    var containing = function (at) { var k = 0; spans.forEach(function (x, i) { if (x.start <= at) k = i; }); return k; };
    var mb = matchBlocks(lyrics), blocks = mb.blocks, at = [], j = 0;
    mb.sung.forEach(function (line) {                   // each sung line's start as Whisper heard it (rows in the lyrics' order; a guessed one, none)
      var k = j;
      while (k < rows.length && k < j + 4 && String(rows[k].text || "").trim() !== line) k++;
      if (k < rows.length && k < j + 4) { at.push(rows[k].guessed || !isFinite(rows[k].start) ? null : +rows[k].start); j = k + 1; } else at.push(null);
    });
    var tags = blocks.filter(function (b) { return b.tag; }).map(function (b) { return b.tag; });
    var lower = tags.filter(function (t) { var c = t.charAt(0); return c !== c.toUpperCase() && c === c.toLowerCase(); }).length * 2 > tags.length;
    var tagOf = function (i) { return lower ? spans[i].tag.toLowerCase() : spans[i].tag; };
    var last = null;
    var placed = blocks.map(function (b) {             // where each block is sung: its first line as heard, a bar's pickup into a section counted in
      var heard = b.lines > 0 && at[b.first] != null ? at[b.first] : null, section = null;
      if (heard != null) {
        var i = containing(heard + bar), late = (heard - spans[i].start) / Math.max(1e-6, spans[i].end - spans[i].start) > 0.75;
        section = i === last || !late ? i : null;
      }
      if (section != null && last != null && section < last) section = null;   // Whisper goes forward: a block placed before the one before it is unsure
      if (section != null) last = section;
      return { heard: heard, section: section };
    });
    var out = [], report = [], filled = [], lastOfKind = {}, emitted = {}, current = null, unsureSince = false, lastWasPlaced = false;
    var fill = function (upTo, instrumentalOnly) {
      for (var i = current == null ? 0 : current + 1; i < upTo; i++) {
        if (emitted[i] || (instrumentalOnly && spans[i].sung)) continue;
        var src = spans[i].sung && !unsureSince ? lastOfKind[matchKind(spans[i].label)] : undefined;
        if (spans[i].sung && src === undefined) continue;
        var body = src !== undefined ? blocks[src].body : "";
        out.push(body ? "[" + tagOf(i) + "]\n" + body : "[" + tagOf(i) + "]");
        emitted[i] = true;
        lastWasPlaced = false;
        filled.push({ section: i + 1, tag: tagOf(i), copiedFrom: src !== undefined ? src + 1 : null });
      }
    };
    var firstSung = -1;
    spans.forEach(function (x, i) { if (firstSung < 0 && x.sung) firstSung = i; });
    if (firstSung >= 0) fill(firstSung, true);          // sections before the voice's first: they open the lyrics
    blocks.forEach(function (b, n) {
      var pl = placed[n];
      if (!b.body.trim()) { report.push({ index: n + 1, tag: b.tag, newTag: null, section: null, at: null, status: "dropped" }); return; }
      var mergeable = pl.section != null && pl.section === current && lastWasPlaced;
      if (pl.section == null || (pl.section === current && !mergeable)) {
        if (pl.heard != null) fill(containing(pl.heard), true);
        out.push(b.tag ? "[" + b.tag + "]\n" + b.body : b.body);
        report.push({ index: n + 1, tag: b.tag, newTag: b.tag, section: null, at: pl.heard, status: "unsure" });
        unsureSince = true;
        lastWasPlaced = false;
        return;
      }
      var i = pl.section;
      if (mergeable) {
        out[out.length - 1] += "\n\n" + b.body;
        report.push({ index: n + 1, tag: b.tag, newTag: null, section: i + 1, at: pl.heard, status: "merged" });
        return;
      }
      fill(i, false);
      var keep = !!b.tag && (matchKind(b.tag) === matchKind(spans[i].label) || matchKind(b.tag) === matchKind(spans[i].tag));
      var newTag = keep ? b.tag : tagOf(i);
      out.push("[" + newTag + "]\n" + b.body);
      report.push({ index: n + 1, tag: b.tag, newTag: newTag, section: i + 1, at: pl.heard, status: keep ? "kept" : "renamed" });
      lastOfKind[matchKind(spans[i].label)] = n;
      current = i;
      unsureSince = false;
      lastWasPlaced = true;
    });
    fill(spans.length, false);
    var result = out.join("\n\n");
    return { lyrics: result, blocks: report, filled: filled, unchanged: result === String(lyrics || "").replace(/\r\n?/g, "\n").trim() };
  }
  window.ruachMatchSections = matchSections; window.ruachMatchKind = matchKind;   // for the checks
  $("coverMatch").addEventListener("click", function () {
    var file = $("coverFile").files[0], button = this, lyrics = $("lyrics").value, abc = $("abc").value, status = $("coverAudioStatus");
    if (!file) return toast("Choose a recording first", "bad");
    if (!lyrics.trim()) return toast("Write or paste the lyrics first", "bad");
    if (!/^% \S/m.test(abc)) return toast("The score has no named sections: transcribe the recording first", "bad");
    button.disabled = true;
    status.dataset.busy = "1";
    status.textContent = tr("Whisper is listening to the recording…");
    var done = function () { button.disabled = false; delete status.dataset.busy; status.textContent = ""; };
    new Promise(function (ok, no) {
      var fr = new FileReader();
      fr.onload = function () { ok(String(fr.result).replace(/^data:[^,]*,/, "")); };
      fr.onerror = function () { no(new Error("Could not read " + file.name)); };
      fr.readAsDataURL(file);
    }).then(function (b64) {
      return post("/lab/timing/recording", { file: file.name, lyrics: lyrics, audio: b64 });
    }).then(function (job) {
      var wait = function () {
        return new Promise(function (r) { setTimeout(r, 2000); }).then(function () {
          return fetch("/lab/timing/recording?id=" + encodeURIComponent(job.id)).then(function (r) { return r.json(); });
        }).then(function (d) {
          if (d.status === "failed") throw new Error(d.error || "Whisper failed");
          return d.status === "done" ? d : wait();
        });
      };
      return job.status === "done" && job.rows ? job : wait();
    }).then(function (d) {
      done();
      if ((d.heard || 0) < 0.3) return toast(tr("Whisper heard too little of these lyrics in the recording ({#0} %): nothing matched").replace("{#0}", Math.round((d.heard || 0) * 100)), "bad");
      var m = matchSections($("abc").value, lyrics, d.rows || []);
      if (m.unchanged) return toast("The lyrics already match the score's sections", "good");
      var n = function (st) { return m.blocks.filter(function (b) { return b.status === st; }).length; };
      return window.HeresyDialog.prompt("Match sections\n\nEach block of the lyrics takes the tag of the score section it is sung in, by where Whisper heard its first line: " +
        n("kept") + " kept, " + n("renamed") + " retagged, " + n("merged") + " joined to the block before, " + n("unsure") + " unsure (left as they were); " + m.filled.length +
        " sections added (an instrumental, or a chorus written once and sung again). Words never change. Apply puts these lyrics into the form; what it holds now is kept as a version.",
        m.lyrics, { ok: "Apply", area: true, rows: 14, max: 20000 }).then(function (text) {
        if (text === null) return;
        keepForm("before");
        $("lyrics").value = text;
        $("lyrics").dispatchEvent(new Event("input", { bubbles: true }));
        growLyrics();
        toast("The lyrics now follow the score's sections; the old ones are kept as a version", "good");
      });
    }).catch(function (e) { done(); toast(e.message, "bad"); });
  });
  var coverTicker = 0;

  $("coverFromAudio").addEventListener("click", function () {
    if (!STATE.transcriber) return toast("The server runs without a transcriber (start it with --transcriber)", "bad");
    var file = $("coverFile").files[0];
    if (!file) return toast("Choose a recording first", "bad");
    var task = $("coverTask").value, button = this;
    button.disabled = true;
    $("coverAudioStatus").dataset.busy = "1";
    $("coverAudioStatus").textContent = "Reading " + file.name + "…";
    prepareAudio(file).then(function (blob) {
      var form = new FormData();
      form.append("audio", blob, blob === file ? file.name : file.name.replace(/\.[^.]+$/, "") + ".wav");
      if (task !== "full") form.append("melody_only", "1");
      return api("/transcribe", { method: "POST", body: form });
    }).then(function (data) {
      var job = registerJob(data.id, { kind: "transcribe", title: file.name, task: task, fileName: file.name }, {});
      clearInterval(coverTicker);
      coverTicker = setInterval(function () {
        if (!isLive(job)) { clearInterval(coverTicker); return; }
        $("coverAudioStatus").textContent = job.status === "queued"
          ? "Waiting for the server" + (activeJob() ? " (it is busy with " + activeJob().title + ")" : "") + "…"
          : "Transcribing " + file.name + "… " + Math.round((Date.now() - (job.started || job.submitted)) / 1000) + "s";
      }, 500);
    }).catch(function (error) {
      delete $("coverAudioStatus").dataset.busy;
      $("coverAudioStatus").textContent = error.message;
      toast(error.message, "bad");
      button.disabled = !STATE.transcriber;
    });
  });

  // HERESY 1036: a take of the library transcribed from its own audio on the server
  $("transcribeTake").addEventListener("click", function () {
    var take = STATE.take, button = this;
    if (!take || take.session) return;
    if (!STATE.transcriber) return toast("The server runs without a transcriber (start it with --transcriber)", "bad");
    var task = $("coverTask").value, name = displayTitle(take);
    button.disabled = true;
    $("coverDrawer").open = true;
    $("coverAudioStatus").dataset.busy = "1";
    $("coverAudioStatus").textContent = "Transcribing " + name + "…";
    api("/transcribe?take=" + encodeURIComponent(take.name) + (task !== "full" ? "&melody_only=1" : ""), { method: "POST" }).then(function (data) {
      var job = registerJob(data.id, { kind: "transcribe", title: name, task: task, fileName: name }, {});
      clearInterval(coverTicker);
      coverTicker = setInterval(function () {
        if (!isLive(job)) { clearInterval(coverTicker); return; }
        $("coverAudioStatus").textContent = job.status === "queued" ? "Waiting for the server…"
          : "Transcribing " + name + "… " + Math.round((Date.now() - (job.started || job.submitted)) / 1000) + "s";
      }, 500);
      toast("Transcribing " + name + ": the score comes into the form for a cover");
    }).catch(function (error) {
      delete $("coverAudioStatus").dataset.busy;
      $("coverAudioStatus").textContent = error.message;
      toast(error.message, "bad");
    }).then(function () { button.disabled = false; });
  });

  function finishTranscription(job) {
    api("/job?id=" + encodeURIComponent(job.id) + "&result=1").then(function (data) {
      var abc = (data && data.abc) || "";
      if (!abc) throw new Error("The transcriber returned no score");
      if (job.task === "melody-vocal") abc = keepVoice(abc, "Vocal");
      var mode = job.task === "full" ? "full" : "melody";
      var seconds = job.started ? Math.round(((job.finished || Date.now()) - job.started) / 1000) : null;
      applyCoverScore(abc, "Transcribed " + job.fileName + (seconds !== null ? " in " + seconds + "s" : "") +
        ". Check the melody under Supply your own score, then write the new lyrics and style.", mode);
      $("coverAudioStatus").textContent = "Done: " + job.fileName + " → score loaded (" +
        (mode === "full" ? "Full plan, chords kept" : job.task === "melody-vocal" ? "Melody only, vocal line" : "Melody only") + ").";
    }).catch(function (error) {
      transcriptionFailed(job, error.message);
      toast(error.message, "bad");
    }).then(function () {
      clearInterval(coverTicker);
      delete $("coverAudioStatus").dataset.busy;
      $("coverFromAudio").disabled = !STATE.transcriber;
    });
  }

  function transcriptionFailed(job, message) {
    clearInterval(coverTicker);
    delete $("coverAudioStatus").dataset.busy;
    $("coverAudioStatus").textContent = message;
    $("coverFromAudio").disabled = !STATE.transcriber;
  }

  /* ----------------------------------------------------------------- writer */
  // Any local chat server with a /v1 endpoint writes the brief. It is used as it
  // is: the model the server has loaded answers. This page never names a model
  // the server would have to load, and never loads, switches or unloads one.

  var MUSE_SCHEMA = {
    type: "object",
    properties: {
      title: { type: "string", description: "Song title, two to four words, no quotes" },
      style: { type: "string", description:
        "One comma-separated line naming, in order: language, genre and mood, voice type, two to four instruments, " +
        "phrasing, and a tempo in BPM. Never a sentence. Example: 'English, warm piano pop, expressive female voice, " +
        "acoustic piano, rounded bass and light drums, unhurried phrasing, 88 BPM'" },
      lyrics: { type: "string", description:
        "A complete song of 24 to 32 sung lines using [Verse], [Chorus] and [Bridge] tags, each tag alone on its line, " +
        "the chorus repeated word for word. No title line, no commentary" }
    },
    required: ["title", "style", "lyrics"]
  };

  var MUSE_SYSTEM = [
    "You write briefs for YuE2, a song generation model.",
    "",
    "You are given a one-line idea. Return exactly three fields: title, style and lyrics.",
    "",
    "style is a control string, not prose. It is a single comma-separated line listing,",
    "in this order: language, genre and mood, voice type, two to four instruments,",
    "phrasing, tempo in BPM. Write it the way a producer writes a track sheet.",
    "",
    "Good style: English, warm piano pop, expressive female voice, acoustic piano, rounded bass and light drums, unhurried phrasing, 88 BPM",
    "Good style: Mandarin, late-night jazz ballad, smoky male voice, upright bass, brushed drums, Rhodes, laid-back phrasing, 72 BPM",
    "Bad style: instruments",
    "Bad style: A beautiful song about love that features piano.",
    "",
    "lyrics must be a COMPLETE song, never a sketch. The user's message gives the",
    "section order to follow; follow it exactly, in that order, with no extra sections.",
    "",
    "Rules for lyrics:",
    "- Four to eight words per line, singable in one breath.",
    "- Each section tag sits alone on its own line, spelled exactly as given.",
    "- Repeat the chorus verbatim every time; never reword it.",
    "- A pre-chorus is two lines that lift into the chorus, the same both times.",
    "- Write in the language named in style.",
    "- No title line, no commentary, no explanations.",
    "",
    "Write like a person who was there, not like a machine describing a mood.",
    "",
    "- Name concrete things: an object, a place, a time, something someone did.",
    "  \"Your coat still on the hook\" beats \"memories of you\".",
    "- One image per line, and let it carry the feeling instead of naming it.",
    "  Write the evidence, not the emotion.",
    "- Never use these, in any language: neon, echoes, whispers, dancing shadows,",
    "  city lights, fading light, endless night, burning desire, fire inside,",
    "  broken heart, shattered dreams, breaking chains, spreading wings, endless",
    "  road, chasing dreams, weathering the storm, hidden scars, lost in time,",
    "  rising from the ashes, standing tall, feeling alive.",
    "- Avoid rhyming on fire/desire, night/light, heart/apart, rain/pain.",
    "",
    "title must never be empty.",
    "",
    "This is the exact shape of the lyrics field, tags included:",
    "",
    "[Verse]",
    "Neon fades along the lane",
    "Footsteps keep the time of rain",
    "[Chorus]",
    "Let the day come into view",
    "Every road begins with you",
    "",
    "Answer with JSON only. No commentary, no markdown fences."
  ].join("\n");

  var RETRY_NOTE = "Your previous answer had no section tags. Rewrite the lyrics with the section " +
    "order given above, each tag alone on its own line, spelled exactly as shown, " +
    "for example a line containing only [Chorus].";

  var CLICHE_NOTE = "Your previous answer used these worn-out phrases: %s. Rewrite the lyrics " +
    "without them and without any near-synonym of them. Replace each one with a " +
    "concrete detail: a named object, a place, a time of day, or something " +
    "somebody actually does. Keep the same structure, section tags and language.";

  // The score vocabulary documents verse, chorus, bridge and interlude. Pre-chorus,
  // intro and outro are passed through as written and are not attested tags.
  var STRUCTURES = {
    simple: ["[Verse]", "[Chorus]", "[Verse]", "[Chorus]"],
    bridge: ["[Verse]", "[Chorus]", "[Verse]", "[Chorus]", "[Bridge]", "[Chorus]"],
    prechorus: ["[Verse]", "[Pre-Chorus]", "[Chorus]", "[Verse]", "[Pre-Chorus]", "[Chorus]", "[Bridge]", "[Chorus]"],
    full: ["[Intro]", "[Verse]", "[Pre-Chorus]", "[Chorus]", "[Verse]", "[Pre-Chorus]", "[Chorus]", "[Bridge]", "[Chorus]", "[Outro]"]
  };

  // Phrases people name when a song sounds machine-written; the worst ones
  // are worth a rewrite on their own, the rest only in bulk.
  var CLICHES = [
    "neon", "echoes", "echo of", "whisper", "shadows dance", "dancing in the shadow",
    "dance in the shadow", "chasing shadows", "city lights",
    "fading light", "endless night", "into the night", "dead of night",
    "burning bright", "blinding light", "silver moon", "moonlit",
    "burning desire", "fire inside", "hearts on fire", "flames of",
    "rise from the ashes", "phoenix", "set the night on fire",
    "broken heart", "shattered dreams", "shattered glass", "picking up the pieces",
    "break these chains", "breaking free", "spread my wings", "silent scream",
    "endless road", "path unknown", "long road", "chasing dreams", "no turning back",
    "weather the storm", "drowning in", "eye of the storm", "tears like rain", "storm inside",
    "hidden scars", "unseen tears", "lost in time", "memories fade", "frozen in time",
    "against all odds", "rise again", "stand tall", "feel alive", "come alive",
    "electric dreams", "concrete jungle", "velvet sky", "crimson sky",
    "neonlicht", "neonlichter", "im schatten tanz", "tanz im schatten",
    "zerbrochene träume", "gebrochenes herz", "ketten sprengen",
    "asche", "flügel", "sterne verglühen", "endlose nacht", "im regen stehen"
  ];
  var WORST = ["neon", "echoes", "whisper", "shadows dance", "dancing in the shadow", "city lights", "neonlicht", "neonlichter"];

  function findCliches(text) {
    var lowered = String(text).toLowerCase(), found = {};
    CLICHES.forEach(function (phrase) { if (lowered.indexOf(phrase) >= 0) found[phrase] = true; });
    return Object.keys(found).sort();
  }

  function hasSections(lyrics) {
    return String(lyrics).split(/\r?\n/).some(function (line) { return line.trim().charAt(0) === "["; });
  }

  function structureRequest(structure) {
    var sections = STRUCTURES[structure] || STRUCTURES.bridge, lines = ["\n\nSection order, exactly:"];
    sections.forEach(function (section) {
      if (section === "[Intro]" || section === "[Outro]") lines.push(section + " — instrumental: write the tag alone, with no words under it");
      else if (section === "[Bridge]") lines.push("[Bridge] — two to four lines, new words");
      else if (section === "[Pre-Chorus]") lines.push("[Pre-Chorus] — two lines, identical each time");
      else if (section === "[Chorus]") lines.push("[Chorus] — four lines, identical each time");
      else lines.push("[Verse] — four lines, new words each time");
    });
    return lines.join("\n");
  }

  // HERESY 1167: a brief out of an answer that is not clean JSON (guided decoding on vLLM gave {"{"title":… with the 27B):
  // the first object inside it that parses and has a title, a style or lyrics; null when there is none
  function looseBrief(text) {
    var s = stripThinking(String(text || ""));
    try { return JSON.parse(s); } catch (error) { /* read it leniently below */ }
    var ends = [];
    for (var j = s.length - 1; j >= 0 && ends.length < 6; j--) if (s.charAt(j) === "}") ends.push(j);
    for (var i = s.indexOf("{"), tries = 0; i >= 0 && tries < 40; i = s.indexOf("{", i + 1), tries++) {
      for (var k = 0; k < ends.length; k++) {
        if (ends[k] <= i) continue;
        try {
          var o = JSON.parse(s.slice(i, ends[k] + 1));
          if (o && typeof o === "object" && (o.title || o.style || o.lyrics)) return o;
        } catch (error) { /* the next end */ }
      }
    }
    return null;
  }
  function stripThinking(text) {
    var open = "<think>", close = "</think>";
    while (text.indexOf(open) >= 0 && text.indexOf(close) > text.indexOf(open)) {
      text = text.slice(0, text.indexOf(open)) + text.slice(text.indexOf(close) + close.length);
    }
    text = text.trim();
    var fence = text.match(/^```(?:json)?\s*([\s\S]*?)```$/);
    return fence ? fence[1].trim() : text;
  }

  var CHAT = { status: null };

  function chatBase() {
    var url = ($("chatUrl").value || "").trim().replace(/\/+$/, "");
    ["/chat/completions", "/models"].forEach(function (suffix) {
      if (url.slice(-suffix.length) === suffix) url = url.slice(0, -suffix.length);
    });
    if (url && !/^https?:\/\//i.test(url)) url = "http://" + url;
    if (url && url.slice(-3) !== "/v1") url += "/v1";
    return url;
  }

  function chatCall(url, payload, timeoutMs) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, timeoutMs || 900000);
    var options = { signal: controller.signal };
    if (payload !== undefined) {
      options.method = "POST";
      options.headers = { "Content-Type": "application/json" };
      options.body = JSON.stringify(payload);
    }
    return fetch(url, options).then(function (r) {
      return r.text().then(function (text) {
        if (!r.ok) {
          var failure = new Error("HTTP " + r.status + (text ? ": " + text.slice(0, 200) : ""));
          failure.status = r.status;
          throw failure;
        }
        return text ? JSON.parse(text) : {};
      });
    }).then(function (data) { clearTimeout(timer); return data; }, function (error) { clearTimeout(timer); throw error; });
  }

  function unreachable(base) {
    return "The browser could not reach " + base + ". Either the chat server is not running, or it refuses " +
      "requests from this page (CORS): turn CORS on in its settings, or open this page from the same machine name.";
  }

  // Reachability and the loaded model, without asking the server to load anything.
  function chatStatus() {
    var base = chatBase();
    if (!base) return Promise.resolve({ configured: false, available: false, models: [], loaded: null, use: null });
    var root = base.slice(0, -3);
    var status = { configured: true, available: false, models: [], loaded: null, use: null, base: base };
    return chatCall(base + "/models", undefined, 3000).then(function (data) {
      status.available = true;
      var list = (data && data.data) || [];
      status.models = list.map(function (m) { return m.id || ""; });
      // HERESY 1006: vLLM lists only what it serves, so every model it names is loaded.
      // Asking it the other runners' native paths only fills the console with 404s.
      status.vllm = list.length > 0 && list.every(function (m) { return m.owned_by === "vllm" || m.owned_by === "ruach"; });   // 1811: and the studio's own
    }).catch(function (error) {
      status.error = error.status ? error.message : unreachable(base);
      throw status;
    }).then(function () {
      if (status.vllm) { status.loaded = status.models.slice(); return; }
      // Runners that list every downloaded model report which one is in memory
      // on a native endpoint; asking for any other would make them load it.
      return chatCall(root + "/api/v0/models", undefined, 3000).then(function (data) {
        status.loaded = ((data && data.data) || []).filter(function (m) { return m.state === "loaded"; }).map(function (m) { return m.id || ""; });
      }).catch(function () {
        // Another common runner lists what is in memory under /api/ps.
        return chatCall(root + "/api/ps", undefined, 3000).then(function (data) {
          if (data && Array.isArray(data.models)) {
            status.loaded = data.models.map(function (m) { return m.model || m.name || ""; }).filter(Boolean);
          }
        }).catch(function () {});
      });
    }).then(function () {
      status.use = status.loaded !== null ? (status.loaded[0] || null) : (status.models[0] || null);
      return status;
    }).catch(function (failed) {
      if (failed === status) return status;
      throw failed;
    });
  }

  // HERESY 1110: the Writing room's own line: which writer, where, and whether it answers
  function paintAssistLine(status) {
    var el = $("assistLine");
    if (!el) return;
    if ($("assistProvider") && $("assistProvider").value === "openrouter") {
      el.dataset.s = "ready"; el.textContent = "Writer: OpenRouter, with your key; the brief and the song go to openrouter.ai.";
      return;
    }
    status = status || CHAT.status || {};
    var base = status.base || chatBase() || "";
    if (!status.configured) { el.dataset.s = "bad"; el.textContent = "Writer: no chat server set. Engine → Chat server (vLLM, LM Studio, Ollama), or choose OpenRouter below."; }
    else if (!status.available) { el.dataset.s = "bad"; el.textContent = "Writer: the chat server at " + base + " does not answer. Start it there, or choose OpenRouter below. (Checked just now; entering the Writer checks again.)"; }
    else if (!status.use) { el.dataset.s = "warn"; el.textContent = "Writer: the chat server at " + base + " answers, but has no model loaded: load one there."; }
    else { el.dataset.s = "ready"; el.textContent = "Writer: " + status.use + " at " + base + ", ready."; }
  }
  function paintChat(status) {
    paintAssistLine(status);
    var pill = $("chatState");
    pill.textContent = !status.configured ? "not set" : (!status.available ? "not answering" : (status.use ? "ready" : "no model loaded"));
    pill.dataset.s = status.use ? "ready" : (status.configured ? "bad" : "missing");
    $("chatHint").textContent = status.use
      ? "Loaded now: " + status.use + ". This page uses it as is and never loads, switches or unloads a model."
      : (status.available ? "The server answers but reports no loaded model. Load one there first."
         : (status.error || "Uses whatever model the server has loaded. This page never loads, switches or unloads a model on it."));
    $("museModel").innerHTML = status.use
      ? escape(status.use) + ' <span class="dim">loaded on the chat server</span>'
      : '<span class="dim">none yet · ' + (!status.configured ? "set the chat server under Engine"
        : (status.available ? "load a model in the chat server" : "the chat server is not answering")) + "</span>";
    $("museBtn").disabled = !status.use;
    if ($("ownUse")) paintOwn(OWN);   // HERESY 1811: «Use this writer» lit while the Writer asks the studio's own
    // the state is the Chat Server button; what to do about it is its tip
    var link = $("chatLink");
    link.dataset.s = status.available ? "on" : "off";
    link.dataset.tip = !status.configured ? "Set the chat server address under Engine"
      : (!status.available ? "The chat server is not answering — check its address under Engine"
        : (status.use ? "Loaded now: " + status.use : "The server answers but has no model loaded: load one there first")) + ". Click to check again.";
    if (tipFor === link) showTip(link);
    if (!$("museBtn").dataset.busy || $("museBtn").dataset.busy === "0") {
      $("museStatus").textContent = "";
      $("museStatus").classList.remove("bad");
    }
  }

  function refreshChat() {
    return chatStatus().then(function (status) { paintChat(status); return status; });
  }

  // Structured output first, then plain chat, then the system turn folded into
  // the user turn for templates that reject one. Only a refused request is
  // worth another shape.
  // HERESY 1010: temperature is optional — left out it stays 0.9 (the idea writer), null lets
  // the server choose, as Studio's "Automatic"; top_p goes with the page's own temperature only.
  function chatComplete(messages, model, maxTokens, schema, temperature) {
    var payload = { model: model, messages: messages, max_tokens: maxTokens, stream: false };
    if (temperature === undefined) { payload.temperature = 0.9; payload.top_p = 0.95; }
    else if (temperature !== null) payload.temperature = temperature;
    var attempts = [];
    if (schema) attempts.push(Object.assign({}, payload, { response_format: { type: "json_schema", json_schema: { name: "brief", schema: schema } } }));
    attempts.push(payload);
    var system = messages.filter(function (m) { return m.role === "system"; }).map(function (m) { return m.content; }).join("\n\n");
    var rest = messages.filter(function (m) { return m.role !== "system"; });
    if (system && rest.length) {
      attempts.push(Object.assign({}, payload, { messages: [Object.assign({}, rest[0], { content: system + "\n\n" + rest[0].content })].concat(rest.slice(1)) }));
    }
    var base = chatBase(), n = 0;
    function next(lastError) {
      if (n >= attempts.length) return Promise.reject(lastError);
      var attempt = attempts[n++];
      return chatCall(base + "/chat/completions", attempt).catch(function (error) {
        if (error.status && error.status >= 400 && error.status < 500) return next(error);
        if (!error.status) throw new Error(unreachable(base));
        throw error;
      });
    }
    return next(null);
  }

  $("chatUrl").value = recall("yue2.chatUrl") || "";
  // HERESY 1811 (Viktor 28.10.2026: «прикручивай как Local Studio LLM… и пусть это будет опция по умолчанию для установок, где VRAM позволяет. Так не
  // нужно будет юзеру коннектиться на внешние сервисы»): the studio's own writer behind the lab's /llm/v1. Where its weights are here and no chat server
  // was ever chosen, the Writer asks it: that default follows the page's own address and is not stored, so it holds through the https door too
  var OWN = {}, OWN_SCOPE = (function () { try { return new URLSearchParams(location.search).get("scope") || ""; } catch (e) { return ""; } })();
  function ownBase() { return location.origin + "/lab/llm/v1"; }
  function paintOwn(st) {
    OWN = st || {};
    var here = OWN.here || [], ready = here.length > 0 && !!OWN.server;
    $("ownState").textContent = !here.length ? "not here" : (!OWN.server ? "llama-server not built" : (!OWN.running ? "asleep"
      : (OWN.gpu === null || OWN.gpu === undefined ? "on the processor" : (OWN.fit ? "on GPU " + OWN.gpu + " and the processor" : "on GPU " + OWN.gpu))));
    $("ownState").dataset.s = ready ? "ready" : "missing";
    Array.prototype.forEach.call($("ownVariant").options, function (o) { o.disabled = here.indexOf(o.value) < 0; });
    if (OWN.variant) $("ownVariant").value = OWN.variant;
    $("ownVariant").disabled = here.length < 2;
    $("ownUse").disabled = !ready;
    $("ownUse").classList.toggle("is-on", ready && chatBase() === ownBase());
    $("ownStop").disabled = !OWN.running;
    $("ownHint").textContent = !here.length ? "Not here yet: Engine → Models and LoRAs → Studio writer fetches it (6.7 GB; compact 5.5 GB)."
      : (!OWN.server ? "Its weights are here; llama.cpp's llama-server is not built yet: launcher/extras.sh builds it."
        : "Qwopus3.5-9B-v3 (Jackrong's, on Qwen3.5-9B, Apache-2.0), quantized with AutoRound, through llama.cpp on this machine: nothing leaves it. It starts at the first question and leaves the card after 10 minutes without one.");
  }
  function ownStatus() {
    return fetch("/lab/llm/status").then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; }).then(function (st) {
      paintOwn(st);
      if (!recall("yue2.chatUrl") && (st.here || []).length && st.server && $("chatUrl").value !== ownBase()) {
        $("chatUrl").value = ownBase();
        refreshChat().catch(function () {});
      }
      return st;
    });
  }
  function ownPost(path, body) {
    return fetch("/lab/llm/" + path + (OWN_SCOPE ? "?scope=" + encodeURIComponent(OWN_SCOPE) : ""), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) })
      .then(function (r) { return r.json(); }).then(paintOwn).catch(function () { ownStatus(); });
  }
  $("ownUse").addEventListener("click", function () {
    $("chatUrl").value = ownBase();
    $("chatUrl").dispatchEvent(new Event("change", { bubbles: true }));
    paintOwn(OWN);
  });
  $("ownStop").addEventListener("click", function () { ownPost("stop"); });
  $("ownVariant").addEventListener("change", function () { ownPost("variant", { variant: this.value }); });
  ownStatus();
  all("[data-chat-url]").forEach(function (b) {   // HERESY 1012
    b.addEventListener("click", function () {
      $("chatUrl").value = b.dataset.chatUrl;
      $("chatUrl").dispatchEvent(new Event("change", { bubbles: true }));
    });
  });
  $("chatUrl").addEventListener("change", function () {
    store("yue2.chatUrl", this.value.trim() || null);
    refreshChat().catch(function () {});
  });

  $("chatTest").addEventListener("click", function () {
    var button = this;
    button.disabled = true;
    store("yue2.chatUrl", $("chatUrl").value.trim() || null);
    var started = performance.now();
    refreshChat().then(function (status) {
      if (!status.configured) throw new Error("Type the chat server's address first");
      if (!status.available) throw new Error(status.error || "The chat server is not answering");
      if (!status.use) throw new Error("No model is loaded in the chat server; load one there (this page never loads one)");
      started = performance.now();
      return chatComplete([{ role: "user", content: "Reply with the single word OK." }], status.use, 8).then(function (response) {
        var reply = ((((response.choices || [])[0] || {}).message || {}).content || "").trim().slice(0, 40);
        toast("Chat server OK: " + status.use + " answered \u201c" + reply + "\u201d in " + ((performance.now() - started) / 1000).toFixed(2) + " s", "good");
      });
    }).catch(function (error) { toast(error.message, "bad"); })
      .then(function () { button.disabled = false; });
  });

  $("chatLink").addEventListener("click", function () { refreshChat().catch(function () {}); });

  $("museDrawer").addEventListener("toggle", function () {
    if (this.open) paintStructureHint();
    if (this.open) refreshChat().catch(function () {});
  });

  $("idea").addEventListener("keydown", function (event) {
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); writeBrief(); }   // Shift+Enter: a new line
  });
  $("museBtn").addEventListener("click", writeBrief);

  $("autoRun").checked = recall("yue2.autorun") === "1";
  $("autoRun").addEventListener("change", function () { store("yue2.autorun", this.checked ? "1" : "0"); });

  function writeBrief() {
    var idea = $("idea").value.trim();
    if (!idea) { $("idea").focus(); return toast("Describe the song in a line first", "bad"); }
    var button = $("museBtn"), started = Date.now(), model = null;
    button.dataset.busy = "1";
    $("museLabel").textContent = $("autoRun").checked ? "Writing, then generating…" : "Writing…";
    $("museStatus").classList.remove("bad");
    $("museStatus").textContent = "asking the chat server";
    var ticker = setInterval(function () {
      $("museStatus").textContent = "writing… " + Math.round((Date.now() - started) / 1000) + "s";
    }, 1000);
    // HERESY 1167 (Viktor: «И в LLM ты уже дописал в устав всё то, что мы получили по нашим пробам?»): what the Writer's
    // charter knows of this engine, after the idea writer's own rules (a brief here has no notes: what would go there stays out)
    var known = window.HeresyAssist && window.HeresyAssist.knowledge ? window.HeresyAssist.knowledge() : "";
    var messages = [{ role: "system", content: MUSE_SYSTEM + (known ? "\n\nWHAT THIS STUDIO KNOWS OF ITS ENGINE\n" +
                      "(A brief here has only title, style and lyrics: whatever the notes below would say goes nowhere; keep to the rules.)\n" +
                      known : "") },
                    { role: "user", content: "Idea: " + idea + structureRequest($("structure").value) }];
    var retried = false, finishReason = null, schema = MUSE_SCHEMA;

    function ask(history) {
      return chatComplete(history, model, 4096, schema).then(function (response) {
        var choice = (response.choices || [])[0] || {};
        finishReason = choice.finish_reason || finishReason;
        return (choice.message || {}).content || "";
      });
    }

    refreshChat().then(function (status) {
      if (!status.configured) throw new Error("Set the chat server address under Engine first");
      if (!status.available) throw new Error(status.error || "The chat server is not answering at " + status.base);
      if (!status.use) throw new Error("No model is loaded in the chat server. Load one there; this page never loads or switches models.");
      model = status.use;
      return ask(messages);
    }).then(function (content) {
      var parsed = looseBrief(content);
      if (parsed) return { parsed: parsed, content: content };
      schema = null;                     // HERESY 1167: a broken guided answer: once more, the same request free
      return ask(messages).then(function (content2) {
        var parsed2 = looseBrief(content2);
        if (!parsed2) throw new Error("The writer did not return usable JSON. Try again, or load another model.");
        return { parsed: parsed2, content: content2 };
      });
    }).then(function (got) {
      var parsed = got.parsed, content = got.content;
      // Section tags are what YuE2 reads as structure. Smaller writers drop them,
      // so check and give the model one corrective pass before accepting the brief.
      var note = null;
      if (!hasSections(parsed.lyrics || "")) note = RETRY_NOTE;
      else {
        var found = findCliches(parsed.lyrics || "");
        if (found.length >= 2 || found.some(function (p) { return WORST.indexOf(p) >= 0; })) note = CLICHE_NOTE.replace("%s", found.slice(0, 8).join(", "));
      }
      if (!note) return parsed;
      retried = true;
      return ask(messages.concat([{ role: "assistant", content: content }, { role: "user", content: note }])).then(function (content2) {
        var parsed2 = looseBrief(content2);
        if (!parsed2) return parsed;
        var better = hasSections(parsed2.lyrics || "") &&
          findCliches(parsed2.lyrics || "").length <= findCliches(parsed.lyrics || "").length;
        return better ? parsed2 : parsed;
      }).catch(function () { return parsed; });
    }).then(function (brief) {
      var lyrics = String(brief.lyrics || "").trim();
      var sung = lyrics.split(/\r?\n/).filter(function (l) { return l.trim() && l.trim().charAt(0) !== "["; });
      var title = String(brief.title || "").trim() || (sung[0] || idea).slice(0, 60).replace(/^[\s,.!?-]+|[\s,.!?-]+$/g, "");
      keepForm("before");                              // HERESY 1596: the Writer's brief over the form
      setTitle(title);                                 // HERESY 1614
      if (brief.style) $("style").value = String(brief.style).trim();
      if (lyrics) { $("lyrics").value = lyrics; growLyrics(); }
      setCodes(null);
      var cliches = findCliches(lyrics), cut = finishReason === "length";
      var sections = lyrics.split(/\r?\n/).filter(function (l) { return l.trim().charAt(0) === "["; }).length;
      // HERESY 1166: the model's name as it is, the rest translated piece by piece
      $("museStatus").textContent = [model].concat([Math.round((Date.now() - started) / 100) / 10 + "s", sung.length + " lines", sections + " sections",
        retried ? "rewritten once" : "", cliches.length ? "stock phrases left: " + cliches.join(", ") : "",
        cut ? "CUT OFF at the token limit" : "", "model left as it was"].filter(Boolean).map(tr)).join(" · ");
      $("museStatus").classList.toggle("bad", cut);
      toast("Brief written: " + title, "good");
      if ($("autoRun").checked) {
        // Submit the form rather than calling the server: the one path that
        // also reads the mode, seeds, supplied score and sampling boxes.
        $("composeForm").requestSubmit();
      }
    }).catch(function (error) {
      $("museStatus").textContent = "";
      toast(error.message, "bad");
    }).then(function () {
      clearInterval(ticker);
      button.dataset.busy = "0";
      $("museLabel").textContent = "Write the brief";
    });
  }

  /* ---------------------------------------------------------------- boot */

  function propsChanged(a, b) {
    var pick = function (p) { return JSON.stringify([p.version, p.model, p.vaes, p.default_vae, p.sliders, p.loras, p.sources, p.max_batch, p.transcriber, p.outputs]); };
    return !a || pick(a) !== pick(b);
  }

  function pollProps() {
    api("/props").then(function (props) {
      var wasOnline = STATE.online;
      STATE.online = true;
      if (propsChanged(STATE.props, props)) { applyProps(props); refreshSettings(); }
      if (!wasOnline) { paintEngine(); paintSubmitNote(); refreshLibrary().catch(function () {}); }
    }).catch(function () {
      if (STATE.online) { STATE.online = false; paintEngine(); paintSubmitNote(); }
    });
  }

  window.addEventListener("error", function (event) {
    // HERESY 1148: the browser's note that a ResizeObserver's layout spilled into the next frame is no error of the page
    // (the spec calls it harmless; nothing stops): said in the console, not as a red toast (Viktor saw one in the Librarian)
    if (/ResizeObserver loop/.test(event.message || "")) { console.debug(event.message); return; }
    toastOnce("page-error:" + (event.message || ""), "Page error: " + (event.message || "unknown") + " — reload if things stop responding", "bad");
  });

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState !== "visible") return;
    pollProps();
    if (!STATE.online) return;
    refreshHardware();
    refreshLibrary().catch(function () {});
  });

  // ------------------------------------------------------------ column grips
  // Drag the line between two columns to resize the compose column (left) or the takes list (right); the
  // middle column takes what is left and never goes under its minimum. Double-click or Home gives the
  // default width back; arrow keys move a focused grip. The widths are this browser's own ("yue2.cols"),
  // kept as dragged: a smaller window squeezes them for now, a bigger one gives them back.
  var GRIPS = {
    left: { grip: "gripLeft", col: "view-compose", prop: "--col-left", min: 380, sign: 1 },
    right: { grip: "gripRight", col: "library", prop: "--col-right", min: 240, sign: -1 }
  };
  var MIDDLE_MIN = 420;
  var workspace = document.querySelector(".workspace");
  var stacked = window.matchMedia("(max-width: 1150px)");

  function savedCols() {
    var cols;
    try { cols = JSON.parse(recall("yue2.cols") || "{}") || {}; } catch (error) { cols = {}; }
    return cols;
  }
  function colWidth(side) { return Math.round($(GRIPS[side].col).getBoundingClientRect().width); }
  // the widest this side may be: the window less the other column, the middle's minimum and the two gaps
  function colMax(side) {
    var other = side === "left" ? "right" : "left";
    return Math.floor(workspace.getBoundingClientRect().width - colWidth(other) - MIDDLE_MIN - 2);
  }
  function setCol(side, px) {
    var g = GRIPS[side];
    if (px === null) workspace.style.removeProperty(g.prop);
    else workspace.style.setProperty(g.prop, Math.round(Math.max(g.min, Math.min(px, colMax(side)))) + "px");
    var grip = $(g.grip);
    grip.setAttribute("aria-valuenow", String(colWidth(side)));
    grip.setAttribute("aria-valuemin", String(g.min));
  }
  function applyCols() {
    if (stacked.matches || !workspace.offsetParent) return;
    var cols = savedCols();
    // left first against the default right, then right against the left it got, then left again
    ["left", "right", "left"].forEach(function (side) { setCol(side, typeof cols[side] === "number" ? cols[side] : null); });
  }
  function saveCol(side, px) {
    var cols = savedCols();
    if (px === null) delete cols[side]; else cols[side] = px;
    store("yue2.cols", Object.keys(cols).length ? JSON.stringify(cols) : null);
  }

  Object.keys(GRIPS).forEach(function (side) {
    var g = GRIPS[side], grip = $(g.grip);
    grip.addEventListener("pointerdown", function (event) {
      if (event.button !== 0) return;
      var startX = event.clientX, from = colWidth(side);
      grip.setPointerCapture(event.pointerId);
      grip.classList.add("is-dragging");
      document.body.classList.add("is-resizing");
      function move(e) { setCol(side, from + g.sign * (e.clientX - startX)); }
      function done(e) {
        grip.removeEventListener("pointermove", move);
        grip.removeEventListener("pointerup", done);
        grip.removeEventListener("pointercancel", done);
        grip.classList.remove("is-dragging");
        document.body.classList.remove("is-resizing");
        if (e.clientX !== startX) saveCol(side, colWidth(side));
      }
      grip.addEventListener("pointermove", move);
      grip.addEventListener("pointerup", done);
      grip.addEventListener("pointercancel", done);
    });
    grip.addEventListener("dblclick", function () { saveCol(side, null); applyCols(); });
    grip.addEventListener("keydown", function (event) {
      var step = event.shiftKey ? 64 : 16, px;
      if (event.key === "ArrowLeft") px = colWidth(side) - g.sign * step;
      else if (event.key === "ArrowRight") px = colWidth(side) + g.sign * step;
      else if (event.key === "Home") { event.preventDefault(); saveCol(side, null); applyCols(); return; }
      else return;
      event.preventDefault();
      setCol(side, px);
      saveCol(side, colWidth(side));
    });
  });
  // re-fit on window resizes, and when the workspace comes back from the Engine page
  if (window.ResizeObserver) new ResizeObserver(applyCols).observe(workspace);
  else window.addEventListener("resize", applyCols);
  applyCols();

  // ------------------------------------------------------------ the take over its takes (HERESY 1167)
  // From 1400 px the Creator's last third is the take over its takes (Viktor 05.10.2026: «во втором фрейме 1/3 ширины
  // вниз этого фрейма под-фреймом»). The line between them is dragged up or down (140 px left to each at least);
  // double-click or Home gives the default back, arrows move a focused line. Kept as a share of the room's height,
  // this browser's own ("yue2.kSplit"), so a taller window gives both more.
  var kSplit = $("kSplit");
  function kTake() { return Math.round($("view-take").getBoundingClientRect().height); }
  function setSplit(px) {
    var h = workspace.getBoundingClientRect().height;
    if (px === null || !h) { workspace.style.removeProperty("--k-take"); return; }
    workspace.style.setProperty("--k-take", (Math.max(140, Math.min(px, h - 140)) / h * 100).toFixed(2) + "%");
  }
  function applySplit() {
    var share = parseFloat(recall("yue2.kSplit") || "");
    if (isFinite(share) && share > 0 && share < 100) workspace.style.setProperty("--k-take", share + "%");
    else workspace.style.removeProperty("--k-take");
  }
  function saveSplit() {
    var h = workspace.getBoundingClientRect().height;
    store("yue2.kSplit", h ? (kTake() / h * 100).toFixed(2) : null);
  }
  kSplit.addEventListener("pointerdown", function (event) {
    if (event.button !== 0) return;
    var startY = event.clientY, from = kTake();
    kSplit.setPointerCapture(event.pointerId);
    kSplit.classList.add("is-dragging");
    document.body.classList.add("is-resizing-rows");
    function move(e) { setSplit(from + (e.clientY - startY)); }
    function done(e) {
      kSplit.removeEventListener("pointermove", move);
      kSplit.removeEventListener("pointerup", done);
      kSplit.removeEventListener("pointercancel", done);
      kSplit.classList.remove("is-dragging");
      document.body.classList.remove("is-resizing-rows");
      if (e.clientY !== startY) saveSplit();
    }
    kSplit.addEventListener("pointermove", move);
    kSplit.addEventListener("pointerup", done);
    kSplit.addEventListener("pointercancel", done);
  });
  kSplit.addEventListener("dblclick", function () { store("yue2.kSplit", null); applySplit(); });
  kSplit.addEventListener("keydown", function (event) {
    var step = event.shiftKey ? 64 : 16;
    if (event.key === "ArrowUp") setSplit(kTake() - step);
    else if (event.key === "ArrowDown") setSplit(kTake() + step);
    else if (event.key === "Home") { event.preventDefault(); store("yue2.kSplit", null); applySplit(); return; }
    else return;
    event.preventDefault();
    saveSplit();
  });
  applySplit();

  // HERESY 1167 (Viktor 05.10.2026: «К Творцу можно добавить регулирование ширины наших двух фреймов, но нужны ограничители:
  // 55/45 - 70/30. Расхлопывание фрейма Takes до 40/60 и выстраивание фрейма генератива в одну колонку в таком режиме»): the
  // line between the form and the take, dragged: the form 55 to 70 % of the width; below 55 it snaps to 40, the takes take
  // 60 % and the form stands in one column. Double-click or Home: the default (two thirds); arrows move it. This browser's.
  var kVSplit = $("kVSplit");
  function kShare(raw) { return raw < 55 ? 40 : Math.max(55, Math.min(70, raw)); }
  function setWidths(raw) {
    var on = raw !== null && isFinite(raw);
    workspace.classList.toggle("k-wide", on && raw < 55);
    if (!on) { workspace.style.removeProperty("--k-l"); workspace.style.removeProperty("--k-r"); kVSplit.setAttribute("aria-valuenow", "67"); return; }
    var s = kShare(raw);
    workspace.style.setProperty("--k-l", s + "fr");
    workspace.style.setProperty("--k-r", (100 - s) + "fr");
    kVSplit.setAttribute("aria-valuenow", String(Math.round(s)));
  }
  function saveWidths(raw) { store("yue2.kWidth", raw === null ? null : String(kShare(raw))); window.dispatchEvent(new Event("resize")); }
  setWidths(parseFloat(recall("yue2.kWidth") || "NaN") || null);
  kVSplit.addEventListener("pointerdown", function (event) {
    if (event.button !== 0) return;
    var box = workspace.getBoundingClientRect(), last = null;
    kVSplit.setPointerCapture(event.pointerId);
    kVSplit.classList.add("is-dragging");
    document.body.classList.add("is-resizing");
    function move(e) { last = (e.clientX - box.left) / box.width * 100; setWidths(last); }
    function done() {
      kVSplit.removeEventListener("pointermove", move);
      kVSplit.removeEventListener("pointerup", done);
      kVSplit.removeEventListener("pointercancel", done);
      kVSplit.classList.remove("is-dragging");
      document.body.classList.remove("is-resizing");
      if (last !== null) saveWidths(last);
    }
    kVSplit.addEventListener("pointermove", move);
    kVSplit.addEventListener("pointerup", done);
    kVSplit.addEventListener("pointercancel", done);
  });
  kVSplit.addEventListener("dblclick", function () { setWidths(null); saveWidths(null); });
  kVSplit.addEventListener("keydown", function (event) {
    var now = parseFloat(kVSplit.getAttribute("aria-valuenow")) || 67, next;
    if (event.key === "ArrowLeft") next = now <= 55 ? 40 : now - 1;
    else if (event.key === "ArrowRight") next = now < 55 ? 55 : Math.min(70, now + 1);
    else if (event.key === "Home") { event.preventDefault(); setWidths(null); saveWidths(null); return; }
    else return;
    event.preventDefault();
    setWidths(next);
    saveWidths(next);
  });

  // HERESY 1266 (Viktor 09.10.2026: «убирай из него высокий вариант… Стабильный тулбар во всей Студии»): the bar tall at the
  // page's top (1167) is gone; one height everywhere, the logo inside it

  // ------------------------------------------------------------- appearance
  // The Engine page's Appearance card: the theme (the same choice as the top bar's swatches), options that
  // work with any theme, and the fonts below. The options are this browser's ("yue2.look"); the <head>
  // script puts them on <html> before the first paint, and app.css reads them there.
  var LOOK_CHECKS = { hover: ["lookHover", "accent"], glow: ["lookGlow", "on"], motion: ["lookMotion", "reduced"] };
  // HERESY 1167 (Viktor: «дефолтом выставь все мои параметры как на скрине»): nothing kept yet = his look; a choice kept
  // is kept whole (an unticked option stays unticked)
  var LOOK_DEFAULT = {"corners":"soft","glow":"on","hover":"accent"};
  function savedLook() {
    var look, kept = recall("yue2.look");
    if (kept === null) return Object.assign({}, LOOK_DEFAULT);
    try { look = JSON.parse(kept) || {}; } catch (error) { look = {}; }
    return look;
  }
  function applyLook() {
    var look = savedLook(), root = document.documentElement;
    ["hover", "glow", "motion", "corners"].forEach(function (key) {
      if (typeof look[key] === "string") root.dataset[key] = look[key]; else delete root.dataset[key];
    });
  }
  function saveLook(key, value) {
    var look = savedLook();
    if (value) look[key] = value; else delete look[key];
    store("yue2.look", JSON.stringify(look));        // HERESY 1167: even empty: «nothing kept» means the defaults now
    applyLook();
  }
  function paintLook() {
    var look = savedLook();
    Object.keys(LOOK_CHECKS).forEach(function (key) { $(LOOK_CHECKS[key][0]).checked = look[key] === LOOK_CHECKS[key][1]; });
    $("lookCorners").value = look.corners || "";
    $("lookWhen").value = look.when || "";              // HERESY 1720
    $("lookTheme").value = YueThemes.current();
  }
  (function fillThemes() {
    var families = { classic: "Classic", bold: "Bold", soft: "Soft" }, groups = {};
    YueThemes.list.forEach(function (theme) {
      var family = families[theme.family] ? theme.family : "classic";
      if (!groups[family]) {
        groups[family] = document.createElement("optgroup");
        groups[family].label = families[family];
      }
      groups[family].appendChild(fontOption(theme.id, theme.name));
      groups[family].lastChild.style.fontFamily = "";
    });
    ["classic", "bold", "soft"].forEach(function (family) { if (groups[family]) $("lookTheme").appendChild(groups[family]); });
  })();
  $("lookTheme").addEventListener("change", function () { YueThemes.set(this.value); });

  // HERESY 1015: the first run keeps a theme already chosen, as the day or night one it is. HERESY 1167: as the system by
  // default now, and day kept as "light" (it was kept as nothing): a theme already chosen is kept as it was, once
  var had = recall("yue2.theme") !== null ? themeInfo(YueThemes.current()) : null;
  if (had && recall(SCHEME_KEY) === null && recall(had.dark ? NIGHT_KEY : DAY_KEY) === null) store(had.dark ? NIGHT_KEY : DAY_KEY, had.id);
  if (recall("yue2.schemeV2") === null) {
    if (had && recall(SCHEME_KEY) === null) { store(had.dark ? NIGHT_KEY : DAY_KEY, had.id); store(SCHEME_KEY, had.dark ? "dark" : "light"); }
    store("yue2.schemeV2", "1");
  }
  $("dayNight").addEventListener("click", function () {
    var s = schemeNow();
    store(SCHEME_KEY, s === "light" ? "dark" : s === "dark" ? "auto" : "light");
    applyScheme();
  });
  if (darkQuery) {
    var onSystem = function () { if (schemeNow() === "auto") applyScheme(); };
    if (darkQuery.addEventListener) darkQuery.addEventListener("change", onSystem); else if (darkQuery.addListener) darkQuery.addListener(onSystem);
  }
  applyScheme();
  $("lookCorners").addEventListener("change", function () { saveLook("corners", this.value || null); });
  $("lookWhen").addEventListener("change", function () { saveLook("when", this.value || null); whenFlip = {}; repaintWhen(); });   // HERESY 1720
  Object.keys(LOOK_CHECKS).forEach(function (key) {
    $(LOOK_CHECKS[key][0]).addEventListener("change", function () { saveLook(key, this.checked ? LOOK_CHECKS[key][1] : null); });
  });

  // ------------------------------------------------------------------ fonts
  // Three fonts this browser can change ("yue2.fonts"; the <head> script applies them before the first paint):
  // the text (--sans), the headings (--heading, the text font unless picked) and numbers and code (--mono).
  // Each menu lists the app's own fonts, a line, then the fonts this computer has: a common set, found by
  // measuring, or every installed family after List all my fonts (the browser asks first; Chrome and Edge).
  // HERESY 1426 (Viktor 14.10.2026: «По скрину как у меня - выставь эти же шрифты по умолчанию»): Raleway, Michroma, Liberation Mono;
  // a chosen font falls back on the studio's own (back), so a letter it lacks comes from Noto, not from whatever the computer has; the
  // headings may still follow the text («Same as the text»)
  // HERESY 1493 (Viktor 16.10.2026: «Мой выбор шрифтов и скейлов забери в дефолты. ПО дизайну ДВИЖОК закрыт»): his own as the app's
  // own: Tektur headings, Noto Sans rooms, Raleway section marks, Jura buttons (app.css holds the same for the first paint); «Same as the
  // text» and «IBM Plex Mono, as they were» stay to be chosen
  var FONT_ROLES = {
    sans: { select: "fontSans", generic: "sans-serif", own: "Raleway", back: '"Noto Sans", sans-serif' },
    heading: { select: "fontHeading", generic: "sans-serif", own: "Tektur", back: "var(--sans)" },
    mono: { select: "fontMono", generic: "monospace", own: "Liberation Mono", back: '"Noto Sans Mono", monospace' },
    rooms: { select: "fontRooms", generic: "sans-serif", own: "Noto Sans", back: "var(--sans)" },   // HERESY 1428: the rooms' names in the bar
    // HERESY 1437: the sections' names on the wave and the buttons with words
    marks: { select: "fontMarks", generic: "monospace", own: "Raleway", back: '"IBM Plex Mono", monospace' },
    buttons: { select: "fontButtons", generic: "sans-serif", own: "Jura", back: "var(--sans)" }
  };
  function fontOf(role) { var saved = savedFonts()[role]; return typeof saved === "string" ? saved : FONT_ROLES[role].own; }   // HERESY 1493: the one in effect
  // HERESY 1437: each role's size against the text's, −2…+2 pt by 1 (yue2.fontSizes), on top of the page's own text size.
  // HERESY 1493: his sizes the app's own (−1, 0, +1, +2); only a size other than its own is kept
  var FONT_STEPS = ["heading", "rooms", "marks", "buttons"], FONT_SIZE_OWN = { heading: -1, rooms: 0, marks: 1, buttons: 2 };
  function fontSizes() {
    var t, out = {};
    try { t = JSON.parse(recall("yue2.fontSizes") || "{}") || {}; } catch (e) { t = {}; }
    FONT_STEPS.forEach(function (r) { out[r] = typeof t[r] === "number" ? Math.max(-2, Math.min(2, Math.round(t[r]))) : FONT_SIZE_OWN[r]; });
    return out;
  }
  // the canvas' own fonts (the wave, its scope): the role's family and size; «as they were» (none chosen): the role's own back font
  window.ruachCanvasFont = function (role, px, weight) {
    var r = FONT_ROLES[role], fam = fontOf(role), step = fontSizes()[role] || 0;
    return (weight ? weight + " " : "") + (px + step * 4 / 3) + "px " + (fam ? JSON.stringify(fam) + ", " + r.back : r.back);
  };
  // HERESY 1274 (Viktor 09.10.2026: «Добавь ещё в движок шрифты Raleway, Roboto, Lato»): ten of the app's own, all in the studio itself
  var APP_FONTS = ["Noto Sans", "Noto Sans Mono", "IBM Plex Sans", "IBM Plex Mono", "Bodoni Moda", "Space Grotesk", "Michroma", "Raleway", "Roboto", "Lato",
    "Liberation Mono", "Unbounded", "Tektur", "Jura"];               // HERESY 1426; 1428: three Michroma-like ones with Cyrillic and weights
  var COMMON_FONTS = ["Aptos", "Arial", "Avenir", "Avenir Next", "Bahnschrift", "Baskerville", "Calibri", "Cambria", "Candara",
    "Cantarell", "Cascadia Code", "Cascadia Mono", "Charter", "Consolas", "Constantia", "Corbel", "Courier New", "DejaVu Sans",
    "DejaVu Sans Mono", "DejaVu Serif", "Didot", "Fira Mono", "Fira Sans", "Franklin Gothic Medium", "Futura", "Garamond",
    "Georgia", "Gill Sans", "Helvetica", "Helvetica Neue", "Hoefler Text", "Inter", "Iowan Old Style", "JetBrains Mono", "Lato",
    "Liberation Mono", "Liberation Sans", "Liberation Serif", "Lucida Console", "Lucida Sans Unicode", "Menlo", "Monaco",
    "Noto Sans", "Noto Sans Mono", "Noto Serif", "Open Sans", "Optima", "Palatino", "Palatino Linotype", "Roboto", "Roboto Mono",
    "SF Mono", "Segoe UI", "Segoe UI Variable Text", "Sitka Text", "Source Code Pro", "Source Sans 3", "Tahoma", "Times New Roman",
    "Trebuchet MS", "Ubuntu", "Ubuntu Mono", "Verdana"];
  var systemFonts = [];

  function savedFonts() {
    var fonts;
    try { fonts = JSON.parse(recall("yue2.fonts") || "{}") || {}; } catch (error) { fonts = {}; }
    return fonts;
  }
  function applyFonts() {
    var saved = savedFonts(), root = document.documentElement, sizes = fontSizes();
    Object.keys(FONT_ROLES).forEach(function (role) {
      if (typeof saved[role] === "string") root.style.setProperty("--" + role, saved[role] ? JSON.stringify(saved[role]) + ", " + FONT_ROLES[role].back : "var(--sans)");
      else root.style.removeProperty("--" + role);
    });
    root.classList.toggle("fonts-buttons", !!fontOf("buttons"));   // HERESY 1437: a font dresses the buttons; «Same as the text», as they were; 1493 Jura unless so
    FONT_STEPS.forEach(function (r) { root.style.setProperty("--fsr-" + r, sizes[r] + "pt"); });   // HERESY 1493: 0 pt said too (app.css' own are −1 and +2)
    all("[data-fstep-say]").forEach(function (el) { var v = sizes[el.dataset.fstepSay] || 0; el.textContent = (v > 0 ? "+" : v < 0 ? "\u2212" : "") + Math.abs(v) + " pt"; });
    all("[data-fstep]").forEach(function (b) { var r = b.dataset.fstep.slice(0, -1), d = b.dataset.fstep.slice(-1), v = sizes[r] || 0; b.disabled = d === "-" ? v <= -2 : v >= 2; });
    if (typeof drawWave === "function") try { drawWave(); } catch (e) { /* no take on the wave yet */ }
    window.dispatchEvent(new CustomEvent("ruach-fonts"));
  }
  // installed when text set in it measures differently from a generic fallback
  function hasFont(family) {
    var ctx = hasFont.ctx || (hasFont.ctx = document.createElement("canvas").getContext("2d")), sample = "mmmmmwwwwwiiilll 0123 AaQq";
    return ["monospace", "serif", "sans-serif"].some(function (generic) {
      ctx.font = "32px " + generic;
      var base = ctx.measureText(sample).width;
      ctx.font = "32px " + JSON.stringify(family) + ", " + generic;
      return ctx.measureText(sample).width !== base;
    });
  }
  function fontOption(family, label) {
    var option = document.createElement("option");
    option.value = family;
    option.textContent = label;
    if (family && label === family) option.setAttribute("translate", "no");   // HERESY 1165: a font's name; "(default)" still translates
    if (family) option.style.fontFamily = JSON.stringify(family) + ", sans-serif";
    return option;
  }
  function paintFonts() {
    var saved = savedFonts();
    Object.keys(FONT_ROLES).forEach(function (role) {
      var r = FONT_ROLES[role], select = $(r.select), want = typeof saved[role] === "string" ? saved[role] : r.own;
      var system = systemFonts.slice();
      if (want && APP_FONTS.indexOf(want) < 0 && system.indexOf(want) < 0) system.push(want);   // kept from a longer list
      system = system.filter(function (x) { return APP_FONTS.indexOf(x) < 0; });   // HERESY 1426: the studio's own once, among its own
      select.textContent = "";
      if (role === "heading") select.appendChild(fontOption("", "Same as the text"));   // HERESY 1426: Michroma is the default now
      if (role === "rooms" || role === "buttons") select.appendChild(fontOption("", "Same as the text"));   // HERESY 1428; 1437; 1493 a choice, not the default
      if (role === "marks") select.appendChild(fontOption("", "IBM Plex Mono, as they were"));            // HERESY 1437; 1493
      APP_FONTS.forEach(function (family) { select.appendChild(fontOption(family, family === r.own ? family + " (default)" : family)); });
      select.appendChild(document.createElement("hr"));
      system.sort(function (a, b) { return a.localeCompare(b); }).forEach(function (family) { select.appendChild(fontOption(family, family)); });
      select.value = want;
    });
    $("fontsHint").textContent = systemFonts.length + " fonts found on this computer" +
      (typeof window.queryLocalFonts === "function" ? "; List all my fonts shows every one." : ".");
  }
  Object.keys(FONT_ROLES).forEach(function (role) {
    $(FONT_ROLES[role].select).addEventListener("change", function () {
      var saved = savedFonts();
      if (this.value === FONT_ROLES[role].own) delete saved[role]; else saved[role] = this.value;
      store("yue2.fonts", Object.keys(saved).length ? JSON.stringify(saved) : null);
      applyFonts();
    });
  });
  // HERESY 1437: a role's size, − and +
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-fstep]");
    if (!b || b.disabled) return;
    e.preventDefault(); e.stopPropagation();
    var r = b.dataset.fstep.slice(0, -1), d = b.dataset.fstep.slice(-1), t = fontSizes(), v = Math.max(-2, Math.min(2, (t[r] || 0) + (d === "+" ? 1 : -1)));
    t[r] = v;
    var keep = {};                                                   // HERESY 1493: only what differs from the app's own
    FONT_STEPS.forEach(function (k) { if (t[k] !== FONT_SIZE_OWN[k]) keep[k] = t[k]; });
    store("yue2.fontSizes", Object.keys(keep).length ? JSON.stringify(keep) : null);
    applyFonts();
    window.dispatchEvent(new Event("resize"));
  }, true);
  $("fontsReset").addEventListener("click", function () {
    askReset(recall("yue2.fonts") !== null || recall("yue2.look") !== null || recall("yue2.fontSizes") !== null,
      "Put the look options and the fonts back to the app's own?\n\nThe theme stays; the fonts and options chosen now are kept nowhere else.").then(function (ok) { if (ok) fontsResetNow(); });
  });
  function fontsResetNow() {
    store("yue2.fonts", null);
    store("yue2.fontSizes", null);                      // HERESY 1437
    store("yue2.look", null);
    applyFonts();
    applyLook();
    paintFonts();
    paintLook();
    toast("The look options and fonts are back to the app's own (the theme stays)");
  }
  $("fontsAll").classList.toggle("is-hidden", typeof window.queryLocalFonts !== "function");
  $("fontsAll").addEventListener("click", function () {
    window.queryLocalFonts().then(function (fonts) {
      var seen = {};
      systemFonts = [];
      fonts.forEach(function (font) {
        if (!seen[font.family] && APP_FONTS.indexOf(font.family) < 0) { seen[font.family] = true; systemFonts.push(font.family); }
      });
      paintFonts();
      toast(systemFonts.length + " fonts listed");
    }).catch(function (error) { toast("The browser did not list the fonts: " + error.message, "bad"); });
  });
  paintFonts();
  paintLook();
  applyFonts();   // HERESY 1493: at load too (since 1437 the sizes and the buttons' dress came only with a change in the Fonts card; a reload lost them)
  (window.requestIdleCallback || function (fn) { return setTimeout(fn, 200); })(function () {
    systemFonts = COMMON_FONTS.filter(function (f) { return APP_FONTS.indexOf(f) < 0 && hasFont(f); });   // HERESY 1274: the app's own once
    paintFonts();
  });

  STATE.favOnly = recall("yue2.favOnly") === "1";

  // The polls start once, and wait while the tab is hidden (a visible tab catches up at once).
  var pollsStarted = false;
  function startPolls() {
    if (pollsStarted) return;
    pollsStarted = true;
    // HERESY 1363 (TODO.md: «Fewer requests from the page while a song renders (the browser's six connections a host)»): while a song
    // renders, the server's props wait (they do not change then) and the memory readout comes every 15 s, not 5: the log stream, the
    // audio and the run's own poll keep their connections
    var hwTick = 0;
    setInterval(function () { if (!document.hidden && !STATE.running) pollProps(); }, 10000);
    // Keep the memory readout honest while runs come and go.
    setInterval(function () { if (document.hidden || (STATE.running && ++hwTick % 3)) return; refreshHardware(); }, 5000);
  }

  /* ------------------------------------------------ HERESY 1002: draft */
  // Слово Виктора 30.09.2026: «С F5 браузер не помнит поля и настройки в
  // интерфейсе». Страница помнила обвязку (VAE, формат, тему, колонки), но не
  // саму песню: название, стиль, лирику, сиды, ручки, LoRA — всё пропадало.
  //
  // Снимок собирается ЗЕРКАЛОМ loadRequestIntoForm, и раскладывает его она же:
  // вся логика раскладки (кости сидов, режим, фильтр слайдеров по каталогу)
  // остаётся одна — та, что уже работает для Reuse и для открытия промпта.
  // buildRequest для снимка не годится: он бросает ошибку на пустом стиле, а
  // черновик должен сохраняться и недописанным.
  //
  // ⛔ ДВЕ ЛОВУШКИ, ОБЕ ЗАКРЫТЫ:
  //   · раскладка ПОСЛЕ /props — слайдеры фильтруются по каталогу с сервера,
  //     разложи раньше, и они молча пропадут;
  //   · сохранение только ПОСЛЕ раскладки — иначе на старте пустая форма
  //     затёрла бы сохранённое раньше, чем его успели прочесть.
  //
  // Коды звука (semantic_tokens после Reuse) в черновик не идут: это тысячи
  // чисел, и после F5 их честнее взять из дубля заново.
  var DRAFT_KEY = "yue2.draft", draftTimer = null;
  function draftSnapshot() {
    var req = {
      title: fullTitle(), style: $("style").value, lyrics: $("lyrics").value, abc: $("abc").value,   // HERESY 1614: with its version
      lm_seed: $("lmSeed").value.trim(), seed: $("soundSeed").value.trim(), cot: currentCot(),
      cfg_scale: $("cfg").dataset.touched && $("cfg").value.trim() !== "" ? parseFloat($("cfg").value) : -1,
      cfg_lyrics: $("cfgLyrics").value.trim() !== "" ? parseFloat($("cfgLyrics").value) : -1,   // HERESY 1397
      free_tempo: freeTempoOn(),                                                                     // HERESY 1416
      harmony: harmonyBody(),                                                                        // HERESY 1607
      abc_continue: !!($("abcOpening") && $("abcOpening").checked),                                  // HERESY 1609
      steps: parseInt($("odeSteps").value, 10), duration: parseFloat($("maxLength").value),
      solver: $("odeSolver").value, nar_ladder: $("narDecode").value === "ladder",                   // HERESY 1768
      synth_batch_size: parseInt($("variations").value, 10), lm_batch_size: parseInt($("versions").value, 10),
      output_format: $("outFormat").value, mp3_bitrate: parseInt($("mp3Bitrate").value, 10),
      peak_clip: parseInt($("peakClip").value, 10),
      vae: selectedVae(), sliders: STATE.sliderChoice || [], loras: YueLoras.kept ? YueLoras.kept() : YueLoras.value(),   // HERESY 1167: the muted kept
      lora_groups: YueLoras.groups ? YueLoras.groups() : []   // HERESY 1447
    };
    ["abc", "semantic"].forEach(function (group) {
      var preset = {};
      all('input[data-group="' + group + '"]').forEach(function (input) {
        var v = parseFloat(input.value);
        if (isFinite(v)) preset[input.dataset.key] = v;
      });
      req[group + "_sampling"] = preset;
    });
    return req;
  }
  function saveDraft() {
    if (!STATE.draftReady) return;
    try { store(DRAFT_KEY, JSON.stringify(draftSnapshot())); } catch (error) { /* a half-built page: next input saves */ }
  }
  function queueDraft() { clearTimeout(draftTimer); draftTimer = setTimeout(saveDraft, 400); }
  function restoreDraft() {
    if (STATE.draftReady) return;
    var raw = recall(DRAFT_KEY), req = null;
    try { req = raw ? JSON.parse(raw) : null; } catch (error) { req = null; }
    if (req && typeof req === "object" && !Array.isArray(req)) {
      [["abc", 32], ["semantic", 200]].forEach(function (old) {      // HERESY 1088: the floors before the fuses
        var preset = req[old[0] + "_sampling"];
        if (preset && preset.min_tokens === old[1]) preset.min_tokens = samplingDefault(old[0], "min_tokens");
      });
      try { loadRequestIntoForm(req, { draft: true }); } catch (error) { console.warn("draft not restored:", error); }   // HERESY 1613: a draft
    }
    STATE.draftReady = true;
    // HERESY 1710: the form as it stood at the old default (Midpoint at the engine's 32) moved once to AB2 at 48
    if (!recall("yue2.ab2Default")) {
      var was = parseInt($("odeSteps").value, 10);
      if ($("odeSolver").value === "midpoint" && (!isFinite(was) || was === engineSteps())) {
        $("odeSolver").value = "multistep"; $("odeSteps").value = String(PAGE_STEPS); syncStepsRange();
        $("odeSolver").dispatchEvent(new Event("change", { bubbles: true }));
      }
      store("yue2.ab2Default", "1");
    }
  }
  // input и change — поля и ползунки; click — кости сидов, New song, Reuse:
  // они меняют форму без события ввода. Всплытие ловим на document.
  ["input", "change", "click"].forEach(function (type) { document.addEventListener(type, queueDraft, true); });
  window.addEventListener("beforeunload", saveDraft);

  /* ------------------------------------------ HERESY 1006: form comfort */
  // A knob off its default is marked. The default is the value attribute: the page
  // already writes each knob's default there as its step base, so no second table
  // is kept. Only numbers, ranges and the solver: text and seeds have no default.
  var MARKED = 'input[type="number"], input[type="range"], select#odeSolver, select#narDecode';   // HERESY 1768: the decode too
  function isChanged(el) {
    if (el.tagName === "SELECT") {
      var base = 0;
      for (var i = 0; i < el.options.length; i++) if (el.options[i].defaultSelected) { base = i; break; }
      return el.selectedIndex !== base;
    }
    var now = el.value.trim(), def = el.defaultValue.trim();
    if (!now || !def) return false;           // empty means "the default" to the server
    return parseFloat(now) !== parseFloat(def);
  }
  function markChanged() {
    Array.prototype.forEach.call($("composeForm").querySelectorAll(MARKED), function (el) {
      el.classList.toggle("is-changed", isChanged(el));
    });
  }

  // Style and lyrics grow with their text up to data-max-rows lines, then scroll.
  function fitText(area) {
    if (!area.offsetParent) return;           // folded or hidden: measured when shown
    if (area.dataset.manual) { area.style.overflowY = "auto"; return; }   // HERESY 1168: drawn by hand, its height stays
    var cs = getComputedStyle(area), line = parseFloat(cs.lineHeight) || 20;
    var pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    var edge = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    var outer = cs.boxSizing === "border-box" ? pad + edge : 0;
    var inner = cs.boxSizing === "border-box" ? edge : -pad;
    var min = area.rows * line + outer, max = (parseInt(area.dataset.maxRows, 10) || 8) * line + outer;
    // HERESY 1026: at the cap with more text than fits, nothing to measure: collapsing the box to
    // "auto" on every key made the text jump and hid half of the last line while typing.
    if (area.scrollHeight + inner > max && Math.abs(area.offsetHeight - (cs.boxSizing === "border-box" ? max : max + pad + edge)) < 1) {
      area.style.overflowY = "auto";
      return;
    }
    var keep = [], node = area;                // the box and every scrolling parent keep their place
    while (node && node !== document.documentElement) { keep.push([node, node.scrollTop]); node = node.parentElement; }
    var page = window.scrollY;
    area.style.height = "auto";
    var want = area.scrollHeight + inner;
    area.style.height = Math.min(max, Math.max(min, want)) + "px";
    area.style.overflowY = want > max ? "auto" : "hidden";
    keep.forEach(function (k) { if (k[0].scrollTop !== k[1]) k[0].scrollTop = k[1]; });
    if (window.scrollY !== page) window.scrollTo(window.scrollX, page);
  }

  // Blocks with data-fold fold on a click on their heading, as the song boxes do in
  // SUNO. The state is a per-browser convenience; folded text shows its first words.
  var FOLD_KEY = "yue2.fold";
  var folds = {};
  try { folds = JSON.parse(recall(FOLD_KEY) || "{}") || {}; } catch (error) { folds = {}; }
  // HERESY 1166: a peek is [the words that translate, what the user wrote], drawn by setPeek
  function peekOf(block) {
    var area = block.querySelector("textarea");
    if (!area) return ["", ""];
    var text = area.value.trim();
    if (!text) return ["empty", ""];
    var first = text.split("\n")[0].replace(/\s+/g, " ");
    if (first.length > 72) first = first.slice(0, 72) + "…";
    return block.dataset.fold === "lyrics" ? [text.split("\n").length + " lines", first] : ["", first];
  }
  function setPeek(el, p) {
    el.textContent = "";
    if (p[0]) el.appendChild(document.createTextNode(p[0]));
    if (p[0] && p[1]) el.appendChild(document.createTextNode(" \u00b7 "));
    if (p[1]) { var own = document.createElement("span"); own.setAttribute("translate", "no"); own.textContent = p[1]; el.appendChild(own); }
  }
  function paintFold(block) {
    var on = !!folds[block.dataset.fold], label = block.querySelector(":scope > .label");
    block.classList.toggle("is-folded", on);
    label.setAttribute("aria-expanded", on ? "false" : "true");
    if (on) setPeek(label.querySelector(".fold-peek"), peekOf(block));
  }
  all("[data-fold]").forEach(function (block) {
    var label = block.querySelector(":scope > .label");
    if (!label) return;
    var chev = document.createElement("span");
    chev.className = "chev fold-chev";
    chev.setAttribute("aria-hidden", "true");
    label.insertBefore(chev, label.firstChild);
    var peek = document.createElement("em");
    peek.className = "fold-peek";
    label.appendChild(peek);
    label.setAttribute("role", "button");
    label.tabIndex = 0;
    function flip(event) {
      if (event.target.closest(".info, .kind-badge")) return;   // their own tips stay theirs
      event.preventDefault();                                   // a label would focus its field
      folds[block.dataset.fold] = !folds[block.dataset.fold];
      store(FOLD_KEY, JSON.stringify(folds));
      paintFold(block);
      queueComfort();
    }
    label.addEventListener("click", flip);
    label.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === " ") flip(event);
    });
    paintFold(block);
  });

  var comfortQueued = false;
  function refreshComfort() {
    comfortQueued = false;
    markChanged();
    all("textarea[data-max-rows]").forEach(fitText);
    all("[data-fold].is-folded").forEach(paintFold);
  }
  // After every handler of the same event has run: Reuse, Reset and the shape
  // sliders change the form without an input event of their own.
  function queueComfort() {
    if (comfortQueued) return;
    comfortQueued = true;
    setTimeout(refreshComfort, 0);   // not rAF: a background tab never runs it
  }
  ["input", "change", "click"].forEach(function (type) { document.addEventListener(type, queueComfort, true); });
  window.addEventListener("resize", queueComfort);

  function boot() {
    api("/props").then(function (props) {
      STATE.online = true;
      applyProps(props);
      restoreDraft();     // HERESY 1002: after the catalogs, before any save
      queueComfort();     // HERESY 1006: marks and heights for what the draft brought back
      restoreJobs();
      connectLogs();
      startPolls();
      // HERESY 1304: a new studio's first start reads the machine and offers what suits it, once (never a test browser by itself)
      Promise.all([refreshSettings(), refreshHardware()]).then(function () {
        if (navigator.webdriver || /[?&]scope=/.test(location.search)) { refreshAccess(); return; }
        // HERESY 1429: who may open it is asked first (a studio whose user never decided), then the machine's scan, never at once
        setTimeout(function () { accessFirst().then(function () { if (!recall(MACHINE_KEY)) machineScan(false); }); }, 1500);
      });
      if (chatBase()) refreshChat().catch(function () {});
      else paintChat({ configured: false, available: false, models: [], loaded: null, use: null });
      // a library that cannot be read is its own problem, not a server that is down
      refreshLibrary().catch(function (error) { toastOnce("library", "Could not read the song library: " + error.message, "bad"); });
    }).catch(function (error) {
      STATE.online = false;
      paintEngine();
      paintSubmitNote();
      toastOnce("offline", "Could not reach the server: " + error.message, "bad");
      setTimeout(boot, 5000);
    });
  }

  /* ---------------------------------------------- HERESY 1032: saved styles and profiles */
  // A profile is every knob but the texts and seeds, written out in full (defaults too), so it
  // means the same on a server whose defaults moved. Applying one keeps the texts, seeds and codes.
  var SETUP_KEYS = ["cot", "duration", "cfg_scale", "cfg_lyrics", "steps", "solver", "nar_ladder", "vae", "sliders", "loras", "output_format",
                    "mp3_bitrate", "peak_clip", "synth_batch_size", "lm_batch_size"];   // HERESY 1768: nar_ladder
  function captureSetup() {
    var b = buildRequest(false, false, true), out = {};
    SETUP_KEYS.forEach(function (k) { if (b[k] !== undefined) out[k] = b[k]; });
    ["abc", "semantic"].forEach(function (g) {
      var full = {};
      all('input[data-group="' + g + '"]').forEach(function (input) {
        var v = parseFloat(input.value);
        full[input.dataset.key] = isFinite(v) ? (/_(k|window|tokens)$/.test(input.dataset.key) ? Math.round(v) : v) : samplingDefault(g, input.dataset.key);
      });
      out[g + "_sampling"] = full;
    });
    if (out.cfg_scale === undefined) out.cfg_scale = defaultCfg(out.cot);
    if (out.duration === undefined) out.duration = outDefault("duration");
    if (out.steps === undefined) out.steps = engineSteps();   // HERESY 1710: a request without steps runs at the engine's
    if (out.solver === undefined) out.solver = "midpoint";
    if (out.nar_ladder === undefined) out.nar_ladder = false;   // HERESY 1768: written in full, the whole-song decode said too
    if (out.synth_batch_size === undefined) out.synth_batch_size = 1;
    if (out.peak_clip === undefined) out.peak_clip = outDefault("peak_clip");
    out.sliders = out.sliders || [];
    out.loras = out.loras || [];
    return out;
  }
  function applySetup(setup) {
    var cur = buildRequest(false, false, true), req = Object.assign({}, cur, setup);
    if (STATE.codes) req.semantic_tokens = STATE.codes.tokens;
    loadRequestIntoForm(req, { title: fullTitle(), fromTake: STATE.codes ? STATE.codes.from : null,
                               codesTitle: STATE.codes ? STATE.codes.title : undefined });
    if (typeof markChanged === "function") markChanged();
  }
  if (window.HeresyPresets) window.HeresyPresets.init({
    toast: toast, capture: captureSetup, apply: applySetup,
    style: function () { return $("style").value; },
    setStyle: function (text) { $("style").value = text; $("style").dispatchEvent(new Event("input", { bubbles: true })); }
  });

  /* ---------------------------------------------- HERESY 1042: like, dislike, favourite in the player */
  function paintRate() {
    var take = STATE.playerTake ? findTake(STATE.playerTake.name) || STATE.playerTake : null, HC = window.HeresyCollection;
    var held = STATE.take && HC && $("likeTake") ? HC.rating(STATE.take.name) : 0;     // HERESY 1169: the take's head follows too
    if ($("likeTake")) { $("likeTake").setAttribute("aria-pressed", held > 0 ? "true" : "false"); $("dislikeTake").setAttribute("aria-pressed", held < 0 ? "true" : "false"); }
    if (STATE.take && $("protTake") && HC && HC.isProtected) {   // HERESY 1368: the take's shield and its Delete follow
      var guarded = HC.isProtected(STATE.take.name), dl = $("deleteTake");
      $("protTake").setAttribute("aria-pressed", guarded ? "true" : "false");
      $("protTake").setAttribute("aria-label", guarded ? "Take its protection off" : "Protect it");
      $("protTake").dataset.tip = HC.protTip(guarded);
      if (dl) {
        dl.classList.toggle("is-off", guarded);
        dl.setAttribute("aria-disabled", guarded ? "true" : "false");
        dl.dataset.tip = guarded ? "This take is protected: take its protection off first" : "Delete this take (asks first)";
      }
    }
    $("pbRate").hidden = !take || take.session;
    if (!take) return;
    var r = HC ? HC.rating(take.name) : 0;
    $("pbLike").setAttribute("aria-pressed", r > 0 ? "true" : "false");
    ["pbFire", "pbGem"].forEach(function (id) {        // HERESY 1802: 🔥 💎 of the take in the player
      var b = $(id);
      if (!b || !HC || !HC.markOf) return;
      b.dataset.name = take.name;
      b.setAttribute("aria-pressed", HC.markOf(take.name, b.dataset.hmark) ? "true" : "false");
    });
    $("pbDislike").setAttribute("aria-pressed", r < 0 ? "true" : "false");
    $("pbFav").setAttribute("aria-pressed", take.favorite ? "true" : "false");
  }
  function rateNow(value) {
    var take = STATE.playerTake, HC = window.HeresyCollection;
    if (!take || !HC) return;
    var next = HC.rating(take.name) === value ? 0 : value;   // a second click takes it back
    var sent = HC.rate(take.name, next);
    paintRate();                                            // HERESY 1107: at once; the lab confirms
    sent.then(paintRate).catch(function (e) { paintRate(); toast(e.message, "bad"); });
  }
  $("pbLike").addEventListener("click", function () { rateNow(1); });
  $("pbDislike").addEventListener("click", function () { rateNow(-1); });
  $("pbFav").addEventListener("click", function () {
    var take = STATE.playerTake ? findTake(STATE.playerTake.name) : null;
    if (take) toggleFavorite(take).then(paintRate);
  });

  /* ---------------------------------------------- HERESY 1043: text profiles */
  if (window.HeresyTextPrep) window.HeresyTextPrep.init({
    toast: toast, lyrics: function () { return $("lyrics"); },
    setLyrics: function (text) { $("lyrics").value = text; $("lyrics").dispatchEvent(new Event("input", { bubbles: true })); growLyrics(); }
  });

  /* ---------------------------------------------- HERESY 1047: the Writer's notebook */
  function setupFromRequest(req) {          // a take's request as PARAMS: the knobs, not the texts or seeds
    var out = {};
    SETUP_KEYS.concat(["abc_sampling", "semantic_sampling"]).forEach(function (k) { if (req && req[k] !== undefined) out[k] = req[k]; });
    return out;
  }
  if (window.HeresyWriter) window.HeresyWriter.init({
    toast: toast, ago: ago, clock: clock, findTake: findTake, playNow: playNow, title: displayTitle,
    openTake: function (name, where) { openTake(name); setTab(where === "post" ? "post" : "create"); },
    form: function () { return { title: fullTitle(), style: $("style").value, lyrics: $("lyrics").value, params: captureSetup() }; },   // HERESY 1614
    load: function (doc) {
      setTitle(doc.title === "Untitled" ? "" : doc.title || ""); $("title").dispatchEvent(new Event("input", { bubbles: true }));   // HERESY 1614
      setField("style", doc.style || "");
      setField("lyrics", doc.lyrics || "");
      growLyrics();
      if (doc.params && Object.keys(doc.params).length) applySetup(doc.params);
      setTab("create");
    },
    showWriter: function () { if (document.body.dataset.tab !== "write") setTab("write"); }
  });
  // HERESY 1519: the Creator's versions (heresy-versions.js): the title a Generate would go with, the form's words, a version back into them
  if (window.HeresyRoll) {                             // HERESY 1578: the score in the box as a piano roll, and back into it
    window.HeresyRoll.init({ toast: toast, get: function () { return $("abc").value; }, lyrics: function () { return $("lyrics").value; },   // 1584: its syllables
                             set: function (abc) { keepForm("before"); $("abc").value = abc; $("abc").dispatchEvent(new Event("input", { bubbles: true })); keepForm("roll"); } });   // 1596: kept before and after
    $("rollOpen").addEventListener("click", function () { window.HeresyRoll.open(); });
  }
  if (window.HeresyVersions) window.HeresyVersions.init({
    toast: toast, findTake: findTake, title: songTitle,
    openTake: function (name) { openTake(name); setTab("create"); },
    form: function () { var p = splitTitle(fullTitle()); return { title: p.name.trim(), version: p.version, style: $("style").value, lyrics: $("lyrics").value, abc: $("abc").value }; },   // HERESY 1614
    load: function (v) {
      keepForm("before");                              // HERESY 1596: a version into the form: the form as it was kept first
      setTitleParts(v.title === "Untitled" ? "" : v.title || "", v.version || ""); $("title").dispatchEvent(new Event("input", { bubbles: true }));   // HERESY 1614: its branch too
      setField("style", v.style || "");
      setField("lyrics", v.lyrics || "");
      growLyrics();
      setField("abc", v.abc || "");
      var m = v.abc && v.mode && document.querySelector('input[name="cot"][value="' + String(v.mode).replace(/[^a-z]/g, "") + '"]');
      if (m && !m.checked) { m.checked = true; m.dispatchEvent(new Event("change", { bubbles: true })); }   // a score is sung in the mode it was
      setTab("create");
    }
  });

  if (window.HeresyTrain) window.HeresyTrain.init({ toast: toast });   // HERESY 1063
  if (window.HeresyGpus) window.HeresyGpus.init({ toast: toast,     // HERESY 1091
    // HERESY 1294: a card's VRAM limit saved: Auto's knobs follow the studio card's at once; rc4's «auto:N» becomes its limit, once
    limits: function () {
      paintPresetSizes();
      // HERESY 1425 (Viktor 13.10.2026: «Всё можно и нужно двигать ползунками в multi-GPU блоке»): the preset is hidden, so a limit
      // saved is the word: the knobs follow the studio card's limit, the ones moved by hand before included
      if (!/^auto/.test(recall(PRESET_KEY) || "")) store(PRESET_KEY, "auto");
      if (!STATE.settings || STATE.settingsDirty) return;
      var gib = gpuGib(), a = autoKnobs(gib);
      if (!a) return;
      if (a.max_seq === STATE.settings.max_seq && a.vae_core === STATE.settings.vae_core) { $("memPreset").value = "auto"; return paintComputeHint(); }
      post("/settings", { max_seq: a.max_seq, vae_core: a.vae_core }).then(function (data) {
        paintSettings(data, true);
        toast("Auto for " + gib.toFixed(1) + " GB: " + (a.max_seq ? "context " + a.max_seq.toLocaleString(loc()) : "whole context") + ", VAE tiles " + a.vae_core, "good");
      }).catch(function (e) { toast(e.message, "bad"); });
    },
    legacy: function () { var m = /^auto:(\d+(?:\.\d+)?)$/.exec(recall(PRESET_KEY) || ""); return m ? parseFloat(m[1]) : 0; },
    migrated: function () { store(PRESET_KEY, "auto"); }
  });
  // HERESY 1102: the DAW button opens the way out of the studio (heresy-daw.js); openDAW is gone
  // HERESY 1104: a take as a REAPER project: the page writes the score's MIDI (the lab has no ABC reader), the lab packs
  // the rest; the engine hands the ZIP over
  // the score as a MIDI file in base64, for the DAW projects (REAPER, DAWproject); "" when the take has none
  function scoreMidi(req) {
    try {
      if (req.abc && window.HeresyAbc) {
        var bytes = window.HeresyAbc.toMidi(window.HeresyAbc.parse(req.abc)), bin = "";
        for (var i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode.apply(null, Array.prototype.slice.call(bytes, i, i + 8192));
        return btoa(bin);
      }
    } catch (e) { toast("The score could not be read as MIDI (" + e.message + "): the project goes without it", "bad"); }
    return "";
  }
  // HERESY 1134: the DAWproject with the score as notes and the sections as markers (Waveform 14, Bitwig, Studio One, Cubase)
  function dawProject(take) {
    if (!take || take.session) return Promise.reject(new Error("open a take of the library first"));
    toast("Packing the DAWproject: the mix and every stem as 24-bit WAV, the score as notes, the sections as markers");
    return getRequest(take).then(function (req) {
      return post("/lab/dawproject", { name: take.name, midi: scoreMidi(req) });
    }).then(function (d) {
      toast("DAWproject: " + d.tracks.join(", ") + " · " + d.bpm + " bpm, " + d.meter + " · " + (d.bytes / 1048576).toFixed(0) + " MB" + (d.said && d.said[1] ? " · " + d.said[1] : ""));
      var a = document.createElement("a");
      a.href = "/library/file?name=" + encodeURIComponent(take.name) + "&path=" + encodeURIComponent(d.path); a.download = fileTitle(take) + ".dawproject";
      document.body.appendChild(a); a.click(); a.remove();
      return d;
    });
  }
  function reaperProject(take) {
    if (!take || take.session) return Promise.reject(new Error("open a take of the library first"));
    toast("Packing the REAPER project: the mix, every stem, the score, the lyrics");
    return getRequest(take).then(function (req) {
      return post("/lab/daw/reaper", { name: take.name, midi: scoreMidi(req) });
    }).then(function (d) {
      toast("REAPER: " + d.tracks.join(", ") + " · " + d.bpm + " bpm, " + d.meter + " · " + (d.bytes / 1048576).toFixed(0) + " MB" + (d.said.length > 2 ? " · " + d.said[2] : ""));
      var a = document.createElement("a");                // its own download: the take menu's helper lives in the menu
      a.href = "/library/file?name=" + encodeURIComponent(take.name) + "&path=" + encodeURIComponent(d.path); a.download = fileTitle(take) + ".reaper.zip";
      document.body.appendChild(a); a.click(); a.remove();
      return d;
    });
  }
  // HERESY 1123: the DAW window's take: the one open in the Creator, else the one in the player, else the one card
  // checked in the Librarian (Viktor tried it with a take playing, and the window said "open a take first")
  function dawTake() {
    if (STATE.take && !STATE.take.session) return STATE.take;
    if (STATE.playerTake && !STATE.playerTake.session) return STATE.playerTake;
    var HC = window.HeresyCollection, sel = HC && HC.selected ? HC.selected() : [];
    return sel.length === 1 ? findTake(sel[0]) : null;
  }
  if (window.HeresyDaw) window.HeresyDaw.init({ title: function () { var t = dawTake(); return t ? displayTitle(t) : ""; },
    links: function () {
      var t = dawTake();
      if (!t) return [];
      return [{ label: formatExt(t.format).toUpperCase(), href: downloadUrl(t), file: audioFileName(t) },
        convertible(t) ? { label: "FLAC", href: c2paUrl("/library/flac?name=" + encodeURIComponent(t.name) + namesParam(), "flac", t), file: fileTitle(t) + ".flac" } : null,
        convertible(t) ? { label: "MP3", href: mp3Url(t), file: fileTitle(t) + ".mp3" } : null].filter(Boolean);
    },
    reaper: function () { var t = dawTake(); return t ? reaperProject(t) : Promise.reject(new Error("no take in hand")); },
    dawproject: function () { var t = dawTake(); return t ? dawProject(t).catch(function (e) { toast("No DAWproject: " + e.message, "bad"); throw e; }) : Promise.reject(new Error("no take in hand")); } });
  // HERESY 1169: new releases on GitHub (Engine → Updates) and the 💎 sets offered on a new studio and after an update
  if (window.HeresyPlaces) window.HeresyPlaces.init({ toast: toast });   // HERESY 1283: Engine → Folders
  // HERESY 1289: Engine → Models and LoRAs; after a fetch the engine's lists are asked again (LoRAs it reads each time)
  if (window.HeresyWeights) window.HeresyWeights.init({ toast: toast, props: pollProps });
  if (window.HeresyUpdates) window.HeresyUpdates.init({ toast: toast,
    hub: function () { if (window.HeresyCollection && window.HeresyCollection.hubOpen) window.HeresyCollection.hubOpen(); },
    idle: function () { return !STATE.jobs.some(function (j) { return isLive(j); }); } });
  // HERESY 1169 (Viktor: «…продублировать в правильных местах в самом Огранщике»): the Refiner's ways out, to the same window
  all("#postDaw, [data-daw-open]").forEach(function (b) { b.addEventListener("click", function () { if (window.HeresyDaw) window.HeresyDaw.open(); }); });
  if (window.HeresyInstruments) window.HeresyInstruments.init({        // HERESY 1069: the ♪ cheat-sheet
    toast: toast, findTake: findTake, playNow: function (t) { STATE.playZone = "collection"; playNow(t); }
  });

  // HERESY 1160: the lab makes them again (its own queue in the engine) and swaps each new take in when it lands, even
  // with this page closed; the activity log says each swap
  // HERESY 1169 · 1235: more than one take made again asks first (each a whole song: minutes on a GPU)
  function regenAsk(list) {
    if (list.length < 2) return regenTakes(list);
    var secs = list.reduce(function (s, n) { var t = findTake(n); return s + ((t && t.seconds) || 0); }, 0);
    return window.HeresyDialog.confirm("Human, " + list.length + " whole songs made again in one volley? Won't your graphics card waste away?\n\nEach is made again from its own request with new seeds, the score and the music anew: minutes on a GPU each, " + clock(secs) + " of music in all. They queue one after another; the old ones are kept in “Sourced for Regeneration”.",
      { ok: "Regenerate " + list.length, cancel: "Not now" }).then(function (ok) { if (ok) return regenTakes(list).then(function () { return true; }); });
  }
  function regenTakes(list) {
    var n = list.length, first = findTake(list[0]), what = n > 1 ? n + " takes" : "\u201c" + (first ? displayTitle(first) : list[0]) + "\u201d";
    return post("/lab/regen", { names: list }).then(function (d) {
      var bad = (d && d.regen || []).filter(function (r) { return r.error; });
      toast("Regenerating " + what + " with new seeds: the new " + (n > 1 ? "ones take" : "one takes") + " the old one's places, the old kept in \u201c" +
        ((d && d.workspace) || "Sourced for Regeneration") + "\u201d" + (bad.length ? " · not " + bad.length + ": " + bad[0].error : ""), bad.length ? "bad" : "");
      setTimeout(pollJobs, 400);
    }).catch(function (e) { toast("Not regenerated: " + e.message, "bad"); });
  }

  // HERESY 1707 (Viktor 22.10.2026: «Предлагаю при таком переходе с карточки трека в комнату Творца попапить диалог со всеми опциями… И обязательно
  // сохранение текущего перед перезаписью фрейма»): what goes into the form from a take opened in the Creator from another room; the form as it was is
  // kept as a version first (keepForm, deduplicated), the last answer marked
  function openInCreator(name) {
    var take = findTake(name);
    if (!take) return;
    var last = recall("yue2.openInCreator") || "show";
    var items = [
      { value: "show", label: "Just show it on the right", note: "the form keeps what it has" },
      { value: "reuse", label: "Reuse", note: "its style, lyrics and settings; new music" },
      take.session ? null : { value: "retake", label: "Retake", note: "all of it: score, seeds and music codes; the same music" },
      take.has_score && !take.session ? { value: "score", label: "Edit and re-render", note: "its score, style and lyrics; the score open to edit" } : null,
      { value: "style", label: "Only its style", note: "into the style box; the rest of the form stays" },
      { value: "lyrics", label: "Only its lyrics", note: "into the lyrics box; the rest of the form stays" }
    ].filter(Boolean).map(function (it) { it.words = true; it.current = it.value === last; return it; });
    return window.HeresyDialog.choose("Open in the Creator\n\nWhat goes into the form from “" + displayTitle(take) + "”? What the form holds now is kept in its versions first.",
      items, { cancel: "Cancel" }).then(function (v) {
      if (!v) return null;
      store("yue2.openInCreator", v);
      if (v === "reuse") { cardItem(name, "#reuseTake", "Reuse", "create").action(); return v; }
      if (v === "retake") { cardItem(name, "#retakeTake", "Retake", "create").action(); return v; }
      if (v === "score") { keepForm("before"); cardItem(name, "#reuseScore", "Edit and re-render", "create").action(); return v; }
      openTake(name);
      setTab("create");
      if (v === "style" || v === "lyrics") {
        keepForm("before");
        var box = $(v);
        box.value = String((v === "style" ? take.style : take.lyrics) || "");
        box.dispatchEvent(new Event("input", { bubbles: true }));
        if (v === "lyrics") growLyrics();
        queueComfort();
        show("compose");
        toast(v === "style" ? "Its style is in the form; the rest stayed" : "Its lyrics are in the form; the rest stayed", "good");
      }
      return v;
    });
  }
  window.ruachOpenInCreator = openInCreator;   // for the checks

  /* ---------------------------------------------- HERESY 1048: the right-click menu on a take */
  function takeMenu(name, x, y) {
    var take = findTake(name), HC = window.HeresyCollection, HW = window.HeresyWriter;
    var menuAt = STATE.menuSection && STATE.menuSection.name === name ? STATE.menuSection : null;   // HERESY 1414
    STATE.menuSection = null;
    var menuWhy = !menuAt && STATE.menuWhy && STATE.menuWhy.name === name ? STATE.menuWhy.why : "";   // HERESY 1734
    STATE.menuWhy = null;
    var menuWin = STATE.menuWave && STATE.menuWave.name === name ? STATE.menuWave : null;   // HERESY 1757
    STATE.menuWave = null;
    var fromCard = !!STATE.menuFromCard;                   // HERESY 1488: opened by the card's «⋯»
    STATE.menuFromCard = false;
    if (!take || !window.HeresyMenu) return;
    var row = HC && HC.row ? HC.row(name) : null, r = HC ? HC.rating(name) : 0;
    var now = STATE.playerTake && STATE.playerTake.name === name && isPlaying();
    // HERESY 1166 (Viktor: «Замораживаются все треки в этом представлении, никаких действий по ним»): a take frozen with its
    // workspace is heard and read, nothing else
    if (HC && HC.isFrozen && HC.isFrozen(name)) {
      return window.HeresyMenu.open(x, y, [
        { icon: now ? "\u275a\u275a" : "\u25b6", label: now ? "Pause" : "Play", action: function () {
          if (now) return togglePlay();
          STATE.playZone = document.body.dataset.tab === "collection" ? "collection" : "list";
          playNow(take);
        } },
        HC.datasheet ? { icon: "\u2630", label: "Open the datasheet", hint: "all it was made with", action: function () { HC.datasheet(name); } } : null,
        { sep: true },
        { icon: "\u2744", label: "Frozen with its workspace", hint: "unfreeze it to act on the take", disabled: true }
      ].filter(Boolean));
    }
    var ws = HC && HC.workspaces ? HC.workspaces() : [], inWs = row ? row.workspaces : [], hand = recall("yue2.writerDoc");
    var here = document.body.dataset.tab || "create";
    var changed = function () { paintLibrary(); paintRate(); };
    var go = function (where) { return function () { openTake(name); setTab(where); }; };
    var copy = function (what, get) {
      return function () {
        Promise.resolve(get()).then(function (text) { return navigator.clipboard.writeText(String(text || "")); })
          .then(function () { toast(what + " copied"); }).catch(function (e) { toast("Not copied: " + e.message, "bad"); });
      };
    };
    var save = function (url, file) {
      return function () { var a = document.createElement("a"); a.href = url; a.download = file; document.body.appendChild(a); a.click(); a.remove(); };
    };
    // HERESY 1169 · 1235 (Viktor 08.10.2026: «всё, что может быть применено массово, оформи на tracks selection… И то, что реально сможет убить ресурсы GPU и время, всё в попап диалоги»): on a checked card in the Librarian with others checked, the marks, the artwork, the workspaces, hiding and a ZIP act on every checked take; what costs a card's minutes asks first
    var bulkSel = here === "collection" && HC && HC.selected ? HC.selected() : [], bulk = bulkSel.length > 1 && bulkSel.indexOf(name) >= 0 ? bulkSel : null;
    var bulkRows = bulk ? bulk.map(function (n) { return HC.row(n); }).filter(Boolean) : [], bulkArt = bulk ? bulk.filter(function (n) { return !!artUrl(n); }) : [];
    var items = [
      bulk ? { head: bulk.length + " checked: a line with a number acts on all of them" } : null,
      { icon: now ? "❚❚" : "▶", label: now ? "Pause" : "Play", action: function () {
        if (now) return togglePlay();
        STATE.playZone = document.body.dataset.tab === "collection" ? "collection" : "list";
        playNow(take);
      } },
      // HERESY 1059 (Viktor): the other rooms only, never the one you are in
      here !== "create" ? { icon: "✎", label: "Open in the Creator", action: function () { openInCreator(name); } } : null,
      here !== "post" ? { icon: "⚗", label: "Open in the Refiner", action: go("post") } : null,
      HC && HC.reveal && here !== "collection" ? { icon: "▦", label: "Open in the Librarian", action: function () { setTab("collection"); HC.reveal(name); } } : null,
      HC && HC.openSheet && here === "collection" ? { icon: "▤", label: "Open the sheet", action: function () { HC.openSheet(name); } } : null,
      HC && HC.datasheet ? { icon: "☰", label: "Open the datasheet", hint: "all it was made with", action: function () { HC.datasheet(name); } } : null,
      // HERESY 1315: the lyrics' sections placed on the wave by Whisper's hearing (once; the lab keeps it)
      !take.session && !bulk && taggedParts(take.lyrics) >= 2 ? { icon: "\u00a7", label: sectionsTimed[name] ? "Find the sections by ear again" : "Find the sections by ear",
        hint: sectionsAsked[name] === "running" ? "being heard now" : "Whisper hears the words; about half a minute on a card", disabled: sectionsAsked[name] === "running", action: function () {
          toast("Hearing the words of " + displayTitle(take) + "\u2026");
          timeSections(name, !!sectionsTimed[name]).then(function (d) { toast("The sections found by ear (" + Math.round((d.heard || 0) * 100) + " % of the lines heard)"); },
            function (e) { toast("The sections were not found: " + e.message, "bad"); });
        } } : null,
      // HERESY 1415: its namesakes in one player, two to four of them
      bulk && bulk.length > 1 ? { icon: "\u2261", label: "Compare the selected\u2026", hint: "two to twelve of the checked", action: function () { compareTakes(bulk.slice(0, 12)); } } : null,   // HERESY 1716; 1724: twelve
      !take.session && !bulk && namesakes(take).length > 1 ? { icon: "\u2261", label: "Compare with its namesakes\u2026", hint: namesakes(take).length + " in all", action: function () { compareNamesakes(take); } } : null,
      // HERESY 1414: from the wave's own menu over a section heard by ear: its words changed, sung anew, the rest of the take kept
      menuAt && !take.session && !bulk ? { icon: "\u21bb", label: "Replace this section\u2026", hint: menuAt.section.name, action: function () { replaceSection(take, menuAt); } } : null,
      menuAt && !take.session && !bulk && lineAt(menuAt) ? { icon: "\u270e", label: "Re-sing this line\u2026", hint: (lineAt(menuAt).line || "").slice(0, 32), action: function () { resingLine(take, menuAt); } } : null,   // HERESY 1718
      menuAt && !take.session && !bulk && !lineAt(menuAt) ? { icon: "\u270e", label: "Re-sing this line\u2026", hint: "The line under the pointer was not heard clearly", muted: true } : null,   // HERESY 1734
      menuAt && !take.session && !bulk ? { icon: "\u21c9", label: "Sing it once more\u2026", hint: "a variation, seed + 1", action: function () { singOnceMore(take, menuAt); } } : null,   // HERESY 1715
      menuAt && !take.session && !bulk ? { icon: "\u266b", label: "Insert an interlude after it\u2026", hint: "music the model writes", action: function () { singOnceMore(take, menuAt, "interlude"); } } : null,   // HERESY 1717
      // HERESY 1734: over a part none of them can take (or a wave without heard sections), the four all the same, greyed, with why
      menuWhy && !take.session && !bulk ? { icon: "\u21bb", label: "Replace this section\u2026", hint: menuWhy, muted: true } : null,
      menuWhy && !take.session && !bulk ? { icon: "\u270e", label: "Re-sing this line\u2026", hint: menuWhy, muted: true } : null,
      menuWhy && !take.session && !bulk ? { icon: "\u21c9", label: "Sing it once more\u2026", hint: menuWhy, muted: true } : null,
      menuWhy && !take.session && !bulk ? { icon: "\u266b", label: "Insert an interlude after it\u2026", hint: menuWhy, muted: true } : null,
      menuWin && !take.session && !bulk ? { icon: "\u25a3", label: "Sing a window anew\u2026", hint: "its own adapters", action: function () { singWindow(take, menuWin.t); } } : null,   // HERESY 1757
      { sep: true },
      // HERESY 1727 (Viktor 22.10.2026: «Это же реально правка трека, а не перегенерация… "Сделать ещё раз" переименовать в "Перегенерить", спустить под
      // "Править", оба перенести выше блока Библиотека»): what changes this take (a new take; this one stays), then what makes it anew
      take.session || bulk ? null : { icon: "\u2702", label: "Edit", items: [
        cardItem(name, "#cropTake", "Crop…", "create"), cardItem(name, "#cutSection", "Remove a section…", "create"),
        Object.assign(cardItem(name, "#repeatSection", "Repeat a section…", "create"), { hint: "a copy, on the bar lines" }),
        Object.assign(cardItem(name, "#insertPart", "Insert a part…", "create"), { hint: "a copy of a section" }),   // HERESY 1714
        cardItem(name, "#speedTake", "Speed…", "create"), { sep: true },
        cardItem(name, "#extendTake", "Extend…", "create"), cardItem(name, "#endAt", "End at…", "create"), cardItem(name, "#fadeIn", "Fade in…", "create"),
        cardItem(name, "#trimToText", "Trim to the text", "create")
      ] },
      take.session || bulk ? null : { icon: "\u27f3", label: "Regenerate", items: [
        { icon: "\u27f3", label: "Regenerate with a new seed", hint: "replaces it; the old one kept", action: function () { regenAsk([name]); } },
        { sep: true },
        cardItem(name, "#retakeTake", "Retake", "create"), cardItem(name, "#reuseTake", "Reuse", "create"),
        cardItem(name, "#rerenderSound", "Re-render sound", "create"), cardItem(name, "#regenFrom", "Regenerate from…", "create"),
        cardItem(name, "#reuseScore", "Edit and re-render", "create")
      ] },
      take.session || bulk ? null : { sep: true },
      bulk && window.HeresyPost && window.HeresyPost.batch ? { icon: "\u26d3", label: "Refine " + bulk.length + " along the way", hint: "the Refiner's way in hand, one after another on Forge",   // HERESY 1562
        action: function () { window.HeresyPost.batch(bulk).then(function (b) { if (b) toast("Batch: " + bulk.length + " takes, one after another on Forge; the Refiner's head shows it"); }); } } : null,
      HC && bulk && HC.rateMany ? { icon: "👍", label: "Like " + bulk.length, hint: "all liked: taken back", checked: bulkRows.every(function (x) { return x.rating > 0; }), action: function () { HC.rateMany(bulk, 1).then(changed); } }
        : HC ? { icon: "👍", label: "Like", checked: r > 0, action: function () { HC.rate(name, r > 0 ? 0 : 1).then(changed); } } : null,
      HC && bulk && HC.rateMany ? { icon: "👎", label: "Dislike " + bulk.length, hint: "all disliked: taken back", checked: bulkRows.every(function (x) { return x.rating < 0; }), action: function () { HC.rateMany(bulk, -1).then(changed); } }
        : HC ? { icon: "👎", label: "Dislike", checked: r < 0, action: function () { HC.rate(name, r < 0 ? 0 : -1).then(changed); } } : null,
      HC && bulk && HC.favMany ? { icon: "☆", label: "Favourite " + bulk.length, hint: "all favourites: taken back", checked: bulk.every(function (n) { var t = findTake(n); return !!(t && t.favorite); }), action: function () { HC.favMany(bulk).then(function () { changed(); HC.reload(); }); } }
        : { icon: "☆", label: "Favourite", checked: !!take.favorite, action: function () { toggleFavorite(take).then(function () { changed(); if (HC) HC.reload(); }); } },
      // HERESY 1368 (Viktor 11.10.2026: «И на аудио треки в студии тоже защиту добавь в опцию»): never to the trash, never deleted for good
      HC && HC.protect && !take.session ? (bulk
        ? { icon: "🛡", label: "Protect " + bulk.length, hint: "all protected: the protection comes off", checked: bulkRows.length > 0 && bulkRows.every(function (x) { return x.protected; }), action: function () { HC.protectMany(bulk); } }
        : { icon: "🛡", label: HC.isProtected(name) ? "Take its protection off" : "Protect it", hint: HC.isProtected(name) ? "" : "never to the trash, never deleted", checked: HC.isProtected(name),
            action: function () { HC.protect([name], !HC.isProtected(name)); } }) : null,
      HC ? { icon: "✍", label: "Note…", action: function () {
        window.HeresyDialog.prompt("A note on “" + displayTitle(take) + "”\n\nEmpty removes it.", HC.note(name), { ok: "Keep the note", max: 600, area: true, rows: 5 })   // HERESY 1802: 600 characters
          .then(function (t) { if (t !== null) HC.setNote(name, t).then(paintNote); });
      } } : null,
      { icon: "Aa", label: "Rename…", action: function () {
        window.HeresyDialog.prompt("Rename the take\n\nUp to " + TITLE_MAX + " characters; invisible controls are taken out.", displayTitle(take), { ok: "Rename", max: TITLE_MAX })
          .then(function (t) { if (t !== null) return renameTake(name, t).then(function (ok) { if (ok && HC) HC.reload(); }); })
          .catch(function (e) { toast(e.message, "bad"); });
      } },
      // HERESY 1120: artwork, asked for. HERESY 1155 (Viktor: «Для Draw Artwork, когда есть иллюстрация, заменяй на
      // Redraw Artwork»; «Не уходим из студии в другие окна и вкладки»): seen over the page, drawn again by name
      take.session || !artUrl(name) ? null : { icon: "▣", label: "Open the artwork", action: function () { showArt(name); } },
      take.session ? null : bulk ? { icon: "▣", label: "Artwork for " + bulk.length + "…", hint: "about a minute each on a GPU; asks first", action: function () { artMany(bulk); } }
        : ARTING[name]                // HERESY 1167: one drawing a take at a time
        ? { icon: "▣", label: ARTING[name] === "wait" ? "Artwork waits for a card…" : "Drawing artwork…", disabled: true, action: function () {} }
        : artUrl(name)
        ? { icon: "↻", label: "Redraw artwork", hint: "a new picture; the old one kept beside the take", action: function () { drawArt(name, true); } }
        : { icon: "▣", label: "Draw artwork", hint: "a minute or two on a GPU", action: function () { drawArt(name, false); } },
      // HERESY 1156 (Viktor: «В меню мыши Remove current Artwork»): taken off the take, kept beside it
      take.session ? null : bulk ? (bulkArt.length ? { icon: "✕", label: "Remove artwork from " + bulkArt.length + "…", hint: "kept beside each take", action: function () { removeArtMany(bulkArt); } } : null)
        : !artUrl(name) ? null : { icon: "✕", label: "Remove current artwork", hint: "kept beside the take", action: function () { removeArt(name); } },
      take.session || bulk || !artUrl(name) || namesakes(take).length < 2 ? null   // HERESY 1425
        : { icon: "⧉", label: "Copy the cover to its namesakes…", hint: "the takes of the same name", action: function () { coverToNamesakes(take); } },
      { sep: true },
      // HERESY 1731 (Viktor 22.10.2026: «"Добавить в плейлист > Первым, Последним, Рандомно"»)
      HC && HC.playlistAdd && !take.session ? { icon: "\u2630", label: bulk ? "Add to the playlist: " + bulk.length : "Add to playlist", items: [
        { label: "First", action: function () { HC.playlistAdd(bulk || [name], "first"); } },
        { label: "Last", action: function () { HC.playlistAdd(bulk || [name], "last"); } },
        { label: "Random", hint: "anywhere in it", action: function () { HC.playlistAdd(bulk || [name], "random"); } }
      ] } : null,
      HC ? { icon: "▦", label: bulk ? "Workspaces of " + bulk.length : "Workspaces", items: ws.map(function (w) {
        var whom = bulk || [name], on = bulk ? bulkRows.length > 0 && bulkRows.every(function (x) { return (x.workspaces || []).indexOf(w) >= 0; }) : inWs.indexOf(w) >= 0;
        var said = bulk ? " " + bulk.length : "";
        return { label: w, raw: true, checked: on, action: function () {
          HC.act({ op: on ? "ws-remove" : "ws-add", workspace: w, names: whom }, on ? "Taken out of “" + w + "”" + said : "Added to “" + w + "”" + said);
          if (bulk && on && HC.unselect && HC.place && HC.place() === w) HC.unselect(bulk);   // HERESY 1169 · 1239: out of the workspace open, out of the choice
        } };
      }).concat([{ sep: true }, { icon: "+", label: "New workspace…", action: function () {
        var whom = bulk || [name];
        window.HeresyDialog.prompt(bulk ? "A new workspace for the " + bulk.length + " checked takes" : "A new workspace for “" + displayTitle(take) + "”", "", { ok: "Make it", placeholder: "its name" }).then(function (w) {
          w = (w || "").trim();
          if (w) HC.act({ op: "ws-add", workspace: w, names: whom }, "Added to “" + w + "”");
        });
      } }]) } : null,
      // HERESY 1154 (Viktor): Move above Pin
      // HERESY 1101 (Viktor): Move as well as pin; on a checked card in the Librarian, for every checked one
      HC && HC.moveTo ? (function () {
        var inLib = here === "collection", sel = inLib && HC.selected ? HC.selected() : [];
        var list = sel.length > 1 && sel.indexOf(name) >= 0 ? sel : [name], place = inLib ? HC.place() : "";
        var many = list.length > 1 ? " " + list.length : "";
        return { icon: "⇥", label: "Move" + many + " to", hint: inLib && place && place.charAt(0) !== "_" ? "out of “" + place + "”" : "out of every other", items: ws.filter(function (w) { return !(inLib && w === place); }).map(function (w) {
          return { label: w, raw: true, action: function () { HC.moveTo(w, list, inLib); } };
        }).concat([{ sep: true }, { icon: "+", label: "New workspace…", action: function () {
          window.HeresyDialog.prompt("A new workspace for " + (list.length > 1 ? "the " + list.length + " checked takes" : "“" + displayTitle(take) + "”"), "", { ok: "Move there", placeholder: "its name" }).then(function (w) {
            w = (w || "").trim();
            if (w) HC.moveTo(w, list, inLib);
          });
        } }]) };
      })() : null,
      // HERESY 1103 (Viktor): up to four takes pinned in the strip above the Librarian's grid, per workspace
      HC && HC.pin && here === "collection" && HC.place() !== "__pinned" ? (function () {
        var on = HC.pinned(name);
        return { icon: "\ud83d\udccc", label: on ? "Unpin" : "Pin here", hint: on ? "" : "four at most", action: function () { HC.pin(name, !on); } };
      })() : null,
      // HERESY 1167 (Viktor: «в Takes на мышечное меню.... `Pin in it's (sub)workspace` добавить, если лимит по пинам не
      // достигнут. У нас четыре пина на воркспейс»): from a room's column, into the strip of the workspace the take lives in
      HC && HC.pinTarget && here !== "collection" ? (function () {
        var t = HC.pinTarget(name);
        if (!t || (!t.pinned && t.count >= t.max)) return null;
        return { icon: "\ud83d\udccc", label: (t.pinned ? "Unpin from \u201c" : "Pin in \u201c") + t.place + "\u201d",
                 hint: t.pinned ? "" : (t.max - t.count) + " of " + t.max + " free", action: function () { HC.pinIn(name, t.place, !t.pinned); } };
      })() : null,
      // HERESY 1166: in the Pinned view, Unpin takes it out of every strip it stands in
      HC && HC.unpinAll && here === "collection" && HC.place() === "__pinned" && HC.pinPlaces(name).length ?
        { icon: "\ud83d\udccc", label: "Unpin", action: function () { HC.unpinAll(name); } } : null,
      HC && bulk ? (function () {
        var all = bulkRows.length > 0 && bulkRows.every(function (x) { return x.hidden; });
        return { icon: "◌", label: all ? "Show " + bulk.length + " again" : "Hide " + bulk.length + " from the lists", action: function () {
          var go = function () {
            HC.act({ op: all ? "show" : "hide", names: bulk }, all ? "Shown again: " + bulk.length : "Hidden from the lists (not deleted): " + bulk.length);
            if (HC.unselect) HC.unselect(bulk);   // HERESY 1169 · 1239: they leave this view, as the bar's own button lets them go
          };
          if (all || !HC.guard) return go();     // HERESY 1474: hiding several asked as the bar's own button asks (1473)
          HC.guard(tr("Hide " + bulk.length + " takes from the lists?") + "\n\n" + tr("Nothing is deleted: Hidden on the left shows them again."), tr("Hide them"), bulk)
            .then(function (ok) { if (ok) go(); });
        } };
      })() : HC ? { icon: "◌", label: row && row.hidden ? "Show again" : "Hide from the lists", action: function () {
        HC.act({ op: row && row.hidden ? "show" : "hide", names: [name] }, row && row.hidden ? "Shown again" : "Hidden from the lists (not deleted)");
      } } : null,
      { sep: true },
      // HERESY 1160 (Viktor: «Над писателем в меню — регенерировать этот же трек, но с другим случайным зерном… Авто замена
      // существующего»): made again from its own request with new seeds; the new take takes the old one's workspaces and
      // note, the old one goes to "Sourced for Regeneration"; on a checked card in the Librarian, every checked take
      take.session ? null : (function () {
        var sel = here === "collection" && HC && HC.selected ? HC.selected() : [], list = sel.length > 1 && sel.indexOf(name) >= 0 ? sel : [name];
        if (list.length < 2) return null;                  // HERESY 1727: one take's is in «Regenerate», under «Edit»
        return { icon: "⟳", label: list.length > 1 ? "Regenerate " + list.length + " with new seeds" : "Regenerate with a new seed",
                 hint: list.length > 1 ? "replaces them; the old kept; asks first" : "replaces it; the old one kept", action: function () {
                   Promise.resolve(regenAsk(list)).then(function (r) { if (list.length > 1 && r !== undefined && HC && HC.unselect) HC.unselect(list); });
                 } };
      })(),
      // HERESY 1483 (Viktor 16.10.2026: «Все действия по треку, что есть в карте, недостающие продублировать в контекстное меню»): the take
      // card's own buttons, grouped as on the card; each opens the take into the card and presses that button there
      take.session || bulk ? null : { icon: "\u2697", label: "Refiner", items: [
        cardItem(name, '[data-post-open="spectrumPanel"]', "Spectrum"), cardItem(name, '[data-post-open="glossPanel"]', "Lyrics check"),
        cardItem(name, "#transcribeTake", "Write it from the sound", "create")   // HERESY 1727: «Transcribe this take», the datasheet's name
      ] },
      HW ? { icon: "✒", label: "Writer", items: [
        { label: "New document from this take", action: function () {
          getRequest(take).then(function (req) {
            return HW.saveTake({ title: displayTitle(take), style: req.style || "", lyrics: req.lyrics || "", params: setupFromRequest(req) })
              .then(function (doc) { return HW.link(doc.id, [name]).then(function () { toast("In the Writer: “" + doc.title + "”"); HW.open(doc.id); }); });
          }).catch(function (e) { toast(e.message, "bad"); });
        } },
        { label: "Link to the document in hand", disabled: !hand, action: function () {
          HW.link(hand, [name]).then(function (doc) { toast("Linked to “" + doc.title + "”"); HW.reload(); }).catch(function (e) { toast(e.message, "bad"); });
        } }
      ] } : null,
      { icon: "⎘", label: "Copy", items: [
        { label: "Title", action: copy("Title", function () { return displayTitle(take); }) },
        { label: "Style", action: copy("Style", function () { return getRequest(take).then(function (q) { return q.style; }); }) },
        { label: "Lyrics", action: copy("Lyrics", function () { return getRequest(take).then(function (q) { return q.lyrics; }); }) },
        { label: "Take id", hint: name.slice(0, 15), action: copy("Take id", function () { return name; }) }
      ] },
      { icon: "⤓", label: "Download", items: [
        bulk && HC.exportChecked ? { label: bulk.length + " as a ZIP", hint: "the bar's format, made on the Forge", action: function () { HC.exportChecked(); } } : null,
        bulk ? { sep: true } : null,
        { label: formatExt(take.format).toUpperCase(), action: save(downloadUrl(take), audioFileName(take)) },
        bulk || take.session || formatExt(take.format) === "flac" ? null : cardItem(name, "#dlTakeFlac", "FLAC"),   // HERESY 1483: the card's own
        convertible(take) ? { label: "MP3 · " + mp3Rate() + " kbps", hint: artUrl(name) ? "with its artwork" : "", action: save(mp3Url(take), fileTitle(take) + ".mp3") } : null,
        artUrl(name) ? { label: "Artwork · JPEG", action: save(artUrl(name), fileTitle(take) + ".jpg") } : null,
        bulk || take.session ? null : { sep: true },
        bulk || take.session ? null : cardItem(name, "#dlRequest", "Request"),
        bulk || take.session ? null : cardItem(name, "#dlScore", "Score"),
        bulk || take.session ? null : cardItem(name, "#takeMidi", "MIDI"),
        bulk || take.session ? null : cardItem(name, "#takeMarkers", "Markers"),
        bulk || take.session ? null : cardItem(name, "#loopTake", "Loop…", "create")
      ].filter(Boolean) },
      // HERESY 1148 (Viktor, 03.10.2026): out to a DAW from any take, refined or not (a DAW is a refiner too); what goes
      // over says itself: the stems once the Refiner has split them; the user's own DAW (the DAW window's pick) first
      take.session ? null : (function () {
        var mine = recall("yue2.daw") || "", stems = !!(row && row.derived && row.derived.indexOf("stems") >= 0);
        var what = stems ? "mix, stems, score" : "mix and score (stems: split them in the Refiner)";
        var reaper = { label: "REAPER project", hint: (mine === "reaper" ? "your DAW · " : "") + what, action: function () {   // HERESY 1104
          reaperProject(take).catch(function (e) { toast("No REAPER project: " + e.message, "bad"); });
        } };
        var dawp = { label: "DAWproject", hint: (mine === "bitwig" ? "your DAW · " : "") + what + " · Bitwig, Studio One, Cubase", action: function () {   // HERESY 1478
          dawProject(take).catch(function (e) { toast("No DAWproject: " + e.message, "bad"); });   // HERESY 1134
        } };
        return { icon: "🎚", label: "Export to DAW", items: mine === "reaper" ? [reaper, dawp] : [dawp, reaper] };   // HERESY 1478: Bitwig's first
      })(),
      HC && HC.trash ? { sep: true } : null,
      // HERESY 1151 (Viktor): on a checked card in the Librarian, every checked take goes, as with Move
      HC && HC.trash ? (function () {
        var sel = here === "collection" && HC.selected ? HC.selected() : [], list = sel.length > 1 && sel.indexOf(name) >= 0 ? sel : [name];
        return { icon: "🗑", label: list.length > 1 ? "Move " + list.length + " to the trash…" : "Move to the trash…", danger: true, action: function () {
        // HERESY 1474: through the Librarian's guards (1473): where you stand, which workspaces it reaches, twice when it reaches past one
        (HC.guard ? HC.guard((list.length > 1 ? tr("Move " + list.length + " takes to the trash?") : tr("Move “" + displayTitle(take) + "” to the trash?")) + "\n\n" +
                             tr("Nothing is deleted: the trash in the Librarian gives it back until it is emptied."), tr("To the trash"), list)
          : window.HeresyDialog.confirm((list.length > 1 ? "Move the " + list.length + " checked takes to the trash?" : "Move “" + displayTitle(take) + "” to the trash?") +
          "\n\nNothing is deleted: the trash in the Librarian gives it back until it is emptied.", { ok: "To the trash", danger: true }))
          .then(function (ok) { if (ok) return HC.trash(list).then(function (d) {     // HERESY 1135: with its undo
            if (HC.undoable && d && d.moved && d.moved.length) HC.undoable("Moved to the trash", HC.untrash(d.moved));
            else if (!d || !d.protected || !d.protected.length) toast("Moved to the trash");   // HERESY 1368: none went: HC.trash said why
            return refreshLibrary();
          }); })
          .catch(function (e) { toast(e.message, "bad"); });
      } };
      })() : null
    ].filter(Boolean);
    // HERESY 1488 (Viktor 16.10.2026: «"Перегенерировать с новым зерном" в "Сделать ещё раз ›"»): the regeneration leads Make again;
    // on several checked takes it is that group's one row
    var regen = items.filter(function (it) { return it && it.icon === "\u27f3" && /^Regenerate /.test(it.label || ""); })[0];
    if (regen) {
      var again = items.filter(function (it) { return it && it.label === "Regenerate" && it.items; })[0], at = items.indexOf(regen);   // HERESY 1727
      items.splice(at, 1);
      if (again) again.items.unshift(regen, { sep: true });
      else items.splice(at, 0, { icon: "\u27f3", label: "Regenerate", items: [regen] });
    }
    if (fromCard) {                                        // HERESY 1488: the card's own buttons, on the card or in this menu only
      var on = cardTools();
      items.push({ sep: true }, { icon: "\u25a4", label: "The card's buttons", checked: on, hint: on ? "shown on the card" : "in this menu only",
                                  action: function () { store(CARD_TOOLS, on ? null : "on"); paintCardTools(); } });
    }
    window.HeresyMenu.open(x, y, groupMenu(items));
  }
  // HERESY 1483: one of the take card's buttons as a menu item: the take into the card (and the Creator, for what works on the card),
  // then that button pressed, so it acts, asks and refuses as on the card; one the card holds off for this take says so instead. Off
  // is read from the card when the take is the one in hand (a button hidden or disabled there; the room's own hiding does not count)
  function cardOff(el) {
    if (!el || el.disabled || el.getAttribute("aria-disabled") === "true" || el.classList.contains("is-disabled")) return true;
    for (var p = el; p && p.id !== "takeBody"; p = p.parentElement) if (p.hidden || p.classList.contains("is-hidden")) return true;
    return false;
  }
  function cardItem(name, sel, label, room) {
    var inHand = STATE.take && STATE.take.name === name;
    return { label: label, disabled: inHand && cardOff(document.querySelector(sel)), action: function () {
      if (!STATE.take || STATE.take.name !== name) openTake(name);
      if (room && document.body.dataset.tab !== room) setTab(room);
      var el = document.querySelector(sel);
      if (cardOff(el)) return toast(tr("Not for this take") + (el && (el.getAttribute("data-tip") || el.title) ? ": " + tr(el.getAttribute("data-tip") || el.title) : ""), "bad");
      el.click();
    } };
  }
  // HERESY 1474 (Viktor 16.10.2026: «пересмотри все пункты в контекстнике. Если логично, сделай подпункты, потому что оно у нас скоро
  // разбухнет до потолка»): the take's menu in groups: Open › (the rooms, the sheet, the datasheet, the artwork), Marks › (like,
  // dislike, favourite, protect), Artwork › (draw, redraw, take off, to its namesakes), Library › (its workspaces, a move, a pin,
  // hiding); a group of one stays a row of its own; Play, the section's own actions, the note, the name, a regeneration, the Writer,
  // Copy, Download, Export to DAW and the trash stay where the hand finds them
  function groupMenu(items) {
    var G = { open: { icon: "\u2197", label: "Open", items: [] }, mark: { icon: "\ud83d\udc4d", label: "Marks", items: [] },
              art: { icon: "\u25a3", label: "Artwork", items: [] }, lib: { icon: "\u25a6", label: "Library", items: [] } };
    var kindOf = function (it) {
      if (!it || it.sep || it.head || !it.label || it.disabled && !it.action) return "";
      if (/^Open (in|the) /.test(it.label)) return "open";
      if (["\ud83d\udc4d", "\ud83d\udc4e", "\u2606", "\ud83d\udee1"].indexOf(it.icon) >= 0) return "mark";
      if (/artwork|cover/i.test(it.label)) return "art";
      if (["\u25a6", "\u21e5", "\ud83d\udccc", "\u25cc"].indexOf(it.icon) >= 0) return "lib";
      return "";
    };
    var out = [], seen = {};
    items.forEach(function (it) {
      var k = kindOf(it);
      if (!k) return out.push(it);
      G[k].items.push(it);
      if (!seen[k]) { seen[k] = true; out.push(G[k]); }
    });
    out = out.map(function (it) { for (var k in G) if (G[k] === it && it.items.length === 1) return it.items[0]; return it; });
    return out.filter(function (it, i, a) { return !(it.sep && (i === 0 || i === a.length - 1 || a[i - 1].sep)); });
  }

  /* ---------------------------------------------- HERESY 1044: a note on the take */
  var noteTimer = 0, noteFor = "";
  function paintNote() {
    var HC = window.HeresyCollection, take = STATE.take;
    if (!take || !HC) return;
    if (noteFor !== take.name || document.activeElement !== $("takeNote")) $("takeNote").value = HC.note(take.name);
    noteFor = take.name;
    $("takeNoteState").textContent = "";
  }
  $("takeNote").addEventListener("input", function () {
    var name = noteFor, text = this.value;
    $("takeNoteState").textContent = "…";
    clearTimeout(noteTimer);
    noteTimer = setTimeout(function () {
      if (!window.HeresyCollection || !name) return;
      window.HeresyCollection.setNote(name, text).then(function () { if (noteFor === name) $("takeNoteState").textContent = "saved"; })
        .catch(function (e) { $("takeNoteState").textContent = "not saved: " + e.message; });
    }, 900);
  });

  /* ---------------------------------------------- HERESY 1041: the Librarian */
  if (window.HeresyCollection) window.HeresyCollection.init({
    toast: toast, clock: clock, ago: takeTime, when: whenHtml, findTake: findTake, getRequest: getRequest,   // HERESY 1720: a take's time as set
    openTake: function (name, where) { openTake(name); setTab(where === "post" ? "post" : "create"); },
    playNow: function (t) { STATE.playZone = "collection"; playNow(t); }, updateTake: updateTake, refreshLibrary: refreshLibrary, togglePlay: togglePlay,
    // HERESY 1731: a take of the playlist plays in the playlist's order (the one playing: play and pause); from the top, anew
    playPlaylist: function (name, anew) { var t = findTake(name); if (!t) return; STATE.playZone = "playlist"; if (!anew && STATE.playerTake && STATE.playerTake.name === name) togglePlay(); else playNow(t); paintPlStrip(); },
    playlistChanged: function () { paintPlStrip(); },
    playing: function () { return { name: STATE.playerTake ? STATE.playerTake.name : "", playing: isPlaying() }; }, libraryChanged: function () { paintLibrary(); paintRate(); paintNote(); },
    menu: function (name, x, y) { takeMenu(name, x, y); },
    rename: renameTake, refreshArts: refreshArts,         // HERESY 1337: a cover given back from the art's trash
    // HERESY 1168 (Viktor: «если проигрывается в данный момент, сразу снимай его с проигрыша»): the take playing went to the
    // trash, so the player lets it go now, not when its file is gone from under it
    trashed: function (names) { if (STATE.playerTake && names.indexOf(STATE.playerTake.name) >= 0) clearPlayer(); }
  });
  if ($("libSearch")) $("libSearch").addEventListener("input", function () { paintLibrary(); });

  /* ---------------------------------------------- HERESY 1028: the score's check, MIDI, voices */
  if (window.HeresyScore) window.HeresyScore.init({
    toast: toast,
    title: function () { return fullTitle() || "score"; },   // HERESY 1614
    setAbc: function (abc) { $("abc").value = abc; $("abc").dispatchEvent(new Event("input", { bubbles: true })); }
  });

  /* ---------------------------------------------- HERESY 1018: keys */
  // The score's K: is the key the song follows; a style naming another key costs diction
  // (measured 30.09.2026). The row in the score drawer moves the score; the line under the
  // style says when the two disagree and offers either side.
  var TR = window.HeresyTranspose, keySeen = "";
  function setField(id, value) {
    $(id).value = value;
    $(id).dispatchEvent(new Event("input", { bubbles: true }));   // the draft, the meters, the heights
  }
  function paintKeys() {
    if (!TR) return;
    var abc = $("abc").value, style = $("style").value, sig = abc.length + "|" + abc.slice(0, 400) + "|" + style;
    if (sig === keySeen) return;
    keySeen = sig;
    var sk = abc.trim() ? TR.scoreKey(abc) : null;
    $("transposeRow").classList.toggle("is-hidden", !sk);
    if (sk) {
      $("scoreKeyNow").textContent = TR.keyLabel(sk);
      var keep = $("transposeTo").value, opts = TR.choices(sk.mode);
      $("transposeTo").innerHTML = opts.map(function (k) {
        return '<option value="' + TR.keyName(k) + '">' + TR.keyLabel(k) + "</option>";
      }).join("");
      $("transposeTo").value = opts.some(function (k) { return TR.keyName(k) === keep; }) ? keep : TR.keyName(sk);
    }
    var st = TR.styleKey(style);
    var clash = sk && st && !TR.sameKey(st, { letter: sk.letter, acc: sk.acc, mode: sk.mode === -3 ? -3 : 0 });   // HERESY 1479: by pitch, not by spelling
    $("keyCheck").classList.toggle("is-hidden", !clash);
    if (clash) {
      signed($("keyCheckText"), "\u26a0 The style names " + TR.keyLabel(st) + ", the score is in " + TR.keyLabel(sk) + ". The song follows the score.");   // HERESY 1169 · 1247
      $("keyToScore").textContent = "Move the score to " + TR.keyLabel(st);
      $("keyToScore").dataset.key = TR.keyName(TR.usual(st));   // HERESY 1479: as the engine sings it
      $("keyToStyle").textContent = "Write " + TR.keyLabel(sk) + " in the style";
    }
  }
  function moveScore(target, way, respell) {
    try {
      var r = TR.transpose($("abc").value, target, way);
      if (!respell) store(WANT_KEY, TR.keyName({ letter: r.to.letter, acc: r.to.acc, mode: r.to.mode === -3 ? -3 : 0 }));   // HERESY 1028: the key chosen last is the one wanted (1479b: a respelling chooses none)
      setField("abc", r.abc);
      if (STATE.abcRendered !== undefined && $("abc").value) { /* the staff in the take card is the take's own score */ }
      $("transposeNote").textContent = TR.keyLabel(r.from) + " \u2192 " + TR.keyLabel(r.to) + ", " + (r.semis > 0 ? "+" : "") + r.semis +
        " semitones, " + r.notes + " notes moved";
      toast("Score moved to " + TR.keyLabel(r.to));
      keySeen = ""; paintKeys();
      if (window.HeresyTranspose) paintSongKey();
    } catch (error) {
      toast(error.message, "bad");
    }
  }
  // HERESY 1019: the Key list beside the title. It shows the score's key; a choice moves the
  // score, or, with no score yet, waits ("wanted") and moves the next score that arrives.
  var WANT_KEY = "yue2.wantKey";
  function paintSongKey() {
    var sel = $("songKey"), sk = TR.scoreKey($("abc").value), want = recall(WANT_KEY) || "";
    if (!sel.options.length) {
      var groups = [[-3, "minor"], [0, "major"]].map(function (g) {
        return '<optgroup label="' + g[1] + '">' + TR.choices(g[0]).map(function (k) {
          var al = TR.aliasLabel(k);                      // HERESY 1479: D♯m (E♭m)
          return '<option value="' + TR.keyName(k) + '">' + TR.keyLabel(k).replace(" minor", "m").replace(" major", "") + (al ? " (" + al.replace(" minor", "m").replace(" major", "") + ")" : "") + "</option>";
        }).join("") + "</optgroup>";
      });
      sel.innerHTML = '<option value="">as written</option>' + groups.join("");
    }
    var wk = want ? TR.parseKey(want) : null;
    if (wk) want = TR.keyName(TR.usual(wk));             // HERESY 1479: a key wanted under its old name (Ebm) is the same key (D#m)
    var shown = sk ? TR.keyName(TR.usual({ letter: sk.letter, acc: sk.acc, mode: sk.mode === -3 ? -3 : 0 })) : want;
    sel.value = Array.prototype.some.call(sel.options, function (o) { return o.value === shown; }) ? shown : "";
    sel.classList.toggle("is-wanted", !sk && !!want);
    sel.dataset.tip = sk ? "The score is in " + TR.keyLabel(sk) + ". Pick another key to move it there."
      : want ? "Wanted: " + TR.keyLabel(TR.parseKey(want)) + ". The next score in the form (a plan, a Retake, a transcription) moves there."
      : "No score yet. Pick a key and the next score that arrives moves there.";
  }
  if (TR) {
    $("songKey").addEventListener("change", function () {
      var key = this.value, sk = TR.scoreKey($("abc").value);
      store(WANT_KEY, key || null);
      if (sk && key) moveScore(key, "near");
      else if (key) toast("The next score will move to " + TR.keyLabel(TR.parseKey(key)));
      paintSongKey();
    });
    // a score that arrives (plan, Retake, open, transcription) moves to the wanted key once
    var lastAbc = $("abc").value;
    // HERESY 1028: "arrives" was "the form had no score before", so a new plan over an old score
    // stayed in its own key (Viktor: B♭m wanted, Em came). A score is new when its notes are
    // other than before, not when the form was empty: a hand edit of the K: line is not new.
    var notesOf = function (abc) {
      return String(abc).split(/\r?\n/).filter(function (l) { return l && !/^([A-Za-z]:|%)/.test(l); }).slice(0, 6).join("\n")
        .replace(/[\^_=]/g, "").replace(/[A-Ga-g][,']*/g, "n");   // the shape, not the pitches: a transposition is not new
    };
    setInterval(function () {
      var abc = $("abc").value;
      if (abc === lastAbc) return;
      var fresh = !TR.scoreKey(lastAbc) || notesOf(abc) !== notesOf(lastAbc);
      lastAbc = abc;
      var want = recall(WANT_KEY), sk = TR.scoreKey(abc), wk = want ? TR.usual(TR.parseKey(want)) : null;
      var plain = sk ? { letter: sk.letter, acc: sk.acc, mode: sk.mode === -3 ? -3 : 0 } : null;
      if (fresh && sk && wk && !(TR.sameKey(plain, wk) && TR.keyName(plain) === TR.keyName(wk))) {
        moveScore(TR.keyName(wk), "near");              // HERESY 1479: to the wanted key, spelled as the engine sings it
        lastAbc = $("abc").value;
        toast("The new score moved to " + TR.keyLabel(wk) + ", as wanted");
      } else if (fresh && sk && !wk && (sk.mode === 0 || sk.mode === -3) && TR.keyName(TR.usual(sk)) !== TR.keyName(sk)) {
        // HERESY 1479: a score spelled in a key the engine sings badly (a transcription in A♯m) is written as it sings it, every note kept
        moveScore(TR.keyName(TR.usual(sk)), "near", true);
        lastAbc = $("abc").value;
        toast("The score written in " + TR.keyLabel(TR.usual(sk)) + " (it came as " + TR.keyLabel(sk) + "): the same notes, spelled as the engine sings them");
      }
      paintSongKey();
    }, 1200);
    paintSongKey();
    $("transposeBtn").addEventListener("click", function () { moveScore($("transposeTo").value, $("transposeWay").value); });
    $("keyToScore").addEventListener("click", function () {
      $("scoreDrawer").open = true;
      moveScore(this.dataset.key, "near");
    });
    $("keyToStyle").addEventListener("click", function () {
      var sk = TR.scoreKey($("abc").value), style = $("style").value;
      var m = style.match(/\b([A-G])\s?([#b\u266f\u266d])?\s?(minor|major|min\b|maj\b|m\b)/);
      if (!sk || !m) return;
      var label = TR.keyLabel(sk).replace(/ (Dorian|Phrygian|Lydian|Mixolydian|Locrian)$/, "");
      setField("style", style.slice(0, m.index) + label + style.slice(m.index + m[0].length));
      keySeen = ""; paintKeys();
    });
    ["abc", "style"].forEach(function (id) { $(id).addEventListener("input", paintKeys); });
    // a score filled by a plan, a Retake or an opened prompt arrives without an input event
    setInterval(paintKeys, 1500);
    paintKeys();
  }

  // HERESY 1281 (from SUNO v6, TODO.md: «Vocal gender at a click (male, female): its words put into the Style»): ♂ and ♀ in the
  // Style's head. A click puts «male vocals» or «female vocals» into the Style: where it names the other gender that word turns
  // (the case kept); where it names none, a tag of its own on the first line, before a closing «… BPM», else at the line's end;
  // a click on the lit one takes the tag that says it out. Each change goes in as typed: one Ctrl+Z gives the Style back
  var VOICE_RE = /\b(fe)?male\b/i;
  function voiceOf(style) { var m = String(style || "").match(VOICE_RE); return m ? (m[1] ? "female" : "male") : ""; }
  function paintVoice() {
    var v = voiceOf($("style").value);
    ["male", "female"].forEach(function (g) {
      var b = $("voice-" + g);
      if (!b) return;
      b.classList.toggle("is-on", v === g);
      b.setAttribute("aria-pressed", v === g ? "true" : "false");
    });
  }
  function sameCase(word, like) {
    if (like === like.toUpperCase()) return word.toUpperCase();
    return like.charAt(0) === like.charAt(0).toUpperCase() ? word.charAt(0).toUpperCase() + word.slice(1) : word;
  }
  function voiceStyle(v, g) {
    var lines = v.split("\n"), at = -1;
    lines.some(function (l, i) { if (VOICE_RE.test(l)) { at = i; return true; } return false; });
    if (at >= 0) {
      var tags = lines[at].split(","), k = -1;
      tags.some(function (t, i) { if (VOICE_RE.test(t)) { k = i; return true; } return false; });
      var m = tags[k].match(VOICE_RE);
      if ((m[1] ? "female" : "male") === g) {                  // the lit one: the tag that says it goes
        tags.splice(k, 1);
        lines[at] = tags.map(function (t) { return t.trim(); }).filter(Boolean).join(", ");
      } else {                                                 // the other gender: its word turns
        tags[k] = tags[k].replace(VOICE_RE, function (w) { return sameCase(g, w); });
        lines[at] = tags.join(",");
      }
      return lines.join("\n");
    }
    var first = lines[0].split(",").map(function (t) { return t.trim(); }).filter(Boolean), put = g + " vocals";
    var bpm = first.length && /^\d+(\.\d+)?\s*bpm$/i.test(first[first.length - 1]) ? first.length - 1 : first.length;
    first.splice(bpm, 0, put);
    lines[0] = first.join(", ");
    return lines.join("\n");
  }
  // HERESY 1416: free tempo, asked by the Style's own words unless it names a BPM
  var TEMPO_FREE = /\b(?:rubato|non[- ]?linear|free[- ]?(?:tempo|time)|tempo[- ]?free|ad[- ]?lib(?:itum)?|out of time|unmetered|free rhythm)\b/i;
  var STYLE_BPM = /\b\d{2,3}\s*bpm\b|\bbpm\s*[:=]?\s*\d{2,3}\b/i;
  // HERESY 1607: the planned score's chords, the engine's harmony (1606): four levels, sent only when the model writes the score
  var HARMONY = [null,
    { strength: 4, window: 16, hold_limit: 8, section_strength: 2 },
    { strength: 8, window: 16, hold_limit: 8, section_strength: 4 },
    { strength: 16, window: 24, hold_limit: 6, section_strength: 8, outside_bonus: 2, outside_limit: 0.2 }];
  var HARMONY_NAMES = ["Off", "Gentle", "Varied", "Bold"];
  var HARMONY_DEFAULT = 1;   // HERESY 1613 (Viktor 20.10.2026: «Выставь Gentle в дефолт»)
  function harmonyLevel() { var b = document.querySelector('#harmonyRow [data-harmony][aria-pressed="true"]'); return b ? +b.dataset.harmony : 0; }
  function harmonyBody() { var h = HARMONY[harmonyLevel()]; return h ? JSON.parse(JSON.stringify(h)) : null; }
  function harmonyLevelOf(h) {
    if (!h || typeof h !== "object" || !(h.strength > 0 || h.section_strength > 0 || h.outside_bonus > 0)) return 0;
    var best = 1;
    for (var i = 1; i < HARMONY.length; i++) if (Math.abs((h.strength || 0) - HARMONY[i].strength) < Math.abs((h.strength || 0) - HARMONY[best].strength)) best = i;
    return best;
  }
  function setHarmony(level) {
    Array.prototype.forEach.call(document.querySelectorAll("#harmonyRow [data-harmony]"), function (b) { b.setAttribute("aria-pressed", String(+b.dataset.harmony === (level || 0))); });
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("#harmonyRow [data-harmony]");
    if (!b) return;
    setHarmony(+b.dataset.harmony);
    if (typeof queueDraft === "function") queueDraft();
  });
  window.HeresyHarmony = { level: harmonyLevel, set: setHarmony, body: harmonyBody, of: harmonyLevelOf, dflt: HARMONY_DEFAULT };
  function freeTempoOn() { var b = $("freeTempo"); return !!b && b.getAttribute("aria-pressed") === "true"; }
  function setFreeTempo(on) {
    var b = $("freeTempo");
    if (!b) return;
    b.setAttribute("aria-pressed", on ? "true" : "false");
    b.classList.toggle("is-on", !!on);
    paintTempoWarn();
    if (typeof queueDraft === "function") queueDraft();
  }
  function paintTempoWarn() {
    var w = $("styleTempoWarn");
    if (w) w.hidden = !(freeTempoOn() && STYLE_BPM.test($("style").value));
  }
  function tempoAsk(typed) {                                  // on by itself when the Style comes to ask for it (not again once turned off)
    var v = $("style").value, asks = TEMPO_FREE.test(v) && !STYLE_BPM.test(v);
    if (typed && asks && !STATE.tempoAsked && !freeTempoOn()) { setFreeTempo(true); toast("Free tempo on: your Style asks for rubato or non-linear, so the music is made without the score's tempo"); }
    STATE.tempoAsked = asks;
    paintTempoWarn();
  }
  window.ruachFreeTempo = function (on) { if (on !== undefined) setFreeTempo(!!on); return freeTempoOn(); };   // for the checks
  window.ruachBuildRequest = function () { return buildRequest(false, false, true); };   // for the checks: what Generate would send
  function setVoice(g) {
    var box = $("style"), v = box.value, out = voiceStyle(v, g), ok = false;
    if (out === v) return;
    box.focus({ preventScroll: true });
    box.setSelectionRange(0, v.length);
    try { ok = document.execCommand("insertText", false, out); } catch (e) { ok = false; }
    if (!ok) { box.value = out; box.dispatchEvent(new Event("input", { bubbles: true })); }
    box.setSelectionRange(out.length, out.length);
    paintVoice();
  }
  (function () {
    var label = $("style").closest(".field").querySelector(".label"), end = $("styleLabelEnd");
    if (!end) { end = document.createElement("span"); end.className = "label-end"; end.id = "styleLabelEnd"; label.appendChild(end); }
    var wrap = document.createElement("span");
    wrap.className = "voice-togs";
    [["male", "mars", "Male vocals in the Style: a click puts them there (in place of female ones); a click on the lit one takes their tag out"],
     ["female", "venus", "Female vocals in the Style: a click puts them there (in place of male ones); a click on the lit one takes their tag out"]].forEach(function (d) {
      var b = document.createElement("button");
      b.type = "button";
      b.id = "voice-" + d[0];
      b.className = "btn ghost small icon-btn voice-tog";
      b.setAttribute("aria-pressed", "false");
      b.setAttribute("aria-label", d[0] === "male" ? "Male vocals" : "Female vocals");
      b.dataset.tip = d[2];
      b.innerHTML = window.HeresyIcons && window.HeresyIcons.ui ? window.HeresyIcons.ui(d[1]) : (d[0] === "male" ? "\u2642" : "\u2640");
      b.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); setVoice(d[0]); });   // the head does not fold
      wrap.appendChild(b);
    });
    end.insertBefore(wrap, end.firstChild);
    $("style").addEventListener("input", paintVoice);
    paintVoice();
    // HERESY 1416 (Viktor 13.10.2026: «реальный ахуй, снятые BPM оковы. Реп стал живым, не следуя привязке к музыкальному такту»): Free tempo,
    // between the Style's name and the voice's toggles
    var ft = document.createElement("button");
    // HERESY 1419 (Viktor: «приведи её в тот же дизайн, что и кнопки "Номера строк", "Орфография"»): a lyrics' toggle (.lyr-tog), amber when pressed
    ft.type = "button"; ft.id = "freeTempo"; ft.className = "lyr-tog free-tempo"; ft.setAttribute("aria-pressed", "false");
    ft.textContent = "Free tempo";
    ft.dataset.tip = "Free tempo: the music is made from the score without its tempo marks (Q:), so the voice and the beat breathe on their own: rubato, non-linear. The score in the form keeps them; Direct has no score to free. On by itself when the Style asks for rubato or non-linear and names no BPM.";
    ft.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); setFreeTempo(!freeTempoOn()); });   // the head does not fold
    label.insertBefore(ft, end);
    var warn = document.createElement("p");
    warn.className = "row-hint style-tempo-warn"; warn.id = "styleTempoWarn"; warn.hidden = true;
    warn.textContent = "Want non-linearity or rubato? Remove the BPM from your style!";
    $("styleMeter").insertAdjacentElement("afterend", warn);
    $("style").addEventListener("input", function () { tempoAsk(true); });
    tempoAsk(false);
    // HERESY 1436 (Viktor 14.10.2026: «В блок стиля сторожа на не-латинские в стилевом промпте»): letters other than Latin said under
    // the Style, the words named: YuE2 reads the style as English tags
    var nl = document.createElement("p");
    nl.className = "row-hint style-nonlatin"; nl.id = "styleNonLatin"; nl.hidden = true;
    warn.insertAdjacentElement("afterend", nl);
    var nonLatin = function () {
      var words = ($("style").value.match(/[^\s,.;:!?()\[\]"'«»]+/g) || []).filter(function (w) { return /\p{L}/u.test(w) && /[^\p{Script=Latin}\p{N}\p{P}\p{S}\p{M}]/u.test(w); });
      nl.hidden = !words.length;
      if (words.length) nl.textContent = tr("Letters other than Latin in the Style: {0}. YuE2 reads the style as English tags: write it in Latin letters.")
        .replace("{0}", words.slice(0, 6).join(", ") + (words.length > 6 ? " …" : ""));
    };
    $("style").addEventListener("input", nonLatin);
    nonLatin();
    window.ruachStyleNonLatin = nonLatin;
  })();

  // HERESY 1438 (Viktor 14.10.2026: «ПИСАТЕЛЬ и ПРОФИЛЬ — попап оверлеями, как выбор пространства. Максимум, где есть массивные селекторы,
  // переводим их в модальные попап оверлеи»): a long list chosen in the studio's own dialog. The select stays, hidden, the state its code
  // reads and writes (its value set by code repaints the button too); the button shows the choice and opens the dialog
  function popPick(sel, title) {
    if (!sel || sel.dataset.pick) return null;
    sel.dataset.pick = "1";
    var btn = document.createElement("button");
    btn.type = "button"; btn.className = "pick-btn"; btn.id = sel.id + "Btn"; btn.setAttribute("aria-haspopup", "dialog");
    if (sel.getAttribute("aria-label")) btn.setAttribute("aria-label", sel.getAttribute("aria-label"));
    if (sel.dataset.tip) btn.dataset.tip = sel.dataset.tip;
    btn.innerHTML = '<span class="pick-name" translate="no"></span><span class="pick-caret" aria-hidden="true">\u25be</span>';
    sel.parentNode.insertBefore(btn, sel);
    sel.classList.add("pick-native"); sel.setAttribute("tabindex", "-1"); sel.setAttribute("aria-hidden", "true");
    var paint = function () {
      var o = sel.options[sel.selectedIndex];
      btn.querySelector(".pick-name").textContent = o ? o.textContent : "";
      btn.disabled = sel.disabled;
      btn.classList.toggle("is-empty", !sel.value);
    };
    var V = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value"), I = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "selectedIndex");
    Object.defineProperty(sel, "value", { configurable: true, get: function () { return V.get.call(this); }, set: function (v) { V.set.call(this, v); paint(); } });
    Object.defineProperty(sel, "selectedIndex", { configurable: true, get: function () { return I.get.call(this); }, set: function (v) { I.set.call(this, v); paint(); } });
    sel.addEventListener("change", paint);
    new MutationObserver(paint).observe(sel, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["disabled", "selected"] });
    btn.addEventListener("click", function () {
      var items = [], cur = sel.value;
      Array.prototype.forEach.call(sel.options, function (o) {
        if (o.disabled || o.value === "") return;
        var g = o.parentNode && o.parentNode.tagName === "OPTGROUP" ? o.parentNode.label : "";
        items.push({ value: "p" + items.length, raw: o.value, label: o.textContent, note: g ? tr(g) : "", current: o.value === cur, words: o.getAttribute("translate") !== "no" });
      });
      if (!items.length) return toast(tr("Nothing to choose here yet"));
      window.HeresyDialog.choose(title, items, { cancel: "Cancel", filter: "Filter" }).then(function (v) {
        var it = items.filter(function (x) { return x.value === v; })[0];
        if (!it) return;
        sel.value = it.raw;
        sel.dispatchEvent(new Event("change", { bubbles: true }));
      });
    });
    paint();
    return btn;
  }
  popPick($("wrHandPick"), "A song from the Writer\n\nIts title, style and lyrics into this form; it stays in hand, so the takes made from it are linked to it.");
  popPick($("setupLib"), "A profile\n\nIt sets every knob but the texts and the seeds; Apply puts it in the form.");
  popPick($("styleLib"), "A saved style\n\nIt goes into the Style box (asked first when something is there).");
  popPick($("tpPick"), "A text profile\n\nIts rules and its shape make a pasted text ready to be sung or read; Apply puts them to the lyrics.");
  window.ruachPopPick = popPick;

  /* ---------------------------------------------- HERESY 1014: three workspaces */
  // Create (the form and the take, as the Kit has it), Write (the writing room with the
  // song beside it) and Post (what is done to a finished take). The takes list stays in all
  // three: a take picked there is the one Post works on. Kept per browser.
  var TAB_KEY = "yue2.tab";
  function currentTab() { return document.body.dataset.tab || "create"; }
  function paintCurrentSong() {
    var style = $("style").value.trim(), lyrics = $("lyrics").value.trim(), abc = $("abc").value.trim() || STATE.abcRendered || "";
    $("curTitle").textContent = fullTitle() || "untitled";   // HERESY 1614
    $("curTitle").setAttribute("translate", $("title").value.trim() ? "no" : "yes");   // HERESY 1166: the user's own words
    $("curStyle").textContent = style || "no style yet";
    $("curStyle").setAttribute("translate", style ? "no" : "yes");
    $("curStyleSize").textContent = style ? style.length + " characters" : "";
    $("curLyrics").textContent = lyrics || "no lyrics yet";
    $("curLyrics").setAttribute("translate", lyrics ? "no" : "yes");
    $("curLyricsSize").textContent = lyrics ? lyrics.split(/\r?\n/).filter(function (l) { return l.trim(); }).length + " lines" : "";
    var h = window.HeresyAssist ? window.HeresyAssist.abcHeader(abc) : {};
    $("curScore").textContent = h.K || h.M || h.Q ? "K:" + (h.K || "?") + "  M:" + (h.M || "?") + "  Q:" + (h.Q || "?")
      : "no score in the form: in Full mode the model writes one";
  }
  function paintPost() {
    var take = STATE.take;
    $("postTitle").textContent = take ? displayTitle(take) : "";   // HERESY 1167: the room's name stands before it now
    $("postNote").textContent = take ? takeLabel(take).replace(displayTitle(take), "").replace(/^ · /, "") || take.name : "pick a take on the right";
    $("postDaw").disabled = !take || !!take.session;   // HERESY 1169: a take of the library goes out
    if (take && document.body.dataset.tab === "post") store("yue2.postTake", take.name);   // HERESY 1132: for F5
  }
  function setTab(tab) {
    if (["create", "write", "post", "artist", "collection", "train"].indexOf(tab) < 0) tab = "create";   // HERESY 1255: the Artist
    document.body.dataset.tab = tab;
    $("view-compose").classList.toggle("is-hidden", tab !== "create");
    $("view-take").classList.toggle("is-hidden", tab !== "create");
    $("view-write").classList.toggle("is-hidden", tab !== "write");
    $("view-post").classList.toggle("is-hidden", tab !== "post");
    $("view-artist").classList.toggle("is-hidden", tab !== "artist");            // HERESY 1255
    $("view-collection").classList.toggle("is-hidden", tab !== "collection");   // HERESY 1041
    $("view-train").classList.toggle("is-hidden", tab !== "train");             // HERESY 1063
    if (tab === "train" && window.HeresyTrain) window.HeresyTrain.reload();
    if (tab === "collection" && window.HeresyCollection) window.HeresyCollection.reload();
    if (tab === "artist" && window.HeresyArtist) window.HeresyArtist.reload();      // HERESY 1255
    if (tab === "write") refreshChat().catch(function () {});   // HERESY 1110: the Writing room says its state at once
    paintLibFold();                                   // HERESY 1167: each room its own fold
    all(".topbar [data-tab]").forEach(function (b) { b.classList.toggle("is-active", b.dataset.tab === tab); b.setAttribute("aria-selected", b.dataset.tab === tab ? "true" : "false"); });
    store(TAB_KEY, tab === "create" ? null : tab);
    if (tab === "write") paintCurrentSong();
    if (tab === "post") { paintPost(); refreshRefined(); restorePostTake(); }   // HERESY 1132
    paintLibrary();                                                          // the Refiner's column is its own
    if (tab === "create") drawWave();
    else frameOver(null);                            // HERESY 1168: a frame lifted in the Creator does not follow to another room
    window.dispatchEvent(new Event("resize"));   // pictures measure their new width
    placeLogDock();                              // HERESY 1258: left in the Artist, back where it was in the others
  }
  // HERESY 1166: a room in the bar leaves the Engine page for that room (asked first when the GPU roles are not saved)
  all(".topbar [data-tab]").forEach(function (b) { b.addEventListener("click", function () { leaveEngine().then(function (ok) { if (ok) setTab(b.dataset.tab); }); }); });
  // HERESY 1169: the Artist's greyed place in the bar by the page's language (the catalogs' "Artist" is the Trainer's
  // performer, «Артист»; the room is Viktor's «Художник», the pictures for the songs)
  var ARTIST_ROOM = { ru: "Художник", uk: "Художник", be: "Мастак", el: "Καλλιτέχνης", es: "Artista", it: "Artista",
                      fr: "Peintre", "pt-BR": "Pintor", de: "Maler", ja: "絵師", "zh-CN": "画室" };   // HERESY 1379: by <html lang>
  function artistRoom() {       // HERESY 1381: hoisted, for the log's view and the Bar's row painted before this line runs
    return (ARTIST_ROOM || {})[document.documentElement.lang] || "Artist";
  }
  function paintArtistTab() {   // HERESY 1332 (Viktor: «Artist не переводи как Артист на русский. Только как Художник»): the room's header too
    var name = artistRoom();
    if ($("tabArtist")) $("tabArtist").textContent = name;
    if ($("arRoomName")) $("arRoomName").textContent = name;
    if ($("logViewArtist")) $("logViewArtist").textContent = name;   // HERESY 1381: the log's view of the room
  }
  window.addEventListener("ruach-lang", paintArtistTab);
  paintArtistTab();

  // HERESY 1023: import a track from elsewhere. The body goes up as it is, with a progress line
  // (XMLHttpRequest: fetch reports no upload progress); then the lyrics, if any; then the new
  // take opens here in the Refiner.
  $("impRun").addEventListener("click", function () {
    var file = $("impFile").files[0], button = this;
    if (!file) return toast("Pick a file first", "bad");
    var title = $("impTitle").value.trim() || file.name.replace(/\.[^.]+$/, ""), lyrics = $("impLyrics").value.trim();
    button.disabled = true;
    // HERESY 1434: an import is a new take too: a workspace that takes it, first; it lands there
    wsGuard().then(function () { importNow(file, title, lyrics, button); }, function (e) { button.disabled = false; toast(e.message, "bad"); });
  });
  function importNow(file, title, lyrics, button) {
    var xhr = new XMLHttpRequest(), started = Date.now();
    xhr.open("POST", "/lab/import?file=" + encodeURIComponent(file.name) + "&title=" + encodeURIComponent(title));
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.upload.onprogress = function (e) {
      if (!e.lengthComputable) return;
      var secs = (Date.now() - started) / 1000;
      $("impState").textContent = "uploading " + Math.round(e.loaded / e.total * 100) + "% · " + (e.loaded / 1e6).toFixed(1) + " of " +
        (e.total / 1e6).toFixed(1) + " MB · " + (e.loaded / 1e6 / Math.max(0.1, secs)).toFixed(1) + " MB/s";
    };
    xhr.upload.onload = function () { $("impState").textContent = "converting on Forge…"; };
    xhr.onerror = function () { $("impState").textContent = "the upload broke off"; button.disabled = false; };
    xhr.onload = function () {
      var r = {};
      try { r = JSON.parse(xhr.responseText); } catch (error) { r = { error: xhr.statusText }; }
      if (xhr.status !== 200) { $("impState").textContent = "Could not import: " + (r.error || xhr.status); button.disabled = false; return; }
      var done = function () {
        $("impState").textContent = "imported: " + r.title + " · " + Math.floor(r.seconds / 60) + ":" + ("0" + Math.floor(r.seconds % 60)).slice(-2);
        button.disabled = false;
        $("impFile").value = ""; $("impTitle").value = ""; $("impLyrics").value = "";
        if (window.HeresyCollection) { if (r.workspace) window.HeresyCollection.reload(); else window.HeresyCollection.landed([r.name]); }   // HERESY 1434; 1481: the lab put it in 🚨 IMPORTED
        refreshLibrary().then(function () { openTake(r.name); setTab("post");
          try { window.dispatchEvent(new CustomEvent("heresy-imported", { detail: { name: r.name } })); } catch (e) { /* an old browser */ } }).catch(function () {});   // HERESY 1570
      };
      if (!lyrics) return done();
      fetch("/lab/lyrics?name=" + encodeURIComponent(r.name), { method: "POST", headers: { "Content-Type": "text/plain; charset=utf-8" }, body: lyrics })
        .then(done, done);
    };
    xhr.send(file);
  }
  all("[data-goto-tab]").forEach(function (b) { b.addEventListener("click", function () { setTab(b.dataset.gotoTab); }); });
  // From the take card (and Post's own row): open Post on this take at that tool.
  all("[data-post-open]").forEach(function (b) {
    b.addEventListener("click", function () {
      var panel = $(b.dataset.postOpen);
      setTab("post");
      if (window.HeresyPost && window.HeresyPost.has(b.dataset.postOpen)) { window.HeresyPost.select(b.dataset.postOpen); return; }   // HERESY 1029
      if (panel) { panel.open = true; panel.scrollIntoView({ behavior: "smooth", block: "start" }); }
    });
  });
  ["title", "style", "lyrics", "abc"].forEach(function (id) {
    $(id).addEventListener("input", function () { if (currentTab() === "write") paintCurrentSong(); });
  });

  /* ---------------------------------------- HERESY 1010: the writing room */
  var A = window.HeresyAssist, assistBefore = null;
  if (A) {
    A.TASKS.forEach(function (t) { var o = document.createElement("option"); o.value = t[0]; o.textContent = t[1]; $("assistTask").appendChild(o); });
    A.CHIPS.forEach(function (c) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "chip"; b.textContent = c[0]; b.dataset.tip = c[1];
      b.addEventListener("click", function () { $("assistBrief").value = c[1]; if (c[0] === "Style for YuE2") $("assistTask").value = "style"; saveAssist(); });
      $("assistChips").appendChild(b);
    });
    $("assistSystem").textContent = A.system("");
    var ASSIST_KEY = "yue2.assist";
    var saved = {};
    try { saved = JSON.parse(recall(ASSIST_KEY) || "{}") || {}; } catch (error) { saved = {}; }
    $("assistBrief").value = saved.brief || "";
    $("assistPrefs").value = saved.prefs || "";
    $("assistTask").value = saved.task || "song";
    $("assistStructure").value = saved.structure || "";
    if (saved.temp !== undefined) $("assistTemp").value = saved.temp;
    if (saved.max && +saved.max !== 8192) $("assistMax").value = saved.max;   // HERESY 1390: the old default (8192) gives way to 32K
    var saveAssist = function () {
      store(ASSIST_KEY, JSON.stringify({ brief: $("assistBrief").value, prefs: $("assistPrefs").value, task: $("assistTask").value,
                                         temp: $("assistTemp").value, max: $("assistMax").value,
                                         provider: $("assistProvider").value, orModel: $("orModel").value,
                                         structure: $("assistStructure").value }));
      $("assistPrefsSize").textContent = $("assistPrefs").value.trim() ? "· " + $("assistPrefs").value.trim().length + " characters" : "";
    };
    ["assistBrief", "assistPrefs", "assistTask", "assistTemp", "assistMax", "assistStructure"].forEach(function (id) { $(id).addEventListener("input", saveAssist); $(id).addEventListener("change", saveAssist); });
    // HERESY 1167 (Viktor: «В Писателе выбор LLM инстанса Writer не запоминается»): saved here, before the writer and the
    // model were put back, the defaults went into the store and the next load found them; the size alone is painted now
    $("assistPrefsSize").textContent = $("assistPrefs").value.trim() ? "· " + $("assistPrefs").value.trim().length + " characters" : "";

    var paintDraftSize = function () {
      var n = $("draftStyle").value.trim().length;
      $("draftStyleSize").textContent = n ? n + " characters" : "";
    };
    $("draftStyle").addEventListener("input", paintDraftSize);

    // HERESY 1012: OpenRouter. The key stays in memory unless the user asks to keep it;
    // the page sends it only to openrouter.ai.
    var OR = "https://openrouter.ai/api/v1", orKey = "", orListed = false;
    try { orKey = recall("yue2.orKey") || ""; } catch (error) { orKey = ""; }
    $("orKey").value = orKey;
    $("orRemember").checked = !!orKey;
    // HERESY 1133 (Viktor): OpenRouter by default when no chat server is set (Qwen and DeepSeek in the quick picks)
    $("assistProvider").value = saved.provider ? (saved.provider === "openrouter" ? "openrouter" : "engine") : (recall("yue2.chatUrl") || $("chatUrl").value ? "engine" : "openrouter");   // 1811: the studio's own writer counts
    $("orModel").value = saved.orModel || "deepseek/deepseek-v4-pro";
    saveAssist();                                     // HERESY 1167: now, with the writer and the model put back
    all("[data-or-model]").forEach(function (b) {
      b.addEventListener("click", function () { $("orModel").value = b.dataset.orModel; saveAssist(); paintAssistLine(); paintOrPrice(); });
    });
    // HERESY 1169 (the rc3 list: «The Writer's models with their prices, from OpenRouter's list, as you type»): each model with
    // its price per million tokens in and out and its context: in the list as you type, under the field, on the quick picks
    var OR_MODELS = {};
    function perMillion(v) { var x = parseFloat(v); return isFinite(x) ? x * 1e6 : null; }
    function usd(x) { return "$" + (x >= 0.1 ? x.toFixed(2) : x.toFixed(3)); }
    function contextSize(n) { return !n ? "" : n >= 1e6 ? Math.round(n / 1e5) / 10 + "M" : Math.round(n / 1000) + "K"; }
    function orPrice(m) {
      var p = m.pricing || {}, i = perMillion(p.prompt), o = perMillion(p.completion);
      if (i === null || o === null || i < 0 || o < 0) return tr("the price varies");
      if (i === 0 && o === 0) return tr("free");
      return tr("{0} in · {1} out per million tokens").replace("{0}", usd(i)).replace("{1}", usd(o));
    }
    function paintOrPrice() {
      var id = $("orModel").value.trim(), m = OR_MODELS[id], known = Object.keys(OR_MODELS).length > 0;
      $("orPrice").textContent = !id || !known ? "" : m
        ? (m.name || id) + " · " + orPrice(m) + (m.context_length ? " · " + tr("{0} context").replace("{0}", contextSize(m.context_length)) : "")
        : tr("Not in OpenRouter's list: check the name");
      $("orPrice").classList.toggle("is-off", !!id && known && !m);
    }
    window.addEventListener("ruach-lang", paintOrPrice);   // HERESY 1672: painted again in the new language, not walked whole
    function takeOrModels(list) {
      OR_MODELS = {};
      $("orModels").innerHTML = "";
      (list || []).slice().sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; }).forEach(function (m) {
        OR_MODELS[m.id] = m;
        var o = document.createElement("option");
        o.value = m.id;
        o.label = orPrice(m) + (m.context_length ? " · " + contextSize(m.context_length) : "");
        $("orModels").appendChild(o);
      });
      all("[data-or-model]").forEach(function (b) {
        if (b.dataset.tipBase === undefined) { b.dataset.tipBase = b.getAttribute("title") || b.dataset.tip || ""; b.removeAttribute("title"); }
        var m = OR_MODELS[b.dataset.orModel];
        b.dataset.tip = [b.dataset.tipBase, m ? orPrice(m) : ""].filter(Boolean).join(" · ");
      });
      paintOrPrice();
    }
    window.HeresyOrModels = { take: takeOrModels, price: orPrice };   // for the checks
    var paintProvider = function () {
      var or = $("assistProvider").value === "openrouter";
      all("#assistDrawer .or-only").forEach(function (el) { el.classList.toggle("is-hidden", !or); });
      if (or && !orListed) {
        orListed = true;
        fetch(OR + "/models").then(function (r) { return r.json(); }).then(function (d) { takeOrModels((d && d.data) || []); })
          .catch(function () { orListed = false; });
      }
    };
    $("assistProvider").addEventListener("change", function () { paintProvider(); saveAssist(); paintAssistLine(); });
    $("orModel").addEventListener("change", saveAssist);
    $("orModel").addEventListener("input", paintOrPrice);
    $("orKey").addEventListener("input", function () { if ($("orRemember").checked) store("yue2.orKey", this.value.trim() || null); });
    $("orRemember").addEventListener("change", function () { store("yue2.orKey", this.checked ? ($("orKey").value.trim() || null) : null); });
    paintProvider();

    function openRouterComplete(messages, maxTokens, temperature) {
      var key = $("orKey").value.trim(), model = $("orModel").value.trim();
      if (!key) return Promise.reject(new Error("Put your OpenRouter API key in first"));
      if (!model) return Promise.reject(new Error("Name an OpenRouter model first"));
      var body = { model: model, messages: messages, max_tokens: maxTokens };
      if (temperature !== null) body.temperature = temperature;
      return fetch(OR + "/chat/completions", { method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key, "X-Title": "Ruach Studio" },
        body: JSON.stringify(body) }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) {
          if (!r.ok) throw new Error("OpenRouter: " + ((d.error && d.error.message) || r.status));
          return d;
        });
      });
    }

    // HERESY 1357: the Writer's model for a task of the page's own (Tighten, the style's suggestions): the room's choice, OpenRouter
    // or the chat server, its request and answer in the log as the room's are; a model that spent its answer thinking asked once again
    window.HeresyWriterAsk = function (messages, max, temperature, what) {
      var started = Date.now(), model = null, or = $("assistProvider").value === "openrouter";
      var via = or ? ($("orModel").value.trim() || "OpenRouter") + " on OpenRouter" : "the chat server";
      addLogLine("[Writer] \u2192 " + via + ": " + (what || "a task") + ", up to " + max + " tokens", false);
      var send = function (m) {
        return or ? (model = $("orModel").value.trim() || "OpenRouter", openRouterComplete(messages, m, temperature))
          : refreshChat().then(function (status) {
            if (!status.configured) throw new Error("Set the chat server address under Engine first");
            if (!status.available) throw new Error(status.error || "The chat server is not answering at " + status.base);
            if (!status.use) throw new Error("No model is loaded in the chat server");
            model = status.use;
            return chatComplete(messages, model, m, null, temperature);
          });
      };
      return send(max).then(function (r) {
        var ch = (r.choices || [])[0] || {};
        if (ch.finish_reason === "length" && !stripThinking(((ch.message || {}).content) || "").trim() && max < 16384) return send(Math.min(16384, max * 2));
        return r;
      }).then(function (r) {
        var ch = (r.choices || [])[0] || {}, text = stripThinking(((ch.message || {}).content) || "").trim();
        addLogLine("[Writer] \u2190 " + model + " \u00b7 " + Math.round((Date.now() - started) / 100) / 10 + " s \u00b7 " + (what || "a task"), false);
        if (!text) throw new Error("The Writer's model gave no answer");
        return { text: text, model: model, cut: ch.finish_reason === "length" };
      });
    };

    $("assistBtn").addEventListener("click", function () {
      var brief = $("assistBrief").value.trim(), button = this, started = Date.now(), model = null;
      if (!brief) { $("assistBrief").focus(); return toast("Describe the song or the changes you want", "bad"); }
      // HERESY 1167 (Viktor: «Я подал Фосфориду, а на выходе буратино. Там явный баг»): the room works on the Creator's song;
      // a different document open in the notebook is asked about before anything is sent
      var W = window.HeresyWriter, doc = W && W.openDoc ? W.openDoc() : null;
      if (doc && W.inHand() !== doc.id && !button.dataset.goOn) {
        window.HeresyDialog.confirm("The writing room works on the song in the Creator: “" + ($("title").value.trim() || "untitled") + "”.\n\n" +
          "The notebook has “" + doc.title + "” open. Put it into the Creator and send the request on it?",
          { ok: "Put it in and send", cancel: "Send on the Creator's song", must: true }).then(function (yes) {
          var go = function () { button.dataset.goOn = "1"; button.click(); delete button.dataset.goOn; };
          if (!yes) return go();
          W.putInCreator(doc).then(function (ok) { if (ok) { paintCurrentSong(); go(); } });
        });
        return;
      }
      var task = $("assistTask").value, temp = $("assistTemp").value.trim();
      var max = Math.max(256, parseInt($("assistMax").value, 10) || 32768);   // HERESY 1390
      button.disabled = true;
      $("assistLabel").textContent = "Writing…";
      // HERESY 1167 (Viktor: «OpenRouter активность не отображается в системном логе»): the page asks the writer itself, so
      // the server never sees it: the page writes the request and its answer into the log
      var via = $("assistProvider").value === "openrouter" ? ($("orModel").value.trim() || "OpenRouter") + " on OpenRouter" : "the chat server";
      addLogLine("[Writer] \u2192 " + via + ": a brief of " + brief.length + " characters, up to " + max + " tokens", false);
      var ticker = setInterval(function () { $("assistStatus").textContent = "writing with " + (model || "the chat server") + "… " + Math.round((Date.now() - started) / 1000) + "s"; }, 1000);
      var song = { title: fullTitle(), style: $("style").value, lyrics: $("lyrics").value, abc: $("abc").value.trim() || STATE.abcRendered || "" };   // HERESY 1614
      // HERESY 1016: the idea writer's section templates, when a structure is picked
      var structure = $("assistStructure").value, fullBrief = structure ? brief + structureRequest(structure) : brief;
      var messages = [{ role: "system", content: A.system($("assistPrefs").value) }, { role: "user", content: A.user(task, fullBrief, song) }];
      var temperature = temp === "" ? null : parseFloat(temp);
      var ask = $("assistProvider").value === "openrouter"
        ? (model = $("orModel").value.trim() || "OpenRouter", openRouterComplete(messages, max, temperature))
        : refreshChat().then(function (status) {
          if (!status.configured) throw new Error("Set the chat server address under Engine first");
          if (!status.available) throw new Error(status.error || "The chat server is not answering at " + status.base);
          if (!status.use) throw new Error("No model is loaded in the chat server");
          model = status.use;
          return chatComplete(messages, model, max, null, temperature);
        });
      // HERESY 1167: a model that thinks before it answers (Qwen on vLLM, DeepSeek on OpenRouter) can spend the whole
      // output on its thinking and give no draft: once, the same request with twice the room (up to 32768)
      ask = ask.then(function (response) {
        var choice = (response.choices || [])[0] || {};
        if (choice.finish_reason !== "length" || A.parse(stripThinking(((choice.message || {}).content) || "")) || max >= 32768) return response;
        max = Math.min(32768, max * 2);
        addLogLine("[Writer] " + model + " spent its answer on thinking: asked again with " + max + " tokens", false);
        return $("assistProvider").value === "openrouter" ? openRouterComplete(messages, max, temperature)
          : chatComplete(messages, model, max, null, temperature);
      });
      ask.then(function (response) {
        var choice = (response.choices || [])[0] || {};
        var text = stripThinking(((choice.message || {}).content) || "");
        var draft = A.parse(text), cut = choice.finish_reason === "length", use = response.usage || {};
        addLogLine("[Writer] \u2190 " + model + " \u00b7 " + Math.round((Date.now() - started) / 100) / 10 + " s" +
          (use.prompt_tokens ? " \u00b7 " + use.prompt_tokens + " tokens in, " + use.completion_tokens + " out" : "") +
          (draft ? " \u00b7 a draft" : " \u00b7 no complete draft") + (cut ? " \u00b7 cut at the output limit" : ""), false);
        $("assistRawText").textContent = text;
        $("assistRaw").classList.remove("is-hidden");
        if (draft) {
          // HERESY 1012: an empty field is "unchanged", shown as the current text, never applied as a blank
          $("draftTitle").value = draft.title.trim() || fullTitle();   // HERESY 1614
          $("draftStyle").value = draft.style.trim() || $("style").value;
          $("draftStyleTags").value = (draft.styleTags || "").trim();   // HERESY 1167: its twin as tags
          $("draftLyrics").value = draft.lyrics.trim() || $("lyrics").value;
          $("draftLyrics").dataset.unchanged = draft.lyrics.trim() ? "" : "1";
          $("draftStyle").dataset.unchanged = draft.style.trim() ? "" : "1";
          $("draftNotes").textContent = draft.notes;
          $("assistModel").textContent = model + " · " + Math.round((Date.now() - started) / 100) / 10 + "s";
          paintDraftSize();
          $("assistDraft").classList.remove("is-hidden");
        } else {
          $("assistDraft").classList.add("is-hidden");
          $("assistRaw").open = true;
        }
        $("assistStatus").textContent = cut ? "The answer reached the output limit: review it carefully, or raise Max tokens."
          : draft ? "Your draft is ready. Review and edit it, then apply what you like."
          : "The model did not return a complete draft; its raw answer is below.";
        if (!text.trim()) {                              // HERESY 1390b: nothing came back: said over the page, not only in the log
          $("assistStatus").textContent = "";
          window.HeresyDialog.alert("The model gave an empty answer: nothing came back from " + model + ".\n\n" +
            "It may have spent the whole answer on its thinking, or stopped at once. Send it again, raise Max tokens, or pick another model.");
        } else {                                         // HERESY 1390b: the answer brought to the window's top
          var shown = draft ? $("assistDraft") : $("assistRaw");
          requestAnimationFrame(function () { shown.scrollIntoView({ block: "start", behavior: "smooth" }); });
        }
      }).catch(function (error) {
        $("assistStatus").textContent = "";
        addLogLine("[Writer] " + (model || "the writer") + " failed: " + (error.message || String(error)), false);
        window.HeresyDialog.alert("The writer failed: " + (error.message || String(error)));   // HERESY 1390b: over the page
      }).then(function () { clearInterval(ticker); button.disabled = false; $("assistLabel").textContent = "Send the request to LLM"; });   // HERESY 1167
    });

    // Apply into the form; one step back is kept.
    var apply = function (what) {
      keepForm("before");                              // HERESY 1596
      assistBefore = { title: fullTitle(), style: $("style").value, lyrics: $("lyrics").value };   // HERESY 1614: the title with its version
      if (what === "all" && $("draftTitle").value.trim()) setTitle($("draftTitle").value.trim());
      // HERESY 1167: the tags or the readable style, as chosen (the readable one when the model gave no tags)
      var form = (document.querySelector('input[name="draftStyleForm"]:checked') || {}).value || "tags";
      var styleNow = form === "tags" && $("draftStyleTags").value.trim() ? $("draftStyleTags").value.trim() : $("draftStyle").value.trim();
      if ((what === "all" || what === "style") && styleNow) $("style").value = styleNow;
      if ((what === "all" || what === "lyrics") && $("draftLyrics").value.trim()) $("lyrics").value = $("draftLyrics").value.replace(/\s+$/, "");
      ["title", "style", "lyrics"].forEach(function (id) { $(id).dispatchEvent(new Event("input", { bubbles: true })); });
      growLyrics();
      $("undoApply").classList.remove("is-hidden");
      toast(what === "all" ? "Draft applied" : what === "style" ? "Style applied" : "Lyrics applied");
      paintCurrentSong();
    };
    // HERESY 1167 (Viktor: «сохранять/удалять промпты, чтобы каждый раз не переписывать заново»): briefs by name in the lab's
    // preset store, as the styles are (every browser sees them)
    (function () {
      var SCOPE = (function () { try { return new URLSearchParams(location.search).get("scope") || ""; } catch (e) { return ""; } })();
      var URL = "/lab/presets" + (SCOPE ? "?scope=" + encodeURIComponent(SCOPE) : ""), briefs = [];
      function paintBriefs() {
        var sel = $("assistBriefLib"), cur = sel.value;
        sel.innerHTML = '<option value="">' + escape(briefs.length ? "Saved briefs…" : "No saved briefs yet") + "</option>" +
          briefs.map(function (b) { return '<option value="' + escape(b.name) + '"' + (b.name === cur ? " selected" : "") + ">" + escape(b.name) + "</option>"; }).join("");
        $("assistBriefDel").disabled = !sel.value;
      }
      function loadBriefs() {
        return fetch(URL).then(function (r) { return r.ok ? r.json() : {}; }).then(function (d) { briefs = d.briefs || []; paintBriefs(); }, function () { paintBriefs(); });
      }
      function send(payload) {
        return fetch(URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
          .then(function (r) { return r.json().then(function (b) { if (!r.ok) throw new Error(b.error || r.status); return b; }); });
      }
      $("assistBriefLib").addEventListener("change", function () {
        var b = briefs.filter(function (x) { return x.name === this.value; }, this)[0];
        $("assistBriefDel").disabled = !b;
        if (!b) return;
        $("assistBrief").value = b.text;
        $("assistBrief").dispatchEvent(new Event("input", { bubbles: true }));
      });
      $("assistBriefSave").addEventListener("click", function () {
        var text = $("assistBrief").value.trim();
        if (!text) { $("assistBrief").focus(); return toast("Write the brief first", "bad"); }
        window.HeresyDialog.prompt("Save the brief\n\nA name to find it by under the brief.", $("assistBriefLib").value || "", { ok: "Save", placeholder: "its name" }).then(function (name) {
          name = (name || "").trim();
          if (!name) return;
          send({ op: "put", kind: "brief", name: name, data: text }).then(function () { return loadBriefs(); }).then(function () {
            $("assistBriefLib").value = name; $("assistBriefDel").disabled = false; toast("Brief saved: " + name);
          }, function (e) { toast(e.message, "bad"); });
        });
      });
      $("assistBriefDel").addEventListener("click", function () {
        var name = $("assistBriefLib").value;
        if (!name) return;
        window.HeresyDialog.confirm("Delete the brief “" + name + "”?\n\nOnly the saved brief goes; the text in the box stays.", { ok: "Delete", danger: true }).then(function (yes) {
          if (!yes) return;
          send({ op: "delete", kind: "brief", name: name }).then(function () { return loadBriefs(); }).then(function () { toast("Brief deleted: " + name); },
            function (e) { toast(e.message, "bad"); });
        });
      });
      loadBriefs();
    })();
    // HERESY 1167: the choice of the style's form kept in this browser
    (function () {
      var kept = recall("yue2.draftStyleForm");
      if (kept) all('input[name="draftStyleForm"]').forEach(function (r) { r.checked = r.value === kept; });
      all('input[name="draftStyleForm"]').forEach(function (r) { r.addEventListener("change", function () { store("yue2.draftStyleForm", r.value); }); });
    })();
    $("applyDraft").addEventListener("click", function () { apply("all"); });
    $("applyStyle").addEventListener("click", function () { apply("style"); });
    $("applyLyrics").addEventListener("click", function () { apply("lyrics"); });
    $("undoApply").addEventListener("click", function () {
      if (!assistBefore) return;
      setTitle(assistBefore.title);   // HERESY 1614
      ["title", "style", "lyrics"].forEach(function (id) { if (id !== "title") $(id).value = assistBefore[id]; $(id).dispatchEvent(new Event("input", { bubbles: true })); });
      growLyrics();
      assistBefore = null;
      this.classList.add("is-hidden");
      toast("Back to what you had");
    });
  }

  /* ------------------------------------ HERESY 1009: folding prompt and lyrics */
  // The take card's Prompt and Lyrics start folded: a click on the heading opens
  // them, and the choice is kept per browser. Folded, the heading shows a peek.
  var CARD_FOLD_KEY = "yue2.cardFold", cardFolds = { prompt: true, lyrics: true };
  try { Object.assign(cardFolds, JSON.parse(recall(CARD_FOLD_KEY) || "{}")); } catch (error) { /* the defaults */ }
  function cardPeek(which) {
    var text = (which === "prompt" ? $("metaStyle").textContent : $("metaLyrics").textContent).trim();
    if (!text) return ["", ""];
    var first = text.split("\n").filter(function (l) { return l.trim() && l.trim().charAt(0) !== "["; })[0] || "";
    first = first.replace(/\s+/g, " ");
    if (first.length > 70) first = first.slice(0, 70) + "…";
    return which === "lyrics" ? [text.split("\n").filter(function (l) { return l.trim(); }).length + " lines", first]
                              : [text.length + " characters", first];
  }
  function paintCardFolds() {
    all("[data-card-fold]").forEach(function (panel) {
      var which = panel.dataset.cardFold, on = !!cardFolds[which];
      panel.classList.toggle("is-folded", on);
      panel.querySelector("h3").setAttribute("aria-expanded", on ? "false" : "true");
      if (on) setPeek(panel.querySelector(".fold-peek"), cardPeek(which)); else panel.querySelector(".fold-peek").textContent = "";
    });
  }
  all("[data-card-fold]").forEach(function (panel) {
    var h3 = panel.querySelector("h3");
    var chev = document.createElement("span");
    chev.className = "chev fold-chev";
    chev.setAttribute("aria-hidden", "true");
    h3.insertBefore(chev, h3.firstChild);
    h3.setAttribute("role", "button");
    h3.tabIndex = 0;
    var peek = document.createElement("span");
    peek.className = "fold-peek";
    h3.parentNode.insertBefore(peek, h3.nextSibling);
    function flip(event) {
      event.preventDefault();
      cardFolds[panel.dataset.cardFold] = !cardFolds[panel.dataset.cardFold];
      store(CARD_FOLD_KEY, JSON.stringify(cardFolds));
      paintCardFolds();
    }
    h3.addEventListener("click", flip);
    h3.addEventListener("keydown", function (event) { if (event.key === "Enter" || event.key === " ") flip(event); });
  });
  paintCardFolds();

  /* ------------------------------ HERESY 1007: spectrum and full-screen views */
  // Takes of one song share a title, so the label carries the take's day and time.
  function takeLabel(take) {
    var when = String(take.name || "").match(/^\d{4}(\d\d)(\d\d)-(\d\d)(\d\d)(\d\d)/);
    return displayTitle(take) + (when ? " · " + when[2] + "." + when[1] + " " + when[3] + ":" + when[4] + ":" + when[5] : "");
  }
  function spectrumTake(take) {
    return { name: take.name, url: takeAudioUrl(take), label: takeLabel(take),
             flac: take.session ? "" : "/library/flac?name=" + encodeURIComponent(take.name) };
  }
  // a click on a picture or a time plays the shown take from there
  function seekTake(shown, seconds) {
    var take = findTake(shown.name);
    if (!take) return;
    var go = function () {
      try { audio.currentTime = seconds; } catch (error) { /* not seekable yet */ }
      audio.play().catch(function () {});
    };
    if (STATE.playerTake && STATE.playerTake.name === take.name && audio.getAttribute("src")) { go(); return; }
    loadPlayer(take, false);
    audio.addEventListener("loadedmetadata", go, { once: true });
  }
  if (window.HeresyGloss) window.HeresyGloss.init({ seek: seekTake });   // HERESY 1011
  if (window.HeresyInspect) window.HeresyInspect.init({ seek: seekTake });   // HERESY 1025
  // HERESY 1055: the VAE's frame in samples, for Debuzz: sample_rate / frame_rate from /props
  function vaeFrame() {
    var p = STATE.props || {}, sr = +p.sample_rate, fr = +p.frame_rate;
    return sr > 0 && fr > 0 && sr % fr === 0 ? { period: sr / fr, rate: sr } : null;
  }
  if (window.HeresyPost) window.HeresyPost.init({ toast: toast, frame: vaeFrame });   // HERESY 1029; 1054 the chain
  // HERESY 1255: the Artist room: the take in hand for its cover, the takes' pictures asked again when one is set
  if (window.HeresyArtist) window.HeresyArtist.init({ toast: toast, artUrl: artUrl, refreshArts: refreshArts,
    take: function () { return STATE.take ? { name: STATE.take.name, label: displayTitle(STATE.take) } : null; } });
  if (window.HeresyDerived) window.HeresyDerived.init({   // HERESY 1021
    frame: vaeFrame,
    compare: function (path) {
      var f = window.HeresyDerived.files().filter(function (x) { return x.source === path; })[0];
      if (!f || !window.HeresySpectrum) return;
      $("spectrumPanel").open = true;
      $("spectrumPanel").scrollIntoView({ behavior: "smooth", block: "start" });
      window.HeresySpectrum.compareWith(f.url);
    },
    gloss: function (path) {
      $("glossPanel").open = true;
      $("glossPanel").scrollIntoView({ behavior: "smooth", block: "start" });
      window.HeresyGloss.useSource(path, true);
    },
    pauseMain: function () { audio.pause(); },
    // HERESY 1311: the take's family for «Compare all»: the same music in other takes, the disliked left out
    family: function (name) { return compareFamily(name); },
    // HERESY 1425: the compare popup's thumbs and star, the Librarian's own
    rating: function (name) { var HC = window.HeresyCollection; return HC && HC.rating ? HC.rating(name) : 0; },
    rate: function (name, v) { var HC = window.HeresyCollection; return HC && HC.rate ? HC.rate(name, v).then(function (x) { paintLibrary(); return x; }) : null; },
    favorite: function (name) { var t = findTake(name); return !!(t && t.favorite); },
    toggleFavorite: function (name) { var t = findTake(name); return t ? toggleFavorite(t) : null; },
    // HERESY 1724: the star set as asked, not toggled (a slow line answered twice no longer flips it back), and the take's note
    setFavorite: function (name, on) {
      var t = findTake(name);
      if (!t) return null;
      return updateTake(t, { favorite: !!on }).then(function (entry) { var HC = window.HeresyCollection; if (HC && HC.markFavorite) HC.markFavorite(name, !!entry.favorite); paintLibrary(); return entry; },
        function (error) { toast(error.message, "bad"); });
    },
    note: function (name) { var HC = window.HeresyCollection; return HC && HC.note ? HC.note(name) : ""; },
    setNote: function (name, text) { var HC = window.HeresyCollection; return HC && HC.setNote ? HC.setNote(name, text) : null; }
  });
  function compareFamily(name) {
    var take = findTake(name), HC = window.HeresyCollection;
    if (!take) return [];
    return familyOf(take).filter(function (t) { return t.name !== take.name && !(HC && HC.rating && HC.rating(t.name) < 0); })
      .map(function (t) {
        return { name: t.name, label: displayTitle(t), seconds: t.seconds, url: "/library/listen?name=" + encodeURIComponent(t.name),
                 group: "The same music · " + [t.vae ? t.vae + " decoder" : "", t.seed != null ? "sound seed " + seedText(t.seed) : "", t.created ? String(t.created).slice(11, 16) : ""].filter(Boolean).join(" · ") };
      });
  }
  window.ruachFamily = compareFamily;                  // HERESY 1311: for the checks
  // HERESY 1415 (Viktor 13.10.2026: «опцию сравнения одноимённых треков? Выбор до четырёх. Одноимённость берём по основному соответствию имени
  // трека с игнорированием суффикса типа версии»): a title's base, past what the studio and its user hang on it: what follows « · » (sound 2,
  // a section anew, a run's own words), (edit) and the like, a version (v4.0.10), «take 2», «#3»; its case and the dots and dashes it ends with
  function baseTitle(text) {
    var s = String(text || "").toLowerCase().split(" \u00b7 ")[0];
    s = s.replace(/\([^)]*\)/g, " ").replace(/\bv\s*\d+(?:[._]\d+)*\b/g, " ")
      .replace(/\b(?:take|version|ver|sound|edit|copy|remix|mix|final|draft|alt)\b\.?\s*\d*/g, " ").replace(/[#\u2116]\s*\d+/g, " ");
    return s.replace(/\s+/g, " ").replace(/[\s.,:;_\-\u2013\u2014|]+$/g, "").trim();
  }
  function namesakes(take) {                                 // its namesakes, the newest first, itself among them
    var base = baseTitle(displayTitle(take));
    if (!base) return [take];
    return STATE.takes.filter(function (t) { return !t.session && baseTitle(displayTitle(t)) === base; })
      .sort(function (a, b) { return String(b.created || b.name).localeCompare(String(a.created || a.name)); });
  }
  // HERESY 1619: a take's moment as a date and an hour: «created» is an ISO string on some takes, seconds since 1970 on others
  function takeWhen(created) {
    if (created == null || created === "") return "";
    var n = Number(created);
    if (isFinite(n) && n > 1e9) {
      var d = new Date(n * 1000), two = function (x) { return ("0" + x).slice(-2); };
      return d.getFullYear() + "-" + two(d.getMonth() + 1) + "-" + two(d.getDate()) + " " + two(d.getHours()) + ":" + two(d.getMinutes());
    }
    return String(created).slice(0, 16).replace("T", " ");
  }
  function compareTakes(names) {                             // two to four takes in the Refiner's compare player
    var list = names.map(findTake).filter(Boolean);
    if (list.length < 2) return toast("Tick two at least, six at most", "bad");   // HERESY 1621: up to six
    if (list.length > 12) { toast("Twelve at most: the first twelve"); list = list.slice(0, 12); }   // HERESY 1724 («можно смело 12 вместо 6»)
    if (!window.HeresyDerived || !window.HeresyDerived.compareList) return;
    window.HeresyDerived.compareList(baseTitle(displayTitle(list[0])) || displayTitle(list[0]), list.map(function (t) {
      return { label: displayTitle(t), path: "take:" + t.name, seconds: t.seconds, url: "/library/listen?name=" + encodeURIComponent(t.name), take: t.name,
               group: takeWhen(t.created) };   // HERESY 1619   // HERESY 1425: the thumbs and star its own buttons now
    }), 0);
  }
  function compareNamesakes(take) {
    var all = namesakes(take);
    window.HeresyDialog.pick("Compare with its namesakes\n\nTwo to six, played in one player from the same second: a click (or its number) switches.",   // HERESY 1621
      [{ label: "Its namesakes", items: all.map(function (t) {
        return { value: t.name, label: displayTitle(t), checked: t.name === take.name, note: (t.seconds ? clock(t.seconds) + " \u00b7 " : "") + takeWhen(t.created) };   // HERESY 1619
      }) }], { ok: "Compare", wide: true, count: function (v) { return v.length; } })
      .then(function (r) { if (r && r.values) compareTakes(r.values); });
  }
  window.HeresyCompare = { takes: compareTakes, namesakes: function (name) { var t = findTake(name); return t ? namesakes(t).map(function (x) { return x.name; }) : []; }, base: baseTitle };
  window.ruachRefreshLibrary = refreshLibrary;
  if (window.HeresySpectrum) {
    window.HeresySpectrum.init({
      others: function (shown) {
        var derived = window.HeresyDerived ? window.HeresyDerived.files().map(function (f) { return { url: f.url, label: f.label }; }) : [];
        return derived.concat(STATE.takes.filter(function (t) { return !shown || t.name !== shown.name; })   // HERESY 1536: no take shown
          .map(function (t) { return { url: takeAudioUrl(t), label: takeLabel(t) }; }));
      },
      byUrl: function (url) {
        var d = window.HeresyDerived ? window.HeresyDerived.files().filter(function (f) { return f.url === url; })[0] : null;
        if (d) return { name: d.name, source: d.source, url: d.url, label: d.label.replace(/^\u21b3 /, "") };   // HERESY 1021
        var take = STATE.takes.filter(function (t) { return takeAudioUrl(t) === url; })[0];
        return take ? spectrumTake(take) : null;
      },
      // where the player is in this take, or null when it holds another one
      time: function (shown) {
        return STATE.playerTake && STATE.playerTake.name === shown.name && audio.getAttribute("src") ? audio.currentTime : null;
      },
      seek: seekTake
    });
  }
  // HERESY 1169 · 1374 (Viktor 11.10.2026: «Максимум анализа по волне»): the wave's scope (heresy-wavescope.js): the take in the
  // player, the rooms of songs, the sections, the wave's own way to go somewhere, its card over the scope, its line on the wave
  if (window.HeresyWaveScope) {
    window.HeresyWaveScope.init({
      wave: $("wave"),
      audio: audio,
      take: function () {
        var t = STATE.playerTake;
        if (!t) return null;
        var s = spectrumTake(t);
        if (t.session) s.name = "";                  // a take of this tab alone: measured in the page, the lab does not have it
        return s;
      },
      room: function () { return ["create", "post", "collection"].indexOf(document.body.dataset.tab || "create") >= 0; },
      sections: waveSections,
      seek: waveSeek,
      pop: wavePop,
      mark: function (ratio) { STATE.waveHover = ratio; drawWave(); }
    });
  }

  // The staff over the whole screen: the engraved SVG, larger, never blurred.
  function openStaff() {
    var svg = $("scoreStaff").querySelector("svg");
    if (!svg || !window.HeresyZoom) return;
    var vb = svg.viewBox && svg.viewBox.baseVal, box = svg.getBoundingClientRect();
    var aspect = vb && vb.width ? vb.height / vb.width : box.height / Math.max(1, box.width);
    window.HeresyZoom.open({
      title: ($("takeTitle").textContent || "Score") + " — staff",
      aspect: aspect,
      vector: true,
      render: function (w, h) {
        var copy = svg.cloneNode(true);
        copy.removeAttribute("style");   // abcjs "responsive" pins its SVG absolute at the top
        if (!(vb && vb.width)) copy.setAttribute("viewBox", "0 0 " + box.width + " " + box.height);
        copy.setAttribute("width", w);
        copy.setAttribute("height", h);
        copy.style.maxWidth = "none";
        copy.classList.add("hz-paper");
        return copy;
      }
    });
  }
  $("staffFull").addEventListener("click", openStaff);

  // The staff paged for print on US Letter, portrait or landscape: each system is its
  // own SVG (abcjs oneSvgPerLine), and a page never breaks inside a system. The
  // browser's print dialog saves it as PDF.
  // HERESY 1167: US Letter or A4, upright or on its side (their widths in CSS pixels inside 0.5 in margins)
  var PAPER = {
    letter: { portrait: { width: 720, size: "letter portrait" }, landscape: { width: 960, size: "letter landscape" } },
    a4: { portrait: { width: 698, size: "A4 portrait" }, landscape: { width: 1027, size: "A4 landscape" } }
  };
  function printStaff(paper, orientation) {
    var sheet = PAPER[paper] || PAPER.letter, abc = STATE.abcRendered, page = sheet[orientation] || sheet.portrait;
    if (!abc || !window.ABCJS) { toast("No score to print"); return; }
    var host = document.createElement("div");
    host.style.cssText = "position:absolute;left:-10000px;top:0;width:" + page.width + "px";
    document.body.appendChild(host);
    try {
      window.ABCJS.renderAbc(host, abc, { oneSvgPerLine: true, staffwidth: page.width - 30, add_classes: true,
        paddingtop: 6, paddingbottom: 6, paddingleft: 10, paddingright: 10, foregroundColor: "#000000" });
      if (window.HeresyAbc && window.HeresyAbc.dress) window.HeresyAbc.dress(host);   // HERESY 1601
    } catch (error) {
      host.remove();
      toast("This score could not be engraved for print", "bad");
      return;
    }
    var systems = Array.prototype.map.call(host.querySelectorAll("svg"), function (svg) {
      svg.removeAttribute("style");
      svg.setAttribute("width", "100%");
      svg.removeAttribute("height");
      return '<div class="sys">' + svg.outerHTML + "</div>";
    }).join("\n");
    host.remove();
    var title = ($("takeTitle").textContent || "Score").replace(/[<&>]/g, function (c) { return { "<": "&lt;", "&": "&amp;", ">": "&gt;" }[c]; });
    var win = window.open("", "_blank");
    if (!win) { toast("The browser blocked the print window: allow pop-ups for this page", "bad"); return; }
    win.document.write('<!doctype html><html><head><meta charset="utf-8"><title>' + title + '</title><style>' +
      '@page { size: ' + page.size + '; margin: 0.5in; }' +
      'html, body { margin: 0; background: #fff; color: #000; font: 12px/1.4 "IBM Plex Sans", sans-serif; }' +
      (function () { var out = ""; Array.prototype.forEach.call(document.styleSheets, function (sh) { try { Array.prototype.forEach.call(sh.cssRules, function (r) { if (r.type === 5 && /Noto Sans/.test(r.cssText) && !/Mono/.test(r.cssText)) out += r.cssText; }); } catch (e) { /* a sheet from elsewhere */ } }); return out; })() +   // HERESY 1601: the paper's Noto Sans in the print window too
      'h1 { font: 600 16px/1.3 "IBM Plex Sans", sans-serif; margin: 0 0 10px; }' +
      '.sys { break-inside: avoid; page-break-inside: avoid; margin: 0 0 4px; }' +
      '.sys svg { display: block; width: 100%; height: auto; }' +
      '@media screen { body { width: ' + page.width + 'px; margin: 24px auto; } }' +
      '</style></head><body><h1>' + title + '</h1>' + systems +
      '<script>window.onload = function () { setTimeout(function () { window.print(); }, 250); };<\/script></body></html>');
    win.document.close();
  }
  // HERESY 1167: the Score's tools as icons (their words in the tips); the paper and its side remembered by this browser
  if (window.HeresyIcons) [["staffPrint", "printer"], ["staffPortrait", "sheet-portrait"], ["staffLandscape", "sheet-landscape"],
    ["takeMarkers", "flag"], ["reuseScore", "pencil"], ["staffFull", "maximize"]].forEach(function (p) { $(p[0]).innerHTML = window.HeresyIcons.ui(p[1]); });
  $("staffPaper").value = recall("yue2.paper") === "a4" ? "a4" : "letter";
  function paintSide(side) {
    $("staffPortrait").setAttribute("aria-pressed", side !== "landscape" ? "true" : "false");
    $("staffLandscape").setAttribute("aria-pressed", side === "landscape" ? "true" : "false");
  }
  paintSide(recall("yue2.paperSide"));
  $("staffPaper").addEventListener("change", function () { store("yue2.paper", this.value === "a4" ? "a4" : null); });
  $("staffPortrait").addEventListener("click", function () { store("yue2.paperSide", null); paintSide("portrait"); });
  $("staffLandscape").addEventListener("click", function () { store("yue2.paperSide", "landscape"); paintSide("landscape"); });
  $("staffPrint").addEventListener("click", function () {
    printStaff($("staffPaper").value, $("staffLandscape").getAttribute("aria-pressed") === "true" ? "landscape" : "portrait");
  });
  $("scoreStaff").addEventListener("dblclick", openStaff);

  // HERESY 1168 (Viktor 06.10.2026: «в комнате Творца прикрути на каждый фрейм — левый и правый — разворот этого фрейма на
  // "полный экран", в оверлей окно 95%x95%, с увеличением масштаба всего фрейма здесь на добрых 20%. … Также в оверлеях
  // кнопку переключения между фреймами. При запуске генерации — сворачиваем фреймы оверлейные. Retake — сразу в левый фрейм
  // переносит. И всё в таком типе»): a frame lifted over the room, body[data-frame] (the CSS lifts it where it stands, so its
  // handlers and state stay its own); from there the other frame. Esc, a click beside it, another room or a run started put
  // it back; what brings the form forward (Retake, Reuse, the score into the form) brings the form's frame: show("compose").
  var FRAMES = { compose: "view-compose", take: "view-take" };
  // HERESY 1169 (Viktor 07.10.2026: «три кнопочки svg -, +, reset для скейла… В минус шагом 2pt до минус 4, а в плюс… до макс
  // 8pt… глобальный скейл шрифтов с минус 2 и плюс до 4… Три кнопочки глобального -=R в спадающее меню в баре»; «По скейлингу
  // шрифтов и их лимитов сам решить, где порог»): every font size of the stylesheets is calc(N + var(--fs)) since the build, so
  // the text grows and the layout stays. --fs-g is the page's (☰: −2…+4 pt by 1), --fs-f a lifted frame's on top of it (−4…+8
  // by 2); both are this browser's (yue2.textSize), as the look is: each screen keeps its own
  // HERESY 1169 · 1246 (Viktor 08.10.2026: «В попапе фреймов всё скейлится с 4-мя шагами. Очень много. Опусти до 3-х»): the frame's
  // own up to +6 (three steps of 2); a size kept from before is held to the range
  var TEXT = { g: { min: -2, max: 4, step: 1 }, f: { min: -4, max: 6, step: 2 } };
  function textSizes() {
    var t;
    try { t = JSON.parse(recall("yue2.textSize") || "{}") || {}; } catch (e) { t = {}; }
    Object.keys(TEXT).forEach(function (w) { if (typeof t[w] === "number") t[w] = Math.max(TEXT[w].min, Math.min(TEXT[w].max, t[w])); });
    return t;
  }
  function paintTextSize() {
    var t = textSizes(), root = document.documentElement;
    ["g", "f"].forEach(function (w) { if (t[w]) root.style.setProperty("--fs-" + w, t[w] + "pt"); else root.style.removeProperty("--fs-" + w); });
    all("[data-fs-say]").forEach(function (el) { var v = t[el.dataset.fsSay] || 0; el.textContent = (v > 0 ? "+" : v < 0 ? "\u2212" : "") + Math.abs(v) + " pt"; });
    all("[data-fs]").forEach(function (b) {
      var w = b.dataset.fs.charAt(0), d = b.dataset.fs.slice(1), v = t[w] || 0, r = TEXT[w];
      b.disabled = d === "-" ? v <= r.min : d === "+" ? v >= r.max : !v;
    });
  }
  function setTextSize(w, v) {
    var t = textSizes(), r = TEXT[w];
    v = Math.max(r.min, Math.min(r.max, v));
    if (v) t[w] = v; else delete t[w];
    store("yue2.textSize", Object.keys(t).length ? JSON.stringify(t) : null);
    paintTextSize();
    window.dispatchEvent(new Event("resize"));            // the meter, the lists and the frames measure again
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-fs]");
    if (!b || b.disabled) return;
    e.preventDefault();
    e.stopPropagation();
    var w = b.dataset.fs.charAt(0), d = b.dataset.fs.slice(1), v = textSizes()[w] || 0;
    setTextSize(w, d === "0" ? 0 : v + (d === "+" ? TEXT[w].step : -TEXT[w].step));
  }, true);
  window.ruachTextSize = function (w, v) { if (v !== undefined) setTextSize(w, v); return textSizes()[w] || 0; };   // for the checks
  paintTextSize();
  // HERESY 1169 (Viktor 08.10.2026: «ещё один оверлей поверх оверлея! В окне Lyrics ещё одну кнопку full screen, и поверх всего
  // где-то 60% ширины экрана, и шрифт автоматом на 10% крупнее»): the lyrics over everything, 60 % of the screen wide, a tenth
  // larger. The box itself moves there with its meter (its numbers, marks, tags, the find bar and the «[» list go with it) and
  // back where it stood; Esc (unless a list, a find bar or a question has it) or ⤡ puts it back, and so does another room
  var lyrOver = null;
  function lyricsOver(on) {
    var area = $("lyrics");
    if (on && !lyrOver) {
      var wrap = area.parentNode, meter = $("lyricsMeter"), back = document.createElement("div");
      back.className = "lyr-over";
      back.id = "lyrOver";
      var ui = function (n) { return window.HeresyIcons ? window.HeresyIcons.ui(n) : ""; };
      back.innerHTML = '<div class="lyr-over-box" role="dialog" aria-label="Lyrics"><div class="lyr-over-head"><b>' + escape(tr("Lyrics")) + '</b><span class="spacer"></span>' +
        '<span class="lyr-over-fs" role="group" aria-label="Text size"><button type="button" class="btn ghost small icon-btn" data-lyr-z="-1" aria-label="Smaller text" data-tip="Smaller text here">' + ui("text-smaller") +
        '</button><button type="button" class="btn ghost small icon-btn" data-lyr-z="1" aria-label="Larger text" data-tip="Larger text here">' + ui("text-larger") +
        '</button><button type="button" class="btn ghost small icon-btn" data-lyr-z="0" aria-label="The text as it starts" data-tip="The text as it starts: four tenths larger than in the form">' + ui("text-reset") + "</button></span>" +
        '<button type="button" class="btn ghost small icon-btn" id="lyricsBack" aria-label="Back into the form" data-tip="Back into the form (Esc)">' +
        (window.HeresyIcons ? window.HeresyIcons.ui("minimize") : "") + '</button></div><div class="lyr-over-body"></div></div>';
      document.body.appendChild(back);
      lyrOver = { back: back, wrap: wrap, wrapParent: wrap.parentNode, wrapNext: wrap.nextSibling, meter: meter, meterParent: meter.parentNode, meterNext: meter.nextSibling };
      var body = back.querySelector(".lyr-over-body");
      body.appendChild(wrap);
      body.appendChild(meter);
      back.addEventListener("click", function (e) { if (e.target === back) lyricsOver(false); });
      $("lyricsBack").addEventListener("click", function () { lyricsOver(false); });
      // HERESY 1169 · 1239 (Viktor 08.10.2026: «Ужасно мелкий шрифт по умолчанию. Увеличь умолчание всех текстов в таком оверлее на 40%… Ты не прикручивал ещё кнопки -+?»): the box 1.54 times the form's (it was 1.1), a press a tenth up or down from there, kept in this browser. HERESY 1169 · 1246 («В Lyrics можно + и - только в самой зоне текста, а не весь интерфейс?»): the press scales the text alone, its numbers along; the box, its buttons and the meter stay at 1.54
      back.querySelector(".lyr-over-fs").addEventListener("click", function (e) {
        var b = e.target.closest("[data-lyr-z]");
        if (!b) return;
        var k = +b.dataset.lyrZ === 0 ? 0 : Math.max(-2, Math.min(2, lyrZoomStep() + +b.dataset.lyrZ));   // two steps each way (Viktor: «Третий и дальше сбивают скейл очень сильно»)
        store("yue2.lyricsZoom", k ? String(k) : null);
        paintLyrZoom();
        window.dispatchEvent(new Event("resize"));
      });
      paintLyrZoom();
      document.body.classList.add("lyr-over-on");
      area.focus({ preventScroll: true });
    } else if (!on && lyrOver) {
      var o = lyrOver;
      lyrOver = null;
      o.wrapParent.insertBefore(o.wrap, o.wrapNext);
      o.meterParent.insertBefore(o.meter, o.meterNext);
      o.back.remove();
      document.body.classList.remove("lyr-over-on");
    }
    $("lyricsBig").setAttribute("aria-pressed", lyrOver ? "true" : "false");
    window.dispatchEvent(new Event("resize"));   // the meter, the numbers and the marks measure their box again
  }
  window.ruachLyricsOver = function () { return !!lyrOver; };   // for the checks
  function lyrZoomStep() { var k = parseInt(recall("yue2.lyricsZoom") || "0", 10); return isFinite(k) ? Math.max(-2, Math.min(2, k)) : 0; }
  function paintLyrZoom() {
    if (!lyrOver) return;
    var k = lyrZoomStep(), z = Math.round(Math.pow(1.1, k) * 1000) / 1000, box = lyrOver.back.querySelector(".lyr-over-box");
    box.style.setProperty("--lyr-t", String(z));
    box.querySelector('[data-lyr-z="-1"]').disabled = k <= -2;
    box.querySelector('[data-lyr-z="1"]').disabled = k >= 2;
    box.querySelector('[data-lyr-z="0"]').disabled = k === 0;
  }
  $("lyricsBig").addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); lyricsOver(!lyrOver); });
  // HERESY 1277 (Viktor 09.10.2026: «Кнопку экспорта/импорта содержимого редактора в голый txt формат, авто имя файла по Title
  // трека»): the lyrics saved as «Title.txt» (UTF-8, LF, a newline at the end), and a .txt put in their place: asked first when
  // the box has words, put in as typed (one Ctrl+Z brings the old ones back); a file that is not UTF-8, or longer than the box
  // holds, is refused out loud, never cut or garbled; an empty Title takes the file's name
  function lyricsTxtName() {
    var t = fullTitle().replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().replace(/^\.+/, "").slice(0, 120).trim();
    return (t || "lyrics") + ".txt";
  }
  $("lyricsTxtOut").addEventListener("click", function (e) {
    e.preventDefault(); e.stopPropagation();
    var text = $("lyrics").value.replace(/\r\n?/g, "\n");
    if (!text.trim()) { toast("The lyrics are empty: nothing to save", "bad"); return; }
    downloadText(lyricsTxtName(), /\n$/.test(text) ? text : text + "\n", "text/plain;charset=utf-8");
    toast("The lyrics saved as " + lyricsTxtName(), "good");
  });
  var lyricsTxtFile = document.createElement("input");
  lyricsTxtFile.type = "file";
  lyricsTxtFile.accept = ".txt,text/plain";
  lyricsTxtFile.id = "lyricsTxtFile";
  lyricsTxtFile.hidden = true;
  document.body.appendChild(lyricsTxtFile);
  $("lyricsTxtIn").addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); lyricsTxtFile.value = ""; lyricsTxtFile.click(); });
  lyricsTxtFile.addEventListener("change", function () { if (lyricsTxtFile.files && lyricsTxtFile.files[0]) lyricsFromTxt(lyricsTxtFile.files[0]); });
  function lyricsFromTxt(file) {
    return file.text().then(function (raw) {
      var text = raw.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").replace(/\s+$/, "");
      var area = $("lyrics"), max = parseInt(area.getAttribute("maxlength"), 10) || 10000, now = area.value;
      if (/\uFFFD/.test(text)) return toast(file.name + " is not UTF-8 text: save it as UTF-8 and open it again", "bad");
      if (!text) return toast(file.name + " is empty", "bad");
      if (text.length > max) return toast(file.name + " holds " + text.length + " characters; the lyrics take up to " + max, "bad");
      var go = !now.trim() || now === text ? Promise.resolve(true)
        : window.HeresyDialog.confirm("Put " + file.name + " in place of the lyrics?\n\nThe words now in the box go; Ctrl+Z in the box brings them back.", { ok: "Replace" });
      return go.then(function (yes) {
        if (!yes) return;
        area.focus({ preventScroll: true });
        area.setSelectionRange(0, area.value.length);
        var ok = false;
        try { ok = document.execCommand("insertText", false, text); } catch (e) { ok = false; }
        if (!ok) { area.value = text; area.dispatchEvent(new Event("input", { bubbles: true })); }
        area.setSelectionRange(0, 0);
        area.scrollTop = 0;
        if (!$("title").value.trim()) {
          setTitle(file.name.replace(/\.txt$/i, "").trim());   // HERESY 1614
          $("title").dispatchEvent(new Event("input", { bubbles: true }));
        }
        toast("The lyrics from " + file.name, "good");
      });
    }).catch(function (e) { toast("Could not read " + file.name + ": " + e.message, "bad"); });
  }
  // HERESY 1169 · 1357 (from SUNO v6, TODO.md: «Tighten these lyrics in the lyrics box, by the Writer's model; style suggestions as chips
  // under the Style, made anew on demand (SUNO's ✦ and ↻ under its Styles)»; Viktor 11.10.2026: «Идеи из SUNO внедряй для релиза 2.0.0»)
  var TIGHTEN = "You edit song lyrics. Tighten the lyrics you are given: cut filler words and weak or repeated lines, keep the meaning, the language, " +
    "the voice and the rhymes, keep every section tag line (such as [Verse 1] or [Chorus]) exactly as it is, where it is and in its order, keep each line " +
    "singable and about as long as its melody needs, add no new section, write no explanation. Answer with the lyrics only.";
  var SUGGEST = "You suggest style tags for songs made by the music model YuE: short tags of one to four words each (genre, instruments, voice, mood, " +
    "production, era), in English, the most telling first. Suggest tags the song's style has not got yet and that fit it, its title and its lyrics. " +
    "One tag a line, no numbering, no explanation.";
  function writerAsk(messages, max, what) {
    if (!window.HeresyWriterAsk) return Promise.reject(new Error("The Writer's model is not set up yet"));
    return window.HeresyWriterAsk(messages, max, null, what).catch(function (e) { throw new Error(tr("The Writer's model: " + (e.message || String(e)))); });
  }
  function lyricTags(text) { return String(text || "").split("\n").filter(function (l) { return /^\s*\[[^\]]+\]\s*$/.test(l); }).map(function (l) { return l.trim(); }); }
  function cleanAnswer(text) { return String(text || "").replace(/^```[a-z]*\n?|```$/gm, "").replace(/\s+$/, ""); }
  function tightenWindow(now, then) {                  // both side by side; the right one editable; Apply, Ask again or Cancel
    return new Promise(function (resolve) {
      var back = document.createElement("div"), lost = lyricTags(now).filter(function (t) { return lyricTags(then).indexOf(t) < 0; });
      var words = function (s) { return (String(s).match(/\S+/g) || []).length; };
      back.className = "ar-lib-back tg-back";
      back.setAttribute("role", "dialog");
      back.setAttribute("aria-label", tr("Tighten these lyrics"));
      back.innerHTML = '<div class="ar-lib ar-get tg-win"><div class="ar-lib-head"><b>' + escape(tr("Tighten these lyrics")) + "</b>" +
        '<span class="row-hint">' + escape(tr("Now " + words(now) + " words · tightened " + words(then) + " words")) + "</span>" +
        (lost.length ? '<span class="row-hint tg-lost">' + escape(tr("Section tags the model left out: " + lost.join(" "))) + "</span>" : "") + "</div>" +
        '<div class="tg-cols"><label><span class="label">' + escape(tr("Now")) + '</span><textarea readonly spellcheck="false" class="tg-now"></textarea></label>' +
        '<label><span class="label">' + escape(tr("Tightened (yours to edit)")) + '</span><textarea spellcheck="true" class="tg-then"></textarea></label></div>' +
        '<div class="ar-li-acts"><button type="button" class="btn small primary" data-tg="apply">' + escape(tr("Apply")) + "</button>" +
        '<button type="button" class="btn ghost small" data-tg="again">' + escape(tr("Ask again")) + '</button><span class="spacer"></span>' +
        '<button type="button" class="btn ghost small" data-tg="close">' + escape(tr("Cancel")) + "</button></div></div>";
      back.querySelector(".tg-now").value = now;
      back.querySelector(".tg-then").value = then;
      document.body.appendChild(back);
      function done(v) { document.removeEventListener("keydown", key, true); back.remove(); resolve(v); }
      function key(e) { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); done(null); } }
      document.addEventListener("keydown", key, true);
      back.addEventListener("click", function (e) {
        var b = e.target.closest("[data-tg]");
        if (e.target === back || (b && b.dataset.tg === "close")) return done(null);
        if (b && b.dataset.tg === "apply") return done({ text: back.querySelector(".tg-then").value });
        if (b && b.dataset.tg === "again") return done({ again: true });
      });
      back.querySelector(".tg-then").focus();
    });
  }
  function tighten() {
    var area = $("lyrics"), now = area.value.replace(/\s+$/, ""), button = $("lyricsTighten");
    if (!now.trim()) return toast("The lyrics are empty: nothing to tighten", "bad");
    button.disabled = true;
    var label = button.textContent;
    button.textContent = tr("✦ Tightening…");
    var ask = function () {
      return writerAsk([{ role: "system", content: TIGHTEN }, { role: "user", content: now }], Math.max(1024, Math.min(16384, now.length * 2)), "tighten the lyrics")
        .then(function (r) { return tightenWindow(now, cleanAnswer(r.text)); })
        .then(function (v) { return v && v.again ? ask() : v; });
    };
    return ask().then(function (v) {
      if (!v || !v.text.trim()) return;
      var text = v.text.replace(/\r\n?/g, "\n").replace(/\s+$/, ""), max = parseInt(area.getAttribute("maxlength"), 10) || 10000;
      if (text.length > max) return toast("The tightened lyrics hold " + text.length + " characters; the box takes up to " + max, "bad");
      area.focus({ preventScroll: true });
      area.setSelectionRange(0, area.value.length);
      var ok = false;
      try { ok = document.execCommand("insertText", false, text); } catch (e) { ok = false; }
      if (!ok) { area.value = text; area.dispatchEvent(new Event("input", { bubbles: true })); }
      area.setSelectionRange(0, 0);
      area.scrollTop = 0;
      toast("The lyrics tightened: Ctrl+Z in the box brings the old ones back", "good");
    }).catch(function (e) { toast(e.message || String(e), "bad"); })
      .then(function () { button.disabled = false; button.textContent = label; });
  }
  $("lyricsTighten").addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); tighten(); });
  var styleSugShown = [];
  function styleHas(style, tag) { return String(style).toLowerCase().indexOf(String(tag).toLowerCase()) >= 0; }
  function sugTags(text, style) {                      // the answer's lines as tags: bullets and numbers off, short, new to the style, once each
    var seen = {};
    return String(text || "").split(/\n|,/).map(function (l) { return l.replace(/^\s*(?:[-*\u2022]|\d+[.)])\s*/, "").replace(/^["'\u201c]|["'\u201d]$/g, "").trim(); })
      .filter(function (t) { var k = t.toLowerCase(); if (!t || t.length > 40 || t.split(/\s+/).length > 5 || seen[k] || styleHas(style, t)) return false; seen[k] = 1; return true; })
      .slice(0, 8);
  }
  function styleInsert(style, tag) {                    // the tag before a BPM at the style's end, else at its end
    var s = String(style).replace(/[\s,]+$/, ""), m = /,\s*(\d{2,3}\s*bpm)$/i.exec(s);
    if (!s) return tag;
    return m ? s.slice(0, m.index) + ", " + tag + ", " + m[1] : s + ", " + tag;
  }
  function paintStyleSug() {
    $("styleSugChips").innerHTML = styleSugShown.map(function (t, i) {
      return '<button type="button" class="chip style-sug-chip" data-sug="' + i + '" translate="no">' + escape(t) + "</button>";
    }).join("");
    $("styleSugMore").hidden = !styleSugShown.length;
  }
  function styleSuggest(more) {
    // HERESY 1436 (Viktor: «"Подсказать" пусть LLM читает всю лирику»): the lyrics whole, 8000 characters at most (a long reading)
    var style = $("style").value.trim(), lyr = $("lyrics").value.split("\n").filter(function (l) { return l.trim(); }).join("\n").slice(0, 8000), button = $("styleSugGo");
    if (!style && !lyr.trim()) return toast("Write a style or some lyrics first: the suggestions read them", "bad");
    button.disabled = true; $("styleSugMore").disabled = true;
    var user = "Style: " + (style || "(none yet)") + "\nTitle: " + ($("title").value.trim() || "(none)") + "\nThe lyrics, whole:\n" + (lyr || "(none)") +
      (more && styleSugShown.length ? "\nNot these again: " + styleSugShown.join(", ") : "") + "\nSuggest 8 tags.";
    return writerAsk([{ role: "system", content: SUGGEST }, { role: "user", content: user }], 1024, "style suggestions").then(function (r) {
      var tags = sugTags(cleanAnswer(r.text), $("style").value);
      if (!tags.length) throw new Error(tr("The Writer's model offered nothing new for this style"));
      styleSugShown = tags;
      paintStyleSug();
    }).catch(function (e) { toast(e.message || String(e), "bad"); })
      .then(function () { button.disabled = false; $("styleSugMore").disabled = false; });
  }
  $("styleSugGo").addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); styleSuggest(false); });
  $("styleSugMore").addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); styleSuggest(true); });
  $("styleSugChips").addEventListener("click", function (e) {
    var c = e.target.closest("[data-sug]");
    if (!c) return;
    e.preventDefault(); e.stopPropagation();
    var tag = styleSugShown[+c.dataset.sug], area = $("style");
    if (!tag) return;
    area.value = styleInsert(area.value, tag);
    area.dispatchEvent(new Event("input", { bubbles: true }));
    styleSugShown.splice(+c.dataset.sug, 1);
    paintStyleSug();
  });
  window.ruachSunoText = { tags: sugTags, insert: styleInsert, lyricTags: lyricTags, clean: cleanAnswer };   // for the checks

  // HERESY 1269 (Viktor 09.10.2026: «Шорткат на попап/fullscreen редактора Лирики — Alt+E (перебиваем шорткат браузера)»; «Если лирика
  // поверх всего, и применил Shift+Tab — схлопывание этого попапа и переносимся в сам фрейм попап»): Alt+E lifts the lyrics and puts them
  // back, in the Creator; Shift+Tab over the lifted lyrics puts them back into the form and lifts its frame, the cursor in the lyrics
  window.addEventListener("keydown", function (e) {
    if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.code === "KeyE" && document.body.dataset.tab === "create") {
      if (document.querySelector(".hd-back.is-on")) return;
      e.preventDefault(); e.stopImmediatePropagation();
      lyricsOver(!lyrOver);
      return;
    }
    if (e.key === "Tab" && e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && lyrOver) {
      if (document.querySelector(".hd-back.is-on, .tc-pop:not([hidden]), .find-bar:not([hidden])")) return;
      e.preventDefault(); e.stopImmediatePropagation();
      var area = $("lyrics"), at = area.selectionStart;
      lyricsOver(false);
      if (document.body.dataset.frame !== "compose") frameOver("compose");
      area.focus({ preventScroll: true });
      try { area.setSelectionRange(at, at); } catch (err) { /* a box without a cursor */ }
    }
  }, true);
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape" || !lyrOver) return;
    if (document.querySelector(".hd-back.is-on, .tc-pop:not([hidden]), .find-bar:not([hidden]), .hi-back:not([hidden])")) return;
    e.preventDefault();
    e.stopPropagation();
    lyricsOver(false);
  }, true);
  new MutationObserver(function () { if (lyrOver && document.body.dataset.tab !== "create") lyricsOver(false); }).observe(document.body, { attributes: true, attributeFilter: ["data-tab"] });
  // HERESY 1169 (Viktor 07.10.2026: «Давай лучше в попапе доделаем Музыканта. Тоже дадим ему две колонки»; the plan he called
  // GOOD: «Слева действия (скачать, сделать ещё, Огранщик, файлы, заметка), справа карта «как сделан», VAE, промпт. Во время
  // генерации остаётся на весь фрейм»): the take lifted over the room in two columns, what to do with it on the left (its
  // lyrics under the note), how it was made on the right; the score under both. The blocks move into the columns while the
  // frame is up and back where they stood when it goes down, so the room's card stays as it was; a run's chain keeps the
  // whole frame (the CSS lays the columns one under the other then, and hides the panels as .word-row's were)
  var TAKE_COLS = (function () {
    var body = $("takeBody"), words = body.querySelector(".word-row");
    return { body: body, words: words, tools: $("takeTools"), note: body.querySelector(".take-note"), meta: $("metaGrid"),
      decode: $("decodeSwitch"), sound: $("soundSwitch"), prompt: words.querySelector('[data-card-fold="prompt"]'),
      lyrics: words.querySelector('[data-card-fold="lyrics"]'), score: $("scorePanel"), cols: null };
  })();
  function takeColumns(on) {
    var t = TAKE_COLS;
    if (on && !t.cols) {
      var left = document.createElement("div"), right = document.createElement("div");
      t.cols = document.createElement("div");
      t.cols.className = "take-cols";
      left.className = "take-col take-col-do";
      right.className = "take-col take-col-made";
      // 08.10 (Viktor: «перенеси Score в правую колонку, Prompt переименуй в Style и перенеси в левую поверх Lyrics»)
      [t.tools, t.note, t.prompt, t.lyrics].forEach(function (n) { left.appendChild(n); });
      [t.meta, t.decode, t.sound, t.score].forEach(function (n) { right.appendChild(n); });
      t.cols.appendChild(left);
      t.cols.appendChild(right);
      t.body.appendChild(t.cols);
      t.words.classList.add("is-hidden");
    } else if (!on && t.cols) {
      t.body.appendChild(t.score);
      [t.tools, t.note, t.meta, t.decode, t.sound, t.words].forEach(function (n) { t.body.insertBefore(n, t.score); });
      t.words.appendChild(t.prompt);
      t.words.appendChild(t.lyrics);
      t.words.classList.remove("is-hidden");
      t.cols.remove();
      t.cols = null;
    }
  }
  window.ruachTakeColumns = function () { return !!TAKE_COLS.cols; };   // for the checks
  function frameOver(which) {
    if (!FRAMES[which] || document.body.dataset.tab !== "create") which = null;
    if ((document.body.dataset.frame || null) === which) return;
    if (which) document.body.dataset.frame = which; else delete document.body.dataset.frame;
    $("frameVeil").hidden = !which;
    all(".frame-big").forEach(function (b) {
      var up = b.dataset.frame === which;
      b.setAttribute("aria-pressed", up ? "true" : "false");
      b.setAttribute("aria-label", up ? "Back into the room" : "Over the room");
      b.dataset.tip = up ? "Back into the room (Esc)" : "This frame over the room, larger: Esc or a click beside it puts it back";
      if (window.HeresyIcons) b.innerHTML = window.HeresyIcons.ui(up ? "minimize" : "maximize");
    });
    if (which) $(FRAMES[which]).setAttribute("tabindex", "-1");   // the keys can stay with it (the player's clicks give them back)
    takeColumns(which === "take");
    window.dispatchEvent(new Event("resize"));   // the wave, the staff and the pictures measure their frame again
    placeLogDock();
  }
  // HERESY 1169 · 1240 (Viktor 08.10.2026: «В попапе фреймов серверный лог поверх кнопки синтеза. В этом режиме смести его влево. Так не будет закрывать ничего»): with a frame lifted the log stands at the left, as wide as the room before the frame's bottom row of controls allows (Generate's row starts at 779 px at 100 %, 401 at 125 % and 156 at 150 % of a 1920 screen); with less than 220 px there it rises above that row
  // HERESY 1301 (Viktor 10.10.2026: «Перемещение фрейма в другую сторону страницы, и запоминание позиции для определённой комнаты»):
  // each room its side of the dock, as chosen (yue2.logDockSide); the Artist left by default (1258), the others right
  function logDockSides() { try { return JSON.parse(recall("yue2.logDockSide") || "{}") || {}; } catch (e) { return {}; } }
  function logDockLeft() {
    var tab = document.body.dataset.tab || "create", side = logDockSides()[tab];
    return side ? side === "left" : tab === "artist";
  }
  if ($("logDockSide")) $("logDockSide").addEventListener("click", function () {
    var sides = logDockSides(), tab = document.body.dataset.tab || "create";
    sides[tab] = logDockLeft() ? "right" : "left";
    store("yue2.logDockSide", JSON.stringify(sides));
    placeLogDock();
  });
  function placeLogDock() {
    var d = $("logDock");
    if (!d) return;
    var f = document.body.dataset.frame, left = !!f || logDockLeft();
    d.classList.toggle("is-left", left);
    if (window.ruachLogView) window.ruachLogView();   // HERESY 1334: each room its view of the log   // HERESY 1258: «Серверный лог… в левую сторону» in the Artist; 1301: as each room was left
    var sb = $("logDockSide");
    if (sb) {                              // HERESY 1301: its arrow points where a click takes the dock
      var say = left ? "The log to the right side of the page, kept for this room" : "The log to the left side of the page, kept for this room";
      if (sb.dataset.side !== (left ? "left" : "right")) {
        sb.dataset.side = left ? "left" : "right";
        sb.innerHTML = window.HeresyIcons ? window.HeresyIcons.ui(left ? "to-right" : "to-left") : (left ? "→" : "←");
      }
      sb.dataset.tip = say;
      sb.setAttribute("aria-label", say);
    }
    d.style.maxWidth = "";
    d.style.bottom = "";
    if (!f) return;
    requestAnimationFrame(function () {
      var row = f === "compose" && $("generateBtn") ? $("generateBtn").parentElement : null;
      if (!row || !row.offsetParent || document.body.dataset.frame !== f) return;
      var kids = [].slice.call(row.children).filter(function (e) { return e.offsetParent; }), rr = row.getBoundingClientRect();
      if (rr.top >= innerHeight || rr.bottom <= 0) return;   // the row is scrolled away: the log keeps its foot
      var room = (kids[0] ? kids[0].getBoundingClientRect().left : rr.left) - 16 - 12;
      if (room >= 220) d.style.maxWidth = Math.min(420, Math.floor(room)) + "px";
      else d.style.bottom = Math.round(innerHeight - rr.top + 8) + "px";
    });
  }
  // HERESY 1169 · 1329 (Viktor 10.10.2026: «разреши по крайней стороне фрейма перетягивать его ширины с установленного бейс до макс
  // 1200px»): the dock's outer edge (the left one on the right, the right one on the left) drags its width from the base its state has
  // (folded, open, with the cards, the full height) up to 1200 px; kept in this browser (yue2.logDockW), a double click forgets it
  var DOCK_MAX = 1200;
  function dockBase(d) { var w = d.style.width; d.style.width = ""; var b = d.getBoundingClientRect().width; d.style.width = w; return b; }
  function dockWidth() {
    var d = $("logDock");
    if (!d) return;
    var want = +recall("yue2.logDockW") || 0;
    if (d.classList.contains("is-folded") || !want) { d.style.width = ""; return; }
    var base = dockBase(d), most = Math.min(DOCK_MAX, innerWidth - 32);
    d.style.width = want > base ? Math.round(Math.min(most, want)) + "px" : "";
  }
  if ($("logDockGrip")) (function () {
    var g = $("logDockGrip"), d = $("logDock"), from = null;
    g.addEventListener("pointerdown", function (e) {
      if (e.button !== 0) return;
      e.preventDefault();
      g.setPointerCapture(e.pointerId);
      from = { x: e.clientX, w: d.getBoundingClientRect().width, base: dockBase(d), left: d.classList.contains("is-left") };
      g.classList.add("is-on");
    });
    g.addEventListener("pointermove", function (e) {
      if (!from) return;
      var dx = (e.clientX - from.x) * (from.left ? 1 : -1), most = Math.min(DOCK_MAX, innerWidth - 32);
      var w = Math.max(from.base, Math.min(most, from.w + dx));
      d.style.width = Math.round(w) + "px";
    });
    var end = function () {
      if (!from) return;
      var w = d.getBoundingClientRect().width;
      store("yue2.logDockW", w > from.base + 1 ? String(Math.round(w)) : null);
      from = null;
      g.classList.remove("is-on");
    };
    g.addEventListener("pointerup", end);
    g.addEventListener("pointercancel", end);
    g.addEventListener("dblclick", function () { store("yue2.logDockW", null); d.style.width = ""; });
    new MutationObserver(function () { if (!from) dockWidth(); }).observe(d, { attributes: true, attributeFilter: ["class"] });
    window.addEventListener("resize", function () { if (!from) dockWidth(); });
    dockWidth();
  })();
  window.ruachDockWidth = dockWidth;                     // for the checks
  // HERESY 1169 · 1329 (Viktor 10.10.2026: «В баре кнопка TRAINER отцентри между лого и воркспейс селектором»): the Trainer's tab in the
  // middle between the logo's right edge and the workspace button's left one, wherever the logo stands centred in the bar
  function centerTrainer() {
    var side = $("tabsSide"), logo = document.querySelector(".topbar .brand-logo"), brand = document.querySelector(".topbar .brand"), ws = document.querySelector(".topbar .ws-current");
    if (!side || !logo || !ws || !brand) return;
    side.style.marginLeft = "";
    var lr = logo.getBoundingClientRect(), wr = ws.getBoundingClientRect(), sr = side.getBoundingClientRect();
    if (!lr.width || !wr.width || getComputedStyle(brand).position !== "absolute" || getComputedStyle(brand).display === "none") return;
    var lamp = $("engineLamp"), chip = lamp && lamp.closest(".engine-chip");   // HERESY 1687: the lamp by the logo: the Trainer between it and the workspace
    var from = chip && getComputedStyle(chip).position === "absolute" ? lamp.getBoundingClientRect().right : lr.right;
    var want = (from + wr.left) / 2 - sr.width / 2;
    if (want > sr.left + 1) side.style.marginLeft = Math.round(want - sr.left) + "px";
  }
  (function () {
    var soon = 0, again = function () { cancelAnimationFrame(soon); soon = requestAnimationFrame(centerTrainer); };
    if (window.ResizeObserver) { var ro = new ResizeObserver(again); ["tabs", "tabsSide"].forEach(function (id) { if ($(id)) ro.observe($(id)); }); var w = document.querySelector(".topbar .ws-current"); if (w) ro.observe(w); }
    window.addEventListener("resize", again);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(again);
    again();
  })();
  window.ruachCenterTrainer = centerTrainer;             // for the checks
  var logDockTimer = 0;
  window.addEventListener("resize", function () { if (!document.body.dataset.frame) return; clearTimeout(logDockTimer); logDockTimer = setTimeout(placeLogDock, 120); });
  placeLogDock();                                    // HERESY 1301: the room's side, and the button's arrow, from the start
  all(".frame-big").forEach(function (b) {
    b.addEventListener("click", function () { frameOver(document.body.dataset.frame === b.dataset.frame ? null : b.dataset.frame); });
  });
  all(".frame-swap").forEach(function (b) { b.addEventListener("click", function () { frameOver(b.dataset.frame); }); });
  $("frameVeil").addEventListener("click", function () { frameOver(null); });
  // Viktor: «И кликами на плеер чтобы не убегал фокус и чтобы оверлей не схлопывался… А по другим краям иже оверлея пусть
  // схлопывается»: the player sits over the veil, so its clicks never fold the frame; after one the keys go back to the frame
  $("playbar").addEventListener("pointerup", function (event) {
    var f = document.body.dataset.frame && $(FRAMES[document.body.dataset.frame]);
    if (!f || (event.target.closest && event.target.closest("input, select, textarea"))) return;
    setTimeout(function () { if (!f.contains(document.activeElement)) f.focus({ preventScroll: true }); }, 0);
  });
  // HERESY 1169 (Viktor 07.10.2026: «к каждой комнате по её порядку можно прикрутить Ctrl+1, etc.»): Ctrl+1…9 are the
  // browser's own tabs and never reach a page, so here Ctrl+Alt with the digit (Ctrl+digit comes with the desktop app). The
  // places, by his plan (the DAW to live inside the Refiner): «Творец 1, Писатель 2, Огранщик 3, Художник 4, Библиотекарь 5,
  // EMPTY 6, Тренер 7, Экспорт в Local DAW 8, Движок 9». 4 waits for the Artist room, 6 for a room to come. Each presses
  // its own button (leaving the Engine asks as it does); read by the key's code, so in any layout and from the number pad
  var ROOM_KEYS = { 1: "create", 2: "write", 3: "post", 4: "artist", 5: "collection", 7: "train" };   // HERESY 1255: 4 the Artist
  window.addEventListener("keydown", function (event) {
    if (!event.ctrlKey || !event.altKey || event.shiftKey || event.metaKey) return;
    var m = /^(?:Digit|Numpad)([1-9])$/.exec(event.code || "");
    if (!m || document.querySelector(".hd-back:not(.is-leaving)")) return;
    event.preventDefault();
    var n = +m[1], tab = ROOM_KEYS[n], btn = tab && document.querySelector('.topbar [data-tab="' + tab + '"]');
    if (btn) btn.click();
    else if (n === 8) $("dawOpen").click();
    else if (n === 9) $("engineToggle").click();
  }, true);
  // HERESY 1169 (Viktor 07.10.2026: «Давай шорткат Shift+Tab блокируем для обратного хождения по полям, а именно для
  // переключения между композером и Исполнителем. И когда фрейм опущен, из обычной страницы… эта комбинация подымает оверлей во
  // фрейме композера… В общем, всегда в композере. Это главная кузня»): in the Creator, Shift+Tab is the frames' key, not the
  // fields' way back: a frame lifted turns to the other one, none lifted lifts the form's. Coming back into a frame, the cursor
  // stands where it stood; a dialog, a menu or the find bar keep their own Shift+Tab
  var frameFocus = {};
  window.addEventListener("keydown", function (event) {
    if (event.key !== "Tab" || !event.shiftKey || event.ctrlKey || event.altKey || event.metaKey || document.body.dataset.tab !== "create") return;
    var over = document.querySelectorAll(".hd-back, .menu-pop:not(.is-hidden), .hm-menu, .hz-view, .ds-back, .hi-back, .cmp-back, .hg-back, .dw-back, .coll-sheet, .find-bar, .tc-pop");
    if (Array.prototype.some.call(over, function (e) { return e.getClientRects().length > 0; })) return;
    event.preventDefault();
    var now = document.body.dataset.frame || null, to = now === "compose" ? "take" : "compose", here = document.activeElement;
    Object.keys(FRAMES).forEach(function (k) { if (here && here !== document.body && $(FRAMES[k]).contains(here) && here !== $(FRAMES[k])) frameFocus[k] = here; });
    frameOver(to);
    var keep = frameFocus[to], view = $(FRAMES[to]);
    if (keep && document.contains(keep) && view.contains(keep)) keep.focus({ preventScroll: true });
    else view.focus({ preventScroll: true });
  }, true);
  // Esc puts the frame back, unless a menu, a dialog or the staff's full screen is open over it: those close first, by their
  // own Esc (this runs before them, while they are still there)
  // HERESY 1169 (Viktor 07.10.2026: «Для F5 добавляем блокер с диалогом и чреватостью, хотя кеш браузера у меня держит
  // изменения в текстах. Можно предложить автоматическое сохранение композера в комнату Писателя»): the reload keys ask first,
  // saying what a reload takes and what it keeps, and with a song in the form they offer to keep it in the Writer before
  // (the document in hand gets a version, or a new one is made); Ctrl+F5 reloads at once; in the Librarian F5 reads the
  // library again, as before
  var reloading = false;
  // HERESY 1269 (Viktor 09.10.2026: «Блокируем браузерные Ctrl+S и Ctrl+Shift+S. Оба шортката сохраняют все изменения в текущей сессии.
  // Если нет правок в комнатах — при F5 не выводим диалоговое окно»): what is typed in a room since the page came (or since Ctrl+S) makes
  // the reload keys ask; with nothing typed the page reloads at once. Ctrl+S and Ctrl+Shift+S keep everything now: the song in the form,
  // the Writer's open document, the page's settings on disk; never the browser's Save page
  var edited = false;
  document.addEventListener("input", function (e) {
    var t = e.target;
    if (!e.isTrusted || !t || !t.matches || !t.matches("textarea, input:not([type=search]):not([type=file])")) return;
    if (t.closest("#view-compose, #view-take, #view-write, #view-post, #view-artist, #lyrOver")) edited = true;
  }, true);
  function saveAll() {
    saveDraft();
    keepForm("save");                                  // HERESY 1596
    if (window.HeresySettings && window.HeresySettings.flush) window.HeresySettings.flush();
    var w = window.HeresyWriter && window.HeresyWriter.flush ? window.HeresyWriter.flush() : null;
    return Promise.resolve(w).then(function () { edited = false; toast("Saved: the song in the form, the Writer's open document, the settings"); },
      function (e) { toast("Not everything was saved: " + ((e && e.message) || e), "bad"); });
  }
  window.ruachSaveAll = saveAll;   // for the checks
  // HERESY 1596 (Viktor 19.10.2026: «Испортил, применил, F5, и ... проебал основу»): the form kept as a version, its knobs with it
  var lastKept = "";
  function formParams() {
    try { var r = buildRequest(false, false, true); ["title", "style", "lyrics", "abc", "semantic_tokens", "parent"].forEach(function (k) { delete r[k]; }); return r; }
    catch (e) { return {}; }
  }
  function keepForm(why) {
    if (!window.HeresyVersions) return null;
    var words = { title: songTitle(), style: $("style").value, lyrics: $("lyrics").value, abc: $("abc").value }, params = formParams();
    if (!(words.style.trim() || words.lyrics.trim() || words.abc.trim())) return null;
    var print = JSON.stringify([words, params]);
    if (print === lastKept) return null;
    lastKept = print;
    return window.HeresyVersions.keep(words, [], currentCot(), why, params);
  }
  window.ruachKeepForm = keepForm;
  window.ruachEdited = function (v) { if (v !== undefined) edited = !!v; return edited; };   // read, and set by the checks
  window.addEventListener("keydown", function (event) {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.code !== "KeyS") return;
    event.preventDefault(); event.stopImmediatePropagation();
    saveAll();
  }, true);
  window.addEventListener("keydown", function (event) {
    // (Viktor: «Помимо F5 можно ещё Ctrl+Shift+R»): F5 and Shift+F5, Ctrl+R and Ctrl+Shift+R; Ctrl+F5 is the reload at once
    var f5 = event.key === "F5" && !event.ctrlKey && !event.metaKey && !event.altKey;
    var ctrlR = (event.ctrlKey || event.metaKey) && !event.altKey && event.code === "KeyR";
    if ((!f5 && !ctrlR) || (f5 && !event.shiftKey && document.body.dataset.tab === "collection") || reloading) return;
    event.preventDefault();
    if (document.querySelector(".hd-back:not(.is-leaving)")) return;   // a dialog is open already (this one too)
    if (!edited) { reloading = true; saveDraft(); location.reload(); return; }   // HERESY 1269: nothing typed, nothing to ask
    var song = !!($("style").value.trim() || $("lyrics").value.trim());
    window.HeresyDialog.confirm("Reload the page?\n\n" +
      "It takes: the boxes' undo history, a lifted frame, the music playing, a writer's answer still on its way, an upload under way.\n\n" +
      "It keeps: the song in the form (its words and its knobs), a run under way (it comes back with its clock), the library, the Writer's notebook." +
      (song ? "\n\nSave to the Writer keeps this song there as well before the reload: a new version of the document in hand, or a document of its own." : "") +
      "\n\nCtrl+F5 reloads at once.",
      { ok: song ? "Save to the Writer, then reload" : "Reload", alt: song ? "Reload" : "", cancel: "Stay" }).then(function (answer) {
      if (!answer) return;
      reloading = true;
      var save = answer === true && song && window.HeresyWriter;
      Promise.resolve(save ? window.HeresyWriter.fromCreate(false) : true).then(function (kept) {
        if (save && !kept) { reloading = false; return; }          // not saved (the toast says why): the page stays
        saveDraft();
        location.reload();
      });
    });
  }, true);
  // HERESY 1168 (Viktor: «ты говорил, что перехватишь F5 в Библиотеке»): F5 in the Librarian reads the library again and
  // leaves the page as it is, the music playing on; Ctrl+F5 or Shift+F5 still reload the page
  window.addEventListener("keydown", function (event) {
    if (event.key !== "F5" || event.ctrlKey || event.shiftKey || event.metaKey || event.altKey || document.body.dataset.tab !== "collection") return;
    event.preventDefault();
    if (window.HeresyCollection) window.HeresyCollection.reload();
    refreshLibrary().catch(function () {});
    toast("The library read again (F5 here keeps the page and the music); Ctrl+F5 reloads the page");
  }, true);
  window.addEventListener("keydown", function (event) {
    if (event.key !== "Escape" || !document.body.dataset.frame) return;
    // (HERESY 1168: the find bar of a box and the tags offered under a «[» close by their own Esc too, the frame stays)
    var over = document.querySelectorAll(".menu-pop:not(.is-hidden), .hm-menu, .hz-view, .hd-back, .ds-back, .hi-back, .cmp-back, .hg-back, .dw-back, .coll-sheet, .find-bar, .tc-pop");
    if (Array.prototype.some.call(over, function (e) { return e.getClientRects().length > 0; })) return;   // some wait [hidden]
    frameOver(null);
  }, true);

  buildKnobs();
  syncShape();
  paintOutputDefaults();
  paintSliders();
  paintLibrary();
  paintEngine();
  queueComfort();   // HERESY 1006
  setTab(recall(TAB_KEY) || "create");   // HERESY 1014
  boot();
})();


// HERESY 1687 (Viktor 21.10.2026: «Снизу 4 пиксела такая же, но жирнее. При перемещении мышью бегать по именам комнат перекатами… Активную комнату
// полужирным, неактивные обычным начертанием»): one line under each row of rooms: under the room in hand at rest, rolling to the room under the pointer
// and back when the pointer leaves; each name keeps its semibold width (data-text), so the bold one moving shifts nothing
(function () {
  "use strict";
  function glide(nav) {
    if (!nav || nav.querySelector(".tab-glide")) return;
    var line = document.createElement("span"), over = null;
    line.className = "tab-glide";
    line.setAttribute("aria-hidden", "true");
    nav.appendChild(line);
    function rooms() { return Array.prototype.slice.call(nav.querySelectorAll("button[data-tab]")); }
    function mark() { rooms().forEach(function (b) { var t = b.textContent.trim(); if (b.dataset.text !== t) b.dataset.text = t; }); }
    function place() {
      var b = over || nav.querySelector("button[data-tab].is-active");
      if (!b || !b.offsetWidth) { line.style.opacity = "0"; return; }
      line.style.opacity = "1";
      line.style.width = b.offsetWidth + "px";
      line.style.transform = "translateX(" + b.offsetLeft + "px)";
      line.classList.toggle("is-over", !!over && !over.classList.contains("is-active"));
    }
    nav.addEventListener("mouseover", function (e) {
      var b = e.target.closest && e.target.closest("button[data-tab]");
      if (b && b !== over && !b.disabled) { over = b; place(); }
    });
    nav.addEventListener("mouseleave", function () { over = null; place(); });
    new MutationObserver(function () { mark(); place(); }).observe(nav, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["class", "hidden"] });
    window.addEventListener("resize", place);
    window.addEventListener("ruach-lang", function () { mark(); place(); });
    window.addEventListener("ruach-fonts", place);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(place);
    mark(); place();
    requestAnimationFrame(function () { requestAnimationFrame(function () { line.classList.add("is-ready"); }); });   // no roll in from the left at load
  }
  glide(document.getElementById("tabs"));
  glide(document.getElementById("tabsSide"));
})();
