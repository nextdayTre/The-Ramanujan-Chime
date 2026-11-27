/* ===== Harmony.Scene3D — Hero Hollow Sphere + Internal 2D f(x)/x Slice =====
   Renders:
   1. Constant Hollow Sphere Carrier (Outer R + Inner Cavity rIn + Cutaway mode
      with glowing annular cross-section V = 4/3·π(R³ − r³))
   2. Inscribed 2D f(x)/x Cartesian Slice Plane at z = 0 inside the sphere
   3. 4-zone vertex-colored patch trajectory (On Sphere / In Shell / Cavity / Outside)
   4. Both Harmony Engine Twins (§7):
      - Antipodal Twin (−P) in magenta
      - Conjugate Twin (P̄ = (x, −y, z)) in gold + Real Trace (P + P̄)/2 + chord
   5. Playhead markers, radius vector, magnifier target ring, & camera presets */
(function () {
  'use strict';

  var renderer, scene, camera, controls, container, resizeObs;
  var sphereGroup, sliceGroup, strobeGroup, fourBitGroup, quadrayGroup, resonanceGroup, gridHelper, axesHelper;
  var curveLine, antipodalLine, conjugateLine, realTraceLine, ghostLine;
  var marker, antipodalMarker, conjugateMarker, realTraceMarker, magTargetRing;
  var vectorLine, conjugateChordLine;
  var strobeNodeGeo, strobeMatIdent, strobeMatActive, strobeMatCoset;
  var fbLblTop1111, fbLblBot0000, fbLblBack0100, fbLblFront0010;
  var fbMerNode8, fbMerNode1, fbEqNode8, fbEqNode1;
  var fbMerBadge8, fbMerBadge1, fbEqBadge8, fbEqBadge1;
  var fbMerChord, fbEqChord, fbBridgeLines;
  var resSliceMesh, resSliceOuterRim, resSliceInnerRim, resSliceSpokes;
  var resModeOuterRing, resModeInnerRing, resModeWallRing, resHalfPowerRing;

  // §10 Cutaway Floor 3D Wavetable & MiniMeters 3D Spectrogram objects
  var FLOOR_SLICES = 28;
  var FLOOR_BINS = 72;
  var floorWtGroup;
  var floorSurfaceMesh, floorWireLines, floorFrontLine, floorActiveLine;
  var floorEqCurtain, floorTiltLine;
  var floorSurfPos, floorSurfCol, floorWirePos, floorWireCol;
  var floorFrontPos, floorActivePos, floorEqPos, floorEqCol, floorTiltPos;

  var lastRendered = -1;
  var lastSphereSig = '';
  var lastCollapseSig = '';
  var lastResSliceKey = '';
  var cameraMoved = true;

  // 4-zone color relative to Hollow Sphere (Cavity rIn .. Shell .. Outer R)
  // In Harmor Void mode (§5.6), [Cavity_Shell_Color] = [Bitwave_Color] = Luminous Green over #000000 silence
  function distColor(x, y, z, R, rIn, harmorVoid) {
    var d = Math.sqrt(x * x + y * y + z * z);
    var tol = R * 0.045;
    if (harmorVoid) {
      if (Math.abs(d - R) <= tol) return [0.22, 1.00, 0.45];          // ON SPHERE (neon Harmor green)
      if (d > R + tol) return [0.75, 1.00, 0.32];                     // OUTSIDE (lime harmonic peak)
      if (rIn > 0.02 && d < rIn - tol * 0.5) return [0.00, 0.96, 0.42];// IN CAVITY (same luminous green substance)
      return [0.15, 0.92, 0.48];                                      // IN SHELL (emerald green)
    }
    if (Math.abs(d - R) <= tol) return [0.30, 0.95, 0.87];          // ON SPHERE (cyan)
    if (d > R + tol) return [1.00, 0.42, 0.42];                     // OUTSIDE (coral red)
    if (rIn > 0.02 && d < rIn - tol * 0.5) return [0.35, 0.66, 1.0];// IN CAVITY (sky blue)
    return [0.43, 0.91, 0.63];                                      // IN SHELL (emerald)
  }

  // Tiny crisp text sprite for axis labels inside the sphere
  function makeLabelSprite(text, colorHex, scaleSize) {
    var c = document.createElement('canvas');
    c.width = 128; c.height = 48;
    var g = c.getContext('2d');
    g.font = '600 22px "Cascadia Code", Consolas, monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = colorHex || '#6ee7a0';
    g.fillText(text, 64, 24);
    var tex = new THREE.CanvasTexture(c);
    var mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    var sp = new THREE.Sprite(mat);
    var s = scaleSize || 0.28;
    sp.scale.set(s * (128 / 48), s, 1);
    return sp;
  }

  // High-contrast 4-Bit & Quadray badge sprite (with optional subtitle & subtle glass pill)
  function makeBitSprite(mainText, subText, fgHex, borderHex, scaleSize, plainTextOnly) {
    var c = document.createElement('canvas');
    c.width = 256; c.height = 96;
    var g = c.getContext('2d');
    if (!plainTextOnly) {
      g.fillStyle = 'rgba(9, 14, 22, 0.84)';
      g.strokeStyle = borderHex || fgHex || '#4df3dd';
      g.lineWidth = 3;
      var rx = 18, ry = 10, rw = 220, rh = 76, rad = 16;
      g.beginPath();
      g.moveTo(rx + rad, ry);
      g.lineTo(rx + rw - rad, ry);
      g.quadraticCurveTo(rx + rw, ry, rx + rw, ry + rad);
      g.lineTo(rx + rw, ry + rh - rad);
      g.quadraticCurveTo(rx + rw, ry + rh, rx + rw - rad, ry + rh);
      g.lineTo(rx + rad, ry + rh);
      g.quadraticCurveTo(rx, ry + rh, rx, ry + rh - rad);
      g.lineTo(rx, ry + rad);
      g.quadraticCurveTo(rx, ry, rx + rad, ry);
      g.closePath();
      g.fill();
      g.stroke();
    }
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = fgHex || '#ffffff';
    if (subText) {
      g.font = '700 32px Georgia, "Times New Roman", "Cascadia Code", serif';
      g.fillText(mainText, 128, 36);
      g.font = '600 18px "Cascadia Code", Consolas, monospace';
      g.fillStyle = borderHex || '#9de8c0';
      g.fillText(subText, 128, 66);
    } else {
      g.font = '700 38px Georgia, "Times New Roman", "Cascadia Code", serif';
      g.fillText(mainText, 128, 48);
    }
    var tex = new THREE.CanvasTexture(c);
    var mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    var sp = new THREE.Sprite(mat);
    var s = scaleSize || 0.30;
    sp.scale.set(s * (256 / 96), s, 1);
    sp.renderOrder = 12;
    return sp;
  }

  function makeCircleLoop(radius, segments, color, opacity, plane) {
    var pts = [];
    for (var i = 0; i <= segments; i++) {
      var a = (i / segments) * Math.PI * 2;
      var c = Math.cos(a) * radius, s = Math.sin(a) * radius;
      if (plane === 'xz') pts.push(new THREE.Vector3(c, 0, s));
      else pts.push(new THREE.Vector3(c, s, 0));
    }
    var geo = new THREE.BufferGeometry().setFromPoints(pts);
    return new THREE.Line(geo, new THREE.LineBasicMaterial({
      color: color, transparent: true, opacity: opacity
    }));
  }

  function init(el, state) {
    container = el;
    var w = el.clientWidth || 640;
    var h = el.clientHeight || 420;

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(46, w / h, 0.01, 200);
    camera.position.set(2.55, 1.65, 2.85);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h);
    el.insertBefore(renderer.domElement, el.firstChild);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.autoRotateSpeed = 1.1;
    controls.addEventListener('change', function () { cameraMoved = true; });

    scene.add(new THREE.AmbientLight(0xffffff, 0.62));
    var dir = new THREE.DirectionalLight(0xffffff, 0.85);
    dir.position.set(3, 5, 4);
    scene.add(dir);
    var rim = new THREE.DirectionalLight(0x55bbff, 0.4);
    rim.position.set(-4, -2, -3);
    scene.add(rim);

    // Floor grid + 3D axes
    gridHelper = new THREE.GridHelper(6, 12, 0x22303d, 0x151e27);
    axesHelper = new THREE.AxesHelper(2.2);
    scene.add(gridHelper);
    scene.add(axesHelper);

    // Vessel, internal 2D slice, Discrete Order N Strobe, Four-Bit Orbit, and §§1-3 Resonance groups
    sphereGroup = new THREE.Group();
    sliceGroup = new THREE.Group();
    strobeGroup = new THREE.Group();
    fourBitGroup = new THREE.Group();
    resonanceGroup = new THREE.Group();
    scene.add(sphereGroup);
    scene.add(sliceGroup);
    scene.add(strobeGroup);
    scene.add(fourBitGroup);
    scene.add(resonanceGroup);

    strobeNodeGeo = new THREE.SphereGeometry(0.024, 12, 12);
    strobeMatIdent = new THREE.MeshBasicMaterial({ color: 0x6ee7a0 });
    strobeMatActive = new THREE.MeshBasicMaterial({ color: 0xffd166 });
    strobeMatCoset = new THREE.MeshBasicMaterial({ color: 0x4c5d73, transparent: true, opacity: 0.55 });

    // Main curve (vertex-colored by hollow-sphere zone)
    curveLine = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 1.0 })
    );
    scene.add(curveLine);

    // Antipodal twin (−P) in magenta
    antipodalLine = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0xff5ca8, transparent: true, opacity: 0.58 })
    );
    scene.add(antipodalLine);

    // Conjugate twin (P̄ = (x, −y, z)) in warm gold
    conjugateLine = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0xffb04d, transparent: true, opacity: 0.68 })
    );
    scene.add(conjugateLine);

    // Real-part sum midpoint trace (P + P̄)/2 = (x, 0, z) in emerald/white
    realTraceLine = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0x6ee7a0, transparent: true, opacity: 0.55 })
    );
    scene.add(realTraceLine);

    // VST A/B/C Reference Ghost Trajectory in soft violet
    ghostLine = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0x9d8cff, transparent: true, opacity: 0.38 })
    );
    ghostLine.visible = false;
    scene.add(ghostLine);

    // Playhead markers
    marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.036, 18, 18),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    scene.add(marker);

    antipodalMarker = new THREE.Mesh(
      new THREE.SphereGeometry(0.028, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xff5ca8 })
    );
    scene.add(antipodalMarker);

    conjugateMarker = new THREE.Mesh(
      new THREE.SphereGeometry(0.028, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xffb04d })
    );
    scene.add(conjugateMarker);

    realTraceMarker = new THREE.Mesh(
      new THREE.SphereGeometry(0.024, 14, 14),
      new THREE.MeshBasicMaterial({ color: 0x6ee7a0 })
    );
    scene.add(realTraceMarker);

    // Magnifier focus reticle ring (matches the red zoom callout in Weierstrass!)
    magTargetRing = makeCircleLoop(0.08, 36, 0xff5252, 0.95, 'xy');
    magTargetRing.visible = false;
    scene.add(magTargetRing);

    // Origin -> Playhead radius vector
    vectorLine = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0xffc244 })
    );
    scene.add(vectorLine);

    // Conjugate chord connecting P <-> P̄ across the real axis
    conjugateChordLine = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0xffd28a, transparent: true, opacity: 0.55 })
    );
    scene.add(conjugateChordLine);

    initFloorWt();

    if (window.ResizeObserver) {
      resizeObs = new ResizeObserver(onResize);
      resizeObs.observe(el);
    }
    window.addEventListener('resize', onResize);

    rebuildVesselAndSlice(state);
  }

  function clearGroup(grp) {
    while (grp.children.length) {
      var ch = grp.children[0];
      grp.remove(ch);
      if (ch.geometry) ch.geometry.dispose();
    }
  }

  // Build both the Constant Hollow Sphere (Outer R + Inner Cavity rIn + Cutaway)
  // AND the Inscribed 2D f(x)/x Cartesian Slice Plane at z = 0
  function rebuildVesselAndSlice(state) {
    if (!sphereGroup) return;
    clearGroup(sphereGroup);
    clearGroup(sliceGroup);

    var R = Math.max(0.1, state.r);
    var rIn = Math.min(Math.max(0, state.rIn != null ? state.rIn : 0), R * 0.98);
    var cutaway = !!state.toggles.cutaway;
    var showSurface = state.toggles.surface !== false;
    var showWire = state.toggles.wireframe !== false;
    var harmor = !!(state.toggles && state.toggles.harmorVoid);

    var colOuterSurf = harmor ? 0x0b5229 : 0x1b7a91;
    var colOuterWire = harmor ? 0x147a3e : 0x2e506c;
    var colInnerSurf = harmor ? 0x00ff66 : 0xd95b72;
    var colInnerWire = harmor ? 0x39ff14 : 0x7b4c63;
    var colCutOuter  = harmor ? 0x0e6b36 : 0x1d88a2;
    var colCutWire   = harmor ? 0x1c8c4b : 0x366485;
    var colCutRing   = harmor ? 0x00ff66 : 0x36d6c8;
    var colCutRimOut = harmor ? 0x39ff14 : 0x4df3dd;
    var colCutInner  = harmor ? 0x00ff66 : 0xff6b7a;

    if (!cutaway) {
      // Full Outer Carrier Sphere (OSC A)
      var outerGeo = new THREE.SphereGeometry(R, 52, 34);
      if (showSurface) {
        sphereGroup.add(new THREE.Mesh(outerGeo, new THREE.MeshPhongMaterial({
          color: colOuterSurf, transparent: true, opacity: harmor ? 0.12 : 0.14,
          side: THREE.DoubleSide, depthWrite: false
        })));
      }
      if (showWire) {
        sphereGroup.add(new THREE.Mesh(outerGeo, new THREE.MeshBasicMaterial({
          color: colOuterWire, wireframe: true, transparent: true, opacity: harmor ? 0.34 : 0.36
        })));
      }
      // Inner Cavity Core Sphere (OSC B)
      if (rIn > 0.02) {
        var innerGeo = new THREE.SphereGeometry(rIn, 36, 24);
        if (showSurface) {
          sphereGroup.add(new THREE.Mesh(innerGeo, new THREE.MeshPhongMaterial({
            color: colInnerSurf, transparent: true, opacity: harmor ? 0.22 : 0.11,
            side: THREE.DoubleSide, depthWrite: false
          })));
        }
        if (showWire) {
          sphereGroup.add(new THREE.Mesh(innerGeo, new THREE.MeshBasicMaterial({
            color: colInnerWire, wireframe: true, transparent: true, opacity: harmor ? 0.48 : 0.25
          })));
        }
      }
    } else {
      // Cutaway Hollow Sphere — brings the V = 4/3·π(R³ − r³) diagram to 3D life!
      // Lower hemisphere solid + upper hemisphere gossamer wireframe + glowing annular wall
      var botOuterGeo = new THREE.SphereGeometry(R, 56, 24, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
      if (showSurface) {
        sphereGroup.add(new THREE.Mesh(botOuterGeo, new THREE.MeshPhongMaterial({
          color: colCutOuter, transparent: true, opacity: 0.24,
          side: THREE.DoubleSide, depthWrite: false
        })));
      }
      if (showWire) {
        var topWireGeo = new THREE.SphereGeometry(R, 40, 18, 0, Math.PI * 2, 0, Math.PI / 2);
        sphereGroup.add(new THREE.Mesh(topWireGeo, new THREE.MeshBasicMaterial({
          color: colCutWire, wireframe: true, transparent: true, opacity: 0.24
        })));
        sphereGroup.add(new THREE.Mesh(botOuterGeo, new THREE.MeshBasicMaterial({
          color: colCutWire, wireframe: true, transparent: true, opacity: 0.42
        })));
      }

      // Annular Hollow Shell Wall Cap at y = 0 (between rIn and R)
      if (showSurface && R > rIn + 0.005) {
        var ringGeo = new THREE.RingGeometry(rIn, R, 72);
        ringGeo.rotateX(-Math.PI / 2);
        sphereGroup.add(new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
          color: colCutRing, transparent: true, opacity: 0.25,
          side: THREE.DoubleSide, depthWrite: false
        })));
      }
      sphereGroup.add(makeCircleLoop(R, 96, colCutRimOut, 0.75, 'xz'));

      // Inner Cavity Bowl & Rim (rIn)
      if (rIn > 0.02) {
        var botInnerGeo = new THREE.SphereGeometry(rIn, 40, 18, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
        if (showSurface) {
          sphereGroup.add(new THREE.Mesh(botInnerGeo, new THREE.MeshPhongMaterial({
            color: colCutInner, transparent: true, opacity: harmor ? 0.30 : 0.22,
            side: THREE.DoubleSide, depthWrite: false
          })));
          var cavDisk = new THREE.CircleGeometry(rIn, 64);
          cavDisk.rotateX(-Math.PI / 2);
          sphereGroup.add(new THREE.Mesh(cavDisk, new THREE.MeshBasicMaterial({
            color: colCutInner, transparent: true, opacity: harmor ? 0.22 : 0.16,
            side: THREE.DoubleSide, depthWrite: false
          })));
        }
        sphereGroup.add(makeCircleLoop(rIn, 72, colCutInner, 0.88, 'xz'));
      }
    }

    // Store base opacities so §5.6 Cavity Collapse (λ) can fade shells into void without rebuilding geometry
    for (var sm = 0; sm < sphereGroup.children.length; sm++) {
      var ch = sphereGroup.children[sm];
      if (ch && ch.material && typeof ch.material.opacity === 'number') {
        ch.userData.baseOpacity = ch.material.opacity;
      }
    }

    // ---- Internal 2D f(x)/x Cartesian Slice Plane at z = 0 ----
    // Inscribed cleanly inside x² + y² ≤ R² so it floats inside the sphere like a precision scope dial
    var gridPos = [];
    var divs = 4; // 4 subdivisions per half-axis => step = R / 4
    var step = R / divs;
    for (var i = -divs + 1; i <= divs - 1; i++) {
      if (i === 0) continue;
      var coord = i * step;
      var span = Math.sqrt(Math.max(0, R * R - coord * coord));
      // Vertical grid line at x = coord
      gridPos.push(coord, -span, 0, coord, span, 0);
      // Horizontal grid line at y = coord
      gridPos.push(-span, coord, 0, span, coord, 0);
    }
    var gridGeo = new THREE.BufferGeometry();
    gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(gridPos, 3));
    sliceGroup.add(new THREE.LineSegments(gridGeo, new THREE.LineBasicMaterial({
      color: 0x36d6c8, transparent: true, opacity: 0.16
    })));

    // Principal x and f(x) axes with tick marks
    var axisPos = [
      -R, 0, 0, R, 0, 0,
      0, -R, 0, 0, R, 0
    ];
    var tickLen = R * 0.032;
    for (var tIdx = -divs; tIdx <= divs; tIdx++) {
      if (tIdx === 0) continue;
      var tc = tIdx * step;
      axisPos.push(tc, -tickLen, 0, tc, tickLen, 0);
      axisPos.push(-tickLen, tc, 0, tickLen, tc, 0);
    }
    var axGeo = new THREE.BufferGeometry();
    axGeo.setAttribute('position', new THREE.Float32BufferAttribute(axisPos, 3));
    sliceGroup.add(new THREE.LineSegments(axGeo, new THREE.LineBasicMaterial({
      color: 0x6ee7a0, transparent: true, opacity: 0.55
    })));

    // Outer R rim & Inner rIn circle on the z = 0 slice plane
    sliceGroup.add(makeCircleLoop(R, 96, 0x36d6c8, 0.52, 'xy'));
    if (rIn > 0.02) {
      sliceGroup.add(makeCircleLoop(rIn, 72, 0xff7b89, 0.42, 'xy'));
    }

    // Subtle z=0 translucent glass disc
    var discGeo = new THREE.CircleGeometry(R, 72);
    sliceGroup.add(new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({
      color: 0x0d2530, transparent: true, opacity: 0.14,
      side: THREE.DoubleSide, depthWrite: false
    })));

    // Axis labels inside the sphere
    var lblScale = Math.max(0.16, R * 0.18);
    var lblX = makeLabelSprite('x (+R)', '#6ee7a0', lblScale);
    lblX.position.set(R * 0.86, -R * 0.09, 0.01);
    sliceGroup.add(lblX);

    var lblFx = makeLabelSprite('f(x)', '#4df3dd', lblScale);
    lblFx.position.set(R * 0.13, R * 0.88, 0.01);
    sliceGroup.add(lblFx);

    sliceGroup.visible = state.toggles.sliceGrid !== false;
    rebuildFourBit(state);
    rebuildResonance(state);
  }

  // ---- §§1–3 Active Dual-Sphere Coupled Modal Resonance & Archimedes Constant-Area Slice ----
  function rebuildResonance(state) {
    if (!resonanceGroup) return;
    clearGroup(resonanceGroup);
    lastResSliceKey = '';

    var R = Math.max(0.1, state.r);
    var rIn = Math.min(Math.max(0, state.rIn != null ? state.rIn : 0), R * 0.98);
    var harmor = !!(state.toggles && state.toggles.harmorVoid);

    // 1. Coupled Radial Breathing Mode Nodal Rings (l = 0, §3.1):
    //    - Outer Mode (OSC A): k_1 = pi / R (1x)
    //    - Inner Cavity Mode (OSC B): k_1 = pi / r (alpha = R/r)
    //    - Hollow Shell Wall Mode: k_1 = pi / (R - r) at mid-shell radius (R + r) / 2
    resModeOuterRing = makeCircleLoop(1.0, 96, harmor ? 0x39ff14 : 0x4df3dd, 0.72, 'xz');
    resModeOuterRing.scale.set(R, 1, R);
    resonanceGroup.add(resModeOuterRing);

    resModeInnerRing = makeCircleLoop(1.0, 72, harmor ? 0x00ff66 : 0xff6b7a, 0.85, 'xz');
    resModeInnerRing.scale.set(Math.max(0.001, rIn), 1, Math.max(0.001, rIn));
    resModeInnerRing.visible = rIn > 0.01;
    resonanceGroup.add(resModeInnerRing);

    var rMid = 0.5 * (R + rIn);
    resModeWallRing = makeCircleLoop(1.0, 84, 0xffd166, 0.78, 'xz');
    resModeWallRing.scale.set(rMid, 1, rMid);
    resModeWallRing.visible = (R - rIn) > 0.01;
    resonanceGroup.add(resModeWallRing);

    // 2. -3 dB Half-Power Bow Tangency Reference Ring at R / sqrt(2) ≈ 0.7071 R (§5.7 preview)
    var rHalf = R * Math.SQRT1_2;
    resHalfPowerRing = makeCircleLoop(rHalf, 72, 0x9d8cff, 0.36, 'xy');
    resonanceGroup.add(resHalfPowerRing);

    // 3. Archimedes Constant-Area Corridor Boundary Rings at z = -rIn and z = +rIn
    if (rIn > 0.02 && rIn < R * 0.99) {
      var rhoCap = Math.sqrt(Math.max(0, R * R - rIn * rIn));
      var capFront = makeCircleLoop(rhoCap, 64, 0x6ee7a0, 0.35, 'xy');
      capFront.position.z = rIn;
      var capBack = makeCircleLoop(rhoCap, 64, 0x6ee7a0, 0.35, 'xy');
      capBack.position.z = -rIn;
      resonanceGroup.add(capFront, capBack);
    }

    // 4. Archimedes Moving Cross-Sectional Annular Disc perpendicular to Z-axis at z = sliceZ (§3.3)
    resSliceMesh = new THREE.Mesh(
      new THREE.RingGeometry(0.01, R, 72),
      new THREE.MeshBasicMaterial({
        color: harmor ? 0x00ff66 : 0x6ee7a0,
        transparent: true,
        opacity: 0.24,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    resonanceGroup.add(resSliceMesh);

    resSliceOuterRim = makeCircleLoop(1.0, 84, harmor ? 0x39ff14 : 0x4df3dd, 0.92, 'xy');
    resSliceInnerRim = makeCircleLoop(1.0, 64, harmor ? 0x00ff66 : 0xff6b7a, 0.95, 'xy');
    resonanceGroup.add(resSliceOuterRim, resSliceInnerRim);

    resSliceSpokes = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.72 })
    );
    resonanceGroup.add(resSliceSpokes);
  }

  // ---- §10 Cutaway Floor 3D Wavetable (GitWave Aesthetic) & MiniMeters 3D Spectrogram ----
  function initFloorWt() {
    floorWtGroup = new THREE.Group();
    floorWtGroup.visible = false;
    scene.add(floorWtGroup);

    var S = FLOOR_SLICES, B = FLOOR_BINS;
    var vCount = S * B;
    floorSurfPos = new Float32Array(vCount * 3);
    floorSurfCol = new Float32Array(vCount * 3);
    var indices = new Uint16Array((S - 1) * (B - 1) * 6);
    var ptr = 0;
    for (var s = 0; s < S - 1; s++) {
      for (var b = 0; b < B - 1; b++) {
        var i0 = s * B + b;
        var i1 = i0 + 1;
        var i2 = (s + 1) * B + b;
        var i3 = i2 + 1;
        indices[ptr++] = i0; indices[ptr++] = i2; indices[ptr++] = i1;
        indices[ptr++] = i1; indices[ptr++] = i2; indices[ptr++] = i3;
      }
    }
    var surfGeom = new THREE.BufferGeometry();
    surfGeom.setAttribute('position', new THREE.BufferAttribute(floorSurfPos, 3));
    surfGeom.setAttribute('color', new THREE.BufferAttribute(floorSurfCol, 3));
    surfGeom.setIndex(new THREE.BufferAttribute(indices, 1));
    floorSurfaceMesh = new THREE.Mesh(
      surfGeom,
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.62,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    floorWtGroup.add(floorSurfaceMesh);

    // Delicate wireframe ribs (every depth slice + every 6th spine)
    var ribSegs = S * (B - 1);
    var spineCount = Math.floor((B - 1) / 6) + 1;
    var spineSegs = spineCount * (S - 1);
    var totalWireVerts = (ribSegs + spineSegs) * 2;
    floorWirePos = new Float32Array(totalWireVerts * 3);
    floorWireCol = new Float32Array(totalWireVerts * 3);
    var wireGeom = new THREE.BufferGeometry();
    wireGeom.setAttribute('position', new THREE.BufferAttribute(floorWirePos, 3));
    wireGeom.setAttribute('color', new THREE.BufferAttribute(floorWireCol, 3));
    floorWireLines = new THREE.LineSegments(
      wireGeom,
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.45,
        depthWrite: false
      })
    );
    floorWtGroup.add(floorWireLines);

    // Luminous front rim edge (z = +zSpan)
    floorFrontPos = new Float32Array(B * 3);
    var frontGeom = new THREE.BufferGeometry();
    frontGeom.setAttribute('position', new THREE.BufferAttribute(floorFrontPos, 3));
    floorFrontLine = new THREE.Line(
      frontGeom,
      new THREE.LineBasicMaterial({ color: 0xb8e8ff, transparent: true, opacity: 0.96 })
    );
    floorWtGroup.add(floorFrontLine);

    // Travelling golden WT POS slice (Wavetable) or 2D EQ Peak Contour at z = 0 (Spectrogram)
    floorActivePos = new Float32Array(B * 3);
    var actGeom = new THREE.BufferGeometry();
    actGeom.setAttribute('position', new THREE.BufferAttribute(floorActivePos, 3));
    floorActiveLine = new THREE.Line(
      actGeom,
      new THREE.LineBasicMaterial({ color: 0xffb84d, transparent: true, opacity: 1.0 })
    );
    floorWtGroup.add(floorActiveLine);

    // MiniMeters 2D Animated Equalizer Curtain standing vertically on z = 0 (2D f(x) Slice)
    floorEqPos = new Float32Array(B * 2 * 3);
    floorEqCol = new Float32Array(B * 2 * 3);
    var eqIdx = new Uint16Array((B - 1) * 6);
    var ep = 0;
    for (var eb = 0; eb < B - 1; eb++) {
      var bot0 = eb * 2, top0 = bot0 + 1;
      var bot1 = (eb + 1) * 2, top1 = bot1 + 1;
      eqIdx[ep++] = bot0; eqIdx[ep++] = top0; eqIdx[ep++] = bot1;
      eqIdx[ep++] = bot1; eqIdx[ep++] = top0; eqIdx[ep++] = top1;
    }
    var eqGeom = new THREE.BufferGeometry();
    eqGeom.setAttribute('position', new THREE.BufferAttribute(floorEqPos, 3));
    eqGeom.setAttribute('color', new THREE.BufferAttribute(floorEqCol, 3));
    eqGeom.setIndex(new THREE.BufferAttribute(eqIdx, 1));
    floorEqCurtain = new THREE.Mesh(
      eqGeom,
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.78,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    floorEqCurtain.visible = false;
    floorWtGroup.add(floorEqCurtain);

    // MiniMeters Cyan Spectral Tilt Line across z = 0
    floorTiltPos = new Float32Array(B * 3);
    var tiltGeom = new THREE.BufferGeometry();
    tiltGeom.setAttribute('position', new THREE.BufferAttribute(floorTiltPos, 3));
    floorTiltLine = new THREE.Line(
      tiltGeom,
      new THREE.LineBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0.85 })
    );
    floorTiltLine.visible = false;
    floorWtGroup.add(floorTiltLine);
  }

  // MiniMeters vibrant spectrum ramp: deep violet -> magenta -> hot crimson (low/mid peaks) -> electric cyan (highs)
  function miniMetersRgb(u, mag, harmor) {
    if (harmor) {
      var g = 0.25 + 0.75 * Math.min(1, mag * 1.15);
      return [0.04 + 0.22 * mag, g, 0.16 + 0.28 * mag];
    }
    var e = Math.max(0, Math.min(1, mag));
    if (u < 0.42) {
      // Bass & low-mid: deep purple -> vivid magenta -> hot crimson peak
      if (e > 0.68) {
        var t1 = (e - 0.68) / 0.32;
        return [0.92 + 0.08 * t1, 0.09 + 0.14 * (1 - t1), 0.52 * (1 - t1) + 0.24 * t1];
      }
      var t0 = e / 0.68;
      return [0.22 + 0.68 * t0, 0.06 + 0.08 * t0, 0.45 + 0.35 * t0];
    }
    // Mid-to-highs: royal indigo -> electric sky blue -> bright cyan shimmer
    var hi = (u - 0.42) / 0.58;
    return [
      0.16 * (1 - hi) + 0.38 * e * hi,
      0.20 + 0.68 * e * (0.55 + 0.45 * hi),
      0.56 + 0.42 * e
    ];
  }

  // GitWave volumetric wavetable ramp: vivid indigo trough -> luminous violet/cyan body -> ice-cyan crests
  function wavetableRgb(yNorm, inCavity, depthFade, harmor) {
    var a = Math.max(0, Math.min(1, 0.5 + 0.5 * yNorm));
    var f = 0.52 + 0.48 * depthFade;
    if (harmor) {
      return [0.06 * f, (0.38 + 0.62 * a) * f, (0.18 + 0.30 * a) * f];
    }
    var cr = (0.34 + 0.28 * a + (inCavity ? 0.08 : 0)) * f;
    var cg = (0.24 + 0.64 * a + (inCavity ? 0.14 : 0)) * f;
    var cb = (0.82 + 0.18 * a) * f;
    return [Math.min(1, cr), Math.min(1, cg), Math.min(1, cb)];
  }

  // Viscoelastic Eikonal Tank ramp: cyan positive crest, coral negative trough, gold propagation velocity shimmer
  function tankRgb(yNorm, velNorm, inCavity, harmor) {
    var pos = Math.max(0, Math.min(1, yNorm * 1.35));
    var neg = Math.max(0, Math.min(1, -yNorm * 1.35));
    var spd = Math.max(0, Math.min(1, Math.abs(velNorm) * 4.5));
    if (harmor) {
      var lum = Math.min(1, (pos + neg) * 0.92 + spd * 0.55);
      return [0.06 * pos + 0.24 * spd, (inCavity ? 0.20 : 0.10) + 0.90 * lum, 0.14 * neg + 0.35 * spd];
    }
    var baseR = inCavity ? 0.18 : 0.06;
    var baseG = inCavity ? 0.10 : 0.14;
    var baseB = inCavity ? 0.22 : 0.28;
    return [
      Math.min(1, baseR + 0.88 * neg + 0.42 * spd + 0.14 * pos),
      Math.min(1, baseG + 0.84 * pos + 0.52 * spd + 0.16 * neg),
      Math.min(1, baseB + 0.82 * pos + 0.44 * neg + 0.28 * spd)
    ];
  }

  function updateFloorWt(playT, state, field) {
    if (!floorWtGroup) return;
    var on = !!(state.toggles && state.toggles.floorWt);
    floorWtGroup.visible = on;
    if (!on) return;

    if (!field && Harmony.engine && Harmony.engine.floorField) {
      field = Harmony.engine.floorField(state, playT, { slices: FLOOR_SLICES, bins: FLOOR_BINS });
    }
    if (!field) return;

    var S = field.slices, B = field.bins;
    var R = field.R;
    var isSpec = field.mode === 'spectrogram';
    var isTank = field.mode === 'tank';
    var harmor = !!(state.toggles && state.toggles.harmorVoid);
    var yScale = isSpec ? (R * 0.68) : (isTank ? (R * 0.42) : (R * 0.36));

    floorSurfaceMesh.material.opacity = isSpec ? 0.74 : (isTank ? 0.78 : 0.66);
    floorWireLines.material.opacity = isSpec ? 0.38 : (isTank ? 0.48 : 0.54);

    // 1. Update 3D Floor Surface vertices & vertex colors
    for (var s = 0; s < S; s++) {
      var z = field.rowZ[s];
      var halfW = field.rowHalfW[s];
      var inCav = field.rowInCavity[s] === 1;
      var row = field.rows[s];
      var vRow = (isTank && field.velRows) ? field.velRows[s] : null;
      var depthFade = S > 1 ? (s / (S - 1)) : 1;

      for (var b = 0; b < B; b++) {
        var u = B > 1 ? (b / (B - 1)) : 0.5;
        var x = (u * 2 - 1) * halfW;
        var y = row[b] * yScale;
        var vi = (s * B + b) * 3;
        floorSurfPos[vi]     = x;
        floorSurfPos[vi + 1] = y;
        floorSurfPos[vi + 2] = z;

        var invD = 1 / Math.max(0.25, field.depth);
        var rgb = isSpec
          ? miniMetersRgb(u, row[b] * invD, harmor)
          : (isTank
            ? tankRgb(row[b] * invD, vRow ? (vRow[b] * invD) : 0, inCav, harmor)
            : wavetableRgb(row[b] * invD, inCav, depthFade, harmor));
        floorSurfCol[vi]     = rgb[0];
        floorSurfCol[vi + 1] = rgb[1];
        floorSurfCol[vi + 2] = rgb[2];
      }
    }
    floorSurfaceMesh.geometry.attributes.position.needsUpdate = true;
    floorSurfaceMesh.geometry.attributes.color.needsUpdate = true;

    // 2. Update wireframe ribs & spines
    var wp = 0;
    for (var rs = 0; rs < S; rs++) {
      for (var rb = 0; rb < B - 1; rb++) {
        var a0 = (rs * B + rb) * 3;
        var a1 = a0 + 3;
        floorWirePos[wp] = floorSurfPos[a0]; floorWirePos[wp + 1] = floorSurfPos[a0 + 1] + 0.002; floorWirePos[wp + 2] = floorSurfPos[a0 + 2];
        floorWireCol[wp] = Math.min(1, floorSurfCol[a0] * 1.25); floorWireCol[wp + 1] = Math.min(1, floorSurfCol[a0 + 1] * 1.25); floorWireCol[wp + 2] = Math.min(1, floorSurfCol[a0 + 2] * 1.25);
        wp += 3;
        floorWirePos[wp] = floorSurfPos[a1]; floorWirePos[wp + 1] = floorSurfPos[a1 + 1] + 0.002; floorWirePos[wp + 2] = floorSurfPos[a1 + 2];
        floorWireCol[wp] = Math.min(1, floorSurfCol[a1] * 1.25); floorWireCol[wp + 1] = Math.min(1, floorSurfCol[a1 + 1] * 1.25); floorWireCol[wp + 2] = Math.min(1, floorSurfCol[a1 + 2] * 1.25);
        wp += 3;
      }
    }
    for (var sb = 0; sb < B; sb += 6) {
      for (var ss = 0; ss < S - 1; ss++) {
        var c0 = (ss * B + sb) * 3;
        var c1 = ((ss + 1) * B + sb) * 3;
        floorWirePos[wp] = floorSurfPos[c0]; floorWirePos[wp + 1] = floorSurfPos[c0 + 1] + 0.002; floorWirePos[wp + 2] = floorSurfPos[c0 + 2];
        floorWireCol[wp] = floorSurfCol[c0]; floorWireCol[wp + 1] = floorSurfCol[c0 + 1]; floorWireCol[wp + 2] = floorSurfCol[c0 + 2];
        wp += 3;
        floorWirePos[wp] = floorSurfPos[c1]; floorWirePos[wp + 1] = floorSurfPos[c1 + 1] + 0.002; floorWirePos[wp + 2] = floorSurfPos[c1 + 2];
        floorWireCol[wp] = floorSurfCol[c1]; floorWireCol[wp + 1] = floorSurfCol[c1 + 1]; floorWireCol[wp + 2] = floorSurfCol[c1 + 2];
        wp += 3;
      }
    }
    floorWireLines.geometry.attributes.position.needsUpdate = true;
    floorWireLines.geometry.attributes.color.needsUpdate = true;

    // 3. Front luminous edge (s = S - 1)
    var frontRowStart = (S - 1) * B * 3;
    for (var fb = 0; fb < B; fb++) {
      var fi = frontRowStart + fb * 3;
      floorFrontPos[fb * 3]     = floorSurfPos[fi];
      floorFrontPos[fb * 3 + 1] = floorSurfPos[fi + 1] + 0.005;
      floorFrontPos[fb * 3 + 2] = floorSurfPos[fi + 2];
    }
    floorFrontLine.material.color.setHex(harmor ? 0x7affad : (isSpec ? 0x67e8f9 : 0xb8e8ff));
    floorFrontLine.geometry.attributes.position.needsUpdate = true;

    // 4. Active Slice / 2D EQ Center Plane
    var actZ = isSpec ? 0 : field.activeZ;
    var actHalfW = Math.sqrt(Math.max(0.01, field.rEff * field.rEff - actZ * actZ));
    var eqPeakScale = R * 0.78 * Math.min(1.2, field.depth + 0.25);

    for (var ab = 0; ab < B; ab++) {
      var au = B > 1 ? (ab / (B - 1)) : 0.5;
      var ax = (au * 2 - 1) * actHalfW;
      var ay = isSpec ? (field.eqCenter[ab] * eqPeakScale) : (field.activeSlice[ab] * yScale);
      floorActivePos[ab * 3]     = ax;
      floorActivePos[ab * 3 + 1] = ay + 0.008;
      floorActivePos[ab * 3 + 2] = actZ;

      if (isSpec) {
        var botVi = (ab * 2) * 3;
        var topVi = botVi + 3;
        var er = miniMetersRgb(au, field.eqCenter[ab], harmor);
        floorEqPos[botVi] = ax; floorEqPos[botVi + 1] = 0;  floorEqPos[botVi + 2] = 0;
        floorEqPos[topVi] = ax; floorEqPos[topVi + 1] = ay; floorEqPos[topVi + 2] = 0;
        floorEqCol[botVi] = er[0] * 0.35; floorEqCol[botVi + 1] = er[1] * 0.35; floorEqCol[botVi + 2] = er[2] * 0.45;
        floorEqCol[topVi] = Math.min(1, er[0] * 1.15); floorEqCol[topVi + 1] = Math.min(1, er[1] * 1.15); floorEqCol[topVi + 2] = Math.min(1, er[2] * 1.15);

        floorTiltPos[ab * 3]     = ax;
        floorTiltPos[ab * 3 + 1] = field.tiltLine[ab] * eqPeakScale * 0.85;
        floorTiltPos[ab * 3 + 2] = 0.006;
      }
    }
    floorActiveLine.material.color.setHex(isSpec ? (harmor ? 0x7affad : 0x67e8f9) : 0xffb84d);
    floorActiveLine.geometry.attributes.position.needsUpdate = true;

    floorEqCurtain.visible = isSpec;
    floorTiltLine.visible = isSpec;
    if (isSpec) {
      floorEqCurtain.geometry.attributes.position.needsUpdate = true;
      floorEqCurtain.geometry.attributes.color.needsUpdate = true;
      floorTiltLine.geometry.attributes.position.needsUpdate = true;
    }
  }

  function updateResonance(playT, state) {
    if (!resonanceGroup) return;
    var on = !!(state.toggles && state.toggles.resonanceMode);
    resonanceGroup.visible = on;
    if (!on || !Harmony.engine.sphereResonance) return;

    var res = Harmony.engine.sphereResonance(state, playT);
    var R = res.R, rIn = res.rIn;
    var harmor = !!(state.toggles && state.toggles.harmorVoid);
    var f = (state.f != null) ? state.f : 1;
    var ph = state.phaseRad || 0;
    var basePhase = Math.PI * 2 * f * (playT || 0) + ph;

    // 1. Coupled Radial Standing-Wave Breathing Pulse (l = 0, §3.1):
    //    Outer pulses at 1x, Inner pulses at alpha = R/r, Wall node pulses at beta = R/(R-r)
    var pulseAmp = 0.022;
    if (resModeOuterRing) {
      var sOut = R * (1 + pulseAmp * Math.cos(basePhase));
      resModeOuterRing.scale.set(sOut, 1, sOut);
    }
    if (resModeInnerRing) {
      resModeInnerRing.visible = res.cavityActive;
      if (res.cavityActive && res.stretchRatio) {
        var sIn = rIn * (1 + pulseAmp * Math.cos(basePhase * res.stretchRatio));
        resModeInnerRing.scale.set(Math.max(0.001, sIn), 1, Math.max(0.001, sIn));
      }
    }
    if (resModeWallRing) {
      resModeWallRing.visible = res.thickness > 0.01;
      if (res.thickness > 0.01 && res.wallRatio) {
        var rMid = 0.5 * (R + rIn);
        var sWall = rMid * (1 + pulseAmp * Math.cos(basePhase * res.wallRatio));
        resModeWallRing.scale.set(sWall, 1, sWall);
        resModeWallRing.material.color.setHex(res.syzygy.locked ? 0xffd166 : (harmor ? 0x39ff14 : 0x6ee7a0));
        resModeWallRing.material.opacity = res.syzygy.locked ? 0.92 : 0.55;
      }
    }
    if (resHalfPowerRing) {
      resHalfPowerRing.material.opacity = res.bowTouchesCavity ? 0.78 : 0.28;
      resHalfPowerRing.material.color.setHex(res.bowHalfPowerLock ? 0xffd166 : 0x9d8cff);
    }

    // 2. Archimedes Axial Slice Disc at z = res.slice.z (§3.3)
    var sl = res.slice;
    var rhoOut = Math.max(0.002, sl.rhoOut);
    var rhoIn = sl.inCavitySpan ? Math.max(0.001, sl.rhoIn) : 0.0005;
    var sliceKey = rhoIn.toFixed(3) + '|' + rhoOut.toFixed(3) + '|' + (sl.inCavitySpan ? 1 : 0) + '|' + (harmor ? 1 : 0);

    if (resSliceMesh && sliceKey !== lastResSliceKey) {
      lastResSliceKey = sliceKey;
      if (resSliceMesh.geometry) resSliceMesh.geometry.dispose();
      resSliceMesh.geometry = new THREE.RingGeometry(rhoIn, rhoOut, 64);
      // Inside [-r, +r], A_ring(z) = pi*(R^2 - r^2) is strictly constant (emerald/green plateau);
      // in the polar caps |z| > r, it tapers parabolically (cyan/gold cap)
      resSliceMesh.material.color.setHex(
        harmor ? (sl.inCavitySpan ? 0x00ff66 : 0x16a34a)
               : (sl.inCavitySpan ? 0x6ee7a0 : 0x36d6c8)
      );
      resSliceMesh.material.opacity = sl.inCavitySpan ? 0.26 : 0.16;
    }
    if (resSliceMesh) resSliceMesh.position.z = sl.z;

    var rho = (state.helicalTurbine && Harmony.engine.pollardRhoSlice)
      ? Harmony.engine.pollardRhoSlice(state, playT)
      : null;
    var hAng = rho ? rho.helixAngleRad : 0;

    if (resSliceMesh) resSliceMesh.rotation.z = hAng;
    if (resSliceOuterRim) {
      resSliceOuterRim.position.z = sl.z;
      resSliceOuterRim.scale.set(rhoOut, rhoOut, 1);
      resSliceOuterRim.rotation.z = hAng;
    }
    if (resSliceInnerRim) {
      resSliceInnerRim.visible = sl.inCavitySpan && sl.rhoIn > 0.005;
      resSliceInnerRim.position.z = sl.z;
      resSliceInnerRim.scale.set(Math.max(0.001, sl.rhoIn), Math.max(0.001, sl.rhoIn), 1);
      resSliceInnerRim.rotation.z = hAng;
    }
    if (resSliceSpokes) {
      var r0 = sl.inCavitySpan ? sl.rhoIn : 0;
      var ca = Math.cos(hAng), sa = Math.sin(hAng);
      var spPos = [
         r0 * ca,  r0 * sa, sl.z,   rhoOut * ca,  rhoOut * sa, sl.z,
        -r0 * ca, -r0 * sa, sl.z,  -rhoOut * ca, -rhoOut * sa, sl.z,
        -r0 * sa,  r0 * ca, sl.z,  -rhoOut * sa,  rhoOut * ca, sl.z,
         r0 * sa, -r0 * ca, sl.z,   rhoOut * sa, -rhoOut * ca, sl.z
      ];
      resSliceSpokes.geometry.setAttribute('position', new THREE.Float32BufferAttribute(spPos, 3));
      if (resSliceSpokes.material && resSliceSpokes.material.color) {
        resSliceSpokes.material.color.setHex(
          (rho && rho.locked) ? 0xffd166 : (harmor ? 0x00ff66 : 0x6ee7a0)
        );
      }
    }
  }

  // Build Four-Bit Orbit (1000 ↔ 0001 Palindrome, 1111/F Top Pole, 0000 Bottom Pole & Quadray Tetrahedron)
  function rebuildFourBit(state) {
    if (!fourBitGroup) return;
    clearGroup(fourBitGroup);

    var R = Math.max(0.1, state.r);
    var fb = Harmony.engine.fourBitOrbit(state, 0);
    var badgeScale = Math.max(0.22, R * 0.25);
    var smallScale = Math.max(0.18, R * 0.20);

    // 1. Equatorial XZ Ring (y = 0) & Meridian XY Ring (z = 0)
    fourBitGroup.add(makeCircleLoop(R, 96, 0xffb04d, 0.65, 'xz'));
    fourBitGroup.add(makeCircleLoop(R, 96, 0x4df3dd, 0.65, 'xy'));

    // 2. X-Axis Palindrome Diameter (1000 at -R <-> 0001 at +R) & Y-Axis Nibble Pole Axis (0000 <-> 1111/F)
    var axisLineGeo = new THREE.BufferGeometry();
    axisLineGeo.setAttribute('position', new THREE.Float32BufferAttribute([
      -R, 0, 0,  R, 0, 0,
       0, -R, 0, 0, R, 0
    ], 3));
    fourBitGroup.add(new THREE.LineSegments(axisLineGeo, new THREE.LineBasicMaterial({
      color: 0x6ee7a0, transparent: true, opacity: 0.52
    })));

    // 3. Cardinal X-Axis Labels: 1000 (8) on Left (-R) & 0001 (1) on Right (+R)
    // Matches the white 1000 / 0001 labels in both Front f(x) and Top XZ screenshots!
    var lbl1000 = makeBitSprite('1000', '8 · MSB (−R)', '#ffffff', '#4df3dd', badgeScale);
    lbl1000.position.set(-R * 1.20, 0, 0);
    fourBitGroup.add(lbl1000);

    var lbl0001 = makeBitSprite('0001', '1 · LSB (+R)', '#ffffff', '#ffb04d', badgeScale);
    lbl0001.position.set(R * 1.20, 0, 0);
    fourBitGroup.add(lbl0001);

    // 4. North Pole (+Y): 1111 / F (Max 4-bit Nibble = 15) & South Pole (-Y): 0000 / 0 (Min Nibble = 0)
    fbLblTop1111 = makeBitSprite('1111', '0xF · 15 TOP', '#ffffff', '#ffd166', badgeScale * 1.04);
    fbLblTop1111.position.set(0, R * 1.12, 0);
    fourBitGroup.add(fbLblTop1111);

    fbLblBot0000 = makeBitSprite('0000', '0x0 · 0 BOT', '#dce3ec', '#5aa9ff', badgeScale * 0.96);
    fbLblBot0000.position.set(0, -R * 1.12, 0);
    fourBitGroup.add(fbLblBot0000);

    // Companion inner nibble bit positions on XZ Equator: 0100 (4) and 0010 (2)
    fbLblBack0100 = makeBitSprite('0100', '4 · (−Z)', '#dce3ec', '#6ee7a0', smallScale);
    fbLblBack0100.position.set(0, 0, -R * 1.18);
    fourBitGroup.add(fbLblBack0100);

    fbLblFront0010 = makeBitSprite('0010', '2 · (+Z)', '#dce3ec', '#6ee7a0', smallScale);
    fbLblFront0010.position.set(0, 0, R * 1.18);
    fourBitGroup.add(fbLblFront0010);

    // 5. Inscribed Quadray Tetrahedron & Blue Basis Vectors from Origin (0,0,0,0)
    // Directly brings the QuadraysResearch.ipynb diagram inside the Ramanujan Sphere!
    quadrayGroup = new THREE.Group();
    var q = fb.quadray;
    var qVerts = [q.D_0001, q.A_1000, q.B_0100, q.C_0010];

    // Blue basis vectors from origin (0,0,0,0) -> (0,0,0,1), (1,0,0,0), (0,1,0,0), (0,0,1,0)
    var blueRayPos = [];
    for (var qi = 0; qi < qVerts.length; qi++) {
      var qv = qVerts[qi];
      blueRayPos.push(0, 0, 0, qv.x, qv.y, qv.z);
    }
    var blueRayGeo = new THREE.BufferGeometry();
    blueRayGeo.setAttribute('position', new THREE.Float32BufferAttribute(blueRayPos, 3));
    quadrayGroup.add(new THREE.LineSegments(blueRayGeo, new THREE.LineBasicMaterial({
      color: 0x3b82f6, transparent: true, opacity: 0.92
    })));

    // 6 Tetrahedral Edges connecting all 4 Quadray basis vertices
    var edgePairs = [
      [q.D_0001, q.A_1000], [q.D_0001, q.B_0100], [q.D_0001, q.C_0010],
      [q.A_1000, q.B_0100], [q.B_0100, q.C_0010], [q.C_0010, q.A_1000]
    ];
    var tetEdgePos = [];
    for (var ei = 0; ei < edgePairs.length; ei++) {
      var ea = edgePairs[ei][0], eb = edgePairs[ei][1];
      tetEdgePos.push(ea.x, ea.y, ea.z, eb.x, eb.y, eb.z);
    }
    var tetEdgeGeo = new THREE.BufferGeometry();
    tetEdgeGeo.setAttribute('position', new THREE.Float32BufferAttribute(tetEdgePos, 3));
    quadrayGroup.add(new THREE.LineSegments(tetEdgeGeo, new THREE.LineBasicMaterial({
      color: 0xe2e8f0, transparent: true, opacity: 0.68
    })));

    // Quadray Vertex Spheres & Tuple Labels: (0,0,0,1), (1,0,0,0), (0,1,0,0), (0,0,1,0)
    var qNodeGeo = new THREE.SphereGeometry(Math.max(0.02, R * 0.028), 14, 14);
    var qNodeMat = new THREE.MeshBasicMaterial({ color: 0x5aa9ff });
    for (var vi = 0; vi < qVerts.length; vi++) {
      var v = qVerts[vi];
      var qMesh = new THREE.Mesh(qNodeGeo, qNodeMat);
      qMesh.position.set(v.x, v.y, v.z);
      quadrayGroup.add(qMesh);

      var qSp = makeLabelSprite(v.label, '#8ec5ff', Math.max(0.15, R * 0.17));
      qSp.position.set(v.x * 1.08, v.y * 1.08 - R * 0.06, v.z * 1.08);
      quadrayGroup.add(qSp);
    }
    fourBitGroup.add(quadrayGroup);

    // 6. Dynamic Orbiting Nodes for 1000 (8) and 0001 (1) on both Meridian (XY) and Equator (XZ)
    var orbGeo = new THREE.SphereGeometry(Math.max(0.028, R * 0.038), 18, 18);
    var mat8 = new THREE.MeshBasicMaterial({ color: 0x4df3dd });
    var mat1 = new THREE.MeshBasicMaterial({ color: 0xffb04d });

    fbMerNode8 = new THREE.Mesh(orbGeo, mat8);
    fbMerNode1 = new THREE.Mesh(orbGeo, mat1);
    fbEqNode8  = new THREE.Mesh(orbGeo, mat8);
    fbEqNode1  = new THREE.Mesh(orbGeo, mat1);
    fourBitGroup.add(fbMerNode8, fbMerNode1, fbEqNode8, fbEqNode1);

    var orbBadgeScale = Math.max(0.18, R * 0.20);
    fbMerBadge8 = makeBitSprite('1000 (8)', 'f(x) Orbit', '#4df3dd', '#4df3dd', orbBadgeScale);
    fbMerBadge1 = makeBitSprite('0001 (1)', 'f(x) Orbit', '#ffd166', '#ffb04d', orbBadgeScale);
    fbEqBadge8  = makeBitSprite('1000 (8)', 'XZ Orbit', '#4df3dd', '#4df3dd', orbBadgeScale);
    fbEqBadge1  = makeBitSprite('0001 (1)', 'XZ Orbit', '#ffd166', '#ffb04d', orbBadgeScale);
    fourBitGroup.add(fbMerBadge8, fbMerBadge1, fbEqBadge8, fbEqBadge1);

    fbMerChord = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0x4df3dd, transparent: true, opacity: 0.65 })
    );
    fbEqChord = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0xffb04d, transparent: true, opacity: 0.65 })
    );
    fbBridgeLines = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0x9de8c0, transparent: true, opacity: 0.52 })
    );
    fourBitGroup.add(fbMerChord, fbEqChord, fbBridgeLines);
  }

  function updateFourBit(playT, state) {
    if (!fourBitGroup) return;
    var on = !!(state.toggles && state.toggles.fourBitOrbit);
    fourBitGroup.visible = on;
    if (!on) return;

    if (quadrayGroup) {
      quadrayGroup.visible = state.toggles.quadrayTetra !== false;
    }

    var fb = Harmony.engine.fourBitOrbit(state, playT);
    var R = fb.R;
    var m8 = fb.meridian8, m1 = fb.meridian1;
    var e8 = fb.equator8,  e1 = fb.equator1;
    var x8 = fb.real8,     x1 = fb.real1;

    // Camera-aware pole & badge placement so both Front f(x) and Top XZ views look crystal clear
    var camLen = Math.max(1e-4, camera.position.length());
    var camY = camera.position.y / camLen;
    var camZ = camera.position.z / camLen;
    var isTopView   = camY > 0.78;
    var isBotView   = camY < -0.78;
    var isFrontView = Math.abs(camZ) > 0.78 && Math.abs(camY) < 0.35;

    if (fbLblTop1111 && fbLblBot0000) {
      if (isTopView) {
        // In Top XZ view, center 1111/F right inside the sphere cavity (matching 4bitOrbitTop.png!)
        fbLblTop1111.position.set(0, R, 0);
        fbLblTop1111.visible = true;
        fbLblBot0000.visible = false;
      } else if (isBotView) {
        fbLblBot0000.position.set(0, -R, 0);
        fbLblBot0000.visible = true;
        fbLblTop1111.visible = false;
      } else {
        fbLblTop1111.position.set(0, R * 1.13, 0);
        fbLblBot0000.position.set(0, -R * 1.13, 0);
        fbLblTop1111.visible = true;
        fbLblBot0000.visible = true;
      }
    }

    if (fbLblBack0100 && fbLblFront0010) {
      var showEqBits = !isFrontView;
      fbLblBack0100.visible = showEqBits;
      fbLblFront0010.visible = showEqBits;
    }

    // Update Meridian (XY) and Equatorial (XZ) 8 <-> 1 harmonic orbiters
    if (fbMerNode8 && fbMerNode1 && fbEqNode8 && fbEqNode1) {
      fbMerNode8.position.set(m8.x, m8.y, m8.z);
      fbMerNode1.position.set(m1.x, m1.y, m1.z);
      fbEqNode8.position.set(e8.x, e8.y, e8.z);
      fbEqNode1.position.set(e1.x, e1.y, e1.z);

      var bOff = R * 0.14;
      fbMerBadge8.position.set(m8.x * 1.06, m8.y * 1.06 + (m8.y >= 0 ? bOff : -bOff), m8.z);
      fbMerBadge1.position.set(m1.x * 1.06, m1.y * 1.06 + (m1.y >= 0 ? bOff : -bOff), m1.z);
      fbEqBadge8.position.set(e8.x * 1.06, bOff * 0.65, e8.z * 1.08);
      fbEqBadge1.position.set(e1.x * 1.06, bOff * 0.65, e1.z * 1.08);

      // In Top XZ view, highlight the XZ equatorial orbit badges; in Front f(x) view, highlight the XY meridian badges
      fbMerBadge8.visible = !isTopView && !isBotView;
      fbMerBadge1.visible = !isTopView && !isBotView;
      fbEqBadge8.visible  = !isFrontView;
      fbEqBadge1.visible  = !isFrontView;

      fbMerChord.geometry.setFromPoints([
        new THREE.Vector3(m8.x, m8.y, m8.z),
        new THREE.Vector3(m1.x, m1.y, m1.z)
      ]);
      fbEqChord.geometry.setFromPoints([
        new THREE.Vector3(e8.x, e8.y, e8.z),
        new THREE.Vector3(e1.x, e1.y, e1.z)
      ]);

      // Harmonic phase bridges connecting Meridian (m8, m1) <-> Real X-Axis (x8, x1) <-> Equator (e8, e1)
      var brPos = [
        m8.x, m8.y, m8.z,  x8.x, x8.y, x8.z,
        x8.x, x8.y, x8.z,  e8.x, e8.y, e8.z,
        m8.x, m8.y, m8.z,  e8.x, e8.y, e8.z,
        m1.x, m1.y, m1.z,  x1.x, x1.y, x1.z,
        x1.x, x1.y, x1.z,  e1.x, e1.y, e1.z,
        m1.x, m1.y, m1.z,  e1.x, e1.y, e1.z
      ];
      fbBridgeLines.geometry.setAttribute('position', new THREE.Float32BufferAttribute(brPos, 3));
    }
  }

  function updateCurve(points, state) {
    if (!points || !points.length) {
      curveLine.geometry.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
      return;
    }
    var R = state.r, rIn = Math.min(state.rIn != null ? state.rIn : 0, R);
    var harmor = !!(state.toggles && state.toggles.harmorVoid);
    var pos = [], col = [];
    for (var i = 0; i < points.length - 1; i++) {
      var a = points[i], b = points[i + 1];
      if (!a.valid || !b.valid) continue;
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
      var ca = distColor(a.x, a.y, a.z, R, rIn, harmor);
      var cb = distColor(b.x, b.y, b.z, R, rIn, harmor);
      col.push(ca[0], ca[1], ca[2], cb[0], cb[1], cb[2]);
    }
    curveLine.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    curveLine.geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    curveLine.geometry.computeBoundingSphere();
  }

  function updateTwins(points, state) {
    var mode = state.twinMode || 'both';
    var showAnti = (mode === 'antipodal' || mode === 'both');
    var showConj = (mode === 'conjugate' || mode === 'both');
    var showReal = showConj && (state.toggles.realTrace !== false);

    antipodalLine.visible = showAnti;
    conjugateLine.visible = showConj;
    realTraceLine.visible = showReal;

    if (!points || !points.length) return;

    if (showAnti) {
      var posA = [];
      for (var i = 0; i < points.length - 1; i++) {
        var a = points[i], b = points[i + 1];
        if (!a.valid || !b.valid) continue;
        posA.push(-a.x, -a.y, -a.z, -b.x, -b.y, -b.z);
      }
      antipodalLine.geometry.setAttribute('position', new THREE.Float32BufferAttribute(posA, 3));
      antipodalLine.geometry.computeBoundingSphere();
    }

    if (showConj) {
      var posC = [], posR = [];
      for (var j = 0; j < points.length - 1; j++) {
        var p1 = points[j], p2 = points[j + 1];
        if (!p1.valid || !p2.valid) continue;
        posC.push(p1.x, -p1.y, p1.z, p2.x, -p2.y, p2.z);
        if (showReal) {
          posR.push(p1.x, 0, p1.z, p2.x, 0, p2.z);
        }
      }
      conjugateLine.geometry.setAttribute('position', new THREE.Float32BufferAttribute(posC, 3));
      conjugateLine.geometry.computeBoundingSphere();
      if (showReal) {
        realTraceLine.geometry.setAttribute('position', new THREE.Float32BufferAttribute(posR, 3));
        realTraceLine.geometry.computeBoundingSphere();
      }
    }
  }

  function updateGhost(state) {
    if (!ghostLine) return;
    var gp = state.ghostPoints;
    var on = !!(state.toggles && state.toggles.ghostRef && gp && gp.length > 1);
    ghostLine.visible = on;
    if (!on) return;
    var pos = [];
    for (var i = 0; i < gp.length - 1; i++) {
      var a = gp[i], b = gp[i + 1];
      if (!a.valid || !b.valid) continue;
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
    ghostLine.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    ghostLine.geometry.computeBoundingSphere();
  }

  // Render Discrete Order N Cyclic Group Strobe (nodes P_0..P_{N-1} + generator chords)
  function updateStrobe(points, state) {
    if (!strobeGroup) return;
    while (strobeGroup.children.length) {
      var ch = strobeGroup.children[0];
      strobeGroup.remove(ch);
      if (ch.geometry && ch.geometry !== strobeNodeGeo) ch.geometry.dispose();
    }

    var on = !!(state.toggles && state.toggles.strobeN);
    strobeGroup.visible = on;
    if (curveLine && curveLine.material) {
      curveLine.material.opacity = on ? 0.36 : 1.0;
    }
    if (!on) return;

    var dg = Harmony.engine.discreteGroup(state, points);
    var nodes = dg.nodes;
    var nodeScale = Math.max(0.65, Math.min(1.5, state.r * 0.95));

    // Generator hop chords: P_{orbit[i]} -> P_{orbit[i+1]}
    var chordPos = [];
    for (var s = 0; s < dg.orbit.length - 1; s++) {
      var nA = nodes[dg.orbit[s]];
      var nB = nodes[dg.orbit[s + 1]];
      if (nA && nB && nA.valid && nB.valid) {
        chordPos.push(nA.x, nA.y, nA.z, nB.x, nB.y, nB.z);
      }
    }
    if (chordPos.length) {
      var chordGeo = new THREE.BufferGeometry();
      chordGeo.setAttribute('position', new THREE.Float32BufferAttribute(chordPos, 3));
      strobeGroup.add(new THREE.LineSegments(chordGeo, new THREE.LineBasicMaterial({
        color: 0x4df3dd, transparent: true, opacity: 0.55
      })));
    }

    // Discrete cyclic group nodes
    for (var j = 0; j < nodes.length; j++) {
      var nd = nodes[j];
      if (!nd.valid) continue;
      var mat = (j === 0) ? strobeMatIdent : (nd.inSubgroup ? strobeMatActive : strobeMatCoset);
      var m = new THREE.Mesh(strobeNodeGeo, mat);
      m.position.set(nd.x, nd.y, nd.z);
      var sc = (j === 0) ? nodeScale * 1.35 : (nd.inSubgroup ? nodeScale : nodeScale * 0.75);
      m.scale.set(sc, sc, sc);
      strobeGroup.add(m);
    }
  }

  function updatePlayhead(points, playT, state) {
    var ph = Harmony.engine.playhead(state, points, playT);
    var p = ph.point;
    window.__scene3dPoint = p ? { x: p.x, y: p.y, z: p.z } : null;

    var mode = state.twinMode || 'both';
    var showAnti = (mode === 'antipodal' || mode === 'both');
    var showConj = (mode === 'conjugate' || mode === 'both');
    var showReal = showConj && (state.toggles.realTrace !== false);

    if (p) {
      marker.position.set(p.x, p.y, p.z);
      marker.visible = true;

      antipodalMarker.visible = showAnti;
      if (showAnti && ph.antipodal) {
        antipodalMarker.position.set(ph.antipodal.x, ph.antipodal.y, ph.antipodal.z);
      }

      conjugateMarker.visible = showConj;
      if (showConj && ph.conjugate) {
        conjugateMarker.position.set(ph.conjugate.x, ph.conjugate.y, ph.conjugate.z);
        conjugateChordLine.visible = true;
        conjugateChordLine.geometry.setFromPoints([
          new THREE.Vector3(p.x, p.y, p.z),
          new THREE.Vector3(ph.conjugate.x, ph.conjugate.y, ph.conjugate.z)
        ]);
      } else {
        conjugateChordLine.visible = false;
      }

      realTraceMarker.visible = showReal;
      if (showReal && ph.realTrace) {
        realTraceMarker.position.set(ph.realTrace.x, ph.realTrace.y, ph.realTrace.z);
      }

      if (state.toggles.radiusVec) {
        vectorLine.visible = true;
        vectorLine.geometry.setFromPoints([
          new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(p.x, p.y, p.z)
        ]);
      } else {
        vectorLine.visible = false;
      }
    } else {
      marker.visible = false;
      antipodalMarker.visible = false;
      conjugateMarker.visible = false;
      realTraceMarker.visible = false;
      vectorLine.visible = false;
      conjugateChordLine.visible = false;
    }

    // Magnifier target ring on the 3D curve (matches Weierstrass red zoom callout!)
    if (state.toggles.magnifier && Harmony.Magnifier2D) {
      var focusPt = Harmony.Magnifier2D.focusPoint(state, playT);
      if (focusPt && focusPt.valid) {
        magTargetRing.position.set(focusPt.x, focusPt.y, focusPt.z);
        var ringScale = Math.max(0.4, state.r * 0.9);
        magTargetRing.scale.set(ringScale, ringScale, ringScale);
        magTargetRing.visible = true;
      } else {
        magTargetRing.visible = false;
      }
    } else {
      magTargetRing.visible = false;
    }
  }

  function setCameraView(viewName, state) {
    if (!camera || !controls) return;
    var R = Math.max(0.8, state.r);
    controls.target.set(0, 0, 0);
    if (viewName === 'front') {
      state.toggles.autoRotate = false;
      camera.position.set(0, 0, R * 2.75);
    } else if (viewName === 'top') {
      state.toggles.autoRotate = false;
      camera.position.set(0, R * 2.95, 0.001);
    } else {
      camera.position.set(R * 2.45, R * 1.6, R * 2.75);
    }
    controls.update();
    cameraMoved = true;
  }

  function onResize() {
    if (!container || !renderer) return;
    var w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    cameraMoved = true;
  }

  function update(state, playT, points, dirty, floorFieldData) {
    if (!renderer) return;
    var rInVal = state.rIn != null ? state.rIn : 0;
    var sphereSig = [
      state.r.toFixed(3),
      rInVal.toFixed(3),
      state.toggles.cutaway ? 1 : 0,
      state.toggles.surface ? 1 : 0,
      state.toggles.wireframe ? 1 : 0,
      state.toggles.harmorVoid ? 1 : 0
    ].join('|');

    var lam = (state && typeof state.collapseLambda === 'number') ? Math.max(0, Math.min(1, state.collapseLambda)) : 0;
    var kap = (state && typeof state.attractKappa === 'number') ? Math.max(0, Math.min(1, state.attractKappa)) : 0;
    var collapseActive = (lam > 1e-4 || kap > 1e-4) && Harmony.engine && typeof Harmony.engine.cavityCollapseProfile === 'function';
    var activeBwHex = '8ADEFEDA85210125';
    if (collapseActive && Harmony.BitWaveFeed && typeof Harmony.BitWaveFeed.getFeed === 'function') {
      var bwFd = Harmony.BitWaveFeed.getFeed();
      if (bwFd && bwFd.active && bwFd.activeHex) activeBwHex = bwFd.activeHex;
    }
    var collapseSig = collapseActive ? (lam.toFixed(3) + '|' + kap.toFixed(3) + '|' + activeBwHex) : '0';

    var dirtyDidChange = (dirty !== lastRendered) || (sphereSig !== lastSphereSig) || (collapseSig !== lastCollapseSig);
    if (dirtyDidChange) {
      if (sphereSig !== lastSphereSig) {
        rebuildVesselAndSlice(state);
        lastSphereSig = sphereSig;
      }
      if (sphereGroup) {
        var zFlat = collapseActive ? Math.max(0.003, 1 - lam) : 1;
        sphereGroup.scale.set(1, 1, zFlat);
        var fadeMul = collapseActive ? Math.max(0.04, 1 - lam * 0.90) : 1;
        for (var fi = 0; fi < sphereGroup.children.length; fi++) {
          var fch = sphereGroup.children[fi];
          if (fch && fch.material && typeof fch.userData.baseOpacity === 'number') {
            fch.material.opacity = fch.userData.baseOpacity * fadeMul;
          }
        }
      }
      var renderPoints = points;
      if (collapseActive) {
        var colProf = Harmony.engine.cavityCollapseProfile(state, {
          hex: activeBwHex,
          lambda: lam,
          kappa: kap,
          bins: 256
        });
        state._lastCollapseProfile = colProf;
        var colPts = new Array(colProf.bins);
        for (var ci = 0; ci < colProf.bins; ci++) {
          colPts[ci] = { x: colProf.outX[ci], y: colProf.outY[ci], z: colProf.outZ[ci], valid: true };
        }
        renderPoints = colPts;
      } else {
        state._lastCollapseProfile = null;
      }
      updateCurve(renderPoints, state);
      updateTwins(renderPoints, state);
      updateGhost(state);
      updateStrobe(points, state);
      lastRendered = dirty;
      lastCollapseSig = collapseSig;
    }

    if (sliceGroup) sliceGroup.visible = state.toggles.sliceGrid !== false;
    if (gridHelper) gridHelper.visible = !!state.toggles.grid;
    if (axesHelper) axesHelper.visible = !!state.toggles.axes;
    controls.autoRotate = !!state.toggles.autoRotate;

    updatePlayhead(points, playT, state);
    updateFourBit(playT, state);
    updateResonance(playT, state);
    updateFloorWt(playT, state, floorFieldData);
    controls.update();

    var resActive = !!(state.toggles.resonanceMode || state.toggles.floorWt);
    if (state.toggles.autoRotate || state.toggles.animate || resActive || dirtyDidChange || cameraMoved) {
      renderer.render(scene, camera);
      cameraMoved = false;
    }
  }

  window.Harmony.Scene3D = {
    init: init,
    update: update,
    setCameraView: setCameraView,
    resize: onResize
  };
})();
