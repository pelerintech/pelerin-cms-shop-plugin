import { test } from 'node:test';
import assert from 'node:assert';
import { ensureLoader } from '../../../../../stubs/register.mjs';
import { matrix } from '../../../_matrix.ts';
import { createTestDb, seedMinimal } from '../../../../../db/harness.ts';
import { makeFakeSdk, makeCtx } from '../../../../helpers.ts';

ensureLoader();
const { runGet, runPost } =
  await import('../../../../../../src/api/shop/products/[id]/attributes/index.ts');

const URL = (id: string) => `http://localhost/api/plugins/shop/products/${id}/attributes`;

test('GET auth-fail → 401', () =>
  matrix.adminAuthFail({ run: runGet, url: URL('x'), params: { id: 'x' } }));

test('GET happy-path → 200, data is array', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({ url: URL(f.variantProductId), params: { id: f.variantProductId } });
    const res = await runGet({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await res.json();
    assert.equal(b.success, true);
    assert.ok(Array.isArray(b.data), 'data should be an array');
  } finally {
    await cleanup();
  }
});

test('GET error-wrap → 500', () =>
  matrix.errorWrap({ run: runGet, url: URL('x'), params: { id: 'x' } }));

test('POST auth-fail → 401', () =>
  matrix.adminAuthFail({
    run: runPost,
    url: URL('x'),
    body: { attribute_id: 'a', role: 'field' },
    params: { id: 'x' },
  }));

test('POST validation-fail: invalid role → 422 with fields', () =>
  matrix.validationFail({
    run: runPost,
    url: URL('x'),
    invalidBody: { attribute_id: 'a', role: 'bogus' },
    params: { id: 'x' },
  }));

test('POST happy-path → 201, data.id exists', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    // Assign attrColorId (not yet assigned to simple product) as a field
    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: URL(f.simpleProductId),
      body: { attribute_id: f.attrColorId, role: 'field', sort_order: 5, offered_option_ids: [] },
      method: 'POST',
      params: { id: f.simpleProductId },
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

test('POST conflict: duplicate assignment → 409', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    // attrBrandId is already assigned to simple product → duplicate
    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: URL(f.simpleProductId),
      body: { attribute_id: f.attrBrandId, role: 'field', sort_order: 9, offered_option_ids: [] },
      method: 'POST',
      params: { id: f.simpleProductId },
    });
    const res = await runPost({ db, sdk, ctx });
    assert.equal(res.status, 409);
    const b = await res.json();
    assert.equal(b.success, false);
  } finally {
    await cleanup();
  }
});

test('POST accepts dimension with no offered_option_ids (one-click assignment)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const sdk = makeFakeSdk();
    // Assign Color as a dimension to the simple product, NO offered_option_ids.
    const ctx = makeCtx({
      url: URL(f.simpleProductId),
      body: { attribute_id: f.attrColorId, role: 'dimension', sort_order: 5 },
      method: 'POST',
      params: { id: f.simpleProductId },
    });
    const res = await runPost({ db, sdk, ctx });
    assert.equal(res.status, 201);
    const b = await res.json();
    assert.equal(b.success, true);
    assert.ok(b.data?.id, 'dimension assignment with no offered_option_ids must succeed');
  } finally {
    await cleanup();
  }
});

test('POST error-wrap → 500', () =>
  matrix.errorWrap({
    run: runPost,
    url: URL('x'),
    body: { attribute_id: 'a', role: 'field', sort_order: 0, offered_option_ids: [] },
    params: { id: 'x' },
  }));
