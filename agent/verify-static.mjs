#!/usr/bin/env node
/* ===== agent/verify-static.mjs — independent SERVED-PATH verification =====

   Contract §12, part 1 of the browser-level gate. Zero dependencies.

     node agent/verify-static.mjs --base http://127.0.0.1:8080/

   This script does NOT trust the page or the generator. Every expectation is
   derived from Node by requiring the single shared source of truth
   (js/agent-core.js, which itself requires js/engine.js + js/presets.js):

   1. every documented served path returns 200 with the right content type and a
      content marker (root/HTML, AGENTS.md, llms.txt, the contract, the maps, all
      js/*.js, css/styles.css, vendor, generated artifacts);
   2. the served agent/manifest.json is BYTE-IDENTICAL to
      JSON.stringify(AgentCore.getManifest(), null, 2) + "\n";
   3. every generated example envelope parses, is a success envelope for the
      documented tool/args, and equals the registry's own callTool output;
   4. three documented `static=1` deeplinks are rendered by a fresh-profile
      headless Chrome `--dump-dom`, and the resulting DOM is checked for
      body[data-agent-ready="true"], `<pre id="ramanujan-sphere-state">`, schema
      version, preset index, tab, static transport, and a FULL deep-equal against
      the UI state projected headlessly by the shared core.

   Exit code 0 only when every check passes; 1 on any failure; 2 on a setup error
   (e.g. --base unreachable). Prints a PASS/FAIL table.

   Windows notes (see AGENTS.md §11): every Chrome launch gets its own
   --user-data-dir under %TEMP%; Node's spawnSync waits for the process (the
   Start-Process -Wait equivalent) and we kill only our own process tree before
   deleting our own temp profile. A normal Chrome session can never swallow it. */

import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const AgentCore = require('../js/agent-core.js');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const DEFAULT_BASE = 'http://127.0.0.1:8080/';
const DEFAULT_CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const IS_WIN = process.platform === 'win32';

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const opts = { base: process.env.APP_URL || DEFAULT_BASE, chrome: process.env.CHROME_PATH || DEFAULT_CHROME, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const eq = a.indexOf('=');
    const name = eq >= 0 ? a.slice(0, eq) : a;
    const inline = eq >= 0 ? a.slice(eq + 1) : undefined;
    const value = () => (inline !== undefined ? inline : argv[++i]);
    if (name === '--base') opts.base = value();
    else if (name === '--chrome') opts.chrome = value();
    else if (name === '--help' || name === '-h') opts.help = true;
    else { console.error(`unknown argument: ${a}`); opts.help = true; }
  }
  if (!opts.base.endsWith('/')) opts.base += '/';
  return opts;
}

const HELP = `usage: node agent/verify-static.mjs [--base http://127.0.0.1:8080/] [--chrome <path>]

Served-path + dump-dom verification for the ramanujan-sphere agent layer.
Requires the repository served over HTTP (python -m http.server 8080 --bind 127.0.0.1)
and a headless-capable Chrome. Exit 0 iff every check passes.`;

// ---------------------------------------------------------------------------
// Result table
// ---------------------------------------------------------------------------
const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail: detail || '' });
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`${mark}  ${name}${ok || !detail ? '' : `  -- ${detail}`}`);
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
// HTTP helpers
// ---------------------------------------------------------------------------
async function fetchText(path) {
  const url = opts.base + path.replace(/^\//, '');
  const res = await fetch(url, { redirect: 'manual' });
  const text = await res.text();
  return { url, status: res.status, contentType: res.headers.get('content-type') || '', text, bytes: Buffer.from(text, 'utf8') };
}

function assertOk(path, expectedType, marker) {
  return async () => {
    const r = await fetchText(path);
    assert(r.status === 200, `GET ${path} -> ${r.status}`);
    const types = expectedType ? (Array.isArray(expectedType) ? expectedType : [expectedType]) : [];
    if (types.length) {
      assert(types.some((t) => r.contentType.includes(t)),
        `GET ${path} content-type "${r.contentType}" is none of ${types.join(' / ')}`);
    }
    if (marker) {
      const markers = Array.isArray(marker) ? marker : [marker];
      for (const m of markers) assert(r.text.includes(m), `GET ${path} missing marker ${JSON.stringify(m)}`);
    }
    return `${r.status}, ${r.bytes.length} B${types.length ? `, ${r.contentType.split(';')[0]}` : ''}`;
  };
}

// Markdown is served as application/octet-stream by some Python builds (Windows
// mimetypes registry has no .md entry). That is a server trait, not a defect:
// accept either the correct type or octet-stream, and rely on content markers.
const MD_TYPES = ['text/markdown', 'text/plain', 'application/octet-stream'];

// ---------------------------------------------------------------------------
// Headless Chrome --dump-dom (fresh profile, wait, kill only our tree)
// ---------------------------------------------------------------------------
function dumpDom(url) {
  const profile = mkdtempSync(join(tmpdir(), 'rs-verify-static-'));
  const args = [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--user-data-dir=${profile}`, '--virtual-time-budget=6000',
    '--window-size=1600,1000', '--hide-scrollbars', '--dump-dom', url
  ];
  let res;
  try {
    res = spawnSync(opts.chrome, args, { encoding: 'utf8', maxBuffer: 96 * 1024 * 1024, timeout: 120000 });
  } finally {
    if (res && res.pid) {
      if (IS_WIN) spawnSync('taskkill', ['/PID', String(res.pid), '/T', '/F'], { stdio: 'ignore' });
      else { try { process.kill(res.pid, 'SIGTERM'); } catch (e) { /* gone */ } }
    }
    try { rmSync(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }); } catch (e) { /* best effort */ }
  }
  if (!res) throw new Error('Chrome did not run');
  if (res.error) throw new Error(`Chrome spawn failed: ${res.error.message}`);
  if (res.status !== 0) throw new Error(`Chrome exit ${res.status}: ${String(res.stderr || '').split('\n')[0]}`);
  const html = res.stdout || '';
  assert(html.length > 1000, `dump-dom returned only ${html.length} chars`);
  return html;
}

// HTML-unescape the text content of a <pre> (dump-dom serializes & as &amp;).
function unescapeHtml(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&#x0*27;|&apos;/gi, "'")
    .replace(/&amp;/g, '&');
}

function parseDump(html) {
  const body = html.match(/<body\b([^>]*)>/i);
  const ready = !!(body && /\bdata-agent-ready="true"/.test(body[1]));
  const pre = html.match(/<pre\b[^>]*id="ramanujan-sphere-state"[^>]*>([\s\S]*?)<\/pre>/i);
  assert(pre, 'hidden <pre id="ramanujan-sphere-state"> not found in DOM');
  const preAttrs = pre[0].slice(0, pre[0].indexOf('>'));
  const schemaAttr = /data-schema-version="([^"]*)"/.exec(preAttrs);
  const json = unescapeHtml(pre[1]).trim();
  assert(json.length > 0, 'hidden state element is empty');
  return { ready, schemaAttr: schemaAttr ? schemaAttr[1] : null, state: JSON.parse(json) };
}

// Expected UI state for a deeplink, derived headlessly from the shared core.
function expectedUiFor(path) {
  const url = opts.base + path.replace(/^\//, '');
  const parsed = AgentCore.parseDeeplink(url);
  assert(parsed && parsed.ok !== false, 'parseDeeplink returned no parse');
  const patch = Object.assign({ preset: parsed.presetIndex }, parsed.patch || {});
  const stateLike = AgentCore.resolveState(patch);
  return AgentCore.projectUiState(stateLike, {
    presetIndex: stateLike.presetIndex,
    base: opts.base,
    staticMode: !!stateLike.staticMode
  });
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------
const DOCUMENTED_DEEPLINKS = [
  { path: '?static=1', label: 'default scopes view', preset: 12, tab: 'scopes' },
  { path: '?tab=bits&static=1', label: 'Float32 Bit Lab tab', preset: 12, tab: 'bits' },
  { path: '?preset=5&tab=harmonics&static=1', label: 'preset 5 harmonics tab', preset: 5, tab: 'harmonics' }
];

let opts;

async function main() {
  opts = parseArgs(process.argv.slice(2));
  if (opts.help) { console.log(HELP); return 0; }

  console.log(`ramanujan-sphere static verification`);
  console.log(`  base:   ${opts.base}`);
  console.log(`  chrome: ${opts.chrome}`);
  console.log(`  node:   ${process.version}\n`);

  // Fail fast if the server is not there.
  try {
    const probe = await fetch(opts.base, { redirect: 'manual' });
    assert(probe.status === 200, `GET / -> ${probe.status}`);
  } catch (err) {
    console.error(`SETUP ERROR: cannot reach ${opts.base} — start the static server first.`);
    console.error(String(err && err.message ? err.message : err));
    return 2;
  }

  // ---- 1. Documented root + docs paths -----------------------------------
  await check('served root: /', assertOk('', 'text/html', ['<html', 'id="ramanujan-sphere-state"', 'data-agent-tab="agent"', 'js/agent-core.js', 'js/agent-bridge.js']));
  await check('served root: /index.html', assertOk('index.html', 'text/html', ['<title>', 'data-agent-panel="agent"']));
  await check('served: AGENTS.md', assertOk('AGENTS.md', MD_TYPES, ['# AGENTS.md', 'window.ramanujanSphere', 'agent/verify-static.mjs', 'docs/AGENT-INTERFACE.md']));
  await check('served: llms.txt', assertOk('llms.txt', 'text/plain', ['ramanujan-sphere', 'AGENTS.md', 'agent/manifest.json']));
  await check('served: docs/AGENT-INTERFACE.md', assertOk('docs/AGENT-INTERFACE.md', MD_TYPES, ['# Agent Interface Contract', 'E_OUT_OF_RANGE', '#ramanujan-sphere-state', 'ramanujan-sphere:change']));
  await check('served: docs/ECOSYSTEM-MAP.md', assertOk('docs/ECOSYSTEM-MAP.md', MD_TYPES, ['SchoolOfTomorrow', 'QuadCraft2']));
  await check('served: docs/ARCHITECTURE.md', assertOk('docs/ARCHITECTURE.md', MD_TYPES, ['agent-core']));
  await check('served: HARMONY_ENGINE.md', assertOk('HARMONY_ENGINE.md', MD_TYPES, ['Harmony']));
  await check('served: README.md', assertOk('README.md', MD_TYPES, ['ramanujan-sphere']));
  await check('served: package.json', assertOk('package.json', 'application/json', ['"scripts"']));

  // ---- 2. Every JS module + styles + vendor ------------------------------
  const JS_MARKERS = {
    'js/engine.js': ['Harmony'],
    'js/presets.js': ['Harmony'],
    'js/agent-core.js': ['AgentCore', 'callTool', 'getManifest'],
    'js/agent-bridge.js': ['window.ramanujanSphere'],
    'js/app.js': ['Harmony.App'],
    'js/scene3d.js': ['Scene3D'],
    'js/lissajous2d.js': ['Lissajous2D'],
    'js/timeseries.js': ['TimeSeries'],
    'js/harmonics2d.js': ['Harmonics2D'],
    'js/frobenius.js': ['Frobenius'],
    'js/magnifier2d.js': ['Magnifier2D'],
    'js/views.js': ['Harmony'],
    'vendor/three.min.js': ['THREE'],
    'vendor/OrbitControls.js': ['OrbitControls']
  };
  for (const [path, markers] of Object.entries(JS_MARKERS)) {
    await check(`served: ${path}`, assertOk(path, 'javascript', markers));
  }
  await check('served: css/styles.css', assertOk('css/styles.css', 'text/css', ['.agent-pane', '.dock-pane', 'data-agent']));

  // ---- 3. Generated discovery artifacts ----------------------------------
  await check('served: agent/manifest.json (200 + JSON)', assertOk('agent/manifest.json', 'application/json', ['"id": "ramanujan-sphere"']));

  await check('manifest bytes === JSON.stringify(getManifest(),null,2)+"\\n"', async () => {
    const r = await fetchText('agent/manifest.json');
    assert(r.status === 200, `GET agent/manifest.json -> ${r.status}`);
    const expected = JSON.stringify(AgentCore.getManifest(), null, 2) + '\n';
    const expectedBytes = Buffer.from(expected, 'utf8');
    assert(r.bytes.equals(expectedBytes), `served ${r.bytes.length} B !== registry ${expectedBytes.length} B`);
    return `${r.bytes.length} B byte-identical`;
  });

  const manifestParsed = AgentCore.getManifest();
  const tools = manifestParsed.tools.map((t) => t.name);
  assert(tools.length === 9, `registry has ${tools.length} tools, expected 9`);

  await check('agent/examples/README.md lists every tool', async () => {
    const r = await fetchText('agent/examples/README.md');
    assert(r.status === 200, `GET -> ${r.status}`);
    assert(r.text.includes('# Generated agent examples'), 'missing title');
    for (const name of tools) assert(r.text.includes(`examples/${name}.json`) || r.text.includes(`\`${name}.json\``), `README does not list ${name}.json`);
    return `${tools.length} tool rows`;
  });

  // Independent recomputation of each committed example from the declared inputs.
  const { EXAMPLE_DEFINITIONS } = await import('../scripts/gen-agent-artifacts.mjs');
  await check('agent/examples/README.md matches declared example inputs', async () => {
    const r = await fetchText('agent/examples/README.md');
    for (const [file, def] of Object.entries(EXAMPLE_DEFINITIONS)) {
      const argsText = Object.keys(def.args).length ? '`' + JSON.stringify(def.args) + '`' : '`{}`';
      assert(r.text.includes(argsText), `README lacks args ${argsText} for ${file}`);
    }
    return `${Object.keys(EXAMPLE_DEFINITIONS).length} declared args`;
  });

  for (const name of tools) {
    await check(`example: agent/examples/${name}.json`, async () => {
      const r = await fetchText(`agent/examples/${name}.json`);
      assert(r.status === 200, `GET -> ${r.status}`);
      const envelope = JSON.parse(r.text);
      assert(envelope.ok === true, 'example is not a success envelope');
      assert(envelope.schemaVersion === 1, `schemaVersion ${envelope.schemaVersion}`);
      assert(envelope.tool === name, `tool ${envelope.tool} !== ${name}`);
      assert(Object.prototype.hasOwnProperty.call(envelope, 'data'), 'missing data');
      assert(Array.isArray(envelope.warnings), 'warnings is not an array');
      const def = EXAMPLE_DEFINITIONS[name];
      const expected = JSON.stringify(AgentCore.callTool(def.tool, def.args), null, 2) + '\n';
      assert(r.text === expected, 'example bytes !== registry callTool output');
      return `${r.bytes.length} B, deeplink ${envelope.deeplink ? 'set' : 'null'}`;
    });
  }

  // ---- 4. index.html local asset references resolve ----------------------
  await check('index.html local asset references all resolve 200', async () => {
    const html = (await fetchText('index.html')).text;
    const refs = new Set();
    const re = /\b(?:src|href)="([^"]+)"/g;
    let m;
    while ((m = re.exec(html))) {
      const ref = m[1];
      if (!ref || ref.startsWith('#') || ref.startsWith('http') || ref.startsWith('mailto:') || ref.startsWith('data:')) continue;
      refs.add(ref.split('?')[0]);
    }
    assert(refs.size >= 15, `only ${refs.size} local refs found`);
    const broken = [];
    for (const ref of refs) {
      const r = await fetchText(ref);
      if (r.status !== 200) broken.push(`${ref} -> ${r.status}`);
    }
    assert(broken.length === 0, `broken: ${broken.join(', ')}`);
    return `${refs.size} refs resolved`;
  });

  await check('served: docs/AGENT-SCREENSHOTS.md', assertOk('docs/AGENT-SCREENSHOTS.md', MD_TYPES, ['# Agent Screenshots', '01-default-scopes.png', '04-agent-tab.png', 'agent/verify-browser.mjs']));

  await check('served: docs/agent/*.png reference screenshots (4 files, each > 50 KB)', async () => {
    const files = ['01-default-scopes.png', '02-harmonics.png', '03-bits.png', '04-agent-tab.png'];
    const sizes = [];
    for (const file of files) {
      const res = await fetch(opts.base + 'docs/agent/' + file);
      assert(res.status === 200, `GET docs/agent/${file} -> ${res.status}`);
      const type = res.headers.get('content-type') || '';
      assert(type.includes('image/png'), `GET docs/agent/${file} content-type "${type}"`);
      const bytes = Buffer.from(await res.arrayBuffer());
      assert(bytes.length > 50 * 1024, `docs/agent/${file} is only ${bytes.length} B`);
      assert(bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47, `docs/agent/${file} is not a PNG`);
      sizes.push(`${file} ${Math.round(bytes.length / 1024)} KB`);
    }
    return sizes.join(', ');
  });

  // ---- 5. dump-dom of the documented deeplinks ---------------------------
  for (const link of DOCUMENTED_DEEPLINKS) {
    await check(`dump-dom: /${link.path || ''} (${link.label})`, async () => {
      const html = dumpDom(opts.base + link.path);
      const dom = parseDump(html);
      assert(dom.ready, 'body[data-agent-ready="true"] missing');
      assert(dom.schemaAttr === '1', `hidden pre data-schema-version="${dom.schemaAttr}"`);
      assert(dom.state.schemaVersion === 1, `state.schemaVersion ${dom.state.schemaVersion}`);
      assert(dom.state.tool === 'ramanujan-sphere', `state.tool ${dom.state.tool}`);
      assert(dom.state.ready === true, 'state.ready is not true');
      assert(dom.state.preset.index === link.preset, `preset.index ${dom.state.preset.index} !== ${link.preset}`);
      assert(dom.state.tab === link.tab, `tab ${dom.state.tab} !== ${link.tab}`);
      assert(dom.state.transport.staticMode === true, 'transport.staticMode is not true');

      // Full independent deep-equal: the DOM state must equal the state projected
      // headlessly by the shared core from the same deeplink.
      const expected = expectedUiFor(link.path);
      const domJson = JSON.stringify(dom.state);
      const expectedJson = JSON.stringify(expected);
      if (domJson !== expectedJson) {
        const diffs = [];
        const keys = new Set([...Object.keys(dom.state), ...Object.keys(expected)]);
        for (const k of keys) {
          if (JSON.stringify(dom.state[k]) !== JSON.stringify(expected[k])) diffs.push(k);
        }
        throw new Error(`DOM state !== module projection; differing keys: ${diffs.join(', ')}`);
      }
      return `ready, schema 1, preset ${link.preset}, tab ${link.tab}, static, ${html.length} B DOM, state ${domJson.length} B deep-equal`;
    });
  }

  // ---- Report ------------------------------------------------------------
  const failures = results.filter((r) => !r.ok);
  const width = Math.max(44, ...results.map((r) => r.name.length));
  console.log(`\n${'CHECK'.padEnd(width)}  RESULT`);
  console.log('-'.repeat(width + 8));
  for (const r of results) {
    const line = r.ok ? `PASS  ${r.detail}` : `FAIL  ${r.detail}`;
    console.log(`${r.name.padEnd(width)}  ${line}`);
  }
  console.log('-'.repeat(width + 8));
  console.log(`${results.length - failures.length}/${results.length} checks passed, ${failures.length} failed`);
  if (failures.length) {
    console.log('\nFAILED:');
    for (const f of failures) console.log(`  - ${f.name}: ${f.detail}`);
  }
  return failures.length === 0 ? 0 : 1;
}

main()
  .then((code) => { process.exitCode = code; })
  .catch((err) => {
    console.error('VERIFY FAILED:', err && err.stack ? err.stack : err);
    process.exitCode = 1;
  });
