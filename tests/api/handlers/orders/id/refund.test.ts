import { test } from 'node:test';
import assert from 'node:assert';
import { ensureLoader } from '../../../../stubs/register.mjs';
import { matrix } from '../../_matrix.ts';
import { makeFakeSdk, makeCtx, poisonDb, unauthorizedError } from '../../../helpers.ts';
import { createTestDb, seedMinimal, insertFixture } from '../../../../db/harness.ts';
import { createOrder, transitionOrderStatus } from '../../../../../src/lib/data/orders.ts';
import { eq } from 'drizzle-orm';
import { products, orders, order_items, order_refunds } from '../../../../../src/db/schema.ts';

ensureLoader();
const { runPut } = await import('../../../../../src/api/shop/orders/[id]/refund.ts');

const base = 'http://localhost/api/plugins/shop/orders/';

function jsonBody(res: Response) {
  return res.json();
}

async function makeCartWithItem(db: any, f: any, cartId: string, productId: string, qty = 2) {
  const now = new Date();
  const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  await insertFixture(db, 'carts', {
    id: cartId, session_id: 'sess-' + cartId, user_id: null, applied_voucher_code: null,
    applied_referral_code: null, converted_at: null, expires_at: expires,
    created_at: now, updated_at: now,
  });
  await insertFixture(db, 'cart_items', {
    id: 'ci-' + cartId, cart_id: cartId, product_id: productId, variant_id: null, quantity: qty,
  });
  return cartId;
}

async function seedDeliveredOrder(db: any, f: any, orderNumber: string, cartId: string, qty = 2) {
  await makeCartWithItem(db, f, cartId, f.simpleProductId, qty);
  const order = await createOrder(db, {
    order_number: orderNumber, user_id: null, customer_type: 'individual',
    customer_email: 't@e.com', customer_name: 'T', customer_phone: null, currency: 'RON',
    subtotal_net: 5000, vat_total: 250, shipping_cost: 0, discount_amount: 0, total: 5250,
    shipping_type: 'physical', billing_first_name: 'T', billing_last_name: 'U', billing_address: 'A',
    billing_city: 'C', billing_postal_code: '1', billing_country: 'RO',
    shipping_first_name: 'T', shipping_last_name: 'U', shipping_address: 'A',
    shipping_city: 'C', shipping_postal_code: '1', shipping_country: 'RO',
    shipping_same_as_billing: true, cart_id: cartId,
    items: [{ product_id: f.simpleProductId, variant_id: null, product_name: 'Carte', sku: 'BOOK-001', quantity: qty, price_net: 5000, vat_rate: 0.05, price_gross: 5250, currency: 'RON' }],
  });
  // delivered: pending → awaiting_payment → paid → processing → shipped → delivered
  await transitionOrderStatus(db, order.id, 'awaiting_payment');
  await transitionOrderStatus(db, order.id, 'paid');
  await transitionOrderStatus(db, order.id, 'processing');
  await transitionOrderStatus(db, order.id, 'shipped');
  await transitionOrderStatus(db, order.id, 'delivered');
  return order;
}

test('PUT auth-fail → 401', () =>
  matrix.adminAuthFail({ run: runPut, url: base + 'x', body: { refunds: [] }, params: { id: 'x' } }));

test('PUT validation-fail → 422 (empty refunds array)', () =>
  matrix.validationFail({
    run: runPut,
    url: base + 'x',
    params: { id: 'x' },
    invalidBody: { refunds: [] },
  }));

test('PUT validation-fail → 422 (missing order_item_id)', () =>
  matrix.validationFail({
    run: runPut,
    url: base + 'x',
    params: { id: 'x' },
    invalidBody: { refunds: [{ quantity: 1 }] },
  }));

test('(a) refund qty 1 of 2 → 200, partially_refunded, stock +1, order_refunds row', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const order = await seedDeliveredOrder(db, f, 'ORD-RHA', 'cart-refund-a');
    const oi = await db.select().from(order_items).where(eq(order_items.order_id, order.id));
    const itemId = oi[0].id;
    // After createOrder: stock 100 → 98.
    const [pBefore] = await db.select().from(products).where(eq(products.id, f.simpleProductId));
    assert.equal(pBefore.stock, 98);

    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: base + order.id,
      body: { refunds: [{ order_item_id: itemId, quantity: 1, amount: 5000 }], notes: 'partial' },
      params: { id: order.id }, method: 'PUT',
    });
    const res = await runPut({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await jsonBody(res);
    assert.equal(b.success, true);
    assert.equal(b.data.order.status, 'partially_refunded');

    const refunds = await db.select().from(order_refunds).where(eq(order_refunds.order_id, order.id));
    assert.equal(refunds.length, 1);
    assert.equal(refunds[0].quantity, 1);

    const [pAfter] = await db.select().from(products).where(eq(products.id, f.simpleProductId));
    assert.equal(pAfter.stock, 99, 'stock +1');
  } finally {
    await cleanup();
  }
});

test('(b) refund remaining → 200, refunded (terminal)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const order = await seedDeliveredOrder(db, f, 'ORD-RHB', 'cart-refund-b');
    const oi = await db.select().from(order_items).where(eq(order_items.order_id, order.id));
    const itemId = oi[0].id;

    // First refund 1 → partially_refunded.
    await runPut({ db, sdk: makeFakeSdk(), ctx: makeCtx({
      url: base + order.id,
      body: { refunds: [{ order_item_id: itemId, quantity: 1, amount: 5000 }] },
      params: { id: order.id }, method: 'PUT',
    }) });

    // Refund remaining 1 → refunded.
    const res = await runPut({ db, sdk: makeFakeSdk(), ctx: makeCtx({
      url: base + order.id,
      body: { refunds: [{ order_item_id: itemId, quantity: 1, amount: 5000 }] },
      params: { id: order.id }, method: 'PUT',
    }) });
    assert.equal(res.status, 200);
    const b = await jsonBody(res);
    assert.equal(b.data.order.status, 'refunded');

    const [pAfter] = await db.select().from(products).where(eq(products.id, f.simpleProductId));
    assert.equal(pAfter.stock, 100, 'stock fully restored 98→100');
  } finally {
    await cleanup();
  }
});

test('(c) refund qty > remaining → 422, no write', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const order = await seedDeliveredOrder(db, f, 'ORD-RHC', 'cart-refund-c');
    const oi = await db.select().from(order_items).where(eq(order_items.order_id, order.id));
    const itemId = oi[0].id;

    const res = await runPut({ db, sdk: makeFakeSdk(), ctx: makeCtx({
      url: base + order.id,
      body: { refunds: [{ order_item_id: itemId, quantity: 99, amount: 1 }] },
      params: { id: order.id }, method: 'PUT',
    }) });
    assert.equal(res.status, 422);
    const b = await jsonBody(res);
    assert.equal(b.success, false);

    const refunds = await db.select().from(order_refunds).where(eq(order_refunds.order_id, order.id));
    assert.equal(refunds.length, 0, 'no refund row');
    const [p] = await db.select().from(products).where(eq(products.id, f.simpleProductId));
    assert.equal(p.stock, 98, 'stock unchanged');
    const [o] = await db.select().from(orders).where(eq(orders.id, order.id));
    assert.equal(o.status, 'delivered', 'status unchanged');
  } finally {
    await cleanup();
  }
});

test('(d) cancelled order → 409 BEFORE any refund insert/restock/write', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const order = await seedDeliveredOrder(db, f, 'ORD-RHD', 'cart-refund-d');
    const oi = await db.select().from(order_items).where(eq(order_items.order_id, order.id));
    const itemId = oi[0].id;
    // Force to cancelled (non-refundable).
    await db.update(orders).set({ status: 'cancelled' }).where(eq(orders.id, order.id));

    const res = await runPut({ db, sdk: makeFakeSdk(), ctx: makeCtx({
      url: base + order.id,
      body: { refunds: [{ order_item_id: itemId, quantity: 1, amount: 100 }] },
      params: { id: order.id }, method: 'PUT',
    }) });
    assert.equal(res.status, 409);

    const refunds = await db.select().from(order_refunds).where(eq(order_refunds.order_id, order.id));
    assert.equal(refunds.length, 0, 'no refund row inserted');
    const [o] = await db.select().from(orders).where(eq(orders.id, order.id));
    assert.equal(o.refund_amount, null, 'no refund_amount change');
    assert.equal(o.refunded_at, null, 'no refunded_at change');
    const [p] = await db.select().from(products).where(eq(products.id, f.simpleProductId));
    assert.equal(p.stock, 98, 'no restock');
  } finally {
    await cleanup();
  }
});

test('(e) invalid body (missing order_item_id) → 422 with fields', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const order = await seedDeliveredOrder(db, f, 'ORD-RHE', 'cart-refund-e');
    const res = await runPut({ db, sdk: makeFakeSdk(), ctx: makeCtx({
      url: base + order.id,
      body: { refunds: [{ quantity: 1 }] },
      params: { id: order.id }, method: 'PUT',
    }) });
    assert.equal(res.status, 422);
    const b = await jsonBody(res);
    assert.equal(b.success, false);
    assert.ok(b.fields, 'fields present');
  } finally {
    await cleanup();
  }
});

test('(f) non-admin → 401', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const order = await seedDeliveredOrder(db, f, 'ORD-RHF', 'cart-refund-f');
    const sdk = makeFakeSdk({ authThrows: unauthorizedError() });
    const ctx = makeCtx({
      url: base + order.id,
      body: { refunds: [{ order_item_id: 'x', quantity: 1 }] },
      params: { id: order.id }, method: 'PUT',
    });
    const res = await runPut({ db, sdk, ctx });
    assert.equal(res.status, 401);
  } finally {
    await cleanup();
  }
});

test('PUT error-wrap → 500', () => {
  const sdk = makeFakeSdk();
  const ctx = makeCtx({
    url: base + 'x',
    body: { refunds: [{ order_item_id: 'x', quantity: 1 }] },
    params: { id: 'x' }, method: 'PUT',
  });
  return runPut({ db: poisonDb(), sdk, ctx }).then(async (res) => {
    assert.equal(res.status, 500);
    const b = await jsonBody(res);
    assert.equal(b.success, false);
  });
});
