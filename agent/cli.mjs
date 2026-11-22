#!/usr/bin/env node
/* ===== agent/cli.mjs =====
   Zero-dependency command-line front end for The Ramanujan Chime agent
   toolset (docs/AGENT-INTERFACE.md section 2, 3 and 8).

   Nothing in this file re-implements a formula or a state projection: every
   tool result comes from the ONE shared core (js/agent-core.js, which wraps
   js/engine.js + js/presets.js), and `state` composes
   AgentCore.resolveState + AgentCore.projectUiState headlessly.

   Output contract
   - default: compact human summary on stdout
   - --json : stdout is EXACTLY one JSON object (the envelope, or the state
              object for the `state` command); diagnostics go to stderr.
   Exit codes: 0 ok | 2 usage | 3 tool error (E_*) | 4 internal

   Node treats js/*.js as CommonJS; this file is ESM (.mjs) and loads the core
   with createRequire, so no "type":"module" is ever added to package.json.
*/
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DEFAULT_BASE = 'http://127.0.0.1:8080/';

const EXIT_OK = 0;
const EXIT_USAGE = 2;
const EXIT_TOOL = 3;
const EXIT_INTERNAL = 4;

const requireShared = createRequire(import.meta.url);

/* ------------------------------------------------------------------ */
/* Usage errors (exit 2)                                              */
/* ------------------------------------------------------------------ */

class UsageError extends Error {}

function usageError(message) {
  throw new UsageError(message);
}

/* ------------------------------------------------------------------ */
/* Flag parsing                                                       */
/* ------------------------------------------------------------------ */

const BOOL_LITERAL_RE = /^(?:0|1|true|false|yes|no|on|off)$/i;

// name -> { key: canonical flag key, kind: 'bool' | 'boolValue' | 'value' }
const FLAG_SPECS = {
  '--json': { key: 'json', kind: 'bool' },
  '--help': { key: 'help', kind: 'bool' },
  '-h': { key: 'help', kind: 'bool' },
  '--base': { key: 'base', kind: 'value' },
  '--args': { key: 'args', kind: 'value' },
  '--check': { key: 'check', kind: 'bool' },
  '--preset': { key: 'preset', kind: 'value' },
  '--tab': { key: 'tab', kind: 'value' },
  '--slot': { key: 'slot', kind: 'value' },
  '--static': { key: 'static', kind: 'boolValue' },
  '--animate': { key: 'animate', kind: 'boolValue' },
  '--autoRotate': { key: 'autoRotate', kind: 'boolValue' },
  '--autorotate': { key: 'autoRotate', kind: 'boolValue' },
  '--playT': { key: 'playT', kind: 'value' },
  '--playt': { key: 'playT', kind: 'value' },
  '--pt': { key: 'playT', kind: 'value' },
  '--t': { key: 't', kind: 'value' },
  '--value': { key: 'value', kind: 'value' },
  '--special': { key: 'special', kind: 'value' },
  '--stride': { key: 'stride', kind: 'value' },
  '--maxK': { key: 'maxK', kind: 'value' },
  '--maxk': { key: 'maxK', kind: 'value' },
  '--samples': { key: 'samples', kind: 'value' },
  '--x': { key: 'x', kind: 'value' },
  '--y': { key: 'y', kind: 'value' },
  '--z': { key: 'z', kind: 'value' },
  '--r': { key: 'r', kind: 'value' },
  '--rIn': { key: 'rIn', kind: 'value' },
  '--rin': { key: 'rIn', kind: 'value' },
  '--amp': { key: 'amp', kind: 'value' },
  '--f': { key: 'f', kind: 'value' },
  '--K': { key: 'K', kind: 'value' },
  '--k': { key: 'k', kind: 'value' },
  '--orderN': { key: 'orderN', kind: 'value' },
  '--ordern': { key: 'orderN', kind: 'value' },
  '--a': { key: 'a', kind: 'value' },
  '--b': { key: 'b', kind: 'value' },
  '--n': { key: 'n', kind: 'value' },
  '--m': { key: 'm', kind: 'value' },
  '--phase': { key: 'phase', kind: 'value' },
  '--phaseDeg': { key: 'phase', kind: 'value' },
  '--R': { key: 'R', kind: 'value' },
  // Full view argument set (contract §2.2 + §4); build_deeplink and state only.
  '--twin': { key: 'twin', kind: 'value' },
  '--bit': { key: 'bit', kind: 'value' },
  '--mz': { key: 'mz', kind: 'value' },
  '--mf': { key: 'mf', kind: 'value' },
  '--cut': { key: 'cut', kind: 'boolValue' },
  '--slice': { key: 'slice', kind: 'boolValue' },
  '--strobe': { key: 'strobe', kind: 'boolValue' },
  '--fourbit': { key: 'fourbit', kind: 'boolValue' },
  '--quadray': { key: 'quadray', kind: 'boolValue' },
  '--mag': { key: 'mag', kind: 'boolValue' },
  '--ghost': { key: 'ghost', kind: 'boolValue' },
  '--ref': { key: 'ref', kind: 'boolValue' },
  '--surf': { key: 'surf', kind: 'boolValue' },
  '--wire': { key: 'wire', kind: 'boolValue' },
  '--grid': { key: 'grid', kind: 'boolValue' },
  '--axes': { key: 'axes', kind: 'boolValue' },
  '--rvec': { key: 'rvec', kind: 'boolValue' },
  '--rtrace': { key: 'rtrace', kind: 'boolValue' }
};

function boolFrom(raw, flagName) {
  const s = String(raw).trim().toLowerCase();
  if (s === '1' || s === 'true' || s === 'yes' || s === 'on') return true;
  if (s === '0' || s === 'false' || s === 'no' || s === 'off') return false;
  usageError('expected a boolean value for ' + flagName + ', got: ' + raw);
}

/** Both `--flag=value` and `--flag value` are accepted; bare boolean flags too. */
function parseArgv(argv) {
  const flags = {};
  const given = new Set();
  const positionals = [];

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--') {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (token === '-' || !token.startsWith('-')) {
      positionals.push(token);
      continue;
    }

    let name = token;
    let inline = null;
    const eq = token.indexOf('=');
    if (token.startsWith('--') && eq > 2) {
      name = token.slice(0, eq);
      inline = token.slice(eq + 1);
    }

    const spec = FLAG_SPECS[name];
    if (!spec) usageError('unknown flag: ' + name);

    let value;
    if (spec.kind === 'bool') {
      value = inline === null ? true : boolFrom(inline, name);
    } else if (spec.kind === 'boolValue') {
      if (inline !== null) {
        value = boolFrom(inline, name);
      } else if (i + 1 < argv.length && BOOL_LITERAL_RE.test(argv[i + 1])) {
        i += 1;
        value = boolFrom(argv[i], name);
      } else {
        value = true;
      }
    } else if (inline !== null) {
      value = inline;
    } else {
      if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) {
        usageError('missing value for ' + name);
      }
      i += 1;
      value = argv[i];
    }

    flags[spec.key] = value;
    given.add(spec.key);
  }

  return { flags, given, positionals };
}

/* ------------------------------------------------------------------ */
/* Command table + per-command accepted flags                         */
/* ------------------------------------------------------------------ */

const PATCH_FLAGS = [
  'preset', 'x', 'y', 'z',
  'r', 'rIn', 'amp', 'f', 'K', 'orderN', 'a', 'b', 'n', 'm', 'k', 'phase'
];

// Full view argument set: enum params + boolean toggles (contract §2.2 + §4).
// resolveState accepts the same deeplink names, so one mapping serves both.
const VIEW_FLAGS = [
  'twin', 'bit', 'mz', 'mf',
  'cut', 'slice', 'strobe', 'fourbit', 'quadray', 'mag', 'ghost', 'ref',
  'surf', 'wire', 'grid', 'axes', 'rvec', 'rtrace'
];

// The subset of VIEW_FLAGS that are boolean toggles (0/1 in the URL grammar).
const TOGGLE_FLAGS = [
  'cut', 'slice', 'strobe', 'fourbit', 'quadray', 'mag', 'ghost', 'ref',
  'surf', 'wire', 'grid', 'axes', 'rvec', 'rtrace'
];

const COMMAND_FLAGS = {
  help: [],
  manifest: [],
  build_deeplink: PATCH_FLAGS.concat(['tab', 'static', 'animate', 'autoRotate', 'playT', 'base']).concat(VIEW_FLAGS),
  analyze_patch: PATCH_FLAGS.concat(['samples']),
  eval_point: PATCH_FLAGS.concat(['t']),
  bit_inspect: ['value', 'special'],
  discrete_group: ['orderN', 'stride'],
  ramanujan_pi: ['maxK'],
  fourbit_orbit: ['R', 'f', 'phase', 'playT'],
  frobenius_secp: ['k'],
  state: PATCH_FLAGS.concat(['tab', 'slot', 'static', 'playT', 'base']).concat(VIEW_FLAGS),
  artifacts: ['check'],
  selftest: []
};

const COMMAND_ALIASES = {
  deeplink: 'build_deeplink',
  'build-deeplink': 'build_deeplink'
};

const TOOL_COMMANDS = [
  'manifest', 'build_deeplink', 'analyze_patch', 'eval_point', 'bit_inspect',
  'discrete_group', 'ramanujan_pi', 'fourbit_orbit', 'frobenius_secp'
];

const GLOBAL_FLAGS = new Set(['json', 'args', 'help']);

function resolveCommand(positionals) {
  if (positionals.length === 0) return 'help';
  const raw = positionals[0];
  const command = COMMAND_ALIASES[raw] || raw;
  if (!Object.prototype.hasOwnProperty.call(COMMAND_FLAGS, command)) {
    usageError("unknown command: '" + raw + "' (run 'node agent/cli.mjs help')");
  }
  if (positionals.length > 1) {
    usageError("unexpected argument: '" + positionals[1] + "'");
  }
  return command;
}

function assertAllowedFlags(command, given) {
  const allowed = COMMAND_FLAGS[command];
  for (const key of given) {
    if (GLOBAL_FLAGS.has(key)) continue;
    if (allowed.indexOf(key) === -1) {
      usageError("flag '--" + key + "' is not supported by the '" + command + "' command");
    }
  }
}

/* ------------------------------------------------------------------ */
/* Shared core loader                                                 */
/* ------------------------------------------------------------------ */

function loadCore() {
  // js/engine.js and js/presets.js publish globalThis.Harmony for CommonJS
  // consumers; preloading them makes js/agent-core.js work whether it reads
  // the global or requires them itself.
  try {
    requireShared(path.join(ROOT, 'js', 'engine.js'));
    requireShared(path.join(ROOT, 'js', 'presets.js'));
  } catch (err) {
    throw new Error('could not load js/engine.js or js/presets.js: ' + err.message);
  }
  let mod;
  try {
    mod = requireShared(path.join(ROOT, 'js', 'agent-core.js'));
  } catch (err) {
    throw new Error('could not load js/agent-core.js: ' + err.message);
  }
  const core = mod && mod.AgentCore ? mod.AgentCore : mod;
  if (!core || typeof core.callTool !== 'function') {
    throw new Error('js/agent-core.js does not export the AgentCore surface (callTool missing)');
  }
  return core;
}

/* ------------------------------------------------------------------ */
/* Argument/value helpers                                             */
/* ------------------------------------------------------------------ */

function numberish(raw) {
  if (typeof raw !== 'string') return raw;
  const text = raw.trim();
  if (text === '') return raw;
  const n = Number(text);
  return Number.isFinite(n) ? n : raw;
}

function parseArgsJson(raw) {
  let value;
  try {
    value = JSON.parse(raw);
  } catch (err) {
    usageError('--args is not valid JSON: ' + err.message);
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    usageError('--args must be a JSON object');
  }
  return value;
}

function patchArgs(flags) {
  const out = {};
  if ('preset' in flags) out.preset = numberish(flags.preset);
  for (const key of ['r', 'rIn', 'amp', 'f', 'K', 'orderN', 'a', 'b', 'n', 'm', 'k']) {
    if (key in flags) out[key] = numberish(flags[key]);
  }
  if ('phase' in flags) out.phaseDeg = numberish(flags.phase);
  const formulas = {};
  if ('x' in flags) formulas.x = String(flags.x);
  if ('y' in flags) formulas.y = String(flags.y);
  if ('z' in flags) formulas.z = String(flags.z);
  if (Object.keys(formulas).length > 0) out.formulas = formulas;
  return out;
}

/** Full view args (enums + toggles); valid for build_deeplink args and state overrides. */
function addViewArgs(target, flags) {
  if ('twin' in flags) target.twin = String(flags.twin);
  if ('bit' in flags) target.bit = String(flags.bit);
  if ('mz' in flags) target.mz = numberish(flags.mz);
  if ('mf' in flags) target.mf = String(flags.mf);
  for (const key of TOGGLE_FLAGS) {
    if (key in flags) target[key] = !!flags[key];
  }
  return target;
}

/** Tool arguments for one of the 9 pure tools (shared `--args` first, flags win). */
function toolArgsFor(command, flags) {
  const args = flags.args ? parseArgsJson(flags.args) : {};
  const patched = patchArgs(flags);

  switch (command) {
    case 'manifest':
      return args;

    case 'build_deeplink': {
      Object.assign(args, patched);
      if ('tab' in flags) args.tab = String(flags.tab);
      if ('static' in flags) args.static = !!flags.static;
      if ('animate' in flags) args.animate = !!flags.animate;
      if ('autoRotate' in flags) args.autoRotate = !!flags.autoRotate;
      if ('playT' in flags) args.playT = numberish(flags.playT);
      if ('base' in flags) args.base = String(flags.base);
      addViewArgs(args, flags);
      return args;
    }

    case 'analyze_patch': {
      Object.assign(args, patched);
      if ('samples' in flags) args.samples = numberish(flags.samples);
      return args;
    }

    case 'eval_point': {
      Object.assign(args, patched);
      if ('t' in flags) args.t = numberish(flags.t);
      return args;
    }

    case 'bit_inspect': {
      if ('value' in flags) args.value = numberish(flags.value);
      if ('special' in flags) args.special = String(flags.special);
      return args;
    }

    case 'discrete_group': {
      if ('orderN' in flags) args.orderN = numberish(flags.orderN);
      if ('stride' in flags) args.stride = numberish(flags.stride);
      return args;
    }

    case 'ramanujan_pi': {
      if ('maxK' in flags) args.maxK = numberish(flags.maxK);
      return args;
    }

    case 'fourbit_orbit': {
      if ('R' in flags) args.R = numberish(flags.R);
      if ('f' in flags) args.f = numberish(flags.f);
      if ('phase' in flags) args.phaseDeg = numberish(flags.phase);
      if ('playT' in flags) args.playT = numberish(flags.playT);
      return args;
    }

    case 'frobenius_secp': {
      if ('k' in flags) args.k = numberish(flags.k);
      return args;
    }

    default:
      throw new Error('toolArgsFor: unsupported tool command ' + command);
  }
}

/* ------------------------------------------------------------------ */
/* Output                                                             */
/* ------------------------------------------------------------------ */

function writeJson(value) {
  process.stdout.write(JSON.stringify(value, null, 2) + '\n');
}

function internalEnvelope(tool, err) {
  const message = err && err.message ? String(err.message) : String(err);
  return {
    ok: false,
    schemaVersion: 1,
    tool: tool,
    error: {
      code: 'E_INTERNAL',
      message: message.slice(0, 300),
      hint: 'The shared core failed unexpectedly; verify js/agent-core.js loads in Node.'
    },
    warnings: []
  };
}

function reportInternal(tool, err, flags) {
  const message = err && err.message ? String(err.message) : String(err);
  if (flags && flags.json) writeJson(internalEnvelope(tool, err));
  process.stderr.write('internal error: ' + message + '\n');
  return EXIT_INTERNAL;
}

function printEnvelope(envelope, flags) {
  if (flags.json) {
    writeJson(envelope);
    return;
  }
  const tool = (envelope && envelope.tool) || 'unknown';
  if (envelope.ok === true) {
    process.stdout.write('ramanujan-sphere · ' + tool + ' · ok (schema ' + envelope.schemaVersion + ')\n');
    if (envelope.deeplink) process.stdout.write('deeplink: ' + envelope.deeplink + '\n');
    process.stdout.write(JSON.stringify(envelope.data, null, 2) + '\n');
    if (Array.isArray(envelope.warnings) && envelope.warnings.length > 0) {
      process.stderr.write('warnings: ' + envelope.warnings.join('; ') + '\n');
    }
  } else {
    const error = (envelope && envelope.error) || { code: 'E_INTERNAL', message: 'unknown failure' };
    process.stderr.write('ramanujan-sphere · ' + tool + ' · error ' + error.code + ': ' + error.message + '\n');
    if (error.hint) process.stderr.write('hint: ' + error.hint + '\n');
  }
}

/* ------------------------------------------------------------------ */
/* Commands                                                           */
/* ------------------------------------------------------------------ */

function runTool(command, args, flags) {
  let core;
  try {
    core = loadCore();
  } catch (err) {
    return reportInternal(command, err, flags);
  }

  let envelope;
  try {
    envelope = core.callTool(command, args);
  } catch (err) {
    return reportInternal(command, err, flags);
  }
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
    return reportInternal(command, new Error('shared core returned no tool envelope'), flags);
  }

  printEnvelope(envelope, flags);
  return envelope.ok === true ? EXIT_OK : EXIT_TOOL;
}

function lookupPresetName(core, index) {
  if (!Number.isInteger(index)) return null;
  try {
    if (Array.isArray(core.PRESET_CATALOG)) {
      const entry = core.PRESET_CATALOG.find(function (p) { return p && p.index === index; });
      if (entry && entry.name) return entry.name;
    }
  } catch (err) { /* fall through to manifest */ }
  try {
    const manifest = core.getManifest();
    const presets = manifest && manifest.catalog && manifest.catalog.presets;
    if (Array.isArray(presets)) {
      const entry = presets.find(function (p) { return p && p.index === index; });
      if (entry && entry.name) return entry.name;
    }
  } catch (err) { /* no preset name available */ }
  return null;
}

function runState(flags) {
  let core;
  try {
    core = loadCore();
  } catch (err) {
    process.stderr.write('internal error: ' + err.message + '\n');
    return EXIT_INTERNAL;
  }

  let uiState;
  try {
    const overrides = flags.args ? parseArgsJson(flags.args) : {};
    Object.assign(overrides, patchArgs(flags));
    if ('tab' in flags) overrides.tab = String(flags.tab);
    if ('slot' in flags) overrides.slot = String(flags.slot);
    if ('static' in flags) overrides.static = !!flags.static;
    if ('playT' in flags) overrides.playT = numberish(flags.playT);
    addViewArgs(overrides, flags);

    // The shared core validates the deeplink parameter names (and their
    // normalised aliases) and returns the page-shaped state-like object.
    const stateLike = core.resolveState(overrides);
    if (!stateLike || typeof stateLike !== 'object') {
      throw new Error('resolveState returned no state object');
    }

    const opts = {
      base: 'base' in flags ? String(flags.base) : DEFAULT_BASE,
      ready: true,
      version: core.TOOLSET_VERSION || '1.0.0'
    };
    if (Number.isInteger(stateLike.presetIndex)) opts.presetIndex = stateLike.presetIndex;
    const presetName = lookupPresetName(core, stateLike.presetIndex);
    if (presetName) opts.presetName = presetName;
    if (typeof stateLike.activeSlot === 'string') opts.slot = stateLike.activeSlot;
    if (typeof stateLike.staticMode === 'boolean') opts.staticMode = stateLike.staticMode;

    uiState = core.projectUiState(stateLike, opts);
    if (!uiState || typeof uiState !== 'object' || Array.isArray(uiState)) {
      throw new Error('projectUiState returned no state object');
    }
  } catch (err) {
    if (err && typeof err.code === 'string' && err.code.indexOf('E_') === 0) {
      process.stderr.write('error ' + err.code + ': ' + (err.message || 'invalid state override') + '\n');
      return EXIT_TOOL;
    }
    process.stderr.write('internal error: ' + (err && err.message ? err.message : String(err)) + '\n');
    return EXIT_INTERNAL;
  }

  writeJson(uiState);
  return EXIT_OK;
}

function forwardChild(scriptPath, args) {
  if (!existsSync(scriptPath)) {
    process.stderr.write('script not found: ' + scriptPath + '\n');
    return EXIT_INTERNAL;
  }
  const result = spawnSync(process.execPath, [scriptPath].concat(args || []), {
    cwd: ROOT,
    stdio: 'inherit'
  });
  if (result.error) {
    process.stderr.write('failed to run ' + path.basename(scriptPath) + ': ' + result.error.message + '\n');
    return EXIT_INTERNAL;
  }
  return typeof result.status === 'number' ? result.status : EXIT_INTERNAL;
}

function runArtifacts(flags) {
  const generator = path.join(ROOT, 'scripts', 'gen-agent-artifacts.mjs');
  return forwardChild(generator, flags.check ? ['--check'] : []);
}

function runSelftest() {
  return forwardChild(path.join(__dirname, 'selftest.mjs'), []);
}

/* ------------------------------------------------------------------ */
/* Help                                                               */
/* ------------------------------------------------------------------ */

const HELP_TEXT = [
  "The Ramanujan Chime — agent CLI (toolset 1.0.0, schema 1)",
  '',
  'Usage:',
  '  node agent/cli.mjs <command> [flags] [--json]',
  '',
  'Commands:',
  '  help                  Show this help (exit 0).',
  '  manifest              Full tool manifest (contract section 7).',
  '  build_deeplink        Build a reproducible page URL (alias: deeplink).',
  '  analyze_patch         Sample the active patch: stats without pixels.',
  '  eval_point            Evaluate one t: point, float32 bits, twin, telemetry.',
  '  bit_inspect           IEEE-754 float32 inspector (--value or --special).',
  '  discrete_group        Order-N cyclic generator walk (--orderN, --stride).',
  '  ramanujan_pi          Ramanujan 1914 1/pi vs Fourier series (--maxK 0..6).',
  '  fourbit_orbit         4-bit palindrome orbit + quadray (--R, --f, --phase, --playT).',
  '  frobenius_secp        secp256k1 Frobenius trace / point count (--k 1..16).',
  '  state                 Headless section-5 UI state (--preset, --tab, --slot, --base).',
  '  artifacts [--check]   Generate static agent artifacts (--check verifies them).',
  '  selftest              Run agent/selftest.mjs (CLI + MCP checks).',
  '',
  'Flags:',
  '  --json                Print exactly one JSON object on stdout; diagnostics to stderr.',
  '  --args <json>         Tool arguments / state overrides as a JSON object.',
  '  --base <url>          Page base URL (build_deeplink, state). Default ' + DEFAULT_BASE,
  '  --preset <int>        Base preset index 0..13 (default 12).',
  '  --tab <enum>          scopes|harmonics|frobenius|bits|agent.',
  '  --slot <A|B|C>        Active VST sphere slot (state).',
  '  --static [0|1]        Freeze animation + auto-rotate (screenshot mode).',
  '  --animate [0|1]       Animation toggle (build_deeplink).',
  '  --autoRotate [0|1]    Auto-rotate toggle (build_deeplink).',
  '  --pt, --playT <0..1>  Playhead clock.',
  '  --twin <off|antipodal|conjugate|both>  Twin mode (build_deeplink, state).',
  '  --bit <auto|main|ramanujan>  Float32 bit source (build_deeplink, state).',
  '  --mz <4|16|64|256>    Magnifier zoom (build_deeplink, state).',
  '  --mf <playhead|origin|trough>  Magnifier focus (build_deeplink, state).',
  '  --cut --slice --strobe --fourbit --quadray --mag --ghost --ref',
  '  --surf --wire --grid --axes --rvec --rtrace [0|1]',
  '                        View toggles (build_deeplink, state).',
  '  --x, --y, --z <expr>  Formula overrides (validated by Engine.validate).',
  '  --r --rIn --amp --f --K --orderN --a --b --n --m --k --phase <number>',
  '                        Shared patch-selector overrides.',
  '  --t <0..1>            Sample parameter for eval_point.',
  '  --value <n>           Finite number for bit_inspect.',
  '  --special <nan|+inf|-inf>  Sentinel for bit_inspect.',
  '  --stride <int>        discrete_group generator stride.',
  '  --maxK <int>          ramanujan_pi series terms 0..6.',
  '  --R <number>          fourbit_orbit sphere radius.',
  '  --samples <int>       analyze_patch sample count 32..3200.',
  '  --check               Verify artifacts instead of writing them.',
  '',
  'Both --flag=value and --flag value are accepted.',
  'Exit codes: 0 ok | 2 usage | 3 tool error (E_*) | 4 internal',
  ''
].join('\n');

/* ------------------------------------------------------------------ */
/* Entry point                                                        */
/* ------------------------------------------------------------------ */

function main(argv) {
  const parsed = parseArgv(argv);
  const flags = parsed.flags;

  if (flags.help) {
    process.stdout.write(HELP_TEXT);
    return EXIT_OK;
  }

  const command = resolveCommand(parsed.positionals);
  if (command === 'help') {
    process.stdout.write(HELP_TEXT);
    return EXIT_OK;
  }
  assertAllowedFlags(command, parsed.given);

  if (TOOL_COMMANDS.indexOf(command) !== -1) {
    return runTool(command, toolArgsFor(command, flags), flags);
  }
  if (command === 'state') return runState(flags);
  if (command === 'artifacts') return runArtifacts(flags);
  if (command === 'selftest') return runSelftest();
  return reportInternal(command, new Error('unhandled command: ' + command), flags);
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (err) {
  if (err instanceof UsageError) {
    process.stderr.write('usage error: ' + err.message + '\n');
    process.stderr.write("Run 'node agent/cli.mjs help' for usage.\n");
    process.exitCode = EXIT_USAGE;
  } else {
    process.stderr.write('internal error: ' + (err && err.message ? err.message : String(err)) + '\n');
    process.exitCode = EXIT_INTERNAL;
  }
}
