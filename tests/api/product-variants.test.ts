import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const BASE = resolve(__filename, '../../../src/api/shop/products');

describe('Product variants API', () => {
  describe('GET + POST /[id]/variants', () => {
    it('endpoint file exists', () => {
      const p = resolve(BASE, '[id]/variants/index.ts');
      assert.ok(existsSync(p), 'Variants index endpoint should exist');
    });

    it('exports GET and POST', () => {
      const p = resolve(BASE, '[id]/variants/index.ts');
      const c = readFileSync(p, 'utf-8');
      assert.match(c, /export\s+(const|async function)\s+GET/, 'exports GET');
      assert.match(c, /export\s+(const|async function)\s+POST/, 'exports POST');
    });

    it('requires admin auth', () => {
      const p = resolve(BASE, '[id]/variants/index.ts');
      const c = readFileSync(p, 'utf-8');
      assert.match(c, /requireAdmin/, 'Should call requireAdmin');
    });

    it('GET returns variants with option values and prices', () => {
      const p = resolve(BASE, '[id]/variants/index.ts');
      const c = readFileSync(p, 'utf-8');
      assert.match(c, /product_variant_option_values/, 'Should join variant option values');
      assert.match(c, /product_prices|prices/, 'Should include prices');
    });

    it('POST creates variant with option value IDs', () => {
      const p = resolve(BASE, '[id]/variants/index.ts');
      const c = readFileSync(p, 'utf-8');
      assert.match(c, /option_value_id/, 'Should accept option value IDs');
    });

    it('checks for duplicate variant combination (409)', () => {
      const p = resolve(BASE, '[id]/variants/index.ts');
      const c = readFileSync(p, 'utf-8');
      assert.match(c, /409/, 'Should return 409 on duplicate combination');
    });
  });

  describe('PUT + DELETE /[id]/variants/[variantId]', () => {
    it('endpoint file exists', () => {
      const p = resolve(BASE, '[id]/variants/[variantId].ts');
      assert.ok(existsSync(p), 'Variant detail endpoint should exist');
    });

    it('exports PUT and DELETE', () => {
      const p = resolve(BASE, '[id]/variants/[variantId].ts');
      const c = readFileSync(p, 'utf-8');
      assert.match(c, /export\s+(const|async function)\s+PUT/, 'exports PUT');
      assert.match(c, /export\s+(const|async function)\s+DELETE/, 'exports DELETE');
    });

    it('PUT updates SKU and stock', () => {
      const p = resolve(BASE, '[id]/variants/[variantId].ts');
      const c = readFileSync(p, 'utf-8');
      assert.match(c, /sku|stock/, 'Should update SKU and stock');
    });

    it('requires admin auth', () => {
      const p = resolve(BASE, '[id]/variants/[variantId].ts');
      const c = readFileSync(p, 'utf-8');
      assert.match(c, /requireAdmin/, 'Should call requireAdmin');
    });
  });
});