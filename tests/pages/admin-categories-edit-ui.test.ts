/**
 * Source assertions for the category edit page's multi-locale UI.
 *
 * Verifies the page source contains the expected data attributes and
 * locale-aware section structure.
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pagePath = join(__dirname, '../../src/pages/admin/categories/[id].astro');
const source = readFileSync(pagePath, 'utf-8');

test('category edit page has data-locale-codes attribute', () => {
  assert.ok(
    source.includes('data-locale-codes'),
    'Page should have data-locale-codes attribute on the form',
  );
});

test('category edit page has data-default-locale attribute', () => {
  assert.ok(
    source.includes('data-default-locale'),
    'Page should have data-default-locale attribute on the form',
  );
});

test('category edit page fetches translations via listTranslations', () => {
  assert.ok(
    source.includes('listTranslations'),
    'Page should import and call listTranslations',
  );
  assert.ok(
    source.includes("listTranslations(sdk.db, 'category', id)"),
    'Page should call listTranslations with entity_type=category',
  );
});

test('category edit page renders non-default locale sections', () => {
  assert.ok(
    source.includes('otherLocales'),
    'Page should define otherLocales variable',
  );
  assert.ok(
    source.includes('otherLocales.map'),
    'Page should iterate over otherLocales to render locale sections',
  );
});

test('category edit page client script sends locale fields', () => {
  // The client <script> should iterate locale codes and send translation fields
  assert.ok(
    source.includes('localeCodes') || source.includes('locale_codes'),
    'Client script should reference locale codes',
  );
});

test('category edit page has translationByLocale mapping', () => {
  assert.ok(
    source.includes('translationByLocale'),
    'Page should map translations by locale for pre-population',
  );
});

test('category edit page shows warning when no locales configured', () => {
  assert.ok(
    source.includes('No locales configured'),
    'Page should show a warning when locales are not configured',
  );
  assert.ok(
    source.includes('hasLocales'),
    'Page should check hasLocales before rendering warning',
  );
});

test('category edit page uses SearchSelect for parent category with excludeId', () => {
  assert.ok(
    source.includes('<SearchSelect'),
    'Page should use SearchSelect component for parent category field',
  );
  assert.ok(
    source.includes('excludeId'),
    'SearchSelect should have excludeId to prevent self-parenting',
  );
  assert.ok(
    !source.includes('options={parentOptions}'),
    'Page should NOT use options={parentOptions} for parent category (replaced by SearchSelect)',
  );
});
