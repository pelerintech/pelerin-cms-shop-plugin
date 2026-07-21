/**
 * Tests for the ramburs toggle settings API endpoint.
 *
 * POST /api/plugins/shop/settings/payments/ramburs  — toggle ramburs enabled/disabled
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { ensureLoader } from '../../../../stubs/register.mjs';
import { createTestDb, seedMinimal, makeFakeSdk, makeCtx, matrix } from '../../_matrix.ts';
import { getSetting } from '../../../../../src/lib/data/settings.ts';
import { getProvider } from '../../../../../src/providers/payment/registry.ts';

ensureLoader();
await import('../../../../../src/providers/payment/ramburs');

const { runPost } = await import('../../../../../src/api/shop/settings/payments/ramburs.ts');

const URL = 'http://localhost/api/plugins/shop/settings/payments/ramburs';

test('POST { enabled: false } → 200, ramburs disabled', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: URL,
      method: 'POST',
      body: { enabled: false },
    });
    const res = await runPost({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await res.json();
    assert.equal(b.success, true);

    // Verify persisted
    assert.equal(await getSetting(db, 'ramburs_enabled'), 'false');

    // Verify isConfigured reflects the toggle
    const ramburs = getProvider('ramburs')!;
    const configured = await ramburs.isConfigured(db);
    assert.equal(configured, false);
  } finally {
    await cleanup();
  }
});

test('POST { enabled: true } → 200, ramburs enabled', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    // First disable
    const sdk = makeFakeSdk();
    let ctx = makeCtx({ url: URL, method: 'POST', body: { enabled: false } });
    await runPost({ db, sdk, ctx });

    // Then enable
    ctx = makeCtx({ url: URL, method: 'POST', body: { enabled: true } });
    const res = await runPost({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await res.json();
    assert.equal(b.success, true);

    // Verify persisted
    assert.equal(await getSetting(db, 'ramburs_enabled'), 'true');

    // Verify isConfigured reflects the toggle
    const ramburs = getProvider('ramburs')!;
    const configured = await ramburs.isConfigured(db);
    assert.equal(configured, true);
  } finally {
    await cleanup();
  }
});

test('POST { enabled: "yes" } (wrong type) → 422', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: URL,
      method: 'POST',
      body: { enabled: 'yes' },
    });
    const res = await runPost({ db, sdk, ctx });
    assert.equal(res.status, 422);
    const b = await res.json();
    assert.equal(b.success, false);
    assert.ok(b.fields?.enabled, 'enabled field error should be present');
  } finally {
    await cleanup();
  }
});

test('POST without admin → 401', () =>
  matrix.adminAuthFail({ run: runPost, url: URL, body: { enabled: false } }));
