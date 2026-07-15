import { test } from 'node:test';
import { ensureLoader } from '../../../../../stubs/register.mjs';
import { createTestDb, seedMinimal, makeFakeSdk, makeCtx, assert } from '../../../_matrix.ts';

ensureLoader();
const { runPost } = await import('../../../../../../src/api/shop/public/checkout/[orderId]/pay.ts');

const URL = (orderId: string) => `http://localhost/api/plugins/shop/public/checkout/${orderId}/pay`;

test('POST validation-fail → 422 (provider missing)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const sdk = makeFakeSdk({ user: null });
    const ctx = makeCtx({
      url: URL('ord-1'),
      method: 'POST',
      body: {},
      params: { orderId: 'ord-1' },
    });
    const res = await runPost({ db, sdk, ctx });
    assert.equal(res.status, 422);
    const b = await res.json();
    assert.equal(b.success, false);
    assert.equal(b.error, 'provider is required');
  } finally {
    await cleanup();
  }
});

test('POST validation-fail → 422 (unknown provider)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const sdk = makeFakeSdk({ user: null });
    const ctx = makeCtx({
      url: URL('ord-1'),
      method: 'POST',
      body: {
        provider: 'nope',
        success_url: 'https://example.com/success',
        cancel_url: 'https://example.com/cart',
      },
      params: { orderId: 'ord-1' },
    });
    const res = await runPost({ db, sdk, ctx });
    assert.equal(res.status, 422);
    const b = await res.json();
    assert.equal(b.success, false);
    assert.equal(b.error, 'Unknown payment provider');
  } finally {
    await cleanup();
  }
});

test('POST not-found → 404 (order missing)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const sdk = makeFakeSdk({ user: null });
    const ctx = makeCtx({
      url: URL('no-such-order'),
      method: 'POST',
      body: {
        provider: 'stripe',
        success_url: 'https://example.com/success',
        cancel_url: 'https://example.com/cart',
      },
      params: { orderId: 'no-such-order' },
    });
    const res = await runPost({ db, sdk, ctx });
    assert.equal(res.status, 404);
    const b = await res.json();
    assert.equal(b.success, false);
    assert.equal(b.error, 'Order not found');
  } finally {
    await cleanup();
  }
});

test('POST error-wrap → 500 (poison db)', async () => {
  const { matrix } = await import('../../../_matrix.ts');
  await matrix.errorWrap({
    run: runPost,
    url: URL('ord-1'),
    method: 'POST',
    params: { orderId: 'ord-1' },
    body: {
      provider: 'stripe',
      success_url: 'https://example.com/success',
      cancel_url: 'https://example.com/cart',
    },
  });
});

// NOTE: a true 200 happy-path requires a configured/mocked payment provider
// (stripe_secret_key etc.), which is out of scope for handler unit tests.
// Covered: 422 (missing/unknown provider), 404 (order not found), 500 (db error).
