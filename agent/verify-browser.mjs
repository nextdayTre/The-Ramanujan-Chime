#!/usr/bin/env node
/* ===== agent/verify-browser.mjs — independent CDP browser verification =====

   Contract §12, part 2 of the browser-level gate. Zero dependencies.

     node agent/verify-browser.mjs --base http://127.0.0.1:8080/
     node agent/verify-browser.mjs --base http://127.0.0.1:8080/ --capture

   Launches a fresh-profile headless Chrome with its own --remote-debugging-port
   and drives it over the DevTools protocol with Node's global WebSocket (no
   Playwright/Puppeteer). Every expected value is derived in Node from the single
   shared registry (js/agent-core.js) — never from the page under test.

   The checklist covers the contract §12 browser requirements:
     - readiness marker, one bridge global, contract §5 state key order,
       hidden DOM state JSON === getState() in static mode;
     - exactly ONE `ramanujan-sphere:change` on mount, one per genuine mutation,
       ZERO for a no-op setter, animation ticks never emit change events;
     - subscribe: immediate once, on change, unsubscribe idempotent, throwing
       subscriber isolated;
     - setters never throw; invalid key/shape/enum/range return E_* envelopes and
       leave state unchanged; setState applies synchronously (race tests);
     - setClock pauses + pins playT; step clamps at 0/1; play/pause; reset;
     - documented deeplinks render the right tab/panel/inputs (expected values
       derived from the registry), tolerant parse of invalid params;
     - deeplink reload reproducibility (twice, byte-identical), URL sync via
       replaceState (history.length unchanged), delta-encoded default URL;
     - bridge call() envelopes equal the Node registry for success, unknown tool
       and bad args; tool count 9 + canonical names + manifest deep-equals;
     - Agent panel contents: status badge, deeplink box, live state JSON, tool
       catalogue, handoff prompt text (current deeplink + AGENTS.md +
       window.ramanujanSphere + agent/manifest.json + all 9 tool names), copy
       buttons via a stubbed clipboard;
     - layout: no horizontal overflow at 1600x1000 and 1280x800, Agent cards not
       clipped/overlapping, scrollable blocks declare overflow, no element wider
       than the viewport;
     - regression: window.__agree === true, no console errors, default preset 12,
       3D canvas renders and a screenshot is > 50 KB.

   `--capture` additionally writes the reproducible reference screenshots used by
   docs/AGENT-SCREENSHOTS.md into docs/agent/ (each verified > 50 KB).

   Exit 0 iff every check passes; 1 on failure; 2 on a setup error (server or
   Chrome unreachable). Prints a PASS/FAIL table plus the screenshot paths. */

import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const AgentCore = require('../js/agent-core.js');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const DEFAULT_BASE = 'http://127.0.0.1:8080/';
const DEFAULT_CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const IS_WIN = process.platform === 'win32';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const opts = {
    base: process.env.APP_URL || DEFAULT_BASE,
    chrome: process.env.CHROME_PATH || DEFAULT_CHROME,
    port: Number(process.env.CDP_PORT || 9341),
    capture: false,
    help: false
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const eq = a.indexOf('=');
    const name = eq >= 0 ? a.slice(0, eq) : a;
    const inline = eq >= 0 ? a.slice(eq + 1) : undefined;
    const value = () => (inline !== undefined ? inline : argv[++i]);
    if (name === '--base') opts.base = value();
    else if (name === '--chrome') opts.chrome = value();
    else if (name === '--port') opts.port = Number(value());
    else if (name === '--capture') opts.capture = true;
    else if (name === '--help' || name === '-h') opts.help = true;
    else { console.error(`unknown argument: ${a}`); opts.help = true; }
  }
  if (!opts.base.endsWith('/')) opts.base += '/';
  return opts;
}

const HELP = `usage: node agent/verify-browser.mjs [--base http://127.0.0.1:8080/] [--port 9341] [--chrome <path>] [--capture]

CDP checklist for the ramanujan-sphere agent layer (contract §12). Requires the
repository served over HTTP and a headless-capable Chrome. --capture also writes
docs/agent/*.png reference screenshots. Exit 0 iff every check passes.`;

let opts;
const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail: detail || '' });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : `  -- ${detail}`}`);
}
async function check(name, fn) {
  try {
    const detail = await fn();
    record(name, true, detail);
  } catch (err) {
    record(name, false, String(err && err.message ? err.message : err).split('\n')[0]);
  }
}
function assert(cond, message) {
  if (!cond) throw new Error(message || 'assertion failed');
}

// ---------------------------------------------------------------------------
// Node-side expectations (independent of the page)
// ---------------------------------------------------------------------------
const CONTRACT_STATE_KEYS = [
  'schemaVersion', 'ready', 'tool', 'preset', 'tab', 'slot', 'inputs', 'formulas',
  'toggles', 'twinMode', 'bitSource', 'magnifier', 'transport', 'derived', 'deeplink', 'bridge'
];
const CONTRACT_BRIDGE_METHODS = [
  'getManifest', 'tools', 'getState', 'setState', 'setTab', 'setClock', 'step',
  'play', 'pause', 'reset', 'call', 'getDeeplink', 'subscribe'
];
const DOCUMENTED_INPUT_HOOKS = ['preset', 'r', 'rIn', 'amp', 'f', 'K', 'orderN', 'a', 'b', 'n', 'm', 'k', 'phase', 'phaseDeg', 'fx', 'fy', 'fz'];
const DOCUMENTED_TOGGLE_HOOKS = ['cutaway', 'sliceGrid', 'surface', 'wireframe', 'grid', 'axes', 'radiusVec', 'realTrace', 'strobeN', 'fourBitOrbit', 'quadrayTetra', 'magnifier', 'refWaves', 'animate', 'autoRotate'];

function expectedStateFor(url) {
  const parsed = AgentCore.parseDeeplink(url);
  assert(parsed && parsed.ok !== false, `parseDeeplink failed for ${url}`);
  const stateLike = AgentCore.resolveState(Object.assign({ preset: parsed.presetIndex }, parsed.patch || {}));
  return AgentCore.projectUiState(stateLike, {
    presetIndex: stateLike.presetIndex,
    base: opts.base,
    staticMode: !!stateLike.staticMode
  });
}

function diffState(actual, expected) {
  const keys = new Set([...Object.keys(actual || {}), ...Object.keys(expected || {})]);
  const diffs = [];
  for (const k of keys) {
    if (JSON.stringify(actual ? actual[k] : undefined) !== JSON.stringify(expected ? expected[k] : undefined)) diffs.push(k);
  }
  return diffs;
}

// ---------------------------------------------------------------------------
// Chrome + CDP plumbing
// ---------------------------------------------------------------------------
let chromeProc = null;
let profileDir = null;
let ws = null;
let nextId = 0;
const pending = new Map();

function killChromeTree() {
  if (chromeProc && chromeProc.pid) {
    try {
      if (IS_WIN) spawnSync('taskkill', ['/PID', String(chromeProc.pid), '/T', '/F'], { stdio: 'ignore' });
      else chromeProc.kill('SIGTERM');
    } catch (e) { /* ignore */ }
  }
  chromeProc = null;
}

function cleanupSync() {
  try { if (ws) ws.close(); } catch (e) { /* ignore */ }
  killChromeTree();
  if (profileDir) {
    try { rmSync(profileDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }); } catch (e) { /* best effort */ }
    profileDir = null;
  }
}

// Chrome's helper processes can hold file locks for a few hundred ms after the
// parent tree is killed on Windows, so the final cleanup waits before deleting
// our own temp profile (never anyone else's).
async function cleanupAsync() {
  try { if (ws) ws.close(); } catch (e) { /* ignore */ }
  killChromeTree();
  await sleep(600);
  if (profileDir) {
    try { rmSync(profileDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); } catch (e) { /* best effort */ }
    profileDir = null;
  }
}
process.on('SIGINT', () => { cleanupSync(); process.exit(130); });
process.on('SIGTERM', () => { cleanupSync(); process.exit(143); });

async function portInUse(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(800) });
    return res.ok;
  } catch (e) { return false; }
}

async function launchChrome() {
  let port = opts.port;
  for (let i = 0; i < 12 && (await portInUse(port)); i += 1) port += 1;
  opts.port = port;
  profileDir = mkdtempSync(join(tmpdir(), 'rs-verify-browser-'));
  const args = [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-background-networking', '--mute-audio',
    '--hide-scrollbars', '--remote-allow-origins=*',
    `--user-data-dir=${profileDir}`, `--remote-debugging-port=${port}`,
    '--window-size=1600,1000', 'about:blank'
  ];
  chromeProc = spawn(opts.chrome, args, { stdio: 'ignore' });
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1000) });
      const list = await res.json();
      const page = list.find((t) => t.type === 'page');
      if (page && page.webSocketDebuggerUrl) return page;
    } catch (e) { /* not up yet */ }
    await sleep(200);
  }
  throw new Error(`CDP did not become available on port ${port}`);
}

async function connect() {
  const page = await launchChrome();
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('CDP websocket failed to open')); });
  ws.onmessage = (event) => {
    let msg;
    try { msg = JSON.parse(event.data); } catch (e) { return; }
    if (msg.id && pending.has(msg.id)) {
      const { resolve: res, reject: rej } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) rej(new Error(`${msg.error.code}: ${msg.error.message}`));
      else res(msg.result);
    }
  };
  await send('Runtime.enable');
  await send('Page.enable');

  // Inject per-document counters BEFORE any navigation:
  //  - @event counters for :ready / :change (mount-event semantics)
  //  - console.error/uncaught collectors (regression: no console errors)
  const source = [
    'window.__agentEvents = { ready: 0, change: 0 };',
    "window.addEventListener('ramanujan-sphere:ready', function () { window.__agentEvents.ready += 1; });",
    "window.addEventListener('ramanujan-sphere:change', function () { window.__agentEvents.change += 1; });",
    'window.__agentConsoleErrors = [];',
    '(function () {',
    '  var orig = console.error.bind(console);',
    '  console.error = function () {',
    '    try {',
    '      var parts = Array.prototype.map.call(arguments, function (x) {',
    "        try { return typeof x === 'string' ? x : JSON.stringify(x); } catch (e) { return String(x); }",
    "      });",
    "      window.__agentConsoleErrors.push(parts.join(' '));",
    '    } catch (e) { /* ignore */ }',
    '    return orig.apply(console, arguments);',
    '  };',
    '})();',
    "window.addEventListener('error', function (e) { window.__agentConsoleErrors.push('uncaught: ' + (e && e.message)); });",
    "window.addEventListener('unhandledrejection', function (e) { window.__agentConsoleErrors.push('unhandledrejection: ' + (e && e.reason && (e.reason.message || e.reason))); });"
  ].join('\n');
  await send('Page.addScriptToEvaluateOnNewDocument', { source });
}

function send(method, params) {
  return new Promise((resolvePromise, rejectPromise) => {
    nextId += 1;
    const id = nextId;
    pending.set(id, { resolve: resolvePromise, reject: rejectPromise });
    ws.send(JSON.stringify({ id, method, params: params || {} }));
  });
}

async function evaluate(expression, awaitPromise) {
  const reply = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: awaitPromise !== false
  });
  if (reply.exceptionDetails) {
    const ex = reply.exceptionDetails;
    const desc = (ex.exception && (ex.exception.description || ex.exception.value)) || ex.text || 'page exception';
    throw new Error(`page exception: ${String(desc).split('\n')[0]}`);
  }
  return reply.result.value;
}

async function j(expression) {
  // Await inside the page so async IIFEs are serialized AFTER they settle
  // (JSON.stringify(Promise) would yield "{}").
  const text = await evaluate(`(async function () { return JSON.stringify(await (${expression})); })()`);
  assert(typeof text === 'string', 'evaluation did not return JSON');
  return JSON.parse(text);
}

async function waitReady(timeoutMs) {
  const deadline = Date.now() + (timeoutMs || 25000);
  while (Date.now() < deadline) {
    try {
      const ready = await evaluate('!!(document.readyState === "complete" && document.body && document.body.getAttribute("data-agent-ready") === "true" && window.ramanujanSphere && window.ramanujanSphere.ready === true)');
      if (ready) { await sleep(250); return; }
    } catch (e) { /* context destroyed during navigation */ }
    await sleep(120);
  }
  throw new Error('page never became agent-ready');
}

async function navigate(pathOrUrl, settleMs) {
  const url = /^https?:/i.test(pathOrUrl) ? pathOrUrl : opts.base + String(pathOrUrl).replace(/^\//, '');
  await send('Page.navigate', { url });
  await waitReady();
  await sleep(settleMs === undefined ? 300 : settleMs);
  return url;
}

async function reload(settleMs) {
  await send('Page.reload', { ignoreCache: false });
  await waitReady();
  await sleep(settleMs === undefined ? 300 : settleMs);
}

async function setViewport(width, height) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await sleep(250);
}
async function clearViewport() {
  await send('Emulation.clearDeviceMetricsOverride');
  await sleep(250);
}

async function assertCleanConsole(label) {
  const errors = await j('window.__agentConsoleErrors || []');
  assert(errors.length === 0, `${label}: ${errors.length} console error(s): ${errors.slice(0, 3).join(' | ')}`);
}

// ---------------------------------------------------------------------------
// Main checklist
// ---------------------------------------------------------------------------
async function main() {
  opts = parseArgs(process.argv.slice(2));
  if (opts.help) { console.log(HELP); return 0; }

  console.log('ramanujan-sphere browser verification');
  console.log(`  base:   ${opts.base}`);
  console.log(`  chrome: ${opts.chrome}`);
  console.log(`  node:   ${process.version}`);
  console.log(`  capture: ${opts.capture}\n`);

  try {
    const probe = await fetch(opts.base, { redirect: 'manual' });
    assert(probe.status === 200, `GET / -> ${probe.status}`);
  } catch (err) {
    console.error(`SETUP ERROR: cannot reach ${opts.base} — start the static server first.`);
    console.error(String(err && err.message ? err.message : err));
    return 2;
  }
  try {
    await connect();
  } catch (err) {
    console.error(`SETUP ERROR: ${String(err && err.message ? err.message : err)}`);
    return 2;
  }

  // ---- A. fresh static load: readiness, state, events, identity ----------
  try {
    await navigate('?static=1');
  } catch (err) {
    console.error(`SETUP ERROR: page never became ready: ${String(err && err.message ? err.message : err)}`);
    return 2;
  }

  await check('A1 readiness marker + exactly one bridge global', async () => {
    const info = await j(`(() => ({
      attr: document.body.getAttribute('data-agent-ready'),
      flag: window.__ramanujanSphereBridgeInstalled === true,
      bridge: typeof window.ramanujanSphere,
      ready: window.ramanujanSphere && window.ramanujanSphere.ready,
      toolId: window.ramanujanSphere && window.ramanujanSphere.toolId,
      schemaVersion: window.ramanujanSphere && window.ramanujanSphere.schemaVersion,
      version: window.ramanujanSphere && window.ramanujanSphere.version
    }))()`);
    assert(info.attr === 'true', `body[data-agent-ready] = ${info.attr}`);
    assert(info.flag, '__ramanujanSphereBridgeInstalled flag missing');
    assert(info.bridge === 'object', `window.ramanujanSphere is ${info.bridge}`);
    assert(info.ready === true, 'bridge.ready is not true');
    assert(info.toolId === 'ramanujan-sphere' && info.schemaVersion === 1 && info.version === '1.0.0',
      `identity mismatch: ${JSON.stringify(info)}`);
    return 'ready=true, toolId/schema/version match contract';
  });

  await check('A2 exactly ONE :ready and ONE :change on mount', async () => {
    const ev = await j('window.__agentEvents');
    assert(ev.ready === 1, `ready events on mount: ${ev.ready}`);
    assert(ev.change === 1, `change events on mount: ${ev.change}`);
    return 'ready=1, change=1';
  });

  await check('A2b real reload: ready marker + exactly one mount change event', async () => {
    await reload(300);
    const info = await j(`(() => ({
      ready: document.body.getAttribute('data-agent-ready'),
      bridgeReady: window.ramanujanSphere && window.ramanujanSphere.ready,
      events: window.__agentEvents,
      bridgeFlag: window.__ramanujanSphereBridgeInstalled === true
    }))()`);
    assert(info.ready === 'true' && info.bridgeReady === true && info.bridgeFlag === true, `reload readiness ${JSON.stringify(info)}`);
    assert(info.events.ready === 1 && info.events.change === 1, `after reload: ready=${info.events.ready}, change=${info.events.change}`);
    return 'after Page.reload: ready=true, ready event=1, change event=1';
  });

  await check('A3 hidden state element present, schemaVersion 1, tool id', async () => {
    const info = await j(`(() => {
      const el = document.querySelector('#ramanujan-sphere-state');
      return { found: !!el, attr: el && el.getAttribute('data-schema-version'), hidden: el && el.hidden, text: el && el.textContent };
    })()`);
    assert(info.found, '#ramanujan-sphere-state missing');
    assert(info.attr === '1', `data-schema-version="${info.attr}"`);
    assert(info.hidden === true, 'hidden state element is not hidden');
    assert(info.text && info.text.length > 100, 'hidden state text is empty');
    const st = JSON.parse(info.text);
    assert(st.schemaVersion === 1 && st.ready === true && st.tool === 'ramanujan-sphere',
      `state identity: ${st.schemaVersion}/${st.ready}/${st.tool}`);
    return `schema 1, ${info.text.length} B JSON`;
  });

  await check('A4 state top-level key order matches contract §5', async () => {
    const keys = await j('Object.keys(window.ramanujanSphere.getState())');
    assert(JSON.stringify(keys) === JSON.stringify(CONTRACT_STATE_KEYS),
      `got ${keys.join(',')}`);
    return CONTRACT_STATE_KEYS.length + ' keys in contract order';
  });

  await check('A5 hidden DOM state JSON === getState() (static mode)', async () => {
    const pair = await j(`(() => ({
      dom: document.querySelector('#ramanujan-sphere-state').textContent,
      live: JSON.stringify(window.ramanujanSphere.getState())
    }))()`);
    assert(pair.dom === pair.live, 'hidden DOM state and getState() differ');
    return `${pair.dom.length} B byte-identical`;
  });

  await check('A6 static load state deep-equals the Node registry projection', async () => {
    const live = await j('window.ramanujanSphere.getState()');
    const expected = expectedStateFor('?static=1');
    const diffs = diffState(live, expected);
    assert(diffs.length === 0, `differing keys: ${diffs.join(', ')}`);
    return 'full state deep-equal (inputs, toggles, derived, deeplink)';
  });

  await check('A7 bridge identity fields match the registry', async () => {
    const info = await j(`(() => {
      const m = window.ramanujanSphere.getManifest();
      return { toolId: window.ramanujanSphere.toolId, schemaVersion: window.ramanujanSphere.schemaVersion,
               version: window.ramanujanSphere.version, mId: m && m.id, mVersion: m && m.version,
               mSchema: m && m.schemaVersion, stateTool: window.ramanujanSphere.getState().tool,
               bridgeBlock: window.ramanujanSphere.getState().bridge };
    })()`);
    assert(info.toolId === AgentCore.TOOL_ID && info.mId === AgentCore.TOOL_ID, 'tool id mismatch');
    assert(info.schemaVersion === AgentCore.SCHEMA_VERSION && info.mSchema === AgentCore.SCHEMA_VERSION, 'schemaVersion mismatch');
    assert(info.version === AgentCore.TOOLSET_VERSION && info.mVersion === AgentCore.TOOLSET_VERSION, 'toolset version mismatch');
    assert(info.stateTool === AgentCore.TOOL_ID, 'state.tool mismatch');
    assert(info.bridgeBlock.schemaVersion === AgentCore.SCHEMA_VERSION && info.bridgeBlock.version === AgentCore.TOOLSET_VERSION,
      `state.bridge ${JSON.stringify(info.bridgeBlock)}`);
    return `${info.toolId} ${info.version} / schema ${info.schemaVersion}`;
  });

  await check('A8 bridge API surface (contract §6 methods)', async () => {
    const missing = await j(`(() => {
      const b = window.ramanujanSphere;
      return ${JSON.stringify(CONTRACT_BRIDGE_METHODS)}.filter(function (k) { return typeof b[k] !== 'function'; });
    })()`);
    assert(missing.length === 0, `missing methods: ${missing.join(', ')}`);
    const ident = await j(`(() => ({ td: window.ramanujanSphere.toolId, s: window.ramanujanSphere.schemaVersion, v: window.ramanujanSphere.version, r: window.ramanujanSphere.ready }))()`);
    assert(ident.td === 'ramanujan-sphere' && ident.s === 1 && ident.v === '1.0.0' && ident.r === true, `identity ${JSON.stringify(ident)}`);
    return CONTRACT_BRIDGE_METHODS.length + ' methods + identity';
  });

  await check('A9 tools(): 9 canonical names, definitions only (no run)', async () => {
    const tools = await j('window.ramanujanSphere.tools()');
    const names = tools.map((t) => t.name);
    assert(names.length === 9, `tools().length = ${names.length}`);
    assert(JSON.stringify(names) === JSON.stringify(AgentCore.TOOL_NAMES), `names differ: ${names.join(',')}`);
    for (const t of tools) {
      assert(typeof t.title === 'string' && t.title.length > 0, `${t.name} missing title`);
      assert(typeof t.description === 'string' && t.description.length > 0, `${t.name} missing description`);
      assert(t.scope === 'pure', `${t.name} scope ${t.scope}`);
      assert(t.inputSchema && t.inputSchema.type === 'object', `${t.name} missing inputSchema`);
      assert(Array.isArray(t.examples), `${t.name} missing examples`);
      assert(!Object.prototype.hasOwnProperty.call(t, 'run'), `${t.name} leaks run()`);
    }
    return '9 pure tools, canonical order, no run()';
  });

  await check('A10 getManifest() deep-equals the Node registry manifest', async () => {
    const pageManifest = await j('window.ramanujanSphere.getManifest()');
    const nodeManifest = AgentCore.getManifest();
    assert(JSON.stringify(pageManifest) === JSON.stringify(nodeManifest), 'manifest differs from registry');
    return `${JSON.stringify(nodeManifest).length} B deep-equal`;
  });

  await check('A11 served agent/manifest.json bytes equal registry serialization', async () => {
    const served = await evaluate(`fetch('agent/manifest.json').then(function (r) { return r.text(); })`);
    const expected = JSON.stringify(AgentCore.getManifest(), null, 2) + '\n';
    assert(served === expected, `served ${String(served).length} B !== registry ${expected.length} B`);
    return `${expected.length} B byte-identical via page fetch`;
  });

  await check('A12 window.__agree === true (single-source cross-view invariant)', async () => {
    const agree = await j('window.__agree');
    assert(agree === true, `window.__agree = ${agree}`);
    return '__agree true';
  });

  await check('A13 3D canvas mounted and sized', async () => {
    const canvas = await j(`(() => {
      const c = document.querySelector('#viewport3d canvas');
      return c ? { w: c.width, h: c.height, cw: c.clientWidth, ch: c.clientHeight } : null;
    })()`);
    assert(canvas, '#viewport3d canvas missing');
    assert(canvas.w > 100 && canvas.h > 100, `canvas backing store ${canvas.w}x${canvas.h}`);
    return `${canvas.w}x${canvas.h} (${canvas.cw}x${canvas.ch} CSS)`;
  });

  await check('A14 body[data-agent-clock] tracks transport.playT', async () => {
    const info = await j(`(() => ({
      clock: document.body.getAttribute('data-agent-clock'),
      playT: window.ramanujanSphere.getState().transport.playT,
      animate: window.ramanujanSphere.getState().transport.animate,
      autoRotate: window.ramanujanSphere.getState().transport.autoRotate,
      staticMode: window.ramanujanSphere.getState().transport.staticMode
    }))()`);
    assert(info.clock === Number(info.playT).toFixed(4), `clock "${info.clock}" vs playT ${info.playT}`);
    assert(info.animate === false && info.autoRotate === false && info.staticMode === true,
      `transport ${JSON.stringify(info)}`);
    return `clock ${info.clock} === playT; frozen transport`;
  });

  await check('A15 getState() returns a fresh object each call', async () => {
    const info = await j(`(() => {
      const b = window.ramanujanSphere;
      const a = b.getState();
      const c = b.getState();
      const distinct = a !== b.getState() && a !== c;
      a.tab = 'mutated-by-caller';
      const after = b.getState().tab;
      return { distinct: distinct, after: after };
    })()`);
    assert(info.distinct, 'getState() returned the same object reference');
    assert(info.after !== 'mutated-by-caller', 'mutating the returned state affected live state');
    return 'fresh copy, caller mutation isolated';
  });

  // ---- B. event semantics ------------------------------------------------
  await check('B1 no-op setter emits ZERO change events', async () => {
    const info = await j(`(() => {
      const b = window.ramanujanSphere;
      const c0 = window.__agentEvents.change;
      const r = b.setState({ tab: b.getState().tab });
      return { ok: r.ok, delta: window.__agentEvents.change - c0, tab: b.getState().tab };
    })()`);
    assert(info.ok === true, 'no-op setter returned not-ok');
    assert(info.delta === 0, `no-op emitted ${info.delta} change event(s)`);
    return 'delta 0';
  });

  await check('B2 a genuine mutation emits exactly ONE change event', async () => {
    const info = await j(`(() => {
      const b = window.ramanujanSphere;
      const c0 = window.__agentEvents.change;
      const r = b.setState({ tab: 'bits' });
      return { ok: r.ok, delta: window.__agentEvents.change - c0, tab: b.getState().tab,
               panel: document.querySelector('[data-agent-panel="bits"]').classList.contains('active') };
    })()`);
    assert(info.ok === true, 'setState failed');
    assert(info.delta === 1, `emitted ${info.delta} change event(s)`);
    assert(info.tab === 'bits' && info.panel === true, 'bits tab/panel not active');
    return 'delta 1, tab+panel switched';
  });

  await check('B3 re-applying the same value emits ZERO further events', async () => {
    const info = await j(`(() => {
      const b = window.ramanujanSphere;
      const c0 = window.__agentEvents.change;
      b.setState({ tab: 'bits' });
      return { delta: window.__agentEvents.change - c0 };
    })()`);
    assert(info.delta === 0, `idempotent mutation emitted ${info.delta} event(s)`);
    return 'delta 0';
  });

  await check('B4 animation ticks advance playT without emitting change events', async () => {
    const info = await j(`(async () => {
      const b = window.ramanujanSphere;
      b.pause();
      const c0 = window.__agentEvents.change;
      b.play();
      const cPlay = window.__agentEvents.change;
      await new Promise(function (r) { setTimeout(r, 450); });
      const cIdle = window.__agentEvents.change;
      const clock1 = document.body.getAttribute('data-agent-clock');
      await new Promise(function (r) { setTimeout(r, 450); });
      const clock2 = document.body.getAttribute('data-agent-clock');
      b.pause();
      return { playDelta: cPlay - c0, tickDelta: cIdle - cPlay, clockMoved: clock1 !== clock2, clock1: clock1, clock2: clock2 };
    })()`);
    assert(info.playDelta === 1, `play() emitted ${info.playDelta} events`);
    assert(info.tickDelta === 0, `animation ticks emitted ${info.tickDelta} change events`);
    assert(info.clockMoved, `data-agent-clock did not advance (${info.clock1} -> ${info.clock2})`);
    return 'play=1, ticks=0, clock advanced';
  });

  await check('B5 subscribe: one immediate call, changes only, no-op silent', async () => {
    const info = await j(`(() => {
      const b = window.ramanujanSphere;
      b.setTab('scopes');
      let calls = 0;
      const off = b.subscribe(function () { calls += 1; });
      const immediate = calls;
      const c0 = window.__agentEvents.change;
      b.setTab('bits');
      const afterChange = calls;
      b.setState({ tab: 'bits' });
      const afterNoop = calls;
      off();
      return { immediate: immediate, afterChange: afterChange, afterNoop: afterNoop, eventDelta: window.__agentEvents.change - c0 };
    })()`);
    assert(info.immediate === 1, `immediate calls: ${info.immediate}`);
    assert(info.afterChange === 2, `calls after change: ${info.afterChange}`);
    assert(info.afterNoop === 2, `no-op produced a subscriber call: ${info.afterNoop}`);
    return 'immediate=1, change=2, no-op silent';
  });

  await check('B6 unsubscribe is idempotent', async () => {
    const info = await j(`(() => {
      const b = window.ramanujanSphere;
      let calls = 0;
      const off = b.subscribe(function () { calls += 1; });
      off();
      off();
      b.setTab('harmonics');
      b.setTab('scopes');
      return { calls: calls };
    })()`);
    assert(info.calls === 1, `calls after unsubscribe: ${info.calls}`);
    return 'calls stay at 1 after off() twice + 2 mutations';
  });

  await check('B7 a throwing subscriber is isolated', async () => {
    const info = await j(`(() => {
      const b = window.ramanujanSphere;
      let good = 0;
      b.subscribe(function () { throw new Error('boom'); });
      const off = b.subscribe(function () { good += 1; });
      const r = b.setState({ tab: 'bits' });
      off();
      return { ok: r.ok, good: good };
    })()`);
    assert(info.ok === true, 'setState failed with a throwing subscriber');
    assert(info.good === 2, `second subscriber calls: ${info.good}`);
    await assertCleanConsole('B7');
    return 'throwing subscriber contained, sibling delivered 2 calls';
  });

  // ---- C. setters: never throw, errors leave state unchanged -------------
  await check('C1 invalid tab -> E_BAD_TAB, state unchanged, no throw', async () => {
    const info = await j(`(() => {
      const b = window.ramanujanSphere;
      const before = JSON.stringify(b.getState());
      const r = b.setState({ tab: 'nope' });
      return { ok: r.ok, code: r.error && r.error.code, same: JSON.stringify(b.getState()) === before, tab: b.getState().tab };
    })()`);
    assert(info.ok === false && info.code === 'E_BAD_TAB', `got ${JSON.stringify(info)}`);
    assert(info.same, 'state changed on an invalid patch');
    return 'E_BAD_TAB, unchanged';
  });

  await check('C2 unknown patch key -> E_BAD_ARGS, state unchanged', async () => {
    const info = await j(`(() => {
      const b = window.ramanujanSphere;
      const before = JSON.stringify(b.getState());
      const r = b.setState({ notAKey: 1 });
      return { ok: r.ok, code: r.error && r.error.code, same: JSON.stringify(b.getState()) === before };
    })()`);
    assert(info.ok === false && info.code === 'E_BAD_ARGS', `got ${JSON.stringify(info)}`);
    assert(info.same, 'state changed on an invalid patch');
    return 'E_BAD_ARGS, unchanged';
  });

  await check('C3 out-of-range numeric -> E_OUT_OF_RANGE, state unchanged', async () => {
    const info = await j(`(() => {
      const b = window.ramanujanSphere;
      const before = JSON.stringify(b.getState());
      const r = b.setState({ r: 99 });
      return { ok: r.ok, code: r.error && r.error.code, same: JSON.stringify(b.getState()) === before };
    })()`);
    assert(info.ok === false && info.code === 'E_OUT_OF_RANGE', `got ${JSON.stringify(info)}`);
    assert(info.same, 'state changed on an invalid patch');
    return 'E_OUT_OF_RANGE, unchanged';
  });

  await check('C4 bad patch shapes/enums all return E_* and never throw', async () => {
    const info = await j(`(() => {
      const b = window.ramanujanSphere;
      const before = JSON.stringify(b.getState());
      const out = {};
      const probe = function (name, fn) {
        try { const r = fn(); out[name] = { ok: r && r.ok, code: r && r.error && r.error.code }; }
        catch (e) { out[name] = { threw: String(e && e.message) }; }
      };
      probe('numberPatch', function () { return b.setState(42); });
      probe('arrayPatch', function () { return b.setState([]); });
      probe('badTwin', function () { return b.setState({ twin: 'sideways' }); });
      probe('badZoom', function () { return b.setState({ mz: 17 }); });
      probe('badClock', function () { return b.setClock('abc'); });
      probe('badStep', function () { return b.step(NaN); });
      probe('nullPatch', function () { return b.setState(null); });
      out.unchanged = JSON.stringify(b.getState()) === before;
      return out;
    })()`);
    assert(!info.numberPatch.threw && info.numberPatch.ok === false && info.numberPatch.code === 'E_BAD_ARGS', `number patch: ${JSON.stringify(info.numberPatch)}`);
    assert(!info.arrayPatch.threw && info.arrayPatch.ok === false && info.arrayPatch.code === 'E_BAD_ARGS', `array patch: ${JSON.stringify(info.arrayPatch)}`);
    assert(!info.badTwin.threw && info.badTwin.ok === false && /^E_/.test(info.badTwin.code), `bad twin: ${JSON.stringify(info.badTwin)}`);
    assert(!info.badZoom.threw && info.badZoom.ok === false && /^E_/.test(info.badZoom.code), `bad zoom: ${JSON.stringify(info.badZoom)}`);
    assert(!info.badClock.threw && info.badClock.ok === false && info.badClock.code === 'E_BAD_ARGS', `bad clock: ${JSON.stringify(info.badClock)}`);
    assert(!info.badStep.threw && info.badStep.ok === false && info.badStep.code === 'E_BAD_ARGS', `bad step: ${JSON.stringify(info.badStep)}`);
    assert(!info.nullPatch.threw && info.nullPatch.ok === true, `null patch: ${JSON.stringify(info.nullPatch)}`);
    assert(info.unchanged, 'state changed after invalid probes');
    return '7 actor probes: no throws, E_* codes, state unchanged';
  });

  await check('C5 setState applies synchronously (same-task round-trip)', async () => {
    const info = await j(`(() => {
      const b = window.ramanujanSphere;
      b.setState({ twin: 'conjugate' });
      const sameTaskTwin = b.getState().twinMode;
      b.setState({ preset: 12, twin: 'both' });
      return { sameTaskTwin: sameTaskTwin, restored: b.getState().twinMode };
    })()`);
    assert(info.sameTaskTwin === 'conjugate', `same-task twinMode = ${info.sameTaskTwin}`);
    assert(info.restored === 'both', `restore failed: ${info.restored}`);
    return 'twinMode visible in the same task';
  });

  await check('C6 setState({preset:5}) re-bases inputs/formulas from the registry', async () => {
    const expected = AgentCore.resolveState({ preset: 5 });
    const info = await j(`(() => {
      const b = window.ramanujanSphere;
      const r = b.setState({ preset: 5 });
      const s = b.getState();
      return { ok: r.ok, preset: s.preset, inputs: s.inputs, formulas: s.formulas };
    })()`);
    assert(info.ok === true, 'setState(preset 5) failed');
    assert(info.preset.index === 5, `preset index ${info.preset.index}`);
    assert(info.preset.name === AgentCore.PRESET_CATALOG[5].name, `preset name "${info.preset.name}"`);
    for (const k of ['r', 'rIn', 'amp', 'f', 'K', 'orderN', 'a', 'b', 'n', 'm', 'k']) {
      assert(info.inputs[k] === expected[k], `inputs.${k} ${info.inputs[k]} !== ${expected[k]}`);
    }
    assert(JSON.stringify(info.formulas) === JSON.stringify(expected.formulas), 'formulas differ from preset 5');
    return `preset 5 "${info.preset.name}"`;
  });

  await check('C7 deeplink parameter names accepted by setState', async () => {
    const info = await j(`(() => {
      const b = window.ramanujanSphere;
      const r = b.setState({ preset: 12, r: 1.2, rIn: 0.6, pt: 0.25, anim: 0, twin: 'conjugate', bit: 'main', mz: 64, mf: 'playhead' });
      const s = b.getState();
      return { ok: r.ok, r: s.inputs.r, rIn: s.inputs.rIn, playT: s.transport.playT, animate: s.transport.animate,
               twin: s.twinMode, bit: s.bitSource, zoom: s.magnifier.zoom, focus: s.magnifier.focus };
    })()`);
    assert(info.ok === true, 'setState failed');
    assert(info.r === 1.2 && info.rIn === 0.6, `r/rIn ${info.r}/${info.rIn}`);
    assert(info.playT === 0.25 && info.animate === false, `pt/anim ${info.playT}/${info.animate}`);
    assert(info.twin === 'conjugate' && info.bit === 'main' && info.zoom === 64 && info.focus === 'playhead',
      `view enums ${JSON.stringify(info)}`);
    return 'r/rIn/pt/anim/twin/bit/mz/mf applied';
  });

  // ---- D. clock, step, play/pause, reset, race ---------------------------
  await check('D1 animate-mode setClock pauses and pins the frame', async () => {
    await navigate(''); // animate mode: transport runs by default
    const info = await j(`(async () => {
      const b = window.ramanujanSphere;
      const before = b.getState().transport;
      const r = b.setClock(0.25);
      const s = b.getState().transport;
      await new Promise(function (res) { setTimeout(res, 700); });
      const later = b.getState().transport;
      return { beforeAnimate: before.animate, beforeStatic: before.staticMode, ok: r.ok,
               playT: s.playT, animate: s.animate, laterPlayT: later.playT, laterAnimate: later.animate };
    })()`);
    assert(info.beforeAnimate === true && info.beforeStatic === false, `animate-mode precondition failed: ${JSON.stringify(info)}`);
    assert(info.ok === true, 'setClock failed');
    assert(info.playT === 0.25 && info.animate === false, `setClock(0.25) -> playT ${info.playT} / animate ${info.animate}`);
    assert(info.laterPlayT === 0.25 && info.laterAnimate === false, `frame did not stay pinned: ${info.laterPlayT}/${info.laterAnimate}`);
    return 'animate -> paused+pinned 0.25, stable after 700 ms';
  });

  await check('D1b setClock pauses even when playT is already pinned (contract §6)', async () => {
    await navigate('?static=1');
    const info = await j(`(() => {
      const b = window.ramanujanSphere;
      b.setClock(0.25);
      b.play();
      const playing = b.getState().transport.animate;
      const r = b.setClock(0.25);
      const s = b.getState().transport;
      return { playing: playing, ok: r.ok, playT: s.playT, animate: s.animate };
    })()`);
    assert(info.playing === true, 'play() did not start the transport');
    assert(info.ok === true, 'setClock returned not-ok');
    assert(info.playT === 0.25, `playT = ${info.playT}`);
    assert(info.animate === false, 'setClock did not pause when playT was already at the target value');
    return 'setClock(0.25) while playing at 0.25 -> animate false';
  });

  await check('D1c setClock clamps out-of-range input to [0,1]', async () => {
    const info = await j(`(() => {
      const b = window.ramanujanSphere;
      const hi = b.setClock(4);
      const lo = b.setClock(-4);
      return { hi: hi.state.transport.playT, lo: lo.state.transport.playT, animate: lo.state.transport.animate };
    })()`);
    assert(info.hi === 1, `setClock(4) -> ${info.hi}`);
    assert(info.lo === 0, `setClock(-4) -> ${info.lo}`);
    assert(info.animate === false, 'setClock did not keep the transport paused');
    return 'clamps to 1 / 0';
  });

  await check('D2 step(delta) adds and clamps at 0/1', async () => {
    const info = await j(`(() => {
      const b = window.ramanujanSphere;
      b.setClock(0);
      const a = b.step(0.1);
      const x = a.state.transport.playT;
      const hi = b.step(9);
      const lo = b.step(-9);
      return { x: x, hi: hi.state.transport.playT, lo: lo.state.transport.playT, animate: lo.state.transport.animate };
    })()`);
    assert(Math.abs(info.x - 0.1) < 1e-9, `step(0.1) from 0 -> ${info.x}`);
    assert(info.hi === 1, `step(+9) -> ${info.hi}`);
    assert(info.lo === 0, `step(-9) -> ${info.lo}`);
    assert(info.animate === false, 'step did not keep the transport paused');
    return '0 -> 0.1 -> 1 -> 0 (clamped, paused)';
  });

  await check('D3 play()/pause() toggle animate', async () => {
    const info = await j(`(() => {
      const b = window.ramanujanSphere;
      b.play();
      const a = b.getState().transport.animate;
      b.pause();
      const p = b.getState().transport.animate;
      return { play: a, pause: p };
    })()`);
    assert(info.play === true, 'play() did not set animate');
    assert(info.pause === false, 'pause() did not clear animate');
    return 'animate true -> false';
  });

  await check('D4 race: setState then step in the same tick', async () => {
    const info = await j(`(() => {
      const b = window.ramanujanSphere;
      b.setState({ playT: 0.1 });
      b.step(0.05);
      const playT = b.getState().transport.playT;
      b.setTab('bits');
      b.setTab('harmonics');
      const tab = b.getState().tab;
      return { playT: playT, tab: tab };
    })()`);
    assert(Math.abs(info.playT - 0.15) < 1e-9, `same-tick playT = ${info.playT}`);
    assert(info.tab === 'harmonics', `same-tick final tab = ${info.tab}`);
    return 'playT 0.15, tab harmonics';
  });

  await check('D5 reset() restores the contract default state', async () => {
    await navigate('?static=1');
    const expected = expectedStateFor('?static=1');
    const info = await j(`(() => {
      const b = window.ramanujanSphere;
      b.setState({ preset: 5, tab: 'bits', twin: 'conjugate', r: 1.4 });
      const r = b.reset();
      return { ok: r.ok, state: b.getState() };
    })()`);
    assert(info.ok === true, 'reset() failed');
    const diffs = diffState(info.state, expected);
    assert(diffs.length === 0, `reset state differs from default: ${diffs.join(', ')}`);
    assert(info.state.preset.index === 12 && info.state.tab === 'scopes' && info.state.transport.playT === 0,
      'reset did not restore preset 12/scopes/playT 0');
    return 'preset 12, scopes, playT 0, full default projection';
  });

  // ---- E. documented deeplinks render the right view ---------------------
  const DEEPLINKS = [
    { path: '?tab=bits&static=1', tab: 'bits', preset: 12 },
    { path: '?preset=5&tab=harmonics&static=1', tab: 'harmonics', preset: 5 },
    { path: '?preset=12&twin=conjugate&pt=0.25&static=1', tab: 'scopes', preset: 12 },
    { path: '?preset=12&r=1.2&rIn=0.6&static=1', tab: 'scopes', preset: 12 }
  ];
  for (let i = 0; i < DEEPLINKS.length; i += 1) {
    const link = DEEPLINKS[i];
    await check(`E${i + 1} deeplink ${link.path} renders the registry state`, async () => {
      await navigate(link.path);
      const live = await j(`(() => ({
        state: window.ramanujanSphere.getState(),
        activeTabBtn: (document.querySelector('[data-agent-tab="' + window.ramanujanSphere.getState().tab + '"]') || {}).className || '',
        activePanel: (document.querySelector('[data-agent-panel="' + window.ramanujanSphere.getState().tab + '"]') || {}).className || '',
        visiblePanels: Array.prototype.filter.call(document.querySelectorAll('[data-agent-panel]'), function (p) { return getComputedStyle(p).display !== 'none'; }).map(function (p) { return p.getAttribute('data-agent-panel'); })
      }))()`);
      const expected = expectedStateFor(link.path);
      const diffs = diffState(live.state, expected);
      assert(diffs.length === 0, `state differs: ${diffs.join(', ')}`);
      assert(live.state.tab === link.tab, `tab ${live.state.tab}`);
      assert(live.state.preset.index === link.preset, `preset ${live.state.preset.index}`);
      assert(/\bactive\b/.test(live.activeTabBtn), 'tab button not marked active');
      assert(/\bactive\b/.test(live.activePanel), 'panel not marked active');
      assert(JSON.stringify(live.visiblePanels) === JSON.stringify([link.tab]), `visible panels: ${live.visiblePanels.join(',')}`);
      await assertCleanConsole(`E${i + 1}`);
      return `tab ${link.tab}, preset ${link.preset}, ${diffs.length} diffs, panel visible`;
    });
  }

  await check('E5 tolerant parse: unknown/invalid params never crash the page', async () => {
    await navigate('?tab=nope&r=99&bogus=1&static=1');
    const info = await j(`(() => ({
      tab: window.ramanujanSphere.getState().tab,
      r: window.ramanujanSphere.getState().inputs.r,
      ready: window.ramanujanSphere.ready
    }))()`);
    assert(info.tab === 'scopes', `invalid tab fell back to ${info.tab}`);
    assert(info.r === 1, `invalid r fell back to ${info.r}`);
    await assertCleanConsole('E5');
    return 'tab scopes, r 1, no console errors';
  });

  await check('E6 every deeplink example in AGENTS.md §4.1 applies the registry state', async () => {
    const doc = await (await fetch(opts.base + 'AGENTS.md')).text();
    const section = doc.split('### 4.1')[1] ? doc.split('### 4.1')[1].split('###')[0] : '';
    const links = [...section.matchAll(/https?:\/\/127\.0\.0\.1:8080\/[^\s`'"]*/g)].map((m) => m[0]);
    assert(links.length >= 5, `AGENTS.md §4.1 exposes only ${links.length} deeplink example(s)`);
    const failures = [];
    const checked = [];
    for (const link of links) {
      const parsed = AgentCore.parseDeeplink(link);
      const patch = parsed.patch || {};
      const expectedTab = patch.tab || AgentCore.DEFAULT_TAB;
      await navigate(link);
      const live = await j(`(() => ({ state: window.ramanujanSphere.getState(),
        visible: Array.prototype.filter.call(document.querySelectorAll('[data-agent-panel]'), function (p) { return getComputedStyle(p).display !== 'none'; }).map(function (p) { return p.getAttribute('data-agent-panel'); }) }))()`);
      const s = live.state;
      const problems = [];
      if (s.preset.index !== parsed.presetIndex) problems.push(`preset ${s.preset.index} !== ${parsed.presetIndex}`);
      if (s.tab !== expectedTab) problems.push(`tab ${s.tab} !== ${expectedTab}`);
      if (JSON.stringify(live.visible) !== JSON.stringify([expectedTab])) problems.push(`visible panels ${live.visible.join(',')}`);
      if (patch.twinMode && s.twinMode !== patch.twinMode) problems.push(`twin ${s.twinMode} !== ${patch.twinMode}`);
      if (patch.bitSource && s.bitSource !== patch.bitSource) problems.push(`bit ${s.bitSource} !== ${patch.bitSource}`);
      if (patch.staticMode != null && s.transport.staticMode !== !!patch.staticMode) problems.push(`staticMode ${s.transport.staticMode}`);
      if (patch.playT != null && Math.abs(s.transport.playT - patch.playT) > 1e-9) problems.push(`playT ${s.transport.playT} !== ${patch.playT}`);
      if (patch.inputs) {
        for (const [k, v] of Object.entries(patch.inputs)) {
          if (Math.abs(Number(s.inputs[k]) - Number(v)) > 1e-9) problems.push(`inputs.${k} ${s.inputs[k]} !== ${v}`);
        }
      }
      if (link.includes('static')) await assertCleanConsole(link);
      if (problems.length) failures.push(`${link} -> ${problems.join('; ')}`);
      checked.push(new URL(link).search || '(default)');
    }
    assert(failures.length === 0, `doc examples failed: ${failures.join(' | ')}`);
    return `${links.length} documented examples verified: ${checked.join(' ')}`;
  });


  await check('F1 URL sync uses replaceState (no history entry) and canonical order', async () => {
    await navigate('?static=1');
    const expectedUrl = AgentCore.buildDeeplink({ tab: 'bits', static: true }).url;
    const info = await j(`(async () => {
      const hist0 = history.length;
      window.ramanujanSphere.setState({ tab: 'bits' });
      await new Promise(function (r) { setTimeout(r, 650); });
      return { search: location.search, href: location.href, deeplink: window.ramanujanSphere.getDeeplink(), hist0: hist0, hist1: history.length };
    })()`);
    assert(info.search === '?tab=bits&static=1', `location.search = ${info.search}`);
    assert(info.deeplink === expectedUrl, `getDeeplink ${info.deeplink} !== ${expectedUrl}`);
    assert(info.href === expectedUrl, `location.href ${info.href} !== ${expectedUrl}`);
    assert(info.hist1 === info.hist0, `history.length changed ${info.hist0} -> ${info.hist1}`);
    return 'replaceState, history.length unchanged, canonical URL';
  });

  await check('F2 deeplink reload reproduces byte-identical state (twice)', async () => {
    await navigate('?static=1');
    await evaluate('(async () => { window.ramanujanSphere.setState({ tab: "bits", twin: "conjugate", r: 1.2, pt: 0.25 }); await new Promise(function (r) { setTimeout(r, 650); }); })()');
    const link = await evaluate('window.ramanujanSphere.getDeeplink()');
    const expectedUrl = AgentCore.buildDeeplink({ tab: 'bits', twin: 'conjugate', r: 1.2, playT: 0.25, static: true }).url;
    assert(link === expectedUrl, `getDeeplink ${link} !== ${expectedUrl}`);
    await navigate(link);
    const a = await evaluate('JSON.stringify(window.ramanujanSphere.getState())');
    await reload();
    const b = await evaluate('JSON.stringify(window.ramanujanSphere.getState())');
    await reload();
    const c = await evaluate('JSON.stringify(window.ramanujanSphere.getState())');
    assert(a === b, 'state changed across reload #1 of the same deeplink');
    assert(b === c, 'state changed across reload #2 of the same deeplink');
    assert(JSON.parse(a).deeplink === link, 'state.deeplink does not equal the opened link');
    return `${JSON.parse(a).deeplink.length} B link, state ${a.length} B byte-identical across two reloads`;
  });

  await check('F3 default view is delta-encoded to an empty query', async () => {
    await navigate('');
    const info = await j(`(async () => {
      await new Promise(function (r) { setTimeout(r, 650); });
      return { search: location.search, deeplink: window.ramanujanSphere.getDeeplink(), stateLink: window.ramanujanSphere.getState().deeplink,
               preset: window.ramanujanSphere.getState().preset.index, tab: window.ramanujanSphere.getState().tab };
    })()`);
    assert(info.search === '', `default URL query = "${info.search}"`);
    assert(info.deeplink === opts.base, `default getDeeplink = ${info.deeplink}`);
    assert(info.stateLink === opts.base, `state.deeplink = ${info.stateLink}`);
    assert(info.preset === 12 && info.tab === 'scopes', `default preset/tab ${info.preset}/${info.tab}`);
    return 'empty query, base deeplink, preset 12/scopes';
  });

  await check('F4 getState().deeplink === bridge.getDeeplink() (page consistency)', async () => {
    await navigate('?preset=5&tab=harmonics&static=1');
    const info = await j(`(() => ({ a: window.ramanujanSphere.getState().deeplink, b: window.ramanujanSphere.getDeeplink() }))()`);
    assert(info.a === info.b, `state.deeplink ${info.a} !== getDeeplink ${info.b}`);
    assert(info.b === opts.base + '?preset=5&tab=harmonics&static=1', `unexpected deeplink ${info.b}`);
    return 'both agree on the canonical link';
  });

  // ---- G. bridge call() parity + Agent panel -----------------------------
  await check('G1 bridge call() envelopes equal the Node registry (success/unknown/bad-args)', async () => {
    const pageCalls = await j(`(() => ({
      ok: window.ramanujanSphere.call('bit_inspect', { value: 3.141592653589793 }),
      unknown: window.ramanujanSphere.call('not_a_tool', {}),
      bad: window.ramanujanSphere.call('bit_inspect', {})
    }))()`);
    const cases = [
      ['ok', AgentCore.callTool('bit_inspect', { value: 3.141592653589793 })],
      ['unknown', AgentCore.callTool('not_a_tool', {})],
      ['bad', AgentCore.callTool('bit_inspect', {})]
    ];
    for (const [name, expected] of cases) {
      assert(JSON.stringify(pageCalls[name]) === JSON.stringify(expected), `${name} envelope differs from registry`);
    }
    assert(pageCalls.ok.data.hex === '0x40490FDB', `π hex ${pageCalls.ok.data.hex}`);
    assert(pageCalls.unknown.error.code === 'E_UNKNOWN_TOOL', `unknown code ${pageCalls.unknown.error.code}`);
    assert(pageCalls.bad.error.code === 'E_EMPTY_INPUT', `bad code ${pageCalls.bad.error.code}`);
    return '3 envelopes byte-identical to callTool()';
  });

  await check('G2 Agent panel: visible, bridge-active, deeplink + state JSON', async () => {
    await navigate('?tab=agent&static=1', 1000);
    const info = await j(`(() => {
      const b = window.ramanujanSphere;
      const panel = document.querySelector('[data-agent-panel="agent"]');
      const status = document.querySelector('[data-agent-status]');
      const dl = document.getElementById('agentDeeplink');
      const sj = document.getElementById('agentStateJson');
      const live = b.getState();
      return {
        panel: !!panel,
        display: panel ? getComputedStyle(panel).display : null,
        otherDisplays: Array.prototype.map.call(document.querySelectorAll('[data-agent-panel]:not([data-agent-panel="agent"])'), function (p) { return getComputedStyle(p).display; }),
        statusAttr: status && status.getAttribute('data-agent-status'),
        statusText: status && status.textContent,
        deeplink: dl && dl.textContent,
        current: b.getDeeplink(),
        stateJson: sj && sj.textContent,
        live: JSON.stringify(live),
        liveTab: live.tab,
        hiddenDom: document.querySelector('#ramanujan-sphere-state').textContent
      };
    })()`);
    assert(info.panel && info.display === 'flex', `agent panel display ${info.display}`);
    assert(info.otherDisplays.every((d) => d === 'none'), `other panels visible: ${info.otherDisplays.join(',')}`);
    assert(info.statusAttr === 'bridge-active' && info.statusText === 'bridge-active', `status ${info.statusAttr}/${info.statusText}`);
    assert(info.deeplink === info.current, `deeplink box ${info.deeplink} !== ${info.current}`);
    assert(JSON.stringify(JSON.parse(info.stateJson)) === info.live, 'panel state JSON !== getState()');
    assert(info.liveTab === 'agent', `state.tab ${info.liveTab}`);
    assert(info.hiddenDom === info.live, 'hidden DOM state !== getState() on the agent tab');
    return 'panel visible, badge bridge-active, deeplink + state JSON live';
  });

  await check('G3 Agent panel: 9-tool catalogue in canonical order', async () => {
    const info = await j(`(() => ({
      count: document.getElementById('agentToolCount') && document.getElementById('agentToolCount').textContent,
      names: Array.prototype.map.call(document.querySelectorAll('#agentToolList li code'), function (c) { return c.textContent; }),
      empty: !!document.querySelector('#agentToolList .agent-tool-empty')
    }))()`);
    assert(info.count === '9', `agentToolCount = ${info.count}`);
    assert(JSON.stringify(info.names) === JSON.stringify(AgentCore.TOOL_NAMES), `tool list ${info.names.join(',')}`);
    assert(info.empty === false, 'tool list still shows the empty placeholder');
    return '9 names, canonical order';
  });

  await check('G4 handoff prompt contains deeplink, AGENTS.md, bridge, manifest, all tools', async () => {
    const info = await j(`(() => ({ prompt: document.getElementById('agentHandoffPrompt').textContent, deeplink: window.ramanujanSphere.getDeeplink() }))()`);
    const p = info.prompt;
    assert(p && p.length > 200, 'handoff prompt is empty');
    assert(p.includes(info.deeplink), 'handoff prompt lacks the current deeplink');
    assert(p.includes('AGENTS.md'), 'handoff prompt lacks AGENTS.md');
    assert(p.includes('window.ramanujanSphere'), 'handoff prompt lacks window.ramanujanSphere');
    assert(p.includes('agent/manifest.json'), 'handoff prompt lacks agent/manifest.json');
    for (const name of AgentCore.TOOL_NAMES) {
      assert(p.includes(name), `handoff prompt lacks tool name ${name}`);
    }
    return `${p.length} B prompt with all required tokens`;
  });

  await check('G5 Agent panel links resolve to the documented surfaces', async () => {
    const links = await j(`Array.prototype.map.call(document.querySelectorAll('[data-agent-panel="agent"] a'), function (a) { return a.getAttribute('href'); })`);
    for (const expected of ['AGENTS.md', 'docs/AGENT-INTERFACE.md', 'agent/manifest.json']) {
      assert(links.indexOf(expected) >= 0, `missing link ${expected} (got ${links.join(', ')})`);
    }
    return links.join(', ');
  });

  await check('G6 copy buttons copy the deeplink, handoff prompt and state JSON', async () => {
    await navigate('?tab=agent&static=1', 900);
    const info = await j(`(async () => {
      const out = { stub: 'ok' };
      try {
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: { writeText: function (t) { window.__clip = String(t); return Promise.resolve(); } }
        });
      } catch (e) { out.stub = 'unavailable'; }
      const click = function (sel) { const b = document.querySelector(sel); if (!b) return false; b.click(); return true; };
      const wait = function () { return new Promise(function (r) { setTimeout(r, 120); }); };
      click('[data-agent-copy="deeplink"]'); await wait(); out.deeplink = window.__clip; out.deeplinkBtn = !!document.querySelector('[data-agent-copy="deeplink"]');
      click('[data-agent-copy="handoff"]'); await wait(); out.handoff = window.__clip;
      click('[data-agent-copy="state"]'); await wait(); out.state = window.__clip;
      out.current = window.ramanujanSphere.getDeeplink();
      out.live = JSON.stringify(window.ramanujanSphere.getState());
      out.domDeeplink = document.getElementById('agentDeeplink').textContent;
      out.domHandoff = document.getElementById('agentHandoffPrompt').textContent;
      out.domState = document.getElementById('agentStateJson').textContent;
      return out;
    })()`);
    assert(info.stub === 'ok', `clipboard stub failed: ${info.stub}`);
    assert(info.deeplink === info.current, `copied deeplink ${info.deeplink} !== ${info.current}`);
    assert(info.domDeeplink === info.current, 'DOM deeplink box differs');
    assert(info.state && JSON.stringify(JSON.parse(info.state)) === info.live, 'copied state JSON differs from getState()');
    assert(info.handoff && info.handoff.includes(info.current) && info.handoff.includes('AGENTS.md'), 'copied handoff prompt incomplete');
    assert(info.domHandoff === info.handoff, 'copied handoff prompt differs from the DOM prompt');
    return 'clipboard: deeplink + prompt + state JSON all correct';
  });

  // ---- H. automation hooks, layout, regression ---------------------------
  await check('H1 documented automation selectors present', async () => {
    await navigate('?static=1');
    const info = await j(`(() => ({
      tabs: Array.prototype.map.call(document.querySelectorAll('[data-agent-tab]'), function (b) { return b.getAttribute('data-agent-tab'); }),
      panels: Array.prototype.map.call(document.querySelectorAll('[data-agent-panel]'), function (p) { return p.getAttribute('data-agent-panel'); }),
      inputs: Array.prototype.map.call(document.querySelectorAll('[data-agent-input]'), function (el) { return el.getAttribute('data-agent-input'); }),
      toggles: Array.prototype.map.call(document.querySelectorAll('[data-agent-toggle]'), function (el) { return el.getAttribute('data-agent-toggle'); }),
      zooms: Array.prototype.map.call(document.querySelectorAll('[data-agent-zoom]'), function (el) { return el.getAttribute('data-agent-zoom'); }),
      focuses: Array.prototype.map.call(document.querySelectorAll('[data-agent-focus]'), function (el) { return el.getAttribute('data-agent-focus'); }),
      clock: document.body.getAttribute('data-agent-clock'),
      ready: document.body.getAttribute('data-agent-ready')
    }))()`);
    assert(JSON.stringify(info.tabs) === JSON.stringify(AgentCore.TABS), `tabs ${info.tabs.join(',')}`);
    assert(JSON.stringify(info.panels) === JSON.stringify(AgentCore.TABS), `panels ${info.panels.join(',')}`);
    for (const name of DOCUMENTED_INPUT_HOOKS) assert(info.inputs.indexOf(name) >= 0, `missing [data-agent-input="${name}"]`);
    for (const name of DOCUMENTED_TOGGLE_HOOKS) assert(info.toggles.indexOf(name) >= 0, `missing [data-agent-toggle="${name}"]`);
    assert(JSON.stringify(info.zooms) === JSON.stringify(['4', '16', '64', '256']), `zooms ${info.zooms.join(',')}`);
    assert(JSON.stringify(info.focuses) === JSON.stringify(['playhead', 'origin', 'trough']), `focus ${info.focuses.join(',')}`);
    assert(info.clock && /^\d+\.\d{4}$/.test(info.clock), `data-agent-clock "${info.clock}"`);
    assert(info.ready === 'true', 'ready marker missing');
    return `${info.tabs.length} tabs, ${info.panels.length} panels, ${info.inputs.length} inputs, ${info.toggles.length} toggles, ${info.zooms.length} zooms`;
  });

  async function layoutSnapshot() {
    return j(`(() => {
      const de = document.documentElement;
      const pane = document.querySelector('[data-agent-panel="agent"]');
      const pr = pane.getBoundingClientRect();
      const cards = Array.prototype.map.call(pane.querySelectorAll(':scope > .agent-card'), function (c) {
        const r = c.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: r.width, h: r.height };
      });
      let overlap = false;
      for (let i = 0; i < cards.length; i += 1) {
        for (let k = i + 1; k < cards.length; k += 1) {
          const a = cards[i];
          const b = cards[k];
          const ix = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (ix > 1 && iy > 1) overlap = true;
        }
      }
      const offenders = [];
      Array.prototype.forEach.call(pane.querySelectorAll('*'), function (el) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1)) {
          offenders.push((el.id || el.className || el.tagName) + ' right=' + Math.round(r.right));
        }
      });
      const scrollBlocks = Array.prototype.map.call(pane.querySelectorAll('.agent-block, .agent-tools'), function (el) {
        return { id: el.id || el.className, sh: el.scrollHeight, ch: el.clientHeight, oy: getComputedStyle(el).overflowY };
      });
      const cardsOverflow = Array.prototype.map.call(pane.querySelectorAll(':scope > .agent-card'), function (c) {
        const cs = getComputedStyle(c);
        return { id: c.className, sh: c.scrollHeight, ch: c.clientHeight, oy: cs.overflowY, ox: cs.overflowX };
      });
      const paneCs = getComputedStyle(pane);
      return {
        innerWidth: window.innerWidth, innerHeight: window.innerHeight,
        docScrollWidth: de.scrollWidth, bodyScrollWidth: document.body.scrollWidth,
        pane: { left: pr.left, right: pr.right, top: pr.top, bottom: pr.bottom },
        paneScrollHeight: pane.scrollHeight, paneClientHeight: pane.clientHeight,
        paneOverflowY: paneCs.overflowY,
        cards: cards, cardsOverflow: cardsOverflow, overlap: overlap, offenders: offenders, scrollBlocks: scrollBlocks,
        toolRows: pane.querySelectorAll('#agentToolList li').length
      };
    })()`);
  }

  function assertLayout(info, viewportLabel, requireScrollableState) {
    assert(info.innerWidth === Number(viewportLabel.split('x')[0]), `${viewportLabel}: innerWidth ${info.innerWidth}`);
    assert(info.docScrollWidth <= info.innerWidth + 1, `${viewportLabel}: document scrollWidth ${info.docScrollWidth} > ${info.innerWidth}`);
    assert(info.bodyScrollWidth <= info.innerWidth + 1, `${viewportLabel}: body scrollWidth ${info.bodyScrollWidth} > ${info.innerWidth}`);
    assert(info.cards.length === 3, `${viewportLabel}: ${info.cards.length} agent cards`);
    // The pane's own bottom edge must be inside the viewport (not cut off).
    assert(info.pane.bottom <= info.innerHeight + 1,
      `${viewportLabel}: Agent pane bottom ${Math.round(info.pane.bottom)} is below the viewport ${info.innerHeight}`);
    assert(info.pane.top >= -1, `${viewportLabel}: Agent pane top ${Math.round(info.pane.top)} is above the viewport`);
    // The pane itself must not need a scrollbar (overflow:hidden would clip it).
    assert(info.paneScrollHeight <= info.paneClientHeight + 2,
      `${viewportLabel}: Agent pane content ${info.paneScrollHeight} > pane ${info.paneClientHeight} (pane has overflowY=${info.paneOverflowY})`);
    for (const card of info.cards) {
      assert(card.right <= info.pane.right + 1 && card.left >= info.pane.left - 1,
        `${viewportLabel}: card [${Math.round(card.left)}..${Math.round(card.right)}] escapes pane [${Math.round(info.pane.left)}..${Math.round(info.pane.right)}]`);
      assert(card.bottom <= info.pane.bottom + 1 && card.top >= info.pane.top - 1,
        `${viewportLabel}: card [${Math.round(card.top)}..${Math.round(card.bottom)}] escapes pane vertically`);
      assert(card.w > 120 && card.h > 80, `${viewportLabel}: card squeezed to ${Math.round(card.w)}x${Math.round(card.h)}`);
    }
    assert(info.overlap === false, `${viewportLabel}: agent cards overlap`);
    assert(info.offenders.length === 0, `${viewportLabel}: elements overflow the viewport: ${info.offenders.join(', ')}`);
    // Internal scroll affordance: any content taller than its block must be scrollable
    // (overflow:auto/scroll) so nothing is silently clipped.
    for (const block of info.scrollBlocks) {
      if (block.sh > block.ch) {
        assert(block.oy === 'auto' || block.oy === 'scroll',
          `${viewportLabel}: clipped block ${block.id} (${block.sh} > ${block.ch}) is not scrollable (overflowY=${block.oy})`);
      }
    }
    if (requireScrollableState) {
      assert(info.scrollBlocks.some((b) => b.sh > b.ch && (b.oy === 'auto' || b.oy === 'scroll')),
        `${viewportLabel}: expected at least one internally scrollable Agent block (live state JSON / tool list)`);
      assert(info.toolRows === 9, `${viewportLabel}: tool catalogue rows ${info.toolRows}`);
    }
  }

  await check('H2 layout 1600x1000: no overflow, Agent cards inside pane, no overlap', async () => {
    await setViewport(1600, 1000);
    await navigate('?tab=agent&static=1', 900);
    const info = await layoutSnapshot();
    assertLayout(info, '1600x1000', true);
    return `3 cards, doc ${info.docScrollWidth}px <= ${info.innerWidth}px, pane bottom ${Math.round(info.pane.bottom)}px <= ${info.innerHeight}px`;
  });

  await check('H3 layout 1280x800: no overflow, Agent cards inside pane, no overlap', async () => {
    await setViewport(1280, 800);
    await sleep(300);
    const info = await layoutSnapshot();
    assertLayout(info, '1280x800', false);
    await clearViewport();
    return `3 cards, doc ${info.docScrollWidth}px <= ${info.innerWidth}px, pane bottom ${Math.round(info.pane.bottom)}px <= ${info.innerHeight}px`;
  });

  await check('H4 screenshot renders (>50 KB) on the default static view', async () => {
    await navigate('?static=1', 800);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const bytes = Buffer.from(shot.data, 'base64').length;
    assert(bytes > 50 * 1024, `screenshot only ${bytes} B`);
    return `${bytes} B PNG`;
  });

  await check('H5 no console errors on a fresh Agent-tab load', async () => {
    await navigate('?tab=agent&static=1', 900);
    await assertCleanConsole('fresh agent tab');
    return '0 console errors';
  });

  // ---- capture (optional) ------------------------------------------------
  const CAPTURES = [
    { file: '01-default-scopes.png', path: '?static=1', width: 1600, height: 1000, desc: 'default preset 12 / scopes tab' },
    { file: '02-harmonics.png', path: '?preset=12&tab=harmonics&static=1', width: 1600, height: 1000, desc: 'preset 12 / harmonics tab' },
    { file: '03-bits.png', path: '?tab=bits&static=1', width: 1600, height: 1000, desc: 'Float32 Bit Lab tab' },
    { file: '04-agent-tab.png', path: '?tab=agent&static=1', width: 1600, height: 1400, desc: 'Agent tab (tall full-dock view)' }
  ];
  const captured = [];
  if (opts.capture) {
    const dir = join(ROOT, 'docs', 'agent');
    mkdirSync(dir, { recursive: true });
    for (const cap of CAPTURES) {
      await check(`capture docs/agent/${cap.file}`, async () => {
        await setViewport(cap.width, cap.height);
        await navigate(cap.path, 1000);
        const shot = await send('Page.captureScreenshot', { format: 'png' });
        const bytes = Buffer.from(shot.data, 'base64');
        assert(bytes.length > 50 * 1024, `PNG only ${bytes.length} B`);
        writeFileSync(join(dir, cap.file), bytes);
        captured.push({ file: join(dir, cap.file), bytes: bytes.length, desc: cap.desc });
        return `${bytes.length} B (${cap.width}x${cap.height}) — ${cap.desc}`;
      });
    }
    await clearViewport();
  }

  // ---- report ------------------------------------------------------------
  const failures = results.filter((r) => !r.ok);
  const width = Math.max(48, ...results.map((r) => r.name.length));
  console.log(`\n${'CHECK'.padEnd(width)}  RESULT`);
  console.log('-'.repeat(width + 8));
  for (const r of results) {
    console.log(`${r.name.padEnd(width)}  ${r.ok ? 'PASS' : 'FAIL'}${r.ok ? '' : `  -- ${r.detail}`}`);
  }
  console.log('-'.repeat(width + 8));
  console.log(`${results.length - failures.length}/${results.length} checks passed, ${failures.length} failed`);
  if (captured.length) {
    console.log('\nScreenshots written:');
    for (const c of captured) console.log(`  ${c.file}  (${c.bytes} B)`);
  }
  if (failures.length) {
    console.log('\nFAILED:');
    for (const f of failures) console.log(`  - ${f.name}: ${f.detail}`);
  }
  return failures.length === 0 ? 0 : 1;
}

main()
  .then(async (code) => { await cleanupAsync(); process.exitCode = code; })
  .catch(async (err) => {
    await cleanupAsync();
    console.error('VERIFY FAILED:', err && err.stack ? err.stack : err);
    process.exitCode = 1;
  });
