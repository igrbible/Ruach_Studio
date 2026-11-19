// HERESY 2673: the denoising steps' slider and the solver's select share one centre line in the Sound and Output row, in every theme
// (both vertical centres within 1 px), at 1920 and 2560. Against the mock, muted, its own profile.
import { readFileSync } from "node:fs";
import { B, G, R, X, finish, guard, launchChrome, onReport, startMock } from "../../tools/cdp-common.mjs";
guard(240);
let passed = 0, failed = 0;
const check = (name, ok, detail) => { ok ? passed++ : failed++; console.log(`  ${ok ? G + "PASS" : R + "FAIL"}${X}  ${name}${!ok && detail ? "  (" + detail + ")" : ""}`); };
onReport(() => console.log(`\n${B}check-steps-align${X}  ${failed ? R : G}${passed} passed, ${failed} failed${X}`));
const BASE = (await startMock(process.cwd() + "/tmp/mock-outputs/check-steps-align")).base;
const { send, ev, waitFor } = await launchChrome("profile-steps-align");
await send("Page.enable"); await send("Runtime.enable");
await send("Page.navigate", { url: BASE });
await waitFor(`document.readyState === "complete" && !!document.getElementById("odeSolver")`, 20000);
const src = readFileSync(process.cwd() + "/build/tools/console/themes.js", "utf8");
const ids = [...src.slice(src.indexOf("THEMES:BEGIN"), src.indexOf("THEMES:END")).matchAll(/"id": "([^"]+)"/g)].map((x) => x[1]);
for (const width of [1920, 2560]) {
  await send("Emulation.setDeviceMetricsOverride", { width, height: 1100, deviceScaleFactor: 1, mobile: false });
  await new Promise((r) => setTimeout(r, 300));
  for (const id of ids) {
    await ev(`document.documentElement.dataset.theme = ${JSON.stringify(id)}; true`);
    const m = await ev(`(() => { const s = document.getElementById("odeSolver"), r = document.getElementById("odeStepsRange");
      let d = s.closest("details"); while (d) { d.open = true; d = d.parentElement && d.parentElement.closest("details"); }
      for (let e = s; e; e = e.parentElement) if (e.classList && e.classList.contains("is-hidden")) e.classList.remove("is-hidden");
      s.scrollIntoView({ block: "center" });
      const a = s.getBoundingClientRect(), b = r.getBoundingClientRect();
      return { sel: (a.top + a.bottom) / 2, rng: (b.top + b.bottom) / 2, h: a.height, hr: b.height, theme: document.documentElement.dataset.theme || "" }; })()`);
    const off = Math.abs(m.sel - m.rng);
    check(`${width} · ${id}: slider centre ${m.rng.toFixed(1)}, select centre ${m.sel.toFixed(1)} (${off.toFixed(2)} px)`, m.h > 0 && m.hr > 0 && off <= 1, JSON.stringify(m));
  }
}
await finish(failed ? 1 : 0);
