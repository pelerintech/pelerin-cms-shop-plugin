import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert';
import { ensureLoader } from '../stubs/register.mjs';
import { createTestDb, resetDb, shop_settings } from '../db/harness.ts';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';

ensureLoader();

describe('euPlatesc refund WebService', () => {
  let db: LibSQLDatabase;
  let provider: any;
  let fetchCalls: { url: string; method: string; body: string }[];

  before(async () => {
    const harness = await createTestDb();
    db = harness.db;
    await resetDb(db);
    const mod = await import('../../src/providers/payment/euplatesc.ts');
    provider = mod.default;
  });

  beforeEach(async () => {
    await resetDb(db);
    fetchCalls = [];

    // Monkey-patch global fetch
    (globalThis as any).fetch = async (url: string | URL, init: any) => {
      fetchCalls.push({
        url: typeof url === 'string' ? url : url.toString(),
        method: init?.method || 'GET',
        body: init?.body || '',
      });
      return {
        ok: true,
        json: async () => ({ success: '1' }),
      };
    };
  });

  it('builds correct WebService request with UAPI key', async () => {
    await db.insert(shop_settings).values([
      { id: 's1', key: 'euplatesc_merchant_id', value: '44841007584' },
      { id: 's2', key: 'euplatesc_secret_key', value: 'AA4A81EE58A1D74DE6E02DF2C1CE9982780F95DC' },
      { id: 's3', key: 'euplatesc_ukey', value: 'UKEY123' },
      { id: 's4', key: 'euplatesc_uapi_key', value: 'AA4A81EE58A1D74DE6E02DF2C1CE9982780F95DC' },
    ]);

    const result = await provider.refund(db, {
      id: 'order-1',
      order_number: 'ORD-001',
      currency: 'RON',
      total: 5000,
      customer_email: 'test@example.com',
      customer_name: 'Test User',
      status: 'delivered',
      transaction_id: 'EP123',
    }, 5000, 'Product not in stock');

    assert.strictEqual(result.success, true, 'refund must succeed');

    // Verify fetch was called correctly
    assert.strictEqual(fetchCalls.length, 1, 'fetch must be called once');
    assert.strictEqual(fetchCalls[0].url, 'https://manager.euplatesc.ro/v3/index.php?action=ws',
      'fetch must be called with correct WebService URL');
    assert.strictEqual(fetchCalls[0].method, 'POST', 'fetch must use POST method');

    const params = new URLSearchParams(fetchCalls[0].body);
    assert.strictEqual(params.get('method'), 'refund', 'method must be refund');
    assert.strictEqual(params.get('ukey'), 'UKEY123', 'ukey must be from settings');
    assert.strictEqual(params.get('amount'), '50.00', 'amount must be in RON (5000 bani = 50.00 RON)');
    assert.strictEqual(params.get('reason'), 'Product not in stock', 'reason must be passed through');
    assert.strictEqual(params.get('epid'), 'EP123', 'epid must be the transaction_id');
    assert.ok(params.get('timestamp'), 'timestamp must be present');
    assert.ok(params.get('nonce'), 'nonce must be present');
    assert.ok(params.get('fp_hash'), 'fp_hash must be present');
  });

  it('returns error when ukey/UAPI key not configured', async () => {
    await db.insert(shop_settings).values([
      { id: 's1', key: 'euplatesc_merchant_id', value: '44841007584' },
      { id: 's2', key: 'euplatesc_secret_key', value: 'AA4A81EE58A1D74DE6E02DF2C1CE9982780F95DC' },
    ]);

    const result = await provider.refund(db, {
      id: 'order-1',
      order_number: 'ORD-001',
      currency: 'RON',
      total: 5000,
      customer_email: 'test@example.com',
      customer_name: 'Test User',
      status: 'delivered',
      transaction_id: 'EP123',
    }, 5000, 'Product not in stock');

    assert.strictEqual(result.success, false, 'refund must fail');
    assert.ok(result.error?.includes('credentials'), `error must mention credentials: ${result.error}`);
    assert.strictEqual(fetchCalls.length, 0, 'fetch must NOT be called when credentials missing');
  });

  it('returns error when transaction_id is null', async () => {
    await db.insert(shop_settings).values([
      { id: 's1', key: 'euplatesc_merchant_id', value: '44841007584' },
      { id: 's2', key: 'euplatesc_secret_key', value: 'AA4A81EE58A1D74DE6E02DF2C1CE9982780F95DC' },
      { id: 's3', key: 'euplatesc_ukey', value: 'UKEY123' },
      { id: 's4', key: 'euplatesc_uapi_key', value: 'AA4A81EE58A1D74DE6E02DF2C1CE9982780F95DC' },
    ]);

    const result = await provider.refund(db, {
      id: 'order-1',
      order_number: 'ORD-001',
      currency: 'RON',
      total: 5000,
      customer_email: 'test@example.com',
      customer_name: 'Test User',
      status: 'delivered',
      transaction_id: null,
    }, 5000, 'Product not in stock');

    assert.strictEqual(result.success, false, 'refund must fail');
    assert.ok(result.error?.includes('transaction ID'), `error must mention transaction ID: ${result.error}`);
    assert.strictEqual(fetchCalls.length, 0, 'fetch must NOT be called when no transaction_id');
  });
});
