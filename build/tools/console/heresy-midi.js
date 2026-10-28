// HERESY 1589 (Viktor 19.10.2026: «Хорошо, беру M-Audio Oxygen 61 MKV»; «официально с 2.0.0 релизом выкатим early-release поддержку
// M-Audio миди контроллеров. И предусмотреть интерфейс для 3rd party плагинов для MIDI. Откроем "MIDI API", люди начнут писать свои
// плагины»): the studio's MIDI, one for the whole page.
//   A keyboard's keys go to whoever listens (the piano roll). A controller's control port goes to a script that turns its buttons,
//   faders and knobs into the studio's actions: the built-in one speaks Mackie Control, as the Oxygen MKV's DAW port does in its
//   «Mc» presets (and many controllers with it); a plugin's script (user/plugins/NAME/plugin.json, "midi") runs in a worker of its
//   own, away from the page: it is handed each message and answers with actions by name, words to say and bytes to send back (a
//   light, a display). The actions are the rooms': the one that offered them last answers (the roll over the DAW over the player).
//   MIDI is the browser's only on a secure page (localhost or https), and it is asked for once; a port plugged in later is met.
//   ruach.midi/1: onMidi(function (bytes, port) {…}) · studio.act(name, …args) · studio.say(text) · studio.send(bytes)
//   The actions: play stop record rewind forward loop · trackLeft trackRight bankLeft bankRight · fader(strip, 0…1) pan(strip, −63…63)
//   mute(strip) solo(strip) select(strip) arm(strip) · octave(±1). A worker is a fence for the page, not against its plugin's author:
//   a plugin runs with the rights its folder was given, as its Python steps do.
(function () {
  "use strict";
  var M = { access: null, wait: null, listen: [], acts: [], scripts: [], roles: {}, workers: {}, plugins: null, light: {} };
  var ACTIONS = ["play", "stop", "record", "rewind", "forward", "loop", "trackLeft", "trackRight", "bankLeft", "bankRight",
                 "fader", "pan", "mute", "solo", "select", "arm", "octave"];
  var IDLE = /\b(DAW|MIDIIN[2-9]|Mackie|MCU|HUI)\b|MIDI [2-9]$/i;     // a control port no script claims is left alone, never taken for keys
  function tr(s) { return window.RuachI18n && window.RuachI18n.t ? window.RuachI18n.t(s) : s; }

  // ---- the browser's MIDI
  function why() {
    if (!window.isSecureContext) {
      var port = location.port || (location.protocol === "https:" ? "443" : "80");
      // HERESY 1805: the studio's https door first (lab/tls_door.py, systemctl --user enable --now ruach-tls-door), ssh -L beside it
      return tr("MIDI needs the studio opened as localhost or over https; this page is {0}. From another computer: the studio's https door, {1} (its own certificate: the browser asks once), or ssh -L {2} {3}, then {4}")
        .replace("{0}", location.origin).replace("{1}", "https://" + location.hostname + ":7443").replace("{2}", port + ":localhost:" + port).replace("{3}", location.hostname).replace("{4}", "http://localhost:" + port);
    }
    if (!navigator.requestMIDIAccess) return tr("This browser gives no MIDI (Chrome and Edge do)");
    return "";
  }
  function on() {
    if (M.access) return Promise.resolve(status());
    if (M.wait) return M.wait;
    var w = why();
    if (w) return Promise.reject(new Error(w));
    M.wait = navigator.requestMIDIAccess().then(function (a) {
      M.access = a;
      return plugins().then(function () { bind(); a.onstatechange = function () { if (M.access === a) bind(); }; keep(true); return status(); });
    }, function () { M.wait = null; throw new Error(tr("MIDI was not allowed by the browser")); });
    return M.wait;
  }
  function off() {
    if (!M.access) return;
    M.access.inputs.forEach(function (i) { i.onmidimessage = null; });
    M.access.onstatechange = null; M.access = null; M.wait = null; M.roles = {};
    Object.keys(M.workers).forEach(function (k) { M.workers[k].terminate(); }); M.workers = {};
    M.scripts = M.scripts.filter(function (x) { return !x.plugin; }); M.plugins = null;   // a plugin's script read anew next time
    keep(false);
    emit("ports", status());
  }
  function keep(v) { try { localStorage.setItem("yue2.midiOn", v ? "1" : ""); } catch (e) { /* private mode */ } }
  function kept() { try { return localStorage.getItem("yue2.midiOn") === "1"; } catch (e) { return false; } }
  function scriptFor(name) { for (var i = M.scripts.length - 1; i >= 0; i--) if (M.scripts[i].match.test(name)) return M.scripts[i]; return null; }
  function outFor(inp) {                                // the output beside an input: the same name, or IN said OUT (MIDIIN2 ↔ MIDIOUT2)
    var want = [inp.name, String(inp.name || "").replace(/MIDIIN/i, "MIDIOUT")], got = null;
    if (M.access && M.access.outputs) M.access.outputs.forEach(function (o) { if (!got && want.indexOf(o.name) >= 0 && (!inp.manufacturer || o.manufacturer === inp.manufacturer)) got = o; });
    return got;
  }
  function bind() {
    var seen = {};
    M.access.inputs.forEach(function (inp) {
      var s = scriptFor(inp.name || ""), role = s ? "control" : IDLE.test(inp.name || "") ? "idle" : "keys";
      M.roles[inp.id] = { id: inp.id, name: inp.name || "", role: role, script: s ? s.id : "", scriptName: s ? s.name : "", out: !!outFor(inp) };
      seen[inp.id] = 1;
      inp.onmidimessage = function (ev) { route(inp, ev.data); };
    });
    Object.keys(M.roles).forEach(function (k) { if (!seen[k]) delete M.roles[k]; });
    emit("ports", status());
  }
  function status() {
    var list = Object.keys(M.roles).map(function (k) { return M.roles[k]; });
    return { on: !!M.access, why: M.access ? "" : why(), ports: list, keys: list.filter(function (p) { return p.role === "keys"; }).length,
             control: list.filter(function (p) { return p.role === "control"; }).length, idle: list.filter(function (p) { return p.role === "idle"; }).length,
             scripts: M.scripts.map(function (s) { return { id: s.id, name: s.name, plugin: s.plugin || "" }; }) };
  }
  function route(inp, d) {
    var r = M.roles[inp.id];
    if (!r || !d || !d.length) return;
    if (r.role === "control") { var s = M.scripts.filter(function (x) { return x.id === r.script; })[0]; if (s) s.handle(Array.prototype.slice.call(d), api(inp), inp.name); return; }
    if (r.role !== "keys") return;
    var cmd = d[0] & 0xf0, ch = (d[0] & 0x0f) + 1, kind = ch === 10 ? "pad" : "note";   // channel 10: a controller's pads, not its keys
    if (cmd === 0x90 && d[2] > 0) emit(kind, { on: true, pitch: d[1], velocity: d[2], channel: ch, port: inp.name });
    else if (cmd === 0x80 || cmd === 0x90) emit(kind, { on: false, pitch: d[1], velocity: 0, channel: ch, port: inp.name });
    else if (cmd === 0xe0) emit("bend", { value: ((d[2] << 7) | d[1]) - 8192, channel: ch, port: inp.name });
    else if (cmd === 0xb0) emit("cc", { cc: d[1], value: d[2], channel: ch, port: inp.name });
  }
  function listen(kind, fn) { var x = [kind, fn]; M.listen.push(x); return function () { M.listen = M.listen.filter(function (y) { return y !== x; }); }; }
  function emit(kind, ev) { M.listen.slice().forEach(function (x) { if (x[0] === kind) { try { x[1](ev); } catch (e) { if (window.console) console.error(e); } } }); }

  // ---- the actions: each room offers its own while it is open; the one that offered last answers, unless it says false (not now)
  function provide(owner, table) {
    M.acts = M.acts.filter(function (a) { return a.owner !== owner; });
    M.acts.push({ owner: owner, table: table });
    return function () { M.acts = M.acts.filter(function (a) { return a.owner !== owner; }); };
  }
  function act(name, args) {
    if (ACTIONS.indexOf(name) < 0) return "";
    for (var i = M.acts.length - 1; i >= 0; i--) {
      var f = M.acts[i].table[name];
      if (typeof f !== "function") continue;
      var r;
      try { r = f.apply(null, args || []); } catch (e) { if (window.console) console.error(e); }
      if (r === false) continue;
      emit("act", { name: name, args: args || [], by: M.acts[i].owner });
      return M.acts[i].owner;
    }
    return "";
  }
  function api(inp) {
    var out = outFor(inp);
    return { act: function (n) { return act(n, Array.prototype.slice.call(arguments, 1)); },
             send: function (bytes) { if (out) { try { out.send(bytes); } catch (e) { /* a port gone */ } } },
             say: function (t) { emit("say", { text: String(t).slice(0, 200), port: inp.name }); } };
  }
  // the transport as the rooms report it: a control port's lights follow (Play, Record)
  function transport(st) {
    M.light = { playing: !!(st && st.playing), recording: !!(st && st.recording) };
    if (!M.access) return;
    M.access.inputs.forEach(function (inp) {
      var r = M.roles[inp.id], s = r && r.role === "control" ? M.scripts.filter(function (x) { return x.id === r.script; })[0] : null;
      if (s && s.lights) s.lights(M.light, api(inp));
    });
  }

  // the player and the DAW offer their transport from the start: the player always, the DAW while it is in sight
  function playBtn() { return document.getElementById("playBtn"); }
  function dawSeen() { var b = document.getElementById("mxBody"), X = window.HeresyMixer; return !!(b && b.offsetParent !== null && X && X.state().take); }
  provide("player", { play: function () { var b = playBtn(); if (b && !b.classList.contains("is-playing")) b.click(); },
                      stop: function () { var b = playBtn(); if (b && b.classList.contains("is-playing")) b.click(); } });
  provide("daw", { play: function () { if (!dawSeen()) return false; window.HeresyMixer.play(); }, stop: function () { if (!dawSeen()) return false; window.HeresyMixer.stop(); } });

  // ---- Mackie Control, built in: the transport's buttons, the strips' faders, knobs and buttons, the banks
  var BTN = { 0x5b: "rewind", 0x5c: "forward", 0x5d: "stop", 0x5e: "play", 0x5f: "record", 0x56: "loop", 0x2e: "bankLeft", 0x2f: "bankRight", 0x30: "trackLeft", 0x31: "trackRight" };
  // ports named Mackie or MCU, and an M-Audio Oxygen's second port (its DAW port: «Oxygen 61 MKV MIDI 2» on Linux, «MIDIIN2 (Oxygen 61)» on
  // Windows); another maker's DAW port speaks a language of its own and is left to a plugin's script
  M.scripts.push({ id: "mcu", name: "Mackie Control", match: /\b(Mackie|MCU)\b|Oxygen.*\b(MIDIIN2|MIDI 2)\b|MIDIIN2 \(Oxygen/i,
    handle: function (d, A) {
      var cmd = d[0] & 0xf0, ch = d[0] & 0x0f, n = d[1];
      if (cmd === 0x90) {
        if (!d[2]) return;                                // a button let go
        if (BTN[n]) { A.act(BTN[n]); return; }
        if (n <= 0x07) A.act("arm", n); else if (n <= 0x0f) A.act("solo", n - 0x08); else if (n <= 0x17) A.act("mute", n - 0x10); else if (n <= 0x1f) A.act("select", n - 0x18);
      } else if (cmd === 0xe0) A.act("fader", ch, ((d[2] << 7) | d[1]) / 16383);   // channel 9: the master
      else if (cmd === 0xb0 && n >= 0x10 && n <= 0x17) { var v = d[2] & 0x3f; A.act("pan", n - 0x10, d[2] & 0x40 ? -v : v); }
    },
    lights: function (L, A) { A.send([0x90, 0x5e, L.playing ? 0x7f : 0]); A.send([0x90, 0x5f, L.recording ? 0x7f : 0]); } });

  // ---- a plugin's script in a worker of its own: no page, no network; messages in, actions out
  var PRE = "'use strict';[\"fetch\",\"XMLHttpRequest\",\"WebSocket\",\"EventSource\",\"importScripts\",\"indexedDB\",\"caches\",\"Worker\"].forEach(function(k){try{self[k]=undefined;}catch(e){}});" +
    "var __h=null;function onMidi(f){__h=f;}" +
    "var studio={api:'ruach.midi/1',act:function(n){postMessage({act:String(n),args:[].slice.call(arguments,1)});},say:function(t){postMessage({say:String(t)});},send:function(b){postMessage({send:[].slice.call(b)});}};" +
    "self.onmessage=function(e){var m=e.data||{};if(m.midi&&__h){try{__h(m.midi,m.port);}catch(x){postMessage({error:String(x&&x.message||x)});}}};\n";
  function plugins() {
    if (M.plugins) return Promise.resolve();
    return fetch("/lab/plugins").then(function (r) { return r.ok ? r.json() : { plugins: [] }; }).catch(function () { return { plugins: [] }; }).then(function (d) {
      M.plugins = [];
      (d.plugins || []).filter(function (p) { return !window.HeresyPro || window.HeresyPro.keep(p); }).forEach(function (p) { (p.midi || []).forEach(function (m) { M.plugins.push({ plugin: p.id, pname: p.name, id: m.id, name: m.name, ports: m.ports }); }); });
      return Promise.all(M.plugins.map(function (m) {
        var re; try { re = new RegExp(m.ports, "i"); } catch (e) { return null; }
        return fetch("/lab/plugins/midi?plugin=" + encodeURIComponent(m.plugin) + "&id=" + encodeURIComponent(m.id)).then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); }).then(function (code) {
          var key = m.plugin + "/" + m.id;
          M.scripts.push({ id: key, name: m.name + " · " + m.pname, plugin: m.plugin, match: re,
            handle: function (dd, A, portName) {
              var w = M.workers[key];
              if (!w) {
                w = M.workers[key] = new Worker(URL.createObjectURL(new Blob([PRE + code], { type: "text/javascript" })));
                w.onmessage = function (e) { var x = e.data || {}; if (x.act) w.A.act.apply(null, [x.act].concat(x.args || [])); else if (x.send) w.A.send(x.send); else if (x.say) w.A.say(x.say); else if (x.error) emit("say", { text: m.name + ": " + x.error, bad: true }); };
              }
              w.A = A;
              w.postMessage({ midi: dd, port: portName });
            } });
        }).catch(function () { emit("say", { text: tr("A plugin's MIDI script did not load:") + " " + m.name, bad: true }); });
      }));
    });
  }

  // ---- Engine → Hardware → MIDI: listening on or off, the ports and what each is taken for
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function card() {
    var btn = document.getElementById("midiOnBtn"), list = document.getElementById("midiPorts"), say = document.getElementById("midiSay");
    if (!btn || !list) return;
    var paint = function (st) {
      st = st || status();
      btn.textContent = tr(st.on ? "Stop listening to MIDI" : "Listen to MIDI");
      btn.setAttribute("aria-pressed", st.on ? "true" : "false");
      if (say) { say.textContent = st.on ? "" : st.why; say.classList.toggle("is-bad", !st.on && !!st.why); }
      list.innerHTML = !st.on ? "" : !st.ports.length ? '<div class="row-hint">' + esc(tr("No MIDI port")) + "</div>" : st.ports.map(function (p) {
        var what = p.role === "keys" ? tr("keys: they play the piano roll") : p.role === "control" ? tr("control: {0}").replace("{0}", p.scriptName) : tr("left alone: no script speaks its language");
        return '<div class="midi-port is-' + p.role + '"><span class="midi-name">' + esc(p.name) + '</span><span class="midi-role">' + esc(what) + "</span></div>";
      }).join("");
    };
    btn.addEventListener("click", function () {
      if (M.access) { off(); paint(); return; }
      on().then(paint, function (e) { paint(); if (say) { say.textContent = e.message; say.classList.add("is-bad"); } });
    });
    listen("ports", paint);
    listen("say", function (ev) { if (say && ev.text) { say.textContent = ev.text; say.classList.toggle("is-bad", !!ev.bad); } });
    paint();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", card); else card();

  window.HeresyMidi = { on: on, off: off, status: status, listen: listen, provide: provide, act: act, transport: transport, why: why, kept: kept,
                        scripts: function () { return M.scripts.slice(); } };
  if (kept() && !why()) on().catch(function () { /* the browser asks again when one turns it on */ });   // as it was left
})();
