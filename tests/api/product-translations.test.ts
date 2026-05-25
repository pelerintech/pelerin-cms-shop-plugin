import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const INDEX_PATH = resolve(__dirname, '../../src/api/shop/products/[id]/translations/index.ts');
const LOCALE_PATH = resolve(__dirname, '../../src/api/shop/products/[id]/translations/[locale].ts');

describe('Product translations API', () => {
  describe('GET /[id]/translations', () => {
    it('endpoint file exists', () => {
      assert.ok(existsSync(INDEX_PATH), 'Translations index endpoint should exist');
    });

    it('exports GET handler', () => {
      const content = readFileSync(INDEX_PATH, 'utf-8');
      assert.match(content, /export\s+(const|async function)\s+GET/, 'Should export GET');
    });

    it('requires admin auth', () => {
      const content = readFileSync(INDEX_PATH, 'utf-8');
      assert.match(content, /requireAdmin/, 'Should call requireAdmin');
    });

    it('returns all locales for product', () => {
      const content = readFileSync(INDEX_PATH, 'utf-8');
      assert.match(content, /translations/, 'Should query translations table');
    });
  });

  describe('PUT /[id]/translations/[locale]', () => {
    it('endpoint file exists', () => {
      assert.ok(existsSync(LOCALE_PATH), 'Translations locale endpoint should exist');
    });

    it('exports PUT handler', () => {
      const content = readFileSync(LOCALE_PATH, 'utf-8');
      assert.match(content, /export\s+(const|async function)\s+PUT/, 'Should export PUT');
    });

    it('requires admin auth', () => {
      const content = readFileSync(LOCALE_PATH, 'utf-8');
      assert.match(content, /requireAdmin/, 'Should call requireAdmin');
    });

    it('upserts translation (creates if missing)', () => {
      const content = readFileSync(LOCALE_PATH, 'utf-8');
      assert.match(content, /insert|INSERT|upsert/, 'Should create if missing');
    });

    it('updates existing translation', () => {
      const content = readFileSync(LOCALE_PATH, 'utf-8');
      assert.match(content, /update|UPDATE/, 'Should update if exists');
    });
  });
});