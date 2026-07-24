import { test } from 'node:test';
import assert from 'node:assert';
import { ensureLoader } from '../../../../stubs/register.mjs';
import { matrix } from '../../_matrix.ts';
import { makeFakeSdk, makeCtx, poisonDb } from '../../../helpers.ts';
import { createTestDb, seedMinimal, insertFixture } from '../../../../db/harness.ts';
import { createOrder, transitionOrderStatus } from '../../../../../src/lib/data/orders.ts';

ensureLoader();
const { runPut } = await import('../../../../../src/api/shop/orders/[id]/status.ts');

const base = 'http://localhost/api/plugins/shop/orders/';

function jsonBody(res: Response) {
  return res.json();
}

async function makeCartWithItem(db: any, f: any, cartId: string, productId: string) {
  const now = new Date();
  const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  await insertFixture(db, 'carts', {
    id: cartId,
    session_id: 'sess-' + cartId,
    user_id: null,
    applied_voucher_code: null,
    applied_referral_code: null,
    converted_at: null,
    expires_at: expires,
    created_at: now,
    updated_at: now,
  });
  await insertFixture(db, 'cart_items', {
    id: 'ci-' + cartId,
    cart_id: cartId,
    product_id: productId,
    variant_id: null,
    quantity: 1,
  });
  return cartId;
}

async function seedOrder(db: any, f: any, orderNumber = 'ORD-S') {
  const cartId = await makeCartWithItem(db, f, 'cart-status', f.simpleProductId);
  return createOrder(db, {
    order_number: orderNumber,
    user_id: null,
    customer_type: 'individual',
    customer_email: 't@e.com',
    customer_name: 'T',
    customer_phone: null,
    currency: 'RON',
    subtotal_net: 5000,
    vat_total: 250,
    shipping_cost: 0,
    discount_amount: 0,
    total: 5250,
    shipping_type: 'physical',
    billing_first_name: 'T',
    billing_last_name: 'U',
    billing_address: 'A',
    billing_city: 'C',
    billing_postal_code: '1',
    billing_country: 'RO',
    shipping_first_name: 'T',
    shipping_last_name: 'U',
    shipping_address: 'A',
    shipping_city: 'C',
    shipping_postal_code: '1',
    shipping_country: 'RO',
    shipping_same_as_billing: true,
    cart_id: cartId,
    items: [
      {
        product_id: f.simpleProductId,
        variant_id: null,
        product_name: 'Carte',
        sku: 'BOOK-001',
        quantity: 1,
        price_net: 5000,
        vat_rate: 0.05,
        price_gross: 5250,
        currency: 'RON',
      },
    ],
  });
}

test('PUT auth-fail → 401', () =>
  matrix.adminAuthFail({ run: runPut, url: base + 'x', body: {}, params: { id: 'x' } }));

test('PUT validation-fail → 422', () =>
  matrix.validationFail({
    run: runPut,
    url: base + 'x',
    params: { id: 'x' },
    invalidBody: { status: 'not-a-status' },
  }));

test('PUT happy-path → 200, status updated', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const order = await seedOrder(db, f);
    // pending → awaiting_payment (non-event status)
    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: base + order.id,
      body: { status: 'awaiting_payment', note: 'moved to awaiting' },
      params: { id: order.id },
      method: 'PUT',
    });
    const res = await runPut({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await jsonBody(res);
    assert.equal(b.success, true);
    assert.equal(b.data.status, 'awaiting_payment');
  } finally {
    await cleanup();
  }
});

test('PUT to paid → publishes shop.order.paid event', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const order = await seedOrder(db, f, 'ORD-PAID');
    // First transition to awaiting_payment (valid: pending → awaiting_payment → paid)
    await transitionOrderStatus(db, order.id, 'awaiting_payment');
    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: base + order.id,
      body: { status: 'paid' },
      params: { id: order.id },
      method: 'PUT',
    });
    const res = await runPut({ db, sdk, ctx });
    assert.equal(res.status, 200);

    const calls = sdk.events.publishCalls as Array<{ event: string; payload: any }>;
    const paidCall = calls.find((c) => c.event === 'shop.order.paid');
    assert.ok(paidCall, 'shop.order.paid was published');
    assert.equal(paidCall.payload.event, 'shop.order.paid');
  } finally {
    await cleanup();
  }
});

test('PUT to shipped → publishes shop.order.shipped event', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const order = await seedOrder(db, f, 'ORD-SHIP');
    // Move through the chain: pending → awaiting_payment → paid → processing → shipped
    await transitionOrderStatus(db, order.id, 'awaiting_payment');
    await transitionOrderStatus(db, order.id, 'paid');
    await transitionOrderStatus(db, order.id, 'processing');
    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: base + order.id,
      body: { status: 'shipped' },
      params: { id: order.id },
      method: 'PUT',
    });
    const res = await runPut({ db, sdk, ctx });
    assert.equal(res.status, 200);

    const calls = sdk.events.publishCalls as Array<{ event: string; payload: any }>;
    const shippedCall = calls.find((c) => c.event === 'shop.order.shipped');
    assert.ok(shippedCall, 'shop.order.shipped was published');
    assert.equal(shippedCall.payload.event, 'shop.order.shipped');
  } finally {
    await cleanup();
  }
});

test('PUT to processing → does NOT publish any order event', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const order = await seedOrder(db, f, 'ORD-PRO');
    // Move through the chain to paid
    await transitionOrderStatus(db, order.id, 'awaiting_payment');
    await transitionOrderStatus(db, order.id, 'paid');
    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: base + order.id,
      body: { status: 'processing' },
      params: { id: order.id },
      method: 'PUT',
    });
    const res = await runPut({ db, sdk, ctx });
    assert.equal(res.status, 200);

    const calls = sdk.events.publishCalls as Array<{ event: string; payload: any }>;
    const orderCalls = calls.filter(
      (c) =>
        c.event === 'shop.order.paid' ||
        c.event === 'shop.order.shipped' ||
        c.event === 'shop.order.cancelled' ||
        c.event === 'shop.order.refunded' ||
        c.event === 'shop.order.confirmed'
    );
    assert.equal(
      orderCalls.length,
      0,
      'No order lifecycle events should be published for processing'
    );
  } finally {
    await cleanup();
  }
});

test('PUT 409: invalid transition from terminal state → 409', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const order = await seedOrder(db, f, 'ORD-409');
    // Move order to a terminal state (cancelled)
    await transitionOrderStatus(db, order.id, 'cancelled');
    // Now attempt an invalid transition: cancelled → paid throws OrderTransitionError → 409
    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: base + order.id,
      body: { status: 'paid', note: 'should fail' },
      params: { id: order.id },
      method: 'PUT',
    });
    const res = await runPut({ db, sdk, ctx });
    assert.equal(res.status, 409);
    const b = await jsonBody(res);
    assert.equal(b.success, false);
  } finally {
    await cleanup();
  }
});

test('PUT error-wrap → 500', () => {
  const sdk = makeFakeSdk();
  const ctx = makeCtx({
    url: base + 'x',
    body: { status: 'awaiting_payment' },
    params: { id: 'x' },
    method: 'PUT',
  });
  return runPut({ db: poisonDb(), sdk, ctx }).then(async (res) => {
    assert.equal(res.status, 500);
    const b = await jsonBody(res);
    assert.equal(b.success, false);
  });
});
