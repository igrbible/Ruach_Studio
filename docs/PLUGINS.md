# Steps of your own in the Refiner

Ruach Studio's Refiner runs its own steps in order: Spectrum, Artifacts, Debuzz, Lyrics, Stems, Remaster, Upscale. A plugin adds steps of your own after them, without touching the studio's code. The studio carries no plugin; without one the Refiner is as it was.

## Where a plugin lives

A plugin is a folder in the studio's `user/plugins/` (or a link to a folder kept elsewhere). The lab reads every `user/plugins/*/plugin.json` when the page asks (`GET /lab/plugins`), so a new or changed plugin shows after a reload of the page.

## plugin.json

```json
{
  "id": "my-post",
  "name": "My post",
  "python": ".venv/bin/python",
  "steps": [
    {
      "id": "master",
      "label": "Master",
      "say": "loudness and a ceiling",
      "tip": "What the step does, shown under its panel.",
      "script": "master.py",
      "params": [
        {"key": "lufs", "label": "Loudness", "type": "select", "default": "-14",
         "options": [["-14", "−14 LUFS"], ["-9", "−9 LUFS"]], "tip": "The aim"},
        {"key": "drive", "label": "Drive, dB", "type": "number", "min": 0, "max": 6, "step": 0.5, "default": 2},
        {"key": "glue", "label": "Glue", "type": "check", "default": true}
      ]
    }
  ]
}
```

- `id`, a step's `id` and a field's `key`: lowercase letters, digits, `-` and `_`.
- `python` (optional): the plugin's own interpreter, relative to its folder (a venv of its own keeps its packages apart from the studio's). Without it the step runs in the studio's environment. A step may name a `python` of its own, which wins over the plugin's.
- `input` (optional): `"stems"` makes the step work on a set of the take's stems instead of one file. Its panel then offers the take's sets of stems (and asks for a split while there is none), and `AUDIO` is the set's folder, with its `manifest.json` listing the stems (each with `name`, `title` and `file`).
- `gpu` (optional): `true` runs the step on a video card, as the lab's own GPU jobs run (see below); `need_mb` is the room it asks for on the card, 8000 MB when not said.
- `prefer` (optional, for a step on one file): the names of the files the step is made for, without the extension, in order (`["lead_vocal", "vocals"]`). The panel then picks the last such file of the take's tree as the source, until you pick one by hand.
- `script`: inside the plugin's folder; a step whose script is outside it or missing is left out.
- Fields come in three kinds: `select` (its `options` as `[value, label]`), `number` (`min`, `max`, `step`) and `check`. The page draws them, and the lab cleans what it sends into each field's kind and bounds.
- A plugin that does not read whole is named in `errors` of `GET /lab/plugins`, and the others still show.

## A step

The lab runs a step as

    PYTHON SCRIPT AUDIO OUTDIR PARAMS.json

in the plugin's folder. A step runs on the CPU, one job at a time with the studio's other CPU jobs. A step with `"gpu": true` waits for the turn of the lab's heavy jobs instead and gets a card the way they do: one of the cards given to the lab's jobs (Engine → GPUs) with room for its `need_mb`, never the card the studio's engine sings on. Its process sees that one card as `CUDA_VISIBLE_DEVICES`, so `cuda:0` inside the step is the card it was given. The panel marks such a step «GPU». `AUDIO` is the take or the file of its tree picked as the source; `PARAMS.json` holds the fields. The step writes its files into `OUTDIR` and prints, as its last line, one line of JSON:

```json
{"files": [{"name": "master −14 LUFS", "file": "master.flac", "seconds": 213.4}], "measure": {"lufs_out": -14.0}, "took": 41.2}
```

File names are plain names inside `OUTDIR`. The files land in the take's tree as a branch of kind `plugin` with the step's name, its fields and its measure. They play, compare with every other version at equal loudness, lie over the spectrum and serve as the source of the next step. A step that exits with an error shows the last line of its error output in the tree and in its panel.

A file named `.txt`, `.json`, `.md` or `.csv` is a report rather than a sound: it gets a row of its own in the tree with Read (its text in the studio's dialog) and its file, and it is no version to play or compare and no source for the next step. A step that measures rather than changes the sound (a loudness check, a detector) writes its findings there, and may add one `"summary"` line to its JSON (300 characters at most), shown beside its branch:

```json
{"files": [{"name": "report", "file": "report.txt"}], "summary": "−14.2 LUFS, true peak −1.1 dBTP", "took": 3.1}
```

In the Refiner's DAW a branch made from one stem of a set can stand in for that stem: its first file, when it is as long as the stem, is offered as the stem's version (a cleaned voice beside the separated one), so a step that makes such a file should put it first.

## Through the lab's API

    GET  /lab/plugins
    POST /lab/plugin/run  {"name": TAKE, "source": "" | "derived/…", "plugin": ID, "step": ID, "params": {…}}
    GET  /lab/derived?name=TAKE
