import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./full-suite.test.ts', import.meta.url), 'utf-8');

const required = [
  'tests/lib/storage-keys.test.ts',
  'tests/lib/data/product-images-resolve.test.ts',
  'tests/lib/data/product-images-create.test.ts',
  'tests/api/handlers/helpers-storage.test.ts',
  'tests/schemas/product-image-schema.test.ts',
  'tests/pages/admin-product-images-read.test.ts',
  'tests/pages/image-upload-script-syntax.test.ts',
  'tests/db/seed-images.test.ts',
];

test('full-suite TEST_FILES lists every new r18 test file', () => {
  for (const f of required) {
    assert.ok(source.includes(`'${f}'`), `TEST_FILES missing entry: ${f}`);
  }
});
