import { test } from 'node:test';
import assert from 'node:assert';
import { ensureLoader } from '../../../../../stubs/register.mjs';
import { matrix } from '../../../_matrix.ts';
import { createTestDb, seedMinimal } from '../../../../../db/harness.ts';
import { makeFakeSdk, makeCtx } from '../../../../helpers.ts';

ensureLoader();
const { runDelete } = await import(
  '../../../../../../src/api/shop/products/[id]/attributes/[assignmentId].ts'
);

const URL = (id: string, aid: string) =>
  `http://localhost/api/plugins/shop/products/${id}/attributes/${aid}`;

test('DELETE auth-fail → 401', () =>
  matrix.adminAuthFail({
    run: runDelete,
    url: URL('x', 'y'),
    params: { id: 'x', assignmentId: 'y' },
  }));

test('DELETE happy-path → 200 (field assignment, no variants)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    // assignSimpleBrandId is a field-role assignment on the simple product
    // (simple product has no variants) → delete succeeds.
    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: URL(f.simpleProductId, f.assignSimpleBrandId),
      method: 'DELETE',
      params: { id: f.simpleProductId, assignmentId: f.assignSimpleBrandId },
    });
    const res = await runDelete({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await res.json();
    assert.equal(b.success, true);
  } finally {
    await cleanup();
  }
});

test('DELETE conflict: dimension with variants → 409', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    // assignVariantColorId is a dimension on the variant product which HAS
    // variants → has_variants conflict (409).
    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: URL(f.variantProductId, f.assignVariantColorId),
      method: 'DELETE',
      params: { id: f.variantProductId, assignmentId: f.assignVariantColorId },
    });
    const res = await runDelete({ db, sdk, ctx });
    assert.equal(res.status, 409);
    const b = await res.json();
    assert.equal(b.success, false);
  } finally {
    await cleanup();
  }
});

test('DELETE error-wrap → 500', () =>
  matrix.errorWrap({
    run: runDelete,
    url: URL('x', 'y'),
    params: { id: 'x', assignmentId: 'y' },
  }));
