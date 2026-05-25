import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ENDPOINT_PATH = resolve(__dirname, '../../src/api/shop/categories/index.ts');

describe('GET /api/plugins/shop/categories', () => {
  it('endpoint file exists', () => {
    assert.ok(existsSync(ENDPOINT_PATH), 'Categories API endpoint should exist at src/api/shop/categories/index.ts');
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
    assert.match(content, /requireAdmin/, 'GET should call requireAdmin for auth');
  });

  it('POST requires admin auth', () => {
    const content = readFileSync(ENDPOINT_PATH, 'utf-8');
    assert.match(content, /requireAdmin/, 'POST should call requireAdmin for auth');
  });

  it('GET returns tree structure', () => {
    const content = readFileSync(ENDPOINT_PATH, 'utf-8');
    assert.match(content, /buildTree|children/, 'Should build category tree with children');
  });

  it('POST validates with Zod', () => {
    const content = readFileSync(ENDPOINT_PATH, 'utf-8');
    assert.match(content, /safeParse/, 'Should use Zod safeParse for validation');
    assert.match(content, /CreateCategorySchema/, 'Should use CreateCategorySchema');
  });

  it('returns 422 on validation failure', () => {
    const content = readFileSync(ENDPOINT_PATH, 'utf-8');
    assert.match(content, /422/, 'Should return 422 on validation failure');
    assert.match(content, /fields/, 'Should return field-level errors');
  });

  it('returns { success, data } response shape', () => {
    const content = readFileSync(ENDPOINT_PATH, 'utf-8');
    assert.match(content, /success.*true/, 'Should return success: true on success');
  });
});
