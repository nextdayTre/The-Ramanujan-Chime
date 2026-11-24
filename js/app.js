/* ===== Harmony.App — Declarative State, Studio Dock & Render Orchestrator =====
   Connects the single Float32 math core (Harmony.engine) to the Hero 3D Hollow
   Sphere, Circular Zoom Magnifier, 2D Slice Scopes, Harmonics/Ramanujan Analyzer,
   Frobenius Phasors, and IEEE-754 Bit Lab — with zero page scroll and URL patch sharing. */
(function () {
  'use strict';

  if (!window.THREE) {
    document.body.innerHTML = '<div style="padding:40px;color:#ff6b6b;font-family:monospace">vendor/three.min.js failed to load — keep the vendor/ folder next to index.html.</div>';
    return;
  }

  var Engine = Harmony.engine,
      Presets = Harmony.Presets,
      Scene3D = Harmony.Scene3D,
      Magnifier2D = Harmony.Magnifier2D,
      Lissajous2D = Harmony.Lissajous2D,
      TimeSeries = Harmony.TimeSeries,
      Harmonics2D = Harmony.Harmonics2D,
      Frobenius = Harmony.Frobenius,
      BitWaveFeed = Harmony.BitWaveFeed,
      SynthLCD = Harmony.SynthLCD,
      FloorView = Harmony.FloorView,
      ModMatrix = Harmony.ModMatrix,
      ChimeRack = Harmony.ChimeRack,
      GroverLens = Harmony.GroverLens,
      AgentCore = Harmony.AgentCore;   // js/agent-core.js — the ONE shared agent layer

  var SAMPLES = 3200;
  var PLAY_SPEED = 0.11;

  // ---- Single Application State ----
  var state = {
    r: 1.0,
    rIn: 0.45,
    amp: 1.0,
    f: 1.0,
    n: 3,
    m: 2,
    k: 1,
    K: 6,
    orderN: 19,
    a: 0.5,
    b: 3,
    phaseRad: 0,
    frobK: 4,
    frobP: 2,
    frobN: 1,
    curveMode: 'secp',
    secp: null,
    twinMode: 'both',      // 'off' | 'antipodal' | 'conjugate' | 'both'
    bitSource: 'auto',     // 'auto' | 'main' | 'ramanujan'
    activeTab: 'scopes',   // 'scopes' | 'harmonics' | 'frobenius' | 'bits' | 'agent'
    presetIndex: 12,       // current patch preset index (contract §5 preset.index)
    activeSlot: 'A',       // 'A' | 'B' | 'C' VST sphere slot
    ghostSlot: '',
    ghostPoints: [],
    ghostRev: 0,
    magZoom: 16,
    magFocus: 'trough',    // 'playhead' | 'origin' | 'trough'
    lockVolume: false,     // §2.1 Constant-Volume Time-Stretch Lock: R(r) = (r^3 + R0^3)^(1/3)
    lockedR0: 0.96868,     // Reference solid radius R0 = (R^3 - rIn^3)^(1/3)
    stretchMode: 'off',    // 'off' | 'pitchLock' | 'tape' | 'jacobian' (§2.2 / §2.3)
    archimedesAuto: true,  // §3.3 Archimedes axial slice auto-sweep vs manual z scrubber
    archimedesZNorm: 0,    // Manual axial slice z / R in [-1, 1]
    floorMode: 'wavetable',// §10 'wavetable' (GitWave 3D) | 'spectrogram' (MiniMeters 3D)
    floorDepth: 0.68,      // §10 3D floor height/amplitude
    floorSmooth: 0.52,     // §10 smoothing (wavetable) or 3D dispersion spread (spectrogram)
    floorSize: 0.94,       // §10 floor footprint proportion inside outer sphere R
    floorBpm: 120,         // §10 tempo (BPM) governing BPM beat snaps
    floorBeats: 4,         // §10 default beat snap (1 Bar = 4 beats)
    floorZoomLog: 0.7295,  // §10.5 continuous logarithmic RX Time Zoom [0..1] <-> [16ms..12s] (routable in Mod & Logic)
    floorScopeView: 'eq',  // §10.5 'eq' | 'pcm' | 'bitwave' | 'lcd' | 'dual'
    lcdCoalesce: 0.34,     // Harmor / FAS System A Travelling Focus Beam coalesce [0..1] (routable in Mod & Logic)
    formulas: {
      x: 'r*cos(TAU*f*t+phase)',
      y: 'r*sin(TAU*f*t+phase)',
      z: '0'
    },
    toggles: {
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
      resonanceMode: true,
      floorWt: false,
      harmorVoid: false,
      magnifier: false,
      ghostRef: false,
      refWaves: false,
      syzygy: true
    },
    maxAbs: 1,
    playT: 0,
    points: [],
    curveValid: true,
    note: ''
  };

  var STATIC_MODE = /[?&]static(?:=1)?(?:&|$)/.test(location.search);
  var IS_POPOUT = /[?&]popout=1(?:&|$)/.test(location.search);
  var START_THEATRE = IS_POPOUT || /[?&]theatre=1(?:&|$)/.test(location.search);
  if (STATIC_MODE) {
    state.toggles.animate = false;
    state.toggles.autoRotate = false;
  }
  state.staticMode = STATIC_MODE;

  var dirty = 0;
  var lastRendered = -1;
  var slots = null;
  var slotStages = Object.create(null);
  var isRestoringSlot = false;
  var copyArmed = false;
  var popoutWin = null;
  var hasOpenerSync = false;
  var isApplyingRemoteSync = false;

  function bumpAnimated() {
    dirty++;
    if (slots && !isRestoringSlot && slots[state.activeSlot]) {
      slots[state.activeSlot] = captureSnapshot();
      syncSlotTooltips();
    }
  }

  function bump() {
    bumpAnimated();
    if (!suppressAgentPublish) publishAgent();
    if (!isApplyingRemoteSync && typeof sendPopoutSync === 'function') sendPopoutSync(true);
  }
  function $(id) { return document.getElementById(id); }

  // =====================================================================
  // AGENT LAYER (additive) — contract §4/§5/§6
  // The page parses the deeplink on mount, projects its state into the hidden
  // `<pre id="ramanujan-sphere-state">` node, publishes to bridge listeners on
  // structural changes, and keeps the URL in sync (debounced replaceState).
  // Animation ticks only refresh the hidden node + body[data-agent-clock].
  // =====================================================================
  var agentListeners = [];
  var appReady = false;
  var readyQueue = [];
  var suppressAgentPublish = false;
  var agentUrlTimer = null;
  var agentFrameSig = '';
  var agentFrameJson = '';
  var AGENT_VERSION = '1.0.0';

  function hasOwn(obj, key) { return Object.prototype.hasOwnProperty.call(obj, key); }

  function pageBase() {
    try {
      if (location.origin && location.origin !== 'null') {
        return location.origin + location.pathname;
      }
    } catch (e) { /* ignore */ }
    return String(location.href).split('#')[0].split('?')[0];
  }

  function presetIndexNow() {
    var n = (typeof state.presetIndex === 'number') ? state.presetIndex
      : parseInt(presetSelect && presetSelect.value, 10);
    return (n == null || isNaN(n)) ? 12 : n;
  }

  function presetNameNow() {
    var p = Presets.list[presetIndexNow()];
    return p ? p.name : '';
  }

  function agentStaticMode() { return !!(STATIC_MODE || state.staticMode); }

  function agentOpts() {
    var o = {
      presetIndex: presetIndexNow(),
      presetName: presetNameNow(),
      base: pageBase(),
      ready: true,
      staticMode: agentStaticMode(),
      slot: state.activeSlot,
      version: (AgentCore && AgentCore.TOOLSET_VERSION) || AGENT_VERSION
    };
    // Hand the page's own float32 sample buffer to the projection so `derived`
    // matches the visible panels exactly; fall back to the core's deterministic
    // resample when the frame loop has not caught up with a just-applied patch.
    if (dirty === lastRendered && state.points && state.points.length) o.points = state.points;
    return o;
  }

  function buildUiState() {
    if (!AgentCore || typeof AgentCore.projectUiState !== 'function') return null;
    try { return AgentCore.projectUiState(state, agentOpts()); } catch (e) { return null; }
  }

  function deeplinkNow() {
    if (AgentCore && typeof AgentCore.deeplinkForState === 'function') {
      try {
        var d = AgentCore.deeplinkForState(state, agentOpts());
        if (d && typeof d.url === 'string') return d.url;
      } catch (e) { /* ignore — fall through to plain base */ }
    }
    return pageBase();
  }

  function notifyAgentListeners(ui) {
    var list = agentListeners.slice();
    for (var i = 0; i < list.length; i++) {
      try { list[i](ui); } catch (e) { /* isolate throwing subscribers */ }
    }
  }

  function publishAgent() {
    if (!AgentCore || typeof AgentCore.projectUiState !== 'function') return;
    var ui = buildUiState();
    if (!ui) return;
    var json = JSON.stringify(ui);
    var el = $('ramanujan-sphere-state');
    if (el) el.textContent = json;
    scheduleAgentUrlSync();
    notifyAgentListeners(ui);
  }

  function scheduleAgentUrlSync() {
    // Legacy Share-Link mode keeps its #patch= hash and disables URL sync.
    if (location.hash && location.hash.indexOf('#patch=') === 0) return;
    if (agentUrlTimer) clearTimeout(agentUrlTimer);
    agentUrlTimer = setTimeout(function () {
      agentUrlTimer = null;
      if (location.hash && location.hash.indexOf('#patch=') === 0) return;
      var url = deeplinkNow();
      if (!url) return;
      try {
        if (location.href !== url) history.replaceState(null, '', url);
      } catch (e) { /* file:// / sandboxed history — best effort only */ }
    }, 300);
  }

  // Per-frame refresh: clock attribute every frame; hidden JSON only when the
  // projected signature changes (static mode ⇒ no churn, animate ⇒ playT moves).
  function refreshAgentFrame() {
    if (!AgentCore || typeof AgentCore.projectUiState !== 'function') return;
    var clock = (state.playT || 0).toFixed(4);
    if (document.body && document.body.getAttribute('data-agent-clock') !== clock) {
      document.body.setAttribute('data-agent-clock', clock);
    }
    var el = $('ramanujan-sphere-state');
    var sig = dirty + '|' + lastRendered + '|' + clock + '|' + state.activeTab + '|' +
      state.activeSlot + '|' + (agentStaticMode() ? 1 : 0);
    if (sig !== agentFrameSig) {
      agentFrameSig = sig;
      var ui = buildUiState();
      agentFrameJson = ui ? JSON.stringify(ui) : '';
    }
    // Always touch the node so it is "refreshed on render frames" even when stable.
    if (el && el.textContent !== agentFrameJson) el.textContent = agentFrameJson;
  }

  function agentSubscribe(fn) {
    if (typeof fn !== 'function') return function () {};
    agentListeners.push(fn);
    var off = false;
    return function () {
      if (off) return;
      off = true;
      var i = agentListeners.indexOf(fn);
      if (i >= 0) agentListeners.splice(i, 1);
    };
  }

  function agentFailure(code, message, hint) {
    var err = { code: code, message: message };
    if (hint) err.hint = hint;
    return { ok: false, error: err, state: buildUiState() };
  }

  function setBitSourceUI(src) {
    state.bitSource = src;
    document.querySelectorAll('.bit-src-btn[data-bitsrc]').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-bitsrc') === src);
    });
    _bitCache = { x: '', y: '', z: '' };
    updateBitInspector();
  }

  // Re-base the live state onto a preset exactly like a deeplink mount does:
  // preset first (its formulas/params/hints/toggles), then any explicit overrides.
  // Transport (animate/autoRotate) is preserved unless a patch sets it explicitly.
  function applyPresetRebase(idx) {
    var n = Number(idx);
    state.presetIndex = n;
    presetSelect.value = String(n);
    applyPreset(n); // legacy DOM + data-default + note + formula drawer behaviour
    var d = (AgentCore && typeof AgentCore.resolveState === 'function') ? AgentCore.resolveState({ preset: n }) : null;
    if (!d) return;
    if (d.formulas) {
      ['x', 'y', 'z'].forEach(function (axis) {
        if (d.formulas[axis] == null) return;
        state.formulas[axis] = String(d.formulas[axis]);
        var inp = $('formula' + axis.toUpperCase());
        if (inp) { inp.value = state.formulas[axis]; inp.classList.remove('invalid'); }
        var err = $('err' + axis.toUpperCase());
        if (err) err.textContent = '';
      });
    }
    ['r', 'rIn', 'amp', 'f', 'K', 'orderN', 'a', 'b', 'n', 'm', 'k'].forEach(function (k) {
      if (typeof d[k] === 'number') state[k] = d[k];
    });
    if (typeof d.phaseDeg === 'number') setPhaseFromDeg(d.phaseDeg);
    if (d.toggles) {
      for (var tk in d.toggles) {
        if (!hasOwn(d.toggles, tk)) continue;
        if (tk === 'animate' || tk === 'autoRotate') continue; // transport is explicit-only
        state.toggles[tk] = !!d.toggles[tk];
      }
    }
    if (d.twinMode) {
      state.twinMode = d.twinMode;
      state.toggles.syzygy = d.twinMode !== 'off';
    }
    if (d.bitSource) state.bitSource = d.bitSource;
    if (typeof d.magZoom === 'number') state.magZoom = d.magZoom;
    if (d.magFocus) state.magFocus = d.magFocus;
    syncParamUI();
    syncHudToggles();
    syncMagChips();
    if (slots && state.activeSlot && !isRestoringSlot) {
      slots[state.activeSlot] = captureSnapshot();
    }
    if (ChimeRack && ChimeRack.refresh) ChimeRack.refresh();
    bump();
  }

  // Apply an AgentCore.validatePatch()-normalized patch to the live UI.
  function applyNormalizedPatch(np) {
    if (!np || typeof np !== 'object') return;
    var needsParamSync = false, needsHudSync = false, needsMagSync = false, phaseDeg = null;

    // Precedence: preset first (re-bases formulas/params/hints/toggles), then overrides.
    if (np.preset != null) {
      applyPresetRebase(np.preset);
    }
    if (np.tab != null) setActiveTab(np.tab);
    if (np.slot != null && np.slot !== state.activeSlot) selectSlot(np.slot);

    if (np.staticMode != null) {
      state.staticMode = !!np.staticMode;
      state.toggles.animate = !np.staticMode;
      state.toggles.autoRotate = !np.staticMode;
      needsHudSync = true;
    }
    if (np.animate != null) { state.toggles.animate = !!np.animate; needsHudSync = true; }
    if (np.autoRotate != null) { state.toggles.autoRotate = !!np.autoRotate; needsHudSync = true; }
    if (np.playT != null) {
      state.playT = Engine.clamp(Number(np.playT), 0, 1);
      // A deeplink `pt` implies a frozen frame unless `anim` explicitly overrides.
      if (np.animate == null) { state.toggles.animate = false; needsHudSync = true; }
    }
    if (np.twinMode != null) setTwinMode(np.twinMode);
    if (np.bitSource != null) setBitSourceUI(np.bitSource);
    if (np.magZoom != null) { state.magZoom = Number(np.magZoom); needsMagSync = true; }
    if (np.magFocus != null) { state.magFocus = np.magFocus; needsMagSync = true; }

    if (np.formulas) {
      ['x', 'y', 'z'].forEach(function (axis) {
        if (np.formulas[axis] == null) return;
        var expr = String(np.formulas[axis]);
        state.formulas[axis] = expr;
        var inp = $('formula' + axis.toUpperCase());
        if (inp) { inp.value = expr; inp.classList.remove('invalid'); }
        var err = $('err' + axis.toUpperCase());
        if (err) err.textContent = '';
      });
    }

    if (np.inputs) {
      for (var key in np.inputs) {
        if (!hasOwn(np.inputs, key)) continue;
        if (key === 'phaseDeg') { phaseDeg = Number(np.inputs[key]); continue; }
        if (['r', 'rIn', 'amp', 'f', 'K', 'orderN', 'a', 'b', 'n', 'm', 'k'].indexOf(key) >= 0) {
          state[key] = Number(np.inputs[key]);
          needsParamSync = true;
        }
      }
    }

    if (np.toggles) {
      for (var tk in np.toggles) {
        if (!hasOwn(np.toggles, tk)) continue;
        state.toggles[tk] = !!np.toggles[tk];
      }
      needsHudSync = true;
    }

    if (needsParamSync) syncParamUI();
    if (phaseDeg != null) setPhaseFromDeg(phaseDeg);
    if (ModMatrix && typeof ModMatrix.captureBase === 'function') ModMatrix.captureBase(state);
    if (needsHudSync) syncHudToggles();
    if (needsMagSync) syncMagChips();
    bump();
  }

  function applyAgentPatch(patch) {
    try {
      if (!AgentCore || typeof AgentCore.validatePatch !== 'function' ||
          typeof AgentCore.changedKeys !== 'function') {
        return agentFailure('E_INTERNAL', 'agent core (js/agent-core.js) is not loaded');
      }
      if (patch === undefined || patch === null) patch = {};
      if (typeof patch !== 'object' || Object.prototype.toString.call(patch) === '[object Array]') {
        return agentFailure('E_BAD_ARGS', 'patch must be a plain object',
          'e.g. window.ramanujanSphere.setState({ tab: "harmonics" })');
      }
      var v = AgentCore.validatePatch(patch);
      if (!v || v.ok !== true) {
        return {
          ok: false,
          error: (v && v.error) ? v.error : { code: 'E_BAD_ARGS', message: 'invalid patch' },
          state: buildUiState()
        };
      }
      var np = v.patch || {};
      var changed = [];
      try { changed = AgentCore.changedKeys(state, presetIndexNow(), np) || []; }
      catch (e) { changed = ['?']; }
      // True no-op: apply nothing, bump nothing, publish no change event.
      if (changed.length === 0) {
        return { ok: true, state: buildUiState(), warnings: v.warnings || [] };
      }
      suppressAgentPublish = true;
      try { applyNormalizedPatch(np); } finally { suppressAgentPublish = false; }
      publishAgent();
      return { ok: true, state: buildUiState(), warnings: v.warnings || [] };
    } catch (e) {
      return agentFailure('E_INTERNAL', 'patch application failed');
    }
  }

  // Reset to the contract default state: preset 12, scopes tab, default toggles, playT 0.
  function resetAgentState() {
    suppressAgentPublish = true;
    try {
      var d = (AgentCore && typeof AgentCore.defaultState === 'function') ? AgentCore.defaultState() : null;
      var targetPreset = (d && d.presetIndex != null) ? d.presetIndex : 12;
      applyPreset(targetPreset);
      if (d) {
        ['r', 'rIn', 'amp', 'f', 'K', 'orderN', 'a', 'b', 'n', 'm', 'k'].forEach(function (k) {
          if (typeof d[k] === 'number') state[k] = d[k];
        });
        if (d.formulas) {
          ['x', 'y', 'z'].forEach(function (axis) {
            if (d.formulas[axis] != null) state.formulas[axis] = String(d.formulas[axis]);
          });
        }
        if (d.phaseDeg != null) setPhaseFromDeg(d.phaseDeg);
        if (d.twinMode) setTwinMode(d.twinMode);
        if (d.bitSource) setBitSourceUI(d.bitSource);
        if (typeof d.magZoom === 'number') state.magZoom = d.magZoom;
        if (d.magFocus) state.magFocus = d.magFocus;
        if (d.toggles) {
          for (var tk in d.toggles) {
            if (hasOwn(d.toggles, tk)) state.toggles[tk] = !!d.toggles[tk];
          }
        }
      }
      // Page-level static mode stays frozen; otherwise default is playing + orbiting.
      state.toggles.animate = agentStaticMode() ? false : true;
      state.toggles.autoRotate = agentStaticMode() ? false : true;
      // contract §6 reset(): defaultState() equivalent — staticMode false.
      state.staticMode = false;
      state.playT = 0;
      state.activeSlot = 'A';
      state.ghostSlot = '';
      state.ghostPoints = [];
      state.ghostRev = (state.ghostRev || 0) + 1;
      if (typeof setAutoMode === 'function') {
        setAutoMode('orderN', 'off', true);
        setAutoMode('phase', 'off', true);
      }
      if (ModMatrix && typeof ModMatrix.clearRoutes === 'function') {
        ModMatrix.clearRoutes();
      }
      state.toggles.floorWt = false;
      if (FloorView && typeof FloorView.stopAudio === 'function') FloorView.stopAudio();
      if (typeof syncFloorUI === 'function') syncFloorUI();
      if (typeof setTheatreMode === 'function' && !IS_POPOUT) {
        setTheatreMode(false);
      }
      setActiveTab('scopes');
      syncParamUI();
      if (ModMatrix && typeof ModMatrix.captureBase === 'function') ModMatrix.captureBase(state);
      syncHudToggles();
      syncMagChips();
      if (window.Harmony && Harmony.Lissajous2D && Harmony.Lissajous2D.clearTrail) {
        Harmony.Lissajous2D.clearTrail();
      }
      slots = null;
      initSlots();
      bump();
    } finally {
      suppressAgentPublish = false;
    }
    publishAgent();
    return buildUiState();
  }

  // Mount-time deeplink parsing (contract §4). AgentCore.parseDeeplink returns
  // { presetIndex, patch, warnings } where `patch` is ALREADY NORMALIZED
  // (staticMode/playT/twinMode/inputs/toggles/...). It is applied directly:
  // the parser is tolerant, so a bad link never crashes the page.
  function parseMountDeeplink() {
    if (!AgentCore || typeof AgentCore.parseDeeplink !== 'function') return null;
    try {
      var parsed = AgentCore.parseDeeplink(location.search || location.href);
      if (!parsed || parsed.ok === false) return null;
      return parsed;
    } catch (e) {
      return null;
    }
  }

  function patchHasKeys(patch) {
    if (!patch || typeof patch !== 'object') return false;
    for (var k in patch) { if (hasOwn(patch, k)) return true; }
    return false;
  }


  // ---- Declarative Parameter Schema ----
  var PARAM_DEFS = [
    { id: 'radius',      out: 'radiusOut',      key: 'r',      fmt: function (v) { return v.toFixed(2); } },
    { id: 'innerRadius', out: 'innerRadiusOut', key: 'rIn',    fmt: function (v) { return v.toFixed(2); } },
    { id: 'orderN',      out: 'orderNOut',      key: 'orderN', fmt: function (v) { return String(Math.round(v)); } },
    { id: 'amp',         out: 'ampOut',         key: 'amp',    fmt: function (v) { return v.toFixed(2); } },
    { id: 'freq',        out: 'freqOut',        key: 'f',      fmt: function (v) { return v.toFixed(1); } },
    { id: 'harmonicsK',  out: 'harmonicsKOut',  key: 'K',      fmt: function (v) { return String(Math.round(v)); } },
    { id: 'fractalA',    out: 'fractalAOut',    key: 'a',      fmt: function (v) { return v.toFixed(2); } },
    { id: 'fractalB',    out: 'fractalBOut',    key: 'b',      fmt: function (v) { return String(Math.round(v)); } },
    { id: 'ratioN',      out: 'ratioNOut',      key: 'n',      fmt: function (v) { return String(Math.round(v)); } },
    { id: 'ratioM',      out: 'ratioMOut',      key: 'm',      fmt: function (v) { return String(Math.round(v)); } },
    { id: 'ratioK',      out: 'ratioKOut',      key: 'k',      fmt: function (v) { return String(Math.round(v)); } }
  ];

  function updateOrderNBadge() {
    var badge = $('orderNBadge');
    if (!badge) return;
    var N = Math.round(state.orderN || 19);
    var stride = Math.max(1, Math.round(state.n || 1));
    var g = Engine.gcd(stride, N);
    var sub = Math.floor(N / g);
    var prime = Engine.isPrimeInt(N);
    if (prime) {
      badge.textContent = 'prime';
      badge.dataset.hintDetail = sub + '/' + N + ' · prime N (stride ' + stride + ')';
      badge.removeAttribute('title');
      badge.style.color = '#ffb04d';
      badge.style.background = 'rgba(255, 176, 77, 0.14)';
    } else if (g === 1) {
      badge.textContent = 'coprime';
      badge.dataset.hintDetail = sub + '/' + N + ' · coprime (stride ' + stride + ')';
      badge.removeAttribute('title');
      badge.style.color = '#6ee7a0';
      badge.style.background = 'rgba(110, 231, 160, 0.12)';
    } else {
      badge.textContent = 'sub/' + g;
      badge.dataset.hintDetail = sub + '/' + N + ' · subgroup gcd(' + stride + ',' + N + ')=' + g;
      badge.removeAttribute('title');
      badge.style.color = '#ff8c98';
      badge.style.background = 'rgba(255, 107, 122, 0.14)';
    }
  }

  function updateShellReadout(changedKey) {
    if (state.lockVolume && Engine.solveConstantVolumeR) {
      if (changedKey === 'rIn') {
        var newR = Engine.clamp(Engine.solveConstantVolumeR(state.rIn, state.lockedR0), 0.3, 2.6);
        state.r = newR;
        if ($('radius')) $('radius').value = newR;
        if ($('radiusOut')) $('radiusOut').textContent = newR.toFixed(2);
      } else if (changedKey === 'r') {
        if (state.r < state.lockedR0) {
          state.lockedR0 = state.r;
          state.rIn = 0;
        } else {
          state.rIn = Engine.clamp(Engine.solveConstantVolumeRIn(state.r, state.lockedR0), 0, Math.min(2.4, state.r));
        }
        if ($('innerRadius')) $('innerRadius').value = state.rIn;
        if ($('innerRadiusOut')) $('innerRadiusOut').textContent = state.rIn.toFixed(2);
      }
    }

    if (state.rIn > state.r) {
      state.rIn = state.r;
      if ($('innerRadius')) $('innerRadius').value = state.rIn;
      if ($('innerRadiusOut')) $('innerRadiusOut').textContent = state.rIn.toFixed(2);
    }

    var m = Engine.shellMetrics(state);
    if ($('shellVolOut')) $('shellVolOut').textContent = m.volShell.toFixed(2);
    if ($('shellWallOut')) $('shellWallOut').textContent = m.thickness.toFixed(2);

    if (Engine.sphereResonance) {
      var res = Engine.sphereResonance(state, state.playT);
      if ($('shellRingAreaOut')) $('shellRingAreaOut').textContent = res.ringAreaConst.toFixed(2);
      if ($('btnLockVol')) $('btnLockVol').classList.toggle('active', !!state.lockVolume);
      if ($('shellFormulaBadge')) {
        $('shellFormulaBadge').innerHTML = state.lockVolume
          ? 'V&#8320; LOCKED &middot; dR/dr=&eta;&sup2;'
          : '4/3&pi;(R&sup3;&minus;r&sup3;)';
      }
      if ($('modEtaOut')) $('modEtaOut').textContent = res.eta.toFixed(2);
      if ($('modStretchOut')) {
        $('modStretchOut').textContent = res.cavityActive
          ? (res.stretchRatio.toFixed(2) + '×')
          : '∞';
      }
      var syzEl = $('syzygyBadge');
      if (syzEl) {
        var centsStr = (res.syzygy.detuneCents >= 0 ? '+' : '') + res.syzygy.detuneCents.toFixed(1) + '¢';
        if (!res.cavityActive) {
          syzEl.textContent = 'solid';
          syzEl.dataset.hintDetail = 'Solid Ball (r = 0) · OSC B Off';
          syzEl.removeAttribute('title');
          syzEl.classList.remove('locked');
        } else if (res.bowHalfPowerLock) {
          syzEl.textContent = '−3dB';
          syzEl.dataset.hintDetail = '−3 dB Bow Tangency (η ≈ 0.707)';
          syzEl.removeAttribute('title');
          syzEl.classList.add('locked');
        } else if (res.syzygy.tripleLock) {
          syzEl.textContent = res.syzygy.triadText + ' ★';
          syzEl.dataset.hintDetail = 'Triple Lock ' + res.syzygy.triadText + ' · ' + res.syzygy.ratioText + ' ' + res.syzygy.intervalName + ' (' + centsStr + ')';
          syzEl.removeAttribute('title');
          syzEl.classList.add('locked');
        } else {
          syzEl.textContent = res.syzygy.locked ? (res.syzygy.ratioText + ' ★') : 'beat';
          syzEl.dataset.hintDetail = 'Modes ' + res.syzygy.triadText + ' · ' + res.syzygy.ratioText + ' ' + res.syzygy.intervalName + ' (' + centsStr + ')';
          syzEl.removeAttribute('title');
          syzEl.classList.toggle('locked', !!res.syzygy.locked);
        }
      }
      document.querySelectorAll('.snap-chip[data-eta]').forEach(function (chip) {
        var targetEta = parseFloat(chip.getAttribute('data-eta'));
        chip.classList.toggle('active', Math.abs(res.eta - targetEta) <= 0.0085);
      });
    }
    document.querySelectorAll('.route-chip[data-stretch]').forEach(function (chip) {
      chip.classList.toggle('active', chip.getAttribute('data-stretch') === (state.stretchMode || 'off'));
    });

    updateOrderNBadge();
  }

  function syncParamUI() {
    PARAM_DEFS.forEach(function (d) {
      var el = $(d.id), out = $(d.out);
      if (el && state[d.key] != null) {
        el.value = state[d.key];
        if (out) out.textContent = d.fmt(state[d.key]);
      }
    });
    if ($('theatreOrderN') && state.orderN != null) {
      $('theatreOrderN').value = Math.round(state.orderN);
      if ($('theatreOrderNOut')) $('theatreOrderNOut').textContent = String(Math.round(state.orderN));
    }
    if ($('harmTabKOut')) $('harmTabKOut').textContent = String(Math.round(state.K));
    updateShellReadout();
  }

  PARAM_DEFS.forEach(function (d) {
    var el = $(d.id), out = $(d.out);
    if (!el) return;
    el.addEventListener('input', function () {
      var v = parseFloat(el.value);
      state[d.key] = v;
      if (out) out.textContent = d.fmt(v);
      if (d.key === 'K' && $('harmTabKOut')) $('harmTabKOut').textContent = d.fmt(v);
      if (d.key === 'r' || d.key === 'rIn') updateShellReadout(d.key);
      if (d.key === 'orderN') {
        if (!state.toggles.strobeN) {
          state.toggles.strobeN = true;
          syncHudToggles();
        }
        if ($('theatreOrderN')) $('theatreOrderN').value = Math.round(v);
        if ($('theatreOrderNOut')) $('theatreOrderNOut').textContent = String(Math.round(v));
        if (autoLanes && autoLanes.orderN) autoLanes.orderN.acc = 0;
        updateOrderNBadge();
      }
      if (d.key === 'n') updateOrderNBadge();
      if (ModMatrix && typeof ModMatrix.captureBase === 'function') {
        ModMatrix.captureBase(state, d.key);
        if (d.key === 'r' || d.key === 'rIn') {
          ModMatrix.captureBase(state, 'r');
          ModMatrix.captureBase(state, 'rIn');
        }
      }
      bump();
    });
    // Double-click any slider to reset cleanly to its preset default
    el.addEventListener('dblclick', function () {
      var def = parseFloat(el.getAttribute('data-default'));
      if (!isNaN(def)) {
        el.value = def;
        el.dispatchEvent(new Event('input'));
      }
    });
  });

  // ---- §§1-3 Lock-V Constant-Volume Time-Stretch, Syzygy Snaps & Stretch Mod Coupling ----
  function setLockVolumeMode(nextLocked) {
    state.lockVolume = !!nextLocked;
    if (state.lockVolume) {
      var r3 = state.r * state.r * state.r;
      var rin3 = (state.rIn || 0) * (state.rIn || 0) * (state.rIn || 0);
      state.lockedR0 = Engine.cbrt(Math.max(0.01, r3 - rin3));
    }
    updateShellReadout();
    bump();
  }
  if ($('btnLockVol')) {
    $('btnLockVol').addEventListener('click', function () {
      setLockVolumeMode(!state.lockVolume);
    });
  }

  document.querySelectorAll('.snap-chip[data-eta]').forEach(function (chip) {
    chip.addEventListener('click', function () {
      var targetEta = parseFloat(chip.getAttribute('data-eta'));
      if (!isFinite(targetEta)) return;
      if (state.lockVolume && Engine.solveConstantVolumePairForEta) {
        var pair = Engine.solveConstantVolumePairForEta(targetEta, state.lockedR0);
        state.r = Engine.clamp(pair.R, 0.3, 2.6);
        state.rIn = Engine.clamp(pair.rIn, 0, Math.min(2.4, state.r));
      } else {
        state.rIn = Engine.clamp(state.r * targetEta, 0, Math.min(2.4, state.r));
      }
      if (ModMatrix && typeof ModMatrix.captureBase === 'function') {
        ModMatrix.captureBase(state, 'r');
        ModMatrix.captureBase(state, 'rIn');
      }
      syncParamUI();
      bump();
    });
  });

  document.querySelectorAll('.route-chip[data-stretch]').forEach(function (chip) {
    chip.addEventListener('click', function () {
      state.stretchMode = chip.getAttribute('data-stretch') || 'off';
      updateShellReadout();
      bump();
    });
  });

  function setArchimedesSliceZ(val) {
    state.archimedesAuto = false;
    if ($('btnArchAuto')) $('btnArchAuto').classList.remove('active');
    state.archimedesZNorm = Engine.clamp(parseFloat(val) || 0, -1, 1);
    if ($('archimedesZSlider')) $('archimedesZSlider').value = state.archimedesZNorm.toFixed(2);
    if ($('rackSliceZ')) $('rackSliceZ').value = state.archimedesZNorm.toFixed(2);
    if ($('rackSliceZOut')) {
      $('rackSliceZOut').textContent = (state.archimedesZNorm >= 0 ? '+' : '') + state.archimedesZNorm.toFixed(2);
    }
    if (ModMatrix && typeof ModMatrix.captureBase === 'function') {
      ModMatrix.captureBase(state, 'archimedesZNorm');
    }
    bump();
  }

  if ($('btnArchAuto')) {
    $('btnArchAuto').addEventListener('click', function () {
      state.archimedesAuto = !state.archimedesAuto;
      $('btnArchAuto').classList.toggle('active', !!state.archimedesAuto);
      bump();
    });
  }
  if ($('archimedesZSlider')) {
    $('archimedesZSlider').addEventListener('input', function () {
      setArchimedesSliceZ($('archimedesZSlider').value);
    });
  }
  if ($('rackSliceZ')) {
    $('rackSliceZ').addEventListener('input', function () {
      setArchimedesSliceZ($('rackSliceZ').value);
    });
    $('rackSliceZ').addEventListener('dblclick', function () {
      setArchimedesSliceZ(0);
    });
  }

  // ---- Phase Controls ----
  function setPhaseFromDeg(deg, silentAgent) {
    deg = parseFloat(deg);
    if (!isFinite(deg)) deg = 0;
    deg = Engine.clamp(deg, -180, 180);
    state.phaseRad = deg * Math.PI / 180;
    var disp = Math.round(deg);
    $('phaseSlider').value = disp;
    if (!silentAgent || document.activeElement !== $('phaseDeg')) {
      $('phaseDeg').value = disp;
    }
    $('phaseOut').textContent = disp + '°';
    $('phaseRad').textContent = state.phaseRad.toFixed(4) + ' rad';
    if ($('theatrePhase')) $('theatrePhase').value = disp;
    if ($('theatrePhaseOut')) $('theatrePhaseOut').textContent = disp + '°';
    if (silentAgent) {
      bumpAnimated();
    } else {
      if (autoLanes && autoLanes.phase) autoLanes.phase.cursor = deg;
      if (ModMatrix && typeof ModMatrix.captureBase === 'function') ModMatrix.captureBase(state, 'phaseDeg');
      bump();
    }
  }
  $('phaseSlider').addEventListener('input', function () { setPhaseFromDeg($('phaseSlider').value); });
  $('phaseDeg').addEventListener('input', function () { setPhaseFromDeg($('phaseDeg').value); });
  $('phaseSlider').addEventListener('dblclick', function () {
    setPhaseFromDeg(parseFloat($('phaseSlider').getAttribute('data-default')) || 0);
  });

  // ---- Ping-Pong & Repeat Automation for Order N and Phase ----
  var autoLanes = {
    orderN: {
      key: 'orderN',
      min: 5,
      max: 64,
      isInt: true,
      mode: 'off',       // 'off' | 'pingpong' | 'repeat'
      running: true,
      start: 10,
      end: 48,
      speed: 4,
      dir: 1,
      acc: 0,
      cursor: 19,
      customized: false,
      draggingUser: false,
      sliderId: 'orderN',
      markersId: 'orderNMarkers',
      barId: 'orderNAutoBar',
      playId: 'orderNAutoPlay',
      startId: 'orderNStart',
      endId: 'orderNEnd',
      endDotId: 'orderNEndDot',
      arrowId: 'orderNAutoArrow',
      speedId: 'orderNSpeed',
      getValue: function () { return Math.round(state.orderN || 19); },
      setValue: function (val, silent) {
        var iv = Math.round(Engine.clamp(val, 5, 64));
        state.orderN = iv;
        $('orderN').value = iv;
        $('orderNOut').textContent = String(iv);
        if ($('theatreOrderN')) $('theatreOrderN').value = iv;
        if ($('theatreOrderNOut')) $('theatreOrderNOut').textContent = String(iv);
        updateOrderNBadge();
        if (silent) bumpAnimated(); else bump();
      }
    },
    phase: {
      key: 'phase',
      min: -180,
      max: 180,
      isInt: false,
      mode: 'off',
      running: true,
      start: -180,
      end: 180,
      speed: 60,
      dir: 1,
      acc: 0,
      cursor: 0,
      customized: false,
      draggingUser: false,
      sliderId: 'phaseSlider',
      markersId: 'phaseMarkers',
      barId: 'phaseAutoBar',
      playId: 'phaseAutoPlay',
      startId: 'phaseStart',
      endId: 'phaseEnd',
      endDotId: 'phaseEndDot',
      arrowId: 'phaseAutoArrow',
      speedId: 'phaseSpeed',
      getValue: function () { return (state.phaseRad || 0) * 180 / Math.PI; },
      setValue: function (val, silent) { setPhaseFromDeg(val, silent); }
    }
  };

  function trackPercentCss(lane, val) {
    var p = Engine.clamp((val - lane.min) / (lane.max - lane.min), 0, 1);
    return 'calc(' + (p * 100).toFixed(4) + '% + ' + (8 - p * 16).toFixed(2) + 'px)';
  }

  function syncAutoLaneUI(lane) {
    var active = lane.mode !== 'off';
    var markersEl = $(lane.markersId);
    var barEl = $(lane.barId);
    var playBtn = $(lane.playId);
    var startEl = $(lane.startId);
    var endEl = $(lane.endId);
    var endDot = $(lane.endDotId);
    var arrowEl = $(lane.arrowId);
    var speedEl = $(lane.speedId);

    document.querySelectorAll('.auto-pill[data-auto-target="' + lane.key + '"]').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-auto-mode') === lane.mode);
    });
    if (barEl) barEl.hidden = !active;
    if (markersEl) {
      markersEl.hidden = !active;
      markersEl.classList.toggle('mode-pingpong', lane.mode === 'pingpong');
      markersEl.classList.toggle('mode-repeat', lane.mode === 'repeat');
      markersEl.classList.toggle('dir-rev', lane.end < lane.start);
      if (active) {
        var lo = Math.min(lane.start, lane.end);
        var hi = Math.max(lane.start, lane.end);
        var pLo = Engine.clamp((lo - lane.min) / (lane.max - lane.min), 0, 1);
        var pHi = Engine.clamp((hi - lane.min) / (lane.max - lane.min), 0, 1);
        var band = markersEl.querySelector('.auto-band');
        var mStart = markersEl.querySelector('.marker-start');
        var mEnd = markersEl.querySelector('.marker-end');
        if (band) {
          band.style.left = trackPercentCss(lane, lo);
          band.style.width = 'calc(' + ((pHi - pLo) * 100).toFixed(4) + '% - ' + ((pHi - pLo) * 16).toFixed(2) + 'px)';
        }
        if (mStart) mStart.style.left = trackPercentCss(lane, lane.start);
        if (mEnd) mEnd.style.left = trackPercentCss(lane, lane.end);
      }
    }
    if (playBtn) {
      playBtn.classList.toggle('active', lane.running);
      playBtn.innerHTML = lane.running ? '&#10074;&#10074;' : '&#9654;';
    }
    if (startEl && document.activeElement !== startEl) startEl.value = String(lane.start);
    if (endEl && document.activeElement !== endEl) endEl.value = String(lane.end);
    if (endDot) {
      endDot.classList.toggle('green', lane.mode !== 'repeat');
      endDot.classList.toggle('red', lane.mode === 'repeat');
    }
    if (arrowEl) {
      arrowEl.textContent = lane.mode === 'repeat' ? '→' : '↔';
    }
    if (speedEl) speedEl.value = String(lane.speed);
  }

  function setAutoMode(key, mode, quiet) {
    var lane = autoLanes[key];
    if (!lane) return;
    if (IS_POPOUT && hasOpenerSync && window.opener && !window.opener.closed && !isApplyingRemoteSync) {
      sendPopoutCommand('autoMode', { key: key, mode: mode });
      return;
    }
    var wasOff = lane.mode === 'off';
    var nextMode = (lane.mode === mode) ? 'off' : mode;
    lane.mode = nextMode;
    if (nextMode !== 'off') {
      lane.running = true;
      lane.acc = 0;
      if (wasOff && !lane.customized && key === 'orderN') {
        var curN = lane.getValue();
        lane.start = Math.max(lane.min, Math.min(10, curN));
        lane.end = Math.min(lane.max, Math.max(48, curN));
      }
      var lo = Math.min(lane.start, lane.end);
      var hi = Math.max(lane.start, lane.end);
      var cur = lane.getValue();
      if (cur < lo || cur > hi) {
        cur = lane.start;
        lane.setValue(cur, true);
      }
      lane.cursor = cur;
      lane.dir = (lane.end >= lane.start) ? 1 : -1;
      if (cur >= hi) lane.dir = -1;
      else if (cur <= lo) lane.dir = 1;
      if (key === 'orderN' && !state.toggles.strobeN && !quiet) {
        state.toggles.strobeN = true;
        syncHudToggles();
        bump();
      }
    } else if (!quiet) {
      publishAgent();
    }
    syncAutoLaneUI(lane);
  }

  function stepAutoLane(lane, dt) {
    if (!lane || lane.mode === 'off' || !lane.running || lane.draggingUser) return false;
    var lo = Math.min(lane.start, lane.end);
    var hi = Math.max(lane.start, lane.end);
    if (lane.isInt) {
      lane.acc += dt * lane.speed;
      var steps = Math.floor(lane.acc);
      if (steps <= 0) return false;
      lane.acc -= steps;
      steps = Math.min(steps, 16);
      var cur = lane.getValue();
      var orig = cur;
      if (lo === hi) {
        cur = lo;
      } else if (lane.mode === 'pingpong') {
        for (var i = 0; i < steps; i++) {
          if (cur < lo || cur > hi) {
            cur = Engine.clamp(cur, lo, hi);
          } else {
            var next = cur + lane.dir;
            if (next > hi) { lane.dir = -1; next = hi - 1; }
            else if (next < lo) { lane.dir = 1; next = lo + 1; }
            cur = Engine.clamp(next, lo, hi);
          }
        }
      } else {
        var rDir = lane.end >= lane.start ? 1 : -1;
        for (var j = 0; j < steps; j++) {
          if ((rDir > 0 && (cur < lane.start || cur >= lane.end)) ||
              (rDir < 0 && (cur > lane.start || cur <= lane.end))) {
            cur = lane.start;
          } else {
            cur += rDir;
          }
        }
      }
      if (cur !== orig) {
        lane.setValue(cur, true);
        return true;
      }
      return false;
    }

    var span = hi - lo;
    if (span <= 0) {
      if (Math.abs(lane.cursor - lo) > 1e-4) {
        lane.cursor = lo;
        lane.setValue(lo, true);
        return true;
      }
      return false;
    }
    if (lane.mode === 'pingpong') {
      var c = lane.cursor + lane.dir * lane.speed * dt;
      for (var g = 0; g < 8 && (c > hi || c < lo); g++) {
        if (c > hi) { c = hi - (c - hi); lane.dir = -1; }
        else if (c < lo) { c = lo + (lo - c); lane.dir = 1; }
      }
      lane.cursor = Engine.clamp(c, lo, hi);
    } else {
      var delta = lane.end - lane.start;
      var sDir = delta >= 0 ? 1 : -1;
      var nextC = lane.cursor + sDir * lane.speed * dt;
      if (sDir > 0 && nextC > lane.end) {
        nextC = lane.start + ((nextC - lane.end) % Math.abs(delta));
      } else if (sDir < 0 && nextC < lane.end) {
        nextC = lane.start - ((lane.end - nextC) % Math.abs(delta));
      }
      lane.cursor = Engine.clamp(nextC, lo, hi);
    }
    lane.setValue(lane.cursor, true);
    return true;
  }

  function bindAutoLaneControls(lane) {
    var slider = $(lane.sliderId);
    var markersEl = $(lane.markersId);
    var playBtn = $(lane.playId);
    var startEl = $(lane.startId);
    var endEl = $(lane.endId);
    var speedEl = $(lane.speedId);

    if (slider) {
      slider.addEventListener('pointerdown', function () { lane.draggingUser = true; });
      window.addEventListener('pointerup', function () {
        if (lane.draggingUser) {
          lane.draggingUser = false;
          lane.cursor = lane.getValue();
        }
      });
    }
    if (playBtn) {
      playBtn.addEventListener('click', function () {
        lane.running = !lane.running;
        lane.acc = 0;
        syncAutoLaneUI(lane);
      });
    }
    function applyBound(which, raw) {
      var v = parseFloat(raw);
      if (!isFinite(v)) return;
      v = Math.round(Engine.clamp(v, lane.min, lane.max));
      lane[which] = v;
      lane.customized = true;
      var lo = Math.min(lane.start, lane.end);
      var hi = Math.max(lane.start, lane.end);
      var cur = lane.getValue();
      if (cur < lo || cur > hi) {
        var clamped = Engine.clamp(cur, lo, hi);
        lane.cursor = clamped;
        lane.setValue(clamped, false);
      }
      syncAutoLaneUI(lane);
    }
    if (startEl) startEl.addEventListener('change', function () { applyBound('start', startEl.value); });
    if (endEl) endEl.addEventListener('change', function () { applyBound('end', endEl.value); });
    if (speedEl) {
      speedEl.addEventListener('change', function () {
        var s = parseFloat(speedEl.value);
        if (isFinite(s) && s > 0) lane.speed = s;
      });
    }
    if (markersEl && slider) {
      markersEl.querySelectorAll('.auto-marker[data-handle]').forEach(function (handleEl) {
        handleEl.addEventListener('pointerdown', function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
          var which = handleEl.getAttribute('data-handle');
          function updateFromClientX(clientX) {
            var rect = slider.getBoundingClientRect();
            var usableLeft = rect.left + 8;
            var usableWidth = Math.max(1, rect.width - 16);
            var p = Engine.clamp((clientX - usableLeft) / usableWidth, 0, 1);
            var val = Math.round(lane.min + p * (lane.max - lane.min));
            applyBound(which, val);
          }
          function onMove(moveEv) { updateFromClientX(moveEv.clientX); }
          function onUp() {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onUp);
          }
          updateFromClientX(ev.clientX);
          window.addEventListener('pointermove', onMove);
          window.addEventListener('pointerup', onUp);
          window.addEventListener('pointercancel', onUp);
        });
      });
    }
    syncAutoLaneUI(lane);
  }

  bindAutoLaneControls(autoLanes.orderN);
  bindAutoLaneControls(autoLanes.phase);
  document.querySelectorAll('.auto-pill[data-auto-target]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      setAutoMode(btn.getAttribute('data-auto-target'), btn.getAttribute('data-auto-mode'));
    });
  });

  // ---- Formula Patch Bay ----
  function debounce(fn, ms) {
    var timer;
    return function () {
      var args = arguments, self = this;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  }

  function bindFormula(inputId, errId, axis) {
    var input = $(inputId), errEl = $(errId);
    var apply = debounce(function () {
      var expr = input.value;
      var bad = Engine.validate(expr);
      if (bad) {
        errEl.textContent = bad;
        input.classList.add('invalid');
      } else {
        errEl.textContent = '';
        input.classList.remove('invalid');
        state.formulas[axis] = expr;
        bump();
      }
    }, 140);
    input.addEventListener('input', apply);
  }
  bindFormula('formulaX', 'errX', 'x');
  bindFormula('formulaY', 'errY', 'y');
  bindFormula('formulaZ', 'errZ', 'z');

  // ----HUD Toggle Pills, Twin Segmented Bar, Camera & Magnifier Controls ----
  function syncHudToggles() {
    var btns = document.querySelectorAll('.hud-pill[data-toggle]');
    for (var i = 0; i < btns.length; i++) {
      var key = btns[i].getAttribute('data-toggle');
      btns[i].classList.toggle('active', !!state.toggles[key]);
    }
    var playBtn = $('btnPlay');
    if (playBtn) {
      playBtn.innerHTML = state.toggles.animate ? '&#9654; Animate' : '&#10074;&#10074; Paused';
    }
    var magWidget = $('magWidget');
    if (magWidget) {
      magWidget.hidden = !state.toggles.magnifier;
    }
    var fbWidget = $('fourBitWidget');
    if (fbWidget) {
      fbWidget.hidden = !state.toggles.fourBitOrbit;
    }
    var resWidget = $('resonanceWidget');
    if (resWidget) {
      resWidget.hidden = !state.toggles.resonanceMode;
      resWidget.classList.toggle('shift-left', !!state.toggles.magnifier);
    }
    if (document.body) {
      document.body.classList.toggle('harmor-void', !!state.toggles.harmorVoid);
    }
    var qBtn = $('btnQuadrayTetra');
    if (qBtn) {
      qBtn.classList.toggle('active', state.toggles.quadrayTetra !== false);
    }
    var refBtn = $('btnRefWaves');
    if (refBtn) {
      refBtn.classList.toggle('active', !!state.toggles.refWaves);
    }
    if (typeof syncFloorUI === 'function') syncFloorUI();
  }

  document.querySelectorAll('.hud-pill[data-toggle]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var key = btn.getAttribute('data-toggle');
      if (IS_POPOUT && hasOpenerSync && window.opener && !window.opener.closed && !isApplyingRemoteSync) {
        sendPopoutCommand('toggle', key);
        return;
      }
      state.toggles[key] = !state.toggles[key];
      if (key === 'floorWt' && state.toggles.floorWt && !state.toggles.cutaway) {
        state.toggles.cutaway = true;
      }
      syncHudToggles();
      bump();
    });
  });

  document.querySelectorAll('.cam-btn[data-cam]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var cam = btn.getAttribute('data-cam');
      Scene3D.setCameraView(cam, state);
      syncHudToggles();
      bump();
    });
  });

  if ($('btnQuadrayTetra')) {
    $('btnQuadrayTetra').addEventListener('click', function () {
      state.toggles.quadrayTetra = state.toggles.quadrayTetra === false;
      syncHudToggles();
      bump();
    });
  }

  function setTwinMode(mode) {
    state.twinMode = mode;
    state.toggles.syzygy = (mode !== 'off');
    document.querySelectorAll('.seg-btn[data-twin]').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-twin') === mode);
    });
    bump();
  }
  document.querySelectorAll('.seg-btn[data-twin]').forEach(function (btn) {
    btn.addEventListener('click', function () { setTwinMode(btn.getAttribute('data-twin')); });
  });

  // Magnifier zoom & focus chips
  function syncMagChips() {
    document.querySelectorAll('.mag-chip[data-zoom]').forEach(function (b) {
      b.classList.toggle('active', parseInt(b.getAttribute('data-zoom'), 10) === state.magZoom);
    });
    document.querySelectorAll('.mag-chip[data-focus]').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-focus') === state.magFocus);
    });
  }
  document.querySelectorAll('.mag-chip[data-zoom]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      state.magZoom = parseInt(btn.getAttribute('data-zoom'), 10);
      syncMagChips();
      bump();
    });
  });
  document.querySelectorAll('.mag-chip[data-focus]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      state.magFocus = btn.getAttribute('data-focus');
      syncMagChips();
      bump();
    });
  });

  // Dock Tabs
  function setActiveTab(tabId) {
    if (tabId !== 'guide') lastNonGuideTab = tabId;
    state.activeTab = tabId;
    // Automation/UX hook: lets CSS give the Agent/Mod/Guide dock its extra height (additive).
    if (document.body) document.body.setAttribute('data-agent-active-tab', tabId);
    if ($('btnThesis')) $('btnThesis').classList.toggle('active', tabId === 'guide');
    document.querySelectorAll('.dock-tab[data-tab]').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-tab') === tabId);
    });
    document.querySelectorAll('.dock-pane').forEach(function (pane) {
      pane.classList.toggle('active', pane.id === 'tab-' + tabId);
    });
    bump();
  }
  document.querySelectorAll('.dock-tab[data-tab]').forEach(function (btn) {
    btn.addEventListener('click', function () { setActiveTab(btn.getAttribute('data-tab')); });
  });

  // Bit Lab source selector
  document.querySelectorAll('.bit-src-btn[data-bitsrc]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      state.bitSource = btn.getAttribute('data-bitsrc');
      document.querySelectorAll('.bit-src-btn[data-bitsrc]').forEach(function (b) {
        b.classList.toggle('active', b === btn);
      });
      _bitCache = { x: '', y: '', z: '' };
      updateBitInspector();
    });
  });

  // Preset '!' Explainer Toggle (hidden by default; expands unclipped on demand)
  if ($('btnPatchNote') && $('patchNote')) {
    $('btnPatchNote').addEventListener('click', function () {
      var open = $('patchNote').hidden;
      $('patchNote').hidden = !open;
      $('btnPatchNote').classList.toggle('active', open);
      $('btnPatchNote').setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  // Coherent '? Guide' Introduction & 1-Click Live Demo System
  var lastNonGuideTab = 'scopes';
  var activeGuideIdx = 0;

  var GUIDE_CHAPTERS = [
    {
      num: '01',
      title: 'The Hollow Vessel & 4-Bit Orbit',
      sub: 'Invariant carrier V = 4/3·π(R³ − r³) & 1000 ↔ 0001',
      formula: 'V = 4/3·π(R³ − r³)',
      body: '<p><b>The Ramanujan Chime</b> treats the outer sphere <code>R</code> (<code>OSC A</code>) and inner cavity <code>r</code> (<code>OSC B</code>) as an invariant 3D wavetable vessel. Trajectories are classified live into four zones: <code>ON SPHERE</code>, <code>IN SHELL</code>, <code>IN CAVITY</code>, and <code>OUTSIDE</code>.</p>' +
        '<p>On the default <b>Four-Bit Orbit</b> patch, binary palindromes <code>1000₂ (8)</code> and <code>0001₂ (1)</code> orbit in quadrature across the Front <code>f(x)</code> meridian and Top <code>XZ</code> equator around the inscribed Quadray tetrahedron.</p>' +
        '<div class="guide-try-box"><b>Try this:</b> Click <code>Front f(x)</code> or <code>Top XZ</code> in the 4-Bit card, or click the <code>!</code> button beside the preset menu for any patch\'s full note.</div>',
      run: function () {
        if (ModMatrix && ModMatrix.clearRoutes) ModMatrix.clearRoutes();
        setLockVolumeMode(false);
        applyPreset(12);
        state.toggles.cutaway = false;
        state.toggles.fourBitOrbit = true;
        state.toggles.resonanceMode = true;
        state.toggles.strobeN = false;
        state.toggles.animate = true;
        Scene3D.setCameraView('iso', state);
        syncHudToggles();
        bump();
      }
    },
    {
      num: '02',
      title: 'Two Twins & Analytic Morlet Helix',
      sub: 'Polarity null (−P) vs. Conjugate mirror (P̄)',
      formula: 'P + P̄ = 2·Re(P)',
      body: '<p>Every signal carries two distinct symmetries in the topbar <b>Twin</b> bar: <b>Antipodal</b> <code>−P = (−x, −y, −z)</code> is a 180° polarity flip (audio null test <code>P + (−P) = 0</code>), while <b>Conjugate</b> <code>P̄ = (x, −y, z)</code> flips the quadrature axis so <code>P + P̄</code> cancels imaginary phase and isolates the real trace.</p>' +
        '<p>On <b>Analytic Morlet ψ(t)</b>, slicing the cutaway shell reveals the complex Gaussian-windowed carrier spiraling smoothly through the vessel.</p>' +
        '<div class="guide-try-box"><b>Try this:</b> Toggle <code>−P Null</code> vs. <code>P̄ Conj</code> in the topbar, then switch to <b>1 · Scopes</b> to watch the quadrature cancellation live.</div>',
      run: function () {
        if (ModMatrix && ModMatrix.clearRoutes) ModMatrix.clearRoutes();
        setLockVolumeMode(false);
        applyPreset(5);
        state.toggles.cutaway = true;
        state.toggles.fourBitOrbit = false;
        state.toggles.resonanceMode = true;
        state.toggles.animate = true;
        setTwinMode('both');
        Scene3D.setCameraView('iso', state);
        syncHudToggles();
        bump();
      }
    },
    {
      num: '03',
      title: 'Dual-Sphere Resonance & Auto z(t)',
      sub: 'Constant-volume Lock V, 1:2:2 lock & Archimedes slice',
      formula: 'A_ring(z) = π(R² − r²)',
      body: '<p>With <b>Lock V</b> active, expanding Cavity <code>r</code> grows Outer <code>R = (r³ + R₀³)^(1/3)</code> with radial Jacobian <code>dR/dr = η²</code>, behaving like a constant-energy DAW time-stretcher. At <code>η = 0.50</code>, outer, inner, and shell-wall modes lock in an exact <code>1 : 2 : 2</code> triple octave.</p>' +
        '<p>Across <code>|z| ≤ r</code>, Archimedes\' slice theorem guarantees the hollow ring has strictly constant cross-sectional area. Even better: <b>Auto z(t)</b> is now both a <b>drop target</b> and a <b>modulator source</b> inside <code>5 · Mod &amp; Logic</code>!</p>' +
        '<div class="guide-try-box"><b>Try this:</b> Load this demo to let <code>Auto z(t)</code> drive Phase, Order N, and Partials K live—then open <b>5 · Mod &amp; Logic</b> to tweak its depth or drag <code>Slice z(t)</code> to another slider.</div>',
      run: function () {
        applyPreset(12);
        state.r = 1.0;
        state.rIn = 0.5;
        syncParamUI();
        setLockVolumeMode(true);
        state.toggles.cutaway = true;
        state.toggles.resonanceMode = true;
        state.toggles.animate = true;
        state.archimedesAuto = true;
        if ($('btnArchAuto')) $('btnArchAuto').classList.add('active');
        if (ModMatrix && ModMatrix.captureBase) ModMatrix.captureBase(state);
        if (ModMatrix && ModMatrix.applyPreset) ModMatrix.applyPreset('autoZDrive');
        syncHudToggles();
        bump();
      }
    },
    {
      num: '04',
      title: 'Float32 Precision & tan() Sentinels',
      sub: 'IEEE-754 24-bit mantissa, 0x40490FDB & Ramanujan k=0',
      formula: 'π_f32 = 0x40490FDB',
      body: '<p>All formulas run through <code>Math.fround()</code> so the browser and Node share exact 32-bit DSP float precision (~144.5 dB floor). Ramanujan\'s 1914 <code>1/π</code> series converges ~208 dB per term—locking all 32 bits of <code>π</code> on <code>k = 0</code> alone.</p>' +
        '<p>On the <b>TANGENT</b> patch, vertical asymptotes escape the sphere (<code>OUTSIDE</code>) toward <code>±∞</code>, letting you inspect live IEEE-754 sign, exponent, and mantissa bits in real time.</p>' +
        '<div class="guide-try-box"><b>Try this:</b> Jump to <b>4 · Bit Lab</b> and switch between <code>Active (P / Twin)</code> and <code>Ramanujan k=0 vs π</code>, or check <b>2 · Harmonics</b> for the convergence curve.</div>',
      run: function () {
        if (ModMatrix && ModMatrix.clearRoutes) ModMatrix.clearRoutes();
        setLockVolumeMode(false);
        applyPreset(11);
        state.toggles.cutaway = false;
        state.toggles.fourBitOrbit = true;
        state.toggles.animate = true;
        Scene3D.setCameraView('iso', state);
        syncHudToggles();
        bump();
      }
    },
    {
      num: '05',
      title: 'Parent-Clock LFO & Entanglement',
      sub: 'Zero-drift click-and-drag cables & logical gates',
      formula: 'LFO → φ → cos → z(t)',
      body: '<p>In <b>5 · Mod &amp; Logic</b>, every LFO and cross-parameter link runs off a single deterministic <b>Parent Clock</b> (synced to <code>playT</code> by default). Because evaluation runs in two topological passes, chains like <code>LFO 1 → Phase φ → cos(π·x) → Slice z/R</code> stay phase-locked forever—even while scrubbing <code>Φ</code> backward.</p>' +
        '<p>Logical rules like <code>Gate == 0x8</code> and <code>Gate |z|≤r</code> couple discrete 4-bit nibble zero-crossings and Archimedes plateau boundaries straight into synth parameters.</p>' +
        '<div class="guide-try-box"><b>Try this:</b> Open <b>5 · Mod &amp; Logic</b>, drag any glowing <code>(•)</code> handle onto a Left Rack slider or the floating <code>Auto z(t)</code> slider, or collapse panels with <code>«</code> / <code>▾</code> to stretch the 3D stage.</div>',
      run: function () {
        setLockVolumeMode(false);
        applyPreset(12);
        state.toggles.fourBitOrbit = true;
        state.toggles.resonanceMode = true;
        state.toggles.strobeN = true;
        state.toggles.animate = true;
        if (ModMatrix && ModMatrix.captureBase) ModMatrix.captureBase(state);
        if (ModMatrix && ModMatrix.applyPreset) ModMatrix.applyPreset('entangled');
        Scene3D.setCameraView('iso', state);
        syncHudToggles();
        bump();
      }
    },
    {
      num: '06',
      title: 'Why "The Chime" — Circle of Fifths & Observed State',
      sub: 'Chromatic Z_12 cavity, Fifths/Fourths conjugation & key changes',
      formula: 'g = +7 (5ths) ↔ −7 ≡ +5 (4ths)',
      body: '<p>Think of the hollow cavity as <b>chromatic space</b> (<code>Order N = 12</code>): its four vessel snaps <code>.50</code>, <code>2/3</code>, <code>−3dB</code>, and <code>.75</code> are literally <b>Octave (2:1)</b>, <b>Fifth (3:2)</b>, <b>Tritone (√2:1)</b>, and <b>Fourth (4:3)</b>. Stepping clockwise by <code>+7 mod 12</code> walks the <b>Circle of Fifths</b>; its complex conjugate mirror <code>P̄</code> (<code>−7 ≡ +5 mod 12</code>) is the <b>Circle of Fourths</b> (Negative Harmony), while antipodal <code>−P</code> (<code>+6</code>) is the tritone axis.</p>' +
        '<p>Locking your eye onto <b>one moving vector</b> (<code>0001</code>) establishes an <b>Observed State</b> (tonic): modulating <code>Phase φ</code> shifts key signatures around the wheel, switching twins acts like a clef/inversion change, and their standing-wave sum <code>P + P̄</code> rings across the hollow shell like a struck <b>Chime</b>.</p>' +
        '<div class="guide-try-box"><b>Try this:</b> Load this demo (<code>N=12</code>, <code>η=2/3</code> Fifth lock, <code>Chime Fifths</code> matrix), fix your eyes on <code>0001</code> as <code>Phase φ</code> steps through the Circle of Fifths, then click <b>Invert</b> in <b>5 · Mod &amp; Logic</b> to flip into the Circle of Fourths!</div>',
      run: function () {
        setLockVolumeMode(false);
        applyPreset(12);
        state.r = 1.0;
        state.rIn = 0.67;
        state.orderN = 12;
        syncParamUI();
        setTwinMode('both');
        state.toggles.fourBitOrbit = true;
        state.toggles.resonanceMode = true;
        state.toggles.strobeN = true;
        state.toggles.animate = true;
        if (ModMatrix && ModMatrix.captureBase) ModMatrix.captureBase(state);
        if (ModMatrix && ModMatrix.applyPreset) ModMatrix.applyPreset('chimeFifths');
        Scene3D.setCameraView('iso', state);
        syncHudToggles();
        bump();
      }
    },
    {
      num: '07',
      title: 'Cutaway Floor Wavetable & MiniMeters 3D',
      sub: 'Volumetric 3D floor oscillator & 3D spectral dispersion',
      formula: 'Floor y = 0 · 2D EQ at z = 0',
      body: '<p>Seated directly along the equatorial <b>Cutaway Floor</b> (<code>y = 0</code>), the volumetric surface scales proportionally inside Outer <code>R</code> and Inner Cavity <code>r</code>—and swaps between two dual roles in one click inside <b>6 · Floor WT</b>:</p>' +
        '<p><b>1. 3D Wavetable</b> (GitWave aesthetic) sweeps a glowing golden active slice along <code>Auto z(t)</code> / <code>Slice z/R</code>. <b>2. MiniMeters 3D</b> turns the center <code>2D f(x)</code> slice into an animated equalizer with pitch/cents detection while radiating 3D spectral dispersion across the cavity.</p>' +
        '<div class="guide-try-box"><b>Try this:</b> Load this demo, then jump to <b>6 · Floor WT</b> to swap between <code>3D Wavetable</code> and <code>MiniMeters 3D</code>, sculpt <code>Depth / Disp / Size</code>, or click <code>♪ Chime Tone</code> to drive it with live Web Audio!</div>',
      run: function () {
        setLockVolumeMode(false);
        applyPreset(12);
        state.r = 1.0;
        state.rIn = 0.5;
        syncParamUI();
        state.floorMode = 'spectrogram';
        state.toggles.cutaway = true;
        state.toggles.floorWt = true;
        state.toggles.fourBitOrbit = false;
        state.toggles.resonanceMode = true;
        state.toggles.animate = true;
        Scene3D.setCameraView('iso', state);
        syncHudToggles();
        syncFloorUI();
        bump();
      }
    },
    {
      num: '08',
      title: 'Grover\'s Search & Colliding Blocks (π)',
      sub: '2D Hilbert rotation, Oracle P̄ reflection & π-counting bounces',
      formula: 'm* ≈ (π/4)·√N · θ = asin(1/√N)',
      body: '<p>An exact geometric simulation of <b>Grover\'s quantum search</b> and <b>3Blue1Brown\'s colliding blocks</b> on the Chime\'s unit circle (<code>X² + Y² = R²</code>). Flipping the target key\'s sign (or bouncing the small block off the wall) is literally the Chime\'s <b>Conjugate Twin</b> <code>P̄ = (x, −y)</code>; alternating it with diffusion rotates the state by <code>2θ</code> per step until hitting the top pole <code>|k⟩</code> in <code>≈ (π/4)√N</code> steps.</p>' +
        '<p>At <code>Order N = 16</code> (4-bit nibbles <code>0000..1111</code>), step 3 peaks at <b>96.1%</b> before harmonically overshooting. Switch the floating Rosetta Lens to <b>Blocks → π</b> to see <code>10:1</code> (10 hits) and <code>100:1</code> (31 hits → <code>3.1</code>) trace the exact zigzag chords!</p>' +
        '<div class="guide-try-box"><b>Try this:</b> Click <code>Step +1</code> or <code>Jump Peak</code> in the floating Rosetta card, toggle <code>Grover Chords / Orbit / Blocks → π</code>, or switch to <b>1 · Scopes</b> to watch the probability wave peak and overshoot.</div>',
      run: function () {
        if (ModMatrix && ModMatrix.clearRoutes) ModMatrix.clearRoutes();
        setLockVolumeMode(false);
        if (GroverLens && GroverLens.open) {
          GroverLens.open({ mode: 'chords', orderN: 16, K: 4, animate: true });
        }
      }
    }
  ];

  if (GroverLens && GroverLens.attach) {
    GroverLens.attach({
      getState: function () { return state; },
      apply: function (cfg) {
        if (cfg.formulas) {
          state.formulas.x = cfg.formulas.x;
          state.formulas.y = cfg.formulas.y;
          state.formulas.z = cfg.formulas.z;
          if ($('formulaX')) { $('formulaX').value = cfg.formulas.x; $('formulaX').classList.remove('invalid'); }
          if ($('formulaY')) { $('formulaY').value = cfg.formulas.y; $('formulaY').classList.remove('invalid'); }
          if ($('formulaZ')) { $('formulaZ').value = cfg.formulas.z; $('formulaZ').classList.remove('invalid'); }
          if ($('errX')) $('errX').textContent = '';
          if ($('errY')) $('errY').textContent = '';
          if ($('errZ')) $('errZ').textContent = '';
        }
        if (cfg.orderN != null) state.orderN = cfg.orderN;
        if (cfg.K != null) state.K = cfg.K;
        if (cfg.r != null) state.r = cfg.r;
        if (cfg.rIn != null) state.rIn = cfg.rIn;
        if (cfg.amp != null) state.amp = cfg.amp;
        state.presetIndex = Presets.list.length - 1;
        if ($('presetSelect')) $('presetSelect').value = String(state.presetIndex);
        if (cfg.twinMode) setTwinMode(cfg.twinMode);
        ['sliceGrid', 'cutaway', 'fourBitOrbit', 'resonanceMode', 'strobeN', 'magnifier', 'animate'].forEach(function (k) {
          if (cfg[k] != null) state.toggles[k] = !!cfg[k];
        });
        syncParamUI();
        syncHudToggles();
        if (cfg.camera) Scene3D.setCameraView(cfg.camera, state);
        bump();
      },
      setClock: function (t) {
        state.toggles.animate = false;
        state.playT = Engine.clamp(Number(t), 0, 1);
        syncHudToggles();
        bump();
      }
    });
  }

  function runGuideChapter(idx) {
    var ch = GUIDE_CHAPTERS[idx];
    if (!ch || !ch.run) return;
    if (ch.num !== '08' && GroverLens && GroverLens.close) {
      GroverLens.close();
    }
    ch.run();
  }

  function renderGuideUI() {
    var listEl = $('guideChapterList');
    if (!listEl) return;
    listEl.innerHTML = '';
    for (var i = 0; i < GUIDE_CHAPTERS.length; i++) {
      (function (idx, ch) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'guide-ch-btn' + (idx === activeGuideIdx ? ' active' : '');
        btn.innerHTML =
          '<span class="guide-ch-num">' + ch.num + '</span>' +
          '<span class="guide-ch-copy">' +
            '<span class="guide-ch-title">' + ch.title + '</span>' +
            '<span class="guide-ch-sub">' + ch.sub + '</span>' +
          '</span>' +
          '<span class="guide-ch-play">&#9654;</span>';
        btn.addEventListener('click', function () {
          activeGuideIdx = idx;
          renderGuideUI();
          runGuideChapter(idx);
        });
        listEl.appendChild(btn);
      })(i, GUIDE_CHAPTERS[i]);
    }

    var cur = GUIDE_CHAPTERS[activeGuideIdx] || GUIDE_CHAPTERS[0];
    if ($('guideStoryTitle')) $('guideStoryTitle').textContent = cur.num + ' · ' + cur.title;
    if ($('guideStoryFormula')) $('guideStoryFormula').textContent = cur.formula;
    if ($('guideStoryBody')) $('guideStoryBody').innerHTML = cur.body;
  }

  function toggleGuideTab() {
    if (state.activeTab === 'guide' && !dockCollapsed) {
      setActiveTab(lastNonGuideTab || 'scopes');
    } else {
      if (state.activeTab !== 'guide') lastNonGuideTab = state.activeTab;
      setDockCollapsed(false);
      setActiveTab('guide');
    }
  }

  if ($('btnThesis')) {
    $('btnThesis').addEventListener('click', toggleGuideTab);
  }
  if ($('btnGuideRun')) {
    $('btnGuideRun').addEventListener('click', function () {
      runGuideChapter(activeGuideIdx);
    });
  }
  if ($('btnGuidePrev')) {
    $('btnGuidePrev').addEventListener('click', function () {
      activeGuideIdx = (activeGuideIdx - 1 + GUIDE_CHAPTERS.length) % GUIDE_CHAPTERS.length;
      renderGuideUI();
      runGuideChapter(activeGuideIdx);
    });
  }
  if ($('btnGuideNext')) {
    $('btnGuideNext').addEventListener('click', function () {
      activeGuideIdx = (activeGuideIdx + 1) % GUIDE_CHAPTERS.length;
      renderGuideUI();
      runGuideChapter(activeGuideIdx);
    });
  }
  document.querySelectorAll('.guide-jump-btn[data-guide-tab]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      setDockCollapsed(false);
      setActiveTab(btn.getAttribute('data-guide-tab'));
    });
  });
  renderGuideUI();

  // ---- §10 Cutaway Floor 3D Wavetable & MiniMeters 3D Spectrogram Controls ----
  function syncFloorUI() {
    var on = !!(state.toggles && state.toggles.floorWt);
    var isSpec = state.floorMode === 'spectrogram';
    var enBtn = $('btnFloorEnable');
    if (enBtn) {
      enBtn.classList.toggle('active', on);
      enBtn.innerHTML = on ? '&#9679; Floor Active' : '&#9679; Floor Off';
    }
    var dot = $('floorTabDot');
    if (dot) dot.classList.toggle('active', on);

    document.querySelectorAll('.floor-mode-btn[data-fmode]').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-fmode') === state.floorMode);
    });
    if ($('floorSmoothLbl')) $('floorSmoothLbl').textContent = isSpec ? 'Disp' : 'Smooth';
    if ($('floorModeTag')) $('floorModeTag').textContent = isSpec ? 'MINIMETERS 3D' : 'WAVETABLE';
    if ($('floorScopeTitle')) {
      if (state.floorScopeView === 'lcd') {
        $('floorScopeTitle').innerHTML = 'Synth LCD &mdash; Fixed-Interval Base58 / Hex Spectrogram';
      } else if (state.floorScopeView === 'dual') {
        $('floorScopeTitle').innerHTML = 'Dual &mdash; BitWave Waveform + Base58 Synth LCD';
      } else if (state.floorScopeView === 'bitwave') {
        $('floorScopeTitle').innerHTML = 'BitWave 2D Register &mdash; Monotone-Cubic Spline (0x8 Zero-Crossing)';
      } else if (state.floorScopeView === 'pcm') {
        $('floorScopeTitle').innerHTML = 'RX 11-Style 2D PCM Needle Groove &mdash; Constant Cavity &amp; Zoom T';
      } else {
        $('floorScopeTitle').innerHTML = isSpec
          ? '2D MiniMeters Equalizer &mdash; Center 2D f(x) Slice &amp; 3D Cavity Dispersion'
          : '2D Active Slice &mdash; Synced to Auto z(t) &amp; Cutaway Floor';
      }
    }
    syncBitWaveUI();
    syncLcdUI();
    if ($('floorDepthSlider')) $('floorDepthSlider').value = String(state.floorDepth);
    if ($('floorDepthOut')) $('floorDepthOut').textContent = Math.round(state.floorDepth * 100) + '%';
    if ($('floorSmoothSlider')) $('floorSmoothSlider').value = String(state.floorSmooth);
    if ($('floorSmoothOut')) $('floorSmoothOut').textContent = Math.round(state.floorSmooth * 100) + '%';
    if ($('floorSizeSlider')) $('floorSizeSlider').value = String(state.floorSize);
    if ($('floorSizeOut')) $('floorSizeOut').textContent = Math.round(state.floorSize * 100) + '%';
    if ($('floorZoomSlider') && document.activeElement !== $('floorZoomSlider')) {
      $('floorZoomSlider').value = String(state.floorZoomLog);
    }
    if ($('floorZoomOut') && Engine.floorZoomSec && Engine.fmtZoomSec) {
      $('floorZoomOut').textContent = Engine.fmtZoomSec(Engine.floorZoomSec(state.floorZoomLog));
    }
    document.querySelectorAll('.floor-scope-btn[data-fscope]').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-fscope') === (state.floorScopeView || 'eq'));
    });
    if ($('floorBpmInput') && document.activeElement !== $('floorBpmInput')) {
      $('floorBpmInput').value = String(Math.round(state.floorBpm || 120));
    }
    if ($('floorBeatsSelect')) $('floorBeatsSelect').value = String(state.floorBeats || 4);
  }

  function fmtTwinVal(reg, width) {
    if (!reg) return '—';
    var h = reg.hex.length > 10 ? (reg.hex.slice(0, 8) + '…') : reg.hex;
    if (width <= 32) return '0x' + h + ' (' + reg.dec + ')';
    return '0x' + h + ' · p' + reg.popcount;
  }

  function updateFloorReadouts(field) {
    if (!field) return;
    if ($('floorPitchBadge')) $('floorPitchBadge').textContent = field.pitch ? field.pitch.label : '—';
    if ($('floorModeTag')) {
      $('floorModeTag').textContent = field.sourceLabel && field.sourceLabel !== 'SYNTH'
        ? field.sourceLabel
        : (field.mode === 'spectrogram' ? 'MINIMETERS 3D' : 'WAVETABLE');
    }

    var twinDec = (state.floorScopeView === 'bitwave' && field.bitwave && field.bitwave.twinDec)
      ? field.bitwave.twinDec
      : null;
    if ($('floorCavityReadouts') && $('floorTwinReadouts')) {
      $('floorCavityReadouts').hidden = !!twinDec;
      $('floorTwinReadouts').hidden = !twinDec;
    }
    if ($('floorInfoTitle')) {
      $('floorInfoTitle').textContent = twinDec ? 'Spherical Twin Decompiler' : 'Cavity & Time Window T';
    }
    if (twinDec) {
      if ($('bwTwinPOut')) {
        $('bwTwinPOut').textContent = fmtTwinVal(twinDec.P, twinDec.width);
        $('bwTwinPOut').title = '0x' + twinDec.P.hex + ' | dec ' + twinDec.P.decFull + ' | bin ' + twinDec.P.bin;
      }
      if ($('bwTwinConjOut')) {
        $('bwTwinConjOut').textContent = fmtTwinVal(twinDec.conj, twinDec.width);
        $('bwTwinConjOut').title = '0x' + twinDec.conj.hex + ' | dec ' + twinDec.conj.decFull + ' | bin ' + twinDec.conj.bin;
      }
      if ($('bwTwinNullOut')) {
        $('bwTwinNullOut').textContent = fmtTwinVal(twinDec.nullTwin, twinDec.width);
        $('bwTwinNullOut').title = '(' + twinDec.nullTwin.kind + ') 0x' + twinDec.nullTwin.hex + ' | dec ' + twinDec.nullTwin.decFull;
      }
      if ($('bwTwinObsLbl')) $('bwTwinObsLbl').textContent = 'Z · ' + twinDec.observed.label;
      if ($('bwTwinObsOut')) {
        $('bwTwinObsOut').textContent = fmtTwinVal(twinDec.observed, twinDec.width);
        $('bwTwinObsOut').title = '0x' + twinDec.observed.hex + ' | dec ' + twinDec.observed.decFull + ' | bin ' + twinDec.observed.bin;
      }
      if ($('bwTwinMetaOut')) {
        var meta = twinDec.thetaDeg.toFixed(0) + '° · k=' + twinDec.stepK + ' · Q' + twinDec.quadrant;
        if (twinDec.isNull) meta += ' · NULL';
        else if (twinDec.balanced) meta += ' · 50%★';
        $('bwTwinMetaOut').textContent = meta;
      }
      return;
    }

    if ($('floorWinOut')) {
      var wFmt = Engine.fmtZoomSec ? Engine.fmtZoomSec(field.windowSec) : (field.windowSec.toFixed(2) + 's');
      var cFmt = Engine.fmtZoomSec ? Engine.fmtZoomSec(field.cavityWindowSec) : (field.cavityWindowSec.toFixed(2) + 's');
      $('floorWinOut').textContent = wFmt + ' · Cav ' + cFmt;
    }
    if ($('floorVelOut')) {
      var v = field.floorVelocity || 0;
      $('floorVelOut').textContent = (v >= 10 ? v.toFixed(1) : v.toFixed(2)) + ' Ø/s';
    }
    if ($('floorDynOut')) {
      if (field.dynamics && isFinite(field.dynamics.rmsDb)) {
        $('floorDynOut').textContent = field.dynamics.rmsDb.toFixed(1) + ' dB · ' + field.dynamics.crestDb.toFixed(1) + ' dB CF';
      } else {
        $('floorDynOut').textContent = '— (' + (field.sourceLabel || 'synth').toLowerCase() + ')';
      }
    }
    if ($('floorPitchOut') && field.pitch) {
      var cs = (field.pitch.cents >= 0 ? '+' : '−') + Math.abs(field.pitch.cents) + '¢';
      $('floorPitchOut').textContent = field.pitch.note + ' (' + cs + ')';
    }
    if ($('floorIntOut') && field.syzygy) {
      $('floorIntOut').textContent = field.syzygy.ratioText + ' ' + field.syzygy.intervalName;
    }
  }

  if ($('btnFloorEnable')) {
    $('btnFloorEnable').addEventListener('click', function () {
      state.toggles.floorWt = !state.toggles.floorWt;
      if (state.toggles.floorWt && !state.toggles.cutaway) state.toggles.cutaway = true;
      syncHudToggles();
      syncFloorUI();
      bump();
    });
  }
  function exitBitWaveDisplay(opts) {
    opts = opts || {};
    if (opts.disableSync !== false) bwAutoSync = false;
    if (opts.clearFeed && BitWaveFeed) {
      BitWaveFeed.clear();
      if ($('floorBwInput')) $('floorBwInput').value = '';
    }
    if (opts.hideBar && $('floorBwBar')) $('floorBwBar').hidden = true;
    if (state.floorScopeView === 'bitwave') {
      state.floorScopeView = 'eq';
    }
  }

  document.querySelectorAll('.floor-mode-btn[data-fmode]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      state.floorMode = btn.getAttribute('data-fmode') || 'wavetable';
      if (!state.toggles.floorWt) {
        state.toggles.floorWt = true;
        if (!state.toggles.cutaway) state.toggles.cutaway = true;
      }
      // Clicking MiniMeters 3D (or switching modes when BitWave has no loaded feed) shows the 2D EQ / Active Slice
      if (state.floorMode === 'spectrogram' || !(BitWaveFeed && BitWaveFeed.isActive && BitWaveFeed.isActive())) {
        if (state.floorScopeView === 'bitwave') state.floorScopeView = 'eq';
      }
      syncHudToggles();
      syncFloorUI();
      bump();
    });
  });
  if ($('floorDepthSlider')) {
    $('floorDepthSlider').addEventListener('input', function () {
      state.floorDepth = Engine.clamp(parseFloat($('floorDepthSlider').value) || 0.68, 0.15, 1.25);
      syncFloorUI();
    });
  }
  if ($('floorSmoothSlider')) {
    $('floorSmoothSlider').addEventListener('input', function () {
      state.floorSmooth = Engine.clamp(parseFloat($('floorSmoothSlider').value) || 0.52, 0, 1);
      syncFloorUI();
    });
  }
  if ($('floorSizeSlider')) {
    $('floorSizeSlider').addEventListener('input', function () {
      state.floorSize = Engine.clamp(parseFloat($('floorSizeSlider').value) || 0.94, 0.45, 1);
      syncFloorUI();
    });
  }
  function prepareFloorForAudio() {
    exitBitWaveDisplay({ disableSync: true, hideBar: true });
    state.toggles.floorWt = true;
    state.toggles.cutaway = true;
    state.toggles.fourBitOrbit = false;
    state.floorMode = 'spectrogram';
    syncHudToggles();
    syncFloorUI();
  }
  if ($('btnFloorTone')) {
    $('btnFloorTone').addEventListener('click', function () {
      if (!FloorView) return;
      if (FloorView.getAudioMode && FloorView.getAudioMode() !== 'tone') prepareFloorForAudio();
      FloorView.toggleTone(state);
      syncFloorUI();
    });
  }
  if ($('btnFloorMic')) {
    $('btnFloorMic').addEventListener('click', function () {
      if (!FloorView) return;
      if (FloorView.getAudioMode && FloorView.getAudioMode() !== 'mic') prepareFloorForAudio();
      FloorView.toggleMic(function (msg) {
        if ($('floorModeTag')) $('floorModeTag').textContent = msg.toUpperCase();
      });
    });
  }
  if ($('btnFloorSys')) {
    $('btnFloorSys').addEventListener('click', function () {
      if (!FloorView) return;
      if (FloorView.getAudioMode && FloorView.getAudioMode() !== 'sys') prepareFloorForAudio();
      FloorView.toggleSystemAudio(function (msg) {
        if ($('floorModeTag')) $('floorModeTag').textContent = msg.toUpperCase();
      });
    });
  }
  function handleFloorAudioFile(file) {
    if (!file || !FloorView) return;
    prepareFloorForAudio();
    FloorView.loadAudioFile(file, {
      onStatus: function (msg) {
        if ($('floorModeTag')) $('floorModeTag').textContent = msg.toUpperCase();
      },
      onLoaded: function (info) {
        if (info && info.bpm) state.floorBpm = info.bpm;
        snapFloorZoomToBeats();
      }
    });
  }
  var bwAutoSync = false;
  var bwLastClip = '';

  function syncBitWaveUI(errMsg, errDetail) {
    var fd = (BitWaveFeed && typeof BitWaveFeed.getFeed === 'function') ? BitWaveFeed.getFeed() : null;
    var active = !!(fd && fd.active);
    var toggleBtn = $('btnFloorBwToggle');
    if (toggleBtn) toggleBtn.classList.toggle('active', active || bwAutoSync);
    var syncBtn = $('btnFloorBwSync');
    if (syncBtn) {
      syncBtn.classList.toggle('active', bwAutoSync);
      syncBtn.textContent = bwAutoSync ? 'Sync On' : 'Sync';
    }

    var badge = $('floorBwStatus');
    if (badge) {
      badge.classList.remove('live', 'err');
      if (errMsg) {
        badge.textContent = errMsg;
        badge.title = errDetail || errMsg;
        badge.classList.add('err');
      } else if (active) {
        var tag = fd.liveTransport === 'broadcast'
          ? ('BC LIVE · ' + fd.width + 'b')
          : (fd.liveTransport === 'sync'
            ? ('SYNC · ' + fd.width + 'b')
            : (fd.liveTransport === 'postMessage' ? ('MSG · ' + fd.width + 'b') : (fd.width + 'b · ' + fd.label)));
        badge.textContent = tag;
        badge.title = 'Loaded ' + fd.name + ' (' + fd.width + ' bits, Lane ' + fd.lane + ' ' + fd.label + ')';
        if (fd.liveTransport === 'broadcast' || fd.liveTransport === 'postMessage' || fd.liveTransport === 'sync' || bwAutoSync) {
          badge.classList.add('live');
        }
      } else {
        badge.textContent = bwAutoSync ? 'Sync Ready' : 'BW Ready';
        badge.title = bwAutoSync
          ? 'Auto-Sync active: copy a link in BitWave and switch back to this tab to update automatically'
          : 'Paste a BitWave #bw= share link, .bitwave JSON, or hex register — or enable Sync';
        if (bwAutoSync) badge.classList.add('live');
      }
    }

    var laneSel = $('floorBwLane');
    if (laneSel && active) {
      var wantKeys = fd.laneKeys && fd.laneKeys.length ? fd.laneKeys : ['1'];
      var curKeys = Array.from(laneSel.options).map(function (o) { return o.value; }).join(',');
      if (curKeys !== wantKeys.join(',')) {
        laneSel.innerHTML = '';
        for (var i = 0; i < wantKeys.length; i++) {
          var opt = document.createElement('option');
          opt.value = wantKeys[i];
          opt.textContent = 'L' + wantKeys[i];
          laneSel.appendChild(opt);
        }
      }
      laneSel.value = fd.lane || wantKeys[0];
    }
    document.querySelectorAll('.floor-bw-frame-btn[data-bwframe]').forEach(function (b) {
      var fr = b.getAttribute('data-bwframe');
      b.classList.toggle('active', fr === (active ? fd.frame : 'z'));
    });
    var twinCfg = (BitWaveFeed && typeof BitWaveFeed.getTwinConfig === 'function') ? BitWaveFeed.getTwinConfig() : null;
    if (twinCfg) {
      if ($('btnFloorBwTwin')) $('btnFloorBwTwin').classList.toggle('active', !!twinCfg.enabled);
      if ($('floorBwRule')) {
        $('floorBwRule').value = twinCfg.rule || 'twin';
      }
    }
  }

  function activateFloorForBitWave(switchScope) {
    if (FloorView && FloorView.getAudioMode && FloorView.getAudioMode() !== 'synth') {
      FloorView.stopAudio();
    }
    state.toggles.floorWt = true;
    state.toggles.cutaway = true;
    state.toggles.fourBitOrbit = false;
    if (switchScope !== false) state.floorScopeView = 'bitwave';
    syncHudToggles();
    syncFloorUI();
    bump();
  }

  function handleFloorBitWaveFile(file) {
    if (!file || !BitWaveFeed) return;
    var reader = new FileReader();
    reader.onload = function () {
      var res = BitWaveFeed.ingest(String(reader.result || ''), { transport: 'file', name: file.name || 'project.bitwave' });
      if (!res.ok) {
        if ($('floorBwBar')) $('floorBwBar').hidden = false;
        syncBitWaveUI('Parse error', res.error);
        return;
      }
      if ($('floorBwBar')) $('floorBwBar').hidden = false;
      activateFloorForBitWave(true);
    };
    reader.readAsText(file);
  }

  if ($('btnFloorBwToggle') && $('floorBwBar')) {
    $('btnFloorBwToggle').addEventListener('click', function () {
      var nextHidden = !$('floorBwBar').hidden;
      $('floorBwBar').hidden = nextHidden;
      if (nextHidden) {
        if (!(BitWaveFeed && BitWaveFeed.isActive && BitWaveFeed.isActive()) && state.floorScopeView === 'bitwave') {
          state.floorScopeView = 'eq';
          syncFloorUI();
        }
      } else if ($('floorBwInput')) {
        $('floorBwInput').focus();
      }
    });
  }
  function applyFloorBwInput(overrideRaw, transportMode, quietOnNoMatch) {
    if (!BitWaveFeed) return false;
    var raw = (overrideRaw != null ? String(overrideRaw) : ($('floorBwInput') ? $('floorBwInput').value : '')).trim();
    if (!raw) {
      if (!quietOnNoMatch) syncBitWaveUI('Paste #bw=/hex');
      return false;
    }
    var res = BitWaveFeed.ingest(raw, { transport: transportMode || 'paste' });
    if (!res.ok) {
      if (!quietOnNoMatch) syncBitWaveUI('Invalid link', res.error);
      return false;
    }
    if ($('floorBwInput') && overrideRaw != null) {
      $('floorBwInput').value = raw.length > 96 ? (raw.slice(0, 96) + '…') : raw;
    }
    activateFloorForBitWave(true);
    return true;
  }
  function pullBitWaveFromClipboard(transportMode, quietOnNoMatch) {
    if (!navigator.clipboard || !navigator.clipboard.readText) {
      if (!quietOnNoMatch) syncBitWaveUI('Use Ctrl+V', 'Clipboard API blocked on this origin — click the box and press Ctrl+V');
      if ($('floorBwInput') && !quietOnNoMatch) $('floorBwInput').focus();
      return;
    }
    navigator.clipboard.readText().then(function (txt) {
      var clean = String(txt || '').trim();
      if (!clean) {
        if (!quietOnNoMatch) syncBitWaveUI('Clip empty');
        return;
      }
      if (quietOnNoMatch && clean === bwLastClip) return;
      if (applyFloorBwInput(clean, transportMode, quietOnNoMatch)) {
        bwLastClip = clean;
      }
    }).catch(function () {
      if (!quietOnNoMatch) {
        syncBitWaveUI('Use Ctrl+V', 'Browser blocked clipboard read — paste directly into the box (auto-loads on Ctrl+V)');
        if ($('floorBwInput')) $('floorBwInput').focus();
      }
    });
  }
  if ($('btnFloorBwPaste')) {
    $('btnFloorBwPaste').addEventListener('click', function () {
      pullBitWaveFromClipboard('paste', false);
    });
  }
  if ($('btnFloorBwSync')) {
    $('btnFloorBwSync').addEventListener('click', function () {
      bwAutoSync = !bwAutoSync;
      syncBitWaveUI();
      if (bwAutoSync) pullBitWaveFromClipboard('sync', true);
    });
  }
  window.addEventListener('focus', function () {
    if (bwAutoSync) pullBitWaveFromClipboard('sync', true);
  });
  document.addEventListener('visibilitychange', function () {
    if (bwAutoSync && !document.hidden) pullBitWaveFromClipboard('sync', true);
  });
  if ($('btnFloorBwApply')) {
    $('btnFloorBwApply').addEventListener('click', function () { applyFloorBwInput(); });
  }
  if ($('floorBwInput')) {
    $('floorBwInput').addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        applyFloorBwInput();
      }
    });
    $('floorBwInput').addEventListener('paste', function () {
      setTimeout(function () { applyFloorBwInput(); }, 0);
    });
  }
  if ($('btnFloorBwFile') && $('floorBwFileInput')) {
    $('btnFloorBwFile').addEventListener('click', function () {
      $('floorBwFileInput').value = '';
      $('floorBwFileInput').click();
    });
    $('floorBwFileInput').addEventListener('change', function () {
      var f = $('floorBwFileInput').files && $('floorBwFileInput').files[0];
      if (f) handleFloorBitWaveFile(f);
    });
  }
  if ($('floorBwLane')) {
    $('floorBwLane').addEventListener('change', function () {
      if (BitWaveFeed) BitWaveFeed.setLane($('floorBwLane').value);
    });
  }
  document.querySelectorAll('.floor-bw-frame-btn[data-bwframe]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (BitWaveFeed) BitWaveFeed.setFrame(btn.getAttribute('data-bwframe'));
    });
  });
  if ($('btnFloorBwTwin')) {
    $('btnFloorBwTwin').addEventListener('click', function () {
      if (!BitWaveFeed || !BitWaveFeed.getTwinConfig) return;
      var cur = BitWaveFeed.getTwinConfig();
      BitWaveFeed.setTwinConfig({ enabled: !cur.enabled });
      syncFloorUI();
    });
  }
  if ($('floorBwRule')) {
    $('floorBwRule').addEventListener('change', function () {
      if (!BitWaveFeed || !BitWaveFeed.setTwinConfig) return;
      BitWaveFeed.setTwinConfig({ enabled: true, rule: $('floorBwRule').value });
      syncFloorUI();
    });
  }
  document.querySelectorAll('.floor-bw-preset[data-bwpreset]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (!BitWaveFeed) return;
      var pid = btn.getAttribute('data-bwpreset');
      BitWaveFeed.loadPreset(pid);
      if (pid === 'dipole8' && BitWaveFeed.setTwinConfig) {
        BitWaveFeed.setTwinConfig({ enabled: true });
      }
      activateFloorForBitWave(true);
    });
  });
  if ($('btnFloorBwClear')) {
    $('btnFloorBwClear').addEventListener('click', function () {
      exitBitWaveDisplay({ disableSync: true, clearFeed: true, hideBar: true });
      syncFloorUI();
      bump();
    });
  }
  if (BitWaveFeed && typeof BitWaveFeed.subscribe === 'function') {
    BitWaveFeed.subscribe(function (fd) {
      if (fd && fd.active && (fd.liveTransport === 'broadcast' || fd.liveTransport === 'postMessage' || fd.liveTransport === 'api')) {
        if ($('floorBwBar')) $('floorBwBar').hidden = false;
        if (!state.toggles.floorWt) {
          activateFloorForBitWave(true);
          return;
        }
      }
      syncBitWaveUI();
    });
  }

  if ($('btnFloorUpload') && $('floorFileInput')) {
    $('btnFloorUpload').addEventListener('click', function () {
      // Pause clipboard Auto-Sync before opening OS file picker so closing the dialog doesn't re-pull an old BitWave link
      bwAutoSync = false;
      syncBitWaveUI();
      $('floorFileInput').value = '';
      $('floorFileInput').click();
    });
    $('floorFileInput').addEventListener('change', function () {
      var f = $('floorFileInput').files && $('floorFileInput').files[0];
      if (f) handleFloorAudioFile(f);
    });
  }
  if ($('tab-floorwt')) {
    $('tab-floorwt').addEventListener('dragover', function (ev) {
      ev.preventDefault();
      $('tab-floorwt').classList.add('drag-over');
    });
    $('tab-floorwt').addEventListener('dragleave', function () {
      $('tab-floorwt').classList.remove('drag-over');
    });
    $('tab-floorwt').addEventListener('drop', function (ev) {
      ev.preventDefault();
      $('tab-floorwt').classList.remove('drag-over');
      var f = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
      if (!f) return;
      var nm = (f.name || '').toLowerCase();
      if (nm.endsWith('.bitwave') || nm.endsWith('.json')) {
        handleFloorBitWaveFile(f);
      } else {
        handleFloorAudioFile(f);
      }
    });
  }
  if ($('btnFloorFilePlay')) {
    $('btnFloorFilePlay').addEventListener('click', function () {
      if (FloorView && FloorView.toggleFilePlay) FloorView.toggleFilePlay();
    });
  }
  if ($('floorFileSeek')) {
    $('floorFileSeek').addEventListener('input', function () {
      if (FloorView && FloorView.seekFile) FloorView.seekFile(parseFloat($('floorFileSeek').value) || 0);
    });
  }
  if ($('btnFloorStop')) {
    $('btnFloorStop').addEventListener('click', function () {
      if (FloorView && FloorView.stopAudio) FloorView.stopAudio();
    });
  }
  function snapFloorZoomToBeats() {
    if (!Engine.floorZoomLogFromSec) return;
    var sec = (60 * (state.floorBeats || 4)) / Math.max(40, state.floorBpm || 120);
    state.floorZoomLog = Engine.floorZoomLogFromSec(sec);
    if (ModMatrix && ModMatrix.captureBase) ModMatrix.captureBase(state, 'floorZoomLog');
    syncFloorUI();
  }
  if ($('floorZoomSlider')) {
    $('floorZoomSlider').addEventListener('input', function () {
      state.floorZoomLog = Engine.clamp(parseFloat($('floorZoomSlider').value) || 0.7295, 0, 1);
      if (ModMatrix && ModMatrix.captureBase) ModMatrix.captureBase(state, 'floorZoomLog');
      syncFloorUI();
    });
  }
  document.querySelectorAll('.floor-scope-btn[data-fscope]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      state.floorScopeView = btn.getAttribute('data-fscope') || 'eq';
      if ($('floorBwBar')) {
        if (state.floorScopeView === 'bitwave') {
          $('floorBwBar').hidden = false;
        } else if (!(BitWaveFeed && BitWaveFeed.isActive && BitWaveFeed.isActive()) && !bwAutoSync) {
          $('floorBwBar').hidden = true;
        }
      }
      if ($('floorLcdBar') && (state.floorScopeView === 'lcd' || state.floorScopeView === 'dual')) {
        $('floorLcdBar').hidden = false;
      }
      syncFloorUI();
    });
  });

  // ---- Harmor / FAS Synthetic Spectral LCD & Bitcoin Keypair Lifecycle Pipeline ----
  function hexToNibblesArr(hexStr) {
    var clean = String(hexStr || '').trim().replace(/^0[xX]/, '').toUpperCase();
    var out = [];
    var cap = Math.min(clean.length, 64);
    for (var i = 0; i < cap; i++) {
      var v = parseInt(clean.charAt(i), 16);
      if (isFinite(v)) out.push(v);
    }
    return out;
  }

  function syncLcdUI() {
    if (!SynthLCD) return;
    var cfg = SynthLCD.getConfig();
    var bar = $('floorLcdBar');
    var barOpen = !!(bar && !bar.hidden);
    if ($('btnFloorLcdToggle')) $('btnFloorLcdToggle').classList.toggle('active', cfg.enabled || barOpen);
    var planeBtn = $('btnLcdPlaneToggle');
    if (planeBtn) {
      planeBtn.classList.toggle('active', cfg.enabled);
      planeBtn.innerHTML = cfg.enabled ? '&#9679; Sphere LCD On' : '&#9679; Sphere LCD';
    }
    document.querySelectorAll('.lcd-enc-btn[data-lcdenc]').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-lcdenc') === cfg.encoding);
    });
    if ($('btnLcdBinary')) $('btnLcdBinary').classList.toggle('active', !!cfg.harmorBinary);
    var coal = state.lcdCoalesce != null ? state.lcdCoalesce : cfg.coalesce;
    if ($('lcdCoalesceSlider') && document.activeElement !== $('lcdCoalesceSlider')) {
      $('lcdCoalesceSlider').value = String(coal);
    }
    if ($('lcdCoalesceOut')) $('lcdCoalesceOut').textContent = Math.round(coal * 100) + '%';
    if ($('lcdRowLbl') && cfg.row) {
      var shortB58 = cfg.row.base58 ? (cfg.row.base58.slice(0, 10) + '…') : cfg.row.label;
      $('lcdRowLbl').textContent = (cfg.rowIndex + 1) + '/' + cfg.rowCount + ' · ' + shortB58;
      $('lcdRowLbl').title = cfg.sourceLabel + ' — ' + cfg.row.label + ' (' + cfg.row.base58 + ')';
    }
    document.querySelectorAll('.lcd-stage-btn[data-lcdstage]').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-lcdstage') === cfg.stageId);
    });
  }

  function applyLifecycleStage(stageId, opts) {
    if (!SynthLCD) return;
    opts = opts || {};
    var def = SynthLCD.STAGE_DEFS.find(function (s) { return s.id === stageId; }) || SynthLCD.STAGE_DEFS[5];
    var nextEnc = opts.keepEncoding ? SynthLCD.getConfig().encoding : def.lcdMode;
    SynthLCD.setConfig({ stageId: def.id, encoding: nextEnc, enabled: opts.enablePlane !== false });
    var hex = SynthLCD.getStageHex(def.id);
    if (BitWaveFeed && hex) {
      BitWaveFeed.ingest(hex, { name: def.name, transport: 'lifecycle', preserveSelection: false });
    }
    if (opts.openDual !== false) {
      state.floorScopeView = def.id === 'base58' ? 'dual' : 'dual';
    }
    if (opts.focusFront && Scene3D && Scene3D.setCameraView) {
      Scene3D.setCameraView('front', state);
    }
    syncHudToggles();
    syncFloorUI();
    bump();
  }

  function refreshLifecycleRackStages() {
    if (!SynthLCD) return;
    var row = SynthLCD.getCurrentRow();
    if (!row) return;
    var defs = SynthLCD.STAGE_DEFS;
    for (var i = 0; i < defs.length; i++) {
      var d = defs[i];
      var hx = SynthLCD.getStageHex(d.id);
      slotStages[d.slot] = {
        stageId: d.id,
        short: d.short,
        name: d.name,
        color: d.color,
        hex: hx,
        nibbles: hexToNibblesArr(hx),
        text: d.id === 'base58' ? row.base58 : hx,
        encoding: d.lcdMode,
        isLcd: d.id === 'base58',
        rowLabel: row.label
      };
    }
    if (ChimeRack && ChimeRack.refresh) ChimeRack.refresh();
  }

  function populateLifecycleRack() {
    if (!SynthLCD || !slots) return;
    var defs = SynthLCD.STAGE_DEFS;
    var stagePresets = [12, 12, 12, 12, 12, 12];
    var stageRIn = [0.22, 0.35, 0.50, 0.62, 0.71, 0.45];
    for (var i = 0; i < defs.length; i++) {
      var slotKey = defs[i].slot;
      if (SLOT_ORDER.indexOf(slotKey) < 0) {
        SLOT_ORDER.push(slotKey);
      }
      var snap = snapshotFromPreset(stagePresets[i], { rIn: stageRIn[i], ph: i * 30 });
      if (snap) slots[slotKey] = snap;
    }
    refreshLifecycleRackStages();
    SynthLCD.setConfig({ enabled: true, stageId: 'base58', encoding: 'base58' });
    state.floorScopeView = 'dual';
    selectSlot('F');
    var fHex = SynthLCD.getStageHex('base58');
    if (BitWaveFeed && fHex) BitWaveFeed.ingest(fHex, { name: 'Base58 Synth LCD', transport: 'lifecycle' });
    syncFloorUI();
    if (ChimeRack && ChimeRack.setView) ChimeRack.setView('rack');
    bump();
  }

  if ($('btnFloorLcdToggle')) {
    $('btnFloorLcdToggle').addEventListener('click', function () {
      var bar = $('floorLcdBar');
      if (!bar) return;
      var willShow = bar.hidden;
      bar.hidden = !willShow;
      if (willShow && state.floorScopeView !== 'lcd' && state.floorScopeView !== 'dual') {
        state.floorScopeView = 'dual';
      }
      syncFloorUI();
    });
  }
  if ($('btnLcdPlaneToggle')) {
    $('btnLcdPlaneToggle').addEventListener('click', function () {
      if (!SynthLCD) return;
      var next = !SynthLCD.isEnabled();
      SynthLCD.setConfig({ enabled: next });
      if (next) {
        if (Scene3D && Scene3D.setCameraView) Scene3D.setCameraView('front', state);
        if (state.floorScopeView !== 'lcd' && state.floorScopeView !== 'dual') {
          state.floorScopeView = 'dual';
        }
      }
      syncHudToggles();
      syncFloorUI();
      bump();
    });
  }
  document.querySelectorAll('.lcd-enc-btn[data-lcdenc]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (!SynthLCD) return;
      SynthLCD.setConfig({ encoding: btn.getAttribute('data-lcdenc') || 'base58' });
      if (state.floorScopeView !== 'lcd' && state.floorScopeView !== 'dual') {
        state.floorScopeView = 'lcd';
      }
      syncFloorUI();
      bump();
    });
  });
  if ($('btnLcdBinary')) {
    $('btnLcdBinary').addEventListener('click', function () {
      if (!SynthLCD) return;
      SynthLCD.setConfig({ harmorBinary: !SynthLCD.getConfig().harmorBinary });
      syncFloorUI();
      bump();
    });
  }
  if ($('lcdCoalesceSlider')) {
    $('lcdCoalesceSlider').addEventListener('input', function () {
      var v = Engine.clamp(parseFloat($('lcdCoalesceSlider').value) || 0, 0, 1);
      state.lcdCoalesce = v;
      if (SynthLCD) SynthLCD.setConfig({ coalesce: v });
      if (ModMatrix && ModMatrix.captureBase) ModMatrix.captureBase(state, 'lcdCoalesce');
      syncLcdUI();
      bump();
    });
  }
  if ($('btnLcdCsvUpload') && $('floorCsvFileInput')) {
    $('btnLcdCsvUpload').addEventListener('click', function () {
      bwAutoSync = false;
      $('floorCsvFileInput').click();
    });
    $('floorCsvFileInput').addEventListener('change', function () {
      var f = $('floorCsvFileInput').files && $('floorCsvFileInput').files[0];
      $('floorCsvFileInput').value = '';
      if (!f || !SynthLCD) return;
      var reader = new FileReader();
      reader.onload = function () {
        var res = SynthLCD.loadCsv(String(reader.result || ''), f.name);
        if (res.ok) {
          if (Object.keys(slotStages).length) refreshLifecycleRackStages();
          applyLifecycleStage(SynthLCD.getConfig().stageId, { enablePlane: true, openDual: true });
        } else if ($('lcdRowLbl')) {
          $('lcdRowLbl').textContent = 'CSV err: ' + (res.error || 'invalid');
        }
      };
      reader.readAsText(f);
    });
  }
  if ($('btnLcdRowPrev')) {
    $('btnLcdRowPrev').addEventListener('click', function () {
      if (!SynthLCD) return;
      SynthLCD.stepRow(-1);
      if (Object.keys(slotStages).length) refreshLifecycleRackStages();
      applyLifecycleStage(SynthLCD.getConfig().stageId, { keepEncoding: true, enablePlane: SynthLCD.isEnabled() });
    });
  }
  if ($('btnLcdRowNext')) {
    $('btnLcdRowNext').addEventListener('click', function () {
      if (!SynthLCD) return;
      SynthLCD.stepRow(1);
      if (Object.keys(slotStages).length) refreshLifecycleRackStages();
      applyLifecycleStage(SynthLCD.getConfig().stageId, { keepEncoding: true, enablePlane: SynthLCD.isEnabled() });
    });
  }
  document.querySelectorAll('.lcd-stage-btn[data-lcdstage]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      applyLifecycleStage(btn.getAttribute('data-lcdstage'), { enablePlane: true, openDual: true, focusFront: true });
    });
  });
  if ($('btnLcdSendRack')) {
    $('btnLcdSendRack').addEventListener('click', function () {
      populateLifecycleRack();
    });
  }
  if ($('floorBpmInput')) {
    $('floorBpmInput').addEventListener('input', function () {
      var b = parseFloat($('floorBpmInput').value);
      if (isFinite(b)) {
        state.floorBpm = Engine.clamp(Math.round(b), 40, 240);
        snapFloorZoomToBeats();
      }
    });
  }
  if ($('floorBeatsSelect')) {
    $('floorBeatsSelect').addEventListener('change', function () {
      var bts = parseFloat($('floorBeatsSelect').value);
      if (isFinite(bts) && bts > 0) {
        state.floorBeats = bts;
        snapFloorZoomToBeats();
      }
    });
  }
  document.querySelectorAll('.floor-demo-btn[data-fdemo]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var d = btn.getAttribute('data-fdemo');
      if (d === 'mod') {
        setActiveTab('modlogic');
        return;
      }
      exitBitWaveDisplay({ disableSync: true, hideBar: true });
      state.toggles.cutaway = true;
      state.toggles.floorWt = true;
      state.toggles.fourBitOrbit = false;
      state.toggles.animate = true;
      if (d === 'wavetable') {
        state.floorMode = 'wavetable';
        state.floorDepth = 0.72;
        state.floorSmooth = 0.55;
      } else if (d === 'minimeters') {
        state.floorMode = 'spectrogram';
        state.floorDepth = 0.82;
        state.floorSmooth = 0.58;
      } else if (d === 'fifths') {
        state.floorMode = 'spectrogram';
        state.r = 1.0; state.rIn = 0.67; state.orderN = 12;
        syncParamUI();
        if (ModMatrix && ModMatrix.captureBase) ModMatrix.captureBase(state);
        if (ModMatrix && ModMatrix.applyPreset) ModMatrix.applyPreset('chimeFifths');
      }
      syncHudToggles();
      syncFloorUI();
      bump();
    });
  });
  syncFloorUI();

  $('clearTrace').addEventListener('click', function () { Lissajous2D.clearTrail(); });
  $('btnRefWaves').addEventListener('click', function () {
    state.toggles.refWaves = !state.toggles.refWaves;
    syncHudToggles();
    bump();
  });

  // ---- Presets Dropdown (with <optgroup> categories) ----
  var presetSelect = $('presetSelect');
  var groupsMap = {};
  Presets.list.forEach(function (p, i) {
    var gName = p.group || 'Patches';
    if (!groupsMap[gName]) {
      var og = document.createElement('optgroup');
      og.label = gName;
      presetSelect.appendChild(og);
      groupsMap[gName] = og;
    }
    var opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = p.name;
    groupsMap[gName].appendChild(opt);
  });

  function applyPreset(idx) {
    var p = Presets.list[Number(idx)];
    if (!p) return;
    state.presetIndex = Number(idx);
    if (presetSelect) presetSelect.value = String(idx);
    state.note = p.note || '';
    $('patchNote').textContent = state.note;

    if (!p.formulas) {
      $('formulaDrawer').open = true;
      return;
    }
    if (GroverLens && GroverLens.close) GroverLens.close();

    ['x', 'y', 'z'].forEach(function (axis) {
      var expr = p.formulas[axis];
      var input = $('formula' + axis.toUpperCase());
      input.value = expr;
      input.classList.remove('invalid');
      $('err' + axis.toUpperCase()).textContent = '';
      state.formulas[axis] = expr;
    });

    var pr = p.params || {};
    PARAM_DEFS.forEach(function (d) {
      if (pr[d.key] != null) {
        state[d.key] = pr[d.key];
        $(d.id).setAttribute('data-default', String(pr[d.key]));
      }
    });
    if (pr.phaseDeg != null) {
      $('phaseSlider').setAttribute('data-default', String(pr.phaseDeg));
      setPhaseFromDeg(pr.phaseDeg);
    }

    if (p.hints) {
      if (p.hints.sliceGrid != null) state.toggles.sliceGrid = p.hints.sliceGrid;
      if (p.hints.cutaway != null) state.toggles.cutaway = p.hints.cutaway;
      if (p.hints.magnifier != null) state.toggles.magnifier = p.hints.magnifier;
      if (p.hints.fourBitOrbit != null) state.toggles.fourBitOrbit = p.hints.fourBitOrbit;
      state.toggles.strobeN = !!p.hints.strobeN;
      if (p.hints.magFocus) state.magFocus = p.hints.magFocus;
      if (p.hints.twinMode) setTwinMode(p.hints.twinMode);
    }

    syncParamUI();
    if (ModMatrix && typeof ModMatrix.captureBase === 'function') ModMatrix.captureBase(state);
    syncHudToggles();
    syncMagChips();
    if (slots && state.activeSlot && !isRestoringSlot) {
      slots[state.activeSlot] = captureSnapshot();
    }
    if (ChimeRack && ChimeRack.refresh) ChimeRack.refresh();
    bump();
  }

  presetSelect.addEventListener('change', function () { applyPreset(presetSelect.value); });

  // ---- Canonical Sphere Snapshot + VST A/B/C Slots & URL Hash Sharing ----
  var SLOT_ORDER = ['A', 'B', 'C'];

  // Snapshot helpers are AgentCore delegates so the legacy #patch= bytes, the
  // VST slots and the CLI/MCP share one implementation (contract §1).
  function captureSnapshot() {
    if (!AgentCore || typeof AgentCore.captureSnapshot !== 'function') return null;
    return AgentCore.captureSnapshot(state, presetIndexNow());
  }

  function snapshotFromPreset(idx, extra) {
    if (!AgentCore || typeof AgentCore.snapshotFromPreset !== 'function') return null;
    return AgentCore.snapshotFromPreset(idx, extra);
  }

  function sampleSnapshotPoints(snap) {
    if (!AgentCore || typeof AgentCore.sampleSnapshotPoints !== 'function') return [];
    return AgentCore.sampleSnapshotPoints(snap);
  }

  function applySnapshot(d) {
    if (!d) return false;
    isRestoringSlot = true;
    try {
      if (d.p != null && Presets.list[d.p]) {
        presetSelect.value = String(d.p);
        state.presetIndex = Number(d.p);
        var prObj = Presets.list[d.p];
        state.note = prObj.note || '';
        $('patchNote').textContent = state.note;
        var prDefaults = prObj.params || {};
        PARAM_DEFS.forEach(function (def) {
          if (prDefaults[def.key] != null && $(def.id)) {
            $(def.id).setAttribute('data-default', String(prDefaults[def.key]));
          }
        });
        if (prDefaults.phaseDeg != null && $('phaseSlider')) {
          $('phaseSlider').setAttribute('data-default', String(prDefaults.phaseDeg));
        }
      }
      ['x', 'y', 'z'].forEach(function (axis) {
        var key = 'f' + axis;
        if (d[key] != null) {
          state.formulas[axis] = d[key];
          var inp = $('formula' + axis.toUpperCase());
          if (inp) {
            inp.value = d[key];
            inp.classList.remove('invalid');
          }
          var err = $('err' + axis.toUpperCase());
          if (err) err.textContent = '';
        }
      });
      ['r', 'rIn', 'amp', 'f', 'K', 'orderN', 'a', 'b', 'n', 'm', 'k'].forEach(function (k) {
        if (typeof d[k] === 'number') state[k] = d[k];
      });
      if (typeof d.ph === 'number') setPhaseFromDeg(d.ph);
      if (d.tw) setTwinMode(d.tw);
      if (d.cut != null) state.toggles.cutaway = !!d.cut;
      if (d.sg != null) state.toggles.sliceGrid = !!d.sg;
      if (d.mag != null) state.toggles.magnifier = !!d.mag;
      if (d.str != null) state.toggles.strobeN = !!d.str;
      if (d.fb != null) state.toggles.fourBitOrbit = !!d.fb;
      if (d.qt != null) state.toggles.quadrayTetra = !!d.qt;
      if (d.mf) state.magFocus = d.mf;
      if (typeof d.mz === 'number') state.magZoom = d.mz;
      syncParamUI();
      if (ModMatrix && typeof ModMatrix.captureBase === 'function') ModMatrix.captureBase(state);
      syncHudToggles();
      syncMagChips();
    } finally {
      isRestoringSlot = false;
    }
    bump();
    return true;
  }

  function syncSlotTooltips() {
    if (!slots) return;
    document.querySelectorAll('.abc-btn[data-slot]').forEach(function (btn) {
      var s = btn.getAttribute('data-slot');
      var snap = slots[s];
      var pName = (snap && Presets.list[snap.p]) ? Presets.list[snap.p].name : 'Custom Patch';
      var idx = SLOT_ORDER.indexOf(s) + 1;
      btn.title = 'Slot ' + s + ' — ' + pName + ' (R=' + (snap ? snap.r.toFixed(2) : '1.00') +
        ', r=' + (snap ? snap.rIn.toFixed(2) : '0.45') + ') [Alt+' + idx + ']';
    });
  }

  function syncSlotUI() {
    document.querySelectorAll('.abc-btn[data-slot]').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-slot') === state.activeSlot);
    });
    var bar = $('abcBar');
    if (bar) bar.classList.toggle('copy-armed', copyArmed);
    var copyBtn = $('btnSlotCopy');
    if (copyBtn) {
      copyBtn.classList.toggle('armed', copyArmed);
      if (copyArmed) copyBtn.textContent = 'Paste \u2192 ?';
      else if (copyBtn.textContent === 'Paste \u2192 ?') copyBtn.textContent = 'Copy \u2192';
    }
    var ghostBtn = $('btnSlotGhost');
    if (ghostBtn) {
      ghostBtn.classList.toggle('active', !!state.toggles.ghostRef);
    }
    syncSlotTooltips();
  }

  function initSlots() {
    slots = {
      A: captureSnapshot(),
      B: snapshotFromPreset(5),                 // Analytic Morlet ψ(t) — 3D Conjugate Helix
      C: snapshotFromPreset(9, { orderN: 41 })  // Finite Field Torus Knot — Order N=41 Cavity
    };
    syncSlotUI();
  }

  function selectSlot(targetSlot) {
    if (!slots || !slots[targetSlot]) return;

    if (copyArmed) {
      copyArmed = false;
      if (targetSlot !== state.activeSlot) {
        var srcSlot = state.activeSlot;
        var cloned = JSON.parse(JSON.stringify(captureSnapshot()));
        slots[srcSlot] = captureSnapshot();
        state.ghostSlot = srcSlot;
        state.ghostPoints = (dirty === lastRendered && state.points && state.points.length)
          ? state.points.slice()
          : sampleSnapshotPoints(slots[srcSlot]);
        state.ghostRev = (state.ghostRev || 0) + 1;
        slots[targetSlot] = cloned;
        state.activeSlot = targetSlot;
        var copyBtn = $('btnSlotCopy');
        if (copyBtn) {
          copyBtn.textContent = 'Copied \u2192 ' + targetSlot;
          setTimeout(function () {
            if (!copyArmed && copyBtn) copyBtn.textContent = 'Copy \u2192';
          }, 1000);
        }
      }
      syncSlotUI();
      bump();
      return;
    }

    if (targetSlot === state.activeSlot) return;

    var prevSlot = state.activeSlot;
    slots[prevSlot] = captureSnapshot();
    state.ghostSlot = prevSlot;
    state.ghostPoints = (dirty === lastRendered && state.points && state.points.length)
      ? state.points.slice()
      : sampleSnapshotPoints(slots[prevSlot]);
    state.ghostRev = (state.ghostRev || 0) + 1;

    state.activeSlot = targetSlot;
    Lissajous2D.clearTrail();
    applySnapshot(slots[targetSlot]);
    if (slotStages[targetSlot] && SynthLCD) {
      var stMeta = slotStages[targetSlot];
      SynthLCD.setConfig({ stageId: stMeta.stageId, encoding: stMeta.encoding, enabled: true });
      if (BitWaveFeed && stMeta.hex) {
        BitWaveFeed.ingest(stMeta.hex, { name: stMeta.name, transport: 'lifecycle', preserveSelection: false });
      }
      syncLcdUI();
    }
    syncSlotUI();
    if (ChimeRack && ChimeRack.refresh) ChimeRack.refresh();
  }

  function cycleSlot(dir) {
    var idx = SLOT_ORDER.indexOf(state.activeSlot);
    var next = SLOT_ORDER[(idx + dir + SLOT_ORDER.length) % SLOT_ORDER.length];
    selectSlot(next);
  }

  var SPAWN_PRESET_CYCLE = [4, 2, 7, 1, 6, 8, 3, 12];

  function spawnChime(opts) {
    opts = opts || {};
    var maxChimes = (ChimeRack && ChimeRack.MAX_CHIMES) ? ChimeRack.MAX_CHIMES : 8;
    var allKeys = (ChimeRack && ChimeRack.ALL_KEYS) ? ChimeRack.ALL_KEYS : ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    if (SLOT_ORDER.length >= maxChimes) return null;

    var nextKey = null;
    for (var i = 0; i < allKeys.length; i++) {
      if (SLOT_ORDER.indexOf(allKeys[i]) < 0) { nextKey = allKeys[i]; break; }
    }
    if (!nextKey) return null;

    // Ensure current active slot is freshly snapshotted before spawning/cloning
    if (slots && state.activeSlot) {
      slots[state.activeSlot] = captureSnapshot();
    }

    var snap = null;
    if (opts.fromSlot && slots && slots[opts.fromSlot]) {
      snap = JSON.parse(JSON.stringify(slots[opts.fromSlot]));
    } else if (typeof opts.presetIndex === 'number' && Presets.list[opts.presetIndex]) {
      snap = snapshotFromPreset(opts.presetIndex);
    } else {
      var pickIdx = SPAWN_PRESET_CYCLE[(SLOT_ORDER.length - 3) % SPAWN_PRESET_CYCLE.length];
      snap = snapshotFromPreset(pickIdx);
    }
    if (!snap) snap = JSON.parse(JSON.stringify(captureSnapshot()));

    SLOT_ORDER.push(nextKey);
    slots[nextKey] = snap;
    selectSlot(nextKey);
    if (ChimeRack && ChimeRack.refresh) ChimeRack.refresh();
    return nextKey;
  }

  function removeChime(slotKey) {
    if (!slotKey || slotKey === 'A' || slotKey === 'B' || slotKey === 'C') return false;
    var idx = SLOT_ORDER.indexOf(slotKey);
    if (idx < 0) return false;
    SLOT_ORDER.splice(idx, 1);
    delete slots[slotKey];
    delete slotStages[slotKey];
    if (state.activeSlot === slotKey) {
      var fallback = SLOT_ORDER[Math.max(0, idx - 1)] || 'A';
      state.activeSlot = fallback;
      applySnapshot(slots[fallback]);
      syncSlotUI();
    }
    if (ChimeRack && ChimeRack.refresh) ChimeRack.refresh();
    return true;
  }

  function updateSlotParam(slotKey, paramKey, val) {
    if (!slots || !slots[slotKey]) return;
    if (slotKey === state.activeSlot) {
      if (paramKey === 'ph') {
        setPhaseFromDeg(val);
      } else if (paramKey === 'rIn') {
        state.rIn = Engine.clamp(val, 0, Math.min(2.4, state.r));
        updateShellReadout('rIn');
        syncParamUI();
        if (ModMatrix && ModMatrix.captureBase) {
          ModMatrix.captureBase(state, 'r');
          ModMatrix.captureBase(state, 'rIn');
        }
        bump();
      } else if (paramKey === 'tw') {
        setTwinMode(val);
      }
      slots[slotKey] = captureSnapshot();
    } else {
      if (paramKey === 'ph') slots[slotKey].ph = Engine.clamp(Math.round(val), -180, 180);
      else if (paramKey === 'rIn') slots[slotKey].rIn = Engine.clamp(val, 0, Math.min(2.4, slots[slotKey].r || 1));
      else if (paramKey === 'tw') slots[slotKey].tw = val;
    }
  }

  function toggleCopyArmed() {
    copyArmed = !copyArmed;
    syncSlotUI();
  }

  function toggleGhostRef() {
    state.toggles.ghostRef = !state.toggles.ghostRef;
    if (state.toggles.ghostRef && (!state.ghostPoints || !state.ghostPoints.length) && slots) {
      var refKey = state.activeSlot === 'A' ? 'B' : 'A';
      state.ghostSlot = refKey;
      state.ghostPoints = sampleSnapshotPoints(slots[refKey]);
      state.ghostRev = (state.ghostRev || 0) + 1;
    }
    syncSlotUI();
    bump();
  }

  document.querySelectorAll('.abc-btn[data-slot]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      selectSlot(btn.getAttribute('data-slot'));
    });
  });
  if ($('btnSlotCopy')) {
    $('btnSlotCopy').addEventListener('click', toggleCopyArmed);
  }
  if ($('btnSlotGhost')) {
    $('btnSlotGhost').addEventListener('click', toggleGhostRef);
  }

  function encodePatchHash() {
    return '#patch=' + encodeURIComponent(JSON.stringify(captureSnapshot()));
  }

  function restoreFromHash() {
    if (!location.hash || location.hash.indexOf('#patch=') !== 0) return false;
    try {
      var raw = decodeURIComponent(location.hash.slice(7));
      var d = JSON.parse(raw);
      return applySnapshot(d);
    } catch (e) {
      return false;
    }
  }

  $('btnShare').addEventListener('click', function () {
    var h = encodePatchHash();
    history.replaceState(null, '', h);
    var btn = $('btnShare');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(location.href).catch(function () {});
    }
    btn.textContent = 'Copied!';
    setTimeout(function () { btn.textContent = 'Share'; }, 1400);
  });

  // ---- Frobenius Controls ----
  $('frobK').addEventListener('input', function () {
    state.frobK = parseInt($('frobK').value, 10);
    $('frobKOut').textContent = String(state.frobK);
    bump();
  });
  $('frobN').addEventListener('input', function () {
    state.frobN = parseInt($('frobN').value, 10);
    $('frobNOut').textContent = String(state.frobN);
    bump();
  });
  $('frobP').addEventListener('change', function () {
    state.frobP = parseInt($('frobP').value, 10);
    bump();
  });
  $('frobCurve').addEventListener('change', function () {
    state.curveMode = $('frobCurve').value;
    applyFrobMode();
  });

  function applyFrobMode() {
    var secp = state.curveMode === 'secp';
    $('frobGeneric').style.display = secp ? 'none' : 'flex';
    $('secpSqrtRow').style.display = secp ? 'flex' : 'none';
    $('frobCurveOut').textContent = secp ? 'secp256k1' : 'generic pⁿ';
    $('frobPhasorTitle').innerHTML = secp
      ? 'secp256k1 &mdash; &lambda;<sup>k</sup> (main) &amp; &lambda;&#772;<sup>k</sup> (conjugate)'
      : 'Phasors &mdash; &lambda;<sup>k</sup> (main) &amp; &lambda;&#772;<sup>k</sup> (conjugate)';
    $('frobCountTitle').innerHTML = secp
      ? 'secp256k1 &mdash; S<sub>k</sub> = 2&middot;p<sup>k/2</sup>&middot;cos(k&phi;) &isin; &#8484;'
      : 'Hasse Trace &mdash; 2&middot;cos(k&phi;) over k';
    bump();
  }

  // ---- Telemetry & Bit Lab Readouts ----
  function updateReadouts(ph) {
    var r = Engine.readout(state, ph.point);
    $('angleReadout').textContent = r.angle;
    $('distReadout').textContent = r.dist;

    var badge = $('statusReadout');
    badge.textContent = r.status;
    var colorMap = {
      'ON SPHERE': '#4df3dd',
      'IN SHELL':  '#6ee7a0',
      'IN CAVITY': '#5aa9ff',
      'OUTSIDE':   '#ff6b6b',
      'NO EVAL':   '#7f8c9f'
    };
    var col = colorMap[r.status] || '#4df3dd';
    badge.style.color = col;
    badge.style.borderColor = col;

    var yInf = Engine.bitInspect(ph.point ? ph.point.y : NaN);
    $('quickHexReadout').textContent = yInf.hex;

    if (state.toggles.fourBitOrbit && $('fbNibbleBadge') && $('fbLiveCoord')) {
      var fb = Engine.fourBitOrbit(state, state.playT);
      $('fbNibbleBadge').textContent = fb.nibbleBin + ' (' + fb.nibbleHex + '·' + fb.nibbleVal + ')';
      $('fbLiveCoord').innerHTML =
        '8(1000) x=' + fb.real8.x.toFixed(2) +
        ' &harr; 1(0001) x=' + fb.real1.x.toFixed(2) +
        ' &middot; &theta;=' + fb.deg.toFixed(0) + '&deg;';
    }

    if (state.toggles.resonanceMode && Engine.sphereResonance && $('resonanceWidget')) {
      var res = Engine.sphereResonance(state, state.playT);
      updateResonanceWidget(res);
    }
    if (GroverLens && GroverLens.isActive && GroverLens.isActive()) {
      GroverLens.update(state);
    }
  }

  // ---- §§1–3 Floating Dual-Sphere Resonance & Archimedes Constant-Area Slice Canvas ----
  function drawArchimedesCanvas(res) {
    var c = $('archimedesCanvas');
    if (!c) return;
    var g = c.getContext('2d');
    var w = c.width, h = c.height;
    var harmor = !!(state.toggles && state.toggles.harmorVoid);

    g.clearRect(0, 0, w, h);
    g.fillStyle = harmor ? '#000000' : '#080c12';
    g.fillRect(0, 0, w, h);

    var R = Math.max(0.05, res.R);
    var rIn = Math.max(0, res.rIn);
    var maxArea = Math.PI * R * R;
    var padX = 12, padTop = 9, padBot = 13;
    var plotW = w - padX * 2;
    var plotH = h - padTop - padBot;

    function xForZ(z) { return padX + ((z + R) / (2 * R)) * plotW; }
    function yForArea(a) { return padTop + plotH * (1 - Engine.clamp(a / Math.max(1e-5, maxArea), 0, 1)); }

    // 1. Shaded Archimedes Constant-Area Plateau Corridor [-rIn, +rIn]
    if (res.cavityActive) {
      var xL = xForZ(-rIn), xR = xForZ(rIn);
      g.fillStyle = harmor ? 'rgba(0, 255, 102, 0.14)' : 'rgba(110, 231, 160, 0.12)';
      g.fillRect(xL, padTop, Math.max(1, xR - xL), plotH);

      g.strokeStyle = harmor ? 'rgba(0, 255, 102, 0.45)' : 'rgba(255, 107, 122, 0.55)';
      g.lineWidth = 1;
      g.setLineDash([2, 2]);
      g.beginPath();
      g.moveTo(xL, padTop); g.lineTo(xL, padTop + plotH);
      g.moveTo(xR, padTop); g.lineTo(xR, padTop + plotH);
      g.stroke();
      g.setLineDash([]);
    }

    // 2. Reference Outer Circle Area Curve pi*(R^2 - z^2) (faint dashed parabola)
    if (res.cavityActive) {
      g.strokeStyle = harmor ? 'rgba(57, 255, 20, 0.28)' : 'rgba(77, 243, 221, 0.28)';
      g.lineWidth = 1;
      g.setLineDash([3, 3]);
      g.beginPath();
      for (var s = 0; s <= 64; s++) {
        var u = (s / 64) * 2 - 1;
        var z = u * R;
        var aOut = Math.PI * Math.max(0, R * R - z * z);
        var px = xForZ(z), py = yForArea(aOut);
        if (s === 0) g.moveTo(px, py); else g.lineTo(px, py);
      }
      g.stroke();
      g.setLineDash([]);
    }

    // 3. Archimedes Ring Area Curve A_ring(z) = pi*(rho_out^2 - rho_in^2):
    //    Flat horizontal plateau pi*(R^2 - r^2) across [-r, +r], parabolic taper in polar caps!
    g.beginPath();
    for (var i = 0; i <= 80; i++) {
      var ui = (i / 80) * 2 - 1;
      var zi = ui * R;
      var aO = Math.PI * Math.max(0, R * R - zi * zi);
      var aI = (res.cavityActive && Math.abs(zi) <= rIn) ? (Math.PI * Math.max(0, rIn * rIn - zi * zi)) : 0;
      var aRing = aO - aI;
      var xi = xForZ(zi), yi = yForArea(aRing);
      if (i === 0) g.moveTo(xi, yi); else g.lineTo(xi, yi);
    }
    g.strokeStyle = harmor ? '#00ff66' : '#6ee7a0';
    g.lineWidth = 2;
    g.stroke();

    // 4. Current Axial Slice Cursor at z = res.slice.z
    var sl = res.slice;
    var cx = xForZ(sl.z);
    var cy = yForArea(sl.areaRing);

    g.strokeStyle = sl.inCavitySpan ? '#ffd166' : '#4df3dd';
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(cx, padTop);
    g.lineTo(cx, padTop + plotH);
    g.stroke();

    g.fillStyle = sl.inCavitySpan ? '#ffd166' : '#4df3dd';
    g.beginPath();
    g.arc(cx, cy, 3.3, 0, Math.PI * 2);
    g.fill();

    // 5. Axis labels (-R, -r, +r, +R)
    g.fillStyle = '#8b9bb0';
    g.font = '9px "Cascadia Code", Consolas, monospace';
    g.textAlign = 'left';
    g.fillText('−R', 3, h - 3);
    g.textAlign = 'right';
    g.fillText('+R', w - 3, h - 3);
    if (res.cavityActive) {
      g.fillStyle = harmor ? '#00ff66' : '#6ee7a0';
      g.textAlign = 'center';
      g.fillText('[-r..+r] CONST AREA', w * 0.5, h - 3);
    } else {
      g.textAlign = 'center';
      g.fillText('z = 0 (Solid Sphere)', w * 0.5, h - 3);
    }
  }

  function updateResonanceWidget(res) {
    var triadBadge = $('resTriadBadge');
    if (triadBadge) {
      if (res.bowHalfPowerLock) {
        triadBadge.textContent = '★ −3 dB BOW LOCK';
      } else if (res.syzygy.locked && res.cavityActive) {
        triadBadge.textContent = '★ ' + res.syzygy.triadText + ' LOCK';
      } else {
        triadBadge.textContent = res.syzygy.triadText;
      }
      triadBadge.classList.toggle('locked', !!(res.syzygy.locked || res.bowHalfPowerLock));
    }

    if ($('resOutMult')) $('resOutMult').textContent = '1.00×';
    if ($('resOutK')) $('resOutK').textContent = 'k₁=' + res.modes.outer[0].toFixed(2);

    if ($('resInMult')) {
      $('resInMult').textContent = res.cavityActive ? (res.stretchRatio.toFixed(2) + '×') : 'OFF';
    }
    if ($('resInK')) {
      $('resInK').textContent = res.cavityActive ? ('k₁=' + res.modes.inner[0].toFixed(2)) : 'r = 0';
    }

    if ($('resWallMult')) {
      $('resWallMult').textContent = res.wallRatio ? (res.wallRatio.toFixed(2) + '×') : '—';
    }
    if ($('resWallK')) {
      $('resWallK').textContent = res.modes.shell[0] ? ('k₁=' + res.modes.shell[0].toFixed(2)) : '—';
    }

    var archBadge = $('resArchBadge');
    if (archBadge) {
      if (res.slice.inCavitySpan) {
        archBadge.textContent = 'CONST π(R²−r²) = ' + res.slice.areaRing.toFixed(2);
        archBadge.className = 'arch-chip plateau';
      } else {
        archBadge.textContent = 'CAP π(R²−z²) = ' + res.slice.areaRing.toFixed(2);
        archBadge.className = 'arch-chip cap';
      }
    }

    if ($('resSliceZOut')) {
      $('resSliceZOut').textContent = 'z=' + (res.slice.z >= 0 ? '+' : '') + res.slice.z.toFixed(2);
    }
    if (state.archimedesAuto !== false && $('archimedesZSlider')) {
      $('archimedesZSlider').value = res.slice.zNorm.toFixed(2);
    }
    if ($('rackSliceZOut')) {
      var modActiveSlice = ModMatrix && ModMatrix.isTargetRouted && ModMatrix.isTargetRouted('archimedesZNorm');
      if (!modActiveSlice) {
        $('rackSliceZOut').textContent = (res.slice.zNorm >= 0 ? '+' : '') + res.slice.zNorm.toFixed(2);
        if (state.archimedesAuto !== false && $('rackSliceZ') && document.activeElement !== $('rackSliceZ')) {
          $('rackSliceZ').value = res.slice.zNorm.toFixed(2);
        }
      }
    }

    drawArchimedesCanvas(res);
  }

  var _bitCache = { x: '', y: '', z: '' };
  function writeBitCard(prefix, key, lbl, val) {
    var inf = Engine.bitInspect(val);
    var sig = lbl + '|' + inf.hex;
    if (_bitCache[key] === sig) return;
    _bitCache[key] = sig;

    $('bitLbl' + key.toUpperCase()).textContent = lbl;
    $(prefix + 'val').textContent = inf.val;
    $(prefix + 'exp').textContent = inf.expDesc;
    $(prefix + 'hex').textContent = inf.hex;

    var chip = $(prefix + 'kind');
    chip.textContent = inf.kind;
    chip.className = 'bit-chip ' + (inf.kind === 'NaN' ? 'nan' : (inf.kind === 'finite' ? 'finite' : 'inf'));

    $(prefix + 'bin').innerHTML =
      '<span class="b-sign">' + inf.signBit + '</span> ' +
      '<span class="b-exp">' + inf.expBits + '</span> ' +
      '<span class="b-mant">' + inf.mantBits + '</span>';
  }

  function updateBitInspector(ph) {
    if (!ph) ph = Engine.playhead(state, state.points, state.playT);
    var p = ph.point;
    var want = (state.twinMode !== 'off' && ph.twin) ? ph.twin : ph.point;
    window.__bitPoint = want ? { x: want.x, y: want.y, z: want.z } : null;

    if (state.bitSource === 'ramanujan') {
      var ram = Engine.ramanujanSeries(1);
      writeBitCard('bitx', 'x', 'π (true)', Math.fround(Math.PI));
      writeBitCard('bity', 'y', 'Ram k=0', ram.rows[0].piRamF32);
      writeBitCard('bitz', 'z', 'Four k=0', ram.rows[0].piFourF32);
      return;
    }

    var srcPt = (state.bitSource === 'main') ? p : want;
    var tag = (state.bitSource === 'main' || state.twinMode === 'off') ? '' : (state.twinMode === 'antipodal' ? ' (−P)' : ' (P̄)');
    if (!srcPt) {
      writeBitCard('bitx', 'x', 'x', NaN);
      writeBitCard('bity', 'y', 'y', NaN);
      writeBitCard('bitz', 'z', 'z', NaN);
      return;
    }
    writeBitCard('bitx', 'x', 'x' + tag, srcPt.x);
    writeBitCard('bity', 'y', 'y' + tag, srcPt.y);
    writeBitCard('bitz', 'z', 'z' + tag, srcPt.z);
  }

  function updateFrobReadouts() {
    if (state.curveMode === 'secp') {
      var r = Engine.secpReadout(state);
      $('frobPhi').textContent = r.frobPhi;
      $('frobTrace').textContent = r.frobTrace;
      $('frobCount').textContent = r.frobCount;
      $('secpSqrt').textContent = r.secpSqrt;
    } else {
      var g = Engine.frobReadout(state);
      $('frobPhi').textContent = g.frobPhi;
      $('frobTrace').textContent = g.frobTrace;
      $('frobCount').textContent = g.frobCount;
    }
  }

  // ---- Theatre / Fullscreen / Pop-Out Main Display Mode ----
  var theatreMode = false;
  var hudHidden = false;

  function isFullscreenNow() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
  }

  function syncDisplayModeUI() {
    var fs = isFullscreenNow();
    var expanded = theatreMode || fs || IS_POPOUT;
    if (document.body) {
      document.body.classList.toggle('theatre-mode', theatreMode || IS_POPOUT);
      document.body.classList.toggle('is-fullscreen', fs);
      document.body.classList.toggle('popout-mode', IS_POPOUT);
      document.body.classList.toggle('hud-hidden', hudHidden && expanded);
    }
    if ($('btnTheatre')) $('btnTheatre').classList.toggle('active', theatreMode);
    if ($('btnFullscreen')) $('btnFullscreen').classList.toggle('active', fs);
    if ($('btnHudHide')) $('btnHudHide').hidden = !expanded;
    if ($('btnHudRestore')) $('btnHudRestore').hidden = !(hudHidden && expanded);
    if ($('theatreBar')) $('theatreBar').hidden = !expanded || hudHidden;
    if ($('btnExitTheatre')) {
      $('btnExitTheatre').textContent = (IS_POPOUT && !fs) ? '✕ Close' : '✕ Exit';
    }
    if ($('theatreOrderN')) $('theatreOrderN').value = Math.round(state.orderN || 19);
    if ($('theatreOrderNOut')) $('theatreOrderNOut').textContent = String(Math.round(state.orderN || 19));
    var pDeg = Math.round(((state.phaseRad || 0) * 180 / Math.PI));
    if ($('theatrePhase')) $('theatrePhase').value = pDeg;
    if ($('theatrePhaseOut')) $('theatrePhaseOut').textContent = pDeg + '°';
  }

  function setTheatreMode(on) {
    theatreMode = !!on;
    if (!theatreMode && !isFullscreenNow()) hudHidden = false;
    syncDisplayModeUI();
    requestAnimationFrame(function () { Scene3D.resize(); });
  }

  function setHudHidden(hidden) {
    hudHidden = !!hidden;
    syncDisplayModeUI();
  }

  function toggleFullscreen() {
    var vp = $('viewport3d');
    if (isFullscreenNow()) {
      var exitFn = document.exitFullscreen || document.webkitExitFullscreen;
      if (exitFn) {
        try { exitFn.call(document); } catch (e) { setTheatreMode(false); }
      }
      return;
    }
    var reqFn = vp && (vp.requestFullscreen || vp.webkitRequestFullscreen);
    if (reqFn) {
      try {
        var res = reqFn.call(vp);
        if (res && typeof res.catch === 'function') {
          res.catch(function () { setTheatreMode(true); });
        }
      } catch (e) {
        setTheatreMode(true);
      }
    } else {
      setTheatreMode(!theatreMode);
    }
  }

  function buildPopoutPayload(full) {
    if (!full) {
      return {
        kind: 'tick',
        playT: state.playT,
        phaseRad: state.phaseRad,
        orderN: state.orderN
      };
    }
    var tg = {};
    for (var k in state.toggles) {
      if (hasOwn(state.toggles, k)) tg[k] = state.toggles[k];
    }
    return {
      kind: 'full',
      presetIndex: presetIndexNow(),
      r: state.r, rIn: state.rIn, amp: state.amp, f: state.f,
      K: state.K, orderN: state.orderN, a: state.a, b: state.b,
      n: state.n, m: state.m, k: state.k, phaseRad: state.phaseRad,
      twinMode: state.twinMode,
      formulas: { x: state.formulas.x, y: state.formulas.y, z: state.formulas.z },
      toggles: tg,
      magZoom: state.magZoom,
      magFocus: state.magFocus,
      playT: state.playT,
      ghostSlot: state.ghostSlot,
      ghostRev: state.ghostRev,
      ghostPoints: (state.toggles.ghostRef && state.ghostPoints) ? state.ghostPoints : null,
      orderAutoMode: autoLanes.orderN.mode,
      phaseAutoMode: autoLanes.phase.mode
    };
  }

  function sendPopoutSync(full) {
    if (IS_POPOUT || !popoutWin) return;
    if (popoutWin.closed) {
      popoutWin = null;
      if ($('btnPopout')) $('btnPopout').classList.remove('active');
      return;
    }
    try {
      popoutWin.postMessage({ type: 'rs-sync', data: buildPopoutPayload(full) }, '*');
    } catch (e) { /* ignore closed/unreachable */ }
  }

  function sendPopoutCommand(cmd, value) {
    if (!IS_POPOUT || !window.opener || window.opener.closed) return;
    try {
      window.opener.postMessage({ type: 'rs-cmd', cmd: cmd, value: value }, '*');
    } catch (e) { /* ignore */ }
  }

  function applyRemoteSync(data) {
    if (!data || typeof data !== 'object') return;
    isApplyingRemoteSync = true;
    suppressAgentPublish = true;
    try {
      if (data.kind === 'tick') {
        var changed = (state.phaseRad !== data.phaseRad) || (state.orderN !== data.orderN);
        state.playT = data.playT;
        if (data.orderN != null && data.orderN !== state.orderN) {
          state.orderN = data.orderN;
          $('orderN').value = Math.round(data.orderN);
          $('orderNOut').textContent = String(Math.round(data.orderN));
          if ($('theatreOrderN')) $('theatreOrderN').value = Math.round(data.orderN);
          if ($('theatreOrderNOut')) $('theatreOrderNOut').textContent = String(Math.round(data.orderN));
          updateOrderNBadge();
        }
        if (data.phaseRad != null && data.phaseRad !== state.phaseRad) {
          setPhaseFromDeg((data.phaseRad * 180) / Math.PI, true);
        }
        if (changed) bumpAnimated();
        return;
      }
      if (data.presetIndex != null && data.presetIndex !== state.presetIndex) {
        applyPreset(data.presetIndex);
      }
      ['r', 'rIn', 'amp', 'f', 'K', 'orderN', 'a', 'b', 'n', 'm', 'k'].forEach(function (k) {
        if (typeof data[k] === 'number') state[k] = data[k];
      });
      if (data.formulas) {
        ['x', 'y', 'z'].forEach(function (axis) {
          if (data.formulas[axis] != null) state.formulas[axis] = data.formulas[axis];
        });
      }
      if (data.twinMode) setTwinMode(data.twinMode);
      if (data.toggles) {
        for (var tk in data.toggles) {
          if (hasOwn(data.toggles, tk)) state.toggles[tk] = !!data.toggles[tk];
        }
      }
      if (typeof data.magZoom === 'number') state.magZoom = data.magZoom;
      if (data.magFocus) state.magFocus = data.magFocus;
      if (typeof data.playT === 'number') state.playT = data.playT;
      if (data.ghostPoints) {
        state.ghostSlot = data.ghostSlot || '';
        state.ghostRev = data.ghostRev || 0;
        state.ghostPoints = data.ghostPoints;
      }
      if (data.orderAutoMode) {
        autoLanes.orderN.mode = data.orderAutoMode;
        syncAutoLaneUI(autoLanes.orderN);
      }
      if (data.phaseAutoMode) {
        autoLanes.phase.mode = data.phaseAutoMode;
        syncAutoLaneUI(autoLanes.phase);
      }
      syncParamUI();
      if (typeof data.phaseRad === 'number') {
        setPhaseFromDeg((data.phaseRad * 180) / Math.PI, true);
      }
      syncHudToggles();
      syncMagChips();
      bumpAnimated();
    } finally {
      suppressAgentPublish = false;
      isApplyingRemoteSync = false;
    }
  }

  function openPopout() {
    if (popoutWin && !popoutWin.closed) {
      popoutWin.focus();
      sendPopoutSync(true);
      return;
    }
    var baseUrl = deeplinkNow();
    var popUrl = baseUrl + (baseUrl.indexOf('?') >= 0 ? '&' : '?') + 'popout=1';
    popoutWin = window.open(popUrl, 'ramanujan-sphere-popout', 'popup=yes,width=1200,height=820');
    var btn = $('btnPopout');
    if (!popoutWin || popoutWin.closed) {
      popoutWin = null;
      if (btn) {
        var orig = btn.innerHTML;
        btn.textContent = 'Blocked — use Theatre';
        setTimeout(function () { btn.innerHTML = orig; }, 2200);
      }
      return;
    }
    if (btn) btn.classList.add('active');
    setTimeout(function () { sendPopoutSync(true); }, 350);
  }

  window.addEventListener('message', function (ev) {
    var msg = ev && ev.data;
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'rs-popout-hello' && !IS_POPOUT && popoutWin && ev.source === popoutWin) {
      sendPopoutSync(true);
    } else if (msg.type === 'rs-sync' && IS_POPOUT && ev.source === window.opener) {
      hasOpenerSync = true;
      if ($('popoutSyncBadge')) $('popoutSyncBadge').hidden = false;
      applyRemoteSync(msg.data);
    } else if (msg.type === 'rs-cmd' && !IS_POPOUT && popoutWin && ev.source === popoutWin) {
      if (msg.cmd === 'orderN') {
        $('orderN').value = msg.value;
        $('orderN').dispatchEvent(new Event('input'));
      } else if (msg.cmd === 'phase') {
        setPhaseFromDeg(msg.value);
      } else if (msg.cmd === 'autoMode' && msg.value) {
        setAutoMode(msg.value.key, msg.value.mode);
        sendPopoutSync(true);
      } else if (msg.cmd === 'toggle' && hasOwn(state.toggles, msg.value)) {
        state.toggles[msg.value] = !state.toggles[msg.value];
        syncHudToggles();
        bump();
      }
    }
  });

  if ($('btnTheatre')) $('btnTheatre').addEventListener('click', function () { setTheatreMode(!theatreMode); });
  if ($('btnFullscreen')) $('btnFullscreen').addEventListener('click', toggleFullscreen);
  if ($('btnPopout')) $('btnPopout').addEventListener('click', openPopout);
  if ($('btnHudHide')) $('btnHudHide').addEventListener('click', function () { setHudHidden(true); });
  if ($('btnHudRestore')) $('btnHudRestore').addEventListener('click', function () { setHudHidden(false); });
  if ($('btnExitTheatre')) {
    $('btnExitTheatre').addEventListener('click', function () {
      if (isFullscreenNow()) toggleFullscreen();
      else if (IS_POPOUT) window.close();
      else setTheatreMode(false);
    });
  }
  if ($('theatreOrderN')) {
    $('theatreOrderN').addEventListener('input', function () {
      var v = parseInt($('theatreOrderN').value, 10);
      if (IS_POPOUT && hasOpenerSync && window.opener && !window.opener.closed) {
        sendPopoutCommand('orderN', v);
      } else {
        $('orderN').value = v;
        $('orderN').dispatchEvent(new Event('input'));
      }
    });
  }
  if ($('theatrePhase')) {
    $('theatrePhase').addEventListener('input', function () {
      var v = parseFloat($('theatrePhase').value);
      if (IS_POPOUT && hasOpenerSync && window.opener && !window.opener.closed) {
        sendPopoutCommand('phase', v);
      } else {
        setPhaseFromDeg(v);
      }
    });
  }
  document.addEventListener('fullscreenchange', function () {
    if (!isFullscreenNow() && !theatreMode) hudHidden = false;
    syncDisplayModeUI();
    requestAnimationFrame(function () { Scene3D.resize(); });
  });
  document.addEventListener('webkitfullscreenchange', function () {
    if (!isFullscreenNow() && !theatreMode) hudHidden = false;
    syncDisplayModeUI();
    requestAnimationFrame(function () { Scene3D.resize(); });
  });

  // ---- Collapsible Left Rack & Bottom Dock (Viewport stretches/compresses smoothly) ----
  var panelCollapsed = false;
  var dockCollapsed = false;

  function setPanelCollapsed(collapsed) {
    panelCollapsed = !!collapsed;
    if (document.body) document.body.classList.toggle('panel-collapsed', panelCollapsed);
    if ($('btnExpandPanel')) $('btnExpandPanel').hidden = !panelCollapsed;
    requestAnimationFrame(function () { if (Scene3D && Scene3D.resize) Scene3D.resize(); });
  }

  function setDockCollapsed(collapsed) {
    dockCollapsed = !!collapsed;
    if (document.body) document.body.classList.toggle('dock-collapsed', dockCollapsed);
    if ($('btnExpandDock')) $('btnExpandDock').hidden = !dockCollapsed;
    requestAnimationFrame(function () { if (Scene3D && Scene3D.resize) Scene3D.resize(); });
  }

  if ($('btnCollapsePanel')) $('btnCollapsePanel').addEventListener('click', function () { setPanelCollapsed(true); });
  if ($('btnExpandPanel')) $('btnExpandPanel').addEventListener('click', function () { setPanelCollapsed(false); });
  if ($('btnCollapseDock')) $('btnCollapseDock').addEventListener('click', function () { setDockCollapsed(true); });
  if ($('btnExpandDock')) $('btnExpandDock').addEventListener('click', function () { setDockCollapsed(false); });

  // ---- Keyboard Studio Shortcuts ----
  window.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') {
      if (ChimeRack && ChimeRack.getView && ChimeRack.getView() !== 'stage') {
        ChimeRack.setView('stage');
        return;
      }
      if (theatreMode && !IS_POPOUT && !isFullscreenNow()) { setTheatreMode(false); return; }
      if (hudHidden) { setHudHidden(false); return; }
    }
    var tag = (ev.target && ev.target.tagName) ? ev.target.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'select' || tag === 'textarea') return;

    if (ev.code === 'Space') {
      ev.preventDefault();
      state.toggles.animate = !state.toggles.animate;
      syncHudToggles();
      bump();
    } else if (ev.altKey && ev.key === '1') { ev.preventDefault(); selectSlot('A'); }
    else if (ev.altKey && ev.key === '2') { ev.preventDefault(); selectSlot('B'); }
    else if (ev.altKey && ev.key === '3') { ev.preventDefault(); selectSlot('C'); }
    else if (ev.key === '[') cycleSlot(-1);
    else if (ev.key === ']') cycleSlot(1);
    else if (ev.key === '\\') setPanelCollapsed(!panelCollapsed);
    else if (ev.key === '`') setDockCollapsed(!dockCollapsed);
    else if (ev.key === 'g' || ev.key === 'G') toggleGhostRef();
    else if (ev.key === '1') { setDockCollapsed(false); setActiveTab('scopes'); }
    else if (ev.key === '2') { setDockCollapsed(false); setActiveTab('harmonics'); }
    else if (ev.key === '3') { setDockCollapsed(false); setActiveTab('frobenius'); }
    else if (ev.key === '4') { setDockCollapsed(false); setActiveTab('bits'); }
    else if (ev.key === '5') { setDockCollapsed(false); setActiveTab('modlogic'); }
    else if (ev.key === '6') { setDockCollapsed(false); setActiveTab('floorwt'); }
    else if (ev.key === '7') { setDockCollapsed(false); setActiveTab('agent'); }
    else if (ev.key === '?') toggleGuideTab();
    else if (ev.key === 'w' || ev.key === 'W') {
      state.toggles.floorWt = !state.toggles.floorWt;
      if (state.toggles.floorWt && !state.toggles.cutaway) state.toggles.cutaway = true;
      syncHudToggles();
      syncFloorUI();
      bump();
    }
    else if (ev.key === 'z' || ev.key === 'Z') {
      state.toggles.magnifier = !state.toggles.magnifier;
      syncHudToggles();
      bump();
    } else if (ev.key === 'c' || ev.key === 'C') {
      state.toggles.cutaway = !state.toggles.cutaway;
      syncHudToggles();
      bump();
    } else if (ev.key === 'n' || ev.key === 'N') {
      state.toggles.strobeN = !state.toggles.strobeN;
      syncHudToggles();
      bump();
    } else if ((ev.key === 'f' || ev.key === 'F') && ev.shiftKey) {
      ev.preventDefault();
      toggleFullscreen();
    } else if (ev.key === 'f' || ev.key === 'F') {
      Scene3D.setCameraView('front', state);
      syncHudToggles();
      bump();
    } else if (ev.key === 't' || ev.key === 'T') {
      if (!IS_POPOUT) setTheatreMode(!theatreMode);
    } else if (ev.key === 'h' || ev.key === 'H') {
      if (theatreMode || isFullscreenNow() || IS_POPOUT) setHudHidden(!hudHidden);
    } else if (ev.key === 'b' || ev.key === 'B') {
      state.toggles.fourBitOrbit = !state.toggles.fourBitOrbit;
      syncHudToggles();
      bump();
    } else if (ev.key === 'r' || ev.key === 'R') {
      state.toggles.resonanceMode = !state.toggles.resonanceMode;
      syncHudToggles();
      bump();
    } else if (ev.key === 'v' || ev.key === 'V') {
      state.toggles.harmorVoid = !state.toggles.harmorVoid;
      syncHudToggles();
      bump();
    } else if (ev.key === 'm' || ev.key === 'M') {
      if (ChimeRack && ChimeRack.getView && ChimeRack.setView) {
        ChimeRack.setView(ChimeRack.getView() === 'rack' ? 'stage' : 'rack');
      }
    }
  });

  // ---- Init & Main 60fps Studio Loop ----
  function initAll() {
    document.body.setAttribute('data-agent-active-tab', state.activeTab);
    Engine.initSecp(state);
    Scene3D.init($('viewport3d'), state);
    Magnifier2D.init($('magnifierCanvas'));
    Lissajous2D.init($('lissajous'));
    TimeSeries.init($('timeseries'));
    Harmonics2D.init($('harmonicSpecCanvas'), $('ramanujanCanvas'));
    Frobenius.init($('frobPhasor'), $('frobCountCanvas'));
    if (FloorView && typeof FloorView.init === 'function') FloorView.init($('floorViewCanvas'));

    applyFrobMode();
    if (!restoreFromHash()) {
      // Contract §4 mount flow: parse the deeplink, apply its preset first, then
      // the pre-normalized patch (tolerant parser; never re-validate here).
      var mount = parseMountDeeplink();
      var mountPreset = (mount && typeof mount.presetIndex === 'number') ? mount.presetIndex : 12;
      presetSelect.value = String(mountPreset);
      applyPresetRebase(mountPreset);
      if (mount && patchHasKeys(mount.patch)) {
        suppressAgentPublish = true;
        try { applyNormalizedPatch(mount.patch); } finally { suppressAgentPublish = false; }
      }
      publishAgent();
    }
    initSlots();
    if (ChimeRack && typeof ChimeRack.init === 'function') {
      ChimeRack.init({
        getSlots: function () { return slots; },
        getSlotOrder: function () { return SLOT_ORDER; },
        getSlotStages: function () { return slotStages; },
        getActiveSlot: function () { return state.activeSlot; },
        selectSlot: selectSlot,
        spawnChime: spawnChime,
        removeChime: removeChime,
        updateSlotParam: updateSlotParam,
        loadPresetIntoActive: function (idx) {
          applyPreset(idx);
          if (slots && state.activeSlot) slots[state.activeSlot] = captureSnapshot();
        }
      });
    }
    if (ModMatrix && typeof ModMatrix.init === 'function') {
      ModMatrix.init({
        getState: function () { return state; },
        setActiveTab: function (tabId) { setDockCollapsed(false); setActiveTab(tabId); },
        setPlayhead: function (t) {
          state.playT = Engine.clamp(Number(t) || 0, 0, 1);
          state.toggles.animate = false;
          syncHudToggles();
          bump();
        },
        setLockVolume: setLockVolumeMode,
        syncHudToggles: syncHudToggles,
        setPanelCollapsed: setPanelCollapsed,
        onParamsRestored: function () {
          syncParamUI();
          setPhaseFromDeg((state.phaseRad || 0) * 180 / Math.PI, true);
          bumpAnimated();
        }
      });
    }
    if (START_THEATRE) {
      theatreMode = true;
      syncDisplayModeUI();
      requestAnimationFrame(function () { Scene3D.resize(); });
    } else {
      syncDisplayModeUI();
    }
    if (IS_POPOUT && window.opener && !window.opener.closed) {
      try { window.opener.postMessage({ type: 'rs-popout-hello' }, '*'); } catch (e) { /* ignore */ }
    }
    // Signal the bridge (js/agent-bridge.js) that the app is initialized and the
    // state is stable; it installs window.ramanujanSphere and emits the single
    // mount `ramanujan-sphere:change` event after this point.
    appReady = true;
    var pendingReady = readyQueue;
    readyQueue = [];
    for (var ri = 0; ri < pendingReady.length; ri++) {
      try { pendingReady[ri](); } catch (e) { /* isolate */ }
    }
    requestAnimationFrame(frame);
  }

  var last = performance.now();
  function frame(now) {
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    if (IS_POPOUT && hasOpenerSync && (!window.opener || window.opener.closed)) {
      hasOpenerSync = false;
      if ($('popoutSyncBadge')) $('popoutSyncBadge').hidden = true;
    }

    var remoteControlled = IS_POPOUT && hasOpenerSync;
    var autoMoved = false;
    if (!remoteControlled) {
      if (stepAutoLane(autoLanes.orderN, dt)) autoMoved = true;
      if (stepAutoLane(autoLanes.phase, dt)) autoMoved = true;
      if (state.toggles.animate) {
        state.playT = (state.playT + dt * PLAY_SPEED) % 1;
      }
      if (ModMatrix && typeof ModMatrix.evaluate === 'function') {
        var modRes = ModMatrix.evaluate(state, state.playT, dt);
        if (modRes && modRes.changed) {
          autoMoved = true;
          updateShellReadout();
          bumpAnimated();
        }
      }
      if (popoutWin && (autoMoved || state.toggles.animate)) {
        sendPopoutSync(false);
      }
    }

    if (dirty !== lastRendered) {
      var res = Engine.sample(state, SAMPLES);
      state.points = res.points;
      state.maxAbs = res.maxAbs;
      state.curveValid = res.valid;
      lastRendered = dirty;
    }

    var ph = Engine.playhead(state, state.points, state.playT);
    window.__lastPlayhead = ph;

    // §10 Cutaway Floor 3D Wavetable / MiniMeters 3D Spectrogram field (computed only when active)
    var floorFieldData = null;
    if ((state.toggles.floorWt || state.activeTab === 'floorwt') && Engine.floorField) {
      var audioOpts = (FloorView && FloorView.getAudioOptions) ? FloorView.getAudioOptions(state) : null;
      floorFieldData = Engine.floorField(state, state.playT, audioOpts || undefined);
    }

    // Always render Hero 3D Sphere + Zoom Lens (when open) + Multi-Chime Front f(x) Rack/Menu (when active)
    Scene3D.update(state, state.playT, state.points, lastRendered, floorFieldData);
    Magnifier2D.update(state, state.playT);
    if (ChimeRack && typeof ChimeRack.update === 'function') {
      ChimeRack.update(state, state.points, state.playT, floorFieldData);
    }

    // Update active dock tab views (plus Lissajous Crosshair for agreement hook)
    Lissajous2D.update(state, state.playT, state.points, lastRendered);
    if (state.activeTab === 'scopes') {
      TimeSeries.update(state, state.points, lastRendered, state.playT);
    } else if (state.activeTab === 'harmonics') {
      Harmonics2D.update(state);
    } else if (state.activeTab === 'frobenius') {
      Frobenius.update(state);
      updateFrobReadouts();
    } else if (state.activeTab === 'modlogic' && ModMatrix && typeof ModMatrix.drawScope === 'function') {
      ModMatrix.drawScope(state);
    } else if (state.activeTab === 'floorwt' && FloorView && floorFieldData) {
      FloorView.update(state, floorFieldData);
      updateFloorReadouts(floorFieldData);
    }

    updateReadouts(ph);
    updateBitInspector(ph);

    // Verify single-source-of-truth cross-view invariant
    var m = window.__scene3dPoint;
    var l = window.__lissCross;
    var b = window.__bitPoint;
    var want = (state.twinMode !== 'off' && ph.twin) ? ph.twin : ph.point;
    window.__agree = !!(ph.point && m && b) &&
      m.x === ph.point.x && m.y === ph.point.y && m.z === ph.point.z &&
      (!l || (l.x === ph.point.x && l.y === ph.point.y && l.z === ph.point.z)) &&
      b.x === want.x && b.y === want.y && b.z === want.z;

    // Agent layer frame hook: body[data-agent-clock] every frame + hidden state
    // JSON refresh (no change events from animation ticks).
    refreshAgentFrame();

    requestAnimationFrame(frame);
  }

  window.Harmony.App = {
    getState: function () { return state; },
    getSlots: function () { return slots; },
    selectSlot: selectSlot,
    cycleSlot: cycleSlot,
    toggleCopyArmed: toggleCopyArmed,
    toggleGhostRef: toggleGhostRef,

    // ---- Agent layer (additive; consumed by js/agent-bridge.js) ----
    isReady: function () { return appReady; },
    onReady: function (fn) {
      if (typeof fn !== 'function') return function () {};
      if (appReady) { fn(); return function () {}; }
      readyQueue.push(fn);
      return function () {
        var i = readyQueue.indexOf(fn);
        if (i >= 0) readyQueue.splice(i, 1);
      };
    },
    getPresetIndex: presetIndexNow,
    getPoints: function () { return state.points; },
    getStaticMode: function () { return agentStaticMode(); },
    getAgentState: buildUiState,
    getDeeplink: deeplinkNow,
    applyAgentPatch: applyAgentPatch,
    resetAgentState: resetAgentState,
    subscribe: agentSubscribe,
    refreshAgentFrame: refreshAgentFrame,
    publishAgent: publishAgent
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }
})();
