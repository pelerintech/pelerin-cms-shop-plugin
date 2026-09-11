import { test } from 'node:test';
import { ensureLoader } from '../../../stubs/register.mjs';
import { assert, matrix, createTestDb, seedMinimal, makeFakeSdk, makeCtx } from '../_matrix.ts';
import { insertFixture } from '../../../db/harness.ts';
import { carts } from '../../../../src/db/schema.ts';
import { eq } from 'drizzle-orm';

ensureLoader();
const { runGet, runDelete } = await import('../../../../src/api/shop/carts/[id].ts');

const base = 'http://localhost/api/plugins/shop/carts';

async function makeCart(db: any): Promise<string> {
  const now = new Date();
  const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const id = crypto.randomUUID();
  await insertFixture(db, 'carts', {
    id,
    session_id: 'sess-test-1',
    user_id: null,
    applied_voucher_code: null,
    applied_referral_code: null,
    converted_at: null,
    expires_at: expires,
    created_at: now,
    updated_at: now,
  });
  return id;
}

test('GET [id] auth-fail → 401', () =>
  matrix.adminAuthFail({ run: runGet, url: `${base}/x`, params: { id: 'x' } }));

test('GET [id] happy-path → 200, data.id matches', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const id = await makeCart(db);
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

test('DELETE [id] auth-fail → 401', () =>
  matrix.adminAuthFail({ run: runDelete, url: `${base}/x`, params: { id: 'x' } }));

test('DELETE [id] happy-path → 200 and removes the cart', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const id = await makeCart(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({ url: `${base}/${id}`, params: { id } });
    const res = await runDelete({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await res.json();
    assert.equal(b.success, true);
    const rows = await db.select().from(carts).where(eq(carts.id, id));
    assert.equal(rows.length, 0, 'cart must be deleted');
  } finally {
    await cleanup();
  }
});

test('DELETE [id] error-wrap → 500', () =>
  matrix.errorWrap({ run: runDelete, url: `${base}/x`, params: { id: 'x' } }));
