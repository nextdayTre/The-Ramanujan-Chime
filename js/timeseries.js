/* ===== Harmony.TimeSeries — Dual-Channel Oscilloscope (x(t), y(t) & Twins) =====
   Plots x(t) (white) and y(t) (cyan — the f(x) slice or quadrature channel)
   across t = 0..1, with optional reference sin/saw/tan waves, Hollow Sphere
   R & rIn rails, and a live synchronized playhead cursor. */
(function () {
  'use strict';

  var canvas, ctx, staticCanvas, staticCtx;
  var lastSig = '';
  var halfRange = 2;

  function init(el) {
    canvas = el;
    ctx = el.getContext('2d');
  }

  function ensureSize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return null;
    var pw = Math.round(w * dpr), ph = Math.round(h * dpr);
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return [w, h, dpr];
  }

  function drawLine(g, values, w, h, color, width, dash) {
    var pad = 12, cy = h / 2, halfH = h / 2 - 10;
    g.strokeStyle = color;
    g.lineWidth = width;
    if (dash) g.setLineDash(dash); else g.setLineDash([]);
    g.beginPath();
    var n = values.length, started = false;
    for (var i = 0; i < n; i++) {
      var t = i / (n - 1);
      var v = values[i];
      var x = pad + t * (w - 2 * pad);
      var y = cy - (v / halfRange) * halfH;
      if (isFinite(v) && y > -1e4 && y < 1e4) {
        if (started) g.lineTo(x, y); else { g.moveTo(x, y); started = true; }
      } else {
        started = false;
      }
    }
    g.stroke();
    g.setLineDash([]);
  }

  function renderStatic(state, points, w, h, dpr) {
    if (!staticCanvas) {
      staticCanvas = document.createElement('canvas');
      staticCtx = staticCanvas.getContext('2d');
    }
    staticCanvas.width = Math.round(w * dpr);
    staticCanvas.height = Math.round(h * dpr);
    staticCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var g = staticCtx;
    halfRange = Math.max(1.35 * state.r, state.maxAbs * 1.12, 1.2);
    var pad = 12, cy = h / 2, halfH = h / 2 - 10;

    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(9,12,17,0.65)';
    g.fillRect(0, 0, w, h);

    // Zero axis
    g.strokeStyle = 'rgba(124,135,154,0.32)';
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(pad, cy); g.lineTo(w - pad, cy); g.stroke();

    // ±R rails (outer sphere ceiling) & ±rIn rails (inner cavity)
    var rY = (state.r / halfRange) * halfH;
    g.strokeStyle = 'rgba(54,214,200,0.22)';
    g.setLineDash([4, 4]);
    g.beginPath();
    g.moveTo(pad, cy - rY); g.lineTo(w - pad, cy - rY);
    g.moveTo(pad, cy + rY); g.lineTo(w - pad, cy + rY);
    g.stroke();

    var rIn = Math.min(state.rIn != null ? state.rIn : 0, state.r);
    if (rIn > 0.02) {
      var rInY = (rIn / halfRange) * halfH;
      g.strokeStyle = 'rgba(255,107,122,0.20)';
      g.beginPath();
      g.moveTo(pad, cy - rInY); g.lineTo(w - pad, cy - rInY);
      g.moveTo(pad, cy + rInY); g.lineTo(w - pad, cy + rInY);
      g.stroke();
    }
    g.setLineDash([]);

    g.save();
    g.beginPath(); g.rect(pad, 2, w - 2 * pad, h - 4); g.clip();

    // Optional reference waveforms (saw / tan)
    if (state.toggles.refWaves) {
      var N = 500, refSaw = [], refTan = [];
      for (var r = 0; r < N; r++) {
        var tr = r / (N - 1);
        refSaw.push(state.r * (2 * (tr - Math.floor(tr)) - 1));
        refTan.push(state.r * Math.tan(Math.PI * 2 * tr));
      }
      drawLine(g, refSaw, w, h, 'rgba(110,231,160,0.45)', 1.1, [3, 3]);
      drawLine(g, refTan, w, h, 'rgba(224,113,255,0.45)', 1.1);
    }

    if (state.toggles && state.toggles.ghostRef && state.ghostPoints && state.ghostPoints.length > 1) {
      var gStep = Math.max(1, Math.floor(state.ghostPoints.length / 900));
      var gYs = [];
      for (var gi = 0; gi < state.ghostPoints.length; gi += gStep) {
        var gp = state.ghostPoints[gi];
        gYs.push(gp.valid ? gp.y : NaN);
      }
      drawLine(g, gYs, w, h, 'rgba(157,140,255,0.52)', 1.25, [4, 3]);
    }

    if (points && points.length > 1) {
      var step = Math.max(1, Math.floor(points.length / 900));
      var xs = [], ys = [], negYs = [];
      for (var i = 0; i < points.length; i += step) {
        var p = points[i];
        xs.push(p.valid ? p.x : NaN);
        ys.push(p.valid ? p.y : NaN);
        negYs.push(p.valid ? -p.y : NaN);
      }
      var mode = state.twinMode || 'both';
      if (mode === 'conjugate' || mode === 'both') {
        drawLine(g, negYs, w, h, 'rgba(255,176,77,0.62)', 1.2, [3, 3]);
      } else if (mode === 'antipodal') {
        drawLine(g, negYs, w, h, 'rgba(255,92,168,0.62)', 1.2, [3, 3]);
      }
      drawLine(g, xs, w, h, 'rgba(255,255,255,0.78)', 1.35);
      drawLine(g, ys, w, h, 'rgba(77,243,221,0.95)', 1.65);
    }

    g.restore();

    // Compact legend
    var items = [
      ['#4df3dd', 'y(t) / f(x)'],
      ['#ffffff', 'x(t)']
    ];
    if (state.twinMode && state.twinMode !== 'off') {
      items.push([state.twinMode === 'antipodal' ? '#ff5ca8' : '#ffb04d', 'twin (−y)']);
    }
    if (state.toggles && state.toggles.ghostRef) {
      items.push(['#9d8cff', 'ghost ' + (state.ghostSlot || 'ref')]);
    }
    if (state.toggles.refWaves) {
      items.push(['#6ee7a0', 'saw']);
      items.push(['#e071ff', 'tan']);
    }
    var lx = pad + 4, ly = 13;
    g.font = '10px "Cascadia Code", Consolas, monospace';
    g.textBaseline = 'middle';
    for (var k = 0; k < items.length; k++) {
      g.fillStyle = items[k][0];
      g.fillRect(lx, ly - 3, 8, 6);
      g.fillStyle = 'rgba(215,221,230,0.88)';
      var txt = items[k][1];
      g.fillText(txt, lx + 12, ly);
      lx += g.measureText(txt).width + 24;
    }
  }

  function update(state, points, dirty, playT) {
    if (!ctx) return;
    var sz = ensureSize();
    if (!sz) return;
    var w = sz[0], h = sz[1], dpr = sz[2];

    var sig = [dirty, w, h, dpr, state.twinMode, !!state.toggles.refWaves, !!state.toggles.ghostRef, state.ghostRev || 0, (state.rIn || 0).toFixed(3)].join('|');
    if (sig !== lastSig) {
      lastSig = sig;
      renderStatic(state, points, w, h, dpr);
    }

    ctx.clearRect(0, 0, w, h);
    if (staticCanvas) ctx.drawImage(staticCanvas, 0, 0, w, h);

    // Live synchronized playhead cursor
    if (playT != null) {
      var pad = 12, cy = h / 2, halfH = h / 2 - 10;
      var px = pad + playT * (w - 2 * pad);
      ctx.strokeStyle = 'rgba(255,194,68,0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px, 4); ctx.lineTo(px, h - 4); ctx.stroke();

      var ph = Harmony.engine.playhead(state, points, playT);
      if (ph.point) {
        var pyY = cy - (ph.point.y / halfRange) * halfH;
        var pyX = cy - (ph.point.x / halfRange) * halfH;
        if (isFinite(pyX)) {
          ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.arc(px, pyX, 2.6, 0, Math.PI * 2); ctx.fill();
        }
        if (isFinite(pyY)) {
          ctx.fillStyle = '#4df3dd';
          ctx.beginPath(); ctx.arc(px, pyY, 3.0, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
  }

  window.Harmony.TimeSeries = { init: init, update: update };
})();
