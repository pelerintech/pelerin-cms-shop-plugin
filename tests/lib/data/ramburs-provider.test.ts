/**
 * Tests for the ramburs payment provider module.
 *
 * Covers: registry registration, interface conformance (stubs),
 * and isConfigured toggle-based logic (default true).
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { ensureLoader } from '../../stubs/register.mjs';
import { createTestDb, seedMinimal } from '../../db/harness.ts';
import { upsertSetting } from '../../../src/lib/data/settings.ts';

ensureLoader();

const { listProviders, getProvider } = await import('../../../src/providers/payment/registry.ts');
// Import provider modules to register them
await import('../../../src/providers/payment/stripe');
await import('../../../src/providers/payment/euplatesc');
await import('../../../src/providers/payment/bank_transfer');
const rambursMod = await import('../../../src/providers/payment/ramburs');
const rambursProvider = rambursMod.default;

test('ramburs is registered in listProviders', () => {
  const providers = listProviders();
  const p = providers.find((pr) => pr.name === 'ramburs');
  assert.ok(p, 'ramburs should be in listProviders');
  assert.equal(p.refundable, false);
});

test('ramburs initiatePayment returns empty stub', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const result = await rambursProvider.initiatePayment(db, {} as any, {} as any);
    assert.deepStrictEqual(result, { redirect_url: '', provider_session_id: '' });
  } finally {
    await cleanup();
  }
});

test('ramburs handleWebhook returns pending stub', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const result = await rambursProvider.handleWebhook(db, new Request('http://localhost'));
    assert.deepStrictEqual(result, { order_id: '', status: 'pending' });
  } finally {
    await cleanup();
  }
});

test('ramburs refund throws not refundable', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await assert.rejects(
      () => rambursProvider.refund(db, {} as any, 0, 'test'),
      (err: any) => /not refundable/i.test(err.message),
      'should throw Error with "not refundable"'
    );
  } finally {
    await cleanup();
  }
});

test('ramburs isConfigured returns true when no setting exists (default)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    const configured = await rambursProvider.isConfigured(db);
    assert.equal(configured, true);
  } finally {
    await cleanup();
  }
});

test('ramburs isConfigured returns false when ramburs_enabled is "false"', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    await upsertSetting(db, 'ramburs_enabled', 'false');
    const configured = await rambursProvider.isConfigured(db);
    assert.equal(configured, false);
  } finally {
    await cleanup();
  }
});

test('ramburs isConfigured returns true when ramburs_enabled is "true"', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await seedMinimal(db);
    await upsertSetting(db, 'ramburs_enabled', 'true');
    const configured = await rambursProvider.isConfigured(db);
    assert.equal(configured, true);
  } finally {
    await cleanup();
  }
});
