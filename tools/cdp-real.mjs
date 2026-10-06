// The console page against the REAL yue-server. Run it through tools/test-real.sh, which gives it an
// isolated test library (with a labelled synthetic fixture, so a fresh install has a take to list), its
// own CPU-only server on a free port, and cleans up. By hand: start a GPU-hidden server, then
//   node tools/cdp-real.mjs http://127.0.0.1:<port>/
// Loads the embedded page, checks it reads the real /props, /settings, /library and /hardware, then makes
// a 1-second song through the form (Direct mode, 2 ODE steps, Legacy VAE, Metal slider) and opens it.
import { writeFileSync, mkdirSync } from "node:fs";
import { B, D, G, R, TMP, X, finish, guard, launchChrome, onReport, onStop, sleep, until } from "./cdp-common.mjs";

const OUT = TMP + "/shots/real";
const BASE = (process.argv[2] || "http://127.0.0.1:41869/").replace(/\/?$/, "/");
const t0 = Date.now();
const TITLE = "Page check " + String(t0).slice(-5);   // unique per run
guard(420);   // an error, a stalled DevTools command, Ctrl-C or 7 minutes: Chrome stops, its profile is deleted
mkdirSync(OUT, { recursive: true });

const cdp = await launchChrome("profile-real");
const { send, ev, waitFor, click, errors } = cdp;
const requests = [];
cdp.on((d) => {
  if (d.method === "Network.requestWillBeSent") requests.push(d.params.request.method + " " + d.params.request.url.replace(BASE, "/"));
});
// screenshots only on request (YUE2_SHOTS=1), as in the page suite
const SHOTS_ON = process.env.YUE2_SHOTS === "1";
const shot = async (n) => { if (!SHOTS_ON) return; const r = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(`${OUT}/${n}.png`, Buffer.from(r.result.data, "base64")); };
const setValue = (sel, value) => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.value = ${JSON.stringify(value)};
  e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); return true; })()`);
const engineOpen = (open) => waitFor(`document.getElementById("view-engine").classList.contains("is-hidden") === ${!open}`, 5000, 50);
let passed = 0, failed = 0;
const check = (name, ok, detail) => { ok ? passed++ : failed++;
  console.log(`  ${ok ? G + "PASS" : R + "FAIL"}${X}  ${name}${detail !== undefined ? D + "  (" + String(detail).slice(0, 200) + ")" + X : ""}`); };
// every ending prints the counts (tools/test-real.sh reads them); a run that stops early counts as a failed check
onReport(() => console.log(`\n${failed ? R : G}${passed} passed, ${failed} failed${X}  ${D}${((Date.now() - t0) / 1000).toFixed(0)} s, ` +
                           `${errors.length} page errors${SHOTS_ON ? ", screenshots in tmp/shots/real" : ""}${X}`));
onStop((message) => check("the run stopped early: " + message, false));

await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1536, height: 730, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: BASE });
console.log(`${B}the page served by the real server${X}`);
const loaded = await waitFor(`document.querySelectorAll("#decoders input").length >= 3 && document.querySelectorAll("#sliderChips [data-slider]").length`, 20000);
check("page loads from the server (from disk)", !!loaded, (await ev("document.title")));
check("three VAEs from /props", (await ev(`document.querySelectorAll("#decoders input").length`)) === 3);
check("16 sliders from /props", (await ev(`document.querySelectorAll("#sliderChips [data-slider]").length`)) === 16);
const takes = await waitFor(`document.querySelectorAll("#libList .take-title").length`, 10000);
check("library lists the takes on disk (on a fresh install: test-real.sh's synthetic fixture)", takes >= 1, `${takes} takes`);
await click("#engineToggle");
await engineOpen(true);
const noPrec = await ev(`!document.getElementById("setPrecision") && !document.getElementById("f32Toggle")`);
check("no F32 option in the page, and the server's /settings has no precision", noPrec === true && !("precision" in (await (await fetch(BASE + "settings")).json())));
await sleep(250);   // the Engine button's background fades in (.13 s) before the screenshot
await shot("1-engine"); await click("#engineToggle"); await engineOpen(false);

console.log(`${B}a real song through the form (CPU, 1 s, 2 steps)${X}`);
await setValue("#title", TITLE);
await setValue("#style", "English, male vocal, heavy metal, electric guitar");
await setValue("#lyrics", "[verse]\nHello from the other room\n");
await click('input[name="cot"][value="off"]');
await click("#advDrawer summary");
await waitFor(`document.getElementById("advDrawer").open`, 3000, 50);
await setValue("#maxLength", "1"); await setValue("#odeSteps", "2");
await click('#decoders input[value="legacy"]');
await click('#sliderChips [data-slider="metal"]');
const before = requests.length;
await click("#generateBtn");
const posted = await until(() => requests.slice(before).some((r) => r.startsWith("POST /synth")), 10000);
check("Generate posted /synth", !!posted);
// a screenshot while it runs: once a stage shows as running (model loading comes first on the CPU)
await waitFor(`!!document.querySelector("#stages .stage[data-s=running]") || document.getElementById("runState")?.dataset.s === "done"`, 60000, 500);
await shot("2-running");
// the server's own library is the truth: wait until it holds the finished take
const saved = await until(async () => (await (await fetch(BASE + "library")).json()).takes.find((t) => t.title === TITLE), 300000, 3000);
check("the song finished and was saved by the server", !!saved, saved ? `${saved.name}, ${((Date.now() - t0) / 1000).toFixed(0)} s` : "none");
// downloads are named after the song by the server itself; names=library keeps the library name (one byte fetched each)
if (saved) {
  const byName = async (extra) => (await fetch(`${BASE}library/audio?name=${encodeURIComponent(saved.name)}${extra}`, { headers: { Range: "bytes=0-0" } }))
    .headers.get("content-disposition") || "";
  const songName = TITLE.replace(/[\u0000-\u001f\u007f\\/:*?"<>|\s]+/g, " ").replace(/[\s.]+$/, "").trim() + ".wav";
  const [titled, dated] = [await byName(""), await byName("&names=library")];
  check("the server names the download after the song, or by its library name when asked", titled.includes(`filename="${songName}"`) &&
    dated.includes(`filename="${saved.name}.wav"`), `${titled} | ${dated}`);
}
const shown = await waitFor(`!!document.querySelector('#libList [data-name="${saved?.name}"], #libList [data-take="${saved?.name}"]') ||
  [...document.querySelectorAll("#libList .take")].some(e => e.textContent.includes(${JSON.stringify(TITLE)}) && !/running|queued/i.test(e.className))`, 20000);
check("the page's library shows it", !!shown);
await ev(`(() => { const rows = [...document.querySelectorAll("#libList .take")].filter(e => e.textContent.includes(${JSON.stringify(TITLE)}) && !/running|queued/i.test(e.className));
  const t = rows[0] && (rows[0].querySelector(".take-title") || rows[0]); t && t.click(); })()`);
// the song page is loaded: its title, and the details card with the VAE and the request's settings
const opened = await waitFor(`document.getElementById("takeTitle")?.textContent === ${JSON.stringify(TITLE)} &&
  !!document.querySelector('#metaGrid [data-field="VAE"]')?.dataset.value &&
  (() => { const m = document.querySelector('#metaGrid [data-field="Composition"]'); return !m || m.dataset.value !== "…"; })()`, 20000, 200);
const cells = await ev(`[...document.querySelectorAll("#metaGrid > *")].map(e => e.innerText.replace(/\\s+/g, " ").trim()).join(" | ")`);
check("song page: VAE Legacy", !!opened && /VAE Legacy/i.test(cells || ""), cells);
check("song page: slider Metal", /Metal/i.test(cells || ""));
check("song page: no precision row on a new song", !!opened && !/Precision/i.test(cells || ""), cells);
check("waveform came from /library/peaks", !!(await until(() => requests.some((r) => r.startsWith("GET /library/peaks")), 10000)));
await shot("3-take");
check("no script errors", errors.length === 0, errors.join(" / ") || "none");
await finish(failed ? 1 : 0);   // prints the counts, stops Chrome
