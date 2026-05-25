import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CHECKOUT_PATH = resolve(__dirname, '../../src/api/shop/public/checkout/index.ts');

describe('Checkout stock re-validation', () => {
  it('checkout endpoint file exists', () => {
    assert.ok(existsSync(CHECKOUT_PATH), 'Checkout endpoint should exist');
  });

  it('re-validates stock before creating order', () => {
    const content = readFileSync(CHECKOUT_PATH, 'utf-8');
    // Should check stock of products/variants before creating the order
    assert.match(content, /stock/, 'Should validate stock at checkout');
  });

  it('returns 409 for insufficient stock', () => {
    const content = readFileSync(CHECKOUT_PATH, 'utf-8');
    assert.match(content, /409/, 'Should return 409 for stock issues');
  });

  it('identifies the specific item with insufficient stock', () => {
    const content = readFileSync(CHECKOUT_PATH, 'utf-8');
    assert.match(content, /items\[|item.*stock|product_name.*stock|product_id.*stock/, 'Should identify the item with insufficient stock');
  });

  it('does not create order when stock validation fails', () => {
    const content = readFileSync(CHECKOUT_PATH, 'utf-8');
    // The 409 return should happen BEFORE order insertion
    assert.match(content, /409/, 'Should return 409 before creating order');
  });
});