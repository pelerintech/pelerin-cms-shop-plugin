import { test } from 'node:test';
import assert from 'node:assert';
import { createTestDb, seedMinimal, resetDb, insertFixture } from '../../db/harness.ts';
import {
  listProductAttributeValues,
  upsertProductAttributeValue,
  listVariantAttributeValues,
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

test('listProductAttributeValues exposes a select value as canonical value + option_label + option_id', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    // Add a select-type field assignment + value on the simple product.
    const assignId = crypto.randomUUID();
    await insertFixture(db, 'product_attribute_assignments', {
      id: assignId,
      product_id: f.simpleProductId,
      attribute_id: f.attrColorId,
      role: 'field',
      sort_order: 3,
      offered_option_ids: JSON.stringify([f.optColorBlackId]),
    });
    await insertFixture(db, 'product_attribute_values', {
      id: crypto.randomUUID(),
      entity_type: 'product',
      entity_id: f.simpleProductId,
      assignment_id: assignId,
      option_id: f.optColorBlackId,
      value_text: null,
      value_number: null,
      value_boolean: null,
    });
    const vals = await listProductAttributeValues(db, f.simpleProductId, 'ro');
    const color = vals.find((v) => v.attribute_id === f.attrColorId);
    assert.ok(color, 'color field value present');
    assert.strictEqual(color.attribute_type, 'select');
    assert.strictEqual(color.value, 'black', 'canonical value (not a UUID)');
    assert.strictEqual(color.option_label, 'Negru', 'option_label resolves in the locale');
    assert.strictEqual(color.option_id, f.optColorBlackId);
    assert.strictEqual(color.role, 'field', 'role present per shared AttributeValue shape');
  } finally {
    await cleanup();
  }
});

test('listVariantAttributeValues exposes option_id + canonical value + option_label for select field values', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    // A select-type FIELD assignment + a variant-level select value.
    const assignId = crypto.randomUUID();
    await insertFixture(db, 'product_attribute_assignments', {
      id: assignId,
      product_id: f.variantProductId,
      attribute_id: f.attrColorId,
      role: 'field',
      sort_order: 4,
      offered_option_ids: JSON.stringify([f.optColorBlackId, f.optColorWhiteId]),
    });
    await insertFixture(db, 'product_attribute_values', {
      id: crypto.randomUUID(),
      entity_type: 'variant',
      entity_id: f.variantBlack128Id,
      assignment_id: assignId,
      option_id: f.optColorBlackId,
      value_text: null,
      value_number: null,
      value_boolean: null,
    });
    const vals = await listVariantAttributeValues(db, f.variantBlack128Id, 'ro');
    const color = vals.find((v) => v.attribute_id === f.attrColorId);
    assert.ok(color, 'color field value present');
    assert.strictEqual(color.value, 'black', 'canonical value');
    assert.strictEqual(color.option_label, 'Negru', 'option_label');
    assert.strictEqual(color.option_id, f.optColorBlackId, 'option_id present (was missing)');
    assert.strictEqual(color.role, 'field', 'role present per shared AttributeValue shape');
  } finally {
    await cleanup();
  }
});
