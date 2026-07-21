/**
 * Tests for listEnabledPaymentProviders — the DB-driven payment provider
 * listing accessor.
 *
 * The accessor derives the set of enabled methods from shop_settings,
 * NOT from the in-memory provider registry. This ensures bank_transfer,
 * ramburs, and any future provider are never silently skipped by an
 * endpoint that forgot to import their modules.
 *
 * Parity tests: the accessor's result must agree with each registered
 * provider's isConfigured(db) for the same settings state.
 *
 * RED pattern: the accessor does not exist yet, so the get-module-then-call
 * pattern will throw TypeError (listEnabledPaymentProviders is undefined).
 * After ACTION, all tests pass.
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { createTestDb, resetDb } from '../../db/harness.ts';
import { ensureLoader } from '../../stubs/register.mjs';

ensureLoader();

// Lazy-import settings after transitions are done
let settingsMod: any;
let listFn: ((db: any) => Promise<string[]>) | undefined;

test('import settings module and capture listEnabledPaymentProviders', async () => {
  settingsMod = await import('../../../src/lib/data/settings.ts');
  listFn = settingsMod.listEnabledPaymentProviders;
  // If listFn is undefined, the import succeeded but the export doesn't exist.
  // The test still passes (we captured the state). Behavioral tests will fail.
});

// ── Behavioral tests ──
// These will fail before ACTION because listFn is undefined (TypeError).
// After ACTION they pass.

test('empty settings → only ramburs (default-on)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await resetDb(db);
    const result = await listFn!(db);
    assert.deepStrictEqual(result, ['ramburs']);
  } finally {
    await cleanup();
  }
});

test('stripe configured → includes stripe and ramburs', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await resetDb(db);
    await settingsMod.upsertSetting(db, 'stripe_secret_key', 'sk_test_x');
    const result = await listFn!(db);
    assert.ok(result.includes('stripe'));
    assert.ok(result.includes('ramburs'));
  } finally {
    await cleanup();
  }
});

test('euplatesc mid + secret → includes euplatesc', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await resetDb(db);
    await settingsMod.upsertSetting(db, 'euplatesc_merchant_id', '44841007584');
    await settingsMod.upsertSetting(db, 'euplatesc_secret_key', 'AA...EE');
    const result = await listFn!(db);
    assert.ok(result.includes('euplatesc'));
  } finally {
    await cleanup();
  }
});

test('only euplatesc mid (no secret) → euplatesc excluded', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await resetDb(db);
    await settingsMod.upsertSetting(db, 'euplatesc_merchant_id', '44841007584');
    const result = await listFn!(db);
    assert.ok(!result.includes('euplatesc'));
  } finally {
    await cleanup();
  }
});

test('bank_transfer beneficiary + iban → includes bank_transfer', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await resetDb(db);
    await settingsMod.upsertSetting(db, 'bank_transfer_beneficiary', 'Pelerin SRL');
    await settingsMod.upsertSetting(db, 'bank_transfer_iban', 'RO49AAAA...');
    const result = await listFn!(db);
    assert.ok(result.includes('bank_transfer'));
  } finally {
    await cleanup();
  }
});

test('only bank_transfer beneficiary (no iban) → bank_transfer excluded', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await resetDb(db);
    await settingsMod.upsertSetting(db, 'bank_transfer_beneficiary', 'Pelerin SRL');
    const result = await listFn!(db);
    assert.ok(!result.includes('bank_transfer'));
  } finally {
    await cleanup();
  }
});

test('ramburs disabled → excluded; re-enabled → included', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await resetDb(db);
    await settingsMod.upsertSetting(db, 'ramburs_enabled', 'false');
    let result = await listFn!(db);
    assert.ok(!result.includes('ramburs'));
    await settingsMod.upsertSetting(db, 'ramburs_enabled', 'true');
    result = await listFn!(db);
    assert.ok(result.includes('ramburs'));
  } finally {
    await cleanup();
  }
});

test('all four configured → returns all four (order-insensitive)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await resetDb(db);
    await settingsMod.upsertSetting(db, 'stripe_secret_key', 'sk_test_x');
    await settingsMod.upsertSetting(db, 'euplatesc_merchant_id', '44841007584');
    await settingsMod.upsertSetting(db, 'euplatesc_secret_key', 'AA...EE');
    await settingsMod.upsertSetting(db, 'bank_transfer_beneficiary', 'Pelerin SRL');
    await settingsMod.upsertSetting(db, 'bank_transfer_iban', 'RO49AAAA...');
    const result = await listFn!(db);
    assert.equal(result.length, 4);
    for (const name of ['stripe', 'euplatesc', 'bank_transfer', 'ramburs']) {
      assert.ok(result.includes(name), `should include ${name}`);
    }
  } finally {
    await cleanup();
  }
});

test('parity: accessor agrees with each provider isConfigured for several states', async () => {
  // Import all provider modules to register them in the registry
  await import('../../../src/providers/payment/stripe');
  await import('../../../src/providers/payment/euplatesc');
  await import('../../../src/providers/payment/bank_transfer');
  await import('../../../src/providers/payment/ramburs');
  const { listProviders } = await import('../../../src/providers/payment/registry');
  const providers = listProviders();
  assert.equal(providers.length, 4);

  const { db, cleanup } = await createTestDb();
  try {
    // State 1: empty settings
    await resetDb(db);
    let names = await listFn!(db);
    let configured = (
      await Promise.all(providers.map(async (p) => [p.name, await p.isConfigured(db)] as const))
    )
      .filter(([, c]) => c)
      .map(([n]) => n);
    assert.deepStrictEqual(names.sort(), configured.sort());

    // State 2: stripe only + ramburs off
    await settingsMod.upsertSetting(db, 'stripe_secret_key', 'sk_test_x');
    await settingsMod.upsertSetting(db, 'ramburs_enabled', 'false');
    names = await listFn!(db);
    configured = (
      await Promise.all(providers.map(async (p) => [p.name, await p.isConfigured(db)] as const))
    )
      .filter(([, c]) => c)
      .map(([n]) => n);
    assert.deepStrictEqual(names.sort(), configured.sort());

    // State 3: bank_transfer configured + ramburs default
    await settingsMod.upsertSetting(db, 'bank_transfer_beneficiary', 'Pelerin SRL');
    await settingsMod.upsertSetting(db, 'bank_transfer_iban', 'RO49...');
    names = await listFn!(db);
    configured = (
      await Promise.all(providers.map(async (p) => [p.name, await p.isConfigured(db)] as const))
    )
      .filter(([, c]) => c)
      .map(([n]) => n);
    assert.deepStrictEqual(names.sort(), configured.sort());

    // State 4: all four
    await settingsMod.upsertSetting(db, 'stripe_secret_key', 'sk_test_x');
    await settingsMod.upsertSetting(db, 'euplatesc_merchant_id', '44841007584');
    await settingsMod.upsertSetting(db, 'euplatesc_secret_key', 'AA...EE');
    await settingsMod.upsertSetting(db, 'ramburs_enabled', 'true');
    names = await listFn!(db);
    configured = (
      await Promise.all(providers.map(async (p) => [p.name, await p.isConfigured(db)] as const))
    )
      .filter(([, c]) => c)
      .map(([n]) => n);
    assert.deepStrictEqual(names.sort(), configured.sort());
  } finally {
    await cleanup();
  }
});
