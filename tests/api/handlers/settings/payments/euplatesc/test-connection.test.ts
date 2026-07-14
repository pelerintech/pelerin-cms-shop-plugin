/**
 * Task 38 — Test connection endpoint (check_mid WebService).
 *
 * POST /api/plugins/shop/settings/payments/euplatesc/test-connection
 * - requireAdmin → 401 for non-admin
 * - Reads euplatesc_merchant_id + euplatesc_secret_key from settings
 * - Builds check_mid request via buildCheckMidFields + computeEuplatescHash
 * - POSTs to euPlatesc WS endpoint
 * - Returns the JSON response (flat JSON with name/status on success, error on failure)
 */
import { describe, it, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { ensureLoader } from '../../../../../stubs/register.mjs';
import { createTestDb, resetDb, shop_settings } from '../../../../../db/harness.ts';
import { makeFakeSdk, makeCtx } from '../../../../helpers.ts';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';

ensureLoader();

describe('test-connection endpoint', () => {
  let db: LibSQLDatabase;
  let runPost: any;
  let fetchCalls: { url: string; method: string; body: string }[];

  before(async () => {
    const harness = await createTestDb();
    db = harness.db;
    await resetDb(db);
    const mod = await import('../../../../../../src/api/shop/settings/payments/euplatesc/test-connection.ts');
    runPost = mod.runPost;
  });

  beforeEach(async () => {
    await resetDb(db);
    fetchCalls = [];
    (globalThis as any).fetch = async (url: string | URL, init: any) => {
      fetchCalls.push({
        url: typeof url === 'string' ? url : url.toString(),
        method: init?.method ?? 'GET',
        body: typeof init?.body === 'string' ? init.body : JSON.stringify(init?.body),
      });
      return {
        ok: true,
        status: 200,
        json: async () => ({ name: 'Test Merchant', status: 'test', url: 'https://example.com', cui: 'RO12345678', j: '1', recuring: 'N' }),
      };
    };
  });

  afterEach(() => {
    delete (globalThis as any).fetch;
  });

  it('auth required → 401 for non-admin', async () => {
    const sdk = makeFakeSdk({ authThrows: Object.assign(new Error('Unauthorized'), { status: 401 }) });
    const ctx = makeCtx({ url: 'http://localhost/api/test', method: 'POST' });
    const res = await runPost({ db, sdk, ctx });
    assert.strictEqual(res.status, 401);
    const b = await res.json();
    assert.strictEqual(b.success, false);
  });

  it('happy-path → 200, fetch called with check_mid', async () => {
    await db.insert(shop_settings).values([
      { id: 's1', key: 'euplatesc_merchant_id', value: '44841007584' },
      { id: 's2', key: 'euplatesc_secret_key', value: 'AA4A81EE58A1D74DE6E02DF2C1CE9982780F95DC' },
    ]);

    const sdk = makeFakeSdk();
    const ctx = makeCtx({ url: 'http://localhost/api/plugins/shop/settings/payments/euplatesc/test-connection', method: 'POST' });
    const res = await runPost({ db, sdk, ctx });
    assert.strictEqual(res.status, 200);
    const b = await res.json();
    assert.strictEqual(b.success, true);
    assert.ok(b.data, 'response should contain data');
    assert.strictEqual(b.data.name, 'Test Merchant');
    assert.strictEqual(b.data.status, 'test');

    // Verify fetch was called correctly
    assert.strictEqual(fetchCalls.length, 1, 'fetch must be called once');
    assert.strictEqual(fetchCalls[0].url, 'https://manager.euplatesc.ro/v3/index.php?action=ws');
    assert.strictEqual(fetchCalls[0].method, 'POST');
    assert.ok(fetchCalls[0].body.includes('method=check_mid'), 'body must contain method=check_mid');
    assert.ok(fetchCalls[0].body.includes('mid=44841007584'), 'body must contain merchant ID');
    assert.ok(fetchCalls[0].body.includes('timestamp='), 'body must contain timestamp');
    assert.ok(fetchCalls[0].body.includes('nonce='), 'body must contain nonce');
    assert.ok(fetchCalls[0].body.includes('fp_hash='), 'body must contain fp_hash');
  });

  it('error response from euPlatesc → returns error data', async () => {
    await db.insert(shop_settings).values([
      { id: 's1', key: 'euplatesc_merchant_id', value: '44841007584' },
      { id: 's2', key: 'euplatesc_secret_key', value: 'AA4A81EE58A1D74DE6E02DF2C1CE9982780F95DC' },
    ]);

    // Mock euPlatesc returning an error
    (globalThis as any).fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ error: 'Invalid merchant ID' }),
    });

    const sdk = makeFakeSdk();
    const ctx = makeCtx({ url: 'http://localhost/api/plugins/shop/settings/payments/euplatesc/test-connection', method: 'POST' });
    const res = await runPost({ db, sdk, ctx });
    assert.strictEqual(res.status, 200);
    const b = await res.json();
    assert.strictEqual(b.success, true);
    assert.strictEqual(b.data.error, 'Invalid merchant ID');
  });

  it('missing credentials → 422 error', async () => {
    // No settings seeded
    const sdk = makeFakeSdk();
    const ctx = makeCtx({ url: 'http://localhost/api/plugins/shop/settings/payments/euplatesc/test-connection', method: 'POST' });
    const res = await runPost({ db, sdk, ctx });
    assert.strictEqual(res.status, 422);
    const b = await res.json();
    assert.strictEqual(b.success, false);
    assert.ok(b.error, 'should have error message');
  });
});
