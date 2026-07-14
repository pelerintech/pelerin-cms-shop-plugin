import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { ensureLoader } from '../stubs/register.mjs';
import { createTestDb, resetDb, orders, shop_settings, buildOrderRow } from '../db/harness.ts';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';

ensureLoader();

describe('euPlatesc initiate payment — ExtraData URLs', () => {
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

  it('uses ExtraData[silenturl] for webhook URL', async () => {
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

    assert.strictEqual(
      params.get('ExtraData[silenturl]'),
      'https://example.com/api/plugins/shop/webhooks/euplatesc',
      'ExtraData[silenturl] must be set to the webhook_url'
    );
  });

  it('uses ExtraData[successurl] for success URL', async () => {
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

    assert.strictEqual(
      params.get('ExtraData[successurl]'),
      'https://example.com/success',
      'ExtraData[successurl] must be set to success_url'
    );
  });

  it('uses ExtraData[failedurl] for cancel URL', async () => {
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

    assert.strictEqual(
      params.get('ExtraData[failedurl]'),
      'https://example.com/cancel',
      'ExtraData[failedurl] must be set to cancel_url'
    );
  });

  it('uses ExtraData[backtosite] for cancel URL', async () => {
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

    assert.strictEqual(
      params.get('ExtraData[backtosite]'),
      'https://example.com/cancel',
      'ExtraData[backtosite] must be set to cancel_url'
    );
  });

  it('does NOT contain ExtraData[return] or ExtraData[backUrl]', async () => {
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

    assert.strictEqual(params.get('ExtraData[return]'), null,
      'ExtraData[return] must NOT be present (old fictional field name)');
    assert.strictEqual(params.get('ExtraData[backUrl]'), null,
      'ExtraData[backUrl] must NOT be present (old fictional field name)');
  });
});
