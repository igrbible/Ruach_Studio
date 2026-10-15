// HERESY 1259: the Pinokio launcher (pinokio.js, launcher/) without Pinokio: the menu in every state against a stand-in `info`,
// every script's shape, every bash script's syntax, and the patterns the scripts are watched with against the lines the lab, the
// engine and the scripts really print, through Pinokio 8.2's own ANSI stripping and its default «error:» stop.
// HERESY 1352: the scripts in launcher/ (Pinokio keeps an app's ENVIRONMENT in a folder named pinokio/), and the old folder an
// update from rc5 and before leaves, moved out of Pinokio's way by the menu, on throwaway trees.
//   node heresy/tools/check-pinokio.mjs
import { createRequire } from "node:module";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);
const tty = process.stdout.isTTY && !process.env.NO_COLOR;
const [G, R, B, X] = tty ? ["\x1b[32m", "\x1b[31m", "\x1b[1m", "\x1b[0m"] : ["", "", "", ""];
let passed = 0, failed = 0;
const check = (name, ok, detail) => { ok ? passed++ : failed++; console.log(`  ${ok ? G + "PASS" : R + "FAIL"}${X}  ${name}${!ok && detail ? "  (" + detail + ")" : ""}`); };

// Pinokio 8.2 (pinokiod kernel/shell.js stripAnsi, kernel/shells.js): the live text is stripped of ANSI, \r becomes \n; a handler's
// event is "/source/flags"; a break handler stops the script only when its match survives the removal of every break:false pattern
// (on the text without line ends), and Pinokio adds its own /error:/i and /errno /i breaks to every shell.run.
const stripAnsi = (s) => s.replaceAll(new RegExp(["[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]+)*|[a-zA-Z\\d]+(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)",
  "(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-Za-z=><~]))"].join("|"), "gi"), "");
const live = (s) => stripAnsi(s).replaceAll(/\r\n/g, "\n").replaceAll(/\r/g, "\n");
const toRe = (ev) => { const m = /^\/(.+)\/([dgimsuy]*)$/s.exec(ev); return m ? new RegExp(m[1], m[2].includes("g") ? m[2] : m[2] + "g") : null; };
const DEFAULTS = [{ event: "/error:/i", break: true }, { event: "/errno /i", break: true }, { event: "/error:.*triton/i", break: false }];
const breaks = (on, text) => {
  const all = on.concat(DEFAULTS).filter((h) => h.event && "break" in h);
  let line = live(text).replaceAll(/[\r\n]/g, "");
  for (const h of all) if (!h.break) line = line.replaceAll(toRe(h.event), "");
  return all.filter((h) => h.break).flatMap((h) => [...line.matchAll(toRe(h.event))].map((m) => m[0]));
};
const firstMatch = (on, text, key) => { for (const h of on) { if (!h[key]) continue; const m = [...live(text).matchAll(toRe(h.event))][0]; if (m) return m; } return null; };

console.log(`${B}the menu${X}`);
const launcher = require(join(ROOT, "pinokio.js"));
check("pinokio.js names a version Pinokio 8.2 takes (its schema is <=8.0.0) and an icon that is here",
  /^[0-8](\.\d+)*$/.test(launcher.version) && existsSync(join(ROOT, launcher.icon)), `${launcher.version} · ${launcher.icon}`);
const done = [".venv/bin/python", "build/build/yue-server", "models/YuE2-Vae-F32.gguf"];
const states = [
  ["a fresh folder", [], [], null, "Install", "launcher/install.js"],
  ["while it installs", [], ["launcher/install.js"], null, "Installing", "launcher/install.js"],
  ["installed but a model is missing", done.slice(0, 2), [], null, "Install", "launcher/install.js"],
  ["installed", done, [], null, "Start", "launcher/start.js"],
  ["starting, the server not yet listening", done, ["launcher/start.js"], null, "Starting", "launcher/start.js"],
  ["running", done, ["launcher/start.js"], "http://127.0.0.1:7777", "Open the studio · port 7777", "http://127.0.0.1:7777"],
  ["while it updates", done, ["launcher/update.js"], null, "Updating", "launcher/update.js"],
  ["while more models download", done, ["launcher/extras.js"], null, "Downloading models", "launcher/extras.js"],
  ["while it resets", done, ["launcher/reset.js"], null, "Resetting", "launcher/reset.js"],
  ["while an Update the old scripts began goes on (rc5 and before)", done, ["pinokio/update.js"], null, "Updating", "pinokio/update.js"],
];
// Pinokio's info stand-in: paths from the studio's folder, as info resolves them from pinokio.js
const stand = (files, running, url) => ({ exists: (p) => files.includes(p), running: (p) => running.includes(p),
                                          local: (p) => (running.includes(p) && p.endsWith("/start.js") && url ? { url } : {}) });
for (const [name, files, running, url, text, href] of states) {
  const items = await launcher.menu(null, stand(files, running, url));
  const def = items.filter((i) => i.default);
  const hrefs = items.map((i) => i.href).filter((h) => !/^https?:/.test(h) && !h.startsWith("pinokio/"));   // the old Update's own, gone from disk
  check(`${name}: «${text}» is the default`, def.length === 1 && def[0].text === text && def[0].href === href, JSON.stringify(items.map((i) => i.text)));
  check(`  every script it opens is here`, hrefs.every((h) => existsSync(join(ROOT, h))), hrefs.join(", "));
}
check("no folder named pinokio/ here: Pinokio would keep the studio's ENVIRONMENT in it, and its page reads it beside pinokio.js",
  !existsSync(join(ROOT, "pinokio")) && existsSync(join(ROOT, "launcher")));

console.log(`\n${B}the old launcher folder (pinokio/, rc5 and before)${X}`);
// a copy of pinokio.js in a throwaway folder stands for an updated studio; what Pinokio wrote into the old folder beside it
const tree = (env, rootEnv, oldScripts) => {
  const t = mkdtempSync(join(tmpdir(), "ruach-launcher-"));
  copyFileSync(join(ROOT, "pinokio.js"), join(t, "pinokio.js"));
  mkdirSync(join(t, "pinokio/logs/sessions"), { recursive: true });
  writeFileSync(join(t, "pinokio/logs/sessions/index.json"), "{}");
  writeFileSync(join(t, "pinokio/AGENTS.md"), "Pinokio's notes for agents");
  if (env) writeFileSync(join(t, "pinokio/ENVIRONMENT"), "HF_HOME=./cache/HF_HOME\nMINE=kept\n");
  if (rootEnv) writeFileSync(join(t, "ENVIRONMENT"), "MINE=root\n");
  if (oldScripts) writeFileSync(join(t, "pinokio/install.sh"), "#!/bin/bash\n");
  return t;
};
const read = (f) => (existsSync(f) ? readFileSync(f, "utf8") : null);
const moved = (t) => (readdirSync(join(t, "tmp")).filter((d) => d.startsWith("pinokio-until-rc5-")).map((d) => join(t, "tmp", d)));
const menuOf = async (t, running, url) => (await require(join(t, "pinokio.js")).menu(null, stand(done, running, url)));
const trees = [];
{
  const t = tree(true, false, false); trees.push(t);
  let items = await menuOf(t, ["pinokio/update.js"]);
  check("while the old Update still runs, nothing is moved and «Updating» opens its terminal",
    existsSync(join(t, "pinokio/AGENTS.md")) && items[0].text === "Updating" && items[0].href === "pinokio/update.js", JSON.stringify(items));
  items = await menuOf(t, ["pinokio/start.js"], "http://127.0.0.1:7777");
  check("  nor while the studio runs from the old folder (Open the studio, its Terminal there)",
    existsSync(join(t, "pinokio/AGENTS.md")) && items[0].text === "Open the studio · port 7777" && items[1].href === "pinokio/start.js", JSON.stringify(items));
  items = await menuOf(t, []);
  const away = existsSync(join(t, "tmp")) ? moved(t) : [];
  check("when nothing runs, the old folder is moved out of Pinokio's way: its ENVIRONMENT to the root, the rest under tmp/",
    !existsSync(join(t, "pinokio")) && read(join(t, "ENVIRONMENT")) === "HF_HOME=./cache/HF_HOME\nMINE=kept\n" && away.length === 1 &&
    existsSync(join(away[0], "AGENTS.md")) && existsSync(join(away[0], "logs/sessions/index.json")) && !existsSync(join(away[0], "ENVIRONMENT")), JSON.stringify(away));
  const def = items.filter((i) => i.default);
  check("  and the menu offers to finish the update (Start as it is beside it)",
    existsSync(join(t, "tmp/update-unfinished")) && def.length === 1 && /^Finish the update/.test(def[0].text) && def[0].href === "launcher/update.js" &&
    items.some((i) => i.text === "Start as it is" && i.href === "launcher/start.js"), JSON.stringify(items.map((i) => i.text)));
  unlinkSync(join(t, "tmp/update-unfinished"));                                     // as launcher/update.sh does at its end
  items = await menuOf(t, []);
  check("  once the update has ended, the menu is the usual one (Start)", items.filter((i) => i.default)[0].text === "Start" && moved(t).length === 1);
}
{
  const t = tree(true, true, false); trees.push(t);
  await menuOf(t, []);
  const away = moved(t);
  check("an ENVIRONMENT already in the root stays; the old one goes with the rest",
    read(join(t, "ENVIRONMENT")) === "MINE=root\n" && away.length === 1 && read(join(away[0], "ENVIRONMENT")) === "HF_HOME=./cache/HF_HOME\nMINE=kept\n");
}
{
  const t = tree(true, false, true); trees.push(t);
  await menuOf(t, []);
  check("a pinokio/ that still holds the old scripts (a tree not updated) is not touched",
    existsSync(join(t, "pinokio/install.sh")) && existsSync(join(t, "pinokio/ENVIRONMENT")) && !existsSync(join(t, "ENVIRONMENT")) && !existsSync(join(t, "tmp")));
}
for (const t of trees) rmSync(t, { recursive: true, force: true });
const upd = readFileSync(join(ROOT, "launcher/update.sh"), "utf8"), inst = readFileSync(join(ROOT, "launcher/install.sh"), "utf8");
const at = (s, re) => { const m = re.exec(s); return m ? m.index : -1; };
const mark = at(upd, /> tmp\/update-unfinished/), pull = at(upd, /git pull --ff-only/), envAt = at(upd, /\. "\$ROOT\/launcher\/env\.sh"/);
const clear = at(upd, /rm -f tmp\/update-unfinished/), lastStop = upd.lastIndexOf("|| stop ");
check("launcher/update.sh marks the update unfinished after its pull and clears the mark after its last step",
  pull >= 0 && mark > pull && envAt > mark && clear > lastStop, JSON.stringify({ pull, mark, envAt, clear, lastStop }));
check("  and so does a whole install (launcher/install.sh sets the version up as well)", at(inst, /rm -f tmp\/update-unfinished/) > inst.lastIndexOf("|| stop "));

console.log(`\n${B}the scripts${X}`);
const scripts = Object.fromEntries(["install", "start", "update", "extras", "reset"].map((n) => [n, require(join(ROOT, "launcher", n + ".js"))]));
for (const [name, s] of Object.entries(scripts)) {
  const runs = s.run.filter((r) => r.method === "shell.run");
  const sh = runs.map((r) => (/^bash (launcher\/\S+\.sh)$/.exec(r.params.message) || [])[1]);
  check(`${name}.js runs bash scripts that are here, from the studio's folder`,
    runs.length > 0 && runs.every((r) => r.params.path === "..") && sh.every((f) => f && existsSync(join(ROOT, f))), JSON.stringify(sh));
  check(`  every pattern it watches is a regular expression Pinokio reads`, runs.every((r) => (r.params.on || []).every((h) => toRe(h.event))));
  for (const r of runs) {
    const file = r.params.message.split(" ")[1], src = readFileSync(join(ROOT, file), "utf8");
    const stops = [...src.matchAll(/echo "[^"]*?(ruach \w+ stopped: )/g)].map((m) => m[1]);
    const on = r.params.on || [];
    if (stops.length) check(`  ${file}'s own stop line stops it, through the colours`, stops.every((w) => breaks(on, `\x1b[1;31m${w}the reason\x1b[0m\r\n`).length > 0), stops.join(", "));
    check(`  the command line itself (as the shell echoes it) neither stops nor ends the step`, breaks(on, r.params.message + "\r\n").length === 0 && !firstMatch(on, r.params.message, "done"));
    check(`  pip's and cmake's «error:» lines do not stop it`, breaks(on, "ERROR: pip's dependency resolver does not currently take into account all the packages that are installed.\r\nOSError: [Errno 2] No such file\r\n").length === 0);
  }
}
check("install.js asks for Pinokio's AI bundle (its CUDA 12.8 where the machine has none)", scripts.install.requires && scripts.install.requires.bundle === "ai");
check("start.js stays up as a daemon and gives the menu the studio's address", scripts.start.daemon === true && scripts.start.run.at(-1).method === "local.set" && /input\.event\[1\]/.test(scripts.start.run.at(-1).params.url));

console.log(`\n${B}the lines start.js waits for${X}`);
const [labOn, studioOn] = scripts.start.run.filter((r) => r.method === "shell.run").map((r) => r.params.on);
const labLine = readFileSync(join(ROOT, "lab/lab.py"), "utf8").match(/print\(f"(\[lab\] heresy-lab on :)\{PORT\}/);
check("the lab's own banner (lab/lab.py) ends the lab's step", !!labLine && !!firstMatch(labOn, `${labLine[1]}41870 · outputs /x · whisper /y\r\n`, "done"));
check("  and so does a lab that runs already (launcher/lab.sh)", !!firstMatch(labOn, "heresy-lab already on :41870 (started elsewhere: its systemd unit or ./lab/start-lab.sh); Stop here leaves it running\r\n", "done"));
const srv = readFileSync(join(ROOT, "build/tools/yue-server.cpp"), "utf8").includes('"[Server] Listening on http://%s:%d\\n"');
const m1 = firstMatch(studioOn, "[Server] yue-server b1\n[Server] Listening on http://0.0.0.0:7777\n", "done");
check("the engine's «Listening on» line (build/tools/yue-server.cpp) ends the studio's step with its port", srv && m1 && m1[1] === "7777", m1 && m1[1]);
const m2 = firstMatch(studioOn, "[Server] Listening on http://127.0.0.1:41868 (started elsewhere: its systemd unit or ./start.sh); Stop here leaves it running\r\n", "done");
check("  and so does a studio that runs already (launcher/studio.sh), with its port", m2 && m2[1] === "41868", m2 && m2[1]);
check("  start.sh's banner before it (a hyperlink, colours) does not end the step early",
  !firstMatch(studioOn, "\x1b[1mRuach Studio 2.0.0\x1b[0m · Ruach_Studio  \x1b[32m\x1b]8;;http://10.0.0.5:7777\x1b\\http://10.0.0.5:7777\x1b]8;;\x1b\\\x1b[0m\r\n", "done"));

console.log(`\n${B}the bash${X}`);
for (const f of readdirSync(join(ROOT, "launcher")).filter((f) => f.endsWith(".sh")).sort()) {
  let ok = true, why = "";
  try { execFileSync("bash", ["-n", join(ROOT, "launcher", f)], { stdio: "pipe" }); } catch (e) { ok = false; why = String(e.stderr); }
  check(`launcher/${f} parses`, ok, why);
}
const cuda = ["build.sh", "start.sh"].map((f) => /^export CUDA_HOME="\$\{RUACH_CUDA_HOME:-\/usr\/local\/cuda-12\.8\}"/m.test(readFileSync(join(ROOT, f), "utf8")));
check("build.sh and start.sh take the toolkit launcher/env.sh found (RUACH_CUDA_HOME), /usr/local/cuda-12.8 by default", cuda.every(Boolean), JSON.stringify(cuda));
check("build.sh takes ninja only when it answers (a pip wrapper without its module is on a PATH too)", /ninja --version >\/dev\/null 2>&1 && GEN=\(-G Ninja\)/.test(readFileSync(join(ROOT, "build.sh"), "utf8")));

console.log(`\n${B}check-pinokio${X}  ${failed ? R : G}${passed} passed, ${failed} failed${X}`);
process.exit(failed ? 1 : 0);
