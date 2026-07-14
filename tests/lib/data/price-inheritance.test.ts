/**
 * Tests for per-currency variant price inheritance (Tasks 6-7 of shop-r15).
 *
 * Variant effective price for currency C = own row if exists, else product's
 * row. Each currency inherits independently.
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { createTestDb, insertFixture } from '../../db/harness.ts';
import { getEffectiveVariantPrices } from '../../../src/lib/data/variants.ts';
import { eq } from 'drizzle-orm';
import { product_prices, product_variants, products } from '../../../src/db/schema.ts';

const NOW = new Date();
const rid = () => crypto.randomUUID();

async function seedProductWithPrices(
  db: any,
  productId: string,
  prices: { currency: string; price_net: number }[]
) {
  await insertFixture(db, 'products', {
    id: productId,
    sku: 'P-001',
    type: 'physical',
    has_variants: false,
    vat_rate: 0.19,
    stock: 10,
    category_id: null,
    active: true,
    name: 'Test Product',
    description: '',
    slug: 'test-product',
    created_at: NOW,
    updated_at: NOW,
  });
  for (const p of prices) {
    await insertFixture(db, 'product_prices', {
      id: rid(),
      product_id: productId,
      variant_id: null,
      currency: p.currency,
      price_net: p.price_net,
    });
  }
}

async function seedVariant(
  db: any,
  variantId: string,
  productId: string,
  prices: { currency: string; price_net: number }[]
) {
  await insertFixture(db, 'product_variants', {
    id: variantId,
    product_id: productId,
    sku: 'V-001',
    stock: 5,
    active: true,
  });
  for (const p of prices) {
    await insertFixture(db, 'product_prices', {
      id: rid(),
      product_id: null,
      variant_id: variantId,
      currency: p.currency,
      price_net: p.price_net,
    });
  }
}

test('getEffectiveVariantPrices: variant with own RON only inherits EUR from product', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const productId = rid();
    const variantId = rid();
    await seedProductWithPrices(db, productId, [
      { currency: 'RON', price_net: 49 },
      { currency: 'EUR', price_net: 11 },
    ]);
    await seedVariant(db, variantId, productId, [{ currency: 'RON', price_net: 54 }]);

    const effective = await getEffectiveVariantPrices(db, variantId, productId);
    effective.sort((a: any, b: any) => a.currency.localeCompare(b.currency));
    assert.deepEqual(effective, [
      { currency: 'EUR', price_net: 11, inherited: true },
      { currency: 'RON', price_net: 54, inherited: false },
    ]);
  } finally {
    await cleanup();
  }
});

test('getEffectiveVariantPrices: variant with all own prices → both inherited:false', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const productId = rid();
    const variantId = rid();
    await seedProductWithPrices(db, productId, [
      { currency: 'RON', price_net: 49 },
      { currency: 'EUR', price_net: 11 },
    ]);
    await seedVariant(db, variantId, productId, [
      { currency: 'RON', price_net: 54 },
      { currency: 'EUR', price_net: 12 },
    ]);
    const effective = await getEffectiveVariantPrices(db, variantId, productId);
    effective.sort((a: any, b: any) => a.currency.localeCompare(b.currency));
    assert.deepEqual(effective, [
      { currency: 'EUR', price_net: 12, inherited: false },
      { currency: 'RON', price_net: 54, inherited: false },
    ]);
  } finally {
    await cleanup();
  }
});

test('getEffectiveVariantPrices: variant with no own prices → all inherited', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const productId = rid();
    const variantId = rid();
    await seedProductWithPrices(db, productId, [
      { currency: 'RON', price_net: 49 },
      { currency: 'EUR', price_net: 11 },
    ]);
    await seedVariant(db, variantId, productId, []);
    const effective = await getEffectiveVariantPrices(db, variantId, productId);
    effective.sort((a: any, b: any) => a.currency.localeCompare(b.currency));
    assert.deepEqual(effective, [
      { currency: 'EUR', price_net: 11, inherited: true },
      { currency: 'RON', price_net: 49, inherited: true },
    ]);
  } finally {
    await cleanup();
  }
});

test('getEffectiveVariantPrices: product with no prices and variant with no prices → empty', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const productId = rid();
    const variantId = rid();
    await seedProductWithPrices(db, productId, []);
    await seedVariant(db, variantId, productId, []);
    const effective = await getEffectiveVariantPrices(db, variantId, productId);
    assert.deepEqual(effective, []);
  } finally {
    await cleanup();
  }
});

test('getEffectiveVariantPrices: variant own row deleted → currency reverts to inherited product price', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const productId = rid();
    const variantId = rid();
    await seedProductWithPrices(db, productId, [{ currency: 'RON', price_net: 49 }]);
    await seedVariant(db, variantId, productId, [{ currency: 'RON', price_net: 54 }]);
    // Simulate "clear and save = revert" by deleting the variant's RON row.
    await db.delete(product_prices).where(eq(product_prices.variant_id, variantId));
    const effective = await getEffectiveVariantPrices(db, variantId, productId);
    assert.deepEqual(effective, [{ currency: 'RON', price_net: 49, inherited: true }]);
  } finally {
    await cleanup();
  }
});
