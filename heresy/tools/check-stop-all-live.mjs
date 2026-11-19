// HERESY 2676 on the live Studio (?scope=claude, muted, its own profile): a run of two 15 s songs (Multistep, 48 steps) sent from the page, the
// lamp's panel offers «Stop all Musician tasks» while they run and wait, its confirm overlay, then the running one stopped and the waiting one
// taken off: both end «cancelled» at the engine. Run only under /tmp/claude-arc.lock (heresy/MISC/claude-arc/watch/arc-lock.sh).
import { writeFileSync } from "node:fs";
import { B, G, R, X, finish, guard, launchChrome, onReport, sleep } from "../../tools/cdp-common.mjs";
guard(900);
let passed = 0, failed = 0;
const check = (name, ok, detail) => { ok ? passed++ : failed++; console.log(`  ${ok ? G + "PASS" : R + "FAIL"}${X}  ${name}${!ok && detail ? "  (" + detail + ")" : ""}`); };
onReport(() => console.log(`\n${B}check-stop-all-live${X}  ${failed ? R : G}${passed} passed, ${failed} failed${X}`));
const BASE = "http://127.0.0.1:7777/?scope=claude";
const { send, ev, waitFor } = await launchChrome("profile-stop-all-live", ["--mute-audio"]);
await send("Page.enable"); await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: BASE });
await waitFor(`document.readyState === "complete" && !!document.getElementById("composeForm")`, 30000);
await ev(`localStorage.setItem("yue2.askScore", "off"); localStorage.setItem("yue2.askSeed", "off"); localStorage.setItem("yue2.askBusy", "off"); true`);
await sleep(3000);
await ev(`(() => { const set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); };
  set("style", "solo piano, calm"); set("lyrics", "[Instrumental]\\n"); set("maxLength", "15"); set("versions", "2"); set("odeSolver", "multistep"); set("odeSteps", "48");
  document.getElementById("title") && set("title", "2676 · Stop all · probe");
  document.getElementById("composeForm").requestSubmit(); return true; })()`);
// the scope's workspace in hand may take no new takes (a frozen one): the probe's own, made by the driver, chosen where the page asks
for (let i = 0; i < 20; i++) {
  const picked = await ev(`(() => { const it = [...document.querySelectorAll(".hd-back.is-on .hd-item")].find(b => (b.dataset.q || "").includes("2676 · stop all")); if (it) { it.click(); return true; } return false; })()`);
  if (picked) break;
  if (await ev(`[...document.querySelectorAll("#queuePanel [data-q^='engine:'], .run")].length > 0`)) break;
  await sleep(500);
}
// the panel's rows: what runs and what waits
const keys = async () => ev(`(() => { const chip = document.getElementById("engineLamp").closest(".engine-chip"); chip.dispatchEvent(new MouseEvent("mouseenter"));
  const p = document.getElementById("queuePanel"); return p ? [...p.querySelectorAll("[data-q^='engine:']")].map(r => r.dataset.q + (r.classList.contains("is-run") ? ":run" : ":wait")) : []; })()`);
let rows = [];
for (let i = 0; i < 120; i++) { rows = await keys(); if (rows.length >= 2 && rows.some((k) => k.endsWith(":run"))) break; await sleep(1000); }
check("two songs of the run in the lamp's panel, one running", rows.length >= 2 && rows.some((k) => k.endsWith(":run")), JSON.stringify(rows));
const btn = await ev(`(() => { const b = document.querySelector("#queuePanel .q-stop-all"); return b ? { shown: !b.hidden && b.offsetParent !== null, text: b.textContent } : null; })()`);
check("«Stop all Musician tasks» offered under the lamp", btn && btn.shown, JSON.stringify(btn));
await ev(`document.querySelector("#queuePanel .q-stop-all").click(); true`);
await waitFor(`!!document.querySelector(".hd-back.is-on .hd-yes")`, 8000);
const ask = await ev(`document.querySelector(".hd-back.is-on .hd-box").textContent`);
check("asked first, in an overlay, with the count", /Stop all Musician tasks\?|Остановить все задачи Музыканта\?/.test(ask) && /\(2 in all\)|\(всего 2\)/.test(ask), ask.slice(0, 200));
await ev(`document.querySelector(".hd-back.is-on .hd-yes").click(); true`);
const ids = rows.map((k) => k.split(":")[1]);
let st = [];
for (let i = 0; i < 180; i++) {
  st = await ev(`Promise.all(${JSON.stringify(ids)}.map(id => fetch("/job?id=" + id).then(r => r.json()).then(d => d.status).catch(() => "?")))`);
  if (st.every((s) => s === "cancelled" || s === "failed" || s === "done")) break;
  await sleep(1000);
}
check("both end cancelled at the engine (the running one stopped, the waiting one taken off)", st.length === 2 && st.every((s) => s === "cancelled"), JSON.stringify(st));
const toastText = await ev(`[...document.querySelectorAll(".toast, .toasts *")].map(t => t.textContent).join(" | ")`);
check("said: how many ran and how many came off the queue", /Stopped: 1 running, 1 taken off the queue|Остановлено: идущих 1, снято с очереди 1/.test(toastText), toastText.slice(0, 300));
writeFileSync(process.cwd() + "/tmp/claude-tc/stop-all-live.json", JSON.stringify({ rows, st, toastText }, null, 1));
await ev(`localStorage.removeItem("yue2.askBusy"); true`);
await finish(failed ? 1 : 0);
