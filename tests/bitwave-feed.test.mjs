import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Harmony = require('../js/engine.js');
const Engine = Harmony.engine;
const BitWaveImport = require('../js/bitwave-import.js');
globalThis.Harmony = globalThis.Harmony || Harmony;
globalThis.Harmony.BitWaveImport = BitWaveImport;
const BitWaveFeed = require('../js/bitwave-feed.js');
const ModMatrix = require('../js/mod-matrix.js');

const FIXTURE_PATH = path.resolve(import.meta.dirname, '../spike/fixtures/canonical-vectors.bitwave.json');

function makeState(overrides = {}) {
  return Object.assign({
    r: 1.0,
    rIn: 0.45,
    amp: 1.0,
    f: 1.0,
    K: 6,
    orderN: 16,
    a: 0.5,
    b: 3,
    n: 3,
    phaseRad: 0,
    playT: 0,
    lockVolume: false,
    lockedR0: 1.0,
    archimedesAuto: false,
    archimedesZNorm: 0,
    floorMode: 'wavetable',
    floorSize: 0.94,
    floorDepth: 0.68,
    floorSmooth: 0.52,
    floorZoomLog: 0.7295,
    floorBpm: 120,
    floorBeats: 4,
    toggles: { strobeN: false }
  }, overrides);
}

describe('Harmony.BitWaveFeed — read-only register feed & monotone-cubic spline', () => {
  beforeEach(() => {
    BitWaveFeed.clear();
    ModMatrix.clearRoutes();
  });

  it('starts dormant and provides a safe 16-nibble LFO fallback', () => {
    assert.equal(BitWaveFeed.isActive(), false);
    const fd = BitWaveFeed.getFeed();
    assert.equal(fd.active, false);
    const fallback = BitWaveFeed.getLfoNibbles();
    assert.equal(fallback.length, 16);
    assert.equal(fallback[0], 8);
  });

  it('ingests bare hex registers (64-bit and 256-bit) without mutating or throwing', () => {
    const r64 = BitWaveFeed.ingest('0x8ADE_FEDA_8521_0125');
    assert.equal(r64.ok, true);
    assert.equal(BitWaveFeed.isActive(), true);
    const fd = BitWaveFeed.getFeed();
    assert.equal(fd.width, 64);
    assert.equal(fd.nibbleCount, 16);
    assert.equal(fd.activeHex, '8ADEFEDA85210125');
    assert.equal(fd.activeNibbles[0], 0x8);
    assert.equal(fd.activeNibbles[1], 0xA);

    const pulse256 = 'A' + '0'.repeat(62) + 'A';
    const r256 = BitWaveFeed.ingest(pulse256);
    assert.equal(r256.ok, true);
    assert.equal(BitWaveFeed.getFeed().width, 256);
    assert.equal(BitWaveFeed.getFeed().nibbleCount, 64);
  });

  it('ingests canonical .bitwave JSON fixture & #bw= share links via BitWaveImport', () => {
    const jsonText = fs.readFileSync(FIXTURE_PATH, 'utf8');
    const res = BitWaveFeed.ingest(jsonText, { transport: 'file', name: 'canonical-vectors.bitwave.json' });
    assert.equal(res.ok, true);
    const fd = BitWaveFeed.getFeed();
    assert.equal(fd.width, 64);
    assert.equal(fd.lane, '1');
    assert.equal(fd.frame, 'z');
    assert.equal(fd.hexA, '8ADEFEDA85210125');
    assert.equal(fd.hexB, 'FFFFFFFF00000000');
    assert.equal(fd.hexZ, '7521012585210125');

    // Switch lane and frame cleanly
    BitWaveFeed.setLane('2');
    BitWaveFeed.setFrame('a');
    assert.equal(BitWaveFeed.getFeed().lane, '2');
    assert.equal(BitWaveFeed.getFeed().frame, 'a');
    assert.equal(BitWaveFeed.getFeed().activeHex, '0123456789ABCDEF');

    // Encode as #bw= share link and verify round-trip
    const b64url = Buffer.from(jsonText, 'utf8').toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    BitWaveFeed.clear();
    const linkRes = BitWaveFeed.ingest('https://bitwave.local/#bw=' + b64url, { transport: 'paste' });
    assert.equal(linkRes.ok, true);
    assert.equal(BitWaveFeed.getFeed().hexZ, '7521012585210125');
  });

  it('ingests structured live payloads (hexA/hexB/op) and computes derived Z', () => {
    const res = BitWaveFeed.ingest({
      type: 'bitwave-feed',
      hexA: 'A00000000000000A',
      hexB: '500000000000000A',
      op: 'xor',
      label: 'Live Test'
    }, { transport: 'broadcast' });
    assert.equal(res.ok, true);
    const fd = BitWaveFeed.getFeed();
    assert.equal(fd.hexZ, 'F000000000000000');
    assert.equal(fd.liveTransport, 'broadcast');
  });

  it('monotone-cubic spline passes exactly through knots, crosses 0 at 0x8, and never overshoots', () => {
    const stepNibbles = [15, 0, 0, 0, 0, 0, 0, 0, 8, 8, 8, 8, 0, 0, 0, 15];
    const slopes = BitWaveFeed.computeCyclicSlopes(stepNibbles);
    // Exact knots
    assert.equal(BitWaveFeed.sampleMonotoneRaw(stepNibbles, 0, slopes), 15);
    assert.equal(BitWaveFeed.sampleMonotoneRaw(stepNibbles, 1 / 16, slopes), 0);
    // 0x8 exact zero-crossing in bipolar space
    assert.equal(BitWaveFeed.sampleMonotone(stepNibbles, 8 / 16, slopes), 0);

    // Dense scan: strictly bounded in [0, 15] (no Gibbs overshoot!)
    for (let i = 0; i <= 400; i++) {
      const v = BitWaveFeed.sampleMonotoneRaw(stepNibbles, i / 400, slopes);
      assert.ok(v >= 0 && v <= 15, `overshoot detected: ${v}`);
    }
  });

  it('Engine.floorField integrates opts.bitwave in both wavetable and MiniMeters spectrogram modes', () => {
    BitWaveFeed.loadPreset('pulse256');
    const fd = BitWaveFeed.getFeed();
    const bwOpts = {
      bitwave: {
        nibblesA: fd.nibblesA,
        nibblesB: fd.nibblesB,
        nibblesZ: fd.nibblesZ,
        activeNibbles: fd.activeNibbles,
        label: fd.label,
        widthBits: fd.width,
        opSymbol: fd.opSymbol
      }
    };

    const stWT = makeState({ floorMode: 'wavetable' });
    const fWT = Engine.floorField(stWT, 0.25, bwOpts);
    assert.equal(fWT.mode, 'wavetable');
    assert.equal(fWT.sourceLabel, 'BITWAVE 256b');
    assert.ok(fWT.dynamics && isFinite(fWT.dynamics.rmsDb));
    assert.equal(fWT.rows.length, 28);

    const stSpec = makeState({ floorMode: 'spectrogram' });
    const fSpec = Engine.floorField(stSpec, 0.25, bwOpts);
    assert.equal(fSpec.mode, 'spectrogram');
    assert.equal(fSpec.sourceLabel, 'BITWAVE 256b');
    assert.ok(fSpec.pitch && fSpec.pitch.freqHz > 20);
    assert.ok(fSpec.eqCenter.some((v) => v > 0.15));
  });

  it('ModMatrix tap_bitwave deterministically modulates parameters from the active BitWave register', () => {
    const state = makeState({ phaseRad: 0 });
    ModMatrix.captureBase(state);

    // Load a known flat-high register (all 0xF -> +0.875) vs flat-low register (all 0x0 -> -1.0)
    BitWaveFeed.ingest('FFFFFFFFFFFFFFFF');
    ModMatrix.addRoute('tap_bitwave', 'phaseDeg', 0.5, 'linear');
    ModMatrix.evaluate(state, 0.25, 0.016);
    const highDeg = state.phaseRad * 180 / Math.PI;
    assert.ok(highDeg > 60, `expected positive phase deflection for 0xF register, got ${highDeg}`);

    BitWaveFeed.ingest('0000000000000000');
    ModMatrix.evaluate(state, 0.25, 0.016);
    const lowDeg = state.phaseRad * 180 / Math.PI;
    assert.ok(lowDeg < -60, `expected negative phase deflection for 0x0 register, got ${lowDeg}`);

    // Clearing routes restores exact base value
    ModMatrix.clearRoutes();
    ModMatrix.evaluate(state, 0.25, 0.016);
    assert.ok(Math.abs(state.phaseRad) < 1e-6);
  });
});
