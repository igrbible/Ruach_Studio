/* The LoRA picker: tap a LoRA to add it, set its strength on the music half
   (score and music tokens) and on the sound half (the acoustic stage), and
   see its trigger word and how it was trained. The same file ships in both
   consoles; each page hands it the server's catalog and reads value().

   window.YueLoras:
     mount(host, opts)     opts: { cot() -> "full"|"melody"|"off", addToStyle(word), onChange() }
     setCatalog(list)      [{id, name, halves:["ar","nar"], rank, layout, trigger, hint, mode, size_mb, error}]
     set(list)             [{id, ar, nar}] from a take, to render it again
     value()               [{id, ar, nar}] for the request (installed files only)
     describe(list)        "sv-billie (music 0.8 · sound 1.0), ..." for a song's info
     listInto(list, note)  also keep an Engine-panel list (a <ul>) of every installed LoRA
     setSources(map)       {id or folder prefix: {repo, url, about, trigger}} from loras/sources.json:
                           a link and a recap per LoRA, and a trigger word for files that carry none */
(function (root) {
  "use strict";

  var S = { catalog: [], choice: [], host: null, opts: {}, list: null, note: null, sources: {}, budget: "off", profile: null, profileKey: "", userNotes: {} };
  try { S.free = root.localStorage.getItem("yue2.loraFree") === "on"; } catch (e) { S.free = false; }   // HERESY 1629: Past the limits, kept with the page

  // HERESY 1165: a text glued from names and numbers is translated here, whole, from the English it is made as (the
  // page's translator matches whole texts; its catalog holds the patterns); drawn again when the language changes
  function tr(s) { return root.RuachI18n ? root.RuachI18n.t(s) : s; }
  root.addEventListener("ruach-lang", function () { paint(); });

  function escape(text) {
    return String(text === undefined || text === null ? "" : text).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function entry(id) {
    for (var i = 0; i < S.catalog.length; i++) if (S.catalog[i].id === id) return S.catalog[i];
    return null;
  }

  // A name for an id whose file is gone: the file stem, or its folders when the stem is generic
  function fallbackName(id) {
    var parts = String(id).split("/"), stem = parts[parts.length - 1].replace(/\.safetensors$/, "");
    return /^(lora|adapter_model|pytorch_lora_weights|model|adapter)$/i.test(stem) && parts.length > 1
      ? parts.slice(0, -1).join(" / ") : stem;
  }

  // A short name: sources.json's title, else the file's own name
  function nameOf(id) {
    var e = entry(id), src = source(id);
    return src && src.title ? src.title : e ? e.name : fallbackName(id);
  }

  // HERESY 1650: what tells a tile from another of the same name (the same adapter in two files): the precision its file name carries, else its size
  function twinOf(e, list) {
    var label = function (x) { var src = source(x.id); return String(src && src.title ? src.title : x.name || fallbackName(x.id)).toLowerCase(); };
    var name = label(e), mate = pairOf(e), twins = (list || S.catalog).filter(function (x) { return x.id !== e.id && x !== mate && label(x) === name; });
    if (!twins.length) return "";
    var file = String(e.id).split("/").pop(), m = /\.(bf16|fp16|f16|fp32|f32|q8_0|q5_k_m|int8)\.safetensors$/i.exec(file);
    return m ? m[1].toLowerCase() : e.size_mb ? Math.round(e.size_mb) + " MB" : file.replace(/\.safetensors$/i, "");
  }

  // A few words on what it does, for inside its button: sources.json's tag, else the file's style note
  function tagOf(e) {
    var src = source(e.id), hint = String(e.hint || "").split(/[,.;]/)[0].trim();
    return src && src.tag ? src.tag : hint.length <= 32 ? hint : hint.slice(0, 31) + "\u2026";
  }

  // HERESY 1636: an adapter's kind by its name and its words (no file says it): a speaker's voice (voice-…), a singing voice, a style, an
  // instrument, a score adapter; each its colour, a speaker's voice a second stripe by the first letter of the name, as a phone's contacts
  var KINDS = [["voice", "#4f8ef7"], ["vocal", "#b56cf0"], ["style", "#e2a33a"], ["instrument", "#3fbf8a"], ["score", "#3cc3d6"]];
  var LETTER = ["#e57373", "#f06292", "#ba68c8", "#9575cd", "#7986cb", "#64b5f6", "#4fc3f7", "#4dd0e1", "#4db6ac", "#81c784", "#aed581", "#dce775",
                "#ffd54f", "#ffb74d", "#ff8a65", "#a1887f", "#90a4ae"];
  function kindOf(e) {
    var id = String(e && e.id || "").toLowerCase(), s = id + " " + String(e && e.hint || "").toLowerCase() + " " + String((source(e && e.id) || {}).tag || "").toLowerCase();
    if (/(^|\/)voice-/.test(id)) return "voice";
    // HERESY 1647: a score adapter first (the Instrumental one's note says «no vocals»), a singing voice by its name alone (JPop's note speaks of vocals)
    if ((e && e.mode && e.mode !== "direct") || /cot-full|(^|[^a-z])abc/.test(id)) return "score";
    if (/vocal|singer|gtsinger|alto|soprano|tenor|baritone|choir|(^|\/)sv[-_]|_sv_/.test(id)) return "vocal";
    if (/duduk|shofar|harmonium|piano|guitar|violin|cello|organ|flute|sax|trumpet|drum|sitar|oud|kalimba|harp|accordion|bagpipe/.test(s)) return "instrument";
    return "style";
  }
  // HERESY 1703: a voice's or a singer's ▼ ▲: the score's Vocal line an octave down or up, once, through 1028's one-voice move (shown in Full with a score)
  function vshiftButtons() {
    return '<span class="lora-vshift" data-tip="' + escape(tr("The score's Vocal line an octave down (▼) or up (▲), once, in the score in the form (Full only): for a voice that sits lower or higher than the score asks. The model sings where the line goes: measured 21.10.2026, an octave down sang 9–10 semitones lower.")) + '">' +
      '<button type="button" class="icon-btn" data-vshift="-7" aria-label="' + escape(tr("The Vocal line an octave down")) + '">\u25bc</button>' +
      '<button type="button" class="icon-btn" data-vshift="7" aria-label="' + escape(tr("The Vocal line an octave up")) + '">\u25b2</button></span>';
  }
  function kindStyle(e) {
    var k = kindOf(e), c = (KINDS.filter(function (x) { return x[0] === k; })[0] || [k, "#8a8f98"])[1], st = "--lk:" + c;
    if (k === "voice") {
      var who = String(nameOf(e.id)).replace(/^voice[-_ ]*/i, "").trim(), ch = who ? who.toLowerCase().codePointAt(0) : 0;
      st += ";--lk2:" + LETTER[ch % LETTER.length];
    }
    return st;
  }
  function findText(e, p) {   // what the search reads: the name, the kind, the halves, the tag, the trigger, the about
    return [nameOf(e.id), e.id, kindOf(e), p ? "both" : halfShort(e), tagOf(e), triggerOf(e), e.hint, (source(e.id) || {}).about].join(" ").toLowerCase();
  }
  function filterChips() {
    if (!S.host) return;
    var box = S.host.querySelector(".lora-chips"), words = String(S.find || "").toLowerCase().split(/\s+/).filter(Boolean), shown = 0, all = 0;
    if (!box) return;
    Array.prototype.forEach.call(box.querySelectorAll("[data-lora-chip]"), function (b) {
      var ok = (!S.kindPick || b.dataset.kind === S.kindPick) && words.every(function (w) { return (b.dataset.find || "").indexOf(w) >= 0; });
      b.hidden = !ok; all++; if (ok) shown++;
    });
    var n = S.host.querySelector(".lora-find-n");
    if (n) n.textContent = words.length || S.kindPick ? tr("{0} of {1}").replace("{0}", shown).replace("{1}", all) : "";
    Array.prototype.forEach.call(S.host.querySelectorAll("[data-kind-pick]"), function (k) {
      var on = S.kindPick === k.dataset.kindPick;
      k.classList.toggle("is-on", on); k.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }
  function halfShort(e) { return has(e, "ar") && has(e, "nar") ? "both" : has(e, "ar") ? "music" : "sound"; }
  // HERESY 1167 (Viktor: «Epic Trailer… предлагается как два разных адаптера… объедини их… MUSIC+SOUND=BOTH»): a file with
  // only the music half and a file with only the sound half, of one name, are one adapter here
  function pairOf(e) {
    if (!e || e.error || has(e, "ar") === has(e, "nar")) return null;
    var name = nameOf(e.id), want = has(e, "ar") ? "nar" : "ar";
    for (var i = 0; i < S.catalog.length; i++) {
      var o = S.catalog[i];
      if (o !== e && !o.error && nameOf(o.id) === name && has(o, want) && !has(o, want === "ar" ? "nar" : "ar")) return o;
    }
    return null;
  }
  function idsOf(id) { var p = pairOf(entry(id)); return p ? [id, p.id] : [id]; }

  // The sources.json entry for a file: its exact id, else the longest folder prefix of it
  function source(id) {
    var best = "";
    Object.keys(S.sources).forEach(function (key) {
      if ((id === key || id.indexOf(key) === 0) && key.length > best.length) best = key;
    });
    return best ? S.sources[best] : null;
  }

  // Only web links become links: anything else in sources.json stays plain text
  function webUrl(u) { return /^https?:\/\//i.test(String(u || "")) ? String(u) : ""; }

  function triggerOf(e) {
    var src = e ? source(e.id) : null;
    return e ? (e.trigger || (src && src.trigger) || "") : "";
  }

  function has(e, half) { return !!e && (e.halves || []).indexOf(half) >= 0; }

  function halvesText(e) {
    return has(e, "ar") && has(e, "nar") ? "music + sound" : has(e, "ar") ? "music" : has(e, "nar") ? "sound" : "";
  }

  function chipTip(e) {
    if (e.error) return nameOf(e.id) + "\n" + tr("Cannot load: " + e.error);
    var lines = [nameOf(e.id) + " · " + tr(halvesText(e) + (has(e, "ar") && has(e, "nar") ? " halves" : " half")),
      tr("rank " + e.rank + ", " + e.layout + " layout, " + e.size_mb + " MB")];
    if (triggerOf(e)) lines.push(tr("Trigger word: " + triggerOf(e)));
    if (e.mode) lines.push(tr("Trained in " + (e.mode === "direct" ? "Direct" : e.mode) + " mode"));
    if (e.hint) lines.push(e.hint);
    lines.push("loras/" + e.id);
    return lines.join("\n");
  }

  // chipTip with the recap from sources.json under the name
  function aboutTip(e) {
    var src = source(e.id), lines = chipTip(e).split("\n");
    if (src && src.about) lines.splice(1, 0, tr(src.about), "");   // HERESY 1166: the recap in the page's language
    var mine = userNote(e);                                          // HERESY 1802: the user's own note, under a line
    if (mine) lines.push("────────────", mine);
    return lines.join("\n");
  }
  // HERESY 1802 (Viktor 27.10.2026: «в Творце можно и к LoRA адаптерам заметки пользовательские, выводить их в тултипе адаптеров, но под чертой»):
  // one note an adapter whatever its precision (its bf16 and its q8 share it), kept by the Librarian's lab in user/collection.json; 600 characters
  var NOTE_MAX = 600;
  function noteKey(id) { return String(id || "").replace(/(\.(bf16|fp16|f16|fp32|f32|q8_0|q5_k_m|int8))?\.safetensors$/i, ""); }
  function userNote(e) { var n = e && S.userNotes[noteKey(e.id)]; return n ? (n.length > NOTE_MAX ? n.slice(0, NOTE_MAX - 1) + "…" : n) : ""; }
  function loadNotes() {
    if (!root.fetch) return;
    root.fetch("/lab/collection/lora-notes").then(function (r) { return r.ok ? r.json() : { notes: {} }; }).then(function (d) {
      S.userNotes = (d && d.notes) || {};
      paint();
    }).catch(function () { /* no lab here: no notes */ });
  }
  function editNote(e) {
    if (!root.HeresyDialog || !e) return;
    var key = noteKey(e.id), had = S.userNotes[key] || "", name = nameOf(e.id);
    root.HeresyDialog.prompt("Your note on “" + name + "”\n\nShown in its tooltip, under a line; 600 characters at most.\nEmpty removes it.", had,
      { area: true, rows: 6, max: NOTE_MAX, ok: "Keep" }).then(function (t) {
      if (t == null) return;
      t = String(t).trim();
      if (t === had) return;
      root.fetch("/lab/collection", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "lora-note", id: key, text: t }) })
        .then(function (r) { return r.ok ? r : r.json().then(function (d) { throw new Error((d && d.error) || "HTTP " + r.status); }); })
        .then(function () {
          if (t) S.userNotes[key] = t; else delete S.userNotes[key];
          paint();
          if (root.HeresyToast) root.HeresyToast(t ? "Note kept on “" + name + "”" : "Note taken off “" + name + "”");
        })
        .catch(function (er) { if (root.HeresyToast) root.HeresyToast(er.message, "bad"); });
    });
  }

  // A strength as written: at least `min` decimals, more only when the value has
  // them (a card's 0.375 stays 0.375, 0.5 stays 0.5)
  function fmt(v, min) {
    var s = Number(v).toFixed(3);
    while (s.length - s.indexOf(".") - 1 > min && s.charAt(s.length - 1) === "0") s = s.slice(0, -1);
    return s;
  }

  // HERESY 1081/1084 (Viktor 02.10.2026): measured limits, drawn on the slider as a road from green to red.
  // The music half above 0.75 breaks the score (70-200 tokens, then it fails) with every adapter he tried,
  // 0.5 gave a whole score; the sound half had no such trouble. A score adapter (trained with a score, like
  // the ABC one) takes more on the music half; our own adapters (loras/RUN/…, from the LoRA Trainer) are kept
  // tighter there. sources.json may set an adapter's own: "limits": {"ar": [safe, limit, max], "nar": [...]}.
  //   green up to safe · amber up to limit · red beyond it (allowed, warned)
  function scoreAdapter(e) { return !!e && ((e.mode && e.mode !== "direct") || /abc/i.test(e.id)); }
  function ownAdapter(e) {
    var parts = String(e && e.id || "").split("/"), src = e ? source(e.id) : null;
    return !!(src && src.own) || (parts.length === 2 && (parts[1].indexOf(parts[0] + ".") === 0 || parts[1].indexOf(parts[0] + "-e") === 0));
  }
  function zonesKept(e, half) {
    var src = e ? source(e.id) : null, own = src && src.limits && src.limits[half];
    if (own && own.length >= 2) return { safe: own[0], limit: own[1], max: own[2] || Math.max(own[1] * 1.5, own[1] + 0.25) };
    // HERESY 1595 (Viktor 19.10.2026): a voice adapter (its name says voice or vocal) was taught on speech; its music half writes the
    // score with the model and mutes the notes of both staves, so it stays at 0.5; its sound half carries the timbre, up to 1.0
    // HERESY 1623 (Viktor 20.10.2026: «По движкам Music перепиши макс на 0.75 (0.5 - это уже красное), по Sound - 1.0 (0.75 - уже красное)»): every
    // adapter alike now, a voice one and our own as well, on the sliders' tenths: the music half green to 0.4, red from 0.5, 0.75 at most; the sound
    // half green to 0.6, 0.7 amber, red from 0.75, 1.0 at most (a score adapter keeps its own, measured; none is in loras/ today)
    if (half === "nar") return { safe: 0.6, limit: 0.7, max: 1 };
    if (scoreAdapter(e)) return { safe: 1.0, limit: 1.25, max: 2 };
    return { safe: 0.4, limit: 0.45, max: 0.75 };
  }
  // HERESY 1629 (Viktor 20.10.2026: «добавь кнопку/checkbox для оверрайда на случай, если хочется выкрутить ползунки выше автолимитов. Но в Партитуру мы
  // всё равно шлём с лимитом»): Past the limits lifts each slider's most, the music half's to 1.5 and the sound half's to 2, its zones kept, so its colours
  // still say where the measured red is; the together ones likewise (totalZone); the budget holds none; the score is still planned with the music half
  // eased to the plan's fuse (app.js planEased)
  var FREE_MAX = { ar: 1.5, nar: 2 };
  function zones(e, half) {
    var z = zonesKept(e, half);
    return S.free ? { safe: z.safe, limit: z.limit, max: Math.max(z.max, FREE_MAX[half] || z.max) } : z;
  }
  function capOf(e, half) { return zones(e, half).max; }
  // HERESY 1089 (Viktor, 02.10.2026): the shared ceiling of the music half. Each strength may sit in its own
  // green and the run still break: stacked, they add up. Measured on the studio's takes (02.10.2026, the runs with
  // adapters on the music half and a written score): whole at 1.55, 1.75 and 2.25 together, broken at 2.5, 2.5
  // and 3.1 — every time. Green to 1.75, amber to 2.25, red past it; a sources.json "ar_total" may move it.
  var AR_TOTAL = { safe: 1.75, limit: 2.25, max: 3.5 };
  // HERESY 1167 (Viktor: «нужно добавить также ползунок sound, together»): the sound half's together, by ear (05.10.2026:
  // two adapters at sound 1.0 each, 2.0 together, brought a heavy bass; 0.55 together sounded right): green to 1, amber
  // to 1.5 (a single adapter's own red), red past it
  var TOTAL = { ar: AR_TOTAL, nar: { safe: 1.0, limit: 1.5, max: 3 } };
  // HERESY 1623 (Viktor 20.10.2026: «Sound (together) - макс 1.5. Зелёнка до 1.2. Music (together) - тоже макс 1.4 (здесь и ломается), зелёное до 1.2.
  // По готовой партитуре можно поднимать общее и выше, но при генерации - это предел»): while the model writes the score the music half together is
  // green to 1.2, 1.3 amber, red at 1.4, its most (the plans since 13.10.2026: up to 1.0 together none of 6 broke, from 1.0 to 1.2 14 of 35, past 1.2
  // 8 of 9); with a score in the form the music half writes none, and the ceiling above stands; the sound half together green to 1.2, red at 1.5, its most
  var AR_TOTAL_PLAN = { safe: 1.2, limit: 1.3, max: 1.4 };   // on the tenths: 1.3 amber, 1.4 red (a budget's red line is the amber edge)
  TOTAL.nar = { safe: 1.2, limit: 1.4, max: 1.5 };
  function scored() { return !!(S.opts && S.opts.scoreGiven && S.opts.scoreGiven()); }
  function totalZone(half) {
    var z = half === "nar" ? TOTAL.nar : scored() ? AR_TOTAL : AR_TOTAL_PLAN;
    return S.free ? { safe: z.safe, limit: z.limit, max: Math.max(z.max, half === "nar" ? 3 : 3.5) } : z;   // HERESY 1629: past the limits
  }
  function halfTotal(half) {
    return S.choice.reduce(function (s, c) { var e = entry(c.id); return s + (e && !c.muted && has(e, half) ? c[half] || 0 : 0); }, 0);
  }
  function arTotal() { return halfTotal("ar"); }
  function arStacked() { return S.choice.filter(function (c) { var e = entry(c.id); return e && !c.muted && has(e, "ar") && c.ar > 0; }).length; }
  // HERESY 1166 (Viktor 04.10.2026: «В Креаторе ползунок Music Together не работает. Подсчёт общей силы не работает. Сам по
  // скрину посчитай»): the bar was counted only when the form was painted, never while a strength was dragged (his screen:
  // 3.55, the five adapters' first strengths, over 1.55 on the sliders), and it only looked like a slider. Now it follows
  // every strength, and it is one: dragged, it moves all the music strengths at once (scaleMusic). Shown from two adapters
  // with a music half, at nought or not, so it stays under the hand that drags them down to nought.
  function capable(half) { return S.choice.filter(function (c) { var e = entry(c.id); return e && !c.muted && has(e, half); }).length; }
  function arCapable() { return capable("ar"); }
  function totalClass(t, half) { var z = totalZone(half || "ar"); return t > z.limit + 1e-9 ? "is-red" : t > z.safe + 1e-9 ? "is-amber" : "is-green"; }
  function totalBar() { return halfBar("ar") + halfBar("nar"); }
  function halfBar(half) {
    if (capable(half) < 2) return "";
    var t = halfTotal(half), z = totalZone(half), music = half === "ar";
    var road = "--z1:" + (100 * z.safe / z.max).toFixed(1) + "%;--z2:" + (100 * z.limit / z.max).toFixed(1) + "%";
    var tip = music ? (scored() ? tr("All the music strengths together. Measured on this studio's takes: the score came out whole up to " +
        z.limit + " in every run, broken from 2.5 in every run. Green to " + z.safe + ", amber to " + z.limit + ", red past it.")
      : tr("All the music strengths together while the model writes the score. Measured on this studio's plans (13–20.10.2026): up to 1.0 together none of 6 broke, " +
        "from 1.0 to 1.2 14 of 35 (on IRAEv3 8 of 10), past 1.2 8 of 9. Green to " + z.safe + ", amber to " + z.limit + ", red past it, " + z.max + " at most."))   // HERESY 1623
      : tr("All the sound strengths together. By ear (05.10.2026): two adapters at sound 1.0 each, 2.0 together, brought a heavy bass; 0.55 together sounded right. Green to " +
        z.safe + ", amber to " + z.limit + ", red past it.");
    return '<label class="lora-total ' + totalClass(t, half) + '" data-half="' + half + '" data-tip="' + escape(tip + " " +
        tr("Drag it to move them all at once, each in proportion.")) + '">' +
      "<span>" + (music ? "Music, together" : "Sound, together") + "</span>" +
      '<input type="range" class="zoned lora-total-range" data-half="' + half + '" style="' + road + '" min="0" max="' + z.max + '" step="0.1" value="' + t +
      '" aria-label="' + escape(tr(music ? "Music, together" : "Sound, together")) + '" />' +
      "<output>" + fmt(t, 2) + "</output></label>";
  }
  // the bar brought up to date where it stands; while its own slider is dragged, the slider is left under the hand
  function syncTotal(dragging) {
    if (!S.host) return;
    ["ar", "nar"].forEach(function (half) {
      var bar = S.host.querySelector('.lora-total[data-half="' + half + '"]'), html = halfBar(half);
      if (!bar || !html) {
        if (bar) bar.remove();
        if (html) S.host.querySelector(".lora-active").insertAdjacentHTML("beforeend", html);
        return;
      }
      var t = halfTotal(half), range = bar.querySelector("input");
      bar.className = "lora-total " + totalClass(t, half);
      bar.querySelector("output").textContent = fmt(t, 2);
      if (range && dragging !== half) range.value = t;
    });
    paintHeld();                                     // HERESY 1458: what runs, as the strengths move
  }
  // every music strength moved at once, each in proportion to where it stood when the drag began (all alike when all
  // stood at nought), none past its own max, on the sliders' grid (tenths since 1623; 0.005 before); the grid's remainders go to the largest
  // fractions, so the sum lands where the slider is let go (each rounded on its own, 1 came out 0.995)
  function scaleMusic(target) { scaleHalf("ar", target); }
  function scaleHalf(half, target) {   // HERESY 1167: either half; a muted adapter is left as it is
    if (!S.base || S.baseHalf !== half) {
      S.baseHalf = half;
      S.base = S.choice.filter(function (c) { var e = entry(c.id); return e && !c.muted && has(e, half); })
        .map(function (c) { return { c: c, ar: c[half] || 0, cap: capOf(entry(c.id), half) }; });
    }
    var sum = S.base.reduce(function (s, b) { return s + b.ar; }, 0), n = S.base.length;
    var G = 10, top = function (b) { return Math.floor(b.cap * G + 1e-9); };   // HERESY 1623: tenths; a max between them (0.75) stops at 0.7
    var u = S.base.map(function (b) { return Math.min(top(b), Math.max(0, (sum > 1e-9 ? b.ar * target / sum : target / n) * G)); });
    var got = u.map(function (x) { return Math.floor(x + 1e-9); });
    var left = Math.round(target * G) - got.reduce(function (s, x) { return s + x; }, 0);
    u.map(function (x, i) { return i; }).sort(function (a, b) { return (u[b] - got[b]) - (u[a] - got[a]); }).forEach(function (i) {
      if (left > 0 && got[i] + 1 <= top(S.base[i]) && u[i] - got[i] > 1e-9) { got[i]++; left--; }
    });
    S.base.forEach(function (b, i) { b.c[half] = got[i] / G; });
    S.host.querySelectorAll('.lora-half input[data-half="' + half + '"]').forEach(function (r) {
      var c = S.choice.filter(function (x) { return x.id === r.dataset.lora; })[0];
      if (!c || c.muted) return;
      r.value = c[half];
      if (r.nextElementSibling) r.nextElementSibling.textContent = fmt(c[half], 2);
      r.parentNode.classList.toggle("is-over", overLimit(entry(c.id), half, c[half]));
    });
    syncTotal(half);
    paintNotes();
  }
  function overLimit(e, half, v) { return v > zones(e, half).limit + 1e-9; }

  // HERESY 1447 (Viktor 14.10.2026: «LoRA ересь и алхимия»; 15.10.2026: «И не забудь за динамичную волну, именно ту, что ты
  // воплотил в слайдерах стилей»): an adapter's strength through the song on the sliders' own wave (HERESY 1166: points
  // [t, k], k the share of its strength, eased by half a cosine; flat: none), one wave for a pair's two files; and the
  // adapters that push on the same layers (the lab's word, /lab/lora/profile) under one budget a half: off, Share (each
  // gives way in proportion past the red line) or In order (served from the top row; what one lets go, the next takes). The
  // engine runs such an adapter with the graph (lora-rt.h) and keeps the budget at every moment of the song
  var WAVE_ARCH = [[0, 0.15], [0.5, 1], [1, 0.15]], waveOpen = {}, waveDrag = null, WW = 300, WH = 90, WP = 8;

  // HERESY 1665 (Viktor 20.10.2026, RIVALS 3 «LoRA по секциям — маска из лирики»: «ОДОБРЯЮ»): a wave by the song's sections. The adapter sounds in
  // the ticked ones and rests in the others, a ramp of 1.5 s at each border. The sections and their times: the score's «% verse» blocks counted in
  // bars at its metre and tempo when the form has a score (Full), else the lyrics' tags, each as long as its lines (one with none, an intro or a
  // solo, as four), over the song's length (Song ≈, else Output's). Worked out again from the form as it is at each Generate
  var SEC_RAMP = 1.5;
  function scoreSections(abc) {
    var M = /^M:\s*(\d+)\/(\d+)/m.exec(abc), Q = /^Q:\s*(\d+)\/(\d+)\s*=\s*(\d+(?:\.\d+)?)/m.exec(abc);
    var bar = (M ? +M[1] / +M[2] : 1) / (Q ? +Q[1] / +Q[2] : 0.25) * 60 / (Q ? +Q[3] : 120);   // seconds a bar
    var out = [], cur = null, voice = "";
    String(abc).split("\n").forEach(function (line) {
      var m = /^%\s*([^%\s].*?)\s*$/.exec(line);
      if (m) { cur = { name: m[1].charAt(0).toUpperCase() + m[1].slice(1), sec: 0, first: "" }; out.push(cur); return; }
      var v = /^V:\s*(\S+)/.exec(line);
      if (v) { voice = v[1]; if (cur && !cur.first) cur.first = voice; return; }
      if (!cur || voice !== cur.first || /^[A-Za-z]:/.test(line)) return;   // the section's first voice (Vocal) counts its bars
      line.split("|").forEach(function (b) { if (!b.trim()) return; var z = /^\s*Z(\d*)\s*$/.exec(b); cur.sec += bar * (z ? (+z[1] || 1) : 1); });
    });
    return out.filter(function (s) { return s.sec > 0; }).map(function (s) { return { name: s.name, sec: s.sec }; });
  }
  function lyricSections(text) {
    var out = [], cur = null, len = songGuess() || songAxis(), w = 0;
    String(text).split("\n").forEach(function (line) {
      var m = /^\s*\[([^\]]+)\]\s*$/.exec(line);
      if (m) { cur = { name: m[1].trim(), lines: 0 }; out.push(cur); return; }
      if (cur && line.trim()) cur.lines++;
    });
    out.forEach(function (s) { s.w = s.lines || 4; w += s.w; });
    return out.map(function (s) { return { name: s.name, sec: len && w ? len * s.w / w : 0, rough: true }; });
  }
  function songSections() {
    var abc = S.opts.score ? String(S.opts.score() || "") : "", s = abc.trim() ? scoreSections(abc) : [];
    return s.length ? s : lyricSections(S.opts.lyrics ? String(S.opts.lyrics() || "") : "");
  }
  function allSections() { return songSections().map(function (s, i) { return i; }); }
  function sectionCurve(on) {
    var secs = songSections(), L = songAxis() || secs.reduce(function (a, s) { return a + s.sec; }, 0);
    if (!secs.length || !L) return null;
    on = on || secs.map(function (s, i) { return i; });
    var r = Math.min(0.02, SEC_RAMP / L), t = 0, pts = [[0, on.indexOf(0) >= 0 ? 1 : 0]];
    secs.forEach(function (s, i) {
      t += s.sec;
      if (i + 1 >= secs.length) return;
      var a = on.indexOf(i) >= 0 ? 1 : 0, b = on.indexOf(i + 1) >= 0 ? 1 : 0, f = Math.min(1, t / L);
      if (a !== b && f < 1) pts.push([Math.max(0, f - r), a], [Math.min(1, f + r), b]);
    });
    pts.push([1, on.indexOf(secs.length - 1) >= 0 ? 1 : 0]);
    return pts.map(function (q) { return [Math.round(q[0] * 1000) / 1000, q[1]]; });
  }
  function sectionWave(key) { var c = rowChoices(key)[0]; if (c) setWave(key, sectionCurve(c.sections) || [[0, 1], [1, 1]], "sections"); }
  function sectionChips(c) {
    var secs = songSections(), on = c.sections || secs.map(function (s, i) { return i; });
    if (!secs.length) return '<p class="row-hint lora-secs-none">No sections yet: tag the lyrics, [Verse], [Chorus]…</p>';
    var seen = {}, many = {};
    secs.forEach(function (s) { many[s.name] = (many[s.name] || 0) + 1; });
    return '<div class="lora-secs" role="group">' + secs.map(function (s, i) {
      var lit = on.indexOf(i) >= 0, n = seen[s.name] = (seen[s.name] || 0) + 1;   // a name sung again numbered: Verse 1, Verse 2
      return '<button type="button" class="lora-sec' + (lit ? " is-on" : "") + '" data-sec="' + i + '" aria-pressed="' + lit + '">' + escape(s.name + (many[s.name] > 1 ? " " + n : "")) + "</button>";
    }).join("") + "</div>" + '<p class="row-hint">The adapter sounds in the ticked sections and rests in the others, with a short ramp at each border.</p>' +
      '<p class="row-hint">' + (secs[0].rough ? "By the lyrics' lines, roughly: give the song a score for exact borders." : "By the score's bars.") + "</p>";
  }
  function waveAt(c, t) {
    if (!c || !c.length) return 1;
    if (t <= c[0][0]) return c[0][1];
    for (var i = 1; i < c.length; i++) {
      if (t <= c[i][0]) {
        var t0 = c[i - 1][0], t1 = c[i][0], u = t1 > t0 ? (t - t0) / (t1 - t0) : 1, e = 0.5 - 0.5 * Math.cos(Math.PI * u);
        return c[i - 1][1] + (c[i][1] - c[i - 1][1]) * e;
      }
    }
    return c[c.length - 1][1];
  }
  function r3(v) { return Math.round(v * 1000) / 1000; }
  function waveClean(c) {   // as the request carries it: points in order, t and k 0..1, 64 at most; flat is none
    if (!Array.isArray(c)) return null;
    var pts = c.filter(function (q) { return Array.isArray(q) && isFinite(q[0]) && isFinite(q[1]); })
      .map(function (q) { return [r3(Math.min(1, Math.max(0, +q[0]))), r3(Math.min(1, Math.max(0, +q[1])))]; })
      .sort(function (a, b) { return a[0] - b[0]; }).slice(0, 64);
    if (pts.length < 2 || pts.every(function (q) { return q[1] === 1; })) return null;
    return pts;
  }
  function waveMode(c) {
    if (!c.curve) return "flat";
    return c.curveMode || (JSON.stringify(c.curve) === JSON.stringify(WAVE_ARCH) ? "arch" : "draw");
  }
  function wavePath(c, w, h, pad) {
    var d = "";
    for (var i = 0; i <= 48; i++) {
      var t = i / 48, k = Math.min(1, Math.max(0, waveAt(c, t)));
      d += (i ? " L" : "M") + (pad + t * (w - 2 * pad)).toFixed(1) + "," + (pad + (1 - k) * (h - 2 * pad)).toFixed(1);
    }
    return d;
  }
  function rowChoices(key) { var ids = String(key).split("|"); return S.choice.filter(function (c) { return ids.indexOf(c.id) >= 0; }); }
  function setWave(key, curve, mode) {           // a pair's two files ride one wave
    rowChoices(key).forEach(function (c) {
      if (curve) { c.curve = curve.map(function (q) { return q.slice(); }); c.curveMode = mode; }
      else { delete c.curve; delete c.curveMode; }
    });
  }
  function waveButton(key, c, name) {
    var open = !!waveOpen[key];
    return '<button type="button" class="slider-curve lora-wave' + (waveClean(c.curve) ? " is-curved" : "") + (open ? " is-open" : "") +
      '"' + (c.muted ? " disabled" : "") + ' data-wave-toggle="' + escape(key) + '" aria-expanded="' + open + '" aria-label="' + escape(tr(name + ": its curve through the song")) +
      '" data-tip="' + escape(tr("How its strength runs through the song: flat, an arch, or drawn by hand")) + '"><svg viewBox="0 0 48 18" aria-hidden="true"><path d="' +
      wavePath(c.curve, 48, 18, 2) + '"/></svg></button>';
  }
  // HERESY 1458 (Viktor 15.10.2026: «Не хватает ещё более чёткой сетки в бекграунд редактирования графика… поле для ввода
  // примерного расчётного по длительности трека генерируемого. Выставлять по этому числу минут и секунд сетку в графе волны,
  // чтобы по ней, а не на глаз, двигать волну»): the graph drawn at its own size in pixels (round points and one-pixel lines at any
  // width, in the form and over the page), a grid of the strength's quarters and of minutes and seconds along the length the
  // engine runs the wave over: the length set in Output (the music half's budget, frames = seconds x 25, and the sound half's
  // span with it, pipeline.h), not the song's own length; the song's expected end marked from the «Song ≈» field (what lies
  // past it is not heard), a read-out of where the pointer is, Shift onto the grid
  var WG = { l: 40, r: 14, t: 12, b: 24 };
  function songAxis() { var s = S.opts.songLength ? +S.opts.songLength() : 0; return isFinite(s) && s > 0 ? s : 0; }
  function songGuess() { try { var v = +root.localStorage.getItem("yue2.loraSongLen"); return isFinite(v) && v > 0 ? v : 0; } catch (e) { return 0; } }
  var LOCK_SVG = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor"/>' +
    '<path class="shackle" d="M5 7V5a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';   // HERESY 1468: the knobs' lock
  function clockOf(s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2); }
  function parseClock(v) {   // 3:30, 210 (seconds), 3.5 or 3 (minutes, fifteen at most)
    v = String(v || "").trim().replace(",", ".");
    var m = /^(\d+):(\d{1,2})$/.exec(v);
    if (m) return +m[1] * 60 + Math.min(59, +m[2]);
    if (/^\d+(\.\d+)?$/.test(v)) return +v <= 15 ? Math.round(+v * 60) : Math.round(+v);
    return 0;
  }
  function timeSteps(L) { return L <= 90 ? [5, 15] : L <= 240 ? [10, 30] : L <= 480 ? [15, 60] : [30, 60]; }   // [the fine, the labelled], seconds
  function waveGeo(svg) {
    var W = Math.max(160, Math.round(svg.clientWidth || 300)), H = Math.max(80, Math.round(svg.clientHeight || 160));
    return { W: W, H: H, x0: WG.l, x1: W - WG.r, y0: WG.t, y1: H - WG.b };
  }
  function waveX(g, t) { return g.x0 + t * (g.x1 - g.x0); }
  function waveY(g, k) { return g.y0 + (1 - k) * (g.y1 - g.y0); }
  function waveLine(g, c) {
    var d = "";
    for (var i = 0; i <= 120; i++) {
      var t = i / 120, k = Math.min(1, Math.max(0, waveAt(c, t)));
      d += (i ? " L" : "M") + waveX(g, t).toFixed(1) + "," + waveY(g, k).toFixed(1);
    }
    return d;
  }
  function waveDraw(svg, c) {
    if (!svg || !c) return;
    var g = svg._geo = waveGeo(svg), L = songAxis(), est = songGuess(), grid = "", text = "", past = "", ty = g.y1 + 16;
    svg.setAttribute("viewBox", "0 0 " + g.W + " " + g.H);
    function h(k, cls) { var y = Math.round(waveY(g, k)) + 0.5; return '<line class="' + cls + '" x1="' + g.x0 + '" y1="' + y + '" x2="' + g.x1 + '" y2="' + y + '"/>'; }
    function v(t, cls) { var x = Math.round(waveX(g, t)) + 0.5; return '<line class="' + cls + '" x1="' + x + '" y1="' + g.y0 + '" x2="' + x + '" y2="' + g.y1 + '"/>'; }
    function lab(x, y, words, anchor) { return '<text class="wg-label" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" text-anchor="' + anchor + '">' + words + "</text>"; }
    for (var q = 1; q < 20; q++) if (q % 5) grid += h(q / 20, "wg-minor");
    [0.25, 0.5, 0.75].forEach(function (k) { grid += h(k, k === 0.5 ? "wg-half" : "wg-major"); });
    [0, 0.25, 0.5, 0.75, 1].forEach(function (k) { text += lab(g.x0 - 6, waveY(g, k) + 3.5, Math.round(k * 100) + " %", "end"); });
    if (L) {
      var st = timeSteps(L);
      for (var sec = st[0]; sec < L - 0.5; sec += st[0]) {
        var big = Math.abs(sec / st[1] - Math.round(sec / st[1])) < 1e-6;
        grid += v(sec / L, big ? "wg-major" : "wg-minor");
        if (big && waveX(g, sec / L) < g.x1 - 34) text += lab(waveX(g, sec / L), ty, clockOf(sec), "middle");
      }
      text += lab(g.x0, ty, "0:00", "start") + lab(g.x1, ty, clockOf(L), "end");
    } else {
      for (var p = 1; p < 20; p++) {
        grid += v(p / 20, p % 5 ? "wg-minor" : "wg-major");
        if (!(p % 5)) text += lab(waveX(g, p / 20), ty, p * 5 + " %", "middle");
      }
      text += lab(g.x0, ty, escape(tr("start")), "start") + lab(g.x1, ty, escape(tr("end")), "end");
    }
    grid += '<rect class="wg-frame" x="' + (g.x0 + 0.5) + '" y="' + (g.y0 + 0.5) + '" width="' + (g.x1 - g.x0 - 1) + '" height="' + (g.y1 - g.y0 - 1) + '"/>';
    if (L && est && est < L - 0.5) {
      var xe = waveX(g, est / L);
      past = '<rect class="wg-past" x="' + xe.toFixed(1) + '" y="' + g.y0 + '" width="' + (g.x1 - xe).toFixed(1) + '" height="' + (g.y1 - g.y0) + '"/>' +
        '<line class="wg-end" x1="' + xe.toFixed(1) + '" y1="' + g.y0 + '" x2="' + xe.toFixed(1) + '" y2="' + g.y1 + '"/>' +
        '<text class="wg-end-label" x="' + (xe - 5).toFixed(1) + '" y="' + (g.y0 + 14) + '" text-anchor="end">' + escape(tr("≈ the song's end")) + " " + clockOf(est) + "</text>";
    }
    var d = waveLine(g, c.curve);
    svg.innerHTML = '<g class="wg">' + grid + "</g>" + past + '<path class="curve-area" d="' + d + " L" + g.x1 + "," + g.y1 + " L" + g.x0 + "," + g.y1 + ' Z"/>' +
      '<path class="curve-line" d="' + d + '"/>' + (c.curve || []).map(function (pt, i) {
        return '<circle class="curve-pt" data-pt="' + i + '" r="6" cx="' + waveX(g, pt[0]).toFixed(1) + '" cy="' + waveY(g, pt[1]).toFixed(1) + '"/>';
      }).join("") + '<g class="wg-text">' + text + "</g>";
    var ed = svg.closest("[data-wave-edit]"), warn = ed && ed.querySelector(".lora-wave-past");
    if (warn) {
      warn.hidden = !(L && est > L + 0.5);
      warn.textContent = warn.hidden ? "" : tr("Longer than the length set in Output (" + clockOf(L) + "): the song stops there, and the wave with it.");
    }
  }
  function layoutWaves() {
    if (!S.host) return;
    var L = songAxis();                               // HERESY 1468: Output's length, wherever its field is not being typed in
    Array.prototype.forEach.call(S.host.querySelectorAll(".lora-wave-out-in"), function (x) { if (root.document.activeElement !== x) x.value = L ? clockOf(L) : ""; });
    Array.prototype.forEach.call(S.host.querySelectorAll("svg[data-wave-graph]"), function (svg) {
      if (waveDrag && waveDrag.svg === svg) return;
      waveDraw(svg, rowChoices(svg.dataset.waveGraph)[0]);
    });
  }
  function waveAtText(at) {
    var L = songAxis(), t = Math.min(1, Math.max(0, at.t)), k = Math.min(1, Math.max(0, at.k));
    return (L ? clockOf(t * L) : Math.round(t * 100) + " %") + " · " + Math.round(k * 100) + " %";
  }
  function waveSnap(at, on) {   // Shift: the time onto its fine grid (twentieths of the song without a length), the strength onto twentieths
    if (!on) return at;
    var L = songAxis(), st = L ? timeSteps(L)[0] / L : 0.05;
    return { t: Math.round(at.t / st) * st, k: Math.round(at.k * 20) / 20 };
  }
  function waveEditor(key, c, name) {
    var mode = waveMode(c), L = songAxis(), g = songGuess();
    return '<div class="curve-edit lora-wave-edit" data-wave-edit="' + escape(key) + '">' +
      '<div class="lora-wave-head"><div class="curve-modes" role="group" aria-label="' + escape(tr(name + ": its curve through the song")) + '">' +
      [["flat", "Flat"], ["arch", "Arch"], ["draw", "Draw"], ["sections", "Sections"]].map(function (m) {
        return '<button type="button" class="curve-mode' + (mode === m[0] ? " is-on" : "") + '" data-wave-mode="' + m[0] + '" aria-pressed="' + (mode === m[0]) + '">' + m[1] + "</button>";
      }).join("") + "</div>" + '<span class="lora-wave-at mono"></span>' +
      (L ? '<label class="lora-wave-len" data-tip="' + escape(tr("About how long the song will run, minutes:seconds. The wave runs over the length set in Output (" + clockOf(L) +
        "): what you draw past the song's end is not heard.")) + '"><span>Song ≈</span><input type="text" class="lora-wave-len-in mono" inputmode="numeric" spellcheck="false" placeholder="m:ss" value="' +
        (g ? clockOf(g) : "") + '" aria-label="' + escape(tr("About how long the song will run")) + '" /></label>' +
        // HERESY 1468 (Viktor 15.10.2026: «после поля ввода выводи также время вывода… под замком»): the length the wave runs over
        '<label class="lora-wave-out is-locked" data-tip="' + escape(tr("Output's length: the wave runs over it. Locked against a stray edit: open the lock to change Max length from here")) +
        '"><span>' + escape(tr("Output")) + '</span><input type="text" class="lora-wave-out-in mono" inputmode="numeric" spellcheck="false" readonly value="' + clockOf(L) +
        '" aria-label="' + escape(tr("Output's length")) + '" /><span class="lora-wave-lock" role="button" tabindex="0" data-tip="' + escape(tr("Locked against a stray edit: click to change it")) + '">' +
        LOCK_SVG + "</span></label>" : "") + "</div>" +
      '<svg class="curve-graph lora-wave-graph" data-wave-graph="' + escape(key) + '"></svg>' + (mode === "sections" ? sectionChips(c) : "") +   // HERESY 1665
      '<p class="row-hint">Drag a point up for a flare, down for a fade, along the song to move it; double-click to add one, ' +
      "double-click a point to take it out. The strength above is the top of the curve.</p>" +
      '<p class="row-hint lora-wave-snap">Shift keeps a point on the grid; a right-click takes a point out.</p><p class="row-hint lora-wave-past" hidden></p></div>';
  }
  function waveRedraw(svg, c) {   // while a point is dragged: the same elements moved, so the pointer keeps its point
    var g = svg._geo;
    if (!g) return waveDraw(svg, c);
    var d = waveLine(g, c.curve);
    svg.querySelector(".curve-line").setAttribute("d", d);
    svg.querySelector(".curve-area").setAttribute("d", d + " L" + g.x1 + "," + g.y1 + " L" + g.x0 + "," + g.y1 + " Z");
    Array.prototype.forEach.call(svg.querySelectorAll(".curve-pt"), function (el, i) {
      var q = c.curve && c.curve[i];
      if (!q) return;
      el.setAttribute("cx", waveX(g, q[0]).toFixed(1));
      el.setAttribute("cy", waveY(g, q[1]).toFixed(1));
    });
  }
  function wavePointer(svg, event) {
    var g = svg._geo || waveGeo(svg), r = svg.getBoundingClientRect();
    var x = (event.clientX - r.left) * g.W / (r.width || 1), y = (event.clientY - r.top) * g.H / (r.height || 1);
    return { t: (x - g.x0) / (g.x1 - g.x0), k: 1 - (y - g.y0) / (g.y1 - g.y0) };
  }

  // the budget: which live adapters push on the same layers (the lab's groups, joined over both halves; one group for them
  // all while the lab has not answered, as most adapters touch every layer), the caps the measured red lines
  function liveChoices() { return S.choice.filter(function (c) { var e = entry(c.id); return e && !e.error && !c.muted && (c.ar > 0 || c.nar > 0); }); }
  function budgetGroups() {
    var live = liveChoices().map(function (c) { return c.id; });
    if (S.budget === "off" || S.free || live.length < 2) return [];   // HERESY 1629: past the limits, no budget
    var parent = {};
    live.forEach(function (id) { parent[id] = id; });
    function find(x) { while (parent[x] !== x) x = parent[x] = parent[parent[x]]; return x; }
    var g = S.profile && S.profile.groups;
    if (g && (g.ar || g.nar)) {
      ["ar", "nar"].forEach(function (half) {
        (g[half] || []).forEach(function (members) {
          var m = members.filter(function (id) { return parent[id] !== undefined; });
          for (var i = 1; i < m.length; i++) parent[find(m[i])] = find(m[0]);
        });
      });
      liveChoices().forEach(function (c) {   // a pair's two files are one adapter
        var p = pairOf(entry(c.id));
        if (p && parent[p.id] !== undefined) parent[find(p.id)] = find(c.id);
      });
    } else {
      for (var i = 1; i < live.length; i++) parent[find(live[i])] = find(live[0]);
    }
    var by = {}, order = [];
    live.forEach(function (id) { var r = find(id); if (!by[r]) { by[r] = []; order.push(r); } by[r].push(id); });
    return order.map(function (r) { return by[r]; }).filter(function (m) { return m.length > 1; });
  }
  function groupOf(id) {
    var gs = budgetGroups();
    for (var i = 0; i < gs.length; i++) if (gs[i].indexOf(id) >= 0) return i;
    return -1;
  }
  function loraGroups() {
    return budgetGroups().map(function () {
      return { cap: totalZone("ar").limit, cap_nar: totalZone("nar").limit, mode: S.budget === "order" ? "order" : "share" };
    });
  }
  // HERESY 1458 (Viktor 15.10.2026: «Твоё предложение принимаю по показу более точных долей применения в выхлопе»): what the budget
  // lets each strength run with the waves at their top, counted as the engine counts it (lora-rt.h: each half's group in the
  // request's order or in proportion, capped at the red line); a row that gives way says its share and dims its road past it,
  // and each half's together says what runs of what is asked: the same sum in both modes, the rows differ
  function budgetCuts() {
    var out = {};
    if (S.budget === "off" || S.free) return out;
    budgetGroups().forEach(function (members) {
      ["ar", "nar"].forEach(function (half) {
        var cap = totalZone(half).limit, left = cap, ms = members.map(function (id) { return S.choice.filter(function (c) { return c.id === id; })[0]; })
          .filter(function (c) { var e = c && entry(c.id); return e && has(e, half) && (c[half] || 0) > 0; });
        var sum = ms.reduce(function (s, c) { return s + c[half]; }, 0);
        if (sum <= cap + 1e-9) return;
        ms.forEach(function (c) {
          var got = S.budget === "order" ? Math.min(c[half], Math.max(0, left)) : c[half] * cap / sum;
          left -= got;
          (out[c.id] = out[c.id] || {})[half] = got;
        });
      });
    });
    return out;
  }
  function paintHeld() {
    if (!S.host) return;
    var cuts = budgetCuts(), order = S.budget === "order";
    function mark(range, got) {
      if (got === null) { range.style.removeProperty("--cutf"); delete range.dataset.held; return; }
      range.style.setProperty("--cutf", String(Math.max(0, Math.min(1, got / (+range.max || 1)))));
      range.dataset.held = String(r3(got));
    }
    Array.prototype.forEach.call(S.host.querySelectorAll('.lora-half input[type="range"][data-lora]'), function (r) {
      var c = S.choice.filter(function (x) { return x.id === r.dataset.lora; })[0], half = r.dataset.half, out = r.nextElementSibling;
      if (!c || !out || out.tagName !== "OUTPUT") return;
      var asked = c[half] || 0, got = cuts[c.id] && cuts[c.id][half], held = got !== undefined && got < asked - 1e-6;
      r.parentNode.classList.toggle("is-held", held);
      mark(r, held ? got : null);
      out.textContent = fmt(held ? got : asked, 2);
      out.dataset.tip = held ? tr(order ? "Runs " + fmt(got, 2) + " of " + fmt(asked, 2) + ": in order, the rows above take theirs first and this one gets what the red line leaves."
                                        : "Runs " + fmt(got, 2) + " of " + fmt(asked, 2) + ": shared, the adapters on the same layers give way in proportion past the red line.") +
        "\n" + tr("Double-click to type it") : "Double-click to type it";
    });
    ["ar", "nar"].forEach(function (half) {
      var bar = S.host.querySelector('.lora-total[data-half="' + half + '"]');
      if (!bar) return;
      var t = halfTotal(half), got = S.choice.reduce(function (sum, c) {
        var e = entry(c.id);
        return e && !c.muted && has(e, half) ? sum + (cuts[c.id] && cuts[c.id][half] !== undefined ? cuts[c.id][half] : c[half] || 0) : sum;
      }, 0), held = got < t - 1e-6, range = bar.querySelector("input"), out = bar.querySelector("output");
      if (bar.dataset.baseTip === undefined) bar.dataset.baseTip = bar.dataset.tip || "";
      bar.className = "lora-total " + totalClass(held ? got : t, half) + (held ? " is-held" : "");
      if (out) out.textContent = fmt(held ? got : t, 2);
      if (range) mark(range, held ? got : null);
      bar.dataset.tip = bar.dataset.baseTip + (held ? "\n\n" + tr("Runs " + fmt(got, 2) + " of the " + fmt(t, 2) + " asked: the budget holds the adapters on shared layers at the red line.") : "");
    });
  }
  // HERESY 1629: Past the limits, at the end of the budget's row (from one adapter on; the budget's two from two)
  function freeBox() {
    return '<label class="lora-free' + (S.free ? " is-on" : "") + '" data-tip="' + escape(tr("Past the limits: each slider goes past its own most (music to 1.5, sound to 2), and the together ones too, their colours still where the measured red is; the budget holds none. For an adapter whose wave plays only part of the song, as a duduk in the intro: the others need not give it their share. The score is still planned with the music half eased to the plan's fuse, then sung at the strengths set.")) + '"><input type="checkbox" data-lora-free' +
      (S.free ? " checked" : "") + ' /><span>Past the limits</span></label>';
  }
  function setFree(on) {
    S.free = !!on;
    try { if (S.free) root.localStorage.setItem("yue2.loraFree", "on"); else root.localStorage.removeItem("yue2.loraFree"); } catch (e) { /* this view only */ }
    if (!S.free) S.choice.forEach(function (c) {      // back within the limits: a strength past its own most comes down to it
      var e = entry(c.id);
      if (e) ["ar", "nar"].forEach(function (h) { var m = zonesKept(e, h).max; if (c[h] > m) c[h] = m; });
    });
    changed();
  }
  function budgetBar() {
    if (!liveChoices().length) return "";
    if (liveChoices().length < 2) return '<div class="lora-budget">' + freeBox() + "</div>";
    var tip = tr("Adapters that push on the same layers share one budget a half, its red line the cap: Share gives way in proportion past it, In order serves them from the top row, and what one lets go, the next one takes. The engine keeps it at every moment of the song.");
    return '<div class="lora-budget" role="group" aria-label="' + escape(tr("Budget")) + '"><span class="lora-budget-name" data-tip="' + escape(tip) + '">Budget</span>' +
      // HERESY 1457 (Viktor: «Режимов у нас же два? Тогда ВЫКЛ и не нужен»): two modes; none lit is no budget, the lit one pressed again
      [["share", "Share"], ["order", "In order"]].map(function (m) {
        return '<button type="button" class="curve-mode' + (S.budget === m[0] ? " is-on" : "") + '" data-budget="' + m[0] + '" aria-pressed="' + (S.budget === m[0]) +
          '"' + (S.free ? " disabled" : "") + ' data-tip="' + escape(tr(S.free ? "Past the limits: no budget, each adapter at its own strength" : "Press it again: no budget, each adapter at its own strength")) + '">' + m[1] + "</button>";
      }).join("") + (S.budget === "order" && !S.free ? '<span class="row-hint lora-budget-hint">Drag the rows by their names to set their order</span>' : "") + freeBox() + "</div>";
  }
  // the lab's word for the adapters of the form, asked when they change (none: the budget groups them all, the tips say nothing)
  function wantProfile() {
    var ids = liveChoices().map(function (c) { return c.id; }).sort(), key = ids.join(",");
    if (key === S.profileKey) return;
    S.profileKey = key;
    if (ids.length < 1 || !root.fetch) { S.profile = null; return; }
    root.fetch("/lab/lora/profile?ids=" + encodeURIComponent(key)).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (S.profileKey === key) { S.profile = d && d.adapters ? d : null; paintNotes(); paintBudgetTips(); paintHeld(); } })   // 1458: its groups change what runs
      .catch(function () { /* no lab: the budget groups them all */ });
  }
  // where an adapter pushes, from the lab: the layers it reaches on each half, attention against MLP, how far it moves them
  function footprint(id) {
    var a = S.profile && S.profile.adapters && S.profile.adapters[id];
    if (!a) return "";
    return ["ar", "nar"].map(function (half) {
      var h = a.halves && a.halves[half];
      if (!h || !h.bins) return "";
      var attn = 0, mlp = 0, layers = 0, tot = 0;
      Object.keys(h.bins).forEach(function (k) { var v = h.bins[k] * h.bins[k]; tot += v; if (/\.attn$/.test(k)) attn += v; else if (/\.mlp$/.test(k)) mlp += v; });
      Object.keys(h.layers || {}).forEach(function (k) { if (k !== "edge" && h.layers[k] * h.layers[k] > tot * 0.002) layers++; });
      var moves = h.moves_percent ? Object.keys(h.moves_percent).reduce(function (m, k) { return Math.max(m, h.moves_percent[k]); }, 0) : 0;
      return tr((half === "ar" ? "Music half" : "Sound half") + ": {0} layers, attention {1} %, MLP {2} %")
        .replace("{0}", layers).replace("{1}", Math.round(100 * attn / (tot || 1))).replace("{2}", Math.round(100 * mlp / (tot || 1))) +
        (moves ? " · " + tr("moves a layer by up to {0} % at 1.0").replace("{0}", moves.toFixed(2)) : "");
    }).filter(Boolean).join("\n");
  }
  function paintBudgetTips() {
    if (!S.host) return;
    Array.prototype.forEach.call(S.host.querySelectorAll(".lora-row[data-ids]"), function (row) {
      var name = row.querySelector(".lora-name"), ids = row.dataset.ids.split("|"), fp = ids.map(footprint).filter(Boolean).join("\n");
      if (!name) return;
      if (!name.dataset.baseTip) name.dataset.baseTip = name.dataset.tip || "";
      name.dataset.tip = name.dataset.baseTip + (fp ? "\n\n" + tr("Where it pushes:") + "\n" + fp : "");
    });
  }
  // two adapters on the same layers: how much they share and how they pull, said once a pair
  function pairNotes() {
    if (!S.profile || !S.profile.pairs) return [];
    var out = [], said = {};
    S.profile.pairs.forEach(function (q) {
      if (q.overlap < (S.profile.overlap_group || 0.5) || q.cosine === null || q.cosine === undefined) return;
      var a = nameOf(q.a), b = nameOf(q.b), key = [a, b].sort().join("|");
      if (a === b || said[key]) return;
      said[key] = true;
      var how = q.cosine > 0.5 ? "pull the same way: together they push harder than their strengths say, keep them lower"
        : q.cosine < -0.3 ? "pull against each other: some of each cancels the other"
        : "pull across each other: together they reach further than either, yet less than their sum";
      out.push(tr("{0} and {1} share their layers ({2}) and " + how + ".").replace("{0}", a).replace("{1}", b).replace("{2}", q.overlap.toFixed(2)));
    });
    return out;
  }

  // HERESY 1457 (Viktor 15.10.2026: «Для музыки аккордная svg, для звука — звуковая волна»): a chord (three heads on one stem, drawn
  // in the line of Lucide's icons) and Lucide's audio-waveform; the label's own tip says which half and what it does
  var CHORD = '<svg class="ui-ico ui-chord" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15.6 2.5v16"/>' +
    '<ellipse class="f" cx="12.7" cy="19" rx="3" ry="2" transform="rotate(-20 12.7 19)"/><ellipse class="f" cx="12.7" cy="12.6" rx="3" ry="2" transform="rotate(-20 12.7 12.6)"/>' +
    '<ellipse class="f" cx="12.7" cy="6.2" rx="3" ry="2" transform="rotate(-20 12.7 6.2)"/></svg>';
  function halfIcon(half) { return half === "ar" ? CHORD : (root.HeresyIcons ? root.HeresyIcons.ui("waveform") : "~"); }
  function halfControl(choice, e, half) {
    var label = half === "ar" ? "Music" : "Sound", on = has(e, half) || !e;
    if (!on) return "";   // HERESY 1016: a file without this half shows no slider for it
    var value = on ? choice[half] : 0, z = zones(e, half);
    var road = "--z1:" + (100 * z.safe / z.max).toFixed(1) + "%;--z2:" + (100 * z.limit / z.max).toFixed(1) + "%";
    return '<label class="lora-half' + (on ? "" : " is-off") + (on && overLimit(e, half, value) ? " is-over" : "") + '" data-tip="' + escape(on
      ? tr(half === "ar" ? "Strength on the music half: the score and the music tokens (0 off, 1 as trained)"
                         : "Strength on the sound half: the acoustic stage that turns music tokens into sound (0 off, 1 as trained)") +
        " · " + tr("green to " + z.safe + ", amber to " + z.limit + ", red beyond")
      : tr("This file has no " + label.toLowerCase() + " half")) + '"><span class="lora-half-ico" role="img" aria-label="' + escape(tr(label)) + '" data-name="' + label + '">' + halfIcon(half) + "</span>" +
      '<input type="range" class="zoned" style="' + road + '" min="0" max="' + z.max + '" step="0.1" value="' + value + '"' + (on && !choice.muted ? "" : " disabled") +   // HERESY 1494: skipped, out of reach
      ' data-lora="' + escape(choice.id) + '" data-half="' + half + '" aria-label="' + escape(tr(nameOf(choice.id) + " " + label + " strength")) + '" />' +
      '<output data-tip="Double-click to type it">' + (on ? fmt(value, 2) : "—") + "</output></label>";
  }

  function sungLyrics() {        // words to sing: a line that is neither a [section] nor a (cue)
    var text = S.opts.lyricsText ? S.opts.lyricsText() : "";
    return String(text).split("\n").some(function (l) { l = l.trim(); return l && !/^\[.*\]$/.test(l) && !/^\(.*\)$/.test(l) && /\p{L}/u.test(l); });
  }
  function hints() {
    var notes = [];
    if (!S.catalog.length) return ["No LoRAs found. Put .safetensors files (or folders, or links to them) in the app's loras/ folder."];
    if (!S.choice.length) return ["None active. Tap a LoRA to add it; each can steer the music half, the sound half, or both."];
    var cot = S.opts.cot ? S.opts.cot() : "";
    S.choice.forEach(function (c) {
      var e = entry(c.id);
      if (!e) { notes.push(fallbackName(c.id) + " is no longer in loras/ and will be left out."); return; }
      var name = nameOf(c.id);
      if (c.muted) { notes.push(name + " is muted: left out of the run (right-click: back in it)."); return; }   // HERESY 1167
      if (c.noscore && has(e, "ar") && c.ar > 0) notes.push(name + " is out of the score: the plan is written without it, then it sings with the others.");   // HERESY 1629
      // HERESY 1167: the run adds the word itself; said only so its effect is not a surprise
      if (triggerOf(e) && !(S.opts.styleText && S.opts.styleText().toLowerCase().indexOf(triggerOf(e).toLowerCase()) >= 0))
        notes.push(name + ": its trigger word “" + triggerOf(e) + "” goes at the style's end when the song is made.");
      if (e.mode === "direct" && cot && cot !== "off") notes.push(name + " was trained in Direct mode.");
      if (e.mode && e.mode !== "direct" && cot === "off") notes.push(name + " was trained with a score (" + e.mode + " mode).");
      if (has(e, "ar") && overLimit(e, "ar", c.ar)) notes.push("\u26a0 " + name + ": " + fmt(c.ar, 2) + " on the music half is past its limit " + zones(e, "ar").limit + ": the score tends to fail after 70-200 tokens.");
      if (has(e, "nar") && overLimit(e, "nar", c.nar)) notes.push("\u26a0 " + name + ": " + fmt(c.nar, 2) + " on the sound half is past its limit " + zones(e, "nar").limit + ".");
      // HERESY 1095 (Viktor, 02.10.2026, by ear; the notes agreed): an instrumental score adapter plans scores
      // without a vocal line: at 1.00 the take had 1 note in 127 vocal bars, spoken over two looping bars
      if (has(e, "ar") && /instrumental/i.test(c.id) && c.ar > 0.5 && cot !== "off" && sungLyrics())
        notes.push("\u26a0 " + name + " plans instrumental scores: at " + fmt(c.ar, 2) + " with words to sing, the score loses its vocal line (measured at 1.00: 1 note in 127 vocal bars, the music looping). Keep it low, 0.3\u20130.5, for a sung song.");
    });
    var seenPair = {}, live = 0;                      // HERESY 1167: a pair is one adapter; a muted one is out of the stack
    S.choice.forEach(function (c) {
      if (seenPair[c.id]) return;
      var pp = pairOf(entry(c.id));
      if (pp) seenPair[pp.id] = true;
      if (!c.muted) live++;
    });
    if (live > 1) notes.push(live + " stacked: their changes add up.");
    if (capable("nar") > 1 && halfTotal("nar") > TOTAL.nar.limit + 1e-9) notes.push("\u26a0 The sound half carries " + fmt(halfTotal("nar"), 2) +
      " together: by ear, 2.0 together brought a heavy bass (05.10.2026). Lower some, or drag Sound, together.");   // HERESY 1167
    if (arStacked() > 1 && arTotal() > totalZone("ar").limit + 1e-9) notes.push(scored()   // HERESY 1623: the plan's ceiling while the model writes the score
      ? "\u26a0 The music half carries " + fmt(arTotal(), 2) + " together, past the shared ceiling " + AR_TOTAL.limit + ": runs this heavy wrote broken scores every time (measured). Lower some, or take one off the music half."
      : S.free ? "\u26a0 The music half carries " + fmt(arTotal(), 2) + " together, past the limits: the score is planned with it eased to the plan's fuse, then sung at these strengths."   // HERESY 1629
      : "\u26a0 The music half carries " + fmt(arTotal(), 2) + " together while the model writes the score: past 1.2 together, 8 plans of 9 broke (measured 20.10.2026). Lower some, or take one off the music half.");
    if (S.budget !== "off" && budgetGroups().length) notes.push(S.budget === "order"   // HERESY 1447
      ? "In order: the top row takes its strength first, the next what the red line leaves; what a wave lets go, the next one takes."
      : "Share: past the red line, the adapters that share their layers give way, each in proportion.");
    pairNotes().forEach(function (n) { notes.push(n); });
    return notes.filter(function (n, i) { return notes.indexOf(n) === i; });   // HERESY 1167: a pair's note once
  }

  // The Engine panel's list: one tile per file in loras/ (name, source, details), the ones in the song form
  // marked. It is for reading: the form's LoRA picker adds and removes them
  function paintList() {
    if (!S.list) return;
    var on = {};
    S.choice.forEach(function (c) { on[c.id] = c; });
    // HERESY 1166 (Viktor: «раздели блок LoRA на два»): with a second list, the files with no web link to a source (trained
    // here) go there, the others (from Hugging Face) stay in the first; a group with none hides
    var local = S.listLocal ? S.catalog.filter(function (e) { return !webUrl((source(e.id) || {}).url); }) : [];
    var hub = S.catalog.filter(function (e) { return local.indexOf(e) < 0; });
    if (S.listLocal) {
      S.listLocal.innerHTML = local.map(tile).join("");
      if (S.listLocal.parentNode) S.listLocal.parentNode.hidden = !local.length;
      if (S.list.parentNode && S.list.parentNode.classList.contains("lora-group")) S.list.parentNode.hidden = !hub.length && local.length > 0;
    }
    S.list.innerHTML = hub.length ? hub.map(tile).join("") : local.length ? "" :
      '<li class="lora-item"><div class="lora-item-meta">No .safetensors files in the app\'s loras/ folder.</div></li>';
    if (S.note) {
      var active = S.choice.filter(function (c) { return entry(c.id); }).length;
      S.note.textContent = tr(S.catalog.length + " in loras/") + " · " + (active ? tr(active + " in the song form") : tr("none in the song form"));
    }
    function tile(e) {
      var parts = String(e.name).split(" / "), main = parts.pop(), folder = parts.join(" / "), title = (source(e.id) || {}).title || main;
      // HERESY 1165: each piece its own text, so its words translate; the folder and the trigger word are names
      var meta = e.error ? escape(tr("cannot load: " + e.error))
        : [[halvesText(e)], [folder, 1], ["rank " + e.rank], [e.size_mb + " MB"], [triggerOf(e) ? triggerOf(e) : "", 2], [e.mode ? e.mode + " mode" : ""]]
          .filter(function (p) { return p[0]; })
          .map(function (p) { return p[1] === 2 ? "<span>trigger</span> <span translate=\"no\">" + escape(p[0]) + "</span>" : "<span" + (p[1] ? ' translate="no"' : "") + ">" + escape(p[0]) + "</span>"; })
          .join(" · ");
      var src = source(e.id) || {}, url = webUrl(src.url);
      var where = url
        ? '<a class="tile-link" href="' + escape(url) + '" target="_blank" rel="noopener noreferrer" data-tip="' +
          escape(tr("Open its model card (new tab): " + url)) + '"><span translate="no">' + escape(src.repo || url) + "</span>\u2197</a>"
        : '<span class="tile-repo" data-tip="' + escape("No source for this file in loras/sources.json; the (i) has its details") + '">' +
          (src.repo ? '<span translate="no">' + escape(src.repo) + "</span>" : "no source link") + "</span>";
      return '<li class="lora-item' + (on[e.id] ? " is-on" : "") + (e.error ? " is-bad" : "") + '" data-lora="' + escape(e.id) + '">' +
        '<div class="lora-item-head"><span class="lora-item-name" translate="no">' + escape(title) + "</span>" +
        (on[e.id] ? '<span class="tile-state">in the song form</span>' : "") + "</div>" +
        '<div class="tile-src">' + where + '<span class="info" tabindex="-1" role="img" aria-label="' + escape(tr("About " + nameOf(e.id))) +
        '" data-tip="' + escape(aboutTip(e)) + '"></span></div>' +
        '<div class="lora-item-meta">' + meta + "</div></li>";
    }
  }

  function toggle(id) {
    var ids = idsOf(id), on = S.choice.some(function (c) { return ids.indexOf(c.id) >= 0; });   // HERESY 1167: a pair as one
    if (on) {
      S.choice = S.choice.filter(function (c) { return ids.indexOf(c.id) < 0; });
    } else {
      ids.forEach(function (x) {
        var e = entry(x);
        if (!e || e.error) return;
        S.choice.push({ id: x, ar: has(e, "ar") ? zones(e, "ar").safe : 0, nar: has(e, "nar") ? zones(e, "nar").safe : 0 });   // HERESY 1623: at its green
      });
    }
    changed();
  }

  function listInto(list, note, local) {
    S.list = list;
    S.note = note || null;
    S.listLocal = local || null;                  // HERESY 1166: the adapters trained here, a list of their own
    paintList();
  }

  function paint() {
    paintList();
    if (!S.host) return;
    S.base = null;                                 // HERESY 1166: a drag of the together-slider ends with a new form
    var on = {};
    S.choice.forEach(function (c) { on[c.id] = true; });
    var active = S.host.querySelector(".lora-active"), chips = S.host.querySelector(".lora-chips");
    var drawn = {};
    active.innerHTML = S.choice.map(function (c) {
      if (drawn[c.id]) return "";
      var e = entry(c.id), p = pairOf(e), pc = p ? S.choice.filter(function (x) { return x.id === p.id; })[0] : null;
      if (pc) drawn[pc.id] = true;
      var ids = pc ? [c.id, pc.id] : [c.id], muted = c.muted && (!pc || pc.muted);
      var arPart = pc && has(p, "ar") ? halfControl(pc, p, "ar") : halfControl(c, e, "ar");
      var narPart = pc && has(p, "nar") ? halfControl(pc, p, "nar") : halfControl(c, e, "nar");
      // HERESY 1018: three columns the same in every row — the name (its trigger word under it,
      // small), the sliders of the halves it has, the remove button — so the rows line up
      var trig = triggerOf(e), inStyle = trig && S.opts.styleText && S.opts.styleText().toLowerCase().indexOf(trig.toLowerCase()) >= 0;
      var key = ids.join("|"), name = nameOf(c.id);   // HERESY 1447: its wave; dragged in order
      return '<div class="lora-row' + (e ? "" : " is-missing") + (muted ? " is-muted" : "") + (S.budget === "order" ? " is-ordered" : "") + '" data-ids="' + escape(key) +
        '"><span class="lora-who"' + (S.budget === "order" ? ' draggable="true"' : "") + '><span class="lora-name" translate="no" data-tip="' + escape(e ? aboutTip(e) + (p ? "\n\n" + aboutTip(p) : "") : tr("Not in loras/ any more")) + '">' +
        escape(nameOf(c.id)) + "</span>" + (muted ? '<span class="lora-muted-tag" data-tip="Right-click: back in the run">muted</span>' : "") +
        (!muted && S.choice.some(function (x) { return ids.indexOf(x.id) >= 0 && x.noscore && has(entry(x.id), "ar"); })   // HERESY 1629
          ? '<span class="lora-muted-tag lora-noscore-tag" data-tip="Out of the score: its music half sings the score, the plan is written without it. Right-click: back in the score">sung only</span>' : "") +
        // HERESY 1167 (Viktor: «суффиксом приклинивай все триггеры… кнопка не нужна»): the run puts the word at the style's end
        (trig ? (inStyle ? '<span class="lora-trigger is-in" data-tip="Its trigger word is in the style">\u2713 ' + escape(trig) + "</span>"
                         : '<span class="lora-trigger is-auto" data-tip="Its trigger word goes at the style\u2019s end by itself when the song is made">' + escape(trig) + "</span>") : "") +
        (e && /^(voice|vocal)$/.test(kindOf(e)) ? vshiftButtons() : "") +   // HERESY 1703
        '</span><span class="lora-halves">' + arPart + narPart + "</span>" + (e ? waveButton(key, c, name) : "") +
        '<button type="button" class="icon-btn" data-remove-lora="' + escape(ids.join("|")) + '" aria-label="' + escape(tr("Remove " + nameOf(c.id))) + '">✕</button></div>' +
        (e && waveOpen[key] && !muted ? waveEditor(key, c, name) : "");   // HERESY 1494: a skipped one's wave stays shut
    }).join("") + totalBar() + budgetBar();
    // one even grid of buttons: the name, which half it steers, and a few words on what it does
    var nHidden = 0;                                 // HERESY 1496
    chips.innerHTML = S.catalog.map(function (e) {
      var p = pairOf(e);
      if (p && has(e, "nar")) return "";                // HERESY 1167: a pair drawn once, from its music file
      var isOn = on[e.id] || (p && on[p.id]), hid = isHidden(e.id);
      if (hid) nHidden++;
      if (hid && !S.showHidden) return "";            // HERESY 1496
      var tag = e.error ? "cannot load" : p ? (tagOf(e) || "music + sound halves") : tagOf(e) || halvesText(e) + (has(e, "ar") && has(e, "nar") ? " halves" : " half");
      return '<button type="button" class="lora-pick' + (isOn ? " is-on" : "") + (hid ? " is-hidden-lora" : "") + '" data-lora-chip="' + escape(e.id) + '"' +
        ' data-kind="' + kindOf(e) + '" style="' + kindStyle(e) + '" data-find="' + escape(findText(e, p)) + '"' +   // HERESY 1636
        (e.error ? " disabled" : "") + ' aria-pressed="' + (isOn ? "true" : "false") + '" data-tip="' + escape(aboutTip(e) + (p ? "\n\n" + aboutTip(p) : "")) + '">' +
        '<span class="lora-pick-name" translate="no">' + escape(nameOf(e.id)) + (twinOf(e) ? ' <span class="lora-pick-twin mono">' + escape(twinOf(e)) + "</span>" : "") + "</span>" +   // HERESY 1650
        (e.error ? "" : '<span class="lora-pick-half">' + (p ? "both" : halfShort(e)) + "</span>") +
        '<span class="lora-pick-tag">' + escape(tag) + "</span></button>";
    }).join("");
    filterChips();                                   // HERESY 1636: the search and the kind as they stand
    paintNotes();
    S.host.querySelector(".lora-lib-count").textContent = S.catalog.length ? String(S.catalog.length) : "";   // HERESY 1167
    if (S.showBox) {                                 // HERESY 1496: Show hidden, while some are
      S.showBox.hidden = !nHidden;
      S.showBox.querySelector(".lora-hidden-n").textContent = String(nHidden);
      S.showBox.querySelector("input").checked = !!S.showHidden;
    }
    wantProfile();                                   // HERESY 1447
    paintBudgetTips();
    layoutWaves();                                   // HERESY 1458: the graphs at their size, and what the budget lets run
    paintHeld();
  }

  function loraOver(on) {                          // HERESY 1458: the picker over the page and back
    var host = S.host;
    if (!host) return;
    if (on && !S.over) {
      var back = root.document.createElement("div");
      back.className = "lora-over";
      back.innerHTML = '<div class="lora-over-box" role="dialog" aria-label="LoRAs"><div class="lora-over-head"><b>LoRAs</b><span class="spacer"></span>' +
        '<button type="button" class="btn ghost small icon-btn lora-over-back" aria-label="Back into the form" data-tip="Back into the form (Esc)">' +
        (root.HeresyIcons ? root.HeresyIcons.ui("minimize") : "\u2921") + '</button></div><div class="lora-over-body"></div></div>';
      root.document.body.appendChild(back);
      S.over = { back: back, parent: host.parentNode, next: host.nextSibling };
      back.querySelector(".lora-over-body").appendChild(host);
      back.addEventListener("click", function (e) { if (e.target === back) loraOver(false); });
      back.querySelector(".lora-over-back").addEventListener("click", function () { loraOver(false); });
      root.document.body.classList.add("lora-over-on");
    } else if (!on && S.over) {
      var o = S.over;
      S.over = null;
      o.parent.insertBefore(host, o.next);
      o.back.remove();
      root.document.body.classList.remove("lora-over-on");
    }
    var b = S.set && S.set.querySelector(".lora-big");
    if (b) b.setAttribute("aria-pressed", S.over ? "true" : "false");
    layoutWaves();
  }

  function changed() {
    paint();
    if (S.opts.onChange) S.opts.onChange();
  }

  // HERESY 1496 (Viktor 16.10.2026: «те адаптеры, которые сторонние, либо в попапе согласие на безвозвратное удаление из loras/, либо просто
  // прятать из вида, а в хедере LORAS справа галочку добавить Show hidden»): adapters hidden from the list, kept with the page's settings
  // (yue2.lorasHidden); Show hidden in the LoRAs head brings them into sight again, marked
  function loadHidden() {
    try { var v = JSON.parse(root.localStorage.getItem("yue2.lorasHidden") || "[]"); S.hidden = Array.isArray(v) ? v.map(String) : []; } catch (e) { S.hidden = S.hidden || []; }
  }
  function isHidden(id) { return (S.hidden || []).indexOf(id) >= 0; }
  function setHidden(ids, on) {
    S.hidden = (S.hidden || []).filter(function (x) { return ids.indexOf(x) < 0; }).concat(on ? ids : []);
    try { if (S.hidden.length) root.localStorage.setItem("yue2.lorasHidden", JSON.stringify(S.hidden)); else root.localStorage.removeItem("yue2.lorasHidden"); } catch (e) { /* kept in this view only */ }
    paint();
  }

  // HERESY 1496 (Viktor 16.10.2026: «В активных остаётся удалённый адаптер. Нужно допилить сторожа, чтобы поднимал диалоговое окно, извещал об
  // отсутствии ранее выбранного адаптера, делал поиск по соответствию имён и предлагал заменить зомби на другой, с другой эпохой, суффиксом, либо
  // удаление из списка активных»): an adapter of the song gone from loras/ is asked about once the list has come: one by a name like its own
  // in its place (the same run, another epoch or suffix; its strengths, wave and mute kept), or out of the song; «Later» leaves it, marked,
  // and Generate asks again rather than send it
  function missingIds() { return S.catalog.length ? S.choice.filter(function (c) { return !entry(c.id); }).map(function (c) { return c.id; }) : []; }
  function nameTokens(id) {
    var parts = String(id).replace(/\.safetensors$/i, "").toLowerCase().split("/"), stem = parts[parts.length - 1];
    if (/^(lora|adapter_model|pytorch_lora_weights|model|adapter)$/.test(stem) && parts.length > 1) stem = parts[parts.length - 2];
    return stem.split(/[-_.\s]+/).filter(function (t) {
      return t && !/^(e|ep|epoch|step)\d+$/.test(t) && !/^[rv]\d+$/.test(t) && !/^(final|full)$/.test(t) && !/^\d{3,}$/.test(t);
    });
  }
  function lookalikes(id, c) {
    var mine = nameTokens(id), folder = String(id).split("/")[0].toLowerCase(), taken = {};
    S.choice.forEach(function (x) { taken[x.id] = true; });
    return S.catalog.filter(function (e) {
      return !e.error && !taken[e.id] && (!(c.ar > 0) || has(e, "ar")) && (!(c.nar > 0) || has(e, "nar"));
    }).map(function (e) {
      var t = nameTokens(e.id), score = 0, n = 0;
      if (e.id.split("/")[0].toLowerCase() === folder) score = 3;
      else if (mine.length && t.join("-") === mine.join("-")) score = 2;
      else { while (n < t.length && n < mine.length && t[n] === mine[n]) n++; if (n >= 2) score = 1; }
      return { e: e, score: score };
    }).filter(function (x) { return x.score > 0; })
      .sort(function (a, b) { return b.score - a.score || (a.e.id < b.e.id ? 1 : a.e.id > b.e.id ? -1 : 0); })
      .map(function (x) { return x.e; });
  }
  var asking = false, askedZ = {};
  function askMissing(which) {                     // which: nothing (the ones not asked yet), true (all of them), or a list of ids
    if (asking || !root.HeresyDialog || !root.HeresyDialog.choose) return false;
    var ids = missingIds().filter(function (id) { return which === true || (Array.isArray(which) ? which.indexOf(id) >= 0 : !askedZ[id]); });
    if (!ids.length) return false;
    asking = true;
    (function next() {
      var id = ids.shift(), c = id && S.choice.filter(function (x) { return x.id === id; })[0];
      if (!id) { asking = false; return; }
      askedZ[id] = true;
      if (!c) return next();
      var cands = lookalikes(id, c);
      root.HeresyDialog.choose(tr(fallbackName(id) + " is not in loras/ any more") + "\n\n" +
        tr(cands.length ? "It is still among the song's adapters. Take one of these in its place (a name like its own: the same run, another epoch or suffix; its strengths kept), or take it out of the song."
                        : "It is still among the song's adapters, and nothing in loras/ goes by a name like it. Take it out of the song, or leave it for now: the song is not made while it is there."),
        cands.map(function (e) { return { value: e.id, label: nameOf(e.id), note: e.id }; }),
        { cancel: tr("Later"), more: [{ label: tr("Take it out of the song"), value: "__out__" }] }).then(function (v) {
        if (v === "__out__") { S.choice = S.choice.filter(function (x) { return x.id !== id; }); changed(); }
        else if (v) { S.choice.forEach(function (x) { if (x.id === id) x.id = String(v); }); changed(); }
        next();
      }, function () { asking = false; });
    })();
    return true;
  }

  // HERESY 1169 (Viktor 08.10.2026: «после свёрнутого блока LoRA выскочил обрезанный параграф объяснений. Он нахер там не нужен»):
  // the picker's notes in a tip beside the LoRAs' name, ⚠ when one warns; the paragraph under the list keeps them, hidden
  function paintNotes() {
    var list = hints().map(tr), p = S.host.querySelector(".lora-hint"), set = S.set || S.host.closest("fieldset"), n = set && set.querySelector(".lora-notes");   // 1458: over the page too
    if (p) p.textContent = list.join(" ");
    if (!n) return;
    var warn = list.some(function (x) { return x.charAt(0) === "\u26a0"; });
    n.hidden = !list.length;
    n.textContent = "";   // HERESY 1169 · 1247: drawn by the stylesheet (.lora-notes, .is-warn), not the emoji or a letter
    n.setAttribute("aria-label", warn ? "A warning on the LoRAs" : "Notes on the LoRAs");
    n.classList.toggle("is-warn", warn);
    n.dataset.tip = list.join("\n");
  }
  function mount(host, opts) {
    S.host = host;
    // HERESY 1457 (Viktor: «колонку с названием адаптера можно ужать вдвое, обрезать троеточием… при наведении мышью распахивать в
    // полную длину, не смещая дизайн, — как ты сделал с обрезкой имён в волкспейсах»): as the Librarian's workspaces (1105)
    var fullName = null;
    function dropFull() { if (fullName) { fullName.remove(); fullName = null; } }
    host.addEventListener("mouseover", function (e) {
      var n = e.target.closest && e.target.closest(".lora-row .lora-name");
      if (fullName && fullName.owner === n && root.document.body.contains(n)) return;
      dropFull();
      if (!n || n.scrollWidth <= n.clientWidth + 1) return;
      var r = n.getBoundingClientRect(), cs = root.getComputedStyle(n);
      fullName = root.document.createElement("div");
      fullName.className = "coll-fullname lora-fullname";
      fullName.owner = n;
      fullName.textContent = n.textContent;
      fullName.style.cssText = "left:" + (r.left - 6) + "px;top:" + (r.top - 3) + "px;font-size:" + cs.fontSize;
      root.document.body.appendChild(fullName);
    });
    host.addEventListener("mouseout", function (e) {
      var n = e.target.closest && e.target.closest(".lora-name");
      if (n && !(e.relatedTarget && n.contains(e.relatedTarget))) dropFull();
    });
    host.addEventListener("mouseleave", dropFull);
    root.addEventListener("scroll", dropFull, true);
    S.opts = opts || {};
    loadNotes();                                      // HERESY 1802
    // HERESY 1167: the adapters not in use behind one line, open or closed as it was left; the ones in use stay above it
    host.innerHTML = '<div class="lora-active"></div><details class="lora-lib"><summary><span class="chev" aria-hidden="true"></span>' +
      '<span class="lora-lib-name">Add a LoRA</span><span class="lora-lib-count mono"></span></summary>' +
      // HERESY 1636: a search and the kinds above the list, the list in a box of its own height
      '<div class="lora-find"><input type="search" class="lora-search" placeholder="Find: a name, a kind, a word of its note" aria-label="Find an adapter" />' +
      '<span class="lora-kinds">' + KINDS.map(function (k) {
        return '<button type="button" class="lora-kind" data-kind-pick="' + k[0] + '" style="--lk:' + k[1] + '" aria-pressed="false">' + k[0] + "</button>";
      }).join("") + '</span><span class="lora-find-n mono"></span></div>' +
      '<div class="lora-chips"></div></details><p class="row-hint lora-hint"></p>';
    try { S.find = root.sessionStorage.getItem("yue2.loraFind") || ""; S.kindPick = root.sessionStorage.getItem("yue2.loraKind") || ""; } catch (e) { S.find = ""; S.kindPick = ""; }
    host.querySelector(".lora-search").value = S.find;
    host.querySelector(".lora-search").addEventListener("input", function () {
      S.find = this.value;
      try { root.sessionStorage.setItem("yue2.loraFind", S.find); } catch (e) { /* this view only */ }
      filterChips();
    });
    host.querySelector(".lora-kinds").addEventListener("click", function (e) {
      var k = e.target.closest("[data-kind-pick]");
      if (!k) return;
      S.kindPick = S.kindPick === k.dataset.kindPick ? "" : k.dataset.kindPick;   // the lit one again: all kinds
      try { root.sessionStorage.setItem("yue2.loraKind", S.kindPick); } catch (err) { /* this view only */ }
      filterChips();
    });
    S.set = host.closest("fieldset");                 // HERESY 1458: its form's place, while it stands over the page
    loadHidden();                                    // HERESY 1496
    var head = host.closest("fieldset") && host.closest("fieldset").querySelector(".label");
    if (head && !head.querySelector(".lora-show-hidden")) {
      var sh = root.document.createElement("label");
      sh.className = "lora-show-hidden";
      sh.hidden = true;
      sh.setAttribute("data-tip", "The adapters hidden from the list (a right-click on one hides it), back in sight, marked");
      sh.innerHTML = '<input type="checkbox" /> <span>Show hidden</span> <span class="lora-hidden-n mono"></span>';
      sh.addEventListener("click", function (e) { e.stopPropagation(); });   // not the LoRAs' fold
      sh.querySelector("input").addEventListener("change", function () { S.showHidden = this.checked; paint(); });
      head.appendChild(sh);
      S.showBox = sh;
    }
    var lab = host.closest("fieldset") && host.closest("fieldset").querySelector(".label");   // HERESY 1169: the notes' place
    if (lab && !lab.querySelector(".lora-notes")) {
      var nb = root.document.createElement("span");
      nb.className = "lora-notes";
      nb.tabIndex = -1;
      nb.setAttribute("role", "img");
      nb.setAttribute("aria-label", "Notes on the LoRAs");
      nb.hidden = true;
      lab.appendChild(nb);
    }
    // HERESY 1458 (Viktor 15.10.2026: «Редактирование параметров с волной адаптеров можно так же в full screen по кнопке — как у
    // меня с редактором лирики. На 1800px, чтобы чётко можно было бы двигать точки волны, а не на ощупь во второй колонке
    // Композитора»): the picker over the page, up to 1800 px wide, as the lyrics go over it (1169); ⤡, Esc or a click beside it
    // puts it back where it stood, and so does another room
    if (lab && !lab.querySelector(".lora-big")) {
      var big = root.document.createElement("button");
      big.type = "button";
      big.className = "btn ghost small icon-btn lora-big";
      big.setAttribute("aria-label", "Full screen");
      big.setAttribute("aria-pressed", "false");
      big.dataset.tip = "The LoRAs over the page, up to 1800 px wide, for the waves' points: Esc or a click beside them puts them back";
      big.innerHTML = root.HeresyIcons ? root.HeresyIcons.ui("maximize") : "\u2922";
      big.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); loraOver(!S.over); });
      big.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") e.stopPropagation(); });   // not the label's fold
      lab.appendChild(big);
    }
    root.document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape" || !S.over) return;
      if (root.document.querySelector(".hd-back.is-on")) return;   // a question over it answers first
      e.preventDefault();
      e.stopImmediatePropagation();                  // not the frame's Esc as well
      loraOver(false);
    }, true);
    if (root.MutationObserver) new root.MutationObserver(function () { if (S.over && root.document.body.dataset.tab !== "create") loraOver(false); })
      .observe(root.document.body, { attributes: true, attributeFilter: ["data-tab"] });
    if (root.ResizeObserver) {                       // HERESY 1458: the graphs drawn again when the picker's width changes
      var lastW = 0;
      new root.ResizeObserver(function () { var w = host.clientWidth; if (w && Math.abs(w - lastW) > 1) { lastW = w; layoutWaves(); } }).observe(host);
    }
    // HERESY 1458: the song's expected length, kept in this browser (and so in the studio's settings), one for every wave
    host.addEventListener("change", function (event) {
      var inp = event.target.closest && event.target.closest(".lora-wave-len-in");
      if (!inp) return;
      var len = parseClock(inp.value);
      try { if (len > 0) root.localStorage.setItem("yue2.loraSongLen", String(len)); else root.localStorage.removeItem("yue2.loraSongLen"); } catch (e) { /* no storage */ }
      Array.prototype.forEach.call(host.querySelectorAll(".lora-wave-len-in"), function (x) { x.value = len > 0 ? clockOf(len) : ""; });
      layoutWaves();
    });
    host.addEventListener("keydown", function (event) {
      if (event.key === "Enter" && event.target.closest && event.target.closest(".lora-wave-len-in, .lora-wave-out-in")) { event.preventDefault(); event.target.blur(); }
      if ((event.key === "Enter" || event.key === " ") && event.target.classList && event.target.classList.contains("lora-wave-lock")) { event.preventDefault(); event.target.click(); }
    });
    // HERESY 1468: Output's length from here: the lock opens the field; a length typed in goes to Max length (its field, its guard,
    // the mode's top), and every wave and every Output field follow it
    host.addEventListener("click", function (event) {
      var lock = event.target.closest && event.target.closest(".lora-wave-lock");
      if (!lock) return;
      event.preventDefault();
      var wrap = lock.closest(".lora-wave-out"), inp = wrap.querySelector(".lora-wave-out-in"), open = wrap.classList.toggle("is-locked") === false;
      inp.readOnly = !open;
      lock.dataset.tip = tr(open ? "Open: click to lock it again" : "Locked against a stray edit: click to change it");
      if (open) { inp.focus(); inp.select(); }
    });
    host.addEventListener("change", function (event) {
      var inp = event.target.closest && event.target.closest(".lora-wave-out-in"), max = root.document.querySelector('.knob-secs[data-secs-for="max_tokens"]');
      if (!inp || inp.readOnly || !max) return;
      max.value = inp.value;                          // as if typed into Max length: 9 is 9:00, m:ss as written
      max.dispatchEvent(new Event("change", { bubbles: true }));
      inp.value = clockOf(songAxis());
      layoutWaves();
    });
    // HERESY 1459 (Viktor 15.10.2026: «правой кнопкой мыши снятие точки с кривой»): a right-click on a point takes it out, as a
    // double-click does; the first and the last stay
    host.addEventListener("contextmenu", function (event) {
      var pt = event.target.closest && event.target.closest(".curve-pt"), svg = pt && pt.ownerSVGElement, key = svg && svg.dataset.waveGraph, c = key && rowChoices(key)[0];
      if (!c || !c.curve) return;
      event.preventDefault();
      event.stopPropagation();
      var i = +pt.dataset.pt, pts = c.curve.map(function (q) { return q.slice(); });
      if (i <= 0 || i >= pts.length - 1) return;
      pts.splice(i, 1);
      setWave(key, pts, "draw");
      changed();
    });
    host.addEventListener("pointerout", function (event) {
      var g = event.target.closest && event.target.closest("svg[data-wave-graph]"), ed = g && g.closest("[data-wave-edit]");
      if (ed && !waveDrag && !(event.relatedTarget && g.contains(event.relatedTarget))) ed.querySelector(".lora-wave-at").textContent = "";
    });
    var lib = host.querySelector(".lora-lib");
    try { lib.open = root.localStorage.getItem("yue2.loraLib") === "open"; } catch (e) { /* no storage: closed */ }
    try { S.budget = ["share", "order"].indexOf(root.localStorage.getItem("yue2.loraBudget")) >= 0 ? root.localStorage.getItem("yue2.loraBudget") : "off"; } catch (e) { /* off */ }
    lib.addEventListener("toggle", function () {
      try { root.localStorage.setItem("yue2.loraLib", lib.open ? "open" : "closed"); } catch (e) { /* no storage */ }
    });
    // HERESY 1447: the wave's picture opens its editor; Flat, Arch and Draw; its points dragged, added and taken out (as the
    // sliders' are); the budget's three; the rows dragged in order
    host.addEventListener("click", function (event) {
      var wt = event.target.closest("[data-wave-toggle]"), wm = event.target.closest("[data-wave-mode]"), bm = event.target.closest("[data-budget]");
      var fb = event.target.closest("[data-lora-free]");
      if (fb) return void setFree(fb.checked);       // HERESY 1629
      if (wt) { waveOpen[wt.dataset.waveToggle] = !waveOpen[wt.dataset.waveToggle]; paint(); return; }
      if (bm) {
        S.budget = bm.dataset.budget === S.budget ? "off" : bm.dataset.budget;   // HERESY 1457: the lit one again: no budget
        try { root.localStorage.setItem("yue2.loraBudget", S.budget); } catch (e) { /* no storage */ }
        return changed();
      }
      var sc = event.target.closest("[data-sec]");   // HERESY 1665: a section ticked or not
      if (sc) {
        var sk = sc.closest("[data-wave-edit]").dataset.waveEdit, si = +sc.dataset.sec;
        rowChoices(sk).forEach(function (r) {
          var on = r.sections || allSections();
          r.sections = on.indexOf(si) >= 0 ? on.filter(function (x) { return x !== si; }) : on.concat([si]).sort(function (a, b) { return a - b; });
        });
        sectionWave(sk);
        return changed();
      }
      if (!wm) return;
      var key = wm.closest("[data-wave-edit]").dataset.waveEdit, c = rowChoices(key)[0];
      if (!c) return;
      if (wm.dataset.waveMode === "flat") setWave(key, null);
      else if (wm.dataset.waveMode === "arch") setWave(key, WAVE_ARCH, "arch");
      else if (wm.dataset.waveMode === "sections") {   // HERESY 1665: every section at first
        rowChoices(key).forEach(function (r) { if (!r.sections) r.sections = allSections(); });
        sectionWave(key);
      }
      else setWave(key, c.curve || [[0, 1], [0.5, 1], [1, 1]], "draw");
      changed();
    });
    host.addEventListener("pointerdown", function (event) {
      var pt = event.target.closest(".curve-pt"), svg = pt && pt.ownerSVGElement, key = svg && svg.dataset.waveGraph, c = key && rowChoices(key)[0];
      if (!c || !c.curve) return;
      waveDrag = { svg: svg, key: key, c: c, i: +pt.dataset.pt };
      try { pt.setPointerCapture(event.pointerId); } catch (e) { /* the move still comes through the host */ }
      event.preventDefault();
    });
    host.addEventListener("pointermove", function (event) {
      if (!waveDrag) {                               // HERESY 1458: where the pointer stands on a graph
        var over = event.target.closest && event.target.closest("svg[data-wave-graph]"), ed = over && over.closest("[data-wave-edit]");
        if (ed) ed.querySelector(".lora-wave-at").textContent = waveAtText(waveSnap(wavePointer(over, event), event.shiftKey));
        return;
      }
      var pts = waveDrag.c.curve, i = waveDrag.i, last = pts.length - 1, at = waveSnap(wavePointer(waveDrag.svg, event), event.shiftKey);   // 1458: Shift onto the grid
      var t = i === 0 ? 0 : i === last ? 1 : Math.min(pts[i + 1][0] - 0.02, Math.max(pts[i - 1][0] + 0.02, at.t));
      pts[i] = [r3(t), r3(Math.min(1, Math.max(0, at.k)))];
      waveDrag.c.curveMode = "draw";
      waveRedraw(waveDrag.svg, waveDrag.c);
      var de = waveDrag.svg.closest("[data-wave-edit]");
      if (de) de.querySelector(".lora-wave-at").textContent = waveAtText({ t: pts[i][0], k: pts[i][1] });
    });
    ["pointerup", "pointercancel"].forEach(function (type) {
      host.addEventListener(type, function () {
        if (!waveDrag) return;
        var d = waveDrag;
        waveDrag = null;
        setWave(d.key, d.c.curve, "draw");
        changed();
      });
    });
    host.addEventListener("dblclick", function (event) {
      var svg = event.target.closest("[data-wave-graph]"), key = svg && svg.dataset.waveGraph, c = key && rowChoices(key)[0];
      if (!c) return;
      var pts = (c.curve || [[0, 1], [1, 1]]).map(function (q) { return q.slice(); }), pt = event.target.closest(".curve-pt");
      if (pt) {
        var i = +pt.dataset.pt;
        if (i > 0 && i < pts.length - 1) pts.splice(i, 1);
      } else if (pts.length < 64) {
        var at = waveSnap(wavePointer(svg, event), event.shiftKey);   // HERESY 1458: Shift onto the grid
        pts.push([r3(Math.min(0.99, Math.max(0.01, at.t))), r3(Math.min(1, Math.max(0, at.k)))]);
        pts.sort(function (a, b) { return a[0] - b[0]; });
      }
      setWave(key, pts, "draw");
      event.stopPropagation();
      changed();
    });
    // HERESY 1494 (Viktor 16.10.2026: «при перетаскивании добавь эффект раздвижения между блоками адаптеров — как воронку для
    // передвигаемого»): while a row is dragged the rows part where it would land, a gap of its height opening and closing smoothly,
    // the row itself waiting faded in its place; where it stands already no gap opens; the drop goes into the gap
    var dragRow = null, dragEl = null, gapAt = "same";
    function dragRows() { return [].slice.call(host.querySelectorAll(".lora-active > .lora-row[data-ids]")); }
    function slotAt(y) {                            // the row it would land before; null: after the last
      var rows = dragRows().filter(function (r) { return r !== dragEl; });
      for (var i = 0; i < rows.length; i++) { var b = rows[i].getBoundingClientRect(); if (y < b.top + b.height / 2) return rows[i]; }
      return null;
    }
    function setGap(before) {
      var rows = dragRows(), own = rows[rows.indexOf(dragEl) + 1] || null, at = before === own ? "same" : before;
      if (at === gapAt) return;
      gapAt = at;
      rows.forEach(function (r) { r.classList.remove("gap-before", "gap-after"); });
      var last = rows.filter(function (r) { return r !== dragEl; }).pop();
      if (at === null && last) last.classList.add("gap-after");
      else if (at && at !== "same") at.classList.add("gap-before");
    }
    function endDrag() {
      dragRows().forEach(function (r) { r.classList.remove("gap-before", "gap-after", "is-dragging"); });
      dragRow = null; dragEl = null; gapAt = "same";
    }
    host.addEventListener("dragstart", function (event) {
      // HERESY 1453: only the name and its tag start a drag (the whole row did, and in order its strengths would not move)
      var who = event.target.closest && event.target.closest(".lora-row.is-ordered > .lora-who"), row = who && who.parentNode;
      if (!row) return;
      dragRow = row.dataset.ids; dragEl = row; gapAt = "same";
      var list = row.parentNode;
      list.style.setProperty("--lora-gap", (row.offsetHeight + 6) + "px");
      try { event.dataTransfer.setData("text/plain", dragRow); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setDragImage(row, 24, 18); } catch (e) { /* the row still moves */ }
      setTimeout(function () { if (dragEl === row) row.classList.add("is-dragging"); }, 0);   // after the drag's picture is taken whole
    });
    host.addEventListener("dragover", function (event) {
      if (!dragRow || !event.target.closest(".lora-active")) return;
      event.preventDefault();
      setGap(slotAt(event.clientY));
    });
    host.addEventListener("dragleave", function (event) {
      if (dragRow && !(event.relatedTarget && host.contains(event.relatedTarget))) setGap(dragRows()[dragRows().indexOf(dragEl) + 1] || null);
    });
    host.addEventListener("dragend", endDrag);
    host.addEventListener("drop", function (event) {
      if (!dragRow) return;
      event.preventDefault();
      if (gapAt === "same") setGap(slotAt(event.clientY));
      var at = gapAt, moved = dragRow.split("|");
      endDrag();
      if (at === "same") return;
      var mine = S.choice.filter(function (c) { return moved.indexOf(c.id) >= 0; });
      var rest = S.choice.filter(function (c) { return moved.indexOf(c.id) < 0; }), first = at ? at.dataset.ids.split("|") : [], i = rest.length;
      rest.forEach(function (c, k) { if (i === rest.length && first.indexOf(c.id) >= 0) i = k; });
      S.choice = rest.slice(0, i).concat(mine, rest.slice(i));
      changed();
    });
    host.addEventListener("click", function (event) {
      var chip = event.target.closest("[data-lora-chip]"), remove = event.target.closest("[data-remove-lora]");
      var trigger = event.target.closest("[data-trigger]"), zombie = event.target.closest(".lora-row.is-missing > .lora-who");
      if (zombie && !remove) {                        // HERESY 1496: the question again for the row gone from loras/
        askMissing(zombie.parentNode.dataset.ids.split("|"));
      } else if (chip && !chip.disabled) {
        toggle(chip.dataset.loraChip);
      } else if (remove) {
        var gone = remove.dataset.removeLora.split("|");   // HERESY 1167: a pair's ✕ takes both
        S.choice = S.choice.filter(function (c) { return gone.indexOf(c.id) < 0; });
        changed();
      } else if (trigger && S.opts.addToStyle) {
        S.opts.addToStyle(trigger.dataset.trigger);
      }
    });
    // HERESY 1167 (Viktor: «по правому клику мыши Mute/Пропустить и наоборот Unmute/Вернуть в строй»; «Если у нас адаптер из
    // локального тренинга… Убрать из списка (адаптер в своей сессии Тренера)»): the studio's own right-click menus
    host.addEventListener("contextmenu", function (event) {
      var row = event.target.closest(".lora-row[data-ids]"), chip = event.target.closest("[data-lora-chip]");
      if (!root.HeresyMenu || (!row && !chip) || event.target.closest("input")) return;
      event.preventDefault();
      if (row) {
        var ids = row.dataset.ids.split("|"), mine = S.choice.filter(function (c) { return ids.indexOf(c.id) >= 0; });
        var isMuted = mine.length > 0 && mine.every(function (c) { return c.muted; });
        // HERESY 1629 (Viktor: «можно секинить адаптеры, которые вообще не должны участвовать в написании ABC, хотя у них есть AR, - но это идёт в синтез»)
        var arOnes = mine.filter(function (c) { return has(entry(c.id), "ar"); }), outOf = arOnes.length > 0 && arOnes.every(function (c) { return c.noscore; });
        root.HeresyMenu.open(event.clientX, event.clientY, [
          { label: isMuted ? "Unmute: back in the run" : "Mute: left out of the run, its strengths kept", icon: isMuted ? "\u25b6" : "\u23f8",
            action: function () { mine.forEach(function (c) { if (isMuted) delete c.muted; else c.muted = true; }); changed(); } }
        ].concat(arOnes.length && !isMuted ? [{ label: outOf ? "Back in the score: its music half writes the score too" : "Out of the score: its music half sings it, the plan is written without it",
          icon: "\u266a", action: function () { mine.forEach(function (c) { if (outOf) delete c.noscore; else c.noscore = true; }); changed(); } }] : []).concat([
          { label: "Your note…", icon: "✎", hint: userNote(entry(mine[0] && mine[0].id)) ? "✓" : "",   // HERESY 1802
            action: function () { editNote(entry(mine[0] && mine[0].id)); } },
          { sep: true },
          { label: "Remove from the song", icon: "\u2715", action: function () { S.choice = S.choice.filter(function (c) { return ids.indexOf(c.id) < 0; }); changed(); } }
        ]));
        return;
      }
      var e = entry(chip.dataset.loraChip);
      if (!e) return;
      var inSong = S.choice.some(function (c) { return idsOf(e.id).indexOf(c.id) >= 0; });
      var items = [{ label: inSong ? "Take it out of the song" : "Add it to the song", action: function () { toggle(e.id); } }], hid = isHidden(e.id);
      items.push({ sep: true }, { label: hid ? "Show it in the list again" : "Hide from the list (Show hidden brings it back)", icon: hid ? "\u25c9" : "\u25cc",   // HERESY 1496
        action: function () { setHidden(idsOf(e.id), !hid); } });
      items.push({ label: "Your note…", hint: userNote(e) ? "✓" : "", icon: "✎", action: function () { editNote(e); } });   // HERESY 1802
      if (ownAdapter(e) && S.opts.unpublish) items.push({ label: "Remove from the list (the adapter stays in its Trainer session)", icon: "\u21a9",
        action: function () { S.opts.unpublish(idsOf(e.id)); } });
      if (S.opts.deleteFiles) items.push({ label: "Delete from loras/ for good\u2026", icon: "\u2715", danger: true,   // HERESY 1496: asked, with what goes
        action: function () { S.opts.deleteFiles(idsOf(e.id), nameOf(e.id)); } });
      root.HeresyMenu.open(event.clientX, event.clientY, items);
    });
    // HERESY 1081: a double-click on a strength opens a field for it; Enter or leaving it sets, Esc leaves it be
    host.addEventListener("dblclick", function (event) {
      var out = event.target.closest(".lora-half output");
      if (!out || out.closest(".lora-row.is-muted")) return;   // HERESY 1494
      var range = out.previousElementSibling, max = parseFloat(range.max), field = document.createElement("input");
      field.type = "number"; field.className = "lora-exact"; field.min = "0"; field.max = String(max); field.step = "0.05";   // HERESY 1623
      var held = S.choice.filter(function (c) { return c.id === range.dataset.lora; })[0];
      field.value = fmt(held ? held[range.dataset.half] : parseFloat(range.value), 2);
      out.replaceWith(field); field.focus(); field.select();
      var done = false;
      function finish(keep) {
        if (done) return; done = true;
        var v = parseFloat(field.value);
        if (keep && isFinite(v)) {
          v = Math.round(Math.max(0, Math.min(max, v)) * 100) / 100;   // HERESY 1623: hundredths at most
          S.choice.forEach(function (c) { if (c.id === range.dataset.lora) c[range.dataset.half] = v; });
        }
        changed();
      }
      field.addEventListener("keydown", function (e) { if (e.key === "Enter") finish(true); if (e.key === "Escape") finish(false); });
      field.addEventListener("blur", function () { finish(true); });
    });
    // HERESY 1169 · 1242 (Viktor 08.10.2026: «При наведении мыши на ползунок и при перетаскивании сделай тултип поверх курсора, 16pt»): the strength over the pointer, exact (0.875, not the output's 0.88), framed in its zone's colour, while the pointer is on a slider or drags it; the label's own tip stands aside meanwhile
    var vt = null, vtOn = null, vtXY = [0, 0];
    function vtip(range) {
      if (!vt) { vt = document.createElement("div"); vt.className = "lora-vtip"; vt.setAttribute("aria-hidden", "true"); document.body.appendChild(vt); }
      var v = +range.value, max = +range.max || 1, z1 = parseFloat(range.style.getPropertyValue("--z1")) / 100 * max, z2 = parseFloat(range.style.getPropertyValue("--z2")) / 100 * max;
      var label = range.closest(".lora-half, .lora-total"), sp = label && label.querySelector("span"), name = sp ? (sp.dataset.name ? tr(sp.dataset.name) : sp.textContent) : "";   // 1457: an icon's name
      vt.textContent = (name ? name + " " : "") + v.toFixed(3).replace(/0+$/, "").replace(/\.$/, ".0") + (range.dataset.held ? " \u2192 " + range.dataset.held : "");   // 1458: what runs
      vt.className = "lora-vtip " + (v > z2 + 1e-9 ? "is-red" : v > z1 + 1e-9 ? "is-amber" : "is-green");
      vt.style.left = vtXY[0] + "px";
      vt.style.top = vtXY[1] + "px";
      vt.hidden = false;
      document.body.classList.add("lora-vtip-on");
    }
    function vtipOff() { if (vt) vt.hidden = true; document.body.classList.remove("lora-vtip-on"); vtOn = null; }
    host.addEventListener("pointermove", function (event) {
      var r = event.target.closest && event.target.closest('input[type="range"].zoned');
      vtXY = [event.clientX, event.clientY];
      if (r && !r.disabled) { vtOn = r; vtip(r); } else if (vtOn && !(event.buttons & 1)) vtipOff();
    });
    host.addEventListener("pointerleave", function (event) { if (!(event.buttons & 1)) vtipOff(); });
    host.addEventListener("input", function (event) { if (event.target.matches && event.target.matches('input[type="range"].zoned') && vtOn) vtip(event.target); });
    document.addEventListener("pointerup", function () { setTimeout(function () { if (vtOn && !vtOn.matches(":hover")) vtipOff(); }, 0); });
    host.addEventListener("input", function (event) {
      if (event.target.classList.contains("lora-total-range")) return void scaleHalf(event.target.dataset.half || "ar", parseFloat(event.target.value));   // 1166, 1167
      var id = event.target.dataset.lora, half = event.target.dataset.half;
      if (!id || !half) return;
      S.choice.forEach(function (c) { if (c.id === id) c[half] = parseFloat(event.target.value); });
      event.target.nextElementSibling.textContent = fmt(event.target.value, 2);
      event.target.parentNode.classList.toggle("is-over", overLimit(entry(id), half, parseFloat(event.target.value)));   // 1084
      syncTotal();                        // HERESY 1166, 1167: each half's together follows a strength as it moves
      paintNotes();
    });
    // HERESY 1166: the together-slider let go: the next drag starts from where the strengths stand, the slider at their sum
    host.addEventListener("change", function (event) {
      if (!event.target.classList.contains("lora-total-range")) return;
      S.base = null;
      syncTotal();
      if (S.opts.onChange) S.opts.onChange();
    });
    paint();
  }

  function setCatalog(list) {
    var before = JSON.stringify(S.catalog);
    S.catalog = (list || []).slice();
    if (JSON.stringify(S.catalog) !== before) { paint(); askMissing(); }   // HERESY 1496
  }

  function setSources(map) {
    var before = JSON.stringify(S.sources);
    S.sources = map && typeof map === "object" ? map : {};
    if (JSON.stringify(S.sources) !== before) paint();
  }

  function set(list, groups) {
    S.choice = (list || []).map(function (c) {
      var o = { id: String(c.id), ar: Number(c.ar) || 0, nar: Number(c.nar) || 0 };
      if (c.muted) o.muted = true;                    // HERESY 1167: a muted one comes back muted
      if (c.noscore) o.noscore = true;                // HERESY 1629: out of the score, as it was
      var w = waveClean(c.curve);                     // HERESY 1447: its wave, as the take ran it
      if (w) { o.curve = w; o.curveMode = JSON.stringify(w) === JSON.stringify(WAVE_ARCH) ? "arch" : "draw"; }
      if (Array.isArray(c.sections)) { o.sections = c.sections.map(Number); o.curveMode = "sections"; o.curve = o.curve || [[0, 1], [1, 1]]; }   // HERESY 1665
      return o;
    }).filter(function (c) { return c.id && (c.ar || c.nar); });
    if (Array.isArray(groups)) S.budget = groups.length ? (groups[0].mode === "order" ? "order" : "share") : S.budget;   // HERESY 1447
    changed();
  }

  // HERESY 1167 (Viktor: «суффиксом приклинивай все триггеры в системный промпт»): the trigger words of the adapters in the run
  // that the style does not hold yet, in the order of the form, once each
  function triggersFor(style) {
    var low = String(style || "").toLowerCase(), out = [];
    value().forEach(function (v) {
      var w = triggerOf(entry(v.id));
      if (w && low.indexOf(w.toLowerCase()) < 0 && out.indexOf(w) < 0) out.push(w);
    });
    return out;
  }
  // HERESY 1167: what the form keeps, the muted too (value() is what the run gets)
  function kept() {
    return S.choice.filter(function (c) { return c.ar || c.nar; }).map(function (c) {
      if (c.curveMode === "sections") c.curve = sectionCurve(c.sections) || [[0, 1], [1, 1]];   // HERESY 1665: from the form as it is now
      var o = { id: c.id, ar: c.ar || 0, nar: c.nar || 0 }, w = waveClean(c.curve);
      if (c.muted) o.muted = true;
      if (c.noscore) o.noscore = true;                // HERESY 1629
      if (w) o.curve = w;                             // HERESY 1447
      if (c.curveMode === "sections") o.sections = (c.sections || []).slice();   // HERESY 1665: kept as ticks, the wave worked out again
      return o;
    });
  }
  function value() {
    return S.choice.filter(function (c) {
      var e = entry(c.id);
      return e && !e.error && !c.muted && ((has(e, "ar") && c.ar > 0) || (has(e, "nar") && c.nar > 0));
    }).map(function (c) {
      if (c.curveMode === "sections") c.curve = sectionCurve(c.sections) || [[0, 1], [1, 1]];   // HERESY 1665: the borders of the song as it is now
      var e = entry(c.id), w = waveClean(c.curve), g = groupOf(c.id);
      var o = { id: c.id, ar: has(e, "ar") ? Math.round(c.ar * 1000) / 1000 : 0, nar: has(e, "nar") ? Math.round(c.nar * 1000) / 1000 : 0 };
      if (w) o.curve = w;                             // HERESY 1447: its wave and its budget, both run with the graph
      if (g >= 0) o.group = g;
      if (c.noscore && o.ar > 0) o.noscore = true;   // HERESY 1629: it sings the score, it does not write it (app.js leaves it out of the plan)
      return o;
    });
  }

  // One line per LoRA for a song's info: a LoRA's two halves (often two files) share its line
  function lines(list) {
    var byName = {}, order = [];
    (list || []).forEach(function (c) {
      var name = c.name || nameOf(c.id);
      if (!byName[name]) { byName[name] = { music: 0, sound: 0 }; order.push(name); }
      if (Number(c.ar)) byName[name].music = Number(c.ar);
      if (Number(c.nar)) byName[name].sound = Number(c.nar);
      if (Array.isArray(c.curve) && c.curve.length) byName[name].wave = true;   // HERESY 1447
    });
    return order.map(function (name) {
      var l = byName[name], parts = [];
      if (l.music) parts.push("music " + fmt(l.music, 2));
      if (l.sound) parts.push("sound " + fmt(l.sound, 2));
      if (l.wave) parts.push("a wave");               // HERESY 1447
      return { name: name, amounts: parts.join(" · ") };
    });
  }

  function describe(list) {
    return (list || []).map(function (c) {
      var parts = [];
      if (Number(c.ar)) parts.push("music " + fmt(c.ar, 1));
      if (Number(c.nar)) parts.push("sound " + fmt(c.nar, 1));
      return (c.name || nameOf(c.id)) + " (" + parts.join(" · ") + ")";
    }).join(", ");
  }

  // HERESY 1087: for the broken-score window: a zone and a name by id, and the chosen strengths of one half
  // brought down to their green (the count changed is returned)
  function toGreen(half) {
    var n = 0;
    S.choice.forEach(function (c) { var z = zones(entry(c.id), half); if (c[half] > z.safe) { c[half] = z.safe; n++; } });
    if (n) changed();
    return n;
  }
  // HERESY 1168: is this adapter in loras/? (null while the catalog has not come: unknown, not «no»)
  // (its own name: has(e, half) above is the halves' question)
  function inCatalog(id) { return S.catalog.length ? !!entry(id) : null; }
  // HERESY 1623: a score coming into the form or going lifts the music half's together to the old ceiling or brings the plan's back
  var wasScored = null;
  function scoreSays() { var now = scored(); if (now !== wasScored) { wasScored = now; if (S.host) paint(); } }
  root.YueLoras = { mount: mount, setCatalog: setCatalog, set: set, value: value, kept: kept, groups: loraGroups,   // HERESY 1447: the budgets
    budget: function () { return S.budget; }, profile: function () { return S.profile; }, triggersFor: triggersFor, describe: describe, has: inCatalog, lines: lines, repaint: paint,
    relayout: layoutWaves, over: function (on) { if (on !== undefined) loraOver(!!on); return !!S.over; },   // HERESY 1458
    listInto: listInto, setSources: setSources, zone: function (id, half) { return zones(entry(id), half); }, catalog: function () { return S.catalog.slice(); }, name: nameOf, toGreen: toGreen,   // 1595: catalog, read for the checks
    missing: missingIds, askMissing: askMissing, hidden: function () { return (S.hidden || []).slice(); },   // HERESY 1496
    total: function () { var z = totalZone("ar"); return { value: arTotal(), stacked: arStacked(), safe: z.safe, limit: z.limit, max: z.max }; },   // HERESY 1623: of the moment
    scoreSays: scoreSays, sections: songSections, scoreSections: scoreSections, kind: kindOf, twin: twinOf, free: function (on) { if (on !== undefined) setFree(on); return !!S.free; } };   // HERESY 1629
})(window);

// HERESY 1703: the ▼ ▲ by a voice adapter: shown while the plan mode is Full and the form holds a score (a score the page puts in sends no input event,
// so a light look every second too); a press moves the score's Vocal line through 1028's own row (its note, its toast)
(function () {
  "use strict";
  function ok() {
    var c = document.querySelector('input[name="cot"]:checked'), a = document.getElementById("abc");
    return !!(c && c.value === "full" && a && a.value.trim());
  }
  function paint() { document.body.classList.toggle("vshift-ok", ok()); }
  document.addEventListener("input", function (e) { if (e.target && e.target.id === "abc") paint(); });
  document.addEventListener("change", function (e) { if (e.target && e.target.name === "cot") paint(); });
  setInterval(paint, 1000);
  paint();
  document.addEventListener("click", function (e) {
    var b = e.target && e.target.closest && e.target.closest("[data-vshift]");
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    var who = document.getElementById("voiceShiftWho"), how = document.getElementById("voiceShift"), go = document.getElementById("voiceShiftBtn");
    if (!who || !how || !go || !ok()) return;
    who.value = "Vocal"; how.value = b.dataset.vshift; go.click();
    paint();
  }, true);
  window.ruachVshiftOk = ok;   // for the checks
})();
