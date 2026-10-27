# YuE2-RS-FW · the First Wave's vocabulary

Every word in the style lines of the **32,633 tracks** that taught [YuE2-RS-FW](https://huggingface.co/goldhub/YuE2-RS-Finetunes), Ruach Studio's own fine-tune of m-a-p's YuE2-3B, counted and sorted by what it says; and the vocabulary of the **31,801 scores** its music half learned to plan from. Few fine-tunes publish what their model was told; here it is, whole.

A word the model met hundreds of times is a word it understands. Write your style in these words, in this order, and the model hears what you mean; a word it never met is a guess. The counts are tracks, each counted once.

**Search it** on [Ruach Studio's page](https://ruachstudio.igr.bible/#vocabulary) or in the studio (F1 → The First Wave's vocabulary); **take it whole** as [fw-vocabulary.json](fw-vocabulary/fw-vocabulary.json) (every word met in two tracks or more, with its sources and the words it came with).

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
17. [Writing a style for YuE2-RS-FW](#writing-a-style-for-yue2-rs-fw)

## How a style line was written

Each track's line follows YuE2's own order: **language or Instrumental → genre → instruments → mood → emotion words → key → BPM**. Where a set wrote its own lines (the Suno-made sets, GTSinger, the studio's own takes), its words come first and the emotion words follow. Lyrics, where a track sings, come after the line under `[Lyrics]`.

| from | a line as the model read it |
|---|---|
| MTG-Jamendo | `Instrumental, dance, electronic, house, euphoric, high energy, ecstatic, G minor, 130 BPM` |
| FMA | `Instrumental, Pop, Folk, Singer-Songwriter, low energy, fragile, melancholic` |
| Suno-made | `German, medieval, zither, female voice, hopeful, bright, tender, triumphant` |
| GTSinger | `english, pop, female alto vocal, vibrato, moderate pace, happy, a cappella, dry studio vocal, no instruments, …` |
| Studio takes | `Instrumental, solo cello. A slow, meditative piece played by a single cello, close-miked and in front, …` |
| Speech | `Russian spoken word, audiobook narration, male voice, calm clear reading, close-mic, dry studio, no music, …` |

## The data at a glance

32,633 tracks, about 1,800 hours; 8,849 sing words. 10,230 distinct words in the style lines; 4,695 of them met in two tracks or more are listed in the JSON.

| source | tracks |
|---|---:|
| MTG-Jamendo | 13,564 |
| FMA | 11,000 |
| Suno-made | 5,789 |
| Studio takes | 962 |
| GTSinger | 662 |
| Speech | 600 |
| Album & loops | 56 |

| what the words say | distinct words | the most met |
|---|---:|---|
| Instrumental | 1 | Instrumental |
| Genres and styles | 1,414 | Electronic, pop, soundtrack, Folk, classical, rock |
| Instruments | 890 | piano, bass, drums, guitar, electric guitar, synthesizer |
| Voice | 365 | dry studio vocal, audiobook narration, calm clear reading, Russian spoken word, no vocals, female alto vocal |
| Emotion words | 40 | playful, numb, low energy, menacing, restrained, harsh |
| Mood | 289 | energetic, deep, dream, meditative, upbeat, dramatic |
| Use and theme | 15 | corporate, drama, documentary, motivational, action, commercial |
| Sound and space | 306 | no instruments, no music, close-mic, dry studio, nothing else playing, close-miked and in front |
| Form and pace | 28 | fast pace, slow pace, slow, moderate pace, fast, slow tempo |
| Key and harmony | 59 | C major, G major, C minor, D major, E minor, D minor |
| Tempo (BPM) | 144 | 120 BPM, 90 BPM, 100 BPM, 119 BPM, 80 BPM, 130 BPM |
| Language | 28 | English, Spanish, Portuguese, French, latin, russian |
| Leading words of our own loops | 2 | duduk, shofar |
| Free descriptions | 1,114 | glissando, Close, short 2 minute piece, syncopated claps, neo-soul, solo and in front |

## Emotion words

These were not written by anyone: LAION's Empathic Insight heads (an EmoWhisper encoder with 55 heads) listened to three 30-second windows of every track and scored it on each dimension. A dimension's score was measured against the whole set, so a word means **more than most of this set**, not an absolute: a track takes the words of its dimensions above one standard deviation, the strongest first, at most four. Two-sided dimensions give a word at each end. The voice's own qualities (commanding, yielding, detached, vulnerable) were given only to tracks with a voice. Read from the whole mix, they follow the music's character as much as a singer's.

| word | Empathic Insight dimension | end | tracks | |
|---|---|---|---:|---|
| **playful** | Amusement |  | 4,669 | `████████████████` |
| **numb** | Emotional Numbness |  | 4,389 | `███████████████` |
| **low energy** | Arousal | low | 3,964 | `█████████████▋` |
| **menacing** | Malevolence / Malice |  | 3,756 | `████████████▉` |
| **restrained** | Monotone vs. Expressive | low | 3,562 | `████████████▎` |
| **harsh** | Soft vs. Harsh | low | 3,339 | `███████████▌` |
| **bright** | Valence | high | 3,281 | `███████████▎` |
| **ecstatic** | Pleasure / Ecstasy |  | 3,234 | `███████████` |
| **cold** | Warm vs. Cold | low | 3,123 | `██████████▋` |
| **aching** | Pain |  | 2,916 | `█████████▉` |
| **anguished** | Distress |  | 2,866 | `█████████▊` |
| **angry** | Anger |  | 2,742 | `█████████▍` |
| **bitter** | Bitterness |  | 2,736 | `█████████▍` |
| **grateful** | Thankfulness / Gratitude |  | 2,708 | `█████████▎` |
| **soothing** | Relief |  | 2,701 | `█████████▎` |
| **euphoric** | Elation |  | 2,656 | `█████████` |
| **romantic** | Infatuation |  | 2,631 | `█████████` |
| **fragile** | Helplessness |  | 2,604 | `████████▉` |
| **solemn** | Serious vs. Humorous | low | 2,543 | `████████▊` |
| **triumphant** | Triumph |  | 2,307 | `███████▉` |
| **hopeful** | Hope / Enthusiasm / Optimism |  | 2,163 | `███████▍` |
| **sensual** | Sexual Lust |  | 2,154 | `███████▍` |
| **melancholic** | Sadness |  | 2,104 | `███████▎` |
| **commanding** | Submissive vs. Dominant | high · voice only | 1,840 | `██████▍` |
| **warm** | Warm vs. Cold | high | 1,755 | `██████` |
| **expressive** | Monotone vs. Expressive | high | 1,750 | `█████▉` |
| **humorous** | Serious vs. Humorous | high | 1,701 | `█████▊` |
| **ominous** | Fear |  | 1,655 | `█████▋` |
| **awe-struck** | Awe |  | 1,588 | `█████▌` |
| **proud** | Pride |  | 1,542 | `█████▎` |
| **tender** | Affection |  | 1,475 | `█████` |
| **contemplative** | Contemplation |  | 1,380 | `████▊` |
| **yearning** | Longing |  | 1,285 | `████▍` |
| **dark** | Valence | low | 1,178 | `████` |
| **serene** | Contentment |  | 1,015 | `███▌` |
| **soft** | Soft vs. Harsh | high | 938 | `███▎` |
| **high energy** | Arousal | high | 905 | `███` |
| **detached** | Vulnerable vs. Emotionally Detached | high · voice only | 737 | `██▌` |
| **vulnerable** | Vulnerable vs. Emotionally Detached | low · voice only | 398 | `█▍` |
| **yielding** | Submissive vs. Dominant | low · voice only | 203 | `▋` |

## Genres and styles

What kind of music: MTG-Jamendo's and FMA's own genre tags, and the styles the Suno-made sets wrote. 1,414 distinct words; the 160 most met:

| word | tracks | | from | met with |
|---|---:|---|---|---|
| Electronic | 6,013 | `████████████` | FMA 3431 · MTG 2512 | ecstatic, menacing, euphoric, dance |
| pop | 5,122 | `██████████▎` | MTG 2639 · FMA 1399 · GTS 662 · Suno 406 | no instruments, dry studio vocal, a cappella, female alto vocal |
| soundtrack | 2,791 | `█████▌` | MTG 1583 · FMA 1197 | low energy, classical, solemn, numb |
| Folk | 2,536 | `█████` | FMA 1578 · MTG 897 | Singer-Songwriter, Country, anguished, pop folk |
| classical | 2,180 | `████▍` | MTG 1753 · FMA 379 | piano, solemn, low energy, aching |
| rock | 2,122 | `████▎` | MTG 1418 · FMA 537 · Suno 151 | harsh, angry, cold, pop |
| ambient | 1,805 | `███▋` | MTG 1223 · FMA 471 · Suno 108 | solemn, low energy, numb, chill out |
| easy listening | 1,461 | `██▉` | MTG 1379 · FMA 75 | low energy, C major, piano, chill out |
| jazz | 1,452 | `██▉` | MTG 816 · FMA 484 · Suno 148 | playful, piano, bass, brass |
| Hip-Hop | 1,218 | `██▌` | FMA 1195 | proud, angry, menacing, triumphant |
| Experimental | 1,213 | `██▍` | FMA 766 · MTG 405 | Electronic, Avant-Garde, numb, Ambient Electronic |
| dance | 1,090 | `██▎` | MTG 661 · FMA 357 · Suno 64 | Electronic, ecstatic, euphoric, menacing |
| Singer-Songwriter | 985 | `█▉` | FMA 974 | Folk, anguished, soothing, bitter |
| chill out | 863 | `█▊` | MTG 850 | lounge, keyboard, easy listening, ambient |
| indie | 848 | `█▋` | MTG 805 | alternative, bass, harsh, drums |
| house | 844 | `█▋` | MTG 414 · FMA 295 · Suno 135 | Techno, ecstatic, deep, dance |
| alternative | 836 | `█▋` | MTG 776 · FMA 43 | indie, harsh, bass, electric guitar |
| hip hop | 828 | `█▋` | MTG 670 · Suno 114 · FMA 44 | rap, brass, bongo, bass |
| funk | 762 | `█▌` | MTG 454 · FMA 185 · Suno 121 | bongo, brass, bell, hip hop |
| happy | 759 | `█▌` | MTG 420 · GTS 303 | no instruments, dry studio vocal, a cappella, female alto vocal |
| Experimental Pop | 755 | `█▌` | FMA 752 | Electronic, Indie-Rock, anguished, Synth Pop |
| pop rock | 736 | `█▌` | MTG 699 | electric guitar, drums, bass, harsh |
| lounge | 676 | `█▍` | MTG 557 · FMA 104 | chill out, easy listening, percussion, synthesizer |
| pop folk | 662 | `█▍` | MTG 661 | Folk, acoustic guitar, pop, low energy |
| rap | 648 | `█▍` | FMA 260 · MTG 193 · Suno 193 | hip hop, proud, Hip-Hop, commanding |
| Indie-Rock | 643 | `█▎` | FMA 642 | Experimental Pop, anguished, pop, bitter |
| Techno | 641 | `█▎` | FMA 398 · MTG 137 · Suno 106 | house, Electronic, menacing, ecstatic |
| instrumental pop | 617 | `█▎` | MTG 606 | pop, easy listening, C major, 100 BPM |
| reggae | 612 | `█▎` | MTG 565 · Suno 41 | playful, euphoric, dub, A minor |
| sad | 608 | `█▎` | GTS 356 · MTG 148 · Suno 83 | no instruments, dry studio vocal, a cappella, female alto vocal |
| new age | 602 | `█▎` | MTG 512 · FMA 74 | ambient, meditative, low energy, synthesizer |
| blues | 551 | `█` | MTG 293 · FMA 208 · Suno 48 | Folk, Country, jazz, rock |
| orchestral | 540 | `█` | MTG 506 | classical, soundtrack, grateful, epic |
| Country | 507 | `█` | FMA 229 · MTG 197 · Suno 77 | Folk, blues, 1outro, bitter |
| world | 500 | `▉` | MTG 492 | world fusion, orchestra, playful, ethno |
| Downtempo | 498 | `▉` | FMA 322 · MTG 153 | Trip-Hop, Electronic, IDM, ambient |
| emotional | 483 | `▉` | MTG 326 · Suno 112 · Studio 28 | drama, piano, low energy, acoustic guitar |
| Ambient Electronic | 418 | `▊` | FMA 416 | Unclassifiable, IDM, Electronic, Chill-out |
| melodic | 415 | `▊` | MTG 332 · Suno 74 | indie, electric guitar, pop, electric piano |
| IDM | 371 | `▊` | FMA 354 | Electronic, Ambient Electronic, Downtempo, menacing |
| Trip-Hop | 370 | `▊` | FMA 367 | Downtempo, Glitch, Electronic, menacing |
| love | 349 | `▋` | MTG 330 | pop, C major, new age, low energy |
| cinematic | 322 | `▋` | MTG 267 · Suno 34 | classical, orchestral, cello, symphonic |
| atmospheric | 321 | `▋` | MTG 273 · Suno 28 | ambient, piano, aching, solemn |
| disco | 321 | `▋` | MTG 153 · FMA 123 · Suno 45 | dance, funk, summer, ecstatic |
| relaxing | 314 | `▋` | MTG 309 | easy listening, low energy, classical, meditative |
| International | 277 | `▌` | FMA 277 | Turkish, Balkan, Middle East, Folk |
| R&B | 277 | `▌` | MTG 159 · Suno 102 · Studio 16 | soul, funk, hip hop, romantic |
| Electroacoustic | 269 | `▌` | FMA 269 | Electronic, Minimal Electronic, Indie-Rock, Trip-Hop |
| Americana | 260 | `▌` | FMA 257 | Folk, Singer-Songwriter, anguished, Country |
| Lo-Fi | 255 | `▌` | FMA 196 · Suno 59 | Freak-Folk, Singer-Songwriter, Experimental Pop, anguished |
| electropop | 251 | `▌` | MTG 213 · Suno 22 · FMA 14 | Electronic, synthesizer, synthpop, drum machine |
| inspiring | 245 | `▌` | MTG 239 | classical, orchestral, motivational, epic |
| Hip-Hop Beats | 228 | `▌` | FMA 227 | Hip-Hop, Electronic, Soul-RnB, menacing |
| Minimalism | 225 | `▌` | FMA 222 | Contemporary Classical, low energy, numb, solemn |
| progressive | 224 | `▌` | MTG 161 · FMA 57 | guitar, metal, rock, harsh |
| ballad | 222 | `▌` | MTG 148 · Suno 68 | pop, acoustic guitar, piano, love |
| soul | 218 | `▌` | Suno 115 · MTG 70 · FMA 21 · Studio 12 | R&B, funk, beat, vocal |
| Avant-Garde | 215 | `▌` | FMA 202 · Suno 11 | Experimental, jazz, aching, progressive |
| Synth Pop | 210 | `▍` | FMA 201 | Experimental Pop, New Wave, disco, Power-Pop |
| Contemporary Classical | 207 | `▍` | FMA 207 | Minimalism, solemn, low energy, numb |
| epic | 207 | `▍` | MTG 155 · Suno 38 | orchestral, soundtrack, classical, dramatic |
| tracks to sync | 207 | `▍` | FMA 207 | 1outro, Folk, Country, Indie-Rock |
| Chill-out | 202 | `▍` | FMA 202 | Ambient Electronic, Electronic, music for video, Trip-Hop |
| Dubstep | 196 | `▍` | FMA 124 · MTG 51 · Suno 19 | menacing, dub, Electronic, ominous |
| Glitch | 196 | `▍` | FMA 170 · Suno 26 | Trip-Hop, menacing, Electronic, angry |
| trip hop | 192 | `▍` | MTG 172 · FMA 13 | hip hop, bongo, brass, cello |
| electro | 189 | `▍` | Suno 161 · FMA 28 | hopeful, house, bright, electro swing |
| advertising | 181 | `▍` | MTG 148 · FMA 33 | bed music, motivational, soundtrack, electric piano |
| Alternative Hip-Hop | 179 | `▍` | FMA 179 | Hip-Hop, proud, menacing, commanding |
| Breakbeat | 179 | `▍` | FMA 116 · MTG 58 | syncopation, beats, Chiptune, menacing |
| fun | 168 | `▍` | MTG 146 · Suno 20 | happy, pop, alternative, children |
| symphonic | 167 | `▍` | MTG 156 | cinematic, classical, aching, orchestral |
| fusion | 165 | `▍` | MTG 157 | jazz, electric guitar, funk, playful |
| acid jazz | 158 | `▍` | MTG 134 · Suno 21 | playful, acoustic bass guitar, 70s, funk |
| uplifting | 158 | `▍` | MTG 88 · Suno 41 · FMA 29 | Electronic, synthesizer, rap, vocal |
| summer | 155 | `▍` | MTG 147 · FMA 8 | percussion, keyboard, deep, dance |
| adventure | 153 | `▍` | MTG 150 | soundtrack, corporate, classical, orchestral |
| background | 152 | `▍` | MTG 148 | piano, classical, easy listening, inspiring |
| Chiptune | 151 | `▍` | FMA 145 | Chip Music, beats, syncopation, Breakbeat |
| minimal | 148 | `▍` | MTG 90 · Suno 38 · FMA 13 | piano, numb, solemn, low energy |
| Post-Rock | 147 | `▍` | FMA 142 | Shoegaze, Indie-Rock, acoustic, ambient |
| Soul-RnB | 144 | `▍` | FMA 144 | Hip-Hop, funk, Hip-Hop Beats, proud |
| celtic | 141 | `▎` | MTG 105 · FMA 32 | harp, Folk, solemn, low energy |
| contemporary | 140 | `▎` | MTG 124 · FMA 12 | classical, low energy, solemn, numb |
| Psych-Folk | 140 | `▎` | FMA 140 | anguished, fragile, Singer-Songwriter, yearning |
| christmas | 139 | `▎` | MTG 113 · FMA 21 | Holiday, bell, C major, happy |
| electronica | 139 | `▎` | FMA 68 · MTG 59 · Suno 12 | Electronic, IDM, ecstatic, menacing |
| instrumental rock | 139 | `▎` | MTG 134 | rock, electric guitar, harsh, cold |
| trance | 137 | `▎` | MTG 97 · Suno 40 | Techno, ecstatic, euphoric, Electronic |
| vocal | 137 | `▎` | FMA 64 · Suno 63 · Album 10 | Gospel, warm, jazz, deep |
| children | 135 | `▎` | MTG 109 · FMA 24 | Kid-Friendly, documentary, soundtrack, orchestral |
| hard rock | 134 | `▎` | MTG 96 · Suno 19 · Studio 10 · FMA 9 | angry, guitar, harsh, rock |
| Chip Music | 132 | `▎` | FMA 132 | Chiptune, playful, ecstatic, house |
| club | 131 | `▎` | MTG 127 | dance, summer, happy, disco |
| female vocals | 130 | `▎` | Suno 116 · FMA 8 | English, hopeful, warm, sensual |
| Industrial | 127 | `▎` | FMA 65 · MTG 52 · Suno 8 | menacing, Electronic, angry, Techno |
| dub | 126 | `▎` | MTG 100 · FMA 18 · Suno 8 | bass, reggae, Dubstep, playful |
| ska | 126 | `▎` | MTG 82 · Suno 35 · FMA 9 | rock, reggae, bass, playful |
| metal | 121 | `▎` | MTG 96 · Suno 12 · FMA 10 | harsh, angry, cold, progressive |
| swing | 120 | `▎` | MTG 55 · Suno 51 · FMA 12 | jazz, electro, bright, Big Band/Swing |
| trap | 116 | `▎` | Suno 112 | English, rap, sensual, commanding |
| bossa nova | 115 | `▎` | MTG 56 · Suno 48 · FMA 9 | upright bass, Portuguese, jazz, latin |
| deep house | 114 | `▎` | MTG 65 · Suno 46 | deep, house, 128 BPM, 124 BPM |
| EDM | 112 | `▎` | Suno 75 · MTG 33 | dance, hopeful, sensual, English |
| jazz fusion | 109 | `▎` | MTG 91 · Suno 17 | jazz, drums, playful, bass |
| Latin America | 109 | `▎` | FMA 109 | Spanish, menacing, Hip-Hop, Brazilian |
| Punk | 104 | `▎` | FMA 84 · Suno 19 | bitter, hard rock, Power-Pop, rock |
| positive | 103 | `▎` | MTG 99 | pop rock, happy, drums, electric guitar |
| Minimal Electronic | 102 | `▎` | FMA 102 | Electroacoustic, house, Ambient Electronic, IDM |
| cool | 101 | `▎` | MTG 82 · FMA 13 | lounge, chanson, relaxing, ambient |
| punk rock | 101 | `▎` | MTG 95 | harsh, angry, menacing, cold |
| chanson | 97 | `▎` | MTG 93 | guitar, pop folk, blues, pop |
| Composed Music | 95 | `▎` | FMA 95 | jazz, aching, soundtrack, classical |
| Holiday | 92 | `▎` | FMA 53 · MTG 39 | christmas, holiday music, happy, orchestral |
| New Wave | 92 | `▎` | FMA 67 · Suno 25 | Synth Pop, Indie-Rock, Electro-Punk, electropop |
| synthpop | 92 | `▎` | MTG 72 · Suno 18 | electropop, euphoric, synthesizer, ecstatic |
| 70s | 90 | `▎` | MTG 80 · FMA 5 · Suno 5 | groovy, melodic, playful, funk |
| acoustic | 90 | `▎` | Suno 49 · FMA 39 | Folk, Lo-Fi, Post-Rock, bitter |
| drum and bass | 89 | `▎` | MTG 48 · Suno 36 | sampler, Breakbeat, synthesizer, drum machine |
| psychedelic | 89 | `▎` | MTG 66 · Suno 14 · FMA 5 | drums, bass, improvisation, guitar |
| improvisation | 86 | `▎` | MTG 69 · FMA 17 | jazz, low energy, piano, relaxing |
| groove | 84 | `▎` | MTG 79 | funk, disco, fusion, playful |
| mellow | 80 | `▎` | MTG 55 · Suno 19 · FMA 4 | atmospheric, Lo-Fi, emotional, low energy |
| 80s | 79 | `▎` | MTG 57 · Suno 16 · FMA 6 | retro, synthesizer, guitar, lounge |
| Balkan | 77 | `▎` | FMA 77 | International, Big Band/Swing, jazz, playful |
| nature | 77 | `▎` | MTG 71 · FMA 4 | new age, easy listening, documentary, low energy |
| alternative rock | 75 | `▎` | MTG 34 · Suno 31 · FMA 6 · Studio 4 | rock, hard rock, English, bitter |
| ethno | 73 | `▎` | MTG 70 | world, new age, meditative, african |
| Reggae - Dub | 70 | `` | FMA 70 | menacing, triumphant, Garage, Latin America |
| synthwave | 70 | `` | Suno 62 · FMA 6 | hopeful, English, synth, electro |
| Shoegaze | 68 | `` | FMA 64 | Indie-Rock, Post-Rock, anguished, yearning |
| k-pop | 64 | `` | Suno 56 · Studio 8 | sensual, bright, hopeful, Korean |
| grunge | 63 | `` | MTG 51 · Suno 7 · Studio 4 | alternative, electric guitar, drums, bass |
| Kid-Friendly | 63 | `` | FMA 63 | childrens music, children, French, Singer-Songwriter |
| post rock | 63 | `` | MTG 56 · FMA 4 | ambient, alternative, synthesizer, drums |
| raw | 63 | `` | Album 42 · Suno 14 · Studio 6 | slow rubato, singing bowls, Phrygian Dominant, modal harmony |
| 90s | 62 | `` | MTG 55 · Suno 7 | hip hop, indie, 80s, A minor |
| rock and roll | 62 | `` | MTG 60 | electric guitar, harsh, rock, drums |
| african | 61 | `` | MTG 33 · FMA 26 | Afrobeat, playful, world, International |
| Chamber Music | 61 | `` | FMA 60 | classical, Choral Music, Experimental Pop, aching |
| world fusion | 61 | `` | MTG 56 · Suno 5 | world, saxophone, new age, energetic |
| Krautrock | 59 | `` | FMA 53 · Suno 6 | Nu-Jazz, lounge, progressive, fragile |
| 60s | 58 | `` | MTG 55 · Suno 3 | melodic, 70s, love, pop rock |
| Unclassifiable | 58 | `` | FMA 58 | Ambient Electronic, soundtrack, solemn, aching |
| eurodance | 57 | `` | MTG 45 · Suno 12 | sampler, dance, synthesizer, electropop |
| Post-Punk | 57 | `` | FMA 45 · Suno 10 | darkwave, harsh, Punk, New Wave |
| trailer | 57 | `` | MTG 55 | classical, symphonic, cinematic, epic |
| darkwave | 56 | `` | MTG 25 · FMA 19 · Suno 10 | Post-Punk, alternative, yearning, anguished |
| Gospel | 56 | `` | FMA 32 · Suno 22 | vocal, Afrobeat, bitter, tender |
| Psych-Rock | 56 | `` | FMA 56 | Nu-Jazz, Indie-Rock, anguished, Electroacoustic |
| Drum & Bass | 55 | `` | FMA 54 | IDM, Jungle, Electronic, menacing |
| jazzfunk | 54 | `` | MTG 54 | jazz, funk, playful, saxophone |
| party | 54 | `` | MTG 42 · FMA 5 · Suno 5 | dance, sport, menacing, ecstatic |
| Brazilian | 53 | `` | FMA 52 | International, Portuguese, Singer-Songwriter, grateful |
| Jungle | 51 | `` | FMA 47 · Suno 4 | Breakbeat, IDM, Drum & Bass, Ambient Electronic |
| female | 50 | `` | Suno 46 · FMA 4 | hopeful, sensual, English, Japanese |
| Opera | 50 | `` | FMA 24 · Suno 16 · Album 10 | classical, Choral Music, awe-struck, slow rubato |
| classic rock | 47 | `` | MTG 36 · FMA 4 · Studio 4 · Suno 3 | hard rock, guitar, E minor, rock |
| indie folk | 47 | `` | FMA 31 · Suno 8 · Studio 8 | Indie-Rock, Singer-Songwriter, indie rock, Folk |

## Instruments

What plays: MTG-Jamendo's instrument tags (up to four a track) and the instruments the free style lines name. 890 distinct words; the 160 most met:

| word | tracks | | from | met with |
|---|---:|---|---|---|
| piano | 2,383 | `████████████` | MTG 2140 · Suno 136 | classical, solemn, low energy, numb |
| bass | 1,960 | `█████████▉` | MTG 1853 · Suno 105 | drums, electric guitar, keyboard, indie |
| drums | 1,812 | `█████████` | MTG 1727 | bass, electric guitar, keyboard, pop rock |
| guitar | 1,272 | `██████▍` | MTG 1176 · Suno 83 | drums, bass, rock, indie |
| electric guitar | 1,208 | `██████` | MTG 1175 | drums, bass, pop rock, acoustic guitar |
| synthesizer | 1,047 | `█████▎` | MTG 1034 | drum machine, bass, electric guitar, Electronic |
| acoustic guitar | 887 | `████▌` | MTG 795 · Suno 49 | electric guitar, drums, pop folk, bass |
| keyboard | 477 | `██▍` | MTG 466 | percussion, drums, deep, bass |
| violin | 426 | `██▎` | MTG 275 · Suno 92 · Album 42 | classical, cello, viola, slow rubato |
| drum machine | 425 | `██` | MTG 425 | synthesizer, bass, drums, beat |
| strings | 333 | `█▋` | MTG 268 · Studio 28 · Album 26 | classical, piano, soundtrack, orchestral |
| cello | 322 | `█▋` | MTG 286 · Suno 26 | classical, violin, double bass, cinematic |
| saxophone | 285 | `█▌` | MTG 203 · Suno 79 | jazz, bass, drums, playful |
| flute | 274 | `█▍` | MTG 225 · Suno 34 | harp, cello, piano, classical |
| electronic production | 252 | `█▎` | MTG 250 | drum machine, synthesizer, keyboard, bass |
| classical guitar | 248 | `█▎` | MTG 238 | acoustic guitar, low energy, drums, acoustic bass guitar |
| electric piano | 242 | `█▎` | MTG 235 | electric guitar, drums, bass, motivational |
| percussion | 232 | `█▎` | MTG 223 | keyboard, deep, bass, drums |
| brass | 213 | `█` | MTG 207 | bongo, hip hop, bass, bell |
| beat | 194 | `▉` | MTG 158 · Suno 33 | hip hop, drum machine, bass, soul |
| bell | 185 | `▉` | MTG 182 | bongo, brass, hip hop, funk |
| bongo | 184 | `▉` | MTG 184 | brass, hip hop, bell, funk |
| double bass | 179 | `▉` | MTG 133 · Album 42 | cello, slow rubato, singing bowls, Phrygian Dominant |
| harp | 168 | `▊` | MTG 138 · Suno 18 · Album 12 | celtic, cello, flute, classical |
| orchestra | 168 | `▊` | MTG 153 · Suno 13 | soundtrack, aching, symphonic, classical |
| accordion | 154 | `▊` | MTG 123 · Suno 17 · FMA 10 | Folk, flute, acoustic guitar, pop folk |
| sampler | 150 | `▊` | MTG 149 | synthesizer, drum machine, electronic production, eurodance |
| acoustic bass guitar | 117 | `▋` | MTG 117 | drums, acoustic guitar, classical guitar, brass |
| viola | 105 | `▌` | MTG 51 · Album 42 · FMA 10 | slow rubato, singing bowls, Phrygian Dominant, modal harmony |
| trumpet | 103 | `▌` | MTG 66 · Suno 23 · FMA 12 | jazz, keyboard, bossa nova, electric guitar |
| beats | 81 | `▍` | FMA 65 · Suno 16 | syncopation, Chiptune, Breakbeat, drums |
| Celtic harp | 79 | `▍` | Album 42 · Studio 36 | slow rubato, singing bowls, Phrygian Dominant, modal harmony |
| ukulele | 79 | `▍` | MTG 70 · Suno 8 | acoustic guitar, happy, pop folk, G major |
| rhodes | 76 | `▍` | MTG 74 | chill out, lounge, bass, drums |
| harmonica | 64 | `▍` | MTG 55 · Suno 7 | drums, Folk, blues, acoustic guitar |
| organ | 63 | `▍` | MTG 44 · FMA 13 · Suno 6 | pipe organ, electric guitar, easy listening, pop rock |
| clarinet | 61 | `▍` | MTG 52 · Suno 6 | classical, cello, flute, aching |
| horn | 58 | `▍` | MTG 57 | cello, orchestral, double bass, symphonic |
| pipe organ | 54 | `▎` | MTG 39 · FMA 11 | organ, oboe, drums, piano |
| synth | 51 | `▎` | Suno 29 · FMA 22 | synthwave, Experimental Pop, Electronic, hopeful |
| oboe | 47 | `▎` | MTG 46 | piano, classical, pipe organ, solemn |
| psaltery | 43 | `▎` | Album 42 | slow rubato, singing bowls, Phrygian Dominant, modal harmony |
| breathy flute | 42 | `▎` | Album 42 | slow rubato, singing bowls, Phrygian Dominant, modal harmony |
| celesta | 42 | `▎` | Album 42 | slow rubato, singing bowls, Phrygian Dominant, modal harmony |
| cello drone | 42 | `▎` | Album 42 | slow rubato, singing bowls, Phrygian Dominant, modal harmony |
| deep bass | 42 | `▎` | Suno 28 · Studio 14 | Russian lyrics, triumphant, commanding, proud |
| singing bowls | 42 | `▎` | Album 42 | slow rubato, Phrygian Dominant, modal harmony, Harmonic Minor |
| MPC sampled beat | 39 | `▎` | Suno 39 | 88 BPM, no vocals, playful, 84 BPM |
| viola and cello | 38 | `▎` | Studio 38 | Celtic harp, no vocals, awe-struck, aching |
| upright bass | 35 | `▎` | Suno 25 · Studio 10 | bossa nova, Portuguese, intimate, warm |
| drum | 32 | `▎` | Suno 32 | bass, piano, expressive, hopeful |
| soft analog pads | 30 | `▎` | Suno 30 | field recordings, dusty, Wide, 110 BPM |
| balalaika | 28 | `` | Studio 24 · Suno 4 |  |
| distant chimes | 28 | `` | Suno 28 |  |
| pad | 27 | `` | MTG 24 · Suno 3 |  |
| button accordion | 24 | `` | Studio 24 |  |
| tabla | 23 | `` | Suno 21 · Studio 2 |  |
| brushed drums | 21 | `` | Suno 19 · Studio 2 |  |
| trombone | 20 | `` | MTG 17 · Suno 3 |  |
| walking upright bass | 20 | `` | Suno 20 |  |
| kick deep soft round | 18 | `` | Suno 18 |  |
| bass one note droning | 17 | `` | Suno 17 |  |
| oud | 17 | `` | Suno 12 · Studio 4 · Album 1 |  |
| banjo | 16 | `` | Suno 11 · FMA 3 · Studio 2 |  |
| sax | 15 | `` | Suno 15 |  |
| future bass | 14 | `` | Suno 12 · Studio 2 |  |
| sitar | 14 | `` | Suno 9 · FMA 3 · Studio 2 |  |
| warm bass | 13 | `` | Suno 11 · Studio 2 |  |
| rolling hi-hats | 12 | `` | Studio 10 · Suno 2 |  |
| fiddle | 11 | `` | Suno 6 · FMA 3 · Studio 2 |  |
| heavy bass | 11 | `` | Suno 9 · Studio 2 |  |
| marimba | 11 | `` | FMA 6 · Suno 5 |  |
| SOFT VIOLIN | 11 | `` | Suno 11 |  |
| solo shofar | 11 | `` | Album 9 · Studio 2 |  |
| congas live percussion | 10 | `` | Suno 10 |  |
| didgeridoo | 10 | `` | Suno 10 |  |
| hammond organ | 10 | `` | Suno 10 |  |
| Hammond organ swells | 10 | `` | Suno 10 |  |
| MPC triggered beat chopped | 10 | `` | Suno 10 |  |
| shamisen | 10 | `` | Suno 10 |  |
| shuffled hi-hats | 10 | `` | Suno 10 |  |
| shuffling percussion | 10 | `` | Suno 10 |  |
| START WITH SOFT TRUMPET | 10 | `` | Suno 10 |  |
| hard bass | 9 | `` | Suno 9 |  |
| Piano Solo | 9 | `` | Suno 9 |  |
| bass solo | 8 | `` | Suno 8 |  |
| clean trumpet tone | 8 | `` | Suno 8 |  |
| fingerstyle guitar no pick | 8 | `` | Suno 8 |  |
| gentle brushed drums | 8 | `` | Suno 8 |  |
| handpan | 8 | `` | Suno 8 |  |
| hollow body archtop guitar | 8 | `` | Suno 8 |  |
| jazz guitar trio | 8 | `` | Suno 8 |  |
| jazz saxophone | 8 | `` | Suno 8 |  |
| koto | 8 | `` | Suno 6 · Studio 2 |  |
| mellow upright bass | 8 | `` | Suno 8 |  |
| muted trumpet melody | 8 | `` | Suno 8 |  |
| no saxophone | 8 | `` | Suno 8 |  |
| piano comping | 8 | `` | Suno 8 |  |
| piano rock | 8 | `` | Suno 6 · Studio 2 |  |
| Rhodes chords | 8 | `` | Suno 8 |  |
| Rhodes comping | 8 | `` | Suno 8 |  |
| sliding 808 bass | 8 | `` | Studio 8 |  |
| soft brushed drums | 8 | `` | Suno 6 · Studio 2 |  |
| soft nylon-string acoustic guitar | 8 | `` | Suno 8 |  |
| subtle Rhodes | 8 | `` | Suno 8 |  |
| atmospheric pads | 7 | `` | Suno 5 · Studio 2 |  |
| bass house | 7 | `` | Suno 7 |  |
| lute | 7 | `` | Suno 5 · FMA 2 |  |
| shakuhachi | 7 | `` | Suno 7 |  |
| synths | 7 | `` | Suno 7 |  |
| theremin | 7 | `` | Suno 7 |  |
| violins | 7 | `` | Suno 7 |  |
| baroque cello | 6 | `` | Suno 6 |  |
| baroque viola | 6 | `` | Suno 6 |  |
| bells | 6 | `` | Suno 6 |  |
| bright brass | 6 | `` | Suno 6 |  |
| Bright layered clap/snare | 6 | `` | Suno 6 |  |
| congas | 6 | `` | Suno 6 |  |
| dark piano | 6 | `` | Studio 6 |  |
| groovy bass | 6 | `` | Suno 6 |  |
| harpsichord | 6 | `` | Suno 6 |  |
| hi-hat loose shuffled | 6 | `` | Suno 6 |  |
| jazz-altered pad voicings | 6 | `` | Suno 6 |  |
| minimal percussion | 6 | `` | Suno 6 |  |
| one baroque cello | 6 | `` | Suno 6 |  |
| one baroque viola | 6 | `` | Suno 6 |  |
| one violone | 6 | `` | Suno 6 |  |
| pan flute | 6 | `` | Suno 4 · Studio 2 |  |
| punchy kick and snare | 6 | `` | Studio 6 |  |
| sample based beat | 6 | `` | Suno 6 |  |
| Solid 4/4 909-style kick | 6 | `` | Suno 6 |  |
| Solid punchy kick | 6 | `` | Suno 6 |  |
| steel guitar | 6 | `` | Suno 6 |  |
| subtle percussion | 6 | `` | Suno 6 |  |
| tambourine | 6 | `` | Suno 6 |  |
| tambourine lifts | 6 | `` | Suno 6 |  |
| tambourine loose shuffled | 6 | `` | Suno 6 |  |
| tight rolling sub bass | 6 | `` | Suno 6 |  |
| tight with kick | 6 | `` | Suno 6 |  |
| upright bass chops | 6 | `` | Suno 6 |  |
| vibraphone lead | 6 | `` | Suno 6 |  |
| violone | 6 | `` | Suno 6 |  |
| West African funk guitar | 6 | `` | Suno 6 |  |
| with crisp drums | 6 | `` | Suno 6 |  |
| xylophone | 6 | `` | Suno 6 |  |
| 808 | 5 | `` | Suno 5 |  |
| airy pads | 5 | `` | Suno 5 |  |
| bandoneon | 5 | `` | Suno 3 · Studio 2 |  |
| baroque violin | 5 | `` | Suno 5 |  |
| bass drop | 5 | `` | Suno 5 |  |
| bass guitar | 5 | `` | Suno 4 · Album 1 |  |
| bassoon | 5 | `` | FMA 5 |  |
| full orchestra | 5 | `` | Studio 4 · Suno 1 |  |
| hypnotic beats | 5 | `` | Suno 5 |  |
| muted trumpet | 5 | `` | Suno 3 · Studio 2 |  |
| pipa | 5 | `` | Suno 5 |  |
| saz | 5 | `` | Suno 5 |  |
| soft drums | 5 | `` | Studio 4 · Suno 1 |  |
| solo Armenian duduk | 5 | `` | Album 5 |  |
| string quartet | 5 | `` | Suno 3 · Studio 2 |  |

## Voice

Who sings or speaks, and how: the voice's type, range, technique and place in the mix. 365 distinct words; the 100 most met:

| word | tracks | | from | met with |
|---|---:|---|---|---|
| dry studio vocal | 662 | `████████████` | GTS 662 | no instruments, a cappella, female alto vocal, serene |
| audiobook narration | 600 | `██████████▉` | Speech 600 | Russian spoken word, dry studio, close-mic, calm clear reading |
| calm clear reading | 600 | `██████████▉` | Speech 600 | Russian spoken word, dry studio, close-mic, audiobook narration |
| Russian spoken word | 600 | `██████████▉` | Speech 600 | dry studio, close-mic, calm clear reading, audiobook narration |
| no vocals | 581 | `██████████▌` | Studio 526 · Suno 55 | nothing else playing, Natural room, close-miked and in front, A slow |
| female alto vocal | 465 | `████████▌` | GTS 465 | no instruments, dry studio vocal, a cappella, serene |
| female voice | 389 | `███████` | Speech 300 · Suno 89 | Russian spoken word, dry studio, close-mic, calm clear reading |
| male voice | 353 | `██████▍` | Speech 300 · Suno 53 | Russian spoken word, dry studio, close-mic, calm clear reading |
| male tenor vocal | 197 | `███▌` | GTS 197 | no instruments, dry studio vocal, a cappella, sad |
| falsetto | 97 | `█▊` | GTS 96 | no instruments, dry studio vocal, a cappella, female alto vocal |
| mixed voice | 96 | `█▊` | GTS 96 | no instruments, dry studio vocal, a cappella, female alto vocal |
| female vocal | 64 | `█▎` | Suno 45 · Album 19 | slow rubato, singing bowls, Phrygian Dominant, modal harmony |
| male vocals | 53 | `▉` | Suno 43 · Studio 10 | English, tender, romantic, soothing |
| breathy | 52 | `▉` | GTS 49 · Suno 3 | no instruments, dry studio vocal, a cappella, female alto vocal |
| male vocal | 50 | `▉` | Suno 26 · Album 24 | slow rubato, singing bowls, Phrygian Dominant, modal harmony |
| pharyngeal | 47 | `▊` | GTS 47 | no instruments, dry studio vocal, a cappella, serene |
| vibrato | 46 | `▊` | GTS 45 | no instruments, dry studio vocal, a cappella, female alto vocal |
| distant choir | 42 | `▊` | Album 42 | slow rubato, singing bowls, Phrygian Dominant, modal harmony |
| clear diction | 40 | `▊` | Studio 40 | russian, awe-struck, contemplative, grateful |
| female singer | 37 | `▋` | Suno 37 | English, warm, soothing, anguished |
| No singing | 32 | `▋` | Studio 32 | No sung chorus, No rock guitars, No metal, commanding |
| No sung chorus | 32 | `▋` | Studio 32 | No singing, No rock guitars, No metal, commanding |
| a male rapper | 28 | `▌` | Studio 28 |  |
| operatic | 27 | `▌` | Album 22 · Suno 5 |  |
| vocaloid | 27 | `▌` | Suno 27 |  |
| choir | 24 | `▌` | Suno 12 · Studio 8 · Album 4 |  |
| male baritone vocal | 24 | `▌` | Studio 24 |  |
| male singer | 22 | `▍` | Suno 22 |  |
| duet | 20 | `▍` | Suno 17 · Album 3 |  |
| belted | 18 | `▍` | Album 18 |  |
| male | 16 | `▍` | Suno 16 |  |
| boy band | 15 | `▎` | Suno 15 |  |
| freestyle | 15 | `▎` | Suno 15 |  |
| powerful female vocals | 13 | `▎` | Studio 12 · Suno 1 |  |
| clear vocals | 12 | `▎` | Suno 12 |  |
| raspy male vocals | 12 | `▎` | Studio 12 |  |
| theatrical male vocals | 12 | `▎` | Studio 12 |  |
| female vocalist | 10 | `▎` | Suno 10 |  |
| pop rap | 10 | `▎` | Suno 8 · Studio 2 |  |
| warm male vocals | 10 | `▎` | Studio 10 |  |
| emotional female vocals | 9 | `▎` | Studio 8 · Suno 1 |  |
| girl group | 9 | `▎` | Suno 7 · Studio 2 |  |
| male rapper | 9 | `▎` | Studio 8 · Suno 1 |  |
| alto solo | 8 | `▎` | Suno 8 |  |
| both sing the chorus | 8 | `▎` | Studio 8 |  |
| conversational phrasing | 8 | `▎` | Suno 8 |  |
| falsetto male vocals | 8 | `▎` | Studio 8 |  |
| female singers | 8 | `▎` | Suno 8 |  |
| intimate close-mic vocals | 8 | `▎` | Suno 8 |  |
| male vocalist | 8 | `▎` | Suno 8 |  |
| Russian rap | 8 | `▎` | Studio 8 |  |
| smooth male vocals | 8 | `▎` | Studio 8 |  |
| soprano solo | 8 | `▎` | Suno 8 |  |
| sung by a female contralto | 8 | `▎` | Studio 8 |  |
| sung by a female mezzo-soprano | 8 | `▎` | Studio 8 |  |
| sung by a male baritone | 8 | `▎` | Studio 8 |  |
| sung by a mixed choir | 8 | `▎` | Studio 8 |  |
| sweet female vocal | 8 | `▎` | Suno 8 |  |
| tenor solo | 8 | `▎` | Suno 8 |  |
| acapella | 7 | `` | Suno 7 |  |
| cloud rap | 7 | `` | Suno 5 · Studio 2 |  |
| gregorian chant | 7 | `` | Suno 5 · Studio 2 |  |
| powerful male vocals | 7 | `` | Studio 6 · Suno 1 |  |
| soft female vocals | 7 | `` | Studio 6 · Suno 1 |  |
| spoken word | 7 | `` | Suno 7 |  |
| cantus firmus in soprano | 6 | `` | Suno 6 |  |
| clear female vocals | 6 | `` | Suno 6 |  |
| clear voice | 6 | `` | Suno 6 |  |
| deep baritone male vocals | 6 | `` | Studio 6 |  |
| female rapper | 6 | `` | Studio 4 · Suno 2 |  |
| Intimate vocal space | 6 | `` | Suno 6 |  |
| Miku Voice | 6 | `` | Suno 6 |  |
| soulful female vocals | 6 | `` | Suno 4 · Studio 2 |  |
| sultry female vocals | 6 | `` | Suno 4 · Studio 2 |  |
| sung by a duet | 6 | `` | Studio 6 |  |
| vocal chops | 6 | `` | Suno 6 |  |
| emotional male vocals | 5 | `` | Studio 4 · Suno 1 |  |
| harmony vocals | 5 | `` | Studio 4 · Suno 1 |  |
| Jazz Rap | 5 | `` | Suno 3 · Studio 2 |  |
| layered harmonies | 5 | `` | Suno 5 |  |
| melodic rap | 5 | `` | Suno 5 |  |
| warm breathy double-reed melody | 5 | `` | Album 5 |  |
| a female rapper | 4 | `` | Studio 4 |  |
| aggressive male rapper | 4 | `` | Studio 4 |  |
| airy ad-libs | 4 | `` | Suno 4 |  |
| alto solo voice | 4 | `` | Suno 4 |  |
| anthemic male vocals | 4 | `` | Studio 4 |  |
| bass solo voice | 4 | `` | Suno 4 |  |
| breathy female vocals | 4 | `` | Studio 4 |  |
| chopped vocal glitches | 4 | `` | Suno 4 |  |
| clear narration | 4 | `` | Suno 4 |  |
| dry male vocals | 4 | `` | Studio 4 |  |
| energetic male rapper | 4 | `` | Studio 4 |  |
| energetic male vocals | 4 | `` | Studio 4 |  |
| fast aggressive male rap | 4 | `` | Studio 4 |  |
| female voices | 4 | `` | Suno 4 |  |
| French Voice | 4 | `` | Suno 4 |  |
| male rapper with ad-libs | 4 | `` | Studio 4 |  |
| melancholic male rapper | 4 | `` | Studio 4 |  |
| mellow male rapper | 4 | `` | Studio 4 |  |

## Mood

MTG-Jamendo's mood tags and the moods the free style lines name, beside the emotion words. 289 distinct words; the 100 most met:

| word | tracks | | from | met with |
|---|---:|---|---|---|
| energetic | 341 | `████████████` | MTG 318 · Suno 21 | electric guitar, drums, bass, harsh |
| deep | 295 | `██████████▍` | MTG 189 · Suno 106 | percussion, keyboard, house, bass |
| dream | 217 | `███████▋` | MTG 215 | piano, chill out, easy listening, C major |
| meditative | 163 | `█████▊` | MTG 155 | new age, relaxing, low energy, solemn |
| upbeat | 148 | `█████▎` | MTG 81 · Suno 65 | brass, bass, hip hop, drums |
| dramatic | 116 | `████` | MTG 78 · Suno 29 · Album 7 | epic, orchestral, classical, soundtrack |
| groovy | 108 | `███▊` | MTG 71 · Suno 33 | funk, 70s, playful, bright |
| calm | 93 | `███▎` | MTG 81 · Suno 12 | easy listening, synthesizer, lounge, soft |
| ambiental | 74 | `██▋` | MTG 74 | Experimental, Electronic, lounge, world |
| catchy | 71 | `██▌` | Suno 69 | English, hopeful, bright, expressive |
| funny | 69 | `██▍` | MTG 56 · Suno 13 | dance, percussion, keyboard, happy |
| smooth | 47 | `█▋` | Suno 45 | warm, rap, saxophone, deep |
| intimate | 43 | `█▌` | Suno 31 · Studio 12 | warm, upright bass, soul, contemplative |
| soulful | 43 | `█▌` | Suno 39 · Studio 4 | soul, English, warm, bitter |
| slow rubato | 42 | `█▌` | Album 42 | singing bowls, Phrygian Dominant, modal harmony, Harmonic Minor |
| ethereal | 30 | `█` | Suno 21 · Album 5 · Studio 4 | slow, female vocal, anguished, raw |
| jazzy | 29 | `█` | Suno 29 |  |
| dreamy | 28 | `▉` | Suno 24 · Studio 4 |  |
| hypnotic | 27 | `▉` | Suno 25 · Studio 2 |  |
| intense | 20 | `▋` | Suno 14 · Studio 6 |  |
| sexy | 20 | `▋` | MTG 13 · Suno 7 |  |
| simple loop hypnotic repeating | 20 | `▋` | Suno 20 |  |
| SP1200 gritty bit depth | 20 | `▋` | Suno 20 |  |
| danceable | 17 | `▋` | Suno 9 · Studio 8 |  |
| heartfelt | 17 | `▋` | Suno 15 · Studio 2 |  |
| melancholy | 17 | `▋` | Suno 15 · Studio 2 |  |
| anthemic | 16 | `▌` | Suno 8 · Studio 8 |  |
| gritty | 16 | `▌` | Suno 16 |  |
| moody | 16 | `▌` | Suno 12 · Studio 4 |  |
| festive | 15 | `▌` | Studio 10 · Suno 5 |  |
| haunting | 15 | `▌` | Suno 15 |  |
| heavy | 15 | `▌` | Suno 6 · Studio 6 · MTG 3 |  |
| deep sub-bass | 14 | `▌` | Suno 14 |  |
| beautiful and broken | 12 | `▍` | Suno 12 |  |
| passionate | 12 | `▍` | Album 6 · Suno 4 · Studio 2 |  |
| cute | 11 | `▍` | Suno 11 |  |
| eerie | 11 | `▍` | Suno 11 |  |
| aggressive | 10 | `▍` | Suno 8 · Studio 2 |  |
| beautiful | 10 | `▍` | Suno 10 |  |
| bittersweet final-track energy | 10 | `▍` | Suno 10 |  |
| dancefloor but emotionally heavy | 10 | `▍` | Suno 10 |  |
| saudade | 10 | `▍` | Suno 8 · Studio 2 |  |
| introspective | 9 | `▍` | Studio 6 · Suno 3 |  |
| ritual and solemn | 9 | `▍` | Album 9 |  |
| smoky | 9 | `▍` | Suno 9 |  |
| angular melodic line | 8 | `▎` | Suno 8 |  |
| cheerful | 8 | `▎` | Suno 8 |  |
| dreamy floating atmosphere | 8 | `▎` | Suno 8 |  |
| groove-first | 8 | `▎` | Suno 8 |  |
| melancholic but sunny | 8 | `▎` | Suno 8 |  |
| mysterious | 8 | `▎` | Suno 8 |  |
| night-city imagery | 8 | `▎` | Suno 8 |  |
| rain | 8 | `▎` | Suno 8 |  |
| spooky | 8 | `▎` | Suno 8 |  |
| with emotional tension | 8 | `▎` | Suno 8 |  |
| Christmas music | 7 | `▎` | Suno 7 |  |
| deep flow | 7 | `▎` | Suno 7 |  |
| aggressive bassline | 6 | `▎` | Studio 6 |  |
| catchy melodies | 6 | `▎` | Suno 6 |  |
| christmas song | 6 | `▎` | Suno 6 |  |
| dark and hypnotic | 6 | `▎` | Suno 6 |  |
| deep warm swung four-on-floor | 6 | `▎` | Suno 6 |  |
| heavy guitars | 6 | `▎` | Studio 6 |  |
| Soulful gospel-house chords (minor7 | 6 | `▎` | Suno 6 |  |
| catchy hooks | 5 | `▎` | Suno 3 · Studio 2 |  |
| dark electro | 5 | `▎` | Suno 5 |  |
| deep basses | 5 | `▎` | Studio 4 · Suno 1 |  |
| peaceful | 5 | `▎` | Suno 3 · Studio 2 |  |
| a gentle three-four sway | 4 | `` | Studio 4 |  |
| a nostalgic melody | 4 | `` | Studio 4 |  |
| a slow ecstatic build | 4 | `` | Studio 4 |  |
| a slow heartbeat | 4 | `` | Studio 4 |  |
| a slow melancholy tune | 4 | `` | Studio 4 |  |
| angular melodic lines | 4 | `` | Suno 4 |  |
| catchy melody | 4 | `` | Suno 4 |  |
| confident fast flow | 4 | `` | Studio 4 |  |
| dark melodic riffs | 4 | `` | Studio 4 |  |
| dark sweaty dancefloor | 4 | `` | Suno 4 |  |
| Fast past | 4 | `` | Suno 4 |  |
| G major nostalgic futuristic | 4 | `` | Suno 4 |  |
| grand and dramatic | 4 | `` | Studio 4 |  |
| groove-first arrangement | 4 | `` | Suno 4 |  |
| heavy riffs | 4 | `` | Studio 4 |  |
| intimate and vulnerable | 4 | `` | Suno 4 |  |
| Lush | 4 | `` | Suno 2 · Studio 2 |  |
| mathematics made emotional | 4 | `` | Suno 4 |  |
| raw powerful energy | 4 | `` | Studio 4 |  |
| raw resonant 303 bassline | 4 | `` | Suno 4 |  |
| rebellious energy | 4 | `` | Studio 4 |  |
| Scythian earthly epic | 4 | `` | Studio 4 |  |
| slow chordal homophony | 4 | `` | Suno 4 |  |
| smooth and melancholic | 4 | `` | Suno 4 |  |
| smooth and sensual | 4 | `` | Suno 4 |  |
| sophisticated extended chords | 4 | `` | Suno 4 |  |
| bittersweet | 3 | `` | Suno 3 |  |
| Catchy instrumental intro | 3 | `` | Suno 3 |  |
| dark clubbing | 3 | `` | Suno 3 |  |
| deep reverberation | 3 | `` | Suno 3 |  |
| epic trailer music | 3 | `` | Studio 2 · Suno 1 |  |
| funky basslines | 3 | `` | Studio 2 · Suno 1 |  |

## Use and theme

What the music is for: MTG-Jamendo's themes (film, corporate, advertising…). 15 distinct words; the 15 most met:

| word | tracks | | from | met with |
|---|---:|---|---|---|
| corporate | 165 | `████████████` | MTG 165 | soundtrack, adventure, documentary, commercial |
| drama | 150 | `██████████▉` | MTG 146 | emotional, soundtrack, documentary, adventure |
| documentary | 148 | `██████████▊` | MTG 148 | soundtrack, corporate, drama, orchestral |
| motivational | 126 | `█████████▎` | MTG 126 | advertising, inspiring, electric piano, ambient |
| action | 98 | `███████` | MTG 97 | epic, orchestral, soundtrack, energetic |
| commercial | 94 | `██████▊` | MTG 94 | corporate, documentary, advertising, soundtrack |
| movie | 75 | `█████▌` | MTG 75 | soundtrack, cinematic, classical, orchestra |
| soundscape | 74 | `█████▍` | MTG 74 | ambient, new age, atmospheric, soundtrack |
| sport | 58 | `████▎` | MTG 58 | dance, energetic, action, party |
| game | 49 | `███▌` | MTG 49 | cello, symphonic, double bass, cinematic |
| travel | 26 | `█▉` | MTG 26 |  |
| fantasy | 9 | `▋` | Suno 9 |  |
| Romance | 4 | `▍` | Suno 4 |  |
| Western | 4 | `▍` | Suno 4 |  |
| sci-fi | 3 | `▎` | Suno 3 |  |

## Sound and space

The recording's space, its texture and its production. 306 distinct words; the 70 most met:

| word | tracks | | from | met with |
|---|---:|---|---|---|
| no instruments | 662 | `████████████` | GTS 662 | dry studio vocal, a cappella, female alto vocal, serene |
| no music | 604 | `██████████▉` | Speech 600 | Russian spoken word, dry studio, close-mic, calm clear reading |
| close-mic | 600 | `██████████▉` | Speech 600 | Russian spoken word, dry studio, calm clear reading, audiobook narration |
| dry studio | 600 | `██████████▉` | Speech 600 | Russian spoken word, close-mic, calm clear reading, audiobook narration |
| nothing else playing | 346 | `██████▎` | Studio 337 | Natural room, close-miked and in front, no vocals, A slow |
| close-miked and in front | 295 | `█████▍` | Studio 295 | Natural room, nothing else playing, A slow, no vocals |
| Natural room | 293 | `█████▍` | Studio 293 | close-miked and in front, nothing else playing, A slow, no vocals |
| Wide | 90 | `█▋` | Suno 70 · Album 20 | soft analog pads, field recordings, dusty, raw |
| close-miked | 54 | `▉` | Album 42 · Studio 12 | slow rubato, singing bowls, Phrygian Dominant, modal harmony |
| deep reverb | 45 | `▊` | Album 42 · Suno 3 | slow rubato, singing bowls, Phrygian Dominant, modal harmony |
| dusty | 40 | `▊` | Suno 40 | soft analog pads, field recordings, Wide, deep |
| reverb-heavy | 40 | `▊` | Album 40 | duduk, slow rubato, singing bowls, Phrygian Dominant |
| and evolving FX | 28 | `▌` | Suno 28 |  |
| long tape delay | 28 | `▌` | Suno 28 |  |
| and subtle sidechain movement | 26 | `▌` | Suno 26 |  |
| immersive depth | 26 | `▌` | Suno 26 |  |
| vinyl haze | 26 | `▌` | Suno 26 |  |
| warm analog everything | 26 | `▌` | Suno 26 |  |
| with reversed swells | 26 | `▌` | Suno 26 |  |
| electric | 25 | `▌` | Suno 25 |  |
| glossy | 24 | `▌` | Suno 24 |  |
| reverse swells | 22 | `▍` | Suno 22 |  |
| vinyl crackle dust texture | 20 | `▍` | Suno 20 |  |
| clean | 19 | `▍` | Suno 19 |  |
| polished | 17 | `▍` | Suno 17 |  |
| reverb | 17 | `▍` | Suno 17 |  |
| punchy | 16 | `▍` | Suno 16 |  |
| crisp hats | 14 | `▎` | Suno 14 |  |
| spacious | 14 | `▎` | Suno 14 |  |
| vinyl crackle | 12 | `▎` | Suno 8 · Studio 4 |  |
| king of glue disc | 11 | `▎` | Suno 11 |  |
| sound effects | 11 | `▎` | Suno 11 |  |
| high quality | 10 | `▎` | Suno 10 |  |
| scratch | 10 | `▎` | Suno 10 |  |
| side-chain breathing softly | 10 | `▎` | Suno 10 |  |
| sidechain pump | 10 | `▎` | Suno 10 |  |
| warm sub-bass | 10 | `▎` | Suno 10 |  |
| echo | 9 | `▎` | Suno 9 |  |
| huge reverberant space | 9 | `▎` | Album 9 |  |
| Crisp | 8 | `▎` | Suno 8 |  |
| dense voicings | 8 | `▎` | Suno 8 |  |
| everything analog and warm | 8 | `▎` | Suno 8 |  |
| live looping organic feel | 8 | `▎` | Suno 8 |  |
| Mix is warm | 8 | `▎` | Suno 8 |  |
| polished production | 8 | `▎` | Studio 6 · Suno 2 |  |
| reversed swells | 8 | `▎` | Suno 8 |  |
| sidechain pump gentle | 8 | `▎` | Suno 8 |  |
| tape hiss | 8 | `▎` | Suno 8 |  |
| warm vintage analog | 8 | `▎` | Suno 8 |  |
| rich textures | 7 | `` | Suno 7 |  |
| 1960s analog recording mono | 6 | `` | Suno 6 |  |
| and polished production | 6 | `` | Suno 6 |  |
| everything live and organic | 6 | `` | Suno 6 |  |
| heavy vinyl crackle | 6 | `` | Suno 6 |  |
| side-chain breathing | 6 | `` | Suno 6 |  |
| vinyl crackle heavy dust | 6 | `` | Suno 6 |  |
| vinyl warmth | 6 | `` | Suno 6 |  |
| warm analog recording | 6 | `` | Suno 6 |  |
| warm tape saturation | 6 | `` | Suno 6 |  |
| layered | 5 | `` | Studio 4 · Suno 1 |  |
| analog tape compression | 4 | `` | Suno 4 |  |
| big room | 4 | `` | Suno 4 |  |
| but layered with shuffled | 4 | `` | Suno 4 |  |
| cathedral reverb | 4 | `` | Suno 2 · Studio 2 |  |
| concert hall | 4 | `` | Studio 4 |  |
| Distorted | 4 | `` | Suno 2 · Studio 2 |  |
| heavy sidechain compression pumping | 4 | `` | Suno 4 |  |
| Hi Records production warmth | 4 | `` | Suno 4 |  |
| HI-FI | 4 | `` | Suno 4 |  |
| intimate analog recording | 4 | `` | Suno 4 |  |

## Form and pace

Tempo words, pace and form. 28 distinct words; the 28 most met:

| word | tracks | | from | met with |
|---|---:|---|---|---|
| fast pace | 282 | `████████████` | GTS 281 | no instruments, dry studio vocal, a cappella, female alto vocal |
| slow pace | 240 | `██████████▎` | GTS 240 | no instruments, dry studio vocal, a cappella, serene |
| slow | 182 | `███████▊` | Suno 91 · MTG 65 · Album 24 | deep reverb, slow rubato, singing bowls, Phrygian Dominant |
| moderate pace | 141 | `██████` | GTS 141 | no instruments, dry studio vocal, a cappella, female alto vocal |
| fast | 35 | `█▌` | MTG 20 · Suno 15 | hopeful, funk, guitar, acoustic guitar |
| slow tempo | 23 | `▉` | Suno 23 |  |
| 4/4 | 20 | `▊` | Suno 20 |  |
| chorus | 10 | `▍` | Suno 10 |  |
| fast tempo | 6 | `▎` | Suno 4 · Album 2 |  |
| intro | 6 | `▎` | Suno 6 |  |
| melody | 6 | `▎` | Suno 6 |  |
| crescendo | 5 | `▎` | Suno 3 · Studio 2 |  |
| medium tempo | 5 | `▎` | Suno 5 |  |
| a variable heartbeat tempo | 4 | `▎` | Studio 4 |  |
| outro | 4 | `▎` | Suno 4 |  |
| polyphony | 4 | `▎` | Suno 4 |  |
| moderate | 3 | `` | Album 2 · Suno 1 |  |
| up-tempo | 3 | `` | Suno 3 |  |
| 3/4 | 2 | `` | Suno 2 |  |
| call and response | 2 | `` | Studio 2 |  |
| drop | 2 | `` | Suno 2 |  |
| rubato | 2 | `` | Studio 2 |  |
| Staccato | 2 | `` | Suno 2 |  |
| syncopated | 2 | `` | Suno 2 |  |
| tempo lento | 2 | `` | Suno 2 |  |
| tempo NONE freeform | 2 | `` | Suno 2 |  |
| tempo NONE freeform floating | 2 | `` | Suno 2 |  |
| upbeat tempo | 2 | `` | Suno 2 |  |

## Key and harmony

The key as MTG-Jamendo measured it, and the modes and harmony the free style lines name. 59 distinct words; the 59 most met:

| word | tracks | | from | met with |
|---|---:|---|---|---|
| C major | 2,080 | `████████████` | MTG 2080 | piano, low energy, classical, easy listening |
| G major | 1,168 | `██████▊` | MTG 1167 | pop, low energy, restrained, pop folk |
| C minor | 966 | `█████▋` | MTG 957 | chill out, percussion, keyboard, bass |
| D major | 915 | `█████▎` | MTG 913 | low energy, bass, electric guitar, pop folk |
| E minor | 864 | `████▉` | MTG 860 | bass, harsh, guitar, drums |
| D minor | 840 | `████▊` | MTG 838 | bass, drums, 90 BPM, harsh |
| F major | 612 | `███▌` | MTG 610 | piano, low energy, solemn, classical |
| G minor | 513 | `██▉` | MTG 511 | bass, piano, hip hop, classical |
| E major | 503 | `██▉` | MTG 502 | drums, guitar, low energy, electric guitar |
| B minor | 374 | `██▎` | MTG 373 | bass, drums, harsh, electric guitar |
| F minor | 356 | `██` | MTG 356 | piano, bass, chill out, electronic production |
| Bb major | 314 | `█▊` | MTG 314 | piano, low energy, restrained, classical |
| Eb major | 314 | `█▊` | MTG 314 | low energy, piano, classical, solemn |
| Ab major | 266 | `█▌` | MTG 266 | piano, low energy, easy listening, pop |
| F# minor | 235 | `█▍` | MTG 235 | bass, harsh, drums, hip hop |
| Db major | 218 | `█▎` | MTG 218 | classical, piano, low energy, easy listening |
| C# minor | 215 | `█▎` | MTG 215 | hip hop, classical, 130 BPM, harsh |
| F# major | 207 | `█▎` | MTG 207 | indie, low energy, easy listening, solemn |
| G# minor | 198 | `█` | MTG 198 | euphoric, high energy, ecstatic, bass |
| B major | 191 | `█` | MTG 191 | pop folk, low energy, acoustic guitar, restrained |
| D# minor | 187 | `█` | MTG 187 | hip hop, Electronic, reggae, harsh |
| Bb minor | 173 | `▉` | MTG 173 | hip hop, playful, reggae, Electronic |
| Double Harmonic | 42 | `▎` | Album 42 | slow rubato, singing bowls, Phrygian Dominant, modal harmony |
| Harmonic Minor | 42 | `▎` | Album 42 | slow rubato, singing bowls, Phrygian Dominant, modal harmony |
| modal harmony | 42 | `▎` | Album 42 | slow rubato, singing bowls, Phrygian Dominant, Harmonic Minor |
| Phrygian Dominant | 42 | `▎` | Album 42 | slow rubato, singing bowls, modal harmony, Harmonic Minor |
| modal | 24 | `` | Album 24 |  |
| minor | 21 | `` | Album 19 · Suno 2 |  |
| add9 | 20 | `` | Suno 20 |  |
| minor9 | 20 | `` | Suno 20 |  |
| sus2) | 10 | `` | Suno 10 |  |
| 12-bar form | 8 | `` | Suno 8 |  |
| chord melody style | 8 | `` | Suno 8 |  |
| ii-V-I chord movement | 8 | `` | Suno 8 |  |
| jazzy chords (maj7 | 8 | `` | Suno 8 |  |
| minor key | 7 | `` | Suno 7 |  |
| modal improvisation | 7 | `` | Suno 7 |  |
| modal minor | 5 | `` | Album 5 |  |
| and modal interchange | 4 | `` | Suno 4 |  |
| chromatic passing tones | 4 | `` | Suno 4 |  |
| chromatic saturation | 4 | `` | Suno 4 |  |
| E-flat major | 4 | `` | Suno 4 |  |
| major third substitutions | 4 | `` | Suno 4 |  |
| minor musics finland | 3 | `` | FMA 3 |  |
| Arabic maqam music | 2 | `` | Studio 2 |  |
| arpeggiated minor bassline | 2 | `` | Suno 2 |  |
| atonal harmonic clusters | 2 | `` | Suno 2 |  |
| B-flat major | 2 | `` | Suno 2 |  |
| C minor 7 | 2 | `` | Suno 2 |  |
| D-flat major 7 | 2 | `` | Suno 2 |  |
| FAST PENTATONIC | 2 | `` | Suno 2 |  |
| ii-V-I progressions | 2 | `` | Suno 2 |  |
| minor blues form | 2 | `` | Suno 2 |  |
| Modal jazz | 2 | `` | Studio 2 |  |
| modal jazz fusion | 2 | `` | Suno 2 |  |
| pentatonic melody | 2 | `` | Studio 2 |  |
| Phrygian dominant cadence | 2 | `` | Studio 2 |  |
| sophisticated chromatic harmony | 2 | `` | Suno 2 |  |
| sus2/add9 | 2 | `` | Suno 2 |  |

## Tempo (BPM)

Beats per minute, always last in the line. 144 distinct words; the 50 most met:

| BPM | tracks | |
|---|---:|---|
| 30–39 | 4 | `` |
| 40–49 | 24 | `▎` |
| 50–59 | 75 | `▌` |
| 60–69 | 439 | `██▊` |
| 70–79 | 813 | `█████` |
| 80–89 | 1,837 | `███████████▍` |
| 90–99 | 2,092 | `████████████▉` |
| 100–109 | 1,833 | `███████████▍` |
| 110–119 | 1,836 | `███████████▍` |
| 120–129 | 2,587 | `████████████████` |
| 130–139 | 1,318 | `████████▎` |
| 140–149 | 693 | `████▍` |
| 150–159 | 317 | `█▉` |
| 160–169 | 276 | `█▋` |
| 170–179 | 104 | `▋` |
| 180–189 | 65 | `▍` |
| 190–199 | 10 | `` |
| 200–209 | 24 | `▎` |
| 240–249 | 5 | `` |

The values most written: 120 BPM (860), 90 BPM (757), 100 BPM (734), 119 BPM (602), 80 BPM (583), 130 BPM (462), 110 BPM (420), 124 BPM (367), 140 BPM (354), 128 BPM (334), 105 BPM (264), 94 BPM (242), 95 BPM (228), 121 BPM (191), 114 BPM (188), 85 BPM (184).

## Language

The language a song is sung in, first in the line. 28 distinct words; the 28 most met:

| word | tracks | | from | met with |
|---|---:|---|---|---|
| English | 5,116 | `████████████` | Suno 2831 · FMA 1495 · GTS 514 · Studio 276 | bitter, soothing, anguished, romantic |
| Spanish | 523 | `█▎` | Suno 384 · FMA 129 | tender, hopeful, bitter, commanding |
| Portuguese | 382 | `▉` | Suno 316 · FMA 66 | commanding, tender, hopeful, triumphant |
| French | 346 | `▊` | Suno 221 · FMA 125 | bitter, commanding, tender, bright |
| latin | 343 | `▊` | MTG 280 · FMA 51 | playful, Country, world, euphoric |
| russian | 238 | `▌` | GTS 148 · Suno 46 · Studio 24 · FMA 18 | female alto vocal, no instruments, dry studio vocal, a cappella |
| Italian | 167 | `▍` | Suno 151 · FMA 16 | commanding, tender, hopeful, romantic |
| Japanese | 126 | `▍` | Suno 124 | bright, hopeful, triumphant, sensual |
| German | 113 | `▎` | Suno 106 · FMA 7 | commanding, hopeful, triumphant, soothing |
| Chinese | 88 | `▎` | Suno 88 | romantic, tender, grateful, soothing |
| Korean | 79 | `▎` | Suno 69 · Studio 8 | romantic, bright, sensual, k-pop |
| Russian lyrics | 40 | `` | Studio 40 | commanding, triumphant, harsh, deep bass |
| Turkish | 37 | `` | FMA 36 | Middle East, International, playful, euphoric |
| irish | 19 | `` | FMA 18 · Suno 1 |  |
| Ukrainian | 19 | `` | Suno 11 · Studio 8 |  |
| Hebrew | 12 | `` | Studio 10 · FMA 2 |  |
| arabic | 9 | `` | Suno 8 · FMA 1 |  |
| Brazilian Portuguese | 8 | `` | Suno 8 |  |
| Greek | 8 | `` | Studio 8 |  |
| Dutch | 4 | `` | FMA 3 · Suno 1 |  |
| Spanish language | 4 | `` | Suno 4 |  |
| croatian | 3 | `` | FMA 3 |  |
| georgian | 3 | `` | FMA 2 · Suno 1 |  |
| Finnish | 2 | `` | FMA 2 |  |
| hindi | 2 | `` | Suno 2 |  |
| punjabi | 2 | `` | Suno 2 |  |
| slovak language | 2 | `` | Suno 2 |  |
| urdu | 2 | `` | Suno 2 |  |

## Leading words of our own loops

The duduk and shofar loops of the guard open their lines with the instrument's name. 2 distinct words; the 2 most met:

| word | tracks | | from | met with |
|---|---:|---|---|---|
| duduk | 49 | `████████████` | Album 47 | slow rubato, singing bowls, Phrygian Dominant, modal harmony |
| shofar | 9 | `██▎` | Album 9 |  |

## Free descriptions

Words from the free style lines that fit no list above. 1,114 distinct words; the 120 most met:

| word | tracks | | from | met with |
|---|---:|---|---|---|
| glissando | 46 | `████████████` | GTS 46 | no instruments, dry studio vocal, a cappella, female alto vocal |
| Close | 16 | `████▎` | Suno 16 |  |
| short 2 minute piece | 16 | `████▎` | Suno 16 |  |
| syncopated claps | 14 | `███▋` | Suno 14 |  |
| neo-soul | 12 | `███` | Suno 6 · Studio 6 |  |
| solo and in front | 12 | `███` | Studio 12 |  |
| kpop | 11 | `██▉` | Suno 11 |  |
| shevarim | 11 | `██▉` | Album 9 · Studio 2 |  |
| teruah | 11 | `██▉` | Album 9 · Studio 2 |  |
| chillstep | 10 | `██▋` | Suno 10 |  |
| Out | 10 | `██▋` | FMA 10 |  |
| sertanejo | 10 | `██▋` | Suno 10 |  |
| Mozart | 9 | `██▍` | Suno 9 |  |
| tekiah | 9 | `██▍` | Album 9 |  |
| 140 BPM half-time feel | 8 | `██` | Studio 8 |  |
| and human | 8 | `██` | Suno 8 |  |
| but add shuffling hats | 8 | `██` | Suno 8 |  |
| contrast | 8 | `██` | Suno 8 |  |
| cycle of fourths harmony | 8 | `██` | Suno 8 |  |
| dance-pop | 8 | `██` | Suno 6 · Studio 2 |  |
| folktronica | 8 | `██` | Suno 6 · Studio 2 |  |
| guitar-driven | 8 | `██` | Studio 6 · Suno 2 |  |
| shakers | 8 | `██` | Suno 8 |  |
| short stabs | 8 | `██` | Suno 8 |  |
| sideways | 8 | `██` | Suno 8 |  |
| sound | 8 | `██` | Suno 8 |  |
| storytelling | 8 | `██` | Suno 6 · Studio 2 |  |
| warm sunset vibes | 8 | `██` | Suno 8 |  |
| boom bap | 7 | `█▊` | Suno 5 · Studio 2 |  |
| cartoon | 7 | `█▊` | Suno 7 |  |
| complex | 7 | `█▊` | Suno 5 · Studio 2 |  |
| cyberpunk | 7 | `█▊` | Suno 7 |  |
| dangdut | 7 | `█▊` | Suno 7 |  |
| fast-paced | 7 | `█▊` | Suno 5 · Studio 2 |  |
| high-energy | 7 | `█▊` | Suno 7 |  |
| Hungarian text | 7 | `█▊` | Suno 7 |  |
| motown | 7 | `█▊` | Suno 7 |  |
| neurofunk | 7 | `█▊` | Suno 7 |  |
| Percussive | 7 | `█▊` | Suno 7 |  |
| rave | 7 | `█▊` | Suno 7 |  |
| repetitive | 7 | `█▊` | Suno 7 |  |
| simple | 7 | `█▊` | Suno 7 |  |
| theatrical | 7 | `█▊` | Studio 6 · Suno 1 |  |
| two chords | 7 | `█▊` | Suno 7 |  |
| 80's | 6 | `█▌` | Suno 6 |  |
| Add shuffled hats | 6 | `█▌` | Suno 6 |  |
| airy | 6 | `█▌` | Suno 6 |  |
| and detailed mixing | 6 | `█▌` | Suno 6 |  |
| base | 6 | `█▌` | Suno 6 |  |
| bridge) | 6 | `█▌` | Suno 6 |  |
| built around a bouncy | 6 | `█▌` | Suno 6 |  |
| creepy | 6 | `█▌` | Suno 6 |  |
| dembow | 6 | `█▌` | Suno 6 |  |
| desert | 6 | `█▌` | Studio 4 · Suno 2 |  |
| Elenco Records aesthetic | 6 | `█▌` | Suno 6 |  |
| folk-pop | 6 | `█▌` | Suno 6 |  |
| functional warehouse energy | 6 | `█▌` | Suno 6 |  |
| ghost claps | 6 | `█▌` | Suno 6 |  |
| ghost hits | 6 | `█▌` | Suno 6 |  |
| handclap accent | 6 | `█▌` | Suno 6 |  |
| hipnotics bassline | 6 | `█▌` | Suno 6 |  |
| Honky Tonk | 6 | `█▌` | Suno 6 |  |
| immersive | 6 | `█▌` | Suno 6 |  |
| instruments trading solos | 6 | `█▌` | Suno 6 |  |
| invertible counterpoint | 6 | `█▌` | Suno 6 |  |
| kawaii | 6 | `█▌` | Suno 6 |  |
| key of Bb minor | 6 | `█▌` | Suno 6 |  |
| late night headphone music | 6 | `█▌` | Suno 6 |  |
| longing | 6 | `█▌` | Suno 4 · Studio 2 |  |
| meditation | 6 | `█▌` | Suno 6 |  |
| merengue | 6 | `█▌` | Suno 6 |  |
| moog | 6 | `█▌` | Suno 6 |  |
| neon afterhours atmosphere | 6 | `█▌` | Suno 6 |  |
| no dominant melody | 6 | `█▌` | Suno 6 |  |
| no other instruments | 6 | `█▌` | Studio 6 |  |
| organic sounds | 6 | `█▌` | Suno 6 |  |
| psybass | 6 | `█▌` | Suno 6 |  |
| sarangi | 6 | `█▌` | Suno 6 |  |
| stretto entries | 6 | `█▌` | Suno 6 |  |
| Stripped down | 6 | `█▌` | Suno 6 |  |
| wave | 6 | `█▌` | Suno 6 |  |
| [Style | 5 | `█▍` | Suno 5 |  |
| Angola | 5 | `█▍` | Suno 5 |  |
| asmr | 5 | `█▍` | Suno 5 |  |
| chillsynth | 5 | `█▍` | Suno 5 |  |
| clapping | 5 | `█▍` | Suno 3 · Studio 2 |  |
| claps | 5 | `█▍` | Suno 5 |  |
| Eurobeat | 5 | `█▍` | Suno 5 |  |
| footwork | 5 | `█▍` | Suno 5 |  |
| guitars | 5 | `█▍` | Suno 3 · Studio 2 |  |
| healing | 5 | `█▍` | Suno 5 |  |
| mantra | 5 | `█▍` | Suno 5 |  |
| p-funk | 5 | `█▍` | Suno 5 |  |
| piano-driven | 5 | `█▍` | Studio 4 · Suno 1 |  |
| Ragtime | 5 | `█▍` | Suno 5 |  |
| ranchera | 5 | `█▍` | Suno 5 |  |
| 140 BPM half-time | 4 | `█` | Studio 4 |  |
| 1960 Atlantic Records sound | 4 | `█` | Suno 4 |  |
| 432hz | 4 | `█` | Suno 4 |  |
| 528hz | 4 | `█` | Suno 4 |  |
| 9ths 13ths altered dominants | 4 | `█` | Suno 4 |  |
| [Intro] | 4 | `█` | Suno 4 |  |
| a grand and mournful atmosphere | 4 | `█` | Studio 4 |  |
| a long fading resonance | 4 | `█` | Studio 4 |  |
| a variable shamanic heartbeat | 4 | `█` | Studio 4 |  |
| a village evening | 4 | `█` | Studio 4 |  |
| an ancestral weight | 4 | `█` | Studio 4 |  |
| an old song | 4 | `█` | Studio 4 |  |
| ancient crystalline stillness | 4 | `█` | Studio 4 |  |
| anti-folk | 4 | `█` | Suno 4 |  |
| arabesque | 4 | `█` | Suno 4 |  |
| augmented scale symmetry | 4 | `█` | Suno 4 |  |
| Bach cantata style | 4 | `█` | Suno 4 |  |
| baroque-pop | 4 | `█` | Studio 4 |  |
| Bolero | 4 | `█` | Suno 4 |  |
| bounce | 4 | `█` | Suno 4 |  |
| bounce drop | 4 | `█` | Suno 4 |  |
| bubblegum | 4 | `█` | Suno 4 |  |
| chillhop | 4 | `█` | Suno 4 |  |
| chromatic third root movement | 4 | `█` | Suno 4 |  |

## The scores

31,801 tracks carry their own score, transcribed by SheetSage2 into ABC notation: the plan YuE2's music half writes first in Full mode and then sings. Every score has two voices, **Vocal** (the sung melody, rests where nobody sings) and **Ins** (the lead instrument's line), with chord symbols over the bars; 11,052 of them have a sung melody. These are the keys of that plan.

| field | what it holds |
|---|---|
| `X:` `T:` | the tune's number and an empty title |
| `M:` | the meter; 21,678 scores change it inside (a bar of 1/4 or 2/4 at a phrase's end is common) |
| `L:` | the unit note: 1/16 in 22,326, 1/32 in 9,475 |
| `Q:` | the tempo as quarter notes a minute |
| `V:` | `Vocal` and `Ins` |
| `K:` | the key; 1,473 scores change it |
| `% intro` … | the section a passage belongs to |
| `"Am"` | a chord over the bar |

**Sections**, as the scores name them:

| section | scores | |
|---|---:|---|
| `% intro` | 29,454 | `████████████████` |
| `% interlude` | 20,809 | `███████████▍` |
| `% verse` | 20,763 | `███████████▎` |
| `% chorus` | 15,395 | `████████▍` |
| `% outro` | 14,123 | `███████▋` |
| `% silence` | 1,817 | `▉` |
| `% bridge` | 1,250 | `▋` |
| `% pre-chorus` | 932 | `▌` |

**Keys** (`K:`, the first of each score):

| key | scores | | key | scores | |
|---|---:|---|---|---:|---|
| Am | 3,512 | `██████████` | D#m | 1,050 | `██▉` |
| C | 2,939 | `████████▍` | F | 1,004 | `██▉` |
| Em | 2,543 | `███████▎` | C#m | 879 | `██▌` |
| Cm | 2,305 | `██████▌` | F#m | 851 | `██▍` |
| Dm | 2,229 | `██████▍` | A#m | 713 | `██` |
| G | 1,714 | `████▉` | Eb | 671 | `█▉` |
| D | 1,690 | `████▊` | B | 650 | `█▊` |
| Gm | 1,681 | `████▊` | Bb | 624 | `█▊` |
| Bm | 1,464 | `████▎` | G#m | 618 | `█▊` |
| A | 1,201 | `███▍` | C# | 426 | `█▎` |
| E | 1,140 | `███▎` | F# | 388 | `█` |
| Fm | 1,126 | `███▎` | Ab | 383 | `█` |

**Meters** (`M:`, at the start): 4/4 25,192, 2/4 4,241, 3/4 1,276, 6/8 975, 3/8 46, 1/4 29, 5/8 24, 2/8 12, 9/8 3, 4/8 2.

**Tempo** (`Q:1/4=`):

| quarter notes a minute | scores | |
|---|---:|---|
| 50–59 | 210 | `▋` |
| 60–69 | 2,067 | `█████▊` |
| 70–79 | 2,352 | `██████▌` |
| 80–89 | 3,507 | `█████████▊` |
| 90–99 | 5,751 | `████████████████` |
| 100–109 | 4,237 | `███████████▊` |
| 110–119 | 2,225 | `██████▎` |
| 120–129 | 5,720 | `███████████████▉` |
| 130–139 | 1,943 | `█████▍` |
| 140–149 | 1,757 | `████▉` |
| 150–159 | 482 | `█▍` |
| 160–169 | 298 | `▊` |
| 170–179 | 453 | `█▎` |
| 180–189 | 617 | `█▊` |
| 190–199 | 87 | `▎` |
| 200–209 | 46 | `` |

**Chords**: 3,936,804 chord symbols, 5.5 % of them over another bass (`"D/F#"`). The qualities, by the scores they appear in:

| written | chord | scores | |
|---|---|---:|---|
| `C` | major | 25,425 | `████████████████` |
| `Cm` | minor | 24,816 | `███████████████▋` |
| `Cm7` | minor 7th | 16,468 | `██████████▍` |
| `Cmaj7` | major 7th | 15,231 | `█████████▋` |
| `C6` | 6th | 10,213 | `██████▍` |
| `C7` | dominant 7th | 9,501 | `█████▉` |
| `C7sus4` | 7sus4 | 4,140 | `██▋` |
| `Csus4` | sus4 | 4,100 | `██▋` |
| `Csus2` | sus2 | 2,577 | `█▋` |
| `Cm7b5` | half-diminished | 2,447 | `█▌` |
| `Cm6` | minor 6th | 2,419 | `█▌` |
| `Cdim7` | diminished 7th | 1,535 | `▉` |
| `Caug` | augmented | 1,276 | `▊` |
| `Cdim` | diminished | 1,011 | `▋` |
| `Cm(maj7)` | minor-major 7th | 751 | `▌` |

The roots run through all twelve tones, sharps written as sharps (`C#`, `D#`, `F#`, `G#`, `A#`) and flats where the key has them.

## Writing a style for YuE2-RS-FW

- **Keep its order**: language or Instrumental, genre, instruments, mood and emotion words, key, BPM. The model read 32 thousand lines in that order.
- **Use its words**: `electric guitar`, not `shredding axe`; `female voice` or `female alto vocal`, as written above. A word met in hundreds of tracks lands; one met twice is a hint.
- **Emotion words are relative**: `melancholic` means sadder than most of the set, `ecstatic` more ecstatic. Two to four of them, as the data had, read better than eight.
- **Key and BPM are measured values**: `A minor, 92 BPM` is how MTG-Jamendo wrote it, and the model learned to keep them.
- **Speech and a cappella are in it too**: `spoken word, audiobook narration, calm clear reading, close-mic, dry studio, no music` and `a cappella, dry studio vocal, no instruments` were whole lines in the data.
- **Full mode plans first**: the score it writes uses the sections above (`intro`, `verse`, `chorus`, `bridge`, `pre-chorus`, `interlude`, `outro`), so a song's tags in the lyrics follow the same names.

---

Made from the First Wave's frozen set by Ruach Studio (heresy/MISC/claude-arc/fw-vocab: fw_vocab.py, render_md.py). The data's own credits and licences are on the [model card](https://huggingface.co/goldhub/YuE2-RS-Finetunes); this reference is CC BY-NC-SA 4.0 like the weights.
