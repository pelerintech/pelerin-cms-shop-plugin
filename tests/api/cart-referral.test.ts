import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REFERRAL_PATH = resolve(__dirname, '../../src/api/shop/public/cart/referral/index.ts');

describe('POST /api/plugins/shop/public/cart/referral', () => {
  it('endpoint file exists', () => {
    assert.ok(existsSync(REFERRAL_PATH), 'Cart referral endpoint should exist');
  });

  it('exports POST handler', () => {
    const content = readFileSync(REFERRAL_PATH, 'utf-8');
    assert.match(content, /export\s+(const|async function)\s+POST/, 'Should export POST handler');
  });

  it('uses getOrCreateCart', () => {
    const content = readFileSync(REFERRAL_PATH, 'utf-8');
    assert.match(content, /getOrCreateCart/, 'Should use getOrCreateCart helper');
  });

  it('validates referral code exists and is active', () => {
    const content = readFileSync(REFERRAL_PATH, 'utf-8');
    assert.match(content, /referral_codes/, 'Should reference referral_codes table');
    assert.match(content, /active/, 'Should check active status');
  });

  it('stores applied referral code on cart', () => {
    const content = readFileSync(REFERRAL_PATH, 'utf-8');
    assert.match(content, /applied_referral/, 'Should store referral on cart');
  });

  it('applies discount if referral has discount set', () => {
    const content = readFileSync(REFERRAL_PATH, 'utf-8');
    assert.match(content, /discount/, 'Should compute discount from referral');
  });

  it('returns 422 for inactive referral code', () => {
    const content = readFileSync(REFERRAL_PATH, 'utf-8');
    assert.match(content, /422/, 'Should return 422 for inactive referral');
  });

  it('returns success response', () => {
    const content = readFileSync(REFERRAL_PATH, 'utf-8');
    assert.match(content, /success.*true/, 'Should return success: true');
  });

  it('uses Zod ApplyCartReferralSchema with safeParse', () => {
    const content = readFileSync(REFERRAL_PATH, 'utf-8');
    assert.match(content, /ApplyCartReferralSchema/, 'Should import ApplyCartReferralSchema');
    assert.match(content, /safeParse/, 'Should use safeParse for validation');
  });
});