import { test } from 'node:test';
import assert from 'node:assert';
import { ensureLoader } from '../../../stubs/register.mjs';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

ensureLoader();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const endpointPath = resolve(__dirname, '../../../../src/api/shop/webhooks/stripe.ts');
const endpointContent = readFileSync(endpointPath, 'utf-8');

test('Stripe webhook endpoint calls buildOrderEventData and sdk.events.publish on paid status', () => {
  // The endpoint must import buildOrderEventData
  assert.match(
    endpointContent,
    /import.*buildOrderEventData/,
    'Endpoint must import buildOrderEventData'
  );

  // The endpoint must call buildOrderEventData with order_id
  assert.match(
    endpointContent,
    /buildOrderEventData\s*\(\s*db\s*,\s*result\.order_id/,
    'Endpoint must call buildOrderEventData with db and result.order_id'
  );

  // The endpoint must call sdk.events.publish with shop.order.paid
  assert.match(
    endpointContent,
    /sdk\.events\.publish\s*\(\s*['"]shop\.order\.paid['"]/,
    'Endpoint must publish shop.order.paid event'
  );
});

test('Stripe webhook endpoint does NOT publish event on non-paid status', () => {
  // Verify the event is only published inside a transitioned === true block
  assert.match(
    endpointContent,
    /if\s*\(\s*result\.transitioned\s*===?\s*true/,
    'Event publishing must be guarded by result.transitioned === true'
  );
});

test('Stripe webhook endpoint exports runPost and POST', async () => {
  const mod = await import('../../../../src/api/shop/webhooks/stripe.ts');
  assert.equal(typeof mod.POST, 'function', 'exports POST');
  assert.equal(typeof mod.runPost, 'function', 'exports runPost');
});

test('Stripe webhook runPost does not publish event when handleWebhook throws', async () => {
  const mod = await import('../../../../src/api/shop/webhooks/stripe.ts');
  const { createTestDb } = await import('../../../db/harness.ts');
  const { makeFakeSdk } = await import('../../helpers.ts');

  const { db } = await createTestDb();
  const sdk = makeFakeSdk({ user: null });

  const request = new Request('http://localhost/api/plugins/shop/webhooks/stripe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });

  const ctx = { request } as any;

  // handleWebhook should throw (invalid Stripe signature or payload)
  const res = await mod.runPost({ db, sdk, ctx });
  assert.ok(res.status >= 400, 'Response status should be an error');

  // No events should have been published
  const calls = sdk.events.publishCalls as Array<{ event: string; payload: any }>;
  assert.equal(calls.length, 0, 'No events should be published when handleWebhook throws');

  await db.$client.close();
});

test('Stripe webhook runPost publishes shop.order.paid when handleWebhook returns paid', async () => {
  const mod = await import('../../../../src/api/shop/webhooks/stripe.ts');
  const { createTestDb, resetDb, orders, buildOrderRow } = await import('../../../db/harness.ts');
  const { makeFakeSdk } = await import('../../helpers.ts');

  const { db } = await createTestDb();
  await resetDb(db);

  // Seed an order in awaiting_payment
  await db.insert(orders).values(
    buildOrderRow({
      id: 'stripe-order-1',
      order_number: 'STR-001',
      status: 'awaiting_payment',
      total: 5000,
      currency: 'RON',
      customer_name: 'Test User',
      customer_email: 'test@example.com',
      payment_provider: 'stripe',
    })
  );

  const sdk = makeFakeSdk();
  const request = new Request('http://localhost/api/plugins/shop/webhooks/stripe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const ctx = { request } as any;

  // Mock handleWebhook to return paid status
  const mockHandleWebhook = async (_db: any, _req: any) => ({
    status: 'paid' as const,
    order_id: 'stripe-order-1',
    transaction_id: 'txn-1',
    transitioned: true,
  });

  const res = await mod.runPost({ db, sdk, ctx }, mockHandleWebhook);

  assert.strictEqual(res.status, 200, 'Response must be 200');

  // Must have published shop.order.paid
  const calls = sdk.events.publishCalls as Array<{ event: string; payload: any }>;
  assert.strictEqual(calls.length, 1, 'Exactly one event must be published');
  assert.strictEqual(calls[0].event, 'shop.order.paid', 'Event must be shop.order.paid');
  assert.ok(calls[0].payload, 'Payload must be present');
  assert.ok(!('event' in calls[0].payload), 'payload is data, not an envelope');
  assert.ok(!('data' in calls[0].payload), 'payload has no nested data key');
  assert.strictEqual(
    calls[0].payload.order.order_number,
    'STR-001',
    'Payload must contain order data'
  );

  await db.$client.close();
});

import { createTestDb, resetDb, orders, buildOrderRow } from '../../../db/harness.ts';
import { eq } from 'drizzle-orm';

test('applyStripeCheckoutPaid: matching amount + awaiting_payment → paid (transitioned=true)', async () => {
  const { db } = await createTestDb();
  await resetDb(db);
  await db.insert(orders).values(
    buildOrderRow({
      id: 'st-1',
      order_number: 'STR-101',
      status: 'awaiting_payment',
      total: 5000,
      currency: 'RON',
      customer_name: 'A',
      customer_email: 'a@x.com',
      payment_provider: 'stripe',
    })
  );
  const { applyStripeCheckoutPaid } = await import('../../../../src/providers/payment/stripe.ts');
  const res = await applyStripeCheckoutPaid(db, 'st-1', {
    amount_total: 5000,
    id: 'cs_1',
    payment_intent: 'pi_1',
  });
  assert.strictEqual(res.status, 'paid');
  assert.strictEqual(res.transitioned, true);
  await db.$client.close();
});

test('applyStripeCheckoutPaid: amount mismatch → no transition (transitioned=false)', async () => {
  const { db } = await createTestDb();
  await resetDb(db);
  await db.insert(orders).values(
    buildOrderRow({
      id: 'st-2',
      order_number: 'STR-102',
      status: 'awaiting_payment',
      total: 5000,
      currency: 'RON',
      customer_name: 'A',
      customer_email: 'a@x.com',
      payment_provider: 'stripe',
    })
  );
  const { applyStripeCheckoutPaid } = await import('../../../../src/providers/payment/stripe.ts');
  const res = await applyStripeCheckoutPaid(db, 'st-2', {
    amount_total: 10000,
    id: 'cs_2',
    payment_intent: 'pi_2',
  });
  assert.strictEqual(res.transitioned, false);
  const [row] = await db.select().from(orders).where(eq(orders.id, 'st-2'));
  assert.strictEqual(row.status, 'awaiting_payment', 'must NOT mark paid on amount mismatch');
  await db.$client.close();
});

test('applyStripeCheckoutPaid: shipped recall → no downgrade (transitioned=false)', async () => {
  const { db } = await createTestDb();
  await resetDb(db);
  await db.insert(orders).values(
    buildOrderRow({
      id: 'st-3',
      order_number: 'STR-103',
      status: 'shipped',
      total: 5000,
      currency: 'RON',
      customer_name: 'A',
      customer_email: 'a@x.com',
      payment_provider: 'stripe',
    })
  );
  const { applyStripeCheckoutPaid } = await import('../../../../src/providers/payment/stripe.ts');
  const res = await applyStripeCheckoutPaid(db, 'st-3', {
    amount_total: 5000,
    id: 'cs_3',
    payment_intent: 'pi_3',
  });
  assert.strictEqual(res.transitioned, false);
  const [row] = await db.select().from(orders).where(eq(orders.id, 'st-3'));
  assert.strictEqual(row.status, 'shipped', 'must NOT reset a shipped order to paid');
  await db.$client.close();
});

test('applyStripePaymentFailed: paid order is NOT downgraded to awaiting_payment (r41 S6)', async () => {
  const { db } = await createTestDb();
  await resetDb(db);
  await db.insert(orders).values(
    buildOrderRow({
      id: 'sf-1',
      order_number: 'STR-SF1',
      status: 'paid',
      total: 5000,
      currency: 'RON',
      customer_name: 'A',
      customer_email: 'a@x.com',
      payment_provider: 'stripe',
    })
  );
  const { applyStripePaymentFailed } = await import('../../../../src/providers/payment/stripe.ts');
  await applyStripePaymentFailed(db, 'sf-1', { last_payment_error: { message: 'declined' } });
  const [row] = await db.select().from(orders).where(eq(orders.id, 'sf-1'));
  assert.strictEqual(row.status, 'paid', 'payment_failed must NOT downgrade a paid order');
  await db.$client.close();
});

test('applyStripePaymentFailed: shipped order is NOT downgraded to awaiting_payment (r41 S6)', async () => {
  const { db } = await createTestDb();
  await resetDb(db);
  await db.insert(orders).values(
    buildOrderRow({
      id: 'sf-2',
      order_number: 'STR-SF2',
      status: 'shipped',
      total: 5000,
      currency: 'RON',
      customer_name: 'A',
      customer_email: 'a@x.com',
      payment_provider: 'stripe',
    })
  );
  const { applyStripePaymentFailed } = await import('../../../../src/providers/payment/stripe.ts');
  await applyStripePaymentFailed(db, 'sf-2', { last_payment_error: { message: 'declined' } });
  const [row] = await db.select().from(orders).where(eq(orders.id, 'sf-2'));
  assert.strictEqual(row.status, 'shipped', 'payment_failed must NOT downgrade a shipped order');
  await db.$client.close();
});

test('applyStripePaymentFailed: awaiting_payment returns to awaiting_payment (can retry)', async () => {
  const { db } = await createTestDb();
  await resetDb(db);
  await db.insert(orders).values(
    buildOrderRow({
      id: 'sf-3',
      order_number: 'STR-SF3',
      status: 'awaiting_payment',
      total: 5000,
      currency: 'RON',
      customer_name: 'A',
      customer_email: 'a@x.com',
      payment_provider: 'stripe',
    })
  );
  const { applyStripePaymentFailed } = await import('../../../../src/providers/payment/stripe.ts');
  const res = await applyStripePaymentFailed(db, 'sf-3', {
    last_payment_error: { message: 'declined' },
  });
  assert.strictEqual(res.status, 'failed');
  await db.$client.close();
});

test('Stripe webhook runPost does NOT publish when handleWebhook reports transitioned=false', async () => {
  const mod = await import('../../../../src/api/shop/webhooks/stripe.ts');
  const { createTestDb, resetDb, orders, buildOrderRow } = await import('../../../db/harness.ts');
  const { makeFakeSdk } = await import('../../helpers.ts');

  const { db } = await createTestDb();
  await resetDb(db);
  await db.insert(orders).values(
    buildOrderRow({
      id: 'stripe-noevent',
      order_number: 'STR-NOE',
      status: 'paid',
      total: 5000,
      currency: 'RON',
      customer_name: 'A',
      customer_email: 'a@x.com',
      payment_provider: 'stripe',
    })
  );
  const sdk = makeFakeSdk();
  const request = new Request('http://localhost/api/plugins/shop/webhooks/stripe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const ctx = { request } as any;
  const mockHandleWebhook = async (_db: any, _req: any) => ({
    status: 'paid' as const,
    order_id: 'stripe-noevent',
    transaction_id: 'txn-2',
    transitioned: false,
  });
  const res = await mod.runPost({ db, sdk, ctx }, mockHandleWebhook);
  assert.strictEqual(res.status, 200);
  const calls = sdk.events.publishCalls as Array<{ event: string }>;
  assert.strictEqual(calls.length, 0, 'must NOT publish on a non-transition recall');
  await db.$client.close();
});
