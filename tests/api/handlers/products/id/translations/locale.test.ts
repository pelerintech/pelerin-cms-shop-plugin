import { test } from 'node:test';
import assert from 'node:assert';
import { ensureLoader } from '../../../../../stubs/register.mjs';
import { matrix } from '../../../_matrix.ts';
import { createTestDb, seedMinimal } from '../../../../../db/harness.ts';
import { makeFakeSdk, makeCtx } from '../../../../helpers.ts';

ensureLoader();
const { runGet, runPut, runDelete } = await import(
  '../../../../../../src/api/shop/products/[id]/translations/[locale].ts'
);

const URL = (id: string, locale: string) =>
  `http://localhost/api/plugins/shop/products/${id}/translations/${locale}`;

test('GET auth-fail → 401', () =>
  matrix.adminAuthFail({
    run: runGet,
    url: URL('x', 'en'),
    params: { id: 'x', locale: 'en' },
  }));

test('GET happy-path → 200', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: URL(f.simpleProductId, 'en'),
      params: { id: f.simpleProductId, locale: 'en' },
    });
    const res = await runGet({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await res.json();
    assert.equal(b.success, true);
  } finally {
    await cleanup();
  }
});

test('GET error-wrap → 500', () =>
  matrix.errorWrap({
    run: runGet,
    url: URL('x', 'en'),
    params: { id: 'x', locale: 'en' },
  }));

test('PUT auth-fail → 401', () =>
  matrix.adminAuthFail({
    run: runPut,
    url: URL('x', 'en'),
    body: { name: 'X' },
    params: { id: 'x', locale: 'en' },
  }));

test('PUT happy-path → 200', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: URL(f.simpleProductId, 'de'),
      body: { name: 'Programmierbuch', description: null, slug: 'programmierbuch', label: null },
      method: 'PUT',
      params: { id: f.simpleProductId, locale: 'de' },
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
    url: URL('x', 'en'),
    body: { name: 'X' },
    params: { id: 'x', locale: 'en' },
  }));

test('DELETE auth-fail → 401', () =>
  matrix.adminAuthFail({
    run: runDelete,
    url: URL('x', 'en'),
    params: { id: 'x', locale: 'en' },
  }));

test('DELETE happy-path → 200', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    // 'en' translation exists for simpleProductId in seed
    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: URL(f.simpleProductId, 'en'),
      method: 'DELETE',
      params: { id: f.simpleProductId, locale: 'en' },
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
    url: URL('x', 'en'),
    params: { id: 'x', locale: 'en' },
  }));
