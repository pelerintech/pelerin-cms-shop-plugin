/**
 * Static structure test for src/pages/admin/import/index.astro — the bulk
 * import hub page (Request shop-r7-bulk-import, Task 9).
 *
 * Per AGENTS.md §14, static page tests are NOT behavioral — they only prove the
 * source contains expected strings (imports, element ids, classes, breadcrumbs).
 * Runtime UI behavior is covered by Tier 4 (Playwright). This file closes the
 * evaluation gap (2026-06-24) that flagged the Admin UI capability as PARTIAL
 * solely because no Tier 3 static test existed for this page.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PAGE_PATH = resolve(__dirname, '../../src/pages/admin/import/index.astro');

describe('admin import hub page — static structure', () => {
  const source = readFileSync(PAGE_PATH, 'utf-8');

  it('page file exists with content', () => {
    assert.ok(source.length > 0, 'import hub page should have content');
  });

  it('uses the admin layout + requires admin auth', () => {
    assert.match(source, /pelerin:admin-layout/, 'imports AdminLayout');
    assert.match(source, /sdk\.auth\.requireAdmin/, 'guards the page with requireAdmin');
    assert.match(
      source,
      /currentPath="\/admin\/plugins\/shop\/import"/,
      'currentPath matches the manifest pattern for sidebar highlight'
    );
  });

  it('renders two upload forms: products and prices', () => {
    assert.match(source, /id="products-form"/, 'products form present');
    assert.match(source, /id="prices-form"/, 'prices form present');
    assert.match(source, /id="products-file"/, 'products file input present');
    assert.match(source, /id="prices-file"/, 'prices file input present');
  });

  it('each form has a Download Template anchor with the right filename', () => {
    assert.match(source, /download="products-template\.csv"/, 'products template download anchor');
    assert.match(source, /download="prices-template\.csv"/, 'prices template download anchor');
  });

  it('product template CSV has the correct headers', () => {
    assert.match(
      source,
      /sku,name_ro,name_en,description_ro,description_en,type,category_slug,vat_rate,stock/,
      'product template headers match the brief CSV format'
    );
  });

  it('price template CSV has the correct headers', () => {
    assert.match(
      source,
      /sku,currency,price_net/,
      'price template headers match the brief CSV format'
    );
  });

  it('has result containers for both forms', () => {
    assert.match(source, /id="products-result"/, 'products result container present');
    assert.match(source, /id="prices-result"/, 'prices result container present');
  });

  it('client script wires both forms to their import endpoints', () => {
    assert.match(
      source,
      /wireForm\(\s*['"]products-form['"]\s*,\s*['"]\/api\/plugins\/shop\/import\/products['"]/,
      'products form wired to product import endpoint'
    );
    assert.match(
      source,
      /wireForm\(\s*['"]prices-form['"]\s*,\s*['"]\/api\/plugins\/shop\/import\/prices['"]/,
      'prices form wired to price import endpoint'
    );
  });
});
