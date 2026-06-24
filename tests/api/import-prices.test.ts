/**
 * Tests for src/api/shop/import/prices.ts — price CSV import endpoint.
 *
 * Uses the r14 {db, sdk, ctx} injection pattern. Mirrors the products import
 * endpoint test, but for prices: auth-fail → 401, non-CSV → 422, valid CSV →
 * 200 with import result, unknown currency reported per-row, error-wrap → 500.
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
const { runPost } = await import('../../src/api/shop/import/prices.ts');

function makeCtxWithFile(filename: string, content: string, url = 'http://localhost/api/plugins/shop/import/prices'): any {
  const form = new FormData();
  form.append('file', new File([content], filename, { type: 'text/csv' }));
  const request = new Request(url, { method: 'POST', body: form });
  return { request, params: {}, url: new URL(url), site: new URL('http://localhost'), cookies: { get: () => undefined, set: () => {}, delete: () => {} }, redirect: () => new Response(null, { status: 302 }), locals: {} };
}

function jsonBody(res: Response) {
  return res.json();
}

const VALID_CSV = `sku,currency,price_net
BOOK-001,RON,5500
BOOK-001,EUR,1100`;

test('POST auth-fail: requireAdmin throws 401, poison db untouched → 401', async () => {
  const sdk = makeFakeSdk({ authThrows: unauthorizedError() });
  const ctx = makeCtxWithFile('prices.csv', VALID_CSV);
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
    const ctx = makeCtxWithFile('prices.txt', VALID_CSV);
    const res = await runPost({ db, sdk, ctx });
    assert.equal(res.status, 422);
    const body = await jsonBody(res);
    assert.equal(body.success, false);
  } finally {
    await cleanup();
  }
});

test('POST valid CSV → 200, success, import result with updated', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtxWithFile('prices.csv', VALID_CSV);
    const res = await runPost({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const body = await jsonBody(res);
    assert.equal(body.success, true);
    assert.ok(body.data);
    assert.equal(body.data.total, 2);
    assert.equal(body.data.updated, 2, 'both rows upserted');
    assert.equal(body.data.errors.length, 0);
  } finally {
    await cleanup();
  }
});

test('POST unknown currency reported per-row, valid rows still processed', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const sdk = makeFakeSdk();
    const csv = `sku,currency,price_net
BOOK-001,RON,100
BOOK-001,XYZ,200
BOOK-001,EUR,300`;
    const ctx = makeCtxWithFile('prices.csv', csv);
    const res = await runPost({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const body = await jsonBody(res);
    assert.equal(body.success, true);
    assert.equal(body.data.updated, 2);
    assert.equal(body.data.errors.length, 1);
    assert.ok(body.data.errors[0].error.toLowerCase().includes('currency'));
  } finally {
    await cleanup();
  }
});

test('POST error-wrap: poison db, auth passes → 500', async () => {
  const sdk = makeFakeSdk();
  const ctx = makeCtxWithFile('prices.csv', VALID_CSV);
  const res = await runPost({ db: poisonDb(), sdk, ctx });
  assert.equal(res.status, 500);
  const body = await jsonBody(res);
  assert.equal(body.success, false);
});
