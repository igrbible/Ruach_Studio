// Ruach Studio for Pinokio (HERESY 1259): the update, through launcher/update.sh (bash, the same from a terminal).
module.exports = {
  run: [{
    method: "shell.run",
    params: {
      path: "..",
      message: "bash launcher/update.sh",
      input: true,   // HERESY 2929: its questions answered here (the models' [Y/n]); Pinokio takes no keyboard without it
      on: [{ event: "/ruach update stopped:[^\\n]*/", break: true }, { event: "/error:/i", break: false }, { event: "/errno /i", break: false }]
    }
  }]
}
