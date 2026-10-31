// HERESY 1824 (Viktor 28.10.2026: «Я помню Видеографа на примере Maestro репо + воркфлоу китайца… можно закодить и LLM интеракцию в создании видео
// роликов + hyperframes»; «Пишем своим кодом то, что берём из Maestro»; «Именно MiniMax H3… Уведомление о лицензии и ограничениях по странам - в
// предупреждение в видеографе, и не более»): the Videographer, its first room. A take's song cut into shots at its sung lines (lab/videographer.py,
// from its Whisper timing), the look of the whole clip and each shot's scene written by the Writer (the chat server the studio writes with), a dozen
// shots a question; everything editable, kept in user/videos/, and a storyboard to take away. The moving pictures come with MiniMax H3.
(function () {
  "use strict";
  function $(id) { return document.getElementById(id); }
  function tr(s) { return window.RuachI18n ? window.RuachI18n.t(s) : s; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function clock(t) { t = Math.max(0, t || 0); var m = Math.floor(t / 60), s = t - m * 60; return m + ":" + (s < 10 ? "0" : "") + s.toFixed(1); }
  var SCENE = ["shot", "camera", "motion", "light"], LOOK = ["characters", "setting", "palette", "notes"], BATCH = 12;
  var state = { take: null, plan: null, busy: false, dirty: false };
  function api(path, body) {
    var opt = body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
    return fetch("/lab" + path, opt).then(function (r) { return r.json().then(function (b) { if (!r.ok && r.status !== 202) throw new Error(b.error || r.status); b.__status = r.status; return b; }); });
  }
  function say(t, bad) { var el = $("vdStatus"); if (el) { el.textContent = t || ""; el.classList.toggle("bad", !!bad); } }

  function paint() {
    var p = state.plan, t = state.take;
    $("vdTake").textContent = t ? (t.title || t.name) : tr("pick a take with 🔍 above");   // HERESY 1940
    $("vdMake").disabled = !t || !!t.session || state.busy;
    $("vdWrite").disabled = !p || !p.exists || state.busy;
    $("vdSave").disabled = !p || !p.exists || state.busy || !state.dirty;
    $("vdExport").disabled = !p || !p.exists;
    if ($("vdBeats")) {                                   // HERESY 1947: on the beats, or back as sung
      var onb = !!(p && p.exists && p.shots.some(function (s) { return s.as_sung; }));
      $("vdBeats").disabled = !p || !p.exists || state.busy || state.beating;
      $("vdBeats").textContent = tr(onb ? "Cuts as sung" : "Cuts on the beat");
      $("vdBeats").setAttribute("aria-pressed", onb ? "true" : "false");
    }
    if ($("vdEditZip")) $("vdEditZip").disabled = !p || !p.exists || state.editing;   // HERESY 1946
    if ($("vdAnimatic")) $("vdAnimatic").disabled = !p || !p.exists || state.busy || state.anim === "running";   // HERESY 1837
    if ($("vdClip")) $("vdClip").disabled = !p || !p.exists || state.busy || state.clip === "running";   // HERESY 1838
    if ($("vdShootAll")) $("vdShootAll").disabled = !p || !p.exists || state.busy;   // HERESY 1868
    if ($("vdDrawAll")) $("vdDrawAll").disabled = !p || !p.exists || (state.busy && !(state.frames && state.frames.state === "running"));   // HERESY 1913
    if ($("vdUpAll")) $("vdUpAll").disabled = !p || !p.exists || state.busy || !p.shots.some(function (s) { return s.video && !s.video_up; });   // HERESY 1876b
    $("vdMake").textContent = tr(p && p.exists ? "Cut it again" : "Make the plan");
    var has = !!(p && p.exists);
    $("vdBody").hidden = !has;
    if (!has) { $("vdStrip").innerHTML = ""; $("vdShots").innerHTML = ""; if ($("vdEdit")) $("vdEdit").hidden = true; return; }   // HERESY 1864
    LOOK.forEach(function (k) { var el = $("vdLook-" + k); if (el && document.activeElement !== el) el.value = (p.look || {})[k] || ""; });
    if ($("vdBrief") && document.activeElement !== $("vdBrief")) $("vdBrief").value = p.brief || "";   // HERESY 1913
    if ($("vdClipTitle") && document.activeElement !== $("vdClipTitle")) { $("vdClipTitle").value = p.clip_title || ""; $("vdClipTitle").placeholder = p.title || ""; }   // HERESY 1948
    if ($("vdCredits") && document.activeElement !== $("vdCredits")) $("vdCredits").value = p.credits || "";
    heroPaint(); framesPaint();
    var total = p.seconds || (p.shots.length ? p.shots[p.shots.length - 1].t1 : 1);
    $("vdStrip").innerHTML = p.shots.map(function (s, i) {
      var written = SCENE.some(function (k) { return (s.scene || {})[k]; });
      return '<button type="button" class="vd-block' + (s.sung ? " is-sung" : "") + (written ? " is-written" : "") + (s.frame ? " is-pictured" : "") + '" data-vdgo="' + i + '" style="flex:' + ((s.t1 - s.t0) / total).toFixed(4) +
        '" data-tip="' + esc((i + 1) + " · " + clock(s.t0) + "–" + clock(s.t1) + " · " + (s.section || "") + (s.words ? " · " + s.words : "") + " · " + tr("a double click plays from here")) + '"></button>';
    }).join("") + '<i class="vd-now" id="vdNow" hidden></i>';   // HERESY 1830: where the player stands
    $("vdShots").innerHTML = p.shots.map(function (s, i) {
      var sc = s.scene || {};
      return '<article class="vd-shot" id="vdShot' + i + '"><header><b class="mono">' + (i + 1) + "</b><span class=\"mono\">" + clock(s.t0) + "–" + clock(s.t1) + " · " + (s.t1 - s.t0).toFixed(1) + " s</span>" +
        '<span class="tag">' + esc(s.section || "") + "</span>" + (s.words ? '<span class="vd-words" translate="no">' + esc(s.words) + "</span>" : '<span class="vd-words is-bare">' + esc(tr("no words: the music alone")) + "</span>") +
        moveSelect(s, i) +                                // HERESY 1844
        '<span class="vd-acts">' + heroToggle(i) + '<button type="button" class="btn ghost small" data-vdplay="' + i + '" data-tip="' + esc(tr("Play from this shot")) + '" aria-label="' + esc(tr("Play from this shot")) + '">▶</button>' +
        (window.HeresyArtist && window.HeresyArtist.form ? '<button type="button" class="btn ghost small" data-vdart="' + i + '" data-tip="' + esc(tr("Draw this shot's picture in the Artist: its prompt into the form, wide")) + '" aria-label="' + esc(tr("Draw this shot's picture in the Artist: its prompt into the form, wide")) + '">🎨</button>' : "") +   // HERESY 1839
        '<button type="button" class="btn ghost small vd-shoot' + (s.video ? " has-video" : "") + '" data-vdshoot="' + i + '" data-tip="' + esc(tr("Shoot this shot with MiniMax H3: a draft (8 steps) or the final (28 steps); its picture, when it has one, is its first frame")) + '" aria-label="' + esc(tr("Shoot this shot with MiniMax H3: a draft (8 steps) or the final (28 steps); its picture, when it has one, is its first frame")) + '">\ud83c\udfac</button><span class="vd-h3" data-vdh3="' + i + '"></span>' +   // HERESY 1868
        '<span class="vd-h3 vd-sr" data-vdsr="' + i + '"></span>' + (s.video_up ? '<span class="vd-up" data-tip="' + esc(tr("Upscaled by SeedVR2 to {0}p").replace("{0}", (s.video_up_from && s.video_up_from.res) || "")) + '">' +
        esc(String((s.video_up_from && s.video_up_from.res) || "") + "p") + "</span>" : "") +   // HERESY 1876b
        '<button type="button" class="btn ghost small" data-vdcopy="' + i + '" data-tip="' + esc(tr("Copy this shot's prompt for a video model")) + '" aria-label="' + esc(tr("Copy this shot's prompt for a video model")) + '">⧉</button></span>' + "</header>" +
        '<div class="vd-row">' + picSlot(s, i) + vidSlot(s) + '<div class="vd-scene">' + SCENE.map(function (k) {
          return '<label class="field"><span class="label">' + esc(tr(LABEL[k])) + '</span><textarea rows="2" data-vdi="' + i + '" data-vdk="' + k + '" translate="no">' + esc(sc[k] || "") + "</textarea></label>";
        }).join("") + "</div></div></article>";
    }).join("");
    shotCur(state.cur || 0);                              // HERESY 1940: one shot in sight
    nowAt = -2; follow();
    vpRefresh();                                          // HERESY 1860: the shots as the films' chapters
    sideSoon();                                           // HERESY 1861: the mini library after what changed
    tlPaint();                                            // HERESY 1864: the edit page
    h3Paint();                                            // HERESY 1868: the shots on their way
    srPaint();                                            // HERESY 1876b: and their upscales
  }
  // HERESY 1940: the shots as tabs: one card in sight, the strip its tabs, ‹ › and Alt+← → beside it; the sections below the canvas, one in sight
  function shotCur(i) {
    var p = state.plan, n = p && p.shots ? p.shots.length : 0;
    if (!n) return;
    i = Math.max(0, Math.min(n - 1, i | 0)); state.cur = i;
    Array.prototype.forEach.call(document.querySelectorAll("#vdShots .vd-shot.is-cur, #vdStrip .is-cur"), function (el) { el.classList.remove("is-cur"); });
    var card = $("vdShot" + i), b = document.querySelector('#vdStrip [data-vdgo="' + i + '"]');
    if (card) card.classList.add("is-cur");
    if (b) b.classList.add("is-cur");
    if ($("vdShotAt")) $("vdShotAt").textContent = (i + 1) + " / " + n;
    if ($("vdPrev")) $("vdPrev").disabled = i <= 0;
    if ($("vdNext")) $("vdNext").disabled = i >= n - 1;
  }
  // HERESY 1961: the edit page an inner room too, the first: one room in sight, as tall as the column; the timeline laid out again when it comes into sight
  var PANES = ["edit", "shots", "look", "films"];
  function paneShow(k) {
    if (PANES.indexOf(k) < 0) k = "edit";
    var was = state.pane;
    state.pane = k; sideKeep("yue2.vdPane", k === "edit" ? "" : k);
    Array.prototype.forEach.call(document.querySelectorAll("#vdTabs [data-vdtab]"), function (b) { b.setAttribute("aria-selected", b.dataset.vdtab === k ? "true" : "false"); });
    Array.prototype.forEach.call(document.querySelectorAll("#vdBody [data-vdpane]"), function (s) { s.classList.toggle("is-on", s.dataset.vdpane === k); });
    if (k === "edit" && was !== "edit" && state.plan && state.plan.exists) requestAnimationFrame(function () { if (TL.fit) TL.pps = 0; tlPaint(); });
    if (k === "films" && was !== "films") requestAnimationFrame(vpRefresh);
  }
  var LABEL = { shot: "What is seen", camera: "Camera", motion: "Motion", light: "Light and colour" };
  // HERESY 1844: how the shot moves in the clip: «Auto» (the lab's word for it, from its scene's camera) or a choice kept with the plan
  var MOVES = [["", "Auto"], ["in", "Push in"], ["out", "Pull back"], ["right", "Pan right"], ["left", "Pan left"], ["still", "Still"]];
  var MOVE_NAME = { "in": "Push in", out: "Pull back", right: "Pan right", left: "Pan left", still: "Still" };
  function moveSelect(s, i) {
    var say = tr("The camera's move in the clip");
    return '<select class="vd-move" data-vdmove="' + i + '" aria-label="' + esc(say) + '" data-tip="' + esc(say) + '">' + MOVES.map(function (m) {
      return '<option value="' + m[0] + '"' + ((s.move || "") === m[0] ? " selected" : "") + ">" + esc(m[0] ? tr(m[1]) : tr("Auto: {0}").replace("{0}", tr(MOVE_NAME[s.auto] || "Push in"))) + "</option>";
    }).join("") + "</select>";
  }

  function load() {
    var t = state.take;
    state.plan = null; state.dirty = false; state.cur = 0;   // HERESY 1940: a new take from its first shot
    if (!t || t.session) { paint(); return; }
    animLoad();                                       // HERESY 1837: its animatic, if it has one
    clipLoad();                                       // HERESY 1838: its clip
    api("/video/plan?name=" + encodeURIComponent(t.name)).then(function (p) { if (state.take === t) { state.plan = p; paint(); h3Load(); srLoad(); framesLoad(); say(p.exists ? tr("{0} shots").replace("{0}", p.shots.length) : ""); } })
      .catch(function (e) { say(e.message, true); });
  }
  function make() {
    var t = state.take;
    if (!t) return;
    state.busy = true; paint(); say(tr("hearing the take: its lines in time…"));
    (function ask(n) {
      api("/video/plan", { name: t.name }).then(function (p) {
        if (state.take !== t) return;
        if (p.__status === 202) { if (n > 240) throw new Error(tr("the timing did not come")); return setTimeout(function () { ask(n + 1); }, 2500); }
        state.busy = false; state.plan = p; state.dirty = false; paint(); say(tr("{0} shots").replace("{0}", p.shots.length));
      }).catch(function (e) { state.busy = false; paint(); say(e.message, true); });
    })(0);
  }
  function collect() {
    var p = state.plan, look = {}, scenes = p.shots.map(function (s) { return Object.assign({}, s.scene || {}); });
    LOOK.forEach(function (k) { look[k] = $("vdLook-" + k).value; });
    Array.prototype.forEach.call(document.querySelectorAll("#vdShots textarea[data-vdi]"), function (el) { scenes[+el.dataset.vdi][el.dataset.vdk] = el.value; });
    var moves = p.shots.map(function (s, i) { var el = document.querySelector('#vdShots [data-vdmove="' + i + '"]'); return el ? el.value : (s.move || ""); });   // HERESY 1844
    var brief = $("vdBrief") ? $("vdBrief").value : (p.brief || "");   // HERESY 1913: the clip's idea; whether the hero is in each shot (null: the page's own choice)
    var heroes = p.shots.map(function (s) { return typeof s.hero === "boolean" ? s.hero : null; });
    var clipTitle = $("vdClipTitle") ? $("vdClipTitle").value : (p.clip_title || ""), credits = $("vdCredits") ? $("vdCredits").value : (p.credits || "");   // HERESY 1948
    return { look: look, scenes: scenes, moves: moves, brief: brief, heroes: heroes, clip_title: clipTitle, credits: credits };
  }
  function save() {
    var p = state.plan;
    if (!p || !p.exists) return Promise.resolve();
    var c = collect();
    return api("/video/save", { name: p.name, look: c.look, scenes: c.scenes, moves: c.moves, brief: c.brief, heroes: c.heroes, clip_title: c.clip_title, credits: c.credits }).then(function (q) { state.plan = q; state.dirty = false; paint(); say(tr("kept")); })
      .catch(function (e) { say(e.message, true); });
  }

  // the Writer, a dozen shots a question: the look first (when it is empty), then the scenes, each answer kept as it comes
  var SYSTEM = [
    "You direct a music video. You are given a song (title, style) and its shots: each with its time, its section and the words sung in it.",
    "When a brief is given, it is the maker's idea of the clip: the look and every scene serve it.",
    "Answer with JSON only: {\"look\": {\"characters\": \"…\", \"setting\": \"…\", \"palette\": \"…\", \"notes\": \"…\"}, \"scenes\": [{\"i\": 1, \"shot\": \"…\", \"camera\": \"…\", \"motion\": \"…\", \"light\": \"…\"}]}",
    "look: who is in the clip (each person as they look, the same in every shot), where it happens, its colours, and how it moves through the song. Keep the look you are given; write one only when it is empty.",
    "scenes: one for every shot you are given, by its number i. shot: what is seen, concrete and visual, in one or two sentences. camera: the framing and lens (wide, close-up, low angle…). motion: how the camera or the people move within the shot. light: light and colour.",
    "Follow the words of each shot without illustrating them word for word; let the clip have a line from shot to shot. A shot without words is music alone: show the place, the hands on the instruments, the light.",
    "Write in English, whatever the song's language: the video model reads English best. No commentary, no markdown fences."
  ].join("\n");
  function loose(text) {
    var s = String(text || "").replace(/^```[a-z]*\s*|\s*```$/g, ""), a = s.indexOf("{"), b = s.lastIndexOf("}");
    if (a < 0 || b <= a) return null;
    try { return JSON.parse(s.slice(a, b + 1)); } catch (e) { return null; }
  }
  function write() {
    var p = state.plan, chat = window.ruachChat;
    if (!p || !p.exists || !chat) return;
    var c = collect(), look = c.look, scenes = c.scenes, todo = [];
    p.shots.forEach(function (s, i) { if (!SCENE.some(function (k) { return scenes[i][k]; })) todo.push(i); });
    if (!todo.length) { say(tr("every shot has its scene: empty one to have it written again")); return; }
    state.busy = true; paint();
    var started = Date.now(), done = 0;
    chat.refresh().then(function (st) {
      if (!st.configured || !st.available || !st.use) throw new Error(tr("The Writer's chat server is not ready: Engine → Writer and Artwork"));
      var model = st.use;
      var next = function () {
        if (!todo.length) return Promise.resolve();
        var part = todo.splice(0, BATCH);
        say(tr("writing the scenes: {0} of {1}").replace("{0}", done).replace("{1}", done + part.length + todo.length) + " · " + Math.round((Date.now() - started) / 1000) + " s");
        var msg = { title: p.title, style: p.style, brief: c.brief || "", look: look, shots: part.map(function (i) { var s = p.shots[i]; return { i: i + 1, time: clock(s.t0) + "–" + clock(s.t1), section: s.section, words: s.words || "(music alone)" }; }) };
        return chat.complete([{ role: "system", content: SYSTEM }, { role: "user", content: JSON.stringify(msg) }], model, 4096, null, 0.8).then(function (r) {
          var got = loose((((r.choices || [])[0] || {}).message || {}).content);
          if (!got) throw new Error(tr("The Writer did not answer in JSON. Try again, or load another model."));
          if (got.look) LOOK.forEach(function (k) { if (!look[k] && got.look[k]) look[k] = String(got.look[k]); });
          (got.scenes || []).forEach(function (sc) { var i = (+sc.i || 0) - 1; if (part.indexOf(i) >= 0) SCENE.forEach(function (k) { if (sc[k]) scenes[i][k] = String(sc[k]); }); });
          done += part.length;
          return api("/video/save", { name: p.name, look: look, scenes: scenes }).then(function (q) { state.plan = q; state.dirty = false; paint(); }).then(next);
        });
      };
      return next();
    }).then(function () { state.busy = false; paint(); say(tr("the scenes are written ({0} s)").replace("{0}", Math.round((Date.now() - started) / 1000))); })
      .catch(function (e) { state.busy = false; paint(); say(e.message, true); });
  }
  // HERESY 1946: the plan as an editor's project: the lab gathers it (OTIO, EDL, SRT, the shots' media, the sound) into a zip, the page saves it
  function editExport() {
    var t = state.take;
    if (!t || state.editing) return;
    state.editing = true; paint(); say(tr("the editor's project: gathering the shots…"));
    settled().then(function () { return api("/video/edit", { name: t.name }); }).then(function (b) {
      state.editing = false; paint();
      if (state.take !== t) return;
      say(tr("the editor's project: {0} shots, {1} MB").replace("{0}", b.shots).replace("{1}", (b.size / 1048576).toFixed(1)));
      var a = document.createElement("a");
      a.href = "/lab/video/edit.zip?name=" + encodeURIComponent(t.name) + "&t=" + Date.now();
      a.download = (t.title || t.name) + " · edit.zip";
      document.body.appendChild(a); a.click(); a.remove();
    }).catch(function (e) { state.editing = false; paint(); say(e.message, true); });
  }
  // HERESY 1947: the cuts between shots on the take's beats, or back where they were sung
  function beatCuts() {
    var t = state.take, p = state.plan;
    if (!t || !p || !p.exists || state.beating) return;
    var undo = p.shots.some(function (s) { return s.as_sung; });
    state.beating = true; paint(); if (!undo) say(tr("hearing the take's beats…"));
    settled().then(function () { return api("/video/beats", { name: t.name, undo: undo }); }).then(function (b) {
      state.beating = false;
      if (state.take !== t) return paint();
      if (b.plan) { state.plan = b.plan; state.dirty = false; }
      paint();
      say(undo ? tr("{0} cuts back where they were sung").replace("{0}", b.undone)
               : tr("{0} of {1} cuts on the beat ({2} bpm), moved {3} ms on average").replace("{0}", b.moved).replace("{1}", b.cuts).replace("{2}", b.tempo).replace("{3}", b.mean_ms));
    }).catch(function (e) { state.beating = false; paint(); say(e.message, true); });
  }
  function storyboard() {
    var p = state.plan;
    if (!p || !p.exists) return;
    var c = collect(), lines = ["# " + p.title, "", "Style: " + p.style, "", "## Look", ""];
    LOOK.forEach(function (k) { if (c.look[k]) lines.push("- **" + k + "**: " + c.look[k]); });
    lines.push("", "## Shots", "");
    p.shots.forEach(function (s, i) {
      var sc = c.scenes[i];
      lines.push("### " + (i + 1) + " · " + clock(s.t0) + "–" + clock(s.t1) + " · " + (s.section || ""), "", s.words ? "> " + s.words : "> (music alone)", "");
      SCENE.forEach(function (k) { if (sc[k]) lines.push("- **" + k + "**: " + sc[k]); });
      if (SCENE.some(function (k) { return sc[k]; })) lines.push("", "Prompt:", "", "```", promptOf(i), "```");   // HERESY 1830: as ⧉ copies it
      lines.push("");
    });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/markdown" }));
    a.download = (p.title || p.name).replace(/[\\/:*?"<>|]+/g, " ").trim() + " · storyboard.md";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }

  // HERESY 1827: a take found by words of its title or style, from the room itself
  // HERESY 1940 («Оформи поиск модалкой, с навигацией по воркспейсам»): in a window: the Library's workspaces on the left (its tree), the takes of the one
  // chosen on the right, words narrowing them; Enter takes the first, ↓ ↑ walk the list, Esc closes
  var FIND = { ws: "" };
  try { FIND.ws = localStorage.getItem("yue2.vdFindWs") || ""; } catch (e) { /* private window */ }
  function wsOf(name) { var Cn = window.HeresyCollection, r = Cn && Cn.row ? Cn.row(name) : null; return r && r.workspaces ? r.workspaces : []; }
  function find(q) {
    var box = $("vdFound"), takes = window.ruachTakes ? window.ruachTakes() : [], words = String(q || "").toLowerCase().split(/\s+/).filter(Boolean), ws = FIND.ws, seen = {};
    var all = window.ruachFindTakeFull || null, hits = takes.filter(function (t) {
      if (seen[t.name]) return false;
      seen[t.name] = 1;
      if (ws && !wsOf(t.name).some(function (w) { return w === ws || w.indexOf(ws + " / ") === 0; })) return false;
      if (!words.length) return true;
      var full = all ? all(t.name) : null, hay = (t.title + " " + t.name + " " + (full && full.style ? full.style : "")).toLowerCase();
      return words.every(function (w) { return hay.indexOf(w) >= 0; });
    }).slice(0, 200);
    box.innerHTML = hits.length ? hits.map(function (t) {
      return '<button type="button" class="vd-hit" data-vdtake="' + esc(t.name) + '" translate="no"><span class="vd-hit-name">' + esc(t.title) + '</span><span class="vd-hit-sub mono">' + esc(String(t.name).slice(0, 15)) + "</span></button>";
    }).join("") : '<div class="vd-none">' + esc(tr("no take found")) + "</div>";
    box.hidden = false;
  }
  function findWs() {
    var Cn = window.HeresyCollection, list = Cn && Cn.workspaces ? Cn.workspaces() : [], order = window.ruachTreeOrder ? window.ruachTreeOrder(list) : list.slice().sort();
    if (FIND.ws && list.length && list.indexOf(FIND.ws) < 0) FIND.ws = "";
    $("vdFindWs").innerHTML = '<button type="button" class="vd-ws' + (FIND.ws ? "" : " is-on") + '" data-vdws="">' + esc(tr("All takes")) + "</button>" + order.map(function (w) {
      var p = w.split(" / ");
      return '<button type="button" class="vd-ws d' + p.length + (FIND.ws === w ? " is-on" : "") + '" data-vdws="' + esc(w) + '" translate="no">' + esc(p.length > 1 ? "\u21b3 " + p[p.length - 1] : w) + "</button>";
    }).join("");
  }
  function findOpen() {
    var Cn = window.HeresyCollection, win = $("vdFindWin");
    win.hidden = false; findWs(); find($("vdFind").value);
    if (Cn && Cn.loaded && !Cn.loaded() && Cn.reload) Cn.reload().then(function () { if (!win.hidden) { findWs(); find($("vdFind").value); } }).catch(function () { /* the lab away: All takes still */ });
    setTimeout(function () { $("vdFind").focus(); $("vdFind").select(); }, 0);
  }
  function findClose() { $("vdFindWin").hidden = true; }
  // HERESY 1940 («Возможность распашки на полный экран как в DAW и Piano Roll»): the room over the whole screen as the DAW goes (1499), the window full screen
  // when the browser lets it; the button, F11 in the room, Esc back; another room leaves it
  function vdIsFull() { return document.body.classList.contains("vd-full"); }
  function vdSetFull(on) {
    var root = document.documentElement;
    document.body.classList.toggle("vd-full", !!on);
    if (on) { if (root.requestFullscreen && !document.fullscreenElement) root.requestFullscreen().catch(function () { /* the window alone */ }); }
    else if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function () { /* gone already */ });
    fullPaint();
    setTimeout(function () { if (state.plan && state.plan.exists) { tlPaint(); vpRefresh(); } }, 80);
  }
  function fullPaint() {
    var b = $("vdFull"), on = vdIsFull(), I = window.HeresyIcons;
    if (!b) return;
    b.setAttribute("aria-pressed", on ? "true" : "false"); b.setAttribute("aria-label", tr(on ? "Back from full screen" : "Full screen"));
    b.innerHTML = I && I.ui ? I.ui(on ? "minimize" : "maximize") : (on ? "\u2921" : "\u26f6");
  }
  // HERESY 1837: the animatic: the plan in the song's time, a frame a shot over the take's cover, with its sound (the lab draws it on the processor)
  function animShow(info) {
    var box = $("vdAnim"), v = $("vdAnimVideo"), get = $("vdAnimGet"), t = state.take;
    if (!box) return;
    box.hidden = !(info && info.exists && t);
    if (box.hidden) return;
    var src = "/lab/video/animatic.mp4?name=" + encodeURIComponent(t.name) + "&t=" + Math.round(info.made || 0);
    if (v.getAttribute("src") !== src) v.setAttribute("src", src);
    get.href = src; get.download = (t.title || t.name) + " · animatic.mp4";
  }
  function animLoad() {
    var t = state.take;
    if (!t || t.session) return animShow(null);
    api("/video/animatic?name=" + encodeURIComponent(t.name)).then(function (b) {
      if (state.take !== t) return;
      if (b.__status === 202) {
        state.anim = "running"; paint(); say(tr("the animatic: {0} %").replace("{0}", Math.round((b.progress || 0) * 100)));
        return setTimeout(animLoad, 2000);
      }
      var was = state.anim; state.anim = ""; animShow(b); paint();
      if (was === "running" && b.exists) say(tr("the animatic: {0} %").replace("{0}", 100));
    }).catch(function (e) {                            // said only when one was being drawn: a lab without it says nothing
      if (state.take !== t) return;
      var was = state.anim; state.anim = ""; animShow(null); paint();
      if (was === "running") say(e.message, true);
    });
  }
  function animMake() {
    var t = state.take, labels = {};
    if (!t) return;
    SCENE.forEach(function (k) { labels[k] = tr(LABEL[k]); });
    state.anim = "running"; paint(); say(tr("the animatic: {0} %").replace("{0}", 0));
    api("/video/animatic", { name: t.name, labels: labels }).then(function () { setTimeout(animLoad, 1200); })
      .catch(function (e) { state.anim = ""; paint(); say(e.message, true); });
  }
  // HERESY 1838: a shot's own picture (one of the Artist's, or from the disk) and the clip cut from them in the song's time (the lab, on the processor)
  function picUrl(f) { return "/lab/video/frame?name=" + encodeURIComponent(state.take.name) + "&f=" + encodeURIComponent(f); }
  function picSlot(s, i) {
    var tip = tr(s.frame ? "This shot's picture: a click changes it" : "Give this shot a picture");
    return '<button type="button" class="vd-pic' + (s.frame ? " is-set" : "") + '" data-vdpic="' + i + '" data-tip="' + esc(tip) + '" aria-label="' + esc(tip) + '">' +
      (s.frame ? '<img src="' + esc(picUrl(s.frame)) + '" alt="" loading="lazy" />' : '<span aria-hidden="true">🖼</span>') + "</button>";
  }
  var pickAt = -1;
  function pickClose() { var el = $("vdPick"); if (el) el.hidden = true; pickAt = -1; }
  function pickPlace(el, anchor) {
    var r = anchor.getBoundingClientRect(), w = Math.min(600, window.innerWidth - 24), below = window.innerHeight - r.bottom;
    el.style.width = w + "px";
    el.style.left = Math.max(12, Math.min(r.left, window.innerWidth - w - 12)) + "px";
    if (below > 360 || below > r.top) { el.style.top = (r.bottom + 6) + "px"; el.style.bottom = ""; }
    else { el.style.bottom = (window.innerHeight - r.top + 6) + "px"; el.style.top = ""; }
  }
  function pickOpen(i, anchor) {
    var hero = i === HERO_PICK, el = $("vdPick"), s = hero ? (state.plan && state.plan.exists ? {} : null) : state.plan && state.plan.shots[i];   // HERESY 1913: the hero's picture too
    if (!s) return;
    if (!el) {
      el = document.createElement("div"); el.id = "vdPick"; el.className = "vd-pick"; el.hidden = true; el.setAttribute("role", "dialog");
      $("view-video").appendChild(el);
    }
    pickAt = i;
    el.innerHTML = '<div class="vd-pick-head"><b>' + esc(tr(hero ? "The hero: a picture of the Artist" : "Pictures of the Artist")) + "</b>" +
      (hero ? "" : '<button type="button" class="btn ghost small" data-vdpickdisk="1">' + esc(tr("From disk…")) + "</button>") +
      (s.frame ? '<button type="button" class="btn ghost small" data-vdpickoff="1">' + esc(tr("Take the picture off")) + "</button>" : "") +
      '<button type="button" class="btn ghost small" data-vdpickx="1" data-tip="' + esc(tr("Close (Esc)")) + '" aria-label="' + esc(tr("Close (Esc)")) + '">✕</button></div>' +
      '<div class="vd-pick-grid" id="vdPickGrid"><span class="vd-none">…</span></div>';
    pickPlace(el, anchor); el.hidden = false;
    api("/artist/runs").then(function (b) {
      if (pickAt !== i) return;
      var pics = [];
      (b.runs || []).forEach(function (r) {
        (r.pictures || []).forEach(function (p) { if (p.file && p.kept !== false && !p.aside) pics.push({ run: r.id, file: p.file, thumb: p.thumb || p.file, shape: p.shape || "", wide: p.shape === "16:9" ? 1 : 0 }); });
      });
      pics.sort(function (a, b) { return b.wide - a.wide; });   // the wide ones first, each kind the newest first
      $("vdPickGrid").innerHTML = pics.length ? pics.map(function (p) {
        return '<button type="button" class="vd-pick-it" data-vdrun="' + esc(p.run) + '" data-vdfile="' + esc(p.file) + '" data-tip="' + esc(p.shape + " · " + p.file) + '">' +
          '<img src="/lab/artist/file?id=' + encodeURIComponent(p.run) + "&file=" + encodeURIComponent(p.thumb) + '" alt="" loading="lazy" /><span class="tag">' + esc(p.shape) + "</span></button>";
      }).join("") : '<span class="vd-none">' + esc(tr("No pictures in the Artist yet: draw them there, or take one from disk")) + "</span>";
    }).catch(function (e) { if (pickAt === i) $("vdPickGrid").innerHTML = '<span class="vd-none">' + esc(e.message) + "</span>"; });
  }
  function settled() { return state.dirty ? save() : Promise.resolve(); }   // the scenes being written are kept before the plan comes back
  function framed(t, i, said) {
    return function (q) { if (state.take !== t) return; state.plan = q; paint(); say(tr(said).replace("{0}", i + 1)); };
  }
  function pickRun(run, file) {
    var i = pickAt, t = state.take;
    pickClose();
    if (i === HERO_PICK) {                                // HERESY 1913: the clip's hero
      settled().then(function () { return api("/video/hero", { name: t.name, run: run, file: file }); })
        .then(function (q) { if (state.take !== t) return; state.plan = q; paint(); say(tr("the hero is set")); }).catch(function (e) { say(e.message, true); });
      return;
    }
    settled().then(function () { return api("/video/frame", { name: t.name, i: i, run: run, file: file }); })
      .then(framed(t, i, "shot {0}: its picture is set")).catch(function (e) { say(e.message, true); });
  }
  function pickOff() {
    var i = pickAt, t = state.take;
    pickClose();
    settled().then(function () { return api("/video/frame", { name: t.name, i: i, off: true }); })
      .then(framed(t, i, "shot {0}: its picture is taken off")).catch(function (e) { say(e.message, true); });
  }
  function pickDisk() {
    var inp = $("vdPickFile"), t = state.take;
    if (!inp) {
      inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*"; inp.id = "vdPickFile"; inp.hidden = true;
      $("view-video").appendChild(inp);
      inp.addEventListener("change", function () {
        var f = inp.files && inp.files[0], i = +inp.dataset.i, tk = state.take;
        inp.value = "";
        if (!f || !tk) return;
        settled().then(function () {
          return fetch("/lab/video/frame-upload?name=" + encodeURIComponent(tk.name) + "&i=" + i, { method: "POST", body: f })
            .then(function (r) { return r.json().then(function (b) { if (!r.ok) throw new Error(b.error || r.status); return b; }); });
        }).then(framed(tk, i, "shot {0}: its picture is set")).catch(function (e) { say(e.message, true); });
      });
    }
    inp.dataset.i = pickAt;
    pickClose();
    if (t) inp.click();
  }
  function clipShape() { var s = $("vdClipShape"); return s && s.value ? s.value : "16:9"; }   // HERESY 1917
  function clipShow(info) {
    var box = $("vdClipBox"), v = $("vdClipVideo"), get = $("vdClipGet"), t = state.take;
    if (!box) return;
    box.hidden = !(info && info.exists && t);
    if (box.hidden) return;
    var sh = clipShape(), tag = sh === "16:9" ? "" : sh.replace(":", "x");   // HERESY 1917: the shape's own clip, standing as it is
    var src = "/lab/video/clip.mp4?name=" + encodeURIComponent(t.name) + (tag ? "&shape=" + encodeURIComponent(sh) : "") + "&t=" + Math.round(info.made || 0);
    if (v.getAttribute("src") !== src) v.setAttribute("src", src);
    v.className = tag ? "is-" + tag : "";
    get.href = src; get.download = (t.title || t.name) + " · clip" + (tag ? " " + tag : "") + ".mp4";
  }
  function clipLoad() {
    var t = state.take;
    if (!t || t.session) return clipShow(null);
    var sh = clipShape();                              // HERESY 1917: the clip of the shape chosen
    api("/video/clip?name=" + encodeURIComponent(t.name) + (sh === "16:9" ? "" : "&shape=" + encodeURIComponent(sh))).then(function (b) {
      if (state.take !== t || clipShape() !== sh) return;
      if (b.__status === 202) {
        state.clip = "running"; paint(); say(tr("the clip: {0} %").replace("{0}", Math.round((b.progress || 0) * 100)));
        return setTimeout(clipLoad, 2000);
      }
      var was = state.clip; state.clip = ""; clipShow(b); paint();
      if (was === "running" && b.exists) {
        var shots = (state.plan && state.plan.shots) || [];
        say(tr("the clip: {0} of {1} shots with their own picture").replace("{0}", shots.filter(function (s) { return s.frame; }).length).replace("{1}", shots.length));
      }
    }).catch(function (e) {                            // said only when one was being cut: a lab without it says nothing
      if (state.take !== t || clipShape() !== sh) return;
      var was = state.clip; state.clip = ""; clipShow(null); paint();
      if (was === "running") say(e.message, true);
    });
  }
  function clipMake() {
    var t = state.take, labels = {};
    if (!t) return;
    SCENE.forEach(function (k) { labels[k] = tr(LABEL[k]); });   // a shot with nothing to show, in a take with no cover, shows its scene
    state.clip = "running"; paint(); say(tr("the clip: {0} %").replace("{0}", 0));
    var lyr = !!state.clipLyrics, btw = $("vdClipBetween") ? $("vdClipBetween").value : "cut";   // HERESY 1916
    settled().then(function () { return api("/video/clip", { name: t.name, labels: labels, lyrics: lyr, between: btw, shape: clipShape(), titles: !!state.clipTitles }); }).then(function () { setTimeout(clipLoad, 1200); })
      .catch(function (e) { state.clip = ""; paint(); say(e.message, true); });
  }
  // HERESY 1830: a shot as a video model reads it: its scene, then the clip's look, then its length (the fields as they stand, saved or not)
  function promptOf(i) {
    var c = collect(), s = state.plan.shots[i], sc = c.scenes[i] || {}, L = c.look, out = [];
    if (sc.shot) out.push(sc.shot);
    if (sc.camera) out.push("Camera: " + sc.camera);
    if (sc.motion) out.push("Motion: " + sc.motion);
    if (sc.light) out.push("Light and colour: " + sc.light);
    if (L.characters) out.push("Characters: " + L.characters);
    if (L.setting) out.push("Setting: " + L.setting);
    if (L.palette) out.push("Palette: " + L.palette);
    if (L.notes) out.push("Notes: " + L.notes);
    out.push("Length: " + (s.t1 - s.t0).toFixed(1) + " s");
    return out.join("\n");
  }
  // HERESY 1839: a shot as a picture model reads it: what is seen, who and where, the framing, the light and colours (no motion, no length)
  function picturePromptOf(i) {
    var c = collect(), sc = c.scenes[i] || {}, L = c.look, out = [];
    if (sc.shot) out.push(sc.shot);
    if (L.characters) out.push(L.characters);
    if (L.setting) out.push("Setting: " + L.setting);
    if (sc.camera) out.push("Framing: " + sc.camera);
    if (sc.light) out.push("Light and colour: " + sc.light);
    if (L.palette) out.push("Palette: " + L.palette);
    out.push("A still frame of a music video, no text.");
    return out.join("\n");
  }
  function toArtist(i) {
    if (!state.plan || !state.plan.shots[i] || !window.HeresyArtist || !window.HeresyArtist.form) return;
    window.HeresyArtist.form(picturePromptOf(i), "16:9", tr("In the form: shot {0}'s picture, wide. Once drawn, give it to the shot from its slot in the Videographer").replace("{0}", i + 1));
    var tab = document.querySelector('.topbar [data-tab="artist"]');
    if (tab) tab.click();
  }
  function play(i) {
    var s = state.plan && state.plan.shots[i];
    if (s && state.take && window.ruachSeekTake) window.ruachSeekTake(state.take, s.t0);
  }
  function copyPrompt(i) {
    if (!state.plan || !state.plan.shots[i] || !window.ruachCopyText) return;
    window.ruachCopyText(promptOf(i)).then(function () { say(tr("shot {0}: its prompt is copied").replace("{0}", i + 1)); }, function (e) { say(e.message, true); });
  }
  // HERESY 1830: the strip follows the player on this take: a line where it stands, its shot lit there and in the list, the list scrolled to it
  // while it plays unless a scene is being written. A number given is a time to show (the checks)
  var nowAt = -2;
  function follow(at) {
    var p = state.plan, head = $("vdNow"), a = $("audio"), pt = window.ruachPlayerTake ? window.ruachPlayerTake() : null;
    if (!head || !p || !p.exists) return;
    var test = typeof at === "number", t = test ? at : (a ? a.currentTime || 0 : 0), i = -1;
    var on = test || !!(a && pt && state.take && pt.name === state.take.name && a.getAttribute("src"));
    if (on) for (var k = 0; k < p.shots.length; k++) if (t >= p.shots[k].t0 && t < p.shots[k].t1) { i = k; break; }
    var b = i >= 0 ? document.querySelector('#vdStrip [data-vdgo="' + i + '"]') : null;
    head.hidden = !b;
    if (b) head.style.left = (b.offsetLeft + Math.min(1, (t - p.shots[i].t0) / Math.max(0.01, p.shots[i].t1 - p.shots[i].t0)) * b.offsetWidth).toFixed(1) + "px";
    if (i === nowAt) return;
    nowAt = i;
    Array.prototype.forEach.call(document.querySelectorAll("#vdStrip .is-now, #vdShots .is-now"), function (el) { el.classList.remove("is-now"); });
    var card = i >= 0 ? $("vdShot" + i) : null;
    if (b) b.classList.add("is-now");
    if (!card) return;
    card.classList.add("is-now");
    if (!test && a && !a.paused && !$("vdShots").contains(document.activeElement) && document.body.dataset.tab === "video") shotCur(i);   // HERESY 1940: its tab, no scrolling
  }
  // HERESY 1860 (Viktor 29.10.2026: «Плеер сейчас обычный браузерный. Прикрути удобный в YT стиле»): the animatic's and the clip's player in the manner
  // of YouTube: a big ▶ while it stands, the bar with what has come and the shots as its chapters, the time and the shot's words under the pointer, the
  // shot before and after, the sound, the speed, the theatre and the full screen; YouTube's keys on it; the bar fades while it plays and the pointer rests
  var VPI = {
    play: '<path d="M8 5.5v13l10.5-6.5z"/>',
    pause: '<path d="M7 5h3.6v14H7zM13.4 5H17v14h-3.6z"/>',
    prev: '<path d="M6 6h2v12H6zM9.5 12L18 6v12z"/>',
    next: '<path d="M16 6h2v12h-2zM6 6l8.5 6L6 18z"/>',
    vol: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15 9a4 4 0 0 1 0 6M17.5 6.5a7.5 7.5 0 0 1 0 11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    mute: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9.5l5 5M20.5 9.5l-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    theatre: '<rect x="3" y="7" width="18" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/>',
    full: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
    unfull: '<path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>'
  };
  function vpSvg(k) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + VPI[k] + "</svg>"; }
  function vpBtn(k, label) { return '<button type="button" class="vp-btn" data-vp="' + k + '" aria-label="' + esc(tr(label)) + '" data-tip="' + esc(tr(label)) + '">' + vpSvg(k) + "</button>"; }
  function vpClock(t) { t = Math.max(0, Math.floor(t || 0)); var m = Math.floor(t / 60), s = t % 60; return m + ":" + (s < 10 ? "0" : "") + s; }
  function vpShots() { var p = state.plan; return p && p.exists && p.shots ? p.shots : []; }
  function vpShotAt(t) {
    var sh = vpShots();
    for (var i = 0; i < sh.length; i++) if (t >= sh[i].t0 && t < sh[i].t1) return i;
    return sh.length && t >= sh[sh.length - 1].t1 ? sh.length - 1 : -1;
  }
  function vpTheatre(on) {
    var f = document.querySelector("#view-video .vd-films");
    if (!f) return;
    f.classList.toggle("is-theatre", on);
    try { if (on) localStorage.setItem("yue2.vdTheatre", "1"); else localStorage.removeItem("yue2.vdTheatre"); } catch (e) { /* private window */ }
    Array.prototype.forEach.call(f.querySelectorAll(".vp"), function (b) { if (b._vp) b._vp.paint(); });
  }
  function vpAttach(v) {
    if (!v || v.dataset.vp) return;
    v.dataset.vp = "1"; v.removeAttribute("controls");
    var box = document.createElement("div");
    box.className = "vp is-paused"; box.tabIndex = 0;
    v.parentNode.insertBefore(box, v); box.appendChild(v);
    box.insertAdjacentHTML("beforeend",
      '<button type="button" class="vp-big" data-vp="play" aria-label="' + esc(tr("Play")) + '">' + vpSvg("play") + "</button>" +
      '<div class="vp-ctl"><div class="vp-rail"><div class="vp-chaps"></div><i class="vp-buf"></i><i class="vp-done"></i><i class="vp-knob"></i>' +
        '<span class="vp-tip"><b class="mono"></b><span translate="no"></span></span></div>' +
      '<div class="vp-row">' + vpBtn("play", "Play (k)") + vpBtn("prev", "The shot before (Shift+P)") + vpBtn("next", "The shot after (Shift+N)") +
        '<span class="vp-vol">' + vpBtn("vol", "Mute (m)") + '<input type="range" class="vp-volr" min="0" max="1" step="0.05" aria-label="' + esc(tr("Volume")) + '"></span>' +
        '<span class="vp-time mono"></span><span class="vp-chap" translate="no"></span><span class="vp-gap"></span>' +
        '<button type="button" class="vp-btn vp-rate mono" data-vp="rate" aria-label="' + esc(tr("Speed")) + '" data-tip="' + esc(tr("Speed")) + '">1×</button>' +
        vpBtn("theatre", "Theatre (t)") + vpBtn("full", "Full screen (f)") + "</div></div>");
    var q = function (s) { return box.querySelector(s); }, rail = q(".vp-rail"), idle = 0, drag = false;
    var label = function (b, text) { b.setAttribute("aria-label", tr(text)); b.dataset.tip = tr(text); };
    function paint() {
      var d = isFinite(v.duration) ? v.duration : 0, t = v.currentTime || 0, f = d ? Math.min(1, t / d) : 0, pb = q('.vp-row [data-vp="play"]');
      box.classList.toggle("is-paused", v.paused);
      pb.innerHTML = vpSvg(v.paused ? "play" : "pause"); label(pb, v.paused ? "Play (k)" : "Pause (k)");
      q(".vp-done").style.width = (100 * f).toFixed(3) + "%"; q(".vp-knob").style.left = (100 * f).toFixed(3) + "%";
      var got = 0;
      for (var i = 0; i < v.buffered.length; i++) if (v.buffered.start(i) <= t + 0.5) got = Math.max(got, v.buffered.end(i));
      q(".vp-buf").style.width = (d ? Math.min(100, 100 * got / d) : 0).toFixed(3) + "%";
      q(".vp-time").textContent = vpClock(t) + " / " + vpClock(d);
      var at = vpShotAt(t), sh = vpShots()[at];
      q(".vp-chap").textContent = sh ? "· " + (at + 1) + " · " + (sh.section || "") + (sh.words ? " · " + sh.words : "") : "";
      var hush = v.muted || v.volume === 0, vb = q('[data-vp="vol"]');
      vb.innerHTML = vpSvg(hush ? "mute" : "vol"); label(vb, hush ? "Unmute (m)" : "Mute (m)");
      if (document.activeElement !== q(".vp-volr")) q(".vp-volr").value = hush ? 0 : v.volume;
      q('[data-vp="rate"]').textContent = (v.playbackRate || 1) + "×";
      var fs = document.fullscreenElement === box, fb = q('[data-vp="full"]'), films = box.closest(".vd-films"), th = !!(films && films.classList.contains("is-theatre"));
      fb.innerHTML = vpSvg(fs ? "unfull" : "full"); label(fb, fs ? "Exit full screen (f)" : "Full screen (f)");
      label(q('[data-vp="theatre"]'), th ? "Default view (t)" : "Theatre (t)");
    }
    function chaps() {
      var d = isFinite(v.duration) ? v.duration : 0, sh = vpShots();
      q(".vp-chaps").innerHTML = d && sh.length > 1 ? sh.slice(1).map(function (s) { return '<i style="left:' + (100 * s.t0 / d).toFixed(3) + '%"></i>'; }).join("") : "";
    }
    function seek(t) { var d = isFinite(v.duration) ? v.duration : 0; if (d) v.currentTime = Math.max(0, Math.min(d - 0.05, t)); paint(); }
    function shot(dir) {
      var sh = vpShots(), at = vpShotAt(v.currentTime);
      if (!sh.length) return seek(v.currentTime + dir * 10);
      if (dir < 0 && at >= 0 && v.currentTime - sh[at].t0 > 2) return seek(sh[at].t0);   // as YouTube: back to this shot's start first
      seek(sh[Math.max(0, Math.min(sh.length - 1, at + dir))].t0 + 0.01);
    }
    function toggle() { if (v.paused) v.play().catch(function () {}); else v.pause(); }
    function wake() {
      box.classList.add("is-awake"); clearTimeout(idle);
      idle = setTimeout(function () { if (!v.paused && !drag) box.classList.remove("is-awake"); }, 2500);
    }
    function full() { if (document.fullscreenElement === box) document.exitFullscreen().catch(function () {}); else if (box.requestFullscreen) box.requestFullscreen().catch(function () {}); }
    function rate() {
      var rates = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2], now = v.playbackRate || 1;
      if (document.fullscreenElement || !window.HeresyMenu) { v.playbackRate = rates[(rates.indexOf(now) + 1) % rates.length] || 1; return; }   // no menu over a full screen: the next speed
      var b = q('[data-vp="rate"]').getBoundingClientRect();
      window.HeresyMenu.open(b.left, b.top, rates.map(function (r) {
        return { label: r === 1 ? "Normal" : r + "×", raw: r !== 1, checked: r === now, action: function () { v.playbackRate = r; } };
      }));
    }
    function at(e) { var r = rail.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / (r.width || 1))); }
    ["play", "pause", "timeupdate", "progress", "volumechange", "ratechange", "seeked", "emptied", "loadedmetadata", "durationchange"].forEach(function (n) {
      v.addEventListener(n, function () { if (n === "loadedmetadata" || n === "durationchange" || n === "emptied") chaps(); paint(); if (n === "play") wake(); });
    });
    v.addEventListener("play", function () { var au = $("audio"); if (au && !au.paused) au.pause(); });   // one sound at a time
    v.addEventListener("click", toggle);
    v.addEventListener("dblclick", full);
    document.addEventListener("fullscreenchange", paint);
    box.addEventListener("mousemove", wake);
    box.addEventListener("mouseleave", function () { if (!v.paused && !drag) box.classList.remove("is-awake"); });
    box.addEventListener("click", function (e) {
      var b = e.target.closest("[data-vp]");
      if (!b || !box.contains(b)) return;
      var k = b.dataset.vp;
      if (k === "play") toggle();
      else if (k === "prev") shot(-1);
      else if (k === "next") shot(1);
      else if (k === "vol") { v.muted = !v.muted; if (!v.muted && !v.volume) v.volume = 1; }
      else if (k === "rate") rate();
      else if (k === "theatre") vpTheatre(!(box.closest(".vd-films") || { classList: { contains: function () { return true; } } }).classList.contains("is-theatre"));
      else if (k === "full") full();
    });
    q(".vp-volr").addEventListener("input", function () { v.volume = +this.value; v.muted = +this.value === 0; });
    rail.addEventListener("pointerdown", function (e) { drag = true; box.classList.add("is-dragging"); try { rail.setPointerCapture(e.pointerId); } catch (x) { /* gone */ } seek(at(e) * (v.duration || 0)); });
    rail.addEventListener("pointermove", function (e) {
      var d = isFinite(v.duration) ? v.duration : 0, t = at(e) * d, i = vpShotAt(t), sh = vpShots()[i], tip = q(".vp-tip"), r = rail.getBoundingClientRect();
      tip.querySelector("b").textContent = vpClock(t);
      tip.querySelector("span").textContent = sh ? (i + 1) + " · " + (sh.words || sh.section || "") : "";
      tip.style.left = Math.max(60, Math.min(r.width - 60, at(e) * r.width)) + "px";
      if (drag) seek(t);
    });
    rail.addEventListener("pointerup", function () { drag = false; box.classList.remove("is-dragging"); wake(); });
    box.addEventListener("keydown", function (e) {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      var k = e.key, d = isFinite(v.duration) ? v.duration : 0, done = true;
      if (e.target.classList && e.target.classList.contains("vp-volr") && /^Arrow/.test(k)) return;   // the slider's own arrows
      if (k === " " || k === "k" || k === "K") toggle();
      else if (k === "j" || k === "J") seek(v.currentTime - 10);
      else if (k === "l" || k === "L") seek(v.currentTime + 10);
      else if (k === "ArrowLeft") seek(v.currentTime - 5);
      else if (k === "ArrowRight") seek(v.currentTime + 5);
      else if (k === "ArrowUp") { v.muted = false; v.volume = Math.min(1, Math.round((v.volume + 0.05) * 100) / 100); }
      else if (k === "ArrowDown") v.volume = Math.max(0, Math.round((v.volume - 0.05) * 100) / 100);
      else if (k === "m" || k === "M") v.muted = !v.muted;
      else if (k === "f" || k === "F") full();
      else if (k === "t" || k === "T") vpTheatre(!(box.closest(".vd-films") && box.closest(".vd-films").classList.contains("is-theatre")));
      else if (k === "N" && e.shiftKey) shot(1);
      else if (k === "P" && e.shiftKey) shot(-1);
      else if (/^[0-9]$/.test(k)) seek(d * +k / 10);
      else if (k === "Home") seek(0);
      else if (k === "End") seek(d);
      else if ((k === "," || k === ".") && v.paused) seek(v.currentTime + (k === "." ? 1 : -1) / 24);
      else done = false;
      if (done) { e.preventDefault(); e.stopPropagation(); wake(); }
    });
    box._vp = { paint: paint, chaps: chaps };
    chaps(); paint();
  }
  function vpRefresh() { Array.prototype.forEach.call(document.querySelectorAll("#view-video .vp"), function (b) { if (b._vp) { b._vp.chaps(); b._vp.paint(); } }); }
  // HERESY 1861 (Viktor 29.10.2026: «схлопывающуюся правую колонку по примеру Тренера/Художника, но именно для видеоклипов, их компонентов и прочего, —
  // мини библиотеку. И распахивать на пол экрана, с тайлами»): every take with a plan on the right, its clip, its animatic and its shots' pictures;
  // folded to a strip as the Trainer's runs, or opened to half the screen as tiles (both remembered)
  var SIDE = { plans: [], filter: "all", q: "", timer: 0, wide: false, folded: true };   // HERESY 1940: folded at first, out under the pointer
  try { SIDE.wide = localStorage.getItem("yue2.vdSideWide") === "1"; SIDE.filter = localStorage.getItem("yue2.vdSideFilter") || "all"; } catch (e) { /* private window */ }
  function sideKeep(k, v) { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (e) { /* private window */ } }
  // HERESY 1940 («Колонку с клипами справа сделай автоскрывающейся и канвас стабильным»): the clips slide out over the room under the pointer and hide when it
  // leaves (a moment later; never while their search is typed in: then a click elsewhere hides them); the canvas keeps its width
  function sideShow(on) {
    clearTimeout(SIDE.show); clearTimeout(SIDE.hide);
    if (SIDE.folded === !on) return;
    SIDE.folded = !on; sidePaint();
    if (on) sideLoad();
  }
  function sideLoad() { api("/video/plans").then(function (b) { SIDE.plans = b.plans || []; sidePaint(); }).catch(function () { SIDE.plans = []; sidePaint(); }); }
  function sideSoon() { clearTimeout(SIDE.timer); SIDE.timer = setTimeout(function () { if (document.body.dataset.tab === "video") sideLoad(); }, 800); }
  function frameUrl(name, f) { return "/lab/video/frame?name=" + encodeURIComponent(name) + "&f=" + encodeURIComponent(f); }
  function sidePaint() {
    var lay = $("vdLayout"), list = $("vdSideList");
    if (!lay || !list) return;
    lay.classList.toggle("is-folded", SIDE.folded); lay.classList.toggle("is-wide", SIDE.wide && !SIDE.folded);
    var wl = tr(SIDE.wide ? "Back to a column" : "Half the screen, as tiles");
    $("vdWide").setAttribute("aria-pressed", SIDE.wide ? "true" : "false"); $("vdWide").dataset.tip = wl; $("vdWide").setAttribute("aria-label", wl);
    Array.prototype.forEach.call(document.querySelectorAll("#vdSideTabs [data-vdside]"), function (b) { b.setAttribute("aria-pressed", b.dataset.vdside === SIDE.filter ? "true" : "false"); });
    var words = SIDE.q.toLowerCase().split(/\s+/).filter(Boolean), cur = state.take && state.take.name;
    var plans = SIDE.plans.filter(function (p) { var hay = String(p.title || p.name).toLowerCase(); return words.every(function (w) { return hay.indexOf(w) >= 0; }); });
    if (SIDE.filter === "clips") plans = plans.filter(function (p) { return (p.clip && p.clip.exists) || (p.animatic && p.animatic.exists); });
    $("vdSideCount").textContent = String(plans.length); $("vdUnfoldCount").textContent = String(SIDE.plans.length);
    list.classList.toggle("is-tiles", SIDE.wide || SIDE.filter === "pics");
    if (SIDE.filter === "pics") {
      var pics = [];
      plans.forEach(function (p) { (p.frames || []).forEach(function (fr) { pics.push({ p: p, fr: fr }); }); });
      list.innerHTML = pics.length ? pics.map(function (x) {
        return '<button type="button" class="vd-tile is-pic" data-vdside-take="' + esc(x.p.name) + '" data-vdside-shot="' + x.fr.i + '" data-pic="' + esc(frameUrl(x.p.name, x.fr.f)) + '">' +
          '<img src="' + esc(frameUrl(x.p.name, x.fr.f)) + '" alt="" loading="lazy"><span class="vd-tile-name" translate="no">' + esc(x.p.title || x.p.name) + "</span>" +
          '<span class="vd-tile-sub mono">' + esc(tr("shot {0}").replace("{0}", x.fr.i + 1)) + "</span></button>";
      }).join("") : '<p class="row-hint vd-side-none">' + esc(tr("No shot has a picture of its own yet")) + "</p>";
      return;
    }
    list.innerHTML = plans.length ? plans.map(function (p) {
      var fr = (p.frames || [])[0], img = fr ? frameUrl(p.name, fr.f) : "/lab/art?name=" + encodeURIComponent(p.name);
      var films = (p.clip && p.clip.exists ? '<button type="button" class="vd-film-btn" data-vdside-play="clip" data-tip="' + esc(tr("Play the clip")) + '">▶ ' + esc(tr("Clip")) + "</button>" : "") +
        (p.animatic && p.animatic.exists ? '<button type="button" class="vd-film-btn" data-vdside-play="animatic" data-tip="' + esc(tr("Play the animatic")) + '">▶ ' + esc(tr("Animatic")) + "</button>" : "");
      return '<div class="vd-tile' + (p.name === cur ? " is-on" : "") + '" data-vdside-take="' + esc(p.name) + '" role="button" tabindex="0">' +
        '<span class="vd-tile-pic"><img src="' + esc(img) + '" alt="" loading="lazy"></span>' +
        '<span class="vd-tile-name" translate="no">' + esc(p.title || p.name) + "</span>" +
        '<span class="vd-tile-sub mono">' + esc(tr("{0} shots · {1} written · {2} pictures").replace("{0}", p.shots || 0).replace("{1}", p.written || 0).replace("{2}", (p.frames || []).length)) + "</span>" +
        (films ? '<span class="vd-tile-films">' + films + "</span>" : "") + "</div>";
    }).join("") : '<p class="row-hint vd-side-none">' + esc(tr(SIDE.plans.length ? "Nothing here for these words" : "No plans yet: find a take above and make its plan")) + "</p>";
  }
  function sideOpen(name, then) {
    if (!window.ruachOpenTake || !window.ruachFindTakeFull || !window.ruachFindTakeFull(name)) return say(tr("This take is not in the studio's list"), true);
    window.ruachOpenTake(name);
    var t = window.ruachCurrentTake ? window.ruachCurrentTake() : null;
    if (t) window.HeresyVideo.take(t);
    sidePaint();
    if (!then) return;
    var n = 0, go = function () { if (then() || ++n > 40) return; setTimeout(go, 150); };
    setTimeout(go, 150);
  }
  function sidePlay(kind) {                               // the room's own film, once it is the take's
    var v = $(kind === "clip" ? "vdClipVideo" : "vdAnimVideo"), box = $(kind === "clip" ? "vdClipBox" : "vdAnim"), src = v ? v.getAttribute("src") || "" : "";
    if (!v || !box || box.hidden || !state.take || src.indexOf("name=" + encodeURIComponent(state.take.name) + "&") < 0) return false;
    box.scrollIntoView({ behavior: "smooth", block: "nearest" }); v.play().catch(function () {});
    return true;
  }
  function sideShot(i) { var el = $("vdShot" + i); if (!el) return false; el.scrollIntoView({ behavior: "smooth", block: "center" }); return true; }
  // HERESY 1864 (Viktor 29.10.2026: «Davinci Resolve стиль — это будет ахуй. Сразу предусмотри работу на двух мониторах»): the edit page. A program
  // monitor (the shot under the playhead: its picture, else the take's cover; its words; the timecode at 24 frames) beside the shot chosen; under
  // them the timeline: the ruler, the sections, V1 the shots, L1 their words, A1 the song's wave, the playhead. Resolve's tools and keys: A select,
  // B blade, Ctrl+B a cut at the playhead, an edit point dragged moves the cut, chosen and Delete joins the two, Ctrl+Z undoes (twenty steps, kept
  // by the lab); Space, J K L, ← → a frame (Shift: a second), ↑ ↓ the edit points, Home End, + − and Shift+Z the zoom, Ctrl and the wheel too.
  // «Program on another screen»: the monitor in a window of its own, on the other screen where the browser can place it
  var FPS = 24, TL = { pps: 0, fit: true, tool: "select", sel: -1, cut: -1, at: 0, peaks: null, peaksOf: "", win: null, mirror: "", drag: null, scrub: false };
  function tlTc(t) {
    t = Math.max(0, t || 0);
    var f = Math.floor(t * FPS + 1e-6), s = Math.floor(f / FPS), p2 = function (n) { return (n < 10 ? "0" : "") + n; };
    return p2(Math.floor(s / 3600)) + ":" + p2(Math.floor(s / 60) % 60) + ":" + p2(s % 60) + ":" + p2(f % FPS);
  }
  function tlShort(t) { var m = Math.floor(t / 60), s = Math.round(t - m * 60); return m + ":" + (s < 10 ? "0" : "") + s; }
  function tlShots() { var p = state.plan; return p && p.exists && p.shots ? p.shots : []; }
  function tlEnd() { var p = state.plan, sh = tlShots(); return (p && p.seconds) || (sh.length ? sh[sh.length - 1].t1 : 0); }
  function tlMine() { var au = $("audio"), pt = window.ruachPlayerTake ? window.ruachPlayerTake() : null; return !!(au && pt && state.take && pt.name === state.take.name && au.getAttribute("src")); }
  function tlNow() { return tlMine() ? $("audio").currentTime || 0 : TL.at; }
  function tlAt(t) { var sh = tlShots(); for (var i = 0; i < sh.length; i++) if (t >= sh[i].t0 && t < sh[i].t1) return i; return sh.length - 1; }
  function tlPps() {
    var box = $("tlScroll"), end = tlEnd();
    if (TL.fit || !TL.pps) TL.pps = end ? Math.max(2, ((box && box.clientWidth) || 800) - 4) / end : 10;
    return TL.pps;
  }
  function tlKind(sec) {
    var s = String(sec || "").toLowerCase();
    return /pre/.test(s) ? "pre" : /chorus|hook|refrain/.test(s) ? "chorus" : /verse/.test(s) ? "verse" : /bridge/.test(s) ? "bridge" :
      /intro/.test(s) ? "intro" : /outro|end/.test(s) ? "outro" : /instrumental|interlude|solo|break/.test(s) ? "inst" : "other";
  }
  function tlSeek(t) {
    t = Math.max(0, Math.min(tlEnd(), t)); TL.at = t;
    if (tlMine()) { try { $("audio").currentTime = t; } catch (e) { /* not seekable yet */ } }
    tlHead();
  }
  function tlZoom(pps) { TL.fit = false; TL.pps = Math.max(2, Math.min(512, pps)); if ($("tlZoom")) $("tlZoom").value = (Math.log(TL.pps) / Math.LN2).toFixed(1); tlPaint(); }
  function tlTool(k) {
    TL.tool = k;
    Array.prototype.forEach.call(document.querySelectorAll('#vdEdit [data-tlact="select"], #vdEdit [data-tlact="blade"]'), function (b) { b.setAttribute("aria-pressed", b.dataset.tlact === k ? "true" : "false"); });
    if ($("tl")) $("tl").classList.toggle("is-blade", k === "blade");
  }
  function tlPaint() {
    var box = $("vdEdit"), sh = tlShots();
    if (!box) return;
    box.hidden = !sh.length;
    if (!sh.length) return;
    if (TL.sel >= sh.length) TL.sel = -1;
    if (TL.cut >= sh.length - 1) TL.cut = -1;
    var pps = tlPps(), end = tlEnd(), W = Math.ceil(end * pps) + 2, px = function (t) { return (t * pps).toFixed(1) + "px"; };
    $("tlInner").style.width = W + "px";
    if (TL.fit && $("tlZoom")) $("tlZoom").value = (Math.log(pps) / Math.LN2).toFixed(1);
    var step = [1, 2, 5, 10, 15, 30, 60, 120].filter(function (s) { return s * pps >= 64; })[0] || 120, ticks = "";
    for (var t = 0; t <= end + 1e-6; t += step) ticks += '<span class="tl-tick mono" style="left:' + px(t) + '">' + tlShort(t) + "</span>";
    $("tlRuler").innerHTML = ticks;
    var runs = [];
    sh.forEach(function (s) { var r = runs[runs.length - 1]; if (r && r.sec === (s.section || "")) r.t1 = s.t1; else runs.push({ sec: s.section || "", t0: s.t0, t1: s.t1 }); });
    $("tlMarks").innerHTML = runs.map(function (r) {
      return '<span class="tl-sec" data-sec="' + tlKind(r.sec) + '" style="left:' + px(r.t0) + ";width:" + ((r.t1 - r.t0) * pps).toFixed(1) + 'px" translate="no">' + esc(r.sec) + "</span>";
    }).join("");
    $("tlV1").innerHTML = sh.map(function (s, i) {
      var pic = s.video ? shotThumb(s.video) : s.frame ? picUrl(s.frame) : "";   // HERESY 1868: its video's first frame first
      return '<div class="tl-clip' + (i === TL.sel ? " is-sel" : "") + (s.sung ? " is-sung" : "") + (pic ? " has-pic" : "") + (s.video ? " has-video" : "") + '" data-tl="' + i + '" style="left:' + px(s.t0) +
        ";width:" + Math.max(2, (s.t1 - s.t0) * pps - 1).toFixed(1) + "px" + (pic ? ";background-image:url(" + esc(pic) + ")" : "") + '"><b class="mono">' + (i + 1) + "</b></div>";
    }).join("") + sh.slice(0, -1).map(function (s, i) { return '<i class="tl-cut' + (i === TL.cut ? " is-sel" : "") + '" data-tlcut="' + i + '" style="left:' + px(s.t1) + '"></i>'; }).join("");
    $("tlL1").innerHTML = sh.map(function (s) {
      return s.words ? '<div class="tl-word" style="left:' + px(s.t0) + ";width:" + Math.max(2, (s.t1 - s.t0) * pps - 1).toFixed(1) + 'px" translate="no">' + esc(s.words) + "</div>" : "";
    }).join("");
    tlWave(W); tlHead(); tlInspect();
  }
  function tlWave(W) {
    var cv = $("tlWave"), take = state.take;
    if (!cv || !take) return;
    if (TL.peaksOf !== take.name && !take.session) {
      TL.peaksOf = take.name; TL.peaks = null;
      fetch("/library/peaks?name=" + encodeURIComponent(take.name)).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
        if (TL.peaksOf === take.name && d && d.peaks && d.peaks.length) { TL.peaks = d.peaks; tlWave(Math.ceil(tlEnd() * tlPps()) + 2); }
      }).catch(function () { /* no wave: the track stays bare */ });
    }
    var H = 44, dpr = window.devicePixelRatio || 1, w = Math.max(1, Math.min(W, 32000));
    cv.width = Math.round(w * dpr); cv.height = Math.round(H * dpr); cv.style.width = w + "px"; cv.style.height = H + "px";
    var g = cv.getContext("2d");
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, H);
    var pk = TL.peaks;
    if (!pk || !pk.length) return;
    g.fillStyle = getComputedStyle(cv).color;
    for (var x = 0; x < w; x++) { var v = Math.min(1, Math.abs(pk[Math.floor(x / w * pk.length)]) || 0), hh = Math.max(1, v * (H - 4)); g.fillRect(x, (H - hh) / 2, 1, hh); }
  }
  function tlHead() {
    var h = $("tlHead"), box = $("vdEdit");
    if (!h || !box || box.hidden) return;
    var t = tlNow(), x = t * tlPps(), sc = $("tlScroll");
    h.style.left = x.toFixed(1) + "px";
    $("tlTc").textContent = tlTc(t);
    if (tlMine() && !$("audio").paused && (x < sc.scrollLeft + 20 || x > sc.scrollLeft + sc.clientWidth - 40)) sc.scrollLeft = Math.max(0, x - sc.clientWidth * 0.2);   // it follows the playing
    var i = tlAt(t), s = tlShots()[i], take = state.take;
    var src = s && s.frame ? picUrl(s.frame) : take && !take.session ? "/lab/art?name=" + encodeURIComponent(take.name) : "";
    var pic = $("tlPic");
    if (pic.dataset.src !== src) { pic.dataset.src = src; pic.style.backgroundImage = src ? "url(" + src + ")" : ""; }
    var tv = $("tlVid"), au = $("audio"), vsrc = s && s.video ? shotVid(s.video) : "";   // HERESY 1868: the shot's video in step with the song
    if (tv) {
      if (tv.dataset.src !== vsrc) { tv.dataset.src = vsrc; if (vsrc) tv.src = vsrc; else tv.removeAttribute("src"); }
      tv.hidden = !vsrc;
      if (vsrc) {
        var want = Math.max(0, t - s.t0), playing = tlMine() && au && !au.paused;
        if (playing && tv.paused) { try { tv.currentTime = want; } catch (e) { /* not ready */ } tv.play().catch(function () {}); }
        else if (playing && Math.abs(tv.currentTime - want) > 0.3) { try { tv.currentTime = want; } catch (e) { /* not ready */ } }
        else if (!playing) { if (!tv.paused) tv.pause(); if (Math.abs((tv.currentTime || 0) - want) > 0.05) { try { tv.currentTime = want; } catch (e) { /* not ready */ } } }
      } else if (!tv.paused) tv.pause();
    }
    $("tlPWords").textContent = s ? s.words || "" : "";
    $("tlPTc").textContent = tlTc(t) + (s ? "  ·  " + (i + 1) + "/" + tlShots().length : "");
    tlMirror(src, s ? s.words || "" : "", $("tlPTc").textContent);
  }
  function tlInspect() {
    var el = $("tlInspect"), s = tlShots()[TL.sel];
    if (!el) return;
    if (!s) { el.innerHTML = '<p class="row-hint">' + esc(tr("Click a shot on the timeline to see it here")) + "</p>"; return; }
    var sc = s.scene || {};
    el.innerHTML = '<div class="tl-ihead"><b class="mono">' + (TL.sel + 1) + '</b><span class="mono">' + tlTc(s.t0) + " – " + tlTc(s.t1) + " · " + (s.t1 - s.t0).toFixed(2) + ' s</span>' +
      '<span class="tag" translate="no">' + esc(s.section || "") + "</span></div>" + (s.words ? '<p class="tl-iwords" translate="no">' + esc(s.words) + "</p>" : "") +
      SCENE.map(function (k) { return sc[k] ? '<p class="tl-iscene"><span class="label">' + esc(tr(LABEL[k])) + '</span> <span translate="no">' + esc(sc[k]) + "</span></p>" : ""; }).join("") +
      '<button type="button" class="btn ghost small" data-tlcard="' + TL.sel + '">' + esc(tr("Its card in Shots")) + "</button>";   // HERESY 1961: the room beside, not below
  }
  function tlCuts() { return tlShots().map(function (s) { return [s.t0, s.t1]; }); }
  function tlParents() { return tlShots().map(function (s, i) { return i; }); }
  function tlPost(cuts, parents, said) {
    var t = state.take;
    if (!t || state.busy) return;
    state.busy = true; paint();
    settled().then(function () { return api("/video/cuts", cuts ? { name: t.name, cuts: cuts, parents: parents } : { name: t.name, undo: true }); })
      .then(function (p) { state.busy = false; if (state.take !== t) return; state.plan = p; state.dirty = false; paint(); if (said) say(said); })
      .catch(function (e) { state.busy = false; paint(); say(e.message, true); });
  }
  function tlSplit(t) {
    var i = tlAt(t), s = tlShots()[i];
    t = Math.round(t * FPS) / FPS;
    if (!s || t - s.t0 < 0.4 || s.t1 - t < 0.4) return say(tr("A cut at least 0.4 s from the shot's ends"), true);
    var cuts = tlCuts(), par = tlParents(), c = +t.toFixed(2);
    cuts.splice(i, 1, [s.t0, c], [c, s.t1]); par.splice(i, 1, i, i);
    TL.sel = i + 1; TL.cut = -1;
    tlPost(cuts, par, tr("Shot {0} cut in two").replace("{0}", i + 1));
  }
  function tlJoin(c) {
    var sh = tlShots();
    if (!(c >= 0 && c < sh.length - 1)) return say(tr("Choose an edit point first: a click on the line between two shots"), true);
    var cuts = tlCuts(), par = tlParents();
    cuts.splice(c, 2, [sh[c].t0, sh[c + 1].t1]); par.splice(c, 2, c);
    TL.cut = -1; TL.sel = c;
    tlPost(cuts, par, tr("Shots {0} and {1} joined").replace("{0}", c + 1).replace("{1}", c + 2));
  }
  function tlMove(c, t) {
    var sh = tlShots(), s1 = sh[c], s2 = sh[c + 1];
    if (!s1 || !s2) return;
    t = +Math.max(s1.t0 + 0.4, Math.min(s2.t1 - 0.4, Math.round(t * FPS) / FPS)).toFixed(2);
    var cuts = tlCuts();
    cuts[c] = [s1.t0, t]; cuts[c + 1] = [t, s2.t1];
    tlPost(cuts, tlParents(), tr("The cut moved to {0}").replace("{0}", tlTc(t)));
  }
  function tlPlay(on) {                                   // true plays, false stops, null either
    var au = $("audio"), t = tlNow();
    if (!tlMine()) { if (on !== false && state.take && window.ruachSeekTake) window.ruachSeekTake(state.take, t); return; }
    if (on === null) on = au.paused;
    if (on) au.play().catch(function () {}); else au.pause();
  }
  function tlScreen() {
    if (TL.win && !TL.win.closed) { try { TL.win.focus(); } catch (e) { /* over the others already */ } return; }
    var open = function (feat) {
      var w = window.open("", "ruach-program", feat);
      if (!w) return say(tr("The browser kept the window from opening: allow pop-ups for the studio"), true);
      TL.win = w; TL.mirror = "";
      var d = w.document;
      d.title = "Ruach Studio · Program";
      d.body.style.cssText = "margin:0;background:#000;overflow:hidden;cursor:default";
      d.body.innerHTML = '<div id="pg" style="position:fixed;inset:0;background:#000 center/contain no-repeat"></div>' +
        '<div id="pw" style="position:fixed;left:6%;right:6%;bottom:6%;text-align:center;color:#fff;font:600 2.6vw system-ui,sans-serif;text-shadow:0 2px 8px #000"></div>' +
        '<div id="pt" style="position:fixed;right:12px;top:10px;color:#ddd;font:13px ui-monospace,monospace;text-shadow:0 1px 3px #000"></div>';
      d.addEventListener("dblclick", function () { if (d.fullscreenElement) d.exitFullscreen().catch(function () {}); else d.documentElement.requestFullscreen().catch(function () {}); });
      tlHead();
    };
    var plain = "popup,width=1280,height=760";
    if (window.getScreenDetails) {
      window.getScreenDetails().then(function (sd) {
        var other = sd.screens.filter(function (s) { return s !== sd.currentScreen; })[0];
        open(other ? "popup,left=" + other.availLeft + ",top=" + other.availTop + ",width=" + other.availWidth + ",height=" + other.availHeight : plain);
      }).catch(function () { open(plain); });
    } else open(plain);
  }
  function tlMirror(src, words, tc) {
    var w = TL.win;
    if (!w || w.closed) return;
    try {
      var d = w.document, pg = d.getElementById("pg");
      if (pg && TL.mirror !== src) { TL.mirror = src; pg.style.backgroundImage = src ? "url(" + location.origin + src + ")" : ""; }
      d.getElementById("pw").textContent = words; d.getElementById("pt").textContent = tc;
    } catch (e) { TL.win = null; }
  }
  function tlX(e) { var r = $("tlInner").getBoundingClientRect(); return (e.clientX - r.left) / tlPps(); }
  function tlKey(e) {
    if (e.target.closest && e.target.closest("input, textarea, select")) return;
    var k = e.key, t = tlNow(), sh = tlShots(), mod = e.ctrlKey || e.metaKey, done = true;
    if (mod && (k === "b" || k === "B")) tlSplit(t);
    else if (mod && (k === "z" || k === "Z")) tlPost(null, null, tr("The last edit undone"));
    else if (mod || e.altKey) done = false;
    else if (k === " " || k === "k" || k === "K") tlPlay(k === " " ? null : false);
    else if (k === "l" || k === "L") tlPlay(true);
    else if (k === "j" || k === "J") tlSeek(t - 2);
    else if (k === "ArrowLeft") tlSeek(t - (e.shiftKey ? 1 : 1 / FPS));
    else if (k === "ArrowRight") tlSeek(t + (e.shiftKey ? 1 : 1 / FPS));
    else if (k === "ArrowUp") { var pv = sh.map(function (s) { return s.t0; }).filter(function (x) { return x < t - 0.01; }); tlSeek(pv.length ? pv[pv.length - 1] : 0); }
    else if (k === "ArrowDown") { var nx = sh.map(function (s) { return s.t0; }).filter(function (x) { return x > t + 0.01; }); tlSeek(nx.length ? nx[0] : tlEnd()); }
    else if (k === "Home") tlSeek(0);
    else if (k === "End") tlSeek(tlEnd());
    else if ((k === "z" || k === "Z") && e.shiftKey) { TL.fit = true; tlPaint(); }
    else if (k === "a" || k === "A") tlTool("select");
    else if (k === "b" || k === "B") tlTool("blade");
    else if (k === "Delete" || k === "Backspace") tlJoin(TL.cut);
    else if (k === "+" || k === "=") tlZoom(tlPps() * 1.25);
    else if (k === "-" || k === "_") tlZoom(tlPps() * 0.8);
    else done = false;
    if (done) { e.preventDefault(); e.stopPropagation(); }
  }
  function tlWire() {
    var sc = $("tlScroll");
    if (!sc) return;
    sc.addEventListener("pointerdown", function (e) {
      if (e.button !== 0) return;
      $("tl").focus({ preventScroll: true });
      var cut = e.target.closest("[data-tlcut]"), clip = e.target.closest("[data-tl]"), t = tlX(e);
      if (cut) { TL.cut = +cut.dataset.tlcut; TL.sel = -1; TL.drag = { c: TL.cut, x0: e.clientX, moved: false }; try { sc.setPointerCapture(e.pointerId); } catch (x) { /* gone */ } tlPaint(); e.preventDefault(); return; }
      if (clip && TL.tool === "blade") { tlSplit(t); return; }
      if (clip) { TL.sel = +clip.dataset.tl; TL.cut = -1; }
      TL.scrub = true; try { sc.setPointerCapture(e.pointerId); } catch (x) { /* gone */ }
      tlSeek(t); tlPaint();
    });
    sc.addEventListener("pointermove", function (e) {
      if (TL.drag) {
        if (Math.abs(e.clientX - TL.drag.x0) > 3) { TL.drag.moved = true; var g = $("tlV1").querySelector('[data-tlcut="' + TL.drag.c + '"]'); if (g) g.style.left = (tlX(e) * tlPps()).toFixed(1) + "px"; }
        return;
      }
      if (TL.scrub) tlSeek(tlX(e));
    });
    sc.addEventListener("pointerup", function (e) {
      if (TL.drag) { var d = TL.drag; TL.drag = null; if (d.moved) tlMove(d.c, tlX(e)); return; }
      TL.scrub = false;
    });
    sc.addEventListener("wheel", function (e) {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      var t = tlX(e), x = e.clientX - sc.getBoundingClientRect().left;
      tlZoom(tlPps() * (e.deltaY < 0 ? 1.25 : 0.8));
      sc.scrollLeft = Math.max(0, t * TL.pps - x);
    }, { passive: false });
    $("vdEdit").addEventListener("click", function (e) {
      var b = e.target.closest("[data-tlact]");
      if (b) {
        var k = b.dataset.tlact;
        if (k === "select" || k === "blade") tlTool(k);
        else if (k === "split") tlSplit(tlNow());
        else if (k === "join") tlJoin(TL.cut);
        else if (k === "undo") tlPost(null, null, tr("The last edit undone"));
        else if (k === "fit") { TL.fit = true; tlPaint(); }
        else if (k === "screen") tlScreen();
        return;
      }
      var c = e.target.closest("[data-tlcard]");
      if (c) { paneShow("shots"); shotCur(+c.dataset.tlcard); var el = $("vdShot" + c.dataset.tlcard); if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" }); }   // HERESY 1940
    });
    $("tlZoom").addEventListener("input", function () { tlZoom(Math.pow(2, +this.value)); });
    $("tl").addEventListener("keydown", tlKey);
    var au = $("audio");
    if (au) ["timeupdate", "seeked", "play", "pause", "loadedmetadata"].forEach(function (n) { au.addEventListener(n, tlHead); });
    window.addEventListener("resize", function () { if (TL.fit) tlPaint(); });
  }
  // HERESY 1868 (Viktor 29.10.2026: «мне нужна реальная DDiT генерация живого видеоклипа, а не просто слайдшоу»): a shot shot by MiniMax H3 from here.
  // 🎬 on a shot: a draft (8 steps) or the final (28), both with the shot's picture as the first frame; «Shoot all» in the bar; each shot's way read every five seconds while any is
  // on its way, on its card and on the timeline; its video in its card, on V1 and in the program monitor
  function shotVid(f) { return "/lab/video/shot.mp4?name=" + encodeURIComponent(state.take.name) + "&f=" + encodeURIComponent(f); }
  function shotThumb(f) { return "/lab/video/shot.jpg?name=" + encodeURIComponent(state.take.name) + "&f=" + encodeURIComponent(f); }
  function vidSlot(s) {
    if (!s.video) return "";
    return '<video class="vd-shotvid" src="' + esc(shotVid(s.video)) + '" poster="' + esc(shotThumb(s.video)) + '" controls preload="none" playsinline data-tip="' +
      esc(tr("This shot's video by MiniMax H3")) + (s.video_from && s.video_from.mode ? " · " + esc(tr(s.video_from.mode)) : "") + '"></video>';
  }
  function h3Load() {
    var t = state.take;
    if (!t || t.session || !state.plan || !state.plan.exists) return;
    clearTimeout(state.h3timer);
    api("/video/shots?name=" + encodeURIComponent(t.name)).then(function (b) {
      if (state.take !== t) return;
      var active = (b.jobs || []).filter(function (j) { return j.state === "queued" || j.state === "running"; }).length;
      var fewer = state.h3 && state.h3.active > active;
      state.h3 = { jobs: b.jobs || [], active: active, ready: b.ready, missing: b.missing || [] };
      h3Paint();
      if (fewer) api("/video/plan?name=" + encodeURIComponent(t.name)).then(function (p) { if (state.take === t && !state.dirty) { state.plan = p; paint(); } });   // a shot came
      if (active) state.h3timer = setTimeout(h3Load, 5000);
    }).catch(function () { /* a lab without H3: no chips */ });
  }
  function h3Paint() {
    var by = {};
    ((state.h3 && state.h3.jobs) || []).forEach(function (j) { if (!by[j.i] || j.state === "running") by[j.i] = j; });
    Array.prototype.forEach.call(document.querySelectorAll("#vdShots [data-vdh3]"), function (el) {
      var j = by[el.dataset.vdh3], m = j ? Math.floor(j.since / 60) + ":" + ("0" + (j.since % 60)).slice(-2) : "";
      el.className = "vd-h3" + (j ? " is-" + j.state : "");
      el.textContent = !j ? "" : j.state === "queued" ? tr("H3: queued") : j.state === "running" ? tr("H3: {0}").replace("{0}", m + (j.steps ? " · " + j.step + "/" + j.steps : "")) : tr("H3 failed: {0}").replace("{0}", j.error || "");
      el.title = j && j.error ? j.error : "";
    });
    Array.prototype.forEach.call(document.querySelectorAll("#tlV1 [data-tl]"), function (el) {
      var j = by[el.dataset.tl];
      el.classList.toggle("is-shooting", !!j && (j.state === "queued" || j.state === "running"));
    });
  }
  function shoot(list, mode) {
    var t = state.take;
    if (!t || !list.length) return;
    var prompts = {};
    list.forEach(function (i) { prompts[i] = promptOf(i); });
    settled().then(function () { return api("/video/shoot", { name: t.name, shots: list, prompts: prompts, mode: mode }); })
      .then(function (b) { say(tr("{0} shot(s) to MiniMax H3 ({1})").replace("{0}", (b.queued || []).length).replace("{1}", tr(mode))); h3Load(); })
      .catch(function (e) { say(/is not here/.test(e.message) ? tr("MiniMax H3 is not here: {0}").replace("{0}", e.message) : e.message, true); });
  }
  function shootMenu(i, anchor) {
    var s = state.plan && state.plan.shots[i], r = anchor.getBoundingClientRect();
    if (!s || !window.HeresyMenu) return shoot([i], "draft");
    window.HeresyMenu.open(r.left, r.bottom + 4, [
      { label: "Draft · 8 steps", icon: "🎬", action: function () { shoot([i], "draft"); } },
      { label: "Final · 28 steps", icon: "🎞", action: function () { shoot([i], "final"); } }
    ].concat(s.video ? [{ sep: true },
      { label: "Upscale · 7B sharp, 1080p", icon: "\u21ee", action: function () { upscale([i], "7b", 1080); } },   // HERESY 1876b
      { label: "Upscale · 7B sharp, 1440p", icon: "\u21ee", action: function () { upscale([i], "7b", 1440); } },
      { label: "Upscale · 3B, 1080p (quick)", icon: "\u21ee", action: function () { upscale([i], "3b", 1080); } },
      { sep: true }, { label: "Take its video off", icon: "✕", action: function () {
      api("/video/shot-off", { name: state.take.name, i: i }).then(function (p) { state.plan = p; paint(); }).catch(function (e) { say(e.message, true); });
    } }] : []));
  }
  // HERESY 1876b (Viktor 29.10.2026: «если апскейлер на финал прикрутишь, то с ним сможем вытянуть клип и в 2-4K»): a shot's video made larger by SeedVR2,
  // the shots dealt among the free cards; a chip on each while it goes, its resolution beside it once made; the clip takes the upscale
  function upscale(list, model, res) {
    var t = state.take;
    if (!t || !list.length) return;
    settled().then(function () { return api("/video/upscale", { name: t.name, shots: list, model: model, res: res }); })
      .then(function (b) {
        var n = (b.jobs || []).reduce(function (k, j) { return k + j.shots.length; }, 0);
        say(tr("{0} shot(s) to SeedVR2 on {1} card(s)").replace("{0}", n).replace("{1}", (b.jobs || []).length)); srLoad();
      }).catch(function (e) { say(e.message, true); });
  }
  function upscaleAll() {
    var p = state.plan;
    if (!p || !p.exists) return;
    var list = p.shots.map(function (s, i) { return s.video && !s.video_up ? i : -1; }).filter(function (i) { return i >= 0; });
    if (!list.length) return say(tr("No shot with a video still to upscale"), true);
    window.HeresyDialog.confirm(tr(ASK_UP).replace("{0}", list.length), { ok: "Upscale all" }).then(function (ok) { if (ok) upscale(list, "7b", 1080); });
  }
  var ASK_UP = "Upscale all {0} shots that have a video with SeedVR2 7B sharp to 1080p?\n\nOn the free cards, about four minutes for a shot of four seconds; the clip takes each one as it comes. A shot's 🎬 menu has 1440p and the quick 3B.";
  function srLoad() {
    var t = state.take;
    if (!t || t.session || !state.plan || !state.plan.exists) return;
    clearTimeout(state.srtimer);
    api("/video/upscale?name=" + encodeURIComponent(t.name)).then(function (b) {
      if (state.take !== t) return;
      var active = (b.jobs || []).filter(function (j) { return j.state === "running"; }).length, fewer = state.sr && state.sr.active > active;
      state.sr = { jobs: b.jobs || [], active: active };
      srPaint();
      if (fewer) api("/video/plan?name=" + encodeURIComponent(t.name)).then(function (p) { if (state.take === t && !state.dirty) { state.plan = p; paint(); } });   // an upscale came
      if (active) state.srtimer = setTimeout(srLoad, 8000);
    }).catch(function () { /* a lab without the upscaler: no chips */ });
  }
  function srPaint() {
    var by = {};
    ((state.sr && state.sr.jobs) || []).forEach(function (j) { (j.shots || []).forEach(function (i) { by[i] = j; }); });
    Array.prototype.forEach.call(document.querySelectorAll("#vdShots [data-vdsr]"), function (el) {
      var j = by[el.dataset.vdsr], m = j ? Math.floor(j.since / 60) + ":" + ("0" + (j.since % 60)).slice(-2) : "";
      el.className = "vd-h3 vd-sr" + (j ? " is-" + j.state : "");
      el.textContent = !j ? "" : j.state === "running" ? tr("Upscale: {0}").replace("{0}", m + " \u00b7 " + j.made + "/" + j.shots.length) :
        j.state === "failed" ? tr("Upscale failed: {0}").replace("{0}", j.error || "") : "";
    });
  }
  // HERESY 1913 (Viktor 30.10.2026: «доведения Видеографа до работоспособного состояния»): the Artist draws the plan's shots itself (lab/frames_job.py),
  // two at a time: a shot with the hero from the hero's picture (Qwen-Image 2.1, then 2512 over it at 0.35), the others by 2512 from their scene
  var HERO_PICK = 9999;
  var HERO_TIP = "Is the hero in this shot? Pressed: drawn from the hero's picture; not pressed: from the scene's words alone";
  function heroIn(i) { var s = state.plan && state.plan.shots[i]; return !!s && (typeof s.hero === "boolean" ? s.hero : !!s.sung); }
  function heroToggle(i) {
    return '<button type="button" class="btn ghost small vd-herotg" data-vdherotg="' + i + '" aria-pressed="' + (heroIn(i) ? "true" : "false") + '" data-tip="' + esc(tr(HERO_TIP)) + '" aria-label="' + esc(tr(HERO_TIP)) + '">\ud83d\udc64</button>';
  }
  function heroFlip(i, btn) {
    var s = state.plan && state.plan.shots[i];
    if (!s) return;
    s.hero = !heroIn(i); state.dirty = true; $("vdSave").disabled = state.busy;
    btn.setAttribute("aria-pressed", s.hero ? "true" : "false");
  }
  function heroPaint() {
    var el = $("vdHero"), h = state.plan && state.plan.hero;
    if (!el) return;
    el.innerHTML = (h ? '<img class="vd-hero-pic" src="/lab/artist/file?id=' + encodeURIComponent(h.run) + "&file=" + encodeURIComponent("thumbs/" + String(h.file).replace(/\.png$/, ".jpg")) + '" alt="" />'
      : '<span class="vd-none">' + esc(tr("No hero yet: every shot is drawn from its words")) + "</span>") +
      '<button type="button" class="btn ghost small" data-vdheropick="1">' + esc(tr(h ? "Another hero" : "Pick the hero")) + "</button>" +
      (h ? '<button type="button" class="btn ghost small" data-vdherooff="1">' + esc(tr("Take the hero off")) + "</button>" : "");
  }
  function heroOff() {
    var t = state.take;
    if (!t) return;
    settled().then(function () { return api("/video/hero", { name: t.name, off: true }); })
      .then(function (q) { if (state.take !== t) return; state.plan = q; paint(); say(tr("the hero is taken off")); }).catch(function (e) { say(e.message, true); });
  }
  function drawAll() {
    var p = state.plan, t = state.take;
    if (!p || !p.exists || !t) return;
    if (state.frames && state.frames.state === "running") {
      return api("/video/frames-cancel", { name: t.name }).then(function (b) { state.frames = b; framesPaint(); say(tr("the drawing stops after the shots on the cards")); })
        .catch(function (e) { say(e.message, true); });
    }
    var empty = p.shots.map(function (s, i) { return s.frame ? -1 : i; }).filter(function (i) { return i >= 0; });
    var list = empty.length ? empty : p.shots.map(function (s, i) { return i; });
    var heroes = list.filter(heroIn);
    if (heroes.length && !p.hero) return say(tr("Pick the hero's picture first: «The look of the clip» → The hero"), true);
    var ask = empty.length ? tr(ASK_DRAW).replace("{0}", list.length).replace("{1}", heroes.length) : tr(ASK_REDRAW).replace("{0}", list.length);
    window.HeresyDialog.confirm(ask, { ok: "Draw" }).then(function (ok) {
      if (!ok) return;
      var prompts = {};
      list.forEach(function (i) { prompts[i] = picturePromptOf(i); });
      settled().then(function () { return api("/video/frames", { name: t.name, shots: list, prompts: prompts, heroes: heroes }); })
        .then(function (b) { state.frames = b; framesPaint(); say(tr("the Artist: {0} of {1}").replace("{0}", b.done || 0).replace("{1}", b.total || list.length)); framesLoad(); })
        .catch(function (e) { say(e.message, true); });
    });
  }
  var ASK_DRAW = "The Artist draws the {0} shots that have no picture yet?\n\n{1} of them with the hero: Qwen-Image 2.1 from the hero's picture, then 2512 over it; the others by 2512 from their scene. Two at a time on the free cards, about a minute a shot; each picture goes into its shot as it comes.";
  var ASK_REDRAW = "Every shot has its picture. Draw all {0} again? The pictures they have are put aside, not deleted.";
  function framesLoad() {
    var t = state.take;
    if (!t || t.session || !state.plan || !state.plan.exists) return;
    clearTimeout(state.frtimer);
    api("/video/frames?name=" + encodeURIComponent(t.name)).then(function (b) {
      if (state.take !== t) return;
      var more = !!state.frames && (b.done || 0) > (state.frames.done || 0), ended = !!state.frames && state.frames.state === "running" && b.state !== "running";
      state.frames = b; framesPaint();
      if (more || ended) api("/video/plan?name=" + encodeURIComponent(t.name)).then(function (p) { if (state.take === t && !state.dirty) { state.plan = p; paint(); } });   // a picture came
      if (b.state === "running") state.frtimer = setTimeout(framesLoad, 5000);
    }).catch(function () { /* a lab without the Artist's drawing */ });
  }
  function framesPaint() {
    var b = state.frames || {}, btn = $("vdDrawAll"), el = $("vdFrames");
    if (btn) btn.textContent = tr(b.state === "running" ? "Stop drawing" : "\ud83c\udfa8 Draw the shots");
    if (!el) return;
    var errs = b.errors || [];
    el.textContent = b.state === "running" ? tr("the Artist: {0} of {1}").replace("{0}", b.done || 0).replace("{1}", b.total || 0)
      : b.state ? tr("the Artist drew {0} of {1}").replace("{0}", b.done || 0).replace("{1}", b.total || 0) + (errs.length ? " · " + tr("{0} failed").replace("{0}", errs.length) : "") : "";
    el.title = errs.map(function (x) { return (x.i + 1) + ": " + x.error; }).join("\n");
  }
  function shootAll() {
    var p = state.plan;
    if (!p || !p.exists) return;
    var list = p.shots.map(function (s, i) { return i; });
    window.HeresyDialog.confirm(tr(ASK_ALL).replace("{0}", list.length), { ok: "Shoot all" }).then(function (ok) { if (ok) shoot(list, "draft"); });
  }
  var ASK_ALL = "Shoot all {0} shots with MiniMax H3 as drafts?\n\nOn the free cards, a few minutes a shot; the clip takes each shot's video as it comes.";
  function wire() {
    if (!$("view-video") || wire.done) return;
    wire.done = true;
    vpAttach($("vdAnimVideo")); vpAttach($("vdClipVideo"));   // HERESY 1860
    tlWire();                                             // HERESY 1864
    $("vdSideList").addEventListener("click", function (e) {   // HERESY 1861: the mini library
      var p = e.target.closest("[data-vdside-play]"), t = e.target.closest("[data-vdside-take]");
      if (!t) return;
      var name = t.dataset.vdsideTake;
      if (p) return sideOpen(name, function () { return sidePlay(p.dataset.vdsidePlay); });
      if (t.dataset.vdsideShot != null) { var si = +t.dataset.vdsideShot; return sideOpen(name, function () { return sideShot(si); }); }
      sideOpen(name);
    });
    $("vdSideList").addEventListener("keydown", function (e) { if ((e.key === "Enter" || e.key === " ") && e.target.matches(".vd-tile[role=button]")) { e.preventDefault(); e.target.click(); } });
    $("vdSideList").addEventListener("error", function (e) { if (e.target.tagName === "IMG") e.target.remove(); }, true);   // no picture, no cover: the tile's ground
    $("vdSideTabs").addEventListener("click", function (e) { var b = e.target.closest("[data-vdside]"); if (!b) return; SIDE.filter = b.dataset.vdside; sideKeep("yue2.vdSideFilter", SIDE.filter === "all" ? "" : SIDE.filter); sidePaint(); });
    $("vdSideSearch").addEventListener("input", function () { SIDE.q = this.value; sidePaint(); });
    $("vdWide").addEventListener("click", function () { SIDE.wide = !SIDE.wide; sideKeep("yue2.vdSideWide", SIDE.wide ? "1" : ""); sidePaint(); });
    $("vdFold").addEventListener("click", function () { sideShow(false); });
    $("vdUnfold").addEventListener("click", function () { sideShow(true); });
    $("vdSide").addEventListener("mouseenter", function () { clearTimeout(SIDE.hide); if (SIDE.folded) SIDE.show = setTimeout(function () { sideShow(true); }, 160); });   // HERESY 1940
    $("vdSide").addEventListener("mouseleave", function () {
      clearTimeout(SIDE.show);
      SIDE.hide = setTimeout(function () { var a = document.activeElement; if (!a || !$("vdSide").contains(a) || a === $("vdUnfold") || a.tagName === "BUTTON") sideShow(false); }, 450);
    });
    $("vdSide").addEventListener("keydown", function (e) { if (e.key === "Escape" && !SIDE.folded) { e.stopPropagation(); sideShow(false); } });
    document.addEventListener("pointerdown", function (e) { if (!SIDE.folded && !$("vdSide").contains(e.target)) sideShow(false); }, true);
    sideKeep("yue2.vdSideFolded", "");                // the old remembered fold, gone (1940)
    try { if (localStorage.getItem("yue2.vdTheatre") === "1") vpTheatre(true); } catch (e) { /* private window */ }
    $("vdFind").addEventListener("input", function () { find(this.value); });
    $("vdFind").addEventListener("keydown", function (e) {   // HERESY 1940: Esc closes the window, Enter takes the first take, ↓ into the list
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); findClose(); }
      else if (e.key === "Enter") { var h = document.querySelector("#vdFound .vd-hit"); if (h) { e.preventDefault(); h.click(); } }
      else if (e.key === "ArrowDown") { var f = document.querySelector("#vdFound .vd-hit"); if (f) { e.preventDefault(); f.focus(); } }
    });
    $("vdFindOpen").addEventListener("click", findOpen);
    $("vdFindOpen").addEventListener("focus", function () { if ($("vdFindWin").hidden) findOpen(); });   // HERESY 1945: the head's field opens the window
    $("vdFindWin").addEventListener("click", function (e) { if (e.target === this) findClose(); });
    $("vdFindWs").addEventListener("click", function (e) {
      var b = e.target.closest("[data-vdws]");
      if (!b) return;
      FIND.ws = b.dataset.vdws; sideKeep("yue2.vdFindWs", FIND.ws); findWs(); find($("vdFind").value); $("vdFind").focus();
    });
    $("vdFindWin").addEventListener("keydown", function (e) {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); findClose(); return; }
      var hit = e.target.closest ? e.target.closest(".vd-hit") : null;
      if (!hit || (e.key !== "ArrowDown" && e.key !== "ArrowUp")) return;
      e.preventDefault();
      var n = e.key === "ArrowDown" ? hit.nextElementSibling : hit.previousElementSibling;
      if (n && n.classList.contains("vd-hit")) n.focus(); else if (e.key === "ArrowUp") $("vdFind").focus();
    });
    fullPaint();
    $("vdFull").addEventListener("click", function () { vdSetFull(!vdIsFull()); });
    document.addEventListener("fullscreenchange", function () { if (!document.fullscreenElement && vdIsFull()) vdSetFull(false); });
    window.addEventListener("keydown", function (e) {      // on the window, before the DAW's F11 on the document: in this room F11 is this room's
      if (document.body.dataset.tab !== "video") return;
      if (e.key === "Escape" && vdIsFull() && !document.fullscreenElement && $("vdFindWin").hidden && !document.querySelector(".hd-back")) { vdSetFull(false); return; }
      if (e.key !== "F11" || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
      e.preventDefault(); e.stopPropagation(); vdSetFull(!vdIsFull());
    }, true);
    window.addEventListener("keydown", function (e) {      // Ctrl+K finds a take; Alt+← → walk the shots: on the window, before the player's ← → (5 s) on the document
      if (document.body.dataset.tab !== "video") return;
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.code === "KeyK") { e.preventDefault(); e.stopPropagation(); findOpen(); return; }
      if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === "ArrowLeft" || e.key === "ArrowRight") && state.plan && state.plan.exists &&
          !/^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || "")) {
        e.preventDefault(); e.stopPropagation(); paneShow("shots"); shotCur((state.cur || 0) + (e.key === "ArrowLeft" ? -1 : 1));
      }
    }, true);
    new MutationObserver(function () { if (vdIsFull() && document.body.dataset.tab !== "video") vdSetFull(false); }).observe(document.body, { attributes: true, attributeFilter: ["data-tab"] });
    $("vdTabs").addEventListener("click", function (e) { var b = e.target.closest("[data-vdtab]"); if (b) paneShow(b.dataset.vdtab); });
    $("vdPrev").addEventListener("click", function () { shotCur((state.cur || 0) - 1); });
    $("vdNext").addEventListener("click", function () { shotCur((state.cur || 0) + 1); });
    try { paneShow(localStorage.getItem("yue2.vdPane") || "edit"); } catch (e) { paneShow("edit"); }   // HERESY 1961: the edit room first
    $("vdFound").addEventListener("click", function (e) {
      var b = e.target.closest("[data-vdtake]");
      if (!b) return;
      $("vdFind").value = ""; findClose();             // HERESY 1940
      if (window.ruachOpenTake) window.ruachOpenTake(b.dataset.vdtake);
      var t = window.ruachCurrentTake ? window.ruachCurrentTake() : null;
      if (t) window.HeresyVideo.take(t);
    });
    $("vdMake").addEventListener("click", make);
    $("vdWrite").addEventListener("click", write);
    $("vdSave").addEventListener("click", save);
    $("vdExport").addEventListener("click", storyboard);
    if ($("vdBeats")) $("vdBeats").addEventListener("click", beatCuts);   // HERESY 1947
    if ($("vdEditZip")) $("vdEditZip").addEventListener("click", editExport);   // HERESY 1946
    if ($("vdAnimatic")) $("vdAnimatic").addEventListener("click", animMake);   // HERESY 1837
    if ($("vdClip")) $("vdClip").addEventListener("click", clipMake);   // HERESY 1838
    if ($("vdShootAll")) $("vdShootAll").addEventListener("click", shootAll);   // HERESY 1868
    if ($("vdUpAll")) $("vdUpAll").addEventListener("click", upscaleAll);   // HERESY 1876b
    if ($("vdDrawAll")) $("vdDrawAll").addEventListener("click", drawAll);   // HERESY 1913
    try { state.clipLyrics = localStorage.getItem("yue2.vdClipLyrics") === "1"; if ($("vdClipBetween")) $("vdClipBetween").value = localStorage.getItem("yue2.vdClipBetween") || "cut"; } catch (e) { /* private window */ }   // HERESY 1916
    try { state.clipTitles = localStorage.getItem("yue2.vdClipTitles") === "1"; } catch (e) { /* private window */ }   // HERESY 1948
    if ($("vdClipTitles")) {
      $("vdClipTitles").setAttribute("aria-pressed", state.clipTitles ? "true" : "false");
      $("vdClipTitles").addEventListener("click", function () { state.clipTitles = !state.clipTitles; this.setAttribute("aria-pressed", state.clipTitles ? "true" : "false"); sideKeep("yue2.vdClipTitles", state.clipTitles ? "1" : ""); });
    }
    if ($("vdClipLyrics")) {
      $("vdClipLyrics").setAttribute("aria-pressed", state.clipLyrics ? "true" : "false");
      $("vdClipLyrics").addEventListener("click", function () { state.clipLyrics = !state.clipLyrics; this.setAttribute("aria-pressed", state.clipLyrics ? "true" : "false"); sideKeep("yue2.vdClipLyrics", state.clipLyrics ? "1" : ""); });
    }
    if ($("vdClipBetween")) $("vdClipBetween").addEventListener("change", function () { sideKeep("yue2.vdClipBetween", this.value === "cut" ? "" : this.value); });
    try { if ($("vdClipShape")) $("vdClipShape").value = localStorage.getItem("yue2.vdClipShape") || "16:9"; } catch (e) { /* private window */ }   // HERESY 1917
    if ($("vdClipShape")) $("vdClipShape").addEventListener("change", function () { sideKeep("yue2.vdClipShape", this.value === "16:9" ? "" : this.value); clipLoad(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && pickAt >= 0) pickClose(); });
    document.addEventListener("mousedown", function (e) { if (pickAt >= 0 && !e.target.closest("#vdPick, [data-vdpic], [data-vdheropick]")) pickClose(); });
    window.addEventListener("scroll", function (e) { if (pickAt >= 0 && !(e.target.closest && e.target.closest("#vdPick"))) pickClose(); }, true);
    $("view-video").addEventListener("input", function (e) { if (e.target.matches("textarea, select.vd-move, #vdClipTitle")) { state.dirty = true; $("vdSave").disabled = state.busy; } });   // HERESY 1844: a move chosen too
    $("view-video").addEventListener("click", function (e) {
      var pc = e.target.closest("[data-vdpic]"), pr = e.target.closest("[data-vdrun]");   // HERESY 1838: a shot's picture
      if (pc) { if (pickAt === +pc.dataset.vdpic) pickClose(); else pickOpen(+pc.dataset.vdpic, pc); return; }
      if (pr) { pickRun(pr.dataset.vdrun, pr.dataset.vdfile); return; }
      var ar = e.target.closest("[data-vdart]");          // HERESY 1839
      if (ar) { toArtist(+ar.dataset.vdart); return; }
      if (e.target.closest("[data-vdpickdisk]")) { pickDisk(); return; }
      if (e.target.closest("[data-vdpickoff]")) { pickOff(); return; }
      if (e.target.closest("[data-vdpickx]")) { pickClose(); return; }
      var hp = e.target.closest("[data-vdheropick]"), ho = e.target.closest("[data-vdherooff]"), ht = e.target.closest("[data-vdherotg]");   // HERESY 1913
      if (hp) { if (pickAt === HERO_PICK) pickClose(); else pickOpen(HERO_PICK, hp); return; }
      if (ho) { heroOff(); return; }
      if (ht) { heroFlip(+ht.dataset.vdherotg, ht); return; }
      var shb = e.target.closest("[data-vdshoot]");          // HERESY 1868
      if (shb) { shootMenu(+shb.dataset.vdshoot, shb); return; }
      var pl = e.target.closest("[data-vdplay]"), cp = e.target.closest("[data-vdcopy]");   // HERESY 1830
      if (pl) { play(+pl.dataset.vdplay); return; }
      if (cp) { copyPrompt(+cp.dataset.vdcopy); return; }
      var b = e.target.closest("[data-vdgo]");
      if (b) { paneShow("shots"); shotCur(+b.dataset.vdgo); }   // HERESY 1940: its tab
    });
    $("view-video").addEventListener("dblclick", function (e) { var b = e.target.closest("[data-vdgo]"); if (b) play(+b.dataset.vdgo); });   // HERESY 1830
    var a = $("audio");
    if (a) ["timeupdate", "seeked", "play", "pause", "emptied", "loadedmetadata"].forEach(function (n) { a.addEventListener(n, function () { follow(); }); });
    if (a) a.addEventListener("play", function () {          // HERESY 1860: the studio's player and a film, one sound at a time
      Array.prototype.forEach.call(document.querySelectorAll("#view-video .vp video"), function (vv) { if (!vv.paused) vv.pause(); });
    });
  }
  window.HeresyVideo = {
    reload: function () { wire(); sideLoad(); var t = window.ruachCurrentTake ? window.ruachCurrentTake() : null; if (t !== state.take) { state.take = t; load(); } else paint(); },
    take: function (t) { wire(); if (t === state.take) return; if (state.dirty) save(); state.take = t; load(); },
    prompt: function (i) { return promptOf(i); }, follow: function (t) { follow(t); },   // HERESY 1830: for the checks
    picture: function (i) { return picturePromptOf(i); },   // HERESY 1839: for the checks
    frames: function () { return state.frames || null; },   // HERESY 1913: for the checks
    clipOpts: function () { return { lyrics: !!state.clipLyrics, between: $("vdClipBetween") ? $("vdClipBetween").value : "", shape: clipShape(), titles: !!state.clipTitles }; },   // HERESY 1916, 1917, 1948: for the checks
    shot: function (i) { if (i !== undefined) shotCur(i); return state.cur || 0; }, pane: function (k) { if (k) paneShow(k); return state.pane || "edit"; },   // HERESY 1940: for the checks
    full: function (on) { if (on !== undefined) vdSetFull(on); return vdIsFull(); }, findOpen: function () { findOpen(); }, findClose: function () { findClose(); },
    side: function (on) { if (on !== undefined) sideShow(on); return !SIDE.folded; },
    timeline: function () { return { sel: TL.sel, cut: TL.cut, at: tlNow(), tool: TL.tool, pps: tlPps(), seek: tlSeek }; }   // HERESY 1864: for the checks
  };
})();
