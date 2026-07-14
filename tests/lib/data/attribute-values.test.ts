import { test } from 'node:test';
import assert from 'node:assert';
import { createTestDb, seedMinimal, resetDb } from '../../db/harness.ts';
import {
  listProductAttributeValues,
  upsertProductAttributeValue,
} from '../../../src/lib/data/attribute-values.ts';
import { product_attribute_values } from '../../../src/db/schema.ts';
import { eq } from 'drizzle-orm';

test('listProductAttributeValues returns field-role assignments with resolved values for a product', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    // Simple product has Brand="Pelerin Press" (text) and Weight=0.5 (number)
    const vals = await listProductAttributeValues(db, f.simpleProductId, 'ro');
    assert.ok(Array.isArray(vals));
    assert.strictEqual(vals.length, 2, 'simple product has 2 field assignments');

    const brand = vals.find((v) => v.attribute_name === 'Brand');
    assert.ok(brand, 'Brand field must be present');
    assert.strictEqual(brand.value, 'Pelerin Press');
    assert.strictEqual(brand.attribute_type, 'text');

    const weight = vals.find((v) => v.attribute_name === 'Greutate');
    assert.ok(weight, 'Weight field must be present');
    assert.strictEqual(weight.attribute_type, 'number');
    assert.strictEqual(weight.value, 0.5);
  } finally {
    await cleanup();
  }
});

test('listProductAttributeValues for a product with NO field assignments returns []', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    // Variant product has Brand field — but simple product has 2 fields. Create a bare product.
    const { insertFixture } = await import('../../db/harness.ts');
    await insertFixture(db, 'products', {
      id: 'p-bare',
      sku: null,
      type: 'physical',
      has_variants: false,
      vat_rate: null,
      stock: 1,
      category_id: null,
      active: true,
      name: 'Bare',
      description: null,
      slug: 'bare',
      created_at: new Date(),
      updated_at: new Date(),
    });
    const vals = await listProductAttributeValues(db, 'p-bare', 'ro');
    assert.strictEqual(vals.length, 0, 'product with no field assignments returns []');
  } finally {
    await cleanup();
  }
});

test('listProductAttributeValues returns [] after resetDb', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    await resetDb(db);
    const vals = await listProductAttributeValues(db, f.simpleProductId, 'ro');
    assert.strictEqual(vals.length, 0);
  } finally {
    await cleanup();
  }
});

test('upsertProductAttributeValue inserts a new value when none exists', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    // Remove the existing Brand value first, then upsert
    await db
      .delete(product_attribute_values)
      .where(eq(product_attribute_values.assignment_id, f.assignSimpleBrandId));
    await upsertProductAttributeValue(db, {
      entity_type: 'product',
      entity_id: f.simpleProductId,
      assignment_id: f.assignSimpleBrandId,
      value_text: 'New Brand',
    });
    const vals = await listProductAttributeValues(db, f.simpleProductId, 'ro');
    const brand = vals.find((v) => v.attribute_name === 'Brand');
    assert.strictEqual(brand?.value, 'New Brand', 'upserted value must be readable');
  } finally {
    await cleanup();
  }
});

test('upsertProductAttributeValue updates an existing value (no duplicate rows)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    // Brand already has "Pelerin Press" — upsert to "Changed"
    await upsertProductAttributeValue(db, {
      entity_type: 'product',
      entity_id: f.simpleProductId,
      assignment_id: f.assignSimpleBrandId,
      value_text: 'Changed',
    });
    const vals = await listProductAttributeValues(db, f.simpleProductId, 'ro');
    const brandVals = vals.filter((v) => v.attribute_name === 'Brand');
    assert.strictEqual(brandVals.length, 1, 'must not duplicate the value row');
    assert.strictEqual(brandVals[0].value, 'Changed');
  } finally {
    await cleanup();
  }
});
