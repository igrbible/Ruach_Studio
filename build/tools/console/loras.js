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

  var S = { catalog: [], choice: [], host: null, opts: {}, list: null, note: null, sources: {} };

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

  // A few words on what it does, for inside its button: sources.json's tag, else the file's style note
  function tagOf(e) {
    var src = source(e.id), hint = String(e.hint || "").split(/[,.;]/)[0].trim();
    return src && src.tag ? src.tag : hint.length <= 32 ? hint : hint.slice(0, 31) + "\u2026";
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
    return lines.join("\n");
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
  function zones(e, half) {
    var src = e ? source(e.id) : null, own = src && src.limits && src.limits[half];
    if (own && own.length >= 2) return { safe: own[0], limit: own[1], max: own[2] || Math.max(own[1] * 1.5, own[1] + 0.25) };
    if (half === "nar") return { safe: 1.0, limit: 1.5, max: 2 };
    if (scoreAdapter(e)) return { safe: 1.0, limit: 1.25, max: 2 };
    if (ownAdapter(e)) return { safe: 0.5, limit: 0.6, max: 1 };
    return { safe: 0.5, limit: 0.75, max: 1 };
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
  function totalClass(t, half) { var z = TOTAL[half || "ar"]; return t > z.limit + 1e-9 ? "is-red" : t > z.safe + 1e-9 ? "is-amber" : "is-green"; }
  function totalBar() { return halfBar("ar") + halfBar("nar"); }
  function halfBar(half) {
    if (capable(half) < 2) return "";
    var t = halfTotal(half), z = TOTAL[half], music = half === "ar";
    var road = "--z1:" + (100 * z.safe / z.max).toFixed(1) + "%;--z2:" + (100 * z.limit / z.max).toFixed(1) + "%";
    var tip = music ? tr("All the music strengths together. Measured on this studio's takes: the score came out whole up to " +
        z.limit + " in every run, broken from 2.5 in every run. Green to " + z.safe + ", amber to " + z.limit + ", red past it.")
      : tr("All the sound strengths together. By ear (05.10.2026): two adapters at sound 1.0 each, 2.0 together, brought a heavy bass; 0.55 together sounded right. Green to " +
        z.safe + ", amber to " + z.limit + ", red past it.");
    return '<label class="lora-total ' + totalClass(t, half) + '" data-half="' + half + '" data-tip="' + escape(tip + " " +
        tr("Drag it to move them all at once, each in proportion.")) + '">' +
      "<span>" + (music ? "Music, together" : "Sound, together") + "</span>" +
      '<input type="range" class="zoned lora-total-range" data-half="' + half + '" style="' + road + '" min="0" max="' + z.max + '" step="0.005" value="' + t +
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
  }
  // every music strength moved at once, each in proportion to where it stood when the drag began (all alike when all
  // stood at nought), none past its own max, on the 0.005 grid the run keeps; the grid's remainders go to the largest
  // fractions, so the sum lands where the slider is let go (each rounded on its own, 1 came out 0.995)
  function scaleMusic(target) { scaleHalf("ar", target); }
  function scaleHalf(half, target) {   // HERESY 1167: either half; a muted adapter is left as it is
    if (!S.base || S.baseHalf !== half) {
      S.baseHalf = half;
      S.base = S.choice.filter(function (c) { var e = entry(c.id); return e && !c.muted && has(e, half); })
        .map(function (c) { return { c: c, ar: c[half] || 0, cap: capOf(entry(c.id), half) }; });
    }
    var sum = S.base.reduce(function (s, b) { return s + b.ar; }, 0), n = S.base.length;
    var u = S.base.map(function (b) { return Math.min(b.cap * 200, Math.max(0, (sum > 1e-9 ? b.ar * target / sum : target / n) * 200)); });
    var got = u.map(function (x) { return Math.floor(x + 1e-9); });
    var left = Math.round(target * 200) - got.reduce(function (s, x) { return s + x; }, 0);
    u.map(function (x, i) { return i; }).sort(function (a, b) { return (u[b] - got[b]) - (u[a] - got[a]); }).forEach(function (i) {
      if (left > 0 && got[i] + 1 <= Math.round(S.base[i].cap * 200) && u[i] - got[i] > 1e-9) { got[i]++; left--; }
    });
    S.base.forEach(function (b, i) { b.c[half] = got[i] / 200; });
    S.host.querySelectorAll('.lora-half input[data-half="' + half + '"]').forEach(function (r) {
      var c = S.choice.filter(function (x) { return x.id === r.dataset.lora; })[0];
      if (!c || c.muted) return;
      r.value = c[half];
      if (r.nextElementSibling) r.nextElementSibling.textContent = fmt(c[half], 2);
      r.parentNode.classList.toggle("is-over", overLimit(entry(c.id), half, c[half]));
    });
    syncTotal(half);
    S.host.querySelector(".lora-hint").textContent = hints().map(tr).join(" ");
  }
  function overLimit(e, half, v) { return v > zones(e, half).limit + 1e-9; }

  function halfControl(choice, e, half) {
    var label = half === "ar" ? "Music" : "Sound", on = has(e, half) || !e;
    if (!on) return "";   // HERESY 1016: a file without this half shows no slider for it
    var value = on ? choice[half] : 0, z = zones(e, half);
    var road = "--z1:" + (100 * z.safe / z.max).toFixed(1) + "%;--z2:" + (100 * z.limit / z.max).toFixed(1) + "%";
    return '<label class="lora-half' + (on ? "" : " is-off") + (on && overLimit(e, half, value) ? " is-over" : "") + '" data-tip="' + escape(on
      ? tr(half === "ar" ? "Strength on the music half: the score and the music tokens (0 off, 1 as trained)"
                         : "Strength on the sound half: the acoustic stage that turns music tokens into sound (0 off, 1 as trained)") +
        " · " + tr("green to " + z.safe + ", amber to " + z.limit + ", red beyond")
      : tr("This file has no " + label.toLowerCase() + " half")) + '"><span>' + label + "</span>" +
      '<input type="range" class="zoned" style="' + road + '" min="0" max="' + z.max + '" step="0.025" value="' + value + '"' + (on ? "" : " disabled") +
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
    if (arStacked() > 1 && arTotal() > AR_TOTAL.limit + 1e-9) notes.push("\u26a0 The music half carries " + fmt(arTotal(), 2) + " together, past the shared ceiling " +
      AR_TOTAL.limit + ": runs this heavy wrote broken scores every time (measured). Lower some, or take one off the music half.");
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
        S.choice.push({ id: x, ar: has(e, "ar") ? Math.min(1, zones(e, "ar").limit) : 0, nar: has(e, "nar") ? Math.min(1, zones(e, "nar").limit) : 0 });
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
      return '<div class="lora-row' + (e ? "" : " is-missing") + (muted ? " is-muted" : "") + '" data-ids="' + escape(ids.join("|")) +
        '"><span class="lora-who"><span class="lora-name" translate="no" data-tip="' + escape(e ? aboutTip(e) + (p ? "\n\n" + aboutTip(p) : "") : tr("Not in loras/ any more")) + '">' +
        escape(nameOf(c.id)) + "</span>" + (muted ? '<span class="lora-muted-tag" data-tip="Right-click: back in the run">muted</span>' : "") +
        // HERESY 1167 (Viktor: «суффиксом приклинивай все триггеры… кнопка не нужна»): the run puts the word at the style's end
        (trig ? (inStyle ? '<span class="lora-trigger is-in" data-tip="Its trigger word is in the style">\u2713 ' + escape(trig) + "</span>"
                         : '<span class="lora-trigger is-auto" data-tip="Its trigger word goes at the style\u2019s end by itself when the song is made">' + escape(trig) + "</span>") : "") +
        '</span><span class="lora-halves">' + arPart + narPart + "</span>" +
        '<button type="button" class="icon-btn" data-remove-lora="' + escape(ids.join("|")) + '" aria-label="' + escape(tr("Remove " + nameOf(c.id))) + '">✕</button></div>';
    }).join("") + totalBar();
    // one even grid of buttons: the name, which half it steers, and a few words on what it does
    chips.innerHTML = S.catalog.map(function (e) {
      var p = pairOf(e);
      if (p && has(e, "nar")) return "";                // HERESY 1167: a pair drawn once, from its music file
      var isOn = on[e.id] || (p && on[p.id]);
      var tag = e.error ? "cannot load" : p ? (tagOf(e) || "music + sound halves") : tagOf(e) || halvesText(e) + (has(e, "ar") && has(e, "nar") ? " halves" : " half");
      return '<button type="button" class="lora-pick' + (isOn ? " is-on" : "") + '" data-lora-chip="' + escape(e.id) + '"' +
        (e.error ? " disabled" : "") + ' aria-pressed="' + (isOn ? "true" : "false") + '" data-tip="' + escape(aboutTip(e) + (p ? "\n\n" + aboutTip(p) : "")) + '">' +
        '<span class="lora-pick-name" translate="no">' + escape(nameOf(e.id)) + "</span>" +
        (e.error ? "" : '<span class="lora-pick-half">' + (p ? "both" : halfShort(e)) + "</span>") +
        '<span class="lora-pick-tag">' + escape(tag) + "</span></button>";
    }).join("");
    S.host.querySelector(".lora-hint").textContent = hints().map(tr).join(" ");
    S.host.querySelector(".lora-lib-count").textContent = S.catalog.length ? String(S.catalog.length) : "";   // HERESY 1167
  }

  function changed() {
    paint();
    if (S.opts.onChange) S.opts.onChange();
  }

  function mount(host, opts) {
    S.host = host;
    S.opts = opts || {};
    // HERESY 1167: the adapters not in use behind one line, open or closed as it was left; the ones in use stay above it
    host.innerHTML = '<div class="lora-active"></div><details class="lora-lib"><summary><span class="chev" aria-hidden="true"></span>' +
      '<span class="lora-lib-name">Add a LoRA</span><span class="lora-lib-count mono"></span></summary>' +
      '<div class="lora-chips"></div></details><p class="row-hint lora-hint"></p>';
    var lib = host.querySelector(".lora-lib");
    try { lib.open = root.localStorage.getItem("yue2.loraLib") === "open"; } catch (e) { /* no storage: closed */ }
    lib.addEventListener("toggle", function () {
      try { root.localStorage.setItem("yue2.loraLib", lib.open ? "open" : "closed"); } catch (e) { /* no storage */ }
    });
    host.addEventListener("click", function (event) {
      var chip = event.target.closest("[data-lora-chip]"), remove = event.target.closest("[data-remove-lora]");
      var trigger = event.target.closest("[data-trigger]");
      if (chip && !chip.disabled) {
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
        root.HeresyMenu.open(event.clientX, event.clientY, [
          { label: isMuted ? "Unmute: back in the run" : "Mute: left out of the run, its strengths kept", icon: isMuted ? "\u25b6" : "\u23f8",
            action: function () { mine.forEach(function (c) { if (isMuted) delete c.muted; else c.muted = true; }); changed(); } },
          { sep: true },
          { label: "Remove from the song", icon: "\u2715", action: function () { S.choice = S.choice.filter(function (c) { return ids.indexOf(c.id) < 0; }); changed(); } }
        ]);
        return;
      }
      var e = entry(chip.dataset.loraChip);
      if (!e) return;
      var inSong = S.choice.some(function (c) { return idsOf(e.id).indexOf(c.id) >= 0; });
      var items = [{ label: inSong ? "Take it out of the song" : "Add it to the song", action: function () { toggle(e.id); } }];
      if (ownAdapter(e) && S.opts.unpublish) items.push({ sep: true }, { label: "Remove from the list (the adapter stays in its Trainer session)", icon: "\u21a9",
        action: function () { S.opts.unpublish(idsOf(e.id)); } });
      root.HeresyMenu.open(event.clientX, event.clientY, items);
    });
    // HERESY 1081: a double-click on a strength opens a field for it; Enter or leaving it sets, Esc leaves it be
    host.addEventListener("dblclick", function (event) {
      var out = event.target.closest(".lora-half output");
      if (!out) return;
      var range = out.previousElementSibling, max = parseFloat(range.max), field = document.createElement("input");
      field.type = "number"; field.className = "lora-exact"; field.min = "0"; field.max = String(max); field.step = "0.005";
      field.value = parseFloat(range.value).toFixed(2);
      out.replaceWith(field); field.focus(); field.select();
      var done = false;
      function finish(keep) {
        if (done) return; done = true;
        var v = parseFloat(field.value);
        if (keep && isFinite(v)) {
          v = Math.max(0, Math.min(max, v));
          S.choice.forEach(function (c) { if (c.id === range.dataset.lora) c[range.dataset.half] = v; });
        }
        changed();
      }
      field.addEventListener("keydown", function (e) { if (e.key === "Enter") finish(true); if (e.key === "Escape") finish(false); });
      field.addEventListener("blur", function () { finish(true); });
    });
    host.addEventListener("input", function (event) {
      if (event.target.classList.contains("lora-total-range")) return void scaleHalf(event.target.dataset.half || "ar", parseFloat(event.target.value));   // 1166, 1167
      var id = event.target.dataset.lora, half = event.target.dataset.half;
      if (!id || !half) return;
      S.choice.forEach(function (c) { if (c.id === id) c[half] = parseFloat(event.target.value); });
      event.target.nextElementSibling.textContent = fmt(event.target.value, 2);
      event.target.parentNode.classList.toggle("is-over", overLimit(entry(id), half, parseFloat(event.target.value)));   // 1084
      syncTotal();                        // HERESY 1166, 1167: each half's together follows a strength as it moves
      S.host.querySelector(".lora-hint").textContent = hints().map(tr).join(" ");
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
    if (JSON.stringify(S.catalog) !== before) paint();
  }

  function setSources(map) {
    var before = JSON.stringify(S.sources);
    S.sources = map && typeof map === "object" ? map : {};
    if (JSON.stringify(S.sources) !== before) paint();
  }

  function set(list) {
    S.choice = (list || []).map(function (c) {
      var o = { id: String(c.id), ar: Number(c.ar) || 0, nar: Number(c.nar) || 0 };
      if (c.muted) o.muted = true;                    // HERESY 1167: a muted one comes back muted
      return o;
    }).filter(function (c) { return c.id && (c.ar || c.nar); });
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
      var o = { id: c.id, ar: c.ar || 0, nar: c.nar || 0 };
      if (c.muted) o.muted = true;
      return o;
    });
  }
  function value() {
    return S.choice.filter(function (c) {
      var e = entry(c.id);
      return e && !e.error && !c.muted && ((has(e, "ar") && c.ar > 0) || (has(e, "nar") && c.nar > 0));
    }).map(function (c) {
      var e = entry(c.id);
      return { id: c.id, ar: has(e, "ar") ? Math.round(c.ar * 1000) / 1000 : 0, nar: has(e, "nar") ? Math.round(c.nar * 1000) / 1000 : 0 };
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
    });
    return order.map(function (name) {
      var l = byName[name], parts = [];
      if (l.music) parts.push("music " + fmt(l.music, 2));
      if (l.sound) parts.push("sound " + fmt(l.sound, 2));
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
  root.YueLoras = { mount: mount, setCatalog: setCatalog, set: set, value: value, kept: kept, triggersFor: triggersFor, describe: describe, lines: lines, repaint: paint,
    listInto: listInto, setSources: setSources, zone: function (id, half) { return zones(entry(id), half); }, name: nameOf, toGreen: toGreen,
    total: function () { return { value: arTotal(), stacked: arStacked(), safe: AR_TOTAL.safe, limit: AR_TOTAL.limit }; } };
})(window);
