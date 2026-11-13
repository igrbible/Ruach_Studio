// HERESY 1047: the Writer's notebook (Viktor, 01.10.2026): a song or a reading in the making, as a
// document with four parts: STYLE, LYRICS, NOTES (Markdown) and PARAMS (every knob of the Create
// form). Both ways with Create: "Save to Writer" there keeps the song as it is tuned; "Load into
// Create" here puts it back. The document loaded into the Creator is "in hand": the takes made while it
// is in hand are linked to it. Every save keeps the version before; typing autosaves, and a sitting
// of typing is one version (the lab keeps one only after ten quiet minutes); "Keep this version"
// keeps one under a label. The lab keeps the documents (KIT/writer/ID.json); a deleted one goes to
// KIT/writer/.trash/.
(function () {
  "use strict";

  var HAND_KEY = "yue2.writerDoc", SCOPE = (new URLSearchParams(location.search).get("scope") || "").replace(/[^a-z0-9_-]/gi, "");
  var state = { docs: [], doc: null, dirty: false, saving: null, timer: 0, q: "", view: null, hooks: null, preview: false,
                // HERESY 2479: the list's sort, filter and grouping (kept in this browser), the trash shown instead, the groups unfolded
                sort: recall("yue2.wrSort") || "changed", filter: recall("yue2.wrFilter") || "all", group: recall("yue2.wrGroup") !== "0",
                trashView: false, trash: [], openGroups: (function () { try { return JSON.parse(recall("yue2.wrOpenGroups") || "{}") || {}; } catch (e) { return {}; } })() };
  var LYR_MAX = 10000;                                   // HERESY 2480: a song's lyrics, as the Musician's form holds them
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function recall(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function store(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* private */ } }
  function toast(t, bad) { state.hooks && state.hooks.toast(t, bad ? "bad" : ""); }
  function tr(s) { return window.RuachI18n ? window.RuachI18n.t(s) : s; }
  function api(body, id) {
    var q = [];
    if (id) q.push("id=" + encodeURIComponent(id));
    if (SCOPE) q.push("scope=" + encodeURIComponent(SCOPE));
    var opt = body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
    return fetch("/lab/writer" + (q.length ? "?" + q.join("&") : ""), opt).then(function (r) {
      return r.json().then(function (b) { if (!r.ok) throw new Error(b.error || r.status); return b; });
    });
  }
  function when(t) {
    if (!t) return "";
    var d = new Date(t * 1000), now = Date.now() / 1000;
    if (now - t < 86400 * 6) return state.hooks.ago(t);
    // HERESY 1166: in the page's language; one that borrows its neighbour's formats gets numbers, not the neighbour's month names
    var I = window.RuachI18n, L = I ? I.locales() : undefined, named = !(I && I.borrowed());
    return d.toLocaleDateString(L, named ? { day: "numeric", month: "short", year: "numeric" } : { day: "2-digit", month: "2-digit", year: "numeric" }) +
      " " + d.toLocaleTimeString(L, { hour: "2-digit", minute: "2-digit" });
  }

  // ---- a small Markdown, enough for notes: headings, emphasis, code, quotes, lists, links, rules
  function md(text) {
    var out = [], list = null, para = [], code = null;
    function inline(s) {
      return esc(s).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>").replace(/~~([^~]+)~~/g, "<del>$1</del>")
        .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    }
    function flush() {
      if (para.length) { out.push("<p>" + para.map(inline).join("<br>") + "</p>"); para = []; }
      if (list) { out.push("<" + list.tag + ">" + list.items.map(function (i) { return "<li>" + inline(i) + "</li>"; }).join("") + "</" + list.tag + ">"); list = null; }
    }
    String(text || "").split(/\r?\n/).forEach(function (line) {
      if (code !== null) {
        if (/^```/.test(line)) { out.push("<pre><code>" + esc(code.join("\n")) + "</code></pre>"); code = null; } else code.push(line);
        return;
      }
      var m;
      if (/^```/.test(line)) { flush(); code = []; return; }
      if (!line.trim()) { flush(); return; }
      if ((m = /^(#{1,4})\s+(.*)$/.exec(line))) { flush(); out.push("<h" + (m[1].length + 2) + ">" + inline(m[2]) + "</h" + (m[1].length + 2) + ">"); return; }
      if (/^(-{3,}|\*{3,})\s*$/.test(line)) { flush(); out.push("<hr>"); return; }
      if ((m = /^>\s?(.*)$/.exec(line))) { flush(); out.push("<blockquote>" + inline(m[1]) + "</blockquote>"); return; }
      if ((m = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(line))) {
        var tag = /\d/.test(m[1]) ? "ol" : "ul";
        if (para.length) flush();
        if (list && list.tag !== tag) flush();
        if (!list) list = { tag: tag, items: [] };
        list.items.push(m[2].replace(/^\[ \]\s*/, "☐ ").replace(/^\[x\]\s*/i, "☑ "));
        return;
      }
      if (list) flush();
      para.push(line);
    });
    if (code !== null) out.push("<pre><code>" + esc(code.join("\n")) + "</code></pre>");
    flush();
    return out.join("");
  }

  // ---- PARAMS in a line of chips
  function paramChips(p) {
    if (!p || !Object.keys(p).length) return '<span class="row-hint">none yet — “From the Musician” takes them as the form has them now</span>';
    var chips = [];
    function chip(k, v) { chips.push('<span class="wr-chip"><b>' + esc(k) + "</b> " + esc(v) + "</span>"); }
    if (p.cot) chip("mode", p.cot);
    if (p.duration != null) chip("length", p.duration + " s");
    if (p.cfg_scale != null) chip("cfg", p.cfg_scale);
    if (p.steps != null) chip("steps", p.steps + (p.solver ? " · " + p.solver : ""));
    if (p.vae) chip("vae", p.vae);
    if (p.loras && p.loras.length) chip("LoRAs", p.loras.map(function (l) { return (l.name || l.path || "?") + (l.scale != null ? " ×" + l.scale : ""); }).join(", "));
    if (p.sliders && p.sliders.length) chip("sliders", p.sliders.length);
    ["abc", "semantic"].forEach(function (g) {
      var s = p[g + "_sampling"];
      if (s) chip(g === "abc" ? "score" : "sound", Object.keys(s).slice(0, 5).map(function (k) { return k.replace(/^(temperature)$/, "T") + "=" + s[k]; }).join(" "));
    });
    if (p.output_format) chip("out", p.output_format + (p.output_format === "mp3" && p.mp3_bitrate ? " " + p.mp3_bitrate : ""));
    return chips.join("");
  }

  // ---- the list
  function loadList() {
    return api().then(function (d) { state.docs = d.docs || []; state.listOk = true; paintList(); paintHand(); })
      .catch(function (e) { $("wrList").innerHTML = '<p class="row-hint">The notebook lives in Forge\'s lab, which does not answer: ' + esc(e.message) + "</p>"; });
  }
  // HERESY 2479 (the writer audit of 12.11.2026, item 15; Viktor 11.11.2026: the list filtered and sorted, a short guide instead of the repeated
  // documents): his versions live in his titles («01. МАНИФЕСТ_ Крик. v4.1.3.1» … «v4.3.0.1», «Я - буратино - v9.5.0»), so the list puts the
  // documents of one title without its version under one name: the highest version on top, the rest folded under it (a click unfolds them).
  // Sorted by the last change, by creation or by title; filtered by world (2480) or by takes; the trash shown in the list's place, brought back
  var VER_RE = /[\s._-]*\(?\bv\.?\s*(\d+(?:[._]\d+)*)\)?\s*$/i;
  function bare(title) { return String(title || "").replace(/\s*·\s*from the backup$/i, "").replace(/\s*\(copy\)$/i, ""); }
  function stem(title) { var t = bare(title); return t.replace(VER_RE, "").replace(/[\s\-–—_.:·,]+$/, "").trim() || t.trim(); }
  function groupKey(title) { return stem(title).toLowerCase().replace(/\s+/g, " "); }
  function verOf(title) { var m = VER_RE.exec(bare(title)); return m ? m[1].split(/[._]/).map(Number) : null; }
  function stamp(d, k) { return +d[k] || Date.parse(d[k]) / 1000 || 0; }
  function verCmp(a, b) {                                // the higher version first; a title without one after them, the newest first
    var x = verOf(a.title), y = verOf(b.title), i, d;
    if (x && y) for (i = 0; i < Math.max(x.length, y.length); i++) { d = (y[i] || 0) - (x[i] || 0); if (d) return d; }
    if (!x !== !y) return x ? -1 : 1;
    return stamp(b, "updated") - stamp(a, "updated");
  }
  function sorter() {
    if (state.sort === "title") return function (a, b) { return stem(a.title).localeCompare(stem(b.title), undefined, { numeric: true, sensitivity: "base" }) || verCmp(a, b); };
    var k = state.sort === "created" ? "created" : "updated";
    return function (a, b) { return stamp(b, k) - stamp(a, k); };
  }
  function passes(d) {
    if (state.filter === "creator" || state.filter === "reader") return (d.realm === "reader" ? "reader" : "creator") === state.filter;
    return state.filter === "takes" ? d.takes > 0 : true;
  }
  function docRow(d, hand) {
    var on = state.doc && state.doc.id === d.id;
    return '<button type="button" class="wr-item' + (on ? " is-on" : "") + (d.realm === "reader" ? " is-reading" : "") + '" data-doc="' + esc(d.id) + '">' +
      '<span class="wr-item-title" translate="no">' + (d.id === hand ? '<span class="wr-hand-dot" title="In hand in the Musician">✎</span> ' : "") + esc(d.title) + "</span>" +
      '<span class="wr-item-ex" translate="no">' + esc(d.excerpt || d.style || "") + "</span>" +
      '<span class="wr-item-meta"><span>' + esc(when(d.updated)) + "</span>" + (d.takes ? " · <span>" + d.takes + " take" + (d.takes > 1 ? "s" : "") + "</span>" : "") +   // HERESY 1166
      (d.versions ? " · <span>" + d.versions + " v</span>" : "") + "</span></button>";
  }
  function paintList() {
    paintTools();
    if (state.trashView) return paintTrash();
    var HC = window.HeresyCollection, m = HC ? HC.matcher(state.q) : function () { return true; }, hand = recall(HAND_KEY);
    var rows = state.docs.filter(function (d) { return passes(d) && (!state.q || m(d.hay || d.title)); }), html, by = sorter();
    $("wrCount").textContent = state.docs.length ? rows.length + (rows.length !== state.docs.length ? " / " + state.docs.length : "") : "";
    if (!rows.length) {
      html = '<p class="row-hint wr-empty">' + (!state.docs.length ? "No documents yet. ＋ New, or “Save to Writer” in the Musician."
        : state.q ? "Nothing for “" + esc(state.q) + "”." : "No documents of this kind.") + "</p>";
    } else if (!state.group) {
      html = rows.sort(by).map(function (d) { return docRow(d, hand); }).join("");
    } else {
      var groups = {}, order = [];
      rows.forEach(function (d) { var k = groupKey(d.title); if (!groups[k]) { groups[k] = []; order.push(k); } groups[k].push(d); });
      order.forEach(function (k) { groups[k].sort(verCmp); });
      var best = function (g) { return state.sort === "title" ? g[0] : g.slice().sort(by)[0]; };   // a group stands where its newest member stands
      order.sort(function (x, y) { return by(best(groups[x]), best(groups[y])); });
      html = order.map(function (k) {
        var g = groups[k];
        if (g.length === 1) return docRow(g[0], hand);
        var inside = state.doc && g.slice(1).some(function (d) { return d.id === state.doc.id; }), open = !!state.openGroups[k] || inside;
        return '<div class="wr-group' + (open ? " is-open" : "") + '"><button type="button" class="wr-group-head" data-group="' + esc(k) + '" aria-expanded="' + open + '"' +
          ' data-tip="' + esc(g.length + " documents under one name: its title without the version; a click unfolds them") + '">' +
          '<span class="wr-group-chev" aria-hidden="true"></span><span class="wr-group-name" translate="no">' + esc(stem(g[0].title)) + '</span>' +
          '<span class="wr-group-n" translate="no">' + g.length + "</span></button>" + docRow(g[0], hand) +
          (open ? '<div class="wr-group-rest">' + g.slice(1).map(function (d) { return docRow(d, hand); }).join("") + "</div>" : "") + "</div>";
      }).join("");
    }
    $("wrList").innerHTML = html;
    paintRecent();                                       // HERESY 1858
  }
  function paintTools() {
    var s = $("wrSort"), f = $("wrFilter"), g = $("wrGroupBtn"), t = $("wrTrashBtn");
    if (!s) return;
    if (s.value !== state.sort) s.value = state.sort;
    if (f.value !== state.filter) f.value = state.filter;
    g.classList.toggle("is-on", state.group); g.setAttribute("aria-pressed", String(state.group));
    t.classList.toggle("is-on", state.trashView); t.setAttribute("aria-pressed", String(state.trashView));
    [s, f, g, $("wrSearch"), $("wrSortBtn"), $("wrFilterBtn")].forEach(function (e) { if (e) e.disabled = state.trashView; });
    if ($("wrFilterBtn")) $("wrFilterBtn").classList.toggle("is-on", state.filter !== "all");   // HERESY 2568: a filter on shows on its icon
  }
  window.addEventListener("ruach-lang", function () { if (state.listOk && $("wrList")) paintList(); });   // HERESY 2532 (the UIX audit 13.11.2026, №11): the dates in the new language at once
  function loadTrash() {
    return api({ op: "trash" }).then(function (d) { state.trash = d.trash || []; paintList(); }).catch(function (e) { toast(e.message, true); });
  }
  function paintTrash() {
    $("wrCount").textContent = state.trash.length ? String(state.trash.length) : "";
    $("wrList").innerHTML = '<p class="row-hint wr-trash-head">The trash: documents deleted from the notebook, the newest first.</p>' +
      '<button type="button" class="btn ghost small wr-trash-back" data-trash-back="1">Back to the notebook</button>' +
      (state.trash.length ? state.trash.map(function (d) {
        return '<div class="wr-item wr-trash-item"><span class="wr-item-title" translate="no">' + esc(d.title) + "</span>" +
          '<span class="wr-item-ex" translate="no">' + esc(d.excerpt || "") + "</span>" +
          '<span class="wr-item-meta"><span>in the trash since ' + esc(when(d.deleted)) + "</span>" + (d.versions ? " · <span>" + d.versions + " v</span>" : "") + "</span>" +
          '<button type="button" class="btn ghost small" data-untrash="' + esc(d.id) + '">Restore</button></div>';
      }).join("") : '<p class="row-hint">The trash is empty.</p>');
  }
  // HERESY 1858 (Viktor 29.10.2026, UIX #2: «сделай»): with no document open, the room's right side shows the latest documents as cards; a click opens one.
  // HERESY 2479 (Viktor 11.11.2026: a short guide instead of the documents the list already shows): the guide stands there (index.html), and under it
  // the one document last changed, a click away
  function paintRecent() {
    var box = $("wrRecent"), last = state.docs.slice().sort(function (x, y) { return stamp(y, "updated") - stamp(x, "updated"); })[0];
    if (!box) return;
    box.hidden = !!state.doc;
    $("wrGuideLast").hidden = !last;
    if (last && $("wrGuideLastBtn").dataset.doc !== last.id + "|" + last.title) {
      $("wrGuideLastBtn").dataset.doc = last.id + "|" + last.title;
      $("wrGuideLastBtn").textContent = last.title;
    }
  }

  // ---- one document
  function open(id) {
    state.leaving = true;                                // HERESY 2492: a held cut is decided before the next document comes
    return flush().then(function () { state.leaving = false; return api(undefined, id); }, function (e) { state.leaving = false; throw e; }).then(function (doc) {
      state.doc = doc; state.dirty = false; state.view = null; state.cutHeld = false; state.cutOk = false; paintCut(null);
      paintDoc(); paintList();
      if (state.hooks.showWriter) state.hooks.showWriter();
    }).catch(function (e) { toast(e.message, true); });
  }
  function paintDoc() {
    var doc = state.doc, v = state.view !== null && doc ? doc.versions[state.view] : null, src = v || doc;
    $("wrEmpty").hidden = !!doc; $("wrDoc").hidden = !doc;
    if ($("wrRecent")) $("wrRecent").hidden = !!doc;     // HERESY 1858; 2479: the guide shows with no document too
    if (!doc) return;
    $("wrTitle").value = src.title || "";
    $("wrStyle").value = src.style || "";
    $("wrLyrics").value = src.lyrics || "";
    $("wrNotes").value = src.notes || "";
    ["wrTitle", "wrStyle", "wrLyrics", "wrNotes"].forEach(function (id) { $(id).readOnly = !!v; });
    $("wrVersionBar").hidden = !v;
    if (v) $("wrVersionSay").textContent = "Version of " + when(v.at) + (v.label ? " — " + v.label : "") + ". Read only.";
    paintVersionDiff(v, doc);
    $("wrParams").innerHTML = paramChips(src.params);
    paintNotes(); paintSizes(); paintTakes(); paintVersions(); paintState();
    paintRealm(); paintCompare();                        // HERESY 2480, 2482
    $("wrHandBtn").textContent = recall(HAND_KEY) === doc.id ? "In hand in the Musician ✎" : "Load into the Musician";
  }
  // HERESY 2477 (the writer audit of 12.11.2026, item 13): a version shown says what differs from now, the style and the lyrics line by line, the
  // version's lines (−) above now's (+), the rest folded; the Musician's Versions give the diff (HeresyVersions.diff)
  function paintVersionDiff(v, doc) {
    var box = $("wrVersionDiff"), D = window.HeresyVersions && window.HeresyVersions.diff;
    if (!box) return;
    box.hidden = !v || !D;
    if (!v || !D) return;
    var rows = [], changed = 0, part = function (name, a, b) {
      var d = D(String(a || "").split(/\r?\n/), String(b || "").split(/\r?\n/));
      if (!d) { rows.push('<div class="dl-gap">' + esc(name) + ": " + esc(tr("too long to compare line by line")) + "</div>"); return; }
      var near = d.map(function (x, k) { for (var q = Math.max(0, k - 1); q <= Math.min(d.length - 1, k + 1); q++) if (d[q][0]) return true; return false; });
      var gap = false;
      d.forEach(function (x, k) {
        if (x[0]) changed++;
        if (!near[k]) { gap = true; return; }
        if (gap) { rows.push('<div class="dl-gap">…</div>'); gap = false; }
        rows.push('<div class="dl' + (x[0] < 0 ? " dl-del" : x[0] > 0 ? " dl-add" : "") + '"><span class="dl-n">' + esc(name) + (x[0] < 0 ? " −" : x[0] > 0 ? " +" : "") + "</span>" + (esc(x[1]) || " ") + "</div>");
      });
    };
    part(tr("Style"), v.style, doc.style);
    part(tr("Lyrics"), v.lyrics, doc.lyrics);
    $("wrVersionDiffSay").textContent = changed ? "{0} lines differ from now".replace("{0}", changed) : "The style and the lyrics are as now";
    $("wrVersionDiffBody").innerHTML = changed ? rows.join("") : "";
    box.classList.toggle("is-calm", !changed);
  }
  function paintSizes() {
    var lyr = $("wrLyrics").value, sty = $("wrStyle").value;
    $("wrStyleSize").textContent = sty ? sty.length + " chars" : "";
    $("wrLyricsSize").textContent = lyr ? lyr.split(/\r?\n/).filter(function (l) { return l.trim(); }).length + " lines · " + lyr.length + " chars" : "";
    // HERESY 2480: a song's lyrics near the Musician's 10 000 say so (red past it, which only a text that came in whole can be); a reading says it has no limit
    var song = realmOf(state.doc) === "creator", lim = $("wrLyricsLimit");
    if (lim) {
      lim.textContent = !song ? "a reading: no limit" : lyr.length > LYR_MAX * 0.9 ? "the lyrics hold 10 000" : "";
      lim.classList.toggle("wr-size-over", song && lyr.length > LYR_MAX);
    }
  }
  // ---- HERESY 2480 (the writer audit of 12.11.2026, item 16, 3.11: a paste past the limit was cut by the browser without a word): a document is a
  // song for the Musician or a reading for the Narrator (its realm, as a Library take's). A song's lyrics hold 10 000 characters, the Musician's
  // own limit; a reading has none (the Narrator reads books of 200 parts). A paste or a drop past the limit asks: kept whole as a reading, or cut,
  // and the cut said. The Musician's lyrics say what a paste cut there too
  function realmOf(d) { return d && d.realm === "reader" ? "reader" : "creator"; }
  function paintRealm() {
    var r = realmOf(state.doc), v = state.view !== null;
    document.querySelectorAll("#wrRealm [data-realm]").forEach(function (b) {
      b.classList.toggle("is-on", b.dataset.realm === r); b.setAttribute("aria-pressed", String(b.dataset.realm === r)); b.disabled = v;
    });
    if (r === "reader") $("wrLyrics").removeAttribute("maxlength"); else $("wrLyrics").setAttribute("maxlength", String(LYR_MAX));
  }
  function setRealm(r, quiet) {
    if (!state.doc || state.view !== null || (realmOf(state.doc) === r && state.doc.realm)) return Promise.resolve(state.doc);
    var id = state.doc.id;
    return flush().then(function () { return api({ op: "put", id: id, realm: r }); }).then(function (doc) {
      if (state.doc && state.doc.id === doc.id) { state.doc = doc; paintRealm(); paintSizes(); }
      patchListRow(doc);
      if (!quiet) toast(r === "reader" ? "A reading for the Narrator now: its text has no limit" : "A song for the Musician now: its lyrics hold 10 000 characters; nothing already written is cut");
      return doc;
    }).catch(function (e) { toast(e.message, true); });
  }
  function insertText(area, text) {                      // as typed: Ctrl+Z takes it back in one step
    area.focus();
    if (document.activeElement !== area || !document.execCommand("insertText", false, text)) {   // a box out of sight takes no focus: written directly
      area.setRangeText(text, area.selectionStart, area.selectionEnd, "end");
      area.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }
  function guardLong(area, over) {
    var handle = function (e, text) {
      var max = parseInt(area.getAttribute("maxlength"), 10);
      if (!max || area.readOnly || !text) return;
      var room = max - (area.value.length - (area.selectionEnd - area.selectionStart));
      if (text.length <= room) return;
      e.preventDefault();
      over(text, Math.max(0, room), max);
    };
    area.addEventListener("paste", function (e) { handle(e, e.clipboardData ? e.clipboardData.getData("text/plain") : ""); });
    area.addEventListener("drop", function (e) { handle(e, e.dataTransfer ? e.dataTransfer.getData("text/plain") : ""); });
  }
  function cutSaid(area, text, room) {
    insertText(area, text.slice(0, room));
    toast("Pasted with {0} characters cut: the lyrics hold 10 000".replace("{0}", (text.length - room).toLocaleString()), true);
  }
  function paintNotes() {
    $("wrNotes").hidden = state.preview; $("wrNotesView").hidden = !state.preview;
    var nm = $("wrNotesMode"), nw = state.preview ? "Edit" : "Preview";   // HERESY 2569 (the UIX audit, item 57): an icon, its word in its label and tip
    nm.setAttribute("aria-label", nw); nm.setAttribute("data-tip", nw);
    nm.innerHTML = window.HeresyIcons && window.HeresyIcons.ui ? window.HeresyIcons.ui(state.preview ? "pencil" : "eye") : nw;
    if (state.preview) $("wrNotesView").innerHTML = md($("wrNotes").value) || '<p class="row-hint">No notes.</p>';
  }
  function paintTakes() {
    var doc = state.doc, h = state.hooks, takes = (doc.takes || []).map(function (n) { return { name: n, take: h.findTake(n) }; });
    $("wrTakesN").textContent = takes.length ? "(" + takes.length + ")" : "";
    $("wrTakes").innerHTML = takes.length ? takes.slice().reverse().map(function (t) {
      var k = t.take;
      return '<div class="wr-take' + (k ? "" : " is-gone") + '" data-take="' + esc(t.name) + '">' +
        (k ? '<button type="button" class="coll-play" data-wr-play="' + esc(t.name) + '" aria-label="Play">' + (window.HeresyIcons ? window.HeresyIcons.ui("play") : "▶") + '</button>' : '<span class="coll-play is-off">·</span>') +
        '<span class="wr-take-title">' + esc(k ? h.title(k) : t.name) + '</span><span class="dim">' + (k ? esc(h.clock(k.seconds) + " · " + h.ago(k.created)) : "not in the library") + "</span>" +
        (k ? '<button type="button" class="btn ghost small" data-wr-go="create">Musician</button><button type="button" class="btn ghost small" data-wr-go="post">Refiner</button>' : "") +
        '<button type="button" class="btn ghost small icon-btn wr-unlink" data-wr-unlink="1" aria-label="' + esc(tr("Not from this document")) + '" data-tip="' + esc(tr("Not from this document: take it off this list (the take stays in the Library)")) + '">' +
        (window.HeresyIcons ? window.HeresyIcons.ui("unlink") : "×") + "</button></div>";   // HERESY 2493
    }).join("") : '<p class="row-hint">None yet. Load this document into the Musician: whatever is made while it is in hand lands here.</p>';
  }
  function paintVersions() {
    var vs = state.doc.versions || [];
    $("wrVersionsN").textContent = vs.length ? "(" + vs.length + ")" : "";
    $("wrVersions").innerHTML = vs.length ? vs.map(function (v, i) { return { v: v, i: i }; }).reverse().map(function (x) {
      var v = x.v, n = (v.lyrics || "").split(/\r?\n/).filter(function (l) { return l.trim(); }).length;
      return '<button type="button" class="wr-ver' + (state.view === x.i ? " is-on" : "") + '" data-ver="' + x.i + '"><span>' + esc(when(v.at)) + "</span>" +
        (v.label ? '<span class="wr-ver-label">' + esc(v.label) + "</span>" : "") +
        '<span class="dim">' + esc((v.title || "").slice(0, 40)) + " · " + n + " lines · style " + (v.style || "").length + "</span></button>";
    }).join("") : '<p class="row-hint">A version is kept at every save after a pause, and whenever you keep one.</p>';
  }
  function paintState() {
    $("wrState").textContent = state.saving ? "saving…" : state.cutHeld ? tr("unsaved: a big cut waits for your choice") : state.dirty ? "unsaved" : state.doc ? "saved " + when(state.doc.updated) : "";   // HERESY 2492
    $("wrState").classList.toggle("is-dirty", state.dirty);
  }

  // ---- saving: typing autosaves after a pause; a sitting is one version
  function fields() {
    return { title: $("wrTitle").value.trim() || "Untitled", style: $("wrStyle").value, lyrics: $("wrLyrics").value, notes: $("wrNotes").value };
  }
  function changed() {
    if (!state.doc || state.view !== null) return;
    state.dirty = true; paintState(); paintSizes();
    clearTimeout(state.timer);
    if (state.cutHeld) {                                 // HERESY 2492: a held cut waits for a choice, unless the typing gave the part back
      var c = bigCut(fields(), state.doc);
      if (c) { paintCut(c); return; }
      state.cutHeld = false; paintCut(null);
    }
    state.timer = setTimeout(flush, 1500);
  }
  // HERESY 2492 (Viktor 12.11.2026: «Удалил текст из поля редактора, и он перезаписал мою текущую версию, что есть недочёт. Все изменения в редакторе
  // нужно либо сохранять подверсией, либо игнорить, с оверлей окном, что сделать и как поступить»): a big cut is never saved silently. A part of 40
  // characters or more that loses more than half of itself (or is emptied) holds the autosave and asks: keep it as a new version (the text before
  // stays as a version of its own), undo the cut, or keep editing (nothing saved until a choice; a bar above the parts waits with the two choices)
  var CUT_MIN = 40;
  function bigCut(f, d) {
    if (!d) return null;
    var parts = [["style", "Style"], ["lyrics", "Lyrics"], ["notes", "Notes"]];
    for (var i = 0; i < parts.length; i++) {
      var o = String(d[parts[i][0]] || "").length, n = String(f[parts[i][0]] || "").length;
      if (o >= CUT_MIN && n < o * 0.5) return { part: tr(parts[i][1]), was: o, now: n };
    }
    return null;
  }
  function cutSay(c) {
    return tr("{0}: {1} characters before, {2} now. The notebook has not saved it: what should it do?")
      .replace("{0}", c.part).replace("{1}", String(c.was)).replace("{2}", String(c.now));
  }
  function paintCut(c) {
    var bar = $("wrCutBar");
    if (!bar && c) {
      bar = document.createElement("div");
      bar.id = "wrCutBar"; bar.className = "wr-version-bar wr-cut-bar";
      bar.innerHTML = '<span id="wrCutSay"></span><span class="spacer"></span>' +
        '<button type="button" class="btn primary small" data-cut="keep"></button><button type="button" class="btn ghost small" data-cut="undo"></button>';
      var after = $("wrVersionBar");
      after.parentNode.insertBefore(bar, after.nextSibling);
      bar.addEventListener("click", function (e) { var b = e.target.closest("[data-cut]"); if (b) cutChoice(b.dataset.cut); });
    }
    if (!bar) return;
    bar.hidden = !c;
    if (!c) return;
    $("wrCutSay").textContent = tr("A big cut is not saved yet") + " · " + cutSay(c);
    bar.querySelector('[data-cut="keep"]').textContent = tr("Keep it as a new version");
    bar.querySelector('[data-cut="undo"]').textContent = tr("Undo the cut");
  }
  function askCut(c) {
    if (state.cutAsk) return state.cutAsk;
    clearTimeout(state.timer);
    var D = window.HeresyDialog, leaving = !!state.leaving;
    if (!D || !D.choose) { state.cutHeld = true; paintCut(c); paintState(); return leaving ? Promise.reject(new Error(tr("Stayed with the document: choose what to do with the cut first"))) : Promise.resolve(); }
    var items = [{ label: tr("Keep it as a new version"), note: tr("the text before stays as a version of its own"), value: "keep" },
                 { label: tr("Undo the cut"), note: tr("the part comes back as it was saved"), value: "undo" }];
    if (!leaving) items.push({ label: tr("Keep editing"), note: tr("nothing is saved until you choose; the bar above the parts waits"), value: "wait" });
    state.cutAsk = D.choose(tr("A big cut in {0}").replace("{0}", c.part) + "\n\n" + cutSay(c), items, { cancel: leaving ? tr("Stay here") : tr("Keep editing") })
      .then(function (v) {
        state.cutAsk = null;
        if (!v && leaving) { state.cutHeld = true; paintCut(c); paintState(); throw new Error(tr("Stayed with the document: choose what to do with the cut first")); }
        return cutChoice(v || "wait", c);
      });
    return state.cutAsk;
  }
  function cutChoice(v, c) {
    if (v === "keep") { state.cutOk = true; state.cutHeld = false; paintCut(null); return flush(); }
    if (v === "undo") {
      var d = state.doc || {};
      $("wrTitle").value = d.title || ""; $("wrStyle").value = d.style || ""; $("wrLyrics").value = d.lyrics || ""; $("wrNotes").value = d.notes || "";
      state.dirty = false; state.cutHeld = false; paintCut(null); paintState(); paintSizes(); paintNotes();
      return Promise.resolve();
    }
    state.cutHeld = true; paintCut(c || bigCut(fields(), state.doc)); paintState();
    return Promise.resolve();
  }
  function flush() {
    clearTimeout(state.timer);
    if (state.saving) return state.saving.then(flush);
    if (!state.doc || !state.dirty) return Promise.resolve();
    var f = fields(), cut = state.cutOk ? null : bigCut(f, state.doc);
    if (cut) return askCut(cut);                         // HERESY 2492
    var body = Object.assign({ op: "put", id: state.doc.id, autosave: true }, f, state.cutOk ? { label: tr("before a big cut"), autosave: false } : {});   // not an autosave: the lab keeps the text before as a version, now
    state.dirty = false; state.cutOk = false;
    state.saving = api(body).then(function (doc) {
      state.saving = null;
      var keepView = state.view;
      state.doc = doc; state.view = keepView;
      paintState(); paintVersions(); patchListRow(doc);
    }).catch(function (e) { state.saving = null; state.dirty = true; paintState(); toast("The notebook did not save: " + e.message, true); });
    paintState();
    return state.saving;
  }
  function patchListRow(doc) {
    var row = state.docs.filter(function (d) { return d.id === doc.id; })[0];
    if (!row) return loadList();
    row.title = doc.title; row.updated = doc.updated; row.takes = (doc.takes || []).length; row.versions = (doc.versions || []).length;
    row.realm = doc.realm === "reader" ? "reader" : "creator";   // HERESY 2480
    row.hay = [doc.title, doc.style, doc.lyrics, doc.notes].join("\n");
    state.docs.sort(function (a, b) { return (b.updated || 0) - (a.updated || 0); });
    paintList();
  }

  // ---- Create, both ways
  function fromCreate(asNew) {
    var f = state.hooks.form(), hand = recall(HAND_KEY);
    var id = asNew ? null : hand;
    var body = { op: "put", title: f.title || "Untitled", style: f.style, lyrics: f.lyrics, params: f.params };
    if (id) body.id = id;
    return flush().then(function () { return api(body); }).catch(function (e) {
      if (id && /no such document/.test(e.message)) { store(HAND_KEY, null); delete body.id; return api(body); }
      throw e;
    }).then(function (doc) {
      store(HAND_KEY, doc.id);
      toast((id ? "Saved to “" : "A new document in the Writer: “") + doc.title + "”" + (id ? " (the version before is kept)" : ""));
      if (state.doc && state.doc.id === doc.id) { state.doc = doc; state.dirty = false; paintDoc(); }
      return loadList().then(function () { return doc; });
    }).catch(function (e) { toast(e.message, true); });
  }
  function intoCreate(doc) {   // HERESY 1167: true when the document went into the Creator
    if ((doc.lyrics || "").length > LYR_MAX) {           // HERESY 2480: its «Save to Writer» would bring back a cut text: said, and nothing loaded
      return window.HeresyDialog.alert("“{0}” is {1} characters long; the Musician's lyrics hold 10 000.\n\nA reading goes to the Narrator: Read in the Narrator. Nothing was put into the Musician."
        .replace("{0}", doc.title).replace("{1}", (doc.lyrics || "").length.toLocaleString())).then(function () { return false; });
    }
    var f = state.hooks.form(), hand = recall(HAND_KEY);
    var busy = (f.lyrics || "").trim() && f.lyrics !== doc.lyrics && hand !== doc.id;
    (busy ? window.HeresyDialog.confirm("Put “" + doc.title + "” into the Musician?\n\nThe title, style and lyrics there now are replaced" +
        (hand ? " (they belong to another document in the Writer, which keeps them)." : ". They are in no document: “Save to Writer” first, if they matter."), { ok: "Put it in the Musician" }) : Promise.resolve(true)).then(function (ok) {
      if (!ok) return false;
      state.hooks.load(doc);
      store(HAND_KEY, doc.id);
      paintList(); paintHand();
      if (state.doc && state.doc.id === doc.id) $("wrHandBtn").textContent = "In hand in the Musician ✎";
      toast("“" + doc.title + "” is in the Musician; what is made from it is linked to it");
      return true;
    });
  }
  function paintHand() {
    var id = recall(HAND_KEY), d = state.docs.filter(function (x) { return x.id === id; })[0];
    if (id && !d && state.listOk) store(HAND_KEY, null);   // gone from the notebook (an unanswered lab clears nothing)
    $("wrHandName").textContent = d ? d.title : "";
    $("wrHandBox").classList.toggle("is-on", !!d);
    // HERESY 2542 (the UIX audit of 13.11.2026, №25): an icon in the Musician's Writer card now; its words its label and its tip
    $("wrHandSave").setAttribute("aria-label", d ? "Save to Writer" : "Save to Writer…");
    $("wrHandSave").dataset.tip = d ? "Save the song as it is now into “" + d.title + "” (the version before is kept)" : "Keep the song as it is now (title, style, lyrics and every knob) as a document in the Writer";
    var pick = $("wrHandPick");
    pick.innerHTML = '<option value="">From the Writer…</option>' + state.docs.slice(0, 60).map(function (x) {
      return '<option value="' + esc(x.id) + '" translate="no">' + esc(x.title) + "</option>";   // HERESY 1339: a document's title
    }).join("");
  }

  // takes made while a document is in hand
  // HERESY 2493 (Viktor 12.11.2026: «СЕМПЛЫ ИЗ НЕЁ Абба почему-то высветился»: an «Абба» take sat under «Крик v4.3.0.1», made while Крик was in
  // hand with Абба's words typed into the Musician): a take links to the document in hand only when it is the same song (its title, versions aside)
  function landed(names, title) {
    var id = recall(HAND_KEY);
    if (!id || !names || !names.length) return;
    var row = state.docs.filter(function (d) { return d.id === id; })[0];
    if (row && title && groupKey(title) !== groupKey(row.title || "")) {
      toast(tr("Not linked to “{0}”: the take is another song (“{1}”)").replace("{0}", row.title).replace("{1}", title));
      return;
    }
    api({ op: "link", id: id, takes: names }).then(function (doc) {
      if (state.doc && state.doc.id === doc.id) { state.doc.takes = doc.takes; paintTakes(); }
      patchListRow(doc);
    }).catch(function () { /* the takes stay in the library either way */ });
  }

  // ---- HERESY 2482 (the writer audit of 12.11.2026, item 13): what is shown (now, or a version) against any of its versions, another version
  // of the same song (a document of its group, 2479) or any other document; the style and the lyrics line by line, the rest folded. The
  // Musician's Versions give the diff (HeresyVersions.diff); 2477 shows a version against now by itself
  var cmp = { on: false, pick: "" };
  function paintCompare() {
    var box = $("wrCompare"), sel = $("wrCompareWith"), doc = state.doc;
    if (!box) return;
    box.hidden = !cmp.on || !doc;
    if (!cmp.on || !doc) return;
    var key = groupKey(doc.title), vs = doc.versions || [], kin = [], rest = [];
    state.docs.forEach(function (d) { if (d.id !== doc.id) (groupKey(d.title) === key ? kin : rest).push(d); });
    kin.sort(verCmp); rest.sort(function (a, b) { return stamp(b, "updated") - stamp(a, "updated"); });
    var opt = function (v, t, off) { return '<option value="' + esc(v) + '"' + (off ? " disabled" : "") + (v === cmp.pick ? " selected" : "") + ">" + esc(t) + "</option>"; };
    var html = opt("", "Pick what to compare with", true);
    if (state.view !== null) html += opt("now", "the document now");
    if (vs.length) html += opt("-v", "— its versions —", true) + vs.map(function (v, i) { return { v: v, i: i }; }).reverse().filter(function (x) { return x.i !== state.view; })
      .map(function (x) { return opt("v:" + x.i, when(x.v.at) + (x.v.label ? " — " + x.v.label : "")); }).join("");
    if (kin.length) html += opt("-k", "— the same song —", true) + kin.map(function (d) { return opt("d:" + d.id, d.title); }).join("");
    if (rest.length) html += opt("-r", "— other documents —", true) + rest.map(function (d) { return opt("d:" + d.id, d.title); }).join("");
    sel.innerHTML = html;
    if (!sel.value) cmp.pick = "";
    if (!cmp.pick) { $("wrCompareSay").textContent = ""; $("wrCompareName").textContent = ""; $("wrCompareBody").innerHTML = ""; return; }
    var mine = state.view !== null ? vs[state.view] : fields(), p = cmp.pick;
    var other = p === "now" ? Promise.resolve(fields()) : p.slice(0, 2) === "v:" ? Promise.resolve(vs[+p.slice(2)]) : api(undefined, p.slice(2));
    other.then(function (o) {
      if (cmp.pick !== p || !o) return;
      var D = window.HeresyVersions && window.HeresyVersions.diff, rows = [], changed = 0;
      [["Style", o.style, mine.style], ["Lyrics", o.lyrics, mine.lyrics]].forEach(function (part) {
        var d = D ? D(String(part[1] || "").split(/\r?\n/), String(part[2] || "").split(/\r?\n/)) : null;
        if (!d) { rows.push('<div class="dl-gap">' + esc(tr(part[0])) + ": " + esc(tr("too long to compare line by line")) + "</div>"); return; }
        var near = d.map(function (x, k) { for (var q = Math.max(0, k - 1); q <= Math.min(d.length - 1, k + 1); q++) if (d[q][0]) return true; return false; });
        var gap = false, na = 0, nb = 0;
        d.forEach(function (x, k) {
          if (x[0] <= 0) na++;
          if (x[0] >= 0) nb++;
          if (x[0]) changed++;
          if (!near[k]) { gap = true; return; }
          if (gap) { rows.push('<div class="dl-gap">…</div>'); gap = false; }
          rows.push('<div class="dl' + (x[0] < 0 ? " dl-del" : x[0] > 0 ? " dl-add" : "") + '"><span class="dl-n">' + esc(tr(part[0])) + " " +
            (x[0] < 0 ? na + " −" : x[0] > 0 ? nb + " +" : nb) + "</span>" + (esc(x[1]) || " ") + "</div>");
        });
      });
      $("wrCompareName").textContent = p === "now" ? tr("the document now") : p.slice(0, 2) === "v:" ? when(o.at) + (o.label ? " — " + o.label : "") : o.title;
      $("wrCompareSay").textContent = changed ? "Lines that differ: " + changed : "The style and the lyrics are the same";
      $("wrCompareBody").innerHTML = changed ? rows.join("") : "";
    }).catch(function (e) { $("wrCompareSay").textContent = e.message; });
  }

  // ---- HERESY 2481 (the writer audit of 12.11.2026, item 14): every answer of the Writing room kept in the notebook, with its brief, task, model, time
  // and raw answer, a list per document (and one for the Musician's song): the list under the room follows where the room writes (2471), and
  // Reopen puts a kept draft back on the page as it came, to apply as then (app.js: ruachReopenDraft). Nothing is lost at the next Send
  var hist = { key: null, list: [] };
  function histKey() { var t = window.ruachWriteTarget ? window.ruachWriteTarget() : null; return t && t.kind === "doc" && t.id ? t.id : "song"; }
  function histLoad(force) {
    if (!$("assistHistory")) return Promise.resolve();
    var key = histKey();
    if (!force && key === hist.key) return Promise.resolve();
    hist.key = key;
    return api({ op: "drafts", id: key === "song" ? "" : key }).then(function (d) { if (hist.key === key) { hist.list = d.drafts || []; histPaint(); } })
      .catch(function (e) { if (hist.key === key) { hist.list = []; histPaint(e.message); } });
  }
  function histPaint(failed) {
    var taskName = function (v) { var o = document.querySelector('#assistTask option[value="' + v + '"]'); return o ? o.textContent : v; };
    $("assistHistoryN").textContent = hist.list.length ? "(" + hist.list.length + ")" : "";
    $("assistHistorySay").textContent = hist.key === "song" ? "Drafts kept for the Musician's song" : "Drafts kept for this document";
    $("assistHistoryList").innerHTML = failed ? '<p class="row-hint">' + esc("The notebook did not answer: " + failed) + "</p>"
      : !hist.list.length ? '<p class="row-hint">None yet: every answer of the writer is kept here with its brief, model and time.</p>'
      : hist.list.map(function (r, i) { return { r: r, i: i }; }).reverse().map(function (x) {
        var r = x.r, d = r.draft, badge = function (t) { return '<span class="ah-badge">' + esc(t) + "</span>"; };
        return '<div class="ah-row" data-ah="' + x.i + '"><div class="ah-head"><span class="ah-when">' + esc(when(r.at)) + "</span>" +
          '<span class="ah-model mono" translate="no">' + esc(r.model || "") + (r.seconds ? " · " + Math.round(r.seconds) + " s" : "") + "</span>" +
          (r.task ? '<span class="ah-task">' + esc(taskName(r.task)) + "</span>" : "") +
          (!d ? badge("no draft") : r.blank ? badge("empty") : "") + (r.cut ? badge("cut at the limit") : "") + '<span class="spacer"></span>' +
          (d && !r.blank ? '<button type="button" class="btn ghost small" data-ah-open="' + x.i + '">Reopen</button>' : "") +
          '<button type="button" class="btn ghost small" data-ah-raw="' + x.i + '">Raw response</button></div>' +
          '<p class="ah-brief" translate="no">' + esc((r.brief || "").slice(0, 400)) + (d && d.title ? " → " + esc(d.title) : "") + "</p>" +
          '<pre class="mono ah-raw" translate="no" hidden></pre></div>';
      }).join("");
  }
  function draftAnswered(r) {
    var key = r.target === "doc" && r.doc ? r.doc : "song";
    return api({ op: "draft", id: key === "song" ? "" : key, draft: r }).then(function (d) { if (hist.key === key) { hist.list = d.drafts || []; histPaint(); } })
      .catch(function (e) { toast("The draft was not kept in the notebook: " + e.message, true); });
  }

  function init(hooks) {
    state.hooks = hooks;
    // HERESY 1268 (Viktor 09.10.2026: «В комнате Писателя дай возможность регулировать ширину левой колонки со списком документов»): the
    // documents column's edge dragged (its width kept in this browser), ← → from the keyboard, Home or a double click for its own 280 px
    (function () {
      var book = document.querySelector(".wr-book"), rz = $("wrResizer"), side = document.querySelector(".wr-side");
      if (!book || !rz || !side) return;
      var KEY = "yue2.wrSideW", MIN = 360, MAX = 420, DEF = 380;   // HERESY 2490 (Viktor 12.11.2026: «можно спокойно удерживать в пределах 360-420 пикселов»)
      function setW(w) { w = Math.max(MIN, Math.min(MAX, Math.round(w))); book.style.setProperty("--wr-side-w", w + "px"); rz.setAttribute("aria-valuenow", String(w)); return w; }
      rz.setAttribute("aria-valuemin", String(MIN)); rz.setAttribute("aria-valuemax", String(MAX));
      setW(parseInt(recall(KEY), 10) || DEF);
      rz.addEventListener("pointerdown", function (e) {
        if (e.button !== 0) return;
        e.preventDefault();
        rz.setPointerCapture(e.pointerId);
        rz.classList.add("is-drag"); document.body.classList.add("is-resizing");
        var x0 = e.clientX, w0 = side.getBoundingClientRect().width;
        function move(ev) { setW(w0 + ev.clientX - x0); }
        function up() {
          rz.classList.remove("is-drag"); document.body.classList.remove("is-resizing");
          rz.removeEventListener("pointermove", move); rz.removeEventListener("pointerup", up); rz.removeEventListener("pointercancel", up);
          store(KEY, String(Math.round(side.getBoundingClientRect().width)));
        }
        rz.addEventListener("pointermove", move); rz.addEventListener("pointerup", up); rz.addEventListener("pointercancel", up);
      });
      rz.addEventListener("dblclick", function () { store(KEY, null); setW(DEF); });
      rz.addEventListener("keydown", function (e) {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); e.stopPropagation(); store(KEY, String(setW(side.getBoundingClientRect().width + (e.key === "ArrowRight" ? 16 : -16)))); }
        else if (e.key === "Home") { e.preventDefault(); e.stopPropagation(); store(KEY, null); setW(DEF); }
      });
    })();
    $("wrSearch").addEventListener("input", function () { state.q = this.value; paintList(); });
    $("wrList").addEventListener("click", function (e) {
      var g = e.target.closest("[data-group]"), u = e.target.closest("[data-untrash]");
      if (g) {                                           // HERESY 2479: a group unfolded or folded, kept in this browser
        var k = g.dataset.group;
        if (state.openGroups[k] || g.getAttribute("aria-expanded") === "true") delete state.openGroups[k]; else state.openGroups[k] = 1;
        store("yue2.wrOpenGroups", JSON.stringify(state.openGroups));
        return paintList();
      }
      if (e.target.closest("[data-trash-back]")) { state.trashView = false; return paintList(); }
      if (u) {                                           // HERESY 2479: back from the trash, opened
        return api({ op: "untrash", id: u.dataset.untrash }).then(function (d) {
          state.docs = d.docs || state.docs; state.trashView = false;
          toast("Restored from the trash: “{0}”".replace("{0}", d.doc.title));
          return open(d.doc.id);
        }).catch(function (er) { toast(er.message, true); });
      }
      var b = e.target.closest("[data-doc]"); if (b) open(b.dataset.doc);
    });
    $("wrRecent").addEventListener("click", function (e) { var b = e.target.closest("[data-doc]"); if (b) open(b.dataset.doc.split("|")[0]); });   // HERESY 1858, 2479
    // HERESY 2479: the list's sort, filter, grouping and trash
    $("wrSort").addEventListener("change", function () { state.sort = this.value; store("yue2.wrSort", state.sort === "changed" ? null : state.sort); paintList(); });
    $("wrFilter").addEventListener("change", function () { state.filter = this.value; store("yue2.wrFilter", state.filter === "all" ? null : state.filter); paintList(); });
    // HERESY 2568 (the UIX audit, item 55): the order and the filter from the bar's icons, the hidden selects' own choices in a menu (the Librarian's way)
    ["wrSortBtn", "wrFilterBtn"].forEach(function (id) {
      var b = $(id);
      if (b) b.addEventListener("click", function () {
        var sel = $(id === "wrSortBtn" ? "wrSort" : "wrFilter"), r = b.getBoundingClientRect();
        if (!window.HeresyMenu || b.disabled) return;
        window.HeresyMenu.open(r.left, r.bottom + 4, Array.prototype.map.call(sel.options, function (o) {
          return { label: o.textContent, checked: o.value === sel.value, action: function () { sel.value = o.value; sel.dispatchEvent(new Event("change")); } };
        }));
      });
    });
    $("wrGroupBtn").addEventListener("click", function () { state.group = !state.group; store("yue2.wrGroup", state.group ? null : "0"); paintList(); });
    $("wrTrashBtn").addEventListener("click", function () { state.trashView = !state.trashView; if (state.trashView) loadTrash(); else paintList(); });
    // HERESY 2480: the document's world, the limits it brings, and «Read in the Narrator» making a document of no world yet a reading
    $("wrRealm").addEventListener("click", function (e) { var b = e.target.closest("[data-realm]"); if (b && !b.disabled) setRealm(b.dataset.realm); });
    guardLong($("wrLyrics"), function (text, room) {
      window.HeresyDialog.confirm("The text pasted is {0} characters; the lyrics have room for {1} more (a song's lyrics hold 10 000, as the Musician's), so {2} would be cut.\n\nA reading for the Narrator has no limit. Keep it whole as a reading?"
        .replace("{0}", text.length.toLocaleString()).replace("{1}", room.toLocaleString()).replace("{2}", (text.length - room).toLocaleString()),
        { ok: "Keep it whole as a reading", alt: "Cut to 10 000", cancel: "Cancel" }).then(function (yes) {
        if (yes === "alt") cutSaid($("wrLyrics"), text, room);
        else if (yes) setRealm("reader", true).then(function () { insertText($("wrLyrics"), text); toast("Kept whole: a reading for the Narrator now, with no limit"); });
      });
    });
    if ($("lyrics")) guardLong($("lyrics"), function (text, room) { cutSaid($("lyrics"), text, room); });
    document.addEventListener("click", function (e) {
      if (e.target.closest("#wrToReader") && state.doc && !state.doc.realm && state.view === null) setRealm("reader", true).then(function (doc) {
        if (doc) toast("“{0}” is a reading for the Narrator now (no length limit); the switch by its title turns it back".replace("{0}", doc.title));
      });
    });
    // HERESY 2482: Compare
    $("wrCompareBtn").addEventListener("click", function () { cmp.on = !cmp.on; if (!cmp.on) cmp.pick = ""; paintCompare(); if (cmp.on) $("wrCompareWith").focus(); });
    $("wrCompareClose").addEventListener("click", function () { cmp.on = false; cmp.pick = ""; paintCompare(); });
    $("wrCompareWith").addEventListener("change", function () { cmp.pick = this.value; paintCompare(); });
    // HERESY 2481: the kept drafts follow where the room writes; Reopen and the raw answer
    if ($("assistHistory")) {
      setInterval(function () { if (!$("view-write").classList.contains("is-hidden")) histLoad(false); }, 2000);
      $("assistHistory").addEventListener("toggle", function () { if (this.open) histLoad(true); });
      $("assistHistoryList").addEventListener("click", function (e) {
        var o = e.target.closest("[data-ah-open]"), w = e.target.closest("[data-ah-raw]");
        if (o) {
          if (histKey() !== hist.key) { histLoad(true); return toast("The room writes elsewhere now: its own drafts are listed", true); }
          var r = hist.list[+o.dataset.ahOpen];
          if (r && window.ruachReopenDraft && window.ruachReopenDraft(r)) toast("The draft of {0} is back on the page; nothing changes until you apply it".replace("{0}", when(r.at)));
        }
        if (w) {
          var pre = w.closest(".ah-row").querySelector(".ah-raw"), rr = hist.list[+w.dataset.ahRaw];
          pre.hidden = !pre.hidden;
          if (!pre.hidden) pre.textContent = (rr && rr.raw) || "";
        }
      });
    }
    $("wrNew").addEventListener("click", function () {
      flush().then(function () { return api({ op: "put", title: "Untitled", realm: state.filter === "reader" ? "reader" : undefined }); })   // HERESY 2480: in the readings' list, a reading
        .then(function (doc) { return loadList().then(function () { return open(doc.id); }); })
        .then(function () { $("wrTitle").select(); }).catch(function (e) { toast(e.message, true); });
    });
    $("wrFromCreate").addEventListener("click", function () { fromCreate(true).then(function (doc) { if (doc) open(doc.id); }); });
    // HERESY 1168 (Viktor 07.10.2026: «глобальный экспорт/импорт всех данных скопом для бекапа»): the whole notebook in one
    // file and back. Both ways the file stays text in the page: a seed of 19 digits in a document's knobs would come out
    // rounded through the browser's numbers, so the export is saved as the lab wrote it and the import goes as it was read.
    var backupUrl = "/lab/writer" + (SCOPE ? "?scope=" + encodeURIComponent(SCOPE) : "");
    var post = function (text) {
      return fetch(backupUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: text }).then(function (r) {
        return r.text().then(function (t) {
          if (!r.ok) { var e; try { e = JSON.parse(t).error; } catch (x) { e = r.status; } throw new Error(e); }
          return t;
        });
      });
    };
    $("wrExport").addEventListener("click", function () {
      flush().then(function () { return post('{"op": "export"}'); }).then(function (text) {
        var d = new Date(), two = function (n) { return (n < 10 ? "0" : "") + n; };
        var name = "ruach-writer-backup-" + d.getFullYear() + two(d.getMonth() + 1) + two(d.getDate()) + "-" + two(d.getHours()) + two(d.getMinutes()) + ".json";
        var b = JSON.parse(text), a = document.createElement("a");          // parsed only to count
        a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
        var cv = b.creator_versions || [];                  // HERESY 1522: the Creator's versions in the same file
        toast(cv.length ? tr("Writer backup: {0} documents and {1} in the trash, the Musician's versions of {2} titles, into {3}").replace("{0}", (b.docs || []).length)
          .replace("{1}", (b.trash || []).length).replace("{2}", cv.length).replace("{3}", name)
          : tr("Writer backup: {0} documents and {1} in the trash, into {2}").replace("{0}", (b.docs || []).length)
          .replace("{1}", (b.trash || []).length).replace("{2}", name));
      }).catch(function (e) { toast(e.message, true); });
    });
    $("wrImport").addEventListener("click", function () { $("wrImportFile").click(); });
    $("wrImportFile").addEventListener("change", function () {
      var f = this.files[0];
      this.value = "";
      if (!f) return;
      f.text().then(function (text) {
        if (!/^\s*\{/.test(text)) throw new Error(tr("not a Writer backup (a file this room exported)"));
        return flush().then(function () { return post('{"op": "import", "backup": ' + text + "}"); });
      }).then(function (t) {
        var d = JSON.parse(t), n = d.imported || {};
        state.docs = d.docs || state.docs;
        paintList();
        paintHand();
        var cv = n.creator_versions;                         // HERESY 1522: and the Creator's versions it brought
        toast(tr("Writer backup {0}: {1} new, {2} already here, {3} beside their namesakes as copies, {4} into the trash")
          .replace("{0}", f.name).replace("{1}", n.added || 0).replace("{2}", n.same || 0).replace("{3}", n.copies || 0).replace("{4}", n.trashed || 0) +
          (cv ? " \u00b7 " + tr("the Musician's versions: {0} new, {1} titles new").replace("{0}", cv.versions || 0).replace("{1}", cv.titles || 0) : ""));
      }).catch(function (e) { toast(tr("Not imported: {0}").replace("{0}", e.message), true); });
    });
    ["wrTitle", "wrStyle", "wrLyrics", "wrNotes"].forEach(function (id) { $(id).addEventListener("input", changed); });
    $("wrDoc").addEventListener("keydown", function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); flush().then(function () { toast("Saved"); }); }
    });
    window.addEventListener("beforeunload", function (e) { if (state.dirty) { flush(); e.preventDefault(); e.returnValue = ""; } });
    $("wrNotesMode").addEventListener("click", function () { state.preview = !state.preview; paintNotes(); });
    $("wrParamsTake").addEventListener("click", function () {
      if (!state.doc) return;
      var p = state.hooks.form().params;
      flush().then(function () { return api({ op: "put", id: state.doc.id, params: p }); })
        .then(function (doc) { state.doc = doc; paintDoc(); toast("PARAMS taken from the Musician (the version before is kept)"); }).catch(function (e) { toast(e.message, true); });
    });
    $("wrParamsShow").addEventListener("click", function () {
      var pre = $("wrParamsJson");
      pre.hidden = !pre.hidden;
      if (!pre.hidden) pre.textContent = JSON.stringify((state.view !== null ? state.doc.versions[state.view] : state.doc).params || {}, null, 1);
    });
    $("wrHandBtn").addEventListener("click", function () { if (state.doc) flush().then(function () { intoCreate(state.doc); }); });
    $("wrKeep").addEventListener("click", function () {
      if (!state.doc) return;
      window.HeresyDialog.prompt("Keep this version\n\nA few words to know it by (or none).", "", { ok: "Keep it", placeholder: "the chorus works now" }).then(function (label) {
        if (label === null) return;
        return flush().then(function () { return api({ op: "snapshot", id: state.doc.id, label: label.trim() }); })
          .then(function (doc) { state.doc = doc; paintVersions(); patchListRow(doc); toast("Version kept"); });
      }).catch(function (e) { toast(e.message, true); });
    });
    $("wrDelete").addEventListener("click", function () {
      if (!state.doc) return;
      var id = state.doc.id;
      window.HeresyDialog.confirm("Delete “" + state.doc.title + "” from the notebook?\n\nIt goes to writer/.trash on Forge, with its versions; the takes stay in the library.", { danger: true }).then(function (ok) {
        if (!ok) return;
        clearTimeout(state.timer); state.dirty = false;
        return api({ op: "delete", id: id }).then(function (d) {
          if (recall(HAND_KEY) === id) store(HAND_KEY, null);
          state.doc = null; state.docs = d.docs || []; paintDoc(); paintList(); paintHand(); toast("Deleted: the list's Trash brings it back");   // HERESY 2479
        });
      }).catch(function (e) { toast(e.message, true); });
    });
    $("wrVersions").addEventListener("click", function (e) {
      var b = e.target.closest("[data-ver]");
      if (!b) return;
      flush().then(function () { var i = +b.dataset.ver; state.view = state.view === i ? null : i; paintDoc(); });
    });
    $("wrVersionBack").addEventListener("click", function () { state.view = null; paintDoc(); });
    $("wrVersionRestore").addEventListener("click", function () {
      var i = state.view;
      if (i === null) return;
      api({ op: "restore", id: state.doc.id, version: i }).then(function (doc) {
        state.doc = doc; state.view = null; paintDoc(); patchListRow(doc); toast("Version restored (the one before it is kept too)");
      }).catch(function (e) { toast(e.message, true); });
    });
    $("wrVersionCopy").addEventListener("click", function () {
      var v = state.doc.versions[state.view];
      if (!v) return;
      api({ op: "put", title: (v.title || "Untitled") + " (copy)", style: v.style, lyrics: v.lyrics, notes: v.notes, params: v.params })
        .then(function (doc) { return loadList().then(function () { return open(doc.id); }); }).catch(function (e) { toast(e.message, true); });
    });
    $("wrTakes").addEventListener("click", function (e) {
      var row = e.target.closest("[data-take]");
      if (!row) return;
      var name = row.dataset.take, h = state.hooks;
      if (e.target.closest("[data-wr-play]")) { var t = h.findTake(name); if (t) h.playNow(t); return; }
      var go = e.target.closest("[data-wr-go]");
      if (go) h.openTake(name, go.dataset.wrGo);
      if (e.target.closest("[data-wr-unlink]") && state.doc) {   // HERESY 2493
        var id = state.doc.id;
        api({ op: "unlink", id: id, takes: [name] }).then(function (doc) {
          if (state.doc && state.doc.id === doc.id) { state.doc.takes = doc.takes; paintTakes(); }
          patchListRow(doc); toast(tr("Taken off this document; the take stays in the Library"));
        }).catch(function (e2) { toast(e2.message, true); });
      }
    });
    // in the Creator: the document in hand
    $("wrHandSave").addEventListener("click", function () { fromCreate(false); });
    $("wrHandOpen").addEventListener("click", function () { var id = recall(HAND_KEY); if (id) open(id); });
    $("wrHandDrop").addEventListener("click", function () { store(HAND_KEY, null); paintHand(); paintList(); if (state.doc) paintDoc(); toast("Nothing in hand: new takes link to no document"); });
    $("wrHandPick").addEventListener("change", function () {
      var id = this.value; this.value = "";
      if (id) api(undefined, id).then(intoCreate).catch(function (e) { toast(e.message, true); });
    });
    loadList();
  }

  window.HeresyWriter = { init: init, landed: landed, reload: loadList, open: open, fromCreate: fromCreate, md: md, flush: flush,   // HERESY 1269: Ctrl+S
                          // HERESY 2490 (Viktor 12.11.2026: «С открытой карточки переход на изначальный чистый канвас»): the document closed, the start canvas back
                          close: function () { state.leaving = true; return flush().then(function () { state.leaving = false; state.doc = null; state.view = null; state.cutHeld = false; paintCut(null); paintDoc(); paintList(); },
                            function (e) { state.leaving = false; toast(e.message, true); }); },
                          // HERESY 1167: the document open in the notebook, and putting one into the Creator (for the writing room)
                          openDoc: function () { return state.doc || null; }, inHand: function () { return recall(HAND_KEY) || ""; },
                          putInCreator: function (doc) { return flush().then(function () { return intoCreate(doc); }); },
                          saveTake: function (doc) { return api(Object.assign({ op: "put" }, doc)).then(function (d) { loadList(); return d; }); },
                          // HERESY 2471 (Viktor 12.11.2026: «Документ, если не взято из песни Музыканта»): the Writing room writes into the open document:
                          // its fields as they stand (unsaved typing too; none while a version is shown), and a draft put into it, the version before
                          // kept under a label (a save, never an autosave)
                          docFields: function () { return state.doc && state.view === null ? fields() : null; },
                          applyDraft: function (f, id) {
                            if (!state.doc || state.doc.id !== id || state.view !== null) return Promise.reject(new Error("The document the draft was written for is not open in the notebook now"));
                            return flush().then(function () {
                              return api(Object.assign({ op: "put", id: id, label: "before the Writing room's draft" }, fields(), f));
                            }).then(function (doc) { state.doc = doc; state.dirty = false; state.view = null; paintDoc(); patchListRow(doc); return doc; });
                          },
                          draftAnswered: draftAnswered,   // HERESY 2481: the Writing room's every answer, kept
                          link: function (id, names) { return api({ op: "link", id: id, takes: names }); } };
})();
