/**
 * recordLineItemRefund accessor — line-item refunds, quantity-aware, transactional (r16).
 *
 * (a) delivered, item qty 2 → refund qty 1 → order_refunds row (qty 1), stock +1,
 *     orders.refund_amount += amount, status → partially_refunded.
 * (b) refund remaining qty 1 → second order_refunds row, stock +1, status → refunded (terminal).
 * (c) refund qty 3 for item of qty 2 → throws RefundError, no insert/restock/status change.
 * (d) refund qty 2 for item already refunded 1 → throws RefundError (exceeds remaining 1), no write.
 * (e) bad order_item_id → throws RefundError.
 * (f) order in cancelled status → throws RefundError (non-refundable), no write.
 *
 * See reespec/requests/shop-r16-inventory-lifecycle (line-item-refunds spec).
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { eq } from 'drizzle-orm';
import { createTestDb, seedMinimal, insertFixture } from '../../db/harness.ts';
import {
  products, orders, order_items, order_refunds,
} from '../../../src/db/schema.ts';
import { createOrder, recordLineItemRefund, RefundError } from '../../../src/lib/data/orders.ts';

const now = () => new Date();
const futureExpiry = () => new Date(now().getTime() + 30 * 24 * 60 * 60 * 1000);

async function makeCart(db: any, f: any, cartId: string, items: { productId: string; quantity: number }[]) {
  await insertFixture(db, 'carts', {
    id: cartId, session_id: 'sess-' + cartId, user_id: null, applied_voucher_code: null,
    applied_referral_code: null, converted_at: null, expires_at: futureExpiry(),
    created_at: now(), updated_at: now(),
  });
  for (const [i, it] of items.entries()) {
    await insertFixture(db, 'cart_items', {
      id: `ci-${cartId}-${i}`, cart_id: cartId, product_id: it.productId, variant_id: null, quantity: it.quantity,
    });
  }
}

async function seedDeliveredOrder(db: any, f: any, orderNumber: string, cartId: string, qty: number) {
  await makeCart(db, f, cartId, [{ productId: f.simpleProductId, quantity: qty }]);
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
  await db.update(orders).set({ status: 'delivered' }).where(eq(orders.id, order.id));
  return order;
}

test('(a) refund qty 1 of 2 → partially_refunded, stock +1, refund_amount += amount', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const order = await seedDeliveredOrder(db, f, 'ORD-RFA', 'cart-rfa', 2);
    // After createOrder: simple 100 → 98.
    const oi = await db.select().from(order_items).where(eq(order_items.order_id, order.id));
    const itemId = oi[0].id;

    await recordLineItemRefund(db, order.id, {
      refunds: [{ order_item_id: itemId, quantity: 1, amount: 5000, notes: '1 of 2' }],
      notes: 'partial refund',
    }, 'admin');

    // order_refunds row inserted.
    const refunds = await db.select().from(order_refunds).where(eq(order_refunds.order_id, order.id));
    assert.equal(refunds.length, 1);
    assert.equal(refunds[0].quantity, 1);
    assert.equal(refunds[0].order_item_id, itemId);
    assert.equal(refunds[0].amount, 5000);
    assert.equal(refunds[0].created_by, 'admin');

    // Stock +1: 98 → 99.
    const [p] = await db.select().from(products).where(eq(products.id, f.simpleProductId));
    assert.equal(p.stock, 99);

    // Status → partially_refunded; refund_amount = 5000.
    const [o] = await db.select().from(orders).where(eq(orders.id, order.id));
    assert.equal(o.status, 'partially_refunded');
    assert.equal(o.refund_amount, 5000);
    assert.ok(o.refunded_at);
  } finally {
    await cleanup();
  }
});

test('(b) refund remaining → refunded (terminal)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const order = await seedDeliveredOrder(db, f, 'ORD-RFB', 'cart-rfb', 2);
    const oi = await db.select().from(order_items).where(eq(order_items.order_id, order.id));
    const itemId = oi[0].id;

    // First refund: 1 of 2 → partially_refunded, stock 98→99.
    await recordLineItemRefund(db, order.id, {
      refunds: [{ order_item_id: itemId, quantity: 1, amount: 5000 }],
    }, 'admin');

    // Second refund: remaining 1 → refunded, stock 99→100.
    await recordLineItemRefund(db, order.id, {
      refunds: [{ order_item_id: itemId, quantity: 1, amount: 5000 }],
    }, 'admin');

    const refunds = await db.select().from(order_refunds).where(eq(order_refunds.order_id, order.id));
    assert.equal(refunds.length, 2);

    const [p] = await db.select().from(products).where(eq(products.id, f.simpleProductId));
    assert.equal(p.stock, 100, 'stock fully restored 98→100');

    const [o] = await db.select().from(orders).where(eq(orders.id, order.id));
    assert.equal(o.status, 'refunded');
    assert.equal(o.refund_amount, 10000);
  } finally {
    await cleanup();
  }
});

test('(c) refund qty 3 for item of qty 2 → throws RefundError, no write', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const order = await seedDeliveredOrder(db, f, 'ORD-RFC', 'cart-rfc', 2);
    const oi = await db.select().from(order_items).where(eq(order_items.order_id, order.id));
    const itemId = oi[0].id;

    await assert.rejects(
      () => recordLineItemRefund(db, order.id, {
        refunds: [{ order_item_id: itemId, quantity: 3, amount: 9999 }],
      }, 'admin'),
      (err: any) => err instanceof RefundError,
    );

    const refunds = await db.select().from(order_refunds).where(eq(order_refunds.order_id, order.id));
    assert.equal(refunds.length, 0, 'no refund row');
    const [p] = await db.select().from(products).where(eq(products.id, f.simpleProductId));
    assert.equal(p.stock, 98, 'stock unchanged');
    const [o] = await db.select().from(orders).where(eq(orders.id, order.id));
    assert.equal(o.status, 'delivered', 'status unchanged');
    assert.equal(o.refund_amount, null);
  } finally {
    await cleanup();
  }
});

test('(d) refund qty 2 for item already refunded 1 (remaining 1) → throws RefundError', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const order = await seedDeliveredOrder(db, f, 'ORD-RFD', 'cart-rfd', 2);
    const oi = await db.select().from(order_items).where(eq(order_items.order_id, order.id));
    const itemId = oi[0].id;

    // Refund 1 → partially_refunded.
    await recordLineItemRefund(db, order.id, {
      refunds: [{ order_item_id: itemId, quantity: 1, amount: 5000 }],
    }, 'admin');

    // Now try to refund 2 more (only 1 remaining) → reject.
    await assert.rejects(
      () => recordLineItemRefund(db, order.id, {
        refunds: [{ order_item_id: itemId, quantity: 2, amount: 9999 }],
      }, 'admin'),
      (err: any) => err instanceof RefundError,
    );

    const refunds = await db.select().from(order_refunds).where(eq(order_refunds.order_id, order.id));
    assert.equal(refunds.length, 1, 'only the first refund row exists');
    const [p] = await db.select().from(products).where(eq(products.id, f.simpleProductId));
    assert.equal(p.stock, 99, 'stock unchanged by the rejected refund');
  } finally {
    await cleanup();
  }
});

test('(e) bad order_item_id → throws RefundError', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const order = await seedDeliveredOrder(db, f, 'ORD-RFE', 'cart-rfe', 2);

    await assert.rejects(
      () => recordLineItemRefund(db, order.id, {
        refunds: [{ order_item_id: 'does-not-belong', quantity: 1, amount: 100 }],
      }, 'admin'),
      (err: any) => err instanceof RefundError,
    );

    const refunds = await db.select().from(order_refunds).where(eq(order_refunds.order_id, order.id));
    assert.equal(refunds.length, 0);
  } finally {
    await cleanup();
  }
});

test('(f) order in cancelled status → throws RefundError, no write', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const order = await seedDeliveredOrder(db, f, 'ORD-RFF', 'cart-rff', 2);
    const oi = await db.select().from(order_items).where(eq(order_items.order_id, order.id));
    const itemId = oi[0].id;
    // Force to cancelled (non-refundable).
    await db.update(orders).set({ status: 'cancelled' }).where(eq(orders.id, order.id));

    await assert.rejects(
      () => recordLineItemRefund(db, order.id, {
        refunds: [{ order_item_id: itemId, quantity: 1, amount: 100 }],
      }, 'admin'),
      (err: any) => err instanceof RefundError,
    );

    const refunds = await db.select().from(order_refunds).where(eq(order_refunds.order_id, order.id));
    assert.equal(refunds.length, 0, 'no refund row');
    const [p] = await db.select().from(products).where(eq(products.id, f.simpleProductId));
    assert.equal(p.stock, 98, 'stock unchanged');
    const [o] = await db.select().from(orders).where(eq(orders.id, order.id));
    assert.equal(o.status, 'cancelled', 'status unchanged');
  } finally {
    await cleanup();
  }
});
