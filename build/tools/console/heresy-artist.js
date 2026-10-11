// HERESY 1169 · 1255 (Viktor 08.10.2026: «RC3 завтра или послезавтра с Artist Early Preview»; «Код Художника оправданнее
// строит на рабочем Krea2, который у тебя уже bulletproof»): the Artist room, an early preview. A prompt of one's own; the
// shapes a song's pictures take (1:1 for the cover, 16:9 for a video, 9:16 for a short), all from one seed; one to four
// variations; the painter. The lab draws a run (lab/artist.py) in its queue with its other GPU jobs; the runs stand below,
// the newest first: each picture opened over the page, downloaded, or made the cover of the take in hand (a square one;
// the cover it replaces is kept beside the take, as a redraw keeps it).
(function () {
  "use strict";

  var SHAPES = [
    { id: "1:1", label: "1:1 · 1280²", say: "the cover", w: 1, h: 1, s: 36 },
    { id: "16:9", label: "16:9 · 1920×1080", say: "a video", w: 16, h: 9, s: 47 },
    { id: "9:16", label: "9:16 · 1080×1920", say: "a short", w: 9, h: 16, s: 47 }
  ];
  var PAINTERS = { "krea2-q4": "Krea 2 Muse · Q4", "krea2-q8": "Krea 2 Muse · Q8" };
  var PAINTER_INFO = {};                                 // HERESY 1318: the lab's word on each painter (need, family, note, models)
  // HERESY 1334: the Artist's own log (the dock's Artist view), what it is asked and what comes of it
  function alog(text, kind) { if (window.RuachArtistLog) window.RuachArtistLog.add(text, kind); }
  function painterLabel(r) {                            // HERESY 1322: an upscaler's run says so, with its factor
    return r.kind === "upscale" ? tr("Upscale") + " " + (r.target ? String(r.target).toUpperCase() : "\u00d7" + r.factor) : PAINTERS[r.painter] || r.painter || "";
  }
  var KEY = { prompt: "yue2.arPrompt", shapes: "yue2.arShapes", count: "yue2.arCount", seed: "yue2.arSeed", painter: "yue2.arPainter",
    live: "yue2.arLive", look: "yue2.arLook", filter: "yue2.arFilter", size: "yue2.arSize" };
  // HERESY 1257 (Viktor 08.10.2026: «Ты предусмотрел галерею сгенерированного арта? Изучи интерфейс и функционал InvokeAI»):
  // the pictures as runs or as one gallery (InvokeAI's grid: every picture, the newest first, filtered, starred, three sizes)
  var FILTERS = [["all", "All"], ["1:1", "1:1"], ["16:9", "16:9"], ["9:16", "9:16"], ["star", "Starred"]];
  // HERESY 1321 (Viktor 10.10.2026: «aspect ratios… SVG КВАДРАТ, горизонтальное и вертикальное расположение прямоугольника»; «звезда наша SVG»)
  function shapeIcon(id) {
    var r = { "1:1": [4, 4, 12, 12], "16:9": [1.5, 5.5, 17, 9], "9:16": [5.5, 1.5, 9, 17] }[id] || [4, 4, 12, 12];
    return '<svg class="ar-shape-ico" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><rect x="' + r[0] + '" y="' + r[1] + '" width="' + r[2] + '" height="' + r[3] + '" rx="1.6"/></svg>';
  }
  function starIcon(on) {
    return '<svg class="ar-star-ico' + (on ? " is-on" : "") + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 2.9l2.75 5.95 6.5.75-4.85 4.45 1.3 6.45L12 17.3l-5.7 3.2 1.3-6.45L2.75 9.6l6.5-.75z"/></svg>';
  }
  var SIZES = [["s", "S", 130], ["m", "M", 200], ["l", "L", 300]];
  var state = { hooks: null, runs: [], take: null, timer: 0, sending: false, open: {}, view: null, first: true,
    look: "runs", filter: "all", size: "m" };

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function recall(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function keep(k, v) { try { if (v == null || v === "") localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* private window */ } }
  function tr(s) { return window.RuachI18n ? window.RuachI18n.t(s) : s; }
  function toast(t, kind) { if (state.hooks) state.hooks.toast(t, kind || ""); }
  function api(path, body) {
    var opt = body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
    return fetch("/lab" + path, opt).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (b) { if (!r.ok && r.status !== 202) throw new Error(b.error || ("HTTP " + r.status)); return b; });
    });
  }
  function fileUrl(id, file) { return "/lab/artist/file?id=" + encodeURIComponent(id) + "&file=" + encodeURIComponent(file); }
  function shapeOf(id) { return SHAPES.filter(function (s) { return s.id === id; })[0] || SHAPES[0]; }
  function live(r) { return r && (r.status === "queued" || r.status === "running"); }
  // HERESY 1270 (Viktor 09.10.2026: «Кнопку DRAW нужно заменять на STOP»): the run Stop stops: the drawing one, else the newest waiting
  function drawingRun() { return state.runs.filter(function (r) { return r.status === "running"; })[0] || state.runs.filter(live)[0] || null; }
  var RUNS_MAX = 2;                                      // HERESY 1340 (Viktor: «разреши батчинг/очередь до двух батчей»): runs at a time
  function runsFull() { return state.runs.filter(live).length >= RUNS_MAX; }
  function when(t) {
    if (!t) return "";
    var d = new Date(t * 1000), locs = window.RuachI18n ? window.RuachI18n.locales() : undefined;
    return d.toLocaleDateString(locs, { day: "2-digit", month: "2-digit" }) + " " + d.toTimeString().slice(0, 5);
  }
  function minutes(sec) { var m = Math.max(1, Math.round(sec / 30) / 2); return m === 1 ? "about a minute" : "about " + String(m).replace(".5", "½") + " min"; }

  // ------------------------------------------------------------------ the form
  function shapesPicked() {
    return Array.prototype.filter.call(document.querySelectorAll("#arShapes input"), function (i) { return i.checked; })
      .map(function (i) { return i.value; });
  }
  function seedAsked() { var v = $("arSeed").value.trim(); return /^\d{1,10}$/.test(v) ? +v : null; }
  function paintForm() {
    var shapes = shapesPicked(), count = +$("arCount").value || 1, n = shapes.length * count;
    var secs = 25 + count * shapes.reduce(function (a, id) { return a + shapeOf(id).s; }, 0);
    var pk = $("arPainter").value, ps = sampNow(pk);   // HERESY 1319: the time follows the steps
    if (/^krea2/.test(pk)) secs = 25 + (secs - 25) * (+ps.steps || 8) / 8 * sampLooks(ps);   // HERESY 1333: and its looks a step
    if (/^qwen/.test(pk)) secs = 90 + n * (pk === "qwen21" ? 3 * (+ps.steps || 30) : 3.5 * (+ps.steps || 8) * (sampFast(pk, ps) ? 1 : 2) * sampLooks(ps));   // HERESY 1318: its parts; 1328: the switch; 1333: its looks first, then each picture
    $("arCost").textContent = n ? tr((n === 1 ? "1 picture" : n + " pictures") + " · " + minutes(secs) + " on one card") : tr("pick a shape");   // HERESY 1339: one sentence
    // HERESY 1340 (Viktor: «разреши батчинг/очередь до двух батчей»): Draw draws while a run goes, the second run waiting behind it,
    // two at a time; Stop is a button of its own (1270's: the drawing run, else the waiting one)
    var busy = drawingRun(), full = runsFull();
    $("arDraw").textContent = tr("Draw");
    $("arDraw").dataset.tip = full ? tr("Two runs at a time: the next one can be asked when one of them ends")
      : busy ? tr("Draw these too: the run waits behind the one going now (two runs at a time; Ctrl+Enter)")
      : tr("Draw the pictures picked: every shape, every variation (Ctrl+Enter)");   // HERESY 1332: a tip of its own, not an empty one
    $("arDraw").disabled = full || !n || !$("arPrompt").value.trim() || state.sending;
    $("arStop").hidden = !busy;
    $("arStop").disabled = !!state.stopping;
    $("arStop").dataset.tip = tr("Stop the run: a waiting one leaves the queue, a drawing one ends now; the pictures it finished stay");
    Array.prototype.forEach.call(document.querySelectorAll("#arShapes label"), function (l) { l.classList.toggle("is-on", l.querySelector("input").checked); });
  }
  // HERESY 1319: the sampling per painter (kept in this browser), its limits by the painter; only what differs from the painter's own is sent
  KEY.sampling = "yue2.arSampling";
  // HERESY 1328: Lightning is a switch (lightOn) and a strength (lightning, kept while it is off); a fine-tune paints without it by
  // default (30 steps, guidance 4), a GGUF one with it; a painter whose Lightning file is not here has no switch at all
  function lightHere(key) { var p = PAINTER_INFO[key] || {}; return /^qwen2512/.test(key) && p.lightning !== false; }
  function sampDefaults(key) {
    var fine = key === "qwen2512-fp8";
    if (/^qwen2512/.test(key)) {
      var on = !fine && lightHere(key);
      return { steps: on ? 8 : 30, sampler: "euler", schedule: "simple", lightOn: on, lightning: fine ? 0.55 : 1, cfg: 4 };
    }
    if (key === "qwen21") return { steps: 30, sampler: "euler", schedule: "simple" };
    return { steps: 8, sampler: "euler", schedule: "simple" };
  }
  function sampAll() { try { var a = JSON.parse(recall(KEY.sampling) || "{}"); return a && typeof a === "object" ? a : {}; } catch (e) { return {}; } }
  function sampLim(key, s) { return sampFast(key, s) ? [4, 16] : [10, 60]; }
  function sampNow(key) {
    key = key || $("arPainter").value;
    var mine = sampAll()[key] || {}, s = Object.assign(sampDefaults(key), mine);
    if (/^qwen2512/.test(key)) {
      if (mine.lightOn == null && mine.lightning != null) s.lightOn = +mine.lightning > 0;   // kept before 1328: the strength was the switch
      if (!(+s.lightning > 0)) s.lightning = sampDefaults(key).lightning;
      if (!lightHere(key)) s.lightOn = false;
    }
    var lim = sampLim(key, s);
    s.steps = Math.max(lim[0], Math.min(lim[1], Math.round(+s.steps) || lim[0]));   // within the range it is sent in
    return s;
  }
  // HERESY 1333: how many looks at the model a step takes (the time grows by it)
  var LOOKS = { res_2s: 2, res_2s_ode: 2, exp_heun_2_x0: 2, exp_heun_2_x0_sde: 2, res_3s: 3, res_3s_ode: 3, heunpp2: 3 };
  function sampLooks(s) { return LOOKS[(s || {}).sampler] || 1; }
  function sampFast(key, s) { return /^krea2/.test(key) || (/^qwen2512/.test(key) && !!s.lightOn && +s.lightning > 0); }
  function sampSay(key, s) {
    var q = /^qwen2512/.test(key), names = { euler: "Euler", "euler-sde": "Euler SDE", simple: "Simple", karras: "Karras", exponential: "Exponential", beta: "Beta",
      er_sde: "ER-SDE", res_2s: "RES 2s", res_2s_ode: "RES 2s ODE", res_3s: "RES 3s", res_3s_ode: "RES 3s ODE", heunpp2: "Heun++ 2", exp_heun_2_x0: "Exp Heun 2 x0",
      exp_heun_2_x0_sde: "Exp Heun 2 x0 SDE", beta57: "Beta 57", kl_optimal: "KL optimal", sgm_uniform: "SGM uniform", bong_tangent: "Bong tangent" };   // HERESY 1333
    return tr(s.steps + " steps · " + names[s.sampler || "euler"] + " · " + names[s.schedule || "simple"] +   // HERESY 1339: one sentence («8 шагов»)
      (q ? (sampFast(key, s) ? " · Lightning " + (+s.lightning).toFixed(2) : " · guidance " + (s.cfg || 4)) : ""));
  }
  function paintSampling() {
    var key = $("arPainter").value, s = sampNow(key), lim = sampLim(key, s), q = /^qwen2512/.test(key), fast = sampFast(key, s);
    $("arSteps").min = String(lim[0]); $("arSteps").max = String(lim[1]); $("arSteps").value = String(s.steps);
    $("arSampler").value = s.sampler || "euler"; $("arSchedule").value = s.schedule || "simple";
    $("arLightBox").hidden = !(q && lightHere(key)); $("arCfgBox").hidden = !(q && !fast);
    if (q) { $("arLightOn").checked = !!s.lightOn; $("arLight").value = (+s.lightning).toFixed(2); $("arLight").disabled = !s.lightOn; $("arCfg").value = String(s.cfg || 4); }
    $("arSampSay").textContent = sampSay(key, s);
    // HERESY 1333: what the sampling matrix showed (10.10.2026, 30 pictures): Lightning under Karras or Exponential paints the subject twice;
    // without Lightning Euler SDE paints Qwen soft and hazy; 1333c: the second matrix (24 pictures): KL optimal paints it twice too
    var warn = $("arSampWarn"), fast = sampFast(key, s), say = "";
    if (q && fast && /^(karras|exponential|kl_optimal)$/.test(s.schedule)) say = tr("With Lightning, Karras, Exponential and KL optimal can paint the subject twice: Simple, Beta, Beta 57, SGM uniform or Bong tangent keep it whole.");
    else if (/^qwen/.test(key) && !fast && s.sampler === "euler-sde") say = tr("Without Lightning, Euler SDE paints Qwen soft and hazy: Euler, ER-SDE or RES keep the detail.");
    if (warn) { warn.hidden = !say; warn.textContent = say; warn.dataset.tip = say; }   // HERESY 1345: a ⚠ beside Sampling, its words in its tip
  }
  function keepSampling(e) {
    var key = $("arPainter").value, all = sampAll(), q = /^qwen2512/.test(key), was = sampNow(key);
    var s = { steps: +$("arSteps").value, sampler: $("arSampler").value, schedule: $("arSchedule").value };
    if (q) {
      s.lightOn = lightHere(key) && $("arLightOn").checked;
      s.lightning = Math.max(0.05, Math.min(1.5, +(+$("arLight").value).toFixed(2) || was.lightning));
      s.cfg = Math.max(1, Math.min(10, +$("arCfg").value || 4));
    }
    if (q && sampFast(key, s) !== sampFast(key, was)) s.steps = sampFast(key, s) ? (key === "qwen2512-fp8" ? 12 : 8) : 30;   // Lightning on or off: steps in its range
    var lim = sampLim(key, s);
    s.steps = Math.max(lim[0], Math.min(lim[1], Math.round(s.steps) || lim[0]));
    all[key] = s;
    keep(KEY.sampling, JSON.stringify(all));
    paintSampling();
    paintForm();
  }
  function samplingBody() {
    var key = $("arPainter").value, s = sampNow(key), d = sampDefaults(key), out = {};
    ["steps", "sampler", "schedule", "cfg"].forEach(function (k) { if (s[k] != null && String(s[k]) !== String(d[k])) out[k] = s[k]; });
    if (/^qwen2512/.test(key)) {
      if (sampFast(key, s)) delete out.cfg;
      if (Object.keys(out).length || !!s.lightOn !== !!d.lightOn || (s.lightOn && +s.lightning !== +d.lightning)) out.lightning = sampFast(key, s) ? +s.lightning : 0;   // the steps' range is Lightning's
    } else delete out.cfg;
    return out;
  }
  // HERESY 1318: the painters as the lab has them; the fp8 fine-tune; the painter's note
  function loadPainters() {
    return api("/artist/painters").then(function (d) {
      var sel = $("arPainter"), was = recall(KEY.painter) || sel.value || "krea2-q4", list = (d.painters || []).filter(function (p) { return p.ready; });
      // HERESY 1323: the painters not here yet (an fp8 fine-tune is the user's own file, not a fetch), said under the choice
      state.notHere = (d.painters || []).filter(function (p) { return !p.ready && p.key !== "qwen2512-fp8"; }).map(function (p) { return p.label; });
      if (!list.length) return;
      PAINTER_INFO = {};
      list.forEach(function (p) { PAINTERS[p.key] = p.label; PAINTER_INFO[p.key] = p; });
      sel.innerHTML = list.map(function (p) {
        return '<option value="' + esc(p.key) + '">' + esc(p.label + " (" + tr("from " + (p.need_mb / 1000).toFixed(1).replace(".0", "") + " GB") + ")") + "</option>";
      }).join("");
      sel.value = PAINTER_INFO[was] ? was : list[0].key;
      paintPainter();
    }).catch(function () { paintPainter(); });
  }
  function paintPainter() {
    var p = PAINTER_INFO[$("arPainter").value] || {}, box = $("arModelBox"), note = $("arPainterNote");
    if (box) {
      var models = p.models || [];
      box.hidden = !models.length;
      if (models.length) {
        var want = recall("yue2.arModel"), cur = $("arModel").value || want;
        $("arModel").innerHTML = models.map(function (m) { return '<option value="' + esc(m) + '">' + esc(m.replace(/\.safetensors$/, "")) + "</option>"; }).join("");
        $("arModel").value = models.indexOf(cur) >= 0 ? cur : models[0];
      }
    }
    if (note) {
      var more = (state.notHere || []).length ? tr("More painters come from Engine → Models and LoRAs: " + state.notHere.join(", ")) : "";   // HERESY 1323; 1339: one sentence
      note.hidden = !p.note && !more;
      note.textContent = p.note ? tr(p.note) : more;
      note.dataset.tip = note.textContent;              // HERESY 1345: an i, its words in its tip
      note.classList.toggle("is-warn", p.key === "qwen21");
    }
    paintLoras();
    paintSampling();                                     // HERESY 1319
    paintForm();
  }
  function keepForm() {
    keep(KEY.prompt, $("arPrompt").value);
    keep(KEY.shapes, shapesPicked().join(","));
    keep(KEY.count, $("arCount").value === "1" ? null : $("arCount").value);
    keep(KEY.seed, $("arSeed").value.trim());
    keep(KEY.painter, $("arPainter").value === "krea2-q4" ? null : $("arPainter").value);
    if (!$("arModelBox").hidden) keep("yue2.arModel", $("arModel").value);   // HERESY 1318
  }
  function fillForm(run, withSeed) {
    if (run.kind === "upscale") run = { prompt: run.prompt, shapes: run.shapes, count: 1, seed: run.seed };   // HERESY 1322: its words, shape and seed only
    $("arPrompt").value = run.prompt || "";
    Array.prototype.forEach.call(document.querySelectorAll("#arShapes input"), function (i) { i.checked = (run.shapes || []).indexOf(i.value) >= 0; });
    $("arCount").value = String(run.count || 1);
    $("arSeed").value = withSeed && run.seed != null ? String(run.seed) : "";
    if (PAINTERS[run.painter]) $("arPainter").value = run.painter;
    if (run.model && !$("arModelBox").hidden) $("arModel").value = run.model;   // HERESY 1318
    if (PAINTERS[run.painter]) { var sa = sampAll(); if (run.sampling) { sa[run.painter] = Object.assign(sampDefaults(run.painter), run.sampling); if (run.sampling.lightning != null) { sa[run.painter].lightOn = +run.sampling.lightning > 0; if (!(+run.sampling.lightning > 0)) delete sa[run.painter].lightning; } } else delete sa[run.painter]; keep(KEY.sampling, JSON.stringify(sa)); paintSampling(); }   // HERESY 1319
    if (run.loras) setLoras(run.loras.map(function (l) { return { id: l.id, weight: l.weight }; }), FAMILY[run.painter]);   // HERESY 1316
    else paintLoras();
    keepForm();
    paintForm();
  }
  // HERESY 1305 (Viktor 10.10.2026: «Артиста по модели InvokeAI постарайся на максимум вывести»): a reference picture, as InvokeAI's
  // image to image: dropped, pasted, chosen from a file, or the stage's «As reference»; state.ref {data, name} or {id, file, url}
  var REF_MAX = 40 * 1048576;
  function setRef(ref, quiet) {
    state.ref = ref || null;
    setMask(null);                                     // HERESY 1306: a mask belongs to its picture
    state.place = null;                                // HERESY 1346: and the canvas's places
    paintCanvasSay();
    $("arRefEmpty").hidden = !!ref;
    $("arRefOn").hidden = !ref;
    $("arRefImg").src = ref ? (ref.data || ref.url) : "";
    $("arRefImg").title = ref ? (ref.name || ref.file || "") : "";
    if (ref && !quiet) toast(tr("The reference: " + (ref.name || ref.file) + ". Draw paints from it; ✕ paints from the noise again"));
  }
  function refFromFile(f) {
    if (!f || !/^image\/(png|jpeg|webp)$/.test(f.type)) return toast(tr("A reference is a PNG, JPEG or WebP picture"), "bad");
    if (f.size > REF_MAX) return toast(tr("The reference picture is larger than 40 MB"), "bad");
    var rd = new FileReader();
    rd.onload = function () { setRef({ data: String(rd.result), name: f.name || "a pasted picture" }); };
    rd.onerror = function () { toast(tr("The picture could not be read"), "bad"); };
    rd.readAsDataURL(f);
  }
  function paintRefSay() {
    var fit = $("arRefFit") && $("arRefFit").checked;   // HERESY 1307: painting around: the edges from the noise, the middle kept
    $("arRefSay").textContent = fit ? tr("the edges painted anew") : (+$("arRefStr").value).toFixed(2);
    $("arRef").classList.toggle("is-fit", !!fit);
    if ($("arMaskOpts")) $("arMaskOpts").hidden = !(state.ref && (state.mask || fit));   // HERESY 1320: the mask's options when there is one
  }
  // HERESY 1320 (Viktor 10.10.2026: «По маске не хватает добавления латентного зерна поверх непрорисовываемых частей, блюра по краям
  // маски»): the mask's options, kept in this browser
  function maskOpts() {
    return { grow: Math.max(-64, Math.min(128, Math.round(+$("arMkGrow").value || 0))), edge: Math.max(0, Math.min(96, Math.round(+$("arMkEdge").value || 0))),
             soft: $("arMkSoft").checked, grain: Math.max(0, Math.min(0.6, +(+$("arMkGrain").value || 0).toFixed(2))) };
  }
  function keepMaskOpts() { keep("yue2.arMaskOpts", JSON.stringify(maskOpts())); }
  function loadMaskOpts() {
    var o = null;
    try { o = JSON.parse(recall("yue2.arMaskOpts") || "null"); } catch (e) { o = null; }
    if (!o) return;
    $("arMkGrow").value = String(o.grow || 0); $("arMkEdge").value = String(o.edge != null ? o.edge : 24);
    $("arMkSoft").checked = o.soft !== false; $("arMkGrain").value = String(o.grain != null ? o.grain : 0.1);
  }
  // HERESY 1306 (Viktor: «Артиста по модели InvokeAI постарайся на максимум вывести»): a mask on the reference, as InvokeAI's
  // inpaint: white repaints, the rest stays; state.mask {data} at the reference's own size; its red over the thumbnail
  function setMask(m) {
    state.mask = m || null;
    if ($("arMaskOpts")) $("arMaskOpts").hidden = !(state.ref && (state.mask || ($("arRefFit") && $("arRefFit").checked)));   // HERESY 1320
    var c = $("arRefMask"), b = $("arMaskOpen");
    if (b) { b.classList.toggle("is-on", !!m); b.textContent = tr(m ? "Mask ✓" : "Mask…"); }
    if (!c) return;
    c.hidden = !m;
    if (!m) return;
    var img = new Image();
    img.onload = function () {
      c.width = 144; c.height = 144;
      var x = c.getContext("2d"), s = Math.max(144 / img.width, 144 / img.height), w = img.width * s, h = img.height * s;
      x.clearRect(0, 0, 144, 144);
      x.drawImage(img, (144 - w) / 2, (144 - h) / 2, w, h);
      x.globalCompositeOperation = "source-in";           // the white of the mask, red
      x.fillStyle = "rgba(220, 40, 40, .55)";
      x.fillRect(0, 0, 144, 144);
      x.globalCompositeOperation = "source-over";
    };
    img.src = m.view || m.data;
  }
  // HERESY 1308 (Viktor: «Артиста по модели InvokeAI постарайся на максимум вывести»): two pictures compared, as InvokeAI's
  // compare: the stage's picture, then the other one picked in the library; one over the other under a divider, or side by side
  function comparePick(it) {
    state.cmpA = it;
    document.body.classList.add("ar-cmp-picking");
    toast(tr("Compare: pick the other picture in the library (Esc gives up)"));
  }
  function compareOff() { state.cmpA = null; document.body.classList.remove("ar-cmp-picking"); }
  function capOfIt(it) { return tr(it.p.shape + " · seed " + it.p.seed + " · " + when(it.r.created)); }
  function compare(a, b) {
    compareOff();
    var back = document.createElement("div"), x = 0.5, side = false;
    back.className = "ar-cmp";
    back.setAttribute("role", "dialog");
    back.setAttribute("aria-label", tr("Two pictures compared"));
    back.innerHTML = '<div class="ar-cmp-tools"><button type="button" class="btn ghost small" data-c="side" data-tip="' + esc(tr("Side by side, or one over the other (S)")) + '">' + esc(tr("Side by side")) + "</button>" +
      '<button type="button" class="btn ghost small" data-c="swap" data-tip="' + esc(tr("A and B change places (X)")) + '">' + esc(tr("Swap")) + "</button>" +
      '<button type="button" class="pb-btn" data-c="close" aria-label="' + esc(tr("Close")) + '" data-tip="' + esc(tr("Close (Esc)")) + '">✕</button></div>' +
      '<div class="ar-cmp-box"><img class="ar-cmp-a" alt="" draggable="false" /><img class="ar-cmp-b" alt="" draggable="false" /><span class="ar-cmp-line"></span>' +
      '<span class="ar-cmp-lab is-a"></span><span class="ar-cmp-lab is-b"></span></div>';
    document.body.appendChild(back);
    var box = back.querySelector(".ar-cmp-box"), ia = back.querySelector(".ar-cmp-a"), ib = back.querySelector(".ar-cmp-b"), line = back.querySelector(".ar-cmp-line");
    var size = function () {
      var w = a.p.w || 1280, h = a.p.h || 1280, maxW = window.innerWidth - 32, maxH = window.innerHeight - 90;
      if (side) { var s2 = Math.min((maxW - 12) / (2 * w), maxH / h, 1); box.style.width = Math.floor(w * s2 * 2 + 12) + "px"; box.style.height = Math.floor(h * s2) + "px"; return; }
      var s = Math.min(maxW / w, maxH / h, 1);
      box.style.width = Math.floor(w * s) + "px"; box.style.height = Math.floor(h * s) + "px";
    };
    var paint = function () {
      ia.src = fileUrl(a.r.id, a.p.file); ib.src = fileUrl(b.r.id, b.p.file);
      back.querySelector(".ar-cmp-lab.is-a").textContent = "A · " + capOfIt(a);
      back.querySelector(".ar-cmp-lab.is-b").textContent = "B · " + capOfIt(b);
      back.classList.toggle("is-side", side);
      back.querySelector('[data-c="side"]').classList.toggle("is-on", side);
      ib.style.clipPath = side ? "" : "inset(0 0 0 " + (x * 100).toFixed(2) + "%)";
      line.style.left = (x * 100).toFixed(2) + "%";
      size();
    };
    var setX = function (v) { x = Math.max(0, Math.min(1, v)); if (!side) { ib.style.clipPath = "inset(0 0 0 " + (x * 100).toFixed(2) + "%)"; line.style.left = (x * 100).toFixed(2) + "%"; } };
    var down = false, at = function (e) { var r = box.getBoundingClientRect(); setX((e.clientX - r.left) / r.width); };
    box.addEventListener("pointerdown", function (e) { if (side || e.button !== 0) return; down = true; box.setPointerCapture(e.pointerId); at(e); });
    box.addEventListener("pointermove", function (e) { if (down) at(e); });
    box.addEventListener("pointerup", function () { down = false; });
    var close = function () { document.removeEventListener("keydown", key, true); window.removeEventListener("resize", size); back.remove(); state.compare = null; };
    var key = function (e) {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
      else if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); e.stopPropagation(); setX(x + (e.key === "ArrowRight" ? 1 : -1) * (e.shiftKey ? 0.1 : 0.02)); }
      else if (e.key === "s" || e.key === "S") { side = !side; paint(); }
      else if (e.key === "x" || e.key === "X") { var t = a; a = b; b = t; paint(); }
    };
    document.addEventListener("keydown", key, true);
    window.addEventListener("resize", size);
    back.addEventListener("click", function (e) {
      var c = e.target.closest("[data-c]");
      if (!c) { if (e.target === back) close(); return; }
      if (c.dataset.c === "close") close();
      else if (c.dataset.c === "side") { side = !side; paint(); }
      else if (c.dataset.c === "swap") { var t = a; a = b; b = t; paint(); }
    });
    paint();
    state.compare = { x: function () { return x; }, setX: setX, side: function () { return side; }, a: function () { return a; }, b: function () { return b; }, close: close };
  }
  // HERESY 1346 (Viktor 10.10.2026: «определять точное положение (позировать) референсного изображения на холсте проецируемых соотношений
  // сторон… скейлить референс»; «в подобной ереси канваса аутпеинта, инпеинта именно так, как в InvokeAI»): the canvas (heresy-canvas.js)
  function openCanvas() {
    var ref = state.ref;
    if (!ref || !window.HeresyCanvas) return;
    var pic = new Image();
    pic.onload = function () {
      var shapes = shapesPicked();
      window.HeresyCanvas.open({ pic: pic, mask: state.mask, place: state.place, fit: $("arRefFit").checked, shapes: shapes, shape: shapes[0],
        onDone: function (out) {
          state.place = out.place;
          if (out.mask !== undefined) setMask(out.mask);
          paintCanvasSay();
          paintRefSay();
          toast(tr("The canvas is kept: Draw paints each shape as it lies there"));
        } });
    };
    pic.onerror = function () { toast(tr("The picture could not be read"), "bad"); };
    pic.src = ref.data || fileUrl(ref.id, ref.file);
    state.canvasPic = pic;
  }
  function paintCanvasSay() {                         // HERESY 1346: the places said under the strength, shape by shape
    var box = $("arCanvasSay");
    if (!box) return;
    var pl = state.place, pic = state.canvasPic, ok = !!(pl && state.ref && window.HeresyCanvas);
    box.hidden = !ok;
    $("arRef").classList.toggle("is-canvas", ok);
    if (!ok) return;
    var rw = pic && pic.naturalWidth || 1, rh = pic && pic.naturalHeight || 1;
    box.querySelector("em").textContent = tr("On the canvas:") + " " + shapesPicked().map(function (s) {
      return s + " " + tr(window.HeresyCanvas.covers(s, pl[s], rw, rh) ? "from it" : "around"); }).join(" · ");
  }
  function maskEditor() {
    var ref = state.ref;
    if (!ref) return;
    var src = ref.data || fileUrl(ref.id, ref.file), pic = new Image();
    pic.onload = function () { openMask(pic); };
    pic.onerror = function () { toast(tr("The picture could not be read"), "bad"); };
    pic.src = src;
  }
  function openMask(pic) {
    var back = document.createElement("div");
    back.className = "ar-mask";
    back.setAttribute("role", "dialog");
    back.setAttribute("aria-label", tr("The mask: what to repaint"));
    back.innerHTML = '<div class="ar-mask-tools"><b>' + esc(tr("What to repaint")) + "</b>" +
      '<button type="button" class="chip is-on" data-mk="paint" data-tip="' + esc(tr("Paint what is repainted (B)")) + '">' + esc(tr("Paint")) + "</button>" +
      '<button type="button" class="chip" data-mk="erase" data-tip="' + esc(tr("Erase: that stays as it is (E)")) + '">' + esc(tr("Erase")) + "</button>" +
      '<label class="ar-mk-size">' + esc(tr("Brush")) + ' <input type="range" min="4" max="240" step="2" data-mk-size aria-label="' + esc(tr("The brush's size ([ and ])")) + '" /></label>' +
      '<button type="button" class="btn ghost small" data-mk="invert" data-tip="' + esc(tr("What is painted stays, the rest is repainted")) + '">' + esc(tr("Invert")) + "</button>" +
      '<button type="button" class="btn ghost small" data-mk="clear">' + esc(tr("Clear")) + "</button><span class=\"spacer\"></span>" +
      '<button type="button" class="btn ghost small" data-mk="none">' + esc(tr("No mask")) + "</button>" +
      '<button type="button" class="btn primary small" data-mk="done">' + esc(tr("Done")) + "</button></div>" +
      '<div class="ar-mask-stage"><canvas class="ar-mk-pic"></canvas><canvas class="ar-mk-paint"></canvas><span class="ar-mask-ring" hidden></span></div>';
    document.body.appendChild(back);
    var fit = Math.min((window.innerWidth - 32) / pic.width, (window.innerHeight - 140) / pic.height, 1);
    var W = Math.max(64, Math.round(pic.width * fit)), Hh = Math.max(64, Math.round(pic.height * fit));
    var cp = back.querySelector(".ar-mk-pic"), cm = back.querySelector(".ar-mk-paint"), ring = back.querySelector(".ar-mask-ring"), size = back.querySelector("[data-mk-size]");
    cp.width = cm.width = W; cp.height = cm.height = Hh;
    cp.getContext("2d").drawImage(pic, 0, 0, W, Hh);
    var g = cm.getContext("2d"), mode = "paint", down = false, last = null;
    size.value = String(parseInt(recall("yue2.arBrush"), 10) || 60);
    if (state.mask) {                                     // the mask kept, back on the canvas in red
      var was = new Image();
      was.onload = function () { g.drawImage(was, 0, 0, W, Hh); g.globalCompositeOperation = "source-in"; g.fillStyle = "#e02828"; g.fillRect(0, 0, W, Hh); g.globalCompositeOperation = "source-over"; };
      was.src = state.mask.view || state.mask.data;
    }
    var setMode = function (m) { mode = m; Array.prototype.forEach.call(back.querySelectorAll("[data-mk=paint],[data-mk=erase]"), function (b) { b.classList.toggle("is-on", b.dataset.mk === m); }); };
    var r = function () { return +size.value / 2; };
    var at = function (e) { var b = cm.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; };
    var dab = function (p) {
      g.globalCompositeOperation = mode === "erase" ? "destination-out" : "source-over";
      g.strokeStyle = g.fillStyle = "#e02828"; g.lineCap = "round"; g.lineJoin = "round"; g.lineWidth = r() * 2;
      g.beginPath();
      if (last) { g.moveTo(last.x, last.y); g.lineTo(p.x, p.y); g.stroke(); } else { g.arc(p.x, p.y, r(), 0, Math.PI * 2); g.fill(); }
      g.globalCompositeOperation = "source-over";
      last = p;
    };
    var showRing = function (e) {
      var p = at(e), b = cm.getBoundingClientRect(), s = back.querySelector(".ar-mask-stage").getBoundingClientRect();
      ring.hidden = false; ring.style.left = (p.x + b.left - s.left) + "px"; ring.style.top = (p.y + b.top - s.top) + "px";
      ring.style.width = ring.style.height = (r() * 2) + "px";
    };
    cm.addEventListener("pointerdown", function (e) { if (e.button !== 0) return; e.preventDefault(); cm.setPointerCapture(e.pointerId); down = true; last = null; dab(at(e)); });
    cm.addEventListener("pointermove", function (e) { showRing(e); if (down) dab(at(e)); });
    var up = function () { down = false; last = null; };
    cm.addEventListener("pointerup", up); cm.addEventListener("pointercancel", up);
    cm.addEventListener("pointerleave", function () { ring.hidden = true; });
    size.addEventListener("input", function () { keep("yue2.arBrush", size.value); });
    var close = function () { document.removeEventListener("keydown", key, true); back.remove(); };
    var done = function () {
      var out = document.createElement("canvas");             // the mask at the picture's own size: white repaints, black stays
      out.width = pic.width; out.height = pic.height;
      var o = out.getContext("2d");
      o.fillStyle = "#000"; o.fillRect(0, 0, out.width, out.height);
      var white = document.createElement("canvas"); white.width = W; white.height = Hh;
      var w2 = white.getContext("2d"); w2.drawImage(cm, 0, 0); w2.globalCompositeOperation = "source-in"; w2.fillStyle = "#fff"; w2.fillRect(0, 0, W, Hh);
      o.drawImage(white, 0, 0, out.width, out.height);
      var empty = !g.getImageData(0, 0, W, Hh).data.some(function (v, k) { return k % 4 === 3 && v > 0; });
      setMask(empty ? null : { data: out.toDataURL("image/png"), view: white.toDataURL("image/png") });
      toast(tr(empty ? "Nothing painted: no mask" : "The mask is kept: Draw repaints what is white of it, the rest stays"));
      close();
    };
    var key = function (e) {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
      else if (e.key === "Enter") { e.preventDefault(); done(); }
      else if (e.key === "b" || e.key === "B") setMode("paint");
      else if (e.key === "e" || e.key === "E") setMode("erase");
      else if (e.key === "[" || e.key === "]") { size.value = String(Math.max(4, Math.min(240, +size.value + (e.key === "]" ? 10 : -10)))); keep("yue2.arBrush", size.value); }
    };
    document.addEventListener("keydown", key, true);
    back.addEventListener("click", function (e) {
      var b = e.target.closest("[data-mk]");
      if (!b) return;
      var k = b.dataset.mk;
      if (k === "paint" || k === "erase") setMode(k);
      else if (k === "clear") g.clearRect(0, 0, W, Hh);
      else if (k === "invert") {
        var t = document.createElement("canvas"); t.width = W; t.height = Hh;
        var tg = t.getContext("2d"); tg.fillStyle = "#e02828"; tg.fillRect(0, 0, W, Hh); tg.globalCompositeOperation = "destination-out"; tg.drawImage(cm, 0, 0);
        g.clearRect(0, 0, W, Hh); g.drawImage(t, 0, 0);
      } else if (k === "none") { setMask(null); close(); }
      else if (k === "done") done();
    });
    state.maskEditor = { canvas: cm, paint: function (x, y, rad) { var s0 = size.value; size.value = String(rad * 2); last = null; dab({ x: x, y: y }); last = null; size.value = s0; }, done: done, close: close };
  }
  function draw(again) {
    if (runsFull()) return toast(tr("Two runs at a time: the next one can be asked when one of them ends"), "bad");   // HERESY 1340
    var body = again ? { prompt: again.prompt, shapes: again.shapes, count: again.count, seed: null, painter: again.painter }
      : (function () { if (state.seedMode) state.seedMode.before(); return { prompt: $("arPrompt").value.trim(), shapes: shapesPicked(), count: +$("arCount").value || 1, seed: seedAsked(), painter: $("arPainter").value }; })();   // HERESY 1330: the seed as its mode wants it
    if (again && again.model) body.model = again.model;                 // HERESY 1318: the fp8 fine-tune
    else if (!again && !$("arModelBox").hidden) body.model = $("arModel").value;
    // HERESY 1326 (Viktor 10.10.2026, 14:57: «ловлю ошибку. Хотя выбрано всё правильно»): 1319 put the sampling between the two
    // lines above, and the form's fine-tune hung on «no sampling of its own»: with his 16 steps, Euler SDE and Beta it was never sent
    var smp = again ? again.sampling : samplingBody();                  // HERESY 1319
    if (smp && Object.keys(smp).length) body.sampling = smp;
    if (again && again.ref) { body.ref = { id: again.id, file: again.ref }; body.strength = again.strength; if (again.fit) body.fit = true; }   // HERESY 1305: its own; 1307
    else if (!again && state.ref) { body.ref = state.ref.data || { id: state.ref.id, file: state.ref.file }; body.strength = +$("arRefStr").value; }
    if (again && again.ref && again.mask) body.mask = { id: again.id, file: again.mask };   // HERESY 1306: Again repaints by the run's own
    if (!again && state.ref && state.mask) body.mask = state.mask.data;
    if (again && again.mask_opts) body.mask_opts = again.mask_opts;     // HERESY 1320
    else if (!again && state.ref && (state.mask || $("arRefFit").checked)) body.mask_opts = maskOpts();
    if (!again && state.ref && $("arRefFit").checked) body.fit = true;   // HERESY 1307: painted around
    if (again && again.place) body.place = again.place;                 // HERESY 1346: the canvas's places
    else if (!again && state.ref && state.place) {
      body.place = {};
      body.shapes.forEach(function (s) { if (state.place[s]) body.place[s] = state.place[s]; });
      if (!body.mask_opts) body.mask_opts = maskOpts();          // the band where the painting meets the picture
    }
    body.preview = $("arLive").checked;                 // HERESY 1257: each step's picture while it paints
    if (state.take) body.take = state.take.name;
    // HERESY 1316: the adapters on (Again: the run's own, its painter's family being the same)
    var ls = again ? (again.loras || []) : lorasNow().filter(function (l) { return !state.loraLib || loraFind(l.id); });
    ls = ls.filter(function (l) { return !l.muted && +l.weight > 0; });   // HERESY 1341: a muted one or one at nought paints nothing, and its room was asked
    if (ls.length) body.loras = ls.map(function (l) { return { id: l.id, weight: +l.weight }; });
    if (!body.prompt) return toast(tr("Write what to paint first"), "bad");
    if (!body.shapes.length) return toast(tr("Pick a shape: 1:1, 16:9 or 9:16"), "bad");
    state.sending = true;
    paintForm();
    alog(tr("Draw asked:") + " " + (PAINTERS[body.painter] || body.painter) + (body.model ? " · " + String(body.model).replace(/\.safetensors$/, "") : "") + " · " + body.shapes.join(", ") +
      (body.count > 1 ? " × " + body.count : "") + " · " + tr("seed") + " " + (body.seed == null ? tr("new") : body.seed) + (body.sampling ? " · " + JSON.stringify(body.sampling) : "") +
      (body.loras ? " · LoRA " + body.loras.map(function (l) { return loraName(loraFind(l.id), l.id) + " " + l.weight; }).join(", ") : "") + (body.ref ? " · " + tr("from a reference") : ""));
    return api("/artist/draw", body).then(function (run) {
      alog(tr("Run") + " " + run.id + ": " + tr(countOf(run.of, "picture", "pictures")) + ", " + tr("seed") + " " + run.seed + " · " + tr("in the queue"));
      if (!again && state.seedMode) { state.seedMode.after(run.count || body.count, run.seed); keepForm(); }   // HERESY 1330: Next or Previous past its seeds
      state.pinSel = false;                              // HERESY 1271: the stage follows the new run
      state.runs.unshift(run);
      paintRuns();
      toast(tr("The Artist draws " + countOf(run.of, "picture", "pictures") + " · seed " + run.seed + ": it waits for a card with room, then paints (Engine → GPUs says which card does what)"));
      schedule(1500);
    }).catch(function (e) { toast(tr("The Artist cannot draw: " + e.message), "bad"); alog(tr("The Artist cannot draw:") + " " + e.message, "bad"); })
      .then(function () { state.sending = false; paintForm(); });
  }
  function stopRun() {                                   // HERESY 1270
    var r = drawingRun();
    if (!r) return;
    state.stopping = true;
    paintForm();
    api("/artist/stop", { id: r.id }).then(function () { toast(tr("Stopping the run: the pictures it finished stay")); })
      .catch(function (e) { toast(tr("The run did not stop: " + e.message), "bad"); })
      .then(function () { state.stopping = false; return load(); });
  }
  function fromTake() {
    var take = state.take;
    if (!take) return toast(tr("Pick a take on the right first"), "bad");
    api("/artist/prompt?name=" + encodeURIComponent(take.name)).then(function (d) {
      var put = function () {
        $("arPrompt").value = d.prompt || "";
        keepForm(); paintForm();
        toast(d.from === "artwork" ? tr("The prompt its artwork was drawn from") : tr("A prompt from its title and style: say more of what you see"));
      };
      var mine = $("arPrompt").value.trim();
      if (!mine || mine === (d.prompt || "").trim()) return put();
      return window.HeresyDialog.confirm(tr("Put the take's prompt in place of the one written here?") + "\n\n" +
        tr("What is written now goes; each run below keeps its own prompt."), { ok: tr("Put it in"), danger: true }).then(function (ok) { if (ok) put(); });
    }).catch(function (e) { toast(tr("No prompt from the take: " + e.message), "bad"); });
  }

  // ------------------------------------------------------------------ the take in hand
  function setTake(take) {
    state.take = take && take.name ? take : null;
    paintHead();
    paintRefTake();                                    // HERESY 1309
    if (state.runs.length) paintRuns();     // «Set as cover» names the take
  }
  function hasArt(name) { return !!(state.hooks && state.hooks.artUrl && state.hooks.artUrl(name)); }
  // HERESY 1309: the take's cover as the reference, at a click, when the take picked on the right has one
  function paintRefTake() { var b = $("arRefTake"); if (b) b.hidden = !(state.take && hasArt(state.take.name)); }
  function refFromTake() {
    var take = state.take, url = take && hasArt(take.name) && state.hooks.artUrl(take.name);
    if (!url) return toast(tr("Pick a take with a cover on the right first"), "bad");
    fetch(url).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.blob(); }).then(function (b) {
      var f = new File([b], (take.label || take.name) + ".jpg", { type: b.type || "image/jpeg" });
      refFromFile(f);
    }).catch(function (e) { toast(tr("The cover could not be read: " + e.message), "bad"); });
  }
  function paintHead() {
    paintRefTake();                                  // HERESY 1309: the take may have a cover now, or none
    var t = state.take;
    $("arTake").textContent = t ? t.label || t.name : "";
    $("arTakeNote").textContent = t ? (hasArt(t.name) ? tr("its cover can be one of these") : tr("no cover yet: give it one of these")) : tr("pick a take on the right to give it a cover");
    $("arFromTake").disabled = !t;
  }

  // ------------------------------------------------------------------ the runs
  // HERESY 1334: each run's way to its end, said once a change (the first look only takes them in)
  function logRuns(runs) {
    var seen = state.logSeen, first = !seen;
    state.logSeen = seen = seen || {};
    runs.forEach(function (r) {
      var mark = r.status + "|" + (r.waiting || "") + "|" + (r.gpu == null ? "" : r.gpu);
      if (seen[r.id] === mark) return;
      seen[r.id] = mark;
      if (first) return;
      var kept = (r.pictures || []).filter(function (p) { return p.kept; }).length, who = tr("Run") + " " + r.id + " (" + painterLabel(r) + ")";
      if (r.status === "queued") alog(who + ": " + (r.waiting ? tr("waits:") + " " + tr(r.waiting) : tr("in the queue")));
      else if (r.status === "running") alog(who + ": " + tr("paints on GPU") + " " + r.gpu);
      else if (r.status === "done") alog(who + ": " + tr("done") + ", " + kept + " " + tr("of") + " " + r.of + (r.took ? " · " + Math.round(r.took) + " s" : ""), kept ? "good" : "bad");
      else if (r.status === "stopped") alog(who + ": " + tr("stopped") + ", " + kept + " " + tr("of") + " " + r.of + " " + tr("kept"));
      else if (r.status === "failed") alog(who + ": " + tr("failed:") + " " + (r.error || ""), "bad");
    });
  }
  function load() {
    return api("/artist/runs").then(function (d) {
      logRuns(d.runs || []);                             // HERESY 1334
      var was = {};
      state.runs.forEach(function (r) { if (live(r)) was[r.id] = 1; });
      state.runs = d.runs || [];
      state.runs.forEach(function (r) {                // HERESY 1321: a picture put aside is not the room's any more (the Trash look has it)
        r.asides = (r.pictures || []).filter(function (p) { return p.aside; }).length;
        if (r.asides) r.pictures = r.pictures.filter(function (p) { return !p.aside; });
      });
      state.runs.forEach(function (r) {           // a run that ended while the room looked on says so
        if (!was[r.id] || live(r)) return;
        var kept = (r.pictures || []).filter(function (p) { return p.kept; }).length;
        var last = (r.pictures || []).filter(function (p) { return p.kept; }).pop();   // HERESY 1271: the stage takes its last picture
        if (last) { state.sel = { id: r.id, file: last.file }; state.pinSel = false; }
        if (r.status === "done") toast(tr("The Artist drew " + kept + " of " + countOf(r.of, "picture", "pictures")), kept ? "good" : "bad");   // HERESY 1339: one sentence each
        else if (r.status === "stopped") toast(tr("The Artist stopped: " + kept + " of " + countOf(r.of, "picture", "pictures") + " kept"));   // HERESY 1270
        else toast(tr("The Artist's run failed: " + (r.error || "")), "bad");
        if (r.status !== "stopped" && window.RuachChime) window.RuachChime.ring(r.status === "done" && kept > 0);   // HERESY 1275: heard too
      });
      paintRuns();
      paintForm();                                       // HERESY 1270: Stop back to Draw when the run ends
      schedule();
    }).catch(function (e) {
      $("arRuns").innerHTML = '<p class="ar-empty">' + esc(tr("The lab does not answer:")) + " " + esc(e.message) + "</p>";
    });
  }
  function schedule(ms) {
    clearTimeout(state.timer);
    var painting = state.runs.some(function (r) { return r.status === "running"; });
    if (document.body.dataset.tab === "artist" && state.runs.some(live)) state.timer = setTimeout(load, ms || (painting ? 1200 : 2500));
  }
  function runState(r) {
    if (r.status === "queued") return '<span class="ar-state is-wait">' + esc(tr(r.waiting ? "waits for a card" : "in the queue")) + "</span>" +
      (r.waiting ? ' <span class="ar-why">' + esc(r.waiting) + "</span>" : "") +
      ' <button type="button" class="btn ghost small" data-act="cancel">' + esc(tr("Off the queue")) + "</button>";
    if (r.status === "running") return '<span class="ar-state is-run">' + esc(tr("drawing " + (r.pictures || []).length + " of " + r.of + (r.gpu != null ? " · GPU " + r.gpu : ""))) + "</span>";
    if (r.status === "failed") return '<span class="ar-state is-bad">' + esc(tr("failed")) + "</span> " + '<span class="ar-why" translate="no">' + esc(r.error || "") + "</span>";
    if (r.status === "stopped") {                       // HERESY 1270
      var k0 = (r.pictures || []).filter(function (p) { return p.kept; }).length;
      return '<span class="ar-state is-bad">' + esc(tr("stopped")) + "</span> " + '<span class="ar-why">' + esc(tr(k0 + " of " + r.of + " kept")) + "</span>";
    }
    var kept = (r.pictures || []).filter(function (p) { return p.kept; }).length;
    return '<span class="ar-state">' + esc(tr((kept === 1 ? "1 picture" : kept + " pictures") + (r.took ? " · " + Math.round(r.took) + " s" : ""))) + "</span>";
  }
  function capOf(r, p) { return p.shape + (r.count > 1 ? " · v" + (p.seed - r.seed + 1) : ""); }
  function picHtml(r, p, i) {
    var sh = shapeOf(p.shape);
    if (!p.kept) return '<figure class="ar-pic is-gone" style="--ar:' + sh.w + "/" + sh.h + '"><div class="ar-gone">' +
      esc(tr("Not kept: the content filter flagged it")) + '</div><figcaption><span class="ar-cap">' + esc(capOf(r, p)) + "</span></figcaption></figure>";
    var square = p.shape === "1:1", take = state.take;
    var coverTip = !take ? tr("Pick a take on the right to give it this cover") : !square ? tr("A cover is square: this one is for a video or a short") :
      tr("This picture becomes the cover of “" + (take.label || take.name) + "”" + (hasArt(take.name) ? " (its cover now is kept beside it)" : ""));
    return '<figure class="ar-pic" style="--ar:' + sh.w + "/" + sh.h + '" data-i="' + i + '">' +
      '<button type="button" class="ar-thumb" data-act="view" aria-label="' + esc(tr("Look at it")) + '" data-tip="' + esc(p.w + "×" + p.h + " · " + tr("seed") + " " + p.seed) +
      '"><img alt="" loading="lazy" draggable="false" src="' + esc(fileUrl(r.id, p.thumb || p.file)) + '" /></button>' +
      '<figcaption><span class="ar-cap">' + esc(capOf(r, p)) + "</span>" +
      '<a class="ar-dl" data-tip="' + esc(tr("Download the picture (PNG, full size)")) + '" aria-label="' + esc(tr("Download")) + '" href="' + esc(fileUrl(r.id, p.file)) +
      '" download="' + esc("ruach-artist-" + r.id + "-" + p.file) + '">' + (window.HeresyIcons ? window.HeresyIcons.ui("download") : "⤓") + "</a>" +
      (square ? '<button type="button" class="btn ghost small ar-cover" data-act="cover"' + (take ? "" : " disabled") + ' data-tip="' + esc(coverTip) + '">' +
      esc(tr("Set as cover")) + "</button>" : "") + "</figcaption></figure>";
  }
  function waitHtml(r) {
    var have = (r.pictures || []).length, out = "", n = 0;
    for (var k = 0; k < (r.count || 1); k++) {
      (r.shapes || []).forEach(function (id) {
        n++;
        if (n <= have) return;
        var sh = shapeOf(id), now = n === have + 1 && r.status === "running", step = now && r.live && r.live.live === n ? r.live : null;
        out += '<figure class="ar-pic is-wait" style="--ar:' + sh.w + "/" + sh.h + '"><div class="ar-gone' + (step ? " ar-develop" : "") + '">' +
          (step ? '<img alt="" draggable="false" src="' + esc(fileUrl(r.id, step.file) + "&v=" + step.step) + '" /><span class="ar-stepno">' + step.step + " / " + step.of + "</span>"
            : esc(now ? tr("painting…") : tr("to come"))) +
          '</div><figcaption><span class="ar-cap">' + esc(capOf(r, { shape: id, seed: (r.seed || 0) + k })) + "</span></figcaption></figure>";
      });
    }
    return out;
  }
  function items() {                                  // every kept picture, the newest first, as the gallery's filter says
    var out = [];
    state.runs.forEach(function (r) {
      (r.pictures || []).forEach(function (p) {
        if (!p.kept) return;
        if (state.filter === "star" ? !p.star : state.filter !== "all" && p.shape !== state.filter) return;
        out.push({ r: r, p: p });
      });
    });
    return out;
  }
  function paintBar() {
    Array.prototype.forEach.call(document.querySelectorAll("#arBar [data-look]"), function (b) { b.classList.toggle("is-on", b.dataset.look === state.look); });
    Array.prototype.forEach.call(document.querySelectorAll("#arFilters [data-filter]"), function (b) { b.classList.toggle("is-on", b.dataset.filter === state.filter); });
    Array.prototype.forEach.call(document.querySelectorAll("#arSizes [data-size]"), function (b) { b.classList.toggle("is-on", b.dataset.size === state.size); });
    $("arFilters").hidden = $("arSizes").hidden = state.look !== "gallery";
    var all = 0;
    state.runs.forEach(function (r) { (r.pictures || []).forEach(function (p) { if (p.kept) all++; }); });
    $("arTotal").textContent = state.look === "gallery" ? tr(items().length + " of " + all) : tr(countOf(state.runs.length, "run", "runs")) + " · " + tr(countOf(all, "picture", "pictures"));   // HERESY 1339: each count its own form
  }
  function countOf(n, one, many) { return n === 1 ? "1 " + one : n + " " + many; }   // HERESY 1339: «1 picture», «3 pictures», for the catalogs' patterns
  function paintGallery() {
    var list = items(), h = (SIZES.filter(function (z) { return z[0] === state.size; })[0] || SIZES[1])[2];
    // HERESY 1284 (Viktor: «всё свалено в кучу. Сделай честный тайлинг»): even tiles, square for every shape, the shape's own for one
    var one = state.filter !== "all" && state.filter !== "star" ? shapeOf(state.filter) : null, cell = one ? one.w + " / " + one.h : "1 / 1";
    $("arRuns").innerHTML = !list.length ? '<p class="ar-empty">' + esc(tr(state.filter === "star" ? "No starred picture yet: ☆ on a picture stars it." : "No picture of this shape yet.")) + "</p>"
      : '<div class="ar-gallery" style="--g-h:' + h + "px;--cell:" + cell + '">' + list.map(function (it, i) {
        var sh = shapeOf(it.p.shape);
        return '<figure class="ar-gpic" style="--ar:' + sh.w + "/" + sh.h + '" data-g="' + i + '">' +
          '<button type="button" class="ar-thumb" data-act="gview" aria-label="' + esc(tr("Look at it")) + '" data-tip="' + esc(it.p.shape + " · " + tr("seed") + " " + it.p.seed + " · " + when(it.r.created)) + '">' +
          '<img alt="" loading="lazy" draggable="false" src="' + esc(fileUrl(it.r.id, it.p.thumb || it.p.file)) + '" /></button>' +
          '<button type="button" class="ar-star' + (it.p.star ? " is-on" : "") + '" data-act="gstar" aria-pressed="' + (it.p.star ? "true" : "false") + '" aria-label="' + esc(tr("Star it")) + '">' + starIcon(it.p.star) + "</button></figure>";   // HERESY 1321
      }).join("") + "</div>";
  }
  function paintRuns() { paintRunsList(); paintStage(); paintPicked(); }   // HERESY 1271: the library, then the stage; 1321: the picked
  // HERESY 1310 (Viktor's list for the Artist: «a trash list in the room»): the runs in the trash, each with Restore
  // HERESY 1337 (Viktor: «Вижу Trash у Артиста, но пока что очистки и удаления нет»): the trash's runs and pictures deleted for good,
  // asked first; Wipe out takes what this look shows (the covers taken off the takes stay: the library's Trash (Art) has them)
  function purge(b) {
    var pics = state.asidePics || [], runs = state.trashed || [], items, say;
    if (b.dataset.purge) {
      var r = runs.filter(function (x) { return x.id === b.dataset.purge; })[0], n = r ? (r.pictures || []).filter(function (p) { return p.kept; }).length : 0;
      items = [{ kind: "run", id: b.dataset.purge }];
      say = tr("Delete this run for good, with its " + countOf(n, "picture", "pictures") + "?");
    } else if (b.dataset.purgePic != null) {
      var p = pics[+b.dataset.purgePic];
      if (!p) return;
      items = [{ kind: "picture", id: p.id, file: p.file }];
      say = tr("Delete this picture for good?");
    } else {
      items = runs.map(function (x) { return { kind: "run", id: x.id }; }).concat(pics.map(function (x) { return { kind: "picture", id: x.id, file: x.file }; }));
      say = tr("Wipe out the Artist's trash: " + countOf(runs.length, "run", "runs") + ", " + countOf(pics.length, "picture", "pictures") + "?");
    }
    if (!items.length) return;
    return window.HeresyDialog.confirm(say + "\n\n" + tr("This cannot be undone.") + (b.dataset.wipe ? " " + tr("The covers taken off the takes stay: the library's Trash (Art) has them.") : ""),
      { ok: tr(b.dataset.wipe ? "Wipe out" : "Delete for good"), danger: true }).then(function (ok) {
      if (!ok) return;
      return api("/artist/bin", { op: "delete", items: items }).then(function (d) {
        var n = (d.done || []).length, kept = d.kept || [], said = tr(n + " deleted for good" + (kept.length ? " · " + kept.length + " stayed: " + kept[0].why : ""));
        toast(said, kept.length && !n ? "bad" : "");
        alog(tr("The trash:") + " " + said, kept.length ? "bad" : "");
        return load().then(function () { if (state.look === "trash") paintTrash(); });
      }).catch(function (e) { toast(e.message, "bad"); });
    });
  }
  function paintTrash() {
    var box = $("arRuns");
    if (!state.trashed) box.innerHTML = '<p class="ar-empty">' + esc(tr("Reading the trash…")) + "</p>";   // once: a refresh keeps the list
    Promise.all([api("/artist/trashed"), api("/artist/asides").catch(function () { return { pictures: [] }; })]).then(function (x) {   // HERESY 1321
      var d = x[0], pics = x[1].pictures || [];
      if (state.look !== "trash") return;
      var runs = d.runs || [];
      state.trashed = runs;
      $("arTotal").textContent = tr(countOf(runs.length, "run", "runs") + " in the trash");
      box.innerHTML = runs.length ? runs.map(function (r) {
        var pics = (r.pictures || []).filter(function (p) { return p.kept; });
        return '<div class="ar-trun" data-tid="' + esc(r.id) + '"><div class="ar-trun-head"><span><span translate="no">' + esc(when(r.created)) + " · " + esc(painterLabel(r)) + "</span> · " +
          esc(tr(countOf(pics.length, "picture", "pictures"))) + '</span><p translate="no">' + esc(r.prompt || "") + "</p></div>" +
          '<button type="button" class="btn ghost small" data-restore="' + esc(r.id) + '">' + esc(tr("Restore")) + "</button>" +
          '<button type="button" class="btn ghost small danger" data-purge="' + esc(r.id) + '" data-tip="' + esc(tr("Deleted for good, with its pictures: asks first")) + '">' + esc(tr("Delete for good")) + "</button>" +   // HERESY 1337
          '<div class="ar-trun-pics">' + pics.slice(0, 6).map(function (p) {
            return '<img alt="" loading="lazy" draggable="false" src="' + esc(fileUrl(r.id, p.thumb || p.file) + "&trash=1") + '" />';
          }).join("") + "</div></div>";
      }).join("") : (pics.length ? "" : '<p class="ar-empty">' + esc(tr("The trash is empty.")) + "</p>");
      if (pics.length) {                                  // HERESY 1321: the pictures put aside, each with Restore
        box.insertAdjacentHTML("afterbegin", '<div class="ar-aside-box"><div class="ar-aside-head"><b>' + esc(tr("Pictures put aside")) + "</b> <span>" + pics.length + "</span>" +
          '<button type="button" class="btn ghost small" data-back-all="1">' + esc(tr("Restore all")) + "</button></div>" +
          '<div class="ar-aside-grid">' + pics.map(function (p, i) {
            return '<figure class="ar-aside-pic" data-ai="' + i + '" title="' + esc(p.prompt || "") + '"><img alt="" loading="lazy" draggable="false" src="' + esc(fileUrl(p.id, p.thumb || p.file)) + '" />' +
              '<button type="button" class="btn ghost small" data-back="' + i + '">' + esc(tr("Restore")) + "</button>" +
              '<button type="button" class="pb-btn ar-aside-x" data-purge-pic="' + i + '" aria-label="' + esc(tr("Delete for good")) + '" data-tip="' + esc(tr("Delete for good: asks first")) + '">\u2715</button></figure>';   // HERESY 1337
          }).join("") + "</div></div>");
        state.asidePics = pics;
      }
      if (runs.length || pics.length) box.insertAdjacentHTML("afterbegin", '<div class="ar-trash-head"><span class="row-hint">' +   // HERESY 1337
        esc(tr("The covers taken off the takes wait in the library's Trash (Art), with these.")) + "</span>" +
        '<button type="button" class="btn ghost small danger" data-wipe="1" data-tip="' + esc(tr("Every run and picture here deleted for good: asks first")) + '">' + esc(tr("Wipe out")) + "</button></div>");
      $("arTotal").textContent = (pics.length ? tr(countOf(pics.length, "picture", "pictures")) + " · " : "") + tr(countOf(runs.length, "run", "runs") + " in the trash");
    }).catch(function (e) { box.innerHTML = '<p class="ar-empty">' + esc(tr("The trash could not be read:") + " " + e.message) + "</p>"; });
  }
  function restoreRun(id) {
    return api("/artist/restore", { id: id }).then(function () {
      toast(tr("Back among the runs"));
      return load().then(function () { if (state.look === "trash") paintTrash(); });
    }).catch(function (e) { toast(e.message, "bad"); });
  }
  function paintRunsList() {
    var box = $("arRuns");
    paintBar();
    if (state.look === "trash") return paintTrash();       // HERESY 1310
    if (state.look === "gallery" && state.runs.length) return paintGallery();
    if (!state.runs.length) {
      box.innerHTML = '<p class="ar-empty">' + esc(tr("Nothing drawn here yet. Write what you see for the song, pick its shapes and press Draw.")) + "</p>";
      return;
    }
    box.innerHTML = state.runs.map(function (r) {
      var pics = (r.pictures || []).map(function (p, i) { return picHtml(r, p, i); }).join("") + (live(r) ? waitHtml(r) : "");
      var open = !!state.open[r.id];
      return '<article class="ar-run' + (live(r) ? " is-live" : "") + '" data-id="' + esc(r.id) + '">' +
        '<header class="ar-run-head"><span class="ar-when">' + esc(when(r.created)) + "</span>" +
        '<span class="ar-meta" translate="no">' + esc(painterLabel(r)) + " · " + esc(tr("seed")) + " " + esc(r.seed) +
        (r.count > 1 ? "…" + esc(r.seed + r.count - 1) : "") + "</span>" + runState(r) +
        '<span class="ar-acts"><button type="button" class="btn ghost small" data-act="form" data-tip="' + esc(tr("Its prompt, shapes, variations and seed back in the form above")) + '">' + esc(tr("To the form")) + "</button>" +
        '<button type="button" class="btn ghost small" data-act="again" data-tip="' + esc(tr(r.kind === "upscale" ? "The same picture upscaled once more" : "The same prompt and shapes once more, from a new seed")) + '"' + (live(r) ? " disabled" : "") + ">" + esc(tr("Again")) + "</button>" +
        '<button type="button" class="btn ghost small danger" data-act="trash" data-tip="' + esc(tr("The run and its pictures to the trash (the studio's trash/artist/)")) + '"' + (live(r) ? " disabled" : "") + ">" + esc(tr("Trash")) + "</button></span></header>" +
        '<p class="ar-prompt' + (open ? " is-open" : "") + '" data-act="fold" translate="no">' + esc(r.prompt) + "</p>" +
        '<div class="ar-pics">' + pics + "</div></article>";
    }).join("");
  }
  function runOf(el) { var a = el.closest(".ar-run"); return a && state.runs.filter(function (r) { return r.id === a.dataset.id; })[0]; }
  function cover(r, p) {
    var take = state.take;
    if (!take || p.shape !== "1:1") return;
    var go = function () {
      return api("/artist/cover", { id: r.id, file: p.file, name: take.name }).then(function (d) {
        toast(tr("The cover of “" + (take.label || take.name) + "” is this picture now" + (d.kept ? " · the old one is kept beside the take" : "")), "good");
        if (state.hooks.refreshArts) state.hooks.refreshArts().then(paintHead);
      }).catch(function (e) { toast(tr("No cover: " + e.message), "bad"); });
    };
    if (!hasArt(take.name)) return go();
    return window.HeresyDialog.confirm(tr("Set this picture as the cover of the take in hand?") + "\n\n" + (take.label || take.name) + "\n\n" +
      tr("The cover it has now is kept beside the take (artwork-removed/), as a redraw keeps it; its MP3 is made again with the new one."),
      { ok: tr("Set as cover") }).then(function (ok) { if (ok) return go(); });
  }
  function star(r, p, on) {
    return api("/artist/star", { id: r.id, file: p.file, star: on }).then(function () {
      p.star = on;
      paintRuns();
    }).catch(function (e) { toast(tr("No star: " + e.message), "bad"); });
  }
  // HERESY 1322 (Viktor 10.10.2026: «модели апскейлеров… 637GB золота»): the upscalers, the row under the stage's buttons, the run
  function loadUpscalers() {
    if (state.upscalers) return Promise.resolve(state.upscalers);
    return api("/artist/upscalers").then(function (d) { state.upscalers = d.upscalers || []; state.stageKey = ""; paintStage(); return state.upscalers; })
      .catch(function (e) { toast(e.message, "bad"); state.upscalers = []; });
  }
  // HERESY 1332 (Viktor: «2K и 4K максимум. Нехер ручные значения вводить»): the long side to 2560 or 3840
  var UP_TARGETS = { "2k": 2560, "4k": 3840 };
  function upSize(p, t) { var w = +p.w || 0, h = +p.h || 0, long = Math.max(w, h); return long ? [Math.round(w * UP_TARGETS[t] / long), Math.round(h * UP_TARGETS[t] / long)] : null; }
  function upRow(p) {
    var list = state.upscalers || [];
    if (!list.length) return '<div class="ar-up-row"><span class="row-hint">' + esc(state.upscalers ? tr("No upscaler here: put .pth or .safetensors models (4x_… from OpenModelDB or Civitai) into artwork/upscalers/") : tr("Reading the upscalers…")) + "</span></div>";
    var names = list.map(function (u) { return u.name; }), want = recall("yue2.arUpModel");
    var pick = names.indexOf(want) >= 0 ? want : names.indexOf("4x_Nomos8kDAT.pth") >= 0 ? "4x_Nomos8kDAT.pth" : names[0];
    return '<div class="ar-up-row"><select id="arUpModel" translate="no" aria-label="' + esc(tr("The upscaler")) + '">' + list.map(function (u) {
      return '<option value="' + esc(u.name) + '"' + (u.name === pick ? " selected" : "") + ">" + esc(u.name.replace(/\.(pth|safetensors)$/, "") + " (" + u.mb + " MB)") + "</option>";
    }).join("") + "</select>" +
      ["2k", "4k"].map(function (t) {
        var long = p ? Math.max(+p.w || 0, +p.h || 0) : 0, sz = p ? upSize(p, t) : null, done = long >= UP_TARGETS[t];
        var tip = done ? tr("It is as large already") + " (" + p.w + "\u00d7" + p.h + ")" : sz ? p.w + "\u00d7" + p.h + " \u2192 " + sz[0] + "\u00d7" + sz[1] : "";
        return '<button type="button" class="btn small" data-up="' + t + '"' + (done ? " disabled" : "") + ' data-tip="' + esc(tip) + '">' + t.toUpperCase() + "</button>";
      }).join("") + "</div>";
  }
  function upscaleIt(src, model, target) {           // HERESY 1332: «2k» or «4k»; a number is 1322's factor (an older run's Again)
    keep("yue2.arUpModel", model);
    var body = { id: src.id, file: src.file, model: model };
    if (UP_TARGETS[target]) body.target = target; else body.factor = +target || 2;
    return api("/artist/upscale", body).then(function (run) {
      state.upOpen = false;
      state.pinSel = false;
      state.runs.unshift(run);
      paintRuns();
      toast(tr("Upscaling " + (UP_TARGETS[target] ? String(target).toUpperCase() : "\u00d7" + target) + " · " + model.replace(/\.(pth|safetensors)$/, "") + ": about half a minute on a card"));
      schedule(1500);
    }).catch(function (e) { toast(tr("Not upscaled: " + e.message), "bad"); alog(tr("Not upscaled:") + " " + e.message, "bad"); });
  }
  // HERESY 1321 (Viktor 10.10.2026: «Удаление картинки или массива выбранных»): pictures picked with Ctrl (or ⌘) + click, a range with
  // Shift + click; the bar says how many, with Star, Trash and ✕; Esc lets go
  state.picked = {};
  function pickKey(it) { return it.r.id + "|" + it.p.file; }
  function pickedList() { return Object.keys(state.picked).map(function (k) { var i = k.indexOf("|"); return { id: k.slice(0, i), file: k.slice(i + 1) }; }); }
  function togglePick(it, range, list) {
    var k = pickKey(it);
    if (range && state.lastPick && list) {
      var keys = list.map(pickKey), a = keys.indexOf(state.lastPick), b = keys.indexOf(k);
      if (a >= 0 && b >= 0) { keys.slice(Math.min(a, b), Math.max(a, b) + 1).forEach(function (x) { state.picked[x] = 1; }); paintPicked(); return; }
    }
    if (state.picked[k]) delete state.picked[k]; else state.picked[k] = 1;
    state.lastPick = k;
    paintPicked();
  }
  function clearPicked() { state.picked = {}; state.lastPick = null; paintPicked(); }
  function paintPicked() {
    var list = items();
    Array.prototype.forEach.call(document.querySelectorAll("#arRuns .ar-gpic[data-g]"), function (f) { var it = list[+f.dataset.g]; f.classList.toggle("is-picked", !!(it && state.picked[pickKey(it)])); });
    Array.prototype.forEach.call(document.querySelectorAll("#arRuns .ar-pic[data-i]"), function (f) {
      var run = runOf(f), p = run && run.pictures[+f.dataset.i];
      f.classList.toggle("is-picked", !!(p && state.picked[run.id + "|" + p.file]));
    });
    var bar = $("arPicked"), n = Object.keys(state.picked).length;
    if (!bar) return;
    bar.hidden = !n;
    bar.innerHTML = n ? '<span class="ar-picked-n">' + n + " " + esc(tr(n === 1 ? "picked" : "picked")) + "</span>" +
      '<button type="button" class="chip ar-fshape" data-pick="star" aria-label="' + esc(tr("Star them")) + '" data-tip="' + esc(tr("Star them all")) + '">' + starIcon(true) + "</button>" +
      '<button type="button" class="chip" data-pick="aside" data-tip="' + esc(tr("Put them in the trash: the library's Trash brings them back")) + '">' + esc(tr("Trash")) + "</button>" +
      '<button type="button" class="pb-btn" data-pick="clear" aria-label="' + esc(tr("Let them go (Esc)")) + '">\u2715</button>' : "";
  }
  function asidePics(items, back) {
    return api("/artist/aside", { items: items, aside: !back }).then(function (d) {
      var n = (d.done || []).length;
      toast(back ? tr("Back in the room: " + countOf(n, "picture", "pictures"))   // HERESY 1339: one sentence
        : tr(countOf(n, "picture", "pictures") + " in the trash: the library's Trash brings them back" + ((d.trashed || []).length ? " · a run with nothing left went with them" : "")));
      clearPicked();
      return load().then(function () { if (state.look === "trash") paintTrash(); });
    }).catch(function (e) { toast(e.message, "bad"); });
  }
  function starPicked() {
    var all = pickedList(), go = function (i) {
      if (i >= all.length) { clearPicked(); return load(); }
      return api("/artist/star", { id: all[i].id, file: all[i].file, star: true }).then(function () { return go(i + 1); }, function (e) { toast(e.message, "bad"); return go(i + 1); });
    };
    return go(0);
  }
  function trashRun(r) {
    return window.HeresyDialog.confirm(tr("The run and its " + countOf((r.pictures || []).filter(function (p) { return p.kept; }).length, "picture", "pictures") + " to the trash?") + "\n\n" +
      tr("They go to the studio's trash/artist/ and can come back from there; a cover already given to a take stays with the take."),
      { ok: tr("To the trash"), danger: true }).then(function (ok) {
      if (!ok) return;
      return api("/artist/trash", { id: r.id }).then(function () {
        state.runs = state.runs.filter(function (x) { return x.id !== r.id; });
        paintRuns();
        toast(tr("In the trash: the studio's trash/artist/ keeps it; the library's Trash brings it back"));   // HERESY 1310
      }).catch(function (e) { toast(e.message, "bad"); });
    });
  }

  // ------------------------------------------------------------------ HERESY 1271: the stage
  // the run being painted develops here (its step at the stage's size); else the picture picked in the library (else the newest), its run
  // under it with its actions; a picked picture stays while a run paints until the next Draw
  function keptList(r) { return (r.pictures || []).filter(function (x) { return x.kept; }).map(function (x) { return { r: r, p: x }; }); }
  function selected() {
    var s = state.sel, found = null, newest = null;
    state.runs.forEach(function (r) {
      (r.pictures || []).forEach(function (p) {
        if (!p.kept) return;
        if (!newest) newest = { r: r, p: p };
        if (s && r.id === s.id && p.file === s.file) found = { r: r, p: p };
      });
      if (newest && newest.r === r) { var k = keptList(r); newest = k[k.length - 1]; }
    });
    return found || newest;
  }
  function pick(it, toggle) {
    if (!it || !it.p || !it.p.kept) return;
    // HERESY 1340 (Viktor 10.10.2026: «по повторному клику на миниатюру убрать её из средней колонки и вернуть текущую картинку в
    // проявке»): its thumbnail clicked again while the picture is on the stage and a run paints: the stage goes back to the run
    var s = state.sel;
    if (toggle && state.pinSel && drawingRun() && s && s.id === it.r.id && s.file === it.p.file) { state.pinSel = false; paintStage(); return; }
    state.sel = { id: it.r.id, file: it.p.file };
    state.pinSel = true;
    paintStage();
  }
  function stageList(it) {                               // what ‹ › walk over the page: the gallery as shown, else the picture's run
    var list = state.look === "gallery" ? items() : keptList(it.r), at = -1;
    list.forEach(function (x, k) { if (x.r.id === it.r.id && x.p.file === it.p.file) at = k; });
    return at < 0 ? { list: keptList(it.r), at: Math.max(0, keptList(it.r).map(function (x) { return x.p; }).indexOf(it.p)) } : { list: list, at: at };
  }
  function stageData(r, p, n) {
    var meta = [];
    if (p) meta.push(p.shape + " · " + p.w + "×" + p.h, tr("seed " + p.seed));   // HERESY 1339: one phrase each
    else meta.push((r.shapes || []).join(" · ") + (r.count > 1 ? " × " + r.count : ""), tr("seed " + r.seed + (r.count > 1 ? "…" + (r.seed + r.count - 1) : "")));
    meta.push(painterLabel(r) + (r.model ? " · " + String(r.model).replace(/\.(safetensors|pth)$/, "") : ""), when(r.created));   // HERESY 1318: its fine-tune; 1322: its upscaler
    if (r.took) meta.push(Math.round(r.took) + " s");
    if (r.sampling && Object.keys(r.sampling).length) {   // HERESY 1319; 1328: a run's lightning > 0 was Lightning on, 0 off
      var rs = Object.assign(sampDefaults(r.painter), r.sampling);
      if (r.sampling.lightning != null) rs.lightOn = +r.sampling.lightning > 0;
      meta.push(sampSay(r.painter, rs));
    }
    if (r.loras && r.loras.length) meta.push("LoRA " + r.loras.map(function (l) { return loraName(loraFind(l.id), l.id) + " " + (+l.weight).toFixed(2); }).join(", "));   // HERESY 1316
    if (r.ref) meta.push(tr("from a reference · " + (r.fit ? "painted around" : (+r.strength).toFixed(2)) + (r.masked ? " · masked" : "")));   // HERESY 1305–1307
    if (r.ref && r.place) meta.push(tr("placed on the canvas"));     // HERESY 1346
    if (r.gpu != null) meta.push("GPU " + r.gpu);
    // HERESY 1342 (Viktor: «Адаптивный offload на CPU можно предусмотреть в таких случаях?»): its painter streamed from RAM, and the card's peak
    if (r.streamed) meta.push(r.streamed.kept ? tr("streamed from RAM: " + r.streamed.kept + " of its " + r.streamed.of + " blocks on the card") : tr("streamed from RAM, block by block"));
    if (r.peak_gb) meta.push(tr("VRAM peak " + r.peak_gb + " GB"));
    if (n && r.kind !== "upscale") meta.push(tr("drawing " + n + " of " + r.of));
    var acts = "";
    if (p) {
      var take = state.take, square = p.shape === "1:1";
      acts =
        '<button type="button" class="btn ghost small" data-stage="form" data-tip="' + esc(tr("Its prompt, seed and shape back in the form")) + '">' + esc(tr("To the form")) + "</button>" +
        '<button type="button" class="btn ghost small" data-stage="ref" data-tip="' + esc(tr("Paint from this picture: it becomes the form's reference")) + '">' + esc(tr("As reference")) + "</button>" +   // HERESY 1305
        '<button type="button" class="btn ghost small" data-stage="compare" data-tip="' + esc(tr("Compare it with another: pick that one in the library, then a divider between them")) + '">' + esc(tr("Compare…")) + "</button>" +   // HERESY 1308
        (square ? '<button type="button" class="btn ghost small ar-cover" data-stage="cover"' + (take ? "" : " disabled") + ' data-tip="' +
          esc(take ? tr("This picture becomes the cover of") + " “" + (take.label || take.name) + "”" : tr("Pick a take on the right to give it this cover")) + '">' + esc(tr("Set as cover")) + "</button>" : "") +
        '<a class="ar-dl" aria-label="' + esc(tr("Download")) + '" data-tip="' + esc(tr("Download the picture (PNG, full size)")) + '" href="' + esc(fileUrl(r.id, p.file)) +
        '" download="' + esc("ruach-artist-" + r.id + "-" + p.file) + '">' + (window.HeresyIcons ? window.HeresyIcons.ui("download") : "⤓") + "</a>" +
        '<button type="button" class="btn ghost small" data-stage="view" data-tip="' + esc(tr("Over the whole page: ← → walk the pictures, Esc closes")) + '">' + esc(tr("Over the page")) + "</button>" +
        '<button type="button" class="pb-btn ar-vstar' + (p.star ? " is-on" : "") + '" data-stage="star" aria-pressed="' + (p.star ? "true" : "false") + '" aria-label="' + esc(tr("Star it")) + '">' + starIcon(p.star) + "</button>" +
        '<button type="button" class="btn ghost small ar-aside" data-stage="aside" data-tip="' + esc(tr("This picture to the trash: the library's Trash brings it back")) + '">' + esc(tr("Trash")) + "</button>" +   // HERESY 1321
        '<button type="button" class="btn ghost small' + (state.upOpen ? " is-on" : "") + '" data-stage="upscale" data-tip="' + esc(tr("Make it 2K or 4K (its long side 2560 or 3840) with an upscaler from artwork/upscalers/ (ESRGAN, DAT, HAT, SPAN…): a run of its own")) + '">' + esc(tr("Upscale…")) + "</button>" +
        (state.upOpen ? upRow(p) : "");   // HERESY 1322; 1332: by the picture's size
    }
    // HERESY 1345 (Viktor: «фрейм с промптом убрать в массивный, но не мешающий тултип > вправо от картинки поверх правой колонки — при
    // наведении мышью на картинку… Инфу по самой генерации тоже в этот же тултип»): the buttons under the picture, the data and the prompt
    // a tip beside it (app.css shows it while the pointer is on the picture; on a narrow window it stays under it)
    return (acts ? '<div class="ar-stage-acts">' + acts + "</div>" : "") +
      '<div class="ar-stage-data ar-stage-tip" role="tooltip"><div class="ar-stage-meta" translate="no">' + meta.filter(Boolean).map(function (m) { return "<span>" + esc(m) + "</span>"; }).join("") + "</div>" +
      '<div class="ar-stage-prompt" translate="no">' + esc(r.prompt || "") + "</div></div>";
  }
  // HERESY 1340: the window's height under the sticking columns as the room scrolls now: the form scrolls in it, the stage fills it
  var AR_FIXED_H = 920;                                  // HERESY 1344: the window's height from which the room stands still
  function paintAvail() {
    var cols = $("arCols"), view = $("view-artist"), bar = $("playbar");
    if (!cols) return;
    var stuck = Math.max(cols.getBoundingClientRect().top, (view ? view.getBoundingClientRect().top : 0) + 8), under = bar ? bar.getBoundingClientRect().height : 0;
    // HERESY 1344 (Viktor: «зафиксировать прокрутку страницы, если vh имеет как минимум 920px»): the room whole in the window, each column
    // scrolling on its own, when the columns stand side by side and the window is 920 px tall or more
    var fixed = !!view && window.innerWidth > 1280 && window.innerHeight >= AR_FIXED_H;
    if (view && view.classList.contains("ar-fixed") !== fixed) view.classList.toggle("ar-fixed", fixed);
    if (fixed && view.scrollTop) { view.scrollTop = 0; stuck = Math.max(cols.getBoundingClientRect().top, view.getBoundingClientRect().top + 8); }
    cols.style.setProperty("--ar-avail", Math.max(240, Math.floor(window.innerHeight - stuck - under - 12)) + "px");
    // HERESY 1345b: the log folded on the left side lies over the form's foot (Draw's row): the form ends above it
    var dock = $("logDock"), foot = dock && dock.classList.contains("is-left") && dock.classList.contains("is-folded") && !dock.hidden ? Math.ceil(dock.getBoundingClientRect().height) + 10 : 0;
    cols.style.setProperty("--ar-foot", foot + "px");
  }
  function fitStage() {
    var b = document.querySelector("#arStage .ar-stage-pic"), box = $("arStage");
    if (box && box.clientWidth) {                       // HERESY 1340: tall while it sticks (the columns side by side)
      paintAvail();
      box.classList.toggle("is-tall", getComputedStyle(box).position === "sticky");
    }
    if (!b || !box || !box.clientWidth) return;
    // HERESY 1312 (Viktor's screenshot 10.10.2026: the buttons under the picture fell under the player with his three-line prompt on 2K;
    // «330» was a guess): the window's height under the stage's top (its place in the room unscrolled while it sticks, the room's top
    // when the columns stack), over the player, less the stage's own lines and buttons
    var view = $("view-artist"), cols = $("arCols"), tip = box.querySelector(".ar-stage-tip"), bar = $("playbar");
    var top = getComputedStyle(box).position === "sticky" && cols ? cols.getBoundingClientRect().top + (view ? view.scrollTop : 0)
      : (view ? view.getBoundingClientRect().top : 0) + 8;
    // HERESY 1345: under the picture its buttons only; the data and the prompt a tip beside it (under it on a narrow window, in the flow)
    var under = bar ? bar.getBoundingClientRect().height : 0, below = tip && getComputedStyle(tip).position !== "absolute" ? tip.offsetHeight + 10 : 0;
    // HERESY 1317 (Viktor 10.10.2026: «Блок проявления картинки зафиксируй также вертикально»): the row of buttons a finished picture
    // has is reserved while one paints, so the frame keeps its size from the queue to the picture
    var acts = box.querySelector(".ar-stage-acts");
    if (acts) state.actsH = acts.offsetHeight + 10;
    below += acts ? acts.offsetHeight + 10 : (tip ? state.actsH || 41 : 0);
    var tall = box.classList.contains("is-tall") && box.clientHeight > 300;   // HERESY 1340, 1345: the stage's own height, the picture all of it but its buttons
    var w = +b.dataset.w || 1, h = +b.dataset.h || 1, maxH = Math.max(240, tall ? box.clientHeight - below - 2 : window.innerHeight - top - under - below - 12), k = Math.min(box.clientWidth / w, maxH / h);
    b.style.width = Math.floor(w * k) + "px";
    b.style.height = Math.floor(h * k) + "px";
  }
  function paintStage() {
    var box = $("arStage");
    if (!box) return;
    var run = drawingRun(), it = (!run || state.pinSel) ? selected() : null, key, html;
    if (run && !state.pinSel) {
      var n = (run.pictures || []).length + 1, step = run.status === "running" && run.live && run.live.live === n ? run.live : null;
      var sh = shapeOf((run.shapes || ["1:1"])[(n - 1) % (run.shapes || ["1:1"]).length]);
      key = "live:" + run.id + ":" + run.status + ":" + n + ":" + (step ? step.step : 0) + ":" + (run.waiting || "");
      html = run.status === "running"
        ? '<div class="ar-stage-pic is-live" data-w="' + sh.w + '" data-h="' + sh.h + '">' + (step ? '<img alt="" draggable="false" src="' + esc(fileUrl(run.id, step.file) + "&v=" + step.step) + '" />' +
          '<span class="ar-stepno">' + step.step + " / " + step.of + "</span>" : '<div class="ar-stage-empty">' + esc(tr(run.kind === "upscale" ? "upscaling…" : "painting…")) + "</div>") + "</div>" + stageData(run, null, n)
        : '<div class="ar-stage-pic is-live" data-w="' + sh.w + '" data-h="' + sh.h + '"><div class="ar-stage-empty">' + esc(tr(run.waiting ? "waits for a card" : "in the queue")) + "</div></div>" + stageData(run, null, 0);   // HERESY 1317: the frame from the start
    } else if (it) {
      var s2 = shapeOf(it.p.shape), take = state.take;
      key = "pic:" + it.r.id + ":" + it.p.file + ":" + (it.p.star ? 1 : 0) + ":" + (take ? take.name : "");
      html = '<button type="button" class="ar-stage-pic" data-stage="view" data-w="' + (it.p.w || s2.w) + '" data-h="' + (it.p.h || s2.h) + '" aria-label="' + esc(tr("Look at it over the page")) + '">' +
        '<img alt="" draggable="false" /></button>' + stageData(it.r, it.p, 0);
    } else {
      key = "empty";
      html = '<div class="ar-stage-empty">' + esc(tr("The picture picked in the library shows here, with its run; a run being painted develops here.")) + "</div>";
    }
    Array.prototype.forEach.call(document.querySelectorAll("#arRuns .ar-thumb.is-sel"), function (x) { x.classList.remove("is-sel"); });
    if (it) markPicked(it);
    paintProgress();                                     // HERESY 1332
    if (key === state.stageKey) return fitStage();
    state.stageKey = key;
    ($("arStageIn") || box).innerHTML = html;               // HERESY 1345: the progress over it stays
    if (it) {                                            // the thumb at once, the full picture when it has come (1263's way)
      var img = box.querySelector(".ar-stage-pic img"), pic = box.querySelector(".ar-stage-pic"), full = fileUrl(it.r.id, it.p.file), small = it.p.thumb ? fileUrl(it.r.id, it.p.thumb) : "";
      var tok = state.stageLoads = (state.stageLoads || 0) + 1, pre = new Image();
      pic.classList.toggle("is-loading", !!small);
      img.src = small || full;
      pre.onload = function () { if (tok !== state.stageLoads) return; img.src = full; pic.classList.remove("is-loading"); };
      pre.onerror = function () { if (tok === state.stageLoads) pic.classList.remove("is-loading"); };
      pre.src = full;
    }
    fitStage();
  }
  // HERESY 1332 (Viktor: «В самый низ колонки можно приделать прогресс бар генерации»): the run under way under Draw: the pictures done
  // and the step of the one painting; waiting, a striped bar and why
  function paintProgress() {
    var box = $("arProgress");
    if (!box) return;
    var run = drawingRun();
    if (!run) { box.hidden = true; return; }
    box.hidden = false;
    var of = run.of || 1, done = (run.pictures || []).length, live = run.status === "running" && run.live ? run.live : null;
    var frac = run.status === "running" ? Math.min(1, (done + (live && live.of ? live.step / live.of : 0)) / of) : 0;
    box.classList.toggle("is-waiting", run.status !== "running");
    box.querySelector("i").style.width = (run.status === "running" ? Math.round(frac * 100) : 100) + "%";
    $("arProgressSay").textContent = run.status === "running"
      ? tr((run.kind === "upscale" ? "upscaling…" : "picture " + Math.min(of, done + 1) + " of " + of + (live && live.of ? " · step " + live.step + " / " + live.of : "")) + " · " + Math.round(frac * 100) + "%")
      : tr(run.waiting ? "waits for a card" : "in the queue");
  }
  // HERESY 1336 (Viktor: «По максимуму на картинки контекстное меню»): a picture's menu, a right click on it in the room or over the page
  function picAt(el) {
    if (!el || !el.closest) return null;
    var vw = el.closest(".ar-view");                     // over the page: the picture it shows now
    if (vw) return el.closest(".art-img") && !vw.classList.contains("is-leaving") ? vw.heresyIt || null : null;
    var g = el.closest("#arRuns .ar-gpic[data-g]");
    if (g) return items()[+g.dataset.g] || null;
    var fig = el.closest("#arRuns .ar-pic[data-i]"), run = fig && runOf(fig);
    if (run) { var p = run.pictures[+fig.dataset.i]; return p && p.kept ? { r: run, p: p } : null; }
    var sp = el.closest("#arStage .ar-stage-pic");       // the stage: the picture it shows, not a run's step as it develops
    if (sp) return sp.classList.contains("is-live") ? null : selected();
    return null;
  }
  function copyText(text, said) {                        // over plain http app.js stands ruachCopyText in for navigator.clipboard
    navigator.clipboard.writeText(String(text)).then(function () { toast(said); }, function () { toast(tr("The browser refused clipboard access"), "bad"); });
  }
  function upModel(list) {                               // the upscaler the row under the stage would take: the one picked there last
    var names = (list || []).map(function (u) { return u.name; }), want = recall("yue2.arUpModel");
    return names.indexOf(want) >= 0 ? want : names.indexOf("4x_Nomos8kDAT.pth") >= 0 ? "4x_Nomos8kDAT.pth" : names[0];
  }
  function picMenu(it, x, y, vw) {
    if (!it || !it.r || !it.p || !window.HeresyMenu) return false;
    var r = it.r, p = it.p, take = state.take, square = p.shape === "1:1", long = Math.max(+p.w || 0, +p.h || 0);
    var room = function (fn) { return function () { if (vw && state.view) state.view.close(); fn(); }; };   // what lands in the room leaves the view over the page
    var up = function (t) {
      var sz = upSize(p, t), done = long >= UP_TARGETS[t], m = state.upscalers && upModel(state.upscalers);
      return { label: t.toUpperCase() + (sz ? " · " + sz[0] + "×" + sz[1] : ""), raw: true, disabled: done,
        hint: done ? tr("It is as large already") : m ? tr("With " + m.replace(/\.(pth|safetensors)$/, "") + ": the upscaler picked under the stage") : tr("With the upscaler picked under the stage"),
        action: function () {
          loadUpscalers().then(function (list) {
            var mm = upModel(list);
            if (!mm) return toast(tr("No upscaler here: put .pth or .safetensors models (4x_… from OpenModelDB or Civitai) into artwork/upscalers/"), "bad");
            upscaleIt({ id: r.id, file: p.file }, mm, t);
          });
        } };
    };
    var picked = !!state.picked[pickKey(it)], menu = [];
    if (!vw) menu.push({ label: tr("Over the page"), action: function () { var w = stageList(it); view(w.list, w.at); } });
    menu.push(
      { label: tr("To the stage"), action: room(function () { pick(it); }) },
      { label: tr("To the form"), hint: tr("Its prompt, seed and shape back in the form"), action: room(function () {
        fillForm({ prompt: r.prompt, shapes: [p.shape], count: 1, seed: p.seed, painter: r.kind === "upscale" ? null : r.painter }, true); $("arPrompt").focus(); toast(tr("In the form: its prompt, seed and shape")); }) },
      { label: tr("All of it to the form"), disabled: r.kind === "upscale", hint: tr("Its painter, fine-tune, sampling and adapters as well, with its seed and shape: Draw paints this picture again"), action: room(function () {
        fillForm(Object.assign({}, r, { shapes: [p.shape], count: 1, seed: p.seed }), true); $("arPrompt").focus(); toast(tr("In the form: all of it, with its seed and shape")); }) },
      { label: tr("As reference"), hint: tr("Draw paints from this picture: it becomes the form's reference"), action: room(function () { setRef({ id: r.id, file: p.file, url: fileUrl(r.id, p.thumb || p.file) }); }) },
      { label: tr("Compare…"), hint: tr("Then pick the other picture in the library"), action: room(function () { comparePick(it); }) },
      { label: tr("Set as cover"), disabled: !(square && take), hint: !square ? tr("A square picture becomes a cover") : take ? tr("This picture becomes the cover of “" + (take.label || take.name) + "”") : tr("Pick a take on the right to give it this cover"),
        action: function () { cover(r, p); } },
      { label: tr("Upscale"), items: [up("2k"), up("4k")] },
      { sep: true },
      { label: p.star ? tr("Unstar") : tr("Star it"), action: function () { var b = vw && vw.querySelector(".ar-vstar"); if (b) b.click(); else star(r, p, !p.star); } },
      { label: picked ? tr("Let go") : tr("Pick it"), hint: tr("The picked are starred or put in the trash together from the bar over the library"), action: function () { togglePick(it, false, items()); } },
      { label: tr("Copy the prompt"), disabled: !r.prompt, action: function () { copyText(r.prompt || "", tr("The prompt copied")); } },
      { label: tr("Copy the seed") + " · " + p.seed, raw: true, action: function () { copyText(p.seed, tr("The seed copied: " + p.seed)); } },
      { label: tr("Download") + " · PNG" + (p.w && p.h ? " " + p.w + "×" + p.h : ""), raw: true, action: function () {
        var a = document.createElement("a"); a.href = fileUrl(r.id, p.file); a.download = "ruach-artist-" + r.id + "-" + p.file; document.body.appendChild(a); a.click(); a.remove(); } },
      { label: tr("The file in a new tab"), action: function () { window.open(fileUrl(r.id, p.file), "_blank", "noopener"); } },
      { label: tr("Its run"), hint: tr("The run it came from, in the Runs look"), action: room(function () {
        if (state.look !== "runs") { var b = document.querySelector('#arBar [data-look="runs"]'); if (b) b.click(); }
        setTimeout(function () {
          var card = document.querySelector('#arRuns .ar-run[data-id="' + r.id + '"]');
          if (!card) return;
          card.scrollIntoView({ block: "center" }); card.classList.add("is-flash"); setTimeout(function () { card.classList.remove("is-flash"); }, 1200);
        }, 80); }) },
      { sep: true },
      { label: tr("To the trash"), danger: true, hint: tr("The library's Trash brings it back"), action: room(function () { asidePics([{ id: r.id, file: p.file }]); }) });
    window.HeresyMenu.open(x, y, menu);
    return true;
  }
  document.addEventListener("contextmenu", function (e) {
    if (!e.target.closest || !e.target.closest("#view-artist, .ar-view")) return;
    var it = picAt(e.target);
    if (it && picMenu(it, e.clientX, e.clientY, e.target.closest(".ar-view"))) e.preventDefault();
  });
  window.ruachArtistPicMenu = function (el, x, y) { return picMenu(picAt(el), x, y, el && el.closest ? el.closest(".ar-view") : null); };   // for the checks
  function markPicked(it) {
    if (state.look === "gallery") {
      var list = items();
      list.forEach(function (x, k) { if (x.r.id === it.r.id && x.p.file === it.p.file) { var b = document.querySelector('#arRuns .ar-gpic[data-g="' + k + '"] .ar-thumb'); if (b) b.classList.add("is-sel"); } });
    } else {
      var fig = document.querySelector('#arRuns .ar-run[data-id="' + it.r.id + '"] .ar-pic[data-i="' + it.r.pictures.indexOf(it.p) + '"] .ar-thumb');
      if (fig) fig.classList.add("is-sel");
    }
  }
  function stageAct(e) {
    var b = e.target.closest("[data-stage]");
    if (!b || b.disabled) return;
    var it = selected();
    if (!it) return;
    var act = b.dataset.stage;
    if (act === "view") { var w = stageList(it); view(w.list, w.at); }
    else if (act === "star") star(it.r, it.p, !it.p.star);
    else if (act === "cover") cover(it.r, it.p);
    else if (act === "form") { fillForm({ prompt: it.r.prompt, shapes: [it.p.shape], count: 1, seed: it.p.seed, painter: it.r.kind === "upscale" ? null : it.r.painter }, true); $("arPrompt").focus(); toast(tr("In the form: its prompt, seed and shape")); }
    else if (act === "ref") setRef({ id: it.r.id, file: it.p.file, url: fileUrl(it.r.id, it.p.thumb || it.p.file) });   // HERESY 1305
    else if (act === "compare") comparePick(it);                                                                         // HERESY 1308
    else if (act === "aside") asidePics([{ id: it.r.id, file: it.p.file }]);                                           // HERESY 1321
    else if (act === "upscale") { state.upOpen = !state.upOpen; if (state.upOpen) loadUpscalers(); state.stageKey = ""; paintStage(); }   // HERESY 1322
  }
  document.addEventListener("click", function (e) {      // HERESY 1322: ×2 and ×4 in the stage's row
    var b = e.target.closest("#arStage [data-up]");
    if (!b) return;
    var it = selected(), sel = $("arUpModel");
    if (it && sel && !b.disabled) upscaleIt({ id: it.r.id, file: it.p.file }, sel.value, b.dataset.up);
  });
  function edges() {                                     // the two edges: dragged, ← →, Home or a double click; the widths kept
    var cols = $("arCols");
    if (!cols) return;
    var E = { l: { key: "yue2.arL", min: 280, max: 640, def: 380, col: ".ar-left", prop: "--ar-l", sign: 1 },
              r: { key: "yue2.arR", min: 300, max: 900, def: 560, col: ".ar-right", prop: "--ar-r", sign: -1 } };
    Object.keys(E).forEach(function (s) {
      var e = E[s], rz = $(s === "l" ? "arEdgeL" : "arEdgeR"), col = cols.querySelector(e.col);
      if (!rz || !col) return;
      function setW(w) { w = Math.max(e.min, Math.min(e.max, Math.round(w))); cols.style.setProperty(e.prop, w + "px"); rz.setAttribute("aria-valuenow", String(w)); fitStage(); return w; }
      rz.setAttribute("aria-valuemin", String(e.min)); rz.setAttribute("aria-valuemax", String(e.max));
      setW(parseInt(recall(e.key), 10) || e.def);
      rz.addEventListener("pointerdown", function (ev) {
        if (ev.button !== 0) return;
        ev.preventDefault();
        rz.setPointerCapture(ev.pointerId);
        rz.classList.add("is-drag"); document.body.classList.add("is-resizing");
        var x0 = ev.clientX, w0 = col.getBoundingClientRect().width;
        function move(m) { setW(w0 + e.sign * (m.clientX - x0)); }
        function up() {
          rz.classList.remove("is-drag"); document.body.classList.remove("is-resizing");
          rz.removeEventListener("pointermove", move); rz.removeEventListener("pointerup", up); rz.removeEventListener("pointercancel", up);
          keep(e.key, String(Math.round(col.getBoundingClientRect().width)));
        }
        rz.addEventListener("pointermove", move); rz.addEventListener("pointerup", up); rz.addEventListener("pointercancel", up);
      });
      rz.addEventListener("dblclick", function () { keep(e.key, null); setW(e.def); });
      rz.addEventListener("keydown", function (k) {
        if (k.key === "ArrowLeft" || k.key === "ArrowRight") { k.preventDefault(); k.stopPropagation(); keep(e.key, String(setW(col.getBoundingClientRect().width + e.sign * (k.key === "ArrowRight" ? 16 : -16)))); }
        else if (k.key === "Home") { k.preventDefault(); k.stopPropagation(); keep(e.key, null); setW(e.def); }
      });
    });
  }

  // ------------------------------------------------------------------ a picture over the page
  function view(list, i) {                           // list: [{r, p}], the run's or the gallery's
    if (!list.length) return;
    if (state.view) state.view.close(true);
    var back = document.createElement("div"), before = document.activeElement;
    back.className = "hd-back art-back ar-view";
    back.innerHTML = '<figure class="art-fig" role="dialog" aria-modal="true" aria-label="' + esc(tr("The picture")) + '" tabindex="-1">' +
      '<img class="art-img" alt="" draggable="false" />' +
      '<figcaption class="art-cap"><span class="art-title" translate="no"></span><span class="art-count"></span>' +
      '<button type="button" class="pb-btn ar-vstar" aria-label="' + esc(tr("Star it")) + '"></button>' +
      '<button type="button" class="btn small ghost ar-vform" data-tip="' + esc(tr("Its prompt, seed and shape back in the form")) + '">' + esc(tr("To the form")) + "</button>" +
      '<button type="button" class="btn small ar-cover" data-act="cover"></button>' +
      '<a class="pb-btn art-dl" aria-label="' + esc(tr("Download the picture")) + '" data-tip="' + esc(tr("Download the picture (PNG, full size)")) + '">' +
        (window.HeresyIcons ? window.HeresyIcons.ui("download") : "⤓") + "</a>" +
      '<button type="button" class="pb-btn art-close" aria-label="' + esc(tr("Close")) + '" data-tip="' + esc(tr("Close (Esc)")) + '">✕</button></figcaption></figure>' +
      '<button type="button" class="art-step art-prev" aria-label="' + esc(tr("Previous")) + '" data-tip="' + esc(tr("Previous (←)")) + '">‹</button>' +
      '<button type="button" class="art-step art-next" aria-label="' + esc(tr("Next")) + '" data-tip="' + esc(tr("Next (→)")) + '">›</button>';
    document.body.appendChild(back);
    i = Math.max(0, Math.min(list.length - 1, i || 0));
    var loads = 0, coming = null;                       // coming: the full picture on its way
    // HERESY 1263 (Viktor 09.10.2026: «листалка картинок у Артиста не работает. < и > не меняют картинку но описаловка меняется»):
    // through a slow link (Forge over a VPN) a full PNG of 2 or 3 MB takes seconds, and the browser goes on showing the picture before
    // until the new one has come, under the new caption. A step now shows the new picture's thumb at once (the gallery has it
    // already), drawn at the size the full one takes, and the full one in its place when it has come; one that cannot come says so
    function fit(img, p) {
      img.style.width = img.style.height = "";
      var cs = getComputedStyle(img), mw = parseFloat(cs.maxWidth) || innerWidth - 140, mh = parseFloat(cs.maxHeight) || innerHeight - 156;
      var k = Math.min(mw / p.w, mh / p.h, 1);
      img.style.width = Math.round(p.w * k) + "px";
      img.style.height = Math.round(p.h * k) + "px";
    }
    function resized() { fit(back.querySelector(".art-img"), list[i].p); }
    window.addEventListener("resize", resized);
    function paint() {
      var r = list[i].r, p = list[i].p, sh = shapeOf(p.shape), take = state.take, b = back.querySelector(".ar-cover");
      back.heresyIt = list[i];                           // HERESY 1336: the picture's menu over the page
      var st = back.querySelector(".ar-vstar");
      st.textContent = p.star ? "★" : "☆";
      st.classList.toggle("is-on", !!p.star);
      st.dataset.tip = p.star ? tr("Starred: ☆ takes the star off") : tr("Star it: the gallery's ★ shows the starred");
      var img = back.querySelector(".art-img"), full = fileUrl(r.id, p.file), small = p.thumb ? fileUrl(r.id, p.thumb) : "";
      if (coming) { coming.onload = coming.onerror = null; coming.src = ""; }   // the step before's full picture: let go
      var tok = ++loads, pre = coming = new Image();
      back.style.setProperty("--ar", sh.w + "/" + sh.h);
      fit(img, p);
      img.classList.remove("is-broken");
      img.classList.toggle("is-loading", !!small);
      img.src = small || full;
      pre.onload = function () { if (tok !== loads) return; img.src = full; img.classList.remove("is-loading"); };
      pre.onerror = function () { if (tok !== loads) return; img.classList.remove("is-loading"); img.classList.add("is-broken"); };
      pre.src = full;
      back.querySelector(".art-title").textContent = sh.id + " · " + p.w + "×" + p.h + " · " + tr("seed") + " " + p.seed;
      back.querySelector(".art-count").textContent = list.length > 1 ? (i + 1) + " / " + list.length : "";
      var dl = back.querySelector(".art-dl");
      dl.href = fileUrl(r.id, p.file);
      dl.setAttribute("download", "ruach-artist-" + r.id + "-" + p.file);
      b.textContent = tr("Set as cover");
      b.disabled = !(take && p.shape === "1:1");
      b.dataset.tip = !take ? tr("Pick a take on the right to give it this cover") : p.shape !== "1:1" ? tr("A cover is square: this one is for a video or a short") :
        tr("This picture becomes the cover of") + " “" + (take.label || take.name) + "”";
      Array.prototype.forEach.call(back.querySelectorAll(".art-step"), function (s) { s.hidden = list.length < 2; });
    }
    function close(now) {
      document.removeEventListener("keydown", key, true);
      window.removeEventListener("resize", resized);
      loads++;                                           // a picture still coming lands nowhere
      if (coming) { coming.onload = coming.onerror = null; coming.src = ""; }
      state.view = null;
      back.classList.add("is-leaving");
      setTimeout(function () { back.remove(); }, now ? 0 : 120);
      if (before && before.focus) { try { before.focus({ preventScroll: true }); } catch (e) { /* gone */ } }
    }
    function step(d) { i = (i + d + list.length) % list.length; paint(); }
    function key(e) {
      if (document.querySelector(".hm-menu")) return;    // HERESY 1336: a picture's menu over it has the keys while it is open
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
      else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && !e.ctrlKey && !e.altKey) { e.preventDefault(); e.stopPropagation(); if (list.length > 1) step(e.key === "ArrowRight" ? 1 : -1); }
    }
    document.addEventListener("keydown", key, true);
    back.addEventListener("click", function (e) {
      if (e.target === back || e.target.closest(".art-close")) return close();
      if (e.target.closest(".art-prev")) return step(-1);
      if (e.target.closest(".art-next")) return step(1);
      if (e.target.closest(".ar-cover")) { var it = list[i]; close(); cover(it.r, it.p); }
      if (e.target.closest(".ar-vstar")) { var s0 = list[i]; star(s0.r, s0.p, !s0.p.star).then(paint); }
      if (e.target.closest(".ar-vform")) { var f0 = list[i]; close(); fillForm({ prompt: f0.r.prompt, shapes: [f0.p.shape], count: 1, seed: f0.p.seed, painter: f0.r.painter }, true); $("arPrompt").focus(); toast(tr("In the form: its prompt, seed and shape")); }
    });
    state.view = { close: close };
    paint();
    requestAnimationFrame(function () { back.classList.add("is-on"); back.querySelector(".art-fig").focus({ preventScroll: true }); });
  }

  // ------------------------------------------------------------------ wiring
  // HERESY 1316 (Viktor 10.10.2026: «Положил в artwork/loras/<семейство>/»; «скан поддиректорий»; «возле адаптера лежит его картинка»;
  // «сканирование Civitai по хешу»; «Адаптеры пользователи пусть себе тянут по твоему Гайду прямо в комнате»): the adapters of the
  // painter's family, each at its strength, up to four, kept per family in this browser; the library to pick them from
  var FAMILY = { "krea2-q4": "krea2", "krea2-q8": "krea2", "qwen21": "qwen-image-2.1", "qwen2512-q4": "qwen-image-2512", "qwen2512-q6": "qwen-image-2512", "qwen2512-fp8": "qwen-image-2512" };
  var LORA_MAX = 4;
  KEY.loras = "yue2.arLoras";
  function familyNow() { return FAMILY[$("arPainter").value] || ""; }
  function lorasAll() { try { var a = JSON.parse(recall(KEY.loras) || "{}"); return a && typeof a === "object" ? a : {}; } catch (e) { return {}; } }
  function lorasNow() { return (lorasAll()[familyNow()] || []).slice(0, LORA_MAX); }
  function setLoras(list, fam) { var all = lorasAll(); all[fam || familyNow()] = (list || []).slice(0, LORA_MAX); keep(KEY.loras, JSON.stringify(all)); paintLoras(); }
  function loraPic(id, w) { return "/lab/artist/lora-picture?id=" + encodeURIComponent(id) + (w ? "&w=" + w : ""); }
  function loraRows(fam) { return (state.loraLib && state.loraLib.families && state.loraLib.families[fam]) || []; }
  function loraFind(id) { return loraRows(String(id).split("/")[0]).filter(function (r) { return r.id === id; })[0] || null; }
  function loraName(e, id) { var info = (e && e.info) || {}; return info.title || (e ? e.name : String(id).split("/").pop().replace(/\.safetensors$/, "")); }
  function loadLoras() { return api("/artist/loras").then(function (d) { state.loraLib = d; paintLoras(); return d; }).catch(function () { paintLoras(); }); }
  function paintLoras() {
    var box = $("arLoraList"), list = lorasNow(), fam = familyNow();
    if (!box) return;
    var titles = (state.loraLib && state.loraLib.titles) || {}, have = state.loraLib ? loraRows(fam).length : null;
    $("arLoraSay").textContent = list.length ? list.length + " / " + LORA_MAX : have === 0 ? tr("none here for " + (titles[fam] || fam)) : have ? tr(have + " here") : "";
    $("arLoraAdd").disabled = !fam;
    box.innerHTML = list.map(function (l, i) {
      var e = loraFind(l.id), words = ((e && e.info && e.info.words) || []).slice(0, 4);
      return '<div class="ar-lora' + (l.muted ? " is-muted" : "") + '" data-li="' + i + '">' +   // HERESY 1341: muted, dimmed
        (e && e.picture ? '<img class="ar-lora-pic" alt="" loading="lazy" draggable="false" src="' + esc(loraPic(l.id, 96)) + '" />' : '<span class="ar-lora-pic"></span>') +
        '<span class="ar-lora-name" translate="no" title="' + esc(l.id) + '">' + esc(loraName(e, l.id)) +
        (l.muted ? '<span class="lora-muted-tag" data-tip="' + esc(tr("Right-click: back in the run")) + '">' + esc(tr("muted")) + "</span>" : "") + "</span>" +   // HERESY 1341
        '<button type="button" class="pb-btn ar-lora-x" data-lx="' + i + '" aria-label="' + esc(tr("Take it off")) + '">\u2715</button>' +
        '<span class="ar-lora-slide"><input type="range" class="ar-lora-w" min="0" max="1.5" step="0.05" value="' + (+l.weight).toFixed(2) + '" aria-label="' + esc(tr("Its strength")) + '" />' +
        '<span class="ar-lora-wv mono">' + (+l.weight).toFixed(2) + "</span></span>" +
        (words.length ? '<span class="ar-lora-words">' + words.map(function (w) {
          return '<button type="button" class="ar-lora-word" data-word="' + esc(w) + '" data-tip="' + esc(tr("Into the prompt:") + " " + w) + '" translate="no">' + esc(w) + "</button>"; }).join("") + "</span>" : "") +
        (state.loraLib && !e ? '<span class="ar-lora-gone">' + esc(tr("not in artwork/loras/ any more")) + "</span>" : "") + "</div>";
    }).join("") + loraTotalBar(list);                     // HERESY 1335
  }
  // HERESY 1335: the adapters' strengths together, zoned; dragged, all of them in proportion
  var LORA_TOTAL = { safe: 1.2, limit: 1.8, max: 4 };
  function loraSum(list) { return (list || []).reduce(function (s, l) { return s + (l.muted ? 0 : +l.weight || 0); }, 0); }   // HERESY 1341: a muted one out
  function loraZone(t) { return t > LORA_TOTAL.limit + 1e-9 ? "is-red" : t > LORA_TOTAL.safe + 1e-9 ? "is-amber" : "is-green"; }
  function loraTotalBar(list) {
    if ((list || []).filter(function (l) { return !l.muted; }).length < 2) return "";   // HERESY 1341: two in the run
    var t = loraSum(list), z = LORA_TOTAL;
    return '<label class="lora-total ar-lora-total ' + loraZone(t) + '" data-tip="' + esc(tr("All the adapters' strengths together: stacked, they add up, and past about " + z.limit +   // HERESY 1339: one sentence
      " the picture burns (its colours and edges overdone), however modest each one is. Green to " + z.safe + ", amber to " + z.limit + ", red past it. Drag it to move them all at once, each in proportion.")) + '">' +
      "<span>" + esc(tr("Together")) + "</span>" +
      '<input type="range" class="zoned ar-lora-tw" style="--z1:' + (100 * z.safe / z.max).toFixed(1) + "%;--z2:" + (100 * z.limit / z.max).toFixed(1) + '%" min="0" max="' + z.max + '" step="0.05" value="' + t.toFixed(2) + '" aria-label="' + esc(tr("All together")) + '" />' +
      "<output>" + t.toFixed(2) + "</output></label>";
  }
  function loraTotalPaint(list) {
    var bar = document.querySelector("#arLoraList .ar-lora-total");
    if (!bar) return;
    var t = loraSum(list);
    bar.className = "lora-total ar-lora-total " + loraZone(t);
    bar.querySelector("output").textContent = t.toFixed(2);
    if (!state.loraTotalDrag) bar.querySelector("input").value = t.toFixed(2);
  }
  function loraToggle(id) {
    var list = lorasNow(), at = list.map(function (l) { return l.id; }).indexOf(id);
    if (at >= 0) { list.splice(at, 1); setLoras(list); return false; }
    if (list.length >= LORA_MAX) { toast(tr("Four adapters at most: take one off first"), "bad"); return false; }
    list.push({ id: id, weight: 0.8 });
    setLoras(list);
    return true;
  }
  function wordIntoPrompt(w) {
    var p = $("arPrompt"), v = p.value.trim();
    if (v.toLowerCase().indexOf(w.toLowerCase()) >= 0) return toast(tr("Already in the prompt: " + w));
    p.value = v ? v + (/[,.;:]$/.test(v) ? " " : ", ") + w : w;
    keepForm(); paintForm();
  }
  function openLoraLib() {
    var fam = familyNow();
    if (!fam) return;
    var titles = (state.loraLib && state.loraLib.titles) || {}, folder = "*", query = "", looking = false;
    var back = document.createElement("div");
    back.className = "ar-lib-back";
    back.setAttribute("role", "dialog");
    back.setAttribute("aria-label", tr("The adapters for " + (titles[fam] || fam)));
    back.innerHTML = '<div class="ar-lib"><div class="ar-lib-head"><b>' + esc(tr("LoRA for " + (titles[fam] || fam))) + "</b>" +
      '<input type="search" class="ar-lib-q" placeholder="' + esc(tr("Search: name, words")) + '" aria-label="' + esc(tr("Search")) + '" />' +
      '<span class="row-hint ar-lib-say"></span><span class="spacer"></span>' +
      '<button type="button" class="btn ghost small" data-lib="civitai" data-tip="' + esc(tr("Each adapter not yet known looked up on civitai.com by its SHA-256 alone: its name, its base model and its trigger words kept beside it (NAME.civitai.info), with its first picture rated safe when it has none")) + '">' + esc(tr("Look up on Civitai")) + "</button>" +
      '<button type="button" class="btn primary small" data-lib="close">' + esc(tr("Done")) + "</button></div>" +
      '<div class="ar-lib-body"><nav class="ar-lib-folders" aria-label="' + esc(tr("Folders")) + '"></nav><div class="ar-lib-grid"></div></div></div>';
    document.body.appendChild(back);
    var grid = back.querySelector(".ar-lib-grid"), nav = back.querySelector(".ar-lib-folders"), say = back.querySelector(".ar-lib-say");
    function shown() {
      var q = query.toLowerCase();
      return loraRows(fam).filter(function (r) {
        if (folder !== "*" && r.folder !== folder) return false;
        if (!q) return true;
        var info = r.info || {};
        return (r.name + " " + (info.title || "") + " " + (info.words || []).join(" ") + " " + r.folder).toLowerCase().indexOf(q) >= 0;
      });
    }
    function paintLib() {
      var rows = loraRows(fam), chosen = lorasNow().map(function (l) { return l.id; }), folders = {};
      rows.forEach(function (r) { folders[r.folder] = (folders[r.folder] || 0) + 1; });
      nav.innerHTML = '<button type="button" class="ar-lib-f' + (folder === "*" ? " is-on" : "") + '" data-folder="*">' + esc(tr("All")) + " <em>" + rows.length + "</em></button>" +
        Object.keys(folders).sort().map(function (f) {
          return '<button type="button" class="ar-lib-f' + (folder === f ? " is-on" : "") + '" data-folder="' + esc(f) + '" translate="no">' + esc(f || tr("(the family's own folder)")) + " <em>" + folders[f] + "</em></button>";
        }).join("");
      var list = shown();
      if (!rows.length) {
        grid.innerHTML = '<div class="ar-lib-empty"><p>' + esc(tr("No adapters for " + (titles[fam] || fam) + " here yet.")) + "</p><p>" +   // HERESY 1339: one sentence each
          esc(tr("Put .safetensors files into the studio's artwork/loras/" + fam + "/ folder: any folders inside it become groups here; a picture beside a file with its name (NAME.jpg, NAME.png, NAME.preview.png) shows on its card.")) + "</p><p>" +
          esc(tr("On Civitai, pick adapters by their base model (" + ({ "krea2": "Krea 2", "qwen-image-2.1": "Qwen 2.1", "qwen-image-2512": "Qwen", "sdxl": "SDXL 1.0" }[fam] || fam) + "), " +
            "download the .safetensors and put it there; Look up on Civitai then fills in its name and its trigger words.")) + "</p></div>";
      } else {
        grid.innerHTML = list.map(function (r) {
          var info = r.info || {}, on = chosen.indexOf(r.id), mark = r.civitai === "known" ? "\u2713" : r.civitai === "not there" ? "\u2014" : "";
          return '<button type="button" class="ar-lib-card' + (on >= 0 ? " is-on" : "") + '" data-lid="' + esc(r.id) + '" title="' + esc(r.id) + '" translate="no">' +   // HERESY 1339: a file and its names
            (r.picture ? '<img alt="" loading="lazy" draggable="false" src="' + esc(loraPic(r.id, 320)) + '" />' : '<span class="ar-lib-nopic" translate="no">' + esc(r.name) + "</span>") +
            (on >= 0 ? '<span class="ar-lib-n">' + (on + 1) + "</span>" : "") +
            '<span class="ar-lib-name" translate="no">' + esc(loraName(r, r.id)) + "</span>" +
            '<span class="ar-lib-meta"><span translate="no">' + esc([info.version, info.base].filter(Boolean).join(" \u00b7 ")) + "</span><span>" + r.mb + " MB" +
              (mark ? ' <b class="ar-lib-cv" data-tip="' + esc(r.civitai === "known" ? tr("Known to Civitai") : tr("Civitai does not know this file")) + '">' + mark + "</b>" : "") + "</span></span>" +
            ((info.words || []).length ? '<span class="ar-lib-words" translate="no">' + esc(info.words.slice(0, 3).join(" \u00b7 ")) + "</span>" : "") + "</button>";
        }).join("") || '<p class="row-hint">' + esc(tr("Nothing here matches.")) + "</p>";
      }
      say.textContent = looking ? say.textContent : chosen.length + " / " + LORA_MAX + " " + tr("on");
    }
    function lookUp() {
      if (looking) { looking = false; return; }
      var todo = shown().filter(function (r) { return !r.civitai; }), n = 0;
      if (!todo.length) return toast(tr("Every adapter shown is looked up already"));
      looking = true;
      var next = function () {
        if (!looking || !document.body.contains(back) || n >= todo.length) { looking = false; paintLib(); paintLoras(); return; }
        say.textContent = tr("Civitai:") + " " + (n + 1) + " / " + todo.length + "\u2026";
        api("/artist/lora-civitai", { id: todo[n].id }).then(function (e) {
          var rows = loraRows(fam);
          for (var k = 0; k < rows.length; k++) if (rows[k].id === e.id) rows[k] = e;
        }).catch(function (err) { toast(err.message, "bad"); looking = false; })
          .then(function () { n++; paintLib(); next(); });
      };
      next();
    }
    function close() { looking = false; document.removeEventListener("keydown", key, true); back.remove(); paintLoras(); }
    function key(e) { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); } }
    document.addEventListener("keydown", key, true);
    back.addEventListener("mousedown", function (e) { if (e.target === back) close(); });
    back.querySelector(".ar-lib-q").addEventListener("input", function () { query = this.value.trim(); paintLib(); });
    back.addEventListener("click", function (e) {
      var c = e.target.closest("[data-lid]"), f = e.target.closest("[data-folder]"), b = e.target.closest("[data-lib]");
      if (c) { loraToggle(c.dataset.lid); paintLib(); }
      else if (f) { folder = f.dataset.folder; paintLib(); }
      else if (b && b.dataset.lib === "close") close();
      else if (b && b.dataset.lib === "civitai") lookUp();
    });
    paintLib();
    loadLoras().then(paintLib);
    back.querySelector(".ar-lib-q").focus();
    state.loraLibOpen = { close: close, lookUp: lookUp, paint: paintLib };
  }
  function init(hooks) {
    state.hooks = hooks || {};
    var shapes = (recall(KEY.shapes) || "1:1").split(",");
    $("arShapes").innerHTML = SHAPES.map(function (s) {
      return '<label class="chip ar-shape" data-tip="' + esc(s.label + " · for " + s.say) + '" aria-label="' + esc(s.label) + '"><input type="checkbox" value="' + s.id + '"' +
        (shapes.indexOf(s.id) >= 0 ? " checked" : "") + " />" + shapeIcon(s.id) + "</label>";   // HERESY 1321: drawn, its size in the tip
    }).join("");
    $("arPrompt").value = recall(KEY.prompt) || "";
    $("arCount").value = recall(KEY.count) || "1";
    $("arSeed").value = recall(KEY.seed) || "";
    $("arPainter").value = PAINTERS[recall(KEY.painter)] ? recall(KEY.painter) : "krea2-q4";
    ["arPrompt", "arSeed"].forEach(function (id) { $(id).addEventListener("input", function () { keepForm(); paintForm(); }); });
    ["arCount", "arPainter"].forEach(function (id) { $(id).addEventListener("change", function () { keepForm(); paintForm(); }); });
    $("arShapes").addEventListener("change", function () { keepForm(); paintForm(); });
    $("arSeedNew").addEventListener("click", function () { $("arSeed").value = ""; if (state.seedMode) state.seedMode.set("random"); keepForm(); paintForm(); $("arSeed").focus(); });
    // HERESY 1330 (Viktor 10.10.2026: «Для SEED сделай рандом -1, рандом fixed, fixed, next, prev»): the seed's mode beside ⟲
    state.seedMode = window.HeresySeedMode ? window.HeresySeedMode.attach($("arSeed"), "yue2.arSeedMode", { after: $("arSeedNew") }) : null;
    $("arDraw").addEventListener("click", function () { draw(); });   // HERESY 1340: Draw draws; a second run waits behind the first
    $("arStop").addEventListener("click", stopRun);      // HERESY 1270, 1340: Stop a button of its own
    // HERESY 1316: the adapters: the library, a strength, a word into the prompt, one taken off; the family follows the painter
    $("arLoraAdd").addEventListener("click", openLoraLib);
    $("arPainter").addEventListener("change", paintPainter);   // HERESY 1318: the fine-tune, the note, the adapters' family
    $("arModel").addEventListener("change", keepForm);
    ["arSteps", "arSampler", "arSchedule", "arLightOn", "arLight", "arCfg"].forEach(function (id) { $(id).addEventListener("change", keepSampling); });   // HERESY 1319, 1328
    // HERESY 1345 (Viktor: «Фолдинг СЕМПЛИНГА запоминаем при F5 также»)
    if (recall("yue2.arSampOpen")) $("arSampling").open = recall("yue2.arSampOpen") === "1";
    $("arSampling").addEventListener("toggle", function () { keep("yue2.arSampOpen", this.open ? "1" : "0"); });
    $("arSampReset").addEventListener("click", function () { var sa = sampAll(); delete sa[$("arPainter").value]; keep(KEY.sampling, JSON.stringify(sa)); paintSampling(); paintForm(); });
    paintSampling();
    loadPainters();
    $("arLoraList").addEventListener("input", function (e) {
      var tw = e.target.closest(".ar-lora-tw");          // HERESY 1335: together: each in proportion to where it stood when the drag began
      if (tw) {
        var lst = lorasNow();
        if (!state.loraTotalDrag) state.loraTotalDrag = lst.map(function (l) { return l.muted ? 0 : +l.weight || 0; });   // HERESY 1341: a muted one stays
        var base = state.loraTotalDrag, sum = base.reduce(function (s, v) { return s + v; }, 0), target = +tw.value, live = lst.filter(function (l) { return !l.muted; }).length || 1;
        lst.forEach(function (l, k) { if (!l.muted) l.weight = Math.min(1.5, Math.max(0, Math.round((sum > 1e-9 ? base[k] * target / sum : target / live) * 20) / 20)); });
        var al = lorasAll(); al[familyNow()] = lst; keep(KEY.loras, JSON.stringify(al));
        Array.prototype.forEach.call(document.querySelectorAll("#arLoraList [data-li]"), function (row) {
          var l = lst[+row.dataset.li]; if (!l) return;
          row.querySelector(".ar-lora-w").value = (+l.weight).toFixed(2); row.querySelector(".ar-lora-wv").textContent = (+l.weight).toFixed(2);
        });
        loraTotalPaint(lst);
        return;
      }
      var w = e.target.closest(".ar-lora-w");
      if (!w) return;
      var row = w.closest("[data-li]"), list = lorasNow(), at = +row.dataset.li;
      row.querySelector(".ar-lora-wv").textContent = (+w.value).toFixed(2);
      if (list[at]) { list[at].weight = +(+w.value).toFixed(2); var all = lorasAll(); all[familyNow()] = list; keep(KEY.loras, JSON.stringify(all)); }
      loraTotalPaint(list);                              // HERESY 1335
    });
    $("arLoraList").addEventListener("change", function (e) { if (e.target.closest(".ar-lora-tw")) { state.loraTotalDrag = null; loraTotalPaint(lorasNow()); } });
    // HERESY 1341 (Viktor: «Как у Творца мы можем отключить адаптер, не удаляя его из включенных»): the Creator's right-click menu
    $("arLoraList").addEventListener("contextmenu", function (e) {
      var row = e.target.closest(".ar-lora[data-li]");
      if (!row || !window.HeresyMenu || e.target.closest("input")) return;
      e.preventDefault();
      var at = +row.dataset.li, list = lorasNow(), l = list[at];
      if (!l) return;
      window.HeresyMenu.open(e.clientX, e.clientY, [
        { label: l.muted ? "Unmute: back in the run" : "Mute: left out of the run, its strengths kept", icon: l.muted ? "\u25b6" : "\u23f8",
          action: function () { var ls = lorasNow(); if (!ls[at]) return; if (ls[at].muted) delete ls[at].muted; else ls[at].muted = true; setLoras(ls); } },
        { sep: true },
        { label: "Take it off", icon: "\u2715", action: function () { var ls = lorasNow(); ls.splice(at, 1); setLoras(ls); } }
      ]);
    });
    $("arLoraList").addEventListener("click", function (e) {
      var x = e.target.closest("[data-lx]"), wd = e.target.closest("[data-word]");
      if (x) { var list = lorasNow(); list.splice(+x.dataset.lx, 1); setLoras(list); }
      else if (wd) wordIntoPrompt(wd.dataset.word);
    });
    paintLoras();
    loadLoras();
    // HERESY 1305: the reference picture: a file, a drop on its place, a paste in the room; its strength kept
    $("arRefFile").addEventListener("change", function () { refFromFile(this.files && this.files[0]); this.value = ""; });
    $("arRefX").addEventListener("click", function () { setRef(null); });
    $("arMaskOpen").addEventListener("click", maskEditor);   // HERESY 1306
    $("arCanvasOpen").addEventListener("click", openCanvas);   // HERESY 1346
    $("arCanvasX").addEventListener("click", function () { state.place = null; paintCanvasSay(); });
    $("arShapes").addEventListener("change", paintCanvasSay);
    $("arRefTake").addEventListener("click", refFromTake);   // HERESY 1309
    paintRefTake();
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && state.cmpA) { compareOff(); toast(tr("No comparing")); } });   // HERESY 1308
    $("arRefFit").addEventListener("change", paintRefSay);    // HERESY 1307
    loadMaskOpts();                                     // HERESY 1320
    ["arMkGrow", "arMkEdge", "arMkSoft", "arMkGrain"].forEach(function (id) { $(id).addEventListener("change", keepMaskOpts); });
    var refBox = $("arRef");
    ["dragenter", "dragover"].forEach(function (k) { refBox.addEventListener(k, function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], "Files") >= 0) { e.preventDefault(); refBox.classList.add("is-over"); } }); });
    ["dragleave", "drop"].forEach(function (k) { refBox.addEventListener(k, function () { refBox.classList.remove("is-over"); }); });
    refBox.addEventListener("drop", function (e) { if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) { e.preventDefault(); refFromFile(e.dataTransfer.files[0]); } });
    $("view-artist").addEventListener("paste", function (e) {
      var f = e.clipboardData && Array.prototype.filter.call(e.clipboardData.files || [], function (x) { return /^image\//.test(x.type); })[0];
      if (f) { e.preventDefault(); refFromFile(f); }
    });
    var str = parseFloat(recall("yue2.arRefStr"));
    if (str >= 0.2 && str <= 1) $("arRefStr").value = String(str);
    paintRefSay();
    $("arRefStr").addEventListener("input", function () { paintRefSay(); keep("yue2.arRefStr", $("arRefStr").value); });
    $("arFromTake").addEventListener("click", fromTake);
    $("arPrompt").addEventListener("keydown", function (e) {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !$("arDraw").disabled) { e.preventDefault(); draw(); }   // HERESY 1340: a second run too
    });
    $("arRuns").addEventListener("click", function (e) {
      var g = e.target.closest("[data-act^=g]");
      if (g) {                                          // the gallery's own: look, star
        var list = items(), at = +g.closest(".ar-gpic").dataset.g;
        if (g.dataset.act === "gview" && (e.ctrlKey || e.metaKey || e.shiftKey)) { togglePick(list[at], e.shiftKey, list); return; }   // HERESY 1321
        if (g.dataset.act === "gview" && state.cmpA) compare(state.cmpA, list[at]);   // HERESY 1308: the other of two compared
        else if (g.dataset.act === "gview") pick(list[at], true);    // HERESY 1271: to the stage; 1340: again, back to the run
        else if (g.dataset.act === "gstar") star(list[at].r, list[at].p, !list[at].p.star);
        return;
      }
      var b = e.target.closest("[data-act]"), r = b && runOf(b);
      if (!b || !r || b.disabled) return;
      var act = b.dataset.act, fig = b.closest(".ar-pic"), p = fig && r.pictures[+fig.dataset.i];
      if (act === "view" && p && (e.ctrlKey || e.metaKey || e.shiftKey)) {          // HERESY 1321: picked
        var flat = []; state.runs.forEach(function (x) { (x.pictures || []).forEach(function (q) { if (q.kept) flat.push({ r: x, p: q }); }); });
        togglePick({ r: r, p: p }, e.shiftKey, flat);
        return;
      }
      if (act === "view" && state.cmpA) compare(state.cmpA, { r: r, p: r.pictures[+fig.dataset.i] });   // HERESY 1308
      else if (act === "view") pick({ r: r, p: r.pictures[+fig.dataset.i] }, true);   // HERESY 1271: to the stage; 1340: again, back to the run
      else if (act === "cover" && p) cover(r, p);
      else if (act === "form") { fillForm(r, true); $("arPrompt").focus(); toast(tr("In the form: its prompt, shapes, variations and seed")); }
      else if (act === "again" && r.kind === "upscale" && r.upscaled_from) upscaleIt(r.upscaled_from, r.model, r.target || r.factor);   // HERESY 1322, 1332
      else if (act === "again") draw(r);
      else if (act === "trash") trashRun(r);
      else if (act === "fold") { state.open[r.id] = !state.open[r.id]; b.classList.toggle("is-open", !!state.open[r.id]); }
      else if (act === "cancel") api("/jobs/cancel", { key: "artist:" + r.id }).then(load).catch(function (err) { toast(err.message, "bad"); });
    });
    // HERESY 1257: runs or the gallery, its filter and size, kept in this browser; the live preview's box
    state.look = recall(KEY.look) === "gallery" ? "gallery" : "runs";   // HERESY 1310: the Trash look is not kept: the room opens on its runs
    state.filter = FILTERS.some(function (f) { return f[0] === recall(KEY.filter); }) ? recall(KEY.filter) : "all";
    state.size = SIZES.some(function (z) { return z[0] === recall(KEY.size); }) ? recall(KEY.size) : "m";
    $("arFilters").innerHTML = FILTERS.map(function (f) {   // HERESY 1321: the shapes and the star drawn
      var sh = SHAPES.filter(function (s) { return s.id === f[0]; })[0];
      if (sh) return '<button type="button" class="chip ar-fshape" data-filter="' + f[0] + '" aria-label="' + esc(sh.label) + '" data-tip="' + esc(sh.label) + '">' + shapeIcon(f[0]) + "</button>";
      if (f[0] === "star") return '<button type="button" class="chip ar-fshape" data-filter="star" aria-label="' + esc(tr("Starred")) + '" data-tip="' + esc(tr("The starred pictures")) + '">' + starIcon(true) + "</button>";
      return '<button type="button" class="chip" data-filter="' + f[0] + '">' + esc(tr(f[1])) + "</button>";
    }).join("");
    $("arSizes").innerHTML = SIZES.map(function (z) { return '<button type="button" class="chip" data-size="' + z[0] + '" aria-label="' + esc(tr("Size") + " " + z[1]) + '">' + z[1] + "</button>"; }).join("");
    (function () {                                    // HERESY 1321: the bar of the picked pictures
      var pb = document.createElement("span");
      pb.id = "arPicked"; pb.className = "ar-picked"; pb.hidden = true;
      $("arBar").appendChild(pb);
      pb.addEventListener("click", function (e) {
        var b = e.target.closest("[data-pick]");
        if (!b) return;
        if (b.dataset.pick === "clear") clearPicked();
        else if (b.dataset.pick === "aside") asidePics(pickedList());
        else if (b.dataset.pick === "star") starPicked();
      });
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && Object.keys(state.picked).length && !$("view-artist").classList.contains("is-hidden")) { clearPicked(); }
      });
    })();
    $("arBar").addEventListener("click", function (e) {
      var b = e.target.closest("[data-look], [data-filter], [data-size]");
      if (!b) return;
      if (b.dataset.look) { state.look = b.dataset.look; keep(KEY.look, state.look === "gallery" ? "gallery" : null); }   // HERESY 1310: trash not kept
      if (b.dataset.filter) { state.filter = b.dataset.filter; keep(KEY.filter, state.filter === "all" ? null : state.filter); }
      if (b.dataset.size) { state.size = b.dataset.size; keep(KEY.size, state.size === "m" ? null : state.size); }
      paintRuns();
    });
    // HERESY 1271: the stage's own actions; a double click in the library opens a picture over the page at once; the edges
    $("arStage").addEventListener("click", stageAct);
    $("arRuns").addEventListener("click", function (e) {
      var pg = e.target.closest("[data-purge], [data-purge-pic], [data-wipe]");
      if (pg) return purge(pg);                          // HERESY 1337
      var b = e.target.closest("[data-restore]");
      if (b) return restoreRun(b.dataset.restore);       // HERESY 1310
      var one = e.target.closest("[data-back]"), all = e.target.closest("[data-back-all]"), pics = state.asidePics || [];   // HERESY 1321
      if (one && pics[+one.dataset.back]) asidePics([{ id: pics[+one.dataset.back].id, file: pics[+one.dataset.back].file }], true);
      else if (all && pics.length) asidePics(pics.map(function (p) { return { id: p.id, file: p.file }; }), true);
    });
    $("arRuns").addEventListener("dblclick", function (e) {
      var t = e.target.closest(".ar-thumb");
      if (!t) return;
      var it = selected();
      if (it) { var w = stageList(it); view(w.list, w.at); }
    });
    window.addEventListener("resize", fitStage);
    if ($("view-artist")) $("view-artist").addEventListener("scroll", paintAvail, { passive: true });   // HERESY 1340
    if ($("logDock") && window.MutationObserver) new MutationObserver(paintAvail).observe($("logDock"), { attributes: true, attributeFilter: ["class", "hidden"] });   // HERESY 1345b: its side, folded or not
    if (window.ResizeObserver) new ResizeObserver(function () { fitStage(); }).observe($("arStage"));   // shown after a hidden tab: its size then
    edges();
    $("arLive").checked = recall(KEY.live) !== "0";
    $("arLive").addEventListener("change", function () { keep(KEY.live, this.checked ? null : "0"); });
    window.addEventListener("ruach-lang", function () { paintForm(); paintHead(); paintRuns(); });
    if (state.hooks.take) setTake(state.hooks.take()); else paintHead();
    paintForm();
  }
  // HERESY 1271: the room entered, the stage follows a painting run again (the picture picked stays picked otherwise)
  window.HeresyArtistRef = { set: setRef, get: function () { return state.ref; }, fromFile: refFromFile,   // HERESY 1305: for the checks
    mask: function () { return state.mask; }, editor: function () { return state.maskEditor; },     // 1306
    setMask: function (m) { setMask(m); paintRefSay(); },                                            // 1320
    compare: function () { return state.compare; }, picking: function () { return !!state.cmpA; } };  // 1308
  window.HeresyArtist = { init: init, reload: function () { state.pinSel = false; paintHead(); return load(); }, setTake: setTake,
    loras: { reload: loadLoras, now: lorasNow, set: setLoras, open: openLoraLib, lib: function () { return state.loraLibOpen; } },   // HERESY 1316: for the checks
    painters: loadPainters, sampling: { now: sampNow, body: samplingBody, paint: paintSampling },   // HERESY 1318, 1319
    canvas: { open: openCanvas, place: function () { return state.place; } } };   // HERESY 1346: for the checks
})();
