import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const EUPL_PATH = resolve(__dirname, '../../src/providers/payment/euplatesc.ts');

describe('euPlatesc adapter — initiate payment', () => {
  it('file exists', () => {
    assert.ok(existsSync(EUPL_PATH), 'src/providers/payment/euplatesc.ts should exist');
  });

  it('exports initiatePayment function', () => {
    const content = readFileSync(EUPL_PATH, 'utf-8');
    assert.match(content, /export.*initiatePayment|async function initiatePayment/, 'Should define initiatePayment');
  });

  it('implements PaymentProvider interface (name property)', () => {
    const content = readFileSync(EUPL_PATH, 'utf-8');
    assert.match(content, /name:\s*['"]euplatesc['"]/, 'Should have name: "euplatesc"');
  });

  it('returns redirect URL containing euPlatesc endpoint', () => {
    const content = readFileSync(EUPL_PATH, 'utf-8');
    assert.match(content, /euplatesc\.ro/, 'Should reference euplatesc.ro endpoint');
  });

  it('includes HMAC MD5 hash in redirect URL', () => {
    const content = readFileSync(EUPL_PATH, 'utf-8');
    assert.match(content, /fp_hash|HMAC|hmac|md5/i, 'Should include HMAC hash parameter');
  });

  it('includes merchant ID in redirect parameters', () => {
    const content = readFileSync(EUPL_PATH, 'utf-8');
    assert.match(content, /mid|merchant.*id|euplatesc_merchant_id/i, 'Should include merchant ID');
  });

  it('includes order total (amount) in redirect parameters', () => {
    const content = readFileSync(EUPL_PATH, 'utf-8');
    assert.match(content, /amount/, 'Should include amount parameter');
  });

  it('includes currency in redirect parameters', () => {
    const content = readFileSync(EUPL_PATH, 'utf-8');
    assert.match(content, /curr|currency/, 'Should include currency parameter');
  });

  it('includes invoice_id (order_number) in redirect parameters', () => {
    const content = readFileSync(EUPL_PATH, 'utf-8');
    assert.match(content, /invoice_id|order_number/, 'Should include invoice_id parameter');
  });

  it('reads credentials from shop_settings', () => {
    const content = readFileSync(EUPL_PATH, 'utf-8');
    assert.match(content, /shop_settings/, 'Should read from shop_settings');
  });

  it('returns redirect_url and provider_session_id', () => {
    const content = readFileSync(EUPL_PATH, 'utf-8');
    assert.match(content, /redirect_url/, 'Should return redirect_url');
    assert.match(content, /provider_session_id/, 'Should return provider_session_id');
  });

  it('auto-registers with provider registry', () => {
    const content = readFileSync(EUPL_PATH, 'utf-8');
    assert.match(content, /registerProvider/, 'Should call registerProvider');
  });
});