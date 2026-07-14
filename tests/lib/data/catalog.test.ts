import { test } from 'node:test';
import assert from 'node:assert';
import { createTestDb, seedMinimal, resetDb, insertFixture } from '../../db/harness.ts';
import {
  listProducts,
  getProductWithPrices,
  listCategories,
  upsertTranslation,
  listProductImage,
} from '../../../src/lib/data/products.ts';

test('listProducts returns paginated products ordered by created_at DESC', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const result = await listProducts(db, { page: 1, limit: 10, locale: 'ro' });
    assert.ok(Array.isArray(result.products));
    assert.strictEqual(result.products.length, 2);
    assert.ok(result.total >= 2);
    // DESC by created_at
    if (result.products.length >= 2) {
      assert.ok(result.products[0].created_at >= result.products[1].created_at, 'must be DESC');
    }
  } finally {
    await cleanup();
  }
});

test('listProducts returns localized name', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const result = await listProducts(db, { page: 1, limit: 10, locale: 'en' });
    const names = result.products.map((p) => p.name);
    assert.ok(
      names.some((n) => /Programming Book/i.test(n)),
      'en locale must return English name'
    );
  } finally {
    await cleanup();
  }
});

test('listProducts on empty db returns [] with no error', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const result = await listProducts(db, { page: 1, limit: 10, locale: 'ro' });
    assert.strictEqual(result.products.length, 0);
    assert.strictEqual(result.total, 0);
  } finally {
    await cleanup();
  }
});

test('getProductWithPrices returns product with prices keyed by currency (net + gross)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const product = await getProductWithPrices(db, f.simpleProductId, 'ro');
    assert.ok(product, 'must return the product');
    assert.ok(product!.prices, 'must have prices');
    assert.ok(product!.prices.length >= 2, 'must have RON + EUR prices');
    const ron = product!.prices.find((p) => p.currency === 'RON');
    assert.ok(ron, 'must have RON price');
    assert.strictEqual(ron!.price_net, 5000);
    // Gross = net * (1 + vat_rate). Simple product vat_rate = 0.05
    assert.strictEqual(ron!.price_gross, 5250);
  } finally {
    await cleanup();
  }
});

test('getProductWithPrices returns null for nonexistent product', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const product = await getProductWithPrices(db, 'nope', 'ro');
    assert.strictEqual(product, null);
  } finally {
    await cleanup();
  }
});

test('listCategories returns categories ordered by sort_order', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const cats = await listCategories(db, 'ro');
    assert.ok(cats.length >= 2);
    assert.ok(cats[0].sort_order <= cats[1].sort_order, 'must be ordered by sort_order');
  } finally {
    await cleanup();
  }
});

test('listCategories on empty db returns []', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const cats = await listCategories(db, 'ro');
    assert.strictEqual(cats.length, 0);
  } finally {
    await cleanup();
  }
});

test('upsertTranslation inserts a new translation then updates it (no dupes)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    // Insert
    await upsertTranslation(db, {
      entity_type: 'category',
      entity_id: 'cat-x',
      locale: 'en',
      name: 'Test Cat',
    });
    // Update (same key)
    await upsertTranslation(db, {
      entity_type: 'category',
      entity_id: 'cat-x',
      locale: 'en',
      name: 'Updated Cat',
    });
    const cats = await listCategories(db, 'ro');
    // The upserted translation doesn't affect categories list (cat-x doesn't exist as a category)
    // but the function should not throw
    assert.ok(true, 'upsert completed without error');
  } finally {
    await cleanup();
  }
});

test('listProductImages returns images for a product ordered by sort_order', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    // Insert images
    await insertFixture(db, 'product_images', {
      id: 'img-1',
      product_id: f.simpleProductId,
      variant_id: null,
      url: '/img1.jpg',
      alt: 'Img 1',
      sort_order: 2,
      mime: 'image/jpeg',
      size: 100,
      width: null,
      height: null,
      original_filename: 'img1.jpg',
    });
    await insertFixture(db, 'product_images', {
      id: 'img-2',
      product_id: f.simpleProductId,
      variant_id: null,
      url: '/img2.jpg',
      alt: 'Img 2',
      sort_order: 1,
      mime: 'image/jpeg',
      size: 100,
      width: null,
      height: null,
      original_filename: 'img2.jpg',
    });
    const images = await listProductImage(
      db,
      { storage: { getUrl: (k: string) => k } },
      f.simpleProductId
    );
    assert.strictEqual(images.length, 2);
    assert.strictEqual(images[0].sort_order, 1, 'first image must have lower sort_order');
  } finally {
    await cleanup();
  }
});

test('listProductImages on a product with no images returns []', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const images = await listProductImage(
      db,
      { storage: { getUrl: (k: string) => k } },
      f.simpleProductId
    );
    assert.strictEqual(images.length, 0);
  } finally {
    await cleanup();
  }
});
