/* Instrumental scores: move a planned (or transcribed) vocal melody into the
   instrument voice, the way the official YuE2 instrumental recipe does, so a
   song renders with no singing.

   A faithful port of the recipe's standard-library tools (score parser, event
   compiler and voice transfer), with the same strictness: anything outside
   the native two-voice dialect is refused rather than guessed, and every
   conversion re-parses its own output and checks that no note, bar, tempo or
   chord changed. Times are quarter notes; the dialect only uses power-of-two
   subdivisions, so plain numbers hold them exactly.

   The same file ships in both consoles. window.YueInstrumental:
     parse(text)            -> score (voices Vocal/Ins: notes [t, pitch, d], bars, chords, keys)
     convert(text)          -> { abc, check }   vocal notes moved to Ins, chords kept
     lyricTags(abc)         -> "[Intro]\n\n[Verse]\n"   the only lyrics an instrumental takes
     style(text)            -> "Instrumental, ..., no vocals, no singing, no choir, no spoken words."
     mode(abc)              -> "full" when the score carries chords, else "melody"
     planningLyrics         -> section skeleton used when the form has no lyrics */
(function (root) {
  "use strict";

  var VOICES = ["Vocal", "Ins"];
  var DURATIONS = [48, 32, 24, 16, 12, 8, 6, 4, 3, 2, 1];
  var DURATION_SET = { 1: 1, 2: 1, 3: 1, 4: 1, 6: 1, 8: 1, 12: 1, 16: 1, 24: 1, 32: 1, 48: 1 };
  var QUALITIES = ["", "m", "dim", "aug", "7", "maj7", "m7", "dim7", "m7b5", "sus4", "sus2", "6", "m6", "7sus4", "m(maj7)"];
  var PITCH_NAME = "[A-G](?:bb|##|b|#)?";
  var CHORD = new RegExp("^" + PITCH_NAME + "(?:" + QUALITIES.map(function (q) {
    return q.replace(/[()]/g, "\\$&");
  }).join("|") + ")(?:/" + PITCH_NAME + ")?$");
  var TOKEN_SOURCE = '"([^"\\n]*)"|\\[K:([^\\]\\n]+)\\]|(\\^\\^|__|\\^|_|=)?([A-Ga-gz])([,\']*)([0-9]*)(-?)';
  var NATURAL = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  var LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
  var KEYS = {};
  ["Cb", "Gb", "Db", "Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E", "B", "F#", "C#"].forEach(function (k, i) { KEYS[k] = i - 7; });
  ["Abm", "Ebm", "Bbm", "Fm", "Cm", "Gm", "Dm", "Am", "Em", "Bm", "F#m", "C#m", "G#m", "D#m", "A#m"].forEach(function (k, i) { KEYS[k] = i - 7; });
  var SECTIONS = { intro: 1, verse: 1, "pre-chorus": 1, chorus: 1, bridge: 1, interlude: 1, outro: 1, instrumental: 1 };
  var CONDITIONS = ["no vocals", "no singing", "no choir", "no spoken words"];

  function AbcError(message) { this.name = "AbcError"; this.message = message; }
  AbcError.prototype = Object.create(Error.prototype);

  function fail(condition, message) { if (condition) throw new AbcError(message); }

  function keyAccidentals(key) {
    fail(!Object.prototype.hasOwnProperty.call(KEYS, key), "Unsupported key '" + key + "'; use a standard major or minor K: field");
    var count = KEYS[key], result = {};
    LETTERS.forEach(function (l) { result[l] = 0; });
    (count > 0 ? "FCGDAEB" : "BEADGCF").slice(0, Math.abs(count)).split("").forEach(function (l) { result[l] = count > 0 ? 1 : -1; });
    return result;
  }

  function isPow2(n) { return n > 0 && (n & (n - 1)) === 0; }

  function meterValue(text) {
    var m = /^([1-9][0-9]*)\/([1-9][0-9]*)$/.exec(text);
    fail(!m, "Unsupported meter '" + text + "'; write an explicit fraction");
    var n = parseInt(m[1], 10), d = parseInt(m[2], 10);
    fail(d > 1024 || !isPow2(d), "Unsupported meter denominator " + d);
    return [n, d];
  }

  function newVoice(meter, key) {
    return { meter: meter, key: key, time: 0, notes: [], bars: [], chords: [], keys: [[0, key]], pending: null };
  }

  function parseBar(body, voice, unit, context) {
    var n = voice.meter[0], d = voice.meter[1];
    var length = 4 * n / d, start = voice.time, offset = 0, local = {};
    if (body === "Z") {
      fail(voice.pending !== null, context + ": tie enters a full-measure rest");
      offset = length;
    } else {
      var token = new RegExp(TOKEN_SOURCE, "y"), cursor = 0;
      while (cursor < body.length) {
        if (/\s/.test(body.charAt(cursor))) { cursor++; continue; }
        token.lastIndex = cursor;
        var m = token.exec(body);
        fail(!m, context + ": unsupported token at '" + body.slice(cursor, cursor + 24) + "'");
        cursor = token.lastIndex;
        fail(offset >= length, context + ": event after the measure end");
        if (m[1] !== undefined) {
          fail(!CHORD.test(m[1]), context + ": unsupported chord '" + m[1] + "'");
          voice.chords.push([start + offset, m[1]]);
          continue;
        }
        if (m[2] !== undefined) {
          keyAccidentals(m[2]);
          voice.key = m[2];
          voice.keys.push([start + offset, m[2]]);
          local = {};
          continue;
        }
        var acc = m[3] || "", note = m[4], octave = m[5], digits = m[6], tie = m[7];
        var units = parseInt(digits || "1", 10);
        fail(!DURATION_SET[units], context + ": unsupported duration " + units + "; split it into tied supported lengths");
        var duration = units * unit * 4;
        fail(offset + duration > length, context + ": note/rest exceeds meter duration");
        fail(octave.indexOf(",") >= 0 && octave.indexOf("'") >= 0, context + ": mixed octave marks");
        if (note === "z") {
          fail(!!(acc || octave || tie), context + ": a rest cannot have accidentals, octave marks or ties");
          fail(voice.pending !== null, context + ": tie enters a rest");
        } else {
          var letter = note.toUpperCase();
          var written = 60 + NATURAL[letter] + (note !== letter ? 12 : 0);
          written += 12 * (octave.split("'").length - 1 - (octave.split(",").length - 1));
          var alteration = Object.prototype.hasOwnProperty.call(local, letter) ? local[letter] : keyAccidentals(voice.key)[letter];
          if (acc) {
            alteration = { "=": 0, "_": -1, "__": -2, "^": 1, "^^": 2 }[acc];
            local[letter] = alteration;
          }
          var pitch = written + alteration;
          if (voice.pending !== null) {
            var oldPitch = voice.pending[0], oldWritten = voice.pending[1];
            if (!acc && written === oldWritten) pitch = oldPitch;
            fail(pitch !== oldPitch, context + ": tie changes pitch from " + oldPitch + " to " + pitch);
            voice.notes[voice.notes.length - 1][2] += duration;
          } else {
            fail(!(pitch >= 0 && pitch <= 127), context + ": pitch " + pitch + " is outside MIDI range");
            voice.notes.push([start + offset, pitch, duration]);
          }
          voice.pending = tie ? [pitch, written] : null;
        }
        offset += duration;
      }
    }
    fail(offset !== length, context + ": duration " + offset + " quarter notes != meter duration " + length);
    voice.bars.push([start, length, voice.meter.slice()]);
    voice.time += length;
  }

  function parse(text) {
    var lines = String(text).split(/\r\n|\n|\r/);
    if (lines.length && lines[lines.length - 1] === "") lines.pop();   // splitlines() drops the final break
    fail(lines.length < 12, "Incomplete native two-voice ABC");
    fail(lines[0] !== "X:1" || lines[1] !== "T:", "Expected native X:1 and blank T: header");
    fail(lines[2].indexOf("M:") !== 0, "Missing header M:");
    var meter = meterValue(lines[2].slice(2));
    var unitMatch = /^L:1\/([1-9][0-9]*)$/.exec(lines[3]);
    fail(!unitMatch, "Expected L:1/<power of two>, usually L:1/32");
    var denominator = parseInt(unitMatch[1], 10);
    fail(denominator > 1024 || !isPow2(denominator), "Unsupported L: denominator");
    var unit = 1 / denominator;
    var tempoMatch = /^Q:1\/4=([1-9][0-9]*)$/.exec(lines[4]);
    fail(!tempoMatch, "Expected integer quarter-note tempo Q:1/4=<BPM>");
    fail(lines[5] !== 'V: Vocal clef=treble name="Vocal Melody" snm="Vocal"' ||
         lines[6] !== 'V: Ins clef=treble name="Ins Melody" snm="Inst."', "Preserve native Vocal and Ins voice definitions");
    fail(lines[7].indexOf("K:") !== 0, "Missing header K:");
    var key = lines[7].slice(2);
    keyAccidentals(key);
    var voices = { Vocal: newVoice(meter, key), Ins: newVoice(meter, key) };
    var musicLines = {}, cursor = 8, group = 0;
    while (cursor < lines.length) {
      while (cursor < lines.length && lines[cursor].indexOf("% ") === 0) cursor++;
      fail(cursor === lines.length, "Dangling section comment without music");
      group++;
      var counts = [];
      for (var v = 0; v < VOICES.length; v++) {
        var name = VOICES[v], context = "group " + group + ", " + name;
        fail(cursor >= lines.length || lines[cursor] !== "V: " + name, context + ": expected V: " + name);
        cursor++;
        var voice = voices[name], fields = {};
        while (cursor < lines.length && (lines[cursor].indexOf("M:") === 0 || lines[cursor].indexOf("K:") === 0)) {
          var fieldName = lines[cursor].charAt(0), value = lines[cursor].slice(2);
          fail(fields[fieldName], context + ": duplicate " + fieldName + ": field");
          fields[fieldName] = true;
          if (fieldName === "M") {
            voice.meter = meterValue(value);
          } else {
            keyAccidentals(value);
            voice.key = value;
            voice.keys.push([voice.time, value]);
          }
          cursor++;
        }
        fail(cursor >= lines.length, context + ": missing music line");
        var line = lines[cursor];
        fail(line.charAt(line.length - 1) !== "|", context + ": music line must end with a plain barline");
        musicLines[cursor] = name;
        cursor++;
        var bars = [];
        line.slice(0, -1).split("|").forEach(function (bar) {
          bar = bar.trim();
          fail(!bar, context + ": empty measure or unsupported double/repeat barline");
          var rest = /^Z([2-4])?$/.exec(bar);
          if (rest) {
            for (var r = 0; r < parseInt(rest[1] || "1", 10); r++) bars.push("Z");
          } else {
            bars.push(bar);
          }
        });
        fail(!(bars.length >= 1 && bars.length <= 4), context + ": expected 1–4 measures after expanding Z rests");
        counts.push(bars.length);
        for (var b = 0; b < bars.length; b++) {
          parseBar(bars[b], voice, unit, context + ", bar " + (voice.bars.length + 1));
        }
      }
      fail(counts[0] !== counts[1], "group " + group + ": voices have different measure counts");
    }
    VOICES.forEach(function (name) { fail(voices[name].pending !== null, name + ": unresolved tie at end of score"); });
    fail(voices.Ins.chords.length !== 0, "Native chord symbols belong in Vocal, not Ins");
    fail(JSON.stringify(voices.Vocal.bars) !== JSON.stringify(voices.Ins.bars), "Voice meter/time grids differ");
    fail(JSON.stringify(voices.Vocal.keys) !== JSON.stringify(voices.Ins.keys), "Voice key-change timelines differ");
    return { text: text, unit: unit, bpm: parseInt(tempoMatch[1], 10), voices: voices, musicLines: musicLines, lines: lines };
  }

  // ---------------------------------------------------------------- compiler

  function gcd(a, b) { while (b) { var t = a % b; a = b; b = t; } return a; }
  function lcm(a, b) { return a / gcd(a, b) * b; }

  // Denominator of a quarter-note time as a fraction of a whole note (Python: (x / 4).denominator)
  function wholeDenominator(x) {
    var y = x / 4, den = 1;
    while (y * den !== Math.floor(y * den)) {
      den *= 2;
      fail(den > (1 << 30), "Rhythm is outside the power-of-two training grid");
    }
    return den;
  }

  function lengths(value) {
    fail(value !== Math.floor(value) || value <= 0, "Unrepresentable duration in ABC units: " + value);
    var left = value, result = [];
    DURATIONS.forEach(function (part) { while (left >= part) { result.push(part); left -= part; } });
    return result;
  }

  function compareTuples(a, b) {
    for (var i = 0; i < Math.min(a.length, b.length); i++) {
      if (a[i] < b[i]) return -1;
      if (a[i] > b[i]) return 1;
    }
    return a.length - b.length;
  }

  function spelling(pitch, key, active) {
    var signature = keyAccidentals(key), total = 0;
    LETTERS.forEach(function (l) { total += signature[l]; });
    var preferSharp = total >= 0, best = null;
    Object.keys(NATURAL).forEach(function (letter) {
      [-1, 0, 1].forEach(function (alteration) {
        var base = pitch - alteration - 60 - NATURAL[letter];
        if (((base % 12) + 12) % 12) return;
        var octave = Math.floor(base / 12);
        var rank = [alteration !== signature[letter] ? 1 : 0, Math.abs(alteration),
                    (preferSharp ? alteration < 0 : alteration > 0) ? 1 : 0, letter, alteration, octave];
        if (!best || compareTuples(rank, best) < 0) best = rank;
      });
    });
    var letterOut = best[3], alt = best[4], oct = best[5], accidental = "";
    var current = Object.prototype.hasOwnProperty.call(active, letterOut) ? active[letterOut] : signature[letterOut];
    if (alt !== current) {
      accidental = { "-1": "_", "0": "=", "1": "^" }[String(alt)];
      active[letterOut] = alt;
    }
    var name = oct < 0 ? letterOut + new Array(-oct + 1).join(",") :
      oct === 0 ? letterOut : letterOut.toLowerCase() + new Array(oct).join("'");
    return accidental + name;
  }

  function compress(bars) {
    var result = [], index = 0;
    while (index < bars.length) {
      if (bars[index] !== "Z") { result.push(bars[index] + "|"); index++; continue; }
      var end = index + 1;
      while (end < bars.length && bars[end] === "Z") end++;
      var count = end - index;
      result.push("Z" + (count > 1 ? String(count) : "") + "|");
      index = end;
    }
    return result.join("");
  }

  function restRun(quarters, unitQuarters) {
    return lengths(quarters / unitQuarters).map(function (n) { return "z" + (n !== 1 ? String(n) : ""); });
  }

  function compileEvents(data) {
    var bpm = data.bpm;
    fail(!(Number.isInteger(bpm) && bpm > 0), "bpm must be a positive integer quarter-note tempo");
    var key = data.key || "C";
    keyAccidentals(key);
    fail(!data.bars || !data.bars.length, "bars must be a nonempty list");
    var bars = [], time = 0, meter = "4/4", section = null, unitDen = 32;
    data.bars.forEach(function (item, i) {
      meter = item.meter || meter;
      key = item.key || key;
      var md = meterValue(meter);
      keyAccidentals(key);
      unitDen = lcm(unitDen, 4 * md[1]);
      var incoming = "section" in item ? item.section : section;
      fail(incoming !== null && !SECTIONS[incoming], "bar " + (i + 1) + ": section must be a native label");
      section = incoming;
      var end = time + 4 * md[0] / md[1];
      bars.push({ start: time, end: end, meter: meter, key: key, section: section });
      time = end;
    });
    var notes = (data.notes || []).map(function (item, i) {
      var start = item[0], duration = item[1], pitch = item[2];
      fail(!(Number.isInteger(pitch) && pitch >= 0 && pitch <= 127), "note " + (i + 1) + ": pitch must be one MIDI integer");
      fail(start < 0 || duration <= 0 || start + duration > time, "note " + (i + 1) + ": onset/duration is outside the score");
      unitDen = lcm(unitDen, lcm(wholeDenominator(start), wholeDenominator(duration)));
      return [start, pitch, duration];
    });
    notes.sort(compareTuples);
    fail(!notes.length, "Instrumental score has no sounding notes");
    for (var n = 1; n < notes.length; n++) {
      fail(notes[n - 1][0] + notes[n - 1][2] > notes[n][0], "Overlapping melody notes at quarter " + notes[n][0] + "; choose one lead line");
    }
    var chords = (data.chords || []).map(function (item, i) {
      var when = item[0], symbol = item[1];
      fail(when < 0 || when >= time || typeof symbol !== "string" || !CHORD.test(symbol), "chord " + (i + 1) + ": unsupported symbol or onset");
      unitDen = lcm(unitDen, wholeDenominator(when));
      return [when, symbol];
    });
    chords.sort(compareTuples);
    for (var c = 1; c < chords.length; c++) {
      fail(chords[c - 1][0] === chords[c][0], "Conflicting/duplicate chord events at the same onset");
    }
    fail(unitDen > 1024 || !isPow2(unitDen), "Rhythm is outside the power-of-two training grid");
    var unitQuarters = 4 / unitDen, ins = [], vocal = [];
    bars.forEach(function (bar) {
      var start = bar.start, end = bar.end;
      var events = notes.filter(function (x) { return x[0] < end && x[0] + x[2] > start; });
      var pieces = [], cursor = start, active = {};
      events.forEach(function (ev) {
        var onset = ev[0], pitch = ev[1], duration = ev[2];
        var a = Math.max(start, onset), b = Math.min(end, onset + duration);
        if (a > cursor) pieces.push.apply(pieces, restRun(a - cursor, unitQuarters));
        var parts = lengths((b - a) / unitQuarters);
        parts.forEach(function (count, i) {
          var tie = (i < parts.length - 1 || b < onset + duration) ? "-" : "";
          pieces.push(spelling(pitch, bar.key, active) + (count !== 1 ? String(count) : "") + tie);
        });
        cursor = b;
      });
      if (cursor < end) pieces.push.apply(pieces, restRun(end - cursor, unitQuarters));
      ins.push(events.length ? pieces.join("") : "Z");
      var current = null;
      chords.forEach(function (ch) { if (ch[0] <= start) current = ch[1]; });
      var changes = [[start, current]].concat(chords.filter(function (ch) { return start < ch[0] && ch[0] < end; }));
      var chunks = [];
      changes.forEach(function (change, i) {
        var stop = i + 1 < changes.length ? changes[i + 1][0] : end;
        chunks.push(change[1] ? '"' + change[1] + '"' : "");
        chunks.push.apply(chunks, restRun(stop - change[0], unitQuarters));
      });
      vocal.push(changes.some(function (ch) { return ch[1]; }) ? chunks.join("") : "Z");
    });
    var lines = ["X:1", "T:", "M:" + bars[0].meter, "L:1/" + unitDen, "Q:1/4=" + bpm,
      'V: Vocal clef=treble name="Vocal Melody" snm="Vocal"', 'V: Ins clef=treble name="Ins Melody" snm="Inst."', "K:" + bars[0].key];
    var index = 0;
    while (index < bars.length) {
      var bar = bars[index], previous = index ? bars[index - 1] : bar, stop = index + 1;
      while (stop < bars.length && stop - index < 4 && ["meter", "key", "section"].every(function (k) { return bars[stop][k] === bar[k]; })) stop++;
      if (bar.section !== null && (index === 0 || bar.section !== previous.section)) lines.push("% " + bar.section);
      [["Vocal", vocal], ["Ins", ins]].forEach(function (pair) {
        lines.push("V: " + pair[0]);
        if (bar.meter !== previous.meter) lines.push("M:" + bar.meter);
        if (bar.key !== previous.key) lines.push("K:" + bar.key);
        lines.push(compress(pair[1].slice(index, stop)));
      });
      index = stop;
    }
    var text = lines.join("\n") + "\n";
    var parsed = parse(text);
    fail(JSON.stringify(parsed.voices.Ins.notes) !== JSON.stringify(notes) || parsed.voices.Vocal.notes.length,
      "Internal note roundtrip failed");
    fail(JSON.stringify(dedupHarmony(parsed.voices.Vocal.chords)) !== JSON.stringify(dedupHarmony(chords)), "Internal harmony roundtrip failed");
    return text;
  }

  function dedupHarmony(events) {
    var result = [];
    events.forEach(function (item) { if (!result.length || result[result.length - 1][1] !== item[1]) result.push(item); });
    return result;
  }

  // ------------------------------------------------------------ voice transfer

  function subtractIntervals(start, duration, occupied) {
    var pieces = [[start, start + duration]];
    occupied.forEach(function (span) {
      var left = span[0], right = span[1], remaining = [];
      pieces.forEach(function (p) {
        var a = p[0], b = p[1];
        if (right <= a || left >= b) { remaining.push([a, b]); return; }
        if (a < left) remaining.push([a, left]);
        if (right < b) remaining.push([right, b]);
      });
      pieces = remaining;
    });
    return pieces;
  }

  function sectionStarts(score) {
    var cursor = 0, pending = null, result = {};
    score.lines.forEach(function (line, index) {
      if (line.indexOf("% ") === 0) {
        pending = line.slice(2);
        fail(!SECTIONS[pending], "Unknown section label: " + pending);
      }
      if (score.musicLines[index] !== "Vocal") return;
      if (pending !== null) {
        result[score.voices.Vocal.bars[cursor][0]] = pending;
        pending = null;
      }
      line.slice(0, -1).split("|").forEach(function (bar) {
        var rest = /^Z([2-4])?$/.exec(bar.trim());
        cursor += rest ? parseInt(rest[1] || "1", 10) : 1;
      });
    });
    return result;
  }

  function convert(text, opts) {
    opts = opts || {};
    var keepChords = opts.keepChords !== false, overlap = opts.overlap || "vocal";
    fail(typeof text !== "string" || !text.trim(), "Need a nonempty native score");
    var source = parse(text), vocal = source.voices.Vocal, ins = source.voices.Ins;
    fail(!vocal.notes.length && !ins.notes.length, "The score contains no sounding notes");
    var occupied = vocal.notes.map(function (n) { return [n[0], n[0] + n[2]]; });
    var merged = vocal.notes.map(function (n) { return n.slice(); }), affected = 0, unchanged = 0;
    ins.notes.forEach(function (n) {
      var pieces = subtractIntervals(n[0], n[2], occupied);
      if (pieces.length === 1 && pieces[0][0] === n[0] && pieces[0][1] === n[0] + n[2]) {
        unchanged++;
      } else {
        fail(overlap === "error", "Vocal and Ins overlap; choose vocal priority or edit the arrangement explicitly");
        affected++;
      }
      pieces.forEach(function (p) { merged.push([p[0], n[1], p[1] - p[0]]); });
    });
    merged.sort(compareTuples);
    var sections = sectionStarts(source), starts = {};
    vocal.bars.forEach(function (b) { starts[b[0]] = true; });
    fail(vocal.keys.some(function (k) { return !starts[k[0]]; }),
      "An inline key change occurs inside a bar; normalize its spelling without changing pitches first");
    var bars = vocal.bars.map(function (b) {
      var start = b[0], key = null;
      vocal.keys.forEach(function (k) { if (k[0] <= start) key = k[1]; });
      var bar = { meter: b[2][0] + "/" + b[2][1], key: key };
      if (Object.prototype.hasOwnProperty.call(sections, start)) bar.section = sections[start];
      return bar;
    });
    var chords = [];
    if (keepChords) {
      vocal.chords.forEach(function (ch) {
        if (chords.length && chords[chords.length - 1][0] === ch[0]) {
          fail(chords[chords.length - 1][1] !== ch[1], "Conflicting chord labels at the same time");
          return;
        }
        chords.push([ch[0], ch[1]]);
      });
    }
    var converted = compileEvents({ bpm: source.bpm, key: vocal.keys[0][1], bars: bars,
      notes: merged.map(function (n) { return [n[0], n[2], n[1]]; }), chords: chords });
    var target = parse(converted);
    fail(JSON.stringify(target.voices.Ins.notes) !== JSON.stringify(merged) || target.voices.Vocal.notes.length,
      "Voice transfer changed the intended note events");
    fail(JSON.stringify(target.voices.Ins.bars) !== JSON.stringify(ins.bars) || target.bpm !== source.bpm,
      "Voice transfer changed meter, timing or tempo");
    if (keepChords) {
      fail(JSON.stringify(dedupHarmony(target.voices.Vocal.chords)) !== JSON.stringify(dedupHarmony(vocal.chords)),
        "Voice transfer changed harmony");
    }
    return {
      abc: converted,
      check: { vocalNotes: vocal.notes.length, insNotesBefore: ins.notes.length, insNotesAfter: merged.length,
        insNotesTrimmed: affected, insNotesUnaltered: unchanged, chords: keepChords ? dedupHarmony(chords).length : 0,
        seconds: ins.time * 60 / source.bpm }
    };
  }

  function titleCase(label) {
    return label.replace(/[A-Za-z]+/g, function (w) { return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(); });
  }

  function lyricTags(abc) {
    var labels = String(abc).split(/\r\n|\n|\r/).filter(function (l) { return l.indexOf("% ") === 0; }).map(function (l) { return l.slice(2); });
    return labels.map(function (x) { return "[" + titleCase(x) + "]"; }).join("\n\n") + (labels.length ? "\n" : "");
  }

  function style(text) {
    var s = String(text || "").trim().replace(/[.,]+$/, "");
    if (!s) s = "Expressive instrumental music";
    if (!/^instrumental\b/i.test(s)) s = "Instrumental, " + s;
    CONDITIONS.forEach(function (c) { if (s.toLowerCase().indexOf(c) < 0) s += ", " + c; });
    return s + ".";
  }

  function mode(abc) { return parse(abc).voices.Vocal.chords.length ? "full" : "melody"; }

  root.YueInstrumental = {
    parse: parse, convert: convert, compileEvents: compileEvents, lyricTags: lyricTags, style: style, mode: mode,
    planningLyrics: "[Intro]\n\n[Verse]\n\n[Chorus]\n\n[Outro]\n", AbcError: AbcError
  };
})(typeof window !== "undefined" ? window : globalThis);
