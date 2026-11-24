import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const SynthLCD = require('../js/synth-lcd.js');

test('SHA-256 matches FIPS 180-4 & Bitcoin Generator G compressed pubkey vector', () => {
  // SHA-256("abc") = BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD
  const abcBytes = new Uint8Array([0x61, 0x62, 0x63]);
  assert.equal(
    SynthLCD.bytesToHex(SynthLCD.sha256Bytes(abcBytes)),
    'BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD'
  );
  // Compressed secp256k1 G
  const pubG = '0279BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798';
  assert.equal(
    SynthLCD.sha256Hex(pubG),
    '0F715BAF5D4C2ED329785CEF29E562F73488C8A2BB9DBC5700B361D54B9B0554'
  );
});

test('Base58Check produces authentic Bitcoin P2PKH addresses for K=1, K=2, and Genesis', () => {
  // K = 1 compressed HASH160 -> 1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH
  assert.equal(
    SynthLCD.encodeBase58Check('751E76E8199196D454941C45D1B3A323F1433BD6', '00'),
    '1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH'
  );
  // K = 2 compressed HASH160 -> 1cMh228HTCiwS8ZsaakH8A8wze1JR5ZsP
  assert.equal(
    SynthLCD.encodeBase58Check('06AFD46BCDFD22EF94AC122AA11F241244A37ECC', '00'),
    '1cMh228HTCiwS8ZsaakH8A8wze1JR5ZsP'
  );
  // Bitcoin Genesis Block coinbase HASH160 -> 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa
  assert.equal(
    SynthLCD.encodeBase58Check('62E907B15CBF27D5425399EBF6F0FB50EBB88F18', '00'),
    '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'
  );

  const seal = SynthLCD.buildP2pkhSealHex('62E907B15CBF27D5425399EBF6F0FB50EBB88F18', '00');
  assert.equal(seal.length, 50); // 25 bytes = 200 bits
  assert.equal(SynthLCD.verifyBase58Check(seal).valid, true);
  // Flip last hex digit -> invalid checksum
  const badSeal = seal.slice(0, 49) + (seal.endsWith('0') ? '1' : '0');
  assert.equal(SynthLCD.verifyBase58Check(badSeal).valid, false);
});

test('Base58 roundtrip preserves leading zero bytes', () => {
  const hex = '0000751E76E8199196D454941C45D1B3A323F1433BD6';
  const b58 = SynthLCD.encodeBase58Hex(hex);
  assert.ok(b58.startsWith('11'));
  const back = SynthLCD.bytesToHex(SynthLCD.decodeBase58Bytes(b58));
  assert.equal(back, hex);
});

test('parseLifecycleCsv handles both headered and headerless Bitcoin lifecycle CSVs', () => {
  const csvHeadered = [
    'K,CurvePoint,SHA_Digest,RIPE_Digest,Checksum_Seal,Base58_Address',
    '0000000000000000000000000000000000000000000000000000000000000001,0279BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798,,751E76E8199196D454941C45D1B3A323F1433BD6,,'
  ].join('\n');
  const res1 = SynthLCD.parseLifecycleCsv(csvHeadered);
  assert.equal(res1.ok, true);
  assert.equal(res1.detectedHeader, true);
  assert.equal(res1.rows.length, 1);
  // Auto-computed SHA, Checksum Seal, and Base58 when blank
  assert.equal(res1.rows[0].sha, '0F715BAF5D4C2ED329785CEF29E562F73488C8A2BB9DBC5700B361D54B9B0554');
  assert.equal(res1.rows[0].base58, '1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH');
  assert.equal(res1.rows[0].checksumValid, true);

  // Headerless 6-column CSV
  const csvBare = '0000000000000000000000000000000000000000000000000000000000000002,02C6047F9441ED7D6D3045406E95C07CD85C778E4B8CEF3CA7ABAC09B95C709EE5,B1C9938F01121E159887AC2C8D393A22E4476FF8212DE13FE1939DE2A236F0A7,06AFD46BCDFD22EF94AC122AA11F241244A37ECC,,';
  const res2 = SynthLCD.parseLifecycleCsv(csvBare);
  assert.equal(res2.ok, true);
  assert.equal(res2.detectedHeader, false);
  assert.equal(res2.rows[0].base58, '1cMh228HTCiwS8ZsaakH8A8wze1JR5ZsP');
  assert.equal(res2.rows[0].checksumValid, true);
});

test('buildLcdMatrix produces strict 0/1 Harmor binarized bitmap with fixed-interval guard bands', () => {
  const mat = SynthLCD.buildLcdMatrix('1A1zP1');
  assert.equal(mat.charCount, 6);
  assert.equal(mat.rows, 7);
  assert.equal(mat.cols, 6 * 6 - 1); // 5px glyph + 1px guard gap
  // Every cell must be strictly binary 0 or 1 (Harmor green-on-black cleanliness)
  let ones = 0;
  for (let i = 0; i < mat.grid.length; i++) {
    assert.ok(mat.grid[i] === 0 || mat.grid[i] === 1);
    ones += mat.grid[i];
  }
  assert.ok(ones > 30, 'glyph pixels must be lit');
  // Guard column between char 0 and char 1 (col index 5) must be pure silence (0) across all rows
  for (let r = 0; r < mat.rows; r++) {
    assert.equal(mat.grid[r * mat.cols + 5], 0);
  }
  // Row frequencies decrease monotonically from row 0 (top/high Hz) to row 6 (bottom/low Hz)
  assert.ok(mat.rowHz[0] > mat.rowHz[mat.rows - 1]);
});

test('System A evalCoalesce peaks at travelling focus beam and saturates to 1 at coalesce=1', () => {
  const atBeam = SynthLCD.evalCoalesce(0.5, 0.5, 0, 0.16);
  const far = SynthLCD.evalCoalesce(0.0, 0.5, 0, 0.16);
  assert.ok(atBeam.focus > 0.99);
  assert.ok(far.focus < 0.05);
  // Cyclic wrap-around near 0 / 1 boundary
  const wrapped = SynthLCD.evalCoalesce(0.98, 0.01, 0, 0.16);
  assert.ok(wrapped.focus > 0.9);
  // Full global lock when coalesce = 1
  assert.equal(SynthLCD.evalCoalesce(0.0, 0.5, 1, 0.16).focus, 1);
});

test('SynthLCD starts dormant on mount so default state stays untouched', () => {
  assert.equal(SynthLCD.isEnabled(), false);
  const cfg = SynthLCD.getConfig();
  assert.equal(cfg.harmorBinary, true);
  assert.equal(cfg.encoding, 'base58');
  assert.equal(cfg.rowCount, 3);
});
