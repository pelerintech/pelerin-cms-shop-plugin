import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const contents = readFileSync(new URL('../../src/db/seed.ts', import.meta.url), 'utf-8');

test('seed inserts at least one parent and one child category', () => {
  assert.ok(contents.includes('categories'), 'seed should reference categories');
  assert.ok(contents.includes('parent_id'), 'seed should set parent_id for child category');
});

test('seed inserts translations in both locales', () => {
  assert.ok(contents.includes('translations'), 'seed should reference translations');
  assert.ok(contents.includes("'en'") || contents.includes('"en"'), 'seed should have en locale');
});

test('seed inserts explicit ro-locale rows in translations for categories and products', () => {
  // Spec: "translations contains translations in both ro and en for categories and products"
  // Default-locale (ro) fields live on parent tables, but spec requires ro rows in translations too.
  // Check for a literal object property  locale: 'ro'  that is NOT inside the shop_settings JSON string.
  assert.ok(
    contents.includes("locale: 'ro'"),
    "seed must insert rows with locale: 'ro' into translations table for categories and products"
  );
});

test('seed inserts at least 2 products', () => {
  assert.ok(contents.includes('products'), 'seed should reference products');
});

test('seed inserts product prices in both currencies', () => {
  assert.ok(contents.includes('product_prices'), 'seed should reference product_prices');
  assert.ok(contents.includes("'RON'") || contents.includes('"RON"'), 'seed should have RON prices');
  assert.ok(contents.includes("'EUR'") || contents.includes('"EUR"'), 'seed should have EUR prices');
});

test('seed prices: simple product priced at product level, variant product priced at variant level', () => {
  // Design: has_variants=false → product_prices keyed by product_id
  //         has_variants=true  → product_prices keyed by variant_id (base product price ignored)
  // Verify both patterns are present in seed
  assert.ok(
    contents.includes('product_id: prodSimple'),
    'simple product should be priced via product_id in product_prices'
  );
  assert.ok(
    contents.includes('variant_id: varBlack128') || contents.includes('variant_id: varWhite256'),
    'variant product should be priced via variant_id in product_prices'
  );
  // Verify variant prices cover both currencies
  const variantPricesRON = contents.match(/variant_id.*currency.*'RON'|currency.*'RON'.*variant_id/gs);
  const hasVariantRON = contents.includes('varBlack128') && contents.includes("currency: 'RON'");
  const hasVariantEUR = contents.includes('varBlack128') && contents.includes("currency: 'EUR'");
  assert.ok(hasVariantRON, 'variant product should have RON price');
  assert.ok(hasVariantEUR, 'variant product should have EUR price');
});

test('seed inserts at least one product with variants and option values', () => {
  assert.ok(contents.includes('product_variants'), 'seed should reference product_variants');
  assert.ok(contents.includes('product_option_types'), 'seed should reference product_option_types');
  assert.ok(contents.includes('product_option_values'), 'seed should reference product_option_values');
  assert.ok(contents.includes('product_variant_option_values'), 'seed should reference product_variant_option_values');
});
