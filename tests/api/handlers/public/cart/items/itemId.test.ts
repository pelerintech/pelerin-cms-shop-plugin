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
const { runPut, runDelete } =
  await import('../../../../../../src/api/shop/public/cart/items/[itemId].ts');

const URL = (itemId: string) => `http://localhost/api/plugins/shop/public/cart/items/${itemId}`;

// Seed a cart with one item tied to a known session id, return a ctx-maker that
// sends the matching cookie so getOrCreateCart reuses the existing cart.
async function seedCartWithItem(
  db: any,
  f: any,
  itemId = 'ci-1',
  qty = 2,
  codes: { voucher?: string; referral?: string } = {}
) {
  const now = new Date();
  const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const sessionId = 'sess-test-1';
  const cartId = 'cart-test-1';
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
    id: itemId,
    cart_id: cartId,
    product_id: f.simpleProductId,
    variant_id: null,
    quantity: qty,
  });
  return { cartId, sessionId, itemId };
}

function ctxWithCookie(
  url: string,
  sessionId: string,
  params: Record<string, string>,
  body?: any,
  method?: string
) {
  return makeCtx({
    url,
    method,
    body,
    params,
    headers: { cookie: `pelerin_shop_cart=${sessionId}` },
  });
}

test('PUT validation-fail → 422', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const { sessionId, itemId } = await seedCartWithItem(db, f, 'ci-v', 2);
    const sdk = makeFakeSdk({ user: null });
    const ctx = ctxWithCookie(URL(itemId), sessionId, { itemId }, { quantity: -1 }, 'PUT');
    const res = await runPut({ db, sdk, ctx });
    assert.equal(res.status, 422);
    const b = await res.json();
    assert.equal(b.success, false);
    assert.equal(b.error, 'Validation failed');
    assert.ok(b.fields && Object.keys(b.fields).length > 0);
  } finally {
    await cleanup();
  }
});

test('PUT happy-path → 200, quantity updated', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const { sessionId, itemId } = await seedCartWithItem(db, f, 'ci-pu', 2);
    const sdk = makeFakeSdk({ user: null });
    const ctx = ctxWithCookie(URL(itemId), sessionId, { itemId }, { quantity: 5 }, 'PUT');
    const res = await runPut({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await res.json();
    assert.equal(b.success, true);
    assert.equal(b.data.item_id, itemId);
    assert.equal(b.data.quantity, 5);
  } finally {
    await cleanup();
  }
});

test('PUT error-wrap → 500', () =>
  matrix.errorWrap({
    run: runPut,
    url: URL('any'),
    method: 'PUT',
    params: { itemId: 'any' },
    body: { quantity: 5 },
  }));

test('PUT quantity 0 on the last item → applied codes cleared (empty cart invariant)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const { sessionId, itemId, cartId } = await seedCartWithItem(db, f, 'ci-last', 1, {
      voucher: 'PCT20',
      referral: 'PARTNER10',
    });
    const sdk = makeFakeSdk({ user: null });
    const ctx = ctxWithCookie(URL(itemId), sessionId, { itemId }, { quantity: 0 }, 'PUT');
    const res = await runPut({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await res.json();
    assert.equal(b.success, true);
    assert.equal(b.data.removed, true);
    const [cart] = await db.select().from(carts).where(eq(carts.id, cartId));
    assert.equal(cart.applied_voucher_code, null, 'voucher code should be cleared');
    assert.equal(cart.applied_referral_code, null, 'referral code should be cleared');
  } finally {
    await cleanup();
  }
});

test('DELETE happy-path → 200, removed true', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const { sessionId, itemId } = await seedCartWithItem(db, f, 'ci-del', 2);
    const sdk = makeFakeSdk({ user: null });
    const ctx = ctxWithCookie(URL(itemId), sessionId, { itemId }, undefined, 'DELETE');
    const res = await runDelete({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await res.json();
    assert.equal(b.success, true);
    assert.equal(b.data.removed, true);
  } finally {
    await cleanup();
  }
});

test('DELETE error-wrap → 500', () =>
  matrix.errorWrap({
    run: runDelete,
    url: URL('any'),
    method: 'DELETE',
    params: { itemId: 'any' },
  }));

test('DELETE last item → applied codes cleared (shop-r35)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const now = new Date();
    const sessionId = 'sess-last-item';
    const cartId = 'cart-last-item';
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
      id: 'ci-last',
      cart_id: cartId,
      product_id: f.simpleProductId,
      variant_id: null,
      quantity: 1,
    });

    const sdk = makeFakeSdk({ user: null });
    const ctx = ctxWithCookie(
      URL('ci-last'),
      sessionId,
      { itemId: 'ci-last' },
      undefined,
      'DELETE'
    );
    const res = await runDelete({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);

    const [cart] = await db.select().from(carts).where(eq(carts.id, cartId));
    assert.equal(cart.applied_voucher_code, null, 'voucher code should be cleared');
    assert.equal(cart.applied_referral_code, null, 'referral code should be cleared');
  } finally {
    await cleanup();
  }
});

test('DELETE non-last item → applied codes kept (shop-r35)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const now = new Date();
    const sessionId = 'sess-keep-item';
    const cartId = 'cart-keep-item';
    await insertFixture(db, 'carts', {
      id: cartId,
      session_id: sessionId,
      user_id: null,
      applied_voucher_code: 'PCT20',
      applied_referral_code: null,
      converted_at: null,
      expires_at: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      created_at: now,
      updated_at: now,
    });
    await insertFixture(db, 'cart_items', {
      id: 'ci-keep-1',
      cart_id: cartId,
      product_id: f.simpleProductId,
      variant_id: null,
      quantity: 1,
    });
    await insertFixture(db, 'cart_items', {
      id: 'ci-keep-2',
      cart_id: cartId,
      product_id: f.simpleProductId,
      variant_id: null,
      quantity: 1,
    });

    const sdk = makeFakeSdk({ user: null });
    const ctx = ctxWithCookie(
      URL('ci-keep-1'),
      sessionId,
      { itemId: 'ci-keep-1' },
      undefined,
      'DELETE'
    );
    const res = await runDelete({ db, sdk, ctx });
    assert.equal(res.status, 200);

    const [cart] = await db.select().from(carts).where(eq(carts.id, cartId));
    assert.equal(cart.applied_voucher_code, 'PCT20', 'voucher code should remain');
  } finally {
    await cleanup();
  }
});
