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
import { carts } from '../../../../../../src/db/schema.ts';
import { eq } from 'drizzle-orm';

ensureLoader();
const { runPost, runDelete } =
  await import('../../../../../../src/api/shop/public/cart/referral/index.ts');

const URL = 'http://localhost/api/plugins/shop/public/cart/referral';

/** Seed a cart with one item (and optional applied codes) for a known session. */
async function seedCartWithItem(
  db: any,
  f: any,
  sessionId = 'sess-r',
  cartId = 'cart-r',
  codes: { voucher?: string; referral?: string } = {}
) {
  const now = new Date();
  const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  await insertFixture(db, 'carts', {
    id: cartId,
    session_id: sessionId,
    user_id: null,
    applied_voucher_code: codes.voucher ?? null,
    applied_referral_code: codes.referral ?? null,
    converted_at: null,
    expires_at: expires,
    created_at: now,
    updated_at: now,
  });
  await insertFixture(db, 'cart_items', {
    id: 'ci-r',
    cart_id: cartId,
    product_id: f.simpleProductId,
    variant_id: null,
    quantity: 2,
  });
  return { sessionId, cartId };
}

test('POST validation-fail → 422', () =>
  matrix.validationFail({ run: runPost, url: URL, invalidBody: { code: '' } }));

test('POST happy-path → 200, applies referral PARTNER10', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const { sessionId } = await seedCartWithItem(db, f);
    const sdk = makeFakeSdk({ user: null });
    const ctx = makeCtx({
      url: URL,
      method: 'POST',
      body: { code: 'PARTNER10' },
      headers: { cookie: `pelerin_shop_cart=${sessionId}` },
    });
    const res = await runPost({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await res.json();
    assert.equal(b.success, true);
    assert.equal(b.data.referral.code, 'PARTNER10');
  } finally {
    await cleanup();
  }
});

test('POST empty cart → 422 Cart is empty, no code applied', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const sessionId = 'sess-r-empty';
    const cartId = 'cart-r-empty';
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
    // no cart_items seeded — cart is empty
    const sdk = makeFakeSdk({ user: null });
    const ctx = makeCtx({
      url: URL,
      method: 'POST',
      body: { code: 'PARTNER10' },
      headers: { cookie: `pelerin_shop_cart=${sessionId}` },
    });
    const res = await runPost({ db, sdk, ctx });
    assert.equal(res.status, 422);
    const b = await res.json();
    assert.equal(b.success, false);
    assert.equal(b.error, 'Cart is empty');
    const [cart] = await db.select().from(carts).where(eq(carts.id, cartId));
    assert.equal(cart.applied_referral_code, null, 'referral must not be applied to an empty cart');
  } finally {
    await cleanup();
  }
});

test('POST while a voucher is applied → 422, referral not combined', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const { sessionId, cartId } = await seedCartWithItem(db, f, 'sess-r2', 'cart-r2', {
      voucher: 'PCT20',
    });
    const sdk = makeFakeSdk({ user: null });
    const ctx = makeCtx({
      url: URL,
      method: 'POST',
      body: { code: 'PARTNER10' },
      headers: { cookie: `pelerin_shop_cart=${sessionId}` },
    });
    const res = await runPost({ db, sdk, ctx });
    assert.equal(res.status, 422);
    const b = await res.json();
    assert.equal(b.success, false);
    assert.equal(
      b.error,
      'A voucher is already applied — referral discount cannot be combined with it'
    );
    const [cart] = await db.select().from(carts).where(eq(carts.id, cartId));
    assert.equal(
      cart.applied_referral_code,
      null,
      'referral must not be applied alongside a voucher'
    );
  } finally {
    await cleanup();
  }
});

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
