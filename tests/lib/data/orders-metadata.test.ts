/**
 * Tests for orders.metadata column via createOrder accessor.
 *
 * Scenarios:
 *  (a) createOrder with metadata → order.metadata equals the JSON string
 *  (b) createOrder without metadata → order.metadata is null
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { createTestDb, seedMinimal, insertFixture } from '../../db/harness.ts';
import { createOrder, getOrderWithItems } from '../../../src/lib/data/orders.ts';

const now = () => new Date();
const futureExpiry = () => new Date(now().getTime() + 30 * 24 * 60 * 60 * 1000);

async function makeCart(
  db: any,
  f: any,
  cartId: string,
  items: { productId: string; variantId?: string | null; quantity: number }[]
) {
  await insertFixture(db, 'carts', {
    id: cartId,
    session_id: 'sess-' + cartId,
    user_id: null,
    applied_voucher_code: null,
    applied_referral_code: null,
    converted_at: null,
    expires_at: futureExpiry(),
    created_at: now(),
    updated_at: now(),
  });
  for (const [i, it] of items.entries()) {
    await insertFixture(db, 'cart_items', {
      id: `ci-${cartId}-${i}`,
      cart_id: cartId,
      product_id: it.productId,
      variant_id: it.variantId ?? null,
      quantity: it.quantity,
    });
  }
}

function baseOrderInput(orderNumber: string, cartId: string, items: any[]) {
  return {
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
    billing_postal_code: 'P',
    billing_country: 'RO',
    shipping_first_name: 'T',
    shipping_last_name: 'U',
    shipping_address: 'A',
    shipping_city: 'C',
    shipping_postal_code: 'P',
    shipping_country: 'RO',
    shipping_same_as_billing: true,
    cart_id: cartId,
    items,
  };
}

test('createOrder with metadata → order.metadata equals JSON string', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const cartId = 'cart-meta-1';
    await makeCart(db, f, cartId, [{ productId: f.simpleProductId, quantity: 2 }]);

    const order = await createOrder(db, {
      ...baseOrderInput('ORD-META-1', cartId, [
        {
          product_id: f.simpleProductId,
          variant_id: null,
          product_name: 'Test',
          quantity: 2,
          price_net: 2500,
          vat_rate: 0.19,
          price_gross: 2975,
          currency: 'RON',
        },
      ]),
      metadata: '{"pickup_location":"EasyBox 12","notes":"call ahead"}',
    });

    assert.ok(order.id, 'order created');

    const fetched = await getOrderWithItems(db, order.id);
    assert.ok(fetched, 'order found');
    assert.equal(fetched.order.metadata, '{"pickup_location":"EasyBox 12","notes":"call ahead"}');
  } finally {
    await cleanup();
  }
});

test('createOrder without metadata → order.metadata is null', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const cartId = 'cart-meta-2';
    await makeCart(db, f, cartId, [{ productId: f.simpleProductId, quantity: 1 }]);

    const order = await createOrder(db, {
      ...baseOrderInput('ORD-META-2', cartId, [
        {
          product_id: f.simpleProductId,
          variant_id: null,
          product_name: 'Test',
          quantity: 1,
          price_net: 5000,
          vat_rate: 0.19,
          price_gross: 5950,
          currency: 'RON',
        },
      ]),
    });

    assert.ok(order.id, 'order created');

    const fetched = await getOrderWithItems(db, order.id);
    assert.ok(fetched, 'order found');
    assert.equal(fetched.order.metadata, null);
  } finally {
    await cleanup();
  }
});
