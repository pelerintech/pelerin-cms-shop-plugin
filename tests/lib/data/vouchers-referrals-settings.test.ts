import { test } from 'node:test';
import assert from 'node:assert';
import { createTestDb, seedMinimal, resetDb, insertFixture, buildOrderRow } from '../../db/harness.ts';
import { getVoucherByCode, incrementVoucherUsage } from '../../../src/lib/data/vouchers.ts';
import { getReferralByCode, countOrdersByReferralCodes } from '../../../src/lib/data/referrals.ts';
import { getSettings, getShopConfig, upsertSetting } from '../../../src/lib/data/settings.ts';

test('getVoucherByCode returns active voucher by code (case-insensitive)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const v = await getVoucherByCode(db, 'save10');
    assert.ok(v, 'must find SAVE10 voucher');
    assert.strictEqual(v!.code, 'SAVE10');
    assert.strictEqual(v!.active, true);
  } finally {
    await cleanup();
  }
});

test('getVoucherByCode returns null for nonexistent code', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const v = await getVoucherByCode(db, 'NONEXISTENT');
    assert.strictEqual(v, null);
  } finally {
    await cleanup();
  }
});

test('getVoucherByCode returns null on empty db', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const v = await getVoucherByCode(db, 'SAVE10');
    assert.strictEqual(v, null);
  } finally {
    await cleanup();
  }
});

test('incrementVoucherUsage increments uses_count', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const v = await getVoucherByCode(db, 'SAVE10');
    const before = v!.uses_count;
    await incrementVoucherUsage(db, v!.id);
    const after = await getVoucherByCode(db, 'SAVE10');
    assert.strictEqual(after!.uses_count, before + 1);
  } finally {
    await cleanup();
  }
});

test('getReferralByCode returns active referral by code', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const r = await getReferralByCode(db, 'partner10');
    assert.ok(r, 'must find PARTNER10 referral');
    assert.strictEqual(r!.active, true);
    assert.strictEqual(r!.discount_type, 'percentage');
  } finally {
    await cleanup();
  }
});

test('getReferralByCode returns null for nonexistent code', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const r = await getReferralByCode(db, 'NONEXISTENT');
    assert.strictEqual(r, null);
  } finally {
    await cleanup();
  }
});

test('getSettings returns all settings as a keyed object', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const settings = await getSettings(db);
    assert.ok(settings.locales, 'must have locales setting');
    assert.ok(settings.currencies, 'must have currencies setting');
    assert.ok(settings.order_number_prefix, 'must have order_number_prefix');
  } finally {
    await cleanup();
  }
});

test('getShopConfig JSON-parses locales and currencies', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const config = await getShopConfig(db);
    assert.ok(Array.isArray(config.locales), 'locales must be an array');
    assert.ok(config.locales.length >= 2, 'must have at least ro + en');
    assert.ok(Array.isArray(config.currencies), 'currencies must be an array');
    assert.strictEqual(config.defaultLocale, 'ro');
    assert.strictEqual(config.defaultCurrency, 'RON');
  } finally {
    await cleanup();
  }
});

test('upsertSetting inserts then updates a setting', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    await upsertSetting(db, 'test_key', 'value1');
    assert.strictEqual(await (await import('../../../src/lib/data/settings.ts')).getSetting(db, 'test_key'), 'value1');
    await upsertSetting(db, 'test_key', 'value2');
    assert.strictEqual(await (await import('../../../src/lib/data/settings.ts')).getSetting(db, 'test_key'), 'value2');
  } finally {
    await cleanup();
  }
});

test('getSettings on empty db returns {}', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const settings = await getSettings(db);
    assert.strictEqual(Object.keys(settings).length, 0);
  } finally {
    await cleanup();
  }
});

test('countOrdersByReferralCodes returns correct counts excluding cancelled/refunded', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    // Insert 3 orders: 1 paid + referral, 1 cancelled + referral, 1 paid no referral
    await insertFixture(db, 'orders', buildOrderRow({ referral_code: 'PARTNER10', status: 'paid' }));
    await insertFixture(db, 'orders', buildOrderRow({ referral_code: 'PARTNER10', status: 'cancelled' }));
    await insertFixture(db, 'orders', buildOrderRow({ referral_code: null, status: 'paid' }));
    const counts = await countOrdersByReferralCodes(db, ['PARTNER10']);
    assert.strictEqual(counts.get('PARTNER10'), 1, 'PARTNER10 should have 1 count (cancelled excluded)');
  } finally {
    await cleanup();
  }
});

test('countOrdersByReferralCodes returns empty map for codes with no orders', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const counts = await countOrdersByReferralCodes(db, ['NONEXISTENT']);
    assert.ok(counts.has('NONEXISTENT') === false, 'nonexistent code should not appear in map');
    assert.strictEqual(counts.size, 0, 'map should be empty');
  } finally {
    await cleanup();
  }
});

test('countOrdersByReferralCodes returns empty map on empty codes array', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const counts = await countOrdersByReferralCodes(db, []);
    assert.strictEqual(counts.size, 0, 'empty codes array should return empty map');
  } finally {
    await cleanup();
  }
});

test('countOrdersByReferralCodes on empty db returns empty map', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const counts = await countOrdersByReferralCodes(db, ['PARTNER10']);
    assert.strictEqual(counts.size, 0, 'empty db should return empty map');
  } finally {
    await cleanup();
  }
});
