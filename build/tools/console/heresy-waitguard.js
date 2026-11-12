// HERESY 2319 (Viktor 10.11.2026: «если все ресурсы заняты, не просто ставить в очередь… в очереди будет стоять генерация либо в музыканте, либо в чтеце…
// очередь там час, ё-моё, это ненормально… ставить такого сторожа и реально уведомлять, что извиняй, это придётся целый час ждать. Либо ждём и блокируем
// последующие очереди по музыке и ТТС, либо просто снимаем с очереди этот трек»): the wait guard. Before a song or a reading is queued the lab says how
// long it would wait behind long work (GET /lab/waitguard: the Videographer's MiniMax H3 and SeedVR2, the Artist, a training, the lab's other jobs, each
// by its own progress; unknown said as unknown, never 0). Above Engine → Defaults' «Ask before music or speech waits longer than» (10 minutes by
// default) the Studio asks: Wait, and the music and speech asked after it wait behind it (the lab keeps the hold, POST /lab/waitguard/hold), or
// Take it off the queue. While such a job waits, a later song or reading that would wait too is not queued: the Studio says which one waits, and
// offers to take that one off instead.
//   HeresyWaitGuard.ask(kind, {label, group, engine, tier, card}) -> Promise<false | {hold}>: kind "music" or "reader". A song that is to wait is held
//   here until the cards are free (the promise resolves then); a reading is queued at once (the lab's run waits itself) and its hold bound to it
//   (bind(hold, runId)), so the later ones wait behind it until it begins.
(function () {
  "use strict";
  var KEY = "yue2.waitAsk", POLL_MS = 15000, LONG = { videographer: 1, artist: 1, training: 1, other: 1 };
  var groups = {};                                     // a song's versions: the answer given for the first, kept for the rest of its group

  function recall(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function toast(t, kind) { if (window.HeresyToast) window.HeresyToast(t, kind || ""); }
  function minutes() { var v = recall(KEY); if (v === null || v === "") return 10; var n = Number(v); return isFinite(n) && n >= 0 ? n : 10; }
  function mins(s) { return Math.max(1, Math.round(s / 60)); }
  function lab(path, body) {
    var opt = body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
    return fetch("/lab" + path, opt).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (b) {
        if (!r.ok) { var e = new Error(b.error || ("HTTP " + r.status)); e.status = r.status; throw e; }
        return b;
      });
    });
  }
  function query(kind, o, hold) {
    var q = "kind=" + encodeURIComponent(kind);
    ["group", "engine", "tier", "card"].forEach(function (k) { if (o[k] !== undefined && o[k] !== null && o[k] !== "") q += "&" + k + "=" + encodeURIComponent(o[k]); });
    if (hold) q += "&hold=" + encodeURIComponent(hold);
    return lab("/waitguard?" + q);
  }

  function workLine(b) {
    var where = (b.cards || []).length === 1 ? "GPU " + b.cards[0] : (b.cards || []).length > 1 ? "GPU " + b.cards.join("+") : "";
    var what = b.what;                                  // its own words alone (a take's name or a count would keep the line from its catalog)
    if (b.eta_s === null || b.eta_s === undefined) return where ? what + " on " + where + ": how long it has left is not known" : what + ": how long it has left is not known";
    return where ? what + " on " + where + ": about " + mins(b.eta_s) + " min left" : what + ": about " + mins(b.eta_s) + " min left";
  }
  function waitWords(d) {
    if (d.wait_s === null || d.wait_s === undefined) return { title: "This would wait, and how long is not known", ok: "Wait (how long is not known; music and speech wait behind it)" };
    if (!d.known) return { title: "This would wait at least " + mins(d.wait_s) + " min", ok: "Wait (at least " + mins(d.wait_s) + " min; music and speech wait behind it)" };
    return { title: "This would wait about " + mins(d.wait_s) + " min", ok: "Wait (about " + mins(d.wait_s) + " min; music and speech wait behind it)" };
  }
  // whether to ask: past the line, or of a length not known behind a long work (a job of the lab of its own whose time is not known does not ask)
  function long(d, line) {
    if (!(d.behind || []).length) return false;
    if (d.wait_s !== null && d.wait_s !== undefined && d.wait_s >= line) return true;
    return !d.known && d.behind.some(function (b) { return (b.eta_s === null || b.eta_s === undefined) && LONG[b.room]; });
  }

  // a song asked to wait: held here until the cards are free, its hold kept alive by the asking; taken off (here or by another ask), it is not sent
  function waitFree(o, hold, label) {
    return new Promise(function (resolve, reject) {
      function look() {
        query("music", o, hold).then(function (d) {
          if (d.hold_state === "cancelled") { reject(new Error("Taken off the queue: “" + label + "”")); return; }
          if (d.hold_state === "gone") lab("/waitguard/hold", { id: hold, kind: "music", label: label, group: o.group || "", wait_s: d.wait_s }).catch(function () { /* asked again next time */ });
          if (!(d.behind || []).length) {
            lab("/waitguard/release", { id: hold }).catch(function () { /* it goes when no one asks */ });
            toast("The cards are free: “" + label + "” goes now");
            resolve({ hold: null });
            return;
          }
          setTimeout(look, POLL_MS);
        }).catch(function () { setTimeout(look, POLL_MS); });   // a lab that does not answer for a moment: asked again
      }
      setTimeout(look, POLL_MS);
    });
  }

  function ask(kind, opts) {
    var o = opts || {}, line = minutes() * 60, label = String(o.label || "").trim() || (kind === "music" ? "the song" : "the reading");
    if (!line) return Promise.resolve({ hold: null });                  // «never ask»
    if (o.group && groups[o.group] === "off") return Promise.reject(new Error("Taken off the queue: “" + label + "”"));
    if (!window.HeresyDialog) return Promise.resolve({ hold: null });
    return query(kind, o).catch(function (e) {
      console.warn("the wait guard could not ask the lab:", e.message);   // a lab that does not answer does not stop the Studio (it cannot know)
      return null;
    }).then(function (d) {
      if (!d) return { hold: null };
      if (d.held && (d.behind || []).length) {                         // another job waits already: this one would pile up behind it
        var h = d.held;
        return window.HeresyDialog.confirm("“" + h.label + "” waits for the cards\n\nYou chose to wait for it" +
          (h.wait_s ? " (about " + mins(h.wait_s) + " min)" : "") + "; music and speech asked after it wait behind it, so “" + label + "” is not queued now.",
          { ok: "Take “" + h.label + "” off the queue", cancel: "Keep it waiting", danger: true }).then(function (off) {
          if (!off) {
            if (o.group) groups[o.group] = "off";                    // the song's other versions are not asked again
            throw new Error("Not queued: “" + h.label + "” waits for the cards first");
          }
          return lab("/waitguard/release", { id: h.id, cancel: true }).then(function () {
            toast("Taken off the queue: “" + h.label + "”");
            return ask(kind, o);
          });
        });
      }
      if (!long(d, line)) return { hold: null };
      var w = waitWords(d);
      var text = w.title + "\n\nThe cards " + (kind === "music" ? "the song needs" : "the reading needs") + " are busy with long work:\n" +
        d.behind.map(function (b) { return "· " + workLine(b); }).join("\n") + "\n\nMusic and speech asked after it wait behind it.";
      return window.HeresyDialog.confirm(text, { ok: w.ok, cancel: "Take it off the queue" }).then(function (yes) {
        if (!yes) {
          if (o.group) groups[o.group] = "off";
          throw new Error("Taken off the queue: “" + label + "”");
        }
        return lab("/waitguard/hold", { kind: kind, label: label, group: o.group || "", wait_s: d.wait_s }).then(function (r) {
          if (kind !== "music") {
            toast(d.wait_s ? "Queued to wait: “" + label + "” (about " + mins(d.wait_s) + " min)" : "Queued to wait: “" + label + "”");
            return { hold: r.id };
          }
          toast(d.wait_s ? "Waiting for the cards: “" + label + "” goes when they are free (about " + mins(d.wait_s) + " min)"
                         : "Waiting for the cards: “" + label + "” goes when they are free");
          return waitFree(o, r.id, label);
        });
      });
    });
  }
  // a reading queued with its hold: the lab lets the later ones go when it begins (or ends, or is taken off)
  function bind(hold, ref) { if (hold) return lab("/waitguard/ref", { id: hold, ref: ref }).catch(function () { /* the hold goes by itself in 90 s */ }); return Promise.resolve(); }
  function drop(hold) { if (hold) return lab("/waitguard/release", { id: hold }).catch(function () { /* the same */ }); return Promise.resolve(); }

  window.HeresyWaitGuard = { ask: ask, bind: bind, drop: drop, minutes: minutes };
})();
