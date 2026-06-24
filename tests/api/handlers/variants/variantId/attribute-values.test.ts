import { test } from 'node:test';
import assert from 'node:assert';
import { ensureLoader } from '../../../../stubs/register.mjs';
import { matrix, createTestDb, seedMinimal, makeFakeSdk, makeCtx } from '../../_matrix.ts';

ensureLoader();
const { runGet, runPut } = await import(
  '../../../../../src/api/shop/variants/[variantId]/attribute-values.ts'
);

const base = (vid: string) =>
  `http://localhost/api/plugins/shop/variants/${vid}/attribute-values`;

test('GET auth-fail → 401', () =>
  matrix.adminAuthFail({ run: runGet, url: base('x'), params: { variantId: 'x' } }));

test('GET happy-path seeded → 200, data is array', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({ url: base(f.variantBlack128Id), params: { variantId: f.variantBlack128Id } });
    const res = await runGet({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await res.json();
    assert.equal(b.success, true);
    assert.ok(Array.isArray(b.data), 'data should be an array');
  } finally {
    await cleanup();
  }
});

test('GET error-wrap → 500', () =>
  matrix.errorWrap({ run: runGet, url: base('x'), params: { variantId: 'x' } }));

test('PUT auth-fail → 401', () =>
  matrix.adminAuthFail({ run: runPut, url: base('x'), body: {}, params: { variantId: 'x' } }));

// Custom validation-fail: handler uses bespoke body check (not Zod), returning
// error 'values array is required' with 422 — not the standard 'Validation failed'.
test('PUT validation-fail: missing values array → 422', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: base('x'),
      body: { values: 'not-an-array' },
      method: 'PUT',
      params: { variantId: 'x' },
    });
    const res = await runPut({ db, sdk, ctx });
    assert.equal(res.status, 422);
    const b = await res.json();
    assert.equal(b.success, false);
    assert.equal(b.error, 'values array is required');
  } finally {
    await cleanup();
  }
});

test('PUT happy-path seeded → 200', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: base(f.variantBlack128Id),
      body: { values: [{ assignment_id: f.assignVariantBrandId, value_text: 'NewBrand' }] },
      method: 'PUT',
      params: { variantId: f.variantBlack128Id },
    });
    const res = await runPut({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await res.json();
    assert.equal(b.success, true);
  } finally {
    await cleanup();
  }
});

test('PUT error-wrap → 500', () =>
  matrix.errorWrap({
    run: runPut,
    url: base('x'),
    body: { values: [{ assignment_id: 'x', value_text: 'y' }] },
    params: { variantId: 'x' },
  }));
