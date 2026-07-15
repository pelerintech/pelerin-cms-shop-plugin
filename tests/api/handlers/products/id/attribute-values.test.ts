import { test } from 'node:test';
import assert from 'node:assert';
import { ensureLoader } from '../../../../stubs/register.mjs';
import { matrix } from '../../_matrix.ts';
import { createTestDb, seedMinimal } from '../../../../db/harness.ts';
import { makeFakeSdk, makeCtx } from '../../../helpers.ts';

ensureLoader();
const { runGet, runPut } =
  await import('../../../../../src/api/shop/products/[id]/attribute-values.ts');

const URL = (id: string) => `http://localhost/api/plugins/shop/products/${id}/attribute-values`;

test('GET auth-fail → 401', () =>
  matrix.adminAuthFail({ run: runGet, url: URL('x'), params: { id: 'x' } }));

test('GET happy-path → 200, data is array', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({ url: URL(f.simpleProductId), params: { id: f.simpleProductId } });
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

test('PUT auth-fail → 401', () =>
  matrix.adminAuthFail({
    run: runPut,
    url: URL('x'),
    body: { values: [] },
    params: { id: 'x' },
  }));

test('PUT validation-fail: missing values array → 422', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: URL('x'),
      body: { not_values: true },
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
    // Upsert a text value for the simple product's brand assignment.
    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: URL(f.simpleProductId),
      body: {
        values: [
          {
            assignment_id: f.assignSimpleBrandId,
            option_id: null,
            value_text: 'New Brand Co',
            value_number: null,
            value_boolean: null,
          },
        ],
      },
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
    body: {
      values: [
        {
          assignment_id: 'a',
          option_id: null,
          value_text: 'x',
          value_number: null,
          value_boolean: null,
        },
      ],
    },
    params: { id: 'x' },
  }));
