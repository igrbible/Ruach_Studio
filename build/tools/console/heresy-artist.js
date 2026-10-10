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
  var KEY = { prompt: "yue2.arPrompt", shapes: "yue2.arShapes", count: "yue2.arCount", seed: "yue2.arSeed", painter: "yue2.arPainter",
    live: "yue2.arLive", look: "yue2.arLook", filter: "yue2.arFilter", size: "yue2.arSize" };
  // HERESY 1257 (Viktor 08.10.2026: «Ты предусмотрел галерею сгенерированного арта? Изучи интерфейс и функционал InvokeAI»):
  // the pictures as runs or as one gallery (InvokeAI's grid: every picture, the newest first, filtered, starred, three sizes)
  var FILTERS = [["all", "All"], ["1:1", "1:1"], ["16:9", "16:9"], ["9:16", "9:16"], ["star", "★ Starred"]];
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
    $("arCost").textContent = n ? tr(n === 1 ? "1 picture" : n + " pictures") + " · " + tr(minutes(secs)) + " " + tr("on one card") : tr("pick a shape");
    var busy = drawingRun();                             // HERESY 1270: Draw is Stop while a run waits or draws
    $("arDraw").textContent = tr(busy ? "Stop" : "Draw");
    $("arDraw").classList.toggle("is-stop", !!busy);
    $("arDraw").dataset.tip = busy ? tr("Stop the run: a waiting one leaves the queue, a drawing one ends now; the pictures it finished stay") : "";
    $("arDraw").disabled = busy ? !!state.stopping : (!n || !$("arPrompt").value.trim() || state.sending);
    Array.prototype.forEach.call(document.querySelectorAll("#arShapes label"), function (l) { l.classList.toggle("is-on", l.querySelector("input").checked); });
  }
  function keepForm() {
    keep(KEY.prompt, $("arPrompt").value);
    keep(KEY.shapes, shapesPicked().join(","));
    keep(KEY.count, $("arCount").value === "1" ? null : $("arCount").value);
    keep(KEY.seed, $("arSeed").value.trim());
    keep(KEY.painter, $("arPainter").value === "krea2-q4" ? null : $("arPainter").value);
  }
  function fillForm(run, withSeed) {
    $("arPrompt").value = run.prompt || "";
    Array.prototype.forEach.call(document.querySelectorAll("#arShapes input"), function (i) { i.checked = (run.shapes || []).indexOf(i.value) >= 0; });
    $("arCount").value = String(run.count || 1);
    $("arSeed").value = withSeed && run.seed != null ? String(run.seed) : "";
    if (PAINTERS[run.painter]) $("arPainter").value = run.painter;
    keepForm();
    paintForm();
  }
  function draw(again) {
    var body = again ? { prompt: again.prompt, shapes: again.shapes, count: again.count, seed: null, painter: again.painter }
      : { prompt: $("arPrompt").value.trim(), shapes: shapesPicked(), count: +$("arCount").value || 1, seed: seedAsked(), painter: $("arPainter").value };
    body.preview = $("arLive").checked;                 // HERESY 1257: each step's picture while it paints
    if (state.take) body.take = state.take.name;
    if (!body.prompt) return toast(tr("Write what to paint first"), "bad");
    if (!body.shapes.length) return toast(tr("Pick a shape: 1:1, 16:9 or 9:16"), "bad");
    state.sending = true;
    paintForm();
    return api("/artist/draw", body).then(function (run) {
      state.pinSel = false;                              // HERESY 1271: the stage follows the new run
      state.runs.unshift(run);
      paintRuns();
      toast(tr("The Artist draws") + " " + run.of + " " + tr(run.of === 1 ? "picture" : "pictures") + " · " + tr("seed") + " " + run.seed + ": " +
        tr("it waits for a card with room, then paints (Engine → GPUs says which card does what)"));
      schedule(1500);
    }).catch(function (e) { toast(tr("The Artist cannot draw:") + " " + e.message, "bad"); })
      .then(function () { state.sending = false; paintForm(); });
  }
  function stopRun() {                                   // HERESY 1270
    var r = drawingRun();
    if (!r) return;
    state.stopping = true;
    paintForm();
    api("/artist/stop", { id: r.id }).then(function () { toast(tr("Stopping the run: the pictures it finished stay")); })
      .catch(function (e) { toast(tr("The run did not stop:") + " " + e.message, "bad"); })
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
    }).catch(function (e) { toast(tr("No prompt from the take:") + " " + e.message, "bad"); });
  }

  // ------------------------------------------------------------------ the take in hand
  function setTake(take) {
    state.take = take && take.name ? take : null;
    paintHead();
    if (state.runs.length) paintRuns();     // «Set as cover» names the take
  }
  function hasArt(name) { return !!(state.hooks && state.hooks.artUrl && state.hooks.artUrl(name)); }
  function paintHead() {
    var t = state.take;
    $("arTake").textContent = t ? t.label || t.name : "";
    $("arTakeNote").textContent = t ? (hasArt(t.name) ? tr("its cover can be one of these") : tr("no cover yet: give it one of these")) : tr("pick a take on the right to give it a cover");
    $("arFromTake").disabled = !t;
  }

  // ------------------------------------------------------------------ the runs
  function load() {
    return api("/artist/runs").then(function (d) {
      var was = {};
      state.runs.forEach(function (r) { if (live(r)) was[r.id] = 1; });
      state.runs = d.runs || [];
      state.runs.forEach(function (r) {           // a run that ended while the room looked on says so
        if (!was[r.id] || live(r)) return;
        var kept = (r.pictures || []).filter(function (p) { return p.kept; }).length;
        var last = (r.pictures || []).filter(function (p) { return p.kept; }).pop();   // HERESY 1271: the stage takes its last picture
        if (last) { state.sel = { id: r.id, file: last.file }; state.pinSel = false; }
        if (r.status === "done") toast(tr("The Artist drew") + " " + kept + " " + tr("of") + " " + r.of + " " + tr(r.of === 1 ? "picture" : "pictures"), kept ? "good" : "bad");
        else if (r.status === "stopped") toast(tr("The Artist stopped:") + " " + kept + " " + tr("of") + " " + r.of + " " + tr(r.of === 1 ? "picture" : "pictures") + " " + tr("kept"));   // HERESY 1270
        else toast(tr("The Artist's run failed:") + " " + (r.error || ""), "bad");
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
    if (r.status === "running") return '<span class="ar-state is-run">' + esc(tr("drawing")) + " " + (r.pictures || []).length + " " + esc(tr("of")) + " " + r.of +
      (r.gpu != null ? " · GPU " + esc(r.gpu) : "") + "</span>";
    if (r.status === "failed") return '<span class="ar-state is-bad">' + esc(tr("failed")) + "</span> " + '<span class="ar-why">' + esc(r.error || "") + "</span>";
    if (r.status === "stopped") {                       // HERESY 1270
      var k0 = (r.pictures || []).filter(function (p) { return p.kept; }).length;
      return '<span class="ar-state is-bad">' + esc(tr("stopped")) + "</span> " + '<span class="ar-why">' + k0 + " " + esc(tr("of")) + " " + r.of + " " + esc(tr("kept")) + "</span>";
    }
    var kept = (r.pictures || []).filter(function (p) { return p.kept; }).length;
    return '<span class="ar-state">' + kept + " " + esc(tr(kept === 1 ? "picture" : "pictures")) + (r.took ? " · " + Math.round(r.took) + " s" : "") + "</span>";
  }
  function capOf(r, p) { return p.shape + (r.count > 1 ? " · v" + (p.seed - r.seed + 1) : ""); }
  function picHtml(r, p, i) {
    var sh = shapeOf(p.shape);
    if (!p.kept) return '<figure class="ar-pic is-gone" style="--ar:' + sh.w + "/" + sh.h + '"><div class="ar-gone">' +
      esc(tr("Not kept: the content filter flagged it")) + '</div><figcaption><span class="ar-cap">' + esc(capOf(r, p)) + "</span></figcaption></figure>";
    var square = p.shape === "1:1", take = state.take;
    var coverTip = !take ? tr("Pick a take on the right to give it this cover") : !square ? tr("A cover is square: this one is for a video or a short") :
      tr("This picture becomes the cover of") + " “" + (take.label || take.name) + "”" + (hasArt(take.name) ? " " + tr("(its cover now is kept beside it)") : "");
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
    $("arTotal").textContent = state.look === "gallery" ? items().length + " " + tr("of") + " " + all : state.runs.length + " " + tr(state.runs.length === 1 ? "run" : "runs") + " · " + all + " " + tr(all === 1 ? "picture" : "pictures");
  }
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
          '<button type="button" class="ar-star' + (it.p.star ? " is-on" : "") + '" data-act="gstar" aria-pressed="' + (it.p.star ? "true" : "false") + '" aria-label="' + esc(tr("Star it")) + '">' + (it.p.star ? "★" : "☆") + "</button></figure>";
      }).join("") + "</div>";
  }
  function paintRuns() { paintRunsList(); paintStage(); }   // HERESY 1271: the library, then the stage
  function paintRunsList() {
    var box = $("arRuns");
    paintBar();
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
        '<span class="ar-meta" translate="no">' + esc(PAINTERS[r.painter] || r.painter || "") + " · " + esc(tr("seed")) + " " + esc(r.seed) +
        (r.count > 1 ? "…" + esc(r.seed + r.count - 1) : "") + "</span>" + runState(r) +
        '<span class="ar-acts"><button type="button" class="btn ghost small" data-act="form" data-tip="' + esc(tr("Its prompt, shapes, variations and seed back in the form above")) + '">' + esc(tr("To the form")) + "</button>" +
        '<button type="button" class="btn ghost small" data-act="again" data-tip="' + esc(tr("The same prompt and shapes once more, from a new seed")) + '"' + (live(r) ? " disabled" : "") + ">" + esc(tr("Again")) + "</button>" +
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
        toast(tr("The cover of") + " “" + (take.label || take.name) + "” " + tr("is this picture now") + (d.kept ? " · " + tr("the old one is kept beside the take") : ""), "good");
        if (state.hooks.refreshArts) state.hooks.refreshArts().then(paintHead);
      }).catch(function (e) { toast(tr("No cover:") + " " + e.message, "bad"); });
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
    }).catch(function (e) { toast(tr("No star:") + " " + e.message, "bad"); });
  }
  function trashRun(r) {
    return window.HeresyDialog.confirm(tr("The run and its") + " " + (r.pictures || []).filter(function (p) { return p.kept; }).length + " " + tr("pictures to the trash?") + "\n\n" +
      tr("They go to the studio's trash/artist/ and can come back from there; a cover already given to a take stays with the take."),
      { ok: tr("To the trash"), danger: true }).then(function (ok) {
      if (!ok) return;
      return api("/artist/trash", { id: r.id }).then(function () {
        state.runs = state.runs.filter(function (x) { return x.id !== r.id; });
        paintRuns();
        toast(tr("In the trash: the studio's trash/artist/ keeps it"));
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
  function pick(it) {
    if (!it || !it.p || !it.p.kept) return;
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
    if (p) meta.push(p.shape + " · " + p.w + "×" + p.h, tr("seed") + " " + p.seed);
    else meta.push((r.shapes || []).join(" · ") + (r.count > 1 ? " × " + r.count : ""), tr("seed") + " " + r.seed + (r.count > 1 ? "…" + (r.seed + r.count - 1) : ""));
    meta.push(PAINTERS[r.painter] || r.painter || "", when(r.created));
    if (r.took) meta.push(Math.round(r.took) + " s");
    if (r.gpu != null) meta.push("GPU " + r.gpu);
    if (n) meta.push(tr("drawing") + " " + n + " " + tr("of") + " " + r.of);
    var acts = "";
    if (p) {
      var take = state.take, square = p.shape === "1:1";
      acts =
        '<button type="button" class="btn ghost small" data-stage="form" data-tip="' + esc(tr("Its prompt, seed and shape back in the form")) + '">' + esc(tr("To the form")) + "</button>" +
        (square ? '<button type="button" class="btn ghost small ar-cover" data-stage="cover"' + (take ? "" : " disabled") + ' data-tip="' +
          esc(take ? tr("This picture becomes the cover of") + " “" + (take.label || take.name) + "”" : tr("Pick a take on the right to give it this cover")) + '">' + esc(tr("Set as cover")) + "</button>" : "") +
        '<a class="ar-dl" aria-label="' + esc(tr("Download")) + '" data-tip="' + esc(tr("Download the picture (PNG, full size)")) + '" href="' + esc(fileUrl(r.id, p.file)) +
        '" download="' + esc("ruach-artist-" + r.id + "-" + p.file) + '">' + (window.HeresyIcons ? window.HeresyIcons.ui("download") : "⤓") + "</a>" +
        '<button type="button" class="btn ghost small" data-stage="view" data-tip="' + esc(tr("Over the whole page: ← → walk the pictures, Esc closes")) + '">' + esc(tr("Over the page")) + "</button>" +
        '<button type="button" class="pb-btn ar-vstar' + (p.star ? " is-on" : "") + '" data-stage="star" aria-pressed="' + (p.star ? "true" : "false") + '" aria-label="' + esc(tr("Star it")) + '">' + (p.star ? "★" : "☆") + "</button>";
    }
    return '<div class="ar-stage-data"><div class="ar-stage-meta" translate="no">' + meta.filter(Boolean).map(function (m) { return "<span>" + esc(m) + "</span>"; }).join("") + "</div>" +
      '<div class="ar-stage-prompt" translate="no">' + esc(r.prompt || "") + "</div>" + (acts ? '<div class="ar-stage-acts">' + acts + "</div>" : "") + "</div>";
  }
  function fitStage() {
    var b = document.querySelector("#arStage .ar-stage-pic"), box = $("arStage");
    if (!b || !box || !box.clientWidth) return;
    var w = +b.dataset.w || 1, h = +b.dataset.h || 1, maxH = Math.max(240, window.innerHeight - 330), k = Math.min(box.clientWidth / w, maxH / h);
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
          '<span class="ar-stepno">' + step.step + " / " + step.of + "</span>" : '<div class="ar-stage-empty">' + esc(tr("painting…")) + "</div>") + "</div>" + stageData(run, null, n)
        : '<div class="ar-stage-empty">' + esc(tr(run.waiting ? "waits for a card" : "in the queue")) + "</div>" + stageData(run, null, 0);
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
    if (key === state.stageKey) return fitStage();
    state.stageKey = key;
    box.innerHTML = html;
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
    else if (act === "form") { fillForm({ prompt: it.r.prompt, shapes: [it.p.shape], count: 1, seed: it.p.seed, painter: it.r.painter }, true); $("arPrompt").focus(); toast(tr("In the form: its prompt, seed and shape")); }
  }
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
  function init(hooks) {
    state.hooks = hooks || {};
    var shapes = (recall(KEY.shapes) || "1:1").split(",");
    $("arShapes").innerHTML = SHAPES.map(function (s) {
      return '<label class="chip ar-shape" data-tip="' + esc(tr("For") + " " + tr(s.say)) + '"><input type="checkbox" value="' + s.id + '"' +
        (shapes.indexOf(s.id) >= 0 ? " checked" : "") + " /> " + esc(s.label) + "</label>";
    }).join("");
    $("arPrompt").value = recall(KEY.prompt) || "";
    $("arCount").value = recall(KEY.count) || "1";
    $("arSeed").value = recall(KEY.seed) || "";
    $("arPainter").value = PAINTERS[recall(KEY.painter)] ? recall(KEY.painter) : "krea2-q4";
    ["arPrompt", "arSeed"].forEach(function (id) { $(id).addEventListener("input", function () { keepForm(); paintForm(); }); });
    ["arCount", "arPainter"].forEach(function (id) { $(id).addEventListener("change", function () { keepForm(); paintForm(); }); });
    $("arShapes").addEventListener("change", function () { keepForm(); paintForm(); });
    $("arSeedNew").addEventListener("click", function () { $("arSeed").value = ""; keepForm(); paintForm(); $("arSeed").focus(); });
    $("arDraw").addEventListener("click", function () { if (drawingRun()) stopRun(); else draw(); });   // HERESY 1270
    $("arFromTake").addEventListener("click", fromTake);
    $("arPrompt").addEventListener("keydown", function (e) {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !$("arDraw").disabled && !drawingRun()) { e.preventDefault(); draw(); }
    });
    $("arRuns").addEventListener("click", function (e) {
      var g = e.target.closest("[data-act^=g]");
      if (g) {                                          // the gallery's own: look, star
        var list = items(), at = +g.closest(".ar-gpic").dataset.g;
        if (g.dataset.act === "gview") pick(list[at]);    // HERESY 1271: to the stage
        else if (g.dataset.act === "gstar") star(list[at].r, list[at].p, !list[at].p.star);
        return;
      }
      var b = e.target.closest("[data-act]"), r = b && runOf(b);
      if (!b || !r || b.disabled) return;
      var act = b.dataset.act, fig = b.closest(".ar-pic"), p = fig && r.pictures[+fig.dataset.i];
      if (act === "view") pick({ r: r, p: r.pictures[+fig.dataset.i] });   // HERESY 1271: to the stage
      else if (act === "cover" && p) cover(r, p);
      else if (act === "form") { fillForm(r, true); $("arPrompt").focus(); toast(tr("In the form: its prompt, shapes, variations and seed")); }
      else if (act === "again") draw(r);
      else if (act === "trash") trashRun(r);
      else if (act === "fold") { state.open[r.id] = !state.open[r.id]; b.classList.toggle("is-open", !!state.open[r.id]); }
      else if (act === "cancel") api("/jobs/cancel", { key: "artist:" + r.id }).then(load).catch(function (err) { toast(err.message, "bad"); });
    });
    // HERESY 1257: runs or the gallery, its filter and size, kept in this browser; the live preview's box
    state.look = recall(KEY.look) === "gallery" ? "gallery" : "runs";
    state.filter = FILTERS.some(function (f) { return f[0] === recall(KEY.filter); }) ? recall(KEY.filter) : "all";
    state.size = SIZES.some(function (z) { return z[0] === recall(KEY.size); }) ? recall(KEY.size) : "m";
    $("arFilters").innerHTML = FILTERS.map(function (f) { return '<button type="button" class="chip" data-filter="' + f[0] + '">' + esc(tr(f[1])) + "</button>"; }).join("");
    $("arSizes").innerHTML = SIZES.map(function (z) { return '<button type="button" class="chip" data-size="' + z[0] + '" aria-label="' + esc(tr("Size") + " " + z[1]) + '">' + z[1] + "</button>"; }).join("");
    $("arBar").addEventListener("click", function (e) {
      var b = e.target.closest("[data-look], [data-filter], [data-size]");
      if (!b) return;
      if (b.dataset.look) { state.look = b.dataset.look; keep(KEY.look, state.look === "runs" ? null : state.look); }
      if (b.dataset.filter) { state.filter = b.dataset.filter; keep(KEY.filter, state.filter === "all" ? null : state.filter); }
      if (b.dataset.size) { state.size = b.dataset.size; keep(KEY.size, state.size === "m" ? null : state.size); }
      paintRuns();
    });
    // HERESY 1271: the stage's own actions; a double click in the library opens a picture over the page at once; the edges
    $("arStage").addEventListener("click", stageAct);
    $("arRuns").addEventListener("dblclick", function (e) {
      var t = e.target.closest(".ar-thumb");
      if (!t) return;
      var it = selected();
      if (it) { var w = stageList(it); view(w.list, w.at); }
    });
    window.addEventListener("resize", fitStage);
    if (window.ResizeObserver) new ResizeObserver(function () { fitStage(); }).observe($("arStage"));   // shown after a hidden tab: its size then
    edges();
    $("arLive").checked = recall(KEY.live) !== "0";
    $("arLive").addEventListener("change", function () { keep(KEY.live, this.checked ? null : "0"); });
    window.addEventListener("ruach-lang", function () { paintForm(); paintHead(); paintRuns(); });
    if (state.hooks.take) setTake(state.hooks.take()); else paintHead();
    paintForm();
  }
  // HERESY 1271: the room entered, the stage follows a painting run again (the picture picked stays picked otherwise)
  window.HeresyArtist = { init: init, reload: function () { state.pinSel = false; paintHead(); return load(); }, setTake: setTake };
})();
