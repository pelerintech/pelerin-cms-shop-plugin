/**
 * Locale round-trip regression guards (shop-r22).
 *
 * Locks in the post-default-swap save→read-back behavior for products and
 * categories that was the subject of issue-translation-persist.md. The
 * accessors already behave correctly; these tests ensure a future change to
 * upsertTranslation, the localized read branch, or migrateDefaultLocale's
 * stale-row handling fails loudly.
 *
 * Scope: products + categories only (design D5).
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { createTestDb, seedMinimal } from '../../db/harness.ts';
import { saveLocales, getShopConfig } from '../../../src/lib/data/settings.ts';
import { migrateDefaultLocale } from '../../../src/lib/data/migrate-default-locale.ts';
import {
  updateProductWithTranslations,
  updateCategoryWithTranslations,
  getProductWithPrices,
  listCategories,
} from '../../../src/lib/data/products.ts';

/** Swap the default locale to `en` the way the real admin flow does. */
async function swapDefaultToEn(db: any) {
  await saveLocales(db, [
    { code: 'ro', name: 'Română', isDefault: false },
    { code: 'en', name: 'English', isDefault: true },
  ]);
  await migrateDefaultLocale(db, 'ro', 'en');
  assert.strictEqual((await getShopConfig(db)).defaultLocale, 'en', 'default is now en');
}

test('Scenario 1: product non-default fields persist after default swap', async () => {
  const { db } = await createTestDb();
  const f = await seedMinimal(db);

  await swapDefaultToEn(db);

  // Save RO (now non-default) translations.
  await updateProductWithTranslations(
    db,
    f.simpleProductId,
    { name: 'Programming Book', slug: 'programming-book', description: 'An excellent book' },
    { name_ro: 'Nume nou', slug_ro: 'nume-nou', description_ro: 'Desc nouă' },
    new Set(['ro'])
  );

  const ro = await getProductWithPrices(db, f.simpleProductId, 'ro');
  assert.ok(ro, 'ro product read returned a row');
  assert.strictEqual(ro!.name, 'Nume nou');
  assert.strictEqual(ro!.slug, 'nume-nou');
  assert.strictEqual(ro!.description, 'Desc nouă');

  const en = await getProductWithPrices(db, f.simpleProductId, 'en');
  assert.ok(en, 'en product read returned a row');
  assert.strictEqual(en!.name, 'Programming Book');
  assert.strictEqual(en!.slug, 'programming-book');
  assert.strictEqual(en!.description, 'An excellent book');
});

test('Scenario 2: clearing a non-default field falls back to default value', async () => {
  const { db } = await createTestDb();
  const f = await seedMinimal(db);

  await swapDefaultToEn(db);

  // First set an RO value.
  await updateProductWithTranslations(
    db,
    f.simpleProductId,
    { name: 'Programming Book', slug: 'programming-book', description: 'An excellent book' },
    { name_ro: 'Nume nou', slug_ro: 'nume-nou', description_ro: 'Desc nouă' },
    new Set(['ro'])
  );

  // Now clear the RO name (empty string → null on read → falls back to default).
  await updateProductWithTranslations(
    db,
    f.simpleProductId,
    { name: 'Programming Book', slug: 'programming-book', description: 'An excellent book' },
    { name_ro: '' },
    new Set(['ro'])
  );

  const ro = await getProductWithPrices(db, f.simpleProductId, 'ro');
  assert.ok(ro, 'ro product read returned a row');
  // The read path applies `t.name ?? name`, so a null RO name falls back to
  // the default-locale ('en') parent name.
  assert.strictEqual(ro!.name, 'Programming Book', 'null RO name falls back to en default');
});

test('Scenario 3: category non-default fields persist after default swap', async () => {
  const { db } = await createTestDb();
  const f = await seedMinimal(db);

  await swapDefaultToEn(db);

  await updateCategoryWithTranslations(
    db,
    f.categoryBooksId,
    { name: 'Books', slug: 'books', description: 'Specialty books' },
    { name_ro: 'Categorie nouă', slug_ro: 'categorie-noua', description_ro: 'Desc cat' },
    new Set(['ro'])
  );

  const roCats = await listCategories(db, 'ro');
  const roCat = roCats.find((c) => c.id === f.categoryBooksId);
  assert.ok(roCat, 'ro category found');
  assert.strictEqual(roCat!.name, 'Categorie nouă');
  assert.strictEqual(roCat!.description, 'Desc cat');
  // Note: listCategories localizes name + description only (slug read from parent).

  const enCats = await listCategories(db, 'en');
  const enCat = enCats.find((c) => c.id === f.categoryBooksId);
  assert.ok(enCat, 'en category found');
  assert.strictEqual(enCat!.name, 'Books');
  assert.strictEqual(enCat!.description, 'Specialty books');
});

test('Scenario 4: round-trip ro→en→ro preserves edited non-default value (self-heal)', async () => {
  const { db } = await createTestDb();
  const f = await seedMinimal(db);

  // Swap default ro → en.
  await swapDefaultToEn(db);

  // Edit the RO (non-default) name.
  await updateProductWithTranslations(
    db,
    f.simpleProductId,
    { name: 'Programming Book', slug: 'programming-book', description: 'An excellent book' },
    { name_ro: 'Edited RO' },
    new Set(['ro'])
  );

  // Swap default back ro (en → ro).
  await saveLocales(db, [
    { code: 'ro', name: 'Română', isDefault: true },
    { code: 'en', name: 'English', isDefault: false },
  ]);
  await migrateDefaultLocale(db, 'en', 'ro');
  assert.strictEqual((await getShopConfig(db)).defaultLocale, 'ro');

  // EN is now non-default: read from the translation row that was healed by
  // the return migration (the old parent value 'Programming Book' was moved
  // into the en translation).
  const en = await getProductWithPrices(db, f.simpleProductId, 'en');
  assert.ok(en, 'en product read returned a row');
  assert.strictEqual(
    en!.name,
    'Programming Book',
    'en (non-default) reads the value that was on the parent while en was default'
  );

  // RO is now default: parent table holds the edited value (the ro translation
  // 'Edited RO' was copied onto the parent by the return migration).
  const ro = await getProductWithPrices(db, f.simpleProductId, 'ro');
  assert.ok(ro, 'ro product read returned a row');
  assert.strictEqual(
    ro!.name,
    'Edited RO',
    'ro (default) parent holds the edited value — edit survived the round-trip'
  );
});
