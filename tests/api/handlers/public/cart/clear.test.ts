import { test } from 'node:test';
import { ensureLoader } from '../../../../stubs/register.mjs';
import { matrix, assert, createTestDb, seedMinimal, makeFakeSdk, makeCtx } from '../../_matrix.ts';
import { insertFixture } from '../../../../db/harness.ts';
import { carts } from '../../../../../src/db/schema.ts';
import { eq } from 'drizzle-orm';

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

test('DELETE clear → applied codes cleared (shop-r35)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const now = new Date();
    const sessionId = 'sess-clear';
    const cartId = 'cart-clear';
    await insertFixture(db, 'carts', {
      id: cartId,
      session_id: sessionId,
      user_id: null,
      applied_voucher_code: 'PCT20',
      applied_referral_code: 'PARTNER10',
      converted_at: null,
      expires_at: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      created_at: now,
      updated_at: now,
    });
    await insertFixture(db, 'cart_items', {
      id: 'ci-clear-1',
      cart_id: cartId,
      product_id: f.simpleProductId,
      variant_id: null,
      quantity: 1,
    });
    await insertFixture(db, 'cart_items', {
      id: 'ci-clear-2',
      cart_id: cartId,
      product_id: f.simpleProductId,
      variant_id: null,
      quantity: 1,
    });

    const sdk = makeFakeSdk({ user: null });
    const ctx = makeCtx({
      url: URL,
      method: 'DELETE',
      headers: { cookie: `pelerin_shop_cart=${sessionId}` },
    });
    const res = await runDelete({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await res.json();
    assert.equal(b.data.cleared, true);

    const [cart] = await db.select().from(carts).where(eq(carts.id, cartId));
    assert.equal(cart.applied_voucher_code, null, 'voucher code should be cleared');
    assert.equal(cart.applied_referral_code, null, 'referral code should be cleared');
  } finally {
    await cleanup();
  }
});
