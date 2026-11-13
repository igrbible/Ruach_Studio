// HERESY 1977 (Viktor 31.10.2026: «Сделай интеграцию Pianoteq даже лучше и удобнее, чем официальный их X11 GUI»): the Pianoteq step's own
// window, over the lab's /lab/pianoteq/ (Pianoteq's own JSON-RPC, run on the copy the user installed). The step's panel (and its node on the
// canvas) carries one line: the preset and how much of it is changed; that line opens the window. In it: any of Pianoteq's presets from a
// browser by class and instrument with their words; its small presets (reverb, tuning, velocity, microphones, equalizer, effects); every
// parameter this edition lets one set as a row in Pianoteq's own words, the eight microphones as a mixer; what differs from the preset marked
// and given back one by one or all at once; A/B; a phrase heard with it (chords, arpeggios, a ladder of dynamics, the keyboard's range); the
// state kept as the user's own Pianoteq preset. The state lives in the step's hidden «state» field, so profiles and the way keep it, and only
// when it says more than the step's own preset list does; the render plays it through a preset file. What the edition locks is shown, said
// and left alone. Nothing asks Pianoteq until the window is opened.
(function () {
  "use strict";
  var CAT_P = {}, PRESETS = {}, OPEN_KEY = "yue2.ptqOpen";
  // HERESY 2036: Modartt's three, each its own catalog and presets; the lab hears the product in ?product= (a POST's «product»)
  var NAMES = { pianoteq: "Pianoteq", organteq: "Organteq", airteq: "Airteq" };
  function pq(P, sep) { return P && P !== "pianoteq" ? sep + "product=" + P : ""; }
  function tr(s) { return window.RuachI18n ? window.RuachI18n.t(s) : s; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function json(r) { return r.json().then(function (b) { if (!r.ok) throw new Error(b.error || r.status); return b; }); }
  function scope() { var m = /[?&]scope=([^&]*)/.exec(location.search); return m ? "?scope=" + m[1] : ""; }
  function fire(el) { el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); }
  function catalog(P) {
    P = P || "pianoteq";
    if (!CAT_P[P]) { CAT_P[P] = fetch("/lab/pianoteq/catalog" + pq(P, "?")).then(json); CAT_P[P].catch(function () { delete CAT_P[P]; }); }
    return CAT_P[P];
  }
  function presetOf(P, name, bank, small) {             // HERESY 1981: with small presets, as they leave it (the base changes are marked against)
    var sm = small && Object.keys(small).length ? JSON.stringify(small) : "";
    var k = (P || "pianoteq") + "\u0000" + (bank || "") + "\u0000" + name + "\u0000" + sm;
    if (!PRESETS[k]) {
      PRESETS[k] = fetch("/lab/pianoteq/preset?name=" + encodeURIComponent(name) + "&bank=" + encodeURIComponent(bank || "") +
        (sm ? "&small=" + encodeURIComponent(sm) : "") + pq(P, "&")).then(json);
      PRESETS[k].catch(function () { delete PRESETS[k]; });
    }
    return PRESETS[k];
  }
  var UNITS = { volume: "dB", post_effect_gain: "dB", reverb_mix: "dB", bus_1_volume: "dB", damper_noise: "dB", pedal_noise: "dB", key_release_noise: "dB",
    diapason: "Hz", reverb_duration: "s", reverb_pre_delay: "s", room_dimensions: "m", reverb_highpass_cutoff: "Hz", reverb_early_reflections: "dB",
    bounce_delay: "ms", sound_speed: "m/s", limiter_threshold: "dB", limiter_gain: "dB", nfx_lfo_rate: "Hz", dynamics: "dB" };
  function unit(id, m) {
    if (m && /^PEQ\dF$/.test(m.name)) return "Hz";       // HERESY 1981: an effect's EQ band: its frequency and gain
    if (m && /^PEQ\dG$/.test(m.name)) return "dB";
    return UNITS[id] || (/_bus_1_volume$/.test(id) ? "dB" : "");
  }
  function said(meta, id, x) { var t = textAt(meta, x), u = unit(id, meta); return u && num(t) !== null ? t + " " + u : t; }   // «Off» stays a word, without «dB»
  // HERESY 1981: an effect slot's parameters are named by its effect in Pianoteq's short words; said here as a person would read them
  var EFFN = { DelMix: "Delay mix", DelTime: "Delay time", DelFb: "Feedback", DelTone: "Tone", DelPol: "Polarity", DelPing: "Ping-pong" };
  function effName(n) { var m = /^PEQ(\d)([FGQT])$/.exec(n); return m ? "Band " + m[1] + " · " + { F: "frequency", G: "gain", Q: "Q", T: "type" }[m[2]] : EFFN[n] || n; }
  function effKind(e) {
    var k = e ? e.key || "" : "";
    return /^Del/.test(k) ? tr("Delay") : /^PEQ/.test(k) ? tr("Parametric EQ") : /^Param 1\|/.test(k) || !k ? tr("No effect in this slot") : k.split("|")[0];
  }
  var SECTIONS = { main: "Main", reverb: "Reverb", mics: "Microphones", noises: "Noises", limiter: "Limiter and equalizer", effects: "Effects",
    instrument: "This instrument", bounce: "Bounce", nfx: "Vibrato and tremolo", design: "Design", spectrum: "Spectrum profile", more: "More" };
  var SMALL = [["reverb", "Reverb"], ["tuning", "Tuning"], ["vel", "Velocity curve"], ["mic", "Microphones"], ["equ", "Equalizer"], ["effect1", "Effects"]];
  var PHRASES = [["chords", "Chords"], ["arpeggio", "Arpeggios"], ["ladder", "Dynamics, soft to loud"], ["range", "The whole keyboard"]];

  // a value in Pianoteq's own words, between the two samples of its scale it falls between
  function decimals(t) { var m = /\.(\d+)/.exec(t); return m ? m[1].length : 0; }
  function num(t) { var v = parseFloat(String(t).replace("+", "")); return isNaN(v) ? null : v; }
  function textAt(meta, x) {
    var sc = meta.scale || [];
    if (!sc.length) return "";
    if (meta.kind === "switch") return x >= 0.5 ? "On" : "Off";
    var i = 0;
    while (i < sc.length - 2 && sc[i + 1][1] < x) i++;
    var a = sc[i], b = sc[Math.min(i + 1, sc.length - 1)];
    if (meta.kind === "choice" || num(a[2]) === null || num(b[2]) === null || b[1] === a[1]) return Math.abs(x - a[1]) <= Math.abs(b[1] - x) ? a[2] : b[2];
    var t = (x - a[1]) / (b[1] - a[1]), v = num(a[2]) + (num(b[2]) - num(a[2])) * t, d = Math.max(decimals(a[2]), decimals(b[2]));
    var s = v.toFixed(d);
    return (/^\+/.test(a[2]) || /^\+/.test(b[2])) && v > 0 ? "+" + s : s;
  }
  function choices(meta) {                           // a choice's words, each at the middle of the stretch that reads it
    var out = [];
    (meta.scale || []).forEach(function (s) {
      var last = out[out.length - 1];
      if (last && last.text === s[2]) { last.hi = s[1]; } else out.push({ text: s[2], lo: s[1], hi: s[1] });
    });
    return out.map(function (c) { return { text: c.text, x: Math.round((c.lo + c.hi) / 2 * 1000) / 1000 }; });
  }
  function keepOpen(sec, on) {
    try { var o = JSON.parse(localStorage.getItem(OPEN_KEY) || "{}") || {}; o[sec] = on ? 1 : 0; localStorage.setItem(OPEN_KEY, JSON.stringify(o)); } catch (e) { /* private mode */ }
  }
  function isOpen(sec) {                             // the window is wide: all open but the instrument's make and the locked
    var dflt = !/^(design|spectrum|more|locked)$/.test(sec);
    try { var o = JSON.parse(localStorage.getItem(OPEN_KEY) || "{}") || {}; return sec in o ? !!o[sec] : dflt; } catch (e) { return dflt; }
  }
  function relevant(id, cls) {                       // an instrument's own knobs only where that instrument is
    if (/^guitar_|^fret$|^virtuosity$/.test(id)) return /guitar/i.test(cls);
    if (/^harpsichord_register_/.test(id)) return /harpsichord|historical/i.test(cls);
    if (/^clavinet_/.test(id)) return /clavinet|electric/i.test(cls);
    return true;
  }

  function mount(panel, product) {
    // HERESY 2036: the step's product; its words Pianoteq's, the name put in (each language keeps the name as it is)
    var P = NAMES[product] ? product : "pianoteq", NAME = NAMES[P];
    function tr(s) { var t = window.RuachI18n ? window.RuachI18n.t(s) : s; return P === "pianoteq" ? t : String(t).replace(/Pianoteq/g, NAME); }
    var input = panel.querySelector('[data-pl-key="state"]');
    if (!input || panel.querySelector(".ptq-chip")) return;
    var sel = panel.querySelector('[data-pl-key="preset"]');
    var listed = sel ? Array.prototype.map.call(sel.options, function (o) { return o.value; }) : [];   // the step's own list, as the lab knows it
    var grid = panel.querySelector(".rm-grid");
    var chip = document.createElement("button");
    chip.type = "button";
    chip.className = "ptq-chip";
    chip.setAttribute("data-tip", tr("Pianoteq's own window: any of its presets, every setting it lets one set, heard before the stem is played"));
    grid.parentNode.insertBefore(chip, grid.nextSibling);
    var C = null, S = { st: fromInput(), base: null, ab: null, busy: false, writing: false, soon: 0 }, W = null;

    function read() { try { var v = JSON.parse(input.value || "{}"); return v && typeof v === "object" ? v : {}; } catch (e) { return {}; } }
    function fromInput() { var v = read(); return v.preset ? v : { preset: (sel && sel.value) || "NY Steinway D Classical", bank: "" }; }
    function own(name) {                              // a preset the step's list has not: put in it, so the node says what plays
      if (!sel || !name || Array.prototype.some.call(sel.options, function (o) { return o.value === name; })) return;
      var o = document.createElement("option");
      o.value = name; o.textContent = name; o.setAttribute("translate", "no");
      sel.appendChild(o);
    }
    function chipPaint() {
      var w = read(), n = Object.keys(w.values || {}).length + Object.keys(w.small || {}).length;
      chip.innerHTML = '<span class="ptq-chip-k" translate="no">' + NAME + '</span><b translate="no">' + esc(S.st.preset || "—") + "</b>" +
        (n ? '<span class="ptq-chip-n">' + esc(tr("{0} changed").replace("{0}", n)) + "</span>" : "") + '<span class="ptq-chip-go" aria-hidden="true">⤢</span>';
    }
    function write() {                                // only what differs from the preset, so the state stays small and says what was done
      clearTimeout(S.soon); S.soon = 0;
      var st = { preset: S.st.preset || "", bank: S.st.bank || "" }, vals = {}, small = {};
      Object.keys(S.st.values || {}).forEach(function (id) {
        var b = S.base && S.base.values[id];
        if (!b || Math.abs(b[0] - S.st.values[id]) > 0.0005) vals[id] = Math.round(S.st.values[id] * 10000) / 10000;
      });
      Object.keys(S.st.small || {}).forEach(function (k) { if (S.st.small[k]) small[k] = S.st.small[k]; });
      if (Object.keys(vals).length) st.values = vals;
      if (Object.keys(small).length) st.small = small;
      var plain = !st.values && !st.small && !st.bank && listed.indexOf(st.preset) >= 0;   // the step's own preset says it all
      var v = !st.preset || plain ? "" : JSON.stringify(st);
      S.writing = true;
      if (input.value !== v) { input.value = v; fire(input); }
      if (sel && st.preset) {
        own(st.preset);
        if (sel.value !== st.preset) { sel.value = st.preset; fire(sel); }
        if (sel._hcPaint) sel._hcPaint();
      }
      S.writing = false;
      chipPaint();
    }
    function writeSoon() { clearTimeout(S.soon); S.soon = setTimeout(write, 250); }   // a slider moved: the step's field once it rests
    function value(id) { return S.st.values && id in S.st.values ? S.st.values[id] : S.base && S.base.values[id] ? S.base.values[id][0] : 0; }
    function changed(id) { var b = S.base && S.base.values[id]; return !!b && S.st.values && id in S.st.values && Math.abs(b[0] - S.st.values[id]) > 0.0005; }
    function say(t, bad) { var el = W && W.win.querySelector(".ptq-say"); if (el) { el.textContent = t || ""; el.classList.toggle("is-bad", !!bad); } }

    function load(name, bank, fresh) {
      var was = S.st.preset;
      if (fresh || (was && was !== name)) { S.st.values = {}; S.st.small = {}; }
      return presetOf(P, name, bank || "").then(function (p) {
        S.pre = p;                                      // the preset alone: what «the preset's» says in the small presets' lists
        var sm = S.st.small || {};
        return Object.keys(sm).length ? presetOf(P, name, bank || "", sm) : p;
      }).then(function (p) {
        if (W && was !== name) { var au = W.win.querySelector(".ptq-audio"); if (au) { au.pause(); au.removeAttribute("src"); } say(""); }
        S.base = p;
        S.st.preset = name; S.st.bank = bank || "";
        S.st.values = S.st.values || {}; S.st.small = S.st.small || {};
        paint(); write();
      }).catch(function (e) { say(tr("Pianoteq did not answer: {0}").replace("{0}", e.message), true); });
    }
    function rebase() {                                 // HERESY 1981: a small preset picked: the base it leaves, the effects it brings
      var at = S.st.preset;
      say(tr("Pianoteq loads it…"));
      return presetOf(P, S.st.preset, S.st.bank || "", S.st.small || {}).then(function (p) {
        if (S.st.preset !== at) return;
        S.base = p; paint(); write(); say("");
      }).catch(function (e) { say(tr("Pianoteq did not answer: {0}").replace("{0}", e.message), true); });
    }
    function meta(id) {                                 // an effect slot's parameter as this preset's effect has it, else the catalog's
      var m = /^effect_(\d)_param_\d$/.exec(id), e = m && S.base && S.base.effects && S.base.effects[m[1]], o = e && e.params[id];
      if (o && !o.label) o.label = effName(o.name);
      if (!o && /^effect_\d_switch$/.test(id) && C.params[id]) return Object.assign({}, C.params[id], { label: "On" });   // under its slot's heading
      return o || C.params[id];
    }
    function cls() {
      var p = C && S.st.preset ? C.presets.filter(function (x) { return x.name === S.st.preset && (x.bank || "") === (S.st.bank || ""); })[0] : null;
      return p ? p["class"] + " " + p.instr : "";
    }
    function row(id) {
      var m = meta(id), x = value(id), ch = changed(id), backTag = '<span class="ptq-back" role="button" tabindex="-1" data-ptq-back="' + esc(id) + '" data-tip="' +
        esc(tr("Back to the preset's")) + '">↺</span>';
      if (m.kind === "switch") {
        return '<label class="check ptq-row' + (ch ? " is-changed" : "") + '" data-ptq="' + esc(id) + '"><input type="checkbox" data-ptq-in="' + esc(id) + '"' +
          (x >= 0.5 ? " checked" : "") + '> <span translate="no">' + esc(m.label || m.name) + "</span>" + backTag + "</label>";
      }
      if (m.kind === "choice") {
        var cs = choices(m), cur = textAt(m, x);
        return '<label class="field ptq-row' + (ch ? " is-changed" : "") + '" data-ptq="' + esc(id) + '"><span class="label" translate="no">' + esc(m.label || m.name) + "</span>" +
          '<select data-ptq-in="' + esc(id) + '" translate="no">' + cs.map(function (c) { return '<option value="' + c.x + '"' + (c.text === cur ? " selected" : "") + ">" + esc(c.text) + "</option>"; }).join("") +
          "</select>" + backTag + "</label>";
      }
      return '<label class="field ptq-row' + (ch ? " is-changed" : "") + '" data-ptq="' + esc(id) + '"><span class="label" translate="no">' + esc(m.label || m.name) + "</span>" +
        '<input type="range" min="0" max="1" step="0.001" value="' + x + '" data-ptq-in="' + esc(id) + '">' +
        '<output class="mono" translate="no">' + esc(said(m, id, x)) + "</output>" + backTag + "</label>";
    }
    function micRow(n) {                              // a microphone as a mixer strip: on, its level, its pan
      var sw = "mic_" + n + "_mic_switch", vol = "mic_" + n + "_bus_1_volume", pan = "mic_" + n + "_bus_1_pan";
      if (!C.params[sw] || C.params[sw].locked) return "";
      var on = value(sw) >= 0.5, ch = changed(sw) || changed(vol) || changed(pan);
      return '<div class="ptq-mic' + (on ? "" : " is-off") + (ch ? " is-changed" : "") + '" data-ptq-mic="' + n + '">' +
        '<label class="ptq-mic-on"><input type="checkbox" data-ptq-in="' + sw + '"' + (on ? " checked" : "") + "> " + esc(tr("Mic {0}").replace("{0}", n)) + "</label>" +
        '<input type="range" min="0" max="1" step="0.001" value="' + value(vol) + '" data-ptq-in="' + vol + '" aria-label="' + esc(tr("Level")) + '">' +
        '<output class="mono">' + esc(said(C.params[vol], vol, value(vol))) + "</output>" +
        '<input type="range" min="0" max="1" step="0.001" value="' + value(pan) + '" data-ptq-in="' + pan + '" aria-label="' + esc(tr("Pan")) + '">' +
        '<output class="mono">' + esc(textAt(C.params[pan], value(pan))) + "</output>" +
        '<span class="ptq-back" role="button" tabindex="-1" data-ptq-back="' + [sw, vol, pan].join(",") + '" data-tip="' + esc(tr("Back to the preset's")) + '">↺</span></div>';
    }
    function paint() {
      if (!C || !W) return;
      var p = C.presets.filter(function (x) { return x.name === S.st.preset && (x.bank || "") === (S.st.bank || ""); })[0] || {}, k = cls(), total = 0;
      var small = SMALL.filter(function (s) { return (C.small[s[0]] || []).length; }).map(function (s) {
        var list = C.small[s[0]], cur = (S.st.small || {})[s[0]] || "", pre = S.pre || S.base, base = pre && pre.small ? pre.small[s[0]] || "" : "";
        return '<label class="field' + (cur ? " is-changed" : "") + '"><span class="label">' + esc(tr(s[1])) + '</span><select data-ptq-small="' + s[0] + '" translate="no">' +
          '<option value="">' + esc(base ? base + " · " + tr("the preset's") : tr("the preset's")) + "</option>" +
          list.map(function (q) { return '<option value="' + esc(q.name) + '"' + (q.name === cur ? " selected" : "") + ">" + esc(q.name) + "</option>"; }).join("") + "</select></label>";
      }).join("");
      var secs = C.groups.map(function (g) {
        if (g.id === "effects") {                       // HERESY 1981: each slot under its effect's name, its parameters as this preset's effect has them
          var eff = (S.base && S.base.effects) || {}, parts = "", ne = 0;
          [1, 2, 3].forEach(function (n) {
            var sw = "effect_" + n + "_switch", e = eff[String(n)], swOk = C.params[sw] && !C.params[sw].locked;
            var pids = e ? Object.keys(e.params).filter(function (id) { return !e.params[id].locked; }) : [];
            if (!swOk && !pids.length) return;
            ne += pids.filter(changed).length + (swOk && changed(sw) ? 1 : 0);
            parts += '<div class="ptq-sub">' + esc(tr("Effect {0}").replace("{0}", n)) + " · " + esc(effKind(e)) + "</div>" + (swOk ? row(sw) : "") + pids.map(row).join("");
          });
          if (!parts) return "";
          total += ne;
          return '<details class="ptq-sec" data-sec="effects"' + (isOpen("effects") ? " open" : "") + "><summary>" + esc(tr(SECTIONS.effects)) +
            (ne ? '<span class="ptq-n">' + esc(tr("{0} changed").replace("{0}", ne)) + "</span>" : "") + '</summary><div class="ptq-rows">' + parts + "</div></details>";
        }
        var ids = g.params.filter(function (id) { var m = C.params[id]; return m && !m.locked && !m.pedal && relevant(id, k); });
        if (g.id === "mics") {
          var strips = [1, 2, 3, 4, 5, 6, 7, 8].map(micRow).join(""), rest = ids.filter(function (id) { return !/^mic_\d_/.test(id); });
          if (!strips && !rest.length) return "";
          ids = rest;
          var n0 = [1, 2, 3, 4, 5, 6, 7, 8].filter(function (n) { return changed("mic_" + n + "_mic_switch") || changed("mic_" + n + "_bus_1_volume") || changed("mic_" + n + "_bus_1_pan"); }).length;
          var nm = ids.filter(changed).length + n0; total += nm;
          return '<details class="ptq-sec" data-sec="mics"' + (isOpen("mics") ? " open" : "") + '><summary>' + esc(tr(SECTIONS.mics)) +
            (nm ? '<span class="ptq-n">' + esc(tr("{0} changed").replace("{0}", nm)) + "</span>" : "") + '</summary><div class="ptq-mics">' + strips + "</div>" +
            (ids.length ? '<div class="ptq-rows">' + ids.map(row).join("") + "</div>" : "") + "</details>";
        }
        if (!ids.length) return "";
        var n = ids.filter(changed).length; total += n;
        return '<details class="ptq-sec" data-sec="' + g.id + '"' + (isOpen(g.id) ? " open" : "") + "><summary>" + esc(tr(SECTIONS[g.id] || g.id)) +
          (n ? '<span class="ptq-n">' + esc(tr("{0} changed").replace("{0}", n)) + "</span>" : "") + '</summary><div class="ptq-rows">' + ids.map(row).join("") + "</div></details>";
      }).join("");
      var locked = Object.keys(C.params).filter(function (id) { return C.params[id].locked && !/^effect_/.test(id); });
      var body = W.win.querySelector(".ptq-w-body"), top = body ? body.scrollTop : 0, audio = W.win.querySelector(".ptq-audio"), src = audio && audio.getAttribute("src");
      var said0 = W.win.querySelector(".ptq-say"), was = said0 ? [said0.textContent, said0.classList.contains("is-bad")] : ["", false];
      var phrase = W.win.querySelector(".ptq-phrase"), kind = phrase ? phrase.value : "chords";
      W.win.innerHTML = '<div class="ptq-w-head"><button type="button" class="ptq-inst" data-tip="' + esc(tr("Any of Pianoteq's presets, by class and instrument")) + '">' +
          '<span class="ptq-name" translate="no">' + esc(S.st.preset || "—") + '</span><span class="ptq-instr" translate="no">' + esc([p["class"], p.instr, S.st.bank].filter(Boolean).join(" · ")) + "</span>" +
          (p.ok === false ? '<span class="ptq-demo">' + esc(tr("a demo in your Pianoteq: some of its keys are silent")) + "</span>" : "") + "</button>" +
          '<span class="ptq-ab" role="group"><button type="button" class="btn ghost small" data-ptq-ab="A" aria-pressed="' + (!S.ab || S.ab.on === "A") + '">A</button>' +
          '<button type="button" class="btn ghost small" data-ptq-ab="B" aria-pressed="' + (!!S.ab && S.ab.on === "B") + '" data-tip="' +
          esc(tr("A second state to compare: what you set on B leaves A as it was")) + '">B</button></span>' +
          '<select class="ptq-phrase" aria-label="' + esc(tr("What is played")) + '">' +
          PHRASES.map(function (q) { return '<option value="' + q[0] + '"' + (q[0] === kind ? " selected" : "") + ">" + esc(tr(q[1])) + "</option>"; }).join("") + "</select>" +
          '<button type="button" class="btn small primary ptq-play">▶ ' + esc(tr("Listen")) + "</button>" +
          '<button type="button" class="btn ghost small ptq-all"' + (total || Object.keys(S.st.small || {}).length ? "" : " disabled") + '>↺ ' + esc(tr("All back to the preset")) + "</button>" +
          '<button type="button" class="btn ghost small ptq-keep" data-tip="' + esc(tr("Kept in your Pianoteq, bank «Ruach Studio», where Pianoteq itself finds it")) + '">' +
          esc(tr("Keep in Pianoteq…")) + "</button>" +
          '<button type="button" class="btn ghost small ptq-close" aria-label="' + esc(tr("Close")) + '">✕</button></div>' +
        '<div class="ptq-w-say"><span class="row-hint mono ptq-say"></span><audio class="ptq-audio" preload="none"' + (src ? ' controls src="' + esc(src) + '"' : " hidden") + "></audio></div>" +
        '<div class="ptq-w-body">' + (p.comment ? '<p class="row-hint ptq-comment" translate="no">' + esc(p.comment) + "</p>" : "") +
        '<div class="ptq-small">' + small + '</div><div class="ptq-cols">' + secs +
        (locked.length ? '<details class="ptq-sec is-locked" data-sec="locked"' + (isOpen("locked") ? " open" : "") + "><summary>" +
          esc(tr("Locked by this Pianoteq's edition ({0})").replace("{0}", locked.length)) + '</summary><p class="row-hint" translate="no">' +
          esc(locked.map(function (id) { return C.params[id].name + (S.base && S.base.values[id] ? " " + S.base.values[id][1] : ""); }).join(" · ")) + "</p></details>" : "") +
        "</div></div>";
      var b2 = W.win.querySelector(".ptq-w-body");
      if (b2) b2.scrollTop = top;
      if (was[0]) say(was[0], was[1]);
      if (window.HeresyChoices) window.HeresyChoices.within(W.win);
    }
    function setValue(id, x, soon) {
      S.st.values = S.st.values || {};
      S.st.values[id] = Math.max(0, Math.min(1, x));
      var r = W && W.win.querySelector('[data-ptq="' + id + '"]');
      if (r) {
        r.classList.toggle("is-changed", changed(id));
        var o = r.querySelector("output");
        if (o) o.textContent = said(meta(id), id, S.st.values[id]);
      }
      var mic = /^mic_(\d)_/.exec(id), strip = mic && W && W.win.querySelector('[data-ptq-mic="' + mic[1] + '"]');
      if (strip) {
        var outs = strip.querySelectorAll("output"), n = mic[1];
        outs[0].textContent = said(C.params["mic_" + n + "_bus_1_volume"], "mic_" + n + "_bus_1_volume", value("mic_" + n + "_bus_1_volume"));
        outs[1].textContent = textAt(C.params["mic_" + n + "_bus_1_pan"], value("mic_" + n + "_bus_1_pan"));
        strip.classList.toggle("is-off", value("mic_" + n + "_mic_switch") < 0.5);
        strip.classList.toggle("is-changed", changed("mic_" + n + "_mic_switch") || changed("mic_" + n + "_bus_1_volume") || changed("mic_" + n + "_bus_1_pan"));
      }
      var all = W && W.win.querySelector(".ptq-all"); if (all) all.disabled = false;
      var sec = (r || strip) && (r || strip).closest(".ptq-sec");
      if (sec) {
        var n2 = sec.querySelectorAll(".ptq-row.is-changed, .ptq-mic.is-changed").length, sum = sec.querySelector("summary"), tag = sum.querySelector(".ptq-n");
        if (!n2 && tag) tag.remove();
        else if (n2) { if (!tag) { tag = document.createElement("span"); tag.className = "ptq-n"; sum.appendChild(tag); } tag.textContent = tr("{0} changed").replace("{0}", n2); }
      }
      say("");
      if (soon) writeSoon(); else write();
    }
    function back(ids) {
      ids.forEach(function (id) { if (S.st.values) delete S.st.values[id]; });
      paint(); write();
    }
    function snapshot() { return JSON.parse(JSON.stringify({ preset: S.st.preset, bank: S.st.bank, values: S.st.values || {}, small: S.st.small || {} })); }
    function ab(slot) {
      if (!S.ab) S.ab = { on: "A", A: snapshot(), B: snapshot() };
      if (slot === S.ab.on) return;
      S.ab[S.ab.on] = snapshot();
      S.ab.on = slot;
      var t = S.ab[slot];
      S.st.values = JSON.parse(JSON.stringify(t.values || {})); S.st.small = JSON.parse(JSON.stringify(t.small || {}));
      if (t.preset !== S.st.preset || (t.bank || "") !== (S.st.bank || "")) {
        var keepV = S.st.values, keepS = S.st.small;
        load(t.preset, t.bank, true).then(function () { S.st.values = keepV; S.st.small = keepS; return rebase(); }).then(function () { say(tr("Now on {0}").replace("{0}", slot)); });
        return;
      }
      rebase().then(function () { say(tr("Now on {0}").replace("{0}", slot)); });
    }
    function full() { return { preset: S.st.preset, bank: S.st.bank || "", values: S.st.values || {}, small: S.st.small || {} }; }
    function listen() {
      if (S.busy) return;
      S.busy = true;
      var kind = W.win.querySelector(".ptq-phrase").value, btn = W.win.querySelector(".ptq-play");
      btn.disabled = true;
      say(tr("Pianoteq plays it…"));
      fetch("/lab/pianoteq/preview" + scope(), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ state: full(), kind: kind, product: P }) })
        .then(json).then(function (r) {
          var a = W && W.win.querySelector(".ptq-audio");
          if (!a) return;
          a.src = r.url;
          a.hidden = false; a.controls = true;
          say(tr("Played with this state"));
          if (!navigator.webdriver) { var pr = a.play(); if (pr && pr.catch) pr.catch(function () {}); }
        }).catch(function (e) { say(e.message, true); })
        .then(function () { S.busy = false; var b = W && W.win.querySelector(".ptq-play"); if (b) b.disabled = false; });
    }
    function keepIt() {
      var D = window.HeresyDialog;
      var ask = D ? D.prompt(tr("A name for this preset in your Pianoteq (bank «Ruach Studio»)"), (S.st.preset || "Ruach") + " · Ruach", { name: { max: 60, file: true } })   /* HERESY 2462: a file in Pianoteq */ : Promise.resolve(window.prompt("Name", S.st.preset));
      ask.then(function (name) {
        if (!name) return;
        return fetch("/lab/pianoteq/keep" + scope(), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ state: full(), name: name, product: P }) })
          .then(json).then(function (r) {
            say(tr("Kept in Pianoteq: «{0}», bank «{1}»").replace("{0}", r.name).replace("{1}", r.bank));
            delete CAT_P[P];                              // HERESY 1981: the browser finds it at once (2036: this product's catalog only)
            catalog(P).then(function (c) { C = c; }).catch(function () {});
          });
      }).catch(function (e) { say(e.message, true); });
    }
    function browse() {                               // every preset by class and instrument, its words beside; a search across all
      var back0 = document.activeElement, cur = S.st.preset, sel0 = (C.presets.filter(function (x) { return x.name === cur; })[0] || {}).instr || "";
      var el = document.createElement("div"), mineN = C.presets.filter(function (x) { return x.ok !== false; }).length;
      var mine = mineN > 0 && mineN < C.presets.length && S.mine !== false;   // what plays in full here first; the demos one tick away
      el.className = "ptq-browse"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true");
      function pool() { return C.presets.filter(function (x) { return !mine || x.ok !== false; }); }
      el.innerHTML = '<div class="ptq-b-head"><input type="search" class="ptq-b-find" placeholder="' + esc(tr("Find a preset, an instrument, a word")) + '" autocomplete="off" spellcheck="false">' +
        (mineN > 0 && mineN < C.presets.length ? '<label class="check ptq-b-mine" data-tip="' + esc(tr("The instruments your licence plays in full; the others are Pianoteq's demos, some of their keys silent")) +
          '"><input type="checkbox"' + (mine ? " checked" : "") + "> " + esc(tr("Only what plays in full ({0} of {1})").replace("{0}", mineN).replace("{1}", C.presets.length)) + "</label>" :
          '<span class="row-hint mono">' + esc(tr("{0} presets").replace("{0}", C.presets.length)) + "</span>") +
        '<button type="button" class="btn ghost small ptq-b-close" aria-label="' + esc(tr("Close")) + '">✕</button></div>' +
        '<div class="ptq-b-body"><div class="ptq-b-inst" translate="no"></div><div class="ptq-b-list" translate="no"></div></div>';
      W.back.appendChild(el);
      var list = el.querySelector(".ptq-b-list"), find = el.querySelector(".ptq-b-find"), side = el.querySelector(".ptq-b-inst"), at = sel0;
      function sidePaint() {
        var byClass = {};
        pool().forEach(function (x) { var c = x["class"] || "—"; (byClass[c] = byClass[c] || {}); (byClass[c][x.instr] = byClass[c][x.instr] || []).push(x); });
        side.innerHTML = Object.keys(byClass).sort().map(function (c) {
          return '<div class="ptq-b-class">' + esc(c) + "</div>" + Object.keys(byClass[c]).sort().map(function (i) {
            var demo = byClass[c][i].every(function (x) { return x.ok === false; });
            return '<button type="button" class="ptq-b-i' + (i === at ? " is-cur" : "") + (demo ? " is-demo" : "") + '" data-i="' + esc(i) + '">' + esc(i) +
              '<span class="mono">' + (demo ? esc(tr("demo")) + " · " : "") + byClass[c][i].length + "</span></button>";
          }).join("");
        }).join("");
        if (!pool().some(function (x) { return x.instr === at; })) at = (pool()[0] || {}).instr;
      }
      function show(rows) {
        list.innerHTML = rows.slice(0, 400).map(function (x) {
          return '<button type="button" class="ptq-b-p' + (x.name === cur ? " is-cur" : "") + (x.ok === false ? " is-demo" : "") + '" data-k="' + C.presets.indexOf(x) + '"><b>' + esc(x.name) +
            (x.ok === false ? ' <span class="ptq-demo">' + esc(tr("demo")) + "</span>" : "") + "</b>" +
            '<span class="ptq-b-what">' + esc(x.instr + (x.bank ? " · " + x.bank : "")) + "</span>" + (x.comment ? "<small>" + esc(x.comment) + "</small>" : "") + "</button>";
        }).join("") || '<p class="row-hint">' + esc(tr("No preset of these words")) + "</p>";
      }
      function inst(i) {
        at = i;
        Array.prototype.forEach.call(el.querySelectorAll(".ptq-b-i"), function (b) { b.classList.toggle("is-cur", b.dataset.i === i); });
        show(pool().filter(function (x) { return x.instr === i; }));
      }
      function refind() {
        var q = find.value.trim().toLowerCase();
        if (!q) { inst(at); return; }
        show(pool().filter(function (x) { return (x.name + " " + x.instr + " " + x["class"] + " " + (x.comment || "")).toLowerCase().indexOf(q) >= 0; }));
      }
      var mineBox = el.querySelector(".ptq-b-mine input");
      if (mineBox) mineBox.addEventListener("change", function () { mine = mineBox.checked; S.mine = mine; sidePaint(); refind(); });
      sidePaint();
      function close() {
        el.remove(); window.removeEventListener("keydown", key, true);
        var f = back0 && document.contains(back0) ? back0 : W && W.win.querySelector(".ptq-inst");
        if (f && f.focus) f.focus();
      }
      function pick(k) {
        var x = C.presets[+k]; close();
        if (x) { S.ab = null; load(x.name, x.bank || "", true).then(function () { var f = W && W.win.querySelector(".ptq-inst"); if (f) f.focus(); }); }
      }
      function key(e) {
        if (e.key === "Escape") { e.stopImmediatePropagation(); e.preventDefault(); close(); }
        else if (e.key === "Enter" && document.activeElement === find) { var f = list.querySelector(".ptq-b-p"); if (f) { e.preventDefault(); pick(f.dataset.k); } }
      }
      window.addEventListener("keydown", key, true);
      el.addEventListener("click", function (e) {
        var b = e.target.closest(".ptq-b-p"), i = e.target.closest(".ptq-b-i");
        if (b) pick(b.dataset.k); else if (i) inst(i.dataset.i); else if (e.target.closest(".ptq-b-close")) close();
      });
      find.addEventListener("input", refind);
      inst(at);
      find.focus();
    }
    function onKey(e) {                               // Esc closes the window, unless it is meant for what is open over it
      if (e.key !== "Escape" || !W || W.back.querySelector(".ptq-browse")) return;
      var a = document.activeElement;
      if (a && a !== document.body && !W.back.contains(a)) return;
      e.stopImmediatePropagation(); e.preventDefault();
      close();
    }
    function close() {
      if (!W) return;
      if (S.soon) write();
      window.removeEventListener("keydown", onKey, true);
      var w = W; W = null;
      w.back.remove();
      if (w.from && w.from.focus && document.contains(w.from)) w.from.focus();
    }
    function open() {
      if (W) return;
      var veil = document.createElement("div"), win = document.createElement("div");   // not «back»: that is the ↺ above
      veil.className = "ptq-back-veil";
      win.className = "ptq-win"; win.setAttribute("role", "dialog"); win.setAttribute("aria-modal", "true"); win.setAttribute("aria-label", NAME);
      var bar = '<div class="ptq-w-head"><span class="ptq-name" translate="no">' + NAME + '</span><button type="button" class="btn ghost small ptq-close" aria-label="' + esc(tr("Close")) + '">✕</button></div>';
      win.innerHTML = bar + '<p class="row-hint ptq-wait">' + esc(tr("Asking Pianoteq…")) + "</p>";
      veil.appendChild(win);
      document.body.appendChild(veil);
      W = { back: veil, win: win, from: document.activeElement };
      veil.addEventListener("mousedown", function (e) { if (e.target === veil) close(); });
      window.addEventListener("keydown", onKey, true);
      win.addEventListener("input", function (e) {
        var id = e.target.dataset && e.target.dataset.ptqIn;
        if (!id || e.target.type === "checkbox" || e.target.tagName === "SELECT") return;
        setValue(id, +e.target.value, true);
      });
      win.addEventListener("change", function (e) {
        var t = e.target, id = t.dataset && t.dataset.ptqIn;
        if (t.dataset && t.dataset.ptqSmall) {
          S.st.small = S.st.small || {};
          if (t.value) S.st.small[t.dataset.ptqSmall] = t.value; else delete S.st.small[t.dataset.ptqSmall];
          t.closest(".field").classList.toggle("is-changed", !!t.value);
          var a = W.win.querySelector(".ptq-all"); if (a) a.disabled = false;
          write();
          rebase();
          return;
        }
        if (!id) return;
        if (t.type === "checkbox") setValue(id, t.checked ? 1 : 0);
        else if (t.tagName === "SELECT") setValue(id, +t.value);
        else setValue(id, +t.value);
      });
      win.addEventListener("click", function (e) {
        var b = e.target.closest("[data-ptq-back]"), ab0 = e.target.closest("[data-ptq-ab]");
        if (b) { e.preventDefault(); back(b.dataset.ptqBack.split(",")); return; }
        if (ab0) { ab(ab0.dataset.ptqAb); return; }
        if (e.target.closest(".ptq-inst")) { if (C) browse(); return; }
        if (e.target.closest(".ptq-play")) { listen(); return; }
        if (e.target.closest(".ptq-keep")) { keepIt(); return; }
        if (e.target.closest(".ptq-close")) { close(); return; }
        if (e.target.closest(".ptq-all")) { S.st.values = {}; S.st.small = {}; S.base = S.pre || S.base; paint(); write(); say(tr("All back to the preset")); }
      });
      win.addEventListener("toggle", function (e) {      // a hand's toggle only: a section drawn open says so too, and that is no choice
        var d = e.target;
        if (d.classList && d.classList.contains("ptq-sec") && d.open !== isOpen(d.dataset.sec)) keepOpen(d.dataset.sec, d.open);
      }, true);
      catalog(P).then(function (c) {
        if (!W) return;
        if (!c.available) {
          win.innerHTML = bar + '<p class="row-hint ptq-wait">' + esc(tr(c.why || "No Pianoteq here")) + "</p>";
          return;
        }
        C = c;
        return load(S.st.preset, S.st.bank || "");
      }).catch(function (e) { if (W) win.innerHTML = bar + '<p class="row-hint ptq-wait is-bad">' + esc(tr("Pianoteq did not answer: {0}").replace("{0}", e.message)) + "</p>"; });
      win.tabIndex = -1;
      win.focus();
    }
    chip.addEventListener("click", open);
    if (sel) sel.addEventListener("change", function () {   // a preset picked from the step's own list: Pianoteq's state starts over from it
      if (S.writing || sel.value === S.st.preset) return;
      S.st = { preset: sel.value, bank: "", values: {}, small: {} };
      S.ab = null;
      if (W && C) load(sel.value, "", true); else { S.base = null; write(); }
    });
    input.addEventListener("change", function () {    // a profile or the way put a state in: drawn from it
      if (S.writing) return;
      S.st = fromInput();
      S.ab = null;
      if (sel && S.st.preset) { own(S.st.preset); S.writing = true; if (sel.value !== S.st.preset) { sel.value = S.st.preset; fire(sel); } if (sel._hcPaint) sel._hcPaint(); S.writing = false; }
      chipPaint();
      if (W && C) load(S.st.preset, S.st.bank || "");
    });
    chipPaint();
    chip._ptq = { open: open, close: close, state: function () { return full(); } };
  }
  window.HeresyPianoteq = { mount: mount, textAt: textAt, choices: choices };
})();
