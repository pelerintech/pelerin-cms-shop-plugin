import { test } from 'node:test';
import { ensureLoader } from '../../../../stubs/register.mjs';
import { matrix, createTestDb, seedMinimal, makeFakeSdk, makeCtx, assert } from '../../_matrix.ts';
import { insertFixture, orders, carts, cart_items } from '../../../../db/harness.ts';
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

// ── New: checkout uses the shared discount evaluation (shop-r35) ──

async function seedCartWithCodes(
  db: any,
  f: any,
  codes: { voucher?: string; referral?: string },
  sessionId = 'sess-disc',
  cartId = 'cart-disc',
  quantity = 2
) {
  const now = new Date();
  const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  await insertFixture(db, 'carts', {
    id: cartId,
    session_id: sessionId,
    user_id: null,
    applied_voucher_code: codes.voucher ?? null,
    applied_referral_code: codes.referral ?? null,
    converted_at: null,
    expires_at: expires,
    created_at: now,
    updated_at: now,
  });
  await insertFixture(db, 'cart_items', {
    id: 'ci-disc',
    cart_id: cartId,
    product_id: f.simpleProductId,
    variant_id: null,
    quantity,
  });
  return { sessionId, cartId };
}

async function checkoutDisc(db: any, sessionId: string) {
  const sdk = makeFakeSdk({ user: null });
  const ctx = makeCtx({
    url: URL,
    method: 'POST',
    body: validCheckoutBody(),
    headers: { cookie: `pelerin_shop_cart=${sessionId}` },
  });
  const res = await runPost({ db, sdk, ctx });
  assert.equal(res.status, 201, 'checkout should succeed');
  const b = await res.json();
  const [order] = await db.select().from(orders).where(eq(orders.id, b.data.order_id));
  return { b, order };
}

test('POST valid voucher → order discount reflects voucher (20% of 10000 = 2000)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const { sessionId } = await seedCartWithCodes(db, f, { voucher: 'PCT20' });
    const { b, order } = await checkoutDisc(db, sessionId);

    assert.equal(order.voucher_code, 'PCT20');
    assert.equal(order.discount_amount, 2000);
    assert.equal(order.subtotal_net, 10000);
    assert.equal(order.total, order.subtotal_net + order.vat_total - 2000);
    assert.equal(b.data.totals.discount_amount, 2000);

    // Checkout empties the source cart → its applied codes must be cleared too
    const [cart] = await db.select().from(carts).where(eq(carts.id, 'cart-disc'));
    assert.equal(cart.applied_voucher_code, null, 'applied voucher must be cleared after checkout');
    const remaining = await db.select().from(cart_items).where(eq(cart_items.cart_id, 'cart-disc'));
    assert.equal(remaining.length, 0, 'cart items must be deleted after checkout');
  } finally {
    await cleanup();
  }
});

test('POST below-min voucher → NOT discounted at checkout (new enforcement)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const now = new Date();
    // MIN20000: fixed 100, min order 20000 — cart subtotal is 10000 → min not met
    await insertFixture(db, 'vouchers', {
      id: 'v-min20000',
      code: 'MIN20000',
      type: 'fixed_amount',
      value: 100,
      min_order_value: 20000,
      max_uses: null,
      uses_count: 0,
      valid_from: null,
      valid_until: null,
      single_use_per_customer: false,
      active: true,
      created_at: now,
      updated_at: now,
    });
    const { sessionId } = await seedCartWithCodes(db, f, { voucher: 'MIN20000' });
    const { b, order } = await checkoutDisc(db, sessionId);

    assert.equal(order.voucher_code, 'MIN20000');
    assert.equal(order.discount_amount, 0);
    assert.equal(b.data.totals.discount_amount, 0);
    assert.equal(order.total, order.subtotal_net + order.vat_total);
  } finally {
    await cleanup();
  }
});

test('POST referral discount → applied to order (previously 0)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const { sessionId } = await seedCartWithCodes(db, f, { referral: 'PARTNER10' });
    const { b, order } = await checkoutDisc(db, sessionId);

    assert.equal(order.voucher_code, null);
    assert.equal(order.referral_code, 'PARTNER10');
    // PARTNER10 = 10% of subtotal_net (10000) = 1000
    assert.equal(order.discount_amount, 1000);
    assert.equal(b.data.totals.discount_amount, 1000);
  } finally {
    await cleanup();
  }
});

test('POST both codes → voucher wins, referral not double-counted', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const { sessionId } = await seedCartWithCodes(db, f, {
      voucher: 'PCT20',
      referral: 'PARTNER10',
    });
    const { b, order } = await checkoutDisc(db, sessionId);

    assert.equal(order.voucher_code, 'PCT20');
    assert.equal(order.referral_code, 'PARTNER10');
    // voucher 2000 wins; referral (would be 1000) is superseded — never combined
    assert.equal(order.discount_amount, 2000);
    assert.equal(b.data.totals.discount_amount, 2000);
  } finally {
    await cleanup();
  }
});
