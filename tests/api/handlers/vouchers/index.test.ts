import { test } from 'node:test';
import { eq } from 'drizzle-orm';
import { ensureLoader } from '../../../stubs/register.mjs';
import { matrix, assert } from '../_matrix.ts';
import { createTestDb, seedMinimal, vouchers } from '../../../db/harness.ts';
import { makeFakeSdk, makeCtx } from '../../helpers.ts';

ensureLoader();
const { runGet, runPost } = await import('../../../../src/api/shop/vouchers/index.ts');

const base = 'http://localhost/api/plugins/shop/vouchers';

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
    invalidBody: { type: 'fixed_amount' /* missing code */ },
  }));

test('POST happy-path → 201, data.id exists', () =>
  matrix.happyPath({
    run: runPost,
    url: base,
    method: 'POST',
    body: {
      code: 'NEWVIP50',
      type: 'fixed_amount',
      value: 500,
      active: true,
      single_use_per_customer: false,
    },
    expectedStatus: 201,
    check: (b) => assert.ok(b.data?.id, 'data.id should exist'),
  }));

test('POST error-wrap → 500', () =>
  matrix.errorWrap({
    run: runPost,
    url: base,
    body: {
      code: 'ERRCODE1',
      type: 'fixed_amount',
      value: 100,
      active: true,
      single_use_per_customer: false,
    },
  }));

// ── Money-unit boundary: major (form input) → minor (storage) ──

test('POST converts fixed_amount value + min_order_value to minor on store', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const sdk = makeFakeSdk();
    const body = {
      code: 'FIXED50',
      type: 'fixed_amount',
      value: 5, // 5.00 RON
      min_order_value: 20, // 20.00 RON
      active: true,
      single_use_per_customer: false,
    };
    const ctx = makeCtx({ url: base, method: 'POST', body, params: {} });
    const res = await runPost({ db, sdk, ctx });
    assert.equal(res.status, 201);
    const rows = await db.select().from(vouchers).where(eq(vouchers.code, 'FIXED50'));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].value, 500, 'fixed_amount value stored minor (5.00 → 500)');
    assert.equal(rows[0].min_order_value, 2000, 'min_order_value stored minor (20.00 → 2000)');
  } finally {
    await cleanup();
  }
});

test('POST leaves percentage value as-is (not x100)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const sdk = makeFakeSdk();
    const body = {
      code: 'PCT10',
      type: 'percentage',
      value: 10,
      active: true,
      single_use_per_customer: false,
    };
    const ctx = makeCtx({ url: base, method: 'POST', body, params: {} });
    const res = await runPost({ db, sdk, ctx });
    assert.equal(res.status, 201);
    const rows = await db.select().from(vouchers).where(eq(vouchers.code, 'PCT10'));
    assert.equal(rows[0].value, 10, 'percentage value stays a percent (10, not 1000)');
  } finally {
    await cleanup();
  }
});
