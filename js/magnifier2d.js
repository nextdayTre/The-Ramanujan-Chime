/* ===== Harmony.Magnifier2D — Circular Fractal & Harmonic Zoom Lens =====
   Inspired directly by the circular self-similarity inset on the Weierstrass
   function plot: re-evaluates Harmony.engine.sampleWindow() at float32
   precision around the focus point (playhead, origin x=0, or trough x=+1)
   so zooming 4× → 256× reveals true micro-scale harmonic/fractal structure
   with zero polygon aliasing. */
(function () {
  'use strict';

  var canvas, ctx;

  function init(el) {
    canvas = el;
    ctx = el ? el.getContext('2d') : null;
  }

  function focusT(state, playT) {
    var mode = state.magFocus || 'trough';
    if (mode === 'playhead') return playT;
    if (mode === 'origin') return 0.5;
    return 0.75; // u = +0.5 => Weierstrass x = +1 trough (matches the red dot!)
  }

  function focusPoint(state, playT) {
    var tc = focusT(state, playT);
    return Harmony.engine.point(state, tc);
  }

  function sizeCanvas() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = canvas.clientWidth || 176;
    var h = canvas.clientHeight || 176;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    return [w, h];
  }

  function zoneStroke(d, R, rIn) {
    var tol = R * 0.045;
    if (Math.abs(d - R) <= tol) return '#4df3dd';
    if (d > R + tol) return '#ff6b6b';
    if (rIn > 0.02 && d < rIn - tol * 0.5) return '#5aa9ff';
    return '#6ee7a0';
  }

  function update(state, playT) {
    if (!ctx || !canvas) return;
    if (!state.toggles.magnifier) return;

    var wh = sizeCanvas();
    var w = wh[0], h = wh[1];
    var cx = w / 2, cy = h / 2;
    var rad = Math.min(w, h) / 2 - 3;

    ctx.clearRect(0, 0, w, h);

    var tc = focusT(state, playT);
    var centerPt = Harmony.engine.point(state, tc);
    if (!centerPt || !centerPt.valid) {
      centerPt = { x: 0, y: 0, z: 0, valid: false };
    }

    var zoom = Math.max(2, state.magZoom || 16);
    var worldHalfSpan = Math.max(0.0005, state.r / zoom);
    var pxPerUnit = rad / worldHalfSpan;

    // Circular lens clip
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.clip();

    // Deep dark oscilloscope glass background
    var grad = ctx.createRadialGradient(cx, cy, rad * 0.1, cx, cy, rad);
    grad.addColorStop(0, 'rgba(15, 25, 36, 0.94)');
    grad.addColorStop(1, 'rgba(8, 12, 18, 0.97)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Local reticle grid
    ctx.strokeStyle = 'rgba(124, 135, 154, 0.18)';
    ctx.lineWidth = 1;
    var stepPx = rad / 2;
    for (var g = -1; g <= 1; g++) {
      ctx.beginPath();
      ctx.moveTo(cx + g * stepPx, cy - rad);
      ctx.lineTo(cx + g * stepPx, cy + rad);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - rad, cy + g * stepPx);
      ctx.lineTo(cx + rad, cy + g * stepPx);
      ctx.stroke();
    }

    // Draw zoomed Outer Sphere R & Inner Cavity rIn boundary circles (projected in XY)
    var ox = cx - centerPt.x * pxPerUnit;
    var oy = cy + centerPt.y * pxPerUnit;
    ctx.strokeStyle = 'rgba(54, 214, 200, 0.32)';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(ox, oy, state.r * pxPerUnit, 0, Math.PI * 2);
    ctx.stroke();

    var rIn = Math.min(state.rIn || 0, state.r);
    if (rIn > 0.02) {
      ctx.strokeStyle = 'rgba(255, 107, 122, 0.30)';
      ctx.beginPath();
      ctx.arc(ox, oy, rIn * pxPerUnit, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Re-sample exact formula across zoomed parameter window
    var tHalf = Math.min(0.5, 0.65 / zoom);
    var samples = Harmony.engine.sampleWindow(state, tc, tHalf, 420);

    // Optional Conjugate Twin in zoomed view
    var mode = state.twinMode || 'off';
    if (mode === 'conjugate' || mode === 'both') {
      ctx.strokeStyle = 'rgba(255, 176, 77, 0.5)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      var stC = false;
      for (var ic = 0; ic < samples.length; ic++) {
        var pc = samples[ic];
        if (!pc.valid) { stC = false; continue; }
        var sxC = cx + (pc.x - centerPt.x) * pxPerUnit;
        var syC = cy - (-pc.y - centerPt.y) * pxPerUnit;
        if (stC) ctx.lineTo(sxC, syC); else { ctx.moveTo(sxC, syC); stC = true; }
      }
      ctx.stroke();
    }

    // Main micro-sampled curve
    ctx.lineWidth = 1.7;
    var dCenter = Math.sqrt(centerPt.x * centerPt.x + centerPt.y * centerPt.y + centerPt.z * centerPt.z);
    ctx.strokeStyle = zoneStroke(dCenter, state.r, rIn);
    ctx.beginPath();
    var started = false;
    for (var i = 0; i < samples.length; i++) {
      var p = samples[i];
      if (!p.valid) { started = false; continue; }
      var sx = cx + (p.x - centerPt.x) * pxPerUnit;
      var sy = cy - (p.y - centerPt.y) * pxPerUnit;
      if (sx < -w || sx > 2 * w || sy < -h || sy > 2 * h) {
        if (started) ctx.lineTo(sx, sy);
        started = false;
        continue;
      }
      if (started) ctx.lineTo(sx, sy);
      else { ctx.moveTo(sx, sy); started = true; }
    }
    ctx.stroke();

    // Target red focus dot at lens center
    if (centerPt.valid) {
      ctx.fillStyle = '#ff5252';
      ctx.shadowColor = '#ff5252';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(cx, cy, 3.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Micro telemetry inside lens
    ctx.fillStyle = 'rgba(215, 221, 230, 0.88)';
    ctx.font = '600 10px "Cascadia Code", Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(zoom + '× ZOOM', cx, 18);

    ctx.fillStyle = 'rgba(124, 135, 154, 0.9)';
    ctx.font = '9.5px "Cascadia Code", Consolas, monospace';
    ctx.fillText('±' + worldHalfSpan.toPrecision(2) + 'u', cx, h - 10);

    ctx.restore();

    // Outer lens ring border (coral-red accent echoing the Weierstrass callout!)
    ctx.strokeStyle = 'rgba(255, 92, 108, 0.82)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.stroke();
  }

  window.Harmony.Magnifier2D = {
    init: init,
    update: update,
    focusPoint: focusPoint,
    focusT: focusT
  };
})();
