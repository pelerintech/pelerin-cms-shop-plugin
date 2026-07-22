import { test } from 'node:test';
import { ensureLoader } from '../../../../stubs/register.mjs';
import { matrix, assert, makeFakeSdk, makeCtx, createTestDb, seedMinimal } from '../../_matrix.ts';
import { insertFixture } from '../../../../db/harness.ts';

ensureLoader();
const { runGet, runPost } = await import('../../../../../src/api/shop/public/cart/index.ts');

const URL = 'http://localhost/api/plugins/shop/public/cart?currency=RON';

function rid(): string {
  return crypto.randomUUID();
}

// ── Existing tests (unchanged) ──

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

// ── New tests: discount info in GET response ──

test('GET voucher-only → data.voucher populated, data.referral null', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const sessionId = 'voucher-test-session';
    const cartId = rid();
    const now = new Date();

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
      id: rid(),
      cart_id: cartId,
      product_id: f.simpleProductId,
      variant_id: null,
      quantity: 1,
    });

    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: URL,
      headers: { Cookie: `pelerin_shop_cart=${sessionId}` },
    });
    const res = await runGet({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await res.json();

    assert.ok(b.data.voucher, 'voucher should be present');
    assert.equal(b.data.voucher.code, 'PCT20');
    assert.equal(b.data.voucher.type, 'percentage');
    assert.equal(b.data.voucher.value, 20);
    // PCT20 = 20% of subtotal_net (5000) = 1000
    assert.equal(b.data.voucher.discount_amount, 1000);
    assert.equal(b.data.referral, null, 'referral should be null');
    assert.equal(b.data.discount_amount, 1000);
    // total = subtotal_gross (5250) - discount (1000)
    assert.equal(b.data.totals.total, 4250);
  } finally {
    await cleanup();
  }
});

test('GET referral-only → data.referral populated, data.voucher null', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const sessionId = 'referral-test-session';
    const cartId = rid();
    const now = new Date();

    await insertFixture(db, 'carts', {
      id: cartId,
      session_id: sessionId,
      user_id: null,
      applied_voucher_code: null,
      applied_referral_code: 'PARTNER10',
      converted_at: null,
      expires_at: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      created_at: now,
      updated_at: now,
    });
    await insertFixture(db, 'cart_items', {
      id: rid(),
      cart_id: cartId,
      product_id: f.simpleProductId,
      variant_id: null,
      quantity: 1,
    });

    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: URL,
      headers: { Cookie: `pelerin_shop_cart=${sessionId}` },
    });
    const res = await runGet({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await res.json();

    assert.ok(b.data.referral, 'referral should be present');
    assert.equal(b.data.referral.code, 'PARTNER10');
    assert.equal(b.data.referral.discount_type, 'percentage');
    assert.equal(b.data.referral.discount_value, 10);
    // PARTNER10 = 10% of subtotal_net (5000) = 500
    assert.equal(b.data.referral.discount_amount, 500);
    assert.equal(b.data.voucher, null, 'voucher should be null');
    assert.equal(b.data.discount_amount, 500);
    // superseded_by_voucher should NOT be present
    assert.equal(b.data.referral.superseded_by_voucher, undefined);
  } finally {
    await cleanup();
  }
});

test('GET tracking-only referral → discount_amount 0, no superseded flag', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const sessionId = 'tracking-test-session';
    const cartId = rid();
    const now = new Date();

    // Create a tracking-only referral (no discount)
    await insertFixture(db, 'referral_codes', {
      id: rid(),
      code: 'TRACKTEST',
      name: 'Tracking Only',
      discount_type: null,
      discount_value: null,
      active: true,
      notes: null,
      created_at: now,
      updated_at: now,
    });

    await insertFixture(db, 'carts', {
      id: cartId,
      session_id: sessionId,
      user_id: null,
      applied_voucher_code: null,
      applied_referral_code: 'TRACKTEST',
      converted_at: null,
      expires_at: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      created_at: now,
      updated_at: now,
    });
    await insertFixture(db, 'cart_items', {
      id: rid(),
      cart_id: cartId,
      product_id: f.simpleProductId,
      variant_id: null,
      quantity: 1,
    });

    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: URL,
      headers: { Cookie: `pelerin_shop_cart=${sessionId}` },
    });
    const res = await runGet({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await res.json();

    assert.ok(b.data.referral, 'referral should be present');
    assert.equal(b.data.referral.code, 'TRACKTEST');
    assert.equal(b.data.referral.discount_type, null);
    assert.equal(b.data.referral.discount_value, null);
    assert.equal(b.data.referral.discount_amount, 0);
    assert.equal(b.data.voucher, null, 'voucher should be null');
    assert.equal(b.data.discount_amount, 0);
    assert.equal(b.data.referral.superseded_by_voucher, undefined);
  } finally {
    await cleanup();
  }
});

test('GET both codes → voucher active, referral dormant with superseded flag', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const sessionId = 'both-codes-session';
    const cartId = rid();
    const now = new Date();

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
      id: rid(),
      cart_id: cartId,
      product_id: f.simpleProductId,
      variant_id: null,
      quantity: 1,
    });

    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: URL,
      headers: { Cookie: `pelerin_shop_cart=${sessionId}` },
    });
    const res = await runGet({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await res.json();

    // Voucher is active
    assert.ok(b.data.voucher, 'voucher should be present');
    assert.ok(b.data.voucher.discount_amount > 0, 'voucher discount should be > 0');

    // Referral is dormant
    assert.ok(b.data.referral, 'referral should be present');
    assert.equal(b.data.referral.discount_amount, 0, 'referral discount should be 0 (dormant)');
    assert.equal(
      b.data.referral.superseded_by_voucher,
      true,
      'referral should have superseded_by_voucher: true'
    );

    // Top-level matches voucher
    assert.equal(b.data.discount_amount, b.data.voucher.discount_amount);
  } finally {
    await cleanup();
  }
});

test('GET no codes → both null, discount_amount 0, total equals subtotal_net + vat_total', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const sessionId = 'no-codes-session';
    const cartId = rid();
    const now = new Date();

    await insertFixture(db, 'carts', {
      id: cartId,
      session_id: sessionId,
      user_id: null,
      applied_voucher_code: null,
      applied_referral_code: null,
      converted_at: null,
      expires_at: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      created_at: now,
      updated_at: now,
    });
    await insertFixture(db, 'cart_items', {
      id: rid(),
      cart_id: cartId,
      product_id: f.simpleProductId,
      variant_id: null,
      quantity: 1,
    });

    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: URL,
      headers: { Cookie: `pelerin_shop_cart=${sessionId}` },
    });
    const res = await runGet({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await res.json();

    assert.equal(b.data.voucher, null, 'voucher should be null');
    assert.equal(b.data.referral, null, 'referral should be null');
    assert.equal(b.data.discount_amount, 0);
    // Without discount, total = subtotal_net + vat_total
    assert.equal(b.data.totals.total, b.data.totals.subtotal_net + b.data.totals.vat_total);
  } finally {
    await cleanup();
  }
});
