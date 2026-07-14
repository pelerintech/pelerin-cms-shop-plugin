import { test } from 'node:test';
import assert from 'node:assert';
import { ensureLoader } from '../../../../../stubs/register.mjs';
import { matrix } from '../../../_matrix.ts';
import { makeFakeSdk, makeCtx } from '../../../../helpers.ts';
import { createTestDb, seedMinimal } from '../../../../../db/harness.ts';

ensureLoader();
const { runGet, runPost } =
  await import('../../../../../../src/api/shop/products/[id]/variants/index.ts');

const base = 'http://localhost/api/plugins/shop/products/x/variants';

test('GET auth-fail → 401', () => matrix.adminAuthFail({ run: runGet, url: base }));

test('GET happy-path → 200, data is array', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({ url: base, params: { id: f.variantProductId } });
    const res = await runGet({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await res.json();
    assert.equal(b.success, true);
    assert.ok(Array.isArray(b.data), 'data should be array');
    assert.ok(b.data.length > 0, 'should have seeded variants');
  } finally {
    await cleanup();
  }
});

test('GET error-wrap → 500', () =>
  matrix.errorWrap({ run: runGet, url: base, params: { id: 'x' } }));

test('POST auth-fail → 401', () => matrix.adminAuthFail({ run: runPost, url: base, body: {} }));

test('POST validation-fail: missing combinations → 422', () =>
  matrix.validationFail({
    run: runPost,
    url: base,
    invalidBody: { foo: 'bar' },
  }));

test('POST validation-fail: empty option_ids → 422', () =>
  matrix.validationFail({
    run: runPost,
    url: base,
    invalidBody: { combinations: [{ option_ids: [] }] },
  }));

test('POST happy-path → 201, data is array', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const sdk = makeFakeSdk();
    // black+128 already exists; create white+128 (a new combo)
    const body = {
      combinations: [
        { option_ids: [f.optColorWhiteId, f.optStorage128Id], sku: 'SMX-WHT-128', stock: 10 },
      ],
    };
    const ctx = makeCtx({ url: base, body, params: { id: f.variantProductId } });
    const res = await runPost({ db, sdk, ctx });
    assert.equal(res.status, 201);
    const b = await res.json();
    assert.equal(b.success, true);
    assert.ok(Array.isArray(b.data), 'data should be array');
    assert.equal(b.data.length, 1);
    assert.ok(b.data[0].id, 'created variant should have id');
  } finally {
    await cleanup();
  }
});

test('POST 409: duplicate combination → 409', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const sdk = makeFakeSdk();
    // black+128 already seeded as variantBlack128Id → duplicate
    const body = { combinations: [{ option_ids: [f.optColorBlackId, f.optStorage128Id] }] };
    const ctx = makeCtx({ url: base, body, params: { id: f.variantProductId } });
    const res = await runPost({ db, sdk, ctx });
    assert.equal(res.status, 409);
    const b = await res.json();
    assert.equal(b.success, false);
  } finally {
    await cleanup();
  }
});

test('POST error-wrap → 500', () =>
  matrix.errorWrap({
    run: runPost,
    url: base,
    body: { combinations: [{ option_ids: ['a'] }] },
    params: { id: 'x' },
  }));
