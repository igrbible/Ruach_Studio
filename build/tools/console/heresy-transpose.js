// HERESY 1018: move a score to another key, and catch a style that names a different one.
//
// Measured 30.09.2026 (~/Temp/style_test): a style whose key, meter and tempo agree with
// the score sang clearer (0.74–0.79 on lyric recognition against 0.60), and the same song
// moved from D minor to B♭ minor — same lyrics, same style — came out with "a different
// texture and depth" (Viktor). In Full mode the model writes its own score and may ignore
// the key the style asks for; a SheetSage2 transcription comes in whatever key it hears.
// Either way the score's K: is the truth the song follows: this moves it.
//
// Every note is moved by the same number of semitones and spelled a fixed number of letters
// up or down (D minor -> B♭ minor: 4 semitones and 2 letters down), against the source and
// target key signatures and the accidentals that last to the end of a bar. Chord symbols in
// quotes move the same way. Header lines, inline fields [K:…], comments and !decorations!
// are left alone. The result checks itself: a note moved by anything else stops it.
(function () {
  "use strict";

  var LETTERS = "CDEFGAB";
  var NAT = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  var SHARPS = "FCGDAEB", FLATS = "BEADGCF";
  var MAJOR_FIFTHS = { C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, F: -1 };      // natural tonics
  var MODES = { "": 0, maj: 0, major: 0, ion: 0, m: -3, min: -3, minor: -3, aeo: -3,
                dor: -2, phr: -4, lyd: 1, mix: -1, loc: -5 };
  var MODE_NAME = { 0: "", "-3": "m", "-2": "dor", "-4": "phr", 1: "lyd", "-1": "mix", "-5": "loc" };

  // "Dm", "Bbm", "F#", "Eb major", "D dor"… -> {letter, acc, mode, fifths}
  function parseKey(text) {
    var m = String(text || "").trim().match(/^([A-Ga-g])\s*([#b\u266f\u266d]?)\s*([A-Za-z]*)/);
    if (!m) return null;
    var letter = m[1].toUpperCase(), acc = m[2] === "#" || m[2] === "\u266f" ? 1 : m[2] === "b" || m[2] === "\u266d" ? -1 : 0;
    var modeWord = m[3].toLowerCase().slice(0, m[3].length > 3 && !/^m(aj|in)/.test(m[3].toLowerCase()) ? 3 : m[3].length);
    if (/^major/.test(m[3].toLowerCase())) modeWord = "major";
    else if (/^minor/.test(m[3].toLowerCase())) modeWord = "minor";
    if (!(modeWord in MODES)) return null;
    var fifths = MAJOR_FIFTHS[letter] + 7 * acc + MODES[modeWord];
    if (fifths > 7 || fifths < -7) return null;
    return { letter: letter, acc: acc, mode: MODES[modeWord], fifths: fifths };
  }
  function keyName(k) {
    return k.letter + (k.acc > 0 ? "#" : k.acc < 0 ? "b" : "") + MODE_NAME[k.mode];
  }
  function keyLabel(k) {   // for people: B♭ minor
    var mode = { 0: "major", "-3": "minor", "-2": "Dorian", "-4": "Phrygian", 1: "Lydian", "-1": "Mixolydian", "-5": "Locrian" }[k.mode];
    return k.letter + (k.acc > 0 ? "\u266f" : k.acc < 0 ? "\u266d" : "") + " " + mode;
  }
  function signature(k) {
    var sig = {}, n = k.fifths;
    (n > 0 ? SHARPS.slice(0, n) : FLATS.slice(0, -n)).split("").forEach(function (l) { sig[l] = n > 0 ? 1 : -1; });
    return sig;
  }
  function pitchClass(k) { return (NAT[k.letter] + k.acc + 12) % 12; }

  // The score's key: the first K: header line
  function scoreKey(abc) {
    var lines = String(abc || "").split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      var m = lines[i].match(/^K:\s*(\S+(?:\s+(?:major|minor|maj|min|dor|phr|lyd|mix|loc)\w*)?)/i);
      if (m) return parseKey(m[1]);
    }
    return null;
  }

  // The key a style names, if one: "Key: B♭ minor", "in D minor", "Bbm", "F# major"
  function styleKey(style) {
    var m = String(style || "").match(/\b([A-G])\s?([#b\u266f\u266d])?\s?(minor|major|min\b|maj\b|m\b)/);
    if (!m) return null;
    return parseKey(m[1] + (m[2] || "") + (m[3].toLowerCase().indexOf("maj") === 0 ? "" : "m"));
  }

  // The usual names for the twelve tonics of a mode, the ones with the fewest accidentals.
  function choices(mode) {
    var out = [];
    for (var pc = 0; pc < 12; pc++) {
      var best = null;
      ["C", "D", "E", "F", "G", "A", "B"].forEach(function (l) {
        [-1, 0, 1].forEach(function (a) {
          if ((NAT[l] + a + 12) % 12 !== pc) return;
          var f = MAJOR_FIFTHS[l] + 7 * a + mode;
          if (f > 7 || f < -7) return;
          if (!best || Math.abs(f) < Math.abs(best.fifths) || (Math.abs(f) === Math.abs(best.fifths) && a < 0))
            best = { letter: l, acc: a, mode: mode, fifths: f };   // a tie of accidentals goes to flats: Ebm, not D#m
        });
      });
      if (best) out.push(best);
    }
    return out;
  }

  var NOTE = /(\^\^|\^|__|_|=)?([A-Ga-g])([,']*)/y;
  var CHORD = /"([A-G])([b#\u266d\u266f]?)([^"]*)"/y;
  var ACC = { "^": 1, "^^": 2, "_": -1, "__": -2, "=": 0 };
  var ACC_OUT = { 1: "^", 2: "^^", "-1": "_", "-2": "__", 0: "=" };

  // direction: "near" (the smaller move), "up" or "down"
  function transpose(abc, target, direction) {
    var from = scoreKey(abc);
    if (!from) throw new Error("The score has no K: line I can read");
    var to = typeof target === "string" ? parseKey(target) : target;
    if (!to) throw new Error("Unknown key: " + target);
    if (to.mode !== from.mode) to = { letter: to.letter, acc: to.acc, mode: from.mode, fifths: MAJOR_FIFTHS[to.letter] + 7 * to.acc + from.mode };
    var up = ((pitchClass(to) - pitchClass(from)) % 12 + 12) % 12;          // 0..11 semitones up
    var semis = direction === "up" ? up : direction === "down" ? up - 12 : (up > 6 ? up - 12 : up);
    if (semis === 0 && direction !== "near") semis = direction === "up" ? 12 : -12;
    var steps = ((LETTERS.indexOf(to.letter) - LETTERS.indexOf(from.letter)) % 7 + 7) % 7;
    if (semis < 0 && steps > 0) steps -= 7;
    if (semis >= 12) steps += 7;
    if (semis <= -12) steps -= 7;
    var sigIn = signature(from), sigOut = signature(to), moved = 0, bad = 0;
    var out = String(abc).split(/\r?\n/).map(function (line) {
      if (/^K:/.test(line)) return line.replace(/^K:\s*\S+(\s+(major|minor|maj|min)\w*)?/i, "K:" + keyName(to));
      if (/^[A-Za-z]:/.test(line) || /^%/.test(line)) return line;
      var accIn = {}, accOut = {}, res = "", i = 0, m;
      while (i < line.length) {
        var ch = line.charAt(i);
        if (ch === "%") { res += line.slice(i); break; }                           // a comment to the end of the line
        if (ch === "|") { accIn = {}; accOut = {}; res += ch; i++; continue; }        // a bar line clears accidentals
        if (ch === "!" || ch === "+") {                                             // a decoration
          var end = line.indexOf(ch, i + 1);
          if (end > i) { res += line.slice(i, end + 1); i = end + 1; continue; }
        }
        if (ch === "[" && /^\[[A-Za-z]:/.test(line.slice(i, i + 3))) {               // an inline field [K:…] [V:…]
          var close = line.indexOf("]", i);
          res += line.slice(i, close + 1); i = close + 1; continue;
        }
        if (ch === '"') {
          CHORD.lastIndex = i;
          m = CHORD.exec(line);
          if (m) {
            var acc = /[#\u266f]/.test(m[2]) ? 1 : /[b\u266d]/.test(m[2]) ? -1 : 0;
            var pc = NAT[m[1]] + acc + semis, nl = LETTERS.charAt(((LETTERS.indexOf(m[1]) + steps) % 7 + 7) % 7);
            var d = ((pc - NAT[nl]) % 12 + 18) % 12 - 6;
            res += '"' + nl + (d === -1 ? "b" : d === 1 ? "#" : d === -2 ? "bb" : d === 2 ? "##" : "") + m[3] + '"';
            i = CHORD.lastIndex; continue;
          }
          var q = line.indexOf('"', i + 1);
          res += line.slice(i, q + 1); i = q + 1; continue;
        }
        NOTE.lastIndex = i;
        m = NOTE.exec(line);
        // a letter right after another letter is part of a word, unless that letter is a note or a
        // rest (z, Z, x): "zd" is a rest and a D (HERESY 1028: these were left unmoved)
        if (m && !(i > 0 && /[A-Za-z]/.test(line.charAt(i - 1)) && !/[A-Ga-gzZxX]/.test(line.charAt(i - 1)))) {
          var up_ = m[2].toUpperCase(), octave = (m[2] === up_ ? 4 : 5) + (m[3].split("'").length - 1) - (m[3].split(",").length - 1);
          var key = up_ + octave;
          if (m[1]) accIn[key] = ACC[m[1]];
          var alter = key in accIn ? accIn[key] : (sigIn[up_] || 0);
          var midi = 12 * (octave + 1) + NAT[up_] + alter, want = midi + semis;
          var li = LETTERS.indexOf(up_) + steps, nl2 = LETTERS.charAt(((li % 7) + 7) % 7), noct = octave + Math.floor(li / 7);
          var nalter = want - (12 * (noct + 1) + NAT[nl2]);
          var k2 = nl2 + noct, has = k2 in accOut ? accOut[k2] : (sigOut[nl2] || 0);
          if (Math.abs(nalter) > 2) bad++;
          var sym = nalter === has ? "" : ACC_OUT[nalter] || "";
          if (sym) accOut[k2] = nalter;
          var s = noct <= 4 ? nl2 : nl2.toLowerCase();
          s += noct < 4 ? new Array(4 - noct + 1).join(",") : noct > 5 ? new Array(noct - 5 + 1).join("'") : "";
          res += sym + s; moved++; i = NOTE.lastIndex; continue;
        }
        res += ch; i++;
      }
      return res;
    }).join("\n");
    if (!moved) throw new Error("No notes found to move");
    if (bad) throw new Error(bad + " notes would need more than a double accidental: pick the other direction");
    return { abc: out, notes: moved, semis: semis, from: from, to: to };
  }

  window.HeresyTranspose = { parseKey: parseKey, keyName: keyName, keyLabel: keyLabel, scoreKey: scoreKey,
                             styleKey: styleKey, choices: choices, transpose: transpose };
})();
