// HERESY 2900 (Viktor 20.11.2026 on №70, his answer to the BEFORE/AFTER page: keep the separate windows; «one monitor: everything in the one window, the
// detach buttons greyed with the reason in their tip; two or more: small detach buttons open the Program monitor and the DAW mixer in their own popup
// windows»): the screens counted without asking (screen.isExtended, no permission prompt: getScreenDetails is asked only to place a window on the
// other screen), and told when they change (screen's own change event).
//   HeresyScreens.many() → true (two or more), false (one), null (the browser cannot say: the buttons as before)   HeresyScreens.on(fn)
(function () {
  "use strict";
  var subs = [];
  function many() { try { return typeof window.screen.isExtended === "boolean" ? window.screen.isExtended : null; } catch (e) { return null; } }
  function told() { var m = many(); subs.forEach(function (f) { try { f(m); } catch (e) { /* one listener's fault stays its own */ } }); }
  try { if (window.screen && window.screen.addEventListener) window.screen.addEventListener("change", told); } catch (e) { /* no event: as it was at load */ }
  window.HeresyScreens = { many: many, on: function (f) { subs.push(f); }, told: told };
})();
