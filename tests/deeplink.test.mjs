// Deeplink grammar + legacy #patch= snapshot tests (docs/AGENT-INTERFACE.md §4, §5).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const AgentCore = require('../js/agent-core.js');

const BASE = 'http://127.0.0.1:8080/';

function url(params) {
  return AgentCore.buildDeeplink(params).url;
}

test('default state emits the bare base URL (no query churn)', () => {
  assert.equal(url({}), BASE);
  const st = AgentCore.defaultState();
  assert.equal(AgentCore.deeplinkForState(st, { presetIndex: st.presetIndex }).url, BASE);
});

test('canonical emitter order is fixed', () => {
  assert.equal(
    url({ preset: 5, tab: 'bits', static: true, playT: 0.25, r: 1.2, phase: 45, twin: 'off',
      mz: 64, mf: 'origin', cut: true, surf: false }),
    // preset 5's hints already enable cutaway, so `cut=1` is not a delta.
    BASE + '?preset=5&tab=bits&static=1&pt=0.25&r=1.2&phase=45&twin=off&mz=64&mf=origin&surf=0'
  );
  // anim/orbit come before pt; formulas last
  assert.equal(
    url({ preset: 12, anim: false, orbit: false, formulas: { x: 'r*u', y: 'r*u', z: '0' } }),
    BASE + '?anim=0&orbit=0&fx=r*u&fy=r*u'
  );
});

test('delta encoding: only values differing from the preset base are emitted', () => {
  assert.equal(url({ preset: 12 }), BASE, 'default preset is the base');
  assert.equal(url({ preset: 5, tab: 'scopes' }), BASE + '?preset=5', 'tab=scopes is the default');
  assert.equal(url({ preset: 5, cut: false }), BASE + '?preset=5&cut=0', 'preset 5 base has cutaway true');
  assert.equal(url({ preset: 5, cut: true }), BASE + '?preset=5', 'matching base cutaway omitted');
  assert.equal(url({ preset: 12, mz: 16 }), BASE, 'mz 16 is the default');
  assert.equal(url({ preset: 12, twin: 'both' }), BASE, 'twin both is the default');
});

test('static mode freezes transport; pt pins the playhead', () => {
  const u = url({ preset: 12, static: true, playT: 0.3 });
  assert.equal(u, BASE + '?static=1&pt=0.3');
  const parsed = AgentCore.parseDeeplink(u);
  assert.deepEqual(parsed.patch.animate, false);
  assert.deepEqual(parsed.patch.autoRotate, false);
  assert.equal(parsed.patch.staticMode, true);
  assert.equal(parsed.patch.playT, 0.3);
  // pt alone implies a paused clock
  const ptOnly = AgentCore.parseDeeplink('?pt=0.5');
  assert.equal(ptOnly.patch.playT, 0.5);
  assert.equal(ptOnly.patch.animate, false);
});

test('formulas survive the URL round-trip', () => {
  const expr = 'r*u + 0.5*sin(TAU*f*t+phase)';
  const u = url({ preset: 12, formulas: { x: expr } });
  assert.ok(u.includes('fx='));
  const parsed = AgentCore.parseDeeplink(u);
  assert.equal(parsed.patch.formulas.x, expr);
  assert.deepEqual(parsed.warnings, []);
});

test('parse is tolerant: invalid enums/numbers fall back and warn without throwing', () => {
  const parsed = AgentCore.parseDeeplink(
    '?preset=99&tab=nope&r=99&rIn=abc&twin=sideways&mz=7&mf=nowhere&qt=maybe&pt=3'
  );
  assert.equal(parsed.presetIndex, 12);
  assert.deepEqual(parsed.patch, {});
  assert.ok(parsed.warnings.length >= 8, 'expected a warning per invalid param, got ' + parsed.warnings.length);
  for (const w of parsed.warnings) assert.equal(typeof w, 'string');

  const empty = AgentCore.parseDeeplink('');
  assert.deepEqual(empty, { presetIndex: 12, patch: {}, warnings: [] });
  const unknown = AgentCore.parseDeeplink('?unknown=1&also=2');
  assert.deepEqual(unknown.patch, {});
  assert.deepEqual(unknown.warnings, []);
});

test('legacy #patch= hash is ignored by the agent parser', () => {
  const parsed = AgentCore.parseDeeplink('#patch=%7B%22p%22%3A5%7D');
  assert.deepEqual(parsed.patch, {});
  assert.equal(parsed.presetIndex, 12);
  // full URLs and bare query strings both work
  assert.equal(AgentCore.parseDeeplink('http://127.0.0.1:8080/?tab=bits').patch.tab, 'bits');
  assert.equal(AgentCore.parseDeeplink('tab=bits&preset=5').presetIndex, 5);
});

test('deeplink build -> parse -> resolve -> re-emit is stable', () => {
  const cases = [
    { preset: 5, tab: 'bits', r: 1.2, phase: 45, twin: 'off', mz: 64, mf: 'origin', cut: true, anim: false },
    { preset: 9, strobe: true, orderN: 41 },
    { preset: 2, tab: 'frobenius', static: true },
    { preset: 3, surf: false, wire: false, grid: false, quadray: false },
    { preset: 12, formulas: { y: 'r*sin(TAU*f*t+phase/2)' }, bit: 'ramanujan' }
  ];
  for (const params of cases) {
    const first = url(params);
    const parsed = AgentCore.parseDeeplink(first);
    const st = AgentCore.resolveState(Object.assign({ preset: parsed.presetIndex }, parsed.patch));
    const second = AgentCore.deeplinkForState(st, { presetIndex: st.presetIndex, staticMode: st.staticMode }).url;
    assert.equal(second, first, 'unstable deeplink for ' + JSON.stringify(params));
  }
});

test('parse -> resolve reproduces the requested view fields', () => {
  const parsed = AgentCore.parseDeeplink('?preset=5&tab=bits&r=1.3&phase=-90&twin=conjugate&mz=256&mf=playhead&cut=0&surf=0');
  const st = AgentCore.resolveState(Object.assign({ preset: parsed.presetIndex }, parsed.patch));
  assert.equal(st.presetIndex, 5);
  assert.equal(st.activeTab, 'bits');
  assert.equal(st.r, 1.3);
  assert.equal(st.phaseDeg, -90);
  assert.equal(st.twinMode, 'conjugate');
  assert.equal(st.toggles.syzygy, true);
  assert.equal(st.magZoom, 256);
  assert.equal(st.magFocus, 'playhead');
  assert.equal(st.toggles.cutaway, false);
  assert.equal(st.toggles.surface, false);
});

test('build_deeplink rejects invalid view args with E_* envelopes', () => {
  const bad = [
    [{ tab: 'nope' }, 'E_BAD_TAB'],
    [{ twin: 'sideways' }, 'E_OUT_OF_RANGE'],
    [{ mz: 7 }, 'E_OUT_OF_RANGE'],
    [{ static: 'yes' }, 'E_BAD_ARGS'],
    [{ base: '' }, 'E_BAD_ARGS'],
    [{ bogus: 1 }, 'E_BAD_ARGS'],
    [{ r: 99 }, 'E_OUT_OF_RANGE']
  ];
  for (const [args, code] of bad) {
    const env = AgentCore.callTool('build_deeplink', args);
    assert.equal(env.ok, false, JSON.stringify(args));
    assert.equal(env.error.code, code, JSON.stringify(args) + ' -> ' + env.error.code);
  }
});

test('resolveState validates and throws typed errors', () => {
  assert.throws(() => AgentCore.resolveState({ tab: 'nope' }), (e) => e.code === 'E_BAD_TAB');
  assert.throws(() => AgentCore.resolveState({ r: 99 }), (e) => e.code === 'E_OUT_OF_RANGE');
  const st = AgentCore.resolveState({ preset: 5, tab: 'harmonics', r: 1.4 });
  assert.equal(st.presetIndex, 5);
  assert.equal(st.activeTab, 'harmonics');
  assert.equal(st.r, 1.4);
});

test('legacy #patch= snapshot codec is byte-compatible with js/app.js', () => {
  const st = AgentCore.defaultState();
  const snap = AgentCore.captureSnapshot(st, 12);
  assert.deepEqual(Object.keys(snap), [
    'p', 'fx', 'fy', 'fz', 'r', 'rIn', 'amp', 'f', 'K', 'orderN',
    'a', 'b', 'n', 'm', 'k', 'ph', 'tw', 'cut', 'sg', 'mag', 'str', 'fb', 'qt', 'mf', 'mz'
  ]);
  assert.deepEqual(snap, {
    p: 12,
    fx: 'r*cos(TAU*f*t+phase)', fy: 'r*sin(TAU*f*t+phase)', fz: '0',
    r: 1, rIn: 0.45, amp: 1, f: 1, K: 6, orderN: 16,
    a: 0.5, b: 3, n: 3, m: 2, k: 1,
    ph: 0, tw: 'both',
    cut: 0, sg: 1, mag: 0, str: 0, fb: 1, qt: 1,
    mf: 'trough', mz: 16
  });
  // json round-trip through the legacy hash
  const hash = '#patch=' + encodeURIComponent(JSON.stringify(snap));
  assert.equal(hash.startsWith('#patch='), true);
  const decoded = JSON.parse(decodeURIComponent(hash.slice(7)));
  assert.deepEqual(decoded, snap);
});

test('snapshotFromPreset matches the page B/C slot defaults', () => {
  const b = AgentCore.snapshotFromPreset(5);
  assert.equal(b.p, 5);
  assert.equal(b.tw, 'conjugate');
  assert.equal(b.cut, 1);
  assert.equal(b.qt, 1);
  assert.equal(b.mf, 'trough');
  const c = AgentCore.snapshotFromPreset(9, { orderN: 41 });
  assert.equal(c.p, 9);
  assert.equal(c.orderN, 41);
  assert.equal(c.str, 1);
  assert.equal(c.r, 1.55);
});

test('stateFromSnapshot reconstructs the snapshot state', () => {
  const snap = AgentCore.captureSnapshot(AgentCore.resolveState({ preset: 5, r: 1.25, phase: 30, twin: 'off' }), 5);
  const patch = AgentCore.stateFromSnapshot(snap);
  assert.equal(patch.presetIndex, 5);
  const st = AgentCore.resolveState(Object.assign({ preset: patch.presetIndex }, patch.patch));
  assert.equal(st.r, 1.25);
  assert.equal(st.phaseDeg, 30);
  assert.equal(st.twinMode, 'off');
  assert.equal(st.toggles.cutaway, true);
});

test('sampleSnapshotPoints uses the shared engine', () => {
  const snap = AgentCore.snapshotFromPreset(12);
  const pts = AgentCore.sampleSnapshotPoints(snap);
  assert.equal(pts.length, AgentCore.SAMPLES + 1);
  assert.equal(pts[0].x, 1);
  assert.equal(pts[0].y, 0);
});

test('projectUiState has the contract shape and no NaN leakage', () => {
  const st = AgentCore.resolveState({ preset: 12, static: true, pt: 0.25 });
  const ui = AgentCore.projectUiState(st, { presetIndex: st.presetIndex, base: BASE, staticMode: true });
  assert.deepEqual(Object.keys(ui), [
    'schemaVersion', 'ready', 'tool', 'preset', 'tab', 'slot', 'inputs', 'formulas',
    'toggles', 'twinMode', 'bitSource', 'magnifier', 'transport', 'derived', 'deeplink', 'bridge'
  ]);
  assert.equal(ui.schemaVersion, 1);
  assert.equal(ui.ready, true);
  assert.equal(ui.tool, 'ramanujan-sphere');
  assert.equal(ui.transport.playT, 0.25);
  assert.equal(ui.transport.staticMode, true);
  assert.equal(ui.tab, 'scopes');
  assert.equal(ui.derived.playhead.valid, true);
  assert.equal(ui.derived.readout.status, 'ON SPHERE');
  assert.equal(ui.bridge.version, '1.0.0');
  // JSON round-trip must not turn NaN into null-silently; there must be no NaN anywhere.
  const json = JSON.parse(JSON.stringify(ui));
  assert.deepEqual(json, ui);
  assert.equal(ui.deeplink, AgentCore.deeplinkForState(st, { presetIndex: st.presetIndex, staticMode: true }).url);
});

test('projectUiState degrades gracefully on an invalid formula', () => {
  const st = AgentCore.defaultState();
  st.formulas = { x: '(', y: 'r*sin(TAU*f*t)', z: '0' };
  const ui = AgentCore.projectUiState(st, { presetIndex: st.presetIndex, base: BASE, staticMode: true });
  assert.equal(ui.derived.readout.status, 'NO EVAL');
  assert.equal(ui.derived.playhead.x, null);
  assert.equal(ui.derived.playhead.valid, false);
});

test('changedKeys detects true no-ops', () => {
  const st = AgentCore.defaultState();
  const same = AgentCore.validatePatch({ tab: 'scopes', twin: 'both', r: 1 }).patch;
  assert.deepEqual(AgentCore.changedKeys(st, 12, same), []);
  const diff = AgentCore.validatePatch({ tab: 'bits', r: 1.2, cut: true }).patch;
  assert.deepEqual(AgentCore.changedKeys(st, 12, diff), ['tab', 'inputs.r', 'toggles.cutaway']);
  const presetOnly = AgentCore.validatePatch({ preset: 5 }).patch;
  assert.deepEqual(AgentCore.changedKeys(st, 12, presetOnly), ['preset']);
});

test('regression: a same-value playT patch while playing is not a no-op (setClock pauses)', () => {
  // Regression for the D1 defect: setClock(0.25) while already playing at 0.25 must
  // still pause (contract §6), so changedKeys must report the implied animate change.
  const playing = AgentCore.defaultState();
  playing.playT = 0.25;
  playing.toggles.animate = true;
  const pausePatch = AgentCore.validatePatch({ playT: 0.25 }).patch;
  assert.deepEqual(AgentCore.changedKeys(playing, 12, pausePatch), ['animate']);

  // Once paused at the same position, the identical call is a true no-op.
  const alreadyPaused = AgentCore.defaultState();
  alreadyPaused.playT = 0.25;
  alreadyPaused.toggles.animate = false;
  assert.deepEqual(AgentCore.changedKeys(alreadyPaused, 12, pausePatch), []);

  // resolveState applies the implied pause, matching the bridge's setClock contract.
  const resolved = AgentCore.resolveState({ playT: 0.25 });
  assert.equal(resolved.playT, 0.25);
  assert.equal(resolved.toggles.animate, false);
});
