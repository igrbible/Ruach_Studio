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
const enTabs = await ev(`[...document.querySelectorAll(".topbar .tabs button")].map(b => b.textContent.trim()).join("|")`);
const enVb = await ev(`document.querySelector(".brand-full").getAttribute("viewBox")`);
check("English by default: the rooms in English, the button EN", enTabs === "Creator|Writer|Refiner|Artist|Librarian|Trainer" &&
  (await ev(`document.getElementById("langButton").textContent`)) === "EN" && (await ev(`document.documentElement.lang`)) === "en", enTabs);
await ev(`localStorage.setItem("yue2.lang", "ru"); true`);
await send("Page.reload", {});
await sleep(300);
await waitFor(`document.readyState === "complete" && document.querySelectorAll("#libList .take").length >= 1`, 20000);
await sleep(300);
const ruTabs = await ev(`[...document.querySelectorAll(".topbar .tabs button")].map(b => b.textContent.trim()).join("|")`);
check("after a reload in Russian: the rooms in Russian", ruTabs === "Творец|Писатель|Огранщик|Художник|Библиотекарь|Тренер", ruTabs);
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
const backTabs = await ev(`[...document.querySelectorAll(".topbar .tabs button")].map(b => b.textContent.trim()).join("|")`);
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
check("the button's menu names each language in its own words", shown[0] === "English" && shown.includes("Русский") &&
      shown.every(n => names.includes(n)) && shown.join("|") === names.filter(n => shown.includes(n)).join("|"), items);
await finish(failed ? 1 : 0);
