/**
 * r18 — POST /products/:id/images multipart upload + storage-before-DB.
 *
 * Replaces the old JSON-{url} contract tests. The handler now reads `file`
 * from FormData, calls sdk.storage.upload(buf, key, mime), and only on storage
 * success inserts the product_images row (no orphan record on storage failure).
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { ensureLoader } from '../../../../stubs/register.mjs';
import { createTestDb, seedMinimal } from '../../../../db/harness.ts';
import { makeFakeSdk, makeCtx, poisonDb } from '../../../helpers.ts';
import { product_images } from '../../../../db/harness.ts';
import { eq } from 'drizzle-orm';

ensureLoader();
const { runPost } = await import(
  '../../../../../src/api/shop/products/[id]/images/index.ts'
);

const URL = (id: string) =>
  `http://localhost/api/plugins/shop/products/${id}/images`;

test('POST multipart happy-path → 201, row inserted with key+metadata, storage.upload called with (buf,key,mime), data.url resolved', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: URL(f.simpleProductId),
      formData: { file: Buffer.from([0x89, 0x50, 0x4e, 0x47]), fileName: 'img.png', fileType: 'image/png' },
      params: { id: f.simpleProductId },
    });
    const res = await runPost({ db, sdk, ctx });
    assert.equal(res.status, 201);
    const b = await res.json();
    assert.equal(b.success, true);
    assert.ok(b.data?.id, 'data.id should exist');
    // data.url must be a RESOLVED url, not a raw key
    assert.match(b.data.url, /^\/uploads\/products\//, 'data.url must be resolved (not a raw key)');
    // storage.upload called once with (buf, key, mime)
    assert.strictEqual(sdk.storage.uploadCalls.length, 1);
    const call = sdk.storage.uploadCalls[0];
    assert.strictEqual(call.mime, 'image/png');
    assert.match(call.key, /^products\/[^\/]+\/\d+-[a-z0-9]+-img\.png$/);
    // Row exists with the KEY in url + metadata
    const rows = await db.select().from(product_images).where(eq(product_images.id, b.data.id));
    assert.strictEqual(rows.length, 1);
    assert.match(rows[0].url, /^products\//, 'url column must hold the storage key');
    assert.strictEqual(rows[0].mime, 'image/png');
    assert.strictEqual(rows[0].original_filename, 'img.png');
    assert.ok(rows[0].size > 0, 'size must be recorded');
  } finally {
    await cleanup();
  }
});

test('POST missing file → 422, no storage call, no row', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const sdk = makeFakeSdk();
    // FormData without a `file` field (just an extra field)
    const fd = new FormData();
    fd.append('alt', 'no file');
    const ctx = makeCtx({ url: URL(f.simpleProductId), params: { id: f.simpleProductId } });
    // Override the request body with a file-less formData
    ctx.request = new Request(URL(f.simpleProductId), { method: 'POST', body: fd });
    const res = await runPost({ db, sdk, ctx });
    assert.equal(res.status, 422);
    const b = await res.json();
    assert.equal(b.success, false);
    assert.strictEqual(sdk.storage.uploadCalls.length, 0, 'storage.upload must NOT be called');
    const all = await db.select().from(product_images);
    assert.strictEqual(all.length, 0, 'no row must be inserted');
  } finally {
    await cleanup();
  }
});

test('POST storage throws → 5xx, NO row inserted (orphan-record guard), storage WAS called', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const sdk = makeFakeSdk({ storage: { uploadThrows: true } });
    const ctx = makeCtx({
      url: URL(f.simpleProductId),
      formData: { file: Buffer.from('png'), fileName: 'img.png', fileType: 'image/png' },
      params: { id: f.simpleProductId },
    });
    const res = await runPost({ db, sdk, ctx });
    assert.ok(res.status >= 500, 'storage failure must produce 5xx');
    const b = await res.json();
    assert.equal(b.success, false);
    assert.strictEqual(sdk.storage.uploadCalls.length, 1, 'storage.upload WAS attempted');
    const all = await db.select().from(product_images);
    assert.strictEqual(all.length, 0, 'no orphan record must be inserted');
  } finally {
    await cleanup();
  }
});

test('POST auth-fail → 401, poison db + storage never called', async () => {
  const sdk = makeFakeSdk({ authThrows: { status: 401, message: 'Unauthorized' } });
  const ctx = makeCtx({
    url: URL('x'),
    formData: { file: Buffer.from('png'), fileName: 'img.png', fileType: 'image/png' },
    params: { id: 'x' },
  });
  const res = await runPost({ db: poisonDb(), sdk, ctx });
  assert.equal(res.status, 401);
  assert.strictEqual(sdk.storage.uploadCalls.length, 0, 'storage must NOT be called before auth');
});
