import { test } from 'node:test';
import assert from 'node:assert';
import { ensureLoader } from '../../../stubs/register.mjs';
import { matrix, createTestDb, seedMinimal, makeFakeSdk, makeCtx } from '../_matrix.ts';
import { insertFixture } from '../../../db/harness.ts';

ensureLoader();
const { runGet, runPut, runDelete } = await import('../../../../src/api/shop/attributes/[id].ts');

const base = 'http://localhost/api/plugins/shop/attributes';

test('GET [id] auth-fail → 401', () =>
  matrix.adminAuthFail({ run: runGet, url: `${base}/x`, params: { id: 'x' } }));

test('GET [id] happy-path seeded → 200, data.id === attrId', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({ url: `${base}/${f.attrColorId}`, params: { id: f.attrColorId } });
    const res = await runGet({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await res.json();
    assert.equal(b.success, true);
    assert.equal(b.data.id, f.attrColorId);
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
      url: `${base}/${f.attrColorId}`,
      body: { name: 'Culoare Noua' },
      method: 'PUT',
      params: { id: f.attrColorId },
    });
    const res = await runPut({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await res.json();
    assert.equal(b.success, true);
    assert.equal(b.data.id, f.attrColorId);
  } finally {
    await cleanup();
  }
});

test('PUT [id] not-found → 404 (AttributeUpdateConflictError not_found)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: `${base}/nope`,
      body: { name: 'X' },
      method: 'PUT',
      params: { id: 'nope' },
    });
    const res = await runPut({ db, sdk, ctx });
    assert.equal(res.status, 404);
    const b = await res.json();
    assert.equal(b.success, false);
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

test('DELETE [id] happy-path (no assignments) → 200', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    // Insert an attribute with no assignments so delete succeeds
    const freeId = crypto.randomUUID();
    await insertFixture(db, 'product_attributes', {
      id: freeId,
      name: 'Free',
      type: 'text',
      sort_order: 50,
    });
    const sdk = makeFakeSdk();
    const ctx = makeCtx({ url: `${base}/${freeId}`, method: 'DELETE', params: { id: freeId } });
    const res = await runDelete({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await res.json();
    assert.equal(b.success, true);
  } finally {
    await cleanup();
  }
});

test('DELETE [id] conflict (has assignments) → 409', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: `${base}/${f.attrColorId}`,
      method: 'DELETE',
      params: { id: f.attrColorId },
    });
    const res = await runDelete({ db, sdk, ctx });
    assert.equal(res.status, 409);
    const b = await res.json();
    assert.equal(b.success, false);
  } finally {
    await cleanup();
  }
});

test('DELETE [id] error-wrap → 500', () =>
  matrix.errorWrap({ run: runDelete, url: `${base}/x`, params: { id: 'x' } }));
