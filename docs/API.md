# Ruach Studio · the API

The studio's own door for scripts, DAWs and agents **on this machine and its local network**. It is the same server as the page (`http://HOST:41867`), under `/api/v1`. The studio answers private addresses only: this machine, 10.x, 172.16–31.x, 192.168.x, 100.64–127.x (carrier-grade NAT, where Tailscale lives), link-local, and their IPv6 kin. Anyone else gets `403`. `RUACH_ALLOW_PUBLIC=1` (in the studio's environment) opens it to all, for those who put their own proxy and guard in front.

A token is asked only when `RUACH_API_TOKEN` is set in the studio's environment, and only of callers not on the studio's machine: `Authorization: Bearer <token>`.

The full description, for tools that read it: `GET /api/v1/openapi.json` (OpenAPI 3.1).

## Routes

| | route | what it does |
|---|---|---|
| GET | `/api/v1` | what this is, and every route |
| GET | `/api/v1/health` | the engine (busy, memory loaded, cards), the lab, and the GPU guard's verdict on each card |
| POST | `/api/v1/songs` | make a song; answers `{job, poll}` at once |
| POST | `/api/v1/score/from-midi` | a MIDI file as a song's score, without making the song: `{midi_b64, key, ins}` → the score and how it was read |
| GET | `/api/v1/jobs/ID` | queued, running, done, failed or cancelled; when done, its `takes` |
| POST | `/api/v1/jobs/ID/cancel` | stop it |
| GET | `/api/v1/takes` | the takes, newest first: `?workspace=` `?q=` (title or note) `?limit=` `?offset=` |
| GET | `/api/v1/takes/NAME` | one take: its marks, workspaces, and what it was made with (style, lyrics, score, seeds, adapters) |
| GET | `/api/v1/takes/NAME/audio` | its audio (a redirect to the file the engine serves) |
| POST | `/api/v1/takes/NAME/marks` | `{rating: 1 / -1 / 0, favorite: true/false, note: "…"}` |
| POST | `/api/v1/takes/NAME/reaper` | the take as a REAPER project (see the guide's DAW tab); answers where to fetch the ZIP |
| GET | `/api/v1/takes/NAME/artwork` | its artwork (a redirect to the JPEG, 768 px), 404 until it has one |
| POST | `/api/v1/takes/NAME/artwork` | draw it: `{again, seed}`; answers `202 {status}` while drawing (ask again), then the prompt and the seed |
| GET | `/api/v1/takes/NAME/derived` | the Refiner's tree: every branch made from the take, its files (each with a `url`), and what runs |
| GET | `/api/v1/takes/NAME/file?path=derived/…` | one file of the tree (a redirect to it) |
| POST | `/api/v1/takes/NAME/stems` | `{mode: four \| vocals, source}`: four by default; `source` a debuzzed or upscaled file of the tree, a set of its own (the same file again answers with the set it gave) |
| POST | `/api/v1/takes/NAME/debuzz` | `{strength: 0.1–1, source}` |
| POST | `/api/v1/takes/NAME/remaster` | `{source, preset, lufs, tp, hz432, deess, cleanup, fade, formats}` (the Refiner's Remaster step) |
| POST | `/api/v1/takes/NAME/upscale` | `{mode: subtle \| normal \| high \| extreme, variants: 1 \| 2, keep, source}` |
| POST | `/api/v1/takes/NAME/lyrics-check` | `{source, again}`: Whisper against the lyrics, the result when ready |
| GET | `/api/v1/workspaces` | the workspaces and how many takes each holds |
| POST | `/api/v1/workspaces/WS` | `{op: "add" / "remove" / "move", names: [...], from: "…"}` |

### Making a song

```json
POST /api/v1/songs
{
  "title": "Morning",
  "style": "Russian, folk ballad, female alto, acoustic guitar and cello, 72 bpm",
  "lyrics": "[Verse]\nfirst line\nsecond line\n\n[Chorus]\n…",
  "mode": "direct",
  "duration": 180,
  "workspace": "From my scripts"
}
```

- `mode`: `direct` (fastest), `full` (a score first: melody and chords, then the song), `melody`. With a score of your own (`abc`, or a MIDI file) and no mode, the score's kind picks it: `full` when it has chord symbols, `melody` when not. `direct` with a score is refused (`400`): direct makes the music without one, and the score would be dropped.
- `instrumental: true` makes it without a voice (the lyrics are then left out).
- `music_seed`, `sound_seed`: to make a take again; left out, both are random.
- `abc`: your own score, in YuE2's two-voice dialect (what the Creator's score drawer holds).
- `midi_b64`: a standard MIDI file, base64, as the song's melody (below). `midi_key`: the key to write it in when the file has none (`Em`, `Bb`, `F#m`…); `midi_ins`: `auto`, `keep` or `none` (below).
- `duration`: seconds; left out, 180, or the MIDI file's own length.
- Also passed on as they are: `loras`, `vae`, `steps`, `solver`, `cfg_scale`, `output_format` (WAV 24-bit unless asked otherwise).
- `workspace`: the take lands there when it is done.

### A melody as a MIDI file

Each track with notes is one line: the first two become the score's **Vocal** (sung) and **Ins** (the instruments' melody), by their names when a track is called *vocal / voice / vox / melody / sing* or *ins / instr / accomp*, else in order. A line is one note at a time: of notes starting together the highest stays. The grid is a sixteenth; the meter and the tempo are the file's (4/4 and 120 when it has none). The key: `midi_key`, else the file's key signature, else the one its notes suggest (said in the answer as `key_from`).

A second track of **chords** is not given as the Ins line (`midi_ins: auto`): its top notes as the instruments' melody let an instrument take the tune. Measured on one melody in an accordion waltz style, three seeds: with the chords' top line the instruments carried the tune in two takes of three; with the sung line alone the voice carried it in all three. `keep` gives their top line anyway (as the Creator's MIDI import does), `none` leaves out any second line.

The answer's `score` says how the file was read: `key` and `key_from`, `bpm`, `meter`, `bars`, `seconds`, the notes kept per voice and those left out (`dropped`), `ins_line`, and which tracks became which voice (`from`). The score is checked before anything is spent on it: it must read back (YuE2 Studio's own reader) as the very notes it was written from.

```bash
curl -s -X POST -H "Content-Type: application/json" \
  -d "{\"style\":\"Russian, folk ballad, warm female vocal, gusli\",\"lyrics\":\"[Verse]\\nТихо ветер над рекой\",\"midi_b64\":\"$(base64 -w0 melody.mid)\"}" \
  http://127.0.0.1:41867/api/v1/songs
```

## From the shell

```bash
B=http://127.0.0.1:41867/api/v1          # from another machine: the studio's address on your network
J=$(curl -s -X POST -H "Content-Type: application/json" -d '{"style":"Instrumental, solo cello, slow","instrumental":true,"duration":60}' $B/songs | python3 -c "import json,sys; print(json.load(sys.stdin)['job'])")
until curl -s $B/jobs/$J | grep -q '"status": *"done"'; do sleep 3; done
T=$(curl -s $B/jobs/$J | python3 -c "import json,sys; print(json.load(sys.stdin)['takes'][0])")
curl -sL -o cello.wav $B/takes/$T/audio
```

## For agents: the MCP server

`extras/ruach-mcp.py` puts the API before any MCP client (Claude Desktop, Claude Code, others) as twelve tools (`generate_song` takes a MIDI file on the agent's machine as `midi_file`): `generate_song`, `job_status`, `cancel_job`, `list_takes`, `get_take`, `mark_take`, `list_workspaces`, `file_takes`, `export_reaper`, `draw_artwork`, `refine_take`, `studio_health`. It runs where the agent runs and talks HTTP to the studio.

```bash
pip install mcp          # once; the SDK's v1 and v2 both do
```

The client's configuration (Claude Desktop: `claude_desktop_config.json`; Claude Code: `.mcp.json` in a project):

```json
{
  "mcpServers": {
    "ruach-studio": {
      "command": "python3",
      "args": ["/path/to/Ruach_Studio/extras/ruach-mcp.py"],
      "env": { "RUACH_URL": "http://127.0.0.1:41867" }
    }
  }
}
```

Then ask the agent in plain words: *make a two-minute instrumental for solo duduk and put it in the workspace "Sketches"*; *list my liked takes in Fosforida*; *export the last take to REAPER*.

## What it does not do (yet)

A Refiner step answers `202` with its job while it runs (its branch appears in `/derived` when done; `source` is a path in the tree, `derived/…`, or empty for the take). Training is not on the API yet. REAPER already talks to it: `extras/reaper/` (make a song from inside REAPER, its selected MIDI as the melody; bring a take).
