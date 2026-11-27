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
