import { test } from 'node:test';
import { ensureLoader } from '../../../../stubs/register.mjs';
import { matrix, createTestDb, seedMinimal, makeFakeSdk, makeCtx, assert } from '../../_matrix.ts';
import { insertFixture } from '../../../../db/harness.ts';

ensureLoader();
const { runPost } = await import('../../../../../src/api/shop/public/checkout/index.ts');
const { getOrderWithItems } = await import('../../../../../src/lib/data/orders.ts');

const URL = 'http://localhost/api/plugins/shop/public/checkout';

async function seedCartWithItem(db: any, f: any, sessionId = 'sess-notes', cartId = 'cart-notes') {
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
    id: 'ci-notes',
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

test('POST with notes → 201, order.notes equals value', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const { sessionId } = await seedCartWithItem(db, f);
    const sdk = makeFakeSdk({ user: null });
    const ctx = makeCtx({
      url: URL,
      method: 'POST',
      body: validBody({ notes: 'Leave at the gate' }),
      headers: { cookie: `pelerin_shop_cart=${sessionId}` },
    });
    const res = await runPost({ db, sdk, ctx });
    assert.equal(res.status, 201);
    const b = await res.json();
    assert.ok(b.data.order_id, 'order_id present');

    const orderWithItems = await getOrderWithItems(db, b.data.order_id);
    assert.ok(orderWithItems, 'order found');
    assert.equal(orderWithItems.order.notes, 'Leave at the gate');
  } finally {
    await cleanup();
  }
});

test('POST without notes → 201, order.notes is null', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const { sessionId } = await seedCartWithItem(db, f, 'sess-notes2', 'cart-notes2');
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
    assert.equal(orderWithItems.order.notes, null);
  } finally {
    await cleanup();
  }
});

test('POST with notes: null → 201, order.notes is null', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const { sessionId } = await seedCartWithItem(db, f, 'sess-notes3', 'cart-notes3');
    const sdk = makeFakeSdk({ user: null });
    const ctx = makeCtx({
      url: URL,
      method: 'POST',
      body: validBody({ notes: null }),
      headers: { cookie: `pelerin_shop_cart=${sessionId}` },
    });
    const res = await runPost({ db, sdk, ctx });
    assert.equal(res.status, 201);
    const b = await res.json();
    assert.ok(b.data.order_id, 'order_id present');

    const orderWithItems = await getOrderWithItems(db, b.data.order_id);
    assert.ok(orderWithItems, 'order found');
    assert.equal(orderWithItems.order.notes, null);
  } finally {
    await cleanup();
  }
});
