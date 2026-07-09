/**
 * Settings semantics fix (r17 Task 4).
 *
 * (a) `order_number_padding` is stored/validated as a NUMBER — set 6, read back
 *     as the number 6 (not "6", not NaN). The settings accessor serializes
 *     numbers/booleans to strings at the storage boundary and deserializes on
 *     read via typed getters.
 * (b) `order_number_year` is a BOOLEAN include-year flag (not the literal year
 *     string): true → generated number includes `-YYYY` (current year); false →
 *     no year segment.
 * (c) The typed getters (`getSettingTyped`) return number/boolean, not string.
 * (d) `src/api/shop/settings/general.ts` PUT no longer uses a blanket
 *     `String(value)` coercion — it passes already-parsed values to the accessor.
 * (e) `generateOrderNumber` reads `order_number_year` as boolean and
 *     `order_number_padding` as number (no `parseInt` of a `z.string()`).
 *
 * See reespec/requests/shop-r17-data-integrity-hardening (settings-semantics-fix spec).
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { createTestDb, resetDb, type TestDb } from '../../db/harness.ts';
import { getSetting, getSettingBool, getSettingNumber, upsertSettingTyped } from '../../../src/lib/data/settings.ts';
import { generateOrderNumber } from '../../../src/lib/data/orders.ts';

let env: TestDb;
test('settings-typed: setup', async () => {
  env = await createTestDb();
  assert.ok(env.db);
});

test('order_number_padding is stored as a NUMBER and read back as number (not "6", not NaN)', async () => {
  const { db } = env;
  await resetDb(db);
  await upsertSettingTyped(db, 'order_number_padding', 6);
  // typed getter returns a number
  const val = await getSettingNumber(db, 'order_number_padding');
  assert.strictEqual(val, 6);
  assert.strictEqual(typeof val, 'number');
  // raw getSetting returns the serialized string at the storage boundary
  const raw = await getSetting(db, 'order_number_padding');
  assert.strictEqual(raw, '6');
});

test('order_number_year is a BOOLEAN — true serializes to "true", false to "false"', async () => {
  const { db } = env;
  await resetDb(db);
  await upsertSettingTyped(db, 'order_number_year', true);
  assert.strictEqual(await getSetting(db, 'order_number_year'), 'true');
  assert.strictEqual(await getSettingBool(db, 'order_number_year'), true);
  await upsertSettingTyped(db, 'order_number_year', false);
  assert.strictEqual(await getSetting(db, 'order_number_year'), 'false');
  assert.strictEqual(await getSettingBool(db, 'order_number_year'), false);
});

test('generateOrderNumber includes -YYYY when order_number_year=true (current year)', async () => {
  const { db } = env;
  await resetDb(db);
  await upsertSettingTyped(db, 'order_number_prefix', 'ORD');
  await upsertSettingTyped(db, 'order_number_year', true);
  await upsertSettingTyped(db, 'order_number_padding', 5);
  await upsertSettingTyped(db, 'order_number_sequence', 0);
  const num = await generateOrderNumber(db);
  const year = new Date().getFullYear();
  assert.match(num, new RegExp(`^ORD-${year}-00001$`), `expected ORD-${year}-00001, got ${num}`);
});

test('generateOrderNumber omits year when order_number_year=false', async () => {
  const { db } = env;
  await resetDb(db);
  await upsertSettingTyped(db, 'order_number_prefix', 'ORD');
  await upsertSettingTyped(db, 'order_number_year', false);
  await upsertSettingTyped(db, 'order_number_padding', 5);
  await upsertSettingTyped(db, 'order_number_sequence', 0);
  const num = await generateOrderNumber(db);
  assert.match(num, /^ORD-00001$/, `expected ORD-00001 (no year), got ${num}`);
});

test('generateOrderNumber uses numeric padding — padding=3 yields 001', async () => {
  const { db } = env;
  await resetDb(db);
  await upsertSettingTyped(db, 'order_number_prefix', 'ORD');
  await upsertSettingTyped(db, 'order_number_year', false);
  await upsertSettingTyped(db, 'order_number_padding', 3);
  await upsertSettingTyped(db, 'order_number_sequence', 0);
  const num = await generateOrderNumber(db);
  assert.strictEqual(num, 'ORD-001');
});

test('settings/general.ts PUT handler has NO blanket String(value) coercion', () => {
  const src = readFileSync(new URL('../../../src/api/shop/settings/general.ts', import.meta.url), 'utf-8');
  assert.doesNotMatch(src, /String\s*\(\s*value\s*\)/,
    'general.ts must not coerce parsed values with String(value); the settings accessor serializes at the storage boundary');
});

test('settings.schema.ts declares order_number_year as z.boolean() (include-year flag), not z.string()', () => {
  const src = readFileSync(new URL('../../../src/schemas/settings.schema.ts', import.meta.url), 'utf-8');
  // The line for order_number_year must use z.boolean, not z.string
  const yearLine = src.split('\n').find(l => l.includes('order_number_year'));
  assert.ok(yearLine, 'order_number_year must be declared in settings.schema.ts');
  assert.match(yearLine, /z\.boolean/, 'order_number_year must be z.boolean() (include-year flag)');
  assert.doesNotMatch(yearLine, /z\.string/, 'order_number_year must NOT be z.string()');
});

test('settings.schema.ts declares order_number_padding as z.number().int().min(1)', () => {
  const src = readFileSync(new URL('../../../src/schemas/settings.schema.ts', import.meta.url), 'utf-8');
  const padLine = src.split('\n').find(l => l.includes('order_number_padding'));
  assert.ok(padLine, 'order_number_padding must be declared');
  assert.match(padLine, /z\.number/, 'order_number_padding must be z.number()');
});
