import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { ensureLoader } from '../stubs/register.mjs';
import { createTestDb, resetDb, orders, shop_settings, buildOrderRow } from '../db/harness.ts';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { eq } from 'drizzle-orm';

ensureLoader();

describe('euPlatesc initiate payment — payment_provider and re-initiation', () => {
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
  });

  it('sets payment_provider to euplatesc on initiation', async () => {
    const { initiatePayment } = await import('../../src/providers/payment/euplatesc.ts');

    // Seed a pending order
    const orderRow = buildOrderRow({
      id: 'order-1',
      order_number: 'ORD-001',
      status: 'pending',
      total: 5000,
      currency: 'RON',
      customer_name: 'Ion Popescu',
      customer_email: 'ion@example.com',
      payment_provider: null,
    });
    await db.insert(orders).values(orderRow);

    await initiatePayment(
      db,
      {
        id: 'order-1',
        order_number: 'ORD-001',
        currency: 'RON',
        total: 5000,
        customer_email: 'ion@example.com',
        customer_name: 'Ion Popescu',
        status: 'pending',
      },
      {
        success_url: 'https://example.com/success',
        cancel_url: 'https://example.com/cancel',
        webhook_url: 'https://example.com/api/plugins/shop/webhooks/euplatesc',
        currency: 'RON',
      }
    );

    // Check payment_provider is set
    const result = await db
      .select({ payment_provider: orders.payment_provider })
      .from(orders)
      .where(eq(orders.id, 'order-1'))
      .limit(1);
    assert.strictEqual(
      result[0].payment_provider,
      'euplatesc',
      'payment_provider must be set to "euplatesc" after initiatePayment'
    );
  });

  it('handles re-initiation on already awaiting_payment order', async () => {
    const { initiatePayment } = await import('../../src/providers/payment/euplatesc.ts');

    // Seed an order already in awaiting_payment
    const orderRow = buildOrderRow({
      id: 'order-2',
      order_number: 'ORD-002',
      status: 'awaiting_payment',
      total: 5000,
      currency: 'RON',
      customer_name: 'Ion Popescu',
      customer_email: 'ion@example.com',
      payment_provider: 'euplatesc',
      payment_intent_id: 'ORD-002',
    });
    await db.insert(orders).values(orderRow);

    // Re-initiate payment — should not throw
    const result = await initiatePayment(
      db,
      {
        id: 'order-2',
        order_number: 'ORD-002',
        currency: 'RON',
        total: 5000,
        customer_email: 'ion@example.com',
        customer_name: 'Ion Popescu',
        status: 'awaiting_payment',
      },
      {
        success_url: 'https://example.com/success',
        cancel_url: 'https://example.com/cancel',
        webhook_url: 'https://example.com/api/plugins/shop/webhooks/euplatesc',
        currency: 'RON',
      }
    );

    assert.ok(result.redirect_url, 'Should return redirect_url on re-initiation');

    // Check order stays awaiting_payment (no redundant transition)
    const orderResult = await db
      .select({ status: orders.status, payment_provider: orders.payment_provider })
      .from(orders)
      .where(eq(orders.id, 'order-2'))
      .limit(1);
    assert.strictEqual(
      orderResult[0].status,
      'awaiting_payment',
      'Order must stay awaiting_payment on re-initiation'
    );
    assert.strictEqual(
      orderResult[0].payment_provider,
      'euplatesc',
      'payment_provider must still be euplatesc'
    );
  });
});
