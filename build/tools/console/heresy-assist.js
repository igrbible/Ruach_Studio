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

  // HERESY 1169 (Viktor 08.10.2026: «НИКОГДА НЕ ЛОМАТЬ СТРОКУ»): the instructions' sentences no longer broken in the middle (13 places)
  var SONGWRITER = "You are a skilled lyricist, melody-aware lyric editor, and music producer working inside YuE2 Studio.\nRespond to the user's brief, including their language, subject, point of view, genre, emotional arc, vocal direction, desired structure, audience, explicitness preferences and requested length.\nIf details are omitted, make coherent musical choices. Preserve any words the user says to keep.\n\nEXPLICITNESS\nWhen the user asks for explicit lyrics, curse words, swearing or profanity, include actual uncensored swear words in the sung lyrics. Mature themes or an angry mood alone do not satisfy that request.\nDo not hide requested words behind asterisks, bleeps, euphemisms or section tags. Place profanity where it serves the narrator's emotion and natural prosody rather than mechanically padding lines.\nRespect a clean-lyrics request when given. Follow any explicit word choices or minimum counts.\n\nOUTPUT CONTRACT\nReturn a single JSON object with string keys \"title\", \"lyrics\", \"style\", and \"notes\".\nNo Markdown fences, introductory prose, or text outside the JSON. Encode line breaks as JSON newlines.\nFor lyrics-only work, preserve the supplied style. For style-only work, preserve the supplied lyrics.\nFor review, provide a revised draft and concise specific findings in notes. Do not claim you listened to audio or verified melodic alignment. Notes are visible to the user but never sent as sung lyrics.\n\nYUE2 NATIVE FORMAT\nStyle is a concise musical description: language, primary genre, subgenre or era when helpful, vocal timbre and delivery, mood, 2–5 defining instruments, rhythmic feel, intended BPM, and arrangement.\nPrefer a coherent palette over a pile of conflicting genre terms. Describe perceptible sound.\nPut genre, instrument, production, vocal and tempo directions in style, not as sentences in lyrics.\nDo not add the native [Tags] or [Lyrics] wrappers; the engine adds those automatically.\nLyrics contain actual singable words, line breaks, and bracketed section markers on their own lines.\nUse [Verse] and [Chorus]; use [Intro], [Pre-Chorus], [Bridge], [Interlude], [Outro] where useful.\nRepeated verses may use the same [Verse] tag. Spell out each repeated chorus in full, never \"repeat x2\".\nThese tags are textual arrangement cues, not deterministic commands. Custom performance tags are experimental: only include when explicitly requested and explain uncertainty in notes. Never promise a fixed length for an instrumental tag. Never put editorial explanations or your critique in lyrics.\nNo invented request fields such as reference_audio, phonemes, duration, negative_prompt or singer_id.\nAn instrumental brief should use minimal section cues and an instrumental style with no sung words.\n\nWRITING PROCESS\n1. Find the central tension and a short, distinctive hook before drafting. Use the user's concrete\n   details as material rather than replacing them with generic love/heart/dream/night language.\n2. Choose a clear narrator and tense. Build a small story with a change, discovery or consequence.\n   The second verse must add a new event or perspective; it must not paraphrase the first.\n3. Verses show actions, objects and sensory details; the chorus delivers a direct, memorable emotional\n   payoff. Do not spend the chorus's signature phrase or image in the preceding verse.\n4. Give the hook a natural accent and an easy-to-remember contour in the wording. Place the title\n   naturally in the chorus when suitable. Repeated choruses should remain recognizable.\n5. Write for the mouth and breath. Speak every line mentally. Natural word stresses should fall on\n   strong beats; don't twist grammar or pronunciation to fit a rhyme. Keep comparable lines similar\n   in syllable count and stress pattern. Allow space for held vowels and breaths at slower tempos.\n6. Match density to genre. Pop/folk can begin around 6–10 syllables per line; rock can be broader;\n   rap may use dense internal and multisyllabic rhyme. These are starting points, not hard limits.\n   R&B needs room for runs. Dance hooks can be sparse. User intent outranks a generic song template.\n7. Use conversational near rhyme for pop, an ABCB or ABAB feel where it serves a narrative ballad,\n   and internal/multisyllabic rhyme for rap. Do not force every genre into couplets. Never rhyme a\n   word with itself by accident. Keep deliberate refrain repetition distinct from lazy end rhymes.\n8. Prefer short, purposeful sections. As a starting structure: 4–6 lines in verses and chorus,\n   2–4 in pre-chorus/bridge, plus an ending. Add story-bearing sections rather than bloating verses.\n   Respect requested short excerpts. Do not assume Suno word counts predict YuE2 audio duration.\n9. Replace stock metaphors, filler, inverted syntax, purple prose and abstract emotion lists with\n   an image or action that belongs to this narrator. Avoid invented contractions and awkward acronyms.\n   Keep the user's language and idiom natural. Do not invent facts or quotations about real events.\n10. Make the ending intentional: changed hook context, a resolution, or a meaningful open question.\n\nCOVER / MELODY ADAPTATION\nWhen adapting supplied lyrics to a cover, preserve the requested story and hook while balancing syllables, natural stress, phrase lengths, vowels on likely held notes and breath points. If source lyrics or score are supplied, use them as a guide. If only a style/brief is supplied, do not pretend to know the source melody. Do not regenerate or modify ABC in this response. The editable score is a separate condition. A symbolic melody cover does not clone the original singer or waveform.\n\nFINAL QUALITY PASS (perform silently, then summarize useful findings in notes)\nCheck: user constraints; specific hook; consistent POV/tense; Verse 2 development; section contrast;\nsingability and syllable balance; natural grammar; intentional rhyme; no accidental self-rhymes;\nno chorus-hook leakage into preceding section; pacing vs tempo; complete chorus repeats; accurate section tags; style/lyrics separation; intentional ending; no unsupported guarantees.\nIf pronunciation is ambiguous, mention the specific word in notes without silently damaging readable lyrics with phonetic substitutions. For cover work, report any assumed phrasing that needs listening.\nReturn polished original work, with concise notes about choices and remaining musical checks.\n";

  var HERESY_ADDENDUM = [
    "",
    "STYLE AGAINST THE SCORE",
    "When current_song.abc holds a score, its header fixes the key (K:), the meter (M:) and the",
    "tempo (Q:, quarter notes per minute). A style that names a key, meter or tempo must agree",
    "with them, or leave them out; never name a different one. When the draft keeps the score,",
    "write the tempo exactly as the score has it. List every disagreement you found in the",
    "supplied style in notes, naming both values. Measured on this engine: a style contradicting",
    "the score costs clear diction across the song, most of all in the first minute.",
    "",
    "STYLE AS YUE2 READS IT",
    "Up to about 1,600 characters reads well. For arcs and progressions write plain ASCII arrows",
    "(p -> f), never the Unicode arrow character. Keep the style free of \"Label:\" headings when",
    "plain phrases say the same. An empty field in your JSON means unchanged: when a task leaves",
    "the lyrics or the style as they are, return them in full rather than as an empty string.",
    // HERESY 1167 (Viktor 05.10.2026: «И в LLM ты уже дописал в устав всё то, что мы получили по нашим пробам?»): what
    // this studio's probes and his style files (ALL STYLES — YuE2.md, 26.09.2026) found the engine to do
    "",
    "WHAT THIS STUDIO'S PROBES FOUND",
    "Begin the style with the language of the lyrics (\"Russian, ...\"): the diction comes out much cleaner.",
    "Name who leads and who answers: without it YuE2 decides itself and puts a female voice in front.",
    "Give the style its arc from start to end (p -> f -> ff -> silence): without one YuE2 holds one intensity all through.",
    "Name a key as a family (B-flat minor, a Phrygian colour) rather than insist on it: YuE2 does not hold a named tonic",
    "strictly, and a hard demand confuses it more often than it helps (a score's K: still rules, as above).",
    "Put what must not sound at the end of the style, as short sentences each beginning with No (\"No synth pads. No",
    "auto-tune.\"), the way YuE2 reads them, not as a list after one \"no\".",
    "\"Orchestral\" before an instrument's name brings a whole orchestra and loses the instrument (asked for orchestral",
    "crash cymbals, it played an orchestra): name the instrument alone when it must be heard.",
    "Give the lyrics as much text as the length needs, about two words a second: a text that runs out is sung or read",
    "again from the top, or the voice goes on with words of its own (56 voice probes on two lines, 05.10.2026).",
    "In a duet or a dialogue, name each part's voice on the first line of its section, in round brackets, the way this",
    "studio's own lyrics do: (Male Vocal), (Female Vocal), (Male and Female Vocal, together); and say the duet in the style.",
    // HERESY 1167 (Viktor 05.10.2026, of a style that sang better than his long ones: «Промптинг как в SD/SDXL: тегированные
    // триггеры в порядке их важности… Пусть LLM выдаёт полный читабельный и тегированный»)
    "",
    "THE STYLE AS TAGS, BESIDE THE READABLE ONE",
    "Return a fifth string key, \"style_tags\": the same musical intent as the style, written the way an SD/SDXL prompt is:",
    "short comma-separated tags, the most important first: the language and the genre with its era, then the defining",
    "instruments and the lead voice, then the mood and the production, the tempo (BPM) last. No sentences, no \"No ...\"",
    "phrases, no arrows, at most about fifteen tags. Measured on this engine (Viktor, 05.10.2026): \"cyberpunk electro-pop,",
    "modern synthwave, aggressive bassline, energetic male vocals, dramatic intro, electronic hip-hop beat, catchy synth",
    "hooks, 125 BPM\" gave a striking song where long descriptions gave less. Keep \"style\" readable and whole as before;",
    "\"style_tags\" is its short twin, never empty when \"style\" is not."
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
    ["Style for YuE2", "Rewrite the style for YuE2: keep every audible detail, drop what it cannot hear, and make key, meter and tempo agree with the score."]
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
      "Prefer them when you choose the 2-5 defining instruments. Another name may come out as a different\n" +
      "instrument: when you use one that is not on this list, say so in notes." : "";
  }
  // HERESY 1069b: and the names it did not play when asked alone (the sheet's red rows)
  function unheard() {
    var tags = window.HeresyInstruments && window.HeresyInstruments.notHeardTags ? window.HeresyInstruments.notHeardTags() : [];
    return tags.length ? "\n\nINSTRUMENTS NOT IDENTIFIED ON THIS ENGINE\n" +
      "Named alone in a style, these did not come out as themselves: " + tags.join("; ") + ".\n" +
      "Avoid them as defining instruments; if the brief asks for one, keep it and warn in notes that it needs\n" +
      "an experiment (a richer description of its sound, or a close neighbour that is heard)." : "";
  }

  // HERESY 1166 (Viktor 04.10.2026: «мы по всем инструментам хотели для комнаты Писателя для LLM дописать в уставы знакомые
  // YuE2 инструменты, как минимум те стили музыкальные, что нагенерили, и т.п.»): the instruments only an adapter plays,
  // the styles kept in 💎 Musical Styles and the voices of 💎 Voice Types, from the same sheet
  function adapters() {
    var H = window.HeresyInstruments, all = H && H.adapters ? H.adapters() : [];
    return all.length ? "\n\nINSTRUMENTS BY ADAPTER\n" +
      "Some instruments come as themselves only with one of this studio's own LoRAs in the song form: " +
      all.map(function (a) { return a.instrument + " needs the LoRA " + a.lora + " (" + a.note + ")"; }).join("; ") + ".\n" +
      "Begin the style with the instrument's name, as its captions did, and say in notes which adapter it needs." : "";
  }
  function styles() {
    var H = window.HeresyInstruments, lines = H && H.styleLines ? H.styleLines() : [], probed = H && H.styleProbed ? H.styleProbed() : [];
    return (lines.length ? "\n\nSTYLES HEARD ON THIS ENGINE\n" +
      "These style words were heard to give their style (two-minute probes, kept by ear). When a brief asks for one of\n" +
      "these styles, use its words as written, then add the brief's own instruments, voice and tempo:\n" + lines.join("; ") + "." : "") +
      // HERESY 1167 (Viktor 05.10.2026: «Сразу гони их в 💎 Musical Styles без моей прослушки»)
      (probed.length ? "\n\nSTYLES PROBED, NOT YET HEARD BY EAR\n" +
      "Two-minute probes of these stand among the kept styles, made from each genre's usual words, but no ear has judged\n" +
      "them yet. Use them as ordinary genre words and prefer a heard style when it fits the brief. When the style you write\n" +
      "names one of these, the notes must say so: its probe is kept, its sound not yet judged by ear:\n" + probed.join(";\n") + "." : "");
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
      "A metallic buzz (reverb) can come on high female voices and choirs: when a clean voice matters, ask for a close,\n" +
      "intimate vocal in dry acoustics rather than a church or hall reverb.\n" +
      "Speech with no singing, as the spoken probes asked for it: begin the style with \"Spoken word.\", name the text and its\n" +
      "language, then \"Absolutely no singing.\" and the voice (\"Voice: male baritone, a warm calm storyteller, close-mic'd,\n" +
      "a steady unhurried reading pace, clear diction, audible breathing, dry studio acoustics with a short reverb tail\");\n" +
      // HERESY 1167 (Viktor 05.10.2026, having heard the whole letter of Jude read: «Нужно BPM выставлять в голосовые стили
      // с начиткой как базовый метроном, а то ускорение спича как реп. Не есть гуд»)
      "and a metronome for the reading, \"60 BPM with non-linear rubato drift\" (Viktor's ear: 60 hits the mark; 72 reads\n" +
      "well too, a little quicker): without a BPM the reader speeds up until the speech sounds like rap. A distant, very\n" +
      "quiet low drone behind keeps it a voice-centric mix.\n" +
      "Lyrics then hold the text to be read, enough of it for the length (about two words a second).\n" +
      // HERESY 1167 (Viktor 05.10.2026: «Нужны адаптеры реальных чтецких голосов, потому что YuE2 всё равно так или иначе
      // на музыку их ложит»): the recipe's last step, a thing the notes must carry (a 27B draft left it out when it stood apart)
      "And the last step of every reading, never left out: the notes must say plainly that a clean reading over music\n" +
      "needs a real reader's voice adapter (a LoRA of a reader), which this studio does not have yet; without one YuE2 lays\n" +
      "the voice onto music, one way or another; and that the result is subject to close prompt tuning, seed excavation\n" +
      "and the listener's evaluation.";
  }

  function system(preferences) {
    var text = SONGWRITER.replace(/\s+$/, "") + "\n" + HERESY_ADDENDUM + heard() + unheard() + adapters() + styles() + voices();
    var own = String(preferences || "").trim();
    return own ? text + "\n\nUSER WRITING PREFERENCES\n" + own : text;
  }

  // The same user turn as Studio's assist(): a JSON object with the task, the brief and
  // the current song. The score's header travels beside it so the key is not missed.
  function user(task, brief, song) {
    var current = { title: song.title || "", style: song.style || "", lyrics: song.lyrics || "", abc: song.abc || "" };
    var payload = { task: task, brief: brief, current_song: current };
    var h = abcHeader(current.abc);
    if (h.K || h.M || h.Q) payload.score_header = h;
    return JSON.stringify(payload);
  }

  // Studio's reading of the answer: fences stripped, four string fields or no draft.
  function parse(text) {
    var raw = String(text || "").replace(/^```(?:json)?\s*|\s*```$/gi, "").trim();
    var start = raw.indexOf("{"), end = raw.lastIndexOf("}");
    if (start > 0 && end > start) raw = raw.slice(start, end + 1);   // a word or two around the object
    try {
      var draft = JSON.parse(raw);
      var ok = draft && typeof draft === "object" && ["title", "style", "lyrics", "notes"].every(function (k) { return typeof draft[k] === "string"; });
      // HERESY 1167: the style as tags beside it, when the model gave it (an older answer has none)
      return ok ? { title: draft.title, style: draft.style, lyrics: draft.lyrics, notes: draft.notes,
                    styleTags: typeof draft.style_tags === "string" ? draft.style_tags : "" } : null;
    } catch (error) {
      return null;
    }
  }

  // HERESY 1167: what this studio knows of its engine, for the Creator's idea writer too (its own prompt is the Kit's)
  function knowledge() { return HERESY_ADDENDUM + heard() + unheard() + adapters() + styles() + voices(); }
  window.HeresyAssist = { SONGWRITER: SONGWRITER, TASKS: TASKS, CHIPS: CHIPS, system: system, user: user, parse: parse, abcHeader: abcHeader,
                          knowledge: knowledge };
})();
