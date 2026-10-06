// HERESY 1145: the studio's player as a new user has it (1040 play on click, 1009 play on), against the mock, on a fresh page:
// a click on a take plays it, and when it ends the next take of the list plays. Muted.
//   node heresy/tools/check-player.mjs        (YUE2_CHROME, YUE2_NODE as for tools/test-real.sh)
// The Kit's long page test (tools/cdp-console.mjs) runs its own checks with these two off, as the Kit had them; late in that
// run a take sits fully buffered and never plays on, so this check lives apart, on a page of its own.
import { B, G, R, X, finish, guard, launchChrome, onReport, sleep, startMock } from "../../tools/cdp-common.mjs";

guard(90);
let passed = 0, failed = 0;
const check = (name, ok, detail) => { ok ? passed++ : failed++; console.log(`  ${ok ? G + "PASS" : R + "FAIL"}${X}  ${name}${!ok && detail ? "  (" + detail + ")" : ""}`); };
onReport(() => console.log(`\n${B}check-player${X}  ${failed ? R : G}${passed} passed, ${failed} failed${X}`));

const BASE = (await startMock(process.cwd() + "/tmp/mock-outputs/check-player")).base;
const { send, ev, waitFor, click } = await launchChrome("profile-player", ["--autoplay-policy=no-user-gesture-required"]);
await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 960, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: BASE });
await waitFor(`document.readyState === "complete" && document.querySelectorAll("#libList .take").length >= 3`, 20000);
await sleep(500);
const names = await ev(`[...document.querySelectorAll("#libList .take:not(.is-running-row)")].map(e => e.dataset.name)`);
check("a new user's player: play on click and play on are on", (await ev(`localStorage.getItem("yue2.clickPlay") !== "off" && localStorage.getItem("yue2.playOn") !== "off"`)) === true);
await click(`#libList .take[data-name="${names[0]}"]`);
check("a click on a take plays it", !!(await waitFor(`!document.getElementById("audio").paused &&
  document.getElementById("audio").src.includes(${JSON.stringify(encodeURIComponent(names[0]))})`, 4000, 100)));
await waitFor(`isFinite(document.getElementById("audio").duration) && document.getElementById("audio").duration > 1`, 4000, 100);
await ev(`(() => { const a = document.getElementById("audio"); a.currentTime = a.duration - 0.3; return true; })()`);
const next = await waitFor(`(() => { const a = document.getElementById("audio"); return !a.paused && a.src.includes(${JSON.stringify(encodeURIComponent(names[1]))}) && a.currentTime > 0.05; })()`, 6000, 100);
check("  and when it ends, the next take of the list plays (and its time moves)", !!next,
  JSON.stringify(await ev(`({ src: document.getElementById("audio").getAttribute("src"), paused: document.getElementById("audio").paused, t: document.getElementById("audio").currentTime })`)));
await finish(failed ? 1 : 0);
