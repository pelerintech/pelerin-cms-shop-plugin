/**
 * Tests for src/api/shop/import/products.ts — product CSV import endpoint.
 *
 * Uses the r14 {db, sdk, ctx} injection pattern. The handler's runPost:
 *  - calls sdk.auth.requireAdmin (auth-fail → 401, db untouched)
 *  - parses multipart/form-data, requires a `file` field ending in .csv
 *    (non-CSV → 422)
 *  - parses the CSV text, calls importProducts, returns the import result
 *  - invalid rows in the CSV are reported per-row (not a 422 — the request
 *    succeeds with row-level errors in the result)
 *  - wraps unexpected db errors → 500
 *
 * The ctx.request is a real Request with a FormData body (Node undici supports
 * multipart parsing).
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { ensureLoader } from '../stubs/register.mjs';
import {
  makeFakeSdk,
  poisonDb,
  unauthorizedError,
} from './helpers.ts';
import { createTestDb, seedMinimal } from '../db/harness.ts';

ensureLoader();
const { runPost } = await import('../../src/api/shop/import/products.ts');

/** Build a fake Astro ctx whose request carries a multipart FormData with a file. */
function makeCtxWithFile(filename: string, content: string, url = 'http://localhost/api/plugins/shop/import/products'): any {
  const form = new FormData();
  form.append('file', new File([content], filename, { type: 'text/csv' }));
  const request = new Request(url, { method: 'POST', body: form });
  return { request, params: {}, url: new URL(url), site: new URL('http://localhost'), cookies: { get: () => undefined, set: () => {}, delete: () => {} }, redirect: () => new Response(null, { status: 302 }), locals: {} };
}

/** Build a fake ctx with no file field at all. */
function makeCtxNoFile(url = 'http://localhost/api/plugins/shop/import/products'): any {
  const form = new FormData();
  const request = new Request(url, { method: 'POST', body: form });
  return { request, params: {}, url: new URL(url), site: new URL('http://localhost'), cookies: { get: () => undefined, set: () => {}, delete: () => {} }, redirect: () => new Response(null, { status: 302 }), locals: {} };
}

function jsonBody(res: Response) {
  return res.json();
}

const VALID_CSV = `sku,name_ro,name_en,description_ro,description_en,type,category_slug,vat_rate,stock
IMP-001,Produs Unu,Product One,Desc RO,Desc EN,physical,carti,0.09,10
IMP-002,Produs Doi,,Desc RO,,digital,teste,0.19,`;

test('POST auth-fail: requireAdmin throws 401, poison db untouched → 401', async () => {
  const sdk = makeFakeSdk({ authThrows: unauthorizedError() });
  const ctx = makeCtxWithFile('products.csv', VALID_CSV);
  const res = await runPost({ db: poisonDb(), sdk, ctx });
  assert.equal(res.status, 401);
  const body = await jsonBody(res);
  assert.equal(body.success, false);
});

test('POST non-CSV file → 422', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtxWithFile('products.txt', VALID_CSV);
    const res = await runPost({ db, sdk, ctx });
    assert.equal(res.status, 422);
    const body = await jsonBody(res);
    assert.equal(body.success, false);
  } finally {
    await cleanup();
  }
});

test('POST missing file field → 422', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtxNoFile();
    const res = await runPost({ db, sdk, ctx });
    assert.equal(res.status, 422);
    const body = await jsonBody(res);
    assert.equal(body.success, false);
  } finally {
    await cleanup();
  }
});

test('POST valid CSV → 200, success, import result with created/errors', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtxWithFile('products.csv', VALID_CSV);
    const res = await runPost({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const body = await jsonBody(res);
    assert.equal(body.success, true);
    assert.ok(body.data, 'data present');
    assert.equal(body.data.total, 2);
    // IMP-001 (carti exists) → created; IMP-002 (teste slug missing) → error
    assert.equal(body.data.created, 1);
    assert.ok(Array.isArray(body.data.errors));
    assert.equal(body.data.errors.length, 1);
    assert.ok(body.data.errors[0].error.toLowerCase().includes('category'));
  } finally {
    await cleanup();
  }
});

test('POST invalid rows reported per-row, valid rows still processed', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const sdk = makeFakeSdk();
    const csv = `sku,name_ro,name_en,description_ro,description_en,type,category_slug,vat_rate,stock
IMP-A,Valid A,,Desc,,physical,carti,0.09,5
,Bad No SKU,,Desc,,physical,carti,0.09,5
IMP-B,Bad Type,,Desc,,widget,carti,0.09,5`;
    const ctx = makeCtxWithFile('products.csv', csv);
    const res = await runPost({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const body = await jsonBody(res);
    assert.equal(body.success, true);
    assert.equal(body.data.created, 1, 'one valid row created');
    assert.equal(body.data.errors.length, 2, 'two invalid rows reported');
  } finally {
    await cleanup();
  }
});

test('POST error-wrap: poison db, auth passes → 500', async () => {
  const sdk = makeFakeSdk();
  const ctx = makeCtxWithFile('products.csv', VALID_CSV);
  const res = await runPost({ db: poisonDb(), sdk, ctx });
  assert.equal(res.status, 500);
  const body = await jsonBody(res);
  assert.equal(body.success, false);
});
