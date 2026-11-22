/* ===== Harmony.AgentCore — the ONE implementation of the agent contract =====
   docs/AGENT-INTERFACE.md is normative. This file is the agent layer's single
   source of truth: the tool registry + envelopes, the deterministic deeplink
   grammar, the UI-state projection, the manifest, and the legacy #patch= snapshot
   codec. It WRAPS the existing maths (js/engine.js, the one float32 engine) and
   the curated catalog (js/presets.js) — it never re-implements a formula.

   Dual export, exactly like js/engine.js:
     browser: <script src="js/agent-core.js"></script>  ->  window.Harmony.AgentCore
     Node:    require('./js/agent-core.js')             ->  module.exports
   No DOM, no timers, no randomness, no timestamps: identical input => identical
   JSON, so the page, bridge, CLI, MCP server, generator and tests all agree. */
(function () {
  'use strict';

  var hasModule = typeof module !== 'undefined' && module && module.exports;
  var root = (typeof window !== 'undefined') ? window
    : (typeof globalThis !== 'undefined' ? globalThis : null);

  var Engine, Presets;
  if (hasModule) {
    Engine = require('./engine.js').engine;
    Presets = require('./presets.js');
  } else {
    if (!root || !root.Harmony || !root.Harmony.engine || !root.Harmony.Presets) {
      throw new Error('[Harmony.AgentCore] load js/engine.js and js/presets.js before js/agent-core.js');
    }
    Engine = root.Harmony.engine;
    Presets = root.Harmony.Presets;
  }

  // ---------------------------------------------------------------------------
  // Identity (must match AGENTS.md, the manifest, the bridge and the MCP server)
  // ---------------------------------------------------------------------------
  var SCHEMA_VERSION = 1;
  var TOOLSET_VERSION = '1.0.0';
  var TOOL_ID = 'ramanujan-sphere';
  var TOOL_TITLE = "The Ramanujan Chime";
  var TOOL_GLOBAL = 'ramanujanSphere';
  var STATE_SELECTOR = '#' + TOOL_ID + '-state';
  var EVENT_READY = TOOL_ID + ':ready';
  var EVENT_CHANGE = TOOL_ID + ':change';
  var DEFAULT_BASE = 'http://127.0.0.1:8080/';
  var SAMPLES = 3200;

  var DEFAULT_PRESET_INDEX = 12;   // Four-Bit Orbit — the page's own start state
  var DEFAULT_TAB = 'scopes';
  var TABS = ['scopes', 'harmonics', 'frobenius', 'bits', 'agent'];
  var TWINS = ['off', 'antipodal', 'conjugate', 'both'];
  var BIT_SOURCES = ['auto', 'main', 'ramanujan'];
  var MAG_ZOOMS = [4, 16, 64, 256];
  var MAG_FOCUSES = ['playhead', 'origin', 'trough'];
  var SLOTS = ['A', 'B', 'C'];

  var ERROR_CODES = [
    'E_BAD_ARGS', 'E_UNKNOWN_TOOL', 'E_EMPTY_INPUT', 'E_INVALID_EXPR',
    'E_INPUT_TOO_LARGE', 'E_BAD_TAB', 'E_OUT_OF_RANGE', 'E_INTERNAL'
  ];

  // ---------------------------------------------------------------------------
  // Tables (canonical order everywhere)
  // ---------------------------------------------------------------------------
  var DEFAULT_FORMULAS = {
    x: 'r*cos(TAU*f*t+phase)',
    y: 'r*sin(TAU*f*t+phase)',
    z: '0'
  };

  var DEFAULT_TOGGLES = {
    cutaway: false,
    sliceGrid: true,
    surface: true,
    wireframe: true,
    grid: true,
    axes: true,
    radiusVec: true,
    realTrace: true,
    autoRotate: true,
    animate: true,
    trace: true,
    strobeN: false,
    fourBitOrbit: true,
    quadrayTetra: true,
    magnifier: false,
    ghostRef: false,
    refWaves: false,
    syzygy: true
  };

  // Numeric inputs, deeplink param = key; bounds match the page sliders.
  var NUMERIC_DEFS = [
    { key: 'r',      min: 0.3,  max: 2.6,  int: false },
    { key: 'rIn',    min: 0,    max: 2.4,  int: false },
    { key: 'amp',    min: 0.1,  max: 2.5,  int: false },
    { key: 'f',      min: 0.5,  max: 8,    int: false },
    { key: 'K',      min: 0,    max: 14,   int: true },
    { key: 'orderN', min: 5,    max: 64,   int: true },
    { key: 'a',      min: 0.15, max: 0.85, int: false },
    { key: 'b',      min: 2,    max: 9,    int: true },
    { key: 'n',      min: 1,    max: 8,    int: true },
    { key: 'm',      min: 1,    max: 8,    int: true },
    { key: 'k',      min: 1,    max: 8,    int: true }
  ];

  // Deeplink param -> state.toggles key (canonical emission order)
  var TOGGLE_DEFS = [
    { param: 'cut',     key: 'cutaway' },
    { param: 'slice',   key: 'sliceGrid' },
    { param: 'strobe',  key: 'strobeN' },
    { param: 'fourbit', key: 'fourBitOrbit' },
    { param: 'quadray', key: 'quadrayTetra' },
    { param: 'mag',     key: 'magnifier' },
    { param: 'ghost',   key: 'ghostRef' },
    { param: 'ref',     key: 'refWaves' },
    { param: 'surf',    key: 'surface' },
    { param: 'wire',    key: 'wireframe' },
    { param: 'grid',    key: 'grid' },
    { param: 'axes',    key: 'axes' },
    { param: 'rvec',    key: 'radiusVec' },
    { param: 'rtrace',  key: 'realTrace' }
  ];

  var PATCH_ARG_KEYS = ['preset', 'formulas', 'r', 'rIn', 'amp', 'f', 'K', 'orderN',
    'a', 'b', 'n', 'm', 'k', 'phaseDeg', 'phase'];

  var PRESET_CATALOG = (Presets.list || []).map(function (p, i) {
    return { index: i, name: p.name, group: p.group || 'Patches', note: p.note || '' };
  });

  // Deterministic formatters -------------------------------------------------
  function fmtNumber(n) {
    var v = Number(n);
    if (!isFinite(v)) return String(n);
    var trimmed = Number(v.toFixed(6));
    return String(trimmed === 0 ? 0 : trimmed); // normalise -0
  }

  function round4(n) {
    var v = Number(n);
    if (!isFinite(v)) return 0;
    return Number(v.toFixed(4));
  }

  function round3(n) {
    var v = Number(n);
    if (!isFinite(v)) return 0;
    return Number(v.toFixed(3));
  }

  function phaseDegOf(st) {
    if (st && st.phaseDeg != null && isFinite(Number(st.phaseDeg))) return round4(st.phaseDeg);
    return round4((Number(st && st.phaseRad) || 0) * 180 / Math.PI);
  }

  function normalizeBase(base) {
    if (base == null || base === '') return DEFAULT_BASE;
    var b = String(base);
    var cut = b.search(/[?#]/);
    if (cut >= 0) b = b.slice(0, cut);
    if (b === '') return DEFAULT_BASE;
    return b;
  }

  function clone(obj) {
    var out = {};
    for (var k in obj) { if (Object.prototype.hasOwnProperty.call(obj, k)) out[k] = obj[k]; }
    return out;
  }

  function toBool(v) {
    if (v === true || v === 1 || v === '1' || v === 'true') return true;
    if (v === false || v === 0 || v === '0' || v === 'false') return false;
    return null;
  }

  function agentError(code, message, hint) {
    var err = new Error(message);
    err.name = 'AgentToolError';
    err.code = code;
    if (hint !== undefined) err.hint = hint;
    return err;
  }

  function isPlainObject(v) {
    return !!v && typeof v === 'object' && !Array.isArray(v);
  }

  function checkUnknown(args, allowed) {
    var keys = Object.keys(args);
    for (var i = 0; i < keys.length; i++) {
      if (allowed.indexOf(keys[i]) === -1) {
        throw agentError('E_BAD_ARGS', 'unknown argument "' + keys[i] + '"',
          'allowed arguments: ' + allowed.join(', '));
      }
    }
  }

  function readNumeric(key, value, min, max, isInt) {
    if (typeof value !== 'number' || !isFinite(value)) {
      throw agentError('E_BAD_ARGS', key + ' must be a finite number');
    }
    if (isInt && !Number.isInteger(value)) {
      throw agentError('E_BAD_ARGS', key + ' must be an integer');
    }
    if (value < min || value > max) {
      throw agentError('E_OUT_OF_RANGE', key + ' must be in [' + min + ', ' + max + ']', 'got ' + value);
    }
    return value;
  }

  function validateFormula(axis, expr) {
    if (typeof expr !== 'string') {
      throw agentError('E_BAD_ARGS', 'formulas.' + axis + ' must be a string');
    }
    if (expr.length > 512) {
      throw agentError('E_INPUT_TOO_LARGE', 'formulas.' + axis + ' exceeds 512 characters', 'split into simpler terms');
    }
    if (expr.trim() === '' || Engine.validate(expr)) {
      throw agentError('E_INVALID_EXPR', 'invalid ' + axis + '(t) expression: "' + expr + '"',
        'use variable names from the Patch Bay (t, u, r, rIn, K, a, b, sin, cos, weierstrass, morlet, ...)');
    }
    return expr;
  }

  function validateFormulas(obj) {
    if (!isPlainObject(obj)) throw agentError('E_BAD_ARGS', 'formulas must be an object {x,y,z}');
    var keys = Object.keys(obj);
    var out = {};
    for (var i = 0; i < keys.length; i++) {
      var axis = keys[i];
      if (axis !== 'x' && axis !== 'y' && axis !== 'z') {
        throw agentError('E_BAD_ARGS', 'unknown formula axis "' + axis + '"', 'formulas keys are x, y, z');
      }
      out[axis] = validateFormula(axis, obj[axis]);
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // Base state / presets
  // ---------------------------------------------------------------------------
  function applyPresetToState(st, index) {
    var p = Presets.list[index];
    if (!p) return st;
    st.presetIndex = index;
    st.note = p.note || '';
    if (!p.formulas) return st; // "Custom Formula Patch" keeps the current formulas (matches js/app.js)
    st.formulas = { x: p.formulas.x, y: p.formulas.y, z: p.formulas.z };
    var pr = p.params || {};
    for (var i = 0; i < NUMERIC_DEFS.length; i++) {
      var d = NUMERIC_DEFS[i];
      if (pr[d.key] != null) st[d.key] = pr[d.key];
    }
    if (pr.phaseDeg != null) {
      st.phaseDeg = pr.phaseDeg;
      st.phaseRad = pr.phaseDeg * Math.PI / 180;
    }
    var hi = p.hints || {};
    if (hi.sliceGrid != null) st.toggles.sliceGrid = hi.sliceGrid;
    if (hi.cutaway != null) st.toggles.cutaway = hi.cutaway;
    if (hi.magnifier != null) st.toggles.magnifier = hi.magnifier;
    if (hi.fourBitOrbit != null) st.toggles.fourBitOrbit = hi.fourBitOrbit;
    st.toggles.strobeN = !!hi.strobeN;
    if (hi.magFocus) st.magFocus = hi.magFocus;
    if (hi.twinMode) {
      st.twinMode = hi.twinMode;
      st.toggles.syzygy = hi.twinMode !== 'off';
    }
    if (st.rIn > st.r) st.rIn = st.r;
    return st;
  }

  function baseStateForPreset(index) {
    var st = {
      presetIndex: DEFAULT_PRESET_INDEX,
      r: 1, rIn: 0.45, amp: 1, f: 1, n: 3, m: 2, k: 1, K: 6, orderN: 19,
      a: 0.5, b: 3, phaseRad: 0, phaseDeg: 0,
      formulas: { x: DEFAULT_FORMULAS.x, y: DEFAULT_FORMULAS.y, z: DEFAULT_FORMULAS.z },
      toggles: clone(DEFAULT_TOGGLES),
      twinMode: 'both', bitSource: 'auto', magZoom: 16, magFocus: 'trough',
      activeTab: DEFAULT_TAB, activeSlot: 'A', playT: 0, staticMode: false,
      frobK: 4, frobP: 2, frobN: 1, curveMode: 'secp'
    };
    return applyPresetToState(st, index == null ? DEFAULT_PRESET_INDEX : index);
  }

  function defaultState() {
    return baseStateForPreset(DEFAULT_PRESET_INDEX);
  }

  // Resolve a friendly override object into a full state-like object (Node CLI,
  // tests, bridge reset). Throws AgentToolError on invalid values.
  function resolveState(overrides) {
    var v = validatePatch(overrides === undefined ? {} : overrides);
    if (!v.ok) throw agentError(v.error.code, v.error.message, v.error.hint);
    var patch = v.patch;
    var st = baseStateForPreset(patch.preset == null ? DEFAULT_PRESET_INDEX : patch.preset);
    applyNormalizedPatch(st, patch);
    return st;
  }

  // Apply a normalized patch (as returned by validatePatch) to a state-like object.
  // `preset` is applied by the caller (page uses its own applyPreset for DOM); here
  // it is applied first for headless reliability.
  function applyNormalizedPatch(st, patch) {
    if (patch.preset != null) applyPresetToState(st, patch.preset);
    if (patch.inputs) {
      for (var i = 0; i < NUMERIC_DEFS.length; i++) {
        var d = NUMERIC_DEFS[i];
        if (patch.inputs[d.key] != null) st[d.key] = patch.inputs[d.key];
      }
      if (patch.inputs.phaseDeg != null) {
        st.phaseDeg = patch.inputs.phaseDeg;
        st.phaseRad = patch.inputs.phaseDeg * Math.PI / 180;
      }
      if (st.rIn > st.r) st.rIn = st.r;
    }
    if (patch.formulas) {
      for (var axis in patch.formulas) {
        if (Object.prototype.hasOwnProperty.call(patch.formulas, axis)) st.formulas[axis] = patch.formulas[axis];
      }
    }
    if (patch.twinMode) {
      st.twinMode = patch.twinMode;
      st.toggles.syzygy = patch.twinMode !== 'off';
    }
    if (patch.bitSource) st.bitSource = patch.bitSource;
    if (patch.magZoom != null) st.magZoom = patch.magZoom;
    if (patch.magFocus) st.magFocus = patch.magFocus;
    if (patch.tab) st.activeTab = patch.tab;
    if (patch.slot) st.activeSlot = patch.slot;
    if (patch.playT != null) {
      st.playT = patch.playT;
      // Contract §6: pinning the playhead pauses the transport so the frame is reproducible.
      if (patch.animate == null) st.toggles.animate = false;
    }
    if (patch.toggles) {
      for (var tk in patch.toggles) {
        if (Object.prototype.hasOwnProperty.call(patch.toggles, tk)) st.toggles[tk] = patch.toggles[tk];
      }
    }
    if (patch.animate != null) st.toggles.animate = patch.animate;
    if (patch.autoRotate != null) st.toggles.autoRotate = patch.autoRotate;
    if (patch.staticMode != null) {
      st.staticMode = patch.staticMode;
      if (patch.staticMode) {
        st.toggles.animate = false;
        st.toggles.autoRotate = false;
      }
    }
    return st;
  }

  // ---------------------------------------------------------------------------
  // Patch validation (bridge setState / deeplink-tolerant parsing share the tables)
  // ---------------------------------------------------------------------------
  var PATCH_KEYS = [
    'preset', 'tab', 'activeTab', 'slot', 'activeSlot',
    'static', 'staticMode', 'anim', 'orbit', 'pt', 'playT', 'animate', 'autoRotate',
    'twin', 'twinMode', 'bit', 'bitSource', 'mz', 'magZoom', 'mf', 'magFocus',
    'formulas', 'inputs', 'toggles', 'phase', 'phaseDeg',
    'fx', 'fy', 'fz',
    'cut', 'slice', 'strobe', 'fourbit', 'quadray', 'mag', 'ghost', 'ref',
    'surf', 'wire', 'grid', 'axes', 'rvec', 'rtrace',
    'r', 'rIn', 'amp', 'f', 'K', 'orderN', 'a', 'b', 'n', 'm', 'k'
  ];

  var TOGGLE_PARAMS = {};
  TOGGLE_DEFS.forEach(function (d) { TOGGLE_PARAMS[d.param] = d.key; });

  function validatePatch(patch) {
    if (patch === undefined || patch === null) return { ok: true, patch: {}, warnings: [] };
    if (!isPlainObject(patch)) {
      return { ok: false, error: { code: 'E_BAD_ARGS', message: 'setState(patch) expects a JSON object' } };
    }
    var out = {};
    var inputs = {};
    var formulas = {};
    var toggles = {};
    var hasInputs = false, hasFormulas = false, hasToggles = false;

    try {
      var keys = Object.keys(patch);
      for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        var val = patch[key];
        if (PATCH_KEYS.indexOf(key) === -1) {
          throw agentError('E_BAD_ARGS', 'unknown patch key "' + key + '"', 'see docs/AGENT-INTERFACE.md §4');
        }
        // preset / tab / slot
        if (key === 'preset') {
          if (typeof val !== 'number' || !Number.isInteger(val) || val < 0 || val >= Presets.list.length) {
            throw agentError('E_OUT_OF_RANGE', 'preset must be an integer in [0, ' + (Presets.list.length - 1) + ']');
          }
          out.preset = val;
        } else if (key === 'tab' || key === 'activeTab') {
          if (TABS.indexOf(val) === -1) throw agentError('E_BAD_TAB', 'tab must be one of: ' + TABS.join(', '));
          out.tab = val;
        } else if (key === 'slot' || key === 'activeSlot') {
          if (SLOTS.indexOf(val) === -1) throw agentError('E_OUT_OF_RANGE', 'slot must be one of: ' + SLOTS.join(', '));
          out.slot = val;
        } else if (key === 'static' || key === 'staticMode') {
          var sv = toBool(val);
          if (sv === null) throw agentError('E_BAD_ARGS', 'static must be a boolean');
          out.staticMode = sv;
          if (sv) { out.animate = false; out.autoRotate = false; }
        } else if (key === 'anim' || key === 'animate') {
          var av = toBool(val);
          if (av === null) throw agentError('E_BAD_ARGS', 'anim must be a boolean');
          out.animate = av;
        } else if (key === 'orbit' || key === 'autoRotate') {
          var ov = toBool(val);
          if (ov === null) throw agentError('E_BAD_ARGS', 'orbit must be a boolean');
          out.autoRotate = ov;
        } else if (key === 'pt' || key === 'playT') {
          out.playT = readNumeric('playT', val, 0, 1, false);
        } else if (key === 'twin' || key === 'twinMode') {
          if (TWINS.indexOf(val) === -1) throw agentError('E_OUT_OF_RANGE', 'twin must be one of: ' + TWINS.join(', '));
          out.twinMode = val;
        } else if (key === 'bit' || key === 'bitSource') {
          if (BIT_SOURCES.indexOf(val) === -1) throw agentError('E_OUT_OF_RANGE', 'bit must be one of: ' + BIT_SOURCES.join(', '));
          out.bitSource = val;
        } else if (key === 'mz' || key === 'magZoom') {
          if (MAG_ZOOMS.indexOf(val) === -1) throw agentError('E_OUT_OF_RANGE', 'mz must be one of: ' + MAG_ZOOMS.join(', '));
          out.magZoom = val;
        } else if (key === 'mf' || key === 'magFocus') {
          if (MAG_FOCUSES.indexOf(val) === -1) throw agentError('E_OUT_OF_RANGE', 'mf must be one of: ' + MAG_FOCUSES.join(', '));
          out.magFocus = val;
        } else if (key === 'phase' || key === 'phaseDeg') {
          inputs.phaseDeg = readNumeric('phaseDeg', val, -180, 180, false);
          hasInputs = true;
        } else if (key === 'fx' || key === 'fy' || key === 'fz') {
          var axis = key.charAt(1);
          formulas[axis] = validateFormula(axis, val);
          hasFormulas = true;
        } else if (key === 'formulas') {
          var f = validateFormulas(val);
          for (var fa in f) { if (Object.prototype.hasOwnProperty.call(f, fa)) { formulas[fa] = f[fa]; hasFormulas = true; } }
        } else if (key === 'inputs') {
          if (!isPlainObject(val)) throw agentError('E_BAD_ARGS', 'inputs must be an object');
          var ikeys = Object.keys(val);
          for (var ii = 0; ii < ikeys.length; ii++) {
            var ik = ikeys[ii];
            if (ik === 'phaseDeg') {
              inputs.phaseDeg = readNumeric('inputs.phaseDeg', val[ik], -180, 180, false);
              hasInputs = true;
              continue;
            }
            var idef = null;
            for (var di = 0; di < NUMERIC_DEFS.length; di++) { if (NUMERIC_DEFS[di].key === ik) { idef = NUMERIC_DEFS[di]; break; } }
            if (!idef) throw agentError('E_BAD_ARGS', 'unknown inputs key "' + ik + '"');
            inputs[ik] = readNumeric('inputs.' + ik, val[ik], idef.min, idef.max, idef.int);
            hasInputs = true;
          }
        } else if (key === 'toggles') {
          if (!isPlainObject(val)) throw agentError('E_BAD_ARGS', 'toggles must be an object');
          var tkeys = Object.keys(val);
          for (var ti = 0; ti < tkeys.length; ti++) {
            var tk = tkeys[ti];
            var tknown = Object.prototype.hasOwnProperty.call(DEFAULT_TOGGLES, tk);
            if (!tknown) throw agentError('E_BAD_ARGS', 'unknown toggles key "' + tk + '"');
            var tv = toBool(val[tk]);
            if (tv === null) throw agentError('E_BAD_ARGS', 'toggles.' + tk + ' must be a boolean');
            if (tk === 'animate') out.animate = tv;
            else if (tk === 'autoRotate') out.autoRotate = tv;
            else { toggles[tk] = tv; hasToggles = true; }
          }
        } else if (TOGGLE_PARAMS[key]) {
          var tpv = toBool(val);
          if (tpv === null) throw agentError('E_BAD_ARGS', key + ' must be a boolean');
          toggles[TOGGLE_PARAMS[key]] = tpv;
          hasToggles = true;
        } else {
          // numeric patch input (r, rIn, ... ) — see NUMERIC_DEFS
          var ndef = null;
          for (var ni = 0; ni < NUMERIC_DEFS.length; ni++) { if (NUMERIC_DEFS[ni].key === key) { ndef = NUMERIC_DEFS[ni]; break; } }
          if (!ndef) throw agentError('E_BAD_ARGS', 'unsupported patch key "' + key + '"');
          inputs[key] = readNumeric(key, val, ndef.min, ndef.max, ndef.int);
          hasInputs = true;
        }
      }
      if (hasInputs) out.inputs = inputs;
      if (hasFormulas) out.formulas = formulas;
      if (hasToggles) out.toggles = toggles;
      return { ok: true, patch: out, warnings: [] };
    } catch (err) {
      return {
        ok: false,
        error: {
          code: err.code || 'E_BAD_ARGS',
          message: String(err.message || err),
          hint: err.hint
        }
      };
    }
  }

  // Which normalized-patch keys would actually change state? [] => true no-op.
  function changedKeys(state, presetIndex, patch) {
    var out = [];
    if (!patch) return out;
    var tg = (state && state.toggles) || {};
    if (patch.preset != null && patch.preset !== presetIndex) out.push('preset');
    if (patch.tab != null && patch.tab !== state.activeTab) out.push('tab');
    if (patch.slot != null && patch.slot !== state.activeSlot) out.push('slot');
    if (patch.playT != null && Number(patch.playT) !== Number(state.playT || 0)) out.push('playT');
    // A playT patch without an explicit animate flag pauses the transport (contract §6
    // `setClock` semantics); count that implied pause as a change so a same-value
    // setClock() while playing is not short-circuited into a no-op.
    if (patch.playT != null && patch.animate == null && !!tg.animate) out.push('animate');
    if (patch.animate != null && !!patch.animate !== !!tg.animate) out.push('animate');
    if (patch.autoRotate != null && !!patch.autoRotate !== !!tg.autoRotate) out.push('autoRotate');
    if (patch.staticMode != null && !!patch.staticMode !== !!state.staticMode) out.push('staticMode');
    if (patch.twinMode != null && patch.twinMode !== (state.twinMode || 'both')) out.push('twinMode');
    if (patch.bitSource != null && patch.bitSource !== (state.bitSource || 'auto')) out.push('bitSource');
    if (patch.magZoom != null && patch.magZoom !== (state.magZoom || 16)) out.push('magZoom');
    if (patch.magFocus != null && patch.magFocus !== (state.magFocus || 'trough')) out.push('magFocus');
    if (patch.inputs) {
      var keys = Object.keys(patch.inputs);
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        if (k === 'phaseDeg') {
          if (round4(patch.inputs.phaseDeg) !== phaseDegOf(state)) out.push('inputs.phaseDeg');
        } else if (Number(patch.inputs[k]) !== Number(state[k])) {
          out.push('inputs.' + k);
        }
      }
    }
    if (patch.formulas) {
      var axes = Object.keys(patch.formulas);
      for (var j = 0; j < axes.length; j++) {
        var ax = axes[j];
        if (String(patch.formulas[ax]) !== String((state.formulas || {})[ax])) out.push('formulas.' + ax);
      }
    }
    if (patch.toggles) {
      var tks = Object.keys(patch.toggles);
      for (var m = 0; m < tks.length; m++) {
        if (!!patch.toggles[tks[m]] !== !!tg[tks[m]]) out.push('toggles.' + tks[m]);
      }
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // Deeplinks
  // ---------------------------------------------------------------------------
  function deeplinkForState(stateLike, opts) {
    opts = opts || {};
    var presetIndex = opts.presetIndex != null ? opts.presetIndex
      : (stateLike.presetIndex != null ? stateLike.presetIndex : DEFAULT_PRESET_INDEX);
    var base = normalizeBase(opts.base);
    var b = baseStateForPreset(presetIndex);
    var staticMode = opts.staticMode != null ? !!opts.staticMode : !!stateLike.staticMode;
    var tg = stateLike.toggles || {};
    var btg = b.toggles || {};
    var params = [];
    function add(name, value) { params.push([name, String(value)]); }

    if (presetIndex !== DEFAULT_PRESET_INDEX) add('preset', presetIndex);
    var tab = stateLike.activeTab != null ? stateLike.activeTab : DEFAULT_TAB;
    if (tab !== DEFAULT_TAB) add('tab', tab);
    if (staticMode) add('static', 1);
    var anim = !!tg.animate;
    var orbit = !!tg.autoRotate;
    if (!staticMode) {
      if (anim !== !!btg.animate) add('anim', anim ? 1 : 0);
      if (orbit !== !!btg.autoRotate) add('orbit', orbit ? 1 : 0);
    }
    var playT = Number(stateLike.playT) || 0;
    if (!anim && playT !== 0) add('pt', fmtNumber(playT));
    for (var i = 0; i < NUMERIC_DEFS.length; i++) {
      var d = NUMERIC_DEFS[i];
      var cv = Number(stateLike[d.key]);
      var bv = Number(b[d.key]);
      if (cv !== bv) add(d.key, fmtNumber(cv));
    }
    var curDeg = phaseDegOf(stateLike);
    var baseDeg = phaseDegOf(b);
    if (curDeg !== baseDeg) add('phase', fmtNumber(curDeg));
    if ((stateLike.twinMode || 'both') !== b.twinMode) add('twin', stateLike.twinMode);
    if ((stateLike.bitSource || 'auto') !== b.bitSource) add('bit', stateLike.bitSource);
    if ((stateLike.magZoom || 16) !== b.magZoom) add('mz', stateLike.magZoom);
    if ((stateLike.magFocus || 'trough') !== b.magFocus) add('mf', stateLike.magFocus);
    for (var j = 0; j < TOGGLE_DEFS.length; j++) {
      var td = TOGGLE_DEFS[j];
      var tv = !!tg[td.key];
      var bt = !!btg[td.key];
      if (tv !== bt) add(td.param, tv ? 1 : 0);
    }
    var cf = stateLike.formulas || {};
    var bf = b.formulas || {};
    var axes = ['x', 'y', 'z'];
    for (var a = 0; a < axes.length; a++) {
      var axis = axes[a];
      if (String(cf[axis]) !== String(bf[axis])) add('f' + axis, String(cf[axis]));
    }

    var query = {};
    var pairs = [];
    for (var q = 0; q < params.length; q++) {
      query[params[q][0]] = params[q][1];
      pairs.push(params[q][0] + '=' + encodeURIComponent(params[q][1]));
    }
    return {
      url: base + (pairs.length ? '?' + pairs.join('&') : ''),
      query: query
    };
  }

  function buildDeeplink(args) {
    args = args === undefined ? {} : args;
    if (!isPlainObject(args)) throw agentError('E_BAD_ARGS', 'build_deeplink arguments must be a JSON object');
    var viewKeys = ['tab', 'slot', 'static', 'anim', 'orbit', 'animate', 'autoRotate',
      'pt', 'playT', 'base', 'twin', 'bit', 'mz', 'mf', 'fx', 'fy', 'fz'];
    TOGGLE_DEFS.forEach(function (d) { viewKeys.push(d.param); });
    checkUnknown(args, PATCH_ARG_KEYS.concat(viewKeys));
    var st = resolvePatchArgs(args, viewKeys);
    // View parameters go through the shared patch validator, so the builder has
    // exactly the same key/enum/range semantics as the bridge's setState().
    var viewPatch = {};
    ['tab', 'static', 'anim', 'orbit', 'animate', 'autoRotate', 'pt', 'playT',
      'twin', 'bit', 'mz', 'mf', 'fx', 'fy', 'fz'].forEach(function (k) {
      if (args[k] !== undefined) viewPatch[k] = args[k];
    });
    TOGGLE_DEFS.forEach(function (d) {
      if (args[d.param] !== undefined) viewPatch[d.param] = args[d.param];
    });
    var v = validatePatch(viewPatch);
    if (!v.ok) throw agentError(v.error.code, v.error.message, v.error.hint);
    applyNormalizedPatch(st, v.patch);
    var base = args.base === undefined ? DEFAULT_BASE : String(args.base);
    if (base === '') throw agentError('E_BAD_ARGS', 'base must be a non-empty URL string');
    return deeplinkForState(st, { presetIndex: st.presetIndex, base: base, staticMode: st.staticMode });
  }

  // Tolerant parse for the page (never throws; invalid values fall back + warn).
  function parseDeeplink(searchOrUrl) {
    var warnings = [];
    var raw = {};
    var str = String(searchOrUrl == null ? '' : searchOrUrl);
    var qs = '';
    var qIndex = str.indexOf('?');
    if (qIndex >= 0) {
      qs = str.slice(qIndex + 1);
    } else if (str.charAt(0) === '?' || str.charAt(0) === '&') {
      qs = str.slice(1);
    } else if (str.indexOf('=') >= 0 && str.indexOf('://') < 0 && str.charAt(0) !== '#') {
      qs = str;
    }
    var hashIndex = qs.indexOf('#');
    if (hashIndex >= 0) qs = qs.slice(0, hashIndex);

    if (qs) {
      var parts = qs.split('&');
      for (var i = 0; i < parts.length; i++) {
        if (!parts[i]) continue;
        var eq = parts[i].indexOf('=');
        var k = decodePart(eq < 0 ? parts[i] : parts[i].slice(0, eq));
        var v = eq < 0 ? '' : decodePart(parts[i].slice(eq + 1));
        if (k) raw[k] = v;
      }
    }

    function decodePart(s) {
      try { return decodeURIComponent(String(s).replace(/\+/g, ' ')); } catch (e) { return String(s); }
    }

    function num(key, min, max, isInt) {
      var v = Number(raw[key]);
      if (!isFinite(v)) { warnings.push(key + ': ignoring non-numeric value "' + raw[key] + '"'); return undefined; }
      if (isInt && !Number.isInteger(v)) { warnings.push(key + ': ignoring non-integer value "' + raw[key] + '"'); return undefined; }
      if (v < min || v > max) { warnings.push(key + ': ignoring out-of-range value "' + raw[key] + '"'); return undefined; }
      return v;
    }

    function enumVal(key, allowed) {
      if (allowed.indexOf(raw[key]) === -1) { warnings.push(key + ': ignoring unknown value "' + raw[key] + '"'); return undefined; }
      return raw[key];
    }

    var patch = {};
    var presetIndex = DEFAULT_PRESET_INDEX;
    if (raw.preset !== undefined) {
      var pv = num('preset', 0, Presets.list.length - 1, true);
      if (pv !== undefined) presetIndex = pv;
    }
    if (raw.tab !== undefined) { var tv = enumVal('tab', TABS); if (tv !== undefined) patch.tab = tv; }
    if (raw.slot !== undefined) { var sv = enumVal('slot', SLOTS); if (sv !== undefined) patch.slot = sv; }
    if (raw.static !== undefined) {
      var stv = toBool(raw.static);
      if (stv === null) warnings.push('static: ignoring value "' + raw.static + '"');
      else { patch.staticMode = stv; if (stv) { patch.animate = false; patch.autoRotate = false; } }
    }
    if (raw.anim !== undefined) {
      var anv = toBool(raw.anim);
      if (anv === null) warnings.push('anim: ignoring value "' + raw.anim + '"');
      else patch.animate = anv;
    }
    if (raw.orbit !== undefined) {
      var orv = toBool(raw.orbit);
      if (orv === null) warnings.push('orbit: ignoring value "' + raw.orbit + '"');
      else patch.autoRotate = orv;
    }
    if (raw.pt !== undefined) {
      var ptv = num('pt', 0, 1, false);
      if (ptv !== undefined) { patch.playT = ptv; patch.animate = false; }
    }
    var inputs = {};
    for (var n = 0; n < NUMERIC_DEFS.length; n++) {
      var d = NUMERIC_DEFS[n];
      if (raw[d.key] !== undefined) {
        var nv = num(d.key, d.min, d.max, d.int);
        if (nv !== undefined) inputs[d.key] = nv;
      }
    }
    if (raw.phase !== undefined) {
      var phv = num('phase', -180, 180, false);
      if (phv !== undefined) inputs.phaseDeg = phv;
    }
    if (Object.keys(inputs).length) patch.inputs = inputs;
    if (raw.twin !== undefined) { var twv = enumVal('twin', TWINS); if (twv !== undefined) patch.twinMode = twv; }
    if (raw.bit !== undefined) { var bv = enumVal('bit', BIT_SOURCES); if (bv !== undefined) patch.bitSource = bv; }
    if (raw.mz !== undefined) {
      var mzv = Number(raw.mz);
      if (MAG_ZOOMS.indexOf(mzv) === -1) warnings.push('mz: ignoring unknown value "' + raw.mz + '"');
      else patch.magZoom = mzv;
    }
    if (raw.mf !== undefined) { var mfv = enumVal('mf', MAG_FOCUSES); if (mfv !== undefined) patch.magFocus = mfv; }
    var toggles = {};
    for (var t = 0; t < TOGGLE_DEFS.length; t++) {
      var td = TOGGLE_DEFS[t];
      if (raw[td.param] !== undefined) {
        var tb = toBool(raw[td.param]);
        if (tb === null) warnings.push(td.param + ': ignoring value "' + raw[td.param] + '"');
        else toggles[td.key] = tb;
      }
    }
    if (Object.keys(toggles).length) patch.toggles = toggles;
    var formulas = {};
    var axes = ['x', 'y', 'z'];
    for (var a = 0; a < axes.length; a++) {
      var axis = axes[a];
      var fk = 'f' + axis;
      if (raw[fk] !== undefined) {
        if (raw[fk].length > 512) warnings.push(fk + ': ignoring over-long formula');
        else {
          formulas[axis] = raw[fk];
          if (Engine.validate(raw[fk])) warnings.push(fk + ': formula does not compile (passed through to the input box)');
        }
      }
    }
    if (Object.keys(formulas).length) patch.formulas = formulas;

    return { presetIndex: presetIndex, patch: patch, warnings: warnings };
  }

  // ---------------------------------------------------------------------------
  // UI-state projection (contract §5). Derived values come from the shared engine,
  // never from DOM text, so the page and the CLI emit identical objects.
  // ---------------------------------------------------------------------------
  function projectUiState(stateLike, opts) {
    opts = opts || {};
    var presetIndex = opts.presetIndex != null ? opts.presetIndex
      : (stateLike.presetIndex != null ? stateLike.presetIndex : DEFAULT_PRESET_INDEX);
    var points = opts.points;
    if (!points || !points.length) points = Engine.sample(stateLike, SAMPLES).points;
    var playT = Number(stateLike.playT) || 0;
    var toggles = stateLike.toggles || {};
    var staticMode = opts.staticMode != null ? !!opts.staticMode : !!stateLike.staticMode;
    var base = normalizeBase(opts.base);
    var shell = Engine.shellMetrics(stateLike);
    var ph = Engine.playhead(stateLike, points, playT);
    var readout = Engine.readout(stateLike, ph.point);
    var fb = Engine.fourBitOrbit(stateLike, playT);
    var p = ph.point;
    var angleDeg = null;
    if (p) angleDeg = Number((Math.atan2(p.y, p.x) * 180 / Math.PI).toFixed(1));
    var twin = null;
    if (ph.twin) twin = { mode: ph.mode, x: ph.twin.x, y: ph.twin.y, z: ph.twin.z };
    var formulas = stateLike.formulas || DEFAULT_FORMULAS;
    var presetName = (Presets.list[presetIndex] && Presets.list[presetIndex].name) || 'Custom Patch';
    var st = {
      schemaVersion: SCHEMA_VERSION,
      ready: opts.ready !== false,
      tool: TOOL_ID,
      preset: { index: presetIndex, name: presetName },
      tab: stateLike.activeTab || DEFAULT_TAB,
      slot: opts.slot || stateLike.activeSlot || 'A',
      inputs: {
        r: Number(stateLike.r),
        rIn: Number(stateLike.rIn),
        amp: Number(stateLike.amp),
        f: Number(stateLike.f),
        K: Number(stateLike.K),
        orderN: Number(stateLike.orderN),
        a: Number(stateLike.a),
        b: Number(stateLike.b),
        n: Number(stateLike.n),
        m: Number(stateLike.m),
        k: Number(stateLike.k),
        phaseDeg: phaseDegOf(stateLike)
      },
      formulas: { x: formulas.x, y: formulas.y, z: formulas.z },
      toggles: {
        cutaway: !!toggles.cutaway,
        sliceGrid: !!toggles.sliceGrid,
        surface: !!toggles.surface,
        wireframe: !!toggles.wireframe,
        grid: !!toggles.grid,
        axes: !!toggles.axes,
        radiusVec: !!toggles.radiusVec,
        realTrace: !!toggles.realTrace,
        strobeN: !!toggles.strobeN,
        fourBitOrbit: !!toggles.fourBitOrbit,
        quadrayTetra: toggles.quadrayTetra !== false,
        magnifier: !!toggles.magnifier,
        ghostRef: !!toggles.ghostRef,
        refWaves: !!toggles.refWaves
      },
      twinMode: stateLike.twinMode || 'both',
      bitSource: stateLike.bitSource || 'auto',
      magnifier: { zoom: Number(stateLike.magZoom || 16), focus: stateLike.magFocus || 'trough' },
      transport: {
        playT: playT,
        animate: !!toggles.animate,
        autoRotate: !!toggles.autoRotate,
        staticMode: staticMode
      },
      derived: {
        shell: {
          R: shell.R, rIn: shell.rIn, thickness: shell.thickness,
          volOuter: shell.volOuter, volCavity: shell.volCavity, volShell: shell.volShell
        },
        playhead: {
          t: ph.effT,
          x: p ? p.x : null,
          y: p ? p.y : null,
          z: p ? p.z : null,
          valid: !!(p && p.valid),
          dist: p ? readout.distNum : null,
          zone: readout.status,
          angleDeg: angleDeg,
          twin: twin
        },
        fourbit: {
          deg: fb.deg,
          nibble: { val: fb.nibbleVal, bin: fb.nibbleBin, hex: fb.nibbleHex }
        },
        readout: {
          angle: readout.angle,
          dist: readout.dist,
          status: readout.status,
          distNum: p ? readout.distNum : null
        }
      },
      deeplink: '',
      bridge: { schemaVersion: SCHEMA_VERSION, version: opts.version || TOOLSET_VERSION }
    };
    st.deeplink = deeplinkForState(stateLike, {
      presetIndex: presetIndex, base: base, staticMode: staticMode
    }).url;
    return st;
  }

  // ---------------------------------------------------------------------------
  // Legacy #patch= snapshot codec (kept byte-compatible with js/app.js)
  // ---------------------------------------------------------------------------
  function captureSnapshot(stateLike, presetIndex) {
    var st = stateLike || {};
    var tg = st.toggles || {};
    var idx = presetIndex != null ? presetIndex
      : (st.presetIndex != null ? st.presetIndex : 0);
    var phaseDeg = Math.round(((Number(st.phaseRad) || 0) * 180 / Math.PI) * 100) / 100;
    var f = st.formulas || DEFAULT_FORMULAS;
    return {
      p: idx,
      fx: f.x, fy: f.y, fz: f.z,
      r: st.r, rIn: st.rIn, amp: st.amp, f: st.f, K: st.K, orderN: st.orderN,
      a: st.a, b: st.b, n: st.n, m: st.m, k: st.k,
      ph: phaseDeg,
      tw: st.twinMode,
      cut: tg.cutaway ? 1 : 0,
      sg: tg.sliceGrid ? 1 : 0,
      mag: tg.magnifier ? 1 : 0,
      str: tg.strobeN ? 1 : 0,
      fb: tg.fourBitOrbit ? 1 : 0,
      qt: tg.quadrayTetra !== false ? 1 : 0,
      mf: st.magFocus,
      mz: st.magZoom
    };
  }

  function snapshotFromPreset(index, extra) {
    var p = Presets.list[index] || Presets.list[0];
    var pr = p.params || {};
    var hi = p.hints || {};
    var f = p.formulas || DEFAULT_FORMULAS;
    var snap = {
      p: index,
      fx: f.x, fy: f.y, fz: f.z,
      r: pr.r != null ? pr.r : 1.0,
      rIn: pr.rIn != null ? pr.rIn : 0.45,
      amp: pr.amp != null ? pr.amp : 1.0,
      f: pr.f != null ? pr.f : 1.0,
      K: pr.K != null ? pr.K : 6,
      orderN: pr.orderN != null ? pr.orderN : 19,
      a: pr.a != null ? pr.a : 0.5,
      b: pr.b != null ? pr.b : 3,
      n: pr.n != null ? pr.n : 3,
      m: pr.m != null ? pr.m : 2,
      k: pr.k != null ? pr.k : 1,
      ph: pr.phaseDeg != null ? pr.phaseDeg : 0,
      tw: hi.twinMode || 'both',
      cut: hi.cutaway ? 1 : 0,
      sg: hi.sliceGrid !== false ? 1 : 0,
      mag: hi.magnifier ? 1 : 0,
      str: hi.strobeN ? 1 : 0,
      fb: hi.fourBitOrbit ? 1 : 0,
      qt: 1,
      mf: hi.magFocus || 'trough',
      mz: 16
    };
    if (extra) {
      var keys = Object.keys(extra);
      for (var i = 0; i < keys.length; i++) snap[keys[i]] = extra[keys[i]];
    }
    return snap;
  }

  function sampleSnapshotPoints(snap) {
    if (!snap) return [];
    var temp = {
      r: snap.r, rIn: snap.rIn, amp: snap.amp, f: snap.f, K: snap.K, orderN: snap.orderN,
      a: snap.a, b: snap.b, n: snap.n, m: snap.m, k: snap.k,
      phaseRad: (snap.ph || 0) * Math.PI / 180,
      formulas: { x: snap.fx, y: snap.fy, z: snap.fz }
    };
    return Engine.sample(temp, SAMPLES).points;
  }

  // Legacy #patch= hash -> normalized patch (preset carried in presetIndex).
  function stateFromSnapshot(snap) {
    if (!isPlainObject(snap)) return { presetIndex: DEFAULT_PRESET_INDEX, patch: {} };
    var patch = {};
    if (snap.fx != null || snap.fy != null || snap.fz != null) {
      patch.formulas = { x: snap.fx, y: snap.fy, z: snap.fz };
    }
    var inputs = {};
    var inputKeys = ['r', 'rIn', 'amp', 'f', 'K', 'orderN', 'a', 'b', 'n', 'm', 'k'];
    inputKeys.forEach(function (k) { if (typeof snap[k] === 'number') inputs[k] = snap[k]; });
    if (typeof snap.ph === 'number') inputs.phaseDeg = snap.ph;
    if (Object.keys(inputs).length) patch.inputs = inputs;
    if (snap.tw) patch.twinMode = snap.tw;
    var toggles = {};
    if (snap.cut != null) toggles.cutaway = !!snap.cut;
    if (snap.sg != null) toggles.sliceGrid = !!snap.sg;
    if (snap.mag != null) toggles.magnifier = !!snap.mag;
    if (snap.str != null) toggles.strobeN = !!snap.str;
    if (snap.fb != null) toggles.fourBitOrbit = !!snap.fb;
    if (snap.qt != null) toggles.quadrayTetra = !!snap.qt;
    if (Object.keys(toggles).length) patch.toggles = toggles;
    if (snap.mz != null) patch.magZoom = snap.mz;
    if (snap.mf) patch.magFocus = snap.mf;
    var idx = (typeof snap.p === 'number' && snap.p >= 0 && snap.p < Presets.list.length) ? snap.p : DEFAULT_PRESET_INDEX;
    return { presetIndex: idx, patch: patch };
  }

  // ---------------------------------------------------------------------------
  // Tool argument resolution
  // ---------------------------------------------------------------------------
  function requireObject(args) {
    if (args === undefined || args === null) return {};
    if (!isPlainObject(args)) throw agentError('E_BAD_ARGS', 'arguments must be a JSON object');
    return args;
  }

  function resolvePatchArgs(args, extraAllowed) {
    args = requireObject(args);
    checkUnknown(args, PATCH_ARG_KEYS.concat(extraAllowed || []));
    var preset = args.preset === undefined ? DEFAULT_PRESET_INDEX : args.preset;
    if (typeof preset !== 'number' || !Number.isInteger(preset) || preset < 0 || preset >= Presets.list.length) {
      throw agentError('E_OUT_OF_RANGE', 'preset must be an integer in [0, ' + (Presets.list.length - 1) + ']');
    }
    var st = baseStateForPreset(preset);
    for (var i = 0; i < NUMERIC_DEFS.length; i++) {
      var d = NUMERIC_DEFS[i];
      if (args[d.key] !== undefined) st[d.key] = readNumeric(d.key, args[d.key], d.min, d.max, d.int);
    }
    var phaseRaw = args.phaseDeg !== undefined ? args.phaseDeg : args.phase;
    if (phaseRaw !== undefined) {
      var deg = readNumeric('phaseDeg', phaseRaw, -180, 180, false);
      st.phaseDeg = deg;
      st.phaseRad = deg * Math.PI / 180;
    }
    if (args.formulas !== undefined) {
      var f = validateFormulas(args.formulas);
      for (var axis in f) {
        if (Object.prototype.hasOwnProperty.call(f, axis)) st.formulas[axis] = f[axis];
      }
    }
    if (st.rIn > st.r) st.rIn = st.r;
    return st;
  }

  function patchParams(st) {
    var out = {};
    for (var i = 0; i < NUMERIC_DEFS.length; i++) {
      var d = NUMERIC_DEFS[i];
      out[d.key] = st[d.key];
    }
    out.phaseDeg = phaseDegOf(st);
    return out;
  }

  // ---------------------------------------------------------------------------
  // Domain tool implementations (each throws AgentToolError on bad input)
  // ---------------------------------------------------------------------------
  function analyzePatch(args) {
    var st = resolvePatchArgs(args, ['samples']);
    var samples = args.samples === undefined ? SAMPLES : args.samples;
    if (typeof samples !== 'number' || !Number.isInteger(samples) || samples < 32 || samples > 3200) {
      throw agentError('E_OUT_OF_RANGE', 'samples must be an integer in [32, 3200]', 'omit samples to use 3200');
    }
    var res = Engine.sample(st, samples);
    var points = res.points;
    var validCount = 0, invalidCount = 0;
    var zoneCounts = { onSphere: 0, inShell: 0, inCavity: 0, outside: 0 };
    var ext = {
      x: { min: null, max: null },
      y: { min: null, max: null },
      z: { min: null, max: null }
    };
    for (var i = 0; i < points.length; i++) {
      var p = points[i];
      if (!p.valid) { invalidCount++; continue; }
      validCount++;
      var dist = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
      var zone = Engine.zoneOf(dist, st);
      if (zone === 'ON SPHERE') zoneCounts.onSphere++;
      else if (zone === 'OUTSIDE') zoneCounts.outside++;
      else if (zone === 'IN CAVITY') zoneCounts.inCavity++;
      else zoneCounts.inShell++;
      var axes = ['x', 'y', 'z'];
      for (var a = 0; a < axes.length; a++) {
        var ax = axes[a];
        var v = p[ax];
        if (ext[ax].min === null || v < ext[ax].min) ext[ax].min = v;
        if (ext[ax].max === null || v > ext[ax].max) ext[ax].max = v;
      }
    }
    var samplesAt = [0, 0.25, 0.5, 0.75, 1].map(function (t) {
      var q = Engine.point(st, t);
      return { t: t, x: q.x, y: q.y, z: q.z, valid: q.valid };
    });
    var shell = Engine.shellMetrics(st);
    var data = {
      preset: { index: st.presetIndex, name: Presets.list[st.presetIndex].name },
      formulas: { x: st.formulas.x, y: st.formulas.y, z: st.formulas.z },
      params: patchParams(st),
      shell: {
        R: shell.R, rIn: shell.rIn, thickness: shell.thickness,
        volOuter: shell.volOuter, volCavity: shell.volCavity, volShell: shell.volShell
      },
      samples: samples,
      curveValid: !!res.valid,
      errors: { x: res.error.x, y: res.error.y, z: res.error.z },
      stats: {
        validCount: validCount,
        invalidCount: invalidCount,
        maxAbs: res.maxAbs,
        zoneCounts: zoneCounts,
        extents: ext
      },
      samplesAt: samplesAt
    };
    return { data: data, deeplink: deeplinkForState(st, { presetIndex: st.presetIndex, staticMode: true }).url };
  }

  function evalPoint(args) {
    var st = resolvePatchArgs(args, ['t']);
    var t = args.t === undefined ? 0.25 : args.t;
    if (typeof t !== 'number' || !isFinite(t) || t < 0 || t > 1) {
      throw agentError('E_OUT_OF_RANGE', 't must be a number in [0, 1]');
    }
    var p = Engine.point(st, t);
    var tw = Engine.twinOf(p, st.twinMode);
    var readout = Engine.readout(st, p);
    var data = {
      t: t,
      point: { x: p.x, y: p.y, z: p.z, valid: p.valid },
      bits: { x: Engine.bitInspect(p.x), y: Engine.bitInspect(p.y), z: Engine.bitInspect(p.z) },
      twin: {
        mode: tw.mode,
        antipodal: tw.antipodal,
        conjugate: tw.conjugate,
        realTrace: tw.realTrace
      },
      readout: {
        angle: readout.angle, dist: readout.dist, status: readout.status,
        distNum: readout.distNum
      }
    };
    var withT = {
      presetIndex: st.presetIndex, r: st.r, rIn: st.rIn, amp: st.amp, f: st.f,
      K: st.K, orderN: st.orderN, a: st.a, b: st.b, n: st.n, m: st.m, k: st.k,
      phaseRad: st.phaseRad, phaseDeg: st.phaseDeg, formulas: st.formulas,
      twinMode: st.twinMode, bitSource: st.bitSource, magZoom: st.magZoom,
      magFocus: st.magFocus, toggles: clone(st.toggles), activeTab: st.activeTab,
      activeSlot: st.activeSlot, playT: t, staticMode: true
    };
    return { data: data, deeplink: deeplinkForState(withT, { presetIndex: st.presetIndex, staticMode: true }).url };
  }

  function bitInspect(args) {
    args = requireObject(args);
    checkUnknown(args, ['value', 'special']);
    var value, input;
    if (args.special !== undefined) {
      var s = String(args.special).toLowerCase();
      if (s === 'nan') value = NaN;
      else if (s === 'inf' || s === '+inf' || s === 'infinity' || s === '+infinity') value = Infinity;
      else if (s === '-inf' || s === '-infinity') value = -Infinity;
      else throw agentError('E_BAD_ARGS', 'special must be one of: nan, +inf, -inf', 'got "' + args.special + '"');
      input = String(args.special);
    } else if (args.value !== undefined) {
      if (typeof args.value !== 'number' || !isFinite(args.value)) {
        throw agentError('E_BAD_ARGS', 'value must be a finite JSON number', 'use special:"nan" / "+inf" / "-inf" for sentinels');
      }
      value = args.value;
      input = args.value;
    } else {
      throw agentError('E_EMPTY_INPUT', 'provide value (finite number) or special (nan, +inf, -inf)');
    }
    var bits = Engine.bitInspect(value);
    return {
      data: {
        input: input,
        val: bits.val,
        hex: bits.hex,
        bin: bits.bin,
        signBit: bits.signBit,
        expBits: bits.expBits,
        mantBits: bits.mantBits,
        expDesc: bits.expDesc,
        kind: bits.kind
      }
    };
  }

  function discreteGroup(args) {
    args = requireObject(args);
    checkUnknown(args, ['orderN', 'stride']);
    var N = args.orderN === undefined ? 19 : args.orderN;
    if (typeof N !== 'number' || !Number.isInteger(N) || N < 5 || N > 64) {
      throw agentError('E_OUT_OF_RANGE', 'orderN must be an integer in [5, 64]');
    }
    var stride = args.stride === undefined ? 3 : args.stride;
    if (typeof stride !== 'number' || !Number.isInteger(stride) || stride < 1 || stride > 8) {
      throw agentError('E_OUT_OF_RANGE', 'stride must be an integer in [1, 8]');
    }
    var st = clone(defaultState());
    st.orderN = N;
    st.n = stride;
    var g = Engine.discreteGroup(st, null);
    var nodes = g.nodes.map(function (n) {
      return { idx: n.idx, t: n.t, inSubgroup: n.inSubgroup };
    });
    var inSubgroup = 0;
    for (var i = 0; i < nodes.length; i++) if (nodes[i].inSubgroup) inSubgroup++;
    return {
      data: {
        N: g.N,
        stride: g.stride,
        gcd: g.gcd,
        subOrder: g.subOrder,
        isPrime: g.isPrime,
        orbit: g.orbit,
        orbitLength: g.orbit.length,
        inSubgroupCount: inSubgroup,
        nodes: nodes
      }
    };
  }

  function ramanujanPi(args) {
    args = requireObject(args);
    checkUnknown(args, ['maxK']);
    var maxK = args.maxK === undefined ? 4 : args.maxK;
    if (typeof maxK !== 'number' || !Number.isInteger(maxK) || maxK < 0 || maxK > 6) {
      throw agentError('E_OUT_OF_RANGE', 'maxK must be an integer in [0, 6]');
    }
    var series = Engine.ramanujanSeries(maxK);
    var rows = series.rows.map(function (row) {
      return {
        k: row.k,
        piRamF32: row.piRamF32,
        ramHex: row.ramHex,
        ramLocked: row.ramLocked,
        ramErrDb: round3(row.errRamDb),
        piFourF32: row.piFourF32,
        fourHex: row.fourHex,
        fourLocked: row.fourLocked,
        fourErrDb: round3(row.errFourDb)
      };
    });
    return {
      data: {
        targetPiF32: series.targetPiF32,
        targetHex: series.targetHex,
        targetBits: series.targetBits,
        lockedAtK0: !!(rows.length && rows[0].ramLocked),
        rows: rows
      }
    };
  }

  function fourBitOrbit(args) {
    args = requireObject(args);
    checkUnknown(args, ['R', 'f', 'phaseDeg', 'phase', 'playT']);
    var R = args.R === undefined ? 1 : args.R;
    if (typeof R !== 'number' || !isFinite(R) || R < 0.1 || R > 2.6) {
      throw agentError('E_OUT_OF_RANGE', 'R must be a number in [0.1, 2.6]');
    }
    var f = args.f === undefined ? 1 : args.f;
    if (typeof f !== 'number' || !isFinite(f) || f < 0.5 || f > 8) {
      throw agentError('E_OUT_OF_RANGE', 'f must be a number in [0.5, 8]');
    }
    var phaseRaw = args.phaseDeg !== undefined ? args.phaseDeg : args.phase;
    var phaseDeg = phaseRaw === undefined ? 0 : phaseRaw;
    if (typeof phaseDeg !== 'number' || !isFinite(phaseDeg) || phaseDeg < -180 || phaseDeg > 180) {
      throw agentError('E_OUT_OF_RANGE', 'phaseDeg must be a number in [-180, 180]');
    }
    var playT = args.playT === undefined ? 0 : args.playT;
    if (typeof playT !== 'number' || !isFinite(playT) || playT < 0 || playT > 1) {
      throw agentError('E_OUT_OF_RANGE', 'playT must be a number in [0, 1]');
    }
    var st = defaultState();
    st.r = R;
    st.f = f;
    st.phaseDeg = phaseDeg;
    st.phaseRad = phaseDeg * Math.PI / 180;
    var fb = Engine.fourBitOrbit(st, playT);
    var data = {
      R: fb.R,
      theta: fb.theta,
      deg: fb.deg,
      meridian8: fb.meridian8,
      meridian1: fb.meridian1,
      equator8: fb.equator8,
      equator1: fb.equator1,
      real8: fb.real8,
      real1: fb.real1,
      quadray: fb.quadray,
      nibble: { val: fb.nibbleVal, bin: fb.nibbleBin, hex: fb.nibbleHex }
    };
    var withT = clone(st);
    withT.playT = playT;
    withT.staticMode = true;
    withT.toggles = clone(st.toggles);
    withT.toggles.animate = false;
    withT.toggles.autoRotate = false;
    return { data: data, deeplink: deeplinkForState(withT, { presetIndex: st.presetIndex, staticMode: true }).url };
  }

  function frobeniusSecp(args) {
    args = requireObject(args);
    checkUnknown(args, ['k']);
    var k = args.k === undefined ? 4 : args.k;
    if (typeof k !== 'number' || !Number.isInteger(k) || k < 1 || k > 16) {
      throw agentError('E_OUT_OF_RANGE', 'k must be an integer in [1, 16]');
    }
    var st = defaultState();
    var secp = Engine.initSecp(st);
    var trace = Engine.secpSeq(st, k);
    var pointCount = (secp.P ** BigInt(k)) + 1n - trace;
    var gPrefix = (secp.Gy % 2n === 0n ? '02' : '03') + secp.Gx.toString(16).padStart(64, '0').slice(0, 20) + '…';
    return {
      data: {
        k: k,
        curve: 'secp256k1',
        p: String(secp.P),
        n: String(secp.N),
        trace: String(trace),
        pointCount: String(pointCount),
        phiDeg: Number((secp.Phi * 180 / Math.PI).toFixed(3)),
        cosPhi: secp.Cos,
        sqrtP: secp.SqrtP,
        hasseBound: 2 * secp.SqrtP,
        gPrefix: gPrefix
      }
    };
  }

  // ---------------------------------------------------------------------------
  // Tool definitions (canonical order; run() is stripped from the manifest)
  // ---------------------------------------------------------------------------
  function patchSchemaProps() {
    var props = {
      preset: {
        type: 'integer', minimum: 0, maximum: PRESET_CATALOG.length - 1,
        description: 'Base preset index (see manifest.catalog.presets). Default 12 (Four-Bit Orbit).'
      },
      formulas: {
        type: 'object',
        properties: {
          x: { type: 'string', maxLength: 512 },
          y: { type: 'string', maxLength: 512 },
          z: { type: 'string', maxLength: 512 }
        },
        additionalProperties: false,
        description: 'Formula overrides x(t), y(t), z(t); whitelisted names (sin, cos, weierstrass, morlet, …).'
      }
    };
    for (var i = 0; i < NUMERIC_DEFS.length; i++) {
      var d = NUMERIC_DEFS[i];
      props[d.key] = {
        type: d.int ? 'integer' : 'number',
        minimum: d.min, maximum: d.max,
        description: d.key === 'r' ? 'Outer carrier radius R' : d.key === 'rIn' ? 'Inner cavity radius r'
          : d.key === 'orderN' ? 'Discrete cyclic order N' : d.key === 'K' ? 'Harmonic partials K'
          : d.key === 'a' ? 'Weierstrass decay a' : d.key === 'b' ? 'Weierstrass lacunarity b'
          : d.key === 'n' || d.key === 'm' || d.key === 'k' ? 'Oscillator ratio'
          : d.key === 'amp' ? 'Gain amplitude' : 'Frequency f'
      };
    }
    props.phaseDeg = { type: 'number', minimum: -180, maximum: 180, description: 'Phase in degrees' };
    return props;
  }

  function schema(properties, required, description) {
    return {
      type: 'object',
      properties: properties,
      required: required || [],
      additionalProperties: false,
      description: description
    };
  }

  var TOOLS = [
    {
      name: 'manifest',
      title: 'Tool manifest',
      description: 'Return the capability manifest: tools, argument schemas, deeplink grammar, UI selectors, invariants, preset catalog and related local tools. Call this first to discover the toolset.',
      scope: 'pure',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      examples: [{ args: {}, note: 'Discover the full agent interface.' }],
      run: function () { return { data: getManifest() }; }
    },
    {
      name: 'build_deeplink',
      title: 'Build a reproducible UI deeplink',
      description: 'Build the canonical deeplink for a patch/view state. Params are delta-encoded against the preset base state in a fixed order; reloading the URL reproduces the view (the screenshot contract). Returns {url, query}.',
      scope: 'pure',
      inputSchema: schema(Object.assign(patchSchemaProps(), {
        tab: { type: 'string', enum: TABS, description: 'Active dock tab' },
        static: { type: 'boolean', description: 'Freeze transport (static screenshot mode)' },
        animate: { type: 'boolean', description: 'Oscillator transport running' },
        autoRotate: { type: 'boolean', description: '3D camera auto-orbit' },
        playT: { type: 'number', minimum: 0, maximum: 1, description: 'Playhead position in [0,1]' },
        base: { type: 'string', description: 'Absolute base URL (default http://127.0.0.1:8080/)' }
      }), [], 'All args are optional; defaults reproduce the default Four-Bit Orbit view.'),
      examples: [
        { args: { preset: 5, tab: 'harmonics' }, note: 'Analytic Morlet patch on the harmonics tab.' },
        { args: { preset: 12, static: true, playT: 0.25 }, note: 'Frozen Four-Bit Orbit frame at θ = 90°.' }
      ],
      run: function (args) {
        var built = buildDeeplink(args);
        return { data: built, deeplink: built.url };
      }
    },
    {
      name: 'analyze_patch',
      title: 'Analyze a patch through the float32 engine',
      description: 'Sample a preset (optionally with formula/parameter overrides) through the one float32 Engine.sample and report what the instrument renders: validity, float32 extents, sphere-zone histogram, hollow-shell volumes V=4/3π(R³−r³), and five probe points. No pixels, deterministic.',
      scope: 'pure',
      inputSchema: schema(Object.assign(patchSchemaProps(), {
        samples: { type: 'integer', minimum: 32, maximum: 3200, description: 'Sample count (default 3200)' }
      }), [], 'All args optional; default preset 12 at 3200 samples.'),
      examples: [
        { args: { preset: 12 }, note: 'The default Four-Bit Orbit carrier.' },
        { args: { preset: 2, K: 14 }, note: 'Weierstrass fractal at maximum partials.' }
      ],
      run: function (args) { return analyzePatch(args); }
    },
    {
      name: 'eval_point',
      title: 'Evaluate the curve at one parameter t',
      description: 'Evaluate the resolved patch at t∈[0,1] at float32 precision. Returns the point, its IEEE-754 bit patterns, the antipodal/conjugate/real-trace twins, and the same telemetry strings the UI strip shows (zone, |P|, angle).',
      scope: 'pure',
      inputSchema: schema(Object.assign(patchSchemaProps(), {
        t: { type: 'number', minimum: 0, maximum: 1, description: 'Parameter position in [0,1]; default 0.25' }
      }), [], 'All args optional.'),
      examples: [
        { args: { preset: 12, t: 0 }, note: 't=0 is the 1000 (8) point on −X.' },
        { args: { preset: 11, t: 0.25 }, note: 'TANGENT sentinel explosion, top of the chart.' }
      ],
      run: function (args) { return evalPoint(args); }
    },
    {
      name: 'bit_inspect',
      title: 'Inspect IEEE-754 float32 bits',
      description: 'Show the exact 32-bit float32 encoding: hex, 32-char binary, sign/exponent/mantissa fields, exponent description and finite/NaN/±∞ kind. Use value for finite numbers or special for sentinels. π is 0x40490FDB.',
      scope: 'pure',
      inputSchema: schema({
        value: { type: 'number', description: 'Finite JSON number to inspect' },
        special: { type: 'string', enum: ['nan', '+inf', '-inf'], description: 'Sentinel instead of a numeric value' }
      }, [], 'Provide exactly one of value or special.'),
      examples: [
        { args: { value: 3.141592653589793 }, note: 'π rounds to float32 0x40490FDB.' },
        { args: { special: '+inf' }, note: 'TANGENT escape sentinel 0x7F800000.' }
      ],
      run: function (args) { return bitInspect(args); }
    },
    {
      name: 'discrete_group',
      title: 'Discrete cyclic order-N strobe structure',
      description: 'Compute the cyclic subgroup walked by generator stride g modulo N: gcd, subgroup order N/gcd, primality and the visited-orbit indices. Prime N (cofactor 1) visits all N states; composite N collapses to a smaller subgroup.',
      scope: 'pure',
      inputSchema: schema({
        orderN: { type: 'integer', minimum: 5, maximum: 64, description: 'Cyclic order N (default 19)' },
        stride: { type: 'integer', minimum: 1, maximum: 8, description: 'Generator stride (default 3)' }
      }, [], 'All args optional.'),
      examples: [
        { args: { orderN: 19, stride: 3 }, note: 'Prime 19: full 19-state cycle.' },
        { args: { orderN: 12, stride: 3 }, note: 'Composite 12: gcd 3, 4-state subgroup.' }
      ],
      run: function (args) { return discreteGroup(args); }
    },
    {
      name: 'ramanujan_pi',
      title: 'Ramanujan 1/π series vs float32 π',
      description: 'Run Ramanujan\'s 1914 1/π series and the Gregory–Leibniz Fourier series side by side against float32 π (0x40490FDB). Reports each term\'s float32 hex, whether it locks all 32 bits of π, and the dB error.',
      scope: 'pure',
      inputSchema: schema({
        maxK: { type: 'integer', minimum: 0, maximum: 6, description: 'Highest series index (default 4)' }
      }, [], 'All args optional.'),
      examples: [
        { args: { maxK: 0 }, note: 'k=0 term alone already locks 0x40490FDB.' },
        { args: { maxK: 4 }, note: 'Full comparison table.' }
      ],
      run: function (args) { return ramanujanPi(args); }
    },
    {
      name: 'fourbit_orbit',
      title: 'Four-Bit Orbit / Quadray state at playhead θ',
      description: 'Evaluate the signature Four-Bit Orbit: the meridian (XY) and equatorial (XZ) 1000(8) ↔ 0001(1) palindrome pairs, the shared ±X real projection, the inscribed Quadray tetrahedron basis and the 4-bit nibble mapped from elevation (0000 … 1111/F).',
      scope: 'pure',
      inputSchema: schema({
        R: { type: 'number', minimum: 0.1, maximum: 2.6, description: 'Sphere radius (default 1)' },
        f: { type: 'number', minimum: 0.5, maximum: 8, description: 'Frequency (default 1)' },
        phaseDeg: { type: 'number', minimum: -180, maximum: 180, description: 'Phase in degrees (default 0)' },
        playT: { type: 'number', minimum: 0, maximum: 1, description: 'Playhead position in [0,1] (default 0)' }
      }, [], 'All args optional.'),
      examples: [
        { args: { R: 1, playT: 0 }, note: 'θ=0: 1000 at −R on X, nibble 1000.' },
        { args: { R: 1, playT: 0.25 }, note: 'θ=90°: 8 at nadir, 1 at apex (1111/F).' }
      ],
      run: function (args) { return fourBitOrbit(args); }
    },
    {
      name: 'frobenius_secp',
      title: 'Frobenius trace & secp256k1 point counts',
      description: 'Exact 256-bit BigInt Lucas recurrence S_k = λ^k + λ̄^k on the real secp256k1 curve and the finite-field point count #E(F_p^k) = p^k + 1 − S_k, plus the Hasse-circle angle φ. Integers are decimal strings (JSON-safe).',
      scope: 'pure',
      inputSchema: schema({
        k: { type: 'integer', minimum: 1, maximum: 16, description: 'Extension/harmonic index k (default 4)' }
      }, [], 'All args optional.'),
      examples: [
        { args: { k: 1 }, note: 'S_1 = trace of Frobenius; #E(F_p) = p + 1 − S_1.' },
        { args: { k: 4 }, note: 'Matches the UI default (Harmonic k = 4).' }
      ],
      run: function (args) { return frobeniusSecp(args); }
    }
  ];

  var TOOL_NAMES = TOOLS.map(function (t) { return t.name; });

  function findTool(name) {
    for (var i = 0; i < TOOLS.length; i++) if (TOOLS[i].name === name) return TOOLS[i];
    return null;
  }

  function success(tool, data, deeplink) {
    return {
      ok: true,
      schemaVersion: SCHEMA_VERSION,
      tool: tool,
      data: data,
      deeplink: deeplink === undefined ? null : deeplink,
      warnings: []
    };
  }

  function failure(tool, err) {
    var payload = {
      code: (err && err.code) ? String(err.code) : 'E_INTERNAL',
      message: (err && err.message) ? String(err.message) : 'internal error'
    };
    if (err && err.hint !== undefined) payload.hint = String(err.hint);
    return {
      ok: false,
      schemaVersion: SCHEMA_VERSION,
      tool: (typeof tool === 'string') ? tool : '',
      error: payload,
      warnings: []
    };
  }

  function callTool(name, args) {
    var tool = findTool(name);
    if (!tool) {
      return failure(name, agentError('E_UNKNOWN_TOOL', 'unknown tool: ' + String(name), 'call manifest for the tool list'));
    }
    try {
      var result = tool.run(args === undefined ? {} : args);
      var data = result && typeof result === 'object' && Object.prototype.hasOwnProperty.call(result, 'data')
        ? result.data : result;
      var deeplink = result && typeof result === 'object' && Object.prototype.hasOwnProperty.call(result, 'deeplink')
        ? result.deeplink : null;
      return success(tool.name, data, deeplink);
    } catch (err) {
      if (!err || !err.code) {
        return failure(tool.name, agentError('E_INTERNAL', 'tool failed: ' + String((err && err.message) || err)));
      }
      return failure(tool.name, err);
    }
  }

  // ---------------------------------------------------------------------------
  // Manifest
  // ---------------------------------------------------------------------------
  var RELATED_TOOLS = [
    {
      id: 'quadcraft2',
      title: 'QuadCraft 2 — Quadray 3D explorer (local reference archive)',
      path: 'SchoolOfTomorrow/School_of_Tomorrow-master/QuadCraft2.html',
      relationship: 'Shares the Quadray tetrahedral basis: its (1,0,0,0),(0,1,0,0),(0,0,1,0),(0,0,0,1) vectors are fourbit_orbit.quadray D_0001/A_1000/B_0100/C_0010. Local untracked archive, not a live link.',
      status: 'available'
    },
    {
      id: 'quadraygrid4',
      title: 'QuadrayGrid4 — quadray grid renderer (local reference archive)',
      path: 'SchoolOfTomorrow/School_of_Tomorrow-master/QuadrayGrid4.html',
      relationship: 'Same quadray lattice coordinates the Four-Bit Orbit inscribes; a candidate future query-param handoff receiver.',
      status: 'available'
    },
    {
      id: 'flextegrity-lattice',
      title: 'Flextegrity Lattice — IVM/CCP lattice viewer (local reference archive)',
      path: 'SchoolOfTomorrow/School_of_Tomorrow-master/Flextegrity_Lattice.html',
      relationship: 'IVM/CCP sphere packing context for the hollow-sphere carrier; no data handoff implemented yet.',
      status: 'available'
    },
    {
      id: 'quadrays-research',
      title: 'Quadrays Research notebook (local reference archive)',
      path: 'SchoolOfTomorrow/School_of_Tomorrow-master/QuadraysResearch.ipynb',
      relationship: 'Derivation source for quadray ↔ XYZ mapping used by fourbit_orbit; manual handoff only.',
      status: 'available'
    },
    {
      id: 'qrays-py',
      title: 'qrays.py — quadray Python module (local reference archive)',
      path: 'SchoolOfTomorrow/School_of_Tomorrow-master/qrays.py',
      relationship: 'Python quadray math counterpart; CLI/MCP could eventually emit compatible vectors for it.',
      status: 'available'
    }
  ];

  function getManifest() {
    var d = defaultState();
    return {
      id: TOOL_ID,
      title: TOOL_TITLE,
      version: TOOLSET_VERSION,
      schemaVersion: SCHEMA_VERSION,
      description: 'Interactive 3D spatial-synth and IEEE-754 float32 mathematics laboratory built on a constant hollow sphere V = 4/3π(R³ − r³) with an internal 2D f(x)/x slice, conjugate/antipodal phasor twins, the Four-Bit Orbit (1000 ↔ 0001 palindrome + Quadray tetrahedron), Ramanujan 1914 1/π, the discrete cyclic order-N strobe, and secp256k1 Frobenius point counting. Agents can analyze patches, inspect float32 bits, build reproducible deeplinks, and drive the live UI through the page bridge or the headless CLI/MCP server.',
      urls: {
        app: DEFAULT_BASE,
        manifest: '/agent/manifest.json',
        agents: 'AGENTS.md',
        interface: 'docs/AGENT-INTERFACE.md'
      },
      deeplink: {
        template: '{base}?preset={preset}&tab={tab}&static=1&anim={anim}&orbit={orbit}&pt={playT}&r={r}&rIn={rIn}&K={K}&orderN={orderN}&twin={twin}&fx={x}',
        tabs: TABS.slice(),
        defaults: {
          preset: DEFAULT_PRESET_INDEX,
          tab: DEFAULT_TAB,
          static: false,
          anim: true,
          orbit: true,
          pt: 0,
          r: d.r, rIn: d.rIn, amp: d.amp, f: d.f, K: d.K, orderN: d.orderN,
          a: d.a, b: d.b, n: d.n, m: d.m, k: d.k, phase: phaseDegOf(d),
          twin: d.twinMode, bit: d.bitSource, mz: d.magZoom, mf: d.magFocus
        }
      },
      ui: {
        bridge: 'window.' + TOOL_GLOBAL,
        ready: "body[data-agent-ready='true']",
        stateSelector: STATE_SELECTOR,
        tabSelector: '[data-agent-tab]',
        panelSelector: '[data-agent-panel]',
        inputSelector: '[data-agent-input]',
        toggleSelector: '[data-agent-toggle]',
        clockSelector: '[data-agent-clock]',
        statusSelector: '[data-agent-status]'
      },
      tools: TOOLS.map(function (t) {
        return {
          name: t.name, title: t.title, description: t.description,
          scope: t.scope, inputSchema: t.inputSchema, examples: t.examples
        };
      }),
      catalog: { presets: PRESET_CATALOG },
      invariants: [
        'js/engine.js is the only implementation of the float32 maths',
        'js/agent-core.js is the only implementation of tools, envelopes and deeplinks',
        'output is deterministic: no timestamps, randomness or locale formatting',
        'pure tools never mutate the UI; only bridge setters change what the user sees',
        'the URL is the UI state: a deeplink reloads to the same view (static mode is pixel-stable)',
        'the agent layer is additive: maths, rendering and default UX are unchanged'
      ],
      relatedTools: RELATED_TOOLS.map(function (r) { return clone(r); })
    };
  }

  function serialize(value) {
    return JSON.stringify(value, null, 2) + '\n';
  }

  // ---------------------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------------------
  var AgentCore = {
    SCHEMA_VERSION: SCHEMA_VERSION,
    TOOLSET_VERSION: TOOLSET_VERSION,
    TOOL_ID: TOOL_ID,
    TOOL_TITLE: TOOL_TITLE,
    TOOL_GLOBAL: TOOL_GLOBAL,
    STATE_SELECTOR: STATE_SELECTOR,
    EVENT_READY: EVENT_READY,
    EVENT_CHANGE: EVENT_CHANGE,
    DEFAULT_PRESET_INDEX: DEFAULT_PRESET_INDEX,
    DEFAULT_TAB: DEFAULT_TAB,
    DEFAULT_BASE: DEFAULT_BASE,
    SAMPLES: SAMPLES,
    TABS: TABS,
    TWINS: TWINS,
    BIT_SOURCES: BIT_SOURCES,
    MAG_ZOOMS: MAG_ZOOMS,
    MAG_FOCUSES: MAG_FOCUSES,
    SLOTS: SLOTS,
    ERROR_CODES: ERROR_CODES,
    PRESET_CATALOG: PRESET_CATALOG,
    TOOL_NAMES: TOOL_NAMES,
    TOOLS: TOOLS,
    callTool: callTool,
    getManifest: getManifest,
    defaultState: defaultState,
    resolveState: resolveState,
    validatePatch: validatePatch,
    changedKeys: changedKeys,
    projectUiState: projectUiState,
    deeplinkForState: deeplinkForState,
    buildDeeplink: buildDeeplink,
    parseDeeplink: parseDeeplink,
    captureSnapshot: captureSnapshot,
    snapshotFromPreset: snapshotFromPreset,
    sampleSnapshotPoints: sampleSnapshotPoints,
    stateFromSnapshot: stateFromSnapshot,
    serialize: serialize
  };

  if (root) {
    root.Harmony = root.Harmony || {};
    root.Harmony.AgentCore = AgentCore;
  }
  if (hasModule) module.exports = AgentCore;
})();
