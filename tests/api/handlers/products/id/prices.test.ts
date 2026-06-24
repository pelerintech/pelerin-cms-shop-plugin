import { test } from 'node:test';
import assert from 'node:assert';
import { ensureLoader } from '../../../../stubs/register.mjs';
import { matrix } from '../../_matrix.ts';
import { makeFakeSdk, makeCtx } from '../../../helpers.ts';
import { createTestDb, seedMinimal } from '../../../../db/harness.ts';

ensureLoader();
const { runGet, runPost, runPut, runDelete } = await import('../../../../../src/api/shop/products/[id]/prices.ts');

const base = 'http://localhost/api/plugins/shop/products/x/prices';

test('GET auth-fail → 401', () =>
  matrix.adminAuthFail({ run: runGet, url: base }));

test('GET happy-path → 200, data is array', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({ url: base, params: { id: f.variantProductId } });
    const res = await runGet({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await res.json();
    assert.equal(b.success, true);
    assert.ok(Array.isArray(b.data), 'data should be array');
  } finally {
    await cleanup();
  }
});

test('GET error-wrap → 500', () =>
  matrix.errorWrap({ run: runGet, url: base, params: { id: 'x' } }));

test('POST auth-fail → 401', () =>
  matrix.adminAuthFail({ run: runPost, url: base, body: {} }));

// POST has no Zod validation → skip validation-fail
test('POST happy-path → 201, data echoes body', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const sdk = makeFakeSdk();
    const body = { variant_id: f.variantBlack128Id, currency: 'USD', price_net: 9999 };
    const ctx = makeCtx({ url: base, body, params: { id: f.variantProductId } });
    const res = await runPost({ db, sdk, ctx });
    assert.equal(res.status, 201);
    const b = await res.json();
    assert.equal(b.success, true);
    assert.equal(b.data.currency, 'USD');
  } finally {
    await cleanup();
  }
});

test('POST error-wrap → 500', () =>
  matrix.errorWrap({ run: runPost, url: base, body: { variant_id: 'x', currency: 'RON', price_net: 10 }, params: { id: 'x' } }));

test('PUT auth-fail → 401', () =>
  matrix.adminAuthFail({ run: runPut, url: base, body: {} }));

test('PUT validation-fail → 422', () =>
  matrix.validationFail({
    run: runPut,
    url: base,
    invalidBody: { currency: 'RON', price_net: 10 }, // neither product_id nor variant_id → fails superRefine
  }));

test('PUT happy-path → 200, data is array', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const sdk = makeFakeSdk();
    const body = { product_id: f.simpleProductId, currency: 'RON', price_net: 1234 };
    const ctx = makeCtx({ url: base, body, params: { id: f.simpleProductId } });
    const res = await runPut({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await res.json();
    assert.equal(b.success, true);
    assert.ok(Array.isArray(b.data), 'data should be array');
  } finally {
    await cleanup();
  }
});

test('PUT error-wrap → 500', () =>
  matrix.errorWrap({ run: runPut, url: base, body: { product_id: 'x', currency: 'RON', price_net: 10 }, params: { id: 'x' } }));

test('DELETE auth-fail → 401', () =>
  matrix.adminAuthFail({ run: runDelete, url: base }));

test('DELETE happy-path → 200 (no id param)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({ url: base, params: { id: f.simpleProductId } });
    const res = await runDelete({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await res.json();
    assert.equal(b.success, true);
  } finally {
    await cleanup();
  }
});

test('DELETE happy-path with ?id → 200', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({ url: base + '?id=anything', params: { id: f.simpleProductId } });
    const res = await runDelete({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await res.json();
    assert.equal(b.success, true);
  } finally {
    await cleanup();
  }
});

test('DELETE error-wrap → 500', () =>
  matrix.errorWrap({ run: runDelete, url: base + '?id=x', params: { id: 'x' } }));
