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
process.env.BETTER_AUTH_SECRET = 'test-secret-for-stripe-settings';

ensureLoader();
const { runGet, runPut } = await import('../../../../../src/api/shop/settings/payments/stripe.ts');

const base = 'http://localhost/api/plugins/shop/settings/payments/stripe';

test('GET auth-fail → 401', () => matrix.adminAuthFail({ run: runGet, url: base }));

test('GET happy-path → 200, data has stripe keys', () =>
  matrix.happyPath({
    run: runGet,
    url: base,
    check: (b) => {
      assert.ok(b.data, 'data should exist');
      assert.ok('stripe_publishable_key' in b.data);
      assert.ok('stripe_secret_key' in b.data);
      assert.ok('stripe_webhook_secret' in b.data);
    },
  }));

// Pattern A handler: auth caught (→401), db work NOT wrapped → rejection.
test('GET error-wrap → rejects on db error (Pattern A)', async () => {
  const sdk = makeFakeSdk();
  const ctx = makeCtx({ url: base });
  await assert.rejects(() => runGet({ db: poisonDb(), sdk, ctx }), /poison/);
});

test('PUT auth-fail → 401', () => matrix.adminAuthFail({ run: runPut, url: base, body: {} }));

// stripe PUT has no Zod validation (raw body) → no validation-fail cell.

// r17 Task 5: Zod validation on payment settings. These tests fail until the
// PUT handler validates with StripeSettingsSchema before writing.
test('PUT validation-fail → 422 with fields when stripe_secret_key is null (no encrypt/upsert)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: base,
      body: { stripe_secret_key: null },
      method: 'PUT',
    });
    const res = await runPut({ db, sdk, ctx });
    assert.equal(res.status, 422);
    const b = await res.json();
    assert.equal(b.success, false);
    assert.equal(b.error, 'Validation failed');
    assert.ok(b.fields && Object.keys(b.fields).length > 0, 'fields non-empty');
    const { eq } = await import('drizzle-orm');
    const [row] = await db
      .select()
      .from(shop_settings)
      .where(eq(shop_settings.key, 'stripe_secret_key'));
    assert.ok(!row, 'no upsertSetting should run on validation failure');
  } finally {
    await cleanup();
  }
});

test('PUT validation-fail → 422 when stripe_secret_key is an object (no encrypt)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: base,
      body: { stripe_secret_key: { obj: 1 } },
      method: 'PUT',
    });
    const res = await runPut({ db, sdk, ctx });
    assert.equal(res.status, 422);
    const b = await res.json();
    assert.equal(b.success, false);
    assert.ok(b.fields && 'stripe_secret_key' in b.fields);
    const { eq } = await import('drizzle-orm');
    const [row] = await db
      .select()
      .from(shop_settings)
      .where(eq(shop_settings.key, 'stripe_secret_key'));
    assert.ok(!row, 'no encrypt/upsertSetting should run on validation failure');
  } finally {
    await cleanup();
  }
});

test('PUT validation-fail → 422 when stripe_webhook_secret is a number', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: base,
      body: { stripe_webhook_secret: 999 },
      method: 'PUT',
    });
    const res = await runPut({ db, sdk, ctx });
    assert.equal(res.status, 422);
    const b = await res.json();
    assert.equal(b.success, false);
    assert.ok(b.fields && 'stripe_webhook_secret' in b.fields);
  } finally {
    await cleanup();
  }
});

test('PUT happy-path → 200, settings written to shop_settings', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: base,
      body: {
        stripe_publishable_key: 'pk_test_123',
        stripe_secret_key: 'sk_test_secret',
        stripe_webhook_secret: 'whsec_test',
      },
      method: 'PUT',
    });
    const res = await runPut({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await res.json();
    assert.equal(b.success, true);

    // Read back: settings rows exist for the three stripe keys.
    const { eq } = await import('drizzle-orm');
    const keys = ['stripe_publishable_key', 'stripe_secret_key', 'stripe_webhook_secret'];
    for (const key of keys) {
      const [row] = await db.select().from(shop_settings).where(eq(shop_settings.key, key));
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
    body: { stripe_publishable_key: 'pk' },
    method: 'PUT',
  });
  await assert.rejects(() => runPut({ db: poisonDb(), sdk, ctx }), /poison/);
});
