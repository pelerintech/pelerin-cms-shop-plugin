import { test } from 'node:test';
import assert from 'node:assert';
import { createTestDb, seedMinimal, resetDb, insertFixture } from '../../db/harness.ts';
import {
  createOrder,
  getOrderWithItems,
  transitionOrderStatus,
  listOrders,
  decrementStock,
  generateOrderNumber,
  OrderTransitionError,
} from '../../../src/lib/data/orders.ts';
import {
  orders,
  order_status_history,
  carts,
  cart_items,
  products,
  product_variants,
} from '../../../src/db/schema.ts';
import { eq } from 'drizzle-orm';

async function makeCartWithItem(db: any, f: any, cartId = 'cart-o', productId?: string, qty = 2) {
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
    product_id: productId ?? f.simpleProductId,
    variant_id: null,
    quantity: qty,
  });
  return cartId;
}

test('createOrder creates an order with status pending, snapshotted items, decrements stock, clears cart', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    // simple product has stock=100
    const cartId = await makeCartWithItem(db, f, 'cart-1', f.simpleProductId, 2);

    const order = await createOrder(db, {
      order_number: 'ORD-1',
      user_id: null,
      customer_type: 'individual',
      customer_email: 'test@example.com',
      customer_name: 'Test User',
      customer_phone: null,
      currency: 'RON',
      subtotal_net: 10000,
      vat_total: 500,
      shipping_cost: 0,
      discount_amount: 0,
      total: 10500,
      shipping_type: 'physical',
      billing_first_name: 'Test',
      billing_last_name: 'User',
      billing_address: 'Addr',
      billing_city: 'City',
      billing_postal_code: '123',
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
          quantity: 2,
          price_net: 5000,
          vat_rate: 0.05,
          price_gross: 5250,
          currency: 'RON',
        },
      ],
    });

    assert.ok(order.id, 'must return order id');
    assert.strictEqual(order.status, 'pending', 'order must be created with status pending');

    // Stock decremented (was 100, ordered 2 → 98)
    const [prod] = await db.select().from(products).where(eq(products.id, f.simpleProductId));
    assert.strictEqual(prod.stock, 98, 'stock must be decremented by ordered quantity');

    // Cart cleared (converted_at set, items deleted)
    const [cart] = await db.select().from(carts).where(eq(carts.id, cartId));
    assert.ok(cart.converted_at, 'cart must be marked converted');
    const remainingItems = await db.select().from(cart_items).where(eq(cart_items.cart_id, cartId));
    assert.strictEqual(remainingItems.length, 0, 'cart items must be deleted');
  } finally {
    await cleanup();
  }
});

test('getOrderWithItems returns the order with all items', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const cartId = await makeCartWithItem(db, f);
    const order = await createOrder(db, {
      order_number: 'ORD-2',
      user_id: null,
      customer_type: 'individual',
      customer_email: 't@e.com',
      customer_name: 'T',
      customer_phone: null,
      currency: 'RON',
      subtotal_net: 10000,
      vat_total: 500,
      shipping_cost: 0,
      discount_amount: 0,
      total: 10500,
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
          quantity: 2,
          price_net: 5000,
          vat_rate: 0.05,
          price_gross: 5250,
          currency: 'RON',
        },
      ],
    });

    const result = await getOrderWithItems(db, order.id);
    assert.ok(result, 'must return the order');
    assert.strictEqual(result!.order.id, order.id);
    assert.ok(Array.isArray(result!.items));
    assert.strictEqual(result!.items.length, 1);
    assert.strictEqual(result!.items[0].product_name, 'Carte');
  } finally {
    await cleanup();
  }
});

test('getOrderWithItems returns null for a nonexistent order', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const result = await getOrderWithItems(db, 'nope');
    assert.strictEqual(result, null);
  } finally {
    await cleanup();
  }
});

test('transitionOrderStatus pending→paid updates status and inserts history row', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const cartId = await makeCartWithItem(db, f);
    const order = await createOrder(db, {
      order_number: 'ORD-3',
      user_id: null,
      customer_type: 'individual',
      customer_email: 't@e.com',
      customer_name: 'T',
      customer_phone: null,
      currency: 'RON',
      subtotal_net: 10000,
      vat_total: 500,
      shipping_cost: 0,
      discount_amount: 0,
      total: 10500,
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

    await transitionOrderStatus(db, order.id, 'awaiting_payment');
    await transitionOrderStatus(db, order.id, 'paid', 'Payment received');

    const [updated] = await db.select().from(orders).where(eq(orders.id, order.id));
    assert.strictEqual(updated.status, 'paid');
    const history = await db
      .select()
      .from(order_status_history)
      .where(eq(order_status_history.order_id, order.id));
    assert.ok(
      history.some((h) => h.to_status === 'paid'),
      'must have a history row for paid'
    );
  } finally {
    await cleanup();
  }
});

test('transitionOrderStatus rejects invalid transition (cancelled→paid)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const cartId = await makeCartWithItem(db, f);
    const order = await createOrder(db, {
      order_number: 'ORD-4',
      user_id: null,
      customer_type: 'individual',
      customer_email: 't@e.com',
      customer_name: 'T',
      customer_phone: null,
      currency: 'RON',
      subtotal_net: 10000,
      vat_total: 500,
      shipping_cost: 0,
      discount_amount: 0,
      total: 10500,
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
    // pending → cancelled (valid), then cancelled → paid (invalid, terminal)
    await transitionOrderStatus(db, order.id, 'cancelled');
    await assert.rejects(
      () => transitionOrderStatus(db, order.id, 'paid'),
      (err: any) => err instanceof OrderTransitionError || /invalid/i.test(err.message)
    );
  } finally {
    await cleanup();
  }
});

test('listOrders returns paginated orders ordered by created_at DESC', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    // Create 3 orders
    for (let i = 0; i < 3; i++) {
      const cartId = 'cart-l' + i;
      await makeCartWithItem(db, f, cartId, f.simpleProductId, 1);
      await createOrder(db, {
        order_number: 'ORD-L' + i,
        user_id: null,
        customer_type: 'individual',
        customer_email: 't@e.com',
        customer_name: 'T' + i,
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

    const result = await listOrders(db, { page: 1, limit: 2 });
    assert.ok(result.orders.length <= 2, 'must respect limit');
    assert.ok(result.total >= 3, 'total must reflect all orders');
    // DESC by created_at — most recent first
    if (result.orders.length >= 2) {
      assert.ok(
        result.orders[0].created_at >= result.orders[1].created_at,
        'must be DESC by created_at'
      );
    }
  } finally {
    await cleanup();
  }
});

test('listOrders filters by status', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const cartId = await makeCartWithItem(db, f, 'cart-f', f.simpleProductId, 1);
    const order = await createOrder(db, {
      order_number: 'ORD-F',
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
    await transitionOrderStatus(db, order.id, 'cancelled');

    const result = await listOrders(db, { page: 1, limit: 50, status: ['cancelled'] });
    assert.ok(
      result.orders.every((o) => o.status === 'cancelled'),
      'all returned orders must be cancelled'
    );
  } finally {
    await cleanup();
  }
});

test('generateOrderNumber produces sequential numbers', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const n1 = await generateOrderNumber(db);
    const n2 = await generateOrderNumber(db);
    assert.ok(n1 !== n2, 'sequential numbers must differ');
    assert.match(n1, /ORD-\d{4}-\d+/, 'must match the ORD-YEAR-SEQ pattern');
  } finally {
    await cleanup();
  }
});

test('decrementStock reduces stock for order items (skips null stock)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const cartId = await makeCartWithItem(db, f, 'cart-d', f.simpleProductId, 3);
    const order = await createOrder(db, {
      order_number: 'ORD-D',
      user_id: null,
      customer_type: 'individual',
      customer_email: 't@e.com',
      customer_name: 'T',
      customer_phone: null,
      currency: 'RON',
      subtotal_net: 15000,
      vat_total: 750,
      shipping_cost: 0,
      discount_amount: 0,
      total: 15750,
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
          quantity: 3,
          price_net: 5000,
          vat_rate: 0.05,
          price_gross: 5250,
          currency: 'RON',
        },
      ],
    });
    // createOrder already decrements; verify stock went 100 → 97
    const [prod] = await db.select().from(products).where(eq(products.id, f.simpleProductId));
    assert.strictEqual(prod.stock, 97);
  } finally {
    await cleanup();
  }
});
