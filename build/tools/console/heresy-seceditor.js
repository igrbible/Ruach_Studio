// HERESY 2810 (Viktor 18.11.2026: «Редактор по секциям делай на 2.1.0 как описал.»; his choices on the mockup of that day: no Simple mode, no Move,
// the editor in the Musician since its edits are regenerations, an overlay over the whole room): the Section editor. Every section edit lived in the
// take's menu one at a time, each a job and a take of its own. Here the song is a strip of its sections, the very ones the player's wave shows (the
// lyrics' tags placed by Whisper, the breaks where no voice sings, else the score's marks), their names in English capitals; a click picks one (← →
// walk them, Space plays it), and the eight edits the menu has are under the strip: Replace this section (1414), Re-sing this line (1718), Sing it
// once more (1715), Insert an interlude (1717), Repeat a section (1714), Remove a section (1356), Re-sing from here to the end (2690) and Extend
// (1651), each asking only what its own dialog asks and greyed with its reason where it cannot be had. What is added waits in a queue in the song's
// order, one edit a section, each with ✕; Assemble the take sends the queue to the lab as one job (POST /lab/section/chain, 2811) and follows it
// step by step; the take itself is never touched. The queue is kept per take (yue2.secQueue.<take>, mirrored into user/settings.json).
(function () {
  "use strict";
  var H = null;
  var FPS = 25, MAX_LEN = 900, MAX_ALL = 12, MAX_SUNG = 8, MAX_SING = 600;   // HERESY 2942: Extend sings on to 10:00 at most
  // HERESY 2887 (Viktor 20.11.2026 on §19 №3): the ninth, Insert a part (1714's other half): a copy of one of the score's parts put in after the block, on
  // its last part's bar line. It sits in the gap after the block, not on it, so the block keeps an edit of its own in the same assembly («replace the
  // bridge and insert an interlude after it»); the lab lays it in with Repeat and Remove (E's pass), nothing sung
  var OPS = ["replace", "line", "once", "interlude", "copy", "remove", "insert", "from", "extend"];
  var ICON = { replace: "refresh-cw", line: "mic", once: "repeat", interlude: "music", copy: "copy", remove: "scissors", insert: "list-plus", from: "redo-2", extend: "to-right" };
  var LABEL = { replace: "Replace this section…", line: "Re-sing this line…", once: "Sing it once more…", interlude: "Insert an interlude after it…",
    copy: "Repeat a section…", remove: "Remove a section…", insert: "Insert a part after it…", from: "Re-sing from here to the end…", extend: "Extend…" };
  var HEAD = { replace: "Replace a section", line: "Re-sing a line", once: "Sing it once more", interlude: "Insert an interlude", copy: "Repeat a section",
    remove: "Remove a section", insert: "Insert a part", from: "Re-sing from here to the end", extend: "Extend" };
  var SAY = { replace: "Its words changed or kept, sung anew on a new music seed; the rest stays", line: "One line sung anew, cut halfway to the lines around it",
    once: "The section once more right after itself: a variation on the music seed + 1", interlude: "Music the model writes after the section, nothing sung again",
    copy: "A copy of the parts right after them, on the score's bar lines, in seconds", remove: "The parts taken out on the score's bar lines, in seconds",
    insert: "A copy of one of the score's parts put in after this section, on its bar line, in seconds; the section itself may keep an edit of its own",
    from: "Everything before the break before it stays; from there to the end the song is sung anew", extend: "The music goes on past the take's end, with new lines or without" };
  var SUNG = { replace: 1, line: 1, once: 1, interlude: 1, from: 1, extend: 1 }, EAR = { replace: 1, line: 1, once: 1, interlude: 1, from: 1 };
  var A_OPS = { replace: 1, line: 1 }, B_OPS = { once: 1, interlude: 1 }, CUTS = { copy: 1, remove: 1 }, ENDS = { from: 1, extend: 1 };
  var KEY = "yue2.secQueue.", KEEP_TAKES = 5;
  var ONCE_GAPS = [["0", "Straight on", "its lines again at once"], ["4", "After a breath", "about 4 s of music first"], ["7", "After a short interlude", "about 7 s of music first"]];
  var INTER_GAPS = [["5", "About 5 seconds", "a short bridge"], ["7", "About 7 seconds", "time to turn the mood"], ["10", "About 10 seconds", "a passage of its own"]];
  // the overlays of the page that stand over the editor: its keys step aside while any shows (app.js keeps the same list for Shift+Tab and Esc)
  var OVER = ".hd-back, .menu-pop:not(.is-hidden), .hm-menu, .hz-view, .ds-back, .hi-back, .cmp-back, .hg-back, .dw-back, .coll-sheet, .find-bar, .tc-pop";
  var st = { open: false, name: "", take: null, list: [], how: "", blocks: [], pick: -1, form: null, drafts: {}, queue: [], score: null, rests: null,
    codes: null, codesWhy: null, chain: null, done: [], raf: 0, stopAt: null, len: 0, peaks: null, back: null, prev: null, inertEl: null, obs: null,
    follow: {}, n: 0, why: "", lift: 0, said: {} };

  function $(id) { return document.getElementById(id); }
  function tr(s) { return window.RuachI18n && window.RuachI18n.t ? window.RuachI18n.t(s) : s; }
  function fmt(s) { var a = arguments; return tr(s).replace(/\{#?(\d)\}/g, function (m, i) { return a[+i + 1] != null ? a[+i + 1] : m; }); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function ico(n) { return window.HeresyIcons ? window.HeresyIcons.ui(n) : ""; }
  function clock(t) { return H ? H.clock(Math.max(0, t || 0)) : String(Math.round(t || 0)); }
  function tenth(t) { t = Math.max(0, +t || 0); var m = Math.floor(t / 60), s = t - m * 60; return m + ":" + (s < 9.95 ? "0" : "") + s.toFixed(1); }
  function span(a, b) { return clock(a) + "–" + clock(b); }
  function mono(text) { return '<span class="mono" translate="no">' + esc(text) + "</span>"; }
  function raw(text) { return '<b class="se-name" translate="no">' + esc(text) + "</b>"; }
  function round2(t) { return Math.round(t * 100) / 100; }
  function ov(x, y) { return Math.min(x[1], y[1]) - Math.max(x[0], y[0]); }
  function tags(text) { return (String(text || "").match(/^\s*\[[^\]\n]+\]/gm) || []).length; }

  // ------------------------------------------------------------------ the sections, as the player's wave lays them
  function itemEnd(i) { return i + 1 < st.list.length ? st.list[i + 1].t : st.len; }
  function heardRows(item) { return (item.rows || []).filter(function (r) { return !r.guessed; }); }
  function makeBlocks() {
    var take = st.take, list = st.list;
    st.blocks = list.map(function (item, i) {
      var a = +item.t || 0, b = Math.max(a, itemEnd(i)), cut = null, occ = 0, blk = null;
      try { cut = item.resumed ? null : H.cut(list, i); } catch (e) { cut = null; }
      try { occ = H.occ(list, i); } catch (e) { occ = 0; }
      if (cut) { try { blk = H.lyricBlock(take.lyrics, item.name, item.lines, occ); } catch (e) { blk = null; } }
      var rows = item.rows || [], heard = heardRows(item).length, inst = !(item.lines || []).length || item.heard === "no voice";
      return { i: i, item: item, name: String(item.name || ""), a: a, b: b, cut: cut, occ: occ, blk: blk, heard: heard, nlines: (item.lines || []).length,
        inst: inst, unheard: !!item.unheard, resumed: !!item.resumed, lines: rows.length ? [rows[0].start, rows[rows.length - 1].end] : null };
    });
  }
  function readSections(then) {
    var take = st.take, mine = H.sections(st.name);
    if (mine && mine.list && mine.list.length) { st.list = mine.list.slice(); st.how = mine.how || (st.list.some(function (s) { return s.rows; }) ? "ear" : "score"); return then(); }
    // with the wave's ear off (1498) or the wave not laid yet: the same function the wave uses, cached reads only, no Whisper
    H.takeSections(take, function () { return st.len || take.seconds || 0; }).then(function (x) {
      if (!st.open || st.take !== take) return;
      st.list = (x && x.list) || []; st.how = (x && x.how) || "";
      then();
    }, function () { if (st.open && st.take === take) { st.list = []; st.how = ""; then(); } });
  }
  function sig() { return st.how + "|" + st.list.map(function (s) { return s.name + "@" + (+s.t).toFixed(2); }).join(","); }

  // ------------------------------------------------------------------ what each edit needs
  function lineRows(b) {             // the block's lines as Re-sing a line offers them: each its cut or why not
    var item = b.item, out = [];
    (item.rows || []).forEach(function (r) {
      var L = null;
      try { L = H.lineAt({ section: item, t: (r.start + r.end) / 2, cut: b.cut, occ: b.occ }); } catch (e) { L = null; }
      out.push({ k: r.k, n: r.k + 1, line: (item.lines || [])[r.k] || "", start: r.start, end: r.end, L: L && !L.short && L.k === r.k ? L : null,
        why: r.guessed || !L ? "not heard clearly" : L.short ? "under two seconds" : "" });
    });
    return out;
  }
  function partsUnder(b) {           // the score's parts under a block: more than half inside it, or the one holding its middle
    if (!st.score || !st.score.sp) return [];
    var parts = st.score.sp.parts, on = [], mid = (b.a + b.b) / 2;
    parts.forEach(function (p, j) { var o = ov([p.t, p.end], [b.a, b.b]); if (o > 0.5 * (p.end - p.t)) on.push(j); });
    if (!on.length) parts.forEach(function (p, j) { if (p.t <= mid && mid < p.end) on.push(j); });
    return on;
  }
  function restBefore(b) {           // Re-sing from here: the rest of the voice before the block, its cut as the passport cuts (2690)
    var rs = (st.rests && st.rests.rests) || [], first = null;
    heardRows(b.item).forEach(function (r) { if (first === null || r.start < first) first = r.start; });
    var pick = null;
    rs.forEach(function (r) {
      var ok = first !== null ? r.b <= first + 0.05 : r.a - 0.5 <= b.a && b.a <= r.b + 0.5;
      if (ok && (!pick || Math.abs(r.b - b.a) < Math.abs(pick.b - b.a))) pick = r;
    });
    if (!pick) return null;
    var c = pick.a === 0 ? Math.max(0.5, pick.b - Math.min(2, pick.b / 2)) : pick.a + Math.min(2, (pick.b - pick.a) / 2);   // resCut, heresy-collection.js
    return { a: pick.a, b: pick.b, cut: Math.round(c * 10) / 10 };
  }
  function soundWhy() { return st.codesWhy; }    // "" kept, a reason, or null while it is read
  function styleWhy() { var s = st.take && st.take.style; return H.styleCap && H.styleCap.over(s) ? H.styleCap.say(s) : ""; }
  function canDo(op, b) {            // "" when the edit can be had on the block, else why (null: still being read)
    if (st.score && st.score.wait) return tr("Its score is being written from its sound: every edit waits for it");   // HERESY 2895
    if (op === "extend") {
      if (soundWhy() == null) return null;
      if (soundWhy()) return soundWhy();
      if (styleWhy()) return styleWhy();
      return st.len + 15 > MAX_SING ? tr("Only past the take's end, 10:00 at most in all") : "";   // HERESY 2942
    }
    if (!b) return tr("No sections: the lyrics are not timed and there is no score.");
    if (op === "copy" || op === "remove" || op === "insert") {
      if (!st.score) return null;
      if (st.score.none) return tr("This take has no score to find its sections by: Transcribe this take writes one from its sound");
      if (op === "remove" && st.score.sp.parts.length < 2) return tr("Its score has one section only");
      return partsUnder(b).length ? "" : tr("No score part lies under this section");
    }
    if (st.how !== "ear") return tr("These are the score's marks: find the sections by ear first");
    if (op === "from") {
      var r = restBefore(b);
      if (!r) return tr("No break of the voice before it");
      if (r.cut < 5 || r.cut > st.len - 5) return tr("The break is under 5 seconds from an end of the take");
    } else {
      if (b.resumed) return tr("The rest of a part after a break: pick the part itself");
      if (b.inst || !(b.item.rows || []).length) return tr("An instrumental part: no words to sing anew");
      var rows = b.item.rows;
      if (rows[0].guessed || rows[rows.length - 1].guessed) return tr("Whisper did not hear its first or last line clearly (marked ?)");
      if (!b.cut) return tr("Too short to cut");
      if (!b.blk) return tr("Its words were not found in the lyrics");
      if (op === "line" && !lineRows(b).some(function (x) { return x.L; })) return tr("No line of it was heard clearly for two seconds or more");
    }
    if (soundWhy() == null) return null;
    if (soundWhy()) return soundWhy();
    return styleWhy();
  }

  // ------------------------------------------------------------------ the queue: entries, their stretches, the rules (§9.3)
  function blockOf(e) {              // the block an entry was made on, by its name, its occurrence and its time
    if (!e.blk) return null;
    for (var i = 0; i < st.blocks.length; i++) {
      var b = st.blocks[i];
      if (b.name === e.blk.name && b.occ === e.blk.occ && Math.abs(b.a - e.blk.t) <= 0.3) return b;
    }
    return null;
  }
  function effCut(e, q) {            // a sung edit's cut, moved to a Repeat's or a Remove's bar line it meets (never stored): [a, b] or {why}
    var a = e.src[0], b = e.src[1], L = e.lines || e.src;
    for (var k = 0; k < q.length; k++) {
      var o = q[k];
      if (o === e || !CUTS[o.op]) continue;
      for (var j = 0; j < o.spans.length; j++) {
        var s = o.spans[j];
        if (ov(s, [a, b]) <= 0.02) continue;
        if (s[0] <= a + 0.02 && s[1] <= L[0] - 0.3) a = Math.max(a, s[1]);
        else if (s[1] >= b - 0.02 && s[0] >= L[1] + 0.3) b = Math.min(b, s[0]);
        else return { why: fmt("It overlaps {0} in the queue ({1}–{2})", o.section, clock(s[0]), clock(s[1])), with: o };
      }
    }
    if (b - a < 2) return { why: tr("Too short to cut") };
    return [round2(a), round2(b)];
  }
  function stretchOf(e, q) {         // [[a, b]…] in the source's seconds, the sung cuts as moved
    if (e.op === "insert") return [];               // 2887: it copies a part and takes no stretch
    if (CUTS[e.op]) return e.spans;
    if (e.op === "extend") return [];
    if (e.op === "from") return [[e.data.cut, st.len]];
    var c = effCut(e, q || st.queue);
    return Array.isArray(c) ? [c] : [e.src];
  }
  function placeOf(e, q) {           // where something goes in: a once more's and an interlude's cut end, a Repeat's stretch end
    if (B_OPS[e.op]) { var c = effCut(e, q || st.queue); return Array.isArray(c) ? c[1] : e.src[1]; }
    return e.op === "copy" ? e.spans[e.spans.length - 1][1] : e.op === "insert" ? e.data.at : null;
  }
  function blocksOf(e, q) {          // the blocks an entry takes: its own, and every one its stretch covers more than half of
    var out = [], own = e.op === "insert" ? null : blockOf(e);   // 2887: an Insert sits in the gap after its block, not on it
    if (own) out.push(own.i);
    stretchOf(e, q).forEach(function (s) {
      st.blocks.forEach(function (b) { if (b.b - b.a > 0 && ov(s, [b.a, b.b]) > 0.5 * (b.b - b.a) && out.indexOf(b.i) < 0) out.push(b.i); });
    });
    return out;
  }
  function addedLen(e) {             // the seconds an entry adds to the take (a removal takes them away)
    if (e.op === "once") return (+e.data.gap || 0) + (e.src[1] - e.src[0]);
    if (e.op === "interlude") return +e.data.gap || 0;
    if (e.op === "copy" || e.op === "insert") return e.spans.reduce(function (n, s) { return n + s[1] - s[0]; }, 0);
    if (e.op === "remove") return -e.spans.reduce(function (n, s) { return n + s[1] - s[0]; }, 0);
    if (e.op === "extend") return +e.data.more || 0;
    return 0;
  }
  function refusal(cand, others) {   // §9.3: the words why the edit cannot join the queue, or ""
    var q = others.concat([cand]);
    if (q.length > MAX_ALL) return tr("Twelve edits at most in one queue");
    if (q.filter(function (e) { return SUNG[e.op]; }).length > MAX_SUNG) return tr("Eight sung edits at most in one take");
    var ends = q.filter(function (e) { return ENDS[e.op]; });
    if (ends.length > 1) return tr("One ending at a time: re-sing to the end, or extend");
    if (q.some(function (e) { return e.op === "extend"; }) && q.some(function (e) { return e.op === "remove" && e.spans[e.spans.length - 1][1] >= st.len - 0.3; }))
      return tr("Extend goes on from the end this Remove takes away");
    var taken = {};
    others.forEach(function (o) { blocksOf(o, q).forEach(function (i) { taken[i] = o; }); });
    var mine = blocksOf(cand, q);
    for (var m = 0; m < mine.length; m++) if (taken[mine[m]]) return fmt("{0} has an edit in the queue already: ✕ it first", st.blocks[mine[m]].name);
    for (var i = 0; i < q.length; i++) {         // rule 2: the sung cuts moved to a part's bar line, or refused
      if (!SUNG[q[i].op] || ENDS[q[i].op]) continue;
      var c = effCut(q[i], q);
      if (!Array.isArray(c)) return c.why;
    }
    var frm = ends.filter(function (e) { return e.op === "from"; })[0];
    if (frm) {                                     // rule 5: nothing after a re-sing to the end
      for (var f = 0; f < q.length; f++) {
        if (q[f] === frm) continue;
        var end = Math.max.apply(null, stretchOf(q[f], q).map(function (s) { return s[1]; }).concat([placeOf(q[f], q) || 0]));   // 2887: an Insert by its place
        if (end > frm.data.cut + 0.25) return fmt("Nothing can go after the re-sing to the end ({0})", clock(frm.data.cut));
      }
    }
    for (var x = 0; x < q.length; x++) {         // rule 2: no two stretches over each other by more than 0.25 s
      for (var y = x + 1; y < q.length; y++) {
        if (q[x].op === "from" || q[y].op === "from" || (CUTS[q[x].op] !== CUTS[q[y].op])) continue;
        var sx = stretchOf(q[x], q), sy = stretchOf(q[y], q);
        for (var p = 0; p < sx.length; p++) for (var r = 0; r < sy.length; r++) {
          if (ov(sx[p], sy[r]) > 0.25) { var o = q[x] === cand ? q[y] : q[x], so = o === q[x] ? sx[p] : sy[r]; return fmt("It overlaps {0} in the queue ({1}–{2})", o.section, clock(so[0]), clock(so[1])); }
        }
      }
    }
    for (var u = 0; u < q.length; u++) {         // rule 3: a place where something goes in never inside another's stretch
      var pl = placeOf(q[u], q);
      if (pl == null) continue;
      for (var v = 0; v < q.length; v++) {
        if (v === u) continue;
        var tol = CUTS[q[v].op] ? 0.01 : 0.25;
        var sv = stretchOf(q[v], q);
        for (var w = 0; w < sv.length; w++) if (sv[w][0] + tol < pl && pl < sv[w][1] - tol) return fmt("It would go in inside {0} ({1}–{2})", q[v].section, clock(sv[w][0]), clock(sv[w][1]));
      }
    }
    var total = st.len + q.reduce(function (n, e) { return n + addedLen(e); }, 0);   // rule 7
    if (total > MAX_LEN + 0.01) return tr("The new take would run past 15:00");
    if (q.some(function (e) { return e.op === "extend"; }) && total > MAX_SING + 0.01) return tr("Extend sings on to 10:00 at most");   // HERESY 2942
    return "";
  }
  function orderOf(e) { var s = stretchOf(e, st.queue)[0], p = placeOf(e); return [s ? s[0] : e.op === "extend" ? st.len + 1 : e.op === "insert" ? p : 0, p || 0]; }
  function sorted(q) { return q.slice().sort(function (x, y) { var a = orderOf(x), b = orderOf(y); return a[0] - b[0] || a[1] - b[1]; }); }
  function sectionWords(e) {         // the section as the entry says it (a tag, never translated)
    if (e.op === "line") return e.blk.name + " · line " + e.data.n;
    if (CUTS[e.op] || e.op === "insert") return e.section;
    if (e.op === "extend") return "";
    return e.blk ? e.blk.name : "";
  }
  function whatWords(e) {            // what happens to it, in the page's words (§9.2)
    switch (e.op) {
      case "replace": return tr(e.data.same ? "anew, the same words" : "anew, words changed");
      case "line": return fmt("line {0} anew", e.data.n);
      case "once": return +e.data.gap ? fmt("once more after ~{0} s of music", e.data.gap) : tr("once more, straight on");
      case "interlude": return fmt("an interlude of ~{0} s after it", e.data.gap);
      case "copy": return tr("twice, on the bar lines");
      case "remove": return tr("taken out, on the bar lines");
      case "insert": return fmt("a copy after {0}", e.data.after);
      case "from": return fmt("from {0} to the end, anew", tenth(e.data.cut));
      case "extend": return fmt("+{0} after the end", clock(e.data.more));
    }
    return "";
  }
  function titleWords(e) {           // the edit as the new take's title says it (English: a title is data)
    var s = e.blk ? e.blk.name : e.section;
    switch (e.op) {
      case "replace": return s + " anew";
      case "line": return s + " · line " + e.data.n + " anew";
      case "once": return s + " once more" + (+e.data.gap ? ", after a breath" : "");
      case "interlude": return "an interlude after " + s;
      case "copy": return e.section + " twice";
      case "remove": return "without " + e.section;
      case "insert": return e.section + " after " + e.data.after;
      case "from": return "from " + clock(e.data.cut);
      case "extend": return "+" + clock(e.data.more);
    }
    return "";
  }

  // ------------------------------------------------------------------ kept per take (yue2.secQueue.<take>), five takes
  function save() {
    if (!st.name) return;
    var key = KEY + st.name;
    if (!st.queue.length) { H.store(key, null); return; }
    var keep = st.queue.map(function (e) { var x = Object.assign({}, e); delete x.stale; delete x.why; return x; });
    H.store(key, JSON.stringify({ entries: keep, sig: sig(), at: Date.now() }));
    var all = [];
    try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && k.indexOf(KEY) === 0) all.push(k); } } catch (e) { return; }
    if (all.length <= KEEP_TAKES) return;
    var at = function (k) { try { return JSON.parse(localStorage.getItem(k)).at || 0; } catch (e) { return 0; } };
    all.sort(function (x, y) { return at(x) - at(y); });
    all.slice(0, all.length - KEEP_TAKES).forEach(function (k) {
      if (k === key) return;
      H.store(k, null);
      var t = H.find(k.slice(KEY.length));
      H.toast(fmt("The queue of {0} was put away: five takes keep theirs", t ? H.title(t) : k.slice(KEY.length)));   // a queue is never dropped unsaid
    });
  }
  function load(name) {
    try { var d = JSON.parse(H.recall(KEY + name) || "null"); return d && Array.isArray(d.entries) ? d : null; } catch (e) { return null; }
  }
  function revalidate(oldSig) {      // the strip made again: the entries tied to a block by ear look for it again (§9.5 b)
    var changed = oldSig !== sig();
    st.queue.forEach(function (e) {
      e.stale = false;
      if (EAR[e.op] && e.blk) {
        var b = blockOf(e);
        if (!b || st.how !== "ear") e.stale = true;
        else if (e.op !== "from" && (!b.cut || !e.blk.cut || Math.abs(b.cut.a - e.blk.cut.a) > 0.3 || Math.abs(b.cut.b - e.blk.cut.b) > 0.3)) e.stale = true;
      }
    });
    st.queue.forEach(function (e) {          // a Repeat and a Remove stay, laid on the blocks they cover: rule 1 again
      if (!CUTS[e.op] || e.stale) return;
      if (refusal(e, st.queue.filter(function (o) { return o !== e && !o.stale; }))) e.stale = true;
    });
    return changed;
  }

  // ------------------------------------------------------------------ the overlay
  function overUp() {                // a Studio dialog, a menu, a panel or the Engine view over the editor
    var over = document.querySelectorAll(OVER);
    for (var i = 0; i < over.length; i++) if (over[i].getClientRects().length > 0 && !over[i].classList.contains("is-leaving")) return true;
    var qp = $("queuePanel");
    if (qp && !qp.hidden && qp.getClientRects().length) return true;
    var ev = $("view-engine");
    return !!(ev && !ev.classList.contains("is-hidden"));
  }
  function html() {
    var t = st.take;
    return '<div class="se-box" role="dialog" aria-modal="true" aria-labelledby="seTitle" tabindex="-1">' +
      '<div class="se-head"><h3 class="se-title" id="seTitle">' + esc(tr("Section editor")) + "</h3>" +
      '<span class="se-take" translate="no">' + esc(H.title(t)) + "</span>" + mono(clock(st.len)) +
      '<span class="chip se-how"></span><button type="button" class="btn small ghost se-ear" hidden></button>' +
      '<span class="row-hint se-scorewait" role="status" hidden></span><span class="spacer"></span>' +   // HERESY 2895: its score written from its sound first
      '<span class="info" tabindex="-1" role="img" aria-label="' + esc(tr("About the Section editor")) + '" data-tip-ref="tip-seceditor" data-tip-head="' + esc(tr("the song by its sections")) + '"></span>' +
      '<button type="button" class="icon-btn se-x" aria-label="' + esc(tr("Close (Esc): the queue stays")) + '" data-tip="' + esc(tr("Close (Esc): the queue stays")) + '">' + ico("x") + "</button></div>" +
      '<div class="se-stripbox"><div class="se-strip"><div class="se-track"><canvas class="se-wave" aria-hidden="true"></canvas><div class="se-ph" hidden></div>' +
      '<div class="se-lane" role="listbox" aria-orientation="horizontal" aria-label="' + esc(tr("The song's sections")) + '"></div><div class="se-ruler" aria-hidden="true"></div></div>' +
      '<div class="se-endcap"></div></div></div>' +
      '<div class="se-legend"><span class="row-hint se-keys">' + esc(tr("← → between sections · Space plays it")) + "</span>" +
      [["sung", "is-sung"], ["instrumental", "is-inst"], ["in the queue", "is-taken"], ["goes", "is-goes"], ["added", "is-add"], ["sung anew to the end", "is-tail"]].map(function (l) {
        return '<span class="se-leg ' + l[1] + '"><i></i>' + esc(tr(l[0])) + "</span>";
      }).join("") + "</div>" +
      '<div class="se-grid"><section class="se-col se-edit"><div class="se-acts" role="toolbar" aria-label="' + esc(tr("Edit")) + '"></div><p class="row-hint se-why"></p><div class="se-form"></div></section>' +
      '<section class="se-col se-lyr"><h4 class="se-sub">' + esc(tr("The lyrics as they will be sung")) + '</h4><div class="se-lyrics" translate="no"></div></section>' +
      '<section class="se-col se-q"><h4 class="se-sub">' + esc(tr("Queue")) + '</h4><ol class="se-list"></ol><div class="se-foot"></div></section></div></div>';
  }
  function q1(sel) { return st.back ? st.back.querySelector(sel) : null; }

  function open(name, at) {
    var take = H.find(name);
    if (!take) return;
    if (st.open && st.name === name) { if (at != null) pickAt(at); return; }
    if (st.open) close();
    st.open = true; st.name = name; st.take = take; st.pick = -1; st.form = null; st.chain = null; st.done = []; st.score = null; st.rests = null;
    st.codes = null; st.codesWhy = null; st.list = []; st.how = ""; st.blocks = []; st.peaks = null; st.lift = 0; st.why = "";
    st.len = +take.seconds || 0;
    var saved = load(name);
    st.queue = saved ? saved.entries : [];
    st.savedSig = saved ? saved.sig : "";
    if (H.lyricsOff) H.lyricsOff();
    if (H.versionsOff) H.versionsOff();
    var pt = H.playerTake();
    if (!pt || pt.name !== name) H.cue(take);
    st.prev = document.activeElement;
    var back = document.createElement("div");
    back.id = "seBack"; back.className = "se-back";
    back.innerHTML = html();
    document.body.appendChild(back);
    st.back = back;
    placeTop();
    st.inertEl = document.querySelector(".workspace");
    if (st.inertEl) st.inertEl.inert = true;
    back.addEventListener("mousedown", function (e) { if (e.target === back) close(); });
    back.addEventListener("click", onClick);
    back.addEventListener("input", onInput);
    back.addEventListener("change", onInput);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("heresy-sections", onSections);
    window.addEventListener("ruach-lang", paintAll);
    window.addEventListener("resize", onResize);
    st.obs = new MutationObserver(function () { if (st.open && document.body.dataset.tab !== "create") close(); });
    st.obs.observe(document.body, { attributes: true, attributeFilter: ["data-tab"] });
    st.atWanted = at;
    paintHead();
    whenLength(function () {
      if (!st.open || st.take !== take) return;
      readSections(function () { strip(true); });
    });
    readCodes(); readScore(); readChains();
    if (H.peaksOf) H.peaksOf(take).then(function (p) { if (st.open && st.take === take) { st.peaks = p || null; drawWave(); } }, function () {});
    loop();
    // HERESY 2817: the box holds the focus until the blocks are laid; when the take was already in the player they were laid above, the
    // picked block focused, and the box took it back here: the box only when nothing inside has it
    var box = q1(".se-box");
    if (box && !st.back.contains(document.activeElement)) box.focus({ preventScroll: true });
  }
  function whenLength(then) {        // sectionCut and earSections read the player's duration: the strip is made once the take is in it
    var a = H.audio, done = false, go = function () { if (done) return; done = true; a.removeEventListener("durationchange", tick); then(); };
    var holds = function () { var p = H.playerTake(); return p && p.name === st.name && isFinite(a.duration) && a.duration > 0; };
    var tick = function () { if (holds()) { st.len = a.duration; go(); } };
    if (holds()) { st.len = a.duration; return go(); }
    a.addEventListener("durationchange", tick);
    setTimeout(go, 2500);
  }
  function close() {
    if (!st.open) return;
    st.open = false;
    try {
      stopPlay();
      cancelAnimationFrame(st.raf);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("heresy-sections", onSections);
      window.removeEventListener("ruach-lang", paintAll);
      window.removeEventListener("resize", onResize);
      if (st.obs) st.obs.disconnect();
      if (st.back) st.back.remove();
    } finally {
      if (st.inertEl) st.inertEl.inert = false;   // a leftover would deafen the room (2624)
      st.back = null; st.inertEl = null; st.obs = null; st.form = null;
      var p = st.prev;
      st.prev = null;
      if (p && document.contains(p) && p.focus) { try { p.focus({ preventScroll: true }); } catch (e) { /* gone */ } }
    }
  }
  function onSections(e) {
    var n = e && e.detail ? e.detail.name : "";
    if (!st.open || (n && n !== st.name)) return;
    readSections(function () { strip(false); });
  }
  function onResize() { if (st.open) { placeTop(); layoutStrip(); drawWave(); } }
  // under the bar (and the system bar): --bar-h, or the bar's own bottom where it wraps taller (a phone's bar of three rows)
  function placeTop() {
    if (!st.back) return;
    var t = parseFloat(getComputedStyle(document.body).getPropertyValue("--bar-h")) || 0;
    [".topbar", ".sysbar"].forEach(function (sel) { var e = document.querySelector(sel); if (e && e.getClientRects().length) t = Math.max(t, e.getBoundingClientRect().bottom); });
    st.back.style.top = Math.round(t) + "px";
  }

  // ------------------------------------------------------------------ what is read once a take
  function readCodes() {
    var take = st.take;
    H.codes(take).then(function (c) {
      if (!st.open || st.take !== take) return;
      st.codesWhy = c && c.why ? c.why : "";
      st.codes = c && c.codes ? c.codes : null;
      paintAll();
    }, function (e) { if (st.open && st.take === take) { st.codesWhy = e && e.message ? e.message : "?"; paintAll(); } });
  }
  // HERESY 2895 (Viktor 20.11.2026: «не начнут ли СУНОвскую лажу гнать… нужно изначально до первейшего действия такой трек транскрибировать через
  // SheetSage2 для составления настоящей партитуры»): a take with no score of its own and none written from its sound yet (Direct, or brought in) has
  // one written first, as «Transcribe this take» writes it (app.js transcribeTake: the engine's transcriber, the Studio's queue, the lab keeps it);
  // the wait shows in the head, every edit waits for it; then its parts and bar lines are the score's, and a section sung anew follows it (the lab
  // gives the written score to the draft, section.py _phase_a)
  function scoreWait() {
    var el = q1(".se-scorewait");
    if (!el) return;
    var w = st.score && st.score.wait, why = st.score && st.score.why;
    el.hidden = !w && !why;
    if (w) {
      var s = Math.round((Date.now() - st.score.t0) / 1000);
      el.textContent = fmt("Writing its score from its sound ({0})… {1}", H.transcriberName ? H.transcriberName() : "SheetSage2", Math.floor(s / 60) + ":" + ("0" + s % 60).slice(-2));
      if (window.HeresyWait) window.HeresyWait.lead(el);
      el.dataset.tip = tr("A take with no score of its own (Direct, or brought in) gets one written from its sound first, by the transcriber chosen in the Engine, through the Studio's queue: Repeat, Remove and Insert cut on its bar lines, and a section sung anew follows it.");
    } else if (why) { el.textContent = fmt("Its score could not be written from its sound: {0}", why); el.dataset.tip = el.textContent; }
  }
  function readScore() {
    var take = st.take;
    H.score(take).then(function (abc) {
      if (!st.open || st.take !== take) return;
      if (!abc && H.transcribe && !take.session && !(st.score && st.score.why)) {   // HERESY 2895: written from its sound first
        st.score = { wait: true, t0: Date.now() };
        clearInterval(st.scoreTick);
        st.scoreTick = setInterval(function () { if (st.open && st.score && st.score.wait) scoreWait(); else clearInterval(st.scoreTick); }, 1000);
        paintAll(); scoreWait();
        H.transcribe(take).then(function () { if (st.open && st.take === take) { st.score = null; readScore(); } },
          function (e) { if (st.open && st.take === take) { st.score = { none: true, why: (e && e.message) || String(e) }; paintAll(); scoreWait(); } });
        return;
      }
      if (!abc) { st.score = { none: true, why: st.score && st.score.why }; paintAll(); scoreWait(); return; }
      var sp = null;
      try { sp = H.parts(abc, take.seconds); } catch (e) { sp = null; }
      if (!sp || !sp.parts || !sp.parts.length) { st.score = { none: true }; return paintAll(); }
      var len = +take.seconds || st.len || Infinity;
      sp.parts = sp.parts.filter(function (p) { return p.t < len - 0.5; });   // arrangePick's way: a part planned past the end left out, the last cut there
      sp.parts.forEach(function (p) { p.end = Math.min(p.end, len); });
      st.score = { abc: abc, sp: sp, bar: H.barSeconds(abc) || 0, own: !!take.has_score };
      paintAll(); scoreWait();
    }, function () { if (st.open && st.take === take) { st.score = { none: true }; paintAll(); } });
  }
  function readRests() {
    if (st.rests || st.how !== "ear" || !H.rests) return;
    var take = st.take;
    st.rests = { rests: [], heard: 0, loading: true };
    H.rests(take.name).then(function (r) { if (st.open && st.take === take) { st.rests = r || { rests: [] }; paintAll(); } },
      function () { if (st.open && st.take === take) { st.rests = { rests: [] }; paintAll(); } });
  }
  function readChains() {            // the lab's word on what this queue made (§9.5 c) and a chain under way (§10.5)
    var take = st.take;
    fetch("/lab/section/chains?name=" + encodeURIComponent(take.name)).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (!st.open || st.take !== take || !d) return;
      var cs = d.chains || [];
      st.done = cs.filter(function (c) { return c.status === "done"; });
      var live = cs.filter(function (c) { return c.status === "queued" || c.status === "running"; })[0];
      var last = cs.filter(function (c) { return c.status !== "done"; }).sort(function (x, y) { return (y.at || 0) - (x.at || 0); })[0];
      if (live) followChain(live.id);
      else if (last && !st.chain) st.chain = { id: last.id, status: last.status, step: last.step, of: last.of, why: last.why, v: last.v, steps: [] };
      paintQueue();
    }).catch(function () {});
  }

  // ------------------------------------------------------------------ the strip
  function strip(first) {
    var old = st.savedSig || sig();
    makeBlocks();
    readRests();
    if (st.queue.length) { revalidate(old); st.savedSig = sig(); save(); }
    if (first || st.pick < 0 || st.pick >= st.blocks.length) {
      var at = st.atWanted, p = H.playerTake(), i = -1;
      if (at != null) i = blockAt(at);
      else if (p && p.name === st.name && H.audio.currentTime > 0) i = blockAt(H.audio.currentTime);
      if (i < 0) st.blocks.some(function (b) { if (!b.inst && b.heard) { i = b.i; return true; } return false; });
      st.pick = i >= 0 ? i : st.blocks.length ? 0 : -1;
      st.atWanted = null;
    }
    paintAll();
    if (first) focusPick();
  }
  function blockAt(t) { var at = -1; st.blocks.forEach(function (b) { if (b.a <= t + 0.01) at = b.i; }); return at; }
  function pct(t) { return st.len > 0 ? Math.max(0, Math.min(100, t / st.len * 100)) : 0; }
  // the track as wide as the box, wider (its own scroller) where a block of a second or more would be under 32 px; a sliver under a second (the wave's
  // Outro laid 0.3 s after an untimed [Outro], 1358) keeps its own width, drawn thin, so it never makes a song of two minutes scroll for metres
  function layoutStrip() {
    var box = q1(".se-stripbox"), s = q1(".se-strip");
    if (!box || !s) return;
    var avail = Math.max(120, box.clientWidth - 64), need = avail;
    st.blocks.forEach(function (b) { var d = b.b - b.a; if (d >= 1 && st.len > 0) need = Math.max(need, 32 / (d / st.len)); });
    need = Math.min(need, avail * 8);
    s.style.width = Math.ceil(need + 64) + "px";
    s.classList.toggle("is-wide", need > avail + 0.5);
    st.track = need;
  }
  function paintHead() {
    var how = q1(".se-how"), ear = q1(".se-ear");
    if (!how) return;
    how.hidden = !st.how;
    how.textContent = st.how === "ear" ? tr("by ear") : tr("by the score");
    how.dataset.tip = st.how === "ear" ? tr("Sections placed by Whisper's timing of the lyrics, as on the player's wave") : tr("Sections from the score's marks: the take's lyrics are not timed yet");
    var tagged = H.tagged ? H.tagged(st.take.lyrics) >= 2 : false, running = H.asked ? H.asked(st.name) === "running" : false;
    ear.hidden = !(st.how !== "ear" && tagged);
    ear.textContent = tr("Find the sections by ear");
    ear.disabled = running;
  }
  function paintStrip() {
    var lane = q1(".se-lane"), cap = q1(".se-endcap"), ruler = q1(".se-ruler");
    if (!lane) return;
    layoutStrip();
    var taken = {}, goes = {}, tail = null;
    st.queue.forEach(function (e) {
      if (e.stale) return;
      blocksOf(e).forEach(function (i) { taken[i] = taken[i] || e; if (e.op === "remove") goes[i] = 1; });
      if (e.op === "from") tail = e.data.cut;
    });
    if (!st.blocks.length) {
      lane.innerHTML = '<div class="se-none">' + esc(tr("No sections: the lyrics are not timed and there is no score.")) + " " +
        esc(tr("This take has no score to find its sections by: Transcribe this take writes one from its sound")) + "</div>";
    } else {
      // HERESY 2817: the lane is laid anew on every paint (the score, the codes and the chains come in after the blocks): a block that held the
      // focus is gone with it, and the focus would fall to the page; the picked block takes it back
      var hadFocus = !!(document.activeElement && document.activeElement.classList && document.activeElement.classList.contains("se-blk") && lane.contains(document.activeElement));
      lane.innerHTML = st.blocks.map(function (b) {
        var cls = "se-blk" + (b.inst ? " is-inst" : " is-sung") + (b.unheard ? " is-unheard" : "") + (b.i === st.pick ? " is-pick" : "") + (taken[b.i] ? " is-taken" : "") +
          ((b.b - b.a) / (st.len || 1) * (st.track || 1000) < 28 ? " is-thin" : "") +
          (goes[b.i] ? " is-goes" : "") + (tail != null && b.a >= tail - 0.01 ? " is-tail" : "");
        var mark = b.unheard ? "?" : b.resumed ? "›" : "";
        var tip = b.name + " · " + span(b.a, b.b) + (b.nlines ? "\n" + fmt("{0} of {1} lines heard", b.heard, b.nlines) : "");
        var e = taken[b.i];
        return '<div class="' + cls + '" role="option" id="seB' + b.i + '" data-i="' + b.i + '" tabindex="' + (b.i === st.pick ? 0 : -1) + '" aria-selected="' + (b.i === st.pick) + '"' +
          ' style="left:' + pct(b.a).toFixed(4) + "%;width:" + Math.max(0, pct(b.b) - pct(b.a)).toFixed(4) + '%" data-tip="' + esc(tip) + '">' +
          (e ? '<span class="se-blk-ico">' + ico(ICON[e.op]) + "</span>" : "") +
          '<b translate="no">' + esc(b.name.toUpperCase() + mark) + "</b>" + mono(span(b.a, b.b)) + "</div>";
      }).join("");
      var lb = q1("#seB" + st.pick);
      if (lb) lane.setAttribute("aria-activedescendant", lb.id);
      if (hadFocus && lb) lb.focus({ preventScroll: true });
    }
    var wedges = "";
    st.queue.forEach(function (e) {      // where something goes in: a patina wedge after its block
      if (e.stale) return;
      var p = placeOf(e);
      if (p == null) return;
      var said = e.op === "copy" ? "×2" : e.op === "insert" ? "+" + clock(addedLen(e)) : e.op === "once" ? "+once more" : "+~" + e.data.gap + " s";
      wedges += '<span class="se-wedge" style="left:' + pct(p).toFixed(4) + '%" data-tip="' + esc(sectionWords(e) + " " + said) + '"></span>';
    });
    lane.insertAdjacentHTML("beforeend", wedges);
    var ext = st.queue.filter(function (e) { return e.op === "extend" && !e.stale; })[0];
    cap.innerHTML = ext ? '<span class="se-ghost mono" translate="no">+' + esc(clock(ext.data.more)) + "</span>" : "";
    var step = st.len <= 120 ? 15 : st.len <= 360 ? 30 : 60, marks = "";
    for (var t = 0; t <= st.len + 0.01; t += step) marks += '<span style="left:' + pct(t).toFixed(4) + '%" translate="no">' + esc(clock(t)) + "</span>";
    ruler.innerHTML = marks;
    drawWave();
  }
  function cssVar(el, n, f) { var v = getComputedStyle(el).getPropertyValue(n).trim(); return v || f; }
  function drawWave() {
    var cv = q1(".se-wave");
    if (!cv || !st.len) return;
    var w = Math.max(60, Math.round(cv.getBoundingClientRect().width)), h = Math.max(40, Math.round(cv.getBoundingClientRect().height)), dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    var g = cv.getContext("2d"), X = function (t) { return t / st.len * w; };
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    var col = { donor: cssVar(cv, "--amber", "#d99d10"), place: cssVar(cv, "--patina", "#4a9"), cut: cssVar(cv, "--bad", "#c44"), keep: cssVar(cv, "--good", "#4a4"),
      dim: cssVar(cv, "--dim", "#888"), ink: cssVar(cv, "--ink", "#ddd") };
    var mark = function (a, b, c) { g.fillStyle = c; g.globalAlpha = 0.22; g.fillRect(X(a), 0, Math.max(1, X(b) - X(a)), h); g.globalAlpha = 1; };
    st.queue.forEach(function (e) {      // the queue's stretches as the dialogs paint their marks (heresy-dialog.js WAVE_KINDS)
      if (e.stale) return;
      stretchOf(e).forEach(function (s) { mark(s[0], s[1], e.op === "remove" ? col.cut : e.op === "copy" ? col.donor : e.op === "from" ? col.place : col.donor); });
    });
    var pk = st.peaks;
    if (pk && pk.length) {
      g.fillStyle = col.dim;
      for (var x = 0; x < w; x++) {
        var i0 = Math.floor(x / w * pk.length), i1 = Math.max(i0 + 1, Math.floor((x + 1) / w * pk.length)), m = 0;
        for (var i = i0; i < i1 && i < pk.length; i++) if (pk[i] > m) m = pk[i];
        var y = Math.max(1, m * (h / 2 - 3)); g.fillRect(x, h / 2 - y, 1, 2 * y);
      }
    } else {
      g.fillStyle = col.dim; g.globalAlpha = 0.4; g.fillRect(0, h / 2, w, 1); g.globalAlpha = 1;
    }
    var b = st.blocks[st.pick];
    if (b && b.cut) {                    // the picked block's cut: what a sung edit would take, a bracket under the wave
      g.strokeStyle = col.donor; g.lineWidth = 2;
      g.beginPath(); g.moveTo(X(b.cut.a) + 1, h - 7); g.lineTo(X(b.cut.a) + 1, h - 2); g.lineTo(X(b.cut.b) - 1, h - 2); g.lineTo(X(b.cut.b) - 1, h - 7); g.stroke();
      var lab = span(b.cut.a, b.cut.b);
      g.font = "10px " + (cssVar(cv, "--mono", "monospace") || "monospace");
      var tw = g.measureText(lab).width, tx = Math.max(2, Math.min(w - tw - 2, (X(b.cut.a) + X(b.cut.b)) / 2 - tw / 2));
      g.fillStyle = cssVar(cv, "--sunk", "#222"); g.globalAlpha = 0.85; g.fillRect(tx - 3, h - 21, tw + 6, 13); g.globalAlpha = 1;
      g.fillStyle = col.donor; g.fillText(lab, tx, h - 11);
    }
    var f = st.form;
    if (f && (f.op === "copy" || f.op === "remove") && st.score && st.score.sp) {   // the score's part lines, the ticked lit
      st.score.sp.parts.forEach(function (p, j) {
        g.fillStyle = col.ink; g.globalAlpha = 0.5; g.fillRect(Math.round(X(p.t)), 0, 1, h); g.globalAlpha = 1;
        if (f.parts && f.parts.indexOf(j) >= 0) mark(p.t, p.end, f.op === "remove" ? col.cut : col.donor);
      });
    }
    if (f && f.op === "insert" && st.score && st.score.sp) {   // HERESY 2887: the part copied lit, its place a line of its own
      var pi = st.score.sp.parts[f.part], ati = insertAt(st.blocks[f.i]);
      if (pi) mark(pi.t, pi.end, col.donor);
      if (ati != null) { g.fillStyle = col.place; g.fillRect(Math.round(X(ati)) - 1, 0, 3, h); }
    }
    var cb = q1(".se-strip");
    if (cb) cb.dataset.cut = b && b.cut ? span(b.cut.a, b.cut.b) : "";
  }

  // ------------------------------------------------------------------ the edits under the strip
  function paintActs() {
    var acts = q1(".se-acts"), b = st.blocks[st.pick];
    if (!acts) return;
    acts.innerHTML = OPS.map(function (op) {
      var why = canDo(op, b), off = why !== "", word = tr(LABEL[op]);
      var tip = word + (why ? "\n" + why : why === null ? "" : "");
      return '<button type="button" class="icon-btn se-act' + (off ? " is-off" : "") + (st.form && st.form.op === op ? " is-on" : "") + '" data-op="' + op + '"' +
        (off ? ' aria-disabled="true"' : "") + ' aria-label="' + esc(word) + '" data-tip="' + esc(tip) + '">' + ico(ICON[op]) + "</button>";
    }).join("");
  }
  function draftKey(op, b) { return op + "|" + (b ? b.name + "@" + b.a.toFixed(2) : "end"); }
  function openForm(op, entry) {
    var b = st.blocks[st.pick], why = canDo(op, b);
    if (why && !entry) { var w = q1(".se-why"); if (w) w.textContent = why; return; }
    var f = { op: op, i: st.pick, entry: entry || null, key: draftKey(op, b) };
    var d = st.drafts[f.key] || {};
    var ed = entry ? entry.data : {};
    if (op === "replace") f.text = d.text != null ? d.text : ed.text != null ? ed.text : b.blk ? b.blk.text : "";
    if (op === "line") { f.rows = lineRows(b); f.k = ed.k != null ? ed.k : d.k != null ? d.k : (f.rows.filter(function (r) { return r.L; })[0] || {}).k; f.text = d.text != null ? d.text : ed.text; }
    if (op === "once") f.gap = String(ed.gap != null ? ed.gap : H.recall("yue2.onceMoreGap") || "4");
    if (op === "interlude") f.gap = String(ed.gap != null ? ed.gap : H.recall("yue2.interludeGap") || "7");
    if (op === "copy" || op === "remove") f.parts = (ed.parts || d.parts || partsUnder(b)).slice();
    if (op === "insert") { var un = partsUnder(b); f.part = ed.part != null ? ed.part : d.part != null ? d.part : un.length ? un[0] : 0; }
    if (op === "from") f.rest = restBefore(b);
    if (op === "extend") { f.more = d.more != null ? d.more : ed.more != null ? clock(ed.more) : "0:30"; f.lines = d.lines != null ? d.lines : ed.lines || ""; }
    st.form = f;
    var w2 = q1(".se-why");
    if (w2) w2.textContent = "";
    paintForm();
    paintActs();
    drawWave();
    var first = q1(".se-form textarea, .se-form input:not([type=radio]):not([type=checkbox]), .se-form .chip.is-on, .se-form input");
    if (first) first.focus({ preventScroll: true });
  }
  function closeForm(focusPick) {
    st.form = null;
    paintForm(); paintActs(); drawWave();
    if (focusPick) focusPickEl();
  }
  function weigh(before, now, part) {   // the syllables weighed as replaceSection (a tenth) and resingLine (15 %) weigh them
    var d = now - before, much = Math.abs(d) >= Math.max(2, Math.round(before * part));
    if (!much) return "";
    var line = part > 0.12;
    return '<p class="hd-warn se-warn"><span>' + esc(tr(d > 0 ? (line ? "More syllables than the line held: the model sings them faster, or runs over the cut" : "More syllables than the section held: the model sings them faster, or runs over the cut")
      : (line ? "Fewer syllables than the line held: the model may stretch them or leave a rest" : "Fewer syllables than the section held: the model may stretch them or leave a rest"))) +
      '</span> <b class="mono" translate="no">' + (d > 0 ? "+" : "") + d + "</b></p>";
  }
  function formBody(f) {
    var b = st.blocks[f.i], out = "";
    if (f.op === "replace") {
      out = '<p class="row-hint se-say2">' + esc(tr("Its words as the lyrics have them: change what you will, or keep them and let only the music be new.")) + "</p>" +
        '<textarea class="se-text mono" name="seText" rows="7" spellcheck="false" translate="no" data-f="text">' + esc(f.text) + "</textarea>" +
        weigh(H.syllables(b.blk ? b.blk.text : ""), H.syllables(f.text), 0.1);
    } else if (f.op === "line") {
      out = '<div class="se-sub2">' + esc(tr("Which line?")) + '</div><div class="se-lines" role="radiogroup">' + f.rows.map(function (r) {
        return '<label class="se-line' + (r.L ? "" : " is-off") + '"><input type="radio" name="seLine" value="' + r.k + '"' + (r.k === f.k ? " checked" : "") + (r.L ? "" : " disabled") + ">" +
          '<span class="mono se-n">' + r.n + '</span><span class="se-lt" translate="no">' + esc(r.line) + "</span>" +
          (r.L ? mono(span(r.L.a, r.L.b)) : '<span class="row-hint">' + esc(tr(r.why)) + "</span>") + "</label>";
      }).join("") + "</div>";
      var cur = f.rows.filter(function (r) { return r.k === f.k; })[0];
      if (cur && cur.L) {
        var text = f.text != null ? f.text : cur.line;
        out += '<input type="text" class="se-field" name="seLineText" maxlength="400" spellcheck="false" translate="no" data-f="text" value="' + esc(text) + '">' + weigh(H.syllables(cur.line), H.syllables(text), 0.15);
      }
    } else if (f.op === "once" || f.op === "interlude") {
      out = '<div class="se-chips" role="radiogroup">' + (f.op === "once" ? ONCE_GAPS : INTER_GAPS).map(function (c) {
        return '<button type="button" class="chip se-chip' + (c[0] === f.gap ? " is-on" : "") + '" role="radio" aria-checked="' + (c[0] === f.gap) + '" data-gap="' + c[0] + '"><b>' + esc(tr(c[1])) +
          '</b> <span class="se-note">' + esc(tr(c[2])) + "</span></button>";
      }).join("") + "</div>";
    } else if (f.op === "copy" || f.op === "remove") {
      var parts = st.score && st.score.sp ? st.score.sp.parts : [];
      out = '<div class="se-sub2">' + esc(tr(f.op === "copy" ? "The sections to play twice (from the first ticked to the last)" : "The sections to take out")) + '</div><div class="se-parts">' +
        parts.map(function (p, j) {
          return '<label class="se-part"><input type="checkbox" name="sePart" data-part="' + j + '"' + (f.parts.indexOf(j) >= 0 ? " checked" : "") + '><b translate="no">' + esc(p.name) + "</b>" + mono(span(p.t, p.end)) + "</label>";
        }).join("") + '</div><p class="se-count mono" translate="no">' + esc(partsCount(f)) + "</p>";
    } else if (f.op === "insert") {               // 2887: which part goes in, and where (the bar line after the block's last part)
      var ps = st.score && st.score.sp ? st.score.sp.parts : [], at = insertAt(b);
      out = '<div class="se-sub2">' + esc(tr("Which part goes in?")) + '</div><div class="se-parts" role="radiogroup">' +
        ps.map(function (p, j) {
          return '<label class="se-part"><input type="radio" name="seInsPart" data-part="' + j + '"' + (j === f.part ? " checked" : "") + '><b translate="no">' + esc(p.name) + "</b>" + mono(span(p.t, p.end)) + "</label>";
        }).join("") + '</div><p class="se-count mono" translate="no">' + esc(ps[f.part] ? "+ " + clock(ps[f.part].end - ps[f.part].t) : "") + "</p>" +
        (at != null ? '<p class="row-hint">' + esc(fmt("It goes in after {0}, at {1}", b.name, clock(at))) + "</p>" : "");
    } else if (f.op === "from") {
      var r = f.rest;
      out = r ? '<p class="se-say2">' + esc(fmt("The break {0}–{1}, cut at {2}", tenth(r.a), tenth(r.b), tenth(r.cut))) + "</p>" : "";
    } else if (f.op === "extend") {
      out = '<label class="se-lab">' + esc(tr("By how much (m:ss)?")) + ' <input type="text" class="se-field se-more mono" name="seMore" inputmode="decimal" spellcheck="false" placeholder="0:30" data-f="more" value="' + esc(f.more) + '"></label>' +
        '<p class="row-hint">' + esc(tr("Between 0:15 and 2:00")) + "</p>" +
        '<label class="se-lab se-col1">' + esc(tr("New lines for what comes after (optional). Empty: it plays on without words.")) +
        '<textarea class="se-text mono" name="seLines" rows="4" spellcheck="false" translate="no" placeholder="[Outro]&#10;…" data-f="lines">' + esc(f.lines) + "</textarea></label>";
    }
    return out;
  }
  function insertAt(b) {             // HERESY 2887: an Insert's place, the bar line after the last score part under the block
    var on = partsUnder(b), ps = st.score && st.score.sp ? st.score.sp.parts : [];
    return on.length ? round2(ps[on[on.length - 1]].end) : null;
  }
  function partsCount(f) {
    var parts = st.score && st.score.sp ? st.score.sp.parts : [], on = f.parts.slice().sort(function (a, b) { return a - b; });
    if (!on.length) return "";
    if (f.op === "copy") return "+ " + clock(parts[on[on.length - 1]].end - parts[on[0]].t);
    var others = st.queue.filter(function (e) { return e.op === "remove" && e !== f.entry && !e.stale; }).reduce(function (n, e) { return n + addedLen(e); }, 0);
    var gone = on.reduce(function (n, j) { return n + parts[j].end - parts[j].t; }, 0);
    return "→ " + clock(Math.max(0, st.len + others - gone));
  }
  function paintForm() {
    var box = q1(".se-form");
    if (!box) return;
    var f = st.form;
    if (!f) { box.innerHTML = ""; box.hidden = true; return; }
    var b = st.blocks[f.i];
    box.hidden = false;
    box.innerHTML = '<div class="se-fhead"><span class="se-fico">' + ico(ICON[f.op]) + '</span><strong>' + esc(tr(HEAD[f.op])) + "</strong>" +
      (f.op === "extend" ? mono("+ " + clock(st.len)) : b ? raw(b.name) + mono(span(b.a, b.b)) : "") + "</div>" +
      '<p class="row-hint se-say">' + esc(tr(SAY[f.op])) + "</p>" + formBody(f) +
      '<div class="se-facts"><span class="spacer"></span><button type="button" class="btn small ghost se-cancel">' + esc(tr("Cancel")) + "</button>" +
      '<button type="button" class="btn small primary se-add" data-tip="Ctrl+Enter">' + esc(tr("Add to the queue")) + '</button></div><p class="se-refuse" role="alert"></p>';
  }

  // the entry the open form makes, or {why}
  function entryOf(f) {
    var b = st.blocks[f.i], take = st.take, e = { op: f.op, at: Date.now() };
    if (f.op !== "extend" && b) e.blk = { name: b.name, occ: b.occ, t: round2(b.a), cut: b.cut ? { a: b.cut.a, b: b.cut.b } : null };
    if (f.op === "replace") {
      if (!String(f.text || "").trim()) return { why: tr("Its words were not found in the lyrics") };
      e.src = [b.cut.a, b.cut.b]; e.lines = b.lines; e.section = b.name;
      e.data = { text: String(f.text).replace(/\s+$/, ""), same: String(f.text).replace(/\s+$/, "") === String(b.blk.text).replace(/\s+$/, "") };
    } else if (f.op === "line") {
      var r = f.rows.filter(function (x) { return x.k === f.k && x.L; })[0];
      if (!r) return { why: tr("This line is under two seconds: replace its section instead") };
      var words = String(f.text != null ? f.text : r.line).replace(/\s+/g, " ").trim();
      if (!words) return { why: tr("Its words were not found in the lyrics") };
      e.src = [r.L.a, r.L.b]; e.lines = [r.start, r.end]; e.section = b.name + " · line " + r.n;
      e.data = { k: r.k, n: r.n, text: words };
    } else if (f.op === "once" || f.op === "interlude") {
      e.src = [b.cut.a, b.cut.b]; e.lines = b.lines; e.section = b.name; e.data = { gap: +f.gap };
    } else if (f.op === "copy" || f.op === "remove") {
      var parts = st.score.sp.parts, on = f.parts.slice().sort(function (a, c) { return a - c; });
      if (!on.length) return { why: tr("Nothing taken out") };
      var spans = [], names = [];
      if (f.op === "copy") { spans = [[parts[on[0]].t, parts[on[on.length - 1]].end]]; for (var j = on[0]; j <= on[on.length - 1]; j++) names.push(parts[j].name); }
      else {
        on.forEach(function (j) { var last = spans[spans.length - 1]; if (last && Math.abs(last[1] - parts[j].t) < 1e-6) last[1] = parts[j].end; else spans.push([parts[j].t, parts[j].end]); names.push(parts[j].name); });
        var gone = spans.reduce(function (n, s) { return n + s[1] - s[0]; }, 0), others = st.queue.filter(function (x) { return x.op === "remove" && x !== f.entry && !x.stale; });
        if (gone - others.reduce(function (n, x) { return n + addedLen(x); }, 0) >= st.len - 1) return { why: tr("Nothing would be left of the take") };
      }
      e.spans = spans.map(function (s) { return [round2(s[0]), round2(s[1])]; }); e.src = [e.spans[0][0], e.spans[e.spans.length - 1][1]];
      e.section = names.join(", "); e.data = { parts: on, names: names };
    } else if (f.op === "insert") {
      var pz = st.score.sp.parts, pj = pz[f.part], at2 = insertAt(b);
      if (!pj || at2 == null) return { why: tr("No score part lies under this section") };
      e.spans = [[round2(pj.t), round2(pj.end)]]; e.src = [at2, at2];
      e.section = pj.name; e.data = { part: f.part, at: at2, after: b.name };
    } else if (f.op === "from") {
      var rs = f.rest;
      if (!rs) return { why: tr("No break of the voice before it") };
      e.src = [rs.cut, st.len]; e.section = b.name; e.data = { cut: rs.cut, rest: { a: rs.a, b: rs.b } };
    } else if (f.op === "extend") {
      var m = /^\s*(?:(\d+):)?(\d+(?:[.,]\d+)?)\s*$/.exec(String(f.more || "")), more = m ? (+(m[1] || 0)) * 60 + parseFloat(m[2].replace(",", ".")) : NaN;
      if (!isFinite(more) || more < 15 || more > 120) return { why: tr("Between 0:15 and 2:00") };
      e.src = [st.len, st.len + more]; e.section = ""; e.data = { more: Math.round(more * 10) / 10, lines: String(f.lines || "").trim() };
    }
    if (take && SUNG[f.op] && styleWhy()) return { why: styleWhy() };
    return e;
  }
  function add() {
    var f = st.form;
    if (!f) return;
    var e = entryOf(f), say = q1(".se-refuse");
    if (e.why) { if (say) say.textContent = e.why; return; }
    var others = st.queue.filter(function (x) { return x !== f.entry; });
    var no = refusal(e, others.filter(function (x) { return !x.stale; }));
    if (no) { if (say) say.textContent = no; return; }
    if (f.op === "once") H.store("yue2.onceMoreGap", String(f.gap));
    if (f.op === "interlude") H.store("yue2.interludeGap", String(f.gap));
    st.queue = sorted(others.concat([e]));
    delete st.drafts[f.key];
    st.form = null;
    save();
    paintAll();
    focusPickEl();
  }
  function drop(e) {
    st.queue = st.queue.filter(function (x) { return x !== e; });
    if (st.form && st.form.entry === e) st.form = null;
    save();
    paintAll();
  }

  // ------------------------------------------------------------------ the lyrics as they will be sung (§10.1: the source's, every change last first)
  function build(entries, withExtend) {
    var lyr = String(st.take.lyrics || "");
    var list = entries.filter(function (e) { return !CUTS[e.op] && e.op !== "insert" && e.op !== "from" && (e.op !== "extend" || withExtend); })
      .slice().sort(function (x, y) { return orderOf(y)[0] - orderOf(x)[0]; });
    for (var i = 0; i < list.length && lyr !== null; i++) {
      var e = list[i], sec = e.blk ? { name: e.blk.name, lines: (blockOf(e) || {}).item ? blockOf(e).item.lines : null } : null;
      var lines = sec && sec.lines ? sec.lines : null, occ = e.blk ? e.blk.occ : 0;
      if (e.op === "extend") { if (e.data.lines) lyr = lyr.replace(/\s+$/, "") + "\n\n" + e.data.lines; continue; }
      if (!lines) return null;
      if (e.op === "replace") lyr = H.replaceBlock(lyr, e.blk.name, lines, occ, e.data.text);
      else if (e.op === "line") lyr = H.replaceLine(lyr, { name: e.blk.name, lines: lines }, occ, e.data.k, e.data.text);
      else if (e.op === "once") lyr = +e.data.gap ? H.lyricsWithInterlude(lyr, e.blk.name, lines, occ, true) : H.lyricsTwice(lyr, e.blk.name, lines, occ);
      else if (e.op === "interlude") lyr = H.lyricsWithInterlude(lyr, e.blk.name, lines, occ, false);
    }
    return lyr;
  }
  // HERESY 2945 (the agent's list after 2.1.0-rc1, item B9: «Текст после «Повторить» и «Убрать» — подверсией в Писателе, отличия помечены»): the words as
  // Repeat, Remove and Insert leave the music. The lyrics' blocks follow the score's parts (each part's «% name» lines find the next block of that name
  // in the lyrics, a block no part names goes with the part before it), then are laid out as afterAbc lays the parts: a removed part's blocks out, a
  // repeated stretch's blocks once more after its last, an inserted part's after the part it follows. A part whose name has no block (an instrumental
  // part) carries no words. The text, or the text as it was when there is no score to follow
  function normTag(n) { return String(n || "").toLowerCase().replace(/[\s_–—-]+/g, " ").replace(/[^\p{L}\p{N} ]/gu, "").trim(); }
  function cutLyrics(text, q) { return wordsAfter(text, st.score && st.score.sp, q); }
  function wordsAfter(text, sp, q) {                   // pure: the text, the score's parts ({parts: [{name, end}]}), the queue's entries
    var cuts = (q || []).filter(function (e) { return (e.op === "remove" || e.op === "copy" || e.op === "insert") && !e.stale; });
    if (!cuts.length || text === null || !sp || !sp.parts || !sp.parts.length) return text;
    var raw = String(text || "").split(/\r?\n/), blocks = [], head = [];
    raw.forEach(function (l) {
      var tag = l.trim().match(/^\[([^\]]+)\]/);
      if (tag) blocks.push({ norm: normTag(tag[1]), lines: [l] });
      else if (blocks.length) blocks[blocks.length - 1].lines.push(l);
      else head.push(l);
    });
    var groups = sp.parts.map(function () { return []; }), owner = blocks.map(function () { return -1; }), at = 0;
    sp.parts.forEach(function (p, j) {
      String(p.name || "").split(" · ").forEach(function (nm) {
        var want = normTag(nm);
        if (!want || want === "start") return;
        for (var k = at; k < blocks.length; k++) if (blocks[k].norm === want) { owner[k] = j; at = k + 1; return; }
      });
    });
    var last = -1;
    blocks.forEach(function (b, k) { if (owner[k] < 0) owner[k] = last; else last = owner[k]; });   // a block no part names: with the part before it
    blocks.forEach(function (b, k) { if (owner[k] >= 0) groups[owner[k]].push(b); else head = head.concat(b.lines); });
    var gone = {}, copies = [], puts = [];
    cuts.forEach(function (e) {
      if (e.op === "remove") e.data.parts.forEach(function (j) { gone[j] = 1; });
      if (e.op === "copy") copies.push(e.data.parts.slice().sort(function (a, b) { return a - b; }));
      if (e.op === "insert") puts.push(e);
    });
    var order = [];
    sp.parts.forEach(function (p, j) {
      if (!gone[j]) order.push(j);
      copies.forEach(function (c) { if (c[c.length - 1] === j) for (var k = c[0]; k <= c[c.length - 1]; k++) order.push(k); });
      puts.forEach(function (e) { if (Math.abs(p.end - e.data.at) < 0.02) order.push(e.data.part); });
    });
    var trim = function (ls) { ls = ls.slice(); while (ls.length && !ls[ls.length - 1].trim()) ls.pop(); return ls; };
    var out = trim(head), chunks = [];
    order.forEach(function (j) { groups[j].forEach(function (b) { chunks.push(trim(b.lines)); }); });
    chunks.forEach(function (c) { if (!c.length) return; if (out.length) out.push(""); out = out.concat(c); });
    return out.join("\n");
  }
  function paintLyrics() {
    var box = q1(".se-lyrics");
    if (!box || !st.take) return;
    var live = st.queue.filter(function (e) { return !e.stale; }), now = cutLyrics(build(live, true), live), was = String(st.take.lyrics || "");   // HERESY 2945: with the cuts
    if (now === null) { box.textContent = was; return; }
    var d = window.HeresyVersions && window.HeresyVersions.diff ? window.HeresyVersions.diff(was.split(/\r?\n/), now.split(/\r?\n/)) : null;
    if (!d) { box.textContent = now; return; }
    box.innerHTML = d.map(function (x) {
      var cls = x[0] < 0 ? " is-del" : x[0] > 0 ? " is-add" : /^\s*\[/.test(x[1]) ? " is-tag" : "";
      return '<div class="se-l' + cls + '">' + (esc(x[1]) || "&nbsp;") + "</div>";
    }).join("");
  }

  // ------------------------------------------------------------------ the queue and its foot
  function nextV() {
    var used = st.done.map(function (c) { return String(c.v || "A").charCodeAt(0) - 65; });
    return String.fromCharCode(65 + (used.length ? Math.max.apply(null, used) + 1 : 0));
  }
  function stepOf(k) { var c = st.chain; return c && c.steps ? c.steps.filter(function (s) { return (s.ops || []).indexOf(k) >= 0; })[0] : null; }
  function stepClock(s) {
    if (!s) return "";
    if (s.took != null) return clock(s.took);
    if (s.status === "running" && s._t0) return clock((Date.now() - s._t0) / 1000);
    return "";
  }
  function paintQueue() {
    var list = q1(".se-list"), foot = q1(".se-foot");
    if (!list) return;
    var c = st.chain, live = c && (c.status === "queued" || c.status === "running");
    var sent = c && c.order ? c.order : null;      // the entries in the order they were sent (the steps' ops index them)
    list.innerHTML = st.queue.map(function (e, n) {
      var sw = sectionWords(e), s = sent ? stepOf(sent.indexOf(e)) : null, src = stretchOf(e)[0] || e.src;
      var cut = SUNG[e.op] && !ENDS[e.op] ? effCut(e, st.queue) : null, moved = Array.isArray(cut) && (Math.abs(cut[0] - e.src[0]) > 0.005 || Math.abs(cut[1] - e.src[1]) > 0.005);
      return '<li class="se-qi' + (e.stale ? " is-stale" : "") + (s ? " is-" + s.status : "") + '" tabindex="0" data-n="' + n + '">' +
        '<span class="se-qn mono">' + (n + 1) + '</span><span class="se-qico">' + ico(ICON[e.op]) + "</span>" +
        '<span class="se-qw">' + (sw ? raw(sw) + " " : "") + '<span class="se-qwhat">' + esc(whatWords(e)) + "</span>" +
        (moved ? ' <span class="row-hint se-qmoved">' + esc(fmt("cut at the bar line {0}", clock(cut[0] !== e.src[0] ? cut[0] : cut[1]))) + "</span>" : "") +
        (e.stale ? '<span class="row-hint se-qstale">' + esc(tr("The sections were heard anew: add this edit again")) + "</span>" : "") +
        (s ? '<span class="row-hint se-qphase">' + esc(tr(s.phase || s.status)) + (stepClock(s) ? " · " + mono(stepClock(s)) : "") + (s.error ? " · " + esc(tr(s.error)) : "") + "</span>" : "") + "</span>" +
        mono(e.op === "extend" ? "+" + clock(e.data.more) : span(src[0], src[1])) +
        (live ? "" : '<button type="button" class="icon-btn se-qx" aria-label="' + esc(tr("Take it out of the queue")) + '" data-tip="' + esc(tr("Take it out of the queue")) + '">' + ico("x") + "</button>") + "</li>";
    }).join("") + (c && c.steps ? c.steps.filter(function (s) { return s.op === "render"; }).map(function (s) {
      return '<li class="se-qi se-qrender is-' + s.status + '"><span class="se-qn mono">•</span><span class="se-qico">' + ico("waveform") + '</span><span class="se-qw"><span class="se-qwhat">' +
        esc(tr("the whole take is rendered")) + '</span><span class="row-hint se-qphase">' + esc(tr(s.phase || s.status)) + (stepClock(s) ? " · " + mono(stepClock(s)) : "") + "</span></span></li>";
    }).join("") : "");
    paintFoot(foot);
  }
  function paintFoot(foot) {
    if (!foot) return;
    var c = st.chain, live = c && (c.status === "queued" || c.status === "running"), q = st.queue.filter(function (e) { return !e.stale; });
    var sung = q.filter(function (e) { return A_OPS[e.op] || B_OPS[e.op]; }).length, ending = q.some(function (e) { return ENDS[e.op]; });
    var say = "";
    if (live) {
      say = '<p class="se-fsay">' + esc(fmt("Step {0} of {1}", c.step || 1, c.of || (c.steps || []).length || 1)) + "</p>";
      foot.innerHTML = say + '<div class="se-facts"><span class="spacer"></span><button type="button" class="btn small se-stop">' + esc(tr("Stop the assembly")) + "</button></div>";
      return;
    }
    if (c && c.status === "done" && c.take) {
      var t = H.find(c.take);
      say = '<p class="se-fsay se-done">' + esc(fmt("Assembled: {0}", t ? H.title(t) : c.take)) +
        ' <button type="button" class="btn small ghost se-open">' + esc(tr("Open")) + '</button><button type="button" class="btn small ghost se-play">' + esc(tr("Play")) + "</button></p>";
    } else if (c && (c.status === "failed" || c.status === "cancelled" || c.status === "cut")) {
      var w = c.status === "cut" ? fmt("Cut short by a restart of the lab at step {0}", c.step) : c.status === "cancelled" ? fmt("Stopped at step {0}: {1}", c.step, tr("cancelled"))
        : fmt("Stopped at step {0}: {1}", c.step, tr(c.why || "failed"));
      say = '<p class="se-fsay se-bad">' + esc(w) + ' <button type="button" class="btn small ghost se-resume">' + esc(fmt("Resume from step {0}", c.step)) +
        '</button><button type="button" class="btn small ghost se-discard">' + esc(tr("Discard")) + "</button></p>";
    }
    if (q.length) {
      var secs = st.len + q.reduce(function (n, e) { return n + addedLen(e); }, 0);
      var plan = sung || ending ? (ending ? fmt("Drafts sung on the engine: {0}, then the ending, which is the take", sung) : fmt("Drafts sung on the engine: {0}, then the whole take once", sung)) +
        " · " + fmt("about {0} of music rendered in all", clock(secs)) : tr("Only cuts on the bar lines: seconds, nothing sung");
      say += '<p class="row-hint se-plan">' + esc(plan) + '</p><p class="row-hint se-plan">' + esc(tr("One new take; this one stays.")) + "</p>";
    }
    var again = st.done.length > 0 || (c && c.status === "done");
    foot.innerHTML = say + '<div class="se-facts"><button type="button" class="icon-btn se-clear" aria-label="' + esc(tr("Clear the queue")) + '" data-tip="' + esc(tr("Clear the queue")) + '"' +
      (st.queue.length ? "" : " disabled") + ">" + ico("trash-2") + '</button><span class="spacer"></span><button type="button" class="btn small primary se-go"' + (q.length ? "" : " disabled") +
      (again ? ' data-tip="' + esc(tr("Another version of the same queue, on new seeds")) + '"' : "") + ">" + esc(tr(again ? "Assemble again" : "Assemble the take")) + "</button></div>";
  }
  function paintAll() {
    if (!st.open || !st.back) return;
    paintHead(); paintStrip(); paintActs(); paintForm(); paintQueue(); paintLyrics();
  }

  // ------------------------------------------------------------------ assembly (§10.1)
  function body(v) {                 // the request for POST /lab/section/chain, or a refusal (a rejected promise with the words)
    var take = st.take, q = st.queue;
    if (q.some(function (e) { return e.stale; })) return Promise.reject(new Error(tr("The sections were heard anew: add this edit again")));
    q = sorted(q);
    var sings = q.some(function (e) { return SUNG[e.op]; });
    if (sings && styleWhy()) return Promise.reject(new Error(styleWhy()));
    var A = q.filter(function (e) { return A_OPS[e.op]; }), B = q.filter(function (e) { return B_OPS[e.op]; });
    var lyrics = sings ? build(q, true) : "", lyricsA = A.length || B.length ? build(A, false) : "";
    if (sings && (lyrics === null || lyricsA === null)) return Promise.reject(new Error(tr("Its words were not found in the lyrics")));
    var codes = sings ? H.codes(take) : Promise.resolve({});
    return codes.then(function (c) {
      if (sings && c && c.why) throw new Error(c.why);
      var ops = q.map(function (e) {
        if (CUTS[e.op]) return { op: e.op, spans: e.spans, section: e.section };
        if (e.op === "insert") return { op: "insert", spans: e.spans, at: e.data.at, section: e.section, after: e.data.after };   // 2887
        if (e.op === "from") return { op: "from", at: e.data.cut };
        if (e.op === "extend") return { op: "extend", more: e.data.more };
        var cut = effCut(e, q);                    // rule 2's move: on a Repeat's or a Remove's bar line, never stored
        if (!Array.isArray(cut)) throw new Error(cut.why);
        var o = { op: e.op, a: cut[0], b: cut[1], section: e.op === "line" ? e.section : e.blk.name, lines: e.lines };
        if (B_OPS[e.op]) {                   // its own step's text: the replacements and the insertions from it to the end, none before it
          o.gap = +e.data.gap;
          var mine = orderOf(e)[0];
          o.lyrics = build(A.concat(B.filter(function (x) { return orderOf(x)[0] >= mine; })), false);
        }
        return o;
      });
      var words = q.map(titleWords).filter(Boolean), base = H.title(take), title = base + " · " + words.join(" · ") + " " + v;
      if (title.length > 160) title = base + " · " + q.length + " edits " + v;
      var out = { name: take.name, v: v, title: title, lyrics: lyrics, lyrics_a: lyricsA, ws: "", ops: ops, bar: st.score && st.score.bar ? st.score.bar : null,
        window_held: !!take.window_held };
      if (c && c.codes) out.codes = c.codes;
      var hasCuts = q.some(function (e) { return CUTS[e.op] || e.op === "insert"; }), put = B.length > 0, ext = q.some(function (e) { return e.op === "extend"; });
      var sp = st.score && st.score.sp;
      var onlyStraight = B.length > 0 && B.every(function (e) { return e.op === "once" && !+e.data.gap; }) && !hasCuts && !ext && !q.some(function (e) { return e.op === "from"; });
      if (onlyStraight && sp && st.score.own) {     // 1715's way: each such section's part twice
        var order = [];
        sp.parts.forEach(function (p, j) {
          order.push(j);
          B.forEach(function (e) { var best = -1, most = 0; sp.parts.forEach(function (x, k) { var o2 = ov([x.t, x.end], e.src); if (o2 > most) { most = o2; best = k; } }); if (best === j) order.push(j); });
        });
        out.abc_render = H.arrangeAbc(sp, order) || null;
        if (!out.abc_render) delete out.abc_render;
      }
      if (hasCuts) out.abc_after = !put && !ext && sp ? afterAbc(q, sp) : "";
      // HERESY 2945: and its words as the cuts leave them: the new take's lyrics (the lab writes them into its request) and the Writer's sub-version
      if (hasCuts) {
        var base = sings ? lyrics : String(take.lyrics || ""), after = cutLyrics(base, q);
        if (after !== null && after !== base) { out.lyrics_after = after; out.lyrics_before = String(take.lyrics || ""); }
        var scope = (new URLSearchParams(location.search).get("scope") || "").replace(/[^a-z0-9_-]/gi, "");
        if (scope) out.scope = scope;                  // a test page keeps its versions apart, as the Writer does
      }
      return out;
    });
  }
  function afterAbc(q, sp) {         // the source's parts in the result's order after Repeat and Remove, or "" when it would not parse
    var gone = {}, copies = [], puts = [];
    q.forEach(function (e) {
      if (e.op === "remove") e.data.parts.forEach(function (j) { gone[j] = 1; });
      if (e.op === "copy") copies.push(e.data.parts.slice().sort(function (a, b) { return a - b; }));
      if (e.op === "insert") puts.push(e);                      // 2887: its part after the part whose end is its place
    });
    var order = [];
    sp.parts.forEach(function (p, j) {
      if (!gone[j]) order.push(j);
      copies.forEach(function (c) { if (c[c.length - 1] === j) for (var k = c[0]; k <= c[c.length - 1]; k++) order.push(k); });
      puts.forEach(function (e) { if (Math.abs(p.end - e.data.at) < 0.02) order.push(e.data.part); });
    });
    return order.length ? H.arrangeAbc(sp, order) || "" : "";
  }
  function assemble() {
    if (!st.queue.length || (st.chain && (st.chain.status === "queued" || st.chain.status === "running"))) return;
    var take = st.take, v = nextV(), sent = sorted(st.queue), go = q1(".se-go");
    if (go) go.disabled = true;
    var sings = sent.some(function (e) { return SUNG[e.op]; }), b0 = null;
    body(v).then(function (b) {
      b0 = b;
      if (!sings) return null;
      return (H.waitGuard ? H.waitGuard("music", { label: b.title, group: "seced-" + Date.now() }) : Promise.resolve(null)).then(function () {
        return H.gpuGuard ? H.gpuGuard() : true;
      }).then(function (ok) { if (!ok) throw new Error(tr("The synthesis waits: the Studio’s card is training")); });
    }).then(function () { return H.wsGuard(); }).then(function (ws) {
      b0.ws = typeof ws === "string" ? ws : "";
      return fetch("/lab/section/chain", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b0) });
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (r.status === 409 && d && d.id) return d;               // one chain a take at a time: the one running is followed
        if (!r.ok) throw new Error(tr((d && d.error) || "HTTP " + r.status));
        return d;
      });
    }).then(function (d) {
      if (!st.open || st.take !== take) { if (d && d.id) watch(d.id, take.name); return; }
      st.chain = { id: d.id, status: "queued", step: 1, of: d.steps || 0, steps: [], v: v, order: sent };
      followChain(d.id);
    }).catch(function (e) {
      if (go) go.disabled = false;
      if (e && e.message) H.toast(e.message, "bad");
    });
  }
  function followChain(id) {
    if (!st.chain || st.chain.id !== id) st.chain = { id: id, status: "running", step: 1, of: 0, steps: [], order: sorted(st.queue) };
    watch(id, st.name);
    paintQueue();
  }
  function watch(id, name) {         // the chain followed to its end, open or not: the Library read again as the take lands; a toast when closed
    if (st.follow[id]) return;
    st.follow[id] = { misses: 0 };
    if (H.follow) H.follow(id);
    var tick = function () {
      fetch("/lab/section/job?id=" + encodeURIComponent(id), { priority: "low" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
        var f = st.follow[id];
        if (!j) { if (++f.misses < 5) setTimeout(tick, 4000); else delete st.follow[id]; return; }
        f.misses = 0;
        var mine = st.open && st.name === name && st.chain && st.chain.id === id;
        if (mine) {
          var c = st.chain;
          (j.steps || []).forEach(function (s, k) { var o = (c.steps || [])[k]; s._t0 = o && o._t0 ? o._t0 : s.status === "running" ? Date.now() : 0; });
          c.status = j.status; c.step = j.step; c.of = j.of; c.steps = j.steps || []; c.why = j.why || "";
          var v0 = (j.versions || [])[0];
          if (v0 && v0.take) c.take = v0.take;
          if (j.status === "done") st.done = st.done.concat([{ v: c.v || (v0 && v0.v) || "A", take: c.take }]);
          paintQueue();
          paintStrip();
        }
        if (j.status === "queued" || j.status === "running") return setTimeout(tick, 1500);
        delete st.follow[id];
        var v1 = (j.versions || [])[0];
        if (j.status === "done" && v1 && v1.take) toPlayer(v1.take, name);
        if (j.status === "done" && v1 && v1.take && !(st.open && st.name === name)) {
          var t = H.find(v1.take);
          H.toast(fmt("Assembled: {0}", t ? H.title(t) : v1.take), "good", { label: tr("Open"), fn: function () { H.openTake(v1.take); } });
        }
      }).catch(function () { var f = st.follow[id]; if (f && ++f.misses < 5) setTimeout(tick, 4000); else delete st.follow[id]; });
    };
    setTimeout(tick, 600);
  }
  // HERESY 2886 (Viktor 20.11.2026 on §19 №4: «Отставить так. Лучше исправленный дубль в плеер, а не донорский»): the take the queue made goes
  // into the player as it lands, paused at its start, as long as the player still holds the source (nothing else started since); closing
  // the editor still gives no take back. The Library is read again as it lands (followSection), so the new take is waited for there a moment
  function toPlayer(made, source) {
    var tries = 0;
    (function look() {
      var p = H.playerTake();
      if (!p || p.name !== source) return;           // another take was started since: it stays
      var t = H.find(made);
      if (t) { H.cue(t); return; }
      if (++tries < 20) setTimeout(look, 500);
    })();
  }
  function post(path, data) {
    return fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) throw new Error(tr((d && d.error) || "HTTP " + r.status)); return d; }); });
  }

  // ------------------------------------------------------------------ playing a block
  function holds() { var p = H.playerTake(); return !!(p && p.name === st.name); }
  function stopPlay() { if (st.stopAt != null) { st.stopAt = null; if (holds() && !H.audio.paused) H.audio.pause(); } }
  function playBlock(i) {
    var b = st.blocks[i], a = H.audio;
    if (!b) return;
    if (st.stopAt != null && !a.paused && holds() && i === st.playing) { a.pause(); st.stopAt = null; return; }
    var go = function () {
      try { a.currentTime = b.a; } catch (e) { /* not seekable yet */ }
      st.stopAt = b.i === st.blocks.length - 1 ? Math.max(b.a, st.len - 0.05) : b.b;   // the take's last block stops short of its end: no «ended», no Play on
      st.playing = i;
      var p = a.play();
      if (p && p.catch) p.catch(function () {});
    };
    if (!holds()) {
      H.cue(st.take);
      var once = function () { a.removeEventListener("loadedmetadata", once); go(); };
      a.addEventListener("loadedmetadata", once);
      setTimeout(function () { if (holds() && isFinite(a.duration)) once(); }, 400);
      return;
    }
    go();
  }
  function loop() {
    var ph = q1(".se-ph"), a = H.audio;
    if (!st.open) return;
    if (holds() && isFinite(a.duration) && a.duration > 0) {
      if (ph) { ph.hidden = false; ph.style.left = pct(a.currentTime).toFixed(3) + "%"; }
      if (st.stopAt != null && !a.paused && a.currentTime >= st.stopAt - 0.02) { a.pause(); st.stopAt = null; }
    } else if (ph) ph.hidden = true;
    if (++st.n % 30 === 0 && st.chain && st.chain.status === "running") paintQueue();   // the step's clock
    if (st.n % 120 === 0 && !H.find(st.name)) return close();                             // the take gone from the library
    liftFoot();
    st.raf = requestAnimationFrame(loop);
  }
  function liftFoot() {              // the lab's progress strip (1549) stands over the queue's foot where they meet: the foot rises above it
    var js = $("jobStrip"), foot = q1(".se-foot");
    if (!foot) return;
    var lift = 0;
    if (js && !js.hidden && js.getClientRects().length) {
      var r = js.getBoundingClientRect(), f = foot.getBoundingClientRect();
      if (r.left < f.right && r.right > f.left && f.bottom > r.top - 4) lift = Math.ceil(f.bottom - r.top + 8);
    }
    if (Math.abs(lift - st.lift) > 1 || (lift === 0 && st.lift)) { st.lift = lift; foot.style.paddingBottom = lift ? lift + "px" : ""; }
  }

  // ------------------------------------------------------------------ picking and the keys (§7)
  function pick(i, play) {
    if (i < 0 || i >= st.blocks.length) return;
    var was = st.pick;
    st.pick = i;
    if (st.form && st.form.i !== i) st.form = null;
    var w = q1(".se-why");
    if (w) w.textContent = "";
    paintStrip(); paintActs(); paintForm();
    focusPickEl();
    var el = q1("#seB" + i), box = q1(".se-stripbox");
    if (el && box) { var r = el.getBoundingClientRect(), bb = box.getBoundingClientRect(); if (r.left < bb.left || r.right > bb.right) box.scrollLeft += r.left - bb.left - 24; }
    if (play || (st.stopAt != null && holds() && !H.audio.paused && was !== i)) playBlock(i);
  }
  function pickAt(t) { var i = blockAt(t); if (i >= 0) pick(i); }
  function focusPick() { focusPickEl(); }
  function focusPickEl() { var el = q1("#seB" + st.pick); if (el) el.focus({ preventScroll: true }); else { var box = q1(".se-box"); if (box) box.focus({ preventScroll: true }); } }
  function textField(el) { return el && (el.isContentEditable || el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && /^(text|search|number|email|url|tel|password)$/i.test(el.type || "text"))); }
  function onKey(e) {
    if (!st.open || overUp()) return;               // a dialog, a menu or a panel over it: its own keys first, as a stack
    var t = e.target, inBox = st.back && st.back.contains(t), field = textField(t), k = e.key;
    var stripFocus = !t || t === document.body || t === document.documentElement || (inBox && (t.classList.contains("se-box") || !!t.closest(".se-strip")));
    var take = function () { e.preventDefault(); e.stopPropagation(); };
    if (k === "Escape") {
      take();
      if (st.form) return closeForm(true);
      return close();
    }
    if (k === "Enter" && (e.ctrlKey || e.metaKey)) { if (st.form) { take(); add(); } return; }
    if (field) return;
    if (k === "Delete" && inBox && t.classList.contains("se-qi")) {
      var n = +t.dataset.n, en = st.queue[n];
      if (en && !(st.chain && (st.chain.status === "running" || st.chain.status === "queued"))) { take(); drop(en); var nx = q1('.se-qi[data-n="' + Math.min(n, st.queue.length - 1) + '"]'); if (nx) nx.focus(); }
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey || (e.shiftKey && (k === "ArrowLeft" || k === "ArrowRight"))) return;   // Shift+← → seek 30 s: the player's
    var mine = k === " " || k === "ArrowLeft" || k === "ArrowRight" || k === "Home" || k === "End";
    if (!mine) return;
    // over a control it does what the control does (Space presses or ticks it): the page's own play never hears it
    if (!stripFocus) { if (inBox) e.stopPropagation(); return; }
    take();
    if (!st.blocks.length) return;
    if (k === " ") return playBlock(st.pick < 0 ? 0 : st.pick);
    if (k === "ArrowLeft") return pick(Math.max(0, st.pick - 1));
    if (k === "ArrowRight") return pick(Math.min(st.blocks.length - 1, st.pick + 1));
    if (k === "Home") return pick(0);
    if (k === "End") return pick(st.blocks.length - 1);
  }
  function onClick(e) {
    var b = e.target.closest("button, .se-blk, .se-qi, canvas.se-wave");
    if (!b || !st.back.contains(b)) return;
    if (b.classList.contains("se-x")) return close();
    if (b.classList.contains("se-blk")) {
      var i = +b.dataset.i;
      if (i === st.pick) return playBlock(i);       // a click on the picked block plays it (a second tap on a phone)
      return pick(i);
    }
    if (b.classList.contains("se-wave")) {
      var r = b.getBoundingClientRect();
      return pickAt(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * st.len);
    }
    if (b.classList.contains("se-act")) {
      var op = b.dataset.op, why = canDo(op, st.blocks[st.pick]);
      if (why) { var w = q1(".se-why"); if (w) w.textContent = why; return; }   // a touch screen has no hover: the reason said by a tap too
      if (why === null) return;
      if (st.form && st.form.op === op && !st.form.entry) return closeForm(false);
      return openForm(op);
    }
    if (b.classList.contains("se-cancel")) return closeForm(true);
    if (b.classList.contains("se-add")) return add();
    if (b.classList.contains("se-chip")) { st.form.gap = b.dataset.gap; paintForm(); paintStrip(); var c = q1('.se-chip[data-gap="' + st.form.gap + '"]'); if (c) c.focus(); return; }
    if (b.classList.contains("se-qx")) { var li = b.closest(".se-qi"); return drop(st.queue[+li.dataset.n]); }
    if (b.classList.contains("se-qi")) {
      var en = st.queue[+b.dataset.n];
      if (!en || (st.chain && (st.chain.status === "running" || st.chain.status === "queued"))) return;
      var bl = blockOf(en);
      if (en.op === "extend") { if (st.pick < 0 && st.blocks.length) st.pick = 0; return openForm("extend", en); }
      if (CUTS[en.op] && !bl) { var u = blocksOfFirst(en); if (u >= 0) st.pick = u; }
      else if (bl) st.pick = bl.i;
      paintStrip();
      return openForm(en.op, en);
    }
    if (b.classList.contains("se-clear")) {
      if (st.queue.length >= 3 && window.HeresyDialog) {
        return window.HeresyDialog.confirm(fmt("Clear the queue: {0} edits?", st.queue.length), { ok: "Clear", cancel: "Cancel" }).then(function (yes) { if (yes) { st.queue = []; st.form = null; save(); paintAll(); } });
      }
      st.queue = []; st.form = null; save(); paintAll(); return;
    }
    if (b.classList.contains("se-go")) return assemble();
    if (b.classList.contains("se-stop")) { if (st.chain) post("/lab/section/cancel", { id: st.chain.id }).catch(function (er) { H.toast(er.message, "bad"); }); return; }
    if (b.classList.contains("se-resume")) {
      if (!st.chain) return;
      var id = st.chain.id;
      return post("/lab/section/chain", { resume: id }).then(function () { st.chain.status = "running"; delete st.follow[id]; followChain(id); }, function (er) { H.toast(er.message, "bad"); });
    }
    if (b.classList.contains("se-discard")) {
      if (!st.chain) return;
      return post("/lab/section/chain", { discard: st.chain.id }).then(function () { st.chain = null; paintQueue(); }, function (er) { H.toast(er.message, "bad"); });
    }
    if (b.classList.contains("se-open") && st.chain && st.chain.take) { var tk = st.chain.take; close(); H.openTake(tk); return; }
    if (b.classList.contains("se-play") && st.chain && st.chain.take) { var t2 = H.find(st.chain.take); if (t2) H.play(t2); return; }
    if (b.classList.contains("se-ear")) {
      b.disabled = true;
      H.timeSections(st.name, false).then(function () { if (st.open) readSections(function () { strip(false); }); }, function (er) { H.toast(er.message, "bad"); if (st.open) paintHead(); });
    }
  }
  function blocksOfFirst(e) { var b = blocksOf(e); return b.length ? b[0] : -1; }
  function onInput(e) {
    var f = st.form, t = e.target;
    if (!f || !st.back.contains(t)) return;
    if (t.dataset.f) {
      f[t.dataset.f] = t.value;
      st.drafts[f.key] = Object.assign(st.drafts[f.key] || {}, { text: f.text, more: f.more, lines: f.lines, k: f.k });
      if (f.op === "replace" || f.op === "line") {   // the syllables weighed again, the caret kept
        var warn = q1(".se-form .se-warn"), b = st.blocks[f.i], html2 = "";
        if (f.op === "replace") html2 = weigh(H.syllables(b.blk ? b.blk.text : ""), H.syllables(f.text), 0.1);
        else { var cur = f.rows.filter(function (r) { return r.k === f.k; })[0]; if (cur) html2 = weigh(H.syllables(cur.line), H.syllables(f.text), 0.15); }
        if (warn) warn.remove();
        if (html2) t.insertAdjacentHTML("afterend", html2);
      }
      return;
    }
    if (t.name === "seLine" && e.type === "change") { f.k = +t.value; f.text = null; st.drafts[f.key] = Object.assign(st.drafts[f.key] || {}, { k: f.k, text: null }); paintForm(); return; }
    if (t.name === "seInsPart" && e.type === "change") {   // HERESY 2887: the part an Insert puts in
      f.part = +t.dataset.part;
      st.drafts[f.key] = Object.assign(st.drafts[f.key] || {}, { part: f.part });
      var ps2 = st.score && st.score.sp ? st.score.sp.parts : [], cnt2 = q1(".se-count");
      if (cnt2 && ps2[f.part]) cnt2.textContent = "+ " + clock(ps2[f.part].end - ps2[f.part].t);
      drawWave();
      return;
    }
    if (t.dataset.part != null && e.type === "change") {
      var j = +t.dataset.part, at = f.parts.indexOf(j);
      if (t.checked && at < 0) f.parts.push(j);
      if (!t.checked && at >= 0) f.parts.splice(at, 1);
      st.drafts[f.key] = Object.assign(st.drafts[f.key] || {}, { parts: f.parts.slice() });
      var cnt = q1(".se-count");
      if (cnt) cnt.textContent = partsCount(f);
      drawWave();
    }
  }

  function init(hooks) { H = hooks; }
  window.HeresySectionEditor = {
    init: init, open: function (name, at) { if (H) open(name, at); }, close: close, isOpen: function () { return st.open; },
    queue: function (name) { if (name && name !== st.name) { var d = load(name); return d ? d.entries : []; } return st.queue.map(function (e) { return Object.assign({}, e); }); },
    body: function (name) { if (!st.open || (name && name !== st.name)) return Promise.reject(new Error("not open on that take")); return body(nextV()); },
    state: function () { return { open: st.open, name: st.name, how: st.how, pick: st.pick, blocks: st.blocks.map(function (b) { return { name: b.name, a: b.a, b: b.b, cut: b.cut }; }),
      form: st.form ? st.form.op : null, chain: st.chain ? { id: st.chain.id, status: st.chain.status, step: st.chain.step } : null, len: st.len }; },
    can: function (op, i) { return canDo(op, st.blocks[i == null ? st.pick : i]); },
    wordsAfter: wordsAfter,                              // HERESY 2945: for the checks
    toPlayer: function (made, source) { if (H) toPlayer(made, source); }   // HERESY 2886: for the checks
  };
})();
