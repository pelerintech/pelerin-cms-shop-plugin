import { test } from 'node:test';
import assert from 'node:assert';
import { createTestDb, seedMinimal, categories, products, translations as harnessTranslations } from '../../db/harness.ts';
import { findSlugCollisions } from '../../../src/lib/data/slug-resolution.ts';

test('findSlugCollisions returns empty array when no collisions exist', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    // Books category has unique en slug 'books' — no collision.
    const collisions = await findSlugCollisions(db, 'category', f.categoryBooksId, ['en', 'ro']);
    assert.deepEqual(collisions, [], 'should have no collisions');
  } finally {
    await cleanup();
  }
});

test('findSlugCollisions returns locale when slug collides with another entity', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    // Insert a second category with the same en slug 'books'.
    const secondCatId = crypto.randomUUID();
    await db.insert(categories).values({
      id: secondCatId, parent_id: null, name: 'Second Cat', description: null,
      slug: 'second-cat', sort_order: 99, created_at: null, updated_at: null,
    });
    await db.insert(harnessTranslations).values({
      id: crypto.randomUUID(), entity_type: 'category', entity_id: secondCatId,
      locale: 'en', name: 'Second Category', description: null, slug: 'books', label: null,
    });
    // Books category's en slug 'books' now collides with second category's en slug 'books'.
    const collisions = await findSlugCollisions(db, 'category', f.categoryBooksId, ['en', 'ro']);
    assert.deepEqual(collisions, ['en'], 'should report collision in en locale only');
  } finally {
    await cleanup();
  }
});

test('findSlugCollisions works for products', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    // Insert a second product with the same en slug 'programming-book'.
    const secondProdId = crypto.randomUUID();
    await db.insert(products).values({
      id: secondProdId, sku: 'BOOK-002', type: 'physical', has_variants: false,
      vat_rate: 0.05, stock: 10, category_id: f.categoryBooksId, active: true,
      name: 'Second Book', description: null, slug: 'second-book',
      created_at: new Date(), updated_at: new Date(),
    });
    await db.insert(harnessTranslations).values({
      id: crypto.randomUUID(), entity_type: 'product', entity_id: secondProdId,
      locale: 'en', name: 'Duplicate', description: null, slug: 'programming-book', label: null,
    });
    // The simple product's en slug 'programming-book' now collides.
    const collisions = await findSlugCollisions(db, 'product', f.simpleProductId, ['en', 'ro']);
    assert.deepEqual(collisions, ['en'], 'should report collision in en locale only');
  } finally {
    await cleanup();
  }
});

test('findSlugCollisions skips locales where entity has no slug', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    // Query a non-existent locale — entity has no translation there, falls back to parent slug.
    // The parent slug 'carti' is unique, so no collision.
    const collisions = await findSlugCollisions(db, 'category', f.categoryBooksId, ['fr']);
    assert.deepEqual(collisions, [], 'should have no collisions for locale with no translation');
  } finally {
    await cleanup();
  }
});

test('findSlugCollisions returns multiple locales when collisions exist in more than one', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    // Insert a second category with the same en slug 'books'.
    const secondCatId = crypto.randomUUID();
    await db.insert(categories).values({
      id: secondCatId, parent_id: null, name: 'Second Cat', description: null,
      slug: 'second-cat', sort_order: 99, created_at: null, updated_at: null,
    });
    await db.insert(harnessTranslations).values([
      {
        id: crypto.randomUUID(), entity_type: 'category', entity_id: secondCatId,
        locale: 'en', name: 'Second Category EN', description: null, slug: 'books', label: null,
      },
      {
        id: crypto.randomUUID(), entity_type: 'category', entity_id: secondCatId,
        locale: 'ro', name: 'Second Category RO', description: null, slug: 'carti', label: null,
      },
    ]);
    // Books category now collides in both en ('books') and ro ('carti').
    const collisions = await findSlugCollisions(db, 'category', f.categoryBooksId, ['en', 'ro']);
    assert.deepEqual(collisions, ['en', 'ro'], 'should report collisions in both locales');
  } finally {
    await cleanup();
  }
});
