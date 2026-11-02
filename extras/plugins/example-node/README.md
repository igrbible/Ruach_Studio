# Example node

Two small steps for the Refiner, written to be copied: **Tilt and width** changes the sound, **Width meter** only looks at it. Together they show everything a node of the Refiner is made of: its fields, its sound out, its page out, its summary, its errors, and a check that runs without the Studio. Free to copy (CC0): start your own node from it, under whatever licence you choose for yours.

## Try it

From the Studio's folder:

```bash
extras/plugins/install.sh example-node
```

Reload the Studio's page. In the Refiner, «Tilt and width» stands among the finishing steps and «Width meter» among the looks; on the canvas they are two nodes you can wire into a way. Run its own check first, if you like:

```bash
.venv/bin/python user/plugins/example-node/check.py
```

## What is in it

| file | what it is |
|---|---|
| `plugin.json` | the node's card: its id and name, each step's label, its one-line «say», its tip, its script, its group, its fields |
| `tilt_width.py` | a step that changes the sound: one file in, a sound and a page out |
| `width_meter.py` | a step that only looks: one file in, a page and a table out, a summary beside its branch |
| `check.py` | the node's own check: a test sound through each step exactly as the lab runs it |
| `LICENSE` | CC0 1.0: no rights kept |

## The contract, in one breath

The lab runs a step as `PYTHON SCRIPT AUDIO OUTDIR PARAMS.json` in the plugin's folder. `AUDIO` is the source (never written to), `OUTDIR` is where every file of the step goes, `PARAMS.json` holds the fields as the page set them, already cleaned to their kinds and bounds. The step prints what it likes as it works, and as its **last line** one line of JSON:

```json
{"files": [{"name": "tilt +1.5 dB, width 100 %", "file": "tilt_width.flac", "seconds": 213.4},
           {"name": "what it did", "file": "tilt_width.md"}],
 "measure": {"tilt_db": 1.5, "gain_db": -0.31}, "summary": "tilt +1.5 dB about 1000 Hz, width 100%", "took": 2.1}
```

A sound (`.flac`, `.wav`) lands in the take's tree as a version: it plays, compares at equal loudness, lies over the spectrum and feeds the next step. A page (`.md`, `.txt`, `.csv`, `.json`) is read in the tree, a picture (`.png`, `.jpg`) is shown there, a `.mid` is offered to download. An error ends the step with a non-zero exit, and its last line of error output is what the tree and the panel show: `raise SystemExit("why, in words")`.

## Making your own from it

1. Copy the folder: `cp -r extras/plugins/example-node user/plugins/my-node`.
2. In `plugin.json`, give the plugin and each step an id of your own (lowercase letters, digits, `-` and `_`), a label, a «say» and a tip. Keep the steps you need and drop the rest.
3. Put your sound into `process()` of `tilt_width.py` (rename the file and its `script`), or your measures into `width_meter.py`.
4. Change `check.py` to say what your node must do, and run it.
5. Reload the Studio's page.

The full reference (stems, one stem, the GPU, the hardware loop, MIDI scripts, the lab's API) is in [`docs/PLUGINS.md`](../../../docs/PLUGINS.md).
