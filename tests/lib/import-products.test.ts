/**
 * Tests for src/lib/import-products.ts — product CSV upsert logic.
 *
 * Runs against the real-SQLite harness (tests/db/harness.ts): importProducts
 * receives an injected `db`, validates rows via ProductImportRowSchema, resolves
 * categories by slug, upserts products by SKU, and upserts ro/en translations.
 * Invalid rows are reported per-row without aborting the batch.
 *
 * This also exercises the new data accessors findProductBySku /
 * findCategoryBySlug against populated and empty data (the §6.5 smoke coverage).
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { eq } from 'drizzle-orm';
import { createTestDb, seedMinimal, resetDb, products, translations } from '../db/harness.ts';
import { importProducts } from '../../src/lib/import-products.ts';
import { findProductBySku, findCategoryBySlug } from '../../src/lib/data/products.ts';

test('importProducts creates new products for unknown SKUs and upserts ro translations', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const rows = [
      { sku: 'NEW-001', name_ro: 'Produs Nou', name_en: 'New Product', description_ro: 'Desc RO', description_en: 'Desc EN', type: 'physical', category_slug: 'carti', vat_rate: '0.09', stock: '20' },
    ];
    const result = await importProducts(db, rows);
    assert.strictEqual(result.total, 1);
    assert.strictEqual(result.created, 1);
    assert.strictEqual(result.updated, 0);
    assert.strictEqual(result.skipped, 0);
    assert.strictEqual(result.errors.length, 0);

    const prod = await findProductBySku(db, 'NEW-001');
    assert.ok(prod, 'product created and findable by SKU');
    assert.strictEqual(prod.name, 'Produs Nou');
    assert.strictEqual(prod.type, 'physical');
    assert.strictEqual(prod.category_id, f.categoryBooksId, 'category resolved by slug');
    assert.strictEqual(prod.vat_rate, 0.09);
    assert.strictEqual(prod.stock, 20);

    // ro translation row created
    const roTrans = await db.select().from(translations).where(eq(translations.entity_id, prod.id));
    const ro = roTrans.find(t => t.entity_type === 'product' && t.locale === 'ro');
    assert.ok(ro, 'ro translation created');
    assert.strictEqual(ro.name, 'Produs Nou');
    // en translation row created
    const en = roTrans.find(t => t.entity_type === 'product' && t.locale === 'en');
    assert.ok(en, 'en translation created');
    assert.strictEqual(en.name, 'New Product');
  } finally {
    await cleanup();
  }
});

test('importProducts updates existing products for known SKUs (no duplicate)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    // BOOK-001 exists in seed
    const rows = [
      { sku: 'BOOK-001', name_ro: 'Carte Editata', type: 'physical', category_slug: 'carti', vat_rate: '0.19', stock: '7' },
    ];
    const result = await importProducts(db, rows);
    assert.strictEqual(result.created, 0);
    assert.strictEqual(result.updated, 1);
    assert.strictEqual(result.errors.length, 0);

    // Still only the original + seeded product count (no duplicate)
    const all = await db.select().from(products);
    const bookRows = all.filter(p => p.sku === 'BOOK-001');
    assert.strictEqual(bookRows.length, 1, 'no duplicate product created');
    assert.strictEqual(bookRows[0].name, 'Carte Editata', 'name updated');
    assert.strictEqual(bookRows[0].stock, 7, 'stock updated');
    assert.strictEqual(bookRows[0].vat_rate, 0.19, 'vat_rate updated');
  } finally {
    await cleanup();
  }
});

test('importProducts update does NOT overwrite unset columns (vat_rate/stock/category/description/active preserved)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    // BOOK-001 seed: vat_rate=0.05, stock=100, category_id=books, active=true,
    // description='O carte excelentă'. Make it inactive to prove active is preserved.
    await db.update(products).set({ active: false }).where(eq(products.id, f.simpleProductId));

    // Import row provides only the required fields (sku, name_ro, type) — no
    // vat_rate, stock, category_slug, or description_ro.
    const rows = [{ sku: 'BOOK-001', name_ro: 'Nume Nou', type: 'physical' }];
    const result = await importProducts(db, rows);
    assert.strictEqual(result.updated, 1);
    assert.strictEqual(result.errors.length, 0);

    const [row] = await db.select().from(products).where(eq(products.id, f.simpleProductId));
    assert.strictEqual(row.name, 'Nume Nou', 'provided name is updated');
    assert.strictEqual(row.type, 'physical');
    assert.strictEqual(row.vat_rate, 0.05, 'unset vat_rate preserved, NOT nulled');
    assert.strictEqual(row.stock, 100, 'unset stock preserved, NOT nulled');
    assert.strictEqual(row.category_id, f.categoryBooksId, 'unset category preserved, NOT cleared');
    assert.strictEqual(row.description, 'O carte excelentă', 'unset description preserved, NOT nulled');
    assert.strictEqual(row.active, false, 'active preserved — import has no active column so it must not flip');
  } finally {
    await cleanup();
  }
});

test('importProducts update preserves unset translation fields (en description kept when only name_ro provided)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    // Seed has an en translation for the simple product: name 'Programming Book',
    // description 'An excellent book'. Update with only ro fields — en must stay intact.
    const rows = [{ sku: 'BOOK-001', name_ro: 'Carte Noua', type: 'physical' }];
    await importProducts(db, rows);

    const enRows = await db.select().from(translations).where(eq(translations.entity_id, f.simpleProductId));
    const en = enRows.find(t => t.entity_type === 'product' && t.locale === 'en');
    assert.ok(en, 'en translation still present');
    assert.strictEqual(en.name, 'Programming Book', 'en name not overwritten when name_en absent');
    assert.strictEqual(en.description, 'An excellent book', 'en description not overwritten when description_en absent');

    // ro translation name updated to the new value (name_ro is required → always updates)
    const ro = enRows.find(t => t.entity_type === 'product' && t.locale === 'ro');
    assert.ok(ro);
    assert.strictEqual(ro.name, 'Carte Noua');
  } finally {
    await cleanup();
  }
});

test('importProducts update treats empty category_slug as "omit" (existing category preserved)', async () => {
  // Sanity: an empty category_slug string is treated as "not provided" (omit),
  // so an existing category is preserved. There is no CSV value meaning "clear".
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const rows = [{ sku: 'BOOK-001', name_ro: 'X', type: 'physical', category_slug: '' }];
    await importProducts(db, rows);
    const [row] = await db.select().from(products).where(eq(products.id, f.simpleProductId));
    assert.strictEqual(row.category_id, f.categoryBooksId, 'empty category_slug preserves existing category');
  } finally {
    await cleanup();
  }
});

test('importProducts processes a mix of create + update + error rows without aborting', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const rows = [
      { sku: 'MIX-NEW', name_ro: 'Nou', type: 'physical' },                 // create
      { sku: 'BOOK-001', name_ro: 'Editat', type: 'physical' },             // update
      { sku: '', name_ro: 'No SKU', type: 'physical' },                     // error: missing sku
      { sku: 'BAD-TYPE', name_ro: 'X', type: 'widget' },                    // error: invalid type
      { sku: 'BAD-CAT', name_ro: 'Y', type: 'physical', category_slug: 'nonexistent-slug' }, // error: category not found
    ];
    const result = await importProducts(db, rows);
    assert.strictEqual(result.total, 5);
    assert.strictEqual(result.created, 1);
    assert.strictEqual(result.updated, 1);
    assert.strictEqual(result.skipped, 3, 'three error rows skipped');
    assert.strictEqual(result.errors.length, 3);
    // errors carry row number (1-based + header offset → +2) and a message
    const rowNums = result.errors.map(e => e.row).sort((a, b) => a - b);
    assert.deepStrictEqual(rowNums, [4, 5, 6]);
    const noSkuErr = result.errors.find(e => e.row === 4);
    assert.ok(noSkuErr.error.toLowerCase().includes('sku'), 'missing-sku error mentions sku');
    const typeErr = result.errors.find(e => e.row === 5);
    assert.ok(typeErr.error.toLowerCase().includes('type'), 'invalid-type error mentions type');
    const catErr = result.errors.find(e => e.row === 6);
    assert.ok(catErr.error.toLowerCase().includes('category'), 'category error mentions category');
  } finally {
    await cleanup();
  }
});

test('importProducts duplicate SKU in same file: last occurrence wins for values', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const rows = [
      { sku: 'DUP-001', name_ro: 'First', type: 'physical', stock: '1' },
      { sku: 'DUP-001', name_ro: 'Second', type: 'physical', stock: '2' },
    ];
    const result = await importProducts(db, rows);
    assert.strictEqual(result.created, 1, 'first occurrence creates');
    assert.strictEqual(result.updated, 1, 'second occurrence updates the same product');
    const prod = await findProductBySku(db, 'DUP-001');
    assert.strictEqual(prod.name, 'Second', 'last occurrence values win');
    assert.strictEqual(prod.stock, 2);
  } finally {
    await cleanup();
  }
});

test('importProducts on empty rows returns zeroed result', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const result = await importProducts(db, []);
    assert.strictEqual(result.total, 0);
    assert.strictEqual(result.created, 0);
    assert.strictEqual(result.updated, 0);
    assert.strictEqual(result.skipped, 0);
    assert.strictEqual(result.errors.length, 0);
  } finally {
    await cleanup();
  }
});

test('importProducts works on empty (unseeded) db', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const rows = [
      { sku: 'EMPTY-001', name_ro: 'Primul', type: 'physical' },
      { sku: 'EMPTY-002', name_ro: 'Al Doilea', type: 'digital' },
    ];
    const result = await importProducts(db, rows);
    assert.strictEqual(result.created, 2);
    assert.strictEqual(result.errors.length, 0);
  } finally {
    await cleanup();
  }
});

// ── Data-accessor smoke coverage (§6.5) ──

test('findProductBySku returns the product on populated db', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const prod = await findProductBySku(db, 'BOOK-001');
    assert.ok(prod);
    assert.strictEqual(prod.sku, 'BOOK-001');
  } finally {
    await cleanup();
  }
});

test('findProductBySku returns null for unknown SKU / empty db', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    assert.strictEqual(await findProductBySku(db, 'NOPE'), null);
    await seedMinimal(db);
    assert.strictEqual(await findProductBySku(db, 'NOPE'), null);
    // variant SKU should NOT match product lookup
    assert.strictEqual(await findProductBySku(db, 'SMX-BLK-128'), null);
  } finally {
    await cleanup();
  }
});

test('findCategoryBySlug returns the category on populated db', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const cat = await findCategoryBySlug(db, 'carti');
    assert.ok(cat);
    assert.strictEqual(cat.slug, 'carti');
  } finally {
    await cleanup();
  }
});

test('findCategoryBySlug returns null for unknown slug / empty db', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    assert.strictEqual(await findCategoryBySlug(db, 'carti'), null);
    await seedMinimal(db);
    assert.strictEqual(await findCategoryBySlug(db, 'nope'), null);
  } finally {
    await cleanup();
  }
});
