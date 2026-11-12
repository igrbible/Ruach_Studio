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
  var st = { engines: [], voices: [], groups: [], cards: null, runs: [], timer: 0, absent: false, loaded: false, sending: false, watch: {}, audio: null,
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
    ".rd-cols { display: grid; grid-template-columns: minmax(360px, 1.3fr) minmax(300px, 1fr); gap: 20px; align-items: start; }",
    "@media (max-width: 1180px) { .rd-cols { grid-template-columns: 1fr; } }",
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
    ".rd-go { position: sticky; bottom: 0; z-index: 2; background: var(--ground); padding: 8px 0 4px; }",
    ".rd-say { color: var(--dim); font-size: 12px; }",
    ".rd-h3 { margin: 0; font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); font-weight: 500; }",
    ".rd-runs { display: flex; flex-direction: column; gap: 10px; }",
    ".rd-run { border: 1px solid var(--line-a); border-radius: var(--r-md); padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; }",
    ".rd-run-head { display: flex; gap: 8px; align-items: baseline; min-width: 0; }",
    // HERESY 2381 (Viktor 11.11.2026: «карточки ужми до единой разумной высоты и дай им расхлопываться в тот полный рост, что сейчас, и схлопывание
    // других как в аккордеоне»): every card one height, its title, state and first lines in sight, the rest under a fade; a click (or Enter or Space
    // on its head) opens one to its whole height and shuts the one open before; the open one's head shuts it again. Logical sides only: Hebrew mirrors it
    ".rd-run { min-height: 104px; }",   // an open card never shorter than a shut one
    ".rd-run.is-shut { height: 104px; overflow: hidden; position: relative; cursor: pointer; }",
    ".rd-run.is-shut::after { content: ''; position: absolute; inset-inline: 0; bottom: 0; height: 28px; background: linear-gradient(to bottom, transparent, var(--ground)); pointer-events: none; }",
    ".rd-run.is-shut:hover { border-color: var(--muted); }",
    ".rd-run-head { cursor: pointer; border-radius: 4px; }",
    ".rd-run-head::after { content: '\\25BE'; flex: none; color: var(--dim); transition: transform .15s ease; }",
    ".rd-run.is-open .rd-run-head::after { transform: rotate(180deg); }",
    ".rd-run-head:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }",
    ".rd-run-title { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }",
    ".rd-chip { font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase; padding: 1px 8px; border-radius: 999px; border: 1px solid var(--line-a); color: var(--muted); white-space: nowrap; }",
    ".rd-chip.st-running, .rd-chip.st-queued { color: var(--patina); border-color: var(--patina-dim); }",
    ".rd-chip.st-failed { color: var(--bad-ink); border-color: var(--bad-line); }",
    ".rd-run-meta { font-size: 11.5px; color: var(--dim); overflow-wrap: anywhere; }",
    ".rd-bar { height: 4px; border-radius: 2px; background: var(--line-a); overflow: hidden; }",
    ".rd-bar > i { display: block; height: 100%; width: 0; background: var(--patina); transition: width .4s ease; }",
    ".rd-run-err { color: var(--bad-ink); font-size: 12px; overflow-wrap: anywhere; }",
    ".rd-run-acts { display: flex; gap: 6px; flex-wrap: wrap; }",
    ".rd-own { display: flex; flex-direction: column; gap: 10px; border: 1px solid var(--bad-line); border-radius: var(--r-md); padding: 12px 14px; }",
    ".rd-own h3 { margin: 0; font: 500 15px/1.4 var(--heading); }",
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
    ".rd-gm-table tr.is-hit td.n { color: var(--accent); }",
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
    "#logDockBody[data-only=\"reader\"] > .log-line:not([data-src=\"reader\"]), .log-pop [data-body=\"server\"][data-only=\"reader\"] > .log-line:not([data-src=\"reader\"]) { display: none; }"
  ].join("\n");

  var MIC = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 2.5a3 3 0 0 0-3 3v6.5a3 3 0 0 0 6 0V5.5a3 3 0 0 0-3-3Z M18.5 10.5v1.5a6.5 6.5 0 0 1-13 0v-1.5 M12 18.5v3" ' +
    'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  function lim(a, b) { return ' <em class="mono rd-lim">' + a + "–" + b + "</em>"; }
  function roomHtml() {
    return '<div class="col-head post-head rd-head"><h2>' + esc(E("reader.room")) + ' <span class="tag" id="rdPro" hidden data-tip="' + esc(E("reader.pro.tip")) + '">Pro</span></h2>' +
      '<span class="col-note col-note-two">' + esc(E("reader.note")) + "</span></div>" +
      '<p class="rd-off" id="rdOff" hidden></p>' +
      '<div class="rd-cols" id="rdCols"><div class="rd-form">' +
      '<div class="rd-row"><label class="field"><span class="label">' + esc(E("reader.mode")) + '</span><select id="rdMode" data-tip="' + esc(E("reader.mode.tip")) + '">' +
      '<option value="narration">' + esc(E("reader.narration")) + '</option><option value="dialog">' + esc(E("reader.dialog")) + "</option></select></label>" +
      '<label class="field" id="rdSplitBox"><span class="label">' + esc(E("reader.split")) + '</span><select id="rdSplit" data-tip="' + esc(E("reader.split.tip")) + '">' +
      '<option value="sentence">' + esc(E("reader.sentences")) + '</option><option value="verse">' + esc(E("reader.verses")) + "</option></select></label></div>" +
      '<details class="rd-box" id="rdTr"><summary data-tip="' + esc(E("reader.tr.tip")) + '">' + esc(E("reader.tr")) + '</summary><div class="rd-tr">' +
      '<div class="rd-tr-go"><input type="file" id="rdTrFile" accept="audio/*,video/*" data-tip="' + esc(E("reader.tr.file.tip")) + '" />' +
      '<select id="rdTrLang" data-tip="' + esc(E("reader.lang.tip")) + '"><option value="auto">' + esc(E("reader.lang.auto")) + "</option>" +
      LANG_CODES.map(function (l) { return '<option value="' + l + '" translate="no">' + l + "</option>"; }).join("") + "</select>" +
      '<button type="button" class="btn small" id="rdTrGo">' + esc(E("reader.tr.go")) + "</button></div>" +
      '<div class="rd-tr-list" id="rdTrList"></div>' +
      '<div id="rdTrOut" hidden><textarea id="rdTrText" class="rd-tr-text" rows="8" spellcheck="false" data-tip="' + esc(E("reader.tr.text.tip")) + '"></textarea>' +   // HERESY 2391
      '<div class="rd-actions"><select id="rdTrMode" aria-label="' + esc(E("reader.tr.mode")) + '" data-tip="' + esc(E("reader.tr.mode.tip")) + '">' +   // HERESY 2376
      '<option value="every">' + esc(E("reader.tr.mode.every")) + '</option><option value="proof">' + esc(E("reader.tr.mode.proof")) + "</option></select>" +
      '<button type="button" class="btn small" id="rdTrClean" data-tip="' + esc(E("reader.tr.clean.tip")) + '">' + esc(E("reader.tr.clean")) + "</button>" +
      '<button type="button" class="btn ghost small" id="rdTrUse" data-tip="' + esc(E("reader.tr.use.tip")) + '">' + esc(E("reader.tr.use")) + "</button>" +
      '<span class="rd-say" id="rdTrSay"></span></div></div></div></details>' +
      '<label class="field"><span class="label">' + esc(E("reader.text")) + ' <em class="mono" id="rdCount"></em></span>' +
      '<textarea id="rdText" class="rd-text" rows="12" spellcheck="false" data-tip="' + esc(E("reader.text.tip")) + '"></textarea></label>' +
      '<div class="field" id="rdVoiceBox"><span class="label">' + esc(E("reader.voice")) + '</span><div class="rd-voice">' +
      '<select id="rdVoice" data-hc-pick="1" data-tip="' + esc(E("reader.voice.tip")) + '"></select>' +
      '<button type="button" class="btn ghost small" id="rdListen" data-tip="' + esc(E("reader.listen.tip")) + '">' + esc(E("reader.listen")) + "</button></div></div>" +
      '<div class="field" id="rdCastBox" hidden><span class="label">' + esc(E("reader.speakers")) + '</span><div class="rd-cast" id="rdCast"></div></div>' +
      '<div class="rd-row"><label class="field"><span class="label">' + esc(E("reader.engine")) + '</span><select id="rdEngine" data-tip="' + esc(E("reader.engine.tip")) + '"></select></label>' +
      '<label class="field"><span class="label">' + esc(E("reader.card")) + '</span><select id="rdCard" data-hc-pick="1" data-tip="' + esc(E("reader.card.tip")) + '"></select></label></div>' +
      '<p class="rd-eng-note" id="rdEngNote" translate="no" hidden></p>' +
      '<div class="rd-box rd-setup" id="rdSetup" hidden></div>' +   // HERESY 2374
      '<div class="rd-row" id="rdTierBox" hidden><label class="field"><span class="label">' + esc(E("reader.tier")) + '</span><select id="rdTier" data-tip="' + esc(E("reader.tier.tip")) + '"></select></label></div>' +
      '<p class="rd-tier-say" id="rdTierSay" hidden></p>' +
      '<div class="rd-row"><label class="field"><span class="label">' + esc(E("reader.lang")) + '</span><select id="rdLang" data-tip="' + esc(E("reader.lang.tip")) + '">' +
      '<option value="auto">' + esc(E("reader.lang.auto")) + "</option>" + LANG_CODES.map(function (l) { return '<option value="' + l + '" translate="no">' + l + "</option>"; }).join("") + "</select></label>" +
      '<label class="field" id="rdStyleBox"><span class="label">' + esc(E("reader.style")) + '</span><input type="text" id="rdStyle" maxlength="400" spellcheck="false" data-tip="' + esc(E("reader.style.tip")) + '" /></label></div>' +
      '<div class="rd-actions"><label class="check" data-tip="' + esc(E("reader.stress.tip")) + '"><input type="checkbox" id="rdStress" checked /> <span>' + esc(E("reader.stress")) + "</span></label>" +
      '<label class="check" data-tip="' + esc(E("reader.glyphs.tip")) + '"><input type="checkbox" id="rdGlyphs" /> <span>' + esc(E("reader.glyphs")) + "</span></label>" +
      '<button type="button" class="btn ghost small" id="rdCheck" data-tip="' + esc(E("reader.check.tip")) + '">' + esc(E("reader.check")) + "</button>" +
      '<button type="button" class="btn ghost small" id="rdPause" data-tip="' + esc(E("reader.pause.tip")) + '">⏸ ' + esc(E("reader.pause")) + "</button>" +   // HERESY 2334
      '<button type="button" class="btn ghost small" id="rdSplitAdd" data-tip="' + esc(E("reader.split.tip")) + '">✂ ' + esc(E("reader.split.add")) + "</button></div>" +   // HERESY 2344
      '<div class="rd-box rd-check" id="rdCheckOut" hidden></div>' +
      '<details class="rd-box" id="rdDict"><summary data-tip="' + esc(E("reader.dict.tip")) + '">' + esc(E("reader.dict")) + ' <span class="mono" id="rdDictLang" translate="no"></span></summary><div class="rd-dict">' +
      '<div class="rd-dict-row"><input type="text" id="rdDictWord" data-tip="' + esc(E("reader.dict.word.tip")) + '" maxlength="60" spellcheck="false" placeholder="' + esc(E("reader.dict.word")) + '" />' +
      '<input type="text" id="rdDictForm" data-tip="' + esc(E("reader.dict.form.tip")) + '" maxlength="80" spellcheck="false" placeholder="' + esc(E("reader.dict.form")) + '" />' +
      '<button type="button" class="btn small" id="rdDictAdd">' + esc(E("reader.dict.add")) + '</button></div><div class="rd-dict-list" id="rdDictList"></div></div></details>' +
      '<details class="rd-box" id="rdGmap"><summary data-tip="' + esc(E("reader.gmap.tip")) + '">' + esc(E("reader.gmap")) + ' <span class="mono" id="rdGmapN"></span></summary><div class="rd-tr">' +
      '<div class="rd-say" id="rdGmapSrc" translate="no"></div>' +
      '<div class="rd-gm-bar"><input type="search" id="rdGmFind" spellcheck="false" placeholder="' + esc(E("reader.gmap.find")) + '" data-tip="' + esc(E("reader.gmap.find.tip")) + '" />' +   // HERESY 2376; 2391: its tip
      '<button type="button" class="btn ghost small" id="rdGmAdd">+ ' + esc(E("reader.gmap.add")) + "</button>" +
      '<button type="button" class="btn ghost small" id="rdGmView">' + esc(E("reader.gmap.asText")) + "</button></div>" +
      '<div class="rd-gm-wrap" id="rdGmWrap"><table class="rd-gm-table"><thead><tr><th>#</th><th>' + esc(E("reader.gmap.kind")) + "</th><th>" + esc(E("reader.gmap.what")) +
      "</th><th>" + esc(E("reader.gmap.with")) + "</th><th>" + esc(E("reader.gmap.note")) + '</th><th></th></tr></thead><tbody id="rdGmRows"></tbody></table></div>' +
      '<textarea id="rdGmapText" class="rd-gmap-text" rows="14" spellcheck="false" hidden data-tip="' + esc(E("reader.gmap.text.tip")) + '"></textarea>' +   // HERESY 2391
      '<div class="rd-gm-try"><input type="text" id="rdGmTry" spellcheck="false" placeholder="' + esc(E("reader.gmap.tryPh")) + '" data-tip="' + esc(E("reader.gmap.try")) + '" />' +
      '<div class="rd-gm-out" id="rdGmTryOut" translate="no"></div></div>' +
      '<div class="rd-actions"><button type="button" class="btn small" id="rdGmapSave">' + esc(E("reader.gmap.save2")) + "</button>" +
      '<button type="button" class="btn ghost small" id="rdGmapUndo" data-tip="' + esc(E("reader.gmap.undo.tip")) + '">' + esc(E("reader.gmap.undo")) + "</button>" +
      '<button type="button" class="btn ghost small" id="rdGmapReset">' + esc(E("reader.gmap.reset")) + '</button><span class="rd-say" id="rdGmapSay"></span></div>' +
      '<div class="rd-say" id="rdGmapKept" translate="no"></div></div></details>' +
      '<label class="check" data-tip="' + esc(E("reader.tags.tip")) + '"><input type="checkbox" id="rdTags" /> <span>' + esc(E("reader.tags")) + "</span></label>" +
      '<details class="rd-box" id="rdPal"><summary data-tip="' + esc(E("reader.palette.tip")) + '">' + esc(E("reader.palette")) + '</summary><div id="rdPalBody"></div></details>' +
      '<details class="rd-box" id="rdMore"><summary>' + esc(E("reader.settings")) + '</summary><div class="rd-grid">' +
      '<label class="field"><span class="label">' + esc(E("reader.temp")) + lim("0.1", "1.5") + '</span><input type="number" id="rdTemp" min="0.1" max="1.5" step="0.05" value="0.8" data-tip="' + esc(E("reader.temp.tip")) + '" /></label>' +
      '<label class="check" data-tip="' + esc(E("reader.hear.tip")) + '"><input type="checkbox" id="rdHear" checked /> <span>' + esc(E("reader.hear")) + "</span></label>" +
      '<label class="check" data-tip="' + esc(E("reader.acutesOff.tip")) + '"><input type="checkbox" id="rdAcutesOff" /> <span>' + esc(E("reader.acutesOff")) + "</span></label>" +   // HERESY 2343: a test, never kept
      '<label class="field"><span class="label">' + esc(E("reader.topk")) + lim("1", "200") + '</span><input type="number" id="rdTopk" min="1" max="200" step="1" value="50" data-tip="' + esc(E("reader.topk.tip")) + '" /></label>' +
      '<label class="field"><span class="label">' + esc(E("reader.seed")) + '</span><input type="number" id="rdSeed" min="0" max="2147483000" step="1" placeholder="' + esc(E("reader.seed.ph")) + '" data-tip="' + esc(E("reader.seed.tip")) + '" /></label>' +
      '<label class="field"><span class="label">' + esc(E("reader.gap")) + lim("0.05", "3") + '</span><input type="number" id="rdGap" min="0.05" max="3" step="0.05" value="0.35" data-tip="' + esc(E("reader.gap.tip")) + '" /></label>' +
      '<label class="field"><span class="label">' + esc(E("reader.turngap")) + lim("0.05", "3") + '</span><input type="number" id="rdTurnGap" min="0.05" max="3" step="0.05" value="0.45" data-tip="' + esc(E("reader.turngap.tip")) + '" /></label>' +
      "</div></details>" +
      '<label class="field"><span class="label">' + esc(E("reader.title")) + '</span><input type="text" id="rdTitle" maxlength="120" placeholder="' + esc(E("reader.title.ph")) + '" data-tip="' + esc(E("reader.title.tip")) + '" /></label>' +
      '<div class="rd-actions rd-go"><button type="button" class="btn" id="rdGo" data-tip="' + esc(E("reader.go.tip")) + '">' + esc(E("reader.go")) + "</button>" +
      '<button type="button" class="btn ghost small" id="rdOwnOpen">' + esc(E("reader.ownOpen")) + '</button><span class="rd-say mono" id="rdSay"></span></div>' +
      '<div class="rd-own" id="rdOwn" hidden><h3>' + esc(E("reader.own.title")) + '</h3><p class="rd-warn" role="alert">' + esc(E("reader.own.warn")) + "</p>" +
      '<label class="check" data-tip="' + esc(E("reader.own.consent.tip")) + '"><input type="checkbox" id="rdOwnOk" /> <span>' + esc(E("reader.own.consent")) + "</span></label>" +
      '<div class="rd-row"><label class="field"><span class="label">' + esc(E("reader.own.name")) + '</span><input type="text" id="rdOwnName" maxlength="60" data-tip="' + esc(E("reader.own.name.tip")) + '" /></label>' +
      '<label class="field"><span class="label">' + esc(E("reader.own.lang")) + '</span><select id="rdOwnLang" data-hc-pick="1" data-tip="' + esc(E("reader.own.lang.tip")) + '"></select></label></div>' +
      '<label class="field"><span class="label">' + esc(E("reader.own.text")) + '</span><textarea id="rdOwnText" rows="2" spellcheck="false" data-tip="' + esc(E("reader.own.text.tip")) + '"></textarea></label>' +
      '<div class="rd-actions"><label class="btn ghost small" data-tip="' + esc(E("reader.own.file.tip")) + '">' + esc(E("reader.own.file")) + '<input type="file" id="rdOwnFile" accept="audio/*" hidden /></label>' +
      '<span class="rd-say mono" id="rdOwnFileName" translate="no"></span><button type="button" class="btn small" id="rdOwnKeep">' + esc(E("reader.own.keep")) + "</button>" +
      '<button type="button" class="btn ghost small" id="rdOwnCancel">' + esc(E("reader.own.cancel")) + "</button></div></div>" +
      '</div><div class="rd-side"><div class="rd-fix" id="rdFix" hidden></div><h3 class="rd-h3">' + esc(E("reader.runs")) + '</h3><div class="rd-runs" id="rdRuns"></div></div></div>';
  }

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
  function voiceOpts(cur) {
    var h = '<option value="">' + esc(E("reader.voice.engine")) + "</option>";
    st.groups.forEach(function (g) { h += '<option value="g:' + esc(g.id) + '">' + esc(E("reader.g." + g.id)) + "</option>"; });
    st.voices.forEach(function (v) { h += '<option value="v:' + esc(v.id) + '">' + esc(vlabel(v)) + "</option>"; });
    return { html: h, ok: !cur || cur === "" || /^g:/.test(cur) && st.groups.some(function (g) { return "g:" + g.id === cur; }) || /^v:/.test(cur) && st.voices.some(function (v) { return "v:" + v.id === cur; }) };
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
    var h = '<option value="auto-speed">' + esc(E("reader.tier.autoSpeed")) + '</option><option value="auto-quality">' + esc(E("reader.tier.autoQuality")) + "</option>";
    ts.forEach(function (t) {
      if (t.device !== "cuda") return;
      var k = { speed: "reader.tier.speed", quality: "reader.tier.quality", q8: "reader.tier.q8", ram: "reader.tier.ram" }[t.id];   // HERESY 2290: Q8_0 by name
      h += '<option value="' + esc(t.id) + '"' + (t.ready ? "" : " disabled") + gradeAttr(t) + ' translate="no">' + esc(k ? fill(k, { 0: t.quant }) : t.quant) + "</option>";
    });
    setOpts($("rdTier"), h, recall("yue2.readerTier." + e.id) || "auto-speed");
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
  }
  var tierT = 0, tierN = 0;
  function tierLook() {
    clearTimeout(tierT);
    tierT = setTimeout(function () {
      var e = engine(), say = $("rdTierSay");
      if (!e || !(e.tiers || []).length || st.absent) { say.hidden = true; return; }
      var n = ++tierN, chars = $("rdText").value.replace(/\[[^\[\]\n]{1,80}\]/g, "").replace(/\s+/g, " ").trim().length;
      api("/reader/tier?engine=" + encodeURIComponent(e.id) + "&ask=" + encodeURIComponent($("rdTier").value || "auto-speed") + "&card=" + encodeURIComponent($("rdCard").value || "auto") +
        "&chars=" + chars).then(function (r) {
        if (n !== tierN) return;
        say.hidden = false;
        say.classList.toggle("is-slow", !!(r.tier && r.tier.device === "cpu") || !!r.wait);
        if (r.error) { say.textContent = tr(r.error); return; }
        if (!r.tier) { say.hidden = true; return; }
        var t = r.tier, where = r.card === "cpu" ? E("reader.tier.cpu") : fill("reader.tier.gpu", { "#0": r.card });
        if (r.wait) { say.textContent = fill("reader.tier.wait", { 0: t.quant, 1: Math.round(t.need_mb / 1024) }); return; }
        var why = r.reason === "shared" ? E("reader.tier.shared") + " " : r.reason === "no-card" ? E("reader.tier.nocard") + " " : r.reason === "no-ram" ? E("reader.tier.noram") + " " : r.card === "cpu" && $("rdCard").value === "cpu" ? E("reader.tier.cpuNote") + " " : "";
        say.textContent = why + fill("reader.tier.line", { 0: t.quant, 1: where, 2: t.rtf, 3: mmss(r.speech_s), 4: mmss(r.expect_s) }) + (r.kept ? " · " + E("reader.tier.loaded") : "");
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
        return '<button type="button" class="btn ghost small rd-tag" translate="no" data-g="' + gi + '" data-t="' + esc(it) + '">' + esc(String(it).replace(/_/g, " ")) + "</button>";
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
    var has = function (id) { return st.groups.some(function (g) { return g.id === id; }); }, m = MEN.filter(has), w = WOMEN.filter(has);
    var a = k % 2 ? (w.length ? w : m) : (m.length ? m : w);
    return a.length ? "g:" + a[Math.floor(k / 2) % a.length] : "";
  }
  function paintCast() {
    var box = $("rdCast"), text = $("rdText").value, names = speakers(text), first = text.split("\n").filter(function (l) { return l.trim(); })[0] || "";
    var narr = !!first && !speakers(first).length;      // a narrator: lines before the first «Name:» line, read in the voice above
    $("rdCastBox").hidden = st.mode !== "dialog";
    $("rdVoiceBox").hidden = st.mode === "dialog" && !narr;
    if (st.mode !== "dialog") return;
    var key = names.join("\u0001") + "|" + st.voices.length + "|" + st.groups.length;
    if (box.dataset.key === key) return;
    box.dataset.key = key;
    if (!names.length) { box.innerHTML = '<span class="rd-none">' + esc(E("reader.speakers.none")) + "</span>"; return; }
    box.innerHTML = names.map(function (n, k) {
      var cur = st.cast[n] != null ? st.cast[n] : castDefault(k), o = voiceOpts(cur);
      return '<div class="rd-spk"><span class="rd-spk-name" translate="no">' + esc(n) + '</span><div class="rd-spk-v"><select data-spk="' + esc(n) + '" data-hc-pick="1" data-cur="' + esc(o.ok ? cur : "") + '">' + o.html + "</select></div>" +
        '<button type="button" class="btn ghost small" data-listen="' + esc(n) + '">' + esc(E("reader.listen")) + "</button></div>";
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
  function count() { $("rdCount").textContent = fill("reader.chars", { "#0": $("rdText").value.length }); }
  function paintGo() {
    var e = engine(), ok = !st.absent && !!e;
    $("rdGo").disabled = !ok || st.sending;
    $("rdSay").textContent = st.absent ? "" : !e && st.loaded ? E("reader.engine.none") : "";
  }
  function paintForm() {
    $("rdOff").hidden = !st.absent;
    if (st.absent) $("rdOff").textContent = E("reader.absent");
    paintEngines(); paintCards(); paintVoice(); paintPalette(); paintEngineExtras(); paintMode(); paintGo();
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
    if (/^g:/.test(ref)) { var g = st.groups.filter(function (x) { return "g:" + x.id === ref; })[0]; return g ? g.centre : ""; }
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
    if (e && e.first_run) parts.push(esc(e.first_run));
    note.innerHTML = parts.join("<br>");
    note.hidden = !parts.length;
    var miss = (e && e.missing) || [], su = $("rdSetup"), how = (e && e.setup) || {};   // HERESY 2374: what this machine still lacks, and the way to it
    su.hidden = !miss.length;
    su.innerHTML = miss.length ? "<b>" + esc(E("reader.setup")) + "</b><ul>" + miss.map(function (m) {
      var id = "reader.miss." + m.id, w = E(id);
      return "<li>" + esc(w !== id ? w : m.say) + "</li>"; }).join("") + "</ul><div class=\"rd-actions\">" +
      (how.tier ? '<button type="button" class="btn small" id="rdSetupGo" data-tier="' + esc(how.tier) + '">' + esc(fill("reader.setup.go", { 0: how.size || "" })) + "</button>" : "") +
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
      return '<div class="rd-dict-item"><span translate="no">' + esc(w.word) + '</span><span translate="no">' + esc(w.form) + '</span><button type="button" class="btn ghost small" data-unword="' + esc(w.word) + '" aria-label="' + esc(E("reader.dict.remove")) + '">✕</button></div>';
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
      '<button type="button" class="btn ghost small" data-fx="undo"' + ((r.fixes || []).length && !r.fixing ? "" : " disabled") + ' data-tip="' + esc(E("reader.fix.undo.tip")) + '">' + esc(fill("reader.fix.undo", { "#0": (r.fixes || []).length })) + "</button>" +
      '<button type="button" class="btn ghost small" id="rdGapsHere" data-fx="gaps"' + (gapsAny(r) ? "" : " disabled") + ' data-tip="' + esc(E("reader.fix.gaps.tip")) + '">' + esc(E("reader.fix.gaps")) + "</button>" +   // HERESY 2334
      '<button type="button" class="btn ghost small" id="rdGapsCopy" data-fx="gapsCopy"' + (gapsAny(r) ? "" : " disabled") + ' data-tip="' + esc(E("reader.fix.gapsCopy.tip")) + '">' + esc(E("reader.fix.gapsCopy")) + "</button>" +
      '<button type="button" class="btn ghost small" data-fx="close">' + esc(E("reader.fix.close")) + "</button></div>" +
      '<div class="rd-say">' + esc(E("reader.fix.pick")) + "</div>" +
      '<div class="rd-pieces">' + (r.pieces || []).map(function (p) {
        var nv = (p.versions || []).length;
        return '<div class="rd-piece' + (p.i === st.fixSel ? " is-sel" : "") + '" data-piece="' + p.i + '"><button type="button" class="btn ghost small" data-fx="play" data-i="' + p.i + '" aria-label="' + esc(E("reader.fix.play")) + '">▶</button>' +
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
        '<div class="rd-actions"><button type="button" class="btn small" data-fx="reread"' + (r.fixing ? " disabled" : "") + ' data-tip="' + esc(E("reader.fix.reread.tip")) + '">' + esc(E("reader.fix.reread")) + "</button>" +
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
    var text = $("rdText").value.trim();
    if (!text) { toast(E("reader.empty"), "bad"); return; }
    var C = window.HeresyCollection;
    var body = { mode: st.mode, text: text, engine: $("rdEngine").value, voice: $("rdVoice").value, voices: castValues(), tags: $("rdTags").checked,
      split: $("rdSplit").value, temperature: num("rdTemp"), top_k: num("rdTopk"), hear: $("rdHear").checked, seed: $("rdSeed").value.trim(), gap: num("rdGap"), turn_gap: num("rdTurnGap"),
      card: $("rdCard").value || "auto", title: $("rdTitle").value.trim(), workspace: C && C.currentIn ? C.currentIn("reader") : C && C.current ? C.current() : "",
      lang: $("rdLang").value, stress: $("rdStress").checked, style: engine() && engine().style ? $("rdStyle").value.trim() : "" };
    if (engine() && (engine().tiers || []).length) body.tier = $("rdTier").value || "auto-speed";
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
      r.where ? '<span translate="no">' + esc(r.where) + "</span>" : "", '<span translate="no">seed ' + esc(r.seed) + "</span>",
      r.fixes ? '<span class="mono">' + esc(fill("reader.fixed", { "#0": r.fixes })) + "</span>" : "",
      r.book && r.book.parts ? "<span>" + esc(fill("reader.book.parts", { "#0": r.book.parts })) + "</span>" : "",   // HERESY 2344: a book, a part of one
      r.book && r.book.k ? "<span>" + esc(fill("reader.book.part", { "#0": r.book.k, "#1": r.book.of })) + "</span>" : ""].filter(Boolean).join(" · ");
    var acts = live(r) ? '<button type="button" class="btn ghost small" data-act="stop">' + esc(E("reader.stop")) + "</button>" :
      r.take ? '<button type="button" class="btn ghost small" data-act="open">' + esc(E("reader.open")) + '</button><button type="button" class="btn ghost small" data-act="reveal">' + esc(E("reader.reveal")) + "</button>" +
        '<button type="button" class="btn ghost small" data-act="fix" data-tip="' + esc(E("reader.fix.tip")) + '">' + esc(E("reader.fix")) + "</button>" : "";
    var open = st.openRun === r.id;   // HERESY 2381: the one card open, the others shut to one height
    return '<article class="rd-run ' + (open ? "is-open" : "is-shut") + '" data-id="' + esc(r.id) + '" data-status="' + esc(r.status) + '"' + (r.take ? ' data-take="' + esc(r.take) + '"' : "") + ">" +
      '<div class="rd-run-head" role="button" tabindex="0" aria-expanded="' + (open ? "true" : "false") + '"><span class="rd-run-title" translate="no">' + esc(r.title || r.id) + '</span><span class="rd-chip st-' + esc(r.status) + '">' + esc(ST[r.status] || r.status) + "</span></div>" +
      '<div class="rd-run-meta">' + meta + "</div>" +
      (live(r) ? '<div class="rd-bar"><i style="width:' + pct + '%"></i></div><div class="rd-run-meta mono">' + esc(fill("reader.of", { "#0": r.done || 0, "#1": r.of || 0 })) +
        (r.waiting ? ' · <span translate="no">' + esc(r.waiting) + "</span>" : "") +
        (r.status === "running" && r.expect && r.elapsed != null ? " · " + esc(fill("reader.tier.left", { 0: mmss(r.expect - r.elapsed) })) : "") + "</div>" : "") +
      (r.status === "done" && r.seconds ? '<div class="rd-run-meta mono"><span translate="no">' + esc(Math.floor(r.seconds / 60) + ":" + ("0" + Math.round(r.seconds % 60)).slice(-2)) + "</span> · <span>" + esc(E("reader.never")) + "</span>" +
        (r.tier && r.gen_s && r.seconds ? " · <span>" + esc(fill("reader.tier.measured", { 0: (r.gen_s / r.seconds).toFixed(2) })) + "</span>" : "") +
        (r.cer != null ? " · <span>" + esc(fill("reader.heard", { 0: (100 * r.cer).toFixed(1) })) + "</span>" + (r.rereads ? " · <span>" + esc(fill("reader.reread", { "#0": r.rereads })) + "</span>" : "") :
          r.hear_error ? ' · <span class="rd-cer" data-tip="' + esc(r.hear_error) + '">' + esc(E("reader.notheard")) + "</span>" : "") +
        (r.lufs != null ? ' · <span translate="no">' + esc(r.lufs.toFixed(1)) + " LUFS</span>" : "") + (credit(r.engine) ? " · " + credit(r.engine) : "") + "</div>" : "") +   // HERESY 2275: the credit on the result
      (r.status === "done" && r.reread_why && r.reread_why.length ? r.reread_why.map(whyHtml).join("") : "") +   // HERESY 2295: which pieces were read again and why
      (r.status === "done" && (r.tails || r.tones || r.holes || r.level_off || r.tail_error) ? '<div class="rd-run-meta mono">' +   // HERESY 2335: the tail guard
        [r.tails ? esc(fill("reader.guard.tails", { "#0": r.tails })) : "", (r.tones || 0) + (r.holes || 0) + (r.level_off || 0) ? esc(fill("reader.guard.listen", { "#0": (r.tones || 0) + (r.holes || 0) + (r.level_off || 0) })) : "",
          r.tail_error ? '<span class="rd-cer" data-tip="' + esc(r.tail_error) + '">' + esc(E("reader.guard.failed")) + "</span>" : ""].filter(Boolean).join(" · ") + "</div>" : "") +
      (r.error ? '<div class="rd-run-err" translate="no">' + esc(r.error) + "</div>" : "") +
      (acts ? '<div class="rd-run-acts">' + acts + "</div>" : "") + "</article>";
  }
  function whyHtml(x) {   // HERESY 2295: «piece 1: inserted “пуво” at 0:11.2 · kept reading 2 of 3», the time in the take
    var parts = (x.why || []).map(function (w) {
      var key = w.kind === "swapped" ? "reader.why.swapped" : w.kind === "dropped" ? "reader.why.dropped" : "reader.why.inserted";
      var at = w.at != null ? " " + fill("reader.why.at", { 0: Math.floor(w.at / 60) + ":" + ("0" + (w.at % 60).toFixed(1)).slice(-4) }) : "";
      return esc(fill(key, { 0: w.word || "", 1: w.heard || "" }) + at);
    });
    if (!parts.length && x.cer != null) parts = [esc(fill("reader.why.letters", { 0: (100 * x.cer).toFixed(0) }))];
    return '<div class="rd-run-meta mono" translate="no">' + esc(fill("reader.why.piece", { "#0": x.piece })) + ": " + parts.join(", ") + " · " +
      esc(fill("reader.why.kept", { "#0": x.kept, "#1": x.reads })) + "</div>";
  }
  function paintRuns() {
    var box = $("rdRuns");
    if (!box) return;
    var h = st.runs.length ? st.runs.map(runHtml).join("") : '<span class="rd-none">' + esc(E("reader.runs.none")) + "</span>";
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
      st.engines = r[0].engines || []; st.voices = r[1].voices || []; st.groups = r[1].groups || []; st.cards = r[2] || null;
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
          (t.status === "done" ? '<button type="button" class="btn ghost small" data-tr-act="open">' + esc(E("reader.tr.open")) + "</button>" : "") +
          (t.status !== "running" && t.status !== "queued" ? '<button type="button" class="btn ghost small" data-tr-act="remove">' + esc(E("reader.tr.remove")) + "</button>" : "") +
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
        var c = ((((r && r.choices) || [])[0] || {}).message || {}).content || "";
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
    b.textContent = "🗣 " + E("reader.toReader");
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
      var del = '<td class="x"><button type="button" class="btn ghost small" data-gm-del="' + i + '" aria-label="' + esc(E("reader.gmap.del")) + '" data-tip="' + esc(E("reader.gmap.del")) + '">✕</button></td></tr>';
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
    $("rdGmView").textContent = E(gm.text ? "reader.gmap.asTable" : "reader.gmap.asText");
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
    var rd = new FileReader();
    rd.onload = function () {
      var b64 = String(rd.result || "").replace(/^data:[^,]*,/, ""), ext = (f.name.split(".").pop() || "wav").toLowerCase();
      api("/reader/voice", { name: name, lang: $("rdOwnLang").value, text: $("rdOwnText").value.trim(), consent: true, audio_b64: b64, ext: ext }).then(function (v) {
        toast(fill("reader.own.kept", { 0: v.name || name }));
        $("rdOwn").hidden = true; $("rdOwnOk").checked = false; $("rdOwnFile").value = ""; $("rdOwnFileName").textContent = "";
        keep("yue2.readerVoice", "v:" + v.id);
        return api("/reader/voices").then(function (d) { st.voices = d.voices || []; st.groups = d.groups || []; paintVoice(); $("rdCast").dataset.key = ""; paintCast(); });
      }).catch(function (e) { toast(e.message, "bad"); });
    };
    rd.readAsDataURL(f);
  }

  // ---------------------------------------------------------------- the room's hands
  function bind() {
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
    var tt = 0;
    $("rdText").addEventListener("input", function () {
      count();
      clearTimeout(tt);
      tt = setTimeout(function () { keep("yue2.readerText", $("rdText").value.slice(0, 200000)); paintCast(); tierLook(); }, 300);
    });
    $("rdText").addEventListener("keydown", function (e) { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } });
    $("rdVoice").addEventListener("change", function () { keep("yue2.readerVoice", this.value); });
    $("rdEngine").addEventListener("change", function () { keep("yue2.readerEngine", this.value); paintCards(); paintPalette(); paintEngineExtras(); paintGo(); });
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
      else if (act === "open" && take && window.ruachOpenTake) window.ruachOpenTake(take);
      else if (act === "reveal" && take && window.HeresyCollection && window.HeresyCollection.reveal) window.HeresyCollection.reveal(take);
      else if (act === "fix") fixOpen(card.dataset.id);
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
  function credits() {
    var ul = document.querySelector("#aboutCard .about-col .about-cap + ul.about-links");
    if (!ul || $("rdCreditDrama")) return;
    [["rdCreditDrama", "https://huggingface.co/fishaudio/drama-3", "reader.credit.drama", "hugging face \u00b7 fishaudio/drama-3 \u00b7 Fish Audio Community License \u00b7 Built with Fish Audio"],
     ["rdCreditRe", "https://github.com/resemble-ai/resemble-enhance", "reader.credit.re", "github \u00b7 resemble-ai/resemble-enhance \u00b7 MIT"],
     // HERESY 2374: the engine the Narrator reads through, and the Ukrainian stresses with every link of their source
     ["rdCreditAcpp", "https://github.com/0xShug0/audio.cpp", "reader.credit.acpp", "github \u00b7 0xShug0/audio.cpp \u00b7 Apache-2.0"],
     ["rdCreditUk", "https://github.com/lang-uk/ukrainian-word-stress", "reader.credit.uk", "github \u00b7 lang-uk/ukrainian-word-stress \u00b7 MIT \u00b7 ULIF, lcorp.ulif.org.ua/dictua"]].forEach(function (c) {
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
})();
