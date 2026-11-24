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

  // Grover amplitude-amplification & 3Blue1Brown colliding-blocks phase-space chords.
  // Both share the exact unit-circle geometry X^2 + Y^2 = 1 with half-angle
  // theta = asin(1 / sqrt(N)), alternating vertical Conjugate (P̄) wall/oracle flips
  // (x, y) -> (x, -y) with slanted diffusion / momentum-conservation chords.
  function groverVertexAngle(j, theta) {
    var m = Math.floor(j / 2);
    var mag = (2 * m + 1) * theta;
    return (j % 2 === 1) ? -mag : mag;
  }

  function groverChord(t, N, K, isY) {
    var nVal = Math.max(2, Number(N) || 16);
    var steps = clamp(Math.round(K == null ? 3 : K), 1, 64);
    var theta = Math.asin(1 / Math.sqrt(nVal));
    var segs = 2 * steps;
    var pos = clamp(t, 0, 1) * segs;
    var j = Math.min(segs - 1, Math.floor(pos));
    var s = pos - j;
    var a0 = groverVertexAngle(j, theta);
    var a1 = groverVertexAngle(j + 1, theta);
    return isY
      ? lerp(Math.sin(a0), Math.sin(a1), s)
      : lerp(Math.cos(a0), Math.cos(a1), s);
  }
  function groverX(t, N, K) { return groverChord(t, N, K, false); }
  function groverY(t, N, K) { return groverChord(t, N, K, true); }

  function blocksVertexAngle(j, theta) {
    if (j <= 0) return 0;
    var pair = Math.ceil(j / 2);
    return ((j % 2 === 1) ? 1 : -1) * 2 * pair * theta;
  }

  function blocksChord(t, N, K, isY) {
    var nVal = Math.max(2, Number(N) || 11);
    var theta = Math.asin(1 / Math.sqrt(nVal));
    var maxBounces = Math.max(1, Math.floor(PI / theta));
    var segs = (K == null || K <= 0)
      ? maxBounces
      : Math.min(maxBounces, Math.max(1, Math.round(K)));
    var pos = clamp(t, 0, 1) * segs;
    var j = Math.min(segs - 1, Math.floor(pos));
    var s = pos - j;
    var a0 = blocksVertexAngle(j, theta);
    var a1 = blocksVertexAngle(j + 1, theta);
    return isY
      ? lerp(Math.sin(a0), Math.sin(a1), s)
      : lerp(Math.cos(a0), Math.cos(a1), s);
  }
  function blocksX(t, N, K) { return blocksChord(t, N, K, false); }
  function blocksY(t, N, K) { return blocksChord(t, N, K, true); }

  function groverMetrics(N, K, playT, mode) {
    var nVal = Math.max(2, Number(N) || 16);
    var theta = Math.asin(1 / Math.sqrt(nVal));
    var thetaDeg = theta * 180 / PI;
    var approxOpt = (PI / 4) * Math.sqrt(nVal);
    var optSteps = Math.max(1, Math.round(approxOpt - 0.5));
    var peakProb = Math.pow(Math.sin((2 * optSteps + 1) * theta), 2);
    var maxBounces = Math.max(1, Math.floor(PI / theta));
    var tClamped = clamp(playT == null ? 0 : playT, 0, 1);

    if (mode === 'blocks') {
      var bSegs = (K == null || K <= 0) ? maxBounces : Math.min(maxBounces, Math.max(1, Math.round(K)));
      var bPos = tClamped * bSegs;
      var bSegIdx = Math.min(bSegs - 1, Math.floor(bPos));
      var bCount = Math.min(bSegs, Math.floor(bPos + 0.5));
      var by = blocksY(tClamped, nVal, K);
      return {
        mode: 'blocks',
        N: nVal,
        massRatio: nVal - 1,
        thetaDeg: thetaDeg,
        stepDeg: 2 * thetaDeg,
        approxOpt: approxOpt,
        optSteps: optSteps,
        peakProb: peakProb,
        maxBounces: maxBounces,
        shownBounces: bSegs,
        currentBounce: bCount,
        phaseLabel: (bSegIdx % 2 === 0) ? 'Block Collision' : 'Wall Bounce (P̄)',
        smallEnergy: clamp(by * by, 0, 1)
      };
    }

    var steps = clamp(Math.round(K == null ? optSteps : K), 1, 64);
    if (mode === 'orbit') {
      var stepFloat = steps * tClamped;
      var ang = (2 * stepFloat + 1) * theta;
      var sVal = Math.sin(ang);
      return {
        mode: 'orbit',
        N: nVal,
        massRatio: nVal - 1,
        thetaDeg: thetaDeg,
        stepDeg: 2 * thetaDeg,
        approxOpt: approxOpt,
        optSteps: optSteps,
        peakProb: peakProb,
        maxBounces: maxBounces,
        steps: steps,
        currentStep: stepFloat,
        phaseLabel: 'Continuous 2θ Rotation',
        targetProb: clamp(sVal * sVal, 0, 1),
        angleDeg: ang * 180 / PI
      };
    }

    // Default: 'chords' (alternating Oracle P̄ vertical flip & Diffusion slanted reflection)
    var gSegs = 2 * steps;
    var gPos = tClamped * gSegs;
    var gSegIdx = Math.min(gSegs - 1, Math.floor(gPos));
    var nearestV = Math.min(gSegs, Math.floor(gPos + 0.5));
    var vAng = groverVertexAngle(nearestV, theta);
    var vSin = Math.sin(vAng);
    return {
      mode: 'chords',
      N: nVal,
      massRatio: nVal - 1,
      thetaDeg: thetaDeg,
      stepDeg: 2 * thetaDeg,
      approxOpt: approxOpt,
      optSteps: optSteps,
      peakProb: peakProb,
      maxBounces: maxBounces,
      steps: steps,
      currentStep: Math.floor(nearestV / 2),
      phaseLabel: (gSegIdx % 2 === 0) ? 'Oracle Flip (P̄: y→−y)' : 'Diffusion (+2θ chord)',
      targetProb: clamp(vSin * vSin, 0, 1),
      angleDeg: Math.abs(vAng) * 180 / PI
    };
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
    'fourierSquare', 'fourierSaw',
    'groverX', 'groverY', 'blocksX', 'blocksY',
    'eta', 'alpha', 'ringArea'
  ];

  var FNS = [
    Math.sin, Math.cos, Math.tan, Math.atan2, Math.asin, Math.acos,
    Math.sqrt, cbrtFn, Math.abs, Math.floor, Math.ceil, Math.pow, Math.exp, Math.log, Math.sign,
    Math.min, Math.max, clamp, lerp, frac,
    sawCompat, square, triCompat,
    weierstrass, weierstrassNorm, morlet, morletIm, gauss,
    fourierSquare, fourierSaw,
    groverX, groverY, blocksX, blocksY
  ];

  function paramsFor(t, s) {
    var u = 2 * t - 1;
    var R = Math.max(0.05, s.r != null ? s.r : 1);
    var rIn = Math.min(s.rIn != null ? s.rIn : 0.45, R);
    var eta = R > 0 ? clamp(rIn / R, 0, 1) : 0;
    var alpha = rIn > 0.005 ? (R / rIn) : 1;
    var ringArea = PI * (R * R - rIn * rIn);
    var K = s.K != null ? s.K : 6;
    var N = s.orderN != null ? s.orderN : 19;
    var a = s.a != null ? s.a : 0.5;
    var b = s.b != null ? s.b : 3;
    var effF = s.f;
    var effPhase = s.phaseRad || 0;
    var fns = FNS;

    // Optional §2.2 / §2.3 Time-Stretch Modulation Coupling (default 'off' keeps all baseline presets bit-exact)
    var sm = s.stretchMode;
    if (sm && sm !== 'off') {
      // Reference ratio alpha0 = 1 / 0.45 ≈ 2.2222 so default rIn=0.45 is neutral (1.0x)
      var alphaNorm = rIn > 0.005 ? clamp((0.45 / eta), 0.2, 6.0) : 1.0;
      if (sm === 'tape') {
        // Tape-style resampling (§2.2): ω_0 -> ω_0 / α (pitch drops as stretch increases)
        effF = s.f / alphaNorm;
      } else if (sm === 'jacobian') {
        // Radial Jacobian warp (§2.1 / §2.3): dR/dr|_V = η² modulates phase & harmonic decay
        effPhase = effPhase + (eta * eta) * PI;
      } else if (sm === 'pitchLock') {
        // Pitch-locked DAW time-stretching (§2.2): Gaussian envelope σ -> α·σ while carrier ω_0 stays locked
        var sigScale = alphaNorm;
        var morletStretched = function (x, w0, ph, sigma) {
          return morlet(x, w0, ph, (sigma == null ? 1 : sigma) * sigScale);
        };
        var morletImStretched = function (x, w0, ph, sigma) {
          return morletIm(x, w0, ph, (sigma == null ? 1 : sigma) * sigScale);
        };
        var gaussStretched = function (x, sigma) {
          return gauss(x, (sigma == null ? 1 : sigma) * sigScale);
        };
        fns = [
          Math.sin, Math.cos, Math.tan, Math.atan2, Math.asin, Math.acos,
          Math.sqrt, cbrtFn, Math.abs, Math.floor, Math.ceil, Math.pow, Math.exp, Math.log, Math.sign,
          Math.min, Math.max, clamp, lerp, frac,
          sawCompat, square, triCompat,
          weierstrass, weierstrassNorm, morletStretched, morletImStretched, gaussStretched,
          fourierSquare, fourierSaw,
          groverX, groverY, blocksX, blocksY
        ];
      }
    }

    return [
      t, u, TAU, PI,
      s.r, rIn, s.amp, effF, s.n, s.m, s.k, K, N, a, b, effPhase
    ].concat(fns, [eta, alpha, ringArea]);
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

  // ---- §§1–3 Active Dual-Sphere Time-Stretch, Modal Resonance & Archimedes Slice ----

  // Constant-volume law (§2.1): V_shell = 4/3 * pi * R0^3 => R(r) = (r^3 + R0^3)^(1/3)
  function solveConstantVolumeR(rIn, r0) {
    var r = Math.max(0, rIn || 0);
    var base = Math.max(0.05, r0 || 0.96868);
    return cbrtFn(r * r * r + base * base * base);
  }

  function solveConstantVolumeRIn(R, r0) {
    var outer = Math.max(0.05, R || 1);
    var base = Math.max(0.05, r0 || 0.96868);
    var diff = outer * outer * outer - base * base * base;
    return diff > 0 ? cbrtFn(diff) : 0;
  }

  // Given desired cavity ratio eta = r/R in [0, 0.96] and locked volume radius R0,
  // solve R^3 * (1 - eta^3) = R0^3 => R = R0 / (1 - eta^3)^(1/3), r = eta * R.
  function solveConstantVolumePairForEta(eta, r0) {
    var e = clamp(eta || 0, 0, 0.96);
    var base = Math.max(0.05, r0 || 0.96868);
    var denom = cbrtFn(Math.max(1e-4, 1 - e * e * e));
    var R = base / denom;
    return { R: R, rIn: e * R };
  }

  var CONSONANT_RATIOS = [
    { p: 1, q: 1, name: 'Unison' },
    { p: 6, q: 5, name: 'Minor 3rd' },
    { p: 5, q: 4, name: 'Major 3rd' },
    { p: 4, q: 3, name: 'Perfect 4th' },
    { p: 3, q: 2, name: 'Perfect 5th' },
    { p: 8, q: 5, name: 'Minor 6th' },
    { p: 5, q: 3, name: 'Major 6th' },
    { p: 7, q: 4, name: 'Harmonic 7th' },
    { p: 2, q: 1, name: 'Octave' },
    { p: 5, q: 2, name: 'Major 10th' },
    { p: 3, q: 1, name: 'Twelfth (Oct+5th)' },
    { p: 4, q: 1, name: 'Double Octave' },
    { p: 5, q: 1, name: '2 Oct + Maj 3rd' },
    { p: 6, q: 1, name: '2 Oct + 5th' },
    { p: 8, q: 1, name: 'Triple Octave' }
  ];

  function nearestHarmonicRatio(ratio) {
    if (!ratio || !isFinite(ratio) || ratio <= 0) {
      return { p: 1, q: 0, ratioText: '∞ (Solid Ball)', intervalName: 'OSC B Off', detuneCents: 0, locked: true, tripleLock: false, triadText: '1 : — : 1' };
    }
    var best = CONSONANT_RATIOS[0];
    var bestCents = Infinity;
    for (var i = 0; i < CONSONANT_RATIOS.length; i++) {
      var c = CONSONANT_RATIOS[i];
      var cand = c.p / c.q;
      var cents = 1200 * (Math.log(ratio / cand) / Math.LN2);
      if (Math.abs(cents) < Math.abs(bestCents)) {
        best = c;
        bestCents = cents;
      }
    }
    var bestP = best.p, bestQ = best.q;
    var key = bestP + ':' + bestQ;
    var name = best.name;
    var locked = Math.abs(bestCents) <= 10.0;

    // Coupled modal triad (Outer : Inner : Wall):
    // When locked to a simple rational p:q (p > q), express as exact reduced integers;
    // when detuned (e.g. default R=1.0, r=0.45 => 20/9 = 2.22x, +182.4 cents from 2:1 Octave),
    // show 1 : α : β so the modal beating ratios are immediately clear!
    var wallMult = ratio / Math.max(0.01, ratio - 1);
    var triadText = '1 : ' + ratio.toFixed(2) + ' : ' + wallMult.toFixed(2);
    var tripleLock = false;
    if (locked && bestP > bestQ) {
      var diffPQ = bestP - bestQ;
      var tOut = bestQ * diffPQ;
      var tIn = bestP * diffPQ;
      var tWall = bestP * bestQ;
      var gTri = gcd(gcd(tOut, tIn), tWall);
      tOut = Math.round(tOut / gTri);
      tIn = Math.round(tIn / gTri);
      tWall = Math.round(tWall / gTri);
      triadText = tOut + ' : ' + tIn + ' : ' + tWall;
      tripleLock = true;
    }

    return {
      p: bestP,
      q: bestQ,
      ratioText: key,
      intervalName: name,
      detuneCents: bestCents,
      locked: locked,
      tripleLock: tripleLock,
      triadText: triadText
    };
  }

  function sphereResonance(state, playT) {
    var R = Math.max(0.05, state.r != null ? state.r : 1);
    var rIn = clamp(state.rIn != null ? state.rIn : 0, 0, R);
    var cavityActive = rIn > 0.005;
    var thickness = Math.max(0, R - rIn);
    var eta = R > 0 ? clamp(rIn / R, 0, 1) : 0;
    var eta2 = eta * eta;                          // dR/dr|_V radial Jacobian & A_in / A_out
    var volFrac = Math.max(0, 1 - eta * eta * eta);// V_shell / V_outer
    var stretchRatio = cavityActive ? (R / rIn) : null;
    var stretchOctaves = cavityActive ? (Math.log(R / rIn) / Math.LN2) : 0;
    var wallRatio = thickness > 1e-4 ? (R / thickness) : null;
    var r0ConstVol = cbrtFn(Math.max(0, R * R * R - rIn * rIn * rIn));

    // Radial breathing mode ladders (l = 0, k_q = q * pi / L for q = 1..8, §3.1)
    var modesOuter = [], modesInner = [], modesShell = [];
    for (var q = 1; q <= 8; q++) {
      modesOuter.push(Math.fround((q * PI) / R));
      modesInner.push(cavityActive ? Math.fround((q * PI) / rIn) : 0);
      modesShell.push(thickness > 1e-4 ? Math.fround((q * PI) / thickness) : 0);
    }

    var syz = nearestHarmonicRatio(stretchRatio);

    // -3 dB half-power 4-bit bow tangency threshold (§5.7 preview: rIn >= R / sqrt(2))
    var halfPowerR = R * Math.SQRT1_2;
    var bowTouchesCavity = cavityActive && (rIn >= halfPowerR - 1e-3);
    var bowHalfPowerLock = cavityActive && (Math.abs(eta - Math.SQRT1_2) <= 0.008);

    // Archimedes' Constant-Area Slice Theorem (§3.3) at axial position z in [-R, +R]
    var zNorm;
    if (state.archimedesAuto !== false) {
      // Smooth axial scan driven deterministically by playT (sin(TAU * playT) starts at z=0 equator at t=0)
      zNorm = Math.sin(TAU * (playT || 0));
    } else {
      zNorm = clamp(state.archimedesZNorm != null ? state.archimedesZNorm : 0, -1, 1);
    }
    var sliceZ = zNorm * R;
    var rhoOut = Math.sqrt(Math.max(0, R * R - sliceZ * sliceZ));
    var inCavitySpan = cavityActive && (Math.abs(sliceZ) <= rIn + 1e-5);
    var rhoIn = inCavitySpan ? Math.sqrt(Math.max(0, rIn * rIn - sliceZ * sliceZ)) : 0;
    var areaOut = PI * rhoOut * rhoOut;
    var areaIn = PI * rhoIn * rhoIn;
    var areaRing = areaOut - areaIn;
    var ringAreaConst = PI * (R * R - rIn * rIn);

    return {
      R: Math.fround(R),
      rIn: Math.fround(rIn),
      cavityActive: cavityActive,
      thickness: Math.fround(thickness),
      r0ConstVol: Math.fround(r0ConstVol),
      eta: Math.fround(eta),
      jacobian: Math.fround(eta2),
      volFrac: Math.fround(volFrac),
      stretchRatio: stretchRatio != null ? Math.fround(stretchRatio) : null,
      stretchOctaves: Math.fround(stretchOctaves),
      wallRatio: wallRatio != null ? Math.fround(wallRatio) : null,
      ringAreaConst: Math.fround(ringAreaConst),
      halfPowerR: Math.fround(halfPowerR),
      bowTouchesCavity: bowTouchesCavity,
      bowHalfPowerLock: bowHalfPowerLock,
      mods: {
        eta: Math.fround(eta),
        area: Math.fround(eta2),
        vol: Math.fround(volFrac),
        stretch: stretchRatio != null ? Math.fround(stretchRatio) : 1,
        octaves: Math.fround(stretchOctaves)
      },
      modes: {
        outer: modesOuter,
        inner: modesInner,
        shell: modesShell
      },
      syzygy: {
        ratio: stretchRatio != null ? Math.fround(stretchRatio) : null,
        wallRatio: wallRatio != null ? Math.fround(wallRatio) : null,
        nearestP: syz.p,
        nearestQ: syz.q,
        ratioText: syz.ratioText,
        intervalName: syz.intervalName,
        detuneCents: Math.fround(syz.detuneCents),
        locked: syz.locked,
        tripleLock: syz.tripleLock,
        triadText: syz.triadText
      },
      slice: {
        zNorm: Math.fround(zNorm),
        z: Math.fround(sliceZ),
        rhoOut: Math.fround(rhoOut),
        rhoIn: Math.fround(rhoIn),
        areaOut: Math.fround(areaOut),
        areaIn: Math.fround(areaIn),
        areaRing: Math.fround(areaRing),
        ringAreaConst: Math.fround(ringAreaConst),
        inCavitySpan: inCavitySpan
      }
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

  // THE single twin truth (HARMONY_ENGINE.md §7). One implementation, shared by
  // playhead() and by the agent layer's eval_point tool so both agree bit-for-bit:
  // - antipodal: (−x, −y, −z) — 180° rotation / audio polarity flip
  // - conjugate: ( x, −y,  z) — negative-frequency reflection across real axis
  // - realTrace: ( x,  0,  z) — midpoint (P + P̄)/2 where imaginary parts cancel
  function twinOf(pt, mode) {
    var m = mode || 'both';
    var antipodal = pt ? { x: Math.fround(-pt.x), y: Math.fround(-pt.y), z: Math.fround(-pt.z) } : null;
    var conjugate = pt ? { x: pt.x, y: Math.fround(-pt.y), z: pt.z } : null;
    var realTrace = pt ? { x: pt.x, y: 0, z: pt.z } : null;
    var activeTwin = null;
    if (m === 'antipodal') activeTwin = antipodal;
    else if (m === 'conjugate' || m === 'both') activeTwin = conjugate;
    return {
      twin: activeTwin,
      antipodal: antipodal,
      conjugate: conjugate,
      realTrace: realTrace,
      mode: m
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

    var mode = state.twinMode || (state.toggles && state.toggles.syzygy === false ? 'off' : 'both');
    var tw = twinOf(pt, mode);

    return {
      point: pt,
      twin: tw.twin,
      antipodal: tw.antipodal,
      conjugate: tw.conjugate,
      realTrace: tw.realTrace,
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

  // ---- Four-Bit Orbit (1000 ↔ 0001 Palindrome, 1111/F Pole, 0000 Pole & Quadray Tetrahedron) ----
  // Connects the binary palindrome duality of 8 (1000₂) and 1 (0001₂), the maximum
  // 4-bit nibble 15 (1111₂ / 0xF) at the North Pole (+Y), the origin/zero nibble
  // 0 (0000₂ / 0x0) at the South Pole (−Y), and the 4 Quadray tetrahedral basis
  // vectors (1,0,0,0), (0,1,0,0), (0,0,1,0), (0,0,0,1) radiating from (0,0,0,0).
  function fourBitOrbit(state, playT) {
    var R = Math.fround(Math.max(0.1, state.r || 1));
    var f = (state.f != null) ? state.f : 1;
    var ph = state.phaseRad || 0;
    var theta = TAU * f * (playT || 0) + ph;
    var c = Math.cos(theta);
    var s = Math.sin(theta);

    // Meridian (Front f(x) XY slice at z = 0) harmonic pair: 1000 (8) and 0001 (1)
    var m8 = { x: Math.fround(-R * c), y: Math.fround(-R * s), z: 0 };
    var m1 = { x: Math.fround( R * c), y: Math.fround( R * s), z: 0 };

    // Equatorial (Top XZ plane at y = 0) harmonic pair: 1000 (8) and 0001 (1)
    // Shares the exact same X-coordinate (±R·cos θ) as the Meridian orbit,
    // coalescing at (−R, 0, 0) [1000] and (+R, 0, 0) [0001] while orbiting around 1111/F!
    var e8 = { x: Math.fround(-R * c), y: 0, z: Math.fround(-R * s) };
    var e1 = { x: Math.fround( R * c), y: 0, z: Math.fround( R * s) };

    // Shared X-axis real projection (intersection of Front XY and Top XZ planes)
    var x8 = { x: Math.fround(-R * c), y: 0, z: 0 };
    var x1 = { x: Math.fround( R * c), y: 0, z: 0 };

    // Inscribed Regular Quadray Tetrahedron vertices on sphere of radius R:
    // D = (0,0,0,1) [0001] at top apex (+Y), and A=(1,0,0,0) [1000], B=(0,1,0,0) [0100], C=(0,0,1,0) [0010]
    var kFront = (2 * Math.SQRT2) / 3;
    var kBackZ = -Math.SQRT2 / 3;
    var kBackX = Math.sqrt(2 / 3);
    var yBase  = -1 / 3;

    var quadray = {
      D_0001: { x: 0, y: R, z: 0, label: '(0,0,0,1)', bits: '0001', dec: 1 },
      A_1000: { x: 0, y: Math.fround(R * yBase), z: Math.fround(R * kFront), label: '(1,0,0,0)', bits: '1000', dec: 8 },
      B_0100: { x: Math.fround(-R * kBackX), y: Math.fround(R * yBase), z: Math.fround(R * kBackZ), label: '(0,1,0,0)', bits: '0100', dec: 4 },
      C_0010: { x: Math.fround( R * kBackX), y: Math.fround(R * yBase), z: Math.fround(R * kBackZ), label: '(0,0,1,0)', bits: '0010', dec: 2 }
    };

    // Map vertical elevation y in [-R, +R] of the 0001 (1) orbiter to the 16 states of a 4-bit nibble (0000..1111/F)
    var elevNorm = clamp(0.5 * (s + 1), 0, 1); // 0 at bottom pole (-R -> 0000), 1 at top pole (+R -> 1111/F)
    var nibbleVal = clamp(Math.round(elevNorm * 15), 0, 15);
    var nibbleBin = nibbleVal.toString(2).padStart(4, '0');
    var nibbleHex = '0x' + nibbleVal.toString(16).toUpperCase();
    var deg = ((theta * 180 / PI) % 360 + 360) % 360;

    return {
      R: R,
      theta: theta,
      deg: deg,
      meridian8: m8,
      meridian1: m1,
      equator8: e8,
      equator1: e1,
      real8: x8,
      real1: x1,
      quadray: quadray,
      nibbleVal: nibbleVal,
      nibbleBin: nibbleBin,
      nibbleHex: nibbleHex
    };
  }

  // ---- §10 Chromatic Pitch/Cents & Cutaway Floor 3D Wavetable / MiniMeters Spectrogram ----
  var NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  function freqToNoteCents(freqHz) {
    if (!isFinite(freqHz) || freqHz <= 1e-3) {
      return { freqHz: 0, midi: 0, note: '—', octave: 0, cents: 0, label: '—' };
    }
    var midiFloat = 69 + 12 * (Math.log(freqHz / 440) / Math.LN2);
    var midi = Math.round(midiFloat);
    var cents = Math.round((midiFloat - midi) * 100);
    var pc = ((midi % 12) + 12) % 12;
    var octave = Math.floor(midi / 12) - 1;
    var note = NOTE_NAMES[pc] + String(octave);
    var cSign = cents >= 0 ? '+' : '−';
    var label = freqHz.toFixed(2) + 'Hz | ' + note + ' ' + cSign + ' ' + Math.abs(cents) + ' Cents';
    return {
      freqHz: Math.fround(freqHz),
      midi: midi,
      pitchClass: pc,
      note: note,
      octave: octave,
      cents: cents,
      label: label
    };
  }

  function smoothArr1D(arr, passes) {
    var n = arr.length;
    var src = new Float32Array(arr);
    var dst = new Float32Array(n);
    for (var p = 0; p < passes; p++) {
      for (var i = 0; i < n; i++) {
        var a = src[i > 0 ? i - 1 : 0];
        var b = src[i];
        var c = src[i < n - 1 ? i + 1 : n - 1];
        dst[i] = 0.25 * a + 0.5 * b + 0.25 * c;
      }
      var tmp = src; src = dst; dst = tmp;
    }
    return src;
  }

  // Zero-dependency radix-2 Cooley-Tukey FFT (Hann-windowed) for on-demand MP3/PCM spectral slices
  var _fftCache = {};
  function getFftTables(n) {
    if (_fftCache[n]) return _fftCache[n];
    var rev = new Uint16Array(n);
    var bits = Math.round(Math.log(n) / Math.LN2);
    for (var i = 0; i < n; i++) {
      var x = i, r = 0;
      for (var b = 0; b < bits; b++) { r = (r << 1) | (x & 1); x >>= 1; }
      rev[i] = r;
    }
    var hann = new Float32Array(n);
    for (var j = 0; j < n; j++) hann[j] = 0.5 * (1 - Math.cos(TAU * j / (n - 1)));
    var cosT = new Float32Array(n >> 1);
    var sinT = new Float32Array(n >> 1);
    for (var k = 0; k < (n >> 1); k++) {
      var a = -TAU * k / n;
      cosT[k] = Math.cos(a);
      sinT[k] = Math.sin(a);
    }
    var tbl = { rev: rev, hann: hann, cosT: cosT, sinT: sinT, re: new Float32Array(n), im: new Float32Array(n) };
    _fftCache[n] = tbl;
    return tbl;
  }

  function fftMag(pcm, startIdx, fftSize) {
    var n = fftSize || 256;
    var tbl = getFftTables(n);
    var re = tbl.re, im = tbl.im, rev = tbl.rev, hann = tbl.hann;
    var len = pcm ? pcm.length : 0;
    var base = Math.floor(startIdx || 0);
    for (var i = 0; i < n; i++) {
      var idx = base + i;
      var s = (idx >= 0 && idx < len) ? pcm[idx] : 0;
      re[rev[i]] = s * hann[i];
      im[rev[i]] = 0;
    }
    for (var size = 2; size <= n; size <<= 1) {
      var half = size >> 1;
      var step = n / size;
      for (var st = 0; st < n; st += size) {
        for (var k = 0; k < half; k++) {
          var ti = k * step;
          var wr = tbl.cosT[ti], wi = tbl.sinT[ti];
          var i0 = st + k, i1 = i0 + half;
          var tr = wr * re[i1] - wi * im[i1];
          var tiVal = wr * im[i1] + wi * re[i1];
          re[i1] = re[i0] - tr;
          im[i1] = im[i0] - tiVal;
          re[i0] += tr;
          im[i0] += tiVal;
        }
      }
    }
    var halfN = n >> 1;
    var out = new Float32Array(halfN);
    var norm = 2.0 / (n * 0.5); // compensate for Hann coherent gain
    for (var m = 0; m < halfN; m++) {
      var mag = Math.sqrt(re[m] * re[m] + im[m] * im[m]) * norm;
      var db = 20 * Math.log10(Math.max(1e-5, mag));
      // Map [-66 dB .. 0 dB] -> [0 .. 1] cleanly (MiniMeters dynamic window)
      out[m] = Math.fround(clamp((db + 66) / 66, 0, 1));
    }
    return out;
  }

  // Exact RMS, Peak & Crest Factor (Peak/RMS in dB) over a PCM window
  function audioDynamics(pcm, startIdx, windowLen) {
    var len = pcm ? pcm.length : 0;
    var n = Math.max(1, Math.floor(windowLen || 512));
    var base = Math.floor(startIdx || 0);
    var sumSq = 0;
    var peak = 0;
    for (var i = 0; i < n; i++) {
      var idx = base + i;
      var v = (idx >= 0 && idx < len) ? pcm[idx] : 0;
      var av = Math.abs(v);
      if (av > peak) peak = av;
      sumSq += v * v;
    }
    var rms = Math.sqrt(sumSq / n);
    var rmsDb = rms > 1e-6 ? (20 * Math.log10(rms)) : -Infinity;
    var peakDb = peak > 1e-6 ? (20 * Math.log10(peak)) : -Infinity;
    var crestDb = (rms > 1e-6 && peak > 1e-6) ? (peakDb - rmsDb) : 0;
    return {
      rms: Math.fround(rms),
      peak: Math.fround(peak),
      rmsDb: isFinite(rmsDb) ? Math.fround(rmsDb) : -Infinity,
      peakDb: isFinite(peakDb) ? Math.fround(peakDb) : -Infinity,
      crestDb: Math.fround(Math.max(0, crestDb))
    };
  }

  // Continuous logarithmic RX-style Floor Time Zoom: zoomLog in [0..1] <-> T in [16ms .. 12.0s]
  var FLOOR_ZOOM_MIN_SEC = 0.016;
  var FLOOR_ZOOM_MAX_SEC = 12.0;
  var FLOOR_ZOOM_RATIO = FLOOR_ZOOM_MAX_SEC / FLOOR_ZOOM_MIN_SEC;

  function floorZoomSec(zoomLog) {
    var z = clamp(zoomLog == null ? 0.7295 : zoomLog, 0, 1);
    return Math.fround(FLOOR_ZOOM_MIN_SEC * Math.pow(FLOOR_ZOOM_RATIO, z));
  }

  function floorZoomLogFromSec(sec) {
    var s = clamp(sec || 2.0, FLOOR_ZOOM_MIN_SEC, FLOOR_ZOOM_MAX_SEC);
    return Math.fround(Math.log(s / FLOOR_ZOOM_MIN_SEC) / Math.log(FLOOR_ZOOM_RATIO));
  }

  function fmtZoomSec(sec) {
    if (!isFinite(sec)) return '2.00s';
    if (sec < 0.1) return Math.round(sec * 1000) + 'ms';
    if (sec < 1.0) return Math.round(sec * 1000) + 'ms';
    return sec.toFixed(2) + 's';
  }

  // Self-contained cyclic Fritsch-Carlson monotone-cubic sampler for BitWave nibble registers [0..15]
  // Centered on 0x8 (1000_2 = 0.0) to align with the Ramanujan Chime 4-bit zero crossing.
  function nibbleCyclicSlopes(y) {
    var n = y.length;
    var m = new Float64Array(n);
    if (n < 2) return m;
    var d = new Float64Array(n);
    for (var i = 0; i < n; i++) d[i] = y[(i + 1) % n] - y[i];
    for (var j = 0; j < n; j++) {
      var dp = d[(j - 1 + n) % n];
      var dn = d[j];
      m[j] = (dp * dn <= 0) ? 0 : ((2 * dp * dn) / (dp + dn));
    }
    return m;
  }

  function sampleNibbleCyclic(y, slopes, u) {
    var n = y.length;
    if (n < 2) return n === 1 ? (y[0] - 8) / 8 : 0;
    var uu = ((u % 1) + 1) % 1;
    var pos = uu * n;
    var i0 = Math.floor(pos) % n;
    var i1 = (i0 + 1) % n;
    var tf = pos - Math.floor(pos);
    var t2 = tf * tf;
    var t3 = t2 * tf;
    var raw = (2 * t3 - 3 * t2 + 1) * y[i0] +
              (t3 - 2 * t2 + tf) * slopes[i0] +
              (-2 * t3 + 3 * t2) * y[i1] +
              (t3 - t2) * slopes[i1];
    return (clamp(raw, 0, 15) - 8) / 8;
  }

  function floorField(state, playT, opts) {
    opts = opts || {};
    var res = sphereResonance(state, playT || 0);
    var R = Math.fround(Math.max(0.2, res.R));
    var rIn = Math.fround(clamp(res.rIn, 0, R));
    var eta = res.eta;
    var alpha = res.cavityActive && res.stretchRatio ? res.stretchRatio : 1.0;
    var wallMult = res.wallRatio || 1.0;

    var mode = opts.mode || state.floorMode || 'wavetable'; // 'wavetable' | 'spectrogram'
    var slices = clamp(opts.slices || 28, 8, 48) | 0;
    var bins = clamp(opts.bins || 72, 24, 128) | 0;
    var size = clamp(opts.size != null ? opts.size : (state.floorSize != null ? state.floorSize : 0.94), 0.35, 1.0);
    var depth = clamp(opts.depth != null ? opts.depth : (state.floorDepth != null ? state.floorDepth : 0.68), 0.1, 1.35);
    var smooth = clamp(opts.smooth != null ? opts.smooth : (state.floorSmooth != null ? state.floorSmooth : 0.52), 0.0, 1.0);

    var rEff = R * size;
    var zSpan = rEff * 0.92;
    var activeZNorm = clamp(res.slice ? res.slice.zNorm : 0, -1, 1);
    var activeZ = activeZNorm * zSpan;

    var f = Math.max(0.25, state.f || 1);
    var K = clamp(Math.round(state.K != null ? state.K : 6), 1, 14);
    var ph = state.phaseRad || 0;
    var N = clamp(Math.round(state.orderN || 16), 5, 64);
    var amp = clamp(state.amp || 1, 0.1, 2.5);
    var t = playT || 0;

    var rows = new Array(slices);
    var rowZ = new Float32Array(slices);
    var rowHalfW = new Float32Array(slices);
    var rowInCavity = new Uint8Array(slices);
    var eqCenter = new Float32Array(bins);
    var tiltLine = new Float32Array(bins);
    var activeSlice = new Float32Array(bins);
    var peakFreqHz = 0;
    var peakMag = -1;
    var peakBin = 0;

    var minHz = 32;
    var maxHz = 12000;
    var logRatio = Math.log(maxHz / minHz);

    function binToHz(b) {
      return minHz * Math.exp((b / (bins - 1)) * logRatio);
    }

    var bw = (opts.bitwave && opts.bitwave.activeNibbles && opts.bitwave.activeNibbles.length >= 2) ? opts.bitwave : null;
    var bwDyn = null;

    if (mode === 'spectrogram') {
      // ---- Mode 2: MiniMeters-Style 2D Animated Equalizer (z = 0) + 3D Cavity Dispersion / BPM Timeline ----
      var temporalRows = opts.temporalRows; // Optional [slices][bins]: index 0 = fading past (-z), mid = present (0), last = incoming future (+z)
      var audioBins = opts.audioBins;
      var hasTemporal = !!(temporalRows && temporalRows.length === slices);

      if (hasTemporal) {
        var centerRow = opts.presentRow || temporalRows[Math.floor(slices * 0.5)];
        for (var tbi = 0; tbi < bins; tbi++) {
          var vNow = clamp(centerRow[tbi] || 0, 0, 1);
          eqCenter[tbi] = Math.fround(vNow);
          if (vNow > peakMag) { peakMag = vNow; peakBin = tbi; peakFreqHz = binToHz(tbi); }
        }
      } else if (audioBins && audioBins.length >= 16) {
        for (var bi = 0; bi < bins; bi++) {
          var fHz = binToHz(bi);
          var nyq = opts.sampleRate ? opts.sampleRate * 0.5 : 22050;
          var idxF = clamp((fHz / nyq) * (audioBins.length - 1), 0, audioBins.length - 1);
          var i0 = Math.floor(idxF);
          var i1 = Math.min(audioBins.length - 1, i0 + 1);
          var fracI = idxF - i0;
          var rawA = (audioBins[i0] * (1 - fracI) + audioBins[i1] * fracI) / 255;
          var valA = Math.pow(clamp(rawA, 0, 1), 1.15);
          eqCenter[bi] = Math.fround(valA);
          if (valA > peakMag) { peakMag = valA; peakBin = bi; peakFreqHz = fHz; }
        }
      } else if (bw) {
        // Real FFT spectrum of the cyclic BitWave register anchored to the Chime chromatic pitch Z_12
        var bwSemi = (ph / PI) * 6;
        var bwBaseHz = 98.0 * f * Math.pow(2, bwSemi / 12);
        var bwNib = bw.activeNibbles;
        var bwSlopes = nibbleCyclicSlopes(bwNib);
        var bwPcmLen = 512;
        var bwCycles = 4;
        var bwPcm = new Float32Array(bwPcmLen);
        var bwShift = t * 0.25;
        for (var ps = 0; ps < bwPcmLen; ps++) {
          bwPcm[ps] = sampleNibbleCyclic(bwNib, bwSlopes, (ps / bwPcmLen) * bwCycles + bwShift);
        }
        bwDyn = audioDynamics(bwPcm, 0, bwPcmLen);
        var bwFft = fftMag(bwPcm, 0, bwPcmLen);
        var bwPeaks = [];
        var maxH = Math.min(48, Math.floor((bwFft.length - 1) / bwCycles));
        for (var bh = 1; bh <= maxH; bh++) {
          var hHz = bwBaseHz * bh;
          if (hHz > maxHz * 1.15) break;
          var hMag = bwFft[bh * bwCycles] || 0;
          if (hMag > 0.015) {
            bwPeaks.push({ hz: hHz, w: 0.036 + 0.002 * Math.min(bh, 16), a: hMag * (0.85 + 0.35 * amp) });
          }
        }
        if (!bwPeaks.length) {
          bwPeaks.push({ hz: bwBaseHz, w: 0.05, a: 0.25 });
        }
        for (var bwi = 0; bwi < bins; bwi++) {
          var bHz = binToHz(bwi);
          var bLog = Math.log(bHz);
          var bSum = 0;
          for (var bp = 0; bp < bwPeaks.length; bp++) {
            var bd = (bLog - Math.log(Math.max(16, bwPeaks[bp].hz))) / bwPeaks[bp].w;
            if (Math.abs(bd) < 4.2) bSum += bwPeaks[bp].a * Math.exp(-0.5 * bd * bd);
          }
          var bMag = clamp(Math.tanh(bSum * 1.35), 0, 1);
          eqCenter[bwi] = Math.fround(bMag);
          if (bMag > peakMag) { peakMag = bMag; peakBin = bwi; peakFreqHz = bHz; }
        }
      } else {
        // Deterministic harmonic synth spectrum aligned to chromatic Z_12 & dual-sphere radial modes
        var semiShift = (ph / PI) * 6; // Phase phi transposes across chromatic pitch classes!
        var baseHz = 98.0 * f * Math.pow(2, semiShift / 12); // Anchored near G2 (98 Hz)
        var peaks = [];
        // Outer sphere fundamental + K harmonics
        for (var h = 1; h <= Math.min(K + 2, 14); h++) {
          var hAmp = (1.0 / Math.pow(h, 0.58)) * (0.78 + 0.22 * Math.cos(TAU * t * (1 + 0.25 * h) + ph * 0.5 * h));
          peaks.push({ hz: baseHz * h, w: 0.042 + 0.008 * h, a: hAmp * Math.min(1.2, 0.72 + 0.28 * amp) });
        }
        // Inner cavity OSC B coupled modal resonances (alpha = R/r)
        if (res.cavityActive) {
          for (var c = 1; c <= 4; c++) {
            var cAmp = (0.68 / Math.pow(c, 0.65)) * (0.72 + 0.28 * Math.sin(TAU * t * alpha * 0.5 + c));
            peaks.push({ hz: baseHz * alpha * c, w: 0.036, a: cAmp });
          }
          // Shell wall breathing mode (1 / (1 - eta))
          peaks.push({ hz: baseHz * wallMult, w: 0.055, a: 0.52 * (0.8 + 0.2 * Math.cos(TAU * t * 2)) });
        }
        // Order-N high-frequency metallic chime overtones
        var shimmerHz = baseHz * Math.max(4, N * 0.5);
        peaks.push({ hz: shimmerHz, w: 0.085, a: 0.36 + 0.16 * Math.sin(TAU * t * 3 + ph) });
        peaks.push({ hz: shimmerHz * 1.498, w: 0.095, a: 0.28 + 0.14 * Math.cos(TAU * t * 2.5) });

        for (var b = 0; b < bins; b++) {
          var hz = binToHz(b);
          var logHz = Math.log(hz);
          var sum = 0;
          for (var pk = 0; pk < peaks.length; pk++) {
            var d = (logHz - Math.log(Math.max(16, peaks[pk].hz))) / peaks[pk].w;
            if (Math.abs(d) < 4.5) {
              sum += peaks[pk].a * Math.exp(-0.5 * d * d);
            }
          }
          // Gentle high-frequency harmonic shimmer floor (MiniMeters sparkle)
          var hiRatio = b / (bins - 1);
          var sparkle = hiRatio > 0.45
            ? (0.14 + 0.18 * Math.pow(Math.sin(b * 1.7 + TAU * t * 2 + ph), 2)) * (hiRatio - 0.35) * (1 - Math.pow(hiRatio, 5))
            : 0;
          var mag = clamp(Math.tanh((sum + sparkle) * 0.85), 0, 1);
          eqCenter[b] = Math.fround(mag);
          if (mag > peakMag) { peakMag = mag; peakBin = b; peakFreqHz = hz; }
        }
      }

      // Spectral tilt reference line (smooth linear slope across log frequency, MiniMeters style)
      for (var tb = 0; tb < bins; tb++) {
        var uTilt = tb / (bins - 1);
        tiltLine[tb] = Math.fround(clamp(0.14 + 0.56 * uTilt, 0, 1));
      }

      // 3D Cavity Dispersion / Constant-BPM Time Window T across the sphere floor (z = 0 is Present!)
      // When temporalRows are supplied (MP3 / System Audio BPM timeline):
      //   z > 0 = Incoming future approaching the 2D f(x) slice
      //   z = 0 = Exact Present (2D MiniMeters Equalizer)
      //   z < 0 = Fading past dissipating away through the hollow sphere cavity
      var dispSigma = 0.28 + smooth * 0.78;
      for (var s = 0; s < slices; s++) {
        var v = slices > 1 ? (s / (slices - 1)) * 2 - 1 : 0; // -1 (back / past) .. +1 (front / incoming)
        var z = v * zSpan;
        var halfW = Math.sqrt(Math.max(0.01, rEff * rEff - z * z));
        var inCav = res.cavityActive && Math.abs(z) <= rIn;
        rowZ[s] = Math.fround(z);
        rowHalfW[s] = Math.fround(halfW);
        rowInCavity[s] = inCav ? 1 : 0;

        var row = new Float32Array(bins);
        var distZ = Math.abs(v);
        var envZ = hasTemporal
          ? (0.34 + 0.66 * Math.exp(-0.5 * Math.pow(distZ / Math.max(0.35, dispSigma), 2)))
          : Math.exp(-0.5 * Math.pow(distZ / dispSigma, 2));
        var cavityBoost = inCav ? (1.0 + 0.14 * Math.cos(distZ * PI * alpha)) : 1.0;
        var ripplePhase = distZ * 4.5 - TAU * t * 1.5;
        var srcRow = hasTemporal ? temporalRows[s] : eqCenter;

        for (var j = 0; j < bins; j++) {
          var u = j / (bins - 1);
          var travel = hasTemporal ? 1.0 : (0.86 + 0.14 * Math.cos(ripplePhase + u * 5.0));
          var edgeTaper = Math.sin(u * PI);
          var taper = Math.pow(Math.max(0, edgeTaper), 0.14);
          row[j] = Math.fround(clamp((srcRow[j] || 0) * envZ * cavityBoost * travel * taper * depth, 0, 1.35));
        }
        rows[s] = row;
      }

      for (var as = 0; as < bins; as++) activeSlice[as] = eqCenter[as];
    } else {
      // ---- Mode 1: GitWave-Inspired 3D Volumetric Wavetable Floor (Proportional to R, r, Z_12) ----
      var smoothPasses = Math.round(smooth * 5);
      var waveTime = TAU * t;
      var activeRowIdxF = ((activeZNorm + 1) * 0.5) * (slices - 1);
      var bwA = bw ? (bw.nibblesA || bw.activeNibbles) : null;
      var bwMid = bw ? bw.activeNibbles : null;
      var bwB = bw ? (bw.nibblesB || bw.activeNibbles) : null;
      var bwSlA = bwA ? nibbleCyclicSlopes(bwA) : null;
      var bwSlM = bwMid ? nibbleCyclicSlopes(bwMid) : null;
      var bwSlB = bwB ? nibbleCyclicSlopes(bwB) : null;
      if (bwMid) {
        var bwWTpcm = new Float32Array(128);
        for (var bwp = 0; bwp < 128; bwp++) bwWTpcm[bwp] = sampleNibbleCyclic(bwMid, bwSlM, bwp / 128);
        bwDyn = audioDynamics(bwWTpcm, 0, 128);
      }

      for (var si = 0; si < slices; si++) {
        var vz = slices > 1 ? (si / (slices - 1)) * 2 - 1 : 0;
        var zPos = vz * zSpan;
        var hw = Math.sqrt(Math.max(0.01, rEff * rEff - zPos * zPos));
        var inC = res.cavityActive && Math.abs(zPos) <= rIn;
        rowZ[si] = Math.fround(zPos);
        rowHalfW[si] = Math.fround(hw);
        rowInCavity[si] = inC ? 1 : 0;

        var rawRow = new Float32Array(bins);
        if (bwMid) {
          // BitWave Register Stack sculpted onto the 3D Cutaway Floor: A (-z) -> Active/Z (z=0) -> B (+z)
          var bwPhase = t * 0.5 + ph / TAU + vz * 0.08 * eta;
          var cyclesX = Math.max(1, Math.min(3, Math.round(f)));
          for (var bbi = 0; bbi < bins; bbi++) {
            var ub = bbi / (bins - 1);
            var phaseU = ub * cyclesX + bwPhase;
            var yBw;
            if (vz < 0) {
              var wA = -vz;
              yBw = sampleNibbleCyclic(bwA, bwSlA, phaseU) * wA + sampleNibbleCyclic(bwMid, bwSlM, phaseU) * (1 - wA);
            } else {
              var wB = vz;
              yBw = sampleNibbleCyclic(bwMid, bwSlM, phaseU) * (1 - wB) + sampleNibbleCyclic(bwB, bwSlB, phaseU) * wB;
            }
            var bellBw = Math.pow(Math.sin(ub * PI), 0.24);
            rawRow[bbi] = Math.fround(clamp(yBw * bellBw, -1, 1));
          }
        } else {
          var sliceMorph = vz * PI * (0.65 + 0.35 * eta);
          var fmIdx = 0.35 + 0.55 * (K / 14) + (inC ? 0.25 : 0);

          for (var bi2 = 0; bi2 < bins; bi2++) {
            var u2 = bi2 / (bins - 1);
            var theta = u2 * TAU * Math.max(1, Math.min(4, f)) + ph + sliceMorph;
            var modOsc = Math.sin(theta * Math.max(1, alpha * 0.75) - waveTime + vz * 2.4);
            var carrier = Math.sin(theta + fmIdx * modOsc + waveTime * 0.5);
            var oddHarm = Math.sin(theta * 3 - sliceMorph * 1.4) * (0.28 * (K / 14));
            var fifthHarm = Math.sin(theta * 1.5 + waveTime) * (inC ? 0.32 : 0.12);
            var bell = Math.pow(Math.sin(u2 * PI), 0.32); // Clean pinned edges along circular sphere rim
            var yVal = (carrier * 0.68 + oddHarm + fifthHarm) * bell;
            rawRow[bi2] = Math.fround(clamp(yVal, -1, 1));
          }
        }

        var smRow = smoothPasses > 0 ? smoothArr1D(rawRow, smoothPasses) : rawRow;
        for (var k = 0; k < bins; k++) {
          smRow[k] = Math.fround(smRow[k] * depth);
        }
        rows[si] = smRow;
      }

      // Interpolate exact Active WT Pos slice at activeZNorm (synced to Auto z(t)!)
      var r0 = clamp(Math.floor(activeRowIdxF), 0, slices - 1);
      var r1 = Math.min(slices - 1, r0 + 1);
      var rf = activeRowIdxF - r0;
      for (var ak = 0; ak < bins; ak++) {
        activeSlice[ak] = Math.fround(rows[r0][ak] * (1 - rf) + rows[r1][ak] * rf);
      }

      // Fundamental pitch of the active wavetable carrier (chromatic Z_12)
      var wtSemi = (ph / PI) * 6;
      peakFreqHz = 98.0 * f * Math.pow(2, wtSemi / 12);
    }

    var pitchInfo = freqToNoteCents(peakFreqHz);
    var bpm = clamp(opts.bpm || state.floorBpm || 120, 40, 240);
    var windowBeats = clamp(opts.windowBeats || state.floorBeats || 4, 0.25, 16);
    var windowSec = opts.windowSec != null
      ? clamp(opts.windowSec, FLOOR_ZOOM_MIN_SEC, FLOOR_ZOOM_MAX_SEC)
      : (state.floorZoomLog != null ? floorZoomSec(state.floorZoomLog) : ((60 * windowBeats) / bpm));
    var cavityWindowSec = windowSec * eta;
    var floorVelocity = (2 * R) / Math.max(1e-4, windowSec); // sphere diameters/sec past z=0 needle

    return {
      mode: mode,
      R: R,
      rIn: rIn,
      rEff: Math.fround(rEff),
      eta: eta,
      alpha: alpha,
      size: size,
      depth: depth,
      smooth: smooth,
      slices: slices,
      bins: bins,
      zSpan: Math.fround(zSpan),
      activeZNorm: Math.fround(activeZNorm),
      activeZ: Math.fround(activeZ),
      rows: rows,
      rowZ: rowZ,
      rowHalfW: rowHalfW,
      rowInCavity: rowInCavity,
      activeSlice: activeSlice,
      eqCenter: eqCenter,
      tiltLine: tiltLine,
      peakBin: peakBin,
      pitch: pitchInfo,
      syzygy: res.syzygy,
      bpm: bpm,
      windowBeats: windowBeats,
      windowSec: Math.fround(windowSec),
      cavityWindowSec: Math.fround(cavityWindowSec),
      floorVelocity: Math.fround(floorVelocity),
      dynamics: opts.dynamics || bwDyn || null,
      hasLookahead: !!opts.hasLookahead,
      sourceLabel: opts.sourceLabel || (bw ? ('BITWAVE ' + (bw.widthBits || (bw.activeNibbles.length * 4)) + 'b') : 'SYNTH'),
      bitwave: bw || null
    };
  }

  var Harmony = {
    PRECISION: 'float32',
    engine: {
      TAU: TAU, PI: PI,
      frac: frac, saw: sawCompat, square: square, triangle: triCompat, clamp: clamp, lerp: lerp, cbrt: cbrtFn,
      weierstrass: weierstrass, weierstrassNorm: weierstrassNorm,
      morlet: morlet, morletIm: morletIm, gauss: gauss,
      fourierSquare: fourierSquare, fourierSaw: fourierSaw,
      groverX: groverX, groverY: groverY, blocksX: blocksX, blocksY: blocksY,
      groverMetrics: groverMetrics,
      compile: compile, validate: validate, paramsFor: paramsFor,
      sample: sample, point: point, sampleWindow: sampleWindow,
      shellMetrics: shellMetrics, zoneOf: zoneOf,
      sphereResonance: sphereResonance,
      solveConstantVolumeR: solveConstantVolumeR,
      solveConstantVolumeRIn: solveConstantVolumeRIn,
      solveConstantVolumePairForEta: solveConstantVolumePairForEta,
      gcd: gcd, isPrimeInt: isPrimeInt, discreteGroup: discreteGroup,
      twinOf: twinOf,
      playhead: playhead, readout: readout,
      fourBitOrbit: fourBitOrbit,
      freqToNoteCents: freqToNoteCents,
      fftMag: fftMag,
      audioDynamics: audioDynamics,
      floorZoomSec: floorZoomSec,
      floorZoomLogFromSec: floorZoomLogFromSec,
      fmtZoomSec: fmtZoomSec,
      floorField: floorField,
      fmtNum: fmtNum, bitInspect: bitInspect,
      ramanujanSeries: ramanujanSeries,
      initSecp: initSecp, secpSeq: secpSeq,
      secpReadout: secpReadout, frobReadout: frobReadout, frobAngles: frobAngles,
      fmtBig: fmtBig, fSci: fSci, bigSci: bigSci
    }
  };

  // Dual export: the browser page keeps window.Harmony; Node's CLI, MCP server,
  // generator and tests require() this exact file (one implementation).
  var root = (typeof window !== 'undefined') ? window
    : (typeof globalThis !== 'undefined' ? globalThis : null);
  if (root) root.Harmony = Harmony;
  if (typeof module !== 'undefined' && module && module.exports) {
    module.exports = Harmony;
  }
})();
