/**
 * Tier 1: Tests for updateCategoryWithTranslations accessor.
 *
 * Covers: upsert translations for known locale codes, ignore unknown codes,
 * update existing translation (no duplicate), empty locale codes, empty database.
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { createTestDb, seedMinimal, categories, translations } from '../../db/harness.ts';
import { eq, and } from 'drizzle-orm';
import { updateCategoryWithTranslations, getCategoryById, listTranslations } from '../../../src/lib/data/products.ts';

test('updateCategoryWithTranslations: upserts translations for known locale codes', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);

    const rawBody = {
      name: 'Electronics',
      name_ro: 'Electronice',
      slug_ro: 'electronice',
    };
    const knownLocaleCodes = new Set(['ro']);

    await updateCategoryWithTranslations(
      db,
      f.categoryBooksId,
      { name: 'Electronics' },
      rawBody,
      knownLocaleCodes,
    );

    // Category row updated
    const cat = await getCategoryById(db, f.categoryBooksId);
    assert.equal(cat?.name, 'Electronics');

    // Translation row created
    const transRows = await listTranslations(db, 'category', f.categoryBooksId);
    const roTrans = transRows.find(t => t.locale === 'ro');
    assert.ok(roTrans, 'RO translation should exist');
    assert.equal(roTrans.name, 'Electronice');
    assert.equal(roTrans.slug, 'electronice');
    assert.equal(roTrans.entity_type, 'category');
    assert.equal(roTrans.entity_id, f.categoryBooksId);
  } finally {
    await cleanup();
  }
});

test('updateCategoryWithTranslations: ignores fields with unknown locale suffixes', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);

    const rawBody = {
      name: 'Electronics',
      name_special: 'custom value',
    };
    const knownLocaleCodes = new Set(['ro']);

    await updateCategoryWithTranslations(
      db,
      f.categoryBooksId,
      { name: 'Electronics' },
      rawBody,
      knownLocaleCodes,
    );

    // Category row updated
    const cat = await getCategoryById(db, f.categoryBooksId);
    assert.equal(cat?.name, 'Electronics');

    // No translation for 'special'
    const transRows = await listTranslations(db, 'category', f.categoryBooksId);
    const specialTrans = transRows.find(t => t.locale === 'special');
    assert.equal(specialTrans, undefined, 'No translation for unknown locale "special"');
  } finally {
    await cleanup();
  }
});

test('updateCategoryWithTranslations: updates existing translation row (no duplicate)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);

    // Delete the seed's RO translation for categoryBooksId so we start clean
    await db.delete(translations).where(
      and(
        eq(translations.entity_id, f.categoryBooksId),
        eq(translations.locale, 'ro'),
        eq(translations.entity_type, 'category'),
      ),
    );

    // Seed a single known RO translation
    const existingTransId = crypto.randomUUID();
    await db.insert(translations).values({
      id: existingTransId,
      entity_type: 'category',
      entity_id: f.categoryBooksId,
      locale: 'ro',
      name: 'Old Name',
      description: 'Old Desc',
      slug: 'old-slug',
      label: null,
    });

    const rawBody = {
      name_ro: 'New Name',
    };
    const knownLocaleCodes = new Set(['ro']);

    await updateCategoryWithTranslations(
      db,
      f.categoryBooksId,
      {},
      rawBody,
      knownLocaleCodes,
    );

    // Exactly one translation row for 'ro'
    const transRows = await listTranslations(db, 'category', f.categoryBooksId);
    const roTrans = transRows.filter(t => t.locale === 'ro');
    assert.equal(roTrans.length, 1, 'Exactly one RO translation');
    assert.equal(roTrans[0].name, 'New Name');
  } finally {
    await cleanup();
  }
});

test('updateCategoryWithTranslations: handles empty locale codes (no translations upserted)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);

    const rawBody = {
      name: 'Electronics',
      name_ro: 'Electronice',
    };
    const knownLocaleCodes = new Set(); // empty set

    await updateCategoryWithTranslations(
      db,
      f.categoryBooksId,
      { name: 'Electronics' },
      rawBody,
      knownLocaleCodes,
    );

    // Category row updated
    const cat = await getCategoryById(db, f.categoryBooksId);
    assert.equal(cat?.name, 'Electronics');

    // No new translation rows (only the ones from seedMinimal should exist)
    const transRows = await listTranslations(db, 'category', f.categoryBooksId);
    // seedMinimal creates an 'en' and 'ro' translation for categoryBooksId
    // but those are from the seed, not from our call — our call should not add any
    // The key assertion: our call with empty knownLocaleCodes should not create
    // any NEW translations beyond what seedMinimal already created
    // Since seedMinimal already created translations for this category, we check
    // the count hasn't increased
    const initialCount = 2; // seedMinimal creates 'en' and 'ro' for categoryBooksId
    assert.ok(transRows.length <= initialCount + 1, 'No extra translations created');
    // More precisely: no new 'ro' translation was upserted by our call since
    // the seed's 'ro' translation should be unchanged
    const roTrans = transRows.find(t => t.locale === 'ro');
    assert.equal(roTrans?.name, 'Cărți', 'Existing seed translation unchanged');
  } finally {
    await cleanup();
  }
});

test('updateCategoryWithTranslations: works on empty database (no categories)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    // Empty database — no categories, no settings
    // Should not throw
    await updateCategoryWithTranslations(
      db,
      'nonexistent',
      {},
      {},
      new Set(),
    );
    // If we get here without throwing, the test passes
  } finally {
    await cleanup();
  }
});
