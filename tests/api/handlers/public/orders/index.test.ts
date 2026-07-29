import { test } from 'node:test';
import { ensureLoader } from '../../../../stubs/register.mjs';
import { createTestDb, seedMinimal, insertFixture } from '../../../../db/harness.ts';
import assert from 'node:assert';
import { makeFakeSdk, makeCtx, poisonDb } from '../../../helpers.ts';

ensureLoader();

const URL = 'http://localhost/api/plugins/shop/public/orders';

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
    notes: overrides.notes ?? null,
    metadata: overrides.metadata ?? null,
    created_at: now(),
    updated_at: now(),
  });
  return id;
}

async function seedOrderItem(db: any, orderId: string, overrides: Record<string, any> = {}) {
  await insertFixture(db, 'order_items', {
    id: crypto.randomUUID(),
    order_id: orderId,
    product_id: null,
    variant_id: null,
    product_name: overrides.product_name || 'Test Product',
    sku: null,
    quantity: 1,
    price_net: 1000,
    vat_rate: 0.19,
    price_gross: 1190,
    currency: 'RON',
  });
}

test('unauthenticated → 401', async () => {
  const sdk = makeFakeSdk({ user: null });
  const ctx = makeCtx({ url: URL + '?user_id=abc', method: 'GET' });

  // Dynamically import to get the handler after it's created
  const mod = await import('../../../../../src/api/shop/public/orders/index.ts');
  const res = await mod.runGet({ db: poisonDb(), sdk, ctx });
  assert.equal(res.status, 401);
  const b = await res.json();
  assert.equal(b.success, false);
  assert.equal(b.error, 'Unauthorized');
});

test('user_id mismatch → 403', async () => {
  const sdk = makeFakeSdk({ user: { id: 'my-user', email: 'me@example.com', role: 'admin' } });
  const ctx = makeCtx({ url: URL + '?user_id=other-user', method: 'GET' });

  const mod = await import('../../../../../src/api/shop/public/orders/index.ts');
  const res = await mod.runGet({ db: poisonDb(), sdk, ctx });
  assert.equal(res.status, 403);
  const b = await res.json();
  assert.equal(b.success, false);
  assert.equal(b.error, 'Forbidden');
});

test('email mismatch → 403', async () => {
  const sdk = makeFakeSdk({ user: { id: 'my-user', email: 'me@example.com', role: 'admin' } });
  const ctx = makeCtx({ url: URL + '?email=other@example.com', method: 'GET' });

  const mod = await import('../../../../../src/api/shop/public/orders/index.ts');
  const res = await mod.runGet({ db: poisonDb(), sdk, ctx });
  assert.equal(res.status, 403);
  const b = await res.json();
  assert.equal(b.success, false);
  assert.equal(b.error, 'Forbidden');
});

test('missing user_id and email → 422', async () => {
  const sdk = makeFakeSdk({ user: { id: 'my-user', email: 'me@example.com', role: 'admin' } });
  const ctx = makeCtx({ url: URL, method: 'GET' });

  const mod = await import('../../../../../src/api/shop/public/orders/index.ts');
  const res = await mod.runGet({ db: poisonDb(), sdk, ctx });
  assert.equal(res.status, 422);
  const b = await res.json();
  assert.equal(b.success, false);
  assert.ok(b.error.includes('user_id') && b.error.includes('email'));
});

test('valid request → 200 with orders including notes and metadata', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    // Seed orders for my-user
    const o1 = await seedOrderForUser(db, {
      user_id: 'my-user',
      customer_email: 'me@example.com',
      order_number: 'ORD-CON-1',
      notes: 'leave at gate',
      metadata: '{"pickup":"EasyBox 12"}',
    });
    await seedOrderItem(db, o1, { product_name: 'Widget' });

    const o2 = await seedOrderForUser(db, {
      user_id: 'my-user',
      customer_email: 'me@example.com',
      order_number: 'ORD-CON-2',
      notes: null,
      metadata: null,
    });
    await seedOrderItem(db, o2, { product_name: 'Gadget' });

    // Seed an order for a different user (should not be returned)
    const o3 = await seedOrderForUser(db, {
      user_id: 'other-user',
      customer_email: 'other@x.com',
      order_number: 'ORD-OTHER',
    });
    await seedOrderItem(db, o3, { product_name: 'Secret' });

    const sdk = makeFakeSdk({ user: { id: 'my-user', email: 'me@example.com', role: 'admin' } });
    const ctx = makeCtx({ url: URL + '?user_id=my-user', method: 'GET' });

    const mod = await import('../../../../../src/api/shop/public/orders/index.ts');
    const res = await mod.runGet({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await res.json();
    assert.equal(b.success, true);
    assert.equal(b.data.length, 2, 'user has 2 orders');

    // Check first order has notes and metadata
    const firstOrder = b.data[0];
    assert.ok(firstOrder.order, 'has order');
    assert.ok(Array.isArray(firstOrder.items), 'has items');
    assert.ok(Array.isArray(firstOrder.statusHistory), 'has statusHistory');
    // notes and metadata should be present (order 1 has notes+metadata, order 2 has null)
    const order1 = b.data.find((d: any) => d.order.order_number === 'ORD-CON-1');
    assert.ok(order1, 'ORD-CON-1 found');
    assert.equal(order1.order.notes, 'leave at gate');
    assert.equal(order1.order.metadata, '{"pickup":"EasyBox 12"}');
  } finally {
    await cleanup();
  }
});

test('valid request with no orders → 200 empty array', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);

    const sdk = makeFakeSdk({ user: { id: 'empty-user', email: 'empty@x.com', role: 'admin' } });
    const ctx = makeCtx({ url: URL + '?email=empty@x.com', method: 'GET' });

    const mod = await import('../../../../../src/api/shop/public/orders/index.ts');
    const res = await mod.runGet({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await res.json();
    assert.equal(b.success, true);
    assert.equal(b.data.length, 0, 'empty array');
  } finally {
    await cleanup();
  }
});

test('email filter returns matching orders → 200 with correct items', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    // Seed orders with different emails
    await seedOrderForUser(db, {
      user_id: 'buyer',
      customer_email: 'buyer@example.com',
      order_number: 'ORD-EMAIL-1',
      notes: 'buyer note',
      metadata: '{"source":"web"}',
    });
    await seedOrderForUser(db, {
      user_id: 'other',
      customer_email: 'other@example.com',
      order_number: 'ORD-OTHER-2',
    });
    await seedOrderForUser(db, {
      user_id: 'buyer',
      customer_email: 'buyer@example.com',
      order_number: 'ORD-EMAIL-3',
    });

    const sdk = makeFakeSdk({
      user: { id: 'buyer', email: 'buyer@example.com', role: 'customer' },
    });
    const ctx = makeCtx({ url: URL + '?email=buyer@example.com', method: 'GET' });

    const mod = await import('../../../../../src/api/shop/public/orders/index.ts');
    const res = await mod.runGet({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await res.json();
    assert.equal(b.success, true);
    assert.equal(b.data.length, 2, 'buyer has 2 orders');
    const allMatch = b.data.every((d: any) => d.order.customer_email === 'buyer@example.com');
    assert.ok(allMatch, 'all returned orders have buyer email');
    const order1 = b.data.find((d: any) => d.order.order_number === 'ORD-EMAIL-1');
    assert.ok(order1, 'ORD-EMAIL-1 found');
    assert.equal(order1.order.notes, 'buyer note');
    assert.equal(order1.order.metadata, '{"source":"web"}');
  } finally {
    await cleanup();
  }
});

test('both user_id and email filters applied together → 200', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    // Seed order matching both filters
    await seedOrderForUser(db, {
      user_id: 'target-user',
      customer_email: 'target@example.com',
      order_number: 'ORD-BOTH-1',
      notes: 'both filters',
      metadata: '{"combined":true}',
    });
    // Seed order matching user_id but not email (should not match)
    await seedOrderForUser(db, {
      user_id: 'target-user',
      customer_email: 'other@example.com',
      order_number: 'ORD-USER-ONLY',
    });
    // Seed order matching email but not user_id (should not match)
    await seedOrderForUser(db, {
      user_id: 'other-user',
      customer_email: 'target@example.com',
      order_number: 'ORD-EMAIL-ONLY',
    });

    const sdk = makeFakeSdk({
      user: { id: 'target-user', email: 'target@example.com', role: 'customer' },
    });
    const ctx = makeCtx({
      url: URL + '?user_id=target-user&email=target@example.com',
      method: 'GET',
    });

    const mod = await import('../../../../../src/api/shop/public/orders/index.ts');
    const res = await mod.runGet({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await res.json();
    assert.equal(b.success, true);
    assert.equal(b.data.length, 1, 'only 1 order matches both filters');
    assert.equal(b.data[0].order.order_number, 'ORD-BOTH-1');
    assert.equal(b.data[0].order.notes, 'both filters');
    assert.equal(b.data[0].order.metadata, '{"combined":true}');
  } finally {
    await cleanup();
  }
});

test('error-wrap → 500', async () => {
  const sdk = makeFakeSdk({ user: { id: 'my-user', email: 'me@example.com', role: 'admin' } });
  const ctx = makeCtx({ url: URL + '?user_id=my-user', method: 'GET' });

  const mod = await import('../../../../../src/api/shop/public/orders/index.ts');
  const res = await mod.runGet({ db: poisonDb(), sdk, ctx });
  assert.equal(res.status, 500);
  const b = await res.json();
  assert.equal(b.success, false);
});
