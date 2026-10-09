// Ruach Studio for Pinokio (HERESY 1259): the update, through pinokio/update.sh (bash, the same from a terminal).
module.exports = {
  run: [{
    method: "shell.run",
    params: {
      path: "..",
      message: "bash pinokio/update.sh",
      on: [{ event: "/ruach update stopped:[^\\n]*/", break: true }, { event: "/error:/i", break: false }, { event: "/errno /i", break: false }]
    }
  }]
}
