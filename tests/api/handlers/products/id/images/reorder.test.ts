import { test } from 'node:test';
import assert from 'node:assert';
import { ensureLoader } from '../../../../../stubs/register.mjs';
import { matrix } from '../../../_matrix.ts';
import { createTestDb, seedMinimal } from '../../../../../db/harness.ts';
import { makeFakeSdk, makeCtx } from '../../../../helpers.ts';
import { createProductImage } from '../../../../../../src/lib/data/products.ts';

ensureLoader();
const { runPut } = await import(
  '../../../../../../src/api/shop/products/[id]/images/reorder.ts'
);

const URL = (id: string) =>
  `http://localhost/api/plugins/shop/products/${id}/images/reorder`;

test('PUT auth-fail → 401', () =>
  matrix.adminAuthFail({
    run: runPut,
    url: URL('x'),
    body: { image_ids: [] },
    params: { id: 'x' },
  }));

test('PUT validation-fail: missing image_ids → 422', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: URL('x'),
      body: { not_ids: true },
      method: 'PUT',
      params: { id: 'x' },
    });
    const res = await runPut({ db, sdk, ctx });
    assert.equal(res.status, 422);
    const b = await res.json();
    assert.equal(b.success, false);
  } finally {
    await cleanup();
  }
});

test('PUT happy-path → 200', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const a = await createProductImage(db, { product_id: f.simpleProductId, url: 'http://e.com/a.png', sort_order: 0 });
    const b2 = await createProductImage(db, { product_id: f.simpleProductId, url: 'http://e.com/b.png', sort_order: 1 });
    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: URL(f.simpleProductId),
      body: { image_ids: [b2, a] },
      method: 'PUT',
      params: { id: f.simpleProductId },
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
    url: URL('x'),
    body: { image_ids: ['x'] },
    params: { id: 'x' },
  }));
