// HERESY 2350 (Timon's cherry ⑥, «Тимон YuE2-Studio - вишенки - 2026-11-07»: his #209 «тексты ассистента — ИИ-слоп в 80 % случаев»; the plan of
// 08.11.2026, the Writer: «Вишенка Тимона ⑥: список заезженных слов»): the words and phrases worn out in songs, a list for each language of the
// lyrics. They are marked in the lyrics (the Creator's and the Writer's: a thin amber line under each, heresy-lyrics.js), counted under the
// Creator's box with a press to the next one, and the Writer's model is told to leave them out (heresy-assist.js, its charter and the idea
// writer's). The Studio's own list is a start, not a law: each language's list is the user's to edit (Worn words under the lyrics), kept as
// yue2.wornWords, the Studio's settings file with it. An entry is a word or a phrase as it is written; a * at a word's end takes its forms
// (неон* takes неоновый); a stress mark (U+0301) in the lyrics never hides a word. Chinese and Japanese entries are matched as written.
//
//   HeresyWorn.lang(text, style) · list(lang) · find(text, lang) → [{from, to, line, col, len, word}] · prompt() · edit(lang) → Promise
(function () {
  "use strict";
  function tr(s) { return window.RuachI18n ? window.RuachI18n.t(s) : s; }
  function recall(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function store(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* a private window */ } }
  var KEY = "yue2.wornWords";

  // The Studio's own lists: the stock images of machine-written lyrics and of tired pop, in each language the Studio speaks
  var OWN = {
    en: ["neon*", "city lights", "midnight", "echo", "echoes", "shadow", "shadows", "whisper*", "ember", "embers", "ignite*", "tapestr*", "symphon*",
         "kaleidoscop*", "labyrinth*", "velvet", "stardust", "starlight", "starlit", "heartbeat*", "endless night*", "shatter*", "fading", "hollow",
         "wildfire", "rise from the ashes", "from the ashes", "set me free", "chasing dreams", "chase the dream*", "lost in the moment",
         "dancing in the rain", "burning bright", "heart on fire", "fire inside", "broken pieces", "stars align", "through the storm",
         "concrete jungle", "electric", "skyline", "golden hour", "ocean eyes", "silent scream*", "unbreakable", "forevermore", "soul on fire"],
    ru: ["неон*", "огни город*", "ночной город", "ночного города", "в ночи", "до утра", "навсегда", "сквозь года", "сквозь время", "шёпот*", "шепот*",
         "эхо", "тени", "теней", "пепел", "пепла", "осколк*", "разбитое сердце", "разбитого сердца", "сердце в огне", "пламя в груди", "в унисон",
         "бесконечност*", "вечност*", "вселенн*", "мечты", "мечтой", "звёзды над нами", "звездная пыль", "звёздная пыль", "крылья за спиной",
         "душа поёт", "дождь за окном", "только ты и я", "ты и я"],
    uk: ["неон*", "вогні міст*", "нічне місто", "нічного міста", "у ночі", "до ранку", "назавжди", "крізь роки", "шепіт", "шепоту", "відлунн*",
         "тіні", "попіл", "попелу", "уламк*", "розбите серце", "розбитого серця", "серце в вогні", "полум'я в грудях", "в унісон",
         "безкінечн*", "нескінченн*", "вічніст*", "всесвіт*", "мрії", "мрією", "зоряний пил", "крила за спиною", "душа співає", "тільки ти і я", "ти і я"],
    be: ["неон*", "агні горад*", "у начы", "да раніцы", "назаўсёды", "праз гады", "шэпт", "шэпту", "рэха", "цені", "попел", "попелу", "аскепк*",
         "разбітае сэрца", "сэрца ў агні", "ва ўнісон", "бясконц*", "вечнасц*", "сусвет*", "мары", "марай", "зорны пыл", "крылы за спінай",
         "душа спявае", "толькі ты і я"],
    el: ["νέον", "φώτα της πόλης", "μεσάνυχτα", "για πάντα", "αιώνια", "ψίθυρ*", "ηχώ", "σκιές", "στάχτη", "στάχτες", "συντρίμμια",
         "ραγισμένη καρδιά", "φωτιά μέσα μου", "αστερόσκονη", "όνειρα", "μόνο εσύ κι εγώ", "εσύ κι εγώ", "πεπρωμένο"],
    es: ["neón", "luces de la ciudad", "medianoche", "para siempre", "eternidad", "susurr*", "eco", "ecos", "sombras", "cenizas", "pedazos",
         "corazón roto", "fuego en el alma", "fuego interior", "polvo de estrellas", "sueños", "bajo la lluvia", "tú y yo", "latido*",
         "sinfonía", "destino", "infinito"],
    it: ["neon", "luci della città", "mezzanotte", "per sempre", "eternità", "sussurr*", "eco", "ombre", "cenere", "frammenti", "cuore spezzato",
         "fuoco dentro", "polvere di stelle", "sogni", "sotto la pioggia", "io e te", "battito*", "sinfonia", "destino", "infinito"],
    fr: ["néon*", "lumières de la ville", "minuit", "pour toujours", "à jamais", "éternité", "murmur*", "écho", "échos", "ombres", "cendres",
         "éclats", "cœur brisé", "feu intérieur", "poussière d'étoiles", "rêves", "sous la pluie", "toi et moi", "battement*", "symphonie",
         "destin", "infini"],
    pt: ["neon", "luzes da cidade", "meia-noite", "para sempre", "eternidade", "sussurr*", "eco", "ecos", "sombras", "cinzas", "pedaços",
         "coração partido", "coração quebrado", "fogo dentro", "poeira de estrelas", "sonhos", "sob a chuva", "eu e você", "batida*", "sinfonia",
         "destino", "infinito"],
    de: ["neon*", "lichter der stadt", "mitternacht", "für immer", "ewigkeit", "flüster*", "echo", "schatten", "asche", "scherben",
         "gebrochenes herz", "feuer in mir", "sternenstaub", "träume", "im regen tanzen", "du und ich", "herzschlag*", "symphonie", "schicksal",
         "unendlich*"],
    ja: ["ネオン", "夜空", "星屑", "永遠", "奇跡", "運命", "翼", "涙の雨", "心の傷", "君と僕", "ささやき", "シンフォニー", "輝き", "夢を追いかけ"],
    zh: ["霓虹", "城市的灯", "午夜", "永远", "永恒", "低语", "回声", "影子", "灰烬", "碎片", "心碎", "星辰", "梦想", "翅膀", "雨中", "你和我", "心跳", "命运", "奇迹"]
  };
  var NAMES = { en: "English", ru: "Русский", uk: "Українська", be: "Беларуская", el: "Ελληνικά", es: "Español", it: "Italiano", fr: "Français",
                pt: "Português", de: "Deutsch", ja: "日本語", zh: "中文" };

  function kept() { try { var o = JSON.parse(recall(KEY) || "{}"); return o && typeof o === "object" && !Array.isArray(o) ? o : {}; } catch (e) { return {}; } }
  function list(lang) {
    var k = kept()[lang];
    return Array.isArray(k) ? k.slice() : (OWN[lang] || []).slice();
  }
  function own(lang) { return !Array.isArray(kept()[lang]); }
  function keep(lang, words) {                        // null: the Studio's own list again
    var k = kept();
    if (words === null) delete k[lang]; else k[lang] = words;
    store(KEY, Object.keys(k).length ? JSON.stringify(k) : null);
    cache = {};
  }

  // the lyrics' language: their letters, Cyrillic told by the style's own word or the letters only one language has, Latin by heresy-lyrics.js
  function lang(text, style) {
    var t = String(text || "").replace(/\[[^\]\n]*\]/g, " ");
    var n = function (re) { return (t.match(re) || []).length; };
    var cyr = n(/[а-яёіїєў]/gi), lat = n(/[a-z]/gi), grk = n(/[α-ωάέήίόύώ]/gi), kana = n(/[\u3040-\u30ff]/g), han = n(/[\u4e00-\u9fff]/g);
    if (kana > 3) return "ja";
    if (han > 3 && han >= n(/[a-z]+/gi)) return "zh";
    if (grk > cyr && grk > lat) return "el";
    if (cyr && cyr >= lat) {
      if (/\bukrainian\b/i.test(style || "")) return "uk";
      if (/\bbelarusian\b/i.test(style || "")) return "be";
      if (/ў/i.test(t)) return "be";
      if (/[їєґ]/i.test(t) && !/[ыэъё]/i.test(t)) return "uk";
      return "ru";
    }
    if (!lat) return "";
    var first = (String(style || "").match(/^\s*([\p{L}]+)/u) || [])[1] || "";   // the style begins with the lyrics' language, the Studio's way
    var named = { english: "en", spanish: "es", "español": "es", italian: "it", italiano: "it", french: "fr", "français": "fr", portuguese: "pt",
                  "português": "pt", german: "de", deutsch: "de" }[first.toLowerCase()];
    if (named) return named;
    var L = window.HeresyLyrics && window.HeresyLyrics.latinOf ? window.HeresyLyrics.latinOf(t, style) : "en";
    return OWN[L] ? L : "en";
  }

  // one pattern for a language's list, longest entries first (a phrase before the word inside it)
  var cache = {};
  function pattern(lng) {
    if (cache[lng] !== undefined) return cache[lng];
    var cjk = lng === "ja" || lng === "zh";
    var parts = list(lng).map(function (w) { return String(w || "").trim().toLowerCase().normalize("NFC"); }).filter(Boolean)
      .sort(function (a, b) { return b.length - a.length; })
      .map(function (w) {
        var stem = /\*$/.test(w);
        var body = w.replace(/\*+$/, "").split(/\s+/).map(function (x) { return x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/[её]/g, "[её]").replace(/'/g, "['’ʼ]"); }).join("\\s+");
        return cjk ? body : "(?<![\\p{L}\\p{M}])" + body + (stem ? "[\\p{L}\\p{M}'’]*" : "(?![\\p{L}\\p{M}])");
      });
    cache[lng] = parts.length ? new RegExp(parts.join("|"), "giu") : null;
    return cache[lng];
  }
  // the worn words in a text, where they stand in it as written (its stress marks and case kept)
  function find(text, lng) {
    var src = String(text || ""), re = pattern(lng || lang(src, ""));
    if (!re || !src) return [];
    var plain = "", at = [];                            // the text without its stress marks (U+0301), lowered, and where each letter came from
    for (var i = 0; i < src.length; i++) {
      var c = src[i];
      if (c === "\u0301") continue;
      var low = c.toLowerCase();
      for (var j = 0; j < low.length; j++) { plain += low[j]; at.push(i); }
    }
    at.push(src.length);
    var out = [], m, starts = [0];
    for (var k = 0; k < src.length; k++) if (src[k] === "\n") starts.push(k + 1);
    re.lastIndex = 0;
    while ((m = re.exec(plain))) {
      if (!m[0]) { re.lastIndex++; continue; }
      var from = at[m.index], to = at[m.index + m[0].length - 1] + 1;
      while (to < src.length && src[to] === "\u0301") to++;
      var line = 0;
      while (line + 1 < starts.length && starts[line + 1] <= from) line++;
      if (/\[[^\]\n]*$/.test(src.slice(starts[line], from))) continue;   // inside a [tag]
      out.push({ from: from, to: to, line: line, col: from - starts[line], len: to - from, word: src.slice(from, to) });
    }
    return out;
  }

  // the Writer's charter: the list of the song's language (the Creator's lyrics, else its style's first word, else the page's language)
  function songLang() {
    var ly = document.getElementById("lyrics"), st = document.getElementById("style");
    var l = lang(ly ? ly.value : "", st ? st.value : "");
    if (l) return l;
    var first = ((st ? st.value : "").match(/^\s*([A-Za-z]+)/) || [])[1];
    var byWord = { english: "en", russian: "ru", ukrainian: "uk", belarusian: "be", greek: "el", spanish: "es", italian: "it", french: "fr",
                   portuguese: "pt", german: "de", japanese: "ja", chinese: "zh", mandarin: "zh" }[(first || "").toLowerCase()];
    return byWord || (window.RuachI18n && window.RuachI18n.lang ? window.RuachI18n.lang() : "en");
  }
  function prompt() {
    var l = songLang(), words = list(l);
    if (!words.length) return "";
    return "\n\nWORDS WORN OUT BY USE\n" +
      "The user keeps a list of words and phrases worn out in songs (" + (NAMES[l] || l) + "; a * stands for any ending): do not use them, nor their forms, " +
      "unless the brief names one; write an image or an action that belongs to this narrator instead, and the same for their equivalents in any other " +
      "language you write in. When the brief does name one, keep it and say so in notes. The list: " + words.join("; ") + ".";
  }

  // Worn words under the lyrics: what the list of this language holds; edit it, take the Studio's own back, or mark none
  function edit(lng) {
    var D = window.HeresyDialog, l = lng || songLang(), name = NAMES[l] || l, now = list(l);
    if (!D) return Promise.resolve(false);
    var items = [{ value: "edit", label: "Edit the list…", words: true }];
    if (!own(l)) items.push({ value: "own", label: "The Studio's own list", note: String((OWN[l] || []).length), words: true });
    if (now.length) items.push({ value: "none", label: "Mark none in this language", words: true });
    return D.choose("Worn words · " + name + "\n\n" + "In the list: {0}. They are marked in the lyrics, and the Writer's model is told to leave them out.".replace("{0}", now.length),
                    items, { cancel: "Cancel" }).then(function (v) {
      if (v === "own") { keep(l, null); return true; }
      if (v === "none") { keep(l, []); return true; }
      if (v !== "edit") return false;
      return D.prompt("Worn words · " + name + "\n\nOne word or phrase a line, as it is written. A * at a word's end takes its forms too (неон* takes неоновый).",
                      now.join("\n"), { area: true, rows: 14, max: 12000, ok: "Save" }).then(function (text) {
        if (text === null || text === undefined) return false;
        var seen = {}, words = String(text).split(/\r?\n/).map(function (w) { return w.trim(); }).filter(function (w) {
          var k = w.toLowerCase();
          if (!w || seen[k]) return false;
          seen[k] = 1;
          return true;
        });
        keep(l, words);
        return true;
      });
    });
  }

  window.HeresyWorn = { lang: lang, list: list, own: own, find: find, prompt: prompt, edit: edit, songLang: songLang, names: NAMES, OWN: OWN };
})();
