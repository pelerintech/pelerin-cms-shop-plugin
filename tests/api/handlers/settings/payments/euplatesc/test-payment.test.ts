/**
 * Task 39 — Test payment endpoint (generate TEST- redirect URL).
 *
 * POST /api/plugins/shop/settings/payments/euplatesc/test-payment
 * - requireAdmin → 401 for non-admin
 * - Reads euPlatesc credentials from settings
 * - Generates redirect URL with amount=1.00, invoice_id=TEST-*, order_desc=Test payment
 * - Contains ExtraData[silenturl] pointing to webhook URL
 * - NO order created in orders table
 */
import { describe, it, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { ensureLoader } from '../../../../../stubs/register.mjs';
import { createTestDb, resetDb, shop_settings, orders } from '../../../../../db/harness.ts';
import { makeFakeSdk, makeCtx } from '../../../../helpers.ts';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';

ensureLoader();

describe('test-payment endpoint', () => {
  let db: LibSQLDatabase;
  let runPost: any;

  before(async () => {
    const harness = await createTestDb();
    db = harness.db;
    await resetDb(db);
    const mod = await import('../../../../../../src/api/shop/settings/payments/euplatesc/test-payment.ts');
    runPost = mod.runPost;
  });

  beforeEach(async () => {
    await resetDb(db);
  });

  it('auth required → 401 for non-admin', async () => {
    const sdk = makeFakeSdk({ authThrows: Object.assign(new Error('Unauthorized'), { status: 401 }) });
    const ctx = makeCtx({ url: 'http://localhost/api/test', method: 'POST' });
    const res = await runPost({ db, sdk, ctx });
    assert.strictEqual(res.status, 401);
    const b = await res.json();
    assert.strictEqual(b.success, false);
  });

  it('happy-path → 200, redirect_url with TEST- prefix', async () => {
    await db.insert(shop_settings).values([
      { id: 's1', key: 'euplatesc_merchant_id', value: '44841007584' },
      { id: 's2', key: 'euplatesc_secret_key', value: 'AA4A81EE58A1D74DE6E02DF2C1CE9982780F95DC' },
    ]);

    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: 'http://localhost/api/plugins/shop/settings/payments/euplatesc/test-payment',
      method: 'POST',
    });
    const res = await runPost({ db, sdk, ctx });
    assert.strictEqual(res.status, 200);
    const b = await res.json();
    assert.strictEqual(b.success, true);
    assert.ok(b.data?.redirect_url, 'response should contain redirect_url');

    const url = new URL(b.data.redirect_url);
    assert.ok(url.searchParams.get('amount') === '1.00', 'amount should be 1.00 RON');
    const invoiceId = url.searchParams.get('invoice_id');
    assert.ok(invoiceId?.startsWith('TEST-'), `invoice_id should start with TEST-, got: ${invoiceId}`);
    assert.ok(url.searchParams.get('order_desc')?.includes('Test'), 'order_desc should mention Test');
    assert.ok(url.searchParams.get('ExtraData[silenturl]')?.includes('webhooks/euplatesc'), 'silenturl should point to webhook');
    assert.ok(url.searchParams.get('fp_hash'), 'should contain fp_hash');
  });

  it('no order created in orders table', async () => {
    await db.insert(shop_settings).values([
      { id: 's1', key: 'euplatesc_merchant_id', value: '44841007584' },
      { id: 's2', key: 'euplatesc_secret_key', value: 'AA4A81EE58A1D74DE6E02DF2C1CE9982780F95DC' },
    ]);

    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: 'http://localhost/api/plugins/shop/settings/payments/euplatesc/test-payment',
      method: 'POST',
    });
    await runPost({ db, sdk, ctx });

    // Verify no orders were created
    const countResult = await db.select({ count: orders.id }).from(orders);
    assert.strictEqual(countResult.length, 0, 'no orders should be created');
  });

  it('missing credentials → 422 error', async () => {
    // No settings seeded
    const sdk = makeFakeSdk();
    const ctx = makeCtx({ url: 'http://localhost/api/plugins/shop/settings/payments/euplatesc/test-payment', method: 'POST' });
    const res = await runPost({ db, sdk, ctx });
    assert.strictEqual(res.status, 422);
    const b = await res.json();
    assert.strictEqual(b.success, false);
  });
});
