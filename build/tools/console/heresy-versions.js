// HERESY 1519 (Viktor's TODO 14.10.2026: «Version control of the Creator (style, lyrics, score kept under the base title on each Generate,
// a diff of two, restore into the form, labels and stars; its button never ⟲)»; 13.10.2026: «В Писателя нужно автоматом отправлять все
// версии как в отдельный бакет, чтобы потом, даже после удаления треков, можно было восстановить "потерянное"»): every Generate's words
// kept by the lab under their base title, apart from the takes (a take deleted never takes them along). A window over the page lists a
// title's versions, the newest first: a click picks one (its words, Into the form, a star, a label, a lock, Delete into the title's
// trash, asked); Ctrl or Shift and a click picks a second, and the two show as a diff: the style by words, the lyrics and the score by
// lines. The Creator opens it for the title in its form (Versions, beside Save to Writer); the Writer lists every title kept.
(function () {
  "use strict";

  var SCOPE = (new URLSearchParams(location.search).get("scope") || "").replace(/[^a-z0-9_-]/gi, "");
  var st = { hooks: null, book: null, a: null, b: null, trash: false, busy: false };
  function $(id) { return document.getElementById(id); }
  function tr(s) { return window.RuachI18n && window.RuachI18n.t ? window.RuachI18n.t(s) : s; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function say(text, bad) { if (st.hooks && st.hooks.toast) st.hooks.toast(text, bad ? "bad" : ""); }
  function url(q) {
    var p = q ? [q] : [];
    if (SCOPE) p.push("scope=" + encodeURIComponent(SCOPE));
    return "/lab/writer/versions" + (p.length ? "?" + p.join("&") : "");
  }
  function answer(r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || r.status); return j; }); }
  function api(body) { return fetch(url(), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(answer); }
  function when(t) { return t ? new Date(t * 1000).toLocaleString(document.documentElement.lang || undefined, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""; }
  var WHY = { generate: "Generate", save: "Ctrl+S", roll: "the piano roll", before: "before a change" };   // HERESY 1596
  function lines(s) { return String(s || "").split(/\r?\n/).filter(function (l) { return l.trim(); }).length; }
  // HERESY 1614: a version's branch, as its title carries it («v4.2.3»), «no version» for none
  function branchName(v) { return v && v.version ? "v" + v.version : tr("no version"); }

  // ---- kept on landing: a refusal said aloud, never silent (the words are what a version is for)
  // HERESY 1596: why it was kept (generate, save, roll, before) and the form's knobs with it
  // HERESY 1629: one keep at a time, in the order asked: a burst of them (examples loaded one after another, each keeping the form first) held all
  // six connections the browser gives the studio while the lab answered them one by one, and the song's own request waited behind them
  var keeping = Promise.resolve();
  function keep(words, takes, mode, why, params) {
    if (!words || !(String(words.style || "").trim() || String(words.lyrics || "").trim() || String(words.abc || "").trim())) return Promise.resolve(null);
    var body = { op: "keep", title: words.title, version: words.version || "", style: words.style || "", lyrics: words.lyrics || "", abc: words.abc || "", mode: mode || "", takes: takes || [],
                 why: why || "generate", params: params || {} };
    var sent = keeping.then(function () { return api(body); });
    keeping = sent.catch(function () { return null; });
    return sent
      .then(function (b) { if (st.book && st.book.id === b.id) { st.book = b; paint(); } return b; },
        function (e) { say(tr("The Creator's version was not kept: {0}").replace("{0}", e.message), true); return null; });
  }

  // ---- the diff: the longest common subsequence of lines (or words), kept short where nothing changed
  function lcs(a, b) {
    var n = a.length, m = b.length, out = [], t = [], i, j;
    if (n * m > 4e6) return null;                                   // too long to weigh line by line
    for (i = 0; i <= n; i++) t.push(new Int32Array(m + 1));
    for (i = n - 1; i >= 0; i--) for (j = m - 1; j >= 0; j--) t[i][j] = a[i] === b[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
    i = 0; j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) { out.push([0, a[i]]); i++; j++; } else if (t[i + 1][j] >= t[i][j + 1]) out.push([-1, a[i++]]); else out.push([1, b[j++]]);
    }
    while (i < n) out.push([-1, a[i++]]);
    while (j < m) out.push([1, b[j++]]);
    return out;
  }
  function diffLines(a, b) {
    var d = lcs(String(a || "").split(/\r?\n/), String(b || "").split(/\r?\n/));
    if (!d) return '<p class="row-hint">too long to compare line by line</p>';
    if (d.every(function (x) { return x[0] === 0; })) return '<p class="row-hint vr-same">the same</p>';
    var keepAt = d.map(function (x, k) { for (var q = Math.max(0, k - 2); q <= Math.min(d.length - 1, k + 2); q++) if (d[q][0]) return true; return false; });
    var html = "", gap = 0;
    d.forEach(function (x, k) {
      if (!keepAt[k]) { gap++; return; }
      if (gap) { html += '<div class="vr-l vr-gap">' + esc(tr("unchanged lines: {0}").replace("{0}", gap)) + "</div>"; gap = 0; }
      html += '<div class="vr-l' + (x[0] < 0 ? " is-del" : x[0] > 0 ? " is-add" : "") + '" translate="no"><span class="vr-sign">' + (x[0] < 0 ? "−" : x[0] > 0 ? "+" : "") + "</span>" + (esc(x[1]) || "&nbsp;") + "</div>";
    });
    if (gap) html += '<div class="vr-l vr-gap">' + esc(tr("unchanged lines: {0}").replace("{0}", gap)) + "</div>";
    return '<div class="vr-diff">' + html + "</div>";
  }
  function diffWords(a, b) {
    var split = function (s) { return String(s || "").split(/(\s+)/).filter(function (w) { return w !== ""; }); };
    var d = lcs(split(a), split(b));
    if (!d) return diffLines(a, b);
    if (d.every(function (x) { return x[0] === 0; })) return '<p class="row-hint vr-same">the same</p>';
    return '<div class="vr-words" translate="no">' + d.map(function (x) { return x[0] ? '<span class="' + (x[0] < 0 ? "is-del" : "is-add") + '">' + esc(x[1]) + "</span>" : esc(x[1]); }).join("") + "</div>";
  }

  // ---- the window
  function box() {
    var back = $("vrBack");
    if (back) return back;
    back = document.createElement("div");
    back.className = "vr-back"; back.id = "vrBack"; back.hidden = true;
    back.innerHTML = '<div class="vr-box" role="dialog" aria-modal="true"><div class="vr-head"><strong class="vr-title" translate="no"></strong>' +
      '<span class="row-hint vr-count"></span><span class="spacer"></span><span class="row-hint vr-keys">a click picks a version; Ctrl or Shift and a click, a second: their difference</span>' +
      '<button type="button" class="btn ghost small danger" data-vr="drop" data-tip="Every version of this title, every branch, into the versions\' trash; the Writer brings the tree back">Delete the tree…</button>' +
      '<button type="button" class="btn ghost small" data-vr="close">Close</button></div><div class="vr-body"><div class="vr-list" id="vrList"></div><div class="vr-view" id="vrView"></div></div></div>';
    document.body.appendChild(back);
    back.addEventListener("click", function (e) {
      if (e.target === back) return close();
      var row = e.target.closest(".vr-row[data-n]");
      if (row) {
        var n = +row.dataset.n;
        var armed = st.arm; st.arm = false;                // HERESY 1707: after «Compare with…», a plain click picks the second
        if ((e.ctrlKey || e.metaKey || e.shiftKey || armed) && st.a != null && n !== st.a) st.b = n; else { st.a = n; st.b = null; }
        return paint();
      }
      var b = e.target.closest("[data-vr]");
      if (!b) return;
      var act = b.dataset.vr, v = version(st.a);
      if (act === "close") return close();
      if (act === "trash") { st.trash = !st.trash; return paint(); }
      if (act === "drop") return dropTree();
      if (act === "cmpwith") { st.arm = !st.arm; return paint(); }   // HERESY 1707
      if (act === "back") return mark("undelete", +b.dataset.n);
      if (act === "take") { var name = b.dataset.take; close(); if (st.hooks && st.hooks.openTake) st.hooks.openTake(name); return; }
      if (!v) return;
      if (act === "form") return intoForm(v);
      if (act === "star") return mark("mark", v.n, { star: !v.star });
      if (act === "lock") return mark("mark", v.n, { lock: !v.lock });
      if (act === "label") return label(v);
      if (act === "delete") return del(v);
      if (act === "before") { var i = st.book.versions.indexOf(v); if (i > 0) { st.b = st.a; st.a = st.book.versions[i - 1].n; } return paint(); }
      if (act === "withform") { st.b = "form"; return paint(); }
    });
    document.addEventListener("keydown", function (e) {
      if (back.hidden || document.querySelector(".hd-back")) return;     // a dialog asked from here answers first
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
    }, true);
    return back;
  }
  function version(n) {
    if (n === "form") return formWords();
    return st.book ? (st.book.versions || []).filter(function (v) { return v.n === n; })[0] || null : null;
  }
  function formWords() {
    var f = st.hooks && st.hooks.form ? st.hooks.form() : {};
    return { n: "form", title: f.title || "", version: f.version || "", style: f.style || "", lyrics: f.lyrics || "", abc: f.abc || "", takes: [] };
  }
  function open(where) {
    where = where || {};
    var q = where.id ? "id=" + encodeURIComponent(where.id) : "title=" + encodeURIComponent(where.title || (st.hooks && st.hooks.title ? st.hooks.title() : "") || "Untitled");
    var back = box();
    return fetch(url(q)).then(answer).then(function (b) {
      st.book = b; st.trash = false;
      var vs = b.versions || [];
      st.a = vs.length ? vs[vs.length - 1].n : null; st.b = null;
      back.hidden = false;
      document.body.classList.add("vr-open");
      paint();
      return b;
    }, function (e) { say(tr("The Creator's versions did not come: {0}").replace("{0}", e.message), true); return null; });
  }
  function close() {
    var back = $("vrBack");
    if (!back || back.hidden) return;
    back.hidden = true;
    st.arm = false;                                              // HERESY 1707
    document.body.classList.remove("vr-open");
  }
  function paint() {
    var back = $("vrBack");
    if (!back || !st.book) return;
    var b = st.book, vs = (b.versions || []).slice().reverse(), trash = (b.trash || []).slice().reverse();
    back.querySelector(".vr-title").textContent = b.title;
    var branches = [];                                             // HERESY 1614: the newest branch first, each its versions newest first
    vs.forEach(function (v) { var k = v.version || ""; if (branches.indexOf(k) < 0) branches.push(k); });
    back.querySelector(".vr-count").textContent = tr("versions: {0}").replace("{0}", (b.versions || []).length) + " · " + tr("branches: {0}").replace("{0}", branches.length);
    back.classList.toggle("is-arming", !!st.arm && st.a != null);   // HERESY 1707: «Compare with…» waits for a click on the list
    back.querySelector(".vr-keys").textContent = st.arm && st.a != null ? tr("a click on a version compares it with #{0}").replace("{0}", st.a)
      : tr("a click picks a version; Ctrl or Shift and a click, a second: their difference");
    vs = [].concat.apply([], branches.map(function (k) { return vs.filter(function (v) { return (v.version || "") === k; }); }));
    var shown = null;
    $("vrList").innerHTML = (vs.length ? vs.map(function (v) {
      var on = v.n === st.a ? " is-a" : v.n === st.b ? " is-b" : "";
      var head = shown === (v.version || "") ? "" : '<div class="vr-branch" translate="no"><span class="vr-branch-name">' + esc(branchName(v)) + '</span><span class="row-hint">' +
        esc(tr("versions: {0}").replace("{0}", vs.filter(function (x) { return (x.version || "") === (v.version || ""); }).length)) + "</span></div>";
      shown = v.version || "";
      return head + '<button type="button" class="vr-row' + on + '" data-n="' + v.n + '"><span class="vr-n mono">#' + v.n + "</span>" +
        '<span class="vr-when mono">' + esc(when(v.at)) + "</span>" + (v.star ? '<span class="vr-star" aria-label="starred">★</span>' : "") +
        (v.lock ? '<span class="vr-lock" aria-label="locked">🔒</span>' : "") +
        (v.label ? '<span class="vr-label" translate="no">' + esc(v.label) + "</span>" : "") +
        '<span class="vr-meta">' + (v.why && WHY[v.why] ? esc(tr(WHY[v.why])) + " · " : "") + esc(tr("lines: {0}").replace("{0}", lines(v.lyrics))) + (v.abc ? " · " + esc(tr("score")) : "") +
        " · " + esc(tr("takes: {0}").replace("{0}", (v.takes || []).length)) + "</span></button>";
    }).join("") : '<p class="row-hint">Nothing kept under this title yet: every Generate keeps its words here.</p>') +
      (trash.length ? '<button type="button" class="btn ghost small vr-trash-btn" data-vr="trash">' + esc(tr("Trash ({0})").replace("{0}", trash.length)) + "</button>" +
        (st.trash ? trash.map(function (v) {
          return '<div class="vr-row is-trashed"><span class="vr-n mono">#' + v.n + '</span><span class="vr-when mono">' + esc(when(v.at)) + "</span>" +
            (v.label ? '<span class="vr-label" translate="no">' + esc(v.label) + "</span>" : "") +
            '<button type="button" class="btn ghost small" data-vr="back" data-n="' + v.n + '">Bring back</button></div>';
        }).join("") : "") : "");
    var a = version(st.a), c = st.b != null ? version(st.b) : null;
    $("vrView").innerHTML = !a ? "" : c ? viewTwo(a, c) : viewOne(a);
  }
  function viewOne(v) {
    var takes = (v.takes || []).map(function (n) {
      var here = st.hooks && st.hooks.findTake ? !!st.hooks.findTake(n) : true;
      return here ? '<button type="button" class="btn ghost small vr-take" data-vr="take" data-take="' + esc(n) + '" translate="no">' + esc(n) + "</button>"
        : '<span class="vr-take is-gone" translate="no" data-tip="deleted from the library; its words are kept here">' + esc(n) + "</span>";
    }).join("");
    var i = st.book.versions.indexOf(v);
    return '<div class="vr-acts"><strong class="mono" translate="no">' + esc(branchName(v)) + " · #" + v.n + "</strong>" + '<span class="row-hint mono">' + esc(when(v.at)) + (v.mode ? " · " + esc(v.mode) : "") + "</span>" +
      '<button type="button" class="btn primary small" data-vr="form" data-tip="Its title, style, lyrics and score into the Creator\'s form">Into the form</button>' +
      '<button type="button" class="btn ghost small" data-vr="star" aria-pressed="' + !!v.star + '">' + (v.star ? "★ Starred" : "☆ Star") + "</button>" +
      '<button type="button" class="btn ghost small" data-vr="label">Label…</button>' +
      '<button type="button" class="btn ghost small" data-vr="lock" aria-pressed="' + !!v.lock + '" data-tip="A locked version cannot be deleted">' + (v.lock ? "Unlock" : "Lock") + "</button>" +
      '<button type="button" class="btn ghost small" data-vr="before"' + (i > 0 ? "" : " disabled") + '>Compare with the one before</button>' +
      '<button type="button" class="btn ghost small" data-vr="cmpwith" aria-pressed="' + !!st.arm + '" data-tip="Then a click on a version in the list: the two compared, as Ctrl or Shift and a click do">Compare with…</button>' +   // HERESY 1707
      '<button type="button" class="btn ghost small" data-vr="withform">Compare with the form</button>' +
      '<span class="spacer"></span><button type="button" class="btn ghost small danger" data-vr="delete"' + (v.lock ? " disabled" : "") + ">Delete</button></div>" +
      (v.label ? '<p class="vr-label-big" translate="no">' + esc(v.label) + "</p>" : "") +
      (v.title && v.title !== st.book.title ? section("Title", '<div class="vr-text" translate="no">' + esc(v.title) + "</div>") : "") +
      section("Style", '<div class="vr-text" translate="no">' + (esc(v.style) || "&nbsp;") + "</div>") +
      section("Lyrics", '<pre class="vr-text" translate="no">' + esc(v.lyrics) + "</pre>") +
      (v.abc ? section("Score", '<pre class="vr-text mono" translate="no">' + esc(v.abc) + "</pre>") : "") +
      section("Takes", takes || '<p class="row-hint">none landed with these words</p>');
  }
  function viewTwo(a, c) {
    var older = a, newer = c;
    if (a.n !== "form" && c.n !== "form" && a.n > c.n) { older = c; newer = a; }
    if (a.n === "form") { older = c; newer = a; }
    // HERESY 1614: the branch named once when both are on it («v4.2.3 · #1 → #2»), with each where they differ
    var same = older.n !== "form" && newer.n !== "form" && (older.version || "") === (newer.version || "");
    var name = function (v) { return v.n === "form" ? tr("the form") : (same || !v.version ? "" : branchName(v) + " ") + "#" + v.n; };
    return '<div class="vr-acts"><strong class="mono" translate="no">' + (same && older.version ? esc(branchName(older)) + " · " : "") + esc(name(older)) + " → " + esc(name(newer)) + "</strong>" +
      '<span class="row-hint">− ' + esc(tr("only in {0}").replace("{0}", name(older))) + " · + " + esc(tr("only in {0}").replace("{0}", name(newer))) + "</span></div>" +
      (older.title !== newer.title ? section("Title", diffWords(older.title, newer.title)) : "") +
      section("Style", diffWords(older.style, newer.style)) +
      section("Lyrics", diffLines(older.lyrics, newer.lyrics)) +
      (older.abc || newer.abc ? section("Score", diffLines(older.abc, newer.abc)) : "");
  }
  function section(name, body) { return '<section class="vr-sec"><h4 class="vr-cap">' + esc(name) + "</h4>" + body + "</section>"; }

  // ---- the acts
  function mark(op, n, extra) {
    if (st.busy) return Promise.resolve();
    st.busy = true;
    return api(Object.assign({ op: op, id: st.book.id, n: n }, extra || {})).then(function (b) {
      st.busy = false; st.book = b;
      if (op === "delete" && st.a === n) { var vs = b.versions || []; st.a = vs.length ? vs[vs.length - 1].n : null; st.b = null; }
      if (op === "undelete") { st.a = n; st.b = null; }
      paint();
      return b;
    }, function (e) { st.busy = false; say(e.message, true); });
  }
  function label(v) {
    if (!window.HeresyDialog) return;
    window.HeresyDialog.prompt(tr("A label for version #{0}").replace("{0}", v.n), v.label || "", { max: 80, ok: tr("Keep it") }).then(function (text) {
      if (text == null) return;
      mark("mark", v.n, { label: text });
    });
  }
  function del(v) {
    var go = window.HeresyDialog ? window.HeresyDialog.confirm(tr("Delete version #{0}?").replace("{0}", v.n) + "\n\n" + tr("It goes into this title's trash, from where it comes back."),
      { ok: tr("Delete"), cancel: tr("Cancel"), danger: true }) : Promise.resolve(true);
    go.then(function (yes) { if (yes === true) mark("delete", v.n); });
  }
  function intoForm(v) {
    var f = formWords(), same = f.title === (v.title === "Untitled" ? "" : v.title) && (f.version || "") === (v.version || "") && f.style === v.style && f.lyrics === v.lyrics && f.abc === (v.abc || "");
    var empty = !f.style.trim() && !f.lyrics.trim() && !f.abc.trim();
    var go = same || empty || !window.HeresyDialog ? Promise.resolve(true)
      : window.HeresyDialog.confirm(tr("Put version #{0} into the Creator's form?").replace("{0}", v.n) + "\n\n" + tr("The title, style, lyrics and score there now are replaced. What was generated from them is kept here already."),
        { ok: tr("Into the form"), cancel: tr("Cancel") });
    go.then(function (yes) {
      if (yes !== true || !st.hooks || !st.hooks.load) return;
      st.hooks.load(v);
      close();
      say(tr("Version #{0} is in the form").replace("{0}", v.n));
    });
  }

  // ---- HERESY 1614 (Viktor 19.10.2026: «нужна возможность полного удаления всего древа того или иного Root Title, как это сделано с
  // драфтами в Писателе»): the whole tree into the versions' trash, asked; a locked version keeps it (the lab says which)
  function dropTree() {
    var b = st.book;
    if (!b || !(b.versions || []).length) return;
    var branches = {};
    (b.versions || []).forEach(function (v) { branches[v.version || ""] = 1; });
    var go = window.HeresyDialog ? window.HeresyDialog.confirm(tr("Delete the whole tree of “{0}”?").replace("{0}", b.title) + "\n\n" +
      tr("{0} versions in {1} branches go into the versions' trash; the Writer's «The Creator's versions» brings the tree back.").replace("{0}", (b.versions || []).length).replace("{1}", Object.keys(branches).length),
      { ok: tr("Delete the tree"), cancel: tr("Cancel"), danger: true }) : Promise.resolve(true);
    go.then(function (yes) {
      if (yes !== true) return;
      api({ op: "drop", id: b.id }).then(function () {
        close(); st.book = null;
        say(tr("The tree of “{0}” is in the versions' trash").replace("{0}", b.title));
      }, function (e) { say(e.message, true); });
    });
  }
  function pickDropped(list) {
    return window.HeresyDialog.choose(tr("Deleted trees") + "\n\n" + tr("A tree picked comes back whole, every branch and version."),
      list.map(function (x) { return { value: x.file, label: x.title, note: tr("versions: {0}").replace("{0}", x.versions) + " · " + when(x.dropped) }; }),
      { filter: list.length > 8, ok: tr("Bring back") }).then(function (file) {
      if (!file) return null;
      return api({ op: "undrop", file: file }).then(function (b) {
        say(tr("The tree of “{0}” is back").replace("{0}", b.title));
        return open({ id: b.id });
      }, function (e) { say(e.message, true); return null; });
    });
  }

  // ---- the Writer's bucket: every title kept, one picked opens its versions
  function pickTitle() {
    return fetch(url()).then(answer).then(function (d) {
      var t = d.titles || [], gone = d.dropped || [];
      if (!t.length && gone.length) return pickDropped(gone);       // HERESY 1614
      if (!t.length) { say(tr("No version is kept yet: every Generate keeps its words here")); return null; }
      return window.HeresyDialog.choose(tr("The Creator's versions") + "\n\n" + tr("Every Generate keeps its title's words here, apart from the takes: a take deleted never takes them along."),
        t.map(function (x) { return { value: x.id, label: x.title, note: tr("versions: {0}").replace("{0}", x.versions) + (x.branches > 1 ? " · " + tr("branches: {0}").replace("{0}", x.branches) : "") +
          (x.stars ? " · ★ " + x.stars : "") + " · " + when(x.updated) }; }).concat(gone.length ? [{ value: "__dropped", label: tr("Deleted trees ({0})…").replace("{0}", gone.length) }] : []),
        { filter: t.length > 8 }).then(function (id) { return id === "__dropped" ? pickDropped(gone) : id ? open({ id: id }) : null; });
    }, function (e) { say(tr("The Creator's versions did not come: {0}").replace("{0}", e.message), true); return null; });
  }

  function init(hooks) {
    st.hooks = hooks || {};
    var cb = $("crVersions"), wb = $("wrCreatorVersions");
    if (cb) cb.addEventListener("click", function () { open({ title: st.hooks.title ? st.hooks.title() : "" }); });
    if (wb) wb.addEventListener("click", pickTitle);
  }

  window.HeresyVersions = { init: init, keep: keep, open: open, close: close, pickTitle: pickTitle,
                            book: function () { return st.book; }, picked: function () { return [st.a, st.b]; }, diff: lcs };
})();
