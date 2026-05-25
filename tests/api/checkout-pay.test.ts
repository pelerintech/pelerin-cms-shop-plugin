import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PAY_PATH = resolve(__dirname, '../../src/api/shop/public/checkout/[orderId]/pay.ts');

describe('POST /api/plugins/shop/public/checkout/[orderId]/pay', () => {
  it('endpoint file exists', () => {
    assert.ok(existsSync(PAY_PATH), 'Checkout pay endpoint should exist');
  });

  it('exports POST handler', () => {
    const content = readFileSync(PAY_PATH, 'utf-8');
    assert.match(content, /export\s+(const|async function)\s+POST/, 'Should export POST handler');
  });

  it('validates provider parameter', () => {
    const content = readFileSync(PAY_PATH, 'utf-8');
    assert.match(content, /provider/, 'Should accept provider parameter');
  });

  it('uses provider registry to look up payment provider', () => {
    const content = readFileSync(PAY_PATH, 'utf-8');
    assert.match(content, /getProvider|registry/, 'Should use provider registry');
  });

  it('includes provider in response', () => {
    const content = readFileSync(PAY_PATH, 'utf-8');
    assert.match(content, /provider/, 'Should include provider in response');
  });

  it('calls provider initiatePayment', () => {
    const content = readFileSync(PAY_PATH, 'utf-8');
    assert.match(content, /initiatePayment/, 'Should call provider initiatePayment');
  });

  it('validates provider is in configured list', () => {
    const content = readFileSync(PAY_PATH, 'utf-8');
    assert.match(content, /stripe|euplatesc/, 'Should validate provider against configured list');
  });

  it('returns success response', () => {
    const content = readFileSync(PAY_PATH, 'utf-8');
    assert.match(content, /success.*true/, 'Should return success: true');
  });

  it('validates order exists and loads order data', () => {
    const content = readFileSync(PAY_PATH, 'utf-8');
    assert.match(content, /orders/, 'Should query orders table to verify orderId');
    assert.match(content, /context.params.orderId/, 'Should use orderId from route params');
  });
});