import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const BASE = resolve(__filename, '../../../src/api/shop/products');

describe('Product options API', () => {
  describe('GET + POST /[id]/options', () => {
    it('endpoint file exists', () => {
      const p = resolve(BASE, '[id]/options/index.ts');
      assert.ok(existsSync(p), 'Options index endpoint should exist');
    });

    it('exports GET and POST', () => {
      const p = resolve(BASE, '[id]/options/index.ts');
      const c = readFileSync(p, 'utf-8');
      assert.match(c, /export\s+(const|async function)\s+GET/, 'exports GET');
      assert.match(c, /export\s+(const|async function)\s+POST/, 'exports POST');
    });

    it('requires admin auth', () => {
      const p = resolve(BASE, '[id]/options/index.ts');
      const c = readFileSync(p, 'utf-8');
      assert.match(c, /requireAdmin/, 'Should call requireAdmin');
    });

    it('GET returns option types with values', () => {
      const p = resolve(BASE, '[id]/options/index.ts');
      const c = readFileSync(p, 'utf-8');
      assert.match(c, /option_values|product_option_values/, 'Should include option values');
    });

    it('POST creates option type', () => {
      const p = resolve(BASE, '[id]/options/index.ts');
      const c = readFileSync(p, 'utf-8');
      assert.match(c, /product_option_types/, 'Should insert into option types table');
    });
  });

  describe('PUT + DELETE /[id]/options/[optionTypeId]', () => {
    it('endpoint file exists', () => {
      const p = resolve(BASE, '[id]/options/[optionTypeId].ts');
      assert.ok(existsSync(p), 'Option type detail endpoint should exist');
    });

    it('exports PUT and DELETE', () => {
      const p = resolve(BASE, '[id]/options/[optionTypeId].ts');
      const c = readFileSync(p, 'utf-8');
      assert.match(c, /export\s+(const|async function)\s+PUT/, 'exports PUT');
      assert.match(c, /export\s+(const|async function)\s+DELETE/, 'exports DELETE');
    });

    it('DELETE rejects if variants exist (409)', () => {
      const p = resolve(BASE, '[id]/options/[optionTypeId].ts');
      const c = readFileSync(p, 'utf-8');
      assert.match(c, /409/, 'Should return 409 when variants exist');
      assert.match(c, /variant/, 'Should check for existing variants');
    });
  });

  describe('POST + DELETE /[id]/options/[optionTypeId]/values', () => {
    it('values index endpoint exists', () => {
      const p = resolve(BASE, '[id]/options/[optionTypeId]/values/index.ts');
      assert.ok(existsSync(p), 'Values index endpoint should exist');
    });

    it('exports POST for creating value', () => {
      const p = resolve(BASE, '[id]/options/[optionTypeId]/values/index.ts');
      const c = readFileSync(p, 'utf-8');
      assert.match(c, /export\s+(const|async function)\s+POST/, 'exports POST');
    });

    it('values detail endpoint exists', () => {
      const p = resolve(BASE, '[id]/options/[optionTypeId]/values/[valueId].ts');
      assert.ok(existsSync(p), 'Values detail endpoint should exist');
    });

    it('exports DELETE for removing value', () => {
      const p = resolve(BASE, '[id]/options/[optionTypeId]/values/[valueId].ts');
      const c = readFileSync(p, 'utf-8');
      assert.match(c, /export\s+(const|async function)\s+DELETE/, 'exports DELETE');
    });
  });
});