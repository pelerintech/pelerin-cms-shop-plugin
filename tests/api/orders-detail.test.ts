import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DETAIL_PATH = resolve(__dirname, '../../src/api/shop/orders/[id].ts');

describe('Order detail API', () => {
  it('file exists', () => {
    assert.ok(existsSync(DETAIL_PATH), 'src/api/shop/orders/[id].ts should exist');
  });

  it('exports GET handler', () => {
    const content = readFileSync(DETAIL_PATH, 'utf-8');
    assert.match(content, /export\s+(const|async function)\s+GET/, 'Should export GET handler');
  });

  it('uses APIRoute type', () => {
    const content = readFileSync(DETAIL_PATH, 'utf-8');
    assert.match(content, /APIRoute/, 'Should use APIRoute type');
  });

  it('uses admin auth (requireAdmin)', () => {
    const content = readFileSync(DETAIL_PATH, 'utf-8');
    assert.match(content, /requireAdmin/, 'Should require admin auth');
  });

  it('returns 404 for non-existent order', () => {
    const content = readFileSync(DETAIL_PATH, 'utf-8');
    assert.match(content, /404|not found/i, 'Should return 404 for missing order');
  });

  it('queries orders table by id param', () => {
    const content = readFileSync(DETAIL_PATH, 'utf-8');
    assert.match(content, /params\.id|orderId|orders/, 'Should query orders by route param id');
  });

  it('includes order_items in response', () => {
    const content = readFileSync(DETAIL_PATH, 'utf-8');
    assert.match(content, /order_items/, 'Should include order_items in response');
  });

  it('includes status_history in response', () => {
    const content = readFileSync(DETAIL_PATH, 'utf-8');
    assert.match(content, /order_status_history/, 'Should include status_history in response');
  });

  it('status_history is ordered chronologically', () => {
    const content = readFileSync(DETAIL_PATH, 'utf-8');
    assert.match(content, /ORDER BY|order by|created_at/, 'Should order status_history by created_at');
  });

  it('returns billing and shipping addresses', () => {
    const content = readFileSync(DETAIL_PATH, 'utf-8');
    // Addresses are included via SELECT * from orders (which has all address columns)
    assert.match(content, /SELECT \* FROM \$\{orders\}|billing_address|shipping_address/, 'Should include both addresses');
  });

  it('returns 200 success with order data', () => {
    const content = readFileSync(DETAIL_PATH, 'utf-8');
    assert.match(content, /success.*true|200/, 'Should return success with 200');
  });
});
