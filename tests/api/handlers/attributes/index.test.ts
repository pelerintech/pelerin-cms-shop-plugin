import { test } from 'node:test';
import assert from 'node:assert';
import { ensureLoader } from '../../../stubs/register.mjs';
import { matrix } from '../_matrix.ts';

ensureLoader();
const { runGet, runPost } = await import('../../../../src/api/shop/attributes/index.ts');

const url = 'http://localhost/api/plugins/shop/attributes';

test('GET auth-fail → 401', () => matrix.adminAuthFail({ run: runGet, url }));

test('GET happy-path → 200, data is array', () =>
  matrix.happyPath({
    run: runGet,
    url,
    expectedStatus: 200,
    check: b => assert.ok(Array.isArray(b.data), 'data should be an array'),
  }));

test('GET error-wrap → 500', () => matrix.errorWrap({ run: runGet, url }));

test('POST auth-fail → 401', () => matrix.adminAuthFail({ run: runPost, url, body: {} }));

test('POST validation-fail: missing required fields → 422', () =>
  matrix.validationFail({
    run: runPost,
    url,
    invalidBody: { sort_order: 1 },
  }));

test('POST happy-path: valid body → 201, data.id exists', () =>
  matrix.happyPath({
    run: runPost,
    url,
    body: { name: 'Material', type: 'text', sort_order: 99 },
    method: 'POST',
    expectedStatus: 201,
    check: b => assert.ok(b.data?.id, 'data.id should exist'),
  }));

test('POST error-wrap → 500', () =>
  matrix.errorWrap({
    run: runPost,
    url,
    body: { name: 'Err', type: 'text', sort_order: 1 },
  }));
