/* Help for every setting: an (i) beside each control's label shows what the
   setting does, its default, and when to change it. The same file ships in
   both consoles; an entry whose control a page lacks is simply unused.

   window.YueHelp:
     decorate()   add the (i) marks (safe to call again, e.g. after the sampler knobs are rebuilt)
     missing()    ids of form and engine controls that have no help, for the page tests
   It also makes the style box grow with its text and counts the prompt against the model's
   context under it (#styleMeter). */
(function (root) {
  "use strict";

  // HERESY 1166: the meter's sentences translated whole where they are made, and made again in a new language
  function tr(s) { return root.RuachI18n ? root.RuachI18n.t(s) : s; }
  function loc() { return root.RuachI18n ? root.RuachI18n.locales() : undefined; }   // HERESY 1166: the page's numbers
  root.addEventListener("ruach-lang", function () { paintMeter(); });

  var ODE = "How many steps the sound solver takes to turn the music tokens into audio (flow matching, midpoint method). " +
    "32 is the release setting; 160 is the ceiling.\n" +
    "Each step runs the sound model twice over the whole song, so 64 steps make this stage take twice as long as 32; " +
    "the music itself (melody, words, length) is already fixed by then and does not change.\n" +
    "Fewer steps (8–16) are quicker drafts. Whether 64 sounds better than 32 has not been published: " +
    "to hear it, re-render one take's sound at both settings.";

  var HELP = {
    // ------------------------------------------------------------ the form
    title: "Names the take in the library and every file it downloads as (date-time-title). " +
      "It is not sent to the model and does not change the song.",
    seed: "One number that fixes the random draws of the score and the music: the same seed, prompt and settings give the same song. " +
      "Blank means random: every run picks a new one. The dice puts a random seed in the box to keep or edit; press it again to clear the box. " +
      "Every take keeps its seed, so a good one can be reused with a small change to the prompt (Retake).",
    soundSeed: "Fixes only the acoustic noise of the sound stage: the same music (melody, words, timing) played through a different grain. " +
      "Blank means random each run; the dice puts one in, and pressing it again clears it. Change it, or use Re-render sound on a take, " +
      "to get another rendering in seconds.",
    style: "What the song should sound like, as short comma-separated phrases: language, genre, singer (e.g. female alto, raspy male), " +
      "instruments, mood, tempo (e.g. 92 BPM). Both the score planner and the music read it; it goes in as the prompt's tag list, verbatim.\n" +
      "✓ Agreement with the score first (HERESY 1012, measured 30.09.2026): the same style with key, meter and tempo set to the score " +
      "sang clearer (0.74 against 0.60 on lyric recognition), most of all in the first minute. Tempo, meter and key live in the score.\n" +
      "✓ Length: up to about 1,600 characters reads well; a long style that agreed with the score did as well as a 292-character one. " +
      "The 110 official examples run 4 to 999 characters, median 124.\n" +
      "⚠ Plain ASCII arrows (->) read cleanly; the Unicode arrow (→) is a rare token, write -> instead. " +
      "Dynamics marks (p, f, ff) and \"Label:\" fields are in none of the official styles; the counter under the box flags them.\n" +
      "Size: no fixed limit in the engine. Style and lyrics share the 24,576-token window with the score and the song; the counter keeps count.",
    lyrics: "The words, with section tags such as [Verse], [Pre-Chorus], [Chorus], [Bridge], [Outro] on their own lines. " +
      "The sections set the song's form, and together with the words its length: more sections, a longer song. " +
      "Leave a blank line between sections. Lyrics count against the same budget as the style (see the counter under the style box).\n" +
      "Lines in (brackets) are part of the training form: 29 of the 110 official examples have them, as instrument cues " +
      "(saxophone), (brass), (male), backing echoes (I'm so good) or section names. Their notes hold no \"Label:\", arrows or p/f marks.",
    modes: "Full plan: the model first writes a score (melody and chords) and the song follows it. Best for new songs; the score can be edited.\n" +
      "Melody only: the score has the melody but no chords, so the accompaniment is free. Recommended for covers.\n" +
      "Direct: no score; the music is written straight from style and lyrics. Some add-ons (the sliders, some LoRAs) were trained this way.\n" +
      "A supplied score needs Full or Melody.",
    abc: "A score in YuE2's own notation: two voices, Vocal and Ins (instrument), in bars of 1/32 notes, with chord symbols on the Vocal line " +
      "and section comments (% verse). In Full or Melody mode the song follows it in time and pitch.\n" +
      "Plan score only writes one here to check or edit; a transcription or an older take can fill it too. " +
      "For a cover, use Melody only with a score that has no chord symbols.",
    versions: "Renders this prompt several times, each extra version with a fresh seed. " +
      "Picking the best of several is the most reliable way to a better song: the model card's own benchmark compared best-of-2 and best-of-8 picks.",
    // HERESY 1167: Viktor's own measure (05.10.2026, Direct mode, FOSFORIDA), the field kept within 1–4
    cfg: "Classifier-free guidance, for the music stage only (the score planner never uses it). " +
      "Default 1.6 in every mode: Viktor's stable set (01.10.2026). The release had 1.0 in Full and Melody mode and 1.01 in Direct.\n" +
      "Above 1 the music follows the style prompt more strongly; in Full and Melody mode the score is kept either way. " +
      "Any value other than 1.0 runs two passes per step: half the speed and twice the memory for the music stage. " +
      "1.0 switches guidance off: one pass, the release's sound.\n" +
      "✓ 1.4–1.6: the verified stable range. 2.0: dynamic, closer to SUNO. Up to 2.4 it still holds.\n" +
      "⚠ From 2.6 the music gets cut short and the lyrics suffer (the same illness as SUNO's): the higher the guidance, the clearer " +
      "the instruments come in and the more the words pay for it; how soon depends on how complex the style and the lyrics are " +
      "(Viktor's test in Direct mode, 05.10.2026). The field takes 1.0–4.0; the engine itself sets no ceiling. The memory is the " +
      "cache: guidance keeps a second, unconditioned pass beside every version, 2.8 GB more each at the full context.",
    shapeComposition: "Moves the score planner's temperature, top-p and top-k together. Left: familiar, safe melodies and chord changes; " +
      "right: surprising ones. The middle is the default (0.95 · 0.95 · 50); \"lowest\" is the release (0.7 · 0.9 · 30). No effect in Direct mode or with a supplied score (nothing is planned).\n" +
      "⚠ \"highest\" (1.15 · 0.97 · 80) can break bars.",
    shapePerformance: "Moves the music stage's temperature, top-p and top-k together. Left: a steadier delivery that sticks to the prompt; " +
      "right: looser and more adventurous, with more garbled words. The middle is the default (0.9 · 0.95 · 100); \"high\" is the release (1.0 · 0.95 · 100).\n" +
      "✓ \"low\" (0.85 · 0.93 · 80) for songs where the words matter most.\n" +
      "⚠ \"highest\" (1.1 · 0.97 · 140): measured glossolalia on a 7-minute song.",
    shapeStyle: "Sets Guidance (CFG): 1.2 · 1.4 · 1.6 (the middle, the default) · 1.8 · 2.0. Higher follows the style prompt " +
      "more strongly. 1.4–1.6 is the verified stable range; 2.0 is dynamic, closer to SUNO. Every position runs the music stage's " +
      "two passes (half the speed, twice the memory).\n⚠ Past 2.0 only by hand in Guidance: up to 2.4 it holds, from 2.6 the music " +
      "gets cut short and the lyrics suffer.",
    odeSteps: ODE,
    odeSolver: "How the sound stage walks from noise to audio (HERESY 1004). Measured on one song against a 160-step " +
      "reference, error at the same cost of 64 network calls: Midpoint 32 steps 3.8e-3 (the release), Multistep 64 steps " +
      "3.5e-3, Heun 32 steps 6.5e-3, Euler 64 steps 3.0e-2.\n" +
      "Midpoint: two network calls a step, second order — the release, and a strong default.\n" +
      "Multistep: one call a step, second order (Adams-Bashforth 2, the idea behind DPM++ 2M): the same accuracy per call, " +
      "and any step count, not only doubled ones.\n" +
      "Heun: two calls, second order; less accurate than Midpoint at 32–64 steps, catches up only at many steps.\n" +
      "Euler: one call, first order — ten times rougher at the same cost; for quick drafts.\n" +
      "Lower error means closer to what the model meant, not necessarily a sound you prefer: listen.",
    // HERESY 1167 (Viktor: «STRUCTURE и TEMPERATURE имеют inline подсказки. Это тоже в тултипы»): the Writer's hints as (i)
    orModel: "Any model of openrouter.ai/models, written provider/model. The field offers the list as you type; the quick picks fill it in.",
    assistStructure: "The section order the model gives new lyrics. «Keep mine» leaves the lyrics' own order.",
    draftStyleTags: "The draft's style as tags, the most important first, as an SD/SDXL prompt is written. «Into the form» chooses " +
      "which of the two, the tags or the readable style, the draft puts in the Style field.",
    assistBriefLib: "Your saved briefs, kept by the lab (every browser sees them): picking one puts it in the box above.",
    assistTemp: "How free the drafts are: lower keeps close to the brief and repeats itself more, higher invents more and wanders. " +
      "Blank: the server's or the model's own default.",
    maxLength: "A ceiling on the song's length in seconds (480 by default; 0:10–16:00): the music stage stops at 25 tokens per second " +
      "of this (Sampling shows it as the music's Max length). " +
      "The length itself comes from the lyrics and the score; this only cuts a runaway song short (it is then marked truncated).",
    variations: "Renders the same music up to 9 times with different sound seeds (seed, seed + 1, …) in one pass. " +
      "The music is written once, so this is a cheap way to pick the best-sounding render of a song you like.",
    outFormat: "WAV 24-bit: full quality; download it as FLAC or MP3 later from the song page.\n" +
      "WAV 16-bit: CD quality, smaller. WAV 32-bit float: the raw output, not normalised, can exceed full scale.\n" +
      "MP3: small, lossy; nothing better can be made from it later.",
    mp3Bitrate: "Bitrate when the song itself is made as MP3 (Format: MP3). 320 is near transparent; the server's own default is 128. " +
      "To share a WAV song as MP3, use the MP3 download on its page instead.",
    peakClip: "Loudness. The song is normalised so its loudest part reaches full scale after ignoring this many samples per million " +
      "(default 10: the top 0.001% are clipped, which also lifts quiet songs). 0 normalises to the true peak: no clipping, a little quieter. " +
      "WAV 32-bit float is not normalised.",
    instrumental: null,   // has its own (i)
    lookTheme: "The page's colours. The same choice as the swatches behind the theme button in the top bar; this browser keeps it.",
    lookCorners: "How round the corners of buttons, fields and cards are: Rounded (the default), Softer or Square.",
    lookHover: "Hover highlights take the theme's accent colour instead of a neutral grey (the DMM theme does this on its own).",
    lookGlow: "A faint ring and glow in the theme's accent around cards, drawers and panels.",
    lookMotion: "Turns the page's animations and fades off (spinners, sliding bars, tips fading in), whatever the system setting.",
    fontSans: "The font for labels, fields and paragraphs. The app's own fonts come first; under the line, fonts installed on this computer. " +
      "Each browser keeps its own choice.",
    fontHeading: "The font for headings: Compose, Takes, the song's title, the cards. Medium weight.",
    fontMono: "The font for numbers and code: seeds, the score, the server log. A fixed-width font keeps columns straight.",
    coverFile: "A recording to take the melody from (WAV, FLAC, MP3, M4A, OGG). Only the tune is transcribed: " +
      "not the words and not the singer's voice.",
    coverTask: "Lead melody: the most prominent line, voice or instrument, without chords (use Melody mode).\n" +
      "Vocal melody only: just the sung line.\n" +
      "Melody and chords: melody plus chord symbols (use Full mode).",
    coverTake: "One of your own takes whose score becomes the melody of a new song; the style and lyrics can change completely.",
    coverMelodyOnly: "Removes the chord symbols so the new style can build its own harmony (the run then uses Melody only). " +
      "Untick to keep the original chords and render in Full mode.",
    idea: "One line about the song you want (a story, a mood, a genre). The writer model drafts the title, style prompt and lyrics from it, " +
      "into the form below, where you can edit them before generating.",
    museModel: "The language model that drafts the brief (title, style and lyrics). Any instruction-following model works; " +
      "a bigger one writes better lyrics, a smaller one answers faster.",
    structure: "The shape of the lyrics the writer drafts: which sections (verse, chorus, bridge, pre-chorus, intro, outro) and in what order.",
    autoRun: "After the writer drafts the brief, start generating the song straight away with it.",
    museFree: "Unloads YuE2 from the GPU before the writer runs, so both fit on one card; YuE2 loads again for the song (a slower start).",
    // ------------------------------------------------------------ engine (PyTorch console)
    setModel: "The YuE2 model to load: a Hugging Face id such as m-a-p/YuE2-3B, or a local folder. A change loads with the next song.",
    setVae: "The VAE a song is decoded with when its request names none (saved prompts, other clients). " +
      "The VAE buttons in the form choose per song, and a finished song can get another from its page.",
    setOffline: "Use only files already on disk: nothing is checked or fetched online. " +
      "Turn it on once everything is downloaded to start faster and work without internet.",
    setDevice: "Where the model runs. Blank or auto: the GPU when there is one. cuda:1: the second GPU. cpu: no GPU (very slow).",
    setBackend: "torch: the normal path, with CUDA graphs for fast music writing.\n" +
      "torch-eager: the plain reference path, slower; for checking a problem.\n" +
      "vllm: the language half runs in a separate vllm process (needs the fast extra), one song at a time, " +
      "and the GPU is freed for the sound stage.",
    setQuant: "none: the release BF16 weights.\n" +
      "fp8: the language model's linear layers in 8 bits, about half their memory. Needs an RTX 40-series card or newer, " +
      "and turns off CUDA graphs, so music writing is much slower (about 6.5× in one user's measurement). Not allowed with FP32.",
    memPreset: "Fills VRAM budget and offload for a card of that size; press Save to apply. Auto reads this GPU's memory. " +
      "Whole card: no cap.",
    setBudget: "A hard cap on the GPU memory this app may use, in GB, with 2 GB of it kept in reserve. Blank or 0: the whole card.\n" +
      "At 12 or less the VAE also decodes in smaller tiles (512 frames instead of 1024: less memory, the same sound). " +
      "The model card measured an 11.2 GB peak on a 3.6-minute song and 14.1 GB at the longest context.",
    setOde: ODE,
    setOffload: "Moves the language model's layers to system RAM while the sound stage runs, and back afterwards: " +
      "a lower GPU memory peak for a few seconds more per song. Useful on 12–16 GB cards.",
    setWriterBackend: "Which program runs the writer model. Automatic: the chat server if an address is set, " +
      "else llama.cpp if it is installed here with a model, else Ollama.",
    setLlamaModel: "The GGUF model llama.cpp loads to write briefs. It runs only while a brief is written, then leaves the GPU.",
    writerDir: "Another folder to search for .gguf writer models; its models join the list above.",
    setChatUrl: "The /v1 address of a chat server that is already running. The page uses whatever model it has loaded; " +
      "it never loads, switches or unloads a model there.",
    setOllama: "Where Ollama listens (normally port 11434).",
    setMuseModel: "The Ollama model that writes briefs.",
    setMuseFree: "Unloads YuE2 from the GPU before the writer starts, so both fit on one card. YuE2 loads again for the next song.",
    setArtModel: "The image checkpoint that draws a cover from the song's title and style.",
    setArtAuto: "Draw a cover after every finished song, without asking.",
    artDir: "Another folder to search for image checkpoints.",
    setTxDevice: "Where the transcriber runs. GPU: seconds. CPU: leaves the GPU alone and takes about as long as the song.",
    setTxDtype: "The transcriber's number format. bf16: the normal GPU setting. fp32: full precision, slower and twice the memory.",
    // ------------------------------------------------------------ engine (C++ console)
    setMaxSeq: null,      // has its own (i)
    setVaeCore: "The VAE decodes the song in tiles of this many frames (512 by default). Smaller tiles need less GPU memory " +
      "at about the same speed, and give the same audio.",
    setKeepLoaded: null,  // has its own (i)
    chatUrl: "The /v1 address of a chat server that is already running, for the idea writer. The page uses whatever model it has loaded; " +
      "it never loads, switches or unloads a model there.",
    logFollow: "Keep the log scrolled to the newest line."
  };
  HELP.memPresetCpp = "Fills model, context rows, keep loaded and VAE tiles for a card of that size; press Save to apply. " +
    "Auto reads this GPU's memory.";

  // The sampler knobs, per stage: the score planner (abc) and the music tokens (semantic).
  // HERESY 1005: every knob says what it does, what to try (✓) and what goes wrong (⚠).
  // Where a range comes from a measurement or a published config, the tip says so.
  var KNOBS = {
    abc: {
      temperature: "Randomness of the score planner. Default 0.95 (Viktor's stable set; the release had 0.7).\n" +
        "✓ 0.9–1.0 for melodies that do not sound stock; 0.6–0.8 for a song with a rigid structure.\n" +
        "⚠ Above 1.0 bars break and sections go missing, and a broken score cannot be used. " +
        "0 is greedy: the same phrase over and over.",
      top_p: "Keeps only the most likely next notes, up to this share of the total chance. Default 0.95 (the release had 0.9).\n" +
        "✓ 0.9–0.95.\n" +
        "⚠ Below 0.7 the melody turns monotone. 1.0 switches it off and lets rare, broken tokens through.",
      top_k: "Keeps only this many of the most likely next notes. Default 50 (the release had 30).\n" +
        "✓ 30–64.\n" +
        "⚠ Above about 80, odd durations and broken bars come through. Below 10 it is nearly greedy; 1 is greedy.",
      repetition_penalty: "Makes notes used in the recent window less likely. Default 1.005, almost off.\n" +
        "✓ Leave it at 1.0–1.01.\n" +
        "⚠ A score repeats by nature: choruses, bar patterns. Above 1.05 the penalty breaks the repeats the song needs, " +
        "and the choruses stop matching each other.",
      penalty_window: "How many recent tokens the repetition penalty looks back over. Default 100.\n" +
        "✓ Leave it.\n" +
        "⚠ It does nothing while the penalty is at 1.0.",
      min_tokens: "The score cannot end before this many tokens. Default 200.\n" +
        "✓ Leave it.",
      max_tokens: "The longest score, in tokens. Default 6144.\n" +
        "✓ 6144 holds a long song (4096 cut long scores short).\n" +
        "⚠ The score and the music share ONE context of 24,576 tokens: every token given to the score is taken from the music. " +
        "8192 leaves the song too little room. A score cut off here cannot be used."
    },
    semantic: {
      temperature: "Randomness of the music: how the words are sung. Default 0.9 (Viktor's stable set; the release had 1.0).\n" +
        "✓ 0.85–0.95 for clear words. The cover configs on r/StableDiffusion keep it at 0.80–0.95.\n" +
        "⚠ Above 1.0 the words blur into glossolalia, most of all after the fourth minute " +
        "(measured on a 7-minute song: 1.1 lost 16 of 109 lines). Below 0.8 the delivery flattens and starts to loop. 0 is greedy and loops.",
      top_p: "Keeps only the most likely next music tokens, up to this share of the total chance. Default 0.95.\n" +
        "✓ 0.9–0.95.\n" +
        "⚠ 0.97 and up, together with a high temperature, is the glossolalia recipe: the \"high\" Performance card " +
        "(1.1 · 0.97 · 140) garbled words on the same measured song.",
      top_k: "Keeps only this many of the most likely next music tokens. Default 100.\n" +
        "✓ 50–100.\n" +
        "⚠ Above about 150 rare tokens come through as garbled syllables; 200 is the \"highest\" Performance card.",
      repetition_penalty: "Makes music tokens used in the recent window less likely. Default 1.3 with the window at 100 " +
        "(Viktor's stable set; the release had 1.2 over 50).\n" +
        "✓ 1.2–1.3. The music needs about this much to stay out of loops.\n" +
        "⚠ Below 1.1 a line gets sung again and again. Above 1.3 the delivery turns restless and syllables drop out.",
      penalty_window: "How many recent music tokens the repetition penalty looks back over. " +
        "25 tokens are one second: the default 100 is 4 seconds, which is also the ceiling (the release had 50, 2 seconds).\n" +
        "✓ 100: it also catches loops longer than a short phrase.\n" +
        "⚠ It prevents loops; it does not cure words breaking down in the middle of a song. For that, lower the temperature.",
      min_tokens: "The song cannot end before this, set in time: 25 music tokens a second, the default 0:30 is 750 tokens.\n" +
        "✓ Leave it.",
      max_tokens: "The longest song: it follows Max length in Sound and output, 25 music tokens a second (8:00 is 12,000).\n" +
        "✓ Set Max length close to the length the lyrics need.\n" +
        "⚠ Much more room than the lyrics need, and after the last line the model goes back and sings earlier lines again " +
        "(measured: 24 such returns after the lyrics ended). A song cut off here is marked truncated."
    }
  };

  function makeInfo(text, name) {
    var info = document.createElement("span");
    info.className = "info";
    info.tabIndex = -1;   // HERESY 1016: TAB goes from field to field, not to the (i) marks
    info.setAttribute("role", "img");
    info.setAttribute("aria-label", "About " + name);
    info.dataset.tip = text;
    info.dataset.help = "1";
    return info;
  }

  // Where the (i) goes: into the control's label text, before its grey hint.
  function place(el, text, name) {
    var host = el.closest("label.knob") ? el.closest("label.knob").querySelector("span") :
      el.closest("label.shape-row") ? el.closest("label.shape-row").querySelector(".shape-name") :
      el.closest("label.check") ? el.closest("label.check") :
      el.closest("label.versions") ? el.closest("label.versions").querySelector("span") :
      el.closest(".field") ? el.closest(".field").querySelector(".label") : null;
    if (el.id === "modes") host = el.closest("fieldset").querySelector(".label");
    if (host && host.querySelector(".info")) return;      // it already has one
    var info = makeInfo(text, name);
    // HERESY 1168 (Viktor: «везде, где есть (i), и если там после идёт микро подсказка, либо убирай её, либо в тултип»): the
    // label's short note (its data-head, English as written) is the tip's first line; the language follows it there
    if (host && host.dataset && host.dataset.head) info.dataset.tipHead = host.dataset.head;
    if (!host) {
      if (el.nextElementSibling && el.nextElementSibling.classList.contains("info")) return;
      el.insertAdjacentElement("afterend", info);
      return;
    }
    if (el.closest("label.check")) {
      var span = host.querySelector("span");
      if (span) span.insertAdjacentElement("afterend", info); else host.appendChild(info);
      return;
    }
    var hint = host.querySelector("em");
    if (hint && hint.parentNode === host) host.insertBefore(info, hint); else host.appendChild(info);
  }

  function labelName(el) {
    var field = el.closest(".field, label");
    var label = field && field.querySelector(".label, span, .shape-name");
    return ((label && label.firstChild && label.firstChild.textContent) || el.id).trim() || el.id;
  }

  function decorate() {
    Object.keys(HELP).forEach(function (id) {
      var el = document.getElementById(id);
      if (!el || !HELP[id]) return;
      var text = HELP[id];
      if (id === "memPreset" && document.getElementById("setMaxSeq")) text = HELP.memPresetCpp;
      place(el, text, labelName(el));
    });
    Array.prototype.forEach.call(document.querySelectorAll(".knobs[data-group] input[data-key]"), function (input) {
      var group = KNOBS[input.dataset.group] || {}, text = group[input.dataset.key];
      if (text) place(input, text, input.dataset.key.replace(/_/g, " "));
    });
  }

  function hasHelp(el) {
    if (el.dataset.tip || el.dataset.tipRef) return true;
    if (el.closest("label[data-tip]")) return true;           // HERESY 1145: a tip on the control's own label (a file button's)
    var scope = el.closest("label.knob, label.shape-row, label.check, label.versions, .field, fieldset") || el.parentNode;
    if (scope && scope.querySelector(".info")) return true;
    if (el.nextElementSibling && el.nextElementSibling.classList.contains("info")) return true;
    var row = el.closest(".check-row");
    return !!(row && row.querySelector(".info"));
  }

  // HERESY 1148: the controls of the studio's own rooms whose label or placeholder already says all (a title, a search, a
  // sort, a note, a file): no tip for them; every other control of the page has a tip or an (i), and the page test holds it
  var SELF_EVIDENT = {
    wrSearch: 1, wrTitle: 1, wrStyle: 1, wrLyrics: 1, wrNotes: 1, assistBrief: 1, assistTask: 1, assistStructure: 1, assistPrefs: 1,
    orRemember: 1, draftTitle: 1, draftStyle: 1, draftLyrics: 1, tpEdPick: 1, tpEdName: 1, tpTestIn: 1,
    impFile: 1, impTitle: 1, impLyrics: 1, upMode: 1,
    trTrigger: 1, trStyle: 1, trSearch: 1,
    collSearch: 1, collSort: 1, collTrashDays: 1, collWsPick: 1, collWsMove: 1
  };
  function missing() {
    var skip = { themePick: 1, volume: 1, openFile: 1, wrImportFile: 1 };   // HERESY 1168: the Writer's backup file, as Open's
    return Array.prototype.filter.call(document.querySelectorAll("input[id], select[id], textarea[id]"), function (el) {
      return !skip[el.id] && !SELF_EVIDENT[el.id] && el.type !== "radio" && el.type !== "hidden" && !hasHelp(el);
    }).map(function (el) { return el.id; });
  }

  // ------------------------------------------------------------ prompt size
  // What fits: 24,576 context tokens minus the longest score and song and the instruction and
  // markers; the rest is shared by style and lyrics.
  // HERESY 1001: read from the live knobs, not from constants. The old line was
  // 24576 - 4096 - 9000 - 80 while the engine defaults moved on, so the meter promised
  // style and lyrics nearly twice the room they had, and warned too late. The song budget
  // is also capped by the requested length (25 tokens a second), exactly as the engine caps it.
  function knobTokens(group, fallback) {
    var el = document.querySelector('input[data-group="' + group + '"][data-key="max_tokens"]');
    var v = el ? parseInt(el.value, 10) : NaN;
    return isFinite(v) && v > 0 ? v : fallback;
  }
  // HERESY 1167 (Viktor: «По токенам музыкальным красное», Speech · up to 15:00): Direct writes no score, so the score's
  // budget takes nothing from the window there (the engine cuts the music to what fits beside the style and the text)
  function isDirect() { var c = document.querySelector('input[name="cot"]:checked'); return !!c && c.value === "off"; }
  function songTokens() {
    var song = knobTokens("semantic", 12000), len = document.getElementById("maxLength");
    var secs = len ? parseFloat(len.value) : NaN;
    if (isFinite(secs) && secs > 0) song = Math.min(song, Math.round(secs * 25));
    return song;
  }
  function promptBudget() {
    return 24576 - (isDirect() ? 0 : knobTokens("abc", 6144)) - songTokens() - 80;
  }
  function mmss(s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ":" + ("0" + s % 60).slice(-2); }

  // An estimate without the tokenizer: English runs about 3.6 characters a token.
  // HERESY 1167: the other scripts measured with YuE2's own BPE on the studio's texts (06.10.2026); the old «~1 a
  // character» made Russian 1.7–2.1 times too long, Ukrainian and Belarusian 1.5–1.6, Hebrew 2.1:
  // · Cyrillic: 0.5 tokens a letter (lyrics run dearer than prose), 0.6 when Ukrainian or Belarusian letters show;
  // · Greek: 1;
  // · Hebrew: 0.45;
  // · anything else (accents, marks, other scripts): 1, as before.
  var UKBE = /[іїєґўІЇЄҐЎ]/;
  function estimateTokens(text) {
    var ascii = 0, cyr = 0, greek = 0, hebrew = 0, other = 0;
    for (var i = 0; i < text.length; i++) {
      var c = text.charCodeAt(i);
      if (c < 128) ascii++;
      else if (c >= 0x400 && c <= 0x4ff) cyr++;
      else if ((c >= 0x370 && c <= 0x3ff) || (c >= 0x1f00 && c <= 0x1fff)) greek++;
      else if (c >= 0x590 && c <= 0x5ff) hebrew++;
      else other++;
    }
    return Math.ceil(ascii / 3.6 + cyr * (UKBE.test(text) ? 0.6 : 0.5) + greek + hebrew * 0.45 + other);
  }

  // HERESY 1009: what the style holds that YuE2 never saw under [Tags]. Measured on the
  // 110 official example styles: 4 to 999 characters (half within 69..399), no arrows (ASCII -> accepted, 1012),
  // no dynamics marks, "Label:" fields in 5. The engine passes the style verbatim; past
  // what the model learned, a line of it can come out sung. The official skill also
  // keeps notes out of the lyrics: section tags and the sung words only.
  function styleWarnings(style, lyrics) {
    var w = [];
    // HERESY 1012 (Viktor): 1,000–1,600 characters are fine, ASCII -> is fine; Unicode arrows are rare tokens.
    if (style.length > 1600) w.push("longer than 1,600 characters (the official examples stop at 999)");
    var uni = (style.match(/[\u2192\u2190\u21d2\u27f6]/g) || []).length;
    if (uni) w.push(uni + " Unicode arrow" + (uni > 1 ? "s" : "") + " (\u2192): write -> instead");
    // p f ff mp \u2026 standing alone or chained by arrows and dashes: "p\u2192f\u2192ff", "mp\u2013f", "(ff)"
    if (/(^|[\s(;,\u2192\u2013>-])(ppp|pp|p|mp|mf|f|ff|fff)(?=[\s),;.\u2192\u2013>]|$)/.test(style)) w.push("dynamics marks (never in the official styles)");
    var labels = style.match(/\b[A-Z][A-Za-z ]{1,20}:/g) || [];
    if (labels.length >= 3) w.push(labels.length + " \"Label:\" fields (5 of 110 official styles use any)");
    // HERESY 1010: bracket lines are legal (29 of 110 official examples: (saxophone), (male), (I'm so good)).
    // Only the shapes none of them has are flagged: a "Label:", an arrow or a p/f mark inside the brackets.
    var odd = (lyrics || "").split(/\r?\n/).filter(function (l) {
      var m = l.match(/^\s*\((.*)\)\s*$/);
      return m && (/\b[A-Z][A-Za-z ]{1,20}:/.test(m[1]) || /[\u2192\u2190]|->/.test(m[1]) ||
                   /(^|[\s(;,\u2013>-])(ppp|pp|p|mp|mf|f|ff|fff)(?=[\s),;.\u2013>]|$)/.test(m[1]));
    }).length;
    if (odd) w.push(odd + " bracket line" + (odd > 1 ? "s" : "") + " in the lyrics with a \"Label:\", an arrow or a p/f mark (none in the official examples)");
    return w;
  }

  // HERESY 1167 (Viktor: «Сами предупреждения о несоответствии со стилистикой можно в ту же строку перед знаком вопроса с
  // автоматически появляющимся WARNING и при наведении тултип крупно 16pt с разъяснением ожидаемой проблемы. Полосу со
  // счётчиками как сейчас, но не красным, а 80% gray… в одну строку»): the counter on one line, in grey; what is wrong
  // behind a WARNING at the end of the heading's line (before the cheat-sheet's ?), its tip large, with what to expect
  var EXPECT = "What to expect: YuE2 learned from styles without these, and the engine hands the style over word for word. " +
               "What the model never saw can come out sung as words, or pull the sound away from the style. Written as the official styles are, the style holds.";
  var OVER = "What to expect: the style, the lyrics, the score and the song share one window of 24,576 tokens; past the budget the score or the song is cut short.";
  function warnBadge() {
    var box = document.getElementById("style"), label = box && box.closest(".field") && box.closest(".field").querySelector(".label");
    if (!label) return null;
    var end = document.getElementById("styleLabelEnd");
    if (!end) {
      end = document.createElement("span");
      end.className = "label-end"; end.id = "styleLabelEnd";
      label.appendChild(end);
    }
    var b = document.getElementById("styleWarn");
    if (!b) {                                             // a span: hovering shows it all; a click folds nothing (below)
      b = document.createElement("span");
      b.id = "styleWarn"; b.className = "style-warn"; b.tabIndex = 0; b.hidden = true;
      b.setAttribute("data-tip-size", "big");
      b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2 2.6 20.2h18.8z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/>' +
        '<path d="M12 9.6v5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="17.4" r="1.35" fill="currentColor"/></svg><span>Warning</span>';
      b.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); });
      end.insertBefore(b, end.firstChild);
    }
    var hi = document.getElementById("hiOpen");
    if (hi && hi.parentNode !== end) end.appendChild(hi);  // the cheat-sheet's ? after it, at the line's end
    return b;
  }
  function paintMeter() {
    var style = document.getElementById("style"), lyrics = document.getElementById("lyrics"), out = document.getElementById("styleMeter");
    if (!style || !out) return;
    var s = estimateTokens(style.value), both = s + (lyrics ? estimateTokens(lyrics.value) : 0), budget = promptBudget();
    var warn = styleWarnings(style.value, lyrics ? lyrics.value : ""), full = budget <= 0;   // the knobs alone fill the window
    out.textContent = tr("Characters: " + style.value.length.toLocaleString(loc()) + " \u00b7 tokens: \u2248" + s.toLocaleString(loc()) +
      " \u00b7 with the lyrics: \u2248" + both.toLocaleString(loc()) + " of " + Math.max(0, budget).toLocaleString(loc()));
    out.classList.toggle("is-warn", (both > budget * 0.75 && both <= budget) || warn.length > 0);
    out.classList.toggle("is-over", both > budget);
    var b = warnBadge();
    if (!b) return;
    var said = [];
    if (full && isDirect()) said.push(tr("The song's token budget alone fills the window of 24,576 tokens: nothing is left for the style and the lyrics. Lower Max length."));
    else if (full) said.push(tr("The score's and the song's token budgets alone fill the window of 24,576 tokens: nothing is left for the style " +
                           "and the lyrics. Lower max tokens under Score sampling or Music sampling, or Max length."));
    else if (both > budget && isDirect()) said.push(tr("Style and lyrics together: about " + both.toLocaleString(loc()) + " tokens. Beside them the window holds about " +
                                         mmss((24576 - 80 - both) / 25) + " of sound, and Max length asks for " + mmss(songTokens() / 25) +
                                         ": the engine cuts the song there and marks it truncated."));
    else if (both > budget) said.push(tr("Style and lyrics together: about " + both.toLocaleString(loc()) + " of " + budget.toLocaleString(loc()) +
                                         " tokens \u2014 too long for a full-length song and score."));
    if (warn.length) said.push(tr("Unlike the model's training styles:") + "\n" + warn.map(function (x) { return "\u2022 " + tr(x); }).join("\n"));
    b.hidden = !said.length;
    if (!said.length) { b.removeAttribute("data-tip"); return; }
    if (warn.length) said.push(tr(EXPECT));
    if (both > budget) said.push(tr(OVER));
    b.setAttribute("data-tip", said.join("\n\n"));
  }

  function growBox(box) {
    box.style.height = "auto";
    box.style.height = Math.min(Math.round(window.innerHeight * 0.5), Math.max(76, box.scrollHeight + 4)) + "px";
  }

  var watching = false;
  function watchPrompt() {
    var style = document.getElementById("style"), lyrics = document.getElementById("lyrics"), idea = document.getElementById("idea");
    if (watching || !style) return;
    watching = true;
    var sized = window.CSS && CSS.supports && CSS.supports("field-sizing", "content");
    var last = null;
    function tick() {
      // the texts themselves: a new prompt of the same length set by the page must still repaint
      var now = style.value + "\u0000" + (lyrics ? lyrics.value : "") + "\u0000" + promptBudget();   // HERESY 1167: the mode and the knobs too
      if (now === last) return;
      last = now;
      if (!sized) growBox(style);
      paintMeter();
    }
    // browsers without field-sizing: the idea box grows by hand too
    if (!sized && idea) idea.addEventListener("input", function () { growBox(idea); });
    style.addEventListener("input", tick);
    if (lyrics) lyrics.addEventListener("input", tick);
    window.addEventListener("ruach-lang", function () { last = null; tick(); });   // HERESY 1167: written again in it
    setInterval(tick, 700);     // values set by the page itself (examples, reuse, the writer) fire no input event
    tick();
  }

  // Pressing an (i) inside a label or a drawer heading must not tick, focus or fold anything.
  document.addEventListener("click", function (event) {
    var info = event.target.closest && event.target.closest(".info");
    if (info && info.closest("label, summary")) event.preventDefault();
  }, true);

  function start() {
    decorate();
    watchPrompt();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();

  root.YueHelp = { decorate: decorate, missing: missing, text: HELP, knobs: KNOBS, estimateTokens: estimateTokens,
    promptBudget: promptBudget };
})(window);
