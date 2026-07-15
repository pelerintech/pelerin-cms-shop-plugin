import { test } from 'node:test';
import assert from 'node:assert';
import { createTestDb, seedMinimal, resetDb } from '../../db/harness.ts';
import { listAttributes } from '../../../src/lib/data/attributes.ts';
import { listTranslationsByEntityIds } from '../../../src/lib/data/products.ts';

test('listAttributes returns all global attributes ordered by sort_order with localized names and option counts', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);

    const attrs = await listAttributes(db, 'ro');

    assert.ok(Array.isArray(attrs), 'must return an array');
    assert.strictEqual(
      attrs.length,
      4,
      '4 global attributes expected (Color, Storage, Brand, Weight)'
    );

    // Ordered by sort_order ascending
    assert.strictEqual(attrs[0].name, 'Culoare', 'first attribute must be Color (sort_order 1)');
    assert.strictEqual(attrs[0].type, 'select');
    assert.strictEqual(attrs[0].sort_order, 1);
    assert.strictEqual(
      attrs[0].option_count,
      2,
      'Color must have 2 offered options (Black, White)'
    );

    assert.strictEqual(attrs[1].name, 'Stocare', 'second attribute must be Storage');
    assert.strictEqual(attrs[1].option_count, 2, 'Storage must have 2 options (128, 256)');

    assert.strictEqual(attrs[2].name, 'Brand');
    assert.strictEqual(attrs[2].type, 'text');
    assert.strictEqual(attrs[2].option_count, null, 'non-select attributes have null option_count');

    assert.strictEqual(attrs[3].name, 'Greutate');
    assert.strictEqual(attrs[3].type, 'number');
    assert.strictEqual(attrs[3].option_count, null);
  } finally {
    await cleanup();
  }
});

test('listAttributes returns localized name for the requested locale', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);

    const attrsEn = await listAttributes(db, 'en');
    const names = attrsEn.map((a) => a.name);
    assert.ok(names.includes('Color'), 'en locale must return "Color"');
    assert.ok(names.includes('Storage'), 'en locale must return "Storage"');
    assert.ok(names.includes('Brand'), 'en locale must return "Brand"');
  } finally {
    await cleanup();
  }
});

test('listAttributes on an empty database returns [] with no error (regression guard for the near-? bug)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    // No seed — empty database
    const attrs = await listAttributes(db, 'ro');
    assert.ok(Array.isArray(attrs));
    assert.strictEqual(attrs.length, 0, 'empty db must return []');
  } finally {
    await cleanup();
  }
});

test('listAttributes returns [] after resetDb (no false-200 masking a broken query)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    await resetDb(db);

    const attrs = await listAttributes(db, 'ro');
    assert.strictEqual(attrs.length, 0, 'must return [] after reset with no error');
  } finally {
    await cleanup();
  }
});

test('listTranslationsByEntityIds returns translations for multiple entity IDs', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const rows = await listTranslationsByEntityIds(db, 'product_attribute_option', [
      f.optColorBlackId,
      f.optColorWhiteId,
    ]);
    assert.ok(rows.length >= 4, 'must return at least 4 rows (ro + en for each option)');
    const locales = new Set(rows.map((r) => r.locale));
    assert.ok(locales.has('ro'), 'must include ro translations');
    assert.ok(locales.has('en'), 'must include en translations');
  } finally {
    await cleanup();
  }
});

test('listTranslationsByEntityIds filters by entity_type', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    // Pass product IDs but ask for product_attribute_option type — should return nothing
    const rows = await listTranslationsByEntityIds(db, 'product_attribute_option', [
      f.simpleProductId,
      f.variantProductId,
    ]);
    assert.strictEqual(rows.length, 0, 'must return 0 when entity_type does not match');
  } finally {
    await cleanup();
  }
});

test('listTranslationsByEntityIds returns [] for empty entity IDs', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const rows = await listTranslationsByEntityIds(db, 'product_attribute_option', []);
    assert.strictEqual(rows.length, 0, 'empty input must return []');
  } finally {
    await cleanup();
  }
});

test('listTranslationsByEntityIds on empty db returns []', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const rows = await listTranslationsByEntityIds(db, 'product_attribute_option', ['any-id']);
    assert.strictEqual(rows.length, 0, 'empty db must return []');
  } finally {
    await cleanup();
  }
});
