/* ===== Harmony.ChimeRack — Multi-Chime Front f(x) Rack & Visual "All Chimes" Card Menu =====
   Zero-build classic script (browser + Node dual-export).
   Renders multiple live Ramanujan Chime spheres simultaneously using pure orthographic 2D Canvas
   Front f(x) projection from the single shared Harmony.engine (0 extra WebGL contexts, silky 60fps
   up to 8+ live Chimes, works identically over file:// and http://):
     - 'stage' : Existing single-sphere full 3D WebGL view (default on mount; zero change)
     - 'rack'  : Side-by-side multi-Chime Rack in Front f(x) view + right-hand "+ ADD CHIME" rail
     - 'menu'  : Visual "All Chimes" gallery browser (Active Chimes + Presets + "+ ADD CHIME" card)
   Clicking any card focuses it (binding Left Rack & Bottom Dock live); double-clicking or clicking
   "Stage" maximizes that Chime straight into the full 3D WebGL Stage. */
(function (root) {
  'use strict';

  var Harmony = root.Harmony = root.Harmony || {};
  var MAX_CHIMES = 8;
  var ALL_KEYS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  var TWIN_CYCLE = ['off', 'antipodal', 'conjugate', 'both'];
  var TWIN_SHORT = { off: 'Off', antipodal: '\u2212P', conjugate: 'P\u0304', both: 'Both' };

  var hooks = null;
  var currentView = 'stage'; // 'stage' | 'rack' | 'menu'
  var menuFilter = 'all';    // 'all' | 'active' | 'presets'
  var curveCache = Object.create(null);
  var curveCacheCount = 0;
  var lastRackSig = '';
  var lastMenuSig = '';

  function getEngine() {
    return Harmony.engine || null;
  }
  function getPresets() {
    return (Harmony.Presets && Harmony.Presets.list) ? Harmony.Presets.list : [];
  }
  function getAgentCore() {
    return Harmony.AgentCore || null;
  }

  function shortPresetName(idx) {
    var list = getPresets();
    var p = list[Number(idx)];
    if (!p || !p.name) return 'Custom Patch';
    var dash = p.name.indexOf(' — ');
    return dash > 0 ? p.name.slice(0, dash) : p.name;
  }

  function snapshotCacheKey(st) {
    return [
      st.formulas.x, st.formulas.y, st.formulas.z,
      Number(st.r).toFixed(3), Number(st.rIn).toFixed(3), Number(st.amp).toFixed(3),
      Number(st.f).toFixed(3), Math.round(st.K || 0), Math.round(st.orderN || 16),
      Number(st.a).toFixed(3), Math.round(st.b || 3), Math.round(st.n || 3),
      Math.round(st.m || 2), Math.round(st.k || 1), Number(st.phaseRad || 0).toFixed(4)
    ].join('|');
  }

  function buildEvalStateFromSnap(snap) {
    if (!snap || typeof snap !== 'object') return null;
    var pr = (snap.p != null && getPresets()[snap.p]) ? getPresets()[snap.p] : null;
    var pf = (pr && pr.formulas) ? pr.formulas : null;
    var pp = (pr && pr.params) ? pr.params : {};
    var fx = snap.fx != null ? snap.fx : (pf ? pf.x : 'r*cos(TAU*f*t+phase)');
    var fy = snap.fy != null ? snap.fy : (pf ? pf.y : 'r*sin(TAU*f*t+phase)');
    var fz = snap.fz != null ? snap.fz : (pf ? pf.z : '0');
    return {
      r: snap.r != null ? snap.r : (pp.r != null ? pp.r : 1),
      rIn: snap.rIn != null ? snap.rIn : (pp.rIn != null ? pp.rIn : 0.45),
      amp: snap.amp != null ? snap.amp : (pp.amp != null ? pp.amp : 1),
      f: snap.f != null ? snap.f : (pp.f != null ? pp.f : 1),
      K: snap.K != null ? snap.K : (pp.K != null ? pp.K : 6),
      orderN: snap.orderN != null ? snap.orderN : (pp.orderN != null ? pp.orderN : 19),
      a: snap.a != null ? snap.a : (pp.a != null ? pp.a : 0.5),
      b: snap.b != null ? snap.b : (pp.b != null ? pp.b : 3),
      n: snap.n != null ? snap.n : (pp.n != null ? pp.n : 3),
      m: snap.m != null ? snap.m : (pp.m != null ? pp.m : 2),
      k: snap.k != null ? snap.k : (pp.k != null ? pp.k : 1),
      phaseRad: ((snap.ph != null ? snap.ph : (pp.phaseDeg || 0)) * Math.PI) / 180,
      twinMode: snap.tw || 'both',
      formulas: { x: fx, y: fy, z: fz },
      toggles: {
        cutaway: !!snap.cut,
        sliceGrid: snap.sg !== false,
        strobeN: !!snap.str,
        fourBitOrbit: !!snap.fb,
        syzygy: (snap.tw || 'both') !== 'off'
      }
    };
  }

  function getCachedPoints(st, sampleCount) {
    var Engine = getEngine();
    if (!Engine || typeof Engine.sample !== 'function') return [];
    var key = sampleCount + '|' + snapshotCacheKey(st);
    if (curveCache[key]) return curveCache[key];
    if (curveCacheCount > 120) {
      curveCache = Object.create(null);
      curveCacheCount = 0;
    }
    var res = Engine.sample(st, sampleCount);
    var pts = (res && res.points) ? res.points : [];
    curveCache[key] = pts;
    curveCacheCount++;
    return pts;
  }

  // ---- Pure Orthographic Front f(x) 2D Sphere Renderer (0 extra WebGL contexts!) ----
  function drawFrontSphere(canvas, st, points, playT, opts) {
    if (!canvas) return;
    opts = opts || {};
    var w = canvas.clientWidth;
    var h = canvas.clientHeight;
    if (!w || !h) return;
    var dpr = Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 2);
    var bw = Math.round(w * dpr);
    var bh = Math.round(h * dpr);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var Engine = getEngine();
    var harmor = !!opts.harmor;
    var compact = !!opts.compact;

    ctx.fillStyle = harmor ? '#000000' : '#060a10';
    ctx.fillRect(0, 0, w, h);

    var cx = w * 0.5;
    var cy = h * 0.5;
    var pad = compact ? 10 : 20;
    var radPx = Math.max(18, Math.min(w, h) * 0.5 - pad);
    var R = Math.max(0.2, st.r || 1);
    var rIn = Math.max(0, Math.min(R, st.rIn != null ? st.rIn : 0));
    var eta = rIn / R;
    var scale = radPx / R;

    // Subtle radial atmospheric glow behind the sphere
    var bgGrad = ctx.createRadialGradient(cx, cy, radPx * 0.12, cx, cy, radPx * 1.18);
    if (harmor) {
      bgGrad.addColorStop(0, 'rgba(74, 242, 138, 0.08)');
      bgGrad.addColorStop(0.75, 'rgba(74, 242, 138, 0.025)');
      bgGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    } else {
      bgGrad.addColorStop(0, 'rgba(54, 214, 200, 0.085)');
      bgGrad.addColorStop(0.75, 'rgba(20, 62, 84, 0.04)');
      bgGrad.addColorStop(1, 'rgba(6, 10, 16, 0)');
    }
    ctx.fillStyle = bgGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, radPx * 1.18, 0, Math.PI * 2);
    ctx.fill();

    // 1. Clipped interior 2D f(x) Cartesian Grid + Wireframe Concentric Meridians
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radPx, 0, Math.PI * 2);
    ctx.clip();

    // Subtle Cartesian grid on the 2D f(x) slice
    var gridDiv = compact ? 4 : 6;
    ctx.strokeStyle = harmor ? 'rgba(74, 242, 138, 0.09)' : 'rgba(54, 214, 200, 0.09)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var gi = -gridDiv; gi <= gridDiv; gi++) {
      var off = (gi / gridDiv) * radPx;
      ctx.moveTo(cx + off, cy - radPx); ctx.lineTo(cx + off, cy + radPx);
      ctx.moveTo(cx - radPx, cy + off); ctx.lineTo(cx + radPx, cy + off);
    }
    ctx.stroke();

    // Faint latitude/longitude wireframe shells (gives crisp Front spherical depth!)
    ctx.strokeStyle = harmor ? 'rgba(74, 242, 138, 0.09)' : 'rgba(110, 175, 220, 0.11)';
    var rings = compact ? [0.5, 0.78] : [0.35, 0.62, 0.84];
    for (var ri = 0; ri < rings.length; ri++) {
      ctx.beginPath();
      ctx.arc(cx, cy, radPx * rings[ri], 0, Math.PI * 2);
      ctx.stroke();
    }

    // Inner Cavity r (OSC B) translucent core + border
    if (rIn > 0.01) {
      var rInPx = rIn * scale;
      ctx.fillStyle = harmor ? 'rgba(74, 242, 138, 0.12)' : 'rgba(255, 107, 122, 0.11)';
      ctx.beginPath();
      ctx.arc(cx, cy, rInPx, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = harmor ? 'rgba(74, 242, 138, 0.65)' : 'rgba(255, 107, 122, 0.62)';
      ctx.lineWidth = compact ? 1 : 1.3;
      ctx.beginPath();
      ctx.arc(cx, cy, rInPx, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Optional live Floor WT / MiniMeters profile silhouette across the equator
    var ff = opts.floorField;
    if (ff && ff.activeSlice && ff.activeSlice.length >= 8 && st.toggles && st.toggles.floorWt) {
      var sliceArr = ff.activeSlice;
      var sLen = sliceArr.length;
      var isSpec = ff.mode === 'spectrogram';
      ctx.save();
      ctx.beginPath();
      for (var si = 0; si < sLen; si++) {
        var su = (si / (sLen - 1)) * 2 - 1;
        var sx = cx + su * radPx * (ff.size || 0.94);
        var sv = sliceArr[si] || 0;
        var sy = isSpec
          ? (cy - sv * radPx * 0.65)
          : (cy - sv * radPx * 0.42);
        if (si === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
      }
      ctx.lineTo(cx + radPx * (ff.size || 0.94), cy);
      ctx.lineTo(cx - radPx * (ff.size || 0.94), cy);
      ctx.closePath();
      ctx.fillStyle = harmor
        ? 'rgba(74, 242, 138, 0.22)'
        : (isSpec ? 'rgba(130, 120, 255, 0.26)' : 'rgba(84, 156, 255, 0.24)');
      ctx.fill();
      ctx.strokeStyle = harmor ? '#7affad' : (isSpec ? '#7dd3fc' : '#93c5fd');
      ctx.lineWidth = 1.3;
      ctx.stroke();
      ctx.restore();
    }

    // Optional per-Chime Bitcoin Lifecycle BitWave waveform OR Harmor Synthetic LCD band
    var sm = opts.stageMeta;
    if (sm) {
      var lcdMod = Harmony.SynthLCD;
      var bwMod = Harmony.BitWaveFeed;
      if (sm.isLcd && lcdMod && typeof lcdMod.drawSwooshLcd === 'function') {
        var bandW = radPx * 1.82;
        var bandH = radPx * (compact ? 0.50 : 0.44);
        var bx = cx - bandW * 0.5;
        var by = cy - bandH * 0.5;
        var lcdData = lcdMod.resolveLcdData(st, playT, {
          text: sm.text,
          hex: sm.hex,
          encoding: sm.encoding || 'base58',
          noCache: true,
          maxChars: compact ? 18 : 34
        });
        var sNib = sm.nibbles || null;
        ctx.save();
        ctx.fillStyle = sm.harmorBinary !== false ? '#000000' : 'rgba(4, 9, 15, 0.90)';
        ctx.fillRect(bx - 3, by - 3, bandW + 6, bandH + 6);
        ctx.strokeStyle = sm.harmorBinary !== false ? 'rgba(56, 255, 114, 0.55)' : 'rgba(77, 243, 221, 0.50)';
        ctx.lineWidth = 1;
        ctx.strokeRect(bx - 3, by - 3, bandW + 6, bandH + 6);
        lcdMod.drawSwooshLcd(
          ctx,
          { x: bx, y: by, w: bandW, h: bandH },
          lcdData,
          playT,
          {
            coalesce: sm.coalesce != null ? sm.coalesce : 0.35,
            harmorBinary: sm.harmorBinary !== false,
            nibbles: sNib,
            compact: true,
            fillBg: true
          }
        );
        if (!compact && sm.text) {
          ctx.font = '600 9px "Cascadia Code", Consolas, monospace';
          ctx.fillStyle = sm.harmorBinary !== false ? '#b8ffd0' : '#dce8f5';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          var shortAddr = sm.text.length > 26 ? (sm.text.slice(0, 12) + '…' + sm.text.slice(-10)) : sm.text;
          ctx.fillText(shortAddr, cx, by + bandH + 8);
        }
        ctx.restore();
      } else if (sm.nibbles && sm.nibbles.length >= 2 && bwMod && typeof bwMod.sampleMonotone === 'function') {
        var bwSpan = radPx * 1.78;
        var bwLeft = cx - bwSpan * 0.5;
        var bwAmp = radPx * 0.42;
        var bwCols = compact ? 64 : 140;
        var stCol = harmor ? '#4af28a' : (sm.color || '#4af28a');
        ctx.save();
        ctx.beginPath();
        for (var bi = 0; bi <= bwCols; bi++) {
          var bu = bi / bwCols;
          var bv = bwMod.sampleMonotone(sm.nibbles, (bu + (playT || 0) * 0.25) % 1);
          var pxb = bwLeft + bu * bwSpan;
          var pyb = cy - bv * bwAmp;
          if (bi === 0) ctx.moveTo(pxb, pyb); else ctx.lineTo(pxb, pyb);
        }
        ctx.strokeStyle = stCol;
        ctx.lineWidth = compact ? 1.5 : 2.1;
        ctx.stroke();

        // Fill subtle translucent energy under the BitWave register trace
        ctx.lineTo(bwLeft + bwSpan, cy);
        ctx.lineTo(bwLeft, cy);
        ctx.closePath();
        ctx.globalAlpha = 0.16;
        ctx.fillStyle = stCol;
        ctx.fill();
        ctx.globalAlpha = 1;

        if (!compact && sm.hex) {
          ctx.font = '600 9px "Cascadia Code", Consolas, monospace';
          ctx.fillStyle = stCol;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          var hxPrev = sm.hex.length > 22 ? (sm.hex.slice(0, 10) + '…' + sm.hex.slice(-8)) : sm.hex;
          ctx.fillText('0x' + hxPrev, cx, cy + radPx * 0.46);
        }
        ctx.restore();
      }
    }

    ctx.restore();

    // Principal axes X (equator) and Y (f(x) meridian)
    ctx.strokeStyle = harmor ? 'rgba(74, 242, 138, 0.25)' : 'rgba(54, 214, 200, 0.24)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - radPx - 6, cy); ctx.lineTo(cx + radPx + 6, cy);
    ctx.moveTo(cx, cy - radPx - 6); ctx.lineTo(cx, cy + radPx + 6);
    ctx.stroke();

    // Outer Sphere Circle R (OSC A)
    ctx.strokeStyle = harmor ? '#4af28a' : '#36d6c8';
    ctx.lineWidth = compact ? 1.3 : 1.75;
    ctx.beginPath();
    ctx.arc(cx, cy, radPx, 0, Math.PI * 2);
    ctx.stroke();

    // 2. Full Quadrature Curve Trace (x(t), y(t))
    var nPts = points ? points.length : 0;
    if (nPts > 1) {
      ctx.save();
      ctx.strokeStyle = harmor ? 'rgba(122, 255, 173, 0.72)' : 'rgba(108, 224, 215, 0.78)';
      ctx.lineWidth = compact ? 1.25 : 1.65;
      ctx.beginPath();
      var penDown = false;
      var stride = nPts > 800 ? Math.floor(nPts / 600) : 1;
      for (var i = 0; i < nPts; i += stride) {
        var pt = points[i];
        if (!pt || !pt.valid || !isFinite(pt.x) || !isFinite(pt.y)) { penDown = false; continue; }
        var px = cx + pt.x * scale;
        var py = cy - pt.y * scale;
        if (Math.abs(px - cx) > radPx * 1.9 || Math.abs(py - cy) > radPx * 1.9) { penDown = false; continue; }
        if (!penDown) { ctx.moveTo(px, py); penDown = true; }
        else ctx.lineTo(px, py);
      }
      ctx.stroke();

      // Conjugate / Antipodal ghost trace if twinMode is active (subtle)
      var tMode = st.twinMode || 'both';
      if (tMode !== 'off' && !compact) {
        ctx.strokeStyle = tMode === 'conjugate' ? 'rgba(255, 184, 77, 0.34)' : 'rgba(255, 92, 168, 0.28)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        penDown = false;
        for (var j = 0; j < nPts; j += stride * 2) {
          var pt2 = points[j];
          if (!pt2 || !pt2.valid) { penDown = false; continue; }
          var tx = tMode === 'conjugate' ? pt2.x : -pt2.x;
          var ty = -pt2.y;
          var qx = cx + tx * scale;
          var qy = cy - ty * scale;
          if (Math.abs(qx - cx) > radPx * 1.9 || Math.abs(qy - cy) > radPx * 1.9) { penDown = false; continue; }
          if (!penDown) { ctx.moveTo(qx, qy); penDown = true; }
          else ctx.lineTo(qx, qy);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Discrete Order-N strobe nodes if enabled
      if (st.toggles && st.toggles.strobeN) {
        var ordN = Math.max(5, Math.min(64, Math.round(st.orderN || 16)));
        ctx.fillStyle = '#ffb84d';
        for (var k = 0; k < ordN; k++) {
          var sIdx = Math.min(nPts - 1, Math.round((k / ordN) * (nPts - 1)));
          var sp = points[sIdx];
          if (!sp || !sp.valid) continue;
          ctx.beginPath();
          ctx.arc(cx + sp.x * scale, cy - sp.y * scale, compact ? 1.6 : 2.3, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 3. Live Playhead P, Radius Vector & Spatial Twins (-P Null, P_conj)
      if (Engine && typeof Engine.playhead === 'function') {
        var ph = Engine.playhead(st, points, playT || 0);
        if (ph && ph.point && ph.point.valid) {
          var hx = cx + ph.point.x * scale;
          var hy = cy - ph.point.y * scale;

          // Radius vector from origin
          ctx.strokeStyle = harmor ? 'rgba(122, 255, 173, 0.5)' : 'rgba(255, 255, 255, 0.42)';
          ctx.lineWidth = 1.1;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(hx, hy);
          ctx.stroke();

          // Antipodal -P Null dot (magenta)
          if (ph.antipodal && (tMode === 'antipodal' || tMode === 'both')) {
            var ax = cx + ph.antipodal.x * scale;
            var ay = cy - ph.antipodal.y * scale;
            ctx.fillStyle = '#ff5ca8';
            ctx.beginPath();
            ctx.arc(ax, ay, compact ? 2.5 : 3.8, 0, Math.PI * 2);
            ctx.fill();
          }

          // Conjugate P_bar dot (amber)
          if (ph.conjugate && (tMode === 'conjugate' || tMode === 'both')) {
            var bx = cx + ph.conjugate.x * scale;
            var by = cy - ph.conjugate.y * scale;
            ctx.fillStyle = '#ffb84d';
            ctx.beginPath();
            ctx.arc(bx, by, compact ? 2.5 : 3.8, 0, Math.PI * 2);
            ctx.fill();
          }

          // Primary P glowing dot
          ctx.fillStyle = harmor ? 'rgba(74, 242, 138, 0.28)' : 'rgba(54, 214, 200, 0.28)';
          ctx.beginPath();
          ctx.arc(hx, hy, compact ? 5.5 : 8, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(hx, hy, compact ? 2.8 : 4.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }

    // 4. Clean Front f(x) labels & 4-bit pole markers (non-compact Rack view)
    if (!compact) {
      ctx.font = '600 10px "Cascadia Code", Consolas, monospace';
      ctx.fillStyle = harmor ? '#6ee7a0' : '#4df3dd';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText('f(x)', cx, cy - radPx - 3);

      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(130, 160, 178, 0.72)';
      ctx.fillText('+R', cx + radPx + 4, cy);

      if (st.toggles && st.toggles.fourBitOrbit) {
        ctx.font = '600 9px "Cascadia Code", Consolas, monospace';
        ctx.fillStyle = '#ffb84d';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.fillText('1111/F', cx - 6, cy - radPx + 4);
        ctx.fillStyle = '#36d6c8';
        ctx.textAlign = 'left';
        ctx.fillText('1000', cx - radPx + 5, cy - 12);
        ctx.fillStyle = '#ffb84d';
        ctx.textAlign = 'right';
        ctx.fillText('0001', cx + radPx - 5, cy - 12);
      }

      // Corner η ratio pill
      ctx.font = '600 9.5px "Cascadia Code", Consolas, monospace';
      ctx.fillStyle = 'rgba(160, 182, 200, 0.78)';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('\u03B7=' + eta.toFixed(2) + ' \u00B7 R=' + R.toFixed(2), 8, 7);
    }
  }

  // ---- View State & DOM Builders ----
  function setView(nextView) {
    if (nextView !== 'stage' && nextView !== 'rack' && nextView !== 'menu') nextView = 'stage';
    currentView = nextView;
    if (typeof document !== 'undefined') {
      if (document.body) document.body.setAttribute('data-stage-view', currentView);
      var rackEl = document.getElementById('chimeRackOverlay');
      var menuEl = document.getElementById('chimeMenuOverlay');
      if (rackEl) rackEl.hidden = currentView !== 'rack';
      if (menuEl) menuEl.hidden = currentView !== 'menu';
      document.querySelectorAll('.stage-view-btn[data-sview]').forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-sview') === currentView);
      });
      if (currentView === 'rack') rebuildRackDOM(true);
      if (currentView === 'menu') rebuildMenuDOM(true);
      if (currentView === 'stage' && Harmony.Scene3D && Harmony.Scene3D.resize) {
        requestAnimationFrame(function () { Harmony.Scene3D.resize(); });
      }
    }
  }

  function getView() {
    return currentView;
  }

  function rebuildRackDOM(force) {
    if (typeof document === 'undefined' || !hooks) return;
    var grid = document.getElementById('chimeRackCards');
    if (!grid) return;

    var order = hooks.getSlotOrder();
    var activeSlot = hooks.getActiveSlot();
    var slots = hooks.getSlots();
    var stages = (hooks.getSlotStages ? hooks.getSlotStages() : null) || {};
    var sig = order.join(',') + '|' + activeSlot + '|' + order.map(function (k) {
      var s = slots[k];
      var sm = stages[k];
      return (s ? (s.p + ':' + (s.tw || 'both')) : '') + (sm ? ('@' + sm.stageId + ':' + (sm.hex || '').slice(0, 8)) : '');
    }).join(';');
    if (!force && sig === lastRackSig) return;
    lastRackSig = sig;

    grid.innerHTML = '';
    for (var i = 0; i < order.length; i++) {
      (function (slotKey) {
        var snap = slots[slotKey];
        if (!snap) return;
        var isAct = slotKey === activeSlot;
        var sm = stages[slotKey] || null;
        var card = document.createElement('div');
        card.className = 'chime-card' + (isAct ? ' active' : '');
        card.setAttribute('data-chime-slot', slotKey);

        var title = sm ? sm.name : shortPresetName(snap.p);
        var phDeg = Math.round(snap.ph || 0);
        var rInVal = snap.rIn != null ? snap.rIn : 0.45;
        var twMode = snap.tw || 'both';
        var canDel = slotKey !== 'A' && slotKey !== 'B' && slotKey !== 'C';
        var stagePill = sm ? ('<span class="chime-card-stage-pill mono">' + sm.short + '</span>') : '';

        card.innerHTML =
          '<div class="chime-card-head">' +
            '<div class="chime-card-id">' +
              '<span class="chime-dot' + (isAct ? ' active' : '') + '"></span>' +
              '<span class="chime-slot-tag mono">CHIME ' + slotKey + '</span>' +
              stagePill +
              '<span class="chime-patch-name" title="' + title + '">' + title + '</span>' +
            '</div>' +
            '<div class="chime-card-actions">' +
              (order.length < MAX_CHIMES ? '<button type="button" class="chime-ico-btn" data-cact="dup" title="Duplicate Chime ' + slotKey + '">&#10697;</button>' : '') +
              (canDel ? '<button type="button" class="chime-ico-btn chime-del-btn" data-cact="del" title="Remove Chime ' + slotKey + '">&times;</button>' : '') +
              '<button type="button" class="chime-stage-btn mono" data-cact="stage" title="Maximize Chime ' + slotKey + ' into 3D Stage">Stage &#8599;</button>' +
            '</div>' +
          '</div>' +
          '<div class="chime-canvas-wrap">' +
            '<canvas class="chime-front-canvas" data-chime-canvas="' + slotKey + '"></canvas>' +
          '</div>' +
          '<div class="chime-card-foot mono">' +
            '<label class="chime-mini-ctl" title="Phase \u03C6 (-180\u00B0..+180\u00B0)">' +
              '<span>&phi;</span>' +
              '<input type="range" min="-180" max="180" step="1" value="' + phDeg + '" data-cparam="ph" />' +
              '<b data-cout="ph">' + phDeg + '&deg;</b>' +
            '</label>' +
            '<label class="chime-mini-ctl" title="Inner Cavity r">' +
              '<span>r</span>' +
              '<input type="range" min="0" max="' + (snap.r || 1).toFixed(2) + '" step="0.01" value="' + rInVal.toFixed(2) + '" data-cparam="rIn" />' +
              '<b data-cout="rIn">' + rInVal.toFixed(2) + '</b>' +
            '</label>' +
            '<button type="button" class="mini-btn chime-twin-btn" data-cact="twin" title="Cycle Twin symmetry (Off / \u2212P / P\u0304 / Both)">' + (TWIN_SHORT[twMode] || 'Both') + '</button>' +
          '</div>';

        // Click card to focus this Chime
        card.addEventListener('click', function (ev) {
          if (ev.target && (ev.target.closest('button') || ev.target.tagName === 'INPUT')) return;
          hooks.selectSlot(slotKey);
          rebuildRackDOM(true);
        });
        // Double-click canvas to maximize straight into 3D Stage
        var cWrap = card.querySelector('.chime-canvas-wrap');
        if (cWrap) {
          cWrap.addEventListener('dblclick', function () {
            hooks.selectSlot(slotKey);
            setView('stage');
          });
        }
        // Header & footer actions
        card.querySelectorAll('[data-cact]').forEach(function (btn) {
          btn.addEventListener('click', function (ev) {
            ev.stopPropagation();
            var act = btn.getAttribute('data-cact');
            if (act === 'stage') {
              hooks.selectSlot(slotKey);
              setView('stage');
            } else if (act === 'dup') {
              hooks.spawnChime({ fromSlot: slotKey });
              rebuildRackDOM(true);
            } else if (act === 'del') {
              hooks.removeChime(slotKey);
              rebuildRackDOM(true);
            } else if (act === 'twin') {
              var curTw = (slots[slotKey] && slots[slotKey].tw) || 'both';
              var nextTw = TWIN_CYCLE[(TWIN_CYCLE.indexOf(curTw) + 1) % TWIN_CYCLE.length];
              hooks.updateSlotParam(slotKey, 'tw', nextTw);
              btn.textContent = TWIN_SHORT[nextTw];
            }
          });
        });
        // Inline Phase & Cavity r mini sliders
        card.querySelectorAll('input[data-cparam]').forEach(function (inp) {
          inp.addEventListener('input', function () {
            var pKey = inp.getAttribute('data-cparam');
            var val = parseFloat(inp.value);
            hooks.updateSlotParam(slotKey, pKey, val);
            var out = card.querySelector('[data-cout="' + pKey + '"]');
            if (out) out.textContent = pKey === 'ph' ? (Math.round(val) + '\u00B0') : val.toFixed(2);
          });
        });

        grid.appendChild(card);
      })(order[i]);
    }

    var addRail = document.getElementById('btnRackAddChime');
    if (addRail) {
      addRail.disabled = order.length >= MAX_CHIMES;
      addRail.title = order.length >= MAX_CHIMES
        ? ('Maximum ' + MAX_CHIMES + ' Chimes reached')
        : ('Spawn a new Chime (' + order.length + '/' + MAX_CHIMES + ')');
    }
  }

  function rebuildMenuDOM(force) {
    if (typeof document === 'undefined' || !hooks) return;
    var activeGrid = document.getElementById('chimeMenuActiveGrid');
    var presetGrid = document.getElementById('chimeMenuPresetGrid');
    var activeSec = document.getElementById('chimeMenuActiveSec');
    var presetSec = document.getElementById('chimeMenuPresetSec');
    if (!activeGrid || !presetGrid) return;

    var order = hooks.getSlotOrder();
    var activeSlot = hooks.getActiveSlot();
    var slots = hooks.getSlots();
    var presets = getPresets();
    var sig = menuFilter + '|' + order.join(',') + '|' + activeSlot + '|' + order.map(function (k) {
      return slots[k] ? slots[k].p : '';
    }).join(';');
    if (!force && sig === lastMenuSig) return;
    lastMenuSig = sig;

    var countEl = document.getElementById('chimeMenuCount');
    if (countEl) {
      countEl.textContent = order.length + ' active chimes \u00B7 ' + Math.max(0, presets.length - 1) + ' presets \u00B7 click to focus \u00B7 double-click for 3D Stage';
    }

    if (activeSec) activeSec.hidden = (menuFilter === 'presets');
    if (presetSec) presetSec.hidden = (menuFilter === 'active');

    // 1. Active Chime Cards + "+ ADD CHIME" Spawn Tile
    activeGrid.innerHTML = '';
    for (var i = 0; i < order.length; i++) {
      (function (slotKey) {
        var snap = slots[slotKey];
        if (!snap) return;
        var isAct = slotKey === activeSlot;
        var tile = document.createElement('div');
        tile.className = 'chime-menu-card' + (isAct ? ' active' : '');
        var title = shortPresetName(snap.p);
        var canDel = slotKey !== 'A' && slotKey !== 'B' && slotKey !== 'C';
        tile.innerHTML =
          '<div class="cmc-head mono">' +
            '<span class="cmc-slot"><i class="chime-dot' + (isAct ? ' active' : '') + '"></i>CHIME ' + slotKey + '</span>' +
            '<span class="cmc-acts">' +
              (order.length < MAX_CHIMES ? '<button type="button" class="chime-ico-btn" data-mact="dup" title="Duplicate Chime ' + slotKey + '">&#10697;</button>' : '') +
              (canDel ? '<button type="button" class="chime-ico-btn chime-del-btn" data-mact="del" title="Remove Chime ' + slotKey + '">&times;</button>' : '') +
            '</span>' +
          '</div>' +
          '<canvas class="cmc-canvas" data-menu-slot="' + slotKey + '"></canvas>' +
          '<div class="cmc-meta">' +
            '<div class="cmc-name" title="' + title + '">' + title + '</div>' +
            '<div class="cmc-sub mono">R=' + (snap.r || 1).toFixed(2) + ' \u00B7 r=' + (snap.rIn || 0).toFixed(2) + ' \u00B7 ' + (TWIN_SHORT[snap.tw || 'both'] || 'Both') + '</div>' +
          '</div>';

        tile.addEventListener('click', function (ev) {
          if (ev.target && ev.target.closest('button')) return;
          hooks.selectSlot(slotKey);
          rebuildMenuDOM(true);
        });
        tile.addEventListener('dblclick', function () {
          hooks.selectSlot(slotKey);
          setView('stage');
        });
        tile.querySelectorAll('[data-mact]').forEach(function (btn) {
          btn.addEventListener('click', function (ev) {
            ev.stopPropagation();
            var act = btn.getAttribute('data-mact');
            if (act === 'dup') { hooks.spawnChime({ fromSlot: slotKey }); rebuildMenuDOM(true); }
            else if (act === 'del') { hooks.removeChime(slotKey); rebuildMenuDOM(true); }
          });
        });
        activeGrid.appendChild(tile);
      })(order[i]);
    }

    if (order.length < MAX_CHIMES) {
      var addCard = document.createElement('button');
      addCard.type = 'button';
      addCard.className = 'chime-menu-add';
      addCard.innerHTML = '<span class="cmc-plus">+</span><span class="mono">ADD CHIME</span>';
      addCard.addEventListener('click', function () {
        hooks.spawnChime({});
        rebuildMenuDOM(true);
      });
      activeGrid.appendChild(addCard);
    }

    // 2. Built-In Preset Cards (visual browser!)
    presetGrid.innerHTML = '';
    for (var pi = 0; pi < presets.length; pi++) {
      (function (idx, pr) {
        if (!pr || !pr.formulas) return;
        var tile = document.createElement('div');
        tile.className = 'chime-menu-card preset-card';
        var title = shortPresetName(idx);
        tile.innerHTML =
          '<div class="cmc-head mono">' +
            '<span class="cmc-group">' + (pr.group || 'Patch').split(' ')[0] + '</span>' +
            '<button type="button" class="chime-ico-btn" data-pact="spawn" title="Spawn as new Chime in Rack">+</button>' +
          '</div>' +
          '<canvas class="cmc-canvas" data-menu-preset="' + idx + '"></canvas>' +
          '<div class="cmc-meta">' +
            '<div class="cmc-name" title="' + pr.name + '">' + title + '</div>' +
            '<div class="cmc-sub mono">#' + idx + ' \u00B7 ' + ((pr.params && pr.params.rIn != null) ? ('r=' + pr.params.rIn.toFixed(2)) : 'vessel') + '</div>' +
          '</div>';

        tile.addEventListener('click', function (ev) {
          if (ev.target && ev.target.closest('button')) return;
          hooks.loadPresetIntoActive(idx);
          rebuildMenuDOM(true);
        });
        tile.addEventListener('dblclick', function () {
          hooks.loadPresetIntoActive(idx);
          setView('stage');
        });
        var spBtn = tile.querySelector('[data-pact="spawn"]');
        if (spBtn) {
          spBtn.addEventListener('click', function (ev) {
            ev.stopPropagation();
            hooks.spawnChime({ presetIndex: idx });
            rebuildMenuDOM(true);
          });
        }
        presetGrid.appendChild(tile);
      })(pi, presets[pi]);
    }
  }

  // ---- Per-Frame Render Loop Hook (Only runs when currentView !== 'stage') ----
  function update(liveState, livePoints, playT, floorFieldData) {
    if (currentView === 'stage' || typeof document === 'undefined' || !hooks) return;
    var slots = hooks.getSlots();
    var activeSlot = hooks.getActiveSlot();
    var harmor = !!(liveState && liveState.toggles && liveState.toggles.harmorVoid);

    if (currentView === 'rack') {
      rebuildRackDOM(false);
      var stages = (hooks.getSlotStages ? hooks.getSlotStages() : null) || {};
      var lcdCfg = (Harmony.SynthLCD && Harmony.SynthLCD.getConfig) ? Harmony.SynthLCD.getConfig() : null;
      var canvases = document.querySelectorAll('#chimeRackCards canvas[data-chime-canvas]');
      for (var i = 0; i < canvases.length; i++) {
        var cv = canvases[i];
        var key = cv.getAttribute('data-chime-canvas');
        var isAct = key === activeSlot;
        var st = isAct ? liveState : (slots[key] ? buildEvalStateFromSnap(slots[key]) : null);
        if (!st) continue;
        var pts = isAct ? livePoints : getCachedPoints(st, 640);
        var sm = stages[key] || null;
        if (sm && lcdCfg) {
          sm = Object.assign({}, sm, {
            coalesce: liveState.lcdCoalesce != null ? liveState.lcdCoalesce : lcdCfg.coalesce,
            harmorBinary: lcdCfg.harmorBinary
          });
        }
        drawFrontSphere(cv, st, pts, playT, {
          harmor: harmor,
          compact: false,
          floorField: isAct ? floorFieldData : null,
          stageMeta: sm
        });

        // Keep focused card's inline Phase/r readouts live if modulated by 5 · Mod & Logic!
        if (isAct && cv.parentElement && cv.parentElement.parentElement) {
          var card = cv.parentElement.parentElement;
          var phOut = card.querySelector('[data-cout="ph"]');
          var phInp = card.querySelector('input[data-cparam="ph"]');
          var phDeg = Math.round((liveState.phaseRad || 0) * 180 / Math.PI);
          if (phOut) phOut.textContent = phDeg + '\u00B0';
          if (phInp && document.activeElement !== phInp) phInp.value = String(phDeg);
          var rOut = card.querySelector('[data-cout="rIn"]');
          var rInp = card.querySelector('input[data-cparam="rIn"]');
          if (rOut) rOut.textContent = (liveState.rIn || 0).toFixed(2);
          if (rInp && document.activeElement !== rInp) rInp.value = (liveState.rIn || 0).toFixed(2);
        }
      }
    } else if (currentView === 'menu') {
      rebuildMenuDOM(false);
      var slotCvs = document.querySelectorAll('#chimeMenuActiveGrid canvas[data-menu-slot]');
      for (var s = 0; s < slotCvs.length; s++) {
        var scv = slotCvs[s];
        var sk = scv.getAttribute('data-menu-slot');
        var isA = sk === activeSlot;
        var sst = isA ? liveState : (slots[sk] ? buildEvalStateFromSnap(slots[sk]) : null);
        if (!sst) continue;
        var spts = isA ? livePoints : getCachedPoints(sst, 420);
        drawFrontSphere(scv, sst, spts, playT, { harmor: harmor, compact: true });
      }
      var presetCvs = document.querySelectorAll('#chimeMenuPresetGrid canvas[data-menu-preset]');
      var AC = getAgentCore();
      for (var p = 0; p < presetCvs.length; p++) {
        var pcv = presetCvs[p];
        var pIdx = Number(pcv.getAttribute('data-menu-preset'));
        var psnap = (AC && AC.snapshotFromPreset) ? AC.snapshotFromPreset(pIdx) : null;
        if (!psnap) continue;
        var pst = buildEvalStateFromSnap(psnap);
        var ppts = getCachedPoints(pst, 320);
        drawFrontSphere(pcv, pst, ppts, playT, { harmor: harmor, compact: true });
      }
    }
  }

  function init(appHooks) {
    hooks = appHooks;
    if (typeof document === 'undefined') return;
    if (document.body) document.body.setAttribute('data-stage-view', currentView);

    document.querySelectorAll('.stage-view-btn[data-sview]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setView(btn.getAttribute('data-sview'));
      });
    });

    var addRail = document.getElementById('btnRackAddChime');
    if (addRail) {
      addRail.addEventListener('click', function () {
        if (hooks && hooks.spawnChime) {
          hooks.spawnChime({});
          rebuildRackDOM(true);
        }
      });
    }

    document.querySelectorAll('.chime-menu-filter[data-mfilter]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        menuFilter = btn.getAttribute('data-mfilter') || 'all';
        document.querySelectorAll('.chime-menu-filter[data-mfilter]').forEach(function (b) {
          b.classList.toggle('active', b === btn);
        });
        rebuildMenuDOM(true);
      });
    });

    var backBtn = document.getElementById('btnMenuBackStage');
    if (backBtn) {
      backBtn.addEventListener('click', function () { setView('stage'); });
    }
  }

  var api = {
    MAX_CHIMES: MAX_CHIMES,
    ALL_KEYS: ALL_KEYS,
    init: init,
    setView: setView,
    getView: getView,
    update: update,
    refresh: function () {
      if (currentView === 'rack') rebuildRackDOM(true);
      if (currentView === 'menu') rebuildMenuDOM(true);
    },
    drawFrontSphere: drawFrontSphere,
    buildEvalStateFromSnap: buildEvalStateFromSnap
  };

  Harmony.ChimeRack = api;
  if (typeof module !== 'undefined' && module && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
