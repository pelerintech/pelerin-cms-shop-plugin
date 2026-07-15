import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert';
import { ensureLoader } from '../stubs/register.mjs';
import { createTestDb, resetDb, shop_settings } from '../db/harness.ts';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';

ensureLoader();

describe('euPlatesc isConfigured', () => {
  let db: LibSQLDatabase;
  let provider: any;

  before(async () => {
    const harness = await createTestDb();
    db = harness.db;
    await resetDb(db);
    const mod = await import('../../src/providers/payment/euplatesc.ts');
    provider = mod.default;
  });

  beforeEach(async () => {
    await resetDb(db);
  });

  it('returns true when both merchant_id and secret_key are set', async () => {
    await db.insert(shop_settings).values([
      { id: 's1', key: 'euplatesc_merchant_id', value: '44841007584' },
      { id: 's2', key: 'euplatesc_secret_key', value: 'AA4A81EE58A1D74DE6E02DF2C1CE9982780F95DC' },
    ]);

    const result = await provider.isConfigured(db);
    assert.strictEqual(result, true, 'isConfigured must return true when both credentials are set');
  });

  it('returns false when merchant_id is missing', async () => {
    await db.insert(shop_settings).values([
      {
        id: 's2',
        key: 'euplatesc_secret_key',
        value: 'AA4A81EE58A1D74DE6E02DF2C1CE9982780F95DC',
      },
    ]);

    const result = await provider.isConfigured(db);
    assert.strictEqual(result, false, 'isConfigured must return false when merchant_id is missing');
  });

  it('returns false when secret_key is missing', async () => {
    await db
      .insert(shop_settings)
      .values([{ id: 's1', key: 'euplatesc_merchant_id', value: '44841007584' }]);

    const result = await provider.isConfigured(db);
    assert.strictEqual(result, false, 'isConfigured must return false when secret_key is missing');
  });

  it('returns false when no settings exist', async () => {
    const result = await provider.isConfigured(db);
    assert.strictEqual(result, false, 'isConfigured must return false when no settings exist');
  });
});
