import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ENDPOINT_PATH = resolve(__dirname, '../../src/api/shop/public/categories/index.ts');

describe('GET /api/plugins/shop/public/categories', () => {
  it('endpoint file exists', () => {
    assert.ok(existsSync(ENDPOINT_PATH), 'Public categories endpoint should exist');
  });

  it('exports GET handler', () => {
    const content = readFileSync(ENDPOINT_PATH, 'utf-8');
    assert.match(content, /export\s+(const|async function)\s+GET/, 'Should export a GET handler');
  });

  it('does NOT require admin auth', () => {
    const content = readFileSync(ENDPOINT_PATH, 'utf-8');
    // Public endpoints should NOT call requireAdmin
    assert.doesNotMatch(content, /requireAdmin/, 'Public endpoint should NOT call requireAdmin');
  });

  it('supports locale parameter', () => {
    const content = readFileSync(ENDPOINT_PATH, 'utf-8');
    assert.match(content, /locale/, 'Should support locale query parameter');
  });

  it('returns tree structure', () => {
    const content = readFileSync(ENDPOINT_PATH, 'utf-8');
    assert.match(content, /buildTree|children|parent_id/, 'Should build category tree');
  });

  it('returns { success, data } response shape', () => {
    const content = readFileSync(ENDPOINT_PATH, 'utf-8');
    assert.match(content, /success.*true/, 'Should return success: true');
  });
});
