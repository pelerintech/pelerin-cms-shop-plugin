import { test } from 'node:test';
import assert from 'node:assert';
import { createTestDb, seedMinimal, resetDb, insertFixture, buildOrderRow } from '../db/harness.ts';
import { buildOrderEventData } from '../../src/lib/event-payload.ts';

test('buildOrderEventData - Scenario A: returns the order data (not the envelope)', async () => {
  const { db } = await createTestDb();
  const f = await seedMinimal(db);

  // Create an order with items
  const orderId = 'order-1';
  const orderRow = buildOrderRow({ id: orderId, status: 'paid' });
  await insertFixture(db, 'orders', orderRow);
  await insertFixture(db, 'order_items', {
    id: 'oi-1',
    order_id: orderId,
    product_id: f.simpleProductId,
    variant_id: null,
    product_name: 'Test Product',
    sku: 'TP-001',
    quantity: 2,
    price_net: 2500,
    vat_rate: 19,
    price_gross: 2975,
    currency: 'RON',
  });

  const payload = await buildOrderEventData(db, orderId, 'shop.order.confirmed');

  // The builder returns the DATA object, not the bus envelope.
  assert.ok(!('event' in payload), 'no event key (bus supplies it)');
  assert.ok(!('timestamp' in payload), 'no timestamp key (bus supplies it)');

  // data.order contains scalar fields
  assert.ok(payload.order, 'payload.order exists');
  assert.equal(payload.order.id, orderId);
  assert.equal(payload.order.order_number, orderRow.order_number);
  assert.equal(payload.order.status, 'paid');
  assert.equal(payload.order.currency, 'RON');
  assert.equal(payload.order.customer_email, 'test@example.com');

  // data.billing_address
  assert.ok(payload.billing_address, 'payload.billing_address exists');
  assert.equal(payload.billing_address.first_name, 'Test');
  assert.equal(payload.billing_address.last_name, 'User');
  assert.equal(payload.billing_address.address, 'Addr');
  assert.equal(payload.billing_address.city, 'City');
  assert.equal(payload.billing_address.county, null);
  assert.equal(payload.billing_address.postal_code, '123');
  assert.equal(payload.billing_address.country, 'RO');
  assert.equal(payload.billing_address.company, null);
  assert.equal(payload.billing_address.vat_number, null);

  // data.shipping_address
  assert.ok(payload.shipping_address, 'payload.shipping_address exists');
  assert.equal(payload.shipping_address.first_name, 'Test');

  // data.items
  assert.ok(Array.isArray(payload.items), 'payload.items is an array');
  assert.equal(payload.items.length, 1);
  assert.equal(payload.items[0].product_name, 'Test Product');
  assert.equal(payload.items[0].sku, 'TP-001');
  assert.equal(payload.items[0].slug, 'carte-programare', 'item slug resolves from the product');
  assert.equal(payload.items[0].quantity, 2);
  assert.equal(payload.items[0].price_net, 2500);
  assert.equal(payload.items[0].vat_rate, 19);
  assert.equal(payload.items[0].price_gross, 2975);
  assert.equal(payload.items[0].currency, 'RON');

  // No status-specific enrichment for confirmed
  assert.equal(payload.paid_at, undefined);

  await db.$client.close();
});

test('buildOrderEventData - Scenario B: shop.order.paid has paid_at from status history', async () => {
  const { db } = await createTestDb();
  const orderId = 'order-paid';
  const paidAt = new Date('2026-07-24T10:00:00Z');
  await insertFixture(db, 'orders', buildOrderRow({ id: orderId, status: 'paid' }));
  // paid_at is derived from order_status_history: the transition to 'paid'
  await insertFixture(db, 'order_status_history', {
    id: 'osh-paid',
    order_id: orderId,
    from_status: 'pending',
    to_status: 'paid',
    note: null,
    changed_by: 'test',
    created_at: paidAt,
  });

  const payload = await buildOrderEventData(db, orderId, 'shop.order.paid');
  assert.ok(payload.paid_at, 'paid_at is present');
  assert.equal(payload.paid_at, paidAt.toISOString(), 'paid_at matches status history');

  await db.$client.close();
});

test('buildOrderEventData - Scenario C: shop.order.shipped has shipped_at from status history', async () => {
  const { db } = await createTestDb();
  const orderId = 'order-shipped';
  const shippedAt = new Date('2026-07-24T12:00:00Z');
  await insertFixture(db, 'orders', buildOrderRow({ id: orderId, status: 'shipped' }));
  await insertFixture(db, 'order_status_history', {
    id: 'osh-shipped',
    order_id: orderId,
    from_status: 'paid',
    to_status: 'shipped',
    note: null,
    changed_by: 'test',
    created_at: shippedAt,
  });

  const payload = await buildOrderEventData(db, orderId, 'shop.order.shipped');
  assert.ok(payload.shipped_at, 'shipped_at is present');
  assert.equal(payload.shipped_at, shippedAt.toISOString(), 'shipped_at matches status history');

  await db.$client.close();
});

test('buildOrderEventData - Scenario D: shop.order.cancelled has cancelled_at from status history', async () => {
  const { db } = await createTestDb();
  const orderId = 'order-cancelled';
  const cancelledAt = new Date('2026-07-24T14:00:00Z');
  await insertFixture(db, 'orders', buildOrderRow({ id: orderId, status: 'cancelled' }));
  await insertFixture(db, 'order_status_history', {
    id: 'osh-cancelled',
    order_id: orderId,
    from_status: 'pending',
    to_status: 'cancelled',
    note: null,
    changed_by: 'test',
    created_at: cancelledAt,
  });

  const payload = await buildOrderEventData(db, orderId, 'shop.order.cancelled');
  assert.ok(payload.cancelled_at, 'cancelled_at is present');
  assert.equal(
    payload.cancelled_at,
    cancelledAt.toISOString(),
    'cancelled_at matches status history'
  );

  await db.$client.close();
});

test('buildOrderEventData - Scenario E: shop.order.refunded has refund_amount, refund_notes, refunded_at', async () => {
  const { db } = await createTestDb();
  const orderId = 'order-refunded';
  const refundedAt = new Date('2026-07-24T16:00:00Z');
  await insertFixture(
    db,
    'orders',
    buildOrderRow({
      id: orderId,
      status: 'refunded',
      refund_amount: 5250,
      refund_notes: 'Full refund',
      refunded_at: refundedAt,
    })
  );

  const payload = await buildOrderEventData(db, orderId, 'shop.order.refunded');
  assert.ok('refund_amount' in payload, 'refund_amount key is present');
  assert.equal(payload.refund_amount, 5250);
  assert.ok('refund_notes' in payload, 'refund_notes key is present');
  assert.equal(payload.refund_notes, 'Full refund');
  assert.ok(payload.refunded_at, 'refunded_at is present');
  assert.equal(payload.refunded_at, refundedAt.toISOString(), 'refunded_at matches order column');

  await db.$client.close();
});

test('buildOrderEventData - Scenario G: user_id and parsed metadata included when set', async () => {
  const { db } = await createTestDb();
  const orderId = 'order-user-meta';
  await insertFixture(
    db,
    'orders',
    buildOrderRow({
      id: orderId,
      user_id: 'user-123',
      metadata: '{"pickup_point":"Bucharest East"}',
    })
  );

  const payload = await buildOrderEventData(db, orderId, 'shop.order.confirmed');
  assert.equal(payload.order.user_id, 'user-123', 'user_id is carried through');
  assert.deepEqual(
    payload.order.metadata,
    { pickup_point: 'Bucharest East' },
    'metadata is parsed into an object, not a JSON string'
  );

  await db.$client.close();
});

test('buildOrderEventData - Scenario M: pickup_location metadata parses into an object', async () => {
  const { db } = await createTestDb();
  const orderId = 'order-pickup';
  await insertFixture(
    db,
    'orders',
    buildOrderRow({
      id: orderId,
      metadata: JSON.stringify({
        pickup_location: {
          collectionItemId: 'loc-1',
          name: 'Sediu',
          address: '1 Main St',
          city: 'Cluj',
        },
      }),
    })
  );

  const payload = await buildOrderEventData(db, orderId, 'shop.order.confirmed');
  assert.equal(payload.order.metadata.pickup_location.name, 'Sediu');
  assert.equal(payload.order.metadata.pickup_location.collectionItemId, 'loc-1');

  await db.$client.close();
});

test('buildOrderEventData - Scenario N: malformed metadata yields null without throwing', async () => {
  const { db } = await createTestDb();
  const orderId = 'order-malformed';
  await insertFixture(
    db,
    'orders',
    buildOrderRow({
      id: orderId,
      metadata: 'not-json',
    })
  );

  const payload = await buildOrderEventData(db, orderId, 'shop.order.confirmed');
  assert.equal(payload.order.metadata, null, 'malformed metadata should be null, not throw');

  await db.$client.close();
});

test('buildOrderEventData - Scenario O: non-pickup metadata parses generically', async () => {
  const { db } = await createTestDb();
  const orderId = 'order-other-meta';
  await insertFixture(
    db,
    'orders',
    buildOrderRow({
      id: orderId,
      metadata: JSON.stringify({ anything: { a: 1 } }),
    })
  );

  const payload = await buildOrderEventData(db, orderId, 'shop.order.confirmed');
  assert.deepEqual(payload.order.metadata, { anything: { a: 1 } });

  await db.$client.close();
});

test('buildOrderEventData - Scenario H: user_id and metadata are null when absent', async () => {
  const { db } = await createTestDb();
  const orderId = 'order-no-user';
  await insertFixture(db, 'orders', buildOrderRow({ id: orderId }));

  const payload = await buildOrderEventData(db, orderId, 'shop.order.confirmed');
  assert.equal(payload.order.user_id, null, 'user_id is null for guest order');
  assert.equal(payload.order.metadata, null, 'metadata is null when absent');

  await db.$client.close();
});

test('buildOrderEventData - Scenario F: non-existent orderId throws', async () => {
  const { db } = await createTestDb();
  await assert.rejects(
    () => buildOrderEventData(db, 'non-existent-id', 'shop.order.confirmed'),
    /not found/i
  );
  await db.$client.close();
});
