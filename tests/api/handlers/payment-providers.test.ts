import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert';
import { ensureLoader } from '../../stubs/register.mjs';
import { createTestDb, resetDb, shop_settings } from '../../db/harness.ts';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';

ensureLoader();

describe('GET /payment-providers — dynamic provider list', () => {
  let db: LibSQLDatabase;

  before(async () => {
    const harness = await createTestDb();
    db = harness.db;
    await resetDb(db);
  });

  beforeEach(async () => {
    await resetDb(db);
  });

  it('returns only configured providers', async () => {
    // Seed only euPlatesc configured
    await db.insert(shop_settings).values([
      { id: 's1', key: 'euplatesc_merchant_id', value: '44841007584' },
      { id: 's2', key: 'euplatesc_secret_key', value: 'AA4A81EE58A1D74DE6E02DF2C1CE9982780F95DC' },
    ]);

    const { runGet } = await import('../../../src/api/shop/payment-providers/index.ts');

    const fakeCtx = {
      params: {},
      request: new Request('https://example.com/api/plugins/shop/payment-providers'),
    } as any;

    const fakeSdk = { auth: {} };

    const response = await runGet({ db, sdk: fakeSdk, ctx: fakeCtx });
    const data = await response.json();

    assert.strictEqual(response.status, 200, 'Response must be 200');
    assert.ok(data.success, 'Response must have success: true');
    assert.ok(Array.isArray(data.data.providers), 'Response must have providers array');
    assert.strictEqual(
      data.data.providers.length,
      1,
      'Must have exactly 1 provider (euPlatesc only)'
    );
    assert.strictEqual(data.data.providers[0].name, 'euplatesc', 'Provider must be euplatesc');
  });

  it('uses listProviders() — dynamically discovers registered providers', async () => {
    // Register a fake third provider to prove the endpoint iterates the registry, not a hardcoded list
    const { registerProvider } = await import('../../../src/providers/payment/registry.ts');
    registerProvider({
      name: 'fake_test_provider',
      refundable: false,
      initiatePayment: async () => ({ redirect_url: 'http://example.com' }),
      handleWebhook: async () => ({ status: 'pending' }),
      isConfigured: async () => true,
      refund: async () => ({ success: false }),
    });

    const { runGet } = await import('../../../src/api/shop/payment-providers/index.ts');

    const fakeCtx = {
      params: {},
      request: new Request('https://example.com/api/plugins/shop/payment-providers'),
    } as any;

    const fakeSdk = { auth: {} };

    const response = await runGet({ db, sdk: fakeSdk, ctx: fakeCtx });
    const data = await response.json();

    const names = data.data.providers.map((p) => p.name);
    assert.ok(
      names.includes('fake_test_provider'),
      'Must include dynamically registered fake_test_provider'
    );
    const fakeEntry = data.data.providers.find((p) => p.name === 'fake_test_provider');
    assert.strictEqual(
      fakeEntry.label,
      'Fake test provider',
      'Label must be derived generically from name'
    );
  });

  it('returns 200 (no auth required — public endpoint)', async () => {
    const { runGet } = await import('../../../src/api/shop/payment-providers/index.ts');

    const fakeCtx = {
      params: {},
      request: new Request('https://example.com/api/plugins/shop/payment-providers'),
    } as any;

    const fakeSdk = { auth: {} };

    const response = await runGet({ db, sdk: fakeSdk, ctx: fakeCtx });
    assert.strictEqual(response.status, 200, 'Public endpoint must return 200 without auth');
  });
});
