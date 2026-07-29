import { test } from 'node:test';
import { ensureLoader } from '../../../../stubs/register.mjs';
import { matrix, createTestDb, seedMinimal, makeFakeSdk, makeCtx, assert } from '../../_matrix.ts';
import { insertFixture } from '../../../../db/harness.ts';

ensureLoader();
const { runPost } = await import('../../../../../src/api/shop/public/checkout/index.ts');
const { getOrderWithItems } = await import('../../../../../src/lib/data/orders.ts');

const URL = 'http://localhost/api/plugins/shop/public/checkout';

async function seedCartWithItem(db: any, f: any, sessionId = 'sess-meta', cartId = 'cart-meta') {
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
    id: 'ci-meta',
    cart_id: cartId,
    product_id: f.simpleProductId,
    variant_id: null,
    quantity: 2,
  });
  return { sessionId, cartId };
}

function validBody(overrides: Record<string, any> = {}) {
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
    provider: 'ramburs',
    ...overrides,
  };
}

test('POST with valid JSON metadata → 201, metadata persisted', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const { sessionId } = await seedCartWithItem(db, f);
    const sdk = makeFakeSdk({ user: null });
    const ctx = makeCtx({
      url: URL,
      method: 'POST',
      body: validBody({ metadata: '{"pickup_location":"EasyBox 12"}' }),
      headers: { cookie: `pelerin_shop_cart=${sessionId}` },
    });
    const res = await runPost({ db, sdk, ctx });
    assert.equal(res.status, 201);
    const b = await res.json();
    assert.ok(b.data.order_id, 'order_id present');

    const orderWithItems = await getOrderWithItems(db, b.data.order_id);
    assert.ok(orderWithItems, 'order found');
    assert.equal(orderWithItems.order.metadata, '{"pickup_location":"EasyBox 12"}');
  } finally {
    await cleanup();
  }
});

test('POST with invalid JSON metadata → 422 field error', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const { sessionId } = await seedCartWithItem(db, f, 'sess-meta2', 'cart-meta2');
    const sdk = makeFakeSdk({ user: null });
    const ctx = makeCtx({
      url: URL,
      method: 'POST',
      body: validBody({ metadata: 'not-json' }),
      headers: { cookie: `pelerin_shop_cart=${sessionId}` },
    });
    const res = await runPost({ db, sdk, ctx });
    assert.equal(res.status, 422);
    const b = await res.json();
    assert.equal(b.success, false);
    assert.equal(b.error, 'Validation failed');
    assert.ok(b.fields && b.fields.metadata, 'metadata field error present');
  } finally {
    await cleanup();
  }
});

test('POST without metadata → 201, metadata is null', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const { sessionId } = await seedCartWithItem(db, f, 'sess-meta3', 'cart-meta3');
    const sdk = makeFakeSdk({ user: null });
    const ctx = makeCtx({
      url: URL,
      method: 'POST',
      body: validBody(),
      headers: { cookie: `pelerin_shop_cart=${sessionId}` },
    });
    const res = await runPost({ db, sdk, ctx });
    assert.equal(res.status, 201);
    const b = await res.json();
    assert.ok(b.data.order_id, 'order_id present');

    const orderWithItems = await getOrderWithItems(db, b.data.order_id);
    assert.ok(orderWithItems, 'order found');
    assert.equal(orderWithItems.order.metadata, null);
  } finally {
    await cleanup();
  }
});

test('POST with null metadata → 201, metadata is null', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const { sessionId } = await seedCartWithItem(db, f, 'sess-meta4', 'cart-meta4');
    const sdk = makeFakeSdk({ user: null });
    const ctx = makeCtx({
      url: URL,
      method: 'POST',
      body: validBody({ metadata: null }),
      headers: { cookie: `pelerin_shop_cart=${sessionId}` },
    });
    const res = await runPost({ db, sdk, ctx });
    assert.equal(res.status, 201);
    const b = await res.json();
    assert.ok(b.data.order_id, 'order_id present');

    const orderWithItems = await getOrderWithItems(db, b.data.order_id);
    assert.ok(orderWithItems, 'order found');
    assert.equal(orderWithItems.order.metadata, null);
  } finally {
    await cleanup();
  }
});
