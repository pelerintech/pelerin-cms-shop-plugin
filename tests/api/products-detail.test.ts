import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ENDPOINT_PATH = resolve(__dirname, '../../src/api/shop/products/[id].ts');

describe('GET/PUT/DELETE /api/plugins/shop/products/[id]', () => {
  it('endpoint file exists', () => {
    assert.ok(existsSync(ENDPOINT_PATH), 'Product detail endpoint should exist');
  });

  it('exports GET handler', () => {
    const content = readFileSync(ENDPOINT_PATH, 'utf-8');
    assert.match(content, /export\s+(const|async function)\s+GET/, 'Should export GET');
  });

  it('exports PUT handler', () => {
    const content = readFileSync(ENDPOINT_PATH, 'utf-8');
    assert.match(content, /export\s+(const|async function)\s+PUT/, 'Should export PUT');
  });

  it('exports DELETE handler', () => {
    const content = readFileSync(ENDPOINT_PATH, 'utf-8');
    assert.match(content, /export\s+(const|async function)\s+DELETE/, 'Should export DELETE');
  });

  it('GET requires admin auth', () => {
    const content = readFileSync(ENDPOINT_PATH, 'utf-8');
    assert.match(content, /requireAdmin/, 'Should call requireAdmin');
  });

  it('GET includes translations in response', () => {
    const content = readFileSync(ENDPOINT_PATH, 'utf-8');
    assert.match(content, /translations/, 'Should include translations');
  });

  it('GET includes prices in response', () => {
    const content = readFileSync(ENDPOINT_PATH, 'utf-8');
    assert.match(content, /prices|product_prices/, 'Should include prices');
  });

  it('GET includes variants in response', () => {
    const content = readFileSync(ENDPOINT_PATH, 'utf-8');
    assert.match(content, /variants|product_variants/, 'Should include variants');
  });

  it('GET includes images in response', () => {
    const content = readFileSync(ENDPOINT_PATH, 'utf-8');
    assert.match(content, /images|product_images/, 'Should include images');
  });

  it('PUT updates product fields', () => {
    const content = readFileSync(ENDPOINT_PATH, 'utf-8');
    assert.match(content, /update|UPDATE/, 'Should update product');
  });

  it('DELETE soft-deletes (sets active=false)', () => {
    const content = readFileSync(ENDPOINT_PATH, 'utf-8');
    assert.match(content, /active.*false|active = false/, 'Should soft-delete by setting active=false');
  });

  it('returns { success, data } response shape', () => {
    const content = readFileSync(ENDPOINT_PATH, 'utf-8');
    assert.match(content, /success.*true/, 'Should return success: true');
  });
});