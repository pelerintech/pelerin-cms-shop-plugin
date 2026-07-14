import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { ensureLoader } from '../stubs/register.mjs';

ensureLoader();
const { UploadProductImageSchema, ProductImageOutputSchema } =
  await import('../../src/schemas/product.schema.ts');

test('UploadProductImageSchema accepts a valid multipart-derived input', () => {
  const parsed = UploadProductImageSchema.safeParse({
    product_id: 'p1',
    alt: 'a description',
    sort_order: 2,
  });
  assert.ok(parsed.success, 'valid input must parse');
  assert.strictEqual(parsed.data.product_id, 'p1');
});

test('UploadProductImageSchema rejects an empty product_id', () => {
  const parsed = UploadProductImageSchema.safeParse({ product_id: '' });
  assert.ok(!parsed.success, 'empty product_id must be rejected');
});

test('UploadProductImageSchema has NO url field (url comes from storage, not user input)', () => {
  const parsed = UploadProductImageSchema.safeParse({ product_id: 'p1', url: 'http://evil/x.png' });
  assert.ok(parsed.success, 'parses fine (url is not a recognized field)');
  assert.ok(
    !('url' in parsed.data) || parsed.data.url === undefined,
    'url must not be a user-facing field'
  );
});

test('ProductImageOutputSchema still has url (now a RESOLVED url in outputs)', () => {
  const out = ProductImageOutputSchema.safeParse({
    id: 'i1',
    product_id: 'p1',
    variant_id: null,
    url: '/uploads/products/p1/x.png',
    alt: null,
    sort_order: 0,
  });
  assert.ok(out.success, 'output schema must accept a resolved url');
});

test('the upload handler source no longer references CreateProductImageSchema or JSON url body', () => {
  const src = readFileSync(
    new URL('../../src/api/shop/products/[id]/images/index.ts', import.meta.url),
    'utf-8'
  );
  assert.doesNotMatch(
    src,
    /CreateProductImageSchema/,
    'handler must not reference the old JSON-url schema'
  );
  assert.doesNotMatch(src, /body\.url/, 'handler must not read url from a JSON body');
});
