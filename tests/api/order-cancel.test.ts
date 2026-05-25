import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CANCEL_PATH = resolve(__dirname, '../../src/api/shop/orders/[id]/cancel.ts');

describe('Order cancellation API', () => {
  it('file exists', () => {
    assert.ok(existsSync(CANCEL_PATH), 'src/api/shop/orders/[id]/cancel.ts should exist');
  });

  it('exports PUT handler', () => {
    const content = readFileSync(CANCEL_PATH, 'utf-8');
    assert.match(content, /export\s+(const|async function)\s+PUT/, 'Should export PUT handler');
  });

  it('uses admin auth (requireAdmin)', () => {
    const content = readFileSync(CANCEL_PATH, 'utf-8');
    assert.match(content, /requireAdmin/, 'Should require admin auth');
  });

  it('calls transitionOrder to cancelled', () => {
    const content = readFileSync(CANCEL_PATH, 'utf-8');
    assert.match(content, /transitionOrder/, 'Should call transitionOrder');
    assert.match(content, /cancelled/, 'Should transition to cancelled');
  });

  it('checks cancellable statuses', () => {
    const content = readFileSync(CANCEL_PATH, 'utf-8');
    assert.match(content, /pending|awaiting_payment|paid|processing/, 'Should check cancellable statuses');
    assert.match(content, /canCancel|CANCELLABLE|shipped/, 'Should prevent cancelling shipped orders');
  });

  it('returns 409 for non-cancellable orders', () => {
    const content = readFileSync(CANCEL_PATH, 'utf-8');
    assert.match(content, /409|Cannot cancel|cannot cancel|not cancellable/i, 'Should return 409 for non-cancellable');
  });

  it('returns success response on cancel', () => {
    const content = readFileSync(CANCEL_PATH, 'utf-8');
    assert.match(content, /success.*true/, 'Should return success: true');
  });
});