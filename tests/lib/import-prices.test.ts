/**
 * Tests for src/lib/import-prices.ts — price CSV upsert logic.
 *
 * Runs against the real-SQLite harness. importPrices receives an injected `db`,
 * validates each row, checks the currency against configured currencies, finds
 * the product or variant by SKU, and upserts the per-currency price. Invalid
 * rows are reported per-row without aborting.
 *
 * Also exercises the new findVariantBySku accessor against populated and empty
 * data (the §6.5 smoke coverage).
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { eq, and } from 'drizzle-orm';
import { createTestDb, seedMinimal, product_prices } from '../db/harness.ts';
import { importPrices } from '../../src/lib/import-prices.ts';
import { findVariantBySku } from '../../src/lib/data/variants.ts';

test('importPrices upserts a price for an existing product SKU', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    // BOOK-001 seeded with RON=5000
    const rows = [{ sku: 'BOOK-001', currency: 'RON', price_net: '5500' }];
    const result = await importPrices(db, rows);
    assert.strictEqual(result.total, 1);
    assert.strictEqual(result.updated, 1);
    assert.strictEqual(result.errors.length, 0);

    const prodPrices = await db.select().from(product_prices).where(eq(product_prices.product_id, f.simpleProductId));
    const ron = prodPrices.find(p => p.currency === 'RON' && p.variant_id === null);
    assert.strictEqual(ron.price_net, 5500, 'product price updated in place');
  } finally {
    await cleanup();
  }
});

test('importPrices inserts a new price for a configured currency the product lacks (no duplicate)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    // Create a fresh product with a SKU and NO prices, then import a RON price.
    const { createProduct } = await import('../../src/lib/data/products.ts');
    const newId = await createProduct(db, {
      sku: 'NOPRICE-001', type: 'physical', has_variants: false, vat_rate: null, stock: null,
      category_id: null, active: true, name: 'No Price', description: null, slug: 'no-price',
    });
    const rows = [{ sku: 'NOPRICE-001', currency: 'RON', price_net: '600' }];
    const result = await importPrices(db, rows);
    assert.strictEqual(result.updated, 1);
    const prodPrices = await db.select().from(product_prices).where(eq(product_prices.product_id, newId));
    assert.strictEqual(prodPrices.length, 1, 'one price inserted, no duplicate');
    assert.strictEqual(prodPrices[0].currency, 'RON');
    assert.strictEqual(prodPrices[0].price_net, 600);
  } finally {
    await cleanup();
  }
});

test('importPrices upserts a price for an existing variant SKU', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    // SMX-BLK-128 seeded variant RON=25000
    const rows = [{ sku: 'SMX-BLK-128', currency: 'RON', price_net: '26000' }];
    const result = await importPrices(db, rows);
    assert.strictEqual(result.updated, 1);
    assert.strictEqual(result.errors.length, 0);

    const variantPrices = await db.select().from(product_prices).where(eq(product_prices.variant_id, f.variantBlack128Id));
    const ron = variantPrices.find(p => p.currency === 'RON');
    assert.strictEqual(ron.price_net, 26000, 'variant price updated in place');
    assert.strictEqual(variantPrices.length, 2, 'EUR untouched, no duplicate');
  } finally {
    await cleanup();
  }
});

test('importPrices reports unknown currency per-row and continues valid rows', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const rows = [
      { sku: 'BOOK-001', currency: 'RON', price_net: '100' },     // ok
      { sku: 'BOOK-001', currency: 'XYZ', price_net: '200' },     // unknown currency
      { sku: 'BOOK-001', currency: 'EUR', price_net: '300' },     // ok
    ];
    const result = await importPrices(db, rows);
    assert.strictEqual(result.total, 3);
    assert.strictEqual(result.updated, 2);
    assert.strictEqual(result.errors.length, 1);
    assert.strictEqual(result.errors[0].row, 3, 'second data row');
    assert.ok(result.errors[0].error.toLowerCase().includes('currency'), 'error mentions currency');
  } finally {
    await cleanup();
  }
});

test('importPrices reports unknown SKU per-row and continues valid rows', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const rows = [
      { sku: 'BOOK-001', currency: 'RON', price_net: '100' },     // ok
      { sku: 'NOPE-999', currency: 'RON', price_net: '200' },     // unknown sku
    ];
    const result = await importPrices(db, rows);
    assert.strictEqual(result.updated, 1);
    assert.strictEqual(result.errors.length, 1);
    assert.strictEqual(result.errors[0].sku, 'NOPE-999');
    assert.ok(result.errors[0].error.toLowerCase().includes('sku'), 'error mentions sku');
  } finally {
    await cleanup();
  }
});

test('importPrices reports negative price_net per-row', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const rows = [{ sku: 'BOOK-001', currency: 'RON', price_net: '-50' }];
    const result = await importPrices(db, rows);
    assert.strictEqual(result.updated, 0);
    assert.strictEqual(result.errors.length, 1);
  } finally {
    await cleanup();
  }
});

test('importPrices on empty rows returns zeroed result', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const result = await importPrices(db, []);
    assert.strictEqual(result.total, 0);
    assert.strictEqual(result.updated, 0);
    assert.strictEqual(result.errors.length, 0);
  } finally {
    await cleanup();
  }
});

test('importPrices works on empty (unseeded) db — all rows error as unknown SKU', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const rows = [
      { sku: 'X-1', currency: 'RON', price_net: '10' },
      { sku: 'X-2', currency: 'EUR', price_net: '20' },
    ];
    const result = await importPrices(db, rows);
    assert.strictEqual(result.updated, 0);
    assert.strictEqual(result.errors.length, 2, 'no products exist → both unknown SKU');
  } finally {
    await cleanup();
  }
});

// ── Data-accessor smoke coverage (§6.5) ──

test('findVariantBySku returns the variant on populated db', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const v = await findVariantBySku(db, 'SMX-BLK-128');
    assert.ok(v);
    assert.strictEqual(v.sku, 'SMX-BLK-128');
  } finally {
    await cleanup();
  }
});

test('findVariantBySku returns null for unknown SKU / empty db', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    assert.strictEqual(await findVariantBySku(db, 'SMX-BLK-128'), null);
    await seedMinimal(db);
    assert.strictEqual(await findVariantBySku(db, 'NOPE'), null);
    // product SKU should NOT match variant lookup
    assert.strictEqual(await findVariantBySku(db, 'BOOK-001'), null);
  } finally {
    await cleanup();
  }
});
