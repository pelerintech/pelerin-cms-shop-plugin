import { test } from 'node:test';
import assert from 'node:assert';
import {
  createTestDb,
  seedMinimal,
  categories,
  products,
  translations as harnessTranslations,
} from '../../db/harness.ts';
import {
  listCategories,
  resolveCategoryBySlug,
  resolveProductBySlug,
  SlugCollisionError,
} from '../../../src/lib/data/products.ts';

test('listCategories(db, "en") overlays localized slug (books, not carti)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const cats = await listCategories(db, 'en');
    const cat = cats.find((c) => c.id === f.categoryBooksId);
    assert.ok(cat, 'should find the books category');
    assert.equal(cat.slug, 'books', `expected localized slug 'books', got '${cat.slug}'`);
  } finally {
    await cleanup();
  }
});

test('resolveProductBySlug(db, "programming-book", "en") → throws SlugCollisionError on duplicate', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    // Insert a second product with the same en translation slug 'programming-book'.
    const secondProdId = crypto.randomUUID();
    await db.insert(products).values({
      id: secondProdId,
      sku: 'BOOK-002',
      type: 'physical',
      has_variants: false,
      vat_rate: 0.05,
      stock: 10,
      category_id: f.categoryBooksId,
      active: true,
      name: 'Second Book',
      description: null,
      slug: 'second-book',
      created_at: new Date(),
      updated_at: new Date(),
    });
    await db.insert(harnessTranslations).values({
      id: crypto.randomUUID(),
      entity_type: 'product',
      entity_id: secondProdId,
      locale: 'en',
      name: 'Second Book EN',
      description: null,
      slug: 'programming-book',
      label: null,
    });
    // Now resolving 'programming-book' in 'en' should throw.
    await assert.rejects(
      () => resolveProductBySlug(db, 'programming-book', 'en'),
      (err: any) => err instanceof SlugCollisionError,
      'should throw SlugCollisionError'
    );
  } finally {
    await cleanup();
  }
});

test('resolveProductBySlug(db, "nope", "en") → null', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const result = await resolveProductBySlug(db, 'nope', 'en');
    assert.equal(result, null, 'should return null for non-existent slug');
  } finally {
    await cleanup();
  }
});

test('resolveProductBySlug(db, "carte-programare", "en") → fallback to default slug', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const result = await resolveProductBySlug(db, 'carte-programare', 'en');
    assert.ok(result, 'should resolve via fallback');
    assert.equal(result!.product.id, f.simpleProductId, 'should return the simple product');
    assert.equal(result!.source, 'default', 'source should be "default"');
  } finally {
    await cleanup();
  }
});

test('resolveProductBySlug(db, "programming-book", "en") → { product, source: "translation" } with localized name/description', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const result = await resolveProductBySlug(db, 'programming-book', 'en');
    assert.ok(result, 'should resolve');
    assert.equal(result!.product.id, f.simpleProductId, 'should return the simple product');
    assert.equal(result!.source, 'translation', 'source should be "translation"');
    assert.equal(
      result!.product.name,
      'Programming Book',
      'name should be localized from translation'
    );
    assert.equal(
      result!.product.description,
      'An excellent book',
      'description should be localized from translation'
    );
  } finally {
    await cleanup();
  }
});

test('resolveCategoryBySlug(db, "books", "en") → throws SlugCollisionError on duplicate', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    // Insert a second category with the same en translation slug 'books'.
    const secondCatId = crypto.randomUUID();
    await db.insert(categories).values({
      id: secondCatId,
      parent_id: null,
      name: 'Second Cat',
      description: null,
      slug: 'second-cat',
      sort_order: 99,
      created_at: null,
      updated_at: null,
    });
    await db.insert(harnessTranslations).values({
      id: crypto.randomUUID(),
      entity_type: 'category',
      entity_id: secondCatId,
      locale: 'en',
      name: 'Second Category',
      description: null,
      slug: 'books',
      label: null,
    });
    // Now resolving 'books' in 'en' should throw because two categories share it.
    await assert.rejects(
      () => resolveCategoryBySlug(db, 'books', 'en'),
      (err: any) => err instanceof SlugCollisionError,
      'should throw SlugCollisionError'
    );
  } finally {
    await cleanup();
  }
});

test('resolveCategoryBySlug(db, "does-not-exist", "en") → null', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const result = await resolveCategoryBySlug(db, 'does-not-exist', 'en');
    assert.equal(result, null, 'should return null for non-existent slug');
  } finally {
    await cleanup();
  }
});

test('resolveCategoryBySlug(db, "carti", "en") → fallback to default slug', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    // Delete the en translation slug for the books category so there's no en match.
    // The books category has default slug 'carti' (ro), and en translation slug 'books'.
    // We null out the en slug so the resolver falls back to the default-locale slug.
    const { translations } = await import('../../db/harness.ts');
    const { eq, and, isNotNull } = await import('drizzle-orm');
    // Set the en translation slug to null for the books category
    await db
      .update(translations)
      .set({ slug: null })
      .where(and(eq(translations.entity_id, f.categoryBooksId), eq(translations.locale, 'en')));
    // Now resolve 'carti' in locale 'en' — should fall back to default slug.
    const result = await resolveCategoryBySlug(db, 'carti', 'en');
    assert.ok(result, 'should resolve via fallback');
    assert.equal(result!.category.id, f.categoryBooksId, 'should return the books category');
    assert.equal(result!.source, 'default', 'source should be "default"');
  } finally {
    await cleanup();
  }
});

test('resolveCategoryBySlug(db, "books", "en") → { category, source: "translation" } with localized name/description', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const result = await resolveCategoryBySlug(db, 'books', 'en');
    assert.ok(result, 'should resolve');
    assert.equal(result!.category.id, f.categoryBooksId, 'should return the books category');
    assert.equal(result!.source, 'translation', 'source should be "translation"');
    assert.equal(result!.category.name, 'Books', 'name should be localized from translation');
    assert.equal(
      result!.category.description,
      'Specialty books',
      'description should be localized from translation'
    );
  } finally {
    await cleanup();
  }
});
