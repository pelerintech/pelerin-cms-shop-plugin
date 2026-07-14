import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDb, seedMinimal, insertFixture } from '../db/harness.ts';
import { orders, order_status_history } from '../../src/db/schema.ts';
import { eq } from 'drizzle-orm';
import { createOrder } from '../../src/lib/data/orders.ts';
import {
  transitionOrder,
  validateTransition,
  OrderTransitionError,
} from '../../src/lib/order-transitions.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TRANSITIONS_PATH = resolve(__dirname, '../../src/lib/order-transitions.ts');

async function makeCartWithItem(db: any, f: any, cartId: string) {
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
    product_id: f.simpleProductId,
    variant_id: null,
    quantity: 1,
  });
  return cartId;
}

async function makeOrder(db: any, f: any, orderNumber: string, status: string) {
  const cartId = await makeCartWithItem(db, f, 'cart-' + orderNumber);
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
  if (status !== 'pending') {
    // createOrder sets status pending; force via raw update for the test scenario
    await db.update(orders).set({ status }).where(eq(orders.id, order.id));
  }
  return order;
}

test('order-transitions.ts does NOT import from astro:db', () => {
  const content = readFileSync(TRANSITIONS_PATH, 'utf-8');
  assert.doesNotMatch(
    content,
    /from\s+['"]astro:db['"]/,
    'order-transitions.ts must not import from astro:db — db is injected'
  );
});

test('transitionOrder(db, orderId, ...) transitions status and inserts history', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const order = await makeOrder(db, f, 'ORD-T1', 'pending');

    // transitionOrder(db, orderId, toStatus, note, changedBy) — db is first param
    await transitionOrder(db, order.id, 'awaiting_payment', 'test note', 'admin');

    const [updated] = await db.select().from(orders).where(eq(orders.id, order.id));
    assert.equal(updated.status, 'awaiting_payment');

    const history = await db
      .select()
      .from(order_status_history)
      .where(eq(order_status_history.order_id, order.id));
    assert.ok(history.length >= 1);
    assert.equal(history[history.length - 1].to_status, 'awaiting_payment');
  } finally {
    await cleanup();
  }
});

test('transitionOrder(db, ...) rejects invalid transition (cancelled→paid)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const order = await makeOrder(db, f, 'ORD-T2', 'cancelled');

    await assert.rejects(
      () => transitionOrder(db, order.id, 'paid'),
      (err: any) => err instanceof OrderTransitionError
    );
  } finally {
    await cleanup();
  }
});

test('validateTransition and OrderTransitionError are still re-exported', () => {
  assert.equal(typeof validateTransition, 'function');
  assert.ok(OrderTransitionError);
});
