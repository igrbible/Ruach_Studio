// HERESY 1289 (Viktor 10.10.2026: «И нужно в Engine добавить докачку моделей и LoRA»): the Engine's Models and LoRAs card, over
// the lab's weights.py, which runs heresy/fetch-heresy.sh. What the install brings, part by part, as its last whole run found it
// (the install's own run too: the card says it at once and asks no one); a part not whole lists what is not here and has its
// Fetch, and one Fetch takes everything missing, each asked with its size first; a download cut short goes on where it stopped.
// The extras (another backbone, the style listener, the Artist's painter, the trainer's base) a row each, with their variants
// and sizes, a variant here said so. While a run goes, its words; when it is over, what came; where a backbone, a decoder or
// the sliders came, that the engine lists them at its next start (Restart the engine, where the studio runs as a service).
// A test page (?scope=…) fetches nothing: the lab refuses.
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
    var hm = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return d.toDateString() === now.toDateString() ? hm : d.toLocaleDateString() + " " + hm;
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
        (ok && !now ? "" : '<button type="button" class="btn ghost small" data-wt-part="' + esc(p.part) + '"' + (busy ? " disabled" : "") + ">" + esc(tr(now ? "Fetching…" : "Fetch")) + "</button>") + "</div>" +
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
      var pick = S.pick[e.name] || (going({ extra: e.name }) && job().which.variant) || (e.variants.filter(function (v) { return !v.here; })[0] || e.variants[0]).id;
      var v = e.variants.filter(function (x) { return x.id === pick; })[0] || e.variants[0];
      return '<div class="wt-extra" data-extra="' + esc(e.name) + '"><div class="wt-x-name"><b>' + esc(tr(e.label)) + "</b><span>" + esc(tr(e.what)) + "</span></div>" +
        '<select data-wt-pick="' + esc(e.name) + '" aria-label="' + esc(tr(e.label)) + '">' + e.variants.map(function (x) {
          return '<option value="' + esc(x.id) + '"' + (x.id === v.id ? " selected" : "") + ">" + esc((x.label || x.id) + " · " + x.size + (x.here ? " · " + tr("here") : "")) + "</option>";
        }).join("") + "</select>" +
        '<button type="button" class="btn ghost small" data-wt-extra="' + esc(e.name) + '"' + (busy || v.here || !d.script ? " disabled" : "") + ">" +
          esc(tr(going({ extra: e.name, variant: v.id }) ? "Fetching…" : v.here ? "Here" : "Fetch")) + "</button>" +
        (going({ extra: e.name }) ? progress() : "") + "</div>";      // HERESY 1302
    }).join("");
    paintLog(job());
    var j = job();
    $("wtRestart").hidden = !(j && j.status !== "running" && j.restart);
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
  var HOW = "Each file comes at the revision the release pins and is checked against its size; a download cut short goes on where it stopped.";
  function fetchPart(name) {
    var p = parts().filter(function (x) { return x.part === name; })[0];
    if (!p) return;
    start({ part: name }, tr("Fetch {0}?").replace("{0}", tr(p.label)) + "\n\n" + tr("About {0}.").replace("{0}", p.size) + " " + tr(HOW));
  }
  function fetchAll() {
    var need = parts().filter(function (p) { return !whole(p); });
    var list = need.length ? need.map(function (p) { return "· " + tr(p.label) + " (" + p.size + ")"; }).join("\n") : tr("Everything the install brings that is not here.");
    start({ part: "missing" }, tr("Fetch what is missing?") + "\n\n" + list + "\n\n" + tr(HOW));
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
    var id = asked || S.pick[name] || (e.variants.filter(function (v) { return !v.here; })[0] || e.variants[0]).id;
    var v = e.variants.filter(function (x) { return x.id === id; })[0];
    if (!v || v.here) return;
    var body = {};
    body[name] = v.id;
    start(body, tr("Fetch {0}: {1} ({2})?").replace("{0}", tr(e.label)).replace("{1}", v.label || v.id).replace("{2}", v.size) +
      (v.note ? "\n\n" + tr(v.note.charAt(0).toUpperCase() + v.note.slice(1)) + "." : "") + "\n\n" + tr(AFTER[name] || "") + " " + tr(HOW));
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
        toast(/as a service/.test(e.message) ? tr("The studio does not run as a service here (Pinokio, or ./start.sh by hand): stop it and start it again there, and the engine lists what came.")
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
  window.HeresyWeights = { init: init, load: load, fetchExtra: fetchExtra,   // HERESY 1347: for the Artist's own list
    state: function () { return { data: S.data, running: running(), pick: S.pick }; } };
})();
