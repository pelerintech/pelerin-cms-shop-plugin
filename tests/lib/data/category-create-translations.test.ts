/**
 * Category create — translation persist tests (shop-r28).
 *
 * Regression guards for the categories create path, which already calls
 * updateCategoryWithTranslations after createCategory. These tests lock
 * in the behavior and ensure it isn't broken by future changes.
 *
 * Mirrors the product create translation test scenarios.
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { eq, and } from 'drizzle-orm';
import { createTestDb, seedMinimal } from '../../db/harness.ts';
import {
  createCategory,
  updateCategoryWithTranslations,
  listCategories,
} from '../../../src/lib/data/products.ts';
import { saveLocales } from '../../../src/lib/data/settings.ts';
import { SlugCollisionError } from '../../../src/lib/data/slug-resolution.ts';
import { translations } from '../../../src/db/schema.ts';

test('Scenario 1: single-language create — no translations written', async () => {
  const { db } = await createTestDb();
  // Seed with only 'ro' locale (no additional locales)
  await saveLocales(db, [{ code: 'ro', name: 'Română', isDefault: true }]);

  const id = await createCategory(db, {
    name: 'Romane',
    slug: 'romane',
    sort_order: 1,
  });

  // Verify category row exists
  const roCats = await listCategories(db, 'ro');
  const cat = roCats.find((c) => c.id === id);
  assert.ok(cat, 'category should exist');
  assert.strictEqual(cat!.name, 'Romane');

  // Verify no translations were written
  const trans = await db
    .select()
    .from(translations)
    .where(and(eq(translations.entity_type, 'category'), eq(translations.entity_id, id)));
  assert.strictEqual(trans.length, 0, 'no translations should exist for single-locale create');
});

test('Scenario 2: multi-language create — translations persisted and read-back correct', async () => {
  const { db } = await createTestDb();
  await seedMinimal(db);
  // seedMinimal already saves ro (default) + en locales

  const id = await createCategory(db, {
    name: 'Romane',
    slug: 'romane',
    sort_order: 1,
  });

  // Simulate what the handler does: call updateCategoryWithTranslations
  // with the raw body containing additional locale fields.
  await updateCategoryWithTranslations(
    db,
    id,
    { name: 'Romane', slug: 'romane' },
    {
      name_en: 'Novels',
      slug_en: 'novels',
      description_en: 'All kinds of novels',
    },
    new Set(['en'])
  );

  // Verify translation row exists in DB
  const trans = await db
    .select()
    .from(translations)
    .where(and(eq(translations.entity_type, 'category'), eq(translations.entity_id, id)));
  const enTrans = trans.find((t) => t.locale === 'en');
  assert.ok(enTrans, 'en translation should exist');
  assert.strictEqual(enTrans!.name, 'Novels');
  assert.strictEqual(enTrans!.description, 'All kinds of novels');

  // Read-back in RO (default) — should return default locale values
  const roCats = await listCategories(db, 'ro');
  const roCat = roCats.find((c) => c.id === id);
  assert.ok(roCat, 'ro category should exist');
  assert.strictEqual(roCat!.name, 'Romane');

  // Read-back in EN (additional locale) — should return translation values
  const enCats = await listCategories(db, 'en');
  const enCat = enCats.find((c) => c.id === id);
  assert.ok(enCat, 'en category should exist');
  assert.strictEqual(enCat!.name, 'Novels');
});

test('Scenario 3: empty additional fields — fallback to default', async () => {
  const { db } = await createTestDb();
  await seedMinimal(db);

  const id = await createCategory(db, {
    name: 'Romane',
    slug: 'romane',
    sort_order: 1,
  });

  // Empty strings for additional locale fields
  await updateCategoryWithTranslations(
    db,
    id,
    { name: 'Romane', slug: 'romane' },
    {
      name_en: '',
    },
    new Set(['en'])
  );

  // Read-back in EN — should fall back to default locale values
  const enCats = await listCategories(db, 'en');
  const enCat = enCats.find((c) => c.id === id);
  assert.ok(enCat, 'en category should exist');
  assert.strictEqual(enCat!.name, 'Romane', 'empty en name falls back to default name');
});

test('Scenario 4: slug collision — SlugCollisionError thrown', async () => {
  const { db } = await createTestDb();
  await seedMinimal(db);

  // Use a slug that doesn't collide with seedMinimal's 'books'
  const collisionSlug = 'novels';

  // Create first category with an en translation slug
  const id1 = await createCategory(db, {
    name: 'Prima',
    slug: 'prima',
    sort_order: 1,
  });
  await updateCategoryWithTranslations(
    db,
    id1,
    { name: 'Prima', slug: 'prima' },
    { name_en: 'First', slug_en: collisionSlug },
    new Set(['en'])
  );

  // Create second category attempting to use the same en slug
  const id2 = await createCategory(db, {
    name: 'A doua',
    slug: 'a-doua',
    sort_order: 2,
  });

  try {
    await updateCategoryWithTranslations(
      db,
      id2,
      { name: 'A doua', slug: 'a-doua' },
      { slug_en: collisionSlug },
      new Set(['en'])
    );
    assert.fail('Should have thrown SlugCollisionError');
  } catch (err) {
    assert.ok(err instanceof SlugCollisionError, 'error should be SlugCollisionError');
    assert.strictEqual(err.locale, 'en');
    assert.strictEqual(err.slug, collisionSlug);
  }
});
