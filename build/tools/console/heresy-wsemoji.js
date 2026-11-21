// HERESY 2919 (Viktor 20.11.2026, to the mockup of the workspaces' emoji: «мой выбор — A… для подпространств без эмоджи — полупрозрачный лепесток
// растения… Наши зарезервированные системные 💎, 🙈 и другие… из списка исключены железно… Наши в сетке и возьми ещё несколько десятков самых
// популярных, эмоциональных, но никаких какашек, сердечек и остальной хуеты. Эмоджи, которые говорили бы об эмоциях, посыле, назначении…»): a
// workspace's emoji, the page's side. The lab keeps it as a field of its own (collection.json ws_emoji, lab/ws_emoji.py); here the reading of a name
// that still begins with one, the Studio's own marks no emoji may be, the faint icons of a workspace and a section with none, and the picker.
// HeresyWsEmoji.lead(text) -> {emoji, rest}: the one emoji a name begins with, whole as drawn (🌶️, 👁‍🗨, 🇺🇦), and the rest; the lab reads it the same
// HeresyWsEmoji.reserved(e): 💎 a published set, 🙈 a blind set, ❄ frozen, 👁‍🗨 blind, 🔒 locked: kept in a name, never picked
// HeresyWsEmoji.faint(section) -> an <svg>: the Studio's workspace glyph (a stack of discs) for a workspace, a leaf for a section
// HeresyWsEmoji.pick(anchor, {current, section, used}) -> Promise<"emoji" | "" (none) | null (closed)>: the grid under the anchor; Esc or a click beside it closes
(function () {
  "use strict";

  var RESERVED = ["🚨", "💎", "🙈", "❄", "👁‍🗨", "🔒"];   // 💎 🙈 ❄ 👁‍🗨 🔒, without U+FE0F
  var LEAD = new RegExp("^ *((?:\\p{Regional_Indicator}{2})|(?:\\p{Extended_Pictographic}[\\uFE0E\\uFE0F]?[\\u{1F3FB}-\\u{1F3FF}]?(?:\\u200D\\p{Extended_Pictographic}[\\uFE0E\\uFE0F]?[\\u{1F3FB}-\\u{1F3FF}]?)*[\\u{E0020}-\\u{E007F}]*)) *", "u");
  var NOT_EMOJI = "©®™ℹ";               // ©, ®, ™, ℹ: pictographs to Unicode, letters to a name
  function bare(e) { return String(e || "").replace(/[︎️]/g, ""); }
  function reserved(e) { return RESERVED.indexOf(bare(e)) >= 0; }
  function lead(text) {
    var s = String(text == null ? "" : text), m = LEAD.exec(s);
    if (!m || !m[1] || NOT_EMOJI.indexOf(m[1].charAt(0)) >= 0) return { emoji: "", rest: s };
    return { emoji: m[1], rest: s.slice(m[0].length) };
  }
  function one(v) { var s = String(v || "").trim(), l = lead(s); return l.emoji && !l.rest && !reserved(l.emoji) ? l.emoji : ""; }

  // the Studio's workspace glyph (Viktor's choice 19.11.2026, Lucide's database, ISC: discs stacked one above another) and a leaf (Lucide's leaf, ISC)
  var STACK = '<svg class="wse-faint" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5"/><path d="M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3"/></svg>';
  // HERESY 2919c (Viktor 21.11.2026: «вот это 🍃 — это трешовый эмоджи листок. Замени его вот этим более различимым 🌿»): a section with none shows 🌿, faint;
  // the faintness tells it from a section that wears 🌿 itself
  var LEAF = '<span class="wse-faint wse-sprig" aria-hidden="true">🌿</span>';
  function faint(section) { return section ? LEAF : STACK; }

  // the grid: his own first (the ones his workspaces wear), then feelings, the message, sound, work and nature; nothing past Emoji 13, so every
  // system's font draws them; no faces of mockery, no hearts, nothing of the toilet
  var GROUPS = [
    ["Ours", "🧪 🥊 🎛️ 🌿 🎸 🎼 🌶️ 🔥 🗣️ ⭐ 🎧 📏 📖 🔔 🔱 🕎 🎶 🎙️ 🎹 🌬️ 🔊"],
    ["Feeling", "😎 🤔 🤯 😮 😌 🥲 😢 😭 🤩 😤 😱 🥳 😴 🙏 💪 👀 🤝 ✊ 🤘 👏"],
    ["Message", "⚡ 💥 🌊 🌪️ ☀️ 🌙 🌅 🕯️ 🗝️ 🛡️ ⚔️ 🏹 🎯 🚀 🧭 🕊️ 👑 ⚓ ⛰️ 🌋"],
    ["Sound", "🎤 🥁 🎻 🎺 🎷 🪕 🪘 📯 🔉 🎚️ 💿 📼 📻 🎵"],
    ["Making", "🎬 🖼️ 🎨 ✍️ 📜 🧩 🛠️ 🔬 📊 🗂️ 📦 🏁 🚧 ⏳ 🧹 🔁 ✅ 🆕"],
    ["Nature", "🌱 🍃 🌳 🌾 🌸 🌻 🍂 🌍 🏔️ 💧 🌈 ☁️ 🌑 ✨"]
  ].map(function (g) { return [g[0], g[1].split(" ").filter(function (e) { return e && !reserved(e); })]; });
  var RECENT_KEY = "yue2.wsEmojiRecent";
  function recall(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function store(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* private */ } }
  function recent() { try { var v = JSON.parse(recall(RECENT_KEY) || "[]"); return Array.isArray(v) ? v.filter(function (e) { return one(e) === e; }).slice(0, 10) : []; } catch (e) { return []; } }
  function keepRecent(e) { if (!e) return; var r = recent().filter(function (x) { return bare(x) !== bare(e); }); r.unshift(e); store(RECENT_KEY, JSON.stringify(r.slice(0, 10))); }
  function tr(s) { return window.RuachI18n ? window.RuachI18n.t(s) : s; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  var open = null;                                     // {el, anchor, done}
  function close(v) {
    if (!open) return;
    var o = open;
    open = null;
    o.el.remove();
    window.removeEventListener("keydown", onKey, true);
    window.removeEventListener("mousedown", onDown, true);
    window.removeEventListener("resize", onAway, true);
    if (o.anchor && o.anchor.focus && document.contains(o.anchor)) { try { o.anchor.focus({ preventScroll: true }); } catch (e) { /* gone */ } }
    o.done(v === undefined ? null : v);
  }
  function onAway() { close(null); }
  // over a dialog (heresy-dialog.js listens on the document): the window hears the keys and the clicks first, so Esc and a click beside the grid close
  // the grid alone, Enter picks the one in focus, the arrows walk the grid
  function onDown(e) {
    if (!open) return;
    if (open.el.contains(e.target)) return;
    e.preventDefault(); e.stopPropagation();
    if (open.anchor && open.anchor.contains(e.target)) { close(null); return; }
    close(null);
  }
  function onKey(e) {
    if (!open) return;
    var btns = Array.prototype.slice.call(open.el.querySelectorAll("button.wse-e")), at = btns.indexOf(document.activeElement);
    if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); close(null); return; }
    if (e.key === "Enter" || e.key === " ") { if (at >= 0) { e.preventDefault(); e.stopImmediatePropagation(); btns[at].click(); } return; }
    if (e.key === "Tab") { e.preventDefault(); e.stopImmediatePropagation(); var n = btns.length; if (n) btns[((at < 0 ? -1 : at) + (e.shiftKey ? -1 : 1) + n) % n].focus(); return; }
    var dx = { ArrowLeft: -1, ArrowRight: 1 }[e.key], dy = { ArrowUp: -1, ArrowDown: 1 }[e.key];
    if (!dx && !dy) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (at < 0) { if (btns[0]) btns[0].focus(); return; }
    if (dx) { var to = btns[at + dx]; if (to) to.focus(); return; }
    var r0 = btns[at].getBoundingClientRect(), cx = r0.left + r0.width / 2, best = null, bd = 1e9;   // the nearest in the row above or below
    btns.forEach(function (b) {
      var r = b.getBoundingClientRect();
      if (dy > 0 ? r.top <= r0.top + 2 : r.top >= r0.top - 2) return;
      var d = Math.abs(r.top - r0.top) * 1000 + Math.abs(r.left + r.width / 2 - cx);
      if (d < bd) { bd = d; best = b; }
    });
    if (best) best.focus();
  }
  function pick(anchor, opts) {
    opts = opts || {};
    close(null);
    return new Promise(function (resolve) {
      var cur = bare(opts.current || ""), el = document.createElement("div"), seen = {};
      var cell = function (e) { return '<button type="button" class="wse-e' + (bare(e) === cur ? " is-cur" : "") + '" data-wse="' + esc(e) + '" aria-label="' + esc(e) + '">' + esc(e) + "</button>"; };
      var row = function (list) { return '<div class="wse-row">' + list.map(cell).join("") + "</div>"; };
      var used = (opts.used || []).filter(function (e) { return one(e) === e; });
      var mine = [];
      used.concat(GROUPS[0][1]).forEach(function (e) { if (!seen[bare(e)]) { seen[bare(e)] = 1; mine.push(e); } });
      var rec = recent();
      el.className = "wse-pop";
      el.setAttribute("role", "dialog");
      el.setAttribute("aria-label", tr("The workspace's emoji"));
      el.innerHTML = '<div class="wse-none-row"><button type="button" class="wse-e wse-none' + (cur ? "" : " is-cur") + '" data-wse="" aria-label="' + esc(tr("No emoji")) + '">' + faint(!!opts.section) + "</button>" +
        '<span class="wse-none-say">' + esc(tr(opts.section ? "No emoji: a faint leaf" : "No emoji: the workspace's faint icon")) + "</span></div>" +
        (rec.length ? '<div class="wse-cap">' + esc(tr("Recent")) + "</div>" + row(rec) : "") +
        '<div class="wse-cap">' + esc(tr("Ours")) + "</div>" + row(mine) +
        GROUPS.slice(1).map(function (g) { return '<div class="wse-cap">' + esc(tr(g[0])) + "</div>" + row(g[1]); }).join("") +
        '<div class="wse-foot">' + esc(tr("The Studio's own marks are not offered: 💎 a published set and 🙈 a blind one stay in the name; ❄ 👁‍🗨 🔒 are states")) + "</div>";
      document.body.appendChild(el);
      var r = anchor.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
      var left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)), top = r.bottom + 6;
      if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - 6 - h);
      el.style.left = left + "px"; el.style.top = top + "px";
      el.addEventListener("click", function (e) {
        var b = e.target.closest("[data-wse]");
        if (!b) return;
        e.preventDefault(); e.stopPropagation();
        var v = b.dataset.wse || "";
        keepRecent(v);
        close(v);
      });
      open = { el: el, anchor: anchor, done: resolve };
      window.addEventListener("keydown", onKey, true);
      window.addEventListener("mousedown", onDown, true);
      window.addEventListener("resize", onAway, true);
      var first = el.querySelector(".wse-e.is-cur") || el.querySelector(".wse-e");
      if (first) first.focus({ preventScroll: true });
    });
  }

  window.HeresyWsEmoji = { lead: lead, reserved: reserved, bare: bare, one: one, faint: faint, pick: pick, close: function () { close(null); }, isOpen: function () { return !!open; },
                           groups: function () { return GROUPS.map(function (g) { return [g[0], g[1].slice()]; }); } };
})();
