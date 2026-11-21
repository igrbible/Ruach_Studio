// HERESY 2912 (Viktor 20.11.2026: «историю проигрывания треков, но не с бесконечным списком… сузить в мегаплеере колонку с именем трека, за ним
// сдвинутся реакции, и между ними и кнопками плеера SVG-кнопочку, вызывающую оверлей в полную высоту, но по ширине примерно 800px, с временем, когда
// было проигрывание, справа от трека его реакции, по клику на имя трека переход на карточку в Библиотекаре, сегментация по дням, кнопка очистки
// истории… И в Движке в умолчаниях пользователя тоже опцией, по дефолту включенной… Ctrl+H… история скачиваний, с аналогичным шорткатом Ctrl+J. В
// компактном плеере… кнопку истории убирать в этом режиме. В ниспадающем MORE строкой в две колонки туда же эти две кнопки»): what the player played
// and what was downloaded, one window of two tabs.
//   Kept by the lab (lab/play_history.py: user/history.json, history-SCOPE.json for a page opened with ?scope=): the plays of the last 30 days, at most
//   2000, and the downloads of the last 90, at most 1000. Not in the yue2.* keys: some 300 KB that the settings file would carry into every page's
//   first, synchronous read. While the lab does not know /lab/history (a page newer than its lab), the page keeps them in this browser
//   (ruach.history.local, outside yue2.*) and hands them to the lab once it knows the path.
//   A play: one hearing of a take in the player, from its start to another take, written once it has played 3 s (a take skipped at once is no play);
//   its seconds heard, the moment it stopped at, through (its last 5 s reached with 60 % of it heard), and repeat one's loops in the same hearing.
//   A download: any link the page saves a file through (a[download]): the take when the link names one, the file and its kind.
//   The window: full height, 800 px wide, by day (Today, Yesterday, then the dates), newest first; a title opens its card in the Librarian; a take's
//   🔥 💎, its reaction and its 👍 👎 on the right, live as in the cards; find, clear (asked first). Ctrl+H and Ctrl+J open it, also in a browser
//   tab: measured with real keys (XTest into Chromium on a virtual screen, a tab and an --app window): the page's keydown comes first and its
//   preventDefault keeps Chromium's own History and Downloads closed.
(function () {
  "use strict";
  var SCOPE = (function () { try { return new URLSearchParams(location.search).get("scope") || ""; } catch (e) { return ""; } })();
  var URL_H = "/lab/history" + (SCOPE ? "?scope=" + encodeURIComponent(SCOPE) : "");
  var LOCAL = "ruach.history.local", MIN_HEARD = 3, CHUNK = 150;
  var KEEP = { plays: { days: 30, most: 2000 }, downloads: { days: 90, most: 1000 } };
  var H = {}, data = { plays: [], downloads: [] }, lab = null, cur = null, ui = null, tab = "plays", find = "", shown = 0, rowsNow = [];

  function tr(s) { return window.RuachI18n ? window.RuachI18n.t(s) : s; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]; }); }
  function $(id) { return document.getElementById(id); }
  function rid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function now() { return Date.now() / 1000; }
  function recall(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function toast(t, bad) { if (H.toast) H.toast(t, bad ? "bad" : ""); }
  function findTake(n) { return n && H.findTake ? H.findTake(n) : n && window.ruachFindTakeFull ? window.ruachFindTakeFull(n) : null; }
  function titleOf(t) { return t ? (H.title ? H.title(t) : t.title || t.name) : ""; }
  function clock(s) { s = Math.max(0, Math.round(s || 0)); var h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60; return (h ? h + ":" + (m < 10 ? "0" : "") : "") + m + ":" + (x < 10 ? "0" : "") + x; }
  function htmlLang() { var L = window.RuachI18n, c = L && L.lang ? L.lang() : "en", x = L && L.langs ? L.langs.filter(function (l) { return l.code === c; })[0] : null; return x ? x.html : "en"; }

  // ------------------------------------------------------------------ the store: the lab, or this browser while the lab does not know the path
  function localGet() { try { var d = JSON.parse(localStorage.getItem(LOCAL) || "null"); return d && typeof d === "object" ? { plays: d.plays || [], downloads: d.downloads || [] } : null; } catch (e) { return null; } }
  function localPut(d) { try { if (d && (d.plays.length || d.downloads.length)) localStorage.setItem(LOCAL, JSON.stringify(d)); else localStorage.removeItem(LOCAL); } catch (e) { /* the browser's room is full: the window keeps them */ } }
  function trim(d) {
    var t = now();
    Object.keys(KEEP).forEach(function (k) {
      d[k] = (d[k] || []).filter(function (x) { return t - (x.t || 0) <= KEEP[k].days * 86400; }).sort(function (a, b) { return a.t - b.t; }).slice(-KEEP[k].most);
    });
    return d;
  }
  // one op on a copy kept here: the same as the lab's (the window's own copy, and this browser's store while the lab cannot keep them)
  function apply(d, b) {
    if (b.op === "play") { if (!d.plays.some(function (x) { return x.id === b.id; })) d.plays.push(pick(b, ["id", "t", "name", "title", "of", "heard", "through", "loops", "left"])); }
    else if (b.op === "heard") {
      var r = d.plays.filter(function (x) { return x.id === b.id; })[0];
      if (r) { r.heard = Math.max(r.heard || 0, b.heard || 0); r.through = !!(r.through || b.through); r.loops = Math.max(r.loops || 0, b.loops || 0); if (b.left != null) r.left = b.left; if (b.of) r.of = b.of; }
    } else if (b.op === "download") { if (!d.downloads.some(function (x) { return x.id === b.id; })) d.downloads.push(pick(b, ["id", "t", "name", "title", "file", "fmt"])); }
    else if (b.op === "clear") { (b.kind === "all" ? ["plays", "downloads"] : [b.kind]).forEach(function (k) { d[k] = []; }); }
    else if (b.op === "drop") { d[b.kind] = d[b.kind].filter(function (x) { return (b.ids || []).indexOf(x.id) < 0; }); }
    return trim(d);
  }
  function pick(o, ks) { var r = {}; ks.forEach(function (k) { if (o[k] !== undefined) r[k] = o[k]; }); return r; }
  function send(b, beacon) {
    apply(data, b);
    if (lab === false) { localPut(apply(localGet() || { plays: [], downloads: [] }, b)); return Promise.resolve(true); }
    if (beacon && navigator.sendBeacon) { try { if (navigator.sendBeacon(URL_H, new Blob([JSON.stringify(b)], { type: "application/json" }))) return Promise.resolve(true); } catch (e) { /* the fetch below */ } }
    return fetch(URL_H, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b), keepalive: !!beacon }).then(function (r) {
      if (r.status === 404) { lab = false; localPut(apply(localGet() || { plays: [], downloads: [] }, b)); return true; }   // a lab before 2912
      lab = true;
      return r.ok;
    }).catch(function () { return false; });
  }
  // the lab's copy (and this browser's, handed over once the lab knows the path); the window shows it
  function load() {
    return fetch(URL_H).then(function (r) {
      if (r.status === 404) { lab = false; return null; }
      return r.ok ? r.json() : null;
    }).catch(function () { return null; }).then(function (d) {
      var mine = localGet();
      if (d && Array.isArray(d.plays)) {
        lab = true;
        if (d.keep) Object.keys(KEEP).forEach(function (k) { if (d.keep[k]) KEEP[k] = { days: d.keep[k].days, most: d.keep[k].most }; });
        data = trim({ plays: d.plays, downloads: d.downloads || [] });
        if (mine && (mine.plays.length || mine.downloads.length)) {
          fetch(URL_H, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "import", plays: mine.plays, downloads: mine.downloads }) })
            .then(function (r) { if (r.ok) localPut(null); }).catch(function () {});
          mine.plays.forEach(function (x) { apply(data, Object.assign({ op: "play" }, x)); });
          mine.downloads.forEach(function (x) { apply(data, Object.assign({ op: "download" }, x)); });
        }
      } else if (lab === false) data = trim(mine || { plays: [], downloads: [] });
      if (cur && cur.sent) apply(data, Object.assign({ op: "play" }, entry(cur)));
      return data;
    });
  }

  // ------------------------------------------------------------------ the plays: one hearing of a take in the player
  var audio = null;
  function entry(c) { return { id: c.id, t: c.t, name: c.name, title: c.title, of: Math.round((c.of || 0) * 100) / 100, heard: Math.round(c.heard * 100) / 100, through: c.through, loops: c.loops, left: Math.round(c.pos * 100) / 100 }; }
  function takeNow() { return H.take ? H.take() : window.ruachPlayerTake ? window.ruachPlayerTake() : null; }
  function len() { return audio && isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0; }
  function through(c) { return c.reached && c.of > 0 && c.heard >= c.of * 0.6; }
  function tell(beacon) {                              // what the hearing has come to, once it is a play
    if (!cur) return;
    cur.through = cur.through || through(cur);
    if (!cur.sent) { if (cur.heard < MIN_HEARD) return; cur.sent = true; cur.told = cur.heard; send(Object.assign({ op: "play" }, entry(cur)), beacon); return; }
    if (Math.abs(cur.heard - cur.told) < 0.5 && cur.saidThrough === cur.through && cur.saidLoops === cur.loops && cur.saidLeft === cur.pos) return;
    cur.told = cur.heard; cur.saidThrough = cur.through; cur.saidLoops = cur.loops; cur.saidLeft = cur.pos;
    send({ op: "heard", id: cur.id, heard: Math.round(cur.heard * 100) / 100, through: cur.through, loops: cur.loops, left: Math.round(cur.pos * 100) / 100, of: Math.round((cur.of || 0) * 100) / 100 }, beacon);
  }
  function finish(beacon) { if (cur) { tell(beacon); cur = null; } }
  function begin() {
    var t = takeNow();
    if (!t || t.session || !t.name) return;
    if (cur && cur.name === t.name) {                  // the same hearing: a pause let go, a loop of repeat one
      if (cur.ended && audio.currentTime < 1) cur.loops++;
      cur.ended = false; cur.pos = audio.currentTime;
      return;
    }
    finish(false);
    cur = { id: rid(), t: now(), name: t.name, title: titleOf(t), of: len() || t.seconds || 0, heard: 0, pos: audio.currentTime, reached: false, through: false, loops: 0, sent: false, told: 0, ended: false };
    cur.saidThrough = false; cur.saidLoops = 0; cur.saidLeft = -1;
  }
  function tick() {
    if (!cur || audio.paused) return;
    var t = takeNow();
    if (t && t.name !== cur.name) { begin(); return; }   // another take in the player without a load between (a session take saved, a rename)
    var p = audio.currentTime, d = p - cur.pos;
    cur.pos = p;
    if (d > 0 && d < 2) cur.heard += d;                  // a seek moves the place, it is not heard
    if (len()) cur.of = len();
    if (cur.of && p >= cur.of - 5) cur.reached = true;
    if (!cur.sent ? cur.heard >= MIN_HEARD : cur.heard - cur.told >= 30) tell(false);
  }
  function wire() {
    audio = $("audio");
    if (!audio) return;
    audio.addEventListener("playing", begin);
    audio.addEventListener("timeupdate", tick);
    audio.addEventListener("seeked", function () { if (cur) cur.pos = audio.currentTime; });
    audio.addEventListener("pause", function () { if (cur) tell(false); });
    audio.addEventListener("ended", function () { if (cur) { cur.reached = true; cur.ended = true; cur.pos = cur.of || cur.pos; tell(false); } });
    audio.addEventListener("emptied", function () { finish(false); });
    window.addEventListener("pagehide", function () { finish(true); });
  }

  // ------------------------------------------------------------------ the downloads: every a[download] the page saves through
  function fmtOf(file, href) {
    var m = /\.([A-Za-z0-9]{1,8})$/.exec(file || ""), q = /[?&]fmt=([a-z0-9]+)/i.exec(href || "");
    return (m ? m[1] : q ? q[1] : "").toLowerCase();
  }
  function saved(a) {
    var href = a.href || "", file = a.getAttribute("download") || "", name = "";
    try { var u = new URL(href, location.href); if (u.protocol !== "blob:" && u.protocol !== "data:") { name = u.searchParams.get("name") || ""; if (!file) file = decodeURIComponent(u.pathname.split("/").pop() || ""); } } catch (e) { /* no address of ours */ }
    var t = findTake(name);
    if (!t) name = "";
    send({ op: "download", id: rid(), t: now(), name: name, title: t ? titleOf(t) : file || tr("a file"), file: file, fmt: fmtOf(file, href) });
    if (ui && !ui.back.hidden && tab === "downloads") paint();
  }
  document.addEventListener("click", function (e) {
    var a = e.target && e.target.closest ? e.target.closest("a[download]") : null;
    if (a && a.href) saved(a);
  }, true);
  // a link clicked by a script without being put in the page first: its click never reaches the document
  var realClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (!this.isConnected && this.hasAttribute("download") && this.href) saved(this);
    return realClick.apply(this, arguments);
  };

  // ------------------------------------------------------------------ the window
  var X_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  function icon(n) { var I = window.HeresyIcons; return I && I.ui ? I.ui(n, "hist-ico") : ""; }
  function build() {
    if (ui) return ui;
    var back = document.createElement("div");
    back.className = "hist-back"; back.id = "histBack"; back.hidden = true;
    back.innerHTML = '<div class="hist-box" role="dialog" aria-modal="true" aria-label="' + esc(tr("History")) + '" data-no-icon>' +
      '<div class="hist-head"><div class="hist-tabs" role="tablist">' +
        '<button type="button" class="hist-tab" role="tab" data-hist-tab="plays">' + icon("history") + "<span>" + esc(tr("History")) + '</span><kbd class="hist-kbd">Ctrl+H</kbd></button>' +
        '<button type="button" class="hist-tab" role="tab" data-hist-tab="downloads">' + icon("download") + "<span>" + esc(tr("Downloads")) + '</span><kbd class="hist-kbd">Ctrl+J</kbd></button>' +
      '</div><button type="button" class="hd-x hist-x" data-hist-close aria-label="' + esc(tr("Close")) + '" data-tip="' + esc(tr("Close (Esc)")) + '">' + X_SVG + "</button></div>" +
      '<div class="hist-tools"><input type="search" class="hist-find" id="histFind" autocomplete="off" spellcheck="false" />' +
        '<span class="hist-count mono" id="histCount"></span><button type="button" class="btn ghost small hist-clear" id="histClear"></button></div>' +
      '<div class="hist-list" id="histList" role="list"></div><p class="hist-foot" id="histFoot"></p></div>';
    document.body.appendChild(back);
    ui = { back: back, list: back.querySelector("#histList"), find: back.querySelector("#histFind") };
    back.addEventListener("mousedown", function (e) { if (e.target === back) close(); });
    back.addEventListener("click", function (e) {
      var b = e.target.closest("[data-hist-tab]");
      if (b) { show(b.dataset.histTab); return; }
      if (e.target.closest("[data-hist-close]")) { close(); return; }
      if (e.target.closest("#histClear")) { clearAsk(tab); return; }
      var go = e.target.closest("[data-hist-go]");
      if (go) { goCard(go.dataset.histGo, go.textContent); return; }
      var rt = e.target.closest("[data-hist-rate]");
      if (rt) { rate(rt.dataset.name, +rt.dataset.histRate); return; }
      if (e.target.closest("[data-hist-more]")) { more(); }
    });
    ui.find.addEventListener("input", function () { find = ui.find.value; paint(); });
    ui.list.addEventListener("scroll", function () { if (ui.list.scrollTop + ui.list.clientHeight > ui.list.scrollHeight - 400) more(); });
    return ui;
  }
  function dayKey(t) { var d = new Date(t * 1000); return d.getFullYear() + "-" + d.getMonth() + "-" + d.getDate(); }
  function dayName(t) {
    var d = new Date(t * 1000), today = new Date(), y = new Date(); y.setDate(today.getDate() - 1);
    if (dayKey(t) === dayKey(today.getTime() / 1000)) return tr("Today");
    if (dayKey(t) === dayKey(y.getTime() / 1000)) return tr("Yesterday");
    var o = { weekday: "long", day: "numeric", month: "long" };
    if (d.getFullYear() !== today.getFullYear()) o.year = "numeric";
    try { return new Intl.DateTimeFormat(htmlLang(), o).format(d); } catch (e) { return d.toDateString(); }
  }
  function timeOf(t) { try { return new Intl.DateTimeFormat(htmlLang(), { hour: "2-digit", minute: "2-digit" }).format(new Date(t * 1000)); } catch (e) { return new Date(t * 1000).toTimeString().slice(0, 5); } }
  function rowsOf(k) {
    var q = find.trim().toLowerCase();
    return (data[k] || []).slice().sort(function (a, b) { return b.t - a.t; }).filter(function (x) {
      if (!q) return true;
      var t = findTake(x.name);
      return ((t ? titleOf(t) : "") + " " + (x.title || "") + " " + (x.file || "") + " " + (x.name || "")).toLowerCase().indexOf(q) >= 0;
    });
  }
  function acts(name) {
    var HC = window.HeresyCollection, t = findTake(name);
    if (!t || !HC) return "";
    var r = HC.rating ? HC.rating(name) : 0;
    return (HC.markBtns ? HC.markBtns(name, "hist-act") : "") +
      '<button type="button" class="hist-act" data-hist-rate="1" data-name="' + esc(name) + '" aria-pressed="' + (r > 0) + '" aria-label="' + esc(tr("Like")) + '" data-tip="' + esc(tr("Like")) + '">' + icon("like") + "</button>" +
      '<button type="button" class="hist-act" data-hist-rate="-1" data-name="' + esc(name) + '" aria-pressed="' + (r < 0) + '" aria-label="' + esc(tr("Dislike")) + '" data-tip="' + esc(tr("Dislike")) + '">' + icon("dislike") + "</button>";
  }
  function playSub(x) {
    if (x.through) return tr("to the end") + (x.loops ? " · ×" + (x.loops + 1) : "") + (x.of ? " · " + clock(x.of) : "");
    return tr("stopped at {0} of {1}").replace("{0}", clock(x.left || x.heard)).replace("{1}", clock(x.of));
  }
  function rowHtml(x) {
    var t = findTake(x.name), name = t ? x.name : "", title = t ? titleOf(t) : x.title || x.file || x.name;
    var art = name && window.HeresyArt && window.HeresyArt.url ? window.HeresyArt.url(name) : "";
    var cov = '<span class="hist-cov"' + (art ? ' style="background-image:url(&quot;' + esc(art) + '&quot;)"' : "") + "></span>";
    var head = name ? '<button type="button" class="hist-title" data-hist-go="' + esc(name) + '" translate="no" data-tip="' + esc(tr("Its card in the Librarian")) + '">' + esc(title) + "</button>"
      : '<span class="hist-title is-gone" translate="no">' + esc(title) + "</span>";
    var sub = tab === "plays" ? '<span class="hist-sub' + (x.through ? "" : " is-cut") + '">' + esc(playSub(x)) + (name ? "" : " · " + esc(tr(x.name ? "not in the Studio any more" : "a file of no take"))) + "</span>"
      : '<span class="hist-sub" translate="no">' + esc(x.file || "") + "</span>" + (name || !x.name ? "" : '<span class="hist-sub">' + esc(tr("not in the Studio any more")) + "</span>");
    var right = tab === "plays" ? acts(name) : (x.fmt ? '<span class="hist-fmt mono" translate="no">' + esc(x.fmt.toUpperCase()) + "</span>" : "") + acts(name);
    return '<div class="hist-row" role="listitem" data-id="' + esc(x.id) + '"><time class="hist-time mono">' + esc(timeOf(x.t)) + "</time>" + cov +
      '<span class="hist-main">' + head + sub + '</span><span class="hist-acts">' + right + "</span></div>";
  }
  function dayHead(t) {                               // the day's name, its count and (the plays) how long they were heard
    var k = dayKey(t), rows = rowsNow.filter(function (x) { return dayKey(x.t) === k; });
    var n = rows.length === 1 ? tr(tab === "plays" ? "1 play" : "1 download") : tr(rows.length + (tab === "plays" ? " plays" : " downloads")), heard = 0;
    if (tab === "plays") rows.forEach(function (x) { heard += x.heard || 0; });
    return '<div class="hist-day" role="presentation"><h4>' + esc(dayName(t)) + '</h4><span class="hist-day-n">' + esc(n) +
      (heard >= 60 ? " \u00b7 " + esc(tr("{0} heard").replace("{0}", clock(heard))) : "") + "</span></div>";
  }
  // newest first, by day; drawn in chunks as the list scrolls (two thousand rows at once would make the window slow to come)
  function paint() {
    if (!ui) return;
    Array.prototype.forEach.call(ui.back.querySelectorAll("[data-hist-tab]"), function (b) { b.setAttribute("aria-selected", b.dataset.histTab === tab ? "true" : "false"); });
    ui.find.placeholder = tr(tab === "plays" ? "Find a title" : "Find a title or a file");
    ui.find.setAttribute("aria-label", ui.find.placeholder);
    var all = data[tab] || [];
    rowsNow = rowsOf(tab);
    $("histClear").textContent = tr(tab === "plays" ? "Clear history" : "Clear downloads");
    $("histClear").disabled = !all.length;
    $("histCount").textContent = find.trim() ? tr("{0} of {1}").replace("{0}", rowsNow.length).replace("{1}", all.length) : "";
    $("histFoot").textContent = tr(tab === "plays" ? "The last {0} days, at most {1} plays: kept by the Studio, the same in every browser that opens it" : "The last {0} days, at most {1} downloads: kept by the Studio, the same in every browser that opens it")
      .replace("{0}", KEEP[tab].days).replace("{1}", KEEP[tab].most) + (lab === false ? " " + tr("(for now in this browser: the Studio's lab learns the history at its next restart)") : "");
    shown = 0;
    ui.list.innerHTML = rowsNow.length ? "" : '<p class="hist-empty">' + esc(tr(find.trim() ? "Nothing found" : tab === "plays" ? "Nothing played yet" : "Nothing downloaded yet")) + "</p>";
    ui.list.scrollTop = 0;
    more();
  }
  function more() {
    if (!ui || shown >= rowsNow.length) return;
    var end = Math.min(rowsNow.length, shown + CHUNK), html = "";
    var tail = ui.list.querySelector("[data-hist-more]");
    if (tail) tail.remove();
    for (var i = shown; i < end; i++) {
      if (!i || dayKey(rowsNow[i].t) !== dayKey(rowsNow[i - 1].t)) html += dayHead(rowsNow[i].t);
      html += rowHtml(rowsNow[i]);
    }
    shown = end;
    if (shown < rowsNow.length) html += '<button type="button" class="btn ghost small hist-more" data-hist-more>' + esc(tr("Older")) + "</button>";
    ui.list.insertAdjacentHTML("beforeend", html);
  }
  function show(k) {
    tab = k === "downloads" ? "downloads" : "plays";
    build();
    if (ui.back.hidden) {
      ui.back.hidden = false;
      ui.back.dataset.tab = tab;
      ui.list.innerHTML = '<p class="hist-empty">' + esc(tr("Loading…")) + "</p>";
      load().then(function () { if (!ui.back.hidden) paint(); });
      setTimeout(function () { try { ui.find.focus({ preventScroll: true }); } catch (e) { /* hidden again */ } }, 0);
    } else paint();
    ui.back.dataset.tab = tab;
  }
  function close() { if (ui && !ui.back.hidden) { ui.back.hidden = true; find = ""; ui.find.value = ""; } }
  function isOpen(k) { return !!ui && !ui.back.hidden && (!k || tab === k); }
  function goCard(name, label) {
    if (!findTake(name)) return toast(tr("Not in the Studio any more: “{0}”").replace("{0}", label || name), true);
    close();
    if (H.go) H.go(name);
  }
  function rate(name, v) {
    var HC = window.HeresyCollection;
    if (!HC || !HC.rate) return;
    var next = HC.rating(name) === v ? 0 : v, p = HC.rate(name, next);
    var paintActs = function () { if (!ui) return; Array.prototype.forEach.call(ui.list.querySelectorAll('.hist-row [data-hist-rate][data-name="' + (window.CSS && CSS.escape ? CSS.escape(name) : name) + '"]'), function (b) { var r = HC.rating(name); b.setAttribute("aria-pressed", String(+b.dataset.histRate === 1 ? r > 0 : r < 0)); }); if (HC.paintMarks) HC.paintMarks(name); if (H.changed) H.changed(); };
    paintActs();
    if (p && p.then) p.then(paintActs).catch(function (e) { paintActs(); toast(e && e.message || String(e), true); });
  }
  function clearAsk(k) {
    var D = window.HeresyDialog, n = (data[k] || []).length;
    var go = function () { return send({ op: "clear", kind: k }).then(function () { if (ui && !ui.back.hidden) paint(); toast(tr(k === "plays" ? "The history of plays is cleared" : "The history of downloads is cleared")); }); };
    var ask = k === "plays" ? tr("Clear the history of plays?\n\nEvery play it keeps goes ({0}); the takes themselves stay.") : tr("Clear the history of downloads?\n\nEvery download it keeps goes ({0}); the files you saved stay where you saved them.");
    ask = ask.replace("{0}", n);
    var p = D && D.confirm ? D.confirm(ask, { ok: tr("Clear it") }) : Promise.resolve(window.confirm(ask));
    return p.then(function (yes) { if (yes) return go(); });
  }
  // Engine → Defaults: its Clear buttons ask first, the window or not; the count comes from the lab
  function clearFromDefaults(k) { return load().then(function () { return clearAsk(k); }); }

  // ------------------------------------------------------------------ the buttons: ☰'s row and Engine → Defaults (Viktor 20.11.2026, ~21:30: none in any
  // player, «пытливые увидят»)
  function sync() { /* nothing of its own to paint since then */ }
  document.addEventListener("click", function (e) {
    var o = e.target.closest && e.target.closest("[data-hist-open]");
    if (o) {
      var pop = $("headMorePop"), hb = $("headMore");
      if (pop && pop.contains(o)) { pop.classList.add("is-hidden"); if (hb) hb.setAttribute("aria-expanded", "false"); }
      if (isOpen(o.dataset.histOpen)) close(); else show(o.dataset.histOpen);
      return;
    }
    var c = e.target.closest && e.target.closest("[data-hist-clear-now]");
    if (c) clearFromDefaults(c.dataset.histClearNow);
  });
  // Ctrl+H and Ctrl+J, any keyboard layout (the key's place: KeyH, KeyJ); the page's keydown comes before the browser's own History and Downloads
  document.addEventListener("keydown", function (e) {
    if (!e.ctrlKey || e.altKey || e.shiftKey || e.metaKey) return;
    var k = e.code === "KeyH" || (!e.code && (e.key || "").toLowerCase() === "h") ? "plays" : e.code === "KeyJ" || (!e.code && (e.key || "").toLowerCase() === "j") ? "downloads" : "";
    if (!k || e.defaultPrevented) return;                          // a song's box keeps its own Ctrl+H, find and replace (heresy-find.js, first)
    e.preventDefault();
    if (document.querySelector(".hd-back.is-on")) return;           // a question open: it is answered first
    if (isOpen(k)) close(); else show(k);
  }, true);
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape" || !isOpen() || document.querySelector(".hd-back.is-on, .hreact-pal")) return;
    e.preventDefault(); e.stopPropagation();
    close();
  }, true);

  function init(hooks) { H = hooks || {}; sync(); }
  wire();
  window.HeresyHistory = { init: init, sync: sync, open: show, close: close, isOpen: isOpen, clear: clearAsk, load: load,
    state: function () { return { lab: lab, cur: cur ? entry(cur) : null, plays: data.plays.length, downloads: data.downloads.length, keep: KEEP }; } };   // for the checks
})();
