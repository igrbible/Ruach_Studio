// HERESY 1985 (Viktor 01.11.2026: «предлагаю решение с выкатом в 2.0.5: авторедирект с 7777 на 7443, модалка с предупреждением, чреватыми
// последствиями при возврате на 7777, … при отказе уведомляем, что не будет работать в сетапе с удалённой машиной Студии»; «По самоподписному корневому
// сертификату поддерживаю твою идею»): the Studio over https. A page opened over plain http from another computer (this computer's own 127.0.0.1 and
// localhost are secure already, and asked nothing) is offered the Studio's https door: it moves there by itself in ten seconds unless told to stay, its
// settings handed over once by the lab (two origins never share a browser's storage). Moved once, a later visit over http says that what it changes
// stays on the http side. Staying is remembered and said: the MIDI devices, the console's own window and the clipboard want https from another computer.
// The https page takes what was handed and starts again with it. Engine → Security: the door, the Studio's own authority to trust once, how.
//
// HERESY 2138 (the audit of 06.11.2026, 2.3): the hand-over took the whole storage over plain http, the OpenRouter and Civitai keys a Remember kept
// as well: a paid key seen once by anyone listening on the network, and HERESY 1012's promise (the key goes only to openrouter.ai) broken. The keys
// heresy-settings.js keeps local as secrets (HeresySettings.secrets, the one list) now stay in the http page; the https page says which stayed and where
// to put them in again. Without that list (the settings' script did not load) nothing is handed over, and that is said.
//
//   HeresyHttps.offer(opts) · HeresyHttps.paint() · HeresyHttps.state() · HeresyHttps.left() · HeresyHttps.dropped()   (opts {host, port, go} for the checks)
(function () {
  "use strict";
  var STAY = "ruach.https.stay", MOVED = "ruach.https.moved", LEFT = "ruach.https.left", DROPPED = "ruach.https.dropped", WAIT = 120;   // HERESY 2005: two minutes to read it («чтобы чел смог прочитать и хоть немного осмыслить»)
  var S = { tls: null, el: null, timer: 0 };
  function $(id) { return document.getElementById(id); }
  function tr(s) { return window.RuachI18n ? window.RuachI18n.t(s) : s; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function put(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* private */ } }
  function toast(t, k) { if (window.HeresyToast) window.HeresyToast(t, k); }
  var LOCAL = /^(localhost|127\.0\.0\.1|\[::1\]|::1)$/i.test(location.hostname) || /\.localhost$/i.test(location.hostname);
  var SCOPE = new URLSearchParams(location.search).get("scope");
  function lab(path, body) {
    var opt = body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {};
    return fetch("/lab" + path, opt).then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || "HTTP " + r.status); return d; }); });
  }
  function target(port, host) { return "https://" + (host || location.hostname) + ":" + port + location.pathname + location.search; }
  function secrets() { var s = window.HeresySettings && window.HeresySettings.secrets; return Array.isArray(s) ? s : null; }   // HERESY 2138
  var WHERE = { "yue2.orKey": "the OpenRouter key (Engine → Writer and Artwork)", "yue2.civitaiKey": "the Civitai key (the Artist's window «An adapter from Civitai»)" };

  // ---- the https side: what the http page handed over, taken once, then the page starts again with it
  function take(hash, then) {
    var m = /[#&]handoff=([A-Za-z0-9_-]+)/.exec(hash || "");
    if (!m) return false;
    if (!then) history.replaceState(null, "", location.pathname + location.search);
    lab("/handoff?token=" + m[1]).then(function (d) {
      Object.keys(d.storage || {}).forEach(function (k) { put(k, d.storage[k]); });
      put(MOVED, String(Date.now()));
      if (Array.isArray(d.dropped) && d.dropped.length) put(DROPPED, JSON.stringify(d.dropped));   // HERESY 2225: said after the reload
      if (then) { left(); dropped(); then(d); } else location.reload();
    }).catch(function (e) { toast(tr("The settings did not come over:") + " " + e.message, "bad"); });
    return true;
  }

  // HERESY 2138: on the https side, once: the keys the http page kept back, by name (a name not on the list of secrets is not repeated)
  function left() {
    var raw = get(LEFT), keep = secrets(), names = [];
    if (raw === null || !keep) return [];              // without the settings' list the names wait for a load that has it: never dropped unsaid
    put(LEFT, null);
    try { names = JSON.parse(raw); } catch (e) { names = []; }
    names = (Array.isArray(names) ? names : []).filter(function (k) { return keep.indexOf(k) >= 0; });
    if (names.length) toast(tr("Kept on the http side, so they never crossed the network in the clear: {0}. Put them in again here.")
      .replace("{0}", names.map(function (k) { return tr(WHERE[k] || k); }).join("; ")), "warn");
    return names;
  }

  // HERESY 2225 (the audit of 06.11.2026, §2.5; 2177 left it to the lab's log): on the https side, once: the settings the lab did not hand over (one
  // naming an address, or not the Studio's own), by name, so nothing stays behind unsaid
  function dropped() {
    var raw = get(DROPPED), names = [];
    if (raw === null) return [];
    put(DROPPED, null);
    try { names = JSON.parse(raw); } catch (e) { names = []; }
    names = (Array.isArray(names) ? names : []).filter(function (k) { return typeof k === "string" && k; });
    if (names.length) toast(tr("Not handed over to https, since they name an address or are not the Studio's own settings: {0}. Set them again here if you need them.")
      .replace("{0}", names.slice(0, 12).join(", ") + (names.length > 12 ? ", …" : "")), "warn");
    return names;
  }

  // ---- the http side: the offer
  function close() { clearInterval(S.timer); S.timer = 0; if (S.el) { S.el.remove(); S.el = null; } }
  function move(port, opts) {
    var moved = get(MOVED), go = (opts && opts.go) || function (url) { location.href = url; };
    if (moved) return Promise.resolve(go(target(port, opts && opts.host)));
    var keep = secrets(), all = {}, held = [];
    if (!keep) return Promise.reject(new Error(tr("the page's own settings did not load, so nothing was handed over: reload the page and move again")));
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k || k === STAY || k === MOVED || k === LEFT || k === DROPPED) continue;
        if (keep.indexOf(k) >= 0) { if (localStorage.getItem(k)) held.push(k); continue; }   // HERESY 2138: a secret stays where it was typed
        all[k] = localStorage.getItem(k);
      }
    } catch (e) { /* private */ }
    if (held.length) all[LEFT] = JSON.stringify(held);
    return lab("/handoff", { storage: all }).then(function (d) {
      put(MOVED, String(Date.now()));
      return go(target(port, opts && opts.host) + "#handoff=" + d.token);
    });
  }
  function offer(opts) {
    opts = opts || {};
    var port = opts.port || (S.tls && S.tls.port) || 7443, moved = get(MOVED), left = WAIT;
    close();
    var when = moved ? new Date(+moved).toLocaleString(window.RuachI18n && window.RuachI18n.locales ? window.RuachI18n.locales() : undefined) : "";
    var url = target(port, opts.host);
    var back = document.createElement("div");
    back.className = "hs-back";
    back.innerHTML = '<div class="hs-box" role="dialog" aria-modal="true" aria-label="' + esc(tr("The Studio over https")) + '"><b class="hs-title">' + esc(tr("The Studio over https")) + "</b>" +
      '<p class="hs-p">' + esc(tr("This page came over plain http from another computer, and a browser gives such a page no MIDI devices, no window of its own for the console and no clipboard. The Studio's own https door answers at {0}: the Studio moves there now, and your settings come along.").replace("{0}", url.replace(/\/[^/]*$/, ""))) + "</p>" +
      (moved ? '<p class="hs-p hs-warn">' + esc(tr("Your settings moved to https on {0}: what you changed here on http since stays here, and the https side keeps its own.").replace("{0}", when)) + "</p>" : "") +
      '<p class="hs-p hs-note">' + esc(tr("The first time, the browser warns about the Studio's own certificate: choose Advanced, then Proceed. Or trust the Studio's authority once (Engine → Security), and it never warns again.")) + "</p>" +
      '<div class="hs-acts"><button type="button" class="btn ghost small" data-hs="stay">' + esc(tr("Stay on http")) + '</button><button type="button" class="btn primary small" data-hs="go"></button></div></div>';
    document.body.appendChild(back);
    S.el = back;
    var goBtn = back.querySelector('[data-hs="go"]');
    var paintGo = function () { goBtn.textContent = tr("Go to https ({0})").replace("{0}", Math.floor(left / 60) + ":" + ("0" + left % 60).slice(-2)); };   // HERESY 2005: 2:00
    paintGo();
    var go = function () { close(); return move(port, opts).catch(function (e) { toast(tr("Not moved to https:") + " " + e.message, "bad"); }); };
    S.timer = setInterval(function () { left--; if (left <= 0) go(); else paintGo(); }, 1000);
    back.addEventListener("click", function (e) {
      var b = e.target.closest("[data-hs]");
      if (!b) return;
      if (b.dataset.hs === "go") go();
      else { close(); put(STAY, "1"); toast(tr("Staying on http: from another computer the MIDI devices, the console's own window and the clipboard do not work here. Engine → Security moves the Studio to https any time."), "bad"); paint(); }
    });
    goBtn.focus();
    return back;
  }

  // ---- Engine → Security: the door, the authority, how to trust it
  var HOW = "Chrome, Chromium or Edge on Linux: Settings → Privacy and security → Security → Manage certificates → Authorities → Import, and tick «Trust this certificate for identifying websites». Firefox: Settings → Privacy & Security → Certificates → View Certificates → Authorities → Import. Windows: open the file → Install Certificate → Local Machine → Trusted Root Certification Authorities. macOS: open the file in Keychain Access (System), then Trust → Always Trust. A phone: Settings → Security → install a certificate (CA).";
  function paint() {
    var box = $("accHttps"), t = S.tls;
    if (!box) return;
    if (!t) { box.innerHTML = ""; return; }
    var onHttp = location.protocol === "http:" && !LOCAL;
    box.innerHTML = '<h4 class="lora-sub">' + esc(tr("The Studio over https")) + "</h4>" +
      '<p class="hint">' + esc(t.door ? tr("The https door answers on port {0}.").replace("{0}", t.port)
        : tr("The https door does not answer: the Studio is on http alone (RUACH_TLS=0, or no openssl to make its certificate).")) + "</p>" +
      (t.door && t.ca ? '<p class="hint">' + esc(tr("Its certificate is signed by the Studio's own authority: trust that once, and no browser of this computer warns again.")) + "</p>" +
        '<div class="hs-row"><a class="btn ghost small" href="/lab/tls/ca.crt" download="Ruach-Studio-authority.crt">' + esc(tr("Download the Studio's authority")) + "</a>" +
        (onHttp ? '<button type="button" class="btn primary small" data-hs-open="1">' + esc(tr("Open over https")) + "</button>" : "") + "</div>" +
        '<p class="hint hs-fp">' + esc(tr("Its fingerprint (SHA-256), to compare when you trust it:")) + ' <code translate="no">' + esc(t.ca_sha256) + "</code></p>" +
        '<details class="hs-how"><summary>' + esc(tr("How to trust it")) + "</summary><p>" + esc(tr(HOW)) + "</p></details>" : "") +
      (t.door && !t.ca ? '<p class="hint">' + esc(tr("The door's certificate is signed by itself (made before 2.0.5): it is made anew by the Studio's authority when the door starts again.")) + "</p>" : "") +
      (onHttp && t.door ? '<label class="check" data-tip="' + esc(tr("Asked whenever a page opens the Studio over http from another computer; off, it stays on http without asking")) + '"><input type="checkbox" id="hsAsk"' +
        (get(STAY) === "1" ? "" : " checked") + " /> <span>" + esc(tr("Ask to move to https when opened over http from another computer")) + "</span></label>" : "");
  }
  function load() {
    return lab("/tls").then(function (t) { S.tls = t; paint(); return t; }).catch(function () { S.tls = null; paint(); return null; });
  }
  function init() {
    if (location.protocol === "https:" && take(location.hash)) return;
    if (location.protocol === "https:") { left(); dropped(); }
    document.addEventListener("click", function (e) {
      if (e.target.closest && e.target.closest('#engineTabs [data-etab="places"]')) setTimeout(load, 0);
      var o = e.target.closest && e.target.closest("[data-hs-open]");
      if (o && S.tls) move(S.tls.port).catch(function (er) { toast(tr("Not moved to https:") + " " + er.message, "bad"); });
    });
    document.addEventListener("change", function (e) { if (e.target && e.target.id === "hsAsk") put(STAY, e.target.checked ? null : "1"); });
    window.addEventListener("ruach-lang", paint);
    if (location.protocol !== "http:" || LOCAL || SCOPE) { load(); return; }
    load().then(function (t) { if (t && t.door && get(STAY) !== "1") offer(); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
  window.HeresyHttps = { offer: offer, paint: paint, load: load, close: close, take: take, left: left, dropped: dropped, state: function () { return { tls: S.tls, open: !!S.el, stay: get(STAY), moved: get(MOVED) }; } };
})();
