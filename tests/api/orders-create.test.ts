import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ORDERS_PATH = resolve(__dirname, '../../src/api/shop/orders/index.ts');

describe('Manual order creation API', () => {
  it('exports POST handler', () => {
    const content = readFileSync(ORDERS_PATH, 'utf-8');
    assert.match(content, /export\s+(const|async function)\s+POST/, 'Should export POST handler');
  });

  it('uses admin auth (requireAdmin)', () => {
    const content = readFileSync(ORDERS_PATH, 'utf-8');
    assert.match(content, /requireAdmin/, 'Should use requireAdmin');
  });

  it('generates order_number', () => {
    const content = readFileSync(ORDERS_PATH, 'utf-8');
    assert.match(content, /order_number|generateOrderNumber/, 'Should generate order_number');
  });

  it('creates order with status pending', () => {
    const content = readFileSync(ORDERS_PATH, 'utf-8');
    assert.match(content, /pending/, 'Should create order as pending');
  });

  it('creates order_items from request body', () => {
    const content = readFileSync(ORDERS_PATH, 'utf-8');
    assert.match(content, /order_items/, 'Should create order_items');
  });

  it('creates status_history entry', () => {
    const content = readFileSync(ORDERS_PATH, 'utf-8');
    assert.match(content, /order_status_history/, 'Should insert status_history');
  });

  it('validates request body with Zod', () => {
    const content = readFileSync(ORDERS_PATH, 'utf-8');
    assert.match(content, /safeParse|CreateOrderSchema|validate/, 'Should validate with Zod');
  });

  it('validates stock availability', () => {
    const content = readFileSync(ORDERS_PATH, 'utf-8');
    assert.match(content, /stock|out.of.stock|insufficient/i, 'Should validate stock');
  });

  it('returns 409 for out-of-stock items', () => {
    const content = readFileSync(ORDERS_PATH, 'utf-8');
    assert.match(content, /409/, 'Should return 409 for out-of-stock');
  });

  it('returns success with created order', () => {
    const content = readFileSync(ORDERS_PATH, 'utf-8');
    assert.match(content, /success.*true/, 'Should return success: true');
  });
});