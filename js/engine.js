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
    var effN = s.n;
    var effM = s.m;
    var effK = s.k;
    var effPhase = s.phaseRad || 0;
    var fns = FNS;

    // Optional Clef-Identity Round register & Lowest-Common-Structure (LCS) projective reduction
    // (default clefRoundM=0, lcsReduce=false keeps all baseline presets 100% bit-exact)
    var roundM = s.clefRoundM ? clamp(Math.round(s.clefRoundM), 0, 12) : 0;
    if (roundM > 0 || s.lcsReduce) {
      if (s.lcsReduce) {
        var activeAx = detectRatioAxes(s.formulas);
        var lcsRes = lowestCommonStructure(s.n, s.m, s.k, {
          roundM: roundM,
          useN: activeAx.useN,
          useM: activeAx.useM,
          useK: activeAx.useK
        });
        effN = lcsRes.nPrim;
        effM = lcsRes.mPrim;
        effK = lcsRes.kPrim;
      } else if (roundM > 0 && effM != null) {
        effM = effM * Math.pow(2, roundM);
      }
    }

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
      s.r, rIn, s.amp, effF, effN, effM, effK, K, N, a, b, effPhase
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

  // Greatest common divisor, least common multiple & primality check
  function gcd(a, b) {
    a = Math.abs(Math.trunc(Number(a) || 0));
    b = Math.abs(Math.trunc(Number(b) || 0));
    while (b !== 0) { var t = b; b = a % b; a = t; }
    return a || 1;
  }

  function lcm(a, b) {
    a = Math.abs(Math.trunc(Number(a) || 0));
    b = Math.abs(Math.trunc(Number(b) || 0));
    if (a === 0 || b === 0) return 0;
    return (a / gcd(a, b)) * b;
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

  // ---- Stage 1: Sentinel Outer Register (σ), Clef-Identity (2-adic) & Lowest-Common-Structure ----

  function detectRatioAxes(formulas) {
    if (!formulas || typeof formulas !== 'object') {
      return { useN: true, useM: true, useK: true };
    }
    var joined = String(formulas.x || '') + ' ' + String(formulas.y || '') + ' ' + String(formulas.z || '');
    var useN = /\bn\b/.test(joined);
    var useM = /\bm\b/.test(joined);
    var useK = /\bk\b/.test(joined);
    if (!useN && !useM && !useK) {
      return { useN: true, useM: true, useK: true };
    }
    return { useN: useN, useM: useM, useK: useK };
  }

  // Exact 2-adic Movable C-Clef decomposition: M = M_odd * 2^nu2(M)
  // Plus small prime-limit lattice factors & even-neighbor Clef residual for odd/prime M.
  function clefFactor(val) {
    var M = Math.round(Number(val));
    if (!isFinite(M) || M < 1) {
      return {
        valid: false,
        value: 0,
        oddKernel: 0,
        octave: 0,
        pow2: 1,
        isPowerOfTwo: false,
        isPrime: false,
        primeExponents: {},
        clefLabel: '—',
        evenNeighbor: null
      };
    }

    var odd = M;
    var oct = 0;
    while (odd % 2 === 0) {
      odd = odd / 2;
      oct++;
    }
    var pow2 = Math.pow(2, oct);

    // Compact prime-limit factorization for composite lattice inspection (bounded trial division)
    var primeExp = {};
    if (oct > 0) primeExp['2'] = oct;
    var rem = odd;
    var limit = Math.min(Math.floor(Math.sqrt(rem)), 10000);
    for (var d = 3; d <= limit && rem > 1; d += 2) {
      var cnt = 0;
      while (rem % d === 0) {
        rem = rem / d;
        cnt++;
      }
      if (cnt > 0) {
        primeExp[String(d)] = cnt;
        limit = Math.min(Math.floor(Math.sqrt(rem)), 10000);
      }
    }
    if (rem > 1) {
      primeExp[String(rem)] = (primeExp[String(rem)] || 0) + 1;
    }

    var isPrime = (M <= 1e9) ? isPrimeInt(M) : false;

    // For odd M > 1 (especially primes), find nearest high-clef even neighbor E = odd_E * 2^oct_E
    // Prefer greater even neighbor (M + 1) on ties so M = E - 1 ("uncompleted wavecycle").
    var evenNeighbor = null;
    if (oct === 0 && M > 1) {
      var hi = M + 1, hiOct = 0, hiOdd = hi;
      while (hiOdd % 2 === 0) { hiOdd /= 2; hiOct++; }
      var lo = M - 1, loOct = 0, loOdd = lo;
      while (loOdd > 0 && loOdd % 2 === 0) { loOdd /= 2; loOct++; }
      var pickHi = (hiOct >= loOct);
      var evVal = pickHi ? hi : lo;
      var evOdd = pickHi ? hiOdd : loOdd;
      var evOct = pickHi ? hiOct : loOct;
      var resSign = pickHi ? -1 : 1;
      var baseStr = (evOdd === 1) ? ('2^' + evOct) : (evOdd + '·2^' + evOct);
      evenNeighbor = {
        evenVal: evVal,
        oddKernel: evOdd,
        octave: evOct,
        residual: resSign,
        label: baseStr + (resSign < 0 ? ' − 1' : ' + 1')
      };
    }

    var clefLabel = (odd === 1)
      ? ('1·2^' + oct + ' (C)')
      : (odd + '·2^' + oct);

    return {
      valid: true,
      value: M,
      oddKernel: odd,
      octave: oct,
      pow2: pow2,
      isPowerOfTwo: odd === 1,
      isPrime: isPrime,
      primeExponents: primeExp,
      clefLabel: clefLabel,
      evenNeighbor: evenNeighbor
    };
  }

  // BigInt-safe Pseudo-Mersenne / Solinas Even-Clef decomposition: P = 2^sigma - deficit
  // Connects directly to secp256k1 (2^256 - 2^32 - 977) and Mersenne primes (2^p - 1).
  function pseudoMersenneDecomp(val) {
    var P;
    try {
      P = (typeof val === 'bigint') ? val : BigInt(val);
    } catch (e) {
      return { valid: false };
    }
    if (P < 1n) return { valid: false };
    var bin = P.toString(2);
    var bits = bin.length;
    var lowPow = 1n << BigInt(bits - 1);
    if (P === lowPow) {
      return {
        valid: true,
        value: P.toString(),
        bitLength: bits,
        upperSigma: bits - 1,
        upperDeficit: '0',
        nearestSigma: bits - 1,
        residual: '0',
        isExactPowerOfTwo: true,
        label: '2^' + (bits - 1)
      };
    }
    var highPow = 1n << BigInt(bits);
    var deficit = highPow - P;
    var excess = P - lowPow;
    var useHigh = deficit <= excess;
    var nearSigma = useHigh ? bits : (bits - 1);
    var residualStr = useHigh ? ('-' + deficit.toString()) : ('+' + excess.toString());
    var label = useHigh
      ? ('2^' + bits + ' − ' + deficit.toString())
      : ('2^' + (bits - 1) + ' + ' + excess.toString());
    return {
      valid: true,
      value: P.toString(),
      bitLength: bits,
      upperSigma: bits,
      upperDeficit: deficit.toString(),
      nearestSigma: nearSigma,
      residual: residualStr,
      isExactPowerOfTwo: false,
      label: label
    };
  }

  // Projective gcd-reduction ("Lowest-Common-Structure") + lcm Round closure + Observer Horizon
  function lowestCommonStructure(n, m, k, opts) {
    opts = opts || {};
    var roundM = clamp(Math.round(opts.roundM || 0), 0, 16);
    var samples = Math.max(64, Math.round(opts.samples || 3200));
    var useN = opts.useN !== false;
    var useM = opts.useM !== false;
    var useK = (k != null) ? (opts.useK !== false) : false;

    var nEff = Math.max(1, Math.round(n != null ? n : 1));
    var mBase = Math.max(1, Math.round(m != null ? m : 1));
    var mEff = mBase * Math.pow(2, roundM);
    var kEff = Math.max(1, Math.round(k != null ? k : 1));

    var active = [];
    if (useN) active.push(nEff);
    if (useM) active.push(mEff);
    if (useK) active.push(kEff);
    if (active.length === 0) active = [nEff, mEff];

    var g = active[0];
    for (var i = 1; i < active.length; i++) {
      g = gcd(g, active[i]);
    }
    if (active.length === 1) g = 1;

    var nPrim = useN ? Math.round(nEff / g) : nEff;
    var mPrim = useM ? Math.round(mEff / g) : mEff;
    var kPrim = useK ? Math.round(kEff / g) : kEff;

    var closure = active[0];
    for (var j = 1; j < active.length; j++) {
      closure = lcm(closure, active[j]);
    }
    var primActive = [];
    if (useN) primActive.push(nPrim);
    if (useM) primActive.push(mPrim);
    if (useK) primActive.push(kPrim);
    if (primActive.length === 0) primActive = [nPrim, mPrim];
    var primClosure = primActive[0];
    for (var p = 1; p < primActive.length; p++) {
      primClosure = lcm(primClosure, primActive[p]);
    }

    var maxEff = Math.max.apply(null, active);
    var maxPrim = Math.max.apply(null, primActive);
    var maxObservableCycles = Math.floor(samples / 2);
    var smoothBudget = Math.floor(samples / 32);

    var clefM = clefFactor(mEff);
    var clefShared = clefFactor(g);

    var rawParts = [];
    var primParts = [];
    if (useN) { rawParts.push(String(nEff)); primParts.push(String(nPrim)); }
    if (useM) { rawParts.push(String(mEff)); primParts.push(String(mPrim)); }
    if (useK) { rawParts.push(String(kEff)); primParts.push(String(kPrim)); }

    return {
      nEff: nEff,
      mBase: mBase,
      mEff: mEff,
      kEff: kEff,
      roundM: roundM,
      useN: useN,
      useM: useM,
      useK: useK,
      gcd: g,
      sharedClefOctave: clefShared.octave,
      sharedOddKernel: clefShared.oddKernel,
      nPrim: nPrim,
      mPrim: mPrim,
      kPrim: kPrim,
      roundClosure: closure,
      primClosure: primClosure,
      computeSavingRatio: g,
      rawLabel: rawParts.join(':'),
      reducedLabel: primParts.join(':'),
      clefM: clefM,
      maxEffective: maxEff,
      maxPrimitive: maxPrim,
      maxObservableCycles: maxObservableCycles,
      smoothBudget: smoothBudget,
      exceedsSmoothHorizon: maxEff > smoothBudget,
      exceedsNyquist: maxEff > maxObservableCycles
    };
  }

  // Schmitt-Trigger Clef-Change Hysteresis (Session 1 §6.2):
  // Expands sigma -> sigma+1 above rHi (1.00), compacts sigma -> sigma-1 only below rLo (0.42).
  // Exact 2^(+-1) scaling shifts only the float32 exponent (0-bit mantissa drift).
  function sentinelHysteresisStep(normRadius, sigma, cfg) {
    cfg = cfg || {};
    var rHi = cfg.rHi != null ? cfg.rHi : 1.0;
    var rLo = cfg.rLo != null ? cfg.rLo : 0.42;
    var minOct = cfg.minOct != null ? cfg.minOct : -24;
    var maxOct = cfg.maxOct != null ? cfg.maxOct : 64;
    var curSig = clamp(Math.round(sigma || 0), minOct, maxOct);
    var rVal = Number(normRadius);
    if (!isFinite(rVal) || rVal < 0) rVal = 0;

    if (rVal > rHi && curSig < maxOct) {
      return {
        nextSigma: curSig + 1,
        action: 'clef_up',
        scaledRadius: Math.fround(rVal * 0.5),
        deadband: false,
        rLo: rLo,
        rHi: rHi
      };
    }
    if (rVal > 0 && rVal < rLo && curSig > minOct) {
      return {
        nextSigma: curSig - 1,
        action: 'clef_down',
        scaledRadius: Math.fround(rVal * 2.0),
        deadband: false,
        rLo: rLo,
        rHi: rHi
      };
    }
    return {
      nextSigma: curSig,
      action: 'hold',
      scaledRadius: Math.fround(rVal),
      deadband: true,
      rLo: rLo,
      rHi: rHi
    };
  }

  // Unified Unseen Sentinel Outer Register (σ) + Scale-Frequency Duality + Edge-to-Infinity Telemetry
  function sentinelRegister(state, opts) {
    state = state || {};
    opts = opts || {};
    var samples = Math.max(64, Math.round(opts.samples || 3200));
    var sigma = clamp(Math.round(state.sentinelOctave || 0), -24, 64);
    var Runit = Math.fround(Math.max(0.05, state.r != null ? state.r : 1));
    var rInUnit = Math.fround(clamp(state.rIn != null ? state.rIn : 0, 0, Runit));
    var scalePow2 = Math.pow(2, sigma);
    var Rsent = Runit * scalePow2;
    var rInSent = rInUnit * scalePow2;
    var RsentLog2 = Math.fround((Math.log(Runit) / Math.LN2) + sigma);
    var eta = Math.fround(rInUnit / Runit);
    var compaction = Math.pow(2, -sigma);
    var pitchOctaveShift = -sigma;
    var pitchMultiplier = Math.pow(2, -sigma);

    var sh = shellMetrics({ r: Runit, rIn: rInUnit });
    var volShellLog2 = sh.volShell > 0
      ? Math.fround((Math.log(sh.volShell) / Math.LN2) + 3 * sigma)
      : -Infinity;

    // Verify IEEE-754 float32 mantissa invariance across dyadic Clef jump
    var rScaledF32 = Math.fround(Rsent);
    var mantissaPreserved = Number.isFinite(rScaledF32) && rScaledF32 > 0
      ? (bitInspect(Runit).mantBits === bitInspect(rScaledF32).mantBits)
      : true;

    var roundM = clamp(Math.round(state.clefRoundM || 0), 0, 12);
    var activeAx = detectRatioAxes(state.formulas);
    var lcs = lowestCommonStructure(state.n, state.m, state.k, {
      roundM: roundM,
      useN: activeAx.useN,
      useM: activeAx.useM,
      useK: activeAx.useK,
      samples: samples
    });
    var orderNClef = clefFactor(Math.round(state.orderN != null ? state.orderN : 19));

    var freqCycles = Math.abs(state.f != null ? state.f : 1);
    var effCycles = Math.max(freqCycles, lcs.maxEffective);
    var redCycles = state.lcsReduce ? Math.max(freqCycles, lcs.maxPrimitive) : effCycles;
    var maxObs = Math.floor(samples / 2);
    var smoothBudget = Math.floor(samples / 32);
    var horizonState = redCycles > maxObs
      ? 'beyond_nyquist'
      : (redCycles > smoothBudget ? 'dense' : 'clear');

    var scaleTag = (sigma === 0)
      ? '1×'
      : ('2^' + (sigma > 0 ? '+' + sigma : String(sigma)));

    return {
      sigma: sigma,
      scalePow2: scalePow2,
      scaleTag: scaleTag,
      Runit: Runit,
      rInUnit: rInUnit,
      Rsent: Rsent,
      rInSent: rInSent,
      RsentLog2: RsentLog2,
      eta: eta,
      compaction: compaction,
      pitchOctaveShift: pitchOctaveShift,
      pitchMultiplier: pitchMultiplier,
      volShellLog2: volShellLog2,
      mantissaPreserved: mantissaPreserved,
      roundM: roundM,
      lcsReduce: !!state.lcsReduce,
      lcs: lcs,
      orderNClef: orderNClef,
      horizon: {
        samples: samples,
        maxObservableCycles: maxObs,
        smoothBudget: smoothBudget,
        effectiveCycles: effCycles,
        renderedCycles: redCycles,
        ratio: Math.fround(redCycles / maxObs),
        state: horizonState
      }
    };
  }

  // ---- The Vessel Calculus (docs/VESSEL-CALCULUS.md) ----
  // Pure single-source derivations rooted in V(R, r) = (4/3)*pi*(R^3 - r^3):
  //   1. Spatial Derivative Ladder V^(0..4) & unit-time complex-frequency law dP/P = dV/V + i*dTheta
  //   2. Hypergeometric constant-volume series & exact 3rd-order cubic perturbation
  //   3. Telescoping multitudes (N+1)V, base-8 Sentinel shell decomposition & Cuban/Taxicab locks
  //   4. RX 11 Time-Zoom vector with exact BigInt dyadic modular entry phase
  //   5. Parallel Perspective Bus (P / -P / Conj / -Conj / E+ / E- / ~P) with bus-null pole guard

  var UNIT_SPHERE_V0 = (4 / 3) * PI;

  function log2BigInt(n) {
    if (typeof n !== 'bigint' || n <= 0n) return -Infinity;
    var bl = n.toString(2).length;
    if (bl <= 53) return Math.log(Number(n)) / Math.LN2;
    var top = Number(n >> BigInt(bl - 53));
    return (Math.log(top) / Math.LN2) + (bl - 53);
  }

  function vesselCalculus(state, opts) {
    state = state || {};
    opts = opts || {};
    var R = Math.max(0, Number(state.r != null ? state.r : 1));
    var rInRaw = Math.max(0, Number(state.rIn != null ? state.rIn : 0));
    var inverted = rInRaw > R;
    var rIn = rInRaw;
    var dR = Number(opts.dR || 0);
    var dr = Number(opts.dr || 0);
    var theta = Number(opts.theta != null ? opts.theta : (state.phaseRad || 0));
    var dTheta = Number(opts.dTheta || 0);
    var epsBoundary = opts.epsBoundary != null ? opts.epsBoundary : 1e-6;

    var vUnit = R * R * R - rIn * rIn * rIn;
    var V = UNIT_SPHERE_V0 * vUnit;
    var eta = R > 0 ? (rIn / R) : 0;
    var eta2 = eta * eta;
    var volFrac = 1 - eta * eta * eta;
    var thickness = R - rIn;

    // 1st spatial derivatives: dV/dR = 4*pi*R^2, dV/dr = -4*pi*r^2
    var d1R = 4 * PI * R * R;
    var d1r = -4 * PI * rIn * rIn;
    var archimedesRing = (d1R + d1r) * 0.25; // exact pi*(R^2 - r^2)

    // 2nd spatial derivatives: d2V/dR2 = 8*pi*R, d2V/dr2 = -8*pi*r
    var d2R = 8 * PI * R;
    var d2r = -8 * PI * rIn;
    var wallFromD2 = (d2R + d2r) / (8 * PI);
    var alpha = rIn > epsBoundary ? (-d2R / d2r) : Infinity;

    // 3rd & 4th spatial derivatives: exact +-8*pi antipodal null, exact 0 closure
    var d3R = 8 * PI;
    var d3r = -8 * PI;

    // Boundary classification (Edge Case 1: eta -> 0+ solid ball, eta -> 1- thin shell)
    var boundaryState = 'normal';
    if (R <= epsBoundary) {
      boundaryState = 'degenerate_R0';
    } else if (inverted) {
      boundaryState = 'inverted_polarity';
    } else if (eta <= epsBoundary) {
      boundaryState = 'solid_ball';
    } else if (Math.abs(volFrac) <= epsBoundary || Math.abs(thickness) <= epsBoundary) {
      boundaryState = 'thin_shell_sentinel';
    }

    // Raw unit-time volume derivative dV/dt = 4*pi*(R^2*dR - r^2*dr) is ALWAYS finite!
    var dV = d1R * dR + d1r * dr;
    var dEta = R > epsBoundary ? ((dr - eta * dR) / R) : 0;
    var scaleRate = R > epsBoundary ? (3 * (dR / R)) : 0;
    var sigmaRate = scaleRate / (3 * Math.LN2);

    var sensitivity, shapeRate, dVOverV, tuningOctVel;
    if (boundaryState === 'solid_ball') {
      sensitivity = 0;
      shapeRate = 0;
      dVOverV = scaleRate;
      tuningOctVel = 0;
    } else if (boundaryState === 'thin_shell_sentinel' || Math.abs(V) <= 1e-12) {
      sensitivity = Infinity;
      shapeRate = dEta === 0 ? 0 : (dEta > 0 ? -Infinity : Infinity);
      dVOverV = dV === 0 ? 0 : (dV > 0 ? Infinity : -Infinity);
      tuningOctVel = -dEta / (eta * Math.LN2);
    } else {
      sensitivity = (3 * eta2) / volFrac;
      shapeRate = -sensitivity * dEta;
      dVOverV = scaleRate + shapeRate;
      tuningOctVel = -dEta / (eta * Math.LN2);
    }

    var isLockedV = Math.abs(dV) <= 1e-9 || (Number.isFinite(dVOverV) && Math.abs(dVOverV) <= 1e-7);
    var triadOuter = R > epsBoundary ? (8 * PI) / d2R : Infinity;
    var triadInner = rIn > epsBoundary ? (8 * PI) / (-d2r) : Infinity;
    var triadWall = Math.abs(thickness) > epsBoundary ? (8 * PI) / (d2R + d2r) : Infinity;

    return {
      R: R,
      rIn: rIn,
      eta: eta,
      alpha: alpha,
      thickness: thickness,
      volFrac: volFrac,
      vUnit: vUnit,
      V: V,
      boundaryState: boundaryState,
      invertedPolarity: inverted,
      d1: {
        dR: d1R,
        dr: d1r,
        jacobian: eta2,
        archimedesRing: archimedesRing
      },
      d2: {
        dR2: d2R,
        dr2: d2r,
        mixed: 0,
        wallDelta: wallFromD2,
        ratioAlpha: alpha,
        triad: {
          outer: triadOuter,
          inner: triadInner,
          wall: triadWall
        }
      },
      d3: {
        dR3: d3R,
        dr3: d3r,
        antipodalSum: d3R + d3r
      },
      d4: 0,
      dynamics: {
        dR: dR,
        dr: dr,
        dEta: dEta,
        dV: dV,
        scaleRate: scaleRate,
        sigmaRate: sigmaRate,
        sensitivity: sensitivity,
        shapeRate: shapeRate,
        dVOverV: dVOverV,
        tuningOctVel: tuningOctVel,
        isLockedV: isLockedV,
        theta: theta,
        dTheta: dTheta,
        complexFreq: { re: dVOverV, im: dTheta },
        dVOverVSentinel: Number.isFinite(dVOverV) ? null : bitInspect(dVOverV).hex
      }
    };
  }

  // Exact 3rd-order Taylor perturbation around (R0, r0) — zero truncation remainder!
  function vesselPerturbation(R0, r0, dR, dr) {
    var o1 = 4 * PI * (R0 * R0 * dR - r0 * r0 * dr);
    var o2 = 4 * PI * (R0 * dR * dR - r0 * dr * dr);
    var o3 = UNIT_SPHERE_V0 * (dR * dR * dR - dr * dr * dr);
    var total = o1 + o2 + o3;
    var exact = UNIT_SPHERE_V0 * (Math.pow(R0 + dR, 3) - Math.pow(r0 + dr, 3)) -
                UNIT_SPHERE_V0 * (R0 * R0 * R0 - r0 * r0 * r0);
    return {
      order1: o1,
      order2: o2,
      order3: o3,
      total: total,
      exact: exact,
      residual: Math.abs(total - exact)
    };
  }

  // Hypergeometric constant-volume series: R(eta) = R0 * (1 - eta^3)^(-1/3) = R0 * sum (1/3)_k / k! * eta^(3k)
  function hypergeometricLockV(r0, eta, maxK) {
    var K = clamp(Math.round(maxK == null ? 6 : maxK), 0, 32);
    var x = eta * eta * eta;
    var exact = (1 - x) > 0 ? (r0 / cbrtFn(1 - x)) : Infinity;
    var coeff = 1;
    var xPow = 1;
    var sum = 0;
    var terms = [];
    for (var k = 0; k <= K; k++) {
      var term = r0 * coeff * xPow;
      sum += term;
      terms.push({
        k: k,
        coeff: coeff,
        term: term,
        partialSum: sum,
        relError: Number.isFinite(exact) && exact > 0 ? Math.abs(sum - exact) / exact : NaN
      });
      coeff = coeff * ((k + 1 / 3) / (k + 1));
      xPow *= x;
    }
    return { r0: r0, eta: eta, eta3: x, exact: exact, approx: sum, terms: terms };
  }

  // Telescoping concentric equal-volume multitude stack: m * V0 = (4/3)*pi*(R_m^3 - r0^3)
  function multitudeShell(r0, count) {
    var inner = Math.max(0, Number(r0 || 0));
    var m = Math.max(0, Number(count || 0));
    var R = cbrtFn(inner * inner * inner + m);
    var Rnext = cbrtFn(inner * inner * inner + m + 1);
    var deltaNext = Rnext - R;
    var d1Approx = R > 1e-9 ? (1 / (3 * R * R)) : Infinity;
    return {
      r0: inner,
      count: m,
      R: R,
      Rnext: Rnext,
      volume: m * UNIT_SPHERE_V0,
      deltaNext: deltaNext,
      d1InverseApprox: d1Approx
    };
  }

  // BigInt-safe Base-8 (Octal) Sentinel Volume Shell Decomposition:
  // Stepping Sentinel radius by +1 octave scales volume by 2^3 = 8.
  function sentinelOctalDecomp(val) {
    var P;
    try {
      P = (typeof val === 'bigint') ? val : BigInt(val);
    } catch (e) {
      return { valid: false };
    }
    if (P < 1n) return { valid: false };

    var bits = P.toString(2).length;
    var lowPow = 1n << BigInt(bits - 1);
    var isExactPow2 = (P === lowPow);
    var ceilBits = isExactPow2 ? (bits - 1) : bits;
    var outerSigma = Math.floor(ceilBits / 3);
    var outerMultitude = 1 << (ceilBits % 3); // 1, 2, or 4
    var outerVolume = BigInt(outerMultitude) << BigInt(3 * outerSigma);
    var cavityDeficit = outerVolume - P;

    // Unsigned octal shells (d_sigma in 0..7)
    var octalDigits = [];
    var rem = P;
    while (rem > 0n) {
      octalDigits.push(Number(rem & 7n));
      rem >>= 3n;
    }

    // Balanced signed octal shells (d_sigma in -4..+4; negative = nested cavity)
    var signedDigits = [];
    var sRem = P;
    while (sRem > 0n) {
      var d = Number(sRem & 7n);
      sRem >>= 3n;
      if (d > 4) {
        d -= 8;
        sRem += 1n;
      }
      signedDigits.push(d);
    }

    var etaLog2 = cavityDeficit > 0n ? ((log2BigInt(cavityDeficit) - ceilBits) / 3) : -Infinity;
    var etaApprox = cavityDeficit > 0n ? Math.pow(2, etaLog2) : 0;

    return {
      valid: true,
      value: P.toString(),
      bitLength: bits,
      outerSigma: outerSigma,
      outerMultitude: outerMultitude,
      outerVolume: outerVolume.toString(),
      cavityDeficit: cavityDeficit.toString(),
      etaLog2: etaLog2,
      etaApprox: etaApprox,
      octalDigits: octalDigits,
      signedDigits: signedDigits,
      label: outerMultitude + 'V·8^' + outerSigma + (cavityDeficit > 0n ? (' − ' + cavityDeficit.toString() + 'V') : '')
    };
  }

  // Unit-wall integer-cube shell & Cuban prime detector: R^3 - r^3 = (R - r)(R^2 + Rr + r^2)
  // Plus Ramanujan Taxicab 1729 / Lock-V twin shell (728 = 12^3 - 10^3 = 9^3 - 1^3) recognition.
  function cubeLatticeCheck(val) {
    var n = Math.round(Number(val));
    if (!isFinite(n) || n < 1) return { valid: false };
    var disc = 12 * n - 3;
    var s = Math.round(Math.sqrt(disc));
    var isUnitWall = (s * s === disc) && ((s - 3) % 6 === 0) && ((s - 3) >= 6);
    var r = isUnitWall ? ((s - 3) / 6) : null;
    var R = isUnitWall ? (r + 1) : null;
    var prime = (n <= 1e9) ? isPrimeInt(n) : false;
    var taxicabTwins = (n === 1729 || n === 728)
      ? {
          shellA: { R: 1, rIn: 5 / 6, volUnit: 91 / 216 },
          shellB: { R: 3 / 4, rIn: 1 / 12, volUnit: 91 / 216 },
          diffCubes: 728,
          taxicab: 1729
        }
      : null;
    return {
      valid: true,
      value: n,
      isUnitWallShell: isUnitWall,
      isPrime: prime,
      isCubanPrime: isUnitWall && prime,
      R: R,
      r: r,
      formula: isUnitWall ? (R + '^3 − ' + r + '^3 = ' + n) : null,
      taxicabTwins: taxicabTwins
    };
  }

  // RX 11 Time-Zoom Vector: t(tau) = t0 + T*tau with exact BigInt dyadic t0 = t0Num / 2^t0Shift, T = 2^zoomShift.
  // Eliminates catastrophic float32/float64 phase cancellation even for 256-bit primes!
  function modularZoomPhase(MVal, t0NumVal, t0Shift, zoomShift, tau, opts) {
    opts = opts || {};
    var M = (typeof MVal === 'bigint') ? MVal : BigInt(Math.round(Number(MVal || 0)));
    var t0Num = (typeof t0NumVal === 'bigint') ? t0NumVal : BigInt(Math.round(Number(t0NumVal || 0)));
    var shiftT0 = Math.max(0, Math.round(Number(t0Shift || 0)));
    var zShift = Math.round(Number(zoomShift || 0));
    var tauVal = clamp(Number(tau || 0), 0, 1);
    var samples = Math.max(64, Math.round(opts.samples || 3200));
    var maxObs = Math.floor(samples / 2);

    // 1. Exact modular entry phase: frac(M * t0Num / 2^shiftT0) in [0, 1)
    var entryPhase = 0;
    if (shiftT0 > 0) {
      var maskT0 = (1n << BigInt(shiftT0)) - 1n;
      var prod = M * t0Num;
      var remT0 = prod & maskT0;
      if (remT0 < 0n) remT0 += (maskT0 + 1n);
      if (shiftT0 <= 53) {
        entryPhase = Number(remT0) / Math.pow(2, shiftT0);
      } else {
        entryPhase = Number(remT0 >> BigInt(shiftT0 - 53)) / Math.pow(2, 53);
      }
    }

    // 2. Exact cycles visible in viewport: |M| * 2^zShift + strobe fractional deficit
    var absM = M < 0n ? -M : M;
    var mSign = M < 0n ? -1 : 1;
    var cyclesInView = 0;
    var strobeResidualFrac = 0;
    var cyclesLog2 = absM > 0n ? (log2BigInt(absM) + zShift) : -Infinity;

    if (absM > 0n) {
      if (zShift >= 0) {
        cyclesInView = (cyclesLog2 < 1020) ? (Number(absM) * Math.pow(2, zShift)) : Infinity;
      } else {
        var s = -zShift;
        var q = absM >> BigInt(s);
        var maskZ = (1n << BigInt(s)) - 1n;
        var rZ = absM & maskZ;
        var fracZ = (s <= 53)
          ? (Number(rZ) / Math.pow(2, s))
          : (Number(rZ >> BigInt(s - 53)) / Math.pow(2, 53));
        strobeResidualFrac = fracZ;
        var qBits = q > 0n ? q.toString(2).length : 0;
        cyclesInView = qBits < 1000 ? (Number(q) + fracZ) : Infinity;
      }
    }

    var regime = 'meso';
    if (cyclesInView > maxObs) regime = 'macro_beyond_horizon';
    else if (cyclesInView <= 4) regime = 'micro';

    var signedCycles = mSign * cyclesInView;
    var phaseAtTau = Number.isFinite(signedCycles)
      ? frac(entryPhase + signedCycles * tauVal)
      : frac(entryPhase);

    return {
      entryPhase: entryPhase,
      entryPhaseF32: Math.fround(entryPhase),
      cyclesInView: cyclesInView,
      cyclesLog2: cyclesLog2,
      strobeResidualFrac: strobeResidualFrac,
      phaseAtTau: phaseAtTau,
      phaseAtTauF32: Math.fround(phaseAtTau),
      maxObservableCycles: maxObs,
      regime: regime
    };
  }

  // Parallel Perspective Bus (docs/VESSEL-CALCULUS.md §5):
  // Sums K parallel modulated sends B(t) = sum w_j * O_j(P_j(t)) and exact linear delta dB/dt,
  // separating always-finite raw delta dB from sentinel-guarded normalized rate dB/B across nulls.
  function parallelVesselBus(sends, opts) {
    opts = opts || {};
    var epsNull = opts.epsNull != null ? opts.epsNull : 1e-9;
    var list = Array.isArray(sends) ? sends : [];
    var bx = 0, by = 0, dbx = 0, dby = 0;
    var realSum = 0;
    var allReal = true;
    var perSend = [];

    for (var i = 0; i < list.length; i++) {
      var s = list[i] || {};
      var w = s.weight != null ? Number(s.weight) : 1;
      var R = Math.max(0, Number(s.R != null ? s.R : (s.r != null ? s.r : 1)));
      var rIn = Math.max(0, Number(s.rIn != null ? s.rIn : 0));
      var dR = Number(s.dR || 0);
      var dr = Number(s.dr || 0);
      var theta = Number(s.theta || 0);
      var dTheta = Number(s.dTheta || 0);
      var op = s.op || 'P';

      var V = UNIT_SPHERE_V0 * (R * R * R - rIn * rIn * rIn);
      var dV = 4 * PI * (R * R * dR - rIn * rIn * dr);
      var c = Math.cos(theta);
      var sn = Math.sin(theta);

      // P = V * e^(i*theta), dP/dt = (dV + i*V*dTheta) * e^(i*theta) — always finite even at V = 0!
      var px = V * c;
      var py = V * sn;
      var dpx = dV * c - V * dTheta * sn;
      var dpy = dV * sn + V * dTheta * c;

      // Apply perspective operator O_j in {P, -P, conj, -conj, real (E+), imag (E-)}
      var ox = px, oy = py, dox = dpx, doy = dpy;
      if (op === '-P' || op === 'antipodal') {
        ox = -px; oy = -py; dox = -dpx; doy = -dpy;
      } else if (op === 'conj' || op === 'Pbar') {
        ox = px; oy = -py; dox = dpx; doy = -dpy;
      } else if (op === '-conj') {
        ox = -px; oy = py; dox = -dpx; doy = dpy;
      } else if (op === 'real' || op === 'E+') {
        ox = px; oy = 0; dox = dpx; doy = 0;
      } else if (op === 'imag' || op === 'E-') {
        ox = 0; oy = py; dox = 0; doy = dpy;
      }

      ox *= w; oy *= w; dox *= w; doy *= w;
      bx += ox; by += oy; dbx += dox; dby += doy;
      if (Math.abs(oy) > 1e-12) allReal = false;
      realSum += ox;

      perSend.push({ op: op, weight: w, V: V, dV: dV, re: ox, im: oy, dre: dox, dim: doy });
    }

    var magSq = bx * bx + by * by;
    var mag = Math.sqrt(magSq);
    var isBusNull = mag <= epsNull;
    var thetaBus = isBusNull ? 0 : Math.atan2(by, bx);
    var validity = 'coherent';
    var rateRe, rateIm, sentinelHex = null;

    if (isBusNull) {
      validity = 'null_crossing_pole';
      var dMag = Math.sqrt(dbx * dbx + dby * dby);
      rateRe = dMag > epsNull ? Infinity : 0;
      rateIm = 0;
      sentinelHex = dMag > epsNull ? bitInspect(Infinity).hex : bitInspect(0).hex;
    } else {
      // Complex division dB / B = (dB * conj(B)) / |B|^2
      rateRe = (dbx * bx + dby * by) / magSq;
      rateIm = (dby * bx - dbx * by) / magSq;
    }

    var invertedReal = allReal && (realSum < -epsNull);
    return {
      B: { re: bx, im: by },
      dB: { re: dbx, im: dby },
      Vbus: mag,
      thetaBus: thetaBus,
      dBOverB: { re: rateRe, im: rateIm },
      isBusNull: isBusNull,
      invertedPolarity: invertedReal,
      validity: validity,
      sentinelHex: sentinelHex,
      sends: perSend
    };
  }

  // Exact +1 unit-quantum bridge between Bitwise NOT (~P) and Two's-Complement Null (-P)
  function bitwiseNotNullBridge(val, bits) {
    var width = clamp(Math.round(Number(bits || 4)), 1, 512);
    var mod = 1n << BigInt(width);
    var mask = mod - 1n;
    var P = ((typeof val === 'bigint' ? val : BigInt(val)) % mod + mod) % mod;
    var notP = mask - P;
    var nullP = (mod - P) & mask;
    return {
      width: width,
      P: P.toString(),
      notP: notP.toString(),
      nullP: nullP.toString(),
      sumNot: (P + notP).toString(),
      sumNullMod: ((P + nullP) & mask).toString(),
      deltaNullMinusNotMod: ((nullP - notP + mod) & mask).toString(),
      saturated: (P + notP) === mask,
      exactNull: ((P + nullP) & mask) === 0n,
      unitDelta: ((nullP - notP + mod) & mask) === 1n
    };
  }

  // ---- Stage 2: Unified Guitar-Tuner Readout & Target-Aware Key-Signature Lattices ----

  // Donner-DT-2-style Vessel & Chromatic Tuner rooted in V^(2) ratio alpha = R/r,
  // Sentinel scale-frequency duality (-sigma octaves), and unit-time rate dV/V.
  function tunerReadout(state, playT, opts) {
    state = state || {};
    opts = opts || {};
    var mode = (opts.mode === 'note' || state.tunerMode === 'note') ? 'note' : 'ratio';
    var res = sphereResonance(state, playT || 0);
    var vc = vesselCalculus(state, {
      dR: opts.dR || 0,
      dr: opts.dr || 0,
      dTheta: opts.dTheta || 0
    });

    // 1. Modal Ratio mode (V^(2) ratio alpha = R/r vs CONSONANT_RATIOS)
    var ratioId = res.cavityActive ? res.syzygy.ratioText : '1:0';
    var ratioName = res.cavityActive ? res.syzygy.intervalName : 'Solid';
    var ratioCents = res.cavityActive ? res.syzygy.detuneCents : 0;
    var ratioLocked = !res.cavityActive || !!res.syzygy.locked || !!res.bowHalfPowerLock;
    var ratioNeedle = clamp(ratioCents / 50, -1, 1);
    var ratioSat = Math.abs(ratioCents) > 50;

    // 2. Chromatic Note mode (G2 = 98 Hz anchor at R=1, f=1, phase=0, sigma=0)
    // Computed directly in logarithmic MIDI space so extreme Sentinel octaves (sigma in [-24..+64]) never underflow!
    var R = Math.max(0.05, state.r != null ? state.r : 1);
    var f = Math.max(0.25, state.f != null ? state.f : 1);
    var semiShift = ((state.phaseRad || 0) / PI) * 6;
    var sigma = clamp(Math.round(state.sentinelOctave || 0), -24, 64);
    var baseHzUnit = (98.0 * f / R) * Math.pow(2, semiShift / 12);
    var midiFloat = 69 + 12 * ((Math.log(baseHzUnit / 440) / Math.LN2) - sigma);
    var midi = Math.round(midiFloat);
    var noteCents = Math.round((midiFloat - midi) * 100);
    var pc = ((midi % 12) + 12) % 12;
    var noteOct = Math.floor(midi / 12) - 1;
    var noteName = NOTE_NAMES[pc] + String(noteOct);
    var noteLocked = Math.abs(noteCents) <= 5;
    var noteNeedle = clamp(noteCents / 50, -1, 1);

    // 3. Vessel rate dV/V telemetry & bounded [-1, 1] modulation taps
    var dV = vc.dynamics.dV;
    var dVOverV = vc.dynamics.dVOverV;
    var hasMotion = Math.abs(opts.dR || 0) > 1e-7 || Math.abs(opts.dr || 0) > 1e-7;
    var rateTag = 'eq';
    if (state.lockVolume && vc.dynamics.isLockedV) {
      rateTag = 'V̇=0';
    } else if (!Number.isFinite(dVOverV)) {
      rateTag = dVOverV > 0 ? '+∞' : '−∞';
    } else if (hasMotion || Math.abs(dVOverV) > 1e-3) {
      rateTag = (dVOverV >= 0 ? '+' : '−') + Math.min(99.9, Math.abs(dVOverV)).toFixed(Math.abs(dVOverV) >= 10 ? 1 : 2);
    }

    var detuneSignal = Math.fround(clamp(ratioCents / 50, -1, 1));
    var dVSignal = Number.isFinite(dVOverV)
      ? Math.fround(Math.tanh(dVOverV))
      : Math.fround(dVOverV > 0 ? 1 : -1);

    var isNote = mode === 'note';
    var activeCents = isNote ? noteCents : ratioCents;
    return {
      mode: mode,
      identity: isNote ? noteName : ratioId,
      subLabel: isNote ? ('σ=' + (sigma >= 0 ? '+' : '−') + Math.abs(sigma)) : ratioName,
      cents: Math.fround(activeCents),
      needleNorm: Math.fround(isNote ? noteNeedle : ratioNeedle),
      saturated: isNote ? false : ratioSat,
      satDir: isNote ? 0 : (ratioSat ? (ratioCents > 0 ? 1 : -1) : 0),
      locked: isNote ? noteLocked : ratioLocked,
      ratio: {
        identity: ratioId,
        name: ratioName,
        cents: Math.fround(ratioCents),
        needleNorm: Math.fround(ratioNeedle),
        saturated: ratioSat,
        locked: ratioLocked
      },
      note: {
        identity: noteName,
        midi: midi,
        octave: noteOct,
        cents: noteCents,
        needleNorm: Math.fround(noteNeedle),
        locked: noteLocked,
        sigma: sigma
      },
      vessel: {
        V: Math.fround(vc.V),
        dV: Math.fround(dV),
        dVOverV: Number.isFinite(dVOverV) ? Math.fround(dVOverV) : dVOverV,
        isLockedV: vc.dynamics.isLockedV,
        lockVolume: !!state.lockVolume,
        rateTag: rateTag,
        boundaryState: vc.boundaryState
      },
      detuneSignal: detuneSignal,
      dVSignal: dVSignal
    };
  }

  function nearestInLattice(val, list) {
    if (!list || !list.length) return val;
    var best = list[0];
    var bestDist = Math.abs(val - best);
    for (var i = 1; i < list.length; i++) {
      var d = Math.abs(val - list[i]);
      if (d < bestDist) {
        best = list[i];
        bestDist = d;
      }
    }
    return best;
  }

  function isFiveLimitSmooth(n) {
    var x = Math.round(n);
    if (x < 1) return false;
    while (x % 2 === 0) x /= 2;
    while (x % 3 === 0) x /= 3;
    while (x % 5 === 0) x /= 5;
    return x === 1;
  }

  // Build deterministic target-aware Key-Signature lattice for Prime Key, Divisor Lattice, and Just / Modal
  function keySignatureLattice(op, targetKey, meta, state) {
    meta = meta || { min: 1, max: 8, isInt: true };
    state = state || {};
    var lo = meta.min;
    var hi = meta.max;
    var R = Math.max(0.2, state.r != null ? state.r : 1);
    var rIn = Math.max(0, state.rIn != null ? state.rIn : 0.45);
    var out = [];

    if (op === 'qPrime') {
      if (meta.isInt) {
        for (var p = Math.max(2, Math.ceil(lo)); p <= Math.floor(hi); p++) {
          if (isPrimeInt(p)) out.push(p);
        }
        return out.length ? out : [Math.round(lo)];
      }
      if (targetKey === 'f') return [0.5, 1, 2, 3, 5, 7];
      if (targetKey === 'phaseDeg') return [-150, -90, -60, -30, 0, 30, 60, 90, 150];
      if (targetKey === 'rIn') {
        var rp = [R / 7, R / 5, R / 3, R / 2, (2 * R) / 3, (3 * R) / 5, (5 * R) / 7];
        return rp.filter(function (v) { return v >= lo && v <= hi; }).sort(function (a, b) { return a - b; });
      }
      return [lo, lo + (hi - lo) * 0.25, lo + (hi - lo) * 0.5, lo + (hi - lo) * 0.75, hi];
    }

    if (op === 'qDivisor') {
      if (targetKey === 'orderN') {
        // 5-limit highly composite Tonnetz orders (divisors of 60 & 48 in [5..64])
        var tonnetz = [5, 6, 8, 10, 12, 15, 16, 20, 24, 30, 48, 60];
        return tonnetz.filter(function (v) { return v >= lo && v <= hi; });
      }
      if (meta.isInt) {
        var refN = Math.max(2, Math.round(state.orderN || 19));
        var divs = [];
        for (var d = Math.max(1, Math.ceil(lo)); d <= Math.floor(hi); d++) {
          if (refN % d === 0) divs.push(d);
        }
        if (divs.length >= 2) return divs;
        // Fallback to highly composite 60 when active Order N is prime
        var divs60 = [];
        for (var d2 = Math.max(1, Math.ceil(lo)); d2 <= Math.floor(hi); d2++) {
          if (60 % d2 === 0) divs60.push(d2);
        }
        return divs60.length ? divs60 : [1, 2, 3, 4, 6];
      }
      if (targetKey === 'rIn') {
        var ds = [12, 10, 8, 6, 5, 4, 3, 2];
        for (var di = 0; di < ds.length; di++) {
          var rv = R / ds[di];
          if (rv >= lo && rv <= hi) out.push(rv);
        }
        return out.length ? out : [0, R * 0.5];
      }
      if (targetKey === 'phaseDeg') {
        var stepN = clamp(Math.round(state.orderN || 12), 4, 24);
        var stepDeg = 360 / stepN;
        for (var k = -Math.floor(180 / stepDeg); k <= Math.floor(180 / stepDeg); k++) {
          out.push(clamp(k * stepDeg, -180, 180));
        }
        return out;
      }
      if (targetKey === 'f') return [0.5, 1, 1.5, 2, 3, 4, 6];
      return [lo, (lo + hi) * 0.5, hi];
    }

    if (op === 'qJust') {
      if (targetKey === 'rIn') {
        // Exact CONSONANT_RATIOS locks: r = R * (q / p) so Tuner needle snaps dead-center 0¢!
        for (var ci = 0; ci < CONSONANT_RATIOS.length; ci++) {
          var cr = CONSONANT_RATIOS[ci];
          if (cr.p <= cr.q) continue;
          var rCand = R * (cr.q / cr.p);
          if (rCand >= lo && rCand <= Math.min(hi, R)) out.push(rCand);
        }
        out.sort(function (a, b) { return a - b; });
        return out.length ? out : [0, R * 0.5];
      }
      if (targetKey === 'r') {
        var baseR = rIn > 0.05 ? rIn : 0.5;
        for (var cj = 0; cj < CONSONANT_RATIOS.length; cj++) {
          var cr2 = CONSONANT_RATIOS[cj];
          var candR = baseR * (cr2.p / cr2.q);
          if (candR >= lo && candR <= hi) out.push(candR);
        }
        out.sort(function (a, b) { return a - b; });
        return out.length ? out : [0.5, 1.0, 1.5, 2.0];
      }
      if (targetKey === 'phaseDeg') {
        // Pentatonic / 5-limit key on Z_12 circle (C, D, E, G, A -> 0, 60, 120, -150, -90, ...)
        return [-180, -120, -90, -30, 0, 60, 90, 150, 180];
      }
      if (targetKey === 'f') {
        return [0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8];
      }
      if (meta.isInt) {
        for (var j = Math.max(1, Math.ceil(lo)); j <= Math.floor(hi); j++) {
          if (isFiveLimitSmooth(j)) out.push(j);
        }
        return out.length ? out : [Math.round(lo)];
      }
      return [lo, lo + (hi - lo) / 3, lo + (hi - lo) * 0.5, lo + (hi - lo) * (2 / 3), hi];
    }

    return null;
  }

  function snapToKeySignature(op, targetKey, candVal, meta, state) {
    var lattice = keySignatureLattice(op, targetKey, meta, state);
    if (!lattice || !lattice.length) return candVal;
    return nearestInLattice(candVal, lattice);
  }

  // ---- Stage 3: Clockwork Multi-Cavity Coupling, Diatonic Mirror & Pollard-ρ Helical Turbine ----

  // Diatonic modes under Conjugate Twin (P̄ / Negative Harmony) involution (docs/VESSEL-CALCULUS.md §5.5)
  var DIATONIC_MODES = {
    ionian:     { name: 'Ionian',     steps: [2, 2, 1, 2, 2, 2, 1], conjugate: 'phrygian',   palindrome: false },
    dorian:     { name: 'Dorian',     steps: [2, 1, 2, 2, 2, 1, 2], conjugate: 'dorian',     palindrome: true  },
    phrygian:   { name: 'Phrygian',   steps: [1, 2, 2, 2, 1, 2, 2], conjugate: 'ionian',     palindrome: false },
    lydian:     { name: 'Lydian',     steps: [2, 2, 2, 1, 2, 2, 1], conjugate: 'locrian',    palindrome: false },
    mixolydian: { name: 'Mixolydian', steps: [2, 2, 1, 2, 2, 1, 2], conjugate: 'aeolian',    palindrome: false },
    aeolian:    { name: 'Aeolian',    steps: [2, 1, 2, 2, 1, 2, 2], conjugate: 'mixolydian', palindrome: false },
    locrian:    { name: 'Locrian',    steps: [1, 2, 2, 1, 2, 2, 2], conjugate: 'lydian',     palindrome: false }
  };

  function diatonicModeConjugate(modeKey) {
    var k = String(modeKey || 'dorian').toLowerCase();
    var m = DIATONIC_MODES[k];
    if (!m) return null;
    var rev = m.steps.slice().reverse();
    return {
      mode: k,
      name: m.name,
      steps: m.steps.slice(),
      reversedSteps: rev,
      conjugateMode: m.conjugate,
      conjugateName: DIATONIC_MODES[m.conjugate].name,
      isPalindrome: m.palindrome
    };
  }

  function twinModeToBusOp(twinMode) {
    if (twinMode === 'antipodal') return '-P';
    if (twinMode === 'conjugate') return 'conj';
    return 'P';
  }

  // Clockwork Multi-Cavity Coupling across active ChimeRack slots (A..H):
  //   - Shared LCS gcd / CRT lcm combination-lock closure across cavity Order N values
  //   - Adler injection phase-locking (dphi/dt = dw - K*sin(phi)) -> GEAR LOCK vs PHASE SLIP
  //   - Parallel Master Bus summation via Engine.parallelVesselBus + Harmonic Osmosis coherence
  function clockworkCoupling(chimes, playT, opts) {
    opts = opts || {};
    var list = Array.isArray(chimes) ? chimes : [];
    var t = Number(playT || 0);
    var couplingK = opts.couplingK != null ? Math.max(0.01, Number(opts.couplingK)) : 18.0; // cents Arnold-tongue capture half-width

    if (!list.length) {
      return {
        count: 0,
        orderGcd: 1,
        orderLcm: 1,
        lockedCount: 0,
        gearedPairs: 0,
        coherence: 1,
        regime: 'osmosis',
        bus: parallelVesselBus([]),
        cavities: []
      };
    }

    var refIdx = (opts.refIndex != null && list[opts.refIndex]) ? opts.refIndex : 0;
    var ref = list[refIdx];
    var refR = Math.max(0.05, Number(ref.r != null ? ref.r : 1));
    var refF = Math.max(0.1, Number(ref.f != null ? ref.f : 1));
    var refOmega = refF / refR;

    var orders = [];
    var sends = [];
    var sumVolMag = 0;
    var cavities = [];
    var lockedCount = 0;

    for (var i = 0; i < list.length; i++) {
      var ch = list[i] || {};
      var R = Math.max(0.05, Number(ch.r != null ? ch.r : 1));
      var rIn = clamp(Number(ch.rIn != null ? ch.rIn : 0), 0, R);
      var f = Math.max(0.1, Number(ch.f != null ? ch.f : 1));
      var ordN = Math.max(2, Math.round(Number(ch.orderN != null ? ch.orderN : 16)));
      var ph = Number(ch.phaseRad != null ? ch.phaseRad : (((ch.ph || 0) * PI) / 180));
      var tw = ch.twinMode || ch.tw || 'both';
      var busOp = twinModeToBusOp(tw);

      orders.push(ordN);

      // Relative frequency ratio vs reference cavity (octave-folded into [1, 2) for harmonic gear check)
      var omega = f / R;
      var rawRatio = omega / Math.max(1e-6, refOmega);
      var folded = rawRatio;
      while (folded >= 2.0) folded *= 0.5;
      while (folded < 1.0) folded *= 2.0;
      var nearest = nearestHarmonicRatio(folded);
      var detuneCents = (i === refIdx) ? 0 : nearest.detuneCents;

      // Adler's Equation (Arnold Tongue): |dw| <= K => gear tooth clicks into lock (dphi/dt = 0)
      var absCents = Math.abs(detuneCents);
      var gearLocked = (i === refIdx) || (absCents <= couplingK);
      if (gearLocked) lockedCount++;
      var slipRate = gearLocked ? 0 : Math.sqrt(Math.max(0, absCents * absCents - couplingK * couplingK));
      var osmosis = clamp(Math.exp(-Math.pow(absCents / Math.max(1, couplingK * 2), 2)), 0, 1);

      var V = UNIT_SPHERE_V0 * (R * R * R - rIn * rIn * rIn);
      sumVolMag += Math.abs(V);

      var theta = TAU * f * t + ph;
      sends.push({
        R: R,
        rIn: rIn,
        dR: Number(ch.dR || 0),
        dr: Number(ch.dr || 0),
        theta: theta,
        dTheta: TAU * f,
        weight: 1,
        op: busOp
      });

      cavities.push({
        key: ch.key || String.fromCharCode(65 + i),
        orderN: ordN,
        busOp: busOp,
        twinMode: tw,
        V: Math.fround(V),
        ratioText: (i === refIdx) ? '1:1' : nearest.ratioText,
        detuneCents: Math.fround(detuneCents),
        gearLocked: gearLocked,
        state: gearLocked ? 'gear_lock' : 'phase_slip',
        slipRate: Math.fround(slipRate),
        osmosis: Math.fround(osmosis)
      });
    }

    var orderGcd = orders[0];
    var orderLcm = orders[0];
    for (var j = 1; j < orders.length; j++) {
      orderGcd = gcd(orderGcd, orders[j]);
      orderLcm = lcm(orderLcm, orders[j]);
    }
    var gearedPairs = 0;
    for (var a = 0; a < orders.length; a++) {
      for (var b = a + 1; b < orders.length; b++) {
        if (gcd(orders[a], orders[b]) > 1) gearedPairs++;
      }
    }

    var bus = parallelVesselBus(sends);
    var coherence = sumVolMag > 1e-9 ? clamp(bus.Vbus / sumVolMag, 0, 1) : 1;
    var regime = bus.isBusNull
      ? 'bus_null'
      : (coherence >= 0.72 && lockedCount === list.length ? 'osmosis' : (coherence < 0.35 ? 'wavefold' : 'coupled'));

    return {
      count: list.length,
      orderGcd: orderGcd,
      orderLcm: orderLcm,
      lockedCount: lockedCount,
      gearedPairs: gearedPairs,
      coherence: Math.fround(coherence),
      sumVolMag: Math.fround(sumVolMag),
      regime: regime,
      bus: bus,
      cavities: cavities
    };
  }

  // 1x/2x Pollard-rho Cycle-Lock Detector & Helical Turbine Rotation on Auto z(t):
  //   - Continuous tortoise (1x) vs hare (2x): sin(4*pi*t) === sin(2*pi*t) locks at 0, 1/6, 1/2, 5/6 (60° hexagonal poles!)
  //   - Discrete Order-N ring: tortoise step x_1 vs hare step x_2 detects cycle collisions & composite factors gcd(|x2-x1|, N) > 1
  function pollardRhoSlice(state, playT) {
    state = state || {};
    var t = frac(Number(playT || 0));
    var N = clamp(Math.round(state.orderN != null ? state.orderN : 19), 3, 96);
    var R = Math.max(0.05, Number(state.r != null ? state.r : 1));
    var rIn = clamp(Number(state.rIn != null ? state.rIn : 0), 0, R);
    var alpha = rIn > 0.005 ? (R / rIn) : 1;

    var zTortoise = Math.sin(TAU * t);
    var zHare = Math.sin(TAU * 2 * t);
    var continuousGap = Math.abs(zHare - zTortoise);
    var continuousLock = continuousGap <= 0.085;

    var step1 = Math.floor(t * N) % N;
    var step2 = Math.floor(((t * 2) % 1) * N) % N;
    var diffStep = Math.abs(step2 - step1);
    var discreteCollision = (diffStep === 0);
    var factorHit = (diffStep > 0 && diffStep < N) ? gcd(diffStep, N) : 1;
    var hasCompositeFactor = factorHit > 1 && factorHit < N;

    // Helical turbine twist angle (rotates smoothly with axial scan z(t) and playhead t)
    var zActive = (state.archimedesAuto !== false)
      ? zTortoise
      : clamp(Number(state.archimedesZNorm || 0), -1, 1);
    var twistTurns = clamp(alpha * 0.5, 0.5, 4.0);
    var helixAngleRad = TAU * (t + 0.5 * twistTurns * zActive);

    return {
      t: Math.fround(t),
      N: N,
      zTortoise: Math.fround(zTortoise),
      zHare: Math.fround(zHare),
      continuousGap: Math.fround(continuousGap),
      continuousLock: continuousLock,
      stepTortoise: step1,
      stepHare: step2,
      discreteCollision: discreteCollision,
      factorHit: factorHit,
      hasCompositeFactor: hasCompositeFactor,
      locked: continuousLock || discreteCollision,
      helixAngleRad: Math.fround(helixAngleRad)
    };
  }

  // ---- Stage 4: 2D Slice Dimensional Descent, Cross-Chime Differential & Viscoelastic Eikonal Tank ----

  // Exact 2D Annular Slice Seed A(R, r) = pi*(R^2 - r^2) = (1/4)*(dR + dr)V (1st directional derivative of 3D seed)
  function sliceCalculus2D(state, opts) {
    state = state || {};
    opts = opts || {};
    var R = Math.max(0, Number(state.r != null ? state.r : 1));
    var rIn = Math.max(0, Number(state.rIn != null ? state.rIn : 0));
    var dR = Number(opts.dR || 0);
    var dr = Number(opts.dr || 0);
    var eps = opts.epsBoundary != null ? opts.epsBoundary : 1e-6;

    var A = PI * (R * R - rIn * rIn);
    var eta = R > eps ? (rIn / R) : 0;
    var eta2 = eta * eta;
    var areaFrac = 1 - eta2;

    // 1st spatial derivatives: dA/dR = 2*pi*R, dA/dr = -2*pi*r (exact great circles!)
    var d1R = TAU * R;
    var d1r = -TAU * rIn;
    // 2nd spatial derivatives: exact +-2*pi (+-TAU) antipodal null!
    var d2R = TAU;
    var d2r = -TAU;

    var dA = d1R * dR + d1r * dr;
    var dEta = R > eps ? ((dr - eta * dR) / R) : 0;
    var scaleRate = R > eps ? (2 * (dR / R)) : 0;
    var boundaryState = (R <= eps) ? 'degenerate_R0'
      : (rIn > R ? 'inverted_polarity'
        : (eta <= eps ? 'solid_disc'
          : (Math.abs(areaFrac) <= eps ? 'thin_ring_sentinel' : 'normal')));

    var sensitivity, shapeRate, dAOverA;
    if (boundaryState === 'solid_disc') {
      sensitivity = 0;
      shapeRate = 0;
      dAOverA = scaleRate;
    } else if (boundaryState === 'thin_ring_sentinel' || Math.abs(A) <= 1e-12) {
      sensitivity = Infinity;
      shapeRate = dEta === 0 ? 0 : (dEta > 0 ? -Infinity : Infinity);
      dAOverA = dA === 0 ? 0 : (dA > 0 ? Infinity : -Infinity);
    } else {
      sensitivity = (2 * eta) / areaFrac;
      shapeRate = -sensitivity * dEta;
      dAOverA = scaleRate + shapeRate;
    }

    return {
      R: R,
      rIn: rIn,
      eta: eta,
      areaFrac: areaFrac,
      A: A,
      boundaryState: boundaryState,
      d1: { dR: d1R, dr: d1r, jacobian2D: eta },
      d2: { dR2: d2R, dr2: d2r, antipodalSum: d2R + d2r },
      d3: 0,
      dynamics: {
        dA: dA,
        dEta: dEta,
        scaleRate: scaleRate,
        sensitivity: sensitivity,
        shapeRate: shapeRate,
        dAOverA: dAOverA,
        isLockedA: Math.abs(dA) <= 1e-9
      }
    };
  }

  // Cavalieri / Radon vertical integral of 2D Archimedes slices A_ring(z) over [-R, +R] -> recovers exact 3D V!
  function cavalieriVolume(R, rIn, steps) {
    var outer = Math.max(0, Number(R || 0));
    var inner = clamp(Number(rIn || 0), 0, outer);
    var N = Math.max(16, Math.round(steps || 256));
    if (N % 2 === 1) N++;
    var dz = (2 * outer) / N;
    var sum = 0;
    for (var i = 0; i <= N; i++) {
      var z = -outer + i * dz;
      var aO = PI * Math.max(0, outer * outer - z * z);
      var aI = (Math.abs(z) <= inner) ? (PI * Math.max(0, inner * inner - z * z)) : 0;
      var w = (i === 0 || i === N) ? 1 : (i % 2 === 1 ? 4 : 2);
      sum += w * (aO - aI);
    }
    var integral = (dz / 3) * sum;
    var exactV = UNIT_SPHERE_V0 * (outer * outer * outer - inner * inner * inner);
    return {
      integral: integral,
      exactV: exactV,
      relError: exactV > 1e-12 ? Math.abs(integral - exactV) / exactV : Math.abs(integral)
    };
  }

  // Cross-Chime 2D Slice Differential (A ⊖ B): differentiates Chime A (Front XY) against Chime B (Top XZ slice)
  // Produces Osmosis Sum (A+B), Antipodal Null Propagation Delta (A-B + dBFS), and Conjugate Cross-Phase (A*conj(B))
  function crossChimeSlice(stateA, stateB, playT, opts) {
    opts = opts || {};
    var bins = clamp(Math.round(opts.bins || 128), 16, 512);
    var tShift = Number(playT || 0);
    var sA = sample(stateA, bins);
    var sB = sample(stateB, bins);
    var ptsA = sA.points;
    var ptsB = sB.points;
    var len = bins + 1;

    var profA = new Float32Array(len);
    var profB = new Float32Array(len);
    var sumArr = new Float32Array(len);
    var diffArr = new Float32Array(len);
    var conjRe = new Float32Array(len);
    var conjIm = new Float32Array(len);

    var sqA = 0, sqB = 0, sqDiff = 0, dotRe = 0, normASq = 0, normBSq = 0;
    var peakDiff = 0, peakAbsDiff = -1;
    var shiftIdx = Math.round(frac(tShift) * bins);

    for (var i = 0; i < len; i++) {
      var idx = (i + shiftIdx) % bins;
      var pA = ptsA[idx];
      var pB = ptsB[idx];
      var ax = (pA && pA.valid) ? pA.x : 0;
      var ay = (pA && pA.valid) ? pA.y : 0;
      var bx = (pB && pB.valid) ? pB.x : 0;
      var by = (pB && pB.valid) ? pB.y : 0;

      var sVal = Math.fround(0.5 * (ay + by));
      var dVal = Math.fround(ay - by);
      var cRe = Math.fround(ax * bx + ay * by);
      var cIm = Math.fround(ay * bx - ax * by);

      profA[i] = Math.fround(ay);
      profB[i] = Math.fround(by);
      sumArr[i] = sVal;
      diffArr[i] = dVal;
      conjRe[i] = cRe;
      conjIm[i] = cIm;

      sqA += ay * ay;
      sqB += by * by;
      sqDiff += dVal * dVal;
      dotRe += cRe;
      normASq += ax * ax + ay * ay;
      normBSq += bx * bx + by * by;

      var ad = Math.abs(dVal);
      if (ad > peakAbsDiff) { peakAbsDiff = ad; peakDiff = dVal; }
    }

    var rmsA = Math.sqrt(sqA / len);
    var rmsB = Math.sqrt(sqB / len);
    var rmsDiff = Math.sqrt(sqDiff / len);
    var refRms = Math.max(rmsA, rmsB, 1e-9);
    var nullDb = rmsDiff <= 1e-9 ? -Infinity : (20 * Math.log10(rmsDiff / refRms));
    var denom = Math.sqrt(normASq * normBSq);
    var crossCoherence = denom > 1e-12 ? clamp(dotRe / denom, -1, 1) : 0;

    return {
      bins: len,
      profA: profA,
      profB: profB,
      sum: sumArr,
      diff: diffArr,
      conjRe: conjRe,
      conjIm: conjIm,
      rmsA: Math.fround(rmsA),
      rmsB: Math.fround(rmsB),
      rmsDiff: Math.fround(rmsDiff),
      nullDb: Number.isFinite(nullDb) ? Math.fround(nullDb) : -Infinity,
      isExactNull: rmsDiff <= 1e-9,
      crossCoherence: Math.fround(crossCoherence),
      peakResidual: peakDiff,
      peakResidualBits: bitInspect(peakDiff)
    };
  }

  // Stage 4: CFL-Stable 2D Viscoelastic Eikonal Wave-Tank Solver inside Circular Vessel (rho <= 1)
  // Two-medium refractive wave speed: c_in / c_out = alpha = R/r across cavity ring rho = eta = r/R,
  // viscoelastic shear damping gamma(eta), and Osmosis (open absorbing) vs Wavefold (reflective nonlinear) rim.
  function createViscoelasticTank(opts) {
    opts = opts || {};
    var N = clamp(Math.round(opts.size || 64), 24, 128);
    var total = N * N;
    var u = new Float32Array(total);
    var uPrev = new Float32Array(total);
    var uNext = new Float32Array(total);
    var vel = new Float32Array(total);
    var rhoMap = new Float32Array(total);
    var insideMask = new Uint8Array(total);
    var stepCount = 0;

    for (var j = 0; j < N; j++) {
      var nz = (j / (N - 1)) * 2 - 1;
      for (var i = 0; i < N; i++) {
        var nx = (i / (N - 1)) * 2 - 1;
        var rho = Math.sqrt(nx * nx + nz * nz);
        var idx = j * N + i;
        rhoMap[idx] = rho;
        insideMask[idx] = rho <= 1.0 ? 1 : 0;
      }
    }

    function reset() {
      u.fill(0);
      uPrev.fill(0);
      uNext.fill(0);
      vel.fill(0);
      stepCount = 0;
    }

    function injectPulse(nx, nz, amp, rad) {
      var cx = clamp(Number(nx || 0), -0.95, 0.95);
      var cz = clamp(Number(nz || 0), -0.95, 0.95);
      var a = clamp(Number(amp != null ? amp : 0.9), -2.5, 2.5);
      var r2 = Math.pow(Math.max(0.03, Number(rad || 0.09)), 2);
      for (var j = 1; j < N - 1; j++) {
        var pz = (j / (N - 1)) * 2 - 1;
        var dz = pz - cz;
        for (var i = 1; i < N - 1; i++) {
          var idx = j * N + i;
          if (!insideMask[idx]) continue;
          var px = (i / (N - 1)) * 2 - 1;
          var dx = px - cx;
          var d2 = dx * dx + dz * dz;
          if (d2 < r2 * 9) {
            var g = a * Math.exp(-d2 / (2 * r2));
            u[idx] = Math.fround(clamp(u[idx] + g, -3, 3));
            uPrev[idx] = Math.fround(clamp(uPrev[idx] + g, -3, 3));
          }
        }
      }
    }

    function step(cfg) {
      cfg = cfg || {};
      var eta = clamp(Number(cfg.eta != null ? cfg.eta : 0.5), 0, 0.95);
      var alpha = eta > 0.01 ? clamp(1 / eta, 1.0, 3.2) : 1.0;
      var refractive = cfg.refractive !== false;
      var boundary = cfg.boundary === 'wavefold' ? 'wavefold' : 'osmosis';
      var baseVisc = clamp(Number(cfg.viscosity != null ? cfg.viscosity : 0.028), 0, 0.35);

      // Unconditionally CFL-stable two-medium wave speeds (c_max = 0.48 < 1/sqrt(2) = 0.7071)
      var cMax = 0.48;
      var cIn2 = refractive ? (cMax * cMax) : (0.36 * 0.36);
      var cOut = refractive ? (cMax / alpha) : 0.36;
      var cOut2 = cOut * cOut;

      // Optional continuous line/helix source injection along Front (z=0) or rotated Helix chord
      var driveLine = cfg.driveLine;
      var driveGain = clamp(Number(cfg.driveGain != null ? cfg.driveGain : 0.14), 0, 0.6);
      var helixAng = Number(cfg.helixAngle || 0);
      var hasDrive = !!(driveLine && driveLine.length >= 4 && driveGain > 0);
      var midRow = Math.floor(N * 0.5);

      if (hasDrive) {
        var ca = Math.cos(helixAng), sa = Math.sin(helixAng);
        var dLen = driveLine.length;
        for (var s = 0; s < N; s++) {
          var su = (s / (N - 1)) * 2 - 1; // -1..+1 along chord
          var gx = Math.round(((su * ca * 0.92 + 1) * 0.5) * (N - 1));
          var gz = Math.round(((su * sa * 0.92 + 1) * 0.5) * (N - 1));
          if (gx > 0 && gx < N - 1 && gz > 0 && gz < N - 1) {
            var dIdx = gz * N + gx;
            if (insideMask[dIdx]) {
              var srcIdx = Math.min(dLen - 1, Math.floor((s / (N - 1)) * (dLen - 1)));
              var dVal = driveLine[srcIdx] || 0;
              u[dIdx] = Math.fround(u[dIdx] * (1 - driveGain) + clamp(dVal, -1.5, 1.5) * driveGain);
            }
          }
        }
      }

      for (var j = 1; j < N - 1; j++) {
        var rowOff = j * N;
        for (var i = 1; i < N - 1; i++) {
          var idx = rowOff + i;
          if (!insideMask[idx]) {
            uNext[idx] = 0;
            vel[idx] = 0;
            continue;
          }
          var rho = rhoMap[idx];
          var inCav = eta > 0.01 && rho <= eta;
          var c2 = inCav ? cIn2 : cOut2;

          // Self-adjoint divergence form div(c^2 grad u) across the refractive cavity interface rho = eta,
          // with Neumann zero-flux mirror for Wavefold and Dirichlet zero for Osmosis rim.
          var uC = u[idx];
          var iL = idx - 1, iR = idx + 1, iD = idx - N, iU = idx + N;
          var c2L = (eta > 0.01 && rhoMap[iL] <= eta) ? cIn2 : cOut2;
          var c2R = (eta > 0.01 && rhoMap[iR] <= eta) ? cIn2 : cOut2;
          var c2D = (eta > 0.01 && rhoMap[iD] <= eta) ? cIn2 : cOut2;
          var c2U = (eta > 0.01 && rhoMap[iU] <= eta) ? cIn2 : cOut2;
          var fluxL = insideMask[iL] ? (0.5 * (c2 + c2L) * (u[iL] - uC)) : (boundary === 'wavefold' ? 0 : (-c2 * uC));
          var fluxR = insideMask[iR] ? (0.5 * (c2 + c2R) * (u[iR] - uC)) : (boundary === 'wavefold' ? 0 : (-c2 * uC));
          var fluxD = insideMask[iD] ? (0.5 * (c2 + c2D) * (u[iD] - uC)) : (boundary === 'wavefold' ? 0 : (-c2 * uC));
          var fluxU = insideMask[iU] ? (0.5 * (c2 + c2U) * (u[iU] - uC)) : (boundary === 'wavefold' ? 0 : (-c2 * uC));
          var divGrad = fluxL + fluxR + fluxD + fluxU;

          // Viscoelastic shear damping: increases in thin shell walls and in absorbing Osmosis sponge rim
          var shellShear = inCav ? 0.55 : (1.0 + 0.85 * eta * eta);
          var rimSponge = (boundary === 'osmosis' && rho > 0.84)
            ? (0.28 * Math.pow((rho - 0.84) / 0.16, 2))
            : 0;
          var damp = clamp(baseVisc * shellShear + rimSponge, 0, 0.45);

          var nextVal = (2 * uC - (1 - damp) * uPrev[idx] + divGrad) / (1 + damp);

          // Strictly passive C1-smooth sine wavefolding in Wavefold regime (|f(x)| <= |x| everywhere)
          if (boundary === 'wavefold' && Math.abs(nextVal) > 0.85) {
            var foldT = 0.85;
            var foldW = 0.40;
            var sgn = nextVal >= 0 ? 1 : -1;
            var exc = Math.abs(nextVal) - foldT;
            nextVal = sgn * (foldT + foldW * Math.sin(exc / foldW));
          } else {
            nextVal = clamp(nextVal, -2.5, 2.5);
          }

          uNext[idx] = Math.fround(nextVal);
          vel[idx] = Math.fround(nextVal - uC);
        }
      }

      // Rotate buffers cleanly with zero per-frame allocations
      var tmp = uPrev;
      uPrev = u;
      u = uNext;
      uNext = tmp;
      stepCount++;

      return { step: stepCount, midRow: midRow };
    }

    function centerSlice() {
      var mid = Math.floor(N * 0.5);
      var off = mid * N;
      var disp = new Float32Array(N);
      var delta = new Float32Array(N);
      for (var i = 0; i < N; i++) {
        disp[i] = u[off + i];
        delta[i] = vel[off + i];
      }
      return { size: N, disp: disp, delta: delta };
    }

    function metrics(etaVal) {
      var eta = clamp(Number(etaVal != null ? etaVal : 0.5), 0, 0.95);
      var eCav = 0, eShell = 0, velSq = 0, count = 0, peak = 0;
      for (var idx = 0; idx < total; idx++) {
        if (!insideMask[idx]) continue;
        var val = u[idx];
        var av = Math.abs(val);
        if (av > peak) peak = av;
        var e = val * val + vel[idx] * vel[idx];
        if (eta > 0.01 && rhoMap[idx] <= eta) eCav += e;
        else eShell += e;
        velSq += vel[idx] * vel[idx];
        count++;
      }
      var eTot = eCav + eShell;
      return {
        steps: stepCount,
        energyTotal: Math.fround(eTot),
        energyCavity: Math.fround(eCav),
        energyShell: Math.fround(eShell),
        transmissionRatio: Math.fround(eTot > 1e-12 ? (eShell / eTot) : 0),
        velRms: Math.fround(count > 0 ? Math.sqrt(velSq / count) : 0),
        peakAbs: Math.fround(peak)
      };
    }

    return {
      size: N,
      getField: function () { return u; },
      getVelocity: function () { return vel; },
      getMask: function () { return insideMask; },
      getRho: function () { return rhoMap; },
      reset: reset,
      injectPulse: injectPulse,
      step: step,
      centerSlice: centerSlice,
      metrics: metrics
    };
  }

  // Stage 5B: Project a live 2D Viscoelastic Eikonal Tank directly onto the 3D Cutaway Floor schema
  // consumed by Scene3D.updateFloorWt() and FloorView.update().
  function projectTankToFloorField(tank, state, playT, opts) {
    state = state || {};
    opts = opts || {};
    var slices = clamp(Math.round(opts.slices || 28), 8, 48);
    var bins = clamp(Math.round(opts.bins || 72), 24, 128);
    var R = Math.max(0.1, Number(state.r != null ? state.r : 1));
    var rIn = clamp(Number(state.rIn != null ? state.rIn : 0), 0, R * 0.99);
    var eta = rIn / R;
    var alpha = eta > 0.01 ? (R / rIn) : 1;
    var size = clamp(Number(opts.size != null ? opts.size : (state.floorSize != null ? state.floorSize : 0.94)), 0.45, 1.0);
    var depth = clamp(Number(opts.depth != null ? opts.depth : (state.floorDepth != null ? state.floorDepth : 0.68)), 0.15, 1.25);
    var smooth = clamp(Number(opts.smooth != null ? opts.smooth : (state.floorSmooth != null ? state.floorSmooth : 0.52)), 0, 1);
    var rEff = R * size;
    var zSpan = rEff * 0.94;
    var boundary = (opts.boundary || state.tankBoundary) === 'wavefold' ? 'wavefold' : 'osmosis';
    var refractive = (opts.refractive != null ? opts.refractive : (state.tankRefractive !== false));
    var viscosity = opts.viscosity != null ? Number(opts.viscosity) : (0.004 + smooth * 0.11);
    var driveGain = opts.driveGain != null ? Number(opts.driveGain) : 0.16;

    // Derive continuous chord drive from Collapse/BitWave, Ghost Cross-Chime Diff (A-B), or active trajectory
    var driveLine = opts.driveLine;
    var sourceTag = 'EIKONAL TANK';
    if (!driveLine) {
      driveLine = new Float32Array(64);
      var f = (state.f != null) ? state.f : 1;
      var ph = state.phaseRad || 0;
      var shift = frac(Number(playT || 0));
      var cp = state._lastCollapseProfile;
      var pts = state.points;
      var gPts = (state.toggles && state.toggles.ghostRef) ? state.ghostPoints : null;

      if (cp && cp.attracted && cp.attracted.length >= 16) {
        sourceTag = 'TANK · BITWAVE';
        for (var d0 = 0; d0 < 64; d0++) {
          var ci = Math.floor(((d0 / 64 + shift) % 1) * cp.attracted.length);
          driveLine[d0] = Math.fround(cp.attracted[ci]);
        }
      } else if (gPts && gPts.length >= 16 && pts && pts.length >= 16) {
        sourceTag = 'TANK · A−B DIFF';
        for (var d1 = 0; d1 < 64; d1++) {
          var u1 = (d1 / 64 + shift) % 1;
          var pA = pts[Math.floor(u1 * pts.length)];
          var pB = gPts[Math.floor(u1 * gPts.length)];
          var yA = (pA && pA.valid) ? (pA.y / R) : 0;
          var yB = (pB && pB.valid) ? (pB.y / R) : 0;
          driveLine[d1] = Math.fround(clamp(yA - yB, -1.5, 1.5));
        }
      } else if (pts && pts.length >= 16) {
        for (var d2 = 0; d2 < 64; d2++) {
          var p0 = pts[Math.floor(((d2 / 64 + shift) % 1) * pts.length)];
          driveLine[d2] = Math.fround((p0 && p0.valid) ? clamp(p0.y / R, -1.5, 1.5) : 0);
        }
      } else {
        for (var d3 = 0; d3 < 64; d3++) {
          driveLine[d3] = Math.fround(Math.sin(TAU * (f * (d3 / 63) + shift) + ph));
        }
      }
    }

    var helixAngle = opts.helixAngle != null
      ? Number(opts.helixAngle)
      : (state.helicalTurbine ? (TAU * frac(Number(playT || 0))) : 0);

    if (tank && opts.step !== false) {
      tank.step({
        eta: eta,
        refractive: refractive,
        boundary: boundary,
        viscosity: viscosity,
        driveLine: driveLine,
        driveGain: driveGain,
        helixAngle: helixAngle
      });
    }

    var gridN = tank ? tank.size : 48;
    var uField = tank ? tank.getField() : new Float32Array(gridN * gridN);
    var vField = tank ? tank.getVelocity() : new Float32Array(gridN * gridN);

    function sampleGrid(arr, nx, nz) {
      var gx = clamp((nx + 1) * 0.5 * (gridN - 1), 0, gridN - 1.001);
      var gz = clamp((nz + 1) * 0.5 * (gridN - 1), 0, gridN - 1.001);
      var i0 = Math.floor(gx), j0 = Math.floor(gz);
      var fx = gx - i0, fz = gz - j0;
      var o00 = j0 * gridN + i0;
      var a = arr[o00] * (1 - fx) + arr[o00 + 1] * fx;
      var b = arr[o00 + gridN] * (1 - fx) + arr[o00 + gridN + 1] * fx;
      return a * (1 - fz) + b * fz;
    }

    var rows = new Array(slices);
    var velRows = new Array(slices);
    var rowZ = new Float32Array(slices);
    var rowHalfW = new Float32Array(slices);
    var rowInCavity = new Uint8Array(slices);
    var activeSlice = new Float32Array(bins);
    var activeVel = new Float32Array(bins);
    var eqCenter = new Float32Array(bins);
    var tiltLine = new Float32Array(bins);

    for (var s = 0; s < slices; s++) {
      var vz = slices > 1 ? ((s / (slices - 1)) * 2 - 1) : 0;
      var z = vz * zSpan;
      var halfW = Math.sqrt(Math.max(0.01, rEff * rEff - z * z));
      rowZ[s] = Math.fround(z);
      rowHalfW[s] = Math.fround(halfW);
      rowInCavity[s] = (rIn > 0.01 && Math.abs(z) <= rIn) ? 1 : 0;

      var rRow = new Float32Array(bins);
      var vRow = new Float32Array(bins);
      var nz = z / Math.max(1e-4, rEff);
      for (var b = 0; b < bins; b++) {
        var ux = bins > 1 ? ((b / (bins - 1)) * 2 - 1) : 0;
        var nx = (ux * halfW) / Math.max(1e-4, rEff);
        rRow[b] = Math.fround(sampleGrid(uField, nx, nz) * depth);
        vRow[b] = Math.fround(sampleGrid(vField, nx, nz) * depth);
      }
      rows[s] = rRow;
      velRows[s] = vRow;
    }

    var peakBin = 0, peakAbs = -1;
    for (var ab = 0; ab < bins; ab++) {
      var ux0 = bins > 1 ? ((ab / (bins - 1)) * 2 - 1) : 0;
      var val0 = sampleGrid(uField, ux0, 0) * depth;
      var vel0 = sampleGrid(vField, ux0, 0) * depth;
      activeSlice[ab] = Math.fround(val0);
      activeVel[ab] = Math.fround(vel0);
      eqCenter[ab] = Math.fround(clamp(Math.abs(vel0) * 3.5, 0, 1));
      tiltLine[ab] = Math.fround(clamp(Math.abs(val0), 0, 1));
      if (Math.abs(val0) > peakAbs) { peakAbs = Math.abs(val0); peakBin = ab; }
    }

    var res = sphereResonance(state, playT);
    var slice2d = sliceCalculus2D(state);
    var tankMetrics = tank ? tank.metrics(eta) : { steps: 0, energyTotal: 0, energyCavity: 0, energyShell: 0, transmissionRatio: 0, velRms: 0, peakAbs: 0 };
    var bpm = clamp(opts.bpm || state.floorBpm || 120, 40, 240);
    var windowBeats = clamp(opts.windowBeats || state.floorBeats || 4, 0.25, 16);
    var windowSec = state.floorZoomLog != null ? floorZoomSec(state.floorZoomLog) : ((60 * windowBeats) / bpm);
    var peakFreqHz = 98.0 * Math.max(0.5, state.f || 1);

    return {
      mode: 'tank',
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
      activeZNorm: 0,
      activeZ: 0,
      rows: rows,
      velRows: velRows,
      rowZ: rowZ,
      rowHalfW: rowHalfW,
      rowInCavity: rowInCavity,
      activeSlice: activeSlice,
      activeVel: activeVel,
      eqCenter: eqCenter,
      tiltLine: tiltLine,
      peakBin: peakBin,
      pitch: freqToNoteCents(peakFreqHz),
      syzygy: res.syzygy,
      bpm: bpm,
      windowBeats: windowBeats,
      windowSec: Math.fround(windowSec),
      cavityWindowSec: Math.fround(windowSec * eta),
      floorVelocity: Math.fround((2 * R) / Math.max(1e-4, windowSec)),
      dynamics: null,
      hasLookahead: false,
      sourceLabel: sourceTag,
      bitwave: null,
      tankBoundary: boundary,
      tankRefractive: refractive,
      tankViscosity: Math.fround(viscosity),
      tankHelixAngle: Math.fround(helixAngle),
      tankMetrics: tankMetrics,
      slice2d: slice2d,
      tankSize: gridN,
      tankGrid: uField,
      tankVelGrid: vField,
      tankMask: tank ? tank.getMask() : null,
      tankRho: tank ? tank.getRho() : null
    };
  }

  // ---- Stage 4b-1: Real Spherical Harmonics Y_l^m (l = 0..4, 25 Orthonormal Bands),
  //      Hollow-Shell Multipole Transfer (T_l = eta^l) & Graph Laplacian Conductive Wireframe ----

  var SH_BAND_META = [
    { idx: 0,  l: 0, m:  0, label: 'Y0,0',  family: 'Monopole (V)' },
    { idx: 1,  l: 1, m: -1, label: 'Y1,-1', family: 'Dipole Z' },
    { idx: 2,  l: 1, m:  0, label: 'Y1,0',  family: 'Dipole Y (1111/0000)' },
    { idx: 3,  l: 1, m:  1, label: 'Y1,+1', family: 'Dipole X (1000/0001)' },
    { idx: 4,  l: 2, m: -2, label: 'Y2,-2', family: 'Quadrupole XZ' },
    { idx: 5,  l: 2, m: -1, label: 'Y2,-1', family: 'Quadrupole YZ' },
    { idx: 6,  l: 2, m:  0, label: 'Y2,0',  family: 'Quadrupole Zonal (Lock-V)' },
    { idx: 7,  l: 2, m:  1, label: 'Y2,+1', family: 'Quadrupole XY' },
    { idx: 8,  l: 2, m:  2, label: 'Y2,+2', family: 'Quadrupole X²−Z²' },
    { idx: 9,  l: 3, m: -3, label: 'Y3,-3', family: 'Octupole 3-Fold Z' },
    { idx: 10, l: 3, m: -2, label: 'Y3,-2', family: 'Quadray Tetrahedron (xyz)' },
    { idx: 11, l: 3, m: -1, label: 'Y3,-1', family: 'Octupole Polar Z' },
    { idx: 12, l: 3, m:  0, label: 'Y3,0',  family: 'Octupole Zonal Y' },
    { idx: 13, l: 3, m:  1, label: 'Y3,+1', family: 'Octupole Polar X' },
    { idx: 14, l: 3, m:  2, label: 'Y3,+2', family: 'Octupole Saddle' },
    { idx: 15, l: 3, m:  3, label: 'Y3,+3', family: 'Octupole 3-Fold X' },
    { idx: 16, l: 4, m: -4, label: 'Y4,-4', family: 'Octal Bloom (4-Fold Sin)' },
    { idx: 17, l: 4, m: -3, label: 'Y4,-3', family: 'Hexadecapole Z3' },
    { idx: 18, l: 4, m: -2, label: 'Y4,-2', family: 'Hexadecapole XZ' },
    { idx: 19, l: 4, m: -1, label: 'Y4,-1', family: 'Hexadecapole YZ' },
    { idx: 20, l: 4, m:  0, label: 'Y4,0',  family: 'Hexadecapole Zonal Y' },
    { idx: 21, l: 4, m:  1, label: 'Y4,+1', family: 'Hexadecapole XY' },
    { idx: 22, l: 4, m:  2, label: 'Y4,+2', family: 'Hexadecapole X²−Z²' },
    { idx: 23, l: 4, m:  3, label: 'Y4,+3', family: 'Hexadecapole X3' },
    { idx: 24, l: 4, m:  4, label: 'Y4,+4', family: 'Octal Bloom (4-Fold Cos)' }
  ];

  // Exact orthonormal normalization constants for real Y_l^m (integral over S^2 of Y^2 dOmega === 1)
  var SH_C00 = 0.5 * Math.sqrt(1 / PI);
  var SH_C1  = 0.5 * Math.sqrt(3 / PI);
  var SH_C2A = 0.5 * Math.sqrt(15 / PI);
  var SH_C20 = 0.25 * Math.sqrt(5 / PI);
  var SH_C22 = 0.25 * Math.sqrt(15 / PI);
  var SH_C33 = 0.25 * Math.sqrt(35 / (2 * PI));
  var SH_C32N = 0.5 * Math.sqrt(105 / PI);
  var SH_C31 = 0.25 * Math.sqrt(21 / (2 * PI));
  var SH_C30 = 0.25 * Math.sqrt(7 / PI);
  var SH_C32P = 0.25 * Math.sqrt(105 / PI);
  var SH_C44N = 0.75 * Math.sqrt(35 / PI);
  var SH_C43 = 0.75 * Math.sqrt(35 / (2 * PI));
  var SH_C42N = 0.75 * Math.sqrt(5 / PI);
  var SH_C41 = 0.75 * Math.sqrt(5 / (2 * PI));
  var SH_C40 = (3 / 16) * Math.sqrt(1 / PI);
  var SH_C42P = (3 / 8) * Math.sqrt(5 / PI);
  var SH_C44P = (3 / 16) * Math.sqrt(35 / PI);

  // Evaluate all 25 orthonormal real spherical harmonics Y_l^m (l = 0..4) at direction (x, y, z).
  // Polar axis is +Y (1111/F north pole, 0000 south pole); equatorial plane is XZ (Top XZ).
  // Singularity-free pure Cartesian polynomials — zero atan2/acos pole glitches.
  function sphericalHarmonicBasis25(x, y, z, out) {
    var dst = out || new Float32Array(25);
    var len = Math.sqrt(x * x + y * y + z * z);
    var u, v, w;
    if (len > 1e-12) {
      u = x / len;
      v = z / len;
      w = y / len;
    } else {
      u = 0; v = 0; w = 1;
    }
    var u2 = u * u, v2 = v * v, w2 = w * w;
    var uv = u * v, uw = u * w, vw = v * w;
    var u2mv2 = u2 - v2;

    // l = 0
    dst[0] = SH_C00;
    // l = 1
    dst[1] = SH_C1 * v;
    dst[2] = SH_C1 * w;
    dst[3] = SH_C1 * u;
    // l = 2
    dst[4] = SH_C2A * uv;
    dst[5] = SH_C2A * vw;
    dst[6] = SH_C20 * (3 * w2 - 1);
    dst[7] = SH_C2A * uw;
    dst[8] = SH_C22 * u2mv2;
    // l = 3
    dst[9]  = SH_C33 * v * (3 * u2 - v2);
    dst[10] = SH_C32N * u * v * w; // Quadray octupole: maxima on exact regular tetrahedron vertices!
    dst[11] = SH_C31 * v * (5 * w2 - 1);
    dst[12] = SH_C30 * w * (5 * w2 - 3);
    dst[13] = SH_C31 * u * (5 * w2 - 1);
    dst[14] = SH_C32P * w * u2mv2;
    dst[15] = SH_C33 * u * (u2 - 3 * v2);
    // l = 4
    dst[16] = SH_C44N * uv * u2mv2;
    dst[17] = SH_C43 * vw * (3 * u2 - v2);
    dst[18] = SH_C42N * uv * (7 * w2 - 1);
    dst[19] = SH_C41 * vw * (7 * w2 - 3);
    dst[20] = SH_C40 * (35 * w2 * w2 - 30 * w2 + 3);
    dst[21] = SH_C41 * uw * (7 * w2 - 3);
    dst[22] = SH_C42P * u2mv2 * (7 * w2 - 1);
    dst[23] = SH_C43 * uw * (u2 - 3 * v2);
    dst[24] = SH_C44P * (u2 * u2 - 6 * u2 * v2 + v2 * v2);
    return dst;
  }

  function sphericalHarmonicReal(l, m, x, y, z) {
    var li = Math.round(Number(l || 0));
    var mi = Math.round(Number(m || 0));
    if (li < 0 || li > 4 || Math.abs(mi) > li) return 0;
    var basis = sphericalHarmonicBasis25(x, y, z);
    return basis[li * li + (li + mi)];
  }

  // Project any Chime preset trajectory onto the (maxL+1)^2 orthonormal real spherical harmonics
  function sphericalHarmonicSpectrum(state, opts) {
    opts = opts || {};
    var maxL = clamp(Math.round(opts.maxL != null ? opts.maxL : 4), 0, 4);
    var bandCount = (maxL + 1) * (maxL + 1);
    var numSamples = clamp(Math.round(opts.samples || 256), 32, 2048);
    var R = Math.max(1e-6, Number((state && state.r != null) ? state.r : 1));
    var res = sample(state, numSamples);
    var pts = res.points;

    var acc = new Float64Array(bandCount);
    var basis = new Float32Array(25);
    var validCount = 0;

    for (var i = 0; i < pts.length; i++) {
      var p = pts[i];
      if (!p || !p.valid) continue;
      var rad = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
      if (!Number.isFinite(rad)) continue;
      var weight = clamp(rad / R, 0, 3.0);
      sphericalHarmonicBasis25(p.x, p.y, p.z, basis);
      for (var k = 0; k < bandCount; k++) {
        acc[k] += weight * basis[k];
      }
      validCount++;
    }

    var normScale = validCount > 0 ? (Math.sqrt(4 * PI) / validCount) : 0;
    var coeffs = new Float32Array(bandCount);
    var degreeEnergy = new Float32Array(maxL + 1);
    var totalEnergy = 0;
    var peakVal = 0, peakAbs = -1;
    var domIdx = 0, domAbs = -1;

    for (var k2 = 0; k2 < bandCount; k2++) {
      var c = acc[k2] * normScale;
      coeffs[k2] = Math.fround(c);
      var lDeg = SH_BAND_META[k2].l;
      var e = c * c;
      degreeEnergy[lDeg] += e;
      totalEnergy += e;
      var ac = Math.abs(c);
      if (ac > peakAbs) { peakAbs = ac; peakVal = c; }
      if (k2 > 0 && ac > domAbs) { domAbs = ac; domIdx = k2; }
    }
    if (domAbs <= 1e-6) domIdx = 0;

    for (var d = 0; d <= maxL; d++) degreeEnergy[d] = Math.fround(degreeEnergy[d]);
    var quadrayCoeff = bandCount > 10 ? coeffs[10] : 0;
    var quadrayAlignment = totalEnergy > 1e-12 ? Math.abs(quadrayCoeff) / Math.sqrt(totalEnergy) : 0;

    return {
      maxL: maxL,
      bandCount: bandCount,
      validSamples: validCount,
      coeffs: coeffs,
      degreeEnergy: degreeEnergy,
      totalEnergy: Math.fround(totalEnergy),
      quadrayCoeff: Math.fround(quadrayCoeff),
      quadrayAlignment: Math.fround(quadrayAlignment),
      dominantBand: SH_BAND_META[domIdx],
      peakCoeff: Math.fround(peakVal),
      peakBits: bitInspect(peakVal)
    };
  }

  // Exact hollow-shell harmonic multipole filter: T_l(eta) = eta^l = (r/R)^l (6*l dB/octave!)
  // Plus Recursive Multipole Zoom-Unpack across Sentinel Octave sigma (volume scaling 2^(-3*sigma))
  function shellMultipoleTransfer(coeffs, etaVal, sentinelSigma) {
    var n = Math.min(25, (coeffs && coeffs.length) ? coeffs.length : 25);
    var eta = clamp(Number(etaVal != null ? etaVal : 0.5), 0, 1);
    var sigma = clamp(Math.round(Number(sentinelSigma || 0)), -6, 6);

    var inner = new Float32Array(n);
    var outer = new Float32Array(n);
    var unpacked = new Float32Array(n);
    var transferByDegree = new Float32Array(5);
    var attenuationDbByDegree = new Float32Array(5);

    for (var l = 0; l <= 4; l++) {
      var tl = (l === 0) ? 1.0 : Math.pow(eta, l);
      transferByDegree[l] = Math.fround(tl);
      attenuationDbByDegree[l] = (tl <= 1e-12) ? -Infinity : Math.fround(20 * Math.log10(tl));
    }

    var eIn = 0, eOut = 0, eUnpack = 0;
    var zoomBoostBase = Math.pow(2, sigma);
    for (var k = 0; k < n; k++) {
      var cIn = Number(coeffs && coeffs[k] != null ? coeffs[k] : 0);
      var lDeg = SH_BAND_META[k].l;
      var tl2 = transferByDegree[lDeg];
      var cOut = cIn * tl2;
      // Recursive Zoom-Unpack: zooming inward (sigma > 0) restores high-l modes previously
      // coarse-grained behind the hollow shell wall, bounded at unity gain per band.
      var unpackGain = (lDeg === 0) ? 1.0 : clamp(tl2 * Math.pow(zoomBoostBase, lDeg), 0, 1.0);
      var cUn = cIn * unpackGain;

      inner[k] = Math.fround(cIn);
      outer[k] = Math.fround(cOut);
      unpacked[k] = Math.fround(cUn);
      eIn += cIn * cIn;
      eOut += cOut * cOut;
      eUnpack += cUn * cUn;
    }

    return {
      eta: Math.fround(eta),
      sentinelSigma: sigma,
      unpackScale: Math.fround(Math.pow(2, -sigma)),
      volumeScale: Math.pow(2, -3 * sigma),
      activeChildDepth: Math.max(0, sigma),
      transferByDegree: transferByDegree,
      attenuationDbByDegree: attenuationDbByDegree,
      inner: inner,
      outer: outer,
      unpacked: unpacked,
      energyInner: Math.fround(eIn),
      energyOuter: Math.fround(eOut),
      energyUnpacked: Math.fround(eUnpack),
      transmissionRatio: Math.fround(eIn > 1e-12 ? (eOut / eIn) : 0)
    };
  }

  // Deterministic subdivided unit icosphere Graph Laplacian conductive wireframe solver (L = D - A)
  // Supports CFL-stable conductive wave (d2u/dt2 = -c^2 L u - gamma du/dt) & heat/osmosis diffusion
  // (du/dt = -kappa L u), radial inner<->outer conductance, and passive C1 surface wavefolding.
  function createSphericalWireframeGraph(opts) {
    opts = opts || {};
    var subdiv = clamp(Math.round(opts.subdivisions != null ? opts.subdivisions : 2), 1, 3);

    // Base golden-ratio icosahedron (12 vertices, 20 faces)
    var phi = (1 + Math.sqrt(5)) * 0.5;
    var rawV = [
      [-1,  phi, 0], [ 1,  phi, 0], [-1, -phi, 0], [ 1, -phi, 0],
      [ 0, -1,  phi], [ 0,  1,  phi], [ 0, -1, -phi], [ 0,  1, -phi],
      [ phi, 0, -1], [ phi, 0,  1], [-phi, 0, -1], [-phi, 0,  1]
    ];
    var verts = [];
    for (var vi = 0; vi < rawV.length; vi++) {
      var v0 = rawV[vi];
      var vl = Math.sqrt(v0[0] * v0[0] + v0[1] * v0[1] + v0[2] * v0[2]);
      verts.push([v0[0] / vl, v0[1] / vl, v0[2] / vl]);
    }
    var faces = [
      [0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],
      [1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],
      [3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],
      [4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]
    ];

    for (var s = 0; s < subdiv; s++) {
      var midCache = Object.create(null);
      var nextFaces = [];
      function midpoint(a, b) {
        var key = a < b ? (a + '_' + b) : (b + '_' + a);
        if (midCache[key] !== undefined) return midCache[key];
        var va = verts[a], vb = verts[b];
        var mx = (va[0] + vb[0]) * 0.5;
        var my = (va[1] + vb[1]) * 0.5;
        var mz = (va[2] + vb[2]) * 0.5;
        var ml = Math.sqrt(mx * mx + my * my + mz * mz);
        var idx = verts.length;
        verts.push([mx / ml, my / ml, mz / ml]);
        midCache[key] = idx;
        return idx;
      }
      for (var fi = 0; fi < faces.length; fi++) {
        var f = faces[fi];
        var ab = midpoint(f[0], f[1]);
        var bc = midpoint(f[1], f[2]);
        var ca = midpoint(f[2], f[0]);
        nextFaces.push([f[0], ab, ca], [f[1], bc, ab], [f[2], ca, bc], [ab, bc, ca]);
      }
      faces = nextFaces;
    }

    var V = verts.length;
    var positions = new Float32Array(V * 3);
    for (var p = 0; p < V; p++) {
      positions[p * 3]     = verts[p][0];
      positions[p * 3 + 1] = verts[p][1];
      positions[p * 3 + 2] = verts[p][2];
    }

    // Extract unique undirected edges & adjacency lists
    var edgeSeen = Object.create(null);
    var edgeList = [];
    var adj = new Array(V);
    for (var a0 = 0; a0 < V; a0++) adj[a0] = [];
    for (var fj = 0; fj < faces.length; fj++) {
      var fc = faces[fj];
      var pairs = [[fc[0], fc[1]], [fc[1], fc[2]], [fc[2], fc[0]]];
      for (var pe = 0; pe < 3; pe++) {
        var eA = pairs[pe][0], eB = pairs[pe][1];
        var ek = eA < eB ? (eA + '_' + eB) : (eB + '_' + eA);
        if (!edgeSeen[ek]) {
          edgeSeen[ek] = 1;
          edgeList.push(eA < eB ? eA : eB, eA < eB ? eB : eA);
          adj[eA].push(eB);
          adj[eB].push(eA);
        }
      }
    }
    var edges = new Uint16Array(edgeList);
    var E = edgeList.length / 2;

    // Precompute the 25 Y_l^m basis values per vertex for zero-cost inner-cavity SH projection
    var vertexSH = new Float32Array(V * 25);
    var tmpB = new Float32Array(25);
    for (var vk = 0; vk < V; vk++) {
      sphericalHarmonicBasis25(positions[vk * 3], positions[vk * 3 + 1], positions[vk * 3 + 2], tmpB);
      vertexSH.set(tmpB, vk * 25);
    }

    var u = new Float32Array(V);
    var uPrev = new Float32Array(V);
    var uNext = new Float32Array(V);
    var vel = new Float32Array(V);
    var uIn = new Float32Array(V);
    var stepCount = 0;

    function reset() {
      u.fill(0);
      uPrev.fill(0);
      uNext.fill(0);
      vel.fill(0);
      uIn.fill(0);
      stepCount = 0;
    }

    function injectNode(idx, amp) {
      var i = Math.round(Number(idx || 0));
      if (i < 0 || i >= V) return;
      var a = clamp(Number(amp != null ? amp : 1.0), -2.5, 2.5);
      u[i] = Math.fround(clamp(u[i] + a, -3, 3));
      uPrev[i] = Math.fround(clamp(uPrev[i] + a, -3, 3));
    }

    function injectDirection(nx, ny, nz, amp, spread) {
      var len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (len <= 1e-9) return;
      var dx = nx / len, dy = ny / len, dz = nz / len;
      var a = clamp(Number(amp != null ? amp : 1.0), -2.5, 2.5);
      var sigma2 = Math.pow(clamp(Number(spread != null ? spread : 0.32), 0.08, 1.5), 2);
      for (var i = 0; i < V; i++) {
        var dot = dx * positions[i * 3] + dy * positions[i * 3 + 1] + dz * positions[i * 3 + 2];
        var dist2 = Math.max(0, 2 - 2 * dot); // chord distance squared on unit sphere
        if (dist2 < sigma2 * 9) {
          var g = a * Math.exp(-dist2 / (2 * sigma2));
          u[i] = Math.fround(clamp(u[i] + g, -3, 3));
          uPrev[i] = Math.fround(clamp(uPrev[i] + g, -3, 3));
        }
      }
    }

    function setInnerFromSH(coeffs) {
      var nC = Math.min(25, (coeffs && coeffs.length) ? coeffs.length : 0);
      for (var i = 0; i < V; i++) {
        var off = i * 25;
        var sum = 0;
        for (var k = 0; k < nC; k++) sum += coeffs[k] * vertexSH[off + k];
        uIn[i] = Math.fround(clamp(sum, -2.5, 2.5));
      }
    }

    function step(cfg) {
      cfg = cfg || {};
      var mode = cfg.mode === 'diffusion' ? 'diffusion' : 'wave';
      var boundary = cfg.boundary === 'wavefold' ? 'wavefold' : 'osmosis';
      var eta = clamp(Number(cfg.eta != null ? cfg.eta : 0.5), 0, 0.98);
      var visc = clamp(Number(cfg.viscosity != null ? cfg.viscosity : 0.03), 0, 0.4);
      var coupling = clamp(Number(cfg.coupling != null ? cfg.coupling : 0), 0, 0.18);
      var gRad = coupling * clamp(eta * eta, 0.02, 1.0);

      // Guaranteed CFL-stable wave speed (max eigenvalue of degree-6 icosphere Laplacian <= 12)
      var cSpeed = clamp(Number(cfg.speed != null ? cfg.speed : 0.36), 0.05, 0.42);
      var c2 = cSpeed * cSpeed;
      var kappa = clamp(Number(cfg.diffusion != null ? cfg.diffusion : 0.08), 0.005, 0.12);

      for (var i = 0; i < V; i++) {
        var uC = u[i];
        var nbrs = adj[i];
        var negLu = 0; // -(L u)_i = sum_{j~i} (u_j - u_i)
        for (var m = 0; m < nbrs.length; m++) {
          negLu += u[nbrs[m]] - uC;
        }
        var radialDrive = gRad > 0 ? (gRad * (uIn[i] - uC)) : 0;
        var nextVal;

        if (mode === 'diffusion') {
          nextVal = uC + kappa * negLu + radialDrive - (visc * 0.15) * uC;
        } else {
          // Osmosis adds gentle radiation damping; Wavefold reflects energy inside the shell
          var damp = clamp(visc * (boundary === 'osmosis' ? (1.15 + 0.45 * eta) : 0.65), 0, 0.45);
          nextVal = (2 * uC - (1 - damp) * uPrev[i] + c2 * negLu + radialDrive) / (1 + damp);
        }

        // Strictly passive C1-smooth sine wavefolding (|f(x)| <= |x| everywhere)
        if (boundary === 'wavefold' && Math.abs(nextVal) > 0.85) {
          var foldT = 0.85;
          var foldW = 0.40;
          var sgn = nextVal >= 0 ? 1 : -1;
          var exc = Math.abs(nextVal) - foldT;
          nextVal = sgn * (foldT + foldW * Math.sin(exc / foldW));
        } else {
          nextVal = clamp(nextVal, -2.5, 2.5);
        }

        uNext[i] = Math.fround(nextVal);
        vel[i] = Math.fround(nextVal - uC);
      }

      var tmp = uPrev;
      uPrev = u;
      u = uNext;
      uNext = tmp;
      stepCount++;
      return { step: stepCount, vertexCount: V, edgeCount: E };
    }

    function laplacianEnergy() {
      var dirichlet = 0;
      for (var e = 0; e < E; e++) {
        var diff = u[edges[e * 2]] - u[edges[e * 2 + 1]];
        dirichlet += diff * diff;
      }
      dirichlet *= 0.5; // Exact (1/2) u^T L u

      var kin = 0, pot = 0, sum = 0, peak = 0;
      for (var i = 0; i < V; i++) {
        var ui = u[i], vi = vel[i];
        pot += ui * ui;
        kin += vi * vi;
        sum += ui;
        var au = Math.abs(ui);
        if (au > peak) peak = au;
      }
      return {
        steps: stepCount,
        vertexCount: V,
        edgeCount: E,
        faceCount: faces.length,
        dirichletEnergy: Math.fround(dirichlet),
        kineticEnergy: Math.fround(0.5 * kin),
        potentialEnergy: Math.fround(0.5 * pot),
        totalEnergy: Math.fround(0.5 * (pot + kin)),
        meanVal: Math.fround(sum / V),
        peakAbs: Math.fround(peak)
      };
    }

    return {
      subdivisions: subdiv,
      vertexCount: V,
      edgeCount: E,
      faceCount: faces.length,
      positions: positions,
      edges: edges,
      adjacency: adj,
      getField: function () { return u; },
      getInnerField: function () { return uIn; },
      getVelocity: function () { return vel; },
      reset: reset,
      injectNode: injectNode,
      injectDirection: injectDirection,
      setInnerFromSH: setInnerFromSH,
      step: step,
      laplacianEnergy: laplacianEnergy
    };
  }

  // ---- Stage 4b-2 (§§5.6–5.7): Harmor Void Cavity Collapse (lambda), Resonant Attraction (kappa),
  //      & 4-Bit Orbit "Violin Bow" Lock-In / Top-Down Richter-Yaw Extractor ----

  function parseHexNibbles(hexStr) {
    var clean = String(hexStr || '8ADEFEDA85210125').replace(/^0x/i, '').replace(/[^0-9a-fA-F]/g, '').toUpperCase();
    if (!clean.length) clean = '8888888888888888';
    if (clean.length < 4) clean = (clean + '8888').slice(0, 4);
    if (clean.length > 64) clean = clean.slice(0, 64);
    var out = new Uint8Array(clean.length);
    for (var i = 0; i < clean.length; i++) out[i] = parseInt(clean[i], 16) & 0xF;
    return { hex: clean, nibbles: out };
  }

  function nibbleToUnit(n) {
    // §5.6 Zero-crossing pivot: 0x8 (1000) -> exact 0.0, 0xF -> +1.0, 0x0 -> -1.0
    return n >= 8 ? ((n - 8) / 7) : ((n - 8) / 8);
  }

  function unitToNibble(v) {
    var x = clamp(Number(v || 0), -1, 1);
    return x >= 0 ? clamp(Math.round(8 + x * 7), 8, 15) : clamp(Math.round(8 + x * 8), 0, 8);
  }

  // Periodic Fritsch-Carlson monotone-cubic interpolation across cyclic nibble knots
  function sampleCyclicMonotoneNibbles(nibbles, bins) {
    var M = nibbles.length;
    var y = new Float64Array(M);
    for (var i = 0; i < M; i++) y[i] = nibbleToUnit(nibbles[i]);
    var sec = new Float64Array(M);
    for (var j = 0; j < M; j++) sec[j] = y[(j + 1) % M] - y[j];
    var m = new Float64Array(M);
    for (var k = 0; k < M; k++) {
      var dPrev = sec[(k - 1 + M) % M];
      var dNext = sec[k];
      if (dPrev * dNext <= 0) m[k] = 0;
      else m[k] = 0.5 * (dPrev + dNext);
    }
    // Enforce Fritsch-Carlson monotonicity clamp so spline never overshoots knots
    for (var s = 0; s < M; s++) {
      var dk = sec[s];
      if (Math.abs(dk) < 1e-12) {
        m[s] = 0;
        m[(s + 1) % M] = 0;
      } else {
        var a = m[s] / dk;
        var b = m[(s + 1) % M] / dk;
        var h2 = a * a + b * b;
        if (h2 > 9) {
          var tau = 3 / Math.sqrt(h2);
          m[s] = tau * a * dk;
          m[(s + 1) % M] = tau * b * dk;
        }
      }
    }
    var out = new Float32Array(bins);
    for (var bi = 0; bi < bins; bi++) {
      var pos = (bi / bins) * M;
      var idx = Math.floor(pos) % M;
      var nxt = (idx + 1) % M;
      var t = pos - Math.floor(pos);
      var t2 = t * t, t3 = t2 * t;
      var h00 = 2 * t3 - 3 * t2 + 1;
      var h10 = t3 - 2 * t2 + t;
      var h01 = -2 * t3 + 3 * t2;
      var h11 = t3 - t2;
      out[bi] = Math.fround(clamp(h00 * y[idx] + h10 * m[idx] + h01 * y[nxt] + h11 * m[nxt], -1, 1));
    }
    return out;
  }

  // §5.6 Harmor Void Cavity Collapse (lambda in [0,1]) & Resonant Attraction (kappa in [0,1])
  // Smoothly collapses 3D green hollow shell (R, r) into 2D green BitWave spline over #000000 silence
  // and computes next-shell register expansion S_k -> S_{k+1} (M -> 2M nibbles).
  function cavityCollapseProfile(state, opts) {
    state = state || {};
    opts = opts || {};
    var R = Math.max(0.1, Number(state.r != null ? state.r : 1));
    var rIn = clamp(Number(state.rIn != null ? state.rIn : 0.5), 0, R);
    var lambda = clamp(Number(opts.lambda != null ? opts.lambda : 0), 0, 1);
    var kappa = clamp(Number(opts.kappa != null ? opts.kappa : 0), 0, 1);
    var bins = clamp(Math.round(opts.bins || 128), 16, 512);

    var parsed = parseHexNibbles(opts.hex);
    var nibbles = parsed.nibbles;
    var bitWave = sampleCyclicMonotoneNibbles(nibbles, bins);

    var hasFormulas = !!(state.formulas && state.formulas.x && state.formulas.y);
    var sampled = hasFormulas ? sample(state, bins) : null;
    var pts = sampled ? sampled.points : null;

    var sphereX = new Float32Array(bins);
    var sphereY = new Float32Array(bins);
    var sphereZ = new Float32Array(bins);
    var shellCarrier = new Float32Array(bins);
    var attracted = new Float32Array(bins);
    var residual = new Float32Array(bins);
    var outX = new Float32Array(bins);
    var outY = new Float32Array(bins);
    var outZ = new Float32Array(bins);

    var sqShell = 0, sqRes = 0, peakRes = 0, peakAbs = -1;
    for (var i = 0; i < bins; i++) {
      var uT = i / (bins - 1);
      var sx, sy, sz;
      if (pts && pts[i] && pts[i].valid) {
        sx = pts[i].x; sy = pts[i].y; sz = pts[i].z;
      } else {
        var ang = TAU * uT;
        sx = R * Math.cos(ang);
        sy = R * Math.sin(ang);
        sz = rIn * Math.sin(ang * 2) * 0.5;
      }
      var sc = clamp(sy / R, -1, 1);
      var att = (1 - kappa) * bitWave[i] + kappa * sc;
      var res = sc - att;

      var lineX = (uT * 2 - 1) * R;
      sphereX[i] = Math.fround(sx);
      sphereY[i] = Math.fround(sy);
      sphereZ[i] = Math.fround(sz);
      shellCarrier[i] = Math.fround(sc);
      attracted[i] = Math.fround(att);
      residual[i] = Math.fround(res);
      outX[i] = Math.fround(lerp(sx, lineX, lambda));
      outY[i] = Math.fround(lerp(sy, att * R, lambda));
      outZ[i] = Math.fround((1 - lambda) * sz);

      sqShell += sc * sc;
      sqRes += res * res;
      var ar = Math.abs(res);
      if (ar > peakAbs) { peakAbs = ar; peakRes = res; }
    }

    var rmsShell = Math.sqrt(sqShell / bins);
    var rmsRes = Math.sqrt(sqRes / bins);
    var nullDb = rmsRes <= 1e-9 ? -Infinity : (20 * Math.log10(rmsRes / Math.max(rmsShell, 1e-9)));

    var zeroCrossings = 0;
    for (var n0 = 0; n0 < nibbles.length; n0++) {
      if (nibbles[n0] === 8) zeroCrossings++;
    }

    // Build next outer sphere S_{k+1} expanded hex (M -> 2M nibbles, capped at 64 nibbles / 256 bits)
    var expHex = '';
    if (nibbles.length <= 32) {
      for (var ei = 0; ei < nibbles.length; ei++) {
        var aN = nibbles[ei];
        var bN = nibbles[(ei + 1) % nibbles.length];
        var midN = clamp(Math.round(0.5 * (aN + bN)), 0, 15);
        expHex += aN.toString(16).toUpperCase() + midN.toString(16).toUpperCase();
      }
    } else {
      expHex = parsed.hex;
    }

    return {
      R: Math.fround(R),
      rIn: Math.fround(rIn),
      lambda: Math.fround(lambda),
      kappa: Math.fround(kappa),
      wallThickness: Math.fround((1 - lambda) * Math.max(0, R - rIn)),
      voidFraction: Math.fround(lambda),
      hex: parsed.hex,
      nibbles: nibbles,
      registerBits: nibbles.length * 4,
      nextOuterBits: Math.min(256, nibbles.length * 8),
      expandedHex: expHex,
      zeroCrossings: zeroCrossings,
      bins: bins,
      bitWave: bitWave,
      shellCarrier: shellCarrier,
      attracted: attracted,
      residual: residual,
      outX: outX,
      outY: outY,
      outZ: outZ,
      rmsShell: Math.fround(rmsShell),
      rmsResidual: Math.fround(rmsRes),
      nullDb: Number.isFinite(nullDb) ? Math.fround(nullDb) : -Infinity,
      isExactNull: rmsRes <= 1e-9,
      peakResidual: Math.fround(peakRes),
      peakResidualBits: bitInspect(peakRes)
    };
  }

  // §5.7 Temporal Filtration: 4-Bit Orbit "Violin Bow" Quadrature Lock-In & Top-Down Richter-Yaw Extractor
  // Reuses Engine.fourBitOrbit() for exact right-triangle bow geometry, built-in -3 dB (R/sqrt(2)) cavity contact,
  // continuous or Order-N modular comb stepping, and real-time 4-bit nibble crystallization (0x8 = zero-crossing).
  function fourBitLockInYaw(state, playT, opts) {
    state = state || {};
    opts = opts || {};
    var R = Math.max(0.1, Number(state.r != null ? state.r : 1));
    var rIn = clamp(Number(state.rIn != null ? state.rIn : 0), 0, R);
    var eta = rIn / R;
    var modular = !!opts.modular;
    var orderN = clamp(Math.round(opts.orderN != null ? opts.orderN : (state.orderN != null ? state.orderN : 19)), 3, 96);
    var stride = Math.max(1, Math.round(opts.stride != null ? opts.stride : (state.n != null ? state.n : 1)));
    var g = gcd(stride, orderN);
    var subOrder = Math.floor(orderN / g);
    var bins = clamp(Math.round(opts.bins || 128), 32, 512);
    var gain = clamp(Number(opts.gain != null ? opts.gain : 1.6), 0.2, 6.0);

    var rawT = frac(Number(playT || 0));
    var modStep = Math.floor(rawT * orderN);
    var modSlot = (modStep * stride) % orderN;
    var effT = modular ? (modSlot / orderN) : rawT;

    // Sample cavity signal once (or reuse caller-supplied pre-sampled points)
    var pts = opts.points;
    if (!pts) {
      if (state.formulas && state.formulas.x && state.formulas.y) {
        pts = sample(state, bins).points;
      } else {
        pts = [];
      }
    }
    var pLen = pts.length;
    var sig = new Float32Array(pLen);
    var sigSum = 0;
    for (var s0 = 0; s0 < pLen; s0++) {
      var pt = pts[s0];
      var sv = (pt && pt.valid && Number.isFinite(pt.y)) ? clamp(pt.y / R, -2.5, 2.5) : 0;
      sig[s0] = sv;
      sigSum += sv;
    }
    var sigMean = pLen > 0 ? (sigSum / pLen) : 0;

    function evalAtT(tVal) {
      var orb = fourBitOrbit(state, tVal);
      var theta = orb.theta;
      var scanPhi = TAU * tVal;
      var sinT = Math.sin(theta);
      var sin2 = sinT * sinT;

      // Exact Violin Bow Right-Triangle Area = (1/2)*(R*sin(theta))^2 = (R^2/4)*(1 - cos(2*theta))
      var bowArea = 0.5 * R * R * sin2;
      var bowHypotenuse = Math.SQRT2 * R * Math.abs(sinT);
      // Closest approach of bow hypotenuse midpoint to origin: R * sqrt(1 - 0.5*sin^2(theta)) in [R/sqrt(2), R]
      var dMid = R * Math.sqrt(Math.max(0, 1 - 0.5 * sin2));
      var halfPowerRadius = R * Math.SQRT1_2;
      var cavityContact = rIn > 1e-6 && dMid <= (rIn + 1e-6);
      var penetration = cavityContact ? (rIn - dMid) : 0;

      // Broadband Gaussian Violin-Bow Lock-In Pickup (I = even/local amplitude, Q = quadrature slope)
      // Works across ANY carrier frequency (1x sine, 9-cycle Analytic Morlet burst, Weierstrass, Lissajous)
      // while remaining identically 0 (nibble 0x8) on flat DC or silent cavity signals.
      var accI = 0, accQ = 0, wSum = 0;
      if (pLen > 0) {
        var inv2Sig2 = 1 / (2 * 0.14 * 0.14);
        for (var i = 0; i < pLen; i++) {
          var phi = (i / pLen) * TAU;
          var dPhi = phi - scanPhi;
          if (dPhi > PI) dPhi -= TAU;
          else if (dPhi < -PI) dPhi += TAU;
          var win = Math.exp(-(dPhi * dPhi) * inv2Sig2);
          if (win < 1e-5) continue;
          var sAC = sig[i] - sigMean;
          accI += sAC * Math.cos(dPhi) * win;
          accQ += sAC * Math.sin(dPhi) * win;
          wSum += win;
        }
      }
      var invW = wSum > 1e-9 ? (1.0 / wSum) : 0;
      var lockI = accI * invW;
      var lockQ = accQ * invW;
      var lockMag = Math.sqrt(lockI * lockI + lockQ * lockQ);

      // Cavity contact boost when hypotenuse penetrates past -3 dB boundary into inner cavity
      var contactBoost = cavityContact ? (1 + 0.35 * clamp(penetration / Math.max(0.05, R * (1 - Math.SQRT1_2)), 0, 1)) : 1.0;
      var yawProj = (lockI + 0.65 * lockQ) * gain * contactBoost;
      var yawNorm = clamp(yawProj, -1, 1);
      var yawRad = yawNorm * (PI * 0.25);
      var nib = unitToNibble(yawNorm);

      return {
        orbit: orb,
        effT: effT,
        bowArea: Math.fround(bowArea),
        bowHypotenuse: Math.fround(bowHypotenuse),
        dMid: Math.fround(dMid),
        halfPowerRadius: Math.fround(halfPowerRadius),
        eta: Math.fround(eta),
        etaCrossesHalfPower: eta >= (Math.SQRT1_2 - 1e-6),
        cavityContact: cavityContact,
        penetration: Math.fround(penetration),
        modular: modular,
        orderN: orderN,
        stride: stride,
        gcd: g,
        subOrder: subOrder,
        modSlot: modSlot,
        lockI: Math.fround(lockI),
        lockQ: Math.fround(lockQ),
        lockMag: Math.fround(lockMag),
        yawNorm: Math.fround(yawNorm),
        yawRad: Math.fround(yawRad),
        yawDeg: Math.fround((yawRad * 180) / PI),
        nibbleVal: nib,
        nibbleHex: nib.toString(16).toUpperCase(),
        nibbleBin: nib.toString(2).padStart(4, '0')
      };
    }

    var cur = evalAtT(effT);

    // Optional deterministic full-sweep 16-nibble BitWave extraction
    if (opts.sweepNibbles) {
      var sweepN = clamp(Math.round(opts.sweepNibbles), 4, 64);
      var nibs = new Uint8Array(sweepN);
      var trace = new Float32Array(sweepN);
      var hexOut = '';
      for (var sw = 0; sw < sweepN; sw++) {
        var tSw = modular ? (((sw * stride) % orderN) / orderN) : (sw / sweepN);
        var ev = evalAtT(tSw);
        nibs[sw] = ev.nibbleVal;
        trace[sw] = ev.yawNorm;
        hexOut += ev.nibbleHex;
      }
      cur.extractedNibbles = nibs;
      cur.extractedHex = hexOut;
      cur.yawTrace = trace;
    }

    return cur;
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
      gcd: gcd, lcm: lcm, isPrimeInt: isPrimeInt, discreteGroup: discreteGroup,
      clefFactor: clefFactor,
      pseudoMersenneDecomp: pseudoMersenneDecomp,
      lowestCommonStructure: lowestCommonStructure,
      sentinelHysteresisStep: sentinelHysteresisStep,
      sentinelRegister: sentinelRegister,
      vesselCalculus: vesselCalculus,
      vesselPerturbation: vesselPerturbation,
      hypergeometricLockV: hypergeometricLockV,
      multitudeShell: multitudeShell,
      sentinelOctalDecomp: sentinelOctalDecomp,
      cubeLatticeCheck: cubeLatticeCheck,
      modularZoomPhase: modularZoomPhase,
      parallelVesselBus: parallelVesselBus,
      bitwiseNotNullBridge: bitwiseNotNullBridge,
      tunerReadout: tunerReadout,
      keySignatureLattice: keySignatureLattice,
      snapToKeySignature: snapToKeySignature,
      diatonicModeConjugate: diatonicModeConjugate,
      clockworkCoupling: clockworkCoupling,
      pollardRhoSlice: pollardRhoSlice,
      sliceCalculus2D: sliceCalculus2D,
      cavalieriVolume: cavalieriVolume,
      crossChimeSlice: crossChimeSlice,
      createViscoelasticTank: createViscoelasticTank,
      projectTankToFloorField: projectTankToFloorField,
      SH_BAND_META: SH_BAND_META,
      sphericalHarmonicBasis25: sphericalHarmonicBasis25,
      sphericalHarmonicReal: sphericalHarmonicReal,
      sphericalHarmonicSpectrum: sphericalHarmonicSpectrum,
      shellMultipoleTransfer: shellMultipoleTransfer,
      createSphericalWireframeGraph: createSphericalWireframeGraph,
      cavityCollapseProfile: cavityCollapseProfile,
      fourBitLockInYaw: fourBitLockInYaw,
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
