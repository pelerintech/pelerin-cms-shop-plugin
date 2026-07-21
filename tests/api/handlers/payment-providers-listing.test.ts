/**
 * Tests for the DB-driven GET /api/plugins/shop/payment-providers endpoint.
 *
 * The endpoint reads the enabled set from shop_settings via
 * listEnabledPaymentProviders(db), NOT from the in-memory provider registry.
 * This ensures bank_transfer/ramburs (and any future provider) are never
 * silently skipped because a module import was missed.
 *
 * Source-coupling guard: the handler must not import individual provider
 * modules or call listProviders() for enumeration.
 */
import { test, describe, before, beforeEach } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureLoader } from '../../stubs/register.mjs';
import { createTestDb, resetDb, shop_settings } from '../../db/harness.ts';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';

ensureLoader();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const HANDLER_PATH = resolve(__dirname, '../../../src/api/shop/payment-providers/index.ts');

describe('GET /api/plugins/shop/payment-providers — DB-driven listing', () => {
  let db: LibSQLDatabase;
  let runGet: (opts: any) => Promise<Response>;

  before(async () => {
    const harness = await createTestDb();
    db = harness.db;
    await resetDb(db);
    const mod = await import('../../../src/api/shop/payment-providers/index.ts');
    runGet = mod.runGet;
  });

  beforeEach(async () => {
    await resetDb(db);
  });

  test('empty settings → only ramburs (default-on)', async () => {
    const res = await runGet({
      db,
      sdk: { auth: {} },
      ctx: { params: {}, request: new Request('http://example.com') },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.success);
    assert.deepStrictEqual(body.data.providers, [{ name: 'ramburs', label: 'Ramburs' }]);
  });

  test('stripe + euplatesc + bank_transfer configured → all four (ramburs default)', async () => {
    await db.insert(shop_settings).values([
      { id: 's1', key: 'stripe_secret_key', value: 'sk_test_x' },
      { id: 's2', key: 'euplatesc_merchant_id', value: '44841007584' },
      { id: 's3', key: 'euplatesc_secret_key', value: 'AA...EE' },
      { id: 's4', key: 'bank_transfer_beneficiary', value: 'Pelerin SRL' },
      { id: 's5', key: 'bank_transfer_iban', value: 'RO49AAAA...' },
    ]);

    const res = await runGet({
      db,
      sdk: { auth: {} },
      ctx: { params: {}, request: new Request('http://example.com') },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    const names = body.data.providers.map((p: any) => p.name).sort();
    assert.deepStrictEqual(names, ['bank_transfer', 'euplatesc', 'ramburs', 'stripe']);
  });

  test('ramburs disabled + bank_transfer creds → only bank_transfer', async () => {
    await db.insert(shop_settings).values([
      { id: 's1', key: 'ramburs_enabled', value: 'false' },
      { id: 's2', key: 'bank_transfer_beneficiary', value: 'Pelerin SRL' },
      { id: 's3', key: 'bank_transfer_iban', value: 'RO49...' },
    ]);

    const res = await runGet({
      db,
      sdk: { auth: {} },
      ctx: { params: {}, request: new Request('http://example.com') },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    const names = body.data.providers.map((p: any) => p.name);
    assert.deepStrictEqual(names, ['bank_transfer']);
  });

  test('bank_transfer beneficiary only (no iban) → bank_transfer excluded', async () => {
    await db
      .insert(shop_settings)
      .values([{ id: 's1', key: 'bank_transfer_beneficiary', value: 'Pelerin SRL' }]);

    const res = await runGet({
      db,
      sdk: { auth: {} },
      ctx: { params: {}, request: new Request('http://example.com') },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    const names = body.data.providers.map((p: any) => p.name);
    assert.ok(!names.includes('bank_transfer'));
  });

  test('no auth required — public endpoint returns 200', async () => {
    const res = await runGet({
      db,
      sdk: { auth: {} },
      ctx: { params: {}, request: new Request('http://example.com') },
    });
    assert.equal(res.status, 200);
  });
});

describe('Source-coupling guard', () => {
  test('handler does NOT import individual provider modules or call listProviders for enumeration', () => {
    const src = readFileSync(HANDLER_PATH, 'utf-8');
    // Must not import stripe, euplatesc, bank_transfer, or ramburs modules directly
    assert.doesNotMatch(src, /providers\/payment\/(stripe|euplatesc|bank_transfer|ramburs)/);
    // Must not call listProviders() (the enabled set comes from listEnabledPaymentProviders)
    assert.doesNotMatch(src, /listProviders\s*\(/);
  });
});
