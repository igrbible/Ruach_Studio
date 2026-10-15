// Ruach Studio for Pinokio (HERESY 1259, Viktor 09.10.2026: «Пиши pinokio.js… Давай в RC3 включаем»). This is the menu; the work
// is done by the bash scripts in launcher/, the same ones that run from a terminal. Without Pinokio: INSTALL.md.
// HERESY 1352 (Viktor 11.10.2026: «Добро, переименовывай pinokio/ → launcher/»): Pinokio keeps an app's ENVIRONMENT in a folder
// named pinokio/ when one is there, while its environment page reads it beside pinokio.js (the page answered 500). Until rc5 the
// scripts lived in pinokio/: an update from such a tree leaves there what Pinokio wrote, and an Update the old scripts began stops
// halfway (their pinokio/env.sh is gone). While nothing of ours runs, the old folder is moved out of Pinokio's way (its ENVIRONMENT
// to the root unless one is there, the rest under tmp/), and the menu offers to finish the update.
const fs = require("fs")
const path = require("path")
const OLD = path.join(__dirname, "pinokio")
const UNFINISHED = path.join(__dirname, "tmp", "update-unfinished")   // launcher/update.sh writes it after its pull, removes it at its end
const moveOld = () => {
  try {
    if (!fs.existsSync(OLD) || fs.existsSync(path.join(OLD, "install.sh"))) return   // no old folder, or the old scripts themselves
    const env = path.join(OLD, "ENVIRONMENT"), here = path.join(__dirname, "ENVIRONMENT")
    if (fs.existsSync(env) && !fs.existsSync(here)) fs.renameSync(env, here)
    fs.mkdirSync(path.dirname(UNFINISHED), { recursive: true })
    fs.renameSync(OLD, path.join(__dirname, "tmp", "pinokio-until-rc5-" + new Date().toISOString().replace(/[:.]/g, "-")))
    fs.writeFileSync(UNFINISHED, "the launcher's scripts moved from pinokio/ to launcher/ (HERESY 1352): Update sets this version up\n")
  } catch (e) {}
}
module.exports = {
  version: "4.0",
  title: "Ruach Studio",
  description: "Songs on your own NVIDIA card: YuE2 through yue2.cpp, with a Creator, a Writer, a Refiner, a Librarian, an Artist and a Trainer. Linux, a card of 12 GB or more, about 30 GB of disk.",
  icon: "src/brand/ruach-icon-512.png",
  menu: async (kernel, info) => {
    // where a script of ours runs from: launcher/, or pinokio/ while an Update the old scripts began goes on
    const running = (script) => ["launcher/", "pinokio/"].map((d) => d + script).find((p) => info.running(p))
    let p
    if ((p = running("install.js"))) return [{ default: true, icon: "fa-solid fa-plug", text: "Installing", href: p }]
    if ((p = running("update.js"))) return [{ default: true, icon: "fa-solid fa-rotate", text: "Updating", href: p }]
    if ((p = running("extras.js"))) return [{ default: true, icon: "fa-solid fa-download", text: "Downloading models", href: p }]
    if ((p = running("reset.js"))) return [{ default: true, icon: "fa-solid fa-broom", text: "Resetting", href: p }]
    const started = running("start.js")
    if (!started) moveOld()
    const installed = info.exists(".venv/bin/python") && info.exists("build/build/yue-server") && info.exists("models/YuE2-Vae-F32.gguf")
    if (!installed) return [{ default: true, icon: "fa-solid fa-plug", text: "Install", href: "launcher/install.js" }]
    if (started) {
      const url = info.local(started).url
      if (!url) return [{ default: true, icon: "fa-solid fa-terminal", text: "Starting", href: started }]
      return [
        // HERESY 1433: the port named where the user clicks (the studio's own is 7777)
        { default: true, icon: "fa-solid fa-music", text: "Open the studio · port " + (url.match(/:(\d+)\/?$/) || [, "80"])[1], href: url },
        { icon: "fa-solid fa-terminal", text: "Terminal", href: started }
      ]
    }
    if (fs.existsSync(UNFINISHED)) return [
      { default: true, icon: "fa-solid fa-rotate", text: "Finish the update (it stopped before this version was set up)", href: "launcher/update.js" },
      { icon: "fa-solid fa-power-off", text: "Start as it is", href: "launcher/start.js" }
    ]
    return [
      { default: true, icon: "fa-solid fa-power-off", text: "Start", href: "launcher/start.js" },
      { icon: "fa-solid fa-download", text: "More models (each asked first, with its size)", href: "launcher/extras.js" },
      { icon: "fa-solid fa-rotate", text: "Update", href: "launcher/update.js" },
      { icon: "fa-solid fa-plug", text: "Install again", href: "launcher/install.js" },
      { icon: "fa-solid fa-broom", text: "Reset (Python and the engine's build; songs and models stay)", href: "launcher/reset.js" }
    ]
  }
}
