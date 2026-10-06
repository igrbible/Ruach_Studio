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
guard(240);
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
  await ev(`localStorage.setItem("yue2.playOn", "off"); localStorage.setItem("yue2.clickPlay", "off"); localStorage.setItem("yue2.playNew", "off"); true`);
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
  check("engine open: its own page (the song workspace steps aside), the Engine band under the top bar (tall at the top from 1660 px), the Engine button lit",
    !eng.wsShown && eng.headTop === eng.bar && eng.bar === (w >= 1660 ? 98 : 52) && eng.lit && /Engine/.test(eng.title), JSON.stringify(eng));
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
    back.doc <= back.vh && back.wsTop === back.bar && back.bar === (w >= 1660 ? 98 : 52) && back.wsBottom <= back.pb + 1, JSON.stringify(back));
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
check("drawer headings: the name on one line with its sentence under it, even in the narrowest column", heads.length === 5 &&
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
check("  the player is one row in the Creator (the waveform beside the transport)", kPlayer.h <= 72 && kPlayer.oneRow, JSON.stringify(kPlayer));
await click("#libUnfold");
await sleep(250);
const kCards = await ev(`[...document.querySelectorAll("#libList .take[data-name]")].slice(0, 5).map(c => Math.round(c.getBoundingClientRect().height))`);
check("  the takes in compact cards: the title, then its marks, length, workspace and votes on one line", kCards.length > 0 && kCards.every(h => h >= 30 && h <= 66),
  JSON.stringify(kCards));
const kClosed = await ev(`(() => { const d = document.getElementById("coverDrawer"), card = document.querySelector(".k-card.k-sound");
  return { open: d.open, drawer: getComputedStyle(d).backgroundColor, card: getComputedStyle(card).backgroundColor }; })()`);
check("  a closed drawer stands on a ground of its own, not the card's", !kClosed.open && kClosed.drawer !== kClosed.card && kClosed.drawer !== "rgba(0, 0, 0, 0)",
  JSON.stringify(kClosed));

// ================================================================== fonts
section("fonts (Engine page)");
const fontMenu = await ev(`(() => { const s = document.getElementById("fontSans"), kids = [...s.children], hr = kids.findIndex(k => k.tagName === "HR");
  const cards = [...document.querySelectorAll("#view-engine .engine-grid > .card")];
  return { first: kids.slice(0, hr).map(k => k.textContent), hr, system: kids.slice(hr + 1).map(k => k.value), value: s.value,
    heading: document.getElementById("fontHeading").options[0].textContent, mono: document.getElementById("fontMono").value,
    card: cards.findIndex(c => c.id === "appearanceCard"), about: cards.findIndex(c => c.id === "aboutCard"), n: cards.length }; })()`);
check("Fonts: the app's fonts first (the default marked), a line, then the fonts this computer has", fontMenu.first.join() === "Noto Sans (default),Noto Sans Mono,IBM Plex Sans,IBM Plex Mono,Bodoni Moda,Space Grotesk,Michroma" &&
  fontMenu.hr === 7 && fontMenu.system.length >= 1 && fontMenu.value === "Noto Sans" && fontMenu.heading === "Same as the text (default)" &&
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
const lookReset = await ev(`({ attrs: ["hover", "glow", "motion", "corners"].filter(k => k in document.documentElement.dataset).join(), saved: localStorage.getItem("yue2.look"),
  theme: document.documentElement.dataset.theme })`);
check("  Default look brings Viktor's look back (hover, glow, softer corners; the theme stays)", lookReset.attrs === "hover,glow,corners" && lookReset.saved === null && lookReset.theme === "studio", JSON.stringify(lookReset));
const pickFont = (id, value) => ev(`(() => { const s = document.getElementById("${id}"); s.value = ${JSON.stringify(value)}; s.dispatchEvent(new Event("change")); return s.value; })()`);
const fontsNow = `(() => ({ body: getComputedStyle(document.body).fontFamily, head: getComputedStyle(document.querySelector(".col-head h2")).fontFamily,
  saved: localStorage.getItem("yue2.fonts") }))()`;
const sysFont = fontMenu.system[0];
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
for (const v of ["legacy", "blend", "standard", "legacy"]) {
  await click(`#decoders input[value="${v}"]`);
  await waitFor(`document.querySelector('#decoders input[value="${v}"]').checked`, 2000, 20);
  picks.push(await ev(`[...document.querySelectorAll("#decoders input:checked")].map(i => i.value).join("+")`));
}
check("ticking one unticks the others", picks.join(",") === "legacy,blend,standard,legacy", picks.join(" -> "));
check("the pick is remembered in this browser", (await ev(`localStorage.getItem("yue2.vae")`)) === "legacy");
await boot();
check("the pick survives a reload", (await ev(`document.querySelector("#decoders input:checked")?.value`)) === "legacy");

// ==================================================================== tips
section("info tips");
// each VAE's name (not the label's centre: the ADD-ON badge inside the label has a tip of its own)
t = await hoverOn('#decoders label:has(input[value="standard"]) .vae-name');
check("hover Standard: the quality choice and the newer model, and its repo", t?.on && /quality/.test(t.text) && /newer model/.test(t.text) &&
  t.text.includes("m-a-p/YuE2-Vae"), t?.text);
t = await hoverOn('#decoders label:has(input[value="legacy"]) .vae-name');
check("hover Legacy: the older decoder behind the benchmarks, and its repo", t?.on && /older/.test(t.text) && /benchmark/.test(t.text) &&
  t.text.includes("m-a-p/YuE2-Vae-legacy"), t?.text);
t = await hoverOn('#decoders label:has(input[value="blend"]) .vae-name');
check("hover Blend: the mix, \u2154 Standard and \u2153 Legacy, and its repo", t?.on && t.text.includes("\u2154 Standard and \u2153 Legacy") &&
  t.text.includes("Mothersuperior/YuE2-Vae-merge-0.666"), t?.text);
check("  Blend no longer spells the mix out beside its name", (await ev(`document.querySelector('#decoders label:has(input[value="blend"]) small')`)) === null &&
  (await ev(`document.querySelector('#decoders label:has(input[value="standard"]) small')?.textContent`)) === "best sound");
t = await hoverOn('#decoders label:has(input[value="blend"]) .kind-badge');
check("  its ADD-ON badge explains add-on", t?.on && /third party/i.test(t.text), t?.text);
t = await hoverOn('[data-tip-ref="tip-vae"]');
check("(i) beside VAE explains it and lists the server's three", t?.on && /VAE · sound decoder/i.test(t.text) && t.text.includes("m-a-p/YuE2-Vae-legacy") && t.text.includes("Mothersuperior"), t?.text.split("\n")[0]);
check("  the tip sits inside the window", inView(t));
await shot("tip-vae");
t = await hoverOn('#sliderChips [data-slider="metal"]');
check("hover a slider chip says what it does, that it is an add-on, and its id", t?.on && /Heavy guitar riffs/.test(t.text) && /Add-on slider/.test(t.text) &&
  t.text.includes("metal"), t?.text.replace(/\n/g, " | "));
t = await hoverOn('[data-tip-ref="tip-sliders"]');
check("(i) beside Sliders says they are an add-on, not stock, and a cousin of a LoRA", t?.on && /add-on, not stock/i.test(t.text) &&
  /cousin of a LoRA/.test(t.text), t?.text.split("\n")[0]);
t = await hoverOn('[data-tip-ref="tip-seeds"]');
check("(i) beside the seeds explains music vs sound", t?.on && /Music/.test(t.text) && /Sound/.test(t.text), t?.text.split("\n")[0]);
await ev(`document.getElementById("coverDrawer").open = true; document.getElementById("outDrawer").open = true; true`);
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
  const abc = document.getElementById("abc"); abc.value = "X:1"; rm.click(); const cleared = abc.value === "";
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
await ev(`document.querySelector('[data-tip-ref="tip-vae"]').focus()`);
await waitFor(tipOn, 2000, 50);
check("tabbing onto (i) shows the tip too", (await ev(tipOn)) === true);
await ev(`document.activeElement.blur(); document.getElementById("coverDrawer").open = false; document.getElementById("outDrawer").open = false; true`);

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
check("  the buttons sit in Download, Make again, Refiner and Files", layout.groups === "Download,Make again,Refiner,Files", layout.groups);   // the Refiner room's door
check("  the details are one compact card: Song | Sound | Shape, Sliders | LoRAs, then the seeds with copy buttons", layout.sections === "Song,Sound,Shape,Sliders,LoRAs" && layout.copies === 2, layout.sections);
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
check("6 versions with 4 per pass queue two jobs (4 + 2 songs)", parsed.length === 2 && parsed[0].lm_batch_size === 4 && parsed[1].lm_batch_size === 2,
  parsed.map((p) => p.lm_batch_size).join(" + "));
check("the second pass continues the music seeds (1000, 1004)", parsed[0]?.lm_seed === "1000" && parsed[1]?.lm_seed === "1004", parsed.map((p) => p.lm_seed).join(", "));
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
await shot("take-versions");
await click(`#libList .take[data-name="${cdpTake}"]`);
await waitFor(`document.getElementById("takeTitle").textContent === "CDP Song"`, 3000);
await click("#retakeTake");
const reused = await waitFor(`!document.getElementById("codesNote").classList.contains("is-hidden") ? { title: document.getElementById("title").value,
  seed: document.getElementById("lmSeed").value, sound: document.getElementById("soundSeed").value, vae: document.querySelector("#decoders input:checked").value,
  note: document.getElementById("codesNoteText").textContent } : null`, 4000);
check("Retake loads its exact request, codes included", reused?.title === "CDP Song" && reused?.seed === "9223372036854775000" && reused?.sound === "12345" &&
  reused?.vae === "legacy" && /same music/.test(reused?.note || ""), JSON.stringify(reused));
await mockClear();
await click("#generateBtn");
const reuseBody = await waitFor(`fetch("/mock/requests").then(r => r.json()).then(a => a.filter(x => x.path === "/synth").map(x => x.body)[0] || null)`, 5000);
check("  Generate then renders those codes again, parent set", !!reuseBody && JSON.parse(reuseBody).semantic_tokens === par.semantic_tokens &&
  JSON.parse(reuseBody).parent === cdpTake);
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
check("the player shows just the song's name; its style prompt is on hover", (await ev(`!document.getElementById("playbarStyle")`)) === true && t?.on &&
  t.text === (await ev(`document.querySelector("#libList .take.is-playing .take-style")?.textContent || ""`)), t?.text);
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
  return { shown: !document.getElementById("playHere").classList.contains("is-hidden"), gap: Math.round(b.left - t.right), sameLine: Math.abs((b.top + b.bottom) / 2 - (t.top + t.bottom) / 2) < 16 }; })()`);
check("▶ Play this song sits on the left, right after the song's title", playPlace.shown && playPlace.gap >= 0 && playPlace.gap <= 24 && playPlace.sameLine, JSON.stringify(playPlace));
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
check("the bottom bar: Takes and two slim buttons of one size together on the right, no model-loading text", bar.label === "Takes" && bar.plan === bar.gen &&
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
await click('#libList .is-running-row');                    // the running one is listed first
await waitFor(`document.getElementById("takeTitle").textContent === "Cancel Me" && document.getElementById("runState").dataset.s === "running"`, 4000);
await click("#cancelRun");
check("Cancel run stops the running job", !!(await waitFor(`document.getElementById("runState").dataset.s === "cancelled"`, 8000)));
check("  and the cancelled queued job never runs", !!(await waitFor(`!document.querySelector("#libList .is-running-row") &&
  ![...document.querySelectorAll("#libList .take-title")].some(e => e.textContent === "Queued Me")`, 8000)));
await ev(`document.getElementById("style").value = "fail test MOCK-FAIL"; document.getElementById("title").value = "Fail Me"; true`);
await click("#generateBtn");
const failedRun = await waitFor(`document.getElementById("runState").dataset.s === "failed" && !document.getElementById("runError").classList.contains("is-hidden")`, 10000);
check("a failed run shows the server's error", !!failedRun, await ev(`document.getElementById("runError").textContent`));
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
check("  ODE steps explains the default, the cost of 64, and that the music does not change", t?.on && /32 is the release setting/.test(t.text) &&
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
check("  ODE steps reads the same here and in the other console's engine card", sharedSame === true);

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
t = await hoverOn('[data-tip-ref="tip-vae"]');
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
check("＋ New song empties the form: fields, seed, score, mode, Instrumental, versions, LoRAs, sampling", blank.fields === "" && blank.cot === "off" && /* HERESY 1167: Direct by default */
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
await waitFor(`window.__clip !== null && [...document.querySelectorAll(".toast")].some(t => /Prompt copied/.test(t.textContent))`, 3000, 50);
const clip = await ev(`({ clip: window.__clip, shown: document.getElementById("metaStyle").textContent,
  toasts: [...document.querySelectorAll(".toast")].map(t => t.textContent).join(" | ") })`);
check("the copy icon in the Prompt card copies the prompt as shown", !!clip.shown && clip.clip === clip.shown && /Prompt copied/.test(clip.toasts),
  (clip.clip || "").slice(0, 60));
t = await hoverOn("#copyPrompt");
check("  it says what it does on hover", t?.on && /Copy the prompt/.test(t.text));
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
check("arrows reach documented values: temperature 0.88, top-p 0.975, penalty 1.24 / 1.005, guidance 1.01",
  +arrows.temp === 0.88 && +arrows.topP === 0.975 && +arrows.penMusic === 1.24 && +arrows.penScore === 1.005 && +arrows.cfg === 1.01, JSON.stringify(arrows));
const lora375 = await ev(`(() => { const r = document.querySelector('#loraPicker input[data-half="nar"][data-lora="sv-billie-yue2-lora/sv_billie.safetensors"]');
  r.value = "0.375"; r.dispatchEvent(new Event("input", { bubbles: true }));
  const got = { value: r.value, shown: r.nextElementSibling.textContent };
  r.value = "1"; r.dispatchEvent(new Event("input", { bubbles: true })); return got; })()`);
check("  a LoRA half takes a card's 0.375 and shows it as 0.375", lora375.value === "0.375" && lora375.shown === "0.375", JSON.stringify(lora375));
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
  /3 decoders · \w+ picked in the form/.test(await ev(`document.getElementById("vaeCardNote").textContent`)), JSON.stringify(vt).slice(0, 300));
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
check("Clear empties the picker", (await ev(`document.querySelectorAll("#loraPicker .lora-row").length`)) === 0);
await click("#reuseTake");
await waitFor(`document.querySelectorAll("#loraPicker .lora-row .lora-name").length >= 2`, 3000, 50);
const loraReused = await ev(`[...document.querySelectorAll("#loraPicker .lora-row .lora-name")].map(n => n.textContent)`);
check("Reuse this take brings its LoRAs back", JSON.stringify(loraReused) === '["yue2_jpop_t4","sv-billie"]', JSON.stringify(loraReused));
const badLora = async (loras) => { const r = await fetch(BASE + "synth", { method: "POST", body: JSON.stringify({ style: "pop", lyrics: "[Verse]\nla", loras }) });
  return r.status + " " + ((await r.json()).error || ""); };
check("the server refuses an unknown LoRA, a broken one, and strengths past 2", /^400 unknown LoRA/.test(await badLora([{ id: "nope.safetensors" }])) &&
  /^400 the LoRA bad cannot load/.test(await badLora([{ id: "broken/bad.safetensors" }])) &&
  /^400 LoRA strengths go from 0 to 2/.test(await badLora([{ id: "yue2-jpop-t4-lora/yue2_jpop_t4.safetensors", ar: 0, nar: 3 }])));
await click("#clearForm"); await answerDialog(true);
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

section("delete non-favourites");

await click("#libMenuBtn");
await click("#deleteNonFav");
await answerDialog(true);                                  // HERESY 1057: the studio's own dialog
const onlyFav = await waitFor(`document.querySelectorAll("#libList .take:not(.is-running-row)").length === 1`, 20000, 200);
const left = await serverTakes();
check("Delete non-favourites keeps only the favourite", !!onlyFav && left.length === 1 && left[0].favorite === true, `${left.length} left`);
await shot("library-favourites");

section("loading without waiting");
const loading = await ev(`(() => { const f = document.querySelector('link[href*="fonts.googleapis.com/css2"]'), a = document.querySelector('script[src*="abcjs"]');
  return { fonts: f && f.getAttribute("onload") === "this.media='all'", engraver: a && a.defer && /__abcjsLanded/.test(a.getAttribute("onload") || ""), loaded: typeof window.ABCJS }; })()`);
check("the fonts and the score engraver load beside the page, never in front of it", loading.fonts && loading.engraver && loading.loaded === "object", JSON.stringify(loading));
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

section("page health");
check("no script errors during the whole run", errors.length === 0, errors.slice(0, 3).join(" | ") || "none");
await finish(failed ? 1 : 0);   // prints the report, stops Chrome and the mock
