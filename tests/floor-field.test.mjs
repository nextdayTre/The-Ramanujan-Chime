import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { engine: Engine } = require('../js/engine.js');

test('Engine.freqToNoteCents maps A4=440Hz and G2-15c accurately', () => {
  const a4 = Engine.freqToNoteCents(440);
  assert.equal(a4.note, 'A4');
  assert.equal(a4.cents, 0);

  const g2 = Engine.freqToNoteCents(97.14);
  assert.equal(g2.note, 'G2');
  assert.ok(g2.cents >= -17 && g2.cents <= -14, `expected ~-15 cents, got ${g2.cents}`);
});

test('Engine.floorField wavetable mode stays proportional inside hollow sphere floor and is deterministic', () => {
  const st = {
    r: 1.2, rIn: 0.6, f: 1.0, K: 6, orderN: 16, phaseRad: 0, amp: 1.0,
    archimedesAuto: false, archimedesZNorm: 0.25,
    floorMode: 'wavetable', floorDepth: 0.7, floorSmooth: 0.5, floorSize: 0.94
  };
  const a = Engine.floorField(st, 0.2);
  const b = Engine.floorField(st, 0.2);
  assert.equal(a.mode, 'wavetable');
  assert.equal(a.slices, 28);
  assert.equal(a.bins, 72);
  assert.deepEqual(Array.from(a.activeSlice), Array.from(b.activeSlice));

  for (let s = 0; s < a.slices; s++) {
    const rad = Math.hypot(a.rowHalfW[s], a.rowZ[s]);
    assert.ok(rad <= a.rEff + 1e-4, `row ${s} escapes rEff (${rad} > ${a.rEff})`);
  }
});

test('Engine.floorField spectrogram mode generates bounded 2D EQ, tilt line, 3D dispersion & pitch callout', () => {
  const st = {
    r: 1.0, rIn: 0.67, f: 1.0, K: 8, orderN: 12, phaseRad: 0, amp: 1.0,
    archimedesAuto: true, archimedesZNorm: 0,
    floorMode: 'spectrogram', floorDepth: 0.85, floorSmooth: 0.55, floorSize: 0.94
  };
  const sp = Engine.floorField(st, 0.15);
  assert.equal(sp.mode, 'spectrogram');
  assert.ok(sp.pitch && sp.pitch.freqHz > 32, 'valid peak frequency detected');
  assert.ok(sp.eqCenter.some(v => v > 0.35), '2D EQ has real spectral peaks');
  // Center slices have stronger dispersion energy than far outer edge slices
  const midRow = sp.rows[Math.floor(sp.slices / 2)];
  const edgeRow = sp.rows[0];
  const midPeak = Math.max(...midRow);
  const edgePeak = Math.max(...edgeRow);
  assert.ok(midPeak > edgePeak, `expected center EQ dispersion (${midPeak}) > edge (${edgePeak})`);
});

test('Engine.fftMag and Engine.audioDynamics compute exact sine peak/RMS/crest factor (3.01 dB) & BPM window T', () => {
  const N = 1024;
  const pcm = new Float32Array(N);
  for (let i = 0; i < N; i++) pcm[i] = Math.sin((2 * Math.PI * 16 * i) / N);

  const dyn = Engine.audioDynamics(pcm, 0, N);
  assert.ok(Math.abs(dyn.peak - 1.0) < 1e-3, `peak=${dyn.peak}`);
  assert.ok(Math.abs(dyn.rms - Math.SQRT1_2) < 1e-3, `rms=${dyn.rms}`);
  assert.ok(Math.abs(dyn.crestDb - 3.01) < 0.08, `sine crest factor should be ~3.01 dB, got ${dyn.crestDb}`);

  // FFT of a 256-pt chunk containing 16 cycles -> peak at bin 16
  const chunk = new Float32Array(256);
  for (let j = 0; j < 256; j++) chunk[j] = Math.cos((2 * Math.PI * 16 * j) / 256);
  const mag = Engine.fftMag(chunk, 0, 256);
  let bestBin = 0;
  for (let b = 1; b < mag.length; b++) if (mag[b] > mag[bestBin]) bestBin = b;
  assert.equal(bestBin, 16);

  // BPM temporalRows integration: 120 BPM, 4 beats => T = 2.00s, eta = 0.50 => cavity window = 1.00s
  const rows = Array.from({ length: 28 }, (_, s) => {
    const r = new Float32Array(72);
    r[20] = s === 27 ? 0.9 : (s === 14 ? 0.7 : 0.2);
    return r;
  });
  const st = { r: 1.0, rIn: 0.5, f: 1, K: 6, orderN: 12, phaseRad: 0, amp: 1, floorMode: 'spectrogram', floorBpm: 120, floorBeats: 4 };
  const field = Engine.floorField(st, 0, {
    temporalRows: rows,
    presentRow: rows[14],
    dynamics: dyn,
    bpm: 120,
    windowBeats: 4,
    hasLookahead: true,
    sourceLabel: 'MP3 LOOKAHEAD'
  });
  assert.ok(Math.abs(field.windowSec - 2.0) < 1e-5);
  assert.ok(Math.abs(field.cavityWindowSec - 1.0) < 1e-5);
  assert.ok(Math.abs(field.floorVelocity - 1.0) < 1e-4, '2R / T = 2.0 / 2.0 = 1.0 sphere-diameters/sec');
  assert.equal(field.hasLookahead, true);
  assert.ok(Math.abs(field.dynamics.crestDb - 3.01) < 0.08);

  // Continuous logarithmic Zoom T round-trip (16ms .. 12s)
  const zLog = Engine.floorZoomLogFromSec(2.0);
  assert.ok(Math.abs(Engine.floorZoomSec(zLog) - 2.0) < 1e-3);
  assert.ok(Math.abs(Engine.floorZoomSec(0) - 0.016) < 1e-5);
  assert.ok(Math.abs(Engine.floorZoomSec(1) - 12.0) < 1e-4);
});
