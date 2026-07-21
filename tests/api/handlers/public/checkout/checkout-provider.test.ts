/**
 * Tests for checkout provider stamping.
 *
 * POST /checkout now requires `provider` in the body, validates it against
 * the runtime configured list, and stamps the order's payment_provider.
 * Bank transfer returns instructions; ramburs returns no instructions.
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { ensureLoader } from '../../../../stubs/register.mjs';
import { createTestDb, seedMinimal, makeFakeSdk, makeCtx } from '../../_matrix.ts';
import { insertFixture, orders } from '../../../../db/harness.ts';
import { eq } from 'drizzle-orm';
import { upsertSetting } from '../../../../../src/lib/data/settings.ts';

ensureLoader();
const { runPost } = await import('../../../../../src/api/shop/public/checkout/index.ts');

const URL = 'http://localhost/api/plugins/shop/public/checkout';

async function seedCartWithItem(db: any, f: any, sessionId = 'sess-co-pv', cartId = 'cart-co-pv') {
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
    id: 'ci-co-pv',
    cart_id: cartId,
    product_id: f.simpleProductId,
    variant_id: null,
    quantity: 2,
  });
  return { sessionId, cartId };
}

function baseBody(overrides: Record<string, any> = {}) {
  return {
    customer_type: 'individual',
    customer_email: 'buyer@example.com',
    customer_name: 'Ion Popescu',
    customer_phone: null,
    billing_name: 'Ion Popescu',
    billing_company: null,
    billing_vat_number: null,
    billing_address_line_1: 'Str. X nr 1',
    billing_city: 'Bucuresti',
    billing_state: 'Bucuresti',
    billing_postal_code: '010101',
    billing_country: 'Romania',
    shipping_same_as_billing: true,
    shipping_type: 'physical',
    shipping_address_line_1: null,
    shipping_city: null,
    shipping_state: null,
    shipping_postal_code: null,
    shipping_country: null,
    currency: 'RON',
    referral_code: null,
    ...overrides,
  };
}

test('POST without provider → 422 (provider required)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const { sessionId } = await seedCartWithItem(db, f);
    const sdk = makeFakeSdk({ user: null });
    const ctx = makeCtx({
      url: URL,
      method: 'POST',
      body: baseBody(), // no provider
      headers: { cookie: `pelerin_shop_cart=${sessionId}` },
    });
    const res = await runPost({ db, sdk, ctx });
    assert.equal(res.status, 422);
    const b = await res.json();
    assert.equal(b.success, false);
    assert.ok(b.fields?.provider, 'provider field error should be present');
  } finally {
    await cleanup();
  }
});

test('POST with unknown provider "paypal" → 422', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const { sessionId } = await seedCartWithItem(db, f);
    const sdk = makeFakeSdk({ user: null });
    const ctx = makeCtx({
      url: URL,
      method: 'POST',
      body: baseBody({ provider: 'paypal' }),
      headers: { cookie: `pelerin_shop_cart=${sessionId}` },
    });
    const res = await runPost({ db, sdk, ctx });
    assert.equal(res.status, 422);
    const b = await res.json();
    assert.equal(b.success, false);
    assert.ok(b.error && b.error.toLowerCase().includes('provider'));
  } finally {
    await cleanup();
  }
});

test('POST with ramburs (default enabled) → 201, stamped, no instructions', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const { sessionId } = await seedCartWithItem(db, f);
    const sdk = makeFakeSdk({ user: null });
    const ctx = makeCtx({
      url: URL,
      method: 'POST',
      body: baseBody({ provider: 'ramburs' }),
      headers: { cookie: `pelerin_shop_cart=${sessionId}` },
    });
    const res = await runPost({ db, sdk, ctx });
    assert.equal(res.status, 201);
    const b = await res.json();
    assert.equal(b.success, true);
    // Verify order's payment_provider
    const [order] = await db.select().from(orders).where(eq(orders.id, b.data.order_id));
    assert.equal(order.payment_provider, 'ramburs');
    // Check response payment object
    assert.equal(b.data.payment.provider, 'ramburs');
    assert.equal(b.data.payment.instructions, undefined);
  } finally {
    await cleanup();
  }
});

test('POST with bank_transfer not configured → 422', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const { sessionId } = await seedCartWithItem(db, f);
    const sdk = makeFakeSdk({ user: null });
    const ctx = makeCtx({
      url: URL,
      method: 'POST',
      body: baseBody({ provider: 'bank_transfer' }),
      headers: { cookie: `pelerin_shop_cart=${sessionId}` },
    });
    const res = await runPost({ db, sdk, ctx });
    assert.equal(res.status, 422);
    const b = await res.json();
    assert.equal(b.success, false);
  } finally {
    await cleanup();
  }
});

test('POST with bank_transfer configured → 201, instructions present', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    // Configure bank transfer
    await upsertSetting(db, 'bank_transfer_beneficiary', 'Pelerin SRL');
    await upsertSetting(db, 'bank_transfer_iban', 'RO49AAAA...');
    await upsertSetting(db, 'bank_transfer_bank_name', 'Banca X');
    await upsertSetting(db, 'bank_transfer_reference_note', 'Use order number');

    const { sessionId } = await seedCartWithItem(db, f);
    const sdk = makeFakeSdk({ user: null });
    const ctx = makeCtx({
      url: URL,
      method: 'POST',
      body: baseBody({ provider: 'bank_transfer' }),
      headers: { cookie: `pelerin_shop_cart=${sessionId}` },
    });
    const res = await runPost({ db, sdk, ctx });
    assert.equal(res.status, 201);
    const b = await res.json();
    assert.equal(b.success, true);
    // Verify order's payment_provider
    const [order] = await db.select().from(orders).where(eq(orders.id, b.data.order_id));
    assert.equal(order.payment_provider, 'bank_transfer');
    // Check response payment object
    assert.equal(b.data.payment.provider, 'bank_transfer');
    const instructions = b.data.payment.instructions;
    assert.ok(instructions, 'instructions should be present');
    assert.equal(instructions.beneficiary, 'Pelerin SRL');
    assert.equal(instructions.iban, 'RO49AAAA...');
    assert.equal(instructions.bank_name, 'Banca X');
    assert.equal(instructions.reference_note, 'Use order number');
    assert.equal(instructions.reference, b.data.order_number);
  } finally {
    await cleanup();
  }
});

test('POST with ramburs disabled → 422', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    await upsertSetting(db, 'ramburs_enabled', 'false');
    const { sessionId } = await seedCartWithItem(db, f);
    const sdk = makeFakeSdk({ user: null });
    const ctx = makeCtx({
      url: URL,
      method: 'POST',
      body: baseBody({ provider: 'ramburs' }),
      headers: { cookie: `pelin_shop_cart=${sessionId}` },
    });
    const res = await runPost({ db, sdk, ctx });
    assert.equal(res.status, 422);
    const b = await res.json();
    assert.equal(b.success, false);
  } finally {
    await cleanup();
  }
});

test('POST bank_transfer instructions omit optional fields when not saved', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    // Only required fields
    await upsertSetting(db, 'bank_transfer_beneficiary', 'Pelerin SRL');
    await upsertSetting(db, 'bank_transfer_iban', 'RO49AAAA...');

    const { sessionId } = await seedCartWithItem(db, f);
    const sdk = makeFakeSdk({ user: null });
    const ctx = makeCtx({
      url: URL,
      method: 'POST',
      body: baseBody({ provider: 'bank_transfer' }),
      headers: { cookie: `pelerin_shop_cart=${sessionId}` },
    });
    const res = await runPost({ db, sdk, ctx });
    assert.equal(res.status, 201);
    const b = await res.json();
    const instructions = b.data.payment.instructions;
    assert.ok(instructions, 'instructions should be present');
    assert.equal(instructions.beneficiary, 'Pelerin SRL');
    assert.equal(instructions.iban, 'RO49AAAA...');
    // Optional fields should be absent/null
    assert.equal(instructions.bank_name, undefined);
    assert.equal(instructions.reference_note, undefined);
    assert.equal(instructions.reference, b.data.order_number);
  } finally {
    await cleanup();
  }
});
