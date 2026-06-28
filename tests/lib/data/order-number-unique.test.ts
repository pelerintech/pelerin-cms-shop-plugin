/**
 * generateOrderNumber UNIQUE-violation retry (r16).
 *
 * (a) A pre-existing orders row collides with the sequence-generated number;
 *     createOrder's retry loop catches the UNIQUE violation and retries with the
 *     next sequence value, succeeding with a non-colliding number.
 * (b) After N sequential createOrder calls, no duplicate order_number is persisted.
 *
 * See reespec/requests/shop-r16-inventory-lifecycle (unique-order-number spec).
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { eq } from 'drizzle-orm';
import { createTestDb, seedMinimal, insertFixture } from '../../db/harness.ts';
import { orders, shop_settings } from '../../../src/db/schema.ts';
import { createOrder } from '../../../src/lib/data/orders.ts';

const now = () => new Date();
const futureExpiry = () => new Date(now().getTime() + 30 * 24 * 60 * 60 * 1000);

async function makeCart(db: any, f: any, cartId: string) {
  await insertFixture(db, 'carts', {
    id: cartId, session_id: 'sess-' + cartId, user_id: null, applied_voucher_code: null,
    applied_referral_code: null, converted_at: null, expires_at: futureExpiry(),
    created_at: now(), updated_at: now(),
  });
  await insertFixture(db, 'cart_items', {
    id: 'ci-' + cartId, cart_id: cartId, product_id: f.simpleProductId, variant_id: null, quantity: 1,
  });
}

function baseInput(cartId: string) {
  return {
    order_number: 'ORD-UN', user_id: null, customer_type: 'individual',
    customer_email: 't@e.com', customer_name: 'T', customer_phone: null, currency: 'RON',
    subtotal_net: 5000, vat_total: 250, shipping_cost: 0, discount_amount: 0, total: 5250,
    shipping_type: 'physical', billing_first_name: 'T', billing_last_name: 'U', billing_address: 'A',
    billing_city: 'C', billing_postal_code: '1', billing_country: 'RO',
    shipping_first_name: 'T', shipping_last_name: 'U', shipping_address: 'A',
    shipping_city: 'C', shipping_postal_code: '1', shipping_country: 'RO',
    shipping_same_as_billing: true, cart_id: cartId,
    items: [{ product_id: null, variant_id: null, product_name: 'Carte', sku: 'BOOK-001', quantity: 1, price_net: 5000, vat_rate: 0.05, price_gross: 5250, currency: 'RON' }],
  };
}

function bareOrderRow(id: string, orderNumber: string) {
  return {
    id, order_number: orderNumber, user_id: null, customer_type: 'individual',
    customer_email: 'x@e.com', customer_name: 'X', customer_phone: null, status: 'cancelled',
    currency: 'RON', subtotal_net: 0, vat_total: 0, shipping_cost: 0, discount_amount: 0, total: 0,
    shipping_type: 'physical', billing_first_name: 'X', billing_last_name: 'Y', billing_address: 'A',
    billing_city: 'C', billing_postal_code: '1', billing_country: 'RO',
    shipping_first_name: 'X', shipping_last_name: 'Y', shipping_address: 'A',
    shipping_city: 'C', shipping_postal_code: '1', shipping_country: 'RO',
    shipping_same_as_billing: true, created_at: now(), updated_at: now(),
  };
}

test('(a) collision on order_number is retried and succeeds with a non-colliding number', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    // seedMinimal sets sequence='0'. Pre-insert a row colliding with seq→1.
    const year = new Date().getFullYear();
    const collideNum = `ORD-${year}-${String(1).padStart(6, '0')}`;
    await db.insert(orders).values(bareOrderRow('pre-collide-1', collideNum));

    const cartId = 'cart-uniq-a';
    await makeCart(db, f, cartId);

    const order = await createOrder(db, baseInput(cartId));

    // seq 0→1 collides; retry advances to 2 → succeeds.
    assert.notEqual(order.order_number, collideNum, 'must not be the colliding number');
    assert.match(order.order_number, /000002$/, 'retry produced the next sequence number');

    // Exactly one row with the colliding number (the pre-inserted one).
    const collideRows = await db.select().from(orders).where(eq(orders.order_number, collideNum));
    assert.equal(collideRows.length, 1, 'no duplicate persisted for the colliding number');
  } finally {
    await cleanup();
  }
});

test('(b) N sequential createOrder calls produce no duplicate order_number', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const numbers: string[] = [];
    for (let i = 0; i < 5; i++) {
      const cartId = `cart-uniq-b-${i}`;
      await makeCart(db, f, cartId);
      const order = await createOrder(db, baseInput(cartId));
      numbers.push(order.order_number);
    }
    // All distinct.
    assert.equal(new Set(numbers).size, numbers.length, 'all order_numbers distinct');

    // DB-level: no duplicates.
    const allOrders = await db.select().from(orders);
    const counts = new Map<string, number>();
    for (const o of allOrders) counts.set(o.order_number, (counts.get(o.order_number) ?? 0) + 1);
    const dups = [...counts.entries()].filter(([, c]) => c > 1);
    assert.equal(dups.length, 0, `no duplicate order_number in DB (dups: ${JSON.stringify(dups)})`);
  } finally {
    await cleanup();
  }
});
