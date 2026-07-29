/**
 * Tests for listOrders userId and email filters.
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { eq } from 'drizzle-orm';
import { createTestDb, seedMinimal, insertFixture } from '../../db/harness.ts';
import { listOrders } from '../../../src/lib/data/orders.ts';
import { orders } from '../../../src/db/schema.ts';

const now = () => new Date();

async function seedOrderForUser(db: any, overrides: Record<string, any>): Promise<string> {
  const id = crypto.randomUUID();
  await insertFixture(db, 'orders', {
    id,
    order_number: overrides.order_number || `ORD-${id.slice(0, 8)}`,
    user_id: overrides.user_id ?? null,
    customer_type: 'individual',
    customer_email: overrides.customer_email || 'anon@x.com',
    customer_name: 'Test',
    customer_phone: null,
    status: 'pending',
    currency: 'RON',
    subtotal_net: 1000,
    vat_total: 190,
    shipping_cost: 0,
    discount_amount: 0,
    total: 1190,
    shipping_type: 'physical',
    billing_first_name: 'A',
    billing_last_name: 'B',
    billing_address: 'Addr',
    billing_city: 'City',
    billing_postal_code: '123',
    billing_country: 'RO',
    shipping_first_name: 'A',
    shipping_last_name: 'B',
    shipping_address: 'Addr',
    shipping_city: 'City',
    shipping_postal_code: '123',
    shipping_country: 'RO',
    shipping_same_as_billing: true,
    created_at: now(),
    updated_at: now(),
  });
  return id;
}

test('listOrders with userId filter returns only matching orders', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedOrderForUser(db, {
      user_id: 'user-A',
      customer_email: 'a@x.com',
      order_number: 'ORD-A1',
    });
    await seedOrderForUser(db, {
      user_id: 'user-B',
      customer_email: 'b@x.com',
      order_number: 'ORD-B1',
    });
    await seedOrderForUser(db, {
      user_id: 'user-A',
      customer_email: 'a@x.com',
      order_number: 'ORD-A2',
    });

    const result = await listOrders(db, { userId: 'user-A' });
    assert.equal(result.orders.length, 2, 'user-A has 2 orders');
    assert.ok(
      result.orders.every((o: any) => o.user_id === 'user-A'),
      'all orders belong to user-A'
    );
  } finally {
    await cleanup();
  }
});

test('listOrders with email filter returns only matching orders', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedOrderForUser(db, {
      customer_email: 'a@x.com',
      user_id: 'user-A',
      order_number: 'ORD-A1',
    });
    await seedOrderForUser(db, {
      customer_email: 'b@x.com',
      user_id: 'user-B',
      order_number: 'ORD-B1',
    });
    await seedOrderForUser(db, {
      customer_email: 'a@x.com',
      user_id: 'user-A',
      order_number: 'ORD-A2',
    });

    const result = await listOrders(db, { email: 'a@x.com' });
    assert.equal(result.orders.length, 2, 'email a@x.com has 2 orders');
    assert.ok(
      result.orders.every((o: any) => o.customer_email === 'a@x.com'),
      'all orders match email'
    );
  } finally {
    await cleanup();
  }
});

test('listOrders with both userId and email filters returns only matching orders', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedOrderForUser(db, {
      user_id: 'user-X',
      customer_email: 'x@example.com',
      order_number: 'ORD-BOTH-1',
    });
    // Same user_id, different email — should not match
    await seedOrderForUser(db, {
      user_id: 'user-X',
      customer_email: 'y@example.com',
      order_number: 'ORD-X-ONLY',
    });
    // Different user_id, same email — should not match
    await seedOrderForUser(db, {
      user_id: 'user-Y',
      customer_email: 'x@example.com',
      order_number: 'ORD-EMAIL-ONLY',
    });

    const result = await listOrders(db, { userId: 'user-X', email: 'x@example.com' });
    assert.equal(result.orders.length, 1, 'only 1 order matches both filters');
    assert.equal(result.orders[0].order_number, 'ORD-BOTH-1');
  } finally {
    await cleanup();
  }
});

test('listOrders with no filters returns all orders', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedOrderForUser(db, { user_id: 'user-A', order_number: 'ORD-ALL1' });
    await seedOrderForUser(db, { user_id: 'user-B', order_number: 'ORD-ALL2' });

    const result = await listOrders(db);
    assert.equal(result.orders.length, 2, 'all orders returned');
  } finally {
    await cleanup();
  }
});
