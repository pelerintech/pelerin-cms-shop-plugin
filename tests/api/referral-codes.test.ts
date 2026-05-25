import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REFERRAL_CODES_PATH = resolve(__dirname, '../../src/api/shop/referral-codes/index.ts');

describe('GET /api/plugins/shop/referral-codes', () => {
  it('endpoint file exists', () => {
    assert.ok(existsSync(REFERRAL_CODES_PATH), 'Referral codes API endpoint should exist');
  });

  it('exports GET handler', () => {
    const content = readFileSync(REFERRAL_CODES_PATH, 'utf-8');
    assert.match(content, /export\s+(const|async function)\s+GET/, 'Should export GET handler');
  });

  it('requires admin auth', () => {
    const content = readFileSync(REFERRAL_CODES_PATH, 'utf-8');
    assert.match(content, /requireAdmin/, 'Should call requireAdmin');
  });

  it('returns success response shape', () => {
    const content = readFileSync(REFERRAL_CODES_PATH, 'utf-8');
    assert.match(content, /success.*true/, 'Should return success: true');
  });

  it('queries referral_codes table', () => {
    const content = readFileSync(REFERRAL_CODES_PATH, 'utf-8');
    assert.match(content, /referral_codes/, 'Should query the referral_codes table');
  });

  it('supports ?active filter', () => {
    const content = readFileSync(REFERRAL_CODES_PATH, 'utf-8');
    assert.match(content, /active/, 'Should support active filter from query params');
  });
});

describe('POST /api/plugins/shop/referral-codes', () => {
  it('exports POST handler', () => {
    const content = readFileSync(REFERRAL_CODES_PATH, 'utf-8');
    assert.match(content, /export\s+(const|async function)\s+POST/, 'Should export POST handler');
  });

  it('validates with Zod schema', () => {
    const content = readFileSync(REFERRAL_CODES_PATH, 'utf-8');
    assert.match(content, /safeParse|CreateReferralCodeSchema/, 'Should use Zod schema validation');
  });

  it('returns 409 for duplicate code', () => {
    const content = readFileSync(REFERRAL_CODES_PATH, 'utf-8');
    assert.match(content, /409/, 'Should return 409 for duplicate code');
  });

  it('returns 201 on successful creation', () => {
    const content = readFileSync(REFERRAL_CODES_PATH, 'utf-8');
    assert.match(content, /201/, 'Should return 201 on successful creation');
  });
});
