# Ruach Studio inside REAPER

Three actions for REAPER (ReaScript, Lua) that talk to the studio's API on this machine or your network
(docs/API.md). Sound goes one way, as the studio's DAW rule says: songs come out of the studio into REAPER, and no
audio or project goes back in. What REAPER gives the studio is what a song is made from: its words (the items'
notes) and, when you want, its melody (MIDI items).

| action | what it does |
|---|---|
| **Ruach - Generate here** | asks the style, the length and the mode, makes the song in the studio, and puts it on a new track at the time selection's start (or the edit cursor). The length is the time selection's when there is one. The lyrics come from the notes of the selected items (the REAPER project the studio exports keeps every section's words there), or from the dialog, where ` / ` starts a new line. **Selected MIDI items are the song's melody** (below). REAPER stays free while the studio works. |
| **Ruach - Bring a take** | finds takes in the Librarian by words (title or note; `*` and `?` work), optionally in one workspace, and puts the one you pick on a new track at the edit cursor. |
| **Ruach - Settings** | the studio's address (`http://HOST:41867`), its token when the studio asks one (`RUACH_API_TOKEN` on its machine), and the workspace songs from REAPER land in (*From REAPER*). Says whether the studio answers. |

## A melody from REAPER

Select the MIDI items with the melody (and the items whose notes hold the words, if you want them too) and run
*Generate here*: the dialog's last line says `midi: N notes · …` and the mode is `melody`. Their notes in the time
selection, or the items' own span when there is none, go to the studio as the song's score: the topmost track is
sung, a second track is the instruments' melody (by name when a track is called *vocal*, *voice*, *melody*… or
*instr*, *accomp*…). The song is placed where the melody starts and lasts as long.

- One note at a time a line: of notes starting together the highest is kept. A second track of **chords** is not
  given as a line (its top notes as the instruments' melody let an instrument take the tune); the instruments play
  freely around the sung line.
- The tempo and meter are the project's where the melody starts (a whole BPM); the key is the take's key snap when
  it is set to a major or minor scale, else the studio guesses it from the notes.
- Start the time selection on a bar line: the score's bar 1 begins where the selection does.
- The new item's notes say how the studio read it: meter, tempo, key and where it came from, which track sings.

Muted notes are left out; a looped item gives its notes once.

## Install

1. Copy this folder (all four `.lua` files together: `ruach_common.lua` is what the three share) into REAPER's
   `Scripts` folder (*Options → Show REAPER resource path*), e.g. `Scripts/Ruach/`.
2. *Actions → Show action list → New action → Load ReaScript…*, and pick the three `Ruach - …` files.
3. Run **Ruach - Settings** once: the studio's address, and see that it answers.

Needs `curl` (Linux and macOS have it; Windows 10 and later too). The audio lands in the project's folder, under
`Ruach/` (an unsaved project: REAPER's default media folder).

## What it was checked with

REAPER 7.81 on Linux, the studio on another machine of the network: *Generate here* made a 20-second take and placed
it in 12 s (48 kHz, stereo, on a new track); *Bring a take* found and placed one in 2.5 s. With a melody (8 bars on a
*Lead vocal* track and chords on *Piano*): a 19-second song placed at the selection's start in 10–14 s, every one of
its 20 notes in the score as written (a dotted note, one held over a bar line), and the voice singing them: written
back from the take's sound, 95–100% of the notes at their pitch. A waltz (3/4, no time selection) placed at the items'
start. `heresy/tools/reaper-harness.lua` runs all of it without a person, under Xvfb (`RUACH_MIDI=1` or `waltz`
writes the melody first).
