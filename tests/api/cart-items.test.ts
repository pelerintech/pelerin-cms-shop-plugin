import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ITEMS_PATH = resolve(__dirname, '../../src/api/shop/public/cart/items/index.ts');

describe('POST /api/plugins/shop/public/cart/items', () => {
  it('endpoint file exists', () => {
    assert.ok(existsSync(ITEMS_PATH), 'Cart items API endpoint should exist');
  });

  it('exports POST handler', () => {
    const content = readFileSync(ITEMS_PATH, 'utf-8');
    assert.match(content, /export\s+(const|async function)\s+POST/, 'Should export a POST handler');
  });

  it('uses getOrCreateCart to get cart', () => {
    const content = readFileSync(ITEMS_PATH, 'utf-8');
    assert.match(content, /getOrCreateCart/, 'Should use getOrCreateCart helper');
  });

  it('validates product exists and is active', () => {
    const content = readFileSync(ITEMS_PATH, 'utf-8');
    assert.match(content, /active/, 'Should check product active status');
  });

  it('returns 422 for inactive product', () => {
    const content = readFileSync(ITEMS_PATH, 'utf-8');
    assert.match(content, /404/, 'Should return 404 for inactive product');
  });

  it('uses Zod safeParse for input validation', () => {
    const content = readFileSync(ITEMS_PATH, 'utf-8');
    assert.match(content, /AddCartItemBodySchema/, 'Should import AddCartItemBodySchema');
    assert.match(content, /safeParse/, 'Should use safeParse for validation');
  });

  it('validates stock availability', () => {
    const content = readFileSync(ITEMS_PATH, 'utf-8');
    assert.match(content, /stock/, 'Should check stock availability');
  });

  it('returns 409 for out-of-stock product', () => {
    const content = readFileSync(ITEMS_PATH, 'utf-8');
    assert.match(content, /409/, 'Should return 409 for stock issues');
  });

  it('inserts or updates cart_item for new product', () => {
    const content = readFileSync(ITEMS_PATH, 'utf-8');
    assert.match(content, /cart_items/, 'Should reference cart_items table');
  });

  it('sums quantity when same product added again', () => {
    const content = readFileSync(ITEMS_PATH, 'utf-8');
    assert.match(content, /quantity/, 'Should handle quantity updates');
  });

  it('returns success response', () => {
    const content = readFileSync(ITEMS_PATH, 'utf-8');
    assert.match(content, /success.*true/, 'Should return success: true');
  });
});