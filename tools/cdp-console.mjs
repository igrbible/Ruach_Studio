// Headless checks of the console page against the mock server (tools/mock_server.py).
// Starts its own mock on a free port with an empty library under tmp/, drives
// headless Chrome over the DevTools protocol, and stops both by PID at the end
// (also on a failure, a stalled DevTools command, Ctrl-C or the 240 s limit).
//
//   node tools/cdp-console.mjs                 # the page is build/tools/public/index.html: see ensurePage in cdp-common.mjs
//   node tools/cdp-console.mjs http://127.0.0.1:41869/   # an already running mock instead
//
// Nothing is written outside the project: Chrome's HOME/XDG dirs and TMPDIR sit in
// tmp/chrome-home, screenshots land in tmp/shots/console.
import { readFileSync, writeFileSync, existsSync, rmSync, mkdirSync, cpSync } from "node:fs";
import { resolve } from "node:path";
import { B, C, D, G, R, ROOT, TMP, X, Y, ensurePage, finish, guard, launchChrome, onReport, onStop, sleep, startMock } from "./cdp-common.mjs";

const OUT = TMP + "/shots/console";
const t0 = Date.now();
guard(600);   // HERESY 1296–1299: 550 checks outgrew 240 s; 2.0.0-rc5: 652 checks in 326 s outgrew 330 (a clean clone ran out at 648)
mkdirSync(OUT, { recursive: true });

// ---------------------------------------------------------------- preflight
const pageNote = ensurePage();
if (pageNote) console.log(`${Y}note${X}  ${pageNote}`);

// ------------------------------------------------------------- mock server
// its own, on a free port with a fresh demo library; or the running one named on the command line
const BASE = process.argv[2] ? process.argv[2].replace(/\/?$/, "/") : (await startMock(TMP + "/mock-outputs/cdp")).base;
const mockGet = async (path) => (await fetch(BASE + path)).json();
const mockClear = () => fetch(BASE + "mock/clear", { method: "POST" });

// ------------------------------------------------------------------ chrome
const cdp = await launchChrome("profile-console", ["--autoplay-policy=no-user-gesture-required"]);
const { send, ev, waitFor, click, errors } = cdp;
cdp.on((d) => {
  if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") errors.push("console.error: " + d.params.args.map((a) => a.value ?? a.description).join(" "));
  if (d.method === "Page.javascriptDialogOpening") send("Page.handleJavaScriptDialog", { accept: true }).catch(() => {});
});
// screenshots only on request (YUE2_SHOTS=1): the kit and the README take theirs from tools/screenshots.mjs
const SHOTS_ON = process.env.YUE2_SHOTS === "1";
let shots = 0;
const shot = async (name) => {
  if (!SHOTS_ON) return;
  const r = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.result.data, "base64"));
  shots++;
};
const wheel = async (x, y, dy) => {
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await send("Input.dispatchMouseEvent", { type: "mouseWheel", x, y, deltaX: 0, deltaY: dy });
  await sleep(250);   // the wheel's scroll lands over the next frames
};
let lastHover = { x: 0, y: 0 };
// the tip fades in: it counts as shown once it is on, visible and fully faded in (its text reads empty until then)
const tipOn = `(() => { const t = document.querySelector(".tip"); if (!t || !t.classList.contains("is-on")) return false;
  const c = getComputedStyle(t); return c.visibility === "visible" && c.opacity === "1"; })()`;
const hoverOn = async (selector) => {
  let box = await ev(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null; e.scrollIntoView({ block: "center" });
    const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
  if (!box) return null;
  await sleep(120);   // the scroll into view fires its scroll event a frame later, and a scroll closes a tip: let it pass first
  // measured again until it stands still: a long scroll into view (far down the form) runs past 120 ms, a late font or a
  // reflow moves things, and each would send the mouse elsewhere or close the tip as it lands
  const where = `(() => { const b = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`;
  for (let i = 0; i < 20; i++) {
    const now = await ev(where);
    if (!now) break;
    const still = Math.abs(now.x - box.x) < 0.5 && Math.abs(now.y - box.y) < 0.5;
    box = now;
    if (still) break;
    await sleep(60);
  }
  lastHover = box;
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: box.x, y: box.y });
  await waitFor(tipOn, 1000, 50);
  return ev(`(() => { const t = document.querySelector(".tip"), b = t.getBoundingClientRect(), s = getComputedStyle(t);
    return { on: t.classList.contains("is-on") && s.visibility === "visible", text: t.innerText, left: b.left, right: b.right, top: b.top, bottom: b.bottom, w: innerWidth, h: innerHeight }; })()`);
};
const inView = (t) => t && t.left >= 0 && t.right <= t.w && t.top >= 0 && t.bottom <= t.h;
// HERESY 1167: the top bar is tall at a page's top (from 1660 px) and its height moves for 0.22 s: wait it out before measuring
const barStill = () => waitFor(`!document.getAnimations().some(a => a.transitionProperty === "--bar-h" && a.playState === "running")`, 2000, 50);
const synthBodies = async () => (await mockGet("mock/requests")).filter((r) => r.path === "/synth").map((r) => r.body);
// the song page shows this take (its card is the active one)
const showsTake = (name) => waitFor(`document.querySelector("#libList .take.is-active")?.dataset.name === ${JSON.stringify(name)}`, 4000, 50);
const engineOpen = (open) => waitFor(`document.getElementById("view-engine").classList.contains("is-hidden") === ${!open}`, 4000, 50);
const toastSays = (re, timeout = 5000) => waitFor(`[...document.querySelectorAll(".toast")].some(t => ${re}.test(t.textContent))`, timeout, 50);

// ----------------------------------------------------------------- results
const lines = [];
let passed = 0, failed = 0, skipped = 0;
const section = (name) => lines.push(`${C}${B}${name}${X}`);
const check = (name, ok, detail) => {
  ok ? passed++ : failed++;
  lines.push(`  ${ok ? G + "PASS" : R + "FAIL"}${X}  ${name}${detail !== undefined && detail !== "" ? D + "  (" + String(detail).slice(0, 220) + ")" + X : ""}`);
};
const skip = (name, why) => { skipped++; lines.push(`  ${Y}SKIP${X}  ${name}${D}  (${why})${X}`); };
function report() {
  console.log(lines.join("\n"));
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n${B}cdp-console${X}  ${failed ? R : G}${passed} passed, ${failed} failed${X}${skipped ? `, ${Y}${skipped} skipped${X}` : ""}` +
              `  ${D}${secs} s · ${errors.length} page errors · ${SHOTS_ON ? shots + " screenshots in tmp/shots/console · " : ""}mock ${BASE}${X}`);
}
// from here on every ending prints the report; a run that stops early counts that as a failed check
onReport(report);
onStop((message) => check("the run stopped early: " + message, false));

await send("Page.enable");
await send("Runtime.enable");
// the profile is new and empty for every run, so nothing is stored from an earlier one
// Every load waits for the new document: the old one is marked first, so a
// condition that was already true before the reload cannot pass for it.
// The web fonts load beside the page and reflow the text when they land; positions measured before that
// are stale by the time the mouse arrives. Wait for them (offline they never come: go on after 10 s).
const fontsLanded = `(() => { const l = document.querySelector('link[href*="fonts.googleapis.com/css2"]');
  return !l || (l.media === "all" && document.fonts.status === "loaded"); })()`;
const navigate = async (libraryRows) => {
  await ev(`window.__stale = true`);
  await send("Page.navigate", { url: BASE });
  const ready = await waitFor(`!window.__stale && document.readyState === "complete" && document.querySelectorAll("#decoders input").length === 3 &&
    document.querySelectorAll("#libList .take").length >= ${libraryRows} && document.getElementById("logState").textContent === "live"`, 30000);   // HERESY 1167: a fresh tree's first page waits for its stand-in library
  await waitFor(fontsLanded, 10000, 100);
  // HERESY 1009, 1040: the studio plays on down the list and plays a take on a click, by default; these checks are the Kit's,
  // written for a click that opens and a take that stops at its end, so both are off for them (heresy/tools/check-player.mjs
  // checks the studio's own player, on a fresh page)
  // HERESY 1167: and a song made here plays when it is done (Play new takes): off for them too
  await ev(`localStorage.setItem("yue2.playOn", "off"); localStorage.setItem("yue2.clickPlay", "off"); localStorage.setItem("yue2.playNew", "off"); localStorage.setItem("yue2.askScore", "off"); true`);
  return ready;
};
const boot = () => navigate(3);
// HERESY 1057: the studio asks in its own dialog, not the browser's confirm(); this answers it as the dialog handler above
// answers the browser's (yes by default)
// HERESY 1167: answered once it is shown (its frame passed), as a hand would: a Yes clicked in the very frame the dialog
// was made in raced its opening (Clears dialog stayed, and the next dialogs answer went to it)
const answerDialog = async (yes = true) => {
  if (!(await waitFor(`!!document.querySelector(".hd-back.is-on:not(.is-leaving) .hd-yes")`, 3000, 50))) return false;
  await click(yes ? ".hd-back .hd-yes" : ".hd-back .hd-no");
  if (!(await waitFor(`!document.querySelector(".hd-back:not(.is-leaving)")`, 1000, 50))) {
    console.log("  (a dialog stayed after its answer: answered again)");
    await click(yes ? ".hd-back:not(.is-leaving) .hd-yes" : ".hd-back:not(.is-leaving) .hd-no");
    await waitFor(`!document.querySelector(".hd-back:not(.is-leaving)")`, 2000, 50);
  }
  return true;
};

// ================================================================== layout
const measure = `(() => { const r = (id) => document.getElementById(id).getBoundingClientRect();
  const pb = r("playbar").top, ws = document.querySelector(".workspace").getBoundingClientRect();
  return { vh: innerHeight, doc: document.scrollingElement.scrollHeight, pb: Math.round(pb), wsTop: Math.round(ws.top), wsBottom: Math.round(ws.bottom),
    bar: Math.round(document.querySelector(".topbar").getBoundingClientRect().bottom),
    gen: Math.round(r("generateBtn").bottom), libBottom: Math.round(document.querySelector(".lib-list").getBoundingClientRect().bottom) }; })()`;
for (const [w, h] of [[1536, 730], [1920, 960]]) {
  const tag = `${w}x${h}`;
  section(`layout ${tag}`);
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  const ready = await boot();
  check("page loads: VAEs, library and the log stream are up", !!ready);
  check("no script errors while loading", errors.length === 0, errors.join(" | ") || "none");
  const closed = await ev(measure);
  if (tag === "1920x960") {
    const idle = await ev(`({ text: document.getElementById("statusText").textContent, s: document.getElementById("statusPill").dataset.s,
      w: Math.round(document.getElementById("statusPill").getBoundingClientRect().width), dl: document.querySelectorAll("#playbar a[download]").length })`);
    check("the player bar's status says Idle before anything runs (a pill where the downloads were)", idle.text === "Idle" && idle.s === "idle" && idle.dl === 0, JSON.stringify(idle));
    // HERESY 1119: the bar carries the studio's logo; the model's and the engine's links moved to About (1026), checked there
    const brand = await ev(`(() => { const b = document.querySelector(".brand"); return b && { logo: !!b.querySelector("svg"), label: b.getAttribute("aria-label") || b.querySelector("[aria-label]")?.getAttribute("aria-label") || "", links: b.querySelectorAll("a").length }; })()`);
    check("the bar's brand is the studio's logo (the YuE2 and engine links live in About)", !!brand && brand.logo, JSON.stringify(brand));
  }
  check("page height fits the window", closed.doc <= closed.vh && closed.wsBottom <= closed.pb + 1, `doc ${closed.doc} / window ${closed.vh}, workspace ends ${closed.wsBottom}, player at ${closed.pb}`);
  await shot(`${tag}-1-page`);
  await click("#engineToggle");
  await engineOpen(true);
  await sleep(200);   // the Engine button's lit background fades in (.13 s); the probe below compares its colour
  await barStill();
  await shot(`${tag}-2-engine-open`);
  const engineProbe = `(() => { const ws = document.querySelector(".workspace"), head = document.querySelector(".engine-head").getBoundingClientRect();
    const probe = document.createElement("i"); probe.style.background = "var(--amber)"; document.body.append(probe);
    const amber = getComputedStyle(probe).backgroundColor; probe.remove();
    // the lowest card on screen (the grid packs cards out of source order)
    const last = { bottom: Math.max(...[...document.querySelectorAll("#view-engine .card")].map(c => c.getBoundingClientRect().bottom)) };
    return { wsShown: ws.offsetParent !== null, headTop: Math.round(head.top), bar: Math.round(document.querySelector(".topbar").getBoundingClientRect().bottom), lit: getComputedStyle(document.getElementById("engineToggle")).backgroundColor === amber,
      title: document.querySelector(".engine-title").textContent.trim(), lastBottom: Math.round(last.bottom),
      pb: Math.round(document.getElementById("playbar").getBoundingClientRect().top), doc: document.scrollingElement.scrollHeight, vh: innerHeight }; })()`;
  const eng = await ev(engineProbe);
  // HERESY 1167: at the page’s top the bar is tall from 1660 px (98 px; 105 until 06.10), 52 px below that and once the page scrolls
  check("engine open: its own page (the song workspace steps aside), the Engine band under the top bar (52 px at every width since 1266), the Engine button lit",
    !eng.wsShown && eng.headTop === eng.bar && eng.bar === 52 && eng.lit && /Engine/.test(eng.title), JSON.stringify(eng));
  for (let i = 0; i < 4; i++) await wheel(Math.round(w * 0.5), 300, 3000);
  await barStill();
  const down = await ev(engineProbe);
  check("engine scrolled to the end: the last card clears the player, the band stays in view under the bar (back to 52 px)", down.lastBottom > 0 && down.lastBottom <= down.pb + 1 &&
    down.headTop === down.bar && down.bar === 52, `last card ends ${down.lastBottom}, player ${down.pb}, band ${down.headTop}, bar ${down.bar}`);
  if (tag === "1920x960") {
    const about = await ev(`(() => { const c = document.getElementById("aboutCard"); if (!c) return null;
      const links = [...c.querySelectorAll("a")], cards = [...document.querySelectorAll("#view-engine .engine-grid > .card")];
      const onScreen = c.getBoundingClientRect();
      return { last: cards[cards.length - 1] === c, credit: c.querySelector(".about-credit").textContent.replace(/\\s+/g, " ").trim(),
        gh: links.some(a => a.href === "https://github.com/IronWolve"), kit: c.querySelector(".about-credit a.about-kit")?.href, yue: links.some(a => a.href === "https://github.com/multimodal-art-projection/YuE"),
        cpp: links.some(a => a.href === "https://github.com/ServeurpersoCom/yue2.cpp"), weights: links.some(a => a.href === "https://huggingface.co/m-a-p/YuE2-3B"),
        page: links.some(a => a.href === "https://map-yue2.github.io/"), ggml: links.some(a => a.href === "https://github.com/ggml-org/ggml"),
        inspired: [...c.querySelectorAll(".about-project")].find(e => e.querySelector("h4").textContent === "YuE2_WebUI")?.querySelector(".about-what").textContent,
        inspiredLink: links.some(a => a.href === "https://github.com/Ladypoly/YuE2_WebUI"),
        projects: [...c.querySelectorAll(".about-project h4")].map(e => e.firstChild.textContent.trim()).join(),
        // HERESY 1166 (Viktor: «одна с тремя колонками RUACH STUDIO | YuE2 + ggml + yue2.cpp | Sound decoders, Sliders, Loras»):
        // ours with the layout it took after, then the model, the engine and the library under YuE2's mark, then the add-ons
        threeColumns: (() => { const cols = [...c.querySelectorAll(".about-grid > .about-col, .about-grid > .about-addons")].map(e => e.getBoundingClientRect());
          const marks = [...c.querySelectorAll(".about-col .about-mark")].map(e => e.getBoundingClientRect());
          const h4s = (i) => [...c.querySelectorAll(".about-grid > .about-col")][i].querySelectorAll(".about-project h4").length;
          return cols.length === 3 && cols.every((x, i) => i === 0 || x.left >= cols[i - 1].right - 1) && cols.every(x => Math.abs(x.top - cols[0].top) < 2) &&
            marks.length === 2 && Math.abs(marks[0].top - marks[1].top) < 2 && marks.every(m => m.height >= 40 && m.width > m.height) &&
            h4s(0) === 2 && h4s(1) === 3 && c.querySelectorAll("svg.yue2-mark path").length === 2; })(),
        newTab: links.every(a => a.target === "_blank" && /noopener/.test(a.rel)), web: links.every(a => /^https?:/.test(a.getAttribute("href"))),
        addons: [...c.querySelectorAll("#aboutAddons a")].map(a => a.textContent).join(","),
        plain: [...c.querySelectorAll("#aboutAddons .about-name")].map(e => e.textContent).join(","), shown: onScreen.bottom <= innerHeight && onScreen.top < innerHeight }; })()`);
    check("About closes the Engine page: your credit and GitHub, the model's and the engine's pages, all in new tabs", !!about && about.last &&
      about.credit === "Customized Collection by SeattleSysop github.com/IronWolve" && about.kit === "https://github.com/IronWolve/yue2-kit" &&
      about.inspired === "HTML layout inspired by Ladypoly/YuE2_WebUI" && about.inspiredLink && about.gh && about.yue && about.cpp && about.weights && about.page && about.ggml && about.projects === "Ruach Studio,YuE2_WebUI,YuE2,yue2.cpp,ggml" && about.threeColumns && about.newTab && about.web,
      JSON.stringify(about));
    check("  the add-ons come from sources.json; a non-web link stays plain text", about?.addons === "Standard VAE,Blend VAE,Voice and genre sliders,sv-billie,Industrial rock" &&
      about.plain === "Legacy VAE", JSON.stringify({ addons: about?.addons, plain: about?.plain }));
  }
  await shot(`${tag}-3-engine-scrolled`);
  await click("#engineBack");
  await engineOpen(false);
  await barStill();
  const back = await ev(measure);
  check("Back to compose closes it: the workspace returns under the bar and the page fits the window", (await ev(`document.getElementById("view-engine").classList.contains("is-hidden")`)) === true &&
    back.doc <= back.vh && back.wsTop === back.bar && back.bar === 52 && back.wsBottom <= back.pb + 1, JSON.stringify(back));
}

// ============================================================ column grips
// HERESY 1167: three columns and their grips are the Creator below 1400 px; from 1400 px its kitchen (checked below)
await send("Emulation.setDeviceMetricsOverride", { width: 1399, height: 960, deviceScaleFactor: 1, mobile: false });
await waitFor(`getComputedStyle(document.getElementById("gripLeft")).display !== "none"`, 3000, 50);
await barStill();   // from 1920 px the bar was tall: its height settles first
section("column grips (drag the lines between the columns)");
const cols = `(() => { const w = (sel) => Math.round(document.querySelector(sel).getBoundingClientRect().width);
  const g = (id) => { const r = document.getElementById(id).getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + 200), shown: r.width > 0 }; };
  const c = document.getElementById("view-compose").getBoundingClientRect(), t = document.getElementById("view-take").getBoundingClientRect(), l = document.getElementById("library").getBoundingClientRect();
  let saved = null; try { saved = JSON.parse(localStorage.getItem("yue2.cols")); } catch (e) {}
  return { left: w("#view-compose"), mid: w("#view-take"), right: w("#library"), gl: g("gripLeft"), gr: g("gripRight"),
    gapL: (c.right + t.left) / 2, gapR: (t.right + l.left) / 2, saved, sw: document.scrollingElement.scrollWidth, vw: innerWidth }; })()`;
const drag = async (from, dx) => {
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: from.x, y: from.y });
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: from.x, y: from.y, button: "left", buttons: 1, clickCount: 1 });
  for (let i = 1; i <= 6; i++) await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: from.x + Math.round(dx * i / 6), y: from.y, button: "left", buttons: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: from.x + dx, y: from.y, button: "left", buttons: 0, clickCount: 1 });
  await sleep(100);   // the columns take their new widths on the next frame
};
const c0 = await ev(cols);
check("two grips sit on the lines between the columns", c0.gl.shown && c0.gr.shown && Math.abs(c0.gl.x - c0.gapL) <= 1.5 && Math.abs(c0.gr.x - c0.gapR) <= 1.5 && c0.saved === null,
  JSON.stringify({ gl: c0.gl.x, gapL: c0.gapL, gr: c0.gr.x, gapR: c0.gapR, saved: c0.saved }));
const hit = await ev(`[document.elementFromPoint(${c0.gl.x}, ${c0.gl.y})?.id, document.elementFromPoint(${c0.gr.x}, ${c0.gr.y})?.id].join()`);
check("  the mouse finds them there (nothing covers them)", hit === "gripLeft,gripRight", hit);
await drag(c0.gl, -120);   // HERESY 1167: below 1400 px there is no room to widen it, so it is narrowed
const c1 = await ev(cols);
check("dragging the left grip 120px left narrows the compose column by 120px; the takes list stays", Math.abs(c1.left - c0.left + 120) <= 1 && c1.right === c0.right &&
  c1.saved?.left === c1.left, JSON.stringify({ before: [c0.left, c0.mid, c0.right], after: [c1.left, c1.mid, c1.right], saved: c1.saved }));
await drag(c1.gr, -60);
const c2 = await ev(cols);
check("dragging the right grip 60px left widens the takes list by 60px; the compose column stays", Math.abs(c2.right - c1.right - 60) <= 1 && c2.left === c1.left &&
  c2.saved?.right === c2.right, JSON.stringify({ after: [c2.left, c2.mid, c2.right], saved: c2.saved }));
await drag(c2.gl, 2000);
const c3 = await ev(cols);
check("  dragged too far, the middle column stops at its minimum (420px) and the page gets no side scroll", c3.mid >= 419 && c3.mid <= 421 && c3.sw <= c3.vw,
  JSON.stringify({ cols: [c3.left, c3.mid, c3.right], scrollWidth: c3.sw, window: c3.vw }));
await drag(c3.gl, c2.left - c3.left);
await boot();
const c4 = await ev(cols);
check("the widths survive a reload (this browser keeps them)", Math.abs(c4.left - c2.left) <= 1 && Math.abs(c4.right - c2.right) <= 1, JSON.stringify({ was: [c2.left, c2.right], now: [c4.left, c4.right] }));
for (const clickCount of [1, 2]) {
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: c4.gl.x, y: c4.gl.y, button: "left", buttons: 1, clickCount });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: c4.gl.x, y: c4.gl.y, button: "left", buttons: 0, clickCount });
}
await sleep(100);   // as after a drag: the widths land on the next frame
const c5 = await ev(cols);
// HERESY 1167: «its default» is the width the page gives with no width of its own; below 1400 px the compose column and the
// middle share what the takes list leaves, so beside a widened list it is narrower than at the start
const c5style = await ev(`document.querySelector(".workspace").style.getPropertyValue("--col-left")`);
check("double-clicking the left grip gives the compose column its default width back (no width of its own)",
  c5style === "" && c5.right === c4.right && c5.saved?.left === undefined && (c5.left === c0.left || Math.abs(c5.left - c5.mid) <= 1),
  JSON.stringify({ now: [c5.left, c5.mid, c5.right], defaults: [c0.left, c0.right], saved: c5.saved, style: c5style }));
await ev(`document.getElementById("gripRight").focus(); true`);
await send("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowLeft", code: "ArrowLeft", windowsVirtualKeyCode: 37 });
await send("Input.dispatchKeyEvent", { type: "keyUp", key: "ArrowLeft", code: "ArrowLeft", windowsVirtualKeyCode: 37 });
await sleep(50);   // the next frame
const c6 = await ev(cols);
check("  the keyboard moves a focused grip (ArrowLeft widens the takes list 16px); Home resets it", c6.right === c5.right + 16, JSON.stringify({ before: c5.right, after: c6.right }));
await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Home", code: "Home", windowsVirtualKeyCode: 36 });
await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Home", code: "Home", windowsVirtualKeyCode: 36 });
await sleep(50);   // the next frame
const c7 = await ev(cols);
check("  both back to the defaults, nothing stored", c7.left === c0.left && c7.right === c0.right && c7.saved === null, JSON.stringify({ now: [c7.left, c7.right], saved: c7.saved }));
// drawer headings in the narrowest compose column: the name on one line, its sentence under it (never beside it)
const heads = await ev(`(() => { document.querySelector(".workspace").style.setProperty("--col-left", "380px");
  const out = [...document.querySelectorAll("#view-compose .drawer > summary")].map(s => { const n = s.querySelector(".sum-name").getBoundingClientRect(), y = s.querySelector(".sum-say");
    const r = y.getBoundingClientRect(); return { name: s.querySelector(".sum-name").textContent, oneLine: n.height < 24, under: r.top >= n.bottom - 1, say: y.textContent }; });
  document.querySelector(".workspace").style.removeProperty("--col-left"); return out; })()`);
check("drawer headings: the name on one line with its sentence under it, even in the narrowest column", heads.length === 4 &&   // HERESY 1169: Sound and output is Sampling's
  heads.every(h => h.oneLine && h.under && h.say) && /^A local chat model writes the title, style and lyrics from one line\.$/.test(heads[0].say),
  JSON.stringify(heads.filter(h => !h.oneLine || !h.under).map(h => h.name)) + " " + heads[0].say);
await send("Emulation.setDeviceMetricsOverride", { width: 1100, height: 900, deviceScaleFactor: 1, mobile: false });
await waitFor(`getComputedStyle(document.getElementById("gripLeft")).display === "none"`, 3000, 50);
// HERESY 1017: the bar is one row at any width (its GPU readout and Model menu sit under ⋯, More)
const smallStrip = await ev(`(() => { const bar = document.querySelector(".topbar, header"), kids = [...bar.children].filter(e => e.getBoundingClientRect().width > 0);
  const mid = (e) => { const r = e.getBoundingClientRect(); return (r.top + r.bottom) / 2; };
  return { spread: Math.round(Math.max(...kids.map(mid)) - Math.min(...kids.map(mid))), fits: bar.scrollWidth <= bar.clientWidth + 1, inMore: !!document.getElementById("hwStats").closest("#headMorePop") }; })()`);
check("  at 1100 px the top bar stays one row and fits (the GPU readout is under ⋯, More)", smallStrip.spread < 12 && smallStrip.fits && smallStrip.inMore,
  JSON.stringify(smallStrip));
const gripsNarrow = await ev(`[getComputedStyle(document.getElementById("gripLeft")).display, getComputedStyle(document.getElementById("gripRight")).display].join()`);
check("  a narrow window stacks the columns and hides the grips", gripsNarrow === "none,none", gripsNarrow);
await send("Emulation.setDeviceMetricsOverride", { width: 1399, height: 960, deviceScaleFactor: 1, mobile: false });
await waitFor(`getComputedStyle(document.getElementById("gripLeft")).display !== "none"`, 3000, 50);
const gripsBack = await ev(`getComputedStyle(document.getElementById("gripLeft")).display`);
check("  wider again (1399 px), the grips are back", gripsBack !== "none", gripsBack);

// ======================================================= the Creator's kitchen (HERESY 1167)
// Viktor 05.10.2026: «Левую промптинг генерации на 2/3 слева как основную, разделить её на две колонки по 1/3…
// Статистику/карту трека реально нужно на 1/3 ширины справа… [дубли] во втором фрейме 1/3 ширины вниз… под-фреймом»
section("the Creator's kitchen (from 1400 px)");
await send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 960, deviceScaleFactor: 1, mobile: false });
await waitFor(`getComputedStyle(document.getElementById("kSplit")).display !== "none"`, 3000, 50);
await barStill();   // from 1660 px the bar grows tall again: the frames under it settle first
const kitchen = await ev(`(() => { const r = (s) => document.querySelector(s).getBoundingClientRect(), ws = r(".workspace");
  const c = r("#view-compose"), t = r("#view-take"), l = r("#library"), a = r(".k-words"), b = r(".k-machine");
  return { share: +(c.width / ws.width).toFixed(3), side: Math.abs(a.top - b.top) < 2 && a.right <= b.left,
    takeOver: Math.abs(t.left - l.left) < 1 && t.bottom <= l.top + 2 && t.left >= c.right - 1,
    grips: [getComputedStyle(document.getElementById("gripLeft")).display, getComputedStyle(document.getElementById("gripRight")).display].join(),
    cards: document.querySelectorAll("#composeForm .k-card").length, sw: document.scrollingElement.scrollWidth, vw: innerWidth }; })()`);
check("the kitchen: the words beside the machine over two thirds, the take over its takes in the last third, no column grips",
  kitchen.share >= 0.66 && kitchen.share <= 0.67 && kitchen.side && kitchen.takeOver && kitchen.grips === "none,none" && kitchen.cards === 7 &&
  kitchen.sw <= kitchen.vw, JSON.stringify(kitchen));
const takeHeight = () => ev(`Math.round(document.getElementById("view-take").getBoundingClientRect().height)`);
const kh0 = await takeHeight();
await ev(`document.getElementById("kSplit").focus(); true`);
await send("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowDown", code: "ArrowDown", windowsVirtualKeyCode: 40 });
await send("Input.dispatchKeyEvent", { type: "keyUp", key: "ArrowDown", code: "ArrowDown", windowsVirtualKeyCode: 40 });
await sleep(80);   // the next frame
const kh1 = await takeHeight(), kSaved = await ev(`localStorage.getItem("yue2.kSplit")`);
check("the line between the take and its takes moves (ArrowDown gives the take 16 px) and is kept", Math.abs(kh1 - kh0 - 16) <= 1 && !!kSaved,
  JSON.stringify({ before: kh0, after: kh1, kept: kSaved }));
await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Home", code: "Home", windowsVirtualKeyCode: 36 });
await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Home", code: "Home", windowsVirtualKeyCode: 36 });
await sleep(80);
const kh2 = await takeHeight();
check("  Home gives the default back, nothing kept", kh2 === kh0 && (await ev(`localStorage.getItem("yue2.kSplit")`)) === null, JSON.stringify({ now: kh2, was: kh0 }));
await click("#libFold");
await sleep(250);
const kFolded = await ev(`(() => { const t = document.getElementById("view-take").getBoundingClientRect(), l = document.getElementById("library").getBoundingClientRect();
  const w = document.querySelector(".workspace").getBoundingClientRect(), n = document.querySelector(".lib-unfold-name");
  return { libW: Math.round(l.width), right: l.left >= t.right - 2 && Math.abs(l.right - w.right) <= 2, take: Math.round(t.height), room: Math.round(w.height),
    sideways: getComputedStyle(n).writingMode }; })()`);
check("  the takes folded are a strip at the right edge, its word on its side, and the take has the third's whole height",
  kFolded.libW <= 44 && kFolded.right && Math.abs(kFolded.take - kFolded.room) <= 2 && /vertical/.test(kFolded.sideways), JSON.stringify(kFolded));
const kPlayer = await ev(`(() => { const p = document.getElementById("playbar").getBoundingClientRect(), w = document.getElementById("wave").getBoundingClientRect(),
  c = document.querySelector("#playbar .pb-ctrl").getBoundingClientRect(); return { h: Math.round(p.height), oneRow: Math.abs((w.top + w.bottom) / 2 - (c.top + c.bottom) / 2) < 8 }; })()`);
check("  the player has its two rows in the Creator, the waveform over the transport (HERESY 1258: one row in the rooms without sound and over a lifted frame)", kPlayer.h > 72 && !kPlayer.oneRow, JSON.stringify(kPlayer));
await click("#libUnfold");
await sleep(250);
const kCards = await ev(`[...document.querySelectorAll("#libList .take[data-name]")].slice(0, 5).map(c => Math.round(c.getBoundingClientRect().height))`);
check("  the takes in compact cards: the title, then its marks, length, workspace and votes on one line", kCards.length > 0 && kCards.every(h => h >= 30 && h <= 66),
  JSON.stringify(kCards));
const kClosed = await ev(`(() => { const d = document.getElementById("coverDrawer"), card = document.querySelector(".k-card.k-sound");
  return { open: d.open, drawer: getComputedStyle(d).backgroundColor, card: getComputedStyle(card).backgroundColor }; })()`);
check("  a closed drawer stands on a ground of its own, not the card's", !kClosed.open && kClosed.drawer !== kClosed.card && kClosed.drawer !== "rgba(0, 0, 0, 0)",
  JSON.stringify(kClosed));

// HERESY 1168 (Viktor 06.10.2026: «В STYLE полосе ненужный текст подсказки. При свёртывании на две строки рубится»)
check("the Style prompt's bar has its name without the hint (the box's placeholder says it)",
  (await ev(`(() => { const l = document.querySelector('[data-fold="style"] > .label');
    return [!l.querySelector("em:not(.fold-peek)") && ![...l.childNodes].some(n => n.nodeType === 3 && /language, genre/i.test(n.textContent)), document.getElementById("style").placeholder]; })()`)).join() ===
  "true,Language, genre, voice, instruments, tempo");
// HERESY 1168 (Viktor 06.10.2026: «Пройдись по всей Студии и везде, где есть (i), и если там после идёт микро подсказка, либо
// убирай её, либо в тултип»): no (i) has a note after it; the notes are the tips' first lines
const notesLeft = await ev(`[...document.querySelectorAll(".info")].map(i => { let n = i.nextSibling, after = "";
  while (n) { if (n.nodeType === 3) after += n.textContent; else if (n.nodeType === 1 && n.tagName === "EM" && !n.classList.contains("fold-peek")) after += n.textContent;
    else if (n.nodeType === 1) break; n = n.nextSibling; }
  return after.trim() ? (i.getAttribute("aria-label") || "?") + ": " + after.trim() : null; }).filter(Boolean)`);
check("no (i) in the page has a short note after it on its label any more", notesLeft.length === 0, JSON.stringify(notesLeft));
const tipVae = await hoverOn('.info[data-tip-head="voice and genre while the music is written; 0 is off, 1 is full"]');   // HERESY 1168: VAE's (i) left with its block
const tipLyrics = await hoverOn('.info[data-tip-head="section tags on their own line"]');
check("  the note is its tip's first line: an (i) of the markup (Sliders) and one help.js puts in (Lyrics)",
  !!tipVae && tipVae.text.startsWith("voice and genre while the music is written; 0 is off, 1 is full\n") && !!tipLyrics && tipLyrics.text.startsWith("section tags on their own line\n"),
  JSON.stringify([tipVae && tipVae.text.slice(0, 60), tipLyrics && tipLyrics.text.slice(0, 60)]));
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 5, y: 5 });

// HERESY 1168 (Viktor 06.10.2026: «на каждый фрейм — левый и правый — разворот этого фрейма на "полный экран", в оверлей окно
// 95%x95%, с увеличением масштаба всего фрейма здесь на добрых 20%… кнопку переключения между фреймами»)
section("the Creator's frames over the room");
const frameBox = (id) => ev(`(() => { const el = document.getElementById(${JSON.stringify(id)}), f = el.getBoundingClientRect(), p = document.getElementById("playbar").getBoundingClientRect();
  const room = innerHeight - p.height, hit = document.elementFromPoint(p.left + p.width / 2, p.top + p.height / 2), swap = el.querySelector(".frame-swap");
  return { frame: document.body.dataset.frame || null, veil: !document.getElementById("frameVeil").hidden, left: +(f.left / innerWidth).toFixed(3),
    width: +(f.width / innerWidth).toFixed(3), top: +(f.top / room).toFixed(3), height: +(f.height / room).toFixed(3), zoom: getComputedStyle(el).zoom,
    player: !!hit && !!hit.closest("#playbar"), swap: !!swap && !!swap.offsetParent, pressed: el.querySelector(".frame-big").getAttribute("aria-pressed") }; })()`);
const fBefore = await ev(`[...document.querySelectorAll(".frame-swap")].filter(b => b.offsetParent).length`);
await click('.frame-big[data-frame="compose"]');
await sleep(150);
const fc = await frameBox("view-compose");
// HERESY 1169 (Viktor: «Давай увеличим до 97%»)
check("Compose over the room: 97 % of the screen above the player, a fifth larger; the player stays in sight; the swap only now",
  fBefore === 0 && fc.frame === "compose" && fc.veil && Math.abs(fc.left - 0.015) < 0.004 && Math.abs(fc.width - 0.97) < 0.004 &&
  Math.abs(fc.top - 0.015) < 0.006 && Math.abs(fc.height - 0.97) < 0.006 && Math.abs(parseFloat(fc.zoom) - 1.2) < 0.01 && fc.player && fc.swap &&
  fc.pressed === "true", JSON.stringify(fc));
await click("#view-compose .frame-swap");
await sleep(150);
const ft = await frameBox("view-take"), composeBack = await ev(`getComputedStyle(document.getElementById("view-compose")).position`);
check("  its swap: the take's frame over the room, Compose back in its place", ft.frame === "take" && ft.veil && Math.abs(ft.width - 0.97) < 0.004 &&
  Math.abs(parseFloat(ft.zoom) - 1.2) < 0.01 && composeBack !== "fixed", JSON.stringify({ ft, composeBack }));
await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
await sleep(120);
const fEsc = await ev(`[document.body.dataset.frame || null, document.getElementById("frameVeil").hidden, getComputedStyle(document.getElementById("view-take")).position,
  document.querySelector('.frame-big[data-frame="take"]').getAttribute("aria-pressed")]`);
check("  Esc puts it back", fEsc[0] === null && fEsc[1] === true && fEsc[2] !== "fixed" && fEsc[3] === "false", JSON.stringify(fEsc));
await click('.frame-big[data-frame="take"]');
await sleep(120);
await send("Input.dispatchMouseEvent", { type: "mousePressed", x: 12, y: 300, button: "left", clickCount: 1 });
await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: 12, y: 300, button: "left", clickCount: 1 });
await sleep(120);
check("  and so does a click beside it", (await ev(`document.body.dataset.frame || null`)) === null);
// Viktor: «Иконку FULL SCREEN в правом фрейме перенеси в самый верхний правый угол»
const corner = await ev(`(() => { const c = document.getElementById("view-take").getBoundingClientRect(), t = document.querySelector("#view-take .frame-big").getBoundingClientRect(),
  h = document.getElementById("takeTitle").getBoundingClientRect(); return { right: Math.round(c.right - t.right), top: Math.round(t.top - c.top), titleTop: Math.round(h.top - c.top) }; })()`);
// HERESY 1169 (Viktor: «иконки вверх вровень с full screen кнопкой… а ниже… тайтл трека»): the corner holds; the title is under it now
check("  the take's ⤢ sits in its frame's top right corner, the title under its row", corner.right >= 0 && corner.right <= 36 && corner.top >= 0 && corner.top <= 24 && corner.titleTop > corner.top + 10,
  JSON.stringify(corner));
// Viktor: «И кликами на плеер чтобы не убегал фокус и чтобы оверлей не схлопывался»
await click('.frame-big[data-frame="compose"]');
await sleep(150);
const pbBox = await ev(`(() => { const r = document.getElementById("nextTake").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
await send("Input.dispatchMouseEvent", { type: "mousePressed", x: pbBox.x, y: pbBox.y, button: "left", clickCount: 1 });
await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: pbBox.x, y: pbBox.y, button: "left", clickCount: 1 });
await sleep(300);
const afterPlayer = await ev(`[document.body.dataset.frame || null, document.getElementById("view-compose").contains(document.activeElement)]`);
check("  a click in the player leaves the frame up and the keys with it", JSON.stringify(afterPlayer) === '["compose",true]', JSON.stringify(afterPlayer));
await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
await sleep(120);

// HERESY 1168 (Viktor 06.10.2026: «В поле редактора Лирики можешь прикрутить ересь?… визуализатор длин строк, вертикальную
// линейку, которая по куплету+мосту будет едино мерить. По при-корусу и корусу — отдельно… спелл чекер… подсчёт символов/знаков
// самой лирики, и отдельно служебные теги разделов и то, что в скобках круглых»; «разреши ручную растяжку поля лирики по высоте»)
section("the lyrics' meter");
const lyrBefore = await ev(`document.getElementById("lyrics").value`);
await ev(`(() => { const a = document.getElementById("lyrics"); a.value = "[Verse]\\nПесни из слов\\nНа твоей машине\\n\\n[Chorus]\\nBu-ra-ti-no (oh)\\nЯ рУ́ах";
  a.dispatchEvent(new Event("input", { bubbles: true })); a.scrollIntoView({ block: "center" }); return true; })()`);
await sleep(300);
const lm = await ev(`(() => { const rows = [...document.querySelectorAll(".lyr-gutter .lyr-row:not(.lyr-head)")].map(r => r.querySelector(".lyr-n").textContent);
  const heads = [...document.querySelectorAll(".lyr-gutter .lyr-head")].map(h => h.textContent);
  return { rows, heads, rulers: document.querySelectorAll(".lyr-gutter .lyr-ruler").length, meter: document.getElementById("lyricsMeter").innerText.replace(/\\s+/g, " "),
    spell: document.getElementById("lyrics").spellcheck, lang: document.getElementById("lyrics").lang, rows26: document.getElementById("lyrics").dataset.maxRows }; })()`);
check("the lyrics' meter: each line's syllables beside it (the brackets after a +), a ruler a group, the counts under the box, the spelling check in Russian",
  JSON.stringify(lm.rows) === '["4","6","4+1","3"]' && JSON.stringify(lm.heads) === '["verse + bridge ≈ 5","chorus ≈ 3.5"]' && lm.rulers === 4 &&
  /17 syllables · 4 lines/.test(lm.meter) && /Tags: 15 characters in 2/.test(lm.meter) && /In brackets: 4 characters in 1/.test(lm.meter) &&
  /Stress 1 · ע 0 · Latin 0/.test(lm.meter) && lm.spell === true && lm.lang === "ru" && lm.rows26 === "26", JSON.stringify(lm));
// Viktor: «Блок Interlude не имеет текста под собою. Там счётчик не нужен»; «По примерам из YuE2 репо вычлени все возможные теги»
await ev(`(() => { const a = document.getElementById("lyrics"); a.value = "[Interlude]\\nДа ладно\\nКакая разница\\n\\n[Verse 1 – Him]\\nПесни из слов\\nНа твоей машине\\n\\n[Interlude]\\n\\n[Male Vocals]\\nещё строка\\n\\n[副歌1]\\nBu-ra-ti-no\\nЯ рУах";
  a.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
await sleep(300);
const heads2 = await ev(`[...document.querySelectorAll(".lyr-gutter .lyr-head")].map(h => h.textContent)`);
check("  a section with no words shows its name and no ruler; who sings («Male Vocals») is no section; the official examples' tags («Verse 1 – Him», «副歌1») are known; an interlude inside the verse is a pause: «ещё строка» counts with the verse",
  JSON.stringify(heads2) === '["interlude ≈ 4.5","verse + bridge ≈ 4","interlude","chorus ≈ 3.5"]', JSON.stringify(heads2));
// HERESY 1168 (Viktor 07.10.2026: «игнорирование подсчётов, если, к примеру, в строке два [] тега типа [Break] [Silence]»; «Счёт по
// базису реальных вокальных секций. Даже если внутри паузные, интерлюдия/прелюдия, общее продолжаем по главному тегу секции»)
const m3 = await ev(`(() => { const m = HeresyLyrics.measure("[Verse 1]\\nПесни из слов\\nНа твоей машине\\n[Break] [Silence]\\nещё одна строка [Break] и\\n[Interlude]\\nКакая разница\\n[Ver");
  return { rows: m.rows.map(r => r.tag ? (r.pause ? "~" + r.pause : r.section ? "#" + r.group : "") : r.group + ":" + r.syl).join("|"), tags: m.tags.n + "/" + m.tags.chars, rulers: JSON.stringify(m.rulers) }; })()`);
check("  a line of tags alone ([Break] [Silence]) counts as none, a tag inside a sung line is left out; a pause or an interlude inside the verse opens no group (the verse's ruler goes on); a tag being written is not counted",
  m3.rows === "#verse + bridge|verse + bridge:4|verse + bridge:6|~break|verse + bridge:7|~interlude|verse + bridge:6|verse + bridge:0" && m3.tags === "5/43" && m3.rulers === '{"verse + bridge":6}', JSON.stringify(m3));
// HERESY 1168 (Viktor: «Считает гласные, а нужно считать слоги… Сможешь унифицировать счётчики и для всех языков, что у нас
// запланированы в финальный релиз?»): a syllable by each language's own rules
const sylAll = await ev(`(() => { const S = HeresyLyrics.syllables; return [
  S("Я же вижу глупцо\u0301в с приду\u0301рческим планом."), S("Ми живемо, я тебе кохаю, моя земле"), S("Я цябе кахаю, мая зямля, праўда"),
  S("Σ' αγαπώ, καρδιά μου"), S("τσάι Μαΐου"), S("Noche de amor, guitarra y corazón"), S("día hoy que muy reyes agüero ciudad poeta", "es"),
  S("Ciao amore, il mio cuore"), S("giorno figlio perché questo acqua uomo più", "it"), S("The night is making me feel alive"),
  S("table jumped wanted boxes going radio being café makes loved", "en"), S("שָׁלוֹם רוּחַ"), S("我爱你"), S("ありがとう"), S("사랑해"),
  HeresyLyrics.latinOf("la la la", "Italian pop")].join(); })()`);
check("  syllables by each language's rules: Russian 12 (глуп-цо́в спри-ду́р-чес-ким: п and с take time, no syllable), Ukrainian, Belarusian, Greek (τσά-ι, Μα-ΐ-ου, καρ-διά), Spanish (no-che, dí-a), Italian (cia-o, cuo-re), English (ta-ble, go-ing), Hebrew by its points, Chinese, Japanese, Korean by their signs; the style names the language",
  sylAll === "12,14,12,6,5,12,15,9,13,9,18,4,3,5,3,it", sylAll);
// HERESY 1168 (Viktor: «Допиши одиночные согласные доли, потому что мы не меряем по реальным слогам… а по реальной затрате
// времени на произношение»)
const cbm = await ev(`(() => { const m = HeresyLyrics.measure("[Verse]\\nЯ же вижу глупцо\u0301в с приду\u0301рческим планом.\\nз тобою й вітер, ў лесе\\nКогда вы ла\u0301етесь\\nотчество, сердце, лодка, доктор");
  return m.rows.filter(r => !r.tag).map(r => r.syl + "=" + (r.syl - r.cb) + "+" + r.cb).join("|") + " · " + m.lyrics.cb; })()`);
await ev(`(() => { const a = document.getElementById("lyrics"); a.value = "[Verse]\\nЯ же вижу глупцо\u0301в с приду\u0301рческим планом.\\nПесни из слов";
  a.dispatchEvent(new Event("input", { bubbles: true })); a.scrollIntoView({ block: "center" }); return true; })()`);
await sleep(300);
const cbDom = await ev(`({ n: [...document.querySelectorAll(".lyr-gutter .lyr-row:not(.lyr-head) .lyr-n")].map(e => e.textContent).join(","), light: document.querySelectorAll(".lyr-gutter .lyr-cbar").length,
  under: /Consonant beats: 2/.test(document.getElementById("lyricsMeter").innerText), syl: /16 syllables/.test(document.getElementById("lyricsMeter").innerText) })`);
check("  the time a line takes: a word with no vowel (с, з, й, ў) and a stop closed against an affricate (глу-п-цо́в, о-т-чество; not сердце's silent д) are beats of their own, counted with the syllables and drawn lighter; under the box the syllables stay syllables",
  cbm === "14=12+2|10=7+3|6=6+0|10=9+1 · 6" && cbDom.n === "14,4" && cbDom.light === 1 && cbDom.under && cbDom.syl, JSON.stringify({ cbm, cbDom }));
// HERESY 1168 (Viktor 07.10.2026: «вшей ещё проверку проёбов с x301. Что не на гласных, в пустоте, на пробеле...»; «С x301
// неправильно считаются слоги, мне так кажется. ע учитывается в слогах как гласная?»)
await ev(`(() => { const a = document.getElementById("lyrics");
  a.value = "[Verse]\\n\\u0301Я деревя\\u0301нный\\nмне \\u0301оно и кот\\u0301\\nде\\u0301ре\\u0301во, вода\\u00b4\\nКа\\u0301рлу в кעмо\\u0301рке пo\\u0301хעть";
  a.dispatchEvent(new Event("input", { bubbles: true })); a.scrollIntoView({ block: "center" }); return true; })()`);
await sleep(300);
const sx = await ev(`(() => { const b = document.querySelector('#lyricsMeter [data-lyr="stress"]'), b2 = document.querySelector('#lyricsMeter [data-lyr="stress2"]');
  return { bad: b && b.textContent, two: b2 && b2.textContent, tip: b && b.dataset.tip, marks: [...document.querySelectorAll(".lyr-gutter .lyr-x")].map(x => x.className.replace("lyr-x ", "")).join(),
    faults: HeresyLyrics.stressFaults(document.getElementById("lyrics").value).faults.map(f => f.kind).join() }; })()`);
check("stress marks astray: off a vowel (a line's start, after a space, on a consonant, a spacing ´) in red, a word with two in amber; ע and his Latin o are vowels",
  sx.bad === "Stress marks off a vowel: 4" && sx.two === "Words with two stress marks: 1" && sx.faults === "start,space,consonant,spacing" &&
  /line 2: at the line's start \(before «Я»\)/.test(sx.tip) && /line 3: on «т», not a vowel/.test(sx.tip) && sx.marks === "bad,bad,bad", JSON.stringify(sx));
const sxNav = [];
for (let k = 0; k < 3; k++) {
  await ev(`document.querySelector('#lyricsMeter [data-lyr="stress"]').click(); true`);
  await sleep(120);
  sxNav.push(await ev(`(() => { const a = document.getElementById("lyrics"); return { sel: [...a.value.slice(a.selectionStart, a.selectionEnd)].map(c => c.codePointAt(0).toString(16)).join(" "),
    focus: document.activeElement === a }; })()`));
}
check("  its button goes to each in turn and selects it in the box (the mark with its letter; a lone one with its neighbours, to be seen)",
  sxNav.every(n => n.focus) && sxNav.map(n => n.sel).join("|") === "301 42f|20 301 43e|442 301", JSON.stringify(sxNav));
const sxCount = await ev(`[HeresyLyrics.syllables("мои\\u0306"), HeresyLyrics.syllables("п\\u00f3хעть"), HeresyLyrics.syllables("пo\\u0301хעть"), HeresyLyrics.syllables("праўда"),
  HeresyLyrics.syllables("Кע дну"), HeresyLyrics.syllables("café"), HeresyLyrics.syllables("naïve"), HeresyLyrics.syllables("рУ\\u0301ах")].join()`);
check("  the count: a stress mark is no syllable, ע is; a decomposed «й» no vowel, ó a vowel however written, Belarusian ў none; café and naïve two",
  sxCount === "1,2,2,2,2,2,2,2", sxCount);
// HERESY 1168 (Viktor 07.10.2026: «Если курсор стоит в блоке редактора лирики или стиля, можем перехватывать Ctrl+F, чтобы
// искать не по всей странице, а только в активном блоке?»)
await ev(`(() => { const a = document.getElementById("lyrics");
  a.value = "[Verse]\\nЭто обе\\u0301щано не нами\\nКо дну, кעмо\\u0301рка и Кo\\nобещано снова";
  a.dispatchEvent(new Event("input", { bubbles: true })); a.scrollIntoView({ block: "center" }); a.focus(); a.setSelectionRange(0, 0); return true; })()`);
await sleep(200);
const fOpen = await ev(`(() => { const e = new KeyboardEvent("keydown", { key: "f", ctrlKey: true, bubbles: true, cancelable: true });
  document.getElementById("lyrics").dispatchEvent(e); return { prevented: e.defaultPrevented, open: HeresyFind.state().open, box: HeresyFind.state().box,
    focus: document.activeElement.id, place: document.getElementById("findQ").placeholder }; })()`);
await ev(`(() => { const i = document.getElementById("findQ"); i.value = "обещано"; i.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
await sleep(120);
const fFound = await ev(`({ ...HeresyFind.state(), marks: document.querySelectorAll(".find-mark").length })`);
await ev(`document.getElementById("findQ").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })); true`);
const fNext = await ev(`HeresyFind.state().said`);
await ev(`document.getElementById("findQ").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })); true`);
await sleep(80);
const fBack = await ev(`(() => { const a = document.getElementById("lyrics"); return { open: HeresyFind.state().open, focus: document.activeElement.id,
  sel: a.value.slice(a.selectionStart, a.selectionEnd), marks: document.querySelectorAll(".find-mark").length }; })()`);
check("Ctrl+F in the lyrics finds in the lyrics alone: «обещано» finds both, the stressed one too; Enter goes on; Esc back to the box, the match selected",
  fOpen.prevented && fOpen.open && fOpen.box === "lyrics" && fOpen.focus === "findQ" && fOpen.place === "Find in the lyrics" &&
  fFound.hits === 2 && fFound.said === "1 of 2" && fFound.marks >= 1 && fNext === "2 of 2" && !fBack.open && fBack.focus === "lyrics" && fBack.sel === "обещано" && fBack.marks === 0,
  JSON.stringify({ fOpen, fFound, fNext, fBack }));
const fKin = await ev(`[HeresyFind.find(document.getElementById("lyrics").value, "коморка").length, HeresyFind.find(document.getElementById("lyrics").value, "ко").length,
  HeresyFind.find("ёлка и елка", "елка").length]`);
const fElse = await ev(`(() => { const t = document.getElementById("title"); t.focus(); const e = new KeyboardEvent("keydown", { key: "f", ctrlKey: true, bubbles: true, cancelable: true });
  t.dispatchEvent(e); return { prevented: e.defaultPrevented, open: HeresyFind.state().open }; })()`);
check("  his hand finds as plain words (коморка finds кעмо́рка; ко finds Ко, кע and the Latin Кo; ё is е); outside a box Ctrl+F is the browser's",
  fKin.join() === "1,3,2" && !fElse.prevented && !fElse.open, JSON.stringify({ fKin, fElse }));
await ev(`(() => { const a = document.getElementById("lyrics"), r = a.getBoundingClientRect();
  a.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: r.right - 6, clientY: r.bottom - 6 }));
  a.style.height = (a.offsetHeight + 120) + "px";
  window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true })); return true; })()`);
await sleep(200);
const lyrDrawn = await ev(`(() => { const a = document.getElementById("lyrics"), h = a.offsetHeight; a.value += "\\nещё строка"; a.dispatchEvent(new Event("input", { bubbles: true }));
  return { manual: a.dataset.manual === "1", kept: a.offsetHeight === h, kept2: localStorage.getItem("yue2.lyricsHeight") === String(h) }; })()`);
await sleep(200);
const lyrAuto = await ev(`!!document.querySelector('#lyricsMeter [data-lyr="auto"]')`);
await ev(`document.querySelector('#lyricsMeter [data-lyr="auto"]').click(); true`);
await sleep(200);
const lyrBack = await ev(`[!document.getElementById("lyrics").dataset.manual, localStorage.getItem("yue2.lyricsHeight")]`);
check("  drawn by hand the box keeps its height through typing (and in this browser); «Auto height» gives the growth back",
  lyrDrawn.manual && lyrDrawn.kept && lyrDrawn.kept2 && lyrAuto && lyrBack[0] === true && lyrBack[1] === null, JSON.stringify({ lyrDrawn, lyrAuto, lyrBack }));
// Viktor: «В композере в оверлее дохерища пустоты в подвале»: long lyrics never stretch the column below its form
const voidCheck = await ev(`(() => { const a = document.getElementById("lyrics"), c = document.getElementById("view-compose"), h0 = c.scrollHeight;
  a.value = Array.from({ length: 120 }, (_, i) => "строка номер " + i + ", длинная строка песни").join("\\n"); a.dispatchEvent(new Event("input", { bubbles: true }));
  return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r({ grew: c.scrollHeight - h0, rows: document.querySelectorAll(".lyr-gutter .lyr-row").length })))); })()`);
check("  120 lines of lyrics grow the box to its cap and no further: the meter's mirror never stretches the frame", voidCheck.grew < 600 && voidCheck.rows > 5, JSON.stringify(voidCheck));
await ev(`(() => { const a = document.getElementById("lyrics"); a.value = ${JSON.stringify(lyrBefore)}; a.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);

// ================================================================== Viktor's corrections of 07.10.2026, from the road
section("Max length, Reset output, Denoising steps, Ctrl+F in any layout and frame, the text profile");
// «В Sound and Output поле max length так и осталось»: the song's length is the music's time in Sampling, editable, and only there
const lenUi = await ev(`(() => { const t = document.querySelector('.knob-secs[data-secs-for="max_tokens"]'), f = document.getElementById("maxLength").closest(".field");
  return { field: f.checkVisibility(), shown: !!t, ro: t && t.readOnly, lock: !!t.closest(".knob").querySelector(".knob-lock"),
    label: document.getElementById("odeSteps").closest(".field").querySelector(".label").firstChild.textContent.trim() }; })()`);
await ev(`(() => { document.getElementById("advDrawer").open = true;
  const t = document.querySelector('.knob-secs[data-secs-for="max_tokens"]'); t.value = "3:00"; t.dispatchEvent(new Event("change", { bubbles: true })); return true; })()`);
const lenNow = await ev(`({ hidden: document.getElementById("maxLength").value, tokens: document.querySelector('input[data-group="semantic"][data-key="max_tokens"]').value,
  time: document.querySelector('.knob-secs[data-secs-for="max_tokens"]').value, summary: document.getElementById("outSummary").textContent })`);
check("Max length is set in Sampling (the music's time, editable, no lock); Sound and output has no length field; the request's duration follows it; «Denoising steps»",
  !lenUi.field && lenUi.shown && lenUi.ro === false && !lenUi.lock && lenUi.label === "Denoising steps" &&
  lenNow.hidden === "180" && lenNow.tokens === "4500" && lenNow.time === "3:00" && /up to 3:00/.test(lenNow.summary), JSON.stringify({ lenUi, lenNow }));
// «Reset output не обнуляет выбор резолвера»
await ev(`(() => { const s = document.getElementById("odeSolver"); s.value = "heun"; s.dispatchEvent(new Event("change", { bubbles: true }));
  document.getElementById("odeSteps").value = "64"; document.getElementById("variations").value = "3"; document.getElementById("resetOutput").click(); return true; })()`);
await answerDialog(true);   // HERESY 1169: the reset asks first when something set would go
const reset = await ev(`({ solver: document.getElementById("odeSolver").value, steps: document.getElementById("odeSteps").value, vars: document.getElementById("variations").value,
  time: document.querySelector('.knob-secs[data-secs-for="max_tokens"]').value, def: +document.getElementById("maxLength").getAttribute("value") })`);
check("  Reset output puts the solver back to midpoint too, the steps and the length; Sounds, beside Generate now, keeps its number", reset.solver === "midpoint" && reset.steps === "32" &&
  reset.vars === "3" && reset.time === Math.floor(reset.def / 60) + ":" + String(reset.def % 60).padStart(2, "0"), JSON.stringify(reset));   // the engine's own default length
await ev(`(() => { const v = document.getElementById("variations"); v.value = "1"; v.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
// «Повторно Ctrl+F — всплыло браузерное… твой виджет больше не появляется»: a Russian layout gives «а» for the key F
await ev(`(() => { const a = document.getElementById("lyrics"); a.value = "[Verse]\\nобе\\u0301щано одно\\nи другое обещано"; a.dispatchEvent(new Event("input", { bubbles: true }));
  a.scrollIntoView({ block: "center" }); a.focus(); return true; })()`);
const ruKey = (target) => ev(`(() => { const e = new KeyboardEvent("keydown", { key: "а", code: "KeyF", ctrlKey: true, bubbles: true, cancelable: true });
  document.getElementById(${JSON.stringify(target)}).dispatchEvent(e); return { prevented: e.defaultPrevented, open: HeresyFind.state().open }; })()`);
const ru1 = await ruKey("lyrics");
const ru2 = await ruKey("findQ");                                  // again, from the bar itself
await ev(`document.getElementById("findQ").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })); true`);
const ru3 = await ruKey("lyrics");                                 // and after it was closed
check("  Ctrl+F by the key in a Russian layout (it comes as «а»): it opens, again from the bar it stays ours, and after a close it opens again",
  ru1.prevented && ru1.open && ru2.prevented && ru3.prevented && ru3.open, JSON.stringify({ ru1, ru2, ru3 }));
await ev(`HeresyFind.close(false); true`);
// «в редакторе лирики какой-то оверлейный прямоугольник начал плавать»: in a lifted (zoomed) frame the mark sits on the words
await click('#view-compose .frame-big');
await waitFor(`document.body.dataset.frame === "compose"`, 3000, 50);
await sleep(400);
const zoomed = await ev(`(() => { const a = document.getElementById("lyrics"); a.focus(); a.setSelectionRange(0, 0);
  a.dispatchEvent(new KeyboardEvent("keydown", { key: "f", code: "KeyF", ctrlKey: true, bubbles: true, cancelable: true }));
  const i = document.getElementById("findQ"); i.value = "одно"; i.dispatchEvent(new Event("input", { bubbles: true }));
  const m = document.querySelector(".find-mark"), r = a.getBoundingClientRect(), k = r.width / a.offsetWidth, cs = getComputedStyle(a), lh = parseFloat(cs.lineHeight), fs = parseFloat(cs.fontSize);
  if (!m) return { mark: false, k };
  const q = m.getBoundingClientRect();
  return { mark: true, k: Math.round(k * 100) / 100, inside: q.left >= r.left && q.right <= r.right && q.top >= r.top && q.bottom <= r.bottom,
    height: Math.round(q.height), font: Math.round(fs * k), line: Math.round(lh * k), wide: Math.round(q.width) }; })()`);
await ev(`HeresyFind.close(false); true`);
await ev(`document.querySelector('#view-compose .frame-big').click(); true`);
await waitFor(`!document.body.dataset.frame`, 3000, 50);
check("  in a lifted frame (drawn 1.2 larger) the mark sits on the words: inside the box, as tall as its letters drawn larger",
  zoomed.mark && zoomed.k > 1.1 && zoomed.inside && zoomed.height >= zoomed.font * 0.9 && zoomed.height <= zoomed.line + 3 && zoomed.wide > 20, JSON.stringify(zoomed));
// «Если у Творца ПРОФИЛЬ - музыка, деактивируй текстовый профиль»
const tpMusic = await ev(`(() => { const s = document.getElementById("setupLib"); s.value = "b0"; s.dispatchEvent(new Event("change", { bubbles: true }));
  return { off: document.getElementById("tpRow").classList.contains("is-off"), pick: document.getElementById("tpPick").disabled, apply: document.getElementById("tpApply").disabled,
    tip: document.getElementById("tpRow").dataset.tip || "" }; })()`);
const tpSpeech = await ev(`(() => { const s = document.getElementById("setupLib"); s.value = "b1"; s.dispatchEvent(new Event("change", { bubbles: true }));
  const out = { off: document.getElementById("tpRow").classList.contains("is-off"), pick: document.getElementById("tpPick").disabled, apply: document.getElementById("tpApply").disabled };
  s.value = "b0"; s.dispatchEvent(new Event("change", { bubbles: true })); return out; })()`);
check("  the text profile is off (dimmed, its tip saying why) with a music profile chosen, and on with Speech",
  tpMusic.off && tpMusic.pick && tpMusic.apply && /pick a Speech profile/.test(tpMusic.tip) && !tpSpeech.off && !tpSpeech.pick && !tpSpeech.apply,
  JSON.stringify({ tpMusic, tpSpeech }));
await ev(`(() => { const a = document.getElementById("lyrics"); a.value = ""; a.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);

// ================================================================== the section tags offered under a «[»
section("The section tags offered under a «[» in the lyrics");
// HERESY 1168 (Viktor 07.10.2026: «при наборе `[` появлялись как в кодовых IDE подсказки с выбором, Enter и вставка? Базовые в
// самом начале — Verse, Bridge, etc, но на особые Intro, Outro, END проверка, если уже есть в тексте»)
const tcKey = async (key, code, vk, extra = {}) => {
  await send("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode: vk, ...extra });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: vk, modifiers: extra.modifiers || 0 });
  await sleep(60);
};
const tcSet = (v) => ev(`(() => { const a = document.getElementById("lyrics"); a.value = ${JSON.stringify(v)}; a.dispatchEvent(new Event("input", { bubbles: true }));
  a.scrollIntoView({ block: "center" }); a.focus(); a.setSelectionRange(a.value.length, a.value.length); return true; })()`);
const tcState = () => ev(`HeresyComplete.state()`);
const tcTail = (n) => ev(`(() => { const a = document.getElementById("lyrics"); return { tail: a.value.slice(-${n}), caret: a.selectionStart === a.value.length }; })()`);
const tcWhere = () => ev(`(() => { const p = document.querySelector(".tc-pop"), a = document.getElementById("lyrics"); if (!p || p.hidden) return null;
  const q = p.getBoundingClientRect(), r = a.getBoundingClientRect();
  return { inside: q.left >= r.left - 12 && q.top >= r.top && q.top <= r.bottom + 30, about: p.querySelector(".tc-about").textContent }; })()`);
await tcSet("[Intro]\nвступ\n[Verse 1]\nстрока\n[Chorus]\nприпев\n");
await sleep(150);
await tcKey("[", "BracketLeft", 219, { text: "[" });
const tc1 = await tcState(), tcAt = await tcWhere();
check("A «[» at a line's start opens the tags along a song's arc, Intro to End (as the examples write it, since his 08.10); Intro, there already, in its place and dimmed; the next verse in hand (the lyrics number theirs); nothing the 110 official examples never write ([Break], [Inst])",
  tc1.open && tc1.box === "lyrics" && tc1.active === "[Verse 2]" && tc1.tags.slice(0, 7).join() === "[Intro]@1,[Instrumental Intro],[Verse 2],[Pre-Chorus],[Chorus],[Post-Chorus],[Refrain]" && !tc1.tags.some((t) => /^\[(Break|Inst)\]/.test(t)) &&
  tc1.tags[tc1.tags.length - 1] === "[End]" && !!tcAt && tcAt.inside && /the next one/.test(tcAt.about), JSON.stringify({ tc1, tcAt }));
// HERESY 1169 (Viktor 08.10.2026: «ты правильно деактивируешь единственные вхождения в промпт лирики, но позволь двигаться по ним
// и читать шпаргалку/описание»): ↑ ↑ from the next verse reaches the Intro there already; Enter leaves the lyrics as they are
await tcKey("ArrowUp", "ArrowUp", 38); await tcKey("ArrowUp", "ArrowUp", 38);
const tcOnce = { active: (await tcState()).active, about: await ev(`document.querySelector(".tc-about").textContent`), before: (await tcTail(12)).tail };
await tcKey("Enter", "Enter", 13, { text: "\r" });
const tcOnce2 = { open: (await tcState()).open, after: (await tcTail(12)).tail };
await tcKey("ArrowDown", "ArrowDown", 40); await tcKey("ArrowDown", "ArrowDown", 40);
check("  Intro, there already, is reached by ↑ and read (its line said), and Enter does not put it in twice",
  tcOnce.active === "[Intro]" && /Already in the lyrics, line 1/.test(tcOnce.about) && /^\[Intro\]The opening/.test(tcOnce.about) && tcOnce2.open && tcOnce2.after === tcOnce.before &&
  (await tcState()).active === "[Verse 2]", JSON.stringify({ tcOnce, tcOnce2 }));
// HERESY 1169 (Viktor 07.10.2026: «Ширину зафиксируй в дропдауне подстановки по `[`»): as wide and its note as high whichever
// tag is in hand (Interlude's note runs long)
// 08.10: «Две колонки, высота селектора не изменяется… В левой фиксированной теги. А в правой красиво и крупновато - описания»
const tcSize = () => ev(`(() => { const r = document.querySelector(".tc-pop").getBoundingClientRect(); return Math.round(r.width) + "x" + Math.round(r.height); })()`);
const tcSizes = [await tcSize()];
for (let i = 0; i < 4; i++) { await tcKey("ArrowDown", "ArrowDown", 40); tcSizes.push(await tcSize()); }
const tcFar = { active: (await tcState()).active, about: await ev(`document.querySelector(".tc-about").textContent`),
  cols: await ev(`(() => { const l = document.querySelector(".tc-list").getBoundingClientRect(), a = document.querySelector(".tc-about").getBoundingClientRect(); return a.left >= l.right - 1 && Math.abs(a.top - l.top) < 2; })()`) };
for (let i = 0; i < 4; i++) await tcKey("ArrowUp", "ArrowUp", 38);
check("  the list keeps its size whichever tag is in hand; beside it, what the tag is and how often the examples write it",
  new Set(tcSizes).size === 1 && tcFar.active === "[Refrain]" && tcFar.cols && /^\[Refrain\]A line or two repeated unchanged/.test(tcFar.about) &&
  /4 times in the 110 official examples/.test(tcFar.about) && (await tcState()).active === "[Verse 2]", JSON.stringify({ tcSizes, tcFar }));
await send("Input.insertText", { text: "ch" });
await sleep(60);
const tc2 = await tcState(), tcSizeCh = await tcSize();
await tcKey("ArrowDown", "ArrowDown", 40);
const tc3 = await tcState();
await tcKey("Enter", "Enter", 13, { text: "\r" });
const tc4 = { ...(await tcTail(24)), open: (await tcState()).open };
await ev(`document.execCommand("undo"); true`);
const tc5 = await tcTail(8);
check("  «ch» narrows it (Chorus, then the ones with a chorus inside, along the arc); ↓ and Enter put [Pre-Chorus] on its own line, the cursor under it; Ctrl+Z takes it back",
  tc2.tags.join() === "[Chorus],[Pre-Chorus],[Post-Chorus],[Final Chorus]" && tc3.active === "[Pre-Chorus]" &&
  tc4.tail.endsWith("припев\n[Pre-Chorus]\n") && tc4.caret && !tc4.open && tc5.tail.endsWith("\n[ch"), JSON.stringify({ tc2, tc3, tc4, tc5 }));
check("  narrowed to four tags, the box keeps its size", tcSizeCh === tcSizes[0], JSON.stringify({ tcSizeCh, open: tcSizes[0] }));
// in a lifted frame; Esc closes it and the frame stays (and so for the find bar, whose Esc folded the frame too)
await tcSet("[Verse]\nстрока\n");
await click('#view-compose .frame-big');
await waitFor(`document.body.dataset.frame === "compose"`, 3000, 50);
await sleep(300);
await ev(`(() => { const a = document.getElementById("lyrics"); a.scrollIntoView({ block: "center" }); a.focus(); a.setSelectionRange(a.value.length, a.value.length); return true; })()`);
await sleep(150);
await tcKey("[", "BracketLeft", 219, { text: "[" });
const tcZ = { open: (await tcState()).open, at: await tcWhere() };
await tcKey("Escape", "Escape", 27);
const tcE1 = { open: (await tcState()).open, frame: await ev(`document.body.dataset.frame || null`), ...(await tcTail(2)) };
await send("Input.insertText", { text: "v" });
await sleep(60);
const tcE2 = (await tcState()).open;
await tcKey("Backspace", "Backspace", 8);
await tcKey("Backspace", "Backspace", 8);
await tcKey("[", "BracketLeft", 219, { text: "[" });
const tcE3 = (await tcState()).open;
await tcKey("Escape", "Escape", 27);
await ev(`document.getElementById("lyrics").dispatchEvent(new KeyboardEvent("keydown", { key: "f", code: "KeyF", ctrlKey: true, bubbles: true, cancelable: true })); true`);
await sleep(80);
await tcKey("Escape", "Escape", 27);
const tcF = { bar: await ev(`HeresyFind.state().open`), frame: await ev(`document.body.dataset.frame || null`), focus: await ev(`document.activeElement.id`) };
await tcKey("Escape", "Escape", 27);
const tcF2 = await ev(`document.body.dataset.frame || null`);
check("  in a lifted frame it opens under its line; Esc closes it, the «[» stays and so does the frame; on that «[» it stays closed, one typed anew opens it; Esc in the find bar closes the bar, not the frame",
  tcZ.open && !!tcZ.at && tcZ.at.inside && !tcE1.open && tcE1.frame === "compose" && tcE1.tail === "\n[" && !tcE2 && tcE3 &&
  !tcF.bar && tcF.frame === "compose" && tcF.focus === "lyrics" && tcF2 === null, JSON.stringify({ tcZ, tcE1, tcE2, tcE3, tcF, tcF2 }));
// a «[» inside a line opens nothing; «]» closes it; Ctrl+Space types the «[» at a line's start and opens it; a click puts a tag in
await tcSet("строка ");
await tcKey("[", "BracketLeft", 219, { text: "[" });
const tcMid = (await tcState()).open;
await tcSet("строка\n");
await tcKey("[", "BracketLeft", 219, { text: "[" });
await send("Input.insertText", { text: "v" });
await sleep(60);
const tcV = (await tcState()).open;
await tcKey("]", "BracketRight", 221, { text: "]" });
const tcShut = (await tcState()).open;
await tcSet("строка\n");
await tcKey(" ", "Space", 32, { modifiers: 2 });
const tcCs = { ...(await tcState()), ...(await tcTail(2)) };
const tcBr = await ev(`(() => { const o = [...document.querySelectorAll(".tc-item")].find(e => e.querySelector(".tc-tag").textContent === "[Chorus]"); if (!o) return null;
  const b = o.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
if (tcBr) {
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: tcBr.x, y: tcBr.y });
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: tcBr.x, y: tcBr.y, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: tcBr.x, y: tcBr.y, button: "left", clickCount: 1 });
  await sleep(80);
}
const tcClick = { ...(await tcTail(10)), open: (await tcState()).open, focus: await ev(`document.activeElement.id`) };
check("  a «[» inside a line opens nothing; «]» closes it (a tag of one's own); Ctrl+Space at a line's start types the «[» and opens it; a click puts a tag in",
  tcMid === false && tcV === true && tcShut === false && tcCs.open && tcCs.tail === "\n[" && tcClick.tail === "\n[Chorus]\n" && !tcClick.open && tcClick.focus === "lyrics",
  JSON.stringify({ tcMid, tcV, tcShut, tcCs, tcBr, tcClick }));
const tcLogic = await ev(`(() => { const o = (t, q) => HeresyComplete.offer(t, q).map(i => i.tag + (i.there !== undefined ? "@" + (i.there + 1) : ""));
  return { once: [o("[Intro]\\nстрока\\n[END]\\n", "")[0], o("[Intro]\\nстрока\\n[END]\\n", "").slice(-1)[0]].join(), outro: o("[Intro]\\n[END]\\n", "").indexOf("[Outro]") >= 0,
    next: o("[Verse 1]\\nа\\n[Verse 2]\\nб\\n", "v").join(), num: o("", "v2").join(), dup: o("[Verse 2]\\n", "verse 2").join(), ru: o("", "мук").join(),
    word: o("", "solo").join(), desc: o("", "Verse 1 – Him").length, intro: o("[Intro: Piano & Flute]\\n", "intr").join(),
    writer: document.getElementById("wrLyrics").getAttribute("aria-autocomplete") }; })()`);
check("  Intro and End there (his [END] too, an Intro with what plays) stand last with their lines; the next verse; a typed number numbers it, one there already dimmed; a Russian layout and a later word find; the Writer's lyrics too",
  tcLogic.once === "[Intro]@1,[End]@3" && tcLogic.outro && tcLogic.next.split(",")[0] === "[Verse 3]" && tcLogic.num.split(",")[0] === "[Verse 2]" && tcLogic.dup === "[Verse 2]@1" &&
  tcLogic.ru === "[Verse]" && tcLogic.word === "[Guitar Solo]" && tcLogic.desc === 0 && tcLogic.intro === "[Intro]@1,[Instrumental Intro]" && tcLogic.writer === "list", JSON.stringify(tcLogic));

// HERESY 1169 (Viktor 08.10.2026: «по остальным, что не найдены в 110 примерах официальных добавь и эти, но пометь как тестовые»)
const tcTest = await ev(`(() => { const all = HeresyComplete.offer("", ""), i = all.findIndex(x => x.tag === "[Skit]"), j = all.findIndex(x => x.tag === "[Instrumental]");
  return { test: all.filter(x => x.test).map(x => x.tag).join(), after: j >= 0 && i > j, gone: !all.some(x => /^\\[(Break|Inst)\\]$/.test(x.tag)) }; })()`);
await tcSet("строка\n");
await tcKey("[", "BracketLeft", 219, { text: "[" });
await send("Input.insertText", { text: "sk" });
await sleep(80);
const tcSkit = { ...(await tcState()), about: await ev(`(document.querySelector(".tc-about") || {}).textContent || ""`),
  say: await ev(`(document.querySelector(".tc-item.is-on .tc-say") || {}).textContent || ""`) };
await tcKey("Escape", "Escape", 27);
await tcSet("строка\n[Bridge]\n");
check("  Genius's sections none of the 110 examples writes stand last, marked TEST, with what they are; no [Break], no [Inst]",
  tcTest.test === "[Scatting],[Yodeling],[Non-Lyrical Vocals],[Skit],[Segue],[Part],[Instrumental Outro]" && tcTest.after && tcTest.gone &&
  tcSkit.active === "[Skit]" && tcSkit.say === "TEST" && /^\[Skit\]A short scene/.test(tcSkit.about) && /TEST: none of the 110/.test(tcSkit.about), JSON.stringify({ tcTest, tcSkit }));
// «На 110% уже съехала вниз»: a match whose line stands under the lifted frame's sticky Generate bar (70 px; the frame's own box
// reaches under it) is scrolled into view and marked on its words; the same for a stress mark astray
const deadLyr = Array.from({ length: 24 }, (_, i) => i === 22 ? "МальВи́на права онлайн по утру́" : i === 20 ? "́строка с ударением на пустоте" :
  i % 6 === 0 ? "[Verse " + (i / 6 + 1) + "]" : "строка номер " + i + " песни").join("\n");
const underBar = (line) => ev(`(async () => { const a = document.getElementById("lyrics"), f = document.getElementById("view-compose"), bar = document.querySelector("#view-compose .submit-bar");
  const k = a.getBoundingClientRect().width / a.offsetWidth, kid = document.querySelector(".lyr-mirror").children[${line}], bt = parseFloat(getComputedStyle(a).borderTopWidth);
  for (let i = 0; i < 3; i++) { const y = a.getBoundingClientRect().top + k * (bt + kid.offsetTop - a.scrollTop); f.scrollTop += (y - (bar.getBoundingClientRect().top + 12)) / k; await new Promise(r => requestAnimationFrame(r)); }
  const y = a.getBoundingClientRect().top + k * (bt + kid.offsetTop - a.scrollTop);
  return (document.elementFromPoint(a.getBoundingClientRect().left + 40, y + 8) || {}).className || ""; })()`);
const lineSeen = (line) => ev(`(() => { const a = document.getElementById("lyrics"), cs = getComputedStyle(a), k = a.getBoundingClientRect().width / a.offsetWidth;
  const kid = document.querySelector(".lyr-mirror").children[${line}], y = a.getBoundingClientRect().top + k * (parseFloat(cs.borderTopWidth) + kid.offsetTop - a.scrollTop + parseFloat(cs.lineHeight) / 2);
  const el = document.elementFromPoint(a.getBoundingClientRect().left + 40, y); return el ? el.id || el.className : null; })()`);
await tcSet(deadLyr);
await click('#view-compose .frame-big');
await waitFor(`document.body.dataset.frame === "compose"`, 3000, 50);
await sleep(400);
const deadHid = await underBar(22);
const findOpen = (q) => ev(`(() => { const a = document.getElementById("lyrics"); a.focus({ preventScroll: true }); a.setSelectionRange(0, 0);
  a.dispatchEvent(new KeyboardEvent("keydown", { key: "f", code: "KeyF", ctrlKey: true, bubbles: true, cancelable: true }));
  const i = document.getElementById("findQ"); i.value = ${JSON.stringify(q)}; i.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
await findOpen("права");
await sleep(400);
const deadFind = await ev(`(() => { const m = document.querySelector(".find-mark"); if (!m) return { mark: false };
  const q = m.getBoundingClientRect(), el = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2); return { mark: true, at: el ? el.id || el.className : null }; })()`);
// HERESY 1169 (Viktor at 100 % and 125 %: «по горизонтали бежит влево… С увеличением скейла страницы больше смещение»): the
// find's copy of the box stands beside it, drawn at its zoom, so the mark stands on its letters along the line too
const fx = await ev(`(() => { const a = document.getElementById("lyrics"), m = document.querySelector(".find-mark"), mir = document.querySelector(".find-mirror"), cs = getComputedStyle(a);
  const st = HeresyFind.state(), h = HeresyFind.find(a.value, "права")[st.at], ref = document.createElement("div"), span = document.createElement("mark");
  ["fontFamily", "fontSize", "fontWeight", "fontStyle", "lineHeight", "letterSpacing", "wordSpacing", "tabSize", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft"].forEach(k => ref.style[k] = cs[k]);
  Object.assign(ref.style, { position: "absolute", visibility: "hidden", whiteSpace: "pre-wrap", overflowWrap: "break-word", boxSizing: "border-box", border: "0", width: a.clientWidth + "px" });
  ref.textContent = a.value.slice(0, h[0]); span.textContent = a.value.slice(h[0], h[1]); ref.appendChild(span); a.parentNode.appendChild(ref);
  const r = a.getBoundingClientRect(), k = r.width / a.offsetWidth, q = span.getBoundingClientRect(), b = ref.getBoundingClientRect();
  const want = r.left + k * parseFloat(cs.borderLeftWidth) + (q.left - b.left) - k * a.scrollLeft;
  ref.remove();
  return { beside: !!mir && mir.parentNode === a.parentNode, off: m ? Math.round(Math.abs(m.getBoundingClientRect().left - want) * 10) / 10 : null, k: Math.round(k * 100) / 100 }; })()`);
await ev(`HeresyFind.close(false); true`);
check("  find under the lifted frame's sticky Generate bar: the match scrolled into view, its mark on its words (not on the bar)",
  deadHid === "submit-bar" && deadFind.mark && deadFind.at === "lyrics", JSON.stringify({ deadHid, deadFind }));
check("  the find's copy of the box stands beside it, drawn at the lifted frame's zoom: the mark on its letters along the line too",
  fx.beside && fx.off !== null && fx.off <= 0.5 && fx.k > 1.1, JSON.stringify(fx));
const stressHid = await underBar(20);
await ev(`document.querySelector('#lyricsMeter [data-lyr="stress"]').click(); true`);
await sleep(300);
const stressAt = { seen: await lineSeen(20), sel: await ev(`(() => { const a = document.getElementById("lyrics"); return [...a.value.slice(a.selectionStart, a.selectionEnd)].map(c => c.codePointAt(0).toString(16)).join(" "); })()`) };
check("  a stress mark astray under the same bar: its button brings the line into view, the mark selected", stressHid === "submit-bar" && stressAt.seen === "lyrics" && /^301 /.test(stressAt.sel),
  JSON.stringify({ stressHid, stressAt }));
// «встал курсором на другом месте, и единое движение клавишами… переносит оттуда на место поиска»: the bar open on a match far
// down (out of the box's view), words typed at the top leave the view where it is; Esc from the box closes it, the cursor stays
const longLyr = Array.from({ length: 46 }, (_, i) => i === 40 ? "МальВи́на права онлайн по утру́" : i % 6 === 0 ? "[Verse " + (i / 6 + 1) + "]" : "строка номер " + i + " песни").join("\n");
await ev(`(() => { const a = document.getElementById("lyrics"); a.value = ${JSON.stringify(longLyr)}; a.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
await sleep(200);
await findOpen("права");
await sleep(400);
const fAway = await ev(`(async () => { const a = document.getElementById("lyrics"), f = document.getElementById("view-compose"), head = document.querySelector("#view-compose > .col-head");
  a.scrollTop = 0; await new Promise(r => requestAnimationFrame(r));
  const k = a.getBoundingClientRect().width / a.offsetWidth, kid = document.querySelector(".lyr-mirror").children[1], bt = parseFloat(getComputedStyle(a).borderTopWidth);
  const roof = () => Math.max(f.getBoundingClientRect().top, head ? head.getBoundingClientRect().bottom : 0) + 30;
  for (let i = 0; i < 3; i++) { const y = a.getBoundingClientRect().top + k * (bt + kid.offsetTop - a.scrollTop); f.scrollTop += (y - roof()) / k; await new Promise(r => requestAnimationFrame(r)); }
  const at = a.value.indexOf("\\n") + 4; a.focus({ preventScroll: true }); a.setSelectionRange(at, at); await new Promise(r => requestAnimationFrame(r));
  return { at, frame: f.scrollTop, boxTop: a.scrollTop, said: HeresyFind.state().said }; })()`);
const fAwaySeen = await lineSeen(40);
await send("Input.insertText", { text: "х" });
await sleep(250);
const fAwayAfter = await ev(`({ ...HeresyFind.state(), frame: document.getElementById("view-compose").scrollTop, boxTop: document.getElementById("lyrics").scrollTop })`);
await tcKey("Escape", "Escape", 27);
const fAwayEsc = await ev(`({ open: HeresyFind.state().open, caret: document.getElementById("lyrics").selectionStart, frame: document.getElementById("view-compose").scrollTop,
  boxTop: document.getElementById("lyrics").scrollTop, framed: document.body.dataset.frame || null })`);
check("  the find bar open on a match out of view: words typed elsewhere count the matches again and leave the view; Esc from the box closes the bar, the cursor stays",
  fAway.said === "1 of 1" && fAwaySeen !== "lyrics" && Math.abs(fAwayAfter.frame - fAway.frame) < 2 && Math.abs(fAwayAfter.boxTop - fAway.boxTop) < 2 && fAwayAfter.open && fAwayAfter.said === "1 of 1" &&
  !fAwayEsc.open && fAwayEsc.caret === fAway.at + 1 && Math.abs(fAwayEsc.frame - fAway.frame) < 2 && Math.abs(fAwayEsc.boxTop - fAway.boxTop) < 2 && fAwayEsc.framed === "compose",
  JSON.stringify({ fAway, fAwaySeen, fAwayAfter, fAwayEsc }));
await ev(`document.querySelector('#view-compose .frame-big').click(); true`);
await waitFor(`!document.body.dataset.frame`, 3000, 50);
await tcSet("");
await ev(`document.getElementById("lyrics").blur(); true`);
// HERESY 1169 (the rc3 list: «Every button that cannot be undone behind a dialog»): asked first, and only when something would go
const asks = async (setup, sel) => {
  await ev(`(() => { ${setup}; return true; })()`);
  await ev(`document.querySelector(${JSON.stringify(sel)}).click(); true`);
  const shown = await waitFor(`!!document.querySelector(".hd-back.is-on:not(.is-leaving) .hd-yes")`, 1200, 50);
  if (shown) await answerDialog(false);
  return !!shown;
};
const temp = `document.querySelector('input[data-group="abc"][data-key="temperature"]')`;
const dlg = {};
dlg.scoreFull = await asks(`document.getElementById("abc").value = "X:1\\nK:C\\nCDEF|"`, "#abcRemove");
dlg.scoreKept = await ev(`document.getElementById("abc").value.startsWith("X:1")`);
dlg.replace = await asks(``, '[data-abc="score"]');
await ev(`document.getElementById("abcRemove").click(); true`);
await answerDialog(true);
dlg.scoreGone = await ev(`document.getElementById("abc").value === ""`);
dlg.scoreEmpty = await asks(`document.getElementById("abc").value = ""`, "#abcRemove");
dlg.samplingMoved = await asks(`const k = ${temp}; k.value = String(Math.round((+k.value + 0.1) * 100) / 100)`, "#resetSampling");
dlg.samplingKept = await ev(`${temp}.value`);
await ev(`document.getElementById("resetSampling").click(); true`);
await answerDialog(true);
dlg.samplingAtDefault = await asks(``, "#resetSampling");
dlg.sliders = await asks(`document.getElementById("shapeComposition").value = 4`, "#shapeReset");
await ev(`document.getElementById("shapeComposition").value = 2; true`);
dlg.output = await asks(`document.getElementById("odeSteps").value = "64"`, "#resetOutput");
await ev(`document.getElementById("odeSteps").value = "32"; true`);
dlg.art = await (async () => { await ev(`HeresyArt.remove("no-such-take"); true`); const s = await waitFor(`!!document.querySelector(".hd-back.is-on:not(.is-leaving) .hd-yes")`, 1200, 50); if (s) await answerDialog(false); return !!s; })();
check("Asked first, and only when something would go: the score removed or replaced, sampling, the sliders and the output reset, the artwork taken off; with nothing to lose, no question",
  dlg.scoreFull && dlg.scoreKept && dlg.replace && dlg.scoreGone && !dlg.scoreEmpty && dlg.samplingMoved && dlg.samplingKept !== null && !dlg.samplingAtDefault && dlg.sliders && dlg.output && dlg.art,
  JSON.stringify(dlg));

// «Расширь селектор солвера на две колонки, чтобы была симетрия»
const outRows = (fmt) => ev(`(() => { document.getElementById("advDrawer").open = true; const s = document.getElementById("outFormat"); s.value = ${JSON.stringify(fmt)}; s.dispatchEvent(new Event("change", { bubbles: true }));
  const box = (id) => document.getElementById(id).closest(".field").getBoundingClientRect(), ids = ["odeSteps", "odeSolver", "outFormat", "mp3Bitrate", "peakClip"];
  const shown = ids.filter(id => document.getElementById(id).closest(".field").checkVisibility()), tops = [...new Set(shown.map(id => Math.round(box(id).top)))];
  return { rows: tops.map(t => shown.filter(id => Math.round(box(id).top) === t).join("+")).join(" / "), wide: Math.round(box("odeSolver").width / box("odeSteps").width * 10) / 10 }; })()`);
const solWav = await outRows("wav24"), solMp3 = await outRows("mp3");
await outRows("wav24");
// HERESY 1169: Sound and output is Sampling's lower section now, in its two columns (Sounds went to Generate's row)
check("Sound and output under the sampling, in its two columns: steps and solver, format and peak clip; with MP3, its bitrate beside the format",
  solWav.rows === "odeSteps+odeSolver / outFormat+peakClip" && solWav.wide === 1 && solMp3.rows === "odeSteps+odeSolver / outFormat+mp3Bitrate / peakClip" && solMp3.wide === 1,
  JSON.stringify({ solWav, solMp3 }));

// HERESY 1169 (the rc3 list: «The Writer's models with their prices, from OpenRouter's list, as you type»)
const orp = await ev(`(() => {
  HeresyOrModels.take([{ id: "test/cheap", name: "Test: Cheap", pricing: { prompt: "0.0000004", completion: "0.0000016" }, context_length: 163840 },
    { id: "test/free", name: "Test: Free", pricing: { prompt: "0", completion: "0" }, context_length: 32768 },
    { id: "deepseek/deepseek-v4-pro", name: "DeepSeek: V4 Pro", pricing: { prompt: "0.0000004", completion: "0.0000016" }, context_length: 1000000 }]);
  const f = document.getElementById("orModel"), before = f.value;
  const say = v => { f.value = v; f.dispatchEvent(new Event("input", { bubbles: true })); return document.getElementById("orPrice").textContent; };
  const out = { labels: [...document.querySelectorAll("#orModels option")].map(o => o.value + "=" + o.label).join(" | "), cheap: say("test/cheap"), free: say("test/free"),
    none: say("test/none"), amber: document.getElementById("orPrice").classList.contains("is-off"), pick: document.querySelector('[data-or-model="deepseek/deepseek-v4-pro"]').dataset.tip,
    title: document.querySelector('[data-or-model="deepseek/deepseek-v4-pro"]').hasAttribute("title") };
  say(before); return out; })()`);
check("The Writer's OpenRouter models with their prices: in the list as you type, under the field, on the quick picks; a name not in the list said so",
  orp.labels.includes("test/cheap=$0.40 in · $1.60 out per million tokens · 164K") && orp.cheap === "Test: Cheap · $0.40 in · $1.60 out per million tokens · 164K context" &&
  orp.free.startsWith("Test: Free · free") && /Not in OpenRouter's list/.test(orp.none) && orp.amber && /the default · \$0\.40 in · \$1\.60 out/.test(orp.pick) && !orp.title,
  JSON.stringify(orp));

// HERESY 1169 (Viktor 07.10.2026: «Давай шорткат Shift+Tab блокируем для обратного хождения по полям, а именно для переключения
// между композером и Исполнителем… когда фрейм опущен… подымает оверлей во фрейме композера… всегда в композере»)
const shiftTab = async () => {
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, modifiers: 8 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, modifiers: 8 });
  await sleep(250);
  return ev(`document.body.dataset.frame || null`);
};
await ev(`(() => { if (document.body.dataset.frame) document.getElementById("frameVeil").click(); document.getElementById("title").focus(); return true; })()`);
await sleep(200);
const sTab = { lift: await shiftTab(), swap: await shiftTab(), back: await shiftTab() };
sTab.focus = await ev(`document.activeElement.id`);
await tcKey("Escape", "Escape", 27);
sTab.down = await ev(`document.body.dataset.frame || null`);
await ev(`document.querySelector('[data-tab="write"]').click(); true`);
await sleep(400);
sTab.writer = await ev(`(() => { const e = new KeyboardEvent("keydown", { key: "Tab", code: "Tab", shiftKey: true, bubbles: true, cancelable: true }); document.body.dispatchEvent(e);
  return { prevented: e.defaultPrevented, frame: document.body.dataset.frame || null }; })()`);
await ev(`document.querySelector('[data-tab="create"]').click(); true`);
await sleep(400);
check("Shift+Tab in the Creator is the frames' key: none lifted lifts the form's, then the take's, then the form's again with the cursor where it stood; Esc puts it down; the Writer keeps the fields' way back",
  sTab.lift === "compose" && sTab.swap === "take" && sTab.back === "compose" && sTab.focus === "title" && sTab.down === null && !sTab.writer.prevented && sTab.writer.frame === null,
  JSON.stringify(sTab));
// «Для F5 добавляем блокер с диалогом и чреватостью… Можно предложить автоматическое сохранение композера в комнату Писателя»
const keepForm = await ev(`({ style: document.getElementById("style").value, lyrics: document.getElementById("lyrics").value })`);
const reloadKey = (opts) => ev(`(() => { const e = new KeyboardEvent("keydown", Object.assign({ bubbles: true, cancelable: true }, ${JSON.stringify(opts)})); window.dispatchEvent(e); return e.defaultPrevented; })()`);
const dialogNow = async () => {
  if (!(await waitFor(`!!document.querySelector(".hd-back.is-on:not(.is-leaving) .hd-yes")`, 2000, 50))) return null;
  const d = await ev(`(() => { const b = document.querySelector(".hd-back.is-on:not(.is-leaving)");
    return { yes: b.querySelector(".hd-yes").textContent, alt: (b.querySelector(".hd-alt") || {}).textContent || null, no: b.querySelector(".hd-no").textContent,
      says: /undo history/.test(b.textContent) }; })()`);
  await answerDialog(false);
  return d;
};
await ev(`window.__staysAlive = 1; window.ruachEdited(true); document.getElementById("lyrics").value = "[Verse]\\nстрока песни"; true`);
const rl = { f5: await reloadKey({ key: "F5", code: "F5" }) };
rl.song = await dialogNow();
rl.ctrlR = await reloadKey({ key: "r", code: "KeyR", ctrlKey: true });
rl.ctrlRDialog = await dialogNow();
rl.ctrlShiftR = await reloadKey({ key: "R", code: "KeyR", ctrlKey: true, shiftKey: true });
rl.ctrlShiftRDialog = !!(await dialogNow());
await ev(`document.getElementById("style").value = ""; document.getElementById("lyrics").value = ""; true`);
rl.emptyPrevented = await reloadKey({ key: "F5", code: "F5" });
rl.empty = await dialogNow();
rl.hard = await reloadKey({ key: "F5", code: "F5", ctrlKey: true });
rl.alive = await ev(`window.__staysAlive === 1`);
await ev(`(() => { document.getElementById("style").value = ${JSON.stringify(keepForm.style)}; document.getElementById("lyrics").value = ${JSON.stringify(keepForm.lyrics)}; return true; })()`);
check("F5, Ctrl+R and Ctrl+Shift+R ask first, saying what a reload takes and keeps; with a song: Save to the Writer, then reload / Reload / Stay, without one: Reload / Stay; Stay keeps the page; Ctrl+F5 reloads at once",
  rl.ctrlShiftR && rl.ctrlShiftRDialog && rl.f5 && rl.song && rl.song.yes === "Save to the Writer, then reload" && rl.song.alt === "Reload" && rl.song.no === "Stay" && rl.song.says && rl.ctrlR && !!rl.ctrlRDialog &&
  rl.emptyPrevented && rl.empty && rl.empty.yes === "Reload" && rl.empty.alt === null && !rl.hard && rl.alive,
  JSON.stringify({ empty: rl.empty, hard: rl.hard, alive: rl.alive, ctrlR: rl.ctrlR, e: rl.emptyPrevented }));

// HERESY 1169 (the rc3 list «One shape for the icon buttons»; Viktor: «Б. Все в рамке… 2px закругление… плеерные кнопки не
// трогаем»; «Кнопку текстовую + New song замени на иконку, и сделай кнопку в два раза шире»)
const shapes = await ev(`(() => {
  const r = s => { const e = document.querySelector(s); if (!e) return null; const c = getComputedStyle(e); return parseFloat(c.borderTopLeftRadius) + "/" + c.borderTopStyle; };
  const ns = document.getElementById("newSong"), op = document.getElementById("openPrompt");
  return { tools: r("#openPrompt"), frame: r("#view-compose .frame-big"), dice: r(".dice"), player: r("#pbLike"),
    icon: !!ns.querySelector("svg.hz-icon") && ns.classList.contains("icon-only") && ns.getAttribute("aria-label") === "New song",
    wide: Math.round(ns.getBoundingClientRect().width / op.getBoundingClientRect().width * 10) / 10 }; })()`);
check("One shape for the icon buttons: framed with 2px corners (the tools, the frames' buttons, the dice), the player's as they were; New song an icon, twice as wide",
  shapes.tools === "2/solid" && shapes.frame === "2/solid" && shapes.dice === "2/solid" && shapes.player !== "2/solid" && shapes.icon && shapes.wide >= 1.8, JSON.stringify(shapes));

// HERESY 1169 (Viktor 07.10.2026: «к каждой комнате по её порядку можно прикрутить Ctrl+1»; «Да, делай Ctrl+Alt+1…6»)
const roomKey = async (d) => {
  await ev(`(() => { const e = new KeyboardEvent("keydown", { key: "${d}", code: "Digit${d}", ctrlKey: true, altKey: true, bubbles: true, cancelable: true }); window.dispatchEvent(e); return true; })()`);
  await sleep(350);
  return ev(`(document.getElementById("view-engine").classList.contains("is-hidden") ? "" : "engine:") + document.body.dataset.tab`);
};
const rooms = { two: await roomKey(2), three: await roomKey(3), four: await roomKey(4), five: await roomKey(5), seven: await roomKey(7), nine: await roomKey(9), one: await roomKey(1) };
check("Ctrl+Alt+1…9 by Viktor's plan: 1 Creator, 2 Writer, 3 Refiner, 4 the Artist (its room open since 1255), 5 Librarian, 7 Trainer, 9 the Engine",
  rooms.two === "write" && rooms.three === "post" && rooms.four === "artist" && rooms.five === "collection" && rooms.seven === "train" && rooms.nine.startsWith("engine:") &&
  rooms.one === "create", JSON.stringify(rooms));


// HERESY 1169 (Viktor 07.10.2026: «Творец → Писатель → Огранщик → (Художник) → Библиотекарь ЛОГО Trainer»; «нереализованные
// оставь grayed out & non-clicable»; «кнопку экспорта в DAW перенести в спадающее меню… и продублировать в правильных местах
// в самом Огранщике»)
await send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 960, deviceScaleFactor: 1, mobile: false });
await ev(`document.querySelector('.topbar [data-tab="create"]').click(); true`);   // 1266: no tall bar to set
await sleep(500);
const barNow = () => ev(`(() => {
  const r = (e) => e.getBoundingClientRect(), logo = document.querySelector(".topbar .brand"), barH = Math.round(r(document.querySelector(".topbar")).height), side = document.getElementById("tabsSide"), tabs = document.getElementById("tabs");
  const art = document.getElementById("tabArtist"), ws = document.querySelector(".topbar .ws-current"), daw = document.getElementById("dawOpen");
  return { barH, rooms: [...tabs.querySelectorAll("button")].map(b => b.textContent.trim()).join("|"), side: [...side.querySelectorAll("button")].map(b => b.textContent.trim()).join("|"),
    artistOn: art.dataset.tab === "artist" && !art.hasAttribute("aria-disabled") && !art.classList.contains("tab-soon"), artistDim: +getComputedStyle(art).opacity < .6,
    logoShown: getComputedStyle(logo).display !== "none", logoRight: Math.round(r(logo).right), sideLeft: Math.round(r(side).left), sideRight: Math.round(r(side).right),
    tabsRight: Math.round(r(tabs).right), wsLeft: Math.round(r(ws).left),
    sideMid: Math.round((r(side).top + r(side).bottom) / 2), tabsMid: Math.round((r(tabs).top + r(tabs).bottom) / 2),
    dawInMenu: !!daw.closest("#headMorePop") && !daw.closest(".head-actions > #dawOpen"), dawLabel: daw.getAttribute("aria-label") }; })()`);
const barWide = await barNow();
await ev(`document.getElementById("tabArtist").click(); true`);
await sleep(250);
const artistStays = await ev(`document.body.dataset.tab`);
await ev(`(() => { const v = document.getElementById("view-artist"); if (v) v.scrollTop = 300; return true; })()`);   // the room scrolled: the bar and its logo stay (1266)
await sleep(500);
const barShort = await barNow();
await ev(`(() => { const v = document.getElementById("view-artist"); if (v) v.scrollTop = 0; return true; })()`);
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await sleep(600);
const barNarrow = await barNow();
await send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 960, deviceScaleFactor: 1, mobile: false });
await sleep(500);
check("the bar: Creator, Writer, Refiner, the Artist (its room open since 1255: a click opens it), Librarian; the Trainer a pill of its own",
  barWide.rooms === "Creator|Writer|Refiner|Artist|Librarian" && barWide.side === "Trainer" && barWide.artistOn && !barWide.artistDim && artistStays === "artist", JSON.stringify(barWide));
check("  with the logo in the bar, the Trainer stands in the middle between it and the workspace (1329), level with the rooms; the bar of one height, the logo with it, when the room scrolls (1266)",
  barWide.logoShown && barWide.sideLeft > barWide.logoRight && Math.abs((barWide.sideLeft + barWide.sideRight) / 2 - (barWide.logoRight + barWide.wsLeft) / 2) <= 2 && Math.abs(barWide.sideMid - barWide.tabsMid) <= 1 &&
  barWide.wsLeft - barWide.sideRight >= 18 && barShort.sideLeft === barWide.sideLeft && barShort.logoRight === barWide.logoRight && barShort.barH === 52 && barWide.barH === 52,
  JSON.stringify({ wide: [barWide.logoRight, barWide.sideLeft, barWide.sideRight, barWide.wsLeft], short: [barShort.logoRight, barShort.sideLeft] }));
check("  without the logo (1440 px), the Trainer follows the rooms", !barNarrow.logoShown && barNarrow.sideLeft > barNarrow.tabsRight &&
  barNarrow.sideLeft - barNarrow.tabsRight <= 24 && Math.abs(barNarrow.sideMid - barNarrow.tabsMid) <= 1, JSON.stringify(barNarrow));
await ev(`document.querySelector('.topbar [data-tab="train"]').click(); true`);
await sleep(400);
check("  the Trainer's pill opens the Trainer", (await ev(`document.body.dataset.tab`)) === "train");
await ev(`document.querySelector('.topbar [data-tab="create"]').click(); true`);
await sleep(400);
const dawMenu = await ev(`(async () => {
  const pop = document.getElementById("headMorePop"), back = () => document.querySelector(".dw-back");
  document.getElementById("headMore").click(); await new Promise(r => setTimeout(r, 200));
  const menuOpen = !pop.classList.contains("is-hidden");
  document.getElementById("dawOpen").click(); await new Promise(r => setTimeout(r, 300));
  const opens = !!back() && !back().hidden, menuShut = pop.classList.contains("is-hidden");
  window.HeresyDaw.close();
  return { menuOpen, opens, menuShut }; })()`);
await ev(`document.querySelector('.topbar [data-tab="post"]').click(); true`);
await sleep(600);
const dawPost = await ev(`(async () => {
  const b = document.getElementById("postDaw"), s = document.querySelector('[data-daw-open="stems"]'), back = () => document.querySelector(".dw-back");
  const o = { head: !!b && !!b.closest(".post-head"), stems: !!s && !!s.closest("#derivedPanel"), enabled: !b.disabled, take: document.getElementById("postTitle").textContent.trim() };
  if (!b.disabled) { b.click(); await new Promise(r => setTimeout(r, 300)); o.opens = !!back() && !back().hidden; window.HeresyDaw.close(); }
  s.click(); await new Promise(r => setTimeout(r, 300)); o.stemsOpens = !!back() && !back().hidden; window.HeresyDaw.close();
  return o; })()`);
await ev(`document.querySelector('.topbar [data-tab="create"]').click(); true`);
await sleep(400);
check("Export to DAW: out of the bar into ☰ (the window opens, the menu shuts), and in the Refiner, beside the take in hand and in its Stems",
  barWide.dawInMenu && barWide.dawLabel === "Export to DAW" && dawMenu.menuOpen && dawMenu.opens && dawMenu.menuShut && dawPost.head && dawPost.stems && dawPost.stemsOpens &&
  (dawPost.take ? dawPost.enabled && dawPost.opens : !dawPost.enabled), JSON.stringify({ dawMenu, dawPost }));

// HERESY 1169 (Viktor 07.10.2026: «в Музыканте… съехали не кнопки его, а именно <> и X»; «иконки кнопок мелкие во втором фрейме»)
await ev(`(() => { const t = document.querySelector("#libList .take"); if (t) t.click(); return true; })()`);
await sleep(900);
const frameHeads = await ev(`(async () => {
  const wait = (ms) => new Promise(r => setTimeout(r, ms)), r = (e) => e.getBoundingClientRect();
  document.querySelector("#view-take .frame-big").click(); await wait(600);
  const take = document.getElementById("view-take"), fav = document.getElementById("favTake"), big = take.querySelector(".frame-big");
  const t = { frame: document.body.dataset.frame || "", favMid: Math.round(r(fav).top + r(fav).height / 2), bigMid: Math.round(r(big).top + r(big).height / 2), bigRight: Math.round(r(big).right),
    favIco: Math.round(r(fav.querySelector("svg")).width), favH: Math.round(r(fav).height), gap: Math.round(r(big.parentNode).left - r(document.getElementById("takeActions")).right) };
  take.querySelector(".frame-swap").click(); await wait(600);
  const comp = document.getElementById("view-compose"), cbig = comp.querySelector(".frame-big"), op = document.getElementById("openPrompt");
  const c = { frame: document.body.dataset.frame || "", bigRight: Math.round(r(cbig).right), opIco: Math.round(r(op.querySelector("svg")).width), opH: Math.round(r(op).height),
    gap: Math.round(r(cbig.parentNode).left - r(document.getElementById("newSong")).right) };
  cbig.click(); await wait(500);
  return { t, c, down: document.body.dataset.frame || "" }; })()`);
check("over the room the take's ⇆ and ⤡ stand in its head's row as Compose's do: level with its buttons, ending where Compose's end; its icons and buttons Compose's size",
  frameHeads.t.frame === "take" && frameHeads.c.frame === "compose" && Math.abs(frameHeads.t.favMid - frameHeads.t.bigMid) <= 1 && Math.abs(frameHeads.t.bigRight - frameHeads.c.bigRight) <= 1 &&
  Math.abs(frameHeads.t.favIco - frameHeads.c.opIco) <= 1 && Math.abs(frameHeads.t.favH - frameHeads.c.opH) <= 1 && frameHeads.down === "", JSON.stringify(frameHeads));
// Viktor: «смести их блок влево хотя бы на 40-50pt… чел на кнопку <> тыкнуть пытается, а тыкнул на корзину»
check("  ⇆ ⤡ kept 40 px or more off the buttons before them, in both frames", frameHeads.t.gap >= 40 && frameHeads.c.gap >= 40 && Math.abs(frameHeads.t.gap - frameHeads.c.gap) <= 2,
  JSON.stringify({ take: frameHeads.t.gap, compose: frameHeads.c.gap }));

// HERESY 1169 (Viktor 07.10.2026: «A run is in progress… забирает лишнюю строку… можно поднять в уровень с кнопкой Generate»)
const noteRow = await ev(`(async () => {
  const n = document.getElementById("submitNote"), bar = document.querySelector(".submit-bar"), g = document.getElementById("generateBtn"), v = document.querySelector(".versions");
  const was = n.textContent, h0 = bar.getBoundingClientRect().height;
  n.textContent = "A run is in progress; the next song is queued behind it.";
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const nr = n.getBoundingClientRect(), gr = g.getBoundingClientRect(), vr = v.getBoundingClientRect(), h1 = bar.getBoundingClientRect().height;
  n.textContent = was;
  return { level: Math.round(Math.abs((nr.top + nr.bottom) / 2 - (gr.top + gr.bottom) / 2)), left: nr.right <= vr.left, grew: Math.round(h1 - h0), empty: was === "" }; })()`);
check("the bar's note (a run in progress…) stands on Generate's row, left of Takes: no line of its own", noteRow.level <= 3 && noteRow.left && noteRow.grew === 0,
  JSON.stringify(noteRow));
check("Compose's style box is named Style (Viktor: «укороти Style Prompt > Style»)",
  (await ev(`[...document.querySelector('[data-fold="style"] > .label').childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join("").trim()`)) === "Style");

// HERESY 1169 (Viktor 07.10.2026: «иконки вверх вровень с full screen кнопкой и выровнять их влево, а ниже… тайтл трека, с обрезкой
// конца… ниже статистика»; «не хватает лайка/дизлайка до полного счастья»)
await ev(`(() => { const t = document.querySelector("#libList .take"); if (t) t.click(); return true; })()`);
await sleep(800);
const roomHead = await ev(`(() => {
  const r = (e) => e.getBoundingClientRect(), col = document.getElementById("view-take"), head = col.querySelector(":scope > .col-head");
  const big = col.querySelector(".frame-big"), like = document.getElementById("likeTake"), fav = document.getElementById("favTake"), title = document.getElementById("takeTitle");
  const eyebrow = document.getElementById("takeEyebrow"), lh = parseFloat(getComputedStyle(title).lineHeight) || 25;
  const order = [...document.getElementById("takeActions").querySelectorAll("button")].map(b => b.id).join(",");
  return { lifted: document.body.dataset.frame || "", level: Math.abs((r(fav).top + r(fav).bottom) / 2 - (r(big).top + r(big).bottom) / 2),
    corner: Math.round(r(document.getElementById("takeBody")).right - r(big).right), titleBelow: r(title).top >= r(fav).bottom - 1, oneLine: r(title).height <= lh * 1.3,
    wide: Math.round(r(title).width / (r(head).width - 44) * 100), statsBelow: r(eyebrow).top >= r(title).bottom - 1,
    firstLeft: Math.round(r(document.getElementById("playHere").offsetParent ? document.getElementById("playHere") : like).left - r(head).left), order }; })()`);
check("in the room the take's head is three rows: ▶ and its buttons from the left, ⤡ level with them at the content's right edge; the title across on one line; its numbers under it",
  roomHead.lifted === "" && roomHead.level <= 2 && Math.abs(roomHead.corner) <= 2 && roomHead.titleBelow && roomHead.oneLine && roomHead.wide >= 95 && roomHead.statsBelow && roomHead.firstLeft <= 24,
  JSON.stringify(roomHead));
const likes = await ev(`(async () => {
  const wait = (ms) => new Promise(r => setTimeout(r, ms)), HC = window.HeresyCollection, name = STATE_NAME();
  function STATE_NAME() { return document.querySelector("#takeEyebrow .take-id").textContent.trim(); }
  const was = HC.rating(name);
  const until = async (f) => { for (let i = 0; i < 40 && !f(); i++) await wait(50); };
  document.getElementById("likeTake").click(); await until(() => document.getElementById("likeTake").getAttribute("aria-pressed") === "true");
  const on = { pressed: document.getElementById("likeTake").getAttribute("aria-pressed"), rating: HC.rating(name) };
  document.getElementById("dislikeTake").click(); await until(() => document.getElementById("dislikeTake").getAttribute("aria-pressed") === "true");
  const swap = { like: document.getElementById("likeTake").getAttribute("aria-pressed"), dislike: document.getElementById("dislikeTake").getAttribute("aria-pressed"), rating: HC.rating(name) };
  document.getElementById("dislikeTake").click(); await until(() => document.getElementById("dislikeTake").getAttribute("aria-pressed") === "false");
  return { was, on, swap, off: HC.rating(name), order: [...document.getElementById("takeActions").querySelectorAll("button")].map(b => b.id).slice(0, 3).join(",") }; })()`);
check("  👍 and 👎 beside ☆ (the player's order): a click marks the take, the other takes its place, a second click takes it back",
  likes.order === "likeTake,dislikeTake,favTake" && likes.on.pressed === "true" && likes.on.rating === 1 && likes.swap.like === "false" && likes.swap.dislike === "true" &&
  likes.swap.rating === -1 && likes.off === 0, JSON.stringify(likes));

// HERESY 1169 (Viktor 07.10.2026: «Takes… Нет дефолта и нет сторожа»; «вынести sound variations… бок о бок к Takes… ползунками
// целочисленными»; «блок Sound and output… нижним разделом в блок Sampling (переименовать в Sampling and Denoising)»; «обе кнопки
// Reset… привести в общий стиль»)
const counts = await ev(`(async () => {
  const s = document.getElementById("versions"), v = document.getElementById("variations"), set = (e, n) => { e.value = String(n); e.dispatchEvent(new Event("input", { bubbles: true })); };
  const first = { songs: s.type + " " + s.min + "-" + s.max + " " + s.value, sounds: v.type + " " + v.min + "-" + v.max + " " + v.value, total: document.getElementById("takesTotal")?.textContent };
  set(s, 2); set(v, 4);
  const both = { total: document.getElementById("takesTotal")?.textContent, outs: document.getElementById("versionsOut")?.textContent + "x" + document.getElementById("variationsOut")?.textContent };
  set(s, 1); set(v, 1);
  const bar = document.querySelector(".submit-bar"), g = document.getElementById("generateBtn").getBoundingClientRect();
  const mid = (e) => { const b = e.getBoundingClientRect(); return (b.top + b.bottom) / 2; };
  set(s, 9); set(v, 1); const w9 = (document.querySelector(".cs-total") || document.body).getBoundingClientRect(); set(s, 10); const w10 = (document.querySelector(".cs-total") || document.body).getBoundingClientRect();
  set(s, 1); set(v, 1);
  const steady = Math.abs(w9.left - w10.left) < 0.5 && Math.abs(w9.width - w10.width) < 0.5 && Math.abs(g.left - document.getElementById("generateBtn").getBoundingClientRect().left) < 0.5;
  return { first, both, steady, labels: [...document.querySelectorAll(".submit-bar .count-slider > span")].map(e => (e.firstChild?.textContent || "").trim()).filter(Boolean).join("|"), inBar: !!s.closest(".submit-bar") && !!v.closest(".submit-bar"), level: Math.round(Math.abs(mid(s) - mid(document.getElementById("generateBtn"))) + Math.abs(mid(v) - mid(document.getElementById("generateBtn")))),
    order: s.getBoundingClientRect().right <= v.getBoundingClientRect().left && v.getBoundingClientRect().right <= document.getElementById("planBtn").getBoundingClientRect().left }; })()`);
check("Probes × Variations beside Generate: integer sliders from 1, their numbers, and the takes they make (2 × 4 = 8) in a column of their own",
  counts.first.songs === "range 1-10 1" && /^range 1-\d 1$/.test(counts.first.sounds) && counts.first.total === "1 take" && counts.both.total === "8 takes" &&
  counts.both.outs === "2x4" && counts.inBar && counts.level <= 4 && counts.order && counts.steady && counts.labels === "Probes|Variations", JSON.stringify(counts));
const merged = await ev(`(() => {
  const d = document.getElementById("advDrawer"), r1 = document.getElementById("resetSampling").getBoundingClientRect(), r2 = document.getElementById("resetOutput").getBoundingClientRect();
  return { name: d.querySelector(".sum-name").textContent, summary: document.getElementById("outSummary").closest("summary") === d.querySelector("summary"),
    inside: ["odeSteps", "odeSolver", "outFormat", "peakClip", "resetOutput"].every(id => d.contains(document.getElementById(id))), gone: !document.getElementById("outDrawer"),
    soundsOut: !d.contains(document.getElementById("variations")),
    resets: document.getElementById("resetSampling").className === document.getElementById("resetOutput").className && Math.round(r1.height) === Math.round(r2.height) }; })()`);
check("  one drawer «Sampling and Denoising»: the samplers, then the sound half's denoising and the output; its summary says the output; the two resets alike",
  merged.name === "Sampling and Denoising" && merged.summary && merged.inside && merged.gone && merged.soundsOut && merged.resets, JSON.stringify(merged));

// HERESY 1169 (Viktor 07.10.2026: «проверка на обновления…»; «если у пользователя не скачаны мои 💎 Воркспейсы, тоже попапом
// предложить скачать их. Гарантия, что только единицы додумаются до этого сами»)
const upd = await ev(`(async () => {
  const wait = (ms) => new Promise(r => setTimeout(r, ms)), real = window.fetch, calls = [];
  const st = { current: "2.0.0-rc2", latest: { tag: "v2.0.0-rc3", version: "2.0.0-rc3", name: "2.0.0-rc3", notes: "## What's new\\n- one\\n- two",
    url: "https://github.com/igrbible/Ruach_Studio/releases/tag/v2.0.0-rc3", candidate: true }, newer: true, checked: Math.floor(Date.now() / 1000) - 10 * 86400,
    error: "", can_run: false, why: "this is a development tree (its origin is not igrbible/Ruach_Studio): update it by hand", running: false };
  const json = (d) => Promise.resolve(new Response(JSON.stringify(d), { status: 200, headers: { "Content-Type": "application/json" } }));
  window.fetch = (u, o) => { const s = String(u); calls.push(s + (o && o.method === "POST" ? " POST" : ""));
    if (s.startsWith("/lab/update")) return json(o && o.method === "POST" ? Object.assign({}, st, { checked: Math.floor(Date.now() / 1000) }) : st);
    if (s.startsWith("/lab/collection/diamonds")) return json({ sets: [{ name: "💎 Musical Styles", published: true, here: false, takes: 620, bytes: 3.2e9 },
      { name: "💎 Voice Types", published: true, here: true }] });
    return real(u, o); };
  const shown = async () => { for (let i = 0; i < 60 && !document.querySelector(".hd-back.is-on:not(.is-leaving) .hd-title"); i++) await wait(50);
    return document.querySelector(".hd-back.is-on:not(.is-leaving)"); };
  localStorage.setItem("yue2.updates", JSON.stringify({ first: Date.now() - 2 * 86400000, asked: true, seen: "" }));
  const done = HeresyUpdates.schedule();
  const gem = await shown();
  const g = { title: gem && gem.querySelector(".hd-title").textContent, lists: !!gem && /Musical Styles · 620 takes · 3\\.2 GB/.test(gem.textContent) && !/Voice Types/.test(gem.textContent) };
  if (gem) gem.querySelector(".hd-no").click();
  await wait(500);
  const box = await shown();
  const o = { title: box && box.querySelector(".hd-title").textContent, ok: box && box.querySelector(".hd-yes").textContent, alt: box && box.querySelector(".hd-alt") ? box.querySelector(".hd-alt").textContent : null };
  if (box && box.querySelector(".hd-alt")) box.querySelector(".hd-alt").click();
  await done; await wait(300);
  const p = JSON.parse(localStorage.getItem("yue2.updates"));
  await HeresyUpdates.refresh();
  const card = { line: document.getElementById("updLine").textContent, why: document.getElementById("updWhy").textContent, run: !document.getElementById("updRun").hidden,
    notes: !document.getElementById("updNotes").hidden, every: document.getElementById("updEvery").value };
  window.fetch = real;
  localStorage.removeItem("yue2.updates");
  return { g, o, skip: p.skip, seen: p.seen, card, posts: calls.filter(c => c === "/lab/update POST").length }; })()`);
check("Updates: a new studio is offered the 💎 sets it lacks (only those); a release out asks (on this tree: its page, Skip remembered); the Engine card says it",
  upd.g.title === "The studio's 💎 sets" && upd.g.lists && upd.o.title === "Ruach Studio 2.0.0-rc3 is out" && upd.o.ok === "Open the release page" && upd.o.alt === "Skip this version" &&
  upd.skip === "2.0.0-rc3" && upd.seen === "2.0.0-rc2" && upd.posts === 1 && /2\.0\.0-rc3 is out/.test(upd.card.line) && /development tree/.test(upd.card.why) && !upd.card.run &&
  upd.card.notes && upd.card.every === "week", JSON.stringify(upd));

// HERESY 1169 (Viktor 07.10.2026: «REV и FF… прикрути по 15 сек… как в видеоплеерах по аналогу ключевых фреймов… в чистой
// кратности с 0:00»)
const seek = await ev(`(() => { const f = window.ruachSeekTarget, c = document.querySelector(".pb-ctrl");
  const ids = [...c.querySelectorAll("button")].map(b => b.id).filter(Boolean);
  return { order: ids.slice(ids.indexOf("prevTake"), ids.indexOf("nextTake") + 1).join(","),
    fwd: [f(23.4, 15, 1), f(30, 15, 1), f(29.99, 15, 1)].join(","), back: [f(23.4, 15, -1), f(30.5, 15, -1), f(31.2, 15, -1), f(0.4, 15, -1)].join(","),
    keys: [f(12, 5, 1), f(12, 5, -1), f(15.3, 5, -1)].join(","), icons: !!document.querySelector("#pbRew svg.ui-rewind") && !!document.querySelector("#pbFwd svg.ui-forward") }; })()`);
check("⏪ and ⏩ beside ⏮ and ⏭ go to quarter-minute marks from 0:00, the arrows to 5 s marks; back from just past a mark goes one further",
  seek.order === "prevTake,pbRew,playBtn,pbFwd,nextTake" && seek.fwd === "30,45,30" && seek.back === "15,15,30,0" && seek.keys === "15,10,10" && seek.icons, JSON.stringify(seek));

// HERESY 1169 (Viktor 07.10.2026: «По кнопкам в F5 диалоге - добавь LEFT/RIGHT клавиатурными передвижение по кнопкам»;
// «По кнопке PREV в плеере - если нет предыдущего трека в списке - перемотка на начало текущего»; «Подсказка по макс
// продолжительности выскочила из отключенного тобою поля»)
const dlgKeys = await ev(`(async () => {
  const wait = (ms) => new Promise(r => setTimeout(r, ms)), key = (k) => document.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
  const answer = window.HeresyDialog.confirm("Keys\\n\\nWhich one?", { ok: "Yes", cancel: "No", alt: "Other" });
  for (let i = 0; i < 40 && !document.querySelector(".hd-back.is-on:not(.is-leaving) .hd-yes"); i++) await wait(50);
  const order = [...document.querySelectorAll(".hd-back.is-on:not(.is-leaving) .hd-acts button")].map(b => b.textContent);
  key("ArrowLeft"); const a = document.activeElement.textContent; key("ArrowLeft"); const b = document.activeElement.textContent;
  key("ArrowLeft"); const c = document.activeElement.textContent; key("ArrowRight"); const d = document.activeElement.textContent;
  key("Enter");
  return { order: order.join("|"), path: [a, b, c, d].join(">"), said: await answer }; })()`);
check("the studio's questions: ← and → go along the buttons (round), Enter presses the one in focus",
  dlgKeys.order === "No|Other|Yes" && dlgKeys.path === "Other>No>Yes>No" && dlgKeys.said === false, JSON.stringify(dlgKeys));
const prevStart = await ev(`(async () => {
  const wait = (ms) => new Promise(r => setTimeout(r, ms)), a = document.getElementById("audio"), first = document.querySelector("#libList .take");
  first.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
  for (let i = 0; i < 60 && !(a.getAttribute("src") && isFinite(a.duration) && a.duration > 0); i++) await wait(50);
  const src = a.getAttribute("src"); a.currentTime = Math.min(a.duration * 0.5, 2); await wait(150);
  const before = a.currentTime; document.getElementById("prevTake").click(); await wait(200);
  a.pause();
  return { before: Math.round(before * 100) / 100, after: Math.round(a.currentTime * 100) / 100, same: a.getAttribute("src") === src }; })()`);
check("  ⏮ on the list's first take takes it back to 0:00", prevStart.same && prevStart.before > 0 && prevStart.after < 0.3, JSON.stringify(prevStart));
const lenTip = await ev(`({ tip: document.querySelector('.knob-secs[data-secs-for="max_tokens"]').dataset.tip, hint: document.getElementById("outHint").textContent })`);
check("  the music's Max length says the 24,576-token window in its own tip; Sound and output no longer does", /24,576/.test(lenTip.tip) && !/Songs end on their own/.test(lenTip.hint),
  JSON.stringify(lenTip).slice(0, 300));

// HERESY 1169 (Viktor 07.10.2026: «при OOM сторож ловит падение и предлагает пользователю осознанно с текущих весов
// опуститься на порядок ниже… с честным предупреждением»)
const oomOffer = await ev(`(async () => {
  const wait = (ms) => new Promise(r => setTimeout(r, ms)), said = window.ruachOfferSmallerModel("Out of GPU memory for the sound: 0.9 of 24.1 GB free when 1 variation of 452 s needed more. A smaller copy of the model (Q8_0) or fewer probes at once leaves it room.");
  for (let i = 0; i < 40 && !document.querySelector(".hd-back.is-on:not(.is-leaving) .hd-yes"); i++) await wait(50);
  const box = document.querySelector(".hd-back.is-on:not(.is-leaving)");
  const o = { title: box && box.querySelector(".hd-title").textContent, yes: box && box.querySelector(".hd-yes").textContent, no: box && box.querySelector(".hd-no").textContent,
    honest: !!box && /near lossless/.test(box.textContent) && /0\\.9 of 24\\.1 GB/.test(box.textContent) };
  if (box) box.querySelector(".hd-no").click();
  o.kept = (await said) === false && document.getElementById("modelPick").value === "BF16";
  return o; })()`);
check("out of GPU memory: the engine's words, and the next smaller copy offered honestly (BF16 → Q8_0); Keep leaves the model",
  oomOffer.title === "Out of GPU memory" && oomOffer.yes === "Switch to Q8_0" && oomOffer.no === "Keep BF16" && oomOffer.honest && oomOffer.kept, JSON.stringify(oomOffer));

// HERESY 1169 (Viktor 07.10.2026: «адаптивно под VRAM Tiers 32/24/16/12/8 + выбор и реальный вес GGUF'ов... формулу… дабы
// избежать OOM»): the measured 24 GB card: two probes of 120 s fit on BF16 (22.0 GiB measured), of 300 s not (23.5 GiB, OOM's edge)
const fit = await ev(`[ruachFitBatchFor(23.56, "BF16", 120), ruachFitBatchFor(23.56, "BF16", 300), ruachFitBatchFor(23.56, "Q8_0", 480), ruachFitBatchFor(31.8, "BF16", 480),
  ruachFitBatchFor(15.5, "BF16", 120), ruachFitBatchFor(0, "BF16", 120)].join(",")`);
check("probes at once by what the card holds: 24 GB BF16 two of 2 min, one of 5 min; Q8_0 two of 8 min; 32 GB three of 8 min (the engine's max-batch above); a 16 GB card one; no word from the card, the engine decides",
  fit === "2,1,2,3,1,99", fit);

// HERESY 1169 (Viktor 07.10.2026: «В шпаргалке по стилям и инструментам проблемка. Не работает кликание, вставка,
// копирование»): a name did go into the Style prompt, but its words showed under the sheet and the sheet's words did not select
section("the cheat-sheet: its words seen, its names copied, its text selected");
const sheetAt = await ev(`(async () => {
  const wait = (ms) => new Promise(r => setTimeout(r, ms)), st = document.getElementById("style");
  window.__sheetWas = st.value;
  document.querySelector('#tabs [data-tab="create"]').click();
  st.value = "dark folk"; st.dispatchEvent(new Event("input", { bubbles: true }));
  document.getElementById("toasts").innerHTML = "";
  document.getElementById("hiOpen").click();
  for (let i = 0; i < 40 && !document.querySelector('[data-hi-tab="styles"]'); i++) await wait(50);
  document.querySelector('[data-hi-tab="styles"]').click();
  for (let i = 0; i < 40 && !document.querySelector("#hiTable [data-hi-tag]"); i++) await wait(50);
  await wait(700);                                   // the probes read meanwhile draw the table again
  const b = [...document.querySelectorAll("#hiTable [data-hi-tag]")].find(x => x.dataset.hiTag && !/dark folk/i.test(x.dataset.hiTag));
  window.__sheetTag = b.dataset.hiTag; b.scrollIntoView({ block: "center" }); await wait(100);
  const r = b.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, before: b.classList.contains("is-in") }; })()`);
// a real click: the clipboard takes a copy only from the user's own gesture
for (const type of ["mouseMoved", "mousePressed", "mouseReleased"])
  await send("Input.dispatchMouseEvent", { type, x: sheetAt.x, y: sheetAt.y, button: "left", buttons: type === "mousePressed" ? 1 : 0, clickCount: 1 });
// 08.10 (Viktor: «нужен диалоговый попап, спрашивающий, что мы делаем. Переписываем или добавляем в конец (новой строкой…)»);
// 09.10, after 1265 took it away: «ты уже сделал автокопирование в буфер и попап диалоговый. Так пусть и остаётся» (1267)
await waitFor(`!!document.querySelector(".hd-back.is-on:not(.is-leaving) .hd-yes")`, 3000, 50);
const sheetAsk = await ev(`(() => { const b = document.querySelector(".hd-back.is-on:not(.is-leaving)"); const o = { title: b.querySelector(".hd-title").textContent,
  yes: b.querySelector(".hd-yes").textContent, alt: (b.querySelector(".hd-alt") || {}).textContent || null }; b.querySelector(".hd-yes").click(); return o; })()`);
const sheetSay = await ev(`(async () => {
  const wait = (ms) => new Promise(r => setTimeout(r, ms)), st = document.getElementById("style");
  const b = [...document.querySelectorAll("#hiTable [data-hi-tag]")].find(x => x.dataset.hiTag === window.__sheetTag);
  for (let i = 0; i < 40 && !document.querySelector("#toasts .toast"); i++) await wait(50);
  const t = document.querySelector("#toasts .toast:last-child"), z = (el) => +getComputedStyle(el).zIndex, box = document.getElementById("toasts");
  const say = document.querySelector("#hiTable .hi-say div"), us = (el) => getComputedStyle(el).userSelect || getComputedStyle(el).webkitUserSelect;
  const o = { tag: b.dataset.hiTag, before: ${sheetAt.before}, marked: b.classList.contains("is-in"), into: st.value === "dark folk\\n" + b.dataset.hiTag, toast: t && t.textContent,
    over: z(box) > z(document.getElementById("hiBack")), through: getComputedStyle(box).pointerEvents === "none", select: us(say), page: us(document.body),
    legend: document.querySelector(".hi-legend li").textContent };
  document.getElementById("hiClose").click();
  st.value = window.__sheetWas; st.dispatchEvent(new Event("input", { bubbles: true }));
  return o; })()`);
check("a name clicked in the cheat-sheet goes onto the clipboard and asks where it goes (at the end on a line of its own, or in place of the Style); added, it is marked in the sheet at once, and its words stand over the sheet (the pointer goes through them)",
  /^Into the Style: «/.test(sheetAsk.title) && sheetAsk.yes === "Add at the end" && sheetAsk.alt === "Replace the style" &&
  !!sheetSay && !sheetSay.before && sheetSay.marked && sheetSay.into && sheetSay.toast === "Into the style, on a line of its own: " + sheetSay.tag + " \u00b7 copied" && sheetSay.over && sheetSay.through &&
  /onto the clipboard/.test(sheetSay.legend), JSON.stringify({ sheetAsk, sheetSay }));
check("  the sheet's words select (to copy); the page's own words still do not", !!sheetSay && sheetSay.select === "text" && sheetSay.page === "none", JSON.stringify(sheetSay));

// HERESY 1169 (Viktor 07.10.2026: «Давай лучше в попапе доделаем Музыканта. Тоже дадим ему две колонки»)
section("the take over the room in two columns");
await ev(`(() => { document.querySelector('#tabs [data-tab="create"]').click(); const t = [...document.querySelectorAll(".library .take")].find(x => !x.classList.contains("is-running-row")); if (t) t.click(); return true; })()`);
await waitFor(`!document.getElementById("takeBody").classList.contains("is-hidden")`, 12000, 100);
await click('.frame-big[data-frame="take"]');
await waitFor(`document.body.dataset.frame === "take"`, 3000, 50);
await sleep(400);
const colsUp = await ev(`(() => { const L = document.querySelector("#takeBody > .take-cols > .take-col-do"), R = document.querySelector("#takeBody > .take-cols > .take-col-made");
  if (!L || !R) return null; const l = L.getBoundingClientRect(), r = R.getBoundingClientRect(), name = (e) => e.id || e.dataset.cardFold || e.className.split(" ")[0];
  return { left: [...L.children].map(name).join(), right: [...R.children].map(name).join(), side: r.left >= l.right && Math.abs(r.top - l.top) < 2,
    score: document.getElementById("scorePanel").getBoundingClientRect().top >= Math.max(l.bottom, r.bottom) - 1 }; })()`);
await click('.frame-big[data-frame="take"]');
await waitFor(`!document.body.dataset.frame`, 3000, 50);
const colsDown = await ev(`(() => { const b = document.getElementById("takeBody"), w = b.querySelector(".word-row");
  return { cols: !!b.querySelector(".take-cols"), order: [...b.children].map(e => e.id || e.className.split(" ")[0]).join(), words: [...w.children].map(e => e.dataset.cardFold).join(),
    shown: !w.classList.contains("is-hidden") }; })()`);
// 08.10 (Viktor: «перенеси Score в правую колонку, Prompt переименуй в Style и перенеси в левую поверх Lyrics»)
check("the take over the room stands in two columns: what to do with it, its Style and its lyrics left; how it was made, its VAE and its score right; back in the room the card is as it was",
  !!colsUp && colsUp.left === "takeTools,field,prompt,lyrics" && colsUp.right === "metaGrid,decodeSwitch,soundSwitch,scorePanel" && colsUp.side &&
  !colsDown.cols && colsDown.order === "takeTools,field,metaGrid,decodeSwitch,soundSwitch,word-row,scorePanel" && colsDown.words === "prompt,lyrics" && colsDown.shown,
  JSON.stringify({ colsUp, colsDown }));

// HERESY 1169 (Viktor 05.10.2026: «Ты можешь у Тренера прикрутить… что определяет тип голоса? Мужской или женский, регистр?
// Нам не нужны Имена человеков, а нужны именно их тональности»): the mock has no trainer, so the lab's answers are stood in
section("the Trainer: a folder's voice and a name made of it");
await ev(`(() => { const real = window.fetch, json = (o) => Promise.resolve(new Response(JSON.stringify(o), { status: 200, headers: { "Content-Type": "application/json" } }));
  window.__voiceFetch = real;
  window.fetch = function (u, o) { u = String(u);
    if (u.startsWith("/lab/train/datasets")) return json({ raw: [{ name: "voice-test", tracks: 3, bytes: 3e8, captions: 3, voice: { median_hz: 117.2, p10_hz: 95.1, p90_hz: 140.3,
      voice: "male", voice_by: "pitch", mode: "speech", register: "baritenor", low: "F#2", mid: "A#2", high: "C#3" } }, { name: "songs-test", tracks: 2, bytes: 2e8, captions: 2, voice: null }],
      prepared: [{ name: "voice-test-set", tracks: 3, from: "voice-test", made: "2026-10-08", seconds: 180 }], runs: [], gpus: [], own: {}, aitk_ready: false });
    if (u.startsWith("/lab/train/scan?name=voice-test")) return json({ name: "voice-test", tracks: [{ file: "a.wav", seconds: 60, lyrics: "Привет, мир, это чтение", hints: [] }] });
    if (u.startsWith("/lab/train/scan?name=songs-test")) return json({ name: "songs-test", tracks: [{ file: "b.wav", seconds: 60, lyrics: "[Verse]\\nla la", hints: [] }] });
    if (u.startsWith("/lab/train/trash")) return json({ trash: [] });
    return real(u, o); };
  document.querySelector('.topbar [data-tab="train"]').click(); window.HeresyTrain.reload(); return true; })()`);
await waitFor(`!!document.querySelector('#trRaw [data-raw="voice-test"]')`, 6000, 100);
await ev(`(() => { const p = document.querySelector('.ps-step[data-pane="raw"]'); if (p) p.click(); document.querySelector('#trRaw [data-raw="voice-test"]').click(); return true; })()`);
await waitFor(`/Name the set/.test(document.getElementById("trVoice").textContent)`, 6000, 100);
const voiceA = await ev(`(() => { const v = document.getElementById("trVoice"), n = v.querySelector("[data-voice-name]"); n.click();
  return { line: v.textContent.replace(/\\s+/g, " "), folder: document.querySelector('#trRaw [data-raw="voice-test"]').textContent, set: document.querySelector("#trSets").textContent,
    name: document.getElementById("trSetName").value, speech: !!v.querySelector('[data-voice-mode="speech"].is-on') }; })()`);
await ev(`(() => { document.querySelector('#trRaw [data-raw="songs-test"]').click(); return true; })()`);
await waitFor(`/not measured yet/.test(document.getElementById("trVoice").textContent) && !!document.querySelector('#trVoice [data-voice-mode="sung"].is-on')`, 6000, 100);
const voiceB = await ev(`(() => { const v = document.getElementById("trVoice"); return { line: v.textContent.replace(/\\s+/g, " "), name: !!v.querySelector("[data-voice-name]") }; })()`);
await ev(`(() => { window.fetch = window.__voiceFetch; document.querySelector('#tabs [data-tab="create"]').click(); return true; })()`);
check("a folder's voice by measure: on the folder, beside the set made of it, and in its line with a name for the set (the lyrics' language, no person's name); songs with sections are taken as singing, not measured yet",
  /baritenor · 117 Hz/.test(voiceA.folder) && /baritenor · 117 Hz/.test(voiceA.set) && !/[\u2640\u2642]/.test(voiceA.folder + voiceA.set) && /male · baritenor/.test(voiceA.line) && voiceA.speech && voiceA.name === "voice-ru-m-baritenor-117" &&
  /not measured yet/.test(voiceB.line) && !voiceB.name, JSON.stringify({ voiceA, voiceB }));

// HERESY 1169 (Viktor 08.10.2026: «В редактор лирики можно как в кодовом редакторе отображение номера строки?… по Alt+K
// маркировать строки, а по Alt+J прыгать на них. И подсвечивать тонким альфа слоем все музыкальные теги»)
section("the lyrics box: line numbers, marks on Alt+K, Alt+J to them, the tags lit");
const altKey = async (code, key, vk, shift) => {
  await send("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode: vk, modifiers: shift ? 9 : 1 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: vk, modifiers: shift ? 9 : 1 });
  await sleep(120);
};
const caretTo = (word) => ev(`(() => { const a = document.getElementById("lyrics"), at = ${JSON.stringify(word)} ? a.value.indexOf(${JSON.stringify(word)}) : 0; a.focus(); a.setSelectionRange(at, at); return true; })()`);
await ev(`(() => { document.querySelector('#tabs [data-tab="create"]').click(); const f = document.querySelector('[data-fold="lyrics"]'); if (f.classList.contains("is-folded")) f.querySelector(".label").click();
  const a = document.getElementById("lyrics"); window.__lyrWas = a.value; a.value = "[Verse]\\nодин\\nдва\\n[Chorus]\\nтри\\nчетыре"; a.dispatchEvent(new Event("input", { bubbles: true }));
  a.scrollIntoView({ block: "center" }); return true; })()`);
await sleep(250);
await caretTo("два"); await altKey("KeyK", "k", 75);
await caretTo("четыре"); await altKey("KeyK", "k", 75);
await caretTo(""); await altKey("KeyJ", "j", 74);
await sleep(150);
const aidRead = () => ev(`(() => { const a = document.getElementById("lyrics"), w = a.parentNode; return { line: a.value.slice(0, a.selectionStart).split("\\n").length,
  nums: [...w.querySelectorAll(".lyr-num")].map(n => n.textContent).join(), marked: [...w.querySelectorAll(".lyr-num.is-mark")].map(n => n.textContent).join(),
  tags: w.querySelectorAll(".lyr-tag").length, meter: (document.getElementById("lyricsMeter").textContent.match(/Marks: \\d+/) || [""])[0] }; })()`);
const aid1 = await aidRead();
await caretTo(""); await send("Input.insertText", { text: "новая\n" }); await sleep(200);
const aid2 = await aidRead();
await altKey("KeyJ", "j", 74, true);                  // Alt+Shift+J from the top: round to the last mark
const aid3 = await aidRead();
await altKey("KeyK", "k", 75, true);                  // Alt+Shift+K: none left
const aid4 = await aidRead();
await ev(`(() => { const a = document.getElementById("lyrics"); a.value = window.__lyrWas; a.dispatchEvent(new Event("input", { bubbles: true })); return document.getElementById("wrLyrics").dataset.aids === "1"; })()`)
  .then((w) => { aid4.writer = w; });
check("the lyrics box numbers its lines; Alt+K marks a line (amber), Alt+J goes to the next mark, Alt+Shift+J round to the last; a line added above moves the marks with their lines; Alt+Shift+K clears them; every tag lies under a thin layer; the Writer's lyrics too",
  aid1.nums === "1,2,3,4,5,6" && aid1.marked === "3,6" && aid1.line === 3 && aid1.tags === 2 && aid1.meter === "Marks: 2" && aid2.marked === "4,7" &&
  aid3.line === 7 && aid4.marked === "" && aid4.meter === "" && aid4.writer === true, JSON.stringify({ aid1, aid2, aid3, aid4 }));

// HERESY 1169 (Viktor 08.10.2026: «Я в ахуе от мимики бейсиковых трейсов команд mcedit. Хочешь, добавь ещё что-то дельное»)
section("the lyrics box: mcedit's keys");
const keyIn = async (key, code, vk, mods) => {
  await send("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode: vk, modifiers: mods });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: vk, modifiers: mods });
  await sleep(150);
};
const lyrNow = () => ev(`(() => { const a = document.getElementById("lyrics"), w = a.parentNode; return { v: a.value.split("\\n").join("|"), line: a.value.slice(0, a.selectionStart).split("\\n").length,
  marked: [...w.querySelectorAll(".lyr-num.is-mark")].map(n => n.textContent).join() }; })()`);
await ev(`(() => { const a = document.getElementById("lyrics"); window.__lyrWas2 = a.value; a.value = "один\\nдва\\nтри\\nчетыре"; a.dispatchEvent(new Event("input", { bubbles: true })); a.focus(); return true; })()`);
await sleep(200);
await caretTo("два"); await altKey("KeyK", "k", 75);
await caretTo("два"); await keyIn("ArrowDown", "ArrowDown", 40, 1);       // Alt+↓: «два» under «три», its mark with it
const mc1 = await lyrNow();
await keyIn("ArrowUp", "ArrowUp", 38, 1);                                 // Alt+↑: back
const mc2 = await lyrNow();
await caretTo("три"); await keyIn("y", "KeyY", 89, 2);                    // Ctrl+Y: «три» away
const mc3 = await lyrNow();
await ev(`document.execCommand("undo"); true`); await sleep(150);
const mc4 = await lyrNow();
await keyIn("o", "KeyO", 79, 1);                                          // Alt+O: the marks away
const mc5 = await lyrNow();
await keyIn("l", "KeyL", 76, 1);                                          // Alt+L: to line 4
await waitFor(`!!document.querySelector(".hd-back.is-on:not(.is-leaving) .hd-input")`, 3000, 50);
await ev(`(() => { const b = document.querySelector(".hd-back.is-on:not(.is-leaving)"); b.querySelector(".hd-input").value = "4"; b.querySelector(".hd-yes").click(); return true; })()`);
await sleep(300);
const mc6 = await lyrNow();
const mcTip = await ev(`(() => { const k = document.querySelector('#lyricsMeter [data-lyr="keys"]'), w = document.getElementById("wrLyrics").closest(".field").querySelector(".label");
  return { meter: !!k && /Alt\\+L/.test(k.dataset.tip) && /Ctrl\\+Y/.test(k.dataset.tip), writer: /Alt\\+K/.test(w.dataset.tip || "") }; })()`);
await ev(`(() => { const a = document.getElementById("lyrics"); a.value = window.__lyrWas2; a.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
check("mcedit's keys in the lyrics: Alt+↓ and Alt+↑ move a line with its mark, Ctrl+Y deletes it (Ctrl+Z brings it back), Alt+O clears the marks, Alt+L goes to a line; the meter's Keys and the Writer's label say them",
  mc1.v === "один|три|два|четыре" && mc1.marked === "3" && mc1.line === 3 && mc2.v === "один|два|три|четыре" && mc2.marked === "2" && mc2.line === 2 &&
  mc3.v === "один|два|четыре" && mc4.v === "один|два|три|четыре" && mc5.marked === "" && mc6.line === 4 && mcTip.meter && mcTip.writer,
  JSON.stringify({ mc1, mc2, mc3, mc4, mc5, mc6, mcTip }));

// HERESY 1169 (Viktor 08.10.2026, 01:30: the Musician's and Compose's batch)
section("the Musician's card and Compose's form, compacted");
await ev(`(() => { document.querySelector('#tabs [data-tab="create"]').click(); const t = [...document.querySelectorAll(".library .take")].filter(x => !x.classList.contains("is-running-row"));
  if (t[1]) t[1].click(); return true; })()`);
await sleep(400);
const mcCompact = await ev(`(() => { const g = [...document.querySelectorAll("#takeTools > .tool-group")], cs = (e) => getComputedStyle(e);
  const again = document.querySelector("#takeTools > .tg-again"), first = document.querySelector("#takeTools > .tg-dl");
  const f = (w) => document.querySelector('[data-card-fold="' + w + '"]').classList.contains("is-folded");
  return { framed: g.length === 5 && g.every(x => cs(x).borderTopStyle === "solid" && parseFloat(cs(x).borderTopWidth) >= 1),   // HERESY 1356: and Edit
    againRow: again.getBoundingClientRect().top >= first.getBoundingClientRect().bottom - 1, style: document.querySelector('[data-card-fold="prompt"] h3').textContent.trim(),
    folded: f("prompt") && f("lyrics"), seeds: !!document.getElementById("lmSeed").closest("#advDrawer") && !!document.getElementById("soundSeed").closest("#advDrawer .seed-sub"),
    instr: !!document.getElementById("instrumental").closest(".plan-head") && !/no vocals/.test(document.querySelector(".plan-head").textContent),
    loraHint: cs(document.querySelector("#loraPicker .lora-hint")).display, loraNotes: !!document.querySelector('[data-fold="loras"] > .label .lora-notes'),
    takesHead: cs(document.querySelector("#library .lib-head")).paddingTop }; })()`);
check("the take's tools in framed groups (Make again a row of its own), the card's Style (once Prompt) and Lyrics folded on a new take; the seeds in Sampling and Denoising; Instrumental in the planning head, its words in its tip; the LoRA notes in a tip; the Takes head 7 px nearer the top",
  mcCompact.framed && mcCompact.againRow && /^Style/.test(mcCompact.style) && mcCompact.folded && mcCompact.seeds && mcCompact.instr && mcCompact.loraHint === "none" && mcCompact.loraNotes &&
  mcCompact.takesHead === "11px", JSON.stringify(mcCompact));
// HERESY 1169 (Viktor 08.10.2026: «Сделай растяжку трёх блоков кнопок на всю ширину колонки»): every row of the take's tools reaches the column's right edge
const ttFill = await ev(`(() => { const box = document.getElementById("takeTools").getBoundingClientRect(), g = [...document.querySelectorAll("#takeTools > .tool-group")].map((x) => x.getBoundingClientRect());
  const rows = {}; g.forEach((r) => { const k = Math.round(r.top); rows[k] = Math.max(rows[k] || 0, r.right); });
  const top = g.filter((r) => Math.round(r.top) === Math.round(g[0].top));
  return { gaps: Object.values(rows).map((r) => Math.round(box.right - r)), widths: top.map((r) => Math.round(r.width)), box: Math.round(box.width) }; })()`);
check("the take's tools grow to the column's width: every row of groups ends at its right edge, the groups of a row equally wide",
  ttFill.box > 0 && ttFill.gaps.every((d) => Math.abs(d) <= 1) && Math.max(...ttFill.widths) - Math.min(...ttFill.widths) <= 1, JSON.stringify(ttFill));
// the lyrics over everything, 60 % of the screen, a tenth larger; Esc puts them back
await ev(`(() => { const f = document.querySelector('[data-fold="lyrics"]'); if (f.classList.contains("is-folded")) f.querySelector(".label").click(); return true; })()`);
await sleep(200);
await click("#lyricsBig");
await waitFor(`!!document.querySelector("#lyrOver #lyrics")`, 3000, 50);
const lyrOverM = await ev(`(() => { const b = document.querySelector(".lyr-over-box").getBoundingClientRect(), a = document.getElementById("lyrics");
  return { width: Math.round(b.width / innerWidth * 100), zoom: getComputedStyle(document.querySelector(".lyr-over-box")).zoom, meter: !!document.querySelector("#lyrOver #lyricsMeter"),
    numbers: document.querySelectorAll("#lyrOver .lyr-num").length > 0 || a.value === "", pressed: document.getElementById("lyricsBig").getAttribute("aria-pressed") }; })()`);
// HERESY 1169 · 1239 (Viktor 08.10.2026: «Увеличь умолчание всех текстов в таком оверлее на 40%… Ты не прикручивал ещё кнопки -+?»)
await ev(`document.querySelector('.lyr-over-fs [data-lyr-z="1"]').click(); true`);
await sleep(120);
const lyrOverZ = await ev(`(() => { const b = document.querySelector(".lyr-over-box"); return { zoom: getComputedStyle(b).zoom, width: Math.round(b.getBoundingClientRect().width / innerWidth * 100), kept: localStorage.getItem("yue2.lyricsZoom"),
  text: getComputedStyle(document.getElementById("lyrics")).fontSize, head: getComputedStyle(document.querySelector(".lyr-over-head")).fontSize }; })()`);
await ev(`(() => { const p = document.querySelector('.lyr-over-fs [data-lyr-z="1"]'); p.click(); p.click(); p.click(); return true; })()`);   // two steps at most (Viktor: «Третий и дальше сбивают скейл очень сильно»)
await sleep(120);
const lyrOverMax = await ev(`({ zoom: getComputedStyle(document.querySelector(".lyr-over-box")).zoom, off: document.querySelector('.lyr-over-fs [data-lyr-z="1"]').disabled, kept: localStorage.getItem("yue2.lyricsZoom"),
  text: getComputedStyle(document.getElementById("lyrics")).fontSize, num: (document.querySelector("#lyrOver .lyr-num") ? getComputedStyle(document.querySelector("#lyrOver .lyr-num")).fontSize : "") })`);
await ev(`document.querySelector('.lyr-over-fs [data-lyr-z="0"]').click(); true`);
await sleep(120);
const lyrOverZ0 = await ev(`({ zoom: getComputedStyle(document.querySelector(".lyr-over-box")).zoom, kept: localStorage.getItem("yue2.lyricsZoom"), text: getComputedStyle(document.getElementById("lyrics")).fontSize })`);
await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
await sleep(250);
const lyrOverBack = await ev(`({ gone: !document.getElementById("lyrOver"), home: !!document.getElementById("lyrics").closest('[data-fold="lyrics"]'), meterHome: !!document.getElementById("lyricsMeter").closest(".k-lyrics"),
  frame: document.body.dataset.frame || null })`);
// HERESY 1169 · 1246 (Viktor 08.10.2026: «В Lyrics можно + и - только в самой зоне текста, а не весь интерфейс?»): the box stays, the text grows
check("⤢ beside Lyrics lifts the lyrics over everything, 60 % of the screen and four tenths larger than the form (1.54), with their meter and numbers; their own + makes the text alone a tenth larger (the box, its head and the meter stay) and is kept, two steps at most, ⟲ puts it back; Esc puts them back where they were",
  Math.abs(lyrOverM.width - 60) <= 1 && String(lyrOverM.zoom) === "1.54" && String(lyrOverZ.zoom) === "1.54" && lyrOverZ.text === "13.75px" && lyrOverZ.head === "15px" && Math.abs(lyrOverZ.width - 60) <= 1 && lyrOverZ.kept === "1" &&
  String(lyrOverMax.zoom) === "1.54" && lyrOverMax.text === "15.125px" && (lyrOverMax.num === "" || lyrOverMax.num === "12.705px") && lyrOverMax.off && lyrOverMax.kept === "2" && String(lyrOverZ0.zoom) === "1.54" && lyrOverZ0.text === "12.5px" && lyrOverZ0.kept === null && lyrOverM.meter && lyrOverM.numbers && lyrOverM.pressed === "true" && lyrOverBack.gone && lyrOverBack.home && lyrOverBack.meterHome,
  JSON.stringify({ lyrOverM, lyrOverZ, lyrOverMax, lyrOverZ0, lyrOverBack }));

// HERESY 1169 (Viktor 08.10.2026: «в редактор нужно линтер добавить, чтобы выявлял незакрытые `[` и другие теги… Открыл `[` и не
// закрыл. Целый блок проебал в синтезе»)
section("the lyrics' linter, and Generate asks first");
await ev(`(() => { document.querySelector('#tabs [data-tab="create"]').click(); const f = document.querySelector('[data-fold="lyrics"]'); if (f.classList.contains("is-folded")) f.querySelector(".label").click();
  const a = document.getElementById("lyrics"); window.__lintWas = a.value; a.value = "[Verse]\\nодна строка\\n[Chorus\\nприпев (эхо\\nконец)\\n[]"; a.dispatchEvent(new Event("input", { bubbles: true })); a.blur(); return true; })()`);
await sleep(350);
const lint1 = await ev(`(() => { const w = document.getElementById("lyrics").parentNode, m = document.getElementById("lyricsMeter");
  return { bad: [...w.querySelectorAll(".lyr-num.is-lint-bad")].map(n => n.textContent).join(), near: [...w.querySelectorAll(".lyr-num.is-lint-near")].map(n => n.textContent).join(),
    meterBad: (m.querySelector('[data-lyr="lint"]') || {}).textContent || "", meterNear: (m.querySelector('[data-lyr="lint2"]') || {}).textContent || "",
    api: window.HeresyLyrics.lint("[Verse\\n(a\\nb)\\n]").map(f => (f.bad ? "B" : "N") + (f.line + 1)).join() }; })()`);
await ev(`document.getElementById("generateBtn").click(); true`);
await waitFor(`!!document.querySelector(".hd-back.is-on:not(.is-leaving) .hd-yes")`, 3000, 50);
const lintAsk = await ev(`(() => { const b = document.querySelector(".hd-back.is-on:not(.is-leaving)"); const o = { title: b.querySelector(".hd-title").textContent, yes: b.querySelector(".hd-yes").textContent,
  alt: (b.querySelector(".hd-alt") || {}).textContent || null, no: (b.querySelector(".hd-no") || {}).textContent || null }; b.querySelector(".hd-yes").click(); return o; })()`);
await sleep(300);
const lint2 = await ev(`(() => { const a = document.getElementById("lyrics"); return { focus: document.activeElement === a, line: a.value.slice(0, a.selectionStart).split("\\n").length,
  recipe: [...document.querySelectorAll("#setupLib option")].some(o => /Musical Heresy of Creator's Ear/.test(o.textContent)) }; })()`);   // HERESY 1401: renamed
await ev(`(() => { const a = document.getElementById("lyrics"); a.value = window.__lintWas; a.dispatchEvent(new Event("input", { bubbles: true })); a.blur(); return true; })()`);
check("the lyrics' linter: a «[» not closed and an empty tag number their lines red, round brackets astray amber, each kind counted under the box; Generate asks first and «Go to the line» takes the cursor there; his conservative Russian recipe is a built-in profile",
  lint1.bad === "3,6" && lint1.near === "4,5" && lint1.meterBad === "Tags not closed or astray: 2" && lint1.meterNear === "Round brackets to look at: 2" && lint1.api === "B1,N2,N3,B4" &&
  /^A tag in the lyrics is not closed or astray: line 3/.test(lintAsk.title) && lintAsk.yes === "Go to the line" && lintAsk.alt === "Generate as it is" && lintAsk.no === "Stay" &&
  lint2.focus && lint2.line === 3 && lint2.recipe, JSON.stringify({ lint1, lintAsk, lint2 }));

// HERESY 1169 (Viktor 07.10.2026: «три кнопочки svg -, +, reset для скейла… В минус шагом 2pt до минус 4, а в плюс… до макс 8pt…
// глобальный скейл шрифтов с минус 2 и плюс до 4… Три кнопочки глобального -=R в спадающее меню в баре»)
section("the text's size: the page's in ☰, a lifted frame's on top");
const fsRead = () => ev(`(() => { const px = (s) => parseFloat(getComputedStyle(document.querySelector(s)).fontSize);
  return { head: px("#library .lib-head h3"), label: px("#view-compose .plan-head .label"), title: px("#title"), key: px("#songKey"), say: document.querySelector('.hm-fs [data-fs-say="g"]').textContent,
    minus: document.querySelector('.hm-fs [data-fs="g-"]').disabled, plus: document.querySelector('.hm-fs [data-fs="g+"]').disabled, fplus: document.querySelector('#view-compose .frame-fs [data-fs="f+"]').disabled }; })()`);
await ev(`(() => { document.querySelector('#tabs [data-tab="create"]').click(); window.ruachTextSize("g", 0); window.ruachTextSize("f", 0); return true; })()`);
await sleep(200);
const fs0 = await fsRead();
for (let i = 0; i < 6; i++) await ev(`document.querySelector('.hm-fs [data-fs="g+"]').click(); true`);   // past its +4: it stops there
await sleep(150);
const fs4 = await fsRead();
await click('#view-compose .frame-big');
await waitFor(`document.body.dataset.frame === "compose"`, 3000, 50);
for (let i = 0; i < 6; i++) await ev(`document.querySelector('#view-compose .frame-fs [data-fs="f+"]').click(); true`);   // past its +6
await sleep(150);
const fsF = await fsRead();
const fsKept = await ev(`localStorage.getItem("yue2.textSize")`);
await ev(`(() => { document.querySelector('#view-compose .frame-fs [data-fs="f0"]').click(); document.querySelector('.hm-fs [data-fs="g0"]').click(); return true; })()`);
await click('#view-compose .frame-big');
await waitFor(`!document.body.dataset.frame`, 3000, 50);
const fsBack = await fsRead();
const pt = 4 / 3;   // a point in pixels
// HERESY 1169 · 1246 (Viktor 08.10.2026: «В попапе фреймов всё скейлится с 4-мя шагами… Опусти до 3-х. Поле Title остаётся почему-то прежним размером. Дропдаун селекторы тоже»)
check("☰'s Text size: up by a point a press to +4 pt (the Takes head 16 → 21.3 px), the frame's own up by 2 to +6 on top of it (three steps), Title and the selects growing with it, kept in this browser; ⟲ puts each back",
  Math.abs(fs4.head - fs0.head - 4 * pt) < 0.05 && fs4.say === "+4 pt" && fs4.plus && !fs4.minus &&
  Math.abs(fsF.label - fs0.label - 10 * pt) < 0.05 && Math.abs(fsF.title - fs0.title - 10 * pt) < 0.05 && Math.abs(fsF.key - fs0.key - 10 * pt) < 0.05 && fsF.fplus && /"g":4/.test(fsKept || "") && /"f":6/.test(fsKept || "") &&
  Math.abs(fsBack.head - fs0.head) < 0.05 && Math.abs(fsBack.label - fs0.label) < 0.05 && fsBack.say === "0 pt", JSON.stringify({ fs0, fs4, fsF, fsKept, fsBack }));

// HERESY 1169 (Viktor 08.10.2026: «всё, что с начальным диамандом 💎, чтобы алфавитно шло вниз древа»)
const diamonds = await ev(`window.ruachTreeOrder(["💎 Voice LoRA", "💎 Musical Styles", "🔞 ЦИРКОВЬ", "🔞 ЦИРКОВЬ / БУРАТИНО", "Alpha", "💎 Instrumental Probe", "💎 Accent LoRAs", "Эксперименты", "💎 Musical Styles / Blends"]).join(" | ")`);
check("the Librarian's tree: the 💎 workspaces (the public sets) at its foot, by name among themselves, a section under its parent; the 💎 … LoRA ones lowest of all («вечное правило»)",
  diamonds === "Alpha | Эксперименты | 🔞 ЦИРКОВЬ | 🔞 ЦИРКОВЬ / БУРАТИНО | 💎 Instrumental Probe | 💎 Musical Styles | 💎 Musical Styles / Blends | 💎 Accent LoRAs | 💎 Voice LoRA", diamonds);

// HERESY 1169 · 1236 (Viktor 08.10.2026: «Убери border вокруг позлунков. В ночной не видел теме, а теперь увидел»)
section("Probes and Variations drawn by the page");
const csl = await ev(`(async () => { const v = document.getElementById("versions"), was = v.value; v.value = "4"; v.dispatchEvent(new Event("input", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 50)); const cs = getComputedStyle(v), w = getComputedStyle(document.getElementById("variations"));
  const out = { app: cs.appearance, border: cs.borderTopStyle, bg: cs.backgroundColor, fill: v.style.getPropertyValue("--fill"), app2: w.appearance, said: document.getElementById("versionsOut").textContent };
  v.value = was; v.dispatchEvent(new Event("input", { bubbles: true })); return out; })()`);
check("Probes and Variations are drawn by the page (no browser frame, no field behind): appearance none, no border, a transparent box, the track filled to the thumb (4 of 1–10: a third)",
  csl.app === "none" && csl.app2 === "none" && csl.border === "none" && /rgba\(0, 0, 0, 0\)|transparent/.test(csl.bg) && /^33\.33/.test(csl.fill) && csl.said === "4", JSON.stringify(csl));

// HERESY 1169 · 1238 (Viktor 08.10.2026: «твою утилиту для генерации партитур `score`, ... прикрути её в Студию»)
section("Recite: the lyrics laid on the score in the form");
const RSCORE = 'X:1\nT:\nM:4/4\nL:1/16\nQ:1/4=100\nV: Vocal clef=treble name="Vocal Melody" snm="Vocal"\nV: Ins clef=treble name="Ins Melody" snm="Inst."\nK:Am\n% intro\nV: Vocal\n"Am"z16|"F"z16|\nV: Ins\nA4c4e4c4|F4A4c4A4|\n% verse\nV: Vocal\n"Am"z16|"F"z16|"C"z16|"G"z16|\nV: Ins\nA4c4e4c4|F4A4c4A4|C4E4G4E4|G4B4d4B4|\nV: Vocal\n"Am"z16|"F"z16|"C"z16|"E7"z16|\nV: Ins\nA4c4e4c4|F4A4c4A4|C4E4G4E4|E4^G4B4^G4|\n';
const RLYR = "[Verse]\nОдна строка, и ещё слова.\nВторая строка тут.\n\n[Chorus]\nПрипев один.";
const rec = await ev(`(() => { const r = HeresyRecite.lay(${JSON.stringify(RSCORE)}, ${JSON.stringify(RLYR)}, {});
  let parsed = "ok"; try { HeresyAbc.parse(r.abc); } catch (e) { parsed = e.message; }
  const rows = r.abc.split("\\n"), voc = rows.filter((l, i) => rows[i - 1] === "V: Vocal").join("|"), ins = rows.filter((l, i) => rows[i - 1] === "V: Ins").join("");
  return { lines: r.lines.map(l => l.bar + "-" + l.last).join(","), first: r.firstBar, lang: r.lang, parsed, marks: (r.abc.match(/^% .*/gm) || []).join(","), lyrics: r.lyrics, ins,
    notes: (voc.replace(/"[^"]*"/g, "").match(/[A-Ga-g]/g) || []).length }; })()`);
const recIns = "A4c4e4c4|F4A4c4A4|A4c4e4c4|F4A4c4A4|C4E4G4E4|G4B4d4B4|A4c4e4c4|F4A4c4A4|C4E4G4E4|E4^G4B4^G4|";
// and the button: the score and the lyrics in the form, asked first, replaced, the planning mode Full
const recWas = await ev(`({ abc: document.getElementById("abc").value, lyrics: document.getElementById("lyrics").value, cot: (document.querySelector('input[name="cot"]:checked') || {}).value })`);
await ev(`(() => { const set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event("input", { bubbles: true })); };
  set("abc", ${JSON.stringify(RSCORE)}); set("lyrics", ${JSON.stringify(RLYR)}); document.querySelector('input[name="cot"][value="off"]').click(); return true; })()`);
const recRow = await waitFor(`!document.getElementById("reciteRow").classList.contains("is-hidden")`, 3000, 50);
await ev(`document.getElementById("reciteBtn").click(); true`);
const recAsk = await waitFor(`(() => { const b = document.querySelector(".hd-back.is-on"); return b ? { text: b.textContent.replace(/\\s+/g, " ").slice(0, 90), yes: b.querySelector(".hd-yes").textContent } : null; })()`, 3000, 50);
await ev(`document.querySelector(".hd-back.is-on .hd-yes").click(); true`);
await sleep(300);
const recDone = await ev(`({ abc: document.getElementById("abc").value.includes("% chorus"), lyrics: document.getElementById("lyrics").value.slice(0, 9), cot: (document.querySelector('input[name="cot"]:checked') || {}).value })`);
await ev(`(() => { const set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event("input", { bubbles: true })); };
  set("abc", ${JSON.stringify(recWas.abc)}); set("lyrics", ${JSON.stringify(recWas.lyrics)}); const c = document.querySelector('input[name="cot"][value="' + ${JSON.stringify(recWas.cot || "off")} + '"]'); if (c) c.click(); return true; })()`);
check("Recite lays the lyrics on the score: after its intro (bar 3), a line from a bar's start, the chorus on a two-bar phrase after a bar's rest; a syllable a note (19), Russian counted as Russian, the sections intro · verse · chorus · outro, the instruments as they were, a score the studio's strict reader takes; the button asks, replaces the score and the lyrics ([Intro] first) and turns the planning mode to Full",
  rec.lines === "2-3,4-4,6-6" && rec.first === 3 && rec.lang === "ru" && rec.parsed === "ok" && rec.marks === "% intro,% verse,% chorus,% outro" && rec.notes === 19 && rec.ins === recIns &&
  /^\[Intro\]\n\n\[Verse\]\nОдна строка, и ещё слова\.\nВторая строка тут\.\n\n\[Chorus\]\nПрипев один\.\n\n\[Outro\]\n$/.test(rec.lyrics) &&
  !!recRow && /^Recite the lyrics on this score\?\s*3 lines on bars 3–7 of 10/.test(recAsk?.text || "") && recAsk.yes === "Recite them" && recDone.abc && recDone.lyrics === "[Intro]\n\n" && recDone.cot === "full",
  JSON.stringify({ notes: rec.notes, insSame: rec.ins === recIns, recRow, recAsk, recDone, lines: rec.lines, first: rec.first, marks: rec.marks, lyrics: rec.lyrics }));

// HERESY 1169 · 1240 (Viktor 08.10.2026: «В попапе фреймов серверный лог поверх кнопки синтеза. В этом режиме смести его влево. Так не будет закрывать ничего»)
section("the server log at the left while a frame is lifted");
await ev(`(() => { if (document.body.dataset.frame) document.querySelector('#view-' + document.body.dataset.frame + ' .frame-big').click(); document.querySelector('#view-compose .frame-big').click(); return true; })()`);
await waitFor(`document.body.dataset.frame === "compose"`, 3000, 50);
await sleep(300);
const dockL = await ev(`(() => { const d = document.getElementById("logDock").getBoundingClientRect(), g = document.getElementById("generateBtn").getBoundingClientRect();
  return { left: document.getElementById("logDock").classList.contains("is-left"), x: Math.round(d.left), overGen: !(d.right <= g.left || d.left >= g.right || d.bottom <= g.top || d.top >= g.bottom) }; })()`);
await ev(`document.querySelector('#view-compose .frame-big').click(); true`);
await waitFor(`!document.body.dataset.frame`, 3000, 50);
const dockR = await ev(`({ left: document.getElementById("logDock").classList.contains("is-left"), style: document.getElementById("logDock").getAttribute("style") || "" })`);
check("with a frame lifted the server log stands at the left, off Generate; back in the room it stands at the right again",
  dockL.left && dockL.x === 16 && !dockL.overGen && !dockR.left && !/max-width|bottom/.test(dockR.style), JSON.stringify({ dockL, dockR }));

// HERESY 1169 (Viktor 08.10.2026: «У Огранщика во первых нужно перепроверить пайплайн и его логичность. Апскейлер нужен в двух местах - перед разделением на стемы и в конце после ремастера… По дефолту стеммер - four»)
section("the Refiner's chain: Debuzz, Upscale, Stems, Remaster, Upscale; the stems four, from a file of the tree");
const chainA = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), real = window.fetch, sent = [];
  const json = (o, s) => Promise.resolve(new Response(JSON.stringify(o), { status: s || 200, headers: { "Content-Type": "application/json" } }));
  window.fetch = function (u, o) { u = String(u);
    if (u === "/lab/chain" && o && o.method === "POST") { sent.push(JSON.parse(o.body)); return json({ status: "running", steps: [{ step: "debuzz", status: "running" }], final: "" }, 202); }
    if (u.startsWith("/lab/chain?")) return json({ status: "none" });
    if (u.startsWith("/lab/stems?")) { sent.push(u); return json({ status: "failed", error: "stubbed" }, 500); }
    return real(u, o); };
  const st = document.getElementById("pcStems"), up = document.getElementById("pcUpscale"), end = document.getElementById("pcUpEnd"), de = document.getElementById("rmDeess"), sel = document.getElementById("stSource");
  // the room stays as it is (hidden, the chain row is in the page all the same); a take for the Refiner only while it has none
  const hadTake = (document.getElementById("postTitle").textContent || "").trim() !== "", stub = { name: "suite-chain-take", label: "suite chain", seconds: 21 };
  if (!hadTake) { window.HeresyPost.setTake(stub); window.HeresyDerived.setTake(stub); }
  try {
    const order = [...document.querySelectorAll("#postChain .pc-node")].map((n) => (n.querySelector("input[type=checkbox]") || { id: "remaster" }).id);
    const four = document.getElementById("pcStemsMode").value, say0 = document.getElementById("pcRmSay").textContent, locked0 = de.disabled;
    st.checked = true; st.dispatchEvent(new Event("change", { bubbles: true }));
    await wait(50);
    const locked1 = de.disabled, say1 = document.getElementById("pcRmSay").textContent;
    de.checked = true; up.checked = true; end.checked = true;
    document.getElementById("pcRun").disabled = false; document.getElementById("pcRun").click();
    await wait(250);
    const body = sent.find((x) => typeof x === "object") || {};
    const split = [...document.querySelectorAll("[data-dv-split]")].map((b) => b.dataset.dvSplit);
    const src = "derived/upscale-subtle-20261008-125828/upscale-subtle-A.flac";
    sel.insertAdjacentHTML("beforeend", '<option value="' + src + '">x</option>'); sel.value = src;
    document.querySelector('[data-dv-split="four"]').click();
    await wait(250);
    const stemsUrl = sent.find((x) => typeof x === "string") || "";
    return { order, four, say0, say1, locked0, locked1, split, stemsUrl, take: !!body.name,
      body: { stems: body.stems, stems_mode: body.stems_mode, upscale: body.upscale, upscale_end: body.upscale_end, upscale_end_mode: body.upscale_end_mode, deess: (body.remaster || {}).deess } };
  } finally {
    window.fetch = real;
    st.checked = false; st.dispatchEvent(new Event("change", { bubbles: true })); de.checked = false; up.checked = false; end.checked = false;
    sel.value = ""; const o = sel.querySelector('option[value^="derived/upscale-subtle-20261008"]'); if (o) o.remove();
    if (!hadTake) { window.HeresyPost.setTake(null); window.HeresyDerived.setTake(null); }
  } })()`);
check("the chain goes Debuzz › Upscale › Stems › Remaster › Upscale: the stems four by default; with them the Remaster says its preset and the de-esser comes alive, and the run asks for both upscales and the de-ess; the Stems step splits four first, from the file picked",
  chainA.order.join(",") === "pcDebuzz,pcUpscale,pcStems,remaster,pcUpEnd" && chainA.four === "four" && !/balanced/.test(chainA.say0) && /^balanced/.test(chainA.say1) &&
  chainA.locked0 === true && chainA.locked1 === false && chainA.take && chainA.body.stems === true && chainA.body.stems_mode === "four" && chainA.body.upscale === true &&
  chainA.body.upscale_end === true && chainA.body.upscale_end_mode === "subtle" && chainA.body.deess === true && chainA.split[0] === "four" &&
  /mode=four&source=derived%2Fupscale-subtle-20261008-125828%2Fupscale-subtle-A\.flac$/.test(chainA.stemsUrl), JSON.stringify(chainA));

// HERESY 1169 · 1247 (Viktor 08.10.2026: «где у нас i в кружочке для тултипов, замени этот артефакт Кита на красивую svg иконку… не нужно в кружочек»; «…жёлтым треуголик с воскл. знаком. Такое тоже переделай в правильную SVG иконку. И всюду пройдись»)
section("the signs drawn: an i without a circle, a warning's triangle");
const signs = await ev(`(() => {
  const i = document.querySelector(".info"), cs = getComputedStyle(i);
  const n = document.querySelector(".lora-notes"), was = { hidden: n.hidden, warn: n.classList.contains("is-warn") };
  n.hidden = false; n.classList.add("is-warn"); const ns = getComputedStyle(n), warnMask = /svg/.test(ns.maskImage || ns.webkitMaskImage || "");
  n.hidden = was.hidden; n.classList.toggle("is-warn", was.warn);
  const p = document.createElement("p"); window.ruachSigned(p, "\\u26a0 one\\n\\u26a0 two");
  return { border: cs.borderTopStyle, mask: /svg/.test(cs.maskImage || cs.webkitMaskImage || ""), text: i.textContent, before: getComputedStyle(i, "::before").content, h: cs.height,
    warnMask, notesText: n.textContent, drawn: p.querySelectorAll(".warn-ico").length, left: p.textContent.indexOf("\\u26a0"), words: p.textContent };
})()`);
check("the (i) is a drawn i with no circle (a mask, no border, 12 px), the LoRA notes' warning a drawn triangle with no glyph written; a ⚠ in a line of the page is drawn, none left in its words",
  signs.border === "none" && signs.mask && signs.text === "" && /^(none|normal)$/.test(signs.before) && signs.h === "12px" && signs.warnMask && signs.notesText === "" &&
  signs.drawn === 2 && signs.left === -1 && signs.words === "one\ntwo", JSON.stringify(signs));

// HERESY 1169 · 1248 (Viktor 08.10.2026: «Мышечное меню… твои мини подсказки на некоторых опциях срезают текст. А Resite вообще урезана до R. Лучше прямо с боку от меню выводить небольшой тултип… а inline подсказки вообще оттуда убрать»)
section("the take's menu: whole names, the hint beside it");
await ev(`(() => { const c = document.querySelector("#libList .take"), r = c.getBoundingClientRect();
  c.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: r.left + 20, clientY: r.top + 10 })); return true; })()`);
await waitFor(`!!document.querySelector(".hm-menu .hm-item")`, 3000, 50);
const menuH = await ev(`(async () => {
  const m = document.querySelector(".hm-menu"), mr = m.getBoundingClientRect(), items = [...m.querySelectorAll(".hm-item")];
  const cut = items.map((b) => b.querySelector(".hm-label")).filter((l) => l && l.scrollWidth > l.clientWidth + 1).map((l) => l.textContent);
  let shown = null;
  for (const b of items) {
    if (b.disabled) continue;
    b.focus(); await new Promise((r) => setTimeout(r, 20));
    const t = document.querySelector(".hm-tip:not([hidden])");
    if (t) { const tr = t.getBoundingClientRect(), br = b.getBoundingClientRect();
      shown = { label: b.textContent.trim(), tip: t.textContent, beside: tr.left >= mr.right - 1 || tr.right <= mr.left + 1, level: Math.abs((tr.top + tr.height / 2) - (br.top + br.height / 2)) < 2 }; break; }
  }
  return { inline: m.querySelectorAll(".hm-hint").length, cut, shown };
})()`);
await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
await sleep(150);
const menuGone = await ev(`!document.querySelector(".hm-menu") && (!document.querySelector(".hm-tip") || document.querySelector(".hm-tip").hidden)`);
check("the take's menu writes no hint in its rows and cuts no name; an item's hint shows beside the menu, level with the item; Esc takes both away",
  menuH.inline === 0 && menuH.cut.length === 0 && !!menuH.shown && menuH.shown.beside && menuH.shown.level && menuGone, JSON.stringify({ menuH, menuGone }));

// HERESY 1169 · 1249 (Viktor 08.10.2026: «Кнопка "Plan score only" в ре;име FULL неактивна, а должна быть. И даже если есть уже партитура, тоже должна быть активной, с попапом предепреждением о перезаписывании текущего ABC. И переименуй её во всех языках > `Create ABC Score`»)
section("Create ABC Score: its name, live in Full with a score, a question before writing over it");
await mockClear();
const cabc = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), b = document.getElementById("planBtn"), abc = document.getElementById("abc");
  const st = document.getElementById("style"), ly = document.getElementById("lyrics");
  window.__cabcWas = { cot: document.querySelector('input[name="cot"]:checked').value, abc: abc.value, style: st.value, lyrics: ly.value };
  st.value = "pop, 100 bpm"; ly.value = "[Verse]" + String.fromCharCode(10) + "la la la";   // what a plan needs, besides the score
  document.querySelector('input[name="cot"][value="full"]').click(); await wait(50);
  abc.value = ${JSON.stringify(RSCORE)}; abc.dispatchEvent(new Event("input", { bubbles: true })); await wait(50);
  const out = { label: b.textContent.trim(), enabled: !b.disabled };
  b.click(); await wait(250);
  const box = document.querySelector(".hd-back:not(.is-leaving)");
  out.ask = box ? box.textContent.replace(/\\s+/g, " ").slice(0, 140) : "";
  out.yes = box && box.querySelector(".hd-yes") ? box.querySelector(".hd-yes").textContent : "";
  return out;
})()`);
await answerDialog(false);
await sleep(250);
const cabcKept = await ev(`document.getElementById("abc").value`);
const cabcSent = (await mockGet("mock/requests")).filter((r) => r.path === "/synth").length;
await ev(`(() => { const w = window.__cabcWas, abc = document.getElementById("abc"); abc.value = w.abc; abc.dispatchEvent(new Event("input", { bubbles: true }));
  document.getElementById("style").value = w.style; document.getElementById("lyrics").value = w.lyrics; document.getElementById("lyrics").dispatchEvent(new Event("input", { bubbles: true }));
  document.querySelector('input[name="cot"][value="' + w.cot + '"]').click(); delete window.__cabcWas; return true; })()`);
check("the button is Create ABC Score, live in Full with a score in the form; it asks before writing over the score, and Cancel keeps the score and sends nothing",
  cabc.label === "Create ABC Score" && cabc.enabled && /Create a new ABC score\?/.test(cabc.ask) && /written over/.test(cabc.ask) && cabc.yes === "Write over it" && cabcKept === RSCORE && cabcSent === 0,
  JSON.stringify({ cabc, cabcKept, cabcSent }));

// HERESY 1169 · 1250 (Viktor 08.10.2026: «Попап Гайда сделай шире на 10% по hv и выше по vv. И кнопочку FULL SCREEN. И также кнопки скейла текста сделай… перехват браузерного F1 для вывода Гайда»)
section("the guide: F1, 10 % larger, its text's size, the whole screen");
await ev(`(() => { const real = window.fetch, NL = String.fromCharCode(10); window.__guideFetch = real;
  const md = ["# Ruach Studio · The Guide", "", "Songs from words.", "", "## Start here", "", "### What this is", "", "A studio. ".repeat(40), "", "## Creator", "", "### Compose", "", "Words. ".repeat(80)].join(NL);
  window.fetch = (u, o) => String(u).startsWith("/lab/guide/") ? Promise.resolve(new Response(md, { status: 200 })) : real(u, o); return true; })()`);
const pressF1 = async () => { await send("Input.dispatchKeyEvent", { type: "keyDown", key: "F1", code: "F1", windowsVirtualKeyCode: 112 }); await send("Input.dispatchKeyEvent", { type: "keyUp", key: "F1", code: "F1", windowsVirtualKeyCode: 112 }); };
await pressF1();
await waitFor(`!!document.querySelector(".hg-back:not([hidden]) .hg-doc")`, 4000, 50);
const gd = await ev(`(async () => { const wait = (ms) => new Promise((r) => setTimeout(r, ms)), box = document.querySelector(".hg-box"), r = box.getBoundingClientRect(), back = document.querySelector(".hg-back");
  const pad = parseFloat(getComputedStyle(back).paddingLeft) * 2, out = { w: Math.round(r.width), wWant: Math.round(Math.min(1300, innerWidth - pad)), h: Math.round(r.height), hWant: Math.round(Math.min(innerHeight * 0.94, 1080)) };
  const plus = document.querySelector('[data-hg-z="1"]'); plus.click(); plus.click(); plus.click(); await wait(80);
  out.z = getComputedStyle(document.querySelector(".hg-doc")).zoom; out.plusOff = plus.disabled; out.kept = localStorage.getItem("yue2.guideZoom");
  document.querySelector('[data-hg-z="0"]').click(); await wait(50); out.z0 = getComputedStyle(document.querySelector(".hg-doc")).zoom;
  document.querySelector(".hg-full").click(); await wait(80); const f = box.getBoundingClientRect();
  out.full = back.classList.contains("is-full") && Math.round(f.width) === innerWidth && Math.round(f.height) === innerHeight;
  document.querySelector(".hg-full").click(); await wait(50); out.back = !back.classList.contains("is-full");
  return out; })()`);
await pressF1();
await sleep(200);
const gdShut = await ev(`!document.querySelector(".hg-back:not([hidden])")`);
await ev(`(() => { window.fetch = window.__guideFetch; delete window.__guideFetch; localStorage.removeItem("yue2.guideZoom"); localStorage.removeItem("yue2.guideFull"); return true; })()`);
check("F1 opens the guide and shuts it; the box 1300 × 94 vh at most (10 % larger); its text a tenth larger a step, two at most, ⟲ back; ⤢ the whole screen and back",
  Math.abs(gd.w - gd.wWant) <= 1 && Math.abs(gd.h - gd.hWant) <= 1 && String(gd.z) === "1.21" && gd.plusOff && gd.kept === "2" && String(gd.z0) === "1" && gd.full && gd.back && gdShut, JSON.stringify({ gd, gdShut }));

// HERESY 1169 · 1251 (Viktor 08.10.2026: «В английском как базовом нашем языке, по правилам оформления заголовков исправь сущ. и прил., чтобы начинались с заглавной. `The guide` > `The Guide` и т.п.»)
section("English headings in title case, still in every language");
const tcase = await ev(`(() => { const name = (sel) => (document.querySelector(sel) || {}).textContent || "";
  const sums = [...document.querySelectorAll("#view-compose .sum-name")].map((s) => s.textContent.trim());
  return { sums, planner: [...document.querySelectorAll("#advDrawer h4")].map((h) => h.textContent.trim()).join("|"),
    ru: window.RuachI18n.look("Supply Your Own Score", "ru"), uk: window.RuachI18n.look("Server Log", "uk") }; })()`);
check("the page's English headings in title case (Start from an Idea, Cover or Remix, Supply Your Own Score, Score Planner, Music Tokens, Sound and Output); their new words keep their translations",
  ["Start from an Idea", "Cover or Remix", "Supply Your Own Score", "Sampling and Denoising"].every((s) => tcase.sums.includes(s)) &&
  /Score Planner/.test(tcase.planner) && /Music Tokens/.test(tcase.planner) && /Sound and Output/.test(tcase.planner) && tcase.ru === "Своя партитура" && tcase.uk === "Лог сервера",
  JSON.stringify(tcase));

// HERESY 1169 · 1253 (Viktor 08.10.2026: «Full as the default, the 6144 default score cap (8192 at max limit)»)
section("Full by default; the score's ceiling 8192, its default 6144");
const fd = await ev(`(() => {
  const full = document.querySelector('input[name="cot"][value="full"]'), off = document.querySelector('input[name="cot"][value="off"]');
  const k = document.querySelector('input[data-group="abc"][data-key="max_tokens"]'), was = k.value;
  const set = (v) => { k.value = v; k.dispatchEvent(new Event("change", { bubbles: true })); return k.value; };
  const out = { fullDefault: full.defaultChecked, offDefault: off.defaultChecked, was, at9000: set("9000"), at8000: set("8000") };
  out.back = set(was);
  return out; })()`);
check("a fresh page starts in Full; the score's Max tokens goes up to 8192 (9000 comes back to it, 8000 stays), and back to what it was",
  fd.fullDefault && !fd.offDefault && fd.at9000 === "8192" && fd.at8000 === "8000" && fd.back === fd.was, JSON.stringify(fd));

// HERESY 1169 · 1254 (the +6 frame's selects clipped their grown words: From the Write…, as writte…, Music · up to 8:…; the LoRA notes stood as a second i)
section("a lifted frame at +6: the selects keep their words; the LoRA notes their own sign");
await ev(`(() => { if (document.body.dataset.frame) document.querySelector('#view-' + document.body.dataset.frame + ' .frame-big').click(); document.querySelector('#view-compose .frame-big').click(); return true; })()`);
await waitFor(`document.body.dataset.frame === "compose"`, 3000, 50);
await ev(`window.ruachTextSize("f", 6); true`);
await sleep(300);
const sel6 = await ev(`(() => { const fits = (sel) => { const cs = getComputedStyle(sel), s = document.createElement("span"); s.style.cssText = "position:absolute;visibility:hidden;white-space:pre;font:" + cs.font;
    s.textContent = sel.selectedOptions[0] ? sel.selectedOptions[0].textContent : ""; document.body.appendChild(s); const w = s.getBoundingClientRect().width; s.remove();
    return Math.round(sel.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - w); };
  const n = document.querySelector(".lora-notes"), i = document.querySelector(".info"), was = n.hidden; n.hidden = false; n.classList.remove("is-warn");
  const out = { key: fits(document.getElementById("songKey")), writer: fits(document.getElementById("wrHandPick")), profile: fits(document.querySelector("#setupLibRow select")),
    notesOwn: getComputedStyle(n).maskImage !== getComputedStyle(i).maskImage && /svg/.test(getComputedStyle(n).maskImage) };
  n.hidden = was; return out; })()`);
await ev(`(() => { window.ruachTextSize("f", 0); document.querySelector('#view-compose .frame-big').click(); return true; })()`);
await waitFor(`!document.body.dataset.frame`, 3000, 50);
check("at a lifted frame's +6 the key, the Writer's and the profile's selects show their whole words (their widths in em); the LoRA notes are a drawn list, not a second i",
  sel6.key >= -1 && sel6.writer >= -1 && sel6.profile >= -1 && sel6.notesOwn, JSON.stringify(sel6));

// HERESY 1169 · 1255 (Viktor 08.10.2026: «RC3 завтра или послезавтра с Artist Early Preview»; «Код Художника оправданнее строит на рабочем Krea2»)
section("the Artist room: a prompt of one's own in three shapes from one seed, its runs, a square one the cover");
const arWas = await ev(`document.body.dataset.tab`);
await ev(`(() => { const real = window.fetch; window.__arFetch = real; window.__arAsked = [];
  const pic = (n, shape, w, h) => { const f = String(n).padStart(2, "0") + "-" + shape.replace(":", "x") + "-s100"; return { n, shape, seed: 100, w, h, nsfw: 0, took: 30, kept: true, file: f + ".png", thumb: "thumbs/" + f + ".jpg" }; };
  const run = (id, status, pics, extra) => Object.assign({ id, prompt: "A boat at dawn, no text.", shapes: ["1:1", "16:9", "9:16"], seed: 100, count: 1, painter: "krea2-q4",
    created: 1791500000, status, of: 3, pictures: pics }, extra || {});
  window.__arRuns = [run("20261008-160000-aaaa", "done", [pic(1, "1:1", 1280, 1280), pic(2, "16:9", 1920, 1080), pic(3, "9:16", 1080, 1920)], { took: 150 })];
  const json = (b, s) => Promise.resolve(new Response(JSON.stringify(b), { status: s || 200, headers: { "Content-Type": "application/json" } }));
  window.fetch = (u, o) => {
    u = String(u);
    if (u.startsWith("/lab/artist/runs")) return json({ runs: window.__arRuns });
    if (u.startsWith("/lab/artist/draw")) { const b = JSON.parse(o.body); window.__arAsked.push(["draw", b]);
      const r = run("20261008-170000-bbbb", "queued", [], { prompt: b.prompt, shapes: b.shapes, count: b.count, seed: 7, of: b.shapes.length * b.count });
      window.__arRuns = [r].concat(window.__arRuns); return json(r, 202); }
    if (u.startsWith("/lab/artist/cover")) { window.__arAsked.push(["cover", JSON.parse(o.body)]); return json({ cover: "x", kept: null }); }
    return real(u, o);
  };
  return true; })()`);
await ev(`document.getElementById("tabArtist").click(); true`);
await waitFor(`document.querySelectorAll("#arRuns .ar-run").length === 1`, 4000, 50);
const ar = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), $ = (id) => document.getElementById(id), fire = (el, t) => el.dispatchEvent(new Event(t, { bubbles: true }));
  const out = { tab: document.body.dataset.tab, shapes: [...document.querySelectorAll("#arShapes input")].map((i) => i.value).join(" ") };
  $("arPrompt").value = ""; fire($("arPrompt"), "input"); out.offEmpty = $("arDraw").disabled;
  $("arPrompt").value = "A lighthouse at night, painted in oils."; fire($("arPrompt"), "input");
  document.querySelectorAll("#arShapes input").forEach((i) => { i.checked = i.value !== "9:16"; }); fire($("arShapes"), "change");
  $("arCount").value = "3"; fire($("arCount"), "change"); $("arSeed").value = ""; fire($("arSeed"), "input");
  out.cost = $("arCost").textContent; out.onFull = !$("arDraw").disabled;
  const pics = [...document.querySelectorAll('.ar-run[data-id="20261008-160000-aaaa"] .ar-pic')];
  out.ratios = pics.map((f) => { const r = f.querySelector(".ar-thumb").getBoundingClientRect(); return Math.round(r.width / r.height * 100) / 100; });
  out.covers = pics.map((f) => !!f.querySelector(".ar-cover")).join(",");
  $("arDraw").click(); await wait(300);
  out.asked = (window.__arAsked.filter((a) => a[0] === "draw")[0] || [])[1];
  const live = document.querySelector(".ar-run.is-live");
  out.live = live ? live.dataset.id + ":" + live.querySelectorAll(".ar-pic.is-wait").length : "";
  out.liveFirst = document.querySelector("#arRuns .ar-run") === live;
  document.querySelector('.ar-run[data-id="20261008-160000-aaaa"] .ar-thumb').click(); await wait(80); document.querySelector('#arStage [data-stage="view"]').click(); await wait(250);   // 1271: picked, then over the page
  const v = document.querySelector(".ar-view");
  out.view = v ? v.querySelector(".art-count").textContent + " " + v.querySelector(".art-title").textContent : "";
  out.square = v ? v.style.getPropertyValue("--ar") : "";
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })); await wait(80);
  out.view2 = v ? v.querySelector(".art-title").textContent : ""; out.cover2 = v ? v.querySelector(".ar-cover").disabled : null;
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await wait(250);
  out.shut = !document.querySelector(".ar-view");
  document.querySelector('.ar-run[data-id="20261008-160000-aaaa"] [data-act="form"]').click(); await wait(80);
  out.form = [$("arPrompt").value, $("arSeed").value, $("arCount").value, [...document.querySelectorAll("#arShapes input")].filter((i) => i.checked).length].join("|");
  return out; })()`);
await ev(`(() => { window.fetch = window.__arFetch; delete window.__arFetch; delete window.__arRuns; delete window.__arAsked;
  ["yue2.arPrompt", "yue2.arShapes", "yue2.arCount", "yue2.arSeed", "yue2.arPainter"].forEach((k) => localStorage.removeItem(k));
  const $ = (id) => document.getElementById(id); $("arPrompt").value = ""; $("arSeed").value = ""; $("arCount").value = "1";
  document.querySelectorAll("#arShapes input").forEach((i) => { i.checked = i.value === "1:1"; }); $("arShapes").dispatchEvent(new Event("change", { bubbles: true }));
  return true; })()`);
await ev(`document.querySelector('.topbar [data-tab="${arWas}"]').click(); true`);
await sleep(300);
check("the Artist: the room from the bar; three shapes; Draw waits for a prompt; 2 shapes × 3 variations say 6 pictures; the run asked for as the form says (a new seed when none)",
  ar.tab === "artist" && ar.shapes === "1:1 16:9 9:16" && ar.offEmpty && ar.onFull && /^6 pictures/.test(ar.cost) && ar.asked && ar.asked.prompt === "A lighthouse at night, painted in oils." &&
  JSON.stringify(ar.asked.shapes) === '["1:1","16:9"]' && ar.asked.count === 3 && ar.asked.seed === null && ar.asked.painter === "krea2-q4", JSON.stringify(ar));
check("  the new run on top, live, its six pictures to come in their shapes; a done run's thumbnails in theirs (1, 16:9, 9:16); Set as cover on the square one only",
  ar.live === "20261008-170000-bbbb:6" && ar.liveFirst && ar.ratios.length === 3 && Math.abs(ar.ratios[0] - 1) < .03 && Math.abs(ar.ratios[1] - 1.78) < .05 && Math.abs(ar.ratios[2] - .56) < .05 &&
  ar.covers === "true,false,false", JSON.stringify({ live: ar.live, ratios: ar.ratios, covers: ar.covers }));
check("  a picture over the page in its own shape, → the next (16:9, no cover there), Esc shuts it; To the form brings back its prompt, seed, variations and shapes",
  ar.view === "1 / 3 1:1 · 1280×1280 · seed 100" && ar.square === "1/1" && /^16:9 · 1920×1080/.test(ar.view2) && ar.cover2 === true && ar.shut &&
  ar.form === "A boat at dawn, no text.|100|1|3" && (await ev(`document.body.dataset.tab`)) === arWas, JSON.stringify({ view: ar.view, view2: ar.view2, form: ar.form }));

// HERESY 1169 · 1257 (Viktor 08.10.2026: «живую проявку с латентного шума до готовой картинки… В InvokeAI можно либо выключить, либо включить»;
// «Ты предусмотрел галлерею сгенерированного арта? Изучи интерфейс и функционал InvokeAI»)
section("the Artist's live preview and its gallery");
const ar7Was = await ev(`document.body.dataset.tab`);
await ev(`(() => { const real = window.fetch; window.__ar7Fetch = real; window.__ar7Asked = [];
  const pic = (n, shape, w, h, star) => { const f = String(n).padStart(2, "0") + "-" + shape.replace(":", "x") + "-s100"; const p = { n, shape, seed: 100, w, h, nsfw: 0, took: 30, kept: true, file: f + ".png", thumb: "thumbs/" + f + ".jpg" }; if (star) p.star = true; return p; };
  const base = { prompt: "A boat at dawn, no text.", seed: 100, count: 1, painter: "krea2-q4", created: 1791500000 };
  window.__ar7Runs = [
    Object.assign({}, base, { id: "20261008-180000-cccc", shapes: ["1:1", "16:9"], status: "running", of: 2, pictures: [], gpu: 1, live: { live: 1, step: 3, of: 8, file: "preview/01.jpg" }, prompt: "A fox in the snow, no text.", seed: 7 }),
    Object.assign({}, base, { id: "20261008-160000-aaaa", shapes: ["1:1", "16:9", "9:16"], status: "done", of: 3, took: 150,
      pictures: [pic(1, "1:1", 1280, 1280), pic(2, "16:9", 1920, 1080, true), pic(3, "9:16", 1080, 1920)] }),
  ];
  const json = (b, s) => Promise.resolve(new Response(JSON.stringify(b), { status: s || 200, headers: { "Content-Type": "application/json" } }));
  window.fetch = (u, o) => {
    u = String(u);
    if (u.startsWith("/lab/artist/runs")) return json({ runs: window.__ar7Runs });
    if (u.startsWith("/lab/artist/star")) { const b = JSON.parse(o.body); window.__ar7Asked.push(["star", b]); return json({ star: b.star, file: b.file }); }
    if (u.startsWith("/lab/artist/draw")) { const b = JSON.parse(o.body); window.__ar7Asked.push(["draw", b]); return json(Object.assign({}, base, { id: "20261008-190000-dddd", shapes: b.shapes, status: "queued", of: 1, pictures: [] }), 202); }
    return real(u, o);
  };
  ["yue2.arLook", "yue2.arFilter", "yue2.arSize", "yue2.arLive"].forEach((k) => localStorage.removeItem(k));
  return true; })()`);
await ev(`document.getElementById("tabArtist").click(); true`);
await waitFor(`document.querySelectorAll("#arRuns .ar-run").length === 2`, 4000, 50);
const ar7 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), $ = (id) => document.getElementById(id);
  const run = document.querySelector('.ar-run[data-id="20261008-180000-cccc"]'), places = run ? [...run.querySelectorAll(".ar-pic.is-wait .ar-gone")] : [];
  const img = places[0] && places[0].querySelector("img");
  const out = { develop: places[0] ? places[0].classList.contains("ar-develop") : false, src: img ? img.getAttribute("src") : "",
    stepno: places[0] && places[0].querySelector(".ar-stepno") ? places[0].querySelector(".ar-stepno").textContent : "",
    next: places[1] ? places[1].textContent.trim() : "", liveOn: $("arLive").checked, filtersHidden: $("arFilters").hidden };
  $("arLive").checked = false; $("arLive").dispatchEvent(new Event("change", { bubbles: true }));
  $("arPrompt").value = "A boat."; $("arPrompt").dispatchEvent(new Event("input", { bubbles: true }));
  // HERESY 1270, 1340: the running one done first (Stop hides with it), then Draw
  window.__ar7Runs.forEach((r) => { if (r.status === "running") r.status = "done"; });
  for (let i = 0; i < 60 && !$("arStop").hidden; i++) await wait(100);
  $("arDraw").click(); await wait(300);
  const asked = window.__ar7Asked.filter((a) => a[0] === "draw").map((a) => a[1]);
  out.previewAsked = asked.length ? asked[0].preview : "none"; out.liveKept = localStorage.getItem("yue2.arLive");
  document.querySelector('#arBar [data-look="gallery"]').click(); await wait(200);
  out.gallery = document.querySelectorAll(".ar-gpic").length; out.total = $("arTotal").textContent; out.filtersShown = !$("arFilters").hidden;
  document.querySelector('#arFilters [data-filter="16:9"]').click(); await wait(100); out.wide = document.querySelectorAll(".ar-gpic").length;
  document.querySelector('#arFilters [data-filter="star"]').click(); await wait(100); out.starred = document.querySelectorAll(".ar-gpic").length;
  document.querySelector('#arFilters [data-filter="all"]').click(); await wait(100);
  document.querySelector('#arSizes [data-size="l"]').click(); await wait(100);
  out.size = getComputedStyle(document.querySelector(".ar-gallery")).getPropertyValue("--g-h").trim(); out.sizeKept = localStorage.getItem("yue2.arSize");
  document.querySelector('.ar-gpic[data-g="0"] .ar-star').click(); await wait(250);
  out.star = (window.__ar7Asked.filter((a) => a[0] === "star")[0] || [])[1] || null;
  out.starOn = document.querySelector('.ar-gpic[data-g="0"] .ar-star').classList.contains("is-on");
  document.querySelector('.ar-gpic[data-g="0"] .ar-thumb').click(); await wait(80); document.querySelector('#arStage [data-stage="view"]').click(); await wait(250);   // 1271: picked, then over the page
  const v = document.querySelector(".ar-view");
  out.view = v ? v.querySelector(".art-count").textContent : "";
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })); await wait(80);
  out.view2 = v ? v.querySelector(".art-title").textContent : ""; out.vstar = v ? v.querySelector(".ar-vstar").textContent : "";
  v.querySelector(".ar-vform").click(); await wait(200);
  out.form = [$("arPrompt").value, $("arSeed").value, [...document.querySelectorAll("#arShapes input")].filter((i) => i.checked).map((i) => i.value).join(",")].join("|");
  out.shut = !document.querySelector(".ar-view");
  return out; })()`);
await ev(`(() => { window.fetch = window.__ar7Fetch; delete window.__ar7Fetch; delete window.__ar7Runs; delete window.__ar7Asked;
  ["yue2.arPrompt", "yue2.arShapes", "yue2.arCount", "yue2.arSeed", "yue2.arPainter", "yue2.arLook", "yue2.arFilter", "yue2.arSize", "yue2.arLive"].forEach((k) => localStorage.removeItem(k));
  const $ = (id) => document.getElementById(id); $("arPrompt").value = ""; $("arSeed").value = ""; $("arCount").value = "1"; $("arLive").checked = true;
  document.querySelectorAll("#arShapes input").forEach((i) => { i.checked = i.value === "1:1"; }); $("arShapes").dispatchEvent(new Event("change", { bubbles: true }));
  document.querySelector('#arBar [data-look="runs"]').click();
  return true; })()`);
await ev(`document.querySelector('.topbar [data-tab="${ar7Was}"]').click(); true`);
await sleep(300);
check("the Artist's live preview: the place being painted shows its step's picture (preview/01.jpg at step 3 of 8), the next waits; off, the run is asked without it (kept off)",
  ar7.develop && /preview%2F01\.jpg&v=3$/.test(ar7.src) && ar7.stepno === "3 / 8" && ar7.next === "to come" && ar7.liveOn && ar7.filtersHidden && ar7.previewAsked === false && ar7.liveKept === "0", JSON.stringify(ar7));
check("  the gallery: every kept picture of every run (3), by shape (16:9: 1), the starred (1), three sizes (L 300 px, kept); a star sent and shown",
  ar7.gallery === 3 && /^3 of 3/.test(ar7.total) && ar7.filtersShown && ar7.wide === 1 && ar7.starred === 1 && ar7.size === "300px" && ar7.sizeKept === "l" &&
  ar7.star && ar7.star.id === "20261008-160000-aaaa" && ar7.star.file === "01-1x1-s100.png" && ar7.star.star === true && ar7.starOn, JSON.stringify(ar7));
check("  the gallery's picture over the page walks every picture (1 / 3, → the 16:9, starred ★); To the form brings back its prompt, seed and shape",
  ar7.view === "1 / 3" && /^16:9 · 1920×1080/.test(ar7.view2) && ar7.vstar === "★" && ar7.form === "A boat at dawn, no text.|100|16:9" && ar7.shut &&
  (await ev(`document.body.dataset.tab`)) === ar7Was, JSON.stringify({ view: ar7.view, view2: ar7.view2, vstar: ar7.vstar, form: ar7.form }));

// HERESY 1169 · 1258 (Viktor 08.10.2026: «Двухуровневый аудиоплеер наш давай оставим только в аудиотворческих комнатах… В остальных
// одноуровневый… когда делаем распахивание фреймов и редактора в оверлей, сворачиваем полный плеер в одноуровневый»; «комнате
// художника… колонку Taker… по умолчанию свёрнутой. Серверный лог фрейм в левую сторону»; «Плеер при F5 не держит последний трек и его позицию»)
section("the player's rows by the room; the Artist's folded Takes and its log on the left; the player's place kept");
const pr8Size = await ev(`[innerWidth, innerHeight]`);
await send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
const pr8Was = await ev(`document.body.dataset.tab`);
await sleep(300);
const rowsOf = async (tab) => {
  await ev(`document.querySelector('.topbar [data-tab="${tab}"]').click(); true`);
  await sleep(350);
  return ev(`(() => { const p = document.getElementById("playbar").getBoundingClientRect(), w = document.getElementById("wave").getBoundingClientRect(),
    c = document.querySelector("#playbar .pb-ctrl").getBoundingClientRect(); return Math.abs((w.top + w.bottom) / 2 - (c.top + c.bottom) / 2) < 8 ? 1 : 2; })()`);
};
await ev(`localStorage.removeItem("yue2.libFolded.artist"); true`);
const pr8 = { create: await rowsOf("create"), post: await rowsOf("post"), collection: await rowsOf("collection"), write: await rowsOf("write"), artist: await rowsOf("artist") };
pr8.artistFolded = await ev(`document.getElementById("library").classList.contains("is-folded")`);
pr8.logLeftArtist = await ev(`document.getElementById("logDock").classList.contains("is-left")`);
await ev(`document.getElementById("libUnfold").click(); true`);
await sleep(200);
pr8.artistUnfolded = await ev(`!document.getElementById("library").classList.contains("is-folded") && localStorage.getItem("yue2.libFolded.artist") === "0"`);
await ev(`localStorage.removeItem("yue2.libFolded.artist"); true`);
pr8.createAgain = await rowsOf("create");
pr8.logLeftCreate = await ev(`document.getElementById("logDock").classList.contains("is-left")`);
pr8.creatorFolded = await ev(`document.getElementById("library").classList.contains("is-folded")`);
await ev(`document.querySelector('#view-compose [data-frame="compose"]').click(); true`);
await sleep(400);
pr8.lifted = await ev(`(() => { const w = document.getElementById("wave").getBoundingClientRect(), c = document.querySelector("#playbar .pb-ctrl").getBoundingClientRect();
  return { frame: document.body.dataset.frame || "", rows: Math.abs((w.top + w.bottom) / 2 - (c.top + c.bottom) / 2) < 8 ? 1 : 2 }; })()`);
await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
await sleep(350);
pr8.down = await ev(`document.body.dataset.frame || ""`);
await ev(`document.getElementById("lyricsBig").click(); true`);
await sleep(300);
pr8.lyrics = await ev(`(() => { const w = document.getElementById("wave").getBoundingClientRect(), c = document.querySelector("#playbar .pb-ctrl").getBoundingClientRect();
  return { open: !!document.getElementById("lyrOver"), rows: Math.abs((w.top + w.bottom) / 2 - (c.top + c.bottom) / 2) < 8 ? 1 : 2 }; })()`);
await ev(`document.getElementById("lyricsBig").click(); true`);
await sleep(300);
pr8.lyricsShut = await ev(`!document.getElementById("lyrOver")`);
await ev(`document.querySelector('.topbar [data-tab="${pr8Was}"]').click(); true`);
await send("Emulation.setDeviceMetricsOverride", { width: pr8Size[0], height: pr8Size[1], deviceScaleFactor: 1, mobile: false });
await sleep(300);
check("the player in two rows where songs are heard (Creator, Refiner, Librarian), in one where they are not (Writer, Artist); the Creator in one while a frame is lifted or its lyrics are over everything",
  pr8.create === 2 && pr8.post === 2 && pr8.collection === 2 && pr8.write === 1 && pr8.artist === 1 && pr8.createAgain === 2 &&
  pr8.lifted.frame === "compose" && pr8.lifted.rows === 1 && pr8.down === "" && pr8.lyrics.open && pr8.lyrics.rows === 1 && pr8.lyricsShut, JSON.stringify(pr8));
check("  the Artist's Takes folded at first (its own fold, unfolding kept as «0»), the Creator's as it was; the server log on the left in the Artist only",
  pr8.artistFolded && pr8.artistUnfolded && !pr8.creatorFolded && pr8.logLeftArtist && !pr8.logLeftCreate, JSON.stringify(pr8));
const pr8Keep = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), a = document.getElementById("audio");
  const before = localStorage.getItem("ruach.playerAt");
  a.dispatchEvent(new Event("pause")); await wait(50);
  const kept = JSON.parse(localStorage.getItem("ruach.playerAt") || "null");
  return { before: !!before, kept: !!kept, name: kept && kept.name, hasAt: kept && typeof kept.at === "number", playing: kept && kept.playing,
    player: !document.getElementById("playbar").classList.contains("is-empty") };
})()`);
check("  the player's take, place and play state kept in this browser as it pauses (ruach.playerAt, not the settings file), for the reload to bring back",
  !pr8Keep.player || (pr8Keep.kept && !!pr8Keep.name && pr8Keep.hasAt && pr8Keep.playing === false), JSON.stringify(pr8Keep));

// HERESY 1169 · 1260 (Viktor 09.10.2026: «Убери из тултипа в плеере вывод промпта трека. Это лишнее. И так всё под рукой. И пройдись
// по таким местам и убери лишние тултипы»; «при сворачивании колонки воркспейсов добавляется ещё одна колонка треков… Пусть лучше
// растягиваются карточки»; «Ещё слабее сделай цветовой альфа канал градиента, что через все карточки идёт»). The mock draws no
// Librarian cards, so the tiles are six empty cards of a grid of their own beside the real one, gone at the end; the room and the
// window are put back as they were.
section("fewer tips: none of a take's own words; folded workspaces leave the tiles their columns; the day wash at half");
const s60Size = await ev(`[innerWidth, innerHeight]`), s60Tab = await ev(`document.body.dataset.tab`);
await send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
await sleep(300);
const p60 = await ev(`(() => {
  const t = document.getElementById("playbarTitle");
  return { empty: document.getElementById("playbar").classList.contains("is-empty"), titleTip: t.hasAttribute("data-tip") || !!t.title,
    pb: ["pbLike", "pbDislike", "pbFav"].map((id) => { const b = document.getElementById(id); return !b.hasAttribute("data-tip") && !b.title && !!b.getAttribute("aria-label"); }),
    refine: document.querySelectorAll(".take-post[title], .take-post[data-tip]").length, qname: document.querySelectorAll(".q-name[title], .q-name[data-tip]").length,
    stars: [...document.querySelectorAll("#libList .take-fav, #libList .coll-act, #takeFav, [data-take-fav]")].map((b) => ({ title: b.getAttribute("title") || "", tip: b.getAttribute("data-tip") || "", label: b.getAttribute("aria-label") || "" })) };
})()`);
check("the player's title carries no tip: no hint, never the take's style (its card and the song page show it)", !p60.titleTip, JSON.stringify(p60));
check("  like, dislike and the star in the player: names for a reader, no tips", p60.pb.every(Boolean), JSON.stringify(p60.pb));
check("  «Refine» and a queue's name: no tip of their own words", p60.refine === 0 && p60.qname === 0, JSON.stringify({ refine: p60.refine, qname: p60.qname }));
check("  the stars and rating signs of the takes' list: names, no tips", p60.stars.length >= 1 && p60.stars.every((b) => !b.title && !b.tip && !!b.label), JSON.stringify(p60.stars.slice(0, 4)));
await ev(`document.querySelector('.topbar [data-tab="collection"]').click(); true`);
await sleep(700);
const c60 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const lay = document.querySelector(".coll-layout"), fb = document.getElementById("collFold"), real = document.getElementById("collGrid");
  if (!lay || !fb || !real) return { none: true };
  const g = document.createElement("div");
  g.className = "coll-grid tiles"; g.id = "claudeGrid1260";
  g.innerHTML = '<article class="coll-card"><div class="coll-title">a</div></article>'.repeat(6);
  real.after(g);
  const cols = () => getComputedStyle(g).gridTemplateColumns.split(" ").filter(Boolean).length;
  const wid = () => Math.round(g.firstElementChild.getBoundingClientRect().width);
  const was = lay.classList.contains("is-folded");
  if (was) { fb.click(); await wait(350); }
  const open = { cols: cols(), w: wid() };
  fb.click(); await wait(350);
  const folded = { on: lay.classList.contains("is-folded"), cols: cols(), w: wid(), tip: "" };
  fb.click(); await wait(350);
  folded.tip = fb.dataset.tip || "";
  if (was) { fb.click(); await wait(350); }
  const r = document.documentElement, tone = r.getAttribute("data-tone");
  r.setAttribute("data-tone", "light");
  const wash = getComputedStyle(g.firstElementChild).backgroundImage;
  if (tone === null) r.removeAttribute("data-tone"); else r.setAttribute("data-tone", tone);
  g.remove();
  return { open, folded, wash, back: lay.classList.contains("is-folded") === was };
})()`);
check("folded workspaces leave the tiles their columns; the cards grow wider instead",
  !c60.none && c60.folded.on && c60.open.cols >= 2 && c60.folded.cols === c60.open.cols && c60.folded.w > c60.open.w && c60.back, JSON.stringify(c60));
check("  the fold's own tip says so", /grow wider/.test(c60.folded ? c60.folded.tip : ""), c60.folded && c60.folded.tip);
check("the day tone's wash over a card starts at half its strength", /rgba\(242, 237, 239, 0\.5\)/.test(c60.wash || ""), c60.wash);
await ev(`document.querySelector('.topbar [data-tab="${s60Tab}"]')?.click(); true`);
await send("Emulation.setDeviceMetricsOverride", { width: s60Size[0], height: s60Size[1], deviceScaleFactor: 1, mobile: false });
await sleep(400);

// HERESY 1169 · 1262 (Viktor 09.10.2026: «Recite on a score либо не вижу, либо не там смотрю»; «`Save profile...` укороти. `Save`»)
section("a score the page puts into the form shows its rows at once; the profile's button says Save");
const r62Tab = await ev(`document.body.dataset.tab`);
await ev(`document.querySelector('.topbar [data-tab="create"]').click(); true`);
await sleep(300);
const r62 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const abc = document.getElementById("abc"), was = abc.value, drawer = document.getElementById("scoreDrawer"), open = drawer ? drawer.open : null;
  if (drawer) drawer.open = true;
  abc.value = ""; await wait(400);
  const before = { recite: !document.getElementById("reciteRow").classList.contains("is-hidden"), midi: !document.getElementById("formMidi").disabled };
  document.querySelector('[data-abc="melody"]').click(); await wait(500);
  const after = { recite: !document.getElementById("reciteRow").classList.contains("is-hidden"), midi: !document.getElementById("formMidi").disabled,
    shift: !document.getElementById("voiceShiftRow").classList.contains("is-hidden"), filled: abc.value.length > 20 };
  abc.value = was; await wait(400);
  if (drawer && open !== null) drawer.open = open;
  return { before, after, save: document.getElementById("setupSave").textContent.trim() };
})()`);
check("an example put in by the page (no key pressed): Recite and the voice shift show, MIDI lights",
  !r62.before.recite && !r62.before.midi && r62.after.filled && r62.after.recite && r62.after.midi && r62.after.shift, JSON.stringify(r62));
check("  the profile's button says Save", r62.save === "Save", r62.save);
await ev(`document.querySelector('.topbar [data-tab="${r62Tab}"]')?.click(); true`);
await sleep(300);

// HERESY 1169 · 1263 (Viktor 09.10.2026: «листалка картинок у Артиста не работает. < и > не меняют картинку но описаловка меняется»).
// Two stand-in runs through window.fetch; the mock has no pictures, so the full ones never come: what counts is what a step shows at
// once (the new picture's thumb at the full one's size, never the one before) and what it says when the full one cannot come.
section("the Artist's viewer: a step shows the next picture at once, the full one when it comes");
const v63Tab = await ev(`document.body.dataset.tab`);
await send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
const v63 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const pic = (n, shape, w, h) => ({ file: "0" + n + "-" + shape.replace(":", "x") + "-s7.png", thumb: "thumbs/0" + n + "-" + shape.replace(":", "x") + "-s7.jpg", shape, w, h, seed: 7, kept: true });
  const runs = [{ id: "20261009-130000-aaaa", status: "done", prompt: "a", created: Date.now() / 1000, painter: "krea2-q4", shapes: ["1:1", "16:9"],
    pictures: [pic(1, "1:1", 1280, 1280), pic(2, "16:9", 1920, 1080)] }];
  window.__v63 = window.fetch;
  window.fetch = (u, o) => String(u).indexOf("/lab/artist/runs") >= 0 ? Promise.resolve(new Response(JSON.stringify({ runs }), { headers: { "Content-Type": "application/json" } })) : window.__v63(u, o);
  document.querySelector('.topbar [data-tab="artist"]').click(); await wait(300);
  if (window.HeresyArtist && window.HeresyArtist.reload) window.HeresyArtist.reload();
  await wait(500);
  document.querySelector('#arBar [data-look="gallery"]').click(); await wait(300);
  const t = document.querySelector('.ar-gpic[data-g="0"] .ar-thumb'); if (!t) return { none: true };
  t.click(); await wait(60); document.querySelector('#arStage [data-stage="view"]').click(); await wait(60);   // 1271: picked, then over the page
  const v = document.querySelector(".ar-view"), img = v.querySelector(".art-img");
  const one = { src: img.getAttribute("src"), w: img.style.width, h: img.style.height, loading: img.classList.contains("is-loading") };
  v.querySelector(".art-next").click(); await wait(60);
  const two = { src: img.getAttribute("src"), w: img.style.width, h: img.style.height, loading: img.classList.contains("is-loading"), broken: img.classList.contains("is-broken"), title: v.querySelector(".art-title").textContent };
  await wait(1500);
  const after = { broken: img.classList.contains("is-broken"), note: getComputedStyle(v.querySelector(".art-count"), "::after").content };
  v.querySelector(".art-close").click(); await wait(200);
  window.fetch = window.__v63; delete window.__v63;
  document.querySelector('#arBar [data-look="runs"]').click();
  if (window.HeresyArtist && window.HeresyArtist.reload) window.HeresyArtist.reload();
  return { one, two, after, shut: !document.querySelector(".ar-view") };
})()`);
check("a step shows the next picture's thumb at once, never the picture before",
  !v63.none && /thumbs%2F02-16x9-s7\.jpg|thumbs\/02-16x9-s7\.jpg/.test(v63.two.src) && v63.two.src !== v63.one.src && (v63.two.loading || v63.two.broken) && /16:9/.test(v63.two.title), JSON.stringify(v63));
check("  drawn at the size the full one takes (16:9 wider than 1:1, both as tall as the window allows)",
  !v63.none && parseFloat(v63.two.w) > parseFloat(v63.one.w) && Math.abs(parseFloat(v63.two.w) / parseFloat(v63.two.h) - 16 / 9) < 0.02, JSON.stringify([v63.one, v63.two]));
check("  one whose full picture cannot come says so (dimmed, «not loaded» by its count)", !v63.none && v63.after.broken && /not loaded/.test(v63.after.note) && v63.shut, JSON.stringify(v63.after));
await ev(`document.querySelector('.topbar [data-tab="${v63Tab}"]')?.click(); true`);
await sleep(300);

// HERESY 1169 · 1264 (Viktor 09.10.2026: «в GPUs секцию под каждым btop-like монитор утилизации/VRAM usage в реальном времени»; «btop
// ересь можно прикрутить и к фрейму лога сервера… шире на 200-400px, В две колонки… главная карта особо обрамлена. Пометки над блоками
// графов — какая роль карты»). The mock has no cards: /lab/gpus and /lab/gpus/live answer through window.fetch, three cards as Forge's.
section("the cards live: beside the server log and under each card in Engine → GPUs");
await send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
const g64 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), now = () => Date.now() / 1000;
  const name = "NVIDIA GeForce RTX 3090", roles = { studio: 0, train: [1, 2], jobs: [1, 2], training: { "1": "voice-r16" } };
  let t0 = now() - 30;
  const samples = (i, since) => { const out = []; for (let k = 0; k < 30; k++) { const t = t0 + k; if (t > since) out.push([t, i === 0 ? 20 + k * 2.5 : i === 1 ? 95 : 0, i === 0 ? 18768 : i === 1 ? 21000 : 266, 24576, 50 + i, 40 + i]); } return out; };
  window.__g64 = window.fetch;
  window.fetch = (u, o) => {
    u = String(u);
    const json = (d) => Promise.resolve(new Response(JSON.stringify(d), { headers: { "Content-Type": "application/json" } }));
    if (u.startsWith("/lab/gpus/live")) { const since = +(new URL(u, location.href).searchParams.get("since") || 0); return json({ cards: [0, 1, 2].map((i) => ({ index: i, name, samples: samples(i, since) })), error: "", now: now(), keep: 120, roles }); }
    if (u.startsWith("/lab/gpus")) return json({ cards: [0, 1, 2].map((i) => ({ index: i, name, total_mb: 24576, free_mb: 5000 })), roles: { studio: 0, train: [1, 2], jobs: [1, 2] }, saved: true, studio_now: 0, guard: [], training: { "1": "voice-r16" }, studio_training: null });
    return window.__g64(u, o);
  };
  const dock = document.getElementById("logDock"), folded = dock.classList.contains("is-folded"), w0 = Math.round(dock.getBoundingClientRect().width);
  if (folded) document.getElementById("logDockTab").click();
  await wait(2600);
  const ink = (c) => { const g = c.getContext("2d"), d = g.getImageData(0, 0, c.width, c.height).data; let a = 0; for (let k = 3; k < d.length; k += 4) a += d[k]; return a > 0; };
  const cards = [...document.querySelectorAll("#logDockGpus .gl-card")];
  const box = dock.getBoundingClientRect();
  const out = { w0, w: Math.round(box.width), top: Math.round(box.top), h: Math.round(box.height), gpus: !!document.querySelector("#logDockGpus") && getComputedStyle(document.getElementById("logDockGpus")).display !== "none",
    cards: cards.map((c) => ({ gpu: c.dataset.gpu, role: c.querySelector(".gl-role").textContent, main: c.classList.contains("is-main"), drawn: ink(c.querySelector("canvas")), nums: c.querySelector(".gl-nums").textContent })) };
  if (folded) document.getElementById("logDockTab").click();
  document.getElementById("engineToggle").click(); await wait(2600);
  const rows = [...document.querySelectorAll("#gpuRoles .gpu-live[data-gpu]")];
  out.engine = rows.map((b) => ({ gpu: b.dataset.gpu, drawn: !!b.querySelector("canvas") && ink(b.querySelector("canvas")), nums: (b.querySelector(".gl-nums") || {}).textContent || "" }));
  document.getElementById("engineBack").click(); await wait(300);
  window.fetch = window.__g64; delete window.__g64;
  return out;
})()`);
check("the unfolded log grows wider for a column of the cards (600 → 920 px at 1920: 1329, Viktor: «общую ширину фрейма логгера на 200px»)", g64.gpus && g64.w >= 900 && g64.w <= 940 && g64.w - (g64.w0 > 500 ? g64.w0 : 600) >= 300, JSON.stringify({ w0: g64.w0, w: g64.w, gpus: g64.gpus }));
check("  the dock stays inside the window, as tall as its cards (not the whole log)", g64.top >= 0 && g64.h < 1080 * 0.7, JSON.stringify({ top: g64.top, h: g64.h }));
check("  each card's block says its role, the studio's card framed, its bars drawn and its numbers given",
  g64.cards.length === 3 && /Studio/.test(g64.cards[0].role) && g64.cards[0].main && !g64.cards[1].main && /Training voice-r16 · Lab jobs/.test(g64.cards[1].role) &&
  g64.cards.every((c) => c.drawn && /VRAM/.test(c.nums)), JSON.stringify(g64.cards));
check("Engine → GPUs: a live row under each card, drawn", g64.engine.length === 3 && g64.engine.every((r) => r.drawn && /load/.test(r.nums)), JSON.stringify(g64.engine));

// HERESY 1169 · 1266 (Viktor 09.10.2026: «Логотип для топ бара заменяй на версию без Девы, и убирай из него высокий вариант. Больше без
// этих понтов. Стабильный тулбар во всей Студии»; «фавиконку — бекграунд базовый из лого, и монтеррат букву R для английского, Р для
// русского, Π для греческого»): the name alone in the bar, inside it, at one height; the favicon the name's first letter.
section("the name alone in the bar at one height; the favicon its first letter");
await send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
await sleep(400);
const lg66 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), r = (e) => e.getBoundingClientRect();
  const bar = document.querySelector(".topbar"), logo = document.querySelector(".topbar .brand-full"), fav = document.getElementById("favicon");
  const o = { barH: Math.round(r(bar).height), top: Math.round(r(logo).top), bottom: Math.round(r(logo).bottom), h: Math.round(r(logo).height),
    alone: !document.querySelector(".brand svg .rl-fig, .brand svg .rl-cloud, .brand-compact") && !!logo.querySelector(".rl-word path") && !!logo.querySelector(".rl-box") && !!logo.querySelector(".rl-studio path"),
    tall: document.body.classList.contains("bar-tall"),
    fav: !!fav && fav.getAttribute("href") === (window.RUACH_FAVICONS || {}).R && !!(window.RUACH_FAVICONS || {})["Р"] && !!(window.RUACH_FAVICONS || {})["Π"],
    letters: Object.keys(window.RUACH_LOGO_WORDS || {}).map((k) => k + ":" + window.RUACH_LOGO_WORDS[k].letter).join(",") };
  document.querySelector('.topbar [data-tab="create"]').click(); await wait(200);
  const v = document.getElementById("view-compose"); v.scrollTop = 500; await wait(500);
  o.scrolledBarH = Math.round(r(bar).height); o.scrolledH = Math.round(r(logo).height);
  v.scrollTop = 0; await wait(300);
  const about = document.querySelector("#aboutLogo svg");
  o.aboutAlone = !!about && !about.querySelector(".rl-fig, .rl-cloud");
  return o; })()`);
check("the bar's logo is the name alone (no figure, no cloud, no compact cut), inside the 52 px bar", lg66.alone && lg66.barH === 52 && lg66.top >= 0 && lg66.bottom <= 52 && lg66.h === 28 && lg66.aboutAlone, JSON.stringify(lg66));
check("  one height: no tall bar at the page's top, the bar and the logo the same when a room scrolls", !lg66.tall && lg66.scrolledBarH === 52 && lg66.scrolledH === 28, JSON.stringify(lg66));
check("  the favicon is R in English; each language has its letter (Р for the Cyrillic names, Π for the Greek)", lg66.fav &&
  /ru:Р/.test(lg66.letters) && /uk:Р/.test(lg66.letters) && /be:Р/.test(lg66.letters) && /el:Π/.test(lg66.letters) && /es:R/.test(lg66.letters) && /it:R/.test(lg66.letters), JSON.stringify(lg66));

// HERESY 1169 · 1268 (Viktor 09.10.2026: «В комнате Писателя дай возможность регулировать ширину левой колонки со списком документов»;
// his pictures of what was undone: the Librarian's peek over the cards, the Score's full screen on a row of its own, the Writer's chip;
// «LoRA: сила над указателем… уменьшить до 14»; the Recite question leaving 59 lines out)
section("the Writer's column dragged; no peek in the Librarian; the Score's row; the chip; the LoRA tip; Recite in sixteenths");
await send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
const wr68 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), was = localStorage.getItem("yue2.wrSideW");
  document.querySelector('.topbar [data-tab="write"]').click(); await wait(300);
  const rz = document.getElementById("wrResizer"), side = document.querySelector(".wr-side"), w0 = Math.round(side.getBoundingClientRect().width);
  rz.focus(); rz.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })); await wait(50);
  const w1 = Math.round(side.getBoundingClientRect().width), kept = localStorage.getItem("yue2.wrSideW");
  rz.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })); await wait(50);
  const w2 = Math.round(side.getBoundingClientRect().width), gone = localStorage.getItem("yue2.wrSideW");
  if (was) localStorage.setItem("yue2.wrSideW", was);
  document.querySelector('.topbar [data-tab="create"]').click(); await wait(200);
  return { w0, w1, kept, w2, gone, role: rz.getAttribute("role"), cursor: getComputedStyle(rz).cursor }; })()`);
check("the Writer's documents column: its edge widens it (→ 16 px, kept), a double click gives it its 280 px back", wr68.w1 === wr68.w0 + 16 && wr68.kept === String(wr68.w1) &&
  wr68.w2 === 280 && wr68.gone === null && wr68.role === "separator" && wr68.cursor === "col-resize", JSON.stringify(wr68));
const pk68 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  document.querySelector('.topbar [data-tab="collection"]').click(); await wait(500);
  const card = document.querySelector("#collGrid .coll-card[data-name]");
  if (card) card.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
  await wait(700);
  const o = { card: !!card, peek: !document.getElementById("collPeek").hidden };
  document.querySelector('.topbar [data-tab="create"]').click(); await wait(200);
  return o; })()`);
check("  the Librarian: a card rested on shows no peek (its style and lyrics are a click away)", !pk68.peek, JSON.stringify(pk68));
const st68 = await ev(`(() => { const h = document.querySelector(".score-head"), sp = h && h.querySelector(":scope > .spacer");
  const hand = document.getElementById("wrHandBox"), was = hand.className, name = document.getElementById("wrHandName"), nameWas = name.textContent;
  hand.classList.add("is-on"); name.textContent = "A song in hand with a long enough title to show the chip";
  const doc = hand.querySelector(".wr-hand-doc").getBoundingClientRect(), acts = hand.querySelector(".wr-hand-acts").getBoundingClientRect(), cs = getComputedStyle(hand.querySelector(".wr-hand-doc"));
  const o = { gap: h && getComputedStyle(h).columnGap, grow: sp && getComputedStyle(sp).flexGrow, below: doc.top >= acts.bottom - 1, round: parseFloat(cs.borderTopLeftRadius) > 0, border: cs.borderTopStyle };
  hand.className = was; name.textContent = nameWas;
  const tip = document.createElement("div"); tip.className = "lora-vtip"; document.body.appendChild(tip); o.tipPx = getComputedStyle(tip).fontSize; tip.remove();
  return o; })()`);
check("  the Score's tools follow its tabs (gaps of 6 px, no stretching gap): the full screen keeps its row", st68.gap === "6px" && st68.grow === "0", JSON.stringify(st68));
check("  the Writer's document in hand on a line of its own under the Writer's row, a chip", st68.below && st68.round && st68.border === "solid", JSON.stringify(st68));
check("  the LoRA strength over the pointer at 14 pt", st68.tipPx === "18.6667px", JSON.stringify(st68));
const RS68 = 'X:1\nT:\nM:4/4\nL:1/16\nQ:1/4=100\nV: Vocal clef=treble name="Vocal Melody" snm="Vocal"\nV: Ins clef=treble name="Ins Melody" snm="Inst."\nK:Am\n% verse\nV: Vocal\n"Am"z16|"F"z16|"C"z16|"G"z16|\nV: Ins\nA4c4e4c4|F4A4c4A4|C4E4G4E4|G4B4d4B4|\n';
const RL68 = "[Verse]\nРаз два три четыре пять шесть семь восемь\nДевять десять одиннадцать двенадцать\nТринадцать четырнадцать пятнадцать";
const rc68 = await ev(`(() => { const r8 = HeresyRecite.lay(${JSON.stringify(RS68)}, ${JSON.stringify(RL68)}, { step: 8 }), r = HeresyRecite.lay(${JSON.stringify(RS68)}, ${JSON.stringify(RL68)}, {});
  let parsed = "ok"; try { HeresyAbc.parse(r.abc); } catch (e) { parsed = e.message; }
  return { d8: r8.dropped.length, d: r.dropped.length, step: r.step, parsed }; })()`);
check("  Recite: where eighths leave lines out, the lines are laid a syllable a sixteenth (fewer left out, the score still the studio's)", rc68.d8 > 0 && rc68.d < rc68.d8 && rc68.step === 16 && rc68.parsed === "ok", JSON.stringify(rc68));

// HERESY 1169 · 1269 (Viktor 09.10.2026: «Пометка строк через Alt+K в редакторе не персистентна»; «Шорткат на попап/fullscreen редактора
// Лирики — Alt+E»; «Блокируем браузерные Ctrl+S и Ctrl+Shift+S. Оба шортката сохраняют все изменения в текущей сессии. Если нет правок в
// комнатах — при F5 не выводим диалоговое окно»; «Если лирика поверх всего, и применил Shift+Tab — схлопывание этого попапа и переносимся
// в сам фрейм попап»)
section("the lyrics' marks with their text; Alt+E; Shift+Tab from the lifted lyrics; Ctrl+S keeps everything");
const key69 = async (code, key, vk, modifiers) => {
  await send("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode: vk, modifiers });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: vk, modifiers });
  await sleep(200);
};
await ev(`(() => { document.querySelector('#tabs [data-tab="create"]').click(); const f = document.querySelector('[data-fold="lyrics"]'); if (f.classList.contains("is-folded")) f.querySelector(".label").click();
  const a = document.getElementById("lyrics"); window.__lyr69 = a.value; a.value = "[Verse]\\nодин\\nдва\\nтри"; a.scrollIntoView({ block: "center" });
  a.focus(); const at = a.value.indexOf("два"); a.setSelectionRange(at, at); return true; })()`);
await sleep(250);
await key69("KeyK", "k", 75, 1);
const mk69 = await ev(`(async () => { const wait = (ms) => new Promise((r) => setTimeout(r, ms)), a = document.getElementById("lyrics"), w = a.parentNode;
  const marked = () => [...w.querySelectorAll(".lyr-num.is-mark")].map((n) => n.textContent).join();
  const one = marked(); a.value = "другой текст"; await wait(120); const other = marked();
  a.value = "[Verse]\\nодин\\nдва\\nтри"; await wait(120); const back = marked();
  return { one, other, back }; })()`);
check("the lyrics' marks come back with their text when the page puts it into the box (a reload, a take loaded); another text has none", mk69.one === "3" && mk69.other === "" && mk69.back === "3", JSON.stringify(mk69));
await key69("KeyE", "e", 69, 1);
const ae1 = await ev(`window.ruachLyricsOver()`);
await key69("KeyE", "e", 69, 1);
const ae2 = await ev(`window.ruachLyricsOver()`);
await key69("KeyE", "e", 69, 1);
await key69("Tab", "Tab", 9, 8);
const st69 = await ev(`({ over: window.ruachLyricsOver(), frame: document.body.dataset.frame || null, focus: (document.activeElement || {}).id || "" })`);
await key69("Escape", "Escape", 27, 0);
await sleep(300);
check("Alt+E lifts the lyrics over everything and puts them back; Shift+Tab over them puts them back into the form, lifts its frame, the cursor in the lyrics", ae1 === true && ae2 === false &&
  st69.over === false && st69.frame === "compose" && st69.focus === "lyrics", JSON.stringify({ ae1, ae2, st69 }));
await ev(`window.ruachEdited(true); true`);
await key69("KeyS", "s", 83, 2);
await sleep(400);
const cs69 = await ev(`({ edited: window.ruachEdited(), said: [...document.querySelectorAll("#toasts .toast")].some((t) => /^Saved: the song in the form/.test(t.textContent)) })`);
await ev(`(() => { const a = document.getElementById("lyrics"); a.value = window.__lyr69; a.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
check("Ctrl+S keeps everything (the form, the Writer's open document, the settings) instead of the browser's Save page; after it the page counts nothing as edited", cs69.said && cs69.edited === false, JSON.stringify(cs69));

// HERESY 1169 · 1270 (Viktor 09.10.2026: «Запустил два раза генерацию картинки в комнате Художника… Кнопку DRAW нужно заменять на STOP»)
section("the Artist’s Draw and Stop while a run draws (1270, 1340)");
const ar70Was = await ev(`document.body.dataset.tab`);
await ev(`(() => { const real = window.fetch; window.__ar70Fetch = real; window.__ar70Asked = [];
  const run = { id: "20261009-170000-eeee", prompt: "A boat.", shapes: ["1:1"], seed: 5, count: 1, painter: "krea2-q4", created: 1791580000, status: "running", of: 1, pictures: [], gpu: 1 };
  window.__ar70Runs = [run];
  const json = (b, s) => Promise.resolve(new Response(JSON.stringify(b), { status: s || 200, headers: { "Content-Type": "application/json" } }));
  window.fetch = (u, o) => {
    u = String(u);
    if (u.startsWith("/lab/artist/runs")) return json({ runs: window.__ar70Runs });
    if (u.startsWith("/lab/artist/stop")) { const b = JSON.parse(o.body); window.__ar70Asked.push(b); window.__ar70Runs.forEach((r) => { if (r.id === b.id) r.status = "stopped"; }); return json({ id: b.id, stopping: true }); }
    if (u.startsWith("/lab/artist/draw")) { window.__ar70Asked.push({ draw: 1 }); return json({}, 500); }
    return real(u, o);
  };
  return true; })()`);
await ev(`document.getElementById("tabArtist").click(); true`);
await waitFor(`document.querySelectorAll('#arRuns .ar-run[data-id="20261009-170000-eeee"]').length === 1`, 4000, 50);
const ar70 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), b = document.getElementById("arDraw"), s = document.getElementById("arStop");
  document.getElementById("arPrompt").value = "Another boat."; document.getElementById("arPrompt").dispatchEvent(new Event("input", { bubbles: true }));
  await wait(100);
  const o = { text: b.textContent, drawOn: !b.disabled, stopShown: !s.hidden, stopOn: !s.disabled, stopText: s.textContent };
  document.getElementById("arPrompt").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true, cancelable: true }));
  await wait(300);
  s.click();
  for (let i = 0; i < 50 && !s.hidden; i++) await wait(100);
  const st = document.querySelector('.ar-run[data-id="20261009-170000-eeee"] .ar-state');
  o.asked = window.__ar70Asked; o.after = b.textContent; o.stopHidden = s.hidden && getComputedStyle(s).display === "none"; o.state = st ? st.textContent : "";   // 1345: as it shows
  window.fetch = window.__ar70Fetch;
  return o; })()`);
await ev(`document.querySelector('.topbar [data-tab="' + ${JSON.stringify(ar70Was || "create")} + '"]').click(); true`);
await sleep(300);
check("the Artist's Draw stays Draw while a run draws and asks a second one (Ctrl+Enter too: two at a time); Stop, a button of its own, asks the lab to stop the drawing run, the run says stopped, and Stop hides",
  ar70.text === "Draw" && ar70.drawOn && ar70.stopShown && ar70.stopOn && ar70.stopText === "Stop" && ar70.asked.some((a) => a.draw) && ar70.asked.some((a) => a.id === "20261009-170000-eeee") && ar70.stopHidden && /^stopped/.test(ar70.state),
  JSON.stringify(ar70));

// HERESY 1169 · 1271 (Viktor 09.10.2026: «Канвас комнаты Художника можно разделить на три колонки, каждая регулируется по ширине. В левой
// промптинг с параметрами. В средней проявка изображения и активное выбранное как в InvokeAI, и ниже данные по прогону самого изображения,
// правая колонка — библиотека генераций»)
section("the Artist in three columns: the prompt, the stage, the library");
await send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
const ar71Was = await ev(`document.body.dataset.tab`);
await ev(`(() => { const real = window.fetch; window.__ar71Fetch = real;
  const pic = (n, shape, w, h, seed) => { const f = String(n).padStart(2, "0") + "-" + shape.replace(":", "x") + "-s" + seed; return { n, shape, seed, w, h, kept: true, file: f + ".png", thumb: "thumbs/" + f + ".jpg" }; };
  window.__ar71Done = { id: "20261009-180000-ffff", prompt: "A harbour at night, lanterns on the water.", shapes: ["1:1", "16:9"], seed: 40, count: 1, painter: "krea2-q4", created: 1791590000,
    status: "done", of: 2, took: 80, gpu: 2, pictures: [pic(1, "1:1", 1280, 1280, 40), pic(2, "16:9", 1920, 1080, 40)] };
  window.__ar71Runs = [{ id: "20261009-181000-gggg", prompt: "A storm.", shapes: ["16:9"], seed: 9, count: 1, painter: "krea2-q4", created: 1791590600, status: "running", of: 1, gpu: 1, pictures: [],
    live: { live: 1, step: 3, of: 12, file: "preview/03.jpg" } }, window.__ar71Done];
  const json = (b, s) => Promise.resolve(new Response(JSON.stringify(b), { status: s || 200, headers: { "Content-Type": "application/json" } }));
  window.fetch = (u, o) => { u = String(u); if (u.startsWith("/lab/artist/runs")) return json({ runs: window.__ar71Runs }); if (u.startsWith("/lab/artist/stop")) return json({}); return real(u, o); };
  localStorage.removeItem("yue2.arLook"); localStorage.removeItem("yue2.arL"); localStorage.removeItem("yue2.arR");
  return true; })()`);
await ev(`document.getElementById("tabArtist").click(); if (window.HeresyArtist && window.HeresyArtist.reload) window.HeresyArtist.reload(); true`);
await waitFor(`document.querySelectorAll('#arRuns .ar-run[data-id="20261009-180000-ffff"]').length === 1`, 4000, 50);
await sleep(300);
const ar71 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), $ = (id) => document.getElementById(id), box = (el) => { const r = el.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right), Math.round(r.top)]; };
  const L = document.querySelector(".ar-left"), S = $("arStage"), R = document.querySelector(".ar-right");
  const o = { l: box(L), s: box(S), r: box(R), prompt: !!L.querySelector("#arPrompt"), draw: !!L.querySelector("#arDraw"), lib: !!R.querySelector("#arRuns") && !!R.querySelector("#arBar") };
  const lp = S.querySelector(".ar-stage-pic.is-live");
  o.live = { shown: !!lp, src: lp && lp.querySelector("img") ? lp.querySelector("img").getAttribute("src") : "", step: (S.querySelector(".ar-stepno") || {}).textContent || "",
    meta: (S.querySelector(".ar-stage-meta") || {}).textContent || "" };
  window.__ar71Runs = [window.__ar71Done];                 // the painting run gone: the newest picture on the stage
  if (window.HeresyArtist && window.HeresyArtist.reload) window.HeresyArtist.reload();
  await wait(500);
  o.newest = S.querySelector(".ar-stage-pic") ? S.querySelector(".ar-stage-pic").dataset.w : "";
  document.querySelector('.ar-run[data-id="20261009-180000-ffff"] .ar-pic[data-i="0"] .ar-thumb').click(); await wait(150);
  const sp = S.querySelector(".ar-stage-pic"), img = sp && sp.querySelector("img");
  o.picked = { w: sp && sp.dataset.w, src: img && img.getAttribute("src"), meta: (S.querySelector(".ar-stage-meta") || {}).textContent || "", prompt: (S.querySelector(".ar-stage-prompt") || {}).textContent || "",
    sel: document.querySelectorAll("#arRuns .ar-thumb.is-sel").length, size: sp ? [parseInt(sp.style.width, 10), parseInt(sp.style.height, 10)] : null, view: !!document.querySelector(".ar-view") };
  if (sp) sp.click(); await wait(200);
  const v = document.querySelector(".ar-view");
  o.over = v ? v.querySelector(".art-title").textContent : "";
  if (v) v.querySelector(".art-close").click(); await wait(200);
  const e = $("arEdgeL"), w0 = Math.round(L.getBoundingClientRect().width);
  e.focus(); e.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })); await wait(50);
  o.edge = { w0, w1: Math.round(L.getBoundingClientRect().width), kept: localStorage.getItem("yue2.arL") };
  e.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })); await wait(50);
  o.edge.back = Math.round(L.getBoundingClientRect().width); o.edge.gone = localStorage.getItem("yue2.arL");
  window.fetch = window.__ar71Fetch;
  return o; })()`);
await ev(`document.querySelector('.topbar [data-tab="' + ${JSON.stringify(ar71Was || "create")} + '"]').click(); true`);
await sleep(300);
check("the Artist in three columns at 1920: the prompt with its knobs and Draw on the left, the stage in the middle, the library (its bar and runs) on the right",
  ar71.l[1] <= ar71.s[0] && ar71.s[1] <= ar71.r[0] && ar71.prompt && ar71.draw && ar71.lib, JSON.stringify({ l: ar71.l, s: ar71.s, r: ar71.r }));
check("  a run painting develops on the stage, its step counted, its run's data under it", ar71.live.shown && /preview%2F03\.jpg|preview\/03\.jpg/.test(ar71.live.src) && ar71.live.step === "3 / 12" &&
  /drawing 1 of 1/.test(ar71.live.meta), JSON.stringify(ar71.live));
check("  with none painting, the newest picture; a click in the library picks one for the stage (no window over the page), its shape kept, its run's data under it, the thumb marked; the stage's picture opens it over the page",
  ar71.newest === "1920" && ar71.picked.w === "1280" && /01-1x1-s40/.test(ar71.picked.src) && /seed 40/.test(ar71.picked.meta) && /1:1 · 1280×1280/.test(ar71.picked.meta) && /harbour/.test(ar71.picked.prompt) &&
  ar71.picked.sel === 1 && !ar71.picked.view && !!ar71.picked.size && Math.abs(ar71.picked.size[0] - ar71.picked.size[1]) <= 1 && /1:1/.test(ar71.over), JSON.stringify(ar71.picked) + " " + ar71.newest + " " + ar71.over);
check("  the prompt's edge widens its column (→ 16 px, kept), a double click gives it its own width back (HERESY 1366: 25 % of the window, 480 px at 1920)", ar71.edge.w1 === ar71.edge.w0 + 16 && ar71.edge.kept === String(ar71.edge.w1) &&
  ar71.edge.back === 480 && ar71.edge.gone === null, JSON.stringify(ar71.edge));

// HERESY 1169 · 1275 (Viktor 28.09.2026: «звуковое оповещение при окончании генерации»)
section("a sound when a run ends");
const ch75 = await ev(`(() => { const b = document.getElementById("runChime"), a = document.getElementById("audio"), was = { muted: a.muted, vol: a.volume };
  const o = { on: b.getAttribute("aria-pressed"), icon: !!b.querySelector("svg"), inBar: !!b.closest("#playbar"), after: b.previousElementSibling ? b.previousElementSibling.id : "", tip: b.dataset.tip || "" };
  const rung = window.RuachChime.rung.slice(); window.RuachChime.rung.length = 0;
  a.muted = false; a.volume = 0.5; o.rings = window.RuachChime.ring(true); o.ringsLow = window.RuachChime.ring(false);
  a.muted = true; o.muted = window.RuachChime.ring(true);
  a.muted = false; a.volume = 0; o.silent = window.RuachChime.ring(true);
  a.muted = was.muted; a.volume = was.vol;
  b.click(); o.offKept = localStorage.getItem("yue2.runChime"); o.offPressed = b.getAttribute("aria-pressed"); o.off = window.RuachChime.ring(true);
  b.click(); o.backKept = localStorage.getItem("yue2.runChime"); o.backPressed = b.getAttribute("aria-pressed");
  o.rung = window.RuachChime.rung.join(); window.RuachChime.rung.length = 0; rung.forEach((x) => window.RuachChime.rung.push(x));
  return o; })()`);
check("🔔 in the player after Play on, on by default, its bell drawn: a sound when a run ends (two notes up, two down when it failed)",
  ch75.on === "true" && ch75.icon && ch75.inBar && ch75.after === "autoplay" && /two notes up when it is done .*two down when one fails/.test(ch75.tip) && ch75.rings === true && ch75.ringsLow === true,
  JSON.stringify(ch75));
check("  none when the player is muted or at nothing; a click makes none (kept), a second brings it back", ch75.muted === false && ch75.silent === false &&
  ch75.offKept === "off" && ch75.offPressed === "false" && ch75.off === false && ch75.backKept === null && ch75.backPressed === "true" && ch75.rung === "done,failed",
  JSON.stringify(ch75));

// HERESY 1169 · 1276 (Viktor 09.10.2026: «В редактор можно добавить F4/Ctrl+H, с учётом регистра и без»)
section("find and replace in the lyrics: F4 and Ctrl+H, the case as typed or any");
const fr76Was = await ev(`(() => { document.querySelector('#tabs [data-tab="create"]').click(); const f = document.querySelector('[data-fold="lyrics"]'); if (f.classList.contains("is-folded")) f.querySelector(".label").click();
  const a = document.getElementById("lyrics"), was = a.value; a.value = "[Verse]\\nСвет и свет. СВЕТ!\\nОн обе́щано пришёл"; a.dispatchEvent(new Event("input", { bubbles: true }));
  a.focus(); a.setSelectionRange(0, 0); const q0 = document.getElementById("findQ"); if (q0) q0.value = ""; try { localStorage.removeItem("yue2.findCase"); } catch (e) {} return was; })()`);
await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "F4", code: "F4", windowsVirtualKeyCode: 115 });
await send("Input.dispatchKeyEvent", { type: "keyUp", key: "F4", code: "F4", windowsVirtualKeyCode: 115 });
await waitFor(`window.HeresyFind.state().open && window.HeresyFind.state().replace`, 3000, 50);
const fr76 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), a = document.getElementById("lyrics"), q = document.getElementById("findQ"), r = document.getElementById("findR");
  const typeQ = (v) => { q.value = v; q.dispatchEvent(new Event("input", { bubbles: true })); };
  const o = { f4: window.HeresyFind.state(), focusQ: document.activeElement === q };
  typeQ("свет"); await wait(50); o.any = window.HeresyFind.state().hits;
  document.querySelector('.find-bar [data-find="case"]').click(); await wait(50);
  o.cased = { hits: window.HeresyFind.state().hits, on: window.HeresyFind.state().cased, kept: localStorage.getItem("yue2.findCase") };
  r.value = "огонь"; r.focus();
  r.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })); await wait(50);
  o.one = a.value.split("\\n")[1];
  q.focus(); q.dispatchEvent(new KeyboardEvent("keydown", { key: "c", code: "KeyC", altKey: true, bubbles: true, cancelable: true })); await wait(50);
  o.caseOff = { on: window.HeresyFind.state().cased, kept: localStorage.getItem("yue2.findCase"), hits: window.HeresyFind.state().hits };
  r.focus(); r.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true, cancelable: true })); await wait(50);
  o.all = a.value.split("\\n")[1]; o.said = window.HeresyFind.state().said;
  a.focus(); document.execCommand("undo"); await wait(50); o.undo = a.value.split("\\n")[1];
  typeQ("обещано"); r.value = "сказано"; r.focus(); r.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })); await wait(50);
  o.mark = a.value.split("\\n")[2];
  window.HeresyFind.close(); await wait(50);
  a.focus(); a.setSelectionRange(0, 0);
  return o; })()`);
await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "h", code: "KeyH", windowsVirtualKeyCode: 72, modifiers: 2 });
await send("Input.dispatchKeyEvent", { type: "keyUp", key: "h", code: "KeyH", windowsVirtualKeyCode: 72, modifiers: 2 });
const frH = await waitFor(`window.HeresyFind.state().open && window.HeresyFind.state().replace ? window.HeresyFind.state() : null`, 3000, 50);
await ev(`(() => { window.HeresyFind.close(); const a = document.getElementById("lyrics"); a.value = ${JSON.stringify(fr76Was)}; a.dispatchEvent(new Event("input", { bubbles: true })); a.blur();
  try { localStorage.removeItem("yue2.findCase"); } catch (e) {} return true; })()`);
check("F4 in the lyrics opens find with a second row to replace; any case finds Свет, свет and СВЕТ, Aa only свет (kept)",
  fr76.f4.open && fr76.f4.replace && fr76.f4.box === "lyrics" && fr76.focusQ && fr76.any === 3 && fr76.cased.hits === 1 && fr76.cased.on && fr76.cased.kept === "1", JSON.stringify(fr76));
check("  Enter replaces the match in hand, Alt+C turns the case off again, Ctrl+Enter replaces them all (counted), one Ctrl+Z takes All back; a stress mark is part of the match; Ctrl+H opens it too",
  fr76.one === "Свет и огонь. СВЕТ!" && !fr76.caseOff.on && fr76.caseOff.kept === null && fr76.caseOff.hits === 2 && fr76.all === "огонь и огонь. огонь!" && fr76.said === "2 replaced" &&
  fr76.undo === "Свет и огонь. СВЕТ!" && fr76.mark === "Он сказано пришёл" && !!frH && frH.box === "lyrics", JSON.stringify({ fr76, frH }));

// HERESY 1169 · 1277 (Viktor 09.10.2026: «Кнопку экспорта/импорта содержимого редактора в голый txt формат, авто имя файла по Title трека»)
section("the lyrics as plain text: saved as Title.txt, a .txt put in their place");
const tx77Was = await ev(`(() => { document.querySelector('#tabs [data-tab="create"]').click(); const f = document.querySelector('[data-fold="lyrics"]'); if (f.classList.contains("is-folded")) f.querySelector(".label").click();
  const a = document.getElementById("lyrics"), t = document.getElementById("title"), was = { lyrics: a.value, title: t.value };
  a.value = "[Verse]\\nстрока одна\\nи вторая"; a.dispatchEvent(new Event("input", { bubbles: true })); t.value = "Ночь / Тест: 1?"; t.dispatchEvent(new Event("input", { bubbles: true }));
  return was; })()`);
const tx77 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), real = HTMLAnchorElement.prototype.click; let got = null;
  HTMLAnchorElement.prototype.click = function () { if (this.download) { got = { name: this.download, href: this.href }; return; } return real.call(this); };
  const fold = document.querySelector('[data-fold="lyrics"]').classList.contains("is-folded");
  document.getElementById("lyricsTxtOut").click();
  HTMLAnchorElement.prototype.click = real;
  const o = { name: got && got.name, body: got ? await (await fetch(got.href)).text() : null, foldKept: document.querySelector('[data-fold="lyrics"]').classList.contains("is-folded") === fold,
    icons: [...document.querySelectorAll(".lyr-txt")].map((b) => !!b.querySelector("svg")).join() };
  return o; })()`);
await ev(`(() => { const dt = new DataTransfer(); dt.items.add(new File(["\\uFEFF[Chorus]\\r\\nиз файла\\r\\n\\r\\n"], "Из файла.txt", { type: "text/plain" }));
  const i = document.getElementById("lyricsTxtFile"); i.files = dt.files; i.dispatchEvent(new Event("change")); return true; })()`);
const tx77Ask = await waitFor(`(() => { const b = document.querySelector(".hd-back.is-on:not(.is-leaving)"); return b && b.querySelector(".hd-yes") ? b.querySelector(".hd-title").textContent + " | " + b.querySelector(".hd-yes").textContent : null; })()`, 3000, 50);
await answerDialog(true);
await sleep(200);
const tx77In = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), a = document.getElementById("lyrics"), t = document.getElementById("title");
  const o = { lyrics: a.value, title: t.value };
  a.focus(); document.execCommand("undo"); await wait(50); o.undo = a.value;
  const dt = new DataTransfer(); dt.items.add(new File([new Uint8Array([0xCF, 0xF0, 0xE8, 0xE2, 0xE5, 0xF2])], "cp1251.txt", { type: "text/plain" }));
  const i = document.getElementById("lyricsTxtFile"); i.files = dt.files; i.dispatchEvent(new Event("change")); await wait(300);
  o.refused = a.value === o.undo; o.toast = [...document.querySelectorAll(".toast")].map((x) => x.textContent).filter((x) => /UTF-8/.test(x)).length > 0;
  a.value = ""; a.dispatchEvent(new Event("input", { bubbles: true })); t.value = ""; t.dispatchEvent(new Event("input", { bubbles: true }));
  const dt2 = new DataTransfer(); dt2.items.add(new File(["[Intro]\\nтихо"], "Песня из файла.txt", { type: "text/plain" }));
  i.files = dt2.files; i.dispatchEvent(new Event("change")); await wait(300);
  o.empty = { lyrics: a.value, title: t.value, asked: !!document.querySelector(".hd-back.is-on:not(.is-leaving)") };
  return o; })()`);
await ev(`(() => { const a = document.getElementById("lyrics"), t = document.getElementById("title"); a.value = ${JSON.stringify(tx77Was.lyrics)}; a.dispatchEvent(new Event("input", { bubbles: true })); a.blur();
  t.value = ${JSON.stringify(tx77Was.title)}; t.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
check("the lyrics saved as plain text: named by the Title (the signs a file name cannot hold dropped), UTF-8 lines as they are, a newline at the end; the head does not fold",
  tx77.name === "Ночь Тест 1.txt" && tx77.body === "[Verse]\nстрока одна\nи вторая\n" && tx77.foldKept && tx77.icons === "true,true", JSON.stringify(tx77));
check("  a .txt put in their place: asked first, its byte-order mark, Windows line ends and trailing blank lines dropped, the Title kept; one Ctrl+Z brings the old words back; a file not UTF-8 refused out loud; an empty Title takes the file's name, an empty box is not asked",
  /^Put Из файла\.txt in place of the lyrics\?/.test(tx77Ask || "") && /Replace$/.test(tx77Ask || "") && tx77In.lyrics === "[Chorus]\nиз файла" && tx77In.title === "Ночь / Тест: 1?" &&
  tx77In.undo === "[Verse]\nстрока одна\nи вторая" && tx77In.refused && tx77In.toast && tx77In.empty.lyrics === "[Intro]\nтихо" && tx77In.empty.title === "Песня из файла" && !tx77In.empty.asked,
  JSON.stringify({ tx77Ask, tx77In }));

// HERESY 1169 · 1278 (Viktor 09.10.2026: «`[` вторым/третьим в одной строке после валидного тега. Авто пробел между тегами в одной строке. Но такое только с подсказкой несекционных тегов»)
section("a second and a third tag on a line: the tags that are no section, a space put between them");
const ch78Was = await ev(`document.getElementById("lyrics").value`);
await tcSet("[Verse 1]\nстрока\n[Interlude]");
await sleep(150);
await tcKey("[", "BracketLeft", 219, { text: "[" });
const ch78a = { ...(await tcState()), tail: (await tcTail(13)).tail };
await send("Input.insertText", { text: "br" });
await sleep(60);
const ch78b = await tcState();
await tcKey("Enter", "Enter", 13, { text: "\r" });
const ch78c = { ...(await tcTail(19)), open: (await tcState()).open };
await tcKey("[", "BracketLeft", 219, { text: "[" });
const ch78d = { ...(await tcState()), tail: (await tcTail(21)).tail };
await send("Input.insertText", { text: "si" });
await sleep(60);
await tcKey("Enter", "Enter", 13, { text: "\r" });
const ch78e = (await tcTail(29)).tail;
await tcKey("[", "BracketLeft", 219, { text: "[" });
const ch78f = { open: (await tcState()).open, tail: (await tcTail(10)).tail };
await tcSet("[Chorus]");
await tcKey(" ", "Space", 32, { modifiers: 2 });
const ch78g = { ...(await tcState()), tail: (await tcTail(10)).tail };
await send("Input.insertText", { text: "sp" });
await sleep(60);
await tcKey("Enter", "Enter", 13, { text: "\r" });
const ch78h = await ev(`(() => { const a = document.getElementById("lyrics"); return { value: a.value, sel: a.value.slice(a.selectionStart, a.selectionEnd) }; })()`);
await tcSet("");
await tcKey("[", "BracketLeft", 219, { text: "[" });
const ch78i = await tcState();
await tcKey("Escape", "Escape", 27);
await ev(`(() => { const a = document.getElementById("lyrics"); a.value = ${JSON.stringify(ch78Was)}; a.dispatchEvent(new Event("input", { bubbles: true })); a.blur(); return true; })()`);
check("a «[» right after a line's tag gets its space and opens the tags that are no section: who sings (the examples'), Female Vocals, Break and Silence (TEST); no section among them",
  ch78a.open && ch78a.chain && ch78a.tail === "[Interlude] [" && ch78a.tags[0] === "[Male Vocals]" && ch78a.tags.includes("[Female Vocals]") && ch78a.tags.includes("[Break]") &&
  ch78a.tags.includes("[Silence]") && !ch78a.tags.some((t) => /^\[(Verse|Chorus|Bridge|Intro|Outro)/.test(t)) && ch78b.active === "[Break]", JSON.stringify({ ch78a, ch78b }));
check("  Enter puts it on the same line (no new line); a third is offered the same way; a fourth is not",
  ch78c.tail === "[Interlude] [Break]" && ch78c.caret && !ch78c.open && ch78d.open && ch78d.chain && ch78d.tail === "[Interlude] [Break] [" &&
  ch78e === "[Interlude] [Break] [Silence]" && !ch78f.open && ch78f.tail === "[Silence][", JSON.stringify({ ch78c, ch78d, ch78e, ch78f }));
check("  Ctrl+Space after a tag types « [» and opens them (no Latin layout needed); [Spoken: …] leaves its «…» selected; at a line's start the sections as before",
  ch78g.open && ch78g.chain && ch78g.tail === "[Chorus] [" && ch78h.value === "[Chorus] [Spoken: …]" && ch78h.sel === "…" && ch78i.open && !ch78i.chain && ch78i.tags[0] === "[Intro]",
  JSON.stringify({ ch78g, ch78h, ch78i }));

// HERESY 1169 · 1279 (Viktor 09.10.2026: «По всей студии добавь спейсинг между параграфами в тултипах, гайдах и читшитах. Так красивее типографически, но не сломай редактор лирики»)
section("paragraphs with air between them: a tip's lines, the guide's items, the cheat-sheet's prose");
const pa79 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), o = {};
  await wait(900);                                    // a press of the mouse just before gives the focus no tip
  const b = document.createElement("button"); b.type = "button"; b.textContent = "probe"; b.style.cssText = "position:fixed;left:300px;top:300px";
  b.dataset.tip = "Line one\\nLine two\\n\\nAfter a blank"; document.body.appendChild(b); b.focus(); await wait(150);
  const t = document.querySelector(".tip.is-on"), ps = t ? [...t.querySelectorAll(".tip-p")] : [];
  o.tip = { n: ps.length, gap: ps.map((p) => p.classList.contains("tip-gap")).join(), text: t ? t.textContent : "", ws: t ? getComputedStyle(t).whiteSpace : "",
    m: ps.map((p) => parseFloat(getComputedStyle(p).marginTop)).join(), color: ps[0] ? getComputedStyle(ps[0]).color === getComputedStyle(t).color : false };
  b.blur(); b.remove(); await wait(100);
  const one = document.createElement("button"); one.type = "button"; one.textContent = "probe"; one.dataset.tip = "Just one line"; one.style.cssText = "position:fixed;left:300px;top:300px";
  document.body.appendChild(one); one.focus(); await wait(150);
  const t1 = document.querySelector(".tip.is-on"); o.single = t1 ? { paras: t1.classList.contains("tip-paras"), ps: t1.querySelectorAll(".tip-p").length, text: t1.textContent } : null;
  one.blur(); one.remove(); await wait(100);
  return o; })()`);
// the guide's rule measured on an item of its own (the mock serves no guide to open)
const pa79g = await ev(`(() => { const d = document.createElement("div"); d.className = "hg-body"; d.style.cssText = "position:fixed;left:-2000px;top:0;width:600px";
  d.innerHTML = "<ul><li>one</li><li>two</li></ul>"; document.body.appendChild(d); const m = parseFloat(getComputedStyle(d.querySelector("li")).marginBottom); d.remove(); return m; })()`);
await ev(`window.HeresyInstruments.open(); true`);
await waitFor(`document.querySelectorAll(".hi-more p").length > 0`, 4000, 50);
const pa79s = await ev(`(() => { const ps = [...document.querySelectorAll(".hi-more p")]; return { n: ps.length, m: ps[1] ? parseFloat(getComputedStyle(ps[1]).marginTop) : 0, last: ps.length ? ps[ps.length - 1].textContent : "" }; })()`);
await ev(`(() => { const c = document.getElementById("hiClose"); if (c) c.click(); return true; })()`);
await sleep(300);
check("a tip's lines are its paragraphs with air between them, a blank line a little more; what it says is unchanged; one line stays plain text",
  pa79.tip.n === 3 && pa79.tip.gap === "false,false,true" && pa79.tip.text === "Line one\nLine two\n\nAfter a blank" && pa79.tip.ws === "normal" && pa79.tip.color &&
  /^0,6\.\d+,11\.\d+$/.test(pa79.tip.m) && !!pa79.single && !pa79.single.paras && pa79.single.ps === 0 && pa79.single.text === "Just one line", JSON.stringify(pa79));
check("  the guide's items 0.55 em apart (8 px), the cheat-sheet's «How the probes were made» in three paragraphs with air between them",
  pa79g >= 7.5 && pa79g <= 8.5 && pa79s.n === 3 && pa79s.m >= 7 && /^A crackle or a rustle of paper/.test(pa79s.last), JSON.stringify({ pa79g, pa79s }));

// HERESY 1169 · 1280 (TODO.md, the rooms' audit: the take's menu over the player's wave)
section("the take's menu over the player's wave and its name");
await ev(`(() => { const a = document.getElementById("audio"); a.pause(); a.muted = true; document.querySelector('#tabs [data-tab="create"]').click(); return true; })()`);
// not Nachtzug: the peaks' check further on wants that one never heard yet (its peaks not in the page's cache)
const wm80Name = await ev(`(() => { const c = [...document.querySelectorAll("#libList .take[data-name]:not(.is-running-row)")].find((x) => !/nachtzug/.test(x.dataset.name)); if (!c) return null; c.click(); return c.dataset.name; })()`);
await waitFor(`!!(document.getElementById("playbarTitle").textContent && document.getElementById("playbarTitle").textContent !== "Nothing loaded")`, 4000, 50);
const wm80At = await ev(`(() => { const w = document.getElementById("wave").getBoundingClientRect(), n = document.getElementById("playbarTitle").getBoundingClientRect();
  return { wx: Math.round(w.left + w.width * 0.3), wy: Math.round(w.top + w.height / 2), nx: Math.round(n.left + 6), ny: Math.round(n.top + n.height / 2), t: document.getElementById("audio").currentTime }; })()`);
await send("Input.dispatchMouseEvent", { type: "mousePressed", x: wm80At.wx, y: wm80At.wy, button: "right", clickCount: 1 });
await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: wm80At.wx, y: wm80At.wy, button: "right", clickCount: 1 });
const wm80a = await waitFor(`(() => { const m = document.querySelector(".hm-menu"); if (!m) return null; const r = m.getBoundingClientRect();
  return { items: [...m.querySelectorAll(".hm-item .hm-label")].map((x) => x.textContent).slice(0, 4), near: Math.abs(r.left - ${wm80At.wx}) < 260, t: document.getElementById("audio").currentTime }; })()`, 3000, 50);
await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
await waitFor(`!document.querySelector(".hm-menu")`, 2000, 50);
await send("Input.dispatchMouseEvent", { type: "mousePressed", x: wm80At.nx, y: wm80At.ny, button: "right", clickCount: 1 });
await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: wm80At.nx, y: wm80At.ny, button: "right", clickCount: 1 });
const wm80b = await waitFor(`!!document.querySelector(".hm-menu .hm-item")`, 3000, 50);
await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
await waitFor(`!document.querySelector(".hm-menu")`, 2000, 50);
check("a right click on the player's wave opens the take's menu there (Play or Pause first, as in a list) and does not jump; one on its name too",
  !!wm80Name && !!wm80a && /^(Play|Pause)$/.test(wm80a.items[0] || "") && wm80a.near && Math.abs(wm80a.t - wm80At.t) < 0.5 && !!wm80b, JSON.stringify({ wm80Name, wm80At, wm80a, wm80b }));

// HERESY 1169 · 1281 (from SUNO v6, TODO.md: «Vocal gender at a click (male, female): its words put into the Style»)
section("the voice's gender at a click: ♂ and ♀ in the Style's head");
const vg81 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), s = document.getElementById("style"), was = s.value, o = {};
  document.querySelector('#tabs [data-tab="create"]').click();
  const set = (v) => { s.value = v; s.dispatchEvent(new Event("input", { bubbles: true })); };
  const lit = () => ["male", "female"].filter((g) => document.getElementById("voice-" + g).classList.contains("is-on")).join() || "none";
  const fold = () => document.querySelector('[data-fold="style"]').classList.contains("is-folded");
  set("Russian, folk rock, accordion, 96 BPM"); await wait(30);
  const f0 = fold(); o.start = lit();
  document.getElementById("voice-female").click(); await wait(30); o.female = { v: s.value, lit: lit() };
  document.getElementById("voice-male").click(); await wait(30); o.male = { v: s.value, lit: lit() };
  document.getElementById("voice-male").click(); await wait(30); o.off = { v: s.value, lit: lit() };
  s.focus(); document.execCommand("undo"); await wait(30); o.undo = { v: s.value, lit: lit() };
  set("Dark pop, whispery Female Vocals\\nwide stereo"); await wait(30);
  document.getElementById("voice-male").click(); await wait(30); o.caseKept = s.value;
  set(""); document.getElementById("voice-male").click(); await wait(30); o.empty = s.value;
  set("raspy male"); o.rawLit = lit();
  o.folded = fold() !== f0; o.icons = !!document.querySelector("#voice-male svg") && !!document.querySelector("#voice-female svg");
  o.inHead = !!document.getElementById("voice-male").closest('[data-fold="style"] > .label');
  set(was); s.blur();
  return o; })()`);
check("♂ and ♀ in the Style's head: female vocals go in before the BPM, ♂ turns them male, ♂ again takes the tag out, one Ctrl+Z brings it back; lit by what the Style says",
  vg81.start === "none" && vg81.female.v === "Russian, folk rock, accordion, female vocals, 96 BPM" && vg81.female.lit === "female" &&
  vg81.male.v === "Russian, folk rock, accordion, male vocals, 96 BPM" && vg81.male.lit === "male" && vg81.off.v === "Russian, folk rock, accordion, 96 BPM" && vg81.off.lit === "none" &&
  vg81.undo.v === "Russian, folk rock, accordion, male vocals, 96 BPM" && vg81.undo.lit === "male", JSON.stringify(vg81));
check("  the case and the words around kept (whispery Female Vocals → whispery Male Vocals, the next line untouched); an empty Style takes the tag alone; «raspy male» lights ♂; the head does not fold",
  vg81.caseKept === "Dark pop, whispery Male Vocals\nwide stereo" && vg81.empty === "male vocals" && vg81.rawLit === "male" && !vg81.folded && vg81.icons && vg81.inHead, JSON.stringify(vg81));

// HERESY 1169 · 1282 (from SUNO v6, TODO.md: «Sections on the wave… a click on one goes there»)
section("the take's sections on the player's wave");
await ev(`(() => { const a = document.getElementById("audio"); a.pause(); a.muted = true; document.querySelector('#tabs [data-tab="create"]').click();
  if (!document.getElementById("playbarTitle").textContent || document.getElementById("playbarTitle").textContent === "Nothing loaded") {
    const c = [...document.querySelectorAll("#libList .take[data-name]:not(.is-running-row)")].find((x) => !/nachtzug/.test(x.dataset.name)); if (c) c.click(); }
  return true; })()`);
await waitFor(`isFinite(document.getElementById("audio").duration) && document.getElementById("audio").duration > 0.2`, 6000, 100);
const ws82 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), a = document.getElementById("audio"), w = document.getElementById("wave"), d = a.duration, o = {};
  o.fromScore = window.ruachWaveSections(${JSON.stringify(RSCORE)}).map((s) => s.name + "@" + s.t.toFixed(1)).join();
  window.ruachWaveSections([{ t: 0, name: "intro" }, { t: d * 0.5, name: "chorus" }], true);
  const r = w.getBoundingClientRect();
  return { o, d, x: Math.round(r.left + r.width * 0.5 + 3), x2: Math.round(r.left + r.width * 0.75), y: Math.round(r.top + r.height / 2) }; })()`);
await send("Input.dispatchMouseEvent", { type: "mousePressed", x: ws82.x, y: ws82.y, button: "left", clickCount: 1 });
await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: ws82.x, y: ws82.y, button: "left", clickCount: 1 });
await sleep(150);
const ws82a = await ev(`document.getElementById("audio").currentTime`);
await send("Input.dispatchMouseEvent", { type: "mousePressed", x: ws82.x2, y: ws82.y, button: "left", clickCount: 1 });
await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: ws82.x2, y: ws82.y, button: "left", clickCount: 1 });
await sleep(150);
const ws82b = await ev(`document.getElementById("audio").currentTime`);
await ev(`(() => { window.ruachWaveSections([], true); const a = document.getElementById("audio"); a.pause(); a.currentTime = 0; return true; })()`);
check("a score's sections as times at its tempo (intro at 0, the verse two bars of 100 BPM later); on the player's wave a click 3 px by a section's line goes to its very start, one far from any where it lands",
  ws82.o.fromScore === "intro@0.0,verse@4.8" && Math.abs(ws82a - ws82.d * 0.5) < 0.02 && Math.abs(ws82b - ws82.d * 0.75) < ws82.d * 0.02, JSON.stringify({ ws82, ws82a, ws82b }));

// HERESY 1169 · 1283 (Viktor 09.10.2026: «…в Engine — опции по изменению локации с переносом данных с одного места в другое»)
section("Engine → Folders: where the work lives, and a move asked twice");
const pl83 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), real = window.fetch, asked = [];
  const until = async (fn, ms) => { for (let i = 0; i < (ms || 3000) / 50; i++) { const v = fn(); if (v) return v; await wait(50); } return null; };
  const json = (b, s) => Promise.resolve(new Response(JSON.stringify(b), { status: s || 200, headers: { "Content-Type": "application/json" } }));
  const row = (name, label, extra) => Object.assign({ name, label, what: label + " things", path: "/s/" + name, real: "/s/" + name, linked: false, here: true, record: null,
    free: 107374182400, counting: false, files: 1234, bytes: 2147483648 }, extra || {});
  let job = null;
  const listing = () => ({ places: [row("outputs", "Songs"), row("trash", "Trash", { linked: true, real: "/mnt/b/trash" }),
    row("artist", "Pictures", { missing: true, linked: true, here: false, real: "/mnt/gone/artist", record: { at: "/mnt/gone/artist" } }),
    row("writer", "Writer", { counting: true, files: undefined, bytes: undefined })], job, wsl: false, home: "/s" });
  window.fetch = (u, o) => { u = String(u);
    if (u.startsWith("/lab/places/plan")) { asked.push(u); return json({ ok: true, dest: "/mnt/big/outputs", home: false, same_disk: false, need: 2147483648, free: 107374182400, why: "" }); }
    if (u.startsWith("/lab/places/move")) { asked.push(JSON.stringify(JSON.parse(o.body)) + " " + u.split("?")[0]);
      job = { name: "outputs", phase: "copy", done: 1073741824, total: 2147483648, files: 617, of: 1234, to: "/mnt/big/outputs", home: false, old: "", error: "" }; return json(listing()); }
    if (u.startsWith("/lab/places")) return json(listing());
    return real(u, o); };
  document.getElementById("engineToggle").click();
  await until(() => document.querySelectorAll("#plRows .pl-row").length === 4);
  const o = { rows: document.querySelectorAll("#plRows .pl-row").length, last: [...document.querySelectorAll("#view-engine .engine-grid > .card")].pop().id };
  o.texts = [...document.querySelectorAll("#plRows .pl-row")].map((r) => r.querySelector(".pl-name b").textContent + "|" + r.querySelector(".pl-size").textContent + "|" +
    r.querySelector(".pl-note").textContent + "|" + [...r.querySelectorAll("button")].map((b) => b.textContent + (b.disabled ? "(off)" : "")).join("+"));
  document.querySelector('#plRows [data-pl-move="outputs"]').click();
  const input = await until(() => document.querySelector(".hd-back.is-on:not(.is-leaving) .hd-input"));
  o.ask = document.querySelector(".hd-back.is-on:not(.is-leaving) .hd-title").textContent;
  input.value = "/mnt/big"; document.querySelector(".hd-back.is-on:not(.is-leaving) .hd-yes").click();
  const b2 = await until(() => { const b = document.querySelector(".hd-back.is-on:not(.is-leaving)"); return b && !b.querySelector(".hd-input") ? b : null; });
  o.confirm = b2 ? { title: b2.querySelector(".hd-title").textContent, body: (b2.querySelector(".hd-body") || {}).textContent || "", yes: b2.querySelector(".hd-yes").textContent } : null;
  if (b2) b2.querySelector(".hd-yes").click();
  await until(() => !document.getElementById("plJob").hidden);
  await wait(100);
  o.job = document.getElementById("plJob").textContent;
  o.off = document.querySelector('#plRows [data-pl-move="trash"]').disabled;
  o.asked = asked;
  window.fetch = real;
  document.getElementById("engineToggle").click();
  await until(() => document.getElementById("view-engine").classList.contains("is-hidden"));
  return o; })()`);
check("Engine → Folders: each folder a row, its size and the room on its disk, Back home for a linked one, Link again for one not there; About still the last card",
  pl83.rows === 4 && pl83.last === "aboutCard" && /^Songs\|1.234 files · 2\.0 GB\|in the studio's folder · 100\.0 GB free on its disk\|Move…$/.test(pl83.texts[0]) &&
  /^Trash\|.*\|linked from the studio's folder · 100\.0 GB free on its disk\|Move…\+Back home$/.test(pl83.texts[1]) &&
  /^Pictures\|1.234 files · 2\.0 GB\|not there: a disk not mounted\?\|Move…\(off\)\+Link again$/.test(pl83.texts[2]) &&
  /^Writer\|counting…\|/.test(pl83.texts[3]), JSON.stringify(pl83.texts));
check("  Move… asks where, the lab's plan says what will happen, and it moves only on the second yes; then its progress, and no second move meanwhile",
  pl83.ask === "Move Songs to another folder" && !!pl83.confirm && pl83.confirm.title === "Move Songs to /mnt/big/outputs?" && /^Another disk: 2\.0 GB copied \(free there: 100\.0 GB\)/.test(pl83.confirm.body) &&
  pl83.confirm.yes === "Move" && pl83.asked[0] === "/lab/places/plan?name=outputs&to=%2Fmnt%2Fbig" && pl83.asked[1] === '{"name":"outputs","to":"/mnt/big"} /lab/places/move' &&
  /^Copying Songs: 50 %, 1\.0 GB of 2\.0 GB, 617 of 1.234 files$/.test(pl83.job) && pl83.off, JSON.stringify(pl83));

// HERESY 1169 · 1284 (Viktor 09.10.2026: «Колонка с картинками у Художника - всё свалено в кучу. Сделай честный тайлинг»)
section("the Artist's gallery in even tiles");
await send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
const ar84Was = await ev(`({ tab: document.body.dataset.tab, look: localStorage.getItem("yue2.arLook"), filter: localStorage.getItem("yue2.arFilter"), size: localStorage.getItem("yue2.arSize") })`);
await ev(`(() => { const real = window.fetch; window.__ar84Fetch = real;
  const pic = (n, shape, w, h) => { const f = String(n).padStart(2, "0") + "-" + shape.replace(":", "x"); return { n, shape, seed: n, w, h, kept: true, file: f + ".png", thumb: "thumbs/" + f + ".jpg" }; };
  const run = { id: "20261009-210000-tile", prompt: "Tiles.", shapes: ["1:1", "16:9", "9:16"], seed: 1, count: 3, painter: "krea2-q4", created: 1791600000, status: "done", of: 7, took: 60, gpu: 2,
    pictures: [pic(1, "1:1", 1280, 1280), pic(2, "16:9", 1920, 1080), pic(3, "9:16", 1080, 1920), pic(4, "1:1", 1280, 1280), pic(5, "16:9", 1920, 1080), pic(6, "9:16", 1080, 1920), pic(7, "16:9", 1920, 1080)] };
  const json = (b) => Promise.resolve(new Response(JSON.stringify(b), { status: 200, headers: { "Content-Type": "application/json" } }));
  window.fetch = (u, o) => { u = String(u); if (u.startsWith("/lab/artist/runs")) return json({ runs: [run] }); return real(u, o); };
  localStorage.setItem("yue2.arLook", "gallery"); localStorage.setItem("yue2.arFilter", "all"); localStorage.setItem("yue2.arSize", "s");
  return true; })()`);
await ev(`document.getElementById("tabArtist").click(); if (window.HeresyArtist && window.HeresyArtist.reload) window.HeresyArtist.reload(); true`);
await ev(`(() => { const b = document.querySelector('#arBar [data-look="gallery"]'); if (b) b.click(); const f = document.querySelector('#arFilters [data-filter="all"]'); if (f) f.click();
  const s = document.querySelector('#arSizes [data-size="s"]'); if (s) s.click(); return true; })()`);
await waitFor(`document.querySelectorAll(".ar-gallery .ar-gpic").length === 7`, 4000, 50);
await sleep(200);
const ar84 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), box = (e) => { const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; };
  const tiles = () => [...document.querySelectorAll(".ar-gallery .ar-gpic .ar-thumb")].map(box);
  const o = { all: tiles(), fit: getComputedStyle(document.querySelector(".ar-gallery .ar-thumb img")).objectFit, col: box(document.querySelector(".ar-gallery")) };
  document.querySelector('#arFilters [data-filter="16:9"]').click(); await wait(150); o.wide = tiles();
  document.querySelector('#arFilters [data-filter="all"]').click(); await wait(100);
  window.fetch = window.__ar84Fetch;
  return o; })()`);
await ev(`(() => { const w = ${JSON.stringify(ar84Was)}; ["look", "filter", "size"].forEach((k) => { const key = "yue2.ar" + k[0].toUpperCase() + k.slice(1); if (w[k] == null) localStorage.removeItem(key); else localStorage.setItem(key, w[k]); });
  if (window.HeresyArtist && window.HeresyArtist.reload) window.HeresyArtist.reload(); document.querySelector('.topbar [data-tab="' + (w.tab || "create") + '"]').click(); return true; })()`);
await sleep(300);
const ar84Cols = new Set(ar84.all.map((t) => t[0])).size, ar84Sizes = new Set(ar84.all.map((t) => t[2] + "x" + t[3])).size, ar84Right = Math.max(...ar84.all.map((t) => t[0] + t[2]));
check("the gallery in even tiles: every tile the same square box in equal columns filling the column edge to edge, each picture whole (contain), whatever its shape",
  ar84.all.length === 7 && ar84Sizes === 1 && Math.abs(ar84.all[0][2] - ar84.all[0][3]) <= 1 && ar84Cols >= 2 && Math.abs(ar84Right - (ar84.col[0] + ar84.col[2])) <= 2 && ar84.fit === "contain",
  JSON.stringify({ ar84, ar84Cols, ar84Sizes, ar84Right }));
check("  one shape shown: its own tiles (16:9 boxes), all alike",
  ar84.wide.length === 3 && new Set(ar84.wide.map((t) => t[2] + "x" + t[3])).size === 1 && Math.abs(ar84.wide[0][2] / ar84.wide[0][3] - 16 / 9) < 0.05, JSON.stringify(ar84.wide));

// HERESY 1169 · 1286 (Viktor 09.10.2026: «OSEM с девизом сделай на 20% крупнее, дай больше пространства между Лого и OSEM, а также сам прогресс бар опусти в подвал, 160 пикселов от пола»; 1295, 10.10.2026: «ты опустил бар, а "ЗАГРУЗКА ЗВУКОВОЙ ЕРЕСИ" забыл. И прикрути также версию движка туда. Мелко, под бар»)
section("the veil: the slogan larger and further from the logo; the words, the line and the versions at the foot");
await send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
const bv86 = await ev(`(async () => {
  const h = document.documentElement, had = h.classList.contains("booting"), v = document.getElementById("bootVeil");
  h.classList.add("booting"); h.classList.remove("veil-lift", "i18n-wait");
  if (window.RuachVeilVersions) window.RuachVeilVersions();   // a test browser gets no veil: its versions asked here
  for (let i = 0; i < 40 && !(document.getElementById("bootVer") || {}).textContent; i++) await new Promise((r) => setTimeout(r, 100));
  const r = (s) => { const e = v.querySelector(s).getBoundingClientRect(); return { top: Math.round(e.top), bottom: Math.round(e.bottom), cx: Math.round(e.left + e.width / 2) }; };
  const o = { logo: r(".boot-logo"), osem: r(".boot-osem"), words: r(".boot-words"), line: r(".boot-line"), ver: r(".boot-ver"), vh: window.innerHeight, vw: window.innerWidth,
    font: parseFloat(getComputedStyle(v.querySelector(".boot-osem")).fontSize), verText: v.querySelector(".boot-ver").textContent,
    verFont: parseFloat(getComputedStyle(v.querySelector(".boot-ver")).fontSize) };
  if (!had) h.classList.remove("booting");
  return o; })()`);
check("the veil: OSEM a fifth larger (19.2 px at 1920), 50 px or more under the logo; the line 160 px above the floor, in the middle",
  Math.abs(bv86.font - 19.2) < 0.3 && bv86.osem.top - bv86.logo.bottom >= 50 && Math.abs(bv86.vh - bv86.line.bottom - 160) <= 1 &&
  Math.abs(bv86.line.cx - bv86.vw / 2) <= 2, JSON.stringify(bv86));
check("  «Loading the Sound Heresy» went down with the line, just above it; the engine's version small under it",
  bv86.words.bottom <= bv86.line.top && bv86.line.top - bv86.words.bottom <= 30 && Math.abs(bv86.words.cx - bv86.vw / 2) <= 2 &&
  bv86.ver.top >= bv86.line.bottom && bv86.ver.top - bv86.line.bottom <= 30 && bv86.verFont <= 12 && /engine \S+/.test(bv86.verText), JSON.stringify(bv86));

// HERESY 1169 · 1287 (Viktor 09.10.2026: «Ручной пресет памяти не даёт мне выбрать объём VRAM из доступных 16GB VRAM. В реалии я бы на этом железе выбрал бы 14GB, чтобы не было OOM»); 1294 (10.10.2026: «в кастомном выборе по GPU я так и не вижу ползунка для выбора лимита VRAM по GPU»): the tiers went for each card's VRAM limit in Engine → GPUs
section("the memory preset: Auto plans for the studio's card or its VRAM limit; no tiers beside it");
const mp87 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), sel = document.getElementById("memPreset");
  document.getElementById("engineToggle").click(); await wait(300);
  const o = { opts: [...sel.options].map((x) => x.value), auto: sel.querySelector('option[value="auto"]').textContent };
  document.getElementById("engineToggle").click(); await wait(300);
  if (document.querySelector(".hd-back.is-on:not(.is-leaving) .hd-no")) { document.querySelector(".hd-back.is-on:not(.is-leaving) .hd-no").click(); await wait(300); }
  return o; })()`);
check("Auto and Manual only (a card's limit is set in Engine → GPUs); Auto says the card it found and the knobs it sets",
  mp87.opts.join() === "auto,manual" && /^Auto \(\d+\.\d GB found(, its limit [\d.]+ GB in Engine → GPUs)?: (context [\d.,\s ]+|whole context), VAE tiles \d+\)$/.test(mp87.auto), JSON.stringify(mp87));

// HERESY 1169 · 1288 (Viktor's screenshot of 09.10.2026: «The studio's 💎 set c»; «можно будет в Пинокио Ctrl+N использовать»)
section("the seconds' pattern takes numbers only; Ctrl+N is New song");
const i88 = await ev(`(() => { const L = window.RuachI18n; const o = {};
  ["ru", "uk", "be", "el", "es", "it"].forEach((c) => { o[c] = [L.look("The zebra's 💎 sets", c), L.look("Open the zebra sets", c), L.look("12s", c), L.look("2.5s", c)]; });
  return o; })()`);
await ev(`(() => { const s = document.getElementById("title"); window.__n88 = s.value; s.value = "Ctrl N test"; s.dispatchEvent(new Event("input", { bubbles: true })); document.querySelector('#tabs [data-tab="write"]') && document.querySelector('#tabs [data-tab="write"]').click(); return true; })()`);
await sleep(200);
await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "n", code: "KeyN", windowsVirtualKeyCode: 78, modifiers: 2 });
await send("Input.dispatchKeyEvent", { type: "keyUp", key: "n", code: "KeyN", windowsVirtualKeyCode: 78, modifiers: 2 });
const n88 = await waitFor(`(() => { const b = document.querySelector(".hd-back.is-on:not(.is-leaving)"); return b ? { title: b.querySelector(".hd-title").textContent, tab: document.body.dataset.tab } : null; })()`, 3000, 50);
await answerDialog(false);
await ev(`(() => { const s = document.getElementById("title"); s.value = window.__n88; s.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
check("the seconds' pattern takes a number only: an untranslated «… sets» stays as it is in all six languages (no «set с»), «12s» and «2.5s» are seconds",
  Object.keys(i88).every((c) => i88[c][0] === null && i88[c][1] === null && /^12 [сs]$/.test(i88[c][2]) && /^2\.5 [сs]$/.test(i88[c][3])), JSON.stringify(i88));
check("  Ctrl+N from another room: the Creator, and New song asks first (words in the form)", !!n88 && n88.tab === "create" && /new song/i.test(n88.title), JSON.stringify(n88));

// HERESY 1169 · 1289 (Viktor 10.10.2026: «И нужно в Engine добавить докачку моделей и LoRA»)
section("Engine → Models and LoRAs: what the install brings, fetched again from the studio, the extras asked with their sizes");
const wt89 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), real = window.fetch, asked = [];
  const until = async (fn, ms) => { for (let i = 0; i < (ms || 3000) / 50; i++) { const v = fn(); if (v) return v; await wait(50); } return null; };
  const json = (b, s) => Promise.resolve(new Response(JSON.stringify(b), { status: s || 200, headers: { "Content-Type": "application/json" } }));
  const now = Math.round(Date.now() / 1000);
  const last = { mode: "check", at: now - 60, counts: { here: 7, unknown: 0, differs: 0, fetched: 0, missing: 2, failed: 0 }, parts: [
    { part: "extras", label: "Checkpoints for the extra decoders and the sliders, made into GGUF here", size: "1.3 GB, and as much again made from it",
      rows: [{ state: "here", text: "checkpoints/YuE2-Vae-legacy (m-a-p/YuE2-Vae-legacy @ 5ddd12f)" }, { state: "here", text: "legacy, blend and sliders as GGUF (models/, sliders/)" }] },
    { part: "loras", label: "LoRAs: the Kit's library and Ruach Studio's own", size: "2.1 GB",
      rows: [{ state: "here", text: "loras/ (the Kit's library) (tools/download-loras.sh)" },
             { state: "missing", text: "loras/duduk-yt-r16/duduk-yt-r16-e200.safetensors (goldhub/Ruach_Studio_LoRAs @ 2a4662d), 56 MB" },
             { state: "missing", text: "loras/shofar-yt-r16/shofar-yt-r16-e099.safetensors (goldhub/Ruach_Studio_LoRAs @ 2a4662d), 56 MB" }] }] };
  const extras = [{ name: "backbone", label: "Backbone", what: "M-A-P's YuE2 as GGUF", restart: true, variants: [
      { id: "BF16", size: "7.2 GB", note: "the whole model", here: false }, { id: "Q8_0", size: "3.8 GB", here: true }] },
    { name: "trainer", label: "LoRA trainer's base", what: "Comfy-Org/YuE2", variants: [{ id: "bf16", size: "7.8 GB", here: false }, { id: "int8", size: "4.0 GB", here: false }] }];
  let job = null;
  const listing = () => ({ script: true, last, extras, parts: {}, job, now });
  window.fetch = (u, o) => { u = String(u);
    if (u.startsWith("/lab/weights/fetch")) { asked.push(o.body + " " + u.split("?")[0]);
      job = { kind: "fetch", what: "the LoRAs", status: "running", started: now - 4, ended: null, rc: null, counts: null, restart: false, written: 58720256,
              lines: ["", "LoRAs: the Kit's library and Ruach Studio's own (--only loras)", "here      loras/ (the Kit's library) (tools/download-loras.sh)",
                      "fetched   loras/duduk-yt-r16/duduk-yt-r16-e200.safetensors (goldhub/Ruach_Studio_LoRAs @ 2a4662d)"] };
      return json(listing()); }
    if (u.startsWith("/lab/weights")) return json(listing());
    return real(u, o); };
  document.getElementById("engineToggle").click();
  await until(() => document.querySelectorAll("#wtParts .wt-part").length === 2);
  const o = { cards: [...document.querySelectorAll("#view-engine .engine-grid > .card")].map((c) => c.id || c.className.split(" ").pop()) };
  o.line = document.getElementById("wtLine").textContent;
  o.parts = [...document.querySelectorAll("#wtParts .wt-part")].map((p) => p.querySelector(".wt-sum").textContent + "|" + p.querySelectorAll(".wt-row").length + "|" +
    [...p.querySelectorAll("button")].map((b) => b.textContent).join("+"));
  o.all = !document.getElementById("wtFetch").hidden;
  o.shown = [...document.querySelectorAll("#view-engine .btn[hidden]")].filter((b) => getComputedStyle(b).display !== "none").map((b) => b.id || b.textContent);
  o.extras = [...document.querySelectorAll("#wtExtras .wt-extra")].map((x) => x.querySelector("select").value + "|" + [...x.querySelectorAll("option")].map((op) => op.textContent).join(";") +
    "|" + x.querySelector("button").textContent + (x.querySelector("button").disabled ? "(off)" : ""));
  const pick = async (v) => { const s = document.querySelector('#wtExtras select[data-wt-pick="backbone"]'); s.value = v; s.dispatchEvent(new Event("change", { bubbles: true })); await wait(50); };
  await pick("Q8_0");
  const hb = document.querySelector('#wtExtras [data-wt-extra="backbone"]');
  o.hereBtn = hb.textContent + (hb.disabled ? "(off)" : "");
  await pick("BF16");
  document.querySelector('#wtExtras [data-wt-extra="backbone"]').click();
  const d1 = await until(() => document.querySelector(".hd-back.is-on:not(.is-leaving)"));
  o.ask1 = d1 ? d1.querySelector(".hd-title").textContent + " / " + ((d1.querySelector(".hd-body") || {}).textContent || "") : null;
  if (d1) d1.querySelector(".hd-no").click();
  await until(() => !document.querySelector(".hd-back.is-on:not(.is-leaving)"));
  document.querySelector('#wtParts [data-wt-part="loras"]').click();
  const d2 = await until(() => document.querySelector(".hd-back.is-on:not(.is-leaving)"));
  o.ask2 = d2 ? d2.querySelector(".hd-title").textContent + " / " + ((d2.querySelector(".hd-body") || {}).textContent || "") + " / " + d2.querySelector(".hd-yes").textContent : null;
  if (d2) d2.querySelector(".hd-yes").click();
  await until(() => /fetching/.test(document.getElementById("wtLine").textContent));
  o.run = document.getElementById("wtLine").textContent;
  o.log = document.getElementById("wtLog").hidden ? null : [...document.querySelectorAll("#wtLog .wt-st")].map((s) => s.className + ":" + s.textContent).join(",");
  o.off = document.getElementById("wtCheck").disabled && document.querySelector('#wtExtras [data-wt-extra="trainer"]').disabled && document.querySelector('#wtParts [data-wt-part="loras"]').disabled;
  job = Object.assign({}, job, { status: "done", ended: now + 6, rc: 0, counts: { here: 15, unknown: 0, differs: 0, fetched: 2, missing: 0, failed: 0 }, restart: false });
  await window.HeresyWeights.load();
  o.done = document.getElementById("wtLine").textContent;
  o.restart = !document.getElementById("wtRestart").hidden;
  job = Object.assign({}, job, { started: now - 3, what: "the backbone BF16", restart: true, counts: { here: 0, unknown: 0, differs: 0, fetched: 1, missing: 0, failed: 0 } });
  await window.HeresyWeights.load();
  o.done2 = document.getElementById("wtLine").textContent;
  o.restart2 = !document.getElementById("wtRestart").hidden;
  o.asked = asked;
  window.fetch = real;
  document.getElementById("engineToggle").click();
  await until(() => document.getElementById("view-engine").classList.contains("is-hidden"));
  return o; })()`);
const wtAt = wt89.cards.indexOf("modelsCard");
check("Engine → Models and LoRAs: under Sliders, About still the last card; the last run said at once, a part not whole with what is missing and its Fetch, a whole one «all here»",
  wtAt > 0 && wt89.cards[wtAt - 1] === "eg-sliders" && wt89.cards[wt89.cards.length - 1] === "aboutCard" &&
  /^The last check \(.+\): 7 here, 2 missing, 0 failed\.$/.test(wt89.line) && wt89.parts[0] === "all here|0|" && wt89.parts[1] === "1 here, 2 not|2|Fetch" && wt89.all,
  JSON.stringify({ cards: wt89.cards, line: wt89.line, parts: wt89.parts }));
check("  a button the Engine hides stays hidden (Updates' «Update» and «What's new» showed with nothing new: .btn's display won over the attribute)",
  wt89.shown.length === 0, JSON.stringify(wt89.shown));
check("  the extras: each variant with its size, one here said so (its button «Here», off), the first not here picked",
  wt89.extras[0] === "BF16|BF16 · 7.2 GB;Q8_0 · 3.8 GB · here|Fetch" && wt89.extras[1] === "bf16|bf16 · 7.8 GB;int8 · 4.0 GB|Fetch" && wt89.hereBtn === "Here(off)",
  JSON.stringify({ extras: wt89.extras, here: wt89.hereBtn }));
check("  Fetch asks first with the size (No sends nothing); a part's Fetch sends that part alone, then the run's words while it goes, every button off",
  !!wt89.ask1 && wt89.ask1.indexOf("Fetch Backbone: BF16 (7.2 GB)? / The whole model.") === 0 && /next start; Compute then offers it/.test(wt89.ask1) &&
  !!wt89.ask2 && wt89.ask2.indexOf("Fetch LoRAs: the Kit's library and Ruach Studio's own? / About 2.1 GB. Each file comes at the revision the release pins") === 0 && / \/ Fetch$/.test(wt89.ask2) &&
  wt89.asked.length === 1 && wt89.asked[0] === '{"part":"loras"} /lab/weights/fetch' &&
  wt89.run === "The LoRAs: fetching… 4 s · the disk has 56 MB less free than when it began" && wt89.log === "wt-st is-here:here,wt-st is-fetched:fetched" && wt89.off,
  JSON.stringify({ ask1: wt89.ask1, ask2: wt89.ask2, asked: wt89.asked, run: wt89.run, log: wt89.log, off: wt89.off }));
check("  when it is over, what came; a restart offered only where a backbone, a decoder or the sliders came (LoRAs the engine reads each time)",
  wt89.done === "The LoRAs: 2 fetched, 0 failed, in 10 s." && !wt89.restart &&
  wt89.done2 === "The backbone BF16: 1 fetched, 0 failed, in 9 s. The engine lists a new backbone, decoder or slider at its next start." && wt89.restart2,
  JSON.stringify({ done: wt89.done, restart: wt89.restart, done2: wt89.done2, restart2: wt89.restart2 }));

// HERESY 1169 · 1293 (Viktor 10.10.2026: «после этого не захотел фрейм сворачиваться в его исходную высоту… с каждым тиком графа GPU
// фрейм Лога сервера опускается на пиксел или два вниз»): one card doing all three, as on his laptop under Pinokio
section("the server log's frame beside the cards: back to its height after full height, still from tick to tick");
await send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
const g93 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), now = () => Date.now() / 1000;
  const roles = { studio: 0, train: [0], jobs: [0], training: {} };
  const t0 = now() - 30;
  const samples = (since) => { const out = []; for (let k = 0; k < 60; k++) { const t = t0 + k; if (t > since && t <= now()) out.push([t, 100, 7680, 16384, 62, 85]); } return out; };
  const real = window.fetch;
  window.fetch = (u, o) => {
    u = String(u);
    const json = (d) => Promise.resolve(new Response(JSON.stringify(d), { headers: { "Content-Type": "application/json" } }));
    if (u.startsWith("/lab/gpus/live")) { const since = +(new URL(u, location.href).searchParams.get("since") || 0); return json({ cards: [{ index: 0, name: "Quadro RTX 5000", samples: samples(since) }], error: "", now: now(), keep: 120, roles }); }
    return real(u, o);
  };
  const dock = document.getElementById("logDock"), folded = dock.classList.contains("is-folded"), wasTall = dock.classList.contains("is-tall");
  if (folded) document.getElementById("logDockTab").click();
  if (wasTall) document.getElementById("logDockTall").click();
  await wait(2600);
  const h = () => Math.round(dock.getBoundingClientRect().height);
  const o = { h1: h(), gl1: dock.style.getPropertyValue("--gl-h") };
  document.getElementById("logDockTall").click(); await wait(2600);
  o.tall = h();
  document.getElementById("logDockTall").click(); await wait(2600);
  o.h2 = h();
  await wait(4200);
  o.h3 = h(); o.gl3 = dock.style.getPropertyValue("--gl-h");
  const role = document.querySelector("#logDockGpus .gl-role");
  o.role = role ? role.textContent : null;
  o.cut = role ? role.scrollWidth > role.clientWidth + 1 : null;
  if (wasTall) document.getElementById("logDockTall").click();
  if (folded) document.getElementById("logDockTab").click();
  window.fetch = real;
  return o;
})()`);
check("the log's frame comes back to its height after full height, and does not creep from tick to tick (it lost a pixel a tick)",
  g93.tall > g93.h1 + 100 && Math.abs(g93.h2 - g93.h1) <= 2 && g93.h3 === g93.h2 && g93.gl3 === g93.gl1, JSON.stringify(g93));
check("  one card doing all three says all three, not «STUDIO · TRAI…»", g93.role === "Studio · Training · Lab jobs" && g93.cut === false, JSON.stringify({ role: g93.role, cut: g93.cut }));

// HERESY 1169 · 1294 (Viktor 10.10.2026, his laptop's 16 GB card under Pinokio: «в кастомном выборе по GPU я так и не вижу ползунка для выбора лимита VRAM по GPU»)
section("Engine → GPUs: a VRAM limit for each card; Compute's Auto plans for the studio card's limit; rc4's «auto:N» becomes it");
const vl94 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), real = window.fetch, posted = [], settings = [];
  const until = async (fn, ms) => { for (let i = 0; i < (ms || 3000) / 50; i++) { const v = fn(); if (v) return v; await wait(50); } return null; };
  const json = (d) => Promise.resolve(new Response(JSON.stringify(d), { headers: { "Content-Type": "application/json" } }));
  let limits = {};
  const cards = [{ index: 0, name: "Quadro RTX 5000", total_mb: 16384, free_mb: 8700 }, { index: 1, name: "NVIDIA GeForce RTX 3090", total_mb: 24576, free_mb: 24000 }];
  const state = () => ({ cards, roles: { studio: 0, train: [1], jobs: [0, 1], limits }, saved: true, studio_now: 0,
    guard: cards.map((c) => ({ index: c.index, total_mb: c.total_mb, free_mb: c.free_mb, ok: true, why: "", foreign: [] })), training: {}, studio_training: null });
  const keep = localStorage.getItem("yue2.memPreset");
  localStorage.setItem("yue2.memPreset", "auto:12");
  window.fetch = (u, o) => { u = String(u);
    if (u.startsWith("/lab/gpus/live")) return real(u, o);
    if (u.startsWith("/lab/gpus")) {
      if (o && o.method === "POST") { const b = JSON.parse(o.body); posted.push(b.limits); limits = b.limits || {}; }
      return json(state()); }
    if (u === "/settings" && o && o.method === "POST") settings.push(JSON.parse(o.body));
    return real(u, o); };
  document.getElementById("engineToggle").click();
  await until(() => posted.length >= 1 && document.querySelector('#gpuRoles input[data-limit="0"]'), 5000);
  await wait(400);
  const slider = (i) => document.querySelector('#gpuRoles input[data-limit="' + i + '"]'), label = (i) => document.querySelector('#gpuRoles [data-limit-v="' + i + '"]').textContent;
  const o = { migrated: posted[0], preset: localStorage.getItem("yue2.memPreset"), s0: slider(0) && [slider(0).min, slider(0).max, slider(0).step, slider(0).value], l0: label(0), l1: label(1),
    settings: settings.slice(), heads: [...document.querySelectorAll("#gpuRoles .gpu-table th")].map((t) => t.textContent),
    colspan: document.querySelector("#gpuRoles .gpu-live-row td").getAttribute("colspan") };
  const s = slider(0); s.value = "14"; s.dispatchEvent(new Event("input", { bubbles: true })); s.dispatchEvent(new Event("change", { bubbles: true }));
  o.l0b = label(0); o.unsaved = window.HeresyGpus.unsaved();
  document.getElementById("gpuSave").click();
  await until(() => posted.length >= 2, 3000); await wait(300);
  o.saved = posted[1]; o.auto = document.querySelector('#memPreset option[value="auto"]').textContent;
  o.unsavedAfter = window.HeresyGpus.unsaved();
  window.fetch = real;
  if (settings.length) await real("/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ max_seq: 0, vae_core: 512 }) });
  if (keep === null) localStorage.removeItem("yue2.memPreset"); else localStorage.setItem("yue2.memPreset", keep);
  document.getElementById("engineToggle").click(); await wait(300);
  const no = document.querySelector(".hd-back.is-on:not(.is-leaving) .hd-no"); if (no) { no.click(); await wait(300); }
  return o; })()`);
check("rc4's «Auto within 12 GB» became GPU0's VRAM limit (12 288 MiB) once, the page's preset Auto again, and the engine got the knobs for 12 GB",
  vl94.migrated && vl94.migrated["0"] === 12288 && vl94.preset === "auto" && vl94.settings.length === 1 && vl94.settings[0].max_seq === 16384 && vl94.settings[0].vae_core === 512,
  JSON.stringify({ migrated: vl94.migrated, preset: vl94.preset, settings: vl94.settings }));
check("  each card a slider in half gigabytes from 4 GB to its size, saying the limit or «no limit»; a column of its own",
  JSON.stringify(vl94.s0) === JSON.stringify(["4", "16", "0.5", "12"]) && vl94.l0 === "12.0 of 16.0 GB" && vl94.l1 === "no limit · 24.0 GB" &&
  vl94.heads.indexOf("VRAM limit") === 4 && vl94.colspan === "7", JSON.stringify({ s0: vl94.s0, l0: vl94.l0, l1: vl94.l1, heads: vl94.heads, colspan: vl94.colspan }));
check("  moved and saved: its label follows, the lab gets 14 336 MiB, Compute's Auto names the limit",
  vl94.l0b === "14.0 of 16.0 GB" && vl94.unsaved && vl94.saved && vl94.saved["0"] === 14336 && !vl94.saved["1"] && !vl94.unsavedAfter &&
  /, its limit 14\.0 GB in Engine → GPUs: context 16.384, VAE tiles 512\)$/.test(vl94.auto), JSON.stringify({ l0b: vl94.l0b, saved: vl94.saved, auto: vl94.auto, unsaved: vl94.unsaved, after: vl94.unsavedAfter }));

// HERESY 1169 · 1296 (Viktor 10.10.2026: «По LoRA расхождение в списке и в missing на Големе в Студии»)
section("Engine → Models and LoRAs: one's own copy of a published LoRA (another header, the same tensors) counts the part whole");
const wt96 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), real = window.fetch;
  const until = async (fn, ms) => { for (let i = 0; i < (ms || 3000) / 50; i++) { const v = fn(); if (v) return v; await wait(50); } return null; };
  const json = (b, s) => Promise.resolve(new Response(JSON.stringify(b), { status: s || 200, headers: { "Content-Type": "application/json" } }));
  const now = Math.round(Date.now() / 1000);
  const last = { mode: "check", at: now - 60, counts: { here: 2, unknown: 0, differs: 1, fetched: 0, missing: 0, failed: 0 }, parts: [
    { part: "loras", label: "LoRAs: the Kit's library and Ruach Studio's own", size: "2.3 GB",
      rows: [{ state: "here", text: "loras/ (the Kit's library) (tools/download-loras.sh)" },
             { state: "here", text: "loras/duduk-yt-r16/duduk-yt-r16-e200.safetensors (goldhub/Ruach_Studio_LoRAs @ 2a4662d), 56 MB" },
             { state: "differs", text: "loras/voice-ru-m-bass-82/voice-ru-m-bass-82-e029.safetensors (goldhub/Ruach_Studio_LoRAs @ 2a4662d) — kept: the copy here differs from the published file (--replace fetches it)" }] }] };
  window.fetch = (u, o) => { u = String(u);
    if (u.startsWith("/lab/weights")) return json({ script: true, last, extras: [], parts: {}, job: null, now });
    return real(u, o); };
  document.getElementById("engineToggle").click();
  await until(() => document.querySelectorAll("#wtParts .wt-part").length === 1);
  const p = document.querySelector("#wtParts .wt-part");
  const o = { sum: p.querySelector(".wt-sum").textContent, rows: [...p.querySelectorAll(".wt-row")].map((r) => r.className + ": " + r.textContent), buttons: [...p.querySelectorAll("button")].map((b) => b.textContent),
    all: !document.getElementById("wtFetch").hidden };
  window.fetch = real;
  document.getElementById("engineToggle").click();
  await until(() => document.getElementById("view-engine").classList.contains("is-hidden"));
  return o; })()`);
check("a part whose only odd file is one's own copy («differs», kept) is whole: «all here · own copies kept: 1», its row says why it was kept, no Fetch for it",
  wt96.sum === "all here · own copies kept: 1" && wt96.rows.length === 1 && /differs/.test(wt96.rows[0]) && /kept: the copy here differs from the published file/.test(wt96.rows[0]) &&
  wt96.buttons.length === 0, JSON.stringify(wt96));
const wt96i = await ev(`(() => { const out = {}; for (const lang of ["ru", "uk", "be", "el", "es", "it"]) out[lang] = window.RuachI18n.look("own copies kept: 6", lang);
  return out; })()`);
check("  said in all six languages with its number", Object.values(wt96i).every((v) => /: 6$/.test(v) && !/own copies/.test(v)), JSON.stringify(wt96i));

// HERESY 1169 · 1297 (Viktor 10.10.2026, his laptop's 16 GB card: «вечно "ждёт генерации"… реальный лог и сообщение о том, что модель
// выбранная не потянет на этом железе, не видно»)
section("Artwork: why it waits said in the toast; a failure said once; a painter no card can hold ends a volley at once");
const ar97 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), real = window.fetch, asked = [];
  const until = async (fn, ms) => { for (let i = 0; i < (ms || 3000) / 50; i++) { const v = fn(); if (v) return v; await wait(50); } return null; };
  const json = (b, s) => Promise.resolve(new Response(JSON.stringify(b), { status: s || 200, headers: { "Content-Type": "application/json" } }));
  const toasts = () => [...document.querySelectorAll("#toasts .toast")].map((t) => t.textContent);
  document.getElementById("toasts").innerHTML = "";
  let mode = "wait";
  const WHY = "no card can take this now (it needs 13500 MB): GPU0 has 7012 MiB free; this needs 13500. Engine \\u2192 GPUs says which card does what";
  const NOFIT = "Krea 2 Muse Q4 needs about 13.2 GB of VRAM (its peak with a margin), and the biggest card here has 12.0 GB: no painter fits on this machine yet: Krea 2 Muse Q4 wants a card of 16 GB";
  window.fetch = (u, o) => { u = String(u);
    if (u.startsWith("/lab/art/draw")) { asked.push(u.split("?")[1]);
      if (mode === "wait") { mode = "fail"; return json({ status: "queued", started: 1, kind: "art", waiting: WHY }, 202); }
      if (mode === "fail") return json({ status: "failed", error: "no artwork: torch.OutOfMemoryError: CUDA out of memory", name: "zz-art-1297" }, 500);
      return json({ error: NOFIT }, 400); }
    return real(u, o); };
  const o = {};
  o.d1 = await window.HeresyArt.draw("zz-art-1297", false, false);
  o.t1 = toasts();
  document.getElementById("toasts").innerHTML = "";
  mode = "nofit"; asked.length = 0;
  const many = window.HeresyArt.many(["zz-art-a", "zz-art-b", "zz-art-c"]);
  const d = await until(() => document.querySelector(".hd-back.is-on:not(.is-leaving)"));
  if (d) d.querySelector(".hd-yes").click();
  await many;
  await wait(200);
  o.asked = asked.slice(); o.t2 = toasts();
  window.fetch = real;
  return o; })()`);
check("waiting: the toast gives the guard's reason (the card's memory and the need), then that it starts by itself",
  ar97.t1.some((t) => t === "Artwork for “zz-art-1297” waits in the queue: no card can take this now (it needs 13500 MB): GPU0 has 7012 MiB free; this needs 13500. Engine → GPUs says which card does what. It starts by itself when a card has room"),
  JSON.stringify(ar97.t1));
check("  a failed artwork is said once («No artwork: torch.OutOfMemoryError…», not «No artwork: no artwork:»), not «ready»; drawArt answers failed",
  ar97.t1.some((t) => t === "No artwork: torch.OutOfMemoryError: CUDA out of memory") && !ar97.t1.some((t) => /is ready|no artwork: no artwork/i.test(t)) &&
  ar97.d1 && ar97.d1.status === "failed" && !ar97.d1.refused, JSON.stringify({ t1: ar97.t1, d1: ar97.d1 }));
check("  a painter no card can hold: refused once with the numbers, the volley of three ends there (one ask, «0 of 3»)",
  ar97.asked.length === 1 && ar97.t2.filter((t) => /^No artwork: Krea 2 Muse Q4 needs about 13\.2 GB/.test(t)).length === 1 && ar97.t2.some((t) => t === "Artwork drawn: 0 of 3"),
  JSON.stringify({ asked: ar97.asked, t2: ar97.t2 }));

// HERESY 1169 · 1298 (Viktor 10.10.2026: «В Тренере - The LOG перекрывает серверный фрейм. Сделай утяжку, тем более что он не нужен
// такой длинный для коротких строк лога/телеметрии»)
section("the Trainer's log: as wide as its lines, beside the server log's dock (never over it), on its baseline, the Trainer's own");
const lg98 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), real = window.fetch;
  const until = async (fn, ms) => { for (let i = 0; i < (ms || 3000) / 50; i++) { const v = fn(); if (v) return v; await wait(50); } return null; };
  const lines = Array.from({ length: 30 }, (_, i) => "voice-run-full-r32:   1%| " + (200 + i) + "/24192 [04:28<8:56:50, 1.34s/it, lr: 5.0e-05 loss: 2.893e+00]").join("\\n");
  window.fetch = (u, o) => { u = String(u);
    if (u.startsWith("/lab/train/log")) return Promise.resolve(new Response(lines, { headers: { "Content-Type": "text/plain" } }));
    return real(u, o); };
  document.querySelector('.topbar [data-tab="train"]').click();
  const dock = document.getElementById("logDock"), folded = dock.classList.contains("is-folded");
  if (folded) document.getElementById("logDockTab").click();
  await wait(300);
  window.HeresyTrain.log("zz-run-1298");
  const panel = await until(() => { const p = document.querySelector(".tr-logdock"); return p && !p.hidden && /2\\.893e\\+00/.test(p.textContent) ? p : null; });
  await wait(200);
  const r = (el) => { const b = el.getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top), b: Math.round(b.bottom), w: Math.round(b.width) }; };
  const pre = panel.querySelector(".tr-logdock-body");
  const o = { vw: document.documentElement.clientWidth, panel: r(panel), dock: r(dock), content: pre.scrollWidth, client: pre.clientWidth };
  document.getElementById("logDockTall").click(); await wait(400);
  o.tallPanel = r(panel); o.tallDock = r(dock);
  document.getElementById("logDockTall").click(); await wait(300);
  document.querySelector('.topbar [data-tab="create"]').click(); await wait(150);
  o.elsewhere = getComputedStyle(panel).display;
  document.querySelector('.topbar [data-tab="train"]').click(); await wait(150);
  o.back = getComputedStyle(panel).display;
  window.HeresyTrain.unlog();
  if (folded) document.getElementById("logDockTab").click();
  document.querySelector('.topbar [data-tab="create"]').click();
  window.fetch = real;
  await wait(300);                                    // returned at once after the switch, DevTools said «Promise was collected»
  return o; })()`);
check("the log stands left of the dock with a gap, on its baseline, as wide as its lines (no scrolling sideways), far narrower than the window",
  lg98.panel.r <= lg98.dock.l - 11 && Math.abs(lg98.panel.b - lg98.dock.b) <= 1 && lg98.content <= lg98.client + 1 && lg98.panel.w < lg98.vw * 0.6 && lg98.panel.l === 16,
  JSON.stringify(lg98));
check("  the dock at full height (wider): the log narrows to the room left, still beside it; in another room the log is not shown, back in the Trainer it is",
  lg98.tallPanel.r <= lg98.tallDock.l - 11 && lg98.elsewhere === "none" && lg98.back !== "none", JSON.stringify({ tallPanel: lg98.tallPanel, tallDock: lg98.tallDock, elsewhere: lg98.elsewhere, back: lg98.back }));

// HERESY 1169 · 1299 (Viktor 10.10.2026: «Добавь также возможность выстраивать в одну колонку оба блока живого графа. Сейчас они оба
// NAR и AR в одной полосе»)
section("the Trainer's Telemetry: the two curves side by side, or one under the other at the whole width, remembered");
const st99 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), real = window.fetch;
  const until = async (fn, ms) => { for (let i = 0; i < (ms || 3000) / 50; i++) { const v = fn(); if (v) return v; await wait(50); } return null; };
  const json = (b) => Promise.resolve(new Response(JSON.stringify(b), { headers: { "Content-Type": "application/json" } }));
  const keys = ["yue2.trRun", "yue2.trPane", "yue2.trStacked"], was = keys.map((k) => localStorage.getItem(k));
  localStorage.removeItem("yue2.trStacked");
  const curve = (a, b) => Array.from({ length: 20 }, (_, i) => [5 * (i + 1), +(a - (a - b) * i / 19).toFixed(3)]);
  const run = { name: "zz-run-1299", status: "done", dataset: "zz-set", kind: "voice", engine: "ruach", steps: 100, step: 100, tracks: 10, started: Date.now() / 1000 - 3600,
    ended: Date.now() / 1000 - 60, checkpoints: [], options: { rank: 16, lr: 0.0001, ar_loss_weight: 0.3, ar_kl_weight: 0.3, ar_lr_multiplier: 0.5, cot: "off", quant: "bf16" },
    series: { flow: { curve: curve(1.0, 0.8), first: 1.0, last: 0.8, min: 0.79 }, ar_ce: { curve: curve(5.6, 4.4), first: 5.6, last: 4.4, min: 4.39 }, sec_per_step: 1.3 } };
  window.fetch = (u, o) => { u = String(u);
    if (u.startsWith("/lab/train/datasets")) return json({ raw: [], prepared: [], runs: [run], gpus: [], own: {}, aitk_ready: false });
    if (u.startsWith("/lab/train/trash")) return json({ trash: [] });
    return real(u, o); };
  document.querySelector('.topbar [data-tab="train"]').click(); window.HeresyTrain.reload();
  const card = await until(() => document.querySelector('#trRunList [data-open="zz-run-1299"]'), 5000);
  if (card) card.click();
  const figs = () => [...document.querySelectorAll("#trRunPane .tr-chart")].map((f) => { const b = f.getBoundingClientRect(); return { l: Math.round(b.left), t: Math.round(b.top), w: Math.round(b.width) }; });
  await until(() => figs().length === 2, 4000);
  const o = { side: figs(), pane: Math.round(document.querySelector("#trRunPane .tr-charts").getBoundingClientRect().width) };
  const btn = () => document.querySelector("#trRunPane [data-stack]");
  o.tip1 = btn() && btn().dataset.tip; o.face1 = btn() && btn().querySelector(".ui-ico") && btn().querySelector(".ui-ico").getAttribute("class");
  btn().click(); await wait(150);
  o.stacked = figs(); o.kept = localStorage.getItem("yue2.trStacked"); o.tip2 = btn().dataset.tip; o.face2 = btn().querySelector(".ui-ico").getAttribute("class");
  o.pressed = btn().getAttribute("aria-pressed");
  btn().click(); await wait(150);
  o.back = figs(); o.kept2 = localStorage.getItem("yue2.trStacked");
  window.fetch = real;
  keys.forEach((k, i) => { if (was[i] === null) localStorage.removeItem(k); else localStorage.setItem(k, was[i]); });
  document.querySelector('.topbar [data-tab="create"]').click();
  await wait(300);                                    // returned at once after the switch, DevTools said «Promise was collected»
  return o; })()`);
check("side by side at first (one row: the same top, the second to the right); the button says it stacks them, its face two rows",
  st99.side.length === 2 && st99.side[0].t === st99.side[1].t && st99.side[1].l > st99.side[0].l + st99.side[0].w &&
  st99.tip1 === "The curves one under the other, each the whole width" && /ui-rows-2/.test(st99.face1 || ""), JSON.stringify(st99));
check("  clicked: one under the other, each the whole width; remembered; the button now offers side by side (two columns); clicked again: back, forgotten",
  st99.stacked[0].l === st99.stacked[1].l && st99.stacked[1].t > st99.stacked[0].t && Math.abs(st99.stacked[0].w - st99.pane) <= 1 && st99.kept === "1" &&
  st99.tip2 === "The curves side by side" && /ui-cols-2/.test(st99.face2) && st99.pressed === "true" &&
  st99.back[0].t === st99.back[1].t && st99.kept2 === null, JSON.stringify(st99));

// HERESY 1169 · 1300 (Viktor 10.10.2026: «В тренере смотри на RANK - подсказка под полем инлайн. И можно ли на завершённом тренинге
// продолжить по большему количеству эпох?»; «Я так и не смог полностью сориентироваться по AR WEIGHT и AR ANCHOR»)
section("the Trainer's form: the rank's share in its tip, the AR knobs' tips and their guide, a finished run goes on to more epochs");
const tr00 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), real = window.fetch, posted = [], NL = String.fromCharCode(10);
  const until = async (fn, ms) => { for (let i = 0; i < (ms || 3000) / 50; i++) { const v = fn(); if (v) return v; await wait(50); } return null; };
  const json = (b) => Promise.resolve(new Response(JSON.stringify(b), { headers: { "Content-Type": "application/json" } }));
  const keys = ["yue2.trRun", "yue2.trPane", "yue2.guideTab", "yue2.guideSeen"], was = keys.map((k) => localStorage.getItem(k));
  const opts = { rank: 16, lr: 0.0001, save_epochs: 1, ar_loss_weight: 0.3, ar_kl_weight: 0.3, ar_lr_multiplier: 0.5, cot: "off", quant: "bf16", steps_per_epoch: 2016, engine: "ruach" };
  const cks = [1, 2, 3, 4].map((e) => ({ file: "zz-done_" + String(2016 * e).padStart(9, "0") + ".safetensors", step: 2016 * e, epoch: e, bytes: 1, saved: Date.now() / 1000 }));
  const runs = [
    { name: "zz-done", status: "done", dataset: "zz-set", kind: "voice", engine: "ruach", steps: 8064, step: 8064, tracks: 2016, started: Date.now() / 1000 - 9000, ended: Date.now() / 1000 - 60, checkpoints: cks, options: opts, note: "his voice" },
    { name: "zz-aitk", status: "done", dataset: "zz-set", kind: "voice", engine: "ai-toolkit", steps: 100, step: 100, tracks: 10, started: 1, ended: 2, checkpoints: [{ file: "zz-aitk_000000100.safetensors", step: 100, epoch: 10 }], options: Object.assign({}, opts, { engine: "ai-toolkit" }) },
    { name: "zz-live", status: "running", dataset: "zz-set", kind: "voice", engine: "ruach", steps: 100, step: 50, tracks: 10, started: Date.now() / 1000 - 60, checkpoints: [{ file: "zz-live_000000040.safetensors", step: 40, epoch: 4 }], options: opts }];
  const md = ["# Ruach Studio · The Guide", "", "Songs.", "", "## Start Here", "", "### What This Is", "", "A studio.", "", "## LoRA Trainer", "", "### 3 Train", "", "Words. ".repeat(900), "",
    "### The Music Half's Three Knobs", "", "Every step teaches the two halves apart.", "", "Words. ".repeat(900)].join(NL);
  window.fetch = (u, o) => { u = String(u);
    if (u.startsWith("/lab/train/datasets")) return json({ raw: [], prepared: [{ name: "zz-set", tracks: 2016 }], runs, gpus: [], own: {}, aitk_ready: true });
    if (u.startsWith("/lab/train/trash")) return json({ trash: [] });
    if (u.startsWith("/lab/train/run") && o && o.method === "POST") { posted.push(JSON.parse(o.body)); return json({ ok: true }); }
    if (u.startsWith("/lab/guide/")) return Promise.resolve(new Response(md, { status: 200 }));
    return real(u, o); };
  document.querySelector('.topbar [data-tab="train"]').click(); window.HeresyTrain.reload();
  await until(() => document.querySelector('#trRunList [data-menu="zz-done"]'), 5000);
  const o = {};
  const rk = document.getElementById("tr_rank"); rk.value = "32"; rk.dispatchEvent(new Event("input", { bubbles: true })); await wait(50);
  o.head32 = rk.dataset.tipHead; o.line = !!document.getElementById("trRankSay"); o.rankTip = rk.dataset.tip;
  rk.value = "128"; rk.dispatchEvent(new Event("input", { bubbles: true })); await wait(50); o.head128 = rk.dataset.tipHead;
  rk.value = "16"; rk.dispatchEvent(new Event("input", { bubbles: true }));
  const tipOf = (id) => document.getElementById(id).closest("label").dataset.tip;
  o.tips = [tipOf("tr_ar_loss_weight"), tipOf("tr_ar_kl_weight"), tipOf("tr_ar_lr_multiplier")];
  o.stepsMax = document.getElementById("tr_epochs").max;   // HERESY 1410: epochs
  window.dispatchEvent(new Event("ruach-lang"));     // the guide read again: an earlier check left its own short guide in it
  document.getElementById("trArHow").click();
  const g = await until(() => { const b = document.querySelector(".hg-back:not([hidden]) .hg-body"); const h = b && b.querySelector("#hg-the-music-half-s-three-knobs"); return h ? { b, h } : null; }, 4000);
  await wait(150);
  o.guide = g ? { tab: (document.querySelector(".hg-tabs [aria-selected=true]") || {}).textContent, near: Math.abs(g.h.getBoundingClientRect().top - g.b.getBoundingClientRect().top) < 40, title: g.h.textContent } : null;
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await wait(150);
  const items = async (name) => { document.querySelector('#trRunList [data-menu="' + name + '"]').click(); await wait(80);
    const m = document.querySelector(".tr-menu"), out = m ? [...m.querySelectorAll("[data-act]")].map((b) => b.dataset.act) : [];
    if (m) m.remove(); return out; };
  o.menuAitk = await items("zz-aitk"); o.menuLive = await items("zz-live");
  document.querySelector('#trRunList [data-menu="zz-done"]').click(); await wait(80);
  o.menuDone = [...document.querySelectorAll(".tr-menu [data-act]")].map((b) => b.dataset.act + ":" + b.textContent);
  document.querySelector('.tr-menu [data-act="goon"]').click();
  const d = await until(() => document.querySelector(".hd-back.is-on:not(.is-leaving)"));
  o.ask = d ? ((d.querySelector(".hd-title") || {}).textContent || "") + " / " + ((d.querySelector(".hd-body") || {}).textContent || "") : null;
  o.asked = d && d.querySelector(".hd-input") && d.querySelector(".hd-input").value;
  if (d) d.querySelector(".hd-yes").click();
  await until(() => posted.length, 3000); await wait(200);
  o.posted = posted.slice();
  window.fetch = real;
  keys.forEach((k, i) => { if (was[i] === null) localStorage.removeItem(k); else localStorage.setItem(k, was[i]); });
  document.querySelector('.topbar [data-tab="create"]').click();
  await wait(300);
  return o; })()`);
check("the rank's share and size are the first line of its tip («2 % of what it adapts · 59 MB a half»; 128: «for large many-voice sets»), no line under the field",
  tr00.head32 === "2 % of what it adapts · 59 MB a half" && /for large many-voice sets$/.test(tr00.head128 || "") && !tr00.line && !/line below/.test(tr00.rankTip), JSON.stringify(tr00));
check("  the AR knobs' tips as measured: whether the music half learns and against the anchor, the anchor a share of the weight, the speed its throttle; Steps takes 24 192 and more",
  /^Whether the music half learns/.test(tr00.tips[0]) && /anchor's share of it, not its size/.test(tr00.tips[0]) && /a share of the AR weight/.test(tr00.tips[1]) &&
  /Nothing at AR weight 0/.test(tr00.tips[1]) && /faster or slower/.test(tr00.tips[2]) && +tr00.stepsMax >= 1000, JSON.stringify({ tips: tr00.tips, max: tr00.stepsMax }));
check("  «How they work ›» opens the guide on the LoRA Trainer at «The Music Half's Three Knobs»",
  !!tr00.guide && tr00.guide.tab === "LoRA Trainer" && tr00.guide.near && tr00.guide.title === "The Music Half's Three Knobs", JSON.stringify(tr00.guide));
check("  a finished run of the studio's trainer offers «Go on to more epochs…» (not AI-Toolkit's, not a live one); asked with 4 more, it sends the same run, set and knobs for 8 epochs",
  tr00.menuDone.some((x) => x === "goon:Go on to more epochs…") && tr00.menuAitk.indexOf("goon") < 0 && tr00.menuLive.indexOf("goon") < 0 &&
  /Go on with zz-done to how many epochs in all\?/.test(tr00.ask || "") && /It has 4 now/.test(tr00.ask || "") && tr00.asked === "8" && tr00.posted.length === 1 &&
  tr00.posted[0].name === "zz-done" && tr00.posted[0].dataset === "zz-set" && tr00.posted[0].steps === 16128 && tr00.posted[0].engine === "ruach" && tr00.posted[0].rank === 16 &&
  tr00.posted[0].ar_kl_weight === 0.3 && tr00.posted[0].note === "his voice", JSON.stringify({ menu: tr00.menuDone, aitk: tr00.menuAitk, live: tr00.menuLive, ask: tr00.ask, asked: tr00.asked, posted: tr00.posted }));

// HERESY 1169 · 1301 (Viktor 10.10.2026: «фрейм Server Log сделаем более адаптовным. SVG иконка в левой позиции со стрелкой вправо, в
// правой - влево. Перемещение фрейма в другую сторону страницы, и запоминание позиции для определённой комнаты»)
section("the server log's dock: an arrow to the other side on its inner edge, the side kept for each room");
const sd01 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const was = localStorage.getItem("yue2.logDockSide"), tabWas = document.body.dataset.tab;
  localStorage.removeItem("yue2.logDockSide");
  const go = async (tab) => { document.querySelector('.topbar [data-tab="' + tab + '"]').click(); await wait(250); };
  const dock = document.getElementById("logDock"), btn = document.getElementById("logDockSide");
  const look = () => { const d = dock.getBoundingClientRect(), b = btn.getBoundingClientRect(), t = document.getElementById("logDockTab").getBoundingClientRect();
    return { left: dock.classList.contains("is-left"), x: Math.round(d.left), r: Math.round(innerWidth - d.right), face: (btn.querySelector(".ui-ico") || {}).getAttribute ? btn.querySelector(".ui-ico").getAttribute("class") : "",
      tip: btn.dataset.tip, inner: dock.classList.contains("is-left") ? b.left > t.right - 1 : b.right < t.left + 1, shown: getComputedStyle(btn).display !== "none" }; };
  const o = {};
  await go("create"); o.create = look();
  btn.click(); await wait(150); o.createLeft = look(); o.kept = localStorage.getItem("yue2.logDockSide");
  await go("write"); o.write = look();
  await go("create"); o.createBack = look();
  await go("artist"); o.artist = look();
  btn.click(); await wait(150); o.artistRight = look(); o.kept2 = localStorage.getItem("yue2.logDockSide");
  await go("create");
  btn.click(); await wait(150); o.createRight = look();
  document.body.dataset.frame = "compose"; window.dispatchEvent(new Event("resize")); await wait(250);
  o.frame = { left: dock.classList.contains("is-left"), shown: getComputedStyle(btn).display !== "none" };
  delete document.body.dataset.frame; window.dispatchEvent(new Event("resize")); await wait(250);
  if (was === null) localStorage.removeItem("yue2.logDockSide"); else localStorage.setItem("yue2.logDockSide", was);
  await go(tabWas || "create");
  return o; })()`);
check("on the right by default: an arrow to the left on its inner (left) edge; a click takes it to the left, the arrow now right on its inner (right) edge, kept for the Creator",
  !sd01.create.left && sd01.create.r === 16 && /ui-to-left/.test(sd01.create.face) && sd01.create.inner && /to the left side/.test(sd01.create.tip) &&
  sd01.createLeft.left && sd01.createLeft.x === 16 && /ui-to-right/.test(sd01.createLeft.face) && sd01.createLeft.inner && /to the right side/.test(sd01.createLeft.tip) &&
  sd01.kept === '{"create":"left"}', JSON.stringify({ create: sd01.create, createLeft: sd01.createLeft, kept: sd01.kept }));
check("  each room its own side: the Writer still right, the Creator left again when back; the Artist left by default, right when asked, both kept",
  !sd01.write.left && sd01.createBack.left && sd01.artist.left && !sd01.artistRight.left && sd01.kept2 === '{"create":"left","artist":"right"}' && !sd01.createRight.left,
  JSON.stringify({ write: sd01.write.left, back: sd01.createBack.left, artist: sd01.artist.left, artistRight: sd01.artistRight.left, kept2: sd01.kept2 }));
check("  a lifted frame still puts the log left (1240), its button hidden meanwhile", sd01.frame.left && !sd01.frame.shown, JSON.stringify(sd01.frame));

// HERESY 1169 · 1302 (Viktor 10.10.2026: «Для FETCH нужен статус/прогресс загрузки… его нужно найти глазами»)
section("Engine → Models and LoRAs: a fetch's progress at the row pressed");
const fp02 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), real = window.fetch;
  const until = async (fn, ms) => { for (let i = 0; i < (ms || 3000) / 50; i++) { const v = fn(); if (v) return v; await wait(50); } return null; };
  const json = (b) => Promise.resolve(new Response(JSON.stringify(b), { headers: { "Content-Type": "application/json" } }));
  const now = Math.round(Date.now() / 1000);
  const last = { mode: "check", at: now - 60, counts: { here: 1, unknown: 0, differs: 0, fetched: 0, missing: 1, failed: 0 }, parts: [
    { part: "loras", label: "LoRAs: the Kit's library and Ruach Studio's own", size: "2.3 GB",
      rows: [{ state: "here", text: "loras/ (the Kit's library)" }, { state: "missing", text: "loras/duduk-yt-r16/duduk-yt-r16-e200.safetensors, 56 MB" }] }] };
  const extras = [{ name: "backbone", label: "Backbone", what: "M-A-P's YuE2 as GGUF", restart: true, variants: [
      { id: "BF16", size: "7.2 GB", here: false }, { id: "Q8_0", size: "3.8 GB", here: true }] },
    { name: "trainer", label: "LoRA trainer's base", what: "Comfy-Org/YuE2", variants: [{ id: "bf16", size: "10.3 GB", here: false }] }];
  let job = null;
  window.fetch = (u, o) => { u = String(u);
    if (u.startsWith("/lab/weights")) return json({ script: true, last, extras, parts: {}, job, now });
    return real(u, o); };
  const base = { kind: "fetch", status: "running", started: now - 30, ended: null, rc: null, counts: null, restart: false, lines: ["fetching…"] };
  document.getElementById("engineToggle").click();
  await until(() => document.querySelectorAll("#wtParts .wt-part").length === 1);
  const o = {};
  const look = (sel) => { const el = document.querySelector(sel); if (!el) return null; const bar = el.querySelector(".wt-prog"), say = el.querySelector(".wt-prog-say");
    return { bar: bar ? (bar.classList.contains("is-open") ? "open" : bar.querySelector("i").style.width) : null, say: say ? say.textContent : null,
      btn: [...el.querySelectorAll("button")].map((b) => b.textContent + (b.disabled ? "(off)" : "")).join("|") }; };
  job = Object.assign({}, base, { what: "the backbone BF16", which: { extra: "backbone", variant: "BF16" }, expect: 7.2e9, written: 3.6e9 });
  await window.HeresyWeights.load(); o.extra = look('#wtExtras .wt-extra[data-extra="backbone"]'); o.extraPick = document.querySelector('#wtExtras select[data-wt-pick="backbone"]').value;
  o.otherRows = document.querySelectorAll("#wtParts .wt-prog").length + document.querySelectorAll('#wtExtras .wt-extra[data-extra="trainer"] .wt-prog').length;
  job = Object.assign({}, base, { what: "the LoRAs", which: { part: "loras" }, expect: 2.3e9, written: 1.15e9 });
  await window.HeresyWeights.load(); o.part = look('#wtParts .wt-part[data-part="loras"]'); o.partGoing = document.querySelector('#wtParts .wt-part[data-part="loras"]').classList.contains("is-going");
  job = Object.assign({}, base, { what: "what is missing", which: { part: "missing" }, expect: null, written: 5e8 });
  await window.HeresyWeights.load(); o.top = look("#wtProg"); o.topShown = !document.getElementById("wtProg").hidden; o.all = document.getElementById("wtFetch").textContent;
  job = Object.assign({}, base, { status: "done", ended: now, rc: 0, counts: { here: 3, unknown: 0, differs: 0, fetched: 1, missing: 0, failed: 0 }, what: "what is missing", which: { part: "missing" } });
  await window.HeresyWeights.load(); o.after = { top: !document.getElementById("wtProg").hidden, bars: document.querySelectorAll("#modelsCard .wt-prog").length, all: document.getElementById("wtFetch").textContent };
  window.fetch = real;
  document.getElementById("engineToggle").click();
  await until(() => document.getElementById("view-engine").classList.contains("is-hidden"));
  await wait(200);
  return o; })()`);
check("an extra being fetched: its button says Fetching…, its variant stays picked, a bar under its row half full with «3.6 GB of about 7.2 GB · 30 s · 50 %»; no other row has one",
  !!fp02.extra && fp02.extra.btn === "Fetching…(off)" && fp02.extra.bar === "50%" && fp02.extra.say === "Fetching… 3.6 GB of about 7.2 GB · 30 s · 50 %" && fp02.extraPick === "BF16" && fp02.otherRows === 0,
  JSON.stringify({ extra: fp02.extra, pick: fp02.extraPick, others: fp02.otherRows }));
check("  a part being fetched: the same at its own row, the row lit; «what is missing» under the card's first line, striped (its size is no one number), its button Fetching…; gone when the run is over",
  !!fp02.part && fp02.partGoing && fp02.part.bar === "50%" && /^Fetching… 1\.1 GB of about 2\.3 GB · 30 s · 50 %$/.test(fp02.part.say || "") &&
  fp02.topShown && fp02.top.bar === "open" && /^Fetching… 500 MB · 30 s$/.test(fp02.top.say || "") && fp02.all === "Fetching…" &&
  !fp02.after.top && fp02.after.bars === 0 && fp02.after.all === "Fetch what is missing", JSON.stringify({ part: fp02.part, top: fp02.top, all: fp02.all, after: fp02.after }));

// HERESY 1169 · 1304 (Viktor 10.10.2026: «Давай допишем при самом старте новой Студии сканирование устройств и выбор оптимальных
// настроек для YuE2 BF16/кванта и для модели генерации обложек»)
section("the machine scanned: what suits it offered in one window, set at a word; asked once, never by itself in a test browser");
const ms04 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), real = window.fetch, posted = [];
  const until = async (fn, ms) => { for (let i = 0; i < (ms || 3000) / 50; i++) { const v = fn(); if (v) return v; await wait(50); } return null; };
  const json = (b) => Promise.resolve(new Response(JSON.stringify(b), { headers: { "Content-Type": "application/json" } }));
  const keys = ["yue2.machineScan", "yue2.artPainter", "yue2.memPreset"], was = keys.map((k) => localStorage.getItem(k));
  const o = { atBoot: !!document.querySelector(".hd-back.is-on:not(.is-leaving)"), keptAtBoot: localStorage.getItem("yue2.machineScan") };
  let machine = null;
  window.fetch = (u, opts) => { u = String(u);
    if (u.startsWith("/lab/machine")) return json(machine);
    if (u === "/settings" && opts && opts.method === "POST") posted.push(JSON.parse(opts.body));
    return real(u, opts); };
  const answer = async (yes) => { const d = await until(() => document.querySelector(".hd-back.is-on:not(.is-leaving)"));
    const text = d ? ((d.querySelector(".hd-title") || {}).textContent || "") + " / " + ((d.querySelector(".hd-body") || {}).textContent || "") : null;
    const btns = d ? [...d.querySelectorAll(".hd-acts button, .hd-yes, .hd-no")].map((b) => b.textContent) : [];
    if (d) d.querySelector(yes ? ".hd-yes" : ".hd-no").click(); return { text, btns }; };
  // a laptop: a 16 GB Quadro RTX 5000 (Turing, compute 7.5: no BF16 tensor cores), Krea 2 Muse Q4 here
  machine = { cards: [{ index: 0, name: "Quadro RTX 5000", total_mb: 16384, compute: "7.5", limit_mb: null, bf16_cores: false }], studio: 0, room_mb: 16384,
              painter: { suggest: "krea2-q4", ready: { "krea2-q4": true, "krea2-q8": false, sdxl: false }, fits: ["krea2-q4", "sdxl"] } };
  let p = window.ruachMachineScan(true); o.laptop = await answer(true); await p; await wait(300);
  o.laptopPosted = posted.slice(); o.painter = localStorage.getItem("yue2.artPainter"); o.kept = JSON.parse(localStorage.getItem("yue2.machineScan") || "null");
  o.preset = localStorage.getItem("yue2.memPreset"); o.toasts = [...document.querySelectorAll("#toasts .toast")].map((t) => t.textContent).filter((t) => /^Set for this machine/.test(t));
  // an Ampere card of 12 GB with its BF16: offered, «Not now» sets nothing
  posted.length = 0;
  machine = { cards: [{ index: 0, name: "NVIDIA GeForce RTX 3060", total_mb: 12288, compute: "8.6", limit_mb: null, bf16_cores: true }], studio: 0, room_mb: 12288,
              painter: { suggest: "", ready: {}, fits: [] } };
  p = window.ruachMachineScan(true); o.ampere = await answer(false); await p; await wait(200);
  o.amperePosted = posted.slice(); o.kept2 = JSON.parse(localStorage.getItem("yue2.machineScan") || "null");
  // no card at all
  machine = { cards: [], error: "nvidia-smi did not answer: [Errno 2] No such file or directory: 'nvidia-smi'" };
  await window.ruachMachineScan(true); await wait(200);
  o.none = [...document.querySelectorAll("#toasts .toast")].map((t) => t.textContent).filter((t) => /cards could not be read/.test(t)).length;
  o.scanBtn = !!document.getElementById("scanMachine") && document.getElementById("scanMachine").textContent;
  window.fetch = real;
  if (o.laptopPosted.length) await real("/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "BF16" }) });
  keys.forEach((k, i) => { if (was[i] === null) localStorage.removeItem(k); else localStorage.setItem(k, was[i]); });
  await wait(200);
  return o; })()`);
check("a test browser is not asked at its start; Engine → Compute has «Scan the machine»",
  !ms04.atBoot && ms04.keptAtBoot === null && ms04.scanBtn === "Scan the machine", JSON.stringify({ atBoot: ms04.atBoot, kept: ms04.keptAtBoot, btn: ms04.scanBtn }));
check("  a 16 GB Turing laptop: its card said, Q8_0 offered (no BF16 tensor cores), the whole context with tiles of 512, Krea 2 Muse Q4; «Set them» sets the backbone, Auto and the painter, kept once",
  /GPU0 · Quadro RTX 5000 · 16\.0 GB \(compute 7\.5\)/.test(ms04.laptop.text || "") && /the backbone Q8_0: compute 7\.5 has no BF16 tensor cores/.test(ms04.laptop.text || "") &&
  /the whole context, VAE tiles 512 \(Auto for 16\.0 GB\)/.test(ms04.laptop.text || "") && /artwork: Krea 2 Muse Q4 \(12\.6 GB at its peak\)/.test(ms04.laptop.text || "") &&
  ms04.laptop.btns.indexOf("Set them") >= 0 && ms04.laptop.btns.indexOf("Not now") >= 0 && ms04.laptopPosted.length === 1 && ms04.laptopPosted[0].model === "Q8_0" &&
  ms04.painter === "krea2-q4" && ms04.preset === "auto" && !!ms04.kept && ms04.kept.set === true && ms04.kept.model === "Q8_0" && ms04.toasts.length === 1,
  JSON.stringify({ laptop: ms04.laptop, posted: ms04.laptopPosted, painter: ms04.painter, preset: ms04.preset, kept: ms04.kept, toasts: ms04.toasts }));
check("  a 12 GB Ampere card: BF16 with a context of 16 384 offered, no painter fits said; «Not now» sends nothing and is kept; no cards: said",
  /the backbone BF16(?![:\w])/.test(ms04.ampere.text || "") && /context 16,384 rows, VAE tiles 512 \(Auto for 12\.0 GB\)/.test(ms04.ampere.text || "") &&
  /no painter fits on this machine yet/.test(ms04.ampere.text || "") && ms04.amperePosted.length === 0 && !!ms04.kept2 && ms04.kept2.set === false && ms04.none === 1,
  JSON.stringify({ ampere: ms04.ampere, posted: ms04.amperePosted, kept2: ms04.kept2, none: ms04.none }));

// HERESY 1169 · 1305 (Viktor 10.10.2026: «Артиста по модели InvokeAI постарайся на максимум вывести со всем возможным ахуем»)
section("the Artist: a reference picture to paint from (pasted, chosen, the stage's), its strength kept, sent with Draw and Again");
const rf05 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), real = window.fetch, sent = [];
  const until = async (fn, ms) => { for (let i = 0; i < (ms || 3000) / 50; i++) { const v = fn(); if (v) return v; await wait(50); } return null; };
  const json = (b, s) => Promise.resolve(new Response(JSON.stringify(b), { status: s || 200, headers: { "Content-Type": "application/json" } }));
  const keys = ["yue2.arPrompt", "yue2.arShapes", "yue2.arRefStr"], was = keys.map((k) => localStorage.getItem(k));
  const now = Date.now() / 1000;
  const runs = [{ id: "20261010-050000-abcd", prompt: "a stone church", shapes: ["1:1"], seed: 7, count: 1, painter: "krea2-q4", created: now - 60, status: "done", of: 1,
    ref: "ref.png", strength: 0.76, ref_from: "a picture of one's own", took: 30,
    pictures: [{ n: 1, shape: "1:1", seed: 7, w: 1280, h: 1280, kept: true, file: "01-1x1-s7.png", thumb: "thumbs/01-1x1-s7.jpg", ref: 0.76 }] }];
  window.fetch = (u, o) => { u = String(u);
    if (u.startsWith("/lab/artist/runs")) return json({ runs });
    if (u.startsWith("/lab/artist/draw")) { const b = JSON.parse(o.body); sent.push(b);
      return json({ id: "20261010-050100-beef", prompt: b.prompt, shapes: b.shapes, seed: 9, count: 1, painter: "krea2-q4", created: now, status: "done", of: 1, pictures: [] }); }   // done at once: the room would show a queued run on its stage, and Draw be Stop
    if (u.startsWith("/lab/artist/file")) return Promise.resolve(new Response(new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" })));
    return real(u, o); };
  document.querySelector('.topbar [data-tab="artist"]').click();
  await until(() => document.getElementById("arRef") && !document.getElementById("view-artist").classList.contains("is-hidden"), 4000);
  await wait(400);
  const o = { empty: !document.getElementById("arRefEmpty").hidden && document.getElementById("arRefOn").hidden };
  const prompt = document.getElementById("arPrompt"); o.promptWas = prompt.value; prompt.value = "two puppets by a fire, oils"; prompt.dispatchEvent(new Event("input", { bubbles: true }));
  // a pasted picture: a 1×1 PNG
  const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
  const dt = new DataTransfer(); dt.items.add(new File([png], "pasted.png", { type: "image/png" }));
  document.getElementById("arPrompt").dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  await until(() => window.HeresyArtistRef.get(), 3000);
  const r1 = window.HeresyArtistRef.get();
  o.pasted = r1 ? { name: r1.name, data: /^data:image\\/png;base64,/.test(r1.data || "") } : null;
  o.on = !document.getElementById("arRefOn").hidden && /^data:image\\/png/.test(document.getElementById("arRefImg").src);
  const s = document.getElementById("arRefStr"); s.value = "0.75"; s.dispatchEvent(new Event("input", { bubbles: true }));
  o.say = document.getElementById("arRefSay").textContent; o.kept = localStorage.getItem("yue2.arRefStr");
  document.getElementById("arDraw").click();
  await until(() => sent.length >= 1, 3000); await wait(300);
  o.first = sent[0] ? { ref: typeof sent[0].ref === "string" && /^data:image\\/png;base64,/.test(sent[0].ref), strength: sent[0].strength, prompt: sent[0].prompt } : null;
  // a wrong file is refused aloud
  window.HeresyArtistRef.fromFile(new File(["x"], "notes.txt", { type: "text/plain" })); await wait(150);
  o.refused = [...document.querySelectorAll("#toasts .toast")].some((t) => /A reference is a PNG, JPEG or WebP picture/.test(t.textContent));
  // ✕: from the noise again; Draw sends no reference
  document.getElementById("arRefX").click(); await wait(100);
  o.cleared = !window.HeresyArtistRef.get() && !document.getElementById("arRefEmpty").hidden;
  // the stage's picture «As reference», then Draw sends the run and the picture
  window.HeresyArtistRef.set({ id: runs[0].id, file: runs[0].pictures[0].file, url: "/lab/artist/file?id=" + runs[0].id + "&file=thumbs/01-1x1-s7.jpg" }, true);
  const stageBtn = document.querySelector('#arStage [data-stage="ref"]');
  o.stageBtn = !!stageBtn && stageBtn.textContent;
  await until(() => !document.getElementById("arDraw").disabled, 3000);
  document.getElementById("arDraw").click();
  await until(() => sent.length >= 2, 3000); await wait(300);
  o.second = sent[1] ? { ref: sent[1].ref, strength: sent[1].strength } : null;
  // «Again» on a run painted from a reference sends its own
  window.HeresyArtistRef.set(null, true);
  const lookWas = (document.querySelector("#arBar [data-look].is-on") || {}).dataset;
  const runsLook = document.querySelector('#arBar [data-look="runs"]'); if (runsLook) { runsLook.click(); await wait(200); }   // the run cards, not the gallery
  const again = await until(() => document.querySelector('#arRuns .ar-run[data-id="' + runs[0].id + '"] [data-act="again"]:not([disabled])'), 3000);
  if (again) again.click();
  await until(() => sent.length >= 3, 3000); await wait(200);
  o.third = sent[2] ? { ref: sent[2].ref, strength: sent[2].strength } : null;
  o.meta = (document.querySelector("#arStage .ar-stage-meta") || {}).textContent || "";
  if (lookWas && lookWas.look && lookWas.look !== "runs") { const b0 = document.querySelector('#arBar [data-look="' + lookWas.look + '"]'); if (b0) b0.click(); }
  window.fetch = real;
  keys.forEach((k, i) => { if (was[i] === null) localStorage.removeItem(k); else localStorage.setItem(k, was[i]); });
  prompt.value = o.promptWas; prompt.dispatchEvent(new Event("input", { bubbles: true }));
  document.querySelector('.topbar [data-tab="create"]').click();
  await wait(300);
  return o; })()`);
check("a picture pasted in the room becomes the reference (its place shows it); the strength's label follows and is kept; Draw sends the picture and the strength",
  rf05.empty && !!rf05.pasted && rf05.pasted.name === "pasted.png" && rf05.pasted.data && rf05.on && rf05.say === "0.75" && rf05.kept === "0.75" &&
  !!rf05.first && rf05.first.ref && rf05.first.strength === 0.75, JSON.stringify(rf05));
check("  a file that is not a picture is refused aloud; ✕ paints from the noise again",
  rf05.refused && rf05.cleared, JSON.stringify({ refused: rf05.refused, cleared: rf05.cleared }));
check("  the stage offers «As reference»; a picture of a run sent as its run and file; «Again» on a run painted from one sends its own and its strength; the stage says «from a reference · 0.76»",
  rf05.stageBtn === "As reference" && !!rf05.second && rf05.second.ref && rf05.second.ref.id === "20261010-050000-abcd" && rf05.second.ref.file === "01-1x1-s7.png" &&
  !!rf05.third && rf05.third.ref && rf05.third.ref.file === "ref.png" && rf05.third.strength === 0.76 && /from a reference · 0\.76/.test(rf05.meta),
  JSON.stringify({ stageBtn: rf05.stageBtn, second: rf05.second, third: rf05.third, meta: rf05.meta }));

// HERESY 1169 · 1306 (Viktor 10.10.2026: «Артиста по модели InvokeAI постарайся на максимум вывести со всем возможным ахуем»)
section("the Artist: a mask on the reference (inpaint): painted over the page, kept, sent with Draw, the run's own with Again");
const mk06 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), real = window.fetch, sent = [];
  const until = async (fn, ms) => { for (let i = 0; i < (ms || 3000) / 50; i++) { const v = fn(); if (v) return v; await wait(50); } return null; };
  const json = (b, s) => Promise.resolve(new Response(JSON.stringify(b), { status: s || 200, headers: { "Content-Type": "application/json" } }));
  const keys = ["yue2.arPrompt", "yue2.arBrush"], was = keys.map((k) => localStorage.getItem(k));
  const now = Date.now() / 1000;
  const runs = [{ id: "20261010-051000-cafe", prompt: "a window", shapes: ["1:1"], seed: 3, count: 1, painter: "krea2-q4", created: now - 30, status: "done", of: 1,
    ref: "ref.png", mask: "mask.png", masked: true, strength: 1.0, took: 40,
    pictures: [{ n: 1, shape: "1:1", seed: 3, w: 1280, h: 1280, kept: true, file: "01-1x1-s3.png", thumb: "thumbs/01-1x1-s3.jpg", ref: 1.0, masked: true }] }];
  window.fetch = (u, o) => { u = String(u);
    if (u.startsWith("/lab/artist/runs")) return json({ runs });
    if (u.startsWith("/lab/artist/draw")) { const b = JSON.parse(o.body); sent.push(b);
      return json({ id: "20261010-051100-f00d", prompt: b.prompt, shapes: b.shapes, seed: 5, count: 1, painter: "krea2-q4", created: now, status: "done", of: 1, pictures: [] }); }
    return real(u, o); };
  document.querySelector('.topbar [data-tab="artist"]').click();
  await until(() => !document.getElementById("view-artist").classList.contains("is-hidden"), 4000); await wait(400);
  const prompt = document.getElementById("arPrompt"), promptWas = prompt.value; prompt.value = "a stained glass window"; prompt.dispatchEvent(new Event("input", { bubbles: true }));
  const c = document.createElement("canvas"); c.width = 256; c.height = 256; const x = c.getContext("2d"); x.fillStyle = "#3a6"; x.fillRect(0, 0, 256, 256);
  window.HeresyArtistRef.set({ data: c.toDataURL("image/png"), name: "green.png" }, true);
  const o = { btn0: document.getElementById("arMaskOpen").textContent };
  document.getElementById("arMaskOpen").click();
  const ed = await until(() => document.querySelector(".ar-mask") && window.HeresyArtistRef.editor(), 3000);
  const cv = document.querySelector(".ar-mask .ar-mk-paint");
  o.editor = !!ed && { w: cv.width, h: cv.height, tools: [...document.querySelectorAll(".ar-mask [data-mk]")].map((b) => b.dataset.mk).join() };
  if (ed) { ed.paint(cv.width / 2, cv.height / 2, 30); document.querySelector('.ar-mask [data-mk="done"]').click(); }
  await wait(300);
  const m = window.HeresyArtistRef.mask();
  o.mask = m ? { png: /^data:image\\/png;base64,/.test(m.data), view: !!m.view } : null;
  o.btn1 = document.getElementById("arMaskOpen").textContent; o.thumb = !document.getElementById("arRefMask").hidden; o.closed = !document.querySelector(".ar-mask");
  // the mask at the picture's own size: white in its middle, black at its corner
  if (m) { const im = new Image(); await new Promise((ok) => { im.onload = ok; im.src = m.data; });
    const t = document.createElement("canvas"); t.width = im.width; t.height = im.height; const tx = t.getContext("2d"); tx.drawImage(im, 0, 0);
    o.size = [im.width, im.height]; o.mid = tx.getImageData(128, 128, 1, 1).data[0]; o.corner = tx.getImageData(2, 2, 1, 1).data[0]; }
  document.getElementById("arDraw").click();
  await until(() => sent.length >= 1, 3000); await wait(200);
  o.sent = sent[0] ? { ref: /^data:image\\/png/.test(sent[0].ref || ""), mask: /^data:image\\/png/.test(sent[0].mask || "") } : null;
  // the editor again: the kept mask is back in red; «No mask» drops it
  document.getElementById("arMaskOpen").click();
  await until(() => document.querySelector(".ar-mask"), 3000); await wait(400);
  const cv2 = document.querySelector(".ar-mask .ar-mk-paint");
  o.back = cv2 ? cv2.getContext("2d").getImageData(cv2.width / 2, cv2.height / 2, 1, 1).data[3] > 0 : null;
  document.querySelector('.ar-mask [data-mk="none"]').click(); await wait(200);
  o.dropped = !window.HeresyArtistRef.mask() && document.getElementById("arMaskOpen").textContent === "Mask…";
  // a new reference drops a mask: painted again, then another picture
  document.getElementById("arMaskOpen").click(); const ed2 = await until(() => document.querySelector(".ar-mask") && window.HeresyArtistRef.editor(), 3000);
  if (ed2) { ed2.paint(40, 40, 20); document.querySelector('.ar-mask [data-mk="done"]').click(); }
  await wait(200);
  const had = !!window.HeresyArtistRef.mask();
  window.HeresyArtistRef.set({ data: c.toDataURL("image/png"), name: "again.png" }, true);
  o.newRef = had && !window.HeresyArtistRef.mask();
  // «Again» on a masked run sends the run's own mask
  window.HeresyArtistRef.set(null, true);
  const runsLook = document.querySelector('#arBar [data-look="runs"]'); if (runsLook) { runsLook.click(); await wait(200); }
  const again = await until(() => document.querySelector('#arRuns .ar-run[data-id="' + runs[0].id + '"] [data-act="again"]:not([disabled])'), 3000);
  if (again) again.click();
  await until(() => sent.length >= 2, 3000); await wait(200);
  o.again = sent[1] ? { ref: sent[1].ref, mask: sent[1].mask } : null;
  o.meta = (document.querySelector("#arStage .ar-stage-meta") || {}).textContent || "";
  window.fetch = real;
  keys.forEach((k, i) => { if (was[i] === null) localStorage.removeItem(k); else localStorage.setItem(k, was[i]); });
  prompt.value = promptWas; prompt.dispatchEvent(new Event("input", { bubbles: true }));
  document.querySelector('.topbar [data-tab="create"]').click();
  await wait(300);
  return o; })()`);
check("«Mask…» opens the picture over the page (Paint, Erase, the brush, Invert, Clear, No mask, Done); a stroke and Done keep a PNG at the picture's own size, white where painted, the button «Mask ✓», the thumbnail red",
  mk06.btn0 === "Mask…" && !!mk06.editor && /paint,erase,invert,clear,none,done/.test(mk06.editor.tools) && !!mk06.mask && mk06.mask.png && mk06.btn1 === "Mask ✓" && mk06.thumb && mk06.closed &&
  JSON.stringify(mk06.size) === "[256,256]" && mk06.mid === 255 && mk06.corner === 0, JSON.stringify(mk06));
check("  Draw sends the picture and its mask; the editor shows the kept mask again, «No mask» drops it; a new reference drops a mask",
  !!mk06.sent && mk06.sent.ref && mk06.sent.mask && mk06.back === true && mk06.dropped && mk06.newRef, JSON.stringify({ sent: mk06.sent, back: mk06.back, dropped: mk06.dropped, newRef: mk06.newRef }));
check("  «Again» on a masked run sends the run's own picture and mask; the stage says «masked»",
  !!mk06.again && mk06.again.ref && mk06.again.ref.file === "ref.png" && mk06.again.mask && mk06.again.mask.file === "mask.png" && mk06.again.mask.id === "20261010-051000-cafe" &&
  /from a reference · 1\.00 · masked/.test(mk06.meta), JSON.stringify({ again: mk06.again, meta: mk06.meta }));

// HERESY 1169 · 1307 (Viktor 10.10.2026: «Артиста по модели InvokeAI постарайся на максимум вывести со всем возможным ахуем»)
section("the Artist: «Paint around it» (outpaint): the strength gives way, Draw and Again send it, the stage says so");
const fp07 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), real = window.fetch, sent = [];
  const until = async (fn, ms) => { for (let i = 0; i < (ms || 3000) / 50; i++) { const v = fn(); if (v) return v; await wait(50); } return null; };
  const json = (b) => Promise.resolve(new Response(JSON.stringify(b), { headers: { "Content-Type": "application/json" } }));
  const now = Date.now() / 1000;
  const runs = [{ id: "20261010-052000-0a0b", prompt: "a cabin", shapes: ["16:9"], seed: 11, count: 1, painter: "krea2-q4", created: now - 30, status: "done", of: 1,
    ref: "ref.jpg", strength: 1.0, fit: true, took: 48,
    pictures: [{ n: 1, shape: "16:9", seed: 11, w: 1920, h: 1080, kept: true, file: "01-16x9-s11.png", thumb: "thumbs/01-16x9-s11.jpg", ref: 1.0, fit: true }] }];
  window.fetch = (u, o) => { u = String(u);
    if (u.startsWith("/lab/artist/runs")) return json({ runs });
    if (u.startsWith("/lab/artist/draw")) { const b = JSON.parse(o.body); sent.push(b);
      return json({ id: "20261010-052100-0c0d", prompt: b.prompt, shapes: b.shapes, seed: 12, count: 1, painter: "krea2-q4", created: now, status: "done", of: 1, pictures: [] }); }
    return real(u, o); };
  document.querySelector('.topbar [data-tab="artist"]').click();
  await until(() => !document.getElementById("view-artist").classList.contains("is-hidden"), 4000); await wait(400);
  const prompt = document.getElementById("arPrompt"), promptWas = prompt.value; prompt.value = "a cabin around them"; prompt.dispatchEvent(new Event("input", { bubbles: true }));
  const c = document.createElement("canvas"); c.width = 64; c.height = 64; c.getContext("2d").fillRect(0, 0, 64, 64);
  window.HeresyArtistRef.set({ data: c.toDataURL("image/png"), name: "black.png" }, true);
  const fit = document.getElementById("arRefFit");
  const o = { say0: document.getElementById("arRefSay").textContent };
  fit.click(); await wait(100);
  o.say1 = document.getElementById("arRefSay").textContent; o.cls = document.getElementById("arRef").classList.contains("is-fit");
  document.getElementById("arDraw").click();
  await until(() => sent.length >= 1, 3000); await wait(200);
  o.first = sent[0] ? { fit: sent[0].fit, ref: !!sent[0].ref } : null;
  fit.click(); await wait(100);
  o.say2 = document.getElementById("arRefSay").textContent;
  window.HeresyArtistRef.set(null, true);
  const runsLook = document.querySelector('#arBar [data-look="runs"]'); if (runsLook) { runsLook.click(); await wait(200); }
  const again = await until(() => document.querySelector('#arRuns .ar-run[data-id="' + runs[0].id + '"] [data-act="again"]:not([disabled])'), 3000);
  if (again) again.click();
  await until(() => sent.length >= 2, 3000); await wait(200);
  o.again = sent[1] ? { fit: sent[1].fit, ref: sent[1].ref } : null;
  o.meta = (document.querySelector("#arStage .ar-stage-meta") || {}).textContent || "";
  window.fetch = real;
  prompt.value = promptWas; prompt.dispatchEvent(new Event("input", { bubbles: true }));
  document.querySelector('.topbar [data-tab="create"]').click();
  await wait(300);
  return o; })()`);
check("«Paint around it»: the strength's label gives way («the edges painted anew») and comes back; Draw sends it; «Again» on a run painted around sends it again; the stage says «painted around»",
  /^\d\.\d\d$/.test(fp07.say0) && fp07.say1 === "the edges painted anew" && fp07.cls && !!fp07.first && fp07.first.fit === true && fp07.first.ref && /^\d\.\d\d$/.test(fp07.say2) &&
  !!fp07.again && fp07.again.fit === true && fp07.again.ref && fp07.again.ref.file === "ref.jpg" && /from a reference · painted around/.test(fp07.meta), JSON.stringify(fp07));

// HERESY 1169 · 1308 (Viktor 10.10.2026: «Артиста по модели InvokeAI постарайся на максимум вывести со всем возможным ахуем»)
section("the Artist: two pictures compared under one divider, or side by side, swapped; Esc while picking gives up");
const cp08 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), real = window.fetch;
  const until = async (fn, ms) => { for (let i = 0; i < (ms || 3000) / 50; i++) { const v = fn(); if (v) return v; await wait(50); } return null; };
  const json = (b) => Promise.resolve(new Response(JSON.stringify(b), { headers: { "Content-Type": "application/json" } }));
  const now = Date.now() / 1000;
  const pic = (n, seed) => ({ n, shape: "1:1", seed, w: 1280, h: 1280, kept: true, file: "0" + n + "-1x1-s" + seed + ".png", thumb: "thumbs/0" + n + "-1x1-s" + seed + ".jpg" });
  const runs = [{ id: "20261010-053000-1111", prompt: "a harbour", shapes: ["1:1"], seed: 21, count: 2, painter: "krea2-q4", created: now - 20, status: "done", of: 2, took: 70,
    pictures: [pic(1, 21), pic(2, 22)] }];
  window.fetch = (u, o) => { u = String(u);
    if (u.startsWith("/lab/artist/runs")) return json({ runs });
    if (u.startsWith("/lab/artist/file")) return Promise.resolve(new Response(new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" })));
    return real(u, o); };
  const key = (k, shift) => document.dispatchEvent(new KeyboardEvent("keydown", { key: k, shiftKey: !!shift, bubbles: true, cancelable: true }));
  document.querySelector('.topbar [data-tab="artist"]').click();
  await until(() => !document.getElementById("view-artist").classList.contains("is-hidden"), 4000); await wait(300);
  const runsLook = document.querySelector('#arBar [data-look="runs"]'); if (runsLook) { runsLook.click(); await wait(300); }
  const thumb = (i) => document.querySelector('#arRuns .ar-run[data-id="' + runs[0].id + '"] .ar-pic[data-i="' + i + '"] .ar-thumb');
  await until(() => thumb(0), 3000);
  thumb(0).click(); await wait(200);
  const o = {};
  const cmpBtn = await until(() => document.querySelector('#arStage [data-stage="compare"]'), 3000);
  o.btn = cmpBtn && cmpBtn.textContent;
  if (cmpBtn) cmpBtn.click(); await wait(100);
  o.picking = window.HeresyArtistRef.picking() && document.body.classList.contains("ar-cmp-picking");
  key("Escape"); await wait(100);
  o.gaveUp = !window.HeresyArtistRef.picking() && !document.body.classList.contains("ar-cmp-picking");
  document.querySelector('#arStage [data-stage="compare"]').click(); await wait(100);
  thumb(1).click();
  const c = await until(() => document.querySelector(".ar-cmp") && window.HeresyArtistRef.compare(), 3000);
  o.open = !!c;
  if (c) {
    o.imgs = [...document.querySelectorAll(".ar-cmp img")].map((i) => decodeURIComponent(i.src).split("file=")[1]);
    o.labs = [...document.querySelectorAll(".ar-cmp-lab")].map((l) => l.textContent.split(" · ").slice(0, 3).join(" · "));
    o.x0 = c.x(); o.clip0 = document.querySelector(".ar-cmp-b").style.clipPath;
    key("ArrowLeft"); o.x1 = +c.x().toFixed(2); key("ArrowRight", true); o.x2 = +c.x().toFixed(2);
    key("s"); await wait(50); o.side = c.side() && document.querySelector(".ar-cmp").classList.contains("is-side");
    key("x"); await wait(50); o.swapped = document.querySelector(".ar-cmp-lab.is-a").textContent.indexOf("seed 22") >= 0;
    key("Escape"); await wait(100);
    o.closed = !document.querySelector(".ar-cmp");
  }
  window.fetch = real;
  document.querySelector('.topbar [data-tab="create"]').click();
  await wait(300);
  return o; })()`);
check("the stage's «Compare…» waits for the other picture (Esc gives up); picked, the two lie under a divider at the middle, B clipped, labelled A and B with shape and seed",
  cp08.btn === "Compare…" && cp08.picking && cp08.gaveUp && cp08.open && JSON.stringify(cp08.imgs) === '["01-1x1-s21.png","02-1x1-s22.png"]' &&
  cp08.labs[0] === "A · 1:1 · seed 21" && cp08.labs[1] === "B · 1:1 · seed 22" && cp08.x0 === 0.5 && /inset\(0(px)? 0(px)? 0(px)? 50%\)/.test(cp08.clip0), JSON.stringify(cp08));
check("  ← moves the divider by a fiftieth, Shift+→ by a tenth; S lays them side by side, X swaps them, Esc closes",
  cp08.x1 === 0.48 && cp08.x2 === 0.58 && cp08.side && cp08.swapped && cp08.closed, JSON.stringify({ x1: cp08.x1, x2: cp08.x2, side: cp08.side, swapped: cp08.swapped, closed: cp08.closed }));

// HERESY 1169 · 1309 (Viktor 10.10.2026: «Артиста по модели InvokeAI постарайся на максимум вывести со всем возможным ахуем»)
section("the Artist: the take's cover as the reference at a click (hidden without one)");
const tk09 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), real = window.fetch;
  const until = async (fn, ms) => { for (let i = 0; i < (ms || 3000) / 50; i++) { const v = fn(); if (v) return v; await wait(50); } return null; };
  const c = document.createElement("canvas"); c.width = 32; c.height = 32; c.getContext("2d").fillRect(0, 0, 32, 32);
  const jpg = await new Promise((ok) => c.toBlob(ok, "image/jpeg"));
  let arts = {};
  window.fetch = (u, o) => { u = String(u);
    if (u.startsWith("/lab/arts")) return Promise.resolve(new Response(JSON.stringify({ arts, unseen: [], credits: {} }), { headers: { "Content-Type": "application/json" } }));
    if (u.startsWith("/lab/art?name=zz-take-1309")) return Promise.resolve(new Response(jpg, { headers: { "Content-Type": "image/jpeg" } }));
    return real(u, o); };
  document.querySelector('.topbar [data-tab="artist"]').click();
  await until(() => !document.getElementById("view-artist").classList.contains("is-hidden"), 4000); await wait(300);
  window.HeresyArtistRef.set(null, true);
  const btn = document.getElementById("arRefTake");
  window.HeresyArtist.setTake({ name: "zz-take-1309", label: "Zz take" }); await wait(100);
  const o = { noCover: btn.hidden && getComputedStyle(btn).display === "none" };
  arts = { "zz-take-1309": 7 }; await window.HeresyArt.refresh(); window.HeresyArtist.setTake({ name: "zz-take-1309", label: "Zz take" }); await wait(100);
  o.shown = !btn.hidden && getComputedStyle(btn).display !== "none" && btn.textContent;
  btn.click();
  await until(() => window.HeresyArtistRef.get(), 3000);
  const r = window.HeresyArtistRef.get();
  o.ref = r ? { name: r.name, data: /^data:image\\/jpeg;base64,/.test(r.data || "") } : null;
  window.HeresyArtistRef.set(null, true);
  arts = {}; await window.HeresyArt.refresh(); window.HeresyArtist.setTake(null);
  window.fetch = real;
  document.querySelector('.topbar [data-tab="create"]').click();
  await wait(300);
  return o; })()`);
check("no cover: no button; a take with a cover: «The take's cover», and a click makes it the reference (its name, the picture read)",
  tk09.noCover && tk09.shown === "The take's cover" && !!tk09.ref && tk09.ref.name === "Zz take.jpg" && tk09.ref.data, JSON.stringify(tk09));

// HERESY 1169 · 1310 (Viktor's list for the Artist, 08.10.2026: «a trash list in the room»)
section("the Artist's library: a Trash look with each trashed run's pictures and Restore");
const tr10 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), real = window.fetch, restored = [];
  const until = async (fn, ms) => { for (let i = 0; i < (ms || 3000) / 50; i++) { const v = fn(); if (v) return v; await wait(50); } return null; };
  const json = (b, s) => Promise.resolve(new Response(JSON.stringify(b), { status: s || 200, headers: { "Content-Type": "application/json" } }));
  const now = Date.now() / 1000;
  const gone = { id: "20261009-201000-dead", prompt: "a red violin on snow", shapes: ["1:1"], seed: 5, count: 1, painter: "krea2-q4", created: now - 86400, status: "done", of: 1,
    pictures: [{ n: 1, shape: "1:1", seed: 5, w: 1280, h: 1280, kept: true, file: "01-1x1-s5.png", thumb: "thumbs/01-1x1-s5.jpg" }] };
  let runs = [], trash = [gone];
  window.fetch = (u, o) => { u = String(u);
    if (u.startsWith("/lab/artist/runs")) return json({ runs });
    if (u.startsWith("/lab/artist/trashed")) return json({ runs: trash });
    if (u.startsWith("/lab/artist/restore")) { const b = JSON.parse(o.body); restored.push(b.id); runs = [gone]; trash = []; return json({ restored: b.id }); }
    if (u.startsWith("/lab/artist/file")) return Promise.resolve(new Response(new Blob([new Uint8Array([255, 216, 255])], { type: "image/jpeg" })));
    return real(u, o); };
  const lookWas = localStorage.getItem("yue2.arLook");
  document.querySelector('.topbar [data-tab="artist"]').click();
  await until(() => !document.getElementById("view-artist").classList.contains("is-hidden"), 4000); await wait(300);
  await window.HeresyArtist.reload(); await wait(200);
  const tb = document.querySelector('#arBar [data-look="trash"]');
  const o = { btn: tb && tb.textContent };
  tb.click();
  const row = await until(() => document.querySelector('#arRuns .ar-trun[data-tid="' + gone.id + '"]'), 3000);
  o.row = row ? { text: row.querySelector(".ar-trun-head").textContent, img: (row.querySelector("img") || {}).getAttribute ? row.querySelector("img").getAttribute("src") : "", total: document.getElementById("arTotal").textContent } : null;
  o.kept = localStorage.getItem("yue2.arLook");
  row.querySelector("[data-restore]").click();
  await until(() => restored.length, 3000); await wait(400);
  o.restored = restored.slice(); o.after = document.getElementById("arRuns").textContent;
  document.querySelector('#arBar [data-look="runs"]').click(); await wait(200);
  o.backInRuns = !!document.querySelector('#arRuns .ar-run[data-id="' + gone.id + '"]');
  window.fetch = real;
  if (lookWas === null) localStorage.removeItem("yue2.arLook"); else localStorage.setItem("yue2.arLook", lookWas);
  await window.HeresyArtist.reload();
  document.querySelector('.topbar [data-tab="create"]').click();
  await wait(300);
  return o; })()`);
check("Trash beside Runs and Gallery lists each trashed run (when, painter, its pictures small from the trash, its prompt); the look is not kept; Restore brings it back among the runs",
  tr10.btn === "Trash" && !!tr10.row && /1 picture/.test(tr10.row.text) && /a red violin on snow/.test(tr10.row.text) && /&trash=1$/.test(tr10.row.img) && /1 run in the trash/.test(tr10.row.total) &&
  tr10.kept !== "trash" && JSON.stringify(tr10.restored) === '["20261009-201000-dead"]' && /The trash is empty/.test(tr10.after) && tr10.backInRuns, JSON.stringify(tr10));

// HERESY 1169 · 1311 (TODO's «A/B in one window: the original and each version of a take switched while the music plays on at the same
// second, the disliked hidden (SUNO's Remaster: Original | #4 | #1)»)
section("the Refiner's Compare all: the take's family (the same music in other takes) beside its files, the disliked left out");
const fm11 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms) => { for (let i = 0; i < (ms || 3000) / 50; i++) { const v = await fn(); if (v) return v; await wait(50); } return null; };
  const lib = (await (await fetch("/library")).json()).takes || [];
  const base = lib.filter((t) => !t.parent)[0];
  const o = { base: base && base.name };
  if (!base) return o;
  const post = (body) => fetch("/synth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
  const make = async (title) => { const j = await post({ title, style: "test", lyrics: "[Verse]\\nla", parent: base.name, duration: 6, output_format: "wav16" });
    const st = await until(async () => { const s = await (await fetch("/job?id=" + j.id)).json(); return s.status === "done" ? s : null; }, 20000);
    return st && (st.takes || [])[0]; };
  const kid = await make("zz family 1311"), bad = await make("zz family 1311 disliked");
  o.made = [kid, bad];
  await window.ruachRefreshLibrary(); await wait(300);
  const HC = window.HeresyCollection, rating = HC.rating;
  HC.rating = (n) => (n === bad ? -1 : rating(n));          // the second disliked, as the Librarian would say it (no rating sent)
  const fam = window.ruachFamily(base.name);
  HC.rating = rating;
  o.family = fam.map((t) => t.name);
  o.group = (fam[0] || {}).group || "";
  o.url = (fam[0] || {}).url || "";
  return o; })()`);
check("a take's family for Compare all: the take made from it is there with its listening address and «The same music», the disliked one left out",
  !!fm11.base && fm11.made && fm11.made[0] && fm11.family.indexOf(fm11.made[0]) >= 0 && fm11.family.indexOf(fm11.made[1]) < 0 && fm11.family.indexOf(fm11.base) < 0 &&
  /^The same music/.test(fm11.group) && /^\/library\/listen\?name=/.test(fm11.url), JSON.stringify(fm11));

// HERESY 1169 · 1312 (Viktor's screenshot 10.10.2026: the buttons under the Artist's picture fell under the player on his 2K)
section("the Artist's stage: the picture leaves room for its lines and buttons over the player");
const was12 = await ev(`[innerWidth, innerHeight]`), fit12 = {};
for (const [w12, h12] of [[2557, 1353], [1920, 1080]]) {
  await send("Emulation.setDeviceMetricsOverride", { width: w12, height: h12, deviceScaleFactor: 1, mobile: false });
  fit12[w12 + "x" + h12] = await ev(`(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms)), real = window.fetch, now = Date.now() / 1000;
    const until = async (fn, ms) => { for (let i = 0; i < (ms || 3000) / 50; i++) { const v = fn(); if (v) return v; await wait(50); } return null; };
    const prompt = "A wooden puppet boy in an old workshop scratches his long sharp wooden nose; a painted hearth with a burning fire hangs on the wall behind him.\\nThe old carver sits by the canvas, his nose has torn the canvas through and the fire shows in the hole, warm light on the planks.\\nA caption painted across the bottom of the picture in big letters, the room lit only by the fire.";
    const runs = [{ id: "20261010-020200-1312", prompt, shapes: ["1:1"], seed: 163278463, count: 1, painter: "krea2-q8", created: now - 20, status: "done", of: 1, took: 63, gpu: 1,
      pictures: [{ n: 1, shape: "1:1", seed: 163278463, w: 1280, h: 1280, kept: true, file: "01-1x1-s163278463.png", thumb: "01-1x1-s163278463.png" }] }];
    window.fetch = (u, o) => { u = String(u);
      if (u.startsWith("/lab/artist/runs")) return Promise.resolve(new Response(JSON.stringify({ runs }), { headers: { "Content-Type": "application/json" } }));
      return real(u, o); };
    const lookWas = localStorage.getItem("yue2.arLook");
    document.querySelector('.topbar [data-tab="artist"]').click();
    await until(() => !document.getElementById("view-artist").classList.contains("is-hidden"), 4000); await wait(300);
    await window.HeresyArtist.reload(); await wait(200);
    const lk = document.querySelector('#arBar [data-look="runs"]'); if (lk) { lk.click(); await wait(200); }
    const th = await until(() => document.querySelector('#arRuns .ar-pic[data-i="0"] .ar-thumb'), 3000);
    if (th) th.click();
    await until(() => document.querySelector("#arStage .ar-stage-acts"), 3000); await wait(300);
    const box = document.getElementById("arStage"), acts = box.querySelector(".ar-stage-acts"), pic = box.querySelector(".ar-stage-pic"), bar = document.getElementById("playbar");
    const o = { acts: acts ? Math.round(acts.getBoundingClientRect().bottom) : null, bar: Math.round(bar.getBoundingClientRect().top),
      pic: pic ? Math.round(pic.getBoundingClientRect().height) : 0, picW: pic ? Math.round(pic.getBoundingClientRect().width) : 0, stageW: Math.round(box.getBoundingClientRect().width) };
    window.fetch = real;
    if (lookWas === null) localStorage.removeItem("yue2.arLook"); else localStorage.setItem("yue2.arLook", lookWas);
    await window.HeresyArtist.reload();
    document.querySelector('.topbar [data-tab="create"]').click();
    await wait(300);
    return o; })()`);
}
await send("Emulation.setDeviceMetricsOverride", { width: was12[0], height: was12[1], deviceScaleFactor: 1, mobile: false });
check("2557×1353 and 1920×1080 with a three-line prompt: the row under the picture (To the form, As reference, Compare…) ends over the player; the picture no wider than the stage",
  Object.values(fit12).every((m) => m.acts !== null && m.acts <= m.bar && m.pic >= 240 && m.picW <= m.stageW), JSON.stringify(fit12));

// HERESY 1169 · 1314 (Viktor 10.10.2026: «♂ и ♀ сделай как svg — текстовые снова дают проблему со сдвигом»)
section("the Trainer's male and female drawn (mars, venus), not the text signs; centred in their chips");
const sx14 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), real = window.fetch;
  const until = async (fn, ms) => { for (let i = 0; i < (ms || 3000) / 50; i++) { const v = fn(); if (v) return v; await wait(50); } return null; };
  const json = (b) => Promise.resolve(new Response(JSON.stringify(b), { headers: { "Content-Type": "application/json" } }));
  const was = Object.keys(localStorage).filter((k) => /^yue2\\.tr/.test(k)).map((k) => [k, localStorage.getItem(k)]);
  const voice = { median_hz: 117, voice: "male", register: "baritenor", mode: "speech", p10_hz: 92, p90_hz: 151, mid: "A#2" };
  window.fetch = (u, o) => { u = String(u);
    if (u.startsWith("/lab/train/datasets")) return json({ raw: [{ name: "zz-raw-1314", tracks: 12, bytes: 1.2e8, voice }],
      prepared: [{ name: "zz-set-1314", tracks: 12, seconds: 600, from: "zz-raw-1314", made: "2026-10-10" }], runs: [], gpus: [], own: {}, aitk_ready: false });
    if (u.startsWith("/lab/train/trash")) return json({ trash: [] });
    return real(u, o); };
  document.querySelector('.topbar [data-tab="train"]').click(); window.HeresyTrain.reload();
  const row = await until(() => document.querySelector('#trRaw [data-raw="zz-raw-1314"]'), 5000);
  const o = { rowIco: !!(row && row.querySelector("svg.ui-mars.tr-sex")), setIco: !!document.querySelector("#trSets svg.ui-mars.tr-sex") };
  if (row) row.click();
  const male = await until(() => document.querySelector('#trVoice [data-voice-sex="male"]'), 3000), female = document.querySelector('#trVoice [data-voice-sex="female"]');
  const mid = (el) => { const b = el.getBoundingClientRect(); return b.top + b.height / 2; };
  o.chips = male && female ? { male: !!male.querySelector("svg.ui-mars"), female: !!female.querySelector("svg.ui-venus"), label: male.getAttribute("aria-label"),
    off: Math.round(Math.abs(mid(male.querySelector("svg")) - mid(male)) * 10) / 10 } : null;
  o.signs = /[\\u2640\\u2642]/.test(document.getElementById("view-train").textContent);
  window.fetch = real;
  Object.keys(localStorage).filter((k) => /^yue2\\.tr/.test(k)).forEach((k) => localStorage.removeItem(k));
  was.forEach(([k, v]) => localStorage.setItem(k, v));
  window.HeresyTrain.reload();
  document.querySelector('.topbar [data-tab="create"]').click();
  await wait(300);
  return o; })()`);
check("the folder and the set made from it show the measured voice with mars drawn; the voice's chips are mars and venus drawn (named for the ear), centred; no ♂ ♀ text left in the room",
  sx14.rowIco && sx14.setIco && !!sx14.chips && sx14.chips.male && sx14.chips.female && sx14.chips.label === "male" && sx14.chips.off <= 1.5 && !sx14.signs, JSON.stringify(sx14));

// HERESY 1169 · 1315 (Viktor 10.10.2026, on Buratino: «секуционка очень скудная на волне»; «в красивом попапе текст данной секции»)
section("the wave's sections from the lyrics' tags placed by ear, and the card with the section's words under the pointer");
const ear15 = await ev(`(() => {
  const lyrics = "[Intro]\\n[Verse 1]\\nFirst line here\\nSecond line here\\n[Instrumental Break]\\n[Chorus]\\nSing it loud\\nSing it again\\n(echo)\\n[Verse 2]\\nA line unheard\\nAnother unheard\\n[Chorus]\\nSing it loud\\nSing it again\\n[Outro]\\nNever sung one\\nNever sung two";
  const row = (text, start, end, guessed) => ({ text, start, end, guessed: !!guessed, heard: guessed ? 0 : 1 });
  const rows = [row("First line here", 10, 13), row("Second line here", 13, 16), row("Sing it loud", 24, 26), row("Sing it again", 26, 29),
    row("A line unheard", 29, 33, true), row("Another unheard", 33, 37, true), row("Sing it loud", 37, 39), row("Sing it again", 39, 42),
    row("Never sung one", 42, 44, true), row("Never sung two", 44, 46, true)];
  const s = window.ruachEarSections(lyrics, rows);
  return { got: s.map((x) => x.name + "@" + x.t + (x.unheard ? "?" : "")).join(","), lines: s[1] && s[1].lines.join("|"), rows: s[1] && s[1].rows.map((r) => r.k).join(""),
    parts: window.ruachLyricParts(lyrics).length };
})()`);
const ear15b = await ev(`(() => {
  const row = (text, start, end, guessed) => ({ text, start, end, guessed: !!guessed });
  const s = window.ruachEarSections("[Intro]\\n[Verse 1]\\nOpen guessed\\nHeard one\\nHeard two", [row("Open guessed", 0, 8, true), row("Heard one", 20, 23), row("Heard two", 23, 26)]);
  return s.map((x) => x.name + "@" + x.t).join(","); })()`);
check("a section whose first line was only guessed begins at its first line heard less the median heard line for each guessed one before it (not at 0:00 over the intro)",
  ear15b === "Intro@0,Verse 1@17", ear15b);
check("the lyrics' own sections, each where its first line is heard; the instrumental between where the verse ends and the chorus begins; a section all guessed in the middle kept and marked; the unsung end (all guessed after the last line heard) left out",
  ear15.got === "Intro@0,Verse 1@10,Instrumental Break@16,Chorus@24,Verse 2@29?,Chorus@37" && ear15.lines === "First line here|Second line here" && ear15.rows === "01" && ear15.parts === 7, JSON.stringify(ear15));
await ev(`(() => { const a = document.getElementById("audio"); a.pause(); a.muted = true; document.querySelector('#tabs [data-tab="create"]').click();
  if (!document.getElementById("playbarTitle").textContent || document.getElementById("playbarTitle").textContent === "Nothing loaded") {
    const c = [...document.querySelectorAll("#libList .take[data-name]:not(.is-running-row)")].find((x) => !/nachtzug/.test(x.dataset.name)); if (c) c.click(); }
  return true; })()`);
await waitFor(`isFinite(document.getElementById("audio").duration) && document.getElementById("audio").duration > 0.2`, 6000, 100);
const pop15 = await ev(`(() => {
  const a = document.getElementById("audio"), w = document.getElementById("wave"), d = a.duration;
  window.ruachWaveSections([{ t: 0, name: "Intro", lines: [], rows: [] },
    { t: d * 0.4, name: "Chorus", lines: ["Sing it loud", "Sing it again"], rows: [{ k: 0, start: d * 0.4, end: d * 0.55 }, { k: 1, start: d * 0.55, end: d * 0.7 }] }], true);
  const r = w.getBoundingClientRect();
  return { x: Math.round(r.left + r.width * 0.5), y: Math.round(r.top + r.height / 2), top: Math.round(r.top) }; })()`);
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: pop15.x, y: pop15.y });
await sleep(150);
const pop15b = await ev(`(() => { const p = document.querySelector(".wave-pop"); if (!p) return null; const b = p.getBoundingClientRect();
  return { shown: !p.hidden, head: p.querySelector(".wave-pop-head").textContent, lines: [...p.querySelectorAll(".wave-pop-lines p")].map((x) => x.textContent).join("|"),
    now: (p.querySelector(".wave-pop-lines p.is-now") || {}).textContent || "", bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right) }; })()`);
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: pop15.x, y: pop15.top - 120 });
await sleep(150);
const pop15c = await ev(`(() => { const p = document.querySelector(".wave-pop"); const o = { hidden: !p || p.hidden }; window.ruachWaveSections([], true); return o; })()`);
check("the pointer over the wave in a section: a card above the wave with its name, its time and its lines as written, the line sung under the pointer lit; it goes when the pointer leaves",
  !!pop15b && pop15b.shown && /^Chorus/.test(pop15b.head) && pop15b.lines === "Sing it loud|Sing it again" && pop15b.now === "Sing it loud" && pop15b.bottom <= pop15.top - 4 &&
  pop15b.left >= 0 && pop15c.hidden, JSON.stringify({ pop15, pop15b, pop15c }));

// HERESY 1169 · 1317 (Viktor 10.10.2026: «Блок проявления картинки зафиксируй также вертикально»; «оверхол нужен нам только в аудио комнатах»)
section("the Artist's stage keeps its frame from the queue to the picture; the wave's card only in the rooms of sound");
const st17 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), real = window.fetch, now = Date.now() / 1000;
  const until = async (fn, ms) => { for (let i = 0; i < (ms || 3000) / 50; i++) { const v = fn(); if (v) return v; await wait(50); } return null; };
  const base = { id: "20261010-130000-1317", prompt: "a long prompt that wraps\\nover two lines in the stage's data, the way a real one does when it is written out", shapes: ["1:1"], seed: 7, count: 1, painter: "krea2-q4", created: now - 30, of: 1 };
  const states = [dict({ status: "queued", pictures: [] }), dict({ status: "queued", waiting: "a card with room", pictures: [] }), dict({ status: "running", pictures: [] }),
    dict({ status: "running", pictures: [], live: { live: 1, step: 3, of: 8, file: "preview/01.jpg" } }),
    dict({ status: "done", pictures: [{ n: 1, shape: "1:1", seed: 7, w: 1280, h: 1280, kept: true, file: "01-1x1-s7.png", thumb: "thumbs/01-1x1-s7.jpg" }] })];
  function dict(x) { return Object.assign({}, base, x); }
  let runs = [states[0]];
  window.fetch = (u, o) => { u = String(u);
    if (u.startsWith("/lab/artist/runs")) return Promise.resolve(new Response(JSON.stringify({ runs }), { headers: { "Content-Type": "application/json" } }));
    return real(u, o); };
  document.querySelector('.topbar [data-tab="artist"]').click();
  await until(() => !document.getElementById("view-artist").classList.contains("is-hidden"), 4000); await wait(300);
  const o = { h: [], w: [] };
  for (const s of states) {
    runs = [s]; await window.HeresyArtist.reload(); await wait(250);
    const pic = document.querySelector("#arStage .ar-stage-pic"), b = pic ? pic.getBoundingClientRect() : null;
    o.h.push(b ? Math.round(b.height) : 0); o.w.push(b ? Math.round(b.width) : 0);
  }
  window.fetch = real;
  await window.HeresyArtist.reload();
  const w = document.getElementById("wave"), r = w.getBoundingClientRect();
  o.wave = { x: Math.round(r.left + r.width * 0.5), y: Math.round(r.top + r.height / 2) };
  return o; })()`);
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: st17.wave.x, y: st17.wave.y });
await sleep(150);
const st17b = await ev(`(async () => { const p = document.querySelector(".wave-pop"); const o = { hidden: !p || p.hidden };
  document.querySelector('.topbar [data-tab="create"]').click(); await new Promise((r) => setTimeout(r, 300)); return o; })()`);
check("waiting in the queue, waiting for a card, painting before its first step, at a step, and the picture done: the same frame each time (height and width within a pixel)",
  st17.h.length === 5 && st17.h.every((h) => h > 200 && Math.abs(h - st17.h[0]) <= 1) && st17.w.every((w) => Math.abs(w - st17.w[0]) <= 1), JSON.stringify(st17));
check("  the pointer over the wave in the Artist shows no section card", st17b.hidden, JSON.stringify(st17b));

// HERESY 1169 · 1316 (Viktor 10.10.2026: «Положил в artwork/loras/<семейство>/»; «скан поддиректорий»; «возле адаптера лежит его картинка»; «сканирование Civitai по хешу»)
section("the Artist's adapters: the library by folders, picked with their strength, their words into the prompt, carried by Draw, looked up on Civitai");
const lo16 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), real = window.fetch, sent = [], looked = [];
  const until = async (fn, ms) => { for (let i = 0; i < (ms || 3000) / 50; i++) { const v = fn(); if (v) return v; await wait(50); } return null; };
  const json = (b, s) => Promise.resolve(new Response(JSON.stringify(b), { status: s || 200, headers: { "Content-Type": "application/json" } }));
  const A = { id: "krea2/Kul_v1.safetensors", family: "krea2", name: "Kul_v1", folder: "", mb: 112, picture: true, civitai: "known",
    info: { title: "Kul Style", version: "v1.0", base: "Krea 2", words: ["Kulstyle", "sfumato washes"], url: "https://civitai.com/models/1" } };
  const B = { id: "krea2/Styles/plain.safetensors", family: "krea2", name: "plain", folder: "Styles", mb: 218, picture: false, info: {} };
  let fams = { krea2: [A, B], sdxl: [], "qwen-image-2.1": [], "qwen-image-2512": [] };
  const pic = await new Promise((ok) => { const c = document.createElement("canvas"); c.width = c.height = 8; c.toBlob(ok, "image/jpeg"); });
  window.fetch = (u, o) => { u = String(u);
    if (u.startsWith("/lab/artist/loras")) return json({ root: "artwork/loras", families: fams, titles: { krea2: "Krea 2" } });
    if (u.startsWith("/lab/artist/lora-picture")) return Promise.resolve(new Response(pic, { headers: { "Content-Type": "image/jpeg" } }));
    if (u.startsWith("/lab/artist/lora-civitai")) { const b = JSON.parse(o.body); looked.push(b.id); return json(Object.assign({}, B, { civitai: "known", info: { title: "Plain Looked", base: "Krea 2", words: ["plainword"] } })); }
    if (u.startsWith("/lab/artist/draw")) { sent.push(JSON.parse(o.body)); return json({ id: "20261010-140000-1316", status: "queued", of: 1, pictures: [], prompt: "x", shapes: ["1:1"], seed: 1, count: 1, painter: "krea2-q4" }, 202); }
    if (u.startsWith("/lab/artist/runs")) return json({ runs: [] });
    return real(u, o); };
  const keys = ["yue2.arLoras", "yue2.arPrompt", "yue2.arPainter"], was = keys.map((k) => localStorage.getItem(k));
  localStorage.removeItem("yue2.arLoras");
  document.querySelector('.topbar [data-tab="artist"]').click();
  await until(() => !document.getElementById("view-artist").classList.contains("is-hidden"), 4000); await wait(300);
  document.getElementById("arPainter").value = "krea2-q4"; document.getElementById("arPainter").dispatchEvent(new Event("change"));
  await window.HeresyArtist.loras.reload();
  const o = { say0: document.getElementById("arLoraSay").textContent };
  document.getElementById("arLoraAdd").click();
  await until(() => document.querySelectorAll(".ar-lib-card").length === 2, 3000);
  o.folders = [...document.querySelectorAll(".ar-lib-f")].map((x) => x.textContent.replace(/\\s+/g, " ").trim());
  document.querySelector('.ar-lib-card[data-lid="' + A.id + '"]').click(); await wait(100);
  o.badge = (document.querySelector('.ar-lib-card[data-lid="' + A.id + '"] .ar-lib-n') || {}).textContent || "";
  window.HeresyArtist.loras.lib().lookUp();
  await until(() => looked.length && document.querySelector('.ar-lib-card[data-lid="' + B.id + '"] .ar-lib-cv'), 3000);
  o.looked = looked.slice(); o.lookedName = (document.querySelector('.ar-lib-card[data-lid="' + B.id + '"] .ar-lib-name') || {}).textContent || "";
  document.querySelector('.ar-lib [data-lib="close"]').click(); await wait(150);
  o.row = document.querySelector("#arLoraList .ar-lora .ar-lora-name").textContent;
  o.words = [...document.querySelectorAll("#arLoraList .ar-lora-word")].map((x) => x.textContent).join("|");
  document.getElementById("arPrompt").value = "A fox in the snow"; document.getElementById("arPrompt").dispatchEvent(new Event("input"));
  document.querySelector("#arLoraList .ar-lora-word").click(); await wait(50);
  o.prompt = document.getElementById("arPrompt").value;
  const w = document.querySelector("#arLoraList .ar-lora-w"); w.value = "0.55"; w.dispatchEvent(new Event("input", { bubbles: true })); await wait(50);
  o.weight = window.HeresyArtist.loras.now()[0].weight;
  document.querySelector('#arShapes input[value="1:1"]').checked = true; document.getElementById("arShapes").dispatchEvent(new Event("change"));
  document.getElementById("arDraw").click();
  await until(() => sent.length, 3000);
  o.body = sent[0] ? sent[0].loras : null;
  document.querySelector("#arLoraList .ar-lora-x").click(); await wait(50);
  o.after = window.HeresyArtist.loras.now().length;
  window.fetch = real;
  keys.forEach((k, i) => { if (was[i] === null) localStorage.removeItem(k); else localStorage.setItem(k, was[i]); });
  await window.HeresyArtist.reload();
  document.querySelector('.topbar [data-tab="create"]').click();
  await wait(300);
  return o; })()`);
check("the library groups the family's adapters by folder; a card picked gets its number; Look up on Civitai asks for the one not yet known and its card takes the name",
  lo16.folders.join(",") === "All 2,(the family's own folder) 1,Styles 1" && lo16.badge === "1" && JSON.stringify(lo16.looked) === '["krea2/Styles/plain.safetensors"]' &&
  lo16.lookedName === "Plain Looked", JSON.stringify(lo16));
check("  under the painter: its name and trigger words; a word goes into the prompt; the strength is kept; Draw carries the adapters with their strength; ✕ takes it off",
  lo16.row === "Kul Style" && lo16.words === "Kulstyle|sfumato washes" && lo16.prompt === "A fox in the snow, Kulstyle" && lo16.weight === 0.55 &&
  JSON.stringify(lo16.body) === '[{"id":"krea2/Kul_v1.safetensors","weight":0.55}]' && lo16.after === 0, JSON.stringify(lo16));

// HERESY 1169 · 1318 (Viktor 10.10.2026: «Подключай Qwen Image 2.1»; «мы предупреждаем пользователя»; «Забирай 2512 тоже в Студию»)
section("the Artist's painters as the lab has them: Qwen-Image 2512 with its fp8 fine-tunes, Qwen-Image 2.1 with its licence said");
const pn18 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), real = window.fetch, sent = [];
  const until = async (fn, ms) => { for (let i = 0; i < (ms || 3000) / 50; i++) { const v = fn(); if (v) return v; await wait(50); } return null; };
  const json = (b, s) => Promise.resolve(new Response(JSON.stringify(b), { status: s || 200, headers: { "Content-Type": "application/json" } }));
  const painters = [{ key: "krea2-q4", label: "Krea 2 Muse · Q4", need_mb: 12500, family: "krea2", ready: true },
    { key: "krea2-q8", label: "Krea 2 Muse · Q8", need_mb: 18500, family: "krea2", ready: false },
    { key: "qwen2512-q6", label: "Qwen-Image 2512 · Q6", need_mb: 20000, family: "qwen-image-2512", ready: true, note: "Qwen-Image 2512 (Apache-2.0) from a 6-bit GGUF", lightning: true },
    { key: "qwen2512-fp8", label: "Qwen-Image 2512 · fp8", need_mb: 22500, family: "qwen-image-2512", ready: true, models: ["A fine fp8.safetensors", "B fine fp8.safetensors"], note: "a fine-tune" },
    { key: "qwen21", label: "Qwen-Image 2.1 · research licence", need_mb: 21000, family: "qwen-image-2.1", ready: true, note: "Qwen-Image 2.1 is under the Qwen Research Licence: research and evaluation only" }];
  window.fetch = (u, o) => { u = String(u);
    if (u.startsWith("/lab/artist/painters")) return json({ painters });
    if (u.startsWith("/lab/artist/loras")) return json({ root: "artwork/loras", families: { krea2: [], "qwen-image-2512": [], "qwen-image-2.1": [], sdxl: [] }, titles: {} });
    if (u.startsWith("/lab/artist/draw")) { sent.push(JSON.parse(o.body)); return json({ id: "20261010-150000-1318", status: "queued", of: 1, pictures: [], prompt: "x", shapes: ["1:1"], seed: 1, count: 1, painter: "qwen2512-fp8", model: "B fine fp8.safetensors" }, 202); }
    if (u.startsWith("/lab/artist/runs")) return json({ runs: [] });
    return real(u, o); };
  const keys = ["yue2.arPainter", "yue2.arModel", "yue2.arPrompt", "yue2.arLoras"], was = keys.map((k) => localStorage.getItem(k));
  document.querySelector('.topbar [data-tab="artist"]').click();
  await until(() => !document.getElementById("view-artist").classList.contains("is-hidden"), 4000); await wait(300);
  await window.HeresyArtist.painters(); await wait(100);
  const sel = document.getElementById("arPainter"), o = { opts: [...sel.options].map((x) => x.value + "=" + x.textContent) };
  sel.value = "qwen2512-fp8"; sel.dispatchEvent(new Event("change")); await wait(100);
  o.model = { shown: !document.getElementById("arModelBox").hidden, opts: [...document.getElementById("arModel").options].map((x) => x.textContent) };
  document.getElementById("arModel").value = "B fine fp8.safetensors"; document.getElementById("arModel").dispatchEvent(new Event("change"));
  o.fam = document.getElementById("arLoraSay").textContent;
  document.getElementById("arPrompt").value = "A lighthouse at dawn"; document.getElementById("arPrompt").dispatchEvent(new Event("input"));
  document.querySelector('#arShapes input[value="1:1"]').checked = true; document.getElementById("arShapes").dispatchEvent(new Event("change"));
  o.cost = document.getElementById("arCost").textContent;
  document.getElementById("arDraw").click();
  await until(() => sent.length, 3000);
  o.body = sent[0] ? { painter: sent[0].painter, model: sent[0].model } : null;
  sel.value = "qwen21"; sel.dispatchEvent(new Event("change")); await wait(100);
  const note = document.getElementById("arPainterNote");
  o.note = { shown: !note.hidden, warn: note.classList.contains("is-warn"), text: note.textContent, model: !document.getElementById("arModelBox").hidden };
  window.fetch = real;
  keys.forEach((k, i) => { if (was[i] === null) localStorage.removeItem(k); else localStorage.setItem(k, was[i]); });
  await window.HeresyArtist.painters();
  await window.HeresyArtist.reload();
  document.querySelector('.topbar [data-tab="create"]').click();
  await wait(300);
  return o; })()`);
check("the choice holds the painters this machine has (Krea Q8's files missing here: not offered), each with the card it wants",
  pn18.opts.join("|") === "krea2-q4=Krea 2 Muse · Q4 (from 12.5 GB)|qwen2512-q6=Qwen-Image 2512 · Q6 (from 20 GB)|qwen2512-fp8=Qwen-Image 2512 · fp8 (from 22.5 GB)|qwen21=Qwen-Image 2.1 · research licence (from 21 GB)", JSON.stringify(pn18));
check("  fp8: its fine-tunes beside it, Draw carries the one picked; the time as Qwen paints; Qwen-Image 2.1: its licence said in the warning's colour, no fine-tune",
  pn18.model.shown && pn18.model.opts.join("|") === "A fine fp8|B fine fp8" && JSON.stringify(pn18.body) === '{"painter":"qwen2512-fp8","model":"B fine fp8.safetensors"}' &&
  /about 5 min/.test(pn18.cost) && pn18.note.shown && pn18.note.warn && /Research Licence/.test(pn18.note.text) && !pn18.note.model, JSON.stringify(pn18));

// HERESY 1169 · 1319 (Viktor 10.10.2026: «селекторы для семплеров и планировщиков, выбор количества шагов с разумным ограничением»)
section("the Artist's sampling: steps within the painter's range, Euler or Euler SDE, the schedule; 2512's Lightning and guidance; only what differs is sent");
const sm19 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), real = window.fetch, sent = [];
  const until = async (fn, ms) => { for (let i = 0; i < (ms || 3000) / 50; i++) { const v = fn(); if (v) return v; await wait(50); } return null; };
  const json = (b, s) => Promise.resolve(new Response(JSON.stringify(b), { status: s || 200, headers: { "Content-Type": "application/json" } }));
  const painters = [{ key: "krea2-q4", label: "Krea 2 Muse · Q4", need_mb: 12500, family: "krea2", ready: true },
    { key: "qwen2512-fp8", label: "Qwen-Image 2512 · fp8", need_mb: 22500, family: "qwen-image-2512", ready: true, models: ["A fine fp8.safetensors"], lightning: true, note: "a fine-tune" }];
  window.fetch = (u, o) => { u = String(u);
    if (u.startsWith("/lab/artist/painters")) return json({ painters });
    if (u.startsWith("/lab/artist/loras")) return json({ root: "artwork/loras", families: { krea2: [], "qwen-image-2512": [], "qwen-image-2.1": [], sdxl: [] }, titles: {} });
    if (u.startsWith("/lab/artist/draw")) { sent.push(JSON.parse(o.body)); return json({ id: "20261010-160000-1319-" + sent.length, status: "done", of: 1, pictures: [], prompt: "x", shapes: ["1:1"], seed: 1, count: 1, painter: "krea2-q4" }, 202); }   // done: Draw stays Draw
    if (u.startsWith("/lab/artist/runs")) return json({ runs: [] });
    return real(u, o); };
  const keys = ["yue2.arPainter", "yue2.arModel", "yue2.arPrompt", "yue2.arSampling", "yue2.arLoras"], was = keys.map((k) => localStorage.getItem(k));
  localStorage.removeItem("yue2.arSampling");
  document.querySelector('.topbar [data-tab="artist"]').click();
  await until(() => !document.getElementById("view-artist").classList.contains("is-hidden"), 4000); await wait(300);
  await window.HeresyArtist.painters(); await wait(100);
  const sel = document.getElementById("arPainter"), $ = (id) => document.getElementById(id), set = (id, v) => { $(id).value = v; $(id).dispatchEvent(new Event("change")); };
  sel.value = "krea2-q4"; sel.dispatchEvent(new Event("change")); await wait(50);
  const o = { k0: { say: $("arSampSay").textContent, lim: $("arSteps").min + "-" + $("arSteps").max, light: !$("arLightBox").hidden } };
  set("arSteps", "12"); set("arSchedule", "karras"); await wait(50);
  o.k1 = $("arSampSay").textContent;
  $("arPrompt").value = "A fox"; $("arPrompt").dispatchEvent(new Event("input"));
  document.querySelector('#arShapes input[value="1:1"]').checked = true; $("arShapes").dispatchEvent(new Event("change"));
  $("arDraw").click(); await until(() => sent.length === 1, 3000);
  o.kbody = sent[0] && sent[0].sampling;
  sel.value = "qwen2512-fp8"; sel.dispatchEvent(new Event("change")); await wait(50);
  const seen = (id) => !!$(id).offsetParent;            // HERESY 1328: as it shows, not only its [hidden]
  $("arSampling").open = true;
  o.q0 = { say: $("arSampSay").textContent, lim: $("arSteps").min + "-" + $("arSteps").max, light: seen("arLightBox"), on: $("arLightOn").checked, cfg: seen("arCfgBox") };
  $("arLightOn").checked = true; $("arLightOn").dispatchEvent(new Event("change")); await wait(50);
  o.q1 = { say: $("arSampSay").textContent, lim: $("arSteps").min + "-" + $("arSteps").max, steps: $("arSteps").value, cfg: seen("arCfgBox") };
  $("arDraw").click(); await until(() => sent.length === 2, 3000);
  o.qbody = sent[1] && sent[1].sampling;
  $("arSampReset").click(); await wait(50);
  o.reset = $("arSampSay").textContent;
  window.fetch = real;
  keys.forEach((k, i) => { if (was[i] === null) localStorage.removeItem(k); else localStorage.setItem(k, was[i]); });
  await window.HeresyArtist.painters();
  await window.HeresyArtist.reload();
  document.querySelector('.topbar [data-tab="create"]').click();
  await wait(300);
  return o; })()`);
check("Krea 2: 8 steps, Euler, Simple its own, steps 4 to 16, no Lightning; 12 steps and Karras said in the summary and sent alone",
  sm19.k0.say === "8 steps · Euler · Simple" && sm19.k0.lim === "4-16" && !sm19.k0.light && sm19.k1 === "12 steps · Euler · Karras" &&
  JSON.stringify(sm19.kbody) === '{"steps":12,"schedule":"karras"}', JSON.stringify(sm19));
check("  a 2512 fine-tune: without Lightning its own (HERESY 1328: 30 steps of 10 to 60, guidance shown, the switch off); Lightning switched on: 12 steps of 4 to 16 at 0.55, guidance gone, sent; Reset: its own again",
  sm19.q0.say === "30 steps · Euler · Simple · guidance 4" && sm19.q0.lim === "10-60" && sm19.q0.light && !sm19.q0.on && sm19.q0.cfg &&
  sm19.q1.lim === "4-16" && sm19.q1.steps === "12" && !sm19.q1.cfg && sm19.q1.say === "12 steps · Euler · Simple · Lightning 0.55" &&
  JSON.stringify(sm19.qbody) === '{"steps":12,"lightning":0.55}' && sm19.reset === "30 steps · Euler · Simple · guidance 4", JSON.stringify(sm19));

// HERESY 1169 · 1320 (Viktor 10.10.2026: «По маске не хватает добавления латентного зерна поверх непрорисовываемых частей, блюра по краям маски»)
section("the Artist's mask options: shown with a mask or Paint around it, kept, carried by Draw");
const mk20 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), real = window.fetch, sent = [];
  const until = async (fn, ms) => { for (let i = 0; i < (ms || 3000) / 50; i++) { const v = fn(); if (v) return v; await wait(50); } return null; };
  const json = (b, s) => Promise.resolve(new Response(JSON.stringify(b), { status: s || 200, headers: { "Content-Type": "application/json" } }));
  window.fetch = (u, o) => { u = String(u);
    if (u.startsWith("/lab/artist/draw")) { sent.push(JSON.parse(o.body)); return json({ id: "20261010-170000-1320-" + sent.length, status: "done", of: 1, pictures: [], prompt: "x", shapes: ["1:1"], seed: 1, count: 1, painter: "krea2-q4" }, 202); }
    if (u.startsWith("/lab/artist/runs")) return json({ runs: [] });
    return real(u, o); };
  const keys = ["yue2.arMaskOpts", "yue2.arPrompt"], was = keys.map((k) => localStorage.getItem(k));
  localStorage.removeItem("yue2.arMaskOpts");
  document.querySelector('.topbar [data-tab="artist"]').click();
  await until(() => !document.getElementById("view-artist").classList.contains("is-hidden"), 4000); await wait(300);
  const $ = (id) => document.getElementById(id), R = window.HeresyArtistRef;
  const c = document.createElement("canvas"); c.width = c.height = 16; c.getContext("2d").fillRect(0, 0, 16, 16);
  R.set({ data: c.toDataURL("image/png"), name: "ref.png" }, true); await wait(50);
  const o = { noMask: $("arMaskOpts").hidden };
  R.setMask({ data: c.toDataURL("image/png") }); await wait(50);
  o.withMask = !$("arMaskOpts").hidden;
  o.defaults = { grow: $("arMkGrow").value, edge: $("arMkEdge").value, soft: $("arMkSoft").checked, grain: $("arMkGrain").value };
  $("arMkGrow").value = "16"; $("arMkGrow").dispatchEvent(new Event("change"));
  $("arMkGrain").value = "0.2"; $("arMkGrain").dispatchEvent(new Event("change"));
  o.kept = JSON.parse(localStorage.getItem("yue2.arMaskOpts") || "null");
  $("arPrompt").value = "A cap"; $("arPrompt").dispatchEvent(new Event("input"));
  document.querySelector('#arShapes input[value="1:1"]').checked = true; $("arShapes").dispatchEvent(new Event("change"));
  $("arDraw").click(); await until(() => sent.length === 1, 3000);
  o.body = sent[0] && sent[0].mask_opts;
  R.setMask(null); await wait(50);
  o.noMaskAgain = $("arMaskOpts").hidden;
  $("arRefFit").checked = true; $("arRefFit").dispatchEvent(new Event("change")); await wait(50);
  o.withFit = !$("arMaskOpts").hidden;
  $("arRefFit").checked = false; $("arRefFit").dispatchEvent(new Event("change"));
  R.set(null, true);
  window.fetch = real;
  keys.forEach((k, i) => { if (was[i] === null) localStorage.removeItem(k); else localStorage.setItem(k, was[i]); });
  await window.HeresyArtist.reload();
  document.querySelector('.topbar [data-tab="create"]').click();
  await wait(300);
  return o; })()`);
check("no mask: no options; a mask: Grow 0, Edge 24, Soft, Grain 0.1; changed ones kept and carried by Draw; Paint around it shows them too",
  mk20.noMask && mk20.withMask && JSON.stringify(mk20.defaults) === '{"grow":"0","edge":"24","soft":true,"grain":"0.1"}' &&
  JSON.stringify(mk20.kept) === '{"grow":16,"edge":24,"soft":true,"grain":0.2}' && JSON.stringify(mk20.body) === '{"grow":16,"edge":24,"soft":true,"grain":0.2}' &&
  mk20.noMaskAgain && mk20.withFit, JSON.stringify(mk20));

// HERESY 1169 · 1321 (Viktor 10.10.2026: «SVG КВАДРАТ, горизонтальное и вертикальное расположение прямоугольника»; «звезда наша SVG»; «Удаление картинки или массива выбранных»)
section("the Artist: the shapes and the star drawn; pictures picked with Ctrl and Shift, put aside, brought back from the Trash look");
const pk21 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), real = window.fetch, asideCalls = [];
  const until = async (fn, ms) => { for (let i = 0; i < (ms || 3000) / 50; i++) { const v = fn(); if (v) return v; await wait(50); } return null; };
  const json = (b, s) => Promise.resolve(new Response(JSON.stringify(b), { status: s || 200, headers: { "Content-Type": "application/json" } }));
  const now = Date.now() / 1000, pic = (n, shape) => ({ n, shape, seed: 7 + n, w: 1280, h: 1280, kept: true, file: "0" + n + "-1x1-s" + (7 + n) + ".png", thumb: "thumbs/0" + n + "-1x1-s" + (7 + n) + ".jpg" });
  let runs = [{ id: "20261010-180000-aaaa", prompt: "four foxes", shapes: ["1:1"], seed: 8, count: 4, painter: "krea2-q4", created: now - 60, status: "done", of: 4, pictures: [pic(1), pic(2), pic(3), pic(4)] }];
  let aside = [];
  window.fetch = (u, o) => { u = String(u);
    if (u.startsWith("/lab/artist/runs")) return json({ runs: runs.map((r) => Object.assign({}, r, { pictures: r.pictures.map((p) => Object.assign({}, p, aside.indexOf(p.file) >= 0 ? { aside: true } : {})) })) });
    if (u.startsWith("/lab/artist/asides")) return json({ pictures: aside.map((f) => ({ id: runs[0].id, file: f, thumb: "thumbs/" + f.replace(".png", ".jpg"), prompt: "four foxes" })) });
    if (u.startsWith("/lab/artist/aside")) { const b = JSON.parse(o.body); asideCalls.push(b); b.items.forEach((it) => { if (b.aside) aside.push(it.file); else aside = aside.filter((f) => f !== it.file); }); return json({ aside: b.aside, done: b.items, trashed: [] }); }
    if (u.startsWith("/lab/artist/trashed")) return json({ runs: [] });
    if (u.startsWith("/lab/artist/file")) return Promise.resolve(new Response(new Blob([new Uint8Array([255, 216, 255])], { type: "image/jpeg" })));
    return real(u, o); };
  const keys = ["yue2.arLook", "yue2.arFilter"], was = keys.map((k) => localStorage.getItem(k));
  document.querySelector('.topbar [data-tab="artist"]').click();
  await until(() => !document.getElementById("view-artist").classList.contains("is-hidden"), 4000); await wait(300);
  const sh = [...document.querySelectorAll("#arShapes .ar-shape")];
  const o = { shapes: sh.map((l) => !!l.querySelector("svg.ar-shape-ico") && !/\\d/.test(l.textContent) && /\\d/.test(l.dataset.tip)) };
  document.querySelector('#arBar [data-look="gallery"]').click(); await wait(100);
  const st = document.querySelector('#arFilters [data-filter="star"]');
  o.star = !!(st && st.querySelector("svg.ar-star-ico") && !/Starred/.test(st.textContent));
  await window.HeresyArtist.reload(); await wait(200);
  const tiles = () => [...document.querySelectorAll("#arRuns .ar-gpic .ar-thumb")];
  await until(() => tiles().length === 4, 3000);
  const click = (el, mods) => el.dispatchEvent(new MouseEvent("click", Object.assign({ bubbles: true, cancelable: true }, mods)));
  click(tiles()[0], { ctrlKey: true }); click(tiles()[2], { shiftKey: true }); await wait(50);
  o.picked = document.querySelectorAll("#arRuns .ar-gpic.is-picked").length;
  o.bar = (document.getElementById("arPicked").querySelector(".ar-picked-n") || {}).textContent || "";
  document.querySelector('#arPicked [data-pick="aside"]').click();
  await until(() => asideCalls.length === 1, 3000); await wait(400);
  o.sent = asideCalls[0] && asideCalls[0].items.map((x) => x.file).join(",");
  o.left = tiles().length;
  o.barGone = document.getElementById("arPicked").hidden;
  document.querySelector('#arBar [data-look="trash"]').click();
  await until(() => document.querySelectorAll("#arRuns .ar-aside-pic").length === 3, 3000);
  o.asideShown = document.querySelectorAll("#arRuns .ar-aside-pic").length;
  document.querySelector('#arRuns [data-back-all]').click();
  await until(() => asideCalls.length === 2, 3000); await wait(300);
  o.back = asideCalls[1] && { aside: asideCalls[1].aside, n: asideCalls[1].items.length };
  document.querySelector('#arBar [data-look="runs"]').click(); await wait(100);
  window.fetch = real;
  keys.forEach((k, i) => { if (was[i] === null) localStorage.removeItem(k); else localStorage.setItem(k, was[i]); });
  await window.HeresyArtist.reload();
  document.querySelector('.topbar [data-tab="create"]').click();
  await wait(300);
  return o; })()`);
check("the shapes drawn (their sizes in the tips, no text on them), the star filter drawn without its word",
  pk21.shapes.length === 3 && pk21.shapes.every(Boolean) && pk21.star, JSON.stringify(pk21));
check("  Ctrl + click, Shift + click: three picked and said; Trash puts the three aside and the gallery keeps one; the Trash look shows them, Restore all brings them back",
  pk21.picked === 3 && /^3 /.test(pk21.bar) && pk21.sent === "01-1x1-s8.png,02-1x1-s9.png,03-1x1-s10.png" && pk21.left === 1 && pk21.barGone &&
  pk21.asideShown === 3 && pk21.back && pk21.back.aside === false && pk21.back.n === 3, JSON.stringify(pk21));

// HERESY 1169 · 1322 (Viktor 10.10.2026: «И модели апскейлеров… 637GB золота»)
section("the Artist: the stage's Upscale… opens its row (the upscalers, Nomos8kDAT first, the one picked kept), 2K makes a run of its own (1332: 2K and 4K by the long side), the stage follows it, Again upscales again");
const up22 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), real = window.fetch, calls = [];
  const until = async (fn, ms) => { for (let i = 0; i < (ms || 3000) / 50; i++) { const v = fn(); if (v) return v; await wait(50); } return null; };
  const json = (b, s) => Promise.resolve(new Response(JSON.stringify(b), { status: s || 200, headers: { "Content-Type": "application/json" } }));
  const now = Date.now() / 1000, src = { id: "20261010-190000-bbbb", file: "01-1x1-s8.png" };
  const runs = [{ id: src.id, prompt: "a fox in the snow", shapes: ["1:1"], seed: 8, count: 1, painter: "krea2-q4", created: now - 60, status: "done", of: 1,
    pictures: [{ n: 1, shape: "1:1", seed: 8, w: 1280, h: 1280, kept: true, file: src.file, thumb: "thumbs/01-1x1-s8.jpg" }] }];
  window.fetch = (u, o) => { u = String(u);
    if (u.startsWith("/lab/artist/runs")) return json({ runs: runs });
    if (u.startsWith("/lab/artist/upscalers")) return json({ upscalers: [{ name: "1x_SkinContrast.pth", scale: 1, mb: 1.2 }, { name: "4x-UltraSharpV2.safetensors", scale: 4, mb: 77.1 }, { name: "4x_Nomos8kDAT.pth", scale: 4, mb: 140.6 }] });
    if (u.startsWith("/lab/artist/upscale")) { const b = JSON.parse(o.body); calls.push(b);
      const side = { "2k": 2560, "4k": 3840 }[b.target] || 1280 * (b.factor || 2);
      const r = { id: "20261010-190100-cc0" + calls.length, kind: "upscale", prompt: "a fox in the snow", painter: "upscale", model: b.model, factor: side > 2560 ? 4 : 2, target: b.target || "", shapes: ["1:1"], seed: 8, count: 1,
        created: now + calls.length, status: "done", of: 1, upscaled_from: { id: b.id, file: b.file, painter: "krea2-q4" },
        pictures: [{ n: 1, shape: "1:1", seed: 8, w: side, h: side, kept: true, file: "01-1x1-s8-up" + (b.target || b.factor + "x") + ".png", thumb: "thumbs/01-1x1-s8-up" + (b.target || b.factor + "x") + ".jpg" }] };
      runs.unshift(r); return json(r, 202); }
    if (u.startsWith("/lab/artist/file")) return Promise.resolve(new Response(new Blob([new Uint8Array([255, 216, 255])], { type: "image/jpeg" })));
    return real(u, o); };
  const keys = ["yue2.arUpModel", "yue2.arLook", "yue2.arPainter"], was = keys.map((k) => localStorage.getItem(k));
  localStorage.removeItem("yue2.arUpModel");
  document.querySelector('.topbar [data-tab="artist"]').click();
  await until(() => !document.getElementById("view-artist").classList.contains("is-hidden"), 4000);
  document.querySelector('#arBar [data-look="runs"]').click();
  await window.HeresyArtist.reload(); await wait(300);
  const o = {};
  const btn = await until(() => document.querySelector('#arStage [data-stage="upscale"]'), 3000);
  o.button = !!btn;
  if (btn) btn.click();
  const sel = await until(() => { const s = document.getElementById("arUpModel"); return s && s.options.length === 3 ? s : null; }, 3000);
  o.first = sel && sel.value;
  if (sel) sel.value = "4x-UltraSharpV2.safetensors";
  o.tips = [...document.querySelectorAll("#arStage [data-up]")].map((b) => b.dataset.up + "=" + b.dataset.tip + (b.disabled ? "(off)" : ""));
  const x2 = document.querySelector('#arStage [data-up="2k"]');
  if (x2) x2.click();
  await until(() => calls.length === 1, 3000); await wait(300);
  o.sent = calls[0] || null;
  o.kept = localStorage.getItem("yue2.arUpModel");
  o.rowGone = !document.getElementById("arUpModel");
  o.stage = ((document.querySelector("#arStage .ar-stage-meta") || {}).textContent || "");
  const card = document.querySelector('#arRuns .ar-run[data-id="20261010-190100-cc01"]');
  o.card = card ? card.querySelector(".ar-meta").textContent : "";
  if (card) card.querySelector('[data-act="again"]').click();
  await until(() => calls.length === 2, 3000); await wait(200);
  o.again = calls[1] || null;
  const card2 = document.querySelector('#arRuns .ar-run[data-id="20261010-190100-cc01"]');
  if (card2) card2.querySelector('[data-act="form"]').click();
  await wait(100);
  o.painter = document.getElementById("arPainter").value;
  o.prompt = document.getElementById("arPrompt").value;
  window.fetch = real;
  keys.forEach((k, i) => { if (was[i] === null) localStorage.removeItem(k); else localStorage.setItem(k, was[i]); });
  document.getElementById("arPrompt").value = ""; document.getElementById("arPrompt").dispatchEvent(new Event("input", { bubbles: true }));
  await window.HeresyArtist.reload();
  document.querySelector('.topbar [data-tab="create"]').click();
  await wait(300);
  return o; })()`);
check("the stage's Upscale… opens its row: three upscalers, 4x_Nomos8kDAT picked first when none was kept",
  up22.button && up22.first === "4x_Nomos8kDAT.pth", JSON.stringify(up22));
check("  2K sends the picture, the model and the target, keeps the model; the row closes; the stage and the run say Upscale 2K and its size; the tips say the sizes",
  up22.sent && up22.sent.id === "20261010-190000-bbbb" && up22.sent.file === "01-1x1-s8.png" && up22.sent.model === "4x-UltraSharpV2.safetensors" && up22.sent.target === "2k" &&
  up22.kept === "4x-UltraSharpV2.safetensors" && up22.rowGone && /Upscale 2K/.test(up22.stage) && /4x-UltraSharpV2/.test(up22.stage) && /2560×2560/.test(up22.stage) && /Upscale 2K/.test(up22.card) &&
  up22.tips.join("|") === "2k=1280×1280 → 2560×2560|4k=1280×1280 → 3840×3840", JSON.stringify(up22));
check("  Again on the upscaled run upscales the same picture again; To the form keeps a painter of the form and brings the words",
  up22.again && up22.again.id === "20261010-190000-bbbb" && up22.again.file === "01-1x1-s8.png" && up22.again.target === "2k" && up22.painter && up22.painter !== "upscale" && up22.prompt === "a fox in the snow", JSON.stringify(up22));

// HERESY 1169 · 1323 (Viktor 10.10.2026: «Забирай 2512 тоже в Студию»; «Касательно Qwen Image 2.1 лицензии: мы предупреждаем пользователя по этому поводу»)
section("the Qwen painters: their row in Engine → Models (2512 at Q4 or Q6, 2.1 with its licence in the question); the Artist says the painters not here yet and where they come from");
const qw23 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), real = window.fetch, asked = [];
  const until = async (fn, ms) => { for (let i = 0; i < (ms || 3000) / 50; i++) { const v = fn(); if (v) return v; await wait(50); } return null; };
  const json = (b, s) => Promise.resolve(new Response(JSON.stringify(b), { status: s || 200, headers: { "Content-Type": "application/json" } }));
  const now = Date.now() / 1000;
  const extras = [{ name: "qwen", label: "Qwen painters", what: "the Artist's Qwen-Image painters", variants: [
      { id: "2512-q4", label: "Qwen-Image 2512 Q4", size: "31 GB", note: "for a card of 16 GB", here: true },
      { id: "2512-q6", label: "Qwen-Image 2512 Q6", size: "34.5 GB", note: "for a card of 24 GB", here: false },
      { id: "2.1", label: "Qwen-Image 2.1", size: "33.1 GB", note: "under Qwen's research licence: research and evaluation only, not for commercial use", here: false }] }];
  const listing = () => ({ script: true, last: null, extras, parts: {}, job: null, now });
  const painters = [{ key: "krea2-q4", label: "Krea 2 Muse · Q4", need_mb: 13500, family: "krea2", ready: true },
    { key: "qwen2512-q4", label: "Qwen-Image 2512 · Q4", need_mb: 15500, family: "qwen-image-2512", ready: false, note: "Qwen-Image 2512 (Apache-2.0) from a 4-bit GGUF" },
    { key: "qwen2512-fp8", label: "Qwen-Image 2512 · fp8", need_mb: 22500, family: "qwen-image-2512", ready: false, models: [] },
    { key: "qwen21", label: "Qwen-Image 2.1 · research licence", need_mb: 21000, family: "qwen-image-2.1", ready: false, note: "research licence" }];
  window.fetch = (u, o) => { u = String(u);
    if (u.startsWith("/lab/weights/fetch")) { asked.push(o.body); return json(listing()); }
    if (u.startsWith("/lab/weights")) return json(listing());
    if (u.startsWith("/lab/artist/painters")) return json({ painters });
    return real(u, o); };
  document.getElementById("engineToggle").click();
  const row = await until(() => document.querySelector('#wtExtras .wt-extra[data-extra="qwen"]'), 4000);
  const o = { row: !!row };
  if (row) {
    o.pick = row.querySelector("select").value;
    o.options = [...row.querySelectorAll("option")].map((x) => x.textContent);
    const s = row.querySelector("select"); s.value = "2.1"; s.dispatchEvent(new Event("change", { bubbles: true })); await wait(80);
    document.querySelector('#wtExtras [data-wt-extra="qwen"]').click();
    const d = await until(() => document.querySelector(".hd-back.is-on:not(.is-leaving)"));
    o.ask = d ? d.querySelector(".hd-title").textContent + " / " + ((d.querySelector(".hd-body") || {}).textContent || "") : null;
    if (d) d.querySelector(".hd-no").click();
    await until(() => !document.querySelector(".hd-back.is-on:not(.is-leaving)"));
  }
  o.asked = asked.length;
  document.getElementById("engineToggle").click();
  await until(() => document.getElementById("view-engine").classList.contains("is-hidden"));
  const was = localStorage.getItem("yue2.arPainter");
  document.querySelector('.topbar [data-tab="artist"]').click();
  await until(() => !document.getElementById("view-artist").classList.contains("is-hidden"), 4000);
  await window.HeresyArtist.painters(); await wait(100);
  const note = document.getElementById("arPainterNote");
  o.painters = [...document.getElementById("arPainter").options].map((x) => x.value);
  o.note = note && !note.hidden ? note.textContent : "";
  window.fetch = real;
  await window.HeresyArtist.painters();
  if (was === null) localStorage.removeItem("yue2.arPainter"); else localStorage.setItem("yue2.arPainter", was);
  document.querySelector('.topbar [data-tab="create"]').click();
  await wait(300);
  return o; })()`);
check("the Models card's Qwen row: three variants with their sizes, the first not here picked (2512 Q6)",
  qw23.row && qw23.pick === "2512-q6" && qw23.options.length === 3 && /31 GB · here/.test(qw23.options[0]) && /34\.5 GB$/.test(qw23.options[1]) && /33\.1 GB$/.test(qw23.options[2]), JSON.stringify(qw23));
check("  Fetch on Qwen-Image 2.1 asks first, its size and its research licence said; No fetches nothing",
  qw23.ask && /Qwen-Image 2\.1/.test(qw23.ask) && /33\.1 GB/.test(qw23.ask) && /research licence/.test(qw23.ask) && /not for commercial use/.test(qw23.ask) && qw23.asked === 0, JSON.stringify(qw23));
check("  the Artist offers only the painters here and says the others come from Engine → Models and LoRAs (an fp8 fine-tune is not a fetch)",
  qw23.painters.join(",") === "krea2-q4" && /Engine → Models and LoRAs/.test(qw23.note) && /Qwen-Image 2512 · Q4/.test(qw23.note) && /Qwen-Image 2\.1/.test(qw23.note) && !/fp8/.test(qw23.note), JSON.stringify(qw23));

// HERESY 1169 · 1326 (Viktor 10.10.2026, 14:57: «Сейчас хочу перегенерить, и ловлю ошибку. Хотя выбрано всё правильно»)
section("the Artist: a 2512 fine-tune is sent with the painter's own sampling and with the user's own (16 steps, Euler SDE, Beta)");
const ft26 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), real = window.fetch, sent = [];
  const until = async (fn, ms) => { for (let i = 0; i < (ms || 3000) / 50; i++) { const v = fn(); if (v) return v; await wait(50); } return null; };
  const json = (b, s) => Promise.resolve(new Response(JSON.stringify(b), { status: s || 200, headers: { "Content-Type": "application/json" } }));
  const painters = [{ key: "krea2-q4", label: "Krea 2 Muse · Q4", need_mb: 12500, family: "krea2", ready: true },
    { key: "qwen2512-fp8", label: "Qwen-Image 2512 · fp8", need_mb: 22500, family: "qwen-image-2512", ready: true, models: ["A fine fp8.safetensors", "B real fp8.safetensors"], lightning: true, note: "a fine-tune" }];
  window.fetch = (u, o) => { u = String(u);
    if (u.startsWith("/lab/artist/painters")) return json({ painters });
    if (u.startsWith("/lab/artist/loras")) return json({ root: "artwork/loras", families: { krea2: [], "qwen-image-2512": [], "qwen-image-2.1": [], sdxl: [] }, titles: {} });
    if (u.startsWith("/lab/artist/draw")) { sent.push(JSON.parse(o.body)); return json({ id: "20261010-160000-1326-" + sent.length, status: "done", of: 1, pictures: [], prompt: "x", shapes: ["1:1"], seed: 1, count: 1, painter: "qwen2512-fp8" }, 202); }
    if (u.startsWith("/lab/artist/runs")) return json({ runs: [] });
    return real(u, o); };
  const keys = ["yue2.arPainter", "yue2.arModel", "yue2.arPrompt", "yue2.arSampling", "yue2.arLoras"], was = keys.map((k) => localStorage.getItem(k));
  localStorage.removeItem("yue2.arSampling");
  document.querySelector('.topbar [data-tab="artist"]').click();
  await until(() => !document.getElementById("view-artist").classList.contains("is-hidden"), 4000); await wait(300);
  await window.HeresyArtist.painters(); await wait(100);
  const $ = (id) => document.getElementById(id), set = (id, v) => { $(id).value = v; $(id).dispatchEvent(new Event("change")); };
  set("arPainter", "qwen2512-fp8"); await wait(50);
  set("arModel", "B real fp8.safetensors"); await wait(50);
  $("arPrompt").value = "A fox"; $("arPrompt").dispatchEvent(new Event("input"));
  document.querySelector('#arShapes input[value="1:1"]').checked = true; $("arShapes").dispatchEvent(new Event("change"));
  $("arDraw").click(); await until(() => sent.length === 1, 3000);
  set("arSteps", "16"); set("arSampler", "euler-sde"); set("arSchedule", "beta"); await wait(50);
  $("arDraw").click(); await until(() => sent.length === 2, 3000);
  const o = { own: sent[0] && { model: sent[0].model, sampling: sent[0].sampling || null }, mine: sent[1] && { model: sent[1].model, sampling: sent[1].sampling || null } };
  window.fetch = real;
  keys.forEach((k, i) => { if (was[i] === null) localStorage.removeItem(k); else localStorage.setItem(k, was[i]); });
  await window.HeresyArtist.painters();
  await window.HeresyArtist.reload();
  document.querySelector('.topbar [data-tab="create"]').click();
  await wait(300);
  return o; })()`);
check("the fine-tune picked goes with the painter's own sampling and with the user's own: 16 steps, Euler SDE and Beta sent beside it",
  ft26.own && ft26.own.model === "B real fp8.safetensors" && !ft26.own.sampling && ft26.mine && ft26.mine.model === "B real fp8.safetensors" &&
  ft26.mine.sampling && ft26.mine.sampling.steps === 16 && ft26.mine.sampling.sampler === "euler-sde" && ft26.mine.sampling.schedule === "beta", JSON.stringify(ft26));

// HERESY 1169 · 1328 (Viktor 10.10.2026: «нужно отключать Lightning Guidance, если Lightning LoRA не подключен»; «The Artist cannot draw: steps: 4 to 16 for this painter with Lightning» with 16 shown; the plan he took: fp8 fine-tunes without Lightning by default, GGUF with it)
section("the Artist's Lightning: a switch beside its strength; steps kept within their range; no switch where its file is not here");
const lt28 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), real = window.fetch, sent = [];
  const until = async (fn, ms) => { for (let i = 0; i < (ms || 3000) / 50; i++) { const v = fn(); if (v) return v; await wait(50); } return null; };
  const json = (b, s) => Promise.resolve(new Response(JSON.stringify(b), { status: s || 200, headers: { "Content-Type": "application/json" } }));
  let lightningHere = true;
  const painters = () => [{ key: "krea2-q4", label: "Krea 2 Muse · Q4", need_mb: 12500, family: "krea2", ready: true },
    { key: "qwen2512-q4", label: "Qwen-Image 2512 · Q4", need_mb: 15500, family: "qwen-image-2512", ready: true, lightning: lightningHere },
    { key: "qwen2512-fp8", label: "Qwen-Image 2512 · fp8", need_mb: 22500, family: "qwen-image-2512", ready: true, models: ["A fine fp8.safetensors"], lightning: lightningHere }];
  window.fetch = (u, o) => { u = String(u);
    if (u.startsWith("/lab/artist/painters")) return json({ painters: painters() });
    if (u.startsWith("/lab/artist/loras")) return json({ root: "artwork/loras", families: { krea2: [], "qwen-image-2512": [], "qwen-image-2.1": [], sdxl: [] }, titles: {} });
    if (u.startsWith("/lab/artist/draw")) { sent.push(JSON.parse(o.body)); return json({ id: "20261010-170000-1328-" + sent.length, status: "done", of: 1, pictures: [], prompt: "x", shapes: ["1:1"], seed: 1, count: 1, painter: "qwen2512-q4" }, 202); }
    if (u.startsWith("/lab/artist/runs")) return json({ runs: [] });
    return real(u, o); };
  const keys = ["yue2.arPainter", "yue2.arModel", "yue2.arPrompt", "yue2.arSampling", "yue2.arLoras"], was = keys.map((k) => localStorage.getItem(k));
  // what Viktor's browser kept (16 shown, more than 16 kept and sent)
  localStorage.setItem("yue2.arSampling", JSON.stringify({ "qwen2512-fp8": { steps: 20, sampler: "euler-sde", schedule: "beta", lightning: 0.55, cfg: 4 } }));
  document.querySelector('.topbar [data-tab="artist"]').click();
  await until(() => !document.getElementById("view-artist").classList.contains("is-hidden"), 4000); await wait(300);
  await window.HeresyArtist.painters(); await wait(100);
  const $ = (id) => document.getElementById(id), seen = (id) => !!$(id).offsetParent, set = (id, v) => { $(id).value = v; $(id).dispatchEvent(new Event("change")); };
  $("arSampling").open = true;
  $("arPrompt").value = "A fox"; $("arPrompt").dispatchEvent(new Event("input"));
  document.querySelector('#arShapes input[value="1:1"]').checked = true; $("arShapes").dispatchEvent(new Event("change"));
  set("arPainter", "qwen2512-fp8"); await wait(50);
  const o = { kept: { steps: $("arSteps").value, on: $("arLightOn").checked, cfg: seen("arCfgBox"), say: $("arSampSay").textContent } };
  $("arDraw").click(); await until(() => sent.length === 1, 3000);
  o.keptSent = sent[0] && sent[0].sampling;
  set("arSteps", "25"); await wait(50);                  // typed past 16 with Lightning on: kept at 16
  o.typed = { shown: $("arSteps").value, kept: JSON.parse(localStorage.getItem("yue2.arSampling"))["qwen2512-fp8"].steps };
  $("arLightOn").checked = false; $("arLightOn").dispatchEvent(new Event("change")); await wait(50);
  o.off = { steps: $("arSteps").value, lim: $("arSteps").min + "-" + $("arSteps").max, cfg: seen("arCfgBox"), strength: $("arLight").value, dim: $("arLight").disabled };
  $("arDraw").click(); await until(() => sent.length === 2, 3000);
  o.offSent = sent[1] && sent[1].sampling;
  set("arPainter", "qwen2512-q4"); await wait(50);
  o.gguf = { say: $("arSampSay").textContent, on: $("arLightOn").checked, cfg: seen("arCfgBox") };
  $("arDraw").click(); await until(() => sent.length === 3, 3000);
  o.ggufSent = sent[2] ? (sent[2].sampling || null) : "none";
  lightningHere = false;                                  // its file not on this machine
  await window.HeresyArtist.painters(); await wait(100);
  set("arPainter", "qwen2512-q4"); await wait(50);
  o.none = { light: seen("arLightBox"), cfg: seen("arCfgBox"), say: $("arSampSay").textContent, lim: $("arSteps").min + "-" + $("arSteps").max };
  window.fetch = real;
  keys.forEach((k, i) => { if (was[i] === null) localStorage.removeItem(k); else localStorage.setItem(k, was[i]); });
  await window.HeresyArtist.painters();
  await window.HeresyArtist.reload();
  document.querySelector('.topbar [data-tab="create"]').click();
  await wait(300);
  return o; })()`);
check("Viktor's kept 20 steps with Lightning 0.55 read as Lightning on at 16 (its range's top), guidance hidden as it shows, and 16 sent, not 20",
  lt28.kept.steps === "16" && lt28.kept.on && !lt28.kept.cfg && lt28.kept.say === "16 steps · Euler SDE · Beta · Lightning 0.55" &&
  lt28.keptSent && lt28.keptSent.steps === 16 && lt28.keptSent.lightning === 0.55, JSON.stringify(lt28));
check("  25 typed with Lightning on is kept at 16; switched off: 30 steps of 10 to 60, guidance shown, the strength kept and dimmed, Lightning 0 sent",
  lt28.typed.shown === "16" && lt28.typed.kept === 16 && lt28.off.steps === "30" && lt28.off.lim === "10-60" && lt28.off.cfg && lt28.off.strength === "0.55" && lt28.off.dim &&
  lt28.offSent && lt28.offSent.lightning === 0 && !("steps" in lt28.offSent), JSON.stringify(lt28));
check("  a GGUF painter paints with Lightning by default (8 steps at 1.00) and sends nothing of it; with no Lightning file there is no switch: guidance and 10 to 60 steps",
  lt28.gguf.say === "8 steps · Euler · Simple · Lightning 1.00" && lt28.gguf.on && !lt28.gguf.cfg && lt28.ggufSent === null &&
  !lt28.none.light && lt28.none.cfg && lt28.none.say === "30 steps · Euler · Simple · guidance 4" && lt28.none.lim === "10-60", JSON.stringify(lt28));

// HERESY 1169 · 1327 (Viktor 10.10.2026: «Для кнопки Generate song, если есть уже Score в поле, тогда попап с вопросом: Генерим на существующей партитуре, или новая?»; «сторожа для LoRA адаптеров и силы их весов»; «При FULL режиме всегда держим Supply Your Own Score открытым»)
section("Generate with a score in the form asks: on it, or a new one; the adapters that wrote it against these; Full keeps the score open");
await ev(`document.querySelector('#tabs [data-tab="create"]').click(); true`);
await ev(`(() => { const g = (id) => document.getElementById(id).value;
  window.__sc27 = { abc: g("abc"), style: g("style"), lyrics: g("lyrics"), cot: (document.querySelector('input[name="cot"]:checked') || {}).value || "full", value: YueLoras.value };
  localStorage.removeItem("yue2.askScore");
  const full = document.querySelector('input[name="cot"][value="full"]'); full.checked = true; full.dispatchEvent(new Event("change", { bubbles: true }));
  document.getElementById("style").value = "dark country, baritone"; document.getElementById("lyrics").value = "[Verse]\\nOne line to sing";
  YueLoras.value = () => [{ id: "mock/voice", ar: 0.5, nar: 0 }];
  const a = document.getElementById("abc"); a.value = "X:1\\nL:1/8\\nM:4/4\\nK:C\\nQ:1/4=90\\nV:Vocal\\nCDEF GABc|";
  window.ruachScoreFrom.set([{ id: "mock/voice", ar: 0.8, nar: 0 }], "planned");
  a.dispatchEvent(new Event("input", { bubbles: true }));
  return true; })()`);
const sc27a = await ev(`(async () => { const d = document.getElementById("scoreDrawer"), w = (ms) => new Promise((r) => setTimeout(r, ms));
  const o = { open: d.open }; d.open = false; await w(120); o.reopened = d.open;
  const g = document.getElementById("scoreGuard"); o.guard = g && g.offsetParent ? g.textContent : "";
  return o; })()`);
await mockClear();
await click("#generateBtn");
const sc27ask = await waitFor(`(() => { const b = document.querySelector(".hd-back.is-on:not(.is-leaving)"); return b && b.querySelector(".hd-alt") ? { text: b.textContent.replace(/\\s+/g, " ").slice(0, 700), ok: b.querySelector(".hd-yes").textContent, alt: b.querySelector(".hd-alt").textContent } : null; })()`, 3000, 50);
await answerDialog(false);
await sleep(300);
const sc27stay = await ev(`fetch("/mock/requests").then(r => r.json()).then(a => a.filter(x => x.path === "/synth").length)`);
await click("#generateBtn");
await waitFor(`!!document.querySelector(".hd-back.is-on:not(.is-leaving) .hd-alt")`, 3000, 50);
await click(".hd-back:not(.is-leaving) .hd-alt");
const sc27new = await waitFor(`fetch("/mock/requests").then(r => r.json()).then(a => a.filter(x => x.path === "/synth").map(x => JSON.parse(x.body))[0] || null)`, 5000);
const sc27emptied = await ev(`document.getElementById("abc").value`);
await waitFor(`!document.querySelector("#libList .is-running-row")`, 10000);
await ev(`(() => { const a = document.getElementById("abc"); a.value = "X:1\\nL:1/8\\nM:4/4\\nK:C\\nQ:1/4=90\\nV:Vocal\\nCDEF GABc|"; a.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
await mockClear();
await click("#generateBtn");
await answerDialog(true);
const sc27on = await waitFor(`fetch("/mock/requests").then(r => r.json()).then(a => a.filter(x => x.path === "/synth").map(x => JSON.parse(x.body))[0] || null)`, 5000);
await waitFor(`!document.querySelector("#libList .is-running-row")`, 10000);
await ev(`(() => { const k = window.__sc27, s = (id, v) => { document.getElementById(id).value = v; document.getElementById(id).dispatchEvent(new Event("input", { bubbles: true })); };
  YueLoras.value = k.value; s("abc", k.abc); s("style", k.style); s("lyrics", k.lyrics);
  const c = document.querySelector('input[name="cot"][value="' + k.cot + '"]'); if (c) { c.checked = true; c.dispatchEvent(new Event("change", { bubbles: true })); }
  localStorage.setItem("yue2.askScore", "off"); return true; })()`);
check("Full with a score: the score stays open (folded, it opens again); under it the adapters that wrote it against these (music 0.8, now 0.5)",
  sc27a.open && sc27a.reopened && /music 0\.8/.test(sc27a.guard) && /music 0\.5/.test(sc27a.guard), JSON.stringify(sc27a));
check("  Generate asks: on this score, or a new one, the adapters' difference said; Stay sends nothing",
  !!sc27ask && /Generate on the score in the form, or write a new one\?/.test(sc27ask.text) && /music 0\.8/.test(sc27ask.text) && /Industrial Rock/.test(sc27ask.text) &&
  sc27ask.ok === "On this score" && sc27ask.alt === "A new score" && sc27stay === 0, JSON.stringify({ sc27ask, sc27stay }));
check("  A new score: the field emptied and the song sent without one; On this score: sent with it",
  !!sc27new && !sc27new.abc && sc27emptied === "" && !!sc27on && /CDEF GABc/.test(sc27on.abc || ""), JSON.stringify({ newAbc: sc27new && sc27new.abc, sc27emptied, onAbc: sc27on && sc27on.abc }));

// HERESY 1169 · 1329 (Viktor 10.10.2026: «В баре кнопка TRAINER отцентри между лого и воркспейс селектором»; «Расширь колонку GPU на 100px, и общую ширину фрейма логгера на 200px, и разреши по крайней стороне фрейма перетягивать его ширины с установленного бейс до макс 1200px»)
section("the bar's Trainer in the middle between the logo and the workspace; the log 200 px wider with the cards, its edge dragged to 1200 px");
await ev(`document.querySelector('#tabs [data-tab="create"]').click(); true`);
const mid29 = `(() => { window.ruachCenterTrainer(); const l = document.querySelector(".topbar .brand-logo").getBoundingClientRect(), w = document.querySelector(".topbar .ws-current").getBoundingClientRect(), s = document.getElementById("tabsSide").getBoundingClientRect();
  return { off: Math.round((s.left + s.right) / 2 - (l.right + w.left) / 2), logo: Math.round(l.width), vw: innerWidth }; })()`;
const tc29a = await ev(mid29);
await send("Emulation.setDeviceMetricsOverride", { width: 2560, height: 1440, deviceScaleFactor: 1, mobile: false });
await sleep(300);
const tc29b = await ev(mid29);
await send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 960, deviceScaleFactor: 1, mobile: false });
await sleep(300);
check("the Trainer's tab stands in the middle between the logo and the workspace button, at 1920 and at 2560",
  tc29a.logo > 0 && Math.abs(tc29a.off) <= 2 && tc29b.logo > 0 && Math.abs(tc29b.off) <= 2, JSON.stringify({ tc29a, tc29b }));
const dk29 = await ev(`(() => { const d = document.getElementById("logDock"); localStorage.removeItem("yue2.logDockW"); d.style.width = "";
  if (d.classList.contains("is-folded")) document.getElementById("logDockTab").click();
  const had = d.classList.contains("has-gpus"); d.classList.add("has-gpus");
  const o = { gpusW: Math.round(d.getBoundingClientRect().width), col: getComputedStyle(d.querySelector(".log-dock-main")).gridTemplateColumns };
  if (!had) d.classList.remove("has-gpus");
  o.base = Math.round(d.getBoundingClientRect().width);
  const g = document.getElementById("logDockGrip").getBoundingClientRect(); o.grip = { x: Math.round(g.left + g.width / 2), y: Math.round(g.top + g.height / 2) };
  o.left = d.classList.contains("is-left"); return o; })()`);
await drag(dk29.grip, dk29.left ? 200 : -200);
const dk29a = await ev(`({ w: Math.round(document.getElementById("logDock").getBoundingClientRect().width), kept: localStorage.getItem("yue2.logDockW") })`);
const g2 = await ev(`(() => { const g = document.getElementById("logDockGrip").getBoundingClientRect(); return { x: Math.round(g.left + g.width / 2), y: Math.round(g.top + g.height / 2) }; })()`);
await drag(g2, dk29.left ? 1500 : -1500);
const dk29b = await ev(`Math.round(document.getElementById("logDock").getBoundingClientRect().width)`);
await ev(`document.getElementById("logDockGrip").dispatchEvent(new MouseEvent("dblclick", { bubbles: true })); true`);
const dk29c = await ev(`({ w: Math.round(document.getElementById("logDock").getBoundingClientRect().width), kept: localStorage.getItem("yue2.logDockW") })`);
await ev(`(() => { const d = document.getElementById("logDock"); if (!d.classList.contains("is-folded")) document.getElementById("logDockTab").click(); return true; })()`);
check("  the dock with the cards: 920 px, their column 390; its edge dragged 200 px widens it and is kept; past 1200 it stops there; a double click gives its own width back",
  dk29.gpusW === 920 && /390px$/.test(dk29.col) && Math.abs(dk29a.w - (dk29.base + 200)) <= 2 && +dk29a.kept === dk29a.w && dk29b === 1200 &&
  dk29c.w === dk29.base && dk29c.kept === null, JSON.stringify({ dk29, dk29a, dk29b, dk29c }));

// HERESY 1169 · 1330 (Viktor 10.10.2026: «Для SEED сделай рандом -1, рандом fixed, fixed, next, prev»; «можно и в творце»)
section("the seeds' modes: Random (−1), Random fixed, Fixed, Next, Previous, in the Creator and the Artist");
await ev(`document.querySelector('#tabs [data-tab="create"]').click(); true`);
const sd30keep = await ev(`(() => { const g = (id) => document.getElementById(id).value;
  window.__sd30 = { lm: g("lmSeed"), snd: g("soundSeed"), style: g("style"), lyrics: g("lyrics"), abc: g("abc"), mm: localStorage.getItem("yue2.seedMode.music") };
  document.getElementById("style").value = "dark country, baritone"; document.getElementById("lyrics").value = "[Verse]\\nOne line to sing"; document.getElementById("abc").value = "";
  const sel = document.querySelector("#lmSeed ~ .seed-mode, .seedfield .seed-mode");
  return { modes: [...document.querySelectorAll(".seedfield .seed-mode")].map((s) => [...s.options].map((o) => o.value).join(",")) }; })()`);
const setMode30 = (m) => ev(`(() => { const s = document.querySelectorAll(".seedfield .seed-mode")[0]; s.value = "${m}"; s.dispatchEvent(new Event("change", { bubbles: true })); return document.getElementById("lmSeed").value; })()`);
const sent30 = () => waitFor(`fetch("/mock/requests").then(r => r.json()).then(a => a.filter(x => x.path === "/synth").map(x => JSON.parse(x.body.replace(/("(?:lm_seed|seed)"\\s*:\\s*)(\\d+)/g, '$1"$2"')))[0] || null)`, 5000);
await setMode30("next");
await ev(`(() => { const i = document.getElementById("lmSeed"); i.value = "100"; i.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
await mockClear();
await click("#generateBtn");
const sd30n = await sent30();
const sd30nAfter = await ev(`document.getElementById("lmSeed").value`);
await waitFor(`!document.querySelector("#libList .is-running-row")`, 10000);
const sd30r = { field: await setMode30("random") };
await mockClear();
await click("#generateBtn");
const sd30rSent = await sent30();
sd30r.after = await ev(`document.getElementById("lmSeed").value`);
await waitFor(`!document.querySelector("#libList .is-running-row")`, 10000);
const sd30f = { rolled: await setMode30("roll") };
await ev(`(() => { const k = window.__sd30, s = (id, v) => { document.getElementById(id).value = v; }; s("style", k.style); s("lyrics", k.lyrics); s("abc", k.abc); s("lmSeed", k.lm); s("soundSeed", k.snd);
  const m = document.querySelectorAll(".seedfield .seed-mode")[0]; m.value = k.mm || "random"; if (k.mm) localStorage.setItem("yue2.seedMode.music", k.mm); else localStorage.removeItem("yue2.seedMode.music"); return true; })()`);
check("the Creator's two seeds each have the five modes; Next sends 100 and moves the field to 101; Random sends none and keeps it empty; Random fixed puts a seed in",
  sd30keep.modes.length === 2 && sd30keep.modes.every((m) => m === "random,roll,fixed,next,prev") && sd30n && sd30n.lm_seed === "100" && sd30nAfter === "101" &&
  sd30r.field === "" && sd30rSent && sd30rSent.lm_seed === undefined && sd30r.after === "" && /^\d+$/.test(sd30f.rolled), JSON.stringify({ sd30keep, n: sd30n && sd30n.lm_seed, sd30nAfter, sd30r, r: sd30rSent && sd30rSent.lm_seed, sd30f }));
const sd30a = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), real = window.fetch, sent = [];
  const until = async (fn, ms) => { for (let i = 0; i < (ms || 3000) / 50; i++) { const v = fn(); if (v) return v; await wait(50); } return null; };
  const json = (b, s) => Promise.resolve(new Response(JSON.stringify(b), { status: s || 200, headers: { "Content-Type": "application/json" } }));
  window.fetch = (u, o) => { u = String(u);
    if (u.startsWith("/lab/artist/draw")) { const b = JSON.parse(o.body); sent.push(b); return json({ id: "20261010-180000-1330-" + sent.length, status: "done", of: b.count * b.shapes.length, pictures: [], prompt: "x", shapes: b.shapes, seed: b.seed == null ? 777 : b.seed, count: b.count, painter: "krea2-q4" }, 202); }
    if (u.startsWith("/lab/artist/runs")) return json({ runs: [] });
    return real(u, o); };
  const keys = ["yue2.arSeed", "yue2.arSeedMode", "yue2.arCount", "yue2.arPrompt"], was = keys.map((k) => localStorage.getItem(k));
  document.querySelector('.topbar [data-tab="artist"]').click();
  await until(() => !document.getElementById("view-artist").classList.contains("is-hidden"), 4000); await wait(200);
  const $ = (id) => document.getElementById(id), mode = document.querySelector(".ar-seed-row .seed-mode");
  const setM = (m) => { mode.value = m; mode.dispatchEvent(new Event("change", { bubbles: true })); };
  $("arPrompt").value = "A fox"; $("arPrompt").dispatchEvent(new Event("input"));
  document.querySelector('#arShapes input[value="1:1"]').checked = true; $("arShapes").dispatchEvent(new Event("change"));
  $("arCount").value = "2"; $("arCount").dispatchEvent(new Event("change"));
  setM("next"); $("arSeed").value = "500"; $("arSeed").dispatchEvent(new Event("input"));
  $("arDraw").click(); await until(() => sent.length === 1, 3000); await wait(100);
  const o = { modes: [...mode.options].map((x) => x.value).join(","), nSent: sent[0] && sent[0].seed, nAfter: $("arSeed").value };
  setM("prev"); $("arDraw").click(); await until(() => sent.length === 2, 3000); await wait(100);
  o.pSent = sent[1] && sent[1].seed; o.pAfter = $("arSeed").value;
  $("arSeedNew").click(); await wait(50);
  o.reset = { mode: mode.value, field: $("arSeed").value };
  window.fetch = real;
  keys.forEach((k, i) => { if (was[i] === null) localStorage.removeItem(k); else localStorage.setItem(k, was[i]); });
  mode.value = localStorage.getItem("yue2.arSeedMode") || "random"; $("arSeed").value = localStorage.getItem("yue2.arSeed") || ""; $("arCount").value = localStorage.getItem("yue2.arCount") || "1";
  await window.HeresyArtist.reload();
  document.querySelector('.topbar [data-tab="create"]').click();
  await wait(300);
  return o; })()`);
check("  the Artist's seed: Next with two variations sends 500 and moves to 502, Previous sends 502 and moves back to 500; ⟲ is Random again, the field empty",
  sd30a.modes === "random,roll,fixed,next,prev" && sd30a.nSent === 500 && sd30a.nAfter === "502" && sd30a.pSent === 502 && sd30a.pAfter === "500" &&
  sd30a.reset.mode === "random" && sd30a.reset.field === "", JSON.stringify(sd30a));

// HERESY 1169 · 1332 (Viktor 10.10.2026: «Над кнопкой РИСОВАТЬ/ОСТАНОВИТЬ пустой тултип. Центровку текста нужно внутри кнопки. И сделай капс в ней»; «дропдаун селекторы адаптивными с минимальной длиной по полной длине моделей»; «прогресс бар генерации»; «Artist не переводи как Артист на русский. Только как Художник»)
section("the Artist: its header as its tab in Russian; Draw's own tip, centred in capitals; the painter's choice the row wide; the progress bar under Draw");
const ui32 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), real = window.fetch;
  const until = async (fn, ms) => { for (let i = 0; i < (ms || 3000) / 50; i++) { const v = fn(); if (v) return v; await wait(50); } return null; };
  const json = (b, s) => Promise.resolve(new Response(JSON.stringify(b), { status: s || 200, headers: { "Content-Type": "application/json" } }));
  const now = Date.now() / 1000;
  let runs = [];
  window.fetch = (u, o) => { u = String(u);
    if (u.startsWith("/lab/artist/runs")) return json({ runs });
    return real(u, o); };
  document.querySelector('.topbar [data-tab="artist"]').click();
  await until(() => !document.getElementById("view-artist").classList.contains("is-hidden"), 4000); await wait(200);
  const $ = (id) => document.getElementById(id), o = {};
  const lang = document.documentElement.lang;
  await window.RuachI18n.set("ru"); await wait(300);
  o.ru = { tab: $("tabArtist").textContent, head: $("arRoomName").textContent };
  await window.RuachI18n.set(lang || "en"); await wait(300);
  o.en = $("arRoomName").textContent;
  const d = $("arDraw"), cs = getComputedStyle(d);
  o.draw = { tip: d.dataset.tip || "", upper: cs.textTransform, centre: cs.justifyContent };
  const p = $("arPainter"), lb = p.closest(".field"), row = lb.parentElement.getBoundingClientRect(), pr = p.getBoundingClientRect();
  o.painterWide = Math.round(pr.width) >= Math.round(row.width) - 2;
  runs = [{ id: "20261010-200000-1332", prompt: "x", shapes: ["1:1", "16:9"], seed: 1, count: 1, painter: "krea2-q4", created: now, status: "queued", of: 2, pictures: [], waiting: "no card can take this now" }];
  await window.HeresyArtist.reload(); await wait(150);
  o.waiting = { shown: !$("arProgress").hidden, striped: $("arProgress").classList.contains("is-waiting"), say: $("arProgressSay").textContent };
  runs = [Object.assign({}, runs[0], { status: "running", waiting: "", pictures: [{ n: 1, shape: "1:1", seed: 1, w: 1280, h: 1280, kept: true, file: "01-1x1-s1.png" }], live: { live: 2, step: 4, of: 8, file: "preview/02.jpg" } })];
  await window.HeresyArtist.reload(); await wait(150);
  o.running = { say: $("arProgressSay").textContent, width: $("arProgress").querySelector("i").style.width };
  runs = [];
  await window.HeresyArtist.reload(); await wait(150);
  o.gone = $("arProgress").hidden;
  window.fetch = real;
  await window.HeresyArtist.reload();
  document.querySelector('.topbar [data-tab="create"]').click();
  await wait(300);
  return o; })()`);
check("the Artist's header is the room's name as its tab says it (Художник in Russian, Artist in English); Draw has a tip of its own, its word centred in capitals; the painter's choice is the row wide",
  ui32.ru.tab === "Художник" && ui32.ru.head === "Художник" && ui32.en === "Artist" && /Ctrl\+Enter/.test(ui32.draw.tip) && ui32.draw.upper === "uppercase" && ui32.draw.centre === "center" && ui32.painterWide,
  JSON.stringify(ui32));
check("  the progress under Draw: waiting, striped and why; painting, picture 2 of 2 at step 4 of 8 (75 %); gone with the run",
  ui32.waiting.shown && ui32.waiting.striped && /waits for a card/.test(ui32.waiting.say) && /picture 2 of 2 · step 4 \/ 8 · 75%/.test(ui32.running.say) && ui32.running.width === "75%" && ui32.gone,
  JSON.stringify(ui32));

// HERESY 1169 · 1333 (Viktor 10.10.2026: «По моему набору семплеров хочу попросить, чтобы ты их внедрил… er_sde, res_*s, res_*s_ode, heun(pp2), exp_heun_2_x0(_sde)… bong_tangent, sgm_uniform, exponential, beta, kl_optimal, beta57»)
section("the Artist's samplers and schedules: his set chosen and sent, the time by their looks, the matrix's two warnings where they belong");
const sp33 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), real = window.fetch, sent = [];
  const until = async (fn, ms) => { for (let i = 0; i < (ms || 3000) / 50; i++) { const v = fn(); if (v) return v; await wait(50); } return null; };
  const json = (b, s) => Promise.resolve(new Response(JSON.stringify(b), { status: s || 200, headers: { "Content-Type": "application/json" } }));
  const painters = [{ key: "krea2-q4", label: "Krea 2 Muse · Q4", need_mb: 12500, family: "krea2", ready: true },
    { key: "qwen2512-q4", label: "Qwen-Image 2512 · Q4", need_mb: 15500, family: "qwen-image-2512", ready: true, lightning: true },
    { key: "qwen2512-fp8", label: "Qwen-Image 2512 · fp8", need_mb: 22500, family: "qwen-image-2512", ready: true, models: ["A fine fp8.safetensors"], lightning: true }];
  window.fetch = (u, o) => { u = String(u);
    if (u.startsWith("/lab/artist/painters")) return json({ painters });
    if (u.startsWith("/lab/artist/loras")) return json({ root: "artwork/loras", families: { krea2: [], "qwen-image-2512": [], "qwen-image-2.1": [], sdxl: [] }, titles: {} });
    if (u.startsWith("/lab/artist/draw")) { sent.push(JSON.parse(o.body)); return json({ id: "20261010-210000-1333-" + sent.length, status: "done", of: 1, pictures: [], prompt: "x", shapes: ["1:1"], seed: 1, count: 1, painter: "krea2-q4" }, 202); }
    if (u.startsWith("/lab/artist/runs")) return json({ runs: [] });
    return real(u, o); };
  const keys = ["yue2.arPainter", "yue2.arModel", "yue2.arPrompt", "yue2.arSampling", "yue2.arLoras"], was = keys.map((k) => localStorage.getItem(k));
  localStorage.removeItem("yue2.arSampling");
  document.querySelector('.topbar [data-tab="artist"]').click();
  await until(() => !document.getElementById("view-artist").classList.contains("is-hidden"), 4000); await wait(300);
  await window.HeresyArtist.painters(); await wait(100);
  const $ = (id) => document.getElementById(id), set = (id, v) => { $(id).value = v; $(id).dispatchEvent(new Event("change")); }, seen = (id) => !!$(id).offsetParent;
  $("arSampling").open = true;
  $("arPrompt").value = "A fox"; $("arPrompt").dispatchEvent(new Event("input"));
  document.querySelector('#arShapes input[value="1:1"]').checked = true; $("arShapes").dispatchEvent(new Event("change"));
  set("arPainter", "krea2-q4"); await wait(50);
  const o = { samplers: [...$("arSampler").options].map((x) => x.value).join(","), schedules: [...$("arSchedule").options].map((x) => x.value).join(",") };
  const mins = () => +((($("arCost").textContent.match(/(\\d+(?:[.,]\\d+)?)\\s*min/) || [])[1] || "0").replace(",", ".")) || (/s on one card|about \\d+ s/.test($("arCost").textContent) ? 0.5 : 0);
  o.costEuler = $("arCost").textContent;
  set("arSampler", "res_2s"); await wait(50);
  o.costRes = $("arCost").textContent; o.say = $("arSampSay").textContent; o.kreaWarn = seen("arSampWarn");
  $("arDraw").click(); await until(() => sent.length === 1, 3000);
  o.body = sent[0] && sent[0].sampling;
  set("arSampler", "euler"); set("arSchedule", "karras"); await wait(50);
  o.kreaKarrasWarn = seen("arSampWarn");
  set("arPainter", "qwen2512-q4"); await wait(50);
  set("arSchedule", "karras"); await wait(50);
  o.lightKarras = seen("arSampWarn") ? $("arSampWarn").textContent : "";
  set("arSchedule", "beta57"); await wait(50);
  o.lightBeta57 = seen("arSampWarn");
  set("arPainter", "qwen2512-fp8"); await wait(50);
  set("arSampler", "euler-sde"); await wait(50);
  o.fp8Sde = seen("arSampWarn") ? $("arSampWarn").textContent : "";
  window.fetch = real;
  keys.forEach((k, i) => { if (was[i] === null) localStorage.removeItem(k); else localStorage.setItem(k, was[i]); });
  await window.HeresyArtist.painters();
  await window.HeresyArtist.reload();
  document.querySelector('.topbar [data-tab="create"]').click();
  await wait(300);
  return o; })()`);
check("his samplers (ER-SDE, RES 2s and 3s with their ODE, Heun++ 2, Exp Heun 2 x0 and its SDE) and schedules (Beta 57, KL optimal, SGM uniform, Bong tangent) to choose; RES 2s said and sent",
  sp33.samplers === "euler,euler-sde,er_sde,res_2s,res_2s_ode,res_3s,res_3s_ode,heunpp2,exp_heun_2_x0,exp_heun_2_x0_sde" &&
  sp33.schedules === "simple,karras,exponential,beta,beta57,kl_optimal,sgm_uniform,bong_tangent" && sp33.say === "8 steps · RES 2s · Simple" &&
  JSON.stringify(sp33.body) === '{"sampler":"res_2s"}' && sp33.costRes !== sp33.costEuler, JSON.stringify(sp33));
check("  the matrix's warnings where they belong: Lightning under Karras (twice the subject), not under Beta 57, not on Krea; Euler SDE on fp8 without Lightning (soft)",
  /twice/.test(sp33.lightKarras) && !sp33.lightBeta57 && !sp33.kreaWarn && !sp33.kreaKarrasWarn && /soft/.test(sp33.fp8Sde), JSON.stringify(sp33));

// HERESY 1169 · 1334 (Viktor 10.10.2026: «Нужен отдельный логгер для Художника. Можно прикрутить его к фрейму логгера сервера отдельной вкладкой. И по фрейму логгера идея... детачить, переносить на другой монитор, поддерживать поверх окон»)
section("the Artist's log: a view of the dock, each room its own; a refusal in the lab's words; each run's way to its end; the log's own window");
const al34 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), real = window.fetch, realOpen = window.open;
  const until = async (fn, ms) => { for (let i = 0; i < (ms || 3000) / 50; i++) { const v = fn(); if (v) return v; await wait(50); } return null; };
  const json = (b, s) => Promise.resolve(new Response(JSON.stringify(b), { status: s || 200, headers: { "Content-Type": "application/json" } }));
  const now = Date.now() / 1000;
  let runs = [];
  const painters = [{ key: "krea2-q4", label: "Krea 2 Muse · Q4", need_mb: 12500, family: "krea2", ready: true }];
  window.fetch = (u, o) => { u = String(u);
    if (u.startsWith("/lab/artist/painters")) return json({ painters });
    if (u.startsWith("/lab/artist/loras")) return json({ root: "artwork/loras", families: { krea2: [], "qwen-image-2512": [], "qwen-image-2.1": [], sdxl: [] }, titles: {} });
    if (u.startsWith("/lab/artist/draw")) return json({ error: "steps: 4 to 16 for this painter" }, 400);
    if (u.startsWith("/lab/artist/runs")) return json({ runs });
    return real(u, o); };
  const keys = ["yue2.logView.artist", "yue2.logView.create", "yue2.logDock", "yue2.arPrompt"], was = keys.map((k) => localStorage.getItem(k));
  keys.slice(0, 2).forEach((k) => localStorage.removeItem(k));
  const $ = (id) => document.getElementById(id), o = {}, before = window.RuachArtistLog.lines().length;
  if ($("logDock").classList.contains("is-folded")) $("logDockTab").click();
  document.querySelector('.topbar [data-tab="artist"]').click();
  await until(() => !document.getElementById("view-artist").classList.contains("is-hidden"), 4000); await wait(300);
  o.artistView = { artist: !$("logDockArtist").hidden, server: !$("logDockBody").hidden };
  await window.HeresyArtist.painters(); await wait(100);
  await window.HeresyArtist.reload(); await wait(100);                       // the first look takes the runs in, says nothing
  $("arPrompt").value = "A fox"; $("arPrompt").dispatchEvent(new Event("input"));
  document.querySelector('#arShapes input[value="1:1"]').checked = true; $("arShapes").dispatchEvent(new Event("change"));
  $("arDraw").click(); await wait(300);
  const lines = () => window.RuachArtistLog.lines().slice(before).map((e) => e.x);   // only what this check made (the suite drew before)
  o.refused = lines().filter((x) => /cannot draw: steps: 4 to 16/.test(x)).length;
  o.asked = lines().filter((x) => /Draw asked: Krea 2 Muse · Q4 · 1:1/.test(x)).length;
  runs = [{ id: "20261010-220000-1334", prompt: "x", shapes: ["1:1"], seed: 3, count: 1, painter: "krea2-q4", created: now, status: "queued", of: 1, pictures: [], waiting: "no card can take this now" }];
  await window.HeresyArtist.reload(); await wait(80);
  runs = [Object.assign({}, runs[0], { status: "running", waiting: "", gpu: 1 })];
  await window.HeresyArtist.reload(); await wait(80);
  runs = [Object.assign({}, runs[0], { status: "failed", error: "CUDA out of memory" })];
  await window.HeresyArtist.reload(); await wait(80);
  const run = lines().filter((x) => /20261010-220000-1334/.test(x));
  o.run = run;
  o.last = $("logDockLast").textContent;
  o.kept = (JSON.parse(localStorage.getItem("yue2.artistLog") || "[]") || []).filter((e) => /20261010-220000-1334/.test(e.x)).length;
  document.querySelector('.topbar [data-tab="create"]').click(); await wait(200);
  o.createView = { artist: !$("logDockArtist").hidden, server: !$("logDockBody").hidden };
  // the log's own window (no Document Picture-in-Picture in the test browser: a pop-up)
  let frame = null;                                     // a window of the same origin: the test browser blocks a pop-up a script opens
  window.open = () => { frame = document.createElement("iframe"); frame.style.cssText = "position:fixed;left:-9999px;width:600px;height:400px"; document.body.appendChild(frame); return frame.contentWindow; };
  const pip = window.documentPictureInPicture; try { delete window.documentPictureInPicture; } catch (e) {}
  $("logDockPop").click(); await wait(200);
  const pop = window.ruachLogPop && window.ruachLogPop();
  window.RuachArtistLog.add("a line for the window");
  o.pop = pop ? { artist: pop.artist.childElementCount > 0, mirrored: [...pop.artist.querySelectorAll(".log-line")].some((r) => /a line for the window/.test(r.textContent)), views: pop.win.document.querySelectorAll(".log-view").length } : null;
  if (frame) frame.remove();
  window.open = realOpen;
  if (pip) window.documentPictureInPicture = pip;
  window.fetch = real;
  keys.forEach((k, i) => { if (was[i] === null) localStorage.removeItem(k); else localStorage.setItem(k, was[i]); });
  if ($("logDock").classList.contains("is-folded") !== (localStorage.getItem("yue2.logDock") !== "open")) $("logDockTab").click();
  await window.HeresyArtist.painters();
  await window.HeresyArtist.reload();
  return o; })()`);
check("the Artist's room opens the dock on the Artist's log, the Creator on the server's; a refusal is kept in the lab's own words with what was asked",
  al34.artistView.artist && !al34.artistView.server && al34.createView.server && !al34.createView.artist && al34.refused === 1 && al34.asked === 1,
  JSON.stringify({ artistView: al34.artistView, createView: al34.createView, refused: al34.refused, asked: al34.asked }));
check("  a run's way to its end: waits and why, paints on its GPU, failed and why; the folded line says the last; kept in this browser",
  al34.run.length === 3 && /waits: no card can take this now/.test(al34.run[0]) && /paints on GPU 1/.test(al34.run[1]) && /failed: CUDA out of memory/.test(al34.run[2]) &&
  /failed: CUDA out of memory/.test(al34.last) && al34.kept === 3, JSON.stringify(al34));
check("  the log's own window mirrors it: both views, the Artist's lines, a new one as it comes",
  !!al34.pop && al34.pop.artist && al34.pop.mirrored && al34.pop.views === 2, JSON.stringify(al34.pop));

// HERESY 1169 · 1335 (Viktor 10.10.2026: «И по LoRA адаптерам сделай также суммарную силу как у Творца, чтобы не было прежёга из-за наложения адаптеров»)
section("the Artist's adapters together: from two of them a bar of their strengths' sum, zoned as the Creator's; dragged, all of them in proportion; Draw carries what the rows show");
const lt35 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), real = window.fetch, sent = [];
  const until = async (fn, ms) => { for (let i = 0; i < (ms || 3000) / 50; i++) { const v = fn(); if (v) return v; await wait(50); } return null; };
  const json = (b, s) => Promise.resolve(new Response(JSON.stringify(b), { status: s || 200, headers: { "Content-Type": "application/json" } }));
  const A = { id: "krea2/A.safetensors", family: "krea2", name: "A", folder: "", mb: 100, picture: false, info: {} };
  const B = { id: "krea2/B.safetensors", family: "krea2", name: "B", folder: "", mb: 100, picture: false, info: {} };
  window.fetch = (u, o) => { u = String(u);
    if (u.startsWith("/lab/artist/loras")) return json({ root: "artwork/loras", families: { krea2: [A, B], sdxl: [], "qwen-image-2.1": [], "qwen-image-2512": [] }, titles: {} });
    if (u.startsWith("/lab/artist/draw")) { sent.push(JSON.parse(o.body)); return json({ id: "20261010-230000-1335", status: "queued", of: 1, pictures: [], prompt: "x", shapes: ["1:1"], seed: 1, count: 1, painter: "krea2-q4" }, 202); }
    if (u.startsWith("/lab/artist/runs")) return json({ runs: [] });
    return real(u, o); };
  const saved = Object.keys(localStorage).filter((k) => k.startsWith("yue2.ar")).map((k) => [k, localStorage.getItem(k)]);
  document.querySelector('.topbar [data-tab="artist"]').click();
  await until(() => !document.getElementById("view-artist").classList.contains("is-hidden"), 4000); await wait(300);
  const $ = (id) => document.getElementById(id), o = {};
  $("arPainter").value = "krea2-q4"; $("arPainter").dispatchEvent(new Event("change"));
  await window.HeresyArtist.loras.reload();
  const bar = () => document.querySelector("#arLoraList .ar-lora-total");
  const look = () => { const b = bar(); return b ? { zone: ["is-green", "is-amber", "is-red"].filter((c) => b.classList.contains(c))[0], sum: b.querySelector("output").textContent,
    rows: [...document.querySelectorAll("#arLoraList [data-li] .ar-lora-wv")].map((x) => x.textContent).join(",") } : null; };
  window.HeresyArtist.loras.set([{ id: A.id, weight: 1 }], "krea2"); await wait(50);
  o.one = look();
  window.HeresyArtist.loras.set([{ id: A.id, weight: 0.8 }, { id: B.id, weight: 0.7 }], "krea2"); await wait(50);
  o.two = look();
  const drag = (v) => { const t = bar().querySelector("input"); t.value = String(v); t.dispatchEvent(new Event("input", { bubbles: true })); };
  const let_go = () => bar().querySelector("input").dispatchEvent(new Event("change", { bubbles: true }));
  drag(1.2); drag(1.0);                                         // one drag through two places: each from where it stood when the drag began
  o.dragged = look(); o.kept = window.HeresyArtist.loras.now().map((l) => l.weight).join(",");
  let_go(); await wait(30);
  drag(2.0); o.again = look();
  let_go(); await wait(30);
  const w = document.querySelector('#arLoraList [data-li="0"] .ar-lora-w'); w.value = "0.3"; w.dispatchEvent(new Event("input", { bubbles: true })); await wait(30);
  o.moved = look();
  $("arPrompt").value = "A fox"; $("arPrompt").dispatchEvent(new Event("input"));
  document.querySelector('#arShapes input[value="1:1"]').checked = true; $("arShapes").dispatchEvent(new Event("change"));
  $("arDraw").click();
  await until(() => sent.length, 3000);
  o.body = sent[0] ? sent[0].loras : null;
  window.fetch = real;
  Object.keys(localStorage).filter((k) => k.startsWith("yue2.ar")).forEach((k) => localStorage.removeItem(k));
  saved.forEach((kv) => localStorage.setItem(kv[0], kv[1]));
  await window.HeresyArtist.loras.reload();
  await window.HeresyArtist.reload();
  document.querySelector('.topbar [data-tab="create"]').click(); await wait(300);
  return o; })()`);
check("from two adapters a bar of their strengths together, zoned as the Creator's (amber past 1.2); one alone has none",
  lt35.one === null && !!lt35.two && lt35.two.zone === "is-amber" && lt35.two.sum === "1.50" && lt35.two.rows === "0.80,0.70", JSON.stringify(lt35));
check("  dragged, all of them move in proportion from where they stood when the drag began, on the 0.05 grid, kept for the next Draw; red past 1.8",
  !!lt35.dragged && lt35.dragged.sum === "1.00" && lt35.dragged.zone === "is-green" && lt35.dragged.rows === "0.55,0.45" && lt35.kept === "0.55,0.45" &&
  !!lt35.again && lt35.again.sum === "2.00" && lt35.again.zone === "is-red" && lt35.again.rows === "1.10,0.90", JSON.stringify(lt35));
check("  one strength moved: the sum follows it; Draw carries the strengths the rows show",
  !!lt35.moved && lt35.moved.sum === "1.20" && lt35.moved.zone === "is-green" && lt35.moved.rows === "0.30,0.90" &&
  JSON.stringify(lt35.body) === '[{"id":"krea2/A.safetensors","weight":0.3},{"id":"krea2/B.safetensors","weight":0.9}]', JSON.stringify(lt35));

// HERESY 1169 · 1336 (Viktor 10.10.2026: «По максимуму на картинки контекстное меню»)
section("a picture's menu: a right click on a run's picture, the gallery's, the stage's or the one over the page; what its items do; the live step has none");
const pm36 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), real = window.fetch, sent = [];
  const until = async (fn, ms) => { for (let i = 0; i < (ms || 3000) / 50; i++) { const v = fn(); if (v) return v; await wait(50); } return null; };
  const json = (b, s) => Promise.resolve(new Response(JSON.stringify(b), { status: s || 200, headers: { "Content-Type": "application/json" } }));
  const now = Date.now() / 1000, ID = "20261010-230500-1336", LIVE = "20261010-230700-1336";
  const pics = [{ file: "01-1x1-s501.png", thumb: "01-1x1-s501.thumb.jpg", shape: "1:1", w: 1024, h: 1024, seed: 501, kept: true },
                { file: "02-1x1-s502.png", thumb: "02-1x1-s502.thumb.jpg", shape: "1:1", w: 1024, h: 1024, seed: 502, kept: true }];
  const done = { id: ID, prompt: "A lighthouse in the storm", shapes: ["1:1"], seed: 501, count: 2, painter: "krea2-q4", created: now, status: "done", of: 2, pictures: pics,
                 sampling: { sampler: "res_2s", schedule: "beta" } };
  let runs = [done];
  window.fetch = (u, o) => { u = String(u);
    const body = o && o.body ? JSON.parse(o.body) : null;
    if (u.startsWith("/lab/artist/runs")) return json({ runs });
    if (u.startsWith("/lab/artist/star")) { sent.push(["star", body]); return json({ ok: true }); }
    if (u.startsWith("/lab/artist/upscalers")) return json({ upscalers: [{ name: "4x_Nomos8kDAT.pth", scale: 4, mb: 140.6 }] });
    if (u.startsWith("/lab/artist/upscale")) { sent.push(["upscale", body]); return json({ id: "20261010-230600-1336", kind: "upscale", status: "queued", of: 1, pictures: [], prompt: done.prompt, shapes: ["1:1"], seed: 501, count: 1, painter: "upscale", created: now }, 202); }
    if (u.startsWith("/lab/artist/aside")) { sent.push(["aside", body]); return json({ done: body.items, trashed: [] }); }
    return real(u, o); };
  const saved = Object.keys(localStorage).filter((k) => k.startsWith("yue2.ar")).map((k) => [k, localStorage.getItem(k)]);
  const $ = (id) => document.getElementById(id), o = {};
  document.querySelector('.topbar [data-tab="artist"]').click();
  await until(() => !document.getElementById("view-artist").classList.contains("is-hidden"), 4000); await wait(300);
  const lookWas = (document.querySelector("#arBar [data-look].is-on") || { dataset: {} }).dataset.look || "runs";
  await window.HeresyArtist.reload(); await wait(100);
  document.querySelector('#arBar [data-look="runs"]').click(); await wait(100);
  const menu = () => document.querySelector(".hm-menu");
  const labels = (m) => [...(m || menu() || document.createElement("div")).querySelectorAll(".hm-item .hm-label")].map((x) => x.textContent);
  const item = (label, m) => [...(m || menu() || document.createElement("div")).querySelectorAll(".hm-item")].find((b) => b.querySelector(".hm-label").textContent.indexOf(label) === 0);
  const right = (el) => { const r = el.getBoundingClientRect(), e = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: Math.round(r.left + 10), clientY: Math.round(r.top + 10) }); el.dispatchEvent(e); return e.defaultPrevented; };
  const runPic = (i) => document.querySelector('#arRuns .ar-run[data-id="' + ID + '"] .ar-pic[data-i="' + i + '"]');
  // a run's picture
  o.prevented = right(runPic(0));
  o.labels = labels();
  item("Star it").click(); await until(() => sent.some((s) => s[0] === "star"), 2000);
  o.star = (sent.filter((s) => s[0] === "star")[0] || [])[1] || null;
  right(runPic(1)); item("To the form").click(); await wait(50);
  o.form = { prompt: $("arPrompt").value, seed: $("arSeed").value, shape: [...document.querySelectorAll("#arShapes input:checked")].map((x) => x.value).join(",") };
  right(runPic(0)); item("All of it to the form").click(); await wait(50);
  const sn = window.HeresyArtist.sampling.now();
  o.all = { seed: $("arSeed").value, sampler: sn && sn.sampler, schedule: sn && sn.schedule };
  right(runPic(0)); item("Upscale").click(); await wait(80);
  const subs = document.querySelectorAll(".hm-menu");
  o.upLabels = subs.length > 1 ? labels(subs[subs.length - 1]) : [];
  if (subs.length > 1) item("2K", subs[subs.length - 1]).click();
  await until(() => sent.some((s) => s[0] === "upscale"), 3000);
  o.up = (sent.filter((s) => s[0] === "upscale")[0] || [])[1] || null;
  const clip = navigator.clipboard; let copied = null;
  try { Object.defineProperty(clip, "writeText", { value: (x) => { copied = x; return Promise.resolve(); }, configurable: true }); } catch (e) {}
  right(runPic(0)); item("Copy the seed").click(); await wait(50);
  o.copied = copied;
  try { delete clip.writeText; } catch (e) {}
  right(runPic(0)); item("To the trash").click(); await until(() => sent.some((s) => s[0] === "aside"), 2000);
  o.aside = (sent.filter((s) => s[0] === "aside")[0] || [])[1] || null;
  // the gallery's picture: over the page, and its menu there
  runs = [done]; await window.HeresyArtist.reload(); await wait(80);
  document.querySelector('#arBar [data-look="gallery"]').click(); await wait(120);
  const g0 = document.querySelector("#arRuns .ar-gpic[data-g]");
  o.galleryMenu = g0 ? (right(g0), labels()[0]) : null;
  if (g0) { item("Over the page").click(); await until(() => document.querySelector(".ar-view .art-img"), 2000); await wait(150); }
  const vimg = document.querySelector(".ar-view .art-img");
  o.viewMenu = vimg ? (right(vimg), { first: labels()[0], over: labels().indexOf("Over the page") >= 0, z: +getComputedStyle(menu()).zIndex, vz: +getComputedStyle(document.querySelector(".ar-view")).zIndex }) : null;
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await wait(60);
  o.escMenu = { menu: !!menu(), view: !!document.querySelector(".ar-view:not(.is-leaving)") };
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await wait(200);
  o.escView = !!document.querySelector(".ar-view:not(.is-leaving)");
  // its run, from the gallery
  const g1 = document.querySelector("#arRuns .ar-gpic[data-g]");
  if (g1) { right(g1); item("Its run").click(); await wait(150); }
  const card = document.querySelector('#arRuns .ar-run[data-id="' + ID + '"]');
  o.itsRun = { look: (document.querySelector("#arBar [data-look].is-on") || { dataset: {} }).dataset.look, flash: !!(card && card.classList.contains("is-flash")) };
  // the stage: the picture it shows has the menu; a run as it develops has none
  const sp = document.querySelector("#arStage .ar-stage-pic");
  o.stagePic = !!sp && !sp.classList.contains("is-live") && window.ruachArtistPicMenu(sp, 20, 20) === true && !!menu();
  if (window.HeresyMenu) window.HeresyMenu.close();
  runs = [Object.assign({}, done, { id: LIVE, status: "running", pictures: [], of: 2, gpu: 1 }), done];
  await window.HeresyArtist.reload(); await wait(100);
  const lv = document.querySelector("#arStage .ar-stage-pic");
  o.live = { isLive: !!lv && lv.classList.contains("is-live"), menu: lv ? window.ruachArtistPicMenu(lv, 20, 20) : null };
  if (window.HeresyMenu) window.HeresyMenu.close();
  window.fetch = real;
  runs = [];
  Object.keys(localStorage).filter((k) => k.startsWith("yue2.ar")).forEach((k) => localStorage.removeItem(k));
  saved.forEach((kv) => localStorage.setItem(kv[0], kv[1]));
  const lb = document.querySelector('#arBar [data-look="' + lookWas + '"]'); if (lb) lb.click();
  await window.HeresyArtist.reload();
  document.querySelector('.topbar [data-tab="create"]').click(); await wait(300);
  return o; })()`);
check("a right click on a run's picture opens its menu (the browser's own does not): over the page, the stage, the form, all of it, reference, compare, cover, upscale, star, pick, copy, download, its run, the trash",
  pm36.prevented && ["Over the page", "To the stage", "To the form", "All of it to the form", "As reference", "Compare…", "Set as cover", "Upscale", "Star it", "Pick it", "Copy the prompt", "Copy the seed · 501", "Download · PNG 1024×1024", "The file in a new tab", "Its run", "To the trash"]
    .every((x) => pm36.labels.indexOf(x) >= 0), JSON.stringify(pm36.labels));
check("  Star it stars that picture; To the form: its prompt, seed and shape; All of it: its sampling as well",
  !!pm36.star && pm36.star.id === "20261010-230500-1336" && pm36.star.file === "01-1x1-s501.png" && pm36.star.star === true &&
  pm36.form.prompt === "A lighthouse in the storm" && pm36.form.seed === "502" && pm36.form.shape === "1:1" &&
  pm36.all.seed === "501" && pm36.all.sampler === "res_2s" && pm36.all.schedule === "beta", JSON.stringify({ star: pm36.star, form: pm36.form, all: pm36.all }));
check("  Upscale opens 2K and 4K with the sizes they make; 2K upscales that picture with the upscaler the stage's row would take; the seed copied; the trash takes it",
  pm36.upLabels.join("|") === "2K · 2560×2560|4K · 3840×3840" && !!pm36.up && pm36.up.id === "20261010-230500-1336" && pm36.up.file === "01-1x1-s501.png" && pm36.up.target === "2k" && !!pm36.up.model &&
  pm36.copied === "501" && !!pm36.aside && pm36.aside.aside === true && JSON.stringify(pm36.aside.items) === '[{"id":"20261010-230500-1336","file":"01-1x1-s501.png"}]',
  JSON.stringify({ upLabels: pm36.upLabels, up: pm36.up, copied: pm36.copied, aside: pm36.aside }));
check("  the gallery's picture has it; over the page too, without Over the page, standing over the view; Esc closes the menu and leaves the picture, the next Esc the view",
  pm36.galleryMenu === "Over the page" && !!pm36.viewMenu && pm36.viewMenu.first === "To the stage" && !pm36.viewMenu.over && pm36.viewMenu.z > pm36.viewMenu.vz &&
  !pm36.escMenu.menu && pm36.escMenu.view && !pm36.escView, JSON.stringify({ galleryMenu: pm36.galleryMenu, viewMenu: pm36.viewMenu, escMenu: pm36.escMenu, escView: pm36.escView }));
check("  Its run goes to the Runs look and lights its card; the stage's picture has the menu, a run developing there has none",
  pm36.itsRun.look === "runs" && pm36.itsRun.flash && pm36.stagePic && pm36.live.isLive && pm36.live.menu === false, JSON.stringify({ itsRun: pm36.itsRun, stagePic: pm36.stagePic, live: pm36.live }));

// HERESY 1169 · 1337 (Viktor 10.10.2026: «картинки у нас куда удаляются с обложек треков и остального? Может отдельный Trash сделать в колонке воркспейсов? `Trash (Art)`. Вижу Trash у Артиста, но пока что очистки и удаления нет.»)
section("the art's trash: Trash (Art) in the library's column (runs, pictures put aside, covers taken off; ticked, given back or deleted for good, asked first; a frozen workspace's cover stays); the Artist's Trash look deletes for good too");
const ab37 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), real = window.fetch, sent = [];
  const until = async (fn, ms) => { for (let i = 0; i < (ms || 3000) / 50; i++) { const v = fn(); if (v) return v; await wait(50); } return null; };
  const json = (b, s) => Promise.resolve(new Response(JSON.stringify(b), { status: s || 200, headers: { "Content-Type": "application/json" } }));
  const now = Date.now() / 1000, R = "20261010-110000-1337", P = "20261010-120000-1337";
  const bin = { runs: [{ id: R, prompt: "A trashed run", painter: "krea2-q4", created: now - 7200, trashed_at: now - 3600, pictures: [{ file: "01-1x1-s1.png", thumb: "thumbs/01-1x1-s1.jpg", kept: true, shape: "1:1", seed: 1 }], bytes: 2000000 }],
    pictures: [{ id: P, file: "02-1x1-s2.png", thumb: "thumbs/02-1x1-s2.jpg", shape: "1:1", seed: 2, prompt: "Put aside", created: now - 600, bytes: 1000000 }],
    covers: [{ take: "t1337a", title: "Song One", stamp: "20261009-100000", when: now - 86400, bytes: 200000, prompt: "an old cover", frozen: false },
             { take: "t1337b", title: "Frozen Song", stamp: "20261008-090000", when: now - 172800, bytes: 100000, prompt: "", frozen: true }], bytes: 3300000 };
  window.fetch = (u, o) => { u = String(u);
    if (u.startsWith("/lab/artist/bin") && o && o.method === "POST") { const b = JSON.parse(o.body); sent.push(b); return json({ op: b.op, done: b.items || [{}, {}, {}], kept: [] }); }
    if (u.startsWith("/lab/artist/bin")) return json(bin);
    if (u.startsWith("/lab/artist/trashed")) return json({ runs: bin.runs });
    if (u.startsWith("/lab/artist/asides")) return json({ pictures: bin.pictures });
    return real(u, o); };
  const yes = async () => { const b = await until(() => document.querySelector(".hd-back.is-on:not(.is-leaving) .hd-yes"), 2000); const said = b ? b.closest(".hd-back").textContent : ""; if (b) b.click(); await wait(250); return said; };
  const $ = (id) => document.getElementById(id), o = {};
  document.querySelector('.topbar [data-tab="collection"]').click(); await wait(300);
  const place = () => document.querySelector('#collSide [data-place="__trash_art"]');
  o.placeThere = !!place();
  place().click(); await until(() => document.querySelector("#collGrid .coll-binart"), 3000); await wait(100);
  o.cards = [...document.querySelectorAll("#collGrid .coll-binart")].map((c) => c.dataset.akind + ":" + c.querySelector(".coll-title").textContent);
  o.count = ((place() || document.body).querySelector(".coll-n") || {}).textContent || "";
  o.frozenOff = !!document.querySelector("#collGrid .coll-binart.is-frozen input[data-asel]:disabled");
  o.daysHidden = $("collTrashDays").closest("label").style.display === "none";
  o.empty0 = $("collEmpty").textContent; o.restoreOff = $("collRestore").disabled; o.where = $("collWhere").textContent;
  document.querySelector('#collGrid input[data-asel="cover:t1337a|20261009-100000"]').click(); await wait(50);
  o.empty1 = $("collEmpty").textContent;
  $("collRestore").click(); await until(() => sent.length >= 1, 2000); await wait(200);
  o.restore = sent[0] || null;
  $("collTSelAll").click(); await wait(50);
  o.ticked = document.querySelectorAll("#collGrid input[data-asel]:checked").length;
  $("collEmpty").click(); o.ask1 = await yes(); await until(() => sent.length >= 2, 2000); await wait(150);
  o.del = sent[1] || null;
  $("collTSelNone").click(); await wait(50);
  $("collEmpty").click(); o.ask2 = await yes(); await until(() => sent.length >= 3, 2000); await wait(150);
  o.wipe = sent[2] || null;
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "a", ctrlKey: true, bubbles: true })); await wait(50);   // no take ticked here, none sent to the trash
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true })); await wait(300);
  const asked = document.querySelector(".hd-back.is-on:not(.is-leaving) .hd-no");
  o.noAsk = !asked; if (asked) { asked.click(); await wait(250); }
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await wait(50);
  document.querySelector('#collSide [data-place="__trash"]').click(); await wait(400);
  o.daysBack = $("collTrashDays").closest("label").style.display === "";
  document.querySelector('#collSide [data-place=""]').click(); await wait(200);
  // the Artist's Trash look
  document.querySelector('.topbar [data-tab="artist"]').click();
  await until(() => !document.getElementById("view-artist").classList.contains("is-hidden"), 4000); await wait(300);
  const lookWas = (document.querySelector("#arBar [data-look].is-on") || { dataset: {} }).dataset.look || "runs";
  document.querySelector('#arBar [data-look="trash"]').click();
  await until(() => document.querySelector("#arRuns .ar-trash-head"), 3000); await wait(100);
  o.head = !!document.querySelector("#arRuns .ar-trash-head [data-wipe]");
  document.querySelector('#arRuns [data-purge="' + R + '"]').click(); o.ask3 = await yes(); await until(() => sent.length >= 4, 2000);
  o.purgeRun = sent[3] || null;
  await until(() => document.querySelector('#arRuns [data-purge-pic="0"]'), 2000);
  document.querySelector('#arRuns [data-purge-pic="0"]').click(); o.ask4 = await yes(); await until(() => sent.length >= 5, 2000);
  o.purgePic = sent[4] || null;
  await until(() => document.querySelector("#arRuns [data-wipe]"), 2000);
  document.querySelector("#arRuns [data-wipe]").click(); o.ask5 = await yes(); await until(() => sent.length >= 6, 2000);
  o.wipeArtist = sent[5] || null;
  const lb = document.querySelector('#arBar [data-look="' + lookWas + '"]'); if (lb) lb.click();
  window.fetch = real;
  await window.HeresyArtist.reload();
  document.querySelector('.topbar [data-tab="create"]').click(); await wait(300);
  return o; })()`);
check("Trash (Art) stands in the library's column; opened, it lists the Artist's run, the picture put aside and both covers, 4 in the column; a frozen workspace's cover cannot be ticked; Empty by itself is the takes' trash's own",
  ab37.placeThere && ab37.cards.join("|") === "run:A trashed run|picture:Put aside|cover:Song One|cover:Frozen Song" && ab37.count === "4" && ab37.frozenOff && ab37.daysHidden &&
  ab37.empty0 === "Wipe out the art's trash" && ab37.restoreOff && /Trash \(Art\)/.test(ab37.where), JSON.stringify(ab37));
check("  a cover ticked is given back; all ticked (not the frozen) are deleted for good after the question; none ticked, Wipe out asks and sends the whole trash, the frozen said to stay",
  ab37.empty1 === "Delete 1 for good" && JSON.stringify(ab37.restore) === '{"op":"restore","items":[{"kind":"cover","take":"t1337a","stamp":"20261009-100000"}]}' && ab37.ticked === 3 &&
  /Delete for good: 1 run, 1 picture, 1 cover/.test(ab37.ask1) && !!ab37.del && ab37.del.op === "delete" && ab37.del.items.length === 3 &&
  /Wipe out the art's trash: 1 run, 1 picture, 1 cover/.test(ab37.ask2) && /frozen workspace/.test(ab37.ask2) && JSON.stringify(ab37.wipe) === '{"op":"empty"}',
  JSON.stringify({ restore: ab37.restore, ticked: ab37.ticked, ask1: ab37.ask1, del: ab37.del, ask2: ab37.ask2, wipe: ab37.wipe }));
check("  there Ctrl+A ticks no take and Delete sends none to the trash; the takes' Trash has its Empty by itself again",
  ab37.noAsk && ab37.daysBack, JSON.stringify({ noAsk: ab37.noAsk, daysBack: ab37.daysBack }));
check("  the Artist's Trash look: Delete for good on a run and on a picture put aside, Wipe out for all it shows (never the covers), each asked first",
  ab37.head && /Delete this run for good, with its 1 picture/.test(ab37.ask3) && JSON.stringify(ab37.purgeRun) === '{"op":"delete","items":[{"kind":"run","id":"20261010-110000-1337"}]}' &&
  /Delete this picture for good/.test(ab37.ask4) && JSON.stringify(ab37.purgePic) === '{"op":"delete","items":[{"kind":"picture","id":"20261010-120000-1337","file":"02-1x1-s2.png"}]}' &&
  /covers taken off the takes stay/.test(ab37.ask5) && !!ab37.wipeArtist && ab37.wipeArtist.op === "delete" && ab37.wipeArtist.items.length === 2,
  JSON.stringify({ head: ab37.head, ask3: ab37.ask3, purgeRun: ab37.purgeRun, ask4: ab37.ask4, purgePic: ab37.purgePic, ask5: ab37.ask5, wipeArtist: ab37.wipeArtist }));

// HERESY 1169 · 1338 (Viktor 10.10.2026: «И в настройках движка, в Engine не забудь прописать выборы всех генеративных art моделей. Там только qwen сейчас.»)
section("Engine → Artwork: the Qwen painters this machine has beside Krea (each fine-tune its own line, Lightning said); one chosen, a take's artwork asks for it");   // 1405: SDXL gone
const ap38 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), real = window.fetch, asked = [];
  const json = (b, s) => Promise.resolve(new Response(JSON.stringify(b), { status: s || 200, headers: { "Content-Type": "application/json" } }));
  const sel = document.getElementById("artPainter"), before = [...sel.options].map((o) => o.value), was = localStorage.getItem("yue2.artPainter"), o = {};
  const list = [{ key: "krea2-q4", label: "Krea 2 Muse · Q4", need_mb: 13500, ready: true },
    { key: "qwen2512-q4", label: "Qwen-Image 2512 · Q4", need_mb: 15500, ready: true, lightning: true },
    { key: "qwen2512-q6", label: "Qwen-Image 2512 · Q6", need_mb: 20000, ready: false, lightning: true },
    { key: "qwen2512-fp8", label: "Qwen-Image 2512 · fp8", need_mb: 22500, ready: true, lightning: true, models: ["Jib_v6.safetensors", "Real_v2.safetensors"] },
    { key: "qwen21", label: "Qwen-Image 2.1 · research licence", need_mb: 21000, ready: true }];
  const rows = window.ruachArtPainters(list);
  o.values = rows.map((r) => r[0]);
  o.labels = rows.filter((r) => /^qwen/.test(r[0])).map((r) => r[1]);
  o.again = window.ruachArtPainters(list).length === rows.length;            // asked twice, each line once
  sel.value = "qwen2512-fp8:Jib_v6.safetensors"; sel.dispatchEvent(new Event("change"));
  o.kept = localStorage.getItem("yue2.artPainter");
  window.fetch = (u, opt) => { u = String(u);
    if (u.startsWith("/lab/art/draw")) { asked.push(u); return json({ status: "done", name: "t1338" }); }
    if (u.startsWith("/lab/arts")) return json({ arts: {}, unseen: [], credits: {} });
    return real(u, opt); };
  await window.HeresyArt.draw("t1338", false, true); await wait(100);
  o.asked = asked[0] || "";
  window.fetch = real;
  if (was === null) localStorage.removeItem("yue2.artPainter"); else localStorage.setItem("yue2.artPainter", was);
  [...sel.options].forEach((x) => { if (before.indexOf(x.value) < 0) x.remove(); });
  sel.value = was || "";
  return o; })()`);
check("Engine → Artwork lists the Qwen painters here beside Krea (no SDXL since 1405): 2512 Q4 with Lightning, each fp8 fine-tune its own line, 2.1 with its licence said; one not here is not offered; asked twice, each line once",
  ["", "krea2-q4", "krea2-q8", "qwen2512-q4", "qwen2512-fp8:Jib_v6.safetensors", "qwen2512-fp8:Real_v2.safetensors", "qwen21"].every((v) => ap38.values.indexOf(v) >= 0) && ap38.values.indexOf("sdxl") < 0 &&
  ap38.values.indexOf("qwen2512-q6") < 0 && ap38.again &&
  ap38.labels.indexOf("Qwen-Image 2512 · Q4 · Lightning · about 15 GB · about 125 s a picture") >= 0 &&
  ap38.labels.indexOf("Qwen-Image 2512 · Jib_v6 · Lightning · about 22 GB · about 40 s a picture") >= 0 &&
  ap38.labels.some((x) => /^Qwen-Image 2\.1 · research licence · not for a song that is sold/.test(x)), JSON.stringify(ap38));
check("  a fine-tune chosen is kept, and a take's artwork asks the lab for it by name",
  ap38.kept === "qwen2512-fp8:Jib_v6.safetensors" && /[?&]painter=qwen2512-fp8%3AJib_v6\.safetensors/.test(ap38.asked), JSON.stringify({ kept: ap38.kept, asked: ap38.asked }));

// HERESY 1169 · 1333c: the second sampling matrix (24 pictures, 10.10.2026): KL optimal under Lightning painted the subject twice too
section("the Artist's sampling: KL optimal under Lightning warned as Karras and Exponential are; Bong tangent and SGM uniform not; Krea not");
const kl33 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), real = window.fetch;
  const until = async (fn, ms) => { for (let i = 0; i < (ms || 3000) / 50; i++) { const v = fn(); if (v) return v; await wait(50); } return null; };
  const json = (b, s) => Promise.resolve(new Response(JSON.stringify(b), { status: s || 200, headers: { "Content-Type": "application/json" } }));
  const painters = [{ key: "krea2-q4", label: "Krea 2 Muse · Q4", need_mb: 12500, family: "krea2", ready: true },
    { key: "qwen2512-q4", label: "Qwen-Image 2512 · Q4", need_mb: 15500, family: "qwen-image-2512", ready: true, lightning: true }];
  window.fetch = (u, o) => { u = String(u);
    if (u.startsWith("/lab/artist/painters")) return json({ painters });
    if (u.startsWith("/lab/artist/loras")) return json({ root: "artwork/loras", families: { krea2: [], "qwen-image-2512": [], "qwen-image-2.1": [], sdxl: [] }, titles: {} });
    return real(u, o); };
  const keys = ["yue2.arPainter", "yue2.arSampling"], was = keys.map((k) => localStorage.getItem(k));
  localStorage.removeItem("yue2.arSampling");
  document.querySelector('.topbar [data-tab="artist"]').click();
  await until(() => !document.getElementById("view-artist").classList.contains("is-hidden"), 4000); await wait(300);
  await window.HeresyArtist.painters(); await wait(100);
  const $ = (id) => document.getElementById(id), set = (id, v) => { $(id).value = v; $(id).dispatchEvent(new Event("change")); }, seen = (id) => !!$(id).offsetParent;
  $("arSampling").open = true;
  set("arPainter", "qwen2512-q4"); await wait(50);
  const o = {};
  for (const c of ["kl_optimal", "bong_tangent", "sgm_uniform"]) { set("arSchedule", c); await wait(50); o[c] = seen("arSampWarn") ? $("arSampWarn").textContent : ""; }
  set("arPainter", "krea2-q4"); await wait(50); set("arSchedule", "kl_optimal"); await wait(50);
  o.krea = seen("arSampWarn");
  window.fetch = real;
  keys.forEach((k, i) => { if (was[i] === null) localStorage.removeItem(k); else localStorage.setItem(k, was[i]); });
  await window.HeresyArtist.painters();
  document.querySelector('.topbar [data-tab="create"]').click(); await wait(200);
  return o; })()`);
check("Lightning under KL optimal warned (twice the subject, KL optimal named); under Bong tangent and SGM uniform not; Krea under KL optimal not",
  /twice/.test(kl33.kl_optimal) && /KL optimal/.test(kl33.kl_optimal) && !kl33.bong_tangent && !kl33.sgm_uniform && !kl33.krea, JSON.stringify(kl33));

// HERESY 1169 · 1339 (Viktor 10.10.2026: «Жги переводы дальше, бро, и доводи всё до всех запланированных языков»): the page in Russian
// for a moment: the Artist's counts in their forms, a dialog's paragraphs kept, the lyrics' mirror left as typed, the gutter's names
section("the page in six languages: counts in their forms, a dialog's paragraphs kept, the lyrics' mirror as typed, the gutter translated");
const tr39 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), L = window.RuachI18n, o = {};
  const until = async (fn, ms) => { for (let i = 0; i < (ms || 3000) / 50; i++) { const v = fn(); if (v) return v; await wait(50); } return null; };
  o.forms = {};
  for (const c of ["ru", "uk", "be", "el", "es", "it"]) o.forms[c] = ["1 picture", "3 pictures", "5 pictures", "21 pictures", "2 runs in the trash"].map((s) => L.look(s, c));
  const was = localStorage.getItem("yue2.lang"), lyr = document.getElementById("lyrics"), lyrWas = lyr.value;
  L.set("ru"); await wait(300);
  // a dialog: its title and its paragraphs in Russian, the paragraphs kept apart
  const body = "It takes: the boxes' undo history, a lifted frame, the music playing, a writer's answer still on its way, an upload under way.\\n\\n" +
    "It keeps: the song in the form (its words and its knobs), a run under way (it comes back with its clock), the library, the Writer's notebook.\\n\\nCtrl+F5 reloads at once.";
  const asked = window.HeresyDialog.confirm("Reload the page?\\n\\n" + body, { ok: "Reload", cancel: "Stay" });
  const box = await until(() => document.querySelector(".hd-back.is-on:not(.is-leaving) .hd-box"), 3000); await wait(150);
  o.title = box ? box.querySelector(".hd-title").textContent : "";
  o.body = box ? box.querySelector(".hd-body").textContent : "";
  o.stay = box ? box.querySelector(".hd-no").textContent : "";
  if (box) box.querySelector(".hd-no").click();
  await asked;
  // the lyrics' mirror keeps the typed word though the catalog knows it; the gutter's section name is translated
  const known = ["End", "Outro", "Intro", "Stop", "Save"].filter((w) => L.look(w, "ru") !== null)[0] || "End";
  lyr.value = "[Verse]\\nla la la la\\nla la la\\n" + known + "\\n\\n[Chorus]\\nla la la la"; lyr.dispatchEvent(new Event("input", { bubbles: true }));
  await wait(400);
  const mirror = lyr.parentNode.querySelector(".lyr-mirror");
  o.known = known; o.mirror = mirror ? mirror.textContent.indexOf(known) >= 0 : null;
  const heads = Array.prototype.map.call(lyr.parentNode.querySelectorAll(".lyr-gutter .lyr-head > span > span"), (s) => s.textContent);
  o.heads = heads;
  lyr.value = lyrWas; lyr.dispatchEvent(new Event("input", { bubbles: true }));
  L.set(was || "en"); if (was === null) localStorage.removeItem("yue2.lang");
  await wait(300);
  o.back = document.documentElement.lang;
  return o; })()`);
check("a count says itself in each language's forms: 1 картинка, 3 картинки, 5 картинок, 21 картинка; 3 малюнкі, 3 εικόνες, 3 imágenes, 3 immagini",
  JSON.stringify(tr39.forms.ru.slice(0, 4)) === JSON.stringify(["1 картинка", "3 картинки", "5 картинок", "21 картинка"]) && tr39.forms.be[1] === "3 малюнкі" &&
  tr39.forms.el[1] === "3 εικόνες" && tr39.forms.es[1] === "3 imágenes" && tr39.forms.it[1] === "3 immagini" && /^2 рана в корзине$/.test(tr39.forms.ru[4]), JSON.stringify(tr39.forms));
check("  a dialog in Russian: its title, its buttons, and its paragraphs kept apart (pre-line: «\\n\\n» between them)",
  tr39.title === "Перезагрузить страницу?" && tr39.stay === "Остаться" && /^Она заберёт:/.test(tr39.body) && /\n\nОна сохранит:/.test(tr39.body) && /\n\nCtrl\+F5/.test(tr39.body), JSON.stringify([tr39.title, tr39.stay, tr39.body.slice(0, 80)]));
check("  the lyrics' mirror keeps the typed word though the catalog knows it («" + tr39.known + "»); the gutter's section names in Russian",
  tr39.mirror === true && tr39.heads.length >= 1 && tr39.heads.every((h) => /[а-яё]/i.test(h)), JSON.stringify(tr39));
check("  the page back in its language after", tr39.back === "en", tr39.back);
// HERESY 1169 · 1339e: the cheat-sheet's second line in the page's language (its own Russian in English and Russian)
const hi39 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), L = window.RuachI18n, was = localStorage.getItem("yue2.lang"), o = {};
  const first = () => { const r = document.querySelector("#hiTable .hi-say .hi-ru"); return r ? r.textContent : null; };
  window.HeresyInstruments.open("duduk", "instruments"); await wait(400);
  o.en = first();
  L.set("uk"); await wait(400); o.uk = first();
  L.set("es"); await wait(400); o.es = first();
  L.set("ru"); await wait(400); o.ru = first();
  L.set(was || "en"); if (was === null) localStorage.removeItem("yue2.lang");
  await wait(300); o.back = first();
  document.getElementById("hiClose").click(); await wait(150);
  return o; })()`);
check("the cheat-sheet's second line follows the language: Ukrainian and Spanish from the catalogs, the sheet's own Russian in Russian and English",
  /^Абрикосовая/.test(hi39.en || "") && /^Подвійна тростина/.test(hi39.uk || "") && /^Doble lengüeta/.test(hi39.es || "") && /^Абрикосовая/.test(hi39.ru || "") && /^Абрикосовая/.test(hi39.back || ""), JSON.stringify(hi39));

// HERESY 1169 · 1340 (Viktor 10.10.2026: «Левая колонка Художника не прокручивается независимо»; «Среднюю колонку фрейм промпта растянуть до пола»;
// «по повторному клику на миниатюру убрать её из средней колонки и вернуть текущую картинку в проявке»; «разреши батчинг/очередь до двух батчей»;
// «Картинки предпросмотра LoRA адаптеров… без обрезки»)
section("the Artist room by Viktor's evening list: two runs at a time, a thumbnail clicked again, the form's own scroll, the tall prompt, whole LoRA pictures");
const ar40Was = await ev(`document.body.dataset.tab`);
const ar40Size = await ev(`[window.innerWidth, window.innerHeight]`);
await send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
await ev(`(() => { const real = window.fetch; window.__ar40Fetch = real; window.__ar40Asked = [];
  const long = Array.from({ length: 28 }, (_, i) => "Sentence " + (i + 1) + " of a long prompt about a lighthouse at dusk, its lamp turning over a quiet sea.").join(" ");
  window.__ar40Runs = [
    { id: "20261010-181000-bbbb", prompt: "A boat at dawn.", shapes: ["1:1"], seed: 9, count: 1, painter: "krea2-q4", created: 1791590000, status: "running", of: 1, pictures: [], gpu: 1 },
    { id: "20261010-180000-aaaa", prompt: long, shapes: ["1:1"], seed: 7, count: 1, painter: "krea2-q4", created: 1791580000, status: "done", of: 1, took: 40, ended: 1791580040,
      pictures: [{ n: 1, shape: "1:1", seed: 7, w: 1280, h: 1280, kept: true, took: 40, file: "01-1x1-s7.png", thumb: "thumbs/01-1x1-s7.jpg" }] }];
  const json = (b, s) => Promise.resolve(new Response(JSON.stringify(b), { status: s || 200, headers: { "Content-Type": "application/json" } }));
  window.fetch = (u, o) => {
    u = String(u);
    if (u.startsWith("/lab/artist/runs")) return json({ runs: window.__ar40Runs });
    if (u.startsWith("/lab/artist/stop")) { const b = JSON.parse(o.body); window.__ar40Asked.push(b); return json({ id: b.id, stopping: true }); }
    if (u.startsWith("/lab/artist/draw")) { window.__ar40Asked.push({ draw: 1 }); return json({ error: "stubbed" }, 500); }
    return real(u, o);
  };
  return true; })()`);
await ev(`document.getElementById("tabArtist").click(); true`);
await ev(`window.HeresyArtist.reload(); true`);
await waitFor(`document.querySelectorAll('#arRuns .ar-run[data-id="20261010-180000-aaaa"] .ar-thumb').length === 1`, 5000, 50);
const ar40 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), $ = (id) => document.getElementById(id), o = {};
  const p = $("arPrompt"); p.value = "A third boat."; p.dispatchEvent(new Event("input", { bubbles: true }));
  await wait(150);
  // one run going: Draw draws (a second waits behind it), Stop beside it
  o.one = { text: $("arDraw").textContent, on: !$("arDraw").disabled, stop: !$("arStop").hidden, tip: $("arDraw").dataset.tip };
  // two going: Draw waits for one of them, Ctrl+Enter asks nothing
  window.__ar40Runs.unshift({ id: "20261010-182000-cccc", prompt: "A third.", shapes: ["1:1"], seed: 11, count: 1, painter: "krea2-q4", created: 1791600000, status: "queued", of: 1, pictures: [] });
  window.HeresyArtist.reload();
  for (let i = 0; i < 40 && !document.querySelector('#arRuns .ar-run[data-id="20261010-182000-cccc"]'); i++) await wait(100);
  await wait(150);
  p.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true, cancelable: true }));
  await wait(200);
  o.two = { on: !$("arDraw").disabled, tip: $("arDraw").dataset.tip, asked: window.__ar40Asked.length };
  window.__ar40Runs.shift();
  window.HeresyArtist.reload();
  for (let i = 0; i < 40 && document.querySelector('#arRuns .ar-run[data-id="20261010-182000-cccc"]'); i++) await wait(100);
  await wait(150);
  o.again = !$("arDraw").disabled;
  // a thumbnail clicked again while a run paints: the stage back to the run
  const th = () => document.querySelector('#arRuns .ar-run[data-id="20261010-180000-aaaa"] .ar-thumb[data-act="view"]');
  const stage = () => document.querySelector("#arStage .ar-stage-pic.is-live") ? "live" : document.querySelector('#arStage .ar-stage-pic[data-stage="view"]') ? "pic" : "other";
  o.before = stage();
  th().click(); await wait(250); o.first = stage();
  // the picture on the stage: the stage as tall as the window under it, its prompt down to the floor
  const st = $("arStage"), pr = st.querySelector(".ar-stage-prompt"), avail = parseFloat(getComputedStyle($("arCols")).getPropertyValue("--ar-avail"));
  o.tall = { cls: st.classList.contains("is-tall"), max: pr ? getComputedStyle(pr).maxHeight : "", h: pr ? pr.clientHeight : 0, avail: avail, stageH: st.offsetHeight,
             gap: pr ? Math.round(st.getBoundingClientRect().bottom - pr.getBoundingClientRect().bottom) : -1 };
  th().click(); await wait(250); o.second = stage();
  th().click(); await wait(250); o.third = stage();
  // the form scrolls on its own
  const left = document.querySelector(".ar-cols > .ar-left"), cs = getComputedStyle(left), view = $("view-artist"), vt = view ? view.scrollTop : 0;
  o.left = { oy: cs.overflowY, max: cs.maxHeight, sh: left.scrollHeight, ch: left.clientHeight, fixed: !!view && view.classList.contains("ar-fixed"), h: cs.height };   // 1344: a tall window fixes the room
  left.scrollTop = 160; await wait(100);
  o.left.top = left.scrollTop; o.left.viewSame = !view || view.scrollTop === vt;
  left.scrollTop = 0;
  // a LoRA card's picture whole, not cropped
  const card = document.createElement("div"); card.className = "ar-lib-card"; card.innerHTML = '<img alt="" />'; document.body.appendChild(card);
  o.fit = getComputedStyle(card.querySelector("img")).objectFit; card.remove();
  window.fetch = window.__ar40Fetch;
  return o; })()`);
await send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 760, deviceScaleFactor: 1, mobile: false });
await sleep(400);
const ar40b = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), left = document.querySelector(".ar-cols > .ar-left");
  window.dispatchEvent(new Event("resize")); await wait(200);
  const o = { sh: left.scrollHeight, ch: left.clientHeight, max: getComputedStyle(left).maxHeight };
  left.scrollTop = 200; await wait(100); o.top = left.scrollTop; left.scrollTop = 0;
  return o; })()`);
await send("Emulation.setDeviceMetricsOverride", { width: ar40Size[0], height: ar40Size[1], deviceScaleFactor: 1, mobile: false });
await ev(`window.HeresyArtist.reload(); document.querySelector('.topbar [data-tab="' + ${JSON.stringify(ar40Was || "create")} + '"]').click(); true`);
await sleep(300);
check("the Artist with one run going: Draw stays Draw and enabled (a second run waits behind it), its tip says so, Stop shows beside it",
  ar40.one.text === "Draw" && ar40.one.on && ar40.one.stop && /waits behind/.test(ar40.one.tip || ""), JSON.stringify(ar40.one));
check("the Artist with two runs going: Draw waits for one of them (its tip says two at a time), Ctrl+Enter asks the lab nothing; one gone, Draw draws again",
  !ar40.two.on && /Two runs at a time/.test(ar40.two.tip || "") && ar40.two.asked === 0 && ar40.again, JSON.stringify({ two: ar40.two, again: ar40.again }));
check("a thumbnail clicked while a run paints puts its picture on the stage; clicked again, the stage goes back to the run as it develops; a third time, the picture again",
  ar40.before === "live" && ar40.first === "pic" && ar40.second === "live" && ar40.third === "pic", JSON.stringify(ar40));
check("the Artist's stage with a picture is as tall as the window under it; its prompt is whole in the picture's tip (no 9.5em cap: 1345)",
  ar40.tall.cls && ar40.tall.max === "none" && Math.abs(ar40.tall.stageH - ar40.tall.avail) <= 3 && ar40.tall.h >= 100, JSON.stringify(ar40.tall));
check("the Artist's form scrolls on its own within the window's height, the room standing still",
  ar40.left.oy === "auto" && (/px$/.test(ar40.left.max) || (ar40.left.fixed && /px$/.test(ar40.left.h))) && ar40.left.viewSame && ar40b.sh > ar40b.ch && ar40b.top > 0 && /px$/.test(ar40b.max),
  JSON.stringify({ wide: ar40.left, low: ar40b }));
check("a LoRA card's picture is fitted whole into its square, not cropped", ar40.fit === "contain", ar40.fit);

// HERESY 1169 · 1341 (Viktor 10.10.2026: «Как у Творца мы можем отключить адаптер, не удаляя его из включенных, сделай так же, чтобы не удалять из списка и не двигать ползунок на ноль»)
section("the Artist's adapters muted as the Creator's: right-click, kept in the list at their strength, left out of the run");
const ar41Was = await ev(`document.body.dataset.tab`);
await ev(`(() => { const real = window.fetch; window.__ar41Fetch = real; window.__ar41Bodies = [];
  window.__ar41Keep = localStorage.getItem("yue2.arLoras"); window.__ar41Painter = document.getElementById("arPainter").value; window.__ar41PainterKept = localStorage.getItem("yue2.arPainter");
  const fam = [{ id: "krea2/a.safetensors", name: "a.safetensors", mb: 120 }, { id: "krea2/b.safetensors", name: "b.safetensors", mb: 130 }, { id: "krea2/c.safetensors", name: "c.safetensors", mb: 140 }];
  const json = (b, s) => Promise.resolve(new Response(JSON.stringify(b), { status: s || 200, headers: { "Content-Type": "application/json" } }));
  window.fetch = (u, o) => {
    u = String(u);
    if (u.startsWith("/lab/artist/loras")) return json({ families: { krea2: fam }, titles: { krea2: "Krea 2" } });
    if (u.startsWith("/lab/artist/runs")) return json({ runs: [] });
    if (u.startsWith("/lab/artist/painters")) return json({ painters: [{ key: "krea2-q4", label: "Krea 2 Muse · Q4", need_mb: 12500, family: "krea2", ready: true }] });
    if (u.startsWith("/lab/artist/draw")) { window.__ar41Bodies.push(JSON.parse(o.body)); return json({ error: "stubbed" }, 500); }
    return real(u, o);
  };
  localStorage.setItem("yue2.arLoras", JSON.stringify({ krea2: [{ id: "krea2/a.safetensors", weight: 0.8 }, { id: "krea2/b.safetensors", weight: 0 }, { id: "krea2/c.safetensors", weight: 0.6 }] }));
  return true; })()`);
await ev(`document.getElementById("tabArtist").click(); true`);
await ev(`(async () => { localStorage.removeItem("yue2.arPainter"); await window.HeresyArtist.painters(); const p = document.getElementById("arPainter");
  if (p.value !== "krea2-q4") { p.value = "krea2-q4"; p.dispatchEvent(new Event("change", { bubbles: true })); } await window.HeresyArtist.loras.reload(); await window.HeresyArtist.reload(); return p.value; })()`);
await waitFor(`document.querySelectorAll("#arLoraList .ar-lora").length === 3`, 5000, 50);
await sleep(300);
await waitFor(`document.querySelectorAll("#arLoraList .ar-lora").length === 3`, 3000, 50);
const ar41 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), $ = (id) => document.getElementById(id), o = {};
  const row = (i) => document.querySelector('#arLoraList .ar-lora[data-li="' + i + '"]');
  const menu = async (i, re) => {
    const r = row(i).querySelector(".ar-lora-name"), b = r.getBoundingClientRect();
    r.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: b.left + 5, clientY: b.top + 5 }));
    await wait(150);
    const items = Array.from(document.querySelectorAll(".hm-menu .hm-item"));
    const it = items.filter((x) => re.test(x.textContent))[0];
    const labels = items.map((x) => x.textContent);
    if (it) it.click();
    await wait(200);
    return labels;
  };
  o.painterBefore = $("arPainter").value;
  o.menu = await menu(0, /Mute/);
  const st = () => JSON.parse(localStorage.getItem("yue2.arLoras") || "{}").krea2 || [];
  o.kept = st().map((l) => [l.id.split("/")[1], l.weight, !!l.muted]);
  o.rowMuted = row(0).classList.contains("is-muted"); o.tag = !!row(0).querySelector(".lora-muted-tag"); o.rows = document.querySelectorAll("#arLoraList .ar-lora").length;
  const tot = document.querySelector("#arLoraList .ar-lora-total output"); o.total = tot ? tot.textContent : null;
  // Draw: the muted one and the one at nought are not sent
  $("arPrompt").value = "A lighthouse."; $("arPrompt").dispatchEvent(new Event("input", { bubbles: true }));
  if (!document.querySelector("#arShapes input:checked")) { const c = document.querySelector("#arShapes input"); c.checked = true; c.dispatchEvent(new Event("change", { bubbles: true })); }
  await wait(100);
  $("arDraw").click(); await wait(400);
  o.sent = (window.__ar41Bodies[0] && window.__ar41Bodies[0].loras) || null;
  // a refused draw may read the painters again: the adapters' family back to Krea 2's, its rows drawn
  const p2 = $("arPainter"); o.painterAfter = p2.value;
  if (p2.value !== "krea2-q4" && p2.querySelector('option[value="krea2-q4"]')) { p2.value = "krea2-q4"; p2.dispatchEvent(new Event("change", { bubbles: true })); }
  for (let i = 0; i < 40 && document.querySelectorAll("#arLoraList .ar-lora").length !== 3; i++) await wait(100);
  if (!row(0)) { o.noRows = document.getElementById("arLoraList").innerHTML.slice(0, 200); window.fetch = window.__ar41Fetch; return o; }
  // the together-bar dragged: the muted one keeps its strength
  const tw = document.querySelector("#arLoraList .ar-lora-tw");
  if (tw) { tw.value = "1.2"; tw.dispatchEvent(new Event("input", { bubbles: true })); tw.dispatchEvent(new Event("change", { bubbles: true })); await wait(100); }
  o.dragged = st().map((l) => [l.id.split("/")[1], l.weight, !!l.muted]);
  o.menu2 = await menu(0, /Unmute/);
  o.after = st().map((l) => [l.id.split("/")[1], l.weight, !!l.muted]); o.rowAfter = row(0).classList.contains("is-muted");
  window.fetch = window.__ar41Fetch;
  await window.HeresyArtist.loras.reload();
  if (window.__ar41Keep == null) localStorage.removeItem("yue2.arLoras"); else localStorage.setItem("yue2.arLoras", window.__ar41Keep);
  if (window.__ar41PainterKept == null) localStorage.removeItem("yue2.arPainter"); else localStorage.setItem("yue2.arPainter", window.__ar41PainterKept);
  const p = $("arPainter"); if (p.value !== window.__ar41Painter && p.querySelector('option[value="' + window.__ar41Painter + '"]')) { p.value = window.__ar41Painter; p.dispatchEvent(new Event("change", { bubbles: true })); }
  return o; })()`);
await ev(`window.HeresyArtist.reload(); document.querySelector('.topbar [data-tab="' + ${JSON.stringify(ar41Was || "create")} + '"]').click(); true`);
await sleep(300);
check("an Artist adapter's right-click offers Mute and Take it off; muted, it stays in the list at its strength, dimmed with its tag, out of the together-bar",
  ar41.menu.some((x) => /Mute: left out of the run/.test(x)) && ar41.menu.some((x) => /Take it off/.test(x)) && ar41.rows === 3 && ar41.rowMuted && ar41.tag &&
  JSON.stringify(ar41.kept) === JSON.stringify([["a.safetensors", 0.8, true], ["b.safetensors", 0, false], ["c.safetensors", 0.6, false]]) && ar41.total === "0.60", JSON.stringify(ar41));
check("Draw sends neither a muted adapter nor one at nought; the together-bar's drag leaves the muted one as it was",
  JSON.stringify(ar41.sent) === JSON.stringify([{ id: "krea2/c.safetensors", weight: 0.6 }]) &&
  JSON.stringify(ar41.dragged) === JSON.stringify([["a.safetensors", 0.8, true], ["b.safetensors", 0, false], ["c.safetensors", 1.2, false]]), JSON.stringify({ sent: ar41.sent, dragged: ar41.dragged }));
check("Unmute puts it back in the run, its strength as it was",
  ar41.menu2.some((x) => /Unmute: back in the run/.test(x)) && !ar41.rowAfter && JSON.stringify(ar41.after[0]) === JSON.stringify(["a.safetensors", 0.8, false]), JSON.stringify({ menu2: ar41.menu2, after: ar41.after }));

// HERESY 1169 · 1343 (Viktor 10.10.2026: «детач лога сервера сделай вместе с GPU колонкой, и при детаче сразу сворачиваем открытый фрейм… при закрытии консоли с логом, если был фрейм в состоянии открытого, обратно открываем его»)
section("the log's own window carries the cards; the dock folds while it is open and unfolds when it closes, if it was open");
const lp43 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), $ = (id) => document.getElementById(id), o = {};
  const real = window.fetch, realOpen = window.open, keep = localStorage.getItem("yue2.logDock"), now = Date.now() / 1000;
  window.fetch = (u, opt) => {
    u = String(u);
    if (u.startsWith("/lab/gpus/live")) return Promise.resolve(new Response(JSON.stringify({ cards: [
      { index: 0, name: "NVIDIA GeForce RTX 3090", samples: [[now, 40, 6000, 24576, 50, 120]] },
      { index: 1, name: "NVIDIA GeForce RTX 3090", samples: [[now, 5, 300, 24576, 40, 30]] }], roles: { studio: 0, jobs: [1], train: [] } }),
      { status: 200, headers: { "Content-Type": "application/json" } }));
    return real(u, opt);
  };
  let frame = null;                                     // a window of the same origin: the test browser blocks a pop-up a script opens
  window.open = () => { frame = document.createElement("iframe"); frame.style.cssText = "position:fixed;left:-9999px;top:0;width:1240px;height:560px"; document.body.appendChild(frame); return frame.contentWindow; };
  const pip = window.documentPictureInPicture; try { delete window.documentPictureInPicture; } catch (e) {}
  // the dock open: the window comes, the dock folds, the cards beside the log; closed, the dock unfolds
  if ($("logDock").classList.contains("is-folded")) $("logDockTab").click();
  await wait(100);
  $("logDockPop").click();
  let pop = null;
  for (let i = 0; i < 30; i++) { await wait(100); pop = window.ruachLogPop && window.ruachLogPop(); if (pop && pop.gpus && pop.gpus.querySelectorAll(".gl-card").length) break; }
  o.one = { folded: $("logDock").classList.contains("is-folded"), cards: pop && pop.gpus ? pop.gpus.querySelectorAll(".gl-card").length : -1,
            main: pop && pop.gpus ? !!pop.gpus.querySelector(".gl-card.is-main") : false,
            cols: pop ? pop.win.getComputedStyle(pop.win.document.querySelector(".log-pop-main")).gridTemplateColumns : "", kept: localStorage.getItem("yue2.logDock") };
  frame.remove(); await wait(250);
  o.one.after = { folded: $("logDock").classList.contains("is-folded"), pop: !!(window.ruachLogPop && window.ruachLogPop()) };
  // the dock folded by hand first: it stays folded when the window closes
  if (!$("logDock").classList.contains("is-folded")) $("logDockTab").click();
  await wait(100);
  o.two = { before: $("logDock").classList.contains("is-folded") };
  $("logDockPop").click(); await wait(300);
  frame.remove(); await wait(250);
  o.two.after = $("logDock").classList.contains("is-folded");
  window.open = realOpen; if (pip) window.documentPictureInPicture = pip; window.fetch = real;
  if (keep === null) localStorage.removeItem("yue2.logDock"); else localStorage.setItem("yue2.logDock", keep);
  if ($("logDock").classList.contains("is-folded") !== (localStorage.getItem("yue2.logDock") !== "open")) $("logDockTab").click();
  return o; })()`);
check("the log's own window carries the cards beside the log (the studio's card framed); the dock folds as it opens, its kept choice untouched, and unfolds when it closes",
  lp43.one.folded && lp43.one.cards === 2 && lp43.one.main && / 390px$/.test(lp43.one.cols) && lp43.one.kept === "open" && !lp43.one.after.folded && !lp43.one.after.pop, JSON.stringify(lp43.one));
check("  a dock folded before the window stays folded when it closes", lp43.two.before && lp43.two.after, JSON.stringify(lp43.two));

// HERESY 1169 · 1344 (Viktor 10.10.2026: «если в 1080p… зафиксировать прокрутку страницы, если vh имеет как минимум 920px»); 1345: «Уехало и слилось — кнопки, оценочная длительность генерации и прогресс»; «Прогресс бар… по всей ширине центральной прямо поверх проявки»; «ПРОМПТ подсказку вынеси в тултип с нашим SVG i»; «Фолдинг СЕМПЛИНГА запоминаем при F5»; «ВАРИАЦИИ ужми, а СИД лучше растянуть»; «фрейм с промптом убрать в… тултип > вправо от картинки поверх правой колонки — при наведении мышью на картинку»
section("the Artist room by Viktor's late list: fixed in a tall window, Draw's row whole, the progress over the stage, the hints as i, the picture's tip beside it");
const ar44Was = await ev(`document.body.dataset.tab`);
const ar44Size = await ev(`[window.innerWidth, window.innerHeight]`);
await send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1000, deviceScaleFactor: 1, mobile: false });
await ev(`(() => { const real = window.fetch; window.__ar44Fetch = real;
  const long = Array.from({ length: 24 }, (_, i) => "Sentence " + (i + 1) + " of a long prompt about a harbour at night, its lamps over still water.").join(" ");
  window.__ar44Runs = [
    { id: "20261011-010000-bbbb", prompt: "A boat at dawn.", shapes: ["1:1"], seed: 9, count: 1, painter: "krea2-q4", created: 1791600000, status: "running", of: 2, pictures: [], gpu: 1,
      live: { live: 1, step: 3, of: 8, file: "preview/01.jpg", t: 1791600010 } },
    { id: "20261011-000000-aaaa", prompt: long, shapes: ["1:1"], seed: 7, count: 1, painter: "krea2-q4", created: 1791590000, status: "done", of: 1, took: 40, ended: 1791590040,
      pictures: [{ n: 1, shape: "1:1", seed: 7, w: 1280, h: 1280, kept: true, took: 40, file: "01-1x1-s7.png", thumb: "thumbs/01-1x1-s7.jpg" }] }];
  const json = (b, s) => Promise.resolve(new Response(JSON.stringify(b), { status: s || 200, headers: { "Content-Type": "application/json" } }));
  window.fetch = (u, o) => { u = String(u); if (u.startsWith("/lab/artist/runs")) return json({ runs: window.__ar44Runs }); return real(u, o); };
  return true; })()`);
await ev(`document.getElementById("tabArtist").click(); true`);
await ev(`window.HeresyArtist.reload(); true`);
await waitFor(`document.querySelectorAll('#arRuns .ar-run[data-id="20261011-000000-aaaa"] .ar-thumb').length === 1`, 5000, 50);
const ar44 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), $ = (id) => document.getElementById(id), o = {};
  window.dispatchEvent(new Event("resize")); await wait(250);
  const view = $("view-artist"), cols = $("arCols"), left = document.querySelector(".ar-cols > .ar-left"), right = document.querySelector(".ar-cols > .ar-right"), st = $("arStage");
  const bar = $("playbar"), barH = bar ? bar.getBoundingClientRect().height : 0;
  o.fixed = { cls: view.classList.contains("ar-fixed"), oy: getComputedStyle(view).overflowY, rightOy: getComputedStyle(right).overflowY, leftOy: getComputedStyle(left).overflowY,
              colsBottom: Math.round(cols.getBoundingClientRect().bottom), floor: Math.round(innerHeight - barH) };
  // Draw's row whole in its column: the cost a line of its own, Stop and Draw under it, nothing sideways
  const draw = $("arDraw"), stop = $("arStop"), cost = $("arCost");
  o.go = { sideways: left.scrollWidth - left.clientWidth, drawIn: draw.getBoundingClientRect().right <= left.getBoundingClientRect().right + 1,
           costAbove: cost.getBoundingClientRect().bottom <= Math.min(draw.getBoundingClientRect().top, stop.hidden ? 1e9 : stop.getBoundingClientRect().top) + 2, stop: !stop.hidden && !!stop.offsetParent, stopNone: (() => { const was = stop.hidden; stop.hidden = true; const d = getComputedStyle(stop).display; stop.hidden = was; return d; })(),
           sticky: getComputedStyle(draw.closest(".ar-go")).position };
  // the run's progress over the stage's top, its whole width, out of the flow
  const prog = $("arProgress");
  o.prog = { inStage: st.contains(prog), pos: getComputedStyle(prog).position, shown: !prog.hidden, w: Math.round(prog.getBoundingClientRect().width), stageW: Math.round(st.getBoundingClientRect().width),
             top: Math.round(prog.getBoundingClientRect().top - st.getBoundingClientRect().top), say: $("arProgressSay").textContent };
  // the hints as the studio's i
  o.hints = { prompt: !!$("arPrompt").closest("label").querySelector(".label .info[data-tip]"), ems: [...document.querySelectorAll(".ar-form .label em")].map((e) => e.id || "?"),
              refHint: !!document.querySelector("#arRefEmpty .row-hint"), refInfo: !!document.querySelector("#arRefEmpty .label .info[data-tip]"), seed: !!document.querySelector(".ar-seed .label .info[data-tip]"),
              warn: $("arSampWarn").classList.contains("info") && !!$("arSampWarn").closest("summary"), note: $("arPainterNote").classList.contains("info") && !!$("arPainterNote").closest(".ar-painter") };
  // Variations narrower than Seed
  o.widths = { seed: Math.round(document.querySelector(".ar-left .ar-seed").getBoundingClientRect().width), count: Math.round(document.querySelector(".ar-left .ar-count").getBoundingClientRect().width) };
  // Sampling's fold kept for the next load
  const sm = $("arSampling"), was = sm.open;
  sm.open = !was; await wait(80); o.samp = { kept: localStorage.getItem("yue2.arSampOpen"), want: !was ? "1" : "0" }; sm.open = was; await wait(80);
  // the picture on the stage: its buttons under it, its data and prompt a tip beside it over the library, out of sight until pointed at
  document.querySelector('#arRuns .ar-run[data-id="20261011-000000-aaaa"] .ar-thumb[data-act="view"]').click(); await wait(350);
  const tip = st.querySelector(".ar-stage-tip"), pic = st.querySelector(".ar-stage-pic"), acts = st.querySelector(".ar-stage-acts"), r = pic.getBoundingClientRect();
  o.tip = { pos: getComputedStyle(tip).position, vis: getComputedStyle(tip).visibility, left: Math.round(tip.getBoundingClientRect().left), stageRight: Math.round(st.getBoundingClientRect().right),
            rightLeft: Math.round(right.getBoundingClientRect().left), meta: (tip.querySelector(".ar-stage-meta") || {}).textContent || "", prompt: ((tip.querySelector(".ar-stage-prompt") || {}).textContent || "").slice(0, 24),
            actsUnder: !!acts && acts.getBoundingClientRect().top >= r.bottom - 1 };
  o.fill = { stageH: st.clientHeight, stageW: st.clientWidth, picH: Math.round(r.height), picW: Math.round(r.width), actsH: acts ? acts.offsetHeight : 0 };
  o.at = { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  return o; })()`);
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: ar44.at.x, y: ar44.at.y });
await sleep(250);
const ar44e = await ev(`getComputedStyle(document.querySelector("#arStage .ar-stage-tip")).visibility`);   // HERESY 1353: not yet, it waits 0.6 s
await sleep(850);
const ar44h = await ev(`(() => { const t = document.querySelector("#arStage .ar-stage-tip"); return { vis: getComputedStyle(t).visibility, op: +getComputedStyle(t).opacity }; })()`);
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 4, y: 4 });
await sleep(200);
const ar44k = await ev(`getComputedStyle(document.querySelector("#arStage .ar-stage-tip")).visibility`);   // HERESY 1353: still there a moment
await sleep(700);
const ar44g = await ev(`getComputedStyle(document.querySelector("#arStage .ar-stage-tip")).visibility`);
// HERESY 1353 (Viktor: «По кнопке Upscale дропдаун отцентрирован ниже влево. Выставь эту строку в центральную позицию»)
const ar44u = await ev(`(async () => { const b = document.querySelector('#arStage [data-stage="upscale"]'); if (!b) return null; b.click(); await new Promise((r) => setTimeout(r, 250));
  const row = document.querySelector("#arStage .ar-up-row"), st = document.getElementById("arStage"); if (!row) return { row: false };
  const kids = [...row.children].map((k) => k.getBoundingClientRect()), l = Math.min(...kids.map((k) => k.left)), r = Math.max(...kids.map((k) => k.right)), s = st.getBoundingClientRect();
  const o = { jc: getComputedStyle(row).justifyContent, mid: Math.round((l + r) / 2), stageMid: Math.round((s.left + s.right) / 2) };
  document.querySelector('#arStage [data-stage="upscale"]').click(); return o; })()`);
await send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 880, deviceScaleFactor: 1, mobile: false });
await sleep(300);
const ar44s = await ev(`(async () => { window.dispatchEvent(new Event("resize")); await new Promise((r) => setTimeout(r, 250)); const v = document.getElementById("view-artist"); return { cls: v.classList.contains("ar-fixed"), oy: getComputedStyle(v).overflowY }; })()`);
await send("Emulation.setDeviceMetricsOverride", { width: ar44Size[0], height: ar44Size[1], deviceScaleFactor: 1, mobile: false });
await ev(`window.fetch = window.__ar44Fetch; window.HeresyArtist.reload(); window.dispatchEvent(new Event("resize")); document.querySelector('.topbar [data-tab="' + ${JSON.stringify(ar44Was || "create")} + '"]').click(); true`);
await sleep(300);
check("a window 920 px tall holds the Artist room whole: the page does not scroll, the form and the library scroll on their own, the columns end above the player",
  ar44.fixed.cls && ar44.fixed.oy === "hidden" && ar44.fixed.rightOy === "auto" && ar44.fixed.leftOy === "auto" && ar44.fixed.colsBottom <= ar44.fixed.floor, JSON.stringify(ar44.fixed));
check("  under 920 px the room scrolls as before", !ar44s.cls && ar44s.oy !== "hidden", JSON.stringify(ar44s));
check("Draw's row stays whole in its column: the cost a line of its own, Stop and Draw under it, at the column's foot, nothing sideways",
  ar44.go.sideways <= 6 && ar44.go.drawIn && ar44.go.costAbove && ar44.go.stop && ar44.go.stopNone === "none" && ar44.go.sticky === "sticky", JSON.stringify(ar44.go));
check("the run's progress lies over the stage's top, its whole width, out of the flow (the picture does not move for it)",
  ar44.prog.inStage && ar44.prog.pos === "absolute" && ar44.prog.shown && Math.abs(ar44.prog.w - ar44.prog.stageW) <= 2 && ar44.prog.top <= 1 && /picture 1 of 2/.test(ar44.prog.say), JSON.stringify(ar44.prog));
check("the form's hints are the studio's i: the prompt's, the reference's, the seed's; the painter's note an i by its name, the sampling's warning a ⚠ in its line; no hint text left in the labels",
  ar44.hints.prompt && ar44.hints.refInfo && !ar44.hints.refHint && ar44.hints.seed && ar44.hints.warn && ar44.hints.note && ar44.hints.ems.every((x) => /^ar/.test(x)), JSON.stringify(ar44.hints));
check("Variations narrower than Seed", ar44.widths.count < ar44.widths.seed && ar44.widths.count <= 100, JSON.stringify(ar44.widths));
check("Sampling's fold is kept for the next load", ar44.samp.kept === ar44.samp.want, JSON.stringify(ar44.samp));
check("a picture on the stage: its buttons under it, the picture the rest of the stage; its data and prompt a tip beside it over the library, out of sight",
  ar44.tip.pos === "absolute" && ar44.tip.vis === "hidden" && ar44.tip.left >= ar44.tip.stageRight && ar44.tip.left <= ar44.tip.rightLeft + 4 && /seed 7/.test(ar44.tip.meta) && /^Sentence 1/.test(ar44.tip.prompt) && ar44.tip.actsUnder &&
  Math.abs(ar44.fill.picH - Math.min(ar44.fill.stageW, ar44.fill.stageH - ar44.fill.actsH - 12)) <= 4, JSON.stringify({ tip: ar44.tip, fill: ar44.fill }));
check("  the pointer resting on the picture shows the tip after a moment; away from it, the tip stays a moment and goes", ar44e === "hidden" && ar44h.vis === "visible" && ar44h.op > 0.9 && ar44k === "visible" && ar44g === "hidden", JSON.stringify({ early: ar44e, on: ar44h, leaving: ar44k, off: ar44g }));   // HERESY 1353
check("  Upscale…'s row stands centred under the picture's buttons", ar44u && ar44u.jc === "center" && Math.abs(ar44u.mid - ar44u.stageMid) <= 8, JSON.stringify(ar44u));

// HERESY 1169 · 1346 (Viktor 10.10.2026: «По аутпеинтингу было бы хорошо определять точное положение (позировать) референсного изображения на холсте проэцируемых соотношений сторон… скейлить референс»; «очень хочу… канваса аутпеинта, инпеинта именно так, как в InvokeAI»)
section("the Artist's canvas: the reference in each shape's frame, moved, typed and scaled, the mask painted over it, the places sent with Draw");
const cv46Was = await ev(`document.body.dataset.tab`);
const cv46a = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), $ = (id) => document.getElementById(id), o = {};
  const real = window.fetch; window.__cv46Fetch = real; window.__cv46Bodies = [];
  const json = (b, s) => Promise.resolve(new Response(JSON.stringify(b), { status: s || 200, headers: { "Content-Type": "application/json" } }));
  window.fetch = (u, opt) => { u = String(u);
    if (u.startsWith("/lab/artist/runs")) return json({ runs: [] });
    if (u.startsWith("/lab/artist/draw")) { window.__cv46Bodies.push(JSON.parse(opt.body)); return json({ error: "stubbed" }, 500); }
    return real(u, opt); };
  document.querySelector('.topbar [data-tab="artist"]').click(); await wait(400);
  await window.HeresyArtist.reload();
  const c = document.createElement("canvas"); c.width = 800; c.height = 400;   // a wide picture of our own: 800 × 400
  const g = c.getContext("2d"), gr = g.createLinearGradient(0, 0, 800, 0); gr.addColorStop(0, "#2a4"); gr.addColorStop(1, "#24a"); g.fillStyle = gr; g.fillRect(0, 0, 800, 400);
  const blob = await new Promise((r) => c.toBlob(r, "image/png"));
  const dt = new DataTransfer(); dt.items.add(new File([blob], "wide.png", { type: "image/png" }));
  o.promptWas = $("arPrompt").value;
  $("arPrompt").value = "a field at noon"; $("arPrompt").dispatchEvent(new Event("input", { bubbles: true }));
  $("arPrompt").dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  for (let i = 0; i < 30 && !(window.HeresyArtistRef && window.HeresyArtistRef.get()); i++) await wait(100);
  o.shapesWas = [...document.querySelectorAll("#arShapes input")].filter((i) => i.checked).map((i) => i.value);
  document.querySelectorAll("#arShapes input").forEach((i) => { i.checked = true; }); $("arShapes").dispatchEvent(new Event("change", { bubbles: true }));
  o.fitWas = $("arRefFit").checked;
  $("arRefFit").checked = true; $("arRefFit").dispatchEvent(new Event("change", { bubbles: true }));
  o.button = !!$("arCanvasOpen").offsetParent;
  window.HeresyArtist.canvas.open();
  for (let i = 0; i < 30 && !document.querySelector(".cv .cv-canvas"); i++) await wait(100);
  await wait(400);
  const cv = document.querySelector(".cv");
  o.open = !!cv;
  if (!cv) { window.fetch = real; return o; }
  o.tabs = [...cv.querySelectorAll(".cv-tab")].map((t) => t.dataset.shape + ":" + t.querySelector(".cv-tab-mode").textContent);
  cv.querySelector('[data-shape="16:9"]').click(); await wait(200);
  o.nums = [...cv.querySelectorAll("[data-num]")].map((i) => i.value);
  const r = cv.querySelector(".cv-canvas").getBoundingClientRect();
  o.at = [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)];
  return o; })()`);
if (cv46a.at) {
  for (const [type, dx] of [["mousePressed", 0], ["mouseMoved", -60], ["mouseMoved", -120], ["mouseReleased", -120]])
    await send("Input.dispatchMouseEvent", { type, x: cv46a.at[0] + dx, y: cv46a.at[1], button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1 });
  await sleep(250);
}
const cv46b = cv46a.at ? await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), cv = document.querySelector(".cv"), o = {}, nums = () => [...cv.querySelectorAll("[data-num]")].map((i) => i.value);
  o.moved = nums();
  const w = cv.querySelector('[data-num="s"]'); w.value = "60"; w.dispatchEvent(new Event("change", { bubbles: true })); await wait(100);
  o.typed = nums();
  cv.querySelector('[data-cv="cover"]').click(); await wait(100);
  o.fill = { s: cv.querySelector('[data-num="s"]').value, mode: cv.querySelector(".cv-mode").textContent, tab: cv.querySelector('[data-shape="16:9"] .cv-tab-mode').textContent };
  cv.querySelector('[data-cv="undo"]').click(); await wait(80); o.undo = cv.querySelector('[data-num="s"]').value;
  cv.querySelector('[data-cv="redo"]').click(); await wait(80); o.redo = cv.querySelector('[data-num="s"]').value;
  cv.querySelector('[data-cv="undo"]').click(); await wait(80);
  cv.querySelector('[data-cv="same"]').click(); await wait(80);
  cv.querySelector('[data-shape="9:16"]').click(); await wait(150);
  o.same = nums();
  cv.querySelector('[data-shape="16:9"]').click(); await wait(150);
  cv.querySelector('[data-tool="brush"]').click(); await wait(80);
  const r = cv.querySelector(".cv-canvas").getBoundingClientRect();
  o.at = [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)];
  return o; })()`) : {};
if (cv46b.at) {
  for (const [type, dx] of [["mousePressed", -150], ["mouseMoved", -100], ["mouseMoved", -50], ["mouseReleased", -50]])
    await send("Input.dispatchMouseEvent", { type, x: cv46b.at[0] + dx, y: cv46b.at[1], button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1 });
  await sleep(250);
}
const cv46c = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), $ = (id) => document.getElementById(id), cv = document.querySelector(".cv"), o = {};
  if (cv) {
    o.masked = cv.querySelector(".cv-mode").textContent;
    cv.querySelector('[data-cv="done"]').click(); await wait(500);
  }
  o.closed = !document.querySelector(".cv");
  o.place = window.HeresyArtist.canvas.place();
  o.say = $("arCanvasSay").hidden ? "" : $("arCanvasSay").textContent;
  o.mask = $("arMaskOpen").textContent;
  $("arDraw").click(); await wait(500);
  const b = window.__cv46Bodies[0] || {};
  o.sent = { place: b.place || null, mask: !!b.mask, opts: !!b.mask_opts };
  $("arCanvasX").click(); await wait(80);
  o.off = { place: window.HeresyArtist.canvas.place(), hidden: $("arCanvasSay").hidden };
  window.fetch = window.__cv46Fetch;
  $("arRefX").click(); await wait(100);
  return o; })()`);
await ev(`(() => { const $ = (id) => document.getElementById(id), a = ${JSON.stringify(cv46a)};
  $("arPrompt").value = a.promptWas || ""; $("arPrompt").dispatchEvent(new Event("input", { bubbles: true }));
  document.querySelectorAll("#arShapes input").forEach((i) => { i.checked = (a.shapesWas || ["1:1"]).includes(i.value); }); $("arShapes").dispatchEvent(new Event("change", { bubbles: true }));
  $("arRefFit").checked = !!a.fitWas; $("arRefFit").dispatchEvent(new Event("change", { bubbles: true }));
  document.querySelector('.topbar [data-tab="' + ${JSON.stringify(cv46Was || "create")} + '"]').click(); return true; })()`);
await sleep(200);
check("the Artist's Canvas… opens the canvas on the reference: the three frames as tabs, each saying how it is painted (a wide picture whole in each: around)",
  cv46a.button && cv46a.open && (cv46a.tabs || []).join() === "1:1:around,16:9:around,9:16:around" && (cv46a.nums || []).join() === "100,50,50", JSON.stringify(cv46a));
check("  dragged on the board the picture moves; its width typed; Fill covers the frame and the frame is painted from it; undo and redo walk back and forth",
  +cv46b.moved[1] < 50 && cv46b.moved[0] === "100" && cv46b.moved[2] === "50" && cv46b.typed[0] === "60" && cv46b.typed[1] === cv46b.moved[1] &&
  cv46b.fill.s === "112.5" && cv46b.fill.mode === "painted from the picture" && cv46b.fill.tab === "from it" && cv46b.undo === "60" && cv46b.redo === "112.5", JSON.stringify(cv46b));
check("  Same in all: the picture as large in pixels in the other frames, its middle in the same share",
  cv46b.same && cv46b.same[0] === "106.7" && cv46b.same[1] === cv46b.typed[1] && cv46b.same[2] === "50", JSON.stringify(cv46b.same));
check("  the brush paints the mask (painted around, and by the mask); Done keeps the places and the mask in the form, said under the strength",
  cv46c.masked === "painted around, and by the mask" && cv46c.closed && cv46c.place && cv46c.place["16:9"] && cv46c.place["16:9"].s === 0.6 && cv46c.place["9:16"] && cv46c.place["1:1"] &&
  /16:9 around/.test(cv46c.say) && /✓/.test(cv46c.mask), JSON.stringify(cv46c));
check("  Draw sends the picked shapes' places with the mask and its options; ✕ takes the form off the canvas",
  cv46c.sent.place && Object.keys(cv46c.sent.place).sort().join() === "16:9,1:1,9:16" && cv46c.sent.mask && cv46c.sent.opts && cv46c.off.place === null && cv46c.off.hidden, JSON.stringify({ sent: cv46c.sent, off: cv46c.off }));

// HERESY 1169 · 1347 (Viktor 10.10.2026: «Залей в него все модели диффузные… и LoRA адаптеры, и настрой выборочное скачивание прямо в студии Художника, чтобы было всё под рукой»)
section("the Artist's list of what can be fetched: its painters, the Qwen fine-tunes and the adapters, each with its size, here or Fetch through Engine's own fetch");
const gt47Was = await ev(`document.body.dataset.tab`);
const gt47 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), $ = (id) => document.getElementById(id), o = {};
  const real = window.fetch; window.__gt47Fetch = real; window.__gt47Asked = [];
  const json = (b, s) => Promise.resolve(new Response(JSON.stringify(b), { status: s || 200, headers: { "Content-Type": "application/json" } }));
  const data = { script: true, last: null, job: null, now: 0, extras: [
    { name: "backbone", label: "Backbone", what: "M-A-P's YuE2 as GGUF", variants: [{ id: "BF16", size: "7.2 GB", here: false }] },
    { name: "artwork", label: "Artwork", what: "the Artist's painter: Krea 2 Muse by Stable Yogi", variants: [{ id: "q4", label: "Krea 2 Muse Q4", size: "26 GB", here: true }] },
    { name: "qwen-fine", label: "Qwen fine-tunes", what: "the fp8 fine-tunes of Qwen-Image 2512 for finished realism (a card of 24 GB), from goldhub/Ruach_Studio_Models_v2, shared there by their authors' leave (Civitai: share and sell)",
      variants: [{ id: "jibmix-v6", label: "Jib Mix Qwen v6 by J1B", size: "20.4 GB", note: "and Qwen-Image 2512's parts (17.7 GB) when they are not here", here: false },
                 { id: "real-v2", label: "Real-Qwen-Image v2 by wikeeyang", size: "20.4 GB", note: "and Qwen-Image 2512's parts (17.7 GB) when they are not here", here: true }] },
    { name: "art-loras", label: "Artist's adapters", what: "adapters for the Artist's painters", variants: [{ id: "all", label: "seven adapters", size: "3.1 GB", here: false }] }] };
  window.fetch = (u, opt) => { u = String(u);
    if (u.startsWith("/lab/weights/fetch")) { window.__gt47Asked.push(JSON.parse(opt.body)); return json(data); }
    if (u.startsWith("/lab/weights")) return json(data);
    return real(u, opt); };
  document.querySelector('.topbar [data-tab="artist"]').click(); await wait(300);
  o.button = !!$("arGet") && !!$("arGet").offsetParent;
  window.HeresyArtist.get();
  for (let i = 0; i < 40 && !document.querySelector('.ar-get-x[data-extra="qwen-fine"]'); i++) await wait(100);   // the lab asked again: its answer, not the last one kept
  const dlg = document.querySelector(".ar-get-back");
  o.open = !!dlg;
  if (!dlg) { window.fetch = real; return o; }
  o.sections = [...dlg.querySelectorAll(".ar-get-x")].map((s) => s.dataset.extra);
  o.rows = [...dlg.querySelectorAll(".ar-get-v")].map((r) => r.querySelector("b").textContent + "|" + (r.querySelector(".ar-get-here") ? "here" : (r.querySelector("button") || {}).textContent));
  const b = dlg.querySelector('[data-get-x="qwen-fine"][data-get-v="jibmix-v6"]');
  b.click();
  for (let i = 0; i < 20 && !document.querySelector(".hd-back .hd-body"); i++) await wait(100);
  const ask = document.querySelector(".hd-back");
  o.asked = ask ? (ask.textContent || "").replace(/\\s+/g, " ").slice(0, 400) : "";
  const no = ask && ask.querySelector(".hd-no"); if (no) no.click();
  await wait(300);
  o.sent = window.__gt47Asked.length;
  dlg.querySelector('[data-get="close"]').click(); await wait(150);
  o.closed = !document.querySelector(".ar-get-back");
  window.fetch = real;
  return o; })()`);
await ev(`document.querySelector('.topbar [data-tab="' + ${JSON.stringify(gt47Was || "create")} + '"]').click(); true`);
await sleep(200);
check("Get painters and adapters… under the painter lists what the studio can fetch for the Artist (its painter, the Qwen fine-tunes, the adapters; not the backbone), each variant here or Fetch",
  gt47.button && gt47.open && (gt47.sections || []).join() === "artwork,qwen-fine,art-loras" &&
  (gt47.rows || []).join() === "Krea 2 Muse Q4|here,Jib Mix Qwen v6 by J1B|Fetch,Real-Qwen-Image v2 by wikeeyang|here,seven adapters|Fetch", JSON.stringify(gt47));
check("  its Fetch asks first with the size and where the painter shows (Engine's own question); cancelled, nothing is fetched; Done closes",
  /20\.4 GB/.test(gt47.asked) && /Fine-tune/.test(gt47.asked) && gt47.sent === 0 && gt47.closed, JSON.stringify({ asked: gt47.asked, sent: gt47.sent, closed: gt47.closed }));

// HERESY 1169 · 1350: Draw from the canvas, as InvokeAI's Invoke by its canvas
section("the canvas draws: its Draw keeps the places, closes it and asks the lab for the run");
const cv50Was = await ev(`document.body.dataset.tab`);
const cv50 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), $ = (id) => document.getElementById(id), o = {};
  const real = window.fetch; window.__cv50Bodies = [];
  const json = (b, s) => Promise.resolve(new Response(JSON.stringify(b), { status: s || 200, headers: { "Content-Type": "application/json" } }));
  window.fetch = (u, opt) => { u = String(u);
    if (u.startsWith("/lab/artist/runs")) return json({ runs: [] });
    if (u.startsWith("/lab/artist/draw")) { window.__cv50Bodies.push(JSON.parse(opt.body)); return json({ error: "stubbed" }, 500); }
    return real(u, opt); };
  document.querySelector('.topbar [data-tab="artist"]').click(); await wait(300);
  await window.HeresyArtist.reload();
  const c = document.createElement("canvas"); c.width = 640; c.height = 640;
  const g = c.getContext("2d"); g.fillStyle = "#468"; g.fillRect(0, 0, 640, 640);
  const blob = await new Promise((r) => c.toBlob(r, "image/png"));
  const dt = new DataTransfer(); dt.items.add(new File([blob], "square.png", { type: "image/png" }));
  o.promptWas = $("arPrompt").value;
  $("arPrompt").value = "a quiet bay"; $("arPrompt").dispatchEvent(new Event("input", { bubbles: true }));
  $("arPrompt").dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  for (let i = 0; i < 30 && !(window.HeresyArtistRef && window.HeresyArtistRef.get()); i++) await wait(100);
  window.HeresyArtist.canvas.open();
  for (let i = 0; i < 30 && !document.querySelector(".cv .cv-canvas"); i++) await wait(100);
  await wait(300);
  const b = document.querySelector('.cv [data-cv="draw"]');
  o.button = b ? b.textContent : null;
  if (b) b.click();
  await wait(600);
  o.closed = !document.querySelector(".cv");
  const sent = window.__cv50Bodies[0] || null;
  o.sent = sent ? { place: !!sent.place, shapes: sent.shapes, ref: !!sent.ref } : null;
  o.place = !!window.HeresyArtist.canvas.place();
  window.fetch = real;
  $("arRefX").click(); await wait(100);
  $("arPrompt").value = o.promptWas || ""; $("arPrompt").dispatchEvent(new Event("input", { bubbles: true }));
  return o; })()`);
await ev(`document.querySelector('.topbar [data-tab="' + ${JSON.stringify(cv50Was || "create")} + '"]').click(); true`);
await sleep(200);
check("the canvas's Draw (beside Done) keeps the places, closes the canvas and asks the lab for the run with them",
  cv50.button === "Draw" && cv50.closed && cv50.place && cv50.sent && cv50.sent.place && cv50.sent.ref, JSON.stringify(cv50));

// HERESY 1169 · 1353 (Viktor 11.10.2026: «В LoRA менеджере заведи контекстное окно... инфо, триггер, удалить, etc.»; «Разреши добавление до 8, но... активными только макс 4. Автодобавление триггерных слов в промпт»; «Оба адаптера от медведя — мертвецы»)
section("the Artist's adapters: eight in the list and four in the run, their trigger words into the prompt and out, the library's own menu and Info window, one made for another model, the art's trash");
const lo53 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), real = window.fetch, trashed = [];
  const until = async (fn, ms) => { for (let i = 0; i < (ms || 3000) / 50; i++) { const v = fn(); if (v) return v; await wait(50); } return null; };
  const json = (b, s) => Promise.resolve(new Response(JSON.stringify(b), { status: s || 200, headers: { "Content-Type": "application/json" } }));
  const mk = (n, extra) => Object.assign({ id: "krea2/L" + n + ".safetensors", family: "krea2", name: "L" + n, folder: "", mb: 100, picture: false, info: {}, made_for: "krea2", fits: true }, extra || {});
  const A = mk(1, { mb: 112, civitai: "known", info: { title: "Kul Style", words: ["Kulstyle", "sfumato washes"], url: "https://civitai.com/models/1" } });
  const rest = [2, 3, 4, 5, 6, 7, 8, 9].map((n) => mk(n)), X = mk(10, { name: "Flux thing", made_for: "flux", fits: false });
  const fams = { krea2: [A].concat(rest, [X]), sdxl: [], "qwen-image-2.1": [], "qwen-image-2512": [] };
  const infoA = Object.assign({}, A, { arch: "krea2", arch_title: "Krea 2", how: { format: "kohya", layers: 264, rank: 16 }, meta: { ss_network_dim: "16", ss_base_model_version: "krea2" },
    beside: ["L1.civitai.info"], sha256: "ab".repeat(32), path: "artwork/loras/krea2/L1.safetensors", modified: 1760000000 });
  window.fetch = (u, o) => { u = String(u);
    if (u.startsWith("/lab/artist/loras")) return json({ root: "artwork/loras", families: fams, titles: { krea2: "Krea 2" }, arch: { krea2: "Krea 2", flux: "FLUX" } });
    if (u.startsWith("/lab/artist/lora-info")) return json(infoA);
    if (u.startsWith("/lab/artist/lora-trash")) { trashed.push(JSON.parse(o.body)); fams.krea2 = fams.krea2.filter((r) => r.id !== A.id); return json({ id: A.id, stamp: "20261011-120000" }); }
    if (u.startsWith("/lab/artist/runs")) return json({ runs: [] });
    return real(u, o); };
  const keys = ["yue2.arLoras", "yue2.arPrompt", "yue2.arPainter", "yue2.arLoraWords", "yue2.arLoraAuto"], was = keys.map((k) => localStorage.getItem(k));
  keys.forEach((k) => localStorage.removeItem(k));
  const $ = (id) => document.getElementById(id), L = window.HeresyArtist.loras, o = {};
  document.querySelector('.topbar [data-tab="artist"]').click();
  await until(() => !$("view-artist").classList.contains("is-hidden"), 4000); await wait(300);
  $("arPainter").value = "krea2-q4"; $("arPainter").dispatchEvent(new Event("change"));
  await L.reload();
  $("arPrompt").value = "A fox"; $("arPrompt").dispatchEvent(new Event("input"));
  o.max = L.max();
  L.toggle(A.id); await wait(30);
  o.p1 = $("arPrompt").value;
  rest.slice(0, 3).forEach((r) => L.toggle(r.id)); await wait(30);
  L.toggle(rest[3].id); await wait(30);
  o.fifth = (L.now()[4] || {}).muted === true;
  rest.slice(4, 7).forEach((r) => L.toggle(r.id)); await wait(30);
  o.n8 = L.now().length;
  L.toggle(rest[7].id); await wait(30);
  o.n9 = L.now().length;
  o.say = $("arLoraSay").textContent;
  L.mute(0); await wait(30);
  o.p2 = $("arPrompt").value;
  L.mute(4); await wait(30);
  o.on = L.now().filter((l) => !l.muted).length;
  L.mute(0); await wait(30);
  o.aStill = L.now()[0].muted === true;
  L.toggle(X.id); await wait(30);
  o.alienOut = !L.now().some((l) => l.id === X.id);
  $("arLoraAdd").click(); await until(() => document.querySelectorAll(".ar-lib-card").length >= 10, 3000);
  const xc = document.querySelector('.ar-lib-card[data-lid="' + X.id + '"]');
  o.alien = { cls: !!xc && xc.classList.contains("is-alien"), badge: xc ? (xc.querySelector(".ar-lib-alien") || {}).textContent || "" : "" };
  const ac = document.querySelector('.ar-lib-card[data-lid="' + A.id + '"]'), r = ac.getBoundingClientRect();
  ac.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: r.left + 20, clientY: r.top + 20 })); await wait(150);
  o.menu = [...document.querySelectorAll(".hm-menu .hm-label")].map((s) => s.textContent);
  const infoItem = [...document.querySelectorAll(".hm-menu .hm-item")].find((b) => /^Info/.test(b.textContent.trim().replace(/^\\S+\\s*/, "")) || /Info/.test(b.textContent));
  if (infoItem) infoItem.click();
  await until(() => document.querySelector(".ar-li-back .ar-li-rows"), 3000); await wait(50);
  const li = document.querySelector(".ar-li-back");
  o.info = li ? { title: li.querySelector(".ar-li-title").textContent, rows: [...li.querySelectorAll(".ar-li-rows > b")].map((b) => b.textContent), made: (li.querySelector(".ar-li-ok") || {}).textContent || "",
    words: [...li.querySelectorAll(".ar-li-rows .ar-lora-word")].map((w) => w.textContent), meta: li.querySelectorAll(".ar-li-meta b").length } : null;
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await wait(150);
  o.escInfo = !document.querySelector(".ar-li-back") && !!document.querySelector(".ar-lib-back");
  L.info(A.id); await until(() => document.querySelector('.ar-li-back [data-li="trash"]'), 3000);
  document.querySelector('.ar-li-back [data-li="trash"]').click();
  const yes = await until(() => document.querySelector(".hd-back.is-on:not(.is-leaving) .hd-yes"), 2000);
  o.asked = yes ? yes.closest(".hd-back").textContent.replace(/\\s+/g, " ").slice(0, 200) : "";
  if (yes) yes.click();
  await until(() => trashed.length, 2000); await wait(400);
  o.trashed = trashed[0] || null;
  o.gone = !L.now().some((l) => l.id === A.id) && !document.querySelector('.ar-lib-card[data-lid="' + A.id + '"]') && !document.querySelector(".ar-li-back");
  const close = document.querySelector('.ar-lib [data-lib="close"]'); if (close) close.click(); await wait(100);
  window.fetch = real;
  keys.forEach((k, i) => { if (was[i] === null) localStorage.removeItem(k); else localStorage.setItem(k, was[i]); });
  await L.reload(); await window.HeresyArtist.reload();
  document.querySelector('.topbar [data-tab="create"]').click(); await wait(300);
  return o; })()`);
check("eight adapters in the list, four of them in the run: a fifth comes muted, a ninth is refused, a muted one waits while four are on",
  JSON.stringify(lo53.max) === "[8,4]" && lo53.fifth && lo53.n8 === 8 && lo53.n9 === 8 && lo53.on === 4 && lo53.aStill && lo53.say === "4 on · 8 / 8", JSON.stringify(lo53));
check("  an adapter's trigger words go into the prompt when it comes into the run, and out when it leaves it",
  lo53.p1 === "A fox, Kulstyle, sfumato washes" && lo53.p2 === "A fox", JSON.stringify({ p1: lo53.p1, p2: lo53.p2 }));
check("  one made for another model is not added; its card in the library is dimmed and names the model",
  lo53.alienOut && lo53.alien.cls && lo53.alien.badge === "✗ FLUX", JSON.stringify(lo53.alien));
check("the library's own menu on an adapter: the list, Info, its trigger words, Civitai, its file's name, the art's trash",
  ["Take it off the list", "Info…", "Its trigger words into the prompt", "Copy its trigger words", "Trigger words go into the prompt by themselves", "Look it up on Civitai", "Its page on Civitai", "Copy its file's name", "To the art's trash…"].every((x) => (lo53.menu || []).includes(x)), JSON.stringify(lo53.menu));
check("  Info: what it is made for (this painter's), its file, its trigger words, its trainer's notes; Escape closes it first, the library stays",
  lo53.info && lo53.info.made === "✓ this painter's" && lo53.info.rows.includes("Made for") && lo53.info.rows.includes("SHA-256") && lo53.info.words.join("|") === "Kulstyle|sfumato washes" && lo53.info.meta === 2 && lo53.escInfo, JSON.stringify(lo53.info) + " esc " + lo53.escInfo);
check("  to the art's trash, asked first: the lab moves it, it leaves the list and the library",
  lo53.trashed && lo53.trashed.id === "krea2/L1.safetensors" && /art's trash/.test(lo53.asked) && lo53.gone, JSON.stringify({ trashed: lo53.trashed, asked: lo53.asked, gone: lo53.gone }));
const tb53 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), real = window.fetch, sent = [];
  const until = async (fn, ms) => { for (let i = 0; i < (ms || 3000) / 50; i++) { const v = fn(); if (v) return v; await wait(50); } return null; };
  const json = (b, s) => Promise.resolve(new Response(JSON.stringify(b), { status: s || 200, headers: { "Content-Type": "application/json" } }));
  const bin = { runs: [], pictures: [], covers: [], loras: [{ stamp: "20261011-120000", id: "krea2/L1.safetensors", name: "L1", title: "Kul Style", bytes: 117440512, at: Date.now() / 1000 - 60 }], bytes: 117440512 };
  window.fetch = (u, o) => { u = String(u);
    if (u.startsWith("/lab/artist/bin") && o && o.method === "POST") { const b = JSON.parse(o.body); sent.push(b); return json({ op: b.op, done: b.items || [], kept: [] }); }
    if (u.startsWith("/lab/artist/bin")) return json(bin);
    if (u.startsWith("/lab/artist/loras")) return json({ root: "artwork/loras", families: { krea2: [], sdxl: [], "qwen-image-2.1": [], "qwen-image-2512": [] }, titles: {} });
    return real(u, o); };
  const $ = (id) => document.getElementById(id), o = {};
  document.querySelector('.topbar [data-tab="collection"]').click(); await wait(300);
  document.querySelector('#collSide [data-place="__trash_art"]').click(); await until(() => document.querySelector("#collGrid .coll-binart"), 3000); await wait(100);
  o.cards = [...document.querySelectorAll("#collGrid .coll-binart")].map((c) => c.dataset.akind + ":" + c.querySelector(".coll-title").textContent + ":" + c.querySelector(".coll-meta").textContent);
  const box = document.querySelector('#collGrid input[data-asel="lora:20261011-120000"]'); if (box) box.click(); await wait(50);
  $("collRestore").click(); await until(() => sent.length, 2000); await wait(200);
  o.restore = sent[0] || null;
  window.fetch = real;
  document.querySelector('#collSide [data-place=""]').click(); await wait(200);
  document.querySelector('.topbar [data-tab="create"]').click(); await wait(300);
  return o; })()`);
check("the Librarian's Trash (Art) holds an adapter of the LoRA library, given back by its stamp",
  (tb53.cards || []).length === 1 && /^lora:Kul Style:An adapter of the LoRA library · krea2 · in the trash since/.test(tb53.cards[0]) && tb53.restore && JSON.stringify(tb53.restore) === '{"op":"restore","items":[{"kind":"lora","stamp":"20261011-120000"}]}', JSON.stringify(tb53));

// HERESY 1169 · 1354 (Viktor 11.10.2026: «Художник говорит "Около 8.5 минут на одной карте". А карт-то у меня две выделены для Lab Works. Так почему бы автоматом не гнать при разных форматах картинки параллельную генерацию на картах Лаба?»)
section("a run's pictures on the lab's cards at once: the time said for them, the progress of every card, the stage's step whichever card paints it");
const ar54Was = await ev(`document.body.dataset.tab`);
const ar54 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), real = window.fetch, $ = (id) => document.getElementById(id), o = {};
  const until = async (fn, ms) => { for (let i = 0; i < (ms || 3000) / 50; i++) { const v = fn(); if (v) return v; await wait(50); } return null; };
  const json = (b, s) => Promise.resolve(new Response(JSON.stringify(b), { status: s || 200, headers: { "Content-Type": "application/json" } }));
  let cards = 2;
  const painters = () => [{ key: "krea2-q4", label: "Krea 2 Muse · Q4", need_mb: 12500, family: "krea2", ready: true, cards: cards },
                          { key: "krea2-q8", label: "Krea 2 Muse · Q8", need_mb: 18500, family: "krea2", ready: true, cards: cards }];
  let runs = [{ id: "20261011-120000-5401", prompt: "A lighthouse at dawn.", shapes: ["1:1", "16:9", "9:16"], seed: 9, count: 1, painter: "krea2-q4", created: 1791600000, status: "running", of: 3, pictures: [],
    gpu: 1, gpus: [1, 2], live: { live: 1, step: 3, of: 8, file: "preview/01.jpg", t: 1791600010 }, lives: [{ live: 1, step: 3, of: 8 }, { live: 2, step: 5, of: 8 }] }];
  window.fetch = (u, opt) => { u = String(u);
    if (u.startsWith("/lab/artist/painters")) return json({ painters: painters() });
    if (u.startsWith("/lab/artist/runs")) return json({ runs: runs });
    return real(u, opt); };
  const keys = ["yue2.arShapes", "yue2.arCount", "yue2.arPainter"], was = keys.map((k) => localStorage.getItem(k));
  document.querySelector('.topbar [data-tab="artist"]').click();
  await until(() => !$("view-artist").classList.contains("is-hidden"), 4000); await wait(300);
  await window.HeresyArtist.reload(); await window.HeresyArtist.painters(); await wait(300);
  $("arPainter").value = "krea2-q4"; $("arPainter").dispatchEvent(new Event("change"));
  ["1:1", "16:9", "9:16"].forEach((s) => { const c = document.querySelector('#arShapes input[value="' + s + '"]'); if (c) c.checked = true; });
  $("arCount").value = "1"; $("arShapes").dispatchEvent(new Event("change")); await wait(100);
  o.cost2 = $("arCost").textContent;
  o.say = $("arProgressSay").textContent;
  o.bar = $("arProgress").querySelector("i").style.width;
  o.step = (document.querySelector("#arStage .ar-stepno") || {}).textContent || "";
  // the second card finished its picture first: the stage still shows the first picture's step
  runs = [Object.assign({}, runs[0], { pictures: [{ n: 2, shape: "16:9", seed: 9, w: 1664, h: 928, kept: true, took: 46, file: "02-16x9-s9.png", thumb: "thumbs/02-16x9-s9.jpg" }],
    live: { live: 1, step: 6, of: 8, file: "preview/01.jpg", t: 1791600020 }, lives: [{ live: 1, step: 6, of: 8 }, { live: 3, step: 1, of: 8 }] })];
  await window.HeresyArtist.reload(); await wait(300);
  o.step2 = (document.querySelector("#arStage .ar-stepno") || {}).textContent || "";
  o.say2 = $("arProgressSay").textContent;
  cards = 1;                                           // one card: the time said as before
  runs = [];
  await window.HeresyArtist.reload(); await window.HeresyArtist.painters(); await wait(300);
  $("arShapes").dispatchEvent(new Event("change")); await wait(100);
  o.cost1 = $("arCost").textContent;
  window.fetch = real;
  keys.forEach((k, i) => { if (was[i] === null) localStorage.removeItem(k); else localStorage.setItem(k, was[i]); });
  await window.HeresyArtist.reload(); await window.HeresyArtist.painters();
  return o; })()`);
await ev(`document.querySelector('.topbar [data-tab="' + ${JSON.stringify(ar54Was || "create")} + '"]').click(); true`);
await sleep(200);
const mins = (s) => { const m = /about (a minute|([\d½]+) min)/.exec(s || ""); return !m ? NaN : m[1] === "a minute" ? 1 : parseFloat(m[2].replace("½", ".5")); };
check("three shapes on a lab with two cards: their time said on two cards, shorter than on one",
  /^3 pictures · about .+ on 2 cards$/.test(ar54.cost2) && /on one card$/.test(ar54.cost1) && mins(ar54.cost2) < mins(ar54.cost1), JSON.stringify({ two: ar54.cost2, one: ar54.cost1 }));
check("  the progress counts every card's step and says the cards (3/8 and 5/8 of three pictures: 33%)",
  ar54.say === "picture 1 of 3 · step 3 / 8 · 33% · on 2 cards" && ar54.bar === "33%", JSON.stringify({ say: ar54.say, bar: ar54.bar }));
check("  the stage shows the lowest picture's step, even when another card finished its picture first",
  ar54.step === "3 / 8" && ar54.step2 === "6 / 8" && /^picture 1 of 3 · step 6 \/ 8/.test(ar54.say2), JSON.stringify({ step: ar54.step, step2: ar54.step2, say2: ar54.say2 }));

// HERESY 1169 · 1355 (Viktor 11.10.2026: «Пройдись по репо всех моих апскейлеров и собери инфу по каждому, и оформи это в попап подсказки, чтобы человек видел, на что какой годится. И можно ли двух-трёх проходный апскейл делать наподобие того, как у меня в ComfyUI workflow?»)
section("the upscalers: each one's notes in an i beside the choice and a window of them all; an upscale in passes as Viktor's ComfyUI stack");
const up55Was = await ev(`document.body.dataset.tab`);
const up55 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), real = window.fetch, $ = (id) => document.getElementById(id), o = {}, sent = [];
  const until = async (fn, ms) => { for (let i = 0; i < (ms || 3000) / 50; i++) { const v = fn(); if (v) return v; await wait(50); } return null; };
  const json = (b, s) => Promise.resolve(new Response(JSON.stringify(b), { status: s || 200, headers: { "Content-Type": "application/json" } }));
  const info = (title, arch, s, group, lic, what) => ({ title, author: "A", license: lic, group, source: "https://openmodeldb.info/models/x", for: what, arch, scale: 4, s_1024: s, peak_gb: 2.1, precision: "float16" });
  const ups = [{ name: "4x_Nomos8kDAT.pth", scale: 4, mb: 295, info: info("Nomos8kDAT", "DAT", 14.1, "photo", "CC-BY-4.0", "Photos, also JPEG-compressed or a little blurred: detailed and natural. The studio's default; slow.") },
               { name: "4x_Nomos8k_span_otf_strong.pth", scale: 4, mb: 8.6, info: info("Nomos8k span otf strong", "SPAN", 0.9, "photo", "CC-BY-4.0", "Photos, quick: mends strongly (smoother). The first pass of Viktor's ComfyUI chain.") },
               { name: "4x_foolhardy_Remacri.pth", scale: 4, mb: 64, info: info("Remacri", "ESRGAN", 2.7, "photo", "CC-BY-NC-SA-4.0", "General pictures with more detail and less smoothing: skin and fine texture do not turn mushy. Quick. Non-commercial. The third pass of Viktor's chain.") },
               { name: "4x_UltraMix_Balanced.pth", scale: 4, mb: 64, info: info("UltraMix Balanced", "ESRGAN", 2.6, "photo", "CC-BY-NC-SA-4.0", "Natural pictures with sharpness and detail in balance. Quick. Non-commercial. The last pass of Viktor's chain.") },
               { name: "4x_FaceUpDAT.pth", scale: 4, mb: 147, info: info("FaceUp DAT", "DAT", 16, "faces", "CC-BY-4.0", "Faces in good-quality photos. Slow.") },
               { name: "my_own_4x.pth", scale: 4, mb: 12 }];
  let runs = [{ id: "20261011-130000-5501", prompt: "A lighthouse.", shapes: ["16:9"], seed: 5, count: 1, painter: "krea2-q4", created: 1791600000, status: "done", of: 1, took: 40, ended: 1791600040,
    pictures: [{ n: 1, shape: "16:9", seed: 5, w: 1920, h: 1080, kept: true, took: 40, file: "01-16x9-s5.png", thumb: "thumbs/01-16x9-s5.jpg" }] }];
  window.fetch = (u, opt) => { u = String(u);
    if (u.startsWith("/lab/artist/upscalers")) return json({ upscalers: ups, measured: "RTX 3090" });
    if (u.startsWith("/lab/artist/upscale")) { const b = JSON.parse(opt.body); sent.push(b); return json({ id: "20261011-130100-5502", kind: "upscale", status: "queued", of: 1, pictures: [], passes: b.passes, prompt: "A lighthouse.", shapes: ["16:9"], seed: 5, count: 1, painter: "upscale", created: 1791600100 }, 202); }
    if (u.startsWith("/lab/artist/runs")) return json({ runs: runs });
    return real(u, opt); };
  const keys = ["yue2.arUpModel", "yue2.arUpChain"], was = keys.map((k) => localStorage.getItem(k));
  keys.forEach((k) => localStorage.removeItem(k));
  try {
  document.querySelector('.topbar [data-tab="artist"]').click();
  await until(() => !$("view-artist").classList.contains("is-hidden"), 4000); await wait(300);
  const look = document.querySelector('#arBar [data-look="runs"]'); if (look && !look.classList.contains("is-on")) { look.click(); await wait(200); }
  await window.HeresyArtist.reload();
  const th = await until(() => document.querySelector('#arRuns .ar-run[data-id="20261011-130000-5501"] .ar-thumb[data-act="view"]'), 5000);
  if (!th) { window.fetch = real; o.err = "no thumb: " + ($("arRuns").innerHTML || "").slice(0, 400); return o; }
  th.click(); await wait(350);
  const ub = await until(() => document.querySelector('#arStage [data-stage="upscale"]'), 3000);
  if (!ub) { window.fetch = real; o.err = "no Upscale button: " + ($("arStage").innerHTML || "").slice(0, 600); return o; }
  ub.click();
  await until(() => document.querySelector("#arStage .ar-up-info"), 3000); await wait(100);
  const i = document.querySelector("#arStage .ar-up-info");
  o.tip = i ? i.dataset.tip : "";
  i.click(); await until(() => document.querySelector(".ar-ug-back"), 2000); await wait(100);
  const ug = document.querySelector(".ar-ug-back");
  o.groups = [...ug.querySelectorAll(".ar-get-x h4")].map((h) => h.textContent);
  o.rows = [...ug.querySelectorAll(".ar-ug-v")].map((r) => r.dataset.ugPick);
  o.nc = [...ug.querySelectorAll(".ar-ug-lic.is-nc")].length;
  ug.querySelector('[data-ug-pick="4x_FaceUpDAT.pth"]').click(); await wait(300);
  o.picked = { closed: !document.querySelector(".ar-ug-back"), value: ($("arUpModel") || {}).value, kept: localStorage.getItem("yue2.arUpModel"), tip: (document.querySelector("#arStage .ar-up-info") || { dataset: {} }).dataset.tip || "" };
  // the passes: Viktor's chain by default where its four models are here
  document.querySelector("#arStage [data-up-chain]").click(); await until(() => document.querySelector("#arStage [data-up-chain-panel]"), 2000); await wait(100);
  const rows = () => [...document.querySelectorAll("#arStage [data-uc-k]")].map((r) => r.querySelector("[data-uc-model]").value + " x" + r.querySelector("[data-uc-factor]").value);
  o.chain = rows();
  o.say = (document.querySelector("#arStage [data-uc-say]") || {}).textContent || "";
  o.opts = { lands: document.querySelector("#arStage [data-uc-resample]").value, long: document.querySelector("#arStage [data-uc-long]").value, match: document.querySelector("#arStage [data-uc-match]").checked };
  const f = document.querySelector('#arStage [data-uc-k="2"] [data-uc-factor]'); f.value = "2"; f.dispatchEvent(new Event("change", { bubbles: true })); await wait(150);
  o.kept = JSON.parse(localStorage.getItem("yue2.arUpChain") || "null");
  document.querySelector('#arStage [data-uc-k="3"] [data-uc-x]').click(); await wait(150);
  o.three = rows().length;
  document.querySelector('#arStage [data-uc="viktor"]').click(); await wait(150);
  o.back = rows();
  document.querySelector('#arStage [data-uc="go"]').click(); await until(() => sent.length, 2000); await wait(200);
  o.sent = sent[0] || null;
  // its progress: the pass it is on
  runs = [{ id: "20261011-130100-5502", kind: "upscale", status: "running", of: 1, pictures: [], passes: o.sent ? o.sent.passes : [], chain_at: { k: 2, of: 4 }, prompt: "A lighthouse.", shapes: ["16:9"], seed: 5, count: 1, painter: "upscale", created: 1791600100, gpu: 2 }].concat(runs);
  await window.HeresyArtist.reload(); await wait(300);
  o.progress = { say: $("arProgressSay").textContent, bar: $("arProgress").querySelector("i").style.width };
  o.label = ((document.querySelector('#arRuns .ar-run[data-id="20261011-130100-5502"]') || {}).textContent || "").replace(/\\s+/g, " ").slice(0, 200);
  } catch (e) { o.err = String((e && e.stack) || e).slice(0, 600); }
  window.fetch = real;
  keys.forEach((k, i) => { if (was[i] === null) localStorage.removeItem(k); else localStorage.setItem(k, was[i]); });
  await window.HeresyArtist.reload();
  return o; })()`);
await ev(`document.querySelector('.topbar [data-tab="' + ${JSON.stringify(up55Was || "create")} + '"]').click(); true`);
await sleep(200);
check("the upscaler's i says what the chosen one is for, its time measured and its licence",
  !up55.err && /^Nomos8kDAT · DAT ×4 · Photos, also JPEG-compressed.* · about 14\.1 s for a 1024² picture · CC-BY-4.0$/.test(up55.tip), up55.err || up55.tip);
check("  a click on it opens the window of them all by what they are for (those without notes apart), the non-commercial marked; a row picked is the choice",
  JSON.stringify(up55.groups) === '["Photos and realism","Faces and skin","Without notes"]' && up55.rows.length === 6 && up55.rows[0] === "4x_Nomos8k_span_otf_strong.pth" && up55.nc === 2 &&
  up55.picked.closed && up55.picked.value === "4x_FaceUpDAT.pth" && up55.picked.kept === "4x_FaceUpDAT.pth" && /^FaceUp DAT/.test(up55.picked.tip), JSON.stringify({ groups: up55.groups, rows: up55.rows, nc: up55.nc, picked: up55.picked }));
check("Passes…: Viktor's ComfyUI chain where its four models are here (span strong ×2, Nomos8kDAT ×4, Remacri ×1.5, UltraMix Balanced ×2; bilinear, 7680 on the long side, the colours matched), its size and time said",
  up55.chain.join("|") === "4x_Nomos8k_span_otf_strong.pth x2|4x_Nomos8kDAT.pth x4|4x_foolhardy_Remacri.pth x1.5|4x_UltraMix_Balanced.pth x2" &&
  up55.opts.lands === "bilinear" && up55.opts.long === "7680" && up55.opts.match && /^1920×1080 → 7680×4320 · about .+ on a card$/.test(up55.say), JSON.stringify({ chain: up55.chain, opts: up55.opts, say: up55.say }));
check("  a pass changed is kept, one taken off, the chain brought back; Upscale in passes sends them all",
  up55.kept && up55.kept.passes[2].factor === 2 && up55.three === 3 && up55.back.length === 4 && up55.sent && up55.sent.passes.length === 4 && up55.sent.passes[2].factor === 1.5 &&
  up55.sent.resample === "bilinear" && up55.sent.long === 7680 && up55.sent.match === true && up55.sent.id === "20261011-130000-5501", JSON.stringify({ kept: up55.kept, three: up55.three, sent: up55.sent }));
check("  its progress says the pass it is on; its run is labelled with its passes",
  up55.progress.say === "upscaling · pass 3 of 4" && up55.progress.bar === "50%" && /Upscale · 4 passes/.test(up55.label), JSON.stringify({ progress: up55.progress, label: up55.label }));

// HERESY 1169 · 1356 (from SUNO v6; Viktor 11.10.2026: «Идеи из SUNO внедряй для релиза 2.0.0, чтобы не возвращаться к этому больше. Это базовые быстрые функции»)
section("Crop, Remove a section and Speed: the take's sections from its score, picked; the stretches cut on their lines, the score cut along; the tempo read and written anew");
const ed56 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), real = window.fetch, o = {}, sent = [];
  const until = async (fn, ms) => { for (let i = 0; i < (ms || 3000) / 50; i++) { const v = fn(); if (v) return v; await wait(50); } return null; };
  const abc = ["X:1", "T:", "M:3/4", "L:1/16", "Q:1/4=90", 'V: Vocal clef=treble name="Vocal Melody" snm="Vocal"', 'V: Ins clef=treble name="Ins Melody" snm="Inst."', "K:Em",
    "% intro", "V: Vocal", "E4G4A4|B4B6A2|G4E4F4|G4A8|", "V: Ins", "E12-|E4C8-|C8D4-|D12|",
    "% verse", "V: Vocal", "B12|d8c4|B4A4G4-|G4F8|", "V: Ins", "B,12-|B,4E8-|E8C4-|C12|",
    "% outro", "V: Vocal", "E12-|E4E8-|E8z4|", "V: Ins", "B,12-|B,4E8-|E8z4|"].join("\\n") + "\\n";
  const E = window.ruachTakeEdit;
  if (!E) return { err: "no ruachTakeEdit" };
  const sp = E.parts(abc, 23.5);
  o.parts = sp.parts.map((p) => p.name + " " + p.t.toFixed(2) + "-" + p.end.toFixed(2));
  o.keepVerse = E.keep(sp, [false, true, false]);
  o.keepParses = (() => { try { const s = window.HeresyAbc.parse(o.keepVerse); return s.voices.Vocal.bars.length; } catch (e) { return String(e); } })();
  window.fetch = (u, opt) => { u = String(u); if (u.startsWith("/lab/score")) return Promise.resolve(new Response(JSON.stringify({ abc: abc }), { headers: { "Content-Type": "application/json" } })); return real(u, opt); };
  const take = { name: "20261011-120000-01-cdp-edit", title: "Waltz", seconds: 23.5, has_score: false };
  const tick = async (labels, ok) => {
    const b = await until(() => document.querySelector(".hd-back.is-on:not(.is-leaving) .hd-pick"), 3000);
    if (!b) return null;
    const box = b.closest(".hd-back");
    const said = { title: box.querySelector(".hd-title").textContent, rows: [...box.querySelectorAll(".hd-check")].map((r) => r.querySelector(".hd-item-label").textContent + " " + r.querySelector(".hd-item-note").textContent) };
    [...box.querySelectorAll(".hd-check")].forEach((r) => { if (labels.includes(r.querySelector(".hd-item-label").textContent)) { const i = r.querySelector("input"); i.checked = true; i.dispatchEvent(new Event("change", { bubbles: true })); } });
    await wait(50);
    said.ok = box.querySelector(".hd-yes").textContent;
    box.querySelector(".hd-yes").click();
    return said;
  };
  let p = E.pick(take, "remove"); o.remove = { dialog: await tick(["verse"]) }; o.remove.got = await p.catch((e) => ({ err: String(e && e.message) }));
  p = E.pick(take, "crop"); o.crop = { dialog: await tick(["verse", "outro"]) }; o.crop.got = await p.catch((e) => ({ err: String(e && e.message) }));
  p = E.pick(take, "crop"); await tick(["intro", "outro"]); o.cropAll = await p.then(() => "no refusal", (e) => String(e && e.message));
  window.fetch = real;
  const sv = (a, b) => { try { const r = E.speed(a, b); return r.f.toFixed(4) + "/" + r.nb; } catch (e) { return "refused: " + e.message; } };
  o.speed = { bpm: sv("99", 90), times: sv("×1.1", 90), pct: sv("90%", 90), plain: sv("1.25", 0), tooFast: sv("×3", 90), same: sv("90", 90) };
  return o; })()`);
check("the score's sections as parts, each its time from the score's tempo, the last to the take's end (its tail)",
  JSON.stringify(ed56.parts) === '["intro 0.00-8.00","verse 8.00-16.00","outro 16.00-23.50"]' && ed56.keepParses === 4, JSON.stringify({ parts: ed56.parts, keepParses: ed56.keepParses, err: ed56.err }));
check("Remove a section: the parts with their times in the studio's pick window; verse taken out: its stretch 8–16 s asked, the score without its lines, titled «· without verse»",
  ed56.remove && ed56.remove.dialog && /^Remove a section/.test(ed56.remove.dialog.title) && ed56.remove.dialog.rows.join("|") === "intro 0:00–0:08|verse 0:08–0:16|outro 0:16–0:23" &&
  /^Take out → 0:15$/.test(ed56.remove.dialog.ok) && JSON.stringify(ed56.remove.got.spans) === "[[8,16]]" && !/% verse/.test(ed56.remove.got.abc) && /% intro/.test(ed56.remove.got.abc) && /% outro/.test(ed56.remove.got.abc) &&
  / · without verse$/.test(ed56.remove.got.title), JSON.stringify(ed56.remove));
check("  Crop: verse and outro ticked keep 8 s to the end, titled «· verse to outro»; all of it ticked is refused (nothing taken out)",
  ed56.crop && JSON.stringify(ed56.crop.got.spans) === "[[8,23.5]]" && / · verse to outro$/.test(ed56.crop.got.title) && /^Crop → 0:15$/.test(ed56.crop.dialog.ok) && ed56.cropAll === "Nothing taken out",
  JSON.stringify({ crop: ed56.crop, all: ed56.cropAll }));
check("Speed reads «99» as the BPM (×1.1), «×1.1» and «90%» as factors rounded to a whole BPM, «1.25» without a score; ×3 and its own speed refused",
  ed56.speed.bpm === "1.1000/99" && ed56.speed.times === "1.1000/99" && ed56.speed.pct === "0.9000/81" && ed56.speed.plain === "1.2500/0" && /^refused: From ×0.5 to ×2/.test(ed56.speed.tooFast) && ed56.speed.same === "refused: That is its own speed",
  JSON.stringify(ed56.speed));
const edBtns = await ev(`["cropTake", "cutSection", "speedTake"].map((id) => { const b = document.getElementById(id); return b ? b.closest(".tool-group").querySelector(".tool-cap").textContent + ":" + b.textContent : id + " missing"; })`);
check("  the take's Edit row: Crop…, Remove a section…, Speed…", edBtns.join("|") === "Edit:Crop…|Edit:Remove a section…|Edit:Speed…", JSON.stringify(edBtns));

// HERESY 1169 · 1357 (from SUNO v6, TODO.md: «Tighten these lyrics in the lyrics box, by the Writer's model; style suggestions as chips under the Style, made anew on demand»)
section("Tighten these lyrics and the style's suggestions, by the Writer's model: both texts side by side before anything changes; tags new to the style, put in before its BPM");
const sn57 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), $ = (id) => document.getElementById(id), o = {}, asked = [];
  const until = async (fn, ms) => { for (let i = 0; i < (ms || 3000) / 50; i++) { const v = fn(); if (v) return v; await wait(50); } return null; };
  const realAsk = window.HeresyWriterAsk;
  const answers = { "tighten the lyrics": ["[Verse]\\nThe road is long\\n[Chorus]\\nWe sing along", "The road is long\\nWe sing"],
                    "style suggestions": ["- warm tape saturation\\n2. fingerpicked guitar\\n- Female alto\\n- country", "dusty pedal steel\\nslow waltz"] };
  window.HeresyWriterAsk = (messages, max, t, what) => { asked.push({ what, max, system: messages[0].content.slice(0, 40), user: messages[1].content }); const a = answers[what].shift(); return Promise.resolve({ text: a, model: "stub" }); };
  const was = { lyrics: $("lyrics").value, style: $("style").value, title: $("title").value };
  document.querySelector('#tabs [data-tab="create"]').click(); await wait(200);
  const setv = (id, v) => { $(id).value = v; $(id).dispatchEvent(new Event("input", { bubbles: true })); };
  setv("lyrics", "[Verse]\\nThe road is long and the road is so very long\\n[Chorus]\\nWe sing along, oh we sing along");
  setv("style", "country, fiddle, 86 BPM"); setv("title", "Road");
  // Tighten: the window, Ask again (the second answer drops the tags: said), Apply
  $("lyricsTighten").click();
  await until(() => document.querySelector(".tg-back .tg-then"), 3000); await wait(50);
  const w1 = document.querySelector(".tg-back");
  o.first = { now: w1.querySelector(".tg-now").value.split("\\n").length, then: w1.querySelector(".tg-then").value, lost: !!w1.querySelector(".tg-lost"), head: w1.querySelector(".ar-lib-head .row-hint").textContent };
  w1.querySelector('[data-tg="again"]').click();
  await until(() => { const b = document.querySelector(".tg-back"); return b && b !== w1 && b.querySelector(".tg-then"); }, 3000); await wait(50);
  const w2 = document.querySelector(".tg-back");
  o.second = { then: w2.querySelector(".tg-then").value, lost: (w2.querySelector(".tg-lost") || {}).textContent || "" };
  w2.querySelector(".tg-then").value = "[Verse]\\nThe road is long\\n[Chorus]\\nWe sing";   // edited by hand
  w2.querySelector('[data-tg="apply"]').click(); await wait(200);
  o.applied = $("lyrics").value;
  o.tightenAsk = asked.filter((a) => a.what === "tighten the lyrics").map((a) => a.system + "|" + a.max);
  // the style's suggestions: the answer's lines, numbers and bullets off, what the style has left out; a click puts one before the BPM
  $("styleSugGo").click();
  await until(() => document.querySelectorAll("#styleSugChips .style-sug-chip").length, 3000); await wait(50);
  o.chips = [...document.querySelectorAll("#styleSugChips .style-sug-chip")].map((c) => c.textContent);
  o.moreShown = !$("styleSugMore").hidden;
  [...document.querySelectorAll("#styleSugChips .style-sug-chip")].find((c) => c.textContent === "fingerpicked guitar").click(); await wait(50);
  o.style = $("style").value;
  o.chipsLeft = [...document.querySelectorAll("#styleSugChips .style-sug-chip")].map((c) => c.textContent);
  $("styleSugMore").click();
  await until(() => [...document.querySelectorAll("#styleSugChips .style-sug-chip")].some((c) => c.textContent === "slow waltz"), 3000);
  o.again = [...document.querySelectorAll("#styleSugChips .style-sug-chip")].map((c) => c.textContent);
  o.notThese = (asked.filter((a) => a.what === "style suggestions")[1] || {}).user || "";
  o.unit = { insertNoBpm: window.ruachSunoText.insert("rock, drums", "fuzz bass"), insertEmpty: window.ruachSunoText.insert("", "folk"), insertBpm: window.ruachSunoText.insert("rock, drums, 120 bpm", "fuzz") };
  window.HeresyWriterAsk = realAsk;
  setv("lyrics", was.lyrics); setv("style", was.style); setv("title", was.title);
  return o; })()`);
check("✦ Tighten shows both texts side by side, the words counted; Ask again asks once more, and the section tags the answer left out are said",
  sn57.first.now === 4 && sn57.first.then === "[Verse]\nThe road is long\n[Chorus]\nWe sing along" && !sn57.first.lost && /^Now 20 words · tightened 9 words$/.test(sn57.first.head) &&
  sn57.second.then === "The road is long\nWe sing" && /\[Verse\] \[Chorus\]$/.test(sn57.second.lost), JSON.stringify({ first: sn57.first, second: sn57.second }));
check("  Apply puts the edited text in the box; the Writer's model was asked to keep every section tag",
  sn57.applied === "[Verse]\nThe road is long\n[Chorus]\nWe sing" && sn57.tightenAsk.length === 2 && /^You edit song lyrics/.test(sn57.tightenAsk[0]), JSON.stringify({ applied: sn57.applied, asks: sn57.tightenAsk }));
check("✦ Suggest: the answer's lines as chips (numbers and bullets off, what the style has already left out); a chip goes in before the style's BPM and leaves the row",
  JSON.stringify(sn57.chips) === '["warm tape saturation","fingerpicked guitar","Female alto"]' && sn57.moreShown && sn57.style === "country, fiddle, fingerpicked guitar, 86 BPM" &&
  JSON.stringify(sn57.chipsLeft) === '["warm tape saturation","Female alto"]', JSON.stringify({ chips: sn57.chips, style: sn57.style, left: sn57.chipsLeft }));
check("  ↻ asks for others, naming those shown so they do not come again; a style without a BPM takes the tag at its end",
  JSON.stringify(sn57.again) === '["dusty pedal steel","slow waltz"]' && /Not these again: warm tape saturation, Female alto/.test(sn57.notThese) &&
  sn57.unit.insertNoBpm === "rock, drums, fuzz bass" && sn57.unit.insertEmpty === "folk" && sn57.unit.insertBpm === "rock, drums, fuzz, 120 bpm", JSON.stringify({ again: sn57.again, unit: sn57.unit }));

// HERESY 1169 · 1358 (from SUNO v6, TODO.md: «The boundaries snapped to the music's own changes (spectral novelty) and the instrumental breaks found by the voice's absence; a slice of the spectrogram in the card (Viktor 10.10)»)
section("the wave's sections on the music's own changes, a Break where no voice sings, Intro and Outro where the song has none, a slice of the spectrogram in the card");
const ws58 = await ev(`(() => {
  const W = window.ruachWaveSnap, o = {};
  if (!W) return { err: "no ruachWaveSnap" };
  const list = [{ t: 0, name: "Intro", lines: [] }, { t: 12.4, name: "Verse 1", lines: ["a"] }, { t: 31.0, name: "Chorus", lines: ["b"] }, { t: 50.2, name: "Verse 2", lines: ["c"] }];
  const changes = [{ t: 11.5, strength: 0.4 }, { t: 12.9, strength: 0.9 }, { t: 30.0, strength: 0.2 }, { t: 33.0, strength: 1.0 }, { t: 49.0, strength: 0.7 }];
  o.snapped = W.snap(list, changes).map((s) => s.name + "@" + s.t + (s.snapped ? "*" : ""));
  const rows = [{ start: 12.5, end: 16 }, { start: 16.2, end: 20 }, { start: 31, end: 35 }, { start: 46, end: 49.5 }, { start: 50.3, end: 54 }];
  o.breaks = W.breaks([{ t: 12.4, name: "Verse 1", lines: ["a"], rows: [] }, { t: 31, name: "Chorus", lines: ["b"], rows: [] }, { t: 50.2, name: "Verse 2", lines: ["c"], rows: [] }], rows, 70)
    .map((s) => s.name + "@" + s.t + (s.resumed ? "+" : "") + (s.heard ? "~" : ""));
  o.none = W.snap(list, []).map((s) => s.t).join(",");
  return o; })()`);
check("a section's start moves to the strongest change within 1.5 s of it (Verse 1 12.4 → 12.9, Chorus 31 → 30.0 the only one near, Verse 2 50.2 → 49.0); the first at 0 stays; no changes, no moves",
  JSON.stringify(ws58.snapped) === '["Intro@0","Verse 1@12.9*","Chorus@30*","Verse 2@49*"]' && ws58.none === "0,12.4,31,50.2", JSON.stringify(ws58));
check("  where no voice sings for 7 s, a Break: before the next section (Verse 1 to Chorus), or inside one, the section going on after it; a long start without a section, Intro; a long end, Outro",
  JSON.stringify(ws58.breaks) === '["Intro@0~","Verse 1@12.4","Break@20.3~","Chorus@31","Break@35.3~","Chorus@45.8+","Verse 2@50.2","Outro@54.3~"]', JSON.stringify(ws58.breaks));

// HERESY 1169 · 1359: a text whose line breaks are its own keeps its lines in every language (the machine's scan, 1304, had read as one
// paragraph in the six other languages: a one-line pattern ran across the dialog's lines)
section("a dialog's lines kept in another language: the machine's scan in Russian line by line; a key of its own lines whole; a soft line break still read across");
const ln59 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), real = window.fetch, L = window.RuachI18n;
  const until = async (fn, ms) => { for (let i = 0; i < (ms || 3000) / 50; i++) { const v = fn(); if (v) return v; await wait(50); } return null; };
  const json = (b) => Promise.resolve(new Response(JSON.stringify(b), { headers: { "Content-Type": "application/json" } }));
  const keys = ["yue2.machineScan", "yue2.artPainter", "yue2.memPreset"], was = keys.map((k) => localStorage.getItem(k));
  const o = {};
  L.set("ru"); await wait(400);
  window.fetch = (u, opts) => { u = String(u);
    if (u.startsWith("/lab/machine")) return json({ cards: [{ index: 0, name: "Quadro RTX 5000", total_mb: 16384, compute: "7.5", limit_mb: null, bf16_cores: false }], studio: 0,
      room_mb: 16384, painter: { suggest: "krea2-q4", ready: { "krea2-q4": false }, fits: ["krea2-q4", "sdxl"] } });
    return real(u, opts); };
  const p = window.ruachMachineScan(true);
  const d = await until(() => document.querySelector(".hd-back.is-on:not(.is-leaving) .hd-yes") && document.querySelector(".hd-back.is-on:not(.is-leaving)"));
  await wait(300);
  o.title = d ? d.querySelector(".hd-title").innerText : null;
  o.lines = d ? d.querySelector(".hd-body").innerText.split("\\n").filter((l) => l.trim()) : [];
  o.btns = d ? [...d.querySelectorAll(".hd-no, .hd-yes")].map((b) => b.textContent) : [];
  if (d) d.querySelector(".hd-no").click();
  await p; await wait(200);
  window.fetch = real;
  keys.forEach((k, i) => { if (was[i] === null) localStorage.removeItem(k); else localStorage.setItem(k, was[i]); });
  // the four ways: a key of its own lines whole; a soft line break (white-space: normal) read across by its pattern; lines each a key;
  // lines written already in the language, with «: » in them, left as they are and on their lines
  const keyed = "One adult female lead with clear melodic phrasing\\nAdd-on slider (see Engine \\u203a Sliders) \\u00b7 female";
  const box = document.createElement("div"); box.id = "ln59"; box.style.cssText = "position:fixed;left:-9999px;top:0;width:600px";
  box.innerHTML = '<div class="a" style="white-space:pre-line"></div><div class="b"></div><div class="c" style="white-space:pre-line"></div><div class="d" style="white-space:pre-wrap"></div>';
  document.body.appendChild(box);
  box.querySelector(".a").textContent = keyed;
  box.querySelector(".b").textContent = "Set for this machine:\\n      the backbone Q8_0";
  box.querySelector(".c").textContent = "Not now\\nSet them";
  box.querySelector(".d").textContent = "основа Q8_0: у compute 7.5 нет тензорных ядер BF16\\n· весь контекст, тайлы VAE 512";
  await wait(300);
  o.a = box.querySelector(".a").textContent; o.aWant = L.look(keyed, "ru");
  o.b = box.querySelector(".b").textContent; o.bWant = L.look("Set for this machine: the backbone Q8_0", "ru");
  o.c = box.querySelector(".c").textContent; o.d = box.querySelector(".d").textContent;
  box.remove();
  L.set("en"); await wait(300);
  o.back = document.documentElement.lang;
  return o; })()`);
check("the machine's scan in Russian: its lines kept (the card; what suits it; the backbone; the context; the artwork; where to change them), each in Russian",
  ln59.title === "Машина, какой её нашла студия" && ln59.lines.length === 6 && /^GPU0 · Quadro RTX 5000 · 16\.0 ГБ/.test(ln59.lines[0]) && ln59.lines[1] === "Что ей подходит:" &&
  /^· основа Q8_0: /.test(ln59.lines[2]) && /^· весь контекст, тайлы VAE 512/.test(ln59.lines[3]) && /^· обложки: Krea 2 Muse Q4/.test(ln59.lines[4]) && /«Сканировать машину»/.test(ln59.lines[5]) &&
  ln59.btns.join("|") === "Не сейчас|Выставить",
  JSON.stringify({ title: ln59.title, lines: ln59.lines, btns: ln59.btns }));
check("  a key of its own lines translated whole; a soft line break read across by its pattern; lines each a key, each translated; lines in the language already left on their lines",
  !!ln59.aWant && ln59.a === ln59.aWant && ln59.a.indexOf("\n") > 0 && !!ln59.bWant && ln59.b.trim() === ln59.bWant && ln59.c === "Не сейчас\nВыставить" &&
  ln59.d === "основа Q8_0: у compute 7.5 нет тензорных ядер BF16\n· весь контекст, тайлы VAE 512" && ln59.back === "en",
  JSON.stringify({ a: ln59.a, aWant: ln59.aWant, b: ln59.b, bWant: ln59.bWant, c: ln59.c, d: ln59.d, back: ln59.back }));

// HERESY 1169 · 1360 (Viktor 11.10.2026: «ПО CivitAI согласен»): «From Civitai…» in the LoRA library: an adapter by its link, looked at,
// fetched by the lab with the user's own key into its family's folder; the key never in the settings file
section("an adapter from Civitai: its link looked at, fetched into its family's folder with the user's key, the progress said; the key kept local");
const cv60 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), real = window.fetch, posted = [], settings = [];
  const until = async (fn, ms) => { for (let i = 0; i < (ms || 3000) / 50; i++) { const v = fn(); if (v) return v; await wait(50); } return null; };
  const json = (b, code) => Promise.resolve(new Response(JSON.stringify(b), { status: code || 200, headers: { "Content-Type": "application/json" } }));
  const KEY = "cv-test-key-7Q2", was = localStorage.getItem("yue2.civitaiKey"), painterWas = document.getElementById("arPainter").value;
  const o = {};
  let looks = { "https://civitai.com/models/11/tiny": { model: 11, version: 111, title: "Tiny Style", name: "v1.0", type: "LORA", adapter: true, base: "Krea 2", family: "krea2",
                 words: ["tinystyle", "tiny look"], file: "tiny style.safetensors", bytes: 37748736, sha256: "a".repeat(64), nsfw: false, url: "https://civitai.com/models/11?modelVersionId=111", here: [] },
               "https://civitai.com/models/22/qwen": { model: 22, version: 222, title: "Oil Paint", name: "2512", type: "LORA", adapter: true, base: "Qwen", family: "qwen-image-2512",
                 words: [], file: "oil paint.safetensors", bytes: 300000000, sha256: "b".repeat(64), nsfw: false, url: "https://civitai.com/models/22?modelVersionId=222", here: [] },
               "https://civitai.com/models/33/ckpt": { model: 33, version: 333, title: "A Checkpoint", name: "v2", type: "Checkpoint", adapter: false, base: "SDXL 1.0", family: "sdxl",
                 words: [], file: "ckpt.safetensors", bytes: 6000000000, sha256: "", nsfw: false, url: "https://civitai.com/models/33?modelVersionId=333", here: [] } };
  let polls = 0, fetching = false;
  window.fetch = (u, opts) => { u = String(u);
    const body = opts && opts.body ? String(opts.body) : "";
    if (u.startsWith("/lab/settings") && opts && opts.method === "POST") { settings.push(body); return json({ ok: true }); }
    if (u === "/lab/artist/civitai-look") { posted.push(["look", JSON.parse(body)]); const v = looks[JSON.parse(body).ref]; return v ? json(v) : json({ error: "Civitai does not know this version" }, 500); }
    if (u === "/lab/artist/civitai-fetch" && opts && opts.method === "POST") { posted.push(["fetch", JSON.parse(body)]); polls = 0; fetching = true; return json({ status: "running", file: "tiny style.safetensors", got: 0, size: 37748736, pct: 0 }, 202); }
    if (u === "/lab/artist/civitai-fetch") { if (!fetching) return json({ status: "idle" }); polls++; if (polls >= 2) fetching = false;
      return json(polls < 2 ? { status: "running", file: "tiny style.safetensors", got: 18874368, size: 37748736, pct: 50 } : { status: "done", file: "tiny style.safetensors", id: "krea2/tiny style.safetensors", got: 37748736, size: 37748736 }); }
    return real(u, opts); };
  localStorage.removeItem("yue2.civitaiKey");
  document.getElementById("arPainter").value = "krea2-q4";
  const win = window.HeresyArtistCivitai.open();
  const box = await until(() => document.querySelector(".ar-cv-back"));
  const q = (s) => box.querySelector(s), btn = (n) => box.querySelector('[data-cv="' + n + '"]');
  o.opened = !!box && !!q(".ar-cv-ref") && q(".ar-cv-key").type === "password" && btn("fetch").disabled;
  // a Krea 2 adapter for the Krea 2 library: looked at, its words and its size, Fetch with its size
  q(".ar-cv-ref").value = "https://civitai.com/models/11/tiny"; q(".ar-cv-key").value = KEY;
  btn("look").click(); await until(() => q(".ar-cv-what .ar-li-rows")); await wait(100);
  o.what = q(".ar-cv-what").innerText; o.fetchOn = !btn("fetch").disabled; o.fetchText = btn("fetch").textContent;
  // the key stays out of the settings file, and out of this browser until Remember
  window.HeresySettings.flush(); await wait(300);
  o.keptBefore = localStorage.getItem("yue2.civitaiKey");
  q(".ar-cv-keep").click(); await wait(50);
  o.keptAfter = localStorage.getItem("yue2.civitaiKey");
  window.HeresySettings.flush(); await wait(300);
  // fetched: its progress said, then done; Add it to the list offered (it is this painter's family)
  btn("fetch").click();
  o.progress = await until(() => /50 %/.test(q(".ar-cv-say").textContent) && q(".ar-cv-say").textContent, 4000);
  o.stopShown = !btn("stop").hidden;
  o.done = await until(() => /krea2\\/tiny style\\.safetensors/.test(q(".ar-cv-say").textContent) && q(".ar-cv-say").textContent, 5000);
  o.addShown = !btn("add").hidden; o.stopAfter = btn("stop").hidden;
  o.toast = [...document.querySelectorAll("#toasts .toast")].map((t) => t.textContent).filter((t) => /Fetched from Civitai/.test(t)).length;
  // a Qwen adapter from the Krea 2 library: said where it goes, and it goes there
  q(".ar-cv-ref").value = "https://civitai.com/models/22/qwen"; btn("look").click();
  await until(() => /Oil Paint/.test(q(".ar-cv-what").innerText)); await wait(100);
  o.qwenNote = q(".ar-cv-what").innerText;
  btn("fetch").click(); await until(() => posted.filter((p) => p[0] === "fetch").length === 2, 3000); await wait(1500);
  // a checkpoint: not an adapter, Fetch off
  q(".ar-cv-ref").value = "https://civitai.com/models/33/ckpt"; btn("look").click();
  await until(() => /A Checkpoint/.test(q(".ar-cv-what").innerText)); await wait(100);
  o.ckptNote = q(".ar-cv-what").innerText; o.ckptFetchOff = btn("fetch").disabled;
  // the lab's error said
  q(".ar-cv-ref").value = "https://civitai.com/models/99/none"; btn("look").click();
  o.err = await until(() => /does not know/.test(q(".ar-cv-say").textContent) && q(".ar-cv-say").textContent, 3000);
  o.posted = posted; o.settingsHasKey = settings.some((s) => s.indexOf(KEY) >= 0); o.settingsSent = settings.length;
  btn("close").click(); await wait(100);
  o.closed = !document.querySelector(".ar-cv-back");
  window.fetch = real;
  if (was === null) localStorage.removeItem("yue2.civitaiKey"); else localStorage.setItem("yue2.civitaiKey", was);
  document.getElementById("arPainter").value = painterWas;
  document.querySelectorAll("#toasts .toast").forEach((t) => t.remove());
  return o; })()`);
check("the window: a link and a key (hidden as it is typed); Look says the adapter, its base model, its words, its file and size; Fetch says the size",
  cv60.opened && /Tiny Style · v1\.0/.test(cv60.what) && /Krea 2/.test(cv60.what) && /tinystyle · tiny look/.test(cv60.what) && /tiny style\.safetensors · 36 MB/.test(cv60.what) &&
  cv60.fetchOn && /Fetch · 36 MB/.test(cv60.fetchText) && cv60.posted[0][0] === "look" && cv60.posted[0][1].key === "cv-test-key-7Q2",
  JSON.stringify({ opened: cv60.opened, what: cv60.what, fetchOn: cv60.fetchOn, fetchText: cv60.fetchText, posted: cv60.posted[0] }));
check("  the key in this browser only with Remember, and never in the settings file the network can read",
  cv60.keptBefore === null && cv60.keptAfter === "cv-test-key-7Q2" && !cv60.settingsHasKey,
  JSON.stringify({ before: cv60.keptBefore, after: cv60.keptAfter, inSettings: cv60.settingsHasKey, sent: cv60.settingsSent }));
check("  Fetch: the version, the key and the family sent; its progress, Stop while it runs; done said, a toast, «Add it to the list» for this painter's family",
  cv60.posted[1] && cv60.posted[1][0] === "fetch" && cv60.posted[1][1].ref === "111" && cv60.posted[1][1].family === "krea2" && cv60.posted[1][1].key === "cv-test-key-7Q2" &&
  /18 MB of 36 MB · 50 %/.test(cv60.progress || "") && cv60.stopShown && /^Fetched: krea2\/tiny style\.safetensors$/.test(cv60.done || "") && cv60.addShown && cv60.stopAfter && cv60.toast === 1,
  JSON.stringify({ fetch: cv60.posted[1], progress: cv60.progress, stop: cv60.stopShown, done: cv60.done, add: cv60.addShown, toast: cv60.toast }));
check("  a Qwen adapter from the Krea 2 library goes into Qwen-Image 2512's folder, said; a checkpoint is no adapter, Fetch off; the lab's error said",
  /Made for Qwen: it goes into the folder of Qwen-Image 2512\./.test(cv60.qwenNote) && cv60.posted[3] && cv60.posted[3][1].family === "qwen-image-2512" &&
  /This is a Checkpoint on Civitai, not an adapter/.test(cv60.ckptNote) && cv60.ckptFetchOff && /Civitai does not know this version/.test(cv60.err || "") && cv60.closed,
  JSON.stringify({ qwen: cv60.qwenNote, posted: cv60.posted.slice(2), ckpt: cv60.ckptNote, off: cv60.ckptFetchOff, err: cv60.err, closed: cv60.closed }));

// HERESY 1169 · 1361 (TODO.md: «A take that does not play on late in the long page test (buffered at readyState 1), and the WAV fallback that
// does not resume a take asked to play»)
section("the player: the WAV fallback goes on with a take asked to play; a take whose sound is all here and that does not start is loaded again, then said");
const evg61 = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true, userGesture: true });
  return r.result && r.result.result ? r.result.result.value : r; };
const pl61 = await evg61(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), a = document.getElementById("audio"), P = window.ruachPlayerChecks;
  const until = async (fn, ms) => { for (let i = 0; i < (ms || 3000) / 50; i++) { const v = fn(); if (v) return v; await wait(50); } return null; };
  const o = { had: a.getAttribute("src") }, offWas = P.listenOff();
  P.listenOff(false);
  // the FLAC route of the take in the player failing while it is asked to play (a click's play): the WAV, playing on
  a.src = "/library/listen?name=__no_such_take__";
  a.play().catch(() => {});
  o.wav = await until(() => /^\\/library\\/audio\\?/.test(a.getAttribute("src") || "") && !a.paused && a.currentTime > 0.05 && a.getAttribute("src"), 6000);
  o.fellToast = [...document.querySelectorAll("#toasts .toast")].some((t) => /No FLAC route/.test(t.textContent));
  a.pause(); await wait(200);                         // the pause heard (a src set at once would drop its event, as the page's loadPlayer knows)
  // a take not asked to play: its failing FLAC route gives the WAV and nothing plays
  a.src = "/library/listen?name=__no_such_take_either__";
  await until(() => /^\\/library\\/audio\\?/.test(a.getAttribute("src") || ""), 4000); await wait(600);
  o.quietStays = a.paused;
  P.listenOff(offWas);
  return o; })()`);
check("the take's FLAC route failing while it is asked to play: the WAV, and it plays on (said); a take not asked to play stays paused",
  !!pl61.wav && pl61.fellToast && pl61.quietStays, JSON.stringify(pl61));
const st61 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), a = document.getElementById("audio"), P = window.ruachPlayerChecks;
  const o = {};
  let loads = 0, plays = 0, paused = false, partial = false;
  HTMLMediaElement.prototype.pause.call(a); await wait(200);   // the real element still: no ending of its own to stand the watch down
  // a take in the player «asked to play» whose sound is all here and that does not start (readyState 1, its time standing): the long
  // test's case, made by hand; a real play would fire playing and stand the watch down, so play and pause are the test's own
  Object.defineProperty(a, "paused", { get: () => paused, configurable: true });
  Object.defineProperty(a, "readyState", { get: () => 1, configurable: true });
  Object.defineProperty(a, "currentTime", { get: () => 0.5, set: () => {}, configurable: true });
  Object.defineProperty(a, "duration", { get: () => 4, configurable: true });
  Object.defineProperty(a, "buffered", { get: () => ({ length: 1, start: () => 0, end: () => (partial ? 0.2 : 4) }), configurable: true });
  a.load = () => { loads++; }; a.play = () => { plays++; return Promise.resolve(); }; a.pause = () => { paused = true; };
  P.stall.tried = "";
  a.dispatchEvent(new Event("play"));
  await wait(4500);
  o.loads1 = loads; o.plays1 = plays; o.on1 = !paused;
  await wait(4200);
  o.loads2 = loads; o.pausedAfter = paused;
  o.toast = [...document.querySelectorAll("#toasts .toast")].some((t) => /would not start/.test(t.textContent));
  // a slow line: its sound not all here yet: it waits, nothing loaded again
  P.stall.tried = ""; loads = 0; paused = false; partial = true;
  a.dispatchEvent(new Event("play"));
  await wait(4500);
  o.slowLoads = loads; o.slowOn = !paused;
  a.dispatchEvent(new Event("pause"));
  ["paused", "readyState", "currentTime", "duration", "buffered", "load", "play", "pause"].forEach((k) => { delete a[k]; });
  P.stall.tried = "";
  document.querySelectorAll("#toasts .toast").forEach((t) => t.remove());
  return o; })()`);
check("  its sound all here and not playing for 4 s: loaded again in place and asked once more; still not: paused, and said; a slow line waits, nothing loaded again",
  st61.loads1 === 1 && st61.plays1 === 1 && st61.on1 && st61.loads2 === 1 && st61.pausedAfter && st61.toast && st61.slowLoads === 0 && st61.slowOn,
  JSON.stringify(st61));

// HERESY 1169 · 1364 (TODO.md, from Upscayl: «TTA (eight flips averaged, steadier, eight times slower) and a folder upscaled at once»)
section("the pictures picked upscaled in one run: «Upscale…» on their bar, 2K, 4K or the passes kept; TTA beside the upscaler, kept and sent");
const up64 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), real = window.fetch, posted = [], U = window.HeresyArtistUp;
  const until = async (fn, ms) => { for (let i = 0; i < (ms || 3000) / 50; i++) { const v = fn(); if (v) return v; await wait(50); } return null; };
  const json = (b, code) => Promise.resolve(new Response(JSON.stringify(b), { status: code || 200, headers: { "Content-Type": "application/json" } }));
  const was = { tta: localStorage.getItem("yue2.arUpTta"), model: localStorage.getItem("yue2.arUpModel") };
  window.fetch = (u, opts) => { u = String(u);
    if (u === "/lab/artist/upscalers") return json({ upscalers: [{ name: "4x_Nomos8kDAT.pth", scale: 4, mb: 1 }, { name: "4x_foolhardy_Remacri.pth", scale: 4, mb: 1 }] });
    if (u === "/lab/artist/upscale" && opts && opts.method === "POST") { const b = JSON.parse(opts.body); posted.push(b);
      return json({ id: "20261011-160000-abcd", kind: "upscale", painter: "upscale", status: "queued", of: b.items.length, count: b.items.length, pictures: [], shapes: ["1:1"], created: Date.now() / 1000 }, 202); }
    return real(u, opts); };
  const o = {};
  localStorage.setItem("yue2.arUpTta", "1");
  U.pick([{ id: "20261011-150000-aaaa", file: "01-1x1-s1.png" }, { id: "20261011-150100-bbbb", file: "02-1x1-s2.png" }]);
  await wait(100);
  const bar = document.getElementById("arPicked"), btn = bar && bar.querySelector('[data-pick="up"]');
  o.bar = bar && !bar.hidden && bar.innerText.replace(/\\s+/g, " ").trim();
  o.btn = !!btn;
  U.menu(btn);
  const menu = await until(() => document.querySelector(".hm-menu"));
  o.items = menu ? [...menu.querySelectorAll(".hm-item")].map((b) => b.innerText.replace(/\\s+/g, " ").trim()) : [];
  o.ttaChecked = menu ? !!menu.querySelector(".hm-item:last-child .hm-check, .hm-item:last-child[aria-checked=true], .hm-item.is-checked:last-child") || /✓|✔/.test(o.items[o.items.length - 1] || "") : false;
  if (menu) menu.querySelector(".hm-item").click();
  await until(() => posted.length, 3000); await wait(200);
  o.posted = posted[0] || null;
  o.cleared = !document.getElementById("arPicked") || document.getElementById("arPicked").hidden;
  o.toast = [...document.querySelectorAll("#toasts .toast")].map((t) => t.textContent).filter((t) => /Upscaling 2 pictures in one run/.test(t));
  window.fetch = real;
  ["tta", "model"].forEach((k) => { const key = k === "tta" ? "yue2.arUpTta" : "yue2.arUpModel"; if (was[k] === null) localStorage.removeItem(key); else localStorage.setItem(key, was[k]); });
  document.querySelectorAll(".hm-menu").forEach((m) => m.remove());
  document.querySelectorAll("#toasts .toast").forEach((t) => t.remove());
  return o; })()`);
check("two pictures picked: «Upscale…» on their bar; its menu has 2K and 4K by the chosen upscaler, the passes kept, TTA (on)",
  /2 picked/.test(up64.bar || "") && up64.btn && up64.items.length === 4 && /^2K · /.test(up64.items[0]) && /^4K · /.test(up64.items[1]) && /^In passes: /.test(up64.items[2]) && /TTA/.test(up64.items[3]),
  JSON.stringify({ bar: up64.bar, items: up64.items }));
check("  2K: both pictures sent in one request with the upscaler, the target and TTA; the picks let go; said",
  !!up64.posted && up64.posted.items.length === 2 && up64.posted.items[0].id === "20261011-150000-aaaa" && up64.posted.target === "2k" && up64.posted.tta === true &&
  /\.pth$/.test(up64.posted.model || "") && up64.cleared && up64.toast.length === 1,
  JSON.stringify({ posted: up64.posted, cleared: up64.cleared, toast: up64.toast }));

// HERESY 1169 · 1365 (TODO.md: «Their strength by steps (keyframes, as Viktor's ComfyUI hooks)»)
section("an adapter's strength over the steps: ⏱ opens its keyframes, read as typed (a wrong one said), kept, sent with Draw");
const ky65 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), real = window.fetch, sent = [], K = window.HeresyArtistKeys, AR = window.HeresyArtist;
  const until = async (fn, ms) => { for (let i = 0; i < (ms || 3000) / 50; i++) { const v = fn(); if (v) return v; await wait(50); } return null; };
  const json = (b, s) => Promise.resolve(new Response(JSON.stringify(b), { status: s || 200, headers: { "Content-Type": "application/json" } }));
  const keys = ["yue2.arPrompt", "yue2.arLoras", "yue2.arPainter"], was = keys.map((k) => localStorage.getItem(k));
  const now = Date.now() / 1000, lid = "krea2/cinematic_movie_still_krea2.safetensors";
  const o = {}, tabWas = document.body.dataset.tab || "create", painterWas = document.getElementById("arPainter").value;
  o.parse = [K.parse("0%:1, 50%:1, 60%:0"), K.parse("0:1, 100:1"), K.parse(" "), K.parse("50%:3") instanceof Error, K.parse("half:1") instanceof Error, K.text([[0, 1], [0.5, 1], [0.6, 0]])];
  window.fetch = (u, opts) => { u = String(u);
    if (u.startsWith("/lab/artist/runs")) return json({ runs: [] });
    if (u.startsWith("/lab/artist/loras")) return json({ root: "artwork/loras", titles: { krea2: "Krea 2" }, arch: {}, families: { krea2: [{ id: lid, family: "krea2", name: "cinematic_movie_still_krea2", folder: "", mb: 300, picture: false, info: {}, fits: true }] } });
    if (u.startsWith("/lab/artist/draw")) { const b = JSON.parse(opts.body); sent.push(b);
      return json({ id: "20261011-170000-beef", prompt: b.prompt, shapes: b.shapes, seed: 9, count: 1, painter: "krea2-q4", created: now, status: "done", of: 1, pictures: [] }); }
    return real(u, opts); };
  document.querySelector('.topbar [data-tab="artist"]').click();
  await until(() => !document.getElementById("view-artist").classList.contains("is-hidden"), 4000);
  const painter = document.getElementById("arPainter"); painter.value = "krea2-q4"; painter.dispatchEvent(new Event("change", { bubbles: true }));
  await AR.loras.reload(); AR.loras.set([{ id: lid, weight: 0.8 }], "krea2"); await wait(150);
  const row = () => document.querySelector('#arLoraList [data-li="0"]');
  o.kbBefore = !!row().querySelector("[data-lk]") && !row().querySelector(".ar-lora-k");
  row().querySelector("[data-lk]").click(); await wait(100);
  const f = row().querySelector(".ar-lora-k");
  o.opened = !!f && document.activeElement === f;
  f.value = "half:1"; f.dispatchEvent(new Event("input", { bubbles: true }));
  o.bad = f.classList.contains("is-bad") && /Not a keyframe/.test(f.dataset.tip || "") && !AR.loras.now()[0].keys;
  f.value = "0%:1, 50%:1, 60%:0"; f.dispatchEvent(new Event("input", { bubbles: true }));
  o.kept = JSON.stringify(AR.loras.now()[0].keys); o.on = row().querySelector("[data-lk]").classList.contains("is-on") && !f.classList.contains("is-bad");
  const prompt = document.getElementById("arPrompt"); prompt.value = "a lighthouse at dawn"; prompt.dispatchEvent(new Event("input", { bubbles: true }));
  await until(() => !document.getElementById("arDraw").disabled, 3000);
  document.getElementById("arDraw").click();
  await until(() => sent.length, 3000); await wait(200);
  o.sent = sent[0] ? sent[0].loras : null;
  // ⏱ again with the field filled: closed, the keyframes let go
  row().querySelector("[data-lk]").click(); await wait(100);
  o.closed = !row().querySelector(".ar-lora-k") && !AR.loras.now()[0].keys;
  window.fetch = real;
  keys.forEach((k, i) => { if (was[i] === null) localStorage.removeItem(k); else localStorage.setItem(k, was[i]); });
  const pw = document.getElementById("arPainter"); pw.value = painterWas; pw.dispatchEvent(new Event("change", { bubbles: true }));   // the room as it was
  document.querySelector('.topbar [data-tab="' + tabWas + '"]').click(); await wait(300);
  return o; })()`);
check("keyframes read: «0%:1, 50%:1, 60%:0» as shares and multipliers, all at 1 or nothing as none, past 2 or a word refused, written back as typed",
  JSON.stringify(ky65.parse) === JSON.stringify([[[0, 1], [0.5, 1], [0.6, 0]], null, null, true, true, "0%:1, 50%:1, 60%:0"]), JSON.stringify(ky65.parse));
check("  ⏱ beside an adapter opens its field (focused); a wrong keyframe said, nothing kept; a right one kept, ⏱ lit; Draw sends them with the strength; ⏱ again closes and lets them go",
  ky65.kbBefore && ky65.opened && ky65.bad && ky65.kept === "[[0,1],[0.5,1],[0.6,0]]" && ky65.on && JSON.stringify(ky65.sent) === JSON.stringify([{ id: "krea2/cinematic_movie_still_krea2.safetensors", weight: 0.8, keys: [[0, 1], [0.5, 1], [0.6, 0]] }]) && ky65.closed,
  JSON.stringify(ky65));

// HERESY 1169 · 1366 (Viktor 11.10.2026: «Выровняй высоты полей ввода в пар с дропдаун селекторами. При сжатии колонки РАСПИСАНИЕ остаётся на той
// же строке и врубает скроллинг горизонтальный. Поставь минимум 25% ширины экрана, максимум 30%. На правую колонку минимум 20%, максимум 35%»)
section("the Artist's columns: the prompt's 25–30 % of the window, the library's 20–35 %; every field one height with the selects; nothing wider than its column");
const lay66 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const tabWas = document.body.dataset.tab || "create", was = { l: localStorage.getItem("yue2.arL"), r: localStorage.getItem("yue2.arR") };
  document.querySelector('.topbar [data-tab="artist"]').click(); await wait(500);
  const s = document.getElementById("arSampling"); const open = s.open; s.open = true; await wait(100);
  const cols = document.getElementById("arCols"), left = cols.querySelector(".ar-left"), right = cols.querySelector(".ar-right"), W = innerWidth;
  const share = (el) => Math.round(el.getBoundingClientRect().width / W * 1000) / 10;
  const o = { W, at: [share(left), share(right)] };
  // dragged past its bounds from the keyboard: it stops at them
  const edgeL = document.getElementById("arEdgeL"), edgeR = document.getElementById("arEdgeR");
  for (let i = 0; i < 40; i++) edgeL.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
  for (let i = 0; i < 40; i++) edgeR.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
  await wait(150); o.wide = [share(left), share(right)];
  for (let i = 0; i < 80; i++) edgeL.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
  for (let i = 0; i < 80; i++) edgeR.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
  await wait(150); o.narrow = [share(left), share(right)];
  // at its narrowest: one height for the fields and the selects, nothing past the column's edge, the painter and its fine-tune a row each
  const fields = [...left.querySelectorAll("input:not([type=checkbox]):not([type=range]):not([type=file]):not(.ar-lora-k), select")].filter((e) => e.offsetParent);
  o.heights = [...new Set(fields.map((e) => Math.round(e.getBoundingClientRect().height)))];
  const edge = left.getBoundingClientRect().left + left.clientWidth + 0.5;   // what shows: nothing past the column's visible edge
  o.past = [...left.querySelectorAll("*")].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.right > edge; }).map((e) => e.id || e.tagName).slice(0, 5);
  const p = document.getElementById("arPainter").closest(".field"), m = document.getElementById("arModel").closest(".field");
  o.rows = Math.round(m.getBoundingClientRect().top - p.getBoundingClientRect().top);
  s.open = open;
  edgeL.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true })); edgeR.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
  ["l", "r"].forEach((k) => { const key = k === "l" ? "yue2.arL" : "yue2.arR"; if (was[k] === null) localStorage.removeItem(key); else localStorage.setItem(key, was[k]); });
  window.dispatchEvent(new Event("resize"));            // the kept widths read again
  document.querySelector('.topbar [data-tab="' + tabWas + '"]').click(); await wait(300);
  return o; })()`);
check("the prompt's column 25–30 % of the window, the library's 20–35 % (dragged past them from the keys, they stop there)",
  lay66.at[0] >= 24.9 && lay66.at[0] <= 30.1 && lay66.at[1] >= 19.9 && lay66.at[1] <= 35.1 && Math.abs(lay66.wide[0] - 30) < 0.3 && Math.abs(lay66.wide[1] - 35) < 0.3 &&
  Math.abs(lay66.narrow[0] - 25) < 0.3 && Math.abs(lay66.narrow[1] - 20) < 0.3, JSON.stringify(lay66));
check("  at the narrowest every field and select one height (36 px), nothing wider than the column, the painter and its fine-tune a row each",
  lay66.heights.length === 1 && lay66.heights[0] === 36 && lay66.past.length === 0 && lay66.rows > 30, JSON.stringify(lay66));

// HERESY 1169 · 1367 (Viktor 11.10.2026: «добавь Protect опцию для картинок. Такое нельзя ни в коем случае упустить в корзину, а потом
// ненароком в бездну»)
section("a picture protected: the shield on the stage, in the gallery and on the picked bar; Trash leaves it in the room and says so; the gallery's filter of the protected");
const pr67 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), real = window.fetch, sent = [];
  const until = async (fn, ms) => { for (let i = 0; i < (ms || 3000) / 50; i++) { const v = fn(); if (v) return v; await wait(50); } return null; };
  const json = (b, s) => Promise.resolve(new Response(JSON.stringify(b), { status: s || 200, headers: { "Content-Type": "application/json" } }));
  const tabWas = document.body.dataset.tab || "create", keys = ["yue2.arLook", "yue2.arFilter"], was = keys.map((k) => localStorage.getItem(k));
  const now = Date.now() / 1000;
  const pic = (n, extra) => Object.assign({ n, shape: "1:1", seed: 40 + n, w: 1280, h: 1280, kept: true, file: "0" + n + "-1x1-s" + (40 + n) + ".png", thumb: "thumbs/0" + n + "-1x1-s" + (40 + n) + ".jpg" }, extra || {});
  let runs = [{ id: "20261011-180000-aaaa", prompt: "a stone church at dusk", shapes: ["1:1"], seed: 41, count: 2, painter: "krea2-q4", created: now - 60, status: "done", of: 2, took: 30,
    pictures: [pic(1, { protected: true }), pic(2)] }];
  window.fetch = (u, o) => { u = String(u);
    if (u.startsWith("/lab/artist/runs")) return json({ runs });
    if (u.startsWith("/lab/artist/protect")) { const b = JSON.parse(o.body); sent.push(["protect", b]);
      b.items.forEach((x) => runs.forEach((r) => r.pictures.forEach((p) => { if (r.id === x.id && p.file === x.file) { if (b.protect) p.protected = true; else delete p.protected; } })));
      return json({ protect: b.protect, done: b.items }); }
    if (u.startsWith("/lab/artist/aside")) { const b = JSON.parse(o.body); sent.push(["aside", b]);
      const kept = [], done = [];
      b.items.forEach((x) => runs.forEach((r) => r.pictures.forEach((p) => { if (r.id === x.id && p.file === x.file) { if (p.protected) kept.push(Object.assign({ why: "protected" }, x)); else { p.aside = true; done.push(x); } } })));
      return json({ aside: true, done, trashed: [], kept }); }
    if (u.startsWith("/lab/artist/file")) return Promise.resolve(new Response(new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" })));
    return real(u, o); };
  document.querySelector('.topbar [data-tab="artist"]').click();
  await until(() => !document.getElementById("view-artist").classList.contains("is-hidden"), 4000); await wait(600);
  const o = {}, lookWas = (document.querySelector("#arBar [data-look].is-on") || {}).dataset ? document.querySelector("#arBar [data-look].is-on").dataset.look : "runs";
  // the gallery: the first picture's shield lit, the filter of the protected shows it alone
  const gal = document.querySelector('#arBar [data-look="gallery"]'); if (gal) gal.click(); await wait(400);
  const g = () => [...document.querySelectorAll("#arRuns .ar-gpic")];
  o.shields = g().map((f) => f.querySelector(".ar-prot") && f.querySelector(".ar-prot").classList.contains("is-on"));
  document.querySelector('#arFilters [data-filter="protected"]').click(); await wait(300);
  o.filtered = g().length;
  document.querySelector('#arFilters [data-filter="all"]').click(); await wait(300);
  // the second picture's shield in the gallery: protected
  g()[1].querySelector(".ar-prot").click(); await until(() => sent.length >= 1, 2000); await wait(400);
  o.gprot = sent[0] ? sent[0][1] : null;
  // the stage: the picked picture's shield and its Trash
  g()[0].querySelector(".ar-thumb").click(); await wait(400);
  const stg = document.getElementById("arStage");
  o.stage = { shield: !!stg.querySelector('[data-stage="protect"].is-on'), trashOff: !!(stg.querySelector('[data-stage="aside"]') || {}).disabled };
  stg.querySelector('[data-stage="protect"]').click(); await until(() => sent.length >= 2, 2000); await wait(400);
  o.unprot = sent[1] ? sent[1][1] : null;
  // Trash with both picked: the protected stays and is said
  window.HeresyArtistUp.pick([{ id: runs[0].id, file: runs[0].pictures[0].file }, { id: runs[0].id, file: runs[0].pictures[1].file }]); await wait(150);
  o.pickedShield = !!document.querySelector('#arPicked [data-pick="protect"]');
  document.querySelector('#arPicked [data-pick="aside"]').click(); await until(() => sent.some((x) => x[0] === "aside"), 2000); await wait(500);
  o.toasts = [...document.querySelectorAll("#toasts .toast")].map((t) => t.textContent).filter((t) => /stayed in the room/.test(t));
  window.fetch = real;
  const lb = document.querySelector('#arBar [data-look="' + lookWas + '"]'); if (lb) lb.click(); await wait(200);   // the room's look as it was
  keys.forEach((k, i) => { if (was[i] === null) localStorage.removeItem(k); else localStorage.setItem(k, was[i]); });
  document.querySelectorAll("#toasts .toast").forEach((t) => t.remove());
  document.querySelector('.topbar [data-tab="' + tabWas + '"]').click(); await wait(300);
  return o; })()`);
check("the gallery: a protected picture's shield lit, the filter of the protected shows it alone; the other's shield protects it",
  JSON.stringify(pr67.shields) === "[true,false]" && pr67.filtered === 1 && !!pr67.gprot && pr67.gprot.protect === true && pr67.gprot.items.length === 1 && /02-1x1/.test(pr67.gprot.items[0].file),
  JSON.stringify({ shields: pr67.shields, filtered: pr67.filtered, gprot: pr67.gprot }));
check("  the stage: its shield lit and Trash off for a protected picture; the shield takes the protection off; Trash with two picked leaves the protected in the room, said",
  pr67.stage.shield && pr67.stage.trashOff && !!pr67.unprot && pr67.unprot.protect === false && pr67.pickedShield && pr67.toasts.length === 1,
  JSON.stringify({ stage: pr67.stage, unprot: pr67.unprot, picked: pr67.pickedShield, toasts: pr67.toasts }));

// HERESY 1169 · 1368 (Viktor 11.10.2026: «И на аудио треки в студии тоже защиту добавь в опцию и в фильтр в Библиотеке не забудь эту опцию»)
section("a take protected: the shield on its card, in the Creator's column and its head; the menu's item; the Librarian's filter and count; the trash and Delete pass it by, said");
const pt68 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), real = window.fetch, sent = [], HC = window.HeresyCollection, $ = (id) => document.getElementById(id);
  const until = async (fn, ms) => { for (let i = 0; i < (ms || 3000) / 50; i++) { const v = fn(); if (v) return v; await wait(50); } return null; };
  const json = (b) => Promise.resolve(new Response(JSON.stringify(b), { status: 200, headers: { "Content-Type": "application/json" } }));
  const tabWas = document.body.dataset.tab || "create", kept = {};
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/^yue2[.]coll/.test(k)) kept[k] = localStorage.getItem(k); }
  const names = [...document.querySelectorAll("#libList .take[data-name]:not(.is-fav):not([data-run])")].map((c) => c.dataset.name);
  if (names.length < 2) return { err: "fewer than two takes in the Creator's column: " + names.length };
  const A = names[0], B = names[1], P = (document.querySelector("#libList .take.is-active") || { dataset: {} }).dataset.name || "";
  const row = (n, extra) => Object.assign({ name: n, title: "take " + n.slice(-6), created: Math.floor(Date.now() / 1000) - 600, seconds: 60, favorite: false, kind: "generated", cot: "off",
    derived: [], hidden: false, workspaces: [], rating: 0, note: "", seeds: null, fresh: false, regen_of: "", frozen: false, protected: false }, extra || {});
  let rows = [row(A, { protected: true }), row(B)].concat(P && P !== A && P !== B ? [row(P)] : []);
  const cat = () => ({ takes: rows, workspaces: [], trash_days: 0, locks: {}, pins: {}, frozen: [] });
  window.fetch = (u, opt) => { u = String(u);
    if (u.startsWith("/lab/catalog")) return new Promise(() => {});      // the Librarian's own load waits: the rows come from the answers below, «loaded» as it was
    if (u.startsWith("/lab/collection") && !u.startsWith("/lab/collection/diamonds")) { const b = JSON.parse(opt.body);
      if (b.op === "protect") { sent.push(["protect", b]); rows.forEach((r) => { if (b.names.includes(r.name)) r.protected = !!b.on; }); }
      return json(cat()); }
    if (u.startsWith("/lab/trash")) { if (opt && opt.method === "POST") { const b = JSON.parse(opt.body); sent.push(["trash", b]);
        return json({ moved: [], locked: [], protected: b.names.filter((n) => rows.some((r) => r.name === n && r.protected)) }); }
      return json({ items: [] }); }
    if (u.startsWith("/library/delete")) { sent.push(["delete", u]); return json({ deleted: "" }); }
    return real(u, opt); };
  const o = {}, card = (n) => document.querySelector('#collGrid .coll-card[data-name="' + n + '"]');
  const menuOf = async (n) => { const c = card(n); if (!c) return []; const r = c.getBoundingClientRect();
    c.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: r.left + 20, clientY: r.top + 10 })); await wait(150);
    return [...document.querySelectorAll(".hm-menu .hm-item")]; };
  const said = (re) => [...document.querySelectorAll("#toasts .toast")].map((t) => t.textContent).filter((t) => re.test(t)).length;
  try {
    document.querySelector('.topbar [data-tab="collection"]').click();
    await until(() => !$("view-collection").classList.contains("is-hidden"), 3000); await wait(300);
    const all = document.querySelector('#collSide [data-place=""]'); if (all) all.click(); await wait(150);
    await HC.act({ op: "hide", names: [] }, null, true); await wait(200);   // the rows in hand
    o.shields = [A, B].map((n) => { const b = card(n) && card(n).querySelector(".coll-act.prot"); return b ? b.getAttribute("aria-pressed") : "none"; });
    o.head = ($("collNote") || {}).textContent || "";
    // the filter: «protected» counts one; ticked, only it shows; unticked again
    const pick = (want) => { const b = document.querySelector(".hd-back.is-on:not(.is-leaving)"); if (!b) return null;
      const r = [...b.querySelectorAll(".hd-check")].find((x) => x.querySelector(".hd-item-label").textContent === "protected"); if (!r) return null;
      const note = r.querySelector(".hd-item-note").textContent, i = r.querySelector("input"); i.checked = want; i.dispatchEvent(new Event("change", { bubbles: true })); return note; };
    $("collFilterBtn").click(); await until(() => document.querySelector(".hd-back.is-on:not(.is-leaving) .hd-pick"), 3000);
    o.filterNote = pick(true); await wait(50);
    document.querySelector(".hd-back.is-on:not(.is-leaving) .hd-yes").click(); await wait(400);
    o.filtered = [...document.querySelectorAll("#collGrid .coll-card[data-name]")].map((c) => c.dataset.name === A ? "A" : c.dataset.name === B ? "B" : "other").join(",");
    $("collFilterBtn").click(); await until(() => document.querySelector(".hd-back.is-on:not(.is-leaving) .hd-pick"), 3000); pick(false); await wait(50);
    document.querySelector(".hd-back.is-on:not(.is-leaving) .hd-yes").click(); await wait(400);
    // B's shield protects it
    card(B).querySelector(".coll-act.prot").click(); await until(() => sent.length >= 1, 2000); await wait(300);
    o.cardProt = sent[0] ? sent[0][1] : null; o.cardLit = card(B).querySelector(".coll-act.prot").getAttribute("aria-pressed");
    // both checked, the bar's shield: all protected already, so the protection comes off both
    [A, B].forEach((n) => card(n).querySelector("input[data-sel]").click()); await wait(200);
    $("collProtect").click(); await until(() => sent.length >= 2, 2000); await wait(300);
    o.barProt = sent[1] ? sent[1][1] : null;
    $("collSelNone").click(); await wait(100);
    await HC.protect([A], true); await HC.protect([B], false); await wait(200);   // A protected again, B not
    // the menu: B's item protects it, A's takes it off (ticked); «Open in the Creator» opens A
    let items = await menuOf(B);
    o.menuB = items.filter((b) => /protect/i.test(b.textContent)).map((b) => b.querySelector(".hm-label").textContent + ":" + b.getAttribute("aria-checked"));
    window.HeresyMenu.close();
    items = await menuOf(A);
    o.menuA = items.filter((b) => /protect/i.test(b.textContent)).map((b) => b.querySelector(".hm-label").textContent + ":" + b.getAttribute("aria-checked"));
    const go = items.find((b) => b.querySelector(".hm-label").textContent === "Open in the Creator");
    if (go) go.click(); else window.HeresyMenu.close();
    await until(() => document.body.dataset.tab === "create", 3000); await wait(400);
    // the Creator: A's head shield lit, its Delete off and refusing, said; its card in the column with no ✕, its shield lit
    o.headShield = $("protTake") ? $("protTake").getAttribute("aria-pressed") : "none";
    o.delOff = !!$("deleteTake") && $("deleteTake").classList.contains("is-off");
    const lc = document.querySelector('#libList .take[data-name="' + A + '"]');
    o.colA = lc ? { x: !!lc.querySelector(".take-del"), shield: lc.querySelector(".coll-act.prot") ? lc.querySelector(".coll-act.prot").getAttribute("aria-pressed") : "none" } : null;
    $("deleteTake").click(); await wait(300);
    o.delSaid = said(/is protected: take its protection off first/); o.deleted = sent.filter((x) => x[0] === "delete").length;
    // the head's shield takes the protection off: Delete answers again
    $("protTake").click(); await until(() => sent.filter((x) => x[0] === "protect").length >= 5, 2000); await wait(300);
    o.headOff = { shield: $("protTake").getAttribute("aria-pressed"), off: $("deleteTake").classList.contains("is-off") };
    await HC.protect([A], true); await wait(200);
    // «Delete non-favourites…»: the protected pass by, said
    const DC = window.HeresyDialog.confirm; let asked = "";
    window.HeresyDialog.confirm = (t) => { asked = String(t); return Promise.resolve(false); };
    $("deleteNonFav").click(); await wait(200);
    window.HeresyDialog.confirm = DC;
    o.nonFav = asked.includes("1 protected take stays too.");
    // the trash from the Librarian: A stays, said
    document.querySelector('.topbar [data-tab="collection"]').click(); await wait(400);
    card(A).querySelector("input[data-sel]").click(); await wait(100);
    $("collTrash").click();
    const yes = await until(() => document.querySelector(".hd-back.is-on:not(.is-leaving) .hd-yes"), 3000); if (yes) yes.click();
    await until(() => sent.some((x) => x[0] === "trash"), 3000); await wait(400);
    o.trashSaid = said(/protected take stayed in the library/);
  } catch (e) { o.err = String(e && e.stack || e); }
  // the room as it was: the take that was open, its rows none again («loaded» untouched), the places and filters remembered, the room
  try {
    window.HeresyMenu.close();
    if ($("collSelNone")) $("collSelNone").click();
    if (P && P !== A) { document.querySelector('.topbar [data-tab="collection"]').click(); await wait(300);
      const back = (await menuOf(P)).find((b) => b.querySelector(".hm-label").textContent === "Open in the Creator"); if (back) back.click(); else window.HeresyMenu.close(); await wait(400); }
    rows = []; await HC.act({ op: "hide", names: [] }, null, true);
  } catch (e) { o.restoreErr = String(e); }
  window.fetch = real;
  for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (/^yue2[.]coll/.test(k) && !(k in kept)) localStorage.removeItem(k); }
  Object.keys(kept).forEach((k) => localStorage.setItem(k, kept[k]));
  document.querySelectorAll("#toasts .toast").forEach((t) => t.remove());
  if ($("collUndo")) $("collUndo").hidden = true;
  document.querySelector('.topbar [data-tab="' + tabWas + '"]').click(); await wait(300);
  return o; })()`);
check("the Librarian: a protected take's shield lit, the other's not; «1 protected» in the head; the filter's «protected» counts one and shows it alone",
  !pt68.err && JSON.stringify(pt68.shields) === '["true","false"]' && /1 protected/.test(pt68.head) && pt68.filterNote === "1" && pt68.filtered === "A",
  JSON.stringify({ err: pt68.err, shields: pt68.shields, head: pt68.head, note: pt68.filterNote, filtered: pt68.filtered }));
check("  a card's shield protects it (lit at once); the bar's with all protected takes it off them all",
  !!pt68.cardProt && pt68.cardProt.on === true && pt68.cardProt.names.length === 1 && pt68.cardLit === "true" && !!pt68.barProt && pt68.barProt.on === false && pt68.barProt.names.length === 2,
  JSON.stringify({ card: pt68.cardProt, lit: pt68.cardLit, bar: pt68.barProt }));
check("  the menu: «Protect it» on a take, «Take its protection off» ticked on a protected one",
  JSON.stringify(pt68.menuB) === '["Protect it:false"]' && JSON.stringify(pt68.menuA) === '["Take its protection off:true"]', JSON.stringify({ B: pt68.menuB, A: pt68.menuA }));
check("  the Creator: the head's shield lit and Delete off, refusing aloud (nothing sent); the column's card without ✕, its shield lit; the head's shield takes it off and Delete answers again",
  pt68.headShield === "true" && pt68.delOff && pt68.colA && !pt68.colA.x && pt68.colA.shield === "true" && pt68.delSaid === 1 && pt68.deleted === 0 &&
  pt68.headOff && pt68.headOff.shield === "false" && !pt68.headOff.off, JSON.stringify({ head: pt68.headShield, off: pt68.delOff, col: pt68.colA, said: pt68.delSaid, deleted: pt68.deleted, after: pt68.headOff }));
check("  «Delete non-favourites…» says the protected stay; the trash leaves a protected take in the library, said",
  pt68.nonFav && pt68.trashSaid === 1 && !pt68.restoreErr, JSON.stringify({ nonFav: pt68.nonFav, trash: pt68.trashSaid, restoreErr: pt68.restoreErr }));

// HERESY 1169 · 1369 (Viktor 11.10.2026: «в галерее картинок сделай навигацию стрелочными кнопками клавиатуры. Lightning и Ведение с кнопкой сброса на следующую полосу перенеси»)
section("the Artist's library by the arrow keys: the gallery's ← → and ↑ ↓ by its rows, the runs' ↑ ↓ by run; not while typing; Lightning, Guidance and Reset on a row of their own");
const nv69 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), real = window.fetch, $ = (id) => document.getElementById(id);
  const until = async (fn, ms) => { for (let i = 0; i < (ms || 3000) / 50; i++) { const v = fn(); if (v) return v; await wait(50); } return null; };
  const json = (b) => Promise.resolve(new Response(JSON.stringify(b), { status: 200, headers: { "Content-Type": "application/json" } }));
  const tabWas = document.body.dataset.tab || "create", keys = ["yue2.arLook", "yue2.arFilter"], was = keys.map((k) => localStorage.getItem(k));
  const now = Date.now() / 1000;
  const pic = (n) => ({ n, shape: "1:1", seed: 70 + n, w: 1280, h: 1280, kept: true, file: "0" + n + "-1x1-s" + (70 + n) + ".png", thumb: "thumbs/0" + n + "-1x1-s" + (70 + n) + ".jpg" });
  const runs = [{ id: "20261011-190000-bbbb", prompt: "a lighthouse", shapes: ["1:1"], seed: 71, count: 4, painter: "krea2-q4", created: now - 60, status: "done", of: 4, took: 30, pictures: [1, 2, 3, 4].map(pic) },
                { id: "20261011-180000-cccc", prompt: "a stone church", shapes: ["1:1"], seed: 75, count: 4, painter: "krea2-q4", created: now - 600, status: "done", of: 4, took: 30, pictures: [5, 6, 7, 8].map(pic) }];
  window.fetch = (u, o) => { u = String(u);
    if (u.startsWith("/lab/artist/runs")) return json({ runs });
    if (u.startsWith("/lab/artist/file")) return Promise.resolve(new Response(new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" })));
    return real(u, o); };
  const o = {}, key = (k, el) => { const ev = new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }); (el || document.body).dispatchEvent(ev); return ev.defaultPrevented; };
  try {
    document.querySelector('.topbar [data-tab="artist"]').click();
    await until(() => !$("view-artist").classList.contains("is-hidden"), 4000); await wait(600);
    const lookWas = (document.querySelector("#arBar [data-look].is-on") || { dataset: { look: "runs" } }).dataset.look;
    // the sampling: its second row
    const sp = $("arSampling"), opened = sp.open; sp.open = true; await wait(50);
    o.rows = { first: !!$("arSteps").closest(".ar-samp-row:not(.ar-samp-row2)") && !!$("arSchedule").closest(".ar-samp-row:not(.ar-samp-row2)"),
      second: ["arLightBox", "arCfgBox", "arSampReset"].every((id) => !!$(id).closest(".ar-samp-row2")) };
    sp.open = opened;
    // the gallery
    document.querySelector('#arBar [data-look="gallery"]').click(); await wait(400);
    const at = () => { const s = document.querySelector("#arRuns .ar-gpic .ar-thumb.is-sel"); return s ? +s.closest(".ar-gpic").dataset.g : -1; };
    const figs = [...document.querySelectorAll("#arRuns .ar-gpic[data-g]")], cols = figs.filter((f) => f.offsetTop === figs[0].offsetTop).length;
    figs[0].querySelector(".ar-thumb").click(); await wait(200);
    o.cols = cols; o.walk = [at()];
    for (const k of ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"]) { key(k); await wait(120); o.walk.push(at()); }
    // the last picture: → kept by the library (not the player's seek), the picture stays
    figs[figs.length - 1].querySelector(".ar-thumb").click(); await wait(200);
    o.endTaken = key("ArrowRight"); await wait(120); o.endAt = at();
    // typing in the prompt: the arrows are the text's
    figs[0].querySelector(".ar-thumb").click(); await wait(200);
    o.typing = !key("ArrowRight", $("arPrompt")); await wait(120); o.typingAt = at();
    // the runs: → the next picture, ↓ the next run at the same place
    document.querySelector('#arBar [data-look="runs"]').click(); await wait(400);
    const sel = () => { const s = document.querySelector("#arRuns .ar-run .ar-pic .ar-thumb.is-sel"); if (!s) return ""; const f = s.closest(".ar-pic"); return f.closest(".ar-run").dataset.id.slice(-4) + "#" + f.dataset.i; };
    document.querySelector('#arRuns .ar-run[data-id="' + runs[0].id + '"] .ar-pic[data-i="1"] .ar-thumb').click(); await wait(200);
    o.runs = [sel()];
    for (const k of ["ArrowRight", "ArrowDown", "ArrowUp"]) { key(k); await wait(120); o.runs.push(sel()); }
    const lb = document.querySelector('#arBar [data-look="' + lookWas + '"]'); if (lb) lb.click(); await wait(200);
  } catch (e) { o.err = String(e && e.stack || e); }
  window.fetch = real;
  keys.forEach((k, i) => { if (was[i] === null) localStorage.removeItem(k); else localStorage.setItem(k, was[i]); });
  document.querySelector('.topbar [data-tab="' + tabWas + '"]').click(); await wait(300);
  return o; })()`);
check("the sampling: Steps, Sampler and Schedule on their row, Lightning, Guidance and Reset on the next", !nv69.err && nv69.rows && nv69.rows.first && nv69.rows.second, JSON.stringify({ err: nv69.err, rows: nv69.rows }));
check("  the gallery: → the next picture, ↓ a row down (its columns as laid out), ← back, ↑ up again; at the last → stays, the key taken (no seek); in the prompt the arrows are the text's",
  nv69.cols >= 1 && JSON.stringify(nv69.walk) === JSON.stringify(((c) => { const d = 1 + c <= 7 ? 1 + c : 1, l = d - 1; return [0, 1, d, l, l - c >= 0 ? l - c : l]; })(nv69.cols)) && nv69.endTaken && nv69.endAt === 7 && nv69.typing && nv69.typingAt === 0,
  JSON.stringify({ cols: nv69.cols, walk: nv69.walk, endTaken: nv69.endTaken, endAt: nv69.endAt, typing: nv69.typing, typingAt: nv69.typingAt }));
check("  the runs: → the next picture of the run, ↓ the next run at the same place, ↑ back", JSON.stringify(nv69.runs) === '["bbbb#1","bbbb#2","cccc#2","bbbb#2"]', JSON.stringify(nv69.runs));

// HERESY 1169 · 1370 (Viktor 11.10.2026: «на кнопку ВЫГРУЗИТЬ в Баре тоже подключи выгруз не только YuE2 моделей, но абсолютно всего, что у нас в VRAM студийного»)
section("the Bar's Unload with the Artist's painter kept between runs: lit and said in its tip and on the Engine's card; a click lets the painter go with the engine's models, said");
const un70 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), real = window.fetch, sent = [], $ = (id) => document.getElementById(id);
  const until = async (fn, ms) => { for (let i = 0; i < (ms || 3000) / 50; i++) { const v = fn(); if (v) return v; await wait(50); } return null; };
  const json = (b) => Promise.resolve(new Response(JSON.stringify(b), { status: 200, headers: { "Content-Type": "application/json" } }));
  let painters = [{ gpu: 2, painter: "krea2-q4", busy: false, idle_s: 30 }];
  window.fetch = (u, opt) => { u = String(u);
    if (u.startsWith("/lab/activity")) return json({ seq: 0, lines: [], running: [], queue: [], regenerating: [], painters });
    if (u.startsWith("/lab/artist/unload")) { sent.push("lab"); const r = { released: painters.filter((p) => !p.busy), busy: [] }; painters = []; return json(r); }
    if (u === "/unload") sent.push("engine");
    return real(u, opt); };
  const o = {};
  try {
    o.seen = !!(await until(() => /kept between runs on GPU 2/.test($("unloadModel").dataset.tip || ""), 8000));
    o.lit = $("unloadModel").classList.contains("is-loaded"); o.on = !$("unloadModel").disabled;
    o.tip = $("unloadModel").dataset.tip;
    o.card = /a painter kept between runs · GPU 2/.test(($("hwCard") || {}).textContent || "");
    $("unloadModel").click();
    await until(() => sent.includes("lab"), 4000); await wait(600);
    o.sent = sent.slice();
    o.said = [...document.querySelectorAll("#toasts .toast")].map((t) => t.textContent).filter((t) => /painter let go \\(GPU 2\\)/.test(t)).length;
    o.gone = !!(await until(() => !/kept between runs/.test($("unloadModel").dataset.tip || ""), 8000));
  } catch (e) { o.err = String(e && e.stack || e); }
  painters = [];
  await wait(3500);                                    // a poll with none kept, so the page holds none when the lab is real again
  window.fetch = real;
  document.querySelectorAll("#toasts .toast").forEach((t) => t.remove());
  return o; })()`);
check("a painter kept on GPU 2 (the lab's activity): Unload lit and enabled, its tip says it, the Engine's card has a row for it",
  !un70.err && un70.seen && un70.lit && un70.on && /^Unload/.test(un70.tip || "") && un70.card, JSON.stringify({ err: un70.err, seen: un70.seen, lit: un70.lit, on: un70.on, tip: un70.tip, card: un70.card }));
check("  a click asks the lab to let it go (the engine too when it holds models), says it, and the tip forgets it",
  (un70.sent || []).includes("lab") && un70.said === 1 && un70.gone, JSON.stringify({ sent: un70.sent, said: un70.said, gone: un70.gone }));

// HERESY 1169 · 1372 (Viktor 11.10.2026: «Если стоит обложкой на треке то, что у Художника, при удалении изображения из галлереи спрашивать, или снимать, или оставить»)
section("a picture that is a take's cover, to the trash: asked whether its cover comes off the take too, is left, or nothing happens; a run's trash asks the same; no cover, no question");
const cv72 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), real = window.fetch, sent = [], $ = (id) => document.getElementById(id);
  const until = async (fn, ms) => { for (let i = 0; i < (ms || 3000) / 50; i++) { const v = fn(); if (v) return v; await wait(50); } return null; };
  const json = (b) => Promise.resolve(new Response(JSON.stringify(b), { status: 200, headers: { "Content-Type": "application/json" } }));
  const tabWas = document.body.dataset.tab || "create", keys = ["yue2.arLook", "yue2.arFilter"], was = keys.map((k) => localStorage.getItem(k));
  const now = Date.now() / 1000, R = "20261011-190500-cafe";
  const pic = (n) => ({ n, shape: "1:1", seed: 90 + n, w: 1280, h: 1280, kept: true, file: "0" + n + "-1x1-s" + (90 + n) + ".png", thumb: "thumbs/0" + n + "-1x1-s" + (90 + n) + ".jpg" });
  let runs = [{ id: R, prompt: "a lantern in the snow", shapes: ["1:1"], seed: 91, count: 2, painter: "krea2-q4", created: now - 60, status: "done", of: 2, took: 20, pictures: [pic(1), pic(2)] }];
  window.fetch = (u, o) => { u = String(u);
    if (u.startsWith("/lab/artist/runs")) return json({ runs });
    if (u.startsWith("/lab/artist/covers")) { const b = JSON.parse(o.body); sent.push(["covers", b]);
      const its = b.items || (b.id ? runs[0].pictures.map((p) => ({ id: b.id, file: p.file })) : []);
      return json({ covers: its.filter((x) => x.file === pic(1).file).map((x) => ({ id: x.id, file: x.file, takes: [{ name: "20261011-170000-01-song", title: "Lantern Song" }] })) }); }
    if (u.startsWith("/lab/artist/aside")) { const b = JSON.parse(o.body); sent.push(["aside", b]);
      return json({ aside: true, done: b.items, trashed: [], kept: [], covers_off: b.covers === "off" ? ["Lantern Song"] : [] }); }
    if (u.startsWith("/lab/artist/trash")) { const b = JSON.parse(o.body); sent.push(["trash", b]); return json({ trashed: b.id, covers_off: b.covers === "off" ? ["Lantern Song"] : [] }); }
    if (u.startsWith("/lab/artist/file")) return Promise.resolve(new Response(new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" })));
    return real(u, o); };
  const o = {};
  const box = () => document.querySelector(".hd-back.is-on:not(.is-leaving)");
  const answer = async (which) => { const b = await until(() => box() && box().querySelector(".hd-yes"), 3000); if (!b) return null;
    const said = { text: box().textContent, yes: box().querySelector(".hd-yes").textContent,
      alt: (box().querySelector(".hd-alt") || {}).textContent || "", no: (box().querySelector(".hd-no") || {}).textContent || "" };
    box().querySelector(which).click(); await wait(300); return said; };
  try {
    document.querySelector('.topbar [data-tab="artist"]').click();
    await until(() => !$("view-artist").classList.contains("is-hidden"), 4000); await wait(500);
    const lookWas = (document.querySelector("#arBar [data-look].is-on") || { dataset: { look: "runs" } }).dataset.look;
    document.querySelector('#arBar [data-look="gallery"]').click(); await wait(400);
    const thumb = (n) => [...document.querySelectorAll("#arRuns .ar-gpic")].find((f) => f.querySelector("img") && f.querySelector("img").src.indexOf("0" + n + "-1x1") >= 0);
    // a cover: asked; Leave it sends «keep»
    thumb(1).querySelector(".ar-thumb").click(); await wait(300);
    document.querySelector('#arStage [data-stage="aside"]').click();
    o.ask1 = await answer(".hd-alt"); await until(() => sent.some((x) => x[0] === "aside"), 2000);
    o.keep = (sent.filter((x) => x[0] === "aside")[0] || [])[1];
    // asked again: Take it off too sends «off», said
    document.querySelector('#arStage [data-stage="aside"]').click();
    o.ask2 = await answer(".hd-yes"); await until(() => sent.filter((x) => x[0] === "aside").length >= 2, 2000); await wait(300);
    o.off = (sent.filter((x) => x[0] === "aside")[1] || [])[1];
    o.said = [...document.querySelectorAll("#toasts .toast")].map((t) => t.textContent).filter((t) => /The cover taken off/.test(t)).length;
    // Cancel: nothing sent
    document.querySelector('#arStage [data-stage="aside"]').click();
    await answer(".hd-no"); await wait(200);
    o.cancelSent = sent.filter((x) => x[0] === "aside").length;
    // no cover: no question, sent at once
    thumb(2).querySelector(".ar-thumb").click(); await wait(300);
    document.querySelector('#arStage [data-stage="aside"]').click(); await wait(400);
    o.noAsk = !box() && sent.filter((x) => x[0] === "aside").length === 3 && (sent.filter((x) => x[0] === "aside")[2] || [])[1].covers === "keep";
    // the run's trash: the run's question with the cover's, «off» sent
    document.querySelector('#arBar [data-look="runs"]').click(); await wait(400);
    const tr = document.querySelector('#arRuns .ar-run[data-id="' + R + '"] [data-act="trash"]');
    if (tr) { tr.click(); o.runAsk = await answer(".hd-yes"); await until(() => sent.some((x) => x[0] === "trash"), 2000); o.runSent = (sent.filter((x) => x[0] === "trash")[0] || [])[1]; }
    else o.runAsk = "no trash button";
    const lb = document.querySelector('#arBar [data-look="' + lookWas + '"]'); if (lb) lb.click(); await wait(200);
  } catch (e) { o.err = String(e && e.stack || e); }
  window.fetch = real;
  keys.forEach((k, i) => { if (was[i] === null) localStorage.removeItem(k); else localStorage.setItem(k, was[i]); });
  document.querySelectorAll("#toasts .toast").forEach((t) => t.remove());
  document.querySelector('.topbar [data-tab="' + tabWas + '"]').click(); await wait(300);
  return o; })()`);
check("a cover to the trash: the question names its take, «Take it off too», «Leave it», «Cancel»; Leave it sends «keep», Take it off too «off» (said), Cancel nothing",
  !cv72.err && cv72.ask1 && /Lantern Song/.test(cv72.ask1.text) && cv72.ask1.yes === "Take it off too" && cv72.ask1.alt === "Leave it" && cv72.ask1.no === "Cancel" &&
  cv72.keep && cv72.keep.covers === "keep" && cv72.off && cv72.off.covers === "off" && cv72.said === 1 && cv72.cancelSent === 2,
  JSON.stringify({ err: cv72.err, ask1: cv72.ask1, keep: cv72.keep, off: cv72.off, said: cv72.said, cancelSent: cv72.cancelSent }));
check("  a picture no take has as its cover: no question; a run whose picture is a cover: its question asks about the cover too, «off» sent with it",
  cv72.noAsk && cv72.runAsk && /to the trash\\?/.test(cv72.runAsk.text) && /Lantern Song/.test(cv72.runAsk.text) && cv72.runSent && cv72.runSent.covers === "off",
  JSON.stringify({ noAsk: cv72.noAsk, runAsk: cv72.runAsk, runSent: cv72.runSent }));

// HERESY 1169 · 1374 (Viktor 11.10.2026: «когда я навожу мышку на волну трека в полноформатном трейлере, выводить спектральный граф
// полной длиной на весь трек, а тултип с отрезком текста выше… Максимум анализа по волне»)
section("the wave's scope: the whole take's spectrogram over the full player after a moment on the wave, the card above it, the moment under the pointer read; a quick click only goes there; Esc, the switch, the Artist");
await ev(`(() => { const a = document.getElementById("audio"); a.pause(); a.muted = true; document.querySelector('#tabs [data-tab="create"]').click();
  if (!document.getElementById("playbarTitle").textContent || document.getElementById("playbarTitle").textContent === "Nothing loaded") {
    const c = [...document.querySelectorAll("#libList .take[data-name]:not(.is-running-row)")].find((x) => !/nachtzug/.test(x.dataset.name)); if (c) c.click(); }
  return true; })()`);
await waitFor(`isFinite(document.getElementById("audio").duration) && document.getElementById("audio").duration > 2`, 6000, 100);
// a spectrum of its own for the take in the player (the lab's layout, HSP1): a tone at 1008 Hz in the first half, at 4008 Hz in the second
const sc74 = await ev(`(() => {
  const a = document.getElementById("audio"), d = a.duration, sr = 48000, hop = 2048, B = 1025, F = Math.floor(d * sr / hop) + 2;
  const hb = new TextEncoder().encode(JSON.stringify({ sr, frames: F, bins: B, hop, seconds: d, peak: 0.5, db0: -120, dbStep: 0.5, welchBins: 2049, welchN: 4096 }));
  const buf = new ArrayBuffer(8 + hb.length + F * B + 4 * 2049 + 24), dv = new DataView(buf);
  [72, 83, 80, 49].forEach((c, i) => dv.setUint8(i, c)); dv.setUint32(4, hb.length, true); new Uint8Array(buf, 8, hb.length).set(hb);
  const q = new Uint8Array(buf, 8 + hb.length, F * B); q.fill(40);
  for (let f = 0; f < F; f++) { const k = f < F / 2 ? 43 : 171; q[f * B + k] = 200; q[f * B + k - 1] = 180; q[f * B + k + 1] = 180; }
  for (let i = 0; i < 2049; i++) dv.setFloat32(8 + hb.length + F * B + 4 * i, -60, true);
  [-40, -30, -20, -25, -35, -50].forEach((v, i) => dv.setFloat32(8 + hb.length + F * B + 4 * 2049 + 4 * i, v, true));
  const url = a.getAttribute("src"), real = window.fetch, asked = [];
  window.HeresySpectrum.drop(url);
  window.__fetch74 = real;
  window.fetch = (u, o) => { if (String(u).startsWith("/lab/spectrum")) { asked.push(String(u)); return Promise.resolve(new Response(buf.slice(0), { status: 200, headers: { "Content-Length": String(buf.byteLength) } })); } return real(u, o); };
  window.__asked74 = asked;
  window.__was74 = ["yue2.waveScope", "yue2.waveScopeScale"].map((k) => localStorage.getItem(k));
  localStorage.removeItem("yue2.waveScope"); localStorage.removeItem("yue2.waveScopeScale");
  window.ruachWaveSections([{ t: 0, name: "Intro", lines: [], rows: [] },
    { t: d * 0.4, name: "Chorus", lines: ["Sing it loud", "Sing it again"], rows: [{ k: 0, start: d * 0.4, end: d * 0.55 }, { k: 1, start: d * 0.55, end: d * 0.7 }] }], true);
  const w = document.getElementById("wave"), r = w.getBoundingClientRect();
  return { d, url, x25: Math.round(r.left + r.width * 0.25), x50: Math.round(r.left + r.width * 0.5), x75: Math.round(r.left + r.width * 0.75), y: Math.round(r.top + r.height / 2),
    top: Math.round(r.top), left: r.left + w.clientLeft, width: w.clientWidth };
})()`);
const scopeNow = `(() => { const s = document.getElementById("waveScope"); if (!s || s.hidden) return { shown: false };
  const b = s.getBoundingClientRect(), bar = document.getElementById("playbar").getBoundingClientRect(), r = s.querySelector(".ws-read"), p = document.querySelector(".wave-pop");
  return { shown: true, left: b.left, width: b.width, top: b.top, bottom: b.bottom, h: b.height, bar: bar.top, ih: window.innerHeight,
    stats: s.querySelector(".ws-stats").textContent, say: s.querySelector(".ws-say").textContent, read: r && !r.hidden ? r.innerText.replace(/\\s+/g, " ") : "",
    card: p && !p.hidden ? { bottom: p.getBoundingClientRect().bottom, head: p.querySelector(".wave-pop-head").textContent, slice: !!p.querySelector(".wave-pop-spec") } : null,
    asked: window.__asked74.length }; })()`;
// on the wave a moment: the scope comes up
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: sc74.x25, y: sc74.y });
await sleep(120);
const sc74early = await ev(scopeNow);
await waitFor(`(() => { const s = document.getElementById("waveScope"); return !!s && !s.hidden && !!s.querySelector(".ws-stats").textContent; })()`, 4000, 50);
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: sc74.x25 + 1, y: sc74.y });
await sleep(150);
const sc74a = await ev(scopeNow);
check("a moment on the full player's wave brings the scope up (not at once): on the player's top edge, as wide as the wave's drawing, about a third of the window high, the take measured once (its lab spectrum)",
  !sc74early.shown && sc74a.shown && Math.abs(sc74a.bottom - sc74a.bar) <= 1 && Math.abs(sc74a.left - sc74.left) <= 1 && Math.abs(sc74a.width - sc74.width) <= 1 &&
  Math.abs(sc74a.h - Math.min(Math.max(220, sc74a.ih * 0.36), sc74a.bar - 12)) <= 1 && sc74a.asked === 1 && !sc74a.say && /peak −6\.0 dBFS/.test(sc74a.stats) && /RMS −18\.0 dBFS/.test(sc74a.stats),
  JSON.stringify({ early: sc74early.shown, sc74a, want: sc74 }));
check("  under the pointer on the wave: its time, the moment's RMS and centroid, its loudest frequency and note (the tone of the first half, 1008 Hz: B5)",
  /^\d+:\d\d\.\d/.test(sc74a.read) && /RMS −\d+\.\d dBFS/.test(sc74a.read) && /centroid /.test(sc74a.read) && /loudest 1\.01 kHz B5 \+35¢/.test(sc74a.read), sc74a.read);
// up into the picture, at the tone's height: the frequency there, its note, its level
const sc74y = await ev(`(() => { const s = document.getElementById("waveScope").getBoundingClientRect(), h = s.height, lane = Math.round(Math.min(90, Math.max(36, h * 0.16))), spec = h - lane;
  return Math.round(s.top + spec * (1 - Math.log(1007.8 / 20) / Math.log(24000 / 20))); })()`);
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: sc74.x25, y: sc74.top - 4 });
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: sc74.x25, y: sc74y });
await sleep(150);
const sc74b = await ev(scopeNow);
const here74 = (/here (\d+(?:\.\d+)?) (k?Hz) (\S+) [+−]?\d*¢? ?(−?\d+\.\d) dB/.exec(sc74b.read) || []);
const hz74 = here74[2] === "kHz" ? parseFloat(here74[1]) * 1000 : parseFloat(here74[1]);
check("  up into the picture (through the strip between): still up, the card over it; at the tone's height the frequency there within a pixel's step of 1008 Hz, its level near the tone's",
  sc74b.shown && hz74 > 960 && hz74 < 1060 && parseFloat(String(here74[4] || "-99").replace("−", "-")) > -36 && !!sc74b.card && sc74b.card.bottom <= sc74b.top + 1 && !sc74b.card.slice,
  JSON.stringify({ read: sc74b.read, here74, card: sc74b.card, top: sc74b.top }));
// the second half: the other tone; a click in the picture goes there as on the wave
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: sc74.x75, y: sc74y });
await sleep(120);
const sc74c = await ev(scopeNow);
await send("Input.dispatchMouseEvent", { type: "mousePressed", x: sc74.x75, y: sc74y, button: "left", clickCount: 1 });
await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: sc74.x75, y: sc74y, button: "left", clickCount: 1 });
await sleep(150);
const sc74t = await ev(`document.getElementById("audio").currentTime`);
check("  three quarters in: the second tone loudest (4008 Hz, B7); a click in the picture goes there as a click on the wave would",
  /loudest 4\.01 kHz B7/.test(sc74c.read) && Math.abs(sc74t - sc74.d * 0.75) < sc74.d * 0.02, JSON.stringify({ read: sc74c.read, t: sc74t, d: sc74.d }));
// the scale: linear, kept; back to log
const sc74s = await ev(`(async () => { const s = document.getElementById("waveScope"), wait = (ms) => new Promise((r) => setTimeout(r, ms));
  s.querySelector('[data-scale="lin"]').click(); await wait(150);
  const o = { kept: localStorage.getItem("yue2.waveScopeScale"), on: s.querySelector('[data-scale="lin"]').classList.contains("is-on"), shown: !s.hidden };
  s.querySelector('[data-scale="log"]').click(); await wait(100);
  o.back = localStorage.getItem("yue2.waveScopeScale"); return o; })()`);
// out: it goes, and the card with it
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 6, y: 6 });
await sleep(150);
const sc74d = await ev(scopeNow);
check("  Linear and Log in its head (kept in this browser); the pointer out of the wave and the scope: both the scope and the card go",
  sc74s.kept === "lin" && sc74s.on && sc74s.shown && sc74s.back === null && !sc74d.shown && !sc74d.card, JSON.stringify({ sc74s, out: sc74d }));
// a quick click on the wave only goes there; moving on brings the scope; Esc takes it down until the pointer leaves the wave
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: sc74.x50, y: sc74.y });
await send("Input.dispatchMouseEvent", { type: "mousePressed", x: sc74.x50, y: sc74.y, button: "left", clickCount: 1 });
await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: sc74.x50, y: sc74.y, button: "left", clickCount: 1 });
await sleep(450);
const sc74e = await ev(scopeNow);
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: sc74.x50 + 12, y: sc74.y });
await sleep(450);
const sc74f = await ev(scopeNow);
await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
await sleep(100);
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: sc74.x50 + 24, y: sc74.y });
await sleep(450);
const sc74g = await ev(scopeNow);
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 6, y: 6 });
await sleep(60);
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: sc74.x50, y: sc74.y });
await sleep(450);
const sc74h = await ev(scopeNow);
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 6, y: 6 });
await sleep(100);
check("  a click on the wave before the scope came only goes there (no scope); the pointer moving on brings it; Esc takes it down until the pointer leaves the wave; back on the wave, it comes again",
  !sc74e.shown && sc74f.shown && !sc74g.shown && sc74h.shown, JSON.stringify({ e: sc74e.shown, f: sc74f.shown, g: sc74g.shown, h: sc74h.shown }));
// the player's switch; the Artist (its player one row) never shows it
const sc74i = await ev(`(() => { const b = document.getElementById("waveScopeBtn"); b.click(); return { pressed: b.getAttribute("aria-pressed"), kept: localStorage.getItem("yue2.waveScope") }; })()`);
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: sc74.x50, y: sc74.y });
await sleep(450);
const sc74j = await ev(scopeNow);
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 6, y: 6 });
const sc74k = await ev(`(async () => { const b = document.getElementById("waveScopeBtn"); b.click(); const o = { pressed: b.getAttribute("aria-pressed"), kept: localStorage.getItem("yue2.waveScope") };
  document.querySelector('.topbar [data-tab="artist"]').click(); await new Promise((r) => setTimeout(r, 500));
  const r = document.getElementById("wave").getBoundingClientRect(); o.x = Math.round(r.left + r.width / 2); o.y = Math.round(r.top + r.height / 2); return o; })()`);
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: sc74k.x, y: sc74k.y });
await sleep(450);
const sc74l = await ev(scopeNow);
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 6, y: 6 });
await ev(`(async () => { document.querySelector('.topbar [data-tab="create"]').click(); await new Promise((r) => setTimeout(r, 300));
  window.fetch = window.__fetch74; window.HeresySpectrum.drop(${JSON.stringify(sc74.url)}); window.ruachWaveSections([], true);
  ["yue2.waveScope", "yue2.waveScopeScale"].forEach((k, i) => { const v = window.__was74[i]; if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); });
  const a = document.getElementById("audio"); a.pause(); a.currentTime = 0; return true; })()`);
check("  the player's switch turns it off (kept in this browser; the wave alone then) and on again; in the Artist, its player one row, the wave brings none",
  sc74i.pressed === "false" && sc74i.kept === "off" && !sc74j.shown && sc74k.pressed === "true" && sc74k.kept === null && !sc74l.shown, JSON.stringify({ sc74i, j: sc74j.shown, sc74k, l: sc74l.shown }));

// HERESY 1169 · 1375 (Viktor 11.10.2026: «Не сохраняется выбор моделей у Художника после F5. Ничего не сохранилось кроме PROMPT поля»)
section("the Artist's painter kept over a reload: a word typed before the lab's list of painters came leaves the painter kept alone; the list restores it; a pick by the user is kept; «From the take» and the takes' counts in Russian");
const ak75 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), real = window.fetch, A = window.HeresyArtist, $ = (id) => document.getElementById(id);
  const json = (b, s) => Promise.resolve(new Response(JSON.stringify(b), { status: s || 200, headers: { "Content-Type": "application/json" } }));
  const until = async (fn, ms) => { for (let i = 0; i < (ms || 3000) / 50; i++) { const v = fn(); if (v) return v; await wait(50); } return null; };
  const keys = ["yue2.arPainter", "yue2.arModel", "yue2.arPrompt"], was = keys.map((k) => localStorage.getItem(k)), tabWas = document.body.dataset.tab || "create";
  const painters = [{ key: "krea2-q4", label: "Krea 2 Muse · Q4", need_mb: 12500, family: "krea2", ready: true },
    { key: "krea2-q8", label: "Krea 2 Muse · Q8", need_mb: 18500, family: "krea2", ready: true },
    { key: "qwen2512-q6", label: "Qwen-Image 2512 · Q6", need_mb: 20000, family: "qwen-image-2512", ready: true, lightning: true }];
  window.fetch = (u, o) => { u = String(u);
    if (u.startsWith("/lab/artist/painters")) return json({ painters });
    if (u.startsWith("/lab/artist/loras")) return json({ root: "artwork/loras", families: { krea2: [], "qwen-image-2512": [], "qwen-image-2.1": [], sdxl: [] }, titles: {} });
    if (u.startsWith("/lab/artist/runs")) return json({ runs: [] });
    return real(u, o); };
  document.querySelector('.topbar [data-tab="artist"]').click();
  await until(() => !$("view-artist").classList.contains("is-hidden"), 4000); await wait(300);
  const o = {};
  // the page as a reload leaves it: the painter kept in the browser, the list not come yet (the choice holds Krea alone)
  localStorage.setItem("yue2.arPainter", "qwen2512-q6");
  A.forget();
  $("arPainter").innerHTML = '<option value="krea2-q4">Krea 2 Muse · Q4</option><option value="krea2-q8">Krea 2 Muse · Q8</option>';
  $("arPainter").value = "krea2-q4";
  $("arPrompt").value = "A lighthouse at dawn"; $("arPrompt").dispatchEvent(new Event("input"));
  o.typed = localStorage.getItem("yue2.arPainter");
  await A.painters(); await wait(150);
  o.restored = $("arPainter").value;
  $("arPainter").value = "krea2-q8"; $("arPainter").dispatchEvent(new Event("change")); await wait(100);
  o.picked = localStorage.getItem("yue2.arPainter");
  // Russian: the button and the takes' counts
  const L = window.RuachI18n, langWas = localStorage.getItem("yue2.lang");
  L.set("ru"); await wait(500);
  o.btn = $("arFromTake").textContent.trim();
  o.counts = [L.t("12 takes"), L.t("1 take"), L.t("From the take")];
  L.set(langWas || "en"); if (langWas === null) localStorage.removeItem("yue2.lang");
  await wait(300);
  window.fetch = real;
  keys.forEach((k, i) => { if (was[i] === null) localStorage.removeItem(k); else localStorage.setItem(k, was[i]); });
  await A.painters().catch(() => {}); 
  document.querySelector('.topbar [data-tab="' + tabWas + '"]').click(); await wait(300);
  return o; })()`);
check("a word typed in the prompt before the lab's list of painters came leaves the painter kept in the browser (Qwen Q6) alone; the list restores it; the user's own pick is kept",
  ak75.typed === "qwen2512-q6" && ak75.restored === "qwen2512-q6" && ak75.picked === "krea2-q8", JSON.stringify(ak75));
check("  in Russian «From the take» is «Из семпла» (it was «Семплов: From the»); 12 takes «12 семплов», 1 take «1 семпл»",
  ak75.btn === "Из семпла" && ak75.counts[0] === "12 семплов" && ak75.counts[1] === "1 семпл" && ak75.counts[2] === "Из семпла", JSON.stringify({ btn: ak75.btn, counts: ak75.counts }));

// HERESY 1169 · 1377 (Viktor 11.10.2026: «У нас уже миллион пространств в Студии. В контекстном меню нужна прокрутка»)
section("a menu of a hundred rows: no taller than the window, scrolled inside, its ticked row in sight; scrolling it closes its submenu, not the menu");
const mn77 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), M = window.HeresyMenu;
  const many = Array.from({ length: 100 }, (_, i) => ({ label: "Workspace " + i, checked: i === 70, action: () => {} }));
  M.open(200, 200, [{ label: "Workspaces", items: many }, { label: "Other", action: () => {} }]);
  await wait(100);
  const first = document.querySelector(".hm-menu .hm-item"); first.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })); await wait(400);
  const menus = [...document.querySelectorAll(".hm-menu")], sub = menus[1], o = { menus: menus.length };
  if (sub) {
    const b = sub.getBoundingClientRect(), tick = sub.querySelector('[aria-checked="true"]').getBoundingClientRect();
    o.fits = b.top >= 0 && b.bottom <= innerHeight; o.scrolls = sub.scrollHeight > sub.clientHeight; o.tickSeen = tick.top >= b.top && tick.bottom <= b.bottom;
    sub.scrollTop = sub.scrollHeight; await wait(150);
    o.subAfterScroll = document.querySelectorAll(".hm-menu").length;
  }
  M.close(); return o; })()`);
check("a submenu of a hundred workspaces stays inside the window and scrolls inside itself, its ticked one in sight; scrolling it keeps the menu open",
  mn77.menus === 2 && mn77.fits && mn77.scrolls && mn77.tickSeen && mn77.subAfterScroll === 2, JSON.stringify(mn77));

// HERESY 1169 · 1379 (Chinese back on 11.10.2026, and French, Portuguese, German and Japanese for 2.0.0)
section("the five new languages: offered in the menu, each with its own <html lang>, its rooms and the Artist's room by name; a choice of words translated, a name left alone");
const ln79 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), L = window.RuachI18n, o = {};
  o.langs = L.langs.map((l) => l.code).join(" ");
  const room = () => [...document.querySelectorAll(".topbar [data-tab]")].map((b) => b.textContent.trim()).join("|");
  for (const c of ["fr", "pt", "de", "ja", "zh"]) { L.set(c); await wait(250); o[c] = document.documentElement.lang + " " + room(); }
  L.set("fr"); await wait(200);
  const p = window.HeresyDialog.choose("Test 1379", [{ label: "Every week", value: "w", words: true }, { label: "Every week", value: "n" }], { cancel: "Ask me later" });
  await wait(300);
  const labels = [...document.querySelectorAll(".hd-back.is-on .hd-item-label")].map((e) => e.textContent);
  o.words = labels[0]; o.name = labels[1];
  const no = document.querySelector(".hd-back.is-on .hd-no"); if (no) no.click(); await p;
  L.set("en"); await wait(200);
  return o; })()`);
check("twelve languages, the new five last: fr pt de ja zh", ln79.langs === "en ru uk be el es it fr pt de ja zh", ln79.langs);
check("  each its <html lang> (pt-BR, zh-CN for numbers, plurals and the CJK font) and its rooms, the Artist's by its own name",
  ln79.fr === "fr Créateur|Écrivain|Affineur|Peintre|Bibliothécaire|Entraîneur" && ln79.pt === "pt-BR Criador|Escritor|Lapidador|Pintor|Bibliotecário|Treinador" &&
  ln79.de === "de Schöpfer|Schreiber|Veredler|Maler|Bibliothekar|Trainer" && ln79.ja === "ja クリエイター|ライター|仕上げ師|絵師|司書|トレーナー" &&
  ln79.zh === "zh-CN 创作室|写作室|精修室|画室|资料馆|训练室", JSON.stringify(ln79));
check("  a choice of words (the updates question's) in the page's language, a name left as it is (1379b)", ln79.words === "Chaque semaine" && ln79.name === "Every week",
  JSON.stringify({ words: ln79.words, name: ln79.name }));

// HERESY 1169 · 1380: the Artist's stage and its sampling line follow the page's language (found by the 1379 probe)
section("the Artist's stage and its steps line in the page's language after a change, and back to English whole");
const ar80 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), L = window.RuachI18n, o = {};
  document.querySelector('.topbar [data-tab="artist"]').click(); await wait(700);
  const read = () => (((document.getElementById("arStageIn") || document.getElementById("arStage") || {}).innerText || "") + " | " +
    ((document.getElementById("arSampSay") || {}).textContent || "")).replace(/\\s+/g, " ").trim();
  L.set("en"); await wait(300); o.en = read();
  L.set("fr"); await wait(300); o.fr = read();
  L.set("de"); await wait(300); o.de = read();
  L.set("en"); await wait(300); o.back = read();
  document.querySelector('.topbar [data-tab="create"]').click(); await wait(300);
  return o; })()`);
check("the stage and the steps line change with the language and come back to English whole", ar80.en.length > 3 && ar80.fr !== ar80.en && ar80.de !== ar80.fr &&
  ar80.de !== ar80.en && ar80.back === ar80.en, JSON.stringify(ar80).slice(0, 600));

// HERESY 1169 · 1381: the log's Artist view named by the room, as the bar's tab (the walker gave it the Trainer's performer, «Артист»)
section("the log's Artist view carries the room's name in the page's language, as the bar's tab");
const lv81 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), L = window.RuachI18n, o = {};
  const read = () => document.getElementById("tabArtist").textContent.trim() + " = " + document.getElementById("logViewArtist").textContent.trim();
  for (const l of ["ru", "be", "fr", "ja", "en"]) { L.set(l); await wait(300); o[l] = read(); }
  return o; })()`);
check("Художник, Мастак, Peintre, 絵師 and Artist on both", lv81.ru === "Художник = Художник" && lv81.be === "Мастак = Мастак" &&
  lv81.fr === "Peintre = Peintre" && lv81.ja === "絵師 = 絵師" && lv81.en === "Artist = Artist", JSON.stringify(lv81));

// HERESY 1169 · 1384: the Artist's second pass (Viktor's ComfyUI workflow: «1st Pass + 2x Upscale», then the second KSampler)
section("the second pass: on a painted picture (not an upscale, not Qwen-Image 2.1), ×1.5 and ×2 with how much it may change; the draw it asks; the run's line");
const sp84 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), real = window.fetch, sent = [];
  const until = async (fn, ms) => { for (let i = 0; i < (ms || 3000) / 50; i++) { const v = fn(); if (v) return v; await wait(50); } return null; };
  const json = (b, s) => Promise.resolve(new Response(JSON.stringify(b), { status: s || 200, headers: { "Content-Type": "application/json" } }));
  const now = Date.now() / 1000, ID = "20261012-010000-1384", UP = "20261012-010100-1384", Q21 = "20261012-010200-1384";
  const pic = (s) => ({ file: "01-16x9-s" + s + ".png", thumb: "thumbs/01-16x9-s" + s + ".jpg", shape: "16:9", w: 1920, h: 1080, seed: s, kept: true });
  const done = { id: ID, prompt: "A lighthouse at dusk", shapes: ["16:9"], seed: 841, count: 1, painter: "qwen2512-fp8", model: "BASE QW2512 fp8_e4m3fn.safetensors", created: now, status: "done", of: 1,
                 pictures: [pic(841)], sampling: { steps: 40, sampler: "res_2s", schedule: "beta", lightning: 0 }, loras: [{ id: "qwen/A.safetensors", weight: 0.4, mb: 300 }] };
  const up = { id: UP, kind: "upscale", prompt: "A lighthouse at dusk", shapes: ["16:9"], seed: 841, count: 1, painter: "upscale", created: now - 5, status: "done", of: 1, pictures: [pic(842)] };
  const q21 = { id: Q21, prompt: "A lighthouse at dusk", shapes: ["16:9"], seed: 843, count: 1, painter: "qwen21", created: now - 9, status: "done", of: 1, pictures: [pic(843)] };
  let runs = [done, up, q21];
  window.fetch = (u, o) => { u = String(u);
    const body = o && o.body ? JSON.parse(o.body) : null;
    if (u.startsWith("/lab/artist/runs")) return json({ runs });
    if (u.startsWith("/lab/artist/draw")) { sent.push(body); return json(Object.assign({}, body, { id: "20261012-010300-1384", status: "queued", of: 1, pictures: [], created: now, ref: "ref.png", ref_resample: "nearest" }), 202); }
    return real(u, o); };
  const saved = Object.keys(localStorage).filter((k) => k.startsWith("yue2.ar")).map((k) => [k, localStorage.getItem(k)]);
  const o = {};
  document.querySelector('.topbar [data-tab="artist"]').click();
  await until(() => !document.getElementById("view-artist").classList.contains("is-hidden"), 4000); await wait(300);
  const lookWas = (document.querySelector("#arBar [data-look].is-on") || { dataset: {} }).dataset.look || "runs";
  await window.HeresyArtist.reload(); await wait(100);
  document.querySelector('#arBar [data-look="runs"]').click(); await wait(100);
  const pick = async (id) => { document.querySelector('.ar-run[data-id="' + id + '"] .ar-thumb').click(); await wait(150); };
  await pick(UP); o.upHas = !!document.querySelector('#arStage [data-stage="second"]');
  await pick(Q21); o.q21Has = !!document.querySelector('#arStage [data-stage="second"]');
  await pick(ID); o.has = !!document.querySelector('#arStage [data-stage="second"]');
  document.querySelector('#arStage [data-stage="second"]').click(); await wait(120);
  o.row = [...document.querySelectorAll("#arStage [data-sp]")].map((b) => b.textContent + " " + b.dataset.tip);
  const r = document.getElementById("arSpStr");
  o.str0 = r && r.value;
  if (r) { r.value = "0.35"; r.dispatchEvent(new Event("input", { bubbles: true })); }
  o.out = (document.getElementById("arSpStrOut") || {}).textContent; o.kept = localStorage.getItem("yue2.arSpStr");
  document.querySelector('#arStage [data-sp="2"]').click();
  await until(() => sent.length, 3000);
  o.body = sent[0] || null;
  // the new run's line says it
  runs = [Object.assign({}, done, { id: "20261012-010400-1384", scale: 2, ref: "ref.png", strength: 0.35, pictures: [Object.assign(pic(841), { w: 3840, h: 2160 })] }), done, up, q21];
  await window.HeresyArtist.reload(); await wait(120);
  await pick("20261012-010400-1384");
  o.meta = (document.querySelector("#arStage .ar-stage-meta") || {}).textContent || "";
  window.fetch = real;
  saved.forEach((kv) => localStorage.setItem(kv[0], kv[1]));
  if (!saved.some((kv) => kv[0] === "yue2.arSpStr")) localStorage.removeItem("yue2.arSpStr");
  await window.HeresyArtist.reload(); await wait(60);
  const lk = document.querySelector('#arBar [data-look="' + lookWas + '"]'); if (lk) lk.click();
  document.querySelector('.topbar [data-tab="create"]').click(); await wait(200);
  return o; })()`);
check("Second pass… on a painted picture, none on an upscale or on Qwen-Image 2.1's", sp84.has === true && sp84.upHas === false && sp84.q21Has === false, JSON.stringify(sp84).slice(0, 300));
check("  its row: ×1.5 and ×2 with the sizes they make, how much it may change at 0.50 first, kept when moved", sp84.row.length === 2 && /1920×1080 → 2880×1620/.test(sp84.row[0]) &&
  /1920×1080 → 3840×2160/.test(sp84.row[1]) && sp84.str0 === "0.5" && sp84.out === "0.35" && sp84.kept === "0.35", JSON.stringify([sp84.row, sp84.str0, sp84.out, sp84.kept]));
const b84 = sp84.body || {};
check("  ×2 asks a draw of the run's own painter, fine-tune, adapters, prompt and seed, from that picture at 2 times, at the strength asked", b84.scale === 2 && b84.strength === 0.35 &&
  b84.painter === "qwen2512-fp8" && b84.model === "BASE QW2512 fp8_e4m3fn.safetensors" && b84.seed === 841 && JSON.stringify(b84.shapes) === '["16:9"]' && b84.count === 1 &&
  JSON.stringify(b84.ref) === '{"id":"20261012-010000-1384","file":"01-16x9-s841.png"}' && JSON.stringify(b84.loras) === '[{"id":"qwen/A.safetensors","weight":0.4}]' && b84.prompt === "A lighthouse at dusk",
  JSON.stringify(b84));
check("  the run's line says «second pass ×2»", /second pass ×2/.test(sp84.meta), sp84.meta.slice(0, 300));

// HERESY 1169 · 1385 (Viktor 12.10.2026: «InjectLatentNoise можно именно в reference изображения на силу перерисовки»)
section("the extra noise: 0.6 first in the second pass and as moved; under the reference 0 first, sent when moved; a run's line says it");
const xn85 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), real = window.fetch, sent = [];
  const until = async (fn, ms) => { for (let i = 0; i < (ms || 3000) / 50; i++) { const v = fn(); if (v) return v; await wait(50); } return null; };
  const json = (b, s) => Promise.resolve(new Response(JSON.stringify(b), { status: s || 200, headers: { "Content-Type": "application/json" } }));
  const now = Date.now() / 1000, ID = "20261012-120000-1385";
  const pic = { file: "01-1x1-s851.png", thumb: "thumbs/01-1x1-s851.jpg", shape: "1:1", w: 1280, h: 1280, seed: 851, kept: true };
  const done = { id: ID, prompt: "A lighthouse at dusk", shapes: ["1:1"], seed: 851, count: 1, painter: "krea2-q4", created: now, status: "done", of: 1, pictures: [pic] };
  let runs = [done];
  window.fetch = (u, o) => { u = String(u);
    const body = o && o.body ? JSON.parse(o.body) : null;
    if (u.startsWith("/lab/artist/runs")) return json({ runs });
    if (u.startsWith("/lab/artist/draw")) { sent.push(body); return json(Object.assign({}, body, { id: "20261012-12010" + sent.length + "-1385", status: "queued", of: 1, pictures: [], created: now }), 202); }
    return real(u, o); };
  const saved = Object.keys(localStorage).filter((k) => k.startsWith("yue2.ar")).map((k) => [k, localStorage.getItem(k)]);
  ["yue2.arSpNoise", "yue2.arRefNoise"].forEach((k) => localStorage.removeItem(k));
  const $ = (id) => document.getElementById(id), o = {};
  document.querySelector('.topbar [data-tab="artist"]').click();
  await until(() => !document.getElementById("view-artist").classList.contains("is-hidden"), 4000); await wait(300);
  const lookWas = (document.querySelector("#arBar [data-look].is-on") || { dataset: {} }).dataset.look || "runs";
  await window.HeresyArtist.reload(); await wait(100);
  document.querySelector('#arBar [data-look="runs"]').click(); await wait(100);
  document.querySelector('.ar-run[data-id="' + ID + '"] .ar-thumb').click(); await wait(150);
  if (!document.querySelector("#arStage .ar-sp-row")) document.querySelector('#arStage [data-stage="second"]').click(); await wait(120);
  o.sp0 = $("arSpNoise") && $("arSpNoise").value;
  document.querySelector('#arStage [data-sp="2"]').click(); await until(() => sent.length >= 1, 3000);
  o.b1 = sent[0] ? sent[0].inject : "none";
  await window.HeresyArtist.reload(); await wait(150);
  await until(() => document.querySelector('.ar-run[data-id="' + ID + '"] .ar-thumb'), 3000);
  document.querySelector('.ar-run[data-id="' + ID + '"] .ar-thumb').click(); await wait(150);
  if (!document.querySelector("#arStage .ar-sp-row")) document.querySelector('#arStage [data-stage="second"]').click(); await wait(120);
  $("arSpNoise").value = "0.3"; $("arSpNoise").dispatchEvent(new Event("input", { bubbles: true })); await wait(50);
  o.spOut = ($("arSpNoiseOut") || {}).textContent;
  document.querySelector('#arStage [data-sp="1.5"]').click(); await until(() => sent.length >= 2, 3000);
  o.b2 = sent[1] ? sent[1].inject : "none";
  await window.HeresyArtist.reload(); await wait(150);
  await until(() => document.querySelector('.ar-run[data-id="' + ID + '"] .ar-thumb'), 3000);
  document.querySelector('.ar-run[data-id="' + ID + '"] .ar-thumb').click(); await wait(150);
  // the reference in the form: 0 first and not sent; moved, sent
  document.querySelector('#arStage [data-stage="ref"]').click(); await wait(150);
  o.ref0 = $("arRefNoise").value + " " + $("arRefNoiseSay").textContent;
  $("arPrompt").value = "A lighthouse at dusk"; $("arPrompt").dispatchEvent(new Event("input", { bubbles: true })); await wait(80);
  $("arDraw").click(); await until(() => sent.length >= 3, 3000);
  o.b3 = sent[2] ? ("inject" in sent[2] ? sent[2].inject : "absent") + " " + JSON.stringify(sent[2].ref) : "none";
  $("arRefNoise").value = "0.45"; $("arRefNoise").dispatchEvent(new Event("input", { bubbles: true })); await wait(50);
  o.refSay = $("arRefNoiseSay").textContent; o.refKept = localStorage.getItem("yue2.arRefNoise");
  await wait(400); $("arDraw").click(); await until(() => sent.length >= 4, 3000);
  o.b4 = sent[3] ? sent[3].inject : "none";
  runs = [Object.assign({}, done, { id: "20261012-120500-1385", ref: "ref.png", strength: 0.5, inject: 0.45 }), done];
  await window.HeresyArtist.reload(); await wait(120);
  document.querySelector('.ar-run[data-id="20261012-120500-1385"] .ar-thumb').click(); await wait(150);
  o.meta = (document.querySelector("#arStage .ar-stage-meta") || {}).textContent || "";
  if ($("arRefX")) $("arRefX").click();
  window.fetch = real;
  ["yue2.arSpNoise", "yue2.arRefNoise"].forEach((k) => localStorage.removeItem(k));
  saved.forEach((kv) => localStorage.setItem(kv[0], kv[1]));
  await window.HeresyArtist.reload(); await wait(60);
  const lk = document.querySelector('#arBar [data-look="' + lookWas + '"]'); if (lk) lk.click();
  document.querySelector('.topbar [data-tab="create"]').click(); await wait(200);
  return o; })()`);
check("the second pass sends 0.6 of extra noise first, 0.3 when moved there", xn85.sp0 === "0.6" && xn85.b1 === 0.6 && xn85.spOut === "0.30" && xn85.b2 === 0.3, JSON.stringify(xn85).slice(0, 400));
check("  under the reference: 0 first and not sent; 0.45 when moved, kept and sent", xn85.ref0 === "0 0.00" && /^absent /.test(xn85.b3) && xn85.refSay === "0.45" && xn85.refKept === "0.45" && xn85.b4 === 0.45,
  JSON.stringify([xn85.ref0, xn85.b3, xn85.refSay, xn85.refKept, xn85.b4]));
check("  the run's line says its extra noise, 0.45", /0\.45/.test(xn85.meta.replace(/0\.50/, "")), xn85.meta.slice(0, 300));

// HERESY 1169 · 1387: regional prompts in the Artist's form
section("Regions: up to three, a place and words each, kept; sent with the draw (a region without words is not), not for Qwen-Image 2.1; Again sends the run's own; its line says how many");
const rg87 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), real = window.fetch, sent = [];
  const until = async (fn, ms) => { for (let i = 0; i < (ms || 3000) / 50; i++) { const v = fn(); if (v) return v; await wait(50); } return null; };
  const json = (b, s) => Promise.resolve(new Response(JSON.stringify(b), { status: s || 200, headers: { "Content-Type": "application/json" } }));
  const now = Date.now() / 1000, ID = "20261012-140000-1387";
  const REG = [{ prompt: "a red fox", box: [0, 0, 0.5, 1] }];
  const done = { id: ID, prompt: "Two animals in the snow", shapes: ["16:9"], seed: 871, count: 1, painter: "krea2-q4", created: now, status: "done", of: 1, regions: REG,
                 pictures: [{ file: "01-16x9-s871.png", thumb: "thumbs/01-16x9-s871.jpg", shape: "16:9", w: 1920, h: 1080, seed: 871, kept: true }] };
  let runs = [done];
  window.fetch = (u, o) => { u = String(u);
    const body = o && o.body ? JSON.parse(o.body) : null;
    if (u.startsWith("/lab/artist/runs")) return json({ runs });
    if (u.startsWith("/lab/artist/draw")) { sent.push(body); return json(Object.assign({}, body, { id: "20261012-14010" + sent.length + "-1387", status: "queued", of: 1, pictures: [], created: now }), 202); }
    return real(u, o); };
  const saved = Object.keys(localStorage).filter((k) => k.startsWith("yue2.ar")).map((k) => [k, localStorage.getItem(k)]);
  localStorage.removeItem("yue2.arRegions");
  const $ = (id) => document.getElementById(id), o = {};
  document.querySelector('.topbar [data-tab="artist"]').click();
  await until(() => !document.getElementById("view-artist").classList.contains("is-hidden"), 4000); await wait(300);
  await window.HeresyArtist.reload(); await wait(100);
  const painterWas = $("arPainter").value;
  $("arPainter").value = "krea2-q4"; $("arPainter").dispatchEvent(new Event("change", { bubbles: true })); await wait(100);
  $("arRegions").open = true;
  for (let i = 0; i < 4; i++) { $("arRegAdd").click(); await wait(40); }
  o.rows = document.querySelectorAll("#arRegList [data-ri]").length; o.addOff = $("arRegAdd").disabled;
  const rows = () => [...document.querySelectorAll("#arRegList [data-ri]")];
  const set = (el, v, ev) => { el.value = v; el.dispatchEvent(new Event(ev, { bubbles: true })); };
  set(rows()[0].querySelector("[data-rw]"), "a red fox", "input");
  set(rows()[1].querySelector("[data-rp]"), "tr", "change"); await wait(30);
  o.map = rows()[1].querySelector(".ar-reg-map i").getAttribute("style");
  set(rows()[1].querySelector("[data-rw]"), "a white owl", "input");
  rows()[2].querySelector("[data-rx]").click(); await wait(40);
  o.after = rows().length; o.say = $("arRegSay").textContent;
  o.kept = JSON.parse(localStorage.getItem("yue2.arRegions") || "[]");
  $("arPrompt").value = "Two animals in the snow"; $("arPrompt").dispatchEvent(new Event("input", { bubbles: true })); await wait(80);
  $("arDraw").click(); await until(() => sent.length >= 1, 3000);
  o.b1 = sent[0] ? sent[0].regions : "none";
  // Qwen-Image 2.1: the note, nothing sent
  let opt = [...$("arPainter").options].find((x) => x.value === "qwen21"), made = false;
  if (!opt) { opt = new Option("Qwen-Image 2.1", "qwen21"); $("arPainter").add(opt); made = true; }   // the mock's list has none
  if (opt) { opt.disabled = false; $("arPainter").value = "qwen21"; $("arPainter").dispatchEvent(new Event("change", { bubbles: true })); await wait(100);
    o.note = !$("arRegNote").hidden; await wait(500); $("arDraw").click(); await until(() => sent.length >= 2, 3000); o.b2 = sent[1] ? ("regions" in sent[1] ? "sent" : "absent") : "none"; }
  // Again: the run's own
  await window.HeresyArtist.reload(); await wait(120);
  document.querySelector('.ar-run[data-id="' + ID + '"] .ar-thumb').click(); await wait(150);
  o.meta = (document.querySelector("#arStage .ar-stage-meta") || {}).textContent || "";
  const ag = document.querySelector('.ar-run[data-id="' + ID + '"] [data-act="again"]');
  if (ag) { ag.click(); await until(() => sent.length >= 3, 3000); o.b3 = sent[sent.length - 1] ? sent[sent.length - 1].regions : "none"; }
  window.fetch = real;
  if (made) opt.remove();
  localStorage.removeItem("yue2.arRegions");
  saved.forEach((kv) => localStorage.setItem(kv[0], kv[1]));
  $("arPainter").value = painterWas; $("arPainter").dispatchEvent(new Event("change", { bubbles: true }));
  await window.HeresyArtist.reload(); await wait(60);
  document.querySelector('.topbar [data-tab="create"]').click(); await wait(200);
  return o; })()`);
check("three regions at most, the fourth not added; a place moves its map; one removed; the count said; kept", rg87.rows === 3 && rg87.addOff === true && /left:50%;top:0%;width:50%;height:50%/.test(rg87.map) &&
  rg87.after === 2 && rg87.say === "2" && rg87.kept.length === 2 && rg87.kept[1].place === "tr", JSON.stringify(rg87).slice(0, 400));
check("  the draw sends the two with words, their boxes from their places", JSON.stringify(rg87.b1) === '[{"prompt":"a red fox","box":[0,0,0.5,1]},{"prompt":"a white owl","box":[0.5,0,0.5,0.5]}]', JSON.stringify(rg87.b1));
check("  Qwen-Image 2.1: the note shown and no regions sent", rg87.note === true && rg87.b2 === "absent", JSON.stringify([rg87.note, rg87.b2]));
check("  the run's line says its regions; Again sends the run's own", /1/.test(rg87.meta) && JSON.stringify(rg87.b3) === '[{"prompt":"a red fox","box":[0,0,0.5,1]}]', JSON.stringify([rg87.meta.slice(0, 200), rg87.b3]));

// HERESY 1169 · 1388: a reference edited by words, or for its style alone (Qwen-Image 2.1)
section("Use it: to paint from (as before), to edit by words or for its style (Qwen-Image 2.1, off without it); the draw it asks; the run's line; Again");
const ra88 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), real = window.fetch, sent = [];
  const until = async (fn, ms) => { for (let i = 0; i < (ms || 3000) / 50; i++) { const v = fn(); if (v) return v; await wait(50); } return null; };
  const json = (b, s) => Promise.resolve(new Response(JSON.stringify(b), { status: s || 200, headers: { "Content-Type": "application/json" } }));
  const now = Date.now() / 1000, ID = "20261012-150000-1388", ST = "20261012-150100-1388";
  const pic = (f, s) => ({ file: f, thumb: "thumbs/" + f.replace(".png", ".jpg"), shape: "1:1", w: 1280, h: 1280, seed: s, kept: true });
  const done = { id: ID, prompt: "A lighthouse", shapes: ["1:1"], seed: 881, count: 1, painter: "krea2-q4", created: now, status: "done", of: 1, pictures: [pic("01-1x1-s881.png", 881)] };
  const styled = { id: ST, prompt: "A fox at night", shapes: ["1:1"], seed: 882, count: 1, painter: "qwen21", created: now, status: "done", of: 1, ref: "ref.png", ref_as: "style", strength: 0.6, pictures: [pic("01-1x1-s882.png", 882)] };
  let runs = [done, styled];
  window.fetch = (u, o) => { u = String(u);
    const body = o && o.body ? JSON.parse(o.body) : null;
    if (u.startsWith("/lab/artist/runs")) return json({ runs });
    if (u.startsWith("/lab/artist/draw")) { sent.push(body); return json(Object.assign({}, body, { id: "20261012-15020" + sent.length + "-1388", status: "queued", of: 1, pictures: [], created: now }), 202); }
    return real(u, o); };
  const saved = Object.keys(localStorage).filter((k) => k.startsWith("yue2.ar")).map((k) => [k, localStorage.getItem(k)]);
  ["yue2.arRefAs", "yue2.arRegions"].forEach((k) => localStorage.removeItem(k));
  const $ = (id) => document.getElementById(id), o = {};
  document.querySelector('.topbar [data-tab="artist"]').click();
  await until(() => !document.getElementById("view-artist").classList.contains("is-hidden"), 4000); await wait(300);
  await window.HeresyArtist.reload(); await wait(100);
  const painterWas = $("arPainter").value;
  $("arPainter").value = "krea2-q4"; $("arPainter").dispatchEvent(new Event("change", { bubbles: true })); await wait(100);
  let opt = [...$("arPainter").options].find((x) => x.value === "qwen21"), made = false, wasOff = opt ? opt.disabled : null;
  if (opt) opt.disabled = true;                          // without it first, whichever list the page has
  $("arPainter").dispatchEvent(new Event("change", { bubbles: true })); await wait(80);
  o.offWithout = [...$("arRefAs").options].filter((x) => x.value).map((x) => x.disabled).join();
  if (!opt) { opt = new Option("Qwen-Image 2.1", "qwen21"); $("arPainter").add(opt); made = true; }
  opt.disabled = false;
  $("arPainter").value = "qwen21"; $("arPainter").dispatchEvent(new Event("change", { bubbles: true })); await wait(80);
  $("arPainter").value = "krea2-q4"; $("arPainter").dispatchEvent(new Event("change", { bubbles: true })); await wait(80);
  o.onWith = [...$("arRefAs").options].filter((x) => x.value).map((x) => x.disabled).join();
  document.querySelector('#arBar [data-look="runs"]').click(); await wait(100);
  document.querySelector('.ar-run[data-id="' + ID + '"] .ar-thumb').click(); await wait(150);
  document.querySelector('#arStage [data-stage="ref"]').click(); await wait(150);
  $("arRefAs").value = "style"; $("arRefAs").dispatchEvent(new Event("change", { bubbles: true })); await wait(60);
  o.dim = $("arRef").classList.contains("is-q21"); o.kept = localStorage.getItem("yue2.arRefAs");
  $("arPrompt").value = "A fox at night"; $("arPrompt").dispatchEvent(new Event("input", { bubbles: true })); await wait(400);
  $("arDraw").click(); await until(() => sent.length >= 1, 3000);
  const b = sent[0] || {};
  o.b1 = { painter: b.painter, ref_as: b.ref_as, ref: b.ref, model: "model" in b, sampling: "sampling" in b, loras: "loras" in b, mask: "mask" in b };
  await window.HeresyArtist.reload(); await wait(120);
  document.querySelector('.ar-run[data-id="' + ST + '"] .ar-thumb').click(); await wait(150);
  o.meta = (document.querySelector("#arStage .ar-stage-meta") || {}).textContent || "";
  const ag = document.querySelector('.ar-run[data-id="' + ST + '"] [data-act="again"]');
  if (ag) { ag.click(); await until(() => sent.length >= 2, 3000); const c = sent[sent.length - 1] || {}; o.b2 = { painter: c.painter, ref_as: c.ref_as, ref: c.ref }; }
  if ($("arRefX")) $("arRefX").click();
  window.fetch = real;
  if (made) opt.remove(); else opt.disabled = wasOff;
  ["yue2.arRefAs", "yue2.arRegions"].forEach((k) => localStorage.removeItem(k));
  saved.forEach((kv) => localStorage.setItem(kv[0], kv[1]));
  $("arRefAs").value = ""; $("arRefAs").dispatchEvent(new Event("change", { bubbles: true }));
  $("arPainter").value = painterWas; $("arPainter").dispatchEvent(new Event("change", { bubbles: true }));
  await window.HeresyArtist.reload(); await wait(60);
  document.querySelector('.topbar [data-tab="create"]').click(); await wait(200);
  return o; })()`);
check("without Qwen-Image 2.1 its two uses are off, with it on", ra88.offWithout === "true,true" && ra88.onWith === "false,false", JSON.stringify(ra88).slice(0, 400));
check("  its style: the strength dimmed, kept; the draw goes to Qwen-Image 2.1 with the picture, without the form's model, sampling, adapters or mask",
  ra88.dim === true && ra88.kept === "style" && ra88.b1.painter === "qwen21" && ra88.b1.ref_as === "style" && JSON.stringify(ra88.b1.ref) === '{"id":"20261012-150000-1388","file":"01-1x1-s881.png"}' &&
  !ra88.b1.model && !ra88.b1.sampling && !ra88.b1.loras && !ra88.b1.mask, JSON.stringify(ra88.b1));
check("  the run's line says «in the picture's style»; Again asks the same", /in the picture's style/.test(ra88.meta) && ra88.b2 && ra88.b2.ref_as === "style" && ra88.b2.painter === "qwen21" &&
  JSON.stringify(ra88.b2.ref) === '{"id":"20261012-150100-1388","file":"ref.png"}', JSON.stringify([ra88.meta.slice(0, 200), ra88.b2]));

// HERESY 1169 · 1390: the Writer's Max tokens (32K), an empty answer and a failure said over the page, the answer brought to the top
section("the Writer: «Max tokens» at 32K; an empty answer and a failure said in the studio's dialog; an answer scrolled to the window's top");
await ev(`(() => { const u = document.getElementById("chatUrl"); u.value = location.origin + "/fakechat-loaded/v1"; u.dispatchEvent(new Event("change")); return true; })()`);
await waitFor(`document.getElementById("chatState").textContent === "ready"`, 5000);
const wr90 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), real = window.fetch, $ = (id) => document.getElementById(id), o = {};
  const until = async (fn, ms) => { for (let i = 0; i < (ms || 3000) / 50; i++) { const v = fn(); if (v) return v; await wait(50); } return null; };
  const W = window.HeresyWriter, was = W.openDoc; W.openDoc = () => null;
  const p = $("assistProvider"); p.value = "engine"; p.dispatchEvent(new Event("change"));
  o.label = $("assistMax").closest("label").querySelector(".label").textContent; o.dflt = $("assistMax").getAttribute("value");
  let mode = "empty";
  window.fetch = (u, opt) => { u = String(u);
    if (/fakechat-loaded\\/v1\\/chat\\/completions/.test(u) && mode === "empty")
      return Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content: "" }, finish_reason: "stop" }] }), { status: 200, headers: { "Content-Type": "application/json" } }));
    if (/fakechat-loaded\\/v1\\/chat\\/completions/.test(u) && mode === "fail")
      return Promise.resolve(new Response("upstream down", { status: 500 }));
    return real(u, opt); };
  const dialog = () => { const d = document.querySelector(".hd-back.is-on:not(.is-leaving)"); return d ? d.textContent : null; };
  const close = async () => { const b = document.querySelector(".hd-back.is-on .hd-yes"); if (b) b.click(); await wait(300); };
  $("assistBrief").value = "a road song"; $("assistBtn").click();
  o.empty = await until(dialog, 6000); await close();
  mode = "fail"; await until(() => !$("assistBtn").disabled, 6000);
  $("assistBtn").click();
  o.fail = await until(dialog, 9000); await close();
  mode = "real"; await until(() => !$("assistBtn").disabled, 6000);
  window.scrollTo(0, 0); document.querySelectorAll(".drawer, .view").forEach((x) => { x.scrollTop = 0; });
  $("assistBtn").click();
  await until(() => !$("assistDraft").classList.contains("is-hidden"), 8000); await wait(900);
  const r = $("assistDraft").getBoundingClientRect(); o.top = Math.round(r.top); o.dialogAfter = dialog();
  window.fetch = real; W.openDoc = was;
  return o; })()`);
check("«Max tokens» at 32 768 by default", wr90.label === "Max tokens" && wr90.dflt === "32768", JSON.stringify(wr90).slice(0, 300));
check("  an empty answer is said over the page", !!wr90.empty && /empty answer: nothing came back/.test(wr90.empty), String(wr90.empty).slice(0, 200));
check("  a failure is said over the page", !!wr90.fail && /The writer failed/.test(wr90.fail), String(wr90.fail).slice(0, 200));
check("  an answer that came is brought to the window's top, no dialog", wr90.top >= -10 && wr90.top <= 140 && !wr90.dialogAfter, JSON.stringify({ top: wr90.top, d: wr90.dialogAfter }));
await ev(`localStorage.removeItem("yue2.chatUrl"); true`);

// HERESY 1169 · 1394: the lettering, its words apart from the prompt; painted with the picture or on the reference; each picture read back
section("Lettering: kept as typed; with the picture (body.letters) or on the reference (Qwen-Image 2.1, no prompt needed); the read-back marks; Letter it; Clear");
const lt94 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), real = window.fetch, sent = [];
  const until = async (fn, ms) => { for (let i = 0; i < (ms || 3000) / 50; i++) { const v = fn(); if (v) return v; await wait(50); } return null; };
  const json = (b, s) => Promise.resolve(new Response(JSON.stringify(b), { status: s || 200, headers: { "Content-Type": "application/json" } }));
  const now = Date.now() / 1000, ID = "20261012-180000-1394", LT = "20261012-180100-1394";
  const pic = (f, s, n, l) => Object.assign({ n: n, file: f, thumb: "thumbs/" + f.replace(".png", ".jpg"), shape: "1:1", w: 1280, h: 1280, seed: s, kept: true }, l ? { letters: l } : {});
  const plain = { id: ID, prompt: "A lighthouse", shapes: ["1:1"], seed: 941, count: 1, painter: "qwen2512-q6", created: now, status: "done", of: 1, pictures: [pic("01-1x1-s941.png", 941, 1)] };
  const lettered = { id: LT, prompt: "A lighthouse", shapes: ["1:1"], seed: 950, count: 3, painter: "qwen2512-q6", created: now, status: "done", of: 3,
    letters: { title: "LANTERN SONG", sub: "RUACH STUDIO", where: "top", way: "paint" }, pictures: [
      pic("01-1x1-s950.png", 950, 1, { read: "LANTERN SONG\\nRUACH STUDIO", exact: true, near: 1, tries: 1 }),
      pic("02-1x1-s2951.png", 2951, 2, { read: "LANTERN SONG\\nRUOCH STUDIO", exact: false, near: 0.95, tries: 3 }),
      pic("03-1x1-s952.png", 952, 3, { unread: "the listener is not on this machine", tries: 1 })] };
  let runs = [plain, lettered];
  window.fetch = (u, o) => { u = String(u);
    const body = o && o.body ? JSON.parse(o.body) : null;
    if (u.startsWith("/lab/artist/runs")) return json({ runs });
    if (u.startsWith("/lab/artist/draw")) { sent.push(body); return json(Object.assign({}, body, { id: "20261012-18020" + sent.length + "-1394", status: "queued", of: 1, pictures: [], created: now }), 202); }
    return real(u, o); };
  const saved = Object.keys(localStorage).filter((k) => k.startsWith("yue2.ar")).map((k) => [k, localStorage.getItem(k)]);
  ["yue2.arLetters", "yue2.arRefAs", "yue2.arRegions"].forEach((k) => localStorage.removeItem(k));
  const $ = (id) => document.getElementById(id), o = {}, set = (id, v, ev) => { $(id).value = v; $(id).dispatchEvent(new Event(ev || "input", { bubbles: true })); };
  document.querySelector('.topbar [data-tab="artist"]').click();
  await until(() => !document.getElementById("view-artist").classList.contains("is-hidden"), 4000); await wait(300);
  await window.HeresyArtist.reload(); await wait(100);
  const painterWas = $("arPainter").value, made = [];
  ["qwen2512-q6", "qwen21"].forEach((v) => { let x = [...$("arPainter").options].find((y) => y.value === v);
    if (!x) { x = new Option(v, v); $("arPainter").add(x); made.push([x, null]); } else { made.push([x, x.disabled]); } x.disabled = false; });
  o.block = !!$("arLetters") && !!$("arLetTitle") && !!$("arLetWay");
  set("arPainter", "krea2-q4", "change"); await wait(60);
  set("arLetTitle", "LANTERN SONG"); set("arLetSub", "RUACH STUDIO"); await wait(80);
  o.say = $("arLetSay").textContent; o.kept = JSON.parse(localStorage.getItem("yue2.arLetters") || "{}");
  o.noteKrea = $("arLetNote").hidden;                   // HERESY 1396: Krea 2 letters with the picture too
  set("arLetWay", "letter", "change"); await wait(60);
  o.noteRef = !$("arLetNote").hidden && /As reference/.test($("arLetNote").textContent);
  set("arLetWay", "paint", "change"); await wait(60);
  set("arPainter", "qwen2512-q6", "change"); await wait(80);
  o.noteQwen = $("arLetNote").hidden;
  set("arPrompt", "A lighthouse at dusk"); await wait(300);
  $("arDraw").click(); await until(() => sent.length >= 1, 3000);
  const b1 = sent[0] || {};
  o.b1 = { painter: b1.painter, letters: b1.letters, prompt: b1.prompt };
  document.querySelector('#arBar [data-look="runs"]').click(); await wait(100);
  const marks = [...document.querySelectorAll('.ar-run[data-id="' + LT + '"] .ar-let')];
  o.marks = marks.map((m) => m.className.replace("ar-let ", "")).join();
  o.badTip = (marks[1] && marks[1].dataset.tip) || "";
  o.cap = [...document.querySelectorAll('.ar-run[data-id="' + LT + '"] .ar-cap')].map((c) => c.textContent).join("|");
  document.querySelector('.ar-run[data-id="' + ID + '"] .ar-thumb').click(); await wait(150);
  const lb = document.querySelector('#arStage [data-stage="letter"]');
  o.letterBtn = !!lb;
  if (lb) lb.click(); await wait(150);
  o.afterLetter = { way: $("arLetWay").value, open: $("arLetters").open, focus: document.activeElement === $("arLetTitle"), ref: !$("arRefOn").hidden };
  set("arPrompt", ""); await wait(300);
  o.drawOn = !$("arDraw").disabled;
  $("arDraw").click(); await until(() => sent.length >= 2, 3000);
  const b2 = sent[1] || {};
  o.b2 = { painter: b2.painter, ref_as: b2.ref_as, ref: b2.ref, way: b2.letters && b2.letters.way, prompt: b2.prompt, model: "model" in b2, loras: "loras" in b2 };
  $("arLetClear").click(); await wait(60);
  o.cleared = !$("arLetTitle").value && !$("arLetSub").value && localStorage.getItem("yue2.arLetters") === null && $("arLetWay").value === "paint";
  if ($("arRefX")) $("arRefX").click();
  window.fetch = real;
  made.forEach((m) => { if (m[1] === null) m[0].remove(); else m[0].disabled = m[1]; });
  ["yue2.arLetters", "yue2.arRefAs", "yue2.arRegions"].forEach((k) => localStorage.removeItem(k));
  saved.forEach((kv) => localStorage.setItem(kv[0], kv[1]));
  set("arPrompt", ""); set("arPainter", painterWas, "change");
  await window.HeresyArtist.reload(); await wait(60);
  document.querySelector('.topbar [data-tab="create"]').click(); await wait(200);
  return o; })()`);
check("the Lettering block: typed, kept in this browser, said in its summary; no note under Krea 2 or Qwen-Image (both letter), one for «on the reference» without a picture",
  lt94.block && lt94.say === "“LANTERN SONG”" && lt94.kept.title === "LANTERN SONG" && lt94.kept.sub === "RUACH STUDIO" && lt94.noteKrea && lt94.noteRef && lt94.noteQwen, JSON.stringify(lt94).slice(0, 500));
check("  painted with the picture: the draw carries its words apart from the prompt",
  lt94.b1.painter === "qwen2512-q6" && lt94.b1.prompt === "A lighthouse at dusk" && JSON.stringify(lt94.b1.letters) === '{"title":"LANTERN SONG","where":"top","way":"paint","sub":"RUACH STUDIO"}', JSON.stringify(lt94.b1));
check("  read back: spelled, misspelled (what it reads in its tip), unread; a round's seed keeps its variation's name",
  lt94.marks === "is-ok,is-bad,is-unread" && /RUOCH STUDIO/.test(lt94.badTip) && lt94.cap === "1:1 · v1|1:1 · v2|1:1 · v3", JSON.stringify([lt94.marks, lt94.badTip, lt94.cap]));
check("  Letter it: the picture the reference, the block open on «on the reference», the title in hand; Draw without a prompt goes to Qwen-Image 2.1 editing it",
  lt94.letterBtn && lt94.afterLetter.way === "letter" && lt94.afterLetter.open && lt94.afterLetter.focus && lt94.afterLetter.ref && lt94.drawOn &&
  lt94.b2.painter === "qwen21" && lt94.b2.ref_as === "edit" && lt94.b2.way === "letter" && lt94.b2.prompt === "" && !lt94.b2.model && !lt94.b2.loras &&
  JSON.stringify(lt94.b2.ref) === '{"id":"20261012-180000-1394","file":"01-1x1-s941.png"}', JSON.stringify([lt94.afterLetter, lt94.drawOn, lt94.b2]));
check("  Clear: the fields and their keeping gone", lt94.cleared === true, JSON.stringify(lt94.cleared));

// HERESY 1169 · 1399: the Creator's Lyrics guidance (1397) kept with the form; the take's medcard under its seeds
section("Lyrics guidance beside Guidance (CFG): empty as Guidance, a number kept in the draft; the take's medcard: Score Planner | Music Tokens | The run");
const md99 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), $ = (id) => document.getElementById(id), o = {};
  const until = async (fn, ms) => { for (let i = 0; i < (ms || 3000) / 50; i++) { const v = fn(); if (v) return v; await wait(50); } return null; };
  document.querySelector('.topbar [data-tab="create"]').click(); await wait(300);
  o.field = !!$("cfgLyrics") && $("cfgLyrics").closest(".field-row") === $("cfg").closest(".field-row");
  const was = $("cfgLyrics").value;
  $("cfgLyrics").value = "2.2"; $("cfgLyrics").dispatchEvent(new Event("input", { bubbles: true })); $("cfgLyrics").dispatchEvent(new Event("change", { bubbles: true }));
  await wait(1600);
  try { o.kept = JSON.parse(localStorage.getItem("yue2.draft") || "{}").cfg_lyrics; } catch (e) { o.kept = "?"; }
  $("cfgLyrics").value = ""; $("cfgLyrics").dispatchEvent(new Event("input", { bubbles: true })); $("cfgLyrics").dispatchEvent(new Event("change", { bubbles: true }));
  await wait(1600);
  try { o.empty = JSON.parse(localStorage.getItem("yue2.draft") || "{}").cfg_lyrics; } catch (e) { o.empty = "?"; }
  $("cfgLyrics").value = was;
  const t = document.querySelector("#libList .take"); if (t) t.click();
  await until(() => document.querySelector("#metaGrid .medcard"), 4000);
  const f = Object.fromEntries([...document.querySelectorAll("#metaGrid .medcard [data-field]")].map((d) => [d.dataset.field, d.dataset.value]));
  o.heads = [...document.querySelectorAll("#metaGrid .medcard h4")].map((e) => e.textContent).join();
  o.keys = ["Score tokens", "Score temperature", "Music tokens", "Music time", "Music guidance", "Lyrics guidance", "Music top-k", "Length cap", "Solver", "Run steps", "Whole run", "Score guard"].every((k) => k in f);
  o.lyrics = f["Lyrics guidance"]; o.whole = f["Whole run"];
  return o; })()`);
check("Lyrics guidance stands beside Guidance (CFG); a number goes into the draft, empty goes as none (as Guidance)",
  md99.field && md99.kept === 2.2 && md99.empty === -1, JSON.stringify(md99).slice(0, 400));
check("  the take's medcard under its seeds: Score Planner | Music Tokens | The run, each field its own key; Lyrics guidance «as Guidance» on a take without one",
  md99.heads === "Score Planner,Music Tokens,The run" && md99.keys && md99.lyrics === "as Guidance" && /( s|\u2014)$/.test(md99.whole || ""), JSON.stringify(md99).slice(0, 400));
// HERESY 1400: the lights beside the two guidances, his range by ear (the music 1.0–4.0, the lyrics 1.0–2.6), soft: no clamp at 4
const lt00 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), $ = (id) => document.getElementById(id), o = {};
  document.querySelector('.topbar [data-tab="create"]').click(); await wait(200);
  const was = [$("cfg").value, $("cfg").dataset.touched, $("cfgLyrics").value];
  const put = async (id, v) => { $(id).value = v; $(id).dispatchEvent(new Event("input", { bubbles: true })); $(id).dispatchEvent(new Event("change", { bubbles: true })); await wait(80); };
  const lights = () => [$("cfgLight").className.replace("cfg-light", "").trim(), $("cfgLyricsLight").className.replace("cfg-light", "").trim()].join("/");
  await put("cfgLyrics", ""); await put("cfg", "4"); o.m4 = lights(); o.follows = /follow Guidance/.test($("cfgLyricsLight").dataset.tip || "") || /Ведени/.test($("cfgLyricsLight").dataset.tip || "");
  await put("cfgLyrics", "2.2"); o.m4l22 = lights();
  await put("cfg", "4.3"); await put("cfgLyrics", "2.8"); o.amber = lights();
  await put("cfg", "5"); await put("cfgLyrics", "3.5"); o.red = lights(); o.kept5 = $("cfg").value;
  await put("cfg", "1.6"); await put("cfgLyrics", "1.6"); o.base = lights(); o.sepTip = /differ/.test($("cfgLyricsLight").dataset.tip || "");
  await put("cfgLyrics", "1.8"); o.near = lights();
  await put("cfgLyrics", "2.2"); o.apart = lights();
  $("cfg").value = was[0]; $("cfg").dataset.touched = was[1] || ""; await put("cfgLyrics", was[2]);
  return o; })()`);
check("the lights: 4.0 with the lyrics following it — green and red (it says to give them their own); 4.0 / 2.2 green; 4.3 / 2.8 amber; 5 / 3.5 red and 5 kept (no clamp); the two equal (1.6 / 1.6) red with why, 0.2 apart amber, 1.6 / 2.2 green",
  lt00.m4 === "is-green/is-red" && lt00.follows && lt00.m4l22 === "is-green/is-green" && lt00.amber === "is-amber/is-amber" && lt00.red === "is-red/is-red" && lt00.kept5 === "5" && lt00.base === "is-green/is-red" && lt00.sepTip && lt00.near === "is-green/is-amber" && lt00.apart === "is-green/is-green",
  JSON.stringify(lt00));
// HERESY 1401 (Viktor: «Наши встроенные три профиля могут выдать ошибку при загрузке. Перепроверь их все три»): each applied, no error
const pf01 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), $ = (id) => document.getElementById(id), out = [];
  document.querySelector('.topbar [data-tab="create"]').click(); await wait(200);
  const toasts = () => [...document.querySelectorAll("#toasts .toast")].map((t) => t.textContent);
  const before = { cfg: $("cfg").value, touched: $("cfg").dataset.touched, lyr: $("cfgLyrics").value, len: $("maxLength").value };
  for (const v of ["b2", "b1", "b0"]) {                 // the engine's own defaults (b0) last: the checks after this one find the form as they knew it
    $("setupLib").value = v; $("setupLib").dispatchEvent(new Event("change", { bubbles: true })); await wait(60);
    $("setupApply").click(); await wait(250);
    const said = toasts().slice(-1).join(" | ");           // the newest (a full stack drops its oldest, so its length need not grow)
    out.push({ v, name: $("setupLib").selectedOptions[0].textContent, cfg: $("cfg").value, lyr: $("cfgLyrics").value, len: $("maxLength").value,
      ok: /applied/.test(said) && !/Not applied/.test(said) && said.indexOf($("setupLib").selectedOptions[0].textContent.replace(" \u270e", "")) >= 0, light: $("cfgLyricsLight").className.replace("cfg-light", "").trim() });
  }
  $("cfg").value = before.cfg; $("cfg").dataset.touched = before.touched || ""; $("cfgLyrics").value = before.lyr; $("maxLength").value = before.len;
  $("cfg").dispatchEvent(new Event("input", { bubbles: true }));
  return out; })()`);
check("the three built-in profiles apply without an error, each at 1.6 / 2.2 (the lights green); his «Musical Heresy of Creator's Ear» the third, 10 minutes long",
  pf01.length === 3 && pf01.every((p) => p.ok && parseFloat(p.cfg) === 1.6 && parseFloat(p.lyr) === 2.2 && p.light === "is-green") &&
  /Musical Heresy of Creator's Ear/.test(pf01[0].name) && parseFloat(pf01[0].len) >= 600, JSON.stringify(pf01));
// HERESY 1402 (Viktor: «Перенеси кнопку Reset sampling на новую строку с выключкой вправо. Она вылазит за границу»)
const rs02 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), b = document.getElementById("resetSampling"), c = document.getElementById("cfg");
  document.querySelector('.topbar [data-tab="create"]').click(); await wait(150);
  const d = b.closest("details"); const was = d ? d.open : null; if (d) d.open = true; await wait(120);
  const row = b.closest(".field-row"), rr = row.getBoundingClientRect(), br = b.getBoundingClientRect(), cr = c.getBoundingClientRect(), lr = document.getElementById("cfgLyrics").getBoundingClientRect();
  const o = { own: row !== c.closest(".field-row") && row.classList.contains("reset-row"), below: br.top >= cr.bottom - 1, inside: br.right <= rr.right + 1 && br.width > 0,
    right: Math.round(rr.right - br.right), lyricsInside: lr.right <= c.closest(".field-row").getBoundingClientRect().right + 1 };
  if (d) d.open = was;
  return o; })()`);
check("Reset sampling on a row of its own under the two guidances, to the right, inside its row; Lyrics guidance inside its row",
  rs02.own && rs02.below && rs02.inside && rs02.right <= 2 && rs02.lyricsInside, JSON.stringify(rs02));

// HERESY 1169 · 1406 (Viktor 12.10.2026: «Корзину треша Арта перерисуй в тайлы, но аудио корзину оставь списком как есть»): the art's trash as tiles
section("the art's trash as tiles: the picture square on top, the box on its corner, a click on a tile ticks it (a frozen one stays); the takes' trash stays a list");
const at06 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), real = window.fetch, $ = (id) => document.getElementById(id), o = {};
  const until = async (fn, ms) => { for (let i = 0; i < (ms || 3000) / 50; i++) { const v = fn(); if (v) return v; await wait(50); } return null; };
  const json = (b, s) => Promise.resolve(new Response(JSON.stringify(b), { status: s || 200, headers: { "Content-Type": "application/json" } }));
  const now = Date.now() / 1000, R = "20261012-110000-1406", P = "20261012-120000-1406";
  const bin = { runs: [{ id: R, prompt: "A trashed run whose prompt is long enough to run over three lines of a tile, and on, and on, and on, as prompts do", painter: "krea2-q4", created: now - 7200, trashed_at: now - 3600,
      pictures: [{ file: "01-1x1-s1.png", thumb: "thumbs/01-1x1-s1.jpg", kept: true, shape: "1:1", seed: 1 }], bytes: 2000000 }],
    pictures: [{ id: P, file: "02-1x1-s2.png", thumb: "thumbs/02-1x1-s2.jpg", shape: "1:1", seed: 2, prompt: "Put aside", created: now - 600, bytes: 1000000 }],
    covers: [{ take: "t1406a", title: "Song One", stamp: "20261012-100000", when: now - 86400, bytes: 200000, prompt: "an old cover", frozen: false },
             { take: "t1406b", title: "Frozen Song", stamp: "20261011-090000", when: now - 172800, bytes: 100000, prompt: "", frozen: true }],
    loras: [{ stamp: "20261012-130000", id: "krea2/kul.safetensors", name: "kul", title: "Kul Style", at: now - 60, bytes: 300000 }], bytes: 3600000 };
  window.fetch = (u, o2) => { u = String(u);
    if (u.startsWith("/lab/artist/bin") && !(o2 && o2.method === "POST")) return json(bin);
    return real(u, o2); };
  document.querySelector('.topbar [data-tab="collection"]').click(); await wait(300);
  document.querySelector('#collSide [data-place="__trash_art"]').click(); await until(() => document.querySelector("#collGrid .coll-binart"), 3000); await wait(150);
  const g = $("collGrid"), cards = [...g.querySelectorAll(".coll-binart")];
  o.grid = g.className; o.n = cards.length; o.oldClass = g.querySelectorAll(".coll-card.coll-art").length;
  o.widths = cards.map((c) => Math.round(c.getBoundingClientRect().width));
  o.rows = new Set(cards.map((c) => Math.round(c.getBoundingClientRect().top))).size;
  o.square = cards.every((c) => { const p = c.querySelector(".coll-art-pic").getBoundingClientRect(); return p.width > 100 && Math.abs(p.width - p.height) <= 1; });
  o.boxOnPic = cards.every((c) => { const b = c.querySelector(".coll-check").getBoundingClientRect(), p = c.querySelector(".coll-art-pic").getBoundingClientRect(); return b.top >= p.top && b.left >= p.left && b.bottom <= p.top + 40; });
  const t0 = cards[0].querySelector(".coll-title"); o.clamped = t0.scrollHeight > t0.clientHeight + 2 && t0.getBoundingClientRect().height < 60;
  o.meta = cards.map((c) => c.dataset.akind + ":" + c.querySelector(".coll-meta").textContent.split(" · ")[0]);
  cards[1].querySelector(".coll-art-pic").click(); await wait(80);
  o.picked = [...g.querySelectorAll("input[data-asel]:checked")].map((b) => b.dataset.asel);
  o.restoreOn = !$("collRestore").disabled;
  g.querySelector(".coll-binart .coll-title").click(); await wait(80);
  o.picked2 = [...g.querySelectorAll("input[data-asel]:checked")].map((b) => b.dataset.asel).length;
  const fz = g.querySelector(".coll-binart.is-frozen"); if (fz) fz.querySelector(".coll-body").click(); await wait(80);
  o.frozenStays = !!fz && !fz.querySelector("input[data-asel]").checked;
  g.querySelector(".coll-binart .coll-art-pic").click(); await wait(50); g.querySelectorAll(".coll-binart")[1].querySelector(".coll-art-pic").click(); await wait(50);
  o.unticked = g.querySelectorAll("input[data-asel]:checked").length;
  document.querySelector('#collSide [data-place="__trash"]').click(); await wait(400);
  o.audioList = $("collGrid").className;
  window.fetch = real;
  document.querySelector('#collSide [data-place=""]').click(); await wait(200);
  document.querySelector('.topbar [data-tab="create"]').click(); await wait(300);
  return o; })()`);
check("Trash (Art) is tiles: five cards of their own class (not the cover thumb's), each wider than 150 px, two or more a row, the picture square with the box on its corner",
  /\bartbin\b/.test(at06.grid || "") && !/\blist\b/.test(at06.grid || "") && at06.n === 5 && at06.oldClass === 0 && at06.widths.every((w) => w > 150) && at06.rows < 5 && at06.square && at06.boxOnPic,
  JSON.stringify(at06));
check("  the prompt held to three lines; what each is under it (run, picture, cover, cover, adapter)",
  at06.clamped && at06.meta.join("|") === "run:The Artist's run|picture:A picture put aside|cover:A cover taken off its take|cover:A cover taken off its take|lora:An adapter of the LoRA library", JSON.stringify(at06.meta));
check("  a click on a tile ticks it (Give back lights), another click on a ticked one unticks it, a frozen one stays unticked; the takes' trash stays a list",
  JSON.stringify(at06.picked) === '["pic:' + "20261012-120000-1406" + '|02-1x1-s2.png"]' && at06.restoreOn && at06.picked2 === 2 && at06.frozenStays && at06.unticked === 0 && /\blist\b/.test(at06.audioList || ""),
  JSON.stringify({ picked: at06.picked, restoreOn: at06.restoreOn, picked2: at06.picked2, frozenStays: at06.frozenStays, unticked: at06.unticked, audioList: at06.audioList }));

// HERESY 1169 · 1409 (Viktor 13.10.2026: «Нужно дописать ПОДОЖДИ! ИДЁТ ПРИВЯЗКА ЛИРИКИ К ВОЛНЕ...»): Whisper binding the lyrics, said on the wave and in the card
section("while Whisper binds the lyrics to the take in the player: «wait» in the wave's corner and in the section card of the score's marks; back as it was after");
await ev(`(() => { const a = document.getElementById("audio"); a.pause(); a.muted = true; document.querySelector('#tabs [data-tab="create"]').click();
  if (!document.getElementById("playbarTitle").textContent || document.getElementById("playbarTitle").textContent === "Nothing loaded") {
    const c = [...document.querySelectorAll("#libList .take[data-name]:not(.is-running-row)")].find((x) => !/nachtzug/.test(x.dataset.name)); if (c) c.click(); }
  return true; })()`);
await waitFor(`isFinite(document.getElementById("audio").duration) && document.getElementById("audio").duration > 0.2`, 6000, 100);
const bd09 = await ev(`(() => {
  const a = document.getElementById("audio"), w = document.getElementById("wave"), d = a.duration;
  window.ruachWaveSections([{ t: 0, name: "Intro", lines: [], rows: [] }, { t: d * 0.4, name: "Chorus", lines: [], rows: [] }], true);
  const corner = () => { const c = w.getContext("2d"), x = Math.max(0, w.width - 160); return Array.from(c.getImageData(x, 3, 150, 14).data).join(","); };
  const o = { off0: corner() };
  o.on = window.ruachBinding(true, "score"); o.onPix = corner();
  const r = w.getBoundingClientRect();
  o.x = Math.round(r.left + r.width * 0.5); o.y = Math.round(r.top + r.height / 2); o.top = Math.round(r.top);
  return o; })()`);
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: bd09.x, y: bd09.y });
await sleep(150);
const bd09b = await ev(`(() => { const p = document.querySelector(".wave-pop"); const h = p && p.querySelector(".wave-pop-hint"); return { shown: !!p && !p.hidden, hint: h ? h.textContent : "" }; })()`);
const bd09c = await ev(`(() => { const off = window.ruachBinding(false); const w = document.getElementById("wave"), c = w.getContext("2d"), x = Math.max(0, w.width - 160);
  return { off, offPix: Array.from(c.getImageData(x, 3, 150, 14).data).join(",") }; })()`);
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: bd09.x + 1, y: bd09.y });
await sleep(150);
const bd09d = await ev(`(() => { const p = document.querySelector(".wave-pop"); const h = p && p.querySelector(".wave-pop-hint"); const o = { hint: h ? h.textContent : "" };
  window.ruachWaveSections([], true); return o; })()`);
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: bd09.x, y: bd09.top - 120 });
await sleep(100);
check("Whisper binding the take: the wave's corner changes (the «wait» drawn there), the section card of a score's mark says the words are on their way",
  bd09.on === true && bd09.onPix !== bd09.off0 && bd09b.shown && /^Wait: Whisper is binding the lyrics to the wave/.test(bd09b.hint), JSON.stringify({ on: bd09.on, changed: bd09.onPix !== bd09.off0, pop: bd09b }));
check("  bound (or failed): the corner as it was, the card's hint the score's own again",
  bd09c.off === false && bd09c.offPix === bd09.off0 && /^A mark of the score/.test(bd09d.hint), JSON.stringify({ off: bd09c.off, same: bd09c.offPix === bd09.off0, hint: bd09d.hint }));

// HERESY 1169 · 1410 (Viktor 13.10.2026: «вместо макс шагов иметь макс эпох»): the Trainer asks for epochs, the steps are the set's tracks times them
section("the Trainer asks for epochs: the kind's own (Voice 30), the steps beside the field from the set picked, the run sent with epochs × tracks");
const ep10 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), real = window.fetch, sent = [];
  const until = async (fn, ms) => { for (let i = 0; i < (ms || 3000) / 50; i++) { const v = fn(); if (v) return v; await wait(50); } return null; };
  const json = (b) => Promise.resolve(new Response(JSON.stringify(b), { headers: { "Content-Type": "application/json" } }));
  const was = Object.keys(localStorage).filter((k) => /^yue2\\.tr/.test(k)).map((k) => [k, localStorage.getItem(k)]);
  window.fetch = (u, o) => { u = String(u);
    if (u.startsWith("/lab/train/run") && o && o.method === "POST") { sent.push(JSON.parse(o.body)); return json({ ok: true }); }
    if (u.startsWith("/lab/train/datasets")) return json({ raw: [], prepared: [{ name: "zz-set-1410", tracks: 518, seconds: 24000, from: "zz-raw-1410", made: "2026-10-13" }],
      runs: [], gpus: [{ index: 1, name: "RTX 3090", total_mb: 24576, free_mb: 24000 }], own: {}, aitk_ready: false });
    if (u.startsWith("/lab/train/trash")) return json({ trash: [] });
    if (u.startsWith("/lab/gpus")) return json({ roles: { studio: 0, train: [1], jobs: [1] } });
    return real(u, o); };
  document.querySelector('.topbar [data-tab="train"]').click(); window.HeresyTrain.reload();
  const radio = await until(() => document.querySelector('#trSets input[name="trSet"][value="zz-set-1410"]'), 5000);
  if (radio) { radio.checked = true; radio.dispatchEvent(new Event("change", { bubbles: true })); }
  await wait(100);
  const voice = document.querySelector('#trKinds [data-kind="voice"]'); if (voice) voice.click();
  await wait(100);
  const o = { steps: !!document.getElementById("tr_steps"), epochs: document.getElementById("tr_epochs").value, say30: document.getElementById("trStepsSay").textContent };
  const ep = document.getElementById("tr_epochs"); ep.value = "2"; ep.dispatchEvent(new Event("input", { bubbles: true })); await wait(50);
  o.say2 = document.getElementById("trStepsSay").textContent;
  document.getElementById("trRunName").value = "zz-run-1410";
  document.getElementById("trRun").click();
  const yes = await until(() => document.querySelector(".hd-back.is-on:not(.is-leaving) .hd-yes"), 3000);
  o.ask = yes ? yes.closest(".hd-back").textContent : "";
  if (yes) yes.click();
  await until(() => sent.length, 3000);
  o.sent = sent[0] ? { steps: sent[0].steps, name: sent[0].name } : null;
  await wait(300);
  window.fetch = real;
  Object.keys(localStorage).filter((k) => /^yue2\\.tr/.test(k)).forEach((k) => localStorage.removeItem(k));
  was.forEach(([k, v]) => localStorage.setItem(k, v));
  window.HeresyTrain.reload();
  document.querySelector('.topbar [data-tab="create"]').click();
  await wait(300);
  return o; })()`);
check("Epochs, not Steps: Voice's 30; beside it the steps from the set (518 tracks: 15540), 2 epochs 1036; the run asked with its epochs and sent with 1036 steps",
  !ep10.steps && ep10.epochs === "30" && /15540 steps/.test(ep10.say30) && /1036 steps/.test(ep10.say2) && /1036 steps \(2 epochs of 518 tracks\)/.test(ep10.ask) &&
  !!ep10.sent && ep10.sent.steps === 1036 && ep10.sent.name === "zz-run-1410", JSON.stringify(ep10));

// HERESY 1169 · 1411 (Viktor 13.10.2026: «сделай его изящным… чтобы заголовки полей не схлопывались в две строки. Подсказки в тултипы»)
section("the Trainer's knobs: every label on one line, the inline hints gone into the tooltips, the units inside their fields, the guide's links a «?»");
const kn11 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  document.querySelector('.topbar [data-tab="train"]').click(); await wait(300);
  const pane = document.querySelector('.tr-pane[data-pane="train"]'), was = pane.hidden, wasCls = pane.className;
  pane.hidden = false; pane.classList.add("is-open"); pane.style.display = "block"; await wait(100);
  const labels = [...document.querySelectorAll("#trKnobs .field > .label")];
  const o = { n: labels.length, tall: labels.filter((l) => l.getBoundingClientRect().height > 22).map((l) => l.textContent),
    ems: document.querySelectorAll("#trKnobs .field > .label em").length,
    q: ["trRankHow", "trArHow"].map((id) => { const b = document.getElementById(id); return b ? b.textContent + "|" + (b.dataset.tip || "") : ""; }),
    unitIn: !!document.querySelector("#trKnobs .tr-unit-in #trStepsSay") && !!document.querySelector('#trKnobs .tr-unit-in input#tr_save_epochs'),
    rows: new Set([...document.querySelectorAll("#trKnobs > *")].map((e) => Math.round(e.getBoundingClientRect().bottom))).size,
    order: [...document.querySelectorAll("#trKnobs input, #trKnobs select")].map((e) => e.id).slice(0, 5).join() };
  pane.style.display = ""; pane.className = wasCls; pane.hidden = was;
  document.querySelector('.topbar [data-tab="create"]').click(); await wait(200);
  return o; })()`);
check("every knob's label on one line, no hint written in a label, the guide's two links a «?» with their tips, Epochs' steps and Save every's unit inside their fields, the run's row first",
  kn11.n >= 11 && !kn11.tall.length && kn11.ems === 0 && kn11.q[0].startsWith("?|Which rank") && kn11.q[1].startsWith("?|The music half") && kn11.unitIn &&
  kn11.rows <= 4 && kn11.order === "trRunName,tr_engine,tr_quant,tr_cot,tr_epochs", JSON.stringify(kn11));

// HERESY 1169 · 1412 (Viktor 13.10.2026): the two guidances a row each, their fields at the right edge; the take's card: Shape a band, its scales in one row
section("the guidances a row each under the samplers, their fields at the right edge; the take's card: Song | Sound, then Shape a band, each scale's name over its dots");
const cf12 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), $ = (id) => document.getElementById(id);
  document.querySelector('.topbar [data-tab="create"]').click(); await wait(150);
  const d = $("cfg").closest("details"), was = d ? d.open : null; if (d) d.open = true; await wait(120);
  const c = $("cfg").getBoundingClientRect(), l = $("cfgLyrics").getBoundingClientRect(), row = $("cfg").closest(".field-row").getBoundingClientRect();
  const grid = document.querySelector(".sampler-grid").getBoundingClientRect(), cl = $("cfgLight").getBoundingClientRect(), ll = $("cfgLyricsLight").getBoundingClientRect();
  const o = { two: l.top >= c.bottom - 1, right: Math.round(Math.abs(c.right - l.right)), edge: Math.round(row.right - l.right), gap: Math.round(c.top - grid.bottom),
    lights: cl.right <= c.left + 1 && ll.right <= l.left + 1 };
  if (d) d.open = was;
  const t = document.querySelector("#libList .take[data-name]"); if (t) t.click();
  for (let i = 0; i < 40 && !document.querySelector('#metaGrid .shape-band [data-field="Composition"] .dots'); i++) await wait(100);
  const band = document.querySelector("#metaGrid .meta-row.shape-band"), pair = document.querySelector("#metaGrid .meta-row.pair");
  const f = band ? [...band.querySelectorAll(".shape-trio > div")] : [];
  o.band = !!band && f.length === 3; o.pair = !!pair && pair.querySelectorAll(":scope > .meta-col").length === 2;
  o.oneRow = f.length === 3 && new Set(f.map((x) => Math.round(x.getBoundingClientRect().top))).size === 1;
  o.over = f.every((x) => { const dt = x.querySelector("dt").getBoundingClientRect(), dd = x.querySelector("dd").getBoundingClientRect(); return dd.top >= dt.bottom - 1; });
  o.oneLine = f.every((x) => x.querySelector("dd").getBoundingClientRect().height < 24);
  o.cardW = band ? Math.round(band.getBoundingClientRect().width) : 0;
  await wait(300);                                   // the take loaded into the player: a moment before the return (suite-promise-collected)
  return o; })()`);
check("Guidance and Lyrics guidance a row each, a little below the samplers, their fields at the right edge, each light before its field",
  cf12.two && cf12.right <= 1 && cf12.edge <= 2 && cf12.gap >= 8 && cf12.lights, JSON.stringify(cf12));
check("  the take's card: Song | Sound side by side, Shape a band of its own, its three scales in one row, each name over its dots, each on one line",
  cf12.pair && cf12.band && (cf12.oneRow || cf12.cardW < 430) && cf12.over && cf12.oneLine, JSON.stringify(cf12));

// HERESY 1169 · 1414 (Viktor 13.10.2026: «Межтактная склейка - это правильный ход… Внедряй в полноформатный плеер»): Replace a section
section("Replace a section: the cuts in rests heard by ear, the section's own lines found in the lyrics and replaced, the syllables weighed; from the wave's menu, its dialog, the lab asked; a take made so marked on the wave");
const rs14 = await ev(`(() => {
  const row = (k, start, end, guessed) => ({ k, start, end, guessed: !!guessed });
  const list = [{ t: 0, name: "Intro", lines: [], rows: [] },
    { t: 10, name: "Verse 1", lines: ["One line here", "Two line here"], rows: [row(0, 10, 13), row(1, 13.5, 16)] },
    { t: 17, name: "Chorus", lines: ["Sing it loud", "Sing it again"], rows: [row(0, 20, 22), row(1, 22.5, 25)] },
    { t: 26, name: "Verse 2", lines: ["Three line", "Four line"], rows: [row(0, 31, 33), row(1, 33, 36, true)] },
    { t: 37, name: "Chorus", lines: ["Sing it loud", "Sing it again"], rows: [row(0, 40, 42), row(1, 42.5, 45)] },
    { t: 46, name: "Outro", lines: ["Last line"], rows: [row(0, 50, 53)] }];
  const o = { c1: window.ruachSectionCut(list, 2), c2: window.ruachSectionCut(list, 3), c3: window.ruachSectionCut(list, 4) };
  const lyrics = "[Verse 1]\\nOne line here\\nTwo line here\\n\\n[Chorus]\\n(softly)\\nSing it loud\\nSing it again\\n\\n[Verse 2]\\nThree line\\nFour line\\n\\n[Chorus]\\nSing it loud\\nSing it again\\n";
  o.block = (window.ruachLyricBlock(lyrics, "Chorus", ["Sing it loud", "Sing it again"], 1) || {}).text;
  o.rep = window.ruachReplaceBlock(lyrics, "Chorus", ["Sing it loud", "Sing it again"], 1, "Sing it louder\\nSing it once more");
  o.syl = [window.ruachSyllables("[Chorus]\\n(softly)\\nОх, налетели ветры злые"), window.ruachSyllables("Sing it loud")];
  return o; })()`);
check("the cuts: halfway in the rest before the section's first line (0.3 s before it with nothing heard before), up to two seconds after its last (no further than halfway on); none where its edge was only guessed",
  rs14.c1 && rs14.c1.a === 18 && rs14.c1.b === 27 && rs14.c2 === null && rs14.c3 && rs14.c3.a === 38 && rs14.c3.b === 47, JSON.stringify(rs14));
check("  the second Chorus's own lines found (directions kept with them), replaced in place; the first untouched; syllables counted on the sung words only",
  rs14.block === "Sing it loud\nSing it again" && rs14.rep === "[Verse 1]\nOne line here\nTwo line here\n\n[Chorus]\n(softly)\nSing it loud\nSing it again\n\n[Verse 2]\nThree line\nFour line\n\n[Chorus]\nSing it louder\nSing it once more\n" &&
  rs14.syl[0] === 9 && rs14.syl[1] === 4, JSON.stringify({ block: rs14.block, rep: rs14.rep, syl: rs14.syl }));
await ev(`(() => { const a = document.getElementById("audio"); a.pause(); a.muted = true; document.querySelector('#tabs [data-tab="create"]').click();
  if (!document.getElementById("playbarTitle").textContent || document.getElementById("playbarTitle").textContent === "Nothing loaded") {
    const c = [...document.querySelectorAll("#libList .take[data-name]:not(.is-running-row)")].find((x) => !/nachtzug/.test(x.dataset.name)); if (c) c.click(); }
  return true; })()`);
await waitFor(`isFinite(document.getElementById("audio").duration) && document.getElementById("audio").duration > 0.2`, 6000, 100);
const ui14 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), real = window.fetch, sent = [];
  const until = async (fn, ms) => { for (let i = 0; i < (ms || 3000) / 50; i++) { const v = fn(); if (v) return v; await wait(50); } return null; };
  window.fetch = (u, o) => { u = String(u);
    if (u.startsWith("/lab/section") && o && o.method === "POST") { sent.push(JSON.parse(o.body)); return Promise.resolve(new Response(JSON.stringify({ id: "x", versions: 2 }), { status: 202, headers: { "Content-Type": "application/json" } })); }
    return real(u, o); };
  const a = document.getElementById("audio"), w = document.getElementById("wave"), d = a.duration;
  const tk = window.ruachPlayerTake(), was = tk ? tk.lyrics : "";
  if (tk) tk.lyrics = "[Intro]\\n[Chorus]\\n(softly)\\nSing it loud\\nSing it again\\n\\n[Outro]\\n";
  const lines = ["Sing it loud", "Sing it again"];
  window.ruachWaveSections([{ t: 0, name: "Intro", lines: [], rows: [] },
    { t: d * 0.3, name: "Chorus", lines, rows: [{ k: 0, start: d * 0.35, end: d * 0.45, guessed: false }, { k: 1, start: d * 0.46, end: d * 0.55, guessed: false }] },
    { t: d * 0.7, name: "Outro", lines: [], rows: [] }], true);
  window.ruachBinding(false, "ear");
  const o = {};
  const r = w.getBoundingClientRect(), x = r.left + r.width * 0.42, y = r.top + r.height / 2;
  w.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: x, clientY: y }));
  const item = await until(() => [...document.querySelectorAll(".hm-menu [role=menuitem], .hm-menu button, .hm-menu .hm-item")].find((b) => /Replace this section/.test(b.textContent)), 2000);
  o.item = !!item;
  o.lyricsHave = !!tk;
  if (item) item.click();
  const box = await until(() => document.querySelector(".hd-section .hd-text"), 2000);
  o.dialog = !!box; o.text = box ? box.value : "";
  if (box) { box.value = box.value + " and again and again"; box.dispatchEvent(new Event("input", { bubbles: true })); await wait(50);
    o.warn = !document.querySelector(".hd-section .hd-warn").hidden; o.warnN = document.querySelector(".hd-section .hd-warn-n").textContent;
    document.querySelector(".hd-section .hd-yes").click(); }
  await until(() => sent.length, 2000);
  o.sent = sent[0] ? { name: !!sent[0].name, a: sent[0].a, b: sent[0].b, versions: sent[0].versions, section: sent[0].section, has: /and again and again/.test(sent[0].lyrics || "") } : null;
  o.d = Math.round(d * 100) / 100;
  window.fetch = real;
  const corner = () => { const c = w.getContext("2d"), x0 = Math.round(w.width * 0.35) + 3; return Array.from(c.getImageData(x0, 4, 20, 10).data).join(","); };
  window.ruachReplacedMark(null); const before = corner();
  window.ruachReplacedMark({ a: d * 0.3, b: d * 0.6, section: "Chorus" }); const after = corner();
  o.mark = before !== after;
  window.ruachReplacedMark(null);
  window.ruachWaveSections([], true);
  if (tk) tk.lyrics = was;
  await wait(300);
  return o; })()`);
const lyricsOk = true;
check("from the wave's own menu over a section heard by ear: «Replace this section…» opens its words; more syllables said aloud; the lab asked with the cuts, two versions, the section, the lyrics changed in place",
  ui14.item && ui14.dialog && ui14.warn && /^\+\d+$/.test(ui14.warnN) && !!ui14.sent && ui14.sent.name && ui14.sent.versions === 2 && ui14.sent.section === "Chorus" &&
  Math.abs(ui14.sent.a - Math.max(0, ui14.d * 0.35 - 0.3)) < 0.02 && Math.abs(ui14.sent.b - Math.min(ui14.d * 0.55 + 2, ui14.d)) < 0.02 && ui14.sent.has, JSON.stringify(ui14));
check("  a take made so: its stretch tinted on the wave («anew»)", ui14.mark, JSON.stringify({ mark: ui14.mark }));

// HERESY 1169 · 1415 (Viktor 13.10.2026: «опцию сравнения одноимённых треков? Выбор до четырёх»): a take's namesakes, two to four, in one player
section("namesakes: a title's base past its versions and suffixes; the take's menu «Compare with its namesakes…» (ticked two to four), the Librarian's Compare for two to four checked; the compare player from the same second");
const cm15 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms) => { for (let i = 0; i < (ms || 3000) / 50; i++) { const v = fn(); if (v) return v; await wait(50); } return null; };
  const b = window.HeresyCompare.base, o = {};
  o.base = [b("01. МАНИФЕСТ_ Крик. v4.1.0 · sound 2"), b("01. МАНИФЕСТ_ Крик. v4.0.10 (edit)"), b("Я - буратино не воцерковленный - v9.3.6.4 · sound 4"),
            b("Dual CFG · music 1.6 · lyrics 2.2 · seed 1399"), b("Sunrise take 2"), b("Sunrise #3"), b("Sunrise")];
  const real = window.fetch, json = (b) => Promise.resolve(new Response(JSON.stringify(b), { headers: { "Content-Type": "application/json" } }));
  const lib = [...document.querySelectorAll("#libList .take[data-name]:not(.is-running-row)")].map((x) => x.dataset.name).filter((n, i, a) => n && a.indexOf(n) === i).slice(0, 5);
  const row = (n) => ({ name: n, title: "take " + n.slice(-6), created: Math.floor(Date.now() / 1000) - 600, seconds: 60, favorite: false, kind: "generated", cot: "off",
    derived: [], hidden: false, workspaces: [], rating: 0, note: "", seeds: null, fresh: false, regen_of: "", frozen: false, protected: false });
  window.fetch = (u, opt) => { u = String(u); if (u.startsWith("/lab/catalog")) return json({ takes: lib.map(row), workspaces: [], trash_days: 0, locks: {}, pins: {}, frozen: [] }); return real(u, opt); };
  o.lib = lib.length;
  document.querySelector('.topbar [data-tab="collection"]').click(); window.HeresyCollection.reload(); await wait(400);
  document.querySelector('#collSide [data-place=""]').click();
  await until(() => document.querySelectorAll("#collGrid .coll-card[data-name]").length >= Math.min(5, lib.length), 3000);
  const names = [...document.querySelectorAll("#collGrid .coll-card[data-name]")].slice(0, 5).map((c) => c.dataset.name);
  const tick = async (n) => { const c = document.querySelector('#collGrid .coll-card[data-name="' + CSS.escape(n) + '"] input[data-sel]'); if (c) c.click(); await wait(80); };   // the grid paints anew on each tick
  const btn = document.getElementById("collCompare");
  o.n = names.length;
  await tick(names[0]); o.one = btn.disabled;
  await tick(names[1]); o.two = btn.disabled;
  for (const n of names.slice(2)) await tick(n);
  o.five = names.length >= 5 ? btn.disabled : true;               // five checked: off (when the library has five)
  if (names.length >= 5) await tick(names[4]);
  btn.click();
  const box = await until(() => document.querySelector(".cmp-back .cmp-box"), 3000);
  o.rows = box ? box.querySelectorAll(".cmp-row").length : 0;
  o.title = box ? box.querySelector(".cmp-title").textContent : "";
  if (box) box.querySelector('[data-cmp="close"]').click();
  await wait(150);
  document.getElementById("collSelNone").click(); await wait(80);
  window.fetch = real; window.HeresyCollection.reload();
  document.querySelector('.topbar [data-tab="create"]').click(); await wait(300);
  return o; })()`);
check("a title's base: past « · …», (edit), a version, «take 2», «#3»; the namesakes of «01. МАНИФЕСТ_ Крик» are one, Dual CFG's all one",
  JSON.stringify(cm15.base) === JSON.stringify(["01. манифест_ крик", "01. манифест_ крик", "я - буратино не воцерковленный", "dual cfg", "sunrise", "sunrise", "sunrise"]), JSON.stringify(cm15.base));
check("  the Librarian's Compare: off for one or five checked, on for two to four; it opens the one player with the checked takes",
  cm15.n >= 2 && cm15.one && !cm15.two && cm15.five && cm15.rows === Math.min(4, cm15.n) && /^Compare · /.test(cm15.title), JSON.stringify(cm15));

// HERESY 1169 · 1416 (Viktor 13.10.2026: «Мой Буратино реп без Q ожил»; «запихнуть его прямо в строку заголовка между STYLE и иконками выбора пола… Если есть BPM в стиле, честное предупреждение»)
section("Free tempo: in the Style's head between its name and the voice's toggles; sent as free_tempo with a score, not in Direct; on by itself when the Style comes to ask for rubato without a BPM, not again once turned off; the honest word with a BPM; kept in the draft");
const ft16 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), $ = (id) => document.getElementById(id);
  document.querySelector('.topbar [data-tab="create"]').click(); await wait(150);
  const st = $("style"), was = st.value, b = $("freeTempo"), o = {};
  const label = st.closest(".field").querySelector(".label"), sex = $("voice-male");
  o.place = !!b && b.parentElement === label && !!(b.compareDocumentPosition(sex) & Node.DOCUMENT_POSITION_FOLLOWING);
  window.ruachFreeTempo(false);
  const type = async (v) => { st.value = v; st.dispatchEvent(new Event("input", { bubbles: true })); await wait(60); };
  await type("russian rap, male vocal, 92 bpm"); o.bpmOff = window.ruachFreeTempo();
  await type("russian rap, male vocal, rubato, non-linear"); o.auto = window.ruachFreeTempo();
  window.ruachFreeTempo(false); await type("russian rap, male vocal, rubato, non-linear, dark"); o.stays = window.ruachFreeTempo();
  window.ruachFreeTempo(true); await type("russian rap, rubato, 92 bpm"); o.warn = !$("styleTempoWarn").hidden;
  await type("russian rap, rubato"); o.warnGone = $("styleTempoWarn").hidden;
  const full = document.querySelector('input[name="cot"][value="full"]'), direct = document.querySelector('input[name="cot"][value="off"]'), cotWas = document.querySelector('input[name="cot"]:checked');
  full.click(); await wait(30);
  try { o.sentFull = !!window.ruachBuildRequest && window.ruachBuildRequest().free_tempo === true; } catch (e) { o.sentFull = "err " + e.message; }
  direct.click(); await wait(30);
  try { o.sentDirect = !!window.ruachBuildRequest && window.ruachBuildRequest().free_tempo === undefined; } catch (e) { o.sentDirect = "err " + e.message; }
  if (cotWas) cotWas.click();
  await wait(700);
  try { o.draft = JSON.parse(localStorage.getItem("yue2.draft") || "{}").free_tempo; } catch (e) { o.draft = "?"; }
  window.ruachFreeTempo(false); await type(was);
  return o; })()`);
check("Free tempo between Style and the voice's toggles; a BPM in the Style keeps it off; «rubato, non-linear» turns it on, once (turned off, it stays off); a BPM while on says the honest word, gone with the BPM",
  ft16.place && ft16.bpmOff === false && ft16.auto === true && ft16.stays === false && ft16.warn && ft16.warnGone, JSON.stringify(ft16));
check("  sent as free_tempo with a score (Full), never in Direct; kept in the draft",
  ft16.sentFull === true && ft16.sentDirect === true && ft16.draft === true, JSON.stringify({ sentFull: ft16.sentFull, sentDirect: ft16.sentDirect, draft: ft16.draft }));
const sc16 = await ev(`(() => {
  const A = window.HeresyAbc, base = "X:1\\nT:\\nM:4/4\\nL:1/32\\nQ:1/4=78\\nV: Vocal clef=treble name=\\"Vocal Melody\\" snm=\\"Vocal\\"\\nV: Ins clef=treble name=\\"Ins Melody\\" snm=\\"Inst.\\"\\nK:Dm\\n% verse\\nV: Vocal\\nA8A8A8A8|A8A8A8A8|\\nV: Ins\\nz32|z32|\\n";
  const o = {};
  for (const [tag, text] of [["with", base], ["empty", base.replace("Q:1/4=78", "Q:")], ["none", base.replace("Q:1/4=78\\n", "")]]) {
    try { const s = A.parse(text), r = A.report(s); o[tag] = { bpm: s.bpm, free: !!s.free, rfree: !!r.free, bars: r.bars }; } catch (e) { o[tag] = "err " + e.message; }
  }
  return o; })()`);
check("  a score without its tempo (an empty Q: or none) reads as native, free, at the nominal 120; with its Q: as before",
  sc16.with && sc16.with.bpm === 78 && !sc16.with.free && sc16.empty && sc16.empty.free && sc16.empty.bpm === 120 && sc16.none && sc16.none.free && sc16.none.rfree && sc16.none.bars === 2, JSON.stringify(sc16));

// HERESY 1169 · 1419 (Viktor 13.10.2026): Free tempo as the lyrics' toggles; every corner from the Engine's profile; the guidances as roads; the take's tools in one row
section("Free tempo dressed as Line numbers and Spelling; the corners follow Engine's three profiles; the two guidances as roads beside the samplers' fields; a take's hover tools never overlap");
const ft19 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), $ = (id) => document.getElementById(id);
  document.querySelector('.topbar [data-tab="create"]').click(); await wait(150);
  const b = $("freeTempo"), t = document.querySelector('.lyr-meter .lyr-tog[data-lyr="nums"]') || document.querySelector(".lyr-meter .lyr-tog");
  if (!b || !t) return { missing: !b ? "freeTempo" : "lyr-tog" };
  const cb = getComputedStyle(b), ct = getComputedStyle(t);
  const o = { cls: b.classList.contains("lyr-tog") && !b.classList.contains("btn"), h: [Math.round(b.getBoundingClientRect().height), Math.round(t.getBoundingClientRect().height)],
    fs: [cb.fontSize, ct.fontSize], rad: [cb.borderTopLeftRadius, ct.borderTopLeftRadius], tt: cb.textTransform, pad: [cb.paddingLeft, ct.paddingLeft] };
  const was = b.getAttribute("aria-pressed") === "true";
  if (!was) { b.click(); await wait(80); }
  const lit = getComputedStyle(b).borderTopColor, on = document.querySelector('.lyr-tog[aria-pressed="true"]:not(#freeTempo)');
  o.lit = [lit, on ? getComputedStyle(on).borderTopColor : null];
  if (!was) { b.click(); await wait(80); }
  o.back = (b.getAttribute("aria-pressed") === "true") === was;
  return o; })()`);
check("Free tempo is a lyrics' toggle: their frame, size, corners and padding, amber when pressed like them; no capitals",
  ft19.cls && Math.abs(ft19.h[0] - ft19.h[1]) <= 1 && ft19.fs[0] === ft19.fs[1] && ft19.rad[0] === ft19.rad[1] && ft19.pad[0] === ft19.pad[1] && ft19.tt === "none" &&
  ft19.lit[1] && ft19.lit[0] === ft19.lit[1] && ft19.back, JSON.stringify(ft19));
const cr19 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), $ = (id) => document.getElementById(id), root = document.documentElement, was = root.dataset.corners;
  const rad = (el) => el ? getComputedStyle(el).borderTopLeftRadius : null;
  const probe = () => ({ ft: rad($("freeTempo")), pill: rad(document.querySelector(".status-pill")), icon: rad(document.querySelector(".btn.icon-only, .frame-tools .icon-btn, .lib-fold")),
    tag: rad(document.querySelector(".tag")) });
  root.dataset.corners = "square"; await wait(40); const sq = probe();
  delete root.dataset.corners; await wait(40); const rd = probe();
  root.dataset.corners = "soft"; await wait(40); const so = probe();
  if (was) root.dataset.corners = was; else delete root.dataset.corners;
  const left = [];
  for (const sh of document.styleSheets) {
    if (!/app\\.css/.test(sh.href || "")) continue;
    const walk = (rs) => { for (const r of rs) { if (r.cssRules) walk(r.cssRules); const v = r.style ? r.style.getPropertyValue("border-radius") : "";
      if (!v || /var\\(/.test(v) || /knob-lock/.test(r.selectorText || "")) continue;
      if (v.split(/\\s+/).every((p) => ["0", "0px", "1px", "50%", "inherit"].includes(p))) continue;
      left.push((r.selectorText || "?").slice(0, 60) + ": " + v); } };
    walk(sh.cssRules);
  }
  return { sq, rd, so, left }; })()`);
check("  every corner from the profile: square 2px / round 7px / soft 5px on the toggle, pills 2 / 20 / 7, icon frames 1 / 3 / 2 (soft keeps the 07.10 2px); no corner in pixels left in app.css (but circles, hairlines, the tiny lock)",
  cr19.sq.ft === "2px" && cr19.rd.ft === "7px" && cr19.so.ft === "5px" && cr19.sq.pill === "2px" && cr19.rd.pill === "20px" && cr19.so.pill === "7px" &&
  (!cr19.rd.icon || (cr19.sq.icon === "1px" && cr19.rd.icon === "3px" && cr19.so.icon === "2px")) && cr19.left.length === 0, JSON.stringify(cr19).slice(0, 900));
const cf19 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), $ = (id) => document.getElementById(id);
  document.querySelector('.topbar [data-tab="create"]').click(); await wait(150);
  const d = $("cfg").closest("details"), was = d ? d.open : null; if (d) d.open = true; await wait(120);
  const c = $("cfg"), l = $("cfgLyrics"), rc = $("cfgRange"), rl = $("cfgLyricsRange");
  const o = { roads: !!rc && !!rl };
  if (!o.roads) { if (d) d.open = was; return o; }
  const knob = document.querySelector('.knobs[data-group="semantic"] .knob input:not([hidden])');
  const kc = knob.getBoundingClientRect(), cc = c.getBoundingClientRect(), lc = l.getBoundingClientRect(), a = rc.getBoundingClientRect(), b = rl.getBoundingClientRect();
  o.h = [Math.round(cc.height), Math.round(lc.height), Math.round(kc.height)]; o.w = [Math.round(cc.width), Math.round(lc.width)];
  o.aligned = Math.abs(a.left - b.left) < 1 && Math.abs(a.right - b.right) < 1; o.roadW = Math.round(a.width);
  o.before = a.right <= $("cfgLight").getBoundingClientRect().left + 1;
  const keep = { c: c.value, ct: c.dataset.touched || "", l: l.value };
  c.value = "3.2"; c.dataset.touched = "1"; l.value = ""; await wait(80);
  o.follow = [rc.value, rl.value, rl.classList.contains("is-auto")];
  rl.value = "2.2"; rl.dispatchEvent(new Event("input", { bubbles: true })); await wait(80);
  o.drag = [l.value, rl.classList.contains("is-auto"), $("cfgLyricsLight").className];
  rc.value = "5"; rc.dispatchEvent(new Event("input", { bubbles: true })); rc.dispatchEvent(new Event("change", { bubbles: true })); await wait(80);
  o.drag2 = [c.value, c.dataset.touched || "", $("cfgLight").className];
  o.z = [rc.style.getPropertyValue("--z1"), rl.style.getPropertyValue("--z1")];
  c.value = keep.c; l.value = keep.l; c.dispatchEvent(new Event("input", { bubbles: true })); c.dataset.touched = keep.ct; l.dispatchEvent(new Event("input", { bubbles: true }));
  await wait(80);
  o.back = [rc.value === String(Math.min(6, parseFloat(c.value))) || !c.value, c.value === keep.c && l.value === keep.l];
  if (d) d.open = was;
  return o; })()`);
check("  the guidances: a road before each light, both roads in one column, the fields the samplers' height, both as wide; the road follows the number, a drag writes it (the lights too)",
  cf19.roads && Math.abs(cf19.h[0] - cf19.h[2]) <= 1 && Math.abs(cf19.h[1] - cf19.h[2]) <= 1 && Math.abs(cf19.w[0] - cf19.w[1]) <= 1 && cf19.aligned && cf19.roadW >= 80 && cf19.before &&
  cf19.follow[0] === "3.2" && cf19.follow[1] === "3.2" && cf19.follow[2] === true && cf19.drag[0] === "2.2" && cf19.drag[1] === false && /is-green/.test(cf19.drag[2]) &&
  cf19.drag2[0] === "5" && cf19.drag2[1] === "1" && /is-red/.test(cf19.drag2[2]) && cf19.z[0] === "66.67%" && cf19.z[1] === "43.33%" && cf19.back[1], JSON.stringify(cf19));
const tt19 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const row = document.querySelector("#libList .take:not(.is-running-row)");
  if (!row) return { none: true };
  const shown = (sel) => { const e = row.querySelector(sel); return !!e && getComputedStyle(e).display !== "none"; };
  const head = row.querySelector(".take-head"), title = row.querySelector(".take-head > .take-title"), play = row.querySelector(".take-head > .playing-tag");
  return { face: [".take-mp3", ".take-post", ".take-dl", ".take-del"].filter(shown), head: !!head && !!title && !!play,
    footPlaying: !!row.querySelector(".take-foot .playing-tag"), oneRow: head ? head.getBoundingClientRect().height < 28 : false }; })()`);
check("  a take's card: no mp3, Refine, download or delete on its face (the take menu has them), playing at the tail of the title's row (HERESY 1421)",
  !tt19.none && tt19.face.length === 0 && tt19.head && !tt19.footPlaying && tt19.oneRow, JSON.stringify(tt19));

// HERESY 1169 · 1420 (Viktor 13.10.2026: «Режим можно выбрать только с AI-Toolkit. Это твоя недоработка в коде?»; 1422: «Убирай AI-Toolkit внешний из Студии»): the studio's own trainer alone, Mode and Separate open
section("the Trainer: the studio's own alone (AI-Toolkit left the studio), Mode (Direct, Full, Melody) and Separate open for it");
const tm20 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), $ = (id) => document.getElementById(id);
  document.querySelector('.topbar [data-tab="train"]').click(); await wait(300);
  const e = $("tr_engine"), c = $("tr_cot"), s = $("tr_sep");
  if (!e || !c || !s) return { missing: true };
  e.dispatchEvent(new Event("change", { bubbles: true })); await wait(60);
  const o = { options: [...e.options].map((x) => x.value), cot: c.disabled, sep: s.disabled, modes: [...c.options].map((x) => x.value),
    tips: [c, s, e].map((x) => (x.closest("label").dataset.tip || "")).join(" | ") };
  document.querySelector('.topbar [data-tab="create"]').click(); await wait(150);
  return o; })()`);
check("the Trainer: Ruach Studio the only trainer, Mode (Direct, Full, Melody) and Separate open for it; no tip says «AI-Toolkit only» or offers it as a choice",
  !tm20.missing && JSON.stringify(tm20.options) === '["ruach"]' && tm20.cot === false && tm20.sep === false && JSON.stringify(tm20.modes) === '["off","full","melody"]' &&
  !/AI-Toolkit only|AI-Toolkit \\(Ostris\\): the reference/.test(tm20.tips), JSON.stringify(tm20).slice(0, 600));

// HERESY 1169 · 1421 (Viktor 13.10.2026, his small things): compare keeps playing on the way back; the Style as one line; the find bar's ✕ in its row; Max length as typed
section("compare goes back to a version and keeps playing; the Style goes as one line; the find bar's ✕ never wraps; Max length: 9 is 9:00, empty is 8:00, shown at once");
const cp21 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms) => { for (let i = 0; i < (ms || 3000) / 50; i++) { const v = fn(); if (v) return v; await wait(50); } return null; };
  const names = [...document.querySelectorAll("#libList .take[data-name]:not(.is-running-row)")].map((x) => x.dataset.name).filter((n, i, a) => n && a.indexOf(n) === i).slice(0, 2);
  if (names.length < 2) return { few: names.length };
  window.HeresyCompare.takes(names);
  const box = await until(() => document.querySelector(".cmp-back .cmp-box"), 3000);
  if (!box) return { nobox: true };
  const rows = () => [...box.querySelectorAll(".cmp-row")], playing = () => rows().map((r) => r.classList.contains("is-playing"));
  await wait(400);
  const o = { open: playing() };
  rows()[1].click(); await wait(20); rows()[0].click();          // straight back, before the second has started
  await wait(900); o.quick = playing();
  rows()[1].click(); await wait(700); o.second = playing();
  rows()[0].click(); await wait(600); o.back = playing();
  box.querySelector('[data-cmp="close"]').click(); await wait(150);
  return o; })()`);
check("compare: back to the first version at once, or after the second has played, and the first plays on (never both, never none)",
  !cp21.few && !cp21.nobox && JSON.stringify(cp21.quick) === "[true,false]" && JSON.stringify(cp21.second) === "[false,true]" && JSON.stringify(cp21.back) === "[true,false]", JSON.stringify(cp21));
const st21 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), $ = (id) => document.getElementById(id);
  document.querySelector('.topbar [data-tab="create"]').click(); await wait(150);
  const one = window.ruachStyleOneLine, was = $("style").value, o = {};
  o.fn = [one("Folk\\nmale vocals,\\n\\n  accordion  \\nslow."), one("a.\\nb"), one("solo"), one("")];
  $("style").value = "Russian folk\\nmale baritone,\\naccordion, 96 BPM";
  try { o.req = window.ruachBuildRequest().style; } catch (e) { o.req = "error: " + e.message; }
  $("style").value = was;
  return o; })()`);
check("  the Style as one line to the engine: a comma between lines, none doubled; the form's own lines untouched",
  JSON.stringify(st21.fn) === JSON.stringify(["Folk, male vocals, accordion, slow.", "a. b", "solo", ""]) && st21.req === "Russian folk, male baritone, accordion, 96 BPM", JSON.stringify(st21));
const fb21 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), $ = (id) => document.getElementById(id);
  window.HeresyFind.open($("style"), true); await wait(150);
  const bar = document.querySelector(".find-bar"), n = document.getElementById("findN");
  if (!bar || bar.hidden) return { nobar: true };
  n.textContent = "1234 из 5678 совпадений";                       // a long count, as some languages say it
  await wait(30);
  const top = (el) => Math.round(el.getBoundingClientRect().top), q = bar.querySelector(".find-q"), x = bar.querySelector('[data-find="close"]');
  const o = { q: top(q), x: top(x), w: Math.round(bar.getBoundingClientRect().width), rep: top(bar.querySelector(".find-r")) > top(q) };
  window.HeresyFind.close(); await wait(80);
  return o; })()`);
check("  the find bar: ✕ in the find row whatever the count says, the replace row under it",
  !fb21.nobar && Math.abs(fb21.q - fb21.x) <= 2 && fb21.rep && fb21.w <= 440, JSON.stringify(fb21));
const ml21 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), $ = (id) => document.getElementById(id);
  const p = window.ruachParseLength, f = document.querySelector('.knob-secs[data-secs-for="max_tokens"]');
  const o = { parse: [p("9"), p(""), p("7:5"), p("8.30"), p("90"), p("15"), p("16"), isNaN(p("x"))] };
  if (!f) return o;
  const was = f.value, type = async (v) => { f.focus(); f.value = v; f.dispatchEvent(new Event("change", { bubbles: true })); await wait(40); return [f.value, $("maxLength").value]; };
  o.nine = await type("9"); o.empty = await type(""); o.secs = await type("125"); o.mmss = await type("3:7");
  await type(was); f.blur();
  return o; })()`);
check("  Max length: 9 is 9:00, empty the engine's default (8:00 live, 6:00 in the mock), 125 seconds 2:05, 3:7 is 3:07, each shown at once in m:ss; the request's length with it",
  JSON.stringify(ml21.parse.filter((x, i) => i !== 1)) === JSON.stringify([540, 425, 510, 90, 900, 16, true]) && JSON.stringify(ml21.nine) === JSON.stringify(["9:00", "540"]) &&
  [360, 480].includes(ml21.parse[1]) && JSON.stringify(ml21.empty) === JSON.stringify([Math.floor(ml21.parse[1] / 60) + ":00", String(ml21.parse[1])]) && JSON.stringify(ml21.secs) === JSON.stringify(["2:05", "125"]) && JSON.stringify(ml21.mmss) === JSON.stringify(["3:07", "187"]), JSON.stringify(ml21));
const sb21 = await ev(`(() => { const H = window.HeresyInstruments, d = H && H.data ? H.data() : null, i = d ? (d.instruments || []).filter((x) => x.slug === "sambuca")[0] : null;
  return { has: !!i, tag: i ? i.tag : null, title: i ? i.title : null, failed: i ? !!i.failed : null }; })()`);
check("  the instruments' sheet asks for the sambuca in his words («sambuca - greek strings»), no longer among the instruments YuE2 does not play",
  sb21.has && sb21.tag === "sambuca - greek strings" && sb21.title === "Sambuca - Greek Strings" && sb21.failed === false, JSON.stringify(sb21));
const cg21 = await ev(`(() => ["cfg", "cfgLyrics", "cfgRange", "cfgLyricsRange"].map((id) => document.getElementById(id) ? document.getElementById(id).step : null))()`);
check("  the Creator's guidances in tenths: both fields and both roads step 0.1 (HERESY 1421)", JSON.stringify(cg21) === JSON.stringify(["0.1", "0.1", "0.1", "0.1"]), JSON.stringify(cg21));

// HERESY 1169 · 1423 (Viktor 13.10.2026: «ставь на обложки 2512… Ты там рулишь»): covers by the cards, Qwen-Image 2512 where it fits whole, else Krea 2 Muse; the speeds as measured
section("Engine → Artwork: by the cards Qwen-Image 2512 where a card holds it whole, else Krea 2 Muse; the speeds as measured on a 3090");
const ap23 = await ev(`(() => { const s = document.getElementById("artPainter"); if (!s) return { none: true };
  return { auto: s.options[0].value === "" ? s.options[0].textContent : null, krea: [...s.options].filter((o) => o.value === "krea2-q4").map((o) => o.textContent)[0] || "", tip: s.dataset.tip || "" }; })()`);
check("  «By the cards» says Qwen-Image 2512 first (Q6 from 20 GB, Q4 from 16 GB), else Krea 2 Muse; Krea's line about 65 s; the tip has the measurements",
  !ap23.none && /^By the cards: Qwen-Image 2512 /.test(ap23.auto) && /65 s/.test(ap23.krea) && /131 s/.test(ap23.tip), JSON.stringify(ap23));

// HERESY 1169 · 1425 (Viktor 13.10.2026, before RC7): compare at 1200 px with its wave and thumbs; Compute's VAE, the preset gone; the Colour; the cover to the namesakes; the sections of one go
section("compare: 1200 px, its wave, thumbs and star, the disliked hidden; Engine → Compute's VAE, no preset; the Refiner's Colour; the replaced bands; a cover to the namesakes");
const cp25 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms) => { for (let i = 0; i < (ms || 3000) / 50; i++) { const v = fn(); if (v) return v; await wait(50); } return null; };
  const names = [...document.querySelectorAll("#libList .take[data-name]:not(.is-running-row)")].map((x) => x.dataset.name).filter((n, i, a) => n && a.indexOf(n) === i).slice(0, 2);
  if (names.length < 2) return { few: names.length };
  // the mock keeps no ratings: the Librarian's rate and rating stand in for the popup's hooks (they look them up at each call)
  const HC = window.HeresyCollection, own = { rate: HC.rate, rating: HC.rating }, held = {}, hideWas = localStorage.getItem("yue2.cmpHideDisliked");
  HC.rating = (n) => held[n] || 0; HC.rate = (n, v) => { held[n] = v; return Promise.resolve(v); };
  localStorage.removeItem("yue2.cmpHideDisliked");
  window.HeresyCompare.takes(names);
  const box = await until(() => document.querySelector(".cmp-back .cmp-box"), 3000);
  if (!box) return { nobox: true };
  await wait(300);
  const o = { w: Math.round(box.getBoundingClientRect().width), vw: window.innerWidth, wave: !!box.querySelector("canvas.cmp-wave"),
    waveH: Math.round((box.querySelector("canvas.cmp-wave") || { getBoundingClientRect: () => ({ height: 0 }) }).getBoundingClientRect().height),
    rates: box.querySelectorAll(".cmp-li [data-cmp-rate]").length, stars: box.querySelectorAll(".cmp-li [data-cmp-fav]").length,
    hide: !!box.querySelector("[data-cmp-hide]"), hideOn: !!(box.querySelector("[data-cmp-hide]") || {}).checked, seekGone: !box.querySelector(".cmp-seek") };
  box.querySelectorAll(".cmp-li")[1].querySelector('[data-cmp-rate="-1"]').click();     // the second disliked: hidden, the first stays
  await wait(250);
  o.afterDis = [...box.querySelectorAll(".cmp-li")].map((li) => li.hidden);
  o.pressed = box.querySelectorAll(".cmp-li")[1].querySelector('[data-cmp-rate="-1"]').getAttribute("aria-pressed");
  const cb = box.querySelector("[data-cmp-hide]"); cb.checked = false; cb.dispatchEvent(new Event("change", { bubbles: true })); await wait(100);
  o.shownAgain = [...box.querySelectorAll(".cmp-li")].map((li) => li.hidden);
  o.kept = localStorage.getItem("yue2.cmpHideDisliked");
  const r = box.getBoundingClientRect(), wv = box.querySelector("canvas.cmp-wave").getBoundingClientRect();
  box.querySelector('[data-cmp="close"]').click(); await wait(150);
  HC.rate = own.rate; HC.rating = own.rating;
  if (hideWas === null) localStorage.removeItem("yue2.cmpHideDisliked"); else localStorage.setItem("yue2.cmpHideDisliked", hideWas);
  return o; })()`);
check("compare: as wide as 1200 px or the window, the playing version's wave for the seek bar, each take's thumbs and star, «Hide disliked» on",
  !cp25.few && !cp25.nobox && cp25.w <= 1200 && (cp25.w >= 1150 || cp25.w >= cp25.vw - 40) && cp25.wave && cp25.waveH >= 60 && cp25.rates === 4 && cp25.stars === 2 && cp25.hide && cp25.hideOn && cp25.seekGone, JSON.stringify(cp25));
check("  a take disliked there leaves the list at once (its thumb pressed); unticked, it comes back; the choice kept for the next time",
  JSON.stringify(cp25.afterDis) === "[false,true]" && cp25.pressed === "true" && JSON.stringify(cp25.shownAgain) === "[false,false]" && cp25.kept === "0", JSON.stringify(cp25));
const vz25 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), $ = (id) => document.getElementById(id);
  const a = $("vaePick"), b = $("setVae"), f = $("memPresetField");
  if (!b) return { none: true };
  const o = { same: a && [...a.options].map((x) => x.value).join() === [...b.options].map((x) => x.value).join(), n: b.options.length, eq: a ? a.value === b.value : null,
    presetHidden: !!f && f.hidden && getComputedStyle(f).display === "none", sel: !!$("memPreset") };
  if (b.options.length > 1) {
    const was = b.value, other = [...b.options].map((x) => x.value).filter((v) => v !== was)[0];
    b.value = other; b.dispatchEvent(new Event("change", { bubbles: true })); await wait(60);
    o.follow = a ? a.value === other : null;
    b.value = was; b.dispatchEvent(new Event("change", { bubbles: true })); await wait(60);
    o.back = a ? a.value === was : null;
  }
  return o; })()`);
check("  Engine → Compute: the VAE under the model, the ☰ menu's twin either way; the GPU memory preset hidden (its Auto underneath)",
  !vz25.none && vz25.same && vz25.n >= 1 && vz25.eq && vz25.presetHidden && vz25.sel && (vz25.n < 2 || (vz25.follow && vz25.back)), JSON.stringify(vz25));
const co25 = await ev(`(() => { const $ = (id) => document.getElementById(id), c = $("rmColour"), d = $("rmColourDb");
  if (!c || !d) return { none: true };
  const was = [c.value, d.value]; c.value = "vinyl"; d.value = "-44";
  const s = window.HeresyDerived.remasterSettings(); c.value = was[0]; d.value = was[1];
  return { opts: [...c.options].map((x) => x.value), min: d.min, max: d.max, def: was, colour: s.colour, db: s.colour_db, plain: window.HeresyDerived.remasterSettings().colour }; })()`);
check("  the Refiner's Colour: none, vinyl, tape or room, −60 to −20 dB under the song (−36 by default), sent with the remaster's settings",
  !co25.none && JSON.stringify(co25.opts) === JSON.stringify(["", "vinyl", "tape", "room"]) && co25.min === "-60" && co25.max === "-20" && JSON.stringify(co25.def) === JSON.stringify(["", "-36"]) &&
  co25.colour === "vinyl" && co25.db === -44 && co25.plain === "", JSON.stringify(co25));
const rp25 = await ev(`(() => {
  const t = window.ruachPlayerTake && window.ruachPlayerTake();
  if (!t || !window.ruachReplacedMark) return { none: true };
  const m = window.ruachReplacedMark({ a: 10, b: 20, section: "Verse 1", parts: [{ a: 10, b: 20, section: "Verse 1" }, { a: 40, b: 55, section: "Chorus" }] });
  const o = { parts: m && m.parts ? m.parts.length : 0, follow: typeof window.ruachFollowSection, cover: typeof window.ruachCoverToNamesakes };
  window.ruachReplacedMark(null);
  return o; })()`);
check("  the sections of one go each its own band on the wave; their job followed to its takes; a cover to the namesakes there to call",
  (rp25.none || rp25.parts === 2) && rp25.follow === "function" && rp25.cover === "function", JSON.stringify(rp25));
const tk25 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  document.querySelector('.topbar [data-tab="create"]').click(); await wait(200);
  const cards = [...document.querySelectorAll("#libList .take[data-name]:not(.is-running-row)")].filter((c) => c.querySelector(".take-head") && c.querySelector(".take-foot"));
  if (!cards.length) return { none: true };
  return cards.slice(0, 6).map((c) => { const h = c.querySelector(".take-head"), f = c.querySelector(".take-foot"), cs = getComputedStyle(h);
    const used = [...f.children].reduce((w, x) => w + x.getBoundingClientRect().width, 0) + 8 * Math.max(0, f.children.length - 1);
    return { span: cs.gridColumnStart + "/" + cs.gridColumnEnd, slack: Math.round(f.getBoundingClientRect().width - used) }; }); })()`);
check("  a take's card in the Creator: the title row across the card, so its marks' row is as wide as they are and the workspace beside them keeps its room",
  !tk25.none && tk25.every((x) => x.span === "1/-1" && x.slack < 24), JSON.stringify(tk25));
// ================================================================== fonts
section("fonts (Engine page)");
const fontMenu = await ev(`(() => { const s = document.getElementById("fontSans"), kids = [...s.children], hr = kids.findIndex(k => k.tagName === "HR");
  const cards = [...document.querySelectorAll("#view-engine .engine-grid > .card")];
  return { first: kids.slice(0, hr).map(k => k.textContent), hr, system: kids.slice(hr + 1).map(k => k.value), value: s.value,
    heading: document.getElementById("fontHeading").options[0].textContent, mono: document.getElementById("fontMono").value,
    card: cards.findIndex(c => c.id === "appearanceCard"), about: cards.findIndex(c => c.id === "aboutCard"), n: cards.length }; })()`);
check("Fonts: the app's fonts first (the default marked), a line, then the fonts this computer has", fontMenu.first.join() === "Noto Sans (default),Noto Sans Mono,IBM Plex Sans,IBM Plex Mono,Bodoni Moda,Space Grotesk,Michroma,Raleway,Roboto,Lato" &&
  fontMenu.hr === 10 && !fontMenu.system.some((f) => ["Noto Sans", "Roboto", "Lato", "Raleway"].includes(f)) && fontMenu.system.length >= 1 && fontMenu.value === "Noto Sans" && fontMenu.heading === "Same as the text (default)" &&
  fontMenu.mono === "Noto Sans Mono" && /* HERESY 1167: Viktor's fonts are the app's own */ fontMenu.card >= 0 && fontMenu.about === fontMenu.n - 1, JSON.stringify({ ...fontMenu, system: fontMenu.system.slice(0, 6) }));
// HERESY 1166 (Viktor 04.10.2026: «как всё ужать и передвинуть, чтобы на 1080p всё встало красиво и не таким длинным
// полотенцем»): his rows on one grid of thirty: Server over Hardware beside the log (1/3 · 2/3), Compute | GPUs (2/5 · 3/5),
// Appearance | Writer (4/6 · 2/6), VAEs | LoRAs (1/6 · 5/6), Sliders, About; Appearance's two parts still side by side
await click("#engineToggle");
await waitFor(`!document.getElementById("view-engine").classList.contains("is-hidden")`, 3000, 50);
const engineRows = await ev(`(() => { const r = (s) => document.querySelector("#view-engine .engine-grid > " + s).getBoundingClientRect();
  const s = r(".eg-server"), hw = r(".eg-hardware"), log = r(".eg-log"), cm = r(".eg-compute"), g = r(".eg-gpus"), a = r(".eg-look"), w = r(".eg-writer"),
    v = r(".eg-vae"), l = r(".eg-loras"), sl = r(".eg-sliders"), ab = r(".eg-about"), art = r(".eg-art"), whole = document.querySelector("#view-engine .engine-grid").getBoundingClientRect().width;
  const near = (x, y) => Math.abs(x - y) < 2, parts = [...document.querySelectorAll("#appearanceCard .look-part")].map(e => e.getBoundingClientRect());
  return { stack: near(hw.left, s.left) && hw.top >= s.bottom - 1 && near(log.top, s.top) && near(log.bottom, hw.bottom) && log.left >= s.right - 1,
    rows: [[cm, g], [v, l]].every(([x, y]) => near(x.top, y.top) && near(x.bottom, y.bottom) && y.left >= x.right - 1) && cm.top >= log.bottom - 1 &&
      near(a.top, w.top) && w.left >= a.right - 1 && near(art.left, w.left) && near(art.width, w.width) && art.top >= w.bottom - 1 && near(a.bottom, art.bottom) &&
      a.top >= cm.bottom - 1 && v.top >= a.bottom - 1 && sl.top >= v.bottom - 1 && ab.top >= sl.bottom - 1 && near(sl.width, whole) && near(ab.width, whole),
    thirtieths: [s, log, cm, g, a, w, v, l].map(x => Math.round(x.width / whole * 30)).join(),
    sideBySide: parts.length === 2 && Math.abs(parts[0].top - parts[1].top) < 2 && parts[1].left > parts[0].right }; })()`);
check("Engine page in Viktor's rows: Server over Hardware beside the log, Compute | GPUs, Appearance | Writer over Artwork, VAEs | LoRAs, Sliders, About",
  engineRows.stack && engineRows.rows && engineRows.thirtieths === "10,20,12,18,20,10,5,25" && engineRows.sideBySide, JSON.stringify(engineRows));
await click("#engineBack");
// the Appearance card: the theme (in step with the top bar's swatches) and options that work with any theme
const look = await ev(`(() => { const sel = document.getElementById("lookTheme"), root = document.documentElement;
  const groups = [...sel.querySelectorAll("optgroup")].map(g => g.label + ":" + g.children.length).join(), first = sel.value;
  sel.value = "nord"; sel.dispatchEvent(new Event("change")); const picked = root.dataset.theme;
  YueThemes.set("studio"); const synced = sel.value;
  const set = (id, on) => { const e = document.getElementById(id); e.checked = on; e.dispatchEvent(new Event("change")); };
  set("lookHover", true); set("lookGlow", true); set("lookMotion", true);
  const c = document.getElementById("lookCorners"); c.value = "square"; c.dispatchEvent(new Event("change"));
  const cs = getComputedStyle(root), card = getComputedStyle(document.querySelector("#view-engine .card"));
  return { groups, first, picked, synced, hover: root.dataset.hover, glow: root.dataset.glow, motion: root.dataset.motion, corners: root.dataset.corners,
    rmd: cs.getPropertyValue("--r-md").trim(), line: cs.getPropertyValue("--hover-line").trim(), shadow: card.boxShadow !== "none", saved: localStorage.getItem("yue2.look") }; })()`);
// HERESY 1015, 1099: 22 themes to work in, Classic and Soft; Viktor's IGR day is the first and the default
check("Appearance: a theme menu of all 22 (grouped), in step with the top bar's swatches", look.groups === "Classic:13,Soft:9" && look.first === "igr-day" &&
  look.picked === "nord" && look.synced === "studio", JSON.stringify(look).slice(0, 200));
check("  its options: hover in the theme's colour, a glow round cards, square corners, a calmer page; this browser keeps them",
  look.hover === "accent" && look.glow === "on" && look.motion === "reduced" && look.corners === "square" && look.rmd === "2px" && /color-mix|rgb/.test(look.line) &&
  look.shadow && JSON.parse(look.saved || "{}").corners === "square", JSON.stringify(look).slice(0, 240));
await boot();
const lookBack = await ev(`({ hover: document.documentElement.dataset.hover, corners: document.documentElement.dataset.corners, box: document.getElementById("lookGlow").checked,
  menu: document.getElementById("lookCorners").value })`);
check("  they are on before the page shows, after a reload, and the card shows them", lookBack.hover === "accent" && lookBack.corners === "square" &&
  lookBack.box === true && lookBack.menu === "square", JSON.stringify(lookBack));
await click("#fontsReset");
await answerDialog(true);
const lookReset = await ev(`({ attrs: ["hover", "glow", "motion", "corners"].filter(k => k in document.documentElement.dataset).join(), saved: localStorage.getItem("yue2.look"),
  theme: document.documentElement.dataset.theme })`);
check("  Default look brings Viktor's look back (hover, glow, softer corners; the theme stays)", lookReset.attrs === "hover,glow,corners" && lookReset.saved === null && lookReset.theme === "studio", JSON.stringify(lookReset));
const pickFont = (id, value) => ev(`(() => { const s = document.getElementById("${id}"); s.value = ${JSON.stringify(value)}; s.dispatchEvent(new Event("change")); return s.value; })()`);
const fontsNow = `(() => ({ body: getComputedStyle(document.body).fontFamily, head: getComputedStyle(document.querySelector(".col-head h2")).fontFamily,
  saved: localStorage.getItem("yue2.fonts") }))()`;
const sysFont = fontMenu.system[0];
// 2.0.0-rc5 night: the Default fonts dialog answered just before, its reset can repaint the menus after the pick (a live run picked a
// font the menu no longer had: "", sans-serif): wait until the menu holds the font, then pick, then read
await waitFor(`[...document.getElementById("fontSans").options].some((o) => o.value === ${JSON.stringify(sysFont)}) && !document.querySelector(".hd-back")`, 4000, 50);
await sleep(300);
await pickFont("fontSans", sysFont);
const f1 = await ev(fontsNow);
check("  picking a system font for the text changes the text and the headings follow it; this browser keeps it", f1.body.includes(sysFont) && f1.head.includes(sysFont) &&
  f1.saved === JSON.stringify({ sans: sysFont }), JSON.stringify(f1));
await pickFont("fontHeading", "Bodoni Moda");
const f2 = await ev(fontsNow);
check("  a heading font of its own changes only the headings", f2.head.startsWith('"Bodoni Moda"') && f2.body.includes(sysFont), JSON.stringify(f2));
await boot();
const f3 = await ev(`(() => ({ ...${fontsNow}, menus: [document.getElementById("fontSans").value, document.getElementById("fontHeading").value] }))()`);
check("  both survive a reload, and the menus show them", f3.body.includes(sysFont) && f3.head.startsWith('"Bodoni Moda"') && f3.menus.join() === sysFont + ",Bodoni Moda", JSON.stringify(f3));
await click("#fontsReset");
await answerDialog(true);
const f4 = await ev(fontsNow);
check("  Default fonts puts the app's own back and forgets the choice", f4.body.startsWith('"Noto Sans"') && f4.head.startsWith('"Noto Sans"') && f4.saved === null,
  JSON.stringify(f4));

// ============================================================ tips vs the log
section("tips stay while the server log scrolls");
await click("#engineToggle");
await engineOpen(true);
const logTip = await hoverOn('#computeCard .field:has(#setVaeCore) .info');
await ev(`(() => { const b = document.getElementById("logBody"); for (let i = 0; i < 300; i++) { const d = document.createElement("div"); d.className = "probe-line"; d.textContent = "line " + i; b.appendChild(d); }
  b.scrollTop = b.scrollHeight; window.__feed = setInterval(() => { const d = document.createElement("div"); d.className = "probe-line"; d.textContent = "[AR] Semantic"; b.appendChild(d); b.scrollTop = b.scrollHeight; }, 200); return true; })()`);
await sleep(1200);   // the test itself: the tip must outlive 1.2 s of new log lines (six, one per 200 ms)
const stillOn = await ev(`document.querySelector(".tip").classList.contains("is-on")`);
await ev(`clearInterval(window.__feed); document.querySelectorAll("#logBody .probe-line").forEach(d => d.remove()); true`);
check("a tip stays open while the server log follows new lines (it closed within ~2 s before)", logTip?.on && stillOn === true && /tiles/.test(logTip.text), logTip?.text.slice(0, 60));
await wheel(lastHover.x, lastHover.y, 400);
check("  scrolling the page itself still closes it", (await ev(`document.querySelector(".tip").classList.contains("is-on")`)) === false);
await click("#engineBack");
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 5, y: 5 });

// ============================================================ engine panel
section("engine panel");
await click("#engineToggle");
await engineOpen(true);
const server = await ev(`[...document.querySelectorAll("#serverCard div")].map(d => d.innerText.replace(/\\s+/g, " "))`);
check("server card shows /props (backbone, batch, transcriber, library)", server.some((s) => /YuE2-3B-BF16\.gguf/.test(s)) &&
  server.some((s) => /Songs per pass 4/.test(s)) && server.some((s) => /Transcriber loaded/.test(s)) && server.some((s) => /Library saved on disk/.test(s)), server.join(" | "));
const vaeCard = await ev(`document.getElementById("vaeCard").innerText`);
check("VAE card names every repo", ["m-a-p/YuE2-Vae", "m-a-p/YuE2-Vae-legacy", "Mothersuperior/YuE2-Vae-merge-0.666"].every((r) => vaeCard.includes(r)));
const sliderCard = await ev(`({ tiles: document.querySelectorAll("#sliderCard > li").length, buttons: document.querySelectorAll("#sliderCard button").length,
  badge: (document.querySelector("#view-engine .kind-badge.is-addon") && [...document.querySelectorAll("#view-engine h3")].find(h => /Sliders/.test(h.textContent))
    .querySelector(".kind-badge.is-addon") || {}).textContent || "",
  href: (document.querySelector("#sliderSource a.tile-link") || { getAttribute: () => "" }).getAttribute("href"),
  info: (document.querySelector("#sliderSource .info") || { dataset: {} }).dataset.tip || "",
  first: (document.querySelector("#sliderCard > li") || {}).innerText || "", note: document.getElementById("sliderCardNote").textContent })`);
check("Engine Sliders card: marked ADD-ON, its source linked with an (i), one tile per slider (16, no buttons)", sliderCard.tiles === 16 &&
  sliderCard.buttons === 0 && sliderCard.badge === "add-on" && sliderCard.href === "https://example.org/sliders" && /an add-on/.test(sliderCard.info) &&
  /16 voice and genre sliders/.test(sliderCard.note), JSON.stringify(sliderCard).slice(0, 300));
const formKinds = await ev(`({ sliders: !!document.querySelector("fieldset .label .kind-badge.is-addon") &&
    [...document.querySelectorAll("fieldset .label")].filter(l => /^(Sliders|LoRAs)/.test(l.textContent.trim()) && l.querySelector(".kind-badge.is-addon")).length,
  vaes: [...document.querySelectorAll("#decoders label.toggle")].map(l => l.querySelector("input").value + ":" + ((l.querySelector(".kind-badge") || {}).textContent || "")) })`);
check("the form marks the add-ons: Sliders and LoRAs headings, and the Blend VAE (the stock VAEs unmarked)", formKinds.sliders === 2 &&
  formKinds.vaes.join() === "standard:,legacy:,blend:add-on", JSON.stringify(formKinds));
const cramped = await ev(`(() => { const h = document.querySelector("#paneServer .pane-head h4").getBoundingClientRect().height,
  b = document.getElementById("chatTest").getBoundingClientRect().height; return { h: Math.round(h), b: Math.round(b) }; })()`);
check("Writer card has room: its header and button sit on one line", cramped.h < 22 && cramped.b < 34, JSON.stringify(cramped));
const logText = await ev(`document.getElementById("logBody").innerText`);
check("server log card streams /logs", /\[Server\] Listening on/.test(logText) && (await ev(`document.getElementById("logState").textContent`)) === "live");
check("no PyTorch-only settings (device, backend, quantization dtype, budget)", (await ev(`!document.getElementById("setBackend") && !document.getElementById("setQuant") && !document.getElementById("setBudget") && !document.getElementById("setDevice")`)) === true);
let t;
// the F32 option was removed on 2026-09-26 (unproven quality claim, about 60% slower): nothing of it is left
check("no F32 option: no button by the model menu, no Precision setting, no tip", (await ev(`!document.getElementById("f32Toggle") &&
  !document.getElementById("setPrecision") && !document.querySelector('[data-tip-ref="tip-precision"]') && !document.getElementById("tip-precision")`)) === true);
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 5, y: 700 });
check("the engine panel is open before Escape", (await ev(`document.getElementById("view-engine").classList.contains("is-hidden")`)) === false);
await ev(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))`);
check("Escape closes the engine panel", (await ev(`document.getElementById("view-engine").classList.contains("is-hidden")`)) === true);

// ==================================================================== VAEs
section("VAE choice");
const kinds = await ev(`[...document.querySelectorAll("#decoders input")].map(i => i.type + ":" + i.name)`);
check("VAE choices are one group of radios from /props", kinds.length === 3 && kinds.every((k) => k === "radio:vae"), kinds.join(" "));
const picks = [];
// HERESY 1168 (Viktor: «к хуям убираем из Композера VAE блок… Выбор VAE переносим в бар в спадающее меню прямо под выбор модели»)
const vaeMenu = await ev(`({ hidden: !document.querySelector('fieldset[data-fold="vae"]').checkVisibility(),
  under: document.getElementById("vaePick").closest(".head-more-row").previousElementSibling.querySelector("#modelPick") !== null,
  opts: [...document.getElementById("vaePick").options].map(o => o.value + ":" + o.textContent).join(",") })`);
check("the VAE is chosen in the ☰ menu, right under the model; the Composer shows no VAE block; Blend marked add-on",
  vaeMenu.hidden && vaeMenu.under && vaeMenu.opts === "standard:Standard,legacy:Legacy,blend:Blend · add-on", JSON.stringify(vaeMenu));
for (const v of ["legacy", "blend", "standard", "legacy"]) {
  await ev(`(() => { const m = document.getElementById("vaePick"); m.value = "${v}"; m.dispatchEvent(new Event("change", { bubbles: true })); return true; })()`);
  await waitFor(`document.querySelector('#decoders input[value="${v}"]').checked`, 2000, 20);
  picks.push(await ev(`[...document.querySelectorAll("#decoders input:checked")].map(i => i.value).join("+")`));
}
check("  the menu picks one decoder, and the page's record of it (the radios) follows", picks.join(",") === "legacy,blend,standard,legacy", picks.join(" -> "));
check("the pick is remembered in this browser", (await ev(`localStorage.getItem("yue2.vae")`)) === "legacy");
await boot();
check("the pick survives a reload, in the menu too", (await ev(`document.querySelector("#decoders input:checked")?.value + "/" + document.getElementById("vaePick").value`)) === "legacy/legacy");

// ==================================================================== tips
section("info tips");
// HERESY 1168: the VAE's words are the ☰ menu's tip now (the Composer's block and its (i) are gone from sight)
const vaeTip = await ev(`document.getElementById("vaePick").dataset.tip`);
check("the menu's tip says the three: Standard the cleanest and the default, Legacy the benchmarks', Blend the add-on mix; a take decodes again from its card",
  /Standard · the cleanest sound, the newer model, the default/.test(vaeTip) && /Legacy · the older official decoder, the benchmarks were made with it/.test(vaeTip) &&
  /Blend · an add-on: two thirds Standard, one third Legacy/.test(vaeTip) && /decodes again with another one from its card, in seconds/.test(vaeTip), vaeTip);
t = await hoverOn('#sliderChips [data-slider="metal"]');
check("hover a slider chip says what it does, that it is an add-on, and its id", t?.on && /Heavy guitar riffs/.test(t.text) && /Add-on slider/.test(t.text) &&
  t.text.includes("metal"), t?.text.replace(/\n/g, " | "));
t = await hoverOn('[data-tip-ref="tip-sliders"]');
check("(i) beside Sliders says they are an add-on, not stock, and a cousin of a LoRA", t?.on && /add-on, not stock/i.test(t.text) &&
  /cousin of a LoRA/.test(t.text), t?.text.split("\n")[0]);
await ev(`(() => { const d = document.getElementById("advDrawer"); d.open = true; d.querySelector('[data-tip-ref="tip-seeds"]').scrollIntoView({ block: "center" }); return true; })()`);
await sleep(200);
t = await hoverOn('[data-tip-ref="tip-seeds"]');
check("(i) beside the seeds explains music vs sound", t?.on && /Music/.test(t.text) && /Sound/.test(t.text), t?.text.split("\n")[0]);
await ev(`document.getElementById("coverDrawer").open = true; document.getElementById("advDrawer").open = true; true`);
const cover = await ev(`(() => { const body = document.querySelector("#coverDrawer .drawer-body"), parts = [...body.querySelectorAll(".cover-part")];
  const w = (id) => Math.round(document.getElementById(id).getBoundingClientRect().width / parts[0].getBoundingClientRect().width * 100);
  const b = parts.map(p => p.querySelector(".cover-act .btn").getBoundingClientRect());   // each part's first button
  return { parts: parts.length, full: ["coverFile", "coverTask", "coverTake"].map(w), sizes: b.map(r => Math.round(r.width) + "x" + Math.round(r.height)),
    left: b.map((r, i) => Math.round(r.left - parts[i].getBoundingClientRect().left)), hints: body.querySelectorAll(".hint").length,
    infos: parts.map(p => !!p.querySelector(".mini .info")).join() }; })()`);
check("Cover or remix: two parts of one shape, each control on its own full line, both buttons the same size on the left, no long paragraphs",
  cover.parts === 2 && cover.full.every((x) => x >= 95) && cover.sizes[0] === "172x30" && cover.sizes[1] === "172x30" && cover.left.every((x) => x <= 1) &&
  cover.hints === 0 && cover.infos === "true,true", JSON.stringify(cover));
await ev(`document.getElementById("scoreDrawer").open = true; true`);
const scoreBox = await ev(`(() => { const d = document.getElementById("scoreDrawer"), rm = document.getElementById("abcRemove"), mi = document.getElementById("abcInstrumental");
  const body = d.querySelector(".drawer-body").getBoundingClientRect(), r = rm.getBoundingClientRect(), m = mi.getBoundingClientRect();
  const abc = document.getElementById("abc"); abc.value = ""; rm.click(); const cleared = abc.value === "";
  return { box: rm.classList.contains("btn") && !rm.classList.contains("chip"), radius: parseFloat(getComputedStyle(rm).borderTopLeftRadius),
    chipRadius: parseFloat(getComputedStyle(d.querySelector(".chip")).borderTopLeftRadius), sizes: [m, r].map(x => Math.round(x.width) + "x" + Math.round(x.height)).join(),
    left: Math.round(m.left - body.left - parseFloat(getComputedStyle(d.querySelector(".drawer-body")).paddingLeft)), sameRow: Math.abs(m.top - r.top) < 1,
    hints: d.querySelectorAll(".hint").length, info: !!abc.closest(".field").querySelector(".label .info"),
    chips: [...d.querySelectorAll(".chip")].map(c => c.textContent).join(), cleared }; })()`);
check("Supply your own score: Remove score is a square button beside Make instrumental, both one size on the left; the examples stay chips",
  scoreBox.box && scoreBox.radius < 10 && scoreBox.chipRadius > scoreBox.radius && /* HERESY 1167: softer corners by default */ scoreBox.sizes === "172x30,172x30" && scoreBox.left <= 1 && scoreBox.sameRow &&
  scoreBox.hints === 0 && scoreBox.info && scoreBox.chips === "Melody only,Melody and chords" && scoreBox.cleared, JSON.stringify(scoreBox));   // HERESY 1167: no jazz
await ev(`document.getElementById("scoreDrawer").open = false; true`);
const empty = await ev(`(() => { const e = document.getElementById("takeEmpty"); return { shown: !e.classList.contains("is-hidden"),
  title: e.querySelector(".take-empty-title")?.textContent, text: e.textContent.replace(/\\s+/g, " ").trim() }; })()`);
check("the song page's empty state: a title and one friendly paragraph", empty.shown && empty.title === "Your next song starts here" &&
  /press Generate song, then watch it take shape/.test(empty.text) && /opens here too\.$/.test(empty.text) && !/Start a song on the left/.test(empty.text),
  empty.text.slice(0, 140));
t = await hoverOn('[data-tip-ref="tip-transcribe"]');
check("(i) beside From a recording names both models", t?.on && t.text.includes("m-a-p/SheetSage2") && t.text.includes("m-a-p/MERT-v2-FullSong"), t?.text.split("\n")[0]);
check("  the tip sits inside the window", inView(t));
t = await hoverOn('[data-tip-ref="tip-output"]');
check("(i) beside Format explains WAV 24 and peak clip", t?.on && /WAV 24/.test(t.text) && /Peak clip/.test(t.text));
t = await hoverOn('[data-tip-ref="tip-versions"]');
check("(i) beside Takes says the server's batch size", t?.on && /up to 4 side by side/.test(t.text.replace(/\s+/g, " ")), t?.text.replace(/\s+/g, " ").slice(0, 120));
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 1100, y: 400 });
await waitFor(`!(${tipOn})`, 2000, 50);
check("the tip hides when the pointer leaves", (await ev(tipOn)) === false);
await ev(`document.querySelector('[data-tip-ref="tip-sliders"]').focus()`);
await waitFor(tipOn, 2000, 50);
check("tabbing onto (i) shows the tip too", (await ev(tipOn)) === true);
await ev(`document.activeElement.blur(); document.getElementById("coverDrawer").open = false; document.getElementById("advDrawer").open = false; true`);

// ================================================================= sliders
section("sliders");
await click('#sliderChips [data-slider="metal"]');
await waitFor(`document.querySelectorAll("#sliderActive .slider-row").length === 1`, 2000, 50);
check("tapping a chip adds a strength row", (await ev(`document.querySelectorAll("#sliderActive .slider-row").length`)) === 1 &&
  (await ev(`document.querySelector('#sliderChips [data-slider="metal"]').classList.contains("is-on")`)) === true);
await ev(`(() => { const r = document.querySelector('#sliderActive input[data-strength="metal"]'); r.value = "0.6"; r.dispatchEvent(new Event("input", { bubbles: true })); })()`);
check("strength moves 0..1 and shows its value", (await ev(`document.querySelector("#sliderActive output").textContent`)) === "0.60");
await click('#sliderChips [data-slider="female"]');
await click('#sliderChips [data-slider="male"]');
await waitFor(`document.querySelectorAll("#sliderActive .slider-row").length === 3`, 2000, 50);
await click('#modes input[value="full"]');                 // HERESY 1167: the form starts in Direct now; this is Full's note
let hint = await ev(`document.getElementById("sliderHint").textContent`);
check("sliders stack (three rows)", (await ev(`document.querySelectorAll("#sliderActive .slider-row").length`)) === 3);
check("hint: Female and Male pull in opposite directions", /opposite directions/.test(hint), hint);
check("hint: trained in Direct mode (full plan selected)", /trained in Direct mode/.test(hint));
await click('#modes input[value="off"]');
hint = await ev(`document.getElementById("sliderHint").textContent`);
check("the Direct-mode note goes away in Direct mode", !/trained in Direct mode/.test(hint));
await click('#modes input[value="full"]');
await click('#sliderActive [data-remove="female"]');
await click('#sliderActive [data-remove="male"]');
check("removing leaves only the chosen one", (await ev(`[...document.querySelectorAll("#sliderActive .slider-name")].map(e => e.textContent).join()`)) === "Metal");
// HERESY 1166 (Viktor: «…кривую в виде арки/параболы, либо амплитуду вручную мышкой двигая вспышки и затухания по слайдеру»):
// a slider's curve through the song: its picture opens the editor; Arch sends the arch, Draw takes a point added and one
// dragged, Flat sends nothing more than before (put back flat for the run below)
const curve = await ev(`(async () => { const wait = (ms) => new Promise(r => setTimeout(r, ms)), q = (s) => document.querySelector("#sliderActive " + s);
  q('[data-curve-toggle="metal"]').click(); await wait(50);
  const opened = !!q('[data-curve-edit="metal"]'), flat = JSON.stringify(YueSliders.body());
  q('[data-curve-mode="arch"]').click(); await wait(50);
  const arch = JSON.stringify(YueSliders.body()), curved = q('[data-curve-toggle="metal"]').classList.contains("is-curved");
  q('[data-curve-mode="draw"]').click(); await wait(50);
  const svg = q('[data-curve-graph="metal"]'), r = svg.getBoundingClientRect(), pts0 = svg.querySelectorAll(".curve-pt").length;
  svg.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, clientX: r.left + r.width * 0.25, clientY: r.top + r.height * 0.8 })); await wait(50);
  const svg2 = q('[data-curve-graph="metal"]'), pt = svg2.querySelectorAll(".curve-pt")[2], pr = pt.getBoundingClientRect(), r2 = svg2.getBoundingClientRect();
  pt.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 7, clientX: pr.left + 4, clientY: pr.top + 4 }));
  pt.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 7, clientX: pr.left + 4, clientY: r2.bottom - 2 }));
  pt.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 7 })); await wait(50);
  const drawn = YueSliders.body()[0].curve;
  q('[data-curve-mode="flat"]').click(); await wait(50);
  const back = JSON.stringify(YueSliders.body());
  q('[data-curve-toggle="metal"]').click(); await wait(50);
  return { opened, flat, arch, curved, pts0, drawn, back, closed: !q('[data-curve-edit]') }; })()`);
check("a slider's curve: its picture opens the editor; Arch is sent as the arch; flat sends nothing more", curve.opened &&
  curve.flat === '[{"id":"metal","strength":0.6}]' && curve.arch === '[{"id":"metal","strength":0.6,"curve":[[0,0.15],[0.5,1],[1,0.15]]}]' &&
  curve.curved && curve.back === curve.flat && curve.closed, JSON.stringify(curve));
check("  Draw: a double-click adds a point, a point dragged to the bottom fades the strength there",
  curve.pts0 === 3 && Array.isArray(curve.drawn) && curve.drawn.length === 4 && curve.drawn.some(p => p[1] === 0), JSON.stringify(curve.drawn));
await shot("sliders");

// ============================================================ generate
section("generate: request and live run");
await mockClear();
await ev(`(() => {
  const set = (id, v) => { document.getElementById(id).value = v; };
  set("title", "CDP Song"); set("style", "English, dark country, baritone male voice, fiddle, 86 BPM MOCK-SLOW");
  set("lyrics", "[Verse]\\nTruck won't start till midnight\\nBelt clicks on the empty seat\\n\\n[Chorus]\\nRidin' where the ridge road goes");
  set("lmSeed", "9223372036854775000"); set("soundSeed", "12345"); set("versions", "1"); set("abc", "");
  return true; })()`);
await click("#generateBtn");
const firstBody = await waitFor(`fetch("/mock/requests").then(r => r.json()).then(a => a.filter(x => x.path === "/synth").map(x => x.body)[0] || null)`, 5000);
const req = firstBody ? JSON.parse(firstBody.replace(/("(?:lm_seed|seed)"\s*:\s*)(\d+)/g, '$1"$2"')) : {};
check("request carries the VAE and the sliders", req.vae === "legacy" && JSON.stringify(req.sliders) === '[{"id":"metal","strength":0.6}]', JSON.stringify({ vae: req.vae, sliders: req.sliders }));
check("music seed goes out as the exact 19-digit integer", /"lm_seed":9223372036854775000[,}]/.test(firstBody || ""), (firstBody || "").match(/"lm_seed":[^,]*/)?.[0]);
check("sound seed goes out as an integer", /"seed":12345[,}]/.test(firstBody || ""));
check("output defaults to WAV 24-bit; defaults stay out of the request",
  req.output_format === "wav24" && !("steps" in req) && !("cfg_scale" in req) && !("lm_batch_size" in req) && !("duration" in req) && !("plan_only" in req),
  Object.keys(req).join(","));
check("title, style, lyrics and mode are sent", req.title === "CDP Song" && req.cot === "full" && /MOCK-SLOW/.test(req.style) && /Truck/.test(req.lyrics));
const seenStages = new Set();
let sawMeter = false, sawClock = false, runSeedsText = "", sawRendering = 0;
for (let i = 0; i < 80; i++) {
  const s = await ev(`(() => ({ state: document.getElementById("runState").dataset.s, running: [...document.querySelectorAll("#stages .stage[data-s=running]")].map(e => e.dataset.key),
    meter: !!document.querySelector("#stages .stage[data-s=running] .meter:not(.is-hidden)"), clock: document.getElementById("runClock").textContent,
    status: document.getElementById("statusText").textContent, pillW: Math.round(document.getElementById("statusPill").getBoundingClientRect().width),
    open: !document.getElementById("takeBody").classList.contains("is-hidden") && document.getElementById("chain").hidden }))()`);
  s.running.forEach((k) => seenStages.add(k));
  if (s.status === "Rendering") sawRendering = s.pillW;
  if (!runSeedsText && !s.open) runSeedsText = await ev(`document.getElementById("runSeeds").textContent`);
  if (s.meter) sawMeter = true;
  if (s.clock && s.clock !== "0:00") sawClock = true;
  if (i === 12) await shot("run-progress");
  if (s.open) break;
  await sleep(100);   // the run is sampled every 100 ms until its take opens
}
check("the run shows its stages as they run (score, tokens, sound, decode)", ["score", "tokens", "sound"].every((k) => seenStages.has(k)), [...seenStages].join(" -> "));
check("progress bars and elapsed time move", sawMeter && sawClock);
// HERESY 1111: the player's status is a dot without words (28 px), its words kept for screen readers and the tip
check("  the player bar's status says Rendering while it runs (the dot, the same size)", sawRendering === 28, String(sawRendering));
check("the run shows both seeds", runSeedsText === "music seed 9223372036854775000 · sound seed 12345", runSeedsText);
const opened = await waitFor(`!document.getElementById("takeBody").classList.contains("is-hidden") && document.getElementById("takeTitle").textContent === "CDP Song"`, 15000);
check("when done, the new take opens", !!opened);
await waitFor(`!!document.querySelector('#metaGrid [data-field="VAE"]')`, 3000, 50);
const meta = await ev(`Object.fromEntries([...document.querySelectorAll("#metaGrid [data-field]")].map(d => [d.dataset.field, d.dataset.value]))`);
check("song info: VAE, both seeds, format", meta?.VAE === "Legacy" && meta?.["Music seed"] === "9223372036854775000" && meta?.["Sound seed"] === "12345" && meta?.Format === "WAV 24-bit", JSON.stringify(meta));
const layout = await ev(`(() => { const h = document.getElementById("takeActions");
  return { icons: ["favTake", "renameTake", "deleteTake"].map(id => !!h.querySelector("#" + id)).join(),
    danger: h.querySelector("#deleteTake")?.classList.contains("danger"), eyebrow: document.getElementById("takeEyebrow").textContent,
    groups: [...document.querySelectorAll("#takeTools .tool-cap")].map(e => e.textContent).join(),
    sections: [...document.querySelectorAll("#metaGrid h4")].map(e => e.textContent).join(),
    copies: document.querySelectorAll("#metaGrid .seed-copy").length, oldDelete: document.querySelectorAll("#deleteTake").length }; })()`);
check("header: Favourite, Rename and Delete (red) as icons on the title line", layout.icons === "true,true,true" && layout.danger && layout.oldDelete === 1, JSON.stringify(layout));
check("  the line under the title says age, length and render time, no seed", /long/.test(layout.eyebrow) && /made in/.test(layout.eyebrow) && !/seed/i.test(layout.eyebrow), layout.eyebrow);
check("  the buttons sit in Download, Make again, Edit, Refiner and Files", layout.groups === "Download,Make again,Edit,Refiner,Files", layout.groups);   // HERESY 1356: Edit   // the Refiner room's door
check("  the details are one compact card: Song | Sound | Shape, Sliders | LoRAs, then the seeds with copy buttons, then the medcard (HERESY 1399: Score Planner | Music Tokens | The run)",
  layout.sections === "Song,Sound,Shape,Sliders,LoRAs,Score Planner,Music Tokens,The run" && layout.copies === 2, layout.sections);
check("song info: model from the library entry, no precision row on a new song", meta?.Model === "BF16" && !("Precision" in meta) && !("Score" in meta));
const shapesMeta = await waitFor(`(() => { const m = Object.fromEntries([...document.querySelectorAll("#metaGrid [data-field]")].map(d => [d.dataset.field, d.dataset.value]));
  return m.Composition && m.Composition !== "…" ? m : null; })()`, 5000, 100);
check("song info: Composition, Performance and Style influence as the sliders name them (defaults here)", shapesMeta?.Composition === "default" &&
  shapesMeta?.Performance === "default" && shapesMeta?.["Style influence"] === "default" && !("Guidance" in (shapesMeta || {})),
  JSON.stringify({ c: shapesMeta?.Composition, p: shapesMeta?.Performance, s: shapesMeta?.["Style influence"] }));
// HERESY 1053: the player listens through /library/listen (FLAC), the WAV route when a server has none
check("the player loads the take from the library", !!(await waitFor(`/\\/library\\/(audio|listen)\\?name=/.test(document.getElementById("audio").src)`, 4000, 100)));
const waveInk = await waitFor(`(() => { const c = document.getElementById("wave"), x = c.getContext("2d"), d = x.getImageData(0, 0, c.width, c.height).data;
  let cols = 0; for (let i = 0; i < c.width; i++) { for (let j = 0; j < c.height; j++) { if (d[(j * c.width + i) * 4 + 3] > 0) { cols++; break; } } } return cols > c.width * 0.6 ? cols : 0; })()`, 8000, 250);
check("the waveform is drawn", !!waveInk, `${waveInk} inked columns`);
const firstTake = await ev(`document.querySelector("#libList .take.is-active")?.dataset.name`);
const reqsAfterOpen = await mockGet("mock/requests");
check("  its peaks come from /library/peaks", reqsAfterOpen.some((r) => r.path === "/library/peaks" && r.name === firstTake));
check("  and the audio is not downloaded again to decode it", !reqsAfterOpen.some((r) => r.path === "/library/audio" && !r.range), 
  reqsAfterOpen.filter((r) => r.path === "/library/audio").map((r) => (r.range ? "range" : "full")).join(","));
check("the score of the take shows (staff or ABC)", (await waitFor(`document.getElementById("scoreAbc").textContent.startsWith("X:1")`, 4000)) === true);
await ev(`document.getElementById("scorePanel").open = true; true`);
// HERESY 1168 (Viktor 06.10.2026: «если нет партитуры, нужно прятать все кнопки, которые касаются сессии с готовой партитурой.
// FULL SCREEN, к примеру, не работает… Туда только кнопку "Сгенерить партитуру из звука"»)
const scoreTools = () => ev(`(() => { const p = document.getElementById("scorePanel"), seen = (id) => !!document.getElementById(id).offsetParent;
  return { empty: p.hasAttribute("data-empty"), head: getComputedStyle(p.querySelector(".score-head")).display !== "none", full: seen("staffFull"),
    print: seen("staffPrint"), edit: seen("reuseScore"), fromSound: seen("scoreFromSoundBtn"), paper: seen("scoreStaff") || seen("scoreAbc") }; })()`);
const withScore = await scoreTools();
check("a take with a score: its Score card has the score's tools (print, edit, full screen), and no «write it from the sound»",
  !withScore.empty && withScore.head && withScore.full && withScore.print && withScore.edit && !withScore.fromSound && withScore.paper, JSON.stringify(withScore));
await shot("take-open");
// a narrower window: the details card folds its columns and nothing spills out of it
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
await sleep(400);   // the take column re-lays out and redraws its waveform for the new width
const narrow = await ev(`(() => { const c = document.getElementById("metaGrid"), t = document.getElementById("takeTools"), col = document.getElementById("view-take");
  const spill = [...c.querySelectorAll("dd, dt, h4")].filter(e => e.getBoundingClientRect().right > c.getBoundingClientRect().right + 1).length;
  return { card: Math.round(c.getBoundingClientRect().width), spill, cardScroll: c.scrollWidth - c.clientWidth, toolsScroll: t.scrollWidth - t.clientWidth,
    colScroll: col.scrollWidth - col.clientWidth }; })()`);
check("at 1280 px the details card and the buttons fit their column (nothing spills)", narrow.spill === 0 && narrow.cardScroll <= 0 && narrow.toolsScroll <= 0 && narrow.colScroll <= 0, JSON.stringify(narrow));
await shot("take-open-1280");
await send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 960, deviceScaleFactor: 1, mobile: false });
await sleep(300);   // and back: the layout settles before the keyboard checks
const cdpTake = await ev(`document.querySelector("#libList .take.is-active")?.dataset.name`);

// playback + keyboard
await ev(`document.activeElement && document.activeElement.blur(); document.body.focus(); true`);
await send("Input.dispatchKeyEvent", { type: "keyDown", key: " ", code: "Space", windowsVirtualKeyCode: 32, text: " " });
await send("Input.dispatchKeyEvent", { type: "keyUp", key: " ", code: "Space", windowsVirtualKeyCode: 32 });
const playing = await waitFor(`!document.getElementById("audio").paused`, 3000);
check("Space plays the take", !!playing);
await send("Input.dispatchKeyEvent", { type: "keyDown", key: " ", code: "Space", windowsVirtualKeyCode: 32, text: " " });
await send("Input.dispatchKeyEvent", { type: "keyUp", key: " ", code: "Space", windowsVirtualKeyCode: 32 });
check("Space again pauses", !!(await waitFor(`document.getElementById("audio").paused`, 2000)));

// ============================================================ versions
section("versions and batches");
await mockClear();
const before = await ev(`document.querySelectorAll("#libList .take:not(.is-running-row)").length`);
await ev(`(() => { const set = (id, v) => { document.getElementById(id).value = v; };
  set("title", "Batch Song"); set("style", "German synth pop, 118 BPM"); set("lmSeed", "1000"); set("soundSeed", "");
  set("versions", "6"); set("variations", "2"); set("odeSteps", "8"); set("cfg", "1.2"); document.getElementById("cfg").dataset.touched = "1";
  const f = document.getElementById("outFormat"); f.value = "wav16"; f.dispatchEvent(new Event("change")); return true; })()`);
await click('#sliderActive [data-remove="metal"]');
await click("#generateBtn");
const bodies = await waitFor(`fetch("/mock/requests").then(r => r.json()).then(a => { const b = a.filter(x => x.path === "/synth").map(x => x.body); return b.length >= 2 ? b : null; })`, 6000);
await click("#libList .take:not(.is-running-row)");
const away = await waitFor(`!document.getElementById("backToRun").classList.contains("is-hidden") && /Back to Batch Song/.test(document.getElementById("backToRunLabel").textContent)`, 3000);
check("opening a take during a run offers the way back", !!away);
await click("#backToRun");
check("  Back to the run shows the run again", !!(await waitFor(`!document.getElementById("chain").hidden && document.getElementById("takeTitle").textContent === "Batch Song"`, 3000)));
const parsed = (bodies || []).map((b) => JSON.parse(b.replace(/("(?:lm_seed|seed)"\s*:\s*)(\d+)/g, '$1"$2"')));
// HERESY 1169: the engine says 4 per pass, the mock's 32 GB card holds 3 probes of this length on BF16 (fitBatchFor): 3 + 3
check("6 probes, the card holding 3 at once under the engine's 4, queue two jobs (3 + 3)", parsed.length === 2 && parsed[0].lm_batch_size === 3 && parsed[1].lm_batch_size === 3,
  parsed.map((p) => p.lm_batch_size).join(" + "));
check("the second pass continues the music seeds (1000, 1003)", parsed[0]?.lm_seed === "1000" && parsed[1]?.lm_seed === "1003", parsed.map((p) => p.lm_seed).join(", "));
check("sound variations, steps, format and guidance are sent", parsed.every((p) => p.synth_batch_size === 2 && p.steps === 8 && p.output_format === "wav16" && p.cfg_scale === 1.2),
  JSON.stringify(parsed[0] && { v: parsed[0].synth_batch_size, s: parsed[0].steps, f: parsed[0].output_format, c: parsed[0].cfg_scale }));
const batchDone = await waitFor(`document.querySelectorAll("#libList .take:not(.is-running-row)").length >= ${before + 12} &&
  [...document.querySelectorAll("#libList .take-title")].filter(e => /^Batch Song · v\\d · sound \\d$/.test(e.textContent)).length === 12`, 30000, 250);
const titles = await ev(`[...document.querySelectorAll("#libList .take-title")].map(e => e.textContent).filter(t => t.startsWith("Batch Song")).sort()`);
check("12 takes land, named v1..v6 × sound 1..2", !!batchDone, titles.slice(0, 3).join(" | ") + " … " + titles.slice(-1));
await shot("library-batch");
await ev(`(() => { const set = (id, v) => { document.getElementById(id).value = v; }; set("versions", "1"); set("variations", "1"); set("odeSteps", "32"); set("cfg", "");
  document.getElementById("cfg").dataset.touched = ""; const f = document.getElementById("outFormat"); f.value = "wav24"; f.dispatchEvent(new Event("change")); return true; })()`);

// ======================================================= VAE switch, replays
section("song page: VAE versions and new sound");
await click(`#libList .take[data-name="${cdpTake}"]`);
await waitFor(`document.getElementById("takeTitle").textContent === "CDP Song"`, 4000);
const chips = await ev(`[...document.querySelectorAll("#decodeSwitch .chip")].map(c => c.textContent + (c.classList.contains("is-on") ? "*" : ""))`);
check("VAE row: Legacy playing, + Standard and + Blend offered", JSON.stringify(chips) === '["+ Standard","Legacy*","+ Blend"]', JSON.stringify(chips));
t = await hoverOn('#decodeSwitch [data-add-vae="blend"]');
check("hover + Blend names its repo", t?.on && t.text.includes("Mothersuperior"), t?.text.replace(/\n/g, " | "));
await mockClear();
const parentReq = await ev(`fetch("/library/request?name=${encodeURIComponent(cdpTake)}").then(r => r.text())`);
await click('#decodeSwitch [data-add-vae="standard"]');
const replayBody = await waitFor(`fetch("/mock/requests").then(r => r.json()).then(a => a.filter(x => x.path === "/synth").map(x => x.body)[0] || null)`, 5000);
const rep = replayBody ? JSON.parse(replayBody.replace(/("(?:lm_seed|seed)"\s*:\s*)(\d+)/g, '$1"$2"')) : {};
const par = JSON.parse(parentReq.replace(/("(?:lm_seed|seed)"\s*:\s*)(\d+)/g, '$1"$2"'));
check("+ Standard posts a replay: parent set, VAE changed", rep.parent === cdpTake && rep.vae === "standard", `parent ${rep.parent}, vae ${rep.vae}`);
// HERESY 1168 (Viktor: «должны лишь готовые латенты за 5-7 секунд декодироваться»): a take that kept its latents asks for them
check("  a take that kept its latents asks the engine to decode them again (decode_from), not to render its sound",
  rep.decode_from === cdpTake, `decode_from ${rep.decode_from}`);
check("  same music codes, score and both seeds", rep.semantic_tokens === par.semantic_tokens && rep.abc === par.abc && rep.seed === par.seed && rep.lm_seed === par.lm_seed && rep.lm_batch_size === 1,
  `seed ${rep.seed}/${par.seed}, codes ${String(rep.semantic_tokens).length}`);
const switched = await waitFor(`document.querySelector('#metaGrid [data-field="VAE"]')?.dataset.value === "Standard"`, 10000);
check("when it lands, the page switches to the Standard version", !!switched);
const tipState = `(() => { const t = document.querySelector(".tip");
  if (!t.classList.contains("is-on")) return "off";
  const under = document.elementFromPoint(${lastHover.x}, ${lastHover.y}), target = under && under.closest("[data-tip]");
  return target && target.dataset.tip === t.innerText ? "matches " + target.textContent : "stale: " + t.innerText.split("\\n")[0]; })()`;
await waitFor(`/^(off|matches)/.test(${tipState})`, 2000, 100);   // the page's 500 ms ticker closes a tip whose button went away
const hanging = await ev(tipState);
check("no tip is left describing a button that was repainted away", /^(off|matches)/.test(hanging), hanging);
// the row is painted at the switch and again when the library lands (the new version's own entry, with its seeds): wait for
// that, and say how long the row offered "+ Legacy" instead of playing it
const chipsNow = `[...document.querySelectorAll("#decodeSwitch .chip")].map(c => c.textContent + (c.classList.contains("is-on") ? "*" : "") + (c.dataset.playTake ? "(play)" : ""))`;
const settleT0 = Date.now();
await waitFor(`JSON.stringify(${chipsNow}) === '["Standard*","Legacy(play)","+ Blend"]'`, 5000, 100);
const chips2 = await ev(chipsNow), settled = Date.now() - settleT0;
check("VAE row now plays Legacy from the family", JSON.stringify(chips2) === '["Standard*","Legacy(play)","+ Blend"]' && settled < 2000,
  JSON.stringify(chips2) + ` after ${settled} ms`);
// a take made before takes kept their latents says what its button does: its sound rendered again
// (not Nachtzug: the peaks check below needs one never opened; and back to the version that was open, the family's Standard)
const oldTake = await ev(`[...document.querySelectorAll("#libList .take")].map(e => e.dataset.name).find(n => n && /city-lights|ridge-road/.test(n)) || ""`);
const openNow = await ev(`fetch("/library").then(r => r.json()).then(d => ((d.takes || d).filter(t => t.parent === ${JSON.stringify(cdpTake)} && t.vae === "standard")[0] || {}).name || "")`);
if (oldTake && openNow) {
  await click(`#libList .take[data-name="${oldTake}"]`);
  const oldTip = await waitFor(`document.querySelector("#decodeSwitch [data-add-vae]")?.dataset.tip || null`, 4000);
  check("  a take made before keeps its honest button: «Render this take's sound again… as long as its sound did»",
    /^Render this take's sound again with this VAE: it was made before takes kept their latents/.test(oldTip || ""), String(oldTip).split("\n")[0]);
  await click(`#libList .take[data-name="${openNow}"]`);
  await waitFor(`JSON.stringify(${chipsNow}) === '["Standard*","Legacy(play)","+ Blend"]'`, 4000, 100);
}
await click("#decodeSwitch [data-play-take]");
check("clicking Legacy switches back", !!(await waitFor(`document.querySelector('#metaGrid [data-field="VAE"]')?.dataset.value === "Legacy"`, 3000)));
await mockClear();
await click("#rerenderSound");
const soundBody = await waitFor(`fetch("/mock/requests").then(r => r.json()).then(a => a.filter(x => x.path === "/synth").map(x => x.body)[0] || null)`, 5000);
const snd = soundBody ? JSON.parse(soundBody.replace(/("(?:lm_seed|seed)"\s*:\s*)(\d+)/g, '$1"$2"')) : {};
check("Re-render sound posts a replay: parent set, new sound seed, same codes", snd.parent === cdpTake && snd.seed !== par.seed && /^\d+$/.test(snd.seed || "") &&
  snd.semantic_tokens === par.semantic_tokens && snd.vae === "legacy", `seed ${snd.seed}`);
const soundRow = await waitFor(`document.querySelectorAll("#soundSwitch .chip:not([disabled])").length === 2`, 10000);
check("the new sound lands and a Sound row offers both", !!soundRow);
// HERESY 1169 · 1233 (Viktor 08.10.2026: «после последнего правильного затухания какая-то… хуета выскакивает на 10-15 секунд»)
section("End at…: the same take ending at a chosen moment, faded");
await ev(`document.querySelector('#tabs [data-tab="create"]').click(); true`);
await click(`#libList .take[data-name="${cdpTake}"]`);
await waitFor(`document.getElementById("takeTitle").textContent === "CDP Song"`, 4000);
await mockClear();
await ev(`document.getElementById("endAt").click(); true`);
const endAsk = await waitFor(`(() => { const b = document.querySelector(".hd-back.is-on"), i = b && b.querySelector(".hd-input"); return i ? { text: b.textContent.replace(/\\s+/g, " ").slice(0, 160), ok: b.querySelector(".hd-yes").textContent } : null; })()`, 3000, 50);
await ev(`(() => { const b = document.querySelector(".hd-back.is-on"); b.querySelector(".hd-input").value = "0:04"; b.querySelector(".hd-yes").click(); return true; })()`);
const endBody = await waitFor(`fetch("/mock/requests").then(r => r.json()).then(a => a.filter(x => x.path === "/synth").map(x => x.body)[0] || null)`, 5000);
const endRep = endBody ? JSON.parse(endBody.replace(/("(?:lm_seed|seed)"\s*:\s*)(\d+)/g, '$1"$2"')) : {};
const endCodes = String(endRep.semantic_tokens || "").split(",").filter((t) => t.trim()).length;
check("End at… asks the moment and sends the same take ending there: end_at 4, fade_out 2, its music codes cut at 4 s (100 at 25 a second; the CDP take is 5 s long), from its kept latents (decode_from), parent set, titled «· ends at 0:04»",
  !!endAsk && /^End the take at a moment/.test(endAsk.text) && endAsk.ok === "End it there" && endRep.end_at === 4 && endRep.fade_out === 2 && endCodes === 100 && endRep.duration === 4 &&
  endRep.decode_from === cdpTake && endRep.parent === cdpTake && /· ends at 0:04$/.test(endRep.title || ""), JSON.stringify({ endAsk, end_at: endRep.end_at, fade_out: endRep.fade_out, endCodes, duration: endRep.duration, decode_from: endRep.decode_from, title: endRep.title }));
// HERESY 1169 · 1235 (Viktor 08.10.2026: «первая статичная строка фильтрации... сделай её ахуйной»; «всё, что может быть применено массово, оформи на tracks selection… всё в попап диалоги»)
section("the Librarian: its filter window, the menu on the checked");
// HERESY 1169 · 1241 (Viktor 08.10.2026: «Вижу визуал так же как в попап селектре воркспейса… Идея фильтра SUNO, с чекбоксами, логикой AND, OR, NOR. Фильтр прикрути как кнопку… в самый конец справа»)
await ev(`document.querySelector('#tabs [data-tab="collection"]').click(); true`);
await ev(`(() => { const p = document.querySelector('#collSide [data-place=""]'); if (p) p.click(); return true; })()`);   // All Workspaces (an earlier check may have left the trash open)
await sleep(500);
const fsearch = await ev(`(() => { const s = document.getElementById("collSearch"), cs = getComputedStyle(s), f = document.getElementById("collFilterBtn"), tools = document.getElementById("collHeadTools");
  return { min: cs.minWidth, max: cs.maxWidth, last: tools.lastElementChild === f, barGone: getComputedStyle(document.getElementById("collBar")).display === "none", icon: !!f.querySelector("svg") }; })()`);
await ev(`document.getElementById("collFilterBtn").click(); true`);
const fpop = await waitFor(`(() => { const b = document.querySelector(".hd-back.is-on .hd-pick"); if (!b) return null;
  return { groups: [...b.querySelectorAll(".hd-group")].map(e => e.textContent).join("|"), items: b.querySelectorAll(".hd-check input[type=checkbox]").length,
    icons: [...b.querySelectorAll(".hd-check")].every(r => r.querySelector("svg")), counts: [...b.querySelectorAll(".hd-check .hd-item-note")].every(e => /^\\d+$/.test(e.textContent)),
    logics: [...b.querySelectorAll(".hd-logic-b")].map(e => e.dataset.logic + (e.classList.contains("is-on") ? "*" : "")).join(","), yes: b.querySelector(".hd-yes").textContent }; })()`, 3000, 50);
await ev(`(() => { const b = document.querySelector(".hd-back.is-on .hd-pick"); b.querySelector('input[data-v="generated"]').click(); b.querySelector('input[data-v="__liked"]').click(); b.querySelector('[data-logic="or"]').click(); b.querySelector(".hd-yes").click(); return true; })()`);
await sleep(300);
const fon = await ev(`({ badge: document.getElementById("collFilterN").textContent, on: document.getElementById("collFilterBtn").classList.contains("is-on") })`);
await ev(`document.getElementById("collFilterBtn").click(); true`);
const fre = await waitFor(`(() => { const b = document.querySelector(".hd-back.is-on .hd-pick"); if (!b) return null; return { gen: b.querySelector('input[data-v="generated"]').checked, liked: b.querySelector('input[data-v="__liked"]').checked, logic: (b.querySelector(".hd-logic-b.is-on") || {}).dataset.logic }; })()`, 3000, 50);
await ev(`(() => { const b = document.querySelector(".hd-back.is-on .hd-pick"); b.querySelector(".hd-clear").click(); b.querySelector('[data-logic="and"]').click(); b.querySelector(".hd-yes").click(); return true; })()`);
await sleep(300);
const foff = await ev(`({ hidden: document.getElementById("collFilterN").hidden, on: document.getElementById("collFilterBtn").classList.contains("is-on"), kept: localStorage.getItem("yue2.collLogic") })`);
check("the Librarian's filter is a button at the end of the search row (the search 240–320 px wide, the old row gone): its window holds three groups (made · marked · has), fourteen ticks each with an icon (1368: the protected) and a count of the place, the logic AND · OR · NOR and Show; two ticked with OR show «2 · OR» on the button and come back ticked; Clear and Show take them off",
  fsearch.min === "240px" && fsearch.max === "320px" && fsearch.last && fsearch.barGone && fsearch.icon && !!fpop && fpop.groups === "Made|Marked|Has" && fpop.items === 14 && fpop.icons && fpop.counts &&
  fpop.logics === "and*,or,nor" && /^Show \d+$/.test(fpop.yes) && fon.badge === "2 · OR" && fon.on && !!fre && fre.gen && fre.liked && fre.logic === "or" && foff.hidden && !foff.on && foff.kept === null,
  JSON.stringify({ fre, foff, fon, fpop, fsearch }));
// the mock keeps no collection: two real takes of the Creator's column stand in for the Librarian's checked ones, the menu opened as the Librarian opens it
await ev(`document.querySelector('#tabs [data-tab="create"]').click(); true`);
await sleep(300);
const twoTakes = await ev(`[...document.querySelectorAll("#libList .take[data-name]")].filter(e => !e.classList.contains("is-running-row")).slice(0, 2).map(e => e.dataset.name)`);
await ev(`(() => { const HC = window.HeresyCollection; window.__bk1235 = { sel: HC.selected, row: HC.row, tab: document.body.dataset.tab };
  HC.selected = () => ${JSON.stringify(twoTakes)}; HC.row = (n) => ({ name: n, rating: 0, workspaces: [], hidden: false, derived: [] });
  document.body.dataset.tab = "collection"; return true; })()`);
const menuOnFirst = `(() => { const c = document.querySelector('#libList .take[data-name="${twoTakes[0]}"]');
  c.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 320, clientY: 260 })); return true; })()`;
const pickItem = (label) => ev(`(() => { const b = [...document.querySelectorAll(".hm-menu .hm-item")].find(x => x.querySelector(".hm-label")?.textContent === ${JSON.stringify(label)}); if (!b) return false; b.click(); return true; })()`);
await ev(menuOnFirst);
const bulkMenu = await waitFor(`(() => { const m = document.querySelector(".hm-menu"); if (!m) return null;
  return { head: m.querySelector(".hm-head")?.textContent || "", labels: [...m.querySelectorAll(".hm-item .hm-label")].map(e => e.textContent) }; })()`, 3000, 50);
await mockClear();
await pickItem("Artwork for 2…");
const artAsk = await waitFor(`(() => { const b = document.querySelector(".hd-back.is-on"); return b ? { text: b.textContent.replace(/\\s+/g, " ").slice(0, 120), no: b.querySelector(".hd-no")?.textContent } : null; })()`, 3000, 50);
await ev(`(() => { const b = document.querySelector(".hd-back.is-on .hd-no"); if (b) b.click(); return true; })()`);
await sleep(250);
await ev(menuOnFirst);
await waitFor(`!!document.querySelector(".hm-menu")`, 3000, 50);
await pickItem("Regenerate 2 with new seeds");
const regenAskB = await waitFor(`(() => { const b = document.querySelector(".hd-back.is-on"); return b ? { text: b.textContent.replace(/\\s+/g, " ").slice(0, 120), yes: b.querySelector(".hd-yes")?.textContent } : null; })()`, 3000, 50);
await ev(`(() => { const b = document.querySelector(".hd-back.is-on .hd-no"); if (b) b.click(); return true; })()`);
await sleep(250);
const sentNone = (await mockGet("mock/requests")).filter((r) => /art\/draw|\/regen/.test(r.path || "")).length;
await ev(`(() => { const HC = window.HeresyCollection, b = window.__bk1235; HC.selected = b.sel; HC.row = b.row; document.body.dataset.tab = b.tab; return true; })()`);
check("the menu on a checked card with another checked: «2 checked» on top; Like, Dislike, Favourite, Artwork, Workspaces, Hide and Regenerate for both; artwork for both and regenerating both ask first («Human, … in one volley? Won't your graphics card waste away?»), and «Not now» sends nothing",
  twoTakes.length === 2 && /^2 checked/.test(bulkMenu?.head || "") && ["Like 2", "Dislike 2", "Favourite 2", "Artwork for 2…", "Workspaces of 2", "Hide 2 from the lists", "Regenerate 2 with new seeds"].every((l) => (bulkMenu?.labels || []).includes(l)) &&
  /^Human, artwork for 2 takes in one volley\? Won't your graphics card waste away\?/.test(artAsk?.text || "") && artAsk?.no === "Not now" &&
  /^Human, 2 whole songs made again in one volley\?/.test(regenAskB?.text || "") && regenAskB?.yes === "Regenerate 2" && sentNone === 0,
  JSON.stringify({ twoTakes, head: bulkMenu?.head, labels: bulkMenu?.labels, artAsk, regenAskB, sentNone }));
await ev(`document.querySelector('#tabs [data-tab="create"]').click(); true`);   // back to the Creator after 1235
await sleep(200);
// HERESY 1169 · 1236 (Viktor 08.10.2026: «При клике в плеере на кружок зелёный/красный, при открытом оверлее с активным фреймом композитора пусть переключается во фрейм музыканта»)
section("the player's status dot turns a lifted Compose to the Musician's frame");
await ev(`(() => { const t = document.querySelector('#libList .take[data-name="${cdpTake}"]'); t.click(); return true; })()`);
const pillState = await waitFor(`["playing", "paused"].includes(document.getElementById("statusPill").dataset.s) ? document.getElementById("statusPill").dataset.s : null`, 5000, 100);
await ev(`(() => { if (document.body.dataset.frame !== "compose") document.querySelector('#view-compose .frame-big').click(); return true; })()`);
const pillFrom = await waitFor(`document.body.dataset.frame === "compose" ? "compose" : null`, 3000, 50);
await ev(`document.getElementById("statusPill").click(); true`);
const pillTo = await waitFor(`document.body.dataset.frame === "take" ? "take" : null`, 3000, 50);
await ev(`(() => { if (document.body.dataset.frame) document.querySelector('#view-' + document.body.dataset.frame + ' .frame-big').click(); return true; })()`);
await ev(`(() => { const a = document.getElementById("audio"); a.pause(); return true; })()`);
check("the status dot (playing or paused) clicked while Compose is lifted opens the take and turns the lifted frame to the Musician's",
  !!pillState && pillFrom === "compose" && pillTo === "take", JSON.stringify({ pillState, pillFrom, pillTo }));
await sleep(200);
// HERESY 1169 · 1324 (Viktor's screenshots of SUNO v6, 09.10.2026: its Fade in beside our End at…)
section("Fade in…: the same take whole, its first seconds brought up from silence");
await ev(`document.querySelector('#tabs [data-tab="create"]').click(); true`);
await click(`#libList .take[data-name="${cdpTake}"]`);
await waitFor(`document.getElementById("takeTitle").textContent === "CDP Song"`, 4000);
await mockClear();
await ev(`document.getElementById("fadeIn").click(); true`);
const fiAsk = await waitFor(`(() => { const b = document.querySelector(".hd-back.is-on"), i = b && b.querySelector(".hd-input"); return i ? { text: b.textContent.replace(/\\s+/g, " ").slice(0, 160), ok: b.querySelector(".hd-yes").textContent, value: i.value } : null; })()`, 3000, 50);
await ev(`(() => { const b = document.querySelector(".hd-back.is-on"); b.querySelector(".hd-input").value = "1,5"; b.querySelector(".hd-yes").click(); return true; })()`);
const fiBody = await waitFor(`fetch("/mock/requests").then(r => r.json()).then(a => a.filter(x => x.path === "/synth").map(x => x.body)[0] || null)`, 5000);
const fiRep = fiBody ? JSON.parse(fiBody.replace(/("(?:lm_seed|seed)"\s*:\s*)(\d+)/g, '$1"$2"')) : {};
const fiCodes = String(fiRep.semantic_tokens || "").split(",").filter((t) => t.trim()).length;
check("Fade in… asks the seconds (2 offered) and sends the same take whole with fade_in 1.5 (a comma read as a point), from its kept latents, parent set, titled «· fades in 1.5 s»",
  !!fiAsk && /^Fade the take in/.test(fiAsk.text) && fiAsk.ok === "Fade it in" && fiAsk.value === "2" && fiRep.fade_in === 1.5 && fiCodes >= 120 && !fiRep.end_at &&
  fiRep.decode_from === cdpTake && fiRep.parent === cdpTake && /· fades in 1\.5 s$/.test(fiRep.title || ""), JSON.stringify({ fiAsk, fade_in: fiRep.fade_in, fiCodes, end_at: fiRep.end_at, decode_from: fiRep.decode_from, title: fiRep.title }));
// HERESY 1169 · 1325 (from SUNO v6, TODO.md: «A loop from the song: 1, 2, 4 or 8 bars cut on the score's bar lines, seamless, as a WAV»)
section("Loop…: bars of the take on its score's bar lines, cut by the lab, saved as a WAV named with its bars, tempo and key");
await ev(`document.querySelector('#tabs [data-tab="create"]').click(); true`);
await click(`#libList .take[data-name="${cdpTake}"]`);
await waitFor(`document.getElementById("takeTitle").textContent === "CDP Song"`, 4000);
await ev(`(() => { window.__loop = { urls: [], saved: [] }; window.__loopReal = window.fetch; window.__loopClick = HTMLAnchorElement.prototype.click;
  window.fetch = (u, o) => { if (String(u).startsWith("/lab/loop")) { window.__loop.urls.push(String(u)); return Promise.resolve(new Response(new Blob([new Uint8Array(44)], { type: "audio/wav" }))); } return window.__loopReal(u, o); };
  HTMLAnchorElement.prototype.click = function () { if (this.download) { window.__loop.saved.push(this.download); return; } return window.__loopClick.call(this); };
  document.getElementById("loopTake").click(); return true; })()`);
const lpAsk = await waitFor(`(() => { const b = document.querySelector(".hd-back.is-on"), i = b && b.querySelector(".hd-input"); return i ? { text: b.textContent.replace(/\\s+/g, " ").slice(0, 200), ok: b.querySelector(".hd-yes").textContent, value: i.value } : null; })()`, 4000, 50);
await ev(`(() => { const b = document.querySelector(".hd-back.is-on"); b.querySelector(".hd-input").value = "1"; b.querySelector(".hd-yes").click(); return true; })()`);
const lpOne = await waitFor(`window.__loop.saved.length ? { url: window.__loop.urls[0], file: window.__loop.saved[0] } : null`, 4000, 50);
await waitFor(`!document.getElementById("loopTake").disabled && !document.querySelector(".hd-back.is-on")`, 4000, 50);   // the first one over
await ev(`document.getElementById("loopTake").click(); true`);
await waitFor(`(() => { const b = document.querySelector(".hd-back.is-on"); return !!(b && b.querySelector(".hd-input")); })()`, 4000, 50);
await ev(`(() => { const b = document.querySelector(".hd-back.is-on"); if (!b) return false; b.querySelector(".hd-input").value = "8"; b.querySelector(".hd-yes").click(); return true; })()`);
const lpMany = await waitFor(`(() => { const t = [...document.querySelectorAll("#toasts .toast")].map((x) => x.textContent).filter((x) => /bars from there|ends before/.test(x)); return t.length ? t[t.length - 1] : null; })()`, 4000, 50);
const lpLeft = await ev(`(() => { const o = { urls: window.__loop.urls.length }; window.fetch = window.__loopReal; HTMLAnchorElement.prototype.click = window.__loopClick;
  const b = document.querySelector(".hd-back.is-on:not(.is-leaving)"); if (b) { o.left = b.textContent.slice(0, 80); (b.querySelector(".hd-no") || b.querySelector(".hd-yes")).click(); } return o; })()`);
await waitFor(`!document.getElementById("loopTake").disabled`, 3000, 50);
const lpQ = lpOne ? Object.fromEntries(new URL(lpOne.url, "http://x").searchParams) : {};
check("Loop… asks how many bars from the first (the player elsewhere), 4 offered; 1 bar asks the lab for the take from 0 for one bar's seconds and saves «CDP Song · 1 bar from 0-00 · N BPM · key.wav»",
  !!lpAsk && /^A loop from this take/.test(lpAsk.text) && /\(the first/.test(lpAsk.text) && lpAsk.ok === "Cut the loop" && lpAsk.value === "4" &&
  lpQ.name === cdpTake && +lpQ.start === 0 && +lpQ.seconds > 0.5 && +lpQ.seconds < 5 && /^CDP Song · 1 bar from 0-00 · \d+ BPM · \S+\.wav$/.test(lpOne.file),
  JSON.stringify({ lpAsk, lpOne, lpQ }));
check("  8 bars past the score's end are refused with how many there are, and nothing is asked of the lab",
  !!lpMany && lpLeft.urls === 1 && !lpLeft.left, JSON.stringify({ lpMany, lpLeft }));
await shot("take-versions");
await click(`#libList .take[data-name="${cdpTake}"]`);
await waitFor(`document.getElementById("takeTitle").textContent === "CDP Song"`, 3000);
await click('.frame-big[data-frame="take"]');   // HERESY 1168: Retake from the take's frame over the room…
await click("#retakeTake");
const reused = await waitFor(`!document.getElementById("codesNote").classList.contains("is-hidden") ? { title: document.getElementById("title").value,
  seed: document.getElementById("lmSeed").value, sound: document.getElementById("soundSeed").value, vae: document.querySelector("#decoders input:checked").value,
  note: document.getElementById("codesNoteText").textContent } : null`, 4000);
check("Retake loads its exact request, codes included", reused?.title === "CDP Song" && reused?.seed === "9223372036854775000" && reused?.sound === "12345" &&
  reused?.vae === "legacy" && /same music/.test(reused?.note || ""), JSON.stringify(reused));
check("  HERESY 1168 (Viktor: «Retake — сразу в левый фрейм переносит»): from the take's frame, Retake brings the form's frame over the room",
  (await ev(`document.body.dataset.frame || null`)) === "compose");
await mockClear();
await click("#generateBtn");
const reuseBody = await waitFor(`fetch("/mock/requests").then(r => r.json()).then(a => a.filter(x => x.path === "/synth").map(x => x.body)[0] || null)`, 5000);
check("  Generate then renders those codes again, parent set", !!reuseBody && JSON.parse(reuseBody).semantic_tokens === par.semantic_tokens &&
  JSON.parse(reuseBody).parent === cdpTake);
check("  HERESY 1168 (Viktor: «при начале генерации всё же не нужно схлопывать фрейм… Просто переключаться на правый»): Generate turns it to the take's frame, the run in it, nothing offered to play",
  JSON.stringify(await ev(`[document.body.dataset.frame || null, !document.getElementById("chain").hidden, document.getElementById("playHere").classList.contains("is-hidden")]`)) === '["take",true,true]',
  JSON.stringify(await ev(`[document.body.dataset.frame || null, !document.getElementById("chain").hidden, document.getElementById("playHere").classList.contains("is-hidden")]`)));
await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
await sleep(120);
await waitFor(`document.getElementById("runState").dataset.s === "done" || !document.getElementById("chain").hidden === false`, 8000);
await click("#dropCodes");
check("  Drop codes forgets them", (await ev(`document.getElementById("codesNote").classList.contains("is-hidden")`)) === true);
await waitFor(`!document.querySelector("#libList .is-running-row")`, 8000);
await click(`#libList .take[data-name="${cdpTake}"]`);
await waitFor(`document.getElementById("takeTitle").textContent === "CDP Song"`, 3000);
await ev(`["title", "style", "lyrics", "abc", "lmSeed", "soundSeed"].forEach(id => { document.getElementById(id).value = ""; }); true`);
await click("#reuseTake");
const fresh = await waitFor(`document.getElementById("style").value ? { title: document.getElementById("title").value,
  style: document.getElementById("style").value, lyrics: document.getElementById("lyrics").value, abc: document.getElementById("abc").value,
  seed: document.getElementById("lmSeed").value, sound: document.getElementById("soundSeed").value,
  codes: !document.getElementById("codesNote").classList.contains("is-hidden"), vae: document.querySelector("#decoders input:checked").value,
  sliders: document.querySelectorAll("#sliderActive .slider-row").length } : null`, 4000);
check("Reuse loads the prompt, lyrics and settings with no score, seeds or codes", !!fresh && fresh.title === "CDP Song" &&
  /86 BPM/.test(fresh.style) && /\[Verse\]/.test(fresh.lyrics) && fresh.abc === "" && fresh.seed === "" && fresh.sound === "" && !fresh.codes &&
  fresh.vae === "legacy" && fresh.sliders === 1, JSON.stringify(fresh).slice(0, 200));
await mockClear();
await click("#generateBtn");
const freshBody = await waitFor(`fetch("/mock/requests").then(r => r.json()).then(a => a.filter(x => x.path === "/synth").map(x => JSON.parse(x.body))[0] || null)`, 5000);
check("  Generate then writes new music (no codes, no score, no seeds sent)", !!freshBody && !freshBody.semantic_tokens && !freshBody.abc &&
  freshBody.lm_seed === undefined && freshBody.seed === undefined, JSON.stringify(freshBody && { tokens: !!freshBody.semantic_tokens, abc: !!freshBody.abc, lm: freshBody.lm_seed }));
await waitFor(`!document.querySelector("#libList .is-running-row")`, 8000);

// ======================================================== library actions
section("library");
const libCount = async () => ev(`document.querySelectorAll("#libList .take:not(.is-running-row)").length`);
const serverTakes = async () => (await mockGet("library")).takes;
// a song that just landed reaches the page's list with its next refresh
await waitFor(`fetch("/library").then(r => r.json()).then(l => l.takes.length === document.querySelectorAll("#libList .take:not(.is-running-row)").length)`, 6000, 200);
check("the list matches the server's library", (await libCount()) === (await serverTakes()).length, `${await libCount()} rows`);
await click(`#libList .take[data-name="${cdpTake}"] .take-fav`);
await waitFor(`document.querySelector('#libList .take[data-name="${cdpTake}"]').classList.contains("is-fav")`, 3000);
check("☆ marks a favourite on the server", (await serverTakes()).find((e) => e.name === cdpTake)?.favorite === true);
await click("#favFilter");
check("the favourites filter shows only favourites", (await ev(`[...document.querySelectorAll("#libList .take:not(.is-running-row)")].map(e => e.dataset.name).join()`)) === cdpTake);
// HERESY 1168 (Viktor: «В Takes тоже Favorite звезду переведи в стандартную нашу иконку»)
const favLook = await ev(`(() => { const b = document.getElementById("favFilter"), l = document.querySelector('[data-libf="liked"]'), r = b.getBoundingClientRect(), q = l.getBoundingClientRect();
  return { svg: !!b.querySelector("svg.ui-star"), text: b.textContent.trim(), pressed: b.getAttribute("aria-pressed"), sameSize: Math.abs(r.width - q.width) <= 1 && Math.abs(r.height - q.height) <= 1 }; })()`);
check("  its button is our star, drawn as the thumbs beside it, pressed while it filters", favLook.svg && favLook.text === "" && favLook.pressed === "true" && favLook.sameSize,
  JSON.stringify(favLook));
await click("#favFilter");
await click(`#libList .take[data-name="${cdpTake}"]`);
await click("#renameTake");
await ev(`(() => { const i = document.getElementById("renameInput"); i.value = "Renamed Take"; i.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); return true; })()`);
await waitFor(`document.getElementById("takeTitle").textContent === "Renamed Take"`, 3000);
check("Rename writes the title to the server and the list", (await serverTakes()).find((e) => e.name === cdpTake)?.title === "Renamed Take" &&
  (await ev(`document.querySelector('#libList .take[data-name="${cdpTake}"] .take-title').textContent`)) === "Renamed Take");
const victim = await ev(`[...document.querySelectorAll("#libList .take:not(.is-running-row)")].map(e => e.dataset.name).find(n => n !== "${cdpTake}")`);
const n0 = await libCount();
await click(`#libList .take[data-name="${victim}"] .take-del`);
await answerDialog(true);
await waitFor(`!document.querySelector('#libList .take[data-name="${victim}"]')`, 3000);
check("✕ deletes a take (after the confirm)", (await libCount()) === n0 - 1 && !(await serverTakes()).some((e) => e.name === victim));

// ======================================================= downloads + playback
section("downloads and playback");
const fileTitle = (t) => t.replace(/[\u0000-\u001f\u007f\\/:*?"<>|\s]+/g, " ").replace(/[\s.]+$/, "").trim();
const dl = await ev(`[...document.querySelectorAll("#libList .take:not(.is-running-row)")].map(e => {
  const a = e.querySelector(".take-dl"); return a ? { name: e.dataset.name, title: e.querySelector(".take-title").textContent, href: a.getAttribute("href"),
    file: a.getAttribute("download") } : { name: e.dataset.name }; })`);
check("every library card has a download icon", dl.length > 0 && dl.every((d) => d.href), `${dl.filter((d) => d.href).length}/${dl.length}`);
check("  named after the song (Title.wav), from the library",
  dl.every((d) => d.file === fileTitle(d.title) + ".wav" && d.href === "/library/audio?name=" + encodeURIComponent(d.name)), dl[0] && dl[0].file);
await click(`#libList .take[data-name="${cdpTake}"]`);
await showsTake(cdpTake);
const dlOther = dl.map((d) => d.name).find((n) => n !== cdpTake);
const stay = await ev(`(() => { const stop = (e) => e.preventDefault(); document.addEventListener("click", stop, { capture: true, once: true });
  document.querySelector('#libList .take[data-name="${dlOther}"] .take-dl').click();
  return document.querySelector("#libList .take.is-active")?.dataset.name; })()`);
check("  clicking it downloads instead of opening that take", stay === cdpTake, stay);
const cdpTitle = fileTitle(await ev(`document.querySelector('#libList .take[data-name="${cdpTake}"] .take-title').textContent`));
const names = await ev(`({ page: document.getElementById("dlTakeAudio").getAttribute("download"), pageHref: document.getElementById("dlTakeAudio").getAttribute("href"),
  label: document.getElementById("dlTakeAudio").textContent })`);
check("song page has an Audio download with the same name", names.page === cdpTitle + ".wav" && names.label === "WAV" &&
  /\/library\/audio\?name=/.test(names.pageHref), JSON.stringify(names));
check("  the player bar has no download buttons of its own (the song page has them)", (await ev(`!document.getElementById("dlAudio") && !document.getElementById("dlMp3Bar") &&
  !document.querySelector("#playbar a[download]")`)) === true);
await ev(`localStorage.removeItem("yue2.mp3kbps"); document.getElementById("mp3Rate").value = "320";
  document.getElementById("mp3Rate").dispatchEvent(new Event("change")); true`);
const mp3 = await ev(`({ page: document.getElementById("dlTakeMp3").getAttribute("href"), pageFile: document.getElementById("dlTakeMp3").getAttribute("download"),
  label: document.getElementById("dlTakeMp3").textContent, rate: document.getElementById("mp3Rate").value,
  cards: [...document.querySelectorAll("#libList .take:not(.is-running-row)")].map(e => { const a = e.querySelector(".take-mp3");
    const t = e.querySelector(".take-title").textContent.replace(/[\\u0000-\\u001f\\u007f\\\\/:*?"<>|\\s]+/g, " ").replace(/[\\s.]+$/, "").trim();
    return a ? a.getAttribute("href") === "/library/mp3?name=" + encodeURIComponent(e.dataset.name) + "&kbps=320" && a.getAttribute("download") === t + ".mp3" : false; }) })`);
check("song page has an MP3 download at 320 kbps by default", mp3.page === "/library/mp3?name=" + encodeURIComponent(cdpTake) + "&kbps=320" &&
  mp3.pageFile === cdpTitle + ".mp3" && mp3.label === "MP3" && mp3.rate === "320", JSON.stringify(mp3).slice(0, 200));
check("  every library card has an mp3 chip named after the song", mp3.cards.length > 0 && mp3.cards.every(Boolean), `${mp3.cards.filter(Boolean).length}/${mp3.cards.length}`);
t = await hoverOn("#dlTakeMp3");
check("  (i) tip explains the bitrates", t?.on && /320 kbps/.test(t.text) && /128/.test(t.text), t?.text.slice(0, 80));
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 5, y: 5 });
await ev(`(() => { const s = document.getElementById("mp3Rate"); s.value = "192"; s.dispatchEvent(new Event("change")); return true; })()`);
const mp3b = await ev(`({ page: document.getElementById("dlTakeMp3").getAttribute("href"), label: document.getElementById("dlTakeMp3").textContent,
  saved: localStorage.getItem("yue2.mp3kbps"),
  card: document.querySelector("#libList .take:not(.is-running-row) .take-mp3").getAttribute("href"),
  toasts: [...document.querySelectorAll(".toast")].map(t => t.textContent).join(" | ") })`);
check("choosing 192 kbps moves every MP3 link and is remembered", /kbps=192$/.test(mp3b.page) && mp3b.label === "MP3" &&
  /kbps=192$/.test(mp3b.card) && mp3b.saved === "192" && /MP3 downloads now at 192 kbps/.test(mp3b.toasts), JSON.stringify(mp3b).slice(0, 200));
await mockClear();
const mp3get = await fetch(BASE + mp3b.page.slice(1));
const mp3reqs = (await mockGet("mock/requests")).filter((r) => r.path === "/library/mp3");
check("  the link asks the server for that take at that bitrate", mp3get.status === 200 && mp3get.headers.get("content-type") === "audio/mpeg" &&
  mp3reqs.length === 1 && mp3reqs[0].name === cdpTake && mp3reqs[0].kbps === "192", JSON.stringify(mp3reqs));
await ev(`(() => { const s = document.getElementById("mp3Rate"); s.value = "320"; s.dispatchEvent(new Event("change")); return true; })()`);
const flacLink = await ev(`(() => { const a = document.getElementById("dlTakeFlac"); return { href: a.getAttribute("href"), file: a.getAttribute("download"),
  hidden: a.classList.contains("is-hidden") }; })()`);
check("song page has a FLAC download (lossless, from the WAV)", !flacLink.hidden && flacLink.href === "/library/flac?name=" + encodeURIComponent(cdpTake) &&
  flacLink.file === cdpTitle + ".flac", JSON.stringify(flacLink));
const flacGet = await fetch(BASE + flacLink.href.slice(1));
check("  the server answers with a FLAC file named after the song", flacGet.status === 200 && flacGet.headers.get("content-type") === "audio/flac" &&
  (flacGet.headers.get("content-disposition") || "").includes('filename="' + cdpTitle + '.flac"'), flacGet.headers.get("content-disposition"));
// the Takes menu puts the date back in the names (the library name), and tells the server the same
await click("#libMenuBtn");
await click("#dlNamesDate");
const dated = await ev(`({ on: document.getElementById("dlNamesDate").getAttribute("aria-checked"), page: document.getElementById("dlTakeAudio").getAttribute("download"),
  pageHref: document.getElementById("dlTakeAudio").getAttribute("href"), mp3: document.getElementById("dlTakeMp3").getAttribute("href"),
  mp3File: document.getElementById("dlTakeMp3").getAttribute("download"), flac: document.getElementById("dlTakeFlac").getAttribute("download"),
  card: document.querySelector('#libList .take[data-name="${cdpTake}"] .take-dl').getAttribute("download"), saved: localStorage.getItem("yue2.dlNames") })`);
const datedGet = await fetch(BASE + dated.pageHref.slice(1));
check("the Takes menu can put the date back in download names; the server names them the same",
  dated.on === "true" && dated.page === cdpTake + ".wav" && dated.card === cdpTake + ".wav" && dated.mp3File === cdpTake + ".mp3" &&
  dated.flac === cdpTake + ".flac" && /&names=library/.test(dated.pageHref) && /&names=library/.test(dated.mp3) && dated.saved === "library" &&
  (datedGet.headers.get("content-disposition") || "").includes('filename="' + cdpTake + '.wav"'), JSON.stringify(dated).slice(0, 220));
await click("#libMenuBtn");
await click("#dlNamesDate");
check("  and back to the song's name", (await ev(`document.getElementById("dlTakeAudio").getAttribute("download") === ${JSON.stringify(cdpTitle + ".wav")} &&
  !/names=/.test(document.getElementById("dlTakeAudio").getAttribute("href")) && localStorage.getItem("yue2.dlNames") === null`)) === true);
t = await hoverOn("#dlTakeFlac");
check("  (i) tip says it is lossless", t?.on && /lossless/.test(t.text), t?.text.slice(0, 60));
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 5, y: 5 });

// a song that finishes while another plays must not stop it
await ev(`document.getElementById("audio").pause(); true`);   // nothing plays before Space
await ev(`document.activeElement && document.activeElement.blur(); document.body.focus(); true`);
await send("Input.dispatchKeyEvent", { type: "keyDown", key: " ", code: "Space", windowsVirtualKeyCode: 32, text: " " });
await send("Input.dispatchKeyEvent", { type: "keyUp", key: " ", code: "Space", windowsVirtualKeyCode: 32 });
check("a take is playing", !!(await waitFor(`!document.getElementById("audio").paused`, 3000)));
const playingSrc = await ev(`document.getElementById("audio").src`);
await ev(`(() => { const set = (id, v) => { document.getElementById(id).value = v; };
  set("title", "Keep Playing"); set("style", "English, pop, bright female voice"); set("lyrics", "[Verse]\\nla la la");
  set("lmSeed", ""); set("soundSeed", ""); set("versions", "1"); set("abc", ""); return true; })()`);
await click("#generateBtn");
// open the run while the other song plays: the player's waveform must stay
const waveCols = `(() => { const c = document.getElementById("wave"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  let cols = 0; for (let i = 0; i < c.width; i++) { for (let j = 0; j < c.height; j++) { if (d[(j * c.width + i) * 4 + 3] > 0) { cols++; break; } } } return cols / c.width; })()`;
const wavedBefore = await ev(waveCols);
await waitFor(`!!document.querySelector("#libList .is-running-row")`, 8000, 100);
await click("#libList .is-running-row");
await waitFor(`!document.getElementById("chain").hidden`, 4000, 50);
const wavedDuring = await ev(waveCols);
check("  opening the running song leaves the player's waveform alone", wavedBefore > 0.5 && wavedDuring > 0.5 &&
  !(await ev(`document.getElementById("chain").hidden`)), `${(wavedBefore * 100).toFixed(0)}% -> ${(wavedDuring * 100).toFixed(0)}% of the bar drawn`);
const landed = await waitFor(`fetch("/library").then(r => r.json()).then(l => l.takes.some(t => t.title === "Keep Playing"))`, 30000, 250);
await toastSays("/Keep Playing.*keeps playing/");
const after = await ev(`({ paused: document.getElementById("audio").paused, src: document.getElementById("audio").src,
  toasts: [...document.querySelectorAll(".toast")].map(t => t.textContent).join(" | ") })`);
check("the new song finished and was saved", !!landed);
check("  the playing song kept playing (same audio, not paused)", !after.paused && after.src === playingSrc, after.paused ? "paused" : "playing");
check("  the toast says so", /Keep Playing.*keeps playing/.test(after.toasts), after.toasts.slice(0, 160));
await send("Input.dispatchKeyEvent", { type: "keyDown", key: " ", code: "Space", windowsVirtualKeyCode: 32, text: " " });
await send("Input.dispatchKeyEvent", { type: "keyUp", key: " ", code: "Space", windowsVirtualKeyCode: 32 });
await waitFor(`document.getElementById("audio").paused`, 2000);

// ================================================= browsing while a song plays
section("browsing while a song plays");
await ev(`document.getElementById("audio").pause(); true`);
const rows = await ev(`[...document.querySelectorAll("#libList .take:not(.is-running-row)")].map(e => e.dataset.name)`);
const [songA, songB] = [rows[0], rows[1]];
await click(`#libList .take[data-name="${songA}"]`);
await showsTake(songA);
await ev(`document.activeElement && document.activeElement.blur(); document.body.focus(); true`);
await send("Input.dispatchKeyEvent", { type: "keyDown", key: " ", code: "Space", windowsVirtualKeyCode: 32, text: " " });
await send("Input.dispatchKeyEvent", { type: "keyUp", key: " ", code: "Space", windowsVirtualKeyCode: 32 });
check("song A plays", !!(await waitFor(`!document.getElementById("audio").paused`, 3000)));
const srcA = await ev(`document.getElementById("audio").src`), barA = await ev(`document.getElementById("playbarTitle").textContent`);
t = await hoverOn("#playbarTitle");
check("the player shows just the song's name, and no tip over it (HERESY 1260: its style is on its card, at hand)", (await ev(`!document.getElementById("playbarStyle")`)) === true && !t?.on, t?.text);
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 5, y: 5 });
await click(`#libList .take[data-name="${songB}"]`);
await showsTake(songB);
const browse = await ev(`({ viewing: document.querySelector("#libList .take.is-active")?.dataset.name, playing: !document.getElementById("audio").paused,
  src: document.getElementById("audio").src, bar: document.getElementById("playbarTitle").textContent,
  playHere: !!document.getElementById("playHere") && !document.getElementById("playHere").classList.contains("is-hidden") })`);
check("opening song B shows it on screen", browse.viewing === songB, browse.viewing);
check("  while song A keeps playing (same audio, same playbar title)", browse.playing && browse.src === srcA && browse.bar === barA, browse.playing ? "playing" : "paused");
check("  and song B offers ▶ Play this song", browse.playHere);
const playingCards = () => ev(`[...document.querySelectorAll("#libList .take.is-playing")].filter(c => getComputedStyle(c.querySelector(".playing-tag")).display !== "none").map(c => c.dataset.name)`);
check("  in the list, song A's card says PLAYING and no other does", JSON.stringify(await playingCards()) === JSON.stringify([songA]), JSON.stringify(await playingCards()));
await click("#playHere");
const nowB = await waitFor(`!document.getElementById("audio").paused && document.getElementById("audio").src.includes(${JSON.stringify(encodeURIComponent(songB))})`, 4000);
check("pressing it switches the player to song B", !!nowB);
check("  the status says Playing", !!(await waitFor(`document.getElementById("statusText").textContent === "Playing"`, 2000, 100)));
check("  and the button hides again", (await ev(`document.getElementById("playHere").classList.contains("is-hidden")`)) === true);
check("  PLAYING moves to song B's card", JSON.stringify(await playingCards()) === JSON.stringify([songB]), JSON.stringify(await playingCards()));
await click(`#libList .take[data-name="${songA}"]`);
await showsTake(songA);
check("browsing back to song A leaves song B playing", (await ev(`!document.getElementById("audio").paused && document.getElementById("audio").src.includes(${JSON.stringify(encodeURIComponent(songB))})`)) === true);
// the status pill: Playing, and a click opens the song that plays; back to song A, song B keeps playing
check("  the status says Playing; clicking it opens the playing song", (await ev(`document.getElementById("statusText").textContent`)) === "Playing" &&
  !!(await (async () => { await click("#statusPill"); return waitFor(`document.querySelector("#libList .take.is-active")?.dataset.name === ${JSON.stringify(songB)}`, 3000, 100); })()));
await click(`#libList .take[data-name="${songA}"]`);
await showsTake(songA);
await sleep(200);   // the cards' backgrounds fade (.13 s) before their colours are compared
// the playing card is coloured (tinted card, solid badge), unlike the plain selected card beside it
const looks = await ev(`(() => { const bg = (s) => { const c = document.querySelector(s); return c ? getComputedStyle(c).backgroundColor : ""; };
  return { playing: bg('#libList .take.is-playing'), selected: bg('#libList .take.is-active'), badge: bg('#libList .take.is-playing .playing-tag') }; })()`);
check("  song B's card is coloured, not like the selected card", looks.badge !== "rgba(0, 0, 0, 0)" && looks.playing !== looks.selected && looks.playing !== "rgba(0, 0, 0, 0)", JSON.stringify(looks));
await shot("library-playing");
await send("Input.dispatchKeyEvent", { type: "keyDown", key: " ", code: "Space", windowsVirtualKeyCode: 32, text: " " });
await send("Input.dispatchKeyEvent", { type: "keyUp", key: " ", code: "Space", windowsVirtualKeyCode: 32 });
check("Space still controls the player (pauses song B)", !!(await waitFor(`document.getElementById("audio").paused`, 2000)));
// the pause event reaches the page a beat after the audio reports paused
check("  paused, no card says PLAYING", !!(await waitFor(`document.querySelectorAll("#libList .take.is-playing").length === 0`, 2000, 100)),
  JSON.stringify(await playingCards()));
check("  the status says Paused", (await ev(`document.getElementById("statusText").textContent`)) === "Paused");
// song A is on screen, song B in the player: ▶ Play this song shows, on the left right after the title
const playPlace = await ev(`(() => { const b = document.getElementById("playHere").getBoundingClientRect(), t = document.getElementById("takeTitle").getBoundingClientRect();
  const h = document.querySelector("#view-take > .col-head").getBoundingClientRect(), f = document.getElementById("favTake").getBoundingClientRect();
  return { shown: !document.getElementById("playHere").classList.contains("is-hidden"), left: Math.round(b.left - h.left), above: b.bottom <= t.top + 1,
    row: Math.abs((b.top + b.bottom) / 2 - (f.top + f.bottom) / 2) < 3 && b.right <= f.left }; })()`);
// HERESY 1169 (Viktor: «иконки вверх вровень с full screen кнопкой и выровнять их влево, а ниже… тайтл трека»)
check("▶ Play this song opens the take's first row, its buttons after it, the title under them", playPlace.shown && playPlace.left <= 24 && playPlace.above && playPlace.row,
  JSON.stringify(playPlace));
await shot("play-button");
// a real mouse double-click on song A's card in the list plays it
// (a part of the card that is shown: its style line, or in the Creator's compact cards its title; HERESY 1167)
const songAPart = `([...document.querySelectorAll('#libList .take[data-name="${songA}"] .take-style, #libList .take[data-name="${songA}"] .take-title')]
  .find(e => e.getClientRects().length) || document.querySelector('#libList .take[data-name="${songA}"]'))`;
await ev(`(() => { document.getElementById("toasts").innerHTML = ""; const c = ${songAPart}; c.scrollIntoView({ block: "center", behavior: "instant" }); return true; })()`);
await sleep(300);   // measured after the scroll has settled, then checked: the pointer must land on song A
const cardAt = await ev(`(() => { const c = ${songAPart}; const r = c.getBoundingClientRect();
  const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2), at = document.elementFromPoint(x, y);
  return { x, y, hits: at?.closest(".take")?.dataset.name || "", at: at ? (at.id || at.className || at.tagName) + "" : "" }; })()`);
check("  (the pointer is on song A's card)", cardAt.hits === songA, cardAt.hits || JSON.stringify(cardAt));
for (const clickCount of [1, 2]) {
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: cardAt.x, y: cardAt.y, button: "left", clickCount });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: cardAt.x, y: cardAt.y, button: "left", clickCount });
}
const dblPlays = await waitFor(`!document.getElementById("audio").paused && document.getElementById("audio").src.includes(${JSON.stringify(encodeURIComponent(songA))})`, 4000);
check("double-clicking a song in the list plays it", !!dblPlays, await ev(`document.getElementById("audio").src.split("name=")[1]`));
check("  the play button says Pause while a song plays (for screen readers too)", (await ev(`document.getElementById("playBtn").getAttribute("aria-label") === "Pause" &&
  document.getElementById("playBtn").classList.contains("is-playing")`)) === true);
const bar = await ev(`(() => { const p = document.getElementById("planBtn").getBoundingClientRect(), g = document.getElementById("generateBtn").getBoundingClientRect();
  const n = document.getElementById("submitNote"), v = document.querySelector(".versions").getBoundingClientRect(), bar = document.querySelector(".submit-bar").getBoundingClientRect();
  return { label: document.querySelector(".versions > span").firstChild.textContent.trim(), takesRow: Math.abs((v.top + v.bottom) / 2 - (g.top + g.bottom) / 2) < 3 && v.right <= p.left,
    rightEdge: Math.round(bar.right - g.right),
    plan: Math.round(p.width) + "x" + Math.round(p.height), gen: Math.round(g.width) + "x" + Math.round(g.height), sameRow: Math.abs(p.top - g.top) < 1,
    note: n.textContent, noteShown: getComputedStyle(n).display !== "none" }; })()`);
check("the bottom bar: Probes, Variations and two slim buttons of one size together on the right, no model-loading text", bar.label === "Probes" && bar.plan === bar.gen &&
  /x32$/.test(bar.gen) && bar.sameRow && bar.takesRow && bar.rightEdge <= 1 && !/load/i.test(bar.note), JSON.stringify(bar));
// HERESY 1099: the loud, glossy and novelty themes are gone, the DMM among them (its drawn play button with it)
const dmmGone = await ev(`!document.querySelector('#lookTheme option[value="dmm"], .theme-choice[data-theme-id="dmm"]')`);
check("  the DMM theme is gone with the other loud ones (themes to work in)", dmmGone === true);
const longName = await ev(`(() => { const t = document.getElementById("playbarTitle"), was = t.textContent;
  t.textContent = "In the Air Tonight - Collins cover, slow build, a long title that needs two lines";
  const cs = getComputedStyle(t), lines = Math.round(t.getBoundingClientRect().height / parseFloat(cs.lineHeight));
  const out = { lines, size: cs.fontSize, clamp: cs.webkitLineClamp, fits: t.scrollWidth <= t.clientWidth + 1 }; t.textContent = was; return out; })()`);
// HERESY 1106, 1111: the player's title keeps its size and wraps at two lines
check("a long song name wraps in the player (two lines at most) instead of being cut off", longName.lines >= 1 && longName.lines <= 2 && longName.clamp === "2" && longName.fits,
  JSON.stringify(longName));
check("  its card says PLAYING, and the page shows it with no Play button", JSON.stringify(await playingCards()) === JSON.stringify([songA]) &&
  (await ev(`document.getElementById("playHere").classList.contains("is-hidden") && document.getElementById("renameInput") === null`)) === true,
  JSON.stringify(await playingCards()));
await ev(`document.getElementById("audio").pause(); true`);
await click(`#libList .take[data-name="${songB}"]`);
await showsTake(songB);


// ================================================================= plan
section("plan score only");
await mockClear();
await ev(`(() => { document.getElementById("abc").value = ""; document.getElementById("lmSeed").value = ""; document.getElementById("title").value = "Planned";
  document.querySelector('#modes input[value="melody"]').click(); return true; })()`);
await click("#planBtn");
const planBody = await waitFor(`fetch("/mock/requests").then(r => r.json()).then(a => a.filter(x => x.path === "/synth").map(x => x.body)[0] || null)`, 5000);
check("Plan score only sends plan_only", /"plan_only":true/.test(planBody || "") && /"cot":"melody"/.test(planBody || ""));
const planned = await waitFor(`document.getElementById("abc").value.startsWith("X:1") && document.getElementById("scoreDrawer").open`, 8000);
check("the planned score fills Supply your own score", !!planned);
check("  the music seed field takes the resolved seed", /^\d{6,}$/.test(await ev(`document.getElementById("lmSeed").value`)));
check("  the plan's score shows in the take column", (await ev(`!document.getElementById("takeBody").classList.contains("is-hidden") && document.getElementById("scoreAbc").textContent.startsWith("X:1")`)) === true);
const planStages = await ev(`[...document.querySelectorAll("#stages .stage")].map(e => e.dataset.key + ":" + e.dataset.s).join()`);
check("  only the score stage runs; music, sound and decode are skipped", planStages === "score:completed,tokens:skipped,sound:skipped,decode:skipped", planStages);
check("  no stage shows a negative time", !/-\d/.test(await ev(`document.getElementById("stages").innerText`)));
await shot("plan");
await ev(`document.getElementById("title").value = "From Plan"; true`);
await click("#generateBtn");
await waitFor(`document.getElementById("takeTitle").textContent === "From Plan" && !document.getElementById("takeBody").classList.contains("is-hidden")`, 12000);
const planMeta = await ev(`Object.fromEntries([...document.querySelectorAll("#metaGrid [data-field]")].map(d => [d.dataset.field, d.dataset.value]))`);
check("a song rendered from the planned score says Score: supplied", planMeta?.Score === "supplied", JSON.stringify(planMeta));
await fetch(BASE + "mock/flags", { method: "POST", body: JSON.stringify({ peaks: false }) });
await mockClear();
const other = await ev(`[...document.querySelectorAll("#libList .take:not(.is-running-row)")].map(e => e.dataset.name).find(n => /nachtzug/.test(n))`);
await click(`#libList .take[data-name="${other}"]`);
await waitFor(`document.getElementById("takeTitle").textContent === "Nachtzug"`, 4000);
const decodeReq = (r) => (r.path === "/library/audio" || r.path === "/library/listen") && !r.range;   // HERESY 1053: either route
for (let i = 0; i < 40 && !(await mockGet("mock/requests")).some(decodeReq); i++) await sleep(200);
const fallbackInk = await waitFor(`(() => { const c = document.getElementById("wave"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  let cols = 0; for (let i = 0; i < c.width; i++) { for (let j = 0; j < c.height; j++) { if (d[(j * c.width + i) * 4 + 3] > 0) { cols++; break; } } } return cols > c.width * 0.6; })()`, 8000, 250);
const fb = await mockGet("mock/requests");
check("peaks route failing: the browser decodes the audio instead", !!fallbackInk && fb.some((r) => r.path === "/library/peaks") && fb.some(decodeReq),
  JSON.stringify({ other, ink: fallbackInk, reqs: fb.map((r) => r.path + (/^\/library\/(audio|listen)$/.test(r.path) ? (r.range ? ":range" : ":full") : "")) }));
await fetch(BASE + "mock/flags", { method: "POST", body: JSON.stringify({ peaks: true }) });
// HERESY 1168: the take in hand is the demo's Direct one, with no score (opened here so as not to warm its peaks before)
await ev(`document.getElementById("scorePanel").open = true; true`);
const noScore = await waitFor(`document.getElementById("scorePanel").hasAttribute("data-empty")`, 4000) ? await scoreTools() : null;
check("a Direct take with no score yet: its Score card holds the one button that writes it from the sound; no print, edit, full screen, nor the sheet of the score before",
  !!noScore && noScore.empty && !noScore.head && !noScore.full && !noScore.print && !noScore.edit && noScore.fromSound && !noScore.paper, JSON.stringify(noScore));

// ========================================================= transcription
section("transcription");
const setFile = (name, kind) => ev(`(() => {
  const rate = 8000, n = rate * 2, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); w(8, "WAVE"); w(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.round(Math.sin(i / 8) * 8000), true);
  const bytes = ${JSON.stringify(kind)} === "junk" ? new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]) : new Uint8Array(buf);
  const dt = new DataTransfer(); dt.items.add(new File([bytes], ${JSON.stringify(name)}, { type: "audio/wav" }));
  const input = document.getElementById("coverFile"); input.files = dt.files; input.dispatchEvent(new Event("change")); return input.files.length; })()`);
await ev(`document.getElementById("coverDrawer").open = true; document.getElementById("abc").value = ""; true`);
await mockClear();
const listenOff = await ev(`document.getElementById("coverListen").disabled`);
await setFile("tune.wav", "wav");
const listen = await ev(`(async () => { const b = document.getElementById("coverListen"), t = document.getElementById("coverFromAudio"), main = document.getElementById("audio");
  const size = [b, t].map(x => Math.round(x.offsetWidth) + "x" + Math.round(x.offsetHeight)).join();
  const before = { off: b.disabled, label: b.textContent };
  b.click(); await new Promise(r => setTimeout(r, 700));
  const playing = { pressed: b.getAttribute("aria-pressed"), label: b.textContent, mainPaused: main.paused };
  b.click(); await new Promise(r => setTimeout(r, 150));
  return { size, before, playing, after: b.textContent }; })()`);
check("a chosen recording can be listened to: ▶ Listen beside Transcribe, the same size", listenOff === true && !listen.before.off && listen.before.label === "▶ Listen" &&
  listen.size === "172x30,172x30", JSON.stringify(listen));
check("  playing shows ❚❚ and the time, pauses the player at the bottom; a second click stops it", listen.playing.pressed === "true" &&
  /^❚❚ 0:0\d \/ 0:02$/.test(listen.playing.label) && listen.playing.mainPaused && listen.after === "▶ Listen", JSON.stringify(listen.playing) + " then " + listen.after);
await ev(`(() => { const s = document.getElementById("coverTask"); s.value = "melody-vocal"; return true; })()`);
await click("#coverFromAudio");
const vocal = await waitFor(`document.getElementById("abc").value.startsWith("X:1") ? document.getElementById("abc").value : null`, 10000);
const tx = (await mockGet("mock/requests")).filter((r) => r.path === "/transcribe");
check("Vocal melody only posts audio with melody_only", tx.length === 1 && tx[0].fields.includes("audio") && tx[0].fields.includes("melody_only"), JSON.stringify(tx[0]));
check("  and keeps only the Vocal voice, without chords", !!vocal && /V: Vocal/.test(vocal) && !/V: Ins/.test(vocal) && !/"[A-G][^"]*"/.test(vocal), (vocal || "").split("\n").slice(5, 9).join(" / "));
check("  the mode switches to Melody only", (await ev(`document.querySelector('#modes input:checked').value`)) === "melody");
await mockClear();
await ev(`document.getElementById("abc").value = ""; document.getElementById("coverTask").value = "full"; true`);
await click("#coverFromAudio");
const full = await waitFor(`document.getElementById("abc").value.startsWith("X:1") ? document.getElementById("abc").value : null`, 10000);
const tx2 = (await mockGet("mock/requests")).filter((r) => r.path === "/transcribe");
check("Melody and chords sends no melody_only and keeps chords and both voices", tx2.length === 1 && !tx2[0].fields.includes("melody_only") &&
  !!full && /"D"/.test(full) && /V: Ins/.test(full));
check("  the mode switches to Full plan", (await ev(`document.querySelector('#modes input:checked').value`)) === "full");
await setFile("broken.ogg", "junk");
await click("#coverFromAudio");
const bad = await waitFor(`/Convert it to WAV or MP3/.test(document.getElementById("coverAudioStatus").textContent)`, 5000);
await ev(`document.getElementById("coverAudioStatus").scrollIntoView({ block: "center" }); true`);
check("a file the browser cannot read gets a plain message", !!bad, await ev(`document.getElementById("coverAudioStatus").textContent`));
await shot("transcription");

// ============================================================ cancel + fail
section("queued, cancel and failure");
await ev(`window.RuachChime.rung.length = 0; true`);   // HERESY 1275: what this section's runs sound
await ev(`(() => { const set = (id, v) => { document.getElementById(id).value = v; }; set("title", "Cancel Me"); set("abc", ""); set("lmSeed", ""); set("soundSeed", "");
  set("style", "slow test MOCK-SLOW"); document.querySelector('#modes input[value="full"]').click(); return true; })()`);
await click("#generateBtn");
await waitFor(`document.getElementById("runState").dataset.s === "running"`, 5000);
await ev(`(() => { document.getElementById("title").value = "Queued Me"; document.getElementById("style").value = "folk"; return true; })()`);
await click("#generateBtn");
const queued = await waitFor(`document.getElementById("takeTitle").textContent === "Queued Me" && document.getElementById("runState").dataset.s === "queued" &&
  document.getElementById("runState").textContent === "Queued" ? document.getElementById("takeEyebrow").textContent : null`, 5000);
check("a run behind another shows as queued", queued === "waiting behind Cancel Me", queued);
const queuedSeeds = await waitFor(`/^music seed \\d{6,} · sound seed \\d{6,}$/.test(document.getElementById("runSeeds").textContent) ? document.getElementById("runSeeds").textContent : null`, 4000);
check("  its seeds come from the job status while it waits", !!queuedSeeds, queuedSeeds);
await shot("run-queued");
await click("#cancelRun");                                  // flags the waiting job
// HERESY 1410 (Viktor 13.10.2026: «Для `Cancel run` добавь диалоговое окно»): asked first, the run named; «Keep it running» keeps it
const cancelAsk = await waitFor(`(() => { const b = document.querySelector(".hd-back.is-on:not(.is-leaving)"); return b && b.querySelector(".hd-yes") ? b.textContent : null; })()`, 3000, 50);
await answerDialog(false);
const keptQueued = await waitFor(`document.getElementById("runState").dataset.s === "queued"`, 2000);
check("Cancel run asks first, the run named; «Keep it running» keeps it", /Cancel this run\?/.test(cancelAsk || "") && /Queued Me/.test(cancelAsk || "") &&
  /Keep it running/.test(cancelAsk || "") && !!keptQueued, cancelAsk);
await click("#cancelRun");
await answerDialog(true);
await click('#libList .is-running-row');                    // the running one is listed first
await waitFor(`document.getElementById("takeTitle").textContent === "Cancel Me" && document.getElementById("runState").dataset.s === "running"`, 4000);
await click("#cancelRun");
await answerDialog(true);
check("Cancel run stops the running job", !!(await waitFor(`document.getElementById("runState").dataset.s === "cancelled"`, 8000)));
check("  and the cancelled queued job never runs", !!(await waitFor(`!document.querySelector("#libList .is-running-row") &&
  ![...document.querySelectorAll("#libList .take-title")].some(e => e.textContent === "Queued Me")`, 8000)));
await ev(`document.getElementById("style").value = "fail test MOCK-FAIL"; document.getElementById("title").value = "Fail Me"; true`);
await click("#generateBtn");
const failedRun = await waitFor(`document.getElementById("runState").dataset.s === "failed" && !document.getElementById("runError").classList.contains("is-hidden")`, 10000);
check("a failed run shows the server's error", !!failedRun, await ev(`document.getElementById("runError").textContent`));
const chimeFail = await waitFor(`window.RuachChime.rung.join() === "failed" ? "failed" : null`, 3000, 50);
check("  two notes down say so (1275: a sound when a run ends); the cancelled runs made none", chimeFail === "failed", await ev(`window.RuachChime.rung.join()`));
// HERESY 1168 (Viktor: «Когда идёт генерация, счётчик тикает, но стоит во время генерации нажать F5, счётчик времени обнуляется»)
// «Play new takes» on by its own button: the page's settings mirror keeps it through the reload (localStorage alone does not)
await ev(`(() => { document.getElementById("audio").pause(); const b = document.getElementById("playNew"); if (b.getAttribute("aria-pressed") !== "true") b.click();
  document.getElementById("style").value = "hold test MOCK-HOLD"; document.getElementById("title").value = "Hold Me"; return true; })()`);
await sleep(500);   // the settings file hears of it (a fifth of a second)
await click("#generateBtn");
await waitFor(`document.getElementById("runState").dataset.s === "running" && document.getElementById("takeTitle").textContent === "Hold Me"`, 6000);
// the clock read once it shows three seconds (a fixed sleep read 0:02 on a busy machine, 07.10.2026)
const clockBefore = await waitFor(`(() => { const t = document.getElementById("runClock").textContent, m = /(\\d+):(\\d\\d)/.exec(t || "");
  return m && +m[1] * 60 + +m[2] >= 3 ? t : null; })()`, 9000, 100);
// a plain reload, as Viktor's F5 (the suite's boot() turns Play new takes off for the Kit's own checks)
await ev(`window.__stale = true`);
await send("Page.reload", {});
await waitFor(`!window.__stale && document.readyState === "complete" && document.querySelectorAll("#decoders input").length === 3`, 30000);
const clockAfter = await waitFor(`document.getElementById("runState").dataset.s === "running" && document.getElementById("takeTitle").textContent === "Hold Me" ? document.getElementById("runClock").textContent : null`, 8000, 100);
const clockSecs = (t) => { const m = /(\d+):(\d\d)/.exec(t || ""); return m ? +m[1] * 60 + +m[2] : -1; };
check("F5 during a run: its clock goes on from where it was, not from 0:00", clockSecs(clockBefore) >= 3 && clockSecs(clockAfter) >= clockSecs(clockBefore) && !/~/.test(clockAfter || ""),
  JSON.stringify({ clockBefore, clockAfter }));
// HERESY 1168 (Viktor: «Play new takes вроде бы как перестал работать»): brought back by the F5, it is still this page's run
const heldPlays = await waitFor(`!document.getElementById("audio").paused && /hold-me/.test(document.getElementById("audio").src)`, 40000, 250);
check("  and when it is done it plays (Play new takes), as a run that never saw an F5", !!heldPlays,
  await ev(`JSON.stringify({ s: document.getElementById("runState").dataset.s, title: document.getElementById("takeTitle").textContent, paused: document.getElementById("audio").paused,
    src: (document.getElementById("audio").src || "").slice(-44), playNew: localStorage.getItem("yue2.playNew"), toasts: [...document.querySelectorAll(".toast")].map(t => t.textContent.slice(0, 50)) })`));
check("  and no sound over it: the new song itself is heard (1275)", (await ev(`window.RuachChime.rung.join()`)) === "", await ev(`window.RuachChime.rung.join()`));
await ev(`document.getElementById("audio").pause(); true`);
await shot("run-failed");

// ====================================================== engine settings
section("engine settings, presets and hardware");
await ev(`document.getElementById("view-engine").classList.remove("is-hidden"); window.scrollTo(0, 0); true`);
const settingsForm = `({ models: [...document.getElementById("setModel").options].map(o => o.value).join(), model: document.getElementById("setModel").value,
  ctx: document.getElementById("setMaxSeq").value, keep: document.getElementById("setKeepLoaded").checked, vae: document.getElementById("setVaeCore").value,
  preset: document.getElementById("memPreset").value })`;
const f0 = await ev(settingsForm);
check("Compute card shows /settings (models, context, keep loaded, VAE tiles)", f0.models === "BF16,Q8_0" && f0.model === "BF16" && f0.ctx === "0" &&
  f0.keep === false && f0.vae === "512" && f0.preset === "manual", JSON.stringify(f0));   // HERESY 1071: Auto or Manual; a new profile has not chosen Auto
// an older page or settings.json may still send "precision": ignored, like any unknown key
const stale = await fetch(BASE + "settings", { method: "POST", body: JSON.stringify({ precision: "f32" }) });
const staleSettings = await mockGet("settings");
check("a stale precision from an older page is ignored (no error, not stored)", stale.ok && !("precision" in staleSettings), JSON.stringify(staleSettings));
check("  the top bar has no precision next to the backbone", !/Precision/.test(await ev(`document.getElementById("hwStats").innerText`)));
// HERESY 1017, 1119, 1121: the bar is the studio's own: the logo, the rooms first, the workspace in hand, then the engine's lamp
// (plain, not a link); the GPU readout and the Model menu sit under ⋯ (More)
const topbarNow = await ev(`(() => { const kids = [...document.querySelector(".topbar, header").children].map(e => e.id || e.classList[0] || e.tagName);
  const chip = document.querySelector(".engine-chip");
  return { order: kids.join(" "), roomsFirst: kids[0] === "brand" && kids[1] === "tabs", lampAfterWs: kids.indexOf("engine-chip") === kids.indexOf("ws-current") + 1,
    chipPlain: chip.tagName === "DIV" && !chip.closest("a"), logo: !!document.querySelector(".brand svg"),
    inMore: !!document.getElementById("hwStats").closest("#headMorePop") && !!document.getElementById("modelPick").closest("#headMorePop") }; })()`);
check("top bar: the logo, the rooms first, the workspace in hand, the engine's lamp right after it (plain, not a link)",
  topbarNow.roomsFirst && topbarNow.lampAfterWs && topbarNow.chipPlain && topbarNow.logo, JSON.stringify(topbarNow));
const strip = await ev(`document.getElementById("hwStats").textContent.replace(/\\s+/g, " ").trim()`);
const stripTip = await ev(`document.getElementById("hwStats").dataset.tip`);
check("  under ⋯ it reads the GPU and its memory from /hardware, beside the Model menu; the rest is in its tip", topbarNow.inMore &&
  /Mock GPU/.test(strip) && /\d+\.\d \/ 31\.8 GB/.test(strip) && /Mock GPU \(32 GB\) · backbone BF16 · context whole · batch 4/.test(stripTip), strip + " | " + stripTip);
check("Unload model is off while nothing is loaded", (await ev(`document.getElementById("unloadModel").disabled && document.getElementById("unloadNow").disabled`)) === true);
t = await hoverOn('[data-tip-ref="tip-model"]');
check("(i) beside Model explains BF16 and the quantized copies", t?.on && /BF16/.test(t.text) && /quantized/.test(t.text));
t = await hoverOn('[data-tip-ref="tip-keep"]');
check("(i) beside Keep loaded explains on and off", t?.on && /Off/.test(t.text) && /On/.test(t.text));
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 5, y: 5 });
await mockClear();
// HERESY 1071: Auto fits the context and the VAE tiles to the GPU the server found (32 GB here: whole, 1024); the backbone and
// Keep loaded stay yours
await ev(`(() => { const p = document.getElementById("memPreset"); p.value = "auto"; p.dispatchEvent(new Event("change")); return true; })()`);
const fa = await ev(settingsForm);
check("Auto fills the knobs for the GPU found: whole context, VAE tiles 1024; the backbone and Keep loaded stay", fa.model === "BF16" && fa.ctx === "0" &&
  fa.keep === false && fa.vae === "1024" && fa.preset === "auto", JSON.stringify(fa));
check("  a preset only fills the form (nothing sent yet)", (await mockGet("mock/requests")).filter((r) => r.path === "/settings").length === 0);
await click("#saveSettings");
await waitFor(`/Saved/.test([...document.querySelectorAll(".toast")].map(t => t.textContent).join())`, 5000);
const sa = await mockGet("settings");
check("Save posts /settings and the server takes it", sa.model === "BF16" && sa.max_seq === 0 && sa.vae_core === 1024 && sa.keep_loaded === false, JSON.stringify(sa));
await mockClear();
await ev(`(() => { const m = document.getElementById("setModel"); m.value = "Q8_0"; m.dispatchEvent(new Event("change"));
  const i = document.getElementById("setMaxSeq"); i.value = "12288"; i.dispatchEvent(new Event("input")); return true; })()`);
check("  a knob moved by hand makes it Manual", (await ev(`document.getElementById("memPreset").value`)) === "manual");
await click("#saveSettings");
await waitFor(`(async () => (await (await fetch("/settings")).json()).model === "Q8_0")()`, 5000);
check("  the top bar's tip follows (backbone, context)", !!(await waitFor(`/backbone Q8_0/.test(document.getElementById("hwStats").dataset.tip) &&
  /context 12,288/.test(document.getElementById("hwStats").dataset.tip)`, 12000, 250)));
await mockClear();
await ev(`(() => { const i = document.getElementById("setMaxSeq"); i.value = "1000"; i.dispatchEvent(new Event("input")); return true; })()`);
await waitFor(`!document.getElementById("saveSettings").disabled`, 3000, 100);
await click("#saveSettings");
// the refusal is a toast, not a request: wait for it rather than a fixed pause
await waitFor(`[...document.querySelectorAll(".toast")].some(t => /Context size must be/.test(t.textContent))`, 3000, 100);
const ctxReqs = (await mockGet("mock/requests")).filter((r) => r.path === "/settings");
const ctxToasts = await ev(`[...document.querySelectorAll(".toast")].map(t => t.textContent).join(" | ")`);
check("a context outside 0 or 4,096..24,576 is refused before sending", ctxReqs.length === 0 && /Context size must be/.test(ctxToasts),
  `${ctxReqs.length} posts ${JSON.stringify(ctxReqs.map((r) => r.body))} · toasts: ${ctxToasts.slice(-200)}`);
await ev(`(() => { const set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event(e.tagName === "SELECT" ? "change" : "input")); };
  set("setModel", "BF16"); set("setMaxSeq", "0"); const k = document.getElementById("setKeepLoaded"); k.checked = true; k.dispatchEvent(new Event("change")); return true; })()`);
await click("#saveSettings");
await waitFor(`(async () => (await (await fetch("/settings")).json()).keep_loaded)()`, 5000);
const sk = await mockGet("settings");
check("Keep loaded, the whole context and BF16 by hand: the server keeps the models loaded", sk.keep_loaded === true && sk.max_seq === 0 && sk.model === "BF16",
  JSON.stringify(sk));
await shot("engine-settings");
await ev(`document.getElementById("view-engine").classList.add("is-hidden"); (() => { const set = (id, v) => { document.getElementById(id).value = v; };
  set("title", "Keep Song"); set("style", "folk, 90 BPM"); set("abc", ""); set("lmSeed", ""); set("soundSeed", ""); set("versions", "1"); return true; })()`);
await click("#generateBtn");
await waitFor(`document.getElementById("takeTitle").textContent === "Keep Song" && !document.getElementById("takeBody").classList.contains("is-hidden")`, 12000);
const resident = await waitFor(`!document.getElementById("unloadModel").disabled && /resident/.test(document.getElementById("engineDetail").textContent)`, 8000, 250);
check("with keep loaded on, the models stay after the song: Unload model lights up", !!resident, await ev(`document.getElementById("engineDetail").textContent`));
const keepMeta = await ev(`Object.fromEntries([...document.querySelectorAll("#metaGrid [data-field]")].map(d => [d.dataset.field, d.dataset.value]))`);
check("a new song has no precision row", !("Precision" in (keepMeta || {})) && keepMeta?.Model === "BF16", JSON.stringify({ p: keepMeta?.Precision, m: keepMeta?.Model }));
const hwLoaded = await ev(`[...document.querySelectorAll("#hwCard div")].map(d => d.innerText.replace(/\\s+/g, " ")).find(t => /^Loaded/.test(t))`);
check("  the Hardware card shows the BF16 models loaded (about 7.5 GB)", /^Loaded\s*[67]\.\d GB/.test(hwLoaded || ""), hwLoaded);
// a song made while the F32 option existed still says so: copy this song as an old F32 one, in the mock's own
// library folder (the mock says where it is: an already running one, named on the command line, may keep it elsewhere)
const mockInfo = await fetch(BASE + "mock/info").then((r) => (r.ok ? r.json() : null)).catch(() => null);
const libDir = mockInfo?.outputs ? resolve(ROOT, mockInfo.outputs) : null;
const keepDir = (await mockGet("library")).takes.map((e) => e.name).find((n) => /keep-song/.test(n));
if (!libDir || !keepDir || !existsSync(libDir + "/" + keepDir + "/meta.json")) {
  skip("an older song made in F32 still says so, and its moved sliders read back", libDir ? `no Keep Song take in ${mockInfo.outputs}` :
    "the mock does not say where its library is (GET /mock/info)");
} else {
  const oldDir = libDir + "/19990101-000000-old-f32-song";
  cpSync(libDir + "/" + keepDir, oldDir, { recursive: true });
  writeFileSync(oldDir + "/meta.json", JSON.stringify({ ...JSON.parse(readFileSync(oldDir + "/meta.json", "utf8")), title: "Old F32 Song", precision: "f32" }));
  // and a saved request with the sliders moved: Composition at "highest", Performance tuned by hand, Style influence at "highest"
  // (HERESY 1031: the sliders re-centred on Viktor's stable set, so "highest" is 1.15 · 0.97 · 80 and guidance 2.0)
  writeFileSync(oldDir + "/request.json", JSON.stringify({ ...JSON.parse(readFileSync(oldDir + "/request.json", "utf8")), cfg_scale: 2.0,
    abc_sampling: { temperature: 1.15, top_p: 0.97, top_k: 80 }, semantic_sampling: { temperature: 0.97, top_p: 0.95, top_k: 100 } }));
  await ev(`document.getElementById("refreshLib").click(); true`);
  await waitFor(`!!document.querySelector('#libList .take[data-name="19990101-000000-old-f32-song"]')`, 5000);
  await click('#libList .take[data-name="19990101-000000-old-f32-song"]');
  await waitFor(`document.getElementById("takeTitle").textContent === "Old F32 Song"`, 5000);
  const oldMeta = await ev(`Object.fromEntries([...document.querySelectorAll("#metaGrid [data-field]")].map(d => [d.dataset.field, d.dataset.value]))`);
  check("  an older song made in F32 still says so (the option since removed)", oldMeta?.Precision === "F32 (option since removed)", JSON.stringify(oldMeta?.Precision));
  const oldShapes = await waitFor(`(() => { const m = Object.fromEntries([...document.querySelectorAll("#metaGrid [data-field]")].map(d => [d.dataset.field, d.dataset.value]));
    return m.Composition && m.Composition !== "…" ? m : null; })()`, 5000, 100);
  check("  moved sliders: Composition highest, Performance custom with its values, Style influence highest", oldShapes?.Composition === "highest" &&
    oldShapes?.Performance === "custom: temperature 0.97 · top-p 0.95 · top-k 100" && oldShapes?.["Style influence"] === "highest",
    JSON.stringify({ c: oldShapes?.Composition, p: oldShapes?.Performance, s: oldShapes?.["Style influence"] }));
  rmSync(oldDir, { recursive: true, force: true });
  await ev(`document.getElementById("refreshLib").click(); true`);
  await waitFor(`!document.querySelector('#libList .take[data-name="19990101-000000-old-f32-song"]')`, 5000);
}
await mockClear();
await click("#unloadModel");
const unloaded = await waitFor(`/Model unloaded — [\\d,]+ MB freed/.test([...document.querySelectorAll(".toast")].map(t => t.textContent).join())`, 6000);
check("Unload model posts /unload and says how much it freed", !!unloaded && (await mockGet("mock/requests")).some((r) => r.path === "/unload"),
  await ev(`[...document.querySelectorAll(".toast")].map(t => t.textContent).filter(t => /unloaded/.test(t)).pop()`));
check("  then it switches off again", !!(await waitFor(`document.getElementById("unloadModel").disabled && /not loaded/.test(document.getElementById("engineDetail").textContent)`, 4000)));
// HERESY 1071: no size presets: the same by hand (Manual)
await ev(`(() => { const k = document.getElementById("setKeepLoaded"); k.checked = false; k.dispatchEvent(new Event("change"));
  const v = document.getElementById("setVaeCore"); v.value = "512"; v.dispatchEvent(new Event("input")); return true; })()`);
await click("#saveSettings");
await waitFor(`(async () => { const s = await (await fetch("/settings")).json(); return !s.keep_loaded && s.vae_core === 512; })()`, 5000);
check("models unloaded after each song, VAE tiles 512, by hand", (await mockGet("settings")).keep_loaded === false && (await mockGet("settings")).vae_core === 512);
const pick0 = await ev(`(() => { const s = document.getElementById("modelPick"); return { options: [...s.options].map(o => o.value + "=" + o.textContent).join("|"),
  value: s.value, disabled: s.disabled }; })()`);
check("top-bar Model dropdown lists the backbones with sizes", pick0.options === "BF16=BF16 · 7.2 GB|Q8_0=Q8_0 · 3.8 GB" &&   // HERESY 1017
  pick0.value === (await mockGet("settings")).model && !pick0.disabled, JSON.stringify(pick0));
// the run's toasts (a dozen within their 9–13 s) stack up the right side to the bar, over the menu under ⋯: cleared first
await ev(`document.querySelectorAll(".toast").forEach(t => t.remove()); true`);
await click("#headMore");                                  // HERESY 1017: the Model menu sits under ⋯ (More)
t = await hoverOn("#modelPick");
check("  (i) tip explains the copies", t?.on && /BF16/.test(t.text) && /Q5_K_M/.test(t.text), t?.text.split("\n")[0]);
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 5, y: 5 });
await ev(`document.body.click(); true`);                     // ⋯ closes
await mockClear();
await ev(`(() => { const s = document.getElementById("modelPick"); s.value = "Q8_0"; s.dispatchEvent(new Event("change")); return true; })()`);
const picked = await waitFor(`/Model Q8_0/.test([...document.querySelectorAll(".toast")].map(t => t.textContent).join()) && document.getElementById("setModel").value === "Q8_0"`, 5000, 200);
const pickBodies = (await mockGet("mock/requests")).filter((r) => r.path === "/settings").map((r) => r.body);
check("choosing Q8_0 there posts only the model, and the Engine form follows", !!picked && pickBodies.length === 1 &&
  JSON.stringify(JSON.parse(pickBodies[0])) === '{"model":"Q8_0"}' && (await mockGet("settings")).model === "Q8_0", pickBodies.join());
await ev(`(() => { const s = document.getElementById("modelPick"); s.value = "BF16"; s.dispatchEvent(new Event("change")); return true; })()`);
check("  and back to BF16", !!(await waitFor(`(async () => (await (await fetch("/settings")).json()).model === "BF16")()`, 5000)));

// =============================================================== writer
section("idea writer (stand-in chat server)");
await mockClear();
await ev(`(() => { const u = document.getElementById("chatUrl"); u.value = location.origin + "/fakechat-loaded/v1"; u.dispatchEvent(new Event("change")); return true; })()`);
await waitFor(`document.getElementById("chatState").textContent === "ready"`, 5000);
// the Chat Server button: its state, the label that shows, its colour against the theme's, its size, its tip
const chatBtn = `(() => { const b = document.getElementById("chatLink"), r = b.getBoundingClientRect(), probe = document.createElement("i"); document.body.append(probe);
  const col = (v) => { probe.style.color = "var(" + v + ")"; return getComputedStyle(probe).color; };
  const out = { s: b.dataset.s, label: [...b.children].filter(e => getComputedStyle(e).visibility === "visible").map(e => e.textContent).join("|"),
    green: getComputedStyle(b).color === col("--good"), red: getComputedStyle(b).color === col("--bad"), w: Math.round(r.width), h: Math.round(r.height),
    radius: parseFloat(getComputedStyle(b).borderTopLeftRadius), tip: b.dataset.tip, status: document.getElementById("museStatus").textContent };
  probe.remove(); return out; })()`;
await ev(`document.getElementById("museDrawer").open = true; true`);
const chatOn = await ev(chatBtn);
check("chat server answering: a green square Chat Server Connected button, the model in its tip", chatOn.s === "on" && chatOn.label === "Chat Server Connected" && chatOn.green &&
  chatOn.radius <= 3 && /model-b/.test(chatOn.tip), JSON.stringify(chatOn));
const buttonPair = `(() => { const w = document.getElementById("museBtn").getBoundingClientRect(), c = document.getElementById("chatLink").getBoundingClientRect(),
  st = document.getElementById("museStatus"), sr = st.getBoundingClientRect();
  return { gap: Math.round(w.left - c.right), sameRow: Math.abs((w.top + w.bottom) / 2 - (c.top + c.bottom) / 2) < 2, status: st.textContent, statusBelow: !st.textContent || sr.top >= w.bottom }; })()`;
// HERESY 1016: the Kit's idea writer retired from the Creator (hidden; the Writer room writes songs now): the checks of its
// drawer's layout and keys are skipped; its chat-server logic, which still runs, is checked as before
const RETIRED = "the Kit's idea writer retired (HERESY 1016): the Writer room writes songs";
const ideaBox = await ev(`(() => { const box = document.getElementById("idea"), row = box.closest(".muse").getBoundingClientRect(), r0 = box.getBoundingClientRect();
  box.value = "a long idea ".repeat(40); box.dispatchEvent(new Event("input")); const r1 = box.getBoundingClientRect();
  box.value = ""; box.dispatchEvent(new Event("input")); const r2 = box.getBoundingClientRect();
  const w = document.getElementById("museBtn").getBoundingClientRect(), c = document.getElementById("chatLink").getBoundingClientRect();
  return { tag: box.tagName, fill: Math.round(r0.width / row.width * 100), one: Math.round(r0.height), grown: Math.round(r1.height), back: Math.round(r2.height),
    gap: Math.round(w.left - c.right), sameRow: Math.abs((w.top + w.bottom) / 2 - (c.top + c.bottom) / 2) < 2, hW: Math.round(w.height), hC: Math.round(c.height),
    wW: Math.round(w.width), wC: Math.round(c.width), left: Math.round(c.left - row.left),
    oldTag: !!document.getElementById("museTag"), oldHint: !!document.getElementById("structureHint"),
    ideaInfo: !!box.closest(".field").querySelector(".label .info"), modelInfo: !!document.getElementById("museModel").closest(".field").querySelector(".label .info"),
    structureTip: document.getElementById("structure").closest(".field").querySelector(".info")?.dataset.tip || "",
    stackedFill: Math.round(document.getElementById("structure").getBoundingClientRect().width / row.width * 100),
    modelUnder: document.getElementById("museModel").getBoundingClientRect().top >= document.getElementById("structure").getBoundingClientRect().bottom,
    modelFill: Math.round(document.getElementById("museModel").getBoundingClientRect().width / row.width * 100) }; })()`);
skip("the idea box is two lines across the drawer and grows with its text, like the style box", RETIRED);
skip("  the Chat Server button and Write the brief sit together on the left, the same size", RETIRED);
skip("  Structure and Writer model each on their own full line, the model under the structure", RETIRED);
check("  one chat server marker (no small tag); the (i)s sit on the labels; the structure's note is in its (i)", !ideaBox.oldTag && !ideaBox.oldHint &&
  ideaBox.ideaInfo && ideaBox.modelInfo && /Now: Verse, Chorus and Bridge/.test(ideaBox.structureTip), JSON.stringify({ tag: ideaBox.oldTag, hint: ideaBox.oldHint, tip: ideaBox.structureTip.slice(-80) }));
await ev(`document.getElementById("idea").focus(); true`);
await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, modifiers: 8, text: "\r" });
await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, modifiers: 8 });
skip("  Shift+Enter makes a new line in it (Enter still writes the brief)", RETIRED);
await ev(`document.getElementById("idea").value = ""; document.getElementById("idea").blur(); true`);
check("status names the loaded model only", /model-b/.test(await ev(`document.getElementById("chatHint").textContent`)) &&
  (await ev(`document.getElementById("museModel").textContent`)) === "model-b loaded on the chat server");
await ev(`document.getElementById("museDrawer").open = true; document.getElementById("idea").value = "a truck that will not start"; true`);
await click("#museBtn");
const brief = await waitFor(`document.getElementById("title").value === "Ridge Road" && /Truck/.test(document.getElementById("lyrics").value)`, 8000);
const chatReqs = (await mockGet("mock/requests")).filter((r) => /fakechat/.test(r.path));
check("Write the brief fills title, style and lyrics", !!brief);
const afterWrite = await ev(buttonPair);
skip("  with the result line showing, the two buttons still sit together and the line goes under them", RETIRED);
check("  only the loaded model is ever asked (structured first, then plain)", chatReqs.length >= 2 && chatReqs.every((r) => r.model === "model-b") && chatReqs[0].json_schema && !chatReqs[1].json_schema,
  chatReqs.map((r) => r.model + (r.json_schema ? "+schema" : "")).join(", "));
await shot("writer");
await mockClear();
await ev(`(() => { const u = document.getElementById("chatUrl"); u.value = location.origin + "/fakechat-none/v1"; u.dispatchEvent(new Event("change")); return true; })()`);
await waitFor(`document.getElementById("chatState").textContent === "no model loaded"`, 5000);
const chatNone = await ev(chatBtn);
check("nothing loaded: writer refuses; the button's tip asks you to load one", (await ev(`document.getElementById("museBtn").disabled`)) === true &&
  chatNone.s === "on" && /no model loaded: load one there first/.test(chatNone.tip) &&
  /none yet · load a model/.test(await ev(`document.getElementById("museModel").textContent`)), JSON.stringify(chatNone));
await ev(`document.getElementById("museBtn").disabled = false; document.getElementById("museBtn").click(); true`);
await sleep(600);   // a check that nothing happens: give a request the time it would take to show
check("  and sends no completion request", (await mockGet("mock/requests")).filter((r) => /fakechat/.test(r.path)).length === 0);
await ev(`(() => { const u = document.getElementById("chatUrl"); u.value = "http://127.0.0.1:9/v1"; u.dispatchEvent(new Event("change")); return true; })()`);
await waitFor(`document.getElementById("chatState").textContent === "not answering"`, 6000);
check("unreachable or blocked: says so plainly (CORS)", /CORS/.test(await ev(`document.getElementById("chatHint").textContent`)), await ev(`document.getElementById("chatHint").textContent`));
const chatOff = await ev(chatBtn);
check("  the button turns red, Chat Server Offline; the old line of text is now its tip", chatOff.s === "off" && chatOff.label === "Chat Server Offline" && chatOff.red &&
  chatOff.tip.startsWith("The chat server is not answering — check its address under Engine") && chatOff.status === "", JSON.stringify(chatOff));
skip("  and it keeps its size between the two states", RETIRED);
await ev(`document.getElementById("chatLink").scrollIntoView({ block: "center", behavior: "instant" }); true`);
await sleep(200);   // the scroll's event passes before the hover (a scroll closes a tip)
const chatAt = await ev(`(() => { const r = document.getElementById("chatLink").getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: chatAt.x, y: chatAt.y });
const chatTip = (await waitFor(`(() => { const t = document.querySelector(".tip.is-on"); return t ? t.textContent : ""; })()`, 2000, 50)) || "";
skip("  hovering it pops the text up", RETIRED);
await shot("chat-offline");
await ev(`document.getElementById("chatUrl").value = location.origin + "/fakechat-loaded/v1"; true`);
await click("#chatLink");
const rechecked = await waitFor(`document.getElementById("chatLink").dataset.s === "on"`, 5000);
check("  clicking it checks again: the server is back, so it turns green", !!rechecked && (await ev(chatBtn)).label === "Chat Server Connected");
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 5, y: 5 });
await ev(`localStorage.removeItem("yue2.chatUrl"); document.getElementById("museDrawer").open = false; true`);

// ======================================================= the Writer room
section("the Writer room: the style as tags, the document open in the notebook");
// HERESY 1167 (Viktor: «Промптинг как в SD/SDXL… Но как опцию. Пусть LLM выдаёт полный читабельный и тегированный»)
const wrTags = await ev(`(() => { const A = window.HeresyAssist;
  const a = A.parse(JSON.stringify({ title: "t", style: "a readable style", lyrics: "l", notes: "n", style_tags: "dark country, baritone, 86 BPM" }));
  const b = A.parse(JSON.stringify({ title: "t", style: "s", lyrics: "l", notes: "n" }));
  return { tags: a && a.styleTags, older: b && b.styleTags, asked: /"style_tags"/.test(A.system("")) }; })()`);
check("the writer is asked for the style as tags beside the readable one; its answer reads both (an older answer has none)",
  wrTags.tags === "dark country, baritone, 86 BPM" && wrTags.older === "" && wrTags.asked, JSON.stringify(wrTags));
// HERESY 1167 (Viktor: «Я подал Фосфориду, а на выходе буратино»): the room works on the Creator's song; a different
// document open in the notebook is asked about first
await mockClear();
const wrWas = await ev(`({ provider: document.getElementById("assistProvider").value, style: document.getElementById("style").value })`);
await ev(`(() => { const u = document.getElementById("chatUrl"); u.value = location.origin + "/fakechat-loaded/v1"; u.dispatchEvent(new Event("change")); return true; })()`);
await waitFor(`document.getElementById("chatState").textContent === "ready"`, 5000);
await ev(`(() => { const W = window.HeresyWriter; W.suiteOpenDoc = W.openDoc; W.openDoc = () => ({ id: "suite-doc", title: "Fosforida" });
  const p = document.getElementById("assistProvider"); p.value = "engine"; p.dispatchEvent(new Event("change"));
  document.getElementById("assistBrief").value = "a road song"; document.getElementById("assistBtn").click(); return true; })()`);
const wrAsked = await waitFor(`(() => { const d = document.querySelector(".hd-back.is-on:not(.is-leaving)");
  return d && { text: d.textContent, yes: d.querySelector(".hd-yes").textContent, no: d.querySelector(".hd-no").textContent }; })()`, 3000, 50);
const wrBefore = (await mockGet("mock/requests")).filter((r) => /fakechat-loaded\/v1\/chat/.test(r.path)).length;
check("a request while the notebook has another document open asks first: put that one into the Creator, or send on the Creator's song",
  !!wrAsked && /The notebook has “Fosforida” open/.test(wrAsked.text) && wrAsked.yes === "Put it in and send" && wrAsked.no === "Send on the Creator's song" && wrBefore === 0,
  JSON.stringify({ wrAsked, wrBefore }));
await answerDialog(false);
const wrLanded = await waitFor(`!document.getElementById("assistDraft").classList.contains("is-hidden") && document.getElementById("draftTitle").value === "Ridge Road"`, 8000);
const wrSent = (await mockGet("mock/requests")).filter((r) => /fakechat-loaded\/v1\/chat/.test(r.path)).length;
check("  Send on the Creator's song sends it as it is; the draft lands with its style as tags beside the readable one", !!wrLanded && wrSent >= 1 &&
  (await ev(`document.getElementById("draftStyleTags").value`)) === "dark country, baritone male, fiddle, banjo, half-time, 86 BPM" &&
  /dark country, baritone male voice/.test(await ev(`document.getElementById("draftStyle").value`)), `sent ${wrSent}`);
const wrForm = await ev(`(() => { const pick = (v) => document.querySelector('input[name="draftStyleForm"][value="' + v + '"]').click();
  const out = { first: document.querySelector('input[name="draftStyleForm"]:checked').value };
  pick("tags"); document.getElementById("applyStyle").click(); out.tags = document.getElementById("style").value;
  pick("readable"); document.getElementById("applyStyle").click(); out.readable = document.getElementById("style").value;
  pick("tags"); return out; })()`);
check("  Into the form: the tags by default, the readable style when chosen", wrForm.first === "tags" &&
  wrForm.tags === "dark country, baritone male, fiddle, banjo, half-time, 86 BPM" && /baritone male voice, fiddle, banjo/.test(wrForm.readable), JSON.stringify(wrForm));
await ev(`(() => { const W = window.HeresyWriter; W.openDoc = W.suiteOpenDoc; delete W.suiteOpenDoc;
  const p = document.getElementById("assistProvider"); p.value = ${JSON.stringify(wrWas.provider)}; p.dispatchEvent(new Event("change"));
  const s = document.getElementById("style"); s.value = ${JSON.stringify(wrWas.style)}; s.dispatchEvent(new Event("input", { bubbles: true }));
  document.getElementById("assistBrief").value = ""; localStorage.removeItem("yue2.chatUrl"); localStorage.removeItem("yue2.draftStyleForm"); return true; })()`);

// HERESY 1168 (Viktor 07.10.2026: «В комнате Писателя добавить глобальный экспорт/импорт всех данных скопом для бекапа»)
const wrUrl = `"/lab/writer" + (new URLSearchParams(location.search).get("scope") ? "?scope=" + new URLSearchParams(location.search).get("scope") : "")`;   // the page's own notebook
await ev(`fetch(${wrUrl}, { method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ op: "put", title: "Suite Kept Doc", lyrics: "kept" }) }).then(r => r.ok)`);   // one at least, already here
await ev(`(() => { window.__wrSaved = null; window.__wrUrl = URL.createObjectURL; window.__wrClick = HTMLAnchorElement.prototype.click;
  URL.createObjectURL = (b) => { window.__wrBlob = b; return window.__wrUrl(b); };
  HTMLAnchorElement.prototype.click = function () { if (this.download) window.__wrSaved = this.download; else window.__wrClick.call(this); };
  document.getElementById("wrExport").click(); return true; })()`);
const wrBackup = await waitFor(`window.__wrSaved ? window.__wrBlob.text().then(t => ({ name: window.__wrSaved, text: t })) : null`, 6000, 100);
const wrB = wrBackup ? JSON.parse(wrBackup.text) : {};
const wrListed = await ev(`fetch(${wrUrl}).then(r => r.json()).then(d => d.docs.length)`);
check("Writer · Export all: one file, every document with its versions and the trash, named for the day",
  /^ruach-writer-backup-\d{8}-\d{4}\.json$/.test(wrBackup?.name || "") && wrB.kind === "ruach-writer-backup" && Array.isArray(wrB.docs) &&
  wrB.docs.length === wrListed && Array.isArray(wrB.trash) && wrB.docs.every((d) => Array.isArray(d.versions)), JSON.stringify({ name: wrBackup?.name, docs: wrB.docs?.length, wrListed }));
const wrNewId = Array.from({ length: 12 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
const wrBundle = JSON.stringify({ kind: "ruach-writer-backup", version: 1, made: Date.now() / 1000, trash: [],
  docs: [{ id: wrNewId, title: "Suite Backup Doc", style: "", lyrics: "la la", notes: "", params: {}, takes: [], versions: [] }].concat(wrB.docs.slice(0, 1)) });
await ev(`(() => { document.querySelectorAll(".toast").forEach(t => t.remove()); const dt = new DataTransfer();
  dt.items.add(new File([${JSON.stringify(wrBundle)}], "suite-backup.json")); const i = document.getElementById("wrImportFile");
  i.files = dt.files; i.dispatchEvent(new Event("change")); return true; })()`);
const wrToast = await waitFor(`[...document.querySelectorAll(".toast")].map(t => t.textContent).find(t => /^Writer backup suite-backup\.json/.test(t)) || null`, 6000, 100);
const wrHas = await ev(`fetch(${wrUrl}).then(r => r.json()).then(d => d.docs.some(x => x.id === ${JSON.stringify(wrNewId)} && x.title === "Suite Backup Doc"))`);
check("  Import: the missing one comes in, the one already here is left alone (nothing written over)",
  /: 1 new, 1 already here, 0 beside their namesakes as copies, 0 into the trash$/.test(wrToast || "") && wrHas, JSON.stringify({ wrToast, wrHas }));
await ev(`(() => { URL.createObjectURL = window.__wrUrl; HTMLAnchorElement.prototype.click = window.__wrClick;
  return fetch(${wrUrl}, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op: "delete", id: ${JSON.stringify(wrNewId)} }) }).then(() => true); })()`);   // into the notebook's own trash

// ===================================================== the workspace in hand
section("the workspace in hand: the bar's button and the studio's chooser");
// HERESY 1167 (Viktor: «в баре такой же кнопочкой… при нажатии… диалоговое окно с воркспейсами, кликаешь на него... и вуаля»)
const wsBtn = await ev(`(() => { const b = document.getElementById("wsCurrent"); return b && { tag: b.tagName, text: b.textContent.trim(), wrap: b.parentElement.className }; })()`);
check("the workspace in hand is a button in the bar (no library here: it asks for one)", !!wsBtn && wsBtn.tag === "BUTTON" && /Choose a workspace/.test(wsBtn.text) && /ws-current/.test(wsBtn.wrap), JSON.stringify(wsBtn));
await click("#wsCurrent");
const wsDlg = await waitFor(`(() => { const d = document.querySelector(".hd-back.is-on:not(.is-leaving) .hd-choose"); return d && { title: d.querySelector(".hd-title").textContent,
  body: (d.querySelector(".hd-body") || {}).textContent || "", more: [...d.querySelectorAll(".hd-more")].map(b => b.textContent) }; })()`, 3000, 50);
check("  a click opens the chooser: what the choice means, and a new workspace to make", !!wsDlg && /The workspace in hand/.test(wsDlg.title) &&
  /Every new take lands in it/.test(wsDlg.body) && wsDlg.more.some(t => /New workspace/.test(t)), JSON.stringify(wsDlg));
await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
check("  Esc closes it", !!(await waitFor(`!document.querySelector(".hd-back:not(.is-leaving)")`, 2000, 50)));
await ev(`(() => { window.suitePick = undefined; HeresyDialog.choose("Pick one\\n\\nWhat it means.", [{ value: "a", label: "Alpha", note: "3" },
  { value: "a / b", label: "Beta", depth: 1, current: true }], { more: [{ label: "+ New\u2026", value: "__new" }] }).then(v => { window.suitePick = v; }); return true; })()`);
await waitFor(`!!document.querySelector(".hd-back.is-on:not(.is-leaving) .hd-item")`, 3000, 50);
const pickShape = await ev(`(() => { const items = [...document.querySelectorAll(".hd-back.is-on .hd-item")];
  return { n: items.length, current: items.findIndex(i => i.classList.contains("is-current")), note: items[0].querySelector(".hd-item-note")?.textContent,
    indent: parseFloat(getComputedStyle(items[1]).paddingLeft) > parseFloat(getComputedStyle(items[0]).paddingLeft) }; })()`);
await click(".hd-back.is-on .hd-item[data-i='0']");
const wsPicked = await waitFor(`window.suitePick === "a"`, 2000, 50);
check("  the chooser: one click picks; the one in hand marked, a section set in, its count beside", pickShape.n === 2 && pickShape.current === 1 &&
  pickShape.indent && pickShape.note === "3" && !!wsPicked, JSON.stringify(pickShape));
await waitFor(`!document.querySelector(".hd-back:not(.is-leaving)")`, 2000, 50);

// ===================================================== prompt files + extras
section("prompt files, example, lyrics export");
await ev(`(() => { window.__downloads = []; const real = URL.createObjectURL; URL.createObjectURL = (b) => { window.__lastBlob = b; return real(b); };
  HTMLAnchorElement.prototype.click = function () { if (this.download) window.__downloads.push({ name: this.download, blob: window.__lastBlob }); };
  const set = (id, v) => { document.getElementById(id).value = v; }; set("title", "Round Trip"); set("style", "English, folk, 90 BPM");
  set("lyrics", "[Verse]\\nOne line: with a colon\\n  indented # not a comment\\n\\n[Chorus]\\nEnd"); set("lmSeed", "9007199254740993"); set("soundSeed", "77"); set("abc", "");
  document.querySelector('#modes input[value="melody"]').click(); return true; })()`);
await click('#saveMenu [data-save="json"]');
await click('#saveMenu [data-save="yaml"]');
const saved = await ev(`Promise.all(window.__downloads.map(async d => ({ name: d.name, text: await d.blob.text() })))`);
check("Save writes JSON and YAML named after the song", saved?.length === 2 && saved[0].name === "round-trip.json" && saved[1].name === "round-trip.yaml", saved?.map((s) => s.name).join(", "));
check("  the JSON keeps the seed exact", /"lm_seed": 9007199254740993/.test(saved?.[0]?.text || ""));
await ev(`(() => { ["title", "style", "lyrics", "lmSeed", "soundSeed"].forEach(id => document.getElementById(id).value = ""); document.querySelector('#modes input[value="full"]').click(); return true; })()`);
await ev(`(() => { const dt = new DataTransfer(); dt.items.add(new File([${JSON.stringify(saved?.[1]?.text || "")}], "round-trip.yaml"));
  const i = document.getElementById("openFile"); i.files = dt.files; i.dispatchEvent(new Event("change")); return true; })()`);
const back = await waitFor(`document.getElementById("title").value === "Round Trip" ? { style: document.getElementById("style").value, lyrics: document.getElementById("lyrics").value,
  seed: document.getElementById("lmSeed").value, sound: document.getElementById("soundSeed").value, cot: document.querySelector('#modes input:checked').value } : null`, 3000);
check("Open reads the YAML back into the form exactly", back?.style === "English, folk, 90 BPM" && back?.lyrics === "[Verse]\nOne line: with a colon\n  indented # not a comment\n\n[Chorus]\nEnd" &&
  back?.seed === "9007199254740993" && back?.sound === "77" && back?.cot === "melody", JSON.stringify(back));
// HERESY 1168 (Viktor 07.10.2026: «О том, что сброшено, Open молчит… это нужно допилить»): a file the page saved opens
// with nothing to say; a file with what the form cannot hold says each place
const cleanToast = await ev(`[...document.querySelectorAll(".toast")].map(t => t.className + "|" + t.textContent).filter(t => /round-trip\\.yaml/.test(t)).pop() || ""`);
await ev(`(() => { document.querySelectorAll(".toast").forEach(t => t.remove());
  const odd = { title: "Odd One", style: "pop", lyrics: "la", cot: "weird", lm_seed: "12a", steps: "many", solver: "rk9", colour: "red",
    vae: "no-such-vae", sliders: [{ id: "no-such-slider", strength: 1 }], loras: [{ id: "ghost/none.safetensors", ar: 0.5, nar: 0 }],
    abc_sampling: { temperature: 9, warmth: 1 }, synth_batch_size: 40 };
  const dt = new DataTransfer(); dt.items.add(new File([JSON.stringify(odd)], "odd.json"));
  const i = document.getElementById("openFile"); i.files = dt.files; i.dispatchEvent(new Event("change")); return true; })()`);
const oddToast = await waitFor(`(() => { const t = [...document.querySelectorAll(".toast.warn")].pop();
  return t ? { head: t.firstChild.textContent, lines: [...t.querySelectorAll(".toast-why")].map(d => d.textContent) } : null; })()`, 3000);
const oddForm = await ev(`({ temp: document.querySelector('input[data-group="abc"][data-key="temperature"]').value, cot: document.querySelector('#modes input:checked').value,
  vars: document.getElementById("variations").value })`);
const oddSaid = (oddToast?.lines || []).join("\n");
check("Open says what of a file the form could not hold (a field, the mode, a seed, steps, solver, VAE, slider, adapter, a knob, values past bounds); a saved one says nothing",
  /^Prompt loaded from odd\.json; 11 not as in the file:$/.test(oddToast?.head || "") && /\bgood\b/.test(cleanToast) && !/not as in the file/.test(cleanToast) &&
  ["colour: no such field in a prompt", "Mode «weird» unknown: Full plan", "Music seed «12a» is no whole number", "Steps «many» is no number", "Solver «rk9» unknown: midpoint",
   "VAE «no-such-vae» is not installed", "Slider «no-such-slider» is not installed", "is not in loras/: the run cannot load it", "Score planner: warmth unknown",
   "Score planner · Temperature 9 kept within 0.1–2", "Variations 40 kept within 1–9"].every(s => oddSaid.includes(s)) &&
  oddForm.temp === "2" && oddForm.cot === "full" && oddForm.vars === "9", JSON.stringify({ oddToast, oddForm, cleanToast }));
// the form as the round trip left it (the odd file set nine variations, a ghost adapter, a clamped knob)
await ev(`(() => { document.querySelectorAll(".toast").forEach(t => t.remove()); const dt = new DataTransfer();
  dt.items.add(new File([${JSON.stringify(saved?.[1]?.text || "")}], "round-trip.yaml"));
  const i = document.getElementById("openFile"); i.files = dt.files; i.dispatchEvent(new Event("change")); return true; })()`);
await waitFor(`document.getElementById("title").value === "Round Trip" && document.getElementById("variations").value === "1"`, 3000);
await ev(`(() => { document.querySelectorAll(".toast").forEach(t => t.remove()); return true; })()`);
// every demo in turn (the menu's "a random official demo" picks one at random): each fills the form and clears the sound seed
// HERESY 1035: Load example is a menu: a random official demo, then ours by name in their groups (Readings…)
const exampleRuns = await ev(`(() => { const all = window.YUE2_EXAMPLES || [], official = all.filter(e => !e.group), n = official.length, random = Math.random, bad = [];
  const pick = document.querySelector('#exampleMenu [data-example="random"]');
  for (let i = 0; i < n; i++) {
    document.getElementById("soundSeed").value = "99";
    Math.random = () => (i + 0.5) / n;
    pick.click();
    const ex = official[i], f = { title: document.getElementById("title").value, style: document.getElementById("style").value,
      lyrics: document.getElementById("lyrics").value, sound: document.getElementById("soundSeed").value };
    // some official demos are terse (one has the style "funk"): compare with the demo itself
    if (!(f.style && f.style === String(ex.style || "").trim() && f.lyrics === (ex.lyrics || "") && f.sound === "")) bad.push(f);
  }
  Math.random = random;
  const ours = all.findIndex(e => e.group), named = ours < 0 ? null : document.querySelector('#exampleMenu [data-example="' + ours + '"]');
  if (named) named.click();
  const own = ours < 0 ? null : { group: all[ours].group, title: all[ours].title, filled: document.getElementById("title").value === (all[ours].title || "") &&
    document.getElementById("lyrics").value === (all[ours].lyrics || "") };
  document.querySelectorAll(".toast").forEach((t) => t.remove());   // 110 toasts would bury later screenshots
  return { n, bad, own }; })()`);
check("Load example fills an official demo prompt and starts from a fresh sound seed (every demo)",
  exampleRuns.n > 0 && exampleRuns.bad.length === 0, JSON.stringify(exampleRuns).slice(0, 300));
check("  and one of ours by its name, from its group in the menu", !!exampleRuns.own && exampleRuns.own.filled, JSON.stringify(exampleRuns.own));
const lyricsTake = await ev(`document.querySelector("#libList .take:not(.is-running-row)")?.dataset.name`);
await click(`#libList .take:not(.is-running-row)`);
await showsTake(lyricsTake);
await waitFor(`(() => { const r = document.querySelector("#libList .take.is-active"), m = document.querySelector('#metaGrid [data-field="Composition"]');
  return !!r && document.getElementById("takeTitle").textContent === r.querySelector(".take-title").textContent && !!m && m.dataset.value !== "…"; })()`, 4000, 50);
await ev(`window.__downloads = []; document.getElementById("lyricsTxt").click(); document.getElementById("lyricsJson").click(); true`);
const lyr = await ev(`(async () => { const d = window.__downloads; if (d.length !== 2) return { n: d.length }; const txt = await d[0].blob.text(), json = JSON.parse(await d[1].blob.text());
  return { names: d.map(x => x.name), same: json.sections.map(s => s.text).join("") === json.lyrics && txt === json.lyrics, schema: json.schema, timing: json.timing }; })()`);
check("lyrics TXT and JSON export (sections rebuild the lyrics exactly)", lyr?.same === true && lyr.schema === "song-lyrics-v1" && lyr.timing === null && /\.lyrics\.txt$/.test(lyr.names[0]), JSON.stringify(lyr));

// ================================================================ themes
section("help for every setting");
// HERESY 1145: the Kit's own area (the form, the take, Engine, the bar, the player, the log) has help for every control;
// HERESY 1148: and so do the rooms the studio added (Writer, Refiner, LoRA Trainer, Librarian), but the controls whose
// label says all (help.js SELF_EVIDENT: a title, a search, a sort)
const helpGaps = await ev(`(() => { const ours = /^view-(write|post|train|collection)$/, kit = [], rooms = [];
  YueHelp.missing().forEach(id => { const v = document.getElementById(id).closest("[id^=view-]")?.id || ""; (ours.test(v) ? rooms : kit).push(id); });
  return { kit, rooms }; })()`);
check("every form and engine setting has an (i) or a tip", helpGaps.kit.length === 0, JSON.stringify(helpGaps.kit));
check("  and every control of the studio's own rooms, but those whose label says all", helpGaps.rooms.length === 0, JSON.stringify(helpGaps.rooms));
// HERESY 1148: the preset and the de-esser act on stems only: with the take as the source they are off, and the tip says why
await ev(`document.getElementById("rmSource").value = ""; document.getElementById("rmSource").dispatchEvent(new Event("change")); true`);
const rmOff = await ev(`["rmPreset", "rmDeess", "rmDeessMode"].map(id => document.getElementById(id).disabled)`);
const deessTip = await ev(`document.getElementById("rmDeess").closest("label").dataset.tip || ""`);
check("  the remaster's preset and de-esser are off on the take itself (they act on stems only)", JSON.stringify(rmOff) === "[true,true,true]" &&
  /Only for a set of stems/.test(deessTip), JSON.stringify(rmOff));
check("  all 14 sampler knobs have one", (await ev(`document.querySelectorAll(".knobs label.knob .info").length`)) === 14);
const foldedBefore = await ev(`[...document.querySelectorAll("details.drawer")].filter(d => !d.open).map(d => d.id)`);
await ev(`document.querySelectorAll("details.drawer").forEach(d => { d.open = true; }); true`);
t = await hoverOn(await ev(`(() => { const i = document.getElementById("odeSteps").closest(".field").querySelector(".info"); i.id = "odeInfo"; return "#odeInfo"; })()`));
check("  Denoising steps (ODE steps before) explains the default, the cost of 64, and that the music does not change", t?.on && /32 is the release setting/.test(t.text) &&
  /twice as long/.test(t.text) && /does not change/.test(t.text), t?.text.slice(0, 80));
t = await hoverOn(await ev(`(() => { const i = document.querySelector('.knobs[data-group="semantic"] input[data-key="temperature"]').closest("label").querySelector(".info"); i.id = "tempInfo"; return "#tempInfo"; })()`));
// HERESY 1031: the default is Viktor's 0.9 (the release had 1.0); above 1.0 the words blur into glossolalia (measured)
check("  the music temperature (i) gives its default and when to lower it", t?.on && /Default 0\.9/.test(t.text) && /glossolalia/.test(t.text), t?.text.slice(0, 80));
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 5, y: 5 });
await ev(`${JSON.stringify(foldedBefore)}.forEach(id => { const d = document.getElementById(id); if (d) d.open = false; }); true`);
const tickBefore = await ev(`document.getElementById("instrumental").checked`);
await click('.instrumental-check .info');
check("pressing an (i) inside a label does not tick its box", (await ev(`document.getElementById("instrumental").checked`)) === tickBefore);
const sharedSame = await ev(`YueHelp.text.odeSteps === YueHelp.text.setOde`);
check("  Denoising steps reads the same here and in the other console's engine card", sharedSame === true);

section("themes");
const themeIds = await ev(`YueThemes.list.map(t => t.id)`);
const grounds = [];
for (const th of themeIds) {
  await ev(`YueThemes.set("${th}"); true`);
  grounds.push(await ev(`getComputedStyle(document.body).backgroundColor`));
  if (["daylight", "nord", "solarized-light", "bold-sunflower", "jade", "bold-midnight-blue"].includes(th)) await shot("theme-" + th);
}
// HERESY 1015, 1099: 22 themes to work in: Viktor's two, the classic editor themes, the quiet ones (Classic 13, Soft 9)
check("22 themes (Viktor's two, the classic editor ones, the quiet ones), each painting its own background", themeIds.length === 22 && new Set(grounds).size >= 21,
  `${themeIds.length} themes, ${new Set(grounds).size} distinct backgrounds`);
check("the theme choice is remembered", (await ev(`localStorage.getItem("yue2.theme")`)) === themeIds[themeIds.length - 1]);
await ev(`YueThemes.set("studio"); localStorage.removeItem("yue2.themeFavorites"); localStorage.setItem("yue2.themeFamily", "all"); true`);
await click("#themeButton");
const tiles = () => ev(`[...document.querySelectorAll(".theme-popup .theme-choice")].map(b => b.dataset.themeId)`);
check("the theme button opens a swatch grid of every theme", (await ev(`YueThemes.isOpen()`)) === true && (await tiles()).length === 22);
await click('.theme-popup [data-family="classic"]');
const classic = await tiles();
await click('.theme-popup [data-family="soft"]');
const soft = await tiles();
check("  Classic / Soft filters (Viktor's two are classic ones)", classic.length === 13 && classic.includes("igr-day") && classic.includes("igr-night") &&
  soft.length === 9 && soft.includes("jade"), `classic ${classic.length}, soft ${soft.length}`);
await ev(`(() => { const q = document.querySelector(".theme-popup .theme-search"); q.value = "jad"; q.dispatchEvent(new Event("input")); return true; })()`);
check("  search looks through every collection", JSON.stringify(await tiles()) === '["jade"]', JSON.stringify(await tiles()));
await ev(`(() => { const q = document.querySelector(".theme-popup .theme-search"); q.value = ""; q.dispatchEvent(new Event("input")); return true; })()`);
await click('.theme-popup [data-family="all"]');
const box = await ev(`(() => { const b = document.querySelector('.theme-popup .theme-choice[data-theme-id="dracula"]'); b.scrollIntoView({ block: "center" });
  const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
await sleep(150);   // the scroll into view settles before the pointer lands
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: box.x, y: box.y });
await waitFor(`document.documentElement.dataset.theme === "dracula"`, 2000, 50);
check("  hovering a theme previews it on the page, without keeping it",
  (await ev(`document.documentElement.dataset.theme`)) === "dracula" && (await ev(`YueThemes.current()`)) === "studio");
await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
await waitFor(`!YueThemes.isOpen()`, 2000, 50);
check("  Esc goes back to the kept theme and closes the picker", (await ev(`document.documentElement.dataset.theme`)) === "studio" && !(await ev(`YueThemes.isOpen()`)));
await click("#themeButton");
await click('.theme-popup .theme-star[data-star="jade"]');
await click('.theme-popup [data-family="favorites"]');
check("  ☆ adds a theme to Favorites", JSON.stringify(await tiles()) === '["jade"]' && /jade/.test(await ev(`localStorage.getItem("yue2.themeFavorites")`)));
await click('.theme-popup [data-family="all"]');
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 5, y: 5 });   // a resting pointer would preview what is under it
await ev(`document.querySelector('.theme-popup .theme-choice[data-theme-id="studio"]').focus(); true`);
await send("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39 });
await waitFor(`(() => { const f = document.activeElement?.dataset.themeId; return !!f && f !== "studio" && document.documentElement.dataset.theme === f; })()`, 2000, 50);
const moved = await ev(`({ focus: document.activeElement.dataset.themeId, shown: document.documentElement.dataset.theme })`);
check("  arrow keys move through the grid and preview as they go", !!moved.focus && moved.focus !== "studio" && moved.shown === moved.focus, JSON.stringify(moved));
await shot("theme-picker");
await click('.theme-popup .theme-choice[data-theme-id="gruvbox"]');
// HERESY 1017: the Theme button is an icon under ⋯; it names the theme in its label and tip
check("clicking a theme keeps it: page, button and memory", (await ev(`YueThemes.current()`)) === "gruvbox" && !(await ev(`YueThemes.isOpen()`)) &&
  /Gruvbox/.test(await ev(`document.getElementById("themeButton").getAttribute("aria-label")`)) && (await ev(`localStorage.getItem("yue2.theme")`)) === "gruvbox");
t = await hoverOn('[data-tip-ref="tip-sliders"]');
check("tips follow the theme", t?.on && (await ev(`getComputedStyle(document.querySelector(".tip")).backgroundColor`)) !== grounds[0]);
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 5, y: 5 });
await ev(`YueThemes.set("studio"); localStorage.removeItem("yue2.themeFavorites"); true`);

// ============================================================ delete rest
section("new song and seeds");
const diceOf = (box, dice) => ev(`({ v: document.getElementById("${box}").value, set: document.getElementById("${dice}").classList.contains("is-set"),
  tip: document.getElementById("${dice}").dataset.tip })`);
await ev(`document.getElementById("lmSeed").value = ""; document.getElementById("lmSeed").dispatchEvent(new Event("input")); true`);
await ev(`document.getElementById("rollLmSeed").click(); true`);
const rolled = await diceOf("lmSeed", "rollLmSeed");
check("the dice on an empty seed box puts a seed in (and its tip says it will clear it)", /^\d+$/.test(rolled.v) && rolled.set && /Clear the/.test(rolled.tip), JSON.stringify(rolled));
await ev(`document.getElementById("rollLmSeed").click(); true`);
const cleared = await diceOf("lmSeed", "rollLmSeed");
check("  pressed again it clears it: random", cleared.v === "" && !cleared.set && /Put in a random/.test(cleared.tip), JSON.stringify(cleared));
await ev(`(() => { const set = (id, v) => { document.getElementById(id).value = v; }; set("title", "Old"); set("style", "old style"); set("lyrics", "[Verse]\\nold");
  set("abc", "X:1"); set("lmSeed", "123"); document.querySelector('input[name="cot"][value="off"]').click(); document.getElementById("instrumental").checked = true;
  document.getElementById("versions").value = 3; YueLoras.set([{ id: "yue2-jpop-t4-lora/yue2_jpop_t4.safetensors", ar: 0, nar: 1 }]);
  const k = document.querySelector('input[data-group="semantic"][data-key="temperature"]'); k.value = "0.5"; return true; })()`);
await ev(`document.getElementById("newSong").click(); true`); await answerDialog(true);   // HERESY 1167: New song asks first
await toastSays("/New song: the form is back to its defaults/", 3000);
const blank = await ev(`({ fields: ["title", "style", "lyrics", "abc", "lmSeed"].map(id => document.getElementById(id).value).join(""),
  cot: document.querySelector('input[name="cot"]:checked').value, inst: document.getElementById("instrumental").checked,
  versions: document.getElementById("versions").value, loras: document.querySelectorAll("#loraPicker .lora-row").length,
  temp: document.querySelector('input[data-group="semantic"][data-key="temperature"]').value,
  toast: [...document.querySelectorAll(".toast")].map(t => t.textContent).join(" | ") })`);
check("＋ New song empties the form: fields, seed, score, mode, Instrumental, versions, LoRAs, sampling", blank.fields === "" && blank.cot === "full" && /* HERESY 1169 · 1253: Full by default (1167 had Direct) */
  !blank.inst && blank.versions === "1" && blank.loras === 0 && Number(blank.temp) === 0.9 && /New song: the form is back to its defaults/.test(blank.toast),   // HERESY 1031
  JSON.stringify(blank).slice(0, 180));

section("style prompt size");
const styleBox = async () => ev(`(() => { const m = document.getElementById("styleMeter"), b = document.getElementById("styleWarn"), p = document.createElement("i");
  p.style.color = "var(--amber)"; document.body.append(p); const amber = getComputedStyle(p).color; p.style.color = "var(--bad)"; const bad = getComputedStyle(p).color; p.remove();
  return { h: document.getElementById("style").offsetHeight, meter: m.textContent, over: m.classList.contains("is-over"), warn: m.classList.contains("is-warn"),
    oneLine: m.scrollHeight <= parseFloat(getComputedStyle(m).lineHeight) * 1.5, grey: ![amber, bad].includes(getComputedStyle(m).color),
    badge: !!b && !b.hidden, badgeTip: b ? b.dataset.tip || "" : "", big: b ? b.dataset.tipSize : "" }; })()`);
const meterSays = (cond) => waitFor(`(() => { const m = document.getElementById("styleMeter"); return ${cond}; })()`, 3000, 50);   // repainted every 700 ms
// the page's own setters fire an input event (setField), which sizes the box: so here too
await click('#modes input[value="full"]');                 // HERESY 1167: the budget with a score in it (Direct has none)
await ev(`(() => { const set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event("input", { bubbles: true })); };
  set("style", "pop"); set("lyrics", "[Verse]\\nla"); return true; })()`);
await meterSays(`/^Characters: 3 /.test(m.textContent)`);
const small = await styleBox();
await ev(`(() => { const s = document.getElementById("style"); s.value = Array(60).fill("dark cinematic synthwave with a slow build, analog pads, gated drums").join(", ");
  s.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
await meterSays(`/^Characters: 4,198 /.test(m.textContent)`);
const big = await styleBox();
check("the style box grows with a long prompt set by the page", big.h > small.h + 60, `${small.h}px -> ${big.h}px`);
// HERESY 1031: the engine's score budget is 6,144 (Viktor's set), so style and lyrics share 24,576 - 6,144 - 9,000 - 80 = 9,352
// and, past 1,600 characters, the flag of a style unlike the model's training ones (help.js)
// HERESY 1167: the counter one grey line; what is wrong behind a WARNING at the end of the heading's line, its tip large
check("  the counter under it shows its size and the shared budget, on one grey line", big.meter === "Characters: 4,198 · tokens: ≈1,167 · with the lyrics: ≈1,170 of 9,352" &&
  big.oneLine && big.grey, JSON.stringify(big));
check("  a style unlike the model's training ones: a WARNING beside the cheat-sheet's ?, its tip large, saying what to expect", big.badge && big.big === "big" &&
  /^Unlike the model's training styles:\n• longer than 1,600 characters/.test(big.badgeTip) && /What to expect: YuE2 learned from styles without these/.test(big.badgeTip) &&
  (await ev(`(() => { const e = document.getElementById("styleLabelEnd"); return !!e && e.lastElementChild && e.lastElementChild.id === "hiOpen" && !!e.querySelector("#hiOpen svg"); })()`)) === true,
  big.badgeTip.slice(0, 120));
await ev(`document.getElementById("lyrics").value = "la la la ".repeat(5000); true`);
await meterSays(`m.classList.contains("is-over")`);
const over = await styleBox();
check("  past the budget the WARNING says so (the counter stays grey)", over.over && over.grey && over.badge && /too long for a full-length song and score/.test(over.badgeTip) &&
  /share one window of 24,576 tokens/.test(over.badgeTip), over.badgeTip.slice(0, 120));
await ev(`document.getElementById("lyrics").value = "la la la ".repeat(3000); true`);
await meterSays(`m.classList.contains("is-warn")`);
check("  near it, still grey (the WARNING speaks for the style, not for the length)", (await styleBox()).grey === true);
check("  the style (i) gives the limit", /24,576/.test(await ev(`YueHelp.text.style`)) && /counter/.test(await ev(`YueHelp.text.style`)));   // the window, and the counter
// HERESY 1167: the rates measured with YuE2's own BPE (06.10.2026): English 3.6 characters a token, Russian 0.5 a letter,
// Ukrainian and Belarusian 0.6, Greek 1, Hebrew 0.45 (the old estimate gave every non-ASCII character a token)
const rates = await ev(`(() => { const e = YueHelp.estimateTokens;
  return { en: e("a".repeat(360)), ru: e("б".repeat(100)), uk: e("б".repeat(99) + "і"), el: e("β".repeat(100)), he: e("ש".repeat(100)), mark: e("«»".repeat(50)) }; })()`);
check("  the token estimate by script: English 3.6 characters a token, Russian 0.5, Ukrainian and Belarusian 0.6, Greek 1, Hebrew 0.45",
  rates.en === 100 && rates.ru === 50 && rates.uk === 60 && rates.el === 100 && rates.he === 45 && rates.mark === 100, JSON.stringify(rates));
await ev(`document.getElementById("style").value = ""; document.getElementById("lyrics").value = ""; true`);

section("copy the prompt");
await click(`#libList .take[data-name="${cdpTake}"]`);
await showsTake(cdpTake);
await ev(`window.__clip = null; navigator.clipboard.writeText = (t) => { window.__clip = t; return Promise.resolve(); }; true`);
await click("#copyPrompt");
await waitFor(`window.__clip !== null && [...document.querySelectorAll(".toast")].some(t => /Style copied/.test(t.textContent))`, 3000, 50);
const clip = await ev(`({ clip: window.__clip, shown: document.getElementById("metaStyle").textContent,
  toasts: [...document.querySelectorAll(".toast")].map(t => t.textContent).join(" | ") })`);
check("the copy icon in the Style card copies the style as shown", !!clip.shown && clip.clip === clip.shown && /Style copied/.test(clip.toasts),
  (clip.clip || "").slice(0, 60));
t = await hoverOn("#copyPrompt");
check("  it says what it does on hover", t?.on && /Copy the style/.test(t.text));
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 5, y: 5 });

section("LoRAs");
const nativeCheck = (abc) => `(() => { try { const s = YueInstrumental.parse(${JSON.stringify(abc)}); return { vocal: s.voices.Vocal.notes.length,
  ins: s.voices.Ins.notes.length, chords: s.voices.Vocal.chords.length }; } catch (e) { return { error: e.message }; } })()`;
const synthAfter = async (n, ms = 12000) => waitFor(`fetch("/mock/requests").then(r => r.json()).then(a => { const b = a.filter(x => x.path === "/synth").map(x => JSON.parse(x.body));
  return b.length >= ${n} ? b : null; })`, ms, 200);
// HERESY 1167: the adapters not in use behind one line, «Add a LoRA» with their count, closed as it was left
const loraLib = await ev(`(() => { const d = document.querySelector("#loraPicker .lora-lib"), chip = document.querySelector("#loraPicker [data-lora-chip]");
  return { closed: !d.open, name: d.querySelector(".lora-lib-name").textContent, count: d.querySelector(".lora-lib-count").textContent, hidden: !chip.checkVisibility() }; })()`);
check("the adapters not in use are behind one line, «Add a LoRA», with their count", loraLib.closed && loraLib.name === "Add a LoRA" && loraLib.count === "5" &&
  loraLib.hidden, JSON.stringify(loraLib));   // (closed, its chips are not drawn: checkVisibility)
await ev(`(() => { const d = document.querySelector("#loraPicker .lora-lib"); d.open = true; return true; })()`);
await sleep(80);   // its toggle event, then the remembered state
check("  opened, it stays open (this browser keeps it)", (await ev(`localStorage.getItem("yue2.loraLib")`)) === "open");
const loraChips = await ev(`[...document.querySelectorAll("#loraPicker [data-lora-chip]")].map(c => ({ text: c.textContent, off: c.disabled }))`);
check("the picker lists /props loras as even buttons: name, the half it steers, a few words; a broken file is shown but off", loraChips.length === 5 &&
  loraChips.some((c) => /^sv-billie\s*both\s*hushed bedroom pop$/.test(c.text)) && loraChips.some((c) => /^Industrial rock\s*music\s*riffs and drive$/.test(c.text)) &&
  loraChips.some((c) => /^yue2_jpop_t4\s*sound\s*Japanese pop$/.test(c.text)) && loraChips.filter((c) => c.off).length === 1, JSON.stringify(loraChips).slice(0, 300));
const pickGrid = await ev(`(() => { const b = [...document.querySelectorAll("#loraPicker [data-lora-chip]")].map(x => x.getBoundingClientRect());
  return { widths: [...new Set(b.map(r => Math.round(r.width)))], heights: [...new Set(b.map(r => Math.round(r.height)))] }; })()`);
check("  every LoRA button the same size (one grid, not a ragged row)", pickGrid.widths.length === 1 && pickGrid.heights.length === 1, JSON.stringify(pickGrid));
// its tip's words (the picker repaints while songs are made here, and the page closes a tip whose button was redrawn under the
// pointer; the hover itself shows it on a quiet page)
const brokenTip = await ev(`document.querySelector('#loraPicker [data-lora-chip="broken/bad.safetensors"]')?.dataset.tip || ""`);
check("  its tip says why it cannot load", /Cannot load: 1 tensors do not land/.test(brokenTip), brokenTip.slice(0, 80));
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 5, y: 5 });
await ev(`(() => { const set = (id, v) => { document.getElementById(id).value = v; }; set("title", "Lora Song"); set("style", "dark pop, 100 BPM");
  set("lyrics", "[Verse]\\nneon"); set("abc", ""); set("lmSeed", ""); set("soundSeed", ""); set("versions", "1");
  document.getElementById("instrumental").checked = false; document.querySelector('input[name="cot"][value="full"]').click(); return true; })()`);
await click('#loraPicker [data-lora-chip="yue2-jpop-t4-lora/yue2_jpop_t4.safetensors"]');
await click('#loraPicker [data-lora-chip="sv-billie-yue2-lora/sv_billie.safetensors"]');
const loraRows = await ev(`[...document.querySelectorAll("#loraPicker .lora-row")].map(r => [...r.querySelectorAll(".lora-half input")].map(i => i.disabled ? "off" : i.value).join("/"))`);
// HERESY 1016: a row shows only the slider of the half its file has; 1081: the music half starts at its cap, 0.75
check("a tap adds a row with Music and Sound; the half a file lacks is not shown", JSON.stringify(loraRows) === '["1","0.75/1"]', JSON.stringify(loraRows));
const loraHint = await ev(`document.querySelector("#loraPicker .lora-hint").textContent`);
check("  hints: trigger words, and a Direct-trained LoRA used with a score", /jpstyle26/.test(loraHint) && /trained in Direct mode/.test(loraHint), loraHint.slice(0, 120));
// HERESY 1167 (Viktor: «суффиксом приклинивай все триггеры… кнопка не нужна»): the row says the word, the run adds it
check("  the trigger word is said in its row and goes in by itself (no button)", (await ev(`(() => { const w = document.querySelector('#loraPicker .lora-trigger.is-auto');
  return !document.querySelector('#loraPicker [data-trigger]') && !!w && /jpstyle26/.test(w.textContent); })()`)) === true);
// the arrows reach the values the docs and model cards use (each box is put back as it was)
const arrows = await ev(`(() => {
  const up = (el, from) => { const was = el.value; el.value = from; el.stepUp(); const got = el.value; el.value = was; return got; };
  const knob = (g, k) => document.querySelector('input[data-group="' + g + '"][data-key="' + k + '"]');
  return { temp: up(knob("semantic", "temperature"), "0.87"), topP: up(knob("semantic", "top_p"), "0.97"),
    penMusic: up(knob("semantic", "repetition_penalty"), "1.23"), penScore: up(knob("abc", "repetition_penalty"), "1"),
    cfg: up(document.getElementById("cfg"), "1.00") }; })()`);
check("arrows reach documented values: temperature 0.88, top-p 0.975, penalty 1.24 / 1.005, guidance 1.1 (HERESY 1421: tenths)",
  +arrows.temp === 0.88 && +arrows.topP === 0.975 && +arrows.penMusic === 1.24 && +arrows.penScore === 1.005 && +arrows.cfg === 1.1, JSON.stringify(arrows));
const lora375 = await ev(`(() => { const r = document.querySelector('#loraPicker input[data-half="nar"][data-lora="sv-billie-yue2-lora/sv_billie.safetensors"]');
  r.value = "0.375"; r.dispatchEvent(new Event("input", { bubbles: true }));
  const got = { value: r.value, shown: r.nextElementSibling.textContent };
  r.value = "1"; r.dispatchEvent(new Event("input", { bubbles: true })); return got; })()`);
check("  a LoRA half takes a card's 0.375 and shows it as 0.375", lora375.value === "0.375" && lora375.shown === "0.375", JSON.stringify(lora375));
// HERESY 1169 · 1242 (Viktor 08.10.2026: «При наведении мыши на ползунок и при перетаскивании сделай тултип поверх курсора, 16pt»)
const vtipOn = await ev(`(async () => { const r = document.querySelector('#loraPicker input[data-half="nar"][data-lora="sv-billie-yue2-lora/sv_billie.safetensors"]'), b = r.getBoundingClientRect();
  r.value = "0.875"; r.dispatchEvent(new Event("input", { bubbles: true }));
  r.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: b.left + 20, clientY: b.top + 5 }));
  await new Promise((ok) => setTimeout(ok, 50));
  const t = document.querySelector(".lora-vtip"), cs = t && getComputedStyle(t), tb = t && t.getBoundingClientRect();
  const out = { text: t && t.textContent, shown: !!t && !t.hidden, size: cs && cs.fontSize, cls: t && t.className, above: !!tb && tb.bottom <= b.top - 5, tipAside: document.body.classList.contains("lora-vtip-on") };
  const back = document.querySelector('#loraPicker input[data-half="nar"][data-lora="sv-billie-yue2-lora/sv_billie.safetensors"]');
  back.value = "1"; back.dispatchEvent(new Event("input", { bubbles: true }));
  document.getElementById("loraPicker").dispatchEvent(new PointerEvent("pointerleave", { bubbles: false }));
  out.gone = !!t && t.hidden && !document.body.classList.contains("lora-vtip-on");
  return out; })()`);
check("  a LoRA strength stands over the pointer (14 pt since 1268, exact: 0.875) framed in its zone's colour while the pointer is on its slider, the label's tip aside; it goes when the pointer leaves",
  vtipOn.shown && vtipOn.text === "Sound 0.875" && vtipOn.size === "18.6667px" && /is-green/.test(vtipOn.cls || "") && vtipOn.above && vtipOn.tipAside && vtipOn.gone, JSON.stringify(vtipOn));
await ev(`(() => { const r = document.querySelector('#loraPicker input[data-half="ar"][data-lora="sv-billie-yue2-lora/sv_billie.safetensors"]');
  r.value = "0.5"; r.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
// HERESY 1166 (Viktor 04.10.2026: «ползунок Music Together не работает. Подсчёт общей силы не работает»): the music half
// together follows each strength as it is dragged, and drags them all itself, each in proportion (then put back as it was)
await click('#loraPicker [data-lora-chip="yue2-industrial-rock-lora/adapter-ar-179/lora.safetensors"]');
const together = await ev(`(() => { const q = (s) => document.querySelector("#loraPicker " + s), out = () => q(".lora-total output").textContent;
  const billie = () => q('input[data-half="ar"][data-lora="sv-billie-yue2-lora/sv_billie.safetensors"]'),
    rock = () => q('input[data-half="ar"][data-lora="yue2-industrial-rock-lora/adapter-ar-179/lora.safetensors"]');
  const first = out(), r = rock(); r.value = "0.25"; r.dispatchEvent(new Event("input", { bubbles: true }));
  const followed = out(), t = q(".lora-total input"); t.value = "1.5"; t.dispatchEvent(new Event("input", { bubbles: true }));
  t.dispatchEvent(new Event("change", { bubbles: true }));
  return { first, followed, range: t.type, billie: billie().value, rock: rock().value, shown: out(), sum: YueLoras.total().value }; })()`);
check("Music, together: follows each strength as it moves, and drags them all at once, each in proportion",
  together.first === "1.25" && together.followed === "0.75" && together.range === "range" && +together.billie === 1 && +together.rock === 0.5 &&
  together.shown === "1.50" && Math.abs(together.sum - 1.5) < 1e-9, JSON.stringify(together));
await click('#loraPicker [data-remove-lora="yue2-industrial-rock-lora/adapter-ar-179/lora.safetensors"]');
await ev(`(() => { const r = document.querySelector('#loraPicker input[data-half="ar"][data-lora="sv-billie-yue2-lora/sv_billie.safetensors"]');
  r.value = "0.5"; r.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
t = await hoverOn('fieldset [data-tip-ref="tip-loras"]');
check("(i) beside LoRAs explains the two halves", t?.on && /Music/.test(t.text) && /Sound/.test(t.text), t?.text.slice(0, 60));
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 5, y: 5 });
await ev(`document.getElementById("view-engine").classList.remove("is-hidden"); true`);
// HERESY 1166 (Viktor: «раздели блок LoRA на два»): the tiles in two groups, trained here (no web link to a source) and from
// Hugging Face; both counted together here, the split checked below
const engineLoras = await ev(`({ rows: [...document.querySelectorAll("#loraCard > li, #loraCardLocal > li")].map(li => ({ text: li.innerText.replace(/\\s+/g, " "),
  on: li.classList.contains("is-on"), bad: li.classList.contains("is-bad") })), note: document.getElementById("loraCardNote").textContent,
  under: document.getElementById("vaeCard").compareDocumentPosition(document.getElementById("loraCard")) & Node.DOCUMENT_POSITION_FOLLOWING,
  tall: Math.max(...[...document.querySelectorAll("#loraCard > li, #loraCardLocal > li")].map(li => li.offsetHeight)),
  local: [...document.querySelectorAll("#loraCardLocal > li")].map(li => li.dataset.lora), hub: [...document.querySelectorAll("#loraCard > li")].map(li => li.dataset.lora),
  localShown: !document.getElementById("loraGroupLocal").hidden })`);
check("Engine panel lists the LoRAs as tiles under the VAEs: in use marked, a broken file in red", engineLoras.rows.length === 5 && !!engineLoras.under &&
  engineLoras.rows.filter((r) => r.on).length === 2 && engineLoras.rows.filter((r) => r.bad).length === 1 &&
  /5 in loras\/ · 2 in the song form/.test(engineLoras.note), JSON.stringify(engineLoras).slice(0, 200));
check("  every tile stays compact (no text squeezed into a sliver)", engineLoras.tall < 100, `tallest tile ${engineLoras.tall}px`);
check("  the files with no web link to a source stand apart, trained here; the linked ones under From Hugging Face",
  engineLoras.localShown && engineLoras.local.length >= 1 && engineLoras.local.length + engineLoras.hub.length === 5 &&
  engineLoras.hub.includes("sv-billie-yue2-lora/sv_billie.safetensors") && engineLoras.local.includes("yue2-jpop-t4-lora/yue2_jpop_t4.safetensors"),
  JSON.stringify({ local: engineLoras.local, hub: engineLoras.hub }));
const loraSrc = await ev(`(() => { const tile = (id) => document.querySelector('#loraCard > li[data-lora="' + id + '"], #loraCardLocal > li[data-lora="' + id + '"]');
  const billie = tile("sv-billie-yue2-lora/sv_billie.safetensors"), rock = tile("yue2-industrial-rock-lora/adapter-ar-179/lora.safetensors"),
    jpop = tile("yue2-jpop-t4-lora/yue2_jpop_t4.safetensors"), link = billie.querySelector("a.tile-link");
  return { href: link && link.getAttribute("href"), target: link && link.target, text: link && link.textContent,
    info: billie.querySelector(".tile-src .info").dataset.tip, tileTip: billie.hasAttribute("data-tip"),
    rockMeta: rock.querySelector(".lora-item-meta").textContent, rockName: rock.querySelector(".lora-item-name").textContent, jpopRepo: (jpop.querySelector(".tile-repo") || {}).textContent }; })()`);
check("  each LoRA tile links its source (new tab) with an (i) recap beside it", loraSrc.href === "https://example.org/billie" &&
  loraSrc.target === "_blank" && /someone\/sv-billie/.test(loraSrc.text) && /Hushed bedroom pop\./.test(loraSrc.info) &&
  /rank 32/.test(loraSrc.info) && !loraSrc.tileTip, JSON.stringify(loraSrc));
check("  a file with no source entry shows its path; a source can supply a missing trigger word",
  loraSrc.jpopRepo === "no source link" && /trigger rockword/.test(loraSrc.rockMeta) && loraSrc.rockName === "Industrial rock", JSON.stringify(loraSrc));
const vaeTiles = () => ev(`[...document.querySelectorAll("#vaeCard > li")].map(li => ({ name: li.dataset.vae,
  on: String(li.classList.contains("is-on")), buttons: li.querySelectorAll("button").length, kind: (li.querySelector(".kind-badge") || {}).textContent || "",
  href: (li.querySelector("a.tile-link") || { getAttribute: () => "" }).getAttribute("href"), text: li.innerText.replace(/\\s+/g, " ") }))`);
let vt = await vaeTiles();
const formVae = () => ev(`document.querySelector("#decoders input:checked").value`);
const vae0 = await formVae();
check("Engine VAEs are tiles too: no switches, the form's VAE marked, STOCK / ADD-ON badges, links from sources.json (web links only)",
  vt.length === 3 && vt.every((v) => v.buttons === 0) && /in the song form/i.test(vt.find((v) => v.on === "true").text) && vt.filter((v) => v.on === "true").length === 1 && vt.find((v) => v.on === "true").name.toLowerCase() === vae0 &&
  vt[0].kind === "stock" && vt[2].kind === "add-on" && vt[1].kind === "stock" && vt[1].href === "" && vt[2].href === "https://example.org/blend" &&
  /m-a-p\/YuE2-Vae-legacy/.test(vt[1].text) && /engine default/.test(vt[0].text) &&
  /3 decoders · \w+ picked in the ☰ menu/.test(await ev(`document.getElementById("vaeCardNote").textContent`)), JSON.stringify(vt).slice(0, 300));
const vaeInfo = await hoverOn('#vaeCard > li:nth-child(3) .tile-src .info');
check("  the (i) recaps it: what it is and its weights", vaeInfo?.on && /community weight mix/.test(vaeInfo.text) &&
  /Weights: Mothersuperior\/YuE2-Vae-merge-0\.666/.test(vaeInfo.text), vaeInfo?.text.slice(0, 80));
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 5, y: 5 });
const otherVae = vae0 === "legacy" ? "blend" : "legacy";
await click(`#vaeCard > li[data-vae="${otherVae}"]`);
check("  clicking a tile does not change the song's VAE (the form picks it)", (await formVae()) === vae0);
await ev(`document.querySelector('#decoders input[value="${otherVae}"]').click(); true`);
vt = await vaeTiles();
check("  the mark follows the form's VAE buttons", vt.filter((v) => v.on === "true").length === 1 && vt.find((v) => v.on === "true").name === otherVae);
await ev(`document.querySelector('#decoders input[value="${vae0}"]').click(); true`);
check("  and back", (await vaeTiles()).find((v) => v.on === "true").name === vae0);
const loraTiles = await ev(`({ buttons: document.querySelectorAll("#loraCard button, #loraCardLocal button").length,
  marked: [...document.querySelectorAll("#loraCard > li.is-on, #loraCardLocal > li.is-on")].map(li => li.dataset.lora) })`);   // HERESY 1166: both groups
check("  LoRA tiles are for reading (no buttons): the ones in the song form are marked", loraTiles.buttons === 0 &&
  loraTiles.marked.slice().sort().join() === "sv-billie-yue2-lora/sv_billie.safetensors,yue2-jpop-t4-lora/yue2_jpop_t4.safetensors", JSON.stringify(loraTiles));
await ev(`document.getElementById("loraCard").scrollIntoView({ block: "center" }); true`);
await shot("engine-loras");
await ev(`document.getElementById("view-engine").classList.add("is-hidden"); true`);
await mockClear();
await click("#generateBtn");
const loraBody = (await synthAfter(1, 6000) || [])[0];
check("Generate sends the chosen LoRAs and strengths", !!loraBody && JSON.stringify(loraBody.loras) ===
  '[{"id":"yue2-jpop-t4-lora/yue2_jpop_t4.safetensors","ar":0,"nar":1},{"id":"sv-billie-yue2-lora/sv_billie.safetensors","ar":0.5,"nar":1}]',
  JSON.stringify(loraBody && loraBody.loras));
check("  the adapters' trigger words go at the style's end in the request; the field stays as written", !!loraBody &&
  /^dark pop, 100 BPM, /.test(loraBody.style || "") && /jpstyle26/.test(loraBody.style) && (await ev(`document.getElementById("style").value`)) === "dark pop, 100 BPM",
  loraBody && loraBody.style);
await waitFor(`document.getElementById("takeTitle").textContent === "Lora Song" && !document.getElementById("takeBody").classList.contains("is-hidden")`, 12000, 200);
const loraMeta = await ev(`Object.fromEntries([...document.querySelectorAll("#metaGrid [data-field]")].map(d => [d.dataset.field, d.dataset.value]))`);
check("  the song's info lists them", loraMeta?.LoRAs === "yue2_jpop_t4 (sound 1.0), sv-billie (music 0.5 · sound 1.0)", loraMeta?.LoRAs);
const loraRowsShown = await ev(`(() => { const n = [...document.querySelectorAll('#metaGrid [data-field="LoRAs"] .name')], a = [...document.querySelectorAll('#metaGrid [data-field="LoRAs"] .amt')];
  return n.map((e, i) => e.textContent + " = " + a[i].textContent).join(" | "); })()`);
check("  one row per LoRA, its halves together, strengths in their own column", loraRowsShown === "yue2_jpop_t4 = sound 1.00 | sv-billie = music 0.50 · sound 1.00", loraRowsShown);
await click("#clearForm"); await answerDialog(true);   // HERESY 1167: Clear asks first
// HERESY 1168 (Viktor: «Кнопка Clear the Form очищает только формы? Не трогает LoRA и другие параметры? И чем она отличается от
// `Start new song`? Это нужно утрясти»)
const clearedWords = await ev(`[document.querySelectorAll("#loraPicker .lora-row").length, document.getElementById("title").value, document.getElementById("style").value, document.getElementById("lyrics").value].join("|")`);
check("Clear takes the words away and leaves the machine: the LoRAs stay", clearedWords === "2|||", clearedWords);
await click("#newSong"); await answerDialog(true);
check("  New song puts the machine back too: the picker empties", (await ev(`document.querySelectorAll("#loraPicker .lora-row").length`)) === 0);
await click("#reuseTake");
await waitFor(`document.querySelectorAll("#loraPicker .lora-row .lora-name").length >= 2`, 3000, 50);
const loraReused = await ev(`[...document.querySelectorAll("#loraPicker .lora-row .lora-name")].map(n => n.textContent)`);
check("Reuse this take brings its LoRAs back", JSON.stringify(loraReused) === '["yue2_jpop_t4","sv-billie"]', JSON.stringify(loraReused));
const badLora = async (loras) => { const r = await fetch(BASE + "synth", { method: "POST", body: JSON.stringify({ style: "pop", lyrics: "[Verse]\nla", loras }) });
  return r.status + " " + ((await r.json()).error || ""); };
check("the server refuses an unknown LoRA, a broken one, and strengths past 2", /^400 unknown LoRA/.test(await badLora([{ id: "nope.safetensors" }])) &&
  /^400 the LoRA bad cannot load/.test(await badLora([{ id: "broken/bad.safetensors" }])) &&
  /^400 LoRA strengths go from 0 to 2/.test(await badLora([{ id: "yue2-jpop-t4-lora/yue2_jpop_t4.safetensors", ar: 0, nar: 3 }])));
await click("#newSong"); await answerDialog(true);         // HERESY 1168: New song, as Clear did before (the LoRAs go too)
await waitFor(`!document.querySelector(".hd-back")`, 2000, 50);   // HERESY 1167: its backdrop gone before the next hover

section("instrumental (the official recipe)");
t = await hoverOn('[data-tip-ref="tip-instrumental"]');
check("(i) beside Instrumental explains the recipe", t?.on && /vocal note/.test(t.text) && /no spoken words/.test(t.text) && /Melody mode/.test(t.text), t?.text.slice(0, 70));
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 5, y: 5 });
await mockClear();
await ev(`(() => { const set = (id, v) => { document.getElementById(id).value = v; }; set("title", "Inst Song"); set("style", "dark synthwave, 100 BPM");
  set("lyrics", "[Verse]\\nneon rain on the glass\\n\\n[Chorus]\\nwe run"); set("abc", ""); set("lmSeed", ""); set("soundSeed", ""); set("versions", "1");
  document.querySelector('input[name="cot"][value="full"]').click(); document.getElementById("instrumental").checked = true; return true; })()`);
await click("#generateBtn");
const instBodies = await synthAfter(2);
const [instPlan, instRender] = instBodies || [];
check("with no score, Generate plans one first (your lyrics shape it)", !!instPlan && instPlan.plan_only === true && instPlan.cot === "full" &&
  /neon rain/.test(instPlan.lyrics) && instPlan.style === "dark synthwave, 100 BPM", JSON.stringify(instPlan && { plan: instPlan.plan_only, cot: instPlan.cot }));
const renderScore = instRender ? await ev(nativeCheck(instRender.abc)) : {};
check("  then renders it with the vocal line moved to the instrument", !!instRender && !instRender.plan_only && renderScore.vocal === 0 && renderScore.ins > 0,
  JSON.stringify(renderScore));
check("  instrumental style, section-only lyrics, Full mode (the score has chords)", !!instRender &&
  instRender.style === "Instrumental, dark synthwave, 100 BPM, no vocals, no singing, no choir, no spoken words." &&
  instRender.lyrics === "[Intro]\n\n[Verse]\n\n[Chorus]\n" && instRender.cot === "full" && renderScore.chords > 0,
  JSON.stringify(instRender && { style: instRender.style.slice(0, 40), lyrics: instRender.lyrics, cot: instRender.cot }));
check("  it keeps the plan's music seed", !!instRender && !!instPlan && instRender.lm_seed !== undefined, instRender && instRender.lm_seed);
const instTake = await waitFor(`document.getElementById("takeTitle").textContent === "Inst Song" && !document.getElementById("takeBody").classList.contains("is-hidden")`, 12000, 200);
check("  and the song lands", !!instTake);
const formAfter = await ev(`({ style: document.getElementById("style").value, lyrics: document.getElementById("lyrics").value, abcNative: document.getElementById("abc").value.length })`);
check("  your style and lyrics fields are left as written; the converted score is in the score field", formAfter.style === "dark synthwave, 100 BPM" &&
  /neon rain/.test(formAfter.lyrics) && formAfter.abcNative > 0, JSON.stringify(formAfter).slice(0, 120));
// a score already in the field converts straight away: one render, no plan
await mockClear();
await ev(`(() => { const set = (id, v) => { document.getElementById(id).value = v; }; set("title", "Inst Direct"); set("lyrics", "");
  document.querySelector('input[name="cot"][value="off"]').click(); return true; })()`);
await click("#generateBtn");
const direct = await synthAfter(1, 6000);
await sleep(500);   // a check that no second request (a plan) follows: give it the time it would take
const directAll = (await mockGet("mock/requests")).filter((r) => r.path === "/synth").map((r) => JSON.parse(r.body));
check("with a score present it renders straight away, even from Direct mode (the score sets the mode)", !!direct && directAll.length === 1 &&
  !directAll[0].plan_only && directAll[0].cot === "full" && /^Instrumental, /.test(directAll[0].style), JSON.stringify(directAll.map((b) => ({ plan: !!b.plan_only, cot: b.cot }))));
await waitFor(`document.getElementById("takeTitle").textContent === "Inst Direct"`, 12000, 200);
// empty lyrics: the plan gets a bare section skeleton
await mockClear();
await ev(`(() => { const set = (id, v) => { document.getElementById(id).value = v; }; set("title", "Inst Bare"); set("abc", ""); set("lyrics", "");
  document.querySelector('input[name="cot"][value="melody"]').click(); return true; })()`);
await click("#generateBtn");
const bare = await synthAfter(2);
check("with no lyrics the plan gets Intro/Verse/Chorus/Outro, and a chordless (melody) plan renders in Melody mode", !!bare &&
  bare[0].lyrics === "[Intro]\n\n[Verse]\n\n[Chorus]\n\n[Outro]\n" && bare[0].cot === "melody" && bare[1].cot === "melody",
  JSON.stringify(bare && bare.map((b) => ({ plan: !!b.plan_only, cot: b.cot, lyrics: b.lyrics.slice(0, 20) }))));
await waitFor(`document.getElementById("takeTitle").textContent === "Inst Bare"`, 12000, 200);
// the drawer button converts in place and ticks the switch
await ev(`document.getElementById("instrumental").checked = false; document.getElementById("abc").value = ${JSON.stringify("")}; true`);
await click('[data-abc="score"]');
await click("#abcInstrumental");
const drawer = await ev(`({ ticked: document.getElementById("instrumental").checked, score: ${nativeCheck("").replace('YueInstrumental.parse("")', 'YueInstrumental.parse(document.getElementById("abc").value)')},
  toasts: [...document.querySelectorAll(".toast")].map(t => t.textContent).join(" | ") })`);
check("Make instrumental converts the score in the field and ticks Instrumental", drawer.ticked && drawer.score.vocal === 0 && drawer.score.ins > 0 &&
  /vocal notes moved to the instrument/.test(drawer.toasts), JSON.stringify(drawer).slice(0, 160));
await mockClear();
await ev(`document.getElementById("abc").value = "X:1\\nnot a native score"; true`);
await click("#generateBtn");
// the refusal is a toast, not a request: wait for it rather than a fixed pause
await toastSays("/Cannot make this score instrumental/", 3000);
const refusedInst = await ev(`[...document.querySelectorAll(".toast")].map(t => t.textContent).join(" | ")`);
check("a score outside the native dialect is refused with the reason, nothing is sent",
  /Cannot make this score instrumental: Incomplete native two-voice ABC/.test(refusedInst) &&
  (await mockGet("mock/requests")).filter((r) => r.path === "/synth").length === 0, refusedInst.slice(-120));
await ev(`document.getElementById("instrumental").checked = false; document.getElementById("abc").value = ""; true`);

section("a take made as MP3");
await ev(`(() => { const set = (id, v) => { document.getElementById(id).value = v; }; set("title", "Mp3 Song"); set("style", "folk"); set("lyrics", "[Verse]\\nla la");
  set("abc", ""); set("lmSeed", ""); set("soundSeed", ""); set("versions", "1");
  const f = document.getElementById("outFormat"); f.value = "mp3"; f.dispatchEvent(new Event("change")); return true; })()`);
await click("#generateBtn");
const mp3Take = await waitFor(`document.getElementById("takeTitle").textContent === "Mp3 Song" && !document.getElementById("takeBody").classList.contains("is-hidden") &&
  document.querySelector("#libList .take.is-active")?.dataset.name`, 12000, 200);
const mp3View = await ev(`({ audio: document.getElementById("dlTakeAudio").textContent, flac: document.getElementById("dlTakeFlac").classList.contains("is-hidden"),
  mp3: document.getElementById("dlTakeMp3").classList.contains("is-hidden"), rate: document.getElementById("mp3Rate").classList.contains("is-hidden"),
  chip: !!document.querySelector("#libList .take.is-active .take-mp3") })`);
check("an MP3 take offers its own MP3 download, and no FLAC or MP3 conversion", !!mp3Take && mp3View.audio === "MP3" && mp3View.flac && mp3View.mp3 &&
  mp3View.rate && !mp3View.chip, JSON.stringify(mp3View));
const flacRefused = await fetch(BASE + "library/flac?name=" + encodeURIComponent(mp3Take || ""));
check("  and the server refuses a FLAC of it (400)", flacRefused.status === 400);
await ev(`(() => { const f = document.getElementById("outFormat"); f.value = "wav24"; f.dispatchEvent(new Event("change")); return true; })()`);

// HERESY 1168 (Viktor: «когда рендер закончился, она наоборот - исчезла, а не появилась. Автоматический плей был выключен»)
section("Play this song when a run is done and nothing plays");
await ev(`(() => { const a = document.getElementById("audio"); a.pause(); localStorage.setItem("yue2.playNew", "off"); const set = (id, v) => { document.getElementById(id).value = v; };
  set("title", "Play Here Test"); set("style", "English, folk, male voice, guitar, 90 BPM"); set("lyrics", "[Verse]\\nOne small line"); set("abc", ""); set("versions", "1"); return true; })()`);
await click("#generateBtn");
const ranHidden = await waitFor(`!document.getElementById("chain").hidden && document.getElementById("playHere").classList.contains("is-hidden")`, 4000, 50);
const doneShown = await waitFor(`document.getElementById("takeTitle").textContent === "Play Here Test" && !document.getElementById("playHere").classList.contains("is-hidden") && document.getElementById("audio").paused`, 30000, 200);
check("while the song is made nothing is offered to play; when it is done, ▶ Play this song is there (Play new takes off)", !!ranHidden && !!doneShown,
  JSON.stringify({ ranHidden, doneShown }));
const chimeDone = await waitFor(`window.RuachChime.rung.slice(-1)[0] === "done" ? window.RuachChime.rung.join() : null`, 3000, 50);
check("  and two notes up say it is done (1275: a sound when a run ends)", !!chimeDone, await ev(`window.RuachChime.rung.join()`));
await ev(`localStorage.removeItem("yue2.playNew"); true`);

section("delete non-favourites");

await click("#libMenuBtn");
await click("#deleteNonFav");
await answerDialog(true);                                  // HERESY 1057: the studio's own dialog
const onlyFav = await waitFor(`document.querySelectorAll("#libList .take:not(.is-running-row)").length === 1`, 20000, 200);
const left = await serverTakes();
check("Delete non-favourites keeps only the favourite", !!onlyFav && left.length === 1 && left[0].favorite === true, `${left.length} left`);
await shot("library-favourites");

section("loading without waiting");
const loading = await ev(`(() => { const faces = [...document.styleSheets].map((s) => { try { return [...s.cssRules].filter((r) => r instanceof CSSFontFaceRule).map((r) => r.style.getPropertyValue("src")).join(" "); } catch (e) { return ""; } }).join(" ");
  const remote = [...document.querySelectorAll("link[href], script[src]")].map((e) => e.getAttribute("href") || e.getAttribute("src")).filter((u) => u.indexOf("http") === 0 || u.indexOf("//") === 0);
  return { remote, local: faces.indexOf("/lab/fonts/") >= 0, gstatic: faces.indexOf("gstatic") >= 0 || faces.indexOf("googleapis") >= 0, loaded: typeof window.ABCJS, version: window.ABCJS && window.ABCJS.signature }; })()`);
check("the fonts and the score engraver come with the studio itself, no CDN (1274): no remote script or stylesheet, the fonts' faces from /lab/fonts/, abcjs in the page", !loading.remote.length && loading.local && !loading.gstatic && loading.loaded === "object", JSON.stringify(loading));
const late = await ev(`(async () => { const real = window.ABCJS, pause = (ms) => new Promise(r => setTimeout(r, ms));
  window.ABCJS = undefined;
  // open songs until one with a score is showing (the engraver held back all the while)
  let tried = 0;
  for (const t of [...document.querySelectorAll("#libList .take")].filter(t => !t.classList.contains("is-active"))) {
    t.click(); await pause(700); tried++;
    if (document.getElementById("scoreAbc").textContent.startsWith("X:1")) break;
  }
  const waiting = { tried, abc: document.getElementById("scoreAbc").textContent.startsWith("X:1"), svg: !!document.querySelector("#scoreStaff svg"), hook: typeof window.__abcjsLanded };
  window.ABCJS = real; if (window.__abcjsLanded) window.__abcjsLanded(); await pause(300);
  return { ...waiting, drawn: !!document.querySelector("#scoreStaff svg"), staffTab: !document.querySelector('.stab[data-score="staff"]').disabled }; })()`);
check("  a song opened before the engraver lands shows its ABC at once and its staff when the engraver arrives", late.abc && !late.svg && late.hook === "function" &&
  late.drawn && late.staffTab, JSON.stringify(late));

section("a server without transcriber or library");
await fetch(BASE + "mock/flags", { method: "POST", body: JSON.stringify({ transcriber: false, outputs: false }) });
check("the page reloads against the switched-off server", !!(await navigate(0)));
check("no transcriber: the button is off and says how to get one", (await ev(`document.getElementById("coverFromAudio").disabled && /--transcriber/.test(document.getElementById("coverAudioStatus").textContent)`)) === true);
check("no library: the list says the takes stay in this tab", /keeps no library/.test(await ev(`document.getElementById("libList").innerText`)));
await ev(`(() => { const set = (id, v) => { document.getElementById(id).value = v; }; set("title", "Tab Song"); set("style", "folk"); set("lyrics", "[Verse]\\nla la");
  set("abc", ""); set("lmSeed", ""); set("soundSeed", ""); set("versions", "1"); return true; })()`);
await click("#generateBtn");
const tabTake = await waitFor(`document.getElementById("takeTitle").textContent === "Tab Song" && document.getElementById("audio").src.startsWith("blob:")`, 12000);
check("the finished song is fetched from the job and kept in the tab", !!tabTake);
check("  it plays from memory and gets a waveform", !!(await waitFor(`(() => { const c = document.getElementById("wave"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  let cols = 0; for (let i = 0; i < c.width; i++) { for (let j = 0; j < c.height; j++) { if (d[(j * c.width + i) * 4 + 3] > 0) { cols++; break; } } } return cols > c.width * 0.6; })()`, 6000, 250)));
const tabDl = await ev(`["dlTakeFlac", "dlTakeMp3", "mp3Rate"].map(id => document.getElementById(id).classList.contains("is-hidden"))`);
check("  a song kept only in the tab offers no FLAC or MP3 conversion", tabDl.every(Boolean), JSON.stringify(tabDl));
await shot("no-library");
await fetch(BASE + "mock/flags", { method: "POST", body: JSON.stringify({ transcriber: true, outputs: true }) });

// ============================================================ the veil (HERESY 1167)
// Viktor 05.10.2026: «прятать весь сырой рендер DOM, оверлеем `Loading the Sound Heresy`, логотип Студии крупно... таймаут
// оверлея в 5 секунд»; later the same day: «Давай 7. Это стоит того»): never in a test browser; ?veil brings it to one
section("the veil while the page boots");
check("a test browser never gets it (navigator.webdriver)", (await ev(`!document.documentElement.classList.contains("booting") && !document.querySelector(".boot-veil:not([hidden])")?.offsetWidth && navigator.webdriver === true`)) === true);
const veilNow = `(() => { const h = document.documentElement, v = document.getElementById("bootVeil");
  return { booting: h.classList.contains("booting"), veil: !!v, shown: !!v && getComputedStyle(v).display === "flex" && Math.round(v.getBoundingClientRect().width) === innerWidth,
    logo: !!(v && v.querySelector("svg.boot-mark")), words: v ? v.querySelector(".boot-words").textContent : "", t: Math.round(performance.now()) }; })()`;
await ev(`window.__stale = true`);
await send("Page.navigate", { url: BASE + "?veil" });
await waitFor(`!window.__stale && !!document.getElementById("bootVeil") && document.readyState !== "loading"`, 15000, 50);
const veil1 = await ev(veilNow);
check("?veil: it covers the page as it boots, the bar's logo and its words on it", veil1.booting && veil1.shown && veil1.logo && veil1.words === "Loading the Sound Heresy" &&
  veil1.t < 7000, JSON.stringify(veil1));
const lifted = await waitFor(`!document.getElementById("bootVeil")`, 14000, 100);
const veil2 = await ev(veilNow);
check("  it lifts once the page is ready and seven seconds have passed", !!lifted && !veil2.booting && veil2.t >= 7000 && veil2.t < 11000, JSON.stringify(veil2));

// HERESY 1168 (Viktor 06.10.2026: «Когда трек "Move to Trash"… и если проигрывается в данный момент, сразу снимай его с
// проигрыша»): the mock's lab says the take went (nothing moves there); the player lets it go at once
section("a take moved to the trash leaves the player");
const trashName = await ev(`document.querySelector("#libList .take[data-name]:not(.is-running-row)")?.dataset.name`);
const playsIt = `!document.getElementById("audio").paused && document.getElementById("audio").src.includes(${JSON.stringify(encodeURIComponent(trashName))})`;
await click(`#libList .take[data-name="${trashName}"]`);
await sleep(300);
if (!(await ev(playsIt))) {
  await waitFor(`!document.getElementById("playHere").classList.contains("is-hidden")`, 3000, 50);
  await click("#playHere");
}
const trashPlaying = await waitFor(playsIt, 4000);
await mockClear();
await ev(`(() => { const c = document.querySelector('#libList .take[data-name="${trashName}"]'), r = c.getBoundingClientRect();
  c.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: r.left + 20, clientY: r.top + 10 })); return true; })()`);
const trashItem = await waitFor(`[...document.querySelectorAll(".hm-menu button, .hm-menu [role=menuitem]")].some(b => /Move to the trash/.test(b.textContent))`, 3000, 50);
await ev(`[...document.querySelectorAll(".hm-menu button, .hm-menu [role=menuitem]")].find(b => /Move to the trash/.test(b.textContent)).click(); true`);
await answerDialog(true);
const letGo = await waitFor(`document.getElementById("playbar").classList.contains("is-empty") && document.getElementById("audio").paused && !document.getElementById("audio").getAttribute("src")`, 4000, 50);
const trashSent = (await mockGet("mock/requests")).filter((r) => r.path === "/lab/trash").map((r) => r.body);
check("the take playing, moved to the trash from its menu, leaves the player at once (nothing loaded, silent)",
  !!trashPlaying && !!trashItem && !!letGo && trashSent.some((b) => b.includes('"move"') && b.includes(trashName)), JSON.stringify({ trashPlaying, trashItem, letGo, trashSent }));

// HERESY 1168 (Viktor: «было бы круто иметь в читшит максимальный список музыкальных тегов/маркеров для промпта лирики»)
section("the cheat-sheet's lyrics tags");
await ev(`(() => { document.querySelector('#tabs [data-tab="create"]').click(); const a = document.getElementById("lyrics"); a.value = "[Verse]\\nодна строка"; a.focus(); a.setSelectionRange(a.value.length, a.value.length);
  document.getElementById("hiOpen").click(); return true; })()`);
await waitFor(`!!document.querySelector('[data-hi-tab="tags"]')`, 3000, 50);
await ev(`document.querySelector('[data-hi-tab="tags"]').click(); true`);
await sleep(200);
const tagsTab = await ev(`(() => { const b = [...document.querySelectorAll("[data-hi-lyr]")]; const ch = b.find(x => x.dataset.hiLyr === "[Chorus]"), was = document.getElementById("lyrics").value;
  ch.click(); window.__tagsWas = was; const hand = b.find(x => x.dataset.hiLyr === "ע"); return { n: b.length, chorus: !!ch, hand: !!hand, lyrics: document.getElementById("lyrics").value }; })()`);
await ev(`document.getElementById("hiClose").click(); true`);
check("the cheat-sheet has the lyrics' tags (the official examples' and the phonetic hand); a click only copies a tag, the lyrics stay (HERESY 1265: «[» offers them in the editor)",
  tagsTab.n >= 40 && tagsTab.chorus && tagsTab.hand && tagsTab.lyrics === (await ev(`window.__tagsWas`)) && !/\[Chorus\]/.test(tagsTab.lyrics), JSON.stringify(tagsTab));

// HERESY 1168 (Viktor 06.10.2026: «В фильтр в Воркспейсах добавь Звезду»): the star among the Librarian's filters. The mock
// keeps no collection (the lab's), so its takes are not there to filter: the chip itself, its place, its drawing, its press
section("the Librarian's star among the filters");
await ev(`document.querySelector('#tabs [data-tab="collection"]').click(); true`);
await sleep(700);
await ev(`(() => { const p = document.querySelector('#collSide [data-place=""]'); if (p) p.click(); document.getElementById("collFilterBtn").click(); return true; })()`);
await waitFor(`!!document.querySelector(".hd-back.is-on .hd-pick")`, 3000, 50);
const star = await ev(`(() => { const box = document.querySelector(".hd-back.is-on .hd-pick"), i = box && box.querySelector('input[data-v="__starred"]'), d = box && box.querySelector('input[data-v="__disliked"]');
  if (!i) return null; const row = i.closest(".hd-check"); i.click(); const on = i.checked && row.classList.contains("is-on"); i.click();
  const out = { svg: !!row.querySelector("svg"), beside: !!d && d.closest(".hd-check").nextElementSibling === row, label: row.querySelector(".hd-item-label").textContent, on, off: !i.checked && !row.classList.contains("is-on"), seen: !!row.offsetParent };
  box.querySelector(".hd-no").click(); return out; })()`);
await sleep(200);
await ev(`window.__noReload = 1; true`);
await send("Input.dispatchKeyEvent", { type: "keyDown", key: "F5", code: "F5", windowsVirtualKeyCode: 116 });
await send("Input.dispatchKeyEvent", { type: "keyUp", key: "F5", code: "F5", windowsVirtualKeyCode: 116 });
await sleep(600);
const f5 = await ev(`({ same: window.__noReload === 1, said: [...document.querySelectorAll(".toast")].some(t => /library read again/.test(t.textContent)) })`);
await ev(`document.querySelector('#tabs [data-tab="create"]').click(); true`);
await sleep(400);
// HERESY 1168 (Viktor: «ты говорил, что перехватишь F5 в Библиотеке»)
check("F5 in the Librarian reads the library again and keeps the page", f5.same && f5.said, JSON.stringify(f5));
check("the star stands beside the thumbs in the filter's window, drawn as the cards' star, and ticks and unticks", !!star && star.svg && star.beside && star.label === "favourites" &&
  star.on && star.off && star.seen, JSON.stringify(star));

// HERESY 1168 (Viktor: «Кнопка копирования в буфер не копирует стиль и карты трека… И из Prompt тоже»): opened by the
// machine's address the page is no secure context and has no navigator.clipboard; its own copy stands in. Here (localhost,
// secure) the stand-in is tried by hand: the browser's copy command answered by the test, the text it was given read back
section("copying where the browser gives no clipboard");
const copied = await ev(`(() => { const real = document.execCommand.bind(document); let got = null;
  document.execCommand = (cmd) => { if (cmd === "copy") { got = document.activeElement && document.activeElement.value; return true; } return real(cmd); };
  return window.ruachCopyText("cyberpunk electro-pop, 125 BPM").then(() => { document.execCommand = real; return got; }, (e) => { document.execCommand = real; return "refused: " + e.message; }); })()`);
check("the page's own copy puts the text on the clipboard (the stand-in for http://192.168.… where there is no navigator.clipboard)",
  copied === "cyberpunk electro-pop, 125 BPM", String(copied));

section("page health");
check("no script errors during the whole run", errors.length === 0, errors.slice(0, 3).join(" | ") || "none");
await finish(failed ? 1 : 0);   // prints the report, stops Chrome and the mock
