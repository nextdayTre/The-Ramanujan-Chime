import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Harmony = require('../js/engine.js');
globalThis.Harmony = globalThis.Harmony || Harmony;
const Presets = require('../js/presets.js');
globalThis.Harmony.Presets = Presets;
const AgentCore = require('../js/agent-core.js');
globalThis.Harmony.AgentCore = AgentCore;
const ChimeRack = require('../js/chime-rack.js');

describe('Harmony.ChimeRack — Multi-Chime Front f(x) Rack & Visual Menu', () => {
  it('exposes 8 slot keys (A..H) and defaults cleanly to stage view', () => {
    assert.equal(ChimeRack.MAX_CHIMES, 8);
    assert.deepEqual(ChimeRack.ALL_KEYS, ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
    assert.equal(ChimeRack.getView(), 'stage');
  });

  it('buildEvalStateFromSnap reconstructs engine-evaluable state for every built-in preset', () => {
    const Engine = Harmony.engine;
    for (let idx = 0; idx < Presets.list.length; idx++) {
      const pr = Presets.list[idx];
      if (!pr || !pr.formulas) continue;
      const snap = AgentCore.snapshotFromPreset(idx);
      const st = ChimeRack.buildEvalStateFromSnap(snap);
      assert.ok(st && st.formulas && typeof st.formulas.x === 'string', `preset ${idx} missing formulas`);
      const res = Engine.sample(st, 128);
      assert.equal(res.valid, true, `preset ${idx} failed Engine.sample`);
      assert.equal(res.points.length, 129);
    }
  });

  it('Stage 3: computeRackCoupling couples active slots A..C via LCS gcd/lcm, Adler locks & Parallel Bus', () => {
    const slots = {
      A: AgentCore.snapshotFromPreset(12),
      B: AgentCore.snapshotFromPreset(12, { tw: 'antipodal' }),
      C: AgentCore.snapshotFromPreset(9, { orderN: 24 })
    };
    const cpl = ChimeRack.computeRackCoupling(slots, ['A', 'B', 'C'], 'A', null, 0);
    assert.equal(cpl.count, 3);
    assert.equal(cpl.orderGcd, 8, 'gcd(16, 16, 24) === 8');
    assert.equal(cpl.orderLcm, 48, 'lcm(16, 16, 24) === 48');
    assert.equal(cpl.cavities[1].busOp, '-P', 'antipodal twin slot maps to -P null send on Master Bus');
    assert.equal(cpl.cavities[0].gearLocked, true);
    assert.equal(cpl.cavities[1].gearLocked, true);

    // Pure antipodal pair (A = +P, B = -P, identical geometry) nulls the Master Bus identically!
    const nullCpl = ChimeRack.computeRackCoupling(slots, ['A', 'B'], 'A', null, 0.25);
    assert.equal(nullCpl.bus.isBusNull, true);
    assert.equal(nullCpl.regime, 'bus_null');
    assert.equal(nullCpl.coherence, 0);
  });
});
