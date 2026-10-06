// Clean screenshots of the page for the README and the kit (docs/screenshots): the stand-in server
// (tools/mock_server.py) with this install's real LoRAs, sliders and their sources, a plain GPU name, and
// one made-up song made through the page. No test fixtures, no toasts. Headless Chrome, nothing outside tmp/.
//
//   node tools/screenshots.mjs                          uses tmp/showcase/props.json, saved earlier
//   node tools/screenshots.mjs http://127.0.0.1:41867/  first saves that server's /props there (one read-only GET)
//
// Writes tmp/shots/showcase/: compose-page, song-page, song-page-narrow, engine-page, engine-tiles,
// engine-about, theme-picker (.png). tools/make-kit.sh copies them into the kit.
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { B, C, D, G, R, StopError, TMP, X, Y, ensurePage, finish, guard, launchChrome, sleep, startMock, stop } from "./cdp-common.mjs";

const OUT = TMP + "/shots/showcase", PROPS = TMP + "/showcase/props.json";
const t0 = Date.now();
guard(120);   // an error, a stalled DevTools command, Ctrl-C or 120 s: Chrome and the mock stop
mkdirSync(OUT, { recursive: true });
mkdirSync(dirname(PROPS), { recursive: true });

// ---------------------------------------------------------------- preflight
const pageNote = ensurePage();
if (pageNote) console.log(`${Y}note${X}  ${pageNote}`);
if (process.argv[2]) {
  const url = process.argv[2].replace(/\/?$/, "/") + "props";
  let text;
  try { text = await (await fetch(url)).text(); JSON.parse(text).loras.length; } catch (e) { await stop(`could not read ${url}: ${e.message}`); }
  writeFileSync(PROPS, text);
  console.log(`${G}saved${X}  ${url} -> tmp/showcase/props.json`);
}
if (!existsSync(PROPS)) await stop("no tmp/showcase/props.json: run once with a running server's address, e.g. node tools/screenshots.mjs http://127.0.0.1:41867/");
const props = JSON.parse(readFileSync(PROPS, "utf8"));

// ------------------------------------------------------------- mock server
const { base: BASE } = await startMock(TMP + "/mock-outputs/showcase", ["--props", PROPS, "--gpu-name", "32 GB card"]);

// ------------------------------------------------------------------ chrome
const { send, ev, waitFor: poll, errors } = await launchChrome("profile-showcase", ["--hide-scrollbars"]);
// every wait here must succeed: a missing condition stops the run, naming it
const waitFor = async (expr, what, timeout = 15000) => {
  if (!(await poll(expr, timeout, 100))) throw new StopError("waited " + timeout / 1000 + " s for " + what);
};
const size = (width, height) => send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
const shots = [];
const shot = async (name) => {
  await ev(`document.querySelectorAll(".toast").forEach(t => t.remove()); true`);
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 2, y: 2 });   // no hover tips, no previews
  await sleep(250);   // hover styles and fades (.13-.2 s) settle before the picture
  const r = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.result.data, "base64"));
  shots.push(name);
};

// ------------------------------------------------------------------ pages
await send("Page.enable");
await send("Runtime.enable");
await size(1920, 960);
await send("Page.navigate", { url: BASE });
await waitFor(`document.readyState === "complete" && document.querySelectorAll("#decoders input").length === 3 &&
  document.querySelectorAll("#libList .take").length >= 3 && document.getElementById("logState").textContent === "live"`, "the page to load");
// the web fonts reflow the page when they land: the pictures wait for them (offline they never come)
try {
  await waitFor(`(() => { const l = document.querySelector('link[href*="fonts.googleapis.com/css2"]');
    return !l || (l.media === "all" && document.fonts.status === "loaded"); })()`, "the web fonts", 10000);
} catch { /* offline: the fallback fonts it is */ }

// a song in the form: the Female slider, one LoRA, the default VAE
const lora = (props.loras.find((l) => /sv_billie/.test(l.id)) || props.loras.find((l) => !l.error) || {}).id;
await ev(`(() => { const set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event("input", { bubbles: true })); };
  set("title", "Last Train Home");
  set("style", "English, indie folk, warm female voice, acoustic guitar, soft piano, brushed drums, 84 BPM");
  set("lyrics", "[Verse]\\nPlatform lights are humming low\\nThe board says ten past twelve\\nI kept your scarf, I kept the ticket\\nKept the rest all to myself\\n\\n" +
    "[Chorus]\\nOh the last train home\\nRolls on without me\\nOne more night alone\\nWhere the tracks run out to sea\\n\\n" +
    "[Verse]\\nEvery window holds a stranger\\nEvery stranger holds a name\\nI could call you from the station\\nBut the silence sounds the same\\n\\n" +
    "[Chorus]\\nOh the last train home\\nRolls on without me\\nOne more night alone\\nWhere the tracks run out to sea");
  document.querySelector('#sliderChips [data-slider="female"]')?.click();
  const s = document.querySelector('#sliderActive input[data-strength="female"]'); if (s) { s.value = "0.5"; s.dispatchEvent(new Event("input", { bubbles: true })); }
  ${lora ? `document.querySelector('#loraPicker [data-lora-chip="${lora}"]')?.click();` : ""}
  document.getElementById("view-compose").scrollTop = 0; return true; })()`);
await shot("compose-page");

await ev(`document.getElementById("generateBtn").click(); true`);
await waitFor(`!document.getElementById("takeBody").classList.contains("is-hidden") && document.getElementById("takeTitle").textContent === "Last Train Home"`, "the song to finish", 30000);
await waitFor(`(() => { const m = document.querySelector('#metaGrid [data-field="Composition"]'); return m && m.dataset.value !== "…"; })()`, "the song details");
// the waveform drawn across the bar (as cdp-console checks it), and the score's ABC in place
await waitFor(`(() => { const c = document.getElementById("wave"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  let cols = 0; for (let i = 0; i < c.width; i++) { for (let j = 0; j < c.height; j++) { if (d[(j * c.width + i) * 4 + 3] > 0) { cols++; break; } } } return cols > c.width * 0.6; })()`, "the waveform", 8000);
await poll(`document.getElementById("scoreAbc").textContent.startsWith("X:1")`, 4000, 100);
await ev(`document.getElementById("view-take").scrollTop = 0; true`);
await shot("song-page");
await size(1280, 800);
await sleep(400);   // the take column re-lays out and redraws its waveform for the new width
await shot("song-page-narrow");
await size(1920, 960);
await sleep(300);   // and back, before the Engine page opens

await ev(`document.getElementById("engineToggle").click(); true`);
await waitFor(`!document.getElementById("view-engine").classList.contains("is-hidden")`, "the Engine page");
await shot("engine-page");
await ev(`document.getElementById("loraCard").scrollIntoView({ block: "center", behavior: "instant" }); true`);
await shot("engine-tiles");
// the very end, so the About card's last line clears the player bar
await ev(`(() => { for (const e of [document.getElementById("view-engine"), document.scrollingElement]) e.scrollTop = e.scrollHeight; return true; })()`);
await shot("engine-about");
await ev(`document.getElementById("engineBack").click(); true`);
await waitFor(`document.getElementById("view-engine").classList.contains("is-hidden")`, "the Engine page to close");

await ev(`document.getElementById("themeButton").click(); true`);
await waitFor(`YueThemes.isOpen()`, "the theme picker");
await shot("theme-picker");
await ev(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); true`);

// ------------------------------------------------------------------ report
const kb = shots.map((n) => statSync(`${OUT}/${n}.png`).size / 1024);
console.log(`${B}screenshots${X}  ${G}${shots.length}${X} in ${C}tmp/shots/showcase${X}  ${D}${shots.join(", ")}${X}`);
console.log(`${B}stats${X}  ${props.loras.length} LoRAs and ${props.sliders.length} sliders from ${props.version}, ` +
            `${Math.round(kb.reduce((a, b) => a + b, 0))} KB, page errors ${errors.length ? R + errors.length + X + " (" + errors.join(" | ") + ")" : G + "0" + X}, ` +
            `${((Date.now() - t0) / 1000).toFixed(1)} s`);
await finish(errors.length ? 1 : 0);   // stops Chrome and the mock
