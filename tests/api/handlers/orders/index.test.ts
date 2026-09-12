import { test } from 'node:test';
import assert from 'node:assert';
import { ensureLoader } from '../../../stubs/register.mjs';
import { matrix } from '../_matrix.ts';
import { eq } from 'drizzle-orm';
import { makeFakeSdk, makeCtx, poisonDb } from '../../helpers.ts';
import {
  createTestDb,
  seedMinimal,
  orders,
  order_items,
  insertFixture,
  cart_items,
} from '../../../db/harness.ts';

ensureLoader();
const { runGet, runPost } = await import('../../../../src/api/shop/orders/index.ts');

const base = 'http://localhost/api/plugins/shop/orders';

function jsonBody(res: Response) {
  return res.json();
}

/** A complete, valid CreateOrder body referencing the seeded simple product. */
function validOrderBody(productId: string) {
  return {
    user_id: null,
    customer_type: 'individual',
    customer_email: 'test@example.com',
    customer_name: 'Test User',
    customer_phone: null,
    // Admin manual-order input is in MAJOR units (form).
    status: 'pending',
    currency: 'RON',
    subtotal_net: 50,
    vat_total: 2.5,
    shipping_cost: 0,
    discount_amount: 0,
    total: 52.5,
    shipping_type: 'physical',
    billing_first_name: 'Test',
    billing_last_name: 'User',
    billing_address: 'Str X',
    billing_city: 'City',
    billing_postal_code: '123',
    billing_country: 'RO',
    shipping_first_name: 'Test',
    shipping_last_name: 'User',
    shipping_address: 'Str X',
    shipping_city: 'City',
    shipping_postal_code: '123',
    shipping_country: 'RO',
    shipping_same_as_billing: true,
    items: [
      {
        product_id: productId,
        variant_id: null,
        product_name: 'Carte',
        sku: 'BOOK-001',
        quantity: 1,
        price_net: 50,
        vat_rate: 0.05,
        price_gross: 52.5,
        currency: 'RON',
      },
    ],
  };
}

test('GET auth-fail → 401', () => matrix.adminAuthFail({ run: runGet, url: base }));

test('GET happy-path → 200, data is array', () =>
  matrix.happyPath({
    run: runGet,
    url: base,
    expectedStatus: 200,
    check: (b) => assert.ok(Array.isArray(b.data), 'data should be an array'),
  }));

test('GET error-wrap → 500', () => matrix.errorWrap({ run: runGet, url: base }));

test('POST auth-fail → 401', () => matrix.adminAuthFail({ run: runPost, url: base, body: {} }));

test('POST validation-fail → 422', () =>
  matrix.validationFail({
    run: runPost,
    url: base,
    invalidBody: { customer_email: 'not-an-email' },
  }));

test('POST happy-path → 201, data.id exists', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({ url: base, body: validOrderBody(f.simpleProductId) });
    const res = await runPost({ db, sdk, ctx });
    assert.equal(res.status, 201);
    const b = await jsonBody(res);
    assert.equal(b.success, true);
    assert.ok(b.data?.id, 'data.id should exist');
  } finally {
    await cleanup();
  }
});

test('POST error-wrap → 500', async () => {
  const sdk = makeFakeSdk();
  const ctx = makeCtx({ url: base, body: validOrderBody('poison') });
  const res = await runPost({ db: poisonDb(), sdk, ctx });
  assert.equal(res.status, 500);
  const b = await jsonBody(res);
  assert.equal(b.success, false);
});

test('POST admin-created order → publishes shop.order.confirmed with the order data', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({ url: base, body: validOrderBody(f.simpleProductId) });
    const res = await runPost({ db, sdk, ctx });
    assert.equal(res.status, 201);
    const b = await jsonBody(res);

    const calls = sdk.events.publishCalls as Array<{ event: string; payload: any }>;
    const confirmedCall = calls.find((c) => c.event === 'shop.order.confirmed');
    assert.ok(confirmedCall, 'shop.order.confirmed was published on admin order creation');
    // New bus contract: the payload is the DATA object, not the envelope.
    assert.ok(!('event' in confirmedCall.payload), 'payload is data, not an envelope');
    assert.ok(!('data' in confirmedCall.payload), 'payload has no nested data key');
    assert.equal(
      confirmedCall.payload.order.order_number,
      b.data.order_number,
      'published order.order_number matches the created order'
    );
  } finally {
    await cleanup();
  }
});

test('POST a publish failure does NOT break order creation', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const sdk = makeFakeSdk();
    sdk.events.publish = () => {
      throw new Error('bus down');
    };
    const ctx = makeCtx({ url: base, body: validOrderBody(f.simpleProductId) });
    const res = await runPost({ db, sdk, ctx });
    assert.equal(res.status, 201, 'create must still succeed when publish fails');
    const b = await jsonBody(res);
    assert.equal(b.success, true);
    assert.ok(b.data?.id, 'created order id is returned');
  } finally {
    await cleanup();
  }
});

test('POST converts manual-order item prices + totals to minor on store', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const sdk = makeFakeSdk();
    // Major-unit input (1.00 RON item, 5.00 shipping):
    const body = {
      ...validOrderBody(f.simpleProductId),
      shipping_cost: 5,
      subtotal_net: 1,
      vat_total: 0.19,
      discount_amount: 0,
      total: 6.19,
      items: [
        {
          product_id: f.simpleProductId,
          variant_id: null,
          product_name: 'Carte',
          sku: 'BOOK-001',
          quantity: 1,
          price_net: 1,
          vat_rate: 0.19,
          price_gross: 1.19,
          currency: 'RON',
        },
      ],
    };
    const ctx = makeCtx({ url: base, body });
    const res = await runPost({ db, sdk, ctx });
    assert.equal(res.status, 201);
    const b = await jsonBody(res);
    const orderId = b.data.id;
    const orderRow = (await db.select().from(orders).where(eq(orders.id, orderId)))[0];
    assert.equal(orderRow.shipping_cost, 500, 'shipping_cost stored minor (5.00 → 500)');
    assert.equal(orderRow.total, 619, 'total stored minor (6.19 → 619)');
    assert.equal(orderRow.subtotal_net, 100, 'subtotal_net stored minor (1.00 → 100)');
    const itemRow = (
      await db.select().from(order_items).where(eq(order_items.order_id, orderId))
    )[0];
    assert.equal(itemRow.price_net, 100, 'item price_net stored minor (1.00 → 100)');
    assert.equal(itemRow.price_gross, 119, 'item price_gross stored minor (1.19 → 119)');
  } finally {
    await cleanup();
  }
});

test('POST stored total is internally consistent (sum of converted lines + shipping − discount)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const sdk = makeFakeSdk();
    // Merchant enters 1.00 RON item w/ 19% VAT + 5.00 shipping; client-sent `total`
    // is deliberately WRONG (999) to prove the handler enforces consistency.
    const body = {
      ...validOrderBody(f.simpleProductId),
      shipping_cost: 5,
      subtotal_net: 1,
      vat_total: 0.19,
      discount_amount: 0,
      total: 999,
      items: [
        {
          product_id: f.simpleProductId,
          variant_id: null,
          product_name: 'Carte',
          sku: 'BOOK-001',
          quantity: 1,
          price_net: 1,
          vat_rate: 0.19,
          price_gross: 1.19,
          currency: 'RON',
        },
      ],
    };
    const res = await runPost({ db, sdk, ctx: makeCtx({ url: base, body }) });
    assert.equal(res.status, 201);
    const b = await jsonBody(res);
    const orderRow = (await db.select().from(orders).where(eq(orders.id, b.data.id)))[0];
    // total must equal the recomputed sum of the converted fields (minor), not the
    // client-sent 999×100 = 99900.
    assert.equal(
      orderRow.total,
      orderRow.subtotal_net +
        orderRow.vat_total +
        orderRow.shipping_cost -
        orderRow.discount_amount,
      'total must equal subtotal_net + vat_total + shipping_cost − discount_amount (minor)'
    );
    assert.equal(orderRow.total, 619, '1.00 + 0.19 + 5.00 → 619 minor');
  } finally {
    await cleanup();
  }
});

test('manual and checkout orders are unit-consistent (same product → same minor prices)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const sdk = makeFakeSdk();

    // 1. Admin manual order: merchant types 50.00 RON (= seeded RON minor 5000).
    const manualBody = {
      ...validOrderBody(f.simpleProductId),
      shipping_cost: 0,
      subtotal_net: 50,
      vat_total: 2.5,
      discount_amount: 0,
      total: 52.5,
      items: [
        {
          product_id: f.simpleProductId,
          variant_id: null,
          product_name: 'Carte',
          sku: 'BOOK-001',
          quantity: 1,
          price_net: 50, // major 50.00 RON
          vat_rate: 0.05,
          price_gross: 52.5,
          currency: 'RON',
        },
      ],
    };
    const manualRes = await runPost({ db, sdk, ctx: makeCtx({ url: base, body: manualBody }) });
    assert.equal(manualRes.status, 201);
    const manual = await jsonBody(manualRes);
    const manualOrder = (await db.select().from(orders).where(eq(orders.id, manual.data.id)))[0];
    const manualItem = (
      await db.select().from(order_items).where(eq(order_items.order_id, manual.data.id))
    )[0];
    assert.equal(manualItem.price_net, 5000, 'manual item price_net minor (50.00 → 5000)');
    assert.equal(manualItem.price_gross, 5250, 'manual item price_gross minor (52.50 → 5250)');

    // 2. Public checkout order for the SAME product (seeded RON minor 5000).
    const { runPost: checkoutRun } =
      await import('../../../../src/api/shop/public/checkout/index.ts');
    const now = new Date();
    const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const sessionId = 'sess-manual-co';
    await insertFixture(db, 'carts', {
      id: 'cart-manual-co',
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
      id: 'ci-manual-co',
      cart_id: 'cart-manual-co',
      product_id: f.simpleProductId,
      variant_id: null,
      quantity: 1,
    });
    const checkoutBody = {
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
      provider: 'ramburs',
    };
    const checkoutRes = await checkoutRun({
      db,
      sdk: makeFakeSdk({ user: null }),
      ctx: makeCtx({
        url: 'http://localhost/api/plugins/shop/public/checkout',
        method: 'POST',
        body: checkoutBody,
        headers: { cookie: `pelerin_shop_cart=${sessionId}` },
      }),
    });
    assert.equal(checkoutRes.status, 201);
    const checkout = await checkoutRes.json();
    const checkoutOrder = (
      await db.select().from(orders).where(eq(orders.id, checkout.data.order_id))
    )[0];
    const checkoutItem = (
      await db.select().from(order_items).where(eq(order_items.order_id, checkout.data.order_id))
    )[0];

    // 3. Both orders must store the same product's price in minor units.
    assert.equal(checkoutItem.price_net, 5000, 'checkout item price_net is minor 5000');
    assert.equal(
      manualItem.price_net,
      checkoutItem.price_net,
      'manual == checkout item price_net (minor)'
    );
    assert.equal(
      manualItem.price_gross,
      checkoutItem.price_gross,
      'manual == checkout item price_gross (minor)'
    );
    assert.equal(manualOrder.total, checkoutOrder.total, 'manual == checkout order total (minor)');
  } finally {
    await cleanup();
  }
});
