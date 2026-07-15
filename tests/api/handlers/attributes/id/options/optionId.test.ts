import { test } from 'node:test';
import assert from 'node:assert';
import { ensureLoader } from '../../../../../stubs/register.mjs';
import { matrix, createTestDb, seedMinimal, makeFakeSdk, makeCtx } from '../../../_matrix.ts';

ensureLoader();
const { runGet, runPut, runDelete } =
  await import('../../../../../../src/api/shop/attributes/[id]/options/[optionId].ts');

const base = (id: string, oid: string) =>
  `http://localhost/api/plugins/shop/attributes/${id}/options/${oid}`;

test('GET [optionId] auth-fail → 401', () =>
  matrix.adminAuthFail({
    run: runGet,
    url: base('x', 'y'),
    params: { id: 'x', optionId: 'y' },
  }));

test('GET [optionId] happy-path seeded → 200, data.id === optId', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: base(f.attrColorId, f.optColorBlackId),
      params: { id: f.attrColorId, optionId: f.optColorBlackId },
    });
    const res = await runGet({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await res.json();
    assert.equal(b.success, true);
    assert.equal(b.data.id, f.optColorBlackId);
  } finally {
    await cleanup();
  }
});

test('GET [optionId] not-found → 404', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const sdk = makeFakeSdk();
    const ctx = makeCtx({ url: base('x', 'nope'), params: { id: 'x', optionId: 'nope' } });
    const res = await runGet({ db, sdk, ctx });
    assert.equal(res.status, 404);
    const b = await res.json();
    assert.equal(b.success, false);
  } finally {
    await cleanup();
  }
});

test('GET [optionId] error-wrap → 500', () =>
  matrix.errorWrap({
    run: runGet,
    url: base('x', 'y'),
    params: { id: 'x', optionId: 'y' },
  }));

test('PUT [optionId] auth-fail → 401', () =>
  matrix.adminAuthFail({
    run: runPut,
    url: base('x', 'y'),
    body: {},
    params: { id: 'x', optionId: 'y' },
  }));

test('PUT [optionId] validation-fail → 422', () =>
  matrix.validationFail({
    run: runPut,
    url: base('x', 'y'),
    invalidBody: { sort_order: 'not-a-number' },
    params: { id: 'x', optionId: 'y' },
  }));

test('PUT [optionId] happy-path seeded → 200', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: base(f.attrColorId, f.optColorBlackId),
      body: { value: 'jet-black' },
      method: 'PUT',
      params: { id: f.attrColorId, optionId: f.optColorBlackId },
    });
    const res = await runPut({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await res.json();
    assert.equal(b.success, true);
    assert.equal(b.data.id, f.optColorBlackId);
  } finally {
    await cleanup();
  }
});

test('PUT [optionId] not-found (OptionError) → 404', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: base('x', 'nope'),
      body: { value: 'x' },
      method: 'PUT',
      params: { id: 'x', optionId: 'nope' },
    });
    const res = await runPut({ db, sdk, ctx });
    assert.equal(res.status, 404);
    const b = await res.json();
    assert.equal(b.success, false);
  } finally {
    await cleanup();
  }
});

test('PUT [optionId] error-wrap → 500', () =>
  matrix.errorWrap({
    run: runPut,
    url: base('x', 'y'),
    body: { value: 'err' },
    params: { id: 'x', optionId: 'y' },
  }));

test('DELETE [optionId] auth-fail → 401', () =>
  matrix.adminAuthFail({
    run: runDelete,
    url: base('x', 'y'),
    params: { id: 'x', optionId: 'y' },
  }));

test('DELETE [optionId] happy-path seeded (unused option) → 200', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    // optColorWhiteId is in offered_option_ids of the color assignment → would be in_use.
    // Create a fresh unused option to delete successfully.
    const freeOptId = crypto.randomUUID();
    const { insertFixture } = await import('../../../../../db/harness.ts');
    await insertFixture(db, 'product_attribute_options', {
      id: freeOptId,
      attribute_id: f.attrColorId,
      value: 'green',
      sort_order: 9,
    });
    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: base(f.attrColorId, freeOptId),
      method: 'DELETE',
      params: { id: f.attrColorId, optionId: freeOptId },
    });
    const res = await runDelete({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await res.json();
    assert.equal(b.success, true);
  } finally {
    await cleanup();
  }
});

test('DELETE [optionId] conflict (in_use) → 409', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const f = await seedMinimal(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: base(f.attrColorId, f.optColorBlackId),
      method: 'DELETE',
      params: { id: f.attrColorId, optionId: f.optColorBlackId },
    });
    const res = await runDelete({ db, sdk, ctx });
    assert.equal(res.status, 409);
    const b = await res.json();
    assert.equal(b.success, false);
  } finally {
    await cleanup();
  }
});

test('DELETE [optionId] error-wrap → 500', () =>
  matrix.errorWrap({
    run: runDelete,
    url: base('x', 'y'),
    params: { id: 'x', optionId: 'y' },
  }));
