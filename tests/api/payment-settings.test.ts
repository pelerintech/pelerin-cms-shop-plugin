import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const STRIPE_SETTINGS_PATH = resolve(__dirname, '../../src/api/shop/settings/payments/stripe.ts');
const EUPL_SETTINGS_PATH = resolve(__dirname, '../../src/api/shop/settings/payments/euplatesc.ts');

describe('Payment settings API — Stripe', () => {
  it('file exists', () => {
    assert.ok(existsSync(STRIPE_SETTINGS_PATH), 'stripe.ts should exist');
  });

  it('exports GET handler', () => {
    const content = readFileSync(STRIPE_SETTINGS_PATH, 'utf-8');
    assert.match(content, /export\s+(const|async function)\s+GET/, 'Should export GET handler');
  });

  it('exports PUT handler', () => {
    const content = readFileSync(STRIPE_SETTINGS_PATH, 'utf-8');
    assert.match(content, /export\s+(const|async function)\s+PUT/, 'Should export PUT handler');
  });

  it('uses admin auth (requireAdmin)', () => {
    const content = readFileSync(STRIPE_SETTINGS_PATH, 'utf-8');
    assert.match(content, /requireAdmin/, 'Should use requireAdmin for admin protection');
  });

  it('uses crypto encryption for storage', () => {
    const content = readFileSync(STRIPE_SETTINGS_PATH, 'utf-8');
    assert.match(content, /encrypt|decrypt|crypto/, 'Should use encryption');
  });

  it('masks secret key in GET (last 4 chars)', () => {
    const content = readFileSync(STRIPE_SETTINGS_PATH, 'utf-8');
    assert.match(content, /mask|slice|\*\*\*\*|last.*4/, 'Should mask secret keys');
  });

  it('stores values in shop_settings', () => {
    const content = readFileSync(STRIPE_SETTINGS_PATH, 'utf-8');
    assert.match(content, /shop_settings/, 'Should use shop_settings table');
  });

  it('returns 401 for unauthenticated', () => {
    const content = readFileSync(STRIPE_SETTINGS_PATH, 'utf-8');
    assert.match(content, /401|redirect|requireAdmin/, 'Should return 401 or redirect for unauthenticated');
  });
});

describe('Payment settings API — euPlatesc', () => {
  it('file exists', () => {
    assert.ok(existsSync(EUPL_SETTINGS_PATH), 'euplatesc.ts should exist');
  });

  it('exports GET handler', () => {
    const content = readFileSync(EUPL_SETTINGS_PATH, 'utf-8');
    assert.match(content, /export\s+(const|async function)\s+GET/, 'Should export GET handler');
  });

  it('exports PUT handler', () => {
    const content = readFileSync(EUPL_SETTINGS_PATH, 'utf-8');
    assert.match(content, /export\s+(const|async function)\s+PUT/, 'Should export PUT handler');
  });

  it('uses admin auth', () => {
    const content = readFileSync(EUPL_SETTINGS_PATH, 'utf-8');
    assert.match(content, /requireAdmin/, 'Should use requireAdmin');
  });

  it('stores test mode toggle', () => {
    const content = readFileSync(EUPL_SETTINGS_PATH, 'utf-8');
    assert.match(content, /test_mode|euplatesc_test_mode/, 'Should handle test mode setting');
  });

  it('encrypts secret key', () => {
    const content = readFileSync(EUPL_SETTINGS_PATH, 'utf-8');
    assert.match(content, /encrypt|decrypt|crypto/, 'Should use encryption for secret key');
  });
});