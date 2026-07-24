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

test('Stripe webhook endpoint calls buildOrderEventPayload and sdk.events.publish on paid status', () => {
  // The endpoint must import buildOrderEventPayload
  assert.match(
    endpointContent,
    /import.*buildOrderEventPayload/,
    'Endpoint must import buildOrderEventPayload'
  );

  // The endpoint must call buildOrderEventPayload with order_id
  assert.match(
    endpointContent,
    /buildOrderEventPayload\s*\(\s*db\s*,\s*result\.order_id/,
    'Endpoint must call buildOrderEventPayload with db and result.order_id'
  );

  // The endpoint must call sdk.events.publish with shop.order.paid
  assert.match(
    endpointContent,
    /sdk\.events\.publish\s*\(\s*['"]shop\.order\.paid['"]/,
    'Endpoint must publish shop.order.paid event'
  );
});

test('Stripe webhook endpoint does NOT publish event on non-paid status', () => {
  // Verify the event is only published inside a status === 'paid' block
  assert.match(
    endpointContent,
    /if\s*\(\s*result\.status\s*===\s*['"]paid['"]/,
    'Event publishing must be guarded by result.status === "paid"'
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
  });

  const res = await mod.runPost({ db, sdk, ctx }, mockHandleWebhook);

  assert.strictEqual(res.status, 200, 'Response must be 200');

  // Must have published shop.order.paid
  const calls = sdk.events.publishCalls as Array<{ event: string; payload: any }>;
  assert.strictEqual(calls.length, 1, 'Exactly one event must be published');
  assert.strictEqual(calls[0].event, 'shop.order.paid', 'Event must be shop.order.paid');
  assert.ok(calls[0].payload, 'Payload must be present');
  assert.strictEqual(
    calls[0].payload.data.order.order_number,
    'STR-001',
    'Payload must contain order data'
  );

  await db.$client.close();
});
