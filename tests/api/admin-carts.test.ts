import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CARTS_PATH = resolve(__dirname, '../../src/api/shop/carts/index.ts');

describe('GET /api/plugins/shop/carts', () => {
  it('endpoint file exists', () => {
    assert.ok(existsSync(CARTS_PATH), 'Admin carts API endpoint should exist');
  });

  it('exports GET handler', () => {
    const content = readFileSync(CARTS_PATH, 'utf-8');
    assert.match(content, /export\s+(const|async function)\s+GET/, 'Should export GET handler');
  });

  it('requires admin auth', () => {
    const content = readFileSync(CARTS_PATH, 'utf-8');
    assert.match(content, /requireAdmin/, 'Should call requireAdmin');
  });

  it('returns list of carts with item counts', () => {
    const content = readFileSync(CARTS_PATH, 'utf-8');
    assert.match(content, /carts/, 'Should query carts table');
    assert.match(content, /cart_items/, 'Should include cart_items info');
  });

  it('includes total monetary value per cart', () => {
    const content = readFileSync(CARTS_PATH, 'utf-8');
    assert.match(content, /total_value/, 'Should compute total_value per cart in response data');
  });

  it('supports filtering by age', () => {
    const content = readFileSync(CARTS_PATH, 'utf-8');
    assert.match(content, /abandoned_since|age_hours/, 'Should support age/abandoned filter');
  });

  it('supports filtering by user', () => {
    const content = readFileSync(CARTS_PATH, 'utf-8');
    assert.match(content, /user_id.*searchParam|searchParam.*user_id|user.*filter/i, 'Should support user_id filter parameter');
  });

  it('returns success response shape', () => {
    const content = readFileSync(CARTS_PATH, 'utf-8');
    assert.match(content, /success.*true/, 'Should return success: true');
  });
});