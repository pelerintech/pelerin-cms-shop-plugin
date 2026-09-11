import { test } from 'node:test';
import { eq } from 'drizzle-orm';
import { referral_codes } from '../../../db/harness.ts';
import { ensureLoader } from '../../../stubs/register.mjs';
import { matrix, assert, createTestDb, seedMinimal, makeFakeSdk, makeCtx } from '../_matrix.ts';

ensureLoader();
const { runGet, runPost } = await import('../../../../src/api/shop/referral-codes/index.ts');

const base = 'http://localhost/api/plugins/shop/referral-codes';

test('GET auth-fail → 401', () => matrix.adminAuthFail({ run: runGet, url: base }));

test('GET happy-path → 200, data is array', () =>
  matrix.happyPath({
    run: runGet,
    url: base,
    check: (b) => assert.ok(Array.isArray(b.data), 'data should be array'),
  }));

test('GET error-wrap → 500', () => matrix.errorWrap({ run: runGet, url: base }));

test('POST auth-fail → 401', () => matrix.adminAuthFail({ run: runPost, url: base, body: {} }));

test('POST validation-fail → 422', () =>
  matrix.validationFail({
    run: runPost,
    url: base,
    invalidBody: { name: 'No Code' /* missing code */ },
  }));

test('POST happy-path → 201, data.id exists', () =>
  matrix.happyPath({
    run: runPost,
    url: base,
    method: 'POST',
    body: {
      code: 'NEWREF77',
      name: 'New Partner',
      discount_type: 'percentage',
      discount_value: 15,
      active: true,
    },
    expectedStatus: 201,
    check: (b) => assert.ok(b.data?.id, 'data.id should exist'),
  }));

test('POST error-wrap → 500', () =>
  matrix.errorWrap({
    run: runPost,
    url: base,
    body: {
      code: 'ERRREF1',
      name: 'Err Partner',
      active: true,
    },
  }));

// ── Money-unit boundary: major (form input) → minor (storage) ──

test('POST converts fixed_amount discount_value to minor on store', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const sdk = makeFakeSdk();
    const body = {
      code: 'FIXREF5',
      name: 'Fixed',
      discount_type: 'fixed_amount',
      discount_value: 5, // 5.00 RON
      active: true,
    };
    const ctx = makeCtx({ url: base, method: 'POST', body, params: {} });
    const res = await runPost({ db, sdk, ctx });
    assert.equal(res.status, 201);
    const row = (
      await db.select().from(referral_codes).where(eq(referral_codes.code, 'FIXREF5'))
    )[0];
    assert.equal(row.discount_value, 500, 'fixed_amount discount_value stored minor (5.00 → 500)');
  } finally {
    await cleanup();
  }
});

test('POST leaves percentage discount_value as-is (not x100)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const sdk = makeFakeSdk();
    const body = {
      code: 'PCTREF10',
      name: 'Pct',
      discount_type: 'percentage',
      discount_value: 10,
      active: true,
    };
    const ctx = makeCtx({ url: base, method: 'POST', body, params: {} });
    const res = await runPost({ db, sdk, ctx });
    assert.equal(res.status, 201);
    const row = (
      await db.select().from(referral_codes).where(eq(referral_codes.code, 'PCTREF10'))
    )[0];
    assert.equal(
      row.discount_value,
      10,
      'percentage discount_value stays a percent (10, not 1000)'
    );
  } finally {
    await cleanup();
  }
});
