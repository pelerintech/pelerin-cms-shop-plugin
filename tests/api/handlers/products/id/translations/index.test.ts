import { test } from 'node:test';
import assert from 'node:assert';
import { ensureLoader } from '../../../../../stubs/register.mjs';
import { matrix } from '../../../_matrix.ts';
import { createTestDb, seedMinimal } from '../../../../../db/harness.ts';
import { makeFakeSdk, makeCtx } from '../../../../helpers.ts';

ensureLoader();
const { runGet, runPut } =
  await import('../../../../../../src/api/shop/products/[id]/translations/index.ts');

const URL = (id: string) => `http://localhost/api/plugins/shop/products/${id}/translations`;

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
    body: { translations: [] },
    params: { id: 'x' },
  }));

test('PUT validation-fail: missing translations array → 422', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: URL('x'),
      body: { not_translations: true },
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
    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: URL(f.simpleProductId),
      body: {
        translations: [
          {
            locale: 'de',
            name: 'Programmierbuch',
            description: null,
            slug: 'programmierbuch',
            label: null,
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
      translations: [{ locale: 'de', name: 'X', description: null, slug: 'x', label: null }],
    },
    params: { id: 'x' },
  }));
