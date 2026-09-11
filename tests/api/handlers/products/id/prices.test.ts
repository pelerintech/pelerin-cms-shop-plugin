import { test } from 'node:test';
import assert from 'node:assert';
import { ensureLoader } from '../../../../stubs/register.mjs';
import { matrix } from '../../_matrix.ts';
import { makeFakeSdk, makeCtx } from '../../../helpers.ts';
import { createTestDb, seedMinimal } from '../../../../db/harness.ts';
import {
  listPricesForProduct,
  listPricesForVariant,
} from '../../../../../src/lib/data/products.ts';

ensureLoader();
const { runGet, runPost, runPut, runDelete } =
  await import('../../../../../src/api/shop/products/[id]/prices.ts');

const base = 'http://localhost/api/plugins/shop/products/x/prices';

test('GET auth-fail → 401', () => matrix.adminAuthFail({ run: runGet, url: base }));

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

test('POST auth-fail → 401', () => matrix.adminAuthFail({ run: runPost, url: base, body: {} }));

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
  matrix.errorWrap({
    run: runPost,
    url: base,
    body: { variant_id: 'x', currency: 'RON', price_net: 10 },
    params: { id: 'x' },
  }));

test('PUT auth-fail → 401', () => matrix.adminAuthFail({ run: runPut, url: base, body: {} }));

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
  matrix.errorWrap({
    run: runPut,
    url: base,
    body: { product_id: 'x', currency: 'RON', price_net: 10 },
    params: { id: 'x' },
  }));

test('DELETE auth-fail → 401', () => matrix.adminAuthFail({ run: runDelete, url: base }));

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

// ── Money-unit boundary: major (form input) → minor (storage) ──

test('POST converts major price_net to minor on store (product)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const sdk = makeFakeSdk();
    // merchant typed 1.00 RON → major 1; must be stored as minor 100.
    const body = { currency: 'RON', price_net: 1 };
    const ctx = makeCtx({ url: base, body, params: { id: f.simpleProductId } });
    const res = await runPost({ db, sdk, ctx });
    assert.equal(res.status, 201);
    const prices = await listPricesForProduct(db, f.simpleProductId);
    const p = prices.find((pr) => pr.currency === 'RON');
    assert.ok(p, 'RON price should exist');
    assert.equal(p.price_net, 100, 'price_net must be stored in minor units (1.00 → 100)');
  } finally {
    await cleanup();
  }
});

test('POST converts major price_net to minor on store (variant)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const sdk = makeFakeSdk();
    const body = { variant_id: f.variantBlack128Id, currency: 'RON', price_net: 50 };
    const ctx = makeCtx({ url: base, body, params: { id: f.variantProductId } });
    const res = await runPost({ db, sdk, ctx });
    assert.equal(res.status, 201);
    const prices = await listPricesForVariant(db, f.variantBlack128Id);
    const p = prices.find((pr) => pr.currency === 'RON');
    assert.ok(p, 'RON variant price should exist');
    assert.equal(p.price_net, 5000, 'price_net must be stored in minor units (50.00 → 5000)');
  } finally {
    await cleanup();
  }
});

test('PUT is not double-converted (single x100)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const sdk = makeFakeSdk();
    // update the existing seeded RON 5000 price to 50.00 (sends 50) → 5000, not 500000.
    const body = { product_id: f.simpleProductId, currency: 'RON', price_net: 50 };
    const ctx = makeCtx({ url: base, body, params: { id: f.simpleProductId } });
    const res = await runPut({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const prices = await listPricesForProduct(db, f.simpleProductId);
    const p = prices.find((pr) => pr.currency === 'RON');
    assert.equal(p?.price_net, 5000, 'must be 5000 (50.00), not 500000');
  } finally {
    await cleanup();
  }
});

test('imported and manually-set prices agree (49.99 → 4999 both paths)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const sdk = makeFakeSdk();
    // Path 1: manual admin form for BOOK-001 with the merchant typing 49.99 RON.
    const formCtx = makeCtx({
      url: base,
      body: { currency: 'RON', price_net: 49.99 },
      params: { id: f.simpleProductId },
    });
    const formRes = await runPost({ db, sdk, ctx: formCtx });
    assert.equal(formRes.status, 201);
    let prices = await listPricesForProduct(db, f.simpleProductId);
    let ron = prices.find((p) => p.currency === 'RON');
    assert.equal(ron?.price_net, 4999, 'manual form must store 49.99 RON as minor 4999');

    // Path 2: CSV import of the same product/currency with 49.99 RON.
    const { importPrices } = await import('../../../../../src/lib/import-prices.ts');
    const importRes = await importPrices(db, [
      { sku: 'BOOK-001', currency: 'RON', price_net: '49.99' },
    ]);
    assert.strictEqual(importRes.updated, 1);
    prices = await listPricesForProduct(db, f.simpleProductId);
    ron = prices.find((p) => p.currency === 'RON');
    assert.equal(ron?.price_net, 4999, 'CSV import must store 49.99 RON as minor 4999');
    // Both paths land on the same minor value (drift → mismatch → 100x-class bug).
    assert.equal(ron?.price_net, 4999, 'imported and manual prices must agree in minor units');
  } finally {
    await cleanup();
  }
});
