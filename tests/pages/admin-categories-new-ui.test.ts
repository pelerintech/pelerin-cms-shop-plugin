/**
 * Source assertions for the category new page's multi-locale UI.
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
const pagePath = join(__dirname, '../../src/pages/admin/categories/new.astro');
const source = readFileSync(pagePath, 'utf-8');

test('category new page has data-locale-codes attribute', () => {
  assert.ok(
    source.includes('data-locale-codes'),
    'Page should have data-locale-codes attribute on the form',
  );
});

test('category new page has data-default-locale attribute', () => {
  assert.ok(
    source.includes('data-default-locale'),
    'Page should have data-default-locale attribute on the form',
  );
});

test('category new page renders non-default locale sections', () => {
  assert.ok(
    source.includes('otherLocales'),
    'Page should define otherLocales variable',
  );
  assert.ok(
    source.includes('otherLocales.map'),
    'Page should iterate over otherLocales to render locale sections',
  );
});

test('category new page client script sends locale fields', () => {
  // The client <script> should iterate locale codes and send translation fields
  assert.ok(
    source.includes('localeCodes') || source.includes('locale_codes'),
    'Client script should reference locale codes',
  );
});

test('category new page has default locale section label', () => {
  assert.ok(
    source.includes('(default)'),
    'Page should label the default locale section',
  );
});

test('category new page shows warning when no locales configured', () => {
  assert.ok(
    source.includes('No locales configured'),
    'Page should show a warning when locales are not configured',
  );
  assert.ok(
    source.includes('hasLocales'),
    'Page should check hasLocales before rendering warning',
  );
});
