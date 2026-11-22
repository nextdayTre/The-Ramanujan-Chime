/* ===== Harmony.BitWaveFeed — Read-Only BitWave Register Feed & Monotone-Cubic Spline =====
   Zero-build classic script (browser + Node dual-export).
   Strictly read-only display & modulation sink for BitWave registers:
     - Parses full .bitwave.json documents & #bw= share links via Harmony.BitWaveImport
     - Parses bare hex registers (e.g. 8ADEFEDA85210125 or 256-bit A000...000A)
     - Accepts structured live payloads over BroadcastChannel('bitwave-feed') and postMessage
     - Provides Fritsch-Carlson cyclic monotone-cubic interpolation centered on nibble 0x8 (1000_2)
       for the 2D BitWave scope, 3D Cutaway Floor surface, MiniMeters 3D FFT, and 5 · Mod & Logic LFO tap.
   Starts dormant (active = false) on mount so default state & agent snapshots stay 100% untouched. */
(function (root) {
  'use strict';

  var Harmony = root.Harmony = root.Harmony || {};
  var BitWaveImport = Harmony.BitWaveImport || null;
  if (!BitWaveImport && typeof require === 'function') {
    try { BitWaveImport = require('./bitwave-import.js'); } catch (e) { /* optional */ }
  }

  var OP_SYMBOLS = {
    and: '\u2227', // ∧
    or: '\u2228',  // ∨
    xor: '\u2295', // ⊕
    add: '+',
    sub: '\u2212', // −
    raw: '\u2192'  // →
  };

  // ---- Canonical Built-In Starter Projects (for instant 1-click auditioning) ----
  var CANONICAL_64_DOC = {
    schema: 3,
    app: 'bitwave',
    savedAt: '2026-11-09T00:00:00.000Z',
    N: 64,
    view: { lane: '1', view3d: false, split3d: false, splitPair: ['1', '2'], activePane: 0, lfoMode: 'rotcw', lfoRate: 4 },
    lanes: {
      '1': { a: '8ADEFEDA85210125', b: 'FFFFFFFF00000000', showB: true, binop: 'xor', edit: 'a', seededB: false, lfoB: '0', colA: -1, colB: -1, focus: 'z', frameVis: { a: true, b: true, z: true } },
      '2': { a: '0123456789ABCDEF', b: 'FEDCBA9876543210', showB: true, binop: 'xor', edit: 'a', seededB: true, lfoB: '0', colA: -1, colB: -1, focus: 'a', frameVis: { a: true, b: true, z: true } },
      '3': { a: 'F0F0F0F0F0F0F0F0', b: '0F0F0F0F0F0F0F0F', showB: false, binop: 'and', edit: 'b', seededB: true, lfoB: '0', colA: -1, colB: -1, focus: 'z', frameVis: { a: true, b: true, z: true } }
    },
    routes: [],
    parked: {}
  };

  function repeatStr(ch, count) {
    var s = '';
    for (var i = 0; i < count; i++) s += ch;
    return s;
  }

  var PULSE_256_A = 'A' + repeatStr('0', 62) + 'A';
  var PULSE_256_B = '5' + repeatStr('0', 62) + 'A';
  var PULSE_256_DOC = {
    schema: 3,
    app: 'bitwave',
    savedAt: '2026-11-22T00:00:00.000Z',
    N: 256,
    view: { lane: '1', view3d: false, split3d: false, splitPair: ['1', '2'], activePane: 0, lfoMode: 'rotcw', lfoRate: 4 },
    lanes: {
      '1': { a: PULSE_256_A, b: PULSE_256_B, showB: true, binop: 'xor', edit: 'b', seededB: true, lfoB: '0', colA: -1, colB: -1, focus: 'z', frameVis: { a: true, b: true, z: true } },
      '2': { a: '89BCDEFEDCB9865321001235689BCDEFEDCB9865321001235689BCDEFEDCB986', b: 'FEDCBA98765432100123456789ABCDEFFEDCBA98765432100123456789ABCDEF', showB: true, binop: 'xor', edit: 'a', seededB: true, lfoB: '0', colA: -1, colB: -1, focus: 'z', frameVis: { a: true, b: true, z: true } },
      '3': { a: '8888FFFF888800008888FFFF888800008888FFFF888800008888FFFF88880000', b: '0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F', showB: true, binop: 'add', edit: 'a', seededB: true, lfoB: '0', colA: -1, colB: -1, focus: 'z', frameVis: { a: true, b: true, z: true } }
    },
    routes: [],
    parked: {}
  };

  // Default fallback nibbles for ModMatrix tap_bitwave when no custom feed is loaded yet
  var DEFAULT_LFO_NIBBLES = [8, 10, 13, 14, 15, 14, 13, 10, 8, 5, 2, 1, 0, 1, 2, 5];

  function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  }

  function nibblesFromHex(hexStr) {
    var clean = String(hexStr || '').trim().replace(/^0[xX]/, '').replace(/[\s_-]+/g, '').toUpperCase();
    if (!clean || !/^[0-9A-F]+$/.test(clean)) return null;
    var out = new Array(clean.length);
    for (var i = 0; i < clean.length; i++) {
      out[i] = parseInt(clean.charAt(i), 16);
    }
    return { hex: clean, nibbles: out };
  }

  function hexFromNibbles(nibbles) {
    var s = '';
    for (var i = 0; i < nibbles.length; i++) {
      s += clamp(Math.round(nibbles[i] || 0), 0, 15).toString(16).toUpperCase();
    }
    return s;
  }

  function popcountNibbles(nibbles) {
    var pop = 0;
    var lut = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];
    for (var i = 0; i < nibbles.length; i++) {
      pop += lut[clamp(Math.round(nibbles[i] || 0), 0, 15)];
    }
    return pop;
  }

  function combineNibbles(a, b, op) {
    var n = Math.max(a.length, b.length);
    var out = new Array(n);
    var carry = 0;
    if (op === 'add' || op === 'sub') {
      for (var j = n - 1; j >= 0; j--) {
        var va = a[j % a.length] || 0;
        var vb = b[j % b.length] || 0;
        if (op === 'add') {
          var sum = va + vb + carry;
          out[j] = sum & 0xF;
          carry = sum >> 4;
        } else {
          var diff = va - vb - carry;
          if (diff < 0) { out[j] = (diff + 16) & 0xF; carry = 1; }
          else { out[j] = diff & 0xF; carry = 0; }
        }
      }
      return out;
    }
    for (var i = 0; i < n; i++) {
      var xa = a[i % a.length] || 0;
      var xb = b[i % b.length] || 0;
      if (op === 'and') out[i] = xa & xb;
      else if (op === 'or') out[i] = xa | xb;
      else if (op === 'xor') out[i] = xa ^ xb;
      else out[i] = xa;
    }
    return out;
  }

  // ---- Cyclic Fritsch-Carlson Monotone-Cubic Interpolation ----
  // Evaluates a nibble array [0..15] smoothly at normalized phase u in [0, 1).
  // Guarantees no overshoot past adjacent knots and exact passage through every nibble.
  function computeCyclicSlopes(y) {
    var n = y.length;
    var m = new Float64Array(n);
    if (n < 2) return m;
    var d = new Float64Array(n);
    for (var i = 0; i < n; i++) {
      d[i] = y[(i + 1) % n] - y[i];
    }
    for (var j = 0; j < n; j++) {
      var dPrev = d[(j - 1 + n) % n];
      var dNext = d[j];
      if (dPrev * dNext <= 0) {
        m[j] = 0;
      } else {
        // Harmonic mean keeps the cubic strictly monotonic between knots
        m[j] = (2 * dPrev * dNext) / (dPrev + dNext);
      }
    }
    return m;
  }

  function sampleMonotoneRaw(nibbles, u, cachedSlopes) {
    if (!nibbles || !nibbles.length) return 8;
    var n = nibbles.length;
    if (n === 1) return clamp(nibbles[0], 0, 15);
    var uu = ((u % 1) + 1) % 1;
    var pos = uu * n;
    var i0 = Math.floor(pos) % n;
    var i1 = (i0 + 1) % n;
    var t = pos - Math.floor(pos);
    if (t <= 1e-9) return nibbles[i0];

    var slopes = cachedSlopes || computeCyclicSlopes(nibbles);
    var t2 = t * t;
    var t3 = t2 * t;
    var h00 = 2 * t3 - 3 * t2 + 1;
    var h10 = t3 - 2 * t2 + t;
    var h01 = -2 * t3 + 3 * t2;
    var h11 = t3 - t2;

    var val = h00 * nibbles[i0] + h10 * slopes[i0] + h01 * nibbles[i1] + h11 * slopes[i1];
    return clamp(val, 0, 15);
  }

  // Normalized bipolar [-1, +0.875] centered exactly on nibble 0x8 (1000_2 = 0.0)
  function sampleMonotone(nibbles, u, cachedSlopes) {
    return (sampleMonotoneRaw(nibbles, u, cachedSlopes) - 8) / 8;
  }

  function sampleMonotoneArray(nibbles, count, phaseShift) {
    var out = new Float32Array(count);
    if (!nibbles || !nibbles.length) return out;
    var slopes = computeCyclicSlopes(nibbles);
    var shift = phaseShift || 0;
    for (var i = 0; i < count; i++) {
      var u = count > 1 ? (i / count) + shift : shift;
      out[i] = Math.fround(sampleMonotone(nibbles, u, slopes));
    }
    return out;
  }

  // Upsample a nibble register cyclically into a PCM Float32Array for Engine.fftMag()
  function toPcmCycle(nibbles, length, cycles, phaseShift) {
    var N = length || 512;
    var cyc = cycles || 4;
    var out = new Float32Array(N);
    if (!nibbles || !nibbles.length) return out;
    var slopes = computeCyclicSlopes(nibbles);
    var shift = phaseShift || 0;
    for (var i = 0; i < N; i++) {
      var u = (i / N) * cyc + shift;
      out[i] = sampleMonotone(nibbles, u, slopes);
    }
    return out;
  }

  // ---- Convert BitWaveImport result or bare hex / payload into a normalized feed snapshot ----
  function snapshotFromImport(res, transport, labelOverride) {
    var lanes = {};
    for (var i = 0; i < res.lanes.length; i++) {
      var ln = res.lanes[i];
      var key = String(ln.id);
      lanes[key] = {
        id: key,
        op: ln.op,
        opSymbol: ln.opSymbol || OP_SYMBOLS[ln.op] || '\u2295',
        labels: ln.labels,
        focus: ln.focus || 'z',
        frames: {
          a: { label: ln.frames.a.label, hex: ln.frames.a.hex, nibbles: ln.frames.a.nibbles.slice(), popcount: ln.frames.a.popcount },
          b: { label: ln.frames.b.label, hex: ln.frames.b.hex, nibbles: ln.frames.b.nibbles.slice(), popcount: ln.frames.b.popcount },
          z: { label: ln.frames.z.label, hex: ln.frames.z.hex, nibbles: ln.frames.z.nibbles.slice(), popcount: ln.frames.z.popcount }
        }
      };
    }
    var laneKey = res.focus ? String(res.focus.lane) : '1';
    if (!lanes[laneKey]) laneKey = '1';
    var frameKey = (res.focus && (res.focus.frame === 'a' || res.focus.frame === 'b' || res.focus.frame === 'z'))
      ? res.focus.frame
      : 'z';
    return {
      width: res.width,
      nibbleCount: res.width / 4,
      lanes: lanes,
      laneKeys: ['1', '2', '3'],
      defaultLane: laneKey,
      defaultFrame: frameKey,
      source: transport || (res.provenance && res.provenance.source) || 'import',
      name: labelOverride || (res.provenance && res.provenance.name) || ('BitWave ' + res.width + 'b'),
      warnings: (res.warnings || []).slice()
    };
  }

  function snapshotFromRegisters(nibA, nibB, op, transport, name) {
    var a = nibA.slice();
    var hasB = !!(nibB && nibB.length);
    var b = hasB ? nibB.slice() : a.slice();
    var effOp = hasB ? (op || 'xor') : 'raw';
    var z = hasB ? combineNibbles(a, b, effOp) : a.slice();
    var width = a.length * 4;
    var lane1 = {
      id: '1',
      op: effOp,
      opSymbol: OP_SYMBOLS[effOp] || '\u2295',
      labels: { a: 'A', b: 'B', z: 'Z1' },
      focus: hasB ? 'z' : 'a',
      frames: {
        a: { label: 'A', hex: hexFromNibbles(a), nibbles: a, popcount: popcountNibbles(a) },
        b: { label: 'B', hex: hexFromNibbles(b), nibbles: b, popcount: popcountNibbles(b) },
        z: { label: 'Z1', hex: hexFromNibbles(z), nibbles: z, popcount: popcountNibbles(z) }
      }
    };
    return {
      width: width,
      nibbleCount: a.length,
      lanes: { '1': lane1 },
      laneKeys: ['1'],
      defaultLane: '1',
      defaultFrame: hasB ? 'z' : 'a',
      source: transport || 'hex',
      name: name || ('Hex ' + width + 'b'),
      warnings: []
    };
  }

  var BINOP_ORDER = ['and', 'or', 'xor', 'add', 'sub'];
  var FRAME_ORDER = ['a', 'b', 'z'];
  var B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

  function laneLabelsFor(laneNum) {
    var k = Math.max(1, Math.min(13, laneNum | 0));
    return {
      a: String.fromCharCode(65 + (k - 1) * 2),
      b: String.fromCharCode(66 + (k - 1) * 2),
      z: 'Z' + k
    };
  }

  function decodeBase64UrlBytes(str) {
    if (typeof str !== 'string' || !str.length || str.length % 4 === 1) return null;
    var out = new Uint8Array(Math.floor((str.length * 3) / 4));
    var acc = 0, bits = 0, written = 0;
    for (var i = 0; i < str.length; i++) {
      var v = B64URL.indexOf(str.charAt(i));
      if (v < 0) return null;
      acc = (acc << 6) | v;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        out[written++] = (acc >> bits) & 0xff;
      }
    }
    return out;
  }

  function decodeUtf8Bytes(bytes) {
    if (!bytes) return null;
    if (typeof TextDecoder === 'function') {
      try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch (e) { return null; }
    }
    var out = '';
    for (var i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
    return out;
  }

  function hexFromCompactWord(b64Word, N) {
    var bytes = decodeBase64UrlBytes(b64Word);
    if (!bytes || bytes.length !== N / 8) return null;
    var hex = '';
    for (var i = 0; i < bytes.length; i++) {
      hex += bytes[i].toString(16).padStart(2, '0');
    }
    return hex.toUpperCase();
  }

  function fitHexToWidth(hexStr, N) {
    var nibs = N / 4;
    var clean = String(hexStr || '').trim().replace(/^0[xX]/, '').replace(/[\s_-]+/g, '').toUpperCase();
    if (!/^[0-9A-F]*$/.test(clean)) return null;
    if (clean.length > nibs) clean = clean.slice(clean.length - nibs);
    while (clean.length < nibs) clean = '0' + clean;
    var arr = new Array(nibs);
    for (var i = 0; i < nibs; i++) arr[i] = parseInt(clean.charAt(i), 16);
    return { hex: clean, nibbles: arr };
  }

  // Decode BitWave schema-4 compact D45 share array: [tag, N, view, lanes, routes, parked, dataset?, x?]
  function expandCompactShareArray(arr) {
    if (!Array.isArray(arr) || arr.length < 4) return null;
    var tag = arr[0];
    var N = arr[1];
    if (typeof tag !== 'number' || typeof N !== 'number' || N < 8 || N > 256 || N % 8 !== 0) return null;
    var rawView = Array.isArray(arr[2]) ? arr[2] : [1];
    var rawLanes = arr[3];
    if (!Array.isArray(rawLanes) || !rawLanes.length) return null;

    var lanesObj = {};
    for (var i = 0; i < rawLanes.length; i++) {
      var tuple = rawLanes[i];
      if (!Array.isArray(tuple) || tuple.length < 5) return null;
      var laneNum = tuple[0];
      if (typeof laneNum !== 'number' || laneNum < 1 || laneNum > 13) return null;
      var hexA = hexFromCompactWord(tuple[1], N);
      var hexB = hexFromCompactWord(tuple[2], N);
      if (!hexA || !hexB) return null;
      var opIdx = tuple[4];
      var binop = (typeof opIdx === 'number' && BINOP_ORDER[opIdx]) ? BINOP_ORDER[opIdx] : 'xor';
      var focusIdx = tuple.length > 10 ? tuple[10] : 0;
      var focus = (typeof focusIdx === 'number' && FRAME_ORDER[focusIdx]) ? FRAME_ORDER[focusIdx] : 'a';
      lanesObj[String(laneNum)] = {
        a: hexA,
        b: hexB,
        binop: binop,
        focus: focus
      };
    }
    return {
      schema: tag,
      app: 'bitwave',
      N: N,
      view: { lane: String(rawView[0] || 1) },
      lanes: lanesObj
    };
  }

  // Convert any BitWave schema 1-4 document object (including 1..8 dynamic lanes) to a normalized feed snapshot
  function snapshotFromProjectDoc(doc, transport, labelOverride) {
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return null;
    var N = doc.N;
    if (typeof N !== 'number' || N < 8 || N > 256 || N % 8 !== 0) return null;
    if (!doc.lanes || typeof doc.lanes !== 'object') return null;

    var rawKeys = Object.keys(doc.lanes)
      .filter(function (k) { var n = Number(k); return Number.isInteger(n) && n >= 1 && n <= 13; })
      .sort(function (a, b) { return Number(a) - Number(b); });
    if (!rawKeys.length) return null;

    var lanes = {};
    for (var i = 0; i < rawKeys.length; i++) {
      var key = rawKeys[i];
      var raw = doc.lanes[key];
      if (!raw || typeof raw !== 'object') continue;
      var fa = fitHexToWidth(raw.a, N);
      var fb = fitHexToWidth(raw.b, N);
      if (!fa || !fb) return null;
      var op = BINOP_ORDER.indexOf(raw.binop) >= 0 ? raw.binop : 'xor';
      var zNib = combineNibbles(fa.nibbles, fb.nibbles, op);
      var labels = laneLabelsFor(Number(key));
      var focus = (raw.focus === 'a' || raw.focus === 'b' || raw.focus === 'z') ? raw.focus : 'z';
      lanes[key] = {
        id: key,
        op: op,
        opSymbol: OP_SYMBOLS[op] || '\u2295',
        labels: labels,
        focus: focus,
        frames: {
          a: { label: labels.a, hex: fa.hex, nibbles: fa.nibbles, popcount: popcountNibbles(fa.nibbles) },
          b: { label: labels.b, hex: fb.hex, nibbles: fb.nibbles, popcount: popcountNibbles(fb.nibbles) },
          z: { label: labels.z, hex: hexFromNibbles(zNib), nibbles: zNib, popcount: popcountNibbles(zNib) }
        }
      };
    }

    var laneKeys = Object.keys(lanes).sort(function (a, b) { return Number(a) - Number(b); });
    if (!laneKeys.length) return null;
    var viewLane = (doc.view && doc.view.lane != null) ? String(doc.view.lane) : laneKeys[0];
    if (!lanes[viewLane]) viewLane = laneKeys[0];
    var focusFrame = lanes[viewLane].focus || 'z';
    return {
      width: N,
      nibbleCount: N / 4,
      lanes: lanes,
      laneKeys: laneKeys,
      defaultLane: viewLane,
      defaultFrame: focusFrame,
      source: transport || 'link',
      name: labelOverride || ('BitWave ' + N + 'b'),
      warnings: []
    };
  }

  function extractSharePayload(text) {
    var t = String(text || '').trim().replace(/^["'<]+|["'>]+$/g, '').trim();
    var payload = '';
    var hashAt = t.indexOf('#bw=');
    if (hashAt >= 0) {
      payload = t.slice(hashAt + 4);
    } else if (t.slice(0, 3) === 'bw=') {
      payload = t.slice(3);
    } else if (/^[A-Za-z0-9_-]{12,}$/.test(t) && !isBareHexString(t)) {
      payload = t;
    } else {
      return null;
    }
    // Strip any trailing whitespace or secondary fragment/query noise
    payload = payload.split(/[\s&#?]/)[0];
    return payload || null;
  }

  function isBareHexString(text) {
    if (typeof text !== 'string') return false;
    var t = text.trim();
    if (!t || t.indexOf('#bw=') >= 0 || t.slice(0, 3) === 'bw=' || t.charAt(0) === '{' || t.charAt(0) === '[') {
      return false;
    }
    var clean = t.replace(/^0[xX]/, '').replace(/[\s_-]+/g, '');
    return clean.length >= 2 && clean.length <= 64 && /^[0-9a-fA-F]+$/.test(clean);
  }

  function parseInput(input, opts) {
    opts = opts || {};
    var transport = opts.transport || 'paste';
    var name = opts.name || '';

    if (input == null || input === '') {
      return { ok: false, error: 'Empty BitWave feed input' };
    }

    // 1. Bare hex register string (e.g. "8ADEFEDA85210125" or "A000...000A")
    if (typeof input === 'string' && isBareHexString(input)) {
      var parsedHex = nibblesFromHex(input);
      if (!parsedHex) return { ok: false, error: 'Invalid hex register' };
      return {
        ok: true,
        snapshot: snapshotFromRegisters(parsedHex.nibbles, null, 'raw', transport, name || ('Hex ' + (parsedHex.nibbles.length * 4) + 'b'))
      };
    }

    // 2. Structured live payload object (e.g. from BroadcastChannel / postMessage / API)
    if (typeof input === 'object' && !Array.isArray(input) && input.app !== 'bitwave' && !input.lanes) {
      if (input.doc) return parseInput(input.doc, { transport: transport, name: input.name || name });
      if (input.link) return parseInput(input.link, { transport: transport, name: input.name || name });
      if (input.json) return parseInput(input.json, { transport: transport, name: input.name || name });

      var nA = null;
      var nB = null;
      if (Array.isArray(input.nibblesA)) {
        nA = input.nibblesA.map(function (v) { return clamp(Math.round(Number(v) || 0), 0, 15); });
      } else if (Array.isArray(input.nibbles)) {
        nA = input.nibbles.map(function (v) { return clamp(Math.round(Number(v) || 0), 0, 15); });
      } else if (typeof input.hexA === 'string' || typeof input.hex === 'string') {
        var hA = nibblesFromHex(input.hexA || input.hex);
        if (hA) nA = hA.nibbles;
      }

      if (Array.isArray(input.nibblesB)) {
        nB = input.nibblesB.map(function (v) { return clamp(Math.round(Number(v) || 0), 0, 15); });
      } else if (typeof input.hexB === 'string') {
        var hB = nibblesFromHex(input.hexB);
        if (hB) nB = hB.nibbles;
      }

      if (nA && nA.length >= 2) {
        var snap = snapshotFromRegisters(nA, nB, input.op || 'xor', transport, input.label || input.name || name);
        if (Array.isArray(input.nibblesZ) && input.nibblesZ.length === nA.length) {
          var zNorm = input.nibblesZ.map(function (v) { return clamp(Math.round(Number(v) || 0), 0, 15); });
          snap.lanes['1'].frames.z = {
            label: 'Z1',
            hex: hexFromNibbles(zNorm),
            nibbles: zNorm,
            popcount: popcountNibbles(zNorm)
          };
          snap.defaultFrame = 'z';
        }
        return { ok: true, snapshot: snap };
      }
    }

    // 3. BitWave compact #bw= share link (schema 4 D45 array) or legacy #bw= JSON object
    if (typeof input === 'string') {
      var trimmed = input.trim();
      if (trimmed.charAt(0) === '{' || trimmed.charAt(0) === '[') {
        var parsedJson = null;
        try { parsedJson = JSON.parse(trimmed); } catch (e) {
          return { ok: false, error: 'BitWave JSON could not be parsed' };
        }
        var docFromJson = Array.isArray(parsedJson) ? expandCompactShareArray(parsedJson) : parsedJson;
        var snapJson = snapshotFromProjectDoc(docFromJson, transport, name);
        if (snapJson) return { ok: true, snapshot: snapJson };
      } else {
        var sharePayload = extractSharePayload(trimmed);
        if (sharePayload) {
          var rawBytes = decodeBase64UrlBytes(sharePayload);
          var rawText = decodeUtf8Bytes(rawBytes);
          if (rawText) {
            var decoded = null;
            try { decoded = JSON.parse(rawText); } catch (e) { decoded = null; }
            if (decoded) {
              var docFromShare = Array.isArray(decoded) ? expandCompactShareArray(decoded) : decoded;
              var snapShare = snapshotFromProjectDoc(docFromShare, transport, name);
              if (snapShare) return { ok: true, snapshot: snapShare };
            }
          }
        }
      }
    } else if (typeof input === 'object' && input !== null) {
      var docFromObj = Array.isArray(input) ? expandCompactShareArray(input) : input;
      var snapObj = snapshotFromProjectDoc(docFromObj, transport, name);
      if (snapObj) return { ok: true, snapshot: snapObj };
    }

    // 4. Fallback to frozen BitWaveImport for strict schema 1-3 error diagnostics
    if (BitWaveImport && typeof BitWaveImport.bitwaveImport === 'function') {
      var imp = BitWaveImport.bitwaveImport(input, name ? { name: name } : undefined);
      if (imp && imp.ok) {
        return { ok: true, snapshot: snapshotFromImport(imp, transport, name) };
      }
      if (imp && imp.error && imp.error.message) {
        return { ok: false, error: imp.error.message };
      }
    }
    return { ok: false, error: 'Paste a BitWave #bw= link, .bitwave JSON, or hex register' };
  }

  // ---- Stateful Read-Only Feed Store (dormant on mount!) ----
  var active = false;
  var snapshot = null;
  var selectedLane = '1';
  var selectedFrame = 'z';
  var liveTransport = 'none'; // 'none' | 'broadcast' | 'postMessage' | 'paste' | 'file' | 'preset' | 'api'
  var lastRxAt = 0;
  var rxCount = 0;
  var listeners = [];
  var bcChannel = null;

  function notify() {
    var payload = getFeed();
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](payload); } catch (e) { /* isolate subscriber */ }
    }
  }

  function applySnapshot(snap, opts) {
    opts = opts || {};
    snapshot = snap;
    active = true;
    liveTransport = opts.transport || snap.source || 'paste';
    lastRxAt = Date.now();
    rxCount += 1;

    if (opts.preserveSelection && snap.lanes[selectedLane]) {
      // Keep user's current lane/frame when live frames stream in
    } else {
      selectedLane = snap.defaultLane || '1';
      selectedFrame = snap.defaultFrame || 'z';
    }
    if (!snap.lanes[selectedLane]) selectedLane = snap.laneKeys[0] || '1';
    notify();
  }

  function ingest(input, opts) {
    opts = opts || {};
    var parsed = parseInput(input, opts);
    if (!parsed.ok) return parsed;
    applySnapshot(parsed.snapshot, opts);
    return { ok: true, feed: getFeed() };
  }

  function loadPreset(presetId) {
    if (presetId === 'pulse256') {
      return ingest(PULSE_256_DOC, { transport: 'preset', name: '256b Edge Pulse' });
    }
    return ingest(CANONICAL_64_DOC, { transport: 'preset', name: '64b Canonical A\u2295B' });
  }

  function clear() {
    active = false;
    snapshot = null;
    selectedLane = '1';
    selectedFrame = 'z';
    liveTransport = 'none';
    notify();
  }

  function setLane(laneKey) {
    var k = String(laneKey || '1');
    if (snapshot && snapshot.lanes[k]) {
      selectedLane = k;
      notify();
    }
  }

  function setFrame(frameKey) {
    if (frameKey === 'a' || frameKey === 'b' || frameKey === 'z') {
      selectedFrame = frameKey;
      notify();
    }
  }

  function getActiveLaneObj() {
    if (!active || !snapshot) return null;
    return snapshot.lanes[selectedLane] || snapshot.lanes[snapshot.laneKeys[0]] || null;
  }

  function getFeed() {
    var ln = getActiveLaneObj();
    if (!ln) {
      return {
        active: false,
        width: 0,
        nibbleCount: 0,
        lane: selectedLane,
        laneKeys: [],
        frame: selectedFrame,
        liveTransport: liveTransport,
        rxCount: rxCount,
        lastRxAt: lastRxAt,
        name: '',
        label: '',
        op: '',
        opSymbol: '',
        nibblesA: null,
        nibblesB: null,
        nibblesZ: null,
        activeNibbles: null,
        hexA: '',
        hexB: '',
        hexZ: '',
        activeHex: '',
        popcount: 0,
        warnings: []
      };
    }
    var fr = ln.frames[selectedFrame] || ln.frames.z || ln.frames.a;
    return {
      active: true,
      width: snapshot.width,
      nibbleCount: snapshot.nibbleCount,
      lane: ln.id,
      laneKeys: snapshot.laneKeys.slice(),
      frame: selectedFrame,
      liveTransport: liveTransport,
      rxCount: rxCount,
      lastRxAt: lastRxAt,
      name: snapshot.name,
      label: fr.label,
      labels: ln.labels,
      op: ln.op,
      opSymbol: ln.opSymbol,
      nibblesA: ln.frames.a.nibbles,
      nibblesB: ln.frames.b.nibbles,
      nibblesZ: ln.frames.z.nibbles,
      activeNibbles: fr.nibbles,
      hexA: ln.frames.a.hex,
      hexB: ln.frames.b.hex,
      hexZ: ln.frames.z.hex,
      activeHex: fr.hex,
      popcount: fr.popcount,
      warnings: snapshot.warnings || []
    };
  }

  // Always returns a valid nibble array for ModMatrix tap_bitwave (falls back to canonical sine when dormant)
  function getLfoNibbles() {
    var ln = getActiveLaneObj();
    if (ln) {
      var fr = ln.frames[selectedFrame] || ln.frames.z || ln.frames.a;
      if (fr && fr.nibbles && fr.nibbles.length >= 2) return fr.nibbles;
    }
    return DEFAULT_LFO_NIBBLES;
  }

  function subscribe(fn) {
    if (typeof fn !== 'function') return function () {};
    listeners.push(fn);
    return function () {
      var idx = listeners.indexOf(fn);
      if (idx >= 0) listeners.splice(idx, 1);
    };
  }

  // ---- Passive Cross-Tab Live Feed Receivers (Browser Only; Zero Side Effects When Idle) ----
  function handleIncomingMessage(data, transport) {
    if (!data || typeof data !== 'object') return;
    if (data.type !== 'bitwave-feed' && data.type !== 'bitwave:feed') return;
    var payload = data.payload || data;
    ingest(payload, {
      transport: transport,
      preserveSelection: active,
      name: data.name || data.label || ('BitWave ' + (transport === 'broadcast' ? 'Live' : 'Msg'))
    });
  }

  if (typeof window !== 'undefined') {
    if (typeof BroadcastChannel === 'function') {
      try {
        bcChannel = new BroadcastChannel('bitwave-feed');
        bcChannel.onmessage = function (ev) {
          handleIncomingMessage(ev && ev.data, 'broadcast');
        };
      } catch (e) { /* opaque origin / file:// fallback */ }
    }
    window.addEventListener('message', function (ev) {
      handleIncomingMessage(ev && ev.data, 'postMessage');
    });
    // One-line companion helper for external tabs, bookmarklets, or DevTools console
    window.ramanujanSphereFeed = function (input, opts) {
      var merged = opts && typeof opts === 'object' ? Object.assign({ transport: 'api' }, opts) : { transport: 'api' };
      return ingest(input, merged);
    };
  }

  var api = {
    CHANNEL_NAME: 'bitwave-feed',
    DEFAULT_LFO_NIBBLES: DEFAULT_LFO_NIBBLES,
    parseInput: parseInput,
    ingest: ingest,
    loadPreset: loadPreset,
    clear: clear,
    isActive: function () { return active; },
    getFeed: getFeed,
    getLfoNibbles: getLfoNibbles,
    setLane: setLane,
    setFrame: setFrame,
    subscribe: subscribe,
    computeCyclicSlopes: computeCyclicSlopes,
    sampleMonotoneRaw: sampleMonotoneRaw,
    sampleMonotone: sampleMonotone,
    sampleMonotoneArray: sampleMonotoneArray,
    toPcmCycle: toPcmCycle
  };

  Harmony.BitWaveFeed = api;
  if (typeof module !== 'undefined' && module && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
