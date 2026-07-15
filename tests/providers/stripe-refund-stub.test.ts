import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ensureLoader } from '../stubs/register.mjs';

ensureLoader();

describe('Stripe refund stub', () => {
  it('returns not-implemented error', async () => {
    const { default: provider } = await import('../../src/providers/payment/stripe.ts');

    const result = await provider.refund(
      null as any,
      { transaction_id: null } as any,
      5000,
      'test reason'
    );

    assert.strictEqual(result.success, false, 'refund must return success: false');
    assert.ok(
      result.error?.includes('not yet implemented') || result.error?.includes('Not implemented'),
      `refund must indicate Stripe refund is not implemented. Got: ${result.error}`
    );
  });
});
