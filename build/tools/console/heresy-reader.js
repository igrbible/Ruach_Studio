// HERESY 2241 (Viktor 07.11.2026: «До ума доводи нашу TTS комнату. Дизайн в соответствие с идеологией всей Студии»): the Reader, the room of the
// spoken word. A long text read in one steady voice (narration, by sentence or verse) or a dialog written «Name: words» with a voice for each speaker;
// inline tags read by default in a dialog and taken out of a narration (his marks on the ten-voice probe); a tag palette from the engine's own list;
// voices by timbre group (each read by its centre voice), made-up voices and one's own (the upload under a red warning: cloning a voice without its
// owner's consent is a crime and the user's own responsibility). The run waits for a card through the lab's roles (Engine → GPUs), its progress in
// the strip above the player, its take in the Library with the text and the settings in its note, never for training. The room brings its own tab,
// view, log view and style (window.RuachRooms tells app.js), so a page without this file is whole; public with the room since 2.0.7 (HERESY 2374).
// HERESY 2263 (Viktor 09.11.2026: «переводи Драму Чтеца на audio.cpp»): an engine with tiers gets the Quant select (Auto speed first by default,
// Auto quality first, or a named quant) and a line under it saying which quant reads where now and how long this text would take (GET
// /reader/tier, asked again as the text, the card or the quant changes); each run's card names its quant, its measured speed and the engine's
// credit («Built with Fish Audio»; HERESY 2275: only where a result is, the run's result line and the take's editor, and the take's note, never the form).
// HERESY 2270: the LCV glyph map: «Read LCV letters by the glyph map» beside the stresses (sent with the run and with Check), and its editor
// under the dictionary: the author's table read only (lcvr2tts.map.tsv, his by hand), a copy of one's own saved in user/reader/glyphs.map.tsv
// and said so, Back to the author's table to let the copy go; a broken rule refused by its line.
// HERESY 2376 (Viktor 11.11.2026: «Я ещё должен мой кастомный LCV словарь замен поправить. Дай мне его для редактирования прямо в Студии»): the
// glyph map's editor is a table (kind, what, with, note; a comment row as it is), searched, a rule added or taken out, checked by the lab line by
// line as it is typed, a line tried by the map as it stands; Save writes the table it read (his where his is applied, a user's copy elsewhere),
// the old one kept by the lab with its time, Undo puts the newest kept back; «As text» keeps the plain editor. The transcript's cleanup asks
// how: every word (texts, Scripture) or as in proofreading (streams: filler words and repeats out). 2374: an engine not set up here (its model,
// audio.cpp's server, its licence files) says what is missing and fetches it through the Engine's tier; the Pro tag only beside a private engine.
// HERESY 2269: From a recording: a lecture or a stream uploaded as it is, heard by Whisper in the lab, cleaned up by the Writer's model
// (HeresyWriterAsk, the hosts of Engine → Writer) into a script with speakers and the engine's own tags, kept beside the transcript, and put
// into the text (a dialog when two names or more speak) for the user to read over before the Reader reads it.
// HERESY 2266: Hear each piece (Whisper on the processor, a piece far off read again) in the settings, on by default; each run's card says what
// the ear found and the take's loudness; the take's editor marks a piece Whisper heard off its words, its words as heard in the tip.
// HERESY 2255–2257 (Viktor 08.11.2026: «гони Драму в комнату»; «правка ударения прямо из дубля, чтобы не регенерить снова полный»): the open engine's
// licence and first-run word under the engine; the language and the stress pass (Check shows what an engine would read, the homographs left to
// pick in place); the user's stress dictionary of a language, edited here and over Zaliznyak; an engine's style where it has one; a finished take
// fixed piece by piece (a word's stressed vowel picked, the piece read again, its versions and the history with Undo), the take joined anew.
(function () {
  "use strict";
  var E = (window.RuachReaderWords || { en: function (id) { return id; } }).en;
  var LANG_CODES = ["ru", "uk", "be", "el", "he", "en", "es", "it", "fr", "pt", "de", "ja", "zh"];
  var st = { engines: [], voices: [], groups: [], sets: {}, design: null, cards: null, runs: [], timer: 0, absent: false, loaded: false, sending: false, watch: {}, audio: null,
    dict: null, fix: null, fixSel: -1, fixTimer: 0, fixPlay: null,
    mode: recall("yue2.readerMode") === "dialog" ? "dialog" : "narration", cast: json(recall("yue2.readerCast"), {}) };

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function recall(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function keep(k, v) { try { if (v == null || v === "") localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* a private window */ } }
  function json(s, d) { try { var v = JSON.parse(s); return v && typeof v === "object" ? v : d; } catch (e) { return d; } }
  function tr(s) { return window.RuachI18n ? window.RuachI18n.t(s) : s; }
  function toast(t, kind) { if (window.HeresyToast) window.HeresyToast(tr(t), kind || ""); }
  function fill(id, parts) { var s = E(id); Object.keys(parts).forEach(function (k) { s = s.split("{" + k + "}").join(String(parts[k])); }); return s; }
  // HERESY 2566: a key's words in the page's language with its parts put in after, as they are (a word heard, a tag: never looked up in a catalog)
  function tw(id, parts) { var s = tr(E(id)); Object.keys(parts).forEach(function (k) { s = s.split("{" + k + "}").join(String(parts[k])); }); return s; }
  function api(path, body) {
    var opt = body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
    return fetch("/lab" + path, opt).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (b) {
        if (!r.ok && r.status !== 202) { var e = new Error(b.error || ("HTTP " + r.status)); e.status = r.status; throw e; }
        return b;
      });
    });
  }
  function live(r) { return r && (r.status === "queued" || r.status === "running"); }
  // HERESY 2434 (Viktor 12.11.2026: «Виспер нужно опцией в Чтеце… или постпроцессингом того же трека»): a finished take heard by Whisper on the
  // processor, its audio untouched; the letters off and the words flagged go into the take's note and beside it (lab/reader.py check)
  var checking = {};
  function checkSaid(c) {
    if (!c || c.cer == null) return fill("reader.wcheck.failed", { 0: (c && c.error) || "" });
    var pct = (100 * c.cer).toFixed(1);
    return c.flagged_n ? fill("reader.wcheck.flagged", { 0: pct, "#1": c.flagged_n }) : fill("reader.wcheck.clean", { 0: pct });
  }
  function checkHtml(c) {
    return '<span class="' + (c.cer == null || c.flagged_n ? "rd-cer" : "") + '"' + (c.error ? ' data-tip="' + esc(c.error) + '"' : "") + ">" + esc(checkSaid(c)) + "</span>";
  }
  function checkTake(take) {
    if (checking[take]) return Promise.resolve(null);
    checking[take] = true;
    if ($("rdRuns")) poll(true);
    toast(E("reader.wcheck.running"));
    var look = function () {
      return api("/reader/check?take=" + encodeURIComponent(take)).then(function (d) {
        // a check just done may answer from its job a moment before its file (no result in it yet): asked again
        if (d.status === "running" || d.status === "queued" || (d.status === "done" && d.checked == null)) return new Promise(function (ok) { setTimeout(ok, 2500); }).then(look);
        return d;
      });
    };
    return api("/reader/check", { take: take }).then(look).then(function (d) {
      delete checking[take];
      toast(checkSaid(d), d.cer == null ? "bad" : d.flagged_n ? "warn" : "");
      if ($("rdRuns")) poll(true);
      if (window.HeresyCollection && window.HeresyCollection.reload) window.HeresyCollection.reload();
      return d;
    }, function (e) {
      delete checking[take];
      toast(fill("reader.wcheck.failed", { 0: e.message }), "bad");
      if ($("rdRuns")) poll(true);
      return null;
    });
  }
  window.RuachReaderCheck = checkTake;
  function engine() { var id = $("rdEngine") ? $("rdEngine").value : ""; return st.engines.filter(function (e) { return e.id === id; })[0] || st.engines[0] || null; }

  // ---------------------------------------------------------------- the room's style, its own (nothing of it in a page without this file)
  var STYLE = [
    ".reader-col { display: flex; flex-direction: column; gap: 12px; padding: 18px 22px 24px; overflow: auto; min-width: 0; grid-column: 1 / span 2; }",
    "#view-read [hidden] { display: none !important; }",
    "#tabRead .rd-tab-ico { display: none; width: 17px; height: 17px; }",
    // under 1500 px the tab is its microphone alone, and the bold word app.js reserves beside it (::after, data-text) goes too: the bar stays one row
    "@media (max-width: 1500px) { #tabRead { padding-left: 8px; padding-right: 8px; } #tabRead::after { content: none; } #tabRead .rd-tab-word { display: none; } #tabRead .rd-tab-ico { display: block; } }",
    // under 1150 px (where the bar holds only the Studio's own rooms in one row) the room is a row of ☰ More
    "#rdMoreRoom { display: none !important; }",
    "#rdMoreRoom svg { width: 15px; height: 15px; flex: none; }",
    "@media (max-width: 1150px) { #tabRead { display: none !important; } #rdMoreRoom { display: flex !important; } }",
    // HERESY 2401: the frame. The form's three cards and the runs beside them: from 1600 px the lectern beside the voice and the engine, the runs a
    // third column (his 2K and 4K: everything in sight, nothing under the fold); below, the cards one under another beside the runs; under 1180 px
    // a single column
    ".rd-cols { display: grid; grid-template-columns: minmax(0, 1fr) minmax(320px, 400px); gap: 18px; align-items: start; }",
    // HERESY 2560: the form's cards; from 1600 px the lectern and, beside it, the voice and the engine in a column of their own
    ".rd-form-body { display: flex; flex-direction: column; gap: 12px; min-width: 0; }", ".rd-form-side { display: contents; }",
    "@media (min-width: 1600px) { .rd-cols { grid-template-columns: minmax(0, 2.15fr) minmax(360px, 1fr); } .rd-form-body { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); align-items: start; }" +
      " .rd-form-side { display: flex; flex-direction: column; gap: 12px; min-width: 0; } .rd-own, .rd-design { grid-column: 1 / -1; } }",
    // HERESY 2560 (the UIX audit of 13.11.2026, items 49 and 52): the room in the window, as the Musician's. The form's cards scroll in their own box and the go bar
    // stands under it, never over a card (it lay over the lectern's tools and the quants); the runs scroll in theirs; the room itself no longer scrolls (its bar and the
    // runs' stood side by side). The lectern's page takes the height left, never under eight lines. A window under 1181 px wide or 700 px high scrolls as before
    "@media (min-width: 1181px) and (min-height: 700px) { .reader-col { overflow: hidden; } .rd-cols { flex: 1 1 auto; min-height: 0; align-items: stretch; } .rd-cols > .rd-form { min-height: 0; }" +
      " .rd-form-body { flex: 1 1 auto; min-height: 0; overflow: auto; padding-inline-end: 4px; } .rd-go { position: static; flex: none; } .rd-side { position: static; max-height: none; min-height: 0; overflow: auto; } }",
    "@media (min-width: 1600px) and (min-height: 700px) { .rd-form-body { grid-template-rows: 100%; } .rd-form-body > .rd-lect { align-self: stretch; min-height: 0; overflow: auto; }" +
      " .rd-form-side { align-self: stretch; min-height: 0; overflow: auto; padding-inline-end: 4px; } .rd-lect > .rd-page { flex: 1 1 auto; display: flex; flex-direction: column; min-height: 0; }" +
      " .rd-lect .rd-page .rd-text { flex: 1 1 auto; min-height: calc(var(--rd-lh) * 6 + 24px); } }",
    "@media (min-width: 2300px) { .rd-cols { grid-template-columns: minmax(0, 2.3fr) minmax(420px, 1fr); } }",
    "@media (max-width: 1180px) { .rd-cols { grid-template-columns: 1fr; } }",
    ".rd-card { gap: 12px; }",
    ".rd-card-head { display: flex; align-items: baseline; gap: 10px; padding: 0 2px 9px; border-bottom: 1px solid var(--line-a); }",
    ".rd-card-head > .label { margin: 0; flex: 1 1 auto; }",
    ".rd-count, .rd-dur { font-size: 11px; color: var(--dim); white-space: nowrap; }",
    ".rd-dur:empty { display: none; }",
    ".rd-sr { position: absolute !important; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }",
    // the lectern: a reader's page, ruled, its margin in the accent; the words in the room's face at a reading size (his letters with their
    // acutes and his Ѓ Ђ Љ need the face the rooms use, so the heresy is the page, not the font)
    ".rd-page { position: relative; margin: 0; }",
    ".rd-page .rd-text { --rd-lh: 27px; min-height: calc(var(--rd-lh) * 14 + 24px); font-size: 15.5px; line-height: var(--rd-lh); padding: 12px 18px 12px 26px; resize: vertical;" +
      " background-color: color-mix(in srgb, var(--ground) 82%, var(--panel)); background-image: repeating-linear-gradient(to bottom, transparent 0, transparent calc(var(--rd-lh) - 1px)," +
      " color-mix(in srgb, var(--line-a) 70%, transparent) calc(var(--rd-lh) - 1px), color-mix(in srgb, var(--line-a) 70%, transparent) var(--rd-lh));" +
      " background-position: 0 12px; background-attachment: local; border-inline-start: 3px solid color-mix(in srgb, var(--amber) 70%, transparent); }",
    ".rd-page .rd-text:focus { border-inline-start-color: var(--amber); }",
    "[dir=rtl] .rd-page .rd-text { padding: 12px 26px 12px 18px; }",
    "@media (min-width: 1600px) { .rd-page .rd-text { min-height: calc(var(--rd-lh) * 18 + 24px); } }",
    "@media (min-width: 2300px) { .rd-page .rd-text { min-height: calc(var(--rd-lh) * 26 + 24px); } }",
    ".rd-tools { padding-top: 2px; }",
    // a card's head names it, so its first field's own caption goes (the engine's keeps its room, so «Reads on» stays level beside it)
    ".rd-vox > #rdVoiceBox > .label { display: none; }",
    ".rd-mach > .rd-row:nth-child(2) > .field:first-child > .label { visibility: hidden; }",
    // the engine's licence and first-run words: three lines, the rest a click away (it was a wall of grey under the engine)
    ".rd-eng-note { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; line-clamp: 3; overflow: hidden; cursor: pointer; }",
    ".rd-eng-note.is-open { display: block; }",
    // the quants in two columns, not six rows
    // HERESY 2562 (the UIX audit, item 47): the quant a picker, as the voice and the card (its six long names were cut in two columns); its grade's colour on its face
    "#rdTierBox > .field { flex: 1 1 100%; }",
    // the go bar: the title and Read, as the Musician's Generate
    ".rd-go { position: sticky; bottom: 0; z-index: 3; display: flex; align-items: flex-end; gap: 10px; flex-wrap: wrap; padding: 10px 14px; border-radius: var(--r-lg);" +
      " background: color-mix(in srgb, var(--panel) 70%, var(--ground)); border: 1px solid var(--line-soft); box-shadow: 0 -10px 24px -18px var(--shadow-lg); }",
    ".rd-go > .field { flex: 1 1 260px; margin: 0; }",
    ".rd-go-btn { display: inline-flex; align-items: center; gap: 8px; min-width: 10em; justify-content: center; }",
    ".rd-go-btn svg { width: 17px; height: 17px; }",
    // the breath under the room's name: still while nothing reads, breathing while a run reads
    ".rd-head { position: relative; }",
    ".rd-breath { flex: 1 1 0; min-width: 120px; max-width: 900px; height: 30px; align-self: center; margin-inline-start: 14px; opacity: .7; }",
    // HERESY 2560 (the UIX audit, item 44): the room's words in the (i) by its name, the head one row as the Librarian's
    ".rd-head { align-items: center; }", ".rd-head > h2 .info { vertical-align: 1px; }",
    ".rd-breath svg { width: 100%; height: 100%; display: block; overflow: visible; }",
    ".rd-breath-env { fill: color-mix(in srgb, var(--amber) 26%, transparent); stroke: color-mix(in srgb, var(--amber) 85%, transparent); stroke-width: .6; vector-effect: non-scaling-stroke; transform-origin: 50% 50%; transform: scaleY(.38); transition: transform .8s ease; }",
    ".rd-breath-axis { stroke: color-mix(in srgb, var(--amber) 40%, transparent); stroke-width: 1; vector-effect: non-scaling-stroke; }",
    ".rd-breath.is-live { opacity: .95; }",
    ".rd-breath.is-live .rd-breath-env { animation: rdBreathe 3.6s ease-in-out infinite; }",
    "@keyframes rdBreathe { 0%, 100% { transform: scaleY(.45); } 45% { transform: scaleY(1); } 60% { transform: scaleY(.92); } }",
    "@media (max-width: 1300px) { .rd-breath { display: none; } }",
    // the runs' head: how many read and failed, and whether the failed ones are shown
    ".rd-side { position: sticky; top: 0; max-height: calc(100vh - var(--playbar-h, 124px) - 120px); overflow: auto; padding-inline-end: 4px; }",
    ".rd-side-head { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; position: sticky; top: 0; z-index: 2; background: var(--ground); padding: 2px 0 8px; }",
    ".rd-side-head .rd-h3 { flex: 1 1 auto; }",
    ".rd-failed { font-size: 12px; margin: 0; }",
    ".rd-run { border-inline-start: 3px solid color-mix(in srgb, var(--patina) 55%, transparent); }",
    ".rd-run[data-status=failed], .rd-run[data-status=stopped] { border-inline-start-color: var(--bad-line); }",
    ".rd-run.is-shut[data-status=failed], .rd-run.is-shut[data-status=stopped] { opacity: .72; }",
    ".rd-run[data-status=running], .rd-run[data-status=queued] { border-inline-start-color: var(--patina); }",
    ".rd-form, .rd-side { display: flex; flex-direction: column; gap: 12px; min-width: 0; }",
    ".rd-row { display: flex; gap: 12px; flex-wrap: wrap; align-items: flex-start; }",
    ".rd-row > .field { flex: 1 1 220px; min-width: 0; }",
    ".rd-text { min-height: 220px; font-size: 14px; }",
    ".rd-voice { display: flex; gap: 8px; align-items: flex-start; }",
    ".rd-voice > .hc-box, .rd-voice > select { flex: 1 1 auto; min-width: 0; }",
    ".rd-cast { display: flex; flex-direction: column; gap: 8px; }",
    ".rd-spk { display: grid; grid-template-columns: minmax(80px, 170px) minmax(0, 1fr) auto; gap: 8px; align-items: center; }",
    ".rd-spk-name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }",
    ".rd-spk-v { min-width: 0; }",
    ".rd-none { color: var(--dim); font-size: 12.5px; }",
    ".rd-box { border: 1px solid var(--line-a); border-radius: var(--r-md); padding: 8px 12px; }",
    ".rd-box > summary { cursor: pointer; font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }",
    ".rd-pal-g { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-top: 10px; }",
    ".rd-pal-g > b { flex: 0 0 100%; font-weight: 500; font-size: 10.5px; letter-spacing: .1em; text-transform: uppercase; color: var(--dim); }",
    ".rd-tag { font-family: var(--mono); font-size: 11.5px; white-space: nowrap; }",
    ".rd-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 10px 12px; margin-top: 10px; }",
    ".rd-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }",
    ".rd-actions #rdGo { min-width: 9em; }",
    ".rd-say { color: var(--dim); font-size: 12px; }",
    ".rd-h3 { margin: 0; font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); font-weight: 500; }",
    ".rd-runs { display: flex; flex-direction: column; gap: 10px; }",
    ".rd-run { border: 1px solid var(--line-a); border-radius: var(--r-md); padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; }",
    ".rd-run-head { display: flex; gap: 8px; align-items: center; min-width: 0; }",
    // HERESY 2381 (Viktor 11.11.2026: «карточки ужми до единой разумной высоты и дай им расхлопываться в тот полный рост, что сейчас, и схлопывание
    // других как в аккордеоне»): every card one height, its title, state and first lines in sight, the rest under a fade; a click (or Enter or Space
    // on its head) opens one to its whole height and shuts the one open before; the open one's head shuts it again. Logical sides only: Hebrew mirrors it
    ".rd-run { min-height: 104px; }",   // an open card never shorter than a shut one
    // HERESY 2561 (the UIX audit, item 45): a shut card shows its head and its first two lines whole, each on one line ending in an ellipsis; the rest waits for the
    // click that opens it (a fixed 104 px with a fade cut its third line in half on five cards of six)
    ".rd-run.is-shut { overflow: hidden; position: relative; cursor: pointer; }",
    ".rd-run.is-shut .rd-run-meta, .rd-run.is-shut .rd-run-err { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; overflow-wrap: normal; }",
    ".rd-run.is-shut .rd-run-meta ~ .rd-run-meta ~ .rd-run-meta, .rd-run.is-shut .rd-run-meta ~ .rd-run-meta ~ .rd-run-err, .rd-run.is-shut .rd-run-acts { display: none; }",
    ".rd-run.is-shut:hover { border-color: var(--muted); }",
    ".rd-run-head { cursor: pointer; border-radius: 4px; }",
    ".rd-run-chev { flex: none; color: var(--dim); transition: transform .15s ease; display: inline-flex; }",   // HERESY 2514: the ▾ drawn
    ".rd-run-chev .ui-ico { width: 14px; height: 14px; }",
    ".rd-run.is-open .rd-run-chev { transform: rotate(180deg); }",
    ".rd-run-head:focus-visible { outline: 2px solid var(--amber); outline-offset: 2px; }",
    ".rd-run-title { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }",
    ".rd-chip { font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase; padding: 1px 8px; border-radius: 999px; border: 1px solid var(--line-a); color: var(--muted); white-space: nowrap; }",
    ".rd-chip.st-running, .rd-chip.st-queued { color: var(--patina); border-color: var(--patina-dim); }",
    ".rd-chip.st-failed { color: var(--bad-ink); border-color: var(--bad-line); }",
    ".rd-run-meta { font-size: 11.5px; color: var(--dim); overflow-wrap: anywhere; }",
    ".rd-bar { height: 4px; border-radius: 2px; background: var(--line-a); overflow: hidden; }",
    ".rd-bar > i { display: block; height: 100%; width: 0; background: var(--patina); transition: width .4s ease; }",
    ".rd-run-err { color: var(--bad-ink); font-size: 12px; overflow-wrap: anywhere; }",
    ".rd-run-acts { display: flex; gap: 4px; flex-wrap: wrap; align-items: center; }",
    // HERESY 2511, 2514 (Viktor 12.11.2026: «все текстовые кнопки по максимуму переведи в SVG… Это закон UIX нашей студии»): the room's acts as icons,
    // each with its words as its aria-label and its tip; words only on Read and the main act of a window
    ".rd-ib { padding: 0 6px; min-width: 28px; height: 26px; display: inline-flex; align-items: center; justify-content: center; gap: 4px; flex: none; }",
    ".rd-ib .ui-ico { width: 15px; height: 15px; }",
    ".rd-ib[aria-pressed=true] { color: var(--amber); border-color: var(--amber); }",
    ".rd-ib.is-spin .ui-ico { animation: rd-spin 1.2s linear infinite; }",
    "@keyframes rd-spin { to { transform: rotate(360deg); } }",
    ".rd-run-play { height: 22px; min-width: 24px; padding: 0 4px; }",
    ".rd-card-head .rd-head-ico { display: inline-flex; gap: 4px; align-self: center; }",
    ".rd-reread .ui-ico { width: 15px; height: 15px; }",
    ".rd-own { display: flex; flex-direction: column; gap: 10px; border: 1px solid var(--bad-line); border-radius: var(--r-md); padding: 12px 14px; }",
    ".rd-own h3 { margin: 0; font: 500 15px/1.4 var(--heading); }",
    // HERESY 2455: the voice builder
    ".rd-design { display: flex; flex-direction: column; gap: 10px; border: 1px solid var(--line-a); border-radius: var(--r-md); padding: 12px 14px; }",
    ".rd-design h3 { margin: 0; font: 500 15px/1.4 var(--heading); }",
    ".rd-design-note { margin: 0; color: var(--muted); font-size: 12.5px; line-height: 1.5; }",
    ".rd-design textarea { width: 100%; resize: vertical; }",
    ".rd-design-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }",
    ".rd-cands { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 10px; }",
    ".rd-cand { display: flex; flex-direction: column; gap: 6px; border: 1px solid var(--line-a); border-radius: var(--r-md); padding: 10px 12px; min-width: 0; }",
    ".rd-cand.is-kept { border-color: var(--patina-dim); }",
    ".rd-cand-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-weight: 600; }",
    ".rd-cand-head .rd-cand-t { flex: 1 1 auto; min-width: 0; }",
    ".rd-cand-m { display: flex; flex-direction: column; gap: 2px; font-size: 12px; color: var(--muted); overflow-wrap: anywhere; }",
    ".rd-cand-m .is-bad { color: var(--warn, #c9a227); }",
    ".rd-cand-keep { display: flex; gap: 6px; align-items: center; }",
    ".rd-cand-keep input { flex: 1 1 auto; min-width: 0; }",
    ".rd-cand-kept { color: var(--patina); font-size: 12.5px; overflow-wrap: anywhere; }",
    ".rd-design-credit { margin: 0; color: var(--dim); font-size: 11.5px; }",
    ".rd-warn { margin: 0; font-size: 15px; line-height: 1.5; font-weight: 600; color: var(--bad-ink); background: color-mix(in srgb, var(--bad) 14%, transparent); border: 1px solid var(--bad-line); border-left: 5px solid var(--bad); border-radius: var(--r-md); padding: 12px 14px; }",
    ".rd-off { color: var(--dim); font-size: 13px; }",
    ".rd-eng-note { margin: -4px 0 0; color: var(--dim); font-size: 12px; overflow-wrap: anywhere; }",
    ".rd-eng-note a { color: var(--muted); }",
    ".rd-tier-say { margin: -4px 0 0; color: var(--muted); font-size: 12px; overflow-wrap: anywhere; }",
    ".rd-tier-say.is-slow { color: var(--warn, #c9a227); }",
    // HERESY 2300: a quant's grade from the raw test (no re-read): green stable, yellow medium, red undesirable (Auto never picks it)
    ".rd-g-green { color: var(--good, #3fae5a); }", ".rd-g-yellow { color: var(--warn, #c9a227); }", ".rd-g-red { color: var(--bad, #d9534f); }",
    "select.rd-g-green, select.rd-g-yellow, select.rd-g-red { font-weight: 600; }",
    ".rd-credit { font-weight: 600; }",
    ".rd-cer { color: var(--warn, #c9a227); font-size: 11px; white-space: nowrap; }",
    ".rd-tr { display: flex; flex-direction: column; gap: 8px; padding-top: 8px; }",
    ".rd-gmap-text { min-height: 220px; font-size: 12px; font-family: var(--mono, monospace); tab-size: 14; white-space: pre; overflow-wrap: normal; }",
    ".rd-tr-go { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }",
    ".rd-tr-go input[type=file] { flex: 1 1 220px; min-width: 0; }",
    ".rd-tr-list { display: flex; flex-direction: column; gap: 4px; }",
    ".rd-tr-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: baseline; font-size: 12px; }",
    ".rd-tr-name { flex: 1 1 160px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }",
    ".rd-tr-text { min-height: 160px; font-size: 13px; }",
    // HERESY 2376: the glyph map as a table
    ".rd-gm-bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }",
    ".rd-gm-bar input[type=search] { flex: 1 1 180px; min-width: 0; }",
    ".rd-gm-wrap { max-height: 420px; overflow: auto; border: 1px solid var(--line-a); border-radius: var(--r-sm, 6px); }",
    ".rd-gm-table { width: 100%; border-collapse: collapse; font-size: 12px; }",
    ".rd-gm-table th { position: sticky; top: 0; background: var(--panel, var(--bg)); text-align: start; font-weight: 500; color: var(--muted); padding: 4px 6px; }",
    ".rd-gm-table td { padding: 2px 4px; border-top: 1px solid var(--line-a); vertical-align: middle; }",
    ".rd-gm-table td.n { color: var(--dim); text-align: end; width: 1%; white-space: nowrap; }",
    ".rd-gm-table input, .rd-gm-table select { width: 100%; min-width: 0; font-family: var(--mono, monospace); font-size: 12px; }",
    ".rd-gm-table tr.is-comment input { color: var(--dim); }",
    ".rd-gm-table tr.is-bad td { background: color-mix(in srgb, var(--bad, #c33) 14%, transparent); }",
    ".rd-gm-table tr.is-hit td.n { color: var(--amber); }",
    ".rd-gm-table td.x { width: 1%; }",
    ".rd-gm-try { display: flex; flex-direction: column; gap: 4px; }",
    ".rd-gm-out { font-family: var(--mono, monospace); font-size: 12px; white-space: pre-wrap; overflow-wrap: anywhere; color: var(--text); }",
    ".rd-setup { display: flex; flex-direction: column; gap: 6px; font-size: 13px; }",
    ".rd-setup ul { margin: 0; padding-inline-start: 18px; color: var(--dim); }",
    ".rd-check { display: flex; flex-direction: column; gap: 8px; font-size: 12.5px; }",
    ".rd-homo { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }",
    ".rd-homo > b { font-weight: 600; margin-right: 4px; }",
    ".rd-dict { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }",
    ".rd-dict-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto; gap: 8px; align-items: center; }",
    ".rd-dict-list { display: flex; flex-direction: column; gap: 4px; max-height: 260px; overflow: auto; }",
    ".rd-dict-item { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto; gap: 8px; align-items: center; font-size: 13px; }",
    ".rd-fix { border: 1px solid var(--patina-dim); border-radius: var(--r-md); padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; }",
    ".rd-fix-head { display: flex; gap: 8px; align-items: baseline; }",
    ".rd-fix-head > b { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }",
    ".rd-pieces { display: flex; flex-direction: column; gap: 4px; max-height: 320px; overflow: auto; }",
    ".rd-piece { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 8px; align-items: center; padding: 4px 6px; border-radius: var(--r-sm, 6px); cursor: pointer; font-size: 13px; }",
    ".rd-piece:hover { background: color-mix(in srgb, var(--patina) 8%, transparent); }",
    ".rd-piece.is-sel { background: color-mix(in srgb, var(--patina) 16%, transparent); }",
    ".rd-piece .rd-vs { color: var(--dim); font-size: 11px; white-space: nowrap; }",
    ".rd-mark { margin-right: 4px; cursor: help; }",                                                  // HERESY 2334, 2335: the tail guard's marks, the pauses
    ".rd-gaprow { display: flex; gap: 6px; align-items: center; justify-content: flex-end; padding: 0 6px; font-size: 12px; color: var(--dim); }",
    ".rd-gap { width: 76px; font-size: 12px; padding: 1px 4px; }",
    ".rd-gap.is-bad { outline: 1px solid var(--bad, #c0392b); }",
    ".rd-words { display: flex; flex-wrap: wrap; gap: 4px; }",
    ".rd-word { font-size: 13px; }",
    ".rd-vowels { display: flex; flex-wrap: wrap; gap: 2px; align-items: center; }",
    ".rd-vowels button { min-width: 26px; font-size: 15px; }",
    ".rd-vers { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }",
    // HERESY 2575 (the UIX audit, item 51): the room's fields on the Studio's one height (--ctl-h, 36 px), as its pickers already are; an icon standing in a row of
    // fields at their height (the glyph map's table cells and a piece's pause keep their own)
    "#view-read input:is([type=text], [type=number], [type=search]):not(.rd-gm-table input):not(.rd-gap) { height: var(--ctl-h, 36px); box-sizing: border-box; }",
    "#view-read :is(.rd-dict-row, .rd-gm-bar, .rd-voice, .rd-tr-go, .rd-cand-keep, .rd-spk) > .rd-ib { height: var(--ctl-h, 36px); min-width: var(--ctl-h, 36px); }",
    "#logDockBody[data-only=\"reader\"] > .log-line:not([data-src=\"reader\"]), .log-pop [data-body=\"server\"][data-only=\"reader\"] > .log-line:not([data-src=\"reader\"]) { display: none; }"
  ].join("\n");

  var MIC = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 2.5a3 3 0 0 0-3 3v6.5a3 3 0 0 0 6 0V5.5a3 3 0 0 0-3-3Z M18.5 10.5v1.5a6.5 6.5 0 0 1-13 0v-1.5 M12 18.5v3" ' +
    'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  function lim(a, b) { return ' <em class="mono rd-lim">' + a + "–" + b + "</em>"; }
  // HERESY 2401 (Viktor 11.11.2026: «смотрю на интерфейс комнаты и не очень мне весело. Пересмотри эту комнату и подумай, как привести её в
  // порядок, чтобы была и в общем стиле, и чтобы несла свою дизайнерскую ересь»): the room in the Studio's frame, the Musician's cards (k-card, the
  // lampshade) in three: the lectern (the text and how it is cut), the voice (who reads and how a word is said) and the engine (what reads and
  // where); the go bar at the foot of the form as the Musician's Generate; the runs beside them. Its heresy is breath (רוח): a line of breath
  // under the room's name, still while nothing reads and breathing while a run reads, and the lectern ruled like a reader's page, its margin
  // in the accent. Every id the room binds is where it was: only the frame changed.
  function roomHtml() {
    var RDTITLE = '<label class="field"><span class="label">' + esc(E("reader.title")) + '</span><input type="text" id="rdTitle" maxlength="120" placeholder="' + esc(E("reader.title.ph")) + '" data-tip="' + esc(E("reader.title.tip")) + '" /></label>';
    // HERESY 2560: the go bar under the form's cards, never over them
    var GO = '<div class="rd-actions rd-go">' + RDTITLE + '<button type="button" class="btn primary rd-go-btn" id="rdGo" data-tip="' + esc(E("reader.go.tip")) + '">' + MIC + "<span>" + esc(E("reader.go")) + "</span></button>" +
      '<span class="rd-say mono" id="rdSay"></span></div>';
    return '<div class="col-head post-head rd-head"><h2>' + esc(E("reader.room")) + ' <span class="tag" id="rdPro" hidden data-tip="' + esc(E("reader.pro.tip")) + '">Pro</span>' +
      '<span class="info" tabindex="-1" role="img" aria-label="' + esc(E("reader.about")) + '" data-tip="' + esc(E("reader.note.tip")) + '"></span></h2>' +   // HERESY 2560
      '<div class="rd-breath" id="rdBreath" aria-hidden="true">' + BREATH + "</div></div>" +
      '<p class="rd-off" id="rdOff" hidden></p>' +
      '<div class="rd-cols" id="rdCols"><div class="rd-form"><div class="rd-form-body" id="rdFormBody">' +
      // the lectern
      '<section class="k-card rd-card rd-lect"><div class="rd-card-head"><span class="label">' + esc(E("reader.text")) + '</span><em class="mono rd-count" id="rdCount"></em>' +
      '<em class="mono rd-dur" id="rdDur"></em>' + ib("undo-2", "rdFormBack", E("reader.formBack"), E("reader.formBack.tip"), " hidden") + "</div>" +   // HERESY 2511
      '<div class="rd-row"><label class="field"><span class="label">' + esc(E("reader.mode")) + '</span><select id="rdMode" data-tip="' + esc(E("reader.mode.tip")) + '">' +
      '<option value="narration">' + esc(E("reader.narration")) + '</option><option value="dialog">' + esc(E("reader.dialog")) + "</option></select></label>" +
      '<label class="field" id="rdSplitBox"><span class="label">' + esc(E("reader.split")) + '</span><select id="rdSplit" data-tip="' + esc(E("reader.split.tip")) + '">' +
      '<option value="sentence">' + esc(E("reader.sentences")) + '</option><option value="verse">' + esc(E("reader.verses")) + "</option></select></label></div>" +
      '<details class="rd-box" id="rdTr"><summary data-tip="' + esc(E("reader.tr.tip")) + '">' + esc(E("reader.tr")) + '</summary><div class="rd-tr">' +
      '<div class="rd-tr-go"><input type="file" id="rdTrFile" accept="audio/*,video/*" data-tip="' + esc(E("reader.tr.file.tip")) + '" />' +
      '<select id="rdTrLang" data-tip="' + esc(E("reader.lang.tip")) + '"><option value="auto">' + esc(E("reader.lang.auto")) + "</option>" +
      LANG_CODES.map(function (l) { return '<option value="' + l + '" translate="no">' + l + "</option>"; }).join("") + "</select>" +
      ib("ear", "rdTrGo", E("reader.tr.go"), E("reader.tr.go.tip")) + "</div>" +   // HERESY 2514
      '<div class="rd-tr-list" id="rdTrList"></div>' +
      '<div id="rdTrOut" hidden><textarea id="rdTrText" class="rd-tr-text" rows="8" spellcheck="false" data-tip="' + esc(E("reader.tr.text.tip")) + '"></textarea>' +   // HERESY 2391
      '<div class="rd-actions"><select id="rdTrMode" aria-label="' + esc(E("reader.tr.mode")) + '" data-tip="' + esc(E("reader.tr.mode.tip")) + '">' +   // HERESY 2376
      '<option value="every">' + esc(E("reader.tr.mode.every")) + '</option><option value="proof">' + esc(E("reader.tr.mode.proof")) + "</option></select>" +
      ib("sparkles", "rdTrClean", E("reader.tr.clean"), E("reader.tr.clean.tip")) + ib("import", "rdTrUse", E("reader.tr.use"), E("reader.tr.use.tip")) +
      '<span class="rd-say" id="rdTrSay"></span></div></div></div></details>' +
      '<label class="field rd-page"><span class="label rd-sr">' + esc(E("reader.text")) + "</span>" +
      '<textarea id="rdText" class="rd-text" rows="14" spellcheck="false" data-tip="' + esc(E("reader.text.tip")) + '"></textarea></label>' +
      '<div class="rd-actions rd-tools">' + (window.HeresyCase ? window.HeresyCase.buttons("rdText", "rdMode") : "") +   // HERESY 2453
      ib("timer", "rdPause", E("reader.pause"), E("reader.pause.tip")) +   // HERESY 2334; 2514: icons
      ib("scissors", "rdSplitAdd", E("reader.split.add"), E("reader.split.tip")) + "</div>" +   // HERESY 2344 +
      '<label class="check" data-tip="' + esc(E("reader.tags.tip")) + '"><input type="checkbox" id="rdTags" /> <span>' + esc(E("reader.tags")) + "</span></label>" +
      '<details class="rd-box" id="rdPal"><summary data-tip="' + esc(E("reader.palette.tip")) + '">' + esc(E("reader.palette")) + '</summary><div id="rdPalBody"></div></details>' +
      "</section>" +
      // the voice
      '<div class="rd-form-side">' +   // HERESY 2560: the voice and the engine, one column from 1600 px
      '<section class="k-card rd-card rd-vox"><div class="rd-card-head"><span class="label">' + esc(E("reader.voice")) + '</span><span class="rd-head-ico">' +
      ib("user-round-plus", "rdOwnOpen", E("reader.ownOpen"), E("reader.own.open.tip")) +   // HERESY 2514: from the go bar into the voice's head
      ib("wand-sparkles", "rdDesignOpen", E("reader.design.open"), E("reader.design.open.tip")) + "</span></div>" +
      '<div class="field" id="rdVoiceBox"><span class="label">' + esc(E("reader.voice")) + '</span><div class="rd-voice">' +
      '<select id="rdVoice" data-hc-pick="1" data-tip="' + esc(E("reader.voice.tip")) + '"></select>' +
      ib("vol-hi", "rdListen", E("reader.listen"), E("reader.listen.tip")) + "</div></div>" +
      '<div class="field" id="rdCastBox" hidden><span class="label">' + esc(E("reader.speakers")) + '</span><div class="rd-cast" id="rdCast"></div></div>' +
      '<div class="rd-row"><label class="field"><span class="label">' + esc(E("reader.lang")) + '</span><select id="rdLang" data-tip="' + esc(E("reader.lang.tip")) + '">' +
      '<option value="auto">' + esc(E("reader.lang.auto")) + "</option>" + LANG_CODES.map(function (l) { return '<option value="' + l + '" translate="no">' + l + "</option>"; }).join("") + "</select></label>" +
      '<label class="field" id="rdStyleBox"><span class="label">' + esc(E("reader.style")) + '</span><input type="text" id="rdStyle" maxlength="400" spellcheck="false" data-tip="' + esc(E("reader.style.tip")) + '" /></label></div>' +
      '<div class="rd-actions"><label class="check" data-tip="' + esc(E("reader.stress.tip")) + '"><input type="checkbox" id="rdStress" checked /> <span>' + esc(E("reader.stress")) + "</span></label>" +
      '<label class="check" data-tip="' + esc(E("reader.glyphs.tip")) + '"><input type="checkbox" id="rdGlyphs" /> <span>' + esc(E("reader.glyphs")) + "</span></label>" +
      ib("stress", "rdCheck", E("reader.check"), E("reader.check.tip")) +
      "</div>" +
      '<div class="rd-box rd-check" id="rdCheckOut" hidden></div>' +
      '<details class="rd-box" id="rdDict"><summary data-tip="' + esc(E("reader.dict.tip")) + '">' + esc(E("reader.dict")) + ' <span class="mono" id="rdDictLang" translate="no"></span></summary><div class="rd-dict">' +
      '<div class="rd-dict-row"><input type="text" id="rdDictWord" data-tip="' + esc(E("reader.dict.word.tip")) + '" maxlength="60" spellcheck="false" placeholder="' + esc(E("reader.dict.word")) + '" />' +
      '<input type="text" id="rdDictForm" data-tip="' + esc(E("reader.dict.form.tip")) + '" maxlength="80" spellcheck="false" placeholder="' + esc(E("reader.dict.form")) + '" />' +
      ib("plus", "rdDictAdd", E("reader.dict.add"), E("reader.dict.add.tip")) + '</div><div class="rd-dict-list" id="rdDictList"></div></div></details>' +
      '<details class="rd-box" id="rdGmap"><summary data-tip="' + esc(E("reader.gmap.tip")) + '">' + esc(E("reader.gmap")) + ' <span class="mono" id="rdGmapN"></span></summary><div class="rd-tr">' +
      '<div class="rd-say" id="rdGmapSrc" translate="no"></div>' +
      '<div class="rd-gm-bar"><input type="search" id="rdGmFind" spellcheck="false" placeholder="' + esc(E("reader.gmap.find")) + '" data-tip="' + esc(E("reader.gmap.find.tip")) + '" />' +   // HERESY 2376; 2391: its tip
      ib("plus", "rdGmAdd", E("reader.gmap.add"), E("reader.gmap.add.tip")) + ib("type", "rdGmView", E("reader.gmap.asText"), E("reader.gmap.asText"), ' aria-pressed="false"') + "</div>" +
      '<div class="rd-gm-wrap" id="rdGmWrap"><table class="rd-gm-table"><thead><tr><th>#</th><th>' + esc(E("reader.gmap.kind")) + "</th><th>" + esc(E("reader.gmap.what")) +
      "</th><th>" + esc(E("reader.gmap.with")) + "</th><th>" + esc(E("reader.gmap.note")) + '</th><th></th></tr></thead><tbody id="rdGmRows"></tbody></table></div>' +
      '<textarea id="rdGmapText" class="rd-gmap-text" rows="14" spellcheck="false" hidden data-tip="' + esc(E("reader.gmap.text.tip")) + '"></textarea>' +   // HERESY 2391
      '<div class="rd-gm-try"><input type="text" id="rdGmTry" spellcheck="false" placeholder="' + esc(E("reader.gmap.tryPh")) + '" data-tip="' + esc(E("reader.gmap.try")) + '" />' +
      '<div class="rd-gm-out" id="rdGmTryOut" translate="no"></div></div>' +
      '<div class="rd-actions"><button type="button" class="btn small" id="rdGmapSave">' + esc(E("reader.gmap.save2")) + "</button>" +
      ib("undo-2", "rdGmapUndo", E("reader.gmap.undo"), E("reader.gmap.undo.tip")) + ib("text-reset", "rdGmapReset", E("reader.gmap.reset"), E("reader.gmap.reset.tip")) +
      '<span class="rd-say" id="rdGmapSay"></span></div>' +
      '<div class="rd-say" id="rdGmapKept" translate="no"></div></div></details>' +
      "</section>" +
      // the engine
      '<section class="k-card rd-card rd-mach"><div class="rd-card-head"><span class="label">' + esc(E("reader.engine")) +
      '<span class="info" id="rdEngInfo" tabindex="-1" role="img" aria-label="' + esc(E("reader.engine.about")) + '" hidden></span></span></div>' +   // HERESY 2564
      '<div class="rd-row"><label class="field"><span class="label">' + esc(E("reader.engine")) + '</span><select id="rdEngine" data-tip="' + esc(E("reader.engine.tip")) + '"></select></label>' +
      '<label class="field"><span class="label">' + esc(E("reader.card")) + '</span><select id="rdCard" data-hc-pick="1" data-tip="' + esc(E("reader.card.tip")) + '"></select></label></div>' +
      '<p class="rd-eng-note" id="rdEngNote" translate="no" hidden></p>' +
      '<div class="rd-box rd-setup" id="rdSetup" hidden></div>' +   // HERESY 2374
      '<div class="rd-row" id="rdTierBox" hidden><label class="field"><span class="label">' + esc(E("reader.tier")) + '<span class="info" id="rdTierInfo" tabindex="-1" role="img" aria-label="' + esc(E("reader.engine.about")) + '" hidden></span>' +
      '</span><select id="rdTier" data-hc-pick="1" data-tip="' + esc(E("reader.tier.tip")) + '"></select></label></div>' +   // HERESY 2562, 2564
      '<p class="rd-tier-say" id="rdTierSay" hidden></p>' +
      '<details class="rd-box" id="rdMore"><summary>' + esc(E("reader.settings")) + '</summary><div class="rd-grid">' +
      '<label class="field"><span class="label">' + esc(E("reader.temp")) + lim("0.1", "1.5") + '</span><input type="number" id="rdTemp" min="0.1" max="1.5" step="0.05" value="0.8" data-tip="' + esc(E("reader.temp.tip")) + '" /></label>' +
      '<label class="check" data-tip="' + esc(E("reader.hear.tip")) + '"><input type="checkbox" id="rdHear" checked /> <span>' + esc(E("reader.hear")) + "</span></label>" +
      '<label class="check" data-tip="' + esc(E("reader.acutesOff.tip")) + '"><input type="checkbox" id="rdAcutesOff" /> <span>' + esc(E("reader.acutesOff")) + "</span></label>" +   // HERESY 2343: a test, never kept
      '<label class="field"><span class="label">' + esc(E("reader.topk")) + lim("1", "200") + '</span><input type="number" id="rdTopk" min="1" max="200" step="1" value="50" data-tip="' + esc(E("reader.topk.tip")) + '" /></label>' +
      '<label class="field"><span class="label">' + esc(E("reader.seed")) + '</span><input type="number" id="rdSeed" min="0" max="2147483000" step="1" placeholder="' + esc(E("reader.seed.ph")) + '" data-tip="' + esc(E("reader.seed.tip")) + '" /></label>' +
      '<label class="field"><span class="label">' + esc(E("reader.gap")) + lim("0.05", "3") + '</span><input type="number" id="rdGap" min="0.05" max="3" step="0.05" value="0.35" data-tip="' + esc(E("reader.gap.tip")) + '" /></label>' +
      '<label class="field"><span class="label">' + esc(E("reader.turngap")) + lim("0.05", "3") + '</span><input type="number" id="rdTurnGap" min="0.05" max="3" step="0.05" value="0.45" data-tip="' + esc(E("reader.turngap.tip")) + '" /></label>' +
      "</div></details>" +
      "</section></div>" +
      '<div class="rd-design" id="rdDesign" hidden><h3>' + esc(E("reader.design.title")) + '</h3><p class="rd-design-note">' + esc(E("reader.design.note")) + "</p>" +
      '<label class="field"><span class="label">' + esc(E("reader.design.describe")) + '</span><textarea id="rdDsDescribe" rows="2" maxlength="160" spellcheck="false" placeholder="' +
      esc(E("reader.design.describe.ph")) + '" data-tip="' + esc(E("reader.design.describe.tip")) + '"></textarea></label>' +
      '<div class="rd-design-row"><label class="field"><span class="label">' + esc(E("reader.own.lang")) + '</span><select id="rdDsLang" data-hc-pick="1" data-tip="' + esc(E("reader.design.lang.tip")) + '"></select></label>' +
      '<label class="field"><span class="label">' + esc(E("reader.design.gender")) + '</span><select id="rdDsGender" data-hc-pick="1" data-tip="' + esc(E("reader.design.gender.tip")) + '"><option value="">' + esc(E("reader.design.any")) + "</option>" +
      '<option value="male">' + esc(E("reader.male")) + '</option><option value="female">' + esc(E("reader.female")) + "</option></select></label>" +
      '<label class="field"><span class="label">' + esc(E("reader.design.n")) + '</span><select id="rdDsN" data-hc-pick="1" data-tip="' + esc(E("reader.design.n.tip")) + '"><option>2</option><option selected>3</option><option>4</option></select></label>' +
      '<label class="field"><span class="label">' + esc(E("reader.design.seeds")) + '</span><input type="text" id="rdDsSeeds" spellcheck="false" placeholder="' + esc(E("reader.design.seeds.ph")) +
      '" data-tip="' + esc(E("reader.design.seeds.tip")) + '" /></label></div>' +
      '<label class="field"><span class="label">' + esc(E("reader.design.words")) + '</span><textarea id="rdDsText" rows="2" maxlength="300" spellcheck="false" data-tip="' + esc(E("reader.design.words.tip")) + '"></textarea></label>' +
      '<div class="rd-actions"><button type="button" class="btn small" id="rdDsGo" data-tip="' + esc(E("reader.design.make.tip")) + '">' + esc(E("reader.design.make")) + "</button>" +
      ib("stop-circle", "rdDsStop", E("reader.design.stop"), E("reader.design.stop"), " hidden") +
      '<button type="button" class="btn ghost small" id="rdDsClose">' + esc(E("reader.own.cancel")) + '</button><span class="rd-say mono" id="rdDsSay"></span></div>' +
      '<div class="rd-cands" id="rdDsCands"></div><p class="rd-design-credit" id="rdDsCredit" hidden></p></div>' +
      '<div class="rd-own" id="rdOwn" hidden><h3>' + esc(E("reader.own.title")) + '</h3><p class="rd-warn" role="alert">' + esc(E("reader.own.warn")) + "</p>" +
      '<label class="check" data-tip="' + esc(E("reader.own.consent.tip")) + '"><input type="checkbox" id="rdOwnOk" /> <span>' + esc(E("reader.own.consent")) + "</span></label>" +
      '<div class="rd-row"><label class="field"><span class="label">' + esc(E("reader.own.name")) + '</span><input type="text" id="rdOwnName" maxlength="60" data-tip="' + esc(E("reader.own.name.tip")) + '" /></label>' +
      '<label class="field"><span class="label">' + esc(E("reader.own.lang")) + '</span><select id="rdOwnLang" data-hc-pick="1" data-tip="' + esc(E("reader.own.lang.tip")) + '"></select></label></div>' +
      '<label class="field"><span class="label">' + esc(E("reader.own.text")) + '</span><textarea id="rdOwnText" rows="2" spellcheck="false" data-tip="' + esc(E("reader.own.text.tip")) + '"></textarea></label>' +
      '<div class="rd-actions"><label class="btn ghost small icon-only rd-ib" aria-label="' + esc(E("reader.own.file")) + '" data-tip="' + esc(E("reader.own.file.tip")) + '">' + (UI("upload") || esc(E("reader.own.file"))) +
      '<input type="file" id="rdOwnFile" accept="audio/*" hidden /></label>' +
      '<span class="rd-say mono" id="rdOwnFileName" translate="no"></span><button type="button" class="btn small" id="rdOwnKeep">' + esc(E("reader.own.keep")) + "</button>" +
      '<button type="button" class="btn ghost small" id="rdOwnCancel">' + esc(E("reader.own.cancel")) + "</button></div></div>" +
      "</div>" + GO + '</div><div class="rd-side"><div class="rd-fix" id="rdFix" hidden></div><div class="rd-side-head"><h3 class="rd-h3">' + esc(E("reader.runs")) + '</h3><span class="rd-say mono" id="rdRunsN"></span>' +
      ib("alert", "rdRunsFailed", E("reader.runs.failed"), E("reader.runs.failed.tip"), ' aria-pressed="true"') + "</div>" +   // HERESY 2514: a toggle, not a box
      '<div class="rd-runs" id="rdRuns"></div></div></div>';
  }
  // the breath line: a speaking voice's envelope drawn once, phrases and the pauses between them (its own seed, the same line every time)
  var BREATH = (function () {
    var w = 1200, h = 36, n = 300, seed = 7, pts = [], up = [], dn = [];
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    var amp = 0, want = 0, left = 0;
    for (var i = 0; i <= n; i++) {
      if (left-- <= 0) { want = rnd() < 0.22 ? 0.04 : 0.35 + 0.65 * rnd(); left = 6 + Math.floor(rnd() * 18); }
      amp += (want - amp) * 0.25;
      var a = amp * (0.75 + 0.25 * Math.sin(i * 1.7)) * (h / 2 - 2);
      up.push((i * w / n).toFixed(1) + "," + (h / 2 - a).toFixed(1));
      dn.unshift((i * w / n).toFixed(1) + "," + (h / 2 + a).toFixed(1));
    }
    pts = up.concat(dn);
    return '<svg viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="none" focusable="false"><polygon class="rd-breath-env" points="' + pts.join(" ") + '"/>' +
      '<line class="rd-breath-axis" x1="0" y1="' + h / 2 + '" x2="' + w + '" y2="' + h / 2 + '"/></svg>';
  })();

  // ---------------------------------------------------------------- mounted at once, before app.js binds the bar's rooms and the log's views
  function mount() {
    var tabs = $("tabs"), video = $("view-video");
    if (!tabs || !video || $("view-read")) return false;
    var b = document.createElement("button");
    b.type = "button"; b.id = "tabRead"; b.dataset.tab = "read"; b.dataset.moduleRoom = "1"; b.dataset.tip = E("reader.tab.tip"); b.setAttribute("aria-label", E("reader.room"));
    b.innerHTML = '<span class="rd-tab-word">' + esc(E("reader.room")) + "</span>" + MIC.replace("<svg ", '<svg class="rd-tab-ico" ');
    tabs.insertBefore(b, tabs.querySelector('[data-tab="write"]'));   // HERESY 2365 (Viktor 08.11.2026): the second room, after the Musician
    var v = document.createElement("section");
    v.className = "col reader-col is-hidden"; v.id = "view-read"; v.innerHTML = roomHtml();
    video.parentNode.insertBefore(v, video.nextSibling);
    var items = document.querySelector("#headMorePop .head-more-items");
    if (items) {
      var mr = document.createElement("button");
      mr.type = "button"; mr.id = "rdMoreRoom"; mr.className = "btn ghost small"; mr.dataset.moduleRoom = "1"; mr.dataset.tip = E("reader.tab.tip");
      mr.innerHTML = MIC + "<span>" + esc(E("reader.room")) + "</span>";
      mr.addEventListener("click", function () {
        var pop = $("headMorePop"), hb = $("headMore");
        if (pop) pop.classList.add("is-hidden");
        if (hb) hb.setAttribute("aria-expanded", "false");
        b.click();                                       // the room opened as its tab opens it (app.js's own handler)
      });
      items.insertBefore(mr, items.firstChild);
    }
    var views = $("logDockViews");
    if (views) {
      var lb = document.createElement("button");
      lb.type = "button"; lb.setAttribute("role", "tab"); lb.className = "log-view"; lb.dataset.view = "reader"; lb.dataset.moduleRoom = "1";
      lb.setAttribute("aria-selected", "false"); lb.dataset.tip = E("reader.log.tip"); lb.textContent = E("reader.room");
      views.insertBefore(lb, views.querySelector('[data-view="writer"]'));   // HERESY 2365: in the rooms' order
    }
    var s = document.createElement("style");
    s.id = "readerStyle"; s.textContent = STYLE;
    document.head.appendChild(s);
    window.RuachRooms = window.RuachRooms || {};
    window.RuachRooms.read = { view: "view-read", log: "reader", reload: reload,
      guide: "GUIDE-READER", guideAfter: "videographer", guideTab: "reader",   // HERESY 2292: its own part of the guide (F1), kept home with the room
      logSrc: function (w, card) { return /^the (Reader|Narrator)\b/.test(w) || /\bthe (Reader|Narrator)\b/.test(card || "") ? "reader" : ""; } };
    if (window.HeresyChoices) window.HeresyChoices.scope(v);
    bind();
    writerButton();                                      // HERESY 2344
    return true;
  }

  // ---------------------------------------------------------------- the form
  function vlabel(v) {
    var base = v.f0 ? fill("reader.vlabel", { 0: v.name, 1: E(v.gender === "female" ? "reader.female" : "reader.male"), "#2": Math.round(v.f0) }) : v.name;
    return v.kind === "own" ? fill("reader.own.mark", { 0: base }) : base;
  }
  // HERESY 2456: the groups of the engine chosen: its own set of voices where it has one (Drama 3: the Studio's twelve stock voices), else the kit's
  function vgroups() { var e = engine(); return (e && e.voice_set && st.sets[e.voice_set]) || st.groups; }
  function voiceOpts(cur) {
    var h = '<option value="">' + esc(E("reader.voice.engine")) + "</option>", groups = vgroups();
    groups.forEach(function (g) { h += '<option value="g:' + esc(g.id) + '">' + esc(E("reader.g." + g.id)) + "</option>"; });
    st.voices.forEach(function (v) { h += '<option value="v:' + esc(v.id) + '">' + esc(vlabel(v)) + "</option>"; });
    return { html: h, ok: !cur || cur === "" || /^g:/.test(cur) && groups.some(function (g) { return "g:" + g.id === cur; }) || /^v:/.test(cur) && st.voices.some(function (v) { return "v:" + v.id === cur; }) };
  }
  function setOpts(sel, html, cur) {
    if (sel.dataset.opts !== html) { sel.innerHTML = html; sel.dataset.opts = html; }
    sel.value = cur;
    if (sel.selectedIndex < 0) sel.selectedIndex = 0;
  }
  function paintVoice() {
    var cur = recall("yue2.readerVoice") || "", o = voiceOpts(cur);
    setOpts($("rdVoice"), o.html, o.ok ? cur : "");
  }
  function paintEngines() {
    var sel = $("rdEngine"), cur = recall("yue2.readerEngine") || "";
    var h = st.engines.map(function (e) { return '<option value="' + esc(e.id) + '" translate="no">' + esc(e.label) + "</option>"; }).join("");
    setOpts(sel, h, st.engines.some(function (e) { return e.id === cur; }) ? cur : (st.engines[0] || {}).id || "");
    $("rdPro").hidden = !st.engines.some(function (e) { return e.own; });   // HERESY 2374: the Pro tag only beside a private engine
  }
  function paintCards() {
    var e = engine(), c = st.cards || { cuda: [], arc: [] }, devs = e ? e.devices : [], h = "";
    if (devs.indexOf("cuda") >= 0) {
      h += '<option value="auto">' + esc(E("reader.card.auto")) + "</option>";
      c.cuda.forEach(function (g) { h += '<option value="' + g.index + '">' + esc(fill("reader.card.gpu", { "#0": g.index, 1: g.name || "" })) + "</option>"; });
    }
    if (devs.indexOf("xpu") >= 0) c.arc.forEach(function (a) { h += '<option value="' + a.index + '">' + esc(fill(a.studio ? "reader.card.arcStudio" : "reader.card.arc", { 0: a.name || "" })) + "</option>"; });
    if (devs.indexOf("cpu") >= 0) h += '<option value="cpu">' + esc(E("reader.card.cpu")) + "</option>";
    var cur = recall("yue2.readerCard") || "auto";
    setOpts($("rdCard"), h, cur);
    paintTiers();
  }
  // HERESY 2263: the quant an engine with tiers reads in, and where; the line says what it would be now and how long this text would take
  function credit(eid) {
    var e = st.engines.filter(function (x) { return x.id === eid; })[0], c = e && e.license && e.license.credit;
    return c ? '<b class="rd-credit" translate="no">' + esc(c) + "</b>" : "";
  }
  function mmss(s) { s = Math.max(0, Math.round(+s || 0)); return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2); }
  function paintTiers() {
    var e = engine(), ts = (e && e.tiers) || [], box = $("rdTierBox");
    box.hidden = !ts.length;
    if (!ts.length) { $("rdTierSay").hidden = true; return; }
    // HERESY 2435 (Viktor 12.11.2026: «Q8_0 — дефолт»): quality first, Q8_0 wherever it fits, heads the list and is the default
    var h = '<option value="auto-quality">' + esc(E("reader.tier.autoQuality")) + '</option><option value="auto-speed">' + esc(E("reader.tier.autoSpeed")) + "</option>";
    ts.forEach(function (t) {
      if (t.device !== "cuda") return;
      var k = { speed: "reader.tier.speed", quality: "reader.tier.quality", q8: "reader.tier.q8", ram: "reader.tier.ram" }[t.id];   // HERESY 2290: Q8_0 by name
      h += '<option value="' + esc(t.id) + '"' + (t.ready ? "" : " disabled") + gradeAttr(t) + (k ? "" : ' translate="no"') + ">" + esc(k ? fill(k, { 0: t.quant }) : t.quant) + "</option>";   // HERESY 2562: a named tier in the page's language
    });
    var was = recall("yue2.readerTier." + e.id);
    if (was === "auto-speed" && !recall("yue2.readerTierQ8")) { was = ""; keep("yue2.readerTier." + e.id, ""); }   // HERESY 2435: the old default, once
    keep("yue2.readerTierQ8", "1");
    setOpts($("rdTier"), h, was || "auto-quality");
    $("rdTier").disabled = $("rdCard").value === "cpu";
    gradeTier();
    tierLook();
  }
  // HERESY 2300: a graded tier's colour and its word in the tooltip; the select wears the grade of the quant chosen in it
  function gradeAttr(t) { return t && t.grade ? ' class="rd-g-' + esc(t.grade) + '" title="' + esc(E("reader.tier.g." + t.grade)) + '"' : ""; }
  function gradeTier() {
    var sel = $("rdTier"), o = sel.options[sel.selectedIndex], g = o && /rd-g-(\w+)/.exec(o.className || "");
    ["green", "yellow", "red"].forEach(function (x) { sel.classList.toggle("rd-g-" + x, !!g && g[1] === x); });
    sel.setAttribute("data-tip", E("reader.tier.tip") + (g ? "\n\n" + E("reader.tier.g." + g[1]) : ""));
    var box = sel.nextElementSibling;                    // the radio rows standing for the select (heresy-menu.js) carry its tip
    if (box && box.classList.contains("hc-box")) box.setAttribute("data-tip", sel.getAttribute("data-tip"));
    var face = box && box.querySelector(".hc-pick-now");   // HERESY 2562: the picker's face wears the grade
    if (face) ["green", "yellow", "red"].forEach(function (x) { face.classList.toggle("rd-g-" + x, !!g && g[1] === x); });
  }
  var tierT = 0, tierN = 0;
  function tierLook() {
    clearTimeout(tierT);
    tierT = setTimeout(function () {
      var e = engine(), say = $("rdTierSay");
      if (!e || !(e.tiers || []).length || st.absent) { say.hidden = true; return; }
      var n = ++tierN, chars = $("rdText").value.replace(/\[[^\[\]\n]{1,80}\]/g, "").replace(/\s+/g, " ").trim().length;
      api("/reader/tier?engine=" + encodeURIComponent(e.id) + "&ask=" + encodeURIComponent($("rdTier").value || "auto-quality") + "&card=" + encodeURIComponent($("rdCard").value || "auto") +
        "&chars=" + chars).then(function (r) {
        if (n !== tierN) return;
        say.hidden = false;
        say.classList.toggle("is-slow", !!(r.tier && r.tier.device === "cpu") || !!r.wait);
        if (r.error) { say.textContent = tr(r.error); return; }
        if (!r.tier) { say.hidden = true; return; }
        var t = r.tier, where = r.card === "cpu" ? E("reader.tier.cpu") : fill("reader.tier.gpu", { "#0": r.card });
        if (r.wait) { say.textContent = fill("reader.tier.wait", { 0: t.quant, 1: Math.round(t.need_mb / 1024) }); return; }
        var why = r.reason === "shared" ? E("reader.tier.shared") + " " : r.reason === "no-card" ? E("reader.tier.nocard") + " " : r.reason === "no-ram" ? E("reader.tier.noram") + " " : r.card === "cpu" && $("rdCard").value === "cpu" ? E("reader.tier.cpuNote") + " " : "";
        // HERESY 2563 (the UIX audit, item 48): each sentence its own text, looked up whole (the two in one read «Нет job card has 7 GB free now»)
        say.innerHTML = (why ? "<span>" + esc(why.trim()) + "</span> " : "") + "<span>" + esc(fill("reader.tier.line", { 0: t.quant, 1: where, 2: t.rtf, 3: mmss(r.speech_s), 4: mmss(r.expect_s) })) + "</span>" +
          (r.kept ? " · <span>" + esc(E("reader.tier.loaded")) + "</span>" : "");
      }).catch(function () { if (n === tierN) say.hidden = true; });
    }, 350);
  }
  function paintPalette() {
    var e = engine(), t = e && e.tags, box = $("rdPalBody");
    if (!box) return;
    var groups = t && Array.isArray(t.groups) ? t.groups : [];
    $("rdPal").hidden = !groups.length;
    box.innerHTML = groups.map(function (g, gi) {
      var name = E("reader.g." + g.id);
      return '<div class="rd-pal-g"><b>' + esc(name === "reader.g." + g.id ? g.id : name) + "</b>" + (g.items || []).map(function (it) {
        var word = String(it).replace(/_/g, " ");   // HERESY 2566 (the UIX audit, item 50): each tag says what it puts where, in the page's language; the tag stays the model's
        return '<button type="button" class="btn ghost small rd-tag" translate="no" data-g="' + gi + '" data-t="' + esc(it) + '" data-tip="' + esc(tw(g.place === "sentence" ? "reader.tag.tip.sentence" : "reader.tag.tip.inline", { 0: word })) + '">' + esc(word) + "</button>";
      }).join("") + "</div>";
    }).join("");
  }
  function speakers(text) {
    var seen = [];
    String(text || "").split("\n").forEach(function (line) {
      var m = /^\s*([^\s:<>|\d[][^:<>|\n]{0,39}?)\s*[:：]\s*(.*)$/.exec(line);
      var c = m ? m[1].charAt(0) : "";                // a name never starts in lower case (a sentence with a colon is not a speaker)
      if (m && m[1].trim().split(/\s+/).length <= 4 && !(c.toLowerCase() === c && c.toUpperCase() !== c) && seen.indexOf(m[1].trim()) < 0 && seen.length < 16) seen.push(m[1].trim());
    });
    return seen;
  }
  // a new speaker's voice: the timbre groups in turn, a man's and a woman's by turns (the middle register first)
  var MEN = ["male-middle", "male-low", "male-high"], WOMEN = ["female-middle", "female-high", "female-low"];
  function castDefault(k) {
    var has = function (id) { return vgroups().some(function (g) { return g.id === id; }); }, m = MEN.filter(has), w = WOMEN.filter(has);
    var a = k % 2 ? (w.length ? w : m) : (m.length ? m : w);
    return a.length ? "g:" + a[Math.floor(k / 2) % a.length] : "";
  }
  function paintCast() {
    var box = $("rdCast"), text = $("rdText").value, names = speakers(text), first = text.split("\n").filter(function (l) { return l.trim(); })[0] || "";
    var narr = !!first && !speakers(first).length;      // a narrator: lines before the first «Name:» line, read in the voice above
    $("rdCastBox").hidden = st.mode !== "dialog";
    $("rdVoiceBox").hidden = st.mode === "dialog" && !narr;
    if (st.mode !== "dialog") return;
    var key = names.join("\u0001") + "|" + st.voices.length + "|" + vgroups().map(function (g) { return g.centre; }).join(",");
    if (box.dataset.key === key) return;
    box.dataset.key = key;
    if (!names.length) { box.innerHTML = '<span class="rd-none">' + esc(E("reader.speakers.none")) + "</span>"; return; }
    box.innerHTML = names.map(function (n, k) {
      var cur = st.cast[n] != null ? st.cast[n] : castDefault(k), o = voiceOpts(cur);
      return '<div class="rd-spk"><span class="rd-spk-name" translate="no">' + esc(n) + '</span><div class="rd-spk-v"><select data-spk="' + esc(n) + '" data-hc-pick="1" data-cur="' + esc(o.ok ? cur : "") + '">' + o.html + "</select></div>" +
        ib("vol-hi", "", E("reader.listen"), E("reader.listen.tip"), ' data-listen="' + esc(n) + '"') + "</div>";
    }).join("");
    Array.prototype.forEach.call(box.querySelectorAll("select[data-spk]"), function (sel) { sel.value = sel.dataset.cur; if (sel.selectedIndex < 0) sel.selectedIndex = 0; });
  }
  function castValues() {
    var out = {};
    Array.prototype.forEach.call(document.querySelectorAll("#rdCast select[data-spk]"), function (sel) { out[sel.dataset.spk] = sel.value; });
    return out;
  }
  function paintMode() {
    var m = $("rdMode");
    if (m.value !== st.mode) { m.value = st.mode; m.dispatchEvent(new Event("change", { bubbles: true })); }
    $("rdSplitBox").hidden = st.mode === "dialog";
    $("rdText").placeholder = E(st.mode === "dialog" ? "reader.ph.dialog" : "reader.ph.narration");
    var t = recall("yue2.readerTags." + st.mode);
    $("rdTags").checked = t == null ? st.mode === "dialog" : t === "1";   // his word: tags on for a dialog, plain for a narration
    paintCast();
    count();
  }
  function count() {
    $("rdCount").textContent = fill("reader.chars", { "#0": $("rdText").value.length });
    // HERESY 2401: about how long it reads (the engine's own pace, Drama 3's frames(): some 14 characters a second, tags and pauses not read)
    var t = $("rdText").value.replace(/\[[^\[\]\n]{1,80}\]/g, "").replace(/\s+/g, " ").trim().length, d = $("rdDur");
    if (d) d.textContent = t > 40 ? fill("reader.dur", { 0: mmss(t / 14) }) : "";
  }
  function paintGo() {
    var e = engine(), ok = !st.absent && !!e;
    $("rdGo").disabled = !ok || st.sending;
    $("rdSay").textContent = st.absent ? "" : !e && st.loaded ? E("reader.engine.none") : "";
  }
  function paintForm() {
    $("rdOff").hidden = !st.absent;
    if (st.absent) $("rdOff").textContent = E("reader.absent");
    paintEngines(); paintCards(); paintVoice(); paintPalette(); paintEngineExtras(); paintMode(); paintGo(); designForm();
    var langs = (engine() || {}).langs || [], lsel = $("rdOwnLang");
    setOpts(lsel, langs.map(function (l) { return '<option value="' + esc(l) + '" translate="no">' + esc(l) + "</option>"; }).join(""), recall("yue2.readerOwnLang") || langs[0] || "");
  }

  // ---------------------------------------------------------------- the palette: a tag at the cursor (a sentence's tag at its sentence's start)
  function insertTag(g, item) {
    var e = engine(), t = (e && e.tags) || {}, ta = $("rdText");
    var tag = (t.open || "<|") + (t.form === "bare" ? "" : (g.cat || g.id) + ":") + item + (t.close || "|>") + (g.say && g.say[item] ? g.say[item] : "");
    var v = ta.value, a = ta.selectionStart || 0, b = ta.selectionEnd || a, at = a, ins = tag, caret;
    if (g.place === "sentence") {
      var line0 = v.lastIndexOf("\n", a - 1) + 1, head = v.slice(line0, a);
      var nm = st.mode === "dialog" ? /^\s*[^\s:<>|\d[][^:<>|\n]{0,39}?\s*[:：]\s*/.exec(head) : null;
      var base = line0 + (nm ? nm[0].length : 0), seg = v.slice(base, a), re = /[.!?…]+["»”’)\]]*\s+/g, k = -1, x;
      while ((x = re.exec(seg))) k = x.index + x[0].length;
      at = base + (k >= 0 ? k : 0);
      ta.value = v.slice(0, at) + ins + v.slice(at);
      caret = a + ins.length;
    } else {
      if (a > 0 && !/\s/.test(v[a - 1])) ins = " " + ins;                      // a word before it keeps its space
      if (g.say && g.say[item] && v.slice(b) && !/^\s/.test(v.slice(b))) ins += " ";
      ta.value = v.slice(0, a) + ins + v.slice(b);
      caret = a + ins.length;
    }
    ta.focus();
    ta.setSelectionRange(caret, caret);
    if (!$("rdTags").checked) { $("rdTags").checked = true; keep("yue2.readerTags." + st.mode, "1"); }
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  }

  // ---------------------------------------------------------------- listening to a voice's own clip
  function voiceOf(ref) {
    if (/^g:/.test(ref)) { var g = vgroups().filter(function (x) { return "g:" + x.id === ref; })[0]; return g ? g.centre : ""; }
    return /^v:/.test(ref) ? ref.slice(2) : "";
  }
  function listen(ref, btn) {
    var from = btn ? btn.id || btn.dataset.listen || "" : "";
    if (st.audio) { var was = st.audio.from; st.audio.el.pause(); st.audio = null; if (was === from) return; }   // the same button again: stopped
    var id = voiceOf(ref);
    if (!id) return;
    var a = new Audio("/lab/reader/voice-file?id=" + encodeURIComponent(id));
    st.audio = { el: a, from: from };
    a.addEventListener("ended", function () { if (st.audio && st.audio.el === a) st.audio = null; });
    a.play().catch(function () { /* the browser said no: nothing to say */ });
  }

  // ---------------------------------------------------------------- HERESY 2255–2257: the engine's word, the language, the stresses, the style
  var ACUTE = "\u0301", VOW = "аеёиоуыэюяєіїaeiouyαεηιουω";
  function detectLang(t) {
    t = String(t || "");
    if (/[іїєґІЇЄҐ]/.test(t) && !/[ыэъЫЭЪ]/.test(t)) return "uk";
    if (/[ўЎ]/.test(t)) return "be";
    if (/[А-Яа-яЁё]/.test(t)) return "ru";
    if (/[\u0370-\u03ff\u1f00-\u1fff]/.test(t)) return "el";
    if (/[\u0590-\u05ff]/.test(t)) return "he";
    return "en";
  }
  function lang() { var v = $("rdLang").value; return v === "auto" ? detectLang($("rdText").value) : v; }
  function paintEngineExtras() {
    var e = engine(), note = $("rdEngNote"), parts = [];
    if (e && e.license) parts.push((e.license.url ? '<a href="' + esc(e.license.url) + '" target="_blank" rel="noopener" data-tip="' + esc(e.license.terms) + '">' + esc(e.license.name) + "</a>" : esc(e.license.name)) +
      "");   // HERESY 2275 (Viktor 09.11.2026): the engine's credit not on the form, only where a result is (the run's result, the take's editor, its note)
    // HERESY 2564 (the UIX audit, item 47): the engine's first-run words in the (i) of its Quant (of the engine, when it has no quants), in the page's language:
    // the page's own words for an engine it knows (the lab's are English and cut at 400 characters), else the lab's; under the engine only its licence
    var frk = e ? "reader.firstRun." + e.id : "", fr = e ? E(frk) : "", tiered = !!(e && (e.tiers || []).length);
    if (e && fr === frk) fr = e.first_run || "";
    [["rdTierInfo", tiered], ["rdEngInfo", !tiered]].forEach(function (x) { var el = $(x[0]); if (!el) return; el.hidden = !(x[1] && fr); if (x[1] && fr) el.setAttribute("data-tip", fr); });
    note.innerHTML = parts.join("<br>");
    note.hidden = !parts.length;
    var miss = (e && e.missing) || [], su = $("rdSetup"), how = (e && e.setup) || {};   // HERESY 2374: what this machine still lacks, and the way to it
    su.hidden = !miss.length;
    su.innerHTML = miss.length ? "<b>" + esc(E("reader.setup")) + "</b><ul>" + miss.map(function (m) {
      var id = "reader.miss." + m.id, w = E(id);
      return "<li>" + esc(w !== id ? w : m.say) + "</li>"; }).join("") + "</ul><div class=\"rd-actions\">" +
      (how.tier ? '<button type="button" class="btn small rd-ib" id="rdSetupGo" data-tier="' + esc(how.tier) + '" aria-label="' + esc(fill("reader.setup.go", { 0: how.size || "" })) + '" data-tip="' +
        esc(fill("reader.setup.go", { 0: how.size || "" })) + '">' + UI("download") + '<span class="mono" translate="no">' + esc(how.size || "") + "</span></button>" : "") +   // HERESY 2514
      (how.command ? '<span class="rd-say">' + esc(E("reader.setup.or")) + ' <code translate="no">' + esc(how.command) + "</code></span>" : "") + "</div>" : "";
    $("rdTopk").closest(".field").hidden = !!(e && e.top_k === false);   // HERESY 2263: Drama 3 through audio.cpp takes no top-k
    var sty = e && e.style;
    $("rdStyleBox").hidden = !sty;
    if (sty) {
      $("rdStyle").placeholder = sty.ph || "";
      $("rdStyle").maxLength = sty.max || 160;
      $("rdStyle").value = recall("yue2.readerStyle." + e.id) || "";
    }
  }
  function checkStress() {
    var text = $("rdText").value;
    if (!text.trim()) { toast(E("reader.empty"), "bad"); return; }
    api("/reader/stress", { text: text, lang: $("rdLang").value, engine: $("rdEngine").value, glyphs: $("rdGlyphs").checked }).then(function (r) {
      var box = $("rdCheckOut"), h = '<div class="mono">' + esc(fill("reader.check.sum", { "#0": r.marked || 0, "#1": r.user || 0, "#2": r.own || 0, "#3": (r.homographs || []).length })) + "</div>";
      var nd = /^(zaliznyak|lang-uk) (.+)$/.exec(r.dict || "");   // HERESY 2343: Zaliznyak's or lang-uk's index not open, and why
      if (nd) h += '<div class="rd-run-err">' + esc(fill("reader.check.nodict", { 0: nd[2] })) + "</div>";
      if (r.glyphs) h += '<div class="mono">' + esc(fill("reader.glyphs.sum", { "#0": r.glyphs.hits || 0, 1: E(r.glyphs.source === "user" ? "reader.glyphs.user" : "reader.glyphs.his") })) + "</div>" +
        '<div class="rd-say" translate="no">' + esc(String(r.text || "").slice(0, 600)) + (String(r.text || "").length > 600 ? " …" : "") + "</div>";   // HERESY 2270
      if ((r.homographs || []).length) h += "<div>" + esc(E("reader.check.homo")) + "</div>" + r.homographs.map(function (x) {
        return '<div class="rd-homo"><b translate="no">' + esc(x.word) + "</b>" + x.forms.map(function (f) {
          return '<button type="button" class="btn ghost small" translate="no" data-homo="' + esc(x.word) + '" data-form="' + esc(f) + '">' + esc(f) + "</button>";
        }).join("") + "</div>";
      }).join("");
      box.innerHTML = h; box.hidden = false;
    }).catch(function (e) { toast(e.message, "bad"); });
  }
  // a homograph's form put into the next unmarked place of that word after the cursor (its context decides, so one place at a time)
  function placeHomograph(word, form) {
    var ta = $("rdText"), v = ta.value, from = ta.selectionEnd || 0, re = new RegExp("(^|[^\\p{L}\\u0301])(" + word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/е/g, "[её]") + ")(?![\\p{L}\\u0301])", "giu"), m, hit = null, first = null;
    while ((m = re.exec(v))) { var at = m.index + m[1].length; if (!first) first = { at: at, w: m[2] }; if (at >= from) { hit = { at: at, w: m[2] }; break; } }
    hit = hit || first;
    if (!hit) return;
    var put = withCase(hit.w, form);
    ta.value = v.slice(0, hit.at) + put + v.slice(hit.at + hit.w.length);
    ta.focus(); ta.setSelectionRange(hit.at + put.length, hit.at + put.length);
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  }
  function withCase(orig, form) {
    var o = orig.replace(/\u0301/g, ""), out = "", k = 0;
    for (var i = 0; i < form.length; i++) {
      var c = form[i];
      if (c === ACUTE) { out += c; continue; }
      out += o[k] && o[k] !== o[k].toLowerCase() ? c.toUpperCase() : c; k++;
    }
    return out;
  }
  // ---- the user's dictionary of the language in use
  function dictLang() { return lang(); }
  function loadDict() {
    var l = dictLang();
    $("rdDictLang").textContent = l;
    return api("/reader/dict?lang=" + encodeURIComponent(l)).then(function (d) { st.dict = d; paintDict(); }).catch(function () { /* the lab away: the next open says */ });
  }
  function paintDict() {
    var d = st.dict, box = $("rdDictList");
    if (!d) return;
    box.innerHTML = d.words.length ? d.words.map(function (w) {
      return '<div class="rd-dict-item"><span translate="no">' + esc(w.word) + '</span><span translate="no">' + esc(w.form) + '</span><button type="button" class="btn ghost small" data-unword="' + esc(w.word) + '" aria-label="' + esc(E("reader.dict.remove")) + '" data-tip="' + esc(E("reader.dict.remove")) + '">' + (UI("x") || "✕") + "</button></div>";
    }).join("") : '<span class="rd-none">' + esc(E("reader.dict.empty")) + "</span>";
  }
  function dictPut(word, form) {
    return api("/reader/dict", { lang: dictLang(), word: word, form: form }).then(function (d) { st.dict = d; paintDict(); return d; });
  }

  // ---------------------------------------------------------------- a finished take fixed piece by piece
  function fixOpen(id) {
    st.fixSel = -1;
    st.gapEdits = {};                                    // HERESY 2334: the pauses changed by hand, piece -> seconds
    return api("/reader/run?id=" + encodeURIComponent(id)).then(function (r) { st.fix = r; paintFix(); $("rdFix").scrollIntoView({ block: "nearest", behavior: "smooth" }); fixWatch(); })
      .catch(function (e) { toast(e.message, "bad"); });
  }
  function fixWatch() {
    clearTimeout(st.fixTimer);
    if (!st.fix || !st.fix.fixing) return;
    st.fixTimer = setTimeout(function () {
      if (!st.fix) return;
      api("/reader/run?id=" + encodeURIComponent(st.fix.id)).then(function (r) {
        var was = st.fix && st.fix.fixing;
        st.fix = r; paintFix(true);
        if (was && !r.fixing) { window.dispatchEvent(new Event("ruach-catalog")); toast(r.fix_error ? r.fix_error : E("reader.fix.done"), r.fix_error ? "bad" : ""); }
        fixWatch();
      }).catch(function () { fixWatch(); });
    }, 2000);
  }
  function shown(p) { return String(p.text || ""); }
  // HERESY 2335: the tail guard's word on a piece (a tail cut, one said, a tone under the words, a silence inside, a level far off)
  function guardMarks(p) {
    var h = "", t = p.tail;
    if (t && t.cut_done) h += '<span class="rd-mark" data-tip="' + esc(t.kind === "tone" ? fill("reader.tail.tone.tip", { 0: ((t.hz || 0) / 1000).toFixed(1) }) : fill("reader.tail.voice.tip", { 0: (t.s || 0).toFixed(1) })) + '">✂</span>';
    else if (t && t.joined) h += '<span class="rd-mark rd-cer" data-tip="' + esc(fill("reader.tail.joined.tip", { 0: (t.s || 0).toFixed(1) })) + '">≋</span>';
    if (p.tone) h += '<span class="rd-mark rd-cer" data-tip="' + esc(fill("reader.tone.tip", { 0: (p.tone.hz / 1000).toFixed(1), 1: Number(p.tone.from).toFixed(1) })) + '">〰</span>';
    if (p.hole) h += '<span class="rd-mark rd-cer" data-tip="' + esc(fill("reader.hole.tip", { 0: Number(p.hole.s).toFixed(1), 1: Number(p.hole.from).toFixed(1) })) + '">⋯</span>';
    if (p.level_off != null) h += '<span class="rd-mark rd-cer" data-tip="' + esc(fill("reader.level.tip", { 0: (p.level_off > 0 ? "+" : "") + Number(p.level_off).toFixed(1) })) + '">' + (p.level_off > 0 ? "▲" : "▼") + "</span>";
    return h;
  }
  // HERESY 2334: the pause heard after a piece, shaped by hand to the hundredth of a second (a take joined since the pauses came says it)
  function gapRow(p, r) {
    var last = p.i === (r.pieces || []).length - 1, ed = st.gapEdits && st.gapEdits[p.i] != null;
    var v = ed ? st.gapEdits[p.i] : p.after != null ? p.after : p.pause;
    if (v == null || (last && p.pause == null && !ed)) return "";
    return '<div class="rd-gaprow"><span aria-hidden="true">⏸</span><input type="number" class="rd-gap mono" data-gi="' + p.i + '" min="0" max="60" step="0.01" value="' +
      esc(Number(v).toFixed(2)) + '" data-tip="' + esc(E("reader.fix.gap.tip")) + '"' + (r.fixing ? " disabled" : "") + ' /><span translate="no">s</span></div>';
  }
  function gapsAny(r) { return !!(st.gapEdits && Object.keys(st.gapEdits).length && !r.fixing); }
  function paintFix(keepEdit) {
    var box = $("rdFix"), r = st.fix;
    box.hidden = !r;
    if (!r) { box.innerHTML = ""; return; }
    var busy = r.fixing ? '<span class="rd-chip st-running">' + esc(fill("reader.fix.busy", { "#0": (r.fixing.piece || 0) + 1 })) + "</span>" : "";
    var h = '<div class="rd-fix-head"><b translate="no">' + esc(r.title || r.id) + "</b>" + credit(r.engine) + busy +
      '<button type="button" class="btn ghost small icon-only rd-ib" data-fx="undo"' + ((r.fixes || []).length && !r.fixing ? "" : " disabled") + ' aria-label="' + esc(fill("reader.fix.undo", { "#0": (r.fixes || []).length })) +
        '" data-tip="' + esc(E("reader.fix.undo.tip")) + '">' + UI("undo-2") + ((r.fixes || []).length ? '<span class="mono">' + (r.fixes || []).length + "</span>" : "") + "</button>" +   // HERESY 2514
      ib("check", "rdGapsHere", E("reader.fix.gaps"), E("reader.fix.gaps.tip"), ' data-fx="gaps"' + (gapsAny(r) ? "" : " disabled")) +   // HERESY 2334
      ib("copy", "rdGapsCopy", E("reader.fix.gapsCopy"), E("reader.fix.gapsCopy.tip"), ' data-fx="gapsCopy"' + (gapsAny(r) ? "" : " disabled")) +
      ib("x", "", E("reader.fix.close"), E("reader.fix.close"), ' data-fx="close"') + "</div>" +
      '<div class="rd-say">' + esc(E("reader.fix.pick")) + "</div>" +
      '<div class="rd-pieces">' + (r.pieces || []).map(function (p) {
        var nv = (p.versions || []).length;
        return '<div class="rd-piece' + (p.i === st.fixSel ? " is-sel" : "") + '" data-piece="' + p.i + '"><button type="button" class="btn ghost small" data-fx="play" data-i="' + p.i + '" aria-label="' + esc(E("reader.fix.play")) + '" data-tip="' + esc(E("reader.fix.play")) + '">' + (UI("play") || "▶") + "</button>" +
          '<span translate="no">' + (p.speaker ? "<b>" + esc(p.speaker) + ":</b> " : "") + esc(shown(p)) + "</span>" +
          (p.cer != null && p.cer >= 0.05 ? '<span class="rd-cer mono" data-tip="' + esc(fill("reader.cer.tip", { 0: p.heard || "" })) + '">' + esc((100 * p.cer).toFixed(0)) + " %</span>" : "") +
          '<span class="rd-vs mono">' + guardMarks(p) + (nv > 1 ? "v" + (p.v || 0) + "/" + (nv - 1) : "") + "</span></div>" + gapRow(p, r);   // HERESY 2335
      }).join("") + "</div>";
    var p = (r.pieces || [])[st.fixSel];
    if (p) {
      var cur = keepEdit && $("rdFixText") ? $("rdFixText").value : shown(p), words = cur.match(/[\p{L}\u0301\u0300]+(?:[-'’][\p{L}\u0301\u0300]+)*/gu) || [];
      h += '<label class="field"><span class="label">' + esc(fill("reader.fix.piece", { "#0": p.i + 1 })) + '</span><textarea id="rdFixText" rows="3" spellcheck="false" translate="no">' + esc(cur) + "</textarea></label>" +
        '<div class="rd-words">' + words.map(function (w, k) { return '<button type="button" class="btn ghost small rd-word" translate="no" data-word="' + k + '">' + esc(w) + "</button>"; }).join("") + "</div>" +
        '<div class="rd-vowels" id="rdVowels"></div>' +
        '<label class="check" data-tip="' + esc(E("reader.fix.remember.tip")) + '"><input type="checkbox" id="rdFixRemember" checked /> <span>' + esc(E("reader.fix.remember")) + "</span></label>" +
        '<div class="rd-actions"><button type="button" class="btn small rd-ib rd-reread" data-fx="reread"' + (r.fixing ? " disabled" : "") + ' data-tip="' + esc(E("reader.fix.reread.tip")) + '">' + UI("refresh") + "<span>" + esc(E("reader.fix.reread")) + "</span></button>" +
        ((p.versions || []).length > 1 ? '<span class="rd-vers">' + p.versions.map(function (v) {
          return '<button type="button" class="btn ' + (v.v === (p.v || 0) ? "" : "ghost ") + 'small mono" data-fx="pick" data-v="' + v.v + '"' + (r.fixing ? " disabled" : "") + ">v" + v.v + "</button>";
        }).join("") + "</span>" : "") + "</div>";
    }
    box.innerHTML = h;
  }
  // a word's vowels as buttons: the one pressed takes the acute, the word's other acutes go; remembered in the dictionary when asked
  function wordVowels(k) {
    var ta = $("rdFixText"), words = [], re = /[\p{L}\u0301\u0300]+(?:[-'’][\p{L}\u0301\u0300]+)*/gu, m;
    while ((m = re.exec(ta.value))) words.push({ at: m.index, w: m[0] });
    var it = words[k];
    if (!it) return;
    var bare = it.w.replace(/[\u0301\u0300]/g, ""), h = "";
    for (var i = 0; i < bare.length; i++) h += VOW.indexOf(bare[i].toLowerCase()) >= 0 ? '<button type="button" class="btn ghost small" translate="no" data-vk="' + k + '" data-vi="' + i + '">' + esc(bare[i]) + "</button>" : '<span translate="no">' + esc(bare[i]) + "</span>";
    $("rdVowels").innerHTML = h;
  }
  function setStress(k, vi) {
    var ta = $("rdFixText"), words = [], re = /[\p{L}\u0301\u0300]+(?:[-'’][\p{L}\u0301\u0300]+)*/gu, m;
    while ((m = re.exec(ta.value))) words.push({ at: m.index, w: m[0] });
    var it = words[k];
    if (!it) return;
    var bare = it.w.replace(/[\u0301\u0300]/g, ""), form = bare.slice(0, vi + 1) + ACUTE + bare.slice(vi + 1);
    ta.value = ta.value.slice(0, it.at) + form + ta.value.slice(it.at + it.w.length);
    if ($("rdFixRemember").checked) dictPut(bare, form.toLowerCase()).catch(function (e) { toast(e.message, "bad"); });
    paintFix(true);
    wordVowels(k);
  }
  function fixPlay(i) {
    var r = st.fix, p = r && r.pieces[i];
    if (!p || !p.at) return;
    if (st.fixPlay) { st.fixPlay.pause(); var same = st.fixPlay.dataset.i === String(i); st.fixPlay = null; if (same) return; }
    var a = new Audio("/lab/reader/file?id=" + encodeURIComponent(r.id) + "&f=take.wav&n=" + (r.fixes || []).length);
    a.dataset.i = String(i);
    st.fixPlay = a;
    a.addEventListener("loadedmetadata", function () { a.currentTime = p.at[0]; a.play().catch(function () { /* the browser said no */ }); });
    a.addEventListener("timeupdate", function () { if (a.currentTime >= p.at[1]) { a.pause(); if (st.fixPlay === a) st.fixPlay = null; } });
  }
  function fixAct(act, b) {
    var r = st.fix;
    if (!r) return;
    if (act === "close") { st.fix = null; clearTimeout(st.fixTimer); paintFix(); return; }
    if (act === "gaps" || act === "gapsCopy") {          // HERESY 2334: the pauses shaped, in place (Undo takes it back) or into a copy, a child take
      var gaps = st.gapEdits || {};
      if (!Object.keys(gaps).length) return;
      api("/reader/fix-gaps", { id: r.id, gaps: gaps, copy: act === "gapsCopy" }).then(function (d) {
        st.gapEdits = {};
        if (act === "gapsCopy") toast(fill("reader.fix.copied", { 0: d.title || d.take || "" }));
        else st.fix = d;
        paintFix();
        window.dispatchEvent(new Event("ruach-catalog"));
        reload();
      }).catch(function (e) { toast(e.message, "bad"); });
      return;
    }
    if (act === "play") { fixPlay(+b.dataset.i); return; }
    if (act === "undo") { api("/reader/fix-undo", { id: r.id }).then(function (d) { st.fix = d; paintFix(); window.dispatchEvent(new Event("ruach-catalog")); }).catch(function (e) { toast(e.message, "bad"); }); return; }
    if (act === "pick") { api("/reader/fix-pick", { id: r.id, piece: st.fixSel, v: +b.dataset.v }).then(function (d) { st.fix = d; paintFix(); window.dispatchEvent(new Event("ruach-catalog")); }).catch(function (e) { toast(e.message, "bad"); }); return; }
    if (act === "reread") {
      api("/reader/fix", { id: r.id, piece: st.fixSel, text: $("rdFixText").value }).then(function () {
        r.fixing = { status: "queued", piece: st.fixSel }; paintFix(true); fixWatch(); toast(fill("reader.fix.busy", { "#0": st.fixSel + 1 }));
      }).catch(function (e) { toast(e.message, "bad"); });
    }
  }

  // ---------------------------------------------------------------- sending a run
  function num(id) { var v = $(id).value.trim(); return v === "" ? "" : Number(v); }
  function send() {
    if (st.sending || st.absent) return;
    // HERESY 2462: the reading's title is its take's name: the names' rule before anything is sent, the cleaned one offered
    var rt = $("rdTitle").value.trim();
    if (rt && window.HeresyNames && window.HeresyNames.refusal(rt, { max: 120 })) {
      window.HeresyNames.ask(rt, { max: 120 }).then(function (v) { if (v) { $("rdTitle").value = v; send(); } });
      return;
    }
    var text = $("rdText").value.trim();
    if (!text) { toast(E("reader.empty"), "bad"); return; }
    var C = window.HeresyCollection;
    var body = { mode: st.mode, text: text, engine: $("rdEngine").value, voice: $("rdVoice").value, voices: castValues(), tags: $("rdTags").checked,
      split: $("rdSplit").value, temperature: num("rdTemp"), top_k: num("rdTopk"), hear: $("rdHear").checked, seed: $("rdSeed").value.trim(), gap: num("rdGap"), turn_gap: num("rdTurnGap"),
      card: $("rdCard").value || "auto", title: $("rdTitle").value.trim(), workspace: C && C.currentIn ? C.currentIn("reader") : C && C.current ? C.current() : "",
      lang: $("rdLang").value, stress: $("rdStress").checked, style: engine() && engine().style ? $("rdStyle").value.trim() : "" };
    if (engine() && (engine().tiers || []).length) body.tier = $("rdTier").value || "auto-quality";
    body.glyphs = $("rdGlyphs").checked;
    if ($("rdAcutesOff") && $("rdAcutesOff").checked) body.acutes_off = true;   // HERESY 2343: a test only
    st.sending = true; paintGo();
    // HERESY 2319: a reading that would wait long behind the Videographer, the Artist, a training… is asked about first (heresy-waitguard.js); waited
    // for, its hold is bound to the run, so the later music and speech wait behind it until it begins
    var WG = window.HeresyWaitGuard, label = body.title || text.split(/\s+/).slice(0, 8).join(" ");
    (WG ? WG.ask("reader", { label: label, engine: body.engine, tier: body.tier || "", card: body.card }) : Promise.resolve({ hold: null })).then(function (g) {
      return api("/reader/say", body).then(function (r) {
        if (g && g.hold) WG.bind(g.hold, r.id);
        st.watch[r.id] = true;
        keep(PREV_KEY, ""); paintBack();                 // HERESY 2511
        toast(fill("reader.sent", { "#0": r.of }));
        poll(true);
      }, function (e) { if (g && g.hold) WG.drop(g.hold); throw e; });
    }).catch(function (e) { toast(e.message, "bad"); }).then(function () { st.sending = false; paintGo(); });
  }

  // ---------------------------------------------------------------- the runs
  var ST = { queued: "waits", running: E("reader.st.running"), done: "done", failed: "failed", stopped: "stopped" };
  function voiceName(id) {
    if (!id) return E("reader.voice.engine");
    var v = st.voices.filter(function (x) { return x.id === id; })[0];
    return v ? vlabel(v) : id;
  }
  function runHtml(r) {
    var pct = r.of ? Math.min(100, Math.round(100 * (r.done || 0) / r.of)) : 0, vs = r.voices || {};
    var who = Object.keys(vs).filter(function (s) { return s || r.mode === "narration"; }).map(function (s) {
      return (s ? '<span translate="no">' + esc(s) + "</span>: " : "") + "<span>" + esc(voiceName(vs[s])) + "</span>";
    }).join(", ");
    var meta = ["<span>" + esc(E(r.mode === "dialog" ? "reader.dialog" : "reader.narration")) + "</span>", who, '<span translate="no">' + esc(r.engine_label || r.engine || "") + "</span>",
      r.tier ? "<span" + gradeAttr(r.tier) + ' translate="no">' + esc(r.tier.quant) + "</span>" : "",   // HERESY 2300: its grade
      r.where ? "<span>" + esc(r.where) + "</span>" : "", r.seed != null ? "<span>" + esc("seed " + r.seed) + "</span>" : "",   // HERESY 2565: «карта Intel», «сид 7»
      r.fixes ? '<span class="mono">' + esc(fill("reader.fixed", { "#0": r.fixes })) + "</span>" : "",
      r.book && r.book.parts ? "<span>" + esc(fill("reader.book.parts", { "#0": r.book.parts })) + "</span>" : "",   // HERESY 2344: a book, a part of one
      r.book && r.book.k ? "<span>" + esc(fill("reader.book.part", { "#0": r.book.k, "#1": r.book.of })) + "</span>" : ""].filter(Boolean).join(" · ");
    // HERESY 2511 (Viktor 12.11.2026: «По примеру с паспортами YuE2 семплов в карточки семплов Чтеца тоже добавь использование снова, регенерацию,
    // взять за базу»): one row of icons, in the order of the Musician's hand: Play, Regenerate, Reuse, Voice and settings, Fix, Whisper, the Library, ⋯
    var own = Object.keys(r.voice_labels || {}).some(function (k) { return r.voice_labels[k] === "the engine's own voice"; });
    var acts = live(r) ? ib("stop-circle", "", E("reader.stop"), E("reader.stop"), ' data-act="stop"') :
      r.take ? ib("play", "", E("reader.play"), E("reader.play.tip"), ' data-act="play"') +
        ib("refresh", "", E("reader.again"), E("reader.again.tip") + (own ? " " + E("reader.again.own") : ""), ' data-act="again"') +
        ib("to-left", "", E("reader.reuse"), E("reader.reuse.tip"), ' data-act="reuse"') +
        ib("sliders-horizontal", "", E("reader.base"), E("reader.base.tip"), ' data-act="base"') +
        ib("wrench", "", E("reader.fix"), E("reader.fix.tip"), ' data-act="fix"') +
        ib("spell-check", "", E(checking[r.take] ? "reader.wcheck.running" : "reader.wcheck"), E("reader.wcheck.tip"), ' data-act="check"' + (checking[r.take] ? " disabled" : "")).replace("rd-ib", checking[r.take] ? "rd-ib is-spin" : "rd-ib") +   // HERESY 2434
        ib("library", "", E("reader.reveal"), E("reader.reveal"), ' data-act="reveal"') +
        ib("ellipsis", "", E("reader.menu"), E("reader.menu"), ' data-act="more" aria-haspopup="menu"') : "";
    var open = st.openRun === r.id;   // HERESY 2381: the one card open, the others shut to one height
    return '<article class="rd-run ' + (open ? "is-open" : "is-shut") + '" data-id="' + esc(r.id) + '" data-status="' + esc(r.status) + '"' + (r.take ? ' data-take="' + esc(r.take) + '"' : "") + ">" +
      '<div class="rd-run-head" role="button" tabindex="0" aria-expanded="' + (open ? "true" : "false") + '"><span class="rd-run-title" translate="no">' + esc(r.title || r.id) + "</span>" +
      (r.status === "done" && r.take ? ib("play", "", E("reader.play"), E("reader.play.tip"), ' data-act="play" tabindex="-1"').replace("rd-ib", "rd-ib rd-run-play") : "") +   // HERESY 2511: heard from a shut card
      '<span class="rd-chip st-' + esc(r.status) + '">' + esc(ST[r.status] || r.status) + '</span><span class="rd-run-chev" aria-hidden="true">' + (UI("chevron-down") || "\u25be") + "</span></div>" +
      '<div class="rd-run-meta">' + meta + "</div>" +
      (live(r) ? '<div class="rd-bar"><i style="width:' + pct + '%"></i></div><div class="rd-run-meta mono"><span>' + esc(fill("reader.of", { "#0": r.done || 0, "#1": r.of || 0 })) + "</span>" +
        (r.waiting ? ' · <span translate="no">' + esc(r.waiting) + "</span>" : "") +
        (r.status === "running" && r.expect && r.elapsed != null ? " · <span>" + esc(fill("reader.tier.left", { 0: mmss(r.expect - r.elapsed) })) + "</span>" : "") + "</div>" : "") +
      (r.status === "done" && r.seconds ? '<div class="rd-run-meta mono"><span translate="no">' + esc(Math.floor(r.seconds / 60) + ":" + ("0" + Math.round(r.seconds % 60)).slice(-2)) + "</span> · <span>" + esc(E("reader.never")) + "</span>" +
        (r.tier && r.gen_s && r.seconds ? " · <span>" + esc(fill("reader.tier.measured", { 0: (r.gen_s / r.seconds).toFixed(2) })) + "</span>" : "") +
        (r.cer != null ? " · <span>" + esc(fill("reader.heard", { 0: (100 * r.cer).toFixed(1) })) + "</span>" + (r.rereads ? " · <span>" + esc(fill("reader.reread", { "#0": r.rereads })) + "</span>" : "") :
          r.hear_error ? ' · <span class="rd-cer" data-tip="' + esc(r.hear_error) + '">' + esc(E("reader.notheard")) + "</span>" :
          r.hear === false ? ' · <span class="rd-cer">' + esc(E("reader.earOff")) + "</span>" : "") +   // HERESY 2434: the ear off said, never a clean take by silence
        (r.check ? " · " + checkHtml(r.check) : "") +
        (r.lufs != null ? ' · <span translate="no">' + esc(r.lufs.toFixed(1)) + " LUFS</span>" : "") + (credit(r.engine) ? " · " + credit(r.engine) : "") + "</div>" : "") +   // HERESY 2275: the credit on the result
      (r.status === "done" && r.reread_why && r.reread_why.length ? r.reread_why.map(whyHtml).join("") : "") +   // HERESY 2295: which pieces were read again and why
      (r.status === "done" && (r.tails || r.tones || r.holes || r.level_off || r.tail_error) ? '<div class="rd-run-meta mono">' +   // HERESY 2335: the tail guard
        [r.tails ? "<span>" + esc(fill("reader.guard.tails", { "#0": r.tails })) + "</span>" : "", (r.tones || 0) + (r.holes || 0) + (r.level_off || 0) ? "<span>" + esc(fill("reader.guard.listen", { "#0": (r.tones || 0) + (r.holes || 0) + (r.level_off || 0) })) + "</span>" : "",
          r.tail_error ? '<span class="rd-cer" data-tip="' + esc(r.tail_error) + '">' + esc(E("reader.guard.failed")) + "</span>" : ""].filter(Boolean).join(" · ") + "</div>" : "") +
      (r.error ? '<div class="rd-run-err" translate="no">' + esc(r.error) + "</div>" : "") +
      (acts ? '<div class="rd-run-acts">' + acts + "</div>" : "") + "</article>";
  }
  function whyHtml(x) {   // HERESY 2295: «piece 1: inserted “пуво” at 0:11.2 · kept reading 2 of 3», the time in the take
    var parts = (x.why || []).map(function (w) {
      var key = w.kind === "swapped" ? "reader.why.swapped" : w.kind === "dropped" ? "reader.why.dropped" : "reader.why.inserted";
      var at = w.at != null ? " " + tr(fill("reader.why.at", { 0: Math.floor(w.at / 60) + ":" + ("0" + (w.at % 60).toFixed(1)).slice(-4) })) : "";
      return esc(tw(key, { 0: w.word || "", 1: w.heard || "" }) + at);
    });
    // HERESY 2566 (the UIX audit, item 46): the line in the page's language; the words as Whisper heard them never looked up (the line stays translate=no)
    if (!parts.length && x.cer != null) parts = [esc(tr(fill("reader.why.letters", { 0: (100 * x.cer).toFixed(0) })))];
    return '<div class="rd-run-meta mono" translate="no">' + esc(tr(fill("reader.why.piece", { "#0": x.piece }))) + ": " + parts.join(", ") + " · " +
      esc(tr(fill("reader.why.kept", { "#0": x.kept, "#1": x.reads }))) + "</div>";
  }
  function paintRuns() {
    var box = $("rdRuns");
    if (!box) return;
    // HERESY 2401: how many read and how many failed, said in the head; the failed and stopped ones shown on the user's word (on by default)
    var bad = st.runs.filter(function (r) { return r.status === "failed" || r.status === "stopped"; }).length, all = recall("yue2.readerRunsFailed") !== "0";
    var shownRuns = all ? st.runs : st.runs.filter(function (r) { return r.status !== "failed" && r.status !== "stopped"; });
    if ($("rdRunsN")) $("rdRunsN").textContent = st.runs.length ? fill("reader.runs.count", { "#0": st.runs.length - bad, "#1": bad }) : "";
    if ($("rdRunsFailed")) $("rdRunsFailed").setAttribute("aria-pressed", all ? "true" : "false");   // HERESY 2514
    var b = $("rdBreath");
    if (b) b.classList.toggle("is-live", st.runs.some(live));   // the breath line breathes while a run reads
    var h = shownRuns.length ? shownRuns.map(runHtml).join("") : '<span class="rd-none">' + esc(E("reader.runs.none")) + "</span>";
    if (box.dataset.html !== h) { box.innerHTML = h; box.dataset.html = h; }
  }
  function landed(before, now) {
    var was = {};
    before.forEach(function (r) { was[r.id] = r.status; });
    now.forEach(function (r) {
      if (live(r)) st.watch[r.id] = true;
      if (r.status === "done" && r.take && st.watch[r.id] && was[r.id] !== "done") {
        delete st.watch[r.id];
        window.dispatchEvent(new Event("ruach-catalog"));   // the Library reads its takes again
        toast(fill("reader.landed", { 0: r.title || r.take }));
      } else if (!live(r)) delete st.watch[r.id];
    });
  }
  function poll(now) {
    clearTimeout(st.timer);
    var open = document.body.dataset.tab === "read";
    if (!open && !Object.keys(st.watch).length && !now) return;
    api("/reader/runs").then(function (d) {
      var before = st.runs;
      st.runs = d.runs || [];
      landed(before, st.runs);
      paintRuns();
    }).catch(function () { /* the lab away a moment: the next look says */ }).then(function () {
      var anyLive = st.runs.some(live) || Object.keys(st.watch).length;
      if (anyLive || document.body.dataset.tab === "read") st.timer = setTimeout(poll, anyLive ? 2000 : 12000);
    });
  }
  function reload() {
    return Promise.all([api("/reader/engines"), api("/reader/voices"), api("/reader/cards")]).then(function (r) {
      st.absent = false; st.loaded = true;
      st.engines = r[0].engines || []; st.voices = r[1].voices || []; st.groups = r[1].groups || []; st.sets = r[1].sets || {}; st.cards = r[2] || null;
      paintForm();
      poll();
    }).catch(function (e) {
      st.absent = e.status === 404; st.loaded = true;
      paintForm();
      if (!st.absent) toast(e.message, "bad");
    });
  }

  // ---------------------------------------------------------------- HERESY 2269: a recording into a script (Whisper, then the Writer's model)
  var trOpen = null, trTimer = 0, TR_CHUNK = 6000;
  var TR_ST = { queued: "reader.tr.queuedSt", running: "reader.tr.hearing", done: "reader.tr.heard", failed: "reader.tr.failed", stopped: "reader.tr.failed" };
  function trList() {
    clearTimeout(trTimer);
    return api("/reader/transcripts").then(function (d) {
      var rows = d.transcripts || [];
      $("rdTrList").innerHTML = rows.length ? rows.map(function (t) {
        var stw = t.status === "done" && t.script ? E("reader.tr.scripted") : E(TR_ST[t.status] || "reader.tr.failed");
        var left = t.status === "running" && t.expect && t.elapsed != null ? " · " + fill("reader.tier.left", { 0: mmss(t.expect - t.elapsed) }) : "";
        return '<div class="rd-tr-row" data-tr="' + esc(t.id) + '"><span class="rd-tr-name" translate="no">' + esc(t.name) + "</span>" +
          '<span class="mono">' + (t.seconds ? mmss(t.seconds) : "") + "</span><span>" + esc(stw + left) + "</span>" +
          (t.status === "done" ? ib("eye", "", E("reader.tr.open"), E("reader.tr.open"), ' data-tr-act="open"') : "") +   // HERESY 2514
          (t.status !== "running" && t.status !== "queued" ? ib("trash", "", E("reader.tr.remove"), E("reader.tr.remove"), ' data-tr-act="remove"') : "") +
          (t.error ? '<span class="rd-run-err" translate="no">' + esc(t.error) + "</span>" : "") + "</div>";
      }).join("") : '<span class="rd-none">' + esc(E("reader.tr.none")) + "</span>";
      if ($("rdTr").open && rows.some(function (t) { return t.status === "running" || t.status === "queued"; })) trTimer = setTimeout(trList, 3000);
    }).catch(function () { /* the lab away a moment */ });
  }
  function trSend() {
    var f = $("rdTrFile").files && $("rdTrFile").files[0];
    if (!f) { toast(E("reader.tr.need"), "bad"); return; }
    $("rdTrGo").disabled = true;
    fetch("/lab/reader/transcribe?file=" + encodeURIComponent(f.name) + "&lang=" + encodeURIComponent($("rdTrLang").value), { method: "POST", body: f })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (b) { if (!r.ok && r.status !== 202) throw new Error(b.error || ("HTTP " + r.status)); return b; }); })
      .then(function () { $("rdTrFile").value = ""; toast(fill("reader.tr.queued", { 0: f.name })); return trList(); })
      .catch(function (e) { toast(e.message, "bad"); })
      .then(function () { $("rdTrGo").disabled = false; });
  }
  function trShow(id) {
    api("/reader/transcript?id=" + encodeURIComponent(id)).then(function (t) {
      trOpen = t;
      $("rdTrOut").hidden = false;
      $("rdTrText").value = t.script || t.text || "";
      $("rdTrSay").textContent = t.script ? E("reader.tr.isScript") : fill("reader.tr.isRaw", { "#0": t.words || 0 });
    }).catch(function (e) { toast(e.message, "bad"); });
  }
  function trChunks(text) {                              // the transcript in parts at its paragraphs, each small enough for any host's window
    var out = [], cur = "";
    text.split(/\n\s*\n/).forEach(function (p) {
      if (cur && cur.length + p.length + 2 > TR_CHUNK) { out.push(cur); cur = ""; }
      cur += (cur ? "\n\n" : "") + p;
    });
    if (cur) out.push(cur);
    return out;
  }
  function trPrompt(e, mode) {
    var t = (e && e.tags) || {}, tags = [];
    (t.groups || []).forEach(function (g) { (g.items || []).forEach(function (x) { tags.push((t.open || "[") + (t.form === "bare" ? "" : (g.cat || g.id) + ":") + x + (t.close || "]")); }); });
    return "You turn a raw speech transcript (Whisper's words, a new paragraph at each pause) into a script that a text-to-speech reader will read aloud. " +
      "Keep every word the speaker said and its order, in the transcript's own language: never summarize, shorten, add, explain or translate. Fix only what speech recognition clearly misheard, the punctuation and the capital letters; " +
      // HERESY 2376 (the advice took on his word of 11.11): every word for texts and Scripture; as in proofreading for streams
      (mode === "proof"
        ? "Edit it as a proofreader edits a talk for print: drop filler sounds and filler words (um, uh, э-э, ну, вот, как бы, значит, так сказать, типа, you know, like, I mean, і, ну от), stutters, words said twice by accident and false starts, and keep every other word in its order, never changing what is said; "
        : "Keep every word, filler words and repeats too: drop only the sounds that are no words (um, uh, э-э, м-м); ") +
      "keep every accent mark as it is. " +
      "When more than one voice clearly speaks (a question and its answer, an interview, a talk with the audience), write one turn a line as «Name: words», the name as the transcript gives it, else Speaker 1, Speaker 2; when one voice speaks, plain paragraphs, never a name. " +
      (tags.length ? "Where the tone is plain from the words, you may begin a sentence with one of these tags, and only these: " + tags.join(" ") + ". " : "") +
      "Return the script only: no title, no comments, no notes about what you changed.";
  }
  function trClean() {
    var raw = $("rdTrText").value.trim();
    if (!raw) return;
    if (typeof window.HeresyWriterAsk !== "function") { toast(E("reader.tr.noWriter"), "bad"); return; }
    var mode = $("rdTrMode").value === "proof" ? "proof" : "every";   // HERESY 2376
    var parts = trChunks(raw), out = [], k = 0, sys = trPrompt(engine(), mode);
    $("rdTrClean").disabled = true;
    var fail = function (x) { $("rdTrClean").disabled = false; $("rdTrSay").textContent = ""; toast(x.message || String(x), "bad"); };
    (function next() {
      if (k >= parts.length) {
        var script = out.join("\n\n");
        $("rdTrText").value = script; $("rdTrClean").disabled = false; $("rdTrSay").textContent = E("reader.tr.isScript");
        if (trOpen) api("/reader/transcript-script", { id: trOpen.id, script: script, mode: mode }).then(trList).catch(function (x) { toast(x.message, "bad"); });
        return;
      }
      $("rdTrSay").textContent = fill("reader.tr.cleaning", { "#0": k + 1, "#1": parts.length });
      window.HeresyWriterAsk([{ role: "system", content: sys }, { role: "user", content: parts[k] }], Math.min(16384, Math.round(parts[k].length * 1.2) + 512), 0.2,
        "the Narrator's transcript, part " + (k + 1) + " of " + parts.length).then(function (r) {
        // HERESY 2468 (the audit of 12.11.2026, 3.6): HeresyWriterAsk answers {text, model, cut}; reading choices[0] here made every cleanup «empty»
        var c = (r && typeof r.text === "string" ? r.text : ((((r && r.choices) || [])[0] || {}).message || {}).content) || "";
        c = String(c).replace(/<think>[\s\S]*?<\/think>/g, "").trim();
        if (!c) throw new Error(E("reader.tr.empty"));
        out.push(c); k++; next();
      }).catch(fail);
    })();
  }
  // HERESY 2344 (the plan of 08.11.2026: «кнопка «Писатель → Чтец»»): a text into the Reader from another room, a dialog when most lines are
  // «Name: words» (trUse's own reading), its title with it, the room opened
  function intoReader(t, title) {
    t = String(t || "").trim();
    if (!t) return false;
    $("rdText").value = t;
    $("rdText").dispatchEvent(new Event("input"));
    var names = {}, lines = t.split("\n").filter(function (l) { return l.trim(); }), turns = 0;
    lines.forEach(function (l) {
      var m = /^\s*([^\s:<>|\d[][^:<>|\n.!?]{0,29}?)\s*[:：]\s+\S/.exec(l);
      if (m && m[1].trim().split(/\s+/).length <= 3) { names[m[1].trim()] = 1; turns++; }
    });
    var want = Object.keys(names).length >= 2 && turns >= 0.6 * lines.length ? "dialog" : "narration";
    if (st.mode !== want) { $("rdMode").value = want; $("rdMode").dispatchEvent(new Event("change")); }
    if (title) $("rdTitle").value = String(title).slice(0, 120);
    var tb = document.querySelector('.topbar [data-tab="read"]');
    if (tb) tb.click();
    toast(fill("reader.toReader.done", { 0: title || "" }));
    return true;
  }
  // the Writer's notebook gets «Read in the Reader» beside «Load into the Creator» (a page without the Reader has none)
  function writerButton() {
    var hand = $("wrHandBtn");
    if (!hand || $("wrToReader")) return;
    var b = document.createElement("button");
    b.type = "button"; b.id = "wrToReader"; b.className = "btn ghost small"; b.dataset.tip = E("reader.toReader.tip");
    // HERESY 2470: the icon apart from the words, so the page's languages find «Read in the Narrator» whole (with it they never did)
    var ico = document.createElement("span");
    ico.setAttribute("aria-hidden", "true");
    ico.textContent = "🗣";
    b.appendChild(ico);
    b.appendChild(document.createTextNode(" "));
    var words = document.createElement("span");
    words.textContent = E("reader.toReader");
    b.appendChild(words);
    b.addEventListener("click", function () {
      var W = window.HeresyWriter;
      if (!W || !W.openDoc || !W.openDoc()) return;
      (W.flush ? W.flush() : Promise.resolve()).then(function () {
        var doc = W.openDoc() || {}, t = String(doc.lyrics || "").trim() ||
          String(doc.notes || "").replace(/^#{1,6}\s*/gm, "").replace(/[*_`]/g, "").trim();
        if (!intoReader(t, doc.title || "")) toast(E("reader.toReader.empty"), "bad");
      }).catch(function (e) { toast(e.message || String(e), "bad"); });
    });
    hand.parentNode.insertBefore(b, hand.nextSibling);
  }
  function trUse() {
    var t = $("rdTrText").value.trim();
    if (!t) return;
    $("rdText").value = t;
    $("rdText").dispatchEvent(new Event("input"));
    // a dialog when most lines are «Name: words» (a short name, three words at most) and two names or more speak; a colon inside a lecture's
    // sentence is no speaker (09.11: a raw transcript of one voice read as a dialog)
    var names = {}, lines = t.split("\n").filter(function (l) { return l.trim(); }), turns = 0;
    lines.forEach(function (l) {
      var m = /^\s*([^\s:<>|\d[][^:<>|\n.!?]{0,29}?)\s*[:：]\s+\S/.exec(l);
      if (m && m[1].trim().split(/\s+/).length <= 3) { names[m[1].trim()] = 1; turns++; }
    });
    var want = Object.keys(names).length >= 2 && turns >= 0.6 * lines.length ? "dialog" : "narration";
    if (st.mode !== want) { $("rdMode").value = want; $("rdMode").dispatchEvent(new Event("change")); }
    if (trOpen && !$("rdTitle").value.trim()) $("rdTitle").value = String(trOpen.name || "").replace(/\.[^.]+$/, "");
    toast(E("reader.tr.used"));
  }
  // HERESY 2270: the glyph map's editor; a test page (?scope=) has its copy checked by the lab and never written
  var SCOPE = (function () { try { return new URLSearchParams(location.search).get("scope") || ""; } catch (e) { return ""; } })();
  function scoped(path) { return path + (SCOPE ? "?scope=" + encodeURIComponent(SCOPE) : ""); }
  // HERESY 2376: the table: a row a line of the file (a rule, or a comment or blank line kept as it is); a row untouched is written back byte for
  // byte, so a save changes only the lines edited; the lab checks the whole map as it is typed and names a broken rule by its line
  var gm = { rows: [], text: false, dirty: false, errs: {}, hits: {}, t: 0, n: 0, last: null };
  var GM_KINDS = ["lit", "word", "re"];
  function gmRows(text) {
    var lines = String(text || "").replace(/\r/g, "").split("\n");
    if (lines.length && lines[lines.length - 1] === "") lines.pop();
    return lines.map(function (l) {
      var f = l.split("\t"), rule = l.trim() !== "" && l.replace(/^\s+/, "").charAt(0) !== "#";
      return rule ? { raw: l, rule: true, kind: f[0].trim(), what: f[1] || "", "with": f[2] || "", note: f.slice(3).join("\t") } : { raw: l, rule: false };
    });
  }
  function gmLine(r) {
    if (!r.edited) return r.raw;
    if (!r.rule) return r.raw;
    var f = [r.kind, r.what, r["with"]];
    if (r.note) f.push(r.note);
    return f.join("\t");
  }
  function gmText() { return gm.text ? $("rdGmapText").value : gm.rows.map(gmLine).join("\n") + (gm.rows.length ? "\n" : ""); }
  function gmClean(v) { return String(v || "").replace(/[\t\r\n]/g, " "); }   // a field never carries the separator
  function gmDraw() {
    var q = $("rdGmFind").value.trim().toLowerCase();
    $("rdGmRows").innerHTML = gm.rows.map(function (r, i) {
      var hay = (r.rule ? [r.kind, r.what, r["with"], r.note].join(" ") : r.raw).toLowerCase();
      if (q && hay.indexOf(q) < 0) return "";
      var err = gm.errs[i + 1], cls = (r.rule ? "" : "is-comment") + (err ? " is-bad" : "") + (gm.hits[i + 1] ? " is-hit" : "");
      var head = '<tr data-i="' + i + '" class="' + cls + '"' + (err ? ' data-tip="' + esc(err) + '"' : "") + '><td class="n">' + (i + 1) + (gm.hits[i + 1] ? " ·" + gm.hits[i + 1] : "") + "</td>";
      var del = '<td class="x"><button type="button" class="btn ghost small" data-gm-del="' + i + '" aria-label="' + esc(E("reader.gmap.del")) + '" data-tip="' + esc(E("reader.gmap.del")) + '">' + (UI("x") || "✕") + '</button></td></tr>';
      if (!r.rule) return head + '<td colspan="4"><input type="text" data-gm="raw" value="' + esc(r.raw) + '" spellcheck="false" /></td>' + del;
      return head + '<td><select data-gm="kind">' + GM_KINDS.concat(GM_KINDS.indexOf(r.kind) < 0 ? [r.kind] : []).map(function (k) {
        return '<option value="' + esc(k) + '"' + (k === r.kind ? " selected" : "") + ">" + esc(k) + "</option>"; }).join("") + "</select></td>" +
        '<td><input type="text" data-gm="what" value="' + esc(r.what) + '" spellcheck="false" /></td>' +
        '<td><input type="text" data-gm="with" value="' + esc(r["with"]) + '" spellcheck="false" /></td>' +
        '<td><input type="text" data-gm="note" value="' + esc(r.note) + '" spellcheck="false" /></td>' + del;
    }).join("");
  }
  function gmMark() {                                    // the rows' marks redrawn without losing the field being typed in
    Array.prototype.forEach.call($("rdGmRows").querySelectorAll("tr[data-i]"), function (tr) {
      var n = +tr.dataset.i + 1, err = gm.errs[n];
      tr.classList.toggle("is-bad", !!err);
      tr.classList.toggle("is-hit", !!gm.hits[n]);
      if (err) tr.dataset.tip = err; else tr.removeAttribute("data-tip");
      var c = tr.querySelector("td.n");
      if (c) c.textContent = n + (gm.hits[n] ? " ·" + gm.hits[n] : "");
    });
  }
  function gmSay() {
    var bad = Object.keys(gm.errs).length;
    $("rdGmapSay").textContent = bad ? fill("reader.gmap.bad", { "#0": bad }) : gm.dirty ? E("reader.gmap.unsaved") : "";
    $("rdGmapSave").classList.toggle("is-on", gm.dirty);
  }
  function gmCheck() {                                   // the whole map as it stands checked by the lab, the line tried by it
    clearTimeout(gm.t);
    gm.t = setTimeout(function () {
      var n = ++gm.n, line = $("rdGmTry").value;
      api("/reader/glyphs-try", { map: gmText(), text: line }).then(function (r) {
        if (n !== gm.n) return;
        gm.errs = {};
        (r.errors || []).forEach(function (e) { var m = /^line (\d+): (.*)$/.exec(e); if (m) gm.errs[+m[1]] = m[2]; });
        gm.hits = line ? r.hits || {} : {};
        if (!gm.text) gmMark();
        $("rdGmTryOut").textContent = line ? r.text + (Object.keys(gm.hits).length ? "   ← " + fill("reader.gmap.hits", { "#0": Object.keys(gm.hits).length }) : "") : "";
        gmSay();
      }).catch(function () { /* the lab away a moment: the next keystroke asks again */ });
    }, 350);
  }
  function gmEdited() { gm.dirty = true; gmSay(); gmCheck(); }
  function gmapPaint(g) {
    gm.last = g;
    gm.rows = gmRows(g.text || "");
    gm.dirty = false; gm.errs = {}; gm.hits = {};
    (g.errors || []).forEach(function (e) { var m = /^line (\d+): (.*)$/.exec(e); if (m) gm.errs[+m[1]] = m[2]; });
    $("rdGmapText").value = g.text || "";
    gmDraw();
    $("rdGmapN").textContent = g.rules ? fill("reader.gmap.rules", { "#0": g.rules }) : "";
    $("rdGmapSrc").textContent = g.source === "user" ? fill("reader.gmap.user", { 0: g.path }) : g.source === "his" ? fill("reader.gmap.hisEdit", { 0: g.path }) :
      fill("reader.gmap.new", { 0: g.target || g.user || "" });
    $("rdGmapReset").disabled = g.source !== "user" || !g.his;
    $("rdGmapReset").hidden = !g.his || g.source === "none";
    var kept = g.backups || [];
    $("rdGmapUndo").disabled = !kept.length;
    $("rdGmapKept").textContent = kept.length ? fill("reader.gmap.kept", { "#0": kept.length, 1: kept[0].at, 2: g.kept_in || "" }) : "";
    gmSay();
    if ($("rdGmTry").value) gmCheck();
  }
  function gmapLoad() { return api("/reader/glyphs").then(gmapPaint).catch(function (e) { toast(e.message, "bad"); }); }
  function gmapSave() {
    api(scoped("/reader/glyphs"), { text: gmText() }).then(function (g) {
      var wasText = gm.text;
      gmapPaint(g);
      if (wasText) $("rdGmapText").value = g.text || "";
      toast(g.test ? E("reader.gmap.test") : g.kept ? fill("reader.gmap.savedTo", { 0: g.saved, 1: g.kept }) : E("reader.gmap.same"));
    }).catch(function (e) { $("rdGmapSay").textContent = e.message; toast(e.message, "bad"); });
  }
  function gmapUndo() {
    var kept = (gm.last && gm.last.backups) || [];
    if (!kept.length) return;
    window.HeresyDialog.confirm(fill("reader.gmap.undoAsk", { 0: kept[0].at }), { ok: E("reader.gmap.undo") }).then(function (yes) {
      if (yes) api(scoped("/reader/glyphs-undo"), {}).then(function (g) { gmapPaint(g); if (!g.test) toast(fill("reader.gmap.undone", { 0: g.restored || "" })); })
        .catch(function (e) { toast(e.message, "bad"); });
    });
  }
  function gmView() {                                   // the table or the plain text, each made from the other
    if (gm.text) { gm.rows = gmRows($("rdGmapText").value); gmDraw(); } else { $("rdGmapText").value = gmText(); }
    gm.text = !gm.text;
    $("rdGmapText").hidden = !gm.text;
    $("rdGmWrap").hidden = gm.text;
    $("rdGmFind").disabled = $("rdGmAdd").disabled = gm.text;
    var gv = $("rdGmView"), gw = E(gm.text ? "reader.gmap.asTable" : "reader.gmap.asText");   // HERESY 2514: an icon that says what it switches to
    gv.innerHTML = UI(gm.text ? "layout-grid" : "type") || esc(gw);
    gv.setAttribute("aria-label", gw); gv.dataset.tip = gw; gv.setAttribute("aria-pressed", gm.text ? "true" : "false");
  }
  function gmapReset() {
    window.HeresyDialog.confirm(E("reader.gmap.resetAsk"), { ok: E("reader.gmap.reset") }).then(function (yes) {
      if (yes) api(scoped("/reader/glyphs-reset"), {}).then(gmapPaint).catch(function (e) { toast(e.message, "bad"); });
    });
  }
  window.ruachReaderTr = { prompt: function (mode) { return trPrompt(engine(), mode); }, chunks: trChunks };   // HERESY 2269: for the checks

  // ---------------------------------------------------------------- one's own voice, under the red warning
  function ownSend() {
    var f = $("rdOwnFile").files && $("rdOwnFile").files[0], name = $("rdOwnName").value.trim();
    if (!$("rdOwnOk").checked || !f || !name) { toast(E("reader.own.need"), "bad"); return; }
    if (window.HeresyNames && window.HeresyNames.refusal(name, { max: 60 })) {   // HERESY 2462: a voice's name keeps the names' rule
      window.HeresyNames.ask(name, { max: 60 }).then(function (v) { if (v) { $("rdOwnName").value = v; ownSend(); } });
      return;
    }
    var rd = new FileReader();
    rd.onload = function () {
      var b64 = String(rd.result || "").replace(/^data:[^,]*,/, ""), ext = (f.name.split(".").pop() || "wav").toLowerCase();
      api("/reader/voice", { name: name, lang: $("rdOwnLang").value, text: $("rdOwnText").value.trim(), consent: true, audio_b64: b64, ext: ext }).then(function (v) {
        toast(fill("reader.own.kept", { 0: v.name || name }));
        $("rdOwn").hidden = true; $("rdOwnOk").checked = false; $("rdOwnFile").value = ""; $("rdOwnFileName").textContent = "";
        keep("yue2.readerVoice", "v:" + v.id);
        return voicesAgain();
      }).catch(function (e) { toast(e.message, "bad"); });
    };
    rd.readAsDataURL(f);
  }

  function voicesAgain() {
    return api("/reader/voices").then(function (d) { st.voices = d.voices || []; st.groups = d.groups || []; st.sets = d.sets || {}; paintVoice(); $("rdCast").dataset.key = ""; paintCast(); });
  }

  // ---------------------------------------------------------------- HERESY 2455: the voice builder (lab/reader_design.py)
  function designForm() {
    var e = engine(), langs = (e || {}).langs || [], sel = $("rdDsLang"), can = !!(e && e.style && e.style.kind === "bracket");
    if (!sel) return;
    var want = recall("yue2.readerDesignLang") || (langs.indexOf(lang()) >= 0 ? lang() : "") || langs[0] || "";
    setOpts(sel, langs.map(function (l) { return '<option value="' + esc(l) + '" translate="no">' + esc(l) + "</option>"; }).join(""), want);
    $("rdDsGo").disabled = !can || !!(st.design && live(st.design));
    $("rdDsGo").dataset.tip = can ? E("reader.design.make.tip") : E("reader.design.noengine");
    designWords();
  }
  function designWords() {
    var l = $("rdDsLang").value;
    if (!l || $("rdDsText").dataset.lang === l) return;
    $("rdDsText").dataset.lang = l;
    api("/reader/design-text?lang=" + encodeURIComponent(l)).then(function (d) { if ($("rdDsLang").value === l) $("rdDsText").placeholder = d.text || ""; }).catch(function () { /* the words of the Studio come with the run anyway */ });
  }
  function dsMeasures(c) {
    var m = [];
    if (c.f0) m.push('<span data-tip="' + esc(E("reader.design.pitch.tip")) + '">' + esc(fill("reader.design.pitch", { "#0": Math.round(c.f0), "#1": Math.round(c.f0_p10), "#2": Math.round(c.f0_p90), 3: c.span_st }) + " · " + E(c.gender === "female" ? "reader.female" : "reader.male")) + "</span>");
    else m.push("<span>" + esc(E("reader.design.nopitch")) + "</span>");
    m.push('<span data-tip="' + esc(E("reader.design.bright.tip")) + '">' + esc(fill("reader.design.bright", { "#0": c.bright })) + "</span>");
    var bg = c.quiet_db == null ? E("reader.design.bg.never") : fill(c.noisy ? "reader.design.bg.noisy" : "reader.design.bg", { 0: c.quiet_db });
    m.push('<span class="' + (c.noisy ? "is-bad" : "") + '" data-tip="' + esc(E("reader.design.bg.tip")) + '">' + esc(bg) + "</span>");
    if (c.creak != null) m.push('<span class="' + (c.creak >= 0.15 ? "is-bad" : "") + '" data-tip="' + esc(E("reader.design.creak.tip")) + '">' + esc(fill("reader.design.creak", { 0: Math.round(100 * c.creak) })) + "</span>");
    return m.join("");
  }
  function designPaint() {
    var d = st.design, say = $("rdDsSay"), box = $("rdDsCands");
    var going = !!d && live(d);
    $("rdDsStop").hidden = !going;
    designForm();
    if (!d) { say.textContent = ""; box.innerHTML = ""; $("rdDsCredit").hidden = true; return; }
    say.textContent = d.status === "queued" ? E("reader.design.waits") : d.status === "running" ? fill("reader.design.reading", { "#0": Math.min((d.done || 0) + 1, d.of || 1), "#1": d.of || 1 })
      : d.status === "failed" ? fill("reader.design.failed", { 0: d.error || "" }) : d.status === "stopped" ? E("reader.design.stopped") : "";
    var cs = d.status === "done" ? d.candidates || [] : [], kept = d.kept || {};
    var h = cs.map(function (c) {
      var k = kept[c.cand];
      return '<div class="rd-cand' + (k ? " is-kept" : "") + '" data-cand="' + esc(c.cand) + '"><div class="rd-cand-head"><span class="rd-cand-t">' +
        esc(fill("reader.design.cand", { 0: c.cand.toUpperCase(), "#1": c.seed })) + '</span>' + ib("vol-hi", "", E("reader.listen"), E("reader.listen.tip"), ' data-ds-play="' + esc(c.cand) + '"') + "</div>" +
        '<div class="rd-cand-m">' + dsMeasures(c) + "</div>" +
        (k ? '<div class="rd-cand-kept">' + esc(fill("reader.design.kept", { 0: k.name })) + "</div>"
          : '<div class="rd-cand-keep"><input type="text" maxlength="60" spellcheck="false" data-ds-name="' + esc(c.cand) + '" placeholder="' + esc(E("reader.design.name.ph")) + '" data-tip="' +
            esc(E("reader.design.name.tip")) + '" />' + ib("floppy", "", E("reader.design.keep"), E("reader.design.keep"), ' data-ds-keep="' + esc(c.cand) + '"') + "</div>") + "</div>";
    }).join("");
    var sig = d.id + "|" + d.status + "|" + JSON.stringify(kept);
    if (box.dataset.sig !== sig) {
      var names = {};
      Array.prototype.forEach.call(box.querySelectorAll("input[data-ds-name]"), function (x) { names[x.dataset.dsName] = x.value; });   // what was typed stays
      box.innerHTML = h; box.dataset.sig = sig;
      Array.prototype.forEach.call(box.querySelectorAll("input[data-ds-name]"), function (x) { if (names[x.dataset.dsName]) x.value = names[x.dataset.dsName]; });
    }
    $("rdDsCredit").hidden = !cs.length || !d.credit;   // HERESY 2275: the engine's credit beside its result, never on the form
    $("rdDsCredit").textContent = d.credit || "";
  }
  function designWatch() {
    clearTimeout(st.designTimer);
    if (!st.design || !live(st.design)) return;
    st.designTimer = setTimeout(function () {
      api("/reader/design?id=" + encodeURIComponent(st.design.id)).then(function (d) { st.design = d; designPaint(); designWatch(); })
        .catch(function () { designWatch(); });
    }, 2500);
  }
  function designSend() {
    var e = engine(), text = $("rdDsDescribe").value.trim();
    if (!text) { toast(E("reader.design.need"), "bad"); return; }
    keep("yue2.readerDesignDescribe", text);
    var body = { describe: text, lang: $("rdDsLang").value, gender: $("rdDsGender").value, n: +$("rdDsN").value, seeds: $("rdDsSeeds").value.trim(),
      text: $("rdDsText").value.trim(), engine: e ? e.id : "", card: $("rdCard").value || "auto", temperature: num("rdTemp") };
    if (e && (e.tiers || []).length) body.tier = $("rdTier").value || "auto-quality";
    $("rdDsGo").disabled = true;
    api("/reader/design", body).then(function (r) {
      st.design = { id: r.id, status: "queued", of: r.of, done: 0 };
      keep("yue2.readerDesignRun", r.id);
      toast(fill("reader.design.sent", { "#0": body.n }));
      designPaint(); designWatch();
    }).catch(function (x) { toast(x.message, "bad"); designForm(); });
  }
  function designPlay(k, btn) {
    if (!st.design) return;
    var from = "ds-" + st.design.id + "-" + k;
    if (st.audio) { var was = st.audio.from; st.audio.el.pause(); st.audio = null; if (was === from) return; }
    var a = new Audio("/lab/reader/file?id=" + encodeURIComponent(st.design.id) + "&f=cand-" + encodeURIComponent(k) + ".wav");
    st.audio = { el: a, from: from };
    a.addEventListener("ended", function () { if (st.audio && st.audio.el === a) st.audio = null; });
    a.play().catch(function () { /* the browser said no: nothing to say */ });
  }
  function designKeep(k) {
    var inp = $("rdDsCands").querySelector('input[data-ds-name="' + k + '"]'), name = inp ? inp.value.trim() : "";
    if (!name) { toast(E("reader.design.name.ph"), "bad"); if (inp) inp.focus(); return; }
    var N = window.HeresyNames;                          // the Studio's one rule for every name, where the page has it: asked, never changed quietly
    if (N && N.refusal(name, { max: 60 })) { N.ask(name, { max: 60 }).then(function (v) { if (v) { inp.value = v; designKeep(k); } }); return; }
    if (/[\/\\*~?:"<>|]/.test(name)) { toast(E("reader.design.name.tip"), "bad"); if (inp) inp.focus(); return; }
    api("/reader/design-keep", { id: st.design.id, cand: k, name: name }).then(function (v) {
      toast(fill("reader.own.kept", { 0: v.name || name }));
      (st.design.kept = st.design.kept || {})[k] = { id: v.id, name: v.name || name };
      designPaint();
      return voicesAgain();
    }).catch(function (x) { toast(x.message, "bad"); });
  }
  function designBind() {
    $("rdDsDescribe").value = recall("yue2.readerDesignDescribe") || "";
    $("rdDesignOpen").addEventListener("click", function () {
      $("rdDesign").hidden = !$("rdDesign").hidden;
      if ($("rdDesign").hidden) return;
      designForm();
      $("rdDesign").scrollIntoView({ block: "nearest", behavior: "smooth" });
      var rid = recall("yue2.readerDesignRun");
      if (rid && !st.design) api("/reader/design?id=" + encodeURIComponent(rid)).then(function (d) { st.design = d; designPaint(); designWatch(); }).catch(function () { keep("yue2.readerDesignRun", ""); });
    });
    $("rdDsClose").addEventListener("click", function () { $("rdDesign").hidden = true; });
    $("rdDsLang").addEventListener("change", function () { keep("yue2.readerDesignLang", this.value); designWords(); });
    $("rdDsGo").addEventListener("click", designSend);
    $("rdDsStop").addEventListener("click", function () { if (st.design) api("/reader/stop", { id: st.design.id }).catch(function (x) { toast(x.message, "bad"); }); });
    $("rdDsCands").addEventListener("click", function (e) {
      var b = e.target.closest("[data-ds-play]");
      if (b) { designPlay(b.dataset.dsPlay, b); return; }
      b = e.target.closest("[data-ds-keep]");
      if (b) designKeep(b.dataset.dsKeep);
    });
    $("rdDsCands").addEventListener("keydown", function (e) { var x = e.target.closest("input[data-ds-name]"); if (x && e.key === "Enter") designKeep(x.dataset.dsName); });
  }

  // ---------------------------------------------------------------- HERESY 2511–2513 (Viktor 12.11.2026: «Сделай Чтеца ну… практически зеркалом
  // Музыканта… Но самое главное — не переборщить»): a reading's take as the Musician's: Play, Regenerate (read again with a new seed, straight into
  // the queue, the new take beside the old and its child in the family tree), Reuse, Voice and settings, Retake exactly, Only its text; the form as it
  // was kept once before it is poured over (↶ in the lectern's head); its passport and its menu speak of a reading, not of a song. What the run
  // had and this machine has not (a voice removed, an engine or a tier not here) is said aloud, never quietly replaced (the lab's form.missing)
  function UI(n) { return window.HeresyIcons && window.HeresyIcons.ui ? window.HeresyIcons.ui(n) : ""; }
  function ib(icon, id, label, tip, extra) {
    var g = UI(icon);
    return '<button type="button" class="btn ghost small icon-only rd-ib"' + (id ? ' id="' + id + '"' : "") + ' aria-label="' + esc(label) + '" data-tip="' + esc(tip || label) + '"' + (extra || "") + ">" +
      (g || esc(label)) + "</button>";
  }
  function byTake(name) { return api("/reader/run?take=" + encodeURIComponent(name)); }
  function titleOf(name) {
    var HC = window.HeresyCollection, row = HC && HC.row ? HC.row(name) : null, t = window.ruachFindTakeFull ? window.ruachFindTakeFull(name) : null;
    return (row && row.title) || (t && t.title) || name;
  }
  function toRoom() { if (document.body.dataset.tab !== "read" && $("tabRead")) $("tabRead").click(); }
  function voiceRef(id) {                                // a run's voice as the pickers hold it; null: no longer here
    if (!id) return "";
    if (st.voices.some(function (v) { return v.id === id; })) return "v:" + id;
    var g = vgroups().filter(function (x) { return x.centre === id; })[0];
    return g ? "g:" + g.id : null;
  }
  var PREV_KEY = "yue2.readerFormPrev";
  function formNow() {
    var e = engine();
    return { text: $("rdText").value, title: $("rdTitle").value, mode: st.mode, split: $("rdSplit").value, tags: $("rdTags").checked, engine: e ? e.id : "",
      voice: $("rdVoice").value, cast: JSON.parse(JSON.stringify(st.cast || {})), lang: $("rdLang").value, style: $("rdStyle").value, stress: $("rdStress").checked,
      glyphs: $("rdGlyphs").checked, card: $("rdCard").value, tier: $("rdTier").value, temperature: $("rdTemp").value, top_k: $("rdTopk").value, seed: $("rdSeed").value,
      gap: $("rdGap").value, turn_gap: $("rdTurnGap").value, hear: $("rdHear").checked };
  }
  // the form from what is kept: every picker the room paints from the browser's memory (engine, card, tier, voice, style, mode and its tags,
  // the cast), the rest set in place; a field left undefined is left as it is
  function formSet(f) {
    var has = function (id) { return st.engines.some(function (e) { return e.id === id; }); };
    if (f.engine != null && has(f.engine)) keep("yue2.readerEngine", f.engine);
    var eid = f.engine != null && has(f.engine) ? f.engine : (engine() || {}).id;
    if (f.mode) { st.mode = f.mode === "dialog" ? "dialog" : "narration"; keep("yue2.readerMode", st.mode); }
    if (f.tags != null) keep("yue2.readerTags." + st.mode, f.tags ? "1" : "0");
    if (f.voice != null) keep("yue2.readerVoice", f.voice);
    if (f.cast) { st.cast = JSON.parse(JSON.stringify(f.cast)); keep("yue2.readerCast", JSON.stringify(st.cast)); if ($("rdCast")) $("rdCast").dataset.key = ""; }
    if (f.card != null && f.card !== "") keep("yue2.readerCard", String(f.card));
    if (f.tier && eid) keep("yue2.readerTier." + eid, f.tier);
    if (f.style != null && eid) keep("yue2.readerStyle." + eid, f.style);
    if (f.text != null) { $("rdText").value = f.text; keep("yue2.readerText", String(f.text).slice(0, 200000)); }
    if (f.title != null) $("rdTitle").value = f.title;
    [["split", "rdSplit"], ["temperature", "rdTemp"], ["top_k", "rdTopk"], ["gap", "rdGap"], ["turn_gap", "rdTurnGap"]].forEach(function (p) {
      if (f[p[0]] == null || f[p[0]] === "") return;
      $(p[1]).value = String(f[p[0]]);
      keep("yue2.reader." + p[1], $(p[1]).value);
    });
    if (f.lang != null) { $("rdLang").value = f.lang; if ($("rdLang").selectedIndex < 0) $("rdLang").value = "auto"; keep("yue2.readerLang", $("rdLang").value); }
    if (f.stress != null) { $("rdStress").checked = !!f.stress; keep("yue2.readerStress", f.stress ? "" : "0"); }
    if (f.hear != null) { $("rdHear").checked = !!f.hear; keep("yue2.readerHear", f.hear ? "" : "0"); }
    if (f.glyphs != null) { $("rdGlyphs").checked = !!f.glyphs; keep("yue2.readerGlyphs", f.glyphs ? "1" : ""); }
    if (f.seed !== undefined) $("rdSeed").value = f.seed == null ? "" : String(f.seed);
    paintForm();
    count();
  }
  function paintBack() { if ($("rdFormBack")) $("rdFormBack").hidden = !recall(PREV_KEY); }
  function formBack() {
    var f = json(recall(PREV_KEY), null);
    if (!f) return;
    formSet(f);
    keep(PREV_KEY, ""); paintBack();
    toast(E("reader.formBackDone"), "good");
  }
  // how: reuse (all of it, the seed empty), base (voices and settings, the form's text and title stay), retake (all of it, the seed too), text
  function pour(name, how) {
    return byTake(name).then(function (r) {
      var f = r.form || {}, miss = f.missing || {}, said = [], v = {}, labels = f.voice_labels || {};
      var all = how === "reuse" || how === "retake";
      if (all || how === "text") { v.text = f.text || ""; v.title = f.title || ""; }
      if (all || how === "base") {
        if (miss.engine) said.push(fill("reader.engineGone", { 0: miss.engine }));
        else {
          v.engine = f.engine; v.style = f.style; v.card = f.card;
          if (miss.tier) said.push(fill("reader.tierGone", { 0: miss.tier })); else v.tier = f.tier;
        }
        ["mode", "split", "tags", "lang", "stress", "glyphs", "hear", "temperature", "top_k", "gap", "turn_gap"].forEach(function (k) { v[k] = f[k]; });
        var ref = function (id, who) { var x = voiceRef(id); if (x === null) { said.push(fill("reader.voiceGone", { 0: labels[who] || id })); x = ""; } return x; };
        v.voice = ref(f.voice, "");
        v.cast = {};
        Object.keys(f.voices || {}).forEach(function (s) { v.cast[s] = ref(f.voices[s], s); });
        // the engine's own voice is born of the seed: Voice and settings keeps it then, else the voice would not be the one taken
        var own = f.mode === "dialog" ? Object.keys(f.voices || {}).some(function (s) { return !f.voices[s]; }) : !f.voice;
        v.seed = how === "retake" || (how === "base" && own) ? f.seed : "";
      }
      keep(PREV_KEY, JSON.stringify(formNow()));
      formSet(v);
      paintBack();
      toRoom();
      toast(fill("reader.formIn", { 0: f.title || titleOf(name) }), "good");
      said.forEach(function (w) { toast(w, "bad"); });
      return how;
    }).catch(function (e) { toast(e.message, "bad"); });
  }
  function intoForm(name) {
    var last = recall("yue2.openInReader") || "reuse";
    var items = [["reuse", "reader.reuse", "reader.reuse.tip"], ["base", "reader.base", "reader.base.tip"], ["retake", "reader.retake", "reader.retake.tip"],
      ["text", "reader.textOnly", "reader.textOnly.tip"]].map(function (x) { return { value: x[0], label: E(x[1]), note: E(x[2]), words: true, current: x[0] === last }; });
    return window.HeresyDialog.choose(E("reader.intoForm") + "\n\n" + fill("reader.intoForm.note", { 0: titleOf(name) }), items, { cancel: E("reader.own.cancel") }).then(function (v) {
      if (!v) return null;
      keep("yue2.openInReader", v);
      return pour(name, v);
    });
  }
  function regen(name) {
    return api("/regen", { names: [name] }).then(function (d) {
      var x = (d.regen || [])[0] || {};
      if (x.error) throw new Error(x.error);
      if (x.reader) st.watch[x.reader] = true;
      toast(fill("reader.regen.landed", { 0: titleOf(name) }), "good");
      poll(true);
    }).catch(function (e) { toast(e.message, "bad"); });
  }
  function playTake(name) {
    if (window.ruachPlayNamed) return window.ruachPlayNamed(name);
    if (window.ruachOpenTake) window.ruachOpenTake(name);
  }
  function fixFrom(name) {
    return byTake(name).then(function (r) { toRoom(); return fixOpen(r.id); }).catch(function (e) { toast(e.message, "bad"); });
  }
  // the reading's text into the Writer: the document it was read from gets it as a new version, else a new reading (lab writer.py from_reader)
  function toWriter(name) {
    return byTake(name).then(function (r) {
      var f = r.form || {};
      return api(scoped("/writer"), { op: "from_reader", text: f.text || "", title: f.title || "", doc: (r.facts || {}).doc || "" });
    }).then(function (d) {
      var doc = (d && d.doc) || {}, W = window.HeresyWriter;
      toast(fill("reader.toWriter.done", { 0: doc.title || "" }), "good");
      if (W && W.reload) W.reload();
      if (W && typeof W.open === "function" && doc.id) { var tab = document.querySelector('#tabs [data-tab="write"]'); if (tab) tab.click(); W.open(doc.id); }
    }).catch(function (e) { toast(e.message, "bad"); });
  }
  // the take's menu in the Library (app.js takeMenu asks for these on a reading's take)
  function menuItems(name) {
    var go = function (how) { return function () { pour(name, how); }; };
    return {
      regen: { icon: "⟳", label: E("reader.regen.menu"), items: [
        { icon: "⟳", label: E("reader.again.menu"), hint: E("reader.again.hint"), action: function () { regen(name); } },
        { sep: true },
        { label: E("reader.reuse"), hint: E("reader.reuse.hint"), action: go("reuse") },
        { label: E("reader.base"), hint: E("reader.base.hint"), action: go("base") },
        { label: E("reader.retake"), hint: E("reader.retake.hint"), action: go("retake") },
        { label: E("reader.textOnly"), action: go("text") },
        { sep: true },
        { label: E("reader.fixPieces"), action: function () { fixFrom(name); } }
      ] },
      open: { icon: "🗣", label: E("reader.openIn"), room: E("reader.room"), action: function () { intoForm(name); } },
      writer: { icon: "✒", label: E("reader.toWriter"), hint: E("reader.toWriter.hint"), action: function () { toWriter(name); } }
    };
  }
  // the take's passport: the reading, its voice, its engine, its seed and sampling, what the ear heard; the settings from its run (all of them),
  // what its request keeps where the run is gone
  function passport(name, back, close, q, t) {
    var box = back.querySelector(".ds-box"), rq = (q && q.reader) || {};
    return byTake(name).then(function (r) { return r; }, function () { return null; }).then(function (r) {
      var f = (r && r.form) || {}, x = (r && r.facts) || {};
      var val = function (k) { return f[k] != null ? f[k] : rq[k]; };
      var kv = function (k, v, words) { return v === undefined || v === null || v === "" ? "" : '<div class="ds-kv"><span>' + esc(E(k)) + "</span><b" + (words ? "" : ' translate="no"') + ">" + esc(v) + "</b></div>"; };
      var yes = function (b) { return b == null ? "" : E(b ? "reader.ps.yes" : "reader.ps.no"); };
      var grp = function (k, rows) { rows = rows.join(""); return rows ? '<div class="ds-group"><div class="peek-cap">' + esc(E(k)) + "</div>" + rows + "</div>" : ""; };
      var vl = (r && r.form && r.form.voice_labels) || rq.voice_labels || {}, mode = val("mode");
      var who = Object.keys(vl).filter(function (s) { return s || mode !== "dialog"; }).map(function (s) { return (s ? s + ": " : "") + vl[s]; }).join(" · ");
      var text = f.text != null ? f.text : (q.lyrics || ""), book = x.book, tier = r && r.tier ? r.tier.quant : (rq.tier && rq.tier.quant) || "";
      var parts = book && book.parts && book.parts.length ? '<div class="peek-cap">' + esc(E("reader.ps.parts")) + "</div>" + book.parts.map(function (p) {
        return '<div class="ds-kv"><span translate="no">' + esc(p.k + ". " + (p.title || "")) + '</span><b class="mono">' + (p.seconds ? esc(mmss(p.seconds)) : "") + "</b></div>"; }).join("") : "";
      box.innerHTML = '<div class="ds-head"><div><div class="sheet-title" translate="no">' + esc(titleOf(name)) + '</div><div class="coll-meta mono" translate="no">' + esc(name) + "</div>" +
        '<div class="coll-meta">' + (t && t.seconds ? "<span>" + esc(mmss(t.seconds)) + "</span>" : "") + (q.parent ? ' · <span translate="no">← ' + esc(q.parent) + "</span>" : "") + "</div></div>" +
        '<span class="spacer"></span>' +
        ib("refresh", "", E("reader.again"), E("reader.again.tip"), ' data-ps="again"') + ib("to-left", "", E("reader.reuse"), E("reader.reuse.tip"), ' data-ps="reuse"') +
        ib("sliders-horizontal", "", E("reader.base"), E("reader.base.tip"), ' data-ps="base"') + ib("wrench", "", E("reader.fix"), E("reader.fix.tip"), ' data-ps="fix"') +
        ib("corner-up-left", "", E("reader.intoForm"), E("reader.intoForm"), ' data-ps="form"') +   // HERESY 2565 (the UIX audit, item 53): an icon, as its neighbours
        ib("copy", "", E("reader.ps.copy"), E("reader.ps.copy"), ' data-ps="json"') + ib("x", "", E("reader.fix.close"), E("reader.fix.close"), ' data-ps="close"') + "</div>" +
        (r ? "" : '<p class="row-hint">' + esc(E("reader.ps.noRun")) + "</p>") +
        '<div class="ds-cols"><div class="ds-texts"><div class="peek-cap">' + esc(E("reader.text")) + " <em>" + esc(fill("reader.chars", { "#0": text.length })) + "</em></div>" +
        '<pre class="sheet-text ds-lyrics" dir="auto" translate="no">' + esc(text) + "</pre>" + parts + "</div>" +
        '<div class="ds-knobs">' +
        grp("reader.ps.reading", [kv("reader.mode", E(mode === "dialog" ? "reader.dialog" : "reader.narration"), true),
          mode === "dialog" ? "" : kv("reader.split", val("split") ? E(val("split") === "verse" ? "reader.verses" : "reader.sentences") : "", true),
          kv("reader.tags", yes(val("tags")), true), kv("reader.ps.pieces", r ? r.of : rq.of), kv("reader.ps.length", t && t.seconds ? mmss(t.seconds) : ""),
          kv("reader.ps.madeIn", x.read_s ? mmss(x.read_s) : rq.read_s ? mmss(rq.read_s) : ""), kv("reader.ps.lufs", x.lufs != null ? Number(x.lufs).toFixed(1) + " LUFS" : ""),
          book && book.k ? kv("reader.ps.part", book.k + " / " + book.of) : ""]) +
        grp("reader.voice", [kv("reader.voice", who), kv("reader.lang", val("lang")), kv("reader.style", val("style")), kv("reader.stress", yes(val("stress")), true),
          kv("reader.glyphs", yes(val("glyphs") == null ? null : !!val("glyphs")), true)]) +
        grp("reader.engine", [kv("reader.engine", (r && r.engine_label) || rq.engine_label || val("engine")), kv("reader.tier", tier), kv("reader.ps.where", x.where || rq.where, true),
          kv("reader.ps.credit", rq.credit)]) +
        grp("reader.ps.seed", [kv("reader.seed", val("seed")), kv("reader.temp", val("temperature")), kv("reader.topk", val("top_k")), kv("reader.gap", val("gap")),
          mode === "dialog" ? kv("reader.turngap", val("turn_gap")) : "", f.bridge ? kv("reader.ps.bridge", yes(true), true) : "", kv("reader.ps.pieceChars", f.piece_chars)]) +
        grp("reader.ps.ear", [kv("reader.hear", yes(val("hear")), true), kv("reader.ps.cer", x.cer != null ? (100 * x.cer).toFixed(1) + " %" : ""), kv("reader.ps.rereads", x.rereads),
          kv("reader.ps.fixes", r && (r.fixes || []).length ? r.fixes.length : ""), kv("reader.ps.tails", x.tails)]) +
        grp("reader.ps.rest", [kv("reader.ps.never", q.no_train ? E("reader.ps.yes") : "", true), kv("reader.ps.from", x.parent_take ? x.parent_take + (x.parent_what ? " · " + x.parent_what : "") : ""),
          kv("reader.ps.workspace", x.workspace)]) +
        "</div></div>";
      box.addEventListener("click", function (e) {
        var b = e.target.closest("[data-ps]");
        if (!b) return;
        var a = b.dataset.ps;
        if (a === "close") return close();
        if (a === "again") { b.disabled = true; return regen(name); }
        if (a === "reuse" || a === "base") { close(); return pour(name, a); }
        if (a === "fix") { close(); return fixFrom(name); }
        if (a === "form") { close(); return intoForm(name); }
        if (a === "json") navigator.clipboard.writeText(JSON.stringify(q, null, 2)).then(function () { toast(E("reader.ps.copied")); }, function (err) { toast(err.message, "bad"); });
      });
    });
  }

  // ---------------------------------------------------------------- the room's hands
  function bind() {
    designBind();
    $("rdText").value = recall("yue2.readerText") || "";
    $("rdTitle").value = "";
    ["rdTemp", "rdTopk", "rdGap", "rdTurnGap", "rdSplit"].forEach(function (id) {
      var v = recall("yue2.reader." + id);
      if (v != null && v !== "") $(id).value = v;
      $(id).addEventListener("change", function () { keep("yue2.reader." + id, $(id).value); });
    });
    $("rdMode").addEventListener("change", function () {
      if (this.value === st.mode) return;
      st.mode = this.value === "dialog" ? "dialog" : "narration";
      keep("yue2.readerMode", st.mode);
      paintMode();
    });
    $("rdTags").addEventListener("change", function () { keep("yue2.readerTags." + st.mode, this.checked ? "1" : "0"); });
    $("rdRunsFailed").addEventListener("click", function () { keep("yue2.readerRunsFailed", recall("yue2.readerRunsFailed") !== "0" ? "0" : ""); paintRuns(); });   // HERESY 2401; 2514: a toggle
    $("rdFormBack").addEventListener("click", formBack);   // HERESY 2511
    $("rdEngNote").addEventListener("click", function (e) { if (!e.target.closest("a")) this.classList.toggle("is-open"); });
    window.addEventListener("ruach-lang", function () { paintPalette(); paintRuns(); });   // HERESY 2566: what the room put in the page's language itself, drawn again
    var tt = 0;
    $("rdText").addEventListener("input", function () {
      count();
      clearTimeout(tt);
      tt = setTimeout(function () { keep("yue2.readerText", $("rdText").value.slice(0, 200000)); paintCast(); tierLook(); }, 300);
      if (recall(PREV_KEY)) { keep(PREV_KEY, ""); paintBack(); }   // HERESY 2511: the text changed by hand, the form's way back let go
    });
    $("rdText").addEventListener("keydown", function (e) { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } });
    $("rdVoice").addEventListener("change", function () { keep("yue2.readerVoice", this.value); });
    $("rdEngine").addEventListener("change", function () { keep("yue2.readerEngine", this.value); paintCards(); paintPalette(); paintEngineExtras(); paintGo(); paintVoice(); paintCast(); designForm(); });
    $("rdLang").value = recall("yue2.readerLang") || "auto";
    if ($("rdLang").selectedIndex < 0) $("rdLang").value = "auto";
    $("rdLang").addEventListener("change", function () { keep("yue2.readerLang", this.value); if ($("rdDict").open) loadDict(); });
    $("rdStress").checked = recall("yue2.readerStress") !== "0";
    $("rdHear").checked = recall("yue2.readerHear") !== "0";
    $("rdHear").addEventListener("change", function () { keep("yue2.readerHear", this.checked ? "" : "0"); });
    $("rdStress").addEventListener("change", function () { keep("yue2.readerStress", this.checked ? "" : "0"); });
    $("rdStyle").addEventListener("change", function () { var e = engine(); if (e) keep("yue2.readerStyle." + e.id, this.value.trim()); });
    $("rdCheck").addEventListener("click", checkStress);
    $("rdTr").addEventListener("toggle", function () { if (this.open) trList(); });
    $("rdGlyphs").checked = recall("yue2.readerGlyphs") === "1";
    $("rdGlyphs").addEventListener("change", function () { keep("yue2.readerGlyphs", this.checked ? "1" : ""); });
    $("rdGmap").addEventListener("toggle", function () { if (this.open) gmapLoad(); });
    $("rdGmapSave").addEventListener("click", gmapSave);
    $("rdGmapUndo").addEventListener("click", gmapUndo);   // HERESY 2376
    $("rdGmapReset").addEventListener("click", gmapReset);
    $("rdGmView").addEventListener("click", gmView);
    $("rdGmFind").addEventListener("input", gmDraw);
    $("rdGmTry").addEventListener("input", gmCheck);
    $("rdGmAdd").addEventListener("click", function () {
      gm.rows.push({ raw: "", rule: true, edited: true, kind: "lit", what: "", "with": "", note: "" });
      $("rdGmFind").value = "";
      gmDraw(); gmEdited();
      var w = $("rdGmWrap"), last = $("rdGmRows").lastElementChild;
      w.scrollTop = w.scrollHeight;
      if (last) last.querySelector('[data-gm="what"]').focus();
    });
    $("rdGmRows").addEventListener("input", function (e) {
      var tr = e.target.closest("tr[data-i]"), k = e.target.dataset.gm;
      if (!tr || !k) return;
      var r = gm.rows[+tr.dataset.i];
      if (k === "raw") r.raw = gmClean(e.target.value).replace(/^ +$/, "");
      else r[k] = gmClean(e.target.value);
      r.edited = true;
      gmEdited();
    });
    $("rdGmRows").addEventListener("change", function (e) { if (e.target.dataset.gm === "kind") { var r = gm.rows[+e.target.closest("tr").dataset.i]; r.kind = e.target.value; r.edited = true; gmEdited(); } });
    $("rdGmRows").addEventListener("click", function (e) {
      var b = e.target.closest("[data-gm-del]");
      if (!b) return;
      gm.rows.splice(+b.dataset.gmDel, 1);
      gm.errs = {}; gm.hits = {};
      gmDraw(); gmEdited();
    });
    $("rdGmapText").addEventListener("input", gmEdited);
    $("rdGmapText").addEventListener("keydown", function (e) {   // Tab writes the field's separator here, as in his table
      if (e.key !== "Tab" || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
      e.preventDefault();
      var a = this.selectionStart, b = this.selectionEnd;
      this.value = this.value.slice(0, a) + "\t" + this.value.slice(b);
      this.selectionStart = this.selectionEnd = a + 1;
    });
    $("rdTrGo").addEventListener("click", trSend);
    $("rdSetup").addEventListener("click", function (e) {   // HERESY 2374: the Engine's tier fetches the model and builds the server; Engine → Models shows it
      var b = e.target.closest("#rdSetupGo");
      if (!b) return;
      b.disabled = true;
      api(scoped("/weights/fetch"), { tier: b.dataset.tier }).then(function () { toast(E("reader.setup.started")); })
        .catch(function (x) { b.disabled = false; toast(x.message, "bad"); });
    });
    $("rdTrClean").addEventListener("click", trClean);
    $("rdTrUse").addEventListener("click", trUse);
    $("rdTrLang").value = recall("yue2.readerTrLang") || "auto";
    if ($("rdTrLang").selectedIndex < 0) $("rdTrLang").value = "auto";
    $("rdTrLang").addEventListener("change", function () { keep("yue2.readerTrLang", this.value); });
    $("rdTrMode").value = recall("yue2.readerTrMode") === "proof" ? "proof" : "every";   // HERESY 2376
    $("rdTrMode").addEventListener("change", function () { keep("yue2.readerTrMode", this.value === "proof" ? "proof" : ""); });
    $("rdTrList").addEventListener("click", function (e) {
      var b = e.target.closest("[data-tr-act]"), row = e.target.closest("[data-tr]");
      if (!b || !row) return;
      var id = row.dataset.tr;
      if (b.dataset.trAct === "open") { trShow(id); return; }
      var name = (row.querySelector(".rd-tr-name") || {}).textContent || id;
      window.HeresyDialog.confirm(fill("reader.tr.removeAsk", { 0: name }), { ok: E("reader.tr.remove") }).then(function (yes) {
        if (!yes) return;
        api("/reader/transcript-remove", { id: id }).then(function () { if (trOpen && trOpen.id === id) { trOpen = null; $("rdTrOut").hidden = true; } trList(); })
          .catch(function (x) { toast(x.message, "bad"); });
      });
    });
    $("rdCheckOut").addEventListener("click", function (e) { var b = e.target.closest("[data-homo]"); if (b) placeHomograph(b.dataset.homo, b.dataset.form); });
    $("rdDict").addEventListener("toggle", function () { if (this.open) loadDict(); });
    $("rdDictAdd").addEventListener("click", function () {
      var w = $("rdDictWord").value.trim(), f = $("rdDictForm").value.trim();
      if (!w || !f) return;
      dictPut(w, f).then(function () { $("rdDictWord").value = ""; $("rdDictForm").value = ""; }).catch(function (e) { toast(e.message, "bad"); });
    });
    $("rdDictList").addEventListener("click", function (e) { var b = e.target.closest("[data-unword]"); if (b) dictPut(b.dataset.unword, "").catch(function (x) { toast(x.message, "bad"); }); });
    $("rdSplitAdd").addEventListener("click", function () {   // HERESY 2344: [split] at the cursor, a part of a book after it
      var ta = $("rdText"), a = ta.selectionStart || 0, b = ta.selectionEnd || a, tag = "\n\n[split]\n\n";
      ta.value = ta.value.slice(0, a).replace(/\s+$/, "") + tag + ta.value.slice(b).replace(/^\s+/, "");
      ta.dispatchEvent(new Event("input"));
      ta.focus();
      var at = ta.value.indexOf(tag, Math.max(0, a - 4)) + tag.length;
      ta.setSelectionRange(at, at);
    });
    $("rdPause").addEventListener("click", function () {   // HERESY 2334: a pause tag at the cursor, its seconds selected to type over
      var ta = $("rdText"), a = ta.selectionStart || 0, b = ta.selectionEnd || a, pre = a > 0 && !/\s$/.test(ta.value.slice(0, a)) ? " " : "";
      ta.value = ta.value.slice(0, a) + pre + "[pause:1s]" + ta.value.slice(b);
      ta.dispatchEvent(new Event("input"));
      ta.focus();
      ta.setSelectionRange(a + pre.length + 7, a + pre.length + 8);
    });
    $("rdFix").addEventListener("input", function (e) {     // HERESY 2334: a pause after a piece changed by hand
      var g = e.target.closest("input[data-gi]");
      if (!g || !st.fix) return;
      st.gapEdits = st.gapEdits || {};
      var v = g.value.trim() === "" ? NaN : Math.round(Number(g.value) * 100) / 100;
      if (!isFinite(v) || v < 0 || v > 60) { g.classList.add("is-bad"); delete st.gapEdits[g.dataset.gi]; }
      else { g.classList.remove("is-bad"); st.gapEdits[g.dataset.gi] = v; }
      ["rdGapsHere", "rdGapsCopy"].forEach(function (id) { if ($(id)) $(id).disabled = !gapsAny(st.fix); });
    });
    $("rdFix").addEventListener("click", function (e) {
      var b = e.target.closest("[data-fx]");
      if (b) { fixAct(b.dataset.fx, b); return; }
      var w = e.target.closest("[data-word]");
      if (w) { wordVowels(+w.dataset.word); return; }
      var v = e.target.closest("[data-vk]");
      if (v) { setStress(+v.dataset.vk, +v.dataset.vi); return; }
      var row = e.target.closest(".rd-piece");
      if (row) { st.fixSel = +row.dataset.piece; paintFix(); }
    });
    $("rdCard").addEventListener("change", function () { keep("yue2.readerCard", this.value); $("rdTier").disabled = this.value === "cpu"; tierLook(); });
    $("rdTier").addEventListener("change", function () { var e = engine(); if (e) keep("yue2.readerTier." + e.id, this.value); gradeTier(); tierLook(); });
    $("rdOwnLang").addEventListener("change", function () { keep("yue2.readerOwnLang", this.value); });
    $("rdCast").addEventListener("change", function (e) {
      var sel = e.target.closest("select[data-spk]");
      if (!sel) return;
      st.cast[sel.dataset.spk] = sel.value;
      keep("yue2.readerCast", JSON.stringify(st.cast));
    });
    $("rdCast").addEventListener("click", function (e) {
      var b = e.target.closest("[data-listen]");
      if (!b) return;
      var sel = Array.prototype.filter.call($("rdCast").querySelectorAll("select[data-spk]"), function (x) { return x.dataset.spk === b.dataset.listen; })[0];
      if (sel) listen(sel.value, b);
    });
    $("rdListen").addEventListener("click", function () { listen($("rdVoice").value, this); });
    $("rdPalBody").addEventListener("click", function (e) {
      var b = e.target.closest(".rd-tag"), en = engine();
      if (!b || !en || !en.tags || !en.tags.groups) return;
      insertTag(en.tags.groups[+b.dataset.g], b.dataset.t);
    });
    $("rdGo").addEventListener("click", send);
    $("rdOwnOpen").addEventListener("click", function () {
      $("rdOwn").hidden = !$("rdOwn").hidden;
      if (!$("rdOwn").hidden) $("rdOwn").scrollIntoView({ block: "nearest", behavior: "smooth" });   // the warning in sight first
    });
    $("rdOwnCancel").addEventListener("click", function () { $("rdOwn").hidden = true; });
    $("rdOwnFile").addEventListener("change", function () { var f = this.files && this.files[0]; $("rdOwnFileName").textContent = f ? f.name : ""; });
    $("rdOwnKeep").addEventListener("click", ownSend);
    $("rdRuns").addEventListener("click", function (e) {
      var b = e.target.closest("[data-act]"), card = e.target.closest(".rd-run");
      if (card && !b && !e.target.closest("a, button, input, select, textarea, audio, summary")) {   // HERESY 2381: the card itself
        if (card.classList.contains("is-shut")) openRun(card.dataset.id);
        else if (e.target.closest(".rd-run-head")) openRun("");
        return;
      }
      if (!b || !card) return;
      var take = card.dataset.take, act = b.dataset.act;
      if (act === "stop") api("/reader/stop", { id: card.dataset.id }).then(function () { poll(true); }).catch(function (x) { toast(x.message, "bad"); });
      else if (act === "play" && take) playTake(take);   // HERESY 2511
      else if (act === "again" && take) regen(take);
      else if ((act === "reuse" || act === "base") && take) pour(take, act);
      else if (act === "more" && take) { var br = b.getBoundingClientRect(); if (window.ruachTakeMenu) window.ruachTakeMenu(take, br.left, br.bottom + 4); }
      else if (act === "open" && take && window.ruachOpenTake) window.ruachOpenTake(take);
      else if (act === "reveal" && take && window.HeresyCollection && window.HeresyCollection.reveal) {   // the Librarian first, as the Musician's "Show in the Library" does: else the card was found in a room out of sight
        var lt = document.querySelector('.topbar button[data-tab="collection"]') || document.querySelector('button[data-tab="collection"]'); if (lt) lt.click();
        window.HeresyCollection.reveal(take);
      }
      else if (act === "fix") fixOpen(card.dataset.id);
      else if (act === "check" && take) checkTake(take);   // HERESY 2434
    });
    $("rdRuns").addEventListener("contextmenu", function (e) {   // HERESY 2511: a finished card's take, its whole menu, as a card in the Library
      var card = e.target.closest(".rd-run[data-take]");
      if (!card || !window.ruachTakeMenu || e.target.closest("input, textarea")) return;
      e.preventDefault();
      window.ruachTakeMenu(card.dataset.take, e.clientX, e.clientY);
    });
    // HERESY 2381: the head by the keyboard (Enter, Space); a control reached by Tab inside a shut card opens it, so what has the focus is in sight
    $("rdRuns").addEventListener("keydown", function (e) {
      var h = e.target.closest && e.target.closest(".rd-run-head");
      if (!h || (e.key !== "Enter" && e.key !== " ")) return;
      e.preventDefault();
      var card = h.closest(".rd-run");
      openRun(card.classList.contains("is-open") ? "" : card.dataset.id);
    });
    $("rdRuns").addEventListener("focusin", function (e) {
      var card = e.target.closest(".rd-run");
      if (card && card.classList.contains("is-shut") && !e.target.closest(".rd-run-head")) openRun(card.dataset.id);
    });
    paintMode();
    paintBack();
  }
  function openRun(id) {   // HERESY 2381: the accordion; the next paint of the runs draws the same (runHtml reads st.openRun)
    st.openRun = id || "";
    Array.prototype.forEach.call($("rdRuns").querySelectorAll(".rd-run"), function (c) {
      var on = !!id && c.dataset.id === id, h = c.querySelector(".rd-run-head");
      c.classList.toggle("is-open", on); c.classList.toggle("is-shut", !on);
      if (h) h.setAttribute("aria-expanded", on ? "true" : "false");
    });
  }

  // HERESY 2312 (Viktor 09.11.2026: credits in the Engine's About for Resemble Enhance and for Drama 3 with «Built with Fish Audio»): where the
  // Reader is, its models stand among the Studio's (About → Models in the Studio); a Studio without the Reader (a release, until it is turnkey)
  // names neither, as it runs neither
  // HERESY 2415 (Viktor 11.11.2026: Resemble Enhance credited only where it is installed): its line only when the lab offers the TTS Voice Upscaler
  // (its step there, its script and its Python with it; a release without the upscaler names it nowhere), asked once the About card is there
  function creditRe(ul) {
    if (!window.fetch) return;
    fetch("/lab/plugins", { priority: "low" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      var has = !!d && (d.plugins || []).some(function (p) { return (p.steps || []).some(function (s) { return s.id === "tts_upscale"; }); });
      if (!has || $("rdCreditRe")) return;
      var li = document.createElement("li"), after = $("rdCreditDrama");
      li.id = "rdCreditRe";
      li.innerHTML = '<a href="https://github.com/resemble-ai/resemble-enhance" target="_blank" rel="noopener noreferrer">' + esc(E("reader.credit.re")) + '</a><span class="about-where" translate="no">' + esc("github \u00b7 resemble-ai/resemble-enhance \u00b7 MIT") + "</span>";
      if (after && after.parentNode === ul) ul.insertBefore(li, after.nextSibling); else ul.appendChild(li);
    }).catch(function () { /* no lab: no upscaler to credit */ });
  }
  // night 11→12.11.2026 (Boson's licence IV(a)(iii) and the tokenizer's licence: a public application that uses Higgs says so in its About):
  // Higgs TTS 3 and its tokenizer, each with Boson's attribution word for word, wherever the lab carries the higgs engine (fetched or not)
  function creditHiggs(ul) {
    if (!window.fetch) return;
    fetch("/lab/reader/engines", { priority: "low" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      var has = !!d && (d.engines || []).some(function (e) { return e.id === "higgs"; });
      if (!has || $("rdCreditHiggs")) return;
      var after = $("rdCreditAcpp") || $("rdCreditDrama");
      [["rdCreditHiggsTok", "https://huggingface.co/bosonai/higgs-audio-v2-tokenizer", "reader.credit.higgsTok", "hugging face \u00b7 bosonai/higgs-audio-v2-tokenizer \u00b7 Boson Higgs Audio 2 Community License \u00b7 Built with Higgs Materials licensed from Boson AI USA, Inc., Copyright Boson AI USA, Inc., All Rights Reserved and Meta Llama 3 licensed under the Meta Llama 3 Community License, Copyright Meta Platforms, Inc., All Rights Reserved"],
       ["rdCreditHiggs", "https://huggingface.co/bosonai/higgs-tts-3-4b", "reader.credit.higgs", "hugging face \u00b7 bosonai/higgs-tts-3-4b \u00b7 Boson Higgs TTS 3 Research and Non-Commercial License \u00b7 Built with Higgs TTS 3 licensed from Boson AI USA, Inc."]].forEach(function (c) {
        var li = document.createElement("li");
        li.id = c[0];
        li.innerHTML = '<a href="' + c[1] + '" target="_blank" rel="noopener noreferrer">' + esc(E(c[2])) + '</a><span class="about-where" translate="no">' + esc(c[3]) + "</span>";
        if (after && after.parentNode === ul) ul.insertBefore(li, after.nextSibling); else ul.appendChild(li);
      });
    }).catch(function () { /* no lab: no engine to credit */ });
  }
  function credits() {
    var ul = document.querySelector("#aboutCard .about-col .about-cap + ul.about-links");
    if (!ul || $("rdCreditDrama")) return;
    creditRe(ul);                                    // HERESY 2415
    creditHiggs(ul);                                 // night 11→12.11.2026: Boson's attribution
    [["rdCreditDrama", "https://huggingface.co/fishaudio/drama-3", "reader.credit.drama", "hugging face \u00b7 fishaudio/drama-3 \u00b7 Fish Audio Community License \u00b7 Built with Fish Audio"],
     // HERESY 2374: the engine the Narrator reads through, and the Ukrainian stresses with every link of their source
     ["rdCreditAcpp", "https://github.com/0xShug0/audio.cpp", "reader.credit.acpp", "github \u00b7 0xShug0/audio.cpp \u00b7 Apache-2.0"],
     ["rdCreditUk", "https://github.com/lang-uk/ukrainian-word-stress", "reader.credit.uk", "github \u00b7 lang-uk/ukrainian-word-stress \u00b7 MIT \u00b7 ULIF, lcorp.ulif.org.ua/dictua"],
     // HERESY 2399: the Russian stresses, every form of Zaliznyak's dictionary unfolded from gramdict's data, and its non-commercial licence
     ["rdCreditRu", "https://github.com/gramdict/zalizniak-2010", "reader.credit.ru", "github \u00b7 gramdict/zalizniak-2010 \u00b7 CC BY-NC 4.0 \u00b7 \u00a9 Anna A. Zaliznyak"]].forEach(function (c) {
      var li = document.createElement("li");
      li.id = c[0];
      li.innerHTML = '<a href="' + c[1] + '" target="_blank" rel="noopener noreferrer">' + esc(E(c[2])) + '</a><span class="about-where" translate="no">' + esc(c[3]) + "</span>";
      ul.appendChild(li);
    });
  }

  credits();
  mount();
  window.HeresyReader = { reload: reload, poll: poll, state: function () { return st; }, speakers: speakers, insertTag: insertTag, mounted: function () { return !!$("view-read"); },
    fixOpen: fixOpen, detectLang: detectLang, withCase: withCase, take: intoReader };   // HERESY 2344: take(text, title)
  // HERESY 2511–2513: the Library's menu and passport ask the Narrator for a reading's own acts
  window.RuachReaderMirror = { pour: pour, regen: regen, intoForm: intoForm, toWriter: toWriter, fixFrom: fixFrom, passport: passport, menu: menuItems, play: playTake };
})();
