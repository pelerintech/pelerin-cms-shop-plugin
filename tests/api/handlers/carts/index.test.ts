import { test } from 'node:test';
import { ensureLoader } from '../../../stubs/register.mjs';
import { matrix, assert } from '../_matrix.ts';

ensureLoader();
const { runGet } = await import('../../../../src/api/shop/carts/index.ts');

const base = 'http://localhost/api/plugins/shop/carts';

test('GET auth-fail → 401', () => matrix.adminAuthFail({ run: runGet, url: base }));

test('GET happy-path → 200, data is array', () =>
  matrix.happyPath({
    run: runGet,
    url: base,
    check: (b) => assert.ok(Array.isArray(b.data), 'data should be array'),
  }));

test('GET error-wrap → 500', () => matrix.errorWrap({ run: runGet, url: base }));
