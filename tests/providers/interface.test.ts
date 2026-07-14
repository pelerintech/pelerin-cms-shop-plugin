import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PaymentProvider, RefundResult } from '../../src/providers/payment/interface.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const interfacePath = resolve(__dirname, '../../src/providers/payment/interface.ts');

describe('PaymentProvider interface extension', () => {
  it('PaymentProvider has isConfigured method', () => {
    const content = readFileSync(interfacePath, 'utf-8');
    assert.match(content, /isConfigured\s*\(\s*db/,
      'PaymentProvider must have isConfigured(db) method');
  });

  it('PaymentProvider has refund method', () => {
    const content = readFileSync(interfacePath, 'utf-8');
    assert.match(content, /refund\s*\(\s*db.*order.*amount.*reason/,
      'PaymentProvider must have refund(db, order, amount, reason) method');
  });

  it('RefundResult type has success, error?, provider_refund_id?', () => {
    const content = readFileSync(interfacePath, 'utf-8');
    assert.match(content, /RefundResult/, 'RefundResult type must be defined');
    assert.match(content, /success\s*:\s*boolean/, 'RefundResult must have success: boolean');
    assert.match(content, /error\s*\?\s*:\s*string/, 'RefundResult must have error?: string');
    assert.match(content, /provider_refund_id\s*\?\s*:\s*string/, 'RefundResult must have provider_refund_id?: string');
  });

  it('isConfigured returns Promise<boolean>', () => {
    const content = readFileSync(interfacePath, 'utf-8');
    assert.match(content, /isConfigured.*Promise<boolean>/,
      'isConfigured must return Promise<boolean>');
  });

  it('refund returns Promise<RefundResult>', () => {
    const content = readFileSync(interfacePath, 'utf-8');
    assert.match(content, /refund.*Promise<RefundResult>/,
      'refund must return Promise<RefundResult>');
  });
});
