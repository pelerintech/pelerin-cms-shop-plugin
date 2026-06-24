import { test } from 'node:test';
import assert from 'node:assert';
import { ensureLoader } from '../../../stubs/register.mjs';
import { matrix } from '../_matrix.ts';
import { makeFakeSdk, makeCtx, poisonDb } from '../../helpers.ts';
import { createTestDb, seedMinimal, insertFixture } from '../../../db/harness.ts';
import { createOrder } from '../../../../src/lib/data/orders.ts';

ensureLoader();
const { runGet } = await import('../../../../src/api/shop/orders/[id].ts');

const base = 'http://localhost/api/plugins/shop/orders/';

function jsonBody(res: Response) {
  return res.json();
}

async function makeCartWithItem(db: any, f: any, cartId: string, productId: string) {
  const now = new Date();
  const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  await insertFixture(db, 'carts', {
    id: cartId, session_id: 'sess-' + cartId, user_id: null, applied_voucher_code: null,
    applied_referral_code: null, converted_at: null, expires_at: expires,
    created_at: now, updated_at: now,
  });
  await insertFixture(db, 'cart_items', {
    id: 'ci-' + cartId, cart_id: cartId, product_id: productId, variant_id: null, quantity: 1,
  });
  return cartId;
}

async function seedOrder(db: any, f: any, orderNumber = 'ORD-T') {
  const cartId = await makeCartWithItem(db, f, 'cart-detail', f.simpleProductId);
  return createOrder(db, {
    order_number: orderNumber,
    user_id: null,
    customer_type: 'individual',
    customer_email: 't@e.com',
    customer_name: 'T',
    customer_phone: null,
    currency: 'RON',
    subtotal_net: 5000,
    vat_total: 250,
    shipping_cost: 0,
    discount_amount: 0,
    total: 5250,
    shipping_type: 'physical',
    billing_first_name: 'T',
    billing_last_name: 'U',
    billing_address: 'A',
    billing_city: 'C',
    billing_postal_code: '1',
    billing_country: 'RO',
    shipping_first_name: 'T',
    shipping_last_name: 'U',
    shipping_address: 'A',
    shipping_city: 'C',
    shipping_postal_code: '1',
    shipping_country: 'RO',
    shipping_same_as_billing: true,
    cart_id: cartId,
    items: [
      {
        product_id: f.simpleProductId,
        variant_id: null,
        product_name: 'Carte',
        sku: 'BOOK-001',
        quantity: 1,
        price_net: 5000,
        vat_rate: 0.05,
        price_gross: 5250,
        currency: 'RON',
      },
    ],
  });
}

test('GET auth-fail → 401', () =>
  matrix.adminAuthFail({ run: runGet, url: base + 'x', params: { id: 'x' } }));

test('GET happy-path → 200, data.id matches, items present', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const order = await seedOrder(db, f);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({ url: base + order.id, params: { id: order.id } });
    const res = await runGet({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await jsonBody(res);
    assert.equal(b.success, true);
    assert.equal(b.data.id, order.id);
    assert.ok(Array.isArray(b.data.items), 'items should be array');
    assert.ok(Array.isArray(b.data.status_history), 'status_history should be array');
  } finally {
    await cleanup();
  }
});

test('GET happy-path 404: unknown id → 404', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({ url: base + 'nope', params: { id: 'nope' } });
    const res = await runGet({ db, sdk, ctx });
    assert.equal(res.status, 404);
    const b = await jsonBody(res);
    assert.equal(b.success, false);
  } finally {
    await cleanup();
  }
});

test('GET error-wrap → 500', () =>
  matrix.errorWrap({ run: runGet, url: base + 'x', params: { id: 'x' } }));
