import { test } from 'node:test';
import assert from 'node:assert';
import {
  createTestDb,
  seedMinimal,
  categories,
  translations as harnessTranslations,
} from '../../db/harness.ts';
import {
  upsertTranslationWithSlugGuard,
  resolveCategoryBySlug,
  SlugCollisionError,
} from '../../../src/lib/data/products.ts';
import { eq, and } from 'drizzle-orm';

async function upsertSlug(
  db: any,
  entityType: string,
  entityId: string,
  locale: string,
  slug: string | null,
  name?: string | null
) {
  return upsertTranslationWithSlugGuard(db, {
    entity_type: entityType,
    entity_id: entityId,
    locale,
    slug,
    name: name ?? null,
    description: null,
    label: null,
  });
}

test('upsertTranslationWithSlugGuard rejects duplicate slug for different entity', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    // categoryBooksId already has en slug 'books'. Insert a second category.
    const secondCatId = crypto.randomUUID();
    await db.insert(categories).values({
      id: secondCatId,
      parent_id: null,
      name: 'Second',
      description: null,
      slug: 'second-' + secondCatId.slice(0, 8),
      sort_order: 99,
      created_at: null,
      updated_at: null,
    });
    // Trying to give the second category the same en slug 'books' should throw.
    await assert.rejects(
      () => upsertSlug(db, 'category', secondCatId, 'en', 'books', 'Second Cat'),
      (err: any) => err instanceof SlugCollisionError,
      'should throw SlugCollisionError'
    );
    // Verify no translation row was written for the second category.
    const transRows = await db
      .select()
      .from(harnessTranslations)
      .where(
        and(
          eq(harnessTranslations.entity_type, 'category'),
          eq(harnessTranslations.entity_id, secondCatId),
          eq(harnessTranslations.locale, 'en')
        )
      );
    assert.equal(
      transRows.length,
      0,
      'no translation row should be written for the colliding entity'
    );
  } finally {
    await cleanup();
  }
});

test('upsertTranslationWithSlugGuard allows same-entity re-upsert', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    // Re-upsert the same slug for the same entity (idempotent).
    await assert.doesNotReject(
      () => upsertSlug(db, 'category', f.categoryBooksId, 'en', 'books', 'Books'),
      'same-entity re-upsert should not throw'
    );
  } finally {
    await cleanup();
  }
});

test('upsertTranslationWithSlugGuard allows slug change to new unique value', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    // Change the en slug from 'books' to 'books-new' (unique).
    await assert.doesNotReject(
      () => upsertSlug(db, 'category', f.categoryBooksId, 'en', 'books-new', 'Books New'),
      'unique slug change should not throw'
    );
    // Verify the slug was updated.
    const [trans] = await db
      .select()
      .from(harnessTranslations)
      .where(
        and(
          eq(harnessTranslations.entity_id, f.categoryBooksId),
          eq(harnessTranslations.locale, 'en')
        )
      );
    assert.equal(trans.slug, 'books-new', 'slug should be updated to books-new');
  } finally {
    await cleanup();
  }
});

test('upsertTranslationWithSlugGuard allows null slug', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const secondCatId = crypto.randomUUID();
    await db.insert(categories).values({
      id: secondCatId,
      parent_id: null,
      name: 'Second',
      description: null,
      slug: 'second-' + secondCatId.slice(0, 8),
      sort_order: 99,
      created_at: null,
      updated_at: null,
    });
    // Null slug should bypass collision check.
    await assert.doesNotReject(
      () => upsertSlug(db, 'category', secondCatId, 'en', null, 'Second Cat'),
      'null slug should not trigger collision check'
    );
  } finally {
    await cleanup();
  }
});

test('upsertTranslationWithSlugGuard allows same slug across different entity types', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    // Category has en slug 'books'. Give a product the same en slug 'books'.
    await assert.doesNotReject(
      () => upsertSlug(db, 'product', f.simpleProductId, 'en', 'books', 'Books Product'),
      'cross-entity-type same slug should not throw'
    );
  } finally {
    await cleanup();
  }
});

test('resolveCategoryBySlug throws on collision (defensive backstop)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    // Directly insert a duplicate en slug 'books' for a second category (bypassing the guard).
    const secondCatId = crypto.randomUUID();
    await db.insert(categories).values({
      id: secondCatId,
      parent_id: null,
      name: 'Second',
      description: null,
      slug: 'second-' + secondCatId.slice(0, 8),
      sort_order: 99,
      created_at: null,
      updated_at: null,
    });
    await db.insert(harnessTranslations).values({
      id: crypto.randomUUID(),
      entity_type: 'category',
      entity_id: secondCatId,
      locale: 'en',
      name: 'Second',
      description: null,
      slug: 'books',
      label: null,
    });
    // Resolution should throw SlugCollisionError.
    await assert.rejects(
      () => resolveCategoryBySlug(db, 'books', 'en'),
      (err: any) => err instanceof SlugCollisionError,
      'should throw SlugCollisionError on collision'
    );
  } finally {
    await cleanup();
  }
});
