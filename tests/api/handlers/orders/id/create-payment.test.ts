/**
 * Task 41 — Create payment endpoint (admin-initiated payment).
 *
 * POST /api/plugins/shop/orders/[id]/create-payment
 * - requireAdmin → 401 for non-admin
 * - Validates provider from body
 * - Sets payment_provider on order
 * - Returns redirect_url with ExtraData[successurl] pointing to admin order page
 * - Calls initiatePayment
 */
import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ensureLoader } from '../../../../stubs/register.mjs';
import { createTestDb, resetDb, shop_settings, orders, insertFixture } from '../../../../db/harness.ts';
import { makeFakeSdk, makeCtx } from '../../../helpers.ts';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';

ensureLoader();

describe('create-payment endpoint', () => {
  let db: LibSQLDatabase;
  let runPost: any;

  before(async () => {
    const harness = await createTestDb();
    db = harness.db;
    await resetDb(db);
    const mod = await import('../../../../../src/api/shop/orders/[id]/create-payment.ts');
    runPost = mod.runPost;
  });

  beforeEach(async () => {
    await resetDb(db);
  });

  it('auth required → 401 for non-admin', async () => {
    const sdk = makeFakeSdk({ authThrows: Object.assign(new Error('Unauthorized'), { status: 401 }) });
    const ctx = makeCtx({ url: 'http://localhost/api/test', method: 'POST', body: { provider: 'euplatesc' }, params: { id: 'order-1' } });
    const res = await runPost({ db, sdk, ctx });
    assert.strictEqual(res.status, 401);
    const b = await res.json();
    assert.strictEqual(b.success, false);
  });

  it('happy-path → 200, payment_provider set, redirect_url returned', async () => {
    // Seed settings
    await db.insert(shop_settings).values([
      { id: 's1', key: 'locales', value: JSON.stringify([{ code: 'ro', name: 'Română', isDefault: true }]) },
      { id: 's2', key: 'currencies', value: JSON.stringify([{ code: 'RON', name: 'Leu', isDefault: true }]) },
      { id: 's3', key: 'euplatesc_merchant_id', value: '44841007584' },
      { id: 's4', key: 'euplatesc_secret_key', value: 'AA4A81EE58A1D74DE6E02DF2C1CE9982780F95DC' },
    ]);

    // Seed order
    const now = new Date();
    await insertFixture(db, 'orders', {
      id: 'order-1',
      order_number: 'ORD-001',
      user_id: null,
      customer_type: 'individual',
      customer_email: 'buyer@example.com',
      customer_name: 'Ion Popescu',
      customer_phone: null,
      currency: 'RON',
      subtotal_net: 5000,
      vat_total: 1000,
      shipping_cost: 0,
      discount_amount: 0,
      total: 6000,
      shipping_type: 'physical',
      status: 'pending',
      payment_provider: null,
      payment_intent_id: null,
      transaction_id: null,
      voucher_code: null,
      referral_code: null,
      billing_first_name: 'Ion',
      billing_last_name: 'Popescu',
      billing_address: 'Str. X nr 1',
      billing_city: 'Bucuresti',
      billing_postal_code: '010101',
      billing_country: 'Romania',
      billing_county: 'Bucuresti',
      billing_phone: null,
      billing_company: null,
      billing_vat_number: null,
      shipping_first_name: 'Ion',
      shipping_last_name: 'Popescu',
      shipping_address: 'Str. X nr 1',
      shipping_city: 'Bucuresti',
      shipping_postal_code: '010101',
      shipping_country: 'Romania',
      shipping_county: 'Bucuresti',
      shipping_phone: null,
      shipping_company: null,
      shipping_vat_number: null,
      shipping_same_as_billing: true,
      cart_id: null,
      notes: null,
      created_at: now,
      updated_at: now,
    });

    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: 'http://localhost/api/plugins/shop/orders/order-1/create-payment',
      method: 'POST',
      body: { provider: 'euplatesc' },
      params: { id: 'order-1' },
    });
    const res = await runPost({ db, sdk, ctx });
    assert.strictEqual(res.status, 200);
    const b = await res.json();
    assert.strictEqual(b.success, true);
    assert.ok(b.data?.redirect_url, 'should contain redirect_url');

    // Verify payment_provider was set on the order
    const { eq } = await import('drizzle-orm');
    const [order] = await db.select().from(orders).where(eq(orders.id, 'order-1'));
    assert.strictEqual(order.payment_provider, 'euplatesc', 'payment_provider should be set');
  });

  it('invalid provider → 422 error', async () => {
    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: 'http://localhost/api/plugins/shop/orders/order-1/create-payment',
      method: 'POST',
      body: { provider: 'nonexistent' },
      params: { id: 'order-1' },
    });
    const res = await runPost({ db, sdk, ctx });
    assert.strictEqual(res.status, 422);
    const b = await res.json();
    assert.strictEqual(b.success, false);
  });
});
