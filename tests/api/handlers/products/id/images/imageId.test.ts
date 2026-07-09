import { test } from 'node:test';
import assert from 'node:assert';
import { ensureLoader } from '../../../../../stubs/register.mjs';
import { matrix } from '../../../_matrix.ts';
import { createTestDb, seedMinimal, insertFixture } from '../../../../../db/harness.ts';
import { makeFakeSdk, makeCtx, poisonDb } from '../../../../helpers.ts';
import { product_images } from '../../../../../db/harness.ts';
import { eq } from 'drizzle-orm';

ensureLoader();
const { runDelete } = await import(
  '../../../../../../src/api/shop/products/[id]/images/[imageId].ts'
);

const URL = (id: string, imgId: string) =>
  `http://localhost/api/plugins/shop/products/${id}/images/${imgId}`;

test('DELETE auth-fail → 401, poison db + storage never called', () =>
  matrix.adminAuthFail({
    run: runDelete,
    url: URL('x', 'y'),
    params: { id: 'x', imageId: 'y' },
  }));

test('DELETE happy-path → 200, sdk.storage.delete called with row key, row removed', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    await insertFixture(db, 'product_images', { id: 'img-x', product_id: f.simpleProductId, variant_id: null, url: 'products/p1/x.jpg', alt: null, sort_order: 0, mime: 'image/jpeg', size: 10, width: null, height: null, original_filename: 'x.jpg' });
    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: URL(f.simpleProductId, 'img-x'),
      method: 'DELETE',
      params: { id: f.simpleProductId, imageId: 'img-x' },
    });
    const res = await runDelete({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await res.json();
    assert.equal(b.success, true);
    assert.deepStrictEqual(sdk.storage.deleteCalls, ['products/p1/x.jpg'], 'storage.delete must be called with the row key');
    const after = await db.select().from(product_images).where(eq(product_images.id, 'img-x'));
    assert.strictEqual(after.length, 0, 'row must be removed');
  } finally {
    await cleanup();
  }
});

test('DELETE storage throws → 5xx AND row still present (bytes-first ordering)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    await insertFixture(db, 'product_images', { id: 'img-y', product_id: f.simpleProductId, variant_id: null, url: 'products/p1/y.jpg', alt: null, sort_order: 0, mime: 'image/jpeg', size: 10, width: null, height: null, original_filename: 'y.jpg' });
    // Fake sdk whose storage.delete rejects
    const sdk = makeFakeSdk();
    sdk.storage.delete = async (_key: string) => { throw new Error('storage delete boom'); };
    const ctx = makeCtx({
      url: URL(f.simpleProductId, 'img-y'),
      method: 'DELETE',
      params: { id: f.simpleProductId, imageId: 'img-y' },
    });
    const res = await runDelete({ db, sdk, ctx });
    assert.ok(res.status >= 500, 'storage failure must produce 5xx');
    const b = await res.json();
    assert.equal(b.success, false);
    // Row survives for retry (bytes-first → row not removed when delete fails)
    const after = await db.select().from(product_images).where(eq(product_images.id, 'img-y'));
    assert.strictEqual(after.length, 1, 'row must survive when byte delete fails');
  } finally {
    await cleanup();
  }
});

test('DELETE non-existent id → 200, no storage call', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: URL('p', 'no-such-id'),
      method: 'DELETE',
      params: { id: 'p', imageId: 'no-such-id' },
    });
    const res = await runDelete({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await res.json();
    assert.equal(b.success, true);
    assert.strictEqual(sdk.storage.deleteCalls.length, 0, 'storage.delete must not be called for missing row');
  } finally {
    await cleanup();
  }
});

test('DELETE error-wrap → 500', () =>
  matrix.errorWrap({
    run: runDelete,
    url: URL('x', 'y'),
    params: { id: 'x', imageId: 'y' },
  }));
