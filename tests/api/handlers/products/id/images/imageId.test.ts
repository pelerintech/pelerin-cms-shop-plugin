import { test } from 'node:test';
import assert from 'node:assert';
import { ensureLoader } from '../../../../../stubs/register.mjs';
import { matrix } from '../../../_matrix.ts';
import { createTestDb, seedMinimal } from '../../../../../db/harness.ts';
import { makeFakeSdk, makeCtx } from '../../../../helpers.ts';
import { createProductImage } from '../../../../../../src/lib/data/products.ts';

ensureLoader();
const { runDelete } = await import(
  '../../../../../../src/api/shop/products/[id]/images/[imageId].ts'
);

const URL = (id: string, imgId: string) =>
  `http://localhost/api/plugins/shop/products/${id}/images/${imgId}`;

test('DELETE auth-fail → 401', () =>
  matrix.adminAuthFail({
    run: runDelete,
    url: URL('x', 'y'),
    params: { id: 'x', imageId: 'y' },
  }));

test('DELETE happy-path → 200', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const imgId = await createProductImage(db, {
      product_id: f.simpleProductId,
      url: 'http://example.com/i.png',
      sort_order: 0,
    });
    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: URL(f.simpleProductId, imgId),
      method: 'DELETE',
      params: { id: f.simpleProductId, imageId: imgId },
    });
    const res = await runDelete({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await res.json();
    assert.equal(b.success, true);
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
