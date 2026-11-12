# Steps of your own in the Refiner

Ruach Studio's Refiner runs its own steps in order: Spectrum, Artifacts, Debuzz, Lyrics, Stems, Remaster, Upscale. A plugin adds steps of your own after them, without touching the Studio's code. Without one the Refiner is as it was. The Studio carries no plugin of its own, and the plugins others gave it (`extras/plugins/`, below) run only once you install them.

New to it? Start from the **example node** (`extras/plugins/example-node/`): two small steps written to be copied, one that changes the sound and one that only looks, with a check that runs without the Studio. [Your first node](#your-first-node) walks through it.

**A module that works on sound comes with its node.** If what you bring is a post-process module (a cleaner, a mixer, a mastering chain, a converter, a transcriber), it reaches the Studio as a node of the Refiner: a `plugin.json` and a step that keeps the contract below, so that it runs on a take's file or stems, can be wired into a way and lands its result in the take's tree. A library or a command-line tool on its own is not yet a module of the Studio. Not sure how to shape yours? Write in the repository's [Discussions](https://github.com/igrbible/Ruach_Studio/discussions), and we will build the right node with you.

## Where a plugin lives

A plugin is a folder in the Studio's `user/plugins/` (or a link to a folder kept elsewhere). The lab reads every `user/plugins/*/plugin.json` when the page asks (`GET /lab/plugins`), so a new or changed plugin shows after a reload of the page.

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
- `python` (optional): the plugin's own interpreter, relative to its folder (a venv of its own keeps its packages apart from the Studio's). Without it the step runs in the Studio's environment. A step may name a `python` of its own, which wins over the plugin's.
- `input` (optional): `"stems"` makes the step work on a set of the take's stems instead of one file. Its panel then offers the take's sets of stems (and asks for a split while there is none), and `AUDIO` is the set's folder, with its `manifest.json` listing the stems (each with `name`, `title` and `file`).
- `gpu` (optional): `true` runs the step on a video card, as the lab's own GPU jobs run (see below); `need_mb` is the room it asks for on the card, 8000 MB when not said.
- `prefer` (optional, for a step on one file): the names of the files the step is made for, without the extension, in order (`["lead_vocal", "vocals"]`). The panel then picks the last such file of the take's tree as the source, until you pick one by hand.
- `group` (optional): `mend`, `finish` (when not said) or `look`: where the step stands among the Refiner's steps, its column on the canvas and the colour of its node (gold, green, blue). A step that only reads the take, a detector say, is a look.
- `stem` (optional, for a step on one file): the one stem of a set the step mends (`"lead_vocal"`). On the canvas a wire puts the step on a way with that stem, and the way's test says whether the set before it has one.
- `final` (optional): `true` for a step whose files end a way rather than feed the next step (MIDI, a render to keep). Its node stands in the canvas's last column, beside Made from This Take and MIDI, whatever its group.
- `hardware` (optional): `true` for a step that plays through gear outside the machine in real time (an interface, an outboard compressor). It does not wait for the CPU's turn of the Studio's other jobs, so it must queue its own passes through the gear.
- `script`: inside the plugin's folder; a step whose script is outside it or missing is left out.
- Fields come in four kinds: `select` (its `options` as `[value, label]`), `number` (`min`, `max`, `step`), `check` and `text`. The page draws the first three, and the lab cleans what it sends into each field's kind and bounds. A `text` field is a hidden string of up to 20 000 characters that a step's own panel keeps (the Studio's Pianoteq step keeps Pianoteq's whole state in one); profiles and the way keep it like any other field.
- A plugin that does not read whole is named in `errors` of `GET /lab/plugins`, and the others still show.

## A step

The lab runs a step as

    PYTHON SCRIPT AUDIO OUTDIR PARAMS.json

in the plugin's folder. A step runs on the CPU, one job at a time with the Studio's other CPU jobs. A step with `"gpu": true` waits for the turn of the lab's heavy jobs instead and gets a card the way they do: one of the cards given to the lab's jobs (Engine → GPUs) with room for its `need_mb`, never the card the Studio's engine sings on. Its process sees that one card as `CUDA_VISIBLE_DEVICES`, so `cuda:0` inside the step is the card it was given. The panel marks such a step «GPU». `AUDIO` is the take or the file of its tree picked as the source; `PARAMS.json` holds the fields. The step writes its files into `OUTDIR` and prints, as its last line, one line of JSON:

```json
{"files": [{"name": "master −14 LUFS", "file": "master.flac", "seconds": 213.4}], "measure": {"lufs_out": -14.0}, "took": 41.2}
```

File names are plain names inside `OUTDIR`. The files land in the take's tree as a branch of kind `plugin` with the step's name, its fields and its measure. They play, compare with every other version at equal loudness, lie over the spectrum and serve as the source of the next step. A step that exits with an error shows the last line of its error output in the tree and in its panel.

A file named `.txt`, `.json`, `.md` or `.csv` is a report rather than a sound: it gets a row of its own in the tree with Read (its text in the Studio's dialog) and its file, and it is no version to play or compare and no source for the next step. A step that measures rather than changes the sound (a loudness check, a detector) writes its findings there, and may add one `"summary"` line to its JSON (300 characters at most), shown beside its branch:

```json
{"files": [{"name": "report", "file": "report.txt"}], "summary": "−14.2 LUFS, true peak −1.1 dBTP", "took": 3.1}
```

A file named `.mid` or `.midi` is MIDI: its row offers it to download (a DAW or a piano roll opens it), and it is no version to play or compare and no source for the next step.

In the Refiner's DAW a branch made from one stem of a set can stand in for that stem: its first file, when it is as long as the stem, is offered as the stem's version (a cleaned voice beside the separated one), so a step that makes such a file should put it first.

## Your first node

The example node installs like any plugin given to the Studio: `extras/plugins/install.sh example-node`, then a reload of the page. Its folder holds what every node holds:

```
user/plugins/example-node/
    plugin.json       the node's card: ids, labels, the one-line say, the tip, the script, the group, the fields
    tilt_width.py     a step that changes the sound: a sound and a page out
    width_meter.py    a step that only looks: a page and a table out, a summary beside its branch
    check.py          its own check, without the Studio
```

**The card.** `plugin.json` names the plugin and its steps. A step's `label` is its node's title, its `say` the line under the title, its `tip` what its panel says under the fields. `group` says where it stands: `mend` before the split (gold), `finish` after it (green), `look` for a step that changes nothing (blue). The fields become the panel's controls, and profiles and ways keep them; read each with its default (`p.get("tilt", 1.5)`), since a profile saved before you added a field does not have it.

**The script.** It reads `AUDIO` and never writes to it, does its work, writes its files into `OUTDIR` under plain names, and prints its last line of JSON. `tilt_width.py` keeps the contract in one `main()` and the sound itself in one `process(x, sr, …)`: change `process()` and the contract stays kept. Lines printed before the last are its log; `raise SystemExit("why")` ends it with words the tree and the panel show.

**The check.** `check.py` runs each step exactly as the lab does, on a sound it makes itself, and holds the node to what it promises: nothing changed at the neutral settings (sample for sample), a change of the right direction and size, never over full scale, the files named in the last line, an error said in words. Run it after every change: `.venv/bin/python user/plugins/my-node/check.py`.

**Your own.** Copy the folder into `user/plugins/` under a name of yours, change the ids (lowercase letters, digits, `-` and `_`), the labels and the script, run its check and reload the page. A step on a set of stems (`"input": "stems"`), on one stem (`"stem"`), on a video card (`"gpu"`) or through gear (`"hardware"`) keeps the same contract; their keys are under [plugin.json](#pluginjson) above.

## How a node stands on the canvas

The canvas draws each step as a node with its ports, as ComfyUI does. Its input is a file, a set of stems (`"input": "stems"`) or one stem (`"stem"`). Its output is a file for a step on a file, versions of the stems for a `mend` on a set, a mix for a `finish` on a set, and nothing for a `look`. A wire from one node's output to another's input puts the second on your way after the first, and the second takes the first one's newest file as its source.

Arrange lays the nodes out the way the work flows: the take and its chain, the file mended before the split, the split and its stems mended, the stems mixed, the file finished; then the looks at a file (the spectrum, the faults, the lyrics, before and after, a meter of yours) in the column before the last, and what ends a way with no wire going out of it (Made from This Take, MIDI, a step marked `final`) in the last. A step's group, and `final` for one that ends a way, is all it takes to stand in its column.

## What a good node does

- It writes only into `OUTDIR`, and never changes its source or anything else of the take's.
- At its neutral settings it gives the sound back as it came, sample for sample, so a way that passes through it loses nothing.
- It gives the sound back as loud as it came, or says that it does not, and never over full scale: the ear should hear the change, not the level.
- The same sound with the same fields gives the same result; a step that draws at random takes its seed as a field.
- Its findings go into a page (`.md`) and one `summary` line; numbers a way may want go into `measure`.
- Its errors say why in words on their last line, never a bare traceback for its user to read.
- It names what it needs: the Studio's own environment gives it numpy, scipy and soundfile; anything more goes into a `requirements.txt` and an environment of its own (`"python": ".venv/bin/python"`), which `extras/plugins/install.sh` makes.
- It carries a check that runs without the Studio.
- Its labels are in the language its users read: the Studio translates its own steps, and shows a plugin's words as you wrote them.

## MIDI scripts

A plugin may bring scripts for MIDI controllers, and may be made of them alone (no steps). The Studio itself speaks **Mackie Control** on a port named Mackie or MCU and on an **M-Audio Oxygen**'s DAW port (its second port, in the Oxygen's «Mc» presets); every other control port is left alone until a script claims it by its name:

```json
{"id": "my-keys", "name": "My keyboard",
 "midi": [{"id": "daw", "name": "My keyboard's DAW port", "script": "midi/daw.js", "ports": "My Keyboard.*DAW", "tip": "transport and faders"}]}
```

`ports` is a pattern (JavaScript, case-insensitive) matched against the browser's names of the input ports; `script` is a `.js` file inside the plugin's folder, 256 KB at most. The page asks the lab for its text (`GET /lab/plugins/midi?plugin=ID&id=ID`) and runs it in a worker of its own, made from a `data:` address: it has no page and no origin of the Studio's, so whatever it would ask of the Studio is a stranger's request, which the Studio and its lab refuse and whose answer the browser does not let it read. `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource` and `importScripts` are taken from it as well, from the worker and from every prototype above it. It can still load a module from a site on the internet that answers anyone (`import()`), so this is a fence for the page, not against the plugin's author: a plugin runs with the rights its folder was given, as its Python steps do, so install only what you trust.

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

## A panel of your own

A plugin may bring a panel for the page and a script that answers it, and may be made of them alone (no steps, no MIDI scripts):

```json
{"id": "my-panel", "name": "My panel", "page": "page.js", "calls": "calls.py"}
```

`page` is a `.js` file inside the plugin's folder, 512 KB at most. While own plugins are on (☰ → Own plugins), the page asks the lab for its text (`GET /lab/plugins/page?plugin=ID`) and runs it as one of its own scripts: it may add a row to ☰, a card to the Engine, a window of its own. Unchecked, the page loads no panel at all, as a public studio would; whatever a panel's script talks to keeps running as it was.

`calls` is a Python script inside the folder that answers the panel. `GET` or `POST /lab/plugins/call?plugin=ID&path=/anything&…` runs it in the plugin's folder (with the plugin's `python`, else the lab's), the request as JSON on its standard input, `{"method", "path", "query", "type", "body64"}` (a POST's body in base64 with its type), and the last line it prints is the answer: `{"status": 200, "json": …}`, or `{"status": 200, "type": "image/png", "body64": "…"}` for bytes. A minute at most. Bytes go back with `X-Content-Type-Options: nosniff` and a sandbox, so nothing a script returns runs as a page of the Studio.

A panel runs with the page's rights, as the plugin's Python runs with its folder's: install only what you trust.

## Plugins made by others

- **Basic Pitch** by Steven Altsman ([manchuwook](https://github.com/manchuwook)), given to the Studio and shipped with it in `extras/plugins/basic-pitch/` (MIT; its home is [null-angel/ruach-basic-pitch-plugin](https://github.com/null-angel/ruach-basic-pitch-plugin)): Spotify's [Basic Pitch](https://github.com/spotify/basic-pitch) (Apache-2.0) on a set of stems, one `.mid` per stem that has notes, pitch bends kept, and a `report.csv` of the notes each stem gave. Best on one voice or instrument at a time (a lead vocal, a bass, winds); a drum stem gives few notes or none. On the CPU, in an environment of its own: an eight-stem set of a 2:25 song took 30 s here. Install it with `extras/plugins/install.sh basic-pitch` (on Python 3.12 and newer it takes Basic Pitch's ONNX Runtime way, as its README says), then reload the page.

- **Example node** by the Studio, in `extras/plugins/example-node/` (CC0): «Tilt and width» and «Width meter», written to be copied ([Your first node](#your-first-node)).

A plugin of yours can join this list and ship with the Studio: say it in the repository's [Discussions](https://github.com/igrbible/Ruach_Studio/discussions).

## Through the lab's API

    GET  /lab/plugins
    GET  /lab/plugins/midi?plugin=ID&id=ID          a MIDI script's text (HERESY 1589)
    GET  /lab/plugins/page?plugin=ID                a panel's text (HERESY 2261)
    GET|POST /lab/plugins/call?plugin=ID&path=…     what the panel asks its plugin's script (HERESY 2261)
    POST /lab/plugin/run  {"name": TAKE, "source": "" | "derived/…", "plugin": ID, "step": ID, "params": {…}}
    GET  /lab/derived?name=TAKE
