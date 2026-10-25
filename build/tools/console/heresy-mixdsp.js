// HERESY 1531 (Viktor 18.10.2026: «Преврати твой DAW начаток в профессиональный миксер как ты умеешь»): the mixer's own sound
// work, the part the browser's nodes cannot do as the render does it. The compressor is Plenio's (lab/plenio_core/audio/dynamics.py:
// linked feed-forward, an RMS detector over 1 ms cells, a soft knee, attack and release on the reduction, the gain drawn between
// the cells' ends), streamed: one cell later than it came, every strip alike, so the strips stay sample for sample together. The
// meters: peaks and RMS of every strip, and on the master the K-weighted loudness (BS.1770, Plenio's filters), a 4× true peak and
// the correlation of the sides. One source of truth, run where the page can: in the audio thread (an AudioWorklet, built from this
// very function) when the page is a secure context, as on localhost; on the page's thread (a ScriptProcessor) when it is not, as
// when the studio is opened by its address on the network. The same numbers either way.
(function () {
  "use strict";

  function kernel(G) {
    var LN = Math.LN10 / 20;
    function softKnee(level, th, ratio, knee) {
      var over = level - th, slope = 1 / ratio - 1;
      if (knee === 0) return slope * Math.max(over, 0);
      if (over <= -knee / 2) return 0;
      if (over >= knee / 2) return slope * over;
      return slope * (over + knee / 2) * (over + knee / 2) / (2 * knee);
    }
    // ---- the compressor, one strip: its input gathered a cell at a time, its output a cell behind
    function Comp(rate, ch) {
      this.rate = rate; this.ch = ch || 2;
      this.cell = Math.max(1, Math.round(rate / 1000));
      this.L = new Float64Array(this.cell); this.R = new Float64Array(this.cell); this.fill = 0;
      this.KL = new Float64Array(this.cell); this.KR = new Float64Array(this.cell); this.keyIdx = -1;   // HERESY 1537: what a key brings
      this.cap = 2 * this.cell + 16384;
      this.qL = new Float32Array(this.cap); this.qR = new Float32Array(this.cap); this.head = 0; this.size = this.cell;   // a cell of silence: the latency
      this.prev = 0; this.last = 0; this.gr = 0; this.lvl = -150;
      this.gPrev = 0; this.gLast = 0; this.ggr = 0; this.gOn = false;   // HERESY 1760: the gate's own
      this.set({});
    }
    Comp.prototype.set = function (p) {
      p = p || {};
      this.on = !!p.on;
      this.th = p.threshold_db != null ? +p.threshold_db : -18; this.ratio = p.ratio != null ? +p.ratio : 2; this.knee = p.knee_db != null ? +p.knee_db : 6;
      var att = p.attack_ms != null ? +p.attack_ms : 10, rel = p.release_ms != null ? +p.release_ms : 120;
      this.aC = Math.exp(-this.cell / (this.rate * att / 1000)); this.rC = Math.exp(-this.cell / (this.rate * rel / 1000));
      this.mk = Math.exp((p.makeup_db || 0) * LN);
      this.mix = p.mix != null && isFinite(+p.mix) ? Math.max(0, Math.min(1, +p.mix)) : 1;   // HERESY 1759: parallel compression, the wet's share
      var gt = p.gate;                               // HERESY 1760: the gate, a downward expander listening to the strip itself
      this.gOn = !!(gt && gt.on);
      if (this.gOn) {
        this.gTh = +gt.threshold_db; this.gRatio = Math.max(1, +gt.ratio); this.gRange = Math.max(0, +gt.range_db);
        this.gA = Math.exp(-this.cell / (this.rate * Math.max(0.1, +gt.attack_ms) / 1000)); this.gR = Math.exp(-this.cell / (this.rate * Math.max(1, +gt.release_ms) / 1000));
      } else { this.gPrev = 0; this.gLast = 0; }
      this.keyIdx = p.keyRel != null && p.keyRel >= 0 ? p.keyRel : -1;   // HERESY 1537: another strip of the bank it listens to
      if (!this.on) { this.prev = 0; }
    };
    Comp.prototype.cellDone = function () {
      var c = this.cell, L = this.L, R = this.R, ss = 0, i, red = 0, DL = this.keyed ? this.KL : L, DR = this.keyed ? this.KR : R;
      for (i = 0; i < c; i++) ss += DL[i] * DL[i] + (this.ch > 1 ? DR[i] * DR[i] : 0);
      var level = 20 * Math.log10(Math.max(Math.sqrt(ss / (c * this.ch)), 1e-15));
      this.lvl = level;
      if (this.on) {
        var target = softKnee(level, this.th, this.ratio, this.knee), k = target < this.prev ? this.aC : this.rC;
        this.prev = k * this.prev + (1 - k) * target;
        red = this.prev;
      }
      var gred = 0;
      if (this.gOn) {                                // HERESY 1760: the gate's level is the strip's own, the compressor keyed or not
        var gl = level;
        if (this.keyed) { var so = 0; for (i = 0; i < c; i++) so += L[i] * L[i] + (this.ch > 1 ? R[i] * R[i] : 0); gl = 20 * Math.log10(Math.max(Math.sqrt(so / (c * this.ch)), 1e-15)); }
        var gtg = gl >= this.gTh ? 0 : Math.max(-this.gRange, (this.gRatio - 1) * (gl - this.gTh)), gk = gtg > this.gPrev ? this.gA : this.gR;   // opening by the attack, closing by the release
        this.gPrev = gk * this.gPrev + (1 - gk) * gtg;
        gred = this.gPrev;
      }
      var v0 = this.on ? this.last : 0, gm = this.on ? this.mk : 1, w0 = this.gLast, cap = this.cap, at = (this.head + this.size) % cap;
      for (i = 0; i < c; i++) {
        var g = this.on ? (1 - this.mix) + this.mix * Math.exp((v0 + (red - v0) * i / c) * LN) * gm : 1;   // HERESY 1759: blended with the dry (mix 1: as before)
        if (this.gOn) g *= Math.exp((w0 + (gred - w0) * i / c) * LN);   // HERESY 1760: the gate's gain over it
        this.qL[at] = L[i] * g; this.qR[at] = R[i] * g;
        at = at + 1 === cap ? 0 : at + 1;
      }
      this.size += c;
      this.last = red;
      if (-red > this.gr) this.gr = -red;
      this.gLast = gred;                               // HERESY 1760
      if (-gred > this.ggr) this.ggr = -gred;
    };
    Comp.prototype.run = function (inL, inR, outL, outR, n, kL, kR) {
      var i, c = this.cell;
      this.keyed = !!kL;                               // HERESY 1537: the detector fed by the key's block
      for (i = 0; i < n; i++) {
        if (kL) { this.KL[this.fill] = kL[i]; this.KR[this.fill] = kR ? kR[i] : kL[i]; }
        this.L[this.fill] = inL ? inL[i] : 0; this.R[this.fill] = inR ? inR[i] : (inL ? inL[i] : 0);
        if (++this.fill === c) { this.cellDone(); this.fill = 0; }
      }
      var cap = this.cap;
      for (i = 0; i < n; i++) {
        outL[i] = this.qL[this.head]; if (outR) outR[i] = this.qR[this.head];
        this.head = this.head + 1 === cap ? 0 : this.head + 1;
      }
      this.size -= n;
    };
    // ---- a meter: a stereo pair's peaks and mean squares since it was last read; on the master, the loudness and the true peak too
    function kw(rate) {
      var f0 = 1681.974450955533, gdb = 3.999843853973347, q = 0.7071752369554196, k = Math.tan(Math.PI * f0 / rate);
      var vh = Math.pow(10, gdb / 20), vb = Math.pow(vh, 0.4996667741545416), a0 = 1 + k / q + k * k;
      var shelf = [(vh + vb * k / q + k * k) / a0, 2 * (k * k - vh) / a0, (vh - vb * k / q + k * k) / a0, 2 * (k * k - 1) / a0, (1 - k / q + k * k) / a0];
      f0 = 38.13547087602444; q = 0.5003270373238773; k = Math.tan(Math.PI * f0 / rate);
      var den = 1 + k / q + k * k;
      return [shelf, [1, -2, 1, 2 * (k * k - 1) / den, (1 - k / q + k * k) / den]];
    }
    function tpTaps() {                                // a 4× interpolator: a Kaiser-windowed sinc, 12 taps a phase
      var K = 24, beta = 8, h = [], i0 = function (x) { var s = 1, t = 1, k; for (k = 1; k < 30; k++) { t *= (x / 2) / k; s += t * t; } return s; };
      for (var m = -K; m <= K; m++) {
        var x = m / 4, sinc = m === 0 ? 1 : Math.sin(Math.PI * x * 0.92) / (Math.PI * x * 0.92), r = m / K;
        h.push(0.92 * sinc * i0(beta * Math.sqrt(Math.max(0, 1 - r * r))) / i0(beta));
      }
      var ph = [[], [], [], []];
      for (var j = 0; j < h.length; j++) ph[(j + K) % 4].push(h[j]);
      return ph;
    }
    function Meter(rate, master) {
      this.rate = rate; this.master = !!master;
      this.reset();
      if (master) {
        this.kw = kw(rate); this.z = [[0, 0, 0, 0], [0, 0, 0, 0]];   // two sections a side, direct form II transposed
        this.block = Math.round(0.1 * rate); this.bn = 0; this.bs = 0;
        this.ph = tpTaps(); this.hist = [new Float64Array(16), new Float64Array(16)]; this.hp = 0;
      }
    }
    Meter.prototype.reset = function () { this.pk = [0, 0]; this.ss = [0, 0]; this.n = 0; this.xy = 0; this.tp = 0; this.blocks = []; };
    Meter.prototype.feed = function (inL, inR, n) {
      var pk0 = this.pk[0], pk1 = this.pk[1], s0 = 0, s1 = 0, xy = 0, i, a, b;
      for (i = 0; i < n; i++) {
        a = inL ? inL[i] : 0; b = inR ? inR[i] : a;
        var aa = a < 0 ? -a : a, bb = b < 0 ? -b : b;
        if (aa > pk0) pk0 = aa; if (bb > pk1) pk1 = bb;
        s0 += a * a; s1 += b * b; xy += a * b;
        if (this.master) this.loud(a, b);
      }
      this.pk[0] = pk0; this.pk[1] = pk1; this.ss[0] += s0; this.ss[1] += s1; this.xy += xy; this.n += n;
    };
    Meter.prototype.loud = function (a, b) {
      var w = 0, side, x, y, s, z, sec, c;
      for (side = 0; side < 2; side++) {
        x = side ? b : a;
        z = this.z[side];
        for (sec = 0; sec < 2; sec++) {
          c = this.kw[sec];
          y = c[0] * x + z[sec * 2];
          z[sec * 2] = c[1] * x - c[3] * y + z[sec * 2 + 1];
          z[sec * 2 + 1] = c[2] * x - c[4] * y;
          x = y;
        }
        w += x * x;
      }
      this.bs += w;
      if (++this.bn === this.block) { this.blocks.push(this.bs / this.block); this.bs = 0; this.bn = 0; }
      // the true peak: three points between this sample and the last, as a 4× interpolator draws them
      var hp = this.hp = (this.hp + 1) & 15;
      this.hist[0][hp] = a; this.hist[1][hp] = b;
      for (side = 0; side < 2; side++) {
        var hs = this.hist[side];
        for (var p = 1; p < 4; p++) {
          var taps = this.ph[p], acc = 0;
          for (var k = 0; k < taps.length; k++) acc += taps[k] * hs[(hp - k + 16) & 15];
          if (acc < 0) acc = -acc;
          if (acc > this.tp) this.tp = acc;
        }
        var v = side ? b : a; if (v < 0) v = -v; if (v > this.tp) this.tp = v;
      }
    };
    Meter.prototype.take = function () {
      var o = { pk: this.pk.slice(), ss: this.ss.slice(), n: this.n, xy: this.xy };
      if (this.master) { o.tp = this.tp; o.blocks = this.blocks; }
      this.reset();
      return o;
    };
    function merge(a, b) {                              // two takes of one meter, the later after the earlier
      if (!a) return b;
      if (!b) return a;
      var o = { pk: [Math.max(a.pk[0], b.pk[0]), Math.max(a.pk[1], b.pk[1])], ss: [a.ss[0] + b.ss[0], a.ss[1] + b.ss[1]], n: a.n + b.n, xy: a.xy + b.xy };
      if (a.blocks || b.blocks) { o.tp = Math.max(a.tp || 0, b.tp || 0); o.blocks = (a.blocks || []).concat(b.blocks || []); }
      return o;
    }
    // ---- the banks: every strip's compressor in one node, every meter in another (2 channels a strip, at most 16 strips a bank)
    function CompBank(rate, n, ch) { this.c = []; for (var i = 0; i < n; i++) this.c.push(new Comp(rate, ch)); }
    var ZERO = new Float32Array(16384);
    CompBank.prototype.run = function (ins, outs, n) {
      for (var i = 0; i < this.c.length; i++) {
        var k = this.c[i].keyIdx, keyed = k >= 0 && k !== i && k < this.c.length;   // HERESY 1537: a key silent is silence, not the strip itself
        this.c[i].run(ins[2 * i], ins[2 * i + 1], outs[2 * i], outs[2 * i + 1], n, keyed ? (ins[2 * k] || ZERO) : null, keyed ? (ins[2 * k + 1] || ins[2 * k] || ZERO) : null);
      }
    };
    CompBank.prototype.gr = function () { return this.c.map(function (c) { var g = c.gr; c.gr = 0; return g; }); };
    CompBank.prototype.ggr = function () { return this.c.map(function (c) { var g = c.ggr; c.ggr = 0; return g; }); };   // HERESY 1760: the gates' reduction
    function MeterBank(rate, n, master) { this.m = []; for (var i = 0; i < n; i++) this.m.push(new Meter(rate, i === master)); }
    MeterBank.prototype.run = function (ins, n) { for (var i = 0; i < this.m.length; i++) this.m[i].feed(ins[2 * i], ins[2 * i + 1], n); };
    MeterBank.prototype.take = function () { return this.m.map(function (m) { return m.take(); }); };
    // ---- HERESY 1544: Plenio's limiter, streamed. Its FIR is scipy's resample_poly design for 4×: firwin(81, 1/4, Kaiser β 10)
    function firwin81() {
      var N = 81, h = new Float64Array(N), s = 0, i0 = function (x) { var sum = 1, t = 1; for (var k = 1; k < 60; k++) { t *= (x / 2) / k; sum += t * t; } return sum; };
      for (var i = 0; i < N; i++) {
        var m = i - 40, x = 0.25 * m, r = (i - 40) / 40;
        h[i] = 0.25 * (m === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x)) * i0(10 * Math.sqrt(Math.max(0, 1 - r * r))) / i0(10);
        s += h[i];
      }
      for (i = 0; i < N; i++) h[i] /= s;
      return h;
    }
    function Limiter(rate) {
      this.rate = rate; this.h = firwin81();
      this.look = Math.max(1, Math.round(rate * 4 * 3 / 1000));   // Plenio's 3 ms, in oversampled samples
      this.delay = 20 + Math.floor(this.look / 4);
      var S2 = this.look + 8;
      this.S = S2; this.uL = new Float64Array(S2); this.uR = new Float64Array(S2); this.d = new Float64Array(S2);
      this.f = new Float64Array(this.look + 2); this.fsum = 0;
      this.dq = new Int32Array(S2); this.dh = 0; this.dt = 0;  // the demand's maximum over the lookahead: a deque of indices
      this.xL = new Float64Array(32); this.xR = new Float64Array(32);   // the input, 21 samples of it at a time
      this.oL = new Float64Array(128); this.oR = new Float64Array(128); // the gained oversampled sound, for the way down
      this.pL = new Float64Array(this.delay); this.pR = new Float64Array(this.delay);   // the plain delay, when it is off
      this.n = 0; this.k = -40; this.R = 0; this.gr = 0; this.grNow = 0;
      this.set({});
    }
    Limiter.prototype.set = function (p) {
      p = p || {};
      this.on = !!p.on;
      var ceil = p.ceiling_db != null ? +p.ceiling_db : -1, rel = p.release_ms != null ? +p.release_ms : 100;
      this.thr = Math.pow(10, (ceil - 0.2) / 20);
      this.step = 12 / (this.rate * 4 * rel / 1000);
      this.drive = Math.pow(10, (p.drive_db || 0) / 20);
    };
    Limiter.prototype.one = function (inL, inR) {          // one sample in, one out (delay samples late)
      var h = this.h, xi = this.n & 31, look = this.look, S2 = this.S, i, p, t, m;
      this.xL[xi] = inL * this.drive; this.xR[xi] = inR * this.drive;
      // up: the four oversampled points of input sample n − 10
      for (p = 0; p < 4; p++) {
        var aL = 0, aR = 0;
        for (m = -10; m <= 10; m++) {                     // x[q + m], q = n − 10; tap 40 + p − 4m
          t = 40 + p - 4 * m;
          if (t < 0 || t > 80) continue;
          var j = (this.n - 10 + m) & 31;
          aL += h[t] * this.xL[j]; aR += h[t] * this.xR[j];
        }
        aL *= 4; aR *= 4;
        var k = this.k++, ks = ((k % S2) + S2) % S2;
        this.uL[ks] = aL; this.uR[ks] = aR;
        var a = Math.max(aL < 0 ? -aL : aL, aR < 0 ? -aR : aR), dd = a > this.thr ? 20 * Math.log10(a / this.thr) : 0;
        this.d[ks] = dd;
        // the maximum of the demand over [k − look, k] is f[k − look]
        while (this.dt > this.dh && this.d[((this.dq[(this.dt - 1) % S2] % S2) + S2) % S2] <= dd) this.dt--;
        this.dq[this.dt % S2] = k; this.dt++;
        var j0 = k - look;
        while (this.dq[this.dh % S2] < j0) this.dh++;
        var fj = this.d[((this.dq[this.dh % S2] % S2) + S2) % S2];
        // its mean over the last look + 1: the smoothed demand at j0
        var fi = ((j0 % (look + 2)) + look + 2) % (look + 2), old = this.f[((j0 - look - 1) % (look + 2) + look + 2) % (look + 2)];
        this.f[fi] = fj; this.fsum += fj - old;
        if (this.fsum < 1e-12) this.fsum = 0;
        var js = ((j0 % S2) + S2) % S2, r = Math.max(this.d[js], this.fsum / (look + 1));
        this.R = Math.max(this.R - this.step, r);
        var g = Math.exp(-this.R * LN), oi = j0 & 127;
        this.oL[oi] = this.uL[js] * g; this.oR[oi] = this.uR[js] * g;
        if (this.R > this.grNow) this.grNow = this.R;
        if ((j0 & 3) === 0) {                               // down: output sample (j0 − 40) / 4
          var bL = 0, bR = 0;
          for (t = 0; t <= 80; t++) { var oj = (j0 - t) & 127; bL += h[t] * this.oL[oj]; bR += h[t] * this.oR[oj]; }
          this.yL = bL; this.yR = bR;
        }
      }
      var pi = this.n % this.delay, qL = this.pL[pi], qR = this.pR[pi];   // the plain delay: what came delay samples ago
      this.pL[pi] = inL; this.pR[pi] = inR;
      this.n++;
      if (!this.on) return [qL, qR];
      return [this.yL, this.yR];
    };
    Limiter.prototype.run = function (inL, inR, outL, outR, n) {
      for (var i = 0; i < n; i++) {
        var a = inL ? inL[i] : 0, o = this.one(a, inR ? inR[i] : a);
        outL[i] = o[0]; if (outR) outR[i] = o[1];
      }
      if (this.on && this.grNow > this.gr) this.gr = this.grNow;
      this.grNow = 0;
    };
    // the master's chain: its compressor, then its limiter; a fixed delay, a cell and the limiter's
    function Master(rate) { this.comp = new Comp(rate, 2); this.lim = new Limiter(rate); this.tL = new Float32Array(16384); this.tR = new Float32Array(16384); this.delay = this.comp.cell + this.lim.delay; }
    Master.prototype.run = function (inL, inR, outL, outR, n) {
      var tL = this.tL.subarray(0, n), tR = this.tR.subarray(0, n);
      this.comp.run(inL, inR, tL, tR, n);
      this.lim.run(tL, tR, outL, outR, n);
    };
    Master.prototype.gr = function () { var o = [this.comp.gr, this.lim.gr]; this.comp.gr = 0; this.lim.gr = 0; return o; };
    G.Comp = Comp; G.Meter = Meter; G.CompBank = CompBank; G.MeterBank = MeterBank; G.merge = merge; G.softKnee = softKnee; G.Limiter = Limiter; G.Master = Master;

    if (typeof registerProcessor === "function" && typeof AudioWorkletProcessor === "function") {
      var EVERY = 1600;
      var CompProc = class extends AudioWorkletProcessor {
        constructor(options) {
          super();
          var me = this, o = options.processorOptions || {};
          me.bank = new CompBank(sampleRate, o.n, o.ch); me.since = 0;
          me.port.onmessage = function (e) { var d = e.data || {}; if (d.set && me.bank.c[d.set.i]) me.bank.c[d.set.i].set(d.set.p); };
        }
        process(inputs, outputs) {
          var inp = inputs[0] || [], out = outputs[0], n = out[0] ? out[0].length : 128;
          this.bank.run(inp, out, n);
          if ((this.since += n) >= EVERY) { this.since = 0; this.port.postMessage({ gr: this.bank.gr(), gg: this.bank.ggr() }); }   // HERESY 1760: gg
          return true;
        }
      };
      registerProcessor("ruach-comp-bank", CompProc);
      var MeterProc = class extends AudioWorkletProcessor {
        constructor(options) {
          super();
          var o = options.processorOptions || {};
          this.bank = new MeterBank(sampleRate, o.n, o.master); this.since = 0;
        }
        process(inputs, outputs) {
          var inp = inputs[0] || [], n = outputs[0] && outputs[0][0] ? outputs[0][0].length : 128;
          this.bank.run(inp, n);
          if ((this.since += n) >= EVERY) { this.since = 0; this.port.postMessage({ m: this.bank.take() }); }
          return true;
        }
      };
      registerProcessor("ruach-meter-bank", MeterProc);
      var MasterProc = class extends AudioWorkletProcessor {   // HERESY 1544
        constructor() {
          super();
          var me = this;
          me.m = new Master(sampleRate); me.since = 0;
          me.port.onmessage = function (e) { var d = e.data || {}; if (d.comp) me.m.comp.set(d.comp); if (d.limit) me.m.lim.set(d.limit); };
        }
        process(inputs, outputs) {
          var inp = inputs[0] || [], out = outputs[0], n = out[0] ? out[0].length : 128;
          this.m.run(inp[0], inp[1] || inp[0], out[0], out[1], n);
          if ((this.since += n) >= EVERY) { this.since = 0; this.port.postMessage({ mg: this.m.gr() }); }
          return true;
        }
      };
      registerProcessor("ruach-master", MasterProc);
    }
    return G;
  }

  var DSP = kernel({});
  var MOD = null;
  function moduleUrl() {
    if (!MOD) MOD = URL.createObjectURL(new Blob(["(" + kernel.toString() + ")({});"], { type: "application/javascript" }));
    return MOD;
  }

  // ---- the engine: the banks wired into a context, by worklet or by script processor
  // make(ctx, {strips: n, meters: m, master: index of the master among the meters, ch: 1 or 2, force: "script"})
  function make(ctx, o) {
    var n = o.strips, m = o.meters, ch = o.ch || 2, rate = ctx.sampleRate, useWorklet = !(o.force || window.ruachDspForce) && !!(ctx.audioWorklet && window.isSecureContext);   // ruachDspForce: the checks try the other road
    var e = { kind: useWorklet ? "worklet" : "script", cell: Math.max(1, Math.round(rate / 1000)), compIns: [], compOuts: [], meterIns: [], nodes: [],
              grAcc: [], mAcc: [], params: [], ggAcc: [] };   // HERESY 1760: ggAcc
    var SP = 4096;                                    // HERESY 1536: the page's thread may stall a few tens of ms; 85 ms of room
    e.latency = (e.cell + (useWorklet ? 0 : SP)) / rate;
    e.masterDelay = e.cell + 20 + Math.floor(Math.max(1, Math.round(rate * 4 * 3 / 1000)) / 4);   // HERESY 1544: the master's compressor and limiter
    e.masterLatency = (e.masterDelay + (useWorklet ? 0 : SP)) / rate;   // while the master's node is in the path
    e.mgAcc = [0, 0]; e.mparams = null;
    function split(target, chans, at) {               // a strip's stereo into two channels of a bank's input
      var s = ctx.createChannelSplitter(2);
      s.connect(target, 0, at); s.connect(target, ch > 1 ? 1 : 0, at + 1);
      e.nodes.push(s);
      return s;
    }
    var BANK = 16, cbanks = [], mbanks = [];
    function chunks(total) { var out = []; for (var a = 0; a < total; a += BANK) out.push([a, Math.min(total, a + BANK)]); return out; }
    e.ready = (useWorklet ? ctx.audioWorklet.addModule(moduleUrl()) : Promise.resolve()).then(function () {
      chunks(n).forEach(function (r) {
        var k = r[1] - r[0], merger = ctx.createChannelMerger(2 * k), outSplit = ctx.createChannelSplitter(2 * k), node;
        if (useWorklet) {
          node = new AudioWorkletNode(ctx, "ruach-comp-bank", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2 * k], channelCount: 2 * k,
                                                                 channelCountMode: "explicit", channelInterpretation: "discrete", processorOptions: { n: k, ch: ch } });
          node.port.onmessage = function (ev) { (ev.data.gr || []).forEach(function (g, j) { e.grAcc[r[0] + j] = Math.max(e.grAcc[r[0] + j] || 0, g); });
            (ev.data.gg || []).forEach(function (g, j) { e.ggAcc[r[0] + j] = Math.max(e.ggAcc[r[0] + j] || 0, g); }); };   // HERESY 1760
        } else {
          var bank = new DSP.CompBank(rate, k, ch);
          node = ctx.createScriptProcessor(SP, 2 * k, 2 * k);
          node.onaudioprocess = function (ev) {
            var ins = [], outs = [], c;
            for (c = 0; c < 2 * k; c++) { ins.push(ev.inputBuffer.getChannelData(c)); outs.push(ev.outputBuffer.getChannelData(c)); }
            bank.run(ins, outs, SP);
            bank.gr().forEach(function (g, j) { e.grAcc[r[0] + j] = Math.max(e.grAcc[r[0] + j] || 0, g); });
            bank.ggr().forEach(function (g, j) { e.ggAcc[r[0] + j] = Math.max(e.ggAcc[r[0] + j] || 0, g); });   // HERESY 1760
          };
          node.bank = bank;
        }
        merger.connect(node); node.connect(outSplit);
        cbanks.push({ from: r[0], node: node });
        for (var j = 0; j < k; j++) {
          e.compIns[r[0] + j] = split(merger, ch, 2 * j);
          var back = ctx.createChannelMerger(2);
          outSplit.connect(back, 2 * j, 0); outSplit.connect(back, 2 * j + 1, 1);
          e.compOuts[r[0] + j] = back;
          e.nodes.push(back);
        }
        e.nodes.push(merger, outSplit, node);
      });
      var sink = ctx.createGain();
      sink.gain.value = 0; sink.connect(ctx.destination); e.nodes.push(sink);
      chunks(m).forEach(function (r) {
        var k = r[1] - r[0], merger = ctx.createChannelMerger(2 * k), node, master = o.master >= r[0] && o.master < r[1] ? o.master - r[0] : -1;
        if (useWorklet) {
          node = new AudioWorkletNode(ctx, "ruach-meter-bank", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], channelCount: 2 * k,
                                                                  channelCountMode: "explicit", channelInterpretation: "discrete", processorOptions: { n: k, master: master } });
          node.port.onmessage = function (ev) { (ev.data.m || []).forEach(function (t, j) { e.mAcc[r[0] + j] = DSP.merge(e.mAcc[r[0] + j], t); }); };
        } else {
          var bank = new DSP.MeterBank(rate, k, master);
          node = ctx.createScriptProcessor(SP, 2 * k, 1);
          node.onaudioprocess = function (ev) {
            var ins = [];
            for (var c = 0; c < 2 * k; c++) ins.push(ev.inputBuffer.getChannelData(c));
            bank.run(ins, SP);
            bank.take().forEach(function (t, j) { e.mAcc[r[0] + j] = DSP.merge(e.mAcc[r[0] + j], t); });
          };
        }
        merger.connect(node); node.connect(sink);
        mbanks.push(node);
        for (var j = 0; j < k; j++) e.meterIns[r[0] + j] = split(merger, 2, 2 * j);
        e.nodes.push(merger, node);
      });
      var mnode;                                      // HERESY 1544: the master's chain, one node
      if (useWorklet) {
        mnode = new AudioWorkletNode(ctx, "ruach-master", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: "explicit", channelInterpretation: "speakers" });
        mnode.port.onmessage = function (ev) { var g2 = ev.data.mg; if (g2) { e.mgAcc[0] = Math.max(e.mgAcc[0], g2[0]); e.mgAcc[1] = Math.max(e.mgAcc[1], g2[1]); e.mgNew = true; } };
      } else {
        var mc = new DSP.Master(rate);
        mnode = ctx.createScriptProcessor(SP, 2, 2);
        mnode.onaudioprocess = function (ev) {
          mc.run(ev.inputBuffer.getChannelData(0), ev.inputBuffer.getChannelData(1), ev.outputBuffer.getChannelData(0), ev.outputBuffer.getChannelData(1), SP);
          var g2 = mc.gr(); e.mgAcc[0] = Math.max(e.mgAcc[0], g2[0]); e.mgAcc[1] = Math.max(e.mgAcc[1], g2[1]); e.mgNew = true;
        };
        mnode.master = mc;
      }
      e.masterIn = e.masterOut = mnode;
      e.nodes.push(mnode);
      e.params.forEach(function (p, i) { if (p) e.setComp(i, p); });
      if (e.mparams) e.setMaster(e.mparams);
      return e;
    });
    e.setComp = function (i, p) {
      e.params[i] = p;
      cbanks.forEach(function (b) {
        if (i < b.from || i >= b.from + BANK) return;
        var k = p.keyIndex, q = Object.assign({}, p, { keyRel: k != null && k >= b.from && k < b.from + BANK ? k - b.from : -1 });   // HERESY 1537
        if (b.node.port) b.node.port.postMessage({ set: { i: i - b.from, p: q } });
        else if (b.node.bank && b.node.bank.c[i - b.from]) b.node.bank.c[i - b.from].set(q);
      });
    };
    e.setMaster = function (p) {                      // HERESY 1544: {comp, limit}, each {on: false} when it is off
      e.mparams = p;
      var mn = e.masterIn;
      if (!mn) return;
      if (mn.port) mn.port.postMessage({ comp: p.comp, limit: p.limit });
      else if (mn.master) { mn.master.comp.set(p.comp); mn.master.lim.set(p.limit); }
    };
    e.read = function () { var o2 = { gr: e.grAcc, gg: e.ggAcc, m: e.mAcc, mg: e.mgNew ? e.mgAcc : null }; e.grAcc = []; e.ggAcc = []; e.mAcc = []; e.mgAcc = [0, 0]; e.mgNew = false; return o2; };   // 1544: mg null, no news; 1760: gg
    e.close = function () { e.nodes.forEach(function (x) { try { x.disconnect(); } catch (err) { /* gone */ } if (x.port) x.port.onmessage = null; if (x.onaudioprocess) x.onaudioprocess = null; }); e.nodes = []; };
    return e;
  }

  window.RuachMixDsp = { kernel: DSP, make: make, moduleUrl: moduleUrl };
})();
