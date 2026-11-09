#!/usr/bin/env node
/* ===== agent/selftest.mjs =====
   Independent, zero-dependency self test for the agent transports.

   It spawns the REAL CLI and the REAL MCP stdio server as child processes and
   asserts the normative contract (docs/AGENT-INTERFACE.md sections 2, 3, 8, 9)
   plus canonical maths vectors and the closed error-code set. It never imports
   the CLI's argument parser, so a bug there cannot hide itself.

   Prints `PASS <name>` / `FAIL <name> — <reason>` lines and a summary; exits
   non-zero if any check fails. All paths resolve from this script's location,
   so it works from the repo root and from any other working directory.
*/
import { spawn } from 'node:child_process';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CLI = path.join(__dirname, 'cli.mjs');
const MCP = path.join(__dirname, 'mcp-server.mjs');
const DEFAULT_BASE = 'http://127.0.0.1:8080/';

const requireShared = createRequire(import.meta.url);

const TOOL_NAMES = [
  'manifest',
  'build_deeplink',
  'analyze_patch',
  'eval_point',
  'bit_inspect',
  'discrete_group',
  'ramanujan_pi',
  'fourbit_orbit',
  'frobenius_secp'
];

const ERROR_CODES = [
  'E_BAD_ARGS',
  'E_UNKNOWN_TOOL',
  'E_EMPTY_INPUT',
  'E_INVALID_EXPR',
  'E_INPUT_TOO_LARGE',
  'E_BAD_TAB',
  'E_OUT_OF_RANGE',
  'E_INTERNAL'
];

/* ------------------------------------------------------------------ */
/* Tiny assertion + check harness                                     */
/* ------------------------------------------------------------------ */

const results = [];

async function check(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    process.stdout.write('PASS ' + name + '\n');
  } catch (err) {
    const message = err && err.message ? String(err.message) : String(err);
    results.push({ name, ok: false, message });
    process.stdout.write('FAIL ' + name + ' \u2014 ' + message.replace(/\s+/g, ' ').slice(0, 600) + '\n');
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, label) {
  if (!Object.is(actual, expected)) {
    throw new Error(label + ': expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
  }
}

function assertType(value, type, label) {
  if (typeof value !== type) {
    throw new Error(label + ': expected ' + type + ', got ' + typeof value + ' (' + JSON.stringify(value) + ')');
  }
}

function assertJsonEqual(actual, expected, label) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(label + ' differs (got ' + String(a).slice(0, 300) + ')');
}

/* ------------------------------------------------------------------ */
/* CLI process helpers                                                */
/* ------------------------------------------------------------------ */

function runCli(args, options) {
  const opts = options || {};
  const result = spawnSync(process.execPath, [CLI].concat(args), {
    cwd: opts.cwd || ROOT,
    encoding: 'utf8',
    timeout: 120000
  });
  if (result.error) throw new Error('could not spawn CLI: ' + result.error.message);
  return {
    status: result.status,
    signal: result.signal,
    stdout: result.stdout || '',
    stderr: result.stderr || ''
  };
}

function parseOneJson(text, label) {
  const trimmed = String(text).trim();
  assert(trimmed !== '', label + ' is empty');
  assert(trimmed.charAt(0) === '{' && trimmed.charAt(trimmed.length - 1) === '}',
    label + ' is not exactly one JSON object (got: ' + trimmed.slice(0, 160) + ')');
  try {
    return JSON.parse(trimmed);
  } catch (err) {
    throw new Error(label + ' is not valid JSON: ' + err.message);
  }
}

function cliJson(args) {
  const result = runCli(args.concat(['--json']));
  assertEqual(result.status, 0, 'CLI exit code (' + args.join(' ') + ') stderr=' + result.stderr.trim().slice(0, 300));
  const envelope = parseOneJson(result.stdout, 'stdout');
  assertEqual(envelope.ok, true, 'envelope.ok (' + args.join(' ') + ')');
  return envelope;
}

function expectCliError(name, code, args) {
  return check(name, function () {
    const result = runCli(args.concat(['--json']));
    assertEqual(result.status, 3, 'exit code (stderr: ' + result.stderr.trim().slice(0, 200) + ')');
    const envelope = parseOneJson(result.stdout, 'stdout');
    assertEqual(envelope.ok, false, 'envelope.ok');
    assert(envelope.error && envelope.error.code === code,
      'error.code: expected ' + code + ', got ' + (envelope.error && envelope.error.code));
    assertType(envelope.error.message, 'string', 'error.message');
    assert(envelope.error.message.length > 0, 'error.message must not be empty');
    assertEqual(envelope.schemaVersion, 1, 'schemaVersion');
  });
}

function loadCoreModule() {
  requireShared(path.join(ROOT, 'js', 'engine.js'));
  requireShared(path.join(ROOT, 'js', 'presets.js'));
  const mod = requireShared(path.join(ROOT, 'js', 'agent-core.js'));
  const core = mod && mod.AgentCore ? mod.AgentCore : mod;
  assert(core && typeof core.callTool === 'function',
    'js/agent-core.js does not export an AgentCore with callTool');
  return core;
}

/* ------------------------------------------------------------------ */
/* MCP session helper (newline-delimited JSON-RPC 2.0)                */
/* ------------------------------------------------------------------ */

function mcpSession(messages, timeoutMs) {
  return new Promise(function (resolve) {
    const child = spawn(process.execPath, [MCP], {
      cwd: ROOT,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(function () {
      try { child.kill(); } catch (err) { /* already gone */ }
      finish(null);
    }, timeoutMs || 20000);

    function finish(code) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    }

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', function (chunk) { stdout += chunk; });
    child.stderr.on('data', function (chunk) { stderr += chunk; });
    child.on('error', function (err) { stderr += '\nspawn error: ' + err.message; });
    child.on('close', function (code) { finish(code); });

    const payload = messages.map(function (message) {
      return typeof message === 'string' ? message : JSON.stringify(message);
    }).join('\n') + '\n';
    child.stdin.end(payload);
  });
}

const sessions = new Map();

function session(key, messages) {
  if (!sessions.has(key)) sessions.set(key, mcpSession(messages));
  return sessions.get(key);
}

function parseResponses(sessionResult, label) {
  const text = String(sessionResult.stdout).trim();
  assert(text !== '', label + ': server wrote no stdout (stderr: ' + sessionResult.stderr.trim().slice(0, 300) + ')');
  const lines = text.split('\n').filter(function (line) { return line.trim() !== ''; });
  return lines.map(function (line, index) {
    try {
      return JSON.parse(line);
    } catch (err) {
      throw new Error(label + ': response ' + index + ' is not JSON: ' + line.slice(0, 160));
    }
  });
}

/* ------------------------------------------------------------------ */
/* Checks                                                             */
/* ------------------------------------------------------------------ */

async function main() {
  /* ---- CLI: help / manifest ---- */

  await check('cli_help_exit_0', function () {
    const result = runCli(['help']);
    assertEqual(result.status, 0, 'exit code');
    assert(result.stdout.indexOf('Commands:') !== -1, 'help must list Commands:');
    assert(result.stdout.indexOf('Exit codes:') !== -1, 'help must document exit codes');
    assertEqual(result.stderr.trim(), '', 'stderr must be empty');
  });

  await check('cli_manifest_envelope', function () {
    const envelope = cliJson(['manifest']);
    assertEqual(envelope.tool, 'manifest', 'envelope.tool');
    assertEqual(envelope.schemaVersion, 1, 'envelope.schemaVersion');
    assertEqual(envelope.deeplink, null, 'envelope.deeplink');
    assert(Array.isArray(envelope.warnings), 'envelope.warnings must be an array');
    assertType(envelope.data, 'object', 'envelope.data');
  });

  await check('cli_manifest_id', function () {
    const envelope = cliJson(['manifest']);
    assertEqual(envelope.data.id, 'ramanujan-sphere', 'manifest id');
    assertEqual(envelope.data.schemaVersion, 1, 'manifest schemaVersion');
    assertEqual(envelope.data.version, '1.0.0', 'manifest version');
    assert(Array.isArray(envelope.data.tools) && envelope.data.tools.length === 9,
      'manifest.tools must have 9 entries, got ' + (envelope.data.tools && envelope.data.tools.length));
    assert(Array.isArray(envelope.data.catalog && envelope.data.catalog.presets),
      'manifest.catalog.presets must be an array');
  });

  await check('cli_manifest_roundtrip', function () {
    const fromCli = cliJson(['manifest']).data;
    const core = loadCoreModule();
    const fromCore = core.getManifest();
    assertJsonEqual(fromCli, fromCore, 'CLI manifest vs AgentCore.getManifest()');
  });

  /* ---- CLI: canonical maths vectors ---- */

  await check('cli_bit_inspect_pi_hex', function () {
    const envelope = cliJson(['bit_inspect', '--value', '3.141592653589793']);
    assertEqual(envelope.data.hex, '0x40490FDB', 'float32(pi) hex');
    assertEqual(envelope.data.bin.length, 32, 'binary string length');
    assertEqual(envelope.data.signBit, '0', 'sign bit');
    assertEqual(envelope.data.kind, 'finite', 'kind');
  });

  await check('cli_bit_inspect_special_nan', function () {
    const envelope = cliJson(['bit_inspect', '--special', 'nan']);
    assertEqual(envelope.data.hex, '0x7FC00000', 'canonical NaN hex');
    assertEqual(envelope.data.kind, 'NaN', 'kind');
    assertEqual(envelope.data.input, 'nan', 'echoed input');
  });

  await check('cli_bit_inspect_flag_equals_form', function () {
    const envelope = cliJson(['bit_inspect', '--value=3.141592653589793']);
    assertEqual(envelope.data.hex, '0x40490FDB', '--flag=value form hex');
  });

  await check('cli_fourbit_orbit_preset12_nibble', function () {
    const envelope = cliJson(['fourbit_orbit']);
    const data = envelope.data;
    assertEqual(data.R, 1, 'R default');
    assertEqual(data.deg, 0, 'deg at playT 0');
    assertEqual(data.nibble && data.nibble.val, 8, 'nibble value at playT 0');
    assertEqual(data.nibble && data.nibble.bin, '1000', 'nibble binary');
    assertEqual(data.nibble && data.nibble.hex, '0x8', 'nibble hex');
    assertType(data.quadray, 'object', 'quadray');
    assert(data.quadray && data.quadray.D_0001 && data.quadray.A_1000,
      'quadray must expose D_0001 and A_1000');
    assertType(envelope.deeplink, 'string', 'envelope.deeplink');
    assert(envelope.deeplink.indexOf('static=1') !== -1,
      'fourbit_orbit deeplink must pin static=1 (got ' + envelope.deeplink + ')');
    // Delta encoding: overrides must round-trip through the emitted query.
    const overridden = cliJson(['fourbit_orbit', '--R', '1.5', '--f', '2', '--phase', '30', '--playT', '0.25']);
    for (const param of ['r=1.5', 'f=2', 'phase=30', 'pt=0.25']) {
      assert(overridden.deeplink.indexOf(param) !== -1,
        'fourbit_orbit deeplink must encode ' + param + ' (got ' + overridden.deeplink + ')');
    }
    assertEqual(overridden.data.deg, 210, 'deg at playT 0.25, f 2, phase 30');
  });

  await check('cli_frobenius_decimal_strings', function () {
    const envelope = cliJson(['frobenius_secp']);
    const data = envelope.data;
    assertEqual(data.curve, 'secp256k1', 'curve');
    assertEqual(data.k, 4, 'default k');
    for (const key of ['p', 'n', 'trace', 'pointCount']) {
      assertType(data[key], 'string', 'data.' + key);
      assert(/^-?[0-9]+$/.test(data[key]), 'data.' + key + ' must be a decimal string, got ' + data[key]);
    }
    assertType(data.phiDeg, 'number', 'phiDeg');
    assertType(data.cosPhi, 'number', 'cosPhi');
    assertType(data.sqrtP, 'number', 'sqrtP');
    assertType(data.hasseBound, 'number', 'hasseBound');
  });

  await check('cli_ramanujan_locked_at_k0', function () {
    const envelope = cliJson(['ramanujan_pi']);
    const data = envelope.data;
    assertEqual(data.targetHex, '0x40490FDB', 'target float32(pi) hex');
    assert(Array.isArray(data.rows), 'rows must be an array');
    assertEqual(data.rows.length, 5, 'default maxK=4 -> 5 rows');
    assertEqual(data.rows[0].k, 0, 'first row k');
    assertEqual(data.rows[0].ramHex, '0x40490FDB', 'Ramanujan k=0 locks to float32(pi)');
    assertEqual(data.rows[0].ramLocked, true, 'rows[0].ramLocked');
    if (typeof data.lockedAtK0 === 'boolean') {
      assertEqual(data.lockedAtK0, true, 'lockedAtK0');
    }
    assertType(data.rows[0].ramErrDb, 'number', 'ramErrDb');
  });

  await check('cli_discrete_group_gcd_suborder', function () {
    const envelope = cliJson(['discrete_group', '--orderN', '12', '--stride', '3']);
    const data = envelope.data;
    assertEqual(data.N, 12, 'N');
    assertEqual(data.stride, 3, 'stride');
    assertEqual(data.gcd, 3, 'gcd(3,12)');
    assertEqual(data.subOrder, 4, 'subOrder = N/gcd');
    assertJsonEqual(data.orbit, [0, 3, 6, 9, 0], 'orbit walk');
    assert(Array.isArray(data.nodes) && data.nodes.length === 12, 'nodes length');
  });

  await check('cli_analyze_patch_default', function () {
    const envelope = cliJson(['analyze_patch', '--preset', '12']);
    const data = envelope.data;
    assert(data.preset && data.preset.index === 12, 'preset.index must be 12');
    assertType(data.preset.name, 'string', 'preset.name');
    assertEqual(data.curveValid, true, 'default preset curve must be valid');
    assert(Array.isArray(data.samplesAt) && data.samplesAt.length === 5, 'samplesAt t=0,.25,.5,.75,1');
    assertJsonEqual(data.samplesAt.map(function (s) { return s.t; }), [0, 0.25, 0.5, 0.75, 1], 'samplesAt t values');
    assert(data.stats && typeof data.stats.zoneCounts === 'object', 'stats.zoneCounts');
    assert(data.shell && typeof data.shell.volShell === 'number', 'shell.volShell');
    assertType(envelope.deeplink, 'string', 'analyze_patch deeplink');
    assert(envelope.deeplink.indexOf('static=1') !== -1,
      'analyze_patch deeplink must be static=1 (got ' + envelope.deeplink + ')');
  });

  await check('cli_eval_point_default', function () {
    const envelope = cliJson(['eval_point']);
    const data = envelope.data;
    assertEqual(data.t, 0.25, 'default t');
    assert(data.point && data.point.valid === true, 'point.valid');
    assertType(data.point.x, 'number', 'point.x');
    assert(data.bits && data.bits.y && data.bits.y.hex === '0x3F800000',
      'y=1.0 float32 hex should be 0x3F800000, got ' + (data.bits && data.bits.y && data.bits.y.hex));
    assert(data.bits.z && data.bits.z.hex === '0x00000000', 'z=0 float32 hex');
    assertType(data.twin.mode, 'string', 'twin.mode');
    assertType(data.readout.status, 'string', 'readout.status');
    assertType(envelope.deeplink, 'string', 'eval_point deeplink');
  });

  /* ---- CLI: state + output cleanliness ---- */

  await check('cli_state_schema', function () {
    const result = runCli(['state', '--json']);
    assertEqual(result.status, 0, 'exit code (stderr: ' + result.stderr.trim().slice(0, 200) + ')');
    const state = parseOneJson(result.stdout, 'state stdout');
    assertEqual(state.schemaVersion, 1, 'schemaVersion');
    assertEqual(state.tool, 'ramanujan-sphere', 'tool');
    assertEqual(state.ready, true, 'ready');
    assertEqual(state.tab, 'scopes', 'tab');
    assert(state.preset && state.preset.index === 12, 'preset.index must default to 12');
    assert(state.inputs && typeof state.inputs.r === 'number', 'inputs.r');
    assertType(state.deeplink, 'string', 'deeplink');
    assert(state.deeplink.indexOf(DEFAULT_BASE) === 0, 'deeplink must use the base URL, got ' + state.deeplink);
    assert(state.derived && typeof state.derived === 'object', 'derived');
    assert(state.derived.playhead && typeof state.derived.playhead === 'object', 'derived.playhead');
    assertEqual(state.derived.playhead.t, 0, 'derived.playhead.t');
    assert(state.derived.readout && typeof state.derived.readout.status === 'string', 'derived.readout');
    assert(state.transport && typeof state.transport.playT === 'number', 'transport.playT');
    assertJsonEqual(state.bridge, { schemaVersion: 1, version: '1.0.0' }, 'bridge identity');
  });

  await check('cli_build_deeplink_view_args', function () {
    const envelope = cliJson(['build_deeplink', '--twin', 'conjugate', '--tab', 'bits', '--static', '--cut']);
    assertEqual(envelope.data.query.twin, 'conjugate', 'query.twin');
    assertEqual(envelope.data.query.tab, 'bits', 'query.tab');
    assertEqual(envelope.data.query.static, '1', 'query.static');
    assertEqual(envelope.data.query.cut, '1', 'query.cut toggle');
    assertEqual(envelope.deeplink, envelope.data.url, 'envelope.deeplink === data.url');
  });

  await check('cli_state_view_overrides', function () {
    const result = runCli(['state', '--twin', 'conjugate', '--tab', 'bits', '--slot', 'B', '--static', '--pt', '0.25', '--json']);
    assertEqual(result.status, 0, 'exit code (stderr: ' + result.stderr.trim().slice(0, 200) + ')');
    const state = parseOneJson(result.stdout, 'state stdout');
    assertEqual(state.tab, 'bits', 'tab');
    assertEqual(state.slot, 'B', 'slot');
    assertEqual(state.twinMode, 'conjugate', 'twinMode');
    assertEqual(state.transport.staticMode, true, 'transport.staticMode');
    assertEqual(state.transport.animate, false, 'transport.animate (static)');
    assertEqual(state.transport.playT, 0.25, 'transport.playT');
    assertEqual(state.derived.playhead.t, 0.25, 'derived.playhead.t');
  });

  await check('cli_state_invalid_override_exit_3', function () {
    const result = runCli(['state', '--tab', 'nope', '--json']);
    assertEqual(result.status, 3, 'invalid state override exit code');
    assert(/'?E_BAD_TAB/.test(result.stderr), 'stderr must name E_BAD_TAB, got: ' + result.stderr.trim().slice(0, 200));
  });

  await check('cli_json_cleanliness', function () {
    for (const args of [['manifest', '--json'], ['state', '--json']]) {
      const result = runCli(args);
      assertEqual(result.status, 0, 'exit code for ' + args.join(' '));
      const trimmed = result.stdout.trim();
      assert(trimmed.charAt(0) === '{', 'stdout must start with { for ' + args.join(' '));
      assert(trimmed.charAt(trimmed.length - 1) === '}', 'stdout must end with } for ' + args.join(' '));
      JSON.parse(trimmed); // throws if a banner/extra text sneaked in
      assertEqual(result.stderr.trim(), '', 'stderr must be empty for ' + args.join(' '));
    }
  });

  await check('cli_usage_exit_2', function () {
    const result = runCli(['definitely_not_a_command']);
    assertEqual(result.status, 2, 'unknown command exit code');
    assertEqual(result.stdout.trim(), '', 'usage errors must not write stdout');
    assert(result.stderr.trim().length > 0, 'usage errors must write stderr');
  });

  /* ---- CLI: one check per closed-v1 error code ---- */

  await expectCliError('cli_error_E_OUT_OF_RANGE', 'E_OUT_OF_RANGE',
    ['analyze_patch', '--r', '99']);
  // NOTE: contract §2.5 defines bit_inspect `value` as any finite JSON number and
  // declares no numeric bounds, so `bit_inspect --value 999` is a SUCCESS envelope
  // (0x4479C000). The delegated acceptance that expected E_OUT_OF_RANGE for 999 was
  // reported to the Lead; if the core gains a documented bit_inspect bound, add a
  // dedicated check here rather than weakening the contract-clear one above.
  await expectCliError('cli_error_E_BAD_ARGS', 'E_BAD_ARGS',
    ['analyze_patch', '--args', '{"bogus":true}']);
  await expectCliError('cli_error_E_EMPTY_INPUT', 'E_EMPTY_INPUT',
    ['bit_inspect']);
  await expectCliError('cli_error_E_INVALID_EXPR', 'E_INVALID_EXPR',
    ['analyze_patch', '--x', 'sin(']);
  await expectCliError('cli_error_E_INPUT_TOO_LARGE', 'E_INPUT_TOO_LARGE',
    ['analyze_patch', '--x', 'r*0.1+'.repeat(90) + '0']);
  await expectCliError('cli_error_E_BAD_TAB', 'E_BAD_TAB',
    ['build_deeplink', '--tab', 'nope']);

  /* ---- MCP stdio server ---- */

  const handshakeMessages = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'selftest', version: '1.0.0' } } },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' }
  ];

  await check('mcp_initialize_handshake', async function () {
    const result = await session('handshake', handshakeMessages);
    assertEqual(result.code, 0, 'clean EOF exit code (stderr: ' + result.stderr.trim().slice(0, 300) + ')');
    const responses = parseResponses(result, 'handshake');
    assertEqual(responses.length, 2, 'exactly two responses (nothing else on stdout)');
    const init = responses[0];
    assertEqual(init.id, 1, 'initialize id echo');
    assertEqual(init.jsonrpc, '2.0', 'jsonrpc');
    assertEqual(init.result.protocolVersion, '2025-06-18', 'protocolVersion');
    assert(init.result.capabilities && typeof init.result.capabilities.tools === 'object',
      'capabilities.tools');
    assertEqual(init.result.serverInfo.name, 'ramanujan-sphere', 'serverInfo.name');
    assertEqual(init.result.serverInfo.version, '1.0.0', 'serverInfo.version');
  });

  await check('mcp_notifications_silent_ping', async function () {
    const result = await session('notify', [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 3, method: 'ping' }
    ]);
    assertEqual(result.code, 0, 'clean EOF exit code');
    const responses = parseResponses(result, 'notify');
    assertEqual(responses.length, 2, 'notifications are silent (only initialize + ping replies)');
    assertEqual(responses[1].id, 3, 'ping id');
    assertJsonEqual(responses[1].result, {}, 'ping result');
  });

  await check('mcp_tools_list_nine', async function () {
    const result = await session('handshake', handshakeMessages);
    const responses = parseResponses(result, 'handshake');
    const toolsResponse = responses[1];
    assertEqual(toolsResponse.id, 2, 'tools/list id');
    assert(Array.isArray(toolsResponse.result.tools), 'tools must be an array');
    assertEqual(toolsResponse.result.tools.length, 9, 'tools/list length');
    assertJsonEqual(toolsResponse.result.tools.map(function (t) { return t.name; }), TOOL_NAMES,
      'canonical registry order');
    for (const tool of toolsResponse.result.tools) {
      assertType(tool.name, 'string', 'tool.name');
      assertType(tool.description, 'string', 'tool.description (' + tool.name + ')');
      assert(tool.description.length > 0, 'tool.description must not be empty (' + tool.name + ')');
      assert(tool.inputSchema && typeof tool.inputSchema === 'object', 'tool.inputSchema (' + tool.name + ')');
      assertEqual(tool.inputSchema.type, 'object', 'inputSchema.type (' + tool.name + ')');
    }
  });

  const callMessages = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    {
      jsonrpc: '2.0', id: 2, method: 'tools/call',
      params: { name: 'bit_inspect', arguments: { value: 3.141592653589793 } }
    },
    {
      jsonrpc: '2.0', id: 3, method: 'tools/call',
      params: { name: 'no_such_tool', arguments: {} }
    }
  ];

  await check('mcp_tools_call_success', async function () {
    const result = await session('calls', callMessages);
    assertEqual(result.code, 0, 'clean EOF exit code');
    const responses = parseResponses(result, 'calls');
    assertEqual(responses.length, 3, 'three responses');
    const call = responses[1];
    assertEqual(call.id, 2, 'tools/call id');
    assertEqual(call.result.isError, false, 'isError for a success envelope');
    assert(Array.isArray(call.result.content) && call.result.content.length === 1, 'content array');
    assertEqual(call.result.content[0].type, 'text', 'content type');
    const envelope = JSON.parse(call.result.content[0].text);
    assertEqual(envelope.ok, true, 'envelope.ok');
    assertEqual(envelope.schemaVersion, 1, 'envelope.schemaVersion');
    assertEqual(envelope.tool, 'bit_inspect', 'envelope.tool');
    assertEqual(envelope.data.hex, '0x40490FDB', 'MCP bit_inspect hex');
  });

  await check('mcp_unknown_tool_iserror', async function () {
    const result = await session('calls', callMessages);
    const responses = parseResponses(result, 'calls');
    const call = responses[2];
    assertEqual(call.id, 3, 'unknown tool id');
    assertEqual(call.result.isError, true, 'isError for unknown tool');
    const envelope = JSON.parse(call.result.content[0].text);
    assertEqual(envelope.ok, false, 'unknown tool envelope.ok');
    assertEqual(envelope.error.code, 'E_UNKNOWN_TOOL', 'unknown tool error code');
  });

  await check('mcp_parse_error_32700', async function () {
    const result = await session('parse', [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
      'this is not json'
    ]);
    const responses = parseResponses(result, 'parse');
    assertEqual(responses.length, 2, 'parse-error reply present');
    assertEqual(responses[1].error.code, -32700, 'parse error code');
    assertEqual(responses[1].id, null, 'parse error id');
  });

  await check('mcp_unknown_method_32601', async function () {
    const result = await session('unknown', [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
      { jsonrpc: '2.0', id: 2, method: 'does/not/exist' }
    ]);
    const responses = parseResponses(result, 'unknown');
    assertEqual(responses.length, 2, 'unknown-method reply present');
    assertEqual(responses[1].error.code, -32601, 'method not found code');
    assertEqual(responses[1].id, 2, 'method not found id');
  });

  /* ---- artifacts + shared core constants ---- */

  await check('artifacts_check_exit_0', function () {
    const result = runCli(['artifacts', '--check']);
    assertEqual(result.status, 0,
      'artifacts --check exit code (stderr: ' + result.stderr.trim().slice(0, 400) + ')');
  });

  await check('core_error_codes_closed_set', function () {
    const core = loadCoreModule();
    assert(Array.isArray(core.ERROR_CODES), 'ERROR_CODES must be an array');
    const actual = core.ERROR_CODES.slice().sort();
    const expected = ERROR_CODES.slice().sort();
    assertJsonEqual(actual, expected, 'ERROR_CODES closed set');
  });

  /* ---- summary ---- */

  const total = results.length;
  const failed = results.filter(function (r) { return !r.ok; });
  const passed = total - failed.length;

  process.stdout.write('\n' + passed + '/' + total + ' checks passed' +
    (failed.length === 0 ? ' \u2014 all good' : ' \u2014 ' + failed.length + ' failed') + '\n');
  if (failed.length > 0) {
    for (const failure of failed) {
      process.stdout.write('  FAILED: ' + failure.name + ' \u2014 ' + failure.message + '\n');
    }
    process.exitCode = 1;
  } else {
    process.exitCode = 0;
  }
}

await main();
