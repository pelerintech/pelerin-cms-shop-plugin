import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PaymentOptions } from '../../src/providers/payment/interface.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const interfacePath = resolve(__dirname, '../../src/providers/payment/interface.ts');

describe('PaymentOptions interface', () => {
  it('includes webhook_url field', () => {
    // Compile-time check: if webhook_url is not part of the interface,
    // TypeScript would error. At runtime, we verify by assigning the field.
    const options: PaymentOptions = {
      success_url: 'https://example.com/success',
      cancel_url: 'https://example.com/cancel',
      currency: 'RON',
      webhook_url: 'https://example.com/api/plugins/shop/webhooks/euplatesc',
    };

    assert.strictEqual(
      options.webhook_url,
      'https://example.com/api/plugins/shop/webhooks/euplatesc',
      'PaymentOptions must have webhook_url field'
    );
  });

  it('webhook_url is required (not optional)', () => {
    const content = readFileSync(interfacePath, 'utf-8');

    // Check that webhook_url is defined in PaymentOptions without ? (required)
    assert.match(
      content,
      /webhook_url\s*:\s*string[^?]/,
      'PaymentOptions must have webhook_url as a required string field'
    );
  });
});
