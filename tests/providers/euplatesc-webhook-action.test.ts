import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { ensureLoader } from '../stubs/register.mjs';
import { createTestDb, resetDb, orders, shop_settings, buildOrderRow } from '../db/harness.ts';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { eq } from 'drizzle-orm';
import { computeEuplatescHash, buildResponseFields } from '../../src/lib/euplatesc-mac.ts';

ensureLoader();

describe('euPlatesc IPN webhook — action field handling', () => {
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

  it('action=0 transitions order to paid and stores transaction_id', async () => {
    const { handleWebhook } = await import('../../src/providers/payment/euplatesc.ts');

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

    // Build valid IPN POST body
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

    // Compute valid fp_hash
    const fields = buildResponseFields(ipnParams);
    const fpHash = computeEuplatescHash(fields, merchantKey).toUpperCase();

    const body = new URLSearchParams({
      ...ipnParams,
      fp_hash: fpHash,
    }).toString();

    const request = new Request('https://example.com/api/plugins/shop/webhooks/euplatesc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    const result = await handleWebhook(db, request);

    // Assert order is now paid
    const orderResult = await db
      .select({
        status: orders.status,
        transaction_id: orders.transaction_id,
      })
      .from(orders)
      .where(eq(orders.id, 'order-1'))
      .limit(1);

    assert.strictEqual(
      orderResult[0].status,
      'paid',
      'Order must transition to "paid" when action=0'
    );
    assert.strictEqual(
      orderResult[0].transaction_id,
      'EP123',
      'transaction_id must be set to ep_id'
    );
    assert.strictEqual(result.status, 'paid', 'handleWebhook must return status="paid"');
    assert.strictEqual(result.transaction_id, 'EP123', 'handleWebhook must return transaction_id');
  });

  it('action!=0 does not transition order to paid', async () => {
    const { handleWebhook } = await import('../../src/providers/payment/euplatesc.ts');

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

    // Build IPN with action=1 (failed)
    const ipnParams = {
      amount: '50.00',
      curr: 'RON',
      invoice_id: 'ORD-002',
      ep_id: 'EP124',
      merch_id: '44841007584',
      action: '1',
      message: 'Payment declined',
      approval: '',
      timestamp: '20260710120000',
      nonce: 'abcdef1234567890abcdef1234567890',
    };

    const fields = buildResponseFields(ipnParams);
    const fpHash = computeEuplatescHash(fields, merchantKey).toUpperCase();

    const body = new URLSearchParams({
      ...ipnParams,
      fp_hash: fpHash,
    }).toString();

    const request = new Request('https://example.com/api/plugins/shop/webhooks/euplatesc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    const result = await handleWebhook(db, request);

    // Assert order is NOT paid
    const orderResult = await db
      .select({
        status: orders.status,
      })
      .from(orders)
      .where(eq(orders.id, 'order-2'))
      .limit(1);

    assert.notStrictEqual(
      orderResult[0].status,
      'paid',
      'Order must NOT transition to "paid" when action!=0'
    );
  });

  it('invalid MAC does not transition order and does not throw', async () => {
    const { handleWebhook } = await import('../../src/providers/payment/euplatesc.ts');

    // Seed an order in awaiting_payment
    const orderRow = buildOrderRow({
      id: 'order-3',
      order_number: 'ORD-003',
      status: 'awaiting_payment',
      total: 5000,
      currency: 'RON',
      customer_name: 'Ion Popescu',
      customer_email: 'ion@example.com',
      payment_provider: 'euplatesc',
    });
    await db.insert(orders).values(orderRow);

    // Build IPN with tampered fp_hash
    const body = new URLSearchParams({
      amount: '50.00',
      curr: 'RON',
      invoice_id: 'ORD-003',
      ep_id: 'EP125',
      merch_id: '44841007584',
      action: '0',
      message: 'OK',
      approval: 'APPR123',
      timestamp: '20260710120000',
      nonce: 'abcdef1234567890abcdef1234567890',
      fp_hash: 'INVALIDHASH',
    }).toString();

    const request = new Request('https://example.com/api/plugins/shop/webhooks/euplatesc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    // Must NOT throw
    const result = await handleWebhook(db, request);

    // Assert order is NOT transitioned
    const orderResult = await db
      .select({
        status: orders.status,
      })
      .from(orders)
      .where(eq(orders.id, 'order-3'))
      .limit(1);

    assert.strictEqual(
      orderResult[0].status,
      'awaiting_payment',
      'Order must stay awaiting_payment when MAC is invalid'
    );
    assert.strictEqual(
      result.status,
      'pending',
      'handleWebhook must return status="pending" for invalid MAC'
    );
  });

  it('idempotent — duplicate IPN on already-paid order', async () => {
    const { handleWebhook } = await import('../../src/providers/payment/euplatesc.ts');

    // Seed an order already in paid status
    const orderRow = buildOrderRow({
      id: 'order-4',
      order_number: 'ORD-004',
      status: 'paid',
      total: 5000,
      currency: 'RON',
      customer_name: 'Ion Popescu',
      customer_email: 'ion@example.com',
      payment_provider: 'euplatesc',
      transaction_id: 'EP126',
    });
    await db.insert(orders).values(orderRow);

    // Build valid IPN
    const ipnParams = {
      amount: '50.00',
      curr: 'RON',
      invoice_id: 'ORD-004',
      ep_id: 'EP126',
      merch_id: '44841007584',
      action: '0',
      message: 'OK',
      approval: 'APPR123',
      timestamp: '20260710120000',
      nonce: 'abcdef1234567890abcdef1234567890',
    };

    const fields = buildResponseFields(ipnParams);
    const fpHash = computeEuplatescHash(fields, merchantKey).toUpperCase();

    const body = new URLSearchParams({
      ...ipnParams,
      fp_hash: fpHash,
    }).toString();

    const request = new Request('https://example.com/api/plugins/shop/webhooks/euplatesc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    // Must NOT throw
    const result = await handleWebhook(db, request);

    // Assert order stays paid
    const orderResult = await db
      .select({
        status: orders.status,
      })
      .from(orders)
      .where(eq(orders.id, 'order-4'))
      .limit(1);

    assert.strictEqual(
      orderResult[0].status,
      'paid',
      'Already-paid order must stay paid on duplicate IPN'
    );
    assert.strictEqual(
      result.status,
      'paid',
      'handleWebhook must return status="paid" for already-paid order'
    );
  });
});
