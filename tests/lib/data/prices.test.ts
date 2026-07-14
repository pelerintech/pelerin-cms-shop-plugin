import { test } from 'node:test';
import assert from 'node:assert';
import { createTestDb, seedMinimal, resetDb, product_prices } from '../../db/harness.ts';
import {
  listPricesForProduct,
  listPricesForVariant,
  upsertPrice,
  deletePrice,
} from '../../../src/lib/data/products.ts';
import { eq } from 'drizzle-orm';

test('listPricesForProduct returns seeded product-level prices', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const prices = await listPricesForProduct(db, f.simpleProductId);
    assert.ok(Array.isArray(prices));
    assert.strictEqual(prices.length, 2, 'simple product has RON + EUR prices');
    const currencies = prices.map((p) => p.currency).sort();
    assert.deepStrictEqual(currencies, ['EUR', 'RON']);
    for (const p of prices) {
      assert.strictEqual(p.product_id, f.simpleProductId);
      assert.strictEqual(p.variant_id, null, 'product-level prices have variant_id null');
    }
  } finally {
    await cleanup();
  }
});

test('listPricesForProduct returns [] for an unknown product (empty case)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const prices = await listPricesForProduct(db, 'does-not-exist');
    assert.deepStrictEqual(prices, []);
  } finally {
    await cleanup();
  }
});

test('listPricesForVariant returns seeded variant-level prices and excludes product-level', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const prices = await listPricesForVariant(db, f.variantBlack128Id);
    assert.strictEqual(prices.length, 2, 'variant has RON + EUR prices');
    for (const p of prices) {
      assert.strictEqual(p.variant_id, f.variantBlack128Id);
      assert.strictEqual(p.product_id, null, 'variant-level prices have product_id null');
    }
  } finally {
    await cleanup();
  }
});

test('listPricesForVariant returns [] for an unknown variant (empty case)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const prices = await listPricesForVariant(db, 'does-not-exist');
    assert.deepStrictEqual(prices, []);
  } finally {
    await cleanup();
  }
});

test('upsertPrice inserts a new product-level price for a new currency', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    await upsertPrice(db, {
      product_id: f.simpleProductId,
      variant_id: null,
      currency: 'USD',
      price_net: 1200,
    });
    const prices = await listPricesForProduct(db, f.simpleProductId);
    assert.strictEqual(prices.length, 3, 'RON + EUR + new USD');
    const usd = prices.find((p) => p.currency === 'USD');
    assert.ok(usd, 'USD price inserted');
    assert.strictEqual(usd.price_net, 1200);
    assert.strictEqual(usd.variant_id, null);
  } finally {
    await cleanup();
  }
});

test('upsertPrice updates an existing product-level price (same currency) without creating a duplicate', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    // seeded RON price is 5000
    await upsertPrice(db, {
      product_id: f.simpleProductId,
      variant_id: null,
      currency: 'RON',
      price_net: 5500,
    });
    const prices = await listPricesForProduct(db, f.simpleProductId);
    assert.strictEqual(prices.length, 2, 'no duplicate created — still RON + EUR');
    const ron = prices.find((p) => p.currency === 'RON');
    assert.strictEqual(ron.price_net, 5500, 'price_net updated in place');
  } finally {
    await cleanup();
  }
});

test('upsertPrice is idempotent on repeat calls', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    await upsertPrice(db, {
      product_id: f.simpleProductId,
      variant_id: null,
      currency: 'RON',
      price_net: 9999,
    });
    await upsertPrice(db, {
      product_id: f.simpleProductId,
      variant_id: null,
      currency: 'RON',
      price_net: 9999,
    });
    const prices = await listPricesForProduct(db, f.simpleProductId);
    const ronRows = prices.filter((p) => p.currency === 'RON');
    assert.strictEqual(ronRows.length, 1, 'still a single RON row after two identical upserts');
    assert.strictEqual(ronRows[0].price_net, 9999);
  } finally {
    await cleanup();
  }
});

test('upsertPrice for a variant inserts and updates scoped by variant_id', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    // seeded variantBlack128 RON = 25000
    await upsertPrice(db, {
      product_id: null,
      variant_id: f.variantBlack128Id,
      currency: 'RON',
      price_net: 26000,
    });
    const prices = await listPricesForVariant(db, f.variantBlack128Id);
    assert.strictEqual(prices.length, 2, 'no duplicate — RON updated + EUR untouched');
    const ron = prices.find((p) => p.currency === 'RON');
    assert.strictEqual(ron.price_net, 26000, 'variant RON updated in place');

    // New currency for the variant
    await upsertPrice(db, {
      product_id: null,
      variant_id: f.variantBlack128Id,
      currency: 'GBP',
      price_net: 4500,
    });
    const after = await listPricesForVariant(db, f.variantBlack128Id);
    assert.strictEqual(after.length, 3, 'GBP added as a new row');
  } finally {
    await cleanup();
  }
});

test('upsertPrice does NOT collide between product-level and variant-level prices', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    // Upsert a product-level RON price for the variant product (which currently
    // only has variant-level prices). This must create a NEW product-level row,
    // not touch the variant-level RON price.
    await upsertPrice(db, {
      product_id: f.variantProductId,
      variant_id: null,
      currency: 'RON',
      price_net: 27000,
    });

    const productPrices = await listPricesForProduct(db, f.variantProductId);
    assert.strictEqual(productPrices.length, 1, 'one product-level price created');
    assert.strictEqual(productPrices[0].currency, 'RON');
    assert.strictEqual(productPrices[0].price_net, 27000);
    assert.strictEqual(productPrices[0].variant_id, null);

    // Variant-level prices untouched
    const variantPrices = await listPricesForVariant(db, f.variantBlack128Id);
    const ron = variantPrices.find((p) => p.currency === 'RON');
    assert.strictEqual(ron.price_net, 25000, 'variant-level RON price unchanged');
  } finally {
    await cleanup();
  }
});

test('upsertPrice with neither product_id nor variant_id inserts a row with both null (orphan)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    // Edge case: accessor does not guard against both-null. Document current
    // behaviour — it inserts a row with product_id=null, variant_id=null.
    await upsertPrice(db, { product_id: null, variant_id: null, currency: 'RON', price_net: 100 });
    const rows = await db.select().from(product_prices).where(eq(product_prices.currency, 'RON'));
    const orphan = rows.find((r) => r.product_id === null && r.variant_id === null);
    assert.ok(orphan, 'orphan row inserted (current behaviour — endpoint schema prevents this)');
  } finally {
    await cleanup();
  }
});

test('deletePrice removes exactly the targeted row', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const before = await listPricesForProduct(db, f.simpleProductId);
    assert.strictEqual(before.length, 2);
    const ronId = before.find((p) => p.currency === 'RON').id;

    await deletePrice(db, ronId);

    const after = await listPricesForProduct(db, f.simpleProductId);
    assert.strictEqual(after.length, 1, 'one price removed');
    assert.ok(!after.find((p) => p.currency === 'RON'), 'RON price gone');
    assert.ok(
      after.find((p) => p.currency === 'EUR'),
      'EUR price untouched'
    );
  } finally {
    await cleanup();
  }
});

test('deletePrice on a nonexistent id is a no-op (no throw)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const before = await listPricesForProduct(db, f.simpleProductId);
    await assert.doesNotReject(() => deletePrice(db, 'nonexistent-id'));
    const after = await listPricesForProduct(db, f.simpleProductId);
    assert.strictEqual(after.length, before.length, 'nothing removed');
  } finally {
    await cleanup();
  }
});

test('resetDb clears all product_prices', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    assert.ok((await listPricesForProduct(db, f.simpleProductId)).length > 0);
    await resetDb(db);
    assert.deepStrictEqual(await listPricesForProduct(db, f.simpleProductId), []);
    assert.deepStrictEqual(await listPricesForVariant(db, f.variantBlack128Id), []);
  } finally {
    await cleanup();
  }
});
