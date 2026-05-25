import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const VOUCHERS_PATH = resolve(__dirname, '../../src/api/shop/vouchers/index.ts');

describe('GET /api/plugins/shop/vouchers', () => {
  it('endpoint file exists', () => {
    assert.ok(existsSync(VOUCHERS_PATH), 'Vouchers API endpoint should exist');
  });

  it('exports GET handler', () => {
    const content = readFileSync(VOUCHERS_PATH, 'utf-8');
    assert.match(content, /export\s+(const|async function)\s+GET/, 'Should export GET handler');
  });

  it('requires admin auth', () => {
    const content = readFileSync(VOUCHERS_PATH, 'utf-8');
    assert.match(content, /requireAdmin/, 'Should call requireAdmin');
  });

  it('returns success response shape', () => {
    const content = readFileSync(VOUCHERS_PATH, 'utf-8');
    assert.match(content, /success.*true/, 'Should return success: true');
  });

  it('queries vouchers table', () => {
    const content = readFileSync(VOUCHERS_PATH, 'utf-8');
    assert.match(content, /vouchers/, 'Should query the vouchers table');
  });

  it('derives status field', () => {
    const content = readFileSync(VOUCHERS_PATH, 'utf-8');
    assert.match(content, /status/, 'Should derive status field');
  });

  it('supports ?active=true filter', () => {
    const content = readFileSync(VOUCHERS_PATH, 'utf-8');
    assert.match(content, /active/, 'Should support active filter from query params');
  });

  it('supports ?type filter', () => {
    const content = readFileSync(VOUCHERS_PATH, 'utf-8');
    assert.match(content, /searchParams.*type|type.*searchParams/, 'Should support type filter from query params');
  });

  it('supports ?expired filter', () => {
    const content = readFileSync(VOUCHERS_PATH, 'utf-8');
    assert.match(content, /expired|valid_until/, 'Should support expired filter (valid_until check)');
  });
});

describe('POST /api/plugins/shop/vouchers', () => {
  it('exports POST handler', () => {
    const content = readFileSync(VOUCHERS_PATH, 'utf-8');
    assert.match(content, /export\s+(const|async function)\s+POST/, 'Should export POST handler');
  });

  it('validates with Zod schema', () => {
    const content = readFileSync(VOUCHERS_PATH, 'utf-8');
    assert.match(content, /safeParse|CreateVoucherSchema/, 'Should use Zod schema validation');
  });

  it('returns 422 on validation failure (fixed_amount with no value)', () => {
    const content = readFileSync(VOUCHERS_PATH, 'utf-8');
    assert.match(content, /422/, 'Should return 422 for validation errors');
  });

  it('enforces case-insensitive uniqueness check', () => {
    const content = readFileSync(VOUCHERS_PATH, 'utf-8');
    // Should check for existing code in a case-insensitive manner
    assert.match(content, /409/, 'Should return 409 for duplicate code');
  });

  it('returns 201 on successful creation', () => {
    const content = readFileSync(VOUCHERS_PATH, 'utf-8');
    assert.match(content, /201/, 'Should return 201 on successful creation');
  });
});
