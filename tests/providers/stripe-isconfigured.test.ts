import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert';
import { ensureLoader } from '../stubs/register.mjs';
import { createTestDb, resetDb, shop_settings } from '../db/harness.ts';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';

ensureLoader();

describe('Stripe isConfigured', () => {
  let db: LibSQLDatabase;
  let provider: any;

  before(async () => {
    const harness = await createTestDb();
    db = harness.db;
    await resetDb(db);
    const mod = await import('../../src/providers/payment/stripe.ts');
    provider = mod.default;
  });

  beforeEach(async () => {
    await resetDb(db);
  });

  it('returns true when stripe_secret_key is set', async () => {
    await db
      .insert(shop_settings)
      .values([{ id: 's1', key: 'stripe_secret_key', value: 'sk_test_123' }]);

    const result = await provider.isConfigured(db);
    assert.strictEqual(result, true, 'isConfigured must return true when stripe_secret_key is set');
  });

  it('returns false when stripe_secret_key is missing', async () => {
    const result = await provider.isConfigured(db);
    assert.strictEqual(
      result,
      false,
      'isConfigured must return false when stripe_secret_key is missing'
    );
  });
});
