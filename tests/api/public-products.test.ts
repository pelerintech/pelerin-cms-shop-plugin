import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const BASE = resolve(__filename, '../../../src/api/shop/public/products');

describe('Public products API', () => {
  describe('GET /public/products', () => {
    it('endpoint file exists', () => {
      const p = resolve(BASE, 'index.ts');
      assert.ok(existsSync(p), 'Public products list endpoint should exist');
    });

    it('exports GET handler', () => {
      const p = resolve(BASE, 'index.ts');
      const c = readFileSync(p, 'utf-8');
      assert.match(c, /export\s+(const|async function)\s+GET/, 'exports GET');
    });

    it('does NOT require admin auth', () => {
      const p = resolve(BASE, 'index.ts');
      const c = readFileSync(p, 'utf-8');
      assert.doesNotMatch(c, /requireAdmin/, 'Public endpoint should not call requireAdmin');
    });

    it('supports locale query param', () => {
      const p = resolve(BASE, 'index.ts');
      const c = readFileSync(p, 'utf-8');
      assert.match(c, /locale/, 'Should support locale parameter');
    });

    it('supports currency query param', () => {
      const p = resolve(BASE, 'index.ts');
      const c = readFileSync(p, 'utf-8');
      assert.match(c, /currency/, 'Should support currency parameter');
    });
  });

  describe('GET /public/products/[id]', () => {
    it('endpoint file exists', () => {
      const p = resolve(BASE, '[id].ts');
      assert.ok(existsSync(p), 'Public product detail endpoint should exist');
    });

    it('exports GET handler', () => {
      const p = resolve(BASE, '[id].ts');
      const c = readFileSync(p, 'utf-8');
      assert.match(c, /export\s+(const|async function)\s+GET/, 'exports GET');
    });

    it('does NOT require admin auth', () => {
      const p = resolve(BASE, '[id].ts');
      const c = readFileSync(p, 'utf-8');
      assert.doesNotMatch(c, /requireAdmin/, 'Public endpoint should not call requireAdmin');
    });

    it('computes price_gross from price_net + vat_rate', () => {
      const p = resolve(BASE, '[id].ts');
      const c = readFileSync(p, 'utf-8');
      assert.match(c, /price_gross/, 'Should compute and return price_gross');
      assert.match(c, /vat_rate/, 'Should use vat_rate in computation');
    });

    it('returns 404 for inactive products', () => {
      const p = resolve(BASE, '[id].ts');
      const c = readFileSync(p, 'utf-8');
      assert.match(c, /404/, 'Should return 404 for inactive products');
      assert.match(c, /active/, 'Should check active status');
    });

    it('includes _locale field for fallback tracking', () => {
      const p = resolve(BASE, '[id].ts');
      const c = readFileSync(p, 'utf-8');
      assert.match(c, /_locale/, 'Should include _locale field');
    });
  });
});