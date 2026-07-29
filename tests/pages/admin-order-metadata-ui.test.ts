/**
 * Tier 3 — Admin order detail page: Metadata section display.
 *
 * Checks the page source for the "Metadata" section:
 * - S6: When metadata is non-null, the page contains a "Metadata" heading
 *        and a <pre> block for formatted JSON.
 * - S7: The page does NOT render a "Metadata" heading when metadata is null
 *        (the section is conditionally rendered via `if (order.metadata)`).
 *
 * These are static source-structure assertions, NOT behavioral tests.
 * Runtime rendering is covered by Tier 4 (Playwright) when added.
 */
import { test } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PAGE_PATH = join(__dirname, '../../src/pages/admin/orders/[id].astro');

function getPageSource(): string {
  return fs.readFileSync(PAGE_PATH, 'utf-8');
}

test('Metadata section contains heading and formatted JSON block', () => {
  const source = getPageSource();
  // The page should contain a "Metadata" card-title heading (inside JS string literal)
  assert.match(source, /card-title.*Metadata/i, 'page should contain a "Metadata" heading');
  // The page should have a <pre> element for formatted metadata
  assert.match(
    source,
    /<pre class="bg-base-200 p-3 rounded text-sm overflow-x-auto">/,
    'page should include a formatted <pre> block for metadata'
  );
  // The page should format metadata via JSON.stringify(JSON.parse(...))
  assert.match(
    source,
    /JSON\.stringify\(JSON\.parse\(order\.metadata\), null, 2\)/,
    'page should format metadata via JSON.stringify(JSON.parse(order.metadata), null, 2)'
  );
  // The page should escape the formatted metadata
  assert.match(
    source,
    /htmlEscape\(formattedMeta\)/,
    'formatted metadata should be escaped via htmlEscape()'
  );
});

test('Metadata section is conditionally rendered (guarded by if)', () => {
  const source = getPageSource();
  // The section should be guarded by `if (order.metadata)`
  assert.match(
    source,
    /if\s*\(order\.metadata\)/,
    'Metadata section should be conditionally rendered via if (order.metadata)'
  );
});
