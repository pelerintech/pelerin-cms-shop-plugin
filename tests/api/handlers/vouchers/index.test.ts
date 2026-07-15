import { test } from 'node:test';
import { ensureLoader } from '../../../stubs/register.mjs';
import { matrix, assert } from '../_matrix.ts';

ensureLoader();
const { runGet, runPost } = await import('../../../../src/api/shop/vouchers/index.ts');

const base = 'http://localhost/api/plugins/shop/vouchers';

test('GET auth-fail → 401', () => matrix.adminAuthFail({ run: runGet, url: base }));

test('GET happy-path → 200, data is array', () =>
  matrix.happyPath({
    run: runGet,
    url: base,
    check: (b) => assert.ok(Array.isArray(b.data), 'data should be array'),
  }));

test('GET error-wrap → 500', () => matrix.errorWrap({ run: runGet, url: base }));

test('POST auth-fail → 401', () => matrix.adminAuthFail({ run: runPost, url: base, body: {} }));

test('POST validation-fail → 422', () =>
  matrix.validationFail({
    run: runPost,
    url: base,
    invalidBody: { type: 'fixed_amount' /* missing code */ },
  }));

test('POST happy-path → 201, data.id exists', () =>
  matrix.happyPath({
    run: runPost,
    url: base,
    method: 'POST',
    body: {
      code: 'NEWVIP50',
      type: 'fixed_amount',
      value: 500,
      active: true,
      single_use_per_customer: false,
    },
    expectedStatus: 201,
    check: (b) => assert.ok(b.data?.id, 'data.id should exist'),
  }));

test('POST error-wrap → 500', () =>
  matrix.errorWrap({
    run: runPost,
    url: base,
    body: {
      code: 'ERRCODE1',
      type: 'fixed_amount',
      value: 100,
      active: true,
      single_use_per_customer: false,
    },
  }));
