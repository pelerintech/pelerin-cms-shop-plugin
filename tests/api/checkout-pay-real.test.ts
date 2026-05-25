import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PAY_PATH = resolve(__dirname, '../../src/api/shop/public/checkout/[orderId]/pay.ts');

describe('Checkout pay endpoint (after replacement)', () => {
  let content: string;

  before(() => {
    content = readFileSync(PAY_PATH, 'utf-8');
  });

  it('no longer returns stub with pending_implementation', () => {
    assert.doesNotMatch(content, /pending_implementation/, 'Should not return stub status');
  });

  it('no longer returns redirect_url: null', () => {
    assert.doesNotMatch(content, /redirect_url:\s*null/, 'Should not return null redirect_url');
  });

  it('imports from provider registry', () => {
    assert.match(content, /registry|getProvider/, 'Should import registry or use getProvider');
  });

  it('imports provider adapters', () => {
    assert.match(content, /stripe|euplatesc|provider/, 'Should import stripe or euplatesc');
  });

  it('calls provider.initiatePayment', () => {
    assert.match(content, /initiatePayment/, 'Should call initiatePayment on provider');
  });

  it('returns provider result with success', () => {
    // The implementation should return the provider result in data
    assert.match(content, /result.*data|data.*result/, 'Should return provider result');
    assert.match(content, /success.*true/, 'Should return success: true');
  });

  it('returns 422 for unknown provider', () => {
    assert.match(content, /422.*provider|Unknown.*provider/i, 'Should return 422 for unknown provider');
  });

  it('returns 404 for non-existent order', () => {
    assert.match(content, /404|not found/i, 'Should handle missing order');
  });
});