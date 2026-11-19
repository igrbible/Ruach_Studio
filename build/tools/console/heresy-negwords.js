// HERESY 2847 (Viktor 18.11.2026: «в редактор стиля в Композиторе добавь беспощадного Сторожа на ` no ` и другие всевозможные негативные слова, которыми
// попытается юзер промптить в стиле негатив. И … если хочет, хер с ним, пусть промптит, но с оверлей попапом и предупреждением, что такое делать не
// советуем, и ссылку на внутренний гайд»): the detector of negative prompting in a style, whole words and phrases, case-insensitive, in the languages
// a user may type: en no/not/without/avoid and the minus words (-drums, - drums); ru нет/без/никаких/не надо; uk без/ніяких/не треба; be без/ніякіх;
// de ohne/kein…; es sin; pt sem; fr sans; it senza; el χωρίς; ja なし/無し; zh 无/不要/没有. A URL is not read; «non-stop», «no-wave», «nobody»,
// «nocturne», «Instrumental», «piano» are not words of it. find(s) gives [{word, start, end}] in the style's own positions; has(s) says whether any.
(function (root) {
  var L = "\\p{L}\\p{N}\\p{M}_";
  var B = "(?<![" + L + "])", E = "(?![" + L + "\\-])";            // a whole word, and not the first half of a hyphened one (non-stop, no-wave, sans-serif)
  var WORDS = [
    "no", "not", "without", "avoid", "avoids", "avoiding",
    "нет", "без", "безо", "никаких", "никакой", "никакого", "никакие", "не надо", "не нужно",
    "ніяких", "ніякого", "ніякої", "не треба", "ніякіх", "ніякага", "не трэба",
    "ohne", "kein", "keine", "keinen", "keinem", "keiner", "keines",
    "sem", "sans", "senza", "χωρίς", "χωρις"
  ];
  var esc = function (w) { return w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+"); };
  var WORD_RE = new RegExp(B + "(?:" + WORDS.map(esc).join("|") + ")" + E, "giu");
  // es «sin» is English «sin» too: it counts only before a word, and not after the English words that make it the noun (about sin, the sin, no sin…)
  var SIN_RE = new RegExp(B + "sin(?=\\s+[" + L + "])" + E, "giu");
  var SIN_NOUN = /(?:^|[^\p{L}])(?:the|a|of|about|from|and|my|your|our|his|her|their|original|deadly|no|in|to|for|with)\s+$/iu;
  // the minus words: a hyphen or a minus sign at the start of the style or of a list item, then a word: «-drums», «, - drums», «rock -drums»;
  // «lo-fi», «hip-hop», «-3 dB», a dash between words («rock - fast») are not
  var MINUS_RE = /(^|[,;(\n]\s*|\s)([-\u2212])(\s?)(\p{L}[\p{L}\p{M}]*)/gu;
  // ja: なし/無し not inside a hiragana word (はなし is a story); zh: 不要, 没有, 无 not in a word of its own (无限, 无损, 无尽…)
  var JA_RE = /(?<![\u3040-\u309f])(?:なし|無し)/gu;
  var ZH_RE = /不要|没有|沒有|无(?![限损尽比数畏敌论边穷垠常极上名题法])|無(?![限損尽比数畏敵論辺窮常極上名題法し])/gu;
  var URL_RE = /\b(?:[a-z][a-z0-9+.-]*:\/\/|www\.)\S+/giu;
  function blankUrls(s) { return s.replace(URL_RE, function (m) { return " ".repeat(m.length); }); }
  function find(style) {
    var s = blankUrls(String(style == null ? "" : style)), out = [], m;
    var add = function (start, end) { out.push({ word: String(style).slice(start, end), start: start, end: end }); };
    WORD_RE.lastIndex = 0; while ((m = WORD_RE.exec(s))) add(m.index, m.index + m[0].length);
    SIN_RE.lastIndex = 0; while ((m = SIN_RE.exec(s))) if (!SIN_NOUN.test(s.slice(0, m.index))) add(m.index, m.index + 3);
    MINUS_RE.lastIndex = 0;
    while ((m = MINUS_RE.exec(s))) {
      var at = m.index + m[1].length;
      if (m[1] === " " || m[1] === "\t") { if (m[3]) continue; }   // «rock - fast»: a dash between words; «rock -drums»: a minus word
      add(at, at + m[2].length + m[3].length + m[4].length);
      MINUS_RE.lastIndex = at + 1;
    }
    JA_RE.lastIndex = 0; while ((m = JA_RE.exec(s))) add(m.index, m.index + m[0].length);
    ZH_RE.lastIndex = 0; while ((m = ZH_RE.exec(s))) add(m.index, m.index + m[0].length);
    out.sort(function (a, b) { return a.start - b.start; });
    return out.filter(function (x, i) { return !i || x.start >= out[i - 1].end; });
  }
  // the words once each, as typed (lower case), for a short list
  function words(style) {
    var seen = {}, list = [];
    find(style).forEach(function (x) { var k = x.word.toLowerCase().replace(/\s+/g, " "); if (!seen[k]) { seen[k] = 1; list.push(k); } });
    return list;
  }
  // the style as HTML, every word of it in a <mark>
  function marked(style) {
    var s = String(style == null ? "" : style), at = 0, html = "";
    var esc2 = function (t) { return t.replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
    find(s).forEach(function (x) { html += esc2(s.slice(at, x.start)) + '<mark class="neg-word">' + esc2(x.word) + "</mark>"; at = x.end; });
    return html + esc2(s.slice(at));
  }
  root.HeresyNegWords = { find: find, has: function (s) { return find(s).length > 0; }, words: words, marked: marked };
})(typeof window !== "undefined" ? window : globalThis);
