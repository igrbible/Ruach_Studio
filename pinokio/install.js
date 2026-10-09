// Ruach Studio for Pinokio (HERESY 1259): the install, through pinokio/install.sh (bash, the same from a terminal). Pinokio's AI
// bundle comes first: conda, git, ffmpeg, uv and, on an NVIDIA machine, the CUDA toolkit 12.8 the engine is built with (the
// machine's own /usr/local/cuda-12.8 is taken instead when it is there).
module.exports = {
  requires: { bundle: "ai" },
  run: [{
    method: "shell.run",
    params: {
      path: "..",
      message: "bash pinokio/install.sh",
      on: [
        { event: "/ruach install stopped:[^\\n]*/", break: true },
        // pip and cmake print «error:» about things that are not a reason to stop; install.sh stops by itself, and says why
        { event: "/error:/i", break: false },
        { event: "/errno /i", break: false }
      ]
    }
  }]
}
