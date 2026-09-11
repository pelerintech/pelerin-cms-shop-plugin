import { test } from 'node:test';
import { ensureLoader } from '../../../stubs/register.mjs';
import { matrix, assert, createTestDb, seedMinimal, makeFakeSdk, makeCtx } from '../_matrix.ts';

ensureLoader();
const { runGet, runPut, runDelete } = await import('../../../../src/api/shop/vouchers/[id].ts');

const base = 'http://localhost/api/plugins/shop/vouchers';

// seedMinimal creates vouchers but does not expose their ids in Fixtures.
// Fetch the first voucher id from the seeded db.
async function firstVoucherId(db: any): Promise<string> {
  const { vouchers } = await import('../../../../src/db/schema.ts');
  const rows = await db.select().from(vouchers);
  assert.ok(rows.length > 0, 'seed should create vouchers');
  return rows[0].id;
}

test('GET [id] auth-fail → 401', () =>
  matrix.adminAuthFail({ run: runGet, url: `${base}/x`, params: { id: 'x' } }));

test('GET [id] happy-path → 200, data.id matches', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const id = await firstVoucherId(db);
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
    invalidBody: { value: 'not-a-number' },
    params: { id: 'x' },
  }));

test('PUT [id] happy-path → 200', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const id = await firstVoucherId(db);
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
    const id = await firstVoucherId(db);
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

test('PUT converts fixed_amount value + min_order_value to minor on store', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const id = await firstVoucherId(db);
    const sdk = makeFakeSdk();
    const body = { type: 'fixed_amount', value: 7, min_order_value: 30 };
    const ctx = makeCtx({ url: `${base}/${id}`, method: 'PUT', body, params: { id } });
    const res = await runPut({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const { eq } = await import('drizzle-orm');
    const { vouchers } = await import('../../../../src/db/schema.ts');
    const row = (await db.select().from(vouchers).where(eq(vouchers.id, id)))[0];
    assert.equal(row.value, 700, 'value stored minor (7.00 → 700)');
    assert.equal(row.min_order_value, 3000, 'min_order_value stored minor (30.00 → 3000)');
  } finally {
    await cleanup();
  }
});
