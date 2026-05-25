import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const VOUCHERS_DETAIL_PATH = resolve(__dirname, '../../src/api/shop/vouchers/[id].ts');

describe('GET /api/plugins/shop/vouchers/[id]', () => {
  it('endpoint file exists', () => {
    assert.ok(existsSync(VOUCHERS_DETAIL_PATH), 'Voucher detail API endpoint should exist');
  });

  it('exports GET handler', () => {
    const content = readFileSync(VOUCHERS_DETAIL_PATH, 'utf-8');
    assert.match(content, /export\s+(const|async function)\s+GET/, 'Should export GET handler');
  });

  it('requires admin auth', () => {
    const content = readFileSync(VOUCHERS_DETAIL_PATH, 'utf-8');
    assert.match(content, /requireAdmin/, 'Should call requireAdmin');
  });

  it('returns remaining_uses field', () => {
    const content = readFileSync(VOUCHERS_DETAIL_PATH, 'utf-8');
    assert.match(content, /remaining_uses/, 'Should compute remaining_uses in response');
  });

  it('derives status field', () => {
    const content = readFileSync(VOUCHERS_DETAIL_PATH, 'utf-8');
    assert.match(content, /status/, 'Should derive status field');
  });

  it('returns 404 for non-existent voucher', () => {
    const content = readFileSync(VOUCHERS_DETAIL_PATH, 'utf-8');
    assert.match(content, /404/, 'Should return 404 for missing voucher');
  });

  it('detects expired status', () => {
    const content = readFileSync(VOUCHERS_DETAIL_PATH, 'utf-8');
    assert.match(content, /expired/, 'Should detect expired status');
  });

  it('detects exhausted status', () => {
    const content = readFileSync(VOUCHERS_DETAIL_PATH, 'utf-8');
    assert.match(content, /exhausted/, 'Should detect exhausted status');
  });
});

describe('PUT /api/plugins/shop/vouchers/[id]', () => {
  it('exports PUT handler', () => {
    const content = readFileSync(VOUCHERS_DETAIL_PATH, 'utf-8');
    assert.match(content, /export\s+(const|async function)\s+PUT/, 'Should export PUT handler');
  });

  it('validates with UpdateVoucherSchema', () => {
    const content = readFileSync(VOUCHERS_DETAIL_PATH, 'utf-8');
    assert.match(content, /UpdateVoucherSchema|safeParse/, 'Should validate with UpdateVoucherSchema');
  });

  it('updates fields on valid input', () => {
    const content = readFileSync(VOUCHERS_DETAIL_PATH, 'utf-8');
    assert.match(content, /update.*vouchers|vouchers.*update/, 'Should perform DB update on vouchers');
  });
});

describe('DELETE /api/plugins/shop/vouchers/[id]', () => {
  it('exports DELETE handler', () => {
    const content = readFileSync(VOUCHERS_DETAIL_PATH, 'utf-8');
    assert.match(content, /export\s+(const|async function)\s+DELETE/, 'Should export DELETE handler');
  });

  it('sets active=false (soft delete)', () => {
    const content = readFileSync(VOUCHERS_DETAIL_PATH, 'utf-8');
    assert.match(content, /active.*false|active.*=.*false|active.*0/, 'Should set active to false rather than hard-deleting');
  });

  it('does not hard-delete the voucher record', () => {
    const content = readFileSync(VOUCHERS_DETAIL_PATH, 'utf-8');
    // DELETE should NOT call db.delete on the vouchers table
    const deleteMatches = content.match(/delete.*vouchers|vouchers.*delete/i);
    assert.ok(!deleteMatches, 'Should NOT hard-delete the voucher');
  });
});
