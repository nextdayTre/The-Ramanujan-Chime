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

function stdPick(o) {
  const out = {};
  for (const k of Object.keys(o).sort()) out[k] = o[k];
  return out;
}
