import { test } from 'node:test';
import assert from 'node:assert';
import { products as productsTable } from '../../src/db/schema.ts';
import { readFileSync } from 'node:fs';

test('src/db/schema.ts exists and uses sqliteTable from drizzle-orm/sqlite-core', () => {
  const content = readFileSync(new URL('../../src/db/schema.ts', import.meta.url), 'utf-8');
  assert.ok(
    content.includes("from 'drizzle-orm/sqlite-core'"),
    'schema.ts must import from drizzle-orm/sqlite-core'
  );
  assert.ok(content.includes('sqliteTable'), 'schema.ts must use sqliteTable');
  // Must NOT import from astro:db — that would break tests
  assert.ok(
    !content.includes("from 'astro:db'"),
    'schema.ts must NOT import from astro:db'
  );
});

test('products table object is exported and is a real drizzle table with columns', () => {
  assert.ok(productsTable, 'products must be exported from schema.ts');
  // A drizzle sqliteTable has columns accessible as properties that are column objects
  assert.ok(productsTable.id, 'products must have an id column');
  assert.ok(productsTable.sku, 'products must have a sku column');
  assert.ok(productsTable.name, 'products must have a name column');
  assert.ok(productsTable.created_at, 'products must have a created_at column');
});

test('schema.ts exports all expected table objects', async () => {
  const mod = await import('../../src/db/schema.ts');
  const expected = [
    'shop_settings', 'categories', 'products', 'product_images', 'product_variants',
    'product_attributes', 'product_attribute_options', 'product_attribute_assignments',
    'product_attribute_values', 'product_prices', 'translations', 'carts', 'cart_items',
    'orders', 'order_items', 'order_status_history', 'vouchers', 'referral_codes',
  ];
  for (const name of expected) {
    assert.ok(mod[name], `schema.ts must export ${name}`);
    assert.ok(mod[name].id, `${name} must have an id column`);
  }
});
