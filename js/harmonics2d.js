/* ===== Harmony.Harmonics2D — Spectral Twins & Ramanujan 1/π dB Convergence =====
   Left canvas:  Weierstrass a^k·cos(b^k·πx) partial bars + Morlet ±ω₀ conjugate
                 spectral bumps (HARMONY_ENGINE.md §4.4).
   Right canvas: Ramanujan 1914 1/π series vs. Fourier odd-harmonic series in dB,
                 highlighting the IEEE-754 Float32 lock (0x40490FDB at −144.5 dB). */
(function () {
  'use strict';

  var specCanvas, specCtx, ramCanvas, ramCtx;

  function init(specEl, ramEl) {
    specCanvas = specEl; specCtx = specEl ? specEl.getContext('2d') : null;
    ramCanvas = ramEl;   ramCtx = ramEl ? ramEl.getContext('2d') : null;
  }

  function size(c, g) {
    if (!c || !g) return null;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = c.clientWidth, h = c.clientHeight;
    if (!w || !h) return null;
    var pw = Math.round(w * dpr), ph = Math.round(h * dpr);
    if (c.width !== pw || c.height !== ph) {
      c.width = pw; c.height = ph;
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return [w, h];
  }

  // Left: Weierstrass Partial Rolloff & Conjugate ±ω Spectrum
  function drawSpectrum(state) {
    var sz = size(specCanvas, specCtx);
    if (!sz) return;
    var w = sz[0], h = sz[1], g = specCtx;

    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(9,12,17,0.65)';
    g.fillRect(0, 0, w, h);

    var K = Math.max(0, Math.round(state.K != null ? state.K : 6));
    var a = state.a != null ? state.a : 0.5;
    var b = state.b != null ? state.b : 3;
    var isMorlet = /morlet/i.test(state.formulas.x + state.formulas.y);

    if (isMorlet) {
      // Draw Hermitian-symmetric spectrum Ψ̂(ω) = bump(+ω₀) + bump(−ω₀) (§4.4)
      var cx = w / 2, base = h - 22, topH = h - 42;
      g.strokeStyle = 'rgba(124,135,154,0.35)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(14, base); g.lineTo(w - 14, base);
      g.moveTo(cx, 12); g.lineTo(cx, base);
      g.stroke();

      var w0 = Math.min(0.65, 0.22 * state.f);
      var sigW = 0.11;
      var mode = state.twinMode || 'both';
      var showNeg = (mode !== 'off');

      // Negative-frequency conjugate twin bump (−ω₀)
      if (showNeg) {
        g.strokeStyle = '#ffb04d';
        g.fillStyle = 'rgba(255,176,77,0.16)';
        g.lineWidth = 1.8;
        g.beginPath();
        for (var ix = 14; ix <= w - 14; ix++) {
          var u = (ix - cx) / (w * 0.42);
          var envN = Math.exp(-0.5 * Math.pow((u + w0) / sigW, 2));
          var pyN = base - envN * topH;
          if (ix === 14) g.moveTo(ix, base);
          g.lineTo(ix, pyN);
        }
        g.lineTo(w - 14, base);
        g.closePath(); g.fill(); g.stroke();
      }

      // Positive-frequency analytic bump (+ω₀)
      g.strokeStyle = '#4df3dd';
      g.fillStyle = 'rgba(77,243,221,0.18)';
      g.lineWidth = 1.8;
      g.beginPath();
      for (var px = 14; px <= w - 14; px++) {
        var u2 = (px - cx) / (w * 0.42);
        var envP = Math.exp(-0.5 * Math.pow((u2 - w0) / sigW, 2));
        var pyP = base - envP * topH;
        if (px === 14) g.moveTo(px, base);
        g.lineTo(px, pyP);
      }
      g.lineTo(w - 14, base);
      g.closePath(); g.fill(); g.stroke();

      g.font = '10px "Cascadia Code", Consolas, monospace';
      g.fillStyle = '#4df3dd';
      g.fillText('+ω₀ analytic ψ', cx + 12, 22);
      if (showNeg) {
        g.fillStyle = '#ffb04d';
        g.fillText('−ω₀ syzygy twin ψ̄', 16, 22);
      }
      g.fillStyle = 'rgba(215,221,230,0.8)';
      g.fillText('Hermitian spectrum (§4.4): real Ψ sums both bumps', 16, h - 7);
      return;
    }

    // Harmonic partial bars for k = 0..14 (highlights active 0..K)
    var maxBars = 15;
    var left = 36, right = 14, top = 24, bot = 22;
    var plotW = w - left - right, plotH = h - top - bot;

    g.strokeStyle = 'rgba(124,135,154,0.3)';
    g.beginPath();
    g.moveTo(left, top + plotH); g.lineTo(w - right, top + plotH);
    g.stroke();

    var barSlot = plotW / maxBars;
    for (var j = 0; j < maxBars; j++) {
      var amp = Math.pow(a, j);
      var db = 20 * Math.log10(Math.max(1e-5, amp)); // 0 dB .. -90 dB
      var normH = Math.max(0.03, (db + 90) / 90);
      var bh = normH * plotH;
      var bx = left + j * barSlot + barSlot * 0.18;
      var bw = Math.max(4, barSlot * 0.64);
      var by = top + plotH - bh;
      var active = j <= K;
      g.fillStyle = active ? (j === 0 ? '#4df3dd' : '#6ee7a0') : 'rgba(124,135,154,0.22)';
      g.fillRect(bx, by, bw, bh);
    }

    var ab = a * b;
    g.font = '10px "Cascadia Code", Consolas, monospace';
    g.fillStyle = '#d7dde6';
    g.fillText('Partials k=0..' + K + '  ·  decay a=' + a.toFixed(2) + '  ·  freq× b=' + b, left, 14);
    g.fillStyle = ab >= 1 ? '#ffb04d' : '#6ee7a0';
    g.fillText('Hardy condition a·b = ' + ab.toFixed(2) + (ab >= 1 ? ' ≥ 1 (FRACTAL!)' : ' < 1 (smooth)'), left, h - 6);
    g.fillStyle = 'rgba(124,135,154,0.8)';
    g.fillText('0dB', 4, top + 8);
    g.fillText('-90', 4, top + plotH);
  }

  // Right: Ramanujan 1/π (~208 dB/step) vs. Fourier Odd Harmonics (~6 dB/oct)
  function drawRamanujan(state) {
    var sz = size(ramCanvas, ramCtx);
    if (!sz) return;
    var w = sz[0], h = sz[1], g = ramCtx;

    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(9,12,17,0.65)';
    g.fillRect(0, 0, w, h);

    var series = Harmony.engine.ramanujanSeries(4);
    var rows = series.rows;
    var left = 44, right = 16, top = 24, bot = 22;
    var plotW = w - left - right, plotH = h - top - bot;

    function X(k) { return left + (k / 4) * plotW; }
    // Map 0 dB .. -340 dB vertically
    function Y(db) {
      var clamped = Math.max(-340, Math.min(10, db));
      var t = (10 - clamped) / 350;
      return top + t * plotH;
    }

    // Float32 mantissa noise floor line (-144.5 dB => 0x40490FDB lock!)
    var yF32 = Y(-144.5);
    g.strokeStyle = 'rgba(77,243,221,0.45)';
    g.setLineDash([4, 4]);
    g.beginPath(); g.moveTo(left, yF32); g.lineTo(w - right, yF32); g.stroke();
    g.setLineDash([]);

    g.font = '9.5px "Cascadia Code", Consolas, monospace';
    g.fillStyle = '#4df3dd';
    g.fillText('Float32 lock (−144.5 dB · ' + series.targetHex + ')', left + 4, yF32 - 4);

    // Fourier error curve (coral/amber — crawls slowly)
    g.strokeStyle = '#ff6b6b';
    g.lineWidth = 1.8;
    g.beginPath();
    for (var i = 0; i < rows.length; i++) {
      var xf = X(rows[i].k), yf = Y(rows[i].errFourDb);
      if (i === 0) g.moveTo(xf, yf); else g.lineTo(xf, yf);
    }
    g.stroke();

    // Ramanujan error curve (emerald/cyan — plunges -208 dB per harmonic!)
    g.strokeStyle = '#6ee7a0';
    g.lineWidth = 2.1;
    g.beginPath();
    for (var r = 0; r < rows.length; r++) {
      var xr = X(rows[r].k), yr = Y(rows[r].errRamDb);
      if (r === 0) g.moveTo(xr, yr); else g.lineTo(xr, yr);
    }
    g.stroke();

    var curK = Math.min(4, Math.max(0, Math.round(state.K != null ? state.K : 0)));
    for (var m = 0; m < rows.length; m++) {
      var xk = X(rows[m].k);
      g.fillStyle = '#ff6b6b';
      g.beginPath(); g.arc(xk, Y(rows[m].errFourDb), 2.8, 0, Math.PI * 2); g.fill();

      var isSel = (m === curK);
      g.fillStyle = isSel ? '#ffffff' : '#6ee7a0';
      g.beginPath(); g.arc(xk, Y(rows[m].errRamDb), isSel ? 4.0 : 3.0, 0, Math.PI * 2); g.fill();
    }

    var r0 = rows[0];
    g.fillStyle = '#d7dde6';
    g.font = '10px "Cascadia Code", Consolas, monospace';
    g.fillText('Ramanujan k=0 → ' + r0.ramHex + ' (EXACT Float32 π on 1st term!)', left, 13);

    g.fillStyle = 'rgba(124,135,154,0.85)';
    g.fillText('0dB', 6, Y(0) + 3);
    g.fillText('-150', 4, Y(-150) + 3);
    g.fillText('-320', 4, Y(-320) + 3);
    g.fillText('k=0 (fundamental)', left, h - 6);
    g.fillText('k=4 (−832 dB!)', w - right - 88, h - 6);
  }

  function update(state) {
    if (specCtx) drawSpectrum(state);
    if (ramCtx) drawRamanujan(state);
  }

  window.Harmony.Harmonics2D = { init: init, update: update };
})();
