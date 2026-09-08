import { test } from 'node:test';
import assert from 'node:assert';
import { createTestDb, seedMinimal, insertFixture } from '../../db/harness.ts';
import { listCategories } from '../../../src/lib/data/products.ts';

/**
 * r38 Task 1 — `listCategories` overloaded pagination.
 * Without `page`/`limit` it returns the array (backward compatible); with them
 * it returns `{ rows, total, page, limit }`.
 */

async function seedCategories(db: any, count: number): Promise<void> {
  // seedMinimal creates 2 categories (Telefoane, Cărți). Add (count - 2) more.
  for (let i = 0; i < count - 2; i++) {
    await insertFixture(db, 'categories', {
      id: `cat-${i}`,
      parent_id: null,
      name: `Category ${i}`,
      slug: `category-${i}`,
      description: null,
      sort_order: 10 + i,
      created_at: new Date(),
      updated_at: new Date(),
    });
  }
}

test('listCategories without pagination args returns the array (backward compatible)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    await seedCategories(db, 25);
    const result = await listCategories(db, 'ro');
    assert.ok(Array.isArray(result), 'should return an array when no page/limit');
    assert.strictEqual(result.length, 25);
  } finally {
    await cleanup();
  }
});

test('listCategories with page/limit returns rows, total, page, limit', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    await seedCategories(db, 25);
    const result = await listCategories(db, 'ro', { page: 1, limit: 20 });
    assert.ok(!Array.isArray(result), 'should return an object when paging');
    assert.strictEqual(result.rows.length, 20);
    assert.strictEqual(result.total, 25);
    assert.strictEqual(result.page, 1);
    assert.strictEqual(result.limit, 20);
  } finally {
    await cleanup();
  }
});

test('listCategories page 2 returns the remaining rows', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    await seedCategories(db, 25);
    const result = await listCategories(db, 'ro', { page: 2, limit: 20 });
    assert.strictEqual(result.rows.length, 5);
    assert.strictEqual(result.total, 25);
  } finally {
    await cleanup();
  }
});

test('listCategories on empty db returns empty rows and zero total', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const result = await listCategories(db, 'ro', { page: 1, limit: 20 });
    assert.deepStrictEqual(result.rows, []);
    assert.strictEqual(result.total, 0);
  } finally {
    await cleanup();
  }
});

test('listCategories search composes with pagination', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    await seedCategories(db, 25);
    // The 2 seed categories are "Telefoane"/"Cărți"; the others are "Category N".
    // Search "Category" should match 23 rows across 2 pages.
    const p1 = await listCategories(db, 'ro', { page: 1, limit: 20, search: 'category' });
    assert.strictEqual(p1.total, 23, 'total reflects only matching categories');
    assert.strictEqual(p1.rows.length, 20);
    for (const r of p1.rows) {
      assert.match(r.name.toLowerCase(), /category/, 'returned rows should match the search');
    }
    const p2 = await listCategories(db, 'ro', { page: 2, limit: 20, search: 'category' });
    assert.strictEqual(p2.rows.length, 3);
    assert.strictEqual(p2.total, 23);
  } finally {
    await cleanup();
  }
});

test('listCategories overlays a non-default locale only on the paged rows', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    // seedMinimal creates 2 categories (Telefoane/Cărți) each carrying an 'en'
    // translation (Phones/Books) plus 23 more untranslated categories = 25 total.
    const f = await seedMinimal(db);
    await seedCategories(db, 25);
    // Paged call in a non-default locale; total comes from the raw (pre-overlay)
    // rows, not the translated array length.
    const result = await listCategories(db, 'en', { page: 1, limit: 20 });
    assert.ok(!Array.isArray(result), 'should return a paged object');
    assert.strictEqual(result.total, 25, 'total counts the raw category rows');
    assert.strictEqual(result.rows.length, 20);
    // The 'en' overlay must be applied to the returned (paged) rows.
    const phones: any = result.rows.find((r) => r.id === f.categoryPhonesId);
    assert.ok(phones, 'phones category should appear on page 1');
    assert.strictEqual(phones.name, 'Phones');
    assert.strictEqual(phones.description, 'Mobile phones');
    assert.strictEqual(phones.slug, 'phones');
    const books: any = result.rows.find((r) => r.id === f.categoryBooksId);
    assert.ok(books, 'books category should appear on page 1');
    assert.strictEqual(books.name, 'Books');
    // Page 2 holds the remaining 5 (untranslated) categories, which keep their
    // default-locale names (overlay only ran on the paged subset).
    const page2 = await listCategories(db, 'en', { page: 2, limit: 20 });
    assert.strictEqual(page2.rows.length, 5);
    assert.strictEqual(page2.total, 25);
  } finally {
    await cleanup();
  }
});
