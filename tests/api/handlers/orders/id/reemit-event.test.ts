import { test } from 'node:test';
import assert from 'node:assert';
import { ensureLoader } from '../../../../stubs/register.mjs';
import { matrix } from '../../_matrix.ts';
import { makeFakeSdk, makeCtx, poisonDb, unauthorizedError } from '../../../helpers.ts';
import { createTestDb, seedMinimal, insertFixture, buildOrderRow } from '../../../../db/harness.ts';
import { createOrder, transitionOrderStatus } from '../../../../../src/lib/data/orders.ts';

ensureLoader();

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

async function seedOrderWithStatus(
  db: any,
  f: any,
  status: string,
  orderNumber: string
): Promise<any> {
  const cartId = 'cart-reemit-' + orderNumber;
  await makeCartWithItem(db, f, cartId, f.simpleProductId);
  const order = await createOrder(db, {
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

  // Transition through valid chain to target status
  if (status === 'pending') return order;
  await transitionOrderStatus(db, order.id, 'awaiting_payment');
  if (status === 'awaiting_payment') return order;
  await transitionOrderStatus(db, order.id, 'paid');
  if (status === 'paid') return order;
  await transitionOrderStatus(db, order.id, 'processing');
  if (status === 'processing') return order;
  await transitionOrderStatus(db, order.id, 'shipped');
  if (status === 'shipped') return order;

  throw new Error(`Unsupported status in test seed: ${status}`);
}

test('POST auth-fail → 401', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const order = await seedOrderWithStatus(db, f, 'paid', 'ORD-RE-AUTH');
    // We need to try importing the handler, but it doesn't exist yet
    // So this test is expected to fail at the import stage
    const mod = await import('../../../../../src/api/shop/orders/[id]/reemit-event.ts');
    const sdk = makeFakeSdk({ authThrows: unauthorizedError() });
    const ctx = makeCtx({
      url: base + order.id + '/reemit-event',
      body: { event: 'shop.order.paid' },
      params: { id: order.id },
      method: 'POST',
    });
    const res = await mod.runPost({ db, sdk, ctx });
    assert.equal(res.status, 401);

    const calls = sdk.events.publishCalls as Array<{ event: string; payload: any }>;
    assert.equal(calls.length, 0, 'No events should be published when auth fails');
  } finally {
    await cleanup();
  }
});

test('POST happy path: re-emit paid for paid order → 200, event published', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const order = await seedOrderWithStatus(db, f, 'paid', 'ORD-RE-PAID');
    const mod = await import('../../../../../src/api/shop/orders/[id]/reemit-event.ts');
    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: base + order.id + '/reemit-event',
      body: { event: 'shop.order.paid' },
      params: { id: order.id },
      method: 'POST',
    });
    const res = await mod.runPost({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await jsonBody(res);
    assert.equal(b.success, true);

    const calls = sdk.events.publishCalls as Array<{ event: string; payload: any }>;
    const paidCall = calls.find((c) => c.event === 'shop.order.paid');
    assert.ok(paidCall, 'shop.order.paid was published');
    assert.equal(paidCall.payload.event, 'shop.order.paid');
    assert.ok(paidCall.payload.data.order.id, 'payload contains order data');
  } finally {
    await cleanup();
  }
});

test('POST confirmed always allowed for any status → 200', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const order = await seedOrderWithStatus(db, f, 'paid', 'ORD-RE-CONF');
    const mod = await import('../../../../../src/api/shop/orders/[id]/reemit-event.ts');
    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: base + order.id + '/reemit-event',
      body: { event: 'shop.order.confirmed' },
      params: { id: order.id },
      method: 'POST',
    });
    const res = await mod.runPost({ db, sdk, ctx });
    assert.equal(res.status, 200);
  } finally {
    await cleanup();
  }
});

test('POST event does not match status → 422', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const order = await seedOrderWithStatus(db, f, 'paid', 'ORD-RE-MIS');
    const mod = await import('../../../../../src/api/shop/orders/[id]/reemit-event.ts');
    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: base + order.id + '/reemit-event',
      body: { event: 'shop.order.shipped' },
      params: { id: order.id },
      method: 'POST',
    });
    const res = await mod.runPost({ db, sdk, ctx });
    assert.equal(res.status, 422);
    const b = await jsonBody(res);
    assert.equal(b.success, false);
  } finally {
    await cleanup();
  }
});

test('POST invalid event name → 422', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const order = await seedOrderWithStatus(db, f, 'paid', 'ORD-RE-INV');
    const mod = await import('../../../../../src/api/shop/orders/[id]/reemit-event.ts');
    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: base + order.id + '/reemit-event',
      body: { event: 'shop.order.something_else' },
      params: { id: order.id },
      method: 'POST',
    });
    const res = await mod.runPost({ db, sdk, ctx });
    assert.equal(res.status, 422);
    const b = await jsonBody(res);
    assert.equal(b.success, false);
  } finally {
    await cleanup();
  }
});
