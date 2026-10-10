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
check("  with the logo in the bar, the Trainer stands right of it, level with the rooms, clear of the workspace; the bar of one height, the logo with it, when the room scrolls (1266)",
  barWide.logoShown && barWide.sideLeft > barWide.logoRight && barWide.sideLeft - barWide.logoRight < 40 && Math.abs(barWide.sideMid - barWide.tabsMid) <= 1 &&
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
  /♂ baritenor · 117 Hz/.test(voiceA.folder) && /♂ baritenor · 117 Hz/.test(voiceA.set) && /male · baritenor/.test(voiceA.line) && voiceA.speech && voiceA.name === "voice-ru-m-baritenor-117" &&
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
  return { framed: g.length === 4 && g.every(x => cs(x).borderTopStyle === "solid" && parseFloat(cs(x).borderTopWidth) >= 1),
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
  recipe: [...document.querySelectorAll("#setupLib option")].some(o => /Russian · conservative/.test(o.textContent)) }; })()`);
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
  // HERESY 1270: Draw is Stop while a run draws: the running one done first, then Draw
  window.__ar7Runs.forEach((r) => { if (r.status === "running") r.status = "done"; });
  for (let i = 0; i < 60 && $("arDraw").classList.contains("is-stop"); i++) await wait(100);
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
check("the unfolded log grows wider for a column of the cards (600 → 720 px at 1920, 1272: 180 px under 1264's 900)", g64.gpus && g64.w >= 700 && g64.w <= 740 && g64.w - (g64.w0 > 500 ? g64.w0 : 600) >= 100, JSON.stringify({ w0: g64.w0, w: g64.w, gpus: g64.gpus }));
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
section("the Artist's Draw is Stop while a run draws");
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
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), b = document.getElementById("arDraw");
  const o = { text: b.textContent, stop: b.classList.contains("is-stop"), enabled: !b.disabled };
  document.getElementById("arPrompt").value = "Another boat."; document.getElementById("arPrompt").dispatchEvent(new Event("input", { bubbles: true }));
  document.getElementById("arPrompt").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true, cancelable: true }));
  await wait(200);
  b.click();
  for (let i = 0; i < 50 && b.classList.contains("is-stop"); i++) await wait(100);
  const st = document.querySelector('.ar-run[data-id="20261009-170000-eeee"] .ar-state');
  o.asked = window.__ar70Asked; o.after = b.textContent; o.stopAfter = b.classList.contains("is-stop"); o.state = st ? st.textContent : "";
  window.fetch = window.__ar70Fetch;
  return o; })()`);
await ev(`document.querySelector('.topbar [data-tab="' + ${JSON.stringify(ar70Was || "create")} + '"]').click(); true`);
await sleep(300);
check("the Artist's Draw is Stop while a run draws (Ctrl+Enter draws no second run meanwhile); Stop asks the lab to stop that run, the run says stopped, and the button is Draw again",
  ar70.text === "Stop" && ar70.stop && ar70.enabled && ar70.asked.length === 1 && ar70.asked[0].id === "20261009-170000-eeee" && ar70.after === "Draw" && !ar70.stopAfter && /^stopped/.test(ar70.state),
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
check("  the prompt's edge widens its column (→ 16 px, kept), a double click gives it its 380 px back", ar71.edge.w1 === ar71.edge.w0 + 16 && ar71.edge.kept === String(ar71.edge.w1) &&
  ar71.edge.back === 380 && ar71.edge.gone === null, JSON.stringify(ar71.edge));

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

// HERESY 1169 · 1286 (Viktor 09.10.2026: «OSEM с девизом сделай на 20% крупнее, дай больше пространства между Лого и OSEM, а также сам прогресс бар опусти в подвал, 160 пикселов от пола»)
section("the veil: the slogan larger and further from the logo, the line at the foot");
await send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
const bv86 = await ev(`(() => {
  const h = document.documentElement, had = h.classList.contains("booting"), v = document.getElementById("bootVeil");
  h.classList.add("booting"); h.classList.remove("veil-lift", "i18n-wait");
  const r = (s) => { const e = v.querySelector(s).getBoundingClientRect(); return { top: Math.round(e.top), bottom: Math.round(e.bottom), cx: Math.round(e.left + e.width / 2) }; };
  const o = { logo: r(".boot-logo"), osem: r(".boot-osem"), words: r(".boot-words"), line: r(".boot-line"), vh: window.innerHeight, vw: window.innerWidth,
    font: parseFloat(getComputedStyle(v.querySelector(".boot-osem")).fontSize) };
  if (!had) h.classList.remove("booting");
  return o; })()`);
check("the veil: OSEM a fifth larger (19.2 px at 1920), 50 px or more under the logo; the line 160 px above the floor, in the middle; the words stay under the slogan",
  Math.abs(bv86.font - 19.2) < 0.3 && bv86.osem.top - bv86.logo.bottom >= 50 && Math.abs(bv86.vh - bv86.line.bottom - 160) <= 1 &&
  Math.abs(bv86.line.cx - bv86.vw / 2) <= 2 && bv86.words.top > bv86.osem.bottom && bv86.words.bottom < bv86.line.top, JSON.stringify(bv86));

// HERESY 1169 · 1287 (Viktor 09.10.2026: «Ручной пресет памяти не даёт мне выбрать объём VRAM из доступных 16GB VRAM. В реалии я бы на этом железе выбрал бы 14GB, чтобы не было OOM»)
section("the memory preset: Auto within N GB, under the card's own size");
const mp87 = await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)), sel = document.getElementById("memPreset");
  document.getElementById("engineToggle").click(); await wait(300);
  const o = { opts: [...sel.options].map((x) => x.value), was: sel.value, ctx: document.getElementById("setMaxSeq").value, vae: document.getElementById("setVaeCore").value };
  const pick = [...sel.options].map((x) => x.value).filter((v) => /^auto:/.test(v))[0];
  o.pick = pick;
  if (pick) { sel.value = pick; sel.dispatchEvent(new Event("change", { bubbles: true })); await wait(100);
    o.set = { ctx: document.getElementById("setMaxSeq").value, vae: document.getElementById("setVaeCore").value, label: sel.selectedOptions[0].textContent }; }
  sel.value = o.was; document.getElementById("setMaxSeq").value = o.ctx; document.getElementById("setVaeCore").value = o.vae;
  document.getElementById("engineToggle").click(); await wait(300);
  if (document.querySelector(".hd-back.is-on:not(.is-leaving) .hd-no")) { document.querySelector(".hd-back.is-on:not(.is-leaving) .hd-no").click(); await wait(300); }
  return o; })()`);
check("Auto within N GB offered under the card's own size, down to 8 GB; choosing one sets that budget's knobs (its context and VAE tiles), as Auto does",
  mp87.opts[0] === "auto" && mp87.opts[mp87.opts.length - 1] === "manual" && (!mp87.pick || (/^Auto within \d+ GB: /.test(mp87.set.label) && mp87.set.ctx !== "" && mp87.set.vae !== "")),
  JSON.stringify(mp87));

// HERESY 1169 · 1288 (Viktor's screenshot of 09.10.2026: «The studio's 💎 set c»; «можно будет в Пинокио Ctrl+N использовать»)
section("the seconds' pattern takes numbers only; Ctrl+N is New song");
const i88 = await ev(`(() => { const L = window.RuachI18n; const o = {};
  ["ru", "uk", "be", "el", "es", "it"].forEach((c) => { o[c] = [L.look("The studio's 💎 sets", c), L.look("Open the sets", c), L.look("12s", c), L.look("2.5s", c)]; });
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
check("the Librarian's filter is a button at the end of the search row (the search 240–320 px wide, the old row gone): its window holds three groups (made · marked · has), thirteen ticks each with an icon and a count of the place, the logic AND · OR · NOR and Show; two ticked with OR show «2 · OR» on the button and come back ticked; Clear and Show take them off",
  fsearch.min === "240px" && fsearch.max === "320px" && fsearch.last && fsearch.barGone && fsearch.icon && !!fpop && fpop.groups === "Made|Marked|Has" && fpop.items === 13 && fpop.icons && fpop.counts &&
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
check("arrows reach documented values: temperature 0.88, top-p 0.975, penalty 1.24 / 1.005, guidance 1.01",
  +arrows.temp === 0.88 && +arrows.topP === 0.975 && +arrows.penMusic === 1.24 && +arrows.penScore === 1.005 && +arrows.cfg === 1.01, JSON.stringify(arrows));
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
