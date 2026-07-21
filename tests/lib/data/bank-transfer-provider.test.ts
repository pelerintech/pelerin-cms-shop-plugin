/**
 * Tests for the bank_transfer payment provider module.
 *
 * Covers: registry registration, interface conformance (stubs),
 * and isConfigured credential-based logic.
 */
import { test, before } from 'node:test';
import assert from 'node:assert';
import { ensureLoader } from '../../stubs/register.mjs';
import { createTestDb, seedMinimal } from '../../db/harness.ts';
import { upsertSetting } from '../../../src/lib/data/settings.ts';

ensureLoader();

const { listProviders, getProvider } = await import('../../../src/providers/payment/registry.ts');
// Import provider modules to register them
await import('../../../src/providers/payment/stripe');
await import('../../../src/providers/payment/euplatesc');
const bankTransferMod = await import('../../../src/providers/payment/bank_transfer');
const bankTransferProvider = bankTransferMod.default;

test('bank_transfer is registered in listProviders', () => {
  const providers = listProviders();
  const p = providers.find((pr) => pr.name === 'bank_transfer');
  assert.ok(p, 'bank_transfer should be in listProviders');
  assert.equal(p.refundable, false);
});

test('bank_transfer initiatePayment returns empty stub', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const result = await bankTransferProvider.initiatePayment(db, {} as any, {} as any);
    assert.deepStrictEqual(result, { redirect_url: '', provider_session_id: '' });
  } finally {
    await cleanup();
  }
});

test('bank_transfer handleWebhook returns pending stub', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const result = await bankTransferProvider.handleWebhook(db, new Request('http://localhost'));
    assert.deepStrictEqual(result, { order_id: '', status: 'pending' });
  } finally {
    await cleanup();
  }
});

test('bank_transfer refund throws not refundable', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await assert.rejects(
      () => bankTransferProvider.refund(db, {} as any, 0, 'test'),
      (err: any) => /not refundable/i.test(err.message),
      'should throw Error with "not refundable"'
    );
  } finally {
    await cleanup();
  }
});

test('bank_transfer isConfigured returns false when no credentials', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const configured = await bankTransferProvider.isConfigured(db);
    assert.equal(configured, false);
  } finally {
    await cleanup();
  }
});

test('bank_transfer isConfigured returns true when beneficiary + iban saved', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    await upsertSetting(db, 'bank_transfer_beneficiary', 'Pelerin SRL');
    await upsertSetting(db, 'bank_transfer_iban', 'RO49AAAA...');
    const configured = await bankTransferProvider.isConfigured(db);
    assert.equal(configured, true);
  } finally {
    await cleanup();
  }
});

test('bank_transfer isConfigured returns false when only beneficiary saved', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    await upsertSetting(db, 'bank_transfer_beneficiary', 'Pelerin SRL');
    const configured = await bankTransferProvider.isConfigured(db);
    assert.equal(configured, false);
  } finally {
    await cleanup();
  }
});
