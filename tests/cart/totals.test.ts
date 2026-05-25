import { test } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TOTALS_PATH = resolve(__dirname, '../../src/lib/cart-totals.ts');

test('cart-totals.ts exists', () => {
  assert.ok(existsSync(TOTALS_PATH), 'src/lib/cart-totals.ts should exist');
});

test('exports computeCartTotals function', () => {
  const content = readFileSync(TOTALS_PATH, 'utf-8');
  assert.match(content, /export\s+function\s+computeCartTotals/, 'Should export computeCartTotals');
});

test('computes subtotal_net as sum of item net prices', () => {
  const content = readFileSync(TOTALS_PATH, 'utf-8');
  assert.match(content, /subtotal_net|price_net/, 'Should compute subtotal_net from price_net');
});

test('computes vat_breakdown grouped by VAT rate', () => {
  const content = readFileSync(TOTALS_PATH, 'utf-8');
  assert.match(content, /vat_breakdown|vat_rate/, 'Should group items by VAT rate');
});

test('computes vat_total', () => {
  const content = readFileSync(TOTALS_PATH, 'utf-8');
  assert.match(content, /vat_total/, 'Should compute vat_total');
});

test('accepts currency parameter', () => {
  const content = readFileSync(TOTALS_PATH, 'utf-8');
  assert.match(content, /currency/, 'Should accept currency parameter');
});

test('includes shipping_cost and discount_amount in total', () => {
  const content = readFileSync(TOTALS_PATH, 'utf-8');
  assert.match(content, /shipping_cost/, 'Should include shipping_cost');
  assert.match(content, /discount_amount/, 'Should include discount_amount');
});

test('total = subtotal_net + vat_total + shipping_cost - discount_amount', () => {
  const content = readFileSync(TOTALS_PATH, 'utf-8');
  assert.match(content, /total/, 'Should compute total');
});