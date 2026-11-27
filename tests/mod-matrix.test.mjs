import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { engine: Engine } = require('../js/engine.js');
const ModMatrix = require('../js/mod-matrix.js');

// Ensure Engine is exposed on globalThis.Harmony for ModMatrix.evaluate
globalThis.Harmony = globalThis.Harmony || {};
globalThis.Harmony.engine = Engine;

test('ModMatrix waveform primitives are deterministic and bounded in [-1, 1]', () => {
  for (const wave of ['sine', 'tri', 'saw', 'sq']) {
    for (const p of [0, 0.125, 0.25, 0.5, 0.75, 0.999]) {
      const v = ModMatrix.evalWave(wave, p);
      assert.ok(Number.isFinite(v), `${wave}(${p}) should be finite`);
      assert.ok(v >= -1.0001 && v <= 1.0001, `${wave}(${p})=${v} out of [-1,1]`);
    }
  }
  assert.ok(Math.abs(ModMatrix.evalWave('sine', 0.25) - 1) < 1e-12);
  assert.ok(Math.abs(ModMatrix.evalWave('tri', 0.25) - 1) < 1e-12);
  assert.ok(Math.abs(ModMatrix.evalWave('tri', 0.75) - (-1)) < 1e-12);
});

test('ModMatrix logical operators shape signals deterministically', () => {
  assert.ok(Math.abs(ModMatrix.applyOperator('cos', 0, {}) - 1) < 1e-12);
  assert.ok(Math.abs(ModMatrix.applyOperator('cos', 1, {}) - (-1)) < 1e-12);
  assert.ok(Math.abs(ModMatrix.applyOperator('jacobian', -0.5, {}) - (-0.25)) < 1e-12);
  assert.equal(ModMatrix.applyOperator('gate8', 0, { nibble: 8 }), 1);
  assert.equal(ModMatrix.applyOperator('gatePlat', 0.7, { sliceZ: 0.2, eta: 0.45 }), 0.7);
  assert.equal(ModMatrix.applyOperator('gatePlat', 0.7, { sliceZ: 0.8, eta: 0.45 }), 0);
});

test('ModMatrix two-pass entanglement chains LFO -> Phase -> Slice z/R and restores base cleanly on clear', () => {
  const st = {
    r: 1.0,
    rIn: 0.45,
    archimedesZNorm: 0,
    orderN: 19,
    phaseRad: 0,
    f: 1.0,
    amp: 1.0,
    K: 6,
    a: 0.5,
    b: 3,
    n: 3,
    lockVolume: false,
    lockedR0: 0.96868,
    archimedesAuto: true,
    toggles: { animate: false, strobeN: false }
  };

  ModMatrix.clearRoutes();
  ModMatrix.captureBase(st);

  // Zero routes = zero mutation
  const idle = ModMatrix.evaluate(st, 0.25, 0.016);
  assert.equal(idle.active, false);
  assert.equal(st.phaseRad, 0);
  assert.equal(st.archimedesZNorm, 0);

  // Chain: LFO1 (sine at playT=0.25 -> +1) -> phaseDeg (+90 deg) -> tap_phase (+0.5) -> cos(pi*0.5)=0 -> sliceZ
  ModMatrix.addRoute('lfo1', 'phaseDeg', 'linear', 0.5);
  ModMatrix.addRoute('tap_phase', 'archimedesZNorm', 'sin', 1.0);

  const res = ModMatrix.evaluate(st, 0.25, 0.016);
  assert.equal(res.active, true);
  assert.equal(res.changed, true);
  assert.ok(Math.abs((st.phaseRad * 180 / Math.PI) - 90) < 1e-6, 'LFO1 at t=0.25 with 0.5 depth drives phase to +90 deg');
  assert.ok(Math.abs(st.archimedesZNorm - 1.0) < 1e-6, 'Phase +90 deg (tap_phase=0.5) entangled via sin(pi*0.5)=1 drives sliceZ to +1.0');

  // Clearing routes restores exact base values
  ModMatrix.clearRoutes();
  ModMatrix.evaluate(st, 0.25, 0.016);
  assert.ok(Math.abs(st.phaseRad) < 1e-9, 'phaseRad restored to base 0');
  assert.ok(Math.abs(st.archimedesZNorm) < 1e-9, 'archimedesZNorm restored to base 0');
});

test('ModMatrix Auto z(t) slice tap drives target parameters deterministically', () => {
  const st = {
    r: 1.0,
    rIn: 0.5,
    archimedesZNorm: 0,
    orderN: 19,
    phaseRad: 0,
    f: 1.0,
    amp: 1.0,
    K: 6,
    a: 0.5,
    b: 3,
    n: 3,
    lockVolume: false,
    lockedR0: 0.96868,
    archimedesAuto: true,
    toggles: { animate: false, strobeN: false }
  };

  ModMatrix.clearRoutes();
  ModMatrix.captureBase(st);
  ModMatrix.addRoute('tap_sliceZ', 'phaseDeg', 'linear', 0.5);

  const expectedZNorm = Engine.sphereResonance(st, 0.25).slice.zNorm;
  const res = ModMatrix.evaluate(st, 0.25, 0.016);
  assert.equal(res.active, true);
  const expectedDeg = expectedZNorm * 0.5 * 180;
  assert.ok(Math.abs((st.phaseRad * 180 / Math.PI) - expectedDeg) < 1e-5, 'tap_sliceZ drives phaseDeg from live Auto z(t)');

  ModMatrix.clearRoutes();
  ModMatrix.evaluate(st, 0.25, 0.016);
  assert.ok(Math.abs(st.phaseRad) < 1e-9, 'base phase restored');
});

test('ModMatrix q12 and fifths operators walk exact chromatic and Circle-of-Fifths (+7 mod 12) permutations', () => {
  const chromaticSeen = [];
  const fifthsSeen = [];
  for (let k = 0; k < 12; k++) {
    // Midpoint of bin k in [-1, 1]
    const x = ((k + 0.5) / 12) * 2 - 1;
    const deg12 = Math.round(ModMatrix.applyOperator('q12', x, {}) * 180);
    const deg5  = Math.round(ModMatrix.applyOperator('fifths', x, {}) * 180);
    const pc12 = ((deg12 / 30) % 12 + 12) % 12;
    const pc5  = ((deg5 / 30) % 12 + 12) % 12;
    chromaticSeen.push(pc12);
    fifthsSeen.push(pc5);
  }
  assert.deepEqual(chromaticSeen, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  assert.deepEqual(fifthsSeen, [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5]);
});

test('Stage 0: ModMatrix routes LFOs to Ratio m and Ratio k and restores base cleanly', () => {
  const st = {
    r: 1.0,
    rIn: 0.45,
    archimedesZNorm: 0,
    orderN: 19,
    phaseRad: 0,
    f: 1.0,
    amp: 1.0,
    K: 6,
    a: 0.5,
    b: 3,
    n: 3,
    m: 4,
    k: 2,
    lockVolume: false,
    lockedR0: 0.96868,
    archimedesAuto: true,
    toggles: { animate: false, strobeN: false }
  };

  assert.ok(ModMatrix.TARGETS.m && ModMatrix.TARGETS.m.isInt === true);
  assert.ok(ModMatrix.TARGETS.k && ModMatrix.TARGETS.k.isInt === true);

  ModMatrix.clearRoutes();
  ModMatrix.captureBase(st);
  // LFO1 sine at playT=0.25 => +1; span for [1..8] is 3.5; depth=1.0 => m: 4+3.5=7.5->8, k: 2+3.5=5.5->6
  ModMatrix.addRoute('lfo1', 'm', 'linear', 1.0);
  ModMatrix.addRoute('lfo1', 'k', 'linear', 1.0);

  const res = ModMatrix.evaluate(st, 0.25, 0.016);
  assert.equal(res.active, true);
  assert.equal(res.changed, true);
  assert.equal(st.m, 8);
  assert.equal(st.k, 6);

  ModMatrix.clearRoutes();
  ModMatrix.evaluate(st, 0.25, 0.016);
  assert.equal(st.m, 4);
  assert.equal(st.k, 2);
});

test('ModMatrix exportState and importState round-trip LFOs, routes, and baseValues cleanly', () => {
  const st = {
    r: 1.55,
    rIn: 0.85,
    archimedesZNorm: 0,
    orderN: 27,
    phaseRad: 0,
    f: 1.0,
    amp: 0.75,
    K: 7,
    a: 0.5,
    b: 3,
    n: 2,
    m: 2,
    k: 1,
    lockVolume: false,
    lockedR0: 0.96868,
    archimedesAuto: true,
    toggles: { animate: false, strobeN: true }
  };

  ModMatrix.clearRoutes();
  ModMatrix.captureBase(st);
  ModMatrix.addRoute('lfo1', 'm', 'linear', 0.75);
  ModMatrix.addRoute('lfo2', 'phaseDeg', 'cos', 0.5);
  ModMatrix.evaluate(st, 0.25, 0.016);

  const exported = ModMatrix.exportState();
  assert.equal(exported.routes.length, 2);
  assert.equal(exported.baseValues.m, 2);

  // Wipe and mutate state, then restore from exported snapshot
  ModMatrix.clearRoutes();
  st.m = 7;
  st.orderN = 19;
  ModMatrix.importState(exported, st);
  assert.equal(ModMatrix.getRoutes().length, 2);
  assert.equal(st.m, 2, 'importState restores true unmodulated base value of m');
  assert.equal(st.orderN, 27, 'importState restores true base orderN');

  // Re-evaluating at t=0.25 reproduces the routed m modulation identically
  ModMatrix.evaluate(st, 0.25, 0.016);
  assert.ok(st.m > 2, 'imported LFO1->m route actively modulates m again');

  ModMatrix.clearRoutes();
});

test('Stage 2: Per-LFO Clef register (2^clef) scales LFO phase rate and persists in exportState/importState', () => {
  const st = {
    r: 1.0, rIn: 0.5, archimedesZNorm: 0, orderN: 19, phaseRad: 0,
    f: 1, amp: 1, K: 6, a: 0.5, b: 3, n: 3, m: 2, k: 1,
    lockVolume: false, lockedR0: 0.96868, archimedesAuto: true,
    toggles: { animate: false, strobeN: false }
  };

  ModMatrix.clearRoutes();
  ModMatrix.captureBase(st);
  // Set LFO1 (sine, ratio=1) to Clef +2 (4x speed): at playT=1/16, phase=4*(1/16)=0.25 => sin(pi/2)=+1 => phaseDeg=+90°
  ModMatrix.setLfoClef('lfo1', 2);
  ModMatrix.addRoute('lfo1', 'phaseDeg', 'linear', 0.5);
  ModMatrix.evaluate(st, 1 / 16, 0);
  assert.ok(Math.abs((st.phaseRad * 180 / Math.PI) - 90) < 1e-6, 'Clef +2 quadruples LFO1 rate');

  // Export & import preserves clef = +2 and restores cleanly
  const snap = ModMatrix.exportState();
  assert.equal(snap.lfos[0].clef, 2);
  ModMatrix.setLfoClef('lfo1', 0);
  ModMatrix.importState(snap, st);
  assert.equal(ModMatrix.getLfos()[0].clef, 2);

  // Reset LFO1 clef to 0
  ModMatrix.setLfoClef('lfo1', 0);
  ModMatrix.clearRoutes();
});

test('Stage 2: Target-aware Key-Signature operators (Prime Key, Divisor Key, Just / Modal) land dead-center on exact lattices', () => {
  const st = {
    r: 1.0, rIn: 0.5, archimedesZNorm: 0, orderN: 19, phaseRad: 0,
    f: 1, amp: 1, K: 6, a: 0.5, b: 3, n: 3, m: 2, k: 1,
    lockVolume: false, lockedR0: 0.96868, archimedesAuto: true,
    toggles: { animate: false, strobeN: true }
  };

  // 1. Prime Key on Order N: every sampled point across full cycle is strictly prime!
  ModMatrix.clearRoutes();
  ModMatrix.setLfoClef('lfo1', 0);
  ModMatrix.captureBase(st);
  ModMatrix.addRoute('lfo1', 'orderN', 'qPrime', 0.8);
  const seenPrimes = new Set();
  for (let i = 0; i < 32; i++) {
    ModMatrix.evaluate(st, i / 32, 0);
    assert.equal(Engine.isPrimeInt(st.orderN), true, `orderN=${st.orderN} must be strictly prime`);
    seenPrimes.add(st.orderN);
  }
  assert.ok(seenPrimes.size >= 5, 'Prime Key walks multiple distinct prime orders');

  // 2. Divisor Key on Ratio m with composite Order N = 12: lands strictly on divisors of 12 in [1..8]
  ModMatrix.clearRoutes();
  st.orderN = 12;
  st.m = 3;
  ModMatrix.captureBase(st);
  ModMatrix.addRoute('lfo1', 'm', 'qDivisor', 1.0);
  const seenDivs = new Set();
  for (let j = 0; j < 24; j++) {
    ModMatrix.evaluate(st, j / 24, 0);
    assert.equal(12 % st.m, 0, `m=${st.m} must divide Order N=12`);
    seenDivs.add(st.m);
  }
  assert.ok(seenDivs.size >= 4, 'Divisor Key walks multiple exact divisors of 12');

  // 3. Just / Modal Key on Cavity r: every step locks the Guitar Tuner dead-center (0¢ ★ LOCK)!
  ModMatrix.clearRoutes();
  st.r = 1.0;
  st.rIn = 0.5;
  ModMatrix.captureBase(st);
  ModMatrix.addRoute('lfo1', 'rIn', 'qJust', 0.4);
  for (let q = 0; q < 24; q++) {
    ModMatrix.evaluate(st, q / 24, 0);
    const tun = Engine.tunerReadout(st, q / 24, { mode: 'ratio' });
    assert.equal(tun.locked, true, `qJust step rIn=${st.rIn} should lock tuner (cents=${tun.cents})`);
    assert.ok(Math.abs(tun.cents) < 0.5, `qJust step detuneCents=${tun.cents} near 0¢`);
  }

  ModMatrix.clearRoutes();
});

test('Stage 2: Vessel Calculus taps (tap_detune & tap_dV) and Tuner Sweep / Prime Gears presets work deterministically', () => {
  const st = {
    r: 1.0, rIn: 0.45, archimedesZNorm: 0, orderN: 19, phaseRad: 0,
    f: 1, amp: 1, K: 6, a: 0.5, b: 3, n: 3, m: 2, k: 1,
    lockVolume: false, lockedR0: Engine.cbrt(1 - 0.45 ** 3), archimedesAuto: true,
    toggles: { animate: false, strobeN: false }
  };

  // At default R=1.0, rIn=0.45 (+182¢ detuned), tap_detune saturates to +1.0 and drives Phase sympathetically
  ModMatrix.clearRoutes();
  ModMatrix.captureBase(st);
  ModMatrix.addRoute('tap_detune', 'phaseDeg', 'linear', 0.5);
  ModMatrix.evaluate(st, 0.25, 0);
  assert.ok(Math.abs((st.phaseRad * 180 / Math.PI) - 90) < 1e-4, 'tap_detune (+1.0) at 50% depth bends phase to +90°');

  // Unlocked breathing LFO1 -> rIn produces nonzero tap_dV; enabling Lock V zeros dV/V and tap_dV!
  ModMatrix.clearRoutes();
  st.r = 1.0; st.rIn = 0.5; st.phaseRad = 0; st.lockVolume = false;
  ModMatrix.captureBase(st);
  ModMatrix.addRoute('lfo1', 'rIn', 'linear', 0.25);
  ModMatrix.addRoute('tap_dV', 'phaseDeg', 'linear', 0.5);
  ModMatrix.evaluate(st, 0.0, 0); // sine derivative at t=0 is +2*pi (max expansion velocity!)
  assert.ok(Math.abs(ModMatrix.getLiveRates().dVOverV) > 0.5, 'unlocked LFO->rIn generates live nonzero dV/V');
  assert.ok(Math.abs(ModMatrix.getSourceValues().tap_dV) > 0.4, 'tap_dV carries live bounded vessel rate');

  // Enable Lock V => analytical dR = eta^2 * dr cancels dV to 0!
  st.lockVolume = true;
  st.lockedR0 = Engine.cbrt(1 - 0.5 ** 3);
  ModMatrix.evaluate(st, 0.0, 0);
  assert.equal(ModMatrix.getLiveRates().isLockedV, true);
  assert.ok(Math.abs(ModMatrix.getSourceValues().tap_dV) < 1e-6, 'Lock V zeros tap_dV analytically');

  // Verify new Matrix Presets: primeGears and tunerSweep
  ModMatrix.applyPreset('primeGears');
  ModMatrix.evaluate(st, 0.2, 0);
  assert.equal(Engine.isPrimeInt(st.orderN), true, 'primeGears keeps Order N prime');

  ModMatrix.setLfoClef('lfo1', 0);
  ModMatrix.setLfoClef('lfo2', 0);
  ModMatrix.clearRoutes();
});

test('Stage 5A: Collapse λ and Attract κ are routable ModMatrix targets with bwCollapse preset & clean base restore', () => {
  assert.ok(ModMatrix.TARGETS.collapseLambda, 'collapseLambda target registered');
  assert.ok(ModMatrix.TARGETS.attractKappa, 'attractKappa target registered');

  const st = {
    r: 1.0, rIn: 0.45, archimedesZNorm: 0, orderN: 19, phaseRad: 0,
    f: 1, amp: 1, K: 6, a: 0.5, b: 3, n: 3, m: 2, k: 1,
    collapseLambda: 0, attractKappa: 0,
    lockVolume: false, lockedR0: Engine.cbrt(1 - 0.45 ** 3), archimedesAuto: true,
    toggles: { animate: false, strobeN: false }
  };

  ModMatrix.clearRoutes();
  ModMatrix.setLfoClef('lfo1', 0);
  ModMatrix.captureBase(st);
  ModMatrix.applyPreset('bwCollapse');
  // Seed base collapse values explicitly as the preset does when wired to appHooks
  st.collapseLambda = 0.5;
  st.attractKappa = 0.35;
  ModMatrix.captureBase(st, 'collapseLambda');
  ModMatrix.captureBase(st, 'attractKappa');

  const seenLam = new Set();
  const seenKap = new Set();
  for (let i = 0; i < 16; i++) {
    ModMatrix.evaluate(st, i / 16, 0);
    assert.ok(st.collapseLambda >= 0 && st.collapseLambda <= 1, 'collapseLambda stays in [0, 1]');
    assert.ok(st.attractKappa >= 0 && st.attractKappa <= 1, 'attractKappa stays in [0, 1]');
    seenLam.add(st.collapseLambda.toFixed(2));
    seenKap.add(st.attractKappa.toFixed(2));
  }
  assert.ok(seenLam.size >= 4, 'bwCollapse sweeps Collapse λ dynamically across [0, 1]');
  assert.ok(seenKap.size >= 4, 'bwCollapse sweeps Attract κ dynamically across [0, 1]');

  // Export & import preserve collapse routes cleanly
  const snap = ModMatrix.exportState();
  ModMatrix.clearRoutes();
  ModMatrix.importState(snap, st);
  assert.equal(ModMatrix.getRoutes().some(r => r.dst === 'collapseLambda'), true);
  assert.equal(ModMatrix.getRoutes().some(r => r.dst === 'attractKappa'), true);

  ModMatrix.setLfoClef('lfo1', 0);
  ModMatrix.clearRoutes();
});
