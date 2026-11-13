// HERESY 1289 (Viktor 10.10.2026: «И нужно в Engine добавить докачку моделей и LoRA»): the Engine's Models and LoRAs card, over
// the lab's weights.py, which runs heresy/fetch-heresy.sh. What the install brings, part by part, as its last whole run found it
// (the install's own run too: the card says it at once and asks no one); a part not whole lists what is not here and has its
// Fetch, and one Fetch takes everything missing, each asked with its size first; a download cut short goes on where it stopped.
// The extras (another backbone, the style listener, the Artist's painter, the trainer's base) a row each, with their variants
// and sizes, a variant here said so. While a run goes, its words; when it is over, what came; where a backbone, a decoder or
// the sliders came, that the engine lists them at its next start (Restart the engine, where the Studio runs as a service).
// A test page (?scope=…) fetches nothing: the lab refuses.
// HERESY 1984 (Viktor 01.11.2026: «в Движке может даже оформить скачивание скопом по тем же Tiers, замеряя свободное место на диске и честно
// предупреждая о нестаче места на диске»): By room, a tier a row: a room's models at this machine's card, what is here, what is left; Fetch the
// tier only when the disk has room for it and 2 GB to spare (the lab refuses too), and every Fetch's question says the disk's free room.
//
//   HeresyWeights.init(hooks) · HeresyWeights.load() · HeresyWeights.state()   (the last for the checks)
(function () {
  "use strict";
  var S = { data: null, timer: 0, hooks: {}, pick: {}, was: "" };
  var STATES = { here: 1, differs: 1, missing: 1, fetched: 1, unknown: 1, failed: 1 };
  function $(id) { return document.getElementById(id); }
  function tr(s) { return window.RuachI18n ? window.RuachI18n.t(s) : s; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function toast(t, k) { if (S.hooks.toast) S.hooks.toast(t, k); }
  function gb(b) {
    if (b == null || !isFinite(b)) return "";
    return b >= Math.pow(2, 30) ? (b / Math.pow(2, 30)).toFixed(1) + " GB" : Math.max(0, Math.round(b / Math.pow(2, 20))) + " MB";
  }
  function dur(sec) {
    sec = Math.max(0, Math.round(sec));
    if (sec < 60) return sec + " s";
    var m = Math.round(sec / 60);
    return m < 60 ? m + " min" : Math.floor(m / 60) + " h " + (m % 60) + " min";
  }
  function cap(s) { s = String(s || ""); return s.charAt(0).toUpperCase() + s.slice(1); }
  // HERESY 1302: a fetch's progress at the row pressed: what the disk took against the size the card said (decimal, as said)
  function dgb(b) { return b >= 1e9 ? (b / 1e9).toFixed(1) + " GB" : Math.max(0, Math.round(b / 1e6)) + " MB"; }
  // HERESY 1984: «7.2 GB», «618 MB» → bytes (decimal, as the sizes are measured); the disk's free room said, or its shortfall
  function bytes(s) { var m = /^\s*(\d+(?:\.\d+)?)\s*(GB|MB)\b/.exec(String(s || "")); return m ? parseFloat(m[1]) * (m[2] === "GB" ? 1e9 : 1e6) : 0; }
  function room(b) {
    var d = S.data || {}, f = d.free, spare = d.spare || 0;
    if (f == null) return "";
    if (b && b + spare > f) return "⚠ " + tr("Not enough room on this disk: {0} free, {1} short with 2 GB to spare.").replace("{0}", dgb(f)).replace("{1}", dgb(b + spare - f));
    return tr("{0} free on this disk.").replace("{0}", dgb(f));
  }
  function last(s) { return s ? "\n\n" + s : ""; }   // the free room, said last in a Fetch's question
  function going(which) {
    var j = job();
    if (!(j && j.status === "running" && j.kind === "fetch" && j.which)) return false;
    return Object.keys(which).every(function (k) { return j.which[k] === which[k]; });
  }
  function progress() {
    var j = job(), d = S.data || {}, w = j.written || 0, t = d.now && j.started ? dur(d.now - j.started) : "";
    var pct = j.expect ? Math.min(99, Math.round(100 * w / j.expect)) : null;
    var say = j.checking ? tr("Checking what came…") : j.expect ? tr("Fetching… " + dgb(w) + " of about " + dgb(j.expect)) : tr("Fetching… " + dgb(w));
    return '<div class="wt-prog' + (pct === null ? " is-open" : "") + '" role="progressbar"' + (pct === null ? "" : ' aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100"') +
      '><i' + (pct === null ? "" : ' style="width:' + pct + '%"') + "></i></div>" +
      '<div class="wt-prog-say">' + esc(say) + (t ? " · " + esc(t) : "") + (pct === null ? "" : " · " + pct + " %") + "</div>";
  }
  function when(t) {
    var d = new Date(t * 1000), now = new Date();
    var L = window.RuachI18n && window.RuachI18n.locales ? window.RuachI18n.locales() : undefined;   // HERESY 1826: in the page's language
    var hm = d.toLocaleTimeString(L, { hour: "2-digit", minute: "2-digit" });
    return d.toDateString() === now.toDateString() ? hm : d.toLocaleDateString(L) + " " + hm;
  }
  function scoped(path) {                                      // a test page says so to the lab, which then fetches nothing
    var m = /[?&]scope=([^&#]+)/.exec(location.search);
    return m ? path + (path.indexOf("?") < 0 ? "?" : "&") + "scope=" + m[1] : path;
  }
  function lab(path, body) {
    var opt = body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {};
    return fetch("/lab" + (body ? scoped(path) : path), opt)
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || "HTTP " + r.status); return d; }); });
  }
  function seen() { var v = $("view-engine"); return !!(v && !v.classList.contains("is-hidden")); }
  function job() { return (S.data && S.data.job) || null; }
  function running() { var j = job(); return !!(j && j.status === "running"); }
  function parts() { return (S.data && S.data.last && S.data.last.parts) || []; }
  // HERESY 1296: «differs» is a copy of one's own, kept (the Forge's voices: the published tensors, their readers' names still in the header)
  function whole(p) { return p.rows.every(function (r) { return r.state === "here" || r.state === "fetched" || r.state === "differs"; }); }

  function load() {
    clearTimeout(S.timer);
    return lab("/weights").then(take).catch(function (e) {
      $("wtLine").textContent = tr("The lab does not answer:") + " " + e.message;
    }).then(schedule);
  }
  // a run's end, seen once: what came, the LoRA list asked again, and the restart said where the engine needs one
  function take(d) {
    var j = d.job, was = S.was;
    S.data = d;
    S.was = j ? j.status + ":" + j.started : "";
    if (j && j.status !== "running" && was === "running:" + j.started && j.kind === "fetch") {
      var c = j.counts || {};
      toast(tr("{0}: {1} fetched, {2} failed").replace("{0}", cap(tr(j.what))).replace("{1}", c.fetched || 0).replace("{2}", c.failed || 0), c.failed ? "bad" : "good");
      if (S.hooks.props) S.hooks.props();
    }
    paint();
    try { window.dispatchEvent(new CustomEvent("ruach-weights", { detail: d })); } catch (e) { /* an old browser: the Artist asks again itself */ }   // HERESY 1347
  }
  // while the card is seen and a run goes: every 1.5 s (a reopened Engine asks again)
  function schedule() {
    clearTimeout(S.timer);
    if (seen() && running()) S.timer = setTimeout(load, 1500);
  }

  // HERESY 2528: an icon of the Studio's set, its word inside unseen (a reader says it; the checks and the catalogs read it)
  function wtIco(name, word) { return (window.HeresyIcons ? window.HeresyIcons.ui(name, "ib-svg") : "") + '<span class="ib-label">' + esc(word) + "</span>"; }
  function paint() {
    var d = S.data;
    if (!d || !$("wtParts")) return;
    var busy = running();
    paintLine(d);
    $("wtParts").innerHTML = parts().map(function (p) {
      var bad = p.rows.filter(function (r) { return r.state !== "here"; }), ok = whole(p);
      var here = p.rows.length - bad.length, own = p.rows.filter(function (r) { return r.state === "differs"; }).length;
      var sum = (ok ? tr("all here") : tr("{0} here, {1} not").replace("{0}", here).replace("{1}", bad.filter(function (r) { return r.state !== "fetched" && r.state !== "differs"; }).length)) +
        (own ? " · " + tr("own copies kept: " + own) : "");
      var now = going({ part: p.part });             // HERESY 1302: its fetch under way, here
      return '<div class="wt-part' + (ok ? " is-whole" : "") + (now ? " is-going" : "") + '" data-part="' + esc(p.part) + '">' +
        '<div class="wt-head"><b>' + esc(tr(p.label)) + '</b><span class="wt-size">' + esc(p.size) + '</span><span class="wt-sum">' + esc(sum) + "</span>" +
        (ok && !now ? "" : '<button type="button" class="btn ghost small' + (now ? "" : " btn-icon") + '" data-wt-part="' + esc(p.part) + '"' + (busy ? " disabled" : "") + (now ? "" : ' data-tip="' + esc(tr("Fetch") + " · " + p.size) + '"') + ">" +
          (now ? esc(tr("Fetching…")) : wtIco("download", tr("Fetch"))) + "</button>") + "</div>" +   // HERESY 2528: an icon, its word kept for a reader
        (now ? progress() : "") +
        (bad.length ? '<ul class="wt-rows">' + bad.map(function (r) {
          return '<li class="wt-row"><span class="wt-st is-' + esc(r.state) + '">' + esc(tr(r.state)) + '</span><code translate="no">' + esc(r.text) + "</code></li>";
        }).join("") + "</ul>" : "") + "</div>";
    }).join("");
    var all = $("wtFetch");
    all.hidden = !d.script || (!!d.last && parts().every(whole) && !going({ part: "missing" }));
    all.disabled = busy;
    all.textContent = tr(going({ part: "missing" }) ? "Fetching…" : "Fetch what is missing");   // HERESY 1302
    var top = $("wtProg");                           // HERESY 1302: «what is missing» has no one row: under the card's line
    if (top) { top.hidden = !going({ part: "missing" }); top.innerHTML = top.hidden ? "" : progress(); }
    $("wtCheck").disabled = busy || !d.script;
    $("wtExtras").innerHTML = (d.extras || []).map(function (e) {
      var pick = S.pick[e.name] || (going({ extra: e.name }) && job().which.variant) || e.suggest || (e.variants.filter(function (v) { return !v.here; })[0] || e.variants[0]).id;   // HERESY 1834: the suggested size first
      var v = e.variants.filter(function (x) { return x.id === pick; })[0] || e.variants[0];
      return '<div class="wt-extra" data-extra="' + esc(e.name) + '"><div class="wt-x-name"><b>' + esc(tr(e.label)) + "</b><span>" + esc(tr(e.what)) + "</span></div>" +
        '<select data-hc-pick="1" data-wt-pick="' + esc(e.name) + '" aria-label="' + esc(tr(e.label)) + '">' + e.variants.map(function (x) {
          return '<option value="' + esc(x.id) + '"' + (x.id === v.id ? " selected" : "") + ">" + esc((x.label || x.id) + " · " + x.size + (x.here ? " · " + tr("here") : "")) + "</option>";
        }).join("") + "</select>" +
        // HERESY 2528 (the UIX audit 13.11.2026, №12: «Есть» and «Скачать» as buttons in every row): here a check, else a download, the size in the tip
        (going({ extra: e.name, variant: v.id }) ? '<button type="button" class="btn ghost small" data-wt-extra="' + esc(e.name) + '" disabled>' + esc(tr("Fetching…")) + "</button>" :
          '<button type="button" class="btn ghost small btn-icon' + (v.here ? " is-here" : "") + '" data-wt-extra="' + esc(e.name) + '"' + (busy || v.here || !d.script ? " disabled" : "") +
          ' data-tip="' + esc(v.here ? tr("here") + " · " + v.size : tr("Fetch") + " · " + (v.label || v.id) + " · " + v.size) + '">' + wtIco(v.here ? "check" : "download", tr(v.here ? "Here" : "Fetch")) + "</button>") +
        (going({ extra: e.name }) ? progress() : "") + "</div>";      // HERESY 1302
    }).join("");
    paintTiers(d, busy);                             // HERESY 1984
    paintLog(job());
    var j = job();
    $("wtRestart").hidden = !(j && j.status !== "running" && j.restart);
  }
  // HERESY 1984: By room, a tier a row; the disk's free room above them
  function paintTiers(d, busy) {
    var el = $("wtTiers"), fr = $("wtFree");
    if (!el) return;
    if (fr) fr.textContent = d.free == null ? "" : tr("{0} free on this disk.").replace("{0}", dgb(d.free));
    el.innerHTML = (d.tiers || []).map(function (t) {
      var now = going({ tier: t.id }), short = d.free != null && t.need > 0 && t.need + (d.spare || 0) > d.free;
      var size = !t.items.length ? tr("not on this machine: it needs {0}").replace("{0}", tr(t.why))
        : !t.need ? tr("all here") + " · " + dgb(t.total)
        : tr("up to {0} to fetch").replace("{0}", dgb(t.need)) + (t.need < t.total ? " · " + tr("{0} in all").replace("{0}", dgb(t.total)) : "");
      var items = t.items.map(function (i) {
        return '<li class="wt-t-item' + (i.here ? " is-here" : "") + '"><span>' + esc(tr(i.label)) + " · " + esc(tr(i.vlabel)) + '</span><span class="wt-size"> · ' +
          esc(i.size) + (i.here ? " · " + esc(tr("here")) : "") + "</span></li>";
      }).join("");
      var can = t.items.length && t.need > 0;
      return '<div class="wt-tier' + (now ? " is-going" : "") + (short ? " is-short" : "") + (t.items.length && !t.need ? " is-whole" : "") + '" data-tier="' + esc(t.id) + '">' +
        '<div class="wt-head"><b>' + esc(tr(t.label)) + '</b><span class="wt-size wt-sum">' + esc(size) + "</span>" +
        (can ? '<button type="button" class="btn ghost small' + (now ? "" : " btn-icon") + '" data-wt-tier="' + esc(t.id) + '"' + (busy || short || !d.script ? " disabled" : "") +
          (now ? "" : ' data-tip="' + esc(tr(short ? "Not enough room" : "Fetch the tier") + " · " + size) + '"') + ">" +
          (now ? esc(tr("Fetching…")) : wtIco(short ? "triangle-alert" : "download", tr(short ? "Not enough room" : "Fetch the tier"))) + "</button>" : "") + "</div>" +   // HERESY 2528
        '<div class="wt-t-what">' + esc(tr(t.what)) + "</div>" +
        (items ? '<ul class="wt-t-items">' + items + "</ul>" : "") +
        (short ? '<div class="wt-t-short">' + esc(tr("Not enough room on this disk: up to {0} and 2 GB to spare, {1} free; {2} short.")
          .replace("{0}", dgb(t.need)).replace("{1}", dgb(d.free)).replace("{2}", dgb(t.need + (d.spare || 0) - d.free))) + "</div>" : "") +
        (now ? progress() : "") + "</div>";
    }).join("");
  }
  function paintLine(d) {
    var el = $("wtLine"), j = d.job, txt, cls = "";
    if (!d.script) txt = tr("This tree has no heresy/fetch-heresy.sh: nothing to check or fetch from here.");
    else if (j && j.status === "running") {
      var phase = j.kind === "check" ? tr("checking") : j.checking ? tr("checking what is here after it") : tr("fetching");
      txt = cap(tr(j.what)) + ": " + phase + "… " + dur(d.now - j.started) +
        (j.written >= 1048576 ? " · " + tr("the disk has {0} less free than when it began").replace("{0}", gb(j.written)) : "");
    } else if (j && j.kind === "fetch") {
      var c = j.counts || {};
      txt = tr("{0}: {1} fetched, {2} failed, in {3}.").replace("{0}", cap(tr(j.what))).replace("{1}", c.fetched || 0).replace("{2}", c.failed || 0).replace("{3}", dur(j.ended - j.started)) +
        (j.restart ? " " + tr("The engine lists a new backbone or decoder at its next start.") : "");
      cls = c.failed || j.status === "failed" ? "is-bad" : "is-good";
    } else if (d.last && d.last.counts) {
      var n = d.last.counts;
      txt = tr("The last {0} ({1}): {2} here, {3} missing, {4} failed.").replace("{0}", tr(d.last.mode === "check" ? "check" : "fetch")).replace("{1}", when(d.last.at))
        .replace("{2}", n.here).replace("{3}", n.missing).replace("{4}", n.failed) + (n.unknown ? " " + tr("{0} unknown: the pinned file list could not be read (offline?).").replace("{0}", n.unknown) : "");
    } else txt = tr("No check has run here yet: Check again says what is here.");
    el.textContent = txt;
    el.className = "upd-line wt-line " + cls;
  }
  function paintLog(j) {
    var el = $("wtLog");                  // a run's words while it goes, and a fetch's after it (a check's verdicts are the parts)
    el.hidden = !(j && j.lines && j.lines.length && (j.status === "running" || j.kind === "fetch"));
    if (el.hidden) return;
    var stick = el.scrollTop + el.clientHeight >= el.scrollHeight - 8;
    el.innerHTML = j.lines.map(function (l) {
      var m = /^(\w+)(\s+)(.*)$/.exec(l);
      return m && STATES[m[1]] ? '<span class="wt-st is-' + m[1] + '">' + m[1] + "</span>" + m[2] + esc(m[3]) : esc(l);
    }).join("\n");
    if (stick || running()) el.scrollTop = el.scrollHeight;
  }

  function start(body, ask, ok) {
    if (running()) return;
    return window.HeresyDialog.confirm(ask, { ok: ok || tr("Fetch") }).then(function (yes) {
      if (!yes) return;
      return lab("/weights/fetch", body).then(function (d) { take(d); schedule(); });
    }).catch(function (e) { toast(tr("Not fetched:") + " " + e.message, "bad"); });
  }
  // night 11→12.11.2026 (Viktor 11.11: «предлагаем им кнопку скачать, ввести их HF токен без сохранения как одноразовый ввод в поле, и если модель
  // потребует гейта, объясняем, что нужно идти по этой-то ссылке, согласиться с условиями и подождать… Стрессуем, что наша Руах Студия не нарушает ни
  // одного лицензионного ограничения… есть неудобства, и они однократные. Не перегружаем страницу и оверлеи»): a licence-bound or gated extra's repos
  // are asked at their pins first (POST /lab/weights/access: nothing fetched); its licence goes into the Fetch's question, whose button then says
  // «Accept and fetch»; a gate asks the user's token once, in a password field nothing keeps: it goes with this one fetch, and the field is emptied
  var ACCEPT = "Fetching it means you accept its licence. Ruach Studio breaks none of its terms: it fetches from the authors' own repository, mirrors nothing and keeps no token. Any inconvenience is once only.";
  function licenceNote(e) {
    var l = e && e.licence;
    if (!l) return "";
    return "\n\n" + tr("Licence: {0}").replace("{0}", l.name + " · " + l.url) +
      (l.also ? "\n" + tr("Licence: {0}").replace("{0}", l.also.name + " · " + l.also.url) : "") + "\n\n" + tr(ACCEPT);
  }
  function gate(e) {                                 // → a promise of {token} to go on with, or null (cancelled, or said why not)
    if (!e || !e.access || !e.access.length) return Promise.resolve({ token: null });
    return lab("/weights/access", { extra: e.name }).then(function (r) {
      var gone = r.repos.filter(function (x) { return x.state === "gone" || x.state === "error"; });
      if (gone.length) {
        window.HeresyDialog.alert(tr("{0} is no longer on Hugging Face at the commit this release pins (deleted, made private or moved). Nothing was fetched.").replace("{0}", gone.map(function (x) { return x.repo; }).join(", ")));
        return null;
      }
      if (r.repos.some(function (x) { return x.state === "offline"; })) {
        window.HeresyDialog.alert(tr("Hugging Face did not answer: try again when the network is back."));
        return null;
      }
      return r.ready ? { token: null } : askToken(e, r);
    });
  }
  function askToken(e, r) {
    return new Promise(function (resolve) {
      var gated = r.repos.filter(function (x) { return x.state === "login" || x.state === "wait"; });
      var link = function (href, text) { return '<a href="' + esc(href) + '" target="_blank" rel="noopener noreferrer" translate="no">' + esc(text) + "</a>"; };
      var back = document.createElement("div"), before = document.activeElement;
      back.className = "hd-back";
      back.innerHTML = '<div class="hd-box wt-gate" role="dialog" aria-modal="true">' +
        '<div class="hd-title">' + esc(tr("{0} is gated on Hugging Face").replace("{0}", tr(e.label))) + "</div>" +
        '<ol class="wt-gate-steps"><li>' + esc(tr("Once only: open its page, sign in and accept its conditions:")) + " " +
          gated.map(function (x) { return link(x.link, x.repo) + (x.gated === "manual" ? ' <span class="wt-gate-manual">(' + esc(tr("its authors approve each request by hand: wait for their e-mail")) + ")</span>" : ""); }).join(" · ") +
        "</li><li>" + esc(tr("Then paste a Hugging Face access token (read). It goes with this one download and is saved nowhere:")) + " " +
          link("https://huggingface.co/settings/tokens", "huggingface.co/settings/tokens") + "</li></ol>" +
        '<form class="wt-gate-form" autocomplete="off"><input type="password" class="hd-input" name="hf-once" autocomplete="off" spellcheck="false" ' +
          'placeholder="hf_…" aria-label="' + esc(tr("Hugging Face token")) + '" /></form>' +
        '<div class="wt-gate-said" aria-live="polite"></div>' +
        '<div class="hd-acts"><button type="button" class="btn ghost small hd-no">' + esc(tr("Cancel")) + "</button>" +
        '<button type="button" class="btn small primary hd-yes">' + esc(tr("Check and fetch")) + "</button></div></div>";
      document.body.appendChild(back);
      var input = back.querySelector(".hd-input"), yes = back.querySelector(".hd-yes"), said = back.querySelector(".wt-gate-said");
      function close(token) {
        input.value = "";                            // the field forgets it the moment the dialog goes
        back.remove();
        document.removeEventListener("keydown", key, true);
        if (before && before.focus) before.focus();
        resolve(token ? { token: token } : null);
      }
      function key(ev) {
        if (ev.key === "Escape") { ev.preventDefault(); close(null); }
        else if (ev.key === "Enter" && document.activeElement === input) { ev.preventDefault(); go(); }
      }
      function go() {
        var t = input.value.trim();
        if (!/^hf_[A-Za-z0-9]{20,}$/.test(t)) { said.textContent = tr("That is not a Hugging Face token (it begins with hf_)."); return; }
        yes.disabled = true;
        said.textContent = "";
        lab("/weights/access", { extra: e.name, hf_token: t }).then(function (v) {
          yes.disabled = false;
          if (v.token && v.token.ok === false) { said.textContent = tr("Hugging Face does not know this token."); return; }
          if (v.repos.some(function (x) { return x.state === "login" || x.state === "wait"; })) {
            said.textContent = tr("Your account is not let in yet: accept the conditions on the model's page, or wait for its authors' yes."); return;
          }
          if (!v.ready) { said.textContent = tr("Hugging Face did not answer: try again when the network is back."); return; }
          close(t);
        }, function (err) { yes.disabled = false; said.textContent = err.message; });
      }
      back.querySelector(".hd-no").addEventListener("click", function () { close(null); });
      back.querySelector(".wt-gate-form").addEventListener("submit", function (ev) { ev.preventDefault(); go(); });
      yes.addEventListener("click", go);
      document.addEventListener("keydown", key, true);
      requestAnimationFrame(function () { back.classList.add("is-on"); input.focus(); });   // as HeresyDialog shows its own
    });
  }
  var HOW = "Each file comes at the revision the release pins and is checked against its size; a download cut short goes on where it stopped.";
  function fetchPart(name) {
    var p = parts().filter(function (x) { return x.part === name; })[0];
    if (!p) return;
    start({ part: name }, tr("Fetch {0}?").replace("{0}", tr(p.label)) + "\n\n" + tr("About {0}.").replace("{0}", p.size) + " " + tr(HOW) + last(room(bytes(p.size))));   // HERESY 1984
  }
  function fetchAll() {
    var need = parts().filter(function (p) { return !whole(p); });
    var list = need.length ? need.map(function (p) { return "· " + tr(p.label) + " (" + p.size + ")"; }).join("\n") : tr("Everything the install brings that is not here.");
    start({ part: "missing" }, tr("Fetch what is missing?") + "\n\n" + list + "\n\n" + tr(HOW) + last(room(need.reduce(function (s, p) { return s + bytes(p.size); }, 0))));   // HERESY 1984
  }
  var AFTER = { backbone: "The engine lists it at its next start; Compute then offers it.",
                listener: "The Trainer's listener hears a set's songs with it; a GGUF one needs llama.cpp built in vendor/llama.cpp (the fetch says how).",
                artwork: "The Artist paints with it.",
                qwen: "The Artist offers it under Painter.",   // HERESY 1323
                "qwen-fine": "The Artist offers it under Fine-tune.",   // HERESY 1347
                "art-loras": "The Artist's LoRA library shows them under their painters.",
                trainer: "The Trainer starts from it." };
  function fetchExtra(name, asked) {                 // HERESY 1347: a variant asked by its id (the Artist's list), else the one picked
    var e = ((S.data && S.data.extras) || []).filter(function (x) { return x.name === name; })[0];
    if (!e) return;
    var id = asked || S.pick[name] || e.suggest || (e.variants.filter(function (v) { return !v.here; })[0] || e.variants[0]).id;   // HERESY 1834
    var v = e.variants.filter(function (x) { return x.id === id; })[0];
    if (!v || v.here) return;
    var body = {};
    body[name] = v.id;
    if (running()) return;
    return gate(e).then(function (g) {               // night 11→12.11.2026: its licence and its gates first, the token once
      if (!g) return;
      if (g.token) body.hf_token = g.token;
      return start(body, tr("Fetch {0}: {1} ({2})?").replace("{0}", tr(e.label)).replace("{1}", v.label || v.id).replace("{2}", v.size) +
        (v.note ? "\n\n" + tr(v.note.charAt(0).toUpperCase() + v.note.slice(1)) + "." : "") + "\n\n" + tr(AFTER[name] || "") + " " + tr(HOW) + licenceNote(e) + last(room(bytes(v.size))),   // HERESY 1984
        e.licence ? tr("Accept and fetch") : null);
    }).then(function () { delete body.hf_token; }, function (err) { delete body.hf_token; toast(tr("Not fetched:") + " " + err.message, "bad"); });
  }
  // HERESY 1984: a tier: what it brings, each with what it is (its licence among it), its size and the disk's free room; the lab fetches it item by item
  function fetchTier(id) {
    var d = S.data || {}, t = (d.tiers || []).filter(function (x) { return x.id === id; })[0];
    if (!t || running()) return;
    var todo = t.items.filter(function (i) { return !i.here; }), seen = {};
    var list = todo.map(function (i) { return "· " + tr(i.label) + ": " + tr(i.vlabel) + " (" + i.size + ")"; }).join("\n");
    var what = todo.map(function (i) {
      if (seen[i.extra]) return "";
      seen[i.extra] = 1;
      var e = (d.extras || []).filter(function (x) { return x.name === i.extra; })[0];
      return e ? tr(e.label) + ": " + tr(e.what) + "." : "";
    }).filter(Boolean).join("\n\n");
    if (d.free != null && t.need + (d.spare || 0) > d.free) {
      window.HeresyDialog.alert(tr("Not enough room on this disk: up to {0} and 2 GB to spare, {1} free; {2} short.")
        .replace("{0}", dgb(t.need)).replace("{1}", dgb(d.free)).replace("{2}", dgb(t.need + (d.spare || 0) - d.free)));
      return;
    }
    // night 11→12.11.2026: a tier with a licence-bound extra asks its gates first; a gated one is fetched from its own row, where the token is asked
    var bound = todo.map(function (i) { return (d.extras || []).filter(function (x) { return x.name === i.extra; })[0]; })
      .filter(function (x, n, all) { return x && x.access && all.indexOf(x) === n; });
    var notes = bound.map(licenceNote).join("");
    return bound.reduce(function (p, x) {
      return p.then(function (ok) {
        if (!ok) return false;
        return lab("/weights/access", { extra: x.name }).then(function (r) {
          if (r.ready) return true;
          window.HeresyDialog.alert(r.repos.some(function (y) { return y.state === "login" || y.state === "wait"; })
            ? tr("{0} is gated on Hugging Face: fetch it from its own row first, where your token is asked once.").replace("{0}", tr(x.label))
            : r.repos.some(function (y) { return y.state === "offline"; }) ? tr("Hugging Face did not answer: try again when the network is back.")
            : tr("{0} is no longer on Hugging Face at the commit this release pins (deleted, made private or moved). Nothing was fetched.").replace("{0}", x.label));
          return false;
        });
      });
    }, Promise.resolve(true)).then(function (ok) {
      if (!ok) return;
      return start({ tier: id }, tr("Fetch the {0} tier?").replace("{0}", tr(t.label)) + "\n\n" + list + "\n\n" +
        tr("Up to {0}; {1} free on this disk.").replace("{0}", dgb(t.need)).replace("{1}", d.free == null ? "?" : dgb(d.free)) + "\n\n" + what + "\n\n" + tr(HOW) + notes,
        bound.some(function (x) { return x.licence; }) ? tr("Accept and fetch") : tr("Fetch the tier"));
    }).catch(function (err) { toast(tr("Not fetched:") + " " + err.message, "bad"); });
  }
  function check() {
    if (running()) return;
    return lab("/weights/check", {}).then(function (d) { take(d); schedule(); })
      .catch(function (e) { toast(tr("Not checked:") + " " + e.message, "bad"); });
  }
  // the engine reads its backbones, decoders and sliders when it starts: a restart where it runs as a service, else said how
  function restart() {
    return window.HeresyDialog.confirm(tr("Restart the engine?") + "\n\n" + tr("It then lists what came; the page reconnects by itself. Nothing may be rendering."), { ok: tr("Restart") })
      .then(function (yes) {
        if (!yes) return;
        return lab("/studio/restart", {}).then(function () {
          toast(tr("The engine restarts…"));
          var tries = 0;
          (function wait() {
            setTimeout(function () {
              fetch("/hardware").then(function (r) { if (!r.ok) throw new Error(); toast(tr("The engine is back"), "good"); if (S.hooks.props) S.hooks.props(); })
                .catch(function () { if (++tries < 60) wait(); });
            }, 2000);
          })();
        });
      }).catch(function (e) {
        toast(/as a service/.test(e.message) ? tr("The Studio does not run as a service here (Pinokio, or ./start.sh by hand): stop it and start it again there, and the engine lists what came.")
          : tr("Not restarted:") + " " + e.message, "bad");
      });
  }

  function init(hooks) {
    S.hooks = hooks || {};
    var card = $("modelsCard");
    if (!card) return;
    card.addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (!b || b.disabled) return;
      if (b.dataset.wtPart) fetchPart(b.dataset.wtPart);
      else if (b.dataset.wtExtra) fetchExtra(b.dataset.wtExtra);
      else if (b.dataset.wtTier) fetchTier(b.dataset.wtTier);        // HERESY 1984
      else if (b.id === "wtFetch") fetchAll();
      else if (b.id === "wtCheck") check();
      else if (b.id === "wtRestart") restart();
    });
    card.addEventListener("change", function (e) {
      var s = e.target.closest("select[data-wt-pick]");
      if (!s) return;
      S.pick[s.dataset.wtPick] = s.value;
      paint();
    });
    window.addEventListener("ruach-lang", paint);
  }
  window.HeresyWeights = { init: init, load: load, fetchExtra: fetchExtra, fetchTier: fetchTier,   // HERESY 1347: for the Artist's own list; 1984
    state: function () { return { data: S.data, running: running(), pick: S.pick }; } };
})();
