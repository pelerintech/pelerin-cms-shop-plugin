/**
 * Task 35 — Settings GET/PUT handle 4 euPlatesc fields, encrypt uapi_key.
 *
 * The euPlatesc settings handler must support 4 credential fields:
 * - euplatesc_merchant_id (stored plaintext)
 * - euplatesc_secret_key (stored encrypted, masked in GET)
 * - euplatesc_ukey (stored plaintext)
 * - euplatesc_uapi_key (stored encrypted, masked in GET)
 */
import { test } from 'node:test';
import { ensureLoader } from '../../../../stubs/register.mjs';
import {
  createTestDb,
  seedMinimal,
  makeFakeSdk,
  makeCtx,
  assert,
} from '../../_matrix.ts';
import { shop_settings } from '../../../../db/harness.ts';

// crypto.encrypt requires an encryption key at call-time.
process.env.BETTER_AUTH_SECRET = 'test-secret-for-euplatesc-4fields';

ensureLoader();
const { runGet, runPut } = await import('../../../../../src/api/shop/settings/payments/euplatesc.ts');

const URL = 'http://localhost/api/plugins/shop/settings/payments/euplatesc';

test('PUT all 4 fields → stored correctly, uapi_key encrypted', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: URL, method: 'PUT',
      body: {
        euplatesc_merchant_id: 'testmerchant',
        euplatesc_secret_key: 'AA4A81EE58A1D74DE6E02DF2C1CE9982780F95DC',
        euplatesc_ukey: 'testukey123',
        euplatesc_uapi_key: 'BB5B92FF69B2E85EF7F13EF3D2DF0093891G06ED',
      },
    });
    const res = await runPut({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await res.json();
    assert.equal(b.success, true);

    // Verify values in DB
    const { eq } = await import('drizzle-orm');

    const [midRow] = await db.select().from(shop_settings).where(eq(shop_settings.key, 'euplatesc_merchant_id'));
    assert.equal(midRow.value, 'testmerchant', 'merchant_id stored plaintext');

    const [keyRow] = await db.select().from(shop_settings).where(eq(shop_settings.key, 'euplatesc_secret_key'));
    assert.notEqual(keyRow.value, 'AA4A81EE58A1D74DE6E02DF2C1CE9982780F95DC', 'secret_key should be encrypted');
    assert.ok(keyRow.value.includes(':'), 'secret_key should be encrypted (iv:tag:ct format)');

    const [ukeyRow] = await db.select().from(shop_settings).where(eq(shop_settings.key, 'euplatesc_ukey'));
    assert.equal(ukeyRow.value, 'testukey123', 'ukey stored plaintext');

    const [uapiKeyRow] = await db.select().from(shop_settings).where(eq(shop_settings.key, 'euplatesc_uapi_key'));
    assert.notEqual(uapiKeyRow.value, 'BB5B92FF69B2E85EF7F13EF3D2DF0093891G06ED', 'uapi_key should be encrypted');
    assert.ok(uapiKeyRow.value.includes(':'), 'uapi_key should be encrypted (iv:tag:ct format)');
  } finally {
    await cleanup();
  }
});

test('GET returns all 4 fields, masks secret_key and uapi_key', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    // Pre-seed settings
    await db.insert(shop_settings).values([
      { id: 's1', key: 'euplatesc_merchant_id', value: 'testmerchant' },
      { id: 's2', key: 'euplatesc_secret_key', value: 'encrypted:AA4A...' },
      { id: 's3', key: 'euplatesc_ukey', value: 'testukey123' },
      { id: 's4', key: 'euplatesc_uapi_key', value: 'encrypted:BB5B...' },
    ]);

    const sdk = makeFakeSdk();
    const ctx = makeCtx({ url: URL, method: 'GET' });
    const res = await runGet({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await res.json();
    assert.equal(b.success, true);

    assert.equal(b.data.euplatesc_merchant_id, 'testmerchant', 'merchant_id returned plaintext');
    assert.ok(b.data.euplatesc_secret_key.startsWith('****'), 'secret_key should be masked');
    assert.equal(b.data.euplatesc_ukey, 'testukey123', 'ukey returned plaintext');
    assert.ok(b.data.euplatesc_uapi_key.startsWith('****'), 'uapi_key should be masked');
  } finally {
    await cleanup();
  }
});

test('GET returns null for missing fields', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    // No euPlatesc settings seeded

    const sdk = makeFakeSdk();
    const ctx = makeCtx({ url: URL, method: 'GET' });
    const res = await runGet({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await res.json();
    assert.equal(b.success, true);

    assert.equal(b.data.euplatesc_merchant_id, null);
    assert.equal(b.data.euplatesc_secret_key, null);
    assert.equal(b.data.euplatesc_ukey, null);
    assert.equal(b.data.euplatesc_uapi_key, null);
  } finally {
    await cleanup();
  }
});

test('PUT auth required → 401', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const sdk = makeFakeSdk({ authThrows: Object.assign(new Error('Unauthorized'), { status: 401 }) });
    const ctx = makeCtx({ url: URL, method: 'PUT', body: { euplatesc_merchant_id: 'test' } });
    const res = await runPut({ db, sdk, ctx });
    assert.equal(res.status, 401);
    const b = await res.json();
    assert.equal(b.success, false);
  } finally {
    await cleanup();
  }
});

test('PUT validates schema → 422 for non-string ukey', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: URL, method: 'PUT',
      body: { euplatesc_ukey: 12345 },
    });
    const res = await runPut({ db, sdk, ctx });
    assert.equal(res.status, 422);
    const b = await res.json();
    assert.equal(b.success, false);
    assert.equal(b.error, 'Validation failed');
  } finally {
    await cleanup();
  }
});
