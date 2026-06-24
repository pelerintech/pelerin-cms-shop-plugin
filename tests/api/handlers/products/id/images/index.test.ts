import { test } from 'node:test';
import assert from 'node:assert';
import { ensureLoader } from '../../../../../stubs/register.mjs';
import { matrix } from '../../../_matrix.ts';
import { createTestDb, seedMinimal } from '../../../../../db/harness.ts';
import { makeFakeSdk, makeCtx, poisonDb } from '../../../../helpers.ts';

ensureLoader();
const { runGet, runPost } = await import(
  '../../../../../../src/api/shop/products/[id]/images/index.ts'
);

const URL = (id: string) =>
  `http://localhost/api/plugins/shop/products/${id}/images`;

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

test('POST auth-fail → 401', () =>
  matrix.adminAuthFail({
    run: runPost,
    url: URL('x'),
    body: { url: 'http://example.com/i.png' },
    params: { id: 'x' },
  }));

test('POST happy-path → 201, data.id exists', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: URL(f.simpleProductId),
      body: { url: 'http://example.com/img.png', alt: 'img', sort_order: 0 },
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

test('POST error-wrap → 500', () =>
  matrix.errorWrap({
    run: runPost,
    url: URL('x'),
    body: { url: 'http://example.com/i.png' },
    params: { id: 'x' },
  }));
