import { test } from 'node:test';
import { ensureLoader } from '../../../stubs/register.mjs';
import {
  matrix,
  assert,
  makeFakeSdk,
  makeCtx,
  poisonDb,
} from '../_matrix.ts';

ensureLoader();
const { runGet, runPut } = await import(
  '../../../../src/api/shop/settings/general.ts'
);

const base = 'http://localhost/api/plugins/shop/settings/general';

test('GET auth-fail → 401', () =>
  matrix.adminAuthFail({ run: runGet, url: base }));

test('GET happy-path → 200, data has locales/currencies', () =>
  matrix.happyPath({
    run: runGet,
    url: base,
    check: (b) => {
      assert.ok(b.data, 'data should exist');
      assert.ok(Array.isArray(b.data.locales), 'locales should be array');
      assert.ok(Array.isArray(b.data.currencies), 'currencies should be array');
    },
  }));

// Pattern A handler: auth is caught (→401) but db work is NOT wrapped in
// try/catch, so a poisoned db propagates as an unhandled rejection rather
// than a 500 Response. Assert the rejection (auth passed, db was reached).
test('GET error-wrap → rejects on db error (Pattern A)', async () => {
  const sdk = makeFakeSdk();
  const ctx = makeCtx({ url: base });
  await assert.rejects(
    () => runGet({ db: poisonDb(), sdk, ctx }),
    /poison/,
  );
});

test('PUT auth-fail → 401', () =>
  matrix.adminAuthFail({ run: runPut, url: base, body: {} }));

test('PUT validation-fail → 422', () =>
  matrix.validationFail({
    run: runPut,
    url: base,
    invalidBody: { shop_name: 12345 /* number, not string */ },
  }));

test('PUT happy-path → 200, success', () =>
  matrix.happyPath({
    run: runPut,
    url: base,
    method: 'PUT',
    body: { shop_name: 'My Shop', default_currency: 'RON' },
    check: (b) => assert.equal(b.success, true),
  }));

test('PUT error-wrap → rejects on db error (Pattern A)', async () => {
  const sdk = makeFakeSdk();
  const ctx = makeCtx({ url: base, body: { shop_name: 'Err' }, method: 'PUT' });
  await assert.rejects(
    () => runPut({ db: poisonDb(), sdk, ctx }),
    /poison/,
  );
});
