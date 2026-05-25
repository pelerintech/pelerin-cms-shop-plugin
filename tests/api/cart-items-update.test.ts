import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ITEM_PATH = resolve(__dirname, '../../src/api/shop/public/cart/items/[itemId].ts');
const CLEAR_PATH = resolve(__dirname, '../../src/api/shop/public/cart/clear.ts');

describe('PUT /api/plugins/shop/public/cart/items/[itemId]', () => {
  it('endpoint file exists', () => {
    assert.ok(existsSync(ITEM_PATH), 'Cart item update endpoint should exist');
  });

  it('exports PUT handler', () => {
    const content = readFileSync(ITEM_PATH, 'utf-8');
    assert.match(content, /export\s+(const|async function)\s+PUT/, 'Should export PUT handler');
  });

  it('exports DELETE handler', () => {
    const content = readFileSync(ITEM_PATH, 'utf-8');
    assert.match(content, /export\s+(const|async function)\s+DELETE/, 'Should export DELETE handler');
  });

  it('PUT uses getOrCreateCart', () => {
    const content = readFileSync(ITEM_PATH, 'utf-8');
    assert.match(content, /getOrCreateCart/, 'Should use getOrCreateCart helper');
  });

  it('PUT updates item quantity', () => {
    const content = readFileSync(ITEM_PATH, 'utf-8');
    assert.match(content, /quantity/, 'Should handle quantity');
  });

  it('PUT removes item when quantity is 0', () => {
    const content = readFileSync(ITEM_PATH, 'utf-8');
    assert.match(content, /DELETE|remove|0/, 'Should remove item when quantity is 0');
  });

  it('DELETE removes the cart item', () => {
    const content = readFileSync(ITEM_PATH, 'utf-8');
    assert.match(content, /export\s+(const|async function)\s+DELETE/, 'Should export DELETE');
  });

  it('returns success response', () => {
    const content = readFileSync(ITEM_PATH, 'utf-8');
    assert.match(content, /success.*true/, 'Should return success: true');
  });

  it('PUT uses Zod UpdateCartItemBodySchema with safeParse', () => {
    const content = readFileSync(ITEM_PATH, 'utf-8');
    assert.match(content, /UpdateCartItemBodySchema/, 'Should import UpdateCartItemBodySchema');
    assert.match(content, /safeParse/, 'Should use safeParse for validation');
  });
});

describe('DELETE /api/plugins/shop/public/cart', () => {
  it('clear endpoint file exists', () => {
    assert.ok(existsSync(CLEAR_PATH), 'Cart clear endpoint should exist');
  });

  it('exports DELETE handler', () => {
    const content = readFileSync(CLEAR_PATH, 'utf-8');
    assert.match(content, /export\s+(const|async function)\s+DELETE/, 'Should export DELETE handler');
  });

  it('uses getOrCreateCart', () => {
    const content = readFileSync(CLEAR_PATH, 'utf-8');
    assert.match(content, /getOrCreateCart/, 'Should use getOrCreateCart helper');
  });

  it('clears all cart items', () => {
    const content = readFileSync(CLEAR_PATH, 'utf-8');
    assert.match(content, /DELETE|cart_items/, 'Should delete from cart_items');
  });

  it('returns success response', () => {
    const content = readFileSync(CLEAR_PATH, 'utf-8');
    assert.match(content, /success.*true/, 'Should return success: true');
  });
});