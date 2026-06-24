import { test } from 'node:test';
import assert from 'node:assert';
import { ensureLoader } from '../../../stubs/register.mjs';
import { matrix } from '../_matrix.ts';
import { makeFakeSdk, makeCtx, poisonDb, unauthorizedError } from '../../helpers.ts';
import { createTestDb, seedMinimal, insertFixture } from '../../../db/harness.ts';
import { createOrder } from '../../../../src/lib/data/orders.ts';

ensureLoader();
const { runGet } = await import('../../../../src/api/shop/orders/export.ts');

const base = 'http://localhost/api/plugins/shop/orders/export';

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

async function seedOrder(db: any, f: any, orderNumber: string, cartId: string) {
  await makeCartWithItem(db, f, cartId, f.simpleProductId);
  return createOrder(db, {
    order_number: orderNumber, user_id: null, customer_type: 'individual',
    customer_email: 't@e.com', customer_name: 'T', customer_phone: null, currency: 'RON',
    subtotal_net: 5000, vat_total: 250, shipping_cost: 0, discount_amount: 0, total: 5250,
    shipping_type: 'physical', billing_first_name: 'T', billing_last_name: 'U', billing_address: 'A',
    billing_city: 'C', billing_postal_code: '1', billing_country: 'RO',
    shipping_first_name: 'T', shipping_last_name: 'U', shipping_address: 'A',
    shipping_city: 'C', shipping_postal_code: '1', shipping_country: 'RO',
    shipping_same_as_billing: true, cart_id: cartId,
    items: [{ product_id: f.simpleProductId, variant_id: null, product_name: 'Carte', sku: 'BOOK-001', quantity: 1, price_net: 5000, vat_rate: 0.05, price_gross: 5250, currency: 'RON' }],
  });
}

test('GET auth-fail → 401', () =>
  matrix.adminAuthFail({ run: runGet, url: base }));

test('GET happy-path → 200, text/csv with header + rows', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    await seedOrder(db, f, 'ORD-EXP1', 'cart-exp1');
    await seedOrder(db, f, 'ORD-EXP2', 'cart-exp2');
    const sdk = makeFakeSdk();
    const ctx = makeCtx({ url: base });
    const res = await runGet({ db, sdk, ctx });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('Content-Type'), 'text/csv');
    const text = await res.text();
    const lines = text.split('\n');
    // header row
    assert.equal(lines[0], 'order_number,status,customer_name,customer_email,total,currency,created_at');
    // at least 2 data rows beyond the header
    assert.ok(lines.length >= 3, 'should have header + at least 2 order rows');
  } finally {
    await cleanup();
  }
});

test('GET happy-path empty → 200, header only', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({ url: base });
    const res = await runGet({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const text = await res.text();
    const lines = text.split('\n');
    assert.equal(lines.length, 1, 'only header row when no orders');
    assert.equal(lines[0], 'order_number,status,customer_name,customer_email,total,currency,created_at');
  } finally {
    await cleanup();
  }
});

test('GET error-wrap → 500', () =>
  matrix.errorWrap({ run: runGet, url: base }));
