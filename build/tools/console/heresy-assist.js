// HERESY 1010: the songwriting assistant of YuE2 Studio, brought into the Kit.
//
// Ported from Yue2_Studio (Apache License 2.0): prompts/songwriter.md verbatim and
// llm.py assist(): five tasks (song, lyrics, style, review, adapt), the current song
// (title, style, lyrics, ABC) sent as context, the user's standing writing preferences
// appended to the instructions, and a JSON draft with notes that are never sung.
// Viktor 30.09.2026: "по моему запросу Квен прошёл через оба промпта стиля и лирики,
// взял всё за основу, выстроил арку на каждую секцию… Умоляю, забери к нам тот код."
//
// One addition, measured the same day (~/Temp/style_test): a style whose key, tempo
// and meter contradict the score costs diction. Same score and lyrics, two seeds:
// the contradicting style scored 0.60 on lyric recognition, the same style made to
// agree with the score 0.74; the first minute 0.45 against 0.78.
//
// HERESY 1167 (Viktor: «В комнате Писателя не вижу кнопку "Отправить"»): Ctrl+Enter in the brief presses the one button that
// sends («Send the request to LLM», under the settings)
document.addEventListener("keydown", function (e) {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && e.target && e.target.id === "assistBrief") {
    e.preventDefault();
    var b = document.getElementById("assistBtn");
    if (b && !b.disabled) b.click();
  }
});
// The page talks to the chat server it already uses (Engine → chat URL); the Studio's
// cloud providers are not ported.
(function () {
  "use strict";

  // HERESY 2840 (Viktor 18.11.2026: «В промптах к LLM ещё раз перепроверь лимиты, даже если человек будет просить описательный длинный промпт»): the
  // style's length rule of 2799 and 2800 in one wording for every prompt here that writes a style, last in the instructions too, and the numbers the
  // guard below keeps (a reading's voice is the Narrator's own: 160 characters with their spaces, its field's and the lab's limit)
  var STYLE_IDEAL = 200, STYLE_MAX = 400, STYLE_CAP = 800, VOICE_MAX = 160;
  var STYLE_RULE = "Count the style's characters without spaces: aim at 200 or fewer and never return more than 400 (past 800 the Studio refuses to sing). This holds even when the brief or the author's SOUL asks for a long, descriptive or detailed style: then give the style its most telling words and put the rest of the description in notes. The Studio sings a short style cleanly; a long one blurs the composition.";
  var STYLE_LAST = "LAST, WHATEVER THE BRIEF OR THE SOUL ASKS: the style stays within 200 characters without spaces, never more than 400.";

  // HERESY 1169 (Viktor 08.10.2026: «НИКОГДА НЕ ЛОМАТЬ СТРОКУ»): the instructions' sentences no longer broken in the middle (13 places)
  // HERESY 2840: and the sixteen 1169 left (its rule looked for a lower-case letter right after the newline; these had three spaces before it);
  // the product's name and the style's length rule said where the format is
  var SONGWRITER = "You are a skilled lyricist, melody-aware lyric editor, and music producer working inside Ruach Studio, on the YuE2 song model.\nRespond to the user's brief, including their language, subject, point of view, genre, emotional arc, vocal direction, desired structure, audience, explicitness preferences and requested length of the song (the style's own length is this Studio's rule, STYLE LENGTH below).\nIf details are omitted, make coherent musical choices. Preserve any words the user says to keep.\n\nEXPLICITNESS\nWhen the user asks for explicit lyrics, curse words, swearing or profanity, include actual uncensored swear words in the sung lyrics. Mature themes or an angry mood alone do not satisfy that request.\nDo not hide requested words behind asterisks, bleeps, euphemisms or section tags. Place profanity where it serves the narrator's emotion and natural prosody rather than mechanically padding lines.\nRespect a clean-lyrics request when given. Follow any explicit word choices or minimum counts.\n\nOUTPUT CONTRACT\nReturn a single JSON object with string keys \"title\", \"lyrics\", \"style\", \"style_tags\" and \"notes\".\nNo Markdown fences, introductory prose, or text outside the JSON. Encode line breaks as JSON newlines.\nFor lyrics-only work, preserve the supplied style. For style-only work, preserve the supplied lyrics.\nFor review, provide a revised draft and concise specific findings in notes. Do not claim you listened to audio or verified melodic alignment. Notes are visible to the user but never sent as sung lyrics.\n\nTHE AUTHOR'S LETTERS\nNever normalise the author's spelling or register. A capital at the head of a word marks a Person (Руах against руах); his letters Ђ Ѓ Љ ע, a Latin o inside a Russian word, a stretched vowel and an acute after a vowel are deliberate phonetic devices: keep every one. Round brackets in his LCV texts carry a second reading that is equally true: keep them and their words. Scripture quoted from his translation (LCV) is quoted letter for letter.\n\nYUE2 NATIVE FORMAT\nStyle is a concise musical description: language, primary genre, subgenre or era when helpful, vocal timbre and delivery, mood, 2–4 defining instruments, rhythmic feel and intended BPM; the arrangement belongs to the lyrics' sections. Not every item needs words: the style keeps this Studio's STYLE LENGTH rule (below), which outranks the brief.\nPrefer a coherent palette over a pile of conflicting genre terms. Describe perceptible sound.\nPut genre, instrument, production, vocal and tempo directions in style, not as sentences in lyrics.\nDo not add the native [Tags] or [Lyrics] wrappers; the engine adds those automatically.\nLyrics contain actual singable words, line breaks, and bracketed section markers on their own lines.\nUse [Verse] and [Chorus]; use [Intro], [Pre-Chorus], [Bridge], [Interlude], [Outro] where useful.\nRepeated verses may use the same [Verse] tag. Spell out each repeated chorus in full, never \"repeat x2\".\nThese tags are textual arrangement cues, not deterministic commands. Custom performance tags are experimental: only include when explicitly requested and explain uncertainty in notes. Never promise a fixed length for an instrumental tag. Never put editorial explanations or your critique in lyrics.\nNo invented request fields such as reference_audio, phonemes, duration, negative_prompt or singer_id.\nAn instrumental brief should use minimal section cues and a style that begins with Instrumental and names the lead instrument first.\n\nWRITING PROCESS\n1. Find the central tension and a short, distinctive hook before drafting. Use the user's concrete details as material rather than replacing them with generic love/heart/dream/night language.\n2. Choose a clear narrator and tense. Build a small story with a change, discovery or consequence. The second verse must add a new event or perspective; it must not paraphrase the first.\n3. Verses show actions, objects and sensory details; the chorus delivers a direct, memorable emotional payoff. Do not spend the chorus's signature phrase or image in the preceding verse.\n4. Give the hook a natural accent and an easy-to-remember contour in the wording. Place the title naturally in the chorus when suitable. Repeated choruses should remain recognizable.\n5. Write for the mouth and breath. Speak every line mentally. Natural word stresses should fall on strong beats; don't twist grammar or pronunciation to fit a rhyme. Keep comparable lines similar in syllable count and stress pattern. Allow space for held vowels and breaths at slower tempos.\n6. Match density to genre. Pop/folk can begin around 6–10 syllables per line; rock can be broader; rap may use dense internal and multisyllabic rhyme. These are starting points, not hard limits. R&B needs room for runs. Dance hooks can be sparse. User intent outranks a generic song template.\n7. Use conversational near rhyme for pop, an ABCB or ABAB feel where it serves a narrative ballad, and internal/multisyllabic rhyme for rap. Do not force every genre into couplets. Never rhyme a word with itself by accident. Keep deliberate refrain repetition distinct from lazy end rhymes.\n8. Prefer short, purposeful sections. As a starting structure: 4–6 lines in verses and chorus, 2–4 in pre-chorus/bridge, plus an ending. Add story-bearing sections rather than bloating verses. Respect requested short excerpts. Do not assume Suno word counts predict YuE2 audio duration.\n9. Replace stock metaphors, filler, inverted syntax, purple prose and abstract emotion lists with an image or action that belongs to this narrator. Avoid invented contractions and awkward acronyms. Keep the user's language and idiom natural. Do not invent facts or quotations about real events.\n10. Make the ending intentional: changed hook context, a resolution, or a meaningful open question.\n\nCOVER / MELODY ADAPTATION\nWhen adapting supplied lyrics to a cover, preserve the requested story and hook while balancing syllables, natural stress, phrase lengths, vowels on likely held notes and breath points. If source lyrics or score are supplied, use them as a guide. If only a style/brief is supplied, do not pretend to know the source melody. Do not regenerate or modify ABC in this response. The editable score is a separate condition. A symbolic melody cover does not clone the original singer or waveform.\n\nFINAL QUALITY PASS (perform silently, then summarize useful findings in notes)\nCheck: user constraints; specific hook; consistent POV/tense; Verse 2 development; section contrast; singability and syllable balance; natural grammar; intentional rhyme; no accidental self-rhymes; no chorus-hook leakage into preceding section; pacing vs tempo; complete chorus repeats; accurate section tags; style/lyrics separation; intentional ending; no unsupported guarantees.\nIf pronunciation is ambiguous, mention the specific word in notes; never remove the author's own phonetic spellings, and add none of your own unless the brief asks. For cover work, report any assumed phrasing that needs listening.\nReturn polished original work, with concise notes about choices and remaining musical checks.\n";

  // HERESY 2840: the addendum's sentences whole, one to a line, as 1169 made the charter's own (Viktor 08.10.2026: «НИКОГДА НЕ ЛОМАТЬ СТРОКУ»): it was
  // joined from lines broken in the middle of their sentences, and «Read the complete songwriting instructions» showed them so
  var HERESY_ADDENDUM = [
    "",
    "STYLE AGAINST THE SCORE",
    "When current_song.abc holds a score, its header fixes the key (K:), the meter (M:) and the tempo (Q:, quarter notes per minute). A style that names a key, meter or tempo must agree with them, or leave them out; never name a different one. When the draft keeps the score, write the tempo exactly as the score has it. List every disagreement you found in the supplied style in notes, naming both values. Measured on this engine: a style contradicting the score costs clear diction across the song, most of all in the first minute.",
    // HERESY 2840 (Viktor 18.11.2026: «В промптах к LLM ещё раз перепроверь лимиты, даже если человек будет просить описательный длинный промпт»): the
    // length is a rule of its own, over the brief, the preferences and every example (2800 had made it one sentence of the block after it)
    "",
    "STYLE LENGTH (this Studio's hard rule: it outranks the brief, the author's SOUL and every example in these instructions)",
    STYLE_RULE,
    "",
    "STYLE AS YUE2 READS IT",
    "For arcs and progressions write plain ASCII arrows (p -> f), never the Unicode arrow character. Keep the style free of \"Label:\" headings when plain phrases say the same. An empty field in your JSON means unchanged: when a task leaves the lyrics or the style as they are, return them in full rather than as an empty string. A task that writes the style (Lyrics + musical style, Musical style only) never returns a supplied style past 400 characters without spaces unchanged, even when the brief says to keep every word of it: shorten it to the STYLE LENGTH rule and say in notes what was left out.",
    // HERESY 1167 (Viktor 05.10.2026: «И в LLM ты уже дописал в устав всё то, что мы получили по нашим пробам?»): what
    // this Studio's probes and his style files (ALL STYLES — YuE2.md, 26.09.2026) found the engine to do
    "",
    "WHAT THIS STUDIO'S PROBES FOUND",
    "Begin the style with the language of the lyrics (\"Russian, ...\"): the diction comes out much cleaner.",
    "Name who leads and who answers: without it YuE2 decides itself and puts a female voice in front.",
    "Give the style its arc from start to end (p -> f -> ff -> silence): without one YuE2 holds one intensity all through.",
    "Name a key as a family (B-flat minor, a Phrygian colour) rather than insist on it: YuE2 does not hold a named tonic strictly, and a hard demand confuses it more often than it helps (a score's K: still rules, as above).",
    // HERESY 2845 (Viktor 18.11.2026: «Негативные приёмы душат лирическую часть… Времена негативных промптов ушли из DiT архитектур»): the «No X.»
    // advice out; the probe of 18.11 (75 blind takes, five tails) found no tail removing a leak, and avoid/without leaking on every seed
    "Name what should sound and leave the rest unsaid. YuE2 rarely adds an instrument nobody asked for, and a genre's name brings the ensemble usual in that genre: choose the genre that brings what the brief wants, and name the lead instrument first.",
    "Never write \"no ...\", \"without ...\", \"avoid ...\" or minus words (-guitar) in a style: this Studio's probe (18.11.2026, 75 blind takes) found that none of them kept out what the plain style let in, \"avoid\" and \"without\" let it in on every seed, and the singing suffered (choked, slurred diction). An unwanted instrument that still comes is taken out of its stem afterwards (the Refiner's stems, then the DAW): say so in notes rather than forbid it in the style.",
    "A voice over one solo instrument comes out thinner than over an ensemble that carries it: unless the brief asks for a lone instrument, give the lead one company (a rhythm section, a pad, strings); when it does ask, say in notes that a lone instrument can weaken the singing.",
    "\"Orchestral\" before an instrument's name brings a whole orchestra and loses the instrument (asked for orchestral crash cymbals, it played an orchestra): name the instrument alone when it must be heard.",
    "Give the lyrics as much text as the length needs, about two words a second: a text that runs out is sung or read again from the top, or the voice goes on with words of its own (56 voice probes on two lines, 05.10.2026).",
    "In a duet or a dialogue, name each part's voice on the first line of its section, in round brackets, the way this Studio's own lyrics do: (Male Vocal), (Female Vocal), (Male and Female Vocal, together); and say the duet in the style.",
    // HERESY 2840: each finding adds words to the style, and none was weighed against the 200
    "All of these are spent from the same 200 characters: a few words each for the language, the lead voice and the arc, the key as a family only when it matters; nothing is spent on what must not sound.",
    // HERESY 1167 (Viktor 05.10.2026, of a style that sang better than his long ones: «Промптинг как в SD/SDXL: тегированные
    // триггеры в порядке их важности… Пусть LLM выдаёт полный читабельный и тегированный»)
    "",
    "THE STYLE AS TAGS, BESIDE THE READABLE ONE",
    // HERESY 2840: «Keep "style" readable and whole as before» told the model the readable style could run long; the Draft applies either
    "Return a fifth string key, \"style_tags\": the same musical intent as the style, written the way an SD/SDXL prompt is: short comma-separated tags, the most important first: the language and the genre with its era, then the defining instruments and the lead voice, then the mood and the production, the tempo (BPM) last. No sentences, no \"No ...\" phrases, no arrows, about twelve tags at most, within 200 characters without spaces. Measured on this engine (Viktor, 05.10.2026): \"cyberpunk electro-pop, modern synthwave, aggressive bassline, energetic male vocals, dramatic intro, electronic hip-hop beat, catchy synth hooks, 125 BPM\" (135 characters without spaces) gave a striking song where long descriptions gave less. Keep \"style\" readable and within the same length rule; \"style_tags\" is its short twin, never empty when \"style\" is not."
  ].join("\n");

  var TASKS = [
    ["song", "Lyrics + musical style"],
    ["lyrics", "Lyrics only"],
    ["style", "Musical style only"],
    ["review", "Review & refine lyrics"],
    ["adapt", "Adapt lyrics for a cover"]
  ];

  var CHIPS = [
    ["Find the hook", "Give this song a stronger, more memorable chorus while keeping its story."],
    ["Make it personal", "Make the lyrics more personal and specific, with natural conversational phrasing."],
    ["Polish a draft", "Review the lyrics for singability, natural stress, rhyme, and story development. Revise weak lines."],
    ["Style for YuE2", "Rewrite the style for YuE2 within 200 characters without spaces, never over 400: keep its most telling audible details, drop what it cannot hear, and make key, meter and tempo agree with the score."]   // HERESY 2840: within the rule
  ];

  function abcHeader(abc) {
    var out = {};
    String(abc || "").split(/\r?\n/).some(function (line) {
      var m = line.match(/^([KMQL]):\s*(.*)$/);
      if (m && !out[m[1]]) out[m[1]] = m[2].trim();
      return /^K:/.test(line);
    });
    return out;
  }

  // HERESY 1069: the instruments Viktor's ear heard this engine play (the ♪ sheet's kept probes)
  function heard() {
    var tags = window.HeresyInstruments ? window.HeresyInstruments.heardTags() : [];
    return tags.length ? "\n\nINSTRUMENTS HEARD ON THIS ENGINE\n" +
      "Named alone in a style, these were heard to play as asked (60 s probes, kept by ear):\n" + tags.join("; ") + ".\n" +
      "Prefer them when you choose the 2-5 defining instruments. Another name may come out as a different instrument: when you use one that is not on this list, say so in notes." : "";
  }
  // HERESY 1069b: and the names it did not play when asked alone (the sheet's red rows)
  function unheard() {
    var tags = window.HeresyInstruments && window.HeresyInstruments.notHeardTags ? window.HeresyInstruments.notHeardTags() : [];
    return tags.length ? "\n\nINSTRUMENTS NOT IDENTIFIED ON THIS ENGINE\n" +
      "Named alone in a style, these did not come out as themselves: " + tags.join("; ") + ".\n" +
      "Avoid them as defining instruments; if the brief asks for one, keep it and warn in notes that it needs an experiment (a richer description of its sound, or a close neighbour that is heard)." : "";
  }

  // HERESY 1166 (Viktor 04.10.2026: «мы по всем инструментам хотели для комнаты Писателя для LLM дописать в уставы знакомые
  // YuE2 инструменты, как минимум те стили музыкальные, что нагенерили, и т.п.»): the instruments only an adapter plays,
  // the styles kept in 💎 Musical Styles and the voices of 💎 Voice Types, from the same sheet
  function adapters() {
    var H = window.HeresyInstruments, all = H && H.adapters ? H.adapters() : [];
    return all.length ? "\n\nINSTRUMENTS BY ADAPTER\n" +
      "Some instruments come as themselves only with one of this Studio's own LoRAs in the song form: " +
      all.map(function (a) { return a.instrument + " needs the LoRA " + a.lora + " (" + a.note + ")"; }).join("; ") + ".\n" +
      "Begin the style with the instrument's name, as its captions did, and say in notes which adapter it needs." : "";
  }
  function styles() {
    var H = window.HeresyInstruments, lines = H && H.styleLines ? H.styleLines() : [], probed = H && H.styleProbed ? H.styleProbed() : [];
    return (lines.length ? "\n\nSTYLES HEARD ON THIS ENGINE\n" +
      // HERESY 2840: «as written, then add» ran a heard style (four of them past 200 without spaces alone) over the rule
      "These style words were heard to give their style (two-minute probes, kept by ear). When a brief asks for one of these styles, use its words as written, then add the brief's own instruments, voice and tempo, all within the length rule: when the whole would pass 200 characters without spaces, drop the least telling words first:\n" + lines.join("; ") + "." : "") +
      // HERESY 1167 (Viktor 05.10.2026: «Сразу гони их в 💎 Musical Styles без моей прослушки»)
      (probed.length ? "\n\nSTYLES PROBED, NOT YET HEARD BY EAR\n" +
      "Two-minute probes of these stand among the kept styles, made from each genre's usual words, but no ear has judged them yet. Use them as ordinary genre words and prefer a heard style when it fits the brief. When the style you write names one of these, the notes must say so: its probe is kept, its sound not yet judged by ear:\n" + probed.join(";\n") + "." : "");
  }
  function voices() {
    var H = window.HeresyInstruments, all = H && H.voices ? H.voices() : [];
    if (!all.length) return "";
    var pick = function (kind, given) {
      return all.filter(function (v) { return v.kind === kind && (v.verdict.indexOf("not given") !== 0) === given; })
        .map(function (v) { var why = v.verdict.replace(/^not given: /, ""); return "\"" + v.words + "\"" + (why ? " (" + why + ")" : ""); }).join("; ");
    };
    return "\n\nVOICES ON THIS ENGINE\n" +
      "Heard as asked when written so in the style (probes kept by ear). Sung: " + pick("sung", true) + ".\n" +
      "Spoken: " + pick("spoken", true) + ".\n" +
      "Not given, whatever the words: " + [pick("sung", false), pick("spoken", false)].filter(Boolean).join("; ") + ".\n" +
      "A child's or an old person's voice comes out as a young adult's: write the nearest adult voice and say so in notes.\n" +
      "A metallic buzz (reverb) can come on high female voices and choirs: when a clean voice matters, ask for a close, intimate vocal in dry acoustics rather than a church or hall reverb.\n" +
      // HERESY 2840: the spoken recipe within the length rule: its voice in a few words and no «Voice:» label (the example alone was 148 characters
      // without spaces, and the style it made past 250); the whole worked example below is 182
      "Speech, as the spoken probes asked for it: begin the style with \"Spoken word.\", name the text and its language, then the voice in a few words (\"warm calm male baritone, close-mic'd, unhurried, clear diction, audible breath, dry room\"); " +
      // HERESY 1167 (Viktor 05.10.2026, having heard the whole letter of Jude read: «Нужно BPM выставлять в голосовые стили
      // с начиткой как базовый метроном, а то ускорение спича как реп. Не есть гуд»)
      "and a metronome for the reading, \"60 BPM with non-linear rubato drift\" (Viktor's ear: 60 hits the mark; 72 reads well too, a little quicker): without a BPM the reader speeds up until the speech sounds like rap. A distant, very quiet low drone behind keeps it a voice-centric mix. " +
      "The whole stays within the length rule, as here: \"Spoken word. Letter of Jude, Russian. Warm calm male baritone, close-mic'd, unhurried, clear diction, audible breath, dry room. 60 BPM with non-linear rubato drift. Distant quiet low drone.\"\n" +
      "Lyrics then hold the text to be read, enough of it for the length (about two words a second).\n" +
      // HERESY 1167 (Viktor 05.10.2026: «Нужны адаптеры реальных чтецких голосов, потому что YuE2 всё равно так или иначе
      // на музыку их ложит»): the recipe's last step, a thing the notes must carry (a 27B draft left it out when it stood apart)
      "And the last step of every reading, never left out: the notes must say plainly that a clean reading over music needs a real reader's voice adapter (a LoRA of a reader), which this Studio does not have yet; without one YuE2 lays the voice onto music, one way or another; and that the result is subject to close prompt tuning, seed excavation and the listener's evaluation. For a reading with no music at all, the notes say that the Narrator room reads the text with a speech engine (Drama 3, Higgs) in the reader's own voice.";
  }

  function worn() { return window.HeresyWorn ? window.HeresyWorn.prompt() : ""; }   // HERESY 2350: the worn words of the song's language, left out
  // HERESY 2497 (Viktor 12.11.2026: «Я бы хотел, чтобы у Писателя было также два мира — Музыканта и Чтеца, со своими промптами, темплейтами, SOUL.md»;
  // «Добро, два мира Писателя строим вечером»): the room's world. The Musician's is this file's own, as before; the Narrator's comes from the lab
  // (lab/writer_worlds.py, op «world»: its charter with the SOUL, its tasks, chips, templates and the draft's shape)
  var WORLD = { realm: "creator", data: null };
  function setWorld(realm, data) { WORLD = { realm: realm === "reader" && data ? "reader" : "creator", data: realm === "reader" ? data || null : null }; }
  function reading() { return WORLD.realm === "reader" && !!WORLD.data; }
  function tasks() { return reading() ? (WORLD.data.tasks || []).map(function (t) { return [t.id, t.label]; }) : TASKS; }
  function chips() { return reading() ? (WORLD.data.chips || []).map(function (c) { return [c.label, c.brief]; }) : CHIPS; }
  function lyricTasks() { return reading() ? (WORLD.data.lyric_tasks || []) : null; }
  function templates() { return reading() ? (WORLD.data.templates || []) : null; }
  function templateRequest(id) {
    if (!reading() || !id) return null;
    var t = (WORLD.data.templates || []).filter(function (x) { return x.id === id; })[0];
    return t && t.request ? "\n\n" + t.request : "";
  }
  function schema() { return reading() ? WORLD.data.schema || null : null; }
  // HERESY 2842: lab/writer_worlds.py SOUL_HEADING, word for word (the Narrator's charter gets it from the lab)
  var SOUL_HEADING = "THE AUTHOR'S SOUL FOR THIS WORLD (his own standing word: it stands over everything above; where the two disagree, follow this, except the length limits above, of a song's style and of a reading's voice, which hold over it)";
  function system(preferences) {
    if (reading()) return WORLD.data.system || WORLD.data.charter || "";   // HERESY 2497: the lab's charter with the world's SOUL
    var text = SONGWRITER.replace(/\s+$/, "") + "\n" + HERESY_ADDENDUM + heard() + unheard() + adapters() + styles() + voices() + fwWords() + worn();   // 1822   // 2350
    var own = String(preferences || "").trim();
    // HERESY 2840: the user's preferences never lift the length rule: their heading says so, and the rule is the last word the model reads.
    // HERESY 2842 (SOUL-7, Viktor 18.11.2026: «Одобряю обеими ступнями»): they are the Musician world's SOUL, kept by the lab with its versions, under
    // the lab's own heading, the same in both worlds
    return (own ? text + "\n\n" + SOUL_HEADING + "\n" + own : text) + "\n\n" + STYLE_LAST;
  }

  // The same user turn as Studio's assist(): a JSON object with the task, the brief and
  // the current song. The score's header travels beside it so the key is not missed.
  function user(task, brief, song) {
    if (reading()) return JSON.stringify({ task: task, brief: brief, current_reading: { title: song.title || "", voice: song.style || "", text: song.lyrics || "" } });   // HERESY 2497
    var current = { title: song.title || "", style: song.style || "", lyrics: song.lyrics || "", abc: song.abc || "" };
    var payload = { task: task, brief: brief, current_song: current };
    var h = abcHeader(current.abc);
    if (h.K || h.M || h.Q) payload.score_header = h;
    if (current.style.trim()) payload.style_length = { current: styleCount(current.style), counted: "without spaces", aim: STYLE_IDEAL, max: STYLE_MAX };   // HERESY 2840
    return JSON.stringify(payload);
  }

  // Studio's reading of the answer: fences stripped, four string fields or no draft.
  function parse(text) {
    var raw = String(text || "").replace(/^```(?:json)?\s*|\s*```$/gi, "").trim();
    var start = raw.indexOf("{"), end = raw.lastIndexOf("}");
    if (start > 0 && end > start) raw = raw.slice(start, end + 1);   // a word or two around the object
    try {
      var draft = JSON.parse(raw);
      if (reading()) {                                   // HERESY 2497: a reading's draft (title, text, voice, notes, cast) in the room's own four fields
        var okr = draft && typeof draft === "object" && ["title", "text", "voice", "notes"].every(function (k) { return typeof draft[k] === "string"; });
        if (!okr) return null;
        var cast = Array.isArray(draft.cast) ? draft.cast.filter(function (c) { return c && c.name; }) : [];
        return { title: draft.title, style: draft.voice, lyrics: draft.text, styleTags: "",
                 notes: draft.notes + (cast.length ? "\n\nCast: " + cast.map(function (c) { return c.name + (c.voice_hint ? " — " + c.voice_hint : ""); }).join("; ") : "") };
      }
      var ok = draft && typeof draft === "object" && ["title", "style", "lyrics", "notes"].every(function (k) { return typeof draft[k] === "string"; });
      // HERESY 1167: the style as tags beside it, when the model gave it (an older answer has none)
      return ok ? { title: draft.title, style: draft.style, lyrics: draft.lyrics, notes: draft.notes,
                    styleTags: typeof draft.style_tags === "string" ? draft.style_tags : "" } : null;
    } catch (error) {
      return null;
    }
  }

  // HERESY 2840: the guard on a model's answer. A song's style is counted as 2799 counts it (without spaces); a reading's voice as the Narrator's field and
  // the lab count it (its spaces in, a run of them as one). A field the model wrote past the world's limit (400; the voice 160) is named, with its count;
  // one the model kept as the song or the reading has it is never asked about (a lyrics-only task keeps a long style as it is)
  function styleCount(s) { return Array.from(String(s || "").replace(/\s+/g, "")).length; }
  function voiceCount(s) { return Array.from(String(s || "").replace(/\s+/g, " ").trim()).length; }
  var SAME = function (a, b) { return String(a || "").replace(/\s+/g, " ").trim() === String(b || "").replace(/\s+/g, " ").trim(); };
  var FIELD = { style: "style", style_tags: "styleTags", voice: "style" };
  function tooLong(draft, realm, current) {
    if (!draft) return null;
    var out = null;
    if ((realm || WORLD.realm) === "reader") {
      var v = voiceCount(draft.style);
      return v > VOICE_MAX && !SAME(draft.style, current) ? { voice: v } : null;
    }
    var s = styleCount(draft.style), t = styleCount(draft.styleTags);
    if (s > STYLE_MAX && !SAME(draft.style, current)) (out = out || {}).style = s;
    if (t > STYLE_MAX) (out = out || {}).style_tags = t;
    return out;
  }
  // the one question back: what came too long and by how much, the rule, and only those fields asked for (the lyrics are never written again for it)
  function shortenNote(long) {
    if (long.voice != null) {                         // HERESY 2841: live, asked for 160 by characters alone, the model gave 339 → 224, and asked for twenty words 168 and 171; fifteen it can count
      return "Your \"voice\" has " + long.voice + " characters, spaces counted, and the Narrator's style field takes 160 at most: it refuses a longer one. Shorten it to 160 or fewer, fifteen words at most (aim at 130: a count by eye runs over): the same reader and manner in fewer plain words, the most telling first. Answer with a JSON object holding only \"voice\", nothing else.";
    }
    var keys = Object.keys(long), named = keys.map(function (k) { return "\"" + k + "\""; }).join(" and ");
    return "Your " + keys.map(function (k) { return "\"" + k + "\" has " + long[k]; }).join(" and ") + " characters without spaces, and this Studio's style length rule is 200 or fewer, never more than 400. " +
      "Shorten " + (keys.length > 1 ? "them" : "it") + " to the rule: the same music in fewer words, the most telling first (the language, the genre, the lead voice, the defining instruments, the tempo); drop words that repeat or only decorate, and keep at most two \"No ...\" sentences. " +
      "Answer with a JSON object holding only " + named + ", shortened, nothing else.";
  }
  function shortSchema(long) {                         // the same for a host that keeps a grammar (the Studio's own writer)
    var props = {};
    Object.keys(long).forEach(function (k) { props[k] = { type: "string" }; });
    return { type: "object", additionalProperties: false, required: Object.keys(long), properties: props };
  }
  // the second answer read as parse() reads a draft (fences off, a word or two around the object): the named fields it holds, or null
  function parseShort(text, long) {
    var raw = String(text || "").replace(/^```(?:json)?\s*|\s*```$/gi, "").trim(), a = raw.indexOf("{"), b = raw.lastIndexOf("}"), o = null, out = {}, any = false;
    if (a < 0 || b <= a) return null;
    try { o = JSON.parse(raw.slice(a, b + 1)); } catch (error) { return null; }
    if (!o || typeof o !== "object") return null;
    Object.keys(long).forEach(function (k) { if (typeof o[k] === "string") { out[FIELD[k]] = o[k]; any = true; } });
    return any ? out : null;
  }
  // the second answer's fields that came back shorter and not empty, over the first draft's; never a cut of the page's own. from and to: the longest
  // of the named fields before and after; still: one of them is past the limit even so; usable: the second answer read at all
  function takeShorter(first, second, long, realm) {
    var rd = (realm || WORLD.realm) === "reader", count = rd ? voiceCount : styleCount, max = rd ? VOICE_MAX : STYLE_MAX;
    var draft = { style: String(first.style || ""), styleTags: String(first.styleTags || "") }, from = 0, to = 0, took = false;
    Object.keys(long).forEach(function (k) {
      var f = FIELD[k], v = second && typeof second[f] === "string" ? second[f].trim() : "";
      if (v && count(v) < count(draft[f])) { draft[f] = v; took = true; }
      from = Math.max(from, long[k]);
      to = Math.max(to, count(draft[f]));
    });
    return { draft: draft, from: from, to: to, max: max, took: took, still: to > max, usable: !!second, voice: rd };
  }

  // HERESY 1167: what this Studio knows of its engine, for the Creator's idea writer too (its own prompt is the Kit's)
  // HERESY 1822 (Viktor 28.10.2026: «Для Писателя нужна наша FW шпаргалка»): the words the First Wave learned, by the part of the style line they fill
  var FW_WORDS = "The First Wave (the Studio's first fine-tune, the Tsunami Wave's base) was taught on 32633 tracks; these are the words their style lines were written in most. A style line goes: language (or Instrumental), genre, voice, instruments, mood, up to four emotion words, the key, tempo in BPM. Prefer these words; a word the model never met is a guess.\nLanguages: English, Spanish, Portuguese, French, russian, Italian, Japanese, German, Chinese, Korean, Turkish\nGenres: Electronic, pop, soundtrack, Folk, classical, rock, ambient, easy listening, jazz, Hip-Hop, Experimental, dance, Singer-Songwriter, chill out, indie, house, alternative, hip hop, funk, Experimental Pop, pop rock, lounge, pop folk, rap, Indie-Rock, Techno, instrumental pop, reggae, new age, blues, orchestral, Country, world, Downtempo, Ambient Electronic, IDM, Trip-Hop, cinematic, atmospheric, disco, relaxing, International, R&B, Electroacoustic, Americana\nVoice: female alto vocal, female voice, male voice, male tenor vocal, falsetto, mixed voice, breathy, vibrato, distant choir, clear diction, female singer, No singing, No sung chorus, a male rapper\nInstruments: piano, bass, drums, guitar, electric guitar, synthesizer, acoustic guitar, keyboard, violin, drum machine, strings, cello, saxophone, flute, classical guitar, electric piano, percussion, brass, bell, bongo, double bass, harp, orchestra, accordion, sampler, acoustic bass guitar, viola, trumpet, Celtic harp, ukulele, rhodes, harmonica, organ, clarinet, horn, pipe organ, oboe, psaltery, breathy flute, celesta\nMood: energetic, meditative, upbeat, dramatic, groovy, calm, catchy, funny, smooth, intimate, soulful, slow rubato, ethereal, jazzy, dreamy, hypnotic, intense, sexy\nEmotion words (up to four): playful, numb, low energy, menacing, restrained, harsh, bright, ecstatic, cold, aching, anguished, angry, bitter, grateful, soothing, euphoric, romantic, fragile, solemn, triumphant, hopeful, sensual, melancholic, commanding, warm, expressive, humorous, ominous, awe-struck, proud, tender, contemplative, yearning, dark, serene, soft, high energy, detached, vulnerable, yielding\nSound and space: Natural room, Wide, close-miked, deep reverb, dusty, reverb-heavy, long tape delay, immersive depth, vinyl haze, reverse swells, vinyl crackle dust texture\nPace: fast pace, slow pace, moderate pace, slow tempo\nUse: corporate, drama, documentary, motivational, action, commercial, movie, soundscape, sport, game\nKeys are written like «A minor» or «Eb major», tempo like «96 BPM».";
  // HERESY 2110 (Viktor 05.11.2026: «Словарь TW оформляй в паблик»): the Tsunami Wave's words first, the Studio's default model, then the First Wave's,
  // its base: heresy/MISC/claude-arc/fw-vocab/tw_words.py over the public docs/fw-vocabulary/tw-vocabulary.json, as fw_words.py made FW_WORDS
  var TW_WORDS = "The Tsunami Wave (RS-TW, the Studio's default model) was taught over the First Wave, its base, on 109250 tracks; these are the words their style lines were written in most. It keeps the First Wave's words through its base (they follow below); a word neither wave met is a guess. A style line goes: language (or Instrumental), genre, voice, instruments, mood, up to four emotion words, the key, tempo in BPM.\nLanguages: English, Russian, Hebrew, Greek, French, Spanish, Ukrainian, Portuguese, Italian, German, Chinese, Japanese, Korean, irish\nGenres: Electronic, pop, soundtrack, Experimental, ambient, rock, Folk, classical, Hip-Hop, easy listening, jazz, dance, Indie-Rock, chill out, Experimental Pop, Singer-Songwriter, Ambient Electronic, Downtempo, techno, alternative, hip hop, house, IDM, indie, orchestral, Lo-Fi, new age, lounge, blues, Avant-Garde, funk, pop rock, pop folk, Punk, rap, Glitch, world, Trip-Hop, International, cinematic, instrumental pop, Dubstep, Industrial, Country, atmospheric\nVoice: male voice, female voice, choir, Vocal, choral, female vocals, soprano, female, clear diction, female singer, No singing, No sung chorus, a male rapper, singer songwriter\nInstruments: piano, bass, drums, synthesizer, guitar, electric guitar, acoustic guitar, violin, percussion, keyboard, drum machine, strings, cello, electric piano, sampler, flute, accordion, classical guitar, brass, saxophone, Laouto, orchestra, bell, double bass, harp, ukulele, Klarino, trumpet, bongo, acoustic bass guitar, viola, horn, rhodes, clarinet, organ, harmonica, pad, Oud, pipe organ, Santouri\nMood: energetic, relaxing, epic, inspiring, meditative, fun, calm, uplifting, upbeat, positive, dramatic, cool, groovy, beautiful, funny, mellow, powerful, catchy, festive, sexy, nostalgic, peaceful\nEmotion words (up to four): playful, numb, restrained, menacing, cold, harsh, low energy, angry, aching, solemn, ecstatic, grateful, fragile, ominous, bright, awe-struck, bitter, euphoric, anguished, soothing, melancholic, sensual, romantic, contemplative, dark, proud, yearning, humorous, warm, triumphant, tender, hopeful, expressive, detached, commanding, soft, serene, vulnerable, high energy, yielding\nSound and space: Natural room, dusty\nPace: driving, solo\nUse: advertising, corporate, documentary, children, background, summer, adventure, commercial, drama, motivational";
  function fwWords() { return "\n\nTHE WORDS THE TSUNAMI WAVE LEARNED (the Studio's default model)\n" + TW_WORDS + "\n\nTHE WORDS THE FIRST WAVE LEARNED (its base)\n" + FW_WORDS; }
  function knowledge() { return HERESY_ADDENDUM + heard() + unheard() + adapters() + styles() + voices() + fwWords() + worn() + "\n\n" + STYLE_LAST; }   // HERESY 2350; 2840: the rule last
  window.HeresyAssist = { SONGWRITER: SONGWRITER, TASKS: TASKS, CHIPS: CHIPS, system: system, user: user, parse: parse, abcHeader: abcHeader,
                          setWorld: setWorld, reading: reading, tasks: tasks, chips: chips, lyricTasks: lyricTasks, templates: templates,   // HERESY 2497
                          templateRequest: templateRequest, schema: schema,
                          knowledge: knowledge,
                          STYLE_RULE: STYLE_RULE, STYLE_IDEAL: STYLE_IDEAL, STYLE_MAX: STYLE_MAX, STYLE_CAP: STYLE_CAP, VOICE_MAX: VOICE_MAX,   // HERESY 2840
                          styleCount: styleCount, voiceCount: voiceCount, tooLong: tooLong, shortenNote: shortenNote, shortSchema: shortSchema,
                          parseShort: parseShort, takeShorter: takeShorter };
})();
