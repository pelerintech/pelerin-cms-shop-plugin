import { test } from 'node:test';
import assert from 'node:assert';
import { createTestDb, seedMinimal, resetDb, insertFixture } from '../../db/harness.ts';
import {
  listAssignments,
  createAssignment,
  deleteAssignment,
  countAssignmentsByAttributeIds,
} from '../../../src/lib/data/attribute-assignments.ts';

test('listAssignments returns assignments for a product with offered_options populated for dimensions', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);

    const assignments = await listAssignments(db, f.variantProductId, 'ro');
    assert.ok(Array.isArray(assignments));
    assert.strictEqual(assignments.length, 3, 'variant product has 3 assignments (Color dim, Storage dim, Brand field)');

    const colorAssign = assignments.find(a => a.attribute_name === 'Culoare');
    assert.ok(colorAssign, 'Color assignment must exist');
    assert.strictEqual(colorAssign.role, 'dimension');
    assert.ok(Array.isArray(colorAssign.offered_options), 'dimension must have offered_options array');
    assert.strictEqual(colorAssign.offered_options!.length, 2, 'Color offers 2 options');
    assert.ok(colorAssign.offered_options![0].label, 'option must have a localized label');

    const brandAssign = assignments.find(a => a.attribute_name === 'Brand');
    assert.ok(brandAssign, 'Brand assignment must exist');
    assert.strictEqual(brandAssign.role, 'field');
    assert.strictEqual(brandAssign.offered_options, null, 'field role must have null offered_options');
  } finally {
    await cleanup();
  }
});

test('listAssignments on a product with NO assignments returns [] with no error', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    // simple product has assignments (Brand, Weight); create a fresh product with none
    const { insertFixture } = await import('../../db/harness.ts');
    await insertFixture(db, 'products', {
      id: 'p-bare', sku: null, type: 'physical', has_variants: false, vat_rate: null, stock: 1,
      category_id: null, active: true, name: 'Bare', description: null, slug: 'bare',
      created_at: new Date(), updated_at: new Date(),
    });
    const assignments = await listAssignments(db, 'p-bare', 'ro');
    assert.strictEqual(assignments.length, 0, 'product with no assignments must return []');
  } finally {
    await cleanup();
  }
});

test('listAssignments returns [] after resetDb (no false-200 masking a broken query)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    await resetDb(db);
    const assignments = await listAssignments(db, f.variantProductId, 'ro');
    assert.strictEqual(assignments.length, 0);
  } finally {
    await cleanup();
  }
});

test('createAssignment rejects non-select attribute as dimension', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    // Create a fresh text-type attribute not yet assigned to the variant product
    const { insertFixture } = await import('../../db/harness.ts');
    const freshAttrId = crypto.randomUUID();
    await insertFixture(db, 'product_attributes', { id: freshAttrId, name: 'Material', type: 'text', sort_order: 99 });
    await assert.rejects(
      () => createAssignment(db, { product_id: f.variantProductId, attribute_id: freshAttrId, role: 'dimension', sort_order: 9, offered_option_ids: ['x'] }),
      /select-type|Only select/i,
    );
  } finally {
    await cleanup();
  }
});

test('createAssignment rejects duplicate (same product + attribute)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    // Color is already assigned to variant product
    await assert.rejects(
      () => createAssignment(db, { product_id: f.variantProductId, attribute_id: f.attrColorId, role: 'dimension', sort_order: 9, offered_option_ids: [f.optColorBlackId] }),
      /already assigned|duplicate/i,
    );
  } finally {
    await cleanup();
  }
});

test('deleteAssignment rejects when variants exist (dimension with variants)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    // variant product has variants using Color dimension
    await assert.rejects(
      () => deleteAssignment(db, f.assignVariantColorId),
      /variants|409|conflict/i,
    );
  } finally {
    await cleanup();
  }
});

test('deleteAssignment succeeds for field-role assignment (no variants constraint)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    await deleteAssignment(db, f.assignVariantBrandId);
    const assignments = await listAssignments(db, f.variantProductId, 'ro');
    assert.ok(!assignments.some(a => a.attribute_name === 'Brand'), 'Brand field assignment must be gone');
  } finally {
    await cleanup();
  }
});

test('createAssignment accepts dimension with empty offered_option_ids (no subset required)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    // Fresh product (the seed variant product already has Color assigned → duplicate).
    const now = new Date();
    const freshProductId = crypto.randomUUID();
    await insertFixture(db, 'products', {
      id: freshProductId, sku: 'FP', type: 'physical', has_variants: false, vat_rate: 0.19,
      stock: 5, category_id: null, active: true, name: 'Fresh', description: '', slug: 'fresh',
      created_at: now, updated_at: now,
    });
    // Assign Color as a dimension with NO offered_option_ids subset — the new default.
    const { id } = await createAssignment(db, {
      product_id: freshProductId,
      attribute_id: f.attrColorId,
      role: 'dimension',
      sort_order: 0,
      offered_option_ids: [],
    });
    assert.ok(id, 'dimension assignment with empty offered_option_ids must succeed');
    const assignments = await listAssignments(db, freshProductId, 'ro');
    assert.ok(assignments.some(a => a.id === id), 'assignment must be persisted');
  } finally {
    await cleanup();
  }
});

test('countAssignmentsByAttributeIds returns correct counts per attribute', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    // Harness seeds:
    //   - Color (attrColorId) assigned to variant product (1 assignment)
    //   - Storage (attrStorageId) assigned to variant product (1 assignment)
    //   - Brand (attrBrandId) assigned to simple + variant (2 assignments)
    //   - Weight (attrWeightId) assigned to simple product (1 assignment)
    const counts = await countAssignmentsByAttributeIds(db, [
      f.attrColorId,
      f.attrStorageId,
      f.attrBrandId,
      f.attrWeightId,
    ]);
    assert.strictEqual(counts.get(f.attrColorId), 1, 'Color assigned to 1 product');
    assert.strictEqual(counts.get(f.attrStorageId), 1, 'Storage assigned to 1 product');
    assert.strictEqual(counts.get(f.attrBrandId), 2, 'Brand assigned to 2 products');
    assert.strictEqual(counts.get(f.attrWeightId), 1, 'Weight assigned to 1 product');
  } finally {
    await cleanup();
  }
});

test('countAssignmentsByAttributeIds skips attributes with 0 assignments', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const counts = await countAssignmentsByAttributeIds(db, [
      f.attrColorId,
      'nonexistent-attr',
    ]);
    assert.ok(counts.has(f.attrColorId), 'must have entry for Color');
    assert.ok(!counts.has('nonexistent-attr'), 'must skip nonexistent attribute');
  } finally {
    await cleanup();
  }
});

test('countAssignmentsByAttributeIds returns empty map for empty input', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const counts = await countAssignmentsByAttributeIds(db, []);
    assert.strictEqual(counts.size, 0, 'empty input must return empty map');
  } finally {
    await cleanup();
  }
});

test('countAssignmentsByAttributeIds on empty db returns empty map', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const counts = await countAssignmentsByAttributeIds(db, ['any-id']);
    assert.strictEqual(counts.size, 0, 'empty db must return empty map');
  } finally {
    await cleanup();
  }
});
