/* ===== Harmony.BitWaveImport — read-only BitWave project / share-link import =====
   One DOM-free projection of a BitWave snapshot into the frames the sphere viewer
   draws. It never writes BitWave data back, never touches the DOM, never evaluates
   anything (expressions are carried as text) and never throws: every input yields
   the frozen success or failure envelope below.

   The schema authority is the sibling BitWave checkout, not this file:
     src/core/project.ts   `.bitwave` schema 1/2/3, strict schema-1 field
                           validation, lenient additive fields, routes/parked
     src/core/share.ts     `#bw=` unpadded-base64url(UTF-8 JSON), strict decode
     src/core/agent-state.ts  sources (dataset > route > stored), driven, focus
     src/core/derive.ts    Z = A <op> B; truthCounts index (a<<1)|b; add/sub wrap
     src/core/registers.ts fromHex/toHex right-align + truncate high bits
   BitWave toolset 1.1.0, `.bitwave` schema 3.

   Public API (frozen):
     IMPORT_SCHEMA_VERSION = 1
     PROJECT_SCHEMA_MAX    = 3
     WIDTHS                = [8, 16, 32, 64, 128, 256]
     LANE_KEYS             = ['1', '2', '3']
     FRAME_KEYS            = ['a', 'b', 'z']
     OPS                   = ['and', 'or', 'xor', 'add', 'sub']
     OP_SYMBOLS            = { and:'∧', or:'∨', xor:'⊕', add:'+', sub:'−' }
     FRAME_LABELS          = { '1':{a:'A',b:'B',z:'Z1'}, ... }
     ERROR_CODES           = six E_BITWAVE_* codes (closed set)
     bitwaveImport(input, opts) -> result
     importProject              alias of bitwaveImport

   Input: a project object (source 'file'), .bitwave JSON text ('file'), or a
   BitWave share link/hash/payload ('link'):
     'https://host/path#bw=PAYLOAD' | '#bw=PAYLOAD' | 'bw=PAYLOAD' | 'PAYLOAD'
   opts: { source?: 'file'|'link', name?: string } — anything else is ignored.

   Success (exact key order):
     { ok:true, importSchemaVersion:1, schemaVersion, width, lanes, focus,
       view, routes, provenance, warnings }
   Failure (exact key order):
     { ok:false, importSchemaVersion:1, error:{ code, message, hint? } }

   Values are plain JSON (BigInt is an internal detail), so a result round-trips
   through JSON.stringify/parse and can be compared across the page and Node.

   Load order: this is a classic script, so `window.Harmony` may not exist yet.
   It creates the namespace only if absent; Node's require() gets the API object. */
(function () {
  'use strict';

  // ---- Frozen vocabulary (mirrors BitWave src/core/{types,derive,agent-defaults}.ts) ----

  var IMPORT_SCHEMA_VERSION = 1;
  var PROJECT_SCHEMA_MAX = 3;
  var WIDTHS = [8, 16, 32, 64, 128, 256];
  var LANE_KEYS = ['1', '2', '3'];
  var FRAME_KEYS = ['a', 'b', 'z'];
  var OPS = ['and', 'or', 'xor', 'add', 'sub'];
  var OP_SYMBOLS = {
    and: '\u2227', // ∧
    or: '\u2228',  // ∨
    xor: '\u2295', // ⊕
    add: '+',
    sub: '\u2212'  // −
  };
  var FRAME_LABELS = {
    '1': { a: 'A', b: 'B', z: 'Z1' },
    '2': { a: 'C', b: 'D', z: 'Z2' },
    '3': { a: 'E', b: 'F', z: 'Z3' }
  };
  var ERROR_CODES = [
    'E_BITWAVE_INPUT',
    'E_BITWAVE_JSON',
    'E_BITWAVE_SHARE',
    'E_BITWAVE_SCHEMA',
    'E_BITWAVE_WIDTH',
    'E_BITWAVE_PROJECT'
  ];

  // Share codec constants (BitWave src/core/share.ts).
  var SHARE_PREFIX = 'bw=';
  var BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  // BitWave EXPRESSION_LIMITS.source.
  var EXPRESSION_MAX_CHARS = 4096;

  // ---- Internal failure channel --------------------------------------------------
  // Validation throws a plain marker object; bitwaveImport catches everything and
  // converts it to a failure envelope, so no caller ever sees a throw.

  function fail(code, message, hint) {
    throw { __bitwaveError: true, code: code, message: message, hint: hint };
  }

  function errorResult(code, message, hint) {
    var error = { code: code, message: message };
    if (typeof hint === 'string' && hint !== '') error.hint = hint;
    return { ok: false, importSchemaVersion: IMPORT_SCHEMA_VERSION, error: error };
  }

  // ---- Small helpers -------------------------------------------------------------

  function isPlainObjectish(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  function isInteger(value) {
    return typeof value === 'number' && isFinite(value) && Math.floor(value) === value;
  }

  function describeValue(value) {
    if (typeof value === 'string') return JSON.stringify(value);
    if (typeof value === 'number' || typeof value === 'boolean' ||
        value === null || value === undefined) return String(value);
    try {
      var json = JSON.stringify(value);
      return typeof json === 'string' ? json : String(value);
    } catch (e) {
      return String(value);
    }
  }

  function maskOf(N) {
    return (BigInt(1) << BigInt(N)) - BigInt(1);
  }

  // ---- Strict share codec (BitWave src/core/share.ts, mirrored) ------------------

  // Unpadded base64url -> bytes. Impossible length, non-alphabet characters and
  // any invalid/overlong/surrogate/truncated UTF-8 byte sequence are refused.
  function decodeSharePayload(payload) {
    if (payload.length % 4 === 1) {
      fail(
        'E_BITWAVE_SHARE',
        'BitWave share payload has an impossible base64url length',
        'Re-copy the complete share link from BitWave.'
      );
    }
    var bytes = new Uint8Array(Math.floor((payload.length * 3) / 4));
    var acc = 0;
    var bits = 0;
    var written = 0;
    for (var i = 0; i < payload.length; i++) {
      var value = BASE64URL.indexOf(payload.charAt(i));
      if (value < 0) {
        fail(
          'E_BITWAVE_SHARE',
          'BitWave share payload is not valid base64url',
          'Share links carry unpadded base64url(UTF-8 JSON); re-copy the link from BitWave.'
        );
      }
      acc = (acc << 6) | value;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        bytes[written++] = (acc >> bits) & 0xff;
      }
    }
    var text = decodeUtf8(bytes);
    var doc;
    try {
      doc = JSON.parse(text);
    } catch (e) {
      fail(
        'E_BITWAVE_SHARE',
        'BitWave share payload is not JSON',
        'The link fragment must be the unpadded base64url of a .bitwave document.'
      );
    }
    return doc;
  }

  // Strict UTF-8 decode: invalid lead bytes, overlong forms, out-of-range code
  // points, surrogate code points and truncated sequences are all refused.
  function decodeUtf8(bytes) {
    var bad = function () {
      fail(
        'E_BITWAVE_SHARE',
        'BitWave share payload is not valid UTF-8',
        'The share payload must be the UTF-8 encoding of the project JSON.'
      );
    };
    var out = '';
    var i = 0;
    while (i < bytes.length) {
      var lead = bytes[i];
      if (lead < 0x80) {
        out += String.fromCharCode(lead);
        i += 1;
        continue;
      }
      var need = 0;
      var cp = 0;
      var min = 0;
      if ((lead & 0xe0) === 0xc0) {
        need = 1;
        cp = lead & 0x1f;
        min = 0x80;
      } else if ((lead & 0xf0) === 0xe0) {
        need = 2;
        cp = lead & 0x0f;
        min = 0x800;
      } else if ((lead & 0xf8) === 0xf0) {
        need = 3;
        cp = lead & 0x07;
        min = 0x10000;
      } else {
        bad();
      }
      if (i + need >= bytes.length) bad(); // truncated
      for (var k = 1; k <= need; k++) {
        var next = bytes[i + k];
        if ((next & 0xc0) !== 0x80) bad(); // not a continuation byte
        cp = (cp << 6) | (next & 0x3f);
      }
      if (cp < min || cp > 0x10ffff) bad(); // overlong or out of range
      if (cp >= 0xd800 && cp <= 0xdfff) bad(); // surrogate code point
      i += need + 1;
      if (cp < 0x10000) {
        out += String.fromCharCode(cp);
      } else {
        var rest = cp - 0x10000;
        out += String.fromCharCode(0xd800 + (rest >> 10), 0xdc00 + (rest & 0x3ff));
      }
    }
    return out;
  }

  // ---- Input classification ------------------------------------------------------

  // Returns { doc, source:'file'|'link' }. Frozen classification:
  //   - JSON text (trim-starts with '{' or '[')        -> 'file', parse errors E_BITWAVE_JSON
  //   - contains '#bw=' or starts with 'bw='          -> 'link'
  //   - a pure [A-Za-z0-9_-]+ string                  -> 'link' (bare payload)
  //   - anything else                                 -> E_BITWAVE_INPUT
  var BASE64URL_ONLY = /^[A-Za-z0-9_-]+$/;

  function classifyInput(input) {
    if (isPlainObjectish(input)) return { doc: input, source: 'file' };
    if (typeof input !== 'string') {
      fail(
        'E_BITWAVE_INPUT',
        'BitWave import input must be a project object, .bitwave JSON text, or a BitWave share link',
        'Pass the parsed .bitwave document, its JSON text, or a URL/hash containing #bw=.'
      );
    }
    var text = input.trim();
    if (text.charAt(0) === '{' || text.charAt(0) === '[') {
      var parsed;
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        fail(
          'E_BITWAVE_JSON',
          'BitWave project JSON could not be parsed',
          'Check that the whole .bitwave document was pasted (JSON, no truncation).'
        );
      }
      return { doc: parsed, source: 'file' };
    }
    var payload;
    var hashAt = text.indexOf('#bw=');
    if (hashAt >= 0) {
      payload = text.slice(hashAt + 1 + SHARE_PREFIX.length); // skip '#' + 'bw='
    } else if (text.slice(0, SHARE_PREFIX.length) === SHARE_PREFIX) {
      payload = text.slice(SHARE_PREFIX.length);
    } else if (BASE64URL_ONLY.test(text)) {
      payload = text;
    } else {
      fail(
        'E_BITWAVE_INPUT',
        'BitWave import input is not a project document or a BitWave share link: ' +
          JSON.stringify(text.length > 80 ? text.slice(0, 80) + '\u2026' : text),
        'Pass the parsed .bitwave document, its JSON text, or a URL/hash containing #bw=.'
      );
    }
    if (payload === '') {
      fail(
        'E_BITWAVE_SHARE',
        'BitWave share payload is empty',
        'A share link carries #bw=<payload>; copy the full link from BitWave.'
      );
    }
    return { doc: decodeSharePayload(payload), source: 'link' };
  }

  // ---- Project validation (mirrors BitWave src/core/project.ts) -----------------

  function lenientFocus(value) {
    return value === 'a' || value === 'b' || value === 'z' ? value : 'a';
  }

  function lenientFrameVis(value) {
    var raw = isPlainObjectish(value) ? value : {};
    // Only an explicit false hides a frame; a missing or odd value keeps it visible.
    return { a: raw.a !== false, b: raw.b !== false, z: raw.z !== false };
  }

  function lenientExpressions(value) {
    var out = { a: null, b: null };
    if (!isPlainObjectish(value)) return out;
    for (var i = 0; i < 2; i++) {
      var frame = FRAME_KEYS[i];
      var text = value[frame];
      if (typeof text !== 'string') continue;
      var trimmed = text.trim();
      if (trimmed === '' || trimmed.length > EXPRESSION_MAX_CHARS) continue;
      out[frame] = trimmed;
    }
    return out;
  }

  function requireIntegerField(value, where) {
    if (!isInteger(value)) {
      fail(
        'E_BITWAVE_PROJECT',
        where + ' must be an integer',
        'Re-save the project in BitWave to repair the document.'
      );
    }
    return value;
  }

  // Mirrors BitWave registers.fromHex: trim, optional 0x, empty = zero, and an
  // over-wide value keeps its low N bits (the high digits are dropped). Unlike
  // BitWave we surface the loss as a deterministic warning.
  function parseHexField(text, N, where, warnings) {
    if (typeof text !== 'string') {
      fail(
        'E_BITWAVE_PROJECT',
        where + ' must be a hex string',
        'Re-save the project in BitWave to repair the document.'
      );
    }
    var clean = text.trim().replace(/^0[xX]/, '');
    if (!/^[0-9a-fA-F]*$/.test(clean)) {
      fail(
        'E_BITWAVE_PROJECT',
        where + ' is not hexadecimal: ' + describeValue(text),
        'Re-save the project in BitWave to repair the document.'
      );
    }
    var nibbles = N / 4;
    var truncated = false;
    var low = clean;
    if (clean.length > nibbles) {
      var high = clean.slice(0, clean.length - nibbles);
      truncated = /[1-9a-fA-F]/.test(high);
      low = clean.slice(clean.length - nibbles);
    }
    var value = low === '' ? BigInt(0) : BigInt('0x' + low);
    if (truncated) {
      warnings.push(
        where + ': hex value is wider than ' + N + ' bits; the high bits were truncated'
      );
    }
    return value;
  }

  // Port grammar is BitWave parsePort: /^([123])\.([abz])$/; Z is never a destination.
  var PORT_PATTERN = /^([123])\.([abz])$/;

  function parsePort(text, allowZ, where) {
    var match = typeof text === 'string' ? PORT_PATTERN.exec(text) : null;
    if (!match) {
      fail(
        'E_BITWAVE_PROJECT',
        where + ' is not a valid BitWave port: ' + describeValue(text) +
          ' (expected <lane>.<frame>)',
        'Ports are "1.a".."3.z": lanes 1-3 and frames a, b or z.'
      );
    }
    if (!allowZ && match[2] === 'z') {
      fail(
        'E_BITWAVE_PROJECT',
        'Z cannot be a destination port: ' + text,
        'Z is derived from A and B and is never routed into.'
      );
    }
    return { lane: match[1], frame: match[2] };
  }

  // Mirrors BitWave deserializeProject: routes validate when present; an absent or
  // non-array `routes` is leniently treated as none. mix defaults to "set".
  function parseRoutes(raw) {
    var routes = [];
    if (!Array.isArray(raw)) return routes;
    var seen = {};
    for (var i = 0; i < raw.length; i++) {
      var route = raw[i];
      if (!isPlainObjectish(route)) {
        fail(
          'E_BITWAVE_PROJECT',
          'routes[' + i + '] must be an object with from/to port strings',
          'Re-save the project in BitWave to repair the document.'
        );
      }
      if (typeof route.from !== 'string' || typeof route.to !== 'string') {
        fail(
          'E_BITWAVE_PROJECT',
          'routes[' + i + '] must have from and to port strings',
          'Re-save the project in BitWave to repair the document.'
        );
      }
      var from = parsePort(route.from, true, 'routes[' + i + '].from');
      var to = parsePort(route.to, false, 'routes[' + i + '].to');
      var mix = route.mix === 'set' || route.mix === 'add' || route.mix === 'xor'
        ? route.mix
        : 'set';
      var destination = to.lane + '.' + to.frame;
      if (seen[destination]) {
        fail(
          'E_BITWAVE_PROJECT',
          'two routes drive the same destination: ' + destination,
          'A routed input has exactly one source route in a .bitwave document.'
        );
      }
      seen[destination] = true;
      // Keep the document's validated port spelling and the normalized mix.
      routes.push({ from: route.from, to: route.to, mix: mix });
    }
    return routes;
  }

  // Mirrors BitWave's parked validation: every key is a destination port that a
  // route actually drives, and the value is valid hex at the project width.
  function validateParked(raw, routes, N) {
    if (raw === undefined || raw === null) return;
    if (!isPlainObjectish(raw)) {
      fail(
        'E_BITWAVE_PROJECT',
        'parked must be an object mapping destination ports to hex bases',
        'Re-save the project in BitWave to repair the document.'
      );
    }
    var keys = Object.keys(raw);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var port = parsePort(key, false, 'parked port');
      var destination = port.lane + '.' + port.frame;
      var matched = false;
      for (var j = 0; j < routes.length; j++) {
        if (routes[j].to === destination) { matched = true; break; }
      }
      if (!matched) {
        fail(
          'E_BITWAVE_PROJECT',
          'parked base for an unpatched input: ' + key,
          'Parked bases only exist for destinations a route drives.'
        );
      }
      // Values are not rendered, but must still be valid hex like BitWave requires.
      parseHexField(raw[key], N, 'parked.' + key, []);
    }
  }

  // BitWave lenientDataset: only an object with array `cols` and `rows` is usable.
  // The dataset is never rendered; it only names operand data sources.
  function usableDataset(raw) {
    if (!isPlainObjectish(raw)) return null;
    if (!Array.isArray(raw.cols) || !Array.isArray(raw.rows)) return null;
    return { cols: raw.cols, rows: raw.rows };
  }

  // ---- Derivation (mirrors BitWave src/core/derive.ts) ---------------------------

  function computeZ(a, b, N, op) {
    if (op === 'and') return a & b;
    if (op === 'or') return a | b;
    if (op === 'xor') return a ^ b;
    var mask = maskOf(N);
    if (op === 'add') return (a + b) & mask;
    return (a - b) & mask; // sub; BigInt bitwise gives the two's-complement low N bits
  }

  function popcountOf(value) {
    var count = 0;
    var v = value;
    while (v > BigInt(0)) {
      v &= v - BigInt(1);
      count += 1;
    }
    return count;
  }

  function truthCountsOf(a, b, N) {
    var counts = [0, 0, 0, 0];
    for (var i = 0; i < N; i++) {
      var aBit = (a >> BigInt(i)) & BigInt(1);
      var bBit = (b >> BigInt(i)) & BigInt(1);
      // BitWave: index = (aBits << 1) | bBits -> 00, 01, 10, 11.
      counts[Number((aBit << BigInt(1)) | bBit)] += 1;
    }
    return counts;
  }

  function hexOf(value, N) {
    var text = value.toString(16).toUpperCase();
    var nibbles = N / 4;
    while (text.length < nibbles) text = '0' + text;
    return text;
  }

  function frameOf(key, label, value, N) {
    var hex = hexOf(value, N);
    var nibbles = [];
    for (var i = 0; i < hex.length; i++) nibbles.push(parseInt(hex.charAt(i), 16));
    return { key: key, label: label, hex: hex, nibbles: nibbles, popcount: popcountOf(value) };
  }

  // ---- Sources / driven (mirrors BitWave src/core/agent-state.ts) ---------------

  function routeInto(routes, lane, frame) {
    var destination = lane + '.' + frame;
    for (var i = 0; i < routes.length; i++) {
      if (routes[i].to === destination) return routes[i];
    }
    return null;
  }

  function sourceFor(lane, frame, column, route, dataset) {
    // 1) A dataset column binding always wins over a route (BitWave order).
    if (column >= 0 && dataset && dataset.cols[column] !== undefined) {
      return { kind: 'dataset', column: String(dataset.cols[column]), index: column };
    }
    // 2) A route into this exact destination.
    if (route) {
      return {
        kind: 'route',
        from: route.from,
        mix: route.mix,
        sameLane: route.from.charAt(0) === lane
      };
    }
    // 3) The stored register bits.
    return { kind: 'stored' };
  }

  // ---- Document projection -------------------------------------------------------

  function importDocument(doc, detectedSource, opts) {
    if (!isPlainObjectish(doc)) {
      fail(
        'E_BITWAVE_PROJECT',
        'BitWave project must be a JSON object',
        'A .bitwave document is a JSON object with app "bitwave".'
      );
    }
    if (doc.app !== 'bitwave') {
      fail(
        'E_BITWAVE_PROJECT',
        'Not a BitWave project: app must be "bitwave"',
        'Open the file in BitWave to check it, then re-save or re-share.'
      );
    }

    var schema = doc.schema;
    if (schema === undefined || schema === null) {
      fail(
        'E_BITWAVE_SCHEMA',
        'BitWave project has no schema version (expected 1, 2 or 3)',
        'Open the file in BitWave to check it, then re-save or re-share.'
      );
    }
    if (!isInteger(schema)) {
      fail(
        'E_BITWAVE_SCHEMA',
        'BitWave project schema is not a valid integer: ' + describeValue(schema),
        'Expected one of the supported BitWave schemas: 1, 2 or 3.'
      );
    }
    if (schema > PROJECT_SCHEMA_MAX) {
      if (schema === 4) {
        fail(
          'E_BITWAVE_SCHEMA',
          'BitWave schema 4 is not supported by this viewer; update the viewer or re-save as schema 3.',
          'This viewer opens the read-only schemas 1-3; schema 4 is newer than it understands.'
        );
      }
      fail(
        'E_BITWAVE_SCHEMA',
        'BitWave schema ' + schema + ' is not supported by this viewer; supported schemas are 1, 2 and 3',
        'This viewer opens the read-only schemas 1-3.'
      );
    }
    if (schema < 1) {
      fail(
        'E_BITWAVE_SCHEMA',
        'BitWave schema ' + schema + ' is not supported by this viewer; supported schemas are 1, 2 and 3',
        'This viewer opens the read-only schemas 1-3.'
      );
    }

    var N = doc.N;
    if (!isInteger(N) || WIDTHS.indexOf(N) < 0) {
      if (N === undefined || N === null) {
        fail(
          'E_BITWAVE_WIDTH',
          'BitWave project has no width N; supported widths are 8, 16, 32, 64, 128 and 256',
          'A .bitwave document stores its shared register width as an integer N.'
        );
      }
      fail(
        'E_BITWAVE_WIDTH',
        'BitWave width ' + describeValue(N) + ' is not supported by this viewer; supported widths are 8, 16, 32, 64, 128 and 256',
        'BitWave registers are 8, 16, 32, 64, 128 or 256 bits wide.'
      );
    }

    var lanesDoc = doc.lanes;
    if (!isPlainObjectish(lanesDoc)) {
      fail(
        'E_BITWAVE_PROJECT',
        'BitWave project is missing its lanes object',
        'Re-save the project in BitWave to repair the document.'
      );
    }

    var warnings = [];
    var parsedLanes = {};

    // Schema-1 fields keep BitWave's strict validation. Additive schema-2/3
    // fields (focus, frameVis, expressions, edit, seededB, lfoB) are lenient.
    for (var laneIndex = 0; laneIndex < LANE_KEYS.length; laneIndex++) {
      var laneKey = LANE_KEYS[laneIndex];
      var rawLane = lanesDoc[laneKey];
      if (!isPlainObjectish(rawLane)) {
        fail(
          'E_BITWAVE_PROJECT',
          'BitWave project is missing lane ' + laneKey,
          'A .bitwave document always carries lanes 1, 2 and 3.'
        );
      }
      var lane = {
        a: parseHexField(rawLane.a, N, 'lanes.' + laneKey + '.a', warnings),
        b: parseHexField(rawLane.b, N, 'lanes.' + laneKey + '.b', warnings),
        binop: rawLane.binop,
        colA: undefined,
        colB: undefined
      };
      if (typeof rawLane.showB !== 'boolean') {
        fail(
          'E_BITWAVE_PROJECT',
          'lanes.' + laneKey + '.showB must be a boolean',
          'Re-save the project in BitWave to repair the document.'
        );
      }
      if (OPS.indexOf(lane.binop) < 0) {
        fail(
          'E_BITWAVE_PROJECT',
          'lanes.' + laneKey + '.binop must be one of ' + OPS.join(', ') +
            ': ' + describeValue(lane.binop),
          'Re-save the project in BitWave to repair the document.'
        );
      }
      lane.showB = rawLane.showB;
      lane.colA = requireIntegerField(rawLane.colA, 'lanes.' + laneKey + '.colA');
      lane.colB = requireIntegerField(rawLane.colB, 'lanes.' + laneKey + '.colB');
      lane.focus = lenientFocus(rawLane.focus);
      lane.frameVis = lenientFrameVis(rawLane.frameVis);
      lane.expressions = lenientExpressions(rawLane.expressions);
      parsedLanes[laneKey] = lane;
    }

    var routes = parseRoutes(doc.routes);
    validateParked(doc.parked, routes, N);

    var dataset = usableDataset(doc.dataset);

    var lanes = [];
    for (var i = 0; i < LANE_KEYS.length; i++) {
      var key = LANE_KEYS[i];
      var parsed = parsedLanes[key];
      var labels = FRAME_LABELS[key];
      var zBits = computeZ(parsed.a, parsed.b, N, parsed.binop);
      var routeA = routeInto(routes, key, 'a');
      var routeB = routeInto(routes, key, 'b');
      lanes.push({
        id: Number(key),
        op: parsed.binop,
        opSymbol: OP_SYMBOLS[parsed.binop],
        labels: { a: labels.a, b: labels.b, z: labels.z },
        frames: {
          a: frameOf('a', labels.a, parsed.a, N),
          b: frameOf('b', labels.b, parsed.b, N),
          z: frameOf('z', labels.z, zBits, N)
        },
        focus: parsed.focus,
        frameVis: parsed.frameVis,
        sources: {
          a: sourceFor(key, 'a', parsed.colA, routeA, dataset),
          b: sourceFor(key, 'b', parsed.colB, routeB, dataset)
        },
        driven: { a: routeA !== null, b: routeB !== null },
        expressions: {
          a: parsed.expressions.a,
          b: parsed.expressions.b
        },
        truthCounts: truthCountsOf(parsed.a, parsed.b, N)
      });
    }

    // Focus and 2-D/3-D view mode; schema-2/3 view extras are lenient.
    var viewDoc = isPlainObjectish(doc.view) ? doc.view : null;
    var focusedLaneKey =
      viewDoc && LANE_KEYS.indexOf(viewDoc.lane) >= 0 ? viewDoc.lane : '1';
    var view = viewDoc && viewDoc.split3d === true
      ? 'split'
      : viewDoc && viewDoc.view3d === true
        ? '3d'
        : '2d';
    var focusedLane = lanes[Number(focusedLaneKey) - 1];
    var focus = {
      lane: Number(focusedLaneKey),
      frame: focusedLane.focus,
      label: focusedLane.labels[focusedLane.focus]
    };

    // Provenance is snapshot metadata only; the viewer never re-saves.
    var source = detectedSource;
    if (isPlainObjectish(opts) && (opts.source === 'file' || opts.source === 'link')) {
      source = opts.source;
    }
    var provenance = { source: source };
    if (isPlainObjectish(opts) && typeof opts.name === 'string') {
      provenance.name = opts.name;
    }
    if (typeof doc.savedAt === 'string') {
      provenance.savedAt = doc.savedAt;
    }

    // Deterministic warning order: per-lane hex truncations (appended above),
    // then the snapshot-only dataset note.
    if (doc.dataset !== undefined && doc.dataset !== null) {
      warnings.push('dataset present but not rendered (read-only snapshot)');
    }

    return {
      ok: true,
      importSchemaVersion: IMPORT_SCHEMA_VERSION,
      schemaVersion: schema,
      width: N,
      lanes: lanes,
      focus: focus,
      view: view,
      routes: routes,
      provenance: provenance,
      warnings: warnings
    };
  }

  // ---- Public entry point --------------------------------------------------------

  function bitwaveImport(input, opts) {
    try {
      var classified = classifyInput(input);
      return importDocument(classified.doc, classified.source, opts);
    } catch (err) {
      if (err && err.__bitwaveError === true) {
        return errorResult(err.code, err.message, err.hint);
      }
      // Defensive: no input may ever make this module throw.
      return errorResult(
        'E_BITWAVE_INPUT',
        'BitWave import failed unexpectedly; the input was not read'
      );
    }
  }

  var BitWaveImport = {
    IMPORT_SCHEMA_VERSION: IMPORT_SCHEMA_VERSION,
    PROJECT_SCHEMA_MAX: PROJECT_SCHEMA_MAX,
    WIDTHS: WIDTHS,
    LANE_KEYS: LANE_KEYS,
    FRAME_KEYS: FRAME_KEYS,
    OPS: OPS,
    OP_SYMBOLS: OP_SYMBOLS,
    FRAME_LABELS: FRAME_LABELS,
    ERROR_CODES: ERROR_CODES,
    bitwaveImport: bitwaveImport,
    importProject: bitwaveImport
  };

  // Dual export: the browser keeps window.Harmony.BitWaveImport; Node's viewer,
  // verifier and tests require() this exact file (one implementation).
  if (typeof window !== 'undefined' && window) {
    if (!window.Harmony) window.Harmony = {};
    window.Harmony.BitWaveImport = BitWaveImport;
  }
  if (typeof module !== 'undefined' && module && module.exports) {
    module.exports = BitWaveImport;
  }
})();
