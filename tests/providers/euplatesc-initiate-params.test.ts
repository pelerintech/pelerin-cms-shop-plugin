import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { ensureLoader } from '../stubs/register.mjs';
import { createTestDb, resetDb, orders, shop_settings, buildOrderRow } from '../db/harness.ts';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';

ensureLoader();

describe('euPlatesc initiate payment — request parameters', () => {
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

    // Seed a pending order
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

  it('does NOT send spurious mid param', async () => {
    const { initiatePayment } = await import('../../src/providers/payment/euplatesc.ts');

    const result = await initiatePayment(db, {
      id: 'order-1',
      order_number: 'ORD-001',
      currency: 'RON',
      total: 5000,
      customer_email: 'ion@example.com',
      customer_name: 'Ion Popescu',
      status: 'pending',
    }, {
      success_url: 'https://example.com/success',
      cancel_url: 'https://example.com/cancel',
      webhook_url: 'https://example.com/api/plugins/shop/webhooks/euplatesc',
      currency: 'RON',
    });

    const url = new URL(result.redirect_url);
    const params = new URLSearchParams(url.search);

    assert.strictEqual(params.get('mid'), null,
      'mid param must NOT be present (only merch_id is used)');
  });

  it('splits customer_name into fname (first word) and lname (rest)', async () => {
    const { initiatePayment } = await import('../../src/providers/payment/euplatesc.ts');

    const result = await initiatePayment(db, {
      id: 'order-1',
      order_number: 'ORD-001',
      currency: 'RON',
      total: 5000,
      customer_email: 'ion@example.com',
      customer_name: 'Ion Popescu',
      status: 'pending',
    }, {
      success_url: 'https://example.com/success',
      cancel_url: 'https://example.com/cancel',
      webhook_url: 'https://example.com/api/plugins/shop/webhooks/euplatesc',
      currency: 'RON',
    });

    const url = new URL(result.redirect_url);
    const params = new URLSearchParams(url.search);

    assert.strictEqual(params.get('fname'), 'Ion',
      'fname must be the first word of customer_name');
    assert.strictEqual(params.get('lname'), 'Popescu',
      'lname must be the rest of customer_name after first word');
  });

  it('sets email from customer_email', async () => {
    const { initiatePayment } = await import('../../src/providers/payment/euplatesc.ts');

    const result = await initiatePayment(db, {
      id: 'order-1',
      order_number: 'ORD-001',
      currency: 'RON',
      total: 5000,
      customer_email: 'ion@example.com',
      customer_name: 'Ion Popescu',
      status: 'pending',
    }, {
      success_url: 'https://example.com/success',
      cancel_url: 'https://example.com/cancel',
      webhook_url: 'https://example.com/api/plugins/shop/webhooks/euplatesc',
      currency: 'RON',
    });

    const url = new URL(result.redirect_url);
    const params = new URLSearchParams(url.search);

    assert.strictEqual(params.get('email'), 'ion@example.com',
      'email must be set from order.customer_email');
  });

  it('sends lang param when locale is provided', async () => {
    const { initiatePayment } = await import('../../src/providers/payment/euplatesc.ts');

    const result = await initiatePayment(db, {
      id: 'order-1',
      order_number: 'ORD-001',
      currency: 'RON',
      total: 5000,
      customer_email: 'ion@example.com',
      customer_name: 'Ion Popescu',
      status: 'pending',
    }, {
      success_url: 'https://example.com/success',
      cancel_url: 'https://example.com/cancel',
      webhook_url: 'https://example.com/api/plugins/shop/webhooks/euplatesc',
      currency: 'RON',
      locale: 'en',
    });

    const url = new URL(result.redirect_url);
    const params = new URLSearchParams(url.search);

    assert.strictEqual(params.get('lang'), 'en',
      'lang must be set from options.locale when provided');
  });

  it('does NOT send lang param when locale is not provided', async () => {
    const { initiatePayment } = await import('../../src/providers/payment/euplatesc.ts');

    const result = await initiatePayment(db, {
      id: 'order-1',
      order_number: 'ORD-001',
      currency: 'RON',
      total: 5000,
      customer_email: 'ion@example.com',
      customer_name: 'Ion Popescu',
      status: 'pending',
    }, {
      success_url: 'https://example.com/success',
      cancel_url: 'https://example.com/cancel',
      webhook_url: 'https://example.com/api/plugins/shop/webhooks/euplatesc',
      currency: 'RON',
    });

    const url = new URL(result.redirect_url);
    const params = new URLSearchParams(url.search);

    assert.strictEqual(params.get('lang'), null,
      'lang must NOT be present when options.locale is not provided');
  });
});
