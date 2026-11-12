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
// reads it; no word of the root in the Ukrainian and Belarusian translations, nor «δουλ» in the Greek, by the guide checker's own rule
// (heresy/MISC/claude-i18n/guide/check_guide.py): the letters of проба, дроб, хвороба, Афробіт, перабор… are not the root
{
  const vm = await import("node:vm"), page = await (await fetch(BASE)).text(), cats = {};
  for (const m of page.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) {
    if (!/RuachI18n\.add\(/.test(m[1]) || /window\.RuachI18n\s*=/.test(m[1])) continue;
    vm.runInNewContext(m[1], { RuachI18n: { add: (l, o) => { cats[l] = Object.assign(cats[l] || {}, o); } }, window: {} });
  }
  const ROOTS = { uk: /(роб|раб)/i, be: /(роб|раб)/i, el: /(δουλ|δούλ)/i }, OUT = /проб|праб|дроб|драб|траб|ерабуд|ерабор|ерабір|ерабра|бараб|^араб|храб|граб|фроб|фраб|ктроб|вороб|вароб/g;
  const kept = [];
  for (const [lang, root] of Object.entries(ROOTS)) {
    const words = new Set();
    for (const v of Object.values(cats[lang] || {})) for (const w of JSON.stringify(v).match(/[\p{L}\p{M}]+/gu) || []) if (root.test(w.toLowerCase().replace(OUT, ""))) words.add(w);
    if (words.size) kept.push(lang + ": " + [...words].slice(0, 12).join(", "));
  }
  check("no word of the root «раб/роб» in the uk and be catalogs, nor «δουλ» in the el one (" + ["uk", "be", "el"].map(l => l + " " + Object.keys(cats[l] || {}).length).join(", ") + " entries)",
    !kept.length && ["uk", "be", "el"].every(l => Object.keys(cats[l] || {}).length > 1000), kept.join(" · "));
}
{
  const vm = await import("node:vm"), page = await (await fetch(BASE)).text(), he = {};
  for (const m of page.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) {
    if (!/RuachI18n\.add\("he"/.test(m[1])) continue;
    vm.runInNewContext(m[1], { RuachI18n: { add: (l, o) => { if (l === "he") Object.assign(he, o); } }, window: {} });
  }
  const vals = Object.values(he).map((v) => JSON.stringify(v)).join("\n");
  check("the Hebrew catalog (" + Object.keys(he).length + " entries): no niqqud or cantillation, the brand נפחות רוח, the rooms מוזיקאי and קריין",
    Object.keys(he).length > 8000 && !/[\u0591-\u05c7]/.test(vals) && he["Musician"] === "מוזיקאי" && /נפחות רוח/.test(vals) && he["Narrator"] === "קריין");
}
await finish(failed ? 1 : 0);
