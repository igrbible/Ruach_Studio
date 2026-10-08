// A quick probe (not a check): do the lyrics' mirrors wrap as the box does at page zooms 100–150 %? Each config: the box's scrollHeight against each mirror's (equal when every line wraps alike).   node tools/claude-wrap-probe.mjs LYRICS.txt
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { findChrome, HOME, TMP, env, sleep, until, makeSend, ensurePage, startMock, finish, guard, onCleanup, stopChrome, chromeTmp } from "./cdp-common.mjs";
guard(400);
ensurePage();
const lyrics = readFileSync(process.argv[2], "utf8");
const { base } = await startMock(TMP + "/mock-outputs/wrapprobe");
const profile = join(HOME, "wrapprobe-" + process.pid), tmpdir = chromeTmp(TMP);
rmSync(profile, { recursive: true, force: true });
mkdirSync(join(profile, "Default"), { recursive: true });
const chrome = spawn(findChrome(), ["--headless=new", "--disable-gpu", "--no-first-run", "--mute-audio", "--window-size=1920,1080", "--user-data-dir=" + profile, "--remote-debugging-port=0", "about:blank"], { env: { ...env, TMPDIR: tmpdir }, stdio: ["ignore", "ignore", "ignore"] });
onCleanup(() => stopChrome(chrome, profile, tmpdir));
let port = null;
for (let i = 0; i < 200 && !port; i++) { await sleep(200); try { port = readFileSync(join(profile, "DevToolsActivePort"), "utf8").split("\n")[0].trim() || null; } catch { } }
const target = await until(async () => { try { return (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((x) => x.type === "page"); } catch { return null; } }, 10000, 200);
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((ok) => ws.addEventListener("open", ok, { once: true }));
let seq = 0; const pending = new Map();
ws.addEventListener("message", (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { const f = pending.get(d.id); pending.delete(d.id); f(d); } });
const send = makeSend(ws, pending, () => ++seq);
const ev = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result && r.result.exceptionDetails) return { error: (r.result.exceptionDetails.exception || {}).description || r.result.exceptionDetails.text }; return r.result && r.result.result ? r.result.result.value : r; };
await send("Page.enable"); await send("Runtime.enable");
await send("Page.navigate", { url: base });
await until(async () => (await ev(`document.readyState === "complete" && !!document.getElementById("lyrics")`)) === true, 30000, 200);
await sleep(800);
await ev(`(() => { const s = (id) => { const f = document.querySelector('[data-fold="' + id + '"]'); if (f && f.classList.contains("is-folded")) f.querySelector(".fold-head, summary, button")?.click(); };
  s("lyrics"); const a = document.getElementById("lyrics"); a.value = ${JSON.stringify(lyrics)}; a.dispatchEvent(new Event("input", { bubbles: true })); a.scrollIntoView({ block: "center" }); return true; })()`);
const measure = `(async () => { window.dispatchEvent(new Event("resize")); await new Promise((r) => setTimeout(r, 450));
  const a = document.getElementById("lyrics"), wrap = a.closest(".lyr-wrap") || a.parentNode, ms = [...wrap.querySelectorAll(".lyr-mirror")];
  return { box: a.scrollHeight, w: getComputedStyle(a).width, cw: a.clientWidth, mirrors: ms.map((m) => m.scrollHeight), dpr: devicePixelRatio, iw: innerWidth }; })()`;
const rows = [];
for (const dsf of [1, 1.1, 1.25, 1.5]) {
  for (const k of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) {
    const W = Math.round(1920 / dsf) - k * 7, H = Math.round(1000 / dsf);
    await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: dsf, mobile: false });
    const m = await ev(measure);
    const bad = (m.mirrors || []).filter((h) => h !== m.box).length;
    rows.push({ dsf, W, box: m.box, w: m.w, cw: m.cw, mirrors: (m.mirrors || []).join("/"), bad });
  }
}
const off = rows.filter((r) => r.bad);
console.log("configs", rows.length, "mismatched", off.length);
rows.filter((r) => r.dsf === 1.25).slice(0, 12).forEach((r) => console.log("  dsf", r.dsf, "W", r.W, "box", r.box, "mirrors", r.mirrors, "width", r.w, "clientWidth", r.cw));
// the lifted lyrics at 125 %
await send("Emulation.setDeviceMetricsOverride", { width: 1536, height: 800, deviceScaleFactor: 1.25, mobile: false });
await ev(`document.getElementById("lyricsBig").click(); true`);
await sleep(600);
const lifted = await ev(measure);
console.log("lifted at 125 %:", JSON.stringify({ box: lifted.box, mirrors: lifted.mirrors, w: lifted.w, cw: lifted.cw }));
await finish(0);
