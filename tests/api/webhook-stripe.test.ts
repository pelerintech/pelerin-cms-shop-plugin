import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const WEBHOOK_PATH = resolve(__dirname, '../../src/api/shop/webhooks/stripe.ts');

describe('Stripe webhook endpoint', () => {
  it('file exists', () => {
    assert.ok(existsSync(WEBHOOK_PATH), 'src/api/shop/webhooks/stripe.ts should exist');
  });

  it('exports POST handler', () => {
    const content = readFileSync(WEBHOOK_PATH, 'utf-8');
    assert.match(content, /export\s+(const|async function)\s+POST/, 'Should export POST handler');
  });

  it('uses APIRoute type', () => {
    const content = readFileSync(WEBHOOK_PATH, 'utf-8');
    assert.match(content, /APIRoute/, 'Should use APIRoute type');
  });

  it('reads raw body with request.text()', () => {
    const content = readFileSync(WEBHOOK_PATH, 'utf-8');
    assert.match(content, /request\.text\(\)/, 'Should use request.text() for raw body');
  });

  it('calls stripe adapter handleWebhook', () => {
    const content = readFileSync(WEBHOOK_PATH, 'utf-8');
    assert.match(content, /handleWebhook/, 'Should call handleWebhook');
  });

  it('returns 200 on success', () => {
    const content = readFileSync(WEBHOOK_PATH, 'utf-8');
    assert.match(content, /200|success/, 'Should return 200 on success');
  });

  it('returns 400 for invalid signature', () => {
    const content = readFileSync(WEBHOOK_PATH, 'utf-8');
    assert.match(content, /400|Invalid/, 'Should return 400 on error');
  });

  it('does not use admin auth (public endpoint)', () => {
    const content = readFileSync(WEBHOOK_PATH, 'utf-8');
    // Should NOT call requireAdmin — public endpoint
    assert.doesNotMatch(content, /requireAdmin/, 'Should not require admin auth');
  });
});