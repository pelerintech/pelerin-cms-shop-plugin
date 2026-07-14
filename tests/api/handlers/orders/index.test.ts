import { test } from 'node:test';
import assert from 'node:assert';
import { ensureLoader } from '../../../stubs/register.mjs';
import { matrix } from '../_matrix.ts';
import { makeFakeSdk, makeCtx, poisonDb } from '../../helpers.ts';
import { createTestDb, seedMinimal } from '../../../db/harness.ts';

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
    status: 'pending',
    currency: 'RON',
    subtotal_net: 5000,
    vat_total: 250,
    shipping_cost: 0,
    discount_amount: 0,
    total: 5250,
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
        price_net: 5000,
        vat_rate: 0.05,
        price_gross: 5250,
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
