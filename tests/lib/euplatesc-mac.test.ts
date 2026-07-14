import { describe, it } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';

// Import the function — will fail because it doesn't exist yet
import { computeEuplatescHash } from '../../src/lib/euplatesc-mac.ts';

describe('euPlatesc MAC computation', () => {
  it('produces correct HMAC-MD5 hash from official JS sample', () => {
    // Official euPlatesc JS sample values:
    // Fields: ["1.00","RON","123","Test payment","testaccount","20181205105150","522d2594b9d65b850aa01dfc4914ea14"]
    // Key: "00112233445566778899AABBCCDDEEFF"
    // Expected MAC string: "41.003RON312313Test payment12testaccount142018120510515032522d2594b9d65b850aa01dfc4914ea14"
    //
    // The official JS code does:
    //   const binKey = Buffer.from("00112233445566778899AABBCCDDEEFF", "hex");
    //   const mac = crypto.createHmac("md5", binKey).update(macString, "utf8").digest("hex");
    //   return mac.toUpperCase();
    //
    // We compute the expected value inline using the same algorithm:
    const fields = [
      '1.00',
      'RON',
      '123',
      'Test payment',
      'testaccount',
      '20181205105150',
      '522d2594b9d65b850aa01dfc4914ea14',
    ];
    const key = '00112233445566778899AABBCCDDEEFF';

    // Build expected MAC string: length-prefixed per field
    // "1.00"(4) "RON"(3) "123"(3) "Test payment"(12) "testaccount"(11) "20181205105150"(14) "522d2594..."(32)
    const macString =
      '41.003RON312312Test payment11testaccount142018120510515032522d2594b9d65b850aa01dfc4914ea14';

    // Compute expected hash using the correct algorithm
    const binKey = Buffer.from(key, 'hex');
    const expectedHash = crypto.createHmac('md5', binKey).update(macString, 'utf8').digest('hex');

    const result = computeEuplatescHash(fields, key);

    // Result is lowercase hex (caller uppercases if needed for request)
    assert.strictEqual(
      result.toLowerCase(),
      expectedHash.toLowerCase(),
      'HMAC-MD5 hash must match the official JS sample output'
    );
  });

  it('MAC string is length-prefixed, not raw-joined', () => {
    const fields = ['1.00', 'RON', '123'];
    const key = '00112233445566778899AABBCCDDEEFF';

    // If the function were raw-joining: "1.00RON123"
    // Correct MAC string: "41.003RON3123"
    const rawJoined = '1.00RON123';
    const rawHash = crypto.createHash('md5').update(rawJoined).digest('hex');

    const result = computeEuplatescHash(fields, key);

    // Result must NOT equal plain MD5 of raw-joined string
    assert.notStrictEqual(
      result.toLowerCase(),
      rawHash,
      'Result must not be plain MD5 of raw-joined values (must be HMAC-MD5 with length prefixes)'
    );
  });

  it('result differs from plain crypto.createHash("md5")', () => {
    const fields = [
      '1.00',
      'RON',
      '123',
      'Test payment',
      'testaccount',
      '20181205105150',
      '522d2594b9d65b850aa01dfc4914ea14',
    ];
    const key = '00112233445566778899AABBCCDDEEFF';
    const macString =
      '41.003RON312313Test payment12testaccount142018120510515032522d2594b9d65b850aa01dfc4914ea14';

    const plainMd5 = crypto.createHash('md5').update(macString).digest('hex');
    const result = computeEuplatescHash(fields, key);

    assert.notStrictEqual(
      result.toLowerCase(),
      plainMd5,
      'Result must differ from plain MD5 (proving HMAC is used, not hash)'
    );
  });

  it('null/undefined values contribute dash to MAC string', () => {
    const key = '00112233445566778899AABBCCDDEEFF';

    // Test with null
    const resultNull = computeEuplatescHash([null, 'RON'], key);
    // Test with undefined
    const resultUndefined = computeEuplatescHash([undefined, 'RON'], key);
    // Test with empty string
    const resultEmpty = computeEuplatescHash(['', 'RON'], key);

    // All three should produce the same MAC string: "-3RON"
    // (dash for empty/null/undefined, then "3" + "RON")
    const expectedMacString = '-3RON';
    const binKey = Buffer.from(key, 'hex');
    const expectedHash = crypto
      .createHmac('md5', binKey)
      .update(expectedMacString, 'utf8')
      .digest('hex');

    assert.strictEqual(
      resultNull.toLowerCase(),
      expectedHash,
      'null value must contribute dash to MAC string'
    );
    assert.strictEqual(
      resultUndefined.toLowerCase(),
      expectedHash,
      'undefined value must contribute dash to MAC string'
    );
    assert.strictEqual(
      resultEmpty.toLowerCase(),
      expectedHash,
      'empty string must contribute dash to MAC string'
    );
  });

  it('key is hex-decoded to binary, not used as raw string', () => {
    const fields = ['1.00', 'RON'];
    const key = '00112233445566778899AABBCCDDEEFF';

    // If key were used as raw UTF-8 string instead of hex-decoded binary:
    const rawKey = key; // 32-char hex string
    const macString = '41.003RON';
    const wrongHash = crypto.createHmac('md5', rawKey).update(macString, 'utf8').digest('hex');

    const result = computeEuplatescHash(fields, key);

    assert.notStrictEqual(
      result.toLowerCase(),
      wrongHash,
      'Result must not use the key as a raw string (must be hex-decoded to binary)'
    );
  });
});
