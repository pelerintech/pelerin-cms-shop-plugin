import { test } from 'node:test';
import { ensureLoader } from '../../../../../stubs/register.mjs';
import { matrix, assert, createTestDb, seedMinimal, makeFakeSdk, makeCtx } from '../../../_matrix.ts';

ensureLoader();
const { runPost } = await import('../../../../../../src/api/shop/public/cart/items/index.ts');

const URL = 'http://localhost/api/plugins/shop/public/cart/items';

test('POST validation-fail → 422', () =>
  matrix.validationFail({ run: runPost, url: URL, invalidBody: { quantity: 0 } }));

test('POST happy-path → 200, adds item to fresh guest cart', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const sdk = makeFakeSdk({ user: null });
    const ctx = makeCtx({
      url: URL,
      method: 'POST',
      body: { product_id: f.simpleProductId, quantity: 2 },
    });
    const res = await runPost({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await res.json();
    assert.equal(b.success, true);
    assert.equal(b.data.product_id, f.simpleProductId);
    assert.equal(b.data.quantity, 2);
  } finally {
    await cleanup();
  }
});

test('POST error-wrap → 500', () =>
  matrix.errorWrap({
    run: runPost,
    url: URL,
    method: 'POST',
    body: { product_id: 'p', quantity: 1 },
  }));
