import { test } from 'node:test';
import { ensureLoader } from '../../../../stubs/register.mjs';
import { matrix, assert, createTestDb, seedMinimal, makeFakeSdk, makeCtx } from '../../_matrix.ts';

ensureLoader();
const { runGet } = await import('../../../../../src/api/shop/public/products/[id].ts');

const URL = (id: string) => `http://localhost/api/plugins/shop/public/products/${id}?locale=ro`;

test('GET happy-path → 200, data has id', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const sdk = makeFakeSdk({ user: null });
    const ctx = makeCtx({ url: URL(f.simpleProductId), params: { id: f.simpleProductId } });
    const res = await runGet({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await res.json();
    assert.equal(b.success, true);
    assert.equal(b.data.id, f.simpleProductId);
  } finally {
    await cleanup();
  }
});

test('GET not-found → 404', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const sdk = makeFakeSdk({ user: null });
    const ctx = makeCtx({ url: URL('no-such-product'), params: { id: 'no-such-product' } });
    const res = await runGet({ db, sdk, ctx });
    assert.equal(res.status, 404);
    const b = await res.json();
    assert.equal(b.success, false);
  } finally {
    await cleanup();
  }
});

test('GET error-wrap → 500', () =>
  matrix.errorWrap({ run: runGet, url: URL('any'), params: { id: 'any' } }));

test('GET returns variant effective_prices (inherited per currency when variant has no own price)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    // Give the variant product a product-level RON price, and wipe a variant's own prices.
    const { product_prices } = await import('../../../../../src/db/schema.ts');
    const { eq } = await import('drizzle-orm');
    await db.insert(product_prices).values({
      id: crypto.randomUUID(), product_id: f.variantProductId, variant_id: null, currency: 'RON', price_net: 4900,
    });
    await db.delete(product_prices).where(eq(product_prices.variant_id, f.variantBlack128Id));

    const sdk = makeFakeSdk({ user: null });
    const ctx = makeCtx({ url: URL(f.variantProductId), params: { id: f.variantProductId } });
    const res = await runGet({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await res.json();
    const v = b.data.variants.find((x: any) => x.id === f.variantBlack128Id);
    assert.ok(v, 'variant must be in response');
    assert.ok(Array.isArray(v.effective_prices), 'variant must include effective_prices');
    const ron = v.effective_prices.find((p: any) => p.currency === 'RON');
    assert.ok(ron, 'RON effective price must be present');
    assert.equal(ron.price_net, 4900);
    assert.equal(ron.inherited, true, 'RON with no own row must be inherited from product');
  } finally {
    await cleanup();
  }
});
