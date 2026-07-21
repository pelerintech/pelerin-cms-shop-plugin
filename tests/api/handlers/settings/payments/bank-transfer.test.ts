/**
 * Tests for the bank transfer settings API endpoint.
 *
 * GET  /api/plugins/shop/settings/payments/bank-transfer  — fetch settings
 * PUT  /api/plugins/shop/settings/payments/bank-transfer  — save settings
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { ensureLoader } from '../../../../stubs/register.mjs';
import { createTestDb, seedMinimal, makeFakeSdk, makeCtx, matrix } from '../../_matrix.ts';
import { getSetting } from '../../../../../src/lib/data/settings.ts';

ensureLoader();

const { runGet, runPut } =
  await import('../../../../../src/api/shop/settings/payments/bank-transfer.ts');

const URL = 'http://localhost/api/plugins/shop/settings/payments/bank-transfer';

test('admin PUT with all fields → 200, settings persisted', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: URL,
      method: 'PUT',
      body: {
        beneficiary: 'Pelerin SRL',
        iban: 'RO49AAAA...',
        bank_name: 'Banca X',
        reference_note: 'Use order number as reference',
      },
    });
    const res = await runPut({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await res.json();
    assert.equal(b.success, true);

    // Verify persisted
    assert.equal(await getSetting(db, 'bank_transfer_beneficiary'), 'Pelerin SRL');
    assert.equal(await getSetting(db, 'bank_transfer_iban'), 'RO49AAAA...');
    assert.equal(await getSetting(db, 'bank_transfer_bank_name'), 'Banca X');
    assert.equal(
      await getSetting(db, 'bank_transfer_reference_note'),
      'Use order number as reference'
    );
  } finally {
    await cleanup();
  }
});

test('admin PUT missing iban → 422', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: URL,
      method: 'PUT',
      body: { beneficiary: 'Pelerin SRL' },
    });
    const res = await runPut({ db, sdk, ctx });
    assert.equal(res.status, 422);
    const b = await res.json();
    assert.equal(b.success, false);
    assert.ok(b.fields?.iban, 'iban field error should be present');
  } finally {
    await cleanup();
  }
});

test('admin PUT missing beneficiary → 422', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({
      url: URL,
      method: 'PUT',
      body: { iban: 'RO49AAAA...' },
    });
    const res = await runPut({ db, sdk, ctx });
    assert.equal(res.status, 422);
    const b = await res.json();
    assert.equal(b.success, false);
    assert.ok(b.fields?.beneficiary, 'beneficiary field error should be present');
  } finally {
    await cleanup();
  }
});

test('GET after save → 200, matches saved values', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const sdk = makeFakeSdk();

    // First save
    const putCtx = makeCtx({
      url: URL,
      method: 'PUT',
      body: {
        beneficiary: 'Pelerin SRL',
        iban: 'RO49AAAA...',
        bank_name: 'Banca X',
        reference_note: 'Use order number',
      },
    });
    await runPut({ db, sdk, ctx: putCtx });

    // Then read
    const getCtx = makeCtx({ url: URL, method: 'GET' });
    const res = await runGet({ db, sdk, ctx: getCtx });
    assert.equal(res.status, 200);
    const b = await res.json();
    assert.equal(b.data.beneficiary, 'Pelerin SRL');
    assert.equal(b.data.iban, 'RO49AAAA...');
    assert.equal(b.data.bank_name, 'Banca X');
    assert.equal(b.data.reference_note, 'Use order number');
  } finally {
    await cleanup();
  }
});

test('GET with no saved settings → 200, all null', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    const sdk = makeFakeSdk();
    const ctx = makeCtx({ url: URL, method: 'GET' });
    const res = await runGet({ db, sdk, ctx });
    assert.equal(res.status, 200);
    const b = await res.json();
    assert.strictEqual(b.data.beneficiary, null);
    assert.strictEqual(b.data.iban, null);
    assert.strictEqual(b.data.bank_name, null);
    assert.strictEqual(b.data.reference_note, null);
  } finally {
    await cleanup();
  }
});

test('PUT without admin → 401', () =>
  matrix.adminAuthFail({ run: runPut, url: URL, body: { beneficiary: 'X', iban: 'Y' } }));
