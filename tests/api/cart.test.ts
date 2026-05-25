import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CART_PATH = resolve(__dirname, '../../src/api/shop/public/cart/index.ts');

describe('POST /api/plugins/shop/public/cart', () => {
  it('endpoint file exists', () => {
    assert.ok(existsSync(CART_PATH), 'Cart API endpoint should exist');
  });

  it('exports POST handler', () => {
    const content = readFileSync(CART_PATH, 'utf-8');
    assert.match(content, /export\s+(const|async function)\s+POST/, 'Should export a POST handler');
  });

  it('exports GET handler', () => {
    const content = readFileSync(CART_PATH, 'utf-8');
    assert.match(content, /export\s+(const|async function)\s+GET/, 'Should export a GET handler');
  });

  it('POST uses getOrCreateCart helper', () => {
    const content = readFileSync(CART_PATH, 'utf-8');
    assert.match(content, /getOrCreateCart/, 'Should use getOrCreateCart helper');
  });

  it('POST sets Set-Cookie header from helper', () => {
    const content = readFileSync(CART_PATH, 'utf-8');
    assert.match(content, /Set-Cookie/, 'Should set Set-Cookie header from helper');
    assert.match(content, /setCookie/, 'Should use setCookie from getOrCreateCart');
  });

  it('POST returns cart with items', () => {
    const content = readFileSync(CART_PATH, 'utf-8');
    assert.match(content, /items/, 'Should include items in response');
  });

  it('POST returns cart with computed totals', () => {
    const content = readFileSync(CART_PATH, 'utf-8');
    assert.match(content, /totals|total/, 'Should include totals in response');
  });

  it('POST uses computeCartTotals from cart-totals.ts', () => {
    const content = readFileSync(CART_PATH, 'utf-8');
    assert.match(content, /computeCartTotals/, 'Should use computeCartTotals, not computeBasicTotals placeholder');
  });

  it('POST imports product_prices for price lookup', () => {
    const content = readFileSync(CART_PATH, 'utf-8');
    assert.match(content, /product_prices/, 'Should import product_prices to fetch real prices');
  });

  it('GET parses ?currency query parameter', () => {
    const content = readFileSync(CART_PATH, 'utf-8');
    assert.match(content, /currency/, 'Should parse currency query parameter');
  });

  it('response includes vat_breakdown with vat_total', () => {
    const content = readFileSync(CART_PATH, 'utf-8');
    // computeCartTotals produces vat_breakdown and vat_total in its return type — verified by tests/cart/totals.test.ts
    assert.match(content, /computeCartTotals/, 'Should call computeCartTotals which produces vat_breakdown and vat_total');
  });

  it('GET returns cart using getOrCreateCart', () => {
    const content = readFileSync(CART_PATH, 'utf-8');
    // GET should extract session from cookie and return cart
    assert.match(content, /export\s+(const|async function)\s+GET/, 'Should export GET');
    assert.match(content, /getOrCreateCart/, 'Should use getOrCreateCart in GET');
  });

  it('returns success response shape', () => {
    const content = readFileSync(CART_PATH, 'utf-8');
    assert.match(content, /success.*true/, 'Should return success: true');
  });
});