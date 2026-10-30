/* ===== Harmony.engine — the ONE math core =====
   Every number in the visualizer (the 3D hollow sphere, the internal 2D f(x)/x
   slice, the circular zoom magnifier, the Lissajous projection, the time-domain
   oscilloscope, the Ramanujan/Fourier harmonic series, the Frobenius phasors,
   and the IEEE-754 float32 bit inspector) derives from THIS single module.

   PRECISION: the synth pipeline runs at IEEE-754 FLOAT32 via Math.fround(),
   matching a real DAW / hardware wavetable synth. Sentinels (+∞ = 0x7F800000,
   −∞ = 0xFF800000, NaN = 0x7FC00000) and exact 4-byte patterns are preserved.

   TWINS (HARMONY_ENGINE.md §7):
   - Conjugate twin (P̄): (x, −y, z) = R·e^{−iθ} — negative-frequency reflection
     whose real trace (P + P̄)/2 = (x, 0, z) cancels the imaginary axis.
   - Antipodal twin (−P): (−x, −y, −z) = R·e^{i(θ+π)} — 180° polarity inversion
     whose null sum P + (−P) = 0 cancels at the origin. */
(function () {
  'use strict';

  var TAU = Math.PI * 2;
  var PI = Math.PI;

  function frac(x) { return x - Math.floor(x); }
  function saw(x)  { return 2 * frac(x / TAU) - 1; }
  function sawUnit(x) { return 2 * frac(x) - 1; }
  function square(x)  { return Math.sign(Math.sin(x)); }
  function triangle(x){ return 2 * Math.abs(2 * frac(x / TAU) - 1) - 1; }
  function clamp(x, lo, hi) { return Math.min(hi, Math.max(lo, x)); }
  function lerp(a, b, k) { return a + (b - a) * k; }

  // ---- Harmony Engine synthesis primitives ----

  // Classical Weierstrass fractal cosine sum: sum_{j=0..K} a^j * cos(b^j * PI * x)
  function weierstrass(x, a, b, terms) {
    var K = clamp(Math.round(terms == null ? 6 : terms), 0, 20);
    var av = (a == null) ? 0.5 : a;
    var bv = (b == null) ? 3 : b;
    var sum = 0, ampJ = 1, freqJ = 1;
    for (var j = 0; j <= K; j++) {
      sum += ampJ * Math.cos(freqJ * PI * x);
      ampJ *= av;
      freqJ *= bv;
    }
    return sum;
  }

  // Unit-normalized Weierstrass in [-1, 1] so peak amplitude scales cleanly by r
  function weierstrassNorm(x, a, b, terms) {
    var K = clamp(Math.round(terms == null ? 6 : terms), 0, 20);
    var av = (a == null) ? 0.5 : a;
    var bv = (b == null) ? 3 : b;
    var sum = 0, norm = 0, ampJ = 1, freqJ = 1;
    for (var j = 0; j <= K; j++) {
      sum += ampJ * Math.cos(freqJ * PI * x);
      norm += Math.abs(ampJ);
      ampJ *= av;
      freqJ *= bv;
    }
    return norm > 0 ? sum / norm : 0;
  }

  // Gaussian window e^{-0.5 * (x / sigma)^2}
  function gauss(x, sigma) {
    var s = (sigma == null || sigma === 0) ? 1 : sigma;
    var q = x / s;
    return Math.exp(-0.5 * q * q);
  }

  // Real Morlet (Gabor) wavelet atom: cos(w0 * x + ph) * e^{-0.5 * (x/sigma)^2}
  function morlet(x, w0, ph, sigma) {
    var w = (w0 == null) ? 6 : w0;
    var p = ph || 0;
    return Math.cos(w * x + p) * gauss(x, sigma == null ? 1 : sigma);
  }

  // Imaginary quadrature branch of the analytic Morlet wavelet: sin(w0 * x + ph) * gauss
  function morletIm(x, w0, ph, sigma) {
    var w = (w0 == null) ? 6 : w0;
    var p = ph || 0;
    return Math.sin(w * x + p) * gauss(x, sigma == null ? 1 : sigma);
  }

  // Odd-harmonic Fourier square wave partial sum (0..K harmonics)
  function fourierSquare(x, terms) {
    var K = clamp(Math.round(terms == null ? 5 : terms), 0, 40);
    var sum = 0;
    for (var j = 0; j <= K; j++) {
      var h = 2 * j + 1;
      sum += Math.sin(h * x) / h;
    }
    return (4 / PI) * sum;
  }

  // Harmonic Fourier sawtooth partial sum (0..K harmonics)
  function fourierSaw(x, terms) {
    var K = clamp(Math.round(terms == null ? 5 : terms), 0, 40);
    var sum = 0;
    for (var j = 1; j <= K + 1; j++) {
      var sign = (j % 2 === 1) ? 1 : -1;
      sum += sign * Math.sin(j * x) / j;
    }
    return (2 / PI) * sum;
  }

  // Note: preserve original saw(x) = 2*frac(x)-1 behavior when users pass TAU*f*t,
  // Wait: in original engine.js, saw(x) was `2 * frac(x) - 1`! Let's keep exact
  // compatibility with original presets (`saw(TAU*f*t+phase)`).
  function sawCompat(x) { return 2 * frac(x) - 1; }
  function triCompat(x) { return 2 * Math.abs(2 * frac(x) - 1) - 1; }
  var cbrtFn = Math.cbrt || function (x) { return x < 0 ? -Math.pow(-x, 1 / 3) : Math.pow(x, 1 / 3); };

  // Parameter names exposed to user formulas, in exact call order
  var PARAMS = [
    't', 'u', 'TAU', 'PI',
    'r', 'rIn', 'amp', 'f', 'n', 'm', 'k', 'K', 'N', 'a', 'b', 'phase',
    'sin', 'cos', 'tan', 'atan2', 'asin', 'acos',
    'sqrt', 'cbrt', 'abs', 'floor', 'ceil', 'pow', 'exp', 'log', 'sign',
    'min', 'max', 'clamp', 'lerp', 'frac',
    'saw', 'square', 'triangle',
    'weierstrass', 'weierstrassNorm', 'morlet', 'morletIm', 'gauss',
    'fourierSquare', 'fourierSaw'
  ];

  var FNS = [
    Math.sin, Math.cos, Math.tan, Math.atan2, Math.asin, Math.acos,
    Math.sqrt, cbrtFn, Math.abs, Math.floor, Math.ceil, Math.pow, Math.exp, Math.log, Math.sign,
    Math.min, Math.max, clamp, lerp, frac,
    sawCompat, square, triCompat,
    weierstrass, weierstrassNorm, morlet, morletIm, gauss,
    fourierSquare, fourierSaw
  ];

  function paramsFor(t, s) {
    var u = 2 * t - 1;
    var rIn = Math.min(s.rIn != null ? s.rIn : 0.45, s.r);
    var K = s.K != null ? s.K : 6;
    var N = s.orderN != null ? s.orderN : 19;
    var a = s.a != null ? s.a : 0.5;
    var b = s.b != null ? s.b : 3;
    return [
      t, u, TAU, PI,
      s.r, rIn, s.amp, s.f, s.n, s.m, s.k, K, N, a, b, s.phaseRad
    ].concat(FNS);
  }

  // Compile expression string -> function, or null on syntax/runtime error
  function compile(expr) {
    if (!expr || String(expr).trim() === '') return null;
    var fn;
    try {
      fn = new Function(PARAMS.join(','), 'return (' + expr + ');');
    } catch (e) {
      return null;
    }
    try {
      var p = paramsFor(0.25, {
        r: 1, rIn: 0.45, amp: 1, f: 1, n: 3, m: 2, k: 1,
        K: 4, a: 0.5, b: 3, phaseRad: 0
      });
      fn.apply(null, p);
    } catch (e) {
      return null;
    }
    return fn;
  }

  var cache = {};
  function getEval(axis, expr) {
    var key = axis + '|' + expr;
    if (cache[key] && cache[key].expr === expr) return cache[key].fn;
    var fn = compile(expr);
    cache[key] = { expr: expr, fn: fn };
    return fn;
  }

  function validate(expr) {
    return compile(expr) ? null : 'invalid expression';
  }

  // Sample the whole curve for t in [0, 1] at float32 precision
  function sample(s, SAMPLES) {
    SAMPLES = SAMPLES || 2800;
    var ex = getEval('x', s.formulas.x);
    var ey = getEval('y', s.formulas.y);
    var ez = getEval('z', s.formulas.z);
    var error = {
      x: ex ? null : 'invalid x(t)',
      y: ey ? null : 'invalid y(t)',
      z: ez ? null : 'invalid z(t)'
    };
    var anyBad = !ex || !ey || !ez;
    var pts = new Array(SAMPLES + 1);
    var maxAbs = Math.max(1e-6, Math.abs(s.r), 1);
    var scaleCap = Math.max(2.5 * Math.max(Math.abs(s.r), s.amp), 1.5);
    var i, t, x, y, z, vx, vy, vz, valid, scale = s.amp, cl;

    for (i = 0; i <= SAMPLES; i++) {
      t = i / SAMPLES;
      x = y = z = NaN;
      if (ex) { try { x = ex.apply(null, paramsFor(t, s)); } catch (e) {} }
      if (ey) { try { y = ey.apply(null, paramsFor(t, s)); } catch (e) {} }
      if (ez) { try { z = ez.apply(null, paramsFor(t, s)); } catch (e) {} }
      valid = Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z);
      vx = Math.fround(x * scale);
      vy = Math.fround(y * scale);
      vz = Math.fround(z * scale);
      pts[i] = { x: vx, y: vy, z: vz, valid: valid, t: t };
      if (valid) {
        cl = Math.min(Math.abs(vx), scaleCap); if (cl > maxAbs) maxAbs = cl;
        cl = Math.min(Math.abs(vy), scaleCap); if (cl > maxAbs) maxAbs = cl;
        cl = Math.min(Math.abs(vz), scaleCap); if (cl > maxAbs) maxAbs = cl;
      }
    }
    return { points: pts, error: error, valid: !anyBad, maxAbs: maxAbs };
  }

  // Exact continuous evaluation at arbitrary parameter t (used by the Zoom Magnifier
  // to reveal genuine micro-scale fractal detail at float32 precision, and by sentinels)
  function point(s, t) {
    var ex = getEval('x', s.formulas.x), ey = getEval('y', s.formulas.y), ez = getEval('z', s.formulas.z);
    var x = NaN, y = NaN, z = NaN;
    if (ex) { try { x = ex.apply(null, paramsFor(t, s)); } catch (e) {} }
    if (ey) { try { y = ey.apply(null, paramsFor(t, s)); } catch (e) {} }
    if (ez) { try { z = ez.apply(null, paramsFor(t, s)); } catch (e) {} }
    var scale = s.amp;
    var vx = Math.fround(x * scale), vy = Math.fround(y * scale), vz = Math.fround(z * scale);
    var valid = Number.isFinite(vx) && Number.isFinite(vy) && Number.isFinite(vz);
    return { x: vx, y: vy, z: vz, valid: valid, t: t };
  }

  // Sample a zoomed micro-window [tCenter - halfSpan, tCenter + halfSpan] at N points
  function sampleWindow(s, tCenter, halfSpan, count) {
    count = count || 480;
    var out = new Array(count);
    var t0 = tCenter - halfSpan;
    var span = halfSpan * 2;
    for (var i = 0; i < count; i++) {
      var t = t0 + (i / (count - 1)) * span;
      out[i] = point(s, t);
    }
    return out;
  }

  // Hollow sphere geometry & volume metrics: V = 4/3 * pi * (R^3 - r^3)
  function shellMetrics(state) {
    var R = Math.max(0.05, state.r);
    var rIn = clamp(state.rIn != null ? state.rIn : 0, 0, R);
    var volOuter = (4 / 3) * PI * R * R * R;
    var volCavity = (4 / 3) * PI * rIn * rIn * rIn;
    var volShell = volOuter - volCavity;
    return {
      R: R,
      rIn: rIn,
      thickness: R - rIn,
      volOuter: volOuter,
      volCavity: volCavity,
      volShell: volShell
    };
  }

  // Classify radial distance |P| relative to Hollow Sphere (Cavity rIn .. Outer R)
  function zoneOf(dist, state) {
    var R = state.r;
    var rIn = Math.min(state.rIn != null ? state.rIn : 0, R);
    var tol = R * 0.045;
    if (Math.abs(dist - R) <= tol) return 'ON SPHERE';
    if (dist > R + tol) return 'OUTSIDE';
    if (rIn > 0.02 && dist < rIn - tol * 0.5) return 'IN CAVITY';
    return rIn > 0.02 ? 'IN SHELL' : 'INSIDE';
  }

  // Greatest common divisor & primality check for Finite Cyclic Order N Strobe
  function gcd(a, b) {
    a = Math.abs(a | 0); b = Math.abs(b | 0);
    while (b !== 0) { var t = b; b = a % b; a = t; }
    return a || 1;
  }

  function isPrimeInt(n) {
    n = n | 0;
    if (n < 2) return false;
    if (n % 2 === 0) return n === 2;
    for (var d = 3; d * d <= n; d += 2) {
      if (n % d === 0) return false;
    }
    return true;
  }

  // Discrete Order N Cyclic Group Strobe:
  // Quantizes the continuous curve into N discrete states P_0 .. P_{N-1},
  // and traces the cyclic subgroup generated by stride g = round(n):
  //   0 -> g mod N -> 2g mod N -> ... -> 0  (size = N / gcd(g, N)).
  // When N is prime (like secp256k1's group order N!), gcd(g, N) = 1 for all
  // 1 <= g < N, so EVERY stride visits all N elements (cofactor 1)!
  function discreteGroup(state, points) {
    var N = clamp(Math.round(state.orderN != null ? state.orderN : 19), 3, 96);
    var stride = Math.max(1, Math.round(state.n != null ? state.n : 1));
    var g = gcd(stride, N);
    var subOrder = Math.floor(N / g);
    var visited = new Array(N).fill(false);
    var orbit = [];
    var cur = 0;
    for (var s = 0; s < subOrder; s++) {
      orbit.push(cur);
      visited[cur] = true;
      cur = (cur + stride) % N;
    }
    orbit.push(0); // close cycle back to identity element 0

    var nodes = new Array(N);
    var hasPts = points && points.length > 1;
    for (var j = 0; j < N; j++) {
      var tj = j / N;
      var pt;
      if (hasPts) {
        var idx = Math.round(tj * (points.length - 1));
        pt = points[idx];
      } else {
        pt = point(state, tj);
      }
      nodes[j] = {
        idx: j,
        t: tj,
        x: pt ? pt.x : NaN,
        y: pt ? pt.y : NaN,
        z: pt ? pt.z : NaN,
        valid: !!(pt && pt.valid),
        inSubgroup: visited[j]
      };
    }

    return {
      N: N,
      stride: stride,
      gcd: g,
      subOrder: subOrder,
      isPrime: isPrimeInt(N),
      nodes: nodes,
      orbit: orbit
    };
  }

  // THE single playhead & twin truth (HARMONY_ENGINE.md §7):
  // - antipodal: (−x, −y, −z) — 180° rotation / audio polarity flip
  // - conjugate: ( x, −y,  z) — negative-frequency reflection across real axis
  // - realTrace: ( x,  0,  z) — midpoint (P + P̄)/2 where imaginary parts cancel
  // When Order N Strobe (toggles.strobeN) is enabled, playT snaps in N discrete
  // cyclic generator steps so 3D, 2D scopes, and Float32 Bit Lab quantize in unison!
  function playhead(state, points, playT) {
    var effT = playT;
    var stepIdx = null;
    if (state.toggles && state.toggles.strobeN) {
      var N = clamp(Math.round(state.orderN != null ? state.orderN : 19), 3, 96);
      var stride = Math.max(1, Math.round(state.n != null ? state.n : 1));
      var rawStep = Math.floor(playT * N) % N;
      if (rawStep < 0) rawStep += N;
      // Walk along generator multiples: k * stride mod N
      stepIdx = (rawStep * stride) % N;
      effT = stepIdx / N;
    }

    var idx = (points && points.length) ? Math.round(effT * (points.length - 1)) : 0;
    var pt = (points && idx >= 0 && idx < points.length) ? points[idx] : null;
    if (pt && !pt.valid) pt = null;

    var antipodal = pt ? { x: Math.fround(-pt.x), y: Math.fround(-pt.y), z: Math.fround(-pt.z) } : null;
    var conjugate = pt ? { x: pt.x, y: Math.fround(-pt.y), z: pt.z } : null;
    var realTrace = pt ? { x: pt.x, y: 0, z: pt.z } : null;

    var mode = state.twinMode || (state.toggles && state.toggles.syzygy === false ? 'off' : 'both');
    var activeTwin = null;
    if (mode === 'antipodal') activeTwin = antipodal;
    else if (mode === 'conjugate' || mode === 'both') activeTwin = conjugate;

    return {
      point: pt,
      twin: activeTwin,
      antipodal: antipodal,
      conjugate: conjugate,
      realTrace: realTrace,
      mode: mode,
      idx: idx,
      effT: effT,
      stepIdx: stepIdx
    };
  }

  function readout(state, p) {
    if (!p) return { angle: '—', dist: '—', status: 'NO EVAL', distNum: NaN };
    var ang = Math.atan2(p.y, p.x);
    var angDeg = (ang * 180 / PI).toFixed(1);
    var angRad = ang.toFixed(4);
    var angle = angDeg + '° (' + angRad + ' rad)';
    var dist = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
    var rIn = Math.min(state.rIn != null ? state.rIn : 0, state.r);
    var distText = dist.toFixed(3) + '  [r=' + rIn.toFixed(2) + '..R=' + state.r.toFixed(2) + ']';
    var st = zoneOf(dist, state);
    return { angle: angle, dist: distText, status: st, distNum: dist };
  }

  // ---- IEEE-754 FLOAT32 Bit Inspector ----
  function fmtNum(x) {
    if (Number.isNaN(x)) return 'NaN';
    if (x === Infinity) return '+∞';
    if (x === -Infinity) return '−∞';
    if (x === 0) return Object.is(x, -0) ? '−0' : '0';
    var av = Math.abs(x);
    if (av >= 1e7 || av < 1e-5) return x.toExponential(4);
    return String(parseFloat(x.toPrecision(6)));
  }

  function bitInspect(x) {
    var u32, kind;
    if (Number.isNaN(x)) {
      u32 = 0x7FC00000;
      kind = 'NaN';
    } else if (x === Infinity) {
      u32 = 0x7F800000;
      kind = '+∞';
    } else if (x === -Infinity) {
      u32 = 0xFF800000;
      kind = '−∞';
    } else {
      var buf = new ArrayBuffer(4);
      var dv = new DataView(buf);
      dv.setFloat32(0, x, false);
      u32 = dv.getUint32(0, false);
      kind = 'finite';
    }
    var hex = '0x' + u32.toString(16).toUpperCase().padStart(8, '0');
    var bin = u32.toString(2).padStart(32, '0');
    var signBit = bin.slice(0, 1);
    var expBits = bin.slice(1, 9);
    var mantBits = bin.slice(9, 32);
    var expRaw = parseInt(expBits, 2);
    var expDesc = expRaw === 255 ? 'sentinel (255)' : (expRaw === 0 ? 'subnormal' : '2^' + (expRaw - 127));
    return {
      val: fmtNum(x),
      hex: hex,
      bin: bin,
      signBit: signBit,
      expBits: expBits,
      mantBits: mantBits,
      expDesc: expDesc,
      kind: kind
    };
  }

  // ---- Ramanujan 1914 1/π Series vs. Fourier Odd-Harmonic Series ----
  function fact(n) {
    var res = 1;
    for (var i = 2; i <= n; i++) res *= i;
    return res;
  }

  function ramanujanSeries(maxK) {
    maxK = clamp(maxK == null ? 4 : maxK, 0, 6);
    var coeff = (2 * Math.SQRT2) / 9801;
    var ramSum = 0;
    var fourSum = 0;
    var rows = [];
    var piF32 = Math.fround(PI);
    var targetBits = bitInspect(piF32);

    for (var k = 0; k <= maxK; k++) {
      var num = fact(4 * k) * (1103 + 26390 * k);
      var fk = fact(k);
      var den = Math.pow(fk, 4) * Math.pow(396, 4 * k);
      ramSum += coeff * (num / den);
      var piRam = 1 / ramSum;
      var piRamF32 = Math.fround(piRam);
      var ramBits = bitInspect(piRamF32);
      var errRam = Math.abs(PI - piRam);
      var errRamDb = 20 * Math.log10(Math.max(1e-17, errRam));

      fourSum += ((k % 2 === 0) ? 1 : -1) / (2 * k + 1);
      var piFour = 4 * fourSum;
      var piFourF32 = Math.fround(piFour);
      var fourBits = bitInspect(piFourF32);
      var errFour = Math.abs(PI - piFour);
      var errFourDb = 20 * Math.log10(Math.max(1e-17, errFour));

      rows.push({
        k: k,
        piRam: piRam,
        piRamF32: piRamF32,
        ramHex: ramBits.hex,
        ramLocked: ramBits.hex === targetBits.hex,
        errRam: errRam,
        errRamDb: errRamDb,
        piFour: piFour,
        piFourF32: piFourF32,
        fourHex: fourBits.hex,
        fourLocked: fourBits.hex === targetBits.hex,
        errFour: errFour,
        errFourDb: errFourDb
      });
    }
    return {
      targetPiF32: piF32,
      targetHex: targetBits.hex,
      targetBits: targetBits,
      rows: rows
    };
  }

  // ---- Frobenius & secp256k1 point counting ----
  function fmtBig(x) {
    if (!isFinite(x)) return String(x);
    var a = Math.abs(x);
    if (a >= 1e6) return x.toExponential(3);
    return String(parseFloat(x.toPrecision(6)));
  }
  function fSci(x) {
    if (!isFinite(x)) return String(x);
    var a = Math.abs(x);
    if (a !== 0 && (a >= 1e6 || a < 1e-4)) return x.toExponential(3);
    return String(parseFloat(x.toPrecision(6)));
  }
  function bigSci(x) {
    if (typeof x === 'bigint' && x < 0n) return '-' + bigSci(-x);
    var s = String(x);
    if (s.length <= 18) return s;
    return s[0] + '.' + s.slice(1, 6) + 'e' + (s.length - 1);
  }

  function initSecp(state) {
    var SP = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2Fn;
    var SN = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;
    var ST = SP + 1n - SN;
    var Gx = 0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798n;
    var Gy = 0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8n;
    var cosPhi = Number(ST) / (2 * Math.sqrt(Number(SP)));
    state.secp = {
      P: SP, N: SN, T: ST, Gx: Gx, Gy: Gy,
      Phi: Math.acos(cosPhi), Cos: cosPhi,
      SqrtP: Math.sqrt(Number(SP))
    };
    return state.secp;
  }

  function secpSeq(state, k) {
    var SP = state.secp.P, ST = state.secp.T;
    if (k === 0) return 2n;
    if (k === 1) return ST;
    var p2 = 2n, p1 = ST, i;
    for (i = 2; i <= k; i++) { var cur = ST * p1 - SP * p2; p2 = p1; p1 = cur; }
    return p1;
  }

  function secpReadout(state) {
    var k = state.frobK | 0;
    var SP = state.secp.P, SN = state.secp.N, ST = state.secp.T;
    var Sk = secpSeq(state, k);
    var countE = (SP ** BigInt(k)) + 1n - Sk;
    var phi = state.secp.Phi;
    var kdeg = (k * phi) * 180 / PI; if (kdeg < 0) kdeg += 360;
    var prefix = (state.secp.Gy % 2n === 0n) ? '02' : '03';
    var twoSqrt = 2 * state.secp.SqrtP;
    return {
      frobQ: 'q = p (secp256k1)',
      frobPhi: (phi * 180 / PI).toFixed(3) + '° · kφ ' + (kdeg % 360).toFixed(1) + '°',
      frobTrace: bigSci(Sk),
      frobCount: bigSci(countE),
      secpP: bigSci(SP),
      secpN: bigSci(SN),
      secpT: bigSci(ST),
      secpSqrt: fSci(state.secp.SqrtP) + ' (≈ FLT_MAX)',
      secpPhi: (phi * 180 / PI).toFixed(3) + '° · cos = ' + state.secp.Cos.toFixed(6),
      secpHasse: fSci(Math.abs(Number(ST))) + ' ≤ ' + fSci(twoSqrt),
      secpG: prefix + state.secp.Gx.toString(16).padStart(64, '0').slice(0, 20) + '…'
    };
  }

  function frobAngles(state) {
    var secp = state.curveMode === 'secp';
    return {
      secp: secp,
      phi: secp ? state.secp.Phi : state.phaseRad,
      k: state.frobK | 0
    };
  }

  function frobReadout(state) {
    var p = state.frobP, n = state.frobN, k = state.frobK;
    var q = Math.pow(p, n);
    var phi = state.phaseRad;
    var trace = 2 * Math.pow(q, k / 2) * Math.cos(k * phi);
    var count = Math.pow(q, k) + 1 - trace;
    return {
      frobQ: 'q = ' + p + '^' + n + ' = ' + q,
      frobPhi: (phi * 180 / PI).toFixed(1) + '° · kφ ' + ((k * phi) * 180 / PI).toFixed(1) + '°',
      frobTrace: fmtBig(trace),
      frobCount: fmtBig(count)
    };
  }

  window.Harmony = {
    PRECISION: 'float32',
    engine: {
      TAU: TAU, PI: PI,
      frac: frac, saw: sawCompat, square: square, triangle: triCompat, clamp: clamp, lerp: lerp, cbrt: cbrtFn,
      weierstrass: weierstrass, weierstrassNorm: weierstrassNorm,
      morlet: morlet, morletIm: morletIm, gauss: gauss,
      fourierSquare: fourierSquare, fourierSaw: fourierSaw,
      compile: compile, validate: validate, paramsFor: paramsFor,
      sample: sample, point: point, sampleWindow: sampleWindow,
      shellMetrics: shellMetrics, zoneOf: zoneOf,
      gcd: gcd, isPrimeInt: isPrimeInt, discreteGroup: discreteGroup,
      playhead: playhead, readout: readout,
      fmtNum: fmtNum, bitInspect: bitInspect,
      ramanujanSeries: ramanujanSeries,
      initSecp: initSecp, secpSeq: secpSeq,
      secpReadout: secpReadout, frobReadout: frobReadout, frobAngles: frobAngles,
      fmtBig: fmtBig, fSci: fSci, bigSci: bigSci
    }
  };
})();
