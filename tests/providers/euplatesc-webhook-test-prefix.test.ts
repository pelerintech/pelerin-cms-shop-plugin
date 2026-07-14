import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { ensureLoader } from '../stubs/register.mjs';
import { createTestDb, resetDb, shop_settings } from '../db/harness.ts';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { eq } from 'drizzle-orm';
import { computeEuplatescHash, buildResponseFields } from '../../src/lib/euplatesc-mac.ts';

ensureLoader();

describe('euPlatesc IPN webhook — TEST- prefix handling', () => {
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

  it('does NOT throw "Order not found" for TEST- prefix', async () => {
    const { handleWebhook } = await import('../../src/providers/payment/euplatesc.ts');

    // Build valid IPN with TEST- prefix (no order exists)
    const ipnParams = {
      amount: '1.00',
      curr: 'RON',
      invoice_id: 'TEST-20260710143045',
      ep_id: 'EP999',
      merch_id: '44841007584',
      action: '0',
      message: 'OK',
      approval: 'APPR123',
      timestamp: '20260710143045',
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

    // Must NOT throw
    const result = await handleWebhook(db, request);

    // Must return pending (not paid, since no real order)
    assert.strictEqual(
      result.status,
      'pending',
      'TEST- prefix IPN must return pending status (no order transition)'
    );
  });

  it('stores result in shop_settings key euplatesc_test_result', async () => {
    const { handleWebhook } = await import('../../src/providers/payment/euplatesc.ts');

    // Build valid IPN with TEST- prefix
    const ipnParams = {
      amount: '1.00',
      curr: 'RON',
      invoice_id: 'TEST-20260710143046',
      ep_id: 'EP998',
      merch_id: '44841007584',
      action: '0',
      message: 'OK',
      approval: 'APPR123',
      timestamp: '20260710143046',
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

    await handleWebhook(db, request);

    // Check shop_settings for the test result
    const settingsResult = await db
      .select({ value: shop_settings.value })
      .from(shop_settings)
      .where(eq(shop_settings.key, 'euplatesc_test_result'))
      .limit(1);

    assert.ok(settingsResult.length > 0, 'euplatesc_test_result must be stored in shop_settings');

    const parsed = JSON.parse(settingsResult[0].value);

    assert.ok(parsed.timestamp, 'Result must have timestamp');
    assert.strictEqual(
      parsed.invoice_id,
      'TEST-20260710143046',
      'Result must have correct invoice_id'
    );
    assert.strictEqual(parsed.action, '0', 'Result must have action');
    assert.strictEqual(parsed.message, 'OK', 'Result must have message');
    assert.strictEqual(parsed.mac_valid, true, 'Result must have mac_valid=true');
    assert.strictEqual(parsed.ep_id, 'EP998', 'Result must have ep_id');
    assert.strictEqual(parsed.amount, '1.00', 'Result must have amount');
    assert.strictEqual(parsed.curr, 'RON', 'Result must have curr');
  });
});
