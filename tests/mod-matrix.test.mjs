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
