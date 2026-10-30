/* ===== Harmony.Frobenius — Conjugate Eigenvalue Phasors & Point Counting =====
   Visualizes HARMONY_ENGINE.md §1–§3:
       λ  = √q · e^{iφ}      (main phasor, cyan)
       λ̄  = √q · e^{−iφ}     (conjugate syzygy twin, gold)
       S_k = λ^k + λ̄^k = 2·q^{k/2}·cos(kφ)   (exact integer on secp256k1!) */
(function () {
  'use strict';
  var TAU = Math.PI * 2;

  var phCanvas, phCtx, ctCanvas, ctCtx;

  function init(phasorEl, countEl) {
    phCanvas = phasorEl; phCtx = phasorEl ? phasorEl.getContext('2d') : null;
    ctCanvas = countEl;  ctCtx = countEl ? countEl.getContext('2d') : null;
  }

  function size(canvas, ctx) {
    if (!canvas || !ctx) return [0, 0];
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = canvas.clientWidth, h = canvas.clientHeight;
    if (w && h) {
      var pw = Math.round(w * dpr), ph = Math.round(h * dpr);
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw;
        canvas.height = ph;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    return [w, h];
  }

  function drawPhasor(state) {
    var s = size(phCanvas, phCtx);
    var w = s[0], h = s[1];
    if (!w || !h) return;
    var ctx = phCtx, cx = w / 2, cy = h / 2;
    var R = Math.min(w, h) / 2 * 0.76;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(9,12,17,0.65)';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(124,135,154,0.35)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(w, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, h); ctx.stroke();

    ctx.strokeStyle = 'rgba(54,214,200,0.28)'; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke(); ctx.setLineDash([]);

    var fa = Harmony.engine.frobAngles(state);
    var secp = fa.secp, phi = fa.phi, k = fa.k;
    var a = k * phi;
    var ca = Math.cos(a), sa = Math.sin(a);
    var mx = cx + R * ca, my = cy - R * sa;   // λ^k
    var sx = cx + R * ca, sy = cy + R * sa;   // λ̄^k (conjugate reflection)

    // Vertical chord connecting λ^k and λ̄^k across the Real axis
    ctx.strokeStyle = 'rgba(255,210,138,0.45)'; ctx.lineWidth = 1.1;
    ctx.setLineDash([2, 3]);
    ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(sx, sy); ctx.stroke();
    ctx.setLineDash([]);

    // Main phasor λ^k (cyan)
    ctx.strokeStyle = 'rgba(77,243,221,0.95)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(mx, my); ctx.stroke();
    ctx.fillStyle = '#4df3dd';
    ctx.beginPath(); ctx.arc(mx, my, 3.6, 0, TAU); ctx.fill();

    // Conjugate twin λ̄^k (gold — matches P̄ across all views!)
    ctx.strokeStyle = 'rgba(255,176,77,0.95)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(sx, sy); ctx.stroke();
    ctx.fillStyle = '#ffb04d';
    ctx.beginPath(); ctx.arc(sx, sy, 3.6, 0, TAU); ctx.fill();

    // Real-axis midpoint cos(kφ)
    var mxp = cx + R * ca;
    ctx.fillStyle = '#6ee7a0';
    ctx.beginPath(); ctx.arc(mxp, cy, 3.0, 0, TAU); ctx.fill();

    ctx.font = '10px "Cascadia Code", Consolas, monospace';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#4df3dd'; ctx.fillText('λᵏ', mx + 6, my);
    ctx.fillStyle = '#ffb04d'; ctx.fillText('λ̄ᵏ', sx + 6, sy);
    ctx.fillStyle = 'rgba(215,221,230,0.85)';
    ctx.fillText('Re = cos(kφ)', 8, 12);

    var ka = ((k * phi) * 180 / Math.PI) % 360;
    if (ka < 0) ka += 360;
    ctx.fillStyle = secp ? '#6ee7a0' : 'rgba(124,135,154,0.85)';
    ctx.fillText(secp ? ('secp256k1 · kφ=' + ka.toFixed(1) + '°') : ('generic · kφ=' + ka.toFixed(1) + '°'), 8, h - 10);
  }

  function drawCount(state) {
    var s = size(ctCanvas, ctCtx);
    var w = s[0], h = s[1];
    if (!w || !h) return;
    var ctx = ctCtx;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(9,12,17,0.65)';
    ctx.fillRect(0, 0, w, h);

    var left = 30, right = 12, top = 16, bot = 16;
    var fa = Harmony.engine.frobAngles(state);
    var phi = fa.phi, k = fa.k;
    var K = Math.max(16, k + 6);
    var ymin = -2.35, ymax = 2.35;

    function X(kv) { return left + (kv - 1) / (K - 1) * (w - left - right); }
    function Y(v) { var t = (v - ymin) / (ymax - ymin); return top + (1 - t) * (h - top - bot); }

    ctx.strokeStyle = 'rgba(124,135,154,0.38)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(left, Y(0)); ctx.lineTo(w - right, Y(0)); ctx.stroke();

    ctx.strokeStyle = 'rgba(54,214,200,0.22)'; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(left, Y(2)); ctx.lineTo(w - right, Y(2)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(left, Y(-2)); ctx.lineTo(w - right, Y(-2)); ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = 'rgba(77,243,221,0.92)'; ctx.lineWidth = 1.9; ctx.beginPath();
    for (var kv = 1; kv <= K; kv++) {
      var v = 2 * Math.cos(kv * phi), x = X(kv), y = Y(v);
      if (kv === 1) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    for (var m = 1; m <= K; m++) {
      var vv = 2 * Math.cos(m * phi), xx = X(m), yy = Y(vv);
      ctx.fillStyle = (m === k) ? '#ffffff' : '#6ee7a0';
      ctx.beginPath(); ctx.arc(xx, yy, (m === k) ? 3.8 : 2.0, 0, TAU); ctx.fill();
    }

    ctx.font = '10px "Cascadia Code", Consolas, monospace';
    ctx.fillStyle = 'rgba(215,221,230,0.9)';
    ctx.fillText('Normalized Hasse trace 2·cos(kφ) ∈ [−2, +2]', left, 11);
    ctx.fillStyle = 'rgba(124,135,154,0.85)';
    ctx.fillText('+2', 5, Y(2) + 3); ctx.fillText('−2', 5, Y(-2) + 3);
    ctx.fillText('k=1', left, h - 4);
    ctx.fillText('k=' + K, w - right - 28, h - 4);
  }

  function update(state) {
    if (!phCtx) return;
    drawPhasor(state);
    drawCount(state);
  }

  window.Harmony.Frobenius = { init: init, update: update };
})();
