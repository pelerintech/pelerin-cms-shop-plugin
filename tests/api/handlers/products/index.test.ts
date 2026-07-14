import { test } from 'node:test';
import assert from 'node:assert';
import { ensureLoader } from '../../../stubs/register.mjs';
import { makeFakeSdk, makeCtx, poisonDb, unauthorizedError } from '../../helpers.ts';
import { createTestDb, seedMinimal, resetDb } from '../../../db/harness.ts';

ensureLoader();
const { runGet, runPost } = await import('../../../../src/api/shop/products/index.ts');

function jsonBody(res: Response) {
  return res.json();
}

test('GET auth-fail: requireAdmin throws 401, poison db untouched → 401', async () => {
  const sdk = makeFakeSdk({ authThrows: unauthorizedError() });
  const ctx = makeCtx({ url: 'http://localhost/api/plugins/shop/products' });
  const res = await runGet({ db: poisonDb(), sdk, ctx });
  assert.equal(res.status, 401);
  const body = await jsonBody(res);
  assert.equal(body.success, false);
});

test('GET happy-path: seeded db → 200, success, data is array', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({ url: 'http://localhost/api/plugins/shop/products?limit=5' });
    const res = await runGet({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const body = await jsonBody(res);
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.data), 'data should be an array');
  } finally {
    await cleanup();
  }
});

test('GET error-wrap: poison db, auth passes → 500', async () => {
  const sdk = makeFakeSdk();
  const ctx = makeCtx({ url: 'http://localhost/api/plugins/shop/products' });
  const res = await runGet({ db: poisonDb(), sdk, ctx });
  assert.equal(res.status, 500);
  const body = await jsonBody(res);
  assert.equal(body.success, false);
});

test('POST auth-fail: requireAdmin throws 401, poison db untouched → 401', async () => {
  const sdk = makeFakeSdk({ authThrows: unauthorizedError() });
  const ctx = makeCtx({ url: 'http://localhost/api/plugins/shop/products', body: {} });
  const res = await runPost({ db: poisonDb(), sdk, ctx });
  assert.equal(res.status, 401);
  const body = await jsonBody(res);
  assert.equal(body.success, false);
});

test('POST validation-fail: missing required fields → 422 with fields', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const sdk = makeFakeSdk();
    // Missing required name, slug, type
    const ctx = makeCtx({
      url: 'http://localhost/api/plugins/shop/products',
      body: { active: true },
    });
    const res = await runPost({ db, sdk, ctx });
    assert.equal(res.status, 422);
    const body = await jsonBody(res);
    assert.equal(body.success, false);
    assert.equal(body.error, 'Validation failed');
    assert.ok(body.fields && Object.keys(body.fields).length > 0, 'fields should be non-empty');
  } finally {
    await cleanup();
  }
});

test('POST happy-path: valid body → 201, data.id exists', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: 'http://localhost/api/plugins/shop/products',
      body: { type: 'physical', name: 'Test Product', slug: 'test-product', sku: 'TEST-PROD-1' },
    });
    const res = await runPost({ db, sdk, ctx });
    assert.equal(res.status, 201);
    const body = await jsonBody(res);
    assert.equal(body.success, true);
    assert.ok(body.data?.id, 'data.id should exist');
  } finally {
    await cleanup();
  }
});

test('POST error-wrap: poison db, auth passes, valid body → 500', async () => {
  const sdk = makeFakeSdk();
  const ctx = makeCtx({
    url: 'http://localhost/api/plugins/shop/products',
    body: { type: 'physical', name: 'Test', slug: 'test', sku: 'TEST-ERR-1' },
  });
  const res = await runPost({ db: poisonDb(), sdk, ctx });
  assert.equal(res.status, 500);
  const body = await jsonBody(res);
  assert.equal(body.success, false);
});

test('POST ignores has_variants input: column is always false (derived at read)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: 'http://localhost/api/plugins/shop/products',
      body: { type: 'physical', name: 'HV', slug: 'hv', sku: 'HV-1', has_variants: true },
    });
    const res = await runPost({ db, sdk, ctx });
    assert.equal(res.status, 201);
    const b = await jsonBody(res);
    const id = b.data.id;
    // The DB column must be false — has_variants is derived at read, never set from input.
    const { products } = await import('../../../../src/db/schema.ts');
    const { eq } = await import('drizzle-orm');
    const rows = await db.select().from(products).where(eq(products.id, id));
    assert.equal(
      rows[0].has_variants,
      false,
      'has_variants column must be false even when body sends true'
    );
  } finally {
    await cleanup();
  }
});
