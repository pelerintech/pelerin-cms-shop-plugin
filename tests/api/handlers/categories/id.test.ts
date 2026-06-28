import { test } from 'node:test';
import assert from 'node:assert';
import { ensureLoader } from '../../../stubs/register.mjs';
import { matrix, createTestDb, seedMinimal, makeFakeSdk, makeCtx } from '../_matrix.ts';
import { categories } from '../../../db/harness.ts';

ensureLoader();
const { runGet, runPut, runDelete } = await import(
  '../../../../src/api/shop/categories/[id].ts'
);

const base = 'http://localhost/api/plugins/shop/categories';

test('GET [id] auth-fail → 401', () =>
  matrix.adminAuthFail({ run: runGet, url: `${base}/x`, params: { id: 'x' } }));

test('GET [id] happy-path seeded → 200, data.id === catId', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({ url: `${base}/${f.categoryBooksId}`, params: { id: f.categoryBooksId } });
    const res = await runGet({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await res.json();
    assert.equal(b.success, true);
    assert.equal(b.data.id, f.categoryBooksId);
  } finally {
    await cleanup();
  }
});

test('GET [id] not-found → 404', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const sdk = makeFakeSdk();
    const ctx = makeCtx({ url: `${base}/nope`, params: { id: 'nope' } });
    const res = await runGet({ db, sdk, ctx });
    assert.equal(res.status, 404);
    const b = await res.json();
    assert.equal(b.success, false);
  } finally {
    await cleanup();
  }
});

test('GET [id] error-wrap → 500', () =>
  matrix.errorWrap({ run: runGet, url: `${base}/x`, params: { id: 'x' } }));

test('PUT [id] auth-fail → 401', () =>
  matrix.adminAuthFail({ run: runPut, url: `${base}/x`, body: {}, params: { id: 'x' } }));

test('PUT [id] validation-fail → 422', () =>
  matrix.validationFail({
    run: runPut,
    url: `${base}/x`,
    invalidBody: { sort_order: 'not-a-number' },
    params: { id: 'x' },
  }));

test('PUT [id] happy-path seeded → 200', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: `${base}/${f.categoryBooksId}`,
      body: { name: 'Updated Cat' },
      method: 'PUT',
      params: { id: f.categoryBooksId },
    });
    const res = await runPut({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await res.json();
    assert.equal(b.success, true);
    assert.equal(b.data.id, f.categoryBooksId);
  } finally {
    await cleanup();
  }
});

test('PUT [id] error-wrap → 500', () =>
  matrix.errorWrap({
    run: runPut,
    url: `${base}/x`,
    body: { name: 'Err' },
    params: { id: 'x' },
  }));

test('DELETE [id] auth-fail → 401', () =>
  matrix.adminAuthFail({ run: runDelete, url: `${base}/x`, params: { id: 'x' } }));

test('DELETE [id] happy-path seeded → 200', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const sdk = makeFakeSdk();
    // Seeded categories have products assigned (the r17 guard refuses those), so
    // create a fresh leaf category with no children/products to delete.
    const leafId = crypto.randomUUID();
    await db.insert(categories).values({
      id: leafId, parent_id: null, name: 'Leaf', description: null,
      slug: 'leaf-' + leafId.slice(0, 8), sort_order: 99, created_at: null, updated_at: null,
    });
    const ctx = makeCtx({ url: `${base}/${leafId}`, method: 'DELETE', params: { id: leafId } });
    const res = await runDelete({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await res.json();
    assert.equal(b.success, true);
  } finally {
    await cleanup();
  }
});

test('DELETE [id] error-wrap → 500', () =>
  matrix.errorWrap({ run: runDelete, url: `${base}/x`, params: { id: 'x' } }));
