// HERESY 1168 (Viktor 06.10.2026: «В поле редактора Лирики можешь прикрутить ересь?… когда пишешь лирику, нужна не только
// рифма, но и длина строк, чтобы ложились на общий такт. Некий визуализатор длин строк, вертикальную линейку, которая по
// куплету+мосту будет едино мерить. По при-корусу и корусу — отдельно. Там же разные такты и темпы… браузер встроенный
// спелл чекер… внизу текстового поля Лирики подсчёт символов/знаков самой лирики, и отдельно служебные теги разделов и то,
// что в скобках круглых»; «разреши ручную растяжку поля лирики по высоте»): the lyrics' meter.
//
// Beside each line, its syllables as a bar against the ruler of its group: verse and bridge one group, the pre-chorus its
// own, the chorus its own, any other section its own. The ruler stands at the group's usual length (the median of its
// lines); a line within a syllable of it is in step, two or three off amber, more red. What is in round brackets is drawn
// on after the bar, hatched: it may be sung (Viktor heard it in the first Buratino takes). Syllables are vowels: ע counts
// (his soft о/а), stress marks do not, a Latin letter in a Russian word counts as the vowel it is (his hard o); English
// counts vowel groups, Greek its vowels, Hebrew its points (and the shuruk).
//
// Under the box: the lyrics' own characters, syllables and lines; the section tags; what is in brackets; his phonetic hand
// (stress marks, ayins, Latin letters inside Russian words); the browser's own spelling check in the lyrics' language,
// switched off there when it is in the way; and «auto height» once the box was drawn by hand.
//
// HERESY 1168 (Viktor 07.10.2026: «вшей ещё проверку проёбов с x301. Что не на гласных, в пустоте, на пробеле...»): every
// stress mark (U+0301) belongs right after the vowel it stresses (Cyrillic, Latin — his hard o —, Greek, or ע — his soft
// о/а). Off a vowel it is a slip: at a line's start, after a space or a sign, on a consonant, a second mark on the same
// letter, or a spacing ´ in its place; a word with two marks is asked about (amber), not called wrong. A button under the
// box counts them and goes to the next; the line's number beside it carries a mark.
// His second question («С x301 неправильно считаются слоги, мне так кажется. ע учитывается в слогах как гласная?»),
// measured on his v9.0.9 (89 sung lines): no line's count moves with its stress marks, and ע counts. The measure found three
// faults of the count instead, mended here: a decomposed «й» (и + U+0306, as pasted text may bring it) counted as a vowel;
// a Latin vowel with its acute composed (ó — what «o + U+0301» becomes in a normalizing editor) not counted; Belarusian «ў»,
// which is no syllable, counted. A word is composed (NFC) before it is counted.
//
// HERESY 1168 (Viktor 07.10.2026: «предусмотри в твоём "градуснике" строк текстов игнорирование подсчётов, если, к примеру,
// в строке два [] тега типа [Break] [Silence]. И т.п.»; «Счёт по базису реальных вокальных секций. Даже если внутри паузные,
// интерлюдия/прелюдия, общее продолжаем по главному тегу секции»): every [tag] of a line is a tag, never sung: a line of tags
// alone counts as none, a tag inside a sung line is left out of its count. A pause, a break, a silence, an interlude, a
// prelude or an instrumental cue inside a sung section opens no group of its own: its name stands beside it, and the lines
// after it go on in the section's group, measured by its ruler (before the first sung section, an intro's spoken lines keep
// a group of their own, as before). A line still being written as a tag («[Ver», the tags offered under it) is not counted.
//
//   HeresyLyrics.attach(textarea, { meter: element, fit: function (area) {…} })
(function () {
  "use strict";
  function tr(s) { return window.RuachI18n ? window.RuachI18n.t(s) : s; }
  function recall(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function store(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* private window */ } }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function num(n) { return Number(n).toLocaleString(window.RuachI18n ? window.RuachI18n.locales() : undefined); }

  // HERESY 1168 (Viktor 07.10.2026: «Считает гласные, а нужно считать слоги. Каждый слог забирает часть доли музыкальной…
  // Сможешь унифицировать счётчики и для всех языков, что у нас запланированы в финальный релиз?»): a syllable is one vowel
  // sound, one note; each language counts it by its own rules (the studio's seven, Hebrew by its points, Chinese, Japanese and
  // Korean by their signs). In Russian, Ukrainian and Belarusian that is one vowel letter each, as before: his «Я|же|ви|жу|
  // глу|п|цо́в|с|при|ду́р|чес|ким|пла|ном» is fourteen parts, and two have no vowel (п, с): consonants that take time when sung,
  // not syllables (глуп-цо́в спри-ду́р-чес-ким): twelve. What the count got wrong was elsewhere: Spanish and Italian went by
  // English (their final e taken for silent: «noche» one), Greek lost its diaeresis, Hebrew counted ע and the shin's dot as
  // vowels, Chinese counted nothing.
  var CYR = /[а-яёіїєў]/i, HEB = /[֐-׿]/, GRK = /[α-ωάέήίόύώϊϋΐΰ]/i;
  var CJK = /[぀-ヿ㐀-䶿一-鿿가-힯豈-﫿]/g;   // kana, Han, Hangul: one sign, one syllable
  var LATV = /[aeiouyàáâãäåèéêëìíîïòóôõöùúûüýÿ]/gi;   // a Latin vowel, its accent composed or not
  function cyrillic(w) { return (w.match(/[аеёиоуыэюяіїєѐѝע]/gi) || []).length + (w.match(LATV) || []).length; }   // ע and his Latin o count
  // the vowel points, sheva and the dots that are no vowel left out (dagesh, the shin's and sin's dots, meteg), and the shuruk
  function hebrew(w) { return Math.max(1, (w.match(/[ֱ-ֻ]|וּ(?![ְ-ֻ])/g) || []).length); }
  // αι ει οι υι ου αυ ευ ηυ one vowel, unless a diaeresis on the second or the accent on the first parts them (τσάι, Μαΐου);
  // an unstressed ι after a consonant glides into the vowel after it (καρδιά); an elided σ' has none
  function greek(w) {
    var s = w.toLowerCase().normalize("NFD"), L = [], n = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (/[̀-ͯ]/.test(c)) { if (L.length) { if (c === "̈") L[L.length - 1].dia = true; else if (/[̀́͂]/.test(c)) L[L.length - 1].acc = true; } continue; }
      L.push({ c: c, v: /[αεηιουω]/.test(c), acc: false, dia: false });
    }
    for (var j = 0; j < L.length; j++) {
      var a = L[j], b = L[j + 1];
      if (!a.v) continue;
      if (b && b.v && !b.dia && !a.acc && /^(αι|ει|οι|υι|ου|αυ|ευ|ηυ)$/.test(a.c + b.c)) { n++; j++; continue; }
      if (a.c === "ι" && !a.acc && !a.dia && b && b.v && j > 0 && !L[j - 1].v) continue;
      n++;
    }
    return n;
  }
  // Spanish and Italian: in a run of vowels each strong one (a, e, o, or any with a written accent) is a syllable, the weak i
  // and u join their neighbour (cie-lo, cuo-re), two weak are one (ciu-dad), none strong is still one; the u of que, gui and
  // qua is no vowel, nor the i of ciao, giorno, figlio; a Spanish y ends a syllable as a vowel (hoy, muy, the word y)
  function romance(w, lang) {
    var s = w.toLowerCase().normalize("NFC"), n = 0;
    if (lang === "es") s = s.replace(/([qg])u(?=[eéií])/g, "$1").replace(/y(?![aeiouáéíóú])/g, "i");
    else s = s.replace(/(sc|c|g)i(?=[aeouàèéòóù])/g, "$1").replace(/gli(?=[aeouàèéòóù])/g, "gl").replace(/([qg])u(?=[aeioàèéìòóù])/g, "$1");
    (s.match(/[aeiouáéíóúàèìòùü]+/g) || []).forEach(function (run) { n += Math.max(1, (run.match(/[aeoáéíóúàèìòù]/g) || []).length); });
    return n || (/\d/.test(s) ? s.replace(/\D/g, "").length : 0);
  }
  // English by its vowel groups: a final silent e is none (make; not -le: ta-ble; not an accented é: café), nor the e of -es
  // and -ed (makes, loved; not boxes, wanted); -ing after a vowel and -io, -ia, -eo, -ea at the end are two (go-ing, ra-di-o)
  function english(w) {
    var raw = w.toLowerCase().replace(/['’]/g, ""), low = raw.normalize("NFD").replace(/([aeiouy])̈/g, "|$1").replace(/[̀-ͯ]/g, "");
    var n = (low.match(/[aeiouy]+/g) || []).length;
    if (!n) return /\d/.test(low) ? low.replace(/\D/g, "").length : 0;   // 2026: its digits, one each (rough)
    if (n > 1) {
      if (/[^aeiouy]e$/.test(raw) && !/[^aeiouy]le$/.test(raw)) n--;
      else if (/[^aeiouysxzcgh]es$/.test(raw) || /[^aeiouytd]ed$/.test(raw)) n--;
      if (/(i[aoe]|e[ao])$/.test(low)) n++;
    }
    if (/[aeiouy]ing$/.test(low)) n++;
    return Math.max(1, n);
  }
  function wordSyllables(w, lang) {
    w = w.normalize("NFC");                        // и + U+0306 is «й», no vowel; o + U+0301 is «ó», a vowel
    var signs = w.match(CJK);
    if (signs) return signs.length + syllables(w.replace(CJK, " "), lang);
    if (CYR.test(w)) return cyrillic(w);
    if (HEB.test(w)) return hebrew(w);
    if (GRK.test(w)) return greek(w);
    if (lang === "es" || lang === "it") return romance(w, lang);
    return english(w);
  }
  // the language of the lyrics' Latin words: the style's own word for it, else their commonest small words and letters
  var LATIN = {
    es: /^(el|los|las|que|de|del|y|en|un|una|por|con|para|como|pero|yo|es|est[aá]|muy|m[aá]s|sin|cuando|donde|coraz[oó]n|amor|noche|vida|soy|eres|todo|nada)$/,
    it: /^(il|lo|gli|che|non|di|della|nel|un|una|per|con|come|ma|mio|mia|io|sono|sei|è|più|perché|cuore|amore|notte|vita|anche|questo|quando|tutto|niente)$/,
    en: /^(the|and|you|i|is|of|to|in|it|my|me|your|we|on|for|with|that|this|be|are|was|love|all|not|dont|im|so|but|what|when|night|heart)$/
  };
  function latinOf(text, style) {
    var st = (style || "").toLowerCase();
    if (/\b(spanish|español|espanol|castellano)\b/.test(st)) return "es";
    if (/\b(italian|italiano)\b/.test(st)) return "it";
    if (/\benglish\b/.test(st)) return "en";
    var score = { es: (text.match(/[ñ¿¡]/gi) || []).length * 3, it: (text.match(/[àèìòù]/gi) || []).length, en: 0 };
    (text.toLowerCase().replace(/['’]/g, "").match(/[a-zàáèéìíòóùúñü]+/g) || []).forEach(function (t) {
      Object.keys(LATIN).forEach(function (k) { if (LATIN[k].test(t)) score[k]++; });
    });
    return score.es > score.en && score.es >= score.it ? "es" : score.it > score.en && score.it > score.es ? "it" : "en";
  }
  function syllables(text, lang) {
    lang = lang || latinOf(text, "");
    return (text.match(/[^\s.,!?;:…—–"«»„“”()\[\]]+/g) || []).reduce(function (n, w) { return n + wordSyllables(w, lang); }, 0);
  }
  // HERESY 1168 (Viktor 07.10.2026: «Допиши одиночные согласные доли, потому что мы не меряем по реальным слогам между 2 и 4
  // символами, а по реальной затрате времени на произношение»): the meter measures the time a line takes, and in Russian,
  // Ukrainian and Belarusian two things take a beat no vowel carries: a word with no vowel (с, в, к, з, й, ў: his «глупцо́в
  // с приду́рческим») and, inside a word, a stop closed against an affricate (п|ц, т|ч, д|ц…: his «глу|п|цо́в»). They count with
  // the line's syllables (the ruler measures the whole), drawn lighter on its bar; the syllables under the box stay syllables
  var CV = "аеёиоуыэюяіїєѐѝעaeiouyàáâãäåèéêëìíîïòóôõöùúûüýÿ";
  var CLUSTER = new RegExp("[" + CV + "]([бвгджзйклмнпрстфхцчшщьъґ]+)(?=[" + CV + "])", "g");
  function consonantBeats(text) {
    return (text.match(/[^\s.,!?;:…—–"«»„“”()\[\]]+/g) || []).reduce(function (n, w) {
      w = w.normalize("NFC");
      if (!CYR.test(w) || w.match(CJK)) return n;
      if (!cyrillic(w)) return n + 1;
      var low = w.toLowerCase().replace(/[\u0300-\u036f]/g, ""), m, k = 0;
      CLUSTER.lastIndex = 0;
      while ((m = CLUSTER.exec(low)) !== null) if (/^[пбтдкг][ьъ]?[цч]/.test(m[1])) k++;   // the stop right after the vowel (not сердце's silent д)
      return n + k;
    }, 0);
  }

  // the stress marks that are off a vowel (kind, where), and the words with two (asked about, not called wrong)
  var VOWEL = /[аеёиоуыэюяіїєѐѝaeiouyαεηιουωע]/i, ACCENTED = /[àáâãäåèéêëìíîïòóôõöùúûüýÿάέήίόύώΐΰ]/i, MARK = /[\u0300-\u036f]/;
  var SPACING = /[\u00b4\u02ca]/, SPACING_GRK = /[\u0384\u1ffd]/;   // ´ ˊ anywhere; ΄ and the Greek oxia outside Greek
  function stressFaults(text) {
    var out = [], twos = [], start = 0;
    text.split("\n").forEach(function (line, n) {
      var grk = GRK.test(line);
      for (var i = 0; i < line.length; i++) {
        var c = line[i];
        if (SPACING.test(c) || (!grk && SPACING_GRK.test(c))) { out.push({ line: n, at: start + i, from: start + i, to: start + i + 1, kind: "spacing", c: c }); continue; }
        if (c !== "\u0301") continue;
        var j = i - 1, doubled = false;
        while (j >= 0 && MARK.test(line[j])) { if (line[j] === "\u0301") doubled = true; j--; }
        var base = j >= 0 ? line[j] : "", kind = null;
        if (doubled) kind = "doubled";
        else if (j < 0) kind = "start";
        else if (/\s/.test(base)) kind = "space";
        else if (ACCENTED.test(base)) kind = "doubled";
        else if (VOWEL.test(base)) kind = null;
        else if (/[a-zа-яёіїєўα-ω֐-׿]/i.test(base) || base.toLowerCase() !== base.toUpperCase()) kind = "consonant";
        else kind = "sign";
        if (kind) {
          // what is selected to show it: the letter (or sign) with its mark; a mark at a line's start or after a space has no
          // letter of its own, so the space before and the letter after it come with it (a lone mark selected is invisible)
          var lone = kind === "start" || kind === "space", from = lone ? (kind === "space" ? i - 1 : i) : j, to = lone && i + 1 < line.length ? i + 2 : i + 1;
          out.push({ line: n, at: start + i, from: start + from, to: start + to, kind: kind, c: base, next: line[i + 1] || "" });
        }
      }
      var words = line.match(/[^\s.,!?;:…—–"«»„“”()\[\]]+/g) || [], pos = 0;
      words.forEach(function (w) {
        var k = line.indexOf(w, pos);
        pos = k + w.length;
        var marks = 0;                                 // the marks of the word that are no fault already (a doubled one is)
        for (var q = w.indexOf("\u0301"); q >= 0; q = w.indexOf("\u0301", q + 1)) {
          if (!out.some(function (f) { return f.at === start + k + q; })) marks++;
        }
        if (marks >= 2) twos.push({ line: n, at: start + k, from: start + k, to: start + k + w.length, kind: "two", word: w });
      });
      start += line.length + 1;
    });
    return { faults: out, twos: twos };
  }
  function faultSays(f) {
    var q = function (c) { return "«" + c + "»"; };
    if (f.kind === "spacing") return tr("{0} is a spacing accent, not the stress mark (U+0301 after the vowel)").replace("{0}", q(f.c));
    if (f.kind === "start") return tr("at the line's start") + (f.next.trim() ? " " + tr("(before {0})").replace("{0}", q(f.next)) : "");
    if (f.kind === "space") return tr("after a space") + (f.next.trim() ? " " + tr("(before {0})").replace("{0}", q(f.next)) : "");
    if (f.kind === "doubled") return tr("a second mark on {0}").replace("{0}", q(f.c));
    if (f.kind === "consonant") return tr("on {0}, not a vowel").replace("{0}", q(f.c));
    if (f.kind === "sign") return tr("after {0}").replace("{0}", q(f.c));
    return tr("two marks in {0}").replace("{0}", q(f.word));
  }

  // the group a section measures with: «verse+bridge» one, the rest each its own. HERESY 1168 (Viktor: «По примерам из YuE2
  // репо вычлени все возможные теги и предусмотри их»): the 110 official examples' tags, as written there: «Verse 1 – Him»,
  // «Chorus: All», «Final Chorus / Outro», «Instrumental Break - Horns», «Guitar Solo», «副歌1»… The head of a tag (before –,
  // —, -, :, |, /, a bracket) names the section; a tag that names none (who sings: «Male Vocals», «NARRATOR — NOT SUNG»; what
  // the song is: «MOOD: …», «TEMPO: …») is no new section: its lines stay in the one before (null)
  var SECTIONS = [
    [/\bpre[\s-]?chorus\b|^пред/, "pre-chorus"], [/\bpost[\s-]?chorus\b/, "post-chorus"],
    [/\b(chorus|hook|refrain)\b|^(副歌|припев|приспів|прыпеў)/, "chorus"],
    [/\b(verse|bridge)\b|^(主歌|桥段|куплет|бридж|мост|міст)/, "verse + bridge"],
    [/\b(intro(duction)?|prelude)\b|^(вступ|прелюд)/, "intro"],
    [/\b(outro|ends?|fade[\s-]?out|fadeout|fades out)\b|^(fade|аутро|кода)/, "outro"],
    [/\binterlude\b|^(проигрыш|интерлюд)/, "interlude"], [/\b(break|breakdown)\b|^перерыв/, "break"],
    [/\b(silence|pause|rest|tacet)\b|^(тишина|пауза)/, "pause"], [/\bdrops?\b/, "drop"], [/\bsolo\b/, "solo"],
    [/\b(inst|instrumental|riffs?|vamp|flourish)\b/, "instrumental"]
  ];
  // what is no sung section: inside one it opens no group (the section's count goes on under it); before the first, it does
  var PAUSES = { intro: 1, interlude: 1, "break": 1, pause: 1, drop: 1, solo: 1, instrumental: 1 };
  var TAG = /\[[^\]\n]*\]/g;
  function groupOf(name) {
    var n = name.toLowerCase().replace(/\s+/g, " ").trim();
    var head = n.split(/\s[–—-]\s|:|\||\/|\(/)[0].replace(/[\d#.]+/g, " ").trim();
    for (var i = 0; i < SECTIONS.length; i++) if (SECTIONS[i][0].test(head)) return SECTIONS[i][1];
    if (/^(genres?|style|mood|tempo|instrumentation|arrangement|production|structure|dynamics|emotions|meta)\b/.test(head)) return null;
    if (/\b(vocals?|vox|voices?|narrator|spoken|lead|male|female|him|her|both|all|duet|choir|ad-?libs?|baritone|tenor|soprano|alto|rapper)\b/.test(n)) return null;
    return head.split(" ")[0] || "—";
  }

  function measure(text, lang) {
    lang = lang || latinOf(text, "");
    var lines = text.split("\n"), group = "—", sung = false, out = [], tags = { chars: 0, n: 0 }, br = { chars: 0, n: 0 }, head = null;
    var lyr = { chars: 0, syl: 0, cb: 0, lines: 0 }, hand = { stress: 0, ayin: 0, latin: 0 };
    // the tags a line begins with: who sings and what the song is go by; a sung section is a new group, and so is a pause
    // before the first; a pause inside one is marked on its row and nothing more. True when the group changed
    function heads(names, row) {
      var moved = false;
      names.forEach(function (name) {
        var g = groupOf(name);
        if (g === null) return;
        if (PAUSES[g] && sung) { if (row && !row.section && !row.pause) row.pause = g; return; }
        group = g;
        moved = true;
        if (!PAUSES[g]) sung = true;
        if (row) { row.group = g; row.section = true; row.pause = null; }
      });
      return moved;
    }
    lines.forEach(function (line) {
      var found = line.match(TAG) || [], rest = line.replace(TAG, " ");
      found.forEach(function (t) { tags.chars += t.length; tags.n++; });
      var lead = line.match(/^\s*(?:\[[^\]\n]*\]\s*)+/), names = lead ? (lead[0].match(TAG) || []).map(function (t) { return t.slice(1, -1); }) : [];
      if (found.length && !rest.trim()) {             // tags alone: a section's head, a pause, who sings; no sung line
        var row = { tag: true, group: group, name: names.join(" "), lines: 0, section: false, pause: null };
        heads(names, row);
        if (row.section) head = row;
        out.push(row);
        return;
      }
      if (/^\s*\[[^\]]*$/.test(rest)) { out.push({ group: group, syl: 0, bsyl: 0, empty: true }); return; }   // a tag being written
      if (names.length && heads(names, null)) head = null;   // a section named at a sung line's start: no row of its own to count on
      var brackets = rest.match(/\([^)]*\)/g) || [], inner = brackets.join(" ");
      var main = rest.replace(/\([^)]*\)/g, " ");
      br.chars += brackets.reduce(function (n, b) { return n + b.length; }, 0); br.n += brackets.length;
      var syl = syllables(main, lang), cb = consonantBeats(main), bsyl = syllables(inner.replace(/[()]/g, " "), lang);
      var words = main.replace(/\s+/g, "");
      lyr.chars += words.length;
      hand.stress += (line.match(/́/g) || []).length;
      hand.ayin += (line.match(/[а-яё]ע|ע[а-яё]/gi) || []).length;
      hand.latin += (rest.match(/[а-яё][a-z]|[a-z][а-яё]/gi) || []).length;
      if (syl || bsyl || cb) { lyr.syl += syl; lyr.cb += cb; lyr.lines++; if (head) head.lines++; }
      out.push({ group: group, syl: syl + cb, cb: cb, bsyl: bsyl, empty: !rest.trim() });   // syl: the beats the line takes
    });
    // each group's ruler: the median length of its sung lines, once it has two
    var byGroup = {};
    out.forEach(function (o) { if (!o.tag && o.syl) (byGroup[o.group] = byGroup[o.group] || []).push(o.syl); });
    var rulers = {};
    Object.keys(byGroup).forEach(function (g) {
      var v = byGroup[g].slice().sort(function (a, b) { return a - b; });
      if (v.length >= 2) rulers[g] = v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
    });
    var st = stressFaults(text);
    st.faults.forEach(function (f) { if (out[f.line]) out[f.line].fault = true; });
    st.twos.forEach(function (f) { if (out[f.line]) out[f.line].two = true; });
    return { rows: out, rulers: rulers, tags: tags, brackets: br, lyrics: lyr, hand: hand, stress: st };
  }

  // the language the browser's spelling check reads the lyrics in: their script, and for Cyrillic the style's own word
  function langOf(text, style) {
    var cyr = (text.match(/[а-яё]/gi) || []).length, lat = (text.match(/[a-z]/gi) || []).length, grk = (text.match(/[α-ω]/gi) || []).length;
    if (grk > cyr && grk > lat) return "el";
    if (cyr >= lat && cyr) {
      if (/\bukrainian\b/i.test(style || "")) return "uk";
      if (/\bbelarusian\b/i.test(style || "")) return "be";
      if (/ў/i.test(text)) return "be";                              // HERESY 1168: the letters only one of them has
      if (/[їєґ]/i.test(text) && !/[ыэъё]/i.test(text)) return "uk";
      return "ru";
    }
    return lat ? latinOf(text, style) : "";                         // HERESY 1168: English, Spanish or Italian
  }

  function attach(area, opts) {
    opts = opts || {};
    var meter = opts.meter, styleBox = opts.style;
    var wrap = document.createElement("div");
    wrap.className = "lyr-wrap";
    area.parentNode.insertBefore(wrap, area);
    wrap.appendChild(area);
    var gutter = document.createElement("div");
    gutter.className = "lyr-gutter";
    gutter.setAttribute("aria-hidden", "true");
    wrap.appendChild(gutter);
    var mirror = document.createElement("div");
    mirror.className = "lyr-mirror";
    mirror.setAttribute("aria-hidden", "true");
    wrap.appendChild(mirror);
    var last = null, queued = false;

    function paintMeter(m) {
      if (!meter) return;
      var spell = recall("yue2.lyrSpell") !== "off", manual = !!area.dataset.manual;
      var parts = [
        '<span class="lyr-c">' + esc(tr("Lyrics: {0} characters · {1} syllables · {2} lines")
          .replace("{0}", num(m.lyrics.chars)).replace("{1}", num(m.lyrics.syl)).replace("{2}", num(m.lyrics.lines))) + "</span>",
        '<span class="lyr-c">' + esc(tr("Tags: {0} characters in {1}").replace("{0}", num(m.tags.chars)).replace("{1}", num(m.tags.n))) + "</span>",
        '<span class="lyr-c">' + esc(tr("In brackets: {0} characters in {1}").replace("{0}", num(m.brackets.chars)).replace("{1}", num(m.brackets.n))) + "</span>"
      ];
      if (m.lyrics.cb) parts.splice(1, 0, '<span class="lyr-c" data-tip="' + esc(tr("Beats no vowel carries, counted with the syllables in each line's bar (drawn lighter): a word with no vowel (с, в, к, з, й, ў) and a stop closed against an affricate inside a word (глу-п-цо́в)")) + '">' +
        esc(tr("Consonant beats: {0}").replace("{0}", num(m.lyrics.cb))) + "</span>");
      if (m.hand.stress || m.hand.ayin || m.hand.latin) {
        parts.push('<span class="lyr-c lyr-hand" data-tip="' + esc(tr("The phonetic hand: stress marks (U+0301), ayins inside Russian words (a soft о/а), Latin letters inside Russian words (a hard o)")) + '">' +
          esc(tr("Stress {0} · ע {1} · Latin {2}").replace("{0}", num(m.hand.stress)).replace("{1}", num(m.hand.ayin)).replace("{2}", num(m.hand.latin))) + "</span>");
      }
      // HERESY 1168: the stress marks off a vowel (red) and the words with two (amber): each button goes to the next one
      [["faults", "stress", "bad", "Stress marks off a vowel: {0}"], ["twos", "stress2", "near", "Words with two stress marks: {0}"]].forEach(function (k) {
        var list = m.stress[k[0]];
        if (!list.length) return;
        var says = list.slice(0, 12).map(function (f) { return tr("line {0}: {1}").replace("{0}", num(f.line + 1)).replace("{1}", faultSays(f)); });
        if (list.length > 12) says.push(tr("and {0} more").replace("{0}", num(list.length - 12)));
        var head = k[0] === "faults" ? tr("A stress mark (U+0301) stands right after the vowel it stresses. Press to go to the next one.")
                                     : tr("One word, two stress marks: meant, or a slip? Press to go to the next one.");
        parts.push('<button type="button" class="lyr-tog lyr-warn ' + k[2] + '" data-lyr="' + k[1] + '" data-tip="' + esc(head + "\n" + says.join("\n")) + '">' +
          esc(tr(k[3]).replace("{0}", num(list.length))) + "</button>");
      });
      parts.push('<button type="button" class="lyr-tog" data-lyr="spell" aria-pressed="' + spell + '" data-tip="' + esc(tr("The browser's spelling check in the lyrics' language; press to switch it off or on")) + '">' + esc(tr("Spelling")) + "</button>");
      if (manual) parts.push('<button type="button" class="lyr-tog" data-lyr="auto" data-tip="' + esc(tr("The box grows with the words again, as it did before you drew it")) + '">' + esc(tr("Auto height")) + "</button>");
      meter.innerHTML = parts.join("");
    }

    function draw() {
      queued = false;
      var text = area.value, m = measure(text, latinOf(text, styleBox ? styleBox.value : ""));
      last = m;
      paintMeter(m);
      var spell = recall("yue2.lyrSpell") !== "off";
      area.spellcheck = spell;
      var lang = langOf(text, styleBox ? styleBox.value : "");
      if (lang) area.setAttribute("lang", lang); else area.removeAttribute("lang");
      if (!area.offsetParent) { gutter.innerHTML = ""; return; }
      // the mirror wraps the lines as the box does, so each row of the meter stands beside its line
      var cs = getComputedStyle(area);
      ["fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
       "tabSize", "wordSpacing", "fontVariantLigatures"].forEach(function (k) { mirror.style[k] = cs[k]; });
      mirror.style.width = area.clientWidth + "px";
      var rows = text.split("\n");
      mirror.innerHTML = rows.map(function (r) { return "<div>" + (esc(r) || "​") + "</div>"; }).join("");
      var top0 = area.offsetTop + parseFloat(cs.borderTopWidth), left = area.offsetLeft + area.clientWidth - 6;
      var lh = parseFloat(cs.lineHeight) || 20, scale = 12;
      m.rows.forEach(function (o) { if (!o.tag) scale = Math.max(scale, o.syl + o.bsyl); });
      Object.keys(m.rulers).forEach(function (g) { scale = Math.max(scale, Math.ceil(m.rulers[g]) + 2); });
      var W = 64, kids = mirror.children, html = [];
      m.rows.forEach(function (o, i) {
        var y = (kids[i] ? kids[i].offsetTop : i * lh) - area.scrollTop;
        if (y < -lh || y > area.clientHeight) return;
        var ruler = m.rulers[o.group];
        if (o.tag) {
          // HERESY 1168 (Viktor: «Блок Interlude не имеет текста под собою. Там счётчик не нужен»): a section with no words of
          // its own shows its name, no ruler; a tag that is no section (who sings, what the song is) shows nothing; a pause inside
          // a section its name alone, dimmed (the section's count goes on under it)
          if (o.pause) { html.push('<div class="lyr-row lyr-head lyr-pause" style="top:' + y + 'px;height:' + lh + 'px">' + esc(o.pause) + "</div>"); return; }
          if (!o.section) return;
          html.push('<div class="lyr-row lyr-head" style="top:' + y + 'px;height:' + lh + 'px">' + esc(o.group) +
            (ruler !== undefined && o.lines ? " ≈ " + esc(String(Math.round(ruler * 10) / 10)) : "") + "</div>");
          return;
        }
        if (!o.syl && !o.bsyl && (o.fault || o.two)) {   // a line of no syllables with a mark gone astray: the mark alone
          html.push('<div class="lyr-row" style="top:' + y + 'px;height:' + lh + 'px"><span class="lyr-n"><span class="lyr-x ' + (o.fault ? "bad" : "near") + '">\u00b4</span></span></div>');
          return;
        }
        if (o.empty || (!o.syl && !o.bsyl)) return;
        var off = ruler === undefined ? null : Math.abs(o.syl - ruler), cls = off === null ? "" : off <= 1 ? " ok" : off <= 3 ? " near" : " far";
        html.push('<div class="lyr-row' + cls + '" style="top:' + y + 'px;height:' + lh + 'px">' +
          '<span class="lyr-track" style="width:' + W + 'px">' +
          '<span class="lyr-bar" style="width:' + Math.round(o.syl / scale * W) + 'px"></span>' +
          (o.cb ? '<span class="lyr-cbar" style="left:' + Math.round((o.syl - o.cb) / scale * W) + "px;width:" + Math.round(o.cb / scale * W) + 'px"></span>' : "") +
          (o.bsyl ? '<span class="lyr-bbar" style="left:' + Math.round(o.syl / scale * W) + "px;width:" + Math.round(o.bsyl / scale * W) + 'px"></span>' : "") +
          (ruler !== undefined ? '<span class="lyr-ruler" style="left:' + Math.round(ruler / scale * W) + 'px;top:' + (-(lh - 6) / 2) + "px;bottom:" + (-(lh - 6) / 2) + 'px"></span>' : "") +
          '</span><span class="lyr-n">' + (o.fault || o.two ? '<span class="lyr-x ' + (o.fault ? "bad" : "near") + '">\u00b4</span>' : "") +
          o.syl + (o.bsyl ? "+" + o.bsyl : "") + "</span></div>");
      });
      gutter.style.top = top0 + "px";
      gutter.style.left = (left - 190) + "px";   // 190: a section's name and its ruler may reach left over its own short tag line
      gutter.style.height = area.clientHeight + "px";
      gutter.innerHTML = html.join("");
    }
    function later() { if (!queued) { queued = true; requestAnimationFrame(draw); } }

    area.addEventListener("input", later);
    area.addEventListener("scroll", later);
    if (styleBox) styleBox.addEventListener("input", later);
    if (window.ResizeObserver) new ResizeObserver(later).observe(area);
    window.addEventListener("ruach-lang", later);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(later);

    // drawn by hand: the height stays (and is kept); «Auto height» gives the growth back
    var drag = null;
    area.addEventListener("pointerdown", function (e) {
      var r = area.getBoundingClientRect();
      if (e.clientX > r.right - 18 && e.clientY > r.bottom - 18) drag = area.offsetHeight;
    });
    window.addEventListener("pointerup", function () {
      if (drag === null) return;
      var was = drag;
      drag = null;
      if (Math.abs(area.offsetHeight - was) < 3) return;
      area.dataset.manual = "1";
      area.style.overflowY = "auto";
      store("yue2.lyricsHeight", String(area.offsetHeight));
      later();
    });
    var kept = parseInt(recall("yue2.lyricsHeight") || "", 10);
    if (kept > 60) { area.dataset.manual = "1"; area.style.height = kept + "px"; area.style.overflowY = "auto"; }
    // HERESY 1168: to a stress mark astray: the letter and its mark selected, the line brought into view (in the box when it
    // scrolls, and in the frame or page around it when it is not seen there: under a lifted frame's sticky Generate bar too,
    // which the frame's own box reaches under; the browser itself scrolls a probe set where the line stands)
    var visit = { stress: -1, stress2: -1 };
    function goTo(f) {
      area.focus({ preventScroll: true });
      area.setSelectionRange(f.from, f.to);
      var kid = mirror.children[f.line];
      if (!kid) return;
      var y = kid.offsetTop, cs = getComputedStyle(area), bt = parseFloat(cs.borderTopWidth) || 0, lh = parseFloat(cs.lineHeight) || 20;
      if (area.scrollHeight > area.clientHeight + 1) area.scrollTop = Math.max(0, y - area.clientHeight / 3);
      var r = area.getBoundingClientRect(), k = area.offsetWidth ? r.width / area.offsetWidth : 1;
      var px = r.left + k * ((parseFloat(cs.borderLeftWidth) || 0) + (parseFloat(cs.paddingLeft) || 0) + 4), py = r.top + k * (bt + y - area.scrollTop + lh / 2);
      if (px >= 0 && py >= 0 && px < window.innerWidth && py < window.innerHeight && document.elementFromPoint(px, py) === area) return;
      var probe = document.createElement("span");
      probe.setAttribute("aria-hidden", "true");
      probe.style.cssText = "position:absolute;width:1px;visibility:hidden;pointer-events:none;left:" + area.offsetLeft + "px;top:" +
        (area.offsetTop + bt + y - area.scrollTop) + "px;height:" + lh + "px";
      wrap.appendChild(probe);
      probe.scrollIntoView({ block: "center", inline: "nearest" });
      probe.remove();
    }
    if (meter) meter.addEventListener("click", function (e) {
      var b = e.target.closest("[data-lyr]");
      if (!b) return;
      if (b.dataset.lyr === "stress" || b.dataset.lyr === "stress2") {
        var st = stressFaults(area.value), list = b.dataset.lyr === "stress" ? st.faults : st.twos;
        if (!list.length) return draw();
        visit[b.dataset.lyr] = (visit[b.dataset.lyr] + 1) % list.length;
        draw();                                       // the mirror as the text is now, before it is read for the place
        goTo(list[visit[b.dataset.lyr]]);
        return;
      }
      if (b.dataset.lyr === "spell") store("yue2.lyrSpell", recall("yue2.lyrSpell") === "off" ? null : "off");
      if (b.dataset.lyr === "auto") {
        delete area.dataset.manual;
        store("yue2.lyricsHeight", null);
        if (opts.fit) opts.fit(area);
      }
      draw();
    });
    later();
    return { draw: draw, measure: function () { return last || measure(area.value, latinOf(area.value, styleBox ? styleBox.value : "")); } };
  }

  window.HeresyLyrics = { attach: attach, measure: measure, syllables: syllables, consonantBeats: consonantBeats, groupOf: groupOf, stressFaults: stressFaults, latinOf: latinOf };
})();
