/* ===== Harmony.GroverLens — Grover's Search & Colliding Blocks (π) Rosetta Showcase =====
   Opt-in case-study lens launched from ? Guide #08. Drives the exact same
   float32 Harmony.engine formulas (groverX/Y, blocksX/Y, cos/sin/asin/sqrt)
   and displays a live 3Blue1Brown-style Rosetta mapping between real-world
   physics/quantum concepts and the Chime's circle, Conjugate Twin P̄, and sliders. */
(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }

  var ROSETTA_GROVER = [
    ['Unit Circle R', 'Total Probability (X² + Y² = 1)'],
    ['Top Pole (+Y)', 'Target Key |k⟩ (Hit % = Y²)'],
    ['Conjugate P̄ (x,−y)', 'Oracle Sign-Flip (y → −y)'],
    ['Order N / Partials K', 'Search Space N / Iterations']
  ];

  var ROSETTA_BLOCKS = [
    ['Unit Circle R', 'Total Kinetic Energy (X² + Y² = E)'],
    ['X / Y Axes', 'Big √M·v₁ / Small Block √m·v₂'],
    ['Conjugate P̄ (x,−y)', 'Small Block Wall Bounce'],
    ['Slanted Chords', 'Momentum Collision (Slope −√M/m)']
  ];

  var host = null;
  var active = false;
  var mode = 'chords';       // 'chords' | 'orbit' | 'blocks'
  var blocksPreset = '10';   // '10' | '100' | 'live'

  function renderRosetta() {
    var box = $('grvRosettaTable');
    if (!box) return;
    var rows = (mode === 'blocks') ? ROSETTA_BLOCKS : ROSETTA_GROVER;
    box.innerHTML = rows.map(function (pair) {
      return '<div class="grv-ros-row"><span class="grv-ros-k">' + pair[0] + '</span>' +
        '<span class="grv-ros-v">' + pair[1] + '</span></div>';
    }).join('');
  }

  function renderScaleButtons() {
    var row = $('grvScaleRow');
    if (!row) return;
    if (mode === 'blocks') {
      row.innerHTML =
        '<button type="button" class="mag-chip' + (blocksPreset === '10' ? ' active' : '') + '" data-grv-blocks="10">10:1 (10)</button>' +
        '<button type="button" class="mag-chip' + (blocksPreset === '100' ? ' active' : '') + '" data-grv-blocks="100">100:1 (31 → π)</button>' +
        '<button type="button" class="mag-chip' + (blocksPreset === 'live' ? ' active' : '') + '" data-grv-blocks="live">Live N</button>';
    } else {
      var curN = host ? Math.round(host.getState().orderN || 16) : 16;
      row.innerHTML =
        '<button type="button" class="mag-chip' + (curN === 16 ? ' active' : '') + '" data-grv-scale="16">N=16 (4-bit)</button>' +
        '<button type="button" class="mag-chip' + (curN === 25 ? ' active' : '') + '" data-grv-scale="25">N=25</button>' +
        '<button type="button" class="mag-chip' + (curN === 64 ? ' active' : '') + '" data-grv-scale="64">N=64 (6-bit)</button>';
    }
    var peakBtn = $('btnGroverPeak');
    if (peakBtn) {
      peakBtn.textContent = (mode === 'blocks') ? 'End (π)' : 'Jump Peak';
    }
  }

  function syncModeButtons() {
    var btns = document.querySelectorAll('#groverWidget [data-grv-mode]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('active', btns[i].getAttribute('data-grv-mode') === mode);
    }
  }

  function effectiveNK(st) {
    if (mode === 'blocks' && blocksPreset === '100') {
      return { N: 101, K: 0 };
    }
    return {
      N: Math.max(2, Math.round(st.orderN || 16)),
      K: Math.max(0, Math.round(st.K == null ? 4 : st.K))
    };
  }

  function applyPatch(opts) {
    if (!host) return;
    opts = opts || {};
    var st = host.getState();
    var fx, fy, fz = '0';
    var nextN = opts.orderN != null ? opts.orderN : st.orderN;
    var nextK = opts.K != null ? opts.K : st.K;

    if (mode === 'chords') {
      fx = 'r*groverX(t, N, K)';
      fy = 'r*groverY(t, N, K)';
    } else if (mode === 'orbit') {
      fx = 'r*cos((2*K*t+1)*asin(1/sqrt(N)))';
      fy = 'r*sin((2*K*t+1)*asin(1/sqrt(N)))';
    } else {
      if (blocksPreset === '100') {
        fx = 'r*blocksX(t, 101, 0)';
        fy = 'r*blocksY(t, 101, 0)';
      } else {
        fx = 'r*blocksX(t, N, K)';
        fy = 'r*blocksY(t, N, K)';
      }
    }

    host.apply({
      formulas: { x: fx, y: fy, z: fz },
      orderN: nextN,
      K: nextK,
      r: 1.0,
      rIn: 0.0,
      amp: 1.0,
      twinMode: 'conjugate',
      sliceGrid: true,
      cutaway: false,
      fourBitOrbit: false,
      resonanceMode: false,
      strobeN: false,
      magnifier: false,
      camera: opts.camera || null,
      animate: opts.animate
    });

    syncModeButtons();
    renderScaleButtons();
    renderRosetta();
    update(host.getState());
  }

  function open(opts) {
    opts = opts || {};
    mode = opts.mode || 'chords';
    blocksPreset = opts.blocksPreset || '10';
    active = true;
    var widget = $('groverWidget');
    if (widget) widget.hidden = false;

    applyPatch({
      orderN: opts.orderN != null ? opts.orderN : (mode === 'blocks' ? 11 : 16),
      K: opts.K != null ? opts.K : (mode === 'blocks' ? 10 : 4),
      camera: 'front',
      animate: opts.animate != null ? opts.animate : true
    });
  }

  function close() {
    active = false;
    var widget = $('groverWidget');
    if (widget) widget.hidden = true;
  }

  function update(st) {
    if (!active || !st) return;
    var Engine = window.Harmony && window.Harmony.engine;
    if (!Engine || !Engine.groverMetrics) return;
    var nk = effectiveNK(st);
    var m = Engine.groverMetrics(nk.N, nk.K, st.playT, mode);

    var badge = $('grvBadge');
    var lbl = $('grvMeterLabel');
    var val = $('grvMeterVal');
    var fill = $('grvBarFill');
    var sub = $('grvSubLine');

    if (mode === 'blocks') {
      if (badge) badge.textContent = m.massRatio + ':1 · ' + m.maxBounces + ' hits';
      if (lbl) lbl.textContent = 'Collisions · ' + m.phaseLabel;
      if (val) val.textContent = m.currentBounce + ' / ' + m.shownBounces;
      if (fill) fill.style.width = (m.shownBounces > 0 ? (100 * m.currentBounce / m.shownBounces) : 0).toFixed(1) + '%';
      if (sub) {
        sub.textContent = 'θ=' + m.thetaDeg.toFixed(2) + '° · ⌊π/θ⌋=' + m.maxBounces +
          ' · Small KE ' + (m.smallEnergy * 100).toFixed(0) + '%';
      }
    } else {
      var pct = (m.targetProb * 100);
      var peakPct = (m.peakProb * 100);
      if (badge) badge.textContent = 'N=' + m.N + ' · ★' + peakPct.toFixed(1) + '% @ ' + m.optSteps;
      if (lbl) lbl.textContent = 'P(|k⟩) = y² · ' + m.phaseLabel;
      if (val) val.textContent = pct.toFixed(1) + '%';
      if (fill) fill.style.width = pct.toFixed(1) + '%';
      var stepTxt = (mode === 'orbit') ? m.currentStep.toFixed(2) : String(m.currentStep);
      if (sub) {
        sub.textContent = 'Step ' + stepTxt + '/' + m.steps +
          ' · θ=' + m.thetaDeg.toFixed(1) + '° · Opt π/4√N=' + m.approxOpt.toFixed(2);
      }
    }

    // Keep scale highlight synced if user drags Order N slider directly
    if (mode !== 'blocks') {
      var curN = Math.round(st.orderN || 16);
      var sBtns = document.querySelectorAll('#grvScaleRow [data-grv-scale]');
      for (var i = 0; i < sBtns.length; i++) {
        sBtns[i].classList.toggle('active', Number(sBtns[i].getAttribute('data-grv-scale')) === curN);
      }
    }
  }

  function stepOnce() {
    if (!host) return;
    var Engine = window.Harmony && window.Harmony.engine;
    var st = host.getState();
    var nk = effectiveNK(st);
    var totalSegs;
    if (mode === 'blocks') {
      var m = Engine.groverMetrics(nk.N, nk.K, st.playT, 'blocks');
      totalSegs = Math.max(1, m.shownBounces);
    } else if (mode === 'chords') {
      totalSegs = Math.max(2, 2 * Math.max(1, nk.K));
    } else {
      totalSegs = Math.max(1, nk.K);
    }
    var curIdx = Math.floor(st.playT * totalSegs + 1e-4);
    var nextIdx = (curIdx + 1) > totalSegs ? 0 : (curIdx + 1);
    host.setClock(nextIdx / totalSegs);
    update(host.getState());
  }

  function jumpPeak() {
    if (!host) return;
    var Engine = window.Harmony && window.Harmony.engine;
    var st = host.getState();
    var nk = effectiveNK(st);
    if (mode === 'blocks') {
      host.setClock(1.0);
    } else {
      var m = Engine.groverMetrics(nk.N, nk.K, st.playT, mode);
      var steps = Math.max(1, nk.K);
      var targetT = Math.min(1, m.optSteps / steps);
      host.setClock(targetT);
    }
    update(host.getState());
  }

  function bindUI() {
    var widget = $('groverWidget');
    if (!widget) return;

    var closeBtn = $('btnGroverClose');
    if (closeBtn) closeBtn.addEventListener('click', close);

    var modeBtns = widget.querySelectorAll('[data-grv-mode]');
    for (var i = 0; i < modeBtns.length; i++) {
      modeBtns[i].addEventListener('click', function () {
        var nextMode = this.getAttribute('data-grv-mode');
        if (!nextMode) return;
        mode = nextMode;
        if (mode === 'blocks') {
          blocksPreset = '10';
          applyPatch({ orderN: 11, K: 10 });
        } else {
          var st = host ? host.getState() : { orderN: 16 };
          var curN = Math.round(st.orderN || 16);
          var nUse = (curN === 11) ? 16 : curN;
          var opt = Math.max(1, Math.round((Math.PI / 4) * Math.sqrt(nUse) - 0.5));
          applyPatch({ orderN: nUse, K: Math.min(14, opt + 1) });
        }
      });
    }

    var scaleRow = $('grvScaleRow');
    if (scaleRow) {
      scaleRow.addEventListener('click', function (e) {
        var btn = e.target && e.target.closest ? e.target.closest('button') : null;
        if (!btn) return;
        if (btn.hasAttribute('data-grv-scale')) {
          var nVal = parseInt(btn.getAttribute('data-grv-scale'), 10);
          if (!isFinite(nVal)) return;
          var opt = Math.max(1, Math.round((Math.PI / 4) * Math.sqrt(nVal) - 0.5));
          applyPatch({ orderN: nVal, K: Math.min(14, opt + 1) });
        } else if (btn.hasAttribute('data-grv-blocks')) {
          blocksPreset = btn.getAttribute('data-grv-blocks');
          if (blocksPreset === '10') {
            applyPatch({ orderN: 11, K: 10 });
          } else if (blocksPreset === '100') {
            applyPatch({ orderN: 64, K: 14 });
          } else {
            var st = host ? host.getState() : { orderN: 16, K: 12 };
            applyPatch({ orderN: st.orderN, K: Math.max(8, st.K || 12) });
          }
        }
      });
    }

    var stepBtn = $('btnGroverStep');
    if (stepBtn) stepBtn.addEventListener('click', stepOnce);

    var peakBtn = $('btnGroverPeak');
    if (peakBtn) peakBtn.addEventListener('click', jumpPeak);
  }

  function attach(adapter) {
    host = adapter;
    bindUI();
  }

  window.Harmony = window.Harmony || {};
  window.Harmony.GroverLens = {
    attach: attach,
    open: open,
    close: close,
    update: update,
    isActive: function () { return active; }
  };
})();
