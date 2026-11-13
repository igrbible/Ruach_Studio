// HERESY 1148: the page's languages against the mock: Russian chosen, the page reloaded in it (logo words included),
// back to English whole; the code that reads its own buttons back still reads English. Muted, its own profile.
import { B, G, R, X, finish, guard, launchChrome, onReport, sleep, startMock } from "../../tools/cdp-common.mjs";
guard(90);
let passed = 0, failed = 0;
const check = (name, ok, detail) => { ok ? passed++ : failed++; console.log(`  ${ok ? G + "PASS" : R + "FAIL"}${X}  ${name}${!ok && detail ? "  (" + detail + ")" : ""}`); };
onReport(() => console.log(`\n${B}check-i18n${X}  ${failed ? R : G}${passed} passed, ${failed} failed${X}`));
const BASE = (await startMock(process.cwd() + "/tmp/mock-outputs/check-i18n")).base;
const { send, ev, waitFor, click } = await launchChrome("profile-i18n");
await send("Page.enable"); await send("Runtime.enable");
const errors = [];
await send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1000, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: BASE });
await waitFor(`document.readyState === "complete" && document.querySelectorAll("#libList .take").length >= 1`, 20000);
const enTabs = await ev(`[...document.querySelectorAll(".topbar .tabs button:not([data-module-room])")].map(b => b.textContent.trim()).join("|")`);
const enVb = await ev(`document.querySelector(".brand-full").getAttribute("viewBox")`);
check("English by default: the rooms in English, the button EN", enTabs === "Musician|Writer|Refiner|Artist|Videographer|Trainer|Librarian" &&
  (await ev(`document.getElementById("langButton").textContent`)) === "EN" && (await ev(`document.documentElement.lang`)) === "en", enTabs);
await ev(`localStorage.setItem("yue2.lang", "ru"); true`);
await send("Page.reload", {});
await sleep(300);
await waitFor(`document.readyState === "complete" && document.querySelectorAll("#libList .take").length >= 1`, 20000);
await sleep(300);
const ruTabs = await ev(`[...document.querySelectorAll(".topbar .tabs button:not([data-module-room])")].map(b => b.textContent.trim()).join("|")`);
check("after a reload in Russian: the rooms in Russian", ruTabs === "Музыкант|Писатель|Огранщик|Художник|Видеограф|Тренер|Библиотекарь", ruTabs);
check("  <html lang> is ru, the button RU, the page shown (no hold left)", (await ev(`document.documentElement.lang`)) === "ru" &&
  (await ev(`document.getElementById("langButton").textContent`)) === "RU" && (await ev(`!document.documentElement.classList.contains("i18n-wait")`)) === true);
check("  attributes too: the button's tip and label", (await ev(`document.getElementById("langButton").dataset.tip`)) === "Язык страницы" &&
  (await ev(`document.getElementById("langButton").getAttribute("aria-label")`)) === "Язык");
check("  the logo's words: РУАХ СТУДИЯ (its frame, its name)", (await ev(`document.querySelector(".brand-full").getAttribute("viewBox")`)) === (await ev(`RUACH_LOGO_WORDS.ru.viewBox`)) &&
  (await ev(`document.querySelector(".brand-logo").getAttribute("aria-label")`)) === "Руах Студия");
check("  the favicon wears Р, the name's first letter (1266)", (await ev(`document.getElementById("favicon").getAttribute("href") === RUACH_FAVICONS["Р"]`)) === true);
// what the page writes later is translated as it appears
await ev(`(() => { const b = document.createElement("button"); b.id = "i18nProbe"; b.textContent = "Save"; b.title = "Clear"; document.body.appendChild(b); return true; })()`);
await sleep(50);
check("  what the page writes later comes in Russian (text and title)", (await ev(`document.getElementById("i18nProbe").textContent`)) === "Сохранить" &&
  (await ev(`document.getElementById("i18nProbe").title`)) === "Очистить");
await ev(`document.getElementById("i18nProbe").textContent = "Unload model"; true`);
await sleep(50);
check("  and its new English again", (await ev(`document.getElementById("i18nProbe").textContent`)) === "Выгрузить модель");
await ev(`document.getElementById("i18nProbe").textContent = "Something new"; true`);
await sleep(50);
check("  text the catalog lacks stays English, whole", (await ev(`document.getElementById("i18nProbe").textContent`)) === "Something new");
await ev(`(() => { const s = document.createElement("span"); s.setAttribute("translate", "no"); s.id = "i18nMine"; s.textContent = "Save"; document.body.appendChild(s); return true; })()`);
await sleep(50);
check("  what the user wrote ([translate=no]) is left alone", (await ev(`document.getElementById("i18nMine").textContent`)) === "Save");
await ev(`document.getElementById("inRun").textContent = "Inspect again"; true`);
await sleep(50);
check("  RuachI18n.en reads a button's English back", (await ev(`RuachI18n.en(document.getElementById("inRun"))`)) === "Inspect again");
check("  the choice is kept under yue2.lang (the settings file mirrors every yue2.* key)", (await ev(`localStorage.getItem("yue2.lang")`)) === "ru");
// HERESY 1169 · 1247: a warning written as its drawn sign and its words apart (ruachSigned) keeps its translation: the catalog has it under «⚠ …»
await ev(`(() => { const p = document.createElement("p"); p.id = "i18nWarn"; window.ruachSigned(p, "\\u26a0 A name in the style is a request, not a promise."); document.body.appendChild(p); return true; })()`);
await sleep(50);
check("  a warning's words after its drawn sign come in Russian (the catalog keeps them under «⚠ …»)",
  (await ev(`document.getElementById("i18nWarn").textContent`)) === "Название в стиле — просьба, а не обещание." && (await ev(`document.querySelectorAll("#i18nWarn .warn-ico").length`)) === 1);
// back to English, whole
await ev(`RuachI18n.set("en"); true`);
await sleep(50);
const backTabs = await ev(`[...document.querySelectorAll(".topbar .tabs button:not([data-module-room])")].map(b => b.textContent.trim()).join("|")`);
check("back to English: the rooms, the logo, the probe, the lang", backTabs === enTabs && (await ev(`document.querySelector(".brand-full").getAttribute("viewBox")`)) === enVb &&
  (await ev(`document.getElementById("i18nProbe").textContent`)) === "Something new" && (await ev(`document.documentElement.lang`)) === "en", backTabs);
check("  the favicon back to R (1266)", (await ev(`document.getElementById("favicon").getAttribute("href") === RUACH_FAVICONS.R`)) === true);
check("  the button's tip back in English", (await ev(`document.getElementById("langButton").dataset.tip`)) === "The language of the page");
check("  and the warning's words back in English, its sign still drawn", (await ev(`document.getElementById("i18nWarn").textContent`)) === "A name in the style is a request, not a promise." &&
  (await ev(`document.querySelectorAll("#i18nWarn .warn-ico").length`)) === 1);
await click("#langButton");
await sleep(150);
const items = await ev(`[...document.querySelectorAll(".hm-menu .hm-label")].map(e => e.textContent).join("|")`);
// HERESY 1166: the languages offered are those with a catalog; each must show its own name, untranslated
const names = (await ev(`RuachI18n.langs.map(l => l.name).join("|")`)).split("|"), shown = items.split("|");
check("the button's menu names each language in its own words", shown[0] === "English" && shown.includes("Русский") && shown.includes("עברית") &&
      shown.every(n => names.includes(n)) && shown.join("|") === names.filter(n => shown.includes(n)).join("|"), items);
// HERESY 2331: the page in Hebrew reads right to left (heresy-i18n.js sets <html dir>, heresy-rtl.js swaps the stylesheets' sides in place and
// keeps left to right what runs in time); back in English, every rule of the page is as it was, to the letter
await ev(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); true`);
// every style rule's declarations, order-free (a family written again keeps its values, not its place in the rule's text)
const cssOf = `(() => { const out = []; const walk = (list) => { for (const r of list) { if (r.type === 1) { const d = []; for (let i = 0; i < r.style.length; i++) { const p = r.style[i]; d.push(p + ":" + r.style.getPropertyValue(p) + (r.style.getPropertyPriority(p) ? "!" : "")); } out.push(r.selectorText + "{" + d.sort().join(";") + "}"); } else if (r.cssRules && r.type !== 7) walk(r.cssRules); } };
  for (const s of document.styleSheets) { if (s.ownerNode && s.ownerNode.id === "rtlStyle") continue; try { walk(s.cssRules); } catch (e) {} } return out.join("\\n"); })()`;
const cssEn = await ev(cssOf);
await ev(`RuachI18n.set("he"); true`);
await sleep(150);
const heTabs = await ev(`[...document.querySelectorAll(".topbar .tabs button:not([data-module-room])")].map(b => b.textContent.trim()).join("|")`);
check("the page in Hebrew reads right to left: <html dir> rtl, lang he, the button HE, the rooms in Hebrew (the Musician מוזיקאי, the Artist צייר)",
  (await ev(`document.documentElement.dir`)) === "rtl" && (await ev(`document.documentElement.lang`)) === "he" &&
  (await ev(`document.getElementById("langButton").textContent`)) === "HE" && /^מוזיקאי\|כותב\|מלטש\|צייר\|וידאוגרף\|מאמן\|ספרן$/.test(heTabs), heTabs);
check("  the stylesheets' sides swapped (margin-left with margin-right…), and the player, the wave and the sliders left to right",
  (await ev(`window.RuachRtl && RuachRtl.on() && RuachRtl.swapped() > 300`)) === true &&
  (await ev(`getComputedStyle(document.querySelector(".playbar")).direction`)) === "ltr" &&
  (await ev(`getComputedStyle(document.querySelector("input[type=range]")).direction`)) === "ltr");
check("  what the user writes takes its own direction (the style's field), the Hebrew letters in Noto Sans Hebrew",
  (await ev(`getComputedStyle(document.getElementById("style")).unicodeBidi`)) === "plaintext" &&
  /^"Noto Sans Hebrew"/.test(await ev(`getComputedStyle(document.documentElement).getPropertyValue("--scripts").trim()`)));
check("  the logo's words נפחות רוח and the favicon ר", (await ev(`document.querySelector(".brand-full").getAttribute("viewBox")`)) === (await ev(`RUACH_LOGO_WORDS.he.viewBox`)) &&
  (await ev(`document.querySelector(".brand-logo").getAttribute("aria-label")`)) === "נפחות רוח" &&
  (await ev(`document.getElementById("favicon").getAttribute("href") === RUACH_FAVICONS["ר"]`)) === true);
await ev(`RuachI18n.set("en"); true`);
await sleep(150);
check("back to English from Hebrew: <html dir> ltr, nothing swapped, every rule of the stylesheets as it was",
  (await ev(`document.documentElement.dir`)) === "ltr" && (await ev(`RuachRtl.swapped()`)) === 0 && (await ev(cssOf)) === cssEn);
// HERESY 1518 (Viktor's rule: the root «раб/роб» stays out of the studio's words): every catalog the page is served with, read as the page
// reads it; no word of the root in the Russian, Ukrainian and Belarusian translations, nor «δουλ» in the Greek, by the guide checker's own rule
// (heresy/MISC/claude-i18n/guide/check_guide.py): the letters of проба, дроб, хвороба, Афробіт, перабор, коробка… are not the root.
// HERESY 2488 (Viktor 12.11.2026: «давай внесём исключения для запретных корней РАБ/РОБ. То, что действительно работает, пашет как угорелый,
// пропускаем. Карты работают, а вот LLM творит, и всё остальное творит, созидает, поэтизирует, делает, образовывает, продвигает и т.п. ОК?»):
// Russian is checked too, with one way through: a form of «работать» in the third person, the infinitive, the past or the participle
// («карта работает», «сервер не работает», «заработала», «сработало»), and only in a clause with no creative agent (the LLM, the Studio,
// a room: they create, write, compose). «работаю», «работаешь» and every other word of the root («работа», «рабочий», «обработка») never
// pass: a person does not «работать», and a noun cannot tell a card from an author. Ukrainian and Belarusian need no way through: a machine
// there «працює»/«працуе», not the root. Twin of check_guide.py's roots_kept_out: change both.
{
  const vm = await import("node:vm"), page = await (await fetch(BASE)).text(), cats = {};
  for (const m of page.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) {
    if (!/RuachI18n\.add\(/.test(m[1]) || /window\.RuachI18n\s*=/.test(m[1])) continue;
    vm.runInNewContext(m[1], { RuachI18n: { add: (l, o) => { cats[l] = Object.assign(cats[l] || {}, o); } }, window: {} });
  }
  const ROOTS = { ru: /(роб|раб)/i, uk: /(роб|раб)/i, be: /(роб|раб)/i, el: /(δουλ|δούλ)/i },
    OUT = /проб|праб|дроб|драб|траб|ерабуд|ерабор|ерабір|ерабра|бараб|^араб|храб|граб|фроб|фраб|ктроб|вороб|вароб|короб|кароб|^робк|гроб|утроб|кроб|роберт|робин|скараб/g,
    MACHINE = { ru: /^(?:(?:за|с)?работа(?:ет|ют|ть|л|ла|ло|ли|ющ[а-яё]{1,3})|срабатыва(?:ет|ют|ть|л|ла|ло|ли))$/ },
    CREATIVE = { ru: /llm|ллм|qwen|qwopus|gemma|llama|mistral|gpt|deepseek|claude|языков[\p{L}]* модел|нейросет|(?<![\p{L}])ии(?![\p{L}])|студи[яиюейё]|писател|комнат[\p{L}]* письма|музыкант|творец|творц|художник|чтец|огранщик|видеограф|библиотекар/u },
    CLAUSE = /[.;:!?()«»\n—|]|,\s+(?:но|а|и|или|пока|когда|если|хотя)\s/u;
  const keptOut = (lang, texts) => {   // the words of the kept-out root in texts, a machine form let through only outside a creative clause
    const words = new Set();
    for (const v of texts) for (const clause of (typeof v === "string" ? v : JSON.stringify(v)).split(CLAUSE)) {
      const creative = CREATIVE[lang] && clause.toLowerCase().match(CREATIVE[lang]);
      for (const w of clause.match(/[\p{L}\p{M}]+/gu) || []) {
        if (!ROOTS[lang].test(w.toLowerCase().replace(OUT, ""))) continue;
        if (MACHINE[lang] && MACHINE[lang].test(w.toLowerCase())) { if (creative) words.add(w + " (beside «" + creative[0] + "»)"); }
        else words.add(w);
      }
    }
    return [...words];
  };
  // the rule itself (2488): the machines pass, the authors and every other word of the root do not; uk «обробка» is the root, «робкий» is not
  const pass = ["Карта работает.", "Сервер не работает, перезапусти его.", "Декодер работает тайлами.", "Всё в нём работает и проверено.", "Фильтр сработал."],
    fail = ["LLM работает над текстом.", "Писатель работает над песней.", "Студия работает в другом окне.", "Qwopus работает над куплетом.", "Я работаю.", "Обработка стемов.", "Рабочая папка."];
  check("the rule of the roots itself (2488): a card, a server, a decoder, a filter that works pass; the LLM, the Writer, the Studio, Qwopus at work, «работаю», «обработка», «рабочая» fail; uk «обробка» fails, «робкий» passes",
    pass.every((t) => !keptOut("ru", [t]).length) && fail.every((t) => keptOut("ru", [t]).length) && keptOut("uk", ["Обробка стемів."]).length > 0 && !keptOut("uk", ["Робкий голос."]).length,
    JSON.stringify({ pass: pass.map((t) => keptOut("ru", [t])), fail: fail.map((t) => keptOut("ru", [t])) }));
  const kept = [];
  for (const lang of Object.keys(ROOTS)) {
    const words = keptOut(lang, Object.values(cats[lang] || {}));
    if (words.length) kept.push(lang + ": " + words.slice(0, 12).join(", "));
  }
  check("no word of the root «раб/роб» in the ru, uk and be catalogs but a machine that works (2488), nor «δουλ» in the el one (" + ["ru", "uk", "be", "el"].map(l => l + " " + Object.keys(cats[l] || {}).length).join(", ") + " entries)",
    !kept.length && ["ru", "uk", "be", "el"].every(l => Object.keys(cats[l] || {}).length > 1000), kept.join(" · "));
}
{
  const vm = await import("node:vm"), page = await (await fetch(BASE)).text(), he = {};
  for (const m of page.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) {
    if (!/RuachI18n\.add\("he"/.test(m[1])) continue;
    vm.runInNewContext(m[1], { RuachI18n: { add: (l, o) => { if (l === "he") Object.assign(he, o); } }, window: {} });
  }
  const vals = Object.values(he).map((v) => JSON.stringify(v)).join("\n");
  // HERESY 2428: niqqud and cantillation are the block's combining marks (U+0591–05BD, 05BF, 05C1, 05C2, 05C4, 05C5, 05C7); the maqaf (־ U+05BE,
  // Hebrew's hyphen), paseq (׀ 05C0), sof pasuq (׃ 05C3) and nun hafukha (׆ 05C6) between them are punctuation, and a maqaf is good Hebrew
  // (ב־Hugging Face): the night of 11.11 counted it as niqqud and three lanes went red on it
  const NIQQUD = /[\u0591-\u05bd\u05bf\u05c1\u05c2\u05c4\u05c5\u05c7]/;
  const marked = Object.entries(he).filter(([, v]) => NIQQUD.test(JSON.stringify(v))).map(([k]) => k);
  check("the Hebrew rule itself: a maqaf, paseq and sof pasuq pass; a niqqud point, a shin dot, a qamats qatan and a cantillation mark fail",
    !NIQQUD.test("ב־Hugging Face · ׀ · ׃ · ׆") && ["בְּרֵאשִׁית", "שׁ", "חׇכְמָה", "בְּרֵאשִׁ֖ית", "תֹּ֣הוּ"].every((s) => NIQQUD.test(s)) && ["\u05bf", "\u05c4", "\u05c7"].every((c) => NIQQUD.test(c)));
  check("the Hebrew catalog (" + Object.keys(he).length + " entries): no niqqud or cantillation, the brand נפחות רוח, the rooms מוזיקאי and קריין",
    Object.keys(he).length > 8000 && !marked.length && he["Musician"] === "מוזיקאי" && /נפחות רוח/.test(vals) && he["Narrator"] === "קריין", marked.slice(0, 6).join(" · "));
}
// HERESY 2430: two keys that read one way where the page means another. «Whisper» is the model that listens (Engine → Models, the lab's runs,
// the bar), a name never translated, so no catalog holds it as a key: the voice type is «Whispered voice». HERESY 2443 (Viktor 12.11.2026:
// «Кнопка LUT оставь на английском везде… законная аббревиатура»; «Тот же "LoRA"»): the Videographer's button reads LUT, so «Look» is the
// Artist's «look it up» again; and an abbreviation or a product's, format's or model's name in a catalog's English stays itself, in Latin letters,
// in every language (units, dB and Hz, keep each language's own symbols).
{
  const vm = await import("node:vm"), page = await (await fetch(BASE)).text(), cats = {};
  for (const m of page.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) {
    if (!/RuachI18n\.add\(/.test(m[1]) || /window\.RuachI18n\s*=/.test(m[1])) continue;
    vm.runInNewContext(m[1], { RuachI18n: { add: (l, o) => { cats[l] = Object.assign(cats[l] || {}, o); } }, window: {} });
  }
  const langs = Object.keys(cats).filter((l) => Object.keys(cats[l]).length > 1000);
  const whisper = langs.filter((l) => "Whisper" in cats[l]), voice = langs.filter((l) => !cats[l]["Whispered voice"]);
  check("«Whisper», a model's name, is no catalog's key; the voice type «Whispered voice» in every language (" + langs.length + " catalogs)",
    langs.length >= 12 && !whisper.length && !voice.length, "Whisper in " + whisper.join(", ") + "; no Whispered voice in " + voice.join(", "));
  const lut = langs.filter((l) => "Look: {0}" in cats[l] || ("LUT: {0}" in cats[l] && !/^LUT\s?[:：]/.test(cats[l]["LUT: {0}"])) || cats[l]["Look"] === "Лук");
  check("the LUT button reads LUT in every language, «Look» no longer its key (ru «Look» = «" + (cats.ru || {})["Look"] + "»)", langs.length >= 12 && !lut.length, lut.join(", "));
  const KEEP = ["LUT", "LoRA", "VAE", "DAW", "MIDI", "BPM", "LUFS", "GPU", "CPU", "VRAM", "RAM", "ABC", "SFZ", "FX", "EQ", "NAR", "AR", "YuE2", "SheetSage2",
    "Higgs", "Pianoteq", "ComfyUI", "SeedVR2", "MiniMax", "Qwen", "FLAC", "MP3", "WAV", "ZIP", "Civitai", "Hugging Face"];
  const word = (t) => new RegExp("(^|[^A-Za-z0-9_])" + t.replace(/ /g, " ") + "(?![A-Za-z0-9_])");
  const lost = [];
  for (const l of langs) for (const [k, v] of Object.entries(cats[l])) for (const t of KEEP) {
    if (typeof v === "string" && word(t).test(k) && !new RegExp("(^|[^A-Za-z0-9_])" + t).test(v)) lost.push(l + " " + t + " «" + v.slice(0, 48) + "»");
  }
  check("abbreviations and names stay themselves in Latin letters in every catalog (" + KEEP.length + " of them: LUT, LoRA, VAE, GPU, VRAM, EQ…)", langs.length >= 12 && !lost.length,
    lost.length + ": " + lost.slice(0, 6).join(" · "));
}
await finish(failed ? 1 : 0);
