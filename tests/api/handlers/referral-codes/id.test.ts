import { test } from 'node:test';
import { ensureLoader } from '../../../stubs/register.mjs';
import { matrix, assert, createTestDb, seedMinimal, makeFakeSdk, makeCtx } from '../_matrix.ts';

ensureLoader();
const { runGet, runPut, runDelete } =
  await import('../../../../src/api/shop/referral-codes/[id].ts');

const base = 'http://localhost/api/plugins/shop/referral-codes';

// seedMinimal creates referral codes but does not expose their ids in Fixtures.
async function firstReferralId(db: any): Promise<string> {
  const { referral_codes } = await import('../../../../src/db/schema.ts');
  const rows = await db.select().from(referral_codes);
  assert.ok(rows.length > 0, 'seed should create referrals');
  return rows[0].id;
}

test('GET [id] auth-fail → 401', () =>
  matrix.adminAuthFail({ run: runGet, url: `${base}/x`, params: { id: 'x' } }));

test('GET [id] happy-path → 200, data.id matches', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const id = await firstReferralId(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({ url: `${base}/${id}`, params: { id } });
    const res = await runGet({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await res.json();
    assert.equal(b.success, true);
    assert.equal(b.data.id, id);
  } finally {
    await cleanup();
  }
});

test('GET [id] not-found → 404', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const sdk = makeFakeSdk();
    const ctx = makeCtx({ url: `${base}/nope`, params: { id: 'nope' } });
    const res = await runGet({ db, sdk, ctx });
    assert.equal(res.status, 404);
    const b = await res.json();
    assert.equal(b.success, false);
  } finally {
    await cleanup();
  }
});

test('GET [id] error-wrap → 500', () =>
  matrix.errorWrap({ run: runGet, url: `${base}/x`, params: { id: 'x' } }));

test('PUT [id] auth-fail → 401', () =>
  matrix.adminAuthFail({ run: runPut, url: `${base}/x`, body: {}, params: { id: 'x' } }));

test('PUT [id] validation-fail → 422', () =>
  matrix.validationFail({
    run: runPut,
    url: `${base}/x`,
    invalidBody: { discount_value: 'not-a-number' },
    params: { id: 'x' },
  }));

test('PUT [id] happy-path → 200', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const id = await firstReferralId(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: `${base}/${id}`,
      body: { active: false },
      method: 'PUT',
      params: { id },
    });
    const res = await runPut({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await res.json();
    assert.equal(b.success, true);
    assert.equal(b.data.id, id);
  } finally {
    await cleanup();
  }
});

test('PUT [id] error-wrap → 500', () =>
  matrix.errorWrap({
    run: runPut,
    url: `${base}/x`,
    body: { active: false },
    params: { id: 'x' },
  }));

test('DELETE [id] auth-fail → 401', () =>
  matrix.adminAuthFail({ run: runDelete, url: `${base}/x`, params: { id: 'x' } }));

test('DELETE [id] happy-path → 200', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const id = await firstReferralId(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({ url: `${base}/${id}`, method: 'DELETE', params: { id } });
    const res = await runDelete({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await res.json();
    assert.equal(b.success, true);
  } finally {
    await cleanup();
  }
});

test('DELETE [id] error-wrap → 500', () =>
  matrix.errorWrap({ run: runDelete, url: `${base}/x`, params: { id: 'x' } }));
