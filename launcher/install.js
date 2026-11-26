// Ruach Studio for Pinokio, Linux + NVIDIA only, unsupported (HERESY 3001): the native install, launcher/install.sh --yes (bash, the same from
// a terminal; --yes lets the models come without their question). Pinokio's AI bundle first: conda, git, ffmpeg, uv and the CUDA toolkit
// the engine is built with (the machine's own /usr/local/cuda-12.8 is taken instead when it is there). install.sh refuses any other
// system in words, naming the native packages.
module.exports = {
  requires: { bundle: "ai" },
  run: [{
    method: "shell.run",
    params: {
      path: "..",
      message: "bash launcher/install.sh --yes",
      on: [
        { event: "/ruach install stopped:[^\\n]*/", break: true },
        // pip and cmake print «error:» about things that are not a reason to stop; install.sh stops by itself, and says why
        { event: "/error:/i", break: false },
        { event: "/errno /i", break: false }
      ]
    }
  }]
}
