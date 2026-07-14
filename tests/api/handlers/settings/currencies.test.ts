import { test } from 'node:test';
import { ensureLoader } from '../../../stubs/register.mjs';
import { matrix, assert, makeFakeSdk, makeCtx, poisonDb } from '../_matrix.ts';

ensureLoader();
const { runGet, runPut } = await import('../../../../src/api/shop/settings/currencies.ts');

const base = 'http://localhost/api/plugins/shop/settings/currencies';

test('GET auth-fail → 401', () => matrix.adminAuthFail({ run: runGet, url: base }));

test('GET happy-path → 200 with array', () =>
  matrix.happyPath({
    run: runGet,
    url: base,
    check: (b) => {
      assert.ok(b.data, 'data should exist');
      assert.ok(Array.isArray(b.data), 'data should be array');
    },
  }));

// Pattern A handler — auth is caught, db work is not wrapped
test('GET error-wrap → rejects on db error (Pattern A)', async () => {
  const sdk = makeFakeSdk();
  const ctx = makeCtx({ url: base });
  await assert.rejects(() => runGet({ db: poisonDb(), sdk, ctx }), /poison/);
});

test('PUT auth-fail → 401', () =>
  matrix.adminAuthFail({ run: runPut, url: base, body: { currencies: [] } }));

test('PUT validation-fail → 422 (duplicate codes)', () =>
  matrix.validationFail({
    run: runPut,
    url: base,
    invalidBody: {
      currencies: [
        { code: 'RON', name: 'Leu românesc', isDefault: true },
        { code: 'RON', name: 'Romanian Leu', isDefault: false },
      ],
    },
  }));

test('PUT validation-fail → 422 (no default)', () =>
  matrix.validationFail({
    run: runPut,
    url: base,
    invalidBody: {
      currencies: [{ code: 'RON', name: 'Leu românesc', isDefault: false }],
    },
  }));

test('PUT validation-fail → 422 (invalid code format)', () =>
  matrix.validationFail({
    run: runPut,
    url: base,
    invalidBody: {
      currencies: [{ code: 'RONIA', name: 'Leu românesc', isDefault: true }],
    },
  }));

test('PUT happy-path → 200, success', () =>
  matrix.happyPath({
    run: runPut,
    url: base,
    method: 'PUT',
    body: {
      currencies: [
        { code: 'RON', name: 'Leu românesc', isDefault: true },
        { code: 'EUR', name: 'Euro', isDefault: false },
      ],
    },
    check: (b) => assert.equal(b.success, true),
  }));

// Pattern A handler — auth is caught, db work is not wrapped
test('PUT error-wrap → rejects on db error (Pattern A)', async () => {
  const sdk = makeFakeSdk();
  const ctx = makeCtx({
    url: base,
    body: {
      currencies: [{ code: 'RON', name: 'Leu românesc', isDefault: true }],
    },
    method: 'PUT',
  });
  await assert.rejects(() => runPut({ db: poisonDb(), sdk, ctx }), /poison/);
});
