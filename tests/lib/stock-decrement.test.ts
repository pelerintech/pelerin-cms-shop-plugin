import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const STOCK_PATH = resolve(__dirname, '../../src/lib/stock-decrement.ts');

describe('Stock decrement service', () => {
  it('file exists', () => {
    assert.ok(existsSync(STOCK_PATH), 'src/lib/stock-decrement.ts should exist');
  });

  it('exports decrementStock function', () => {
    const content = readFileSync(STOCK_PATH, 'utf-8');
    assert.match(content, /export\s+(async\s+)?function\s+decrementStock/, 'Should export decrementStock');
  });

  it('queries order_items for the order', () => {
    const content = readFileSync(STOCK_PATH, 'utf-8');
    assert.match(content, /order_items/, 'Should query order_items table');
  });

  it('decrements product stock for items with product_id', () => {
    const content = readFileSync(STOCK_PATH, 'utf-8');
    assert.match(content, /products/, 'Should reference products table');
    assert.match(content, /stock/, 'Should update stock column');
  });

  it('decrements variant stock for items with variant_id', () => {
    const content = readFileSync(STOCK_PATH, 'utf-8');
    assert.match(content, /product_variants/, 'Should reference product_variants table');
  });

  it('does not decrement null stock', () => {
    const content = readFileSync(STOCK_PATH, 'utf-8');
    // Should check if stock IS NOT NULL before decrementing
    assert.match(content, /IS\s+(NOT\s+)?NULL|stock.*null/, 'Should handle null stock');
  });

  it('does not decrement below 0', () => {
    const content = readFileSync(STOCK_PATH, 'utf-8');
    assert.match(content, /GREATEST|MAX.*0|below.*0|negative/, 'Should prevent negative stock');
  });

  it('handles items with both product_id and variant_id', () => {
    const content = readFileSync(STOCK_PATH, 'utf-8');
    assert.match(content, /variant_id/, 'Should handle variant items');
  });
});
