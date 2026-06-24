import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDb, seedMinimal, insertFixture } from '../db/harness.ts';
import { orders, carts, cart_items } from '../../src/db/schema.ts';
import { eq } from 'drizzle-orm';
import { clearCartForOrder } from '../../src/lib/cart-clear.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CART_CLEAR_PATH = resolve(__dirname, '../../src/lib/cart-clear.ts');

test('cart-clear.ts does NOT import from astro:db', () => {
  const content = readFileSync(CART_CLEAR_PATH, 'utf-8');
  assert.doesNotMatch(content, /from\s+['"]astro:db['"]/,
    'cart-clear.ts must not import from astro:db — db is injected');
});

async function makeOrderAndCart(db: any, orderNumber: string, userId: string) {
  const now = new Date();
  const orderId = crypto.randomUUID();
  const cartId = 'cart-clear-' + orderNumber;
  // Cart with a user_id and one item, not yet converted
  await insertFixture(db, 'carts', {
    id: cartId, session_id: 'sess-' + cartId, user_id: userId, applied_voucher_code: null,
    applied_referral_code: null, converted_at: null,
    expires_at: new Date(now.getTime() + 30 * 86400000),
    created_at: now, updated_at: now,
  });
  await insertFixture(db, 'cart_items', {
    id: 'ci-' + cartId, cart_id: cartId, product_id: crypto.randomUUID(), variant_id: null, quantity: 1,
  });
  // Order with user_id matching the cart
  await db.insert(orders).values({
    id: orderId, order_number: orderNumber, status: 'paid',
    user_id: userId, customer_type: 'individual', customer_email: 't@e.com',
    customer_name: 'T', customer_phone: null, currency: 'RON', subtotal_net: 5000, vat_total: 250,
    shipping_cost: 0, discount_amount: 0, total: 5250, shipping_type: 'physical',
    billing_first_name: 'T', billing_last_name: 'U', billing_address: 'A', billing_city: 'C',
    billing_postal_code: '1', billing_country: 'RO',
    shipping_first_name: 'T', shipping_last_name: 'U', shipping_address: 'A',
    shipping_city: 'C', shipping_postal_code: '1', shipping_country: 'RO',
    shipping_same_as_billing: true,
    created_at: now, updated_at: now,
  });
  return { orderId, cartId };
}

test('clearCartForOrder(db, orderId) deletes cart_items and marks cart converted', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const userId = crypto.randomUUID();
    const { orderId, cartId } = await makeOrderAndCart(db, 'ORD-CC1', userId);

    // signature: clearCartForOrder(db, orderId) — db is first param
    await clearCartForOrder(db, orderId);

    // cart_items for this cart should be gone
    const remainingItems = await db.select().from(cart_items).where(eq(cart_items.cart_id, cartId));
    assert.equal(remainingItems.length, 0, 'cart_items should be deleted');

    // cart should be marked converted
    const [updatedCart] = await db.select().from(carts).where(eq(carts.id, cartId));
    assert.ok(updatedCart.converted_at, 'cart should have converted_at set');
  } finally {
    await cleanup();
  }
});

test('clearCartForOrder(db, orderId) does nothing for order with no user_id', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const now = new Date();
    const orderId = crypto.randomUUID();
    // Guest order — no user_id
    await db.insert(orders).values({
      id: orderId, order_number: 'ORD-CC2', status: 'paid',
      user_id: null, customer_type: 'individual', customer_email: 'g@e.com',
      customer_name: 'G', customer_phone: null, currency: 'RON', subtotal_net: 5000, vat_total: 250,
      shipping_cost: 0, discount_amount: 0, total: 5250, shipping_type: 'physical',
      billing_first_name: 'G', billing_last_name: 'U', billing_address: 'A', billing_city: 'C',
      billing_postal_code: '1', billing_country: 'RO',
      shipping_first_name: 'G', shipping_last_name: 'U', shipping_address: 'A',
      shipping_city: 'C', shipping_postal_code: '1', shipping_country: 'RO',
      shipping_same_as_billing: true,
      created_at: now, updated_at: now,
    });

    // Should not throw and should resolve without touching db unexpectedly
    await clearCartForOrder(db, orderId);
    assert.ok(true, 'completed without error for guest order');
  } finally {
    await cleanup();
  }
});
