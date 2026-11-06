# YuE2-RS-TW · the Tsunami Wave's vocabulary

Every word in the style lines of the **109,250 tracks** that taught [YuE2-RS-TW](https://huggingface.co/goldhub/YuE2-RS-Finetunes), Ruach Studio's second fine-tune of m-a-p's YuE2-3B and the Studio's default (trained over RS-FW 2.4 ×0.75 of the First Wave and folded back into it), counted and sorted by what it says; and the vocabulary of the **106,532 scores** its music half learned to plan from. Few fine-tunes publish what their model was told; here it is, whole.

What the First Wave was told before it, the weights the Tsunami Wave was trained over, is in [FW-VOCABULARY.md](FW-VOCABULARY.md).

A word the model met hundreds of times is a word it understands. Write your style in these words, in this order, and the model hears what you mean; a word it never met is a guess. The counts are tracks, each counted once.

**Search it** on [Ruach Studio's page](https://ruachstudio.art/#vocabulary) or in the Studio (F1); **take it whole** as [tw-vocabulary.json](fw-vocabulary/tw-vocabulary.json) (every word met in two tracks or more, with its sources and the words it came with).

## Contents

1. [How a style line was written](#how-a-style-line-was-written)
2. [The data at a glance](#the-data-at-a-glance)
3. [Emotion words](#emotion-words)
4. [Genres and styles](#genres-and-styles)
5. [Instruments](#instruments)
6. [Voice](#voice)
7. [Mood](#mood)
8. [Use and theme](#use-and-theme)
9. [Sound and space](#sound-and-space)
10. [Form and pace](#form-and-pace)
11. [Key and harmony](#key-and-harmony)
12. [Tempo (BPM)](#tempo-bpm)
13. [Language](#language)
14. [Leading words of our own loops](#leading-words-of-our-own-loops)
15. [Free descriptions](#free-descriptions)
16. [The scores](#the-scores)
17. [Writing a style for YuE2-RS-TW](#writing-a-style-for-yue2-rs-tw)

## How a style line was written

Each track's line follows YuE2's own order: **language or Instrumental → genre → instruments → mood → emotion words → key → BPM**. Where a set wrote its own lines (the Suno-made sets, the Studio's own takes), its words come first and the emotion words follow. Lyrics, where a track sings, come after the line under `[Lyrics]`.

| from | a line as the model read it |
|---|---|
| MTG-Jamendo | `Instrumental, dance, electronic, house, euphoric, high energy, ecstatic, G minor, 130 BPM` |
| FMA | `Instrumental, Electronic, Experimental Pop, synth, numb, ominous` |
| Suno-made | `Portuguese, Bossa nova, soft nylon-string acoustic guitar, gentle brushed drums, mellow upright bass, subtle Rhodes, …` |
| Studio takes | `Instrumental, solo cello. A slow, meditative piece played by a single cello, close-miked and in front, …` |
| Speech | `Russian spoken word, audiobook narration, male voice, calm clear reading, close-mic, dry studio, no music, …` |
| Other | `Greek, Traditional, Nisiotiko, Aegean, Violin, Santouri, Laouto, fragile, melancholic, soft, tender` |

## The data at a glance

109,250 tracks, about 6,650 hours by the frames the model learned from (the sources' own lengths add up to 6,642: Speech and the loops carry none); 18,755 sing words. 6,511 distinct words in the style lines; 2,920 of them met in two tracks or more are listed in the JSON.

An FMA line is its genres and three tags its users wrote, and those tags name artists, labels, radio stations, people and places as often as a style. So only FMA's own genre names are counted from them: 1,361 words only FMA's users wrote are left out. 18 more were taken out by hand: names, titles and fragments of lines.

| source | tracks |
|---|---:|
| MTG-Jamendo | 49,219 |
| FMA | 51,058 |
| Suno-made | 3,676 |
| Studio takes | 1,112 |
| Speech | 600 |
| Album & loops | 14 |
| Other | 3,571 |

**Other** gathers the smaller sources the model card does not name one by one: Greek traditional and folk song, songs in Hebrew, Russian and Ukrainian, readings of the Bible, worship, a few violin and shofar takes. Their lines carry a language, a genre and its region, the instruments and the emotion words. The 88 tracks the training measured itself on, and never learned from, are left out of every count here.

| what the words say | distinct words | the most met |
|---|---:|---|
| Instrumental | 1 | Instrumental |
| Genres and styles | 708 | Electronic, pop, soundtrack, Experimental, ambient, rock |
| Instruments | 573 | piano, bass, drums, synthesizer, guitar, electric guitar |
| Voice | 233 | male voice, Bible reading, audiobook narration, calm clear reading, Russian spoken word, no vocals |
| Emotion words | 40 | playful, numb, restrained, menacing, cold, harsh |
| Mood | 194 | happy, emotional, energetic, relaxing, epic, dream |
| Use and theme | 32 | love, advertising, corporate, documentary, children, background |
| Sound and space | 118 | close-mic, dry studio, no music, nothing else playing, close-miked and in front, Natural room |
| Form and pace | 20 | melodic, slow, fast, driving, solo, slow tempo |
| Key and harmony | 35 | C major, A minor, G major, C minor, D major, E minor |
| Tempo (BPM) | 138 | 120 BPM, 100 BPM, 90 BPM, 119 BPM, 80 BPM, 130 BPM |
| Language | 32 | English, Russian, Hebrew, Greek, latin, French |
| Leading words of our own loops | 2 | duduk, shofar |
| Free descriptions | 794 | with music, Traditional, electro, messianic, 8bit, halloween |

## Emotion words

These were not written by anyone: LAION's Empathic Insight heads (an EmoWhisper encoder with 55 heads) listened to three 30-second windows of every track and scored it on each dimension. A dimension's score was measured against the whole set, so a word means **more than most of this set**, not an absolute: a track takes the words of its dimensions above one standard deviation, the strongest first, at most four. Two-sided dimensions give a word at each end. The voice's own qualities (commanding, yielding, detached, vulnerable) were given only to tracks with a voice. Read from the whole mix, they follow the music's character as much as a singer's.

| word | Empathic Insight dimension | end | tracks | |
|---|---|---|---:|---|
| **playful** | Amusement |  | 15,778 | `████████████████` |
| **numb** | Emotional Numbness |  | 15,689 | `███████████████▉` |
| **restrained** | Monotone vs. Expressive | low | 15,513 | `███████████████▊` |
| **menacing** | Malevolence / Malice |  | 14,855 | `███████████████` |
| **cold** | Warm vs. Cold | low | 14,392 | `██████████████▋` |
| **harsh** | Soft vs. Harsh | low | 13,279 | `█████████████▌` |
| **low energy** | Arousal | low | 13,034 | `█████████████▎` |
| **angry** | Anger |  | 12,655 | `████████████▊` |
| **aching** | Pain |  | 12,299 | `████████████▌` |
| **solemn** | Serious vs. Humorous | low | 10,171 | `██████████▍` |
| **ecstatic** | Pleasure / Ecstasy |  | 9,930 | `██████████` |
| **grateful** | Thankfulness / Gratitude |  | 9,664 | `█████████▊` |
| **fragile** | Helplessness |  | 9,341 | `█████████▌` |
| **ominous** | Fear |  | 9,094 | `█████████▎` |
| **bright** | Valence | high | 8,091 | `████████▎` |
| **awe-struck** | Awe |  | 7,769 | `███████▉` |
| **bitter** | Bitterness |  | 7,734 | `███████▊` |
| **euphoric** | Elation |  | 7,716 | `███████▊` |
| **anguished** | Distress |  | 7,685 | `███████▊` |
| **soothing** | Relief |  | 7,654 | `███████▊` |
| **melancholic** | Sadness |  | 7,398 | `███████▌` |
| **sensual** | Sexual Lust |  | 6,952 | `███████` |
| **romantic** | Infatuation |  | 6,683 | `██████▊` |
| **contemplative** | Contemplation |  | 6,041 | `██████` |
| **dark** | Valence | low | 5,883 | `█████▉` |
| **proud** | Pride |  | 5,263 | `█████▍` |
| **yearning** | Longing |  | 5,072 | `█████▎` |
| **humorous** | Serious vs. Humorous | high | 4,694 | `████▊` |
| **warm** | Warm vs. Cold | high | 4,636 | `████▋` |
| **triumphant** | Triumph |  | 4,504 | `████▌` |
| **tender** | Affection |  | 3,926 | `███▉` |
| **hopeful** | Hope / Enthusiasm / Optimism |  | 3,894 | `███▉` |
| **expressive** | Monotone vs. Expressive | high | 3,671 | `███▊` |
| **detached** | Vulnerable vs. Emotionally Detached | high · voice only | 3,593 | `███▋` |
| **commanding** | Submissive vs. Dominant | high · voice only | 3,365 | `███▍` |
| **soft** | Soft vs. Harsh | high | 3,362 | `███▍` |
| **serene** | Contentment |  | 2,610 | `██▋` |
| **vulnerable** | Vulnerable vs. Emotionally Detached | low · voice only | 1,969 | `█▉` |
| **high energy** | Arousal | high | 1,738 | `█▊` |
| **yielding** | Submissive vs. Dominant | low · voice only | 1,060 | `█` |

## Genres and styles

What kind of music: MTG-Jamendo's and FMA's own genre tags, the styles the Suno-made sets wrote, and the regions and kinds of Greek song the «Other» lines name. 708 distinct words; the 160 most met:

| word | tracks | | from | met with |
|---|---:|---|---|---|
| Electronic | 26,989 | `████████████` | FMA 15003 · MTG 11921 | menacing, ecstatic, ominous, Experimental |
| pop | 11,365 | `█████` | MTG 6406 · FMA 4665 | romantic, rock, anguished, pop folk |
| soundtrack | 9,228 | `████` | MTG 5554 · FMA 3671 | low energy, orchestral, solemn, aching |
| Experimental | 8,685 | `███▉` | FMA 6764 · MTG 1899 | Electronic, ominous, Avant-Garde, Ambient Electronic |
| ambient | 8,582 | `███▊` | MTG 5369 · FMA 3159 | solemn, aching, low energy, numb |
| rock | 7,859 | `███▌` | MTG 3798 · FMA 3616 | harsh, bitter, angry, anguished |
| Folk | 7,307 | `███▎` | FMA 5018 · MTG 2237 | Singer-Songwriter, melancholic, soothing, Country |
| classical | 6,644 | `██▉` | MTG 4963 · FMA 1666 | solemn, piano, low energy, aching |
| Hip-Hop | 5,191 | `██▍` | FMA 5178 | proud, English, commanding, triumphant |
| easy listening | 4,405 | `█▉` | MTG 4197 | lounge, low energy, piano, chill out |
| jazz | 3,699 | `█▋` | MTG 1867 · FMA 1744 | playful, piano, bass, funk |
| dance | 3,499 | `█▌` | MTG 2386 · FMA 1054 | ecstatic, Electronic, euphoric, house |
| Indie-Rock | 3,249 | `█▌` | FMA 3248 | anguished, bitter, pop, yearning |
| chill out | 3,221 | `█▌` | MTG 3178 | ambient, lounge, Downtempo, keyboard |
| Experimental Pop | 3,157 | `█▍` | FMA 3154 | Lo-Fi, Indie-Rock, Synth Pop, anguished |
| Singer-Songwriter | 3,062 | `█▍` | FMA 2712 · MTG 343 | Folk, soothing, anguished, English |
| Ambient Electronic | 3,020 | `█▍` | FMA 3018 | Experimental, numb, IDM, aching |
| Downtempo | 2,759 | `█▎` | FMA 1609 · MTG 1138 | Trip-Hop, chill out, Electronic, guitar |
| techno | 2,560 | `█` | FMA 1433 · MTG 1076 | Electronic, menacing, house, ominous |
| alternative | 2,510 | `█` | MTG 2376 | indie, electric guitar, bass, drums |
| hip hop | 2,487 | `█` | MTG 2251 · FMA 195 | rap, beat, proud, bass |
| house | 2,268 | `█` | MTG 1536 · FMA 633 | deep, ecstatic, dance, keyboard |
| IDM | 2,213 | `▉` | FMA 2087 · MTG 125 | Electronic, Glitch, Ambient Electronic, ominous |
| indie | 2,028 | `▉` | MTG 1917 | alternative, bass, electric guitar, drums |
| orchestral | 1,945 | `▉` | MTG 1890 | soundtrack, classical, epic, aching |
| Lo-Fi | 1,931 | `▉` | FMA 1904 | Experimental Pop, Indie-Rock, Avant-Garde, Freak-Folk |
| new age | 1,930 | `▉` | MTG 1652 · FMA 270 | ambient, low energy, solemn, relaxing |
| lounge | 1,836 | `▊` | MTG 1513 · FMA 308 | easy listening, chill out, jazz, relaxing |
| blues | 1,773 | `▊` | FMA 863 · MTG 859 | Folk, Country, soothing, English |
| Avant-Garde | 1,763 | `▊` | FMA 1757 | Experimental, ominous, Lo-Fi, jazz |
| funk | 1,758 | `▊` | MTG 1063 · FMA 628 | playful, jazz, R&B, bongo |
| pop rock | 1,719 | `▊` | MTG 1690 | electric guitar, drums, bass, pop |
| pop folk | 1,546 | `▋` | MTG 1545 | Folk, pop, acoustic guitar, happy |
| Punk | 1,488 | `▋` | FMA 1479 | angry, bitter, harsh, Garage |
| rap | 1,429 | `▋` | MTG 838 · FMA 534 | hip hop, proud, triumphant, Hip-Hop |
| Glitch | 1,399 | `▋` | FMA 1329 | IDM, Electronic, menacing, ominous |
| world | 1,335 | `▋` | MTG 1309 | ethno, world fusion, playful, new age |
| Trip-Hop | 1,323 | `▋` | FMA 1320 | Downtempo, Hip-Hop, Glitch, Chill-out |
| International | 1,312 | `▋` | FMA 1312 | Balkan, Folk, Middle East, grateful |
| cinematic | 1,272 | `▌` | MTG 1195 | orchestral, soundtrack, classical, aching |
| instrumental pop | 1,229 | `▌` | MTG 1212 | pop, easy listening, restrained, low energy |
| Dubstep | 1,222 | `▌` | FMA 831 · MTG 356 | menacing, Electronic, ominous, dub |
| Industrial | 1,209 | `▌` | FMA 963 · MTG 242 | menacing, Electronic, techno, cold |
| Country | 1,173 | `▌` | FMA 588 · MTG 521 · Suno 60 | Folk, blues, English, mexico |
| spoken word | 1,165 | `▌` | Other 1154 | with music, Bible reading, male voice, restrained |
| atmospheric | 1,133 | `▌` | MTG 1075 | ambient, aching, low energy, solemn |
| Synth Pop | 1,105 | `▌` | FMA 1103 | Experimental Pop, electro pop, pop, Lo-Fi |
| reggae | 1,100 | `▌` | MTG 1060 | playful, dub, dancehall, north |
| Electroacoustic | 1,084 | `▌` | FMA 1084 | Experimental, Avant-Garde, aching, ominous |
| progressive | 1,023 | `▌` | MTG 592 · FMA 427 | metal, harsh, cold, rock |
| Chip Music | 977 | `▌` | FMA 977 | Chiptune, ecstatic, playful, menacing |
| Garage | 973 | `▌` | FMA 934 | Punk, bitter, angry, harsh |
| Chiptune | 957 | `▍` | FMA 884 · MTG 72 | Chip Music, 8bit, ecstatic, playful |
| metal | 941 | `▍` | MTG 559 · FMA 375 | angry, harsh, bitter, cold |
| Post-Rock | 902 | `▍` | FMA 899 | cold, Indie-Rock, dark, Shoegaze |
| Hip-Hop Beats | 848 | `▍` | FMA 848 | Electronic, Chill-out, beats, ominous |
| Psych-Folk | 848 | `▍` | FMA 848 | anguished, Drone, Folk, yearning |
| trance | 832 | `▍` | MTG 792 | ecstatic, euphoric, dance, techno |
| electropop | 813 | `▍` | MTG 758 | synthesizer, synthpop, pop, Electronic |
| Minimalism | 805 | `▍` | FMA 713 · MTG 89 | Contemporary Classical, low energy, solemn, numb |
| Breakbeat | 743 | `▍` | FMA 453 · MTG 289 | menacing, beats, IDM, ominous |
| Americana | 725 | `▍` | FMA 685 · MTG 37 | Country, Folk, bitter, English |
| disco | 712 | `▍` | MTG 408 · FMA 267 · Suno 37 | dance, funk, ecstatic, euphoric |
| Post-Punk | 679 | `▍` | FMA 675 | Indie-Rock, harsh, angry, Goth |
| trip hop | 677 | `▍` | MTG 623 · FMA 52 | hip hop, Downtempo, upbeat, bass |
| Psych-Rock | 674 | `▍` | FMA 674 | dark, anguished, Indie-Rock, Garage |
| Reggae - Dub | 664 | `▍` | FMA 664 | playful, menacing, Dubstep, Reggae - Dancehall |
| christmas | 651 | `▍` | MTG 587 · FMA 62 | holiday, classical, children, soundtrack |
| Chill-out | 636 | `▎` | FMA 636 | Ambient Electronic, Trip-Hop, chillout, Electronic |
| Improv | 632 | `▎` | FMA 632 | Free-Jazz, Experimental, ominous, restrained |
| dub | 595 | `▎` | MTG 371 · FMA 220 | Dubstep, reggae, bass, playful |
| Alternative Hip-Hop | 574 | `▎` | FMA 574 | Hip-Hop, proud, commanding, Portuguese |
| electronica | 553 | `▎` | FMA 313 · MTG 233 | Electronic, IDM, Jungle, menacing |
| R&B | 545 | `▎` | MTG 470 · Suno 59 | funk, hip hop, soul, sensual |
| Contemporary Classical | 518 | `▎` | FMA 518 | Minimalism, solemn, low energy, numb |
| minimal | 518 | `▎` | MTG 450 · FMA 48 | piano, numb, low energy, restrained |
| Power-Pop | 503 | `▎` | FMA 503 | bitter, rock, Punk, Garage |
| Drone | 495 | `▎` | FMA 456 · MTG 30 | ambient, solemn, awe-struck, aching |
| symphonic | 487 | `▎` | MTG 473 | orchestral, classical, epic, aching |
| club | 485 | `▎` | MTG 471 | dance, ecstatic, happy, euphoric |
| Minimal Electronic | 480 | `▎` | FMA 480 | techno, Industrial, Experimental, Glitch |
| Balkan | 470 | `▎` | FMA 470 | International, serene, grateful, awe-struck |
| Hardcore | 458 | `▎` | FMA 382 · MTG 74 | angry, Punk, harsh, bitter |
| Soul-RnB | 435 | `▎` | FMA 435 | Hip-Hop, funk, English, bitter |
| deep house | 429 | `▎` | MTG 391 · Suno 34 | chill out, Downtempo, guitar, piano |
| drum and bass | 422 | `▎` | MTG 362 · FMA 53 | Electronic, Breakbeat, menacing, Dubstep |
| fusion | 421 | `▎` | MTG 399 | jazz, funk, electric guitar, playful |
| compilation | 417 | `▎` | FMA 417 | Experimental, breakcore, Electronic, Unclassifiable |
| worship | 379 | `▎` | Other 376 | messianic, Hebrew, melancholic, yearning |
| Shoegaze | 377 | `▎` | FMA 373 | Indie-Rock, Post-Rock, anguished, yearning |
| soul | 370 | `▎` | MTG 252 · FMA 59 · Suno 47 | R&B, funk, soulful, beat |
| synthpop | 366 | `▎` | MTG 349 | electropop, synthesizer, Electronic, pop |
| instrumental rock | 363 | `▎` | MTG 346 | electric guitar, rock, harsh, bass |
| New Wave | 361 | `▎` | FMA 349 | Indie-Rock, Post-Punk, harsh, anguished |
| ballad | 360 | `▎` | MTG 309 · Suno 40 | pop, acoustic guitar, piano, melancholic |
| hard rock | 358 | `▎` | MTG 302 · FMA 42 | angry, rock, harsh, metal |
| celtic | 345 | `▎` | MTG 272 · FMA 71 | irish, harp, Folk, medieval |
| Drum & Bass | 339 | `▎` | FMA 339 | menacing, Breakcore - Hard, Jungle, IDM |
| psychedelic | 336 | `▎` | MTG 232 · FMA 95 | psytrance, Krautrock, drums, bass |
| Latin America | 333 | `▎` | FMA 333 | Spanish, bright, Experimental Pop, Cumbia |
| Free-Jazz | 325 | `▎` | FMA 325 | Improv, Experimental, ominous, Avant-Garde |
| improvisation | 324 | `▎` | MTG 241 · FMA 83 | jazz, piano, low energy, classical |
| ethno | 313 | `` | MTG 312 | world, asian, meditative, new age |
| Freak-Folk | 311 | `` | FMA 311 | Lo-Fi, anguished, Hip-Hop Beats, Americana |
| Europe | 304 | `` | FMA 304 | International, Balkan, grateful, Folk |
| Goth | 299 | `` | FMA 294 | horror, Post-Punk, halloween, anguished |
| Composed Music | 298 | `` | FMA 298 | aching, solemn, classical, low energy |
| contemporary | 298 | `` | MTG 271 · FMA 26 | classical, low energy, solemn, aching |
| 90s | 297 | `` | MTG 286 | melodic, sampler, dance, 80s |
| 80s | 295 | `` | MTG 271 | 90s, synthesizer, retro, synthpop |
| acid jazz | 291 | `` | MTG 274 | groovy, playful, jazz fusion, funk |
| Unclassifiable | 291 | `` | FMA 291 | breakcore, electro, compilation, Experimental |
| Noise-Rock | 290 | `` | FMA 290 | Experimental Pop, angry, Lo-Fi, Punk |
| punk rock | 288 | `` | MTG 281 | angry, harsh, electric guitar, drums |
| holiday | 282 | `` | MTG 144 · FMA 138 | christmas, contemplative, awe-struck, happy |
| Krautrock | 281 | `` | FMA 273 | Nu-Jazz, lounge, Psych-Rock, Space-Rock |
| chanson | 279 | `` | MTG 276 | pop, chansonfrancaise, guitar, pop folk |
| dark ambient | 276 | `` | MTG 247 · FMA 23 | ambient, awe-struck, aching, darkwave |
| EDM | 258 | `` | MTG 211 · Suno 27 · FMA 16 | dance, house, ecstatic, euphoric |
| darkwave | 254 | `` | MTG 166 · FMA 83 | triphop, dark ambient, alternative, dark |
| Electro-Punk | 250 | `` | FMA 250 | angry, Experimental Pop, Industrial, Punk |
| Jungle | 245 | `` | FMA 203 · MTG 41 | Drum & Bass, menacing, IDM, electronica |
| acoustic | 230 | `` | FMA 189 · Suno 39 | Folk, Electroacoustic, Post-Rock, Lo-Fi |
| Breakcore - Hard | 226 | `` | FMA 226 | Drum & Bass, menacing, angry, Jungle |
| Nisiotiko | 224 | `` | Other 224 | Traditional, Aegean, Laouto, Greek |
| Free-Folk | 219 | `` | FMA 219 | Singer-Songwriter, International, anguished, contemplative |
| classic rock | 211 | `` | MTG 183 · FMA 22 | hard rock, guitar, christmas, grateful |
| grunge | 207 | `` | MTG 197 | alternative, drums, bass, electric guitar |
| bossa nova | 205 | `` | MTG 139 · Suno 48 | latin, jazz, brazil, Portuguese |
| jazz fusion | 199 | `` | MTG 182 · FMA 12 | jazz, drums, bass, piano |
| alternative rock | 197 | `` | MTG 151 · FMA 33 | rock, alternative, indie, bitter |
| african | 195 | `` | MTG 106 · FMA 87 | playful, world, Afrobeat, International |
| rock and roll | 193 | `` | MTG 187 | electric guitar, rock, drums, bass |
| 70s | 192 | `` | MTG 176 · FMA 15 | groovy, playful, funk, acid jazz |
| post rock | 192 | `` | MTG 161 · FMA 31 | indie, guitar, alternative, ambient |
| ska | 192 | `` | MTG 163 · FMA 20 | reggae, bass, rock, playful |
| swing | 190 | `` | MTG 124 · Suno 40 · FMA 24 | jazz, playful, bright, Big Band/Swing |
| groove | 189 | `` | MTG 184 | funk, groovy, playful, acid jazz |
| comedy | 183 | `` | MTG 171 · FMA 11 | animation, children, soundtrack, playful |
| Choral Music | 180 | `` | FMA 180 | awe-struck, contemplative, soprano, Opera |
| eurodance | 177 | `` | MTG 168 · Suno 9 | dance, ecstatic, euphoric, synthesizer |
| lofi | 164 | `` | MTG 107 · FMA 55 | indie, Chiptune, game, 8bit |
| Kid-Friendly | 154 | `` | FMA 154 | children, lullaby, French, bright |
| flamenco | 152 | `` | MTG 87 · FMA 49 · Suno 14 | Spanish, latin, playful, fusion |
| Epirotic | 150 | `` | Other 150 | Klarino, Laouto, Traditional, percussion |
| 20th Century Classical | 149 | `` | FMA 149 | classical, cabaret, Choral Music, solemn |
| jazzfunk | 147 | `` | MTG 147 | funk, jazz, playful, drums |
| Chamber Music | 145 | `` | FMA 145 | classical, aching, solemn, Choral Music |
| baroque | 144 | `` | MTG 95 · FMA 45 | classical, awe-struck, choral, aching |
| Aegean | 140 | `` | Other 140 | Nisiotiko, Traditional, Laouto, Santouri |
| dancehall | 135 | `` | MTG 126 | north, reggae, france, proud |
| 60s | 134 | `` | MTG 131 | melodic, rock and roll, 70s, pop rock |
| Bluegrass | 130 | `` | FMA 123 · Suno 7 | Americana, Folk, fiddle, banjo |
| No Wave | 125 | `` | FMA 125 | Post-Punk, Noise-Rock, angry, Punk |
| Brazilian | 124 | `` | FMA 124 | Portuguese, International, brazil, Singer-Songwriter |
| hiphop | 124 | `` | FMA 119 | beats, Hip-Hop Beats, Hip-Hop, Electronic |
| medieval | 122 | `` | MTG 116 | celtic, flute, epic, bassoon |
| Opera | 120 | `` | FMA 101 · MTG 17 | soprano, Choral Music, awe-struck, classical |
| Loud-Rock | 115 | `` | FMA 115 | angry, metal, bitter, Power-Pop |
| Mikrasiatiko | 113 | `` | Other 113 | Traditional, Greek, Oud, violin |

## Instruments

What plays: MTG-Jamendo's instrument tags (up to four a track) and the instruments the free style lines name, the Greek and Middle Eastern ones among them. 573 distinct words; the 160 most met:

| word | tracks | | from | met with |
|---|---:|---|---|---|
| piano | 6,676 | `████████████` | MTG 6229 | classical, low energy, solemn, numb |
| bass | 4,827 | `████████▋` | MTG 4604 | drums, electric guitar, guitar, keyboard |
| drums | 4,673 | `████████▍` | MTG 4593 | bass, electric guitar, guitar, keyboard |
| synthesizer | 4,393 | `███████▉` | MTG 4379 | Electronic, drum machine, ambient, sampler |
| guitar | 3,985 | `███████▎` | MTG 3604 · Other 283 | drums, bass, piano, rock |
| electric guitar | 2,814 | `█████` | MTG 2774 | bass, drums, acoustic guitar, pop rock |
| acoustic guitar | 1,916 | `███▌` | MTG 1766 | electric guitar, bass, drums, Folk |
| violin | 1,496 | `██▋` | MTG 813 · Other 564 | Traditional, Laouto, Greek, percussion |
| electronic production | 1,299 | `██▍` | MTG 1297 | synthesizer, Electronic, drum machine, bass |
| percussion | 1,267 | `██▎` | MTG 700 · Other 563 | Traditional, Greek, Laouto, deep |
| keyboard | 1,228 | `██▎` | MTG 1215 | drums, bass, deep, percussion |
| drum machine | 1,217 | `██▎` | MTG 1211 | synthesizer, sampler, bass, electronic production |
| strings | 990 | `█▊` | MTG 900 · Studio 76 | piano, orchestral, classical, soundtrack |
| cello | 846 | `█▌` | MTG 816 | classical, double bass, soundtrack, orchestral |
| electric piano | 730 | `█▍` | MTG 720 | electric guitar, bass, acoustic guitar, drums |
| sampler | 651 | `█▎` | MTG 650 | synthesizer, drum machine, dance, energetic |
| flute | 564 | `█` | MTG 514 | classical, cello, piano, soundtrack |
| accordion | 543 | `▉` | MTG 385 · Other 96 · FMA 36 | Greek, guitar, Bouzouki, drums |
| beat | 516 | `▉` | MTG 495 | hip hop, drum machine, bass, rap |
| classical guitar | 509 | `▉` | MTG 483 | acoustic guitar, bass, acoustic bass guitar, drums |
| brass | 501 | `▉` | MTG 468 | hip hop, bongo, bass, bell |
| saxophone | 461 | `▊` | MTG 422 · Suno 36 | jazz, bass, drums, playful |
| Laouto | 452 | `▊` | Other 452 | Traditional, violin, Klarino, percussion |
| orchestra | 430 | `▊` | MTG 412 | classical, soundtrack, orchestral, aching |
| bell | 402 | `▊` | MTG 401 | bongo, hip hop, brass, bass |
| double bass | 351 | `▋` | MTG 338 | cello, classical, drums, cinematic |
| harp | 319 | `▋` | MTG 306 | cello, celtic, classical, flute |
| ukulele | 310 | `▌` | MTG 290 | Folk, happy, pop folk, playful |
| Klarino | 295 | `▌` | Other 295 | Traditional, Laouto, percussion, violin |
| trumpet | 279 | `▌` | MTG 224 · FMA 25 · Other 15 | trombone, clarinet, saxophone, jazz |
| bongo | 278 | `▌` | MTG 278 | brass, hip hop, bell, bass |
| acoustic bass guitar | 262 | `▌` | MTG 262 | acoustic guitar, drums, instrumentalhiphop, bass |
| beats | 213 | `▍` | FMA 206 | hiphop, Chiptune, Breakbeat, Hip-Hop Beats |
| viola | 195 | `▍` | MTG 178 · FMA 14 | cello, classical, piano, violin |
| horn | 187 | `▍` | MTG 186 | cello, classical, double bass, orchestral |
| rhodes | 178 | `▍` | MTG 171 | chill out, lounge, jazz, drums |
| clarinet | 170 | `▍` | MTG 155 · FMA 13 | classical, cello, flute, trumpet |
| organ | 170 | `▍` | MTG 127 · FMA 41 | pipe organ, guitar, drums, electric guitar |
| harmonica | 164 | `▍` | MTG 148 | acoustic guitar, Folk, pop folk, blues |
| pad | 161 | `▍` | MTG 158 | atmospheric, chill out, ambient, drums |
| Oud | 160 | `▍` | Other 113 · MTG 25 · Suno 11 | Traditional, percussion, Greek, Mikrasiatiko |
| pipe organ | 151 | `▎` | MTG 119 · FMA 30 | organ, celesta, festive, drums |
| Santouri | 147 | `▎` | Other 147 | Traditional, violin, Nisiotiko, Aegean |
| oboe | 141 | `▎` | MTG 140 | classical, christmas, piano, cvp509 |
| Bouzouki | 140 | `▎` | Other 132 | Greek, Rebetiko, guitar, Laiko |
| glockenspiel | 113 | `▎` | MTG 111 | sweet, nostalgic, celesta, viola |
| trombone | 110 | `▎` | MTG 93 · Other 15 | trumpet, saxophone, timpani, cello |
| Lyra | 105 | `▎` | Other 105 | Traditional, percussion, Greek, Pontian |
| banjo | 100 | `▎` | MTG 66 · FMA 20 · Suno 12 | fiddle, Country, Folk, Bluegrass |
| mandolin | 89 | `▎` | MTG 54 · Other 31 | pop folk, Folk, Greek, Traditional |
| celesta | 83 | `▎` | MTG 83 | festive, pipe organ, happy, advertising |
| synth | 65 | `` | FMA 44 · Suno 15 · Studio 6 | synthwave, Experimental Pop, male vocal, No Wave |
| solo piano | 61 | `` | FMA 59 | simple, classical, low energy, solemn |
| harpsichord | 60 | `` | MTG 53 · FMA 4 · Suno 3 | classical, cello, baroque, Opera |
| ney | 58 | `` | Other 27 · MTG 24 · Suno 7 | Oud, percussion, Greek, Lyra |
| xylophone | 58 | `` | MTG 47 · Suno 11 | happy, ukulele, soundtrack, sweet |
| bassoon | 57 | `` | MTG 47 · FMA 10 | flute, cello, clarinet, double bass |
| tabla | 56 | `` | MTG 28 · Suno 26 | sitar, world, saxophone, tender |
| vibraphone | 56 | `` | MTG 55 | thoughtful, minimal, melodic, piano |
| timpani | 54 | `` | MTG 53 | trombone, cello, soundtrack, classical |
| marimba | 50 | `` | MTG 35 · FMA 11 · Suno 4 | celesta, sweet, glockenspiel, background |
| Baglamas | 48 | `` | Other 42 · Studio 6 | Bouzouki, Rebetiko, Greek, guitar |
| Cimbalom | 45 | `` | Other 30 · MTG 15 | Mikrasiatiko, violin, Greek, guitar |
| balalaika | 41 | `` | Studio 24 · MTG 12 · Suno 5 | Russian folk ballad, 80 BPM, strings, melancholic |
| melodica | 40 | `` | MTG 39 | ballad, 90s, tender, Folk |
| sitar | 38 | `` | MTG 23 · FMA 7 · Suno 6 · Studio 2 | tabla, chill, world, beat |
| viola and cello | 38 | `` | Studio 38 | Celtic harp, no vocals, contemplative, melancholic |
| Celtic harp | 36 | `` | Studio 36 | viola and cello, no vocals, contemplative, melancholic |
| cajon | 35 | `` | MTG 35 | acoustic guitar, bass, ethnicrock, flamenco |
| upright bass | 35 | `` | Suno 19 · Studio 16 | bossa nova, Portuguese, waltz, female vocal |
| djembe | 34 | `` | MTG 28 · Suno 6 | tribal, EDM, drums, house |
| tuba | 32 | `` | MTG 25 · Other 5 · Studio 2 | trombone, trumpet, xylophone, Folk |
| fiddle | 31 | `` | FMA 13 · MTG 8 · Suno 8 · Studio 2 | banjo, Bluegrass, celtic, Americana |
| didgeridoo | 30 | `` | FMA 13 · MTG 12 · Suno 5 | Improv, Minimalism, trance, Experimental |
| deep bass | 28 | `` | Studio 14 · Suno 14 |  |
| kalimba | 25 | `` | MTG 23 · Suno 2 |  |
| spanish guitar | 25 | `` | FMA 21 · Suno 4 |  |
| button accordion | 24 | `` | Studio 24 |  |
| erhu | 24 | `` | MTG 14 · Studio 8 · Suno 2 |  |
| mellotron | 23 | `` | MTG 23 |  |
| brushed drums | 22 | `` | Suno 14 · Studio 8 |  |
| castanets | 22 | `` | MTG 20 · Suno 2 |  |
| tambourine | 22 | `` | MTG 15 · Studio 6 |  |
| Tsampouna | 22 | `` | Other 22 |  |
| drum | 21 | `` | Suno 21 |  |
| gusli | 20 | `` | Other 19 · Suno 1 |  |
| piccolo | 19 | `` | MTG 19 |  |
| bagpipes | 17 | `` | MTG 17 |  |
| Floghera | 17 | `` | Other 17 |  |
| Tambouras | 17 | `` | Other 17 |  |
| sax | 15 | `` | Suno 15 |  |
| bass guitar | 14 | `` | FMA 11 · Suno 3 |  |
| Kanonaki | 14 | `` | Other 14 |  |
| sliding 808 bass | 14 | `` | Studio 14 |  |
| taiko | 14 | `` | MTG 12 · Suno 2 |  |
| koto | 13 | `` | MTG 6 · Suno 5 · Studio 2 |  |
| lute | 13 | `` | MTG 6 · FMA 4 · Suno 3 |  |
| Zournas | 13 | `` | Other 13 |  |
| bandoneon | 12 | `` | MTG 10 · Studio 2 |  |
| bodhran | 12 | `` | MTG 12 |  |
| dark piano | 12 | `` | Studio 12 |  |
| santur | 12 | `` | MTG 10 · Studio 2 |  |
| fingerstyle guitar | 11 | `` | FMA 8 · Suno 3 |  |
| guzheng | 11 | `` | Studio 8 · Suno 3 |  |
| Hammond organ | 11 | `` | Studio 6 · Suno 5 |  |
| solo shofar | 11 | `` | Album 9 · Studio 2 |  |
| charango | 10 | `` | MTG 8 · Studio 2 |  |
| mbira | 10 | `` | MTG 10 |  |
| rolling hi-hats | 10 | `` | Studio 10 |  |
| bamboo flute | 9 | `` | Studio 6 · Suno 3 |  |
| classical piano | 9 | `` | FMA 7 · Suno 2 |  |
| portuguese guitar | 9 | `` | Studio 8 · Suno 1 |  |
| soft percussion | 9 | `` | Studio 8 · Suno 1 |  |
| steel guitar | 9 | `` | Suno 9 |  |
| synth wave | 9 | `` | FMA 7 · Suno 2 |  |
| theremin | 9 | `` | FMA 5 · MTG 3 · Suno 1 |  |
| funky bass | 8 | `` | Studio 6 · Suno 2 |  |
| gentle brushed drums | 8 | `` | Suno 8 |  |
| grand piano | 8 | `` | Studio 6 · Suno 2 |  |
| mellow upright bass | 8 | `` | Suno 8 |  |
| piano pop | 8 | `` | FMA 6 · Suno 2 |  |
| Piano Solo | 8 | `` | Suno 8 |  |
| pounding drums | 8 | `` | Studio 8 |  |
| soft nylon-string acoustic guitar | 8 | `` | Suno 8 |  |
| subtle Rhodes | 8 | `` | Suno 8 |  |
| walking upright bass | 8 | `` | Suno 8 |  |
| analog synths | 7 | `` | Studio 6 · Suno 1 |  |
| congas | 7 | `` | Suno 7 |  |
| Rhodes chords | 7 | `` | Suno 7 |  |
| shamisen | 7 | `` | Suno 7 |  |
| warm bass | 7 | `` | Suno 5 · Studio 2 |  |
| darbuka | 6 | `` | Studio 4 · Suno 2 |  |
| deep sub bass | 6 | `` | Studio 6 |  |
| energetic drums | 6 | `` | Studio 6 |  |
| epic drums | 6 | `` | Studio 6 |  |
| heavy bass | 6 | `` | Suno 4 · Studio 2 |  |
| hi-hat rolls | 6 | `` | Studio 6 |  |
| jangly electric guitars | 6 | `` | Studio 6 |  |
| liquid drum and bass | 6 | `` | Studio 6 |  |
| lush pads | 6 | `` | Studio 6 |  |
| nylon guitar | 6 | `` | Studio 6 |  |
| punchy kick and snare | 6 | `` | Studio 6 |  |
| symphonic orchestra | 6 | `` | Studio 6 |  |
| vibraphone lead | 6 | `` | Suno 6 |  |
| bandura | 5 | `` | MTG 3 · Studio 2 |  |
| Bongos | 5 | `` | Suno 5 |  |
| electric bass | 5 | `` | Suno 4 · FMA 1 |  |
| guiro | 5 | `` | MTG 5 |  |
| Hammond organ swells | 5 | `` | Suno 5 |  |
| handpan | 5 | `` | Suno 5 |  |
| heavy guitar | 5 | `` | Studio 4 · Suno 1 |  |
| muted trumpet | 5 | `` | Suno 3 · Studio 2 |  |
| soft brushed drums | 5 | `` | Suno 3 · Studio 2 |  |
| solo Armenian duduk | 5 | `` | Album 5 |  |
| synths | 5 | `` | Suno 3 · FMA 2 |  |
| West African funk guitar | 5 | `` | Suno 5 |  |
| a full orchestra | 4 | `` | Studio 4 |  |
| accoustic guitar | 4 | `` | Suno 4 |  |
| acoustic piano sparse chords | 4 | `` | Suno 4 |  |
| airy pads | 4 | `` | Suno 4 |  |

## Voice

Who sings or speaks, and how: the voice's type, range, technique and place in the mix. 233 distinct words; the 100 most met:

| word | tracks | | from | met with |
|---|---:|---|---|---|
| male voice | 1,483 | `████████████` | Other 1154 · Speech 300 | with music, Bible reading, spoken word, restrained |
| Bible reading | 1,154 | `█████████▍` | Other 1154 | with music, spoken word, male voice, restrained |
| audiobook narration | 600 | `████▊` | Speech 600 | Russian spoken word, no music, dry studio, close-mic |
| calm clear reading | 600 | `████▊` | Speech 600 | Russian spoken word, no music, dry studio, close-mic |
| Russian spoken word | 600 | `████▊` | Speech 600 | no music, dry studio, close-mic, calm clear reading |
| no vocals | 525 | `████▎` | Studio 524 | nothing else playing, Natural room, close-miked and in front, A slow |
| female voice | 411 | `███▍` | Speech 300 · Suno 75 · Studio 36 | Russian spoken word, no music, dry studio, close-mic |
| choir | 250 | `██` | MTG 207 · FMA 26 · Studio 14 | awe-struck, epic, solemn, orchestral |
| Vocal | 174 | `█▍` | FMA 156 · Suno 18 | jazz, English, easy listening, gospel |
| female vocal | 93 | `▊` | Studio 56 · Suno 37 | Japanese, 70 BPM, English, dreamy |
| choral | 90 | `▊` | MTG 64 · FMA 26 | awe-struck, serene, baroque, contemplative |
| female vocals | 82 | `▋` | Suno 52 · FMA 24 · Studio 6 | English, warm, bright, romantic |
| soprano | 63 | `▌` | FMA 62 | Opera, Choral Music, awe-struck, classical |
| male vocal | 59 | `▌` | Studio 48 · Suno 11 | 72 BPM, Portuguese, britpop, samba |
| female | 41 | `▍` | Suno 35 · FMA 6 | romantic, Portuguese, warm, soft |
| clear diction | 40 | `▍` | Studio 40 | contemplative, grateful, awe-struck, Russian |
| female singer | 38 | `▍` | Suno 38 | mellow, dramatic, English, violin |
| No singing | 32 | `▎` | Studio 32 | No sung chorus, No rock guitars, No metal, commanding |
| No sung chorus | 32 | `▎` | Studio 32 | No singing, No rock guitars, No metal, commanding |
| a male rapper | 28 | `▎` | Studio 28 |  |
| male vocals | 26 | `▎` | Suno 16 · Studio 10 |  |
| singer songwriter | 26 | `▎` | FMA 24 · Suno 2 |  |
| male baritone vocal | 24 | `▎` | Studio 24 |  |
| vocals | 19 | `▎` | FMA 17 · Suno 2 |  |
| male singer | 17 | `` | Suno 17 |  |
| male rapper | 14 | `` | Studio 14 |  |
| powerful female vocals | 12 | `` | Studio 12 |  |
| raspy male vocals | 12 | `` | Studio 12 |  |
| theatrical male vocals | 12 | `` | Studio 12 |  |
| acapella | 11 | `` | FMA 10 · Suno 1 |  |
| female vocalist | 11 | `` | Suno 7 · FMA 4 |  |
| singing | 11 | `` | FMA 10 · Suno 1 |  |
| vocaloid | 11 | `` | Suno 11 |  |
| girl group | 10 | `` | Suno 8 · Studio 2 |  |
| warm male vocals | 10 | `` | Studio 10 |  |
| both sing the chorus | 8 | `` | Studio 8 |  |
| conversational phrasing | 8 | `` | Suno 8 |  |
| emotional female vocals | 8 | `` | Studio 8 |  |
| falsetto male vocals | 8 | `` | Studio 8 |  |
| intimate close-mic vocals | 8 | `` | Suno 8 |  |
| Russian rap | 8 | `` | Studio 8 |  |
| smooth male vocals | 8 | `` | Studio 8 |  |
| sung by a female contralto | 8 | `` | Studio 8 |  |
| sung by a female mezzo-soprano | 8 | `` | Studio 8 |  |
| sung by a male baritone | 8 | `` | Studio 8 |  |
| sung by a mixed choir | 8 | `` | Studio 8 |  |
| sweet female voice | 7 | `` | Suno 7 |  |
| deep baritone male vocals | 6 | `` | Studio 6 |  |
| deep low voice | 6 | `` | Studio 6 |  |
| festive choir | 6 | `` | Studio 6 |  |
| male | 6 | `` | Suno 6 |  |
| male tenor | 6 | `` | Studio 6 |  |
| pop rap | 6 | `` | Suno 4 · Studio 2 |  |
| powerful male vocals | 6 | `` | Studio 6 |  |
| soft female vocals | 6 | `` | Studio 6 |  |
| sung by a duet | 6 | `` | Studio 6 |  |
| clear vocals | 5 | `` | Suno 5 |  |
| duet | 5 | `` | Suno 5 |  |
| freestyle | 5 | `` | Suno 5 |  |
| warm breathy double-reed melody | 5 | `` | Album 5 |  |
| a female rapper | 4 | `` | Studio 4 |  |
| aggressive male rapper | 4 | `` | Studio 4 |  |
| anthemic male vocals | 4 | `` | Studio 4 |  |
| breathy female vocals | 4 | `` | Studio 4 |  |
| clear voice | 4 | `` | Suno 4 |  |
| dry male vocals | 4 | `` | Studio 4 |  |
| emotional male vocals | 4 | `` | Studio 4 |  |
| energetic male rapper | 4 | `` | Studio 4 |  |
| energetic male vocals | 4 | `` | Studio 4 |  |
| fast aggressive male rap | 4 | `` | Studio 4 |  |
| female rapper | 4 | `` | Studio 4 |  |
| Gregorian chant | 4 | `` | Studio 2 · Suno 2 |  |
| harmonies | 4 | `` | Studio 2 · Suno 2 |  |
| harmony vocals | 4 | `` | Studio 4 |  |
| male rapper with ad-libs | 4 | `` | Studio 4 |  |
| melancholic male rapper | 4 | `` | Studio 4 |  |
| mellow male rapper | 4 | `` | Studio 4 |  |
| melodic male vocals | 4 | `` | Studio 4 |  |
| no effects dry vocal | 4 | `` | Suno 4 |  |
| operatic male vocals | 4 | `` | Studio 4 |  |
| professional female singer | 4 | `` | Suno 4 |  |
| raw female vocals | 4 | `` | Studio 4 |  |
| reverb-soaked vocals | 4 | `` | Studio 4 |  |
| Russian battle rap | 4 | `` | Studio 4 |  |
| Russian cloud rap | 4 | `` | Studio 4 |  |
| Russian electro rap | 4 | `` | Studio 4 |  |
| Russian folk rap | 4 | `` | Studio 4 |  |
| Russian lyrical rap | 4 | `` | Studio 4 |  |
| shamanic meditation chant | 4 | `` | Studio 4 |  |
| shouted male rap | 4 | `` | Studio 4 |  |
| soft male vocals | 4 | `` | Studio 4 |  |
| soulful male vocals | 4 | `` | Studio 4 |  |
| sultry female vocals | 4 | `` | Studio 2 · Suno 2 |  |
| sung chorus | 4 | `` | Studio 4 |  |
| Warm close-mic male vocal | 4 | `` | Suno 4 |  |
| a high singing ability | 3 | `` | Suno 3 |  |
| clean vocals | 3 | `` | Suno 3 |  |
| clear male voice | 3 | `` | Suno 3 |  |
| emotional female base voice | 3 | `` | Suno 3 |  |
| falsetto | 3 | `` | Suno 3 |  |

## Mood

MTG-Jamendo's mood tags and the moods the free style lines name, beside the emotion words. 194 distinct words; the 100 most met:

| word | tracks | | from | met with |
|---|---:|---|---|---|
| happy | 1,413 | `████████████` | MTG 1387 | fun, pop, inspiring, summer |
| emotional | 1,224 | `██████████▍` | MTG 1082 · Studio 76 | piano, drama, soundtrack, classical |
| energetic | 1,093 | `█████████▎` | MTG 1071 | synthesizer, electric guitar, drums, bass |
| relaxing | 1,018 | `████████▋` | MTG 1010 | new age, ambient, low energy, piano |
| epic | 799 | `██████▊` | MTG 768 | orchestral, soundtrack, action, classical |
| dream | 787 | `██████▋` | MTG 785 | piano, ambient, relaxing, chill out |
| inspiring | 704 | `█████▉` | MTG 693 | happy, motivational, corporate, easy listening |
| sad | 639 | `█████▍` | MTG 542 · Suno 50 · FMA 45 | piano, classical, low energy, solemn |
| deep | 595 | `█████` | MTG 567 | keyboard, percussion, house, bass |
| meditative | 551 | `████▋` | MTG 544 | new age, relaxing, ambient, synthesizer |
| fun | 421 | `███▋` | MTG 409 | happy, pop, synthesizer, playful |
| calm | 394 | `███▍` | MTG 388 | ambient, low energy, relaxing, synthesizer |
| uplifting | 318 | `██▋` | MTG 265 · FMA 37 · Suno 16 | happy, synthesizer, trance, drum machine |
| ambiental | 296 | `██▌` | MTG 296 | Experimental, soundtrack, Electronic, aching |
| upbeat | 293 | `██▌` | MTG 250 · Suno 32 | trip hop, hip hop, bass, drums |
| positive | 275 | `██▍` | MTG 262 | happy, pop rock, easy listening, fashion |
| dramatic | 269 | `██▎` | MTG 249 · Suno 16 | epic, orchestral, soundtrack, classical |
| cool | 233 | `█▉` | MTG 211 · FMA 18 | electrojazz, lounge, chill out, dynamic |
| groovy | 176 | `█▌` | MTG 168 | funk, acid jazz, 70s, groove |
| beautiful | 166 | `█▍` | MTG 163 | easy listening, piano, low energy, classical |
| funny | 158 | `█▍` | MTG 156 | happy, dance, percussion, keyboard |
| mellow | 147 | `█▎` | MTG 126 · Suno 13 | melancholic, emotional, female singer, guitar |
| powerful | 123 | `█` | MTG 107 · FMA 10 | epic, energetic, metal, harsh |
| catchy | 115 | `▉` | MTG 90 · Suno 23 | indie, pop rock, pop folk, romantic |
| festive | 111 | `▉` | MTG 100 · Studio 10 | happy, celesta, pipe organ, pop |
| sexy | 110 | `▉` | MTG 104 · Suno 6 | fashion, positive, house, playful |
| nostalgic | 106 | `▉` | MTG 92 · Suno 13 | viola, piano, classical, sweet |
| peaceful | 89 | `▊` | MTG 87 | piano, low energy, new age, quiet |
| cheerful | 79 | `▋` | MTG 71 · Suno 8 | happy, playful, children, pop |
| mysterious | 71 | `▋` | MTG 65 · Suno 6 | soundtrack, glockenspiel, orchestral, aching |
| reflective | 69 | `▋` | MTG 67 | solemn, ambient, thoughtful, aching |
| soulful | 67 | `▌` | MTG 51 · Suno 12 · Studio 4 | soul, R&B, rhodes, chill out |
| sophisticated | 60 | `▌` | FMA 44 · Suno 16 | sad, classical, ambient, aching |
| joyful | 55 | `▌` | MTG 52 | happy, christmas, restrained, soundtrack |
| heavy | 50 | `▍` | MTG 42 · Studio 6 | metal, heavymetal, hard, angry |
| heroic | 50 | `▍` | MTG 50 | epic, orchestral, soundtrack, strings |
| chill | 41 | `▍` | FMA 23 · Suno 16 | sitar, electronica, emotional, Synth Pop |
| hypnotic | 40 | `▍` | MTG 26 · Suno 9 · FMA 3 · Studio 2 | dark, club, deep, dance |
| aggressive | 39 | `▍` | MTG 34 · Suno 3 · Studio 2 | driving, angry, harsh, guitar |
| chilled | 34 | `▍` | MTG 34 | chill out, synthesizer, relaxing, atmospheric |
| dreamy | 33 | `▎` | Suno 14 · Studio 10 · FMA 9 | female vocal, 112 BPM, New Wave, melancholic |
| ethereal | 32 | `▎` | MTG 21 · Suno 7 · Studio 4 | ambient, ethno, melancholic, contemplative |
| smooth | 27 | `▎` | Suno 19 · Studio 8 |  |
| rain | 23 | `▎` | MTG 20 · Suno 3 |  |
| funky | 22 | `▎` | FMA 16 · Suno 6 |  |
| intimate | 22 | `▎` | Studio 12 · Suno 10 |  |
| jazzy | 17 | `▎` | Suno 10 · FMA 7 |  |
| anthemic | 15 | `` | Studio 14 · Suno 1 |  |
| melancholy | 15 | `` | Suno 7 · FMA 6 · Studio 2 |  |
| raw | 15 | `` | Studio 6 · FMA 5 · Suno 4 |  |
| danceable | 14 | `` | Studio 8 · Suno 6 |  |
| inspirational | 14 | `` | FMA 13 · Suno 1 |  |
| gritty | 12 | `` | Studio 6 · Suno 6 |  |
| smoky | 12 | `` | Studio 6 · Suno 6 |  |
| laid back | 11 | `` | FMA 10 · Suno 1 |  |
| gentle | 10 | `` | FMA 9 · Suno 1 |  |
| heartfelt | 10 | `` | Suno 8 · Studio 2 |  |
| background music | 9 | `` | FMA 8 · Suno 1 |  |
| intense | 9 | `` | Studio 6 · Suno 3 |  |
| ritual and solemn | 9 | `` | Album 9 |  |
| melancholic but sunny | 8 | `` | Suno 8 |  |
| moody | 8 | `` | Studio 4 · Suno 4 |  |
| saudade | 8 | `` | Suno 6 · Studio 2 |  |
| haunting | 7 | `` | Suno 7 |  |
| introspective | 7 | `` | Studio 6 · Suno 1 |  |
| aggressive bassline | 6 | `` | Studio 6 |  |
| bittersweet final-track energy | 6 | `` | Suno 6 |  |
| dancefloor but emotionally heavy | 6 | `` | Suno 6 |  |
| deep warm swung four-on-floor | 6 | `` | Suno 6 |  |
| heavy guitars | 6 | `` | Studio 6 |  |
| slow melancholic melody | 6 | `` | Studio 6 |  |
| slow zeibekiko | 6 | `` | Studio 6 |  |
| cute | 5 | `` | Suno 5 |  |
| deep sub-bass | 5 | `` | Suno 5 |  |
| passionate | 5 | `` | Suno 3 · Studio 2 |  |
| spooky | 5 | `` | FMA 3 · Suno 2 |  |
| a gentle three-four sway | 4 | `` | Studio 4 |  |
| a nostalgic melody | 4 | `` | Studio 4 |  |
| a slow ecstatic build | 4 | `` | Studio 4 |  |
| a slow heartbeat | 4 | `` | Studio 4 |  |
| a slow melancholy tune | 4 | `` | Studio 4 |  |
| catchy melodies | 4 | `` | Suno 4 |  |
| confident fast flow | 4 | `` | Studio 4 |  |
| dark melodic riffs | 4 | `` | Studio 4 |  |
| deep basses | 4 | `` | Studio 4 |  |
| G major nostalgic futuristic | 4 | `` | Suno 4 |  |
| grand and dramatic | 4 | `` | Studio 4 |  |
| heavy riffs | 4 | `` | Studio 4 |  |
| raw powerful energy | 4 | `` | Studio 4 |  |
| rebellious energy | 4 | `` | Studio 4 |  |
| Scythian earthly epic | 4 | `` | Studio 4 |  |
| dark electro | 3 | `` | Suno 2 · FMA 1 |  |
| deep flow | 3 | `` | Suno 3 |  |
| eerie | 3 | `` | Suno 2 · FMA 1 |  |
| funky basslines | 3 | `` | Studio 2 · Suno 1 |  |
| heart touching emotional song | 3 | `` | Suno 3 |  |
| love song | 3 | `` | Suno 2 · FMA 1 |  |
| a deep booming heartbeat | 2 | `` | Studio 2 |  |
| a deep resonant galloping melody | 2 | `` | Studio 2 |  |
| a haunting bright breath | 2 | `` | Studio 2 |  |

## Use and theme

What the music is for: MTG-Jamendo's themes (film, corporate, advertising…). 32 distinct words; the 20 most met:

| word | tracks | | from | met with |
|---|---:|---|---|---|
| love | 781 | `████████████` | MTG 771 | pop, romantic, acoustic guitar, piano |
| advertising | 648 | `█████████▉` | MTG 613 · FMA 35 | corporate, motivational, easy listening, soundtrack |
| corporate | 559 | `████████▋` | MTG 559 | advertising, motivational, pop, business |
| documentary | 512 | `███████▉` | MTG 512 | soundtrack, emotional, advertising, drama |
| children | 506 | `███████▊` | MTG 441 · FMA 63 | soundtrack, animation, christmas, comedy |
| background | 468 | `███████▎` | MTG 451 | easy listening, piano, corporate, restrained |
| summer | 422 | `██████▌` | MTG 404 | keyboard, deep, percussion, bass |
| adventure | 406 | `██████▎` | MTG 402 | soundtrack, orchestral, action, drama |
| commercial | 387 | `█████▉` | MTG 387 | communication, advertising, pop, easy listening |
| drama | 382 | `█████▉` | MTG 376 | emotional, soundtrack, orchestral, classical |
| motivational | 374 | `█████▊` | MTG 373 | corporate, inspiring, advertising, easy listening |
| action | 366 | `█████▋` | MTG 366 | epic, orchestral, soundtrack, adventure |
| space | 345 | `█████▍` | MTG 321 · FMA 23 | scifi, ambient, new age, Electronic |
| movie | 318 | `████▉` | MTG 316 | soundtrack, cinematic, orchestral, drums |
| horror | 259 | `███▉` | FMA 186 · MTG 72 | halloween, Goth, trailer, cold |
| soundscape | 258 | `███▉` | MTG 254 | ambient, atmospheric, new age, soundtrack |
| party | 200 | `███` | MTG 175 · FMA 22 | dance, ecstatic, club, euphoric |
| game | 193 | `██▉` | MTG 193 | cello, symphonic, orchestral, double bass |
| retro | 190 | `██▉` | MTG 168 · FMA 11 | synthesizer, sampler, drum machine, Electronic |
| nature | 175 | `██▋` | MTG 168 | new age, easy listening, ambient, low energy |

## Sound and space

The recording's space, its texture and its production. 118 distinct words; the 70 most met:

| word | tracks | | from | met with |
|---|---:|---|---|---|
| close-mic | 600 | `████████████` | Speech 600 | Russian spoken word, no music, dry studio, calm clear reading |
| dry studio | 600 | `████████████` | Speech 600 | Russian spoken word, no music, close-mic, calm clear reading |
| no music | 600 | `████████████` | Speech 600 | Russian spoken word, dry studio, close-mic, calm clear reading |
| nothing else playing | 344 | `██████▉` | Studio 335 | no vocals, Natural room, close-miked and in front, A slow |
| close-miked and in front | 293 | `█████▉` | Studio 293 | Natural room, nothing else playing, no vocals, A slow |
| Natural room | 291 | `█████▊` | Studio 291 | close-miked and in front, nothing else playing, no vocals, A slow |
| dusty | 54 | `█` | FMA 51 · Suno 3 | funk, Hip-Hop, commanding, proud |
| close-miked | 12 | `▎` | Studio 12 |  |
| polished | 10 | `▎` | Suno 10 |  |
| Wide | 10 | `▎` | Suno 10 |  |
| analog | 9 | `▎` | FMA 7 · Suno 2 |  |
| huge reverberant space | 9 | `▎` | Album 9 |  |
| reverb | 9 | `▎` | Suno 7 · FMA 2 |  |
| clean | 8 | `▎` | Suno 8 |  |
| spacious | 8 | `▎` | Suno 8 |  |
| warm vintage analog | 8 | `▎` | Suno 8 |  |
| glossy | 7 | `` | Suno 7 |  |
| polished production | 7 | `` | Studio 6 · Suno 1 |  |
| heavy distorted guitars | 6 | `` | Studio 6 |  |
| side-chain breathing | 6 | `` | Suno 6 |  |
| side-chain breathing softly | 6 | `` | Suno 6 |  |
| vinyl warmth | 6 | `` | Suno 6 |  |
| warm reverb | 6 | `` | Studio 6 |  |
| electric | 5 | `` | Suno 5 |  |
| reverb-heavy | 5 | `` | Album 5 |  |
| concert hall | 4 | `` | Studio 4 |  |
| intimate analog recording | 4 | `` | Suno 4 |  |
| layered | 4 | `` | Studio 4 |  |
| pumping side-chain | 4 | `` | Suno 4 |  |
| sparse production | 4 | `` | Studio 4 |  |
| unhurried and spacious | 4 | `` | Studio 4 |  |
| vinyl crackle | 4 | `` | Studio 4 |  |
| vinyl warmth tape saturation | 4 | `` | Suno 4 |  |
| Warm tape hiss | 4 | `` | Suno 4 |  |
| warm tape saturation | 4 | `` | Suno 4 |  |
| wooden textures and string vibrations | 4 | `` | Studio 4 |  |
| 1960s analog recording mono | 3 | `` | Suno 3 |  |
| Crisp | 3 | `` | Suno 3 |  |
| Delay | 3 | `` | Suno 3 |  |
| distorted | 3 | `` | Studio 2 · Suno 1 |  |
| high quality | 3 | `` | Suno 3 |  |
| Mix is warm | 3 | `` | Suno 3 |  |
| reverse swells | 3 | `` | Suno 3 |  |
| vinyl crackle pronounced | 3 | `` | Suno 3 |  |
| warm sub-bass | 3 | `` | Suno 3 |  |
| 2000s production | 2 | `` | Studio 2 |  |
| a dry woody tone | 2 | `` | Studio 2 |  |
| analog warmth throughout | 2 | `` | Suno 2 |  |
| and evolving FX | 2 | `` | Suno 2 |  |
| and immersive mix | 2 | `` | Suno 2 |  |
| and layered field recordings | 2 | `` | Suno 2 |  |
| and polished | 2 | `` | Suno 2 |  |
| and short delay throws | 2 | `` | Suno 2 |  |
| and warm room ambience | 2 | `` | Suno 2 |  |
| balanced tone | 2 | `` | Studio 2 |  |
| bass-heavy | 2 | `` | Studio 2 |  |
| bedroom production | 2 | `` | Studio 2 |  |
| Big hall reverb | 2 | `` | Studio 2 |  |
| cathedral reverb | 2 | `` | Studio 2 |  |
| cavernous reverb | 2 | `` | Studio 2 |  |
| church hall reverb | 2 | `` | Studio 2 |  |
| clean lyrical storytelling bars | 2 | `` | Studio 2 |  |
| close room mics | 2 | `` | Suno 2 |  |
| cowbell and reverb claps | 2 | `` | Suno 2 |  |
| crisp rolls and rudiments | 2 | `` | Studio 2 |  |
| distant metallic textures | 2 | `` | Studio 2 |  |
| distorted guitars | 2 | `` | Studio 2 |  |
| dusty samples | 2 | `` | Studio 2 |  |
| dusty tape warmth | 2 | `` | Suno 2 |  |
| dusty-deep mix | 2 | `` | Suno 2 |  |

## Form and pace

Tempo words, pace and form. 20 distinct words; the 20 most met:

| word | tracks | | from | met with |
|---|---:|---|---|---|
| melodic | 1,043 | `████████████` | MTG 994 | 90s, piano, electric guitar, electric piano |
| slow | 422 | `████▊` | MTG 340 · Studio 38 · Suno 38 | synthesizer, Experimental, dark, Russian folk ballad |
| fast | 95 | `█` | MTG 82 · Suno 7 · Studio 6 | drum and bass, energetic, harsh, drums |
| driving | 69 | `▊` | MTG 69 | energetic, dynamic, alternative, Electronic |
| solo | 24 | `▎` | FMA 15 · Suno 5 · Studio 4 |  |
| slow tempo | 17 | `▎` | Suno 17 |  |
| shuffle | 6 | `` | Studio 6 |  |
| a variable heartbeat tempo | 4 | `` | Studio 4 |  |
| chorus | 4 | `` | Suno 3 · FMA 1 |  |
| crescendo | 4 | `` | Studio 2 · Suno 2 |  |
| intro | 3 | `` | Suno 3 |  |
| medium tempo | 3 | `` | Suno 3 |  |
| melody | 3 | `` | Suno 3 |  |
| up tempo | 3 | `` | Suno 3 |  |
| uptempo | 3 | `` | Suno 2 · FMA 1 |  |
| call and response | 2 | `` | Studio 2 |  |
| fast tempo | 2 | `` | Suno 2 |  |
| loop | 2 | `` | Suno 2 |  |
| rubato | 2 | `` | Studio 2 |  |
| syncopated | 2 | `` | Suno 2 |  |

## Key and harmony

The key as MTG-Jamendo measured it, and the modes and harmony the free style lines name. 35 distinct words; the 35 most met:

| word | tracks | | from | met with |
|---|---:|---|---|---|
| C major | 2,079 | `████████████` | MTG 2079 | piano, low energy, classical, easy listening |
| A minor | 1,335 | `███████▋` | MTG 1335 | 120 BPM, bass, 80 BPM, reggae |
| G major | 1,167 | `██████▊` | MTG 1167 | pop, low energy, acoustic guitar, pop folk |
| C minor | 956 | `█████▌` | MTG 956 | 120 BPM, bass, keyboard, drums |
| D major | 915 | `█████▎` | MTG 913 | pop, bass, electric guitar, pop folk |
| E minor | 859 | `████▉` | MTG 859 | bass, drums, 120 BPM, guitar |
| D minor | 838 | `████▊` | MTG 838 | 90 BPM, bass, 120 BPM, drums |
| F major | 609 | `███▌` | MTG 609 | piano, low energy, classical, instrumental pop |
| A major | 543 | `███` | MTG 543 | pop, acoustic guitar, low energy, pop folk |
| G minor | 511 | `██▉` | MTG 511 | bass, piano, 120 BPM, drums |
| E major | 503 | `██▉` | MTG 502 | pop, drums, electric guitar, acoustic guitar |
| B minor | 373 | `██▎` | MTG 373 | bass, drums, electric guitar, reggae |
| F minor | 356 | `██` | MTG 356 | bass, piano, lounge, 90 BPM |
| Bb major | 314 | `█▊` | MTG 314 | piano, low energy, classical, jazz |
| Eb major | 314 | `█▊` | MTG 314 | piano, low energy, pop, classical |
| Ab major | 266 | `█▌` | MTG 266 | piano, pop, low energy, easy listening |
| F# minor | 235 | `█▍` | MTG 235 | bass, drums, reggae, hip hop |
| Db major | 218 | `█▎` | MTG 218 | piano, classical, low energy, easy listening |
| C# minor | 215 | `█▎` | MTG 215 | hip hop, 130 BPM, 90 BPM, classical |
| F# major | 207 | `█▎` | MTG 207 | indie, low energy, pop, easy listening |
| G# minor | 197 | `█` | MTG 197 | euphoric, high energy, bass, ecstatic |
| B major | 191 | `█` | MTG 191 | pop folk, low energy, acoustic guitar, pop |
| D# minor | 187 | `█` | MTG 187 | hip hop, reggae, euphoric, 85 BPM |
| Bb minor | 173 | `▉` | MTG 173 | reggae, hip hop, playful, bass |
| jazzy chords (maj7 | 8 | `` | Suno 8 |  |
| modal minor | 5 | `` | Album 5 |  |
| E-flat major | 4 | `` | Suno 4 |  |
| Modal jazz | 3 | `` | Studio 2 · Suno 1 |  |
| Arabic maqam music | 2 | `` | Studio 2 |  |
| B-flat major | 2 | `` | Suno 2 |  |
| minor | 2 | `` | Suno 1 · FMA 1 |  |
| modal jazz fusion | 2 | `` | Suno 2 |  |
| pentatonic melody | 2 | `` | Studio 2 |  |
| Phrygian dominant cadence | 2 | `` | Studio 2 |  |
| sophisticated chromatic harmony | 2 | `` | Suno 2 |  |

## Tempo (BPM)

Beats per minute, always last in the line. 138 distinct words; the 50 most met:

| BPM | tracks | |
|---|---:|---|
| 40–49 | 12 | `` |
| 50–59 | 69 | `▌` |
| 60–69 | 436 | `██▊` |
| 70–79 | 784 | `█████` |
| 80–89 | 1,779 | `███████████▍` |
| 90–99 | 2,029 | `█████████████` |
| 100–109 | 1,827 | `███████████▊` |
| 110–119 | 1,790 | `███████████▌` |
| 120–129 | 2,495 | `████████████████` |
| 130–139 | 1,283 | `████████▎` |
| 140–149 | 674 | `████▍` |
| 150–159 | 309 | `█▉` |
| 160–169 | 265 | `█▋` |
| 170–179 | 106 | `▋` |
| 180–189 | 60 | `▍` |
| 190–199 | 10 | `` |
| 200–209 | 18 | `` |

The values most written: 120 BPM (835), 100 BPM (735), 90 BPM (732), 119 BPM (602), 80 BPM (567), 130 BPM (447), 110 BPM (381), 124 BPM (358), 140 BPM (342), 128 BPM (332), 105 BPM (261), 94 BPM (240), 95 BPM (213), 121 BPM (190), 114 BPM (188), 126 BPM (178).

## Language

The language a song is sung in, first in the line. 32 distinct words; the 32 most met:

| word | tracks | | from | met with |
|---|---:|---|---|---|
| English | 8,387 | `████████████` | FMA 6392 · Suno 1689 | Hip-Hop, soothing, proud, commanding |
| Russian | 6,069 | `████████▋` | MTG 5058 · Other 839 | with music, Bible reading, spoken word, male voice |
| Hebrew | 1,323 | `█▉` | Other 1248 | with music, Bible reading, spoken word, male voice |
| Greek | 771 | `█` | Other 719 | Traditional, percussion, Laouto, violin |
| latin | 756 | `█` | MTG 633 · FMA 110 | playful, Country, mexico, bossa nova |
| French | 749 | `█` | FMA 555 · Suno 188 | commanding, soothing, Lo-Fi, bright |
| Spanish | 650 | `▉` | FMA 335 · Suno 305 | tender, bright, Latin America, hopeful |
| Ukrainian | 586 | `▊` | Other 458 · MTG 111 | rock, anguished, hopeful, yearning |
| Portuguese | 424 | `▋` | Suno 216 · FMA 190 | Alternative Hip-Hop, commanding, tender, Brazilian |
| Italian | 203 | `▍` | Suno 123 · FMA 74 | tender, romantic, commanding, grateful |
| German | 126 | `▎` | Suno 67 · FMA 59 | soothing, contemplative, romantic, Chip Music |
| Chinese | 94 | `` | Suno 82 · Studio 12 | soothing, soft, warm, romantic |
| Japanese | 90 | `` | Suno 74 · Studio 12 | bright, female vocal, sensual, hopeful |
| Korean | 63 | `` | Suno 51 · Studio 8 · FMA 4 | bright, romantic, K-pop, sensual |
| irish | 60 | `` | FMA 33 · MTG 27 | celtic, Folk, Europe, International |
| arabic | 58 | `` | MTG 42 · Other 7 · FMA 5 · Suno 4 | ethnicrock, ney, Oud, middleeastern |
| Turkish | 57 | `` | FMA 51 · Other 4 | International, Middle East, playful, euphoric |
| Russian lyrics | 40 | `` | Studio 40 | commanding, triumphant, proud, harsh |
| Brazilian Portuguese | 20 | `` | Studio 12 · Suno 8 |  |
| romanian | 18 | `` | FMA 12 · Other 6 |  |
| Dutch | 16 | `` | FMA 16 |  |
| bulgarian | 14 | `` | FMA 13 · Other 1 |  |
| georgian | 12 | `` | FMA 11 · Suno 1 |  |
| Mandarin | 12 | `` | Studio 12 |  |
| norwegian | 9 | `` | FMA 9 |  |
| Finnish | 6 | `` | FMA 6 |  |
| croatian | 5 | `` | FMA 5 |  |
| Polish | 5 | `` | FMA 5 |  |
| Hungarian | 4 | `` | FMA 3 · Suno 1 |  |
| Swedish | 4 | `` | FMA 3 · Suno 1 |  |
| Persian | 3 | `` | Suno 3 |  |
| Czech | 2 | `` | FMA 2 |  |

## Leading words of our own loops

The duduk and shofar loops of the guard open their lines with the instrument's name. 2 distinct words; the 2 most met:

| word | tracks | | from | met with |
|---|---:|---|---|---|
| duduk | 13 | `████████████` | Studio 6 · Album 5 · Suno 2 |  |
| shofar | 12 | `███████████` | Album 9 · Other 3 |  |

## Free descriptions

Words from the free style lines that fit no list above. 794 distinct words; the 120 most met:

| word | tracks | | from | met with |
|---|---:|---|---|---|
| with music | 1,154 | `████████████` | Other 1154 | Bible reading, spoken word, male voice, restrained |
| Traditional | 884 | `█████████▎` | Other 805 · MTG 45 | Greek, Laouto, percussion, violin |
| electro | 379 | `███▉` | FMA 285 · Suno 94 | breakcore, Unclassifiable, compilation, Electronic |
| messianic | 376 | `███▉` | Other 376 | worship, Hebrew, melancholic, yearning |
| 8bit | 161 | `█▋` | MTG 80 · FMA 79 | Chiptune, Electronic, Chip Music, ecstatic |
| halloween | 160 | `█▋` | FMA 79 · MTG 78 | horror, animation, Goth, soundtrack |
| animation | 152 | `█▋` | MTG 152 | soundtrack, comedy, children, halloween |
| score | 144 | `█▌` | MTG 125 · FMA 19 | cinematic, emotional, classical, ambient |
| acid | 137 | `█▍` | FMA 75 · MTG 62 | dub, techno, IDM, acidhouse |
| scifi | 137 | `█▍` | MTG 137 | space, new age, relaxing, Electronic |
| abstract | 133 | `█▍` | FMA 85 · MTG 43 | IDM, Experimental, trap, Avant-Garde |
| entertainment | 125 | `█▍` | MTG 125 | communication, pop, commercial, acoustic guitar |
| communication | 113 | `█▎` | MTG 113 | commercial, pop, entertainment, fashion |
| quiet | 110 | `█▎` | MTG 110 | new age, low energy, piano, solemn |
| soundscapes | 109 | `█` | FMA 101 · MTG 8 | Experimental, Ambient Electronic, Electroacoustic, aching |
| mexico | 105 | `█` | MTG 100 | Country, latin, Folk, grateful |
| brazil | 101 | `█` | MTG 59 · FMA 42 | bossa nova, International, Brazilian, Portuguese |
| avantgarde | 98 | `█` | MTG 85 · FMA 13 | ambient, electronic production, alternative, metal |
| breakcore | 97 | `█` | FMA 86 · MTG 10 | Unclassifiable, electro, compilation, Experimental |
| business | 97 | `█` | MTG 97 | corporate, advertising, pop, commercial |
| dynamic | 97 | `█` | MTG 83 · FMA 8 · Suno 6 | driving, energetic, catchy, synthpop |
| folkrock | 97 | `█` | MTG 97 | pop folk, Folk, acoustic guitar, celtic |
| electrohouse | 96 | `▉` | MTG 95 | electronic production, Electronic, dance, minimal |
| chansonfrancaise | 95 | `▉` | MTG 95 | chanson, tender, soothing, accordion |
| sweet | 95 | `▉` | MTG 92 | glockenspiel, synthesizer, viola, drum machine |
| Out | 90 | `▉` | FMA 90 | jazz, Improv, Free-Jazz, restrained |
| optimistic | 87 | `▉` | MTG 87 | happy, pop folk, ukulele, pop |
| videogame | 86 | `▉` | MTG 75 · FMA 8 | retro, harpsichord, celesta, soundtrack |
| thoughtful | 83 | `▉` | MTG 83 | ambient, vibraphone, piano, low energy |
| psytrance | 81 | `▊` | MTG 62 · FMA 16 | psychedelic, ecstatic, trance, menacing |
| dancepop | 80 | `▊` | MTG 78 | dance, happy, summer, synthesizer |
| breaks | 78 | `▊` | FMA 77 | IDM, electro, menacing, Glitch |
| light | 78 | `▊` | MTG 77 | fun, happy, drum machine, synthesizer |
| russia | 77 | `▊` | FMA 72 · MTG 5 | Punk, Europe, flute, Post-Punk |
| japan | 74 | `▊` | FMA 44 · MTG 30 | ambient, Folk, mellow, zen |
| sentimental | 74 | `▊` | MTG 73 | low energy, piano, classical, solemn |
| instrumentalhiphop | 73 | `▊` | MTG 73 | hip hop, acoustic bass guitar, acoustic guitar, brass |
| ebm | 72 | `▊` | MTG 40 · FMA 31 | Industrial, menacing, angry, dance music |
| dancefloor | 71 | `▊` | MTG 71 | dance, dancehall, drum machine, synthesizer |
| progressiverock | 71 | `▊` | MTG 71 | guitar, drums, rock, hard rock |
| acidhouse | 69 | `▊` | MTG 60 · FMA 9 | acid, menacing, Electronic, deep house |
| chilloutlounge | 69 | `▊` | MTG 69 | chill out, ambient, ambiental, restrained |
| oldschool | 68 | `▋` | MTG 67 | hip hop, beat, brass, electronic production |
| gangstarap | 67 | `▋` | MTG 67 | hip hop, rap, beat, proud |
| hammond | 67 | `▋` | MTG 67 | drums, bass, blues, electric guitar |
| minimaltechno | 67 | `▋` | MTG 67 | techno, deep, technoindustrial, ominous |
| night | 67 | `▋` | MTG 67 | deep, trip hop, blues, dream |
| north | 67 | `▋` | MTG 67 | dancehall, reggae, france, proud |
| suspense | 67 | `▋` | MTG 67 | soundtrack, action, orchestral, tension |
| electronicorgan | 64 | `▋` | MTG 64 | electric piano, drum machine, indiepop, indietronica |
| asian | 59 | `▋` | MTG 58 | ethno, world, zen, low energy |
| france | 59 | `▋` | MTG 32 · FMA 26 | dancehall, north, reggae, Big Band/Swing |
| conga | 58 | `▋` | MTG 56 | trombone, disco, pipe organ, bass |
| electroambient | 58 | `▋` | MTG 58 | ambient, synthesizer, Electronic, chill out |
| zen | 58 | `▋` | MTG 49 · FMA 8 | hard rock, metal, asian, chill out |
| indietronica | 57 | `▋` | MTG 30 · FMA 24 · Suno 3 | IDM, indiepop, Minimal Electronic, dance |
| cvp509 | 56 | `▋` | MTG 56 | oboe, drums, hip hop, bass |
| beach | 55 | `▋` | MTG 42 · FMA 13 | Surf, summer, club, happy |
| bouncy | 55 | `▋` | MTG 44 · FMA 10 | electropop, pop, catchy, playful |
| urban | 55 | `▋` | MTG 53 | hip hop, beat, R&B, darkwave |
| cymbal | 54 | `▌` | MTG 54 | cello, double bass, cinematic, soundtrack |
| dancing | 54 | `▌` | MTG 52 | dance, dancefloor, festive, electropop |
| christian | 53 | `▌` | MTG 53 | religious, christmas, gospel, spiritual |
| life | 53 | `▌` | MTG 53 | rap, alternative rock, love, hip hop |
| tension | 52 | `▌` | MTG 51 | soundtrack, suspense, orchestral, dark ambient |
| triphop | 50 | `▌` | FMA 49 | darkwave, Chill-out, alternative, Electronic |
| electrojazz | 49 | `▌` | MTG 46 · FMA 3 | cool, improvisation, drum and bass, blues |
| hardstyle | 49 | `▌` | MTG 49 | techno, Hardcore, angry, ecstatic |
| eclectic | 48 | `▌` | MTG 24 · FMA 17 · Studio 6 | Electroacoustic, Electronic, Psych-Folk, ambient |
| indiepop | 48 | `▌` | MTG 48 | electronicorgan, indietronica, indie, lofi |
| powerpop | 48 | `▌` | MTG 48 | pop rock, energetic, pop, rock |
| sea | 48 | `▌` | MTG 48 | ocean, chill out, lounge, summer |
| exotica | 47 | `▌` | FMA 40 · Suno 7 | lounge, International, Traditional, playful |
| strange | 47 | `▌` | MTG 47 | orchestral, game, soundtrack, classical |
| crazy | 46 | `▌` | MTG 45 | fun, electropop, energetic, dance |
| tropical | 46 | `▌` | MTG 30 · FMA 11 · Suno 5 | mexico, Country, world, Folk |
| electrorock | 45 | `▌` | MTG 45 | electric guitar, electropop, pop rock, synthesizer |
| future | 45 | `▌` | MTG 40 · FMA 5 | techno, Electronic, synthesizer, party |
| ocean | 45 | `▌` | MTG 40 · Suno 4 | pad, chill out, meditative, choir |
| ragga | 45 | `▌` | MTG 41 · FMA 4 | reggae, proud, dancehall, world |
| rave | 44 | `▌` | MTG 32 · FMA 9 · Suno 3 | dance, dream, Jungle, electronica |
| technoindustrial | 43 | `▌` | MTG 43 | ebm, techno, menacing, minimaltechno |
| battle | 42 | `▌` | MTG 41 | epic, soundtrack, orchestral, action |
| rhythmic | 42 | `▌` | FMA 34 · Suno 8 | soundtrack, Electronic, playful, dance |
| trippy | 42 | `▌` | MTG 35 · FMA 6 | trip hop, lounge, Electronic, dark |
| jingle | 41 | `▍` | MTG 40 | piano, guitar, cinematic, electronic production |
| modern | 41 | `▍` | FMA 31 · Suno 8 | Avant-Garde, jazz, contemporary, classical |
| berlin | 39 | `▍` | MTG 36 · FMA 3 | rap, hip hop, house, bitter |
| drive | 39 | `▍` | MTG 39 | energetic, epic, motivational, harsh |
| religious | 39 | `▍` | MTG 39 | christian, christmas, classical, choir |
| remix | 38 | `▍` | FMA 26 · Suno 12 | techno, ambient, dance, Electronic |
| souljazz | 38 | `▍` | MTG 38 | jazz, soul, piano, playful |
| water | 38 | `▍` | MTG 23 · FMA 12 · Suno 3 | ambient, Drum & Bass, new age, aching |
| winter | 38 | `▍` | MTG 33 · Suno 3 · FMA 2 | solemn, christmas, ambient, soundtrack |
| thriller | 37 | `▍` | MTG 26 · FMA 7 · Suno 4 | soundtrack, cello, suspense, action |
| trancemelodique | 37 | `▍` | MTG 37 | trance, ecstatic, euphoric, menacing |
| magic | 36 | `▍` | MTG 35 | fantasy, soundtrack, orchestral, animation |
| sampling | 36 | `▍` | FMA 35 | electronica, Breakbeat, Electronic, Downtempo |
| war | 35 | `▍` | MTG 35 | drama, soundtrack, emotional, strings |
| simple | 34 | `▍` | FMA 29 · Suno 5 | solo piano, aching, solemn, soundtrack |
| diy | 33 | `▍` | FMA 32 | Punk, angry, Hardcore, menacing |
| middleeastern | 33 | `▍` | MTG 33 | arabic, world, Oud, ney |
| computers | 32 | `▍` | MTG 32 | drum and bass, euphoric, Electronic, ecstatic |
| southernrock | 32 | `▍` | MTG 32 | rock and roll, blues, expressive, guitar |
| weird | 32 | `▍` | MTG 22 · FMA 10 | alternative, indie, IDM, Indie-Rock |
| britpop | 31 | `▍` | MTG 21 · Studio 6 · FMA 3 | indie, male vocal, 118 BPM, alternative |
| cosmic | 31 | `▍` | MTG 31 | scifi, meditative, new age, ambient |
| social | 31 | `▍` | MTG 31 | rap, chanson, triumphant, tender |
| vocoder | 31 | `▍` | MTG 24 · FMA 7 | Italian, Electronic, dance, Downtempo |
| gipsy | 30 | `▍` | MTG 29 | trombone, accordion, trumpet, saxophone |
| humor | 30 | `▍` | MTG 30 | chansonfrancaise, comedy, bass, alternative |
| slideguitar | 30 | `▍` | MTG 30 | electric guitar, grunge, drums, pop folk |
| artrock | 29 | `▍` | MTG 29 |  |
| scary | 29 | `▍` | MTG 27 · Suno 2 |  |
| science | 29 | `▍` | MTG 16 · FMA 13 |  |
| africa | 28 | `▍` | MTG 18 · FMA 10 |  |
| bassguitar | 28 | `▍` | MTG 27 |  |
| laidback | 28 | `▍` | MTG 28 |  |
| news | 28 | `▍` | MTG 28 |  |
| panflute | 28 | `▍` | MTG 28 |  |

## The scores

106,532 tracks carry their own score, transcribed by SheetSage2 into ABC notation: the plan YuE2's music half writes first in Full mode and then sings. Every score has two voices, **Vocal** (the sung melody, rests where nobody sings) and **Ins** (the lead instrument's line), with chord symbols over the bars; 37,961 of them have a sung melody. These are the keys of that plan.

| field | what it holds |
|---|---|
| `X:` `T:` | the tune's number and an empty title |
| `M:` | the meter; 67,857 scores change it inside (a bar of 1/4 or 2/4 at a phrase's end is common) |
| `L:` | the unit note: 1/16 in 80,260, 1/32 in 26,272 |
| `Q:` | the tempo as quarter notes a minute |
| `V:` | `Vocal` and `Ins` |
| `K:` | the key; 5,435 scores change it |
| `% intro` … | the section a passage belongs to |
| `"Am"` | a chord over the bar |

**Sections**, as the scores name them:

| section | scores | |
|---|---:|---|
| `% intro` | 100,115 | `████████████████` |
| `% interlude` | 66,289 | `██████████▋` |
| `% verse` | 64,103 | `██████████▎` |
| `% chorus` | 48,722 | `███████▊` |
| `% outro` | 43,755 | `██████▉` |
| `% silence` | 6,461 | `█` |
| `% bridge` | 2,735 | `▌` |
| `% pre-chorus` | 1,401 | `▎` |

**Keys** (`K:`, the first of each score):

| key | scores | | key | scores | |
|---|---:|---|---|---:|---|
| Am | 13,453 | `██████████` | E | 3,357 | `██▌` |
| Em | 9,386 | `██████▉` | F | 3,207 | `██▍` |
| C | 9,332 | `██████▉` | F#m | 2,991 | `██▎` |
| Cm | 9,236 | `██████▉` | C#m | 2,835 | `██` |
| Dm | 8,093 | `██████` | A#m | 2,408 | `█▊` |
| Gm | 6,081 | `████▌` | G#m | 2,144 | `█▋` |
| G | 5,183 | `███▊` | Eb | 1,854 | `█▍` |
| D | 5,026 | `███▊` | B | 1,647 | `█▎` |
| Bm | 4,595 | `███▍` | Bb | 1,561 | `█▎` |
| Fm | 3,622 | `██▋` | C# | 1,230 | `▉` |
| D#m | 3,530 | `██▋` | F# | 1,204 | `▉` |
| A | 3,478 | `██▋` | Ab | 1,079 | `▊` |

**Meters** (`M:`, at the start): 4/4 85,531, 2/4 13,612, 3/4 4,359, 6/8 2,670, 5/8 122, 3/8 99, 1/4 79, 2/8 35, 9/8 15, 7/8 7, 4/8 2.

**Tempo** (`Q:1/4=`):

| quarter notes a minute | scores | |
|---|---:|---|
| 50–59 | 1,380 | `█▎` |
| 60–69 | 7,602 | `██████▍` |
| 70–79 | 7,074 | `█████▉` |
| 80–89 | 11,281 | `█████████▌` |
| 90–99 | 17,635 | `██████████████▉` |
| 100–109 | 13,794 | `███████████▋` |
| 110–119 | 6,739 | `█████▋` |
| 120–129 | 18,965 | `████████████████` |
| 130–139 | 6,120 | `█████▎` |
| 140–149 | 7,498 | `██████▍` |
| 150–159 | 2,177 | `█▊` |
| 160–169 | 1,093 | `▉` |
| 170–179 | 1,934 | `█▋` |
| 180–189 | 2,482 | `██` |
| 190–199 | 352 | `▍` |
| 200–209 | 164 | `` |
| 210–219 | 96 | `` |
| 220–229 | 76 | `` |
| 230–239 | 38 | `` |
| 240–249 | 21 | `` |

**Chords**: 13,173,654 chord symbols, 5.4 % of them over another bass (`"D/F#"`). The qualities, by the scores they appear in:

| written | chord | scores | |
|---|---|---:|---|
| `Cm` | minor | 80,316 | `████████████████` |
| `C` | major | 79,568 | `███████████████▊` |
| `Cm7` | minor 7th | 51,377 | `██████████▎` |
| `Cmaj7` | major 7th | 47,467 | `█████████▌` |
| `C6` | 6th | 33,541 | `██████▋` |
| `C7` | dominant 7th | 28,598 | `█████▋` |
| `Csus4` | sus4 | 13,808 | `██▊` |
| `C7sus4` | 7sus4 | 12,484 | `██▌` |
| `Csus2` | sus2 | 9,837 | `█▉` |
| `Cm6` | minor 6th | 7,561 | `█▌` |
| `Cm7b5` | half-diminished | 7,137 | `█▍` |
| `Cdim7` | diminished 7th | 4,636 | `▉` |
| `Caug` | augmented | 4,313 | `▉` |
| `Cdim` | diminished | 3,713 | `▊` |
| `Cm(maj7)` | minor-major 7th | 2,751 | `▌` |

The roots run through all twelve tones, sharps written as sharps (`C#`, `D#`, `F#`, `G#`, `A#`) and flats where the key has them.

## Writing a style for YuE2-RS-TW

- **Keep its order**: language or Instrumental, genre, instruments, mood and emotion words, key, BPM. The model read 109 thousand lines in that order.
- **Use its words**: `electric guitar`, not `shredding axe`; `female voice`, as written above. A word met in hundreds of tracks lands; one met twice is a hint.
- **Emotion words are relative**: `melancholic` means sadder than most of the set, `ecstatic` more ecstatic. Two to four of them, as the data had, read better than eight.
- **Key and BPM are measured values**: `A minor, 92 BPM` is how MTG-Jamendo wrote it, and the model learned to keep them.
- **Speech is in it too**: `spoken word, audiobook narration, calm clear reading, close-mic, dry studio, no music` and `spoken word, Bible reading, male voice, with music` were whole lines in the data.
- **Full mode plans first**: the score it writes uses the sections above (`intro`, `verse`, `chorus`, `bridge`, `pre-chorus`, `interlude`, `outro`), so a song's tags in the lyrics follow the same names.

---

Made from the Tsunami Wave's frozen set by Ruach Studio. The data's own credits and licences are on the [model card](https://huggingface.co/goldhub/YuE2-RS-Finetunes); this reference is CC BY-NC-SA 4.0 like the weights.
