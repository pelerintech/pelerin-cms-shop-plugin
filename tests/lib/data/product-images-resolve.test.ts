import { test } from 'node:test';
import assert from 'node:assert';
import { createTestDb, seedMinimal, insertFixture } from '../../db/harness.ts';
import { listProductImage, deleteProductImage } from '../../../src/lib/data/products.ts';
import { eq } from 'drizzle-orm';
import { product_images } from '../../../src/db/schema.ts';

interface FakeStorage {
  getUrlCalls: string[];
  getUrl: (key: string) => string;
  deleteCalls: string[];
  delete: (key: string) => Promise<void>;
}

function makeFakeSdk(): { storage: FakeStorage } {
  const storage: FakeStorage = {
    getUrlCalls: [],
    getUrl: (key: string) => {
      storage.getUrlCalls.push(key);
      return '/uploads/' + key;
    },
    deleteCalls: [],
    delete: async (key: string) => {
      storage.deleteCalls.push(key);
    },
  };
  return { storage };
}

test('listProductImage resolves keys → URLs in sort_order asc and never leaks raw keys', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    // Insert 2 image rows whose `url` column holds RAW storage keys
    await insertFixture(db, 'product_images', { id: 'img-a', product_id: f.simpleProductId, variant_id: null, url: 'products/p1/a.jpg', alt: null, sort_order: 1, mime: 'image/jpeg', size: 100, width: null, height: null, original_filename: 'a.jpg' });
    await insertFixture(db, 'product_images', { id: 'img-b', product_id: f.simpleProductId, variant_id: null, url: 'products/p1/b.jpg', alt: null, sort_order: 0, mime: 'image/png', size: 200, width: 10, height: 20, original_filename: 'b.png' });

    const sdk = makeFakeSdk();
    const images = await listProductImage(db, sdk, f.simpleProductId);

    assert.strictEqual(images.length, 2);
    // sort_order ascending: img-b (0) then img-a (1)
    assert.strictEqual(images[0].id, 'img-b');
    assert.strictEqual(images[1].id, 'img-a');
    // Each url is RESOLVED (not the raw key)
    assert.strictEqual(images[0].url, '/uploads/products/p1/b.jpg', 'url must be resolved, not raw key');
    assert.strictEqual(images[1].url, '/uploads/products/p1/a.jpg', 'url must be resolved, not raw key');
    // getUrl called once per row, with the correct raw key
    assert.strictEqual(sdk.storage.getUrlCalls.length, 2);
    assert.deepStrictEqual(sdk.storage.getUrlCalls.sort(), ['products/p1/a.jpg', 'products/p1/b.jpg']);
    // Enriched metadata present
    assert.strictEqual(images[0].mime, 'image/png');
    assert.strictEqual(images[0].size, 200);
    assert.strictEqual(images[0].width, 10);
    assert.strictEqual(images[0].height, 20);
    assert.strictEqual(images[0].original_filename, 'b.png');
  } finally {
    await cleanup();
  }
});

test('listProductImage on a product with no images returns [] and never calls getUrl', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const sdk = makeFakeSdk();
    const images = await listProductImage(db, sdk, f.simpleProductId);
    assert.strictEqual(images.length, 0);
    assert.strictEqual(sdk.storage.getUrlCalls.length, 0, 'getUrl must not be called on empty result');
  } finally {
    await cleanup();
  }
});

test('deleteProductImage calls sdk.storage.delete with the row key BEFORE removing the row', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    await insertFixture(db, 'product_images', { id: 'img-del', product_id: f.simpleProductId, variant_id: null, url: 'products/p1/d.jpg', alt: null, sort_order: 0, mime: 'image/jpeg', size: 10, width: null, height: null, original_filename: 'd.jpg' });

    // Track ordering: record timestamps of delete-call vs row removal
    const order: string[] = [];
    const sdk = makeFakeSdk();
    // Wrap storage.delete to record ordering relative to a post-call row check
    const origDelete = sdk.storage.delete;
    sdk.storage.delete = async (key: string) => {
      order.push('delete-called');
      // At this point the row must STILL exist (bytes-first → row survives until after delete)
      const rows = await db.select().from(product_images).where(eq(product_images.id, 'img-del'));
      assert.strictEqual(rows.length, 1, 'row must still exist when storage.delete is called');
      assert.strictEqual(rows[0].url, 'products/p1/d.jpg', 'row key must be readable when delete is called');
      await origDelete(key);
    };

    await deleteProductImage(db, sdk, 'img-del');

    assert.strictEqual(sdk.storage.deleteCalls.length, 1);
    assert.strictEqual(sdk.storage.deleteCalls[0], 'products/p1/d.jpg', 'delete must be called with the row key');
    order.push('after-call');
    // After the call the row is gone
    const after = await db.select().from(product_images).where(eq(product_images.id, 'img-del'));
    assert.strictEqual(after.length, 0, 'row must be removed after the call');
    assert.strictEqual(order[0], 'delete-called', 'delete must happen before row removal');
  } finally {
    await cleanup();
  }
});

test('deleteProductImage on a non-existent id does not throw and does not call storage.delete', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const sdk = makeFakeSdk();
    await assert.doesNotReject(() => deleteProductImage(db, sdk, 'no-such-id'));
    assert.strictEqual(sdk.storage.deleteCalls.length, 0, 'storage.delete must not be called for missing row');
  } finally {
    await cleanup();
  }
});
