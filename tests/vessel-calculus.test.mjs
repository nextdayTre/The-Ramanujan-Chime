// Edge-case & theorem verification suite for The Vessel Calculus (docs/VESSEL-CALCULUS.md).
// Tests: spatial derivative ladder V^(0..4), unit-time modulation dV/V, boundary singularities
// (eta -> 0+, eta -> 1-), hypergeometric Lock-V series, exact 3rd-order cubic perturbation,
// telescoping (N+1)V multitudes, base-8 Sentinel shells on secp256k1, Cuban/Taxicab 1729 locks,
// RX 11 Time-Zoom BigInt modular phase entry, parallel perspective bus coherence & null poles,
// bitwise NOT vs Null +1 bridge, and deterministic ModMatrix analytical rate checks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { engine: Engine } = require('../js/engine.js');
const ModMatrix = require('../js/mod-matrix.js');

globalThis.Harmony = globalThis.Harmony || {};
globalThis.Harmony.engine = Engine;

const close = (actual, expected, eps = 1e-9, label = '') =>
  assert.ok(Math.abs(actual - expected) <= eps, `${label} expected ${expected}, got ${actual}`);

test('Vessel Calculus §1: Spatial derivative ladder V^(0..4) derives Jacobian, Archimedes ring, Triad & ±8π null', () => {
  const R = 1.2, rIn = 0.6; // eta = 0.5, alpha = 2.0, delta = 0.6
  const vc = Engine.vesselCalculus({ r: R, rIn });

  // 0th derivative: exact shell volume
  close(vc.V, (4 / 3) * Math.PI * (R ** 3 - rIn ** 3), 1e-12, 'V');

  // 1st derivative: surface areas, Jacobian eta^2, and Archimedes ring = (dR + dr) / 4
  close(vc.d1.dR, 4 * Math.PI * R * R, 1e-12, 'dV/dR');
  close(vc.d1.dr, -4 * Math.PI * rIn * rIn, 1e-12, 'dV/dr');
  close(vc.d1.jacobian, -vc.d1.dr / vc.d1.dR, 1e-12, 'Jacobian = -d1.dr / d1.dR');
  close(vc.d1.archimedesRing, Math.PI * (R * R - rIn * rIn), 1e-12, 'Archimedes ring');

  // 2nd derivative: ratio = alpha, sum/(8π) = wall thickness, reciprocals = full 1/R : 1/r : 1/Delta triad
  close(vc.d2.ratioAlpha, R / rIn, 1e-12, 'alpha from V^(2)');
  close(vc.d2.wallDelta, R - rIn, 1e-12, 'wall delta from V^(2)');
  close(vc.d2.triad.outer, 1 / R, 1e-12, 'triad outer');
  close(vc.d2.triad.inner, 1 / rIn, 1e-12, 'triad inner');
  close(vc.d2.triad.wall, 1 / (R - rIn), 1e-12, 'triad wall');

  // 3rd & 4th derivatives: pure ±8π antipodal null and exact polynomial closure
  close(vc.d3.dR3, 8 * Math.PI, 1e-12, 'd3R');
  close(vc.d3.dr3, -8 * Math.PI, 1e-12, 'd3r');
  assert.equal(vc.d3.antipodalSum, 0);
  assert.equal(vc.d4, 0);
});

test('Vessel Calculus §2: Master unit-time law dV/V = 3(dR/R) - (3η²/(1-η³))dη, exact 3rd-order ΔV & hypergeometric Lock-V', () => {
  const R = 1.0, rIn = 0.5, eta = 0.5;

  // Regime 1: Lock V equilibrium (dR = eta^2 * dr) => dV === 0 and Re(complexFreq) === 0
  const dr = 0.2;
  const dR = (eta * eta) * dr;
  const locked = Engine.vesselCalculus({ r: R, rIn }, { dR, dr, dTheta: Math.PI * 2 });
  assert.equal(locked.dynamics.isLockedV, true);
  close(locked.dynamics.dV, 0, 1e-12, 'Lock V dV = 0');
  close(locked.dynamics.dVOverV, 0, 1e-12, 'Lock V dV/V = 0');
  close(locked.dynamics.complexFreq.re, 0, 1e-12, 'pure imaginary axis under Lock V');
  close(locked.dynamics.complexFreq.im, Math.PI * 2, 1e-12, 'angular freq preserved');

  // Regime 2: Pure Sentinel homothetic scaling (dr/r = dR/R => dEta = 0) => dV/V = 3 * dR/R
  const rate = 0.35;
  const homo = Engine.vesselCalculus({ r: R, rIn }, { dR: R * rate, dr: rIn * rate });
  close(homo.dynamics.dEta, 0, 1e-12, 'dEta = 0 under homothetic scaling');
  close(homo.dynamics.shapeRate, 0, 1e-12, 'shapeRate = 0');
  close(homo.dynamics.dVOverV, 3 * rate, 1e-12, 'dV/V = 3 * rate');

  // Regime 3: General modulation verified against central finite difference of ln V(t)
  const gen = Engine.vesselCalculus({ r: 1.3, rIn: 0.65 }, { dR: 0.17, dr: -0.23 });
  const h = 1e-6;
  const vPlus = Math.log(Engine.vesselCalculus({ r: 1.3 + 0.17 * h, rIn: 0.65 - 0.23 * h }).V);
  const vMinus = Math.log(Engine.vesselCalculus({ r: 1.3 - 0.17 * h, rIn: 0.65 + 0.23 * h }).V);
  close(gen.dynamics.dVOverV, (vPlus - vMinus) / (2 * h), 1e-7, 'analytic dV/V matches central FD');

  // Exact 3rd-order cubic perturbation terminates with zero remainder
  const pert = Engine.vesselPerturbation(1.0, 0.45, 0.37, -0.19);
  assert.ok(pert.residual < 1e-12, `exact 3rd-order ΔV residual=${pert.residual}`);

  // Hypergeometric constant-volume series at default eta = 0.45 converges rapidly
  const hyp = Engine.hypergeometricLockV(1.0, 0.45, 6);
  assert.ok(hyp.terms[2].relError < 2e-4, 'k=0..2 within 0.02% at eta=0.45');
  assert.ok(hyp.terms[6].relError < 1e-8, 'k=0..6 within 1e-8 at eta=0.45');
});

test('Edge Case 1: Boundary singularities at eta -> 0+ (solid ball) and eta -> 1- (zero-thickness shell)', () => {
  // Solid ball (rIn = 0): alpha is +Infinity (0x7F800000), dV/V stays finite = 3*dR/R, no NaN leakage
  const solid = Engine.vesselCalculus({ r: 1.0, rIn: 0 }, { dR: 0.25, dr: 0 });
  assert.equal(solid.boundaryState, 'solid_ball');
  assert.equal(solid.alpha, Infinity);
  assert.equal(Engine.bitInspect(solid.alpha).hex, '0x7F800000');
  close(solid.dynamics.dVOverV, 0.75, 1e-12, 'solid ball dV/V = 3*dR/R');
  assert.equal(solid.dynamics.dVOverVSentinel, null);

  // Zero-thickness shell (rIn -> R): sensitivity & dV/V hit clean ±Infinity sentinel while raw dV remains finite!
  const thin = Engine.vesselCalculus({ r: 1.0, rIn: 1.0 }, { dR: 0.1, dr: -0.05 });
  assert.equal(thin.boundaryState, 'thin_shell_sentinel');
  assert.equal(thin.dynamics.sensitivity, Infinity);
  assert.ok(Number.isFinite(thin.dynamics.dV), 'raw dV remains finite at r = R');
  close(thin.dynamics.dV, 4 * Math.PI * (0.1 + 0.05), 1e-12, 'exact finite raw dV at thin-shell boundary');
  assert.equal(thin.dynamics.dVOverV, Infinity);
  assert.equal(thin.dynamics.dVOverVSentinel, '0x7F800000');

  // Inverted polarity (rIn > R): volume flips sign cleanly, flagged without throwing
  const inv = Engine.vesselCalculus({ r: 0.5, rIn: 0.8 });
  assert.equal(inv.boundaryState, 'inverted_polarity');
  assert.equal(inv.invertedPolarity, true);
  assert.ok(inv.V < 0);
});

test('Vessel Calculus §3: Telescoping (N+1)V multitudes, Base-8 Sentinel secp256k1 & Cuban/Taxicab 1729 locks', () => {
  // Telescoping (N+1)V stack: sum of unit-volume shells equals single outer-minus-inner formula
  const N = 1000;
  const stack = Engine.multitudeShell(0, N + 1);
  close(stack.R ** 3, N + 1, 1e-9, 'R^(3) = N + 1');
  // Adding +1V skin thickness matches 1 / (3 * R^2) = V0 / (dV/dR) asymptotically
  assert.ok(Math.abs(stack.deltaNext - stack.d1InverseApprox) / stack.deltaNext < 1e-3);

  // Base-8 Sentinel shell decomposition of secp256k1's 256-bit prime P = 2^256 - 2^32 - 977
  const secp = Engine.initSecp({});
  const oct = Engine.sentinelOctalDecomp(secp.P);
  assert.equal(oct.valid, true);
  assert.equal(oct.outerSigma, 85, '2^256 = 2 * 8^85 => Sentinel sigma = 85');
  assert.equal(oct.outerMultitude, 2, 'leading multitude is 2V');
  assert.equal(oct.cavityDeficit, String((1n << 32n) + 977n));
  close(oct.etaLog2, (32 - 256) / 3, 1e-4, 'secp256k1 cavity ratio log2(eta) ≈ -74.67');

  // Exact BigInt reconstruction from both unsigned and balanced signed base-8 digits
  let reconUnsigned = 0n;
  for (let i = oct.octalDigits.length - 1; i >= 0; i--) {
    reconUnsigned = reconUnsigned * 8n + BigInt(oct.octalDigits[i]);
  }
  assert.equal(reconUnsigned, secp.P, 'unsigned octal shells reconstruct secp256k1.P bit-exact');

  let reconSigned = 0n;
  for (let i = oct.signedDigits.length - 1; i >= 0; i--) {
    assert.ok(oct.signedDigits[i] >= -4 && oct.signedDigits[i] <= 4);
    reconSigned = reconSigned * 8n + BigInt(oct.signedDigits[i]);
  }
  assert.equal(reconSigned, secp.P, 'balanced signed octal shells reconstruct secp256k1.P bit-exact');

  // Unit-wall Cuban primes & honest boundary for non-Cuban primes
  for (const [p, expR, expInner] of [[7, 2, 1], [19, 3, 2], [37, 4, 3], [61, 5, 4], [127, 7, 6]]) {
    const chk = Engine.cubeLatticeCheck(p);
    assert.equal(chk.isCubanPrime, true, `${p} is a Cuban prime`);
    assert.equal(chk.R, expR);
    assert.equal(chk.r, expInner);
  }
  assert.equal(Engine.cubeLatticeCheck(91).isUnitWallShell, true, '91 = 6^3 - 5^3 is a unit-wall shell');
  assert.equal(Engine.cubeLatticeCheck(91).isCubanPrime, false, '91 = 7*13 is composite, not Cuban prime');
  assert.equal(Engine.cubeLatticeCheck(23).isUnitWallShell, false, '23 is prime but not a Cuban difference of cubes');

  // Taxicab 1729 Lock-V twin vessels share identical volume V = (4/3)*pi*(91/216)
  const tax = Engine.cubeLatticeCheck(1729);
  const vA = Engine.vesselCalculus({ r: tax.taxicabTwins.shellA.R, rIn: tax.taxicabTwins.shellA.rIn }).V;
  const vB = Engine.vesselCalculus({ r: tax.taxicabTwins.shellB.R, rIn: tax.taxicabTwins.shellB.rIn }).V;
  close(vA, vB, 1e-14, 'Taxicab 1729 twin shells have identical Lock-V volume');
});

test('Edge Case 3: RX 11 Time-Zoom exact BigInt modular phase entry on 256-bit secp256k1 prime', () => {
  const secp = Engine.initSecp({});
  const P = secp.P; // 2^256 - 2^32 - 977

  // Dyadic anchor t0 = 5 / 2^256 => M * t0 = 5 * P / 2^256 => frac = (5 * P mod 2^256) / 2^256
  // Note: 5 * P = 5*2^256 - 5*(2^32 + 977), so exact modular remainder is 2^256 - 5*(2^32 + 977)
  // which sits extremely close to 1.0 (zero precision collapse!).
  const micro = Engine.modularZoomPhase(P, 5n, 256, -256, 0.25);
  assert.equal(micro.regime, 'micro');
  close(micro.cyclesInView, 1.0, 1e-12, 'At zoom T = 2^-256, 256-bit prime fills ~1 cycle');
  assert.ok(micro.entryPhase > 0.999999999 && micro.entryPhase < 1.0, 'exact BigInt mod phase avoids float64 cancellation');
  close(micro.phaseAtTau, (micro.entryPhase + 0.25) % 1, 1e-12, 'phase advances cleanly across tau');

  // Exact check on smaller shift where exact decimal is known: t0 = 1/8 (shift 3), P mod 8 = (2^256 - 2^32 - 977) mod 8 = (-977 mod 8) = 7 => entryPhase = 7/8 = 0.875!
  const octPhase = Engine.modularZoomPhase(P, 1n, 3, -256, 0);
  close(octPhase.entryPhase, 0.875, 1e-15, 'P mod 8 === 7 => frac(P * 1/8) === 0.875 exact!');

  // Sub-clef zoom T = 2^-32: macro beyond horizon, yet exact strobe residual = (2^32 - 977)/2^32 preserved!
  const subClef = Engine.modularZoomPhase(P, 0n, 0, -32, 0);
  assert.equal(subClef.regime, 'macro_beyond_horizon');
  close(subClef.strobeResidualFrac, (4294967296 - 977) / 4294967296, 1e-12, 'exact -977 residual preserved at T = 2^-32');
});

test('Edge Case 2 & §5: Parallel perspective bus coherence, Parseval energy, linear delta & exact bus-null pole guard', () => {
  // 1. Orthogonal resolution of identity (E+ + E- = I) & Parseval conservation |E+|^2 + |E-|^2 = V^2
  const baseSend = { R: 1.15, rIn: 0.55, dR: 0.12, dr: -0.07, theta: 0.9, dTheta: 1.7 };
  const dry = Engine.parallelVesselBus([{ ...baseSend, op: 'P' }]);
  const realProj = Engine.parallelVesselBus([{ ...baseSend, op: 'real' }]);
  const imagProj = Engine.parallelVesselBus([{ ...baseSend, op: 'imag' }]);
  const recon = Engine.parallelVesselBus([{ ...baseSend, op: 'real' }, { ...baseSend, op: 'imag' }]);
  close(recon.B.re, dry.B.re, 1e-12, 'E+ + E- reconstructs Re(P)');
  close(recon.B.im, dry.B.im, 1e-12, 'E+ + E- reconstructs Im(P)');
  close(realProj.Vbus ** 2 + imagProj.Vbus ** 2, dry.Vbus ** 2, 1e-11, 'Parseval conservation V^2');

  // 2. Linear delta coherence across K=3 modulated parallel sends verified against finite-difference
  const sendsAt = (dt) => [
    { R: 1.1 + 0.14 * dt, rIn: 0.45 + 0.05 * dt, dR: 0.14, dr: 0.05, theta: 0.4 + 2.1 * dt, dTheta: 2.1, op: 'P', weight: 1.0 },
    { R: 0.95 - 0.08 * dt, rIn: 0.30 + 0.11 * dt, dR: -0.08, dr: 0.11, theta: 1.2 - 1.3 * dt, dTheta: -1.3, op: 'conj', weight: 0.7 },
    { R: 0.80 + 0.04 * dt, rIn: 0.25 - 0.02 * dt, dR: 0.04, dr: -0.02, theta: 2.0 + 0.9 * dt, dTheta: 0.9, op: '-P', weight: 0.5 }
  ];
  const bus0 = Engine.parallelVesselBus(sendsAt(0));
  const h = 1e-6;
  const busP = Engine.parallelVesselBus(sendsAt(h));
  const busM = Engine.parallelVesselBus(sendsAt(-h));
  close(bus0.dB.re, (busP.B.re - busM.B.re) / (2 * h), 1e-7, 'parallel bus dB.re matches central FD');
  close(bus0.dB.im, (busP.B.im - busM.B.im) / (2 * h), 1e-7, 'parallel bus dB.im matches central FD');
  assert.equal(bus0.validity, 'coherent');

  // 3. Exact Bus-Null crossing: P and -P cancel at t=0 while wet send moves (dR != 0) =>
  //    isBusNull=true, validity='null_crossing_pole', raw dB stays strictly finite & exact, no NaN!
  const nullBus = Engine.parallelVesselBus([
    { R: 1.0, rIn: 0.5, dR: 0.2, dr: 0, theta: 0.5, dTheta: 1.0, op: 'P' },
    { R: 1.0, rIn: 0.5, dR: 0.0, dr: 0, theta: 0.5, dTheta: 1.0, op: '-P' }
  ]);
  assert.equal(nullBus.isBusNull, true);
  assert.equal(nullBus.validity, 'null_crossing_pole');
  assert.equal(nullBus.sentinelHex, '0x7F800000');
  assert.ok(Number.isFinite(nullBus.dB.re) && Number.isFinite(nullBus.dB.im), 'raw bus delta stays finite at exact null');
  assert.ok(Math.hypot(nullBus.dB.re, nullBus.dB.im) > 1.0, 'wet-minus-dry delta survives cancellation');

  // 4. Inverted polarity on purely real scalar bus sum (V_bus < 0)
  const negReal = Engine.parallelVesselBus([
    { R: 0.8, rIn: 0.2, theta: 0, op: 'P' },
    { R: 1.0, rIn: 0.2, theta: 0, op: '-P' }
  ]);
  assert.equal(negReal.invertedPolarity, true);
  assert.ok(negReal.B.re < 0);

  // 5. Bitwise NOT (~P) vs Two's-Complement Null (-P) exact +1 unit quantum across 4b, 64b, 256b
  for (const [v, w] of [[8n, 4], [0xA5n, 8], [0x0123456789ABCDEFn, 64], [Engine.initSecp({}).P, 256]]) {
    const br = Engine.bitwiseNotNullBridge(v, w);
    assert.equal(br.saturated, true, `${w}b: P + (~P) === 2^N - 1`);
    assert.equal(br.exactNull, true, `${w}b: P + (-P) === 0 mod 2^N`);
    assert.equal(br.unitDelta, true, `${w}b: (-P) - (~P) === +1 mod 2^N`);
  }
});

test('Edge Case 4: Deterministic ModMatrix LFO -> Cavity r under Lock V satisfies dV/dt === 0 analytically & numerically', () => {
  const st = {
    r: 1.0, rIn: 0.5, archimedesZNorm: 0, orderN: 19, phaseRad: 0,
    f: 1, amp: 1, K: 6, a: 0.5, b: 3, n: 3, m: 2, k: 1,
    lockVolume: true,
    lockedR0: Engine.cbrt(1.0 ** 3 - 0.5 ** 3),
    archimedesAuto: true,
    toggles: { animate: false, strobeN: false }
  };

  ModMatrix.clearRoutes();
  ModMatrix.captureBase(st);
  const depth = 0.2;
  ModMatrix.addRoute('lfo1', 'rIn', 'linear', depth);

  // 1. Exact analytical LFO1 (sine, ratio=1) derivative at frozen ?static=1 playhead t0 = 0.125:
  //    rIn(t) = base + depth * span * sin(2*pi*t) => dr/dt = depth * span * 2*pi * cos(2*pi*t)
  const t0 = 0.125;
  ModMatrix.evaluate(st, t0, 0);
  const r0Now = st.r, rIn0Now = st.rIn;
  const spanRIn = (ModMatrix.TARGETS.rIn.max - ModMatrix.TARGETS.rIn.min) * 0.5;
  const drAnalytic = depth * spanRIn * (2 * Math.PI) * Math.cos(2 * Math.PI * t0);
  const etaNow = rIn0Now / r0Now;
  const dRAnalytic = (etaNow * etaNow) * drAnalytic;
  const vcAnalytic = Engine.vesselCalculus({ r: r0Now, rIn: rIn0Now }, { dR: dRAnalytic, dr: drAnalytic });
  assert.equal(vcAnalytic.dynamics.isLockedV, true);
  close(vcAnalytic.dynamics.dV, 0, 1e-12, 'analytical LFO + Lock V gives exact dV/dt = 0');

  // 2. Central finite difference across ModMatrix.evaluate at t0 ± h matches analytical rates (catches micro-step lag!)
  const h = 1e-5;
  ModMatrix.evaluate(st, t0 - h, 0);
  const rMinus = st.r, rInMinus = st.rIn;
  ModMatrix.evaluate(st, t0 + h, 0);
  const rPlus = st.r, rInPlus = st.rIn;

  const dR = (rPlus - rMinus) / (2 * h);
  const dr = (rInPlus - rInMinus) / (2 * h);
  close(dr, drAnalytic, 1e-6, 'ModMatrix FD dr/dt agrees with analytical LFO derivative');
  close(dR, dRAnalytic, 1e-6, 'ModMatrix FD dR/dt agrees with Lock-V Jacobian rate');
  const vcFd = Engine.vesselCalculus({ r: r0Now, rIn: rIn0Now }, { dR, dr });
  assert.equal(vcFd.dynamics.isLockedV, true, 'Lock-V ModMatrix sweep stays on exact dV/dt = 0 manifold');
  close(vcFd.dynamics.dVOverV, 0, 1e-6, 'dV/V = 0 under live ModMatrix Lock-V modulation');

  ModMatrix.clearRoutes();
});

test('Stage 2: Engine.tunerReadout computes exact Ratio locks, Chromatic Note + Sentinel σ without underflow, and V̇/V rate tags', () => {
  // 1. Exact 2:1 Octave Lock (R=1.0, rIn=0.5) with Lock V => 0.0¢ locked & V̇=0 tag
  const oct = Engine.tunerReadout({ r: 1.0, rIn: 0.5, f: 1, phaseRad: 0, sentinelOctave: 0, lockVolume: true }, 0, { mode: 'ratio', dR: 0.05, dr: 0.2 });
  assert.equal(oct.mode, 'ratio');
  assert.equal(oct.identity, '2:1');
  assert.equal(oct.locked, true);
  close(oct.cents, 0, 1e-4, '2:1 octave has 0¢ detune');
  close(oct.needleNorm, 0, 1e-4, 'needle dead-center');
  assert.equal(oct.saturated, false);
  assert.equal(oct.vessel.rateTag, 'V̇=0');

  // 2. Default vessel (R=1.0, rIn=0.45): +182.4¢ off 2:1 => needle saturated high, not locked
  const def = Engine.tunerReadout({ r: 1.0, rIn: 0.45, f: 1, phaseRad: 0, sentinelOctave: 0 }, 0, { mode: 'ratio' });
  assert.equal(def.locked, false);
  assert.equal(def.saturated, true);
  assert.equal(def.satDir, 1);
  assert.equal(def.needleNorm, 1);

  // 3. Chromatic Note mode at default (R=1, f=1, phase=0, sigma=0) => G2 +0¢; at Sentinel σ=+50 => G-48 +0¢ (zero underflow!)
  const g2 = Engine.tunerReadout({ r: 1.0, rIn: 0.45, f: 1, phaseRad: 0, sentinelOctave: 0 }, 0, { mode: 'note' });
  assert.equal(g2.identity, 'G2');
  assert.equal(g2.locked, true);
  assert.equal(g2.cents, 0);

  const deepSent = Engine.tunerReadout({ r: 1.0, rIn: 0.45, f: 1, phaseRad: 0, sentinelOctave: 50 }, 0, { mode: 'note' });
  assert.equal(deepSent.identity, 'G-48');
  assert.equal(deepSent.locked, true);
  assert.equal(deepSent.cents, 0);
  assert.equal(deepSent.note.octave, -48);
});

test('Stage 3: Diatonic modal Conjugate (P̄) involutions verify Dorian palindrome & Ionian <-> Phrygian', () => {
  const dor = Engine.diatonicModeConjugate('dorian');
  assert.equal(dor.isPalindrome, true);
  assert.equal(dor.conjugateMode, 'dorian');
  assert.deepEqual(dor.steps, dor.reversedSteps);

  const ion = Engine.diatonicModeConjugate('ionian');
  const phr = Engine.diatonicModeConjugate('phrygian');
  assert.equal(ion.conjugateMode, 'phrygian');
  assert.equal(phr.conjugateMode, 'ionian');
  assert.deepEqual(ion.reversedSteps, phr.steps);

  assert.equal(Engine.diatonicModeConjugate('lydian').conjugateMode, 'locrian');
  assert.equal(Engine.diatonicModeConjugate('aeolian').conjugateMode, 'mixolydian');
});

test('Stage 3: Clockwork coupling detects Adler gear-lock vs phase-slip & Osmosis coherence', () => {
  // Two identical in-phase chimes => 100% Osmosis coherence & 2/2 gear lock
  const lockCpl = Engine.clockworkCoupling([
    { key: 'A', r: 1.0, rIn: 0.5, f: 1, orderN: 12, phaseRad: 0, twinMode: 'both' },
    { key: 'B', r: 1.0, rIn: 0.5, f: 2, orderN: 18, phaseRad: 0, twinMode: 'both' }
  ], 0);
  assert.equal(lockCpl.lockedCount, 2);
  assert.equal(lockCpl.orderGcd, 6);
  assert.equal(lockCpl.orderLcm, 36);
  assert.equal(lockCpl.regime, 'osmosis');
  close(lockCpl.coherence, 1.0, 1e-6, 'in-phase chimes yield 100% osmosis coherence');

  // Detuned second chime (R=1.13 => ~211¢ detuned from 1:1) => Adler phase_slip with nonzero slipRate
  const slipCpl = Engine.clockworkCoupling([
    { key: 'A', r: 1.0, rIn: 0.5, f: 1, orderN: 19, phaseRad: 0, twinMode: 'both' },
    { key: 'B', r: 1.13, rIn: 0.5, f: 1, orderN: 23, phaseRad: 0, twinMode: 'both' }
  ], 0, { couplingK: 15 });
  assert.equal(slipCpl.cavities[1].state, 'phase_slip');
  assert.ok(slipCpl.cavities[1].slipRate > 10, 'detuned cavity slips outside Arnold tongue');
  assert.equal(slipCpl.gearedPairs, 0, 'coprime 19 & 23 act as independent CRT tumblers');
  assert.equal(slipCpl.orderLcm, 19 * 23);
});

test('Stage 3: Pollard-ρ 1x/2x cycle-lock detector catches hexagonal poles (t=1/6) & composite Order-N factors', () => {
  // Continuous 1x vs 2x lock: sin(4*pi*t) === sin(2*pi*t) at t = 0, 1/6, 1/2, 5/6
  for (const tLock of [0, 1 / 6, 0.5, 5 / 6]) {
    const rho = Engine.pollardRhoSlice({ r: 1, rIn: 0.5, orderN: 19 }, tLock);
    assert.equal(rho.continuousLock, true, `1x/2x tortoise-hare locks at t=${tLock}`);
    assert.ok(rho.continuousGap < 1e-5);
  }
  // Midpoint t = 0.25: sin(pi/2)=1 vs sin(pi)=0 => gap = 1.0 (not locked)
  const mid = Engine.pollardRhoSlice({ r: 1, rIn: 0.5, orderN: 19 }, 0.25);
  assert.equal(mid.continuousLock, false);
  close(mid.continuousGap, 1.0, 1e-5, 'tortoise-hare gap=1 at t=0.25');

  // Composite Order N = 15 at t = 1/3 => tortoise=5, hare=10 => |10-5|=5 => gcd(5, 15)=5 factor hit!
  const comp = Engine.pollardRhoSlice({ r: 1, rIn: 0.5, orderN: 15 }, 1 / 3);
  assert.equal(comp.hasCompositeFactor, true);
  assert.equal(comp.factorHit, 5);
});

test('Stage 4: sliceCalculus2D dimensional descent matches (dR+dr)V/4, exact dA/A & Cavalieri 3D reconstruction', () => {
  const R = 1.25, rIn = 0.55;
  const vc = Engine.vesselCalculus({ r: R, rIn });
  const s2 = Engine.sliceCalculus2D({ r: R, rIn }, { dR: 0.14, dr: -0.09 });

  // A = pi*(R^2 - r^2) === (1/4)*(dR V + dr V) === Archimedes ring!
  close(s2.A, vc.d1.archimedesRing, 1e-12, '2D slice seed equals 1st directional derivative of 3D seed');
  close(s2.d1.dR, 2 * Math.PI * R, 1e-12, 'dA/dR = 2*pi*R');
  close(s2.d1.dr, -2 * Math.PI * rIn, 1e-12, 'dA/dr = -2*pi*r');
  assert.equal(s2.d2.antipodalSum, 0, '2nd derivative +-TAU antipodal null');
  assert.equal(s2.d3, 0);

  // Analytic dA/A = 2(dR/R) - (2η/(1-η²))dη matches central finite difference
  const h = 1e-6;
  const aP = Math.log(Engine.sliceCalculus2D({ r: R + 0.14 * h, rIn: rIn - 0.09 * h }).A);
  const aM = Math.log(Engine.sliceCalculus2D({ r: R - 0.14 * h, rIn: rIn + 0.09 * h }).A);
  close(s2.dynamics.dAOverA, (aP - aM) / (2 * h), 1e-7, 'analytic dA/A matches FD');

  // Cavalieri / Radon vertical integral of A_ring(z) over [-R, +R] reconstructs exact 3D volume V!
  const cav = Engine.cavalieriVolume(R, rIn, 256);
  assert.ok(cav.relError < 1e-5, `Cavalieri integral reconstructs 3D V (relErr=${cav.relError})`);
});

test('Stage 4: crossChimeSlice computes exact -Infinity dB null on identical chimes & cross-phase coherence', () => {
  const stA = {
    r: 1, rIn: 0.5, amp: 1, f: 1, n: 3, m: 2, k: 1, K: 6, orderN: 19, a: 0.5, b: 3, phaseRad: 0,
    formulas: { x: 'r*cos(TAU*f*t+phase)', y: 'r*sin(TAU*f*t+phase)', z: '0' }
  };

  // Identical chimes -> exact 0x00000000 null (-Infinity dB) & +1.0 coherence
  const same = Engine.crossChimeSlice(stA, stA, 0.25, { bins: 64 });
  assert.equal(same.isExactNull, true);
  assert.equal(same.nullDb, -Infinity);
  assert.equal(same.peakResidualBits.hex, '0x00000000');
  close(same.crossCoherence, 1.0, 1e-5, 'identical chimes have +1.0 coherence');

  // 90° quadrature shift -> coherence ≈ 0, nonzero propagation residual
  const quad = Engine.crossChimeSlice(stA, Object.assign({}, stA, { phaseRad: Math.PI / 2 }), 0, { bins: 64 });
  assert.equal(quad.isExactNull, false);
  close(quad.crossCoherence, 0.0, 1e-4, '90° quadrature chimes have 0 cross-coherence');

  // 180° antipodal shift -> coherence ≈ -1.0, sum cancels while diff doubles!
  const anti = Engine.crossChimeSlice(stA, Object.assign({}, stA, { phaseRad: Math.PI }), 0, { bins: 64 });
  close(anti.crossCoherence, -1.0, 1e-4, '180° antipodal chimes have -1.0 coherence');
});

test('Stage 4: createViscoelasticTank is CFL-stable, dissipates under viscosity & refracts across cavity ring', () => {
  const tank = Engine.createViscoelasticTank({ size: 48 });

  // 1. Zero-input stays identically zero
  tank.step({ eta: 0.5, viscosity: 0.03, refractive: true, boundary: 'osmosis' });
  assert.equal(tank.metrics(0.5).energyTotal, 0);

  // 2. Drop impulse at center -> energy stays strictly finite (no CFL blow-up) & decays under viscosity
  tank.injectPulse(0, 0, 1.2, 0.1);
  const eStart = tank.metrics(0.5).energyTotal;
  assert.ok(eStart > 0.1);

  for (let s = 0; s < 120; s++) {
    tank.step({ eta: 0.5, viscosity: 0.035, refractive: true, boundary: 'wavefold' });
  }
  const mAfter = tank.metrics(0.5);
  assert.ok(Number.isFinite(mAfter.energyTotal) && Number.isFinite(mAfter.peakAbs), 'CFL-stable across 120 wavefold steps');
  assert.ok(mAfter.energyTotal < eStart, 'viscoelastic damping strictly dissipates free-decay energy');
  assert.ok(mAfter.transmissionRatio > 0.05, 'energy propagates across cavity ring into outer shell');

  // 3. Refractive two-medium wave speed differs measurably from uniform speed
  const tankRef = Engine.createViscoelasticTank({ size: 40 });
  const tankUni = Engine.createViscoelasticTank({ size: 40 });
  tankRef.injectPulse(0, 0, 1.0, 0.1);
  tankUni.injectPulse(0, 0, 1.0, 0.1);
  for (let k = 0; k < 25; k++) {
    tankRef.step({ eta: 0.5, viscosity: 0.01, refractive: true, boundary: 'osmosis' });
    tankUni.step({ eta: 0.5, viscosity: 0.01, refractive: false, boundary: 'osmosis' });
  }
  const slRef = tankRef.centerSlice().disp;
  const slUni = tankUni.centerSlice().disp;
  let maxDelta = 0;
  for (let i = 0; i < slRef.length; i++) maxDelta = Math.max(maxDelta, Math.abs(slRef[i] - slUni[i]));
  assert.ok(maxDelta > 0.01, `refractive c_in=alpha*c_out produces distinct wavefield (maxDelta=${maxDelta})`);
});

test('Stage 4b-1: All 25 real Y_l^m (l=0..4) are orthonormal on S^2 (625 inner products) & Y3,-2 peaks on Quadray vertices', () => {
  // Exact 6-point Gauss-Legendre quadrature on [-1, 1] (exact up to polynomial degree 11 >= 8)
  const glNodes = [
    -0.9324695142031521, -0.6612093864662645, -0.2386191860831969,
     0.2386191860831969,  0.6612093864662645,  0.9324695142031521
  ];
  const glWeights = [
    0.1713244923791704, 0.3607615730481386, 0.4679139345726910,
    0.4679139345726910, 0.3607615730481386, 0.1713244923791704
  ];
  const nPhi = 12;
  const dPhi = (2 * Math.PI) / nPhi;

  const gram = new Float64Array(25 * 25);
  const basis = new Float32Array(25);
  for (let ti = 0; ti < glNodes.length; ti++) {
    const w = glNodes[ti];
    const sinT = Math.sqrt(Math.max(0, 1 - w * w));
    const wt = glWeights[ti] * dPhi;
    for (let pi = 0; pi < nPhi; pi++) {
      const phi = pi * dPhi;
      const x = sinT * Math.cos(phi);
      const z = sinT * Math.sin(phi);
      Engine.sphericalHarmonicBasis25(x, w, z, basis);
      for (let a = 0; a < 25; a++) {
        for (let b = 0; b < 25; b++) {
          gram[a * 25 + b] += wt * basis[a] * basis[b];
        }
      }
    }
  }

  let maxDiagErr = 0, maxOffErr = 0;
  for (let a = 0; a < 25; a++) {
    for (let b = 0; b < 25; b++) {
      const val = gram[a * 25 + b];
      if (a === b) maxDiagErr = Math.max(maxDiagErr, Math.abs(val - 1));
      else maxOffErr = Math.max(maxOffErr, Math.abs(val));
    }
  }
  assert.ok(maxDiagErr < 1e-5, `all 25 Y_l^m have unit L2 norm on S^2 (maxDiagErr=${maxDiagErr})`);
  assert.ok(maxOffErr < 1e-5, `all 600 off-diagonal Y_l^m pairs are orthogonal (maxOffErr=${maxOffErr})`);

  // Quadray octupole Y3,-2 proportional to x*y*z hits identical positive maxima on all 4 regular tetrahedron vertices
  const s = 1 / Math.sqrt(3);
  const expectedPeak = 0.5 * Math.sqrt(105 / Math.PI) * (s * s * s);
  const quadVerts = [[s, s, s], [s, -s, -s], [-s, s, -s], [-s, -s, s]];
  for (const [qx, qy, qz] of quadVerts) {
    close(Engine.sphericalHarmonicReal(3, -2, qx, qy, qz), expectedPeak, 1e-6, 'Y3,-2 Quadray vertex peak');
  }
  // Dual (antipodal) tetrahedron vertex hits exact negative peak
  close(Engine.sphericalHarmonicReal(3, -2, -s, -s, -s), -expectedPeak, 1e-6, 'antipodal Quadray vertex negates Y3,-2');
});

test('Stage 4b-1: sphericalHarmonicSpectrum & shellMultipoleTransfer enforce exact eta^l (6*l dB/oct) filter + Zoom-Unpack', () => {
  const st = {
    r: 1, rIn: 0.5, amp: 1, f: 1, n: 3, m: 2, k: 1, K: 6, orderN: 19, a: 0.5, b: 3, phaseRad: 0,
    formulas: { x: 'r*cos(TAU*t)', y: 'r*sin(TAU*t)*cos(TAU*2*t)', z: 'r*sin(TAU*t)*sin(TAU*2*t)' }
  };
  const spec = Engine.sphericalHarmonicSpectrum(st, { maxL: 4, samples: 256 });
  assert.equal(spec.bandCount, 25);
  assert.ok(spec.totalEnergy > 0.1);
  let sumDeg = 0;
  for (let l = 0; l <= 4; l++) sumDeg += spec.degreeEnergy[l];
  close(sumDeg, spec.totalEnergy, 1e-4, 'degree energies partition total SH energy');

  // Exact T_l(eta) = eta^l transfer at eta = 0.5 -> [1, 0.5, 0.25, 0.125, 0.0625] = 0, -6, -12, -18, -24 dB!
  const flat = new Float32Array(25).fill(1.0);
  const tr = Engine.shellMultipoleTransfer(flat, 0.5, 0);
  for (let l = 0; l <= 4; l++) {
    close(tr.transferByDegree[l], Math.pow(0.5, l), 1e-6, `T_${l}(0.5) = 0.5^${l}`);
    close(tr.attenuationDbByDegree[l], -6.0205999 * l, 1e-3, `exact 6*l dB/oct rolloff for l=${l}`);
  }
  assert.ok(tr.transmissionRatio > 0 && tr.transmissionRatio < 0.25);

  // Recursive Multipole Zoom-Unpack at sigma = +1 restores 2^(+1*l) toward unity & scales volume by 2^-3 = 1/8
  const unp = Engine.shellMultipoleTransfer(flat, 0.5, 1);
  close(unp.unpackScale, 0.5, 1e-6);
  close(unp.volumeScale, 0.125, 1e-12);
  close(unp.unpacked[24], 1.0, 1e-6, 'zooming inward +1 oct at eta=0.5 fully unpacks l=4 mode');
});

test('Stage 4b-1: createSphericalWireframeGraph satisfies Euler V-E+F=2, L*1=0 nullspace, diffusion & CFL-stable wavefold', () => {
  const g1 = Engine.createSphericalWireframeGraph({ subdivisions: 1 });
  assert.equal(g1.vertexCount, 42);
  assert.equal(g1.edgeCount, 120);
  assert.equal(g1.vertexCount - g1.edgeCount + g1.faceCount, 2, 'Euler characteristic V-E+F=2 (subdiv 1)');

  const g2 = Engine.createSphericalWireframeGraph({ subdivisions: 2 });
  assert.equal(g2.vertexCount, 162);
  assert.equal(g2.edgeCount, 480);
  assert.equal(g2.vertexCount - g2.edgeCount + g2.faceCount, 2, 'Euler characteristic V-E+F=2 (subdiv 2)');

  // 1. Constant-mode nullspace L*1 = 0: uniform field has 0 Dirichlet tension & preserves mean under pure diffusion
  for (let i = 0; i < g1.vertexCount; i++) g1.injectNode(i, 0.65);
  assert.equal(g1.laplacianEnergy().dirichletEnergy, 0, 'constant mode lies in ker(L)');
  for (let s = 0; s < 20; s++) g1.step({ mode: 'diffusion', viscosity: 0, coupling: 0, diffusion: 0.08 });
  close(g1.laplacianEnergy().meanVal, 0.65, 1e-5, 'pure Graph Laplacian diffusion conserves mean');
  assert.equal(g1.laplacianEnergy().dirichletEnergy, 0);

  // 2. Heat diffusion on localized spike strictly decreases Dirichlet tension while conserving mean
  g1.reset();
  g1.injectDirection(0, 1, 0, 1.2, 0.35);
  const m0 = g1.laplacianEnergy();
  assert.ok(m0.dirichletEnergy > 0.5);
  for (let s = 0; s < 40; s++) g1.step({ mode: 'diffusion', viscosity: 0, coupling: 0, diffusion: 0.08 });
  const mDiff = g1.laplacianEnergy();
  close(mDiff.meanVal, m0.meanVal, 1e-4, 'heat diffusion conserves total charge');
  assert.ok(mDiff.dirichletEnergy < m0.dirichletEnergy * 0.25, 'Dirichlet tension strictly dissipates under diffusion');

  // 3. Conductive wave + passive C1 wavefold is CFL-stable and dissipates under viscosity
  g2.injectDirection(0.577, 0.577, 0.577, 1.4, 0.3);
  const w0 = g2.laplacianEnergy().totalEnergy;
  for (let s = 0; s < 100; s++) {
    g2.step({ mode: 'wave', boundary: 'wavefold', eta: 0.6, viscosity: 0.035, coupling: 0, speed: 0.36 });
  }
  const wEnd = g2.laplacianEnergy();
  assert.ok(Number.isFinite(wEnd.totalEnergy) && Number.isFinite(wEnd.dirichletEnergy), 'CFL-stable conductive wave');
  assert.ok(wEnd.totalEnergy < w0, 'viscous conductive wave strictly dissipates free-decay energy');
});

test('Stage 4b-2 (§5.6): cavityCollapseProfile flattens Delta(lambda)->0 & z->0, honors 0x8 pivot, kappa=1 exact null & S_k->S_{k+1}', () => {
  const st = {
    r: 1.0, rIn: 0.6, amp: 1, f: 1, n: 3, m: 2, k: 1, K: 6, orderN: 19, a: 0.5, b: 3, phaseRad: 0,
    formulas: { x: 'r*cos(TAU*t)', y: 'r*sin(TAU*t)', z: '0.4*sin(TAU*2*t)' }
  };

  // 1. Collapse lambda = 0 vs lambda = 1
  const c0 = Engine.cavityCollapseProfile(st, { hex: '8ADEFEDA85210125', lambda: 0, kappa: 0, bins: 64 });
  const c1 = Engine.cavityCollapseProfile(st, { hex: '8ADEFEDA85210125', lambda: 1, kappa: 0, bins: 64 });
  close(c0.wallThickness, 0.4, 1e-6, 'full 3D wall thickness R - r at lambda=0');
  assert.equal(c1.wallThickness, 0, 'collapsed wall thickness vanishes identically at lambda=1');
  assert.equal(c1.voidFraction, 1);
  let maxZ1 = 0;
  for (let i = 0; i < c1.bins; i++) maxZ1 = Math.max(maxZ1, Math.abs(c1.outZ[i]));
  assert.equal(maxZ1, 0, 'collapsed 2D BitWave contour has z === 0 identically at lambda=1');

  // 2. Zero-crossing pivot: 0x8 (1000) maps to exact 0.0 across entire spline
  const cz = Engine.cavityCollapseProfile(st, { hex: '8888888888888888', lambda: 1, kappa: 0, bins: 64 });
  assert.equal(cz.zeroCrossings, 16);
  for (let i = 0; i < cz.bins; i++) assert.equal(cz.bitWave[i], 0);

  // 3. Resonant Attraction kappa = 1 -> exact -Infinity dB null lock (0x00000000)
  const cLock = Engine.cavityCollapseProfile(st, { hex: '8ADEFEDA85210125', lambda: 0.5, kappa: 1.0, bins: 64 });
  assert.equal(cLock.isExactNull, true);
  assert.equal(cLock.nullDb, -Infinity);
  assert.equal(cLock.peakResidualBits.hex, '0x00000000');

  // 4. Infinite nested sphere register expansion S_k -> S_{k+1} doubles register width (64b -> 128b)
  assert.equal(c0.registerBits, 64);
  assert.equal(c0.nextOuterBits, 128);
  assert.equal(c0.expandedHex.length, 32);
});

test('Stage 4b-2 (§5.7): fourBitLockInYaw verifies bow area, -3 dB (R/sqrt(2)) cavity contact, silence->0x8 & Order-N comb', () => {
  const baseSt = {
    r: 1.0, rIn: 0.65, amp: 1, f: 1, n: 3, m: 2, k: 1, K: 6, orderN: 19, a: 0.5, b: 3, phaseRad: 0,
    formulas: { x: 'r*cos(TAU*t)', y: 'r*sin(TAU*t)', z: '0' }
  };

  // 1. Exact geometry at theta = pi/2 (playT = 0.25): A_tri = 0.5*R^2, L_hyp = sqrt(2)*R, d_mid = R/sqrt(2) (-3 dB)
  const noHit = Engine.fourBitLockInYaw(baseSt, 0.25, { bins: 128, gain: 1.8 });
  close(noHit.bowArea, 0.5, 1e-6, 'bow right-triangle area = R^2/2 at pi/2');
  close(noHit.bowHypotenuse, Math.SQRT2, 1e-6, 'bow hypotenuse = sqrt(2)*R at pi/2');
  close(noHit.dMid, Math.SQRT1_2, 1e-6, 'bow closest approach d_mid = R/sqrt(2) (-3 dB)');
  assert.equal(noHit.etaCrossesHalfPower, false, 'eta=0.65 stays strictly outside -3 dB cavity contact');
  assert.equal(noHit.cavityContact, false);

  // 2. Raising rIn above R/sqrt(2) (eta = 0.76) triggers -3 dB cavity contact at pi/2, silent at 0
  const hitSt = Object.assign({}, baseSt, { rIn: 0.76 });
  const hitAtQuarter = Engine.fourBitLockInYaw(hitSt, 0.25, { bins: 128, gain: 1.8, sweepNibbles: 16 });
  const missAtZero = Engine.fourBitLockInYaw(hitSt, 0.0, { bins: 128, gain: 1.8 });
  assert.equal(hitAtQuarter.etaCrossesHalfPower, true);
  assert.equal(hitAtQuarter.cavityContact, true);
  assert.ok(hitAtQuarter.penetration > 0.05);
  assert.equal(missAtZero.cavityContact, false, 'at theta=0, d_mid=R > rIn so bow is clear of cavity');

  // 3. Single-sweep crystallized 64-bit BitWave register is 16 valid hex nibbles with non-zero modulation
  assert.equal(hitAtQuarter.extractedHex.length, 16);
  assert.match(hitAtQuarter.extractedHex, /^[0-9A-F]{16}$/);
  assert.notEqual(hitAtQuarter.extractedHex, '8888888888888888');

  // 4. Zero-signal silence settles identically on 0x8 (1000 zero-crossing) with 0 yaw
  const silentSt = Object.assign({}, hitSt, { formulas: { x: 'r*cos(TAU*t)', y: '0', z: '0' } });
  const sil = Engine.fourBitLockInYaw(silentSt, 0.25, { bins: 128 });
  assert.equal(sil.lockMag, 0);
  assert.equal(sil.yawNorm, 0);
  assert.equal(sil.nibbleVal, 8);
  assert.equal(sil.nibbleHex, '8');
  assert.equal(sil.nibbleBin, '1000');

  // 5. Order-N modular comb stepping reports exact gcd and subgroup order
  const comb = Engine.fourBitLockInYaw(hitSt, 0.2, { modular: true, orderN: 15, stride: 3, bins: 64 });
  assert.equal(comb.modular, true);
  assert.equal(comb.gcd, 3);
  assert.equal(comb.subOrder, 5);
});

test('Stage 5B: projectTankToFloorField bridges Viscoelastic Tank into 28x72 Floor WT schema & Ghost A-B diff drive', () => {
  const tank = Engine.createViscoelasticTank({ size: 40 });
  tank.injectPulse(0, 0, 1.2, 0.12);
  const st = {
    r: 1.0, rIn: 0.5, f: 1.5, phaseRad: 0,
    floorMode: 'tank', tankBoundary: 'osmosis', tankRefractive: true,
    floorDepth: 0.7, floorSmooth: 0.3, floorSize: 0.94, floorZoomLog: 0.72,
    helicalTurbine: true,
    toggles: { animate: true, floorWt: true, ghostRef: false }
  };

  // Step 1: active synth drive produces 28x72 finite rows + velRows + non-zero tankMetrics
  const f1 = Engine.projectTankToFloorField(tank, st, 0.25, { step: true });
  assert.equal(f1.mode, 'tank');
  assert.equal(f1.slices, 28);
  assert.equal(f1.bins, 72);
  assert.equal(f1.rows.length, 28);
  assert.equal(f1.rows[14].length, 72);
  assert.equal(f1.velRows.length, 28);
  assert.ok(f1.tankMetrics.steps === 1 && f1.tankMetrics.energyTotal > 0.1);
  assert.ok(f1.slice2d && Math.abs(f1.slice2d.A - Math.PI * 0.75) < 1e-6);

  // Step 2: static frame (step: false) does not advance tank step count
  const fStatic = Engine.projectTankToFloorField(tank, st, 0.25, { step: false });
  assert.equal(fStatic.tankMetrics.steps, 1);

  // Step 3: Ghost Ref active switches drive label to cross-Chime A-B Diff
  const ptsA = Array.from({ length: 32 }, (_, i) => ({ x: 0, y: Math.sin((i / 32) * Math.PI * 2), z: 0, valid: true }));
  const ptsB = Array.from({ length: 32 }, (_, i) => ({ x: 0, y: Math.cos((i / 32) * Math.PI * 2), z: 0, valid: true }));
  st.points = ptsA;
  st.ghostPoints = ptsB;
  st.toggles.ghostRef = true;
  const fDiff = Engine.projectTankToFloorField(tank, st, 0.3, { step: true });
  assert.equal(fDiff.sourceLabel, 'TANK · A−B DIFF');
  assert.equal(fDiff.tankMetrics.steps, 2);
});
