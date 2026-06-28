import { test } from 'node:test';
import assert from 'node:assert';
import { createTestDb, seedMinimal, insertFixture } from '../../db/harness.ts';
import { createProductImage } from '../../../src/lib/data/products.ts';
import { eq } from 'drizzle-orm';
import { product_images } from '../../../src/db/schema.ts';

test('createProductImage accepts storage_key + enriched metadata, stores key in url column, generates id', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const id = await createProductImage(db, {
      product_id: f.simpleProductId,
      variant_id: null,
      storage_key: 'products/p1/c.jpg',
      mime: 'image/png',
      size: 1234,
      width: 100,
      height: 50,
      original_filename: 'c.png',
      alt: null,
      sort_order: 0,
    });
    assert.ok(id, 'must return a generated id');
    assert.match(id, /^[0-9a-f]{8}-/, 'id should look like a uuid');

    const rows = await db.select().from(product_images).where(eq(product_images.id, id));
    assert.strictEqual(rows.length, 1);
    const row = rows[0];
    // url column holds the KEY, NOT a URL
    assert.strictEqual(row.url, 'products/p1/c.jpg', 'url column must hold the storage key');
    assert.strictEqual(row.mime, 'image/png');
    assert.strictEqual(row.size, 1234);
    assert.strictEqual(row.width, 100);
    assert.strictEqual(row.height, 50);
    assert.strictEqual(row.original_filename, 'c.png');
    assert.strictEqual(row.product_id, f.simpleProductId);
    assert.strictEqual(row.sort_order, 0);
  } finally {
    await cleanup();
  }
});

test('createProductImage works with optional width/height/alt omitted', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const id = await createProductImage(db, {
      product_id: f.simpleProductId,
      storage_key: 'products/p1/d.jpg',
      mime: 'image/jpeg',
      size: 10,
      sort_order: 1,
    });
    const rows = await db.select().from(product_images).where(eq(product_images.id, id));
    assert.strictEqual(rows[0].url, 'products/p1/d.jpg');
    assert.strictEqual(rows[0].width, null);
    assert.strictEqual(rows[0].height, null);
    assert.strictEqual(rows[0].original_filename, null);
  } finally {
    await cleanup();
  }
});

// Silence unused import warning in case insertFixture is unused in future edits.
void insertFixture;
