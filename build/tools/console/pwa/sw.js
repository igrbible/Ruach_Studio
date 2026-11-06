// HERESY 2024 (Viktor 02.11.2026: «Десктоп делаем с добрым PWA. Как ты решил, так и делаем»): the Studio as an app in a window of its own.
// A kind worker: it keeps nothing of the Studio (no page, no takes, no answers) and lets every request go as the browser sends it. Only a page
// asked for while the Studio does not answer (no network to it, or the https door's 502 and 504) gets a short page that says so in the
// browser's language and tries again every five seconds.
// HERESY 2139 (the refactor plan's D3): it asks /health (15 bytes) whether the Studio is back, not the page (17 MB, then once more on the reload)
"use strict";
const OFF = {
  en: ["Ruach Studio is not running", "The Studio on this machine does not answer. Start it (its launcher, or systemctl --user start ruach-studio); this window tries again every five seconds."],
  ru: ["Ruach Studio не запущена", "Студия на этой машине не отвечает. Её нужно запустить (лаунчером или systemctl --user start ruach-studio); окно пробует снова каждые пять секунд."],
  uk: ["Ruach Studio не запущена", "Студія на цій машині не відповідає. Її треба запустити (лаунчером або systemctl --user start ruach-studio); вікно пробує знову кожні п'ять секунд."],
  be: ["Ruach Studio не запушчана", "Студыя на гэтай машыне не адказвае. Яе трэба запусціць (лаўнчарам або systemctl --user start ruach-studio); акно спрабуе зноў кожныя пяць секунд."],
  de: ["Ruach Studio läuft nicht", "Das Studio auf diesem Rechner antwortet nicht. Starte es (mit seinem Launcher oder systemctl --user start ruach-studio); dieses Fenster versucht es alle fünf Sekunden erneut."],
  el: ["Το Ruach Studio δεν τρέχει", "Το Στούντιο σε αυτό το μηχάνημα δεν απαντά. Ξεκίνησέ το (με τον εκκινητή του ή systemctl --user start ruach-studio)· αυτό το παράθυρο ξαναδοκιμάζει κάθε πέντε δευτερόλεπτα."],
  es: ["Ruach Studio no está en marcha", "El Estudio de esta máquina no responde. Ponlo en marcha (con su lanzador o systemctl --user start ruach-studio); esta ventana lo intenta de nuevo cada cinco segundos."],
  fr: ["Ruach Studio ne tourne pas", "Le Studio de cette machine ne répond pas. Lance-le (son lanceur, ou systemctl --user start ruach-studio) ; cette fenêtre réessaie toutes les cinq secondes."],
  it: ["Ruach Studio non è avviato", "Lo Studio su questa macchina non risponde. Avvialo (con il suo launcher o systemctl --user start ruach-studio); questa finestra riprova ogni cinque secondi."],
  ja: ["Ruach Studio は起動していません", "このマシンの Studio が応答しません。起動してください（ランチャー、または systemctl --user start ruach-studio）。このウィンドウは 5 秒ごとに再試行します。"],
  pt: ["O Ruach Studio não está a correr", "O Estúdio desta máquina não responde. Inicie-o (pelo lançador ou systemctl --user start ruach-studio); esta janela tenta de novo a cada cinco segundos."],
  zh: ["Ruach Studio 未在运行", "这台机器上的 Studio 没有响应。请启动它（用启动器，或 systemctl --user start ruach-studio）；此窗口每五秒重试一次。"],
};
function offline() {
  const lang = String((self.navigator && self.navigator.language) || "en").slice(0, 2).toLowerCase(), t = OFF[lang] || OFF.en;
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return "<!doctype html><html lang=\"" + (OFF[lang] ? lang : "en") + "\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">" +
    "<title>" + esc(t[0]) + "</title><style>html,body{margin:0;height:100%;background:#14110e;color:#efe6da;font:16px/1.5 system-ui,sans-serif}" +
    "main{max-width:none;height:100%;display:grid;place-content:center;padding:0 24px;text-align:center}h1{font-weight:600;font-size:22px;color:#e8a33d;margin:0 0 8px}" +
    "p{margin:0;color:#b9ad9f}code{font:14px ui-monospace,monospace;color:#efe6da}</style></head><body><main><h1>" + esc(t[0]) + "</h1><p>" +
    esc(t[1]).replace("systemctl --user start ruach-studio", "<code>systemctl --user start ruach-studio</code>") + "</p></main><script>" +
    "setInterval(function(){fetch(\"/health\",{cache:\"no-store\"}).then(function(r){if(r.ok)location.reload();},function(){});},5000);</script></body></html>";
}
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  if (e.request.mode !== "navigate") return;                  // the API, the takes, the pictures: the browser's own way, untouched
  const down = () => new Response(offline(), { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
  e.respondWith(fetch(e.request).then((r) => (r.status === 502 || r.status === 504 ? down() : r), down));
});
