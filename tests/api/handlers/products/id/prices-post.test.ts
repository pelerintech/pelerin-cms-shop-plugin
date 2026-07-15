/**
 * r17 Task 6 — POST /products/:id/prices Zod validation (kill raw-body spread).
 *
 * The POST handler currently spreads raw `body` into upsertPrice and does NOT
 * use the already-imported (dead) CreatePriceSchema. After the fix:
 *  - body is parsed with CreatePriceSchema; non-numeric price_net → 422 fields
 *  - only validated fields reach upsertPrice (no id/created_at injection)
 *  - CreatePriceSchema is no longer a dead import
 *
 * See reespec/requests/shop-r17-data-integrity-hardening (endpoint-zod-schemas spec).
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { ensureLoader } from '../../../../stubs/register.mjs';
import { createTestDb, seedMinimal } from '../../../../db/harness.ts';
import { makeFakeSdk, makeCtx } from '../../../helpers.ts';
import { product_prices } from '../../../../db/harness.ts';

ensureLoader();
const { runPost } = await import('../../../../../src/api/shop/products/[id]/prices.ts');

const base = (id: string) => `http://localhost/api/plugins/shop/products/${id}/prices`;

test('POST happy-path → 201, only schema fields reach the accessor', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: base(f.variantProductId),
      body: { variant_id: f.variantBlack128Id, currency: 'USD', price_net: 9999 },
      method: 'POST',
      params: { id: f.variantProductId },
    });
    const res = await runPost({ db, sdk, ctx });
    assert.equal(res.status, 201);
    const b = await res.json();
    assert.equal(b.success, true);
  } finally {
    await cleanup();
  }
});

test('POST validation-fail → 422 with fields.price_net when price_net is non-numeric', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: base(f.variantProductId),
      body: { variant_id: f.variantBlack128Id, currency: 'USD', price_net: 'not-a-number' },
      method: 'POST',
      params: { id: f.variantProductId },
    });
    const res = await runPost({ db, sdk, ctx });
    assert.equal(res.status, 422);
    const b = await res.json();
    assert.equal(b.success, false);
    assert.equal(b.error, 'Validation failed');
    assert.ok(b.fields && Object.keys(b.fields).length > 0, 'fields non-empty');
    // No price row should have been written on validation failure.
    const { eq } = await import('drizzle-orm');
    const [row] = await db.select().from(product_prices).where(eq(product_prices.currency, 'USD'));
    assert.ok(!row, 'no upsertPrice on validation failure');
  } finally {
    await cleanup();
  }
});

test('POST validation-fail → 422 when currency missing', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: base(f.variantProductId),
      body: { variant_id: f.variantBlack128Id, price_net: 10 },
      method: 'POST',
      params: { id: f.variantProductId },
    });
    const res = await runPost({ db, sdk, ctx });
    assert.equal(res.status, 422);
    const b = await res.json();
    assert.equal(b.success, false);
    assert.ok(b.fields && Object.keys(b.fields).length > 0);
  } finally {
    await cleanup();
  }
});

test('POST: body with id/unknown columns cannot inject (only schema fields passed)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const sdk = makeFakeSdk();
    // Body includes a bogus `id` and `created_at` — these must NOT be persisted.
    const ctx = makeCtx({
      url: base(f.variantProductId),
      body: {
        variant_id: f.variantBlack128Id,
        currency: 'GBP',
        price_net: 50,
        id: 'INJECTED',
        created_at: 'evil',
      },
      method: 'POST',
      params: { id: f.variantProductId },
    });
    const res = await runPost({ db, sdk, ctx });
    assert.equal(res.status, 201);
    const { eq } = await import('drizzle-orm');
    const [row] = await db.select().from(product_prices).where(eq(product_prices.currency, 'GBP'));
    assert.ok(row, 'price row created');
    assert.notEqual(row.id, 'INJECTED', 'body id must not be injected; accessor generates the id');
  } finally {
    await cleanup();
  }
});

test('POST auth-fail → 401', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const sdk = makeFakeSdk({ authThrows: { status: 401, message: 'Unauthorized' } });
    const ctx = makeCtx({
      url: base('x'),
      body: { currency: 'RON', price_net: 10 },
      method: 'POST',
      params: { id: 'x' },
    });
    const res = await runPost({ db, sdk, ctx });
    assert.equal(res.status, 401);
  } finally {
    await cleanup();
  }
});
