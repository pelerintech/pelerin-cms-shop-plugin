import { test } from 'node:test';
import assert from 'node:assert';
import { ensureLoader } from '../../../../../stubs/register.mjs';
import { matrix, createTestDb, seedMinimal, makeFakeSdk, makeCtx } from '../../../_matrix.ts';

ensureLoader();
const { runGet, runPost } = await import(
  '../../../../../../src/api/shop/attributes/[id]/options/index.ts'
);

const base = (id: string) => `http://localhost/api/plugins/shop/attributes/${id}/options`;

test('GET auth-fail → 401', () =>
  matrix.adminAuthFail({ run: runGet, url: base('x'), params: { id: 'x' } }));

test('GET happy-path seeded → 200, data is array', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({ url: base(f.attrColorId), params: { id: f.attrColorId } });
    const res = await runGet({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await res.json();
    assert.equal(b.success, true);
    assert.ok(Array.isArray(b.data), 'data should be an array');
  } finally {
    await cleanup();
  }
});

test('GET not-found (attribute missing) → 404', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const sdk = makeFakeSdk();
    const ctx = makeCtx({ url: base('nope'), params: { id: 'nope' } });
    const res = await runGet({ db, sdk, ctx });
    assert.equal(res.status, 404);
    const b = await res.json();
    assert.equal(b.success, false);
  } finally {
    await cleanup();
  }
});

test('GET error-wrap → 500', () =>
  matrix.errorWrap({ run: runGet, url: base('x'), params: { id: 'x' } }));

test('POST auth-fail → 401', () =>
  matrix.adminAuthFail({ run: runPost, url: base('x'), body: {}, params: { id: 'x' } }));

test('POST validation-fail: missing value → 422', () =>
  matrix.validationFail({
    run: runPost,
    url: base('x'),
    invalidBody: { sort_order: 1 },
    params: { id: 'x' },
  }));

test('POST happy-path seeded → 201, data.id exists', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: base(f.attrColorId),
      body: { value: 'red', sort_order: 5 },
      method: 'POST',
      params: { id: f.attrColorId },
    });
    const res = await runPost({ db, sdk, ctx });
    assert.equal(res.status, 201);
    const b = await res.json();
    assert.equal(b.success, true);
    assert.ok(b.data?.id, 'data.id should exist');
  } finally {
    await cleanup();
  }
});

test('POST error-wrap → 500', () =>
  matrix.errorWrap({
    run: runPost,
    url: base('x'),
    body: { value: 'err', sort_order: 1 },
    params: { id: 'x' },
  }));
