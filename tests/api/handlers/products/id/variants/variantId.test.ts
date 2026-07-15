import { test } from 'node:test';
import assert from 'node:assert';
import { ensureLoader } from '../../../../../stubs/register.mjs';
import { matrix } from '../../../_matrix.ts';
import { makeFakeSdk, makeCtx } from '../../../../helpers.ts';
import { createTestDb, seedMinimal } from '../../../../../db/harness.ts';

ensureLoader();
const { runPut, runDelete } =
  await import('../../../../../../src/api/shop/products/[id]/variants/[variantId].ts');

const base = 'http://localhost/api/plugins/shop/products/x/variants/y';

test('PUT auth-fail → 401', () => matrix.adminAuthFail({ run: runPut, url: base, body: {} }));

// PUT has no 422 validation path (UpdateVariantSchema only gates field copy) → skip validation-fail

test('PUT happy-path → 200, data.id matches', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const sdk = makeFakeSdk();
    const body = { sku: 'SMX-BLK-128-UPD', stock: 42, active: true };
    const ctx = makeCtx({
      url: base,
      body,
      params: { id: f.variantProductId, variantId: f.variantBlack128Id },
    });
    const res = await runPut({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await res.json();
    assert.equal(b.success, true);
    assert.equal(b.data.id, f.variantBlack128Id);
    assert.equal(b.data.stock, 42);
  } finally {
    await cleanup();
  }
});

test('PUT 404: unknown variantId → 404', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({ url: base, body: { sku: 'x' }, params: { id: 'p', variantId: 'nope' } });
    const res = await runPut({ db, sdk, ctx });
    assert.equal(res.status, 404);
    const b = await res.json();
    assert.equal(b.success, false);
  } finally {
    await cleanup();
  }
});

test('PUT error-wrap → 500', () =>
  matrix.errorWrap({
    run: runPut,
    url: base,
    body: { sku: 'x' },
    params: { id: 'p', variantId: 'v' },
  }));

test('DELETE auth-fail → 401', () => matrix.adminAuthFail({ run: runDelete, url: base }));

test('DELETE happy-path → 200, data null', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: base,
      params: { id: f.variantProductId, variantId: f.variantBlack128Id },
    });
    const res = await runDelete({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await res.json();
    assert.equal(b.success, true);
    assert.equal(b.data, null);
  } finally {
    await cleanup();
  }
});

test('DELETE 404: unknown variantId → 404', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({ url: base, params: { id: 'p', variantId: 'nope' } });
    const res = await runDelete({ db, sdk, ctx });
    assert.equal(res.status, 404);
    const b = await res.json();
    assert.equal(b.success, false);
  } finally {
    await cleanup();
  }
});

test('DELETE error-wrap → 500', () =>
  matrix.errorWrap({ run: runDelete, url: base, params: { id: 'p', variantId: 'v' } }));

test('PUT accepts prices: upserts RON override and deletes EUR (price_net:null)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const sdk = makeFakeSdk();
    // variantBlack128Id starts with RON 25000 + EUR 5000 own prices (from seed).
    const body = {
      prices: [
        { currency: 'RON', price_net: 5400 },
        { currency: 'EUR', price_net: null },
      ],
    };
    const ctx = makeCtx({
      url: base,
      body,
      params: { id: f.variantProductId, variantId: f.variantBlack128Id },
    });
    const res = await runPut({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await res.json();
    assert.equal(b.success, true);
    // Verify the price rows: RON updated to 5400, EUR deleted.
    const { product_prices } = await import('../../../../../../src/db/schema.ts');
    const { eq } = await import('drizzle-orm');
    const rows = await db
      .select()
      .from(product_prices)
      .where(eq(product_prices.variant_id, f.variantBlack128Id));
    const ron = rows.find((p) => p.currency === 'RON');
    const eur = rows.find((p) => p.currency === 'EUR');
    assert.equal(ron!.price_net, 5400, 'RON variant price must be upserted to 5400');
    assert.equal(eur, undefined, 'EUR variant price must be deleted (price_net:null)');
  } finally {
    await cleanup();
  }
});
