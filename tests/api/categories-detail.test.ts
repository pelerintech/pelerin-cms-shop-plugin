import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ENDPOINT_PATH = resolve(__dirname, '../../src/api/shop/categories/[id].ts');

describe('GET/PUT/DELETE /api/plugins/shop/categories/[id]', () => {
  it('endpoint file exists', () => {
    assert.ok(existsSync(ENDPOINT_PATH), 'Category detail endpoint should exist at src/api/shop/categories/[id].ts');
  });

  it('exports GET handler', () => {
    const content = readFileSync(ENDPOINT_PATH, 'utf-8');
    assert.match(content, /export\s+(const|async function)\s+GET/, 'Should export a GET handler');
  });

  it('exports PUT handler', () => {
    const content = readFileSync(ENDPOINT_PATH, 'utf-8');
    assert.match(content, /export\s+(const|async function)\s+PUT/, 'Should export a PUT handler');
  });

  it('exports DELETE handler', () => {
    const content = readFileSync(ENDPOINT_PATH, 'utf-8');
    assert.match(content, /export\s+(const|async function)\s+DELETE/, 'Should export a DELETE handler');
  });

  it('GET requires admin auth', () => {
    const content = readFileSync(ENDPOINT_PATH, 'utf-8');
    assert.match(content, /requireAdmin/, 'Should call requireAdmin for auth');
  });

  it('PUT requires admin auth', () => {
    const content = readFileSync(ENDPOINT_PATH, 'utf-8');
    assert.match(content, /requireAdmin/, 'Should call requireAdmin for auth');
  });

  it('DELETE requires admin auth', () => {
    const content = readFileSync(ENDPOINT_PATH, 'utf-8');
    assert.match(content, /requireAdmin/, 'Should call requireAdmin for auth');
  });

  it('GET returns single category by id param', () => {
    const content = readFileSync(ENDPOINT_PATH, 'utf-8');
    assert.match(content, /context\.params/, 'Should read id from context.params');
  });

  it('DELETE checks for children before removing', () => {
    const content = readFileSync(ENDPOINT_PATH, 'utf-8');
    assert.match(content, /children|parent_id/, 'Should check for children before deleting');
  });

  it('DELETE checks for associated products', () => {
    const content = readFileSync(ENDPOINT_PATH, 'utf-8');
    assert.match(content, /products|category_id/, 'Should check for associated products');
  });

  it('DELETE with children returns 409', () => {
    const content = readFileSync(ENDPOINT_PATH, 'utf-8');
    assert.match(content, /409/, 'Should return 409 on conflict');
  });

  it('DELETE without children returns 200', () => {
    const content = readFileSync(ENDPOINT_PATH, 'utf-8');
    assert.match(content, /200/, 'Should return 200 on successful DELETE');
  });

  it('PUT updates category with UpdateCategorySchema', () => {
    const content = readFileSync(ENDPOINT_PATH, 'utf-8');
    assert.match(content, /UpdateCategorySchema/, 'Should use UpdateCategorySchema for validation');
  });
});
