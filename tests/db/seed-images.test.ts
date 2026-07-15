import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const contents = readFileSync(new URL('../../src/db/seed.ts', import.meta.url), 'utf-8');

test('seed inserts at least one product_images row (dev predictability)', () => {
  assert.ok(
    /INSERT INTO product_images/.test(contents),
    'seed must INSERT INTO product_images (not only DELETE)'
  );
});

test('seed product_images row stores a storage KEY in url (products/{pid}/... shape)', () => {
  // The url is built via string concatenation: 'products/' + prodSimple + '/' + ts + '-sample.png'
  const re = new RegExp(String.raw`'products/'\s*\+\s*prodSimple`);
  assert.match(
    contents,
    re,
    'seed product_images.url must build a storage key shaped products/{pid}/...'
  );
});

test('seed product_images row populates mime and size enriched columns', () => {
  // The product_images INSERT must reference the mime/size columns.
  assert.match(
    contents,
    /INSERT INTO product_images\s*\([^)]*\bmime\b/,
    'INSERT must include mime column'
  );
  assert.match(
    contents,
    /INSERT INTO product_images\s*\([^)]*\bsize\b/,
    'INSERT must include size column'
  );
});
