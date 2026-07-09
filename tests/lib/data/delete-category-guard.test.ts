/**
 * r17 Task 8 — deleteCategory guard.
 *
 * deleteCategory today does a bare DELETE, orphaning child categories and
 * products. It must refuse (like deleteAttribute) when referenced: throw
 * CategoryError (409) if child categories or products reference it; only a leaf
 * category with no products can be deleted.
 *
 * See reespec/requests/shop-r17-data-integrity-hardening (delete-category-guard spec).
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { eq } from 'drizzle-orm';
import { createTestDb, seedMinimal, insertFixture } from '../../db/harness.ts';
import { deleteCategory, CategoryError } from '../../../src/lib/data/products.ts';
import { categories, products } from '../../../src/db/schema.ts';

const now = () => new Date();
const rid = () => crypto.randomUUID();

async function makeCategory(db: any, id: string, parentId: string | null, slug: string) {
  await insertFixture(db, 'categories', {
    id, parent_id: parentId, name: id, description: null, slug, sort_order: 0,
    created_at: now(), updated_at: now(),
  });
}

test('deleteCategory refuses when the category has child categories (409, not deleted)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const parent = rid();
    const child = rid();
    await makeCategory(db, parent, null, 'parent-' + parent.slice(0, 8));
    await makeCategory(db, child, parent, 'child-' + child.slice(0, 8));

    await assert.rejects(
      () => deleteCategory(db, parent),
      (err: any) => {
        assert.ok(err instanceof CategoryError || /child categor/i.test(err.message),
          `expected CategoryError about child categories, got: ${err.message}`);
        assert.strictEqual(err.status, 409, 'CategoryError must carry status 409');
        return true;
      },
    );

    // parent NOT deleted
    const [row] = await db.select().from(categories).where(eq(categories.id, parent));
    assert.ok(row, 'parent category must survive the refused delete');
  } finally {
    await cleanup();
  }
});

test('deleteCategory refuses when the category has products (409, not deleted)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const cat = rid();
    await makeCategory(db, cat, null, 'cat-with-products-' + cat.slice(0, 8));
    // Assign a product to the category.
    const prodId = rid();
    await insertFixture(db, 'products', {
      id: prodId, sku: 'PROD-CAT-' + prodId.slice(0, 6), type: 'physical', has_variants: false,
      vat_rate: 0.19, stock: 3, category_id: cat, active: true, name: 'P', description: '',
      slug: 'prod-cat-' + prodId.slice(0, 6), created_at: now(), updated_at: now(),
    });

    await assert.rejects(
      () => deleteCategory(db, cat),
      (err: any) => {
        assert.ok(/product/i.test(err.message), `expected message about products, got: ${err.message}`);
        assert.strictEqual(err.status, 409);
        return true;
      },
    );

    const [row] = await db.select().from(categories).where(eq(categories.id, cat));
    assert.ok(row, 'category with products must survive the refused delete');
  } finally {
    await cleanup();
  }
});

test('deleteCategory deletes a leaf category with no children and no products', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const leaf = rid();
    await makeCategory(db, leaf, null, 'leaf-' + leaf.slice(0, 8));
    await deleteCategory(db, leaf);
    const [row] = await db.select().from(categories).where(eq(categories.id, leaf));
    assert.ok(!row, 'leaf category deleted with no error');
  } finally {
    await cleanup();
  }
});

test('deleteCategory on a seeded leaf category with no products/children deletes cleanly', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    // The seeded categories (Phones/Books) have products assigned → use a fresh leaf.
    const leaf = rid();
    await makeCategory(db, leaf, null, 'fresh-leaf-' + leaf.slice(0, 8));
    await deleteCategory(db, leaf);
    const [row] = await db.select().from(categories).where(eq(categories.id, leaf));
    assert.ok(!row);
  } finally {
    await cleanup();
  }
});
