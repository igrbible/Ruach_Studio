// Ruach Studio for Pinokio (HERESY 1259): Reset, through pinokio/reset.sh: the Python environments and the engine's build only;
// the songs, the models and the settings stay.
module.exports = {
  run: [{
    method: "shell.run",
    params: {
      path: "..",
      message: "bash pinokio/reset.sh",
      on: [{ event: "/error:/i", break: false }, { event: "/errno /i", break: false }]
    }
  }]
}
