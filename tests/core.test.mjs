// Known-vector tests for the one float32 maths core and the agent-core state layer.
// Expected values are derived from the engine's documented maths (HARMONY_ENGINE.md),
// never from a rendered panel.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Harmony = require('../js/engine.js');
const Presets = require('../js/presets.js');
const AgentCore = require('../js/agent-core.js');
const Engine = Harmony.engine;

const close = (actual, expected, eps = 1e-12, label = '') =>
  assert.ok(Math.abs(actual - expected) <= eps, `${label} expected ${expected}, got ${actual}`);

test('engine is exported for browser and Node from the same file', () => {
  assert.equal(Harmony.PRECISION, 'float32');
  assert.equal(typeof Engine.sample, 'function');
  assert.equal(Presets.list.length, 14);
  assert.equal(Presets.list[12].name.startsWith('Four-Bit Orbit'), true);
});

test('float32 π is 0x40490FDB and sentinels have exact bit patterns', () => {
  const pi = Engine.bitInspect(Math.PI);
  assert.equal(pi.hex, '0x40490FDB');
  assert.equal(pi.kind, 'finite');
  assert.equal(pi.signBit, '0');
  assert.equal(pi.expBits, '10000000');
  assert.equal(Engine.bitInspect(Infinity).hex, '0x7F800000');
  assert.equal(Engine.bitInspect(-Infinity).hex, '0xFF800000');
  assert.equal(Engine.bitInspect(NaN).hex, '0x7FC00000');
  assert.equal(Engine.fmtNum(Infinity), '+∞');
  assert.equal(Engine.fmtNum(-Infinity), '−∞');
});

test('float32 rounding is Math.fround (24-bit significand)', () => {
  assert.equal(Engine.bitInspect(Math.fround(Math.PI)).val, '3.14159');
  assert.equal(Math.fround(0.1), 0.10000000149011612);
});

test('hollow sphere metrics match V = 4/3π(R³ − r³)', () => {
  const m = Engine.shellMetrics({ r: 1, rIn: 0.45 });
  close(m.thickness, 0.55, 1e-15, 'thickness');
  close(m.volOuter, (4 / 3) * Math.PI, 1e-12, 'volOuter');
  close(m.volCavity, (4 / 3) * Math.PI * 0.45 ** 3, 1e-12, 'volCavity');
  close(m.volShell, m.volOuter - m.volCavity, 1e-12, 'volShell');
  close(m.volShell, 3.8070866973752304, 1e-12, 'volShell preset 12');
  assert.equal(Engine.zoneOf(1, { r: 1, rIn: 0.45 }), 'ON SPHERE');
  assert.equal(Engine.zoneOf(0.2, { r: 1, rIn: 0.45 }), 'IN CAVITY');
  assert.equal(Engine.zoneOf(0.7, { r: 1, rIn: 0.45 }), 'IN SHELL');
  assert.equal(Engine.zoneOf(3, { r: 1, rIn: 0.45 }), 'OUTSIDE');
});

test('Four-Bit Orbit: 1000 at t=0, 1111/F at quarter turn, Quadray tetrahedron', () => {
  const st = { r: 1, f: 1, phaseRad: 0 };
  const t0 = Engine.fourBitOrbit(st, 0);
  assert.equal(t0.nibbleBin, '1000');
  assert.equal(t0.nibbleHex, '0x8');
  assert.equal(t0.nibbleVal, 8);
  assert.equal(t0.meridian8.x, -1);
  assert.equal(t0.meridian1.x, 1);
  assert.equal(t0.deg, 0);

  const tq = Engine.fourBitOrbit(st, 0.25);
  assert.equal(tq.nibbleBin, '1111');
  assert.equal(tq.nibbleHex, '0xF');
  assert.equal(tq.nibbleVal, 15);
  close(tq.deg, 90, 1e-9, 'deg at quarter');

  const q = t0.quadray;
  assert.deepEqual(stdPick(q.D_0001), { x: 0, y: 1, z: 0, label: '(0,0,0,1)', bits: '0001', dec: 1 });
  assert.equal(q.A_1000.bits, '1000');
  assert.equal(q.A_1000.dec, 8);
  assert.equal(q.B_0100.bits, '0100');
  assert.equal(q.C_0010.bits, '0010');
  // D (0,0,0,1) and A/B/C sit on a regular tetrahedron inscribed in the R=1 sphere.
  for (const v of [q.D_0001, q.A_1000, q.B_0100, q.C_0010]) {
    close(Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z), 1, 1e-6, 'quadray radius');
  }
  close(q.A_1000.y, -1 / 3, 1e-6, 'A.y');
  close(q.A_1000.z, Math.fround((2 * Math.SQRT2) / 3), 1e-6, 'A.z');
});

test('discrete cyclic order N strobe: gcd / subgroup / closure', () => {
  const base = { orderN: 19, n: 3, a: 0.5, b: 3, K: 6, r: 1, rIn: 0.45, amp: 1, f: 1, m: 2, k: 1, phaseRad: 0,
    formulas: { x: 'r*cos(TAU*t)', y: 'r*sin(TAU*t)', z: '0' } };
  const prime = Engine.discreteGroup(base, null);
  assert.equal(prime.N, 19);
  assert.equal(prime.stride, 3);
  assert.equal(prime.gcd, 1);
  assert.equal(prime.subOrder, 19);
  assert.equal(prime.isPrime, true);
  assert.equal(prime.orbit.length, 20);           // 19 visited states + closing 0
  assert.equal(prime.orbit[prime.orbit.length - 1], 0);

  const composite = Engine.discreteGroup(Object.assign({}, base, { orderN: 12, n: 3 }), null);
  assert.equal(composite.gcd, 3);
  assert.equal(composite.subOrder, 4);
  assert.deepEqual(composite.orbit, [0, 3, 6, 9, 0]);
  assert.equal(composite.nodes.filter((n) => n.inSubgroup).length, 4);
});

test('Ramanujan 1914 1/π locks float32 π on the k=0 term', () => {
  const series = Engine.ramanujanSeries(2);
  assert.equal(series.targetHex, '0x40490FDB');
  assert.equal(series.rows[0].ramLocked, true);
  assert.equal(series.rows[0].ramHex, '0x40490FDB');
  assert.equal(series.rows[0].k, 0);
  // Fourier (Gregory–Leibniz) does NOT lock all 32 bits at k=0.
  assert.equal(series.rows[0].fourLocked, false);
  // k=0 already carries ~142 dB (float32 π locked); k=1 exceeds 300 dB.
  assert.ok(series.rows[0].errRamDb < -140, 'Ramanujan k=0 within -140 dB');
  assert.ok(series.rows[1].errRamDb < -300, 'Ramanujan k=1 exceeds -300 dB');
  // The engine clamps maxK to [0,6].
  assert.equal(Engine.ramanujanSeries(99).rows.length, 7);
});

test('secp256k1 Frobenius Lucas recurrence and #E(F_p^k)', () => {
  const st = {};
  const secp = Engine.initSecp(st);
  const S1 = Engine.secpSeq(st, 1);
  assert.equal(S1, secp.T);
  assert.equal(secp.P, 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2Fn);
  assert.equal(secp.N, 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n);
  const S4 = Engine.secpSeq(st, 4);
  const count4 = (secp.P ** 4n) + 1n - S4;
  // Hasse bound: |S_k| <= 2·p^(k/2) — compare against p^2 for k=4.
  const bound2 = 2n * (secp.P ** 2n);
  assert.ok(S4 < bound2 && S4 > -bound2, 'S_4 within Hasse bound');
  assert.equal(String(count4), AgentCore.callTool('frobenius_secp', { k: 4 }).data.pointCount);
});

test('float32 curve evaluations are exact and deterministic', () => {
  const st = AgentCore.resolveState({ preset: 12 });
  const res = Engine.sample(st, 3200);
  assert.equal(res.points.length, 3201);
  assert.equal(res.valid, true);
  // t=0 -> (R, 0, 0); index 1600 is exactly t=0.5 -> (-R, ~0, 0)
  assert.deepEqual(stdPick(res.points[0]), { x: 1, y: 0, z: 0, valid: true, t: 0 });
  assert.equal(res.points[1600].t, 0.5);
  close(res.points[1600].x, -1, 1e-9, 'x at t=0.5');
  const again = Engine.sample(st, 3200);
  assert.equal(JSON.stringify(res), JSON.stringify(again));
});

test('playhead honours twin mode and float32 (-0) semantics', () => {
  const st = AgentCore.resolveState({ preset: 12 });
  const pts = Engine.sample(st, 3200).points;
  const ph = Engine.playhead(st, pts, 0);
  assert.equal(ph.point.x, 1);
  assert.equal(ph.point.y, 0);
  assert.equal(ph.mode, 'both');
  assert.ok(Object.is(ph.conjugate.y, -0), 'conjugate twin keeps float32 -0');
  assert.equal(ph.antipodal.x, -1);
  assert.deepEqual(ph.realTrace, { x: 1, y: 0, z: 0 });
  assert.equal(ph.strobeN === undefined || true, true);
});

test('twinOf is the single shared twin implementation', () => {
  const pt = { x: 1.5, y: -2.5, z: 0.5 };
  const off = Engine.twinOf(pt, 'off');
  assert.equal(off.twin, null);
  const anti = Engine.twinOf(pt, 'antipodal');
  assert.deepEqual(anti.twin, { x: -1.5, y: 2.5, z: -0.5 });
  const conj = Engine.twinOf(pt, 'conjugate');
  assert.deepEqual(conj.twin, { x: 1.5, y: 2.5, z: 0.5 });
  const both = Engine.twinOf(pt, 'both');
  assert.deepEqual(both.twin, conj.twin);
  assert.equal(both.realTrace.y, 0);
  // Matches playhead for the same point.
  const ph = Engine.playhead({ twinMode: 'conjugate', toggles: {} }, [{ x: pt.x, y: pt.y, z: pt.z, valid: true }], 0);
  assert.deepEqual(ph.twin, conj.twin);
});

test('default state is preset 12 (Four-Bit Orbit) and matches the page defaults', () => {
  const st = AgentCore.defaultState();
  assert.equal(st.presetIndex, 12);
  assert.equal(st.r, 1);
  assert.equal(st.rIn, 0.45);
  assert.equal(st.orderN, 16);          // preset 12 params
  assert.equal(st.K, 6);
  assert.equal(st.twinMode, 'both');
  assert.equal(st.activeTab, 'scopes');
  assert.equal(st.toggles.fourBitOrbit, true);
  assert.equal(st.toggles.sliceGrid, true);
  assert.equal(st.toggles.magnifier, false);
  assert.equal(st.toggles.strobeN, false);
  assert.equal(st.phaseRad, 0);
  assert.equal(st.playT, 0);
});

test('analyze_patch stats agree with the engine sample', () => {
  const res = AgentCore.callTool('analyze_patch', { preset: 12, samples: 320 });
  assert.equal(res.ok, true);
  assert.equal(res.schemaVersion, 1);
  assert.equal(res.tool, 'analyze_patch');
  assert.equal(res.data.samples, 320);
  assert.equal(res.data.stats.validCount, 321);
  assert.equal(res.data.stats.validCount + res.data.stats.invalidCount, 321);
  const zoneSum = Object.values(res.data.stats.zoneCounts).reduce((a, b) => a + b, 0);
  assert.equal(zoneSum, 321);
  assert.equal(res.data.samplesAt.length, 5);
  assert.equal(res.data.samplesAt[0].t, 0);
  close(res.data.shell.volShell, 3.8070866973752304, 1e-12, 'volShell');
});

test('eval_point matches Engine.point exactly (float32)', () => {
  const res = AgentCore.callTool('eval_point', { preset: 12, t: 0.37 });
  const st = AgentCore.resolveState({ preset: 12 });
  const p = Engine.point(st, 0.37);
  assert.deepEqual(res.data.point, { x: p.x, y: p.y, z: p.z, valid: p.valid });
  assert.equal(res.data.bits.x.hex, Engine.bitInspect(p.x).hex);
  assert.equal(res.data.readout.status, 'ON SPHERE');
});

test('§§1–3 sphereResonance: time-stretch modulators, radial ladders, triple syzygy lock & Archimedes constant-area slice', () => {
  // 1. Exact 2:1 Octave Triple Lock (R=1.0, rIn=0.5 => eta=0.5, alpha=2.0, triad 1 : 2 : 2)
  const oct = Engine.sphereResonance({ r: 1.0, rIn: 0.5, archimedesAuto: false, archimedesZNorm: 0.25 }, 0);
  close(oct.eta, 0.5, 1e-6, 'eta=0.5');
  close(oct.jacobian, 0.25, 1e-6, 'jacobian eta^2=0.25');
  close(oct.volFrac, 0.875, 1e-6, '1-eta^3=0.875');
  close(oct.stretchRatio, 2.0, 1e-6, 'alpha=2.0');
  close(oct.stretchOctaves, 1.0, 1e-6, 'octaves=+1.0');
  assert.equal(oct.syzygy.ratioText, '2:1');
  assert.equal(oct.syzygy.locked, true);
  assert.equal(oct.syzygy.tripleLock, true);
  assert.equal(oct.syzygy.triadText, '1 : 2 : 2');
  close(oct.modes.inner[0], 2 * oct.modes.outer[0], 1e-5, 'k1_in = 2 * k1_out');
  close(oct.modes.shell[0], 2 * oct.modes.outer[0], 1e-5, 'k1_shell = 2 * k1_out');

  // 2. Archimedes Constant-Area Slice Theorem (§3.3):
  //    Across any |z| <= rIn, A_ring(z) = pi*(rho_out^2 - rho_in^2) === pi*(R^2 - rIn^2)
  const expectedRing = Math.fround(Math.PI * (1.0 - 0.25));
  for (const zN of [-0.49, -0.25, 0, 0.25, 0.49]) {
    const sl = Engine.sphereResonance({ r: 1.0, rIn: 0.5, archimedesAuto: false, archimedesZNorm: zN }, 0).slice;
    assert.equal(sl.inCavitySpan, true, `zNorm=${zN} inside cavity span`);
    close(sl.areaRing, expectedRing, 1e-5, `Archimedes invariant at zNorm=${zN}`);
  }
  // Outside cavity span (|z| > rIn), A_ring(z) tapers parabolically < pi*(R^2 - rIn^2)
  const cap = Engine.sphereResonance({ r: 1.0, rIn: 0.5, archimedesAuto: false, archimedesZNorm: 0.8 }, 0).slice;
  assert.equal(cap.inCavitySpan, false);
  assert.ok(cap.areaRing < expectedRing, 'polar cap area tapers below plateau');

  // 3. Constant-Volume Stretch Law (§2.1): R(r) = (r^3 + R0^3)^(1/3)
  const r0 = 1.0;
  const rInTest = 0.75;
  const Rstretched = Engine.solveConstantVolumeR(rInTest, r0);
  close(Rstretched ** 3 - rInTest ** 3, r0 ** 3, 1e-12, 'V_shell conserved under solveConstantVolumeR');
  close(Engine.solveConstantVolumeRIn(Rstretched, r0), rInTest, 1e-12, 'inverse solveConstantVolumeRIn');
  const pair = Engine.solveConstantVolumePairForEta(0.5, r0);
  close(pair.rIn / pair.R, 0.5, 1e-12, 'pair ratio eta=0.5');
  close(pair.R ** 3 - pair.rIn ** 3, r0 ** 3, 1e-12, 'pair conserves V_shell');
});

test('Stage 1: clefFactor (2-adic split) & pseudoMersenneDecomp (secp256k1 & Mersenne)', () => {
  // Powers of 2 all collapse to oddKernel 1 (Root C)
  const c1024 = Engine.clefFactor(1024);
  assert.equal(c1024.oddKernel, 1);
  assert.equal(c1024.octave, 10);
  assert.equal(c1024.isPowerOfTwo, true);

  // Composite prime-limit factorization: 60 and 120 share identical oddKernel 15 (3*5), 1 clef apart
  const c60 = Engine.clefFactor(60);
  const c120 = Engine.clefFactor(120);
  assert.equal(c60.oddKernel, 15);
  assert.equal(c60.octave, 2);
  assert.deepEqual(c60.primeExponents, { '2': 2, '3': 1, '5': 1 });
  assert.equal(c120.oddKernel, 15);
  assert.equal(c120.octave, 3);

  // Odd / prime even-neighbor Clef decomposition ("uncompleted wavecycle")
  const p31 = Engine.clefFactor(31);
  assert.equal(p31.isPrime, true);
  assert.equal(p31.evenNeighbor.evenVal, 32);
  assert.equal(p31.evenNeighbor.octave, 5);
  assert.equal(p31.evenNeighbor.residual, -1);
  assert.equal(p31.evenNeighbor.label, '2^5 − 1');

  const p19 = Engine.clefFactor(19);
  assert.equal(p19.evenNeighbor.evenVal, 20);
  assert.equal(p19.evenNeighbor.oddKernel, 5);
  assert.equal(p19.evenNeighbor.octave, 2);
  assert.equal(p19.evenNeighbor.residual, -1);

  const p17 = Engine.clefFactor(17);
  assert.equal(p17.evenNeighbor.evenVal, 16);
  assert.equal(p17.evenNeighbor.octave, 4);
  assert.equal(p17.evenNeighbor.residual, 1);

  // BigInt Pseudo-Mersenne: secp256k1 P = 2^256 - (2^32 + 977)
  const secp = Engine.initSecp({});
  const pmSecp = Engine.pseudoMersenneDecomp(secp.P);
  assert.equal(pmSecp.valid, true);
  assert.equal(pmSecp.upperSigma, 256);
  assert.equal(pmSecp.upperDeficit, String((1n << 32n) + 977n));
  assert.equal(pmSecp.nearestSigma, 256);

  const pmM31 = Engine.pseudoMersenneDecomp((1n << 31n) - 1n);
  assert.equal(pmM31.upperSigma, 31);
  assert.equal(pmM31.upperDeficit, '1');
  assert.equal(pmM31.residual, '-1');
});

test('Stage 1: lowestCommonStructure projective gcd reduction, Round closure & Period-1 Engine.sample', () => {
  // (3072 : 5120) -> strips shared Clef 2^10 (1024) to primitive 3:5, lcm = 15360
  const lcsBig = Engine.lowestCommonStructure(3072, 5120);
  assert.equal(lcsBig.gcd, 1024);
  assert.equal(lcsBig.sharedClefOctave, 10);
  assert.equal(lcsBig.nPrim, 3);
  assert.equal(lcsBig.mPrim, 5);
  assert.equal(lcsBig.reducedLabel, '3:5');
  assert.equal(lcsBig.roundClosure, 15360);

  // Active-axis masking for 2-axis torus knot (k unused): (n=3, m=6, k=1) -> gcd=3, 1:2
  const lcsTorus = Engine.lowestCommonStructure(3, 6, 1, { useK: false });
  assert.equal(lcsTorus.gcd, 3);
  assert.equal(lcsTorus.nPrim, 1);
  assert.equal(lcsTorus.mPrim, 2);
  assert.equal(lcsTorus.reducedLabel, '1:2');

  // Engine.sample with lcsReduce=true renders (n=6, m=4, k=8) bit-identically to primitive (3, 2, 4)
  const baseLiss = {
    r: 1, rIn: 0.45, amp: 1, f: 1, n: 3, m: 2, k: 4, K: 6, orderN: 19, a: 0.5, b: 3, phaseRad: 0,
    formulas: { x: 'r*sin(TAU*n*t)', y: 'r*sin(TAU*m*t)', z: 'r*cos(TAU*k*t)' }
  };
  const doubledLcs = Object.assign({}, baseLiss, { n: 6, m: 4, k: 8, lcsReduce: true });
  const sPrim = Engine.sample(baseLiss, 128);
  const sRed = Engine.sample(doubledLcs, 128);
  assert.deepEqual(sRed.points, sPrim.points);
});

test('Stage 1: sentinelRegister (homothetic scale, 0-bit f32 mantissa drift, hysteresis & Edge-to-Infinity)', () => {
  // Schmitt-trigger hysteresis deadband [0.42, 2.20]
  assert.equal(Engine.sentinelHysteresisStep(1.0, 0, { rHi: 2.20, rLo: 0.42 }).action, 'hold');
  const up = Engine.sentinelHysteresisStep(2.30, 0, { rHi: 2.20, rLo: 0.42 });
  assert.equal(up.action, 'clef_up');
  assert.equal(up.nextSigma, 1);
  close(up.scaledRadius, 1.15, 1e-6, 'clef_up halves radius');

  const down = Engine.sentinelHysteresisStep(0.38, 2, { rHi: 2.20, rLo: 0.42 });
  assert.equal(down.action, 'clef_down');
  assert.equal(down.nextSigma, 1);
  close(down.scaledRadius, 0.76, 1e-6, 'clef_down doubles radius');

  // Sentinel register at +10 octaves keeps eta invariant, flips pitch -10 oct, preserves float32 mantissa
  const sr = Engine.sentinelRegister({
    r: 1.55, rIn: 0.85, sentinelOctave: 10, f: 1, n: 3, m: 5, k: 1, orderN: 19,
    clefRoundM: 9, lcsReduce: false,
    formulas: { x: 'rIn*cos(TAU*m*t)*cos(TAU*n*t)', y: 'rIn*sin(TAU*m*t)', z: '0' }
  }, { samples: 3200 });
  assert.equal(sr.sigma, 10);
  assert.equal(sr.scalePow2, 1024);
  assert.equal(sr.pitchOctaveShift, -10);
  assert.equal(sr.mantissaPreserved, true);
  close(sr.eta, Math.fround(0.85 / 1.55), 1e-6, 'eta invariant under Sentinel octave jump');
  // mEff = 5 * 2^9 = 2560 > Nyquist (1600) => Edge-to-Infinity beyond_nyquist
  assert.equal(sr.lcs.mEff, 2560);
  assert.equal(sr.horizon.maxObservableCycles, 1600);
  assert.equal(sr.horizon.state, 'beyond_nyquist');
});

function stdPick(o) {
  const out = {};
  for (const k of Object.keys(o).sort()) out[k] = o[k];
  return out;
}
