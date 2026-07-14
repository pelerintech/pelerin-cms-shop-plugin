import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { ensureLoader } from '../stubs/register.mjs';
import { createTestDb, resetDb, orders, shop_settings, buildOrderRow } from '../db/harness.ts';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { eq } from 'drizzle-orm';
import { computeEuplatescHash, buildResponseFields } from '../../src/lib/euplatesc-mac.ts';

ensureLoader();

describe('euPlatesc IPN webhook — response MAC verification', () => {
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

  it('valid response MAC succeeds (no Invalid HMAC error)', async () => {
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

    // Build IPN with correct response fields
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

    // Compute valid fp_hash using response field set
    const fields = buildResponseFields(ipnParams);
    const fpHash = computeEuplatescHash(fields, merchantKey).toUpperCase();

    const body = new URLSearchParams({ ...ipnParams, fp_hash: fpHash }).toString();

    const request = new Request('https://example.com/api/plugins/shop/webhooks/euplatesc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    const result = await handleWebhook(db, request);

    // Must succeed — order is paid
    assert.strictEqual(result.status, 'paid',
      'Valid response MAC must succeed and transition to paid');
  });

  it('tampered ep_id causes MAC verification failure', async () => {
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

    // Build IPN with correct fields, compute hash
    const ipnParams = {
      amount: '50.00',
      curr: 'RON',
      invoice_id: 'ORD-002',
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

    // Tamper with ep_id in the body (but keep the original hash)
    const body = new URLSearchParams({
      ...ipnParams,
      ep_id: 'TAMPERED', // Changed from EP123
      fp_hash: fpHash,
    }).toString();

    const request = new Request('https://example.com/api/plugins/shop/webhooks/euplatesc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    const result = await handleWebhook(db, request);

    // Must NOT transition — MAC fails
    assert.strictEqual(result.status, 'pending',
      'Tampered ep_id must cause MAC verification failure');

    const orderResult = await db.select({ status: orders.status }).from(orders).where(eq(orders.id, 'order-2')).limit(1);
    assert.strictEqual(orderResult[0].status, 'awaiting_payment',
      'Order must stay awaiting_payment when MAC fails');
  });

  it('dynamic optional fields included in MAC when present', async () => {
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

    // Build IPN with optional fields (email and rrn)
    const ipnParams = {
      amount: '50.00',
      curr: 'RON',
      invoice_id: 'ORD-003',
      ep_id: 'EP124',
      merch_id: '44841007584',
      action: '0',
      message: 'OK',
      approval: 'APPR123',
      timestamp: '20260710120000',
      nonce: 'abcdef1234567890abcdef1234567890',
      email: 'customer@example.com',
      rrn: 'RRN999',
    };

    // Compute hash with optional fields included
    const fields = buildResponseFields(ipnParams);
    const fpHash = computeEuplatescHash(fields, merchantKey).toUpperCase();

    const body = new URLSearchParams({ ...ipnParams, fp_hash: fpHash }).toString();

    const request = new Request('https://example.com/api/plugins/shop/webhooks/euplatesc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    const result = await handleWebhook(db, request);

    // Must succeed — optional fields are included in MAC
    assert.strictEqual(result.status, 'paid',
      'IPN with optional fields must succeed when MAC includes them');
  });

  it('removing optional field from IPN but keeping same hash causes MAC failure', async () => {
    const { handleWebhook } = await import('../../src/providers/payment/euplatesc.ts');

    // Seed an order in awaiting_payment
    const orderRow = buildOrderRow({
      id: 'order-4',
      order_number: 'ORD-004',
      status: 'awaiting_payment',
      total: 5000,
      currency: 'RON',
      customer_name: 'Ion Popescu',
      customer_email: 'ion@example.com',
      payment_provider: 'euplatesc',
    });
    await db.insert(orders).values(orderRow);

    // Build IPN with optional field
    const ipnParams = {
      amount: '50.00',
      curr: 'RON',
      invoice_id: 'ORD-004',
      ep_id: 'EP125',
      merch_id: '44841007584',
      action: '0',
      message: 'OK',
      approval: 'APPR123',
      timestamp: '20260710120000',
      nonce: 'abcdef1234567890abcdef1234567890',
      email: 'customer@example.com',
    };

    // Compute hash WITH email included
    const fields = buildResponseFields(ipnParams);
    const fpHash = computeEuplatescHash(fields, merchantKey).toUpperCase();

    // Send IPN WITHOUT email but keep the same hash
    const body = new URLSearchParams({
      amount: '50.00',
      curr: 'RON',
      invoice_id: 'ORD-004',
      ep_id: 'EP125',
      merch_id: '44841007584',
      action: '0',
      message: 'OK',
      approval: 'APPR123',
      timestamp: '20260710120000',
      nonce: 'abcdef1234567890abcdef1234567890',
      // email is NOT included
      fp_hash: fpHash,
    }).toString();

    const request = new Request('https://example.com/api/plugins/shop/webhooks/euplatesc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    const result = await handleWebhook(db, request);

    // Must fail — MAC was computed with email, but email is not in the body
    assert.strictEqual(result.status, 'pending',
      'Removing optional field from IPN but keeping same hash must cause MAC failure');
  });
});
