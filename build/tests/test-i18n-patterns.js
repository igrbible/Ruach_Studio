#!/usr/bin/env node
// HERESY 2291: every key of every catalog compiles into its pattern, and a text made from the key is read back by it.
// Loads tools/console/heresy-i18n.js as the page does (no DOM: its top level only defines), then the eleven catalogs and
// the Reader's own (heresy-reader-i18n.js), in the page's order. A key whose pattern does not compile is reported by the
// module itself (console.error, the key left out); a key whose made text no pattern reads back is reported here.
// Run: node tests/test-i18n-patterns.js   (exit 1 on any failure)
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const dir = path.join(__dirname, "..", "tools", "console");
const errors = [];
const sandbox = {
  console: { log() {}, warn() {}, error: (...a) => errors.push(a.join(" ")) },
  navigator: { languages: ["en"], language: "en" },
  Intl, Map, WeakMap, Set, JSON
};
sandbox.window = sandbox;
vm.createContext(sandbox);
function load(file) {
  try { vm.runInContext(fs.readFileSync(path.join(dir, file), "utf8"), sandbox, { filename: file }); }
  catch (e) { errors.push(file + " threw while loading: " + e.message); }
}
load("heresy-i18n.js");
const I = sandbox.RuachI18n;
if (!I) { console.error("heresy-i18n.js did not define RuachI18n"); process.exit(1); }
const keys = [], realAdd = I.add;
I.add = function (code, table) { Object.keys(table).forEach((k) => keys.push([code, k])); return realAdd.apply(this, arguments); };
const langs = I.langs.map((l) => l.code).filter((c) => c !== "en");
langs.forEach((c) => load("heresy-i18n-" + c + ".js"));
load("heresy-reader-i18n.js");

let made = 0;
const norm = (s) => String(s).replace(/\s+/g, " ").trim();
keys.forEach(([code, raw]) => {
  const en = norm(raw);
  if (!/\{#?\d\}/.test(en)) return;
  if (errors.some((e) => e.indexOf(JSON.stringify(raw)) >= 0)) return;   // already reported as not compiling
  const num = {};
  en.replace(/\{#(\d)\}/g, (_, n) => { num[n] = 1; });
  const text = en.replace(/\{#?(\d)\}/g, (_, n) => (num[n] ? "4" + n + "2" : "Zq" + n));
  made++;
  if (I.look(text, code) === null) errors.push(code + " key not read back by its pattern: " + JSON.stringify(raw) + " (made: " + JSON.stringify(text) + ")");
});
const total = keys.length;
if (errors.length) {
  errors.forEach((e) => console.log("\x1b[1;31mFAIL\x1b[0m " + e));
  console.log(errors.length + " failing; " + total + " keys in " + (langs.length) + " catalogs and the Reader's, " + made + " patterns made and read");
  process.exit(1);
}
console.log("\x1b[1;32mOK\x1b[0m " + total + " keys in " + langs.length + " catalogs and the Reader's; " + made + " patterns compile and read back what they were made from");
