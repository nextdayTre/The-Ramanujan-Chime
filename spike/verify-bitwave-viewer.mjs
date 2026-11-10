#!/usr/bin/env node
/* ===== spike/verify-bitwave-viewer.mjs — independent CDP verification for the BitWave import viewer =====

   Zero-dependency Node ESM (Node 24, global WebSocket) headless-Chrome checklist for
   `spike/bitwave-viewer.html`, whose parsing comes from `js/bitwave-import.js`.

     node spike/verify-bitwave-viewer.mjs
     node spike/verify-bitwave-viewer.mjs --capture
     node spike/verify-bitwave-viewer.mjs --chrome "C:\\path\\to\\chrome.exe"

   Independence rule: every expected value is derived in Node from the shared import
   module (`require('../js/bitwave-import.js')`) and `spike/fixtures/*.json` — never from
   the page under test. The viewer's own output is only ever compared against those
   Node-side expectations.

   Checklist (frozen page contract, task-2/task-3):
     1. canonical default from file:// — ready marker, demo origin, hidden state JSON
        deep-equals getState(), state.import deep-equals the Node import of the embedded
        canonical fixture (lane 1 A/B/Z1 hex, popcount, truthCounts, focus), provenance
        prefix, inspector data-hex, canvas mounted, zero console errors;
     2. canonical fixture as a `#bw=` fragment link — ok/fragment origin, source 'link',
        frames deep-equal the Node link import;
     3. 256-bit glv fixture link — width 256, all lane frames deep-equal Node, inspector hex;
     4. `schema: 4` link refused — status error, E_BITWAVE_SCHEMA, message says schema 4 is
        not supported, viewer still ready;
     5. invalid share payloads (`#bw=A`, `#bw=!!!`) refused with E_BITWAVE_SHARE, no crash;
     6. API path — importInput(demoDoc) -> importInput('not a bitwave') -> loadCanonical()
        recovery, hidden state consistent at each step;
     7. served mode — the harness starts its own Node static server on 127.0.0.1:0 rooted
        at the repository, loads the viewer and the canonical `#bw=` link over HTTP, then
        closes the server;
     8. reload determinism — the same canonical file:// URL navigated twice produces
        byte-identical hidden state JSON;
     9. --capture writes spike/shots/16-bitwave-viewer-canonical.png,
        17-bitwave-viewer-256.png and 18-bitwave-viewer-schema-refused.png (1600x1000,
        each > 50 KB) and prints the paths;
    10. zero accumulated console errors / uncaught exceptions across all cases.

   Exit codes: 0 iff every check passes, 1 on any failure, 2 on a setup error (missing
   artifacts, missing Chrome, missing CDP, or the page never mounting). A fresh Chrome
   profile and a free debugging port are used; the Chrome process tree and the temp
   profile are removed on exit/SIGINT, as is the temporary server.

   Modelling note: launch/connect/evaluate plumbing follows `agent/verify-browser.mjs`
   (unique --user-data-dir, --headless=new, --remote-debugging-port, Page.enable /
   Runtime.enable, console-error collectors injected via
   Page.addScriptToEvaluateOnNewDocument BEFORE navigation, Windows taskkill /T /F). */

import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, sep, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const VIEWER_PATH = join(HERE, 'bitwave-viewer.html');
const VIEWER_URL = pathToFileURL(VIEWER_PATH).href;
const FIXTURE_DIR = join(HERE, 'fixtures');
const SHOT_DIR = join(HERE, 'shots');
const IMPORT_CORE_PATH = join(ROOT, 'js', 'bitwave-import.js');

const DEFAULT_CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const IS_WIN = process.platform === 'win32';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const opts = {
    chrome: process.env.CHROME_PATH || DEFAULT_CHROME,
    port: Number(process.env.CDP_PORT || 9347),
    capture: false,
    help: false
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const eq = a.indexOf('=');
    const name = eq >= 0 ? a.slice(0, eq) : a;
    const inline = eq >= 0 ? a.slice(eq + 1) : undefined;
    const value = () => (inline !== undefined ? inline : argv[++i]);
    if (name === '--chrome') opts.chrome = value();
    else if (name === '--port') opts.port = Number(value());
    else if (name === '--capture') opts.capture = true;
    else if (name === '--help' || name === '-h') opts.help = true;
    else { console.error(`unknown argument: ${a}`); opts.help = true; }
  }
  return opts;
}

const HELP = `usage: node spike/verify-bitwave-viewer.mjs [--chrome <path>] [--port 9347] [--capture]

Independent headless-Chrome CDP checklist for spike/bitwave-viewer.html. Every expected
value is derived in Node from js/bitwave-import.js and spike/fixtures/*.json. --capture
also writes spike/shots/16-18 reference screenshots. Exit 0 iff every check passes,
1 on failure, 2 on a setup error.`;

// ---------------------------------------------------------------------------
// Result recording
// ---------------------------------------------------------------------------
const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail: detail || '' });
  const shown = ok || !detail ? '' : `  -- ${String(detail).split('\n')[0].slice(0, 500)}`;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${shown}`);
}
async function check(name, fn) {
  try {
    const detail = await fn();
    record(name, true, detail);
  } catch (err) {
    record(name, false, String(err && err.message ? err.message : err));
  }
}
function note(text) { console.log(`SKIP  ${text}`); }
function assert(cond, message) {
  if (!cond) throw new Error(message || 'assertion failed');
}
function brief(value) {
  let s;
  try { s = JSON.stringify(value); } catch (e) { s = String(value); }
  if (s === undefined) s = String(value);
  return s.length > 180 ? `${s.slice(0, 177)}...` : s;
}
function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}
function firstDiff(actual, expected, path) {
  const at = path || '$';
  if (actual === expected) return null;
  const ta = typeOf(actual);
  const te = typeOf(expected);
  if (ta !== te) return `${at}: ${ta} ${brief(actual)} !== ${te} ${brief(expected)}`;
  if (ta === 'array') {
    if (actual.length !== expected.length) return `${at}.length: ${actual.length} !== ${expected.length}`;
    for (let i = 0; i < actual.length; i += 1) {
      const d = firstDiff(actual[i], expected[i], `${at}[${i}]`);
      if (d) return d;
    }
    return null;
  }
  if (ta === 'object') {
    const ak = Object.keys(actual).sort();
    const ek = Object.keys(expected).sort();
    if (JSON.stringify(ak) !== JSON.stringify(ek)) return `${at} keys: [${ak.join(',')}] !== [${ek.join(',')}]`;
    for (const k of ek) {
      const d = firstDiff(actual[k], expected[k], `${at}.${k}`);
      if (d) return d;
    }
    return null;
  }
  return `${at}: ${brief(actual)} !== ${brief(expected)}`;
}
function assertDeepEqual(actual, expected, label) {
  const d = firstDiff(actual, expected, '$');
  assert(d === null, `${label}: ${d}`);
}

// ---------------------------------------------------------------------------
// Fixtures + Node-side expectations (the only source of truth)
// ---------------------------------------------------------------------------
function readFixture(name) {
  const p = join(FIXTURE_DIR, name);
  assert(existsSync(p), `fixture missing: ${p}`);
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch (err) {
    throw new Error(`fixture ${name} is not valid JSON: ${String(err && err.message ? err.message : err)}`);
  }
}

function loadImportCore() {
  assert(existsSync(IMPORT_CORE_PATH), `js/bitwave-import.js is missing (${IMPORT_CORE_PATH})`);
  let mod;
  try {
    mod = require('../js/bitwave-import.js');
  } catch (err) {
    throw new Error(`require('../js/bitwave-import.js') failed: ${String(err && err.message ? err.message : err)}`);
  }
  const api = mod && typeof mod.bitwaveImport === 'function'
    ? mod
    : mod && mod.BitWaveImport && typeof mod.BitWaveImport.bitwaveImport === 'function'
      ? mod.BitWaveImport
      : mod && mod.default && typeof mod.default.bitwaveImport === 'function'
        ? mod.default
        : null;
  assert(api, 'js/bitwave-import.js does not export bitwaveImport()');
  return api;
}

function buildExpectations(BW) {
  const canonicalDoc = readFixture('canonical-vectors.bitwave.json');
  const demoDoc = readFixture('demo.bitwave.json');
  const glvDoc = readFixture('glv-3phase-orbit.bitwave.json');
  const share = (doc) => Buffer.from(JSON.stringify(doc), 'utf8').toString('base64url');

  const canonicalLink = `${VIEWER_URL}#bw=${share(canonicalDoc)}`;
  const glvLink = `${VIEWER_URL}#bw=${share(glvDoc)}`;
  const schema4Doc = Object.assign({}, canonicalDoc, { schema: 4 });
  const schema4Link = `${VIEWER_URL}#bw=${share(schema4Doc)}`;
  const badShareAUrl = `${VIEWER_URL}#bw=A`;
  const badShareBangUrl = `${VIEWER_URL}#bw=!!!`;

  const canonical = BW.bitwaveImport(canonicalDoc, { name: 'canonical-vectors.bitwave.json' });
  assert(canonical && canonical.ok === true,
    `Node import of the canonical fixture failed: ${brief(canonical && canonical.error)}`);
  const demo = BW.bitwaveImport(demoDoc, { name: 'demo.bitwave.json' });
  assert(demo && demo.ok === true, `Node import of demo.bitwave.json failed: ${brief(demo && demo.error)}`);
  const canonicalFromLink = BW.bitwaveImport(canonicalLink);
  assert(canonicalFromLink && canonicalFromLink.ok === true,
    `Node import of the canonical fragment link failed: ${brief(canonicalFromLink && canonicalFromLink.error)}`);
  const glv = BW.bitwaveImport(glvLink);
  assert(glv && glv.ok === true, `Node import of the glv fragment link failed: ${brief(glv && glv.error)}`);
  assert(glv.width === 256, `Node glv import width ${glv.width} (expected 256)`);
  const schema4 = BW.bitwaveImport(schema4Link);
  assert(schema4 && schema4.ok === false && schema4.error && schema4.error.code === 'E_BITWAVE_SCHEMA',
    `Node import of the schema-4 link did not refuse with E_BITWAVE_SCHEMA: ${brief(schema4)}`);
  const badShareA = BW.bitwaveImport(badShareAUrl);
  const badShareBang = BW.bitwaveImport(badShareBangUrl);
  for (const [label, res] of [['#bw=A', badShareA], ['#bw=!!!', badShareBang]]) {
    assert(res && res.ok === false && res.error && res.error.code === 'E_BITWAVE_SHARE',
      `Node import of ${label} did not refuse with E_BITWAVE_SHARE: ${brief(res)}`);
  }

  // Sanity-check the Node-derived canonical expectations against the documented vectors
  // (still Node-side: this guards the fixture, not the page under test).
  assert(canonical.schemaVersion === 3, `canonical schemaVersion ${canonical.schemaVersion}`);
  assert(canonical.width === 64, `canonical width ${canonical.width}`);
  const lane1 = canonical.lanes && canonical.lanes[0];
  assert(lane1 && String(lane1.id) === '1', `canonical lanes[0].id is not 1 (got ${lane1 && lane1.id})`);
  assert(lane1.frames.a.hex === '8ADEFEDA85210125', `canonical lane1 A ${lane1.frames.a.hex}`);
  assert(lane1.frames.b.hex === 'FFFFFFFF00000000', `canonical lane1 B ${lane1.frames.b.hex}`);
  assert(lane1.frames.z.hex === '7521012585210125', `canonical lane1 Z1 ${lane1.frames.z.hex}`);
  assert(lane1.frames.z.popcount === 20, `canonical lane1 Z1 popcount ${lane1.frames.z.popcount}`);
  assert(JSON.stringify(lane1.truthCounts) === JSON.stringify([23, 11, 9, 21]),
    `canonical lane1 truthCounts ${JSON.stringify(lane1.truthCounts)}`);
  assert(canonical.focus && canonical.focus.label === 'Z1', `canonical focus.label ${canonical.focus && canonical.focus.label}`);
  assert(JSON.stringify(canonical.lanes.map((l) => l.labels)) ===
    JSON.stringify([{ a: 'A', b: 'B', z: 'Z1' }, { a: 'C', b: 'D', z: 'Z2' }, { a: 'E', b: 'F', z: 'Z3' }]),
    'canonical global frame labels differ from the contract');

  return {
    canonicalDoc, demoDoc, glvDoc,
    canonicalLink, glvLink, schema4Link, badShareAUrl, badShareBangUrl,
    canonical, canonicalFromLink, glv, schema4, demo, badShareA, badShareBang
  };
}

function framesSubset(imp) {
  if (!imp || typeof imp !== 'object') return imp;
  return {
    importSchemaVersion: imp.importSchemaVersion,
    schemaVersion: imp.schemaVersion,
    width: imp.width,
    lanes: imp.lanes,
    focus: imp.focus,
    view: imp.view,
    routes: imp.routes,
    warnings: imp.warnings
  };
}

// ---------------------------------------------------------------------------
// Chrome + CDP plumbing (mirrors agent/verify-browser.mjs)
// ---------------------------------------------------------------------------
let chromeProc = null;
let profileDir = null;
let ws = null;
let nextId = 0;
const pending = new Map();
const errorLog = [];

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
  closeStaticServerSync();
  if (profileDir) {
    try { rmSync(profileDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }); } catch (e) { /* best effort */ }
    profileDir = null;
  }
}

async function cleanupAsync() {
  try { if (ws) ws.close(); } catch (e) { /* ignore */ }
  killChromeTree();
  await closeStaticServer();
  await sleep(500);
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

let opts = null;

async function launchChrome() {
  assert(existsSync(opts.chrome), `Chrome executable not found: ${opts.chrome}`);
  let port = opts.port;
  for (let i = 0; i < 12 && (await portInUse(port)); i += 1) port += 1;
  opts.port = port;
  profileDir = mkdtempSync(join(tmpdir(), 'rs-verify-bitwave-'));
  const args = [
    '--headless=new', '--disable-gpu', '--enable-unsafe-swiftshader',
    '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--disable-background-networking', '--mute-audio', '--hide-scrollbars',
    '--force-device-scale-factor=1', '--remote-allow-origins=*',
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
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = () => rej(new Error('CDP websocket failed to open'));
  });
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

  // Inject per-document collectors BEFORE any navigation: viewer events + console errors.
  const source = [
    'window.__bwEvents = { ready: 0, change: 0 };',
    "window.addEventListener('bitwave-viewer:ready', function () { window.__bwEvents.ready += 1; });",
    "window.addEventListener('bitwave-viewer:change', function () { window.__bwEvents.change += 1; });",
    'window.__bwErrors = [];',
    '(function () {',
    '  var orig = console.error.bind(console);',
    '  console.error = function () {',
    '    try {',
    '      var parts = Array.prototype.map.call(arguments, function (x) {',
    "        try { return typeof x === 'string' ? x : JSON.stringify(x); } catch (e) { return String(x); }",
    '      });',
    "      window.__bwErrors.push(parts.join(' '));",
    '    } catch (e) { /* ignore */ }',
    '    return orig.apply(console, arguments);',
    '  };',
    '})();',
    "window.addEventListener('error', function (e) { window.__bwErrors.push('uncaught: ' + (e && e.message)); });",
    "window.addEventListener('unhandledrejection', function (e) { window.__bwErrors.push('unhandledrejection: ' + (e && e.reason && (e.reason.message || e.reason))); });"
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
  const text = await evaluate(`(async function () { return JSON.stringify(await (${expression})); })()`);
  assert(typeof text === 'string', 'evaluation did not return JSON');
  return JSON.parse(text);
}

async function waitReady(timeoutMs) {
  const deadline = Date.now() + (timeoutMs || 20000);
  while (Date.now() < deadline) {
    try {
      const ready = await evaluate('!!(document.readyState === "complete" && document.body && document.body.getAttribute("data-bitwave-viewer-ready") === "true" && window.bitwaveViewer && window.bitwaveViewer.ready === true)');
      if (ready) return;
    } catch (e) { /* execution context destroyed during navigation */ }
    await sleep(120);
  }
  throw new Error('viewer page never became ready (body[data-bitwave-viewer-ready="true"] / window.bitwaveViewer.ready)');
}

// Always bounce through about:blank before a target URL: the target may differ from the
// current document only by its #fragment, and a same-document fragment navigation would
// not re-run the viewer's import. This forces a real document load for every case.
async function goTo(url, settleMs) {
  await send('Page.navigate', { url: 'about:blank' });
  await sleep(80);
  const reply = await send('Page.navigate', { url });
  if (reply && reply.errorText) throw new Error(`navigation to ${url} failed: ${reply.errorText}`);
  await waitReady();
  await sleep(settleMs === undefined ? 600 : settleMs);
  return url;
}

async function setViewport(width, height) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await sleep(200);
}

async function capturePng() {
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  return Buffer.from(shot.data, 'base64');
}

// ---------------------------------------------------------------------------
// Console-error accounting
// ---------------------------------------------------------------------------
async function drainErrors(label) {
  let errs;
  try {
    errs = await j('window.__bwErrors || []');
  } catch (e) {
    return [];
  }
  if (!Array.isArray(errs)) errs = [];
  for (const e of errs) errorLog.push(`${label}: ${e}`);
  if (errs.length) {
    try { await evaluate('window.__bwErrors = []'); } catch (e) { /* ignore */ }
  }
  return errs;
}

async function assertNoErrors(label) {
  const errs = await drainErrors(label);
  assert(errs.length === 0,
    `${label}: ${errs.length} console error(s)/uncaught: ${errs.slice(0, 3).join(' | ')}`);
  return '0 console errors';
}

// ---------------------------------------------------------------------------
// Page snapshot + view assertions
// ---------------------------------------------------------------------------
const PAGE_SNAPSHOT = `(() => {
  const el = document.querySelector('#bitwave-viewer-state');
  const body = document.body;
  const api = window.bitwaveViewer || null;
  let state = null;
  try { state = api && typeof api.getState === 'function' ? api.getState() : null; }
  catch (e) { state = { __getStateThrew: String(e && e.message) }; }
  const provEl = document.querySelector('#provenance');
  const statusEl = document.querySelector('#status');
  const canvasEl = document.querySelector('canvas');
  function missingMethods() {
    if (!api) return 'no window.bitwaveViewer';
    return ['getState', 'importInput', 'loadCanonical', 'clear', 'setScan'].filter(function (k) {
      return typeof api[k] !== 'function';
    });
  }
  return {
    readyAttr: body ? body.getAttribute('data-bitwave-viewer-ready') : null,
    statusAttr: body ? body.getAttribute('data-bitwave-status') : null,
    apiReady: !!(api && api.ready === true),
    apiSchema: api ? api.schemaVersion : null,
    apiMissingMethods: missingMethods(),
    state: state,
    domText: el ? el.textContent : null,
    domSchemaAttr: el ? el.getAttribute('data-schema-version') : null,
    domHidden: el ? el.hidden : null,
    provenance: provEl ? provEl.textContent : '',
    statusText: statusEl ? statusEl.textContent : '',
    canvas: canvasEl ? { width: canvasEl.width, height: canvasEl.height } : null,
    laneSections: Array.prototype.map.call(document.querySelectorAll('#inspector [data-bitwave-lane]'), function (s) {
      return s.getAttribute('data-bitwave-lane');
    }),
    inspector: Array.prototype.map.call(document.querySelectorAll('#inspector [data-bitwave-frame]'), function (row) {
      const laneEl = row.closest ? row.closest('[data-bitwave-lane]') : null;
      return {
        lane: laneEl ? laneEl.getAttribute('data-bitwave-lane') : null,
        frame: row.getAttribute('data-bitwave-frame'),
        hex: row.getAttribute('data-hex')
      };
    }),
    events: window.__bwEvents || null
  };
})()`;

async function snapshot() {
  return j(PAGE_SNAPSHOT);
}

function assertReady(snap, label) {
  assert(snap.readyAttr === 'true', `${label}: body[data-bitwave-viewer-ready] = ${snap.readyAttr}`);
  assert(snap.apiReady === true, `${label}: window.bitwaveViewer.ready is not true`);
  assert(snap.apiSchema === 1, `${label}: window.bitwaveViewer.schemaVersion = ${snap.apiSchema}`);
  assert(Array.isArray(snap.apiMissingMethods) && snap.apiMissingMethods.length === 0,
    `${label}: window.bitwaveViewer is missing method(s): ${snap.apiMissingMethods}`);
  assert(snap.state && typeof snap.state === 'object', `${label}: window.bitwaveViewer.getState() returned nothing`);
  assert(snap.state.ready === true && snap.state.schemaVersion === 1,
    `${label}: viewerState.ready/schemaVersion = ${snap.state.ready}/${snap.state.schemaVersion}`);
}

function assertHiddenMatchesGetState(snap, label) {
  assert(typeof snap.domText === 'string' && snap.domText.length > 0,
    `${label}: hidden <pre id="bitwave-viewer-state"> is missing or empty`);
  assert(snap.domSchemaAttr === '1', `${label}: hidden data-schema-version = ${snap.domSchemaAttr}`);
  assert(snap.domHidden === true, `${label}: #bitwave-viewer-state is not hidden`);
  let dom;
  try {
    dom = JSON.parse(snap.domText);
  } catch (err) {
    throw new Error(`${label}: hidden state is not valid JSON: ${String(err && err.message ? err.message : err)}`);
  }
  assertDeepEqual(dom, snap.state, `${label}: hidden JSON vs getState()`);
  return `${snap.domText.length} B deep-equal`;
}

function findInspectorRow(rows, labelName, key) {
  const wantLabel = String(labelName).toUpperCase();
  const wantKey = String(key).toUpperCase();
  const suffixOf = (attr) => {
    const s = String(attr || '');
    const i = s.lastIndexOf('.');
    return (i >= 0 ? s.slice(i + 1) : s).toUpperCase();
  };
  const normZ = (s) => s.replace(/\d+$/, '');
  const tests = [
    (suffix) => suffix === wantLabel,
    (suffix) => suffix === wantKey,
    (suffix) => /^Z\d*$/.test(suffix) && /^Z\d*$/.test(wantLabel) && normZ(suffix) === normZ(wantLabel)
  ];
  for (const test of tests) {
    const hit = rows.find((r) => test(suffixOf(r.frame)));
    if (hit) return hit;
  }
  return null;
}

function assertInspectorMatches(imp, snap, label) {
  assert(Array.isArray(snap.laneSections) && snap.laneSections.length === 3,
    `${label}: ${Array.isArray(snap.laneSections) ? snap.laneSections.length : 0} [data-bitwave-lane] section(s), expected 3`);
  assert(Array.isArray(snap.inspector) && snap.inspector.length >= 9,
    `${label}: ${Array.isArray(snap.inspector) ? snap.inspector.length : 0} [data-bitwave-frame] row(s), expected 9`);
  for (const lane of imp.lanes) {
    const laneId = String(lane.id); // import result ids may be numeric; DOM hooks are strings
    assert(snap.laneSections.indexOf(laneId) >= 0,
      `${label}: no <section data-bitwave-lane="${laneId}"> in #inspector`);
    const rows = snap.inspector.filter((r) => r && String(r.lane) === laneId);
    assert(rows.length >= 3, `${label}: lane ${laneId} has ${rows.length} inspector row(s), expected 3`);
    for (const key of ['a', 'b', 'z']) {
      const expectedHex = lane.frames[key].hex.toUpperCase();
      const expectedLabel = lane.labels[key];
      const row = findInspectorRow(rows, expectedLabel, key);
      assert(row, `${label}: lane ${laneId} has no [data-bitwave-frame] row for ${expectedLabel} (rows: ${rows.map((r) => r.frame).join(', ')})`);
      assert(String(row.hex || '').toUpperCase() === expectedHex,
        `${label}: lane ${laneId} ${expectedLabel} data-hex "${row.hex}" !== Node "${expectedHex}"`);
    }
  }
}

function assertProvenance(snap, imp, label, extraTokens) {
  const prefix = `BitWave import · schema ${imp.schemaVersion} · ${imp.width}-bit · read-only`;
  assert(String(snap.provenance).startsWith(prefix),
    `${label}: #provenance "${String(snap.provenance).slice(0, 120)}" does not start with "${prefix}"`);
  const name = imp.provenance && imp.provenance.name;
  if (name) assert(String(snap.provenance).indexOf(name) >= 0, `${label}: #provenance lacks the source name "${name}"`);
  for (const token of extraTokens || []) {
    assert(String(snap.provenance).indexOf(token) >= 0, `${label}: #provenance lacks "${token}"`);
  }
}

// ---------------------------------------------------------------------------
// Temporary static server (served-mode check)
// ---------------------------------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8'
};

let staticServer = null;

function startStaticServer() {
  return new Promise((resolvePromise, rejectPromise) => {
    const server = createServer((req, res) => {
      try {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8' });
          res.end('method not allowed');
          return;
        }
        const decoded = decodeURIComponent(String(req.url || '/').split('?')[0].split('#')[0]);
        let rel = decoded.replace(/^\/+/, '');
        if (!rel) rel = 'spike/bitwave-viewer.html';
        const filePath = resolve(ROOT, rel);
        if (filePath !== ROOT && !filePath.startsWith(ROOT + sep)) {
          res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
          res.end('forbidden');
          return;
        }
        let st;
        try { st = statSync(filePath); } catch (e) {
          res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
          res.end('not found');
          return;
        }
        const target = st.isDirectory() ? join(filePath, 'index.html') : filePath;
        const body = readFileSync(target);
        res.writeHead(200, {
          'content-type': MIME[extname(target).toLowerCase()] || 'application/octet-stream',
          'content-length': body.length,
          'cache-control': 'no-store'
        });
        if (req.method === 'HEAD') res.end();
        else res.end(body);
      } catch (e) {
        try {
          res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
          res.end('server error');
        } catch (e2) { /* ignore */ }
      }
    });
    server.on('error', rejectPromise);
    server.listen(0, '127.0.0.1', () => resolvePromise({ server, port: server.address().port }));
  });
}

function closeStaticServer() {
  const server = staticServer;
  staticServer = null;
  if (!server) return Promise.resolve();
  return new Promise((resolvePromise) => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolvePromise(); } };
    try { server.close(finish); } catch (e) { finish(); }
    setTimeout(finish, 1500);
  });
}

function closeStaticServerSync() {
  if (staticServer) {
    try { staticServer.close(); } catch (e) { /* ignore */ }
    staticServer = null;
  }
}

// ---------------------------------------------------------------------------
// Main checklist
// ---------------------------------------------------------------------------
async function main() {
  opts = parseArgs(process.argv.slice(2));
  if (opts.help) { console.log(HELP); return 0; }

  console.log('BitWave viewer independent verification (CDP)');
  console.log(`  viewer:  ${VIEWER_PATH}`);
  console.log(`  import:  ${IMPORT_CORE_PATH}`);
  console.log(`  chrome:  ${opts.chrome}`);
  console.log(`  node:    ${process.version}`);
  console.log(`  capture: ${opts.capture}\n`);

  // ---- setup -------------------------------------------------------------
  if (!existsSync(VIEWER_PATH)) {
    console.error(`SETUP ERROR: ${VIEWER_PATH} is missing — the viewer artifact has not landed yet.`);
    return 2;
  }
  if (!existsSync(IMPORT_CORE_PATH)) {
    console.error(`SETUP ERROR: ${IMPORT_CORE_PATH} is missing — the import core has not landed yet.`);
    return 2;
  }
  if (!existsSync(opts.chrome)) {
    console.error(`SETUP ERROR: Chrome executable not found at ${opts.chrome} (pass --chrome <path>).`);
    return 2;
  }

  let BW;
  let E;
  try {
    BW = loadImportCore();
    E = buildExpectations(BW);
  } catch (err) {
    console.error(`SETUP ERROR: ${String(err && err.message ? err.message : err)}`);
    return 2;
  }
  console.log(`  fixtures: canonical schema ${E.canonical.schemaVersion}/${E.canonical.width}-bit, ` +
    `glv ${E.glv.width}-bit, demo schema ${E.demo.schemaVersion}; expectations from Node import core\n`);

  try {
    await connect();
    await setViewport(1600, 1000);
    await goTo(VIEWER_URL, 900);
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    console.error(`SETUP ERROR: headless Chrome / initial viewer load failed: ${msg}`);
    return 2;
  }

  // ---- 1. canonical default (file://, embedded fixture) ------------------
  await check('1 canonical default file:// imports the embedded canonical fixture', async () => {
    const snap = await snapshot();
    assertReady(snap, 'canonical');
    const hidden = assertHiddenMatchesGetState(snap, 'canonical');
    assert(snap.events && snap.events.ready === 1, `canonical: bitwave-viewer:ready event count ${snap.events && snap.events.ready}`);
    assert(snap.state.status === 'ok', `canonical: state.status = ${snap.state.status}`);
    assert(snap.state.origin === 'demo', `canonical: state.origin = ${snap.state.origin}`);
    assert(snap.state.scan === false, `canonical: default scan = ${snap.state.scan} (contract: default OFF)`);
    assert(snap.state.import && snap.state.import.ok === true, 'canonical: state.import is missing / not ok');
    assertDeepEqual(snap.state.import, E.canonical, 'canonical: state.import vs Node import of the fixture');

    const lane1 = snap.state.import.lanes[0];
    const nodeLane1 = E.canonical.lanes[0];
    assert(String(lane1.id) === String(nodeLane1.id), `canonical: lanes[0].id ${lane1.id} !== Node ${nodeLane1.id}`);
    assert(lane1.frames.a.hex === nodeLane1.frames.a.hex, `canonical: lane1 A ${lane1.frames.a.hex} !== Node ${nodeLane1.frames.a.hex}`);
    assert(lane1.frames.b.hex === nodeLane1.frames.b.hex, `canonical: lane1 B ${lane1.frames.b.hex} !== Node ${nodeLane1.frames.b.hex}`);
    assert(lane1.frames.z.hex === nodeLane1.frames.z.hex, `canonical: lane1 Z1 ${lane1.frames.z.hex} !== Node ${nodeLane1.frames.z.hex}`);
    assert(lane1.frames.z.popcount === nodeLane1.frames.z.popcount, `canonical: lane1 Z1 popcount ${lane1.frames.z.popcount} !== Node ${nodeLane1.frames.z.popcount}`);
    assert(JSON.stringify(lane1.truthCounts) === JSON.stringify(nodeLane1.truthCounts),
      `canonical: lane1 truthCounts ${JSON.stringify(lane1.truthCounts)} !== Node ${JSON.stringify(nodeLane1.truthCounts)}`);
    assert(snap.state.import.focus.label === E.canonical.focus.label,
      `canonical: focus.label ${snap.state.import.focus.label} !== Node ${E.canonical.focus.label}`);

    assert(snap.state.render && typeof snap.state.render === 'object', 'canonical: state.render is missing');
    assert(snap.state.render.lanes === 3 && snap.state.render.frames === 9,
      `canonical: render lanes/frames = ${snap.state.render.lanes}/${snap.state.render.frames}`);
    assert(snap.state.render.width === E.canonical.width,
      `canonical: render.width ${snap.state.render.width} !== Node ${E.canonical.width}`);
    assert(snap.state.render.view === E.canonical.view,
      `canonical: render.view ${snap.state.render.view} !== Node ${E.canonical.view}`);
    assert(snap.state.render.focus && snap.state.render.focus.label === E.canonical.focus.label,
      `canonical: render.focus.label ${snap.state.render.focus && snap.state.render.focus.label}`);
    assert(String(snap.state.render.focus.lane) === String(E.canonical.focus.lane),
      `canonical: render.focus.lane ${snap.state.render.focus.lane} !== ${E.canonical.focus.lane}`);
    assert(String(snap.state.render.focus.frame) === String(E.canonical.focus.frame),
      `canonical: render.focus.frame ${snap.state.render.focus.frame} !== ${E.canonical.focus.frame}`);

    assertProvenance(snap, E.canonical, 'canonical', ['schema 3', '64-bit', 'read-only']);
    assertInspectorMatches(E.canonical, snap, 'canonical');
    assert(snap.canvas && snap.canvas.width > 0 && snap.canvas.height > 0,
      `canonical: canvas ${JSON.stringify(snap.canvas)} (expected a mounted, sized canvas)`);
    const errors = await assertNoErrors('canonical');
    return `${hidden}, import deep-equal, lane1 A/B/Z1 = ${nodeLane1.frames.a.hex}/${nodeLane1.frames.b.hex}/${nodeLane1.frames.z.hex}, ` +
      `popcount ${nodeLane1.frames.z.popcount}, focus ${E.canonical.focus.label}, canvas ${snap.canvas.width}x${snap.canvas.height}, ${errors}`;
  });

  // ---- 2. canonical fixture as a #bw= fragment link ----------------------
  await check('2 canonical #bw= fragment link imports the same Node-derived frames', async () => {
    await goTo(E.canonicalLink, 800);
    const snap = await snapshot();
    assertReady(snap, 'fragment');
    const hidden = assertHiddenMatchesGetState(snap, 'fragment');
    assert(snap.state.status === 'ok', `fragment: state.status = ${snap.state.status}`);
    assert(snap.state.origin === 'fragment', `fragment: state.origin = ${snap.state.origin}`);
    assert(snap.state.import && snap.state.import.ok === true, 'fragment: state.import is missing / not ok');
    assert(snap.state.import.provenance && snap.state.import.provenance.source === 'link',
      `fragment: provenance.source = ${snap.state.import.provenance && snap.state.import.provenance.source}`);
    if (E.canonicalFromLink.provenance.savedAt) {
      assert(snap.state.import.provenance.savedAt === E.canonicalFromLink.provenance.savedAt,
        `fragment: provenance.savedAt ${snap.state.import.provenance.savedAt}`);
    }
    assertDeepEqual(framesSubset(snap.state.import), framesSubset(E.canonicalFromLink),
      'fragment: frames vs Node import of the same #bw= link');
    assertProvenance(snap, E.canonicalFromLink, 'fragment');
    assertInspectorMatches(E.canonicalFromLink, snap, 'fragment');
    const errors = await assertNoErrors('fragment');
    return `${hidden}, origin fragment, source link, lanes deep-equal Node, ${errors}`;
  });

  // ---- 3. 256-bit glv fixture link --------------------------------------
  await check('3 256-bit glv #bw= link renders all lane frames from Node', async () => {
    await goTo(E.glvLink, 800);
    const snap = await snapshot();
    assertReady(snap, '256-bit');
    const hidden = assertHiddenMatchesGetState(snap, '256-bit');
    assert(snap.state.status === 'ok', `256-bit: state.status = ${snap.state.status}`);
    assert(snap.state.origin === 'fragment', `256-bit: state.origin = ${snap.state.origin}`);
    assert(snap.state.import && snap.state.import.width === 256, `256-bit: import.width = ${snap.state.import && snap.state.import.width}`);
    assert(snap.state.render && snap.state.render.width === 256, `256-bit: render.width = ${snap.state.render && snap.state.render.width}`);
    assertDeepEqual(framesSubset(snap.state.import), framesSubset(E.glv), '256-bit: frames vs Node import');
    assertProvenance(snap, E.glv, '256-bit', ['schema 3', '256-bit', 'read-only']);
    assertInspectorMatches(E.glv, snap, '256-bit');
    const errors = await assertNoErrors('256-bit');
    return `${hidden}, width 256, 3 lanes / 9 frames deep-equal Node, ${errors}`;
  });

  // ---- 4. schema > 3 refused --------------------------------------------
  await check('4 schema-4 link refused with E_BITWAVE_SCHEMA and the viewer stays ready', async () => {
    await goTo(E.schema4Link, 800);
    const snap = await snapshot();
    assertReady(snap, 'schema-4');
    assert(snap.state.status === 'error', `schema-4: state.status = ${snap.state.status}`);
    assert(snap.statusAttr === 'error', `schema-4: body[data-bitwave-status] = ${snap.statusAttr}`);
    assert(snap.state.error && typeof snap.state.error === 'object',
      'schema-4: viewerState.error is missing (task-3 requires state.error.code; note task-2\'s viewerState key list omits it)');
    assert(snap.state.error.code === E.schema4.error.code,
      `schema-4: state.error.code ${snap.state.error.code} !== Node ${E.schema4.error.code}`);
    assert(snap.state.error.message === E.schema4.error.message,
      `schema-4: state.error.message ${brief(snap.state.error.message)} !== Node ${brief(E.schema4.error.message)}`);
    assert(/schema\s*4/i.test(E.schema4.error.message), `schema-4: Node message does not mention schema 4: ${brief(E.schema4.error.message)}`);
    assert(/not supported/i.test(snap.state.error.message), `schema-4: page message does not say "not supported": ${brief(snap.state.error.message)}`);
    assert(String(snap.statusText).indexOf('E_BITWAVE_SCHEMA') >= 0,
      `schema-4: #status "${String(snap.statusText).slice(0, 120)}" lacks E_BITWAVE_SCHEMA`);
    assertHiddenMatchesGetState(snap, 'schema-4');
    const errors = await assertNoErrors('schema-4');
    return `status error, ${snap.state.error.code}, message mentions schema 4 / not supported, ready true, ${errors}`;
  });

  // ---- 5. invalid share payloads ----------------------------------------
  const badShares = [
    ['5a', '#bw=A', E.badShareAUrl, E.badShareA],
    ['5b', '#bw=!!!', E.badShareBangUrl, E.badShareBang]
  ];
  for (const [id, label, url, expected] of badShares) {
    await check(`${id} invalid share ${label} refused with E_BITWAVE_SHARE (no crash)`, async () => {
      await goTo(url, 700);
      const snap = await snapshot();
      assertReady(snap, label);
      assert(snap.state.status === 'error', `${label}: state.status = ${snap.state.status}`);
      assert(snap.statusAttr === 'error', `${label}: body[data-bitwave-status] = ${snap.statusAttr}`);
      assert(expected && expected.ok === false && expected.error.code === 'E_BITWAVE_SHARE',
        `${label}: Node expectation is not E_BITWAVE_SHARE`);
      assert(snap.state.error && snap.state.error.code === 'E_BITWAVE_SHARE',
        `${label}: state.error.code = ${snap.state.error && snap.state.error.code} (expected E_BITWAVE_SHARE)`);
      assert(String(snap.statusText).indexOf('E_BITWAVE_SHARE') >= 0,
        `${label}: #status "${String(snap.statusText).slice(0, 120)}" lacks E_BITWAVE_SHARE`);
      assertHiddenMatchesGetState(snap, label);
      const errors = await assertNoErrors(label);
      return `status error, E_BITWAVE_SHARE, ready true, ${errors}`;
    });
  }

  // ---- 6. API path: import demo, reject junk, recover -------------------
  await check('6 API importInput(demo) -> bad input -> loadCanonical recovery', async () => {
    await goTo(VIEWER_URL, 800);
    const info = await j(`(() => {
      const demoDoc = ${JSON.stringify(E.demoDoc)};
      const out = {};
      try { out.r1 = window.bitwaveViewer.importInput(demoDoc, { name: 'demo.bitwave.json' }); }
      catch (e) { out.threw1 = String(e && e.message); }
      out.s1 = window.bitwaveViewer.getState();
      out.dom1 = document.querySelector('#bitwave-viewer-state').textContent;
      try { out.r2 = window.bitwaveViewer.importInput('not a bitwave'); }
      catch (e) { out.threw2 = String(e && e.message); }
      out.s2 = window.bitwaveViewer.getState();
      out.dom2 = document.querySelector('#bitwave-viewer-state').textContent;
      out.body2 = document.body.getAttribute('data-bitwave-status');
      out.statusText2 = (document.querySelector('#status') || {}).textContent || '';
      try { out.r3 = window.bitwaveViewer.loadCanonical(); }
      catch (e) { out.threw3 = String(e && e.message); }
      out.s3 = window.bitwaveViewer.getState();
      out.dom3 = document.querySelector('#bitwave-viewer-state').textContent;
      out.body3 = document.body.getAttribute('data-bitwave-status');
      return out;
    })()`);
    assert(!info.threw1, `api: importInput(demoDoc) threw: ${info.threw1}`);
    assert(!info.threw2, `api: importInput('not a bitwave') threw: ${info.threw2}`);
    assert(!info.threw3, `api: loadCanonical() threw: ${info.threw3}`);
    assert(info.r1 && info.r1.ok === true, `api: importInput(demoDoc) returned ${brief(info.r1)}`);
    assertDeepEqual(info.r1, E.demo, 'api: importInput(demoDoc) return vs Node import');
    assert(info.s1.status === 'ok', `api: status after demo import = ${info.s1.status}`);
    assert(info.s1.import && info.s1.import.ok === true, 'api: state.import after demo import is missing / not ok');
    assertDeepEqual(info.s1.import, E.demo, 'api: state.import after demo import vs Node');
    assert(info.s1.import.lanes[0].frames.z.hex === E.demo.lanes[0].frames.z.hex,
      `api: lane1 Z ${info.s1.import.lanes[0].frames.z.hex} !== Node ${E.demo.lanes[0].frames.z.hex}`);
    assertDeepEqual(JSON.parse(info.dom1), info.s1, 'api: hidden JSON after demo import vs getState()');

    assert(info.r2 && info.r2.ok === false, `api: importInput('not a bitwave') returned ${brief(info.r2)}`);
    assert(info.s2.status === 'error', `api: status after bad input = ${info.s2.status}`);
    assert(info.body2 === 'error', `api: body[data-bitwave-status] after bad input = ${info.body2}`);
    assert(/E_BITWAVE_/.test(String(info.statusText2)), `api: #status after bad input "${String(info.statusText2).slice(0, 120)}" lacks an E_BITWAVE_* code`);
    assertDeepEqual(JSON.parse(info.dom2), info.s2, 'api: hidden JSON after bad input vs getState()');

    assert(info.s3.status === 'ok', `api: status after loadCanonical() = ${info.s3.status}`);
    assertDeepEqual(info.s3.import, E.canonical, 'api: state.import after loadCanonical() vs Node canonical import');
    assertDeepEqual(JSON.parse(info.dom3), info.s3, 'api: hidden JSON after loadCanonical() vs getState()');
    const errors = await assertNoErrors('api');
    return `demo import ok (lane1 Z ${E.demo.lanes[0].frames.z.hex}), junk refused, canonical recovered, hidden state consistent, ${errors}`;
  });

  // ---- 7. served mode (temporary Node static server on 127.0.0.1:0) -----
  await check('7 served mode: temp Node static server serves the viewer and canonical #bw= link', async () => {
    const started = await startStaticServer();
    staticServer = started.server;
    try {
      const base = `http://127.0.0.1:${started.port}/spike/bitwave-viewer.html`;
      await goTo(base, 800);
      const snap = await snapshot();
      assertReady(snap, 'served default');
      assertHiddenMatchesGetState(snap, 'served default');
      assert(snap.state.status === 'ok', `served default: state.status = ${snap.state.status}`);
      assert(snap.state.origin === 'demo', `served default: state.origin = ${snap.state.origin}`);
      assertDeepEqual(snap.state.import, E.canonical, 'served default: state.import vs Node canonical import');
      assertProvenance(snap, E.canonical, 'served default');

      const servedLink = `${base}#bw=${Buffer.from(JSON.stringify(E.canonicalDoc), 'utf8').toString('base64url')}`;
      await goTo(servedLink, 800);
      const snap2 = await snapshot();
      assertReady(snap2, 'served fragment');
      assert(snap2.state.status === 'ok', `served fragment: state.status = ${snap2.state.status}`);
      assert(snap2.state.origin === 'fragment', `served fragment: state.origin = ${snap2.state.origin}`);
      assert(snap2.state.import && snap2.state.import.provenance && snap2.state.import.provenance.source === 'link',
        `served fragment: provenance.source = ${snap2.state.import && snap2.state.import.provenance && snap2.state.import.provenance.source}`);
      assertDeepEqual(framesSubset(snap2.state.import), framesSubset(E.canonicalFromLink),
        'served fragment: frames vs Node import of the same link');
      assertInspectorMatches(E.canonicalFromLink, snap2, 'served fragment');
      const errors = await assertNoErrors('served');
      return `http://127.0.0.1:${started.port} served default origin demo + fragment origin fragment, frames deep-equal Node, ${errors}`;
    } finally {
      await closeStaticServer();
    }
  });

  // ---- 8. reload determinism -------------------------------------------
  await check('8 same canonical file:// URL navigated twice -> byte-identical hidden state JSON', async () => {
    await goTo(VIEWER_URL, 700);
    const a = await evaluate("document.querySelector('#bitwave-viewer-state').textContent");
    await goTo(VIEWER_URL, 700);
    const b = await evaluate("document.querySelector('#bitwave-viewer-state').textContent");
    assert(typeof a === 'string' && a.length > 100, `reload: first hidden state is empty (${typeof a})`);
    assert(a === b, `reload: hidden state JSON changed across two navigations of the same URL (${String(a).length} B vs ${String(b).length} B)`);
    const errors = await assertNoErrors('reload');
    return `${a.length} B byte-identical across two loads, ${errors}`;
  });

  // ---- 9. optional screenshots -----------------------------------------
  const captured = [];
  if (opts.capture) {
    mkdirSync(SHOT_DIR, { recursive: true });
    const CAPTURES = [
      { file: '16-bitwave-viewer-canonical.png', url: VIEWER_URL, desc: 'canonical default (file://, 1600x1000)' },
      { file: '17-bitwave-viewer-256.png', url: E.glvLink, desc: '256-bit glv #bw= link (1600x1000)' },
      { file: '18-bitwave-viewer-schema-refused.png', url: E.schema4Link, desc: 'schema 4 refused (1600x1000)' }
    ];
    for (const cap of CAPTURES) {
      await check(`9 ${cap.file}`, async () => {
        await setViewport(1600, 1000);
        await goTo(cap.url, 1000);
        const snap = await snapshot();
        assertReady(snap, cap.file);
        if (cap.file.indexOf('canonical') >= 0) assert(snap.state.status === 'ok', `capture: canonical status ${snap.state.status}`);
        if (cap.file.indexOf('256') >= 0) assert(snap.state.import && snap.state.import.width === 256, 'capture: 256-bit width missing');
        if (cap.file.indexOf('schema-refused') >= 0) assert(snap.state.status === 'error', `capture: schema refused status ${snap.state.status}`);
        const bytes = await capturePng();
        assert(bytes.length > 50 * 1024, `PNG only ${bytes.length} B (< 50 KB)`);
        const filePath = join(SHOT_DIR, cap.file);
        writeFileSync(filePath, bytes);
        await assertNoErrors(`capture ${cap.file}`);
        captured.push({ file: filePath, bytes: bytes.length });
        return `${filePath} (${bytes.length} B) — ${cap.desc}`;
      });
    }
  } else {
    note('9 --capture screenshots (pass --capture to write spike/shots/16-18)');
  }

  // ---- 10. accumulated console errors ----------------------------------
  await drainErrors('final');
  await check('10 zero console errors / uncaught exceptions across all cases', async () => {
    assert(errorLog.length === 0,
      `${errorLog.length} console error(s)/uncaught: ${errorLog.slice(0, 4).join(' | ')}`);
    return '0 across every navigation and import path (including expected error inputs)';
  });

  // ---- report -----------------------------------------------------------
  const failures = results.filter((r) => !r.ok);
  const width = Math.max(56, ...results.map((r) => r.name.length));
  console.log(`\n${'CHECK'.padEnd(width)}  RESULT`);
  console.log('-'.repeat(width + 8));
  for (const r of results) {
    console.log(`${r.name.padEnd(width)}  ${r.ok ? 'PASS' : 'FAIL'}${r.ok ? '' : `  -- ${String(r.detail).split('\n')[0].slice(0, 300)}`}`);
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
