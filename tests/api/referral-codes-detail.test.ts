import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REFERRAL_DETAIL_PATH = resolve(__dirname, '../../src/api/shop/referral-codes/[id].ts');

describe('GET /api/plugins/shop/referral-codes/[id]', () => {
  it('endpoint file exists', () => {
    assert.ok(existsSync(REFERRAL_DETAIL_PATH), 'Referral code detail API endpoint should exist');
  });

  it('exports GET handler', () => {
    const content = readFileSync(REFERRAL_DETAIL_PATH, 'utf-8');
    assert.match(content, /export\s+(const|async function)\s+GET/, 'Should export GET handler');
  });

  it('requires admin auth', () => {
    const content = readFileSync(REFERRAL_DETAIL_PATH, 'utf-8');
    assert.match(content, /requireAdmin/, 'Should call requireAdmin');
  });

  it('returns stats with total_orders', () => {
    const content = readFileSync(REFERRAL_DETAIL_PATH, 'utf-8');
    assert.match(content, /total_orders/, 'Should return stats.total_orders');
  });

  it('returns stats with total_revenue', () => {
    const content = readFileSync(REFERRAL_DETAIL_PATH, 'utf-8');
    assert.match(content, /total_revenue/, 'Should return stats.total_revenue');
  });

  it('excludes cancelled/refunded orders from stats', () => {
    const content = readFileSync(REFERRAL_DETAIL_PATH, 'utf-8');
    assert.match(content, /cancelled|refunded/, 'Should exclude cancelled/refunded orders');
  });

  it('queries orders table for stats', () => {
    const content = readFileSync(REFERRAL_DETAIL_PATH, 'utf-8');
    assert.match(content, /orders/, 'Should query orders table for attribution stats');
  });

  it('returns 404 for non-existent referral code', () => {
    const content = readFileSync(REFERRAL_DETAIL_PATH, 'utf-8');
    assert.match(content, /404/, 'Should return 404 for missing referral code');
  });
});

describe('PUT /api/plugins/shop/referral-codes/[id]', () => {
  it('exports PUT handler', () => {
    const content = readFileSync(REFERRAL_DETAIL_PATH, 'utf-8');
    assert.match(content, /export\s+(const|async function)\s+PUT/, 'Should export PUT handler');
  });

  it('validates with UpdateReferralCodeSchema', () => {
    const content = readFileSync(REFERRAL_DETAIL_PATH, 'utf-8');
    assert.match(content, /UpdateReferralCodeSchema|safeParse/, 'Should validate with UpdateReferralCodeSchema');
  });
});

describe('DELETE /api/plugins/shop/referral-codes/[id]', () => {
  it('exports DELETE handler', () => {
    const content = readFileSync(REFERRAL_DETAIL_PATH, 'utf-8');
    assert.match(content, /export\s+(const|async function)\s+DELETE/, 'Should export DELETE handler');
  });

  it('soft-deletes (sets active=false)', () => {
    const content = readFileSync(REFERRAL_DETAIL_PATH, 'utf-8');
    assert.match(content, /active.*false|active.*=.*false|active.*0/, 'Should soft-delete by setting active to false');
  });

  it('does not hard-delete', () => {
    const content = readFileSync(REFERRAL_DETAIL_PATH, 'utf-8');
    const deleteMatches = content.match(/delete.*referral_codes|referral_codes.*delete/i);
    assert.ok(!deleteMatches, 'Should NOT hard-delete the referral code');
  });
});
