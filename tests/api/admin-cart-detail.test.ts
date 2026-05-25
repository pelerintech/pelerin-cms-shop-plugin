import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CART_DETAIL_PATH = resolve(__dirname, '../../src/api/shop/carts/[id].ts');
const MANIFEST_PATH = resolve(__dirname, '../../pelerin.manifest.json');

describe('GET /api/plugins/shop/carts/[id]', () => {
  it('endpoint file exists', () => {
    assert.ok(existsSync(CART_DETAIL_PATH), 'Cart detail API endpoint should exist');
  });

  it('exports GET handler', () => {
    const content = readFileSync(CART_DETAIL_PATH, 'utf-8');
    assert.match(content, /export\s+(const|async function)\s+GET/, 'Should export GET handler');
  });

  it('requires admin auth', () => {
    const content = readFileSync(CART_DETAIL_PATH, 'utf-8');
    assert.match(content, /requireAdmin/, 'Should call requireAdmin');
  });

  it('returns cart with items and totals', () => {
    const content = readFileSync(CART_DETAIL_PATH, 'utf-8');
    assert.match(content, /cart_items/, 'Should include cart items');
  });

  it('returns 404 for non-existent cart', () => {
    const content = readFileSync(CART_DETAIL_PATH, 'utf-8');
    assert.match(content, /404/, 'Should return 404 for non-existent cart');
  });

  it('registered in manifest', () => {
    const manifest = readFileSync(MANIFEST_PATH, 'utf-8');
    assert.match(manifest, /carts\/\[id\]/, 'Should have cart detail route in manifest');
  });
});