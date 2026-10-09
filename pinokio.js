// Ruach Studio for Pinokio (HERESY 1259, Viktor 09.10.2026: «Пиши pinokio.js… Давай в RC3 включаем»). This is the menu; the work
// is done by the bash scripts in pinokio/, the same ones that run from a terminal. Without Pinokio: INSTALL.md.
module.exports = {
  version: "4.0",
  title: "Ruach Studio",
  description: "Songs on your own NVIDIA card: YuE2 through yue2.cpp, with a Creator, a Writer, a Refiner, a Librarian, an Artist and a Trainer. Linux, a card of 12 GB or more.",
  icon: "src/brand/ruach-icon-512.png",
  menu: async (kernel, info) => {
    const running = (script) => info.running("pinokio/" + script)
    if (running("install.js")) return [{ default: true, icon: "fa-solid fa-plug", text: "Installing", href: "pinokio/install.js" }]
    if (running("update.js")) return [{ default: true, icon: "fa-solid fa-rotate", text: "Updating", href: "pinokio/update.js" }]
    if (running("extras.js")) return [{ default: true, icon: "fa-solid fa-download", text: "Downloading models", href: "pinokio/extras.js" }]
    if (running("reset.js")) return [{ default: true, icon: "fa-solid fa-broom", text: "Resetting", href: "pinokio/reset.js" }]
    const installed = info.exists(".venv/bin/python") && info.exists("build/build/yue-server") && info.exists("models/YuE2-Vae-F32.gguf")
    if (!installed) return [{ default: true, icon: "fa-solid fa-plug", text: "Install", href: "pinokio/install.js" }]
    if (running("start.js")) {
      const url = info.local("pinokio/start.js").url
      if (!url) return [{ default: true, icon: "fa-solid fa-terminal", text: "Starting", href: "pinokio/start.js" }]
      return [
        { default: true, icon: "fa-solid fa-music", text: "Open the studio", href: url },
        { icon: "fa-solid fa-terminal", text: "Terminal", href: "pinokio/start.js" }
      ]
    }
    return [
      { default: true, icon: "fa-solid fa-power-off", text: "Start", href: "pinokio/start.js" },
      { icon: "fa-solid fa-download", text: "More models (each asked first, with its size)", href: "pinokio/extras.js" },
      { icon: "fa-solid fa-rotate", text: "Update", href: "pinokio/update.js" },
      { icon: "fa-solid fa-plug", text: "Install again", href: "pinokio/install.js" },
      { icon: "fa-solid fa-broom", text: "Reset (Python and the engine's build; songs and models stay)", href: "pinokio/reset.js" }
    ]
  }
}
