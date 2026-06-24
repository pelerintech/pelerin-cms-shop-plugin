import { test } from 'node:test';
import { ensureLoader } from '../../../../stubs/register.mjs';
import { matrix, assert } from '../../_matrix.ts';

ensureLoader();
const { runDelete } = await import('../../../../../src/api/shop/public/cart/clear.ts');

const URL = 'http://localhost/api/plugins/shop/public/cart/clear';

test('DELETE happy-path → 200, cleared true', () =>
  matrix.happyPath({
    run: runDelete,
    url: URL,
    method: 'DELETE',
    check: (b) => assert.equal(b.data.cleared, true),
  }));

test('DELETE error-wrap → 500', () =>
  matrix.errorWrap({ run: runDelete, url: URL, method: 'DELETE' }));
