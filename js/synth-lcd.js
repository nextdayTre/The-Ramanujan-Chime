/* ===== Harmony.SynthLCD — Harmor / FAS Synthetic Spectral LCD & Bitcoin Lifecycle Pipeline =====
   Zero-build classic script (browser + Node dual-export).
   Closes the loop between BitWave binary registers and Harmor/FAS additive image synthesis:
     1. Pure-JS SHA-256 (FIPS 180-4) + exact BigInt Base58 / Base58Check encoding
     2. Tolerant Bitcoin Keypair Lifecycle CSV parser:
          K (Private) -> Curve Point (PubKey) -> SHA-256 -> RIPEMD-160 -> Checksum Seal -> Base58
     3. Strict 0/1 Harmor-binarized 5x7 monospace bitmap spectrogram matrix G(col, row)
        with fixed time-intervals per character and 1-column silent guard bands
     4. System A "Travelling Focus Beam" swooshing coalescence math shared across:
          - 3D WebGL Front f(x) upright Cartesian LCD plane (Scene3D)
          - 2D Paired Floor WT Scope (Synth LCD & Dual BitWave+LCD views)
          - Multi-Chime Rack Front f(x) cards (ChimeRack)
   Starts dormant (enabled = false) on mount so default view & agent snapshots stay 100% untouched. */
(function (root) {
  'use strict';

  var Harmony = root.Harmony = root.Harmony || {};

  var BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  var BASE58_MAP = Object.create(null);
  for (var b58i = 0; b58i < BASE58_ALPHABET.length; b58i++) {
    BASE58_MAP[BASE58_ALPHABET.charAt(b58i)] = b58i;
  }

  // ---- Pure-JS SHA-256 (FIPS 180-4, zero dependencies, offline file:// safe) ----
  var SHA256_K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  function rotr32(x, n) {
    return (x >>> n) | (x << (32 - n));
  }

  function hexToBytes(hexStr) {
    var clean = String(hexStr || '').trim().replace(/^0[xX]/, '').replace(/[\s_-]+/g, '');
    if (!clean || !/^[0-9a-fA-F]+$/.test(clean)) return null;
    if (clean.length % 2 === 1) clean = '0' + clean;
    var out = new Uint8Array(clean.length / 2);
    for (var i = 0; i < out.length; i++) {
      out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    }
    return out;
  }

  function bytesToHex(bytes) {
    if (!bytes || !bytes.length) return '';
    var s = '';
    for (var i = 0; i < bytes.length; i++) {
      var b = bytes[i] & 0xff;
      s += (b < 16 ? '0' : '') + b.toString(16).toUpperCase();
    }
    return s;
  }

  function sha256Bytes(msgBytes) {
    var bytes = msgBytes instanceof Uint8Array ? msgBytes : new Uint8Array(msgBytes || []);
    var bitLen = bytes.length * 8;
    var padLen = ((bytes.length + 9 + 63) >> 6) << 6;
    var buf = new Uint8Array(padLen);
    buf.set(bytes);
    buf[bytes.length] = 0x80;
    var view = new DataView(buf.buffer);
    view.setUint32(padLen - 8, Math.floor(bitLen / 4294967296), false);
    view.setUint32(padLen - 4, bitLen >>> 0, false);

    var h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
    var h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
    var W = new Uint32Array(64);

    for (var off = 0; off < padLen; off += 64) {
      for (var i = 0; i < 16; i++) W[i] = view.getUint32(off + i * 4, false);
      for (var j = 16; j < 64; j++) {
        var s0 = rotr32(W[j - 15], 7) ^ rotr32(W[j - 15], 18) ^ (W[j - 15] >>> 3);
        var s1 = rotr32(W[j - 2], 17) ^ rotr32(W[j - 2], 19) ^ (W[j - 2] >>> 10);
        W[j] = (W[j - 16] + s0 + W[j - 7] + s1) >>> 0;
      }
      var a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
      for (var t = 0; t < 64; t++) {
        var S1 = rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25);
        var ch = (e & f) ^ ((~e) & g);
        var t1 = (h + S1 + ch + SHA256_K[t] + W[t]) >>> 0;
        var S0 = rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22);
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + maj) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0;
        d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
      h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
    }

    var out = new Uint8Array(32);
    var dv = new DataView(out.buffer);
    dv.setUint32(0, h0, false); dv.setUint32(4, h1, false); dv.setUint32(8, h2, false); dv.setUint32(12, h3, false);
    dv.setUint32(16, h4, false); dv.setUint32(20, h5, false); dv.setUint32(24, h6, false); dv.setUint32(28, h7, false);
    return out;
  }

  function sha256Hex(hexStr) {
    var b = hexToBytes(hexStr);
    if (!b) return '';
    return bytesToHex(sha256Bytes(b));
  }

  function doubleSha256Bytes(bytes) {
    return sha256Bytes(sha256Bytes(bytes));
  }

  // ---- Exact BigInt Base58 & Base58Check ----
  function encodeBase58Bytes(bytes) {
    if (!bytes || !bytes.length) return '';
    var zeros = 0;
    while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
    var num = BigInt(0);
    for (var i = 0; i < bytes.length; i++) {
      num = (num << BigInt(8)) | BigInt(bytes[i]);
    }
    var chars = [];
    var base = BigInt(58);
    while (num > BigInt(0)) {
      var rem = Number(num % base);
      chars.push(BASE58_ALPHABET.charAt(rem));
      num = num / base;
    }
    for (var z = 0; z < zeros; z++) chars.push('1');
    chars.reverse();
    return chars.join('') || '1';
  }

  function encodeBase58Hex(hexStr) {
    var b = hexToBytes(hexStr);
    if (!b) return '';
    return encodeBase58Bytes(b);
  }

  function decodeBase58Bytes(b58Str) {
    var s = String(b58Str || '').trim();
    if (!s) return null;
    var zeros = 0;
    while (zeros < s.length && s.charAt(zeros) === '1') zeros++;
    var num = BigInt(0);
    var base = BigInt(58);
    for (var i = 0; i < s.length; i++) {
      var val = BASE58_MAP[s.charAt(i)];
      if (val === undefined) return null;
      num = num * base + BigInt(val);
    }
    var bytes = [];
    while (num > BigInt(0)) {
      bytes.push(Number(num & BigInt(0xff)));
      num = num >> BigInt(8);
    }
    for (var z = 0; z < zeros; z++) bytes.push(0);
    bytes.reverse();
    return new Uint8Array(bytes);
  }

  function buildP2pkhSealHex(hash160Hex, versionHex) {
    var ver = String(versionHex || '00').trim().replace(/^0[xX]/, '');
    if (ver.length === 1) ver = '0' + ver;
    var body = (ver + String(hash160Hex || '').trim().replace(/^0[xX]/, '')).toUpperCase();
    var bytes = hexToBytes(body);
    if (!bytes) return '';
    var dhash = doubleSha256Bytes(bytes);
    var checkHex = bytesToHex(dhash.subarray(0, 4));
    return body + checkHex;
  }

  function encodeBase58Check(hash160Hex, versionHex) {
    var seal = buildP2pkhSealHex(hash160Hex, versionHex);
    if (!seal) return '';
    return encodeBase58Hex(seal);
  }

  function verifyBase58Check(payloadHex) {
    var bytes = hexToBytes(payloadHex);
    if (!bytes || bytes.length < 5) return { valid: false, checksumHex: '', expectedHex: '' };
    var body = bytes.subarray(0, bytes.length - 4);
    var given = bytes.subarray(bytes.length - 4);
    var expected = doubleSha256Bytes(body).subarray(0, 4);
    var ok = true;
    for (var i = 0; i < 4; i++) {
      if (given[i] !== expected[i]) { ok = false; break; }
    }
    return {
      valid: ok,
      checksumHex: bytesToHex(given),
      expectedHex: bytesToHex(expected)
    };
  }

  // ---- Built-In Authentic Bitcoin P2PKH Lifecycle Examples ----
  // Row 0: K = 1 (secp256k1 Generator G -> 1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH, 100% verifiable)
  // Row 1: K = 2 (2*G -> 1cMh228HTCiwS8ZsaakH8A8wze1JR5ZsP, compressed)
  // Row 2: Bitcoin Genesis Block Coinbase P2PKH (1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa)
  var BUILTIN_LIFECYCLE = [
    {
      label: 'secp256k1 G (K=1)',
      k:      '0000000000000000000000000000000000000000000000000000000000000001',
      pub:    '0279BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798',
      sha:    '0F715BAF5D4C2ED329785CEF29E562F73488C8A2BB9DBC5700B361D54B9B0554',
      ripe:   '751E76E8199196D454941C45D1B3A323F1433BD6',
      seal:   '00751E76E8199196D454941C45D1B3A323F1433BD65171EB16',
      base58: '1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH'
    },
    {
      label: 'secp256k1 2G (K=2)',
      k:      '0000000000000000000000000000000000000000000000000000000000000002',
      pub:    '02C6047F9441ED7D6D3045406E95C07CD85C778E4B8CEF3CA7ABAC09B95C709EE5',
      sha:    'B1C9938F01121E159887AC2C8D393A22E4476FF8212DE13FE1939DE2A236F0A7',
      ripe:   '06AFD46BCDFD22EF94AC122AA11F241244A37ECC',
      seal:   '0006AFD46BCDFD22EF94AC122AA11F241244A37ECC88462F2A',
      base58: '1cMh228HTCiwS8ZsaakH8A8wze1JR5ZsP'
    },
    {
      label: 'Genesis P2PKH',
      k:      '4A5E1E4BAAB89F3A32518A88C31BC87F618F76673E2CC77AB2127B7AFDEDA33B',
      pub:    '04678AFDB0FE5548271967F1A67130B7105CD6A828E03909A67962E0EA1F61DEB649F6BC3F4CEF38C4F35504E51EC112DE5C384DF7BA0B8D578A4C702B6BF11D5F',
      sha:    '261C1EB21FC4708C6ACBE1CFC6D4565652E9E768B620782898936B93000A6C02',
      ripe:   '62E907B15CBF27D5425399EBF6F0FB50EBB88F18',
      seal:   '0062E907B15CBF27D5425399EBF6F0FB50EBB88F18C29B7D93',
      base58: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'
    }
  ];

  // Ensure built-in rows have exact freshly computed SHA/Seal/Base58
  for (var bi = 0; bi < BUILTIN_LIFECYCLE.length; bi++) {
    var br = BUILTIN_LIFECYCLE[bi];
    if (br.pub) br.sha = sha256Hex(br.pub);
    if (br.ripe) {
      br.seal = buildP2pkhSealHex(br.ripe, '00');
      br.base58 = encodeBase58Hex(br.seal);
    }
  }

  var STAGE_DEFS = [
    { id: 'k',      slot: 'A', short: 'K',      name: 'Private Key K',     color: '#36d6c8', bits: 256, lcdMode: 'hex' },
    { id: 'pub',    slot: 'B', short: 'Pub',    name: 'Curve Point P=K·G', color: '#5aa9ff', bits: 264, lcdMode: 'hex' },
    { id: 'sha',    slot: 'C', short: 'SHA',    name: 'SHA-256 Digest',    color: '#9d8cff', bits: 256, lcdMode: 'hex' },
    { id: 'ripe',   slot: 'D', short: 'RIPE',   name: 'RIPEMD-160 Hash',   color: '#ffb04d', bits: 160, lcdMode: 'hex' },
    { id: 'seal',   slot: 'E', short: 'Seal',   name: 'Checksum Seal',     color: '#ff6b7a', bits: 200, lcdMode: 'hex' },
    { id: 'base58', slot: 'F', short: 'Base58', name: 'Base58 Synth LCD',  color: '#4af28a', bits: 200, lcdMode: 'base58' }
  ];

  function cleanHex(v) {
    var s = String(v || '').trim().replace(/^0[xX]/, '').replace(/[\s_-]+/g, '').toUpperCase();
    return /^[0-9A-F]+$/.test(s) ? s : '';
  }

  function splitCsvLine(line) {
    var out = [];
    var cur = '';
    var inQ = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line.charAt(i);
      if (ch === '"') {
        if (inQ && line.charAt(i + 1) === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if ((ch === ',' || ch === '\t' || ch === ';') && !inQ) {
        out.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur.trim());
    return out;
  }

  function normalizeLifecycleRow(raw, idx) {
    var k = cleanHex(raw.k);
    var pub = cleanHex(raw.pub);
    var sha = cleanHex(raw.sha);
    var ripe = cleanHex(raw.ripe);
    var seal = cleanHex(raw.seal);
    var b58 = String(raw.base58 || '').trim();

    if (!sha && pub) sha = sha256Hex(pub);
    if (!seal && ripe) {
      if (ripe.length === 40) seal = buildP2pkhSealHex(ripe, '00');
      else if (ripe.length === 42) seal = buildP2pkhSealHex(ripe.slice(2), ripe.slice(0, 2));
      else if (ripe.length === 50) seal = ripe;
    }
    if (!seal && b58) {
      var dec = decodeBase58Bytes(b58);
      if (dec && dec.length >= 20) seal = bytesToHex(dec);
    }
    if (!ripe && seal && seal.length >= 50) {
      ripe = seal.slice(2, 42);
    }
    if (!b58 && seal) b58 = encodeBase58Hex(seal);
    if (!b58 && ripe) b58 = encodeBase58Check(ripe, '00');
    if (!b58 && k) b58 = encodeBase58Hex(k);

    if (!k && !pub && !sha && !ripe && !seal && !b58) return null;
    var check = seal ? verifyBase58Check(seal) : { valid: false, checksumHex: '', expectedHex: '' };
    return {
      label: raw.label || ('Row #' + (idx + 1)),
      k: k || sha || seal || '00',
      pub: pub || sha || k || seal || '00',
      sha: sha || (pub ? sha256Hex(pub) : (k ? sha256Hex(k) : seal || '00')),
      ripe: ripe || (seal && seal.length >= 42 ? seal.slice(2, 42) : (sha ? sha.slice(0, 40) : '00')),
      seal: seal || (ripe ? buildP2pkhSealHex(ripe, '00') : (k || '00')),
      base58: b58 || (seal ? encodeBase58Hex(seal) : ''),
      checksumValid: check.valid,
      checksumHex: check.checksumHex
    };
  }

  function matchHeaderKey(h) {
    var s = String(h || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (/^(k|priv|private|privatekey|privkey|secret|scalar|seckey|d)$/.test(s)) return 'k';
    if (/^(pub|pubkey|publickey|point|curvepoint|compressedpub|uncompressedpub|pk|q)$/.test(s)) return 'pub';
    if (/^(px|pubx|pointx|qx)$/.test(s)) return 'px';
    if (/^(py|puby|pointy|qy)$/.test(s)) return 'py';
    if (/^(sha|sha256|shadigest|sha256digest|sha256hex)$/.test(s)) return 'sha';
    if (/^(ripe|ripemd|ripemd160|hash160|ripedigest|h160|pkh|pubkeyhash)$/.test(s)) return 'ripe';
    if (/^(seal|checksum|checksumseal|payload|versioned|p2pkhhex|extended|versionedpayload|rawaddress|hexaddress)$/.test(s)) return 'seal';
    if (/^(base58|base58check|address|addr|p2pkh|p2pkhaddress|btcaddress|bitcoinaddress)$/.test(s)) return 'base58';
    if (/^(label|name|id|index|note|tag)$/.test(s)) return 'label';
    return null;
  }

  function parseLifecycleCsv(csvText) {
    var text = String(csvText || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    var lines = text.split('\n').filter(function (ln) { return ln.trim().length > 0; });
    if (!lines.length) return { ok: false, error: 'CSV is empty', rows: [] };

    var firstCols = splitCsvLine(lines[0]);
    var colMap = {};
    var headerMatches = 0;
    for (var c = 0; c < firstCols.length; c++) {
      var mk = matchHeaderKey(firstCols[c]);
      if (mk && colMap[mk] === undefined) {
        colMap[mk] = c;
        headerMatches++;
      }
    }

    var startRow = headerMatches >= 2 ? 1 : 0;
    var rows = [];
    for (var r = startRow; r < lines.length; r++) {
      var cols = splitCsvLine(lines[r]);
      if (!cols.length) continue;
      var obj = {};
      if (headerMatches >= 2) {
        for (var key in colMap) {
          if (Object.prototype.hasOwnProperty.call(colMap, key)) {
            obj[key] = cols[colMap[key]] || '';
          }
        }
        if (!obj.pub && obj.px) {
          var px = cleanHex(obj.px);
          var py = cleanHex(obj.py);
          obj.pub = py ? ('04' + px + py) : ('02' + px);
        }
      } else {
        // Positional fallback: 6 columns (K, Pub, SHA, RIPE, Seal, Base58) or shorter
        if (cols.length >= 6) {
          obj = { k: cols[0], pub: cols[1], sha: cols[2], ripe: cols[3], seal: cols[4], base58: cols[5] };
        } else if (cols.length === 5) {
          obj = { k: cols[0], pub: cols[1], sha: cols[2], ripe: cols[3], base58: cols[4] };
        } else if (cols.length === 4) {
          obj = { k: cols[0], pub: cols[1], ripe: cols[2], base58: cols[3] };
        } else if (cols.length === 3) {
          obj = { k: cols[0], ripe: cols[1], base58: cols[2] };
        } else if (cols.length === 2) {
          obj = { k: cols[0], base58: cols[1] };
        } else {
          var single = cols[0];
          if (/^[13][1-9A-HJ-NP-Za-km-z]{24,35}$/.test(single)) obj = { base58: single };
          else obj = { seal: single };
        }
      }
      var norm = normalizeLifecycleRow(obj, rows.length);
      if (norm) rows.push(norm);
    }

    if (!rows.length) {
      return { ok: false, error: 'No valid keypair / hex / Base58 rows found in CSV', rows: [] };
    }
    return { ok: true, rows: rows, count: rows.length, detectedHeader: headerMatches >= 2 };
  }

  // ---- Crisp 5x7 Monospace Bitmap Font (Full Base58 + Hex + Symbols) ----
  // 7 rows (top = row 0 = highest frequency partial, bottom = row 6 = lowest frequency partial)
  // Each row is a 5-bit mask (bit 4 = leftmost pixel, bit 0 = rightmost pixel).
  var FONT_5X7 = {
    ' ': [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
    '0': [0x0E, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0E],
    '1': [0x04, 0x0C, 0x04, 0x04, 0x04, 0x04, 0x0E],
    '2': [0x0E, 0x11, 0x01, 0x06, 0x08, 0x10, 0x1F],
    '3': [0x1F, 0x02, 0x04, 0x02, 0x01, 0x11, 0x0E],
    '4': [0x02, 0x06, 0x0A, 0x12, 0x1F, 0x02, 0x02],
    '5': [0x1F, 0x10, 0x1E, 0x01, 0x01, 0x11, 0x0E],
    '6': [0x06, 0x08, 0x10, 0x1E, 0x11, 0x11, 0x0E],
    '7': [0x1F, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
    '8': [0x0E, 0x11, 0x11, 0x0E, 0x11, 0x11, 0x0E],
    '9': [0x0E, 0x11, 0x11, 0x0F, 0x01, 0x02, 0x0C],
    'A': [0x0E, 0x11, 0x11, 0x1F, 0x11, 0x11, 0x11],
    'B': [0x1E, 0x11, 0x11, 0x1E, 0x11, 0x11, 0x1E],
    'C': [0x0E, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0E],
    'D': [0x1C, 0x12, 0x11, 0x11, 0x11, 0x12, 0x1C],
    'E': [0x1F, 0x10, 0x10, 0x1E, 0x10, 0x10, 0x1F],
    'F': [0x1F, 0x10, 0x10, 0x1E, 0x10, 0x10, 0x10],
    'G': [0x0E, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0F],
    'H': [0x11, 0x11, 0x11, 0x1F, 0x11, 0x11, 0x11],
    'I': [0x0E, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0E],
    'J': [0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0C],
    'K': [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11],
    'L': [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1F],
    'M': [0x11, 0x1B, 0x15, 0x15, 0x11, 0x11, 0x11],
    'N': [0x11, 0x19, 0x15, 0x13, 0x11, 0x11, 0x11],
    'O': [0x0E, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0E],
    'P': [0x1E, 0x11, 0x11, 0x1E, 0x10, 0x10, 0x10],
    'Q': [0x0E, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0D],
    'R': [0x1E, 0x11, 0x11, 0x1E, 0x14, 0x12, 0x11],
    'S': [0x0F, 0x10, 0x10, 0x0E, 0x01, 0x01, 0x1E],
    'T': [0x1F, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
    'U': [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0E],
    'V': [0x11, 0x11, 0x11, 0x11, 0x11, 0x0A, 0x04],
    'W': [0x11, 0x11, 0x11, 0x15, 0x15, 0x1B, 0x11],
    'X': [0x11, 0x11, 0x0A, 0x04, 0x0A, 0x11, 0x11],
    'Y': [0x11, 0x11, 0x0A, 0x04, 0x04, 0x04, 0x04],
    'Z': [0x1F, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1F],
    'a': [0x00, 0x00, 0x0E, 0x01, 0x0F, 0x11, 0x0F],
    'b': [0x10, 0x10, 0x1E, 0x11, 0x11, 0x11, 0x1E],
    'c': [0x00, 0x00, 0x0E, 0x10, 0x10, 0x11, 0x0E],
    'd': [0x01, 0x01, 0x0F, 0x11, 0x11, 0x11, 0x0F],
    'e': [0x00, 0x00, 0x0E, 0x11, 0x1F, 0x10, 0x0E],
    'f': [0x06, 0x08, 0x1E, 0x08, 0x08, 0x08, 0x08],
    'g': [0x00, 0x0F, 0x11, 0x11, 0x0F, 0x01, 0x0E],
    'h': [0x10, 0x10, 0x1E, 0x11, 0x11, 0x11, 0x11],
    'i': [0x04, 0x00, 0x0C, 0x04, 0x04, 0x04, 0x0E],
    'j': [0x02, 0x00, 0x06, 0x02, 0x02, 0x12, 0x0C],
    'k': [0x10, 0x10, 0x12, 0x14, 0x18, 0x14, 0x12],
    'l': [0x0C, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0E],
    'm': [0x00, 0x00, 0x1A, 0x15, 0x15, 0x11, 0x11],
    'n': [0x00, 0x00, 0x1E, 0x11, 0x11, 0x11, 0x11],
    'o': [0x00, 0x00, 0x0E, 0x11, 0x11, 0x11, 0x0E],
    'p': [0x00, 0x1E, 0x11, 0x11, 0x1E, 0x10, 0x10],
    'q': [0x00, 0x0F, 0x11, 0x11, 0x0F, 0x01, 0x01],
    'r': [0x00, 0x00, 0x16, 0x19, 0x10, 0x10, 0x10],
    's': [0x00, 0x00, 0x0F, 0x10, 0x0E, 0x01, 0x1E],
    't': [0x08, 0x08, 0x1E, 0x08, 0x08, 0x09, 0x06],
    'u': [0x00, 0x00, 0x11, 0x11, 0x11, 0x13, 0x0D],
    'v': [0x00, 0x00, 0x11, 0x11, 0x11, 0x0A, 0x04],
    'w': [0x00, 0x00, 0x11, 0x11, 0x15, 0x15, 0x0A],
    'x': [0x00, 0x00, 0x11, 0x0A, 0x04, 0x0A, 0x11],
    'y': [0x00, 0x11, 0x11, 0x0F, 0x01, 0x11, 0x0E],
    'z': [0x00, 0x00, 0x1F, 0x02, 0x04, 0x08, 0x1F],
    '-': [0x00, 0x00, 0x00, 0x1F, 0x00, 0x00, 0x00],
    ':': [0x00, 0x04, 0x04, 0x00, 0x04, 0x04, 0x00],
    '.': [0x00, 0x00, 0x00, 0x00, 0x00, 0x0C, 0x0C],
    '?': [0x0E, 0x11, 0x01, 0x06, 0x04, 0x00, 0x04]
  };

  var GLYPH_W = 5;
  var GLYPH_H = 7;
  var GLYPH_GAP = 1; // 1 silent column between fixed-interval glyphs for Harmor spectrogram legibility

  // Build strict 0/1 Harmor-binarized spectral matrix G[row * cols + col]
  // Row 0 = top (highest partial frequency), Row 6 = bottom (lowest partial frequency).
  function buildLcdMatrix(text, opts) {
    opts = opts || {};
    var str = String(text || '').trim();
    if (!str) str = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
    var maxChars = opts.maxChars || 40;
    if (str.length > maxChars) str = str.slice(0, maxChars);

    var stride = GLYPH_W + GLYPH_GAP;
    var cols = Math.max(1, str.length * stride - GLYPH_GAP);
    var rows = GLYPH_H;
    var grid = new Uint8Array(rows * cols);

    for (var ci = 0; ci < str.length; ci++) {
      var ch = str.charAt(ci);
      var glyph = FONT_5X7[ch] || FONT_5X7['?'];
      var baseCol = ci * stride;
      for (var r = 0; r < rows; r++) {
        var mask = glyph[r] || 0;
        for (var gx = 0; gx < GLYPH_W; gx++) {
          var bit = (mask >> (GLYPH_W - 1 - gx)) & 1;
          grid[r * cols + baseCol + gx] = bit ? 1 : 0;
        }
      }
    }

    // Precompute harmonic frequency bands (log-spaced Harmor IMG sweet spot: 440 Hz .. 6400 Hz)
    var minHz = opts.minHz || 440;
    var maxHz = opts.maxHz || 6400;
    var rowHz = new Float32Array(rows);
    var logR = Math.log(maxHz / minHz);
    for (var ri = 0; ri < rows; ri++) {
      // ri = 0 is top row (maxHz), ri = rows - 1 is bottom row (minHz)
      var frac = 1 - ri / Math.max(1, rows - 1);
      rowHz[ri] = minHz * Math.exp(frac * logR);
    }

    return {
      text: str,
      charCount: str.length,
      stride: stride,
      cols: cols,
      rows: rows,
      grid: grid,
      rowHz: rowHz
    };
  }

  function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  }

  // ---- System A: Travelling Focus Beam Coalescence Math ----
  // Returns local focus in [0, 1] at normalized horizontal position u in [0, 1].
  //   coalesce = 0: dispersed harmonic carrier ribbons outside beam; crisp binary glyphs inside beam
  //   coalesce = 1: entire address locked razor-sharp across the fixed time-interval window
  function evalCoalesce(u, playT, coalesce, beamWidth) {
    var c = clamp(Number(coalesce) || 0, 0, 1);
    var pt = ((Number(playT) || 0) % 1 + 1) % 1;
    var bw = Math.max(0.04, Number(beamWidth) || 0.16);
    var d = Math.abs(u - pt);
    if (d > 0.5) d = 1 - d;
    var beam = Math.exp(-(d * d) / (bw * bw));
    var focus = clamp(c + (1 - c) * beam, 0, 1);
    return { focus: focus, beam: beam, dist: d };
  }

  // ---- Module Live State (Starts Dormant on Mount) ----
  var enabled = false;
  var encoding = 'base58';      // 'base58' | 'hex' | 'bin'
  var harmorBinary = true;      // User's Harmor trick: strict luminous green #38FF72 on #000000 void
  var coalesce = 0.34;          // 0 = pure travelling beam swoosh, 1 = full-window sharp LCD lock
  var beamWidth = 0.22;
  var lifecycleRows = BUILTIN_LIFECYCLE.slice();
  var rowIndex = 0;
  var stageId = 'base58';       // 'k' | 'pub' | 'sha' | 'ripe' | 'seal' | 'base58'
  var sourceLabel = 'Built-in P2PKH Lifecycle';
  var cachedMatrixKey = '';
  var cachedMatrix = null;
  var listeners = [];

  function notify() {
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](getConfig()); } catch (e) { /* isolate */ }
    }
  }

  function currentRow() {
    if (!lifecycleRows.length) return BUILTIN_LIFECYCLE[0];
    return lifecycleRows[clamp(rowIndex, 0, lifecycleRows.length - 1)];
  }

  function stageHexForRow(row, stId) {
    if (!row) return '';
    if (stId === 'k') return row.k;
    if (stId === 'pub') return row.pub;
    if (stId === 'sha') return row.sha;
    if (stId === 'ripe') return row.ripe;
    if (stId === 'seal' || stId === 'base58') return row.seal;
    return row.seal || row.k;
  }

  // Derive the active Synthetic LCD text deterministically from either:
  //   1. An explicit override text / hex (e.g. per-Chime Rack card), OR
  //   2. Live BitWaveFeed register (or Spherical Twin Decompiler output Z), OR
  //   3. Active Bitcoin Keypair Lifecycle row + stage
  function resolveLcdData(state, playT, opts) {
    opts = opts || {};
    var enc = opts.encoding || encoding;
    var hex = '';
    var text = '';
    var subtitle = '';
    var checksumValid = null;

    if (opts.text) {
      text = String(opts.text);
      hex = cleanHex(opts.hex || '');
      subtitle = opts.subtitle || '';
    } else {
      var bwMod = Harmony.BitWaveFeed;
      var fd = (bwMod && typeof bwMod.getFeed === 'function') ? bwMod.getFeed() : null;
      var twinDec = (fd && fd.active && state && typeof bwMod.decompileForState === 'function')
        ? bwMod.decompileForState(state, playT) : null;

      if (opts.hex) {
        hex = cleanHex(opts.hex);
        subtitle = opts.subtitle || 'HEX';
      } else if (fd && fd.active && fd.activeHex) {
        hex = twinDec ? twinDec.observed.hex : fd.activeHex;
        subtitle = twinDec ? ('Twin ' + twinDec.observed.label) : (fd.name || 'BitWave');
      } else {
        var row = currentRow();
        hex = stageHexForRow(row, stageId);
        subtitle = row.label + ' · ' + stageId.toUpperCase();
        if (stageId === 'base58' || stageId === 'seal') checksumValid = !!row.checksumValid;
      }

      // Check if hex matches a 25-byte P2PKH checksum seal
      if (checksumValid === null && hex && hex.length === 50) {
        checksumValid = verifyBase58Check(hex).valid;
      }

      if (enc === 'base58') {
        if (hex && hex.length === 40 && !opts.rawHex) {
          // 20-byte HASH160 -> auto-wrap with mainnet 0x00 + double-SHA256 checksum
          var wrapped = buildP2pkhSealHex(hex, '00');
          text = encodeBase58Hex(wrapped);
          checksumValid = true;
        } else if (hex) {
          text = encodeBase58Hex(hex);
        } else {
          text = currentRow().base58;
        }
      } else if (enc === 'bin') {
        var binOut = '';
        var maxHexNibbles = Math.min(hex.length, 8);
        for (var hi = 0; hi < maxHexNibbles; hi++) {
          var nv = parseInt(hex.charAt(hi), 16) || 0;
          binOut += nv.toString(2).padStart(4, '0');
          if (hi + 1 < maxHexNibbles) binOut += ' ';
        }
        text = binOut || '1000 0001';
      } else {
        text = hex || 'FF78BCDA';
      }
    }

    var matKey = enc + '|' + text;
    var mat;
    if (opts.noCache) {
      mat = buildLcdMatrix(text, { maxChars: opts.maxChars || 36 });
    } else if (matKey === cachedMatrixKey && cachedMatrix) {
      mat = cachedMatrix;
    } else {
      mat = buildLcdMatrix(text, { maxChars: opts.maxChars || 36 });
      cachedMatrixKey = matKey;
      cachedMatrix = mat;
    }

    return {
      text: mat.text,
      fullText: text,
      hex: hex,
      encoding: enc,
      subtitle: subtitle,
      checksumValid: checksumValid,
      matrix: mat
    };
  }

  // ---- Shared High-Impact Renderer: Swooshing Coalescence Harmor LCD Canvas ----
  // Used by BOTH:
  //   1. 3D Upright Front f(x) Cartesian Slice Texture (clipped to sphere circle, transparent outside)
  //   2. 2D Bottom Dock `Synth LCD` and `Dual` views
  //   3. Multi-Chime Rack Front f(x) Base58 cards
  function drawSwooshLcd(ctx, rect, lcdData, playT, opts) {
    if (!ctx || !lcdData || !lcdData.matrix) return;
    opts = opts || {};
    var x0 = rect.x, y0 = rect.y, w = rect.w, h = rect.h;
    if (w < 8 || h < 8) return;

    var mat = lcdData.matrix;
    var cols = mat.cols;
    var rows = mat.rows;
    var grid = mat.grid;
    var pt = ((Number(playT) || 0) % 1 + 1) % 1;
    var coal = opts.coalesce != null ? clamp(opts.coalesce, 0, 1) : coalesce;
    var bw = opts.beamWidth != null ? opts.beamWidth : beamWidth;
    var hBin = opts.harmorBinary != null ? !!opts.harmorBinary : harmorBinary;
    var nibbles = opts.nibbles || null;
    var compact = !!opts.compact;

    // Harmor Green-on-Black Binarization (#38FF72 on #000000) vs Chime Cyan/Gold
    var colMain = hBin ? '#38ff72' : '#4df3dd';
    var colBright = hBin ? '#b8ffd0' : '#ffffff';
    var colRib = hBin ? 'rgba(56, 255, 114, ' : 'rgba(77, 243, 221, ';
    var colBeam = hBin ? 'rgba(56, 255, 114, ' : 'rgba(255, 184, 77, ';

    ctx.save();

    if (opts.fillBg !== false) {
      ctx.fillStyle = hBin ? '#000000' : '#04080e';
      ctx.fillRect(x0, y0, w, h);
    }

    // Subtle fixed time-interval slot grid (one vertical guide per Base58/Hex character)
    var charCount = mat.charCount;
    var stride = mat.stride;
    var colW = w / cols;
    var rowH = h / rows;

    if (!compact && charCount <= 40) {
      ctx.strokeStyle = hBin ? 'rgba(56, 255, 114, 0.08)' : 'rgba(77, 243, 221, 0.09)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (var ci = 1; ci < charCount; ci++) {
        var gx = x0 + (ci * stride - 0.5) * colW;
        ctx.moveTo(gx, y0);
        ctx.lineTo(gx, y0 + h);
      }
      ctx.stroke();
    }

    // 1. Swooshing Harmonic Carrier Ribbons (visible wherever focus < 1!)
    // Each of the 7 frequency rows carries a phase-swept BitWave-modulated filament that
    // visibly contracts into the exact horizontal frequency band as the Travelling Focus Beam passes!
    var bwMod = Harmony.BitWaveFeed;
    var sampleMono = (bwMod && typeof bwMod.sampleMonotone === 'function') ? bwMod.sampleMonotone : null;
    var ribbonSteps = compact ? 56 : Math.min(180, Math.max(72, Math.floor(w / 3)));

    if (coal < 0.995) {
      for (var rr = 0; rr < rows; rr++) {
        var baseRowY = y0 + (rr + 0.5) * rowH;
        var rowFrac = rr / Math.max(1, rows - 1);
        var freqMult = 1.5 + rowFrac * 3.5;

        ctx.beginPath();
        for (var si = 0; si <= ribbonSteps; si++) {
          var su = si / ribbonSteps;
          var ev = evalCoalesce(su, pt, coal, bw);
          var disp = 1 - ev.focus; // 1 = full swoosh dispersion, 0 = locked flat onto partial row
          var bwSample = (nibbles && nibbles.length >= 2 && sampleMono)
            ? sampleMono(nibbles, (su + pt * 0.5 + rr * 0.07) % 1)
            : Math.sin((su * freqMult + pt * 2.0 + rr * 0.41) * Math.PI * 2);
          var carrier = Math.sin((su * (3 + rr) - pt * 3.0) * Math.PI * 2) * 0.45 + bwSample * 0.55;
          var swirlY = carrier * disp * h * (compact ? 0.28 : 0.34);
          var rx = x0 + su * w;
          var ry = clamp(baseRowY + swirlY, y0 + 1, y0 + h - 1);
          if (si === 0) ctx.moveTo(rx, ry); else ctx.lineTo(rx, ry);
        }
        var ribAlpha = (0.14 + 0.24 * (1 - coal)) * (compact ? 0.85 : 1.0);
        ctx.strokeStyle = colRib + ribAlpha.toFixed(3) + ')';
        ctx.lineWidth = compact ? 0.9 : 1.15;
        ctx.stroke();
      }
    }

    // 2. Travelling Focus Beam Glow Band (System A focal lens sweeping along playT)
    var scanX = x0 + pt * w;
    if (coal < 0.98) {
      var beamPx = Math.max(12, bw * w * 1.45);
      var grad = ctx.createLinearGradient(scanX - beamPx, 0, scanX + beamPx, 0);
      grad.addColorStop(0, colBeam + '0)');
      grad.addColorStop(0.5, colBeam + (hBin ? '0.16)' : '0.14)'));
      grad.addColorStop(1, colBeam + '0)');
      ctx.fillStyle = grad;
      ctx.fillRect(x0, y0, w, h);
    }

    // 3. Harmor-Binarized Fixed-Interval Spectral Glyph Cells (Strict 0 or 1!)
    // Outside the beam (focus < 1), active cells swoosh vertically from their carrier ribbon
    // and smear horizontally like Harmor's `BLUR time` before snapping razor-sharp at focus -> 1!
    var cellPadX = colW > 4.5 ? 0.45 : 0.15;
    var cellPadY = rowH > 5.5 ? 0.65 : 0.25;

    for (var c = 0; c < cols; c++) {
      var cu = (c + 0.5) / cols;
      var cev = evalCoalesce(cu, pt, coal, bw);
      var focus = cev.focus;
      var dispC = 1 - focus;

      // Subtle Harmor time-blur horizontal stretch when dispersed
      var smearW = colW * (1 + dispC * 1.15);
      var bwDisp = (nibbles && nibbles.length >= 2 && sampleMono)
        ? sampleMono(nibbles, (cu + pt * 0.5) % 1)
        : Math.sin((cu * 4.0 + pt * 2.0) * Math.PI * 2);

      for (var r = 0; r < rows; r++) {
        if (grid[r * cols + c] !== 1) continue; // Strict 0 -> pure #000000 silence!

        var targetX = x0 + c * colW;
        var targetY = y0 + r * rowH;

        // Swooshing convergence displacement: smoothly collapses to 0 as focus -> 1
        var phaseOff = Math.sin((cu * (3 + r) - pt * 3.0) * Math.PI * 2) * 0.5 + bwDisp * 0.5;
        var dy = phaseOff * dispC * dispC * h * 0.36;
        var dx = (cu - pt) * dispC * dispC * w * 0.04;

        var drawX = clamp(targetX + dx - (smearW - colW) * 0.5 + cellPadX, x0, x0 + w - 1);
        var drawY = clamp(targetY + dy + cellPadY, y0, y0 + h - 1);
        var drawW = Math.max(1.1, smearW - cellPadX * 2);
        var drawH = Math.max(1.2, rowH - cellPadY * 2);

        // Strict Harmor binarized brightness when focused; luminous swoosh trail when dispersing
        if (hBin) {
          var alphaH = focus > 0.72 ? 1.0 : (0.28 + 0.72 * focus);
          ctx.fillStyle = focus > 0.90 && cev.beam > 0.78
            ? colBright
            : ('rgba(56, 255, 114, ' + alphaH.toFixed(3) + ')');
        } else {
          var alphaC = focus > 0.72 ? 0.96 : (0.25 + 0.70 * focus);
          ctx.fillStyle = cev.beam > 0.72
            ? ('rgba(255, 220, 128, ' + alphaC.toFixed(3) + ')')
            : ('rgba(77, 243, 221, ' + alphaC.toFixed(3) + ')');
        }
        ctx.fillRect(drawX, drawY, drawW, drawH);
      }
    }

    // 4. Vertical Harmor / FAS Playhead Scanline
    ctx.strokeStyle = hBin ? '#ffffff' : '#ffb84d';
    ctx.lineWidth = compact ? 1.0 : 1.5;
    ctx.beginPath();
    ctx.moveTo(scanX, y0);
    ctx.lineTo(scanX, y0 + h);
    ctx.stroke();

    // Active character highlight bracket at playT
    var activeCharIdx = Math.min(charCount - 1, Math.floor(pt * charCount));
    if (!compact && charCount > 0) {
      var bx0 = x0 + activeCharIdx * stride * colW;
      var bwSlot = GLYPH_W * colW;
      ctx.strokeStyle = hBin ? 'rgba(184, 255, 208, 0.72)' : 'rgba(255, 184, 77, 0.72)';
      ctx.lineWidth = 1;
      ctx.strokeRect(bx0, y0 + 0.5, bwSlot, h - 1);
    }

    ctx.restore();
    return { activeCharIdx: activeCharIdx, activeChar: mat.text.charAt(activeCharIdx) || '' };
  }

  // ---- Public State Getters / Setters ----
  function getConfig() {
    var row = currentRow();
    return {
      enabled: enabled,
      encoding: encoding,
      harmorBinary: harmorBinary,
      coalesce: coalesce,
      beamWidth: beamWidth,
      rowIndex: rowIndex,
      rowCount: lifecycleRows.length,
      stageId: stageId,
      sourceLabel: sourceLabel,
      row: row
    };
  }

  function setConfig(patch) {
    if (!patch || typeof patch !== 'object') return getConfig();
    if (patch.enabled != null) enabled = !!patch.enabled;
    if (patch.encoding === 'base58' || patch.encoding === 'hex' || patch.encoding === 'bin') {
      encoding = patch.encoding;
    }
    if (patch.harmorBinary != null) harmorBinary = !!patch.harmorBinary;
    if (patch.coalesce != null && isFinite(patch.coalesce)) {
      coalesce = clamp(Number(patch.coalesce), 0, 1);
    }
    if (patch.beamWidth != null && isFinite(patch.beamWidth)) {
      beamWidth = clamp(Number(patch.beamWidth), 0.05, 0.5);
    }
    if (patch.rowIndex != null && isFinite(patch.rowIndex)) {
      var len = Math.max(1, lifecycleRows.length);
      rowIndex = ((Math.round(Number(patch.rowIndex)) % len) + len) % len;
    }
    if (patch.stageId && STAGE_DEFS.some(function (s) { return s.id === patch.stageId; })) {
      stageId = patch.stageId;
    }
    cachedMatrixKey = '';
    notify();
    return getConfig();
  }

  function loadCsv(csvText, label) {
    var parsed = parseLifecycleCsv(csvText);
    if (!parsed.ok) return parsed;
    lifecycleRows = parsed.rows;
    rowIndex = 0;
    sourceLabel = label || ('CSV (' + parsed.rows.length + ' keypairs)');
    cachedMatrixKey = '';
    notify();
    return { ok: true, count: parsed.rows.length, row: currentRow(), sourceLabel: sourceLabel };
  }

  function loadBuiltinLifecycle() {
    lifecycleRows = BUILTIN_LIFECYCLE.slice();
    rowIndex = 0;
    sourceLabel = 'Built-in P2PKH Lifecycle';
    cachedMatrixKey = '';
    notify();
    return { ok: true, count: lifecycleRows.length, row: currentRow() };
  }

  function stepRow(delta) {
    return setConfig({ rowIndex: rowIndex + (Number(delta) || 1) });
  }

  function subscribe(fn) {
    if (typeof fn !== 'function') return function () {};
    listeners.push(fn);
    return function () {
      var idx = listeners.indexOf(fn);
      if (idx >= 0) listeners.splice(idx, 1);
    };
  }

  var api = {
    BASE58_ALPHABET: BASE58_ALPHABET,
    STAGE_DEFS: STAGE_DEFS,
    BUILTIN_LIFECYCLE: BUILTIN_LIFECYCLE,
    GLYPH_W: GLYPH_W,
    GLYPH_H: GLYPH_H,
    GLYPH_GAP: GLYPH_GAP,
    hexToBytes: hexToBytes,
    bytesToHex: bytesToHex,
    sha256Bytes: sha256Bytes,
    sha256Hex: sha256Hex,
    encodeBase58Bytes: encodeBase58Bytes,
    encodeBase58Hex: encodeBase58Hex,
    decodeBase58Bytes: decodeBase58Bytes,
    buildP2pkhSealHex: buildP2pkhSealHex,
    encodeBase58Check: encodeBase58Check,
    verifyBase58Check: verifyBase58Check,
    parseLifecycleCsv: parseLifecycleCsv,
    buildLcdMatrix: buildLcdMatrix,
    evalCoalesce: evalCoalesce,
    resolveLcdData: resolveLcdData,
    drawSwooshLcd: drawSwooshLcd,
    isEnabled: function () { return enabled; },
    getConfig: getConfig,
    setConfig: setConfig,
    getCurrentRow: currentRow,
    getStageHex: function (stId) { return stageHexForRow(currentRow(), stId || stageId); },
    loadCsv: loadCsv,
    loadBuiltinLifecycle: loadBuiltinLifecycle,
    stepRow: stepRow,
    subscribe: subscribe
  };

  Harmony.SynthLCD = api;
  if (typeof module !== 'undefined' && module && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
