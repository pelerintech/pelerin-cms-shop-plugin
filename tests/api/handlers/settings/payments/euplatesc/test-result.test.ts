/**
 * Task 40 — Test result endpoint (GET stored test IPN result).
 *
 * GET /api/plugins/shop/settings/payments/euplatesc/test-result
 * - requireAdmin → 401 for non-admin
 * - Reads euplatesc_test_result from shop_settings
 * - Returns parsed JSON or null
 */
import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ensureLoader } from '../../../../../stubs/register.mjs';
import { createTestDb, resetDb, shop_settings } from '../../../../../db/harness.ts';
import { makeFakeSdk, makeCtx } from '../../../../helpers.ts';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';

ensureLoader();

describe('test-result endpoint', () => {
  let db: LibSQLDatabase;
  let runGet: any;

  before(async () => {
    const harness = await createTestDb();
    db = harness.db;
    await resetDb(db);
    const mod = await import('../../../../../../src/api/shop/settings/payments/euplatesc/test-result.ts');
    runGet = mod.runGet;
  });

  beforeEach(async () => {
    await resetDb(db);
  });

  it('auth required → 401 for non-admin', async () => {
    const sdk = makeFakeSdk({ authThrows: Object.assign(new Error('Unauthorized'), { status: 401 }) });
    const ctx = makeCtx({ url: 'http://localhost/api/test', method: 'GET' });
    const res = await runGet({ db, sdk, ctx });
    assert.strictEqual(res.status, 401);
    const b = await res.json();
    assert.strictEqual(b.success, false);
  });

  it('happy-path with stored result → returns parsed JSON', async () => {
    const testResult = JSON.stringify({
      timestamp: '2026-07-10T14:30:45Z',
      invoice_id: 'TEST-20260710143045',
      action: '0',
      message: 'Approved',
      mac_valid: true,
      ep_id: 'EP123456',
      amount: '1.00',
      curr: 'RON',
    });
    await db.insert(shop_settings).values([
      { id: 's1', key: 'euplatesc_test_result', value: testResult },
    ]);

    const sdk = makeFakeSdk();
    const ctx = makeCtx({ url: 'http://localhost/api/plugins/shop/settings/payments/euplatesc/test-result', method: 'GET' });
    const res = await runGet({ db, sdk, ctx });
    assert.strictEqual(res.status, 200);
    const b = await res.json();
    assert.strictEqual(b.success, true);
    assert.ok(b.data, 'should return data');
    assert.strictEqual(b.data.invoice_id, 'TEST-20260710143045');
    assert.strictEqual(b.data.action, '0');
    assert.strictEqual(b.data.mac_valid, true);
  });

  it('no result stored → returns null', async () => {
    // No settings seeded
    const sdk = makeFakeSdk();
    const ctx = makeCtx({ url: 'http://localhost/api/plugins/shop/settings/payments/euplatesc/test-result', method: 'GET' });
    const res = await runGet({ db, sdk, ctx });
    assert.strictEqual(res.status, 200);
    const b = await res.json();
    assert.strictEqual(b.success, true);
    assert.strictEqual(b.data, null);
  });
});
