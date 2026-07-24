import { test } from 'node:test';
import assert from 'node:assert';
import { createTestDb, seedMinimal, resetDb, insertFixture, buildOrderRow } from '../db/harness.ts';
import { buildOrderEventPayload } from '../../src/lib/event-payload.ts';

test('buildOrderEventPayload - Scenario A: returns full payload shape', async () => {
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

  const payload = await buildOrderEventPayload(db, orderId, 'shop.order.confirmed');
  assert.ok(typeof payload.event === 'string', 'payload.event is a string');
  assert.equal(payload.event, 'shop.order.confirmed');
  assert.ok(typeof payload.timestamp === 'string', 'payload.timestamp is a string');
  assert.ok(payload.timestamp, 'payload.timestamp is not empty');

  // data.order contains scalar fields
  assert.ok(payload.data.order, 'payload.data.order exists');
  assert.equal(payload.data.order.id, orderId);
  assert.equal(payload.data.order.order_number, orderRow.order_number);
  assert.equal(payload.data.order.status, 'paid');
  assert.equal(payload.data.order.currency, 'RON');
  assert.equal(payload.data.order.customer_email, 'test@example.com');

  // data.billing_address
  assert.ok(payload.data.billing_address, 'payload.data.billing_address exists');
  assert.equal(payload.data.billing_address.first_name, 'Test');
  assert.equal(payload.data.billing_address.last_name, 'User');
  assert.equal(payload.data.billing_address.address, 'Addr');
  assert.equal(payload.data.billing_address.city, 'City');
  assert.equal(payload.data.billing_address.county, null);
  assert.equal(payload.data.billing_address.postal_code, '123');
  assert.equal(payload.data.billing_address.country, 'RO');
  assert.equal(payload.data.billing_address.company, null);
  assert.equal(payload.data.billing_address.vat_number, null);

  // data.shipping_address
  assert.ok(payload.data.shipping_address, 'payload.data.shipping_address exists');
  assert.equal(payload.data.shipping_address.first_name, 'Test');

  // data.items
  assert.ok(Array.isArray(payload.data.items), 'payload.data.items is an array');
  assert.equal(payload.data.items.length, 1);
  assert.equal(payload.data.items[0].product_name, 'Test Product');
  assert.equal(payload.data.items[0].sku, 'TP-001');
  assert.equal(payload.data.items[0].quantity, 2);
  assert.equal(payload.data.items[0].price_net, 2500);
  assert.equal(payload.data.items[0].vat_rate, 19);
  assert.equal(payload.data.items[0].price_gross, 2975);
  assert.equal(payload.data.items[0].currency, 'RON');

  // No status-specific enrichment for confirmed
  assert.equal(payload.data.paid_at, undefined);

  await db.$client.close();
});

test('buildOrderEventPayload - Scenario B: shop.order.paid has paid_at from status history', async () => {
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

  const payload = await buildOrderEventPayload(db, orderId, 'shop.order.paid');
  assert.ok(payload.data.paid_at, 'paid_at is present');
  assert.equal(payload.data.paid_at, paidAt.toISOString(), 'paid_at matches status history');

  await db.$client.close();
});

test('buildOrderEventPayload - Scenario C: shop.order.shipped has shipped_at from status history', async () => {
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

  const payload = await buildOrderEventPayload(db, orderId, 'shop.order.shipped');
  assert.ok(payload.data.shipped_at, 'shipped_at is present');
  assert.equal(
    payload.data.shipped_at,
    shippedAt.toISOString(),
    'shipped_at matches status history'
  );

  await db.$client.close();
});

test('buildOrderEventPayload - Scenario D: shop.order.cancelled has cancelled_at from status history', async () => {
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

  const payload = await buildOrderEventPayload(db, orderId, 'shop.order.cancelled');
  assert.ok(payload.data.cancelled_at, 'cancelled_at is present');
  assert.equal(
    payload.data.cancelled_at,
    cancelledAt.toISOString(),
    'cancelled_at matches status history'
  );

  await db.$client.close();
});

test('buildOrderEventPayload - Scenario E: shop.order.refunded has refund_amount, refund_notes, refunded_at', async () => {
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

  const payload = await buildOrderEventPayload(db, orderId, 'shop.order.refunded');
  assert.ok('refund_amount' in payload.data, 'refund_amount key is present');
  assert.equal(payload.data.refund_amount, 5250);
  assert.ok('refund_notes' in payload.data, 'refund_notes key is present');
  assert.equal(payload.data.refund_notes, 'Full refund');
  assert.ok(payload.data.refunded_at, 'refunded_at is present');
  assert.equal(
    payload.data.refunded_at,
    refundedAt.toISOString(),
    'refunded_at matches order column'
  );

  await db.$client.close();
});

test('buildOrderEventPayload - Scenario F: non-existent orderId throws', async () => {
  const { db } = await createTestDb();
  await assert.rejects(
    () => buildOrderEventPayload(db, 'non-existent-id', 'shop.order.confirmed'),
    /not found/i
  );
  await db.$client.close();
});
