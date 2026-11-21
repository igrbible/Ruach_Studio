// HERESY 2892 (Viktor 15.11.2026: «Прогресс бар нашей звуковой волны, или колёсико загрузки в такие ожидания как закон»; «корявая и неуклюжая» of
// the loader's wave): a wait says itself with the Studio's own small sound wave before its words, never with words alone. Nine slender bars, a
// swell travelling along them (still under reduced motion), in the theme's accent; the markup only, so it goes into any line a room draws.
//   HeresyWait.wave() → '<span class="wait-wave" aria-hidden="true">…</span>' · HeresyWait.lead(el) puts one before an element's words
(function () {
  "use strict";
  var BARS = "";
  for (var i = 0; i < 9; i++) BARS += '<b style="--h:' + (0.3 + 0.7 * Math.pow(Math.sin(Math.PI * (i + 0.5) / 9), 1.2)).toFixed(3) + ";--d:" + (-i * 0.12).toFixed(2) + 's"></b>';
  function wave() { return '<span class="wait-wave" aria-hidden="true">' + BARS + "</span>"; }
  function lead(el) { if (el && !el.querySelector(".wait-wave")) el.insertAdjacentHTML("afterbegin", wave()); }
  window.HeresyWait = { wave: wave, lead: lead };
})();
