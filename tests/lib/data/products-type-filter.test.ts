import { test } from 'node:test';
import assert from 'node:assert';
import { createTestDb, seedMinimal, insertFixture, products } from '../../db/harness.ts';
import { listProducts } from '../../../src/lib/data/products.ts';

/**
 * r38 Task 2 — `listProducts` server-side `type` filter, composing with
 * pagination so the count stays correct under the filter.
 */

// seedMinimal creates 2 physical products; clear them so counts are deterministic.
async function clearProducts(db: any): Promise<void> {
  await db.delete(products);
}

async function seedProducts(db: any, count: number, type: string): Promise<void> {
  for (let i = 0; i < count; i++) {
    await insertFixture(db, 'products', {
      id: `prod-${type}-${i}`,
      sku: `${type.toUpperCase()}-${i}`,
      type,
      has_variants: false,
      vat_rate: 0,
      stock: 10,
      category_id: null,
      active: true,
      name: `${type} product ${i}`,
      description: null,
      slug: `${type}-product-${i}`,
      created_at: new Date(),
      updated_at: new Date(),
    });
  }
}

test('listProducts filters by type in SQL with correct count', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    await clearProducts(db);
    await seedProducts(db, 30, 'physical');
    await seedProducts(db, 10, 'digital');
    const result = await listProducts(db, { page: 1, limit: 20, type: 'physical' });
    assert.strictEqual(result.total, 30, 'total should count only physical');
    assert.strictEqual(result.products.length, 20);
    for (const p of result.products) {
      assert.strictEqual(p.type, 'physical');
    }
  } finally {
    await cleanup();
  }
});

test('listProducts type filter spans pages correctly', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    await clearProducts(db);
    await seedProducts(db, 30, 'physical');
    const result = await listProducts(db, { page: 2, limit: 20, type: 'physical' });
    assert.strictEqual(result.total, 30);
    assert.strictEqual(result.products.length, 10);
    for (const p of result.products) {
      assert.strictEqual(p.type, 'physical');
    }
  } finally {
    await cleanup();
  }
});

test('listProducts without type returns all types', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    await clearProducts(db);
    await seedProducts(db, 30, 'physical');
    await seedProducts(db, 10, 'digital');
    const result = await listProducts(db, { page: 1, limit: 20 });
    assert.strictEqual(result.total, 40, 'total counts both types');
  } finally {
    await cleanup();
  }
});

test('listProducts type filter composes with category_id filter', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    await clearProducts(db);
    // physical products in the books category (f.categoryBooksId)
    for (let i = 0; i < 25; i++) {
      await insertFixture(db, 'products', {
        id: `prod-cat-${i}`,
        sku: `CAT-${i}`,
        type: 'physical',
        has_variants: false,
        vat_rate: 0,
        stock: 10,
        category_id: f.categoryBooksId,
        active: true,
        name: `cat product ${i}`,
        description: null,
        slug: `cat-product-${i}`,
        created_at: new Date(),
        updated_at: new Date(),
      });
    }
    // 5 physical products in a different category (null)
    for (let i = 0; i < 5; i++) {
      await insertFixture(db, 'products', {
        id: `prod-nocat-${i}`,
        sku: `NOCAT-${i}`,
        type: 'physical',
        has_variants: false,
        vat_rate: 0,
        stock: 10,
        category_id: null,
        active: true,
        name: `nocat product ${i}`,
        description: null,
        slug: `nocat-product-${i}`,
        created_at: new Date(),
        updated_at: new Date(),
      });
    }
    const result = await listProducts(db, {
      type: 'physical',
      category_id: f.categoryBooksId,
      page: 1,
      limit: 20,
    });
    assert.strictEqual(result.total, 25, 'total reflects rows matching both filters');
    assert.strictEqual(result.products.length, 20);
  } finally {
    await cleanup();
  }
});
