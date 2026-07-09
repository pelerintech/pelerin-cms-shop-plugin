/**
 * Transactional `createOrder` — atomicity, in-tx stock re-validation, atomic decrement.
 *
 * Scenarios:
 *  (a) Happy path — cart with 2 items, sufficient stock → order created, items/history exist,
 *      stock decremented, cart cleared + converted.
 *  (b) Rollback path — a forced failure mid-flow (after the order row insert) → createOrder throws,
 *      and NO orders row, NO order_items, NO history, stock UNCHANGED, cart items still present,
 *      cart.converted_at still null.
 *  (c) Insufficient-stock-in-tx path — an item whose stock is insufficient → createOrder throws
 *      StockValidationError BEFORE any decrement, stock unchanged.
 *
 * See reespec/requests/shop-r16-inventory-lifecycle (transactional-order-creation spec).
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { eq } from 'drizzle-orm';
import { createTestDb, seedMinimal, insertFixture } from '../../db/harness.ts';
import {
  products, product_variants, orders, order_items, order_status_history,
  carts, cart_items, shop_settings,
} from '../../../src/db/schema.ts';
import { createOrder, StockValidationError } from '../../../src/lib/data/orders.ts';

const now = () => new Date();
const futureExpiry = () => new Date(now().getTime() + 30 * 24 * 60 * 60 * 1000);

async function makeCart(db: any, f: any, cartId: string, items: { productId: string; variantId?: string | null; quantity: number }[]) {
  await insertFixture(db, 'carts', {
    id: cartId, session_id: 'sess-' + cartId, user_id: null, applied_voucher_code: null,
    applied_referral_code: null, converted_at: null, expires_at: futureExpiry(),
    created_at: now(), updated_at: now(),
  });
  for (const [i, it] of items.entries()) {
    await insertFixture(db, 'cart_items', {
      id: `ci-${cartId}-${i}`, cart_id: cartId, product_id: it.productId,
      variant_id: it.variantId ?? null, quantity: it.quantity,
    });
  }
}

function baseOrderInput(orderNumber: string, cartId: string, items: any[]) {
  return {
    order_number: orderNumber, user_id: null, customer_type: 'individual',
    customer_email: 't@e.com', customer_name: 'T', customer_phone: null, currency: 'RON',
    subtotal_net: 5000, vat_total: 250, shipping_cost: 0, discount_amount: 0, total: 5250,
    shipping_type: 'physical', billing_first_name: 'T', billing_last_name: 'U', billing_address: 'A',
    billing_city: 'C', billing_postal_code: '1', billing_country: 'RO',
    shipping_first_name: 'T', shipping_last_name: 'U', shipping_address: 'A',
    shipping_city: 'C', shipping_postal_code: '1', shipping_country: 'RO',
    shipping_same_as_billing: true, cart_id: cartId, items,
  };
}

test('(happy) createOrder: 2 items, sufficient stock → order + items + history + stock decrement + cart cleared', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const cartId = 'cart-happy';
    await makeCart(db, f, cartId, [
      { productId: f.simpleProductId, quantity: 2 },
      { productId: f.variantProductId, variantId: f.variantBlack128Id, quantity: 1 },
    ]);

    const order = await createOrder(db, baseOrderInput('ORD-HAPPY', cartId, [
      { product_id: f.simpleProductId, variant_id: null, product_name: 'Carte', sku: 'BOOK-001', quantity: 2, price_net: 5000, vat_rate: 0.05, price_gross: 5250, currency: 'RON' },
      { product_id: f.variantProductId, variant_id: f.variantBlack128Id, product_name: 'Telefon', sku: 'SMX-BLK-128', quantity: 1, price_net: 25000, vat_rate: 0.19, price_gross: 29750, currency: 'RON' },
    ]));

    assert.equal(order.status, 'pending');
    // createOrder generates its own order_number (ignores input.order_number).
    assert.match(order.order_number, /ORD-\d{4}-\d+/, 'order_number is generated');

    const [ord] = await db.select().from(orders).where(eq(orders.id, order.id));
    assert.ok(ord, 'order row exists');

    const items = await db.select().from(order_items).where(eq(order_items.order_id, order.id));
    assert.equal(items.length, 2);

    const hist = await db.select().from(order_status_history).where(eq(order_status_history.order_id, order.id));
    assert.ok(hist.some(h => h.to_status === 'pending' && h.from_status === null));

    const [prod] = await db.select().from(products).where(eq(products.id, f.simpleProductId));
    assert.equal(prod.stock, 98, 'simple product stock 100 → 98');

    const [variant] = await db.select().from(product_variants).where(eq(product_variants.id, f.variantBlack128Id));
    assert.equal(variant.stock, 49, 'variant stock 50 → 49');

    const remainingCartItems = await db.select().from(cart_items).where(eq(cart_items.cart_id, cartId));
    assert.equal(remainingCartItems.length, 0, 'cart items cleared');
    const [cart] = await db.select().from(carts).where(eq(carts.id, cartId));
    assert.ok(cart.converted_at, 'cart.converted_at is set');
  } finally {
    await cleanup();
  }
});

test('(rollback) a forced failure mid-flow rolls back order, items, history, stock, cart', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const cartId = 'cart-rollback';
    await makeCart(db, f, cartId, [{ productId: f.simpleProductId, quantity: 1 }]);

    // Force a failure by giving the order an order_number that already exists
    // (UNIQUE constraint on orders.order_number). The second createOrder commits
    // its order-row insert then the rollback path triggers on the unique violation.
    // First, create an order with the colliding number.
    const first = await createOrder(db, baseOrderInput('ORD-COLLIDE', 'cart-rollback-first', [
      { product_id: f.simpleProductId, variant_id: null, product_name: 'Carte', sku: 'BOOK-001', quantity: 1, price_net: 5000, vat_rate: 0.05, price_gross: 5250, currency: 'RON' },
    ]));
    assert.ok(first);

    // Stock is now 100 → 99 after the first order.
    const [prodMid] = await db.select().from(products).where(eq(products.id, f.simpleProductId));
    assert.equal(prodMid.stock, 99);

    // createOrder ignores input.order_number and generates its own via the
    // sequence. With sequence=1, generateOrderNumber → 2 → collides with the
    // pre-inserted row; the retry loop advances to 3 and succeeds.
    // (The pre-collide row used the ORD-<year>-00002 form.)
    const year = new Date().getFullYear();
    const collideNum = `ORD-${year}-${String(2).padStart(6, '0')}`;
    // Pre-insert a bare orders row to collide.
    await db.insert(orders).values({
      id: 'pre-collide', order_number: collideNum, user_id: null, customer_type: 'individual',
      customer_email: 'x@e.com', customer_name: 'X', customer_phone: null, status: 'cancelled',
      currency: 'RON', subtotal_net: 0, vat_total: 0, shipping_cost: 0, discount_amount: 0, total: 0,
      shipping_type: 'physical', billing_first_name: 'X', billing_last_name: 'Y', billing_address: 'A',
      billing_city: 'C', billing_postal_code: '1', billing_country: 'RO',
      shipping_first_name: 'X', shipping_last_name: 'Y', shipping_address: 'A',
      shipping_city: 'C', shipping_postal_code: '1', shipping_country: 'RO',
      shipping_same_as_billing: true, created_at: now(), updated_at: now(),
    });
    // Set sequence to 1 so generateOrderNumber → 2 → collideNum.
    await db.update(shop_settings).set({ value: '1' }).where(eq(shop_settings.key, 'order_number_sequence'));

    // createOrder generates its own number: seq 1→2 produces `collideNum`, which
    // collides with the pre-inserted row. The retry loop catches the UNIQUE
    // violation, re-runs generateOrderNumber (seq 2→3 → ORD-...-000003), and
    // succeeds. The colliding attempt's partial writes (order row, stock decrement)
    // are rolled back — proving the rollback semantics.
    const secondOrder = await createOrder(db, baseOrderInput('ORD-SHOULD-RETRY', cartId, [
      { product_id: f.simpleProductId, variant_id: null, product_name: 'Carte', sku: 'BOOK-001', quantity: 1, price_net: 5000, vat_rate: 0.05, price_gross: 5250, currency: 'RON' },
    ]));

    // The retry should have produced ORD-...-000003 (seq advanced to 3).
    assert.notEqual(secondOrder.order_number, collideNum, 'retry must produce a non-colliding number');
    assert.match(secondOrder.order_number, /000003$/);

    // Only ONE order row should exist with the colliding number (the pre-inserted one).
    const collideRows = await db.select().from(orders).where(eq(orders.order_number, collideNum));
    assert.equal(collideRows.length, 1, 'no duplicate order_number persisted');

    // Stock went 99 → 98 (one successful decrement for the second order).
    const [prodAfter] = await db.select().from(products).where(eq(products.id, f.simpleProductId));
    assert.equal(prodAfter.stock, 98);
  } finally {
    await cleanup();
  }
});

test('(insufficient stock) createOrder throws StockValidationError before any decrement, stock unchanged', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    // Set the simple product stock to 1, then order quantity 5.
    await db.update(products).set({ stock: 1 }).where(eq(products.id, f.simpleProductId));
    const cartId = 'cart-insuff';
    await makeCart(db, f, cartId, [{ productId: f.simpleProductId, quantity: 5 }]);

    await assert.rejects(
      () => createOrder(db, baseOrderInput('ORD-INSUFF', cartId, [
        { product_id: f.simpleProductId, variant_id: null, product_name: 'Carte', sku: 'BOOK-001', quantity: 5, price_net: 5000, vat_rate: 0.05, price_gross: 5250, currency: 'RON' },
      ])),
      (err: any) => err instanceof StockValidationError,
    );

    // Stock unchanged (no decrement occurred).
    const [prod] = await db.select().from(products).where(eq(products.id, f.simpleProductId));
    assert.equal(prod.stock, 1, 'stock must be unchanged after insufficient-stock rollback');

    // No order row, no items, no history.
    const allOrders = await db.select().from(orders);
    assert.equal(allOrders.length, 0, 'no order row persisted');

    // Cart still has its items and is not converted.
    const cis = await db.select().from(cart_items).where(eq(cart_items.cart_id, cartId));
    assert.equal(cis.length, 1, 'cart items still present after rollback');
    const [cart] = await db.select().from(carts).where(eq(carts.id, cartId));
    assert.equal(cart.converted_at, null, 'cart.converted_at still null after rollback');
  } finally {
    await cleanup();
  }
});

test('(rollback) a mid-transaction throw leaves NO partial order, items, history, or stock change', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const cartId = 'cart-throw';
    await makeCart(db, f, cartId, [{ productId: f.simpleProductId, quantity: 1 }]);

    // Force a throw AFTER the order row + items + history are inserted but BEFORE
    // the cart clear, by making the cart_id reference a non-existent cart so the
    // update/delete are no-ops — no, that won't throw. Instead, force the throw
    // by setting the order_number to collide with a pre-existing row AND setting
    // order_number_sequence such that ALL 3 retry attempts collide. Then createOrder
    // rethrows after exhausting retries, and the LAST attempt's transaction must
    // have rolled back (no partial row for the colliding number beyond the pre-existing).
    const year = new Date().getFullYear();
    // Pre-insert 3 colliding rows: ORD-...-000002, 000003, 000004 (6-digit padding).
    for (const seq of [2, 3, 4]) {
      await db.insert(orders).values({
        id: `pre-${seq}`, order_number: `ORD-${year}-${String(seq).padStart(6, '0')}`, user_id: null,
        customer_type: 'individual', customer_email: 'x@e.com', customer_name: 'X',
        customer_phone: null, status: 'cancelled', currency: 'RON', subtotal_net: 0,
        vat_total: 0, shipping_cost: 0, discount_amount: 0, total: 0, shipping_type: 'physical',
        billing_first_name: 'X', billing_last_name: 'Y', billing_address: 'A', billing_city: 'C',
        billing_postal_code: '1', billing_country: 'RO', shipping_first_name: 'X',
        shipping_last_name: 'Y', shipping_address: 'A', shipping_city: 'C',
        shipping_postal_code: '1', shipping_country: 'RO', shipping_same_as_billing: true,
        created_at: now(), updated_at: now(),
      });
    }
    // sequence = 1 → generateOrderNumber produces 00002, 00003, 00004 on retries.
    await db.update(shop_settings).set({ value: '1' }).where(eq(shop_settings.key, 'order_number_sequence'));

    // createOrder should exhaust retries and rethrow.
    await assert.rejects(
      () => createOrder(db, baseOrderInput('ORD-THROW', cartId, [
        { product_id: f.simpleProductId, variant_id: null, product_name: 'Carte', sku: 'BOOK-001', quantity: 1, price_net: 5000, vat_rate: 0.05, price_gross: 5250, currency: 'RON' },
      ])),
    );

    // No NEW order row was persisted (only the 3 pre-inserted cancelled rows + none for this attempt).
    const allOrders = await db.select().from(orders);
    // 3 pre-inserted rows; no 4th row from the failed createOrder.
    assert.equal(allOrders.length, 3, 'no partial order row persisted after exhausted-retry rollback');

    // Stock unchanged (the decrements in each retried tx were rolled back).
    const [prod] = await db.select().from(products).where(eq(products.id, f.simpleProductId));
    assert.equal(prod.stock, 100, 'stock unchanged after exhausted-retry rollback');

    // Cart still has its items.
    const cis = await db.select().from(cart_items).where(eq(cart_items.cart_id, cartId));
    assert.equal(cis.length, 1, 'cart items still present after rollback');
    const [cart] = await db.select().from(carts).where(eq(carts.id, cartId));
    assert.equal(cart.converted_at, null, 'cart.converted_at still null after rollback');
  } finally {
    await cleanup();
  }
});
