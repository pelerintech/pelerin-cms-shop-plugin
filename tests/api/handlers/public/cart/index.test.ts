import { test } from 'node:test';
import { ensureLoader } from '../../../../stubs/register.mjs';
import { matrix, assert, makeFakeSdk } from '../../_matrix.ts';

ensureLoader();
const { runGet, runPost } = await import('../../../../../src/api/shop/public/cart/index.ts');

const URL = 'http://localhost/api/plugins/shop/public/cart?currency=RON';

test('GET happy-path → 200, fresh guest cart, data has cart_id', () =>
  matrix.happyPath({
    run: runGet,
    url: URL,
    check: (b) => {
      assert.ok(b.data.cart_id, 'cart_id present');
      assert.ok(b.data.totals, 'totals present');
    },
  }));

test('GET error-wrap → 500', () => matrix.errorWrap({ run: runGet, url: URL }));

test('POST happy-path → 200 (POST === GET)', () =>
  matrix.happyPath({
    run: runPost,
    url: URL,
    method: 'POST',
    check: (b) => assert.ok(b.data.cart_id, 'cart_id present'),
  }));

test('POST error-wrap → 500', () => matrix.errorWrap({ run: runPost, url: URL, method: 'POST' }));
