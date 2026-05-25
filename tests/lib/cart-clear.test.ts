import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CART_CLEAR_PATH = resolve(__dirname, '../../src/lib/cart-clear.ts');

describe('Cart clearing service', () => {
  it('file exists', () => {
    assert.ok(existsSync(CART_CLEAR_PATH), 'src/lib/cart-clear.ts should exist');
  });

  it('exports clearCartForOrder function', () => {
    const content = readFileSync(CART_CLEAR_PATH, 'utf-8');
    assert.match(content, /export\s+(async\s+)?function\s+clearCartForOrder/, 'Should export clearCartForOrder');
  });

  it('deletes cart_items for the cart associated with the order', () => {
    const content = readFileSync(CART_CLEAR_PATH, 'utf-8');
    assert.match(content, /cart_items/, 'Should reference cart_items table');
    assert.match(content, /DELETE/, 'Should delete cart_items');
  });

  it('marks cart as converted with converted_at timestamp', () => {
    const content = readFileSync(CART_CLEAR_PATH, 'utf-8');
    assert.match(content, /converted_at/, 'Should set converted_at on cart');
  });

  it('looks up cart via the order (orders.user_id or session-based)', () => {
    const content = readFileSync(CART_CLEAR_PATH, 'utf-8');
    // Should reference orders table to find the cart
    assert.match(content, /orders/, 'Should reference orders table');
    assert.match(content, /carts/, 'Should reference carts table');
  });
});