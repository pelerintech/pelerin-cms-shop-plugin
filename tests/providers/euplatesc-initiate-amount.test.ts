import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { ensureLoader } from '../stubs/register.mjs';
import { createTestDb, resetDb, orders, shop_settings, buildOrderRow } from '../db/harness.ts';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';

ensureLoader();

describe('euPlatesc initiate payment — amount conversion', () => {
  let db: LibSQLDatabase;

  before(async () => {
    const harness = await createTestDb();
    db = harness.db;
    await resetDb(db);

    // Seed euPlatesc credentials
    await db.insert(shop_settings).values([
      { id: 's1', key: 'euplatesc_merchant_id', value: '44841007584' },
      { id: 's2', key: 'euplatesc_secret_key', value: 'AA4A81EE58A1D74DE6E02DF2C1CE9982780F95DC' },
    ]);

    // Seed a pending order with total = 5000 bani (50.00 RON)
    const orderRow = buildOrderRow({
      id: 'order-1',
      order_number: 'ORD-001',
      status: 'pending',
      total: 5000,
      currency: 'RON',
      customer_name: 'Ion Popescu',
      customer_email: 'ion@example.com',
    });
    await db.insert(orders).values(orderRow);
  });

  it('converts bani to RON (divides by 100) in redirect URL', async () => {
    const { initiatePayment } = await import('../../src/providers/payment/euplatesc.ts');

    const result = await initiatePayment(db, {
      id: 'order-1',
      order_number: 'ORD-001',
      currency: 'RON',
      total: 5000, // 50.00 RON in bani
      customer_email: 'ion@example.com',
      customer_name: 'Ion Popescu',
      status: 'pending',
    }, {
      success_url: 'https://example.com/success',
      cancel_url: 'https://example.com/cancel',
      currency: 'RON',
      webhook_url: 'https://example.com/api/plugins/shop/webhooks/euplatesc',
    });

    assert.ok(result.redirect_url, 'Should return redirect_url');

    // Parse the redirect URL to extract query params
    const url = new URL(result.redirect_url);
    const params = new URLSearchParams(url.search);

    // Amount should be "50.00" (RON), NOT "5000.00" (bani)
    assert.strictEqual(params.get('amount'), '50.00',
      'Amount must be in major units (RON), not minor units (bani). Expected 50.00, got ' + params.get('amount'));
  });

  it('handles 1 RON (100 bani) correctly', async () => {
    const { initiatePayment } = await import('../../src/providers/payment/euplatesc.ts');

    // Seed another order with 1 RON
    const orderRow = buildOrderRow({
      id: 'order-2',
      order_number: 'ORD-002',
      status: 'pending',
      total: 100, // 1.00 RON in bani
      currency: 'RON',
      customer_name: 'Test User',
      customer_email: 'test@example.com',
    });
    await db.insert(orders).values(orderRow);

    const result = await initiatePayment(db, {
      id: 'order-2',
      order_number: 'ORD-002',
      currency: 'RON',
      total: 100,
      customer_email: 'test@example.com',
      customer_name: 'Test User',
      status: 'pending',
    }, {
      success_url: 'https://example.com/success',
      cancel_url: 'https://example.com/cancel',
      currency: 'RON',
      webhook_url: 'https://example.com/api/plugins/shop/webhooks/euplatesc',
    });

    const url = new URL(result.redirect_url);
    const params = new URLSearchParams(url.search);

    assert.strictEqual(params.get('amount'), '1.00',
      '100 bani should produce amount=1.00');
  });
});
