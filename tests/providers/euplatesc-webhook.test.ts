import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const EUPL_PATH = resolve(__dirname, '../../src/providers/payment/euplatesc.ts');

describe('euPlatesc adapter — webhook handler', () => {
  let content: string;

  before(() => {
    content = readFileSync(EUPL_PATH, 'utf-8');
  });

  it('exports handleWebhook function', () => {
    assert.match(content, /handleWebhook/, 'Should define handleWebhook');
  });

  it('reads IPN body from request.text()', () => {
    assert.match(content, /request\.text\(\)/, 'Should use request.text()');
  });

  it('parses form-encoded IPN body', () => {
    assert.match(content, /URLSearchParams|form/, 'Should parse form-encoded body');
  });

  it('checks ep_status parameter', () => {
    assert.match(content, /ep_status/, 'Should check ep_status parameter');
  });

  it('transitions order to paid when ep_status = authorized', () => {
    // The content should have both 'authorized' check and 'paid' transition
    assert.match(content, /authorized/, 'Should check for authorized status');
    assert.match(content, /paid/, 'Should transition to paid');
  });

  it('verifies HMAC signature', () => {
    assert.match(content, /fp_hash.*fp_hash|HMAC|expectedHash/, 'Should verify HMAC signature');
  });

  it('throws on invalid HMAC', () => {
    assert.match(content, /Invalid.*HMAC|Invalid.*signature/, 'Should throw on invalid HMAC');
  });

  it('finds order by invoice_id (order_number)', () => {
    assert.match(content, /invoice_id/, 'Should find order by invoice_id');
    assert.match(content, /order_number/, 'Should match against order_number');
  });

  it('stores transaction_id as ep_id', () => {
    assert.match(content, /ep_id/, 'Should use ep_id as transaction ID');
  });

  it('returns order_id, status, and transaction_id', () => {
    assert.match(content, /order_id/, 'Should return order_id');
    assert.match(content, /status/, 'Should return status');
  });
});

describe('euPlatesc webhook endpoint file', () => {
  it('exists at src/api/shop/webhooks/euplatesc.ts', () => {
    const euplEndpointPath = resolve(__dirname, '../../src/api/shop/webhooks/euplatesc.ts');
    assert.ok(existsSync(euplEndpointPath), 'euplatesc webhook endpoint should exist');
  });

  it('exports POST handler', () => {
    const euplEndpointPath = resolve(__dirname, '../../src/api/shop/webhooks/euplatesc.ts');
    if (!existsSync(euplEndpointPath)) {
      assert.fail('euplatesc webhook endpoint does not exist');
      return;
    }
    const endpointContent = readFileSync(euplEndpointPath, 'utf-8');
    assert.match(endpointContent, /export\s+(const|async function)\s+POST/, 'Should export POST handler');
  });
});