// Ruach Studio for Pinokio, Linux with an NVIDIA card only, and unsupported (HERESY 3001; Viktor 25.11.2026: «Windows-ветку Pinokio вырезай
// полностью», «Поддержка Pinokio окружения минимальна»). The menu runs the native install and start, the same as from a terminal
// (INSTALL.md): launcher/install.sh --yes, then the lab and start.sh. No extras, update or reset here: launcher/extras.sh, update.sh and
// reset.sh run from a terminal. On Windows and macOS the menu only points to the Studio's own packages.
const RELEASES = "https://github.com/igrbible/Ruach_Studio/releases"
module.exports = {
  version: "4.0",
  title: "Ruach Studio",
  description: "Linux + NVIDIA only, unsupported. Ruach Studio: the YuE2 Studio for local AI music generation. On Windows and macOS: the Studio's own packages from GitHub releases.",
  icon: "src/brand/ruach-icon-512.png",
  menu: async (kernel, info) => {
    if (process.platform !== "linux") return [
      { default: true, icon: "fa-solid fa-circle-xmark", text: "Linux + NVIDIA only. On Windows and macOS: the Studio's own package (GitHub releases)", href: RELEASES }
    ]
    if (info.running("launcher/install.js")) return [{ default: true, icon: "fa-solid fa-plug", text: "Installing", href: "launcher/install.js" }]
    if (!info.exists(".venv/bin/python") || !info.exists("build/build/yue-server")) return [
      { default: true, icon: "fa-solid fa-plug", text: "Install (Linux + NVIDIA only, unsupported)", href: "launcher/install.js" }
    ]
    if (info.running("launcher/start.js")) {
      const url = (info.local("launcher/start.js") || {}).url
      if (!url) return [{ default: true, icon: "fa-solid fa-terminal", text: "Starting", href: "launcher/start.js" }]
      return [
        { default: true, icon: "fa-solid fa-music", text: "Open the Studio", href: url },
        { icon: "fa-solid fa-terminal", text: "Terminal", href: "launcher/start.js" }
      ]
    }
    return [{ default: true, icon: "fa-solid fa-power-off", text: "Start", href: "launcher/start.js" }]
  }
}
