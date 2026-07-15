import { test } from 'node:test';
import assert from 'node:assert';
import { ensureLoader } from '../../../../stubs/register.mjs';
import { matrix } from '../../_matrix.ts';
import { makeFakeSdk, makeCtx, poisonDb, unauthorizedError } from '../../../helpers.ts';
import { createTestDb, seedMinimal, insertFixture } from '../../../../db/harness.ts';
import { createOrder, transitionOrderStatus } from '../../../../../src/lib/data/orders.ts';
import { eq } from 'drizzle-orm';
import { products, orders, carts, cart_items } from '../../../../../src/db/schema.ts';

ensureLoader();
const { runPut } = await import('../../../../../src/api/shop/orders/[id]/cancel.ts');

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

async function seedOrder(db: any, f: any, orderNumber = 'ORD-C', cartId = 'cart-cancel') {
  await makeCartWithItem(db, f, cartId, f.simpleProductId);
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
  matrix.adminAuthFail({ run: runPut, url: base + 'x', params: { id: 'x' } }));

test('PUT happy-path → 200, status cancelled', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const order = await seedOrder(db, f);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({ url: base + order.id, params: { id: order.id }, method: 'PUT' });
    const res = await runPut({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await jsonBody(res);
    assert.equal(b.success, true);
    assert.equal(b.data.status, 'cancelled');
  } finally {
    await cleanup();
  }
});

test('PUT 404: unknown id → 404', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({ url: base + 'nope', params: { id: 'nope' }, method: 'PUT' });
    const res = await runPut({ db, sdk, ctx });
    assert.equal(res.status, 404);
    const b = await jsonBody(res);
    assert.equal(b.success, false);
  } finally {
    await cleanup();
  }
});

test('PUT 409: non-cancellable state → 409', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const order = await seedOrder(db, f, 'ORD-C409', 'cart-cancel409');
    // Move to a non-cancellable terminal state (delivered is not in CANCELLABLE_STATUSES)
    await transitionOrderStatus(db, order.id, 'awaiting_payment');
    await transitionOrderStatus(db, order.id, 'paid');
    await transitionOrderStatus(db, order.id, 'processing');
    await transitionOrderStatus(db, order.id, 'shipped');
    await transitionOrderStatus(db, order.id, 'delivered');
    const sdk = makeFakeSdk();
    const ctx = makeCtx({ url: base + order.id, params: { id: order.id }, method: 'PUT' });
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
  const ctx = makeCtx({ url: base + 'x', params: { id: 'x' }, method: 'PUT' });
  return runPut({ db: poisonDb(), sdk, ctx }).then(async (res) => {
    assert.equal(res.status, 500);
    const b = await jsonBody(res);
    assert.equal(b.success, false);
  });
});

// ── r16: restock-on-cancel wiring ──

test('r16: cancel restores stock for all line items (full restock)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const order = await seedOrder(db, f, 'ORD-CR', 'cart-cancel-r16');
    // After createOrder: simple product stock 100 → 99 (qty 1 ordered).
    const [pBefore] = await db.select().from(products).where(eq(products.id, f.simpleProductId));
    assert.equal(pBefore.stock, 99);

    const sdk = makeFakeSdk();
    const ctx = makeCtx({ url: base + order.id, params: { id: order.id }, method: 'PUT' });
    const res = await runPut({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await jsonBody(res);
    assert.equal(b.data.status, 'cancelled');

    // Stock restored: 99 → 100.
    const [pAfter] = await db.select().from(products).where(eq(products.id, f.simpleProductId));
    assert.equal(pAfter.stock, 100, 'cancel must restock the ordered quantity');
  } finally {
    await cleanup();
  }
});

test('r16: already-cancelled order → 409 and NO restock', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const order = await seedOrder(db, f, 'ORD-CC', 'cart-cancel-cc');
    // Cancel once.
    await runPut({
      db,
      sdk: makeFakeSdk(),
      ctx: makeCtx({ url: base + order.id, params: { id: order.id }, method: 'PUT' }),
    });
    // Stock now 99 → 100 (restocked).
    const [pAfterFirst] = await db
      .select()
      .from(products)
      .where(eq(products.id, f.simpleProductId));
    assert.equal(pAfterFirst.stock, 100);

    // Cancel again → 409, no double-restock.
    const res = await runPut({
      db,
      sdk: makeFakeSdk(),
      ctx: makeCtx({ url: base + order.id, params: { id: order.id }, method: 'PUT' }),
    });
    assert.equal(res.status, 409);
    const [pAfterSecond] = await db
      .select()
      .from(products)
      .where(eq(products.id, f.simpleProductId));
    assert.equal(pAfterSecond.stock, 100, 'no double-restock on already-cancelled');
  } finally {
    await cleanup();
  }
});

test('r16: non-admin → 401 and NO restock / NO transition', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const order = await seedOrder(db, f, 'ORD-CA', 'cart-cancel-auth');
    // Stock is 99 after createOrder.
    const sdk = makeFakeSdk({ authThrows: unauthorizedError() });
    const ctx = makeCtx({ url: base + order.id, params: { id: order.id }, method: 'PUT' });
    const res = await runPut({ db, sdk, ctx });
    assert.equal(res.status, 401);

    // Stock unchanged (no restock), status unchanged (still pending).
    const [p] = await db.select().from(products).where(eq(products.id, f.simpleProductId));
    assert.equal(p.stock, 99, 'no restock when auth fails');
    const [o] = await db.select().from(orders).where(eq(orders.id, order.id));
    assert.equal(o.status, 'pending', 'no transition when auth fails');
  } finally {
    await cleanup();
  }
});
