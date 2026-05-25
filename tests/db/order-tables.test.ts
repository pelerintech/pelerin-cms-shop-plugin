import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const contents = readFileSync(new URL('../../src/db/config.ts', import.meta.url), 'utf-8');

test('carts table exists', () => {
  assert.ok(contents.includes('const carts = defineTable'), 'carts table should be defined');
});

test('cart_items table exists', () => {
  assert.ok(contents.includes('const cart_items = defineTable'), 'cart_items table should be defined');
});

test('orders table exists with all address columns', () => {
  assert.ok(contents.includes('const orders = defineTable'), 'orders table should be defined');
  assert.ok(contents.includes('billing_first_name:'), 'billing_first_name column should exist');
  assert.ok(contents.includes('billing_last_name:'), 'billing_last_name column should exist');
  assert.ok(contents.includes('billing_address:'), 'billing_address column should exist');
  assert.ok(contents.includes('billing_city:'), 'billing_city column should exist');
  assert.ok(contents.includes('billing_postal_code:'), 'billing_postal_code column should exist');
  assert.ok(contents.includes('billing_country:'), 'billing_country column should exist');
  assert.ok(contents.includes('billing_county:'), 'billing_county column should exist');
  assert.ok(contents.includes('billing_phone:'), 'billing_phone column should exist');
  assert.ok(contents.includes('billing_company:'), 'billing_company column should exist');
  assert.ok(contents.includes('billing_vat_number:'), 'billing_vat_number column should exist');
  assert.ok(contents.includes('shipping_first_name:'), 'shipping_first_name column should exist');
  assert.ok(contents.includes('shipping_last_name:'), 'shipping_last_name column should exist');
  assert.ok(contents.includes('shipping_address:'), 'shipping_address column should exist');
  assert.ok(contents.includes('shipping_city:'), 'shipping_city column should exist');
  assert.ok(contents.includes('shipping_postal_code:'), 'shipping_postal_code column should exist');
  assert.ok(contents.includes('shipping_country:'), 'shipping_country column should exist');
  assert.ok(contents.includes('shipping_county:'), 'shipping_county column should exist');
  assert.ok(contents.includes('shipping_phone:'), 'shipping_phone column should exist');
  assert.ok(contents.includes('shipping_company:'), 'shipping_company column should exist');
  assert.ok(contents.includes('shipping_vat_number:'), 'shipping_vat_number column should exist');
  assert.ok(contents.includes('shipping_same_as_billing:'), 'shipping_same_as_billing column should exist');
});

test('order_items table exists', () => {
  assert.ok(contents.includes('const order_items = defineTable'), 'order_items table should be defined');
});

test('order_status_history table exists', () => {
  assert.ok(contents.includes('const order_status_history = defineTable'), 'order_status_history table should be defined');
});
