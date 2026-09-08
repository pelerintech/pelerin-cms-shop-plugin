import { test } from 'node:test';
import assert from 'node:assert';
import { createTestDb, seedMinimal, resetDb, insertFixture } from '../../db/harness.ts';
import type { Fixtures } from '../../db/harness.ts';
import {
  listVariants,
  updateVariant,
  createVariants,
  VariantError,
} from '../../../src/lib/data/variants.ts';
import { eq, and } from 'drizzle-orm';
import {
  product_prices,
  product_variants,
  products,
  product_attribute_assignments,
  product_attribute_values,
  translations,
} from '../../../src/db/schema.ts';

const NOW8 = new Date();
const rid8 = () => crypto.randomUUID();

async function seedVariantForPriceUpsert(db: any) {
  const productId = rid8();
  const variantId = rid8();
  await insertFixture(db, 'products', {
    id: productId,
    sku: 'P',
    type: 'physical',
    has_variants: true,
    vat_rate: 0.19,
    stock: null,
    category_id: null,
    active: true,
    name: 'P',
    description: '',
    slug: 'p',
    created_at: NOW8,
    updated_at: NOW8,
  });
  await insertFixture(db, 'product_variants', {
    id: variantId,
    product_id: productId,
    sku: 'V',
    stock: 5,
    active: true,
  });
  // Variant starts with an EUR own price (so the `price_net: null` delete path is exercised).
  await insertFixture(db, 'product_prices', {
    id: rid8(),
    product_id: null,
    variant_id: variantId,
    currency: 'EUR',
    price_net: 11,
  });
  return { productId, variantId };
}

test('listVariants returns variants with dimension values (localized labels) and prices per currency', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);

    const variants = await listVariants(db, f.variantProductId, 'ro');
    assert.ok(Array.isArray(variants));
    assert.strictEqual(variants.length, 2, 'variant product has 2 variants');

    for (const v of variants) {
      assert.ok(v.id);
      assert.ok(typeof v.sku === 'string');
      assert.ok(typeof v.stock === 'number');
      assert.ok(typeof v.active === 'boolean');
      // Each variant has 2 dimension values (Color + Storage) with localized labels
      assert.ok(Array.isArray(v.attributes));
      assert.strictEqual(v.attributes.length, 2, 'each variant has 2 dimension values');
      const colorAttr = v.attributes.find((a) => /Culoare|Color/.test(a.attribute_name));
      assert.ok(colorAttr, 'must have Color dimension value');
      assert.ok(colorAttr.value, 'color value must be resolved (not empty)');
      // Prices per currency
      assert.ok(Array.isArray(v.prices));
      assert.ok(v.prices.length >= 2, 'must have prices in RON + EUR');
    }
  } finally {
    await cleanup();
  }
});

test('listVariants on a product with dimensions but NO variants returns [] with no error (the currently-failing path)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    // Delete the variants but keep the dimension assignments
    const { product_variants, product_attribute_values } =
      await import('../../../src/db/schema.ts');
    const { eq } = await import('drizzle-orm');
    await db
      .delete(product_attribute_values)
      .where(eq(product_attribute_values.entity_type, 'variant'));
    await db.delete(product_variants).where(eq(product_variants.product_id, f.variantProductId));

    const variants = await listVariants(db, f.variantProductId, 'ro');
    assert.strictEqual(variants.length, 0, 'no variants must return [] — NOT a 500 error');
  } finally {
    await cleanup();
  }
});

test('listVariants on a product with NO dimensions returns []', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    // Simple product has no variants and no dimensions
    const variants = await listVariants(db, f.simpleProductId, 'ro');
    assert.strictEqual(variants.length, 0);
  } finally {
    await cleanup();
  }
});

test('listVariants returns [] after resetDb', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    await resetDb(db);
    const variants = await listVariants(db, f.variantProductId, 'ro');
    assert.strictEqual(variants.length, 0);
  } finally {
    await cleanup();
  }
});

test('updateVariant persists prices: upserts RON row and deletes EUR row when price_net is null', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const { variantId } = await seedVariantForPriceUpsert(db);
    await updateVariant(db, variantId, {
      prices: [
        { currency: 'RON', price_net: 54 },
        { currency: 'EUR', price_net: null },
      ],
    });
    const prices = await db
      .select()
      .from(product_prices)
      .where(eq(product_prices.variant_id, variantId));
    const ron = prices.find((p) => p.currency === 'RON');
    const eur = prices.find((p) => p.currency === 'EUR');
    assert.ok(ron, 'RON variant price row must be created');
    assert.strictEqual(ron!.price_net, 54);
    assert.strictEqual(eur, undefined, 'EUR variant price row must be deleted (price_net:null)');
  } finally {
    await cleanup();
  }
});

test('createVariants validates option_ids against dimension attributes FULL option sets (not offered_option_ids)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    // seedMinimal sets offered_option_ids to a subset for the variant product's
    // dimension assignments. Wipe them to [] (the new default) to prove the
    // subset is no longer the source of truth.
    await db
      .update(product_attribute_assignments)
      .set({ offered_option_ids: '[]' })
      .where(eq(product_attribute_assignments.product_id, f.variantProductId));
    // Delete existing variants so the create isn't a duplicate.
    await db
      .delete(product_attribute_values)
      .where(eq(product_attribute_values.entity_type, 'variant'));
    await db.delete(product_variants).where(eq(product_variants.product_id, f.variantProductId));

    const created = await createVariants(db, f.variantProductId, [
      { option_ids: [f.optColorBlackId], sku: 'p-black', stock: 1 },
    ]);
    assert.strictEqual(created.length, 1);
    // The dimension value row must be created even though offered_option_ids was [].
    const rows = await db
      .select()
      .from(product_attribute_values)
      .where(eq(product_attribute_values.entity_id, created[0].id));
    const colorVal = rows.find((r) => r.option_id === f.optColorBlackId);
    assert.ok(
      colorVal,
      'variant dimension value row must be created for the option (full option set used)'
    );
  } finally {
    await cleanup();
  }
});

test('listVariants returns effective_prices (own + inherited per currency) alongside own prices', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const productId = rid8();
    const variantId = rid8();
    await insertFixture(db, 'products', {
      id: productId,
      sku: 'P',
      type: 'physical',
      has_variants: true,
      vat_rate: 0.19,
      stock: null,
      category_id: null,
      active: true,
      name: 'P',
      description: '',
      slug: 'p',
      created_at: NOW8,
      updated_at: NOW8,
    });
    // Product-level prices: RON 49, EUR 11
    await insertFixture(db, 'product_prices', {
      id: rid8(),
      product_id: productId,
      variant_id: null,
      currency: 'RON',
      price_net: 49,
    });
    await insertFixture(db, 'product_prices', {
      id: rid8(),
      product_id: productId,
      variant_id: null,
      currency: 'EUR',
      price_net: 11,
    });
    // Variant own RON 54 only; EUR inherits from product
    await insertFixture(db, 'product_variants', {
      id: variantId,
      product_id: productId,
      sku: 'V',
      stock: 5,
      active: true,
    });
    await insertFixture(db, 'product_prices', {
      id: rid8(),
      product_id: null,
      variant_id: variantId,
      currency: 'RON',
      price_net: 54,
    });

    const variants = await listVariants(db, productId, 'ro');
    assert.strictEqual(variants.length, 1);
    const v = variants[0];
    // own prices
    assert.deepEqual(v.prices, [{ currency: 'RON', price_net: 54 }]);
    // effective prices: RON own (54, not inherited), EUR inherited (11)
    const eff = [...v.effective_prices].sort((a: any, b: any) =>
      a.currency.localeCompare(b.currency)
    );
    assert.deepEqual(eff, [
      { currency: 'EUR', price_net: 11, inherited: true },
      { currency: 'RON', price_net: 54, inherited: false },
    ]);
  } finally {
    await cleanup();
  }
});

test('listVariants returns canonical value + option_label + attribute_id + option_id for select dimensions', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const variants = await listVariants(db, f.variantProductId, 'ro');
    const v = variants.find((x) => x.id === f.variantBlack128Id);
    assert.ok(v, 'variant black/128 present');
    const color = v.attributes.find((a) => a.attribute_id === f.attrColorId);
    assert.ok(color, 'attribute_id present and matches attrColorId');
    assert.strictEqual(color.value, 'black', 'canonical value (never a UUID)');
    assert.strictEqual(color.option_id, f.optColorBlackId);
    assert.strictEqual(color.option_label, 'Negru');
  } finally {
    await cleanup();
  }
});

test('listVariants falls option_label back to the canonical value when no label translation exists', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    await db
      .delete(translations)
      .where(
        and(
          eq(translations.entity_type, 'product_attribute_option'),
          eq(translations.entity_id, f.optColorBlackId),
          eq(translations.locale, 'ro')
        )
      );
    const variants = await listVariants(db, f.variantProductId, 'ro');
    const v = variants.find((x) => x.id === f.variantBlack128Id);
    const color = v.attributes.find((a) => a.attribute_id === f.attrColorId);
    assert.strictEqual(color.value, 'black', 'canonical value when label missing');
    assert.strictEqual(color.option_label, 'black', 'label falls back to canonical value');
  } finally {
    await cleanup();
  }
});

test('createVariants rejects a duplicate dimension combination', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    // black + 128 already exists as variantBlack128Id.
    await assert.rejects(
      () =>
        createVariants(db, f.variantProductId, [
          { option_ids: [f.optColorBlackId, f.optStorage128Id] },
        ]),
      (err: any) => err instanceof VariantError && err.code === 'duplicate_combination'
    );
  } finally {
    await cleanup();
  }
});

// Fresh product + two real dimension assignments (color + storage) for the
// repeat-single-value and order-independence cases (seedMinimal's variant
// product already has black/128 + white/256, which would interfere).
async function seedFreshDimensionProduct(db: any, f: Fixtures) {
  const pid = crypto.randomUUID();
  await insertFixture(db, 'products', {
    id: pid,
    sku: 'DIM-PROD',
    type: 'physical',
    has_variants: true,
    vat_rate: 0.19,
    stock: null,
    category_id: null,
    active: true,
    name: 'Dim Prod',
    description: '',
    slug: 'dim-prod',
    created_at: new Date(),
    updated_at: new Date(),
  });
  await insertFixture(db, 'product_attribute_assignments', {
    id: crypto.randomUUID(),
    product_id: pid,
    attribute_id: f.attrColorId,
    role: 'dimension',
    sort_order: 1,
    offered_option_ids: JSON.stringify([f.optColorBlackId, f.optColorWhiteId]),
  });
  await insertFixture(db, 'product_attribute_assignments', {
    id: crypto.randomUUID(),
    product_id: pid,
    attribute_id: f.attrStorageId,
    role: 'dimension',
    sort_order: 2,
    offered_option_ids: JSON.stringify([f.optStorage128Id, f.optStorage256Id]),
  });
  return pid;
}

test('createVariants detects a duplicate combination regardless of option order', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const pid = await seedFreshDimensionProduct(db, f);
    await createVariants(db, pid, [{ option_ids: [f.optColorBlackId, f.optStorage128Id] }]);
    await assert.rejects(
      () => createVariants(db, pid, [{ option_ids: [f.optStorage128Id, f.optColorBlackId] }]),
      (err: any) => err instanceof VariantError && err.code === 'duplicate_combination'
    );
  } finally {
    await cleanup();
  }
});
