// HERESY 1028: the score, checked and carried. A port of YuE2's own abc_tools.py (YuE2 Studio,
// skills/yue2-music/scripts, Apache-2.0): the limited two-voice ABC dialect YuE2 and SheetSage2
// write, read strictly (fail closed), down to the sounding notes. On top of it:
//   report()     notes, rests, bars, range and time per voice, and the Ins : Vocal ratio
//   toMidi()     a Standard MIDI File: tempo, meter and key, a track per voice, and the section
//                comments (% verse…) as markers, so a DAW opens the song already marked
//   markers()    the same sections as times, for a CSV or a DAW's marker import
//   fromMidi()   a MIDI file (one melodic line per voice) back into this dialect
//   shiftVoice() one voice moved by scale steps (a third, a fourth, an octave…) in the same key,
//                its own sharps and flats kept; the other voice and the chords stay
(function () {
  "use strict";

  var VOICES = ["Vocal", "Ins"];
  var DURATIONS = { 1: 1, 2: 1, 3: 1, 4: 1, 6: 1, 8: 1, 12: 1, 16: 1, 24: 1, 32: 1, 48: 1 };
  var QUALITIES = ["", "m", "dim", "aug", "7", "maj7", "m7", "dim7", "m7b5", "sus4", "sus2", "6", "m6", "7sus4", "m(maj7)"];
  var PITCH_NAME = "[A-G](?:bb|##|b|#)?";
  var CHORD = new RegExp("^" + PITCH_NAME + "(?:" + QUALITIES.map(function (q) { return q.replace(/[()]/g, "\\$&"); }).join("|") + ")(?:/" + PITCH_NAME + ")?$");
  var TOKEN = /"([^"\n]*)"|\[K:([^\]\n]+)\]|(\^\^|__|\^|_|=)?([A-Ga-gz])([,']*)([0-9]*)(-?)/y;
  var NATURAL = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  var KEYS = {};
  ["Cb", "Gb", "Db", "Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E", "B", "F#", "C#"].forEach(function (k, i) { KEYS[k] = i - 7; });
  ["Abm", "Ebm", "Bbm", "Fm", "Cm", "Gm", "Dm", "Am", "Em", "Bm", "F#m", "C#m", "G#m", "D#m", "A#m"].forEach(function (k, i) { KEYS[k] = i - 7; });

  // exact fractions: [numerator, denominator], always reduced
  function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { var t = a % b; a = b; b = t; } return a || 1; }
  function F(n, d) { d = d || 1; if (d < 0) { n = -n; d = -d; } var g = gcd(n, d); return [n / g, d / g]; }
  function add(a, b) { return F(a[0] * b[1] + b[0] * a[1], a[1] * b[1]); }
  function mul(a, b) { return F(a[0] * b[0], a[1] * b[1]); }
  function cmp(a, b) { return a[0] * b[1] - b[0] * a[1]; }
  function num(a) { return a[0] / a[1]; }
  function str(a) { return a[1] === 1 ? String(a[0]) : a[0] + "/" + a[1]; }

  function AbcError(message) { var e = new Error(message); e.abc = true; return e; }
  function fail(condition, message) { if (condition) throw AbcError(message); }

  function keyAccidentals(key) {
    fail(!(key in KEYS), "Unsupported key " + JSON.stringify(key) + "; use a standard major or minor K: field");
    var count = KEYS[key], result = { C: 0, D: 0, E: 0, F: 0, G: 0, A: 0, B: 0 };
    (count > 0 ? "FCGDAEB" : "BEADGCF").slice(0, Math.abs(count)).split("").forEach(function (l) { result[l] = count > 0 ? 1 : -1; });
    return result;
  }
  function meterValue(text) {
    var m = /^([1-9][0-9]*)\/([1-9][0-9]*)$/.exec(text);
    fail(!m, "Unsupported meter " + JSON.stringify(text) + "; write an explicit fraction");
    var n = +m[1], d = +m[2];
    fail(d > 1024 || (d & (d - 1)) !== 0, "Unsupported meter denominator " + d);
    return [n, d];
  }
  function newVoice(meter, key) {
    return { meter: meter, key: key, time: F(0), notes: [], bars: [], chords: [], keys: [[F(0), key]], pending: null, rests: F(0) };
  }

  function parseBar(body, voice, unit, context) {
    var length = F(4 * voice.meter[0], voice.meter[1]), start = voice.time, offset = F(0), local = {};
    if (body === "Z") {
      fail(voice.pending !== null, context + ": tie enters a full-measure rest");
      offset = length;
      voice.rests = add(voice.rests, length);
    } else {
      var cursor = 0;
      while (cursor < body.length) {
        if (/\s/.test(body.charAt(cursor))) { cursor++; continue; }
        TOKEN.lastIndex = cursor;
        var m = TOKEN.exec(body);
        fail(!m, context + ": unsupported token at " + JSON.stringify(body.slice(cursor, cursor + 24)));
        cursor = TOKEN.lastIndex;
        fail(cmp(offset, length) >= 0, context + ": event after the measure end");
        if (m[1] !== undefined) {
          fail(!CHORD.test(m[1]), context + ": unsupported chord " + JSON.stringify(m[1]));
          voice.chords.push([add(start, offset), m[1]]);
          continue;
        }
        if (m[2] !== undefined) {
          keyAccidentals(m[2]);
          voice.key = m[2];
          voice.keys.push([add(start, offset), m[2]]);
          local = {};
          continue;
        }
        var acc = m[3] || "", note = m[4], octave = m[5] || "", tie = m[7];
        var units = parseInt(m[6] || "1", 10);
        fail(!DURATIONS[units], context + ": unsupported duration " + units + "; split it into tied supported lengths");
        var duration = mul(F(units * 4), unit);
        fail(cmp(add(offset, duration), length) > 0, context + ": note/rest exceeds meter duration");
        fail(octave.indexOf(",") >= 0 && octave.indexOf("'") >= 0, context + ": mixed octave marks");
        if (note === "z") {
          fail(!!(acc || octave || tie), context + ": a rest cannot have accidentals, octave marks or ties");
          fail(voice.pending !== null, context + ": tie enters a rest");
          voice.rests = add(voice.rests, duration);
        } else {
          var letter = note.toUpperCase();
          var written = 60 + NATURAL[letter] + (note !== letter ? 12 : 0) + 12 * ((octave.match(/'/g) || []).length - (octave.match(/,/g) || []).length);
          var alteration = letter in local ? local[letter] : keyAccidentals(voice.key)[letter];
          if (acc) { alteration = { "=": 0, "_": -1, "__": -2, "^": 1, "^^": 2 }[acc]; local[letter] = alteration; }
          var pitch = written + alteration;
          if (voice.pending !== null) {
            // an unmarked continuation keeps its tied accidental across a barline
            if (!acc && written === voice.pending[1]) pitch = voice.pending[0];
            fail(pitch !== voice.pending[0], context + ": tie changes pitch from " + voice.pending[0] + " to " + pitch);
            var last = voice.notes[voice.notes.length - 1];
            last[2] = add(last[2], duration);
          } else {
            fail(pitch < 0 || pitch > 127, context + ": pitch " + pitch + " is outside MIDI range");
            voice.notes.push([add(start, offset), pitch, duration]);
          }
          voice.pending = tie ? [pitch, written] : null;
        }
        offset = add(offset, duration);
      }
    }
    fail(cmp(offset, length) !== 0, context + ": duration " + str(offset) + " quarter notes != meter duration " + str(length));
    voice.bars.push([start, length, voice.meter]);
    voice.time = add(voice.time, length);
  }

  // Fail closed for unsupported tokens; resolve sounding notes, not token counts.
  function parse(text) {
    var lines = String(text).replace(/\r/g, "").replace(/\n+$/, "").split("\n");
    fail(lines.length < 12, "Incomplete native two-voice ABC");
    fail(lines[0] !== "X:1" || lines[1] !== "T:", "Expected native X:1 and blank T: header");
    fail(lines[2].indexOf("M:") !== 0, "Missing header M:");
    var meter = meterValue(lines[2].slice(2));
    var um = /^L:1\/([1-9][0-9]*)$/.exec(lines[3]);
    fail(!um, "Expected L:1/<power of two>, usually L:1/32");
    var denominator = +um[1];
    fail(denominator > 1024 || (denominator & (denominator - 1)) !== 0, "Unsupported L: denominator");
    var unit = F(1, denominator);
    var tm = /^Q:1\/4=([1-9][0-9]*)$/.exec(lines[4]);
    fail(!tm, "Expected integer quarter-note tempo Q:1/4=<BPM>");
    fail(lines[5] !== 'V: Vocal clef=treble name="Vocal Melody" snm="Vocal"' ||
         lines[6] !== 'V: Ins clef=treble name="Ins Melody" snm="Inst."', "Preserve native Vocal and Ins voice definitions");
    fail(lines[7].indexOf("K:") !== 0, "Missing header K:");
    var key = lines[7].slice(2);
    keyAccidentals(key);
    var voices = { Vocal: newVoice(meter, key), Ins: newVoice(meter, key) };
    var sections = [], cursor = 8, group = 0;
    while (cursor < lines.length) {
      while (cursor < lines.length && lines[cursor].indexOf("% ") === 0) {
        sections.push([voices.Vocal.time, lines[cursor].slice(2).trim()]);
        cursor++;
      }
      fail(cursor === lines.length, "Dangling section comment without music");
      group++;
      var counts = [];
      VOICES.forEach(function (name) {
        var context = "group " + group + ", " + name;
        fail(cursor >= lines.length || lines[cursor] !== "V: " + name, context + ": expected V: " + name);
        cursor++;
        var voice = voices[name], fields = {};
        while (cursor < lines.length && /^(M|K):/.test(lines[cursor])) {
          var field = lines[cursor].charAt(0), value = lines[cursor].slice(2);
          fail(fields[field], context + ": duplicate " + field + ": field");
          fields[field] = true;
          if (field === "M") voice.meter = meterValue(value);
          else { keyAccidentals(value); voice.key = value; voice.keys.push([voice.time, value]); }
          cursor++;
        }
        fail(cursor >= lines.length, context + ": missing music line");
        var line = lines[cursor];
        fail(line.charAt(line.length - 1) !== "|", context + ": music line must end with a plain barline");
        cursor++;
        var bars = [];
        line.slice(0, -1).split("|").forEach(function (bar) {
          bar = bar.trim();
          fail(!bar, context + ": empty measure or unsupported double/repeat barline");
          var rest = /^Z([2-4])?$/.exec(bar);
          if (rest) for (var i = 0; i < +(rest[1] || 1); i++) bars.push("Z");
          else bars.push(bar);
        });
        fail(bars.length < 1 || bars.length > 4, context + ": expected 1–4 measures after expanding Z rests");
        counts.push(bars.length);
        bars.forEach(function (bar) { parseBar(bar, voice, unit, context + ", bar " + (voice.bars.length + 1)); });
      });
      fail(counts[0] !== counts[1], "group " + group + ": voices have different measure counts");
    }
    VOICES.forEach(function (name) { fail(voices[name].pending !== null, name + ": unresolved tie at end of score"); });
    fail(voices.Ins.chords.length, "Native chord symbols belong in Vocal, not Ins");
    var grid = function (v) { return v.bars.map(function (b) { return str(b[0]) + ":" + str(b[1]) + ":" + b[2].join("/"); }).join(","); };
    fail(grid(voices.Vocal) !== grid(voices.Ins), "Voice meter/time grids differ");
    var keyline = function (v) { return v.keys.map(function (k) { return str(k[0]) + ":" + k[1]; }).join(","); };
    fail(keyline(voices.Vocal) !== keyline(voices.Ins), "Voice key-change timelines differ");
    return { text: text, unit: unit, bpm: +tm[1], key: key, meter: meter, voices: voices, sections: sections };
  }

  // ---- the numbers a person wants: per voice, and the ratio
  var NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
  function noteName(p) { return NAMES[p % 12] + (Math.floor(p / 12) - 1); }
  function report(score) {
    var total = score.voices.Vocal.time, secs = num(total) * 60 / score.bpm, out = { bpm: score.bpm, key: score.key,
      meter: score.meter.join("/"), quarters: num(total), seconds: secs, bars: score.voices.Vocal.bars.length, sections: score.sections.length, voices: {} };
    VOICES.forEach(function (name) {
      var v = score.voices[name], sounding = v.notes.reduce(function (s, n) { return s + num(n[2]); }, 0);
      var lo = Infinity, hi = -Infinity;
      v.notes.forEach(function (n) { lo = Math.min(lo, n[1]); hi = Math.max(hi, n[1]); });
      out.voices[name] = { notes: v.notes.length, chords: v.chords.length, sounding: num(total) ? sounding / num(total) : 0,
        low: v.notes.length ? noteName(lo) : "—", high: v.notes.length ? noteName(hi) : "—", lowMidi: lo, highMidi: hi,
        perMinute: secs ? v.notes.length / (secs / 60) : 0 };
    });
    var ins = out.voices.Ins.notes, voc = out.voices.Vocal.notes;
    out.ratio = voc ? ins / voc : null;                       // Ins notes per Vocal note
    var g = gcd(ins, voc);
    out.ratioText = voc && ins ? (ins / g) + " : " + (voc / g) : "—";
    return out;
  }

  function markers(score) {
    return score.sections.map(function (s) { return { quarters: num(s[0]), seconds: num(s[0]) * 60 / score.bpm, name: s[1] }; });
  }

  // ---- MIDI out: format 1, 480 ticks a quarter; track 0 holds tempo, meters, keys and markers
  var PPQ = 480;
  function vlq(n) { var b = [n & 127]; while ((n >>= 7)) b.unshift((n & 127) | 128); return b; }
  function textBytes(s) { return Array.from(new TextEncoder().encode(s)); }
  function track(events) {   // events: [tick, bytes]; sorted, stable
    events.sort(function (a, b) { return a[0] - b[0] || a[2] - b[2]; });
    var out = [], last = 0;
    events.forEach(function (e) { out = out.concat(vlq(e[0] - last), e[1]); last = e[0]; });
    out = out.concat([0, 0xff, 0x2f, 0]);
    var len = out.length;
    return [0x4d, 0x54, 0x72, 0x6b, (len >>> 24) & 255, (len >>> 16) & 255, (len >>> 8) & 255, len & 255].concat(out);
  }
  function tick(q) { return Math.round(num(q) * PPQ); }
  function toMidi(score) {
    var conductor = [], mpq = Math.round(60000000 / score.bpm), seq = 0;
    conductor.push([0, [0xff, 0x03].concat(vlq(textBytes("YuE2 OS").length), textBytes("YuE2 OS")), seq++]);
    conductor.push([0, [0xff, 0x51, 3, (mpq >>> 16) & 255, (mpq >>> 8) & 255, mpq & 255], seq++]);
    var lastMeter = "";
    score.voices.Vocal.bars.forEach(function (b) {
      var m = b[2].join("/");
      if (m === lastMeter) return;
      lastMeter = m;
      conductor.push([tick(b[0]), [0xff, 0x58, 4, b[2][0], Math.round(Math.log2(b[2][1])), 24, 8], seq++]);
    });
    score.voices.Vocal.keys.forEach(function (k) {
      var minor = /m$/.test(k[1]);
      conductor.push([tick(k[0]), [0xff, 0x59, 2, (KEYS[k[1]] + 256) & 255, minor ? 1 : 0], seq++]);
    });
    score.sections.forEach(function (s) {
      var t = textBytes(s[1]);
      conductor.push([tick(s[0]), [0xff, 0x06].concat(vlq(t.length), t), seq++]);
    });
    var tracks = [track(conductor)];
    VOICES.forEach(function (name, ch) {
      var ev = [], t = textBytes(name);
      ev.push([0, [0xff, 0x03].concat(vlq(t.length), t), seq++]);
      ev.push([0, [0xc0 | ch, name === "Vocal" ? 52 : 48], seq++]);     // choir aahs · strings: a sketch, not a mix
      score.voices[name].notes.forEach(function (n) {
        ev.push([tick(add(n[0], n[2])), [0x80 | ch, n[1], 0], seq++]);   // offs before ons at the same tick
        ev.push([tick(n[0]), [0x90 | ch, n[1], name === "Vocal" ? 96 : 80], seq + 100000]);
        seq++;
      });
      tracks.push(track(ev));
    });
    var head = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, tracks.length, (PPQ >> 8) & 255, PPQ & 255];
    return new Uint8Array(tracks.reduce(function (a, t) { return a.concat(t); }, head));
  }

  // ---- MIDI in: each track with notes is one melodic line; the first two become Vocal and Ins
  // (by name when a track is called vocal/voice/ins…, else in order). Overlaps are cut, the grid
  // is 1/16 by default, notes are spelled in the key (the file's key signature, or the one given).
  function readMidi(bytes) {
    var p = 0;
    function u32() { var v = (bytes[p] << 24) | (bytes[p + 1] << 16) | (bytes[p + 2] << 8) | bytes[p + 3]; p += 4; return v >>> 0; }
    function u16() { var v = (bytes[p] << 8) | bytes[p + 1]; p += 2; return v; }
    function rv() { var v = 0, b; do { b = bytes[p++]; v = (v << 7) | (b & 127); } while (b & 128); return v; }
    fail(String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== "MThd", "Not a MIDI file");
    p = 4; var hl = u32(), fmt = u16(), ntr = u16(), div = u16(); p = 8 + hl;
    fail(div & 0x8000, "SMPTE-timed MIDI files are not supported");
    var tracks = [], tempo = null, meter = null, key = null;
    for (var t = 0; t < ntr && p < bytes.length; t++) {
      fail(String.fromCharCode(bytes[p], bytes[p + 1], bytes[p + 2], bytes[p + 3]) !== "MTrk", "Broken MIDI track");
      p += 4; var end = u32(); end += p;
      var now = 0, run = 0, name = "", on = {}, notes = [];
      while (p < end) {
        now += rv();
        var st = bytes[p];
        if (st & 0x80) { p++; if (st < 0xf0) run = st; } else st = run;
        var type = st & 0xf0;
        if (st === 0xff) {
          var mt = bytes[p++], len = rv(), data = bytes.slice(p, p + len); p += len;
          if (mt === 0x03 && !name) name = new TextDecoder().decode(new Uint8Array(data));
          if (mt === 0x51 && tempo === null) tempo = Math.round(60000000 / ((data[0] << 16) | (data[1] << 8) | data[2]));
          if (mt === 0x58 && meter === null) meter = [data[0], Math.pow(2, data[1])];
          if (mt === 0x59 && key === null) key = { sf: data[0] > 127 ? data[0] - 256 : data[0], minor: data[1] === 1 };
        } else if (st === 0xf0 || st === 0xf7) { var sl = rv(); p += sl; }   // the length first: "p += rv()" read p before rv() moved it
        else if (type === 0x90 || type === 0x80) {
          var n = bytes[p++], vel = bytes[p++];
          if (type === 0x90 && vel > 0) on[n] = now;
          else if (n in on) { notes.push([on[n], n, now - on[n]]); delete on[n]; }
        } else if (type === 0xc0 || type === 0xd0) p += 1;
        else p += 2;
      }
      p = end;
      if (notes.length) tracks.push({ name: name, notes: notes.sort(function (a, b) { return a[0] - b[0] || b[1] - a[1]; }) });
    }
    return { format: fmt, ppq: div, tracks: tracks, tempo: tempo, meter: meter, key: key };
  }

  var MAJOR_BY_SF = { "-7": "Cb", "-6": "Gb", "-5": "Db", "-4": "Ab", "-3": "Eb", "-2": "Bb", "-1": "F", 0: "C", 1: "G", 2: "D", 3: "A", 4: "E", 5: "B", 6: "F#", 7: "C#" };
  var MINOR_BY_SF = { "-7": "Abm", "-6": "Ebm", "-5": "Bbm", "-4": "Fm", "-3": "Cm", "-2": "Gm", "-1": "Dm", 0: "Am", 1: "Em", 2: "Bm", 3: "F#m", 4: "C#m", 5: "G#m", 6: "D#m", 7: "A#m" };

  // spell a MIDI pitch in a key: [letter, alteration, octave]
  function spell(pitch, key) {
    var sig = keyAccidentals(key), sharpSide = KEYS[key] >= 0, pc = ((pitch % 12) + 12) % 12, best = null;
    "CDEFGAB".split("").forEach(function (l) {
      for (var a = -2; a <= 2; a++) {
        if (((NATURAL[l] + a) % 12 + 12) % 12 !== pc) continue;
        var score = (a === sig[l] ? 0 : 10) + Math.abs(a) + (a < 0 && sharpSide ? 1 : 0) + (a > 0 && !sharpSide ? 1 : 0);
        if (!best || score < best.s) best = { l: l, a: a, s: score };
      }
    });
    var oct = Math.floor((pitch - NATURAL[best.l] - best.a) / 12) - 1;
    return [best.l, best.a, oct];
  }
  function written(l, oct) {
    var s = oct >= 5 ? l.toLowerCase() : l;
    if (oct > 5) s += new Array(oct - 5 + 1).join("'");
    if (oct < 4) s += new Array(4 - oct + 1).join(",");
    return s;
  }
  // a length in grid units as a chain of supported lengths, longest first
  function pieces(units) {
    var list = [48, 32, 24, 16, 12, 8, 6, 4, 3, 2, 1], out = [];
    while (units > 0) { for (var i = 0; i < list.length; i++) if (list[i] <= units) { out.push(list[i]); units -= list[i]; break; } }
    return out;
  }

  function fromMidi(bytes, opts) {
    opts = opts || {};
    var m = readMidi(bytes);
    fail(!m.tracks.length, "No notes in this MIDI file");
    var pick = function (re) { return m.tracks.filter(function (t) { return re.test(t.name); })[0]; };
    var vocal = pick(/vocal|voice|vox|melody|sing/i) || m.tracks[0];
    var ins = pick(/^ins|instr|inst\.?$|accomp/i);
    if (!ins || ins === vocal) ins = m.tracks.filter(function (t) { return t !== vocal; })[0] || null;
    var meter = opts.meter || m.meter || [4, 4];
    var key = opts.key || (m.key ? (m.key.minor ? MINOR_BY_SF : MAJOR_BY_SF)[m.key.sf] : "C");
    keyAccidentals(key);
    var bpm = opts.bpm || m.tempo || 120;
    var L = opts.unit || 16;                                     // L:1/16 grid
    var perQuarter = L / 4, ticksPerUnit = m.ppq / perQuarter;
    var barUnits = meter[0] * L / meter[1];
    fail(barUnits !== Math.round(barUnits), "The meter " + meter.join("/") + " does not fit a 1/" + L + " grid");
    // quantize each line, monophonic: a note ends where the next begins
    function line(t) {
      if (!t) return [];
      var q = t.notes.map(function (n) { return [Math.round(n[0] / ticksPerUnit), n[1], Math.max(1, Math.round(n[2] / ticksPerUnit))]; });
      var out = [];
      q.forEach(function (n) {
        var prev = out[out.length - 1];
        if (prev && n[0] <= prev[0]) return;                        // a chord: its top note stays
        if (prev && prev[0] + prev[2] > n[0]) prev[2] = n[0] - prev[0];
        out.push(n);
      });
      return out;
    }
    var lines = { Vocal: line(vocal), Ins: line(ins) };
    var endUnits = Math.max.apply(null, VOICES.map(function (v) { var l = lines[v]; return l.length ? l[l.length - 1][0] + l[l.length - 1][2] : 0; }));
    var nbars = Math.max(1, Math.ceil(endUnits / barUnits));
    // per voice, per bar: tokens
    function bars(notes, withChords) {
      var out = [], i = 0, carry = null;                          // carry: a note tied into the next bar
      for (var b = 0; b < nbars; b++) {
        var start = b * barUnits, stop = start + barUnits, at = start, toks = [], local = {}, sig = keyAccidentals(key);
        var emit = function (pitch, len, tie) {
          var sp = spell(pitch, key), cur = sp[0] in local ? local[sp[0]] : sig[sp[0]], accs = "";
          if (sp[1] !== cur) { accs = { "-2": "__", "-1": "_", 0: "=", 1: "^", 2: "^^" }[sp[1]]; local[sp[0]] = sp[1]; }
          var parts = pieces(len);
          parts.forEach(function (u, k) {
            toks.push((k === 0 ? accs : "") + written(sp[0], sp[2]) + (u === 1 ? "" : u) + (k < parts.length - 1 || tie ? "-" : ""));
          });
        };
        var rest = function (len) { if (len > 0) pieces(len).forEach(function (u) { toks.push("z" + (u === 1 ? "" : u)); }); };
        if (carry) {
          var cl = Math.min(carry.left, barUnits);
          emit(carry.pitch, cl, carry.left > cl);
          at = start + cl;
          carry = carry.left > cl ? { pitch: carry.pitch, left: carry.left - cl } : null;
        }
        while (i < notes.length && notes[i][0] < stop) {
          var n = notes[i];
          if (n[0] < at) { i++; continue; }
          rest(n[0] - at);
          var len = Math.min(n[2], stop - n[0]);
          emit(n[1], len, n[2] > len);
          if (n[2] > len) carry = { pitch: n[1], left: n[2] - len };
          at = n[0] + len;
          i++;
        }
        if (!carry) rest(stop - at);
        out.push(toks.every(function (x) { return x.charAt(0) === "z"; }) ? "Z" : toks.join(""));
      }
      return out;
    }
    var vb = bars(lines.Vocal), ib = bars(lines.Ins);
    var text = ["X:1", "T:", "M:" + meter.join("/"), "L:1/" + L, "Q:1/4=" + bpm,
                'V: Vocal clef=treble name="Vocal Melody" snm="Vocal"', 'V: Ins clef=treble name="Ins Melody" snm="Inst."', "K:" + key];
    for (var b = 0; b < nbars; b += 4) {
      text.push("V: Vocal", vb.slice(b, b + 4).join("|") + "|", "V: Ins", ib.slice(b, b + 4).join("|") + "|");
    }
    var abc = text.join("\n");
    var check = parse(abc);                                       // the result must read back
    return { abc: abc, report: report(check), from: { vocal: vocal.name || "track 1", ins: ins ? ins.name || "track 2" : "(none)", tracks: m.tracks.length } };
  }

  // ---- one voice by scale steps (diatonic), in the key it stands in; its chromatic notes keep
  // their distance from the scale. Only that voice's music lines change, chord symbols stay.
  function shiftVoice(text, voiceName, steps) {
    var score = parse(text);                                       // fail closed before touching it
    var lines = String(text).replace(/\r/g, "").split("\n"), current = null, key = score.key, moved = 0, lowest = 127, highest = 0;
    var LET = "CDEFGAB";
    for (var li = 8; li < lines.length; li++) {
      var ln = lines[li];
      if (/^V: /.test(ln)) { current = ln.slice(3).trim(); continue; }
      if (/^K:/.test(ln)) { key = ln.slice(2); continue; }
      if (/^(%|[A-Za-z]:)/.test(ln)) continue;
      if (current !== voiceName) continue;
      var res = "", i = 0, localIn = {}, localOut = {}, k = key;
      while (i < ln.length) {
        var ch = ln.charAt(i);
        if (ch === "|") { localIn = {}; localOut = {}; res += ch; i++; continue; }
        if (ch === '"') { var q = ln.indexOf('"', i + 1); res += ln.slice(i, q + 1); i = q + 1; continue; }
        if (ch === "[") { var c = ln.indexOf("]", i); var f = ln.slice(i, c + 1); var km = /^\[K:(.+)\]$/.exec(f); if (km) { k = km[1]; localIn = {}; localOut = {}; } res += f; i = c + 1; continue; }
        TOKEN.lastIndex = i;
        var m = TOKEN.exec(ln);
        if (!m || m[4] === undefined || m[4] === "z") { res += m ? m[0] : ch; i = m ? TOKEN.lastIndex : i + 1; continue; }
        var sig = keyAccidentals(k), L0 = m[4].toUpperCase();
        var oct = (m[4] !== L0 ? 5 : 4) + (m[5].match(/'/g) || []).length - (m[5].match(/,/g) || []).length;
        var aIn = m[3] ? { "=": 0, "_": -1, "__": -2, "^": 1, "^^": 2 }[m[3]] : (L0 in localIn ? localIn[L0] : sig[L0]);
        if (m[3]) localIn[L0] = aIn;
        var off = aIn - sig[L0];                                    // the note's own inflection
        var idx = LET.indexOf(L0) + steps, L1 = LET.charAt(((idx % 7) + 7) % 7), oct1 = oct + Math.floor(idx / 7);
        var aOut = sig[L1] + off, cur = L1 in localOut ? localOut[L1] : sig[L1];
        fail(Math.abs(aOut) > 2, "A note would need more than a double accidental");
        var accs = "";
        if (aOut !== cur) { accs = { "-2": "__", "-1": "_", 0: "=", 1: "^", 2: "^^" }[aOut]; localOut[L1] = aOut; }
        else if (m[3] && aOut !== sig[L1]) { accs = { "-2": "__", "-1": "_", 0: "=", 1: "^", 2: "^^" }[aOut]; }
        var pitch = 12 * (oct1 + 1) + NATURAL[L1] + aOut;
        lowest = Math.min(lowest, pitch); highest = Math.max(highest, pitch);
        res += accs + written(L1, oct1) + m[6] + m[7];
        moved++;
        i = TOKEN.lastIndex;
      }
      lines[li] = res;
    }
    var out = lines.join("\n");
    parse(out);                                                    // and must read back
    return { abc: out, notes: moved, low: noteName(lowest), high: noteName(highest) };
  }

  window.HeresyAbc = { parse: parse, report: report, markers: markers, toMidi: toMidi, fromMidi: fromMidi,
                       shiftVoice: shiftVoice, noteName: noteName };
})();
