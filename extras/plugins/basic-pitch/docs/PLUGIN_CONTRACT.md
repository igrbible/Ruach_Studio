# Plugin contract

How this plugin talks to Ruach Studio's lab. The authoritative source for the
lab's side is Ruach Studio's own
[`docs/PLUGINS.md`](https://github.com/igrbible/Ruach_Studio/blob/main/docs/PLUGINS.md);
this page records how *this* plugin implements it, and is explicit about what
that document does **not** say.

> **Documented vs assumed.** Statements marked **(documented)** come from Ruach's
> `PLUGINS.md`. Statements marked **(assumed)** are this plugin's reading of
> something the document leaves open. Assumptions are isolated so they are cheap
> to change; each one names the file that holds it.

## 1. Discovery

The lab reads every `user/plugins/*/plugin.json` when the page asks
(`GET /lab/plugins`) **(documented)**. A plugin that does not parse is listed
under `errors` there while the others still load **(documented)**.

This plugin's `plugin.json` declares one step:

| Key | Value | Meaning |
| --- | --- | --- |
| `id` | `basic-pitch` | Plugin id (lowercase letters, digits, `-`, `_`) |
| `python` | `.venv/bin/python` | The plugin's own interpreter, relative to its folder, so TensorFlow stays out of the studio's environment |
| `steps[0].id` | `transcribe` | Step id |
| `steps[0].script` | `transcribe.py` | Must live inside the plugin folder |
| `steps[0].input` | `stems` | The step works on a stem set, not a single file |
| `steps[0].group` | `look` | A step that reads the take rather than mending the sound |

`tests/test_plugin_manifest.py` fails the build if the field keys, defaults or
bounds in `plugin.json` drift from `src/ruach_basic_pitch/params.py`.

## 2. Invocation

The lab runs the step as **(documented)**:

```
PYTHON SCRIPT AUDIO OUTDIR PARAMS.json
```

in the plugin's folder, on the CPU, one job at a time with the studio's other CPU
jobs. For this plugin that is:

```
.venv/bin/python transcribe.py <AUDIO> <OUTDIR> <PARAMS.json>
```

| Argument | Meaning |
| --- | --- |
| `AUDIO` | For `"input": "stems"`, the stem set's **folder**, containing `manifest.json` **(documented)** |
| `OUTDIR` | Folder the step writes its files into (created if missing) |
| `PARAMS.json` | The step's fields as a JSON object |

The step declares no `gpu`, so it runs on the CPU. Basic Pitch is lightweight
enough that this is the sensible default.

## 3. Input: the stem manifest

`AUDIO/manifest.json` "lists the stems (each with `name`, `title` and `file`)"
**(documented)**.

**(assumed)** The top-level shape. `load_stems` accepts either:

```json
{"stems": [{"name": "lead_vocal", "title": "Lead vocal", "file": "lead_vocal.wav"}]}
```

or a bare list of the same objects. If a real take's manifest differs, only
`src/ruach_basic_pitch/manifest.py` changes.

Rules enforced on the manifest, because it is untrusted input:

* every entry needs `name` and `file`; `title` falls back to `name`;
* a stem's `file` must resolve to a path **inside** `AUDIO` (no `../`);
* an empty or missing stem list is an error.

## 4. Input: `PARAMS.json`

| Key | Type | Default | Range | Meaning |
| --- | --- | --- | --- | --- |
| `onset` | number | 0.5 | 0.1 – 0.9 | Onset threshold; higher gives fewer, surer notes |
| `frame` | number | 0.3 | 0.1 – 0.9 | Frame threshold; higher gives shorter, tidier notes |
| `min_note_ms` | number | 127 | 20 – 500 | Shortest note kept, in milliseconds |
| `bends` | boolean | `true` | – | Keep pitch-bend messages |

The lab cleans values to each field's kind and bounds before running the step
**(documented)**; the plugin clamps again so it is safe to run by hand. Missing or
non-numeric values fall back to the defaults. Booleans are not accepted where a
number is expected.

## 5. Output

The step writes into `OUTDIR` and prints, as the **last line** of standard
output, one JSON object **(documented)**:

```json
{
  "files": [
    {"name": "Lead vocal (MIDI)", "file": "lead_vocal.mid"},
    {"name": "note counts", "file": "report.csv"}
  ],
  "summary": "1 of 1 stems transcribed, 412 notes",
  "took": 18.3
}
```

| Field | Type | Notes |
| --- | --- | --- |
| `files[].name` | string | Label in the take's tree |
| `files[].file` | string | Plain file name inside `OUTDIR` **(documented)** |
| `summary` | string | One line, at most 300 characters **(documented)**; shown beside the branch |
| `took` | number | Seconds, one decimal |

The same shape is declared in code as `StepPayload` / `FileEntry`
(`src/ruach_basic_pitch/contract.py`), so it is type-checked where it is built.

`.txt`, `.json`, `.md` and `.csv` files are treated by the lab as **reports**: a
row with a Read button, not a playable version **(documented)**. `report.csv` is
therefore shown as a report.

**(assumed)** `.mid` files. The documented file kinds are audio versions and
text/JSON/CSV reports; MIDI is not mentioned. The lab may show a `.mid` branch
that cannot be played or compared. See [Troubleshooting](TROUBLESHOOTING.md#midi-branches-do-not-play).

### `report.csv`

One header row and one row per stem, LF line endings:

| Column | Values |
| --- | --- |
| `stem` | the stem's machine name |
| `status` | `ok`, `silent`, or `error` |
| `notes` | notes detected (0 unless `ok`) |
| `detail` | error text for `error`, otherwise empty; newlines flattened |

### Stem status

| Status | Meaning | MIDI file? |
| --- | --- | --- |
| `ok` | Transcribed and at least one note found | yes (`<name>.mid`) |
| `silent` | Transcription ran but found no notes (typical for a drum stem) | no |
| `error` | Transcription raised | no |

## 6. Exit codes

| Code | `ExitCode` | When |
| --- | --- | --- |
| 0 | `OK` | At least one stem did not fail (silent stems count as fine) |
| 1 | `FAILED` | Missing/invalid manifest or params, or **every** stem failed |
| 2 | `USAGE` | Wrong number of arguments |

On a non-zero exit the lab shows the **last line of standard error** in the tree
and the step's panel **(documented)**, so the plugin keeps its failure message to
one line on stderr.

A single failing stem does **not** fail the step; its row in `report.csv` says
`error` and the other stems still produce files.

## 7. What the plugin never does

* It never writes outside `OUTDIR`.
* It never reads outside `AUDIO` (stem paths are confined; see §3).
* It does not use the network. Basic Pitch's model ships inside the package.
* It does not modify the take; outputs land as new branches.
