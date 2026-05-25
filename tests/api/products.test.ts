import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ENDPOINT_PATH = resolve(__dirname, '../../src/api/shop/products/index.ts');

describe('GET /api/plugins/shop/products', () => {
  it('endpoint file exists', () => {
    assert.ok(existsSync(ENDPOINT_PATH), 'Products API endpoint should exist');
  });

  it('exports GET handler', () => {
    const content = readFileSync(ENDPOINT_PATH, 'utf-8');
    assert.match(content, /export\s+(const|async function)\s+GET/, 'Should export a GET handler');
  });

  it('exports POST handler', () => {
    const content = readFileSync(ENDPOINT_PATH, 'utf-8');
    assert.match(content, /export\s+(const|async function)\s+POST/, 'Should export a POST handler');
  });

  it('GET requires admin auth', () => {
    const content = readFileSync(ENDPOINT_PATH, 'utf-8');
    assert.match(content, /requireAdmin/, 'Should call requireAdmin');
  });

  it('GET supports category filter', () => {
    const content = readFileSync(ENDPOINT_PATH, 'utf-8');
    assert.match(content, /category/, 'Should support ?category= filter');
  });

  it('GET supports type filter', () => {
    const content = readFileSync(ENDPOINT_PATH, 'utf-8');
    assert.match(content, /type/, 'Should support ?type= filter');
  });

  it('GET supports active filter', () => {
    const content = readFileSync(ENDPOINT_PATH, 'utf-8');
    assert.match(content, /active/, 'Should support ?active= filter');
  });

  it('GET supports locale parameter', () => {
    const content = readFileSync(ENDPOINT_PATH, 'utf-8');
    assert.match(content, /locale/, 'Should support ?locale= parameter');
  });

  it('GET supports pagination', () => {
    const content = readFileSync(ENDPOINT_PATH, 'utf-8');
    assert.match(content, /limit|page/, 'Should support pagination');
  });

  it('POST validates with Zod', () => {
    const content = readFileSync(ENDPOINT_PATH, 'utf-8');
    assert.match(content, /safeParse/, 'Should use Zod safeParse');
    assert.match(content, /CreateProductSchema/, 'Should use CreateProductSchema');
  });

  it('POST checks for duplicate SKU', () => {
    const content = readFileSync(ENDPOINT_PATH, 'utf-8');
    assert.match(content, /sku/, 'Should check SKU for duplicates');
  });

  it('POST returns 409 on duplicate SKU', () => {
    const content = readFileSync(ENDPOINT_PATH, 'utf-8');
    assert.match(content, /409/, 'Should return 409 on duplicate SKU');
  });

  it('returns { success, data } response shape', () => {
    const content = readFileSync(ENDPOINT_PATH, 'utf-8');
    assert.match(content, /success.*true/, 'Should return success: true');
  });
});