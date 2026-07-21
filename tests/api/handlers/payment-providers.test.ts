/**
 * Tests for GET /api/plugins/shop/payment-providers — legacy coverage.
 *
 * The endpoint was rewritten to be DB-driven (Task 12). These tests are
 * preserved for backward regression but the primary behavioral coverage
 * and source-coupling guard live in payment-providers-listing.test.ts.
 */
import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert';
import { ensureLoader } from '../../stubs/register.mjs';
import { createTestDb, resetDb, shop_settings } from '../../db/harness.ts';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';

ensureLoader();

describe('GET /payment-providers — DB-driven listing (legacy regression)', () => {
  let db: LibSQLDatabase;

  before(async () => {
    const harness = await createTestDb();
    db = harness.db;
    await resetDb(db);
  });

  beforeEach(async () => {
    await resetDb(db);
  });

  it('returns only configured providers (ramburs default-on)', async () => {
    // Seed only euPlatesc configured — ramburs is default-on
    await db.insert(shop_settings).values([
      { id: 's1', key: 'euplatesc_merchant_id', value: '44841007584' },
      { id: 's2', key: 'euplatesc_secret_key', value: 'AA4A81EE58A1D74DE6E02DF2C1CE9982780F95DC' },
    ]);

    const { runGet } = await import('../../../src/api/shop/payment-providers/index.ts');

    const fakeCtx = {
      params: {},
      request: new Request('https://example.com/api/plugins/shop/payment-providers'),
    } as any;

    const fakeSdk = { auth: {} };

    const response = await runGet({ db, sdk: fakeSdk, ctx: fakeCtx });
    const data = await response.json();

    assert.strictEqual(response.status, 200, 'Response must be 200');
    assert.ok(data.success, 'Response must have success: true');
    assert.ok(Array.isArray(data.data.providers), 'Response must have providers array');
    assert.strictEqual(
      data.data.providers.length,
      2,
      'Must have exactly 2 providers (euPlatesc + ramburs default-on)'
    );
    const names = data.data.providers.map((p: any) => p.name).sort();
    assert.deepStrictEqual(names, ['euplatesc', 'ramburs']);
  });

  it('returns 200 (no auth required — public endpoint)', async () => {
    const { runGet } = await import('../../../src/api/shop/payment-providers/index.ts');

    const fakeCtx = {
      params: {},
      request: new Request('https://example.com/api/plugins/shop/payment-providers'),
    } as any;

    const fakeSdk = { auth: {} };

    const response = await runGet({ db, sdk: fakeSdk, ctx: fakeCtx });
    assert.strictEqual(response.status, 200, 'Public endpoint must return 200 without auth');
  });
});
