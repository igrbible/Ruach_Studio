// Ruach Studio for Pinokio (HERESY 1259): the lab, then the studio, each in a terminal of its own as their systemd units run them
// (pinokio/lab.sh, pinokio/studio.sh). When the server listens, its address goes to the menu: «Open the studio».
// The lab and the engine log the errors of jobs as they go: no reason to stop the studio, so Pinokio's own «error:» stop is off.
const quiet = [{ event: "/error:/i", break: false }, { event: "/errno /i", break: false }]
module.exports = {
  daemon: true,
  run: [{
    method: "shell.run",
    params: {
      path: "..",
      message: "bash pinokio/lab.sh",
      on: [{ event: "/heresy-lab (already )?on :\\d+/", done: true }, { event: "/ruach start stopped:[^\\n]*/", break: true }, ...quiet]
    }
  }, {
    method: "shell.run",
    params: {
      path: "..",
      message: "bash pinokio/studio.sh",
      on: [{ event: "/Listening on http:\\/\\/[^\\s:]+:(\\d+)/", done: true }, { event: "/ruach start stopped:[^\\n]*/", break: true }, ...quiet]
    }
  }, {
    method: "local.set",
    params: { url: "http://127.0.0.1:{{input.event[1]}}" }
  }]
}
