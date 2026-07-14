import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { ensureLoader } from '../stubs/register.mjs';
import { createTestDb, resetDb, orders, shop_settings, buildOrderRow } from '../db/harness.ts';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { computeEuplatescHash, buildRequestFields } from '../../src/lib/euplatesc-mac.ts';

ensureLoader();

describe('euPlatesc initiate payment — signature verification', () => {
  let db: LibSQLDatabase;
  const merchantKey = 'AA4A81EE58A1D74DE6E02DF2C1CE9982780F95DC';
  const merchantId = '44841007584';
  let fixedTimestamp: string;
  let fixedNonce: string;

  before(async () => {
    const harness = await createTestDb();
    db = harness.db;
    await resetDb(db);

    // Seed euPlatesc credentials
    await db.insert(shop_settings).values([
      { id: 's1', key: 'euplatesc_merchant_id', value: merchantId },
      { id: 's2', key: 'euplatesc_secret_key', value: merchantKey },
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

    // Fixed timestamp and nonce for reproducibility
    fixedTimestamp = '20260710120000';
    fixedNonce = 'abcdef1234567890abcdef1234567890';

    // Monkey-patch crypto.randomBytes to return fixed nonce
    const origRandomBytes = crypto.randomBytes;
    (crypto as any).randomBytes = (size: number) => Buffer.from(fixedNonce, 'hex');

    // Monkey-patch Date to return fixed timestamp
    const origDate = globalThis.Date;
    globalThis.Date = class extends origDate {
      constructor(...args: any[]) {
        if (args.length === 0) {
          super('2026-07-10T12:00:00.000Z');
        } else {
          super(...args);
        }
      }
      static now() {
        return new origDate('2026-07-10T12:00:00.000Z').getTime();
      }
    } as any;

    // Store originals for cleanup (not used in tests, but good practice)
    (globalThis as any).__origRandomBytes = origRandomBytes;
    (globalThis as any).__origDate = origDate;
  });

  it('fp_hash is HMAC-MD5 computed with correct field order', async () => {
    const { initiatePayment } = await import('../../src/providers/payment/euplatesc.ts');

    const result = await initiatePayment(
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
        currency: 'RON',
        webhook_url: 'https://example.com/api/plugins/shop/webhooks/euplatesc',
      }
    );

    const url = new URL(result.redirect_url);
    const params = new URLSearchParams(url.search);
    const receivedHash = params.get('fp_hash');

    assert.ok(receivedHash, 'fp_hash must be present in redirect URL');

    // Recompute the expected hash using the correct algorithm
    const expectedHash = computeEuplatescHash(
      buildRequestFields({
        amount: '50.00',
        curr: 'RON',
        invoice_id: 'ORD-001',
        order_desc: 'Order ORD-001',
        merch_id: merchantId,
        timestamp: fixedTimestamp,
        nonce: fixedNonce,
      }),
      merchantKey
    ).toUpperCase();

    assert.strictEqual(
      receivedHash,
      expectedHash,
      `fp_hash must match HMAC-MD5 with correct field order. Got ${receivedHash}, expected ${expectedHash}`
    );
  });

  it('fp_hash is uppercase', async () => {
    const { initiatePayment } = await import('../../src/providers/payment/euplatesc.ts');

    const result = await initiatePayment(
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
        currency: 'RON',
        webhook_url: 'https://example.com/api/plugins/shop/webhooks/euplatesc',
      }
    );

    const url = new URL(result.redirect_url);
    const params = new URLSearchParams(url.search);
    const receivedHash = params.get('fp_hash');

    assert.ok(receivedHash, 'fp_hash must be present');
    assert.strictEqual(receivedHash, receivedHash.toUpperCase(), 'fp_hash must be uppercase');
  });

  it('MAC does not include secretKey in the data string', async () => {
    const { initiatePayment } = await import('../../src/providers/payment/euplatesc.ts');

    const result = await initiatePayment(
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
        currency: 'RON',
        webhook_url: 'https://example.com/api/plugins/shop/webhooks/euplatesc',
      }
    );

    const url = new URL(result.redirect_url);
    const params = new URLSearchParams(url.search);
    const receivedHash = params.get('fp_hash');

    // If the secretKey were included in the data string (old buggy behavior),
    // the hash would be different. We verify the hash matches the correct
    // computation (without secretKey in data).
    const expectedHash = computeEuplatescHash(
      buildRequestFields({
        amount: '50.00',
        curr: 'RON',
        invoice_id: 'ORD-001',
        order_desc: 'Order ORD-001',
        merch_id: merchantId,
        timestamp: fixedTimestamp,
        nonce: fixedNonce,
      }),
      merchantKey
    ).toUpperCase();

    assert.strictEqual(
      receivedHash,
      expectedHash,
      'fp_hash must NOT include secretKey in the data string (it is the HMAC key, not part of the data)'
    );
  });
});
