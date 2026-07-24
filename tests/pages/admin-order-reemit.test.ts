import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pagePath = resolve(__dirname, '../../src/pages/admin/orders/[id].astro');
const pageContent = readFileSync(pagePath, 'utf-8');

test('admin order detail page contains re-emit events section', () => {
  assert.match(pageContent, /Re-emit Events/, 'Page must contain "Re-emit Events" heading');
  assert.match(pageContent, /Re-emit/, 'Page must reference re-emit');
  assert.match(pageContent, /reemitEvent/, 'Page must define reemitEvent function');
  assert.match(
    pageContent,
    /shop\.order\.confirmed/,
    'Page must reference shop.order.confirmed event'
  );
  assert.match(pageContent, /Re-emit confirmed event/, 'Page must have re-emit confirmed button');
  assert.match(pageContent, /Re-emit paid event/, 'Page must have re-emit paid button');
  assert.match(pageContent, /Re-emit shipped event/, 'Page must have re-emit shipped button');
});

test('admin order detail page calls reemit API endpoint', () => {
  assert.match(pageContent, /reemit-event/, 'Page must reference the reemit-event API endpoint');
  assert.match(pageContent, /\/api\/plugins\/shop\/orders\//, 'Page must use the orders API path');
});

test('admin order detail page has reemitEvent function using fetch', () => {
  assert.match(
    pageContent,
    /reemitEvent\s*=\s*async\s*function/,
    'reemitEvent must be an async function'
  );
  assert.match(pageContent, /fetch\s*\(/, 'reemitEvent must use fetch');
  assert.match(pageContent, /reemit-event/, 'reemitEvent must call the reemit-event endpoint');
});
