// Ruach Studio for Pinokio (HERESY 1259): the install, through launcher/install.sh (bash, the same from a terminal). Pinokio's AI
// bundle comes first: conda, git, ffmpeg, uv and, on an NVIDIA machine, the CUDA toolkit 12.8 the engine is built with (the
// machine's own /usr/local/cuda-12.8 is taken instead when it is there).
// HERESY 2879 (Viktor 20.11.2026: «Давай и у нас в репо прикрутим такое», Pinokio's «Powered by»): after it, the model cards of the
// models the Studio runs on, each from its own Hugging Face repository into models/misc/cards/ (a few KB each): their licences and
// credits beside the weights, readable offline. Pinokio's app page names these steps under «Powered by». The weights themselves come
// through install.sh (fetch-models.sh: pinned, checked, asked first), from goldhub's repositories; m-a-p's are where they come from.
const CARDS = [
  "goldhub/YuE2-RS-Finetunes",        // Ruach Studio's own fine-tunes and decoders (YuE2-VAE-RS), CC BY-NC-SA 4.0
  "goldhub/Ruach_Studio_Models_v2",   // m-a-p's models as GGUF (Serveurperso's, byte for byte), the Standard decoder, Whisper and the rest
  "m-a-p/YuE2-3B",                    // YuE2 itself, CC BY-NC 4.0
  "m-a-p/YuE2-Vae",                   // its decoder, CC BY-NC 4.0
  "m-a-p/SheetSage2"                  // the Musician's transcriber (Cover, Make it mine), CC BY-NC 4.0
]
module.exports = {
  requires: { bundle: "ai" },
  run: [{
    method: "shell.run",
    params: {
      path: "..",
      message: "bash launcher/install.sh",
      on: [
        { event: "/ruach install stopped:[^\\n]*/", break: true },
        // pip and cmake print «error:» about things that are not a reason to stop; install.sh stops by itself, and says why
        { event: "/error:/i", break: false },
        { event: "/errno /i", break: false }
      ]
    }
  }].concat(CARDS.map((repo) => ({
    method: "hf.download",
    params: { path: "..", _: [repo, "README.md"], "local-dir": "models/misc/cards/" + repo.replace("/", "--") }
  })))
}
