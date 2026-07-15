/**
 * Task 32 — Checkout response uses dynamic provider list.
 *
 * The checkout endpoint should return only the providers that are configured
 * (isConfigured(db) === true), not a hardcoded ['stripe', 'euplatesc'].
 */
import { test } from 'node:test';
import { ensureLoader } from '../../../../stubs/register.mjs';
import { createTestDb, seedMinimal, makeFakeSdk, makeCtx, assert } from '../../_matrix.ts';
import { insertFixture, shop_settings } from '../../../../db/harness.ts';

ensureLoader();
const { runPost } = await import('../../../../../src/api/shop/public/checkout/index.ts');

const URL = 'http://localhost/api/plugins/shop/public/checkout';

// Helper: seed a cart with an item
async function seedCartWithItem(db: any, f: any, sessionId = 'sess-dyn', cartId = 'cart-dyn') {
  const now = new Date();
  const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  await insertFixture(db, 'carts', {
    id: cartId,
    session_id: sessionId,
    user_id: null,
    applied_voucher_code: null,
    applied_referral_code: null,
    converted_at: null,
    expires_at: expires,
    created_at: now,
    updated_at: now,
  });
  await insertFixture(db, 'cart_items', {
    id: 'ci-dyn',
    cart_id: cartId,
    product_id: f.simpleProductId,
    variant_id: null,
    quantity: 1,
  });
  return { sessionId, cartId };
}

function validCheckoutBody() {
  return {
    customer_type: 'individual',
    customer_email: 'buyer@example.com',
    customer_name: 'Ion Popescu',
    customer_phone: null,
    billing_name: 'Ion Popescu',
    billing_company: null,
    billing_vat_number: null,
    billing_address_line_1: 'Str. X nr 1',
    billing_city: 'Bucuresti',
    billing_state: 'Bucuresti',
    billing_postal_code: '010101',
    billing_country: 'Romania',
    shipping_same_as_billing: true,
    shipping_type: 'physical',
    shipping_address_line_1: null,
    shipping_city: null,
    shipping_state: null,
    shipping_postal_code: null,
    shipping_country: null,
    currency: 'RON',
    referral_code: null,
  };
}

// Helper: seed euPlatesc credentials
async function seedEuplatescCredentials(db: any) {
  await db.insert(shop_settings).values([
    { id: 's-eu-mid', key: 'euplatesc_merchant_id', value: 'testmerchant' },
    { id: 's-eu-key', key: 'euplatesc_secret_key', value: '00112233445566778899AABBCCDDEEFF' },
  ]);
}

// Helper: seed Stripe credentials
async function seedStripeCredentials(db: any) {
  await db
    .insert(shop_settings)
    .values([{ id: 's-stripe-key', key: 'stripe_secret_key', value: 'sk_test_fake_key' }]);
}

test('only euPlatesc configured → payment_providers is ["euplatesc"]', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    await seedEuplatescCredentials(db);
    // Stripe NOT configured — no stripe_secret_key
    const { sessionId } = await seedCartWithItem(db, f);
    const sdk = makeFakeSdk({ user: null });
    const ctx = makeCtx({
      url: URL,
      method: 'POST',
      body: validCheckoutBody(),
      headers: { cookie: `pelerin_shop_cart=${sessionId}` },
    });
    const res = await runPost({ db, sdk, ctx });
    assert.equal(res.status, 201);
    const b = await res.json();
    assert.equal(b.success, true);
    assert.deepStrictEqual(
      b.data.payment_providers,
      ['euplatesc'],
      'should only list euPlatesc, not Stripe'
    );
  } finally {
    await cleanup();
  }
});

test('only Stripe configured → payment_providers is ["stripe"]', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    await seedStripeCredentials(db);
    // euPlatesc NOT configured
    const { sessionId } = await seedCartWithItem(db, f);
    const sdk = makeFakeSdk({ user: null });
    const ctx = makeCtx({
      url: URL,
      method: 'POST',
      body: validCheckoutBody(),
      headers: { cookie: `pelerin_shop_cart=${sessionId}` },
    });
    const res = await runPost({ db, sdk, ctx });
    assert.equal(res.status, 201);
    const b = await res.json();
    assert.equal(b.success, true);
    assert.deepStrictEqual(
      b.data.payment_providers,
      ['stripe'],
      'should only list Stripe, not euPlatesc'
    );
  } finally {
    await cleanup();
  }
});

test('both configured → payment_providers has both', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    await seedEuplatescCredentials(db);
    await seedStripeCredentials(db);
    const { sessionId } = await seedCartWithItem(db, f);
    const sdk = makeFakeSdk({ user: null });
    const ctx = makeCtx({
      url: URL,
      method: 'POST',
      body: validCheckoutBody(),
      headers: { cookie: `pelerin_shop_cart=${sessionId}` },
    });
    const res = await runPost({ db, sdk, ctx });
    assert.equal(res.status, 201);
    const b = await res.json();
    assert.equal(b.success, true);
    assert.ok(Array.isArray(b.data.payment_providers));
    assert.ok(b.data.payment_providers.includes('stripe'));
    assert.ok(b.data.payment_providers.includes('euplatesc'));
  } finally {
    await cleanup();
  }
});

test('none configured → payment_providers is empty array', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    // Neither Stripe nor euPlatesc configured
    const { sessionId } = await seedCartWithItem(db, f);
    const sdk = makeFakeSdk({ user: null });
    const ctx = makeCtx({
      url: URL,
      method: 'POST',
      body: validCheckoutBody(),
      headers: { cookie: `pelerin_shop_cart=${sessionId}` },
    });
    const res = await runPost({ db, sdk, ctx });
    assert.equal(res.status, 201);
    const b = await res.json();
    assert.equal(b.success, true);
    assert.deepStrictEqual(
      b.data.payment_providers,
      [],
      'should be empty when no providers configured'
    );
  } finally {
    await cleanup();
  }
});
