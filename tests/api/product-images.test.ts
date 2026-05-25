import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BASE = resolve(__dirname, '../../src/api/shop/products');

describe('Product images API', () => {
  describe('POST /[id]/images', () => {
    it('endpoint file exists', () => {
      const p = resolve(BASE, '[id]/images/index.ts');
      assert.ok(existsSync(p), 'Images index endpoint should exist');
    });

    it('exports POST handler', () => {
      const p = resolve(BASE, '[id]/images/index.ts');
      const content = readFileSync(p, 'utf-8');
      assert.match(content, /export\s+(const|async function)\s+POST/, 'Should export POST');
    });

    it('requires admin auth', () => {
      const p = resolve(BASE, '[id]/images/index.ts');
      const content = readFileSync(p, 'utf-8');
      assert.match(content, /requireAdmin/, 'Should call requireAdmin');
    });

    it('uses sdk.storage for image upload', () => {
      const p = resolve(BASE, '[id]/images/index.ts');
      const content = readFileSync(p, 'utf-8');
      assert.match(content, /storage/, 'Should use sdk.storage');
    });
  });

  describe('DELETE /[id]/images/[imageId]', () => {
    it('endpoint file exists', () => {
      const p = resolve(BASE, '[id]/images/[imageId].ts');
      assert.ok(existsSync(p), 'Image detail endpoint should exist');
    });

    it('exports DELETE handler', () => {
      const p = resolve(BASE, '[id]/images/[imageId].ts');
      const content = readFileSync(p, 'utf-8');
      assert.match(content, /export\s+(const|async function)\s+DELETE/, 'Should export DELETE');
    });

    it('requires admin auth', () => {
      const p = resolve(BASE, '[id]/images/[imageId].ts');
      const content = readFileSync(p, 'utf-8');
      assert.match(content, /requireAdmin/, 'Should call requireAdmin');
    });

    it('calls sdk.storage.delete', () => {
      const p = resolve(BASE, '[id]/images/[imageId].ts');
      const content = readFileSync(p, 'utf-8');
      assert.match(content, /storage/, 'Should use sdk.storage for deletion');
    });
  });

  describe('PUT /[id]/images/reorder', () => {
    it('endpoint file exists', () => {
      const p = resolve(BASE, '[id]/images/reorder.ts');
      assert.ok(existsSync(p), 'Reorder endpoint should exist');
    });

    it('exports PUT handler', () => {
      const p = resolve(BASE, '[id]/images/reorder.ts');
      const content = readFileSync(p, 'utf-8');
      assert.match(content, /export\s+(const|async function)\s+PUT/, 'Should export PUT');
    });

    it('requires admin auth', () => {
      const p = resolve(BASE, '[id]/images/reorder.ts');
      const content = readFileSync(p, 'utf-8');
      assert.match(content, /requireAdmin/, 'Should call requireAdmin');
    });

    it('updates sort_order values', () => {
      const p = resolve(BASE, '[id]/images/reorder.ts');
      const content = readFileSync(p, 'utf-8');
      assert.match(content, /sort_order/, 'Should update sort_order');
    });
  });
});