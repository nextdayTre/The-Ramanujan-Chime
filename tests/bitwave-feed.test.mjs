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
    BitWaveFeed.setTwinConfig({ enabled: false, rule: 'twin' });
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

  it('decodes real BitWave v1.5 compact D45 schema-4 #bw= share links (including file:// URLs & 8 lanes)', () => {
    const compactLink = 'file:///C:/Users/trevor/Documents/BitWave/bitwave-v2.html#bw=WzQsNjQsWzEsMCwxLDIsMF0sW1sxLCJBQUpFUW9FaEFTVSIsIl9fX19fd0FBQUFBIiwwLDIsMCwwLCIwIiwtMSwtMSwyXSxbMiwiX18yN3ZZRWhBU1UiLCJBa2FLenV5b1pDQSIsMCwyLDAsMSwiMCIsLTEsLTFdLFszLCJBU05GWjRtcnplOCIsIml0Ny0yb1VoQVNVIiwwLDAsMCwxLCIwIiwtMSwtMSwxLDJdXSxbWzMsMiwxLDAsMF0sWzEsMiwyLDAsMF1dLFtbMSwwLCJpdDctMm9VaEFTVSJdLFsyLDAsIl90cUZJUUVsZXQ0Il1dLFtbImlkIiwic2luZSIsInNxdWFyZSJdLFtbIjEiLCI4QURFRkVEQTg1MjEwMTI1IiwiRkZGRkZGRkYwMDAwMDAwMCJdLFsiMiIsIjg1MjEwMTI1OEFERUZFREEiLCJGRkZGMDAwMEZGRkYwMDAwIl0sWyIzIiwiRkVEQTg1MjEwMTI1N0FERSIsIjBGMEYwRjBGMEYwRjBGMEYiXV0sMV1d';
    const res = BitWaveFeed.ingest(compactLink, { transport: 'paste' });
    assert.equal(res.ok, true);
    const fd = BitWaveFeed.getFeed();
    assert.equal(fd.width, 64);
    assert.equal(fd.lane, '1');
    assert.equal(fd.frame, 'z');
    assert.equal(fd.hexA, '0002444281210125');
    assert.equal(fd.hexB, 'FFFFFFFF00000000');
    assert.equal(fd.hexZ, 'FFFDbbbd81210125'.toUpperCase());
    assert.deepEqual(fd.laneKeys, ['1', '2', '3']);

    // Schema-4 dynamic 8-lane document (lane 8 -> O / P / Z8)
    const doc8 = {
      schema: 4,
      app: 'bitwave',
      N: 32,
      view: { lane: '8' },
      lanes: {
        '1': { a: '8ADEFEDA', b: 'FFFF0000', binop: 'xor', focus: 'z' },
        '8': { a: 'A000000A', b: '5000000A', binop: 'xor', focus: 'z' }
      }
    };
    const r8 = BitWaveFeed.ingest(JSON.stringify(doc8));
    assert.equal(r8.ok, true);
    const fd8 = BitWaveFeed.getFeed();
    assert.equal(fd8.lane, '8');
    assert.equal(fd8.labels.a, 'O');
    assert.equal(fd8.labels.b, 'P');
    assert.equal(fd8.labels.z, 'Z8');
    assert.equal(fd8.hexZ, 'F0000000');
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

  it('Spherical Twin Decompiler produces exact BigInt HEX/DEC/BIN for 8b A5 dipole, Cavity r Gate & 360° Quadrant rules', () => {
    BitWaveFeed.loadPreset('dipole8');
    const fd = BitWaveFeed.getFeed();
    assert.equal(fd.width, 8);
    assert.equal(fd.activeHex, 'A5');

    // At theta=0 deg, 2s-Comp Null: P=0xA5 (165), Conj=0x5A (90), -P=0x5B (91), P + (-P) = 0x00 (Null!)
    const dNull = BitWaveFeed.decompileTwins([0xA, 0x5], { thetaDeg: 0, rule: 'null_add' });
    assert.equal(dNull.P.hex, 'A5');
    assert.equal(dNull.P.dec, '165');
    assert.equal(dNull.P.bin, '1010 0101');
    assert.equal(dNull.conj.hex, '5A');
    assert.equal(dNull.conj.dec, '90');
    assert.equal(dNull.nullTwin.hex, '5B');
    assert.equal(dNull.nullTwin.dec, '91');
    assert.equal(dNull.observed.hex, '00');
    assert.equal(dNull.isNull, true);

    // At theta=180 deg (k = 4 bits on 8-bit width): ROL(0xA5, 4) === 0x5A
    const d180 = BitWaveFeed.decompileTwins([0xA, 0x5], { thetaDeg: 180, twinMode: 'off', rule: 'twin' });
    assert.equal(d180.stepK, 4);
    assert.equal(d180.P.hex, '5A');
    assert.equal(d180.observed.hex, '5A');

    // Cavity r Gate: 0xF8 at eta=0.5 -> 0xF is IN SHELL (flips to 0x0), 0x8 is IN CAVITY (stays 0x8) -> 0x08!
    const dCav = BitWaveFeed.decompileTwins([0xF, 0x8], { thetaDeg: 0, eta: 0.5, rule: 'cavity' });
    assert.deepEqual(dCav.cavityMask, [0, 1]);
    assert.equal(dCav.observed.hex, '08');
    assert.equal(dCav.observed.dec, '8');

    // 360° Quadrant Gate across Q1, Q2, Q3, Q4
    const q1 = BitWaveFeed.decompileTwins([0xA, 0x5], { thetaDeg: 0, rule: 'quadrant' });
    const q2 = BitWaveFeed.decompileTwins([0xA, 0x5], { thetaDeg: 90, rule: 'quadrant' });
    const q3 = BitWaveFeed.decompileTwins([0xA, 0x5], { thetaDeg: 180, rule: 'quadrant' });
    const q4 = BitWaveFeed.decompileTwins([0xA, 0x5], { thetaDeg: 270, rule: 'quadrant' });
    assert.equal(q1.observed.hex, q1.P.hex);
    assert.equal(q2.observed.hex, q2.conj.hex);
    assert.equal(q3.observed.hex, q3.nullTwin.hex);
    assert.equal(q4.quadrant, 4);

    // Follow TWIN toolbar mode on 256-bit register (BigInt exact!)
    BitWaveFeed.loadPreset('pulse256');
    const st = makeState({ twinMode: 'conjugate', phaseRad: 0, playT: 0 });
    BitWaveFeed.setTwinConfig({ enabled: true, rule: 'twin' });
    const d256 = BitWaveFeed.decompileForState(st, 0);
    assert.equal(d256.width, 256);
    assert.equal(d256.observed.hex, d256.conj.hex);
    assert.equal(d256.observed.hex.length, 64);
  });
});
