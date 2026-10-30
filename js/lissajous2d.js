/* ===== Harmony.Lissajous2D — 2D Slice & Quadrature Scope (x(t) × y(t)) =====
   Renders the XY projection with Outer Sphere R, Inner Cavity rIn, offscreen
   static curve caching, fading phosphor trail, and both Harmony Engine twins:
   - Antipodal (−P) in magenta
   - Conjugate (P̄ = (x, −y)) in gold + vertical chord & real-axis midpoint */
(function () {
  'use strict';

  var canvas, ctx, frameCanvas, frameCtx;
  var trail = [];
  var lastSig = '';
  var lastPlayT = -1;

  function init(el) {
    canvas = el;
    ctx = el.getContext('2d');
  }

  function clearTrail() { trail = []; }

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

  function pxScale(state, w, h) {
    var m = Math.max(state.maxAbs || 1, state.r, 0.2);
    return (Math.min(w, h) / 2) * 0.85 / m;
  }

  function drawStatic(state, points, w, h, dpr) {
    if (!frameCanvas) {
      frameCanvas = document.createElement('canvas');
      frameCtx = frameCanvas.getContext('2d');
    }
    frameCanvas.width = Math.round(w * dpr);
    frameCanvas.height = Math.round(h * dpr);
    frameCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var cx = w / 2, cy = h / 2;
    var scale = pxScale(state, w, h);

    frameCtx.clearRect(0, 0, w, h);
    frameCtx.fillStyle = 'rgba(9,12,17,0.65)';
    frameCtx.fillRect(0, 0, w, h);

    // Subtle Cartesian grid at R/2 intervals
    var step = (state.r / 2) * scale;
    if (step > 8) {
      frameCtx.strokeStyle = 'rgba(54,214,200,0.08)';
      frameCtx.lineWidth = 1;
      for (var gx = step; gx < w / 2; gx += step) {
        frameCtx.beginPath();
        frameCtx.moveTo(cx + gx, 0); frameCtx.lineTo(cx + gx, h);
        frameCtx.moveTo(cx - gx, 0); frameCtx.lineTo(cx - gx, h);
        frameCtx.stroke();
      }
      for (var gy = step; gy < h / 2; gy += step) {
        frameCtx.beginPath();
        frameCtx.moveTo(0, cy + gy); frameCtx.lineTo(w, cy + gy);
        frameCtx.moveTo(0, cy - gy); frameCtx.lineTo(w, cy - gy);
        frameCtx.stroke();
      }
    }

    // Principal x & f(x) axes
    frameCtx.strokeStyle = 'rgba(124,135,154,0.38)';
    frameCtx.lineWidth = 1;
    frameCtx.beginPath();
    frameCtx.moveTo(0, cy); frameCtx.lineTo(w, cy);
    frameCtx.moveTo(cx, 0); frameCtx.lineTo(cx, h);
    frameCtx.stroke();

    // Outer Sphere R circle
    frameCtx.strokeStyle = 'rgba(54,214,200,0.34)';
    frameCtx.setLineDash([4, 4]);
    frameCtx.beginPath();
    frameCtx.arc(cx, cy, state.r * scale, 0, Math.PI * 2);
    frameCtx.stroke();

    // Inner Cavity rIn circle
    var rIn = Math.min(state.rIn != null ? state.rIn : 0, state.r);
    if (rIn > 0.02) {
      frameCtx.strokeStyle = 'rgba(255,107,122,0.34)';
      frameCtx.beginPath();
      frameCtx.arc(cx, cy, rIn * scale, 0, Math.PI * 2);
      frameCtx.stroke();
    }
    frameCtx.setLineDash([]);

    var mode = state.twinMode || 'both';
    var showAnti = (mode === 'antipodal' || mode === 'both');
    var showConj = (mode === 'conjugate' || mode === 'both');

    // VST A/B/C Reference Ghost Trajectory
    if (state.toggles && state.toggles.ghostRef && state.ghostPoints && state.ghostPoints.length > 1) {
      var gp = state.ghostPoints;
      frameCtx.strokeStyle = 'rgba(157,140,255,0.44)';
      frameCtx.lineWidth = 1.25;
      frameCtx.setLineDash([3, 3]);
      frameCtx.beginPath();
      var stG = false;
      for (var ig = 0; ig < gp.length; ig++) {
        var pg = gp[ig];
        if (pg.valid) {
          var gx2 = cx + pg.x * scale, gy2 = cy - pg.y * scale;
          if (stG) frameCtx.lineTo(gx2, gy2); else { frameCtx.moveTo(gx2, gy2); stG = true; }
        } else stG = false;
      }
      frameCtx.stroke();
      frameCtx.setLineDash([]);
      if (state.ghostSlot) {
        frameCtx.font = '10px "Cascadia Code", Consolas, monospace';
        frameCtx.fillStyle = 'rgba(187,175,255,0.75)';
        frameCtx.fillText('ghost: Slot ' + state.ghostSlot, 8, 13);
      }
    }

    if (points && points.length) {
      // Antipodal twin (−x, −y)
      if (showAnti) {
        frameCtx.strokeStyle = 'rgba(255,92,168,0.48)';
        frameCtx.lineWidth = 1.2;
        frameCtx.beginPath();
        var stA = false;
        for (var ia = 0; ia < points.length; ia++) {
          var pa = points[ia];
          if (pa.valid) {
            var ax = cx - pa.x * scale, ay = cy + pa.y * scale;
            if (stA) frameCtx.lineTo(ax, ay); else { frameCtx.moveTo(ax, ay); stA = true; }
          } else stA = false;
        }
        frameCtx.stroke();
      }

      // Conjugate twin (x, −y)
      if (showConj) {
        frameCtx.strokeStyle = 'rgba(255,176,77,0.52)';
        frameCtx.lineWidth = 1.2;
        frameCtx.beginPath();
        var stC = false;
        for (var ic = 0; ic < points.length; ic++) {
          var pc = points[ic];
          if (pc.valid) {
            var ccx = cx + pc.x * scale, ccy = cy + pc.y * scale;
            if (stC) frameCtx.lineTo(ccx, ccy); else { frameCtx.moveTo(ccx, ccy); stC = true; }
          } else stC = false;
        }
        frameCtx.stroke();
      }

      // Main curve (softened when Order N Strobe is active)
      var strobeOn = !!(state.toggles && state.toggles.strobeN);
      frameCtx.strokeStyle = strobeOn ? 'rgba(225,233,242,0.34)' : 'rgba(225,233,242,0.9)';
      frameCtx.lineWidth = 1.55;
      frameCtx.beginPath();
      var started = false;
      for (var i = 0; i < points.length; i++) {
        var p = points[i];
        if (p.valid) {
          var x = cx + p.x * scale, y = cy - p.y * scale;
          if (started) frameCtx.lineTo(x, y); else { frameCtx.moveTo(x, y); started = true; }
        } else {
          started = false;
        }
      }
      frameCtx.stroke();

      // Discrete Order N Cyclic Group Strobe (nodes + generator hop chords)
      if (strobeOn) {
        var dg = Harmony.engine.discreteGroup(state, points);
        frameCtx.strokeStyle = 'rgba(77,243,221,0.52)';
        frameCtx.lineWidth = 1.15;
        frameCtx.beginPath();
        for (var s = 0; s < dg.orbit.length - 1; s++) {
          var nA = dg.nodes[dg.orbit[s]], nB = dg.nodes[dg.orbit[s + 1]];
          if (nA && nB && nA.valid && nB.valid) {
            frameCtx.moveTo(cx + nA.x * scale, cy - nA.y * scale);
            frameCtx.lineTo(cx + nB.x * scale, cy - nB.y * scale);
          }
        }
        frameCtx.stroke();

        for (var j = 0; j < dg.nodes.length; j++) {
          var nd = dg.nodes[j];
          if (!nd.valid) continue;
          frameCtx.fillStyle = (j === 0) ? '#6ee7a0' : (nd.inSubgroup ? '#ffd166' : 'rgba(124,135,154,0.45)');
          frameCtx.beginPath();
          frameCtx.arc(cx + nd.x * scale, cy - nd.y * scale, (j === 0) ? 3.2 : 2.3, 0, Math.PI * 2);
          frameCtx.fill();
        }
      }
    }
  }

  function update(state, playT, points, dirty) {
    if (!ctx) return;
    var sz = ensureSize();
    if (!sz) return;
    var w = sz[0], h = sz[1], dpr = sz[2];

    var sig = [dirty, w, h, dpr, state.twinMode, !!state.toggles.strobeN, !!state.toggles.ghostRef, state.ghostRev || 0, state.orderN, (state.rIn || 0).toFixed(3)].join('|');
    if (sig !== lastSig) {
      trail = [];
      lastSig = sig;
      drawStatic(state, points, w, h, dpr);
    }

    var cx = w / 2, cy = h / 2;
    var scale = pxScale(state, w, h);

    ctx.clearRect(0, 0, w, h);
    if (frameCanvas) ctx.drawImage(frameCanvas, 0, 0, w, h);

    // Fading trail
    if (state.toggles.trace && trail.length > 1) {
      for (var i = 1; i < trail.length; i++) {
        var a = trail[i - 1], b = trail[i];
        var alpha = (i / trail.length) * 0.55;
        ctx.strokeStyle = 'rgba(54,214,200,' + alpha.toFixed(3) + ')';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(cx + a[0] * scale, cy - a[1] * scale);
        ctx.lineTo(cx + b[0] * scale, cy - b[1] * scale);
        ctx.stroke();
      }
    }

    var ph = Harmony.engine.playhead(state, points, playT);
    var pp = ph.point;
    window.__lissCross = pp ? { x: pp.x, y: pp.y, z: pp.z } : null;

    var mode = state.twinMode || 'both';
    var showAnti = (mode === 'antipodal' || mode === 'both');
    var showConj = (mode === 'conjugate' || mode === 'both');

    if (pp && pp.valid) {
      var px = cx + pp.x * scale, py = cy - pp.y * scale;

      if (state.toggles.radiusVec) {
        ctx.strokeStyle = 'rgba(255,194,68,0.88)';
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(px, py); ctx.stroke();
      }

      // Conjugate twin & vertical real-axis chord
      if (showConj && ph.conjugate) {
        var jx = cx + ph.conjugate.x * scale, jy = cy - ph.conjugate.y * scale;
        ctx.strokeStyle = 'rgba(255,210,138,0.45)';
        ctx.setLineDash([2, 3]);
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(jx, jy); ctx.stroke();
        ctx.setLineDash([]);

        // Midpoint (P + P̄)/2 on real X-axis
        ctx.fillStyle = '#6ee7a0';
        ctx.beginPath(); ctx.arc(px, cy, 2.5, 0, Math.PI * 2); ctx.fill();

        ctx.fillStyle = '#ffb04d';
        ctx.beginPath(); ctx.arc(jx, jy, 3.0, 0, Math.PI * 2); ctx.fill();
      }

      // Antipodal twin
      if (showAnti && ph.antipodal) {
        var tx = cx + ph.antipodal.x * scale, ty = cy - ph.antipodal.y * scale;
        ctx.fillStyle = '#ff5ca8';
        ctx.beginPath(); ctx.arc(tx, ty, 3.0, 0, Math.PI * 2); ctx.fill();
      }

      // Main playhead
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#36d6c8';
      ctx.shadowBlur = 9;
      ctx.beginPath(); ctx.arc(px, py, 3.3, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    }

    if (state.toggles.trace && state.toggles.animate && pp && pp.valid) {
      if (playT !== lastPlayT) {
        trail.push([pp.x, pp.y]);
        if (trail.length > 360) trail.shift();
        lastPlayT = playT;
      }
    }
  }

  window.Harmony.Lissajous2D = { init: init, update: update, clearTrail: clearTrail };
})();
