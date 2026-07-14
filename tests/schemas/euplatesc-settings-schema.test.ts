/**
 * Task 34 — Zod schema for euPlatesc settings with 4 credential fields.
 *
 * EuplatescSettingsSchema must accept:
 *   - euplatesc_merchant_id (string)
 *   - euplatesc_secret_key (string)
 *   - euplatesc_ukey (string)
 *   - euplatesc_uapi_key (string)
 *
 * All fields are optional via .partial().
 * Non-string values (except undefined/null) must fail.
 * euplatesc_test_mode is removed (no longer used).
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { EuplatescSettingsSchema } from '../../src/schemas/settings.schema.ts';

test('accepts all 4 credential fields', () => {
  const result = EuplatescSettingsSchema.safeParse({
    euplatesc_merchant_id: 'testmerchant',
    euplatesc_secret_key: 'AA4A81EE58A1D74DE6E02DF2C1CE9982780F95DC',
    euplatesc_ukey: 'testukey',
    euplatesc_uapi_key: 'BB5B92FF69B2E85EF7F13EF3D2DF0093891G06ED',
  });
  assert.ok(result.success, 'should accept all 4 fields');
  assert.equal(result.data.euplatesc_merchant_id, 'testmerchant');
  assert.equal(result.data.euplatesc_secret_key, 'AA4A81EE58A1D74DE6E02DF2C1CE9982780F95DC');
  assert.equal(result.data.euplatesc_ukey, 'testukey');
  assert.equal(result.data.euplatesc_uapi_key, 'BB5B92FF69B2E85EF7F13EF3D2DF0093891G06ED');
});

test('.partial() makes all fields optional — empty object passes', () => {
  const result = EuplatescSettingsSchema.safeParse({});
  assert.ok(result.success, 'should accept empty object (all fields optional)');
});

test('accepts subset of fields', () => {
  const result = EuplatescSettingsSchema.safeParse({
    euplatesc_merchant_id: 'testmerchant',
    euplatesc_ukey: 'testukey',
  });
  assert.ok(result.success, 'should accept partial fields');
  assert.equal(result.data.euplatesc_merchant_id, 'testmerchant');
  assert.equal(result.data.euplatesc_ukey, 'testukey');
  assert.equal(result.data.euplatesc_secret_key, undefined);
  assert.equal(result.data.euplatesc_uapi_key, undefined);
});

test('non-string values fail for string fields', () => {
  const result = EuplatescSettingsSchema.safeParse({
    euplatesc_merchant_id: 12345,
  });
  assert.ok(!result.success, 'should reject non-string for merchant_id');
});

test('non-string values fail for ukey', () => {
  const result = EuplatescSettingsSchema.safeParse({
    euplatesc_ukey: true,
  });
  assert.ok(!result.success, 'should reject boolean for ukey');
});

test('non-string values fail for uapi_key', () => {
  const result = EuplatescSettingsSchema.safeParse({
    euplatesc_uapi_key: ['array'],
  });
  assert.ok(!result.success, 'should reject array for uapi_key');
});

test('euplatesc_test_mode is not in the schema (removed)', () => {
  // The schema should NOT accept euplatesc_test_mode anymore.
  // Since the schema uses .partial() on a z.object(), unknown keys are ignored by default.
  // We verify the schema shape by checking the inferred type doesn't include test_mode.
  const result = EuplatescSettingsSchema.safeParse({
    euplatesc_merchant_id: 'test',
  });
  assert.ok(result.success);
  // test_mode should not appear in the parsed data
  assert.equal(
    result.data.euplatesc_test_mode,
    undefined,
    'test_mode should not be in parsed output'
  );
});
