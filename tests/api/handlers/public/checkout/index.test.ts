import { test } from 'node:test';
import { ensureLoader } from '../../../../stubs/register.mjs';
import { matrix, createTestDb, seedMinimal, makeFakeSdk, makeCtx, assert } from '../../_matrix.ts';
import { insertFixture, orders } from '../../../../db/harness.ts';
import { eq } from 'drizzle-orm';

ensureLoader();
const { runPost } = await import('../../../../../src/api/shop/public/checkout/index.ts');

const URL = 'http://localhost/api/plugins/shop/public/checkout';

async function seedCartWithItem(db: any, f: any, sessionId = 'sess-co', cartId = 'cart-co') {
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
    id: 'ci-co',
    cart_id: cartId,
    product_id: f.simpleProductId,
    variant_id: null,
    quantity: 2,
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
    provider: 'ramburs',
  };
}

test('POST validation-fail → 422 (missing required fields)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const { sessionId } = await seedCartWithItem(db, f);
    const sdk = makeFakeSdk({ user: null });
    const ctx = makeCtx({
      url: URL,
      method: 'POST',
      body: { customer_type: 'individual' },
      headers: { cookie: `pelerin_shop_cart=${sessionId}` },
    });
    const res = await runPost({ db, sdk, ctx });
    assert.equal(res.status, 422);
    const b = await res.json();
    assert.equal(b.success, false);
    assert.equal(b.error, 'Validation failed');
    assert.ok(b.fields && Object.keys(b.fields).length > 0);
  } finally {
    await cleanup();
  }
});

test('POST happy-path → 201, order created', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
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
    assert.ok(b.data.order_id, 'order_id present');
    assert.ok(b.data.order_number, 'order_number present');
    assert.ok(Array.isArray(b.data.payment_providers));

    // Event assertion: shop.order.confirmed must have been published
    const calls = sdk.events.publishCalls as Array<{ event: string; payload: any }>;
    const confirmedCall = calls.find((c) => c.event === 'shop.order.confirmed');
    assert.ok(confirmedCall, 'shop.order.confirmed was published');
    assert.ok(confirmedCall.payload.data.order.order_number, 'payload contains order_number');
  } finally {
    await cleanup();
  }
});

test('POST error-wrap → 500', () =>
  matrix.errorWrap({
    run: runPost,
    url: URL,
    method: 'POST',
    body: validCheckoutBody(),
  }));

test('POST persists billing/shipping address-extra when shipped same as billing (mirror)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const { sessionId } = await seedCartWithItem(db, f);
    const sdk = makeFakeSdk({ user: null });
    const ctx = makeCtx({
      url: URL,
      method: 'POST',
      body: { ...validCheckoutBody(), billing_address_extra: 'Ap 5, Etaj 2' },
      headers: { cookie: `pelerin_shop_cart=${sessionId}` },
    });
    const res = await runPost({ db, sdk, ctx });
    assert.equal(res.status, 201);
    const b = await res.json();
    const [order] = await db.select().from(orders).where(eq(orders.id, b.data.order_id));
    assert.equal(order.billing_address_extra, 'Ap 5, Etaj 2');
    assert.equal(order.shipping_address_extra, 'Ap 5, Etaj 2');
  } finally {
    await cleanup();
  }
});

test('POST persists distinct billing/shipping address-extra when shipping differs', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const { sessionId } = await seedCartWithItem(db, f);
    const sdk = makeFakeSdk({ user: null });
    const ctx = makeCtx({
      url: URL,
      method: 'POST',
      body: {
        ...validCheckoutBody(),
        shipping_same_as_billing: false,
        billing_address_extra: 'B1',
        shipping_address_extra: 'S1',
        shipping_address_line_1: 'Str. Y nr 2',
        shipping_city: 'Cluj',
        shipping_postal_code: '400000',
        shipping_country: 'Romania',
      },
      headers: { cookie: `pelerin_shop_cart=${sessionId}` },
    });
    const res = await runPost({ db, sdk, ctx });
    assert.equal(res.status, 201);
    const b = await res.json();
    const [order] = await db.select().from(orders).where(eq(orders.id, b.data.order_id));
    assert.equal(order.billing_address_extra, 'B1');
    assert.equal(order.shipping_address_extra, 'S1');
  } finally {
    await cleanup();
  }
});

test('POST stores null address-extra when absent', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
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
    const [order] = await db.select().from(orders).where(eq(orders.id, b.data.order_id));
    assert.equal(order.billing_address_extra, null);
    assert.equal(order.shipping_address_extra, null);
  } finally {
    await cleanup();
  }
});

test('POST stores null address-extra when explicitly null', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const { sessionId } = await seedCartWithItem(db, f);
    const sdk = makeFakeSdk({ user: null });
    const ctx = makeCtx({
      url: URL,
      method: 'POST',
      body: { ...validCheckoutBody(), billing_address_extra: null, shipping_address_extra: null },
      headers: { cookie: `pelerin_shop_cart=${sessionId}` },
    });
    const res = await runPost({ db, sdk, ctx });
    assert.equal(res.status, 201);
    const b = await res.json();
    const [order] = await db.select().from(orders).where(eq(orders.id, b.data.order_id));
    assert.equal(order.billing_address_extra, null);
    assert.equal(order.shipping_address_extra, null);
  } finally {
    await cleanup();
  }
});

test('POST mirrors billing address-extra to shipping when shipping differs and no explicit shipping extra', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const { sessionId } = await seedCartWithItem(db, f);
    const sdk = makeFakeSdk({ user: null });
    const ctx = makeCtx({
      url: URL,
      method: 'POST',
      body: {
        ...validCheckoutBody(),
        shipping_same_as_billing: false,
        billing_address_extra: 'B9',
        shipping_address_line_1: 'Str. Y nr 2',
        shipping_city: 'Cluj',
        shipping_postal_code: '400000',
        shipping_country: 'Romania',
      },
      headers: { cookie: `pelerin_shop_cart=${sessionId}` },
    });
    const res = await runPost({ db, sdk, ctx });
    assert.equal(res.status, 201);
    const b = await res.json();
    const [order] = await db.select().from(orders).where(eq(orders.id, b.data.order_id));
    assert.equal(order.billing_address_extra, 'B9');
    assert.equal(order.shipping_address_extra, 'B9');
  } finally {
    await cleanup();
  }
});
