import { test } from 'node:test';
import { ensureLoader } from '../../../../../stubs/register.mjs';
import {
  matrix,
  assert,
  createTestDb,
  seedMinimal,
  makeFakeSdk,
  makeCtx,
} from '../../../_matrix.ts';
import { insertFixture } from '../../../../../db/harness.ts';

ensureLoader();
const { runPost, runDelete } =
  await import('../../../../../../src/api/shop/public/cart/voucher/index.ts');

const URL = 'http://localhost/api/plugins/shop/public/cart/voucher';

async function seedCartWithItem(db: any, f: any, sessionId = 'sess-v', cartId = 'cart-v') {
  const now = new Date();
  const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  await insertFixture(db, 'carts', {
    id: cartId,
    session_id: sessionId,
    user_id: null,
    applied_voucher_code: null,
    applied_referral_code: null,
    converted_at: null,
    expires_at: expires,
    created_at: now,
    updated_at: now,
  });
  await insertFixture(db, 'cart_items', {
    id: 'ci-v',
    cart_id: cartId,
    product_id: f.simpleProductId,
    variant_id: null,
    quantity: 2,
  });
  return { sessionId, cartId };
}

test('POST validation-fail → 422', () =>
  matrix.validationFail({ run: runPost, url: URL, invalidBody: { code: '' } }));

test('POST happy-path → 200, applies voucher SAVE10', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const { sessionId } = await seedCartWithItem(db, f);
    const sdk = makeFakeSdk({ user: null });
    const ctx = makeCtx({
      url: URL,
      method: 'POST',
      body: { code: 'SAVE10' },
      headers: { cookie: `pelerin_shop_cart=${sessionId}` },
    });
    const res = await runPost({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await res.json();
    assert.equal(b.success, true);
    assert.equal(b.data.voucher.code, 'SAVE10');
    assert.ok(b.data.discount_amount >= 0);
  } finally {
    await cleanup();
  }
});

test('POST error-wrap → 500', () =>
  matrix.errorWrap({ run: runPost, url: URL, method: 'POST', body: { code: 'SAVE10' } }));

test('DELETE happy-path → 200, voucher_removed true', () =>
  matrix.happyPath({
    run: runDelete,
    url: URL,
    method: 'DELETE',
    check: (b) => assert.equal(b.data.voucher_removed, true),
  }));

test('DELETE error-wrap → 500', () =>
  matrix.errorWrap({ run: runDelete, url: URL, method: 'DELETE' }));
