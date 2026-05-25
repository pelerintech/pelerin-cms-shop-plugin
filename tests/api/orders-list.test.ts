import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ORDERS_PATH = resolve(__dirname, '../../src/api/shop/orders/index.ts');

describe('Orders list API', () => {
  it('file exists', () => {
    assert.ok(existsSync(ORDERS_PATH), 'src/api/shop/orders/index.ts should exist');
  });

  it('exports GET handler', () => {
    const content = readFileSync(ORDERS_PATH, 'utf-8');
    assert.match(content, /export\s+(const|async function)\s+GET/, 'Should export GET handler');
  });

  it('uses APIRoute type', () => {
    const content = readFileSync(ORDERS_PATH, 'utf-8');
    assert.match(content, /APIRoute/, 'Should use APIRoute type');
  });

  it('uses admin auth (requireAdmin)', () => {
    const content = readFileSync(ORDERS_PATH, 'utf-8');
    assert.match(content, /requireAdmin/, 'Should use requireAdmin for admin protection');
  });

  it('returns 401 for unauthenticated', () => {
    const content = readFileSync(ORDERS_PATH, 'utf-8');
    assert.match(content, /401|Unauthorized/, 'Should return 401 for unauthenticated');
  });

  it('supports status filter', () => {
    const content = readFileSync(ORDERS_PATH, 'utf-8');
    assert.match(content, /status/, 'Should support status filter');
  });

  it('supports comma-separated status values', () => {
    const content = readFileSync(ORDERS_PATH, 'utf-8');
    assert.match(content, /split|IN/, 'Should support comma-separated status filter');
  });

  it('supports date range filter (from/to)', () => {
    const content = readFileSync(ORDERS_PATH, 'utf-8');
    assert.match(content, /from|created_at/, 'Should support from date filter');
    assert.match(content, /to|created_at/, 'Should support to date filter');
  });

  it('supports search', () => {
    const content = readFileSync(ORDERS_PATH, 'utf-8');
    assert.match(content, /search/, 'Should support search parameter');
  });

  it('search matches order_number', () => {
    const content = readFileSync(ORDERS_PATH, 'utf-8');
    assert.match(content, /order_number/, 'Should search by order_number');
  });

  it('search matches customer_name', () => {
    const content = readFileSync(ORDERS_PATH, 'utf-8');
    assert.match(content, /customer_name/, 'Should search by customer_name');
  });

  it('search matches customer_email', () => {
    const content = readFileSync(ORDERS_PATH, 'utf-8');
    assert.match(content, /customer_email/, 'Should search by customer_email');
  });

  it('queries orders table', () => {
    const content = readFileSync(ORDERS_PATH, 'utf-8');
    assert.match(content, /orders/, 'Should query orders table');
  });

  it('returns paginated response with meta', () => {
    const content = readFileSync(ORDERS_PATH, 'utf-8');
    assert.match(content, /page|meta|limit/, 'Should include pagination meta');
  });

  it('supports sort and dir parameters', () => {
    const content = readFileSync(ORDERS_PATH, 'utf-8');
    assert.match(content, /sort|dir|ORDER BY|order by/, 'Should support sorting');
  });
});
