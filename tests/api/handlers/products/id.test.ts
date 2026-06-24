import { test } from 'node:test';
import assert from 'node:assert';
import { ensureLoader } from '../../../stubs/register.mjs';
import { matrix } from '../_matrix.ts';
import { makeFakeSdk, makeCtx, poisonDb, unauthorizedError } from '../../helpers.ts';
import { createTestDb, seedMinimal } from '../../../db/harness.ts';

ensureLoader();
const { runGet, runPut, runDelete } = await import('../../../../src/api/shop/products/[id].ts');

const base = 'http://localhost/api/plugins/shop/products/';

test('GET auth-fail → 401', () =>
  matrix.adminAuthFail({ run: runGet, url: base + 'x' }));

test('GET happy-path → 200, data.id matches', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({ url: base + f.simpleProductId, params: { id: f.simpleProductId } });
    const res = await runGet({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await res.json();
    assert.equal(b.success, true);
    assert.equal(b.data.id, f.simpleProductId);
  } finally {
    await cleanup();
  }
});

test('GET happy-path 404: unknown id → 404', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({ url: base + 'nope', params: { id: 'nope' } });
    const res = await runGet({ db, sdk, ctx });
    assert.equal(res.status, 404);
    const b = await res.json();
    assert.equal(b.success, false);
  } finally {
    await cleanup();
  }
});

test('GET error-wrap → 500', () =>
  matrix.errorWrap({ run: runGet, url: base + 'x', params: { id: 'x' } }));

test('PUT auth-fail → 401', () =>
  matrix.adminAuthFail({ run: runPut, url: base + 'x', body: {} }));

test('PUT validation-fail → 422', () =>
  matrix.validationFail({ run: runPut, url: base + 'x', invalidBody: { slug: '' } }));

test('PUT happy-path → 200, data.id matches', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({ url: base + f.simpleProductId, body: { name: 'Updated Name' }, params: { id: f.simpleProductId } });
    const res = await runPut({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await res.json();
    assert.equal(b.success, true);
    assert.equal(b.data.id, f.simpleProductId);
  } finally {
    await cleanup();
  }
});

test('PUT error-wrap → 500', () =>
  matrix.errorWrap({ run: runPut, url: base + 'x', body: { name: 'X' }, params: { id: 'x' } }));

test('PUT ignores has_variants input: column is never written from body (derived at read)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({ url: base + f.simpleProductId, body: { has_variants: true }, params: { id: f.simpleProductId } });
    const res = await runPut({ db, sdk, ctx });
    assert.equal(res.status, 200);
    // The DB column must remain false — has_variants is never written from input.
    const { products } = await import('../../../../src/db/schema.ts');
    const { eq } = await import('drizzle-orm');
    const rows = await db.select().from(products).where(eq(products.id, f.simpleProductId));
    assert.equal(rows[0].has_variants, false, 'has_variants column must NOT be set to true from a PUT body');
  } finally {
    await cleanup();
  }
});

test('DELETE auth-fail → 401', () =>
  matrix.adminAuthFail({ run: runDelete, url: base + 'x' }));

test('DELETE happy-path → 200', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({ url: base + f.simpleProductId, params: { id: f.simpleProductId } });
    const res = await runDelete({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await res.json();
    assert.equal(b.success, true);
  } finally {
    await cleanup();
  }
});

test('DELETE error-wrap → 500', () =>
  matrix.errorWrap({ run: runDelete, url: base + 'x', params: { id: 'x' } }));
