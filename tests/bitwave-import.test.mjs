// Read-only BitWave import projection tests.
// Expected values are derived from BitWave's documented canonical vectors
// (BitWave AGENTS.md), the frozen .bitwave schema (BitWave src/core/project.ts)
// and the fixtures on disk — never from the viewer page or a rendered panel.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const require = createRequire(import.meta.url);
const API = require('../js/bitwave-import.js');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = join(ROOT, 'spike', 'fixtures');
const LANE_KEYS = ['1', '2', '3'];
const FRAME_KEYS = ['a', 'b', 'z'];
const SUCCESS_KEYS = [
  'ok', 'importSchemaVersion', 'schemaVersion', 'width', 'lanes',
  'focus', 'view', 'routes', 'provenance', 'warnings'
];
const LANE_OUT_KEYS = [
  'id', 'op', 'opSymbol', 'labels', 'frames', 'focus', 'frameVis',
  'sources', 'driven', 'expressions', 'truthCounts'
];
const FRAME_OUT_KEYS = ['key', 'label', 'hex', 'nibbles', 'popcount'];
const FRAME_LABELS = {
  '1': { a: 'A', b: 'B', z: 'Z1' },
  '2': { a: 'C', b: 'D', z: 'Z2' },
  '3': { a: 'E', b: 'F', z: 'Z3' }
};
const ERROR_CODES = [
  'E_BITWAVE_INPUT', 'E_BITWAVE_JSON', 'E_BITWAVE_SHARE',
  'E_BITWAVE_SCHEMA', 'E_BITWAVE_WIDTH', 'E_BITWAVE_PROJECT'
];

const fixture = (name) => JSON.parse(readFileSync(join(FIXTURES, name), 'utf8'));
const clone = (value) => JSON.parse(JSON.stringify(value));
const sharePayload = (value) => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
const shareText = (text) => Buffer.from(text, 'utf8').toString('base64url');
const shareBytes = (bytes) => Buffer.from(Uint8Array.from(bytes)).toString('base64url');

// Independent BigInt mirror of BitWave derive.ts/registers.ts, used only to derive
// expected fixture values (the module under test is not consulted).
function bigFromHex(text, N) {
  const clean = String(text).trim().replace(/^0[xX]/, '');
  if (clean === '') return 0n;
  return BigInt('0x' + clean) & ((1n << BigInt(N)) - 1n);
}
function normalizedHex(text, N) {
  return bigFromHex(text, N).toString(16).toUpperCase().padStart(N / 4, '0');
}
function expectedZ(laneDocument, N) {
  const a = bigFromHex(laneDocument.a, N);
  const b = bigFromHex(laneDocument.b, N);
  const mask = (1n << BigInt(N)) - 1n;
  const op = laneDocument.binop;
  const z = op === 'and' ? a & b
    : op === 'or' ? a | b
      : op === 'xor' ? a ^ b
        : op === 'add' ? (a + b) & mask
          : (a - b) & mask;
  return z.toString(16).toUpperCase().padStart(N / 4, '0');
}
function popcountHex(text, N) {
  let v = bigFromHex(text, N);
  let count = 0;
  while (v > 0n) { v &= v - 1n; count += 1; }
  return count;
}
function expectedTruthCounts(laneDocument, N) {
  const a = bigFromHex(laneDocument.a, N);
  const b = bigFromHex(laneDocument.b, N);
  const counts = [0, 0, 0, 0];
  for (let i = 0; i < N; i++) {
    const aBit = (a >> BigInt(i)) & 1n;
    const bBit = (b >> BigInt(i)) & 1n;
    counts[Number((aBit << 1n) | bBit)] += 1;
  }
  return counts;
}

// ---- minimal documents ---------------------------------------------------------
function baseLane(over = {}) {
  return {
    a: '0', b: '0', showB: false, binop: 'xor',
    edit: 'a', seededB: false, lfoB: '0', colA: -1, colB: -1,
    focus: 'a', frameVis: { a: true, b: true, z: true },
    ...over
  };
}
function minimalDoc(N = 64, over = {}) {
  const lanes = {};
  for (const key of LANE_KEYS) {
    lanes[key] = baseLane((over.lanes && over.lanes[key]) || {});
  }
  const doc = {
    schema: over.schema === undefined ? 3 : over.schema,
    app: 'bitwave',
    N,
    view: over.view === undefined
      ? { lane: '1', view3d: false, split3d: false }
      : over.view,
    lanes,
    routes: over.routes === undefined ? [] : over.routes,
    parked: over.parked === undefined ? {} : over.parked
  };
  if (over.savedAt !== undefined) doc.savedAt = over.savedAt;
  if (over.dataset !== undefined) doc.dataset = over.dataset;
  return doc;
}
function expectProjectError(input, label) {
  const result = API.bitwaveImport(input);
  assert.equal(result.ok, false, label || 'expected failure');
  assert.equal(result.error.code, 'E_BITWAVE_PROJECT', label || 'expected E_BITWAVE_PROJECT');
  return result;
}

// ===============================================================================
// Module surface
// ===============================================================================

test('module surface is the frozen BitWave import API', () => {
  assert.equal(API.IMPORT_SCHEMA_VERSION, 1);
  assert.equal(API.PROJECT_SCHEMA_MAX, 3);
  assert.deepEqual(API.WIDTHS, [8, 16, 32, 64, 128, 256]);
  assert.deepEqual(API.LANE_KEYS, ['1', '2', '3']);
  assert.deepEqual(API.FRAME_KEYS, ['a', 'b', 'z']);
  assert.deepEqual(API.OPS, ['and', 'or', 'xor', 'add', 'sub']);
  assert.deepEqual(API.OP_SYMBOLS, {
    and: '\u2227', or: '\u2228', xor: '\u2295', add: '+', sub: '\u2212'
  });
  assert.deepEqual(API.FRAME_LABELS, FRAME_LABELS);
  assert.deepEqual(API.ERROR_CODES, ERROR_CODES);
  assert.equal(typeof API.bitwaveImport, 'function');
  assert.equal(API.importProject, API.bitwaveImport);
  assert.deepEqual(Object.keys(API).sort(), [
    'ERROR_CODES', 'FRAME_KEYS', 'FRAME_LABELS', 'IMPORT_SCHEMA_VERSION',
    'LANE_KEYS', 'OPS', 'OP_SYMBOLS', 'PROJECT_SCHEMA_MAX', 'WIDTHS',
    'bitwaveImport', 'importProject'
  ]);
});

test('module source never uses eval or Function (no code execution path)', () => {
  const source = readFileSync(join(ROOT, 'js', 'bitwave-import.js'), 'utf8');
  assert.equal(/\beval\s*\(/.test(source), false, 'no eval(');
  assert.equal(/\bnew\s+Function\s*\(/.test(source), false, 'no new Function(');
  assert.equal(/(^|[^.\w])Function\s*\(/.test(source), false, 'no Function(');
});

test('classic-script dual export: window.Harmony.BitWaveImport and module.exports', () => {
  const source = readFileSync(join(ROOT, 'js', 'bitwave-import.js'), 'utf8');
  // Browser-like sandbox: a pre-existing Harmony namespace must be preserved.
  const sandbox = { window: { Harmony: { engine: { marker: true } } }, module: { exports: {} } };
  runInNewContext(source, sandbox);
  assert.equal(typeof sandbox.window.Harmony.BitWaveImport, 'object');
  assert.equal(typeof sandbox.window.Harmony.BitWaveImport.bitwaveImport, 'function');
  assert.equal(sandbox.window.Harmony.engine.marker, true, 'existing Harmony survives');
  assert.equal(sandbox.module.exports, sandbox.window.Harmony.BitWaveImport);

  // A missing namespace is created; no DOM is touched at load time.
  const bare = { window: {}, module: { exports: {} } };
  runInNewContext(source, bare);
  assert.equal(typeof bare.window.Harmony.BitWaveImport.bitwaveImport, 'function');
  assert.equal(bare.window.Harmony.BitWaveImport.importProject,
    bare.window.Harmony.BitWaveImport.bitwaveImport);
  assert.equal(bare.module.exports.IMPORT_SCHEMA_VERSION, 1);
});

// ===============================================================================
// Canonical vectors
// ===============================================================================

const canonicalDoc = fixture('canonical-vectors.bitwave.json');

test('canonical fixture: success envelope, schema, width and key order', () => {
  const result = API.bitwaveImport(canonicalDoc, { name: 'canonical-vectors.bitwave.json' });
  assert.equal(result.ok, true);
  assert.deepEqual(Object.keys(result), SUCCESS_KEYS);
  assert.equal(result.importSchemaVersion, 1);
  assert.equal(result.schemaVersion, 3);
  assert.equal(result.width, 64);
  assert.equal(result.view, '2d');
  assert.deepEqual(result.focus, { lane: 1, frame: 'z', label: 'Z1' });
  assert.deepEqual(result.routes, []);
  assert.equal(result.provenance.source, 'file');
  assert.equal(result.provenance.name, 'canonical-vectors.bitwave.json');
  assert.equal(result.provenance.savedAt, '2026-11-09T00:00:00.000Z');
  assert.deepEqual(result.warnings, []);
  assert.equal(result.lanes.length, 3);
  assert.deepEqual(result.lanes.map((lane) => lane.id), [1, 2, 3]);
  assert.doesNotThrow(() => JSON.stringify(result));
  assert.deepEqual(API.importProject(canonicalDoc), API.bitwaveImport(canonicalDoc));
});

test('canonical fixture: lane 1 A/B/Z1 exact, nibbles, popcount, truthCounts', () => {
  const result = API.bitwaveImport(canonicalDoc);
  const lane = result.lanes[0];
  assert.deepEqual(Object.keys(lane), LANE_OUT_KEYS);
  assert.deepEqual(Object.keys(lane.frames.a), FRAME_OUT_KEYS);
  assert.equal(lane.id, 1);
  assert.equal(lane.op, 'xor');
  assert.equal(lane.opSymbol, '\u2295');
  assert.deepEqual(lane.labels, { a: 'A', b: 'B', z: 'Z1' });

  assert.deepEqual(lane.frames.a, {
    key: 'a',
    label: 'A',
    hex: '8ADEFEDA85210125',
    nibbles: [8, 10, 13, 14, 15, 14, 13, 10, 8, 5, 2, 1, 0, 1, 2, 5],
    popcount: 30
  });
  assert.equal(lane.frames.b.hex, 'FFFFFFFF00000000');
  assert.equal(lane.frames.b.popcount, 32);
  assert.equal(lane.frames.z.key, 'z');
  assert.equal(lane.frames.z.label, 'Z1');
  assert.equal(lane.frames.z.hex, '7521012585210125');
  assert.equal(lane.frames.z.popcount, 20);
  assert.deepEqual(
    lane.frames.z.nibbles,
    [7, 5, 2, 1, 0, 1, 2, 5, 8, 5, 2, 1, 0, 1, 2, 5]
  );
  assert.deepEqual(lane.truthCounts, [23, 11, 9, 21]);
  assert.equal(lane.focus, 'z');
  assert.deepEqual(lane.frameVis, { a: true, b: true, z: true });
  assert.deepEqual(lane.sources, { a: { kind: 'stored' }, b: { kind: 'stored' } });
  assert.deepEqual(lane.driven, { a: false, b: false });
  assert.deepEqual(lane.expressions, { a: null, b: null });
});

test('canonical fixture: lanes 2 and 3 labels, ops and derived Z', () => {
  const result = API.bitwaveImport(canonicalDoc);
  const lane2 = result.lanes[1];
  const lane3 = result.lanes[2];
  assert.deepEqual(lane2.labels, { a: 'C', b: 'D', z: 'Z2' });
  assert.equal(lane2.op, 'xor');
  assert.equal(lane2.frames.a.hex, '0123456789ABCDEF');
  assert.equal(lane2.frames.b.hex, 'FEDCBA9876543210');
  assert.equal(lane2.frames.z.hex, 'FFFFFFFFFFFFFFFF');
  assert.equal(lane2.frames.z.popcount, 64);
  assert.deepEqual(lane2.truthCounts, [0, 32, 32, 0]);

  assert.deepEqual(lane3.labels, { a: 'E', b: 'F', z: 'Z3' });
  assert.equal(lane3.op, 'and');
  assert.equal(lane3.opSymbol, '\u2227');
  assert.equal(lane3.frames.a.hex, 'F0F0F0F0F0F0F0F0');
  assert.equal(lane3.frames.b.hex, '0F0F0F0F0F0F0F0F');
  assert.equal(lane3.frames.z.hex, '0000000000000000');
  assert.equal(lane3.frames.z.popcount, 0);
  assert.deepEqual(lane3.truthCounts, [0, 32, 32, 0]);
});

test('canonical fixture: object input and JSON text input agree', () => {
  const fromObject = API.bitwaveImport(canonicalDoc);
  const fromText = API.bitwaveImport(JSON.stringify(canonicalDoc));
  assert.deepEqual(fromText, fromObject);
  assert.equal(fromObject.provenance.source, 'file');
  assert.equal('name' in fromObject.provenance, false);
  assert.equal(fromObject.provenance.savedAt, '2026-11-09T00:00:00.000Z');
});

// ===============================================================================
// Share link codec (canonical link path built with Buffer base64url in-test)
// ===============================================================================

test('canonical share link imports identically from URL, hash, bw= and bare payload', () => {
  const payload = Buffer.from(JSON.stringify(canonicalDoc), 'utf8').toString('base64url');
  const fileResult = API.bitwaveImport(canonicalDoc);
  const forms = {
    'https URL': 'https://bitwave.example/bitwave-v2.html#bw=' + payload,
    'file URL': 'file:///C:/BitWave/bitwave-v2.html#bw=' + payload,
    'hash only': '#bw=' + payload,
    'bw= prefix': 'bw=' + payload,
    'bare payload': payload,
    'hash only with whitespace': '  #bw=' + payload + '  '
  };
  for (const [label, input] of Object.entries(forms)) {
    const result = API.bitwaveImport(input, { name: 'canonical-link' });
    assert.equal(result.ok, true, label);
    assert.equal(result.importSchemaVersion, 1, label);
    assert.equal(result.provenance.source, 'link', label);
    assert.equal(result.provenance.name, 'canonical-link', label);
    assert.equal(result.provenance.savedAt, fileResult.provenance.savedAt, label);
    assert.deepEqual(result.lanes, fileResult.lanes, label);
    assert.deepEqual(result.focus, fileResult.focus, label);
    assert.deepEqual(result.routes, fileResult.routes, label);
    assert.equal(result.lanes[0].frames.a.hex, '8ADEFEDA85210125', label);
    assert.equal(result.lanes[0].frames.z.hex, '7521012585210125', label);
    assert.deepEqual(result.lanes[0].truthCounts, [23, 11, 9, 21], label);
  }
});

test('share payload decodes UTF-8 correctly (non-ASCII expression survives)', () => {
  const doc = minimalDoc(8, { schema: 3 });
  doc.lanes['1'].expressions = { a: 'round(π * B)' };
  const payload = sharePayload(doc);
  const result = API.bitwaveImport('#bw=' + payload);
  assert.equal(result.ok, true);
  assert.equal(result.lanes[0].expressions.a, 'round(π * B)');
});

// ===============================================================================
// The three real fixtures
// ===============================================================================

test('demo fixture: schema 2, 64-bit, routed sources, dataset note', () => {
  const doc = fixture('demo.bitwave.json');
  const result = API.bitwaveImport(doc, { name: 'demo.bitwave.json' });
  assert.equal(result.ok, true);
  assert.equal(result.schemaVersion, 2);
  assert.equal(result.width, 64);
  assert.equal(result.view, '2d');
  assert.deepEqual(result.focus, { lane: 1, frame: 'z', label: 'Z1' });
  assert.equal(result.provenance.source, 'file');
  assert.equal(result.provenance.name, 'demo.bitwave.json');
  assert.equal(result.provenance.savedAt, '2026-11-05T00:00:00.000Z');

  assert.deepEqual(result.routes, [
    { from: '3.z', to: '1.a', mix: 'set' },
    { from: '1.z', to: '2.a', mix: 'set' }
  ]);
  assert.deepEqual(result.lanes[0].sources, {
    a: { kind: 'route', from: '3.z', mix: 'set', sameLane: false },
    b: { kind: 'stored' }
  });
  assert.deepEqual(result.lanes[0].driven, { a: true, b: false });
  assert.deepEqual(result.lanes[1].sources, {
    a: { kind: 'route', from: '1.z', mix: 'set', sameLane: false },
    b: { kind: 'stored' }
  });
  assert.deepEqual(result.lanes[1].driven, { a: true, b: false });
  assert.deepEqual(result.lanes[2].sources, {
    a: { kind: 'stored' }, b: { kind: 'stored' }
  });
  assert.deepEqual(result.lanes[2].driven, { a: false, b: false });

  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /dataset present but not rendered/);
  assert.equal('dataset' in result, false, 'dataset is never rendered');
  assert.equal('parked' in result, false, 'parked is validation-only');

  for (const laneKey of LANE_KEYS) {
    const laneDoc = doc.lanes[laneKey];
    const lane = result.lanes[Number(laneKey) - 1];
    assert.equal(lane.frames.a.hex, normalizedHex(laneDoc.a, doc.N), 'demo A ' + laneKey);
    assert.equal(lane.frames.b.hex, normalizedHex(laneDoc.b, doc.N), 'demo B ' + laneKey);
    assert.equal(lane.frames.z.hex, expectedZ(laneDoc, doc.N), 'demo Z ' + laneKey);
    assert.deepEqual(lane.truthCounts, expectedTruthCounts(laneDoc, doc.N), 'demo counts ' + laneKey);
  }
});

test('glv fixture: schema 3, 256-bit dense frames', () => {
  const doc = fixture('glv-3phase-orbit.bitwave.json');
  const result = API.bitwaveImport(doc);
  assert.equal(result.ok, true);
  assert.equal(result.schemaVersion, 3);
  assert.equal(result.width, 256);
  assert.equal(result.provenance.source, 'file');
  assert.equal('savedAt' in result.provenance, false);
  assert.deepEqual(result.routes, []);
  assert.deepEqual(result.warnings, []);
  assert.equal(result.lanes[0].frames.a.hex,
    '79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798');
  assert.equal(result.lanes[0].frames.a.hex.length, 64);
  assert.equal(result.lanes[0].frames.a.nibbles.length, 64);
  assert.equal(result.lanes[0].frames.z.nibbles.length, 64);
  for (const laneKey of LANE_KEYS) {
    const laneDoc = doc.lanes[laneKey];
    const lane = result.lanes[Number(laneKey) - 1];
    assert.equal(lane.frames.a.hex, normalizedHex(laneDoc.a, 256));
    assert.equal(lane.frames.b.hex, normalizedHex(laneDoc.b, 256));
    assert.equal(lane.frames.z.hex, expectedZ(laneDoc, 256));
    assert.equal(lane.frames.z.popcount, popcountHex(expectedZ(laneDoc, 256), 256));
    for (const frameKey of FRAME_KEYS) {
      assert.equal(lane.frames[frameKey].hex.length, 64, frameKey + ' hex width');
      assert.equal(lane.frames[frameKey].nibbles.length, 64, frameKey + ' nibbles');
    }
  }
});

test('rallentando fixture: schema 3, 32-bit, dataset column sources', () => {
  const doc = fixture('rallentando-drift-n32.bitwave.json');
  const result = API.bitwaveImport(doc, { name: 'rallentando-drift-n32.bitwave.json' });
  assert.equal(result.ok, true);
  assert.equal(result.schemaVersion, 3);
  assert.equal(result.width, 32);
  assert.deepEqual(result.focus, { lane: 1, frame: 'z', label: 'Z1' });
  assert.equal(result.lanes[0].frames.a.hex, 'D5C28803');
  assert.equal(result.lanes[0].frames.a.nibbles.length, 8);
  assert.deepEqual(result.lanes[0].sources, {
    a: { kind: 'dataset', column: 'a', index: 3 },
    b: { kind: 'dataset', column: 'b', index: 4 }
  });
  assert.deepEqual(result.lanes[1].sources, {
    a: { kind: 'dataset', column: 'e', index: 7 },
    b: { kind: 'dataset', column: 'f', index: 8 }
  });
  assert.deepEqual(result.lanes[2].sources, {
    a: { kind: 'dataset', column: 'W', index: 1 },
    b: { kind: 'dataset', column: 'K', index: 2 }
  });
  for (const lane of result.lanes) {
    assert.deepEqual(lane.driven, { a: false, b: false });
  }
  assert.equal(result.warnings.filter((w) => /dataset/.test(w)).length, 1);
  for (const laneKey of LANE_KEYS) {
    const laneDoc = doc.lanes[laneKey];
    const lane = result.lanes[Number(laneKey) - 1];
    assert.equal(lane.frames.a.hex, normalizedHex(laneDoc.a, 32));
    assert.equal(lane.frames.b.hex, normalizedHex(laneDoc.b, 32));
    assert.equal(lane.frames.z.hex, expectedZ(laneDoc, 32));
    assert.deepEqual(lane.truthCounts, expectedTruthCounts(laneDoc, 32));
  }
});

// ===============================================================================
// Schema handling
// ===============================================================================

test('schema 1 is accepted with documented defaults', () => {
  const doc = minimalDoc(8, { schema: 1 });
  for (const laneKey of LANE_KEYS) {
    delete doc.lanes[laneKey].focus;
    delete doc.lanes[laneKey].frameVis;
    delete doc.lanes[laneKey].expressions;
  }
  delete doc.view;
  delete doc.routes;
  delete doc.parked;
  const result = API.bitwaveImport(doc);
  assert.equal(result.ok, true);
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.width, 8);
  assert.deepEqual(result.focus, { lane: 1, frame: 'a', label: 'A' });
  assert.equal(result.view, '2d');
  assert.deepEqual(result.routes, []);
  assert.deepEqual(result.warnings, []);
  for (const lane of result.lanes) {
    assert.equal(lane.focus, 'a');
    assert.deepEqual(lane.frameVis, { a: true, b: true, z: true });
    assert.deepEqual(lane.expressions, { a: null, b: null });
    assert.deepEqual(lane.sources, { a: { kind: 'stored' }, b: { kind: 'stored' } });
    assert.deepEqual(lane.driven, { a: false, b: false });
    assert.deepEqual(lane.truthCounts, [8, 0, 0, 0]);
  }
});

test('schema 2 lenient view/focus/frameVis fields fall back deterministically', () => {
  const doc = minimalDoc(16, {
    schema: 2,
    view: { lane: '2', view3d: true },
    lanes: {
      '1': { focus: 'b' },
      '2': { frameVis: { a: false, b: true } },
      '3': { focus: 'nope', frameVis: 'nope' }
    }
  });
  const result = API.bitwaveImport(doc);
  assert.equal(result.ok, true);
  assert.equal(result.schemaVersion, 2);
  assert.deepEqual(result.focus, { lane: 2, frame: 'a', label: 'C' });
  assert.equal(result.view, '3d');
  assert.equal(result.lanes[0].focus, 'b');
  assert.deepEqual(result.lanes[1].frameVis, { a: false, b: true, z: true });
  assert.equal(result.lanes[2].focus, 'a');
  assert.deepEqual(result.lanes[2].frameVis, { a: true, b: true, z: true });
});

test('split3d wins over view3d for the provenance view mode', () => {
  const doc = minimalDoc(8, { view: { lane: '1', view3d: true, split3d: true } });
  assert.equal(API.bitwaveImport(doc).view, 'split');
});

test('schema 4 is refused with the documented message', () => {
  const doc = minimalDoc(16, { schema: 4 });
  const result = API.bitwaveImport(doc);
  assert.equal(result.ok, false);
  assert.deepEqual(Object.keys(result), ['ok', 'importSchemaVersion', 'error']);
  assert.equal(result.importSchemaVersion, 1);
  assert.equal(result.error.code, 'E_BITWAVE_SCHEMA');
  assert.match(result.error.message,
    /BitWave schema 4 is not supported by this viewer; update the viewer or re-save as schema 3/);
  assert.ok(ERROR_CODES.includes(result.error.code));
});

test('any other non-1/2/3 schema is refused with E_BITWAVE_SCHEMA', () => {
  const cases = [5, 0, -1, 2.5, '3', null, true];
  for (const schema of cases) {
    const doc = minimalDoc(16);
    doc.schema = schema;
    const result = API.bitwaveImport(doc);
    assert.equal(result.ok, false, 'schema ' + String(schema));
    assert.equal(result.error.code, 'E_BITWAVE_SCHEMA', 'schema ' + String(schema));
  }
  const missing = minimalDoc(16);
  delete missing.schema;
  const result = API.bitwaveImport(missing);
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'E_BITWAVE_SCHEMA');
});

// ===============================================================================
// Width handling
// ===============================================================================

test('all six documented widths are accepted with N/4 nibbles', () => {
  for (const N of API.WIDTHS) {
    const result = API.bitwaveImport(minimalDoc(N));
    assert.equal(result.ok, true, 'width ' + N);
    assert.equal(result.width, N);
    for (const lane of result.lanes) {
      for (const frameKey of FRAME_KEYS) {
        assert.equal(lane.frames[frameKey].hex.length, N / 4, 'hex width ' + N + ' ' + frameKey);
        assert.equal(lane.frames[frameKey].nibbles.length, N / 4, 'nibbles ' + N + ' ' + frameKey);
        assert.match(lane.frames[frameKey].hex, /^[0-9A-F]*$/);
      }
    }
  }
});

test('widths outside the documented set are refused with E_BITWAVE_WIDTH', () => {
  for (const N of [7, 9, 24, 100, 512]) {
    const result = API.bitwaveImport(minimalDoc(N));
    assert.equal(result.ok, false, 'width ' + N);
    assert.equal(result.error.code, 'E_BITWAVE_WIDTH', 'width ' + N);
  }
  for (const N of [undefined, null, '64', 64.5, NaN, Infinity]) {
    const doc = minimalDoc(64);
    if (N === undefined) delete doc.N; else doc.N = N;
    const result = API.bitwaveImport(doc);
    assert.equal(result.ok, false, 'N ' + String(N));
    assert.equal(result.error.code, 'E_BITWAVE_WIDTH', 'N ' + String(N));
  }
});

// ===============================================================================
// Derivation: bitwise ops and ADD/SUB wrap
// ===============================================================================

test('add and sub wrap modulo 2^N', () => {
  const add = API.bitwaveImport(minimalDoc(64, {
    lanes: { '1': { a: 'FFFFFFFFFFFFFFFF', b: '0000000000000001', binop: 'add' } }
  }));
  assert.equal(add.ok, true);
  assert.equal(add.lanes[0].op, 'add');
  assert.equal(add.lanes[0].opSymbol, '+');
  assert.equal(add.lanes[0].frames.z.hex, '0000000000000000');
  assert.equal(add.lanes[0].frames.z.popcount, 0);

  const sub = API.bitwaveImport(minimalDoc(64, {
    lanes: { '1': { a: 'FFFFFFFFFFFFFFFF', b: '0000000000000001', binop: 'sub' } }
  }));
  assert.equal(sub.ok, true);
  assert.equal(sub.lanes[0].op, 'sub');
  assert.equal(sub.lanes[0].opSymbol, '\u2212');
  assert.equal(sub.lanes[0].frames.z.hex, 'FFFFFFFFFFFFFFFE');

  const add8 = API.bitwaveImport(minimalDoc(8, {
    lanes: { '1': { a: 'FF', b: '01', binop: 'add' } }
  }));
  assert.equal(add8.lanes[0].frames.z.hex, '00');

  const sub8 = API.bitwaveImport(minimalDoc(8, {
    lanes: { '1': { a: '00', b: '01', binop: 'sub' } }
  }));
  assert.equal(sub8.lanes[0].frames.z.hex, 'FF');
});

test('and/or/xor are bitwise and carrier truth counts follow (a<<1)|b', () => {
  const and = API.bitwaveImport(minimalDoc(8, {
    lanes: { '1': { a: 'F0', b: 'CC', binop: 'and' } }
  }));
  assert.equal(and.lanes[0].frames.z.hex, 'C0');
  assert.deepEqual(and.lanes[0].truthCounts, [2, 2, 2, 2]);

  const or = API.bitwaveImport(minimalDoc(8, {
    lanes: { '1': { a: 'F0', b: '0F', binop: 'or' } }
  }));
  assert.equal(or.lanes[0].frames.z.hex, 'FF');

  const xor = API.bitwaveImport(minimalDoc(8, {
    lanes: { '1': { a: 'F0', b: '0F', binop: 'xor' } }
  }));
  assert.equal(xor.lanes[0].frames.z.hex, 'FF');
  assert.deepEqual(xor.lanes[0].truthCounts, [0, 4, 4, 0]);
});

// ===============================================================================
// Hex normalization, truncation warnings, provenance
// ===============================================================================

test('hex fields normalize trim, 0x, case, empty zero and right alignment', () => {
  const doc = minimalDoc(16, {
    lanes: {
      '1': { a: '  0x00ff  ', b: '' },
      '2': { a: 'ff', b: '0X0ff' }
    }
  });
  const result = API.bitwaveImport(doc);
  assert.equal(result.ok, true);
  assert.equal(result.lanes[0].frames.a.hex, '00FF');
  assert.equal(result.lanes[0].frames.b.hex, '0000');
  assert.equal(result.lanes[1].frames.a.hex, '00FF');
  assert.equal(result.lanes[1].frames.b.hex, '00FF');
  assert.deepEqual(result.warnings, []);
});

test('over-wide hex truncates high bits and warns once per field, in lane order', () => {
  const doc = minimalDoc(8, {
    lanes: {
      '1': { a: '1FF' },
      '3': { b: '12F' }
    }
  });
  const result = API.bitwaveImport(doc);
  assert.equal(result.ok, true);
  assert.equal(result.lanes[0].frames.a.hex, 'FF');
  assert.equal(result.lanes[0].frames.a.popcount, 8);
  assert.equal(result.lanes[2].frames.b.hex, '2F');
  assert.equal(result.warnings.length, 2);
  assert.match(result.warnings[0], /lanes\.1\.a: hex value is wider than 8 bits; the high bits were truncated/);
  assert.match(result.warnings[1], /lanes\.3\.b: hex value is wider than 8 bits; the high bits were truncated/);
  assert.equal(result.warnings[0].includes('truncated'), true);
});

test('over-wide leading zeros are not a loss and produce no warning', () => {
  const result = API.bitwaveImport(minimalDoc(8, {
    lanes: { '1': { a: '00FF', b: '00000001' } }
  }));
  assert.equal(result.ok, true);
  assert.equal(result.lanes[0].frames.a.hex, 'FF');
  assert.equal(result.lanes[0].frames.b.hex, '01');
  assert.deepEqual(result.warnings, []);
});

test('provenance records source, optional name and savedAt only when strings', () => {
  const noMeta = minimalDoc(8);
  assert.deepEqual(API.bitwaveImport(noMeta).provenance, { source: 'file' });

  const named = API.bitwaveImport(noMeta, { name: 'named.bitwave.json' });
  assert.deepEqual(Object.keys(named.provenance), ['source', 'name']);
  assert.deepEqual(named.provenance, { source: 'file', name: 'named.bitwave.json' });

  const saved = minimalDoc(8, { savedAt: '1970-01-01T00:00:00.000Z' });
  assert.deepEqual(API.bitwaveImport(saved).provenance,
    { source: 'file', savedAt: '1970-01-01T00:00:00.000Z' });

  const badSavedAt = minimalDoc(8);
  badSavedAt.savedAt = 42;
  assert.deepEqual(API.bitwaveImport(badSavedAt).provenance, { source: 'file' });

  // opts.source may label the provenance, but invalid values are ignored.
  assert.equal(API.bitwaveImport(noMeta, { source: 'link' }).provenance.source, 'link');
  assert.equal(API.bitwaveImport(noMeta, { source: 'network' }).provenance.source, 'file');
  assert.deepEqual(API.bitwaveImport(noMeta, null).provenance, { source: 'file' });
});

// ===============================================================================
// Routes, parked bases, sources and driven flags
// ===============================================================================

test('dataset source binding wins over a route while driven still tracks the route', () => {
  const doc = minimalDoc(8, {
    routes: [{ from: '1.z', to: '1.a', mix: 'add' }],
    dataset: { cols: ['x', 'y'], rows: [['1', '2']], index: 0 }
  });
  doc.lanes['1'].colA = 1;
  const result = API.bitwaveImport(doc);
  assert.equal(result.ok, true);
  assert.deepEqual(result.lanes[0].sources.a, { kind: 'dataset', column: 'y', index: 1 });
  assert.equal(result.lanes[0].driven.a, true);
  assert.deepEqual(result.routes, [{ from: '1.z', to: '1.a', mix: 'add' }]);
  assert.equal(result.warnings.filter((w) => /dataset/.test(w)).length, 1);
});

test('route sources carry from/mix/sameLane; unknown mix normalizes to set', () => {
  const doc = minimalDoc(8, {
    routes: [
      { from: '1.b', to: '1.a', mix: 'nope' },
      { from: '2.z', to: '1.b', mix: 'xor' }
    ]
  });
  const result = API.bitwaveImport(doc);
  assert.equal(result.ok, true);
  assert.deepEqual(result.routes, [
    { from: '1.b', to: '1.a', mix: 'set' },
    { from: '2.z', to: '1.b', mix: 'xor' }
  ]);
  assert.deepEqual(result.lanes[0].sources.a, {
    kind: 'route', from: '1.b', mix: 'set', sameLane: true
  });
  assert.deepEqual(result.lanes[0].sources.b, {
    kind: 'route', from: '2.z', mix: 'xor', sameLane: false
  });
  assert.deepEqual(result.lanes[0].driven, { a: true, b: true });
});

test('dataset column outside the dataset columns falls back to stored/route', () => {
  const doc = minimalDoc(8, {
    dataset: { cols: ['x'], rows: [['1']], index: 0 },
    lanes: { '1': { colA: 9, colB: 0 } }
  });
  const result = API.bitwaveImport(doc);
  assert.equal(result.ok, true);
  assert.deepEqual(result.lanes[0].sources.a, { kind: 'stored' });
  assert.deepEqual(result.lanes[0].sources.b, { kind: 'dataset', column: 'x', index: 0 });
});

test('parked bases must match a routed destination and be valid hex', () => {
  const okDoc = minimalDoc(8, {
    routes: [{ from: '3.z', to: '1.a', mix: 'set' }],
    parked: { '1.a': 'AB' }
  });
  const okResult = API.bitwaveImport(okDoc);
  assert.equal(okResult.ok, true);
  assert.equal('parked' in okResult, false);

  const unpatched = minimalDoc(8, { parked: { '2.a': 'AB' } });
  expectProjectError(unpatched, 'parked without a route');

  const zDestination = minimalDoc(8, { parked: { '1.z': 'AB' } });
  expectProjectError(zDestination, 'parked Z destination');

  const badHexDoc = minimalDoc(8, {
    routes: [{ from: '3.z', to: '1.a', mix: 'set' }],
    parked: { '1.a': 'ZZ' }
  });
  expectProjectError(badHexDoc, 'parked bad hex');

  const badShape = minimalDoc(8, { parked: 42 });
  expectProjectError(badShape, 'parked must be an object');
});

// ===============================================================================
// Expressions (schema 3): text only, trimmed, bounded, never executed
// ===============================================================================

test('schema-3 expressions are trimmed text, bounded to 4096 and never executed', () => {
  const long4096 = 'x'.repeat(4096);
  const long4097 = 'x'.repeat(4097);
  const doc = minimalDoc(8, { schema: 3 });
  doc.lanes['1'].expressions = { a: '  round(1.2599210498948732 * B)  ', b: '' };
  doc.lanes['2'].expressions = { a: long4096, b: 42 };
  doc.lanes['3'].expressions = { a: long4097, b: 'globalThis.__bitwavePwned = 1' };

  const result = API.bitwaveImport(doc);
  assert.equal(result.ok, true);
  assert.equal(result.lanes[0].expressions.a, 'round(1.2599210498948732 * B)');
  assert.equal(result.lanes[0].expressions.b, null);
  assert.equal(result.lanes[1].expressions.a, long4096);
  assert.equal(result.lanes[1].expressions.a.length, 4096);
  assert.equal(result.lanes[1].expressions.b, null);
  assert.equal(result.lanes[2].expressions.a, null, 'over-limit expressions drop');
  assert.equal(result.lanes[2].expressions.b, 'globalThis.__bitwavePwned = 1');
  assert.equal(globalThis.__bitwavePwned, undefined, 'expression text was not executed');
  // Expressions never change the derived frames.
  assert.equal(result.lanes[0].frames.z.hex, '00');
});

// ===============================================================================
// Share decode failures
// ===============================================================================

test('malformed share payloads are refused with E_BITWAVE_SHARE', () => {
  const cases = {
    'impossible length A': '#bw=A',
    'impossible length abcde': '#bw=abcde',
    'non-alphabet': '#bw=!!!!',
    'empty fragment payload': '#bw=',
    'empty bw= payload': 'bw=',
    'invalid UTF-8 lead': '#bw=' + shareBytes([0xff]),
    'overlong UTF-8': '#bw=' + shareBytes([0xc0, 0x80]),
    'truncated UTF-8': '#bw=' + shareBytes([0xe2, 0x82]),
    'surrogate UTF-8': '#bw=' + shareBytes([0xed, 0xa0, 0x80]),
    'JSON syntax inside share': '#bw=' + shareText('{oops'),
    'non-JSON text inside share': '#bw=' + shareText('not json')
  };
  for (const [label, input] of Object.entries(cases)) {
    const result = API.bitwaveImport(input);
    assert.equal(result.ok, false, label);
    assert.equal(result.error.code, 'E_BITWAVE_SHARE', label);
    assert.ok(ERROR_CODES.includes(result.error.code), label);
    assert.equal(result.importSchemaVersion, 1, label);
  }
});

test('valid base64url of non-object JSON is a project error, not a share error', () => {
  const result = API.bitwaveImport('#bw=' + shareText('[]'));
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'E_BITWAVE_PROJECT');
});

// ===============================================================================
// Project validation failures (BitWave schema-1 strictness)
// ===============================================================================

test('bad project shape is refused with E_BITWAVE_PROJECT', () => {
  const cases = {
    'wrong app': (doc) => { doc.app = 'not-bitwave'; },
    'missing app': (doc) => { delete doc.app; },
    'non-object project': () => ({ not: 'a project' }),
    'missing lanes': (doc) => { delete doc.lanes; },
    'lanes null': (doc) => { doc.lanes = null; },
    'lanes array': (doc) => { doc.lanes = []; },
    'missing lane 2': (doc) => { delete doc.lanes['2']; },
    'lane non-object': (doc) => { doc.lanes['3'] = 42; },
    'a not a string': (doc) => { doc.lanes['1'].a = 42; },
    'b not a string': (doc) => { doc.lanes['1'].b = null; },
    'a not hex': (doc) => { doc.lanes['1'].a = 'XYZ'; },
    'b not hex': (doc) => { doc.lanes['1'].b = '0x12x'; },
    'showB not boolean': (doc) => { doc.lanes['1'].showB = 'yes'; },
    'binop unknown': (doc) => { doc.lanes['1'].binop = 'nand'; },
    'colA not integer': (doc) => { doc.lanes['1'].colA = 1.5; },
    'colB not integer': (doc) => { doc.lanes['1'].colB = '3'; },
    'route non-object': (doc) => { doc.routes = [null]; },
    'route missing from': (doc) => { doc.routes = [{ to: '1.a', mix: 'set' }]; },
    'route bad from lane': (doc) => { doc.routes = [{ from: '4.a', to: '1.a', mix: 'set' }]; },
    'route bad from frame': (doc) => { doc.routes = [{ from: '1.q', to: '1.a', mix: 'set' }]; },
    'route bad to port': (doc) => { doc.routes = [{ from: '1.z', to: '1' }]; },
    'route into Z': (doc) => { doc.routes = [{ from: '1.a', to: '2.z', mix: 'set' }]; },
    'duplicate destination': (doc) => {
      doc.routes = [
        { from: '1.z', to: '1.a', mix: 'set' },
        { from: '2.z', to: '1.a', mix: 'xor' }
      ];
    }
  };
  for (const [label, mutate] of Object.entries(cases)) {
    const doc = minimalDoc(8);
    const mutated = mutate(doc);
    const result = API.bitwaveImport(mutated === undefined ? doc : mutated);
    assert.equal(result.ok, false, label);
    assert.equal(result.error.code, 'E_BITWAVE_PROJECT', label);
    assert.equal(typeof result.error.message, 'string', label);
  }
});

// ===============================================================================
// Never throws
// ===============================================================================

test('bitwaveImport never throws and always returns a closed failure envelope', () => {
  const inputs = [
    null, undefined, 42, 42.5, true, false, [], ['x'],
    'garbage', '{}', '', 'not a bitwave', '#bw=A', 'bw=',
    () => 1, new Date(0), { app: null }, { schema: 3 }, Symbol('bitwave')
  ];
  for (const input of inputs) {
    let result;
    try {
      result = API.bitwaveImport(input);
    } catch (error) {
      assert.fail('threw for ' + String(input) + ': ' + error);
    }
    assert.equal(result.ok, false, String(input));
    assert.equal(result.importSchemaVersion, 1, String(input));
    assert.ok(ERROR_CODES.includes(result.error.code), String(input));
    assert.equal(typeof result.error.message, 'string', String(input));
  }
});

test('input classification codes: input vs JSON vs share vs project', () => {
  const expected = [
    [null, 'E_BITWAVE_INPUT'],
    [42, 'E_BITWAVE_INPUT'],
    ['', 'E_BITWAVE_INPUT'],
    ['not a bitwave', 'E_BITWAVE_INPUT'],
    ['garbage', 'E_BITWAVE_SHARE'],
    ['#bw=A', 'E_BITWAVE_SHARE'],
    ['{}', 'E_BITWAVE_PROJECT']
  ];
  for (const [input, code] of expected) {
    const result = API.bitwaveImport(input);
    assert.equal(result.ok, false, String(input));
    assert.equal(result.error.code, code, String(input));
  }
  const badJson = API.bitwaveImport('{"app": "bitwave",');
  assert.equal(badJson.error.code, 'E_BITWAVE_JSON');
  const badJsonBracket = API.bitwaveImport('[1, 2, 3]');
  assert.equal(badJsonBracket.error.code, 'E_BITWAVE_PROJECT');
});

// ===============================================================================
// Determinism, purity, JSON-safety
// ===============================================================================

test('repeated imports are deterministic and never mutate the input document', () => {
  for (const name of ['canonical-vectors.bitwave.json', 'demo.bitwave.json']) {
    const doc = fixture(name);
    const before = JSON.stringify(doc);
    const first = API.bitwaveImport(doc);
    const second = API.bitwaveImport(doc);
    assert.equal(JSON.stringify(doc), before, name + ' input not mutated');
    assert.deepEqual(first, second, name + ' deep equality');
    assert.equal(JSON.stringify(first), JSON.stringify(second), name + ' byte equality');
    assert.deepEqual(JSON.parse(JSON.stringify(first)), first, name + ' JSON round-trip');
  }
  const payload = Buffer.from(JSON.stringify(canonicalDoc), 'utf8').toString('base64url');
  const linkA = API.bitwaveImport('#bw=' + payload);
  const linkB = API.bitwaveImport('#bw=' + payload);
  assert.deepEqual(linkA, linkB);
});

test('the success envelope contains no BigInt or undefined values', () => {
  const result = API.bitwaveImport(canonicalDoc);
  const visit = (value) => {
    if (value === null) return;
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (typeof value === 'object') {
      for (const key of Object.keys(value)) {
        assert.notEqual(value[key], undefined, 'undefined at ' + key);
        visit(value[key]);
      }
      return;
    }
    assert.notEqual(typeof value, 'bigint');
    assert.ok(['string', 'number', 'boolean'].includes(typeof value));
  };
  visit(result);
  assert.doesNotThrow(() => JSON.stringify(result));
});
