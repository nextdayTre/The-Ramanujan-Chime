/* ===== Harmony.Presets — curated spatial-synth & mathematical patches =====
   Every preset drives the same Float32 Harmony.engine formulas x(t), y(t), z(t).
   Presets can also suggest view hints (e.g. enabling the internal 2D f(x)/x
   slice plane or circular zoom magnifier for Weierstrass / Morlet). */
(function () {
  'use strict';

  var PRESETS = [
    {
      name: 'Great Circle — 90° Quadrature Carrier',
      group: 'Sphere & Carrier',
      formulas: {
        x: 'r*cos(TAU*f*t+phase)',
        y: 'r*sin(TAU*f*t+phase)',
        z: '0'
      },
      params: { r: 1, rIn: 0.45, amp: 1, f: 1, n: 3, m: 2, k: 1, K: 6, a: 0.5, b: 3, phaseDeg: 0 },
      hints: { sliceGrid: true, cutaway: false, magnifier: false, twinMode: 'both' },
      note: 'Cosine + Sine in 90° quadrature: x²+y²=R² traces the exact equatorial slice of the sphere. Compare Antipodal (−P, null flip) vs Conjugate (P̄, collapsing to real 2·cos on X).'
    },
    {
      name: 'Hollow Shell Carrier — 3D Radial Wavetable (R³ − r³)',
      group: 'Sphere & Carrier',
      formulas: {
        x: 'lerp(rIn,r,0.5+0.5*cos(TAU*n*t))*cos(TAU*m*t*3+phase)*sin(PI*t)',
        y: 'lerp(rIn,r,0.5+0.5*cos(TAU*n*t))*cos(PI*t)',
        z: 'lerp(rIn,r,0.5+0.5*cos(TAU*n*t))*sin(TAU*m*t*3+phase)*sin(PI*t)'
      },
      params: { r: 1, rIn: 0.50, amp: 1, f: 1, n: 6, m: 3, k: 1, K: 6, a: 0.5, b: 3, phaseDeg: 0 },
      hints: { sliceGrid: false, cutaway: true, magnifier: false, twinMode: 'antipodal' },
      note: 'A 3D spherical wavetable whose radius breathes sinusoidally between inner cavity r and outer carrier R — living strictly inside the hollow shell V = 4/3·π(R³ − r³).'
    },
    {
      name: 'Weierstrass Fractal — Internal 2D f(x) Slice',
      group: '2D f(x) Slice Inside Sphere',
      formulas: {
        x: 'r*u',
        y: 'r*0.5*weierstrass(2*u, a, b, K)',
        z: '0'
      },
      params: { r: 1, rIn: 0.45, amp: 1, f: 1, n: 3, m: 2, k: 1, K: 8, orderN: 19, a: 0.5, b: 3, phaseDeg: 0 },
      hints: { sliceGrid: true, cutaway: false, magnifier: true, magFocus: 'trough', twinMode: 'off', strobeN: false },
      note: 'W(x) = Σ aᵏ·cos(bᵏπx) plotted on the sphere\'s internal f(x)/x grid! Drag Harmonics K from 0 (pure cosine) to 14 (continuous everywhere, differentiable nowhere) and inspect the Zoom Lens.'
    },
    {
      name: 'Weierstrass Curve y² = x³ + 7 — secp256k1 2D Slice',
      group: '2D f(x) Slice Inside Sphere',
      formulas: {
        x: 'r*0.32*cbrt(pow(3.12*u, 2) - 7)',
        y: 'r*u',
        z: '0'
      },
      params: { r: 1, rIn: 0.52, amp: 1, f: 1, n: 3, m: 2, k: 1, K: 6, orderN: 19, a: 0.5, b: 3, phaseDeg: 0 },
      hints: { sliceGrid: true, cutaway: false, magnifier: false, twinMode: 'conjugate', strobeN: true },
      note: 'Short Weierstrass cubic y² = x³ + 7 (secp256k1\'s real locus) on the 2D slice! Conjugate Twin P̄ = (x, −y) is literal elliptic-curve point negation P + (−P) = O along the vertical chord.'
    },
    {
      name: 'Morlet Wavelet Ψ(x) — 2D Gabor Slice (§4.2)',
      group: '2D f(x) Slice Inside Sphere',
      formulas: {
        x: 'r*u',
        y: 'r*morlet(u*3.5, 6*f, phase, 1)',
        z: '0'
      },
      params: { r: 1, rIn: 0.45, amp: 1, f: 1.5, n: 3, m: 2, k: 1, K: 6, a: 0.5, b: 3, phaseDeg: 0 },
      hints: { sliceGrid: true, cutaway: false, magnifier: true, magFocus: 'playhead', twinMode: 'conjugate' },
      note: 'Real Morlet atom Ψ(x) = cos(ω₀x + φ)·e^(−x²/2) on the 2D f(x) grid. Sweep the Phase slider to watch the sine carrier glide through the stationary Gaussian window.'
    },
    {
      name: 'Analytic Morlet ψ(t) — 3D Conjugate Helix (§4.4)',
      group: '3D Wavelets & Knots',
      formulas: {
        x: 'r*morlet(u*3.2, 6*f, phase, 1)',
        y: 'r*morletIm(u*3.2, 6*f, phase, 1)',
        z: 'r*u'
      },
      params: { r: 1, rIn: 0.45, amp: 1, f: 1.5, n: 3, m: 2, k: 1, K: 6, a: 0.5, b: 3, phaseDeg: 0 },
      hints: { sliceGrid: false, cutaway: true, magnifier: false, twinMode: 'conjugate' },
      note: 'Complex analytic Morlet ψ(t) spiraling along Z. With Conjugate Twin (P̄) active, the counter-rotating helix cancels its imaginary Y part so (ψ + ψ̄)/2 collapses into the real Morlet wave!'
    },
    {
      name: 'Fourier Square Wave — Odd Harmonics K',
      group: '2D f(x) Slice Inside Sphere',
      formulas: {
        x: 'r*u',
        y: 'r*0.78*fourierSquare(PI*f*2*u + phase, K)',
        z: '0'
      },
      params: { r: 1, rIn: 0.45, amp: 1, f: 1, n: 3, m: 2, k: 1, K: 5, a: 0.5, b: 3, phaseDeg: 0 },
      hints: { sliceGrid: true, cutaway: false, magnifier: true, magFocus: 'playhead', twinMode: 'off' },
      note: 'Additive synthesis of odd sine harmonics 1/(2k+1). Slide K from 0 (fundamental sine) up to 14 to sculpt a square wave and zoom into the Gibbs ringing ears.'
    },
    {
      name: 'Ellipse — Sub-Carrier Inside Shell',
      group: 'Sphere & Carrier',
      formulas: {
        x: 'r*0.82*cos(TAU*f*t+phase)',
        y: 'r*0.52*sin(TAU*f*t+phase)',
        z: '0'
      },
      params: { r: 1, rIn: 0.55, amp: 1, f: 1, n: 3, m: 2, k: 1, K: 6, a: 0.5, b: 3, phaseDeg: 0 },
      hints: { sliceGrid: true, cutaway: false, magnifier: false, twinMode: 'both' },
      note: 'Unequal quadrature amplitudes trace an ellipse oscillating between the inner cavity r and outer shell R — watch the zone readout alternate between Shell and Cavity.'
    },
    {
      name: 'Lissajous 3D Harmonic Knot (n : m : k)',
      group: '3D Wavelets & Knots',
      formulas: {
        x: 'r*0.75*sin(TAU*n*t)',
        y: 'r*0.75*sin(TAU*m*t+phase)',
        z: 'r*0.55*cos(TAU*k*t)'
      },
      params: { r: 1, rIn: 0.45, amp: 1, f: 1, n: 3, m: 2, k: 4, K: 6, orderN: 19, a: 0.5, b: 3, phaseDeg: 90 },
      hints: { sliceGrid: false, cutaway: false, magnifier: false, twinMode: 'antipodal', strobeN: false },
      note: 'Integer musical frequency ratios n:m:k weave a closed 3D harmonic knot through the sphere, poking outside R (coral) at simultaneous peaks.'
    },
    {
      name: 'Finite Field Torus Knot — Order N Cavity',
      group: '3D Wavelets & Knots',
      formulas: {
        x: 'rIn*(0.62+0.32*cos(TAU*m*t+phase))*cos(TAU*n*t)',
        y: 'rIn*0.32*sin(TAU*m*t+phase)',
        z: 'rIn*(0.62+0.32*cos(TAU*m*t+phase))*sin(TAU*n*t)'
      },
      params: { r: 1.55, rIn: 0.85, amp: 1, f: 1, n: 3, m: 5, k: 1, K: 6, orderN: 19, a: 0.5, b: 3, phaseDeg: 0 },
      hints: { sliceGrid: false, cutaway: false, magnifier: false, twinMode: 'antipodal', strobeN: true },
      note: 'Modulo wrapping glues a 2D finite field into a 3D Torus nested strictly inside the red N-cavity (|P| < r). Order N Strobe quantizes it into N cyclic generator steps (try prime N=19 vs composite N=12)!'
    },
    {
      name: 'Sawtooth Wrap — Finite Modulo (±1)',
      group: 'Sentinels & Discontinuities',
      formulas: {
        x: 'r*saw(TAU*f*t+phase)',
        y: 'r*saw(TAU*f*t+phase+PI/2)',
        z: '0'
      },
      params: { r: 1, rIn: 0.45, amp: 1, f: 1, n: 3, m: 2, k: 1, K: 6, a: 0.5, b: 3, phaseDeg: 0 },
      hints: { sliceGrid: true, cutaway: false, magnifier: false, twinMode: 'antipodal' },
      note: 'saw() wraps cleanly at ±1 via modulo — a finite phase reset with zero division-by-zero, just like a hardware/VST wavetable accumulator.'
    },
    {
      name: 'TANGENT — The #DIV/0! Sentinel Explosion',
      group: 'Sentinels & Discontinuities',
      formulas: {
        x: 'r*sin(TAU*t)',
        y: 'r*tan(TAU*t)',
        z: '0'
      },
      params: { r: 1, rIn: 0.45, amp: 1, f: 1, n: 3, m: 2, k: 1, K: 6, a: 0.5, b: 3, phaseDeg: 0 },
      hints: { sliceGrid: true, cutaway: false, magnifier: false, twinMode: 'antipodal' },
      note: 'tan() explodes past the sphere toward ±∞ at vertical asymptotes, whereas pure quadrature sphere geometry stays bounded forever.'
    },
    {
      name: 'Four-Bit Orbit — 1000 (8) ↔ 0001 (1) Palindrome & Quadray',
      group: 'Sphere & Carrier',
      formulas: {
        x: 'r*cos(TAU*f*t+phase)',
        y: 'r*sin(TAU*f*t+phase)',
        z: '0'
      },
      params: { r: 1, rIn: 0.45, amp: 1, f: 1, n: 3, m: 2, k: 1, K: 6, orderN: 16, a: 0.5, b: 3, phaseDeg: 0 },
      hints: { sliceGrid: true, cutaway: false, magnifier: false, twinMode: 'both', fourBitOrbit: true },
      note: 'Four-Bit Orbit: 1000 (8) and 0001 (1) binary palindrome duality! In Front f(x) view, 8 and 1 orbit in harmony across the sphere; in Top XZ view, 1111/F (max nibble 15) crowns the center (0000 at bottom) while the 8 ↔ 1 equatorial orbit continues around the inscribed Quadray Tetrahedron.'
    },
    {
      name: 'Custom Formula Patch',
      group: 'Custom',
      formulas: null,
      params: null,
      hints: null,
      note: 'Free modular patch bay — write any x(t), y(t), z(t) expression using u, r, rIn, K, a, b, weierstrass, morlet, fourierSquare, sin, cos, etc.'
    }
  ];

  window.Harmony.Presets = { list: PRESETS };
})();
