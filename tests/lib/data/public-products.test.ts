/**
 * Tests for the batch enrichment accessor for public product listings.
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { createTestDb, seedMinimal, insertFixture } from '../../db/harness.ts';
import { makeFakeSdk } from '../../api/helpers.ts';
import { listProducts } from '../../../src/lib/data/products.ts';
import { batchEnrichPublicProducts } from '../../../src/lib/data/public-products.ts';

test('simple product is enriched with price, images, and empty variants', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const sdk = makeFakeSdk();

    // Insert an image for the simple product
    await insertFixture(db, 'product_images', {
      id: crypto.randomUUID(),
      product_id: f.simpleProductId,
      variant_id: null,
      url: 'products/simple-book.jpg',
      alt: 'Book cover',
      sort_order: 0,
      mime: 'image/jpeg',
      size: 102400,
      width: 800,
      height: 600,
      original_filename: 'book.jpg',
    });

    const result = await listProducts(db, { locale: 'ro', active: true });
    const enriched = await batchEnrichPublicProducts(db, result.products, {
      currency: 'RON',
      sdk,
    });

    const simple = enriched.find((p: any) => p.id === f.simpleProductId);
    assert.ok(simple, 'simple product should be in enriched result');
    assert.equal(simple.currency, 'RON');
    // price_net=5000 (stored in integer cents), vat_rate=0.05 → 5000*1.05=5250
    assert.equal(simple.price_net, 5000);
    assert.equal(simple.price_gross, 5250);
    assert.equal(simple.vat_amount, 250);
    assert.ok(Array.isArray(simple.images));
    assert.equal(simple.images.length, 1);
    assert.equal(simple.images[0].url, '/uploads/products/simple-book.jpg');
    assert.equal(simple.images[0].alt, 'Book cover');
    assert.equal(simple.images[0].sort_order, 0);
    assert.ok(Array.isArray(simple.variants));
    assert.equal(simple.variants.length, 0, 'simple product has no variants');
  } finally {
    await cleanup();
  }
});

test('variant product is enriched with variants and their prices', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const sdk = makeFakeSdk();

    // Insert 2 images for the variant product
    await insertFixture(db, 'product_images', {
      id: crypto.randomUUID(),
      product_id: f.variantProductId,
      variant_id: null,
      url: 'products/phone-front.jpg',
      alt: 'Phone front',
      sort_order: 0,
      mime: 'image/jpeg',
      size: 204800,
      width: 800,
      height: 800,
      original_filename: 'phone-front.jpg',
    });
    await insertFixture(db, 'product_images', {
      id: crypto.randomUUID(),
      product_id: f.variantProductId,
      variant_id: null,
      url: 'products/phone-back.jpg',
      alt: 'Phone back',
      sort_order: 1,
      mime: 'image/jpeg',
      size: 204800,
      width: 800,
      height: 800,
      original_filename: 'phone-back.jpg',
    });

    const result = await listProducts(db, { locale: 'ro', active: true });
    const enriched = await batchEnrichPublicProducts(db, result.products, {
      currency: 'RON',
      sdk,
    });

    const variantProd = enriched.find((p: any) => p.id === f.variantProductId);
    assert.ok(variantProd, 'variant product should be in enriched result');
    assert.equal(variantProd.currency, 'RON');
    // price_net=25000 (black128 RON), vat_rate=0.19 → 25000*1.19=29750
    assert.equal(variantProd.price_net, 25000);
    assert.equal(variantProd.price_gross, 29750);
    assert.equal(variantProd.vat_amount, 4750);

    // Images: 2 items, sorted by sort_order
    assert.equal(variantProd.images.length, 2);
    assert.equal(variantProd.images[0].sort_order, 0);
    assert.equal(variantProd.images[0].url, '/uploads/products/phone-front.jpg');
    assert.equal(variantProd.images[1].sort_order, 1);
    assert.equal(variantProd.images[1].url, '/uploads/products/phone-back.jpg');

    // Variants: 2 items
    assert.equal(variantProd.variants.length, 2);
    const black128 = variantProd.variants.find((v: any) => v.id === f.variantBlack128Id);
    assert.ok(black128, 'black128 variant should be present');
    assert.equal(black128.sku, 'SMX-BLK-128');
    assert.equal(black128.stock, 50);
    assert.equal(black128.active, true);
    assert.ok(Array.isArray(black128.prices));
    assert.equal(black128.prices.length, 2, 'black128 should have RON and EUR prices');
    const ronPrice = black128.prices.find((p: any) => p.currency === 'RON');
    assert.ok(ronPrice);
    assert.equal(ronPrice.price_net, 25000);
    const eurPrice = black128.prices.find((p: any) => p.currency === 'EUR');
    assert.ok(eurPrice);
    assert.equal(eurPrice.price_net, 5000);

    const white256 = variantProd.variants.find((v: any) => v.id === f.variantWhite256Id);
    assert.ok(white256, 'white256 variant should be present');
    assert.equal(white256.sku, 'SMX-WHT-256');
    assert.equal(white256.stock, 30);
  } finally {
    await cleanup();
  }
});

test('product with no matching currency is omitted', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const sdk = makeFakeSdk();

    const result = await listProducts(db, { locale: 'ro', active: true });
    // GBP — neither product has a GBP price
    const enriched = await batchEnrichPublicProducts(db, result.products, {
      currency: 'GBP',
      sdk,
    });

    assert.equal(enriched.length, 0, 'no products should be enriched for GBP');
  } finally {
    await cleanup();
  }
});

test('empty products array returns empty array', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const sdk = makeFakeSdk();
    const enriched = await batchEnrichPublicProducts(db, [], { currency: 'RON', sdk });
    assert.ok(Array.isArray(enriched));
    assert.equal(enriched.length, 0);
  } finally {
    await cleanup();
  }
});
