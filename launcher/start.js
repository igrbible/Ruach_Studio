// Ruach Studio for Pinokio, Linux + NVIDIA only, unsupported (HERESY 3001): the native start as INSTALL.md gives it by hand, each part in a
// terminal of Pinokio's: the lab (lab/lab.py in .venv), then the engine (start.sh, after launcher/env.sh finds the CUDA toolkit). When the
// engine listens, its address goes to the menu: «Open the Studio». The lab and the engine log the errors of jobs as they go: no reason to
// stop the Studio, so Pinokio's own «error:» stop is off.
const quiet = [{ event: "/error:/i", break: false }, { event: "/errno /i", break: false }]
module.exports = {
  daemon: true,
  run: [{
    method: "shell.run",
    params: { path: "..", message: ".venv/bin/python lab/lab.py", on: [{ event: "/heresy-lab on :\\d+/", done: true }, ...quiet] }
  }, {
    method: "shell.run",
    params: { path: "..", message: ". launcher/env.sh && bash start.sh", on: [{ event: "/Listening on http:\\/\\/[^\\s:]+:(\\d+)/", done: true }, ...quiet] }
  }, {
    method: "local.set",
    params: { url: "http://127.0.0.1:{{input.event[1]}}" }
  }]
}
