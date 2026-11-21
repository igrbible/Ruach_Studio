// HERESY 2689 (the Musician's item of the plan after 2.0.8, decided by the mockup of 17.11.2026, lyrics-versions-2026-11-17.html: «колонка
// истории песни из варианта B + построчное diff-сравнение из варианта A»; Viktor: «Такого точно ни у кого нет»): the song's history in the take
// column. Every version of the form's title that was sung, built from the takes themselves (each keeps the words it was sung with): a new lyrics
// or a new style sung is a new version. The lyrics and the style are numbered apart (L1, L2…, S1, S2…), each version says what changed from the
// one before it, its takes stand under it with their marks (a click plays one, a double-click opens its card). One version picked shows what
// would change in the form, line by line; a second picked, what changed from the first to it; the second's lyrics, style or both back into the
// form (the form as it was is kept first, as the Versions window keeps it); the two versions' takes side by side in the compare window. The
// Versions window of 1519 (every Generate kept, the unsung too, stars, labels, locks) is one click away in its head.
(function () {
  "use strict";
  var H = null;
  var st = { open: false, base: "", shown: "", picks: [], tab: "lyrics", book: null, scores: {}, sig: "", timer: 0, n: 0, takeName: "" };
  function $(id) { return document.getElementById(id); }
  function tr(s) { return window.RuachI18n && window.RuachI18n.t ? window.RuachI18n.t(s) : s; }
  function fmt(s) { var a = arguments; return tr(s).replace(/\{(\d)\}/g, function (m, i) { return a[+i + 1] != null ? a[+i + 1] : m; }); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function ico(n) { return window.HeresyIcons ? window.HeresyIcons.ui(n) : ""; }
  function lcs(a, b) { return window.HeresyVersions && window.HeresyVersions.diff ? window.HeresyVersions.diff(a, b) : null; }

  // ---- the versions, from the takes
  function normLyrics(s) { return String(s || "").replace(/\r\n?/g, "\n").split("\n").map(function (l) { return l.replace(/\s+$/, ""); }).join("\n").trim(); }
  function normStyle(s) { return String(s || "").replace(/\s+/g, " ").trim(); }
  function stamp(c) { var n = Number(c); return isFinite(n) && n > 1e9 ? n : (Date.parse(String(c || "")) / 1000 || 0); }
  function when(c) {
    var t = stamp(c);
    return t ? new Date(t * 1000).toLocaleString(document.documentElement.lang || undefined, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
  }
  function hour(c) { var t = stamp(c); return t ? new Date(t * 1000).toLocaleTimeString(document.documentElement.lang || undefined, { hour: "2-digit", minute: "2-digit" }) : ""; }
  function song(t) { return !t.session && t.model !== "import" && t.realm !== "reader"; }   // a song of the Musician: no import, no reading
  function build(base) {
    var takes = H.takes().filter(function (t) { return song(t) && H.base(H.title(t)) === base; })
      .sort(function (a, b) { return stamp(a.created) - stamp(b.created) || String(a.name).localeCompare(String(b.name)); });
    var lyr = [], sty = [], vers = [], by = {};
    takes.forEach(function (t) {
      var L = normLyrics(t.lyrics), S = normStyle(t.style);
      var li = lyr.indexOf(L), si = sty.indexOf(S);
      if (li < 0) { lyr.push(L); li = lyr.length - 1; }
      if (si < 0) { sty.push(S); si = sty.length - 1; }
      var v = by[li + "|" + si];
      if (!v) { v = by[li + "|" + si] = { n: vers.length + 1, li: li, si: si, lyrics: t.lyrics || "", style: t.style || "", takes: [], at: t.created }; vers.push(v); }
      v.takes.push(t);
    });
    vers.forEach(function (v, k) { v.prev = k ? vers[k - 1] : null; });
    var f = H.form(), L = normLyrics(f.lyrics), S = normStyle(f.style), form = null;
    if ((L || S) && H.base(H.songTitle()) === base) {                    // the form's words are this song's: its row, or the version it equals
      var li = lyr.indexOf(L), si = sty.indexOf(S), same = vers.filter(function (v) { return v.li === li && v.si === si; })[0];
      if (same) same.isForm = true;
      else form = { n: "form", li: li < 0 ? lyr.length : li, si: si < 0 ? sty.length : si, newL: li < 0, newS: si < 0, lyrics: f.lyrics, style: f.style, abc: f.abc, takes: [], prev: vers[vers.length - 1] || null };
    }
    return { vers: vers, form: form, takes: takes.length };
  }
  function byN(n) { return n === "form" ? st.book.form : st.book.vers.filter(function (v) { return v.n === n; })[0] || null; }

  // what changed from the version before: the lyrics' lines added and gone, the style's words
  function lyricsChange(v) {
    if (!v.prev) return tr("the first");
    if (v.prev.li === v.li) return "";
    var d = lcs(normLyrics(v.prev.lyrics).split("\n"), normLyrics(v.lyrics).split("\n"));
    if (!d) return "";
    var add = d.filter(function (x) { return x[0] > 0; }).length, del = d.filter(function (x) { return x[0] < 0; }).length;
    return fmt("+{0} −{1} lines", add, del);
  }
  function words(s) { return normStyle(s).toLowerCase().split(/[\s,;]+/).filter(Boolean); }
  function styleChange(v) {
    if (!v.prev || v.prev.si === v.si) return "";
    var a = words(v.prev.style), b = words(v.style);
    var add = b.filter(function (w) { return a.indexOf(w) < 0; }), del = a.filter(function (w) { return b.indexOf(w) < 0; });
    if (add.length + del.length > 4) return fmt("+{0} −{1} words", add.length, del.length);
    return add.map(function (w) { return "+" + w; }).concat(del.map(function (w) { return "−" + w; })).join(" ");
  }

  // ---- the column
  function host() {
    var box = $("songHist");
    if (!box) return null;
    if (!box.dataset.wired) {
      box.dataset.wired = "1";
      box.addEventListener("click", onClick);
      box.addEventListener("dblclick", function (e) {
        var c = e.target.closest(".sh-take[data-take]");
        if (c) { e.preventDefault(); close(); H.open(c.dataset.take); }
      });
      box.addEventListener("keydown", function (e) {
        var row = e.target.closest(".sh-row[data-n]");
        if (row && e.target === row && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); pick(row.dataset.n); }
        if (e.key === "Escape" && !document.querySelector(".hd-back")) { e.preventDefault(); close(); }
      });
    }
    return box;
  }
  function pick(n) {
    n = n === "form" ? "form" : +n;
    var i = st.picks.indexOf(n);
    if (i >= 0) st.picks.splice(i, 1); else { st.picks.push(n); if (st.picks.length > 2) st.picks.shift(); }
    paint();
  }
  function onClick(e) {
    var b = e.target.closest("[data-sh]");
    if (b) {
      var act = b.dataset.sh;
      if (act === "close") return close();
      if (act === "book") { var t = st.shown; close(); return H.versions(t); }
      if (act === "tab") { st.tab = b.dataset.tab; return paint(); }
      if (act === "unpick") { st.picks = []; return paint(); }
      return into(act);
    }
    var c = e.target.closest(".sh-take[data-take]");
    if (c) { var take = H.find(c.dataset.take); if (take) H.play(take); return; }
    var row = e.target.closest(".sh-row[data-n]");
    if (row) pick(row.dataset.n);
  }
  // the pair compared: one version picked, from the form to it; two, from the first picked to the second
  function pair() {
    var p = st.picks.map(byN).filter(Boolean);
    if (!p.length) return null;
    if (p.length === 1) return p[0].n === "form" ? null : { a: formSide(), b: p[0] };
    return { a: p[0], b: p[1] };
  }
  function formSide() { var f = H.form(); return { n: "form", lyrics: f.lyrics, style: f.style, abc: f.abc, takes: [] }; }
  function name(v) { return v.n === "form" ? tr("the form") : fmt("version {0}", v.n); }
  function lname(v) { return fmt(v.n === "form" && v.newL ? "lyrics {0} (new)" : "lyrics {0}", v.li + 1); }
  function sname(v) { return fmt(v.n === "form" && v.newS ? "style {0} (new)" : "style {0}", v.si + 1); }

  function rowHtml(v) {
    var k = st.picks.indexOf(v.n), mark = k < 0 ? "" : '<span class="sh-pick">' + (k ? "②" : "①") + "</span>";
    var lc = v.n === "form" ? (v.newL && v.prev ? lyricsChange(v) : "") : lyricsChange(v), sc = styleChange(v);
    var what = '<span class="sh-what"><b>' + esc(lname(v)) + "</b>" + (lc ? '<span class="sh-chg">' + esc(lc) + "</span>" : "") + ' · <b>' + esc(sname(v)) + "</b>" +
      (sc ? '<span class="sh-chg" translate="no">' + esc(sc) + "</span>" : "") + "</span>";
    var head = v.n === "form"
      ? '<span class="sh-n">' + ico("square-pen") + '</span><span class="sh-when">' + esc(tr("now in the form")) + '</span><span class="sh-note">' + esc(tr("not sung")) + "</span>"
      : '<span class="sh-n">' + v.n + '</span><span class="sh-when">' + esc(when(v.at)) + "</span>" + (v.isForm ? '<span class="sh-note is-form">' + esc(tr("in the form")) + "</span>" : "");
    var chips = v.takes.slice().reverse().map(function (t) {
      var r = H.rating(t.name), marks = (t.favorite ? "⭐" : "") + (r > 0 ? "👍" : r < 0 ? "👎" : "");
      var tip = H.title(t) + (t.seconds ? " · " + H.clock(t.seconds) : "") + "\n" + tr("A click plays it, a double-click opens its card");
      return '<button type="button" class="sh-take' + (r < 0 ? " is-down" : "") + '" data-take="' + esc(t.name) + '" data-tip="' + esc(tip) + '">' + esc(hour(t.created)) +
        (marks ? '<span class="sh-marks">' + marks + "</span>" : "") + "</button>";
    }).join("");
    return '<div class="sh-row' + (k === 0 ? " is-a" : k === 1 ? " is-b" : "") + (v.n === "form" ? " is-formrow" : "") + '" data-n="' + v.n + '" role="button" tabindex="0" aria-pressed="' + (k >= 0) + '">' +
      '<div class="sh-line">' + mark + head + "</div>" + what + (chips ? '<div class="sh-takes">' + chips + "</div>" : "") + "</div>";
  }

  function diffLines(a, b) {
    var d = lcs(String(a || "").split(/\r?\n/), String(b || "").split(/\r?\n/));
    if (!d) return '<p class="row-hint">' + esc(tr("too long to compare line by line")) + "</p>";
    if (d.every(function (x) { return x[0] === 0; })) return '<p class="row-hint sh-same">' + esc(tr("the same")) + "</p>";
    var near = d.map(function (x, k) { for (var q = Math.max(0, k - 2); q <= Math.min(d.length - 1, k + 2); q++) if (d[q][0]) return true; return false; });
    var html = "", gap = 0, flush = function () { if (gap) html += '<div class="vr-l vr-gap">' + esc(fmt("unchanged lines: {0}", gap)) + "</div>"; gap = 0; };
    d.forEach(function (x, k) {
      if (!near[k]) { gap++; return; }
      flush();
      html += '<div class="vr-l' + (x[0] < 0 ? " is-del" : x[0] > 0 ? " is-add" : "") + '" translate="no"><span class="vr-sign">' + (x[0] < 0 ? "−" : x[0] > 0 ? "+" : "") + "</span>" + (esc(x[1]) || "&nbsp;") + "</div>";
    });
    flush();
    return '<div class="vr-diff">' + html + "</div>";
  }
  function diffWords(a, b) {
    var split = function (s) { return String(s || "").split(/(\s+)/).filter(function (w) { return w !== ""; }); };
    var d = lcs(split(a), split(b));
    if (!d) return diffLines(a, b);
    if (d.every(function (x) { return x[0] === 0; })) return '<p class="row-hint sh-same">' + esc(tr("the same")) + "</p>";
    return '<div class="vr-words" translate="no">' + d.map(function (x) { return x[0] ? '<span class="' + (x[0] < 0 ? "is-del" : "is-add") + '">' + esc(x[1]) + "</span>" : esc(x[1]); }).join("") + "</div>";
  }
  // a version's score: its first take's that has one, read from the take's request once
  function scoreOf(v) {
    if (v.n === "form") return Promise.resolve(v.abc || "");
    var t = v.takes.filter(function (x) { return x.has_score; })[0];
    if (!t) return Promise.resolve(null);
    if (st.scores[t.name] != null) return Promise.resolve(st.scores[t.name]);
    return H.request(t).then(function (r) { st.scores[t.name] = (r && r.abc) || ""; return st.scores[t.name]; }, function () { return null; });
  }
  function cmpHtml(p) {
    var tabs = [["lyrics", "Lyrics"], ["style", "Style"], ["score", "Score"]].map(function (t) {
      return '<button type="button" class="chip sh-tab' + (st.tab === t[0] ? " is-on" : "") + '" role="tab" aria-selected="' + (st.tab === t[0]) + '" data-sh="tab" data-tab="' + t[0] + '">' + esc(tr(t[1])) + "</button>";
    }).join("");
    var both = p.a.takes.concat(p.b.takes).length;
    var n = p.b.n, off = n === "form" ? " disabled" : "", keep = "\n" + tr("The form as it was is kept first, in the title's Versions");
    var act = function (sh, key, icon) { var say = fmt(key, n); return '<button type="button" class="btn ghost small icon-btn" data-sh="' + sh + '"' + off + ' aria-label="' + esc(say) + '" data-tip="' + esc(say + keep) + '">' + ico(icon) + "</button>"; };
    var acts = act("lyrics", "Lyrics of version {0} into the form", "scroll-text") + act("style", "Style of version {0} into the form", "palette") +
      act("both", "Lyrics and style of version {0} into the form", "corner-up-left") +
      '<button type="button" class="btn ghost small icon-btn" data-sh="listen"' + (both < 2 ? " disabled" : "") + ' aria-label="' + esc(tr("Their takes side by side")) + '" data-tip="' + esc(tr("Their takes side by side in the compare window, played from the same second (24 at most)")) + '">' + ico("cols-2") + "</button>" +
      '<button type="button" class="btn ghost small icon-btn" data-sh="unpick" aria-label="' + esc(tr("Pick none")) + '" data-tip="' + esc(tr("Pick none")) + '">' + ico("x") + "</button>";
    return '<div class="sh-cmp" id="shCmp"><div class="sh-cmp-head"><strong>' + esc(name(p.a)) + " → " + esc(name(p.b)) + '</strong><span class="spacer"></span><span class="sh-acts">' + acts + "</span></div>" +
      '<div class="sh-tabs" role="tablist">' + tabs + '</div><div class="sh-diff" id="shDiff"></div></div>';
  }
  function paintDiff(p) {
    var box = $("shDiff");
    if (!box) return;
    if (st.tab === "lyrics") { box.innerHTML = diffLines(p.a.lyrics, p.b.lyrics); return; }
    if (st.tab === "style") { box.innerHTML = diffWords(p.a.style, p.b.style); return; }
    var n = ++st.n;
    box.innerHTML = '<p class="row-hint">' + (window.HeresyWait ? window.HeresyWait.wave() : "") + esc(tr("Reading the scores…")) + "</p>";
    Promise.all([scoreOf(p.a), scoreOf(p.b)]).then(function (s) {
      if (n !== st.n || !$("shDiff")) return;
      if (s[0] == null || s[1] == null) { $("shDiff").innerHTML = '<p class="row-hint">' + esc(fmt("No score in the takes of version {0}", (s[0] == null ? p.a : p.b).n)) + "</p>"; return; }
      $("shDiff").innerHTML = diffLines(s[0], s[1]);
    });
  }

  function paint() {
    var box = host();
    if (!box || !st.open) return;
    st.book = build(st.base);
    st.picks = st.picks.filter(function (n) { return !!byN(n); });
    var b = st.book, rows = (b.form ? [b.form] : []).concat(b.vers.slice().reverse());
    var head = '<div class="sh-head"><span class="sh-ico">' + ico("history") + '</span><h3 class="sh-title">' + esc(tr("Song history")) + '</h3><span class="sh-base" translate="no">' + esc(st.shown || tr("Untitled")) + "</span>" +
      '<span class="sh-count">' + esc(fmt("versions: {0} · takes: {1}", b.vers.length, b.takes)) + '</span><span class="spacer"></span>' +
      '<button type="button" class="btn ghost small icon-btn" data-sh="book" aria-label="' + esc(tr("Every kept version")) + '" data-tip="' + esc(tr("Every kept version of this title: each Generate kept, the unsung too, with stars, labels and locks (the Versions window)")) + '">' + ico("archive") + "</button>" +
      '<button type="button" class="btn ghost small icon-btn" data-sh="close" aria-label="' + esc(tr("Close the history")) + '" data-tip="' + esc(tr("Close the history (Esc)")) + '">' + ico("x") + "</button></div>";
    var hint = rows.length ? '<p class="row-hint sh-hint">' + esc(tr("A click on a version shows what it would change in the form; a click on a second, what changed from the first to it")) + "</p>"
      : '<p class="row-hint sh-empty">' + esc(st.base ? fmt("No take of «{0}» yet: its history starts with its first song", st.shown) : tr("Give the song a title: its history is kept by it")) + "</p>";
    var p = pair();
    box.innerHTML = head + hint + (p ? cmpHtml(p) : "") + '<div class="sh-list">' + rows.map(rowHtml).join("") + "</div>";
    if (p) paintDiff(p);
    st.sig = sig();
  }
  function sig() { var f = H.form(); return H.takes().length + "|" + normLyrics(f.lyrics).length + "|" + normStyle(f.style) + "|" + normLyrics(f.lyrics).slice(0, 200) + "|" + document.documentElement.lang; }

  function into(act) {
    var p = pair();
    if (!p || (act !== "listen" && p.b.n === "form")) return;
    if (act === "listen") {
      var names = p.b.takes.concat(p.a.takes).map(function (t) { return t.name; });
      return H.compare(names.slice(0, 24));
    }
    var parts = {};
    if (act === "lyrics" || act === "both") parts.lyrics = p.b.lyrics;
    if (act === "style" || act === "both") parts.style = p.b.style;
    H.put(parts);
    H.toast(fmt(act === "lyrics" ? "Lyrics of version {0} in the form" : act === "style" ? "Style of version {0} in the form" : "Lyrics and style of version {0} in the form", p.b.n));
    st.picks = [];
    paint();
  }

  function open(where) {
    var box = host();
    if (!box) return;
    var col = $("view-take"), f = H.form(), t = H.take();
    var title = (where && where.title) || (f.title || !t ? H.songTitle() : H.title(t));   // the form's title; none there, the take in hand's
    st.base = H.base(title); st.shown = H.shown(title) || title;
    st.open = true; st.picks = []; st.tab = "lyrics"; st.takeName = t ? t.name : "";
    col.classList.add("is-hist");
    box.hidden = false;
    paint();
    col.scrollTop = 0;
    clearInterval(st.timer);
    st.timer = setInterval(function () { if (st.open && sig() !== st.sig) paint(); }, 1500);   // a take landed, the form changed, another language
  }
  function close() {
    if (!st.open) return;
    st.open = false;
    clearInterval(st.timer);
    var box = $("songHist");
    if (box) { box.hidden = true; box.innerHTML = ""; }
    $("view-take").classList.remove("is-hist");
  }
  function init(hooks) {
    H = hooks;
    var cb = $("crVersions");
    if (cb) cb.addEventListener("click", function () { if (st.open) close(); else open(); });
    // a run shown or another take opened puts the history away: what the column was for comes back
    var chain = $("chain"), body = $("takeBody");
    if (chain) new MutationObserver(function () { if (st.open && !chain.hidden) close(); }).observe(chain, { attributes: true, attributeFilter: ["hidden"] });
    if (body) new MutationObserver(function () { var t = H.take(); if (st.open && t && t.name !== st.takeName) close(); }).observe(body, { attributes: true, attributeFilter: ["class"] });
  }
  window.HeresySongHist = { init: init, open: open, close: close, isOpen: function () { return st.open; }, book: function () { return st.book; }, picks: function () { return st.picks.slice(); } };
})();
