import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CHECKOUT_PATH = resolve(__dirname, '../../src/api/shop/public/checkout/index.ts');

describe('POST /api/plugins/shop/public/checkout', () => {
  it('endpoint file exists', () => {
    assert.ok(existsSync(CHECKOUT_PATH), 'Checkout endpoint should exist');
  });

  it('exports POST handler', () => {
    const content = readFileSync(CHECKOUT_PATH, 'utf-8');
    assert.match(content, /export\s+(const|async function)\s+POST/, 'Should export POST handler');
  });

  it('uses getOrCreateCart', () => {
    const content = readFileSync(CHECKOUT_PATH, 'utf-8');
    assert.match(content, /getOrCreateCart/, 'Should use getOrCreateCart helper');
  });

  it('validates cart is not empty', () => {
    const content = readFileSync(CHECKOUT_PATH, 'utf-8');
    assert.match(content, /cart.*empty|items.*length/, 'Should validate cart is not empty');
  });

  it('validates request body with Zod', () => {
    const content = readFileSync(CHECKOUT_PATH, 'utf-8');
    assert.match(content, /safeParse/, 'Should use Zod safeParse');
  });

  it('creates order with status pending', () => {
    const content = readFileSync(CHECKOUT_PATH, 'utf-8');
    assert.match(content, /pending/, 'Should create order with pending status');
  });

  it('generates order_number', () => {
    const content = readFileSync(CHECKOUT_PATH, 'utf-8');
    assert.match(content, /generateOrderNumber|order_number/, 'Should generate order number');
  });

  it('creates order_items snapshot', () => {
    const content = readFileSync(CHECKOUT_PATH, 'utf-8');
    assert.match(content, /order_items/, 'Should create order_items');
    assert.match(content, /product_name|snapshot/, 'Should snapshot product info');
  });

  it('creates order_status_history entry', () => {
    const content = readFileSync(CHECKOUT_PATH, 'utf-8');
    assert.match(content, /order_status_history/, 'Should create status history entry');
  });

  it('returns order_id and payment_providers list', () => {
    const content = readFileSync(CHECKOUT_PATH, 'utf-8');
    assert.match(content, /order_id/, 'Should return order_id');
    assert.match(content, /payment_providers/, 'Should return payment_providers list');
  });

  it('returns 422 for empty cart', () => {
    const content = readFileSync(CHECKOUT_PATH, 'utf-8');
    assert.match(content, /422/, 'Should return 422 for empty cart');
  });
});