// Ruach Studio for Pinokio (HERESY 1259): the models the studio starts without, through pinokio/extras.sh; each is asked first
// with its size, answered with y or n in the terminal.
module.exports = {
  run: [{
    method: "shell.run",
    params: {
      path: "..",
      message: "bash pinokio/extras.sh",
      on: [{ event: "/ruach models stopped:[^\\n]*/", break: true }, { event: "/error:/i", break: false }, { event: "/errno /i", break: false }]
    }
  }]
}
