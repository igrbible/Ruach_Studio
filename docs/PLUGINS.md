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
- `group` (optional): `mend`, `finish` (when not said) or `look`: where the step stands among the Refiner's steps, its column on the canvas and the colour of its node (gold, green, blue). A step that only reads the take, a detector say, is a look.
- `stem` (optional, for a step on one file): the one stem of a set the step mends (`"lead_vocal"`). On the canvas a wire puts the step on a way with that stem, and the way's test says whether the set before it has one.
- `hardware` (optional): `true` for a step that plays through gear outside the machine in real time (an interface, an outboard compressor). It does not wait for the CPU's turn of the studio's other jobs, so it must queue its own passes through the gear.
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

## MIDI scripts

A plugin may bring scripts for MIDI controllers, and may be made of them alone (no steps). The studio itself speaks **Mackie Control** on a port named Mackie or MCU and on an **M-Audio Oxygen**'s DAW port (its second port, in the Oxygen's «Mc» presets); every other control port is left alone until a script claims it by its name:

```json
{"id": "my-keys", "name": "My keyboard",
 "midi": [{"id": "daw", "name": "My keyboard's DAW port", "script": "midi/daw.js", "ports": "My Keyboard.*DAW", "tip": "transport and faders"}]}
```

`ports` is a pattern (JavaScript, case-insensitive) matched against the browser's names of the input ports; `script` is a `.js` file inside the plugin's folder, 256 KB at most. The page asks the lab for its text (`GET /lab/plugins/midi?plugin=ID&id=ID`) and runs it in a worker of its own: it has no page, and no `fetch`, `XMLHttpRequest`, `WebSocket` or `importScripts`. That is a fence for the page, not against the plugin's author: a plugin runs with the rights its folder was given, as its Python steps do, so install only what you trust.

The script's world, **ruach.midi/1**:

```js
onMidi(function (bytes, port) {                 // every message of a port the pattern found: an array of bytes, the port's name
  if (bytes[0] === 0x90 && bytes[1] === 0x5e && bytes[2]) studio.act("play");
  if ((bytes[0] & 0xf0) === 0xe0) studio.act("fader", bytes[0] & 0x0f, ((bytes[2] << 7) | bytes[1]) / 16383);
});
studio.act(name, ...args)   // one of the actions below; the room that offered it last answers (the piano roll over the DAW in sight over the player)
studio.say(text)            // words shown in Engine → Hardware → MIDI
studio.send(bytes)          // back to the controller, on the output of the same name (MIDIIN2 answers on MIDIOUT2): lights, a display
```

The actions: `play`, `stop`, `record`, `rewind`, `forward`, `loop`, `trackLeft`, `trackRight`, `bankLeft`, `bankRight`, `fader(strip, 0…1)`, `pan(strip, −63…63)`, `mute(strip)`, `solo(strip)`, `select(strip)`, `arm(strip)`, `octave(±1)`. In 2.0.0 the piano roll answers the transport (a bar back and on, Record, the staves, the octaves), the DAW and the player answer Play and Stop; the strips' actions are named so that scripts can be written now, and the rooms take them up as they come.

A keyboard's keys are not a script's: the ports no script claims and no name marks as a control port are keys, and play the piano roll (channel 10, a controller's pads, is not taken for keys).

## Through the lab's API

    GET  /lab/plugins
    GET  /lab/plugins/midi?plugin=ID&id=ID          a MIDI script's text (HERESY 1589)
    POST /lab/plugin/run  {"name": TAKE, "source": "" | "derived/…", "plugin": ID, "step": ID, "params": {…}}
    GET  /lab/derived?name=TAKE
