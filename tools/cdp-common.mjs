// Shared by the browser tests (cdp-console.mjs, cdp-real.mjs, screenshots.mjs): the install's own folders,
// colours, the page preflight, starting the mock server and headless Chrome, DevTools commands that give up
// with a clear message instead of hanging, and one way out that always stops Chrome and the mock.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// ------------------------------------------------------------------ places
// The install's root comes from this file's own location (tools/..), never from the working directory.
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const TMP = join(ROOT, "tmp");
export const HOME = join(TMP, "chrome-home");      // Chrome's HOME and XDG folders
// Whatever a child process writes lands under tmp/.
export const env = { ...process.env, HOME, XDG_CONFIG_HOME: join(HOME, ".config"), XDG_CACHE_HOME: join(HOME, ".cache"),
                     XDG_DATA_HOME: join(HOME, ".local", "share"), TMPDIR: TMP, PYTHONDONTWRITEBYTECODE: "1" };
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ----------------------------------------------------------------- colours
// Only on a terminal. NO_COLOR (any value) turns them off; FORCE_COLOR keeps them for a wrapper that pipes the output.
const PAINT = !process.env.NO_COLOR && (!!process.stdout.isTTY || (!!process.env.FORCE_COLOR && process.env.FORCE_COLOR !== "0"));
const sgr = (n) => (PAINT ? `\x1b[${n}m` : "");
export const G = sgr(32), R = sgr(31), Y = sgr(33), C = sgr(36), D = sgr(2), B = sgr(1), X = sgr(0);

// ------------------------------------------------------------------ errors
export class StopError extends Error {}           // an expected stop: the message says it all
export class PageError extends Error {}           // the page threw while evaluating a probe
export class DevToolsError extends Error {}       // Chrome answered a command with an error

// The message, plus the test script's line it came from (not this file's), so a broken probe is easy to find.
function describe(e) {
  if (!(e instanceof Error)) return String(e);
  const text = e instanceof StopError || e instanceof PageError || e instanceof DevToolsError ? e.message : `${e.name}: ${e.message}`;
  const at = (e.stack || "").split("\n").map((l) => l.match(/([\w.-]+\.mjs):(\d+):\d+/)).find((m) => m && m[1] !== "cdp-common.mjs");
  return text + (at ? `  (${at[1]}:${at[2]})` : "");
}

// ---------------------------------------------------------------- the end
// Every run ends through finish(): the report (if one is registered), then the clean-ups in reverse order
// (Chrome before the mock), then the exit code. stop() is the failure path: a thrown error, a stalled
// command, the time limit or Ctrl-C all come here, so Chrome and the mock never outlive the test.
const cleanups = [];
let ending = false, reportFn = null, stopFn = null;
export const onCleanup = (fn) => { cleanups.push(fn); };
export const onReport = (fn) => { reportFn = fn; };
export const onStop = (fn) => { stopFn = fn; };

export async function finish(code) {
  if (ending) return new Promise(() => {});     // already on the way out
  ending = true;
  if (reportFn) {
    try { reportFn(); } catch (e) { console.log(`${R}the report failed${X}  ${describe(e)}`); }
  }
  for (const fn of cleanups.splice(0).reverse()) {
    try { await fn(); } catch { /* the next one still runs */ }
  }
  process.exit(code);
}

export function stop(message, code = 2) {
  if (ending) return new Promise(() => {});
  if (stopFn) {
    try { stopFn(message); } catch { console.log(`${R}stopped${X}  ${message}`); }
  } else {
    console.log(`${R}stopped${X}  ${message}`);
  }
  return finish(code);
}

// Install first thing. On Node 24 an error in a top-level await arrives as 'uncaughtException' (origin
// 'unhandledRejection'), not as 'unhandledRejection': both are caught here.
export function guard(seconds) {
  const fatal = (e) => { stop(describe(e)); };
  process.on("uncaughtException", fatal);
  process.on("unhandledRejection", fatal);
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(sig, () => { stop(`interrupted (${sig})`, 130); });
  setTimeout(() => { stop(`timed out after ${seconds} s`); }, seconds * 1000);
}

// A condition checked in Node (not in the page) until it holds or the time is up; its value, or null.
export async function until(fn, timeout = 10000, step = 100) {
  const end = Date.now() + timeout;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) return null;
    await sleep(step);
  }
}

// ----------------------------------------------------------- page preflight
function filesIn(dir, pattern = null) {
  const out = [];
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...filesIn(p, pattern));
    else if (e.isFile() && (!pattern || pattern.test(e.name))) out.push(p);
  }
  return out;
}

// HERESY 1145: the page the mock serves is build/tools/public/index.html, as build.sh makes it and the studio reads it
// from disk (1130); it must be newer than every page source (build/tools/console, the example prompts build.sh inlines).
// Missing or older: ./build.sh makes it (seconds; the server only when its C++ changed). Returns a note or null.
export function ensurePage() {
  const page = join(ROOT, "build", "tools", "public", "index.html");
  const sources = [...filesIn(join(ROOT, "build", "tools", "console")), ...filesIn(join(ROOT, "build", "tools", "webui", "example"), /\.json$/)];
  if (!sources.length) throw new StopError("no page sources in build/tools/console: build/ is not set up (tools/apply-patches.sh)");
  if (!existsSync(page)) throw new StopError("build/tools/public/index.html is missing: run ./build.sh");
  const newest = Math.max(...sources.map((f) => statSync(f).mtimeMs));
  if (statSync(page).mtimeMs < newest) throw new StopError("build/tools/public/index.html is older than its sources: run ./build.sh");
  return null;
}

// ------------------------------------------------------------ child processes
// SIGTERM, up to `ms` to go, then SIGKILL.
export async function stopProcess(proc, ms = 3000) {
  if (!proc || proc.exitCode !== null || proc.signalCode !== null) return;
  const gone = new Promise((r) => proc.once("exit", () => r(true)));
  try { proc.kill("SIGTERM"); } catch { return; }
  if (await Promise.race([gone, sleep(ms).then(() => false)])) return;
  try { proc.kill("SIGKILL"); } catch { /* gone */ }
  await Promise.race([gone, sleep(1000)]);
}

const lastLines = (text) => text.trim().split("\n").slice(-8).join("\n");

// The stand-in server (tools/mock_server.py) on a free port with a fresh demo library in `outputs` (under
// tmp/). It prints its address once it listens; its own errors go to the same text so a failure says why.
// Stopped by finish()/stop() whatever happens.
export async function startMock(outputs, extra = []) {
  const proc = spawn("nice", ["-n", "15", "python3", join(ROOT, "tools", "mock_server.py"), "--port", "0", "--outputs", outputs,
                              "--reset", "--demo", "3", "--speed", "3", "--quiet", ...extra], { env, stdio: ["ignore", "pipe", "pipe"] });
  onCleanup(() => stopProcess(proc));
  let text = "";
  const base = await new Promise((ok, fail) => {
    const timer = setTimeout(() => fail(new StopError("the mock server did not start within 90 s: " + lastLines(text))), 90000);
    const read = (d) => {        // stays attached: the pipes are drained for the whole run
      text = (text + d).slice(-8000);
      const m = text.match(/http:\/\/127\.0\.0\.1:(\d+)/);
      if (m) { clearTimeout(timer); ok(`http://127.0.0.1:${m[1]}/`); }
    };
    proc.stdout.on("data", read);
    proc.stderr.on("data", read);
    proc.once("error", (e) => { clearTimeout(timer); fail(new StopError("could not start the mock server: " + e.message)); });
    proc.once("exit", (code, signal) => { clearTimeout(timer); fail(new StopError(`the mock server exited (${signal || code}): ${lastLines(text)}`)); });
  });
  const answers = await until(async () => { try { return (await fetch(base + "props")).ok; } catch { return false; } }, 30000, 250);
  if (!answers) throw new StopError("the mock server printed its address but does not answer /props");
  return { base, proc };
}

// --------------------------------------------------------------------- chrome
// Chrome or Chromium: YUE2_CHROME, else the usual names on PATH, else the macOS app bundles.
export function findChrome() {
  if (process.env.YUE2_CHROME) return existsSync(process.env.YUE2_CHROME) ? process.env.YUE2_CHROME : null;
  const names = ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "chrome"];
  for (const dir of (process.env.PATH || "").split(":")) {
    for (const n of names) if (dir && existsSync(join(dir, n))) return join(dir, n);
  }
  for (const p of ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
                   "/Applications/Chromium.app/Contents/MacOS/Chromium",
                   "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary"]) {
    if (existsSync(p)) return p;
  }
  return null;
}

// A new, empty profile for this run (YUE2_CHROME_PROFILE picks it, so a wrapper can clean up after it).
// A fresh profile has no stored data, so no storage reset is needed (on macOS
// Storage.clearDataForOrigin with storageTypes "all" hung until the suite timed out).
export function freshProfile(home, name) {
  const dir = process.env.YUE2_CHROME_PROFILE || join(home, `${name}-${process.pid}-${Date.now()}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  // older runs' profiles of the same test (not this one) are left-overs: remove them
  try {
    for (const d of readdirSync(home)) {
      if (d.startsWith(name + "-") && join(home, d) !== dir) rmSync(join(home, d), { recursive: true, force: true });
    }
  } catch { /* no home yet */ }
  return dir;
}

// Chrome's temp folder for this run: inside the project, deleted with the profile (a killed Chrome
// cannot remove its com.google.Chrome.* folders), and SHORT. Chrome makes a Unix socket in it, and a
// socket path may not exceed 104 bytes on macOS (108 on Linux): a long folder name here stopped Chrome
// with "Socket path too long".
const SOCKET_TAIL = "/com.google.Chrome.XXXXXX/SingletonSocket".length;
export function chromeTmp(tmp) {
  let dir = join(tmp, "cr" + String(process.pid).slice(-6));
  if (dir.length + SOCKET_TAIL > 100) dir = tmp;
  if (dir.length + SOCKET_TAIL > 100) {
    console.log(`${Y}note${X}: this install's path is long (${tmp}); Chrome may not start ("Socket path too long"). A shorter install path fixes it.`);
  }
  mkdirSync(dir, { recursive: true });
  try {   // the same folders of earlier runs, over an hour old, are left-overs
    for (const d of readdirSync(tmp)) {
      const p = join(tmp, d);
      if (/^cr\d+$/.test(d) && p !== dir && Date.now() - statSync(p).mtimeMs > 3600e3) rmSync(p, { recursive: true, force: true });
    }
  } catch { /* nothing to sweep */ }
  return dir;
}

// Stop Chrome, wait until it has exited (or 3 s), then delete its profile: deleting while it still
// writes would leave the folder behind.
export async function stopChrome(chrome, profile, tmpdir) {
  try { chrome.kill("SIGKILL"); } catch { /* already gone */ }
  await new Promise((r) => {
    if (chrome.exitCode !== null || chrome.signalCode !== null) return r();
    chrome.once("exit", r); setTimeout(r, 3000);
  });
  for (let i = 0; i < 10; i++) {
    try {
      rmSync(profile, { recursive: true, force: true });
      if (tmpdir && /[/\\]cr\d+$/.test(tmpdir)) rmSync(tmpdir, { recursive: true, force: true });
      if (!existsSync(profile)) return;
    } catch { /* busy */ }
    await sleep(200);
  }
}

// A DevTools command that fails after `ms` with the command's name, so a stall says what stalled; an error
// reply rejects too (it used to pass as an empty success).
export function makeSend(ws, pending, next, defaultMs = 60000) {
  return (method, params = {}, ms = defaultMs) => new Promise((ok, fail) => {
    const i = next();
    const timer = setTimeout(() => { pending.delete(i); fail(new StopError(`DevTools command ${method} gave no answer in ${ms / 1000} s`)); }, ms);
    pending.set(i, (d) => {
      clearTimeout(timer);
      if (d.closed) fail(new StopError(`Chrome closed the DevTools connection during ${method}`));
      else if (d.error) fail(new DevToolsError(`DevTools ${method} failed: ${d.error.message}${d.error.data ? " (" + d.error.data + ")" : ""}`));
      else ok(d);
    });
    try {
      ws.send(JSON.stringify({ id: i, method, params }));
    } catch (e) {
      clearTimeout(timer); pending.delete(i);
      fail(new StopError(`DevTools ${method} could not be sent: ${e.message}`));
    }
  });
}

// ev: the expression's value; a page exception throws (a broken probe must never read as a result).
// waitFor: the first truthy value, or null when the time is up; a throw on the way counts as "not yet"
// (the page is still loading, or the element is not there yet). click: false when nothing matches.
function pageHelpers(send) {
  const ev = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    const x = r.result?.exceptionDetails;
    if (x) {
      const what = (x.exception?.description || x.text || "exception").split("\n")[0];
      throw new PageError(`page script failed: ${what}  [in: ${expr.replace(/\s+/g, " ").trim().slice(0, 110)}]`);
    }
    return r.result?.result?.value;
  };
  const waitFor = async (expr, timeout = 10000, step = 100) => {
    const end = Date.now() + timeout;
    for (;;) {
      let v = null;
      try { v = await ev(expr); } catch (e) { if (!(e instanceof PageError || e instanceof DevToolsError)) throw e; }
      if (v) return v;
      if (Date.now() > end) return null;
      await sleep(step);
    }
  };
  const click = (selector) => ev(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return false; e.click(); return true; })()`);
  return { ev, waitFor, click };
}

// Headless Chrome with a fresh profile under tmp/chrome-home, connected over DevTools. Stopped (and its
// profile deleted) by finish()/stop(). Page exceptions are collected in `errors`; on(fn) sees every event.
export async function launchChrome(name, extraArgs = []) {
  const path = findChrome();
  if (!path) throw new StopError("no Chrome or Chromium found: install one, or set YUE2_CHROME=/path/to/chrome");
  mkdirSync(HOME, { recursive: true });
  const profile = freshProfile(HOME, name), tmpdir = chromeTmp(TMP);
  // HERESY 1145: muted: a test never plays into anyone's speakers, and on a machine with no sound card an unmuted headless
  // Chrome's audio clock stands still (a take "plays" at one second forever); muted, it runs on a silent output
  const chrome = spawn("nice", ["-n", "15", path, "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    "--disable-extensions", "--mute-audio", ...extraArgs, "--user-data-dir=" + profile, "--remote-debugging-port=0", "about:blank"],
    { env: { ...env, TMPDIR: tmpdir }, stdio: ["ignore", "ignore", "pipe"] });
  let said = "";
  chrome.stderr.on("data", (d) => { said = (said + d).slice(-4000); });
  onCleanup(() => stopChrome(chrome, profile, tmpdir));
  const exited = () => chrome.exitCode !== null || chrome.signalCode !== null;

  let port = null;
  for (let i = 0; i < 300 && !port && !exited(); i++) {    // up to 60 s: a first start on a slow machine can take a while
    await sleep(200);
    try { port = readFileSync(join(profile, "DevToolsActivePort"), "utf8").split("\n")[0].trim() || null; } catch { /* not yet */ }
  }
  if (!port) {
    const lines = said.split("\n").filter((l) => l.trim() && !/cpufreq|org\.freedesktop|dbus/.test(l)).slice(-20).join("\n");
    throw new StopError(`${exited() ? `Chrome exited (${chrome.signalCode || chrome.exitCode})` : "Chrome did not start within 60 s"} (${path})${lines ? "\n" + lines : ""}`);
  }
  const target = await until(async () => {
    try { return (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((x) => x.type === "page"); } catch { return null; }
  }, 10000, 200);
  if (!target) throw new StopError("Chrome started but offers no page to drive");
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok, fail) => {
    ws.addEventListener("open", ok, { once: true });
    ws.addEventListener("error", () => fail(new StopError("could not connect to Chrome's DevTools")), { once: true });
  });
  let seq = 0;
  const pending = new Map(), listeners = [], errors = [];
  ws.addEventListener("message", (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const done = pending.get(d.id); pending.delete(d.id); done(d); }
    if (d.method === "Runtime.exceptionThrown") errors.push((d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text).split("\n")[0]);
    if (d.method) for (const fn of listeners) fn(d);
  });
  ws.addEventListener("close", () => { for (const [id, done] of pending) { pending.delete(id); done({ closed: true }); } });
  const send = makeSend(ws, pending, () => ++seq);   // every command gives up after 60 s, naming itself
  return { chrome, send, errors, on: (fn) => { listeners.push(fn); }, ...pageHelpers(send) };
}
