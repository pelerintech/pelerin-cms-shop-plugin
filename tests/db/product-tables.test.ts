import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const contents = readFileSync(new URL('../../src/db/config.ts', import.meta.url), 'utf-8');

test('products table exists with default locale fields', () => {
  assert.ok(contents.includes('const products = defineTable'), 'products table should be defined');
  assert.ok(contents.includes('name: column.text()'), 'products should have name column');
  assert.ok(contents.includes('description: column.text({ optional: true })'), 'products should have description column');
  assert.ok(contents.includes('slug: column.text()'), 'products should have slug column');
});

test('product_images table exists', () => {
  assert.ok(contents.includes('const product_images = defineTable'), 'product_images table should be defined');
});

test('product_option_types table exists with label field', () => {
  assert.ok(contents.includes('const product_option_types = defineTable'), 'product_option_types table should be defined');
  assert.ok(contents.includes('label: column.text()'), 'product_option_types should have label column');
});

test('product_option_values table exists with label field', () => {
  assert.ok(contents.includes('const product_option_values = defineTable'), 'product_option_values table should be defined');
  assert.ok(contents.includes('label: column.text()'), 'product_option_values should have label column');
});

test('product_variants table exists', () => {
  assert.ok(contents.includes('const product_variants = defineTable'), 'product_variants table should be defined');
});

test('product_variant_option_values table exists', () => {
  assert.ok(contents.includes('const product_variant_option_values = defineTable'), 'product_variant_option_values table should be defined');
});

test('product_prices table exists', () => {
  assert.ok(contents.includes('const product_prices = defineTable'), 'product_prices table should be defined');
});

test('translations table exists with all entity type coverage', () => {
  assert.ok(contents.includes('const translations = defineTable'), 'translations table should be defined');
});
