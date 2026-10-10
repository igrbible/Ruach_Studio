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
  var state = { docs: [], doc: null, dirty: false, saving: null, timer: 0, q: "", view: null, hooks: null, preview: false };
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
    if (!p || !Object.keys(p).length) return '<span class="row-hint">none yet — “From the Creator” takes them as the form has them now</span>';
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
  function paintList() {
    var HC = window.HeresyCollection, m = HC ? HC.matcher(state.q) : function () { return true; }, hand = recall(HAND_KEY);
    var rows = state.docs.filter(function (d) { return !state.q || m(d.hay || d.title); });
    $("wrCount").textContent = state.docs.length ? rows.length + (rows.length !== state.docs.length ? " / " + state.docs.length : "") : "";
    $("wrList").innerHTML = rows.length ? rows.map(function (d) {
      var on = state.doc && state.doc.id === d.id;
      return '<button type="button" class="wr-item' + (on ? " is-on" : "") + '" data-doc="' + esc(d.id) + '">' +
        '<span class="wr-item-title">' + (d.id === hand ? '<span class="wr-hand-dot" title="In hand in the Creator">✎</span> ' : "") + esc(d.title) + "</span>" +
        '<span class="wr-item-ex">' + esc(d.excerpt || d.style || "") + "</span>" +
        '<span class="wr-item-meta"><span>' + esc(when(d.updated)) + "</span>" + (d.takes ? " · <span>" + d.takes + " take" + (d.takes > 1 ? "s" : "") + "</span>" : "") +   // HERESY 1166
        (d.versions ? " · <span>" + d.versions + " v</span>" : "") + "</span></button>";
    }).join("") : '<p class="row-hint wr-empty">' + (state.docs.length ? "Nothing for “" + esc(state.q) + "”." : "No documents yet. ＋ New, or “Save to Writer” in the Creator.") + "</p>";
  }

  // ---- one document
  function open(id) {
    return flush().then(function () { return api(undefined, id); }).then(function (doc) {
      state.doc = doc; state.dirty = false; state.view = null;
      paintDoc(); paintList();
      if (state.hooks.showWriter) state.hooks.showWriter();
    }).catch(function (e) { toast(e.message, true); });
  }
  function paintDoc() {
    var doc = state.doc, v = state.view !== null && doc ? doc.versions[state.view] : null, src = v || doc;
    $("wrEmpty").hidden = !!doc; $("wrDoc").hidden = !doc;
    if (!doc) return;
    $("wrTitle").value = src.title || "";
    $("wrStyle").value = src.style || "";
    $("wrLyrics").value = src.lyrics || "";
    $("wrNotes").value = src.notes || "";
    ["wrTitle", "wrStyle", "wrLyrics", "wrNotes"].forEach(function (id) { $(id).readOnly = !!v; });
    $("wrVersionBar").hidden = !v;
    if (v) $("wrVersionSay").textContent = "Version of " + when(v.at) + (v.label ? " — " + v.label : "") + ". Read only.";
    $("wrParams").innerHTML = paramChips(src.params);
    paintNotes(); paintSizes(); paintTakes(); paintVersions(); paintState();
    $("wrHandBtn").textContent = recall(HAND_KEY) === doc.id ? "In hand in the Creator ✎" : "Load into the Creator";
  }
  function paintSizes() {
    var lyr = $("wrLyrics").value, sty = $("wrStyle").value;
    $("wrStyleSize").textContent = sty ? sty.length + " chars" : "";
    $("wrLyricsSize").textContent = lyr ? lyr.split(/\r?\n/).filter(function (l) { return l.trim(); }).length + " lines · " + lyr.length + " chars" : "";
  }
  function paintNotes() {
    $("wrNotes").hidden = state.preview; $("wrNotesView").hidden = !state.preview;
    $("wrNotesMode").textContent = state.preview ? "Edit" : "Preview";
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
        (k ? '<button type="button" class="btn ghost small" data-wr-go="create">Creator</button><button type="button" class="btn ghost small" data-wr-go="post">Refiner</button>' : "") + "</div>";
    }).join("") : '<p class="row-hint">None yet. Load this document into the Creator: whatever is made while it is in hand lands here.</p>';
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
    $("wrState").textContent = state.saving ? "saving…" : state.dirty ? "unsaved" : state.doc ? "saved " + when(state.doc.updated) : "";
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
    state.timer = setTimeout(flush, 1500);
  }
  function flush() {
    clearTimeout(state.timer);
    if (state.saving) return state.saving.then(flush);
    if (!state.doc || !state.dirty) return Promise.resolve();
    var body = Object.assign({ op: "put", id: state.doc.id, autosave: true }, fields());
    state.dirty = false;
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
    var f = state.hooks.form(), hand = recall(HAND_KEY);
    var busy = (f.lyrics || "").trim() && f.lyrics !== doc.lyrics && hand !== doc.id;
    (busy ? window.HeresyDialog.confirm("Put “" + doc.title + "” into the Creator?\n\nThe title, style and lyrics there now are replaced" +
        (hand ? " (they belong to another document in the Writer, which keeps them)." : ". They are in no document: “Save to Writer” first, if they matter."), { ok: "Put it in the Creator" }) : Promise.resolve(true)).then(function (ok) {
      if (!ok) return false;
      state.hooks.load(doc);
      store(HAND_KEY, doc.id);
      paintList(); paintHand();
      if (state.doc && state.doc.id === doc.id) $("wrHandBtn").textContent = "In hand in the Creator ✎";
      toast("“" + doc.title + "” is in the Creator; what is made from it is linked to it");
      return true;
    });
  }
  function paintHand() {
    var id = recall(HAND_KEY), d = state.docs.filter(function (x) { return x.id === id; })[0];
    if (id && !d && state.listOk) store(HAND_KEY, null);   // gone from the notebook (an unanswered lab clears nothing)
    $("wrHandName").textContent = d ? d.title : "";
    $("wrHandBox").classList.toggle("is-on", !!d);
    $("wrHandSave").textContent = d ? "Save to Writer" : "Save to Writer…";
    $("wrHandSave").title = d ? "Save the song as it is now into “" + d.title + "” (the version before is kept)" : "Keep the song as it is now (title, style, lyrics and every knob) as a document in the Writer";
    var pick = $("wrHandPick");
    pick.innerHTML = '<option value="">From the Writer…</option>' + state.docs.slice(0, 60).map(function (x) {
      return '<option value="' + esc(x.id) + '">' + esc(x.title) + "</option>";
    }).join("");
  }

  // takes made while a document is in hand
  function landed(names) {
    var id = recall(HAND_KEY);
    if (!id || !names || !names.length) return;
    api({ op: "link", id: id, takes: names }).then(function (doc) {
      if (state.doc && state.doc.id === doc.id) { state.doc.takes = doc.takes; paintTakes(); }
      patchListRow(doc);
    }).catch(function () { /* the takes stay in the library either way */ });
  }

  function init(hooks) {
    state.hooks = hooks;
    // HERESY 1268 (Viktor 09.10.2026: «В комнате Писателя дай возможность регулировать ширину левой колонки со списком документов»): the
    // documents column's edge dragged (its width kept in this browser), ← → from the keyboard, Home or a double click for its own 280 px
    (function () {
      var book = document.querySelector(".wr-book"), rz = $("wrResizer"), side = document.querySelector(".wr-side");
      if (!book || !rz || !side) return;
      var KEY = "yue2.wrSideW", MIN = 200, MAX = 640, DEF = 280;
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
    $("wrList").addEventListener("click", function (e) { var b = e.target.closest("[data-doc]"); if (b) open(b.dataset.doc); });
    $("wrNew").addEventListener("click", function () {
      flush().then(function () { return api({ op: "put", title: "Untitled" }); })
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
        toast(tr("Writer backup: {0} documents and {1} in the trash, into {2}").replace("{0}", (b.docs || []).length)
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
        toast(tr("Writer backup {0}: {1} new, {2} already here, {3} beside their namesakes as copies, {4} into the trash")
          .replace("{0}", f.name).replace("{1}", n.added || 0).replace("{2}", n.same || 0).replace("{3}", n.copies || 0).replace("{4}", n.trashed || 0));
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
        .then(function (doc) { state.doc = doc; paintDoc(); toast("PARAMS taken from the Creator (the version before is kept)"); }).catch(function (e) { toast(e.message, true); });
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
          state.doc = null; state.docs = d.docs || []; paintDoc(); paintList(); paintHand(); toast("Deleted (kept in writer/.trash)");
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
                          // HERESY 1167: the document open in the notebook, and putting one into the Creator (for the writing room)
                          openDoc: function () { return state.doc || null; }, inHand: function () { return recall(HAND_KEY) || ""; },
                          putInCreator: function (doc) { return flush().then(function () { return intoCreate(doc); }); },
                          saveTake: function (doc) { return api(Object.assign({ op: "put" }, doc)).then(function (d) { loadList(); return d; }); },
                          link: function (id, names) { return api({ op: "link", id: id, takes: names }); } };
})();
