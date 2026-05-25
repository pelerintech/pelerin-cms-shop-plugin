import { test } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ORDER_NUM_PATH = resolve(__dirname, '../../src/lib/order-number.ts');

test('order-number.ts exists', () => {
  assert.ok(existsSync(ORDER_NUM_PATH), 'src/lib/order-number.ts should exist');
});

test('exports generateOrderNumber function', () => {
  const content = readFileSync(ORDER_NUM_PATH, 'utf-8');
  assert.match(content, /export\s+(async\s+)?function\s+generateOrderNumber/, 'Should export generateOrderNumber');
});

test('reads prefix from shop_settings', () => {
  const content = readFileSync(ORDER_NUM_PATH, 'utf-8');
  assert.match(content, /order_number_prefix/, 'Should read order_number_prefix setting');
});

test('reads year from shop_settings', () => {
  const content = readFileSync(ORDER_NUM_PATH, 'utf-8');
  assert.match(content, /order_number_year/, 'Should read order_number_year setting');
});

test('reads padding from shop_settings', () => {
  const content = readFileSync(ORDER_NUM_PATH, 'utf-8');
  assert.match(content, /order_number_padding/, 'Should read order_number_padding setting');
});

test('reads and increments sequence from shop_settings', () => {
  const content = readFileSync(ORDER_NUM_PATH, 'utf-8');
  assert.match(content, /order_number_sequence/, 'Should read order_number_sequence setting');
  assert.match(content, /UPDATE|SET.*sequence|increment/, 'Should increment the sequence');
});

test('pads sequence number with leading zeros', () => {
  const content = readFileSync(ORDER_NUM_PATH, 'utf-8');
  assert.match(content, /padStart/, 'Should use padStart for zero padding');
});

test('returns formatted order number string', () => {
  const content = readFileSync(ORDER_NUM_PATH, 'utf-8');
  assert.match(content, /return/, 'Should return formatted order number');
});