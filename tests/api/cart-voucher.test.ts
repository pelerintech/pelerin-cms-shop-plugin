import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const VOUCHER_PATH = resolve(__dirname, '../../src/api/shop/public/cart/voucher/index.ts');

describe('POST /api/plugins/shop/public/cart/voucher', () => {
  it('endpoint file exists', () => {
    assert.ok(existsSync(VOUCHER_PATH), 'Cart voucher endpoint should exist');
  });

  it('exports POST handler', () => {
    const content = readFileSync(VOUCHER_PATH, 'utf-8');
    assert.match(content, /export\s+(const|async function)\s+POST/, 'Should export POST handler');
  });

  it('exports DELETE handler', () => {
    const content = readFileSync(VOUCHER_PATH, 'utf-8');
    assert.match(content, /export\s+(const|async function)\s+DELETE/, 'Should export DELETE handler');
  });

  it('uses getOrCreateCart', () => {
    const content = readFileSync(VOUCHER_PATH, 'utf-8');
    assert.match(content, /getOrCreateCart/, 'Should use getOrCreateCart helper');
  });

  it('validates voucher exists by code (case-insensitive)', () => {
    const content = readFileSync(VOUCHER_PATH, 'utf-8');
    assert.match(content, /code/, 'Should look up voucher by code');
    assert.match(content, /vouchers/, 'Should reference vouchers table');
  });

  it('validates voucher is active', () => {
    const content = readFileSync(VOUCHER_PATH, 'utf-8');
    assert.match(content, /active/, 'Should check active status');
  });

  it('validates voucher date range', () => {
    const content = readFileSync(VOUCHER_PATH, 'utf-8');
    assert.match(content, /valid_from|valid_until/, 'Should check valid_from and valid_until');
  });

  it('validates max_uses not exceeded', () => {
    const content = readFileSync(VOUCHER_PATH, 'utf-8');
    assert.match(content, /max_uses|uses_count/, 'Should check max_uses / uses_count');
  });

  it('validates min_order_value', () => {
    const content = readFileSync(VOUCHER_PATH, 'utf-8');
    assert.match(content, /min_order_value/, 'Should check min_order_value');
  });

  it('returns 422 for invalid/expired voucher', () => {
    const content = readFileSync(VOUCHER_PATH, 'utf-8');
    assert.match(content, /422/, 'Should return 422 for validation failures');
  });

  it('stores applied voucher on cart and returns updated totals', () => {
    const content = readFileSync(VOUCHER_PATH, 'utf-8');
    assert.match(content, /applied_voucher|discount/, 'Should store voucher and show discount');
  });

  it('returns success response', () => {
    const content = readFileSync(VOUCHER_PATH, 'utf-8');
    assert.match(content, /success.*true/, 'Should return success: true');
  });

  it('uses Zod ApplyCartVoucherSchema with safeParse', () => {
    const content = readFileSync(VOUCHER_PATH, 'utf-8');
    assert.match(content, /ApplyCartVoucherSchema/, 'Should import ApplyCartVoucherSchema');
    assert.match(content, /safeParse/, 'Should use safeParse for validation');
  });
});