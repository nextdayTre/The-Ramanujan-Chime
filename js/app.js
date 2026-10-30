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
      Frobenius = Harmony.Frobenius;

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
    activeTab: 'scopes',   // 'scopes' | 'harmonics' | 'frobenius' | 'bits'
    activeSlot: 'A',       // 'A' | 'B' | 'C' VST sphere slot
    ghostSlot: '',
    ghostPoints: [],
    ghostRev: 0,
    magZoom: 16,
    magFocus: 'trough',    // 'playhead' | 'origin' | 'trough'
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

  var STATIC_MODE = /[?&]static/.test(location.search);
  if (STATIC_MODE) {
    state.toggles.animate = false;
    state.toggles.autoRotate = false;
  }

  var dirty = 0;
  var lastRendered = -1;
  var slots = null;
  var isRestoringSlot = false;
  var copyArmed = false;

  function bump() {
    dirty++;
    if (slots && !isRestoringSlot && slots[state.activeSlot]) {
      slots[state.activeSlot] = captureSnapshot();
      syncSlotTooltips();
    }
  }
  function $(id) { return document.getElementById(id); }

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
      badge.textContent = sub + '/' + N + ' · prime N (cofactor 1, stride ' + stride + ')';
      badge.style.color = '#6ee7a0';
    } else if (g === 1) {
      badge.textContent = sub + '/' + N + ' · coprime generator (stride ' + stride + ')';
      badge.style.color = '#ffd166';
    } else {
      badge.textContent = sub + '/' + N + ' · subgroup! gcd(' + stride + ',' + N + ')=' + g;
      badge.style.color = '#ff8c98';
    }
  }

  function updateShellReadout() {
    if (state.rIn > state.r) {
      state.rIn = state.r;
      $('innerRadius').value = state.rIn;
      $('innerRadiusOut').textContent = state.rIn.toFixed(2);
    }
    var m = Engine.shellMetrics(state);
    $('shellVolOut').textContent = m.volShell.toFixed(2);
    $('shellWallOut').textContent = m.thickness.toFixed(2);
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
      if (d.key === 'r' || d.key === 'rIn') updateShellReadout();
      if (d.key === 'orderN') {
        if (!state.toggles.strobeN) {
          state.toggles.strobeN = true;
          syncHudToggles();
        }
        updateOrderNBadge();
      }
      if (d.key === 'n') updateOrderNBadge();
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

  // ---- Phase Controls ----
  function setPhaseFromDeg(deg) {
    deg = parseFloat(deg) || 0;
    state.phaseRad = deg * Math.PI / 180;
    $('phaseSlider').value = deg;
    $('phaseDeg').value = deg;
    $('phaseOut').textContent = deg.toFixed(0) + '°';
    $('phaseRad').textContent = state.phaseRad.toFixed(4) + ' rad';
    bump();
  }
  $('phaseSlider').addEventListener('input', function () { setPhaseFromDeg($('phaseSlider').value); });
  $('phaseDeg').addEventListener('input', function () { setPhaseFromDeg($('phaseDeg').value); });
  $('phaseSlider').addEventListener('dblclick', function () {
    setPhaseFromDeg(parseFloat($('phaseSlider').getAttribute('data-default')) || 0);
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
    var refBtn = $('btnRefWaves');
    if (refBtn) {
      refBtn.classList.toggle('active', !!state.toggles.refWaves);
    }
  }

  document.querySelectorAll('.hud-pill[data-toggle]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var key = btn.getAttribute('data-toggle');
      state.toggles[key] = !state.toggles[key];
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
    state.activeTab = tabId;
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

  // Concept Banner & Misc Buttons
  $('btnThesis').addEventListener('click', function () {
    $('thesisBanner').hidden = !$('thesisBanner').hidden;
    setTimeout(Scene3D.resize, 20);
  });
  $('closeThesis').addEventListener('click', function () {
    $('thesisBanner').hidden = true;
    setTimeout(Scene3D.resize, 20);
  });
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
    state.note = p.note || '';
    $('patchNote').textContent = state.note;

    if (!p.formulas) {
      $('formulaDrawer').open = true;
      return;
    }

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
      state.toggles.strobeN = !!p.hints.strobeN;
      if (p.hints.magFocus) state.magFocus = p.hints.magFocus;
      if (p.hints.twinMode) setTwinMode(p.hints.twinMode);
    }

    syncParamUI();
    syncHudToggles();
    syncMagChips();
    bump();
  }

  presetSelect.addEventListener('change', function () { applyPreset(presetSelect.value); });

  // ---- Canonical Sphere Snapshot + VST A/B/C Slots & URL Hash Sharing ----
  var SLOT_ORDER = ['A', 'B', 'C'];

  function captureSnapshot() {
    return {
      p: parseInt(presetSelect.value, 10) || 0,
      fx: state.formulas.x,
      fy: state.formulas.y,
      fz: state.formulas.z,
      r: state.r,
      rIn: state.rIn,
      amp: state.amp,
      f: state.f,
      K: state.K,
      orderN: state.orderN,
      a: state.a,
      b: state.b,
      n: state.n,
      m: state.m,
      k: state.k,
      ph: Math.round(state.phaseRad * 180 / Math.PI * 100) / 100,
      tw: state.twinMode,
      cut: state.toggles.cutaway ? 1 : 0,
      sg: state.toggles.sliceGrid ? 1 : 0,
      mag: state.toggles.magnifier ? 1 : 0,
      str: state.toggles.strobeN ? 1 : 0,
      mf: state.magFocus,
      mz: state.magZoom
    };
  }

  function snapshotFromPreset(idx, extra) {
    var p = Presets.list[idx] || Presets.list[0];
    var pr = p.params || {};
    var hi = p.hints || {};
    var snap = {
      p: idx,
      fx: p.formulas ? p.formulas.x : state.formulas.x,
      fy: p.formulas ? p.formulas.y : state.formulas.y,
      fz: p.formulas ? p.formulas.z : state.formulas.z,
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
      mf: hi.magFocus || 'trough',
      mz: 16
    };
    if (extra) {
      for (var ek in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, ek)) snap[ek] = extra[ek];
      }
    }
    return snap;
  }

  function sampleSnapshotPoints(snap) {
    if (!snap) return [];
    var tempState = {
      r: snap.r,
      rIn: snap.rIn,
      amp: snap.amp,
      f: snap.f,
      K: snap.K,
      orderN: snap.orderN,
      a: snap.a,
      b: snap.b,
      n: snap.n,
      m: snap.m,
      k: snap.k,
      phaseRad: (snap.ph || 0) * Math.PI / 180,
      formulas: { x: snap.fx, y: snap.fy, z: snap.fz }
    };
    return Engine.sample(tempState, SAMPLES).points;
  }

  function applySnapshot(d) {
    if (!d) return false;
    isRestoringSlot = true;
    try {
      if (d.p != null && Presets.list[d.p]) {
        presetSelect.value = String(d.p);
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
      if (d.mf) state.magFocus = d.mf;
      if (typeof d.mz === 'number') state.magZoom = d.mz;
      syncParamUI();
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
    syncSlotUI();
  }

  function cycleSlot(dir) {
    var idx = SLOT_ORDER.indexOf(state.activeSlot);
    var next = SLOT_ORDER[(idx + dir + SLOT_ORDER.length) % SLOT_ORDER.length];
    selectSlot(next);
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
    setTimeout(function () { btn.textContent = 'Share Link'; }, 1400);
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

  // ---- Keyboard Studio Shortcuts ----
  window.addEventListener('keydown', function (ev) {
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
    else if (ev.key === 'g' || ev.key === 'G') toggleGhostRef();
    else if (ev.key === '1') setActiveTab('scopes');
    else if (ev.key === '2') setActiveTab('harmonics');
    else if (ev.key === '3') setActiveTab('frobenius');
    else if (ev.key === '4') setActiveTab('bits');
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
    } else if (ev.key === 'f' || ev.key === 'F') {
      Scene3D.setCameraView('front', state);
      syncHudToggles();
      bump();
    }
  });

  // ---- Init & Main 60fps Studio Loop ----
  function initAll() {
    Engine.initSecp(state);
    Scene3D.init($('viewport3d'), state);
    Magnifier2D.init($('magnifierCanvas'));
    Lissajous2D.init($('lissajous'));
    TimeSeries.init($('timeseries'));
    Harmonics2D.init($('harmonicSpecCanvas'), $('ramanujanCanvas'));
    Frobenius.init($('frobPhasor'), $('frobCountCanvas'));

    applyFrobMode();
    if (!restoreFromHash()) {
      presetSelect.value = '0';
      applyPreset('0');
    }
    initSlots();
    requestAnimationFrame(frame);
  }

  var last = performance.now();
  function frame(now) {
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    if (state.toggles.animate) {
      state.playT = (state.playT + dt * PLAY_SPEED) % 1;
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

    // Always render Hero 3D Sphere + Zoom Lens (when open)
    Scene3D.update(state, state.playT, state.points, lastRendered);
    Magnifier2D.update(state, state.playT);

    // Update active dock tab views (plus Lissajous Crosshair for agreement hook)
    Lissajous2D.update(state, state.playT, state.points, lastRendered);
    if (state.activeTab === 'scopes') {
      TimeSeries.update(state, state.points, lastRendered, state.playT);
    } else if (state.activeTab === 'harmonics') {
      Harmonics2D.update(state);
    } else if (state.activeTab === 'frobenius') {
      Frobenius.update(state);
      updateFrobReadouts();
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

    requestAnimationFrame(frame);
  }

  window.Harmony.App = {
    getState: function () { return state; },
    getSlots: function () { return slots; },
    selectSlot: selectSlot,
    cycleSlot: cycleSlot,
    toggleCopyArmed: toggleCopyArmed,
    toggleGhostRef: toggleGhostRef
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }
})();
