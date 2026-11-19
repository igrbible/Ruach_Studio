// HERESY 2721 (Viktor 18.11.2026, on the resource audit of the day: «Нужно лечить и вводить умные режимы idle_ui, focused_room/unfocused_room, и
// подобное. Единственное, что оставляем в активе — nvidia-smi для студийных логгеров ресурсов и ресурсного бара»): how awake the page is, said in
// one place and asked by every job of the page that repeats (a timer, a poll, an animation):
//   idle_ui         the tab hidden, or no hand on the page (pointer, key, wheel, touch) for IDLE_MIN minutes while nothing plays
//   focused_room    the room in front (the Engine is that room while it is open over the others)
//   unfocused_room  every other room
// A job registered with every(ms, fn, rules) runs every ms in its focused room, by its rules elsewhere (unfocused, idle seen, hidden: a period, 0 for
// none), and at once when its mode wakes; a job of its own kind asks mode(room) and hears each change through on(fn(why, room before)). In idle_ui the endless CSS
// animations stand still (html.is-idle-ui, app.css). Awake in every mode: the cards' sampling that feeds the resource loggers and the system bar
// (heresy-gpulive.js), in idle_ui once in 50 s: inside the lab's minute and its four minutes of samples, so its rings lose nothing.
(function () {
  "use strict";
  var IDLE_MIN = 5, last = Date.now(), idle = false, front = "", subs = [], jobs = [];
  function frontRoom() {
    var eng = document.getElementById("view-engine");
    return eng && !eng.classList.contains("is-hidden") ? "engine" : (document.body && document.body.dataset.tab) || "";
  }
  function playing() { return Array.prototype.some.call(document.querySelectorAll("audio, video"), function (m) { return !m.paused && !m.ended; }); }
  function mode(room) { return idle ? "idle_ui" : !room || room === front ? "focused_room" : "unfocused_room"; }
  function period(j) {
    var m = mode(j.room);
    return m === "focused_room" ? j.ms : m === "unfocused_room" ? j.unfocused : document.hidden ? j.hidden : j.idle;
  }
  function run(j) { j.at = Date.now(); try { j.fn(); } catch (e) { if (window.console) console.error(e); } }
  function wake(j) {                                 // a mode that asks more often runs the job at once
    var p = period(j) || Infinity;
    if (p < j.was && Date.now() - j.at >= Math.min(p, 1000)) run(j);
    j.was = p;
  }
  function look() {                                  // the mode as it stands now, told to all when it changed
    var i = document.hidden || (Date.now() - last > IDLE_MIN * 60000 && !playing()), f = frontRoom();
    if (i === idle && f === front) return;
    var was = idle, wasFront = front;
    idle = i; front = f;
    if (was !== i) document.documentElement.classList.toggle("is-idle-ui", i);
    var why = was !== i ? (i ? "idle" : "awake") : "room";
    subs.slice().forEach(function (fn) { try { fn(why, wasFront); } catch (e) { if (window.console) console.error(e); } });
    jobs.forEach(wake);
  }
  function hand() { last = Date.now(); if (idle && !document.hidden) look(); }
  // fn every ms in focused_room; rules.room: its room ("" for the whole page: focused unless idle); rules.unfocused, rules.idle (seen, untouched),
  // rules.hidden: its period there, 0 for none (unfocused: none for a room's job, every ms for the page's)
  function every(ms, fn, rules) {
    rules = rules || {};
    var j = { ms: ms, fn: fn, room: rules.room || "", unfocused: rules.unfocused != null ? rules.unfocused : rules.room ? 0 : ms,
              idle: rules.idle || 0, hidden: rules.hidden || 0, at: 0, was: Infinity };
    j.was = period(j) || Infinity;
    jobs.push(j);
    setInterval(function () { var p = period(j); if (p && Date.now() - j.at >= p - ms / 2) run(j); }, ms);
    return j;
  }
  ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"].forEach(function (t) { document.addEventListener(t, hand, { capture: true, passive: true }); });
  document.addEventListener("visibilitychange", function () { if (!document.hidden) last = Date.now(); look(); });
  setInterval(look, 15000);                          // the minutes without a hand
  function watch() {
    look();
    if (!window.MutationObserver) return;
    new MutationObserver(look).observe(document.body, { attributes: true, attributeFilter: ["data-tab"] });
    var eng = document.getElementById("view-engine");
    if (eng) new MutationObserver(look).observe(eng, { attributes: true, attributeFilter: ["class"] });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", watch); else watch();
  window.HeresyIdle = { mode: mode, every: every, on: function (fn) { subs.push(fn); }, idle: function () { return idle; }, room: function () { return front; },
                        poke: hand, minutes: IDLE_MIN, rest: function () { last = 0; look(); } };   // rest: for the checks, the page as if untouched five minutes
})();
