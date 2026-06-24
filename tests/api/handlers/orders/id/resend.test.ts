import { test } from 'node:test';
import assert from 'node:assert';
import { ensureLoader } from '../../../../stubs/register.mjs';
import { makeFakeSdk, makeCtx, unauthorizedError } from '../../../helpers.ts';
import { poisonDb } from '../../../helpers.ts';

ensureLoader();
const { runPost } = await import('../../../../../src/api/shop/orders/[id]/resend.ts');

const base = 'http://localhost/api/plugins/shop/orders/';

function jsonBody(res: Response) {
  return res.json();
}

// resend.ts is a stub: it requires admin, then returns 200 with a message.
// It performs NO db access and NO body validation, so the standard matrix
// collapses to auth-fail + happy-path only (no validation-fail, no error-wrap).

test('POST auth-fail → 401', async () => {
  const sdk = makeFakeSdk({ authThrows: unauthorizedError() });
  const ctx = makeCtx({ url: base + 'x', body: {}, params: { id: 'x' } });
  const res = await runPost({ db: poisonDb(), sdk, ctx });
  assert.equal(res.status, 401);
  const b = await jsonBody(res);
  assert.equal(b.success, false);
});

test('POST happy-path → 200, success true', async () => {
  const sdk = makeFakeSdk();
  const ctx = makeCtx({ url: base + 'some-id', params: { id: 'some-id' } });
  const res = await runPost({ db: poisonDb(), sdk, ctx });
  assert.equal(res.status, 200);
  const b = await jsonBody(res);
  assert.equal(b.success, true);
  assert.ok(b.message, 'message should be present');
});
