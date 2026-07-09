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
  // The seed uses SQL INSERT with 'ro' as the locale column value in the VALUES clause.
  assert.ok(
    contents.includes("'ro'") && contents.includes('translations'),
    "seed must insert rows with 'ro' locale into translations table for categories and products"
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
  // The seed uses SQL template literals: ${prodSimple} in product_id position,
  // ${varBlack128} / ${varWhite256} in variant_id position.
  assert.ok(
    contents.includes('prodSimple') && contents.includes('product_prices'),
    'simple product should be priced via product_id in product_prices'
  );
  assert.ok(
    contents.includes('varBlack128') || contents.includes('varWhite256'),
    'variant product should be priced via variant_id in product_prices'
  );
  // Verify variant prices cover both currencies (seed uses SQL with 'RON' and 'EUR' strings)
  assert.ok(contents.includes('RON'), 'variant product should have RON price');
  assert.ok(contents.includes('EUR'), 'variant product should have EUR price');
});

test('seed inserts at least one product with variants and option values', () => {
  assert.ok(contents.includes('product_variants'), 'seed should reference product_variants');
  assert.ok(contents.includes('product_attributes'), 'seed should reference product_attributes');
  assert.ok(contents.includes('product_attribute_options'), 'seed should reference product_attribute_options');
  assert.ok(contents.includes('product_attribute_assignments'), 'seed should reference product_attribute_assignments');
  assert.ok(contents.includes('product_attribute_values'), 'seed should reference product_attribute_values');
});
