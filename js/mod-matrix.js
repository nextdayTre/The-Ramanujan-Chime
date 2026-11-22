/* ===== Harmony.ModMatrix — Deterministic Parent-Clock LFO & Logical Entanglement Matrix =====
   Zero-build classic script (shared browser + Node compatible).
   Implements FabFilter Volcano-style click-and-drag modulation routing with:
     - Deterministic Parent Clock (synced to state.playT or optional Free Hz)
     - Child LFOs (Sine, Triangle/Ping-Pong, Saw/Repeat, Square) at harmonic ratios
     - Geometric & State Entanglement Taps (eta, eta^2 Jacobian, alpha, Phase phi, 4-Bit Nibble, Order N)
     - Logical Transfer Operators (Linear, cos, sin, Jacobian x^2, Quant 4-Bit, Snap Syzygy, Gate == 0x8, Gate |z|<=r)
     - Two-pass topological evaluation so cross-parameter chains (e.g. LFO1 -> Phase -> Slice z) stay zero-drift
     - Clean base vs. effective separation so clearing/muting routes restores exact user values. */
(function (root) {
  'use strict';

  var Harmony = root.Harmony = root.Harmony || {};

  var LFO_COLORS = ['#36d6c8', '#6ee7a0', '#ffb04d', '#ff5ca8'];

  var OPERATORS = [
    { id: 'linear',   label: 'Linear',       desc: 'Direct bipolar modulation around base value.' },
    { id: 'cos',      label: 'cos(pi*x)',    desc: 'Phase-locked cosine entanglement (zero drift).' },
    { id: 'sin',      label: 'sin(pi*x)',    desc: 'Quadrature sine entanglement (90 deg shift).' },
    { id: 'jacobian', label: 'Jacobian x^2', desc: 'Constant-volume radial expansion warp (dR/dr = eta^2).' },
    { id: 'qNibble',  label: 'Quant 4-Bit',  desc: 'Quantize signal onto 16 discrete 4-bit nibble steps (0x0..0xF).' },
    { id: 'q12',      label: 'Quant 12-Tone',desc: 'Quantize onto the 12 chromatic pitch classes (30 deg steps on Phase).' },
    { id: 'fifths',   label: 'Fifths (+7)',  desc: 'Step around the Circle of Fifths (+7 mod 12); Invert for Circle of Fourths (+5).' },
    { id: 'qSyzygy',  label: 'Snap Syzygy',  desc: 'Lock modulation onto modal ratios (0, .50, 2/3, -3dB, .75).' },
    { id: 'gate8',    label: 'Gate == 0x8',  desc: 'Logical highlight / pulse on 1000_2 (8) zero-crossing.' },
    { id: 'gatePlat', label: 'Gate |z|<=r',  desc: 'Pass signal only inside Archimedes constant-area plateau.' }
  ];

  var TAPS = [
    { id: 'tap_sliceZ',  label: 'Slice z(t)',    short: 'z(t)', color: '#6ee7a0' },
    { id: 'tap_eta',     label: 'eta = r/R',     short: 'eta',  color: '#36d6c8' },
    { id: 'tap_eta2',    label: 'eta^2 Jacobian',short: 'eta2', color: '#4df3dd' },
    { id: 'tap_phase',   label: 'Phase phi',     short: 'phi',  color: '#9d8cff' },
    { id: 'tap_nibble',  label: '4-Bit Nibble',  short: '4b',   color: '#ffb04d' },
    { id: 'tap_bitwave', label: 'BitWave Reg',   short: 'bw',   color: '#4af28a' }
  ];

  function evalBitWaveTap(phase, state, playT) {
    var feed = Harmony.BitWaveFeed;
    if (feed && typeof feed.getLfoNibbles === 'function' && typeof feed.sampleMonotone === 'function') {
      return clamp(feed.sampleMonotone(feed.getLfoNibbles(state, playT), phase), -1, 1);
    }
    var u = ((phase % 1) + 1) % 1;
    var nib = Math.round((Math.sin(u * Math.PI * 2) * 0.5 + 0.5) * 15);
    return (nib - 8) / 8;
  }

  // Routable target parameters mapped directly onto Harmony.App live state
  var TARGETS = {
    r:               { key: 'r',               label: 'Outer R',    min: 0.3,  max: 2.6,  isInt: false, inputId: 'radius',          outId: 'radiusOut',          fmt: function (v) { return v.toFixed(2); } },
    rIn:             { key: 'rIn',             label: 'Cavity r',   min: 0.0,  max: 2.4,  isInt: false, inputId: 'innerRadius',     outId: 'innerRadiusOut',     fmt: function (v) { return v.toFixed(2); } },
    archimedesZNorm: { key: 'archimedesZNorm', label: 'Slice z/R',  min: -1.0, max: 1.0,  isInt: false, inputId: 'rackSliceZ',      outId: 'rackSliceZOut',      fmt: function (v) { return (v >= 0 ? '+' : '') + v.toFixed(2); } },
    orderN:          { key: 'orderN',          label: 'Order N',    min: 5,    max: 64,   isInt: true,  inputId: 'orderN',          outId: 'orderNOut',          fmt: function (v) { return String(Math.round(v)); } },
    phaseDeg:        { key: 'phaseDeg',        label: 'Phase phi',  min: -180, max: 180,  isInt: false, inputId: 'phaseSlider',     outId: 'phaseOut',           fmt: function (v) { return Math.round(v) + '\u00B0'; } },
    f:               { key: 'f',               label: 'Freq f',     min: 0.5,  max: 8.0,  isInt: false, inputId: 'freq',            outId: 'freqOut',            fmt: function (v) { return v.toFixed(1); } },
    amp:             { key: 'amp',             label: 'Gain amp',   min: 0.1,  max: 2.5,  isInt: false, inputId: 'amp',             outId: 'ampOut',             fmt: function (v) { return v.toFixed(2); } },
    K:               { key: 'K',               label: 'Partials K', min: 0,    max: 14,   isInt: true,  inputId: 'harmonicsK',      outId: 'harmonicsKOut',      fmt: function (v) { return String(Math.round(v)); } },
    a:               { key: 'a',               label: 'Decay a',    min: 0.15, max: 0.85, isInt: false, inputId: 'fractalA',        outId: 'fractalAOut',        fmt: function (v) { return v.toFixed(2); } },
    b:               { key: 'b',               label: 'Lacunarity b', min: 2,  max: 9,    isInt: true,  inputId: 'fractalB',        outId: 'fractalBOut',        fmt: function (v) { return String(Math.round(v)); } },
    n:               { key: 'n',               label: 'Ratio n',    min: 1,    max: 8,    isInt: true,  inputId: 'ratioN',          outId: 'ratioNOut',          fmt: function (v) { return String(Math.round(v)); } },
    floorZoomLog:    { key: 'floorZoomLog',    label: 'Floor Zoom', min: 0.0,  max: 1.0,  isInt: false, inputId: 'floorZoomSlider', outId: 'floorZoomOut',       fmt: function (v) { var E = Harmony.engine; return (E && E.fmtZoomSec && E.floorZoomSec) ? E.fmtZoomSec(E.floorZoomSec(v)) : v.toFixed(2); } }
  };

  function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  }

  function evalWave(wave, phase) {
    var u = ((phase % 1) + 1) % 1;
    if (wave === 'sine') return Math.sin(u * Math.PI * 2);
    if (wave === 'tri')  return u < 0.25 ? u * 4 : (u < 0.75 ? 2 - u * 4 : u * 4 - 4);
    if (wave === 'saw')  return u * 2 - 1;
    if (wave === 'sq')   return u < 0.5 ? 1 : -1;
    return Math.sin(u * Math.PI * 2);
  }

  function applyOperator(op, x, ctx) {
    if (op === 'linear')   return x;
    if (op === 'cos')      return Math.cos(x * Math.PI);
    if (op === 'sin')      return Math.sin(x * Math.PI);
    if (op === 'jacobian') return (x < 0 ? -1 : 1) * x * x;
    if (op === 'qNibble')  return Math.round(((x + 1) * 0.5) * 15) / 7.5 - 1;
    if (op === 'q12') {
      var k12 = clamp(Math.floor(((x + 1) * 0.5) * 12), 0, 11);
      return (k12 >= 6 ? k12 - 12 : k12) / 6;
    }
    if (op === 'fifths') {
      var kf = clamp(Math.floor(((x + 1) * 0.5) * 12), 0, 11);
      var step5 = (kf * 7) % 12;
      return (step5 >= 6 ? step5 - 12 : step5) / 6;
    }
    if (op === 'qSyzygy') {
      var snaps = [0, 0.5, 2 / 3, Math.SQRT1_2, 0.75];
      var idx = clamp(Math.floor(((x + 1) * 0.5) * snaps.length), 0, snaps.length - 1);
      return snaps[idx] * 2 - 1;
    }
    if (op === 'gate8') {
      return (ctx && ctx.nibble === 8) ? 1 : (((ctx ? ctx.nibble : 8) / 7.5) - 1) * 0.65;
    }
    if (op === 'gatePlat') {
      var inside = ctx && Math.abs(ctx.sliceZ) <= ctx.eta;
      return inside ? x : 0;
    }
    return x;
  }

  // ---- Module Instance State ----
  var clockMode = 'playT'; // 'playT' | 'free'
  var freePhi = 0;
  var freeRate = 0.14;     // cycles per second in free mode
  var lastMasterPhi = 0;
  var routeSeq = 1;
  var selectedRouteId = null;

  var lfos = [
    { id: 'lfo1', name: 'LFO 1', short: 'L1', wave: 'sine', ratio: 1,   phaseOff: 0, color: LFO_COLORS[0] },
    { id: 'lfo2', name: 'LFO 2', short: 'L2', wave: 'tri',  ratio: 0.5, phaseOff: 0, color: LFO_COLORS[1] },
    { id: 'lfo3', name: 'LFO 3', short: 'L3', wave: 'saw',  ratio: 2,   phaseOff: 0, color: LFO_COLORS[2] }
  ];

  // Start with 0 routes on fresh mount so default view & agent contract snapshots stay 100% pristine
  var routes = [];
  var baseValues = {};
  var effValues = {};
  var srcValues = {};
  var hadActiveRoutes = false;

  var appHooks = null;
  var domBound = false;
  var dragState = null;

  function getSourceMeta(srcId) {
    for (var i = 0; i < lfos.length; i++) {
      if (lfos[i].id === srcId) {
        return { label: lfos[i].name, short: lfos[i].short, color: lfos[i].color };
      }
    }
    for (var j = 0; j < TAPS.length; j++) {
      if (TAPS[j].id === srcId) {
        return { label: TAPS[j].label, short: TAPS[j].short, color: TAPS[j].color };
      }
    }
    return { label: srcId, short: srcId, color: '#36d6c8' };
  }

  function hasActiveRoutes() {
    for (var i = 0; i < routes.length; i++) {
      if (routes[i].enabled) return true;
    }
    return false;
  }

  function isTargetRouted(key) {
    for (var i = 0; i < routes.length; i++) {
      if (routes[i].enabled && routes[i].dst === key) return true;
    }
    return false;
  }

  function readStateParam(state, key) {
    if (key === 'phaseDeg') return (state.phaseRad || 0) * 180 / Math.PI;
    return state[key];
  }

  function writeStateParam(state, key, val) {
    if (key === 'phaseDeg') {
      state.phaseRad = val * Math.PI / 180;
    } else {
      state[key] = val;
    }
  }

  function captureBaseFromState(state, onlyKey) {
    if (!state) return;
    if (onlyKey && TARGETS[onlyKey]) {
      var v = readStateParam(state, onlyKey);
      if (typeof v === 'number' && isFinite(v)) baseValues[onlyKey] = v;
      return;
    }
    for (var k in TARGETS) {
      if (!Object.prototype.hasOwnProperty.call(TARGETS, k)) continue;
      var val = readStateParam(state, k);
      if (typeof val === 'number' && isFinite(val)) baseValues[k] = val;
    }
  }

  function restoreBaseToState(state) {
    if (!state) return false;
    var changed = false;
    for (var k in TARGETS) {
      if (!Object.prototype.hasOwnProperty.call(TARGETS, k)) continue;
      if (typeof baseValues[k] !== 'number') continue;
      var cur = readStateParam(state, k);
      if (Math.abs(cur - baseValues[k]) > 1e-6) {
        writeStateParam(state, k, baseValues[k]);
        changed = true;
      }
    }
    return changed;
  }

  // Pure deterministic evaluation step called from Harmony.App frame loop
  function evaluate(state, playT, dt) {
    var Engine = Harmony.engine;
    if (clockMode === 'free' && state && state.toggles && state.toggles.animate && !state.staticMode) {
      freePhi = (freePhi + (dt || 0) * freeRate) % 1;
    }
    var phi = (clockMode === 'free') ? freePhi : (playT || 0);
    lastMasterPhi = phi;

    // Always compute LFO source waveforms so the live scope stays animated
    for (var i = 0; i < lfos.length; i++) {
      var l = lfos[i];
      srcValues[l.id] = evalWave(l.wave, phi * l.ratio + l.phaseOff);
    }

    var active = hasActiveRoutes();
    if (!active) {
      var restored = false;
      if (hadActiveRoutes) {
        restored = restoreBaseToState(state);
        hadActiveRoutes = false;
        syncRackOverlays(state);
        if (restored && appHooks && appHooks.onParamsRestored) {
          appHooks.onParamsRestored();
        }
      }
      return { active: false, changed: restored, phi: phi };
    }

    hadActiveRoutes = true;

    // Seed any missing base values safely
    for (var tk in TARGETS) {
      if (!Object.prototype.hasOwnProperty.call(TARGETS, tk)) continue;
      if (typeof baseValues[tk] !== 'number') {
        baseValues[tk] = readStateParam(state, tk);
      }
      effValues[tk] = baseValues[tk];
    }

    // Read 4-bit nibble and live Auto z(t) slice position from single-source Engine
    var nibble = 8;
    if (Engine && typeof Engine.fourBitOrbit === 'function') {
      var fb = Engine.fourBitOrbit(state, playT || 0);
      nibble = fb ? fb.nibbleVal : 8;
    }
    var liveSliceZ = (typeof state.archimedesZNorm === 'number') ? state.archimedesZNorm : 0;
    if (state.archimedesAuto !== false && Engine && typeof Engine.sphereResonance === 'function') {
      var resNow = Engine.sphereResonance(state, playT || 0);
      if (resNow && resNow.slice) liveSliceZ = resNow.slice.zNorm;
    }

    // Check upfront whether archimedesZNorm is a destination of any active route
    var sliceIsDest = false;
    for (var ds = 0; ds < routes.length; ds++) {
      if (routes[ds].enabled && routes[ds].dst === 'archimedesZNorm') { sliceIsDest = true; break; }
    }

    // Two-pass topological evaluation so cross-parameter chains resolve in one frame
    for (var pass = 0; pass < 2; pass++) {
      var accum = {};
      for (var k0 in TARGETS) accum[k0] = 0;

      var curR = Math.max(0.05, effValues.r);
      var curEta = clamp(effValues.rIn / curR, 0, 0.98);
      var curSlice = sliceIsDest ? effValues.archimedesZNorm : liveSliceZ;
      srcValues.tap_sliceZ = clamp(curSlice, -1, 1);
      srcValues.tap_eta = curEta * 2 - 1;
      srcValues.tap_eta2 = (curEta * curEta) * 2 - 1;
      srcValues.tap_phase = clamp(effValues.phaseDeg / 180, -1, 1);
      srcValues.tap_nibble = (nibble - 8) / 8;
      srcValues.tap_bitwave = evalBitWaveTap(phi, state, playT);

      var ctx = {
        nibble: nibble,
        sliceZ: curSlice,
        eta: curEta
      };

      for (var ri = 0; ri < routes.length; ri++) {
        var rt = routes[ri];
        if (!rt.enabled) continue;
        var meta = TARGETS[rt.dst];
        if (!meta) continue;
        var raw = (typeof srcValues[rt.src] === 'number') ? srcValues[rt.src] : 0;
        var shaped = applyOperator(rt.op, raw, ctx);
        var span = (meta.max - meta.min) * 0.5;
        accum[rt.dst] += shaped * rt.depth * span;
      }

      for (var k1 in TARGETS) {
        if (!Object.prototype.hasOwnProperty.call(TARGETS, k1)) continue;
        var pMeta = TARGETS[k1];
        var nextVal = clamp(baseValues[k1] + accum[k1], pMeta.min, pMeta.max);
        if (pMeta.isInt) nextVal = Math.round(nextVal);
        effValues[k1] = nextVal;
      }

      // Constant-Volume Lock-V coupling if enabled
      if (state.lockVolume && Engine && typeof Engine.solveConstantVolumeR === 'function') {
        var lockedR = clamp(Engine.solveConstantVolumeR(effValues.rIn, state.lockedR0), TARGETS.r.min, TARGETS.r.max);
        effValues.r = lockedR;
      } else if (effValues.rIn > effValues.r) {
        effValues.rIn = effValues.r;
      }
    }

    // Apply effective values to live state and detect whether geometry/curve needs resampling
    var changed = false;
    var sliceRouted = false;
    var orderNRouted = false;
    for (var ri2 = 0; ri2 < routes.length; ri2++) {
      if (!routes[ri2].enabled) continue;
      if (routes[ri2].dst === 'archimedesZNorm') sliceRouted = true;
      if (routes[ri2].dst === 'orderN') orderNRouted = true;
    }

    if (sliceRouted && state.archimedesAuto) {
      state.archimedesAuto = false;
      if (typeof document !== 'undefined') {
        var autoBtn = document.getElementById('btnArchAuto');
        if (autoBtn) autoBtn.classList.remove('active');
      }
    }
    if (orderNRouted && state.toggles && !state.toggles.strobeN) {
      state.toggles.strobeN = true;
      if (appHooks && appHooks.syncHudToggles) appHooks.syncHudToggles();
    }

    for (var k2 in TARGETS) {
      if (!Object.prototype.hasOwnProperty.call(TARGETS, k2)) continue;
      var prev = readStateParam(state, k2);
      var eff = effValues[k2];
      if (Math.abs(prev - eff) > 1e-5) {
        writeStateParam(state, k2, eff);
        changed = true;
      }
    }

    syncRackOverlays(state);
    return { active: true, changed: changed, phi: phi };
  }

  // ---- Sync Volcano-style Modulation Bars & Live Readouts on the Left Rack ----
  function syncRackOverlays(state) {
    if (typeof document === 'undefined') return;
    var active = hasActiveRoutes();

    for (var k in TARGETS) {
      if (!Object.prototype.hasOwnProperty.call(TARGETS, k)) continue;
      var meta = TARGETS[k];
      var firstRoute = null;
      for (var i = 0; i < routes.length; i++) {
        if (routes[i].enabled && routes[i].dst === k) { firstRoute = routes[i]; break; }
      }

      var bars = document.querySelectorAll('[data-mod-bar="' + k + '"]');
      var dots = document.querySelectorAll('[data-mod-dot="' + k + '"]');
      var outEl = document.getElementById(meta.outId);
      var valNow = active && typeof effValues[k] === 'number' ? effValues[k] : readStateParam(state, k);

      if (firstRoute && active) {
        var sm = getSourceMeta(firstRoute.src);
        var bVal = typeof baseValues[k] === 'number' ? baseValues[k] : valNow;
        var basePct = clamp((bVal - meta.min) / (meta.max - meta.min), 0, 1) * 100;
        var effPct = clamp((valNow - meta.min) / (meta.max - meta.min), 0, 1) * 100;
        bars.forEach(function (bar) {
          bar.style.opacity = '1';
          bar.style.background = sm.color;
          bar.style.left = Math.min(basePct, effPct).toFixed(2) + '%';
          bar.style.width = Math.max(1.2, Math.abs(effPct - basePct)).toFixed(2) + '%';
        });
        dots.forEach(function (dot) {
          dot.hidden = false;
          dot.style.left = effPct.toFixed(2) + '%';
          dot.style.background = sm.color;
          dot.style.color = sm.color;
        });
        if (outEl && typeof valNow === 'number') {
          outEl.textContent = meta.fmt(valNow);
        }
        if (k === 'archimedesZNorm') {
          var resSlider = document.getElementById('archimedesZSlider');
          if (resSlider && document.activeElement !== resSlider) {
            resSlider.value = valNow.toFixed(2);
          }
        }
        if (k === 'phaseDeg') {
          var radEl = document.getElementById('phaseRad');
          if (radEl) radEl.textContent = (valNow * Math.PI / 180).toFixed(4) + ' rad';
        }
        if (k === 'K') {
          var hk = document.getElementById('harmTabKOut');
          if (hk) hk.textContent = String(Math.round(valNow));
        }
      } else {
        bars.forEach(function (bar) { bar.style.opacity = '0'; });
        dots.forEach(function (dot) { dot.hidden = true; });
      }
    }

    // Update Master Phase scrubber & readout in Mod & Logic tab
    var phiOut = document.getElementById('modMasterPhiOut');
    if (phiOut) phiOut.textContent = lastMasterPhi.toFixed(2);
    var scrub = document.getElementById('modMasterScrub');
    if (scrub && document.activeElement !== scrub) {
      scrub.value = String(lastMasterPhi);
    }

    // Update dock tab live pulse indicator
    var tabDot = document.getElementById('modTabDot');
    if (tabDot) tabDot.classList.toggle('active', active);
  }

  function renderRackBadges() {
    if (typeof document === 'undefined') return;
    var count = 0;
    for (var i = 0; i < routes.length; i++) if (routes[i].enabled) count++;

    var badgeEl = document.getElementById('rackRouteCount');
    if (badgeEl) {
      badgeEl.textContent = count + (count === 1 ? ' route' : ' routes');
      badgeEl.classList.toggle('has-routes', count > 0);
    }

    for (var k in TARGETS) {
      if (!Object.prototype.hasOwnProperty.call(TARGETS, k)) continue;
      var wraps = document.querySelectorAll('[data-mod-badges="' + k + '"]');
      if (!wraps.length) continue;
      wraps.forEach(function (wrap) {
        wrap.innerHTML = '';
        for (var r = 0; r < routes.length; r++) {
          var rt = routes[r];
          if (!rt.enabled || rt.dst !== k) continue;
          (function (route) {
            var sm = getSourceMeta(route.src);
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'mod-pill-badge mono';
            btn.textContent = sm.short;
            btn.style.color = sm.color;
            btn.style.borderColor = sm.color;
            btn.title = 'Routed from ' + sm.label + ' (' + route.op + ') — click to inspect in Mod & Logic';
            btn.addEventListener('click', function (ev) {
              ev.stopPropagation();
              selectedRouteId = route.id;
              if (appHooks && appHooks.setActiveTab) appHooks.setActiveTab('modlogic');
              renderMatrixUI();
            });
            wrap.appendChild(btn);
          })(rt);
        }
      });
    }
  }

  // ---- Render the Bottom-Dock Mod & Logic Tab UI ----
  function renderSourcesUI() {
    if (typeof document === 'undefined') return;
    var lfoWrap = document.getElementById('modLfoList');
    if (lfoWrap) {
      lfoWrap.innerHTML = '';
      for (var i = 0; i < lfos.length; i++) {
        (function (lfo) {
          var row = document.createElement('div');
          row.className = 'mod-src-row';
          row.innerHTML =
            '<div class="mod-src-left">' +
              '<i class="mod-src-dot" style="background:' + lfo.color + ';box-shadow:0 0 6px ' + lfo.color + '"></i>' +
              '<span class="mod-src-name">' + lfo.name + '</span>' +
              '<select class="mod-mini-sel" data-lfo-wave="' + lfo.id + '" aria-label="' + lfo.name + ' waveform">' +
                '<option value="sine"' + (lfo.wave === 'sine' ? ' selected' : '') + '>Sine</option>' +
                '<option value="tri"'  + (lfo.wave === 'tri'  ? ' selected' : '') + '>Tri/Ping</option>' +
                '<option value="saw"'  + (lfo.wave === 'saw'  ? ' selected' : '') + '>Saw/Rep</option>' +
                '<option value="sq"'   + (lfo.wave === 'sq'   ? ' selected' : '') + '>Square</option>' +
              '</select>' +
              '<select class="mod-mini-sel mono" data-lfo-ratio="' + lfo.id + '" aria-label="' + lfo.name + ' ratio">' +
                '<option value="0.25"' + (lfo.ratio === 0.25 ? ' selected' : '') + '>1/4x</option>' +
                '<option value="0.5"'  + (lfo.ratio === 0.5  ? ' selected' : '') + '>1/2x</option>' +
                '<option value="1"'    + (lfo.ratio === 1    ? ' selected' : '') + '>1x</option>' +
                '<option value="2"'    + (lfo.ratio === 2    ? ' selected' : '') + '>2x</option>' +
                '<option value="3"'    + (lfo.ratio === 3    ? ' selected' : '') + '>3x</option>' +
                '<option value="4"'    + (lfo.ratio === 4    ? ' selected' : '') + '>4x</option>' +
              '</select>' +
            '</div>' +
            '<button type="button" class="mod-drag-handle" data-drag-src="' + lfo.id + '" data-drag-color="' + lfo.color + '" ' +
              'style="border-color:' + lfo.color + ';color:' + lfo.color + '" title="Drag onto any slider in the Left Rack">' +
              '<i style="background:' + lfo.color + '"></i>' +
            '</button>';
          lfoWrap.appendChild(row);
        })(lfos[i]);
      }

      lfoWrap.querySelectorAll('[data-lfo-wave]').forEach(function (sel) {
        sel.addEventListener('change', function () {
          var id = sel.getAttribute('data-lfo-wave');
          for (var j = 0; j < lfos.length; j++) if (lfos[j].id === id) lfos[j].wave = sel.value;
        });
      });
      lfoWrap.querySelectorAll('[data-lfo-ratio]').forEach(function (sel) {
        sel.addEventListener('change', function () {
          var id = sel.getAttribute('data-lfo-ratio');
          for (var j = 0; j < lfos.length; j++) if (lfos[j].id === id) lfos[j].ratio = parseFloat(sel.value) || 1;
        });
      });
    }

    var tapWrap = document.getElementById('modTapGrid');
    if (tapWrap) {
      tapWrap.innerHTML = '';
      for (var t = 0; t < TAPS.length; t++) {
        var tap = TAPS[t];
        var item = document.createElement('div');
        item.className = 'mod-tap-chip';
        item.innerHTML =
          '<span class="mono" style="color:' + tap.color + '">' + tap.label + '</span>' +
          '<button type="button" class="mod-drag-handle small" data-drag-src="' + tap.id + '" data-drag-color="' + tap.color + '" ' +
            'style="border-color:' + tap.color + ';color:' + tap.color + '" title="Drag ' + tap.label + ' onto any slider">' +
            '<i style="background:' + tap.color + '"></i>' +
          '</button>';
        tapWrap.appendChild(item);
      }
    }

    bindDragHandles();
  }

  function renderRoutesUI() {
    if (typeof document === 'undefined') return;
    var listEl = document.getElementById('modRouteList');
    if (!listEl) return;
    listEl.innerHTML = '';

    if (!routes.length) {
      listEl.innerHTML =
        '<div class="mod-empty">' +
          'No active routes &mdash; drag any <b style="color:var(--accent-bright)">(&bull;)</b> handle onto a Left Rack slider, or click a Matrix Preset above.' +
        '</div>';
      renderInspectorUI();
      renderRackBadges();
      return;
    }

    for (var i = 0; i < routes.length; i++) {
      (function (rt) {
        var sm = getSourceMeta(rt.src);
        var pm = TARGETS[rt.dst] || { label: rt.dst };
        var isSel = rt.id === selectedRouteId;

        var row = document.createElement('div');
        row.className = 'mod-route-row' + (isSel ? ' selected' : '') + (rt.enabled ? '' : ' muted');
        if (isSel) row.style.borderColor = sm.color;

        var opHtml = '';
        for (var o = 0; o < OPERATORS.length; o++) {
          opHtml += '<option value="' + OPERATORS[o].id + '"' + (OPERATORS[o].id === rt.op ? ' selected' : '') + '>' + OPERATORS[o].label + '</option>';
        }

        var dstHtml = '';
        for (var dk in TARGETS) {
          if (!Object.prototype.hasOwnProperty.call(TARGETS, dk)) continue;
          dstHtml += '<option value="' + dk + '"' + (dk === rt.dst ? ' selected' : '') + '>' + TARGETS[dk].label + '</option>';
        }

        var pctText = (rt.depth >= 0 ? '+' : '') + Math.round(rt.depth * 100) + '%';
        row.innerHTML =
          '<button type="button" class="mod-rt-toggle" data-rt-toggle="' + rt.id + '" title="Mute / Enable route" ' +
            'style="background:' + (rt.enabled ? sm.color : '#485468') + '"></button>' +
          '<span class="mod-rt-src mono" style="color:' + sm.color + ';border-color:' + sm.color + '55">' + sm.label + '</span>' +
          '<select class="mod-mini-sel mono" data-rt-op="' + rt.id + '" aria-label="Route operator">' + opHtml + '</select>' +
          '<span class="mod-rt-arrow">&rarr;</span>' +
          '<select class="mod-mini-sel mod-dst-sel" data-rt-dst="' + rt.id + '" aria-label="Destination target">' + dstHtml + '</select>' +
          '<div class="mod-rt-depth">' +
            '<input type="range" min="-1" max="1" step="0.05" value="' + rt.depth + '" data-rt-depth="' + rt.id + '" aria-label="Modulation depth" />' +
            '<span class="mono mod-rt-pct">' + pctText + '</span>' +
          '</div>' +
          '<button type="button" class="mod-rt-del" data-rt-del="' + rt.id + '" title="Delete route">&times;</button>';

        row.addEventListener('click', function (ev) {
          if (ev.target && ev.target.closest && ev.target.closest('button, select, input')) return;
          selectedRouteId = rt.id;
          renderRoutesUI();
        });

        listEl.appendChild(row);
      })(routes[i]);
    }

    listEl.querySelectorAll('[data-rt-toggle]').forEach(function (btn) {
      btn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        var id = btn.getAttribute('data-rt-toggle');
        for (var j = 0; j < routes.length; j++) {
          if (routes[j].id === id) routes[j].enabled = !routes[j].enabled;
        }
        renderMatrixUI();
      });
    });

    listEl.querySelectorAll('[data-rt-op]').forEach(function (sel) {
      sel.addEventListener('change', function () {
        var id = sel.getAttribute('data-rt-op');
        for (var j = 0; j < routes.length; j++) {
          if (routes[j].id === id) {
            routes[j].op = sel.value;
            selectedRouteId = id;
          }
        }
        renderInspectorUI();
      });
    });

    listEl.querySelectorAll('[data-rt-dst]').forEach(function (sel) {
      sel.addEventListener('change', function () {
        var id = sel.getAttribute('data-rt-dst');
        var nextDst = sel.value;
        if (!TARGETS[nextDst]) return;
        var st = appHooks && appHooks.getState ? appHooks.getState() : null;
        if (st) {
          restoreBaseToState(st);
          captureBaseFromState(st, nextDst);
        }
        for (var j = 0; j < routes.length; j++) {
          if (routes[j].id === id) {
            routes[j].dst = nextDst;
            selectedRouteId = id;
          }
        }
        renderMatrixUI();
      });
    });

    listEl.querySelectorAll('[data-rt-depth]').forEach(function (inp) {
      inp.addEventListener('input', function () {
        var id = inp.getAttribute('data-rt-depth');
        var v = parseFloat(inp.value);
        for (var j = 0; j < routes.length; j++) {
          if (routes[j].id === id) {
            routes[j].depth = v;
            selectedRouteId = id;
            var pct = inp.nextElementSibling;
            if (pct) pct.textContent = (v >= 0 ? '+' : '') + Math.round(v * 100) + '%';
          }
        }
        renderInspectorUI();
      });
    });

    listEl.querySelectorAll('[data-rt-del]').forEach(function (btn) {
      btn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        var id = btn.getAttribute('data-rt-del');
        routes = routes.filter(function (r) { return r.id !== id; });
        if (selectedRouteId === id) selectedRouteId = routes.length ? routes[0].id : null;
        renderMatrixUI();
      });
    });

    renderInspectorUI();
    renderRackBadges();
  }

  function renderInspectorUI() {
    if (typeof document === 'undefined') return;
    var box = document.getElementById('modRouteInspector');
    var leg = document.getElementById('modScopeLegend');
    if (!box) return;

    var rt = null;
    for (var i = 0; i < routes.length; i++) {
      if (routes[i].id === selectedRouteId) { rt = routes[i]; break; }
    }
    if (!rt && routes.length) {
      rt = routes[0];
      selectedRouteId = rt.id;
    }
    if (!rt) {
      if (leg) { leg.textContent = 'idle'; leg.style.color = 'var(--muted)'; }
      box.innerHTML = '<div class="mod-insp-empty">Select or drag a route to inspect its transfer rule &amp; live waveform.</div>';
      return;
    }

    var sm = getSourceMeta(rt.src);
    var pm = TARGETS[rt.dst] || { label: rt.dst };
    var opObj = OPERATORS[0];
    for (var o = 0; o < OPERATORS.length; o++) {
      if (OPERATORS[o].id === rt.op) { opObj = OPERATORS[o]; break; }
    }

    if (leg) {
      leg.textContent = sm.short + ' \u2192 ' + pm.label;
      leg.style.color = sm.color;
    }

    var pct = (rt.depth >= 0 ? '+' : '') + Math.round(rt.depth * 100) + '%';
    box.innerHTML =
      '<div class="mod-insp-top">' +
        '<span class="mono" style="color:' + sm.color + ';font-weight:600">' + sm.label + ' &rarr; ' + pm.label + '</span>' +
        '<span class="mini-tag mono">' + opObj.label + '</span>' +
      '</div>' +
      '<div class="mod-insp-desc">' + opObj.desc + '</div>' +
      '<div class="mod-insp-foot mono">' +
        '<span>Depth <b>' + pct + '</b></span>' +
        '<div class="mod-insp-btns">' +
          '<button type="button" id="modInspInvert" class="mini-btn">Invert</button>' +
          '<button type="button" id="modInspMute" class="mini-btn">' + (rt.enabled ? 'Active' : 'Muted') + '</button>' +
        '</div>' +
      '</div>';

    var invBtn = document.getElementById('modInspInvert');
    if (invBtn) invBtn.addEventListener('click', function () { rt.depth = -rt.depth; renderMatrixUI(); });
    var muteBtn = document.getElementById('modInspMute');
    if (muteBtn) muteBtn.addEventListener('click', function () { rt.enabled = !rt.enabled; renderMatrixUI(); });
  }

  function renderMatrixUI() {
    renderRoutesUI();
    if (appHooks && appHooks.getState) {
      syncRackOverlays(appHooks.getState());
    }
  }

  // ---- Live Entanglement Oscilloscope inside Mod & Logic Tab ----
  function drawScope(state) {
    if (typeof document === 'undefined') return;
    var cv = document.getElementById('modScopeCanvas');
    if (!cv) return;
    var w = cv.clientWidth;
    var h = cv.clientHeight;
    if (!w || !h) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    }
    var ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var harmor = !!(state && state.toggles && state.toggles.harmorVoid);
    ctx.fillStyle = harmor ? '#000000' : '#080c12';
    ctx.fillRect(0, 0, w, h);

    // Subtle grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.5); ctx.lineTo(w, h * 0.5);
    ctx.moveTo(w * 0.25, 0); ctx.lineTo(w * 0.25, h);
    ctx.moveTo(w * 0.5, 0); ctx.lineTo(w * 0.5, h);
    ctx.moveTo(w * 0.75, 0); ctx.lineTo(w * 0.75, h);
    ctx.stroke();

    var rt = null;
    for (var i = 0; i < routes.length; i++) {
      if (routes[i].id === selectedRouteId) { rt = routes[i]; break; }
    }
    if (!rt && routes.length) rt = routes[0];

    var lfo = null;
    var color = '#36d6c8';
    var srcId = rt ? rt.src : 'lfo1';
    var sm = getSourceMeta(srcId);
    color = sm.color;
    for (var j = 0; j < lfos.length; j++) {
      if (lfos[j].id === srcId) { lfo = lfos[j]; break; }
    }

    function evalPreview(p) {
      if (lfo) return evalWave(lfo.wave, p * lfo.ratio + lfo.phaseOff);
      if (srcId === 'tap_bitwave') return evalBitWaveTap(p, state, state ? state.playT : 0);
      if (srcId === 'tap_sliceZ') return Math.sin(p * Math.PI * 2);
      if (srcId === 'tap_nibble') return (Math.round(((Math.sin(p * Math.PI * 2) + 1) * 0.5) * 15) - 8) / 8;
      if (srcId === 'tap_phase')  return Math.sin(p * Math.PI * 2);
      return Math.sin(p * Math.PI * 2) * 0.65;
    }

    // Raw source curve (dashed)
    ctx.strokeStyle = color + '66';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    for (var s = 0; s <= 120; s++) {
      var p = s / 120;
      var v = evalPreview(p);
      var x = p * w;
      var y = h * 0.5 - v * (h * 0.36);
      if (s === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Shaped output curve (solid)
    if (rt) {
      var eta = state ? clamp((state.rIn || 0) / Math.max(0.05, state.r || 1), 0, 0.98) : 0.45;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (var s2 = 0; s2 <= 120; s2++) {
        var p2 = s2 / 120;
        var raw = evalPreview(p2);
        var nib = clamp(Math.round(((Math.sin(p2 * Math.PI * 2) + 1) * 0.5) * 15), 0, 15);
        var out = applyOperator(rt.op, raw, { nibble: nib, sliceZ: Math.cos(p2 * Math.PI * 2) * 0.85, eta: eta }) * rt.depth;
        var x2 = p2 * w;
        var y2 = h * 0.5 - clamp(out, -1, 1) * (h * 0.40);
        if (s2 === 0) ctx.moveTo(x2, y2); else ctx.lineTo(x2, y2);
      }
      ctx.stroke();
    }

    // Master phase cursor line
    var px = clamp(lastMasterPhi, 0, 1) * w;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, h);
    ctx.stroke();
  }

  // ---- Volcano-Style Click-and-Drag SVG Cable Patching ----
  function updateDragCable(x1, y1) {
    var path = document.getElementById('modDragCable');
    var tip = document.getElementById('modDragTip');
    if (!dragState || !path || !tip) return;
    var x0 = dragState.x0, y0 = dragState.y0;
    var dx = Math.abs(x1 - x0) * 0.45;
    var dy = Math.max(40, Math.abs(y1 - y0) * 0.35);
    var d = 'M ' + x0 + ' ' + y0 + ' C ' + (x0 - dx * 0.25) + ' ' + (y0 - dy) + ', ' + (x1 + dx * 0.25) + ' ' + (y1 + dy * 0.3) + ', ' + x1 + ' ' + y1;
    path.setAttribute('d', d);
    tip.setAttribute('cx', String(x1));
    tip.setAttribute('cy', String(y1));
  }

  function onPointerMove(ev) {
    if (!dragState) return;
    updateDragCable(ev.clientX, ev.clientY);
    document.querySelectorAll('[data-mod-target].drop-hover').forEach(function (el) {
      el.classList.remove('drop-hover');
    });
    var under = document.elementFromPoint(ev.clientX, ev.clientY);
    var row = under && under.closest ? under.closest('[data-mod-target]') : null;
    if (row) {
      row.classList.add('drop-hover');
      dragState.hoverTarget = row.getAttribute('data-mod-target');
    } else {
      dragState.hoverTarget = null;
    }
  }

  function onPointerUp() {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
    document.body.classList.remove('mod-dragging');
    document.querySelectorAll('[data-mod-target].drop-hover').forEach(function (el) {
      el.classList.remove('drop-hover');
    });
    var path = document.getElementById('modDragCable');
    var tip = document.getElementById('modDragTip');
    if (path) path.setAttribute('opacity', '0');
    if (tip) tip.setAttribute('opacity', '0');

    if (dragState && dragState.hoverTarget && TARGETS[dragState.hoverTarget]) {
      addOrActivateRoute(dragState.src, dragState.hoverTarget);
    }
    dragState = null;
  }

  function bindDragHandles() {
    document.querySelectorAll('.mod-drag-handle[data-drag-src]').forEach(function (btn) {
      btn.onpointerdown = function (ev) {
        ev.preventDefault();
        // Auto-expand left panel if it was collapsed so user sees all parameter targets!
        if (document.body.classList.contains('panel-collapsed') && appHooks && appHooks.setPanelCollapsed) {
          appHooks.setPanelCollapsed(false);
        }
        var rect = btn.getBoundingClientRect();
        dragState = {
          src: btn.getAttribute('data-drag-src'),
          color: btn.getAttribute('data-drag-color') || '#36d6c8',
          x0: rect.left + rect.width * 0.5,
          y0: rect.top + rect.height * 0.5,
          hoverTarget: null
        };
        document.body.classList.add('mod-dragging');
        var path = document.getElementById('modDragCable');
        var tip = document.getElementById('modDragTip');
        if (path) { path.setAttribute('stroke', dragState.color); path.setAttribute('opacity', '0.92'); }
        if (tip)  { tip.setAttribute('fill', dragState.color); tip.setAttribute('opacity', '1'); }
        updateDragCable(ev.clientX, ev.clientY);
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
        window.addEventListener('pointercancel', onPointerUp);
      };
    });
  }

  function addOrActivateRoute(src, dst, op, depth) {
    if (!TARGETS[dst]) return null;
    if (appHooks && appHooks.getState) {
      captureBaseFromState(appHooks.getState(), dst);
    }
    for (var i = 0; i < routes.length; i++) {
      if (routes[i].src === src && routes[i].dst === dst) {
        routes[i].enabled = true;
        selectedRouteId = routes[i].id;
        renderMatrixUI();
        return routes[i];
      }
    }
    var id = 'rt-' + (routeSeq++);
    var defaultOp = op || (src === 'tap_nibble' ? 'gate8' : (src === 'tap_phase' && dst === 'archimedesZNorm' ? 'cos' : 'linear'));
    var rt = {
      id: id,
      src: src,
      dst: dst,
      op: defaultOp,
      depth: (typeof depth === 'number') ? depth : 0.55,
      enabled: true
    };
    routes.push(rt);
    selectedRouteId = id;
    renderMatrixUI();
    return rt;
  }

  function applyMatrixPreset(presetName) {
    var st = appHooks && appHooks.getState ? appHooks.getState() : null;
    if (st && !hasActiveRoutes()) captureBaseFromState(st);

    if (presetName === 'clear') {
      routes = [];
      selectedRouteId = null;
      if (st) {
        restoreBaseToState(st);
        hadActiveRoutes = false;
        if (appHooks && appHooks.onParamsRestored) appHooks.onParamsRestored();
      }
      renderMatrixUI();
      return;
    }

    if (presetName === 'chimeFifths') {
      routes = [
        { id: 'rt-' + (routeSeq++), src: 'lfo3',       dst: 'phaseDeg',        op: 'fifths', depth: 1.00, enabled: true },
        { id: 'rt-' + (routeSeq++), src: 'tap_phase',  dst: 'archimedesZNorm', op: 'cos',    depth: 0.67, enabled: true },
        { id: 'rt-' + (routeSeq++), src: 'tap_nibble', dst: 'K',               op: 'gate8',  depth: 0.45, enabled: true }
      ];
      selectedRouteId = routes[0].id;
    } else if (presetName === 'autoZDrive') {
      if (st) {
        st.archimedesAuto = true;
        if (typeof document !== 'undefined') {
          var aBtn = document.getElementById('btnArchAuto');
          if (aBtn) aBtn.classList.add('active');
        }
      }
      routes = [
        { id: 'rt-' + (routeSeq++), src: 'tap_sliceZ', dst: 'phaseDeg', op: 'linear',   depth: 0.70, enabled: true },
        { id: 'rt-' + (routeSeq++), src: 'tap_sliceZ', dst: 'orderN',   op: 'gatePlat', depth: 0.45, enabled: true },
        { id: 'rt-' + (routeSeq++), src: 'tap_sliceZ', dst: 'K',        op: 'sin',      depth: 0.50, enabled: true }
      ];
      selectedRouteId = routes[0].id;
    } else if (presetName === 'entangled') {
      routes = [
        { id: 'rt-' + (routeSeq++), src: 'lfo1',       dst: 'phaseDeg',        op: 'linear',   depth: 0.65, enabled: true },
        { id: 'rt-' + (routeSeq++), src: 'tap_phase',  dst: 'archimedesZNorm', op: 'cos',      depth: 0.85, enabled: true },
        { id: 'rt-' + (routeSeq++), src: 'tap_nibble', dst: 'orderN',          op: 'gate8',    depth: 0.45, enabled: true },
        { id: 'rt-' + (routeSeq++), src: 'tap_eta2',   dst: 'f',               op: 'jacobian', depth: 0.25, enabled: true }
      ];
      selectedRouteId = routes[1].id;
    } else if (presetName === 'nibbleStep') {
      routes = [
        { id: 'rt-' + (routeSeq++), src: 'tap_nibble', dst: 'orderN',          op: 'qNibble',  depth: 0.60, enabled: true },
        { id: 'rt-' + (routeSeq++), src: 'tap_nibble', dst: 'archimedesZNorm', op: 'qNibble',  depth: 0.85, enabled: true },
        { id: 'rt-' + (routeSeq++), src: 'lfo3',       dst: 'K',               op: 'gatePlat', depth: 0.55, enabled: true }
      ];
      selectedRouteId = routes[0].id;
    } else if (presetName === 'volBreath') {
      if (st && !st.lockVolume && appHooks && appHooks.setLockVolume) {
        appHooks.setLockVolume(true);
      }
      routes = [
        { id: 'rt-' + (routeSeq++), src: 'lfo2',     dst: 'rIn',             op: 'linear',   depth: 0.35, enabled: true },
        { id: 'rt-' + (routeSeq++), src: 'tap_eta',  dst: 'archimedesZNorm', op: 'sin',      depth: 0.80, enabled: true },
        { id: 'rt-' + (routeSeq++), src: 'tap_eta2', dst: 'phaseDeg',        op: 'jacobian', depth: 0.45, enabled: true }
      ];
      selectedRouteId = routes[0].id;
    }

    renderMatrixUI();
  }

  function clearRoutes() {
    applyMatrixPreset('clear');
  }

  function init(hooks) {
    appHooks = hooks || {};
    if (appHooks.getState) captureBaseFromState(appHooks.getState());
    if (typeof document === 'undefined' || domBound) return;
    domBound = true;

    // Bind clock mode toggle
    document.querySelectorAll('.mod-clk-btn[data-clk]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        clockMode = btn.getAttribute('data-clk') || 'playT';
        document.querySelectorAll('.mod-clk-btn[data-clk]').forEach(function (b) {
          b.classList.toggle('active', b === btn);
        });
      });
    });

    // Bind deterministic master scrubber
    var scrub = document.getElementById('modMasterScrub');
    if (scrub) {
      scrub.addEventListener('input', function () {
        var v = clamp(parseFloat(scrub.value) || 0, 0, 1);
        if (clockMode === 'free') {
          freePhi = v;
        } else if (appHooks && appHooks.setPlayhead) {
          appHooks.setPlayhead(v);
        }
      });
    }

    // Bind free-clock speed selector
    var spd = document.getElementById('modMasterSpeed');
    if (spd) {
      spd.addEventListener('change', function () {
        var s = parseFloat(spd.value);
        if (isFinite(s) && s > 0) freeRate = s;
      });
    }

    // Bind + Add LFO button
    var addBtn = document.getElementById('btnModAddLfo');
    if (addBtn) {
      addBtn.addEventListener('click', function () {
        if (lfos.length >= 4) return;
        var idx = lfos.length;
        lfos.push({
          id: 'lfo' + (idx + 1),
          name: 'LFO ' + (idx + 1),
          short: 'L' + (idx + 1),
          wave: 'sq',
          ratio: 3,
          phaseOff: 0,
          color: LFO_COLORS[idx % LFO_COLORS.length]
        });
        renderSourcesUI();
      });
    }

    // Bind Matrix Preset buttons
    document.querySelectorAll('.mod-preset-btn[data-mpreset]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        applyMatrixPreset(btn.getAttribute('data-mpreset'));
      });
    });

    // Click route count footer badge to jump straight to Mod & Logic tab
    var countBadge = document.getElementById('rackRouteCount');
    if (countBadge) {
      countBadge.addEventListener('click', function () {
        if (appHooks && appHooks.setActiveTab) appHooks.setActiveTab('modlogic');
      });
    }

    renderSourcesUI();
    renderMatrixUI();
  }

  Harmony.ModMatrix = {
    TARGETS: TARGETS,
    OPERATORS: OPERATORS,
    TAPS: TAPS,
    init: init,
    evaluate: evaluate,
    drawScope: drawScope,
    captureBase: captureBaseFromState,
    clearRoutes: clearRoutes,
    hasActiveRoutes: hasActiveRoutes,
    isTargetRouted: isTargetRouted,
    addRoute: addOrActivateRoute,
    applyPreset: applyMatrixPreset,
    getRoutes: function () { return routes.slice(); },
    evalWave: evalWave,
    applyOperator: applyOperator
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Harmony.ModMatrix;
  }
})(typeof window !== 'undefined' ? window : globalThis);
