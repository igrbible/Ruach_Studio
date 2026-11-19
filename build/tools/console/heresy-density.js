// HERESY 2693 (the plan after 2.0.8; Viktor's «yes» 06.11.2026 to D21: «Valkyrie's density gauges in the Creator (line, section, song…; no LLM)»;
// the Valkyrie report of 05–06.11): the lyrics' density against the usual of their genre, three gauges that only show and never change a word.
//   The line: its beats (the meter's own count, syllables and consonant beats) against p75 and p90 of a line of its section's type in the genre:
//   past p75 its number is amber, past p90 red; a dashed mark beside it stands at that p90.
//   The section: its beats per second over its estimated time against p75 and p90 of its type in the genre, a small gauge by its name.
//   The song: beats and words per second over the whole length against the genre's songs; under their p25 it says «much air», no alarm.
// The norm: a section's own tag first ([Rap] the rap's; [Spoken], [Narration], [Recitation] the reading's, inside any song), then the style's
// delivery word (rap, spoken word, ballad, choir, gospel), then its first genre word (a genre of under 30 lyrics takes its family's, the table
// says which), then its instruments (bouzouki → greek, oud → middle eastern, 808 → trap), else written lyrics as a whole. A section's time is
// the usual length of its type in the training set's sheets for that genre; together they are squeezed into the Musician's Max length when they
// would pass it, never stretched. A song with no section tags is taken a stanza (lines up to a blank line) a section.
// The numbers: heresy/MISC/claude-tc/valkyrie/density.json (05.11.2026, our training set, 17 599 tracks), made small by density_page.py.
(function () {
  "use strict";
  var N = {"made":"2026-11-05","g":{"rap · hip hop · trap":{"from":"rap · hip hop · trap","sw":[1.19,1.9,2.46],"sb":[1.61,2.51,3.27],"sa":[0.31,0.76],"s":{"verse":{"b":[2.41,3.57,5.38],"l":[9.0,11.0,14.0]},"pre-chorus":{"b":[2.63,3.42,4.64],"l":[10.0,13.0,15.0]},"chorus":{"b":[1.57,2.19,3.01],"l":[9.0,11.0,13.0]},"bridge":{"b":[2.1,2.66,3.37],"l":[8.0,10.0,12.0]},"outro":{"b":[1.61,2.32,3.13],"l":[9.0,11.0,12.8]}},"t":{"verse":41.94,"pre-chorus":12.8,"chorus":22.35,"bridge":20.76,"outro":27.22,"intro":18.82,"interlude":21.05,"silence":14.79}},"spoken · reading":{"from":"spoken · reading","sw":[1.39,1.62,1.78],"sb":[3.25,3.62,3.89],"sa":[2.59,2.91],"s":{"verse":{"b":[1.87,2.49,3.45],"l":[7.0,11.5,15.6]},"pre-chorus":{"b":[2.63,3.42,4.64],"l":[6.0,7.0,7.9]},"chorus":{"b":[1.26,1.72,2.35],"l":[7.0,9.0,12.0]},"bridge":{"b":[2.1,2.66,3.37],"l":[8.0,10.0,11.0]},"outro":{"b":[1.61,2.32,3.13],"l":[8.0,10.0,12.0]}},"t":{"verse":161.22,"chorus":11.17,"outro":22.86,"intro":306.09,"interlude":118.68,"silence":71.78}},"ballad":{"from":"ballad","sw":[0.98,1.23,1.66],"sb":[1.32,1.59,2.08],"sa":[0.92,1.09],"s":{"verse":{"b":[1.77,2.31,3.58],"l":[9.0,10.0,12.0]},"pre-chorus":{"b":[2.63,3.42,4.64],"l":[7.0,9.0,10.0]},"chorus":{"b":[1.37,1.87,2.33],"l":[9.0,10.0,12.0]},"bridge":{"b":[2.1,2.66,3.37],"l":[8.0,9.0,11.0]},"outro":{"b":[1.61,2.32,3.13],"l":[8.0,10.0,11.0]}},"t":{"verse":29.86,"pre-chorus":17.33,"chorus":24.0,"bridge":19.69,"outro":20.0,"intro":15.38,"interlude":13.68}},"gospel · worship":{"from":"gospel · worship","sw":[0.9,1.2,1.6],"sb":[1.34,1.73,2.31],"sa":[0.94,0.99],"s":{"verse":{"b":[1.87,2.49,3.45],"l":[9.0,11.0,13.0]},"pre-chorus":{"b":[2.63,3.42,4.64],"l":[8.0,10.0,12.0]},"chorus":{"b":[1.26,1.72,2.35],"l":[9.0,10.0,13.0]},"bridge":{"b":[2.1,2.66,3.37],"l":[8.0,9.0,10.1]},"outro":{"b":[1.61,2.32,3.13],"l":[8.0,10.0,12.0]}},"t":{"verse":30.0,"pre-chorus":15.24,"chorus":32.0,"bridge":20.19,"outro":25.0,"intro":17.96,"interlude":18.11}},"choir":{"from":"gospel · worship","sw":[0.9,1.2,1.6],"sb":[1.34,1.73,2.31],"sa":[0.94,0.99],"s":{"verse":{"b":[1.87,2.49,3.45],"l":[9.0,11.0,13.0]},"pre-chorus":{"b":[2.63,3.42,4.64],"l":[8.0,10.0,12.0]},"chorus":{"b":[1.26,1.72,2.35],"l":[9.0,10.0,13.0]},"bridge":{"b":[2.1,2.66,3.37],"l":[8.0,9.0,10.1]},"outro":{"b":[1.61,2.32,3.13],"l":[8.0,10.0,12.0]}},"t":{"verse":23.85,"chorus":23.71,"outro":18.5,"intro":15.76,"interlude":13.41}},"chanson · bard":{"from":"folk","sw":[0.87,1.19,1.49],"sb":[1.24,1.65,2.2],"sa":[0.77,0.95],"s":{"verse":{"b":[1.77,2.21,3.62],"l":[8.0,10.0,12.0]},"pre-chorus":{"b":[2.63,3.42,4.64],"l":[8.0,12.0,14.1]},"chorus":{"b":[1.41,1.78,2.38],"l":[8.0,10.0,12.0]},"bridge":{"b":[2.1,2.66,3.37],"l":[8.0,9.0,11.0]},"outro":{"b":[1.61,2.32,3.13],"l":[8.0,10.0,10.0]}},"t":{"verse":19.8,"chorus":20.43,"intro":10.21}},"folk":{"from":"folk","sw":[0.87,1.19,1.49],"sb":[1.24,1.65,2.2],"sa":[0.77,0.95],"s":{"verse":{"b":[1.77,2.21,3.62],"l":[8.0,10.0,12.0]},"pre-chorus":{"b":[2.63,3.42,4.64],"l":[8.0,12.0,14.1]},"chorus":{"b":[1.41,1.78,2.38],"l":[8.0,10.0,12.0]},"bridge":{"b":[2.1,2.66,3.37],"l":[8.0,9.0,11.0]},"outro":{"b":[1.61,2.32,3.13],"l":[8.0,10.0,10.0]}},"t":{"verse":33.72,"pre-chorus":16.99,"chorus":24.27,"bridge":20.53,"outro":24.0,"intro":16.74,"interlude":18.82,"silence":15.05}},"world · ethnic · traditional":{"from":"world · ethnic · traditional","sw":[0.88,1.18,1.6],"sb":[1.43,1.86,2.4],"sa":[0.9,1.08],"s":{"verse":{"b":[2.05,2.61,3.14],"l":[8.0,10.0,12.0]},"pre-chorus":{"b":[2.63,3.42,4.64],"l":[8.0,10.0,12.0]},"chorus":{"b":[1.53,2.17,2.87],"l":[8.0,10.0,12.0]},"bridge":{"b":[2.1,2.66,3.37],"l":[8.0,10.0,11.0]},"outro":{"b":[1.61,2.32,3.13],"l":[8.0,11.0,13.0]}},"t":{"verse":31.34,"chorus":21.25,"outro":23.5,"intro":17.52,"interlude":18.86,"silence":32.26}},"middle eastern":{"from":"middle eastern","sw":[0.81,1.09,1.65],"sb":[1.31,1.78,2.21],"sa":[0.42,0.86],"s":{"verse":{"b":[1.87,2.49,3.45],"l":[9.0,11.0,12.0]},"pre-chorus":{"b":[2.63,3.42,4.64],"l":[8.0,10.0,12.0]},"chorus":{"b":[1.26,1.72,2.35],"l":[9.0,11.0,13.0]},"bridge":{"b":[2.1,2.66,3.37],"l":[8.0,9.25,11.9]},"outro":{"b":[1.61,2.32,3.13],"l":[8.0,10.0,12.0]}},"t":{"verse":26.3,"chorus":19.39,"outro":21.55,"intro":17.48,"interlude":17.49}},"greek":{"from":"world · ethnic · traditional","sw":[0.88,1.18,1.6],"sb":[1.43,1.86,2.4],"sa":[0.9,1.08],"s":{"verse":{"b":[2.05,2.61,3.14],"l":[8.0,10.0,12.0]},"pre-chorus":{"b":[2.63,3.42,4.64],"l":[8.0,10.0,12.0]},"chorus":{"b":[1.53,2.17,2.87],"l":[8.0,10.0,12.0]},"bridge":{"b":[2.1,2.66,3.37],"l":[8.0,10.0,11.0]},"outro":{"b":[1.61,2.32,3.13],"l":[8.0,11.0,13.0]}},"t":{"verse":29.17,"chorus":26.3,"outro":24.0,"intro":23.87,"interlude":22.37}},"cinematic · orchestral":{"from":"cinematic · orchestral","sw":[1.0,1.31,1.75],"sb":[1.34,1.81,2.27],"sa":[0.93,1.12],"s":{"verse":{"b":[2.0,2.5,4.98],"l":[9.0,11.0,14.0]},"pre-chorus":{"b":[2.63,3.42,4.64],"l":[8.0,10.0,12.0]},"chorus":{"b":[1.32,1.78,2.47],"l":[9.0,11.0,12.0]},"bridge":{"b":[2.1,2.66,3.37],"l":[8.5,10.0,12.0]},"outro":{"b":[1.61,2.32,3.13],"l":[8.0,10.0,12.0]}},"t":{"verse":27.35,"chorus":23.28,"outro":22.56,"intro":19.51,"interlude":19.02}},"pop":{"from":"pop","sw":[0.92,1.22,1.59],"sb":[1.33,1.69,2.19],"sa":[0.89,1.08],"s":{"verse":{"b":[1.87,2.54,3.56],"l":[8.0,10.0,12.0]},"pre-chorus":{"b":[2.63,3.42,4.64],"l":[8.0,9.25,11.0]},"chorus":{"b":[1.24,1.61,2.22],"l":[8.0,10.0,12.0]},"bridge":{"b":[2.07,2.55,3.26],"l":[8.0,10.0,11.0]},"outro":{"b":[1.68,2.29,3.69],"l":[8.0,10.0,12.0]}},"t":{"verse":28.03,"pre-chorus":15.12,"chorus":23.04,"bridge":17.84,"outro":22.57,"intro":13.71,"interlude":16.22,"silence":15.35}},"rock":{"from":"rock","sw":[0.96,1.26,1.75],"sb":[1.29,1.76,2.19],"sa":[0.83,1.02],"s":{"verse":{"b":[1.72,2.68,3.89],"l":[8.0,10.0,12.0]},"pre-chorus":{"b":[2.63,3.42,4.64],"l":[8.0,10.0,12.0]},"chorus":{"b":[1.31,1.62,2.33],"l":[8.0,10.0,12.0]},"bridge":{"b":[2.1,2.66,3.37],"l":[8.0,9.0,10.0]},"outro":{"b":[1.61,2.32,3.13],"l":[8.0,9.0,11.8]}},"t":{"verse":29.76,"pre-chorus":15.24,"chorus":24.39,"bridge":18.55,"outro":26.18,"intro":17.56,"interlude":19.36,"silence":18.72}},"punk":{"from":"rock","sw":[0.96,1.26,1.75],"sb":[1.29,1.76,2.19],"sa":[0.83,1.02],"s":{"verse":{"b":[1.72,2.68,3.89],"l":[8.0,10.0,12.0]},"pre-chorus":{"b":[2.63,3.42,4.64],"l":[8.0,10.0,12.0]},"chorus":{"b":[1.31,1.62,2.33],"l":[8.0,10.0,12.0]},"bridge":{"b":[2.1,2.66,3.37],"l":[8.0,9.0,10.0]},"outro":{"b":[1.61,2.32,3.13],"l":[8.0,9.0,11.8]}},"t":{"verse":26.21,"chorus":20.34,"bridge":18.82,"outro":22.56,"intro":16.86,"interlude":19.84,"silence":26.82}},"metal":{"from":"rock","sw":[0.96,1.26,1.75],"sb":[1.29,1.76,2.19],"sa":[0.83,1.02],"s":{"verse":{"b":[1.72,2.68,3.89],"l":[8.0,10.0,12.0]},"pre-chorus":{"b":[2.63,3.42,4.64],"l":[8.0,10.0,12.0]},"chorus":{"b":[1.31,1.62,2.33],"l":[8.0,10.0,12.0]},"bridge":{"b":[2.1,2.66,3.37],"l":[8.0,9.0,10.0]},"outro":{"b":[1.61,2.32,3.13],"l":[8.0,9.0,11.8]}},"t":{"verse":19.73,"chorus":13.33,"outro":17.87,"intro":16.44,"interlude":19.73}},"electronic":{"from":"electronic","sw":[0.89,1.18,1.57],"sb":[1.26,1.62,2.07],"sa":[0.76,1.01],"s":{"verse":{"b":[1.84,2.4,3.31],"l":[8.0,10.0,12.0]},"pre-chorus":{"b":[2.63,3.42,4.64],"l":[7.0,9.0,10.0]},"chorus":{"b":[1.19,1.67,2.3],"l":[8.0,9.0,11.0]},"bridge":{"b":[2.0,2.38,3.14],"l":[8.0,9.0,11.0]},"outro":{"b":[1.72,2.51,3.87],"l":[7.0,9.0,11.0]}},"t":{"verse":29.32,"pre-chorus":14.77,"chorus":23.41,"bridge":17.42,"outro":23.44,"intro":20.0,"interlude":20.0,"silence":14.72}},"r&b · soul · funk":{"from":"r&b · soul · funk","sw":[0.96,1.33,1.75],"sb":[1.31,1.69,2.35],"sa":[0.82,1.03],"s":{"verse":{"b":[1.9,2.77,3.93],"l":[8.0,10.0,12.0]},"pre-chorus":{"b":[2.63,3.42,4.64],"l":[8.0,10.0,11.0]},"chorus":{"b":[1.25,1.84,2.81],"l":[8.0,10.0,12.0]},"bridge":{"b":[2.1,2.66,3.37],"l":[8.0,9.0,11.0]},"outro":{"b":[1.61,2.32,3.13],"l":[8.0,10.25,12.0]}},"t":{"verse":29.07,"pre-chorus":13.66,"chorus":22.0,"bridge":17.71,"outro":21.09,"intro":13.64,"interlude":17.11,"silence":12.32}},"reggae · latin":{"from":"reggae · latin","sw":[0.94,1.24,1.71],"sb":[1.46,2.02,2.79],"sa":[0.82,1.11],"s":{"verse":{"b":[2.17,2.89,5.12],"l":[9.0,11.0,13.0]},"pre-chorus":{"b":[2.63,3.42,4.64],"l":[8.0,10.0,14.0]},"chorus":{"b":[1.46,2.08,2.96],"l":[9.0,11.0,13.0]},"bridge":{"b":[2.1,2.66,3.37],"l":[9.0,11.0,13.0]},"outro":{"b":[1.61,2.32,3.13],"l":[9.0,12.0,13.0]}},"t":{"verse":23.7,"pre-chorus":15.36,"chorus":21.18,"bridge":17.7,"outro":20.24,"intro":13.5,"interlude":15.23,"silence":21.96}},"jazz":{"from":"jazz","sw":[0.92,1.18,1.56],"sb":[1.25,1.61,2.04],"sa":[0.81,1.02],"s":{"verse":{"b":[1.83,2.38,3.14],"l":[9.0,10.0,12.0]},"pre-chorus":{"b":[2.63,3.42,4.64],"l":[8.0,9.0,11.0]},"chorus":{"b":[1.52,1.97,2.55],"l":[8.0,10.0,11.0]},"bridge":{"b":[2.1,2.66,3.37],"l":[8.5,10.0,11.0]},"outro":{"b":[1.61,2.32,3.13],"l":[7.0,9.0,12.0]}},"t":{"verse":26.7,"pre-chorus":15.0,"chorus":20.31,"bridge":18.29,"outro":22.57,"intro":13.19,"interlude":17.79,"silence":33.93}},"blues":{"from":"blues","sw":[0.91,1.2,1.51],"sb":[1.22,1.57,2.08],"sa":[0.81,1.0],"s":{"verse":{"b":[1.6,2.27,3.09],"l":[7.0,9.0,11.0]},"pre-chorus":{"b":[2.63,3.42,4.64],"l":[8.0,10.0,12.0]},"chorus":{"b":[1.3,1.71,2.91],"l":[8.0,9.0,11.0]},"bridge":{"b":[2.1,2.66,3.37],"l":[7.0,8.0,11.0]},"outro":{"b":[1.61,2.32,3.13],"l":[5.0,8.0,10.0]}},"t":{"verse":35.56,"chorus":22.77,"outro":21.08,"intro":12.9,"interlude":20.11,"silence":13.33}},"country":{"from":"country","sw":[1.02,1.19,1.47],"sb":[1.29,1.49,1.76],"sa":[0.98,1.11],"s":{"verse":{"b":[1.9,2.33,3.1],"l":[9.0,10.0,12.0]},"pre-chorus":{"b":[2.63,3.42,4.64],"l":[6.0,9.25,10.0]},"chorus":{"b":[1.2,1.53,2.03],"l":[9.0,10.0,11.0]},"bridge":{"b":[2.1,2.66,3.37],"l":[8.0,10.0,12.0]},"outro":{"b":[1.61,2.32,3.13],"l":[8.0,10.0,12.0]}},"t":{"verse":27.23,"pre-chorus":14.93,"chorus":22.39,"bridge":19.16,"outro":21.27,"intro":12.64,"interlude":16.61,"silence":11.59}},"singer-songwriter":{"from":"folk","sw":[0.87,1.19,1.49],"sb":[1.24,1.65,2.2],"sa":[0.77,0.95],"s":{"verse":{"b":[1.77,2.21,3.62],"l":[8.0,10.0,12.0]},"pre-chorus":{"b":[2.63,3.42,4.64],"l":[8.0,12.0,14.1]},"chorus":{"b":[1.41,1.78,2.38],"l":[8.0,10.0,12.0]},"bridge":{"b":[2.1,2.66,3.37],"l":[8.0,9.0,11.0]},"outro":{"b":[1.61,2.32,3.13],"l":[8.0,10.0,10.0]}},"t":{"verse":32.62,"pre-chorus":13.07,"chorus":26.4,"bridge":21.11,"outro":23.41,"intro":17.01,"interlude":18.82,"silence":23.41}},"ambient · lo-fi":{"from":"ambient · lo-fi","sw":[0.87,1.21,1.79],"sb":[1.24,1.58,2.17],"sa":[0.83,1.01],"s":{"verse":{"b":[1.8,2.38,3.52],"l":[8.0,9.0,11.0]},"pre-chorus":{"b":[2.63,3.42,4.64],"l":[8.0,10.0,11.0]},"chorus":{"b":[1.33,1.76,2.92],"l":[8.0,9.0,11.0]},"bridge":{"b":[2.1,2.66,3.37],"l":[8.0,10.0,11.0]},"outro":{"b":[1.61,2.32,3.13],"l":[8.0,10.0,11.0]}},"t":{"verse":30.26,"pre-chorus":17.14,"chorus":22.86,"bridge":17.61,"outro":24.0,"intro":18.38,"interlude":18.88,"silence":15.48}},"experimental · avant-garde":{"from":"experimental · avant-garde","sw":[0.97,1.53,2.01],"sb":[1.35,2.02,2.71],"sa":[0.95,1.11],"s":{"verse":{"b":[1.87,2.49,3.45],"l":[8.0,10.0,12.8]},"pre-chorus":{"b":[2.63,3.42,4.64],"l":[8.0,10.0,12.0]},"chorus":{"b":[1.26,1.72,2.35],"l":[8.0,9.0,10.0]},"bridge":{"b":[2.1,2.66,3.37],"l":[8.0,10.0,11.1]},"outro":{"b":[1.61,2.32,3.13],"l":[8.0,10.0,12.0]}},"t":{"verse":37.18,"chorus":24.0,"bridge":21.55,"outro":28.55,"intro":21.64,"interlude":25.26,"silence":24.0}},"mediterranean":{"from":"world · ethnic · traditional","sw":[0.88,1.18,1.6],"sb":[1.43,1.86,2.4],"sa":[0.9,1.08],"s":{"verse":{"b":[2.05,2.61,3.14],"l":[8.0,10.0,12.0]},"pre-chorus":{"b":[2.63,3.42,4.64],"l":[8.0,10.0,12.0]},"chorus":{"b":[1.53,2.17,2.87],"l":[8.0,10.0,12.0]},"bridge":{"b":[2.1,2.66,3.37],"l":[8.0,10.0,11.0]},"outro":{"b":[1.61,2.32,3.13],"l":[8.0,11.0,13.0]}},"t":{"verse":31.34,"chorus":21.25,"outro":23.5,"intro":17.52,"interlude":18.86,"silence":32.26}}},"all":{"from":"","sw":[0.91,1.2,1.56],"sb":[1.29,1.66,2.13],"sa":[0.81,1.03],"s":{"verse":{"b":[1.87,2.49,3.45],"l":[8.0,10.0,12.0]},"pre-chorus":{"b":[2.63,3.42,4.64],"l":[8.0,10.0,12.0]},"chorus":{"b":[1.26,1.72,2.35],"l":[8.0,10.0,12.0]},"bridge":{"b":[2.1,2.66,3.37],"l":[8.0,10.0,11.0]},"outro":{"b":[1.61,2.32,3.13],"l":[8.0,10.0,12.0]}},"t":{"verse":32.11,"pre-chorus":14.79,"chorus":24.0,"bridge":18.46,"outro":23.78,"intro":18.0,"interlude":19.2,"silence":16.47}},"words":{"ballad":"\\bballad","rap · hip hop · trap":"\\b(rap|rapper|rapping|hip[- ]?hop|trap|drill|grime|boom[- ]?bap)\\b","pop":"\\bpop\\b","rock":"\\brock\\b","punk":"\\bpunk","metal":"\\bmetal","folk":"\\bfolk","singer-songwriter":"singer[- ]?songwriter","gospel · worship":"\\b(gospel|worship|christian|hymns?|praise|messianic|spiritual)\\b","cinematic · orchestral":"\\b(cinematic|soundtrack|orchestra\\w*|epic|film score)\\b","choir":"\\b(choir|choral)\\b","chanson · bard":"\\b(chanson|bard)\\b","world · ethnic · traditional":"\\b(world|ethnic|traditional|international|balkan|klezmer|flamenco|oriental|celtic|tribal)\\b","mediterranean":"\\bmediterranean","greek":"\\b(greek|nisiotiko|rebetiko|laiko|dimotiko|entechno|aegean|ionian|cretan|pontic|epirus|bouzouki|laouto|santouri)\\b","middle eastern":"\\b(middle[- ]eastern|arabic|arabian|persian|turkish|maqam|mizrahi|sephardic|levant\\w*|oud|darbuka|qanun|ney|duduk|armenian)\\b","electronic":"\\b(electronic|electro|edm|techno|house|dance|synth\\w*|dubstep|drum and bass|idm)\\b","jazz":"\\bjazz","blues":"\\bblues","country":"\\b(country|americana|bluegrass)\\b","r&b · soul · funk":"(r&b|\\brnb\\b|\\bsoul\\b|\\bfunk)","reggae · latin":"\\b(reggae|reggaeton|latin|bossa|samba|salsa|bachata|cumbia|tango)\\b","experimental · avant-garde":"\\b(experimental|avant[- ]garde|noise)\\b","ambient · lo-fi":"\\b(ambient|lo-?fi|chill\\w*)\\b","spoken · reading":"\\b(spoken word|narration|audiobook|bible reading|poetry|spoken)\\b"},"family":{"mediterranean":"world · ethnic · traditional","greek":"world · ethnic · traditional","middle eastern":"world · ethnic · traditional","world · ethnic · traditional":"folk","chanson · bard":"folk","singer-songwriter":"folk","choir":"gospel · worship","punk":"rock","metal":"rock"},"inst":{"greek":"laouto|santouri|bouzouki|baglamas|tambouras|lyra|klarino|tsampouna|floghera|kanonaki|zournas","middle eastern":"oud|darbuka|ney|duduk|qanun|kanun|daf|riq|saz|kamancheh|santur|zurna","rap · hip hop · trap":"808|hi-?hats?|rapper|bars|flow"}};
  var TAG = /\[[^\]\n]*\]/g;
  var DELIVERY = [
    [/\b(rap|rapper|rapping|hip[- ]?hop|trap|drill)\b/i, "rap · hip hop · trap"],
    [/\b(spoken[- ]word|narration|narrated|recitation|audiobook|bible reading)\b/i, "spoken · reading"],
    [/\bballad/i, "ballad"],
    [/\b(chant|choir|choral)\b/i, "choir"],
    [/\b(gospel|worship|hymns?)\b/i, "gospel · worship"]
  ];
  var RAP = /\b(rap|rapping|rapped)\b|(^|[^а-яё])(рэп|реп)/i;
  var SPOKEN = /\b(spoken|narration|recitation|recited)\b|(^|[^а-яё])(речитатив|декламац|чтение)/i;
  var PAUSE = { intro: 1, interlude: 1, "break": 1, pause: 1, drop: 1, solo: 1, instrumental: 1 };

  // the song's norm from its style line: { genre, word, by: "word" | "instrument" | "none" }
  function pick(style) {
    var s = String(style || ""), best = null;
    DELIVERY.forEach(function (d) {
      var m = d[0].exec(s);
      if (m && N.g[d[1]] && (!best || m.index < best.at)) best = { genre: d[1], at: m.index, word: m[0], by: "word" };
    });
    if (best) return best;
    Object.keys(N.words).forEach(function (g) {
      var m = new RegExp(N.words[g], "i").exec(s);
      if (m && N.g[g] && (!best || m.index < best.at)) best = { genre: g, at: m.index, word: m[0], by: "word" };
    });
    if (best) return best;
    Object.keys(N.inst).forEach(function (g) {
      var m = new RegExp("\\b(" + N.inst[g] + ")", "i").exec(s);
      if (m && N.g[g] && (!best || m.index < best.at)) best = { genre: g, at: m.index, word: m[0], by: "instrument" };
    });
    return best || { genre: "", word: "", by: "none" };
  }
  function norm(genre) { return N.g[genre] || N.all; }
  // the gauge's section type: verse and bridge apart (the meter weighs them as one group), the chorus with its post-chorus
  function typeOf(name, g) {
    if (g === "verse + bridge") return /\bbridge\b|^\s*(бридж|мост|міст|桥段)/i.test(name) ? "bridge" : "verse";
    if (g === "chorus" || g === "post-chorus") return "chorus";
    if (g === "pre-chorus" || g === "outro") return g;
    return "verse";   // an intro's words, a section by a name of its own ([Rap], [Hook] is the chorus already)
  }
  function timeOf(name, g) {   // the sheets' type that gives its usual seconds
    if (g === "intro" || g === "outro" || g === "pre-chorus") return g;
    if (g === "pause") return "silence";
    if (PAUSE[g]) return "interlude";
    return typeOf(name, g);
  }
  function level(v, band) { return v > band[2] ? "red" : v > band[1] ? "amber" : "ok"; }

  // text, the style line, the Musician's Max length (seconds, 0 when none), the meter's measure() of the same text
  function gauge(text, style, lengthSec, m) {
    var L = window.HeresyLyrics;
    if (!L || !N || !N.all) return null;
    m = m || L.measure(String(text || ""));
    var lines = String(text || "").split("\n"), p = pick(style), items = [], cur = null, pend = null, words = 0, beats = 0;
    function ovOf(name) { return RAP.test(name) ? "rap · hip hop · trap" : SPOKEN.test(name) ? "spoken · reading" : null; }
    function open(names, i) {
      names.forEach(function (name) {
        var g = L.groupOf(name), ov = ovOf(name);
        if (g === null) { if (ov) { if (cur && cur.sung) cur.ov = ov; else pend = ov; } return; }
        if (PAUSE[g]) {
          var it = { line: i, type: "verse", time: timeOf(name, g), sung: false, name: name, beats: 0, words: 0, rows: [] };
          items.push(it);
          if (!cur) cur = it;                         // before the first sung section an intro's own lines are its own
          return;
        }
        cur = { line: i, type: typeOf(name, g), time: timeOf(name, g), sung: true, name: name, beats: 0, words: 0, rows: [], ov: ov || pend };
        pend = null;
        items.push(cur);
      });
    }
    lines.forEach(function (line, i) {
      var row = m.rows[i] || {}, found = line.match(TAG) || [], rest = line.replace(TAG, " ");
      var lead = line.match(/^\s*(?:\[[^\]\n]*\]\s*)+/), names = lead ? (lead[0].match(TAG) || []).map(function (t) { return t.slice(1, -1); }) : [];
      if (found.length && !rest.trim()) { open(names, i); return; }
      if (!rest.trim()) { if (cur && cur.implicit && cur.rows.length) cur = null; return; }   // a blank line closes a stanza of an untagged song
      if (names.length) open(names, i);
      if (row.tag || row.empty || !row.syl) return;
      if (!cur) { cur = { line: i, type: "verse", time: "verse", sung: true, name: "", beats: 0, words: 0, rows: [], ov: pend, implicit: true }; pend = null; items.push(cur); }
      var w = (rest.replace(/\([^)]*\)/g, " ").match(/[\p{L}\p{M}́'’-]+/gu) || []).filter(function (x) { return /\p{L}/u.test(x); }).length;
      cur.beats += row.syl; cur.words += w; cur.rows.push(i);
      beats += row.syl; words += w;
    });
    if (!beats) return null;
    var ng = norm(p.genre), T = 0;
    items.forEach(function (it) { it.sec0 = ng.t[it.time] || N.all.t[it.time] || N.all.t.verse; T += it.sec0; });
    var k = lengthSec > 0 && T > lengthSec ? lengthSec / T : 1;
    var song = { beats: beats, words: words, sec: T * k, squeezed: k < 1 };
    song.bps = beats / song.sec; song.wps = words / song.sec;
    song.lvl = song.bps > ng.sb[2] ? "red" : song.bps > ng.sb[1] ? "amber" : (ng.sa && song.bps < ng.sa[1]) ? "air" : "ok";
    song.band = ng.sb;
    var sections = [], lineLv = {}, heads = {};
    items.forEach(function (it) {
      it.sec = it.sec0 * k;
      if (!it.beats) return;
      var g = it.ov || p.genre, n = norm(g), sn = n.s[it.type] || N.all.s[it.type] || n.s.verse;
      it.genre = g; it.band = sn.b; it.lineBand = sn.l;
      it.bps = it.beats / it.sec;
      it.lvl = level(it.bps, sn.b);
      it.rows.forEach(function (r) { var b = m.rows[r].syl; lineLv[r] = { lvl: level(b, sn.l), p75: sn.l[1], p90: sn.l[2], beats: b }; });
      sections.push(it);
      heads[it.line] = it;
    });
    return { pick: p, song: song, sections: sections, heads: heads, lines: lineLv, length: lengthSec || 0 };
  }

  window.HeresyDensity = { gauge: gauge, pick: pick, norms: function () { return N; } };
})();
