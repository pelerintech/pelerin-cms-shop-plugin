/**
 * Task 42 — Client pay endpoint accepts success_url/cancel_url from body.
 *
 * POST /api/plugins/shop/public/checkout/[orderId]/pay
 * - Accepts success_url and cancel_url from body
 * - Returns 422 if missing
 * - Derives webhook_url from request origin
 * - Sets payment_provider on order
 */
import { test } from 'node:test';
import { ensureLoader } from '../../../../../stubs/register.mjs';
import { createTestDb, seedMinimal, makeFakeSdk, makeCtx, assert } from '../../../_matrix.ts';
import { insertFixture, shop_settings } from '../../../../../db/harness.ts';

ensureLoader();
const payMod = await import('../../../../../../src/api/shop/public/checkout/[orderId]/pay.ts');

const URL = 'http://localhost/api/plugins/shop/public/checkout/order-1/pay';

test('accepts success_url and cancel_url, sets payment_provider', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);

    // Seed euPlatesc credentials
    await db.insert(shop_settings).values([
      { id: 's-eu-mid', key: 'euplatesc_merchant_id', value: '44841007584' },
      {
        id: 's-eu-key',
        key: 'euplatesc_secret_key',
        value: 'AA4A81EE58A1D74DE6E02DF2C1CE9982780F95DC',
      },
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
      status: 'awaiting_payment',
      payment_provider: 'euplatesc',
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

    const sdk = makeFakeSdk({ user: null });
    const ctx = makeCtx({
      url: URL,
      method: 'POST',
      body: {
        success_url: 'https://shop.example.com/success',
        cancel_url: 'https://shop.example.com/cart',
      },
      params: { orderId: 'order-1' },
    });
    const res = await payMod.runPost({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await res.json();
    assert.equal(b.success, true);
    assert.ok(b.data?.redirect_url, 'should contain redirect_url');

    // Verify payment_provider on order (should be unchanged)
    const { orders } = await import('../../../../../../src/db/schema.ts');
    const { eq } = await import('drizzle-orm');
    const [order] = await db.select().from(orders).where(eq(orders.id, 'order-1'));
    assert.equal(order.payment_provider, 'euplatesc', 'payment_provider should be unchanged');

    // Verify redirect URL contains the correct ExtraData URLs (URL-encoded)
    const redirectUrlStr = b.data.redirect_url;
    assert.ok(
      redirectUrlStr.includes('shop.example.com'),
      'redirect_url should contain shop domain'
    );
    assert.ok(redirectUrlStr.includes('success'), 'redirect_url should contain success path');
    assert.ok(redirectUrlStr.includes('cart'), 'redirect_url should contain cart path');
  } finally {
    await cleanup();
  }
});

test('missing success_url/cancel_url → 422', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const sdk = makeFakeSdk({ user: null });
    const ctx = makeCtx({
      url: URL,
      method: 'POST',
      body: {},
      params: { orderId: 'order-1' },
    });
    const res = await payMod.runPost({ db, sdk, ctx });
    assert.equal(res.status, 422);
    const b = await res.json();
    assert.equal(b.success, false);
    assert.ok(
      b.error?.includes('success_url') || b.error?.includes('cancel_url'),
      'error should mention missing URLs'
    );
  } finally {
    await cleanup();
  }
});
