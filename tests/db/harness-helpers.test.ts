import { test } from 'node:test';
import assert from 'node:assert';
import { createTestDb, seedMinimal, resetDb, insertFixture } from './harness.ts';
import { products, categories, product_attributes, product_variants } from '../../src/db/schema.ts';
import { count } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

test('seedMinimal inserts a predictable minimal dataset', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const fixtures = await seedMinimal(db);

    // At least 1 category
    const catCount = await db.select({ n: count() }).from(categories).all();
    assert.ok(catCount[0].n >= 1, 'at least 1 category must exist');

    // Exactly 2 products (1 simple, 1 variant-bearing)
    const prodRows = await db.select().from(products).all();
    assert.strictEqual(prodRows.length, 2, 'exactly 2 products must exist');

    // Global attributes: Color, Storage, Brand, Weight (4)
    const attrRows = await db.select().from(product_attributes).all();
    assert.ok(attrRows.length >= 3, 'at least Color/Storage/Brand attributes must exist');
    const attrNames = attrRows.map((a) => a.name);
    assert.ok(
      attrNames.includes('Culoare') || attrNames.some((n) => /color/i.test(n)),
      'Color attribute must exist'
    );

    // 2 variants on the variant product
    const varRows = await db
      .select()
      .from(product_variants)
      .where(sql`${product_variants.product_id} = ${fixtures.variantProductId}`)
      .all();
    assert.strictEqual(varRows.length, 2, 'variant product must have exactly 2 variants');

    // Fixtures object exposes stable IDs
    assert.ok(fixtures.variantProductId, 'fixtures must expose variantProductId');
    assert.ok(fixtures.simpleProductId, 'fixtures must expose simpleProductId');
  } finally {
    await cleanup();
  }
});

test('resetDb clears all tables in FK-safe order', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    // Confirm data exists
    let prodRows = await db.select().from(products).all();
    assert.ok(prodRows.length > 0, 'products must exist before reset');

    await resetDb(db);

    prodRows = await db.select().from(products).all();
    assert.strictEqual(prodRows.length, 0, 'products must be empty after reset');
    const catRows = await db.select().from(categories).all();
    assert.strictEqual(catRows.length, 0, 'categories must be empty after reset');
    const attrRows = await db.select().from(product_attributes).all();
    assert.strictEqual(attrRows.length, 0, 'attributes must be empty after reset');
  } finally {
    await cleanup();
  }
});

test('insertFixture inserts rows into a table', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const before = await db.select().from(categories).all();
    assert.strictEqual(before.length, 0);

    await insertFixture(db, 'categories', {
      id: 'cat-test-1',
      parent_id: null,
      name: 'Test Category',
      description: null,
      slug: 'test-category',
      sort_order: 1,
      created_at: null,
      updated_at: null,
    });

    const after = await db.select().from(categories).all();
    assert.strictEqual(after.length, 1);
    assert.strictEqual(after[0].name, 'Test Category');
  } finally {
    await cleanup();
  }
});
