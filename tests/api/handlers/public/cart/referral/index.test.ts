import { test } from 'node:test';
import { ensureLoader } from '../../../../../stubs/register.mjs';
import { matrix, assert, makeFakeSdk } from '../../../_matrix.ts';

ensureLoader();
const { runPost, runDelete } = await import('../../../../../../src/api/shop/public/cart/referral/index.ts');

const URL = 'http://localhost/api/plugins/shop/public/cart/referral';

test('POST validation-fail → 422', () =>
  matrix.validationFail({ run: runPost, url: URL, invalidBody: { code: '' } }));

test('POST happy-path → 200, applies referral PARTNER10', () =>
  matrix.happyPath({
    run: runPost,
    url: URL,
    method: 'POST',
    body: { code: 'PARTNER10' },
    check: (b) => {
      assert.equal(b.success, true);
      assert.equal(b.data.referral.code, 'PARTNER10');
    },
  }));

test('POST error-wrap → 500', () =>
  matrix.errorWrap({ run: runPost, url: URL, method: 'POST', body: { code: 'PARTNER10' } }));

test('DELETE happy-path → 200, referral_removed true', () =>
  matrix.happyPath({
    run: runDelete,
    url: URL,
    method: 'DELETE',
    check: (b) => assert.equal(b.data.referral_removed, true),
  }));

test('DELETE error-wrap → 500', () =>
  matrix.errorWrap({ run: runDelete, url: URL, method: 'DELETE' }));
