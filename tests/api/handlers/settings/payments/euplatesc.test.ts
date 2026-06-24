import { test } from 'node:test';
import { ensureLoader } from '../../../../stubs/register.mjs';
import {
  assert,
  matrix,
  createTestDb,
  seedMinimal,
  makeFakeSdk,
  makeCtx,
  poisonDb,
} from '../../_matrix.ts';
import { shop_settings } from '../../../../db/harness.ts';

// crypto.encrypt requires an encryption key at call-time.
process.env.BETTER_AUTH_SECRET = 'test-secret-for-euplatesc-settings';

ensureLoader();
const { runGet, runPut } = await import(
  '../../../../../src/api/shop/settings/payments/euplatesc.ts'
);

const base = 'http://localhost/api/plugins/shop/settings/payments/euplatesc';

test('GET auth-fail → 401', () =>
  matrix.adminAuthFail({ run: runGet, url: base }));

test('GET happy-path → 200, data has euplatesc keys', () =>
  matrix.happyPath({
    run: runGet,
    url: base,
    check: (b) => {
      assert.ok(b.data, 'data should exist');
      assert.ok('euplatesc_merchant_id' in b.data);
      assert.ok('euplatesc_secret_key' in b.data);
    },
  }));

// Pattern A handler: auth caught (→401), db work NOT wrapped → rejection.
test('GET error-wrap → rejects on db error (Pattern A)', async () => {
  const sdk = makeFakeSdk();
  const ctx = makeCtx({ url: base });
  await assert.rejects(
    () => runGet({ db: poisonDb(), sdk, ctx }),
    /poison/,
  );
});

test('PUT auth-fail → 401', () =>
  matrix.adminAuthFail({ run: runPut, url: base, body: {} }));

// euplatesc PUT has no Zod validation (raw body) → no validation-fail cell.

test('PUT happy-path → 200, settings written to shop_settings', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: base,
      body: {
        euplatesc_merchant_id: 'merchant-123',
        euplatesc_secret_key: 'secret-key-456',
      },
      method: 'PUT',
    });
    const res = await runPut({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await res.json();
    assert.equal(b.success, true);

    // Read back: settings rows exist for the two euplatesc keys.
    const { eq } = await import('drizzle-orm');
    const keys = ['euplatesc_merchant_id', 'euplatesc_secret_key'];
    for (const key of keys) {
      const [row] = await db
        .select()
        .from(shop_settings)
        .where(eq(shop_settings.key, key));
      assert.ok(row, `setting ${key} should exist after PUT`);
    }
  } finally {
    await cleanup();
  }
});

test('PUT error-wrap → rejects on db error (Pattern A)', async () => {
  const sdk = makeFakeSdk();
  const ctx = makeCtx({
    url: base,
    body: { euplatesc_merchant_id: 'mid' },
    method: 'PUT',
  });
  await assert.rejects(
    () => runPut({ db: poisonDb(), sdk, ctx }),
    /poison/,
  );
});
