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
});
