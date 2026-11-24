/* ===== Harmony.ParamHints — Topbar Context Hint Display =====
   Quiet-idle, studio-style hint bar in the header. Updates on hover/focus of
   left-rack parameter controls, stays locked while dragging a slider, and
   surfaces live patch awareness (whether a parameter is active in the current
   preset's formulas or requires a HUD toggle). */
(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }

  function hasIdent(expr, name) {
    if (!expr) return false;
    return new RegExp('\\b' + name + '\\b').test(expr);
  }

  function readContext(el) {
    var fx = $('formulaX') ? $('formulaX').value : '';
    var fy = $('formulaY') ? $('formulaY').value : '';
    var fz = $('formulaZ') ? $('formulaZ').value : '';
    var formulas = fx + ' ' + fy + ' ' + fz;
    var rInEl = $('innerRadius');
    var rInVal = rInEl ? parseFloat(rInEl.value) : 0;
    var activeStretchEl = document.querySelector('.route-chip[data-stretch].active');
    return {
      formulas: formulas,
      rInVal: isFinite(rInVal) ? rInVal : 0,
      lockVol: !!($('btnLockVol') && $('btnLockVol').classList.contains('active')),
      resonanceOn: !!($('btnResonance') && $('btnResonance').classList.contains('active')),
      strobeOn: !!($('btnStrobeN') && $('btnStrobeN').classList.contains('active')),
      stretchMode: activeStretchEl ? activeStretchEl.getAttribute('data-stretch') : 'off',
      etaText: $('modEtaOut') ? $('modEtaOut').textContent : '',
      alphaText: $('modStretchOut') ? $('modStretchOut').textContent : '',
      volText: $('shellVolOut') ? $('shellVolOut').textContent : '',
      orderDetail: $('orderNBadge') ? ($('orderNBadge').dataset.hintDetail || '') : '',
      syzygyDetail: $('syzygyBadge') ? ($('syzygyBadge').dataset.hintDetail || '') : '',
      el: el || null
    };
  }

  var HINTS = {
    lockVol: {
      title: 'Lock Volume V',
      accent: 'emerald',
      desc: 'Keeps shell volume fixed so expanding Cavity r automatically pushes Outer R outward.',
      check: function (ctx) {
        return ctx.lockVol
          ? { text: 'Locked · V invariant', tone: 'active' }
          : { text: 'Off · R & r independent', tone: 'info' };
      }
    },
    r: {
      title: 'Outer R · OSC A',
      accent: 'cyan',
      desc: 'Radius of the outer sphere carrier (OSC A) — scales the main orbit and shell boundary.',
      check: function (ctx) {
        return ctx.lockVol
          ? { text: 'Active · Lock V coupled', tone: 'active' }
          : { text: 'Active in patch', tone: 'active' };
      }
    },
    rIn: {
      title: 'Cavity r · OSC B',
      accent: 'emerald',
      desc: 'Inner hollow core (OSC B) — sets shell thickness, resonance pitch ratio, and inner boundary.',
      check: function (ctx) {
        if (ctx.rInVal <= 0.001) return { text: 'r = 0 · Solid ball', tone: 'info' };
        if (ctx.lockVol) return { text: 'Active · Lock V coupled', tone: 'active' };
        return { text: 'Active in patch', tone: 'active' };
      }
    },
    eta: {
      title: 'Cavity Ratio η = r/R',
      accent: 'emerald',
      desc: 'Inner-to-outer radius fraction — 0 is a solid ball, approaching 1 is a razor-thin shell.',
      check: function (ctx) {
        return ctx.etaText ? { text: 'η = ' + ctx.etaText, tone: 'info' } : null;
      }
    },
    alpha: {
      title: 'Time-Stretch α = R/r',
      accent: 'emerald',
      desc: 'Frequency and time-stretch ratio between outer and inner spheres (2.00× = exact octave).',
      check: function (ctx) {
        return ctx.alphaText ? { text: 'α = ' + ctx.alphaText, tone: 'info' } : null;
      }
    },
    vol: {
      title: 'Shell Volume V',
      accent: 'cyan',
      desc: 'Hollow volume 4/3·π(R³ − r³) between Cavity r and Outer R — held constant when Lock V is on.',
      check: function (ctx) {
        return ctx.lockVol
          ? { text: 'V = ' + ctx.volText + ' · Locked', tone: 'active' }
          : { text: 'V = ' + ctx.volText, tone: 'info' };
      }
    },
    syzygy: {
      title: 'Modal Resonance Tuning',
      accent: 'emerald',
      desc: 'Harmonic alignment between Outer (1/R), Inner (1/r), and Wall (1/(R−r)) breathing modes.',
      check: function (ctx) {
        if (ctx.syzygyDetail) {
          var locked = $('syzygyBadge') && $('syzygyBadge').classList.contains('locked');
          return { text: ctx.syzygyDetail, tone: locked ? 'active' : 'info' };
        }
        return null;
      }
    },
    snap_0: {
      title: 'Snap 0 · Solid Ball',
      accent: 'emerald',
      desc: 'Sets Cavity r = 0 (solid sphere, OSC A only) for a clean single-carrier reference.'
    },
    snap_half: {
      title: 'Snap .50 · Exact Octave',
      accent: 'emerald',
      desc: 'Sets r/R = 0.50 (α = 2:1 octave · Triple Lock 1:2:2 between outer, inner, and wall).'
    },
    snap_2_3: {
      title: 'Snap 2/3 · Perfect Fifth',
      accent: 'emerald',
      desc: 'Sets r/R = 2/3 (α = 3:2 fifth · Triple Lock 2:3:6 musical cavity proportion).'
    },
    snap_3db: {
      title: 'Snap −3dB · Half-Power',
      accent: 'emerald',
      desc: 'Sets r/R = 1/√2 ≈ 0.707 — equal-energy cross-section where the 4-bit bow sits tangent.'
    },
    snap_3_4: {
      title: 'Snap .75 · Perfect Fourth',
      accent: 'emerald',
      desc: 'Sets r/R = 0.75 (α = 4:3 fourth · Triple Lock 3:4:12 thin-shell resonance).'
    },
    sliceZ: {
      title: 'Archimedes Slice z/R',
      accent: 'cyan',
      desc: 'Slides the constant-area axial ring from south (−1) to north (+1); drop an LFO here to sweep it.',
      check: function (ctx) {
        return ctx.resonanceOn
          ? { text: 'Resonance on', tone: 'active' }
          : { text: 'Enable Resonance to view ring', tone: 'unused' };
      }
    },
    orderN: {
      title: 'Order N · Cyclic Steps',
      accent: 'gold',
      desc: 'Quantizes the path into N stepped points — prime N visits every step (jump stride uses slider n).',
      check: function (ctx) {
        if (!ctx.strobeOn) return { text: 'Enable Order N HUD to strobe', tone: 'unused' };
        return ctx.orderDetail
          ? { text: ctx.orderDetail, tone: 'active' }
          : { text: 'Order N strobe active', tone: 'active' };
      }
    },
    phase: {
      title: 'Phase φ',
      accent: 'cyan',
      desc: 'Shifts the starting angle (−180° to +180°), rotating orbits or sliding waves along the slice.',
      check: function (ctx) {
        return hasIdent(ctx.formulas, 'phase')
          ? { text: 'Active in patch', tone: 'active' }
          : { text: 'Unused in current formula', tone: 'unused' };
      }
    },
    f: {
      title: 'Frequency f',
      accent: 'cyan',
      desc: 'Cycles per loop — raises wave speed and oscillation density in trig, Morlet, and saw patches.',
      check: function (ctx) {
        return hasIdent(ctx.formulas, 'f')
          ? { text: 'Active in patch', tone: 'active' }
          : { text: 'Unused · patch uses n/m/k or u', tone: 'unused' };
      }
    },
    amp: {
      title: 'Output Gain',
      accent: 'cyan',
      desc: 'Master amplitude scale for the trajectory — push above 1.0 to drive points past the outer shell.',
      check: function () {
        return { text: 'Always active', tone: 'active' };
      }
    },
    K: {
      title: 'Partials K',
      accent: 'gold',
      desc: 'Number of layered overtones (0 = pure smooth wave, up to 14 = sharp square or fractal detail).',
      check: function (ctx) {
        return hasIdent(ctx.formulas, 'K')
          ? { text: 'Active in patch', tone: 'active' }
          : { text: 'Unused · try Weierstrass / Square', tone: 'unused' };
      }
    },
    a: {
      title: 'Fractal Decay a',
      accent: 'gold',
      desc: 'Weight of finer fractal layers (a^k) — higher values make jagged ripples taller.',
      check: function (ctx) {
        return (hasIdent(ctx.formulas, 'a') || ctx.formulas.indexOf('weierstrass(') >= 0)
          ? { text: 'Active in patch', tone: 'active' }
          : { text: 'Unused · try Weierstrass Fractal', tone: 'unused' };
      }
    },
    b: {
      title: 'Lacunarity b',
      accent: 'gold',
      desc: 'Frequency jump between fractal layers (b^k) — higher b packs finer ripples tighter.',
      check: function (ctx) {
        return (hasIdent(ctx.formulas, 'b') || ctx.formulas.indexOf('weierstrass(') >= 0)
          ? { text: 'Active in patch', tone: 'active' }
          : { text: 'Unused · try Weierstrass Fractal', tone: 'unused' };
      }
    },
    n: {
      title: 'Ratio n · Stride',
      accent: 'gold',
      desc: 'Integer harmonic multiplier for knots and shells — also sets the jump stride for Order N.',
      check: function (ctx) {
        if (hasIdent(ctx.formulas, 'n')) return { text: 'Active in patch', tone: 'active' };
        if (ctx.strobeOn) return { text: 'Active · Order N stride', tone: 'active' };
        return { text: 'Unused · try Lissajous / Order N', tone: 'unused' };
      }
    },
    m: {
      title: 'Ratio m',
      accent: 'gold',
      desc: 'Second integer frequency ratio — shapes cross-axis loops in Lissajous knots, torus, and shells.',
      check: function (ctx) {
        return hasIdent(ctx.formulas, 'm')
          ? { text: 'Active in patch', tone: 'active' }
          : { text: 'Unused · try Lissajous / Torus', tone: 'unused' };
      }
    },
    k: {
      title: 'Ratio k',
      accent: 'gold',
      desc: 'Third integer frequency ratio — controls Z-axis depth weaving in 3D Lissajous harmonic knots.',
      check: function (ctx) {
        return hasIdent(ctx.formulas, 'k')
          ? { text: 'Active in patch', tone: 'active' }
          : { text: 'Unused · try Lissajous Knot', tone: 'unused' };
      }
    },
    phaseExact: {
      title: 'Exact Phase (deg / rad)',
      accent: 'cyan',
      desc: 'Type an exact phase angle in degrees; displays the live radian equivalent right next to it.',
      check: function (ctx) {
        return hasIdent(ctx.formulas, 'phase')
          ? { text: 'Active in patch', tone: 'active' }
          : { text: 'Unused in current formula', tone: 'unused' };
      }
    },
    stretch_lbl: {
      title: 'Time-Stretch Coupling',
      accent: 'emerald',
      desc: 'Links Cavity r stretch ratio (α = R/r) directly into wavelet width, tape speed, or phase drift.'
    },
    stretch_off: {
      title: 'Stretch · Off',
      accent: 'emerald',
      desc: 'Cavity r stays purely geometric — it does not bend wavelet width, speed, or phase.',
      check: function (ctx) {
        return ctx.stretchMode === 'off'
          ? { text: 'Selected', tone: 'info' }
          : { text: 'Click to turn off', tone: 'info' };
      }
    },
    stretch_pitch: {
      title: 'Stretch · Pitch Lock',
      accent: 'emerald',
      desc: 'Couples Morlet wavelet width σ to α = R/r so changing Cavity r stretches the wave envelope.',
      check: function (ctx) {
        if (ctx.rInVal <= 0.001) return { text: 'Needs Cavity r > 0', tone: 'unused' };
        return ctx.stretchMode === 'pitchLock'
          ? { text: 'Active · α = ' + ctx.alphaText, tone: 'active' }
          : { text: 'Click to enable', tone: 'info' };
      }
    },
    stretch_tape: {
      title: 'Stretch · Tape Speed',
      accent: 'emerald',
      desc: 'Divides Frequency f by α = R/r — shrinking Cavity r slows the wave like analog tape varispeed.',
      check: function (ctx) {
        if (ctx.rInVal <= 0.001) return { text: 'Needs Cavity r > 0', tone: 'unused' };
        return ctx.stretchMode === 'tape'
          ? { text: 'Active · f / ' + ctx.alphaText, tone: 'active' }
          : { text: 'Click to enable', tone: 'info' };
      }
    },
    stretch_jacob: {
      title: 'Stretch · Jacobian Phase',
      accent: 'emerald',
      desc: 'Adds η²·π phase shift as the cavity expands — smooth geometric phase drift tied to shell ratio.',
      check: function (ctx) {
        if (ctx.rInVal <= 0.001) return { text: 'Needs Cavity r > 0', tone: 'unused' };
        return ctx.stretchMode === 'jacobian'
          ? { text: 'Active · η = ' + ctx.etaText, tone: 'active' }
          : { text: 'Click to enable', tone: 'info' };
      }
    }
  };

  function init() {
    var bar = $('paramHintBar');
    var titleEl = $('paramHintTitle');
    var statusEl = $('paramHintStatus');
    var bodyEl = $('paramHintBody');
    var panel = $('leftPanel');
    if (!bar || !titleEl || !statusEl || !bodyEl || !panel) return;

    var activeKey = null;
    var activeEl = null;
    var lockedKey = null;
    var lockedEl = null;

    function render(key, el, locked) {
      var def = key && HINTS[key];
      if (!def) {
        clear();
        return;
      }
      activeKey = key;
      activeEl = el || null;
      bar.setAttribute('data-state', 'active');
      bar.setAttribute('data-accent', def.accent || 'cyan');
      bar.setAttribute('data-locked', locked ? 'true' : 'false');
      titleEl.textContent = def.title;
      bodyEl.textContent = def.desc;

      var status = typeof def.check === 'function' ? def.check(readContext(el)) : null;
      if (status && status.text) {
        statusEl.textContent = status.text;
        statusEl.setAttribute('data-tone', status.tone || 'info');
        statusEl.hidden = false;
      } else {
        statusEl.textContent = '';
        statusEl.hidden = true;
      }
    }

    function clear() {
      activeKey = null;
      activeEl = null;
      bar.setAttribute('data-state', 'idle');
      bar.removeAttribute('data-accent');
      bar.setAttribute('data-locked', 'false');
      titleEl.textContent = '';
      bodyEl.textContent = '';
      statusEl.textContent = '';
      statusEl.hidden = true;
    }

    function refresh() {
      if (lockedKey) {
        render(lockedKey, lockedEl, true);
      } else if (activeKey) {
        render(activeKey, activeEl, false);
      }
    }

    function findHintEl(node) {
      if (!node || !node.closest) return null;
      var hit = node.closest('[data-hint]');
      return hit && panel.contains(hit) ? hit : null;
    }

    panel.addEventListener('pointerover', function (e) {
      if (lockedKey) return;
      var hit = findHintEl(e.target);
      if (!hit) return;
      var key = hit.getAttribute('data-hint');
      if (key && HINTS[key]) {
        render(key, hit, false);
      }
    });

    panel.addEventListener('pointerout', function (e) {
      if (lockedKey) return;
      var leaving = findHintEl(e.target);
      if (!leaving) return;
      var entering = findHintEl(e.relatedTarget);
      if (entering === leaving) return;
      if (entering) {
        var nextKey = entering.getAttribute('data-hint');
        if (nextKey && HINTS[nextKey]) {
          render(nextKey, entering, false);
          return;
        }
      }
      // Keep visible if keyboard focus is still inside a hinted control
      var focused = findHintEl(document.activeElement);
      if (focused && focused !== leaving) {
        render(focused.getAttribute('data-hint'), focused, false);
      } else {
        clear();
      }
    });

    panel.addEventListener('focusin', function (e) {
      if (lockedKey) return;
      var hit = findHintEl(e.target);
      if (!hit) return;
      var key = hit.getAttribute('data-hint');
      if (key && HINTS[key]) {
        render(key, hit, false);
      }
    });

    panel.addEventListener('focusout', function (e) {
      if (lockedKey) return;
      var nextFocused = findHintEl(e.relatedTarget);
      if (nextFocused) {
        var key = nextFocused.getAttribute('data-hint');
        if (key && HINTS[key]) {
          render(key, nextFocused, false);
          return;
        }
      }
      clear();
    });

    // Lock the hint while dragging any slider or pressing a control
    panel.addEventListener('pointerdown', function (e) {
      var hit = findHintEl(e.target);
      if (!hit) return;
      var key = hit.getAttribute('data-hint');
      if (!key || !HINTS[key]) return;
      lockedKey = key;
      lockedEl = hit;
      render(lockedKey, lockedEl, true);
    });

    function releaseLock(e) {
      if (!lockedKey) return;
      lockedKey = null;
      lockedEl = null;
      // Check what is currently under the pointer after drag release
      var under = (e && typeof e.clientX === 'number' && typeof e.clientY === 'number')
        ? document.elementFromPoint(e.clientX, e.clientY)
        : null;
      var hit = findHintEl(under);
      if (hit) {
        var key = hit.getAttribute('data-hint');
        if (key && HINTS[key]) {
          render(key, hit, false);
          return;
        }
      }
      clear();
    }

    window.addEventListener('pointerup', releaseLock);
    window.addEventListener('pointercancel', releaseLock);

    // Keep live status badges fresh while dragging sliders or toggling Lock V / presets
    panel.addEventListener('input', refresh);
    panel.addEventListener('change', refresh);
    panel.addEventListener('click', function () {
      window.setTimeout(refresh, 0);
    });

    // Expose cleanly for future expansion (e.g. formula tokens or HUD controls)
    window.Harmony = window.Harmony || {};
    window.Harmony.ParamHints = {
      hints: HINTS,
      show: function (key, el) { render(key, el, false); },
      clear: clear,
      refresh: refresh
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
