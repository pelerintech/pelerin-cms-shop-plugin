import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { ensureLoader } from '../../../stubs/register.mjs';
import {
  createTestDb,
  resetDb,
  orders,
  shop_settings,
  buildOrderRow,
} from '../../../db/harness.ts';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { eq } from 'drizzle-orm';
import { computeEuplatescHash, buildResponseFields } from '../../../../src/lib/euplatesc-mac.ts';
import type { APIContext } from 'astro';
import { fileURLToPath } from 'node:url';

ensureLoader();

describe('euPlatesc webhook endpoint — response format', () => {
  let db: LibSQLDatabase;
  const merchantKey = 'AA4A81EE58A1D74DE6E02DF2C1CE9982780F95DC';

  before(async () => {
    const harness = await createTestDb();
    db = harness.db;
    await resetDb(db);

    // Seed euPlatesc credentials
    await db.insert(shop_settings).values([
      { id: 's1', key: 'euplatesc_merchant_id', value: '44841007584' },
      { id: 's2', key: 'euplatesc_secret_key', value: merchantKey },
    ]);
  });

  it('returns plain text OK with 200 on valid IPN', async () => {
    const { handleWebhook } = await import('../../../../src/providers/payment/euplatesc.ts');

    // Seed an order in awaiting_payment
    const orderRow = buildOrderRow({
      id: 'order-1',
      order_number: 'ORD-001',
      status: 'awaiting_payment',
      total: 5000,
      currency: 'RON',
      customer_name: 'Ion Popescu',
      customer_email: 'ion@example.com',
      payment_provider: 'euplatesc',
    });
    await db.insert(orders).values(orderRow);

    // Build valid IPN
    const ipnParams = {
      amount: '50.00',
      curr: 'RON',
      invoice_id: 'ORD-001',
      ep_id: 'EP123',
      merch_id: '44841007584',
      action: '0',
      message: 'OK',
      approval: 'APPR123',
      timestamp: '20260710120000',
      nonce: 'abcdef1234567890abcdef1234567890',
    };

    const fields = buildResponseFields(ipnParams);
    const fpHash = computeEuplatescHash(fields, merchantKey).toUpperCase();

    const body = new URLSearchParams({ ...ipnParams, fp_hash: fpHash }).toString();

    const request = new Request('https://example.com/api/plugins/shop/webhooks/euplatesc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    // Simulate the endpoint's behavior
    const result = await handleWebhook(db, request);

    // The endpoint should return plain "OK" text — verify handleWebhook returns expected result
    assert.strictEqual(result.status, 'paid', 'handleWebhook must return paid status');

    // The endpoint response body must be exactly "OK"
    // We verify by reading the source of the endpoint file
    const { readFileSync } = await import('node:fs');
    const { resolve, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const endpointPath = resolve(__dirname, '../../../../src/api/shop/webhooks/euplatesc.ts');

    const content = readFileSync(endpointPath, 'utf-8');

    // Must NOT contain XML response format
    assert.ok(!content.includes('<EPAYMENT>'), 'Endpoint must NOT return <EPAYMENT> XML format');

    // Must contain plain text OK response
    assert.match(
      content,
      /Response\s*\(\s*['"]OK['"]/,
      'Endpoint must return plain text OK response'
    );

    // Must NOT return JSON on success
    assert.ok(!content.includes('JSON.stringify'), 'Endpoint must NOT return JSON response');
  });

  it('returns OK with 200 on invalid MAC (does not cause retries)', async () => {
    const { handleWebhook } = await import('../../../../src/providers/payment/euplatesc.ts');

    // Seed an order in awaiting_payment
    const orderRow = buildOrderRow({
      id: 'order-2',
      order_number: 'ORD-002',
      status: 'awaiting_payment',
      total: 5000,
      currency: 'RON',
      customer_name: 'Ion Popescu',
      customer_email: 'ion@example.com',
      payment_provider: 'euplatesc',
    });
    await db.insert(orders).values(orderRow);

    // Build IPN with invalid hash
    const body = new URLSearchParams({
      amount: '50.00',
      curr: 'RON',
      invoice_id: 'ORD-002',
      ep_id: 'EP124',
      merch_id: '44841007584',
      action: '0',
      message: 'OK',
      approval: 'APPR123',
      timestamp: '20260710120000',
      nonce: 'abcdef1234567890abcdef1234567890',
      fp_hash: 'INVALID',
    }).toString();

    const request = new Request('https://example.com/api/plugins/shop/webhooks/euplatesc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    // Must NOT throw
    const result = await handleWebhook(db, request);
    assert.strictEqual(
      result.status,
      'pending',
      'handleWebhook must return pending for invalid MAC (not throw)'
    );

    // Verify the endpoint doesn't return non-200 on errors
    const { readFileSync } = await import('node:fs');
    const { resolve, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const endpointPath = resolve(__dirname, '../../../../src/api/shop/webhooks/euplatesc.ts');
    const content = readFileSync(endpointPath, 'utf-8');

    // Must NOT return 400 or 500 status codes
    assert.ok(
      !content.includes('status: 400') &&
        !content.includes('status: 500') &&
        !content.includes('status:400') &&
        !content.includes('status:500'),
      'Endpoint must NOT return 400/500 status codes (causes euPlatesc retries)'
    );
  });
});

describe('euPlatesc webhook — event publishing', () => {
  it('source contains buildOrderEventPayload and sdk.events.publish', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve, dirname } = await import('node:path');

    const currentFile = fileURLToPath(import.meta.url);
    const currentDir = dirname(currentFile);
    const endpointPath = resolve(currentDir, '../../../../src/api/shop/webhooks/euplatesc.ts');
    const content = readFileSync(endpointPath, 'utf-8');

    assert.match(
      content,
      /import.*buildOrderEventPayload/,
      'Endpoint must import buildOrderEventPayload'
    );

    assert.match(
      content,
      /buildOrderEventPayload\s*\(\s*db\s*,\s*result\.order_id/,
      'Endpoint must call buildOrderEventPayload with db and result.order_id'
    );

    assert.match(
      content,
      /sdk\.events\.publish\s*\(\s*['"]shop\.order\.paid['"]/,
      'Endpoint must publish shop.order.paid event'
    );

    assert.match(
      content,
      /if\s*\(\s*result\.status\s*===\s*['"]paid['"]/,
      'Event publishing must be guarded by result.status === "paid"'
    );
  });

  it('exports runPost and POST functions', async () => {
    const mod = await import('../../../../src/api/shop/webhooks/euplatesc.ts');
    assert.equal(typeof mod.POST, 'function', 'exports POST');
    assert.equal(typeof mod.runPost, 'function', 'exports runPost');
  });

  it('runPost with valid IPN publishes shop.order.paid event', async () => {
    const harness = await createTestDb();
    const testDb = harness.db;
    await resetDb(testDb);

    // Seed euPlatesc credentials
    const testMerchantKey = 'AA4A81EE58A1D74DE6E02DF2C1CE9982780F95DC';
    await testDb.insert(shop_settings).values([
      { id: 's-evt-1', key: 'euplatesc_merchant_id', value: '44841007584' },
      { id: 's-evt-2', key: 'euplatesc_secret_key', value: testMerchantKey },
    ]);

    // Seed an order in awaiting_payment
    await testDb.insert(orders).values(
      buildOrderRow({
        id: 'order-evt-1',
        order_number: 'ORD-EVT-001',
        status: 'awaiting_payment',
        total: 5000,
        currency: 'RON',
        customer_name: 'Test User',
        customer_email: 'test@example.com',
        payment_provider: 'euplatesc',
      })
    );

    // Build valid IPN
    const ipnParams = {
      amount: '50.00',
      curr: 'RON',
      invoice_id: 'ORD-EVT-001',
      ep_id: 'EP-EVT-1',
      merch_id: '44841007584',
      action: '0',
      message: 'OK',
      approval: 'APPR-EVT-1',
      timestamp: '20260710120000',
      nonce: 'abcdef1234567890abcdef1234567890',
    };

    const fields = buildResponseFields(ipnParams);
    const fpHash = computeEuplatescHash(fields, testMerchantKey).toUpperCase();

    const body = new URLSearchParams({ ...ipnParams, fp_hash: fpHash }).toString();

    const request = new Request('https://example.com/api/plugins/shop/webhooks/euplatesc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    const { makeFakeSdk } = await import('../../helpers.ts');
    const sdk = makeFakeSdk();
    const ctx = { request } as any;

    const mod = await import('../../../../src/api/shop/webhooks/euplatesc.ts');
    const res = await mod.runPost({ db: testDb, sdk, ctx });

    // Must return 200 OK
    assert.strictEqual(res.status, 200, 'Response must be 200');

    // Must have published shop.order.paid with valid payload
    const calls = sdk.events.publishCalls as Array<{ event: string; payload: any }>;
    assert.strictEqual(calls.length, 1, 'Exactly one event must be published');
    assert.strictEqual(calls[0].event, 'shop.order.paid', 'Event must be shop.order.paid');
    assert.ok(calls[0].payload, 'Payload must be present');
    assert.strictEqual(
      calls[0].payload.data.order.order_number,
      'ORD-EVT-001',
      'Payload must contain order data'
    );

    await testDb.$client.close();
  });
});
