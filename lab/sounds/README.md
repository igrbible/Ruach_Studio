# The piano roll's instruments

The Creator's piano roll plays a score with these, a note every three semitones played at its neighbours' pitches (HERESY 1586).

- `piano-NN.mp3` (MIDI note NN, A0 to C8): the **Salamander Grand Piano** by Alexander Holm, as Tone.js keeps it (tonejs.github.io/audio/salamander), licensed under **Creative Commons Attribution 3.0** (https://creativecommons.org/licenses/by/3.0/).
- `aah-NN.mp3` and `ooh-NN.mp3` (C2 to C6): the choir «aah» and the voice «ooh» of the **FluidR3 GM** sound font by Frank Wen, as MIDI.js keeps them (github.com/gleitz/midi-js-soundfonts), licensed under **Creative Commons Attribution 3.0**.

Changed from the originals: mono, cut to three or four seconds with a fade, MP3 at 80 kbps (heresy/MISC/claude-tc/sounds-1586.py).

- `vX-NN.mp3` (X the vowel a, e, i, o or u; NN the MIDI note, C3 to A5), with their loops in `vowels.json`: sung vowels held in straight tone by one singer of **VocalSet**, its female2, the darkest of its nine women, the notes under her own tuned down (Julia Wilkins, Prem Seetharaman, Alison Wahl, Bryan Pardo, *VocalSet: A Singing Voice Dataset*, ISMIR 2018; zenodo.org/records/1442513), licensed under **Creative Commons Attribution 4.0** (https://creativecommons.org/licenses/by/4.0/). Changed from the originals: the steadiest stretch at each pitch cut out, tuned to the note by resampling, levelled, faded, MP3 at 96 kbps; which singer and file each one comes from is in `vowels-sources.tsv` (heresy/MISC/claude-tc/vowels-1629.py, HERESY 1629; 1624 took each note from a different singer).
