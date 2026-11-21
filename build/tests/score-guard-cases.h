// score-guard-cases.h: real plans from the Studio's outputs for test-score-guard (HERESY 2830-2832), written by the kitchen's
// gen_cases.py, never by hand. The score and the floor of each as its request had them (no title, no lyrics); the length expected is
// the lab's abc_tools.py (HERESY 1145, a reader of its own) where it accepts the score, else the silent hole's lenient counter.
#pragma once

struct Yue2GuardCase {
    const char * what;       // what the case is
    const char * abc;        // the score
    int          floor;      // the music's floor its request asked (frames, 25 a second)
    double       seconds;    // its length at its own tempo (-1: no tempo written)
    int          floor_to;   // the floor after 2830 and 2897 (the same when not lowered)
    const char * broken;     // the guard's verdict on it as a plan the model wrote ("": whole; nullptr: supplied, never guarded)
    const char * warning;    // and what the take says of it, sung ("": nothing)
};

static const Yue2GuardCase YUE2_GUARD_CASES[] = {
    { "the 2509 window probe: asked 9:00 with a floor of 8:00, its plan 82 bars at 74 (4:25.9): the floor is lowered",
      R"YUE2CASE(X:1
T:
M:4/4
L:1/32
Q:1/4=74
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"
V: Ins clef=treble name="Ins Melody" snm="Inst."
K:Bm
% intro
V: Vocal
z24z4"Bm"z4|"Bm"z32|"Em"z32|"F#"z32|
V: Ins
Z|z8F4B2c2d8F8|G24d2e2c2B2|c12^A2B2c8E8|
V: Vocal
"Bm"z32|
V: Ins
F16B,2C2D4C2D2C4|
% verse
V: Vocal
"Bm"B,2C2D4D4C4B,4z12|"Em"E4E4E4E4z16|"F#7"E4E4E4D2F6z8E4|"Bm"F4F4F8z16|
V: Ins
Z4|
V: Vocal
"Bm"B,4D4D4C2C2B,2B,2z8B,4|"Em"G6F2F4E2E6z8D2D2|"F#7"C4C2C6B,2D2C4z8^A,4|"Bm"C4z2B,2B,4^A,2B,6z12|
V: Ins
Z4|
% chorus
V: Vocal
"Bm"d2d4d4c4c4B4B2B2F2G4|"Em"z32|"F#7"c2c4c6B2^A6F4F2E2F4|"Bm"z32|
V: Ins
Z|z8G8d8e6c2|Z|z16B,2C2D2E2C4B,4|
V: Vocal
"Bm"d2d4c2c4B2B4F4z2F2D2G4|"Em"z24z6C2|"F#7"C4C2C4D2E6D2z4C4B,4|"Bm"z32|
V: Ins
Z4|
% verse
V: Vocal
"Bm"D4D2C2D4C2C4B,4z4B,4B,2|"Em"G6F2F2F2E2E6z8E2D2|"F#7"E4D2E2D4F4z8z2E4D2|"Bm"F4F4F4E2D6z12|
V: Ins
Z4|
V: Vocal
"Bm"D2D2D2C2D4C2B,4z8B,2B,2B,2|"Em"G4F4z2F2E2E6z8E4|"F#7"E4E4E4F8z6C2C2C2|"Bm"C6B,2B,4B,8z12|
V: Ins
Z4|
% chorus
V: Vocal
"Bm"d2d4d4c4c4B4B2B2F2G4-|"Em"G4z24z4|"F#7"c2c4c6B2^A6F4F2E2F4-|"Bm"F4z24z4|
V: Ins
Z|z8G8d8e6B2|Z|z16B,2C2D2E2D2C2B,4|
V: Vocal
"Bm"d2d4c2c4B2B4F4z2F2D2G4|"Em"z32|"F#7"C4C2C4D2E6D6C4B,4|"Bm"z24z4F,4|
V: Ins
Z|z8G8d8e6E2|Z|z16B,2C2D2E2C2D2z4|
% verse
V: Vocal
"Bm"D4D4D4D4z16|"Em"G6F2F2E2E4z16|"F#7"E2E2E2D2E4F2F2z12z2B,2|"Bm"F4F4F2E2F4z16|
V: Ins
Z4|
V: Vocal
"Bm"B,4D2C2D4C2D6z8z2B,2|"Em"G4F2F4E2E4z12E2D2|"F#7"C4C4B,2B,2C4z16|"Bm"z4B,4D4B,4z16|
V: Ins
Z3|z16z4F,2B,2C2D2B,4|
V: Vocal
"Bm"D2C2D2C2D2D2C2C2B,4z8B,2B,2|"Em"G4F4z2F2E2E2E4z8E2D2|"F#7"E4D2E6D2F4z6E4D2F2-|"Bm"F4F4F2E2D4z16|
V: Ins
Z4|
V: Vocal
"Bm"D2C2D4D4C2C4z8B,2B,4|"Em"G6F2F2E2E4z12C4|"F#7"C4C2C4D2E4D2z8C2B,4|"Bm"C4B,4z2C2B,2B,6z12|
V: Ins
Z4|
% chorus
V: Vocal
"Bm"d2d4d4c4c4B4B2B2F2G4|"Em"z32|"F#7"c2c4c6B2^A6F4F2E2F4|"Bm"z32|
V: Ins
Z|z8G8d8e6c2|Z|z16z2C2D2E2C4F4|
V: Vocal
"Bm"d2d4c2c4B2B4F4z2F2D2G4|"Em"z32|"F#7"C4C2C4D2E6D4z2C4B,4|"Bm"z32|
V: Ins
Z|z8G8d8e6F,2|Z|z16z2C2D2E2C4C4|
% verse
V: Vocal
"Bm"D2C2D2C2z2D2C2C2B,4z8B,2B,2|"Em"G4F4z2F2E2E4z8z2D4|"F#7"E4D2E2D4F4z12D2D2|"Bm"F4F2F4E2D4z16|
V: Ins
Z4|
V: Vocal
"Bm"D2C2D4D4C4B,2z8B,2B,4|"Em"G4F4F2E2E8z8z2D2|"F#7"C6C2C4C4z12C2B,2|"Bm"C4C2C2C4B,4B,4z12|
V: Ins
Z4|
% chorus
V: Vocal
"Bm"d2d4d4c2c2B2B4F2F4D2G4|"Em"z32|"F#7"c2c4c6B2^A6F4F2E2F4|"Bm"z32|
V: Ins
Z|z8G8d8e6F2|Z|z16B,2C2D2E2C4F4|
V: Vocal
"Bm"d2d4c2c4B2B4F4z2F2D2G4|"Em"z32|"F#7"C4C2C4D2E6D6C4B,4|"Bm"z32|
V: Ins
Z|z8G8d8e6C2|Z|z16B,2C2D2E2C4F4|
% outro
V: Vocal
"Bm"D2C2D4z4D2C2D4z8B,2B,2|"Em"G4F4F2E2E4z16|"F#7"D4E4E4D4F2z12z2|"F#7"z16C4C4z4B,4|
V: Ins
Z4|
V: Vocal
"Bm"B,2z24z6|
V: Ins
Z|
)YUE2CASE",
      12000, 265.946, 6398, "", "" },   // abc_tools, 82 bars
    { "the same plan in free tempo (1416): its Q: line gone, its end not known: the floor left as asked",
      R"YUE2CASE(X:1
T:
M:4/4
L:1/32
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"
V: Ins clef=treble name="Ins Melody" snm="Inst."
K:Bm
% intro
V: Vocal
z24z4"Bm"z4|"Bm"z32|"Em"z32|"F#"z32|
V: Ins
Z|z8F4B2c2d8F8|G24d2e2c2B2|c12^A2B2c8E8|
V: Vocal
"Bm"z32|
V: Ins
F16B,2C2D4C2D2C4|
% verse
V: Vocal
"Bm"B,2C2D4D4C4B,4z12|"Em"E4E4E4E4z16|"F#7"E4E4E4D2F6z8E4|"Bm"F4F4F8z16|
V: Ins
Z4|
V: Vocal
"Bm"B,4D4D4C2C2B,2B,2z8B,4|"Em"G6F2F4E2E6z8D2D2|"F#7"C4C2C6B,2D2C4z8^A,4|"Bm"C4z2B,2B,4^A,2B,6z12|
V: Ins
Z4|
% chorus
V: Vocal
"Bm"d2d4d4c4c4B4B2B2F2G4|"Em"z32|"F#7"c2c4c6B2^A6F4F2E2F4|"Bm"z32|
V: Ins
Z|z8G8d8e6c2|Z|z16B,2C2D2E2C4B,4|
V: Vocal
"Bm"d2d4c2c4B2B4F4z2F2D2G4|"Em"z24z6C2|"F#7"C4C2C4D2E6D2z4C4B,4|"Bm"z32|
V: Ins
Z4|
% verse
V: Vocal
"Bm"D4D2C2D4C2C4B,4z4B,4B,2|"Em"G6F2F2F2E2E6z8E2D2|"F#7"E4D2E2D4F4z8z2E4D2|"Bm"F4F4F4E2D6z12|
V: Ins
Z4|
V: Vocal
"Bm"D2D2D2C2D4C2B,4z8B,2B,2B,2|"Em"G4F4z2F2E2E6z8E4|"F#7"E4E4E4F8z6C2C2C2|"Bm"C6B,2B,4B,8z12|
V: Ins
Z4|
% chorus
V: Vocal
"Bm"d2d4d4c4c4B4B2B2F2G4-|"Em"G4z24z4|"F#7"c2c4c6B2^A6F4F2E2F4-|"Bm"F4z24z4|
V: Ins
Z|z8G8d8e6B2|Z|z16B,2C2D2E2D2C2B,4|
V: Vocal
"Bm"d2d4c2c4B2B4F4z2F2D2G4|"Em"z32|"F#7"C4C2C4D2E6D6C4B,4|"Bm"z24z4F,4|
V: Ins
Z|z8G8d8e6E2|Z|z16B,2C2D2E2C2D2z4|
% verse
V: Vocal
"Bm"D4D4D4D4z16|"Em"G6F2F2E2E4z16|"F#7"E2E2E2D2E4F2F2z12z2B,2|"Bm"F4F4F2E2F4z16|
V: Ins
Z4|
V: Vocal
"Bm"B,4D2C2D4C2D6z8z2B,2|"Em"G4F2F4E2E4z12E2D2|"F#7"C4C4B,2B,2C4z16|"Bm"z4B,4D4B,4z16|
V: Ins
Z3|z16z4F,2B,2C2D2B,4|
V: Vocal
"Bm"D2C2D2C2D2D2C2C2B,4z8B,2B,2|"Em"G4F4z2F2E2E2E4z8E2D2|"F#7"E4D2E6D2F4z6E4D2F2-|"Bm"F4F4F2E2D4z16|
V: Ins
Z4|
V: Vocal
"Bm"D2C2D4D4C2C4z8B,2B,4|"Em"G6F2F2E2E4z12C4|"F#7"C4C2C4D2E4D2z8C2B,4|"Bm"C4B,4z2C2B,2B,6z12|
V: Ins
Z4|
% chorus
V: Vocal
"Bm"d2d4d4c4c4B4B2B2F2G4|"Em"z32|"F#7"c2c4c6B2^A6F4F2E2F4|"Bm"z32|
V: Ins
Z|z8G8d8e6c2|Z|z16z2C2D2E2C4F4|
V: Vocal
"Bm"d2d4c2c4B2B4F4z2F2D2G4|"Em"z32|"F#7"C4C2C4D2E6D4z2C4B,4|"Bm"z32|
V: Ins
Z|z8G8d8e6F,2|Z|z16z2C2D2E2C4C4|
% verse
V: Vocal
"Bm"D2C2D2C2z2D2C2C2B,4z8B,2B,2|"Em"G4F4z2F2E2E4z8z2D4|"F#7"E4D2E2D4F4z12D2D2|"Bm"F4F2F4E2D4z16|
V: Ins
Z4|
V: Vocal
"Bm"D2C2D4D4C4B,2z8B,2B,4|"Em"G4F4F2E2E8z8z2D2|"F#7"C6C2C4C4z12C2B,2|"Bm"C4C2C2C4B,4B,4z12|
V: Ins
Z4|
% chorus
V: Vocal
"Bm"d2d4d4c2c2B2B4F2F4D2G4|"Em"z32|"F#7"c2c4c6B2^A6F4F2E2F4|"Bm"z32|
V: Ins
Z|z8G8d8e6F2|Z|z16B,2C2D2E2C4F4|
V: Vocal
"Bm"d2d4c2c4B2B4F4z2F2D2G4|"Em"z32|"F#7"C4C2C4D2E6D6C4B,4|"Bm"z32|
V: Ins
Z|z8G8d8e6C2|Z|z16B,2C2D2E2C4F4|
% outro
V: Vocal
"Bm"D2C2D4z4D2C2D4z8B,2B,2|"Em"G4F4F2E2E4z16|"F#7"D4E4E4D4F2z12z2|"F#7"z16C4C4z4B,4|
V: Ins
Z4|
V: Vocal
"Bm"B,2z24z6|
V: Ins
Z|
)YUE2CASE",
      12000, -1.0, 12000, "", "" },   // no tempo, 82 bars
    { "a psalm planned at 2:42.6 and sung on to 5:00 with the default floor: nothing lowered, the ceiling not cut",
      R"YUE2CASE(X:1
T:
M:4/4
L:1/32
Q:1/4=62
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"
V: Ins clef=treble name="Ins Melody" snm="Inst."
K:Dm
% intro
V: Vocal
z12"A7"z16z4|"A7"z32|"A7"z32|"A7"z32|
V: Ins
Z|z4B4A4G4G4G4B4A2z2|z24B4^c4|d4e8g4e4z12|
V: Vocal
"A7"z24"Dm"z8|
V: Ins
z16B4A4G4z2F2|
% verse
V: Vocal
"Dm"z24"A#maj7/C##"z8|"A#maj7/C##"z32|"A#dim7"z8"Dm"z24|"Dm"z8F4z4"A#maj7"z16|
V: Ins
F16z12D4|D4D4E4D4C4C4C4B,4|A,16A4B4G4G4|E8z24|
V: Vocal
"A#maj7"z8D4D8C4"A#dim7"z8|"A#dim7"z16"A7"z8A,8-|"A7"A,16z16|
V: Ins
Z|z2B,2B,2B,2z8A,8z8|Z|
% interlude
V: Vocal
"Dm"z32|"A7"z32|"Dm"z32|"A7"z32|
V: Ins
D4D2E2F4F4G4F4E4D4|^C6D2C4B,4A,16|D4D2E2F4F4G4F4E4D4|^C6D2C4B,4A,16|
% verse
V: Vocal
"Dm"D8E4E4D4z8C4|"A#dim7"E8D4D2z2"A7"C2z12z2|"Dm"D8E4E4D2z12z2|"A#dim7"E8z8"A7"z16|
V: Ins
Z3|z8F4D4C8z8|
V: Vocal
"Dm"F8G4A8F2F2F4G4|"C"G4F2E2z16F4G2F2|"A#6"E4D4D4C2B,2"A#dim7"A,8z8|"A#dim7"z8"A#dim7"z8"A7"z16|
V: Ins
Z2|z24B,4C4|^C8D8C16|
V: Vocal
"Dm"F8G4A4A8z8|"Gm"B8c4B2z2"Dm"A8F4F4|"A#dim7"G8F4D4"A#dim7"C8z8|"A#dim7"z16"A#dim7"z8"A7"z8|
V: Ins
Z2|z24^C4D4|E8F8G6F2E4D4|
% chorus
V: Vocal
"Dm"D6E2F4F4G4F4E4D4|"A#dim7"E8D2^C6"A7"E8C2D6|"Dm"F4F2z24z2|"A#dim7"E16"A7"z16|
V: Ins
Z4|
V: Vocal
"Dm"D6E2F4F2z2G4F4E4D2z2|"A#dim7"E8D2^C6"A7"E8C2D6|"Dm"F16z16|"A#dim7"G8B4G4"A7"F4E4E8|
V: Ins
Z4|
% interlude
V: Vocal
"Dm"D8z24|"A7"z32|"A7"z32|"A7"z32|
V: Ins
z8A4A4B4G4G4F2F2|F4E2E2E16D2E2F2G2|B4A2A2A16G2A2B2^c2|B4A2A2A8z2G2A2B2A2G2F2E2|
V: Vocal
"Dm"z32|"Dm"z8z24|
V: Ins
D8D8D16|Z|
)YUE2CASE",
      750, 162.581, 750, "", "" },   // abc_tools, 42 bars
    { "a voice over a backing: a supplied score of chords and rests, the floor 1 s under its end: nothing lowered",
      R"YUE2CASE(X:1
T:
M:4/4
L:1/16
Q:1/4=114
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"
V: Ins clef=treble name="Ins Melody" snm="Inst."
K:Bm
% intro
V: Vocal
Z|"B"z16|"Bm"z16|"G"z16|
V: Ins
Z4|
V: Vocal
"G"z16|"Em"z16|"Em"z16|"F#"z16|
V: Ins
Z4|
V: Vocal
"F#"z16|
V: Ins
Z|
% verse
V: Vocal
"Bm"z16|"Bm"z16|"G"z16|"G"z16|
V: Ins
Z4|
V: Vocal
"Em"z16|"Em"z16|"F#"z16|"F#"z16|
V: Ins
Z4|
V: Vocal
"Bm"z16|"Bm"z16|"G"z16|"G"z16|
V: Ins
Z4|
% chorus
V: Vocal
"Em"z16|"Em"z16|Z|Z|
V: Ins
Z4|
V: Vocal
"Bm"z16|"Bm"z16|"G"z16|"G"z16|
V: Ins
Z4|)YUE2CASE",
      1475, 61.053, 1276, nullptr, nullptr },   // abc_tools, 29 bars
    { "an instrumental in 6/8: the Vocal line rests, the Ins line plays: whole",
      R"YUE2CASE(X:1
T:
M:6/8
L:1/32
Q:1/4=109
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"
V: Ins clef=treble name="Ins Melody" snm="Inst."
K:A
% intro
V: Vocal
z16z4"F#m"z4|"F#m"z24|"F#m"z24|"F#m"z24|
V: Ins
Z|F4A4A4C4F4C4|F4A4A4C4F4C4|F4A2c2f2g2a2b2a2a2a4-|
V: Vocal
"F#m"z24|"E6"z24|"E6"z24|"D"z24|
V: Ins
a4g8f8e4-|e8E2F2G2A2G2G2G4-|G16-G4z4|D,4A,2D2F2G2A4B2A6|
V: Vocal
"D"z24|"C#m7"z24|"C#m7"z24|"F#m"z24|
V: Ins
z8E2F2G4A2F6-|F8-F2z2E8C4-|C16-C4z4|F4A2c2f2g2a2b2a2a2a4-|
V: Vocal
"F#m"z24|"E6"z24|"E6"z24|"D"z24|
V: Ins
a8g8f8|e8E2F2G2A2G2G2G4-|G16-G4z4|z8F2G2A4B2A6-|
V: Vocal
"D"z24|"C#m7"z24|"C#m7"z12"C#"z12|"F#m"z24|
V: Ins
A6z2E2F2G4A2F6-|F8-F2z2E8C4-|C12z12|z8c4d8B4|
V: Vocal
"F#m"z24|"F#m"z24|"F#m"z24|"F#m"z24|
V: Ins
c12A12|z8c4d8B4|c12A12|z8c4d8B4|
V: Vocal
"F#m"z24|"F#m"z24|"F#m"z24|"F#m"z24|
V: Ins
c12A12|z8c4d8B4|c12A12|F8c4d8B4|
V: Vocal
"F#m"z24|"F#m"z24|"F#m"z24|"F#m"z24|
V: Ins
c12A12|F8c4d8B4|c12A12|F8c4d8B4|
V: Vocal
"F#m"z24|"F#m"z24|"F#m"z24|
V: Ins
c12A12|F8c4d8B4|c12A12|
% verse
V: Vocal
"F#m"z24|"F#m"z24|"E6"z24|"E6"z24|
V: Ins
F12A6A6|G6G6F6F6|E12F8E2C2|B,24|
V: Vocal
"Dmaj7"z24|"Dmaj7"z24|"C#m7"z24|"C#m7"z24|
V: Ins
z12A6A6|G6G6F6F6|E12F8E2F2|B24|
V: Vocal
"F#m"z24|"F#m"z24|"E6"z24|"E6"z24|
V: Ins
A12A6A6|G6G6F6F6|E12F8E2C2|B,24|
V: Vocal
"Dmaj7"z24|"Dmaj7"z24|"C#m7"z24|"C#m7"z12"C#7"z12|
V: Ins
z12A6A6|G6G6F6F6|E12F8E2C2|B,12^E,2E,2F,2G,2A,2B,2|
V: Vocal
"F#m"z24|"F#m"z24|"E6"z24|"E6"z24|
V: Ins
C8z2A6A4B4|G8z2A2G4E4F4|G8z2A2G4F6E2|F2G8A2G4E4F4|
V: Vocal
"Dmaj7"z24|"Dmaj7"z24|"C#m7"z24|"C#7"z24|
V: Ins
c16B4c4|d16e4d4|c8z2B2A8z2G2|^E8F2D2C12|
% interlude
V: Vocal
"F#m"z24|"F#m"z24|"E6"z24|"E6"z24|
V: Ins
A16B4A4|G12F12|E12F8E2C2|B,24|
V: Vocal
"Dmaj7"z24|"Dmaj7"z24|"C#m7"z24|"C#7"z24|
V: Ins
A16B4A4|G12F12|E12F8E2C2|B,24|
V: Vocal
"F#m"z24|"F#m"z24|"E6"z24|"E6"z24|
V: Ins
A16B4A4|G12F12|E12F8E2C2|B,24|
V: Vocal
"Dmaj7"z24|"Dmaj7"z24|"C#m7"z24|"C#7"z24|
V: Ins
A16B4A4|G12F12|E12F8E2C2|B,24|
V: Vocal
"F#m"z24|"F#m"z24|"E6"z24|"E6"z24|
V: Ins
F,2F,2A,2B,2C2D2E2F8-F2-|F6z2E2F2G4A4G4|F4E16-E4-|E12E8D2C2|
V: Vocal
"Dmaj7"z24|"Dmaj7"z24|"C#7"z24|"C#7"z24|
V: Ins
B,16B,4A,4|B,16B,4A,4|B,16z4A,2G,2|^E,8F,2D,2C,12|
V: Vocal
"F#m"z24|"F#m"z24|"E6"z24|"E6"z24|
V: Ins
F,2F,2A,2B,2C2D2E2F8-F2-|F6z2E2F2G4A4G4|F4E16-E4-|E12E8D2C2|
V: Vocal
"Dmaj7"z24|"Dmaj7"z24|"C#7"z24|"C#7"z24|
V: Ins
B,16B,4A,4|B,16B,4A,4|B,16z4A,2G,2|^E,8F,2D,2C,12|
V: Vocal
"C#"z24|"F#m"z24|"F#m"z24|"E6"z24|
V: Ins
z8C4D8B,4|C12A,12|z8C4D8B,4|C12A,12|
V: Vocal
"E6"z24|"Dmaj7"z24|"Dmaj7"z24|"C#m7"z24|
V: Ins
z8C4D8B,4|C12A,12|z8C4D8B,4|C12A,12|
V: Vocal
"C#m7"z16z4"F#m"z4|"F#m"z24|"F#m"z24|"E6"z24|
V: Ins
G,12E,12|z8C4D8B,4|C12A,12|z8C4D8B,4|
V: Vocal
"E6"z24|"Dmaj7"z24|"Dmaj7"z24|"C#m7"z24|
V: Ins
C12A,12|z8C4D8B,4|C12A,12|z8C4D8B,4|
V: Vocal
"C#m7"z24|"F#m"z24|"F#m"z24|"F#m"z24|
V: Ins
C12A,12|F,6A,6A6A6|G6G6F6F6|E8E4F8E2C2|
V: Vocal
"E6"z24|"Dmaj7"z24|"Dmaj7"z24|"Dmaj7"z4"C#7sus4"z16"C#7"z4|
V: Ins
B,24|z12A6A6|G6G6F8F4-|F4E16C2B,2|
V: Vocal
"C#7"z24|"F#m"z24|"F#m"z24|"E6"z24|
V: Ins
C12^E,2E,2F,2G,2A,2B,2|C8-C2A8A6|G12F12|E12F8E2C2|
V: Vocal
"E6"z24|"Dmaj7"z24|"Dmaj7"z24|"Dmaj7"z16"C#7sus4"z8|
V: Ins
B,24|A16B4A4|G12F12|E12F8E2C2|
V: Vocal
"C#7"z24|"C#7"z16"F#m"z8|"F#m"z24|"F#m"z24|
V: Ins
B,16z8|Z3|
)YUE2CASE",
      750, 209.725, 750, "", "" },   // abc_tools, 127 bars
    { "a flood of 198 characters (a 4.6B P1 plan): X:, M:, L:, newlines, no bar: sung, both said (2832, 2433's rule)",
      R"YUE2CASE(X:1
T:
M:4/4
L:1/16

V:
"



























































































z











"
f

z











 intro

b










f




























)YUE2CASE",
      750, -1.000, 750, "", "no key line in the score; no bar of the score holds a note" },   // no tempo, 0 bars
};
