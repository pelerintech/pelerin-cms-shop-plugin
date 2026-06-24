import { test } from 'node:test';
import { ensureLoader } from '../../../../stubs/register.mjs';
import { matrix, assert } from '../../_matrix.ts';

ensureLoader();
const { runGet } = await import('../../../../../src/api/shop/public/products/index.ts');

const URL = 'http://localhost/api/plugins/shop/public/products?currency=RON&locale=ro';

test('GET happy-path → 200, data is array', () =>
  matrix.happyPath({
    run: runGet,
    url: URL,
    check: (b) => assert.ok(Array.isArray(b.data), 'data should be an array'),
  }));

test('GET error-wrap → 500', () => matrix.errorWrap({ run: runGet, url: URL }));
