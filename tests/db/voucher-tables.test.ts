import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const contents = readFileSync(new URL('../../src/db/config.ts', import.meta.url), 'utf-8');

test('vouchers table exists', () => {
  assert.ok(contents.includes('const vouchers = defineTable'), 'vouchers table should be defined');
});

test('referral_codes table exists', () => {
  assert.ok(contents.includes('const referral_codes = defineTable'), 'referral_codes table should be defined');
});

test('defineDb includes all tables', () => {
  const dbMatch = contents.match(/defineDb\(\{\s*tables: \{([\s\S]*?)\},?\s*\}\)/);
  assert.ok(dbMatch, 'defineDb call should exist');
  const tableSection = dbMatch[1];
  assert.ok(tableSection.includes('shop_settings'), 'defineDb should include shop_settings');
  assert.ok(tableSection.includes('categories'), 'defineDb should include categories');
  assert.ok(tableSection.includes('products'), 'defineDb should include products');
  assert.ok(tableSection.includes('product_images'), 'defineDb should include product_images');
  assert.ok(tableSection.includes('product_option_types'), 'defineDb should include product_option_types');
  assert.ok(tableSection.includes('product_option_values'), 'defineDb should include product_option_values');
  assert.ok(tableSection.includes('product_variants'), 'defineDb should include product_variants');
  assert.ok(tableSection.includes('product_variant_option_values'), 'defineDb should include product_variant_option_values');
  assert.ok(tableSection.includes('product_prices'), 'defineDb should include product_prices');
  assert.ok(tableSection.includes('translations'), 'defineDb should include translations');
  assert.ok(tableSection.includes('carts'), 'defineDb should include carts');
  assert.ok(tableSection.includes('cart_items'), 'defineDb should include cart_items');
  assert.ok(tableSection.includes('orders'), 'defineDb should include orders');
  assert.ok(tableSection.includes('order_items'), 'defineDb should include order_items');
  assert.ok(tableSection.includes('order_status_history'), 'defineDb should include order_status_history');
  assert.ok(tableSection.includes('vouchers'), 'defineDb should include vouchers');
  assert.ok(tableSection.includes('referral_codes'), 'defineDb should include referral_codes');
  assert.ok(!tableSection.includes('shop_locales'), 'defineDb should NOT include shop_locales');
  assert.ok(!tableSection.includes('shop_currencies'), 'defineDb should NOT include shop_currencies');
});
