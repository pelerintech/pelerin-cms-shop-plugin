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
  const ctx = makeCtx({ url: URL + '/some-id', method: 'GET', params: { id: 'some-id' } });

  const mod = await import('../../../../../src/api/shop/public/orders/[id].ts');
  const res = await mod.runGet({ db: poisonDb(), sdk, ctx });
  assert.equal(res.status, 401);
  const b = await res.json();
  assert.equal(b.success, false);
  assert.equal(b.error, 'Unauthorized');
});

test('order does not exist → 404', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const sdk = makeFakeSdk({ user: { id: 'my-user', email: 'me@example.com', role: 'customer' } });
    const ctx = makeCtx({
      url: URL + '/nonexistent-id',
      method: 'GET',
      params: { id: 'nonexistent-id' },
    });

    const mod = await import('../../../../../src/api/shop/public/orders/[id].ts');
    const res = await mod.runGet({ db, sdk, ctx });
    assert.equal(res.status, 404);
    const b = await res.json();
    assert.equal(b.success, false);
    assert.equal(b.error, 'Order not found');
  } finally {
    await cleanup();
  }
});

test('order owned by user_id → 200 with correct shape', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const orderId = await seedOrderForUser(db, {
      user_id: 'my-user',
      customer_email: 'me@example.com',
      order_number: 'ORD-MINE',
      notes: 'leave at gate',
      metadata: '{"pickup":"EasyBox 12"}',
    });
    await seedOrderItem(db, orderId, { product_name: 'Widget' });

    const sdk = makeFakeSdk({ user: { id: 'my-user', email: 'me@example.com', role: 'customer' } });
    const ctx = makeCtx({ url: URL + '/' + orderId, method: 'GET', params: { id: orderId } });

    const mod = await import('../../../../../src/api/shop/public/orders/[id].ts');
    const res = await mod.runGet({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await res.json();
    assert.equal(b.success, true);
    const data = b.data;
    assert.equal(typeof data, 'object');
    assert.ok(data.order, 'has order');
    assert.ok(Array.isArray(data.items), 'items is array');
    assert.ok(Array.isArray(data.statusHistory), 'statusHistory is array');
    assert.equal(data.order.order_number, 'ORD-MINE');
    assert.equal(data.order.notes, 'leave at gate');
    assert.equal(data.order.metadata, '{"pickup":"EasyBox 12"}');
  } finally {
    await cleanup();
  }
});

test('guest order owned by matching email → 200', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const orderId = await seedOrderForUser(db, {
      user_id: null,
      customer_email: 'me@example.com',
      order_number: 'ORD-GUEST',
    });
    await seedOrderItem(db, orderId, { product_name: 'Guest' });

    const sdk = makeFakeSdk({ user: { id: 'my-user', email: 'me@example.com', role: 'customer' } });
    const ctx = makeCtx({ url: URL + '/' + orderId, method: 'GET', params: { id: orderId } });

    const mod = await import('../../../../../src/api/shop/public/orders/[id].ts');
    const res = await mod.runGet({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await res.json();
    assert.equal(b.success, true);
    assert.equal(b.data.order.order_number, 'ORD-GUEST');
  } finally {
    await cleanup();
  }
});

test('order owned by another user → 404', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const orderId = await seedOrderForUser(db, {
      user_id: 'other-user',
      customer_email: 'other@x.com',
      order_number: 'ORD-OTHER',
    });
    await seedOrderItem(db, orderId, { product_name: 'Secret' });

    const sdk = makeFakeSdk({ user: { id: 'my-user', email: 'me@example.com', role: 'customer' } });
    const ctx = makeCtx({ url: URL + '/' + orderId, method: 'GET', params: { id: orderId } });

    const mod = await import('../../../../../src/api/shop/public/orders/[id].ts');
    const res = await mod.runGet({ db, sdk, ctx });
    assert.equal(res.status, 404);
    const b = await res.json();
    assert.equal(b.success, false);
    assert.equal(b.error, 'Order not found');
  } finally {
    await cleanup();
  }
});

test('error-wrap → 500', async () => {
  const sdk = makeFakeSdk({ user: { id: 'my-user', email: 'me@example.com', role: 'customer' } });
  const ctx = makeCtx({ url: URL + '/some-id', method: 'GET', params: { id: 'some-id' } });

  const mod = await import('../../../../../src/api/shop/public/orders/[id].ts');
  const res = await mod.runGet({ db: poisonDb(), sdk, ctx });
  assert.equal(res.status, 500);
  const b = await res.json();
  assert.equal(b.success, false);
});
