// Registry, envelope and manifest contract tests (docs/AGENT-INTERFACE.md §2, §3, §7).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const AgentCore = require('../js/agent-core.js');

const SUCCESS_KEYS = ['ok', 'schemaVersion', 'tool', 'data', 'deeplink', 'warnings'];
const FAILURE_KEYS = ['ok', 'schemaVersion', 'tool', 'error', 'warnings'];

test('tool registry is canonical: 9 pure tools in fixed order', () => {
  assert.deepEqual(AgentCore.TOOL_NAMES, [
    'manifest', 'build_deeplink', 'analyze_patch', 'eval_point', 'bit_inspect',
    'discrete_group', 'ramanujan_pi', 'fourbit_orbit', 'frobenius_secp'
  ]);
  for (const tool of AgentCore.TOOLS) {
    assert.equal(tool.scope, 'pure', tool.name + ' must be pure');
    assert.equal(typeof tool.title, 'string');
    assert.ok(tool.title.length > 3, tool.name + ' title');
    assert.equal(typeof tool.description, 'string');
    assert.ok(tool.description.length > 40, tool.name + ' description is actionable');
    assert.equal(tool.inputSchema.type, 'object');
    assert.equal(tool.inputSchema.additionalProperties, false);
    assert.equal(typeof tool.inputSchema.properties, 'object');
    assert.ok(Array.isArray(tool.examples) && tool.examples.length >= 1, tool.name + ' examples');
    assert.equal(typeof tool.run, 'function');
  }
});

test('manifest identity, catalog and selectors', () => {
  const m = AgentCore.getManifest();
  assert.equal(m.id, 'ramanujan-sphere');
  assert.equal(m.title, "Ramanujan's Gift");
  assert.equal(m.version, '1.0.0');
  assert.equal(m.schemaVersion, 1);
  assert.equal(m.tools.length, 9);
  assert.deepEqual(m.tools.map((t) => t.name), AgentCore.TOOL_NAMES);
  assert.equal(m.catalog.presets.length, 14);
  assert.deepEqual(m.catalog.presets.map((p) => p.index), [...Array(14).keys()]);
  assert.equal(m.deeplink.tabs.join(','), 'scopes,harmonics,frobenius,bits,agent');
  assert.equal(m.deeplink.defaults.preset, 12);
  assert.equal(m.ui.bridge, 'window.ramanujanSphere');
  assert.equal(m.ui.stateSelector, '#ramanujan-sphere-state');
  assert.equal(m.ui.ready, "body[data-agent-ready='true']");
  assert.ok(m.relatedTools.length >= 1);
  for (const rel of m.relatedTools) {
    assert.ok(['available', 'planned'].includes(rel.status), 'relatedTools status enum');
    assert.equal(typeof rel.id, 'string');
    assert.equal(typeof rel.path, 'string');
  }
});

test('manifest is pure JSON: no functions, dates, randomness', () => {
  const text = AgentCore.serialize(AgentCore.getManifest());
  assert.equal(text.includes('function'), false);
  assert.equal(/\d{4}-\d{2}-\d{2}T/.test(text), false, 'no ISO timestamps');
  assert.equal(text.includes('undefined'), false);
  assert.deepEqual(JSON.parse(text), AgentCore.getManifest());
  assert.equal(AgentCore.serialize(AgentCore.getManifest()), text, 'byte-deterministic');
});

test('success envelope has the exact key order and schemaVersion', () => {
  const env = AgentCore.callTool('bit_inspect', { value: 1 });
  assert.deepEqual(Object.keys(env), SUCCESS_KEYS);
  assert.equal(env.ok, true);
  assert.equal(env.schemaVersion, 1);
  assert.equal(env.tool, 'bit_inspect');
  assert.deepEqual(env.warnings, []);
  assert.equal(typeof env.deeplink === 'string' || env.deeplink === null, true);
});

test('failure envelope has the exact key order', () => {
  const env = AgentCore.callTool('nope', {});
  assert.deepEqual(Object.keys(env), FAILURE_KEYS);
  assert.equal(env.ok, false);
  assert.equal(env.schemaVersion, 1);
  assert.equal(env.tool, 'nope');
  assert.equal(env.error.code, 'E_UNKNOWN_TOOL');
  assert.equal(typeof env.error.message, 'string');
  assert.deepEqual(env.warnings, []);
  // error object key order is code, message, hint? (hint present when a fix is known)
  assert.deepEqual(Object.keys(env.error), ['code', 'message', 'hint']);
  assert.equal(typeof env.error.hint, 'string');
});

test('closed error-code set matches the contract exactly', () => {
  assert.deepEqual(AgentCore.ERROR_CODES, [
    'E_BAD_ARGS', 'E_UNKNOWN_TOOL', 'E_EMPTY_INPUT', 'E_INVALID_EXPR',
    'E_INPUT_TOO_LARGE', 'E_BAD_TAB', 'E_OUT_OF_RANGE', 'E_INTERNAL'
  ]);
});

test('every error code is reachable and uses the envelope', () => {
  const cases = [
    ['E_BAD_ARGS', () => AgentCore.callTool('analyze_patch', { bogus: 1 })],
    ['E_UNKNOWN_TOOL', () => AgentCore.callTool('does_not_exist', {})],
    ['E_EMPTY_INPUT', () => AgentCore.callTool('bit_inspect', {})],
    ['E_INVALID_EXPR', () => AgentCore.callTool('analyze_patch', { formulas: { x: '(' } })],
    ['E_INPUT_TOO_LARGE', () => AgentCore.callTool('analyze_patch', { formulas: { x: 'r'.repeat(600) } })],
    ['E_BAD_TAB', () => AgentCore.callTool('build_deeplink', { tab: 'not-a-tab' })],
    ['E_OUT_OF_RANGE', () => AgentCore.callTool('ramanujan_pi', { maxK: 99 })],
    ['E_INTERNAL', () => {
      const tool = AgentCore.TOOLS.find((t) => t.name === 'bit_inspect');
      const original = tool.run;
      tool.run = () => { throw new Error('boom'); };
      try { return AgentCore.callTool('bit_inspect', { value: 1 }); }
      finally { tool.run = original; }
    }]
  ];
  for (const [code, call] of cases) {
    const env = call();
    assert.equal(env.ok, false, code + ' should fail');
    assert.equal(env.error.code, code, 'expected ' + code + ' got ' + env.error.code);
    assert.deepEqual(Object.keys(env), FAILURE_KEYS);
  }
});

test('callTool never throws on hostile arguments', () => {
  const hostile = [undefined, null, [], 'text', 42, { deep: { nested: [1, 2] } }];
  for (const name of AgentCore.TOOL_NAMES) {
    for (const args of hostile) {
      const env = AgentCore.callTool(name, args);
      assert.equal(typeof env, 'object');
      assert.equal(env.schemaVersion, 1);
      assert.equal(typeof env.ok, 'boolean');
      if (env.ok) assert.deepEqual(Object.keys(env), SUCCESS_KEYS);
      else assert.deepEqual(Object.keys(env), FAILURE_KEYS);
    }
  }
  const badNames = [undefined, null, 0, {}, []];
  for (const name of badNames) {
    const env = AgentCore.callTool(name, {});
    assert.equal(env.ok, false);
    assert.equal(env.error.code, 'E_UNKNOWN_TOOL');
  }
});

test('manifest tool returns the manifest as data and null deeplink', () => {
  const env = AgentCore.callTool('manifest', {});
  assert.equal(env.ok, true);
  assert.deepEqual(env.data, AgentCore.getManifest());
  assert.equal(env.deeplink, null);
});

test('tool results are deterministic (byte-identical across calls)', () => {
  const cases = [
    ['analyze_patch', { preset: 5, samples: 128 }],
    ['eval_point', { preset: 12, t: 0.37 }],
    ['discrete_group', { orderN: 19, stride: 3 }],
    ['ramanujan_pi', { maxK: 3 }],
    ['fourbit_orbit', { R: 1.2, f: 2, phaseDeg: 20, playT: 0.4 }],
    ['frobenius_secp', { k: 5 }],
    ['bit_inspect', { value: 0.1 }]
  ];
  for (const [name, args] of cases) {
    const a = JSON.stringify(AgentCore.callTool(name, args));
    const b = JSON.stringify(AgentCore.callTool(name, args));
    assert.equal(a, b, name + ' deterministic');
  }
});

test('pure tools carry an envelope deeplink when they describe a view', () => {
  for (const name of ['analyze_patch', 'eval_point', 'fourbit_orbit', 'build_deeplink']) {
    const env = AgentCore.callTool(name, name === 'fourbit_orbit' ? { R: 1 } : { preset: 12 });
    assert.equal(env.ok, true, name);
    assert.equal(typeof env.deeplink, 'string', name + ' deeplink');
    assert.ok(env.deeplink.startsWith('http://'), name + ' absolute default base');
  }
  assert.equal(AgentCore.callTool('bit_inspect', { value: 1 }).deeplink, null);
});

test('schema bounds agree with the page slider bounds', () => {
  const analyze = AgentCore.TOOLS.find((t) => t.name === 'analyze_patch');
  const props = analyze.inputSchema.properties;
  assert.equal(props.r.minimum, 0.3);
  assert.equal(props.r.maximum, 2.6);
  assert.equal(props.orderN.minimum, 5);
  assert.equal(props.orderN.maximum, 64);
  assert.equal(props.K.maximum, 14);
  assert.equal(props.phaseDeg.minimum, -180);
  assert.equal(props.samples.maximum, 3200);
  const frob = AgentCore.TOOLS.find((t) => t.name === 'frobenius_secp');
  assert.equal(frob.inputSchema.properties.k.maximum, 16);
});
