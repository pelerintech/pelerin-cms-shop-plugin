import { test } from 'node:test';
import assert from 'node:assert';
import { ensureLoader } from '../../../../../stubs/register.mjs';
import { matrix } from '../../../_matrix.ts';
import { createTestDb, seedMinimal, insertFixture } from '../../../../../db/harness.ts';
import { makeFakeSdk, makeCtx, poisonDb } from '../../../../helpers.ts';

ensureLoader();
const { runGet } = await import(
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

test('GET resolves image keys → URLs (no raw key leaked)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    // Seed image rows whose `url` column holds RAW storage keys
    await insertFixture(db, 'product_images', { id: 'img-r1', product_id: f.simpleProductId, variant_id: null, url: 'products/p1/r1.jpg', alt: null, sort_order: 1, mime: 'image/jpeg', size: 10, width: null, height: null, original_filename: 'r1.jpg' });
    await insertFixture(db, 'product_images', { id: 'img-r2', product_id: f.simpleProductId, variant_id: null, url: 'products/p1/r2.jpg', alt: null, sort_order: 0, mime: 'image/jpeg', size: 20, width: null, height: null, original_filename: 'r2.jpg' });
    const sdk = makeFakeSdk();
    const ctx = makeCtx({ url: URL(f.simpleProductId), params: { id: f.simpleProductId } });
    const res = await runGet({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await res.json();
    assert.ok(Array.isArray(b.data), 'data should be an array');
    assert.strictEqual(b.data.length, 2);
    for (const img of b.data) {
      assert.match(img.url, /^\/uploads\/products\//, 'each url must be resolved (not a raw key)');
      assert.ok(!/^products\//.test(img.url), 'raw key must never leak to the consumer');
    }
  } finally {
    await cleanup();
  }
});

test('GET error-wrap → 500', () =>
  matrix.errorWrap({ run: runGet, url: URL('x'), params: { id: 'x' } }));
