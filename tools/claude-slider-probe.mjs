// A quick probe (not a check): the Probes and Variations sliders in a theme: their border, outline and shadow, the rules that give them, and a picture of the row.   THEME=igr-day node tools/slider-probe.mjs
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { findChrome, HOME, TMP, env, sleep, until, makeSend, ensurePage, startMock, finish, guard, onCleanup, stopChrome, chromeTmp } from "./cdp-common.mjs";
guard(120);
ensurePage();
const { base } = await startMock(TMP + "/mock-outputs/sliderprobe");
const profile = join(HOME, "sliderprobe-" + process.pid), tmpdir = chromeTmp(TMP);
rmSync(profile, { recursive: true, force: true });
mkdirSync(join(profile, "Default"), { recursive: true });
const chrome = spawn(findChrome(), ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--mute-audio",
  "--window-size=" + (process.env.WS || "1920,1000") + "", "--user-data-dir=" + profile, "--remote-debugging-port=0", "about:blank"], { env: { ...env, TMPDIR: tmpdir }, stdio: ["ignore", "ignore", "ignore"] });
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
await until(async () => (await ev(`document.readyState === "complete" && !!document.getElementById("variations")`)) === true, 30000, 200);
await sleep(1200);
const theme = process.env.THEME || "igr-day";
const out = await ev(`(async () => {
  if (window.RuachThemes && window.RuachThemes.set) window.RuachThemes.set(${JSON.stringify(theme)}); else document.documentElement.dataset.theme = ${JSON.stringify(theme)};
  await new Promise((r) => setTimeout(r, 400)); if (" + JSON.stringify(!!process.env.LIFT) + ") { document.querySelector('#view-compose .frame-big').click(); await new Promise((r) => setTimeout(r, 700)); }
  const one = (id) => { const el = document.getElementById(id), cs = getComputedStyle(el), hits = [];
    for (const sh of document.styleSheets) { let rules; try { rules = sh.cssRules; } catch { continue; }
      const walk = (rs) => { for (const r of rs) { if (r.cssRules && !r.selectorText) { walk(r.cssRules); continue; } if (!r.selectorText) continue;
        try { if (el.matches(r.selectorText) && /border|outline|box-shadow/.test(r.style.cssText)) hits.push(r.selectorText.slice(0, 140) + " { " + r.style.cssText.slice(0, 200) + " }"); } catch {} } };
      walk(rules); }
    const b = el.getBoundingClientRect();
    return { border: [cs.borderTopWidth, cs.borderTopStyle, cs.borderTopColor].join(" "), radius: cs.borderTopLeftRadius, outline: [cs.outlineWidth, cs.outlineStyle, cs.outlineColor].join(" "), shadow: cs.boxShadow, bg: cs.backgroundColor, box: [b.left, b.top, b.width, b.height].map(Math.round), hits }; };
  return { theme: document.documentElement.dataset.theme, versions: one("versions"), variations: one("variations") };
})()`);
console.log(JSON.stringify(out, null, 1));
const b = out.versions.box;
const shot = await send("Page.captureScreenshot", { format: "png", clip: { x: Math.max(0, b[0] - 120), y: Math.max(0, b[1] - 20), width: 760, height: 70, scale: 2 } });
writeFileSync(TMP + "/claude-sliders-" + theme + ".png", Buffer.from(shot.result.data, "base64"));
await finish(0);
